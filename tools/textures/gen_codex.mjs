#!/usr/bin/env node
/* Generate one source texture per catalogue entry with Codex image generation.

     node tools/textures/gen_codex.mjs [--jobs 3] [--force] [id ...]

   For every id (default: all of MATERIALS) without tools/textures/src/<id>.png
   this runs `codex exec --enable image_generation --json "<prompt>"`, reads the
   thread id from the JSON event stream, and copies the image Codex wrote to
   $CODEX_HOME/generated_images/<thread>/ into tools/textures/src/. Resumable:
   rerun it and only missing ids are generated. Results (ok / error, seconds,
   thread) are appended to tools/textures/gen_log.json.

   CODEX_BIN overrides the executable; otherwise PATH and the Codex desktop
   install under %LOCALAPPDATA%\OpenAI\Codex\bin\* are searched. */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { MATERIALS, materialById, codexPrompt } from "../../js/material_library.js";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "src");
const LOG = join(here, "gen_log.json");
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex");
const TIMEOUT_MS = 6 * 60 * 1000;

function findCodex() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const base = join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "bin");
  if (existsSync(base)) {
    const hits = readdirSync(base)
      .map((d) => join(base, d, process.platform === "win32" ? "codex.exe" : "codex"))
      .filter(existsSync)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (hits.length) return hits[0];
  }
  return "codex";
}

function parseArgs(argv) {
  const out = { jobs: 3, force: false, ids: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--jobs") out.jobs = Math.max(1, Number(argv[++i]) || 1);
    else if (argv[i] === "--force") out.force = true;
    else out.ids.push(argv[i]);
  }
  return out;
}

function newestImage(thread) {
  const dir = join(CODEX_HOME, "generated_images", thread);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] || null;
}

function runOne(codex, m) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const args = ["exec", "--skip-git-repo-check", "-s", "read-only", "--enable", "image_generation", "--json", codexPrompt(m)];
    const child = spawn(codex, args, { cwd: tmpdir(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let thread = null, buf = "", err = "";
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try {
          const ev = JSON.parse(line);
          if (ev.type === "thread.started" && ev.thread_id) thread = ev.thread_id;
        } catch { /* non-JSON progress line */ }
      }
    });
    child.stderr.on("data", (chunk) => { err = (err + chunk).slice(-2000); });
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const seconds = Math.round((Date.now() - t0) / 1000);
      const img = thread && newestImage(thread);
      if (img) {
        copyFileSync(img, join(SRC, m.id + ".png"));
        resolve({ id: m.id, ok: true, seconds, thread });
      } else {
        resolve({ id: m.id, ok: false, seconds, thread, code, error: err.trim().split("\n").slice(-3).join(" | ") });
      }
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(SRC, { recursive: true });
  const list = (opts.ids.length ? opts.ids.map((id) => materialById(id) || id) : MATERIALS);
  const unknown = list.filter((m) => typeof m === "string");
  if (unknown.length) throw new Error("unknown material ids: " + unknown.join(", "));
  const todo = list.filter((m) => opts.force || !existsSync(join(SRC, m.id + ".png")));
  const codex = findCodex();
  console.log(`codex: ${codex}\n${todo.length} to generate (${list.length - todo.length} already present), ${opts.jobs} at a time`);
  const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
  let next = 0, done = 0, failed = 0;
  async function worker() {
    while (next < todo.length) {
      const m = todo[next++];
      const r = await runOne(codex, m);
      done++;
      if (!r.ok) failed++;
      log.push({ ...r, at: new Date().toISOString() });
      writeFileSync(LOG, JSON.stringify(log, null, 1));
      console.log(`[${done}/${todo.length}] ${r.ok ? "ok  " : "FAIL"} ${m.id} (${r.seconds}s)${r.ok ? "" : " " + (r.error || "no image")}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.jobs, todo.length) }, worker));
  console.log(`done: ${done - failed} ok, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(2); });

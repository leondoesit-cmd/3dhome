#!/usr/bin/env node
/* Planner performance probes (docs/perf_plan.md, package A) — MEASUREMENT ONLY.
 *
 *   node tools/perf_planner.mjs                       # all scenarios -> perf-planner.json, perf-baseline.md
 *   node tools/perf_planner.mjs --only=sprites_cold,sprites_warm,mep_2d_idle
 *   node tools/perf_planner.mjs --label=after-C       # names the run in the report
 *   node tools/perf_planner.mjs --forceWebGL          # three's WebGL2 fallback
 *
 * Drives a REAL windowed Chrome on this machine's GPU (as tools/gpu_bench.mjs
 * does: occlusion/backgrounding off, a window pops up) against its own
 * server/relay.mjs on a free port. Counters are injected as the browser
 * fetches the modules (CDP Fetch, tools/perf_planner/wraps.mjs): no source
 * file is edited. One fresh browser profile per run; sprites_warm reloads the
 * page in that same profile, so its pictures come from IndexedDB.
 *
 * Scenes: the large generated apartment (seed 3) with auto-generated
 * infrastructure, and the same apartment tiled --copies times (default 3,
 * ~150 items) for the item-count scenarios. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { findChrome } from "./browser_harness.mjs";
import { WRAPS, patchSource } from "./perf_planner/wraps.mjs";
import * as SC from "./perf_planner/scenarios.mjs";
import { writeReport } from "./perf_planner/report.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const flag = (name) => argv.includes("--" + name);
const ALL = ["first_open", "sprites_cold", "sprites_warm", "sprites_warm_now", "sprites_zoom", "pres_paint", "mep_2d_idle", "mep_2d_drag", "mep_route", "mep_3d", "planner_rebuild"];
const ONLY = new Set(arg("only", ALL.join(",")).split(","));
const COPIES = Math.max(1, parseInt(arg("copies", "3"), 10) || 3);
const WAIT_TECH = parseInt(arg("wait-tech", "3000"), 10);
const LABEL = arg("label", "baseline");
const OUT = arg("out", join(ROOT, "perf-planner.json"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* --head serves the committed (git HEAD) version of every changed js/ file
   and no counters: the "before" half of a picture A/B (--capture). */
const HEAD = flag("head");
const CAPTURE = arg("capture", "");
const COMPARE = arg("compare", "");
// --no-thumbs: the library tiles' background warm-up never starts (an A/B
// of plan pictures, without its timing on the shared renderer)
const NO_THUMBS = flag("no-thumbs");
// --salt: cold shader compiles (see SC.saltPrelude); --eval=f.js: after boot,
// evaluate the file's expression in the page and print its JSON (ad-hoc probes)
const SALT = flag("salt");
const EVAL = arg("eval", "");
const FIRST_WAIT = parseInt(arg("first-open-wait", "1000"), 10);
// --cpu-throttle=N: CDP CPU throttling (N x slower) once booted;
// --mep-copies=N: the MEP scenarios run on the apartment tiled N times with
// its own auto-generated infrastructure (docs/perf_review_fixes.md 5.2)
const CPU_THROTTLE = parseFloat(arg("cpu-throttle", "1")) || 1;
const MEP_COPIES = Math.max(1, parseInt(arg("mep-copies", "1"), 10) || 1);
const NO_MERGE = flag("no-merge");
const EXTRA_FILES = [...(NO_THUMBS ? ["js/thumbs.js", "js/offscreen_gl.js"] : []), ...(NO_MERGE ? ["js/mep/merge3d.js", "js/view3d/item_merge.js"] : [])];
function extraPatch(path, body) {
  if (NO_THUMBS && path === "js/thumbs.js") return body.replace("const start = () => setTimeout(prewarmThumbs, 1200);", "const start = () => {};");
  // and nobody drops the shared small texture copies mid-bake (a dropped copy
  // is re-made with a different resampler: a picture that depends on timing)
  if (NO_THUMBS && path === "js/offscreen_gl.js") return body.replace("export function dropSmallTextures() {", "export function dropSmallTextures() { return;");
  // --no-merge: the 3D view without the MEP and furniture mesh merges (a pixel A/B of both merges on one backend)
  if (NO_MERGE && path === "js/mep/merge3d.js") return body.replace("export function mergeMEPMeshes(group, THREE) {", "export function mergeMEPMeshes(group, THREE) { return 0;");
  if (NO_MERGE && path === "js/view3d/item_merge.js") return body.replace("export function mergeItemMeshes(g, THREE) {", "export function mergeItemMeshes(g, THREE) { return 0;");
  return body;
}
function headSources() {
  const out = new Map();
  const names = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "js"], { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  for (const f of names) {
    try { out.set(f, execFileSync("git", ["show", "HEAD:" + f], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 })); } catch (e) { /* new file */ }
  }
  return out;
}

function freePort() {
  return new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}

async function startRelay() {
  const port = await freePort();
  const child = spawn(process.execPath, ["server/relay.mjs", String(port)], { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return { origin: `http://127.0.0.1:${port}`, close: () => child.kill() }; } catch (e) { /* not up */ }
    await sleep(100);
  }
  child.kill();
  throw new Error("relay did not start");
}

async function launchChrome() {
  const chrome = await findChrome();
  if (!chrome) throw new Error("Chrome not found");
  const profile = mkdtempSync(join(tmpdir(), "mf-perfplanner-"));
  const child = spawn(chrome, [
    "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check",
    "--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
    "--window-size=1500,1000", "--window-position=30,30", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    child.stderr.on("data", (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) res(m[0]); });
    setTimeout(() => rej(new Error("Chrome did not expose a devtools socket")), 20000);
  });
  child.stderr.resume();
  return { wsUrl, close: () => { try { child.kill(); } catch (e) { /* gone */ } setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ } }, 1500); } };
}

/* Minimal CDP page session with module patching through the Fetch domain. */
async function openPage(wsUrl) {
  let id = 0;
  const pending = new Map(), logs = [], handlers = [];
  const connect = (u) => new Promise((res) => {
    const ws = new WebSocket(u, { perMessageDeflate: false, maxPayload: 1 << 30 });
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === "Runtime.exceptionThrown") logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      handlers.forEach((h) => h(m));
    });
    ws.on("open", () => res(ws));
  });
  const send = (ws, method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
  const browser = await connect(wsUrl);
  const { result: { targetId } } = await send(browser, "Target.createTarget", { url: "about:blank" });
  const page = await connect(wsUrl.replace(/\/devtools\/browser\/.*$/, "/devtools/page/" + targetId));
  const cdp = (method, params) => send(page, method, params);
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(${SC.pagePrelude})();` });
  if (SALT) await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `(${SC.saltPrelude})();` });
  const head = HEAD ? headSources() : null;
  // --head-counters: the committed sources WITH the counters (a timing A/B)
  const HEAD_COUNTERS = head && flag("head-counters");
  const files = head ? [...new Set([...head.keys(), ...(HEAD_COUNTERS ? Object.keys(WRAPS) : [])])] : Object.keys(WRAPS);
  for (const f of EXTRA_FILES) if (!files.includes(f)) files.push(f);
  if (files.length) await cdp("Fetch.enable", { patterns: files.map((f) => ({ urlPattern: "*/" + f + "*", requestStage: "Request" })) });
  handlers.push((m) => {
    if (m.method !== "Fetch.requestPaused") return;
    const path = new URL(m.params.request.url).pathname.replace(/^\//, "");
    const listed = head ? head.has(path) || (HEAD_COUNTERS && !!WRAPS[path]) : !!WRAPS[path];
    if (!listed && !EXTRA_FILES.includes(path)) return void cdp("Fetch.continueRequest", { requestId: m.params.requestId });
    let body;
    if (!listed) body = readFileSync(join(ROOT, path), "utf8");
    else if (head) {
      body = head.has(path) ? head.get(path) : readFileSync(join(ROOT, path), "utf8");
      if (HEAD_COUNTERS) try { body = patchSource(path, body); } catch (e) { logs.push(String(e.message)); }
    }
    else try { body = patchSource(path, readFileSync(join(ROOT, path), "utf8")); } catch (e) { logs.push(String(e.message)); body = readFileSync(join(ROOT, path), "utf8"); }
    body = extraPatch(path, body);
    cdp("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/javascript; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }],
      body: Buffer.from(body, "utf8").toString("base64") });
  });
  const evaluate = async (expression, ms = 240000) => {
    const r = await Promise.race([
      cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
      sleep(ms).then(() => ({ result: { result: { value: { error: "timeout after " + ms + "ms" } } } })),
    ]);
    if (r.result?.exceptionDetails) return { error: (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text || "").slice(0, 600) };
    return r.result?.result?.value;
  };
  const call = (fn, opts, ms) => evaluate(`(${fn})(${JSON.stringify(opts || {})})`, ms);
  return { cdp, evaluate, call, logs, close: () => { page.close(); browser.close(); } };
}

async function boot(p, origin) {
  await p.cdp("Page.navigate", { url: origin + "/?lang=en" + (flag("forceWebGL") ? "&forceWebGL" : "") });
  for (let i = 0; i < 240; i++) {
    const ok = await p.evaluate(`!![...document.querySelectorAll("button")].find((b) => /Continue with/.test(b.textContent))`, 5000);
    if (ok === true) break;
    await sleep(250);
  }
  await p.evaluate(`[...document.querySelectorAll("button")].find((b) => /Continue with/.test(b.textContent))?.click()`);
  await sleep(500);
  const h = await p.call(SC.pageHelpers);
  if (h && h.error) throw new Error("helpers: " + h.error);
}

// V8 profile of the page while `run` executes: main-thread busy ms.
async function profiled(p, run) {
  await p.cdp("Profiler.enable");
  await p.cdp("Profiler.setSamplingInterval", { interval: 250 });
  await p.cdp("Profiler.start");
  const res = await run();
  const stop = await p.cdp("Profiler.stop");
  const prof = stop.result?.profile;
  if (prof && res && typeof res === "object") {
    const self = new Map();
    prof.samples.forEach((sid, i) => self.set(sid, (self.get(sid) || 0) + (prof.timeDeltas[i] || 0) / 1000));
    let busy = 0, idle = 0;
    const byFn = new Map();
    for (const n of prof.nodes) {
      const ms = self.get(n.id) || 0;
      if (!ms) continue;
      if (n.callFrame.functionName === "(idle)" || n.callFrame.functionName === "(program)") { idle += ms; continue; }
      busy += ms;
      const k = (n.callFrame.functionName || "(anon)") + " " + (n.callFrame.url || "").replace(/^[a-z]+:\/\/[^/]+\//, "") + ":" + (n.callFrame.lineNumber + 1);
      byFn.set(k, (byFn.get(k) || 0) + ms);
    }
    // the longest stretch of busy samples (gaps under 2 ms bridged): what a
    // long task is made of, by self time and by the app frame under it
    const byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const parentOf = new Map();
    prof.nodes.forEach((n) => (n.children || []).forEach((c) => parentOf.set(c, n.id)));
    const isIdle = (n) => n.callFrame.functionName === "(idle)" || n.callFrame.functionName === "(program)";
    let best = null, cur = null, gap = 0;
    prof.samples.forEach((sid, i) => {
      const dt = (prof.timeDeltas[i] || 0) / 1000, n = byId.get(sid);
      if (!isIdle(n)) { if (!cur) cur = { ms: 0, ids: [] }; cur.ms += dt + gap; gap = 0; cur.ids.push([sid, dt]); }
      else if (cur) { gap += dt; if (gap > 2) { if (!best || cur.ms > best.ms) best = cur; cur = null; gap = 0; } }
    });
    if (cur && (!best || cur.ms > best.ms)) best = cur;
    if (best) {
      const appFrame = (sid) => {
        for (let id = sid; id != null; id = parentOf.get(id)) {
          const f = byId.get(id).callFrame;
          if (/\/js\//.test(f.url)) return f.functionName + " " + f.url.replace(/^[a-z]+:\/\/[^/]+\//, "") + ":" + (f.lineNumber + 1);
        }
        return "(no app frame)";
      };
      const agg = new Map(), self = new Map();
      best.ids.forEach(([sid, dt]) => {
        const k = appFrame(sid); agg.set(k, (agg.get(k) || 0) + dt);
        const f = byId.get(sid).callFrame, sk = f.functionName + " " + (f.url || "").replace(/^[a-z]+:\/\/[^/]+\//, "") + ":" + (f.lineNumber + 1);
        self.set(sk, (self.get(sk) || 0) + dt);
      });
      // inclusive: every distinct frame on the sample's stack gets the sample
      const incl = new Map();
      best.ids.forEach(([sid, dt]) => {
        const seen = new Set();
        for (let id = sid; id != null; id = parentOf.get(id)) {
          const f = byId.get(id).callFrame, k = f.functionName + " " + (f.url || "").replace(/^[a-z]+:\/\/[^/]+\//, "") + ":" + (f.lineNumber + 1);
          if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); }
        }
      });
      const top = (m, n = 6) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]);
      res.longestStretch = { ms: +best.ms.toFixed(1), byAppFrame: top(agg), bySelf: top(self), inclusive: top(incl, 40) };
    }
    res.profile = { busyMs: +busy.toFixed(1), idleMs: +idle.toFixed(1),
      top: [...byFn].sort((a, b) => b[1] - a[1]).slice(0, flag("profile") ? 30 : 10).map(([k, v]) => [k, +v.toFixed(1)]) };
  }
  return res;
}

async function main() {
  const relay = await startRelay();
  const out = { label: LABEL, date: new Date().toISOString(), backend: flag("forceWebGL") ? "webgl2" : "webgpu", copies: COPIES, results: {}, errors: [] };
  let chrome = await launchChrome(), p = await openPage(chrome.wsUrl);
  const step = async (name, run) => {
    if (!ONLY.has(name)) return;
    process.stdout.write(`  ${name} ... `);
    try { out.results[name] = await run(); console.log(JSON.stringify(out.results[name]).slice(0, 300)); }
    catch (e) { out.errors.push(name + ": " + e.message); console.log("ERROR " + e.message); }
  };
  if (EVAL) {
    try {
      await boot(p, relay.origin);
      if (CPU_THROTTLE > 1) await p.cdp("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
      // --profile: the same, under the CPU profiler (self time by function)
      const src = readFileSync(EVAL, "utf8");
      const res = flag("profile") ? await profiled(p, async () => ({ value: await p.evaluate(src, 600000) })) : await p.evaluate(src, 600000);
      console.log(JSON.stringify(res, null, 1));
    } finally { p.close(); chrome.close(); relay.close(); }
    return;
  }
  if (CAPTURE || COMPARE) {
    try {
      await boot(p, relay.origin);
      if (COMPARE) {
        const [a, b] = COMPARE.split(",").map((f) => readFileSync(f, "utf8"));
        console.log(JSON.stringify(await p.call(SC.compareImages, { a, b })));
      } else {
        const style = arg("style", "presentation");
        const r = style === "3d"
          ? await p.call(SC.capture3D, { xray: arg("xray", null) == null ? null : arg("xray") === "1" }, 200000)
          : await p.call(SC.presCapture, { copies: COPIES === 3 ? 1 : COPIES, style }, 200000);
        if (r && r.url) { writeFileSync(CAPTURE, r.url); delete r.url; }
        console.log(JSON.stringify(r));
      }
    } finally { p.close(); chrome.close(); relay.close(); }
    return;
  }
  try {
    await boot(p, relay.origin);
    if (CPU_THROTTLE > 1) await p.cdp("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
    out.cpuThrottle = CPU_THROTTLE;
    out.mepCopies = MEP_COPIES;
    await step("first_open", () => profiled(p, () => p.call(SC.firstOpen, { waitMs: FIRST_WAIT }, 300000)));
    out.scene = await p.evaluate("window.__H.setupScene(1)");
    console.log("scene", JSON.stringify(out.scene));
    await step("sprites_cold", () => profiled(p, () => p.call(SC.spritesSwitch, { waitMs: WAIT_TECH, timeoutMs: 120000 }, 200000)));
    await step("sprites_zoom", () => profiled(p, () => p.call(SC.spritesZoom, { timeoutMs: 120000 }, 200000)));
    if (ONLY.has("sprites_warm")) {
      out.flush = await p.call(SC.spritesFlush, { timeoutMs: 90000 }, 120000);
      await boot(p, relay.origin);
      await p.evaluate("window.__H.setupScene(1)");
      await step("sprites_warm", () => p.call(SC.spritesSwitch, { waitMs: WAIT_TECH, timeoutMs: 120000 }, 200000));
    }
    if (ONLY.has("sprites_warm_now")) {
      // reload, then switch at once: the kept pictures' heights must be
      // known before three has loaded (review 4.2)
      if (!out.flush) out.flush = await p.call(SC.spritesFlush, { timeoutMs: 90000 }, 120000);
      await boot(p, relay.origin);
      if (CPU_THROTTLE > 1) await p.cdp("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });
      out.threeAtSwitch = await p.evaluate("(async () => (await import('/js/three_lazy.js')).threeLoaded())()");
      await p.evaluate("window.__H.setupScene(1)");
      await step("sprites_warm_now", () => p.call(SC.spritesSwitch, { waitMs: 0, timeoutMs: 120000 }, 200000));
    }
    if (MEP_COPIES > 1 && [...ONLY].some((k) => k.startsWith("mep_"))) {
      out.mepScene = await p.evaluate(`window.__H.setupScene(${MEP_COPIES}, { mep: true })`, 600000);
      console.log("mep scene", JSON.stringify(out.mepScene));
    }
    await step("mep_2d_idle", () => profiled(p, () => p.call(SC.mepIdle, { ms: 3000 })));
    await step("mep_2d_drag", () => profiled(p, () => p.call(SC.mepDrag, { moves: 30 })));
    await step("mep_route", () => profiled(p, () => p.call(SC.mepRoute, { moves: 30 })));
    await step("mep_3d", () => p.call(SC.mep3d, { settleMs: 3000 }, 300000));
    await step("planner_rebuild", () => p.call(SC.plannerRebuild, { settleMs: 3000, repeats: 3 }, 300000));
    if (ONLY.has("pres_paint") || ONLY.has("planner_rebuild")) {
      out.bigScene = await p.evaluate(`window.__H.setupScene(${COPIES})`);
      console.log("big scene", JSON.stringify(out.bigScene));
      await step("pres_paint", async () => {
        await p.call(SC.spritesSwitch, { waitMs: 500, timeoutMs: 120000 }, 200000);
        return p.call(SC.presPaint, { paints: 30, moves: 20 });
      });
      if (ONLY.has("planner_rebuild")) {
        const big = await p.call(SC.plannerRebuild, { settleMs: 3000, repeats: 3 }, 300000);
        if (out.results.planner_rebuild) out.results.planner_rebuild.big = big;
      }
    }
  } finally {
    out.pageErrors = p.logs.slice(0, 20);
    p.close(); chrome.close(); relay.close();
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  writeReport(out, join(ROOT, "perf-baseline.md"));
  console.log("wrote", OUT);
  if (out.errors.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });

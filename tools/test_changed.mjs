#!/usr/bin/env node
// Run only the test files related to the current change.
//
//   node tools/test_changed.mjs [--list] [--base <ref>] [-- <node args>]
//   node tools/test_changed.mjs <file.test.mjs>...   run exactly those files
//   node tools/test_changed.mjs --all                run every Node test file
//
// Positional files win over --all; both skip git selection. Otherwise changed
// files = git diff against HEAD (or --base <ref>) plus untracked files.
// Changed test files are selected directly; for each changed source file, any
// test whose text mentions its basename is selected. Edits to js/modeler.js or
// js/modeler/ also select tests using helpers/modeler_source. Output goes
// through tools/test_reporter_failures.mjs (failures + one summary line).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIRS = ["tests", "uikit/tests"];
const SOURCE_RE = /^(js|server|tools|css|uikit)\/|^index\.html$/;

const argv = process.argv.slice(2);
const dd = argv.indexOf("--");
const nodeArgs = dd >= 0 ? argv.slice(dd + 1) : [];
const own = dd >= 0 ? argv.slice(0, dd) : argv;
const listOnly = own.includes("--list");
const runAll = own.includes("--all");
const baseIdx = own.indexOf("--base");
const positional = own.filter((a, i) => a.endsWith(".mjs") && (baseIdx < 0 || i !== baseIdx + 1));
const base = baseIdx >= 0 ? own[baseIdx + 1] : "HEAD";
if (baseIdx >= 0 && !base) {
  console.error("--base needs a ref");
  process.exit(2);
}

function git(args) {
  const out = execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  return out.split(/\r?\n/).filter(Boolean);
}

const changed = positional.length || runAll ? [] : [...new Set([
  ...git(["diff", "--name-only", base]),
  ...git(["ls-files", "--others", "--exclude-standard"]),
])];

const allTests = [];
for (const dir of TEST_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (f.endsWith(".test.mjs")) allTests.push(`${dir}/${f}`);
  }
}

const textCache = new Map();
function textOf(file) {
  if (!textCache.has(file)) textCache.set(file, fs.readFileSync(path.join(ROOT, file), "utf8"));
  return textCache.get(file);
}

const selected = new Set();
const needles = [];
let touchesModeler = false;

for (const file of changed) {
  if (/(^|\/)tests\/[^/]+\.test\.mjs$/.test(file)) {
    if (allTests.includes(file)) selected.add(file);
    continue;
  }
  if (/\.browser\.mjs$/.test(file) || !SOURCE_RE.test(file)) continue;
  let needle = path.posix.basename(file);
  // "index.js" alone would match everything; keep the parent directory.
  if (/^index\./.test(needle)) needle = path.posix.join(path.posix.basename(path.posix.dirname(file)), needle);
  needles.push(needle);
  if (file === "js/modeler.js" || file.startsWith("js/modeler/")) touchesModeler = true;
}
if (touchesModeler) needles.push("helpers/modeler_source");

if (needles.length) {
  for (const test of allTests) {
    if (selected.has(test)) continue;
    const text = textOf(test);
    if (needles.some((n) => text.includes(n))) selected.add(test);
  }
}

const files = positional.length ? positional : runAll ? allTests : [...selected].sort();

if (listOnly) {
  for (const f of files) console.log(f);
  process.exit(0);
}
if (!files.length) {
  console.log("no related tests; run npm run check");
  process.exit(0);
}

console.log(`running ${files.length} test files`);
const res = spawnSync(process.execPath, [
  "--test", "--test-timeout=600000",
  "--test-reporter=./tools/test_reporter_failures.mjs",
  ...nodeArgs, ...files,
], { cwd: ROOT, stdio: "inherit" });
process.exit(res.status ?? 1);

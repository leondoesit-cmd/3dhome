// tools/split_module.mjs moves top-level functions between modules and writes
// the glue; these tests run it on a temp copy of tests/fixtures_split and check
// the resulting files by parsing them, not by matching source text.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { checkFiles } from "../tools/module_check.mjs";
import { splitModule, splitModuleText } from "../tools/split_module.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures_split");
const TOOL = path.join(HERE, "..", "tools", "split_module.mjs");

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "split-module-"));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const p = (rel) => path.join(dir, ...rel.split("/"));
  const read = (rel) => fs.readFileSync(p(rel), "utf8");
  return {
    dir, p, read,
    opts: (extra) => ({ from: p("js/modeler.js"), to: p("js/modeler/area.js"), repoRoot: dir, ...extra }),
    snapshot: () => Object.fromEntries(["js/modeler.js", "js/modeler/sibling.js", "js/modeler/sibling2.js"].map((f) => [f, read(f)])),
    done: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }),
  };
}

const parse = (src) => acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", onComment: [] });
const importsOf = (src) => {
  const out = {};
  for (const n of parse(src).body)
    if (n.type === "ImportDeclaration")
      out[n.source.value] = n.specifiers.map((s) => (s.type === "ImportNamespaceSpecifier" ? `* as ${s.local.name}` : s.type === "ImportDefaultSpecifier" ? `default ${s.local.name}` : s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`));
  return out;
};
const exportLists = (src) =>
  parse(src).body.filter((n) => n.type === "ExportNamedDeclaration" && !n.declaration && !n.source).map((n) => n.specifiers.map((s) => s.exported.name));
const declaredFunctions = (src) =>
  parse(src).body.flatMap((n) => {
    const d = n.type === "ExportNamedDeclaration" ? n.declaration : n;
    return d && d.type === "FunctionDeclaration" ? [{ name: d.id.name, exported: n.type === "ExportNamedDeclaration" }] : [];
  });

const NAMES = "scale,tint,helper,quiet";

test("moves functions verbatim with their leading comments and collapses the gap", () => {
  const ws = workspace();
  try {
    const before = ws.read("js/modeler.js");
    const scaleChunk = before.slice(before.indexOf("// Scales a value"), before.indexOf("/* Labels a scaled"));
    const tintChunk = before.slice(before.indexOf("/* Labels a scaled"), before.indexOf("const TABLE"));
    const r = splitModule(ws.opts({ names: NAMES }));
    assert.equal(r.ok, true, r.report);
    assert.equal(r.written, true);
    const moved = ws.read("js/modeler/area.js");
    assert.ok(moved.includes(scaleChunk.trimEnd()), "scale and its two comment lines are copied exactly");
    assert.ok(moved.includes(tintChunk.trimEnd()), "tint and its block comment are copied exactly, with no export keyword added");
    const after = ws.read("js/modeler.js");
    for (const gone of ["function scale", "function tint", "function helper", "function quiet", "Scales a value", "Labels a scaled"])
      assert.ok(!after.includes(gone), `${gone} left the source`);
    assert.ok(after.includes("function bump") && after.includes("const TABLE"), "everything else stays");
    assert.ok(!/\n\n\n/.test(after), "removing functions leaves one blank line, not a run");
    assert.ok(!after.includes("\r") && !moved.includes("\r"), "LF only");
    assert.deepEqual(r.moved.sort(), ["helper", "quiet", "scale", "tint"]);
  } finally { ws.done(); }
});

test("new file: header, copied imports with rewritten paths, one import back from the source", () => {
  const ws = workspace();
  try {
    assert.equal(splitModule(ws.opts({ names: NAMES, purpose: "The fixture area" })).ok, true);
    const moved = ws.read("js/modeler/area.js");
    assert.ok(moved.startsWith("/* The fixture area, split out of js/modeler.js. It shares the editor's state"), moved.slice(0, 120));
    assert.ok(moved.split("*/")[0].includes("../modeler.js"), "header names the live-import path");
    assert.deepEqual(importsOf(moved), {
      "../geo.js": ["* as Geo"],
      "../modeler.js": ["LABEL", "LIMIT"],
      "../state.js": ["clamp", "uid as makeId"],
    });
    // imports come before the code, sorted by path, the source's import last
    assert.deepEqual(Object.keys(importsOf(moved)), ["../geo.js", "../state.js", "../modeler.js"]);
    // a function that was `export function` stays so; the others other files need go in ONE trailing list
    const fns = Object.fromEntries(declaredFunctions(moved).map((f) => [f.name, f.exported]));
    assert.deepEqual(fns, { scale: true, tint: false, helper: false, quiet: false });
    assert.deepEqual(exportLists(moved), [["helper", "tint"]], "tint is called back by the source, helper by a sibling; quiet by nobody");
    const last = parse(moved).body.at(-1);
    assert.equal(last.type, "ExportNamedDeclaration", "the list is the last thing in the file");
    assert.equal(moved[last.start - 1], "\n", "and it starts at column 0");
    assert.ok(moved.endsWith("\n}\n\nexport { helper, tint };\n"), "single-line form when it fits, after one blank line");
  } finally { ws.done(); }
});

test("source: export list for the new file holds only names not exported already", () => {
  const ws = workspace();
  try {
    assert.equal(splitModule(ws.opts({ names: NAMES })).ok, true);
    const src = ws.read("js/modeler.js");
    // LIMIT is new; LABEL was already exported for sibling.js
    assert.ok(src.includes("// for js/modeler/area.js (live bindings: it sees every reassignment)"));
    const lists = exportLists(src);
    assert.deepEqual(lists.find((l) => l.includes("LIMIT")), ["LIMIT"]);
    assert.ok(lists.some((l) => l.includes("LABEL")), "LABEL stays in the sibling's list");
    // the header comment sits directly above its list
    const header = src.indexOf("// for js/modeler/area.js");
    assert.ok(/^[^\n]*\nexport \{[^}]*LIMIT[^}]*\};/.test(src.slice(header)));
  } finally { ws.done(); }
});

test("source: imports what it still calls back, re-exports moved export functions", () => {
  const ws = workspace();
  try {
    assert.equal(splitModule(ws.opts({ names: NAMES })).ok, true);
    const src = ws.read("js/modeler.js");
    const imports = importsOf(src);
    assert.deepEqual(imports["./modeler/area.js"], ["scale", "tint"], "keep() calls tint and scale; helper/quiet are not needed back");
    assert.ok(exportLists(src).some((l) => l.length === 1 && l[0] === "scale"), "scale was `export function`, so it stays exported");
    const keys = Object.keys(imports);
    assert.equal(keys.indexOf("./modeler/area.js"), keys.indexOf("./modeler/sibling2.js") + 1, "placed with the other ./modeler/ imports");
  } finally { ws.done(); }
});

test("sibling split files import moved names from the new file; emptied export lists go with their header", () => {
  const ws = workspace();
  try {
    const r = splitModule(ws.opts({ names: NAMES }));
    assert.equal(r.ok, true, r.report);
    const sib = ws.read("js/modeler/sibling.js");
    assert.deepEqual(importsOf(sib), {
      "../geo.js": ["cell"],
      "../modeler/area.js": ["helper", "scale"],
      "../zoom.js": ["zoom"],
      "../modeler.js": ["LABEL", "bump"],
    });
    const sib2 = ws.read("js/modeler/sibling2.js");
    assert.deepEqual(importsOf(sib2), { "../modeler/area.js": ["tint"] }, "the import that held only a moved name is gone");
    const src = ws.read("js/modeler.js");
    assert.ok(!src.includes("sibling2.js (live bindings"), "the now-empty list lost its header comment");
    const lists = exportLists(src);
    assert.ok(!lists.some((l) => l.includes("tint") || l.includes("helper")), "no export of an undeclared name");
    assert.deepEqual(lists.find((l) => l.includes("bump")), ["LABEL", "bump"]);
    assert.ok(r.report.includes("sibling.js"), "report lists the sibling edits");
  } finally { ws.done(); }
});

test("the result passes the repo's free-identifier check and links", () => {
  const ws = workspace();
  try {
    assert.equal(splitModule(ws.opts({ names: NAMES })).ok, true);
    const files = ["js/modeler.js", "js/modeler/area.js", "js/modeler/sibling.js", "js/modeler/sibling2.js"].map(ws.p);
    const res = checkFiles(files, ws.dir);
    assert.equal(res.total, 0, JSON.stringify(res.hits));
    assert.ok(ws.read("js/modeler/area.js").length > 0);
  } finally { ws.done(); }
});

test("GUARD: moved code that assigns a source top-level binding aborts and writes nothing", () => {
  const ws = workspace();
  try {
    const before = ws.snapshot();
    const r = splitModule(ws.opts({ names: "scale,bump" }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.join("\n").includes("bump assigns counter"), r.errors.join("\n"));
    assert.deepEqual(ws.snapshot(), before, "source and siblings untouched");
    assert.equal(fs.existsSync(ws.p("js/modeler/area.js")), false, "no new file");
  } finally { ws.done(); }
});

test("GUARD: destructuring, for-of and ++ targets count as assignments too", () => {
  const ws = workspace();
  try {
    const src = ws.read("js/modeler.js") + `
function viaPattern(o) {
  ({ counter } = o);
}

function viaLoop(list) {
  for (counter of list) {}
}

function viaUpdate() {
  LIMIT++;
}

function shadowed() {
  let counter = 0;
  counter++;
  return counter;
}
`;
    fs.writeFileSync(ws.p("js/modeler.js"), src);
    for (const name of ["viaPattern", "viaLoop", "viaUpdate"]) {
      const r = splitModule(ws.opts({ names: name }));
      assert.equal(r.ok, false, name);
      assert.ok(/assigns (counter|LIMIT)/.test(r.errors.join("\n")), name);
    }
    const ok = splitModule(ws.opts({ names: "shadowed" }));
    assert.equal(ok.ok, true, "assigning a local that shadows the top-level name is fine: " + ok.report);
  } finally { ws.done(); }
});

test("--dry reports everything and writes nothing", () => {
  const ws = workspace();
  try {
    const before = ws.snapshot();
    const r = splitModule(ws.opts({ names: NAMES, dry: true }));
    assert.equal(r.ok, true, r.report);
    assert.equal(r.written, false);
    assert.deepEqual(ws.snapshot(), before);
    assert.equal(fs.existsSync(ws.p("js/modeler/area.js")), false);
    assert.ok(r.report.includes("moved: 4 functions"));
    assert.ok(r.report.includes("add js/modeler/area.js to survey-assets.json, then run npm run check"));
  } finally { ws.done(); }
});

test("--lines moves functions starting in the range and lists the rest as left behind", () => {
  const ws = workspace();
  try {
    const lines = ws.read("js/modeler.js").split("\n");
    const at = (needle) => lines.findIndex((l) => l.startsWith(needle)) + 1;
    const r = splitModule(ws.opts({ lines: `${at("export function scale")}-${at("function helper")}` }));
    assert.equal(r.ok, true, r.report);
    assert.deepEqual(r.moved.sort(), ["helper", "scale", "tint"]);
    assert.deepEqual(r.leftBehind, [`const TABLE (line ${at("const TABLE")})`]);
    assert.ok(ws.read("js/modeler.js").includes("const TABLE"), "left-behind code stays in the source");
    assert.ok(ws.read("js/modeler/area.js").includes("function tint"));
  } finally { ws.done(); }
});

test("refuses unknown or non-function names and an existing target", () => {
  const ws = workspace();
  try {
    const before = ws.snapshot();
    const missing = splitModule(ws.opts({ names: "scale,nope" }));
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.join("\n").includes("nope"));
    const notFn = splitModule(ws.opts({ names: "LIMIT" }));
    assert.equal(notFn.ok, false);
    assert.ok(notFn.errors.join("\n").includes("not a function declaration"));
    fs.writeFileSync(ws.p("js/modeler/area.js"), "// mine\n");
    const exists = splitModule(ws.opts({ names: "scale" }));
    assert.equal(exists.ok, false);
    assert.deepEqual(ws.snapshot(), before);
    assert.equal(ws.read("js/modeler/area.js"), "// mine\n");
  } finally { ws.done(); }
});

test("header comment matches the hand-written splits", () => {
  const ws = workspace();
  try {
    assert.equal(splitModule(ws.opts({ names: NAMES, purpose: "The CAD editor's typed dimension entry while drawing" })).ok, true);
    const head = ws.read("js/modeler/area.js").split("\n").slice(0, 3).join("\n");
    assert.equal(head, [
      "/* The CAD editor's typed dimension entry while drawing, split out of",
      "   js/modeler.js. It shares the editor's state through live imports from",
      "   ../modeler.js. */",
    ].join("\n"));
  } finally { ws.done(); }
});

test("CLI: --dry prints the report and exits 0; a guard failure exits 1", () => {
  const ws = workspace();
  try {
    const args = (extra) => [TOOL, "--from", ws.p("js/modeler.js"), "--to", ws.p("js/modeler/area.js"), ...extra];
    const dry = spawnSync(process.execPath, args(["--names", NAMES, "--dry"]), { encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(dry.stdout.includes("survey-assets.json"));
    assert.equal(fs.existsSync(ws.p("js/modeler/area.js")), false);
    const bad = spawnSync(process.execPath, args(["--names", "bump"]), { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.ok(bad.stderr.includes("GUARD"));
    const usage = spawnSync(process.execPath, [TOOL, "--bogus"], { encoding: "utf8" });
    assert.equal(usage.status, 2);
  } finally { ws.done(); }
});

// tests/helpers/modeler_source.mjs strips split files' imports and column-0 `export { ... };`
// lists so the combined text reads as one module; same patterns here
const IMPORT = /^import\s[^;]*?\sfrom\s*["'][^"']+["'];[ \t]*\n/gm;
const EXPORT_LIST = /^(?:\/\/ for js\/modeler\/[^\n]*\n)?export \{[^}]*\};[ \t]*\n/gm;

test("the trailing export list is stripped like modelerSource() does, leaving plain script text", () => {
  const ws = workspace();
  try {
    assert.equal(splitModule(ws.opts({ names: "tint,helper,quiet" })).ok, true);
    const moved = ws.read("js/modeler/area.js");
    assert.equal(exportLists(moved).length, 1);
    const stripped = moved.replace(IMPORT, "").replace(EXPORT_LIST, "");
    const tokens = [];
    // parsing as a script proves no import/export statement is left
    acorn.parse(stripped, { ecmaVersion: "latest", sourceType: "script", onToken: tokens });
    assert.ok(!tokens.some((t) => t.type.keyword === "export" || t.type.keyword === "import"), "no export or import token left");
    // and the stripped function text evaluates standalone, as the tests that new Function() it need
    const fn = new Function("scale", "LABEL", stripped + "\nreturn tint(2);");
    assert.equal(fn((v) => v * 10, "!"), "20!");
    // the source keeps its own imports but loses the ./modeler/ ones and its lists; the
    // combined text is then one module with no duplicate declarations or exports
    const src = ws.read("js/modeler.js")
      .replace(IMPORT, (m) => (/from\s*["']\.\/modeler\//.test(m) ? "" : m))
      .replace(EXPORT_LIST, "");
    acorn.parse(src + "\n" + stripped, { ecmaVersion: "latest", sourceType: "module" });
  } finally { ws.done(); }
});

test("relative paths inside moved code follow it to the new directory", () => {
  const ws = workspace();
  try {
    const r = splitModule(ws.opts({ names: "lazy" }));
    assert.equal(r.ok, true, r.report);
    const moved = ws.read("js/modeler/area.js");
    assert.ok(moved.includes('await import("../ui_textures.js")'), "dynamic import");
    assert.ok(moved.includes('new Worker(new URL("../modeler/job.js", import.meta.url))'), "worker URL, sibling file of the new one");
    assert.ok(moved.includes('new URL("../assets/data.json", import.meta.url)'), "plain new URL");
    assert.ok(moved.includes('import("three")'), "a bare specifier is left alone");
    assert.ok(r.report.includes("relative paths rewritten inside moved code: 3"), r.report);
    assert.equal(checkFiles(["js/modeler.js", "js/modeler/area.js"].map(ws.p), ws.dir).total, 0);
  } finally { ws.done(); }
});

test("a function the source exports through a plain export list stays exported", () => {
  const ws = workspace();
  try {
    const r = splitModule(ws.opts({ names: "listed" }));
    assert.equal(r.ok, true, r.report);
    const src = ws.read("js/modeler.js");
    assert.ok(exportLists(src).some((l) => l.length === 1 && l[0] === "listed"), "the plain list is untouched");
    assert.ok(importsOf(src)["./modeler/area.js"].includes("listed"), "listed is imported back so the export resolves");
    const moved = ws.read("js/modeler/area.js");
    assert.deepEqual(exportLists(moved), [["listed"]], "and the new file exports it");
    assert.equal(checkFiles(["js/modeler.js", "js/modeler/area.js"].map(ws.p), ws.dir).total, 0);
  } finally { ws.done(); }
});

test("GUARD: a direct eval call keeps the function in place", () => {
  const ws = workspace();
  try {
    const before = ws.snapshot();
    const r = splitModule(ws.opts({ names: "scale,evalUser" }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.join("\n").includes("evalUser calls eval"), r.errors.join("\n"));
    assert.deepEqual(ws.snapshot(), before);
    assert.equal(fs.existsSync(ws.p("js/modeler/area.js")), false);
  } finally { ws.done(); }
});

test("template-literal module paths: plain ones are rewritten, ones with expressions abort", () => {
  const ws = workspace();
  try {
    const before = ws.snapshot();
    const bad = splitModule(ws.opts({ names: "tplDyn" }));
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.join("\n").includes("template"), bad.errors.join("\n"));
    assert.deepEqual(ws.snapshot(), before);
    const r = splitModule(ws.opts({ names: "tpl" }));
    assert.equal(r.ok, true, r.report);
    assert.ok(ws.read("js/modeler/area.js").includes("import(`../state.js`)"));
  } finally { ws.done(); }
});

test("plain Worker/SharedWorker strings resolve against the page and are left alone", () => {
  const ws = workspace();
  try {
    const r = splitModule(ws.opts({ names: "plainWorkers" }));
    assert.equal(r.ok, true, r.report);
    const moved = ws.read("js/modeler/area.js");
    assert.ok(moved.includes('new Worker("./w.js")') && moved.includes('new SharedWorker("./w.js")'));
    assert.ok(!r.report.includes("relative paths rewritten"), r.report);
  } finally { ws.done(); }
});

// ---- --setters --------------------------------------------------------------
// These tests write a small real ES-module project to a temp dir, run the split, then import
// the generated files and call the moved functions: ES imports are read-only, so only running
// them proves the rewritten assignments reach the source's bindings.
const SETTER_SRC = `import { sib } from "./modeler/sibling.js";

export let counter = 0;
export let flag = null;
let opt;
var shared = 1;
let evals = 0;
const FIXED = 3;
class Box {}
function fixedFn() {}
function set_shared() {
  return "mine";
}

function next(v) {
  evals++;
  return v;
}

// plain value read back by the tests
export function snapshot() {
  return { counter, flag, opt, shared, evals };
}

export function reset() {
  counter = 0; flag = null; opt = undefined; shared = 1; evals = 0;
}

export function viaSource() {
  return [assignRet(), mineStill()];
}

// the source calls every movable function, so each one is imported back and the new file exports it
export const everything = () => [assignChain, allCompound, logicalOr, logicalAnd, nullish, updates, shadowed, reader];

function mineStill() {
  counter++;
  return counter + set_shared();
}

/* returns the assigned value */
function assignRet() {
  return counter = 5;
}

function assignChain() {
  let y;
  y = (counter += 2);
  let a, b;
  a = b = counter = 7;
  return [y, a, b];
}

function allCompound() {
  counter = 1;
  counter += 2;
  counter *= 4;
  counter -= 2;
  counter /= 5;
  counter **= 3;
  counter %= 5;
  counter <<= 2;
  counter >>= 1;
  counter >>>= 1;
  counter &= 2;
  counter |= 5;
  counter ^= 2;
  return counter;
}

function logicalOr(v) {
  const r = (flag ||= next(v));
  return r;
}

function logicalAnd(v) {
  flag &&= next(v);
  return flag;
}

function nullish(v) {
  return opt ??= next(v);
}

function updates() {
  counter = 10;
  counter++;
  ++counter;
  counter--;
  --counter;
  counter++
  for (; shared < 4; shared++) {}
  for (let k = 0; k < 2; k++) {}
  return counter;
}

function shadowed() {
  let counter = 100;
  counter += 1;
  counter++;
  const f = (shared) => { shared = 9; return shared; };
  return [counter, f(1)];
}

function reader() {
  return counter + shared;
}

function sharedSetter() {
  shared = 8;
  return shared;
}

function updateUsed() {
  const k = counter++;
  return k;
}

function prefixUsed() {
  const k = ++counter;
  return [k, --counter];
}

function destructure(o) {
  ({ counter } = o);
}

function destructureArr(a) {
  [flag] = a;
}

function forOf(list) {
  for (counter of list) {}
}

function forIn(o) {
  for (flag in o) {}
}

function toConst() {
  FIXED = 4;
}

function toImport() {
  sib = 1;
}

function toClass() {
  Box = null;
}

function toFunction() {
  fixedFn = null;
}

function evalCall() {
  eval("counter++");
}
`;
const SIBLING_SRC = `export function sib() {\n  return 1;\n}\n`;

function setterProject(srcText = SETTER_SRC) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "split-setters-"));
  const p = (rel) => path.join(dir, ...rel.split("/"));
  fs.mkdirSync(p("js/modeler"), { recursive: true });
  fs.writeFileSync(p("package.json"), '{"type":"module"}\n');
  fs.writeFileSync(p("js/modeler.js"), srcText);
  fs.writeFileSync(p("js/modeler/sibling.js"), SIBLING_SRC);
  return {
    dir, p,
    read: (rel) => fs.readFileSync(p(rel), "utf8"),
    split: (extra) => splitModule({ from: p("js/modeler.js"), to: p("js/modeler/area.js"), repoRoot: dir, setters: true, ...extra }),
    load: (rel) => import(pathToFileURL(p(rel)).href),
    done: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }),
  };
}

const MOVABLE = "assignRet,assignChain,allCompound,logicalOr,logicalAnd,nullish,updates,shadowed,reader";

test("--setters: every rewrite form updates the source binding and keeps its value", async () => {
  const pr = setterProject();
  try {
    const r = pr.split({ names: MOVABLE });
    assert.equal(r.ok, true, r.report);
    const src = await pr.load("js/modeler.js");
    const area = await pr.load("js/modeler/area.js");
    src.reset();

    assert.equal(area.assignRet(), 5, "`return X = 5` still returns 5");
    assert.equal(src.snapshot().counter, 5, "and the source binding changed");

    assert.deepEqual(area.assignChain(), [7, 7, 7], "y = (X += 2) gets the new value; a = b = X = 7 chains");
    assert.equal(src.snapshot().counter, 7);

    assert.equal(area.allCompound(), 5, "all twelve compound operators");
    assert.equal(src.snapshot().counter, 5);

    assert.equal(area.updates(), 11, "statement-level ++/-- and a for-update clause");
    assert.equal(src.snapshot().counter, 11);
    assert.equal(src.snapshot().shared, 4, "for (; ...; shared++) ran through the setter");

    assert.equal(area.reader(), 15, "reads still see the live import");
  } finally { pr.done(); }
});

test("--setters: ||=, &&= and ??= keep their short-circuit and their value", async () => {
  const pr = setterProject();
  try {
    assert.equal(pr.split({ names: MOVABLE }).ok, true);
    const src = await pr.load("js/modeler.js");
    const area = await pr.load("js/modeler/area.js");
    src.reset();

    assert.equal(area.logicalAnd("x"), null, "&&= on a falsy flag does nothing");
    assert.equal(src.snapshot().evals, 0, "and the right side is not evaluated");

    assert.equal(area.logicalOr("a"), "a", "||= on a falsy flag assigns and yields the value");
    assert.deepEqual([src.snapshot().flag, src.snapshot().evals], ["a", 1]);
    assert.equal(area.logicalOr("b"), "a", "||= on a truthy flag short-circuits");
    assert.deepEqual([src.snapshot().flag, src.snapshot().evals], ["a", 1], "the setter is not reached");

    assert.equal(area.logicalAnd("c"), "c", "&&= on a truthy flag assigns");
    assert.deepEqual([src.snapshot().flag, src.snapshot().evals], ["c", 2]);

    assert.equal(area.nullish(0), 0, "??= on undefined assigns even a falsy value");
    assert.equal(area.nullish(9), 0, "??= on 0 short-circuits (0 is not nullish)");
    assert.deepEqual([src.snapshot().opt, src.snapshot().evals], [0, 3]);
  } finally { pr.done(); }
});

test("--setters: a local that shadows the binding is untouched, the source's own code is never rewritten", async () => {
  const pr = setterProject();
  try {
    const r = pr.split({ names: MOVABLE });
    assert.equal(r.ok, true, r.report);
    const area = pr.read("js/modeler/area.js");
    const shadow = area.slice(area.indexOf("function shadowed"), area.indexOf("function reader"));
    assert.ok(shadow.includes("counter += 1;") && shadow.includes("counter++;") && shadow.includes("shared = 9;"), shadow);
    assert.ok(!shadow.includes("set_"), "no setter call in the function that only touches locals");
    const src = pr.read("js/modeler.js");
    assert.ok(src.includes("  counter++;\n  return counter + set_shared();"), "mineStill keeps its own counter++");
    assert.ok(src.includes("counter = 0; flag = null;"), "reset() is unchanged");
    const area2 = await pr.load("js/modeler/area.js");
    const s = await pr.load("js/modeler.js");
    s.reset();
    assert.deepEqual(area2.shadowed(), [102, 9]);
    assert.equal(s.snapshot().counter, 0, "the source counter never moved");
    assert.equal(s.snapshot().shared, 1);
  } finally { pr.done(); }
});

test("--setters: one setter per binding after its declaration, a free name, exported for the new file", () => {
  const pr = setterProject();
  try {
    const r = pr.split({ names: MOVABLE });
    assert.equal(r.ok, true, r.report);
    assert.deepEqual(r.setters.bindings, { counter: "set_counter", flag: "set_flag", opt: "set_opt", shared: "inc_shared" });
    assert.ok(/setters: 4 bindings \(counter, flag, opt, shared\), \d+ sites rewritten/.test(r.report), r.report);
    assert.deepEqual([...r.setters.helpers].sort(), ["dec_counter", "inc_counter", "inc_shared", "set_counter", "set_flag", "set_opt"]);
    assert.ok(r.report.includes(`${r.setters.sites} sites rewritten`));
    const src = pr.read("js/modeler.js");
    assert.ok(src.includes("export let counter = 0;\nfunction set_counter(value) { return counter = value; }\n"), src.slice(0, 400));
    assert.ok(src.includes("export let flag = null;\nfunction set_flag(value) { return flag = value; }\n"));
    assert.ok(src.includes("let opt;\nfunction set_opt(value) { return opt = value; }\n"));
    assert.ok(src.includes("var shared = 1;\nfunction inc_shared() { return ++shared; }\n"), src.slice(0, 700));
    assert.ok(src.includes("function inc_counter() { return ++counter; }\nfunction dec_counter() { return --counter; }\n"), "native ++/-- helpers next to the setter");
    assert.equal(src.split("function set_counter(").length, 2, "exactly one");
    assert.ok(src.includes('return "mine"'), "the pre-existing set_shared is untouched");
    // exported through the list headed for the new file, so modelerSource() strips it as before
    assert.ok(src.includes("// for js/modeler/area.js (live bindings: it sees every reassignment)"));
    const list = exportLists(src).find((l) => l.includes("set_counter"));
    assert.ok(list && ["set_counter", "inc_counter", "dec_counter", "set_flag", "set_opt", "inc_shared"].every((n) => list.includes(n)), JSON.stringify(exportLists(src)));
    // the new file imports them
    const area = pr.read("js/modeler/area.js");
    const fromSrc = importsOf(area)["../modeler.js"];
    for (const n of ["set_counter", "inc_counter", "dec_counter", "set_flag", "set_opt", "inc_shared", "next", "counter", "shared"]) assert.ok(fromSrc.includes(n), `${n} imported: ${fromSrc}`);
    assert.ok(area.includes("set_counter(5)") && area.includes("set_counter(counter + (2))"), "the rewritten text");
    assert.ok(area.includes("(flag || (set_flag(next(v))))"), "||= inside an expression is parenthesised");
    assert.ok(area.includes("  flag && (set_flag(next(v)));"), "&&= as a statement needs no outer parentheses");
    assert.equal(checkFiles(["js/modeler.js", "js/modeler/area.js", "js/modeler/sibling.js"].map(pr.p), pr.dir).total, 0);
  } finally { pr.done(); }
});

test("--setters: code that needs no rewrite stays byte-for-byte, comments stay", () => {
  const pr = setterProject();
  try {
    const before = pr.read("js/modeler.js");
    const reader = before.slice(before.indexOf("function reader"), before.indexOf("function sharedSetter")).trimEnd();
    const shadow = before.slice(before.indexOf("function shadowed"), before.indexOf("function reader")).trimEnd();
    assert.equal(pr.split({ names: MOVABLE }).ok, true);
    const area = pr.read("js/modeler/area.js");
    assert.ok(area.includes(reader) && area.includes(shadow), "functions with nothing to rewrite are copied exactly");
    assert.ok(area.includes("/* returns the assigned value */\nfunction assignRet() {\n  return set_counter(5);\n}"), "leading comment kept, body rewritten in place");
  } finally { pr.done(); }
});

test("--setters: a postfix update whose value is used, destructuring, for-in/of, const, import, class and function targets stay refused", () => {
  const cases = {
    updateUsed: /updateUsed assigns counter .* - \+\+ whose value is used \(postfix/,
    destructure: /destructure assigns counter .* - destructuring target/,
    destructureArr: /destructureArr assigns flag .* - destructuring target/,
    forOf: /forOf assigns counter .* - for-in\/of target/,
    forIn: /forIn assigns flag .* - for-in\/of target/,
    toConst: /toConst assigns FIXED .* - a const/,
    toImport: /toImport assigns sib .* - an imported binding/,
    toClass: /toClass assigns Box .* - a class/,
    toFunction: /toFunction assigns fixedFn .* - a function declaration/,
  };
  for (const [name, re] of Object.entries(cases)) {
    const pr = setterProject();
    try {
      const before = pr.read("js/modeler.js");
      const r = pr.split({ names: `assignRet,${name}` });
      assert.equal(r.ok, false, name);
      assert.ok(re.test(r.errors.join("\n")), `${name}: ${r.errors.join("\n")}`);
      assert.equal(pr.read("js/modeler.js"), before, "nothing written");
      assert.equal(fs.existsSync(pr.p("js/modeler/area.js")), false);
    } finally { pr.done(); }
  }
});

test("--setters: a direct eval is still refused", () => {
  const pr = setterProject();
  try {
    const r = pr.split({ names: "assignRet,evalCall" });
    assert.equal(r.ok, false);
    assert.ok(r.errors.join("\n").includes("evalCall calls eval"), r.errors.join("\n"));
  } finally { pr.done(); }
});

test("without --setters the guard is unchanged: assigning a source binding aborts", () => {
  const pr = setterProject();
  try {
    const r = pr.split({ names: "assignRet", setters: false });
    assert.equal(r.ok, false);
    assert.ok(/assignRet assigns counter \(top-level let of /.test(r.errors.join("\n")), r.errors.join("\n"));
    assert.ok(!("setters" in r));
  } finally { pr.done(); }
});

test("--setters --dry reports and writes nothing; a split that needs no setter reports zero", () => {
  const pr = setterProject();
  try {
    const before = pr.read("js/modeler.js");
    const dry = pr.split({ names: "assignRet,shadowed", dry: true });
    assert.equal(dry.ok, true, dry.report);
    assert.ok(/setters: 1 bindings \(counter\), 1 sites rewritten/.test(dry.report), dry.report);
    assert.equal(pr.read("js/modeler.js"), before);
    assert.equal(fs.existsSync(pr.p("js/modeler/area.js")), false);
    const none = pr.split({ names: "reader", dry: true });
    assert.ok(/setters: 0 bindings \(\), 0 sites rewritten/.test(none.report), none.report);
  } finally { pr.done(); }
});

test("--setters: a second split reuses the setter the first one generated", async () => {
  const pr = setterProject();
  try {
    assert.equal(pr.split({ names: "assignRet" }).ok, true);
    const r2 = pr.split({ names: "allCompound", to: pr.p("js/modeler/area2.js") });
    assert.equal(r2.ok, true, r2.report);
    assert.deepEqual(r2.setters.bindings, { counter: "set_counter" });
    const src = pr.read("js/modeler.js");
    assert.equal(src.split("function set_counter(").length, 2, "still exactly one setter");
    assert.equal(exportLists(src).filter((l) => l.includes("set_counter")).length, 1, "and exported once");
    const s = await pr.load("js/modeler.js");
    const a2 = await pr.load("js/modeler/area2.js");
    s.reset();
    assert.equal(a2.allCompound(), 5);
    assert.equal(s.snapshot().counter, 5);
  } finally { pr.done(); }
});

test("--setters: a binding named `value` gets a setter whose parameter does not shadow it", async () => {
  const pr = setterProject(`export let value = 1;\nexport function get() {\n  return value;\n}\nfunction put(n) {\n  value = n;\n}\nexport function viaSource() {\n  put(3);\n}\n`);
  try {
    const r = pr.split({ names: "put" });
    assert.equal(r.ok, true, r.report);
    assert.ok(pr.read("js/modeler.js").includes("function set_value(next) { return value = next; }"));
    const s = await pr.load("js/modeler.js");
    s.viaSource();
    assert.equal(s.get(), 3);
  } finally { pr.done(); }
});

test("CLI: --setters is accepted", () => {
  const pr = setterProject();
  try {
    const run = spawnSync(process.execPath, [TOOL, "--from", pr.p("js/modeler.js"), "--to", pr.p("js/modeler/area.js"), "--names", "assignRet", "--setters", "--dry"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes("setters: 1 bindings (counter), 1 sites rewritten"), run.stdout);
  } finally { pr.done(); }
});

// ---- review fixes: shadowed helpers, native ++/--, computed relative paths, text API -----------
// Run a scenario against the project before the split (its own instance of the source, via a
// query string) and again after, and compare what they return.
async function beforeAndAfter(pr, scenario, splitExtra) {
  const before = await scenario(await import(pathToFileURL(pr.p("js/modeler.js")).href + "?before"));
  const r = pr.split(splitExtra);
  assert.equal(r.ok, true, r.report);
  // plain URL: the new file imports "../modeler.js" without a query, and must share that instance
  const after = await scenario(await pr.load("js/modeler.js"));
  assert.deepEqual(after, before);
  return { before, after, r };
}

test("--setters: a reused setter that a local in the moved function shadows gets a fresh name for that site only", async () => {
  const pr = setterProject(`export let counter = 0;
function set_counter(value) { return counter = value; }
export function get() { return counter; }
export function viaSource() { set_counter(1); return counter; }

export function shadowedParam(set_counter) {
  counter = 5;
  return set_counter(2);
}

export function shadowedLocal() {
  const set_counter = (v) => "local" + v;
  counter = 6;
  return set_counter(1);
}

export function shadowedInner() {
  return [1].map((x) => { function set_counter(v) { return "inner" + v; } counter = 8; return set_counter(x); });
}

export function plain() {
  counter = 7;
  return counter;
}

export function siblingBlock() {
  { let set_counter = 0; }
  counter = 9;
  return counter;
}
`);
  try {
    const { before, r } = await beforeAndAfter(pr, (m) => {
      const out = {};
      out.shadowedParam = m.shadowedParam((v) => "param" + v);
      out.afterParam = m.get();
      out.shadowedLocal = m.shadowedLocal();
      out.afterLocal = m.get();
      out.shadowedInner = m.shadowedInner();
      out.afterInner = m.get();
      out.plain = m.plain();
      out.siblingBlock = m.siblingBlock();
      m.viaSource();
      out.viaSource = m.get();
      return out;
    }, { names: "shadowedParam,shadowedLocal,shadowedInner,plain,siblingBlock" });
    assert.deepEqual(before, { shadowedParam: "param2", afterParam: 5, shadowedLocal: "local1", afterLocal: 6, shadowedInner: ["inner1"], afterInner: 8, plain: 7, siblingBlock: 9, viaSource: 1 });
    const area = pr.read("js/modeler/area.js");
    const fn = (name) => area.slice(area.indexOf("function " + name), area.indexOf("\n}", area.indexOf("function " + name)));
    assert.ok(fn("shadowedParam").includes("set_counter_1(5)"), fn("shadowedParam"));
    assert.ok(fn("shadowedLocal").includes("set_counter_1(6)"));
    assert.ok(fn("shadowedInner").includes("set_counter_1(8)"));
    assert.ok(fn("plain").includes("set_counter(7)"), "the existing setter is still reused where nothing shadows it");
    assert.ok(fn("siblingBlock").includes("set_counter(9)"), "a local in a sibling block does not shadow the site");
    const src = pr.read("js/modeler.js");
    assert.equal(src.split("function set_counter(").length, 2, "the existing setter stays");
    assert.equal(src.split("function set_counter_1(").length, 2, "one fresh setter for all three shadowed sites");
    assert.deepEqual([...r.setters.helpers].sort(), ["set_counter", "set_counter_1"]);
  } finally { pr.done(); }
});

test("--setters: x++ / ++x / x-- call native helpers, so strings and BigInts behave as before", async () => {
  const pr = setterProject(`export let s = "1";
export let big = 10n;
export let n = 1;
let t = "5";
export function snap() { return [s, big, n, t, typeof s, typeof big, typeof t]; }

export function incAll() {
  s++;
  ++s;
  big++;
  n--;
  --t;
}

export function prefixUsed() {
  const a = ++n;
  const b = --big;
  const c = ++t;
  return [a, b, c, n, big, t];
}

export function inFor() {
  let c = 0;
  for (n = 0; n < 3; n++) c += 1;
  return [c, n];
}

export function postfixUsed() {
  return n++;
}
`);
  try {
    const { before } = await beforeAndAfter(pr, (m) => {
      m.incAll();
      const afterInc = m.snap();
      const used = m.prefixUsed();
      const loop = m.inFor();
      return { afterInc, used, loop, end: m.snap() };
    }, { names: "incAll,prefixUsed,inFor" });
    assert.deepEqual(before.afterInc, [3, 11n, 0, 4, "number", "bigint", "number"], "native semantics: the string \"1\" becomes the number 3, not \"111\"");
    assert.deepEqual(before.used, [1, 10n, 5, 1, 10n, 5]);
    const area = pr.read("js/modeler/area.js");
    assert.ok(area.includes("inc_s();") && area.includes("inc_big();") && area.includes("dec_n();") && area.includes("dec_t();"), "statement-level updates");
    assert.ok(area.includes("const a = inc_n();") && area.includes("const b = dec_big();"), "prefix updates whose value is used");
    assert.ok(area.includes("for (set_n(0); n < 3; inc_n())"), area);
    const src = pr.read("js/modeler.js");
    assert.ok(src.includes("function inc_s() { return ++s; }"), src.slice(0, 600));
    assert.ok(!/set_s\(/.test(area), "no s + 1 style rewrite remains");
    const refused = pr.split({ names: "postfixUsed", to: pr.p("js/modeler/area2.js") });
    assert.equal(refused.ok, false);
    assert.match(refused.errors.join("\n"), /postfixUsed assigns n .* - \+\+ whose value is used \(postfix/);
  } finally { pr.done(); }
});

test("--setters: identical inc/dec helpers from an earlier split are reused, a different function of that name is not", async () => {
  const pr = setterProject(`export let n = 1;
function inc_n() { return ++n; }
function dec_n() { return n - 1; }
export function get() { return n; }
export function viaSource() { inc_n(); return n; }
export function up() { n++; }
export function down() { n--; }
`);
  try {
    const r = pr.split({ names: "up,down" });
    assert.equal(r.ok, true, r.report);
    assert.deepEqual([...r.setters.helpers].sort(), ["dec_n_1", "inc_n"]);
    const src = pr.read("js/modeler.js");
    assert.equal(src.split("function inc_n(").length, 2, "reused, not duplicated");
    assert.ok(src.includes("function dec_n_1() { return --n; }"), "dec_n does something else, so the suffix");
    const area = await pr.load("js/modeler/area.js");
    const s = await pr.load("js/modeler.js");
    area.up(); area.up(); area.down();
    assert.equal(s.get(), 2);
  } finally { pr.done(); }
});

function pathProject(src) {
  const pr = setterProject(src);
  fs.mkdirSync(pr.p("js/parts"), { recursive: true });
  fs.writeFileSync(pr.p("js/parts/a.js"), "export default \"a\";\n");
  return pr;
}

const PATH_SRC = `export async function loadByName(name) {
  return (await import("./parts/" + name + ".js")).default;
}

export async function loadIdent(spec) {
  return import(spec);
}

export async function loadTemplate(name) {
  return import(\`\${name}\`);
}

export async function loadFromBase(base, name) {
  return import(\`\${base}/\${name}.js\`);
}

export function urlOf(name) {
  return new URL("./parts/" + name, import.meta.url).href;
}

export async function loadLiteral() {
  return (await import("./parts/a.js")).default;
}

export async function loadBare() {
  return (await import("node:path")).sep.length;
}

export async function loadBarePrefix(x) {
  return typeof (await import("node:" + x));
}

export function urlLiteral() {
  return new URL("./parts/a.js", import.meta.url).href.endsWith("/js/parts/a.js");
}

export async function loadTemplateBare(x) {
  return typeof (await import(\`node:\${x}\`));
}
`;

test("a computed module path that may be relative is refused when the code changes directory; literals and bare specifiers move", async () => {
  const pr = pathProject(PATH_SRC);
  try {
    const before = pr.read("js/modeler.js");
    const cases = {
      loadByName: /loadByName \(line 2\): import\(\.\.\.\) with a computed path that may be relative cannot be relocated/,
      loadIdent: /loadIdent \(line 6\): import\(\.\.\.\) with a computed path/,
      loadTemplate: /loadTemplate \(line 10\): a module path that starts with a template expression/,
      loadFromBase: /loadFromBase \(line 14\): a module path that starts with a template expression/,
      urlOf: /urlOf \(line 18\): new URL\(\.\.\., import\.meta\.url\) with a computed path/,
    };
    for (const [name, re] of Object.entries(cases)) {
      const r = pr.split({ names: name, setters: false });
      assert.equal(r.ok, false, name);
      assert.match(r.errors.join("\n"), re, name);
      assert.equal(pr.read("js/modeler.js"), before, "nothing written");
      assert.equal(fs.existsSync(pr.p("js/modeler/area.js")), false);
    }
    const ok = pr.split({ names: "loadLiteral,loadBare,loadBarePrefix,urlLiteral,loadTemplateBare", setters: false });
    assert.equal(ok.ok, true, ok.report);
    assert.ok(pr.read("js/modeler/area.js").includes('import("../parts/a.js")'), "the literal is rewritten");
    const area = await pr.load("js/modeler/area.js");
    assert.equal(await area.loadLiteral(), "a");
    assert.equal(await area.loadBare(), 1);
    assert.equal(await area.loadBarePrefix("path"), "object");
    assert.equal(await area.loadTemplateBare("path"), "object");
    assert.equal(area.urlLiteral(), true);
  } finally { pr.done(); }
});

test("a computed relative path is fine when the new file stays in the same directory", async () => {
  const pr = pathProject(PATH_SRC);
  try {
    const r = pr.split({ names: "loadByName,urlOf", setters: false, to: pr.p("js/area.js") });
    assert.equal(r.ok, true, r.report);
    const area = await pr.load("js/area.js");
    assert.equal(await area.loadByName("a"), "a");
    assert.ok(area.urlOf("a").endsWith("/js/parts/a"));
  } finally { pr.done(); }
});

test("splitModuleText returns the new texts of every file and touches no disk", () => {
  const ws = workspace();
  try {
    const disk = ws.snapshot();
    const sibNames = ["sibling.js", "sibling2.js"];
    const text = splitModuleText({
      sourceText: ws.read("js/modeler.js"),
      sourcePath: ws.p("js/modeler.js"),
      targetPath: ws.p("js/modeler/area.js"),
      names: NAMES,
      purpose: "The fixture area",
      repoRoot: ws.dir,
      siblings: sibNames.map((n) => ({ path: ws.p("js/modeler/" + n), text: ws.read("js/modeler/" + n) })),
    });
    assert.equal(text.ok, true, text.report);
    assert.equal(text.written, false);
    assert.equal(fs.existsSync(ws.p("js/modeler/area.js")), false);
    assert.deepEqual(ws.snapshot(), disk, "no file changed");
    assert.deepEqual(text.moved.sort(), ["helper", "quiet", "scale", "tint"]);
    // the same split on disk produces exactly these texts
    const real = splitModule(ws.opts({ names: NAMES, purpose: "The fixture area" }));
    assert.equal(real.ok, true, real.report);
    assert.equal(text.texts.target, ws.read("js/modeler/area.js"));
    assert.equal(text.texts.source, ws.read("js/modeler.js"));
    const bySib = Object.fromEntries(text.texts.siblings.map((x) => [path.basename(x.path), x.text]));
    for (const n of sibNames) assert.equal(bySib[n], ws.read("js/modeler/" + n), n);
    // and a refusal is reported the same way, with no texts
    const bad = splitModuleText({ sourceText: "export function f() {}\n", sourcePath: ws.p("js/x.js"), targetPath: ws.p("js/y.js"), names: "missing", repoRoot: ws.dir });
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join("\n"), /missing is not declared/);
    assert.equal(bad.texts, undefined);
  } finally { ws.done(); }
});

// ---- new URL(x, import.meta.url) with a path that has no leading dot -----------------------------
const URL_SRC = `export function bareUrl() {
  return new URL("parts/a.js", import.meta.url).href.endsWith("/js/parts/a.js");
}

export function bareTemplate() {
  return new URL(\`parts/a.js\`, import.meta.url).href.endsWith("/js/parts/a.js");
}

export function nonRelative() {
  return [new URL("https://example.com/x.js", import.meta.url).href, new URL("/root.js", import.meta.url).pathname, new URL("data:text/plain,hi", import.meta.url).protocol, new URL("#frag", import.meta.url).hash].join("|");
}

export function computedBare(name) {
  return new URL("parts/" + name, import.meta.url).href;
}

export function templateBare(name) {
  return new URL(\`parts/\${name}\`, import.meta.url).href;
}

export function computedAbsolute(name) {
  return new URL("https://example.com/" + name, import.meta.url).href;
}

export async function subpathImport() {
  return typeof (await import("fs/promises")).readFile;
}

export async function bareImportPrefix(x) {
  return typeof (await import("node:" + x));
}
`;

test("new URL(\"parts/a.js\", import.meta.url) is module-relative and is rebased like \"./parts/a.js\"; scheme, root and fragment URLs and bare import() specifiers are left alone", async () => {
  const pr = pathProject(URL_SRC);
  try {
    const r = pr.split({ names: "bareUrl,bareTemplate,nonRelative,computedAbsolute,subpathImport,bareImportPrefix", setters: false });
    assert.equal(r.ok, true, r.report);
    const moved = pr.read("js/modeler/area.js");
    assert.ok(moved.includes('new URL("../parts/a.js", import.meta.url)'), "string literal rebased");
    assert.ok(moved.includes("new URL(`../parts/a.js`, import.meta.url)"), "template literal rebased");
    assert.ok(moved.includes('new URL("https://example.com/x.js", import.meta.url)'), "absolute URL untouched");
    assert.ok(moved.includes('new URL("/root.js", import.meta.url)') && moved.includes('new URL("#frag", import.meta.url)'));
    assert.ok(moved.includes('import("fs/promises")'), "an import() specifier without ./ is a package, not a path");
    assert.ok(moved.includes('new URL("https://example.com/" + name, import.meta.url)'), "a computed absolute URL is fine");
    const area = await pr.load("js/modeler/area.js");
    assert.equal(area.bareUrl(), true);
    assert.equal(area.bareTemplate(), true);
    // root-relative means the origin's root, whatever the module directory (Windows file URLs add "/C:")
    assert.match(area.nonRelative(), /^https:\/\/example\.com\/x\.js\|(\/[A-Za-z]:)?\/root\.js\|data:\|#frag$/);
    assert.equal(await area.subpathImport(), "function");
    assert.equal(await area.bareImportPrefix("path"), "object");
  } finally { pr.done(); }
});

test("a computed new URL(\"parts/\" + name, import.meta.url) is refused when the code changes directory, and moves unchanged within one", async () => {
  const pr = pathProject(URL_SRC);
  try {
    const before = pr.read("js/modeler.js");
    for (const [name, re] of Object.entries({
      computedBare: /computedBare \(line 14\): new URL\(\.\.\., import\.meta\.url\) with a computed path/,
      templateBare: /templateBare \(line 18\): a relative module path built from a template with expressions/,
    })) {
      const r = pr.split({ names: name, setters: false });
      assert.equal(r.ok, false, name);
      assert.match(r.errors.join("\n"), re, name);
      assert.equal(pr.read("js/modeler.js"), before, "nothing written");
      assert.equal(fs.existsSync(pr.p("js/modeler/area.js")), false);
    }
    // the same directory keeps the base, so nothing is rewritten and it behaves the same
    const same = pr.split({ names: "bareUrl,computedBare", setters: false, to: pr.p("js/area.js") });
    assert.equal(same.ok, true, same.report);
    const moved = pr.read("js/area.js");
    assert.ok(moved.includes('new URL("parts/a.js", import.meta.url)') && moved.includes('new URL("parts/" + name, import.meta.url)'));
    const area = await pr.load("js/area.js");
    assert.equal(area.bareUrl(), true);
    assert.ok(area.computedBare("a.js").endsWith("/js/parts/a.js"));
  } finally { pr.done(); }
});

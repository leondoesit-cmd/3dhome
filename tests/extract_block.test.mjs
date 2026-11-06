// tools/extract_block.mjs lifts a run of top-level statements out of a giant function into a
// new top-level function of the same module. Each test writes a fixture module to a temp dir,
// runs the tool on a copy, then IMPORTS both the original and the transformed module and
// compares what they do. Refusals are checked by the reasons listed and by the file staying
// byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { extractBlock, outlineFunction } from "../tools/extract_block.mjs";

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "extract_block.mjs");
let counter = 0;

// A temp workspace holding orig.mjs (untouched) and t.mjs (the file the tool edits).
function workspace(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "extract-block-"));
  const orig = path.join(dir, "orig.mjs"), t = path.join(dir, "t.mjs");
  const text = source.replace(/^\n/, "");
  fs.writeFileSync(orig, text);
  fs.writeFileSync(t, text);
  return {
    dir, orig, t, text,
    read: () => fs.readFileSync(t, "utf8"),
    load: async (file) => import(pathToFileURL(file).href + "?v=" + counter++),
    done: () => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }),
  };
}

// "A-B" from two needles: A is the line holding the first, B the line holding the second
function range(text, from, to) {
  const lines = text.split("\n");
  const find = (needle) => {
    const i = lines.findIndex((l) => l.includes(needle));
    assert.ok(i >= 0, `needle not found: ${needle}`);
    return i + 1;
  };
  return `${find(from)}-${find(to)}`;
}

async function withFixture(source, fn) {
  const ws = workspace(source);
  try { await fn(ws); } finally { ws.done(); }
}

function lift(ws, from, to, extra = {}) {
  return extractBlock({ file: ws.t, fn: "run", lines: range(ws.text, from, to), name: "lifted", ...extra });
}

async function sameBehaviour(ws, args, { async = false } = {}) {
  const a = await ws.load(ws.orig), b = await ws.load(ws.t);
  const x = async ? await a.run(...args) : a.run(...args);
  const y = async ? await b.run(...args) : b.run(...args);
  assert.deepEqual(y, x);
  return y;
}

test("a plain block that uses outer consts and calls an outer helper", () => withFixture(`
const base = 10;
function helper(x) { return x * 2 + base; }
export function run(a, b) {
  const k = a + 1;
  const log = [];
  log.push(helper(k)); // lead
  log.push(b * base);
  log.push(k + b);
  log.push("tail");
  return log;
}
`, async (ws) => {
  const r = lift(ws, "log.push(helper(k))", "log.push(k + b)");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.written, true);
  assert.deepEqual(r.params, ["log", "k", "b"]);
  assert.deepEqual(r.returned, []);
  assert.deepEqual(await sameBehaviour(ws, [3, 4]), [18, 40, 8, "tail"]);
  // the lifted function exists next to run(), right after it
  const ast = acorn.parse(ws.read(), { ecmaVersion: "latest", sourceType: "module" });
  const names = ast.body.filter((s) => s.type === "FunctionDeclaration" || s.declaration?.type === "FunctionDeclaration")
    .map((s) => (s.declaration || s).id.name);
  assert.deepEqual(names, ["helper", "run", "lifted"]);
  assert.equal(r.newLength, 7);
}));

test("block comments travel with the block and a trailing comment stays on its line", () => withFixture(`
export function run(a) {
  const out = [];
  // keep with the block
  out.push(a); // trailing
  out.push(a + 1);
  // not part of it
  out.push(a + 2);
  return out;
}
`, async (ws) => {
  const r = lift(ws, "out.push(a);", "out.push(a + 1)");
  assert.equal(r.ok, true, r.report);
  await sameBehaviour(ws, [1]);
  const comments = [];
  const ast = acorn.parse(ws.read(), { ecmaVersion: "latest", sourceType: "module", onComment: comments });
  const fn = ast.body.find((s) => s.type === "FunctionDeclaration" && s.id.name === "lifted");
  const inside = comments.filter((c) => c.start > fn.start && c.end < fn.end).map((c) => c.value.trim());
  assert.deepEqual(inside, ["keep with the block", "trailing"]);
  const outside = comments.filter((c) => c.start < fn.start || c.end > fn.end).map((c) => c.value.trim());
  assert.deepEqual(outside, ["not part of it", "lifted out of run()"]);
}));

test("returned kinds: one statement per kind, const stays const", () => withFixture(`
export function run(a) {
  const log = [];
  var v = a * 2;
  let l = v + 1;
  const c = l + v;
  function twice(x) { return x * 2; }
  class Box { constructor(n) { this.n = n; } }
  log.push(v, l, c);
  return [v, l, c, twice(4), new Box(3).n, log.length];
}
`, async (ws) => {
  const r = lift(ws, "var v = a * 2", "log.push(v, l, c)");
  assert.equal(r.ok, true, r.report);
  assert.deepEqual(r.params, ["a", "log"]);
  assert.deepEqual(r.returned, ["v", "l", "c", "twice", "Box"]);
  await sameBehaviour(ws, [5]);
  const mod = await ws.load(ws.t);
  assert.deepEqual(mod.run(2), [4, 5, 9, 8, 3, 3]);
}));

test("a single returned kind becomes one destructuring declaration of that kind", () => withFixture(`
export function run(a) {
  const c = a + 1;
  const d = c * 2;
  return [c, d];
}
`, async (ws) => {
  const r = lift(ws, "const c = a + 1", "const d = c * 2");
  assert.equal(r.ok, true, r.report);
  assert.deepEqual(r.returned, ["c", "d"]);
  assert.deepEqual(r.params, ["a"]);
  await sameBehaviour(ws, [1]);
  // the call site declares a real const: its text appears once as `const { c, d }`
  const ast = acorn.parse(ws.read(), { ecmaVersion: "latest", sourceType: "module" });
  const run = ast.body.find((s) => s.declaration?.id?.name === "run").declaration;
  const decl = run.body.body[0];
  assert.equal(decl.type, "VariableDeclaration");
  assert.equal(decl.kind, "const");
  assert.deepEqual(decl.declarations[0].id.properties.map((p) => p.key.name), ["c", "d"]);
}));

test("mixed kinds get a temporary and one statement per kind", () => withFixture(`
export function run(a) {
  var v = a * 2;
  let l = v + 1;
  const c = l + v;
  return [v, l, c];
}
`, async (ws) => {
  const r = lift(ws, "var v = a * 2", "const c = l + v");
  assert.equal(r.ok, true, r.report);
  assert.deepEqual(r.returned, ["v", "l", "c"]);
  await sameBehaviour(ws, [4]);
  const ast = acorn.parse(ws.read(), { ecmaVersion: "latest", sourceType: "module" });
  const run = ast.body.find((s) => s.declaration?.id?.name === "run").declaration;
  assert.deepEqual(run.body.body.slice(0, 4).map((s) => s.kind), ["const", "var", "let", "const"]);
}));

test("closures stored in an array still see the right values", () => withFixture(`
export function run(a) {
  const handlers = [];
  const state = { n: 1 };
  const label = "L" + a;
  for (let i = 0; i < 3; i++) {
    handlers.push(function () { return label + i + state.n; });
  }
  const bump = () => state.n++;
  handlers.push(() => bump() + label);
  const seen = [];
  handlers.forEach((h) => seen.push(h()));
  state.n = 50;
  handlers.forEach((h) => seen.push(h()));
  return seen;
}
`, async (ws) => {
  const r = lift(ws, "for (let i = 0", "handlers.push(() => bump()");
  assert.equal(r.ok, true, r.report);
  assert.deepEqual(r.params, ["handlers", "label", "state"]);
  await sameBehaviour(ws, [7]);
}));

test("a closure declared in the block that reads a returned name", () => withFixture(`
export function run(a) {
  const log = [];
  let total = a;
  const read = () => total;
  const api = { read, add(n) { total += n; return total; } };
  log.push(api.add(1), read());
  return { log, after: api.add(5), r: read(), total };
}
`, async (ws) => {
  const res = lift(ws, "let total = a", "const api");
  // total is assigned inside a method of the block and returned, so this cut is not safe
  assert.equal(res.ok, false);
  assert.match(res.errors.join("\n"), /a closure inside the block assigns it/);
}));

test("async function: await in the block makes the lifted function async and the call awaited", () => withFixture(`
async function later(x) { return x + 1; }
export async function run(a) {
  const out = [];
  const first = await later(a);
  out.push(first);
  const second = await later(first);
  out.push(second);
  out.push("sync");
  return [out, second];
}
`, async (ws) => {
  const r = lift(ws, "const first = await", "out.push(second)");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.async, true);
  assert.deepEqual(r.returned, ["second"]);
  assert.deepEqual(await sameBehaviour(ws, [1], { async: true }), [[2, 3, "sync"], 3]);
}));

test("async function: a block without await stays a plain function", () => withFixture(`
export async function run(a) {
  const out = [];
  out.push(a);
  out.push(a + 1);
  await Promise.resolve();
  out.push("end");
  return out;
}
`, async (ws) => {
  const r = lift(ws, "out.push(a);", "out.push(a + 1)");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.async, false);
  await sameBehaviour(ws, [1], { async: true });
}));

test("a block may use return, this, arguments and break inside its own nested functions and loops", () => withFixture(`
export function run(a) {
  const out = [];
  const obj = { v: 3, get() { return this.v; } };
  const plain = function () { return arguments.length + (this === undefined ? 0 : 1); };
  const early = (x) => { if (x) return "early"; return "late"; };
  outer: for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (j === 2) continue outer;
      if (i === 3) break outer;
      out.push(i * 10 + j);
    }
  }
  switch (a) { case 1: out.push("one"); break; default: out.push("other"); }
  out.push(obj.get(), plain(1, 2), early(a), [1, 2].map((x) => x * a).join());
  return out;
}
`, async (ws) => {
  const r = lift(ws, "const obj = ", "out.push(obj.get()");
  assert.deepEqual(r.params, ["out", "a"]);
  assert.equal(r.ok, true, r.report);
  await sameBehaviour(ws, [1]);
  await sameBehaviour(ws, [2]);
}));

test("a long parameter list wraps and still works", () => withFixture(`
export function run() {
${Array.from({ length: 24 }, (_, i) => `  const someQuiteLongParameterName${i} = ${i};`).join("\n")}
  const out = [];
  out.push(${Array.from({ length: 24 }, (_, i) => `someQuiteLongParameterName${i}`).join(" + ")});
  return out;
}
`, async (ws) => {
  const r = lift(ws, "out.push(", "out.push(");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.params.length, 25);
  await sameBehaviour(ws, []);
  assert.ok(ws.read().split("\n").every((l) => l.length <= 110 || l.includes("out.push(")));
}));


// ---- refusals ---------------------------------------------------------------------------
async function refused(source, from, to, pattern, extra = {}) {
  await withFixture(source, async (ws) => {
    const before = ws.read();
    const r = lift(ws, from, to, extra);
    assert.equal(r.ok, false, r.report);
    assert.equal(r.written, false);
    assert.match(r.errors.join("\n"), pattern);
    assert.equal(ws.read(), before, "a refusal must not touch the file");
  });
}

test("refuses a param assigned inside the block", () => refused(`
export function run(a) {
  let k = a;
  const log = [];
  log.push(k);
  k = k + 1;
  log.push(k);
  return log;
}
`, "log.push(k);", "k = k + 1", /line 5: k is a param .* assigned here inside the block/));

test("refuses a param assigned outside the block", () => refused(`
export function run(a) {
  let k = a;
  const log = [];
  log.push(k);
  log.push(k + 1);
  k++;
  return log;
}
`, "log.push(k);", "log.push(k + 1)", /line 6: k is a param .* assigned here outside the block/));

test("refuses a param assigned by destructuring or a for-of target outside the block", () => refused(`
export function run(a) {
  let k = a, m;
  const log = [];
  log.push(k, m);
  [k] = [5];
  for (m of [1]) {}
  return log;
}
`, "log.push(k, m)", "log.push(k, m)", /line 5: k is a param[^]*line 6: m is a param/));

test("refuses a returned name assigned after the block", () => refused(`
export function run(a) {
  let n = a;
  n += 1;
  const log = [n];
  n = 7;
  log.push(n);
  return log;
}
`, "let n = a", "const log = [n]", /line 5: n is returned .* assigned here after the block/));

test("a returned let that later code assigns is refused", () => refused(`
export function run(a) {
  const log = [];
  var v = a * 2;
  let l = v + 1;
  log.push(v, l);
  l = l + 100;
  return [v, l, log];
}
`, "var v = a * 2", "log.push(v, l)", /line 6: l is returned .* assigned here after the block/));

test("refuses a name the block declares but code uses before it", () => refused(`
export function run(a) {
  const peek = () => v;
  const v = a + 1;
  const log = [v];
  return [peek(), log];
}
`, "const v = a + 1", "const log = [v]", /line 2: v is declared by the block \(const\) but used before it/));

test("refuses a hoisted function the code calls before the block", () => refused(`
export function run(a) {
  const log = [hoisted(a)];
  function hoisted(x) { return x + 1; }
  log.push(hoisted(2));
  return log;
}
`, "function hoisted", "function hoisted", /line 2: hoisted is declared by the block \(function\) but used before it \(hoisting\)/));

test("refuses a param declared after the block (temporal dead zone)", () => refused(`
export function run(a) {
  const log = [];
  const read = () => later;
  log.push(read, a);
  const later = a;
  return [log, later];
}
`, "const read = () => later", "log.push(read, a)", /later is a const declared after the block; passing it would read it in its temporal dead zone/));

test("refuses a param var that is given its value after the block", () => refused(`
export function run(a) {
  const log = [];
  log.push(late);
  var late = a;
  return log;
}
`, "log.push(late)", "log.push(late)", /late is given a value after the block/));

test("refuses return, this, arguments at the block's own function level", async () => {
  await refused(`
export function run(a) {
  const out = [];
  if (a) return out;
  out.push(1);
  return out;
}
`, "if (a) return out", "if (a) return out", /line 3: the block contains .return./);
  await refused(`
export function run(a) {
  const out = [];
  out.push(this);
  return out;
}
`, "out.push(this)", "out.push(this)", /the block uses .this./);
  await refused(`
export function run(a) {
  const out = [];
  out.push(arguments.length);
  return out;
}
`, "out.push(arguments", "out.push(arguments", /the block uses .arguments./);
  await refused(`
export function run(a) {
  const out = [];
  out.push(() => this);
  return out;
}
`, "out.push(() => this)", "out.push(() => this)", /the block uses .this./);
});

test("refuses a direct eval in the block", () => refused(`
export function run(a) {
  const out = [];
  out.push(eval("a + 1"));
  return out;
}
`, "out.push(eval", "out.push(eval", /line 3: the block calls eval\(\.\.\.\) directly/));

test("refuses a NEWNAME that already exists in the module or in the function", async () => {
  await refused(`
function lifted() {}
export function run(a) {
  const out = [];
  out.push(a);
  return out;
}
`, "out.push(a)", "out.push(a)", /lifted already exists in the module/);
  await refused(`
export function run(a) {
  const lifted = 1;
  const out = [];
  out.push(a, lifted);
  return out;
}
`, "out.push(a, lifted)", "out.push(a, lifted)", /lifted already exists in the module/);
});

test("refuses an empty range, an unknown function and a range that starts inside a statement", async () => {
  await refused(`
export function run(a) {
  const out = [];

  return out;
}
`, "const out", "const out", /no top-level statement of run starts in lines 3-3/, { lines: "3-3" });
  await refused(`
export function run(a) {
  const out = [];
  out.push(a);
  return out;
}
`, "out.push(a)", "out.push(a)", /nope is not a top-level function declaration/, { fn: "nope" });
  await refused(`
export function run(a) {
  const out = [
    a,
    a + 1,
  ];
  return out;
}
`, "a + 1", "a + 1", /line 4 falls inside the statement at lines 2-5/, { lines: "4-4" });
});

test("refuses a block whose last statement shares its last line with other code", () => refused(`
export function run(a) {
  const out = [];
  if (a) {
    out.push(1);
  } out.push(2);
  return out;
}
`, "if (a) {", "if (a) {", /shares its last line with other code/));

test("--dry reports the plan and writes nothing; the CLI writes LF and exits non-zero on refusal", () => withFixture(`
export function run(a) {
  const out = [];
  out.push(a);
  out.push(a + 1);
  return out;
}
`, async (ws) => {
  const before = ws.read();
  const r = lift(ws, "out.push(a);", "out.push(a + 1)", { dry: true });
  assert.equal(r.ok, true, r.report);
  assert.equal(r.written, false);
  assert.match(r.report, /dry run/);
  assert.equal(ws.read(), before);
  const argv = ["--file", ws.t, "--fn", "run", "--lines", range(ws.text, "out.push(a);", "out.push(a + 1)"), "--name", "lifted"];
  const cli = spawnSync(process.execPath, [TOOL, ...argv, "--dry"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /params \(2\): out, a/);
  assert.equal(ws.read(), before);
  const real = spawnSync(process.execPath, [TOOL, ...argv], { encoding: "utf8" });
  assert.equal(real.status, 0, real.stderr);
  assert.notEqual(ws.read(), before);
  assert.equal(ws.read().includes("\r"), false);
  await sameBehaviour(ws, [4]);
  const bad = spawnSync(process.execPath, [TOOL, "--file", ws.t, "--fn", "run", "--lines", "1-1", "--name", "again"], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /REFUSED/);
}));

test("--outline lists statements and the comments above them with their lines", () => withFixture(`
export function run(a) {
  // set up
  const out = [], n = 2;
  /* a block
     comment */
  function helper(x) {
    return x;
  }

  // loop it
  for (let i = 0; i < n; i++) out.push(helper(i)); // trailing is not a heading
  var v = 1;
  if (a) {
    out.push(a);
  }
  return out;
}
`, async (ws) => {
  const o = outlineFunction({ file: ws.t, fn: "run" });
  assert.equal(o.ok, true, o.report);
  assert.equal(o.statements, 6);
  assert.deepEqual(o.lines, [
    "2\t## set up",
    "3-3\tconst\tout,n\tconst out = [], n = 2;",
    "4\t## a block",
    "6-8\tfunction\thelper\tfunction helper(x) { return x; }",
    "10\t## loop it",
    "11-11\tfor\t-\tfor (let i = 0; i < n; i++) out.push(helper(i));",
    "12-12\tvar\tv\tvar v = 1;",
    "13-15\tif\t-\tif (a) { out.push(a); }",
    "16-16\treturn\t-\treturn out;",
  ]);
  const cli = spawnSync(process.execPath, [TOOL, "--file", ws.t, "--fn", "run", "--outline"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.trim().split("\n").length, 9);
  assert.equal(outlineFunction({ file: ws.t, fn: "nope" }).ok, false);
}));

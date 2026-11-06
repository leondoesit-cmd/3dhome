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

test("refuses a hoisted function the code calls before the block when it reads a local of the function", () => refused(`
export function run(a) {
  const log = [hoisted(a)];
  function hoisted(x) { return x + a; }
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

// ---- --box -------------------------------------------------------------------------------
function box(ws, names, extra = {}) {
  return extractBlock({ file: ws.t, fn: "run", box: names, ...extra });
}

async function boxRefused(source, names, pattern, extra = {}) {
  await withFixture(source, async (ws) => {
    const before = ws.read();
    const r = box(ws, names, extra);
    assert.equal(r.ok, false, r.report);
    assert.equal(r.written, false);
    assert.match(r.errors.join("\n"), pattern);
    assert.equal(ws.read(), before, "a refusal must not touch the file");
  });
}

test("--box a var reassigned in closures, then lift a block using it: lifted code and outer code share the value", () => withFixture(`
export function run(n) {
  var count = 0;
  let label = "start";
  const bump = () => { count += 1; label = label + "+"; };
  bump();
  const log = [];
  log.push(count, label);
  const twice = () => { bump(); bump(); count++; return count; };
  log.push(twice());
  log.push(count, label);
  return log;
}
`, async (ws) => {
  const r = box(ws, "count,label", { lines: range(ws.text, "const twice", "log.push(twice());"), name: "lifted" });
  assert.equal(r.ok, true, r.report);
  assert.equal(r.written, true);
  assert.deepEqual(r.params, ["bump", "runLocals", "log"]);
  assert.equal(r.box.holder, "runLocals");
  assert.equal(r.box.perName.count.assigned, 1);
  assert.match(r.report, /box sites rewritten: /);
  const out = ws.read();
  assert.match(out, /const runLocals = \{ count: undefined, label: undefined \};/);
  assert.match(out, /runLocals\.count = 0;/);
  assert.match(out, /function lifted\(bump, runLocals, log\)/);
  assert.equal(/\bvar count\b|\blet label\b/.test(out), false);
  assert.deepEqual(await sameBehaviour(ws, [1]), [1, "start+", 4, 4, "start+++"]);
}));

test("--box splits a multi-declarator statement and removes an initialiser-less declaration", () => withFixture(`
export function run(n) {
  var a = n + 1, x = n * 2, b = a + x, y;
  var c;
  const get = () => [a, x, b, c, y];
  c = 7;
  y = 9;
  return get();
}
`, async (ws) => {
  const r = box(ws, "a,b,c");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.box.sites.removed, 1);
  assert.equal(r.box.sites.assigned, 2);
  const out = ws.read();
  assert.match(out, /runLocals\.a = n \+ 1;\n  var x = n \* 2;\n  runLocals\.b = runLocals\.a \+ x;\n  var y;/);
  assert.equal(/var c;/.test(out), false);
  assert.deepEqual(await sameBehaviour(ws, [3]), [4, 6, 10, 7, 9]);
}));

test("--box leaves a shadowing inner declaration, param, catch binding and property key alone", () => withFixture(`
export function run(n) {
  var a = n;
  const o = { a: 1 };
  const out = [a, o.a];
  {
    const a = "block";
    out.push(a);
  }
  const f = (a) => a * 2;
  out.push(f(5));
  function g() { var a = "inner var"; return a; }
  out.push(g());
  try { throw 3; } catch (a) { out.push(a); }
  const h = () => a + 100;
  a = a + 1;
  out.push(h());
  return out;
}
`, async (ws) => {
  const r = box(ws, "a");
  assert.equal(r.ok, true, r.report);
  const out = ws.read();
  assert.match(out, /const a = "block";\n    out\.push\(a\);/);
  assert.match(out, /const f = \(a\) => a \* 2;/);
  assert.match(out, /var a = "inner var"; return a;/);
  assert.match(out, /catch \(a\) \{ out\.push\(a\); \}/);
  assert.match(out, /const o = \{ a: 1 \};/);
  assert.match(out, /\[runLocals\.a, o\.a\]/);
  assert.match(out, /runLocals\.a = runLocals\.a \+ 1;/);
  assert.deepEqual(await sameBehaviour(ws, [4]), [4, 1, "block", 10, "inner var", 3, 105]);
}));

test("--box rewrites destructuring targets, for-of / for-in targets, update targets and typeof", () => withFixture(`
export function run(xs) {
  var a, b, k;
  let m = 0;
  [a, b] = xs;
  ({ p: a = 100, q: [b] = [5] } = { p: undefined });
  const seen = [];
  for (a of xs) seen.push(a);
  for (k in { u: 1, v: 2 }) seen.push(k);
  m++;
  --m;
  m += 3;
  const t = [typeof m, typeof nothingDeclared, a, b, k, m];
  return [seen, t];
}
`, async (ws) => {
  const r = box(ws, "a,b,k,m");
  assert.equal(r.ok, true, r.report);
  const out = ws.read();
  assert.match(out, /\[runLocals\.a, runLocals\.b\] = xs;/);
  assert.match(out, /for \(runLocals\.a of xs\)/);
  assert.match(out, /for \(runLocals\.k in /);
  assert.match(out, /typeof runLocals\.m/);
  assert.match(out, /runLocals\.m\+\+;/);
  assert.deepEqual(await sameBehaviour(ws, [[1, 2, 3]]), [[1, 2, 3, "u", "v"], ["number", "undefined", 3, 5, "v", 3]]);
}));

test("--box rewrites shorthand properties and shorthand in destructuring patterns", () => withFixture(`
export function run(n) {
  var a = n, b = 2;
  const obj = { a, b, c: a + b };
  ({ a, b = 50 } = { a: 10 });
  const after = { a, b };
  const fn = () => ({ a });
  return [obj, after, fn()];
}
`, async (ws) => {
  const r = box(ws, "a,b");
  assert.equal(r.ok, true, r.report);
  const out = ws.read();
  assert.match(out, /\{ a: runLocals\.a, b: runLocals\.b, c: runLocals\.a \+ runLocals\.b \}/);
  assert.match(out, /\(\{ a: runLocals\.a, b: runLocals\.b = 50 \} = /);
  assert.match(out, /\(\{ a: runLocals\.a \}\)/);
  assert.deepEqual(await sameBehaviour(ws, [7]), [{ a: 7, b: 2, c: 9 }, { a: 10, b: 50 }, { a: 10 }]);
}));

test("--box refuses a holder name that is already used (default and explicit), and honours --holder", async () => {
  await boxRefused(`
const runLocals = 1;
export function run(n) {
  var a = n;
  return [a, runLocals];
}
`, "a", /holder name runLocals is already used in the module/);
  await boxRefused(`
export function run(n) {
  var a = n;
  var box = 1;
  return [a, box];
}
`, "a", /holder name box is already used/, { holder: "box" });
  await withFixture(`
export function run(n) {
  var a = n;
  return () => a;
}
`, async (ws) => {
    const r = box(ws, "a", { holder: "H" });
    assert.equal(r.ok, true, r.report);
    assert.match(ws.read(), /const H = \{ a: undefined \};/);
    assert.equal((await ws.load(ws.t)).run(5)(), 5);
  });
});

test("--box refuses params, consts, functions, destructured and for-head declarations, double declarations, unknown names, eval", async () => {
  await boxRefused(`
export function run(a) {
  return () => a;
}
`, "a", /a is a param of run/);
  await boxRefused(`
export function run(n) {
  const c = n;
  return () => c;
}
`, "c", /line 2: c is a const/);
  await boxRefused(`
export function run(n) {
  function f() { return n; }
  return f;
}
`, "f", /f is a function declaration in run, not var\/let/);
  await boxRefused(`
export function run(n) {
  var [d] = [n];
  return () => d;
}
`, "d", /line 2: d is declared by a destructuring pattern/);
  await boxRefused(`
export function run(n) {
  const out = [];
  for (var i = 0; i < n; i++) out.push(i);
  return out;
}
`, "i", /line 3: i is declared in a for-loop head/);
  await boxRefused(`
export function run(n) {
  var v = 1;
  var v = 2;
  return () => v;
}
`, "v", /v is declared 2 times in run/);
  await boxRefused(`
export function run(n) {
  if (n) { let inner = 1; return inner; }
  return n;
}
`, "inner", /inner is not declared with var\/let in the body of run/);
  await boxRefused(`
export function run(n) {
  var v = 1;
  return eval("v");
}
`, "v", /run uses eval/);
});

test("--box alone rewrites in place (directive, comment, unbraced declaration), --dry writes nothing, the CLI reports the sites", () => withFixture(`
export function run(n) {
  "use strict";
  // counter
  var count = n;
  if (n) var maybe = 1, other = 2;
  const inc = () => ++count;
  inc();
  return [count, maybe, other];
}
`, async (ws) => {
  const before = ws.read();
  const dry = box(ws, ["count", "maybe"], { dry: true });
  assert.equal(dry.ok, true, dry.report);
  assert.equal(dry.written, false);
  assert.equal(ws.read(), before);
  const cli = spawnSync(process.execPath, [TOOL, "--file", ws.t, "--fn", "run", "--box", "count,maybe", "--holder", "st"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /box sites rewritten: 5/);
  const out = ws.read();
  assert.match(out, /"use strict";\n  const st = \{ count: undefined, maybe: undefined \};\n  \/\/ counter/);
  assert.match(out, /if \(n\) \{ st\.maybe = 1; var other = 2; \}/);
  const a = await ws.load(ws.orig), b = await ws.load(ws.t);
  assert.deepEqual(b.run(0), a.run(0));
  assert.deepEqual(b.run(3), a.run(3));
  const noName = spawnSync(process.execPath, [TOOL, "--file", ws.t, "--fn", "run", "--name", "x"], { encoding: "utf8" });
  assert.notEqual(noName.status, 0);
}));

// ---- pure function declarations ----------------------------------------------------------
test("a block of pure function declarations used before it is lifted to module level, verbatim", () => withFixture(`
const SCALE = 3;
function outerHelper(x) { return x + SCALE; }
export function run(a) {
  const log = [early(a)];
  // doubles then adds
  function early(x) {
    return outerHelper(x) * 2 + later(1);
  }

  function later(y) { return y + Math.abs(-2) + SCALE; }
  log.push(early(2), later(a));
  const local = a + 1;
  log.push(local);
  return log;
}
`, async (ws) => {
  const r = extractBlock({ file: ws.t, fn: "run", lines: range(ws.text, "// doubles then adds", "function later") });
  assert.equal(r.ok, true, r.report);
  assert.equal(r.written, true);
  assert.equal(r.pure, true);
  assert.deepEqual(r.functions, ["early", "later"]);
  assert.deepEqual(r.params, []);
  const out = ws.read();
  const runText = out.slice(out.indexOf("export function run"), out.indexOf("// lifted out of run()"));
  assert.equal(/function early|function later/.test(runText), false);
  assert.match(out, /\/\/ lifted out of run\(\)\n  \/\/ doubles then adds\n  function early\(x\) \{\n    return outerHelper\(x\) \* 2 \+ later\(1\);\n  \}\n\n  function later\(y\)/);
  assert.match(r.report, /pure functions lifted verbatim \(2\): early, later/);
  const log = await sameBehaviour(ws, [4]);
  assert.equal(log.length, 4);
}));

test("a pure function block with a given --name and no earlier use keeps the single-function lift", () => withFixture(`
export function run(a) {
  const log = [];
  function twice(x) { return x * 2; }
  log.push(twice(a));
  return log;
}
`, async (ws) => {
  const r = lift(ws, "function twice", "function twice");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.pure, undefined);
  assert.deepEqual(r.returned, ["twice"]);
  await sameBehaviour(ws, [4]);
}));

test("a function that uses a local of the function is not pure: refused, with or without --name", () => withFixture(`
export function run(a) {
  const k = a + 1;
  const log = [add(1)];
  function add(x) { return x + k; }
  log.push(add(2));
  return log;
}
`, async (ws) => {
  const before = ws.read();
  const named = lift(ws, "function add", "function add");
  assert.equal(named.ok, false);
  assert.match(named.errors.join("\n"), /add is declared by the block \(function\) but used before it \(hoisting\)/);
  const unnamed = extractBlock({ file: ws.t, fn: "run", lines: range(ws.text, "function add", "function add") });
  assert.equal(unnamed.ok, false);
  assert.match(unnamed.errors.join("\n"), /not pure, so --name is needed/);
  assert.match(unnamed.errors.join("\n"), /line 4: uses k, a binding of run/);
  assert.equal(ws.read(), before);
}));

test("a pure function block is refused when a name exists at module level, is a platform global, or is reassigned", async () => {
  await refused(`
function early() { return 0; }
export function run(a) {
  const log = [early()];
  function early() { return 1; }
  return log;
}
`, "function early() { return 1", "function early() { return 1", /early already exists in the module/, { name: undefined });
  await refused(`
export function run(a) {
  const log = [parseInt(a)];
  function parseInt(x) { return x + 1; }
  return log;
}
`, "function parseInt", "function parseInt", /parseInt already exists in the module/, { name: undefined });
  await refused(`
export function run(a) {
  const log = [f(a)];
  function f(x) { return x + 1; }
  f = null;
  return log;
}
`, "function f", "function f", /not pure, so --name is needed/, { name: undefined });
});

// ---- --holder-scope module / --box-for -----------------------------------------------------
function boxFor(ws, from, to, extra = {}) {
  return extractBlock({ file: ws.t, fn: "run", holderScope: "module", boxFor: range(ws.read(), from, to), ...extra });
}

async function boxForRefused(source, from, to, pattern, extra = {}) {
  await withFixture(source, async (ws) => {
    const before = ws.read();
    const r = boxFor(ws, from, to, extra);
    assert.equal(r.ok, false, r.report);
    assert.equal(r.written, false);
    assert.match(r.errors.join("\n"), pattern);
    assert.equal(ws.read(), before, "a refusal must not touch the file");
  });
}

const count = (text, re) => (text.match(re) || []).length;

test("--box-for lifts a block whose closures read and write outer locals; a second run with another range reuses the holder", () => withFixture(`
export function run(n) {
  var total = n;
  let label = "a";
  const bump = (d) => { total += d; };
  // block one
  const addTwice = (d) => { bump(d); bump(d); label += "!"; };
  addTwice(2);
  // block two
  const report = () => [total, label];
  total += 100;
  const log = [report()];
  log.push(addTwice(1) ?? report());
  return log;
}
`, async (ws) => {
  const one = boxFor(ws, "const addTwice", "addTwice(2);", { name: "blockOne" });
  assert.equal(one.ok, true, one.report);
  assert.deepEqual(one.params, []);
  assert.deepEqual(one.returned, []);
  assert.deepEqual(one.box.names, ["label", "bump", "addTwice"]);
  assert.equal(one.box.reused, false);
  let out = ws.read();
  assert.match(out, /^const runLocals = \{ label: undefined, bump: undefined, addTwice: undefined \};\n\nexport function run\(n\) \{/);
  assert.match(out, /function blockOne\(\) \{/);
  assert.match(out, /\n  blockOne\(\);\n/);
  await sameBehaviour(ws, [2]);
  const two = boxFor(ws, "const report", "const log = [report()];", { name: "blockTwo" });
  assert.equal(two.ok, true, two.report);
  assert.equal(two.box.reused, true);
  assert.deepEqual(two.box.names, ["total", "report", "log"]);
  assert.match(two.report, /reusing a holder with 3 name\(s\)/);
  out = ws.read();
  assert.equal(count(out, /const runLocals = /g), 1, "one holder only");
  assert.match(out, /const runLocals = \{\s*label: undefined,\s+bump: undefined,\s+addTwice: undefined,\s+total: undefined/);
  assert.ok(out.indexOf("label: undefined") < out.indexOf("bump: undefined") && out.indexOf("bump: undefined") < out.indexOf("addTwice: undefined"), "existing order kept");
  assert.match(out, /function blockTwo\(\) \{/);
  for (const arg of [0, 2, 5]) {
    const a = await ws.load(ws.orig), b = await ws.load(ws.t);
    assert.deepEqual(b.run(arg), a.run(arg));
  }
}));

test("--box-for boxes a function declaration the block uses (declaration stays, holder is set first) and the earlier code keeps working", () => withFixture(`
export function run(n) {
  const out = [];
  out.push(helper(n));
  var factor = n * 2;
  function helper(x) { return x + factor; }
  // block
  const mark = (v) => out.push(helper(v));
  mark(1);
  return out;
}
`, async (ws) => {
  const r = boxFor(ws, "const mark", "mark(1);", { name: "blk" });
  assert.equal(r.ok, true, r.report);
  assert.deepEqual(r.box.names, ["out", "helper"]);
  const out = ws.read();
  assert.match(out, /export function run\(n\) \{\n  runLocals\.helper = helper;\n  runLocals\.out = \[\];\n  runLocals\.out\.push\(runLocals\.helper\(n\)\);/);
  assert.match(out, /function helper\(x\) \{ return x \+ factor; \}/);
  assert.match(r.report, /1 function assignments added/);
  for (const arg of [1, 6]) {
    const a = await ws.load(ws.orig), b = await ws.load(ws.t);
    assert.deepEqual(b.run(arg), a.run(arg));
  }
}));

test("--holder-scope module boxes a const and a destructuring declaration, splitting a mixed statement", () => withFixture(`
const pair = (k) => ({ lo: k, hi: k + 1 });
export function run(n) {
  const base = n * 2, extra = 5;
  const { lo, hi: top } = pair(base);
  const add = (x) => x + base + extra + lo + top;
  return [add(1), base, lo, top];
}
`, async (ws) => {
  const r = extractBlock({ file: ws.t, fn: "run", holderScope: "module", box: "base,lo,top" });
  assert.equal(r.ok, true, r.report);
  const out = ws.read();
  assert.match(out, /^const pair = .*\nconst runLocals = \{ base: undefined, lo: undefined, top: undefined \};\n\nexport function run/);
  assert.match(out, /runLocals\.base = n \* 2;\n  const extra = 5;/);
  assert.match(out, /\(\{ lo: runLocals\.lo, hi: runLocals\.top \} = pair\(runLocals\.base\)\);/);
  await sameBehaviour(ws, [3]);
  // a partly boxed destructuring declaration stays refused
  const ws2 = workspace(`
export function run(n) {
  const { a, b } = { a: n, b: 2 };
  return () => a + b;
}
`);
  try {
    const bad = extractBlock({ file: ws2.t, fn: "run", holderScope: "module", box: "a" });
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join("\n"), /also declares b; box all of its names or none/);
  } finally { ws2.done(); }
}));

test("--box-for: a pure function block called before it (hoisting) now resolves through the module; one that reads a mutable local boxes it", () => withFixture(`
export function run(a) {
  var k = a + 1;
  const log = [early(a)];
  function early(x) { return x + k; }
  k = k + 10;
  log.push(early(2));
  return log;
}
`, async (ws) => {
  const r = boxFor(ws, "function early", "function early");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.pure, true);
  assert.deepEqual(r.functions, ["early"]);
  assert.deepEqual(r.box.names, ["k"]);
  const out = ws.read();
  assert.match(out, /\n\/\/ lifted out of run\(\)\n  function early\(x\) \{ return x \+ runLocals\.k; \}\n/);
  assert.match(out, /runLocals\.k = runLocals\.k \+ 10;/);
  for (const arg of [3, 9]) {
    const a = await ws.load(ws.orig), b = await ws.load(ws.t);
    assert.deepEqual(b.run(arg), a.run(arg));
  }
}));

test("--box-for on a function-only block that needs nothing is the plain pure lift", () => withFixture(`
export function run(a) {
  const log = [early(a)];
  function early(x) { return x + 1; }
  log.push(early(2));
  return log;
}
`, async (ws) => {
  const r = boxFor(ws, "function early", "function early");
  assert.equal(r.ok, true, r.report);
  assert.equal(r.pure, true);
  assert.deepEqual(r.box.names, []);
  assert.equal(/runLocals/.test(ws.read()), false);
  await sameBehaviour(ws, [4]);
}));

test("--box-for boxes a function the block declares and later code uses (assignment first in the lifted body); used before is refused", async () => {
  await withFixture(`
export function run(a) {
  const log = [a];
  // block
  var seed = log.length + 7;
  function mk(x) { return x + seed; }
  log.push(mk(1));
  // after
  log.push(mk(2), seed);
  return log;
}
`, async (ws) => {
    const r = boxFor(ws, "var seed", "log.push(mk(1));", { name: "blk" });
    assert.equal(r.ok, true, r.report);
    assert.deepEqual(r.box.names, ["log", "seed", "mk"]);
    assert.match(ws.read(), /function blk\(\) \{\n  \/\/ block\n  runLocals\.mk = mk;\n/);
    for (const arg of [2, 5]) {
      const a = await ws.load(ws.orig), b = await ws.load(ws.t);
      assert.deepEqual(b.run(arg), a.run(arg));
    }
  });
  await boxForRefused(`
export function run(a) {
  const log = [mk(a)];
  // block
  var seed = log.length * 3;
  function mk(x) { return x + (seed || 0); }
  log.push(mk(1));
  return log;
}
`, "var seed", "log.push(mk(1));", /mk is a function declared by the block but used before it/, { name: "blk" });
});

test("--box-for refuses params, classes, return/this/await in the block, and a block-name that needs --name", async () => {
  await boxForRefused(`
export function run(a) {
  const out = [];
  out.push(a);
  return out;
}
`, "out.push(a);", "out.push(a);", /a is a param of run/, { name: "blk" });
  await boxForRefused(`
export function run(a) {
  class K { get() { return 1; } }
  const out = [new K().get()];
  return out;
}
`, "const out", "const out", /K is a class declaration; classes cannot be boxed/, { name: "blk" });
  await boxForRefused(`
export function run(a) {
  const out = [];
  if (a) return out;
  return out;
}
`, "if (a)", "if (a)", /the block contains `return`/, { name: "blk" });
  await boxForRefused(`
export async function run(a) {
  const out = [];
  out.push(await a);
  return out;
}
`, "out.push(await a);", "out.push(await a);", /the block contains `await`/, { name: "blk" });
  await boxForRefused(`
export function run(a) {
  var out = [];
  var b = a;
  out.push(b);
  return out;
}
`, "out.push(b);", "out.push(b);", /need --name/);
});

test("--holder-scope module reuses only a plain const object literal; --box of an already boxed name is reported, not redone", async () => {
  await boxRefused(`
const runLocals = makeIt();
function makeIt() { return {}; }
export function run(n) {
  var a = n;
  return () => a;
}
`, "a", /runLocals exists at module level but is not a const plain object literal/, { holderScope: "module" });
  await withFixture(`
const runLocals = { first: undefined };
export function run(n) {
  runLocals.first = n;
  var a = n + 1;
  return () => [runLocals.first, a];
}
`, async (ws) => {
    const r = extractBlock({ file: ws.t, fn: "run", holderScope: "module", box: "first,a" });
    assert.equal(r.ok, true, r.report);
    assert.deepEqual(r.box.names, ["a"]);
    assert.deepEqual(r.box.already, ["first"]);
    assert.match(r.report, /already boxed \(1\): first/);
    assert.match(ws.read(), /const runLocals = \{ first: undefined, a: undefined \};/);
    assert.deepEqual((await ws.load(ws.t)).run(4)(), (await ws.load(ws.orig)).run(4)());
  });
});

test("the CLI takes --holder-scope, --holder and --box-for; --box-for needs module scope and excludes --lines", () => withFixture(`
export function run(n) {
  const out = [];
  const m = 2;
  out.push(m);
  out.push(m + 1);
  return [n, out];
}
`, async (ws) => {
  const spec = range(ws.text, "out.push(m);", "out.push(m + 1);");
  const base = ["--file", ws.t, "--fn", "run"];
  const dry = spawnSync(process.execPath, [TOOL, ...base, "--holder-scope", "module", "--holder", "st", "--box-for", spec, "--name", "blk", "--dry"], { encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /box: 2 new name\(s\) -> st \(module scope, new holder\): out, m/);
  assert.equal(ws.read(), ws.text);
  const noScope = spawnSync(process.execPath, [TOOL, ...base, "--box-for", spec, "--name", "blk"], { encoding: "utf8" });
  assert.notEqual(noScope.status, 0);
  assert.match(noScope.stderr, /--box-for needs --holder-scope module/);
  const both = spawnSync(process.execPath, [TOOL, ...base, "--holder-scope", "module", "--box-for", spec, "--lines", spec, "--name", "blk"], { encoding: "utf8" });
  assert.notEqual(both.status, 0);
  assert.match(both.stderr, /give one of them/);
}));

// tools/split_dispatch.mjs splits a function's last if / else-if chain into one function per
// action domain. Each test writes a fixture dispatcher to a temp dir, runs the tool on a copy,
// then IMPORTS the original and the split module and compares what every action does: the
// side effects it leaves in `log` and the value (or error) it returns. Refusals are checked by
// the reasons listed and by the file staying byte-identical.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { analyzeDispatch, splitDispatch } from "../tools/split_dispatch.mjs";

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "split_dispatch.mjs");
let counter = 0;

function workspace(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "split-dispatch-"));
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

async function withFixture(source, fn) {
  const ws = workspace(source);
  try { await fn(ws); } finally { ws.done(); }
}

const split = (ws, groups, extra = {}) => splitDispatch({ file: ws.t, fn: "run", groups, ...extra });

// run every action with every event on both modules; the observable behaviour must be identical
async function sameBehaviour(ws, acts, evs = [undefined], { thisArg = null } = {}) {
  const a = await ws.load(ws.orig), b = await ws.load(ws.t);
  const observe = async (mod, act, ev) => {
    mod.log.length = 0;
    let ret, err;
    try { ret = await (thisArg ? mod.run.call(thisArg(mod), act, ev) : mod.run(act, ev)); } catch (e) { err = String(e); }
    return { ret, err, log: [...mod.log] };
  };
  let n = 0;
  for (const act of acts) for (const ev of evs) {
    assert.deepEqual(await observe(b, act, ev), await observe(a, act, ev), `act=${JSON.stringify(act)} ev=${JSON.stringify(ev)}`);
    n++;
  }
  return n;
}

function refused(ws, r, ...needles) {
  assert.equal(r.ok, false, r.report);
  assert.equal(r.written, false);
  assert.equal(ws.read(), ws.text, "a refusal must leave the file byte-identical");
  for (const needle of needles) assert.ok(r.reasons.some((m) => m.includes(needle)), `no reason mentions ${JSON.stringify(needle)}:\n${r.reasons.join("\n")}`);
}

function topFunctions(text) {
  const ast = acorn.parse(text, { ecmaVersion: "latest", sourceType: "module" });
  return ast.body.map((s) => (s.declaration || s)).filter((s) => s.type === "FunctionDeclaration").map((s) => s.id.name);
}

const BIG = `
export const log = [];
const note = (...a) => log.push(a.join(":"));
export async function run(act, ev) {
  if (ev && ev.deny) {
    note("denied");
    return "denied";
  }
  if (act === "alpha") {
    note("alpha");
    return 1;
  } else if (act === "beta") note("beta", ev && ev.x);
  else if (act === "gamma" || act === "delta") { // both
    note(act);
    await Promise.resolve();
    if (ev && ev.early) return "early-" + act;
    note("after-await");
  } else if (act === "eps") {
    if (ev && ev.deep) note("deep");
  } else if (act === "zeta") {
    note("zeta"); // trailing comment
  }
  // a comment before theta
  else if (act === "theta" && ev && ev.ok) {
    note("theta-ok");
    return "ok";
  } else if (act === "theta") {
    note("theta-fallback");
  } else if (["iota", "kappa"].indexOf(act) !== -1) note("ik", act);
  else if (act && act.indexOf("rot") === 0) note("rot", act.slice(3));
}
`;
const ACTS = ["alpha", "beta", "gamma", "delta", "eps", "zeta", "theta", "iota", "kappa", "rot90", "rotZ", "rot", "nope", "", undefined, "constructor", "toString"];
const EVS = [undefined, {}, { deny: true }, { x: 7 }, { early: true }, { ok: true }, { deep: true }];

test("async dispatcher with early returns, || and guarded branches, list tests and a kept prefix branch", () => withFixture(BIG, async (ws) => {
  const r = split(ws, {
    runA: ["alpha", "beta", "gamma", "delta"],
    runB: ["eps", "zeta", "theta", "iota", "kappa"],
  });
  assert.equal(r.ok, true, r.report);
  assert.equal(r.written, true);
  assert.equal(r.kept, 1);
  assert.deepEqual(r.groups.map((g) => [g.name, g.branches]), [["runA", 3], ["runB", 5]]);
  assert.deepEqual(topFunctions(ws.read()), ["run", "runA", "runB"]);
  assert.ok(!ws.read().includes("\r"), "LF");
  assert.equal(await sameBehaviour(ws, ACTS, EVS), ACTS.length * EVS.length);
  // the dispatcher is now short and the domain functions are async
  const text = ws.read();
  assert.match(text, /async function runA\(act, ev\) \{/);
  assert.match(text, /const RUN_A_ACTIONS = new Set\(\["alpha", "beta", "gamma", "delta"\]\);/);
  assert.match(text, /if \(RUN_A_ACTIONS\.has\(act\)\) return runA\(act, ev\);/);
  // comments travel with their branch
  const comments = [];
  acorn.parse(text, { ecmaVersion: "latest", sourceType: "module", onComment: comments });
  const inside = (name) => {
    const ast = acorn.parse(text, { ecmaVersion: "latest", sourceType: "module" });
    const f = ast.body.map((s) => s.declaration || s).find((s) => s.type === "FunctionDeclaration" && s.id.name === name);
    return comments.filter((c) => c.start > f.start && c.end < f.end).map((c) => c.value.trim());
  };
  assert.ok(inside("runA").includes("both"));
  assert.ok(inside("runB").includes("trailing comment"));
  assert.ok(inside("runB").includes("a comment before theta"));
  assert.ok(!inside("run").includes("both"), "the dispatcher keeps no branch comments");
}));

test("groups that interleave keep each branch order inside the group and order the dispatch by first appearance", () => withFixture(BIG, async (ws) => {
  const r = split(ws, {
    second: ["beta", "eps", "zeta", "iota", "kappa"],
    first: ["alpha", "gamma", "delta", "theta"],
  });
  assert.equal(r.ok, true, r.report);
  // alpha comes first in the chain, so `first` is dispatched first whatever the json order
  const lines = ws.read().split("\n").filter((l) => /_ACTIONS\.has\(act\)\) return/.test(l)).map((l) => l.trim().split(" ")[1]);
  assert.deepEqual(lines, ["(FIRST_ACTIONS.has(act))", "(SECOND_ACTIONS.has(act))"].map((s) => s));
  await sameBehaviour(ws, ACTS, EVS);
  // inside `first`, theta's guarded branch still precedes its unguarded twin
  const text = ws.read();
  assert.ok(text.indexOf("theta-ok") < text.indexOf("theta-fallback"));
}));

test("a synchronous dispatcher keeps a final else as the fallback", () => withFixture(`
export const log = [];
export function run(act, ev) {
  log.push("start");
  if (act === "a") { log.push("a"); return "A"; }
  else if (act === "b") log.push("b");
  else if (act === "c" || act === "d") log.push(act);
  else { log.push("default", act); return "D"; }
}
`, async (ws) => {
  const r = split(ws, { g1: ["a", "c", "d"], g2: ["b"] });
  assert.equal(r.ok, true, r.report);
  assert.equal(r.hasElse, true);
  assert.doesNotMatch(ws.read(), /async/);
  assert.equal(await sameBehaviour(ws, ["a", "b", "c", "d", "e", undefined, "toString"]), 7);
}));

test("a final else after guarded branches is refused (a failed guard falls into it)", () => withFixture(`
export const log = [];
export function run(act, ev) {
  if (act === "a" && ev) { log.push("a"); }
  else { log.push("default"); }
}
`, async (ws) => {
  refused(ws, split(ws, { g: ["a"] }), "final else");
}));

test("pre-chain const / function locals are passed as extra parameters; a let local is refused", () => withFixture(`
export const log = [];
const LIMIT = 3;
function helper(x) { return x * 2; }
export async function run(act, ev) {
  const base = LIMIT + 1;
  function twice(x) { return helper(x) * 2; }
  if (act === "p") { log.push(base); }
  else if (act === "q") { log.push(twice(2), helper(1)); }
  else if (act === "r") log.push("r");
}
`, async (ws) => {
  const r = split(ws, { gp: ["p", "q"], gr: ["r"] });
  assert.equal(r.ok, true, r.report);
  assert.deepEqual(r.groups.map((g) => g.params), [["act", "ev", "base", "twice"], ["act", "ev"]]);
  assert.match(r.report, /extra parameters passed from run: base, twice/);
  assert.match(ws.read(), /return gp\(act, ev, base, twice\);/);
  await sameBehaviour(ws, ["p", "q", "r", "z"]);
}));

test("a let local used by a branch is refused", () => withFixture(`
export const log = [];
export function run(act) {
  let counter = 0;
  if (act === "p") { counter++; log.push(counter); }
  else if (act === "q") log.push(counter);
}
`, async (ws) => {
  refused(ws, split(ws, { g: ["p", "q"] }), "counter", "let");
}));

test("an opaque test before a literal is refused; $names declares what it can match; after the literals it stays in place", () => withFixture(`
export const log = [];
const TABLE = { x1: 1, x2: 2 };
export function run(act) {
  if (act === "a") log.push("a");
  else if (TABLE[act]) log.push("table", act);
  else if (act === "b") log.push("b");
}
`, async (ws) => {
  refused(ws, split(ws, { g: ["a", "b"] }), "non-literal test", "$names");
  // declared: the table can only be true for x1 / x2
  const r = split(ws, { g1: ["a", "b"], g2: ["x1", "x2"], $names: { "TABLE[act]": ["x1", "x2"] } });
  assert.equal(r.ok, true, r.report);
  assert.match(r.report, /assumed \(from \$names\)/);
  await sameBehaviour(ws, ["a", "b", "x1", "x2", "other", undefined]);
}));

test("$names that match no branch are refused", () => withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") log.push("a");
}
`, async (ws) => {
  refused(ws, split(ws, { g: ["a"], $names: { "nothing(act)": ["z"] } }), "matches no non-literal branch");
}));

test("an opaque test after every literal is kept in place, in order", () => withFixture(`
export const log = [];
const TABLE = { x1: 1 };
export function run(act) {
  if (act === "a") log.push("a");
  else if (act === "b") { log.push("b"); return 2; }
  else if (TABLE[act]) log.push("table", act);
  else if (act && act.startsWith("zz")) log.push("zz");
}
`, async (ws) => {
  const r = split(ws, { g1: ["a"], g2: ["b"] });
  assert.equal(r.ok, true, r.report);
  assert.equal(r.kept, 2);
  await sameBehaviour(ws, ["a", "b", "x1", "zz1", "zz", "toString", undefined]);
}));

test("a prefix test that could match a later literal is refused, one that cannot is kept", () => withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") log.push("a");
  else if (act && act.indexOf("zz") === 0) log.push("zz", act);
  else if (act === "zzb") log.push("zzb");
}
`, async (ws) => {
  refused(ws, split(ws, { g: ["a", "zzb"] }), "prefix test", "zzb");
}));

test("a literal that follows an unguarded literal of the same name is dead and is kept as written", () => withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") log.push("a");
  else if (act === "b") log.push("b1");
  else if (act === "b") log.push("b2");
  else if (act === "c") log.push("c");
}
`, async (ws) => {
  const r = split(ws, { g1: ["a", "b"], g2: ["c"] });
  assert.equal(r.ok, true, r.report);
  await sameBehaviour(ws, ["a", "b", "c", "d"]);
}));

test("the guard cannot be hoisted: a test that evaluates something before the name check is not a name test", () => withFixture(`
export const log = [];
export function run(act, ev) {
  if (ev && act === "a") log.push("a");
  else if (act === "b") log.push("b");
}
`, async (ws) => {
  // the first test is "other" (a guard comes first), so it precedes the literal b and is refused
  refused(ws, split(ws, { g: ["b"] }), "non-literal test");
}));

test("indexOf / includes / startsWith forms are recognised", () => {
  const src = `
export function run(act, ev) {
  if ([ "a", "b" ].indexOf(act) >= 0) {}
  else if (["c"].indexOf(act) > -1 && ev) {}
  else if (["d"].includes(act)) {}
  else if (act && act.startsWith("p")) {}
  else if (act && act.indexOf("q") === 0 && ["qa", "qb"].indexOf(act) !== -1 && ev) {}
  else if ("e" === act) {}
  else if (act == "f") {}
  else if (ev && act === "g") {}
}
`.replace(/^\n/, "");
  const a = analyzeDispatch({ file: "x.mjs", src, fn: "run" });
  assert.equal(a.branches, 8);
  assert.equal(a.literal, 3);   // a|b, d, e
  assert.equal(a.guarded, 2);   // c (guard after), qa|qb (prefix then list then guard)
  assert.equal(a.prefix, 1);    // startsWith("p")
  assert.equal(a.other, 2);     // `act == "f"` is not strict equality; `ev && act === "g"` has a guard first
  assert.match(a.report, /8 branches/);
});

test("refusals: unlisted action, unknown action, an action in two groups, a || branch across groups", () => withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") log.push("a");
  else if (act === "b" || act === "c") log.push("bc");
  else if (act === "d") log.push("d");
}
`, async (ws) => {
  refused(ws, split(ws, { g: ["a", "b", "c"] }), "no group: d");
  refused(ws, split(ws, { g: ["a", "b", "c", "d", "zzz"] }), "no name branch: zzz");
  refused(ws, split(ws, { g1: ["a", "b", "c", "d"], g2: ["d"] }), "\"d\" is in both g1 and g2");
  refused(ws, split(ws, { g1: ["a", "b", "d"], g2: ["c"] }), "spans groups");
  refused(ws, split(ws, { "not an identifier": ["a", "b", "c", "d"] }), "not an identifier");
  refused(ws, split(ws, {}), "groups is empty");
}));

test("refusals: statements after the chain, a generator, a non-identifier parameter", () => {
  return Promise.all([
    withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") log.push("a");
  else if (act === "b") log.push("b");
  log.push("done");
}
`, async (ws) => refused(ws, split(ws, { g: ["a", "b"] }), "follow the chain")),
    withFixture(`
export function* run(act) {
  if (act === "a") yield 1;
}
`, async (ws) => refused(ws, split(ws, { g: ["a"] }), "generator")),
    withFixture(`
export function run({ act }) {
  if (act === "a") return 1;
}
`, async (ws) => refused(ws, split(ws, { g: ["a"] }), "plain identifier parameter")),
  ]);
});

test("refusals: arguments, eval, an assigned parameter, a var shared between branches", () => {
  return Promise.all([
    withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") log.push(arguments.length);
  else if (act === "b") log.push("b");
}
`, async (ws) => refused(ws, split(ws, { g: ["a", "b"] }), "arguments")),
    withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") log.push(eval("1"));
}
`, async (ws) => refused(ws, split(ws, { g: ["a"] }), "eval")),
    withFixture(`
export const log = [];
export function run(act, ev) {
  if (act === "a") { ev = 5; log.push(ev); }
}
`, async (ws) => refused(ws, split(ws, { g: ["a"] }), "assigns the parameter ev")),
    withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") { var shared = 1; log.push(shared); }
  else if (act === "b") { log.push(shared); }
}
`, async (ws) => refused(ws, split(ws, { g: ["a", "b"] }), "var declared by the branch")),
    withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") { var shared = 1; log.push(shared); }
  if (act === "z") log.push("z");
  log.push(typeof shared);
}
`, async (ws) => refused(ws, split(ws, { g: ["a", "z"] }), "follow the chain")),
  ]);
});

test("new names that already exist in the module are refused", () => withFixture(`
export const log = [];
function runA() {}
const RUN_B_ACTIONS = 1;
export function run(act) {
  if (act === "a") log.push("a");
  else if (act === "b") log.push("b");
}
`, async (ws) => {
  refused(ws, split(ws, { runA: ["a"], runB: ["b"] }), "runA already exists", "RUN_B_ACTIONS already exists");
}));

test("branch-level this is refused unless --allow-this, which keeps the receiver; this inside a nested function is its own", () => withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") { this.log.push("a"); }
  else if (act === "b") this.log.push("b");
  else if (act === "c") { const f = function () { return this; }; log.push(typeof f.call(5)); const g = () => this; log.push(g() === undefined ? "u" : "o"); }
}
`, async (ws) => {
  refused(ws, split(ws, { g: ["a", "b", "c"] }), "branch-level `this`");
  const r = split(ws, { g1: ["a", "c"], g2: ["b"] }, { allowThis: true });
  assert.equal(r.ok, true, r.report);
  assert.match(ws.read(), /return g1\.call\(this, act\);/);
  const a = await ws.load(ws.orig), b = await ws.load(ws.t);
  for (const act of ["a", "b", "c", "x"]) {
    const o1 = { log: [] }, o2 = { log: [] };
    a.run.call(o1, act); b.run.call(o2, act);
    assert.deepEqual(o2.log, o1.log, act);
  }
}));

test("a branch that is only an arrow-function this is not branch-level in a function that never uses it", () => withFixture(`
export const log = [];
export function run(act) {
  if (act === "a") { const f = function () { return this; }; log.push(typeof f()); }
  else if (act === "b") { const o = { m() { return this.v; }, v: 3 }; log.push(o.m()); }
}
`, async (ws) => {
  const r = split(ws, { g: ["a", "b"] });
  assert.equal(r.ok, true, r.report);
  await sameBehaviour(ws, ["a", "b"]);
}));

test("a branch body that is a lone `if` without else is wrapped so a following else cannot capture it", () => withFixture(`
export const log = [];
export function run(act, ev) {
  if (act === "a") if (ev) log.push("a-ev");
  else if (act === "b") log.push("b");
}
`, async (ws) => {
  // as written the second `else` binds to the inner if, so this chain has ONE branch plus an inner else-if
  const a = analyzeDispatch({ file: "x.mjs", src: ws.text, fn: "run" });
  assert.equal(a.branches, 1);
  const r = split(ws, { g: ["a"] });
  assert.equal(r.ok, true, r.report);
  await sameBehaviour(ws, ["a", "b", "c"], [undefined, {}, { x: 1 }]);
}));

test("a dispatched branch with an open-if body followed by another branch is wrapped in braces", () => withFixture(`
export const log = [];
export function run(act, ev) {
  if (act === "a") { if (ev) log.push("ev"); }
  else if (act === "b") if (ev) log.push("b-ev"); else log.push("b-no");
  else if (act === "c") log.push("c");
}
`, async (ws) => {
  const r = split(ws, { g1: ["a", "c"], g2: ["b"] });
  assert.equal(r.ok, true, r.report);
  await sameBehaviour(ws, ["a", "b", "c", "d"], [undefined, {}, { x: 1 }]);
}));

test("--dry reports the plan and writes nothing; a real run writes LF and survives CRLF input", () => withFixture(BIG.replace(/\n/g, "\r\n"), async (ws) => {
  const before = fs.readFileSync(ws.t);
  const dry = split(ws, { runA: ["alpha", "beta", "gamma", "delta"], runB: ["eps", "zeta", "theta", "iota", "kappa"] }, { dry: true });
  assert.equal(dry.ok, true, dry.report);
  assert.equal(dry.written, false);
  assert.ok(Buffer.compare(fs.readFileSync(ws.t), before) === 0);
  assert.match(dry.report, /dry run/);
  const r = split(ws, { runA: ["alpha", "beta", "gamma", "delta"], runB: ["eps", "zeta", "theta", "iota", "kappa"] });
  assert.equal(r.written, true);
  assert.ok(!ws.read().includes("\r"));
  fs.writeFileSync(ws.orig, BIG); // the LF twin of the CRLF original
  await sameBehaviour(ws, ACTS, EVS);
}));

test("CLI: --analyze prints the summary, --groups --dry exits 0, a refusal exits 1 and writes nothing", () => withFixture(BIG, async (ws) => {
  const groups = path.join(ws.dir, "groups.json");
  fs.writeFileSync(groups, JSON.stringify({ runA: ["alpha", "beta", "gamma", "delta"], runB: ["eps", "zeta", "theta", "iota", "kappa"] }));
  const an = spawnSync(process.execPath, [TOOL, "--file", ws.t, "--fn", "run", "--analyze"], { encoding: "utf8" });
  assert.equal(an.status, 0, an.stderr);
  assert.match(an.stdout, /\d+ branches: \d+ literal, \d+ guarded literal/);
  assert.match(an.stdout, /branch-level this: none/);
  assert.match(an.stdout, /after the chain: nothing/);
  assert.match(an.stdout, /suggested grouping by prefix/);
  const dry = spawnSync(process.execPath, [TOOL, "--file", ws.t, "--fn", "run", "--groups", groups, "--dry"], { encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr + dry.stdout);
  assert.equal(ws.read(), ws.text);
  fs.writeFileSync(groups, JSON.stringify({ runA: ["alpha"] }));
  const bad = spawnSync(process.execPath, [TOOL, "--file", ws.t, "--fn", "run", "--groups", groups], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /are in no group/);
  assert.equal(ws.read(), ws.text);
  const usage = spawnSync(process.execPath, [TOOL, "--file", ws.t], { encoding: "utf8" });
  assert.equal(usage.status, 2);
}));

// ---- review fixes ------------------------------------------------------------------------------
test("a generated function or Set name that the dispatcher's own scope already has is refused", () => {
  return Promise.all([
    // the parameter `runA` would intercept the call runA(act, runA)
    withFixture(`
export const log = [];
export function run(act, runA) {
  if (act === "a") log.push("a", typeof runA);
}
`, async (ws) => refused(ws, split(ws, { runA: ["a"] }), "runA")),
    // a local of that name would shadow the Set
    withFixture(`
export const log = [];
export function run(act) {
  const RUN_A_ACTIONS = new Set();
  if (act === "a") log.push("a");
}
`, async (ws) => refused(ws, split(ws, { runA: ["a"] }), "RUN_A_ACTIONS")),
    // a hoisted var in a block of the dispatcher
    withFixture(`
export const log = [];
export function run(act) {
  if (act === "zz") { var runA = 1; log.push(runA); }
  if (act === "a") log.push("a");
}
`, async (ws) => refused(ws, split(ws, { runA: ["a"] }), "runA")),
    // a module-level var declared inside a block is a module binding too
    withFixture(`
export const log = [];
if (true) { var runA = 1; }
export function run(act) {
  if (act === "a") log.push("a", runA);
}
`, async (ws) => refused(ws, split(ws, { runA: ["a"] }), "runA already exists")),
  ]);
});

test("a parameter written by a pre-chain closure is refused (the domain function would read a stale copy); nested writes count", () => {
  return Promise.all([
    withFixture(`
export const log = [];
export function run(act, ev) {
  function change() { act = "b"; }
  if (act === "a") { change(); log.push(act); }
  else if (act === "b") log.push("b");
}
`, async (ws) => {
      refused(ws, split(ws, { g: ["a", "b"] }), "assigns the parameter act");
      // the behaviour the refusal protects: the original logs "b" after calling change()
      const a = await ws.load(ws.orig);
      a.run("a");
      assert.deepEqual(a.log, ["b"]);
    }),
    withFixture(`
export const log = [];
export function run(act, ev) {
  const bump = () => { ev++; };
  if (act === "a") { bump(); log.push(ev); }
}
`, async (ws) => refused(ws, split(ws, { g: ["a"] }), "assigns the parameter ev")),
    withFixture(`
export const log = [];
export function run(act, ev) {
  for (ev of [1, 2]) log.push(ev);
  if (act === "a") log.push("a");
}
`, async (ws) => refused(ws, split(ws, { g: ["a"] }), "assigns the parameter ev")),
  ]);
});

test("a class's computed key with `this` is branch-level (refused, or kept with --allow-this); method bodies and field initialisers are not", () => {
  const COMPUTED = `
export const log = [];
export function run(act) {
  if (act === "a") {
    class C { [this.k]() { return "m"; } }
    log.push(new C().x());
  }
  else if (act === "b") log.push("b");
}
`;
  const FIELD = COMPUTED.replace(`[this.k]() { return "m"; }`, `[this.k] = 5;`).replace("new C().x()", "new C().x");
  const OWN = `
export const log = [];
export function run(act) {
  if (act === "a") { class D { m() { return this; } f = this; static s = 1; } log.push(typeof new D().m(), typeof new D().f, D.s); }
  else if (act === "b") log.push("b");
}
`;
  return Promise.all([
    withFixture(COMPUTED, async (ws) => {
      assert.equal(analyzeDispatch({ file: "x.mjs", src: ws.text, fn: "run" }).thisUses.length, 1);
      refused(ws, split(ws, { g: ["a", "b"] }), "branch-level `this`");
      const r = split(ws, { g: ["a", "b"] }, { allowThis: true });
      assert.equal(r.ok, true, r.report);
      const a = await ws.load(ws.orig), b = await ws.load(ws.t);
      for (const act of ["a", "b"]) {
        a.log.length = 0; b.log.length = 0;
        a.run.call({ k: "x" }, act); b.run.call({ k: "x" }, act);
        assert.deepEqual(b.log, a.log, act);
      }
    }),
    withFixture(FIELD, async (ws) => refused(ws, split(ws, { g: ["a", "b"] }), "branch-level `this`")),
    withFixture(OWN, async (ws) => {
      const r = split(ws, { g: ["a", "b"] });
      assert.equal(r.ok, true, r.report);
      await sameBehaviour(ws, ["a", "b"]);
    }),
  ]);
});

test("`act && act === \"\"` is not a plain name test: the empty name can fall through, so a final else is refused", () => withFixture(`
export const log = [];
export function run(act) {
  if (act && act === "") log.push("never");
  else log.push("default", JSON.stringify(act));
}
`, async (ws) => {
  const a = analyzeDispatch({ file: "x.mjs", src: ws.text, fn: "run" });
  assert.equal(a.literal, 0);
  assert.equal(a.guarded, 1);
  // as a plain name "" went through the Set, the branch failed, and the else (kept in run) was skipped
  refused(ws, split(ws, { g: [""] }), "final else");
  const o = await ws.load(ws.orig);
  o.run("");
  assert.deepEqual(o.log, ["default", "\"\""]);
}));

test("a plain `act === \"\"` is still a literal; a guarded empty name keeps later branches reachable inside its group", () => withFixture(`
export const log = [];
export function run(act) {
  if (act && act === "") log.push("never");
  else if (act === "") log.push("empty");
  else if (act === "a") log.push("a");
}
`, async (ws) => {
  const a = analyzeDispatch({ file: "x.mjs", src: ws.text, fn: "run" });
  assert.deepEqual([a.literal, a.guarded], [2, 1]);
  const r = split(ws, { g1: ["", "a"] });
  assert.equal(r.ok, true, r.report);
  await sameBehaviour(ws, ["", "a", "b", undefined, null, 0]);
}));

test("Sets move to the top of the module (after the imports) when a statement above the dispatcher calls it", () => withFixture(`
import { join } from "node:path";
export const log = [];
export const early = run("a");
// the dispatcher
export function run(act, ev) {
  if (act === "a") { log.push("a"); return join("x", "y"); }
  else if (act === "b") log.push("b");
}
`, async (ws) => {
  const r = split(ws, { g1: ["a"], g2: ["b"] });
  assert.equal(r.ok, true, r.report);
  assert.match(r.report, /top of the module/);
  const text = ws.read();
  assert.ok(text.indexOf("const G1_ACTIONS") < text.indexOf("run(\"a\")"), "Sets precede the top-level call");
  assert.ok(text.indexOf("import { join }") < text.indexOf("const G1_ACTIONS"), "after the imports");
  const a = await ws.load(ws.orig), b = await ws.load(ws.t); // the split module must not throw in the dead zone at load
  assert.equal(b.early, a.early);
  assert.deepEqual(b.log, a.log);
  await sameBehaviour(ws, ["a", "b", "c"]);
}));

test("Sets stay right above the dispatcher when only declarations precede it; with no imports they go first", () => {
  return Promise.all([
    withFixture(`
export const log = [];
const TABLE = { a: 1 };
function helper() { return TABLE; }
// doc comment
export function run(act) {
  if (act === "a") log.push(helper().a);
}
`, async (ws) => {
      const r = split(ws, { g: ["a"] });
      assert.equal(r.ok, true, r.report);
      assert.doesNotMatch(r.report, /top of the module/);
      const text = ws.read();
      assert.ok(text.indexOf("const G_ACTIONS") > text.indexOf("function helper"));
      assert.ok(text.indexOf("const G_ACTIONS") < text.indexOf("// doc comment"));
      await sameBehaviour(ws, ["a", "b"]);
    }),
    withFixture(`
// header

export const log = [];
log.push("init");
export const early = run("a");
export function run(act) {
  if (act === "a") log.push("a");
}
`, async (ws) => {
      const r = split(ws, { g: ["a"] });
      assert.equal(r.ok, true, r.report);
      const text = ws.read();
      assert.ok(text.indexOf("// header") < text.indexOf("const G_ACTIONS") && text.indexOf("const G_ACTIONS") < text.indexOf("export const log"));
      const a = await ws.load(ws.orig), b = await ws.load(ws.t);
      assert.deepEqual(b.log, a.log);
    }),
  ]);
});

#!/usr/bin/env node
// Deterministic dispatcher splitter: breaks one giant `if (act === "a") {...} else if (act === "b")
// {...} ...` chain, the last statement of a function, into one function per action domain while
// keeping a single dispatcher. Nobody retypes code: every branch is carried over verbatim.
//
//   node tools/split_dispatch.mjs --file js/ui/run_action.js --fn runAction --analyze
//   node tools/split_dispatch.mjs --file F --fn NAME --groups groups.json [--dry] [--allow-this]
//
// --analyze prints the chain: branch count, every branch's condition kind with its line and names,
// the locals of NAME declared BEFORE the chain that branches reference, whether anything follows the
// chain inside NAME, branch-level `this` / `arguments` (not inside nested non-arrow functions), and
// a suggested grouping by action-name prefix. Condition kinds (the name restriction is read from the
// leading `&&` conjuncts, after an optional bare `act &&`):
//   literal  `act === "x"`, `"x" === act`, `||` of those, `["a","b"].indexOf(act) !== -1` (also != -1,
//            > -1, >= 0) or `.includes(act)`: the test is exactly a name test
//   guarded  a name restriction followed by more `&&` conjuncts (S.sel && ...): may fall through
//   prefix   `act.indexOf("P") === 0` / `act.startsWith("P")` only: kept in NAME, in place
//   other    anything else (a guard first, a table lookup, ...): kept in NAME, in place
//
// groups.json maps a domain function name to its action names; every literal/guarded name must be in
// exactly one group and every listed name must have a branch:
//   { "runFileAction": ["undo", "redo"], "runViewAction": ["frame"],
//     "$names": { "uiLocals.AL_ACTS[act]": ["alLeft", "alRight"] } }
// "$names" is optional: it declares the only names an "other" test (keyed by its whitespace-collapsed
// text) can be true for, which turns it into a guarded branch. That is an ASSUMPTION about the
// program, which the tool cannot check; it is echoed in the report.
//
// Transform (the result replaces the chain):
//   const FILE_ACTIONS = new Set(["undo", "redo"]);          // before NAME, one per group
//   async function NAME(act, ev) {
//     ...statements before the chain, unchanged...
//     if (FILE_ACTIONS.has(act)) return runFileAction(act, ev); // groups in order of first appearance
//     ...the kept (prefix / other) branches and a final `else`, as one if-chain, verbatim...
//   }
//   // split out of NAME()
//   async function runFileAction(act, ev) { if (act === "undo") {...} else if (act === "redo") ... }
// Domain functions are placed right after NAME (tools/split_module.mjs can move them later). Branch
// text is verbatim, in its original relative order inside the group. Domain functions take NAME's
// parameters; pre-chain `const`/function/class locals that branches reference are passed as extra
// parameters and listed. Comments between branches travel with the following branch (a same-line
// one stays with the branch before it).
//
// Why the order survives: the sets are disjoint, so a name reaches exactly the branches that mention
// it, in order. A kept branch is refused unless it provably cannot match a dispatched name before
// that name's first unguarded branch (a guarded branch can fall through to it); a prefix test is
// checked against every dispatched name, an "other" test against all of them. Tests of kept branches
// and of guarded branches are assumed free of side effects once the name test has failed.
//
// Refused (nothing written, every reason listed with its line): NAME not a plain function with
// identifier parameters, the chain not the last statement of NAME, a kept branch that could shadow a
// dispatched name (see above), a final else after guarded branches, an action in no group / two groups / no
// branch, a `||` branch whose names are in different groups, branch-level `arguments` or `this`
// (--allow-this keeps the receiver with `.call(this, ...)`), `new.target`, direct eval, a branch
// that assigns a parameter, a branch using a `let`/`var` local of NAME declared before the chain
// or a `var` declared by another branch, a name that already exists in the module, and a result
// that re-parses with a new free identifier or whose branches differ from the original.
// The file is written LF with read-back verification.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { analyze, GLOBALS } from "./module_check.mjs";

class Abort extends Error {
  constructor(messages) {
    const list = Array.isArray(messages) ? messages : [messages];
    super(list.join("\n"));
    this.messages = list;
  }
}

const norm = (text) => text.replace(/\r\n/g, "\n");
const WIDTH = 100;

function parse(src, file) {
  const comments = [];
  try {
    const ast = acorn.parse(src, {
      ecmaVersion: "latest", sourceType: "module", locations: true, ranges: true,
      onComment: comments,
    });
    return { ast, comments };
  } catch (e) {
    throw new Abort(`${file}: parse error - ${e.message}`);
  }
}

function findFunction(ast, name) {
  for (const stmt of ast.body) {
    const d = (stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration") && stmt.declaration ? stmt.declaration : stmt;
    if (d.type === "FunctionDeclaration" && d.id && d.id.name === name) return { stmt, fn: d };
  }
  throw new Abort(`${name} is not a top-level function declaration in this file`);
}

// ---- generic walking -----------------------------------------------------------------------
function childNodes(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && out.push(c));
    else if (v && typeof v.type === "string") out.push(v);
  }
  return out;
}

// visit(node, parent) -> false skips the subtree
function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  if (visit(node, parent) === false) return;
  for (const c of childNodes(node)) walk(c, visit, node);
}

function isRefPosition(node, parent) {
  if (!parent) return true;
  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return false;
  if ((parent.type === "Property" || parent.type === "PropertyDefinition" || parent.type === "MethodDefinition") && parent.key === node && !parent.computed) return false;
  if ((parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") && parent.label === node) return false;
  return true;
}

// Things that depend on the function the code sits in, at its own level: arrows are transparent,
// other functions and class bodies have their own this/arguments/new.target.
function scanOwnLevel(node) {
  const found = { this: [], arguments: [], newTarget: [] };
  walk(node, (n, parent) => {
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ClassBody") return false;
    if (n.type === "ThisExpression") found.this.push(n);
    else if (n.type === "Identifier" && n.name === "arguments" && isRefPosition(n, parent)) found.arguments.push(n);
    else if (n.type === "MetaProperty" && n.meta.name === "new") found.newTarget.push(n);
    return true;
  });
  return found;
}

function hasDirectEval(node) {
  let hit = null;
  walk(node, (n) => {
    if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "eval") hit = hit || n;
    return true;
  });
  return hit;
}

function patternIds(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case "Identifier": out.push(node); break;
    case "ObjectPattern": node.properties.forEach((p) => patternIds(p.type === "RestElement" ? p.argument : p.value, out)); break;
    case "ArrayPattern": node.elements.forEach((e) => patternIds(e, out)); break;
    case "AssignmentPattern": patternIds(node.left, out); break;
    case "RestElement": patternIds(node.argument, out); break;
    default: break;
  }
  return out;
}

// identifiers a branch assigns (any depth; shadowing is ignored, so this over-reports)
function assignedIds(node) {
  const out = [];
  walk(node, (n) => {
    if (n.type === "AssignmentExpression") patternIds(n.left, out);
    else if (n.type === "UpdateExpression" && n.argument.type === "Identifier") out.push(n.argument);
    else if ((n.type === "ForInStatement" || n.type === "ForOfStatement") && n.left.type !== "VariableDeclaration") patternIds(n.left, out);
    return true;
  });
  return out;
}

// ---- NAME's own scope ---------------------------------------------------------------------
// name -> {kind, line, branch}: params, top-level declarations, and `var`s hoisted from nested
// statements (not from nested functions). `branch` is the chain branch index a declaration
// sits in (-1 outside the chain).
function collectLocals(fn, chain) {
  const locals = new Map();
  const add = (name, kind, node, branch) => {
    if (!locals.has(name)) locals.set(name, { kind, line: node.loc.start.line, branch });
  };
  fn.params.forEach((p) => patternIds(p).forEach((id) => add(id.name, "param", id, -1)));
  const branchOf = (pos) => {
    if (!chain || pos < chain.stmt.start || pos >= chain.stmt.end) return -1;
    for (let i = chain.branches.length - 1; i >= 0; i--) if (pos >= chain.branches[i].ifNode.start) return chain.branches[i].end > pos ? i : -2;
    return -1;
  };
  function hoistVars(node) {
    walk(node, (n) => {
      if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression" || n.type === "ClassBody") return false;
      if (n.type === "VariableDeclaration" && n.kind === "var")
        for (const d of n.declarations) patternIds(d.id).forEach((id) => add(id.name, "var", id, branchOf(id.start)));
      return true;
    });
  }
  for (const s of fn.body.body) {
    if (s.type === "VariableDeclaration" && s.kind !== "var")
      for (const d of s.declarations) patternIds(d.id).forEach((id) => add(id.name, s.kind, id, branchOf(id.start)));
    else if (s.type === "FunctionDeclaration") add(s.id.name, "function", s.id, branchOf(s.start));
    else if (s.type === "ClassDeclaration") add(s.id.name, "class", s.id, branchOf(s.start));
    else hoistVars(s);
  }
  return locals;
}

// Free names of a code snippet used as the body of `async function __f(<params>)`. Everything the
// snippet does not declare itself is reported, module-level names and globals included.
function freeNames(code, params) {
  const names = new Map();
  let ast;
  try {
    ast = acorn.parse(`async function __f(${params.join(", ")}) {\n${code}\n}`, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (e) { throw new Abort(`internal: cannot parse a snippet (${e.message})`); }
  analyze(ast, (n) => { if (!names.has(n.name)) names.set(n.name, n.loc.start.line - 2); }, new Set());
  names.delete("__f");
  return names;
}

function moduleFreeNames(text, file, globals = GLOBALS) {
  const set = new Set();
  analyze(parse(text, file).ast, (n) => set.add(n.name), globals);
  return set;
}

function moduleDeclared(ast) {
  const names = new Set();
  for (const s of ast.body) {
    const d = (s.type === "ExportNamedDeclaration" || s.type === "ExportDefaultDeclaration") && s.declaration ? s.declaration : s;
    if (d.type === "VariableDeclaration") d.declarations.forEach((x) => patternIds(x.id).forEach((id) => names.add(id.name)));
    else if ((d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") && d.id) names.add(d.id.name);
    else if (d.type === "ImportDeclaration") d.specifiers.forEach((sp) => names.add(sp.local.name));
  }
  return names;
}

// ---- the chain ------------------------------------------------------------------------------
function literalNames(test, actName) {
  if (test.type === "BinaryExpression" && test.operator === "===") {
    const lit = (n) => n.type === "Literal" && typeof n.value === "string";
    const id = (n) => n.type === "Identifier" && n.name === actName;
    if (id(test.left) && lit(test.right)) return [test.right.value];
    if (lit(test.left) && id(test.right)) return [test.left.value];
    return null;
  }
  if (test.type === "LogicalExpression" && test.operator === "||") {
    const a = literalNames(test.left, actName), b = literalNames(test.right, actName);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

function stringArray(node) {
  if (node.type !== "ArrayExpression" || !node.elements.length) return null;
  const out = [];
  for (const e of node.elements) {
    if (!e || e.type !== "Literal" || typeof e.value !== "string") return null;
    out.push(e.value);
  }
  return out;
}

// -1 / 0 as written in `indexOf(...) !== -1` and `indexOf(...) >= 0`
function numberOf(node) {
  if (node.type === "Literal" && typeof node.value === "number") return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number") return -node.argument.value;
  return NaN;
}

// `[..].indexOf(act)` / `act.indexOf("P")` as a call: {object, arg}
function indexOfCall(node) {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.computed || node.arguments.length !== 1) return null;
  if (node.callee.property.name !== "indexOf") return null;
  return { object: node.callee.object, arg: node.arguments[0] };
}

// One `&&` conjunct of a branch test -> a restriction on the action name, or a plain guard
//   {k: "truthy"}            `act`
//   {k: "names", names}      `act === "a"`, `"a" === act`, `||` of those, `["a","b"].indexOf(act) !== -1 | != -1 | > -1 | >= 0`, `["a","b"].includes(act)`
//   {k: "prefix", prefix}    `act.indexOf("P") === 0`, `act.startsWith("P")`
//   {k: "guard"}             anything else
function conjunctInfo(c, act) {
  const isAct = (n) => n.type === "Identifier" && n.name === act;
  if (isAct(c)) return { k: "truthy" };
  const lit = literalNames(c, act);
  if (lit) return { k: "names", names: lit };
  if (c.type === "CallExpression" && c.callee.type === "MemberExpression" && !c.callee.computed && c.arguments.length === 1) {
    const m = c.callee.property.name;
    if (m === "includes" && isAct(c.arguments[0])) { const a = stringArray(c.callee.object); if (a) return { k: "names", names: a }; }
    if (m === "startsWith" && isAct(c.callee.object) && c.arguments[0].type === "Literal" && typeof c.arguments[0].value === "string" && c.arguments[0].value)
      return { k: "prefix", prefix: c.arguments[0].value };
  }
  if (c.type === "BinaryExpression") {
    const call = indexOfCall(c.left), n = numberOf(c.right);
    if (call && isAct(call.arg) && !Number.isNaN(n)) {
      const arr = stringArray(call.object);
      if (arr && ((["!==", "!="].includes(c.operator) && n === -1) || (c.operator === ">" && n === -1) || (c.operator === ">=" && n === 0))) return { k: "names", names: arr };
    }
    if (call && isAct(call.object) && call.arg.type === "Literal" && typeof call.arg.value === "string" && call.arg.value && ["===", "=="].includes(c.operator) && n === 0)
      return { k: "prefix", prefix: call.arg.value };
  }
  return { k: "guard" };
}

function flattenAnd(test, out = []) {
  if (test.type === "LogicalExpression" && test.operator === "&&") { flattenAnd(test.left, out); flattenAnd(test.right, out); } else out.push(test);
  return out;
}

// What a branch test says about the action name. The restricting conjuncts must come first (only
// `act &&` may precede them) so that skipping the test for other names drops no side effect.
//   kind "literal": the test IS the name test (no guard), so a matched name never falls through
//   kind "guarded": name restriction + guards after it; dispatchable, but may fall through
//   kind "prefix":  a prefix restriction only; kept in place (its names are unknown)
//   kind "other":   no usable restriction; kept in place
function classifyTest(test, act) {
  const infos = flattenAnd(test).map((c) => conjunctInfo(c, act));
  let k = 0;
  while (k < infos.length && infos[k].k !== "guard") k++;
  const lead = infos.slice(0, k), guards = infos.length - k;
  const prefixes = lead.filter((i) => i.k === "prefix").map((i) => i.prefix);
  const nameSets = lead.filter((i) => i.k === "names").map((i) => i.names);
  if (nameSets.length) {
    let names = nameSets[0];
    for (const s of nameSets.slice(1)) names = names.filter((n) => s.includes(n));
    names = [...new Set(names.filter((n) => prefixes.every((p) => n.startsWith(p))))];
    if (names.length) return { kind: guards ? "guarded" : "literal", names, prefixes: [] };
    return { kind: "other", names: [], prefixes: [] };
  }
  if (prefixes.length) return { kind: "prefix", names: [], prefixes };
  return { kind: "other", names: [], prefixes: [] };
}

const isDispatch = (b) => b.kind === "literal" || b.kind === "guarded";

function branchesOf(ifStmt, actName) {
  const branches = [];
  let node = ifStmt, elseNode = null;
  for (;;) {
    branches.push({
      ifNode: node, test: node.test, conseq: node.consequent, end: node.consequent.end,
      line: node.loc.start.line, ...classifyTest(node.test, actName),
    });
    if (node.alternate && node.alternate.type === "IfStatement") node = node.alternate;
    else { elseNode = node.alternate || null; break; }
  }
  return { branches, elseNode };
}

// the top-level if-chain of fn with the most branches (the last one on a tie)
function findChain(fn, actName) {
  let best = null;
  fn.body.body.forEach((stmt, index) => {
    if (stmt.type !== "IfStatement") return;
    const c = branchesOf(stmt, actName);
    if (!best || c.branches.length >= best.branches.length) best = { stmt, index, ...c };
  });
  if (!best) throw new Abort(`${fn.id.name} has no top-level if/else-if chain`);
  best.after = fn.body.body.slice(best.index + 1);
  return best;
}

function fnShape(fn, name) {
  const problems = [];
  if (fn.generator) problems.push(`${name} is a generator`);
  if (!fn.params.length) problems.push(`${name} has no parameters, so there is no action parameter to dispatch on`);
  else if (fn.params.some((p) => p.type !== "Identifier")) problems.push(`${name} has a destructured/default/rest parameter (only plain identifier parameters are supported)`);
  if (problems.length) throw new Abort(problems);
  return fn.params.map((p) => p.name);
}

function snake(name) {
  return name.replace(/Actions?$/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase() + "_ACTIONS";
}

// suggested domain by action-name prefix: the leading lower-case run before the first capital
function prefixOf(action) {
  const m = /^[a-z]+/.exec(action);
  return m ? m[0] : action;
}

function normText(s) { return s.replace(/\s+/g, " ").trim(); }

// ---- --analyze ------------------------------------------------------------------------------
export function analyzeDispatch(opts) {
  const file = opts.file;
  const src = norm(opts.src != null ? opts.src : fs.readFileSync(file, "utf8"));
  const { ast } = parse(src, file);
  const { fn } = findFunction(ast, opts.fn);
  const params = fnShape(fn, opts.fn);
  const act = params[0];
  const chain = findChain(fn, act);
  const locals = collectLocals(fn, chain);
  const lines = [];
  const count = (kind) => chain.branches.filter((b) => b.kind === kind).length;
  const result = {
    ok: true, params, branches: chain.branches.length,
    literal: count("literal"), guarded: count("guarded"), prefix: count("prefix"), other: count("other"),
    hasElse: !!chain.elseNode, after: chain.after.length, locals: [], thisUses: [], argumentsUses: [], newTargetUses: [], suggested: {},
  };
  lines.push(`${opts.fn}${fn.async ? " (async)" : ""}(${params.join(", ")}) lines ${fn.loc.start.line}-${fn.loc.end.line}`);
  lines.push(`chain: lines ${chain.stmt.loc.start.line}-${chain.stmt.loc.end.line}, ${chain.branches.length} branches: ${result.literal} literal, ${result.guarded} guarded literal (name test + guard), ${result.prefix} prefix, ${result.other} other${chain.elseNode ? ", final else" : ""}`);
  chain.branches.forEach((b, i) => {
    const what = isDispatch(b) ? b.names.map((n) => JSON.stringify(n)).join(" | ") : normText(src.slice(b.test.start, b.test.end)).slice(0, 80);
    lines.push(`  #${i + 1}\tline ${b.line}\t${b.kind}\t${what}`);
  });
  if (chain.elseNode) lines.push(`  final else at line ${chain.elseNode.loc.start.line}`);
  const kept = chain.branches.filter((b) => !isDispatch(b));
  if (kept.length) lines.push(`kept in ${opts.fn} (prefix/other, not dispatchable by name): lines ${kept.map((b) => b.line).join(", ")}; an "other" one needs a "$names" entry in groups.json unless no dispatched name can reach it`);
  if (chain.after.length) lines.push(`after the chain: ${chain.after.length} statement(s), first at line ${chain.after[0].loc.start.line}`);
  else lines.push("after the chain: nothing (the chain is the last statement)");

  // locals of NAME that dispatchable branches reference
  const refd = new Map();
  chain.branches.forEach((b, i) => {
    if (!isDispatch(b)) return;
    const text = src.slice(b.ifNode.start, b.end);
    for (const [name] of freeNames(text, params)) {
      const info = locals.get(name);
      if (!info || info.kind === "param") continue;
      if (info.branch === i) continue;
      if (!refd.has(name)) refd.set(name, { ...info, uses: [] });
      refd.get(name).uses.push(b.line);
    }
  });
  for (const [name, info] of refd) {
    result.locals.push({ name, kind: info.kind, line: info.line, uses: info.uses });
    lines.push(`local ${name} (${info.kind}, ${info.branch >= 0 ? "declared in a branch" : "declared before the chain"} at line ${info.line}) used by branches at lines ${info.uses.join(", ")}`);
  }
  if (!refd.size) lines.push("locals of the function (other than its parameters) referenced by branches: none");

  for (const b of chain.branches) {
    if (!isDispatch(b)) continue;
    const f = scanOwnLevel(b.test), g = scanOwnLevel(b.conseq);
    for (const n of [...f.this, ...g.this]) result.thisUses.push(n.loc.start.line);
    for (const n of [...f.arguments, ...g.arguments]) result.argumentsUses.push(n.loc.start.line);
    for (const n of [...f.newTarget, ...g.newTarget]) result.newTargetUses.push(n.loc.start.line);
  }
  lines.push(`branch-level this: ${result.thisUses.length ? "lines " + result.thisUses.join(", ") : "none"}`);
  lines.push(`branch-level arguments: ${result.argumentsUses.length ? "lines " + result.argumentsUses.join(", ") : "none"}`);
  if (result.newTargetUses.length) lines.push(`branch-level new.target: lines ${result.newTargetUses.join(", ")}`);

  // suggested grouping by prefix
  const byPrefix = new Map();
  for (const b of chain.branches) {
    if (!isDispatch(b)) continue;
    for (const n of b.names) {
      const p = prefixOf(n);
      if (!byPrefix.has(p)) byPrefix.set(p, []);
      if (!byPrefix.get(p).includes(n)) byPrefix.get(p).push(n);
    }
  }
  const multi = [...byPrefix].filter(([, v]) => v.length >= 2), single = [...byPrefix].filter(([, v]) => v.length < 2);
  lines.push("suggested grouping by prefix:");
  for (const [p, v] of multi) { result.suggested[p] = v; lines.push(`  ${p} (${v.length}): ${v.join(", ")}`); }
  const misc = single.flatMap(([, v]) => v);
  if (misc.length) { result.suggested.misc = misc; lines.push(`  (single-action prefixes, ${misc.length}): ${misc.join(", ")}`); }
  result.report = lines.join("\n");
  return result;
}

// ---- the transform --------------------------------------------------------------------------
function wrapList(items, indent, first, last) {
  const one = `${first}${items.join(", ")}${last}`;
  if (one.length <= WIDTH) return [one];
  const out = [first];
  let line = indent + "  ";
  for (const it of items) {
    const piece = it + ",";
    if (line.trim() && (line + " " + piece).length > WIDTH) { out.push(line); line = indent + "  " + piece; }
    else line = line.trim() ? line + " " + piece : line + piece;
  }
  if (line.trim()) out.push(line);
  out.push(indent + last.trimStart());
  return out;
}

// would `if (c) <stmt>` followed by `else` capture that else inside stmt?
function endsOpenIf(stmt) {
  switch (stmt.type) {
    case "IfStatement": return stmt.alternate ? endsOpenIf(stmt.alternate) : true;
    case "ForStatement": case "ForInStatement": case "ForOfStatement": case "WhileStatement": case "WithStatement": case "LabeledStatement":
      return endsOpenIf(stmt.body);
    default: return false;
  }
}

function lineStart(src, pos) { return src.lastIndexOf("\n", pos - 1) + 1; }
function lineEnd(src, pos) { const i = src.indexOf("\n", pos); return i < 0 ? src.length : i + 1; }

export function splitDispatch(opts) {
  const file = opts.file;
  const src = norm(opts.src != null ? opts.src : fs.readFileSync(file, "utf8"));
  const result = { ok: false, written: false, report: "", reasons: [] };
  try {
    run(opts, file, src, result);
    result.ok = true;
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    result.reasons = e.messages;
    result.report = `refused ${file}: nothing written\n` + e.messages.map((m) => "  - " + m).join("\n");
  }
  return result;
}

function run(opts, file, src, result) {
  const { ast, comments } = parse(src, file);
  const { stmt, fn } = findFunction(ast, opts.fn);
  const params = fnShape(fn, opts.fn);
  const act = params[0];
  const problems = [];
  const refuse = (line, text) => problems.push({ line, text });

  const groupsAll = typeof opts.groups === "string" ? JSON.parse(fs.readFileSync(opts.groups, "utf8")) : opts.groups;
  if (!groupsAll || typeof groupsAll !== "object" || Array.isArray(groupsAll)) throw new Abort("groups must be an object mapping a function name to a list of action names");
  const { $names: declaredNames = {}, ...groupsIn } = groupsAll;
  const groupNames = Object.keys(groupsIn);
  if (!groupNames.length) throw new Abort("groups is empty");

  const chain = findChain(fn, act);
  const { branches } = chain;

  // "$names": { "<test text>": ["a", "b"] } declares the only names an otherwise opaque test can be true for
  const usedDecl = new Set();
  for (const b of branches) {
    if (isDispatch(b)) continue;
    const key = normText(src.slice(b.test.start, b.test.end));
    const hit = Object.keys(declaredNames).find((k) => normText(k) === key);
    if (hit == null) continue;
    const list = declaredNames[hit];
    if (!Array.isArray(list) || !list.length || list.some((n) => typeof n !== "string")) { refuse(b.line, `$names entry for ${key} must be a non-empty list of strings`); continue; }
    usedDecl.add(hit);
    b.kind = "guarded"; b.names = [...new Set(list)]; b.prefixes = []; b.declared = true;
  }
  for (const k of Object.keys(declaredNames)) if (!usedDecl.has(k)) refuse(0, `$names entry matches no non-literal branch test: ${k}`);

  // ---- preconditions on the chain
  if (chain.after.length) refuse(chain.after[0].loc.start.line, `${chain.after.length} statement(s) follow the chain inside ${opts.fn} (the chain must be its last statement)`);
  const dispatched = branches.map((b, i) => i).filter((i) => isDispatch(branches[i]));
  const keptIdx = branches.map((b, i) => i).filter((i) => !isDispatch(branches[i]));
  if (!dispatched.length) refuse(chain.stmt.loc.start.line, "the chain has no dispatchable branch (a name test such as act === \"x\")");

  // a kept (prefix / opaque) branch must not be able to match a dispatched name before that
  // name's last chance to match: the set lookup would bypass or reorder it
  const positions = new Map(); // name -> {first unguarded index, indices}
  for (const i of dispatched) for (const n of branches[i].names) {
    if (!positions.has(n)) positions.set(n, { unguarded: Infinity, at: [] });
    const p = positions.get(n);
    p.at.push(i);
    if (branches[i].kind === "literal") p.unguarded = Math.min(p.unguarded, i);
  }
  for (const q of keptIdx) {
    const k = branches[q];
    const clash = [];
    for (const [n, p] of positions) {
      if (q > p.unguarded) continue; // dead for n: an unguarded branch for n always ends the chain first
      if (k.kind === "prefix" && !k.prefixes.every((x) => n.startsWith(x))) continue;
      clash.push(n);
    }
    if (clash.length) {
      const what = k.kind === "prefix" ? `prefix test (${k.prefixes.map((x) => JSON.stringify(x)).join(", ")})` : `non-literal test (${normText(src.slice(k.test.start, k.test.end)).slice(0, 60)})`;
      refuse(k.line, `${what} could match ${clash.length} dispatched action(s) (${clash.slice(0, 4).join(", ")}${clash.length > 4 ? ", ..." : ""}) that it precedes or that can fall through to it` +
        (k.kind === "other" ? `; list the names it can be true for under "$names" in groups.json if you can show the rest are impossible` : ""));
    }
  }
  // a final else is reached by a name whose guards all failed; with guarded branches it would be skipped
  if (chain.elseNode && dispatched.some((i) => branches[i].kind === "guarded"))
    refuse(chain.elseNode.loc.start.line, "a final else cannot be kept after guarded branches (a name whose guard fails would have fallen into it)");

  // ---- groups
  const ownerOfName = new Map(); // action -> group
  for (const g of groupNames) {
    const list = groupsIn[g];
    if (!Array.isArray(list) || list.some((n) => typeof n !== "string")) { refuse(0, `group ${g} must be a list of action names`); continue; }
    if (!/^[A-Za-z_$][\w$]*$/.test(g)) refuse(0, `group name ${g} is not an identifier`);
    for (const n of list) {
      if (ownerOfName.has(n)) refuse(0, `action ${JSON.stringify(n)} is in both ${ownerOfName.get(n)} and ${g}`);
      else ownerOfName.set(n, g);
    }
  }
  const literalSet = new Set(dispatched.flatMap((i) => branches[i].names));
  const unlisted = [...literalSet].filter((n) => !ownerOfName.has(n));
  if (unlisted.length) refuse(0, `${unlisted.length} action(s) are in no group: ${unlisted.join(", ")}`);
  const unknown = [...ownerOfName.keys()].filter((n) => !literalSet.has(n));
  if (unknown.length) refuse(0, `action(s) listed in groups that have no name branch: ${unknown.join(", ")}`);
  const branchGroup = branches.map((b) => {
    if (!isDispatch(b)) return null;
    const gs = [...new Set(b.names.map((n) => ownerOfName.get(n)).filter(Boolean))];
    if (gs.length > 1) refuse(b.line, `branch ${b.names.map((n) => JSON.stringify(n)).join(" | ")} spans groups ${gs.join(", ")}`);
    return gs[0] || null;
  });

  // ---- NAME's scope
  const locals = collectLocals(fn, chain);
  const extrasByGroup = new Map(); // group -> [names]
  const seenExtra = new Map();     // name -> info
  const branchVarNames = new Set();
  for (const [name, info] of locals) if (info.kind === "var" && info.branch >= 0 && isDispatch(branches[info.branch])) branchVarNames.add(name);
  const paramSet = new Set(params);

  for (const i of dispatched) {
    const b = branches[i], g = branchGroup[i];
    const text = src.slice(b.ifNode.start, b.end);
    const own = scanOwnLevel(b.test), body = scanOwnLevel(b.conseq);
    for (const n of [...own.arguments, ...body.arguments]) refuse(n.loc.start.line, "branch-level `arguments`");
    for (const n of [...own.newTarget, ...body.newTarget]) refuse(n.loc.start.line, "branch-level `new.target`");
    if (!opts.allowThis) for (const n of [...own.this, ...body.this]) refuse(n.loc.start.line, "branch-level `this` (pass --allow-this to keep the receiver with .call(this, ...))");
    const ev = hasDirectEval(b.test) || hasDirectEval(b.conseq);
    if (ev) refuse(ev.loc.start.line, "direct eval in a branch (it could reach the function's locals)");
    for (const id of [...assignedIds(b.test), ...assignedIds(b.conseq)]) if (paramSet.has(id.name)) refuse(id.loc.start.line, `branch assigns the parameter ${id.name} (the domain function would get its own copy)`);
    for (const [name, line] of freeNames(text, params)) {
      const info = locals.get(name);
      if (!info || info.kind === "param") continue;
      if (info.branch === i) continue;
      const at = b.line + line;
      if (info.branch >= 0) { refuse(at, `branch uses ${name}, a var declared by the branch at line ${branches[info.branch].line}`); continue; }
      if (info.kind === "const" || info.kind === "function" || info.kind === "class") {
        seenExtra.set(name, info);
        if (!extrasByGroup.has(g)) extrasByGroup.set(g, []);
        if (!extrasByGroup.get(g).includes(name)) extrasByGroup.get(g).push(name);
      } else refuse(at, `branch uses ${name}, a ${info.kind} declared before the chain at line ${info.line} (it can change; only const, function and class locals can be passed as parameters)`);
    }
  }

  // new names
  const declared = moduleDeclared(ast);
  const consts = new Map(groupNames.map((g) => [g, snake(g)]));
  const taken = new Set();
  for (const g of groupNames) {
    for (const nm of [g, consts.get(g)]) {
      if (declared.has(nm) || taken.has(nm) || nm === opts.fn) refuse(0, `${nm} already exists in the module (or is used twice by this run)`);
      taken.add(nm);
    }
  }
  const stmtFree = moduleFreeNames(src, file, new Set());
  for (const nm of taken) if (stmtFree.has(nm)) refuse(0, `${nm} is already used as a free name in the module`);

  // ---- gap comments between branches
  const isAsync = !!fn.async;
  const chainIndent = /^[ \t]*/.exec(src.slice(lineStart(src, chain.stmt.start)))[0];
  const stmtIndent = /^[ \t]*/.exec(src.slice(lineStart(src, stmt.start)))[0];
  const gapComments = (from, to, allowTrailing) => {
    const trailing = [], leading = [];
    for (const c of comments.filter((cm) => cm.start >= from && cm.end <= to)) {
      const text = src.slice(c.start, c.end);
      if (allowTrailing && !src.slice(from, c.start).includes("\n")) trailing.push({ text, line: c.type === "Line" });
      else leading.push(text);
    }
    return { trailing, leading };
  };
  // comments between the previous branch's body (or the chain start) and this branch's `if`
  const gaps = branches.map((b, i) => gapComments(i === 0 ? chain.stmt.start : branches[i - 1].end, b.ifNode.start, i > 0));
  const elseGap = chain.elseNode ? gapComments(branches[branches.length - 1].end, chain.elseNode.start, true) : { trailing: [], leading: [] };
  // same-line comments after branch i belong to it, wherever it ends up
  const trailingAfter = (i) => (i + 1 < branches.length ? gaps[i + 1].trailing : elseGap.trailing);

  const branchText = (i) => {
    const b = branches[i];
    if (b.conseq.type !== "BlockStatement" && endsOpenIf(b.conseq))
      return `${src.slice(b.ifNode.start, b.conseq.start)}{ ${src.slice(b.conseq.start, b.conseq.end)} }`;
    return src.slice(b.ifNode.start, b.end);
  };

  // `if (a) A else if (b) B ...` of the given branches (original order), then an optional else
  function emitChain(idxs, withElse) {
    let text = "";
    let prevBlock = true, forceNewline = false;
    idxs.forEach((i, k) => {
      const lead = gaps[i].leading.map((c) => c + `\n${chainIndent}`).join("");
      if (k === 0) text += chainIndent + lead + branchText(i);
      else if (prevBlock && !forceNewline && !lead) text += " else " + branchText(i);
      else text += `\n${chainIndent}${lead}else ` + branchText(i);
      prevBlock = branches[i].conseq.type === "BlockStatement" || endsOpenIf(branches[i].conseq);
      forceNewline = false;
      for (const t of trailingAfter(i)) { text += " " + t.text; if (t.line) forceNewline = true; }
    });
    if (withElse && chain.elseNode) {
      const lead = elseGap.leading.map((c) => c + `\n${chainIndent}`).join("");
      const body = src.slice(chain.elseNode.start, chain.elseNode.end);
      if (!idxs.length) text += chainIndent + lead + body;
      else if (prevBlock && !forceNewline && !lead && chain.elseNode.type === "BlockStatement") text += " else " + body;
      else text += `\n${chainIndent}${lead}else ` + body;
    }
    return text;
  }

  // text of the pre-chain code and the kept chain, which stay in NAME, for the var-sharing check
  const keptText = keptIdx.length || chain.elseNode ? emitChain(keptIdx, true) : "";
  if (branchVarNames.size) {
    const stayFree = freeNames(src.slice(fn.body.start + 1, chain.stmt.start) + "\n" + keptText, params);
    for (const name of branchVarNames) if (stayFree.has(name)) refuse(0, `${name} is a var declared by a dispatched branch but ${opts.fn} itself (before the chain or in the kept branches) also uses it`);
  }

  if (problems.length) {
    const sorted = problems.sort((a, b) => a.line - b.line);
    throw new Abort(sorted.map((p) => (p.line ? `line ${p.line}: ` : "") + p.text));
  }

  // ---- domain functions
  const order = []; // groups in order of first appearance
  dispatched.forEach((i) => { const g = branchGroup[i]; if (!order.includes(g)) order.push(g); });
  const members = new Map(order.map((g) => [g, dispatched.filter((i) => branchGroup[i] === g)]));
  const domains = order.map((g) => {
    const sig = [...params, ...(extrasByGroup.get(g) || [])];
    return {
      g, sig,
      text: `${stmtIndent}// split out of ${opts.fn}()\n${stmtIndent}${isAsync ? "async " : ""}function ${g}(${sig.join(", ")}) {\n${emitChain(members.get(g), false)}\n${stmtIndent}}`,
    };
  });

  // ---- the new NAME
  const dispatch = order.map((g) => {
    const args = domains.find((x) => x.g === g).sig.join(", ");
    const call = opts.allowThis ? `${g}.call(this, ${args})` : `${g}(${args})`;
    return `if (${consts.get(g)}.has(${act})) return ${call};`;
  });
  const newChain = [...dispatch.map((d, k) => (k ? chainIndent : "") + d), ...(keptText ? [keptText] : [])].join("\n");

  // ---- the sets, before NAME (and before the comment lines directly above it)
  let setPos = stmt.start;
  for (;;) {
    const c = comments.find((cm) => cm.end <= setPos && /^[ \t]*\n?[ \t]*$/.test(src.slice(cm.end, setPos)) && src.slice(cm.end, setPos).split("\n").length <= 2
      && /^[ \t]*$/.test(src.slice(lineStart(src, cm.start), cm.start)));
    if (!c) break;
    setPos = lineStart(src, c.start);
  }
  setPos = lineStart(src, setPos);
  const setBlock = order.map((g) => {
    const names = [...new Set(members.get(g).flatMap((i) => branches[i].names))].map((n) => JSON.stringify(n));
    return wrapList(names, stmtIndent, `${stmtIndent}const ${consts.get(g)} = new Set([`, "]);").join("\n");
  }).join("\n") + "\n";

  const afterStmt = lineEnd(src, stmt.end);
  const domainBlock = "\n" + domains.map((d) => d.text).join("\n\n") + "\n";
  const out = src.slice(0, setPos) + setBlock + src.slice(setPos, chain.stmt.start) + newChain + src.slice(chain.stmt.end, afterStmt)
    + (src.slice(0, afterStmt).endsWith("\n") ? "" : "\n") + domainBlock + src.slice(afterStmt);

  verify(out, src, file, opts, { branches, order, members, consts, keptIdx, params, elseNode: chain.elseNode });

  const before = fn.loc.end.line - fn.loc.start.line + 1;
  const f2 = findFunction(parse(out, "the result").ast, opts.fn).fn;
  const now = f2.loc.end.line - f2.loc.start.line + 1;
  result.groups = order.map((g) => ({ name: g, set: consts.get(g), actions: [...new Set(members.get(g).flatMap((i) => branches[i].names))].length, branches: members.get(g).length, params: domains.find((d) => d.g === g).sig }));
  result.kept = keptIdx.length;
  result.hasElse = !!chain.elseNode;
  result.text = out;
  result.report = [
    `${file}: ${opts.fn} ${before} -> ${now} lines, ${branches.length} branches -> ${order.length} groups` +
      `${keptIdx.length ? `, ${keptIdx.length} kept in place` : ""}${chain.elseNode ? ", final else kept" : ""}${usedDecl.size ? `, ${usedDecl.size} $names assumption(s)` : ""}`,
    ...result.groups.map((g) => `  ${g.name}(${g.params.join(", ")})  ${g.set}  ${g.actions} actions, ${g.branches} branches`),
    ...(seenExtra.size ? [`extra parameters passed from ${opts.fn}: ${[...seenExtra.keys()].join(", ")}`] : []),
    ...[...usedDecl].map((k) => `assumed (from $names): ${normText(k).slice(0, 70)} is only true for ${declaredNames[k].length} listed name(s)`),
  ].join("\n");
  if (!opts.dry) {
    writeVerified(file, out);
    result.written = true;
    result.report += `\nwritten ${file}`;
  } else result.report += "\n(dry run: nothing written)";
}

function verify(out, src, file, opts, plan) {
  const { ast: ast2 } = parse(out, "the result");
  const before = moduleFreeNames(src, file), after = moduleFreeNames(out, file);
  const added = [...after].filter((n) => !before.has(n));
  if (added.length) throw new Abort([`verification failed: new free identifier(s) ${added.join(", ")}`]);
  const act = plan.params[0];
  const orig = plan.branches;
  const same = (b, o, where) => {
    const a = normText(out.slice(b.ifNode.start, b.end)), e = normText(src.slice(o.ifNode.start, o.end));
    const wrapped = normText(`${src.slice(o.ifNode.start, o.conseq.start)}{ ${src.slice(o.conseq.start, o.conseq.end)} }`);
    if (a !== e && a !== wrapped) throw new Abort([`verification failed: branch at original line ${o.line} changed in ${where}`]);
  };
  // every dispatched branch is in its domain function, in order; every kept one in the kept chain
  for (const g of plan.order) {
    const got = branchesOf(findFunction(ast2, g).fn.body.body.find((s) => s.type === "IfStatement"), act).branches;
    const want = plan.members.get(g);
    if (got.length !== want.length) throw new Abort([`verification failed: ${g} has ${got.length} branches, expected ${want.length}`]);
    got.forEach((b, k) => same(b, orig[want[k]], g));
  }
  const f2 = findFunction(ast2, opts.fn).fn;
  const isDispatchLine = (s) => s.type === "IfStatement" && /^[A-Z0-9_]+_ACTIONS\.has\(/.test(out.slice(s.test.start, s.test.end));
  const calls = f2.body.body.filter(isDispatchLine);
  if (calls.length !== plan.order.length) throw new Abort([`verification failed: ${opts.fn} has ${calls.length} dispatch lines, expected ${plan.order.length}`]);
  if (plan.keptIdx.length) {
    const keptChain = f2.body.body.filter((s) => s.type === "IfStatement" && !isDispatchLine(s)).pop();
    if (!keptChain) throw new Abort(["verification failed: the kept branches are missing"]);
    const got = branchesOf(keptChain, act);
    if (got.branches.length !== plan.keptIdx.length) throw new Abort([`verification failed: ${opts.fn} keeps ${got.branches.length} branches, expected ${plan.keptIdx.length}`]);
    got.branches.forEach((b, k) => same(b, orig[plan.keptIdx[k]], opts.fn));
    if (!!got.elseNode !== !!plan.elseNode) throw new Abort(["verification failed: the final else changed"]);
  }
}

function writeVerified(file, text) {
  let last = null;
  for (let i = 0; i < 3; i++) {
    try {
      fs.writeFileSync(file, text, "utf8");
      if (fs.readFileSync(file, "utf8") === text) return;
      last = new Error("read-back differs");
    } catch (e) { last = e; }
  }
  throw new Abort(`${file}: write failed after 3 tries - ${last.message}`);
}

// ---- CLI --------------------------------------------------------------------------------------
const usage = `usage:
  node tools/split_dispatch.mjs --file F --fn NAME --analyze
  node tools/split_dispatch.mjs --file F --fn NAME --groups groups.json [--dry] [--allow-this]`;

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Abort(`${a} needs a value`); return argv[++i]; };
    if (a === "--file") o.file = val();
    else if (a === "--fn") o.fn = val();
    else if (a === "--groups") o.groups = val();
    else if (a === "--analyze") o.analyze = true;
    else if (a === "--dry") o.dry = true;
    else if (a === "--allow-this") o.allowThis = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else throw new Abort(`unknown argument ${a}`);
  }
  return o;
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try { return path.resolve(entry) === fileURLToPath(import.meta.url); } catch (_) { return false; }
}

if (isMain()) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(e.message + "\n" + usage);
    process.exit(2);
  }
  if (opts.help || !opts.file || !opts.fn || (!opts.analyze && !opts.groups)) { console.error(usage); process.exit(opts.help ? 0 : 2); }
  try {
    if (opts.analyze) {
      console.log(analyzeDispatch(opts).report);
      process.exit(0);
    }
    const r = splitDispatch(opts);
    console.log(r.report);
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    console.error(e.messages.map((m) => "  - " + m).join("\n"));
    process.exit(1);
  }
}

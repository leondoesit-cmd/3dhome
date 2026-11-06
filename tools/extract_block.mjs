#!/usr/bin/env node
// Deterministic block lifter: moves a run of top-level statements out of a giant
// function into a new top-level function of the SAME module, so tools/split_module.mjs
// can then move that function to another file. Nobody retypes code.
//
//   node tools/extract_block.mjs --file js/ui/init_ui.js --fn initUI --outline
//   node tools/extract_block.mjs --file F --fn NAME --lines 120-480 --name NEWNAME [--dry]
//
// --outline lists the function body's top-level statements for planning cuts:
//   <line>-<endLine>\t<kind>\t<names it declares>\t<first ~70 chars>
//   <line>\t## <comment text>          (own-line comments between statements)
//
// The block is every top-level statement of NAME whose start line lies in A..B, with the
// comment lines directly above the first one. It becomes
//   // lifted out of NAME()
//   function NEWNAME(p1, p2) { <block text verbatim> [return { a, b };] }
// right after NAME, and the block is replaced by `NEWNAME(p1, p2);` (or
// `const { a, b } = NEWNAME(p1, p2);` when later code uses names the block declares).
// Params are the names the block reads that live in NAME's own scope, in order of first use.
//
// Refused (nothing written, every reason listed with its line): a param assigned anywhere
// in NAME (the copy would diverge from the outer binding), a returned name assigned after
// the block or inside a closure of the block, a block-declared name used before the block,
// a param declared after the block (temporal dead zone / lost initialiser), and a block with
// return / yield / await in a non-async NAME / arguments / this / new.target / super at its
// own function level, a break or continue aimed outside it, or direct eval.
//
// --box a,b,c [--holder NAME]  (with --fn; runs BEFORE any lift, same run)
//   node tools/extract_block.mjs --file F --fn NAME --box a,b,c [--holder H] [--dry]
//   node tools/extract_block.mjs --file F --fn NAME --box a,b --lines A-B --name NEWNAME
// Rewrites NAME so the listed locals live in ONE holder object (default `<NAME>Locals`, must
// be a name used nowhere in the module), which a later lift then passes as a single param
// instead of one param per local (and instead of refusing reassigned locals):
//   const HOLDER = { a: undefined, b: undefined };   // first statement of NAME
//   var a = expr;  ->  HOLDER.a = expr;    var a;  ->  (removed)
//   var a = 1, x = 2, b;  ->  HOLDER.a = 1;  var x = 2;     (only boxed declarators change)
//   every reference that resolves to the binding (closures included, shadowing respected):
//   reads, assignment/update targets, destructuring and for-in/of targets, typeof a
//   -> HOLDER.a;  shorthand `{ a }` -> `{ a: HOLDER.a }`, also in patterns `({ a } = o)`.
// Each name must be declared exactly once in NAME's own body scope with var/let (not a param,
// const, function, class, destructuring declarator or for-loop head). Refused otherwise, and
// when NAME calls eval. With --lines/--name the line numbers are those of the ORIGINAL file;
// they are mapped through the box rewrite, and refusal lines refer to the boxed text.
// The only semantic change: TDZ. A boxed `let` read before its declaration now yields
// undefined instead of throwing, and only code that would already have thrown is affected.
// The result is re-parsed and must add no free identifier and leave no reference unrewritten.
//
// --holder-scope module  (default: function)
//   The holder is a module-level `const HOLDER = { ... };` right before NAME (nothing is added
//   inside NAME), for functions that run once per page. A holder left by an earlier run (a
//   const plain object literal, no comments) is REUSED: new names are appended to its literal
//   in order, names already in it are reported as "already boxed". Also boxable then:
//   const (`HOLDER.x = init;`), destructuring declarations whose names are ALL boxed
//   (`({ a: HOLDER.a } = init);`), and top-level function declarations (the declaration
//   stays, `HOLDER.f = f;` becomes NAME's first statement and every other reference goes
//   through the holder). Class declarations, params and for-head declarations stay refused.
//
// --box-for A-B  (needs --holder-scope module; replaces --lines)
//   One run: box every NAME-scope binding the block (statements starting in A..B) references,
//   plus the ones it declares that code outside it uses, then lift the block with no params and
//   no return: `--name N` wraps it in `function N() {...}` after NAME and calls `N();`; a block
//   of only function declarations is lifted as pure top-level functions (no --name). A function
//   the block declares and outside code uses gets its `HOLDER.f = f;` as the first statement of
//   the lifted body, and is refused when code before the block uses it (hoisting would be lost).
//   Refused: return / this / arguments / await at block level, direct eval, params the block reads.
//
// Lifting pure function declarations. A block that consists ONLY of function declarations
// and references no binding of NAME's scope (other than its own function names; module-level
// and global names are fine; no param is needed) is lifted as plain top-level functions: the
// statements (with their leading comments, verbatim) are removed from NAME and inserted after
// it, with no call site and no return. A module-level declaration is visible from all of NAME,
// so uses before the block (hoisting) keep working. --name is optional then (the functions keep
// their own names; it is ignored when given and the functions are used before the block;
// without that, a given --name keeps the single-lifted-function behaviour). Refused when a
// name already exists at module level (or is a platform global), when NAME assigns one of the
// functions, or when the block is impure and no --name is given. Residual difference: the
// function objects are now shared across NAME calls (identity, own properties).
import fs from "node:fs";
import path from "node:path";
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

// ---- scopes ------------------------------------------------------------------
class Scope {
  constructor(parent, kind) {
    this.parent = parent;
    this.kind = kind; // "module" | "function" | "block"
    this.names = new Map(); // name -> {kind, at, inits: [offsets of initialisers]}
  }
  add(name, kind, at, initAt = null) {
    let info = this.names.get(name);
    if (!info) { info = { kind, at, inits: [] }; this.names.set(name, info); }
    if (initAt != null) info.inits.push(initAt);
  }
  varTarget() {
    let s = this;
    while (s.kind === "block") s = s.parent;
    return s;
  }
  lookup(name) {
    for (let s = this; s; s = s.parent) if (s.names.has(name)) return s;
    return null;
  }
}

// every identifier a binding / assignment pattern names
function patternIds(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case "Identifier": out.push(node); break;
    case "ObjectPattern":
      node.properties.forEach((p) => patternIds(p.type === "RestElement" ? p.argument : p.value, out));
      break;
    case "ArrayPattern": node.elements.forEach((e) => patternIds(e, out)); break;
    case "AssignmentPattern": patternIds(node.left, out); break;
    case "RestElement": patternIds(node.argument, out); break;
    default: break;
  }
  return out;
}

// Declarations of a scope body are collected before walking it (hoisting). Module code is
// strict, so a function declaration in a block belongs to that block; `var` reaches the function.
function declare(node, scope) {
  if (!node) return;
  switch (node.type) {
    case "VariableDeclaration":
      for (const d of node.declarations)
        for (const id of patternIds(d.id))
          (node.kind === "var" ? scope.varTarget() : scope).add(id.name, node.kind, node.start, d.init ? d.start : null);
      break;
    case "FunctionDeclaration": if (node.id) scope.add(node.id.name, "function", node.start); break;
    case "ClassDeclaration": if (node.id) scope.add(node.id.name, "class", node.start); break;
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration": if (node.declaration) declare(node.declaration, scope); break;
    case "BlockStatement": node.body.forEach((n) => hoistVarOnly(n, scope)); break;
    case "IfStatement": hoistVarOnly(node.consequent, scope); hoistVarOnly(node.alternate, scope); break;
    case "ForStatement": hoistVarOnly(node.init, scope); hoistVarOnly(node.body, scope); break;
    case "ForInStatement":
    case "ForOfStatement": hoistVarOnly(node.left, scope, true); hoistVarOnly(node.body, scope); break;
    case "WhileStatement":
    case "DoWhileStatement":
    case "LabeledStatement": hoistVarOnly(node.body, scope); break;
    case "TryStatement":
      hoistVarOnly(node.block, scope);
      if (node.handler) hoistVarOnly(node.handler.body, scope);
      hoistVarOnly(node.finalizer, scope);
      break;
    case "SwitchStatement": node.cases.forEach((c) => c.consequent.forEach((n) => hoistVarOnly(n, scope))); break;
    default: break;
  }
}

function hoistVarOnly(node, scope, forcedInit = false) {
  if (!node) return;
  switch (node.type) {
    case "VariableDeclaration":
      if (node.kind === "var")
        for (const d of node.declarations)
          for (const id of patternIds(d.id)) scope.varTarget().add(id.name, "var", node.start, forcedInit || d.init ? d.start : null);
      return;
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression":
      return;
    default: declare(node, scope);
  }
}

// Every identifier reference inside `fn`, resolved against the scopes between it and `fn`.
// {id, name, write, depth (closure nesting below fn, 0 = fn's own level), scope (declaring Scope or null)}
function resolveRefs(fn) {
  const root = new Scope(null, "module");
  const refs = [];
  let nameScope = null;
  let depth = 0;
  const ref = (id, scope, write) => refs.push({ id, name: id.name, write, depth, scope: scope.lookup(id.name) });

  function walkDefaults(node, scope) {
    if (!node) return;
    switch (node.type) {
      case "AssignmentPattern": walkDefaults(node.left, scope); walk(node.right, scope); return;
      case "ObjectPattern":
        node.properties.forEach((p) => {
          if (p.type === "RestElement") return walkDefaults(p.argument, scope);
          if (p.computed) walk(p.key, scope);
          walkDefaults(p.value, scope);
        });
        return;
      case "ArrayPattern": node.elements.forEach((e) => walkDefaults(e, scope)); return;
      case "RestElement": walkDefaults(node.argument, scope); return;
      case "MemberExpression": walk(node, scope); return;
      default: return;
    }
  }

  function writePattern(node, scope) {
    if (!node) return;
    switch (node.type) {
      case "Identifier": ref(node, scope, true); return;
      case "MemberExpression": walk(node, scope); return;
      case "AssignmentPattern": writePattern(node.left, scope); walk(node.right, scope); return;
      case "ObjectPattern":
        node.properties.forEach((p) => {
          if (p.type === "RestElement") return writePattern(p.argument, scope);
          if (p.computed) walk(p.key, scope);
          writePattern(p.value, scope);
        });
        return;
      case "ArrayPattern": node.elements.forEach((e) => writePattern(e, scope)); return;
      case "RestElement": writePattern(node.argument, scope); return;
      default: return;
    }
  }

  function walkFunction(node, scope, isRoot) {
    const s = new Scope(scope, "function");
    if (isRoot) nameScope = s;
    if (node.type === "FunctionExpression" && node.id) s.add(node.id.name, "function", node.start);
    node.params.forEach((p) => patternIds(p).forEach((id) => s.add(id.name, "param", -1)));
    if (!isRoot) depth++;
    node.params.forEach((p) => walkDefaults(p, s));
    if (node.body.type === "BlockStatement") {
      node.body.body.forEach((n) => declare(n, s));
      node.body.body.forEach((n) => walk(n, s));
    } else walk(node.body, s);
    if (!isRoot) depth--;
  }

  function walk(node, scope) {
    if (!node || typeof node.type !== "string") return;
    switch (node.type) {
      case "Identifier": ref(node, scope, false); return;
      case "MemberExpression":
        walk(node.object, scope);
        if (node.computed) walk(node.property, scope);
        return;
      case "Property":
        if (node.computed) walk(node.key, scope);
        walk(node.value, scope);
        return;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression": walkFunction(node, scope, false); return;
      case "BlockStatement": {
        const s = new Scope(scope, "block");
        node.body.forEach((n) => declare(n, s));
        node.body.forEach((n) => walk(n, s));
        return;
      }
      case "SwitchStatement": {
        walk(node.discriminant, scope);
        const s = new Scope(scope, "block");
        node.cases.forEach((c) => c.consequent.forEach((n) => declare(n, s)));
        node.cases.forEach((c) => { walk(c.test, s); c.consequent.forEach((n) => walk(n, s)); });
        return;
      }
      case "ForStatement": {
        const s = new Scope(scope, "block");
        if (node.init) declare(node.init, s);
        walk(node.init, s);
        walk(node.test, s);
        walk(node.update, s);
        walk(node.body, s);
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        const s = new Scope(scope, "block");
        if (node.left.type === "VariableDeclaration") {
          declare(node.left, s);
          node.left.declarations.forEach((d) => walkDefaults(d.id, s));
        } else writePattern(node.left, s);
        walk(node.right, s);
        walk(node.body, s);
        return;
      }
      case "CatchClause": {
        const s = new Scope(scope, "block");
        if (node.param) patternIds(node.param).forEach((id) => s.add(id.name, "catch", node.start));
        walkDefaults(node.param, s);
        walk(node.body, s);
        return;
      }
      case "VariableDeclarator": walkDefaults(node.id, scope); walk(node.init, scope); return;
      case "ClassDeclaration":
      case "ClassExpression": {
        const s = new Scope(scope, "block");
        if (node.id) s.add(node.id.name, "class", node.start);
        walk(node.superClass, s);
        depth++;
        for (const m of node.body.body) {
          if (m.type === "StaticBlock") {
            const f = new Scope(s, "function");
            m.body.forEach((n) => declare(n, f));
            m.body.forEach((n) => walk(n, f));
          } else {
            if (m.computed) walk(m.key, s);
            walk(m.value, s);
          }
        }
        depth--;
        return;
      }
      case "AssignmentExpression": writePattern(node.left, scope); walk(node.right, scope); return;
      case "UpdateExpression":
        if (node.argument.type === "Identifier") ref(node.argument, scope, true);
        else walk(node.argument, scope);
        return;
      case "LabeledStatement": walk(node.body, scope); return;
      case "BreakStatement":
      case "ContinueStatement":
      case "MetaProperty":
      case "PrivateIdentifier":
      case "Literal":
      case "TemplateElement":
      case "ThisExpression":
      case "Super":
      case "DebuggerStatement":
      case "EmptyStatement": return;
      default: break;
    }
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c, scope));
      else if (v && typeof v.type === "string") walk(v, scope);
    }
  }

  walkFunction(fn, root, true);
  return { refs, nameScope };
}

// ---- constructs a lifted block cannot carry ------------------------------------
// level: "block" = the block's own function level, "arrow" = inside an arrow (this/arguments
// still the block's), "own" = inside a nested function or class member (nothing escapes).
function scanBlock(stmts, nameIsAsync) {
  const problems = [];
  let awaits = false;
  const bad = (n, what) => problems.push({ line: n.loc.start.line, text: what });

  function visit(n, level, loops, switches, labels) {
    if (!n || typeof n.type !== "string") return;
    const rec = (c, lv = level, lo = loops, sw = switches, lb = labels) => visit(c, lv, lo, sw, lb);
    switch (n.type) {
      case "FunctionDeclaration":
      case "FunctionExpression":
        n.params.forEach((p) => rec(p, "own", 0, 0, new Set()));
        rec(n.body, "own", 0, 0, new Set());
        return;
      case "ArrowFunctionExpression": {
        const lv = level === "own" ? "own" : "arrow";
        n.params.forEach((p) => rec(p, lv, 0, 0, new Set()));
        rec(n.body, lv, 0, 0, new Set());
        return;
      }
      case "ClassDeclaration":
      case "ClassExpression":
        rec(n.superClass);
        for (const m of n.body.body) {
          if (m.type === "StaticBlock") m.body.forEach((c) => rec(c, "own", 0, 0, new Set()));
          else {
            if (m.computed) rec(m.key);
            rec(m.value, "own", 0, 0, new Set());
          }
        }
        return;
      case "MemberExpression":
        rec(n.object);
        if (n.computed) rec(n.property);
        return;
      case "Property":
        if (n.computed) rec(n.key);
        rec(n.value);
        return;
      case "Identifier":
        if (n.name === "arguments" && level !== "own") bad(n, "uses `arguments`");
        return;
      case "ThisExpression": if (level !== "own") bad(n, "uses `this`"); return;
      case "Super": if (level !== "own") bad(n, "uses `super`"); return;
      case "MetaProperty": if (n.meta.name === "new" && level !== "own") bad(n, "uses `new.target`"); return;
      case "ReturnStatement":
        if (level === "block") bad(n, "contains `return`");
        rec(n.argument);
        return;
      case "AwaitExpression":
        if (level === "block") awaits = true;
        rec(n.argument);
        return;
      case "YieldExpression":
        if (level === "block") bad(n, "contains `yield`");
        rec(n.argument);
        return;
      case "BreakStatement":
        if (level === "block") {
          if (n.label) { if (!labels.has(n.label.name)) bad(n, `breaks to label ${n.label.name} outside the block`); }
          else if (!loops && !switches) bad(n, "has a `break` that targets a loop or switch outside the block");
        }
        return;
      case "ContinueStatement":
        if (level === "block") {
          if (n.label) { if (!labels.has(n.label.name)) bad(n, `continues label ${n.label.name} outside the block`); }
          else if (!loops) bad(n, "has a `continue` that targets a loop outside the block");
        }
        return;
      case "LabeledStatement": rec(n.body, level, loops, switches, new Set([...labels, n.label.name])); return;
      case "ForStatement": case "WhileStatement": case "DoWhileStatement": case "ForInStatement": case "ForOfStatement":
        if (n.type === "ForOfStatement" && n.await && level === "block") awaits = true;
        for (const key of ["init", "test", "update", "left", "right"]) rec(n[key]);
        rec(n.body, level, loops + 1, switches, labels);
        return;
      case "SwitchStatement":
        rec(n.discriminant);
        n.cases.forEach((c) => { rec(c.test); c.consequent.forEach((s) => rec(s, level, loops, switches + 1, labels)); });
        return;
      case "CallExpression":
        if (n.callee.type === "Identifier" && n.callee.name === "eval") bad(n, "calls eval(...) directly");
        break;
      case "Literal":
      case "TemplateElement":
      case "PrivateIdentifier": return;
      default: break;
    }
    for (const key of Object.keys(n)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && rec(c));
      else if (v && typeof v.type === "string") rec(v);
    }
  }
  stmts.forEach((s) => visit(s, "block", 0, 0, new Set()));
  if (awaits && !nameIsAsync) problems.push({ line: stmts[0].loc.start.line, text: "contains `await` but the function is not async" });
  return { problems, awaits };
}

// ---- text helpers ------------------------------------------------------------------
function lineStart(text, offset) { return text.lastIndexOf("\n", offset - 1) + 1; }
function afterLine(text, offset) {
  const i = text.indexOf("\n", offset);
  return i < 0 ? text.length : i + 1;
}

function lastCommentEndingBefore(comments, offset) {
  let lo = 0, hi = comments.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (comments[mid].end <= offset) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// first line of a statement with the comment lines directly above it (no blank line between)
function leadStart(src, stmt, floor, comments) {
  let start = stmt.start;
  for (let i = lastCommentEndingBefore(comments, start); i >= 0; i--) {
    const c = comments[i];
    if (c.start < floor) break;
    if (!/^[ \t]*\n?[ \t]*$/.test(src.slice(c.end, start))) break;
    if (src.slice(lineStart(src, c.start), c.start).trim() !== "") break;
    start = c.start;
  }
  const ls = lineStart(src, start);
  if (src.slice(ls, start).trim() !== "") return { error: "shares its first line with other code" };
  return { chunkStart: ls };
}

// end of a statement's last line, including a same-line trailing comment
function trailEnd(src, stmt) {
  const nl = src.indexOf("\n", stmt.end);
  const lineEnd = nl < 0 ? src.length : nl;
  const m = /^(\s*;)?(\s*(?:\/\/.*|\/\*.*\*\/))?\s*$/.exec(src.slice(stmt.end, lineEnd));
  if (!m) return { error: "shares its last line with other code" };
  return { textEnd: stmt.end + (m[1] ? m[1].length : 0) + (m[2] ? m[2].trimEnd().length : 0) };
}

function wrapList(items, indent, width = WIDTH) {
  const lines = [];
  let cur = "";
  for (const it of items) {
    const tok = it + ",";
    if (!cur) cur = indent + tok;
    else if ((cur + " " + tok).length <= width) cur += " " + tok;
    else { lines.push(cur); cur = indent + tok; }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

// `head(a, b)tail`, wrapped when it does not fit on one line
function callLike(indent, head, items, tail) {
  const one = `${indent}${head}(${items.join(", ")})${tail}`;
  if (one.length <= WIDTH || !items.length) return one;
  return `${indent}${head}(\n${wrapList(items, indent + "  ")}\n${indent})${tail}`;
}

function braceList(indent, prefix, names, suffix) {
  const one = `${indent}${prefix}{ ${names.join(", ")} }${suffix}`;
  if (one.length <= WIDTH) return one;
  return `${indent}${prefix}{\n${wrapList(names, indent + "  ")}\n${indent}}${suffix}`;
}

function parseRange(spec) {
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(spec || "").trim());
  if (!m) throw new Abort(`bad --lines "${spec ?? ""}" (want 120-480)`);
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

function findFunction(ast, name) {
  for (const stmt of ast.body) {
    const d = (stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration") && stmt.declaration ? stmt.declaration : stmt;
    if (d.type === "FunctionDeclaration" && d.id && d.id.name === name) return { stmt, fn: d };
  }
  throw new Abort(`${name} is not a top-level function declaration in this file`);
}

function freeNameSet(text, file) {
  const set = new Set();
  analyze(parse(text, file).ast, (n) => set.add(n.name), GLOBALS);
  return set;
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

// ---- --outline ------------------------------------------------------------------------
function kindOf(s) {
  switch (s.type) {
    case "VariableDeclaration": return s.kind;
    case "FunctionDeclaration": return "function";
    case "ClassDeclaration": return "class";
    case "ExpressionStatement": return "expr";
    case "ForInStatement": return "for-in";
    case "ForOfStatement": return "for-of";
    default: return s.type.replace(/Statement$/, "").replace(/^./, (c) => c.toLowerCase());
  }
}

function commentText(c) {
  if (c.type === "Line") return c.value.trim();
  const first = c.value.split("\n").map((l) => l.replace(/^\s*\*?\s?/, "").trim()).find(Boolean);
  return first || "";
}

export function outlineFunction(opts) {
  const result = { ok: false, errors: [], lines: [], statements: 0, report: "" };
  try {
    if (!opts.file || !opts.fn) throw new Abort("need --file and --fn");
    if (!fs.existsSync(opts.file)) throw new Abort(`${opts.file} does not exist`);
    const src = norm(fs.readFileSync(opts.file, "utf8"));
    const { ast, comments } = parse(src, opts.file);
    const { fn } = findFunction(ast, opts.fn);
    const body = fn.body.body;
    let prevEnd = fn.body.start + 1;
    for (const s of body) {
      for (const c of comments) {
        if (c.start < prevEnd || c.end > s.start) continue;
        if (src.slice(lineStart(src, c.start), c.start).trim() !== "") continue; // trailing comment of a line above
        result.lines.push(`${c.loc.start.line}\t## ${commentText(c)}`);
      }
      const scope = new Scope(null, "function");
      declare(s, scope);
      const names = [...scope.names.keys()].join(",") || "-";
      const head = src.slice(s.start, s.end).replace(/\s+/g, " ").trim().slice(0, 70);
      result.lines.push(`${s.loc.start.line}-${s.loc.end.line}\t${kindOf(s)}\t${names}\t${head}`);
      prevEnd = s.end;
    }
    result.statements = body.length;
    result.report = result.lines.join("\n");
    result.summary = `${opts.fn}: lines ${fn.loc.start.line}-${fn.loc.end.line}, ${body.length} top-level statements`;
    result.ok = true;
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    result.errors = e.messages;
    result.report = ["extract_block: ABORTED", ...e.messages.map((m) => "  " + m)].join("\n");
  }
  return result;
}

// ---- --box ---------------------------------------------------------------------------------
function allIdentifierNames(node, set = new Set()) {
  if (!node || typeof node.type !== "string") return set;
  if (node.type === "Identifier") set.add(node.name);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && allIdentifierNames(c, set));
    else if (v && typeof v.type === "string") allIdentifierNames(v, set);
  }
  return set;
}

// every declaration NAME's own function level makes: var anywhere (not inside nested functions),
// let/const/function/class at the top of its body, and for-head declarations (flagged)
function collectOwnDeclarations(fn) {
  const decls = [];
  const others = new Map(); // top-level function / class declarations: name -> [{kind, node}]
  const top = new Set(fn.body.body);
  const visitDecl = (node, inList, inHead) => {
    for (const d of node.declarations)
      for (const id of patternIds(d.id))
        decls.push({ name: id.name, kind: node.kind, stmt: node, d, inHead, inList, topLevel: top.has(node), destructured: d.id.type !== "Identifier" });
  };
  const visit = (node, inList) => {
    if (!node) return;
    switch (node.type) {
      case "VariableDeclaration": visitDecl(node, inList, false); return;
      case "FunctionDeclaration":
      case "ClassDeclaration":
        if (top.has(node) && node.id) {
          if (!others.has(node.id.name)) others.set(node.id.name, []);
          others.get(node.id.name).push({ kind: node.type === "FunctionDeclaration" ? "function" : "class", node });
        }
        return;
      case "BlockStatement": node.body.forEach((n) => visit(n, true)); return;
      case "IfStatement": visit(node.consequent, false); visit(node.alternate, false); return;
      case "ForStatement":
        if (node.init && node.init.type === "VariableDeclaration") visitDecl(node.init, false, true);
        visit(node.body, false);
        return;
      case "ForInStatement":
      case "ForOfStatement":
        if (node.left.type === "VariableDeclaration") visitDecl(node.left, false, true);
        visit(node.body, false);
        return;
      case "WhileStatement":
      case "DoWhileStatement":
      case "LabeledStatement": visit(node.body, false); return;
      case "TryStatement":
        visit(node.block, true);
        if (node.handler) visit(node.handler.body, true);
        visit(node.finalizer, true);
        return;
      case "SwitchStatement": node.cases.forEach((c) => c.consequent.forEach((n) => visit(n, true))); return;
      default: return;
    }
  };
  fn.body.body.forEach((n) => visit(n, true));
  return { decls, others };
}

// identifier starts that are the key of a shorthand property (`{ a }`, `({ a } = o)`, `{ a = 1 }`)
function shorthandStarts(node, set = new Set()) {
  if (!node || typeof node.type !== "string") return set;
  if (node.type === "Property" && node.shorthand) set.add(node.key.start);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && shorthandStarts(c, set));
    else if (v && typeof v.type === "string") shorthandStarts(v, set);
  }
  return set;
}

function normaliseBox(box) {
  if (!box) return [];
  const list = Array.isArray(box) ? box : String(box).split(",");
  return [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
}

// a module-level `const NAME = { ... }` a former run left behind, when it is a plain object literal
function findModuleHolder(src, ast, comments, holder) {
  for (const s of ast.body) {
    const d = s.type === "ExportNamedDeclaration" && s.declaration ? s.declaration : s;
    if (d.type !== "VariableDeclaration") continue;
    for (const dc of d.declarations) {
      if (dc.id.type !== "Identifier" || dc.id.name !== holder) continue;
      const init = dc.init;
      const plain = d.kind === "const" && init && init.type === "ObjectExpression"
        && init.properties.every((p) => p.type === "Property" && !p.computed && !p.shorthand && p.kind === "init" && p.key.type === "Identifier");
      if (!plain) return { error: `${holder} exists at module level but is not a const plain object literal` };
      if (comments.some((c) => c.start >= init.start && c.end <= init.end)) return { error: `${holder}'s object literal contains comments; refusing to regenerate it` };
      return {
        init, stmt: d,
        props: init.properties.map((p) => ({ key: p.key.name, text: src.slice(p.value.start, p.value.end) })),
      };
    }
  }
  return null;
}

// opts: { scope: "function" | "module", block: { start, end, insertAt, indent } }
// `block` is the block a following lift will move: boxed function declarations inside it get
// their `HOLDER.f = f;` as the first statement of that block instead of the first of NAME.
function boxLocals(src, ast, comments, fnName, names, holderOpt, file, opts = {}) {
  const { fn, stmt: topStmt } = findFunction(ast, fnName);
  const moduleScope = opts.scope === "module";
  const holder = holderOpt || `${fnName}Locals`;
  const bad = [];
  if (!/^[A-Za-z_$][\w$]*$/.test(holder)) throw new Abort(`${holder} is not a valid holder name`);
  for (const n of names) if (!/^[A-Za-z_$][\w$]*$/.test(n)) bad.push(`${n} is not a valid identifier`);
  if (bad.length) throw new Abort(bad);
  const { refs, nameScope } = resolveRefs(fn);
  const used = allIdentifierNames(ast);
  let existing = null;
  if (used.has(holder) || GLOBALS.has(holder)) {
    const found = moduleScope && !GLOBALS.has(holder) && !nameScope.names.has(holder) ? findModuleHolder(src, ast, comments, holder) : null;
    if (found && found.error) bad.push(found.error);
    else if (found) existing = found;
    else bad.push(`holder name ${holder} is already used in the module (pick another with --holder)`);
  }
  if (refs.some((r) => r.name === "eval")) bad.push(`${fnName} uses eval; the boxed names could be reached dynamically`);
  const { decls, others } = collectOwnDeclarations(fn);
  const params = new Set();
  fn.params.forEach((p) => patternIds(p).forEach((id) => params.add(id.name)));
  const lineOf = (off) => src.slice(0, off).split("\n").length;
  const existingKeys = new Set(existing ? existing.props.map((p) => p.key) : []);
  const already = names.filter((n) => existingKeys.has(n));
  const fresh = names.filter((n) => !existingKeys.has(n));
  for (const n of already)
    if (params.has(n) || others.has(n) || decls.some((x) => x.name === n && (x.kind === "var" || x.topLevel)))
      bad.push(`${n} is already a property of ${holder} but ${fnName} still declares it`);
  const boxSet = new Set(fresh);
  const mine = new Map(); // name -> {decl} (var/let/const) or {func} (function declaration)
  for (const n of fresh) {
    const own = decls.filter((x) => x.name === n && (x.kind === "var" || x.topLevel));
    const fnDecls = others.get(n) || [];
    if (params.has(n)) { bad.push(`${n} is a param of ${fnName}`); continue; }
    if (fnDecls.some((x) => x.kind === "class")) { bad.push(`line ${lineOf(fnDecls[0].node.start)}: ${n} is a class declaration; classes cannot be boxed`); continue; }
    if (!moduleScope && fnDecls.length) { bad.push(`${n} is a ${fnDecls[0].kind} declaration in ${fnName}, not var/let`); continue; }
    if (!own.length && !fnDecls.length) { bad.push(`${n} is not declared with var/let${moduleScope ? "/const or function" : ""} in the body of ${fnName}`); continue; }
    const consts = own.filter((x) => x.kind === "const");
    if (!moduleScope && consts.length) { bad.push(`line ${lineOf(consts[0].stmt.start)}: ${n} is a const`); continue; }
    const head = own.find((x) => x.inHead);
    if (head) { bad.push(`line ${lineOf(head.stmt.start)}: ${n} is declared in a for-loop head`); continue; }
    const destr = own.find((x) => x.destructured);
    if (destr && !moduleScope) { bad.push(`line ${lineOf(destr.stmt.start)}: ${n} is declared by a destructuring pattern`); continue; }
    if (destr) {
      const miss = patternIds(destr.d.id).filter((id) => !boxSet.has(id.name)).map((id) => id.name);
      if (miss.length) { bad.push(`line ${lineOf(destr.stmt.start)}: ${n} is declared by a destructuring pattern that also declares ${miss.join(", ")}; box all of its names or none`); continue; }
    }
    const total = own.length + fnDecls.length;
    if (total !== 1) {
      const at = [...own.map((x) => x.stmt.start), ...fnDecls.map((x) => x.node.start)].sort((a, b) => a - b);
      bad.push(`${n} is declared ${total} times in ${fnName} (lines ${at.map(lineOf).join(", ")})`);
      continue;
    }
    mine.set(n, own.length ? { decl: own[0] } : { func: fnDecls[0].node });
  }
  if (bad.length) throw new Abort(bad);

  const perName = new Map(fresh.map((n) => [n, { refs: 0, assigned: 0, removed: 0 }]));
  const info = { names: [...fresh], already, holder, scope: moduleScope ? "module" : "function", reused: !!existing,
    sites: { refs: 0, assigned: 0, removed: 0, functions: 0 }, perName: {} };
  const lines = [];
  const say = (text) => lines.push(text);
  const finishInfo = () => {
    info.perName = Object.fromEntries(perName);
    say(`box: ${fresh.length} new name(s) -> ${holder} (${info.scope} scope, ${existing ? `reusing a holder with ${existing.props.length} name(s)` : "new holder"}): ${fresh.join(", ") || "-"}`);
    if (already.length) say(`box: already boxed (${already.length}): ${already.join(", ")}`);
    const s = info.sites;
    say(`box sites rewritten: ${s.refs + s.assigned + s.removed + s.functions} (${s.refs} references, ${s.assigned} declarations -> assignments, ${s.removed} declarations removed, ${s.functions} function assignments added)`);
    for (const n of fresh) {
      const p = perName.get(n);
      say(`  ${n}: ${p.refs} references${mine.get(n).func ? ", function (assignment added)" : `, ${p.assigned} assigned, ${p.removed} removed`}`);
    }
  };
  if (!fresh.length) {
    finishInfo();
    return { text: src, info, lines, mapOffset: (p) => p };
  }

  // leaf edits: every reference to a boxed binding
  const shorthand = shorthandStarts(fn);
  const leaf = [];
  const seenAt = new Set();
  for (const r of refs) {
    if (r.scope !== nameScope || !boxSet.has(r.name) || seenAt.has(r.id.start)) continue;
    seenAt.add(r.id.start);
    leaf.push({ start: r.id.start, end: r.id.end, text: shorthand.has(r.id.start) ? `${r.name}: ${holder}.${r.name}` : `${holder}.${r.name}` });
    perName.get(r.name).refs++;
  }
  leaf.sort((a, b) => a.start - b.start);
  const render = (from, to, extra = []) => {
    let out = "", pos = from;
    const all = extra.length ? [...leaf, ...extra].sort((a, b) => a.start - b.start) : leaf;
    for (const e of all) {
      if (e.start < from || e.end > to) continue;
      out += src.slice(pos, e.start) + e.text;
      pos = e.end;
    }
    return out + src.slice(pos, to);
  };

  // declaration statements
  const stmtEdits = [];
  const stmts = new Map(); // VariableDeclaration -> inList
  for (const x of mine.values()) if (x.decl) stmts.set(x.decl.stmt, x.decl.inList);
  for (const [stmt, inList] of stmts) {
    const pieces = [];
    let keep = [];
    const flush = () => {
      if (keep.length) pieces.push(`${stmt.kind} ${keep.map((d) => render(d.start, d.end)).join(", ")};`);
      keep = [];
    };
    for (const d of stmt.declarations) {
      if (d.id.type === "Identifier" && boxSet.has(d.id.name)) {
        flush();
        if (d.init) { pieces.push(`${holder}.${d.id.name} = ${render(d.init.start, d.init.end)};`); perName.get(d.id.name).assigned++; }
        else perName.get(d.id.name).removed++;
      } else if (d.id.type !== "Identifier" && patternIds(d.id).some((id) => boxSet.has(id.name))) {
        // destructuring declaration -> destructuring assignment into the holder's properties
        flush();
        const ids = patternIds(d.id);
        const extra = ids.map((id) => ({ start: id.start, end: id.end, text: shorthand.has(id.start) ? `${id.name}: ${holder}.${id.name}` : `${holder}.${id.name}` }));
        ids.forEach((id) => perName.get(id.name).assigned++);
        const target = render(d.id.start, d.id.end, extra), value = render(d.init.start, d.init.end);
        pieces.push(d.id.type === "ObjectPattern" ? `(${target} = ${value});` : `${target} = ${value};`);
      } else keep.push(d);
    }
    flush();
    const ls = lineStart(src, stmt.start);
    const alone = src.slice(ls, stmt.start).trim() === "";
    const indent = alone ? src.slice(ls, stmt.start) : "";
    let start = stmt.start, end = stmt.end, text;
    if (!pieces.length) {
      if (!inList) text = ";";
      else {
        const nl = src.indexOf("\n", stmt.end);
        const rest = src.slice(stmt.end, nl < 0 ? src.length : nl);
        if (alone && rest.trim() === "") { start = ls; end = nl < 0 ? src.length : nl + 1; }
        text = "";
      }
    } else if (!inList && pieces.length > 1) text = `{ ${pieces.join(" ")} }`;
    else text = pieces.join(alone ? "\n" + indent : " ");
    stmtEdits.push({ start, end, text, inner: [stmt.start, stmt.end] });
  }
  const edits = [...stmtEdits];
  for (const e of leaf)
    if (!stmtEdits.some((s) => e.start >= s.inner[0] && e.end <= s.inner[1])) edits.push(e);

  const body = fn.body.body;
  let after = fn.body.start + 1, k = 0;
  while (k < body.length && body[k].type === "ExpressionStatement" && body[k].directive) after = body[k++].end;
  let indent = "  ";
  const firstStmt = body[k];
  if (firstStmt) {
    const ls = lineStart(src, firstStmt.start);
    if (src.slice(ls, firstStmt.start).trim() === "") indent = src.slice(ls, firstStmt.start);
    else indent = /^[ \t]*/.exec(src.slice(lineStart(src, fn.start), fn.start))[0] + "  ";
  }

  // boxed function declarations: the declaration stays (hoisting), the holder gets it up front
  const inBlock = (node) => opts.block && node.start >= opts.block.start && node.end <= opts.block.end;
  const funcs = fresh.filter((n) => mine.get(n).func);
  const upFront = funcs.filter((n) => !inBlock(mine.get(n).func));
  const inside = funcs.filter((n) => inBlock(mine.get(n).func));
  if (upFront.length) edits.push({ start: after, end: after, text: upFront.map((n) => `\n${indent}${holder}.${n} = ${n};`).join("") });
  if (inside.length)
    edits.push({ start: opts.block.insertAt, end: opts.block.insertAt, atStart: true, text: inside.map((n) => `${opts.block.indent}${holder}.${n} = ${n};\n`).join("") });
  info.sites.functions = funcs.length;

  // the holder
  const items = fresh.map((n) => `${n}: undefined`);
  if (!moduleScope) {
    const one = `${indent}const ${holder} = { ${items.join(", ")} };`;
    const holderText = one.length <= WIDTH ? one : `${indent}const ${holder} = {\n${wrapList(items, indent + "  ")}\n${indent}};`;
    edits.push({ start: after, end: after, text: "\n" + holderText });
  } else if (existing) {
    const all = [...existing.props.map((p) => `${p.key}: ${p.text}`), ...items];
    const ls = lineStart(src, existing.stmt.start);
    const ind = /^[ \t]*/.exec(src.slice(ls, existing.stmt.start))[0];
    const lineEndAfter = src.slice(ls, existing.init.start) + `{ ${all.join(", ")} }` + src.slice(existing.init.end, afterLine(src, existing.init.end)).replace(/\n$/, "");
    const lit = lineEndAfter.length <= WIDTH ? `{ ${all.join(", ")} }` : `{\n${wrapList(all, ind + "  ")}\n${ind}}`;
    edits.push({ start: existing.init.start, end: existing.init.end, text: lit });
  } else {
    const idx = ast.body.indexOf(topStmt);
    const lead = leadStart(src, topStmt, idx > 0 ? ast.body[idx - 1].end : 0, comments);
    const ms = lead.error ? lineStart(src, topStmt.start) : lead.chunkStart;
    const one = `const ${holder} = { ${items.join(", ")} };`;
    const decl = one.length <= WIDTH ? one : `const ${holder} = {\n${wrapList(items, "  ")}\n};`;
    edits.push({ start: ms, end: ms, text: decl + "\n\n" });
  }

  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  let text = src;
  for (let i = edits.length - 1; i >= 0; i--) text = text.slice(0, edits[i].start) + edits[i].text + text.slice(edits[i].end);

  // verification
  const { ast: ast2 } = parse(text, "the boxed result");
  const beforeFree = freeNameSet(src, file);
  const afterFree = freeNameSet(text, "the boxed result");
  const added = [...afterFree].filter((n) => !beforeFree.has(n));
  if (added.length) throw new Abort([`box verification failed: new free identifier(s) ${added.join(", ")}`]);
  const fn2 = findFunction(ast2, fnName).fn;
  const r2 = resolveRefs(fn2);
  const leftover = r2.refs.filter((r) => boxSet.has(r.name) && (mine.get(r.name).func ? r.scope === r2.nameScope : r.scope === null));
  const expectFuncRefs = new Map(funcs.map((n) => [n, 1]));
  for (const r of leftover) {
    if (mine.get(r.name).func && expectFuncRefs.get(r.name) > 0) { expectFuncRefs.set(r.name, expectFuncRefs.get(r.name) - 1); continue; }
    throw new Abort([`box verification failed: unrewritten reference to ${r.name} at line ${r.id.loc.start.line}`]);
  }

  const mapOffset = (p, side) => {
    let delta = 0;
    for (const e of edits) {
      if (e.end <= p && !(e.atStart && e.start === p)) delta += e.text.length - (e.end - e.start);
      else if (e.start < p) return side === "end" ? e.start + delta + e.text.length : null;
      else break;
    }
    return p + delta;
  };
  info.sites.refs = leaf.length;
  for (const v of perName.values()) { info.sites.assigned += v.assigned; info.sites.removed += v.removed; }
  finishInfo();
  return { text, info, lines, mapOffset };
}

// the statements of NAME that start in lines A..B, with their text range
function selectBlock(src, ast, comments, fnName, A, B) {
  const { stmt: topStmt, fn } = findFunction(ast, fnName);
  const body = fn.body.body;
  for (const s of body)
    if (s.loc.start.line < A && s.loc.end.line >= A)
      throw new Abort(`line ${A} falls inside the statement at lines ${s.loc.start.line}-${s.loc.end.line}; start the range at a statement (use --outline)`);
  const idx = body.map((s, i) => i).filter((i) => body[i].loc.start.line >= A && body[i].loc.start.line <= B);
  if (!idx.length) throw new Abort(`no top-level statement of ${fnName} starts in lines ${A}-${B}`);
  const first = body[idx[0]], last = body[idx[idx.length - 1]];
  const lead = leadStart(src, first, idx[0] ? body[idx[0] - 1].end : fn.body.start + 1, comments);
  const trail = trailEnd(src, last);
  const shape = [];
  if (lead.error) shape.push(`the block's first statement (line ${first.loc.start.line}) ${lead.error}`);
  if (trail.error) shape.push(`the block's last statement (line ${last.loc.start.line}) ${trail.error}`);
  if (shape.length) throw new Abort(shape);
  return { topStmt, fn, body, idx, first, last, lead, trail, bs: first.start, be: last.end, blockStmts: idx.map((i) => body[i]),
    chunkStart: lead.chunkStart, textEnd: trail.textEnd };
}

// --box-for A-B: the NAME-scope bindings the block reads or writes, plus the ones it declares
// that code outside it uses (unless the block is only function declarations, which lift as is)
function planBoxFor(src, ast, comments, o, A, B) {
  const sel = selectBlock(src, ast, comments, o.fn, A, B);
  const { refs, nameScope } = resolveRefs(sel.fn);
  const blockScope = new Scope(null, "function");
  sel.blockStmts.forEach((s) => declare(s, blockScope));
  const blockDecls = blockScope.names;
  const inBlock = (r) => r.id.start >= sel.bs && r.id.end <= sel.be;
  const functionOnly = sel.blockStmts.every((s) => s.type === "FunctionDeclaration");
  const problems = [];
  const scan = scanBlock(sel.blockStmts, !!sel.fn.async);
  scan.problems.forEach((p) => problems.push({ line: p.line, text: `the block ${p.text}` }));
  if (scan.awaits) problems.push({ line: sel.first.loc.start.line, text: "the block contains `await`" });
  const need = new Map(); // name -> declaration offset
  for (const r of refs) {
    if (r.scope !== nameScope) continue;
    if (inBlock(r) && !blockDecls.has(r.name)) need.set(r.name, nameScope.names.get(r.name).at);
    else if (!functionOnly && !inBlock(r) && blockDecls.has(r.name)) {
      const d = blockDecls.get(r.name);
      need.set(r.name, d.at);
      if (d.kind === "function" && r.id.start < sel.bs)
        problems.push({ line: r.id.loc.start.line, text: `${r.name} is a function declared by the block but used before it; boxing it would lose hoisting` });
    }
  }
  if (problems.length) throw new Abort(problems.sort((a, b) => a.line - b.line).map((p) => `line ${p.line}: ${p.text}`));
  const ls = lineStart(src, sel.first.start);
  const names = [...need.keys()].sort((a, b) => need.get(a) - need.get(b));
  return {
    names,
    block: { start: sel.bs, end: sel.be, insertAt: ls, indent: /^[ \t]*/.exec(src.slice(ls, sel.first.start))[0] },
  };
}

function lineOffset(text, L) {
  let idx = 0;
  for (let i = 1; i < L; i++) {
    idx = text.indexOf("\n", idx);
    if (idx < 0) return text.length;
    idx++;
  }
  return idx;
}

// ---- --lines A-B --name NEWNAME ----------------------------------------------------------
export function extractBlock(opts) {
  const o = { dry: false, ...opts };
  const result = { ok: false, written: false, errors: [], report: "" };
  try {
    run(o, result);
    result.ok = true;
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    result.errors = e.messages;
    result.report = ["extract_block: REFUSED, nothing written", ...e.messages.map((m) => "  " + m)].join("\n");
  }
  return result;
}

function run(o, result) {
  if (!o.file || !o.fn) throw new Abort("need --file and --fn");
  const scope = o.holderScope || "function";
  if (scope !== "function" && scope !== "module") throw new Abort(`--holder-scope must be function or module, not ${scope}`);
  if (o.boxFor && scope !== "module") throw new Abort("--box-for needs --holder-scope module");
  if (o.boxFor && o.lines) throw new Abort("--box-for replaces --lines; give one of them");
  const lineSpec = o.boxFor || o.lines;
  const boxNames = normaliseBox(o.box);
  if (!boxNames.length && !lineSpec) throw new Abort("need --lines (and --name) to lift a block, or --box to box locals");
  if (!lineSpec && o.name) throw new Abort("--name needs --lines or --box-for");
  if ((o.holder || o.holderScope) && !boxNames.length && !o.boxFor) throw new Abort("--holder and --holder-scope need --box or --box-for");
  if (o.name && !/^[A-Za-z_$][\w$]*$/.test(o.name)) throw new Abort(`${o.name} is not a valid function name`);
  if (!fs.existsSync(o.file)) throw new Abort(`${o.file} does not exist`);
  const origSrc = norm(fs.readFileSync(o.file, "utf8"));
  let src = origSrc;
  let { ast, comments } = parse(src, o.file);

  // ---- --box / --box-for first
  let box = null;
  let names = boxNames;
  let boxOpts = { scope };
  if (o.boxFor) {
    const [pa, pb] = parseRange(o.boxFor);
    const plan = planBoxFor(src, ast, comments, o, pa, pb);
    names = [...new Set([...boxNames, ...plan.names])];
    boxOpts = { scope, block: plan.block };
  }
  if (names.length || o.boxFor) {
    box = boxLocals(src, ast, comments, o.fn, names, o.holder, o.file, boxOpts);
    result.box = box.info;
    if (!lineSpec) {
      result.report = [`extract_block: ${o.file}  ${o.fn}() --box${o.dry ? "  [dry run, nothing written]" : ""}`, ...box.lines].join("\n");
      if (o.dry) return;
      writeVerified(o.file, box.text);
      result.written = true;
      return;
    }
    src = box.text;
    ({ ast, comments } = parse(src, "the boxed text"));
  }
  let [A, B] = parseRange(lineSpec);
  if (box) {
    const a = box.mapOffset(lineOffset(origSrc, A), "start");
    if (a == null) throw new Abort(`line ${A} falls inside a statement that --box rewrites; start the range at a statement (use --outline)`);
    const b = box.mapOffset(lineOffset(origSrc, B + 1), "end");
    const lineAt = (off) => src.slice(0, off).split("\n").length;
    A = lineAt(a);
    B = lineAt(b) - 1;
  }
  const { topStmt, fn, blockStmts, first, last, lead, trail, bs, be } = selectBlock(src, ast, comments, o.fn, A, B);

  // ---- analysis
  const { refs, nameScope } = resolveRefs(fn);
  const blockScope = new Scope(null, "function");
  blockStmts.forEach((s) => declare(s, blockScope));
  const blockDecls = blockScope.names;
  const inBlock = (r) => r.id.start >= bs && r.id.end <= be;
  const problems = [];
  const refuse = (line, text) => problems.push({ line, text });

  // names at module level
  const taken = new Set();
  for (const s of ast.body) {
    const sc = new Scope(null, "module");
    declare(s, sc);
    sc.names.forEach((_, n) => taken.add(n));
    if (s.type === "ImportDeclaration") s.specifiers.forEach((sp) => taken.add(sp.local.name));
  }
  const beforeFree = freeNameSet(src, o.file);

  const chunkStart = lead.chunkStart, textEnd = trail.textEnd;
  const blockText = src.slice(chunkStart, textEnd);
  const lineNo = (off) => src.slice(0, off).split("\n").length;
  const reportHead = [`extract_block: ${o.file}  ${o.fn}() -> ${o.name || "(pure functions)"}${o.dry ? "  [dry run, nothing written]" : ""}`,
    ...(box ? box.lines : [])];

  // ---- pure function declarations: lifted as plain top-level functions
  if (blockStmts.every((s) => s.type === "FunctionDeclaration")) {
    const fnNames = blockStmts.map((s) => s.id.name);
    const impure = refs.filter((r) => inBlock(r) && r.scope === nameScope && !blockDecls.has(r.name));
    const reassigned = refs.filter((r) => r.write && r.scope === nameScope && blockDecls.has(r.name));
    const pure = !impure.length && !reassigned.length;
    const usedEarlier = refs.some((r) => r.scope === nameScope && blockDecls.has(r.name) && r.id.start < bs);
    if (pure && (!o.name || usedEarlier || o.boxFor)) {
      fnNames.forEach((n, i) => {
        if (fnNames.indexOf(n) !== i) refuse(blockStmts[i].loc.start.line, `${n} is declared twice in the block`);
        else if (taken.has(n) || beforeFree.has(n) || GLOBALS.has(n)) refuse(blockStmts[i].loc.start.line, `${n} already exists in the module`);
      });
      if (problems.length) throw new Abort(problems.sort((a, b) => a.line - b.line).map((p) => `line ${p.line}: ${p.text}`));
      let removeEnd = afterLine(src, textEnd);
      if (src.slice(0, chunkStart).endsWith("\n\n") && src.slice(removeEnd).startsWith("\n")) removeEnd++;
      const insertAt = afterLine(src, topStmt.end);
      const insertText = (src.slice(0, insertAt).endsWith("\n") ? "" : "\n") + `\n// lifted out of ${o.fn}()\n${blockText}\n`;
      const out = src.slice(0, chunkStart) + src.slice(removeEnd, insertAt) + insertText + src.slice(insertAt);
      const { ast: ast2 } = parse(out, "the result");
      const added = [...freeNameSet(out, "the result")].filter((n) => !beforeFree.has(n));
      if (added.length) throw new Abort([`verification failed: new free identifier(s) ${added.join(", ")}`]);
      const f2 = findFunction(ast2, o.fn).fn;
      fnNames.forEach((n) => findFunction(ast2, n));
      const movedLines = blockText.split("\n").length;
      const before = fn.loc.end.line - fn.loc.start.line + 1, now = f2.loc.end.line - f2.loc.start.line + 1;
      result.params = [];
      result.returned = [];
      result.pure = true;
      result.functions = fnNames;
      result.movedLines = movedLines;
      result.newLength = now;
      result.async = false;
      result.report = [
        ...reportHead,
        `pure functions lifted verbatim (${fnNames.length}): ${fnNames.join(", ")}${o.name ? "  (--name ignored)" : ""}`,
        `block lines moved: ${movedLines} (source lines ${lineNo(chunkStart)}-${lineNo(textEnd)})`,
        `${o.fn}: ${before} -> ${now} lines`,
      ].join("\n");
      if (o.dry) return;
      writeVerified(o.file, out);
      result.written = true;
      return;
    }
    if (!o.name)
      throw new Abort([
        "the block holds only function declarations but they are not pure, so --name is needed",
        ...[...new Map(impure.map((r) => [r.name, r])).values()].map((r) => `line ${r.id.loc.start.line}: uses ${r.name}, a binding of ${o.fn}`),
        ...reassigned.slice(0, 5).map((r) => `line ${r.id.loc.start.line}: ${r.name} is assigned`),
      ]);
  }
  if (!o.name) throw new Abort("need --name (only a block of pure function declarations can go without)");

  // params: names of NAME's own scope the block reads, by first use
  const params = [];
  const seen = new Set();
  refs.filter(inBlock).sort((a, b) => a.id.start - b.id.start).forEach((r) => {
    if (r.scope !== nameScope || blockDecls.has(r.name) || seen.has(r.name)) return;
    seen.add(r.name);
    params.push(r.name);
  });
  const paramSet = new Set(params);

  for (const p of params) {
    const info = nameScope.names.get(p);
    if (["let", "const", "class"].includes(info.kind) && info.at >= be)
      refuse(src.slice(0, info.at).split("\n").length, `${p} is a ${info.kind} declared after the block; passing it would read it in its temporal dead zone`);
    if (info.kind === "var" && info.inits.some((at) => at >= be))
      refuse(src.slice(0, info.inits.find((at) => at >= be)).split("\n").length, `${p} is given a value after the block; the lifted copy would never see it`);
  }
  for (const r of refs)
    if (r.write && r.scope === nameScope && paramSet.has(r.name))
      refuse(r.id.loc.start.line, `${r.name} is a param of the lifted function but is assigned here ${inBlock(r) ? "inside" : "outside"} the block; the copy would diverge from the outer binding`);

  // names the block declares and later code uses
  const usedBefore = refs.filter((r) => r.scope === nameScope && blockDecls.has(r.name) && r.id.start < bs);
  const usedAfter = refs.filter((r) => r.scope === nameScope && blockDecls.has(r.name) && r.id.start >= be);
  for (const r of usedBefore) {
    const info = blockDecls.get(r.name);
    refuse(r.id.loc.start.line, `${r.name} is declared by the block (${info.kind}) but used before it${info.kind === "function" ? " (hoisting)" : ""}`);
  }
  const returned = [...blockDecls.keys()].filter((n) => usedAfter.some((r) => r.name === n))
    .sort((a, b) => blockDecls.get(a).at - blockDecls.get(b).at);
  const returnedSet = new Set(returned);
  for (const r of refs) {
    if (!r.write || r.scope !== nameScope || !returnedSet.has(r.name)) continue;
    if (r.id.start >= be) refuse(r.id.loc.start.line, `${r.name} is returned from the lifted function but assigned here after the block`);
    else if (inBlock(r) && r.depth > 0) refuse(r.id.loc.start.line, `${r.name} is returned from the lifted function but a closure inside the block assigns it`);
  }
  for (const n of returned) {
    const info = blockDecls.get(n);
    if (info.kind === "param" || info.kind === "catch") refuse(src.slice(0, info.at).split("\n").length, `${n} cannot be returned`);
  }

  // constructs the block cannot carry
  const scan = scanBlock(blockStmts, !!fn.async);
  scan.problems.forEach((p) => refuse(p.line, `the block ${p.text}`));

  if (o.boxFor && (params.length || returned.length))
    refuse(first.loc.start.line, `--box-for could not remove every dependency of the block (params: ${params.join(", ") || "-"}; returns: ${returned.join(", ") || "-"})`);

  // the new name must be free
  if (taken.has(o.name) || nameScope.names.has(o.name) || beforeFree.has(o.name))
    refuse(fn.loc.start.line, `${o.name} already exists in the module`);

  if (problems.length) {
    const sorted = problems.sort((a, b) => a.line - b.line);
    throw new Abort(sorted.map((p) => `line ${p.line}: ${p.text}`));
  }

  // ---- the new text
  const isAsync = !!fn.async && scan.awaits;
  const indent = /^[ \t]*/.exec(blockText)[0];
  const call = `${isAsync ? "await " : ""}${o.name}`;
  const kinds = new Map(); // declaration kind at the call site -> names
  for (const n of returned) {
    const k = blockDecls.get(n).kind;
    const kind = k === "var" || k === "let" ? k : "const";
    if (!kinds.has(kind)) kinds.set(kind, []);
    kinds.get(kind).push(n);
  }
  let callText;
  if (!returned.length) callText = callLike(indent, call, params, ";");
  else if (kinds.size === 1) {
    const [[kind, names]] = [...kinds];
    callText = braceList(indent, `${kind} `, names, " = ") + callLike(indent, call, params, ";").slice(indent.length);
  } else {
    const all = new Set([...taken, ...beforeFree, ...nameScope.names.keys(), ...blockDecls.keys()]);
    let tmp = `${o.name}Out`;
    for (let i = 2; all.has(tmp); i++) tmp = `${o.name}Out${i}`;
    callText = [callLike(indent, `const ${tmp} = ${call}`, params, ";"),
      ...[...kinds].map(([kind, names]) => braceList(indent, `${kind} `, names, ` = ${tmp};`))].join("\n");
  }

  const retText = returned.length ? "\n" + braceList(indent, "return ", returned, ";") : "";
  const lifted = `// lifted out of ${o.fn}()\n${isAsync ? "async " : ""}function ${callLike("", o.name, params, " {")}\n${blockText}${retText}\n}`;
  const insertAt = afterLine(src, topStmt.end);
  const insertText = (src.slice(0, insertAt).endsWith("\n") ? "" : "\n") + "\n" + lifted + "\n";
  const out = src.slice(0, chunkStart) + callText + src.slice(textEnd, insertAt) + insertText + src.slice(insertAt);

  // ---- verification before anything is written
  const { ast: ast2 } = parse(out, "the result");
  const afterFree = freeNameSet(out, "the result");
  const added = [...afterFree].filter((n) => !beforeFree.has(n));
  if (added.length) throw new Abort([`verification failed: new free identifier(s) ${added.join(", ")}`]);
  const f2 = findFunction(ast2, o.fn).fn;
  findFunction(ast2, o.name); // throws when the lifted function is missing

  const movedLines = blockText.split("\n").length;
  const before = fn.loc.end.line - fn.loc.start.line + 1, now = f2.loc.end.line - f2.loc.start.line + 1;
  result.params = params;
  result.returned = returned;
  result.movedLines = movedLines;
  result.newLength = now;
  result.async = isAsync;
  result.report = [
    ...reportHead,
    `params (${params.length}): ${params.join(", ") || "-"}`,
    `returns (${returned.length}): ${returned.map((n) => `${n} (${blockDecls.get(n).kind})`).join(", ") || "-"}`,
    `block lines moved: ${movedLines} (source lines ${lineNo(chunkStart)}-${lineNo(textEnd)})${isAsync ? ", async" : ""}`,
    `${o.fn}: ${before} -> ${now} lines`,
  ].join("\n");
  if (o.dry) return;
  writeVerified(o.file, out);
  result.written = true;
}

// ---- CLI --------------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { dry: false, outline: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i], inline = null;
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    const val = () => {
      if (inline != null) return inline;
      if (i + 1 >= argv.length) throw new Abort(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case "--file": o.file = val(); break;
      case "--fn": o.fn = val(); break;
      case "--lines": o.lines = val(); break;
      case "--name": o.name = val(); break;
      case "--box": o.box = val(); break;
      case "--holder": o.holder = val(); break;
      case "--holder-scope": o.holderScope = val(); break;
      case "--box-for": o.boxFor = val(); break;
      case "--dry": o.dry = true; break;
      case "--outline": o.outline = true; break;
      case "--help": case "-h": o.help = true; break;
      default: throw new Abort(`unknown argument ${a}`);
    }
  }
  return o;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try { return path.resolve(entry) === fileURLToPath(import.meta.url); } catch (_) { return false; }
}

if (isMainModule()) {
  const usage = "usage: node tools/extract_block.mjs --file F --fn NAME --outline\n       node tools/extract_block.mjs --file F --fn NAME --lines A-B --name NEWNAME [--dry]\n"
    + "       node tools/extract_block.mjs --file F --fn NAME --box a,b,c [--holder H] [--lines A-B --name NEWNAME] [--dry]\n"
    + "       node tools/extract_block.mjs --file F --fn NAME --holder-scope module [--holder H] --box-for A-B [--name NEWNAME] [--dry]\n"
    + "       (--name is optional for a block of pure function declarations)";
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    if (!(e instanceof Abort)) throw e;
    console.error(e.message + "\n" + usage);
    process.exit(2);
  }
  if (opts.help) { console.error(usage); process.exit(0); }
  if (opts.outline) {
    const r = outlineFunction(opts);
    if (r.ok) { console.log(r.report); console.error(r.summary); } else console.error(r.report);
    process.exit(r.ok ? 0 : 1);
  }
  const r = extractBlock(opts);
  (r.ok ? console.log : console.error)(r.report);
  process.exit(r.ok ? 0 : 1);
}

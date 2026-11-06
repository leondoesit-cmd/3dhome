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
  if (!o.file || !o.fn || !o.name || !o.lines) throw new Abort("need --file, --fn, --lines and --name");
  if (!/^[A-Za-z_$][\w$]*$/.test(o.name)) throw new Abort(`${o.name} is not a valid function name`);
  if (!fs.existsSync(o.file)) throw new Abort(`${o.file} does not exist`);
  const [A, B] = parseRange(o.lines);
  const src = norm(fs.readFileSync(o.file, "utf8"));
  const { ast, comments } = parse(src, o.file);
  const { stmt: topStmt, fn } = findFunction(ast, o.fn);
  const body = fn.body.body;

  // ---- which statements
  for (const s of body)
    if (s.loc.start.line < A && s.loc.end.line >= A)
      throw new Abort(`line ${A} falls inside the statement at lines ${s.loc.start.line}-${s.loc.end.line}; start the range at a statement (use --outline)`);
  const idx = body.map((s, i) => i).filter((i) => body[i].loc.start.line >= A && body[i].loc.start.line <= B);
  if (!idx.length) throw new Abort(`no top-level statement of ${o.fn} starts in lines ${A}-${B}`);
  const first = body[idx[0]], last = body[idx[idx.length - 1]];
  const lead = leadStart(src, first, idx[0] ? body[idx[0] - 1].end : fn.body.start + 1, comments);
  const trail = trailEnd(src, last);
  const shape = [];
  if (lead.error) shape.push(`the block's first statement (line ${first.loc.start.line}) ${lead.error}`);
  if (trail.error) shape.push(`the block's last statement (line ${last.loc.start.line}) ${trail.error}`);
  if (shape.length) throw new Abort(shape);
  const bs = first.start, be = last.end;
  const blockStmts = idx.map((i) => body[i]);

  // ---- analysis
  const { refs, nameScope } = resolveRefs(fn);
  const blockScope = new Scope(null, "function");
  blockStmts.forEach((s) => declare(s, blockScope));
  const blockDecls = blockScope.names;
  const inBlock = (r) => r.id.start >= bs && r.id.end <= be;
  const problems = [];
  const refuse = (line, text) => problems.push({ line, text });

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

  // the new name must be free
  const taken = new Set();
  for (const s of ast.body) {
    const sc = new Scope(null, "module");
    declare(s, sc);
    sc.names.forEach((_, n) => taken.add(n));
    if (s.type === "ImportDeclaration") s.specifiers.forEach((sp) => taken.add(sp.local.name));
  }
  const beforeFree = freeNameSet(src, o.file);
  if (taken.has(o.name) || nameScope.names.has(o.name) || beforeFree.has(o.name))
    refuse(fn.loc.start.line, `${o.name} already exists in the module`);

  if (problems.length) {
    const sorted = problems.sort((a, b) => a.line - b.line);
    throw new Abort(sorted.map((p) => `line ${p.line}: ${p.text}`));
  }

  // ---- the new text
  const isAsync = !!fn.async && scan.awaits;
  const chunkStart = lead.chunkStart, textEnd = trail.textEnd;
  const blockText = src.slice(chunkStart, textEnd);
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
    `extract_block: ${o.file}  ${o.fn}() -> ${o.name}()${o.dry ? "  [dry run, nothing written]" : ""}`,
    `params (${params.length}): ${params.join(", ") || "-"}`,
    `returns (${returned.length}): ${returned.map((n) => `${n} (${blockDecls.get(n).kind})`).join(", ") || "-"}`,
    `block lines moved: ${movedLines} (source lines ${src.slice(0, chunkStart).split("\n").length}-${src.slice(0, textEnd).split("\n").length})${isAsync ? ", async" : ""}`,
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
  const usage = "usage: node tools/extract_block.mjs --file F --fn NAME --outline\n       node tools/extract_block.mjs --file F --fn NAME --lines A-B --name NEWNAME [--dry]";
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

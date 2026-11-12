#!/usr/bin/env node
// Deterministic code mover for splitting a big ES module (js/modeler.js) into
// js/modeler/*.js without anyone retyping code.
//
//   node tools/split_module.mjs --from js/modeler.js --to js/modeler/area.js \
//        (--names a,b,c | --lines 5000-5999[,7000-7100]) [--purpose "text"] [--setters] [--dry]
//
// It moves top-level function declarations (with their leading comment lines)
// byte-for-byte, then writes the glue the existing splits (dimension_entry.js,
// drawing_sheet.js, sketch_guide.js) carry by hand:
//   - the new file's header comment, copies of the import specifiers the moved
//     code uses (paths rewritten), and one wrapped import of everything it still
//     needs from the source (those names join an `export { }` list in the source,
//     headed `// for js/modeler/<area>.js`);
//   - a back-import in the source for what it still calls, plus a re-export
//     for moved `export function`s so outside importers keep working;
//   - every sibling split file that imported a moved name from the source now
//     imports it from the new file, and the source's export lists lose it.
//
// SAFETY GUARD: an ES-module import is read-only. Moved code that assigns
// (=, op=, ++/--, destructuring, for-in/of target) a binding the source declares
// at its top level would throw at runtime and no static gate sees it, so the tool
// aborts and writes nothing. A final static check (free names, imports resolve to
// real exports, no duplicate exports) runs on every output before it is written.
//
// --setters: the simple assignments are rewritten instead of refused. In the moved text only,
// `X = e` becomes `set_X(e)`, `X op= e` becomes `set_X(X op (e))`, `X ||= e` becomes
// `(X || (set_X(e)))` (likewise && and ??), and a statement-level or for-update `X++`/`X--`
// becomes `inc_X()`/`dec_X()` (also a prefix `++X`/`--X` whose value is used: `y = inc_X()`). The source
// gains right after X's declaration one `function set_X(value) { return X = value; }` and, where used,
// `function inc_X() { return ++X; }` / `function dec_X() { return --X; }` (native ++/-- keeps strings and
// BigInts right; an identical earlier helper is reused), exported in the "// for <new file>" list.
// A helper name that an enclosing scope of a call site binds (a local `set_X`) is skipped for that
// site: the next suffix (`set_X_1`) is used. Destructuring, for-in/of targets, const/import/class/function
// bindings, a postfix `X++` whose value is used and direct eval are still refused. The source's own
// code is never rewritten, and a local that shadows X is never touched.
//
// Computed module paths: `import(a + b)`, `new URL(expr, import.meta.url)` in moved code resolve against
// the file they live in. A literal or an expression-free template is rewritten; a computed one that
// may be relative (starts with "./" or "../", or starts with something unknowable) is refused when
// the new file is in another directory. "three/" + x, absolute URLs and literals are fine. For
// `new URL(x, import.meta.url)` a string without a leading dot is relative too ("assets/x.bin" is
// rebased like "./assets/x.bin", "assets/" + name is refused); only a scheme ("https:", "data:"),
// a leading "/" and a bare "#" / "?" are not module-relative. An import() specifier without "./" is a
// package name, not a path.
//
// API: splitModule({ from, to, names | lines, setters, dry, purpose }) works on files;
// splitModuleText({ sourceText, sourcePath, targetPath, names | lines, setters, siblings }) takes
// and returns text (result.texts = { target, source, siblings }), touching no file.
//
// Run `npm run check` afterwards, and list the new file in survey-assets.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { analyze, GLOBALS, REPO_ROOT } from "./module_check.mjs";

class Abort extends Error {
  constructor(messages) {
    const list = Array.isArray(messages) ? messages : [messages];
    super(list.join("\n"));
    this.messages = list;
  }
}

// ---- small helpers ---------------------------------------------------------
const posix = (p) => p.split(path.sep).join("/");
const samePath = (a, b) => {
  const x = path.resolve(a), y = path.resolve(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};
const byCodepoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isRelative = (spec) => spec.startsWith(".");
// URL strings resolve against the base: relative unless absolute (scheme), root-relative or a bare ?query / #fragment
const isRelativeUrl = (v) => v !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^[/#?]/.test(v);
const norm = (text) => text.replace(/\r\n/g, "\n");

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

// Could a computed module path (import(expr), new URL(expr, import.meta.url)) be relative? A literal
// start tells ("./x/" + name is, "three/" + name is not); anything else, an identifier, a call, a
// template that starts with an expression, is unknowable and counts as possibly relative.
// `rel` says whether a string is relative: an import() specifier only when it starts with "." (a bare
// "three" is a package), a `new URL(x, import.meta.url)` string unless it has a scheme or starts with
// "/", "#" or "?" ("assets/x.bin" is relative to the module).
function mayBeRelative(expr, rel = isRelative) {
  switch (expr.type) {
    case "Literal": return typeof expr.value === "string" && rel(expr.value);
    case "TemplateLiteral": {
      const head = expr.quasis[0].value.cooked;
      return head ? rel(head) : expr.expressions.length > 0;
    }
    case "BinaryExpression":
      if (expr.operator !== "+") return true;
      return mayBeRelative(expr.left, rel) || (isEmptyString(expr.left) && mayBeRelative(expr.right, rel));
    case "ConditionalExpression": return mayBeRelative(expr.consequent, rel) || mayBeRelative(expr.alternate, rel);
    case "LogicalExpression": return mayBeRelative(expr.left, rel) || mayBeRelative(expr.right, rel);
    default: return true;
  }
}
const isEmptyString = (n) => (n.type === "Literal" && n.value === "") || (n.type === "TemplateLiteral" && !n.expressions.length && !n.quasis[0].value.cooked);

function walkNodes(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === "string") walkNodes(c, visit);
    } else if (v && typeof v.type === "string") walkNodes(v, visit);
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
    default: break; // MemberExpression targets assign a property, not a binding
  }
  return out;
}

// Identifiers that are the TARGET of an assignment inside `root` (any scope).
function assignedIdentifiers(root) {
  const out = [];
  walkNodes(root, (n) => {
    if (n.type === "AssignmentExpression") patternIds(n.left, out);
    else if (n.type === "UpdateExpression") patternIds(n.argument, out);
    else if ((n.type === "ForInStatement" || n.type === "ForOfStatement") && n.left.type !== "VariableDeclaration")
      patternIds(n.left, out);
  });
  return out;
}

// Free identifier occurrences of a list of top-level statements, as if they
// were a module of their own: Map name -> [Identifier nodes].
function freeOccurrences(body, globals = new Set()) {
  const map = new Map();
  analyze({ body }, (node) => {
    if (!map.has(node.name)) map.set(node.name, []);
    map.get(node.name).push(node);
  }, globals);
  return map;
}

function hoistVars(node, add) {
  if (!node || typeof node.type !== "string") return;
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "ClassDeclaration":
    case "ClassExpression":
      return;
    case "VariableDeclaration":
      if (node.kind === "var") node.declarations.forEach((d) => patternIds(d.id).forEach((i) => add(i.name, "var")));
      return;
    default: break;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && hoistVars(c, add));
    else if (v && typeof v.type === "string") hoistVars(v, add);
  }
}

// name -> kind for everything the module declares at its top level
function topLevelDecls(ast) {
  const m = new Map();
  const add = (name, kind) => { if (!m.has(name)) m.set(name, kind); };
  for (const stmt of ast.body) {
    const s = (stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration") && stmt.declaration
      ? stmt.declaration : stmt;
    switch (s.type) {
      case "ImportDeclaration": s.specifiers.forEach((sp) => add(sp.local.name, "import")); break;
      case "VariableDeclaration":
        s.declarations.forEach((d) => patternIds(d.id).forEach((i) => add(i.name, s.kind)));
        break;
      case "FunctionDeclaration": if (s.id) add(s.id.name, "function"); break;
      case "ClassDeclaration": if (s.id) add(s.id.name, "class"); break;
      default: hoistVars(s, add);
    }
  }
  return m;
}

// What a module exports: exported name -> local name (null for re-exports)
function collectExports(ast) {
  const names = new Map();
  const dupes = [];
  let star = false;
  const put = (exported, local) => {
    if (names.has(exported)) dupes.push(exported);
    names.set(exported, local);
  };
  for (const stmt of ast.body) {
    if (stmt.type === "ExportAllDeclaration") star = true;
    else if (stmt.type === "ExportDefaultDeclaration") put("default", null);
    else if (stmt.type === "ExportNamedDeclaration") {
      if (stmt.declaration) {
        const d = stmt.declaration;
        if (d.type === "VariableDeclaration") d.declarations.forEach((x) => patternIds(x.id).forEach((i) => put(i.name, i.name)));
        else if (d.id) put(d.id.name, d.id.name);
      } else {
        for (const sp of stmt.specifiers) put(sp.exported.name ?? sp.exported.value, stmt.source ? null : sp.local.name);
      }
    }
  }
  return { names, dupes, star };
}

function importPath(fromFile, toFile, areaRoot) {
  const fd = path.dirname(path.resolve(fromFile)), td = path.dirname(path.resolve(toFile));
  let rel;
  // siblings in an area folder import each other as "../area/x.js", as the existing splits do
  if (samePath(fd, td) && samePath(path.dirname(fd), areaRoot)) rel = `../${path.basename(fd)}/${path.basename(toFile)}`;
  else rel = posix(path.relative(fd, toFile));
  return rel.startsWith(".") ? rel : "./" + rel;
}

function compareImportPaths(a, b) {
  const ra = isRelative(a), rb = isRelative(b);
  if (ra !== rb) return ra ? 1 : -1; // bare specifiers first
  return a.localeCompare(b, "en");
}

// ---- rendering -------------------------------------------------------------
function wrapNames(specs, width = 78) {
  const lines = [];
  let cur = "";
  for (const s of specs) {
    const tok = s + ",";
    if (!cur) cur = "  " + tok;
    else if ((cur + " " + tok).length <= width) cur += " " + tok;
    else { lines.push(cur); cur = "  " + tok; }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

function renderList(keyword, specs, from, forceSingle = false) {
  const tail = from == null ? ";" : ` from "${from}";`;
  const one = `${keyword} { ${specs.join(", ")} }${tail}`;
  if (forceSingle || one.length <= 80) return one;
  return `${keyword} {\n${wrapNames(specs)}\n}${tail}`;
}

function renderHeader(purpose, srcRel, importRel) {
  const words = `/* ${purpose}, split out of ${srcRel}. It shares the editor's state through live imports from ${importRel}. */`.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= 80) cur += " " + w;
    else { lines.push(cur); cur = "   " + w; }
  }
  lines.push(cur);
  return lines.join("\n");
}

// ---- text edits ------------------------------------------------------------
function applyEdits(text, edits) {
  const list = edits.map((e, seq) => ({ ...e, seq }));
  for (const e of list) {
    if (e.end === e.start) continue;
    for (const o of list)
      if (o !== e && o.start > e.start && o.start < e.end)
        throw new Abort(`internal error: overlapping edits at ${e.start}-${e.end} and ${o.start}`);
  }
  list.sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start) || b.seq - a.seq);
  let out = text;
  for (const e of list) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

function lineStart(text, offset) { return text.lastIndexOf("\n", offset - 1) + 1; }
function afterLine(text, offset) {
  const i = text.indexOf("\n", offset);
  return i < 0 ? text.length : i + 1;
}

// Cut whole-line ranges out, collapsing the blank lines around each cut to one.
function removeRanges(src, ranges) {
  const sorted = [...ranges].sort((a, b) => a.s - b.s || a.e - b.e);
  let out = "", pos = 0;
  for (const r of sorted) {
    if (r.s < pos) throw new Abort(`internal error: overlapping edits at ${r.s}`);
    out += src.slice(pos, r.s) + (r.text || "");
    pos = r.e;
    if (r.collapse && /\n[ \t]*\n$/.test(out)) {
      const m = /^(?:[ \t]*\n)+/.exec(src.slice(pos, pos + 4096));
      if (m) pos += m[0].length;
    }
  }
  return out + src.slice(pos);
}

function headerCommentOf(decl, comments, text) {
  for (const c of comments)
    if (c.type === "Line" && /^ for js\/[\w$-]+\//.test(c.value) && text.slice(c.end, decl.start) === "\n") return c;
  return null;
}

// ---- selection -------------------------------------------------------------
function functionOf(stmt) {
  if (stmt.type === "FunctionDeclaration" && stmt.id) return { fn: stmt, exported: false };
  if (stmt.type === "ExportNamedDeclaration" && stmt.declaration && stmt.declaration.type === "FunctionDeclaration" && stmt.declaration.id)
    return { fn: stmt.declaration, exported: true };
  return null;
}

function parseLineRanges(spec) {
  if (!spec) return [];
  if (Array.isArray(spec)) return spec.map((r) => (Array.isArray(r) ? r : [r, r]));
  return String(spec).split(",").map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = /^(\d+)(?:-(\d+))?$/.exec(t);
    if (!m) throw new Abort(`bad --lines range "${t}" (want 5000-5999)`);
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    return [Math.min(a, b), Math.max(a, b)];
  });
}

function parseNames(spec) {
  if (!spec) return [];
  return (Array.isArray(spec) ? spec : String(spec).split(",")).map((s) => s.trim()).filter(Boolean);
}

function lastCommentEndingBefore(comments, offset) {
  let lo = 0, hi = comments.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (comments[mid].end <= offset) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// The source range a function carries when it moves: contiguous leading comment
// lines (no blank line between), the function, and a same-line trailing comment.
function chunkFor(src, stmt, prevEnd, comments) {
  let start = stmt.start;
  for (let i = lastCommentEndingBefore(comments, start); i >= 0; i--) {
    const c = comments[i];
    if (c.start < prevEnd) break;
    if (!/^[ \t]*\n?[ \t]*$/.test(src.slice(c.end, start))) break;
    if (src.slice(lineStart(src, c.start), c.start).trim() !== "") break; // trailing comment of the line above
    start = c.start;
  }
  const ls = lineStart(src, start);
  if (src.slice(ls, start).trim() !== "") return { error: "shares its first line with other code" };
  const nl = src.indexOf("\n", stmt.end);
  const lineEnd = nl < 0 ? src.length : nl;
  const rest = src.slice(stmt.end, lineEnd);
  const m = /^(\s*;)?(\s*(?:\/\/.*|\/\*.*\*\/))?\s*$/.exec(rest);
  if (!m) return { error: "shares its last line with other code" };
  const text = src.slice(ls, stmt.end) + (m[2] ? m[2].trimEnd() : "");
  return { chunkStart: ls, textEnd: lineEnd, text, removeEnd: nl < 0 ? src.length : nl + 1 };
}

// ---- --setters: rewrite assignments to source bindings into setter calls ---------
function walkScoped(node, parent, stack, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent, stack); // stack: the ancestors of node, outermost first
  stack.push(node);
  for (const key of Object.keys(node)) {
    if (key === "loc") continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === "string") walkScoped(c, node, stack, visit);
    } else if (v && typeof v.type === "string") walkScoped(v, node, stack, visit);
  }
  stack.pop();
}

// Names a scope node binds directly (what a call written inside it could resolve to instead of
// a module-level name): params and `var`s of a function, let/const/class/function of a block,
// for-head and catch bindings.
function scopeBindings(node) {
  const names = new Set();
  const add = (p) => patternIds(p).forEach((id) => names.add(id.name));
  const lexical = (stmts) => {
    for (const st of stmts) {
      if (st.type === "VariableDeclaration" && st.kind !== "var") st.declarations.forEach((d) => add(d.id));
      else if ((st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") && st.id) names.add(st.id.name);
    }
  };
  const vars = (n) => { // var declarations of this function level, not of nested functions
    if (!n || typeof n.type !== "string") return;
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression" || n.type === "ClassDeclaration" || n.type === "ClassExpression") return;
    if (n.type === "VariableDeclaration" && n.kind === "var") n.declarations.forEach((d) => add(d.id));
    for (const key of Object.keys(n)) {
      if (key === "loc") continue;
      const v = n[key];
      if (Array.isArray(v)) v.forEach(vars);
      else if (v && typeof v.type === "string") vars(v);
    }
  };
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      node.params.forEach(add);
      if (node.type === "FunctionExpression" && node.id) names.add(node.id.name);
      if (node.type !== "ArrowFunctionExpression") names.add("arguments");
      vars(node.body);
      break;
    case "BlockStatement": lexical(node.body); break;
    case "StaticBlock": lexical(node.body); node.body.forEach(vars); break;
    case "SwitchStatement": node.cases.forEach((c) => lexical(c.consequent)); break;
    case "ForStatement":
      if (node.init && node.init.type === "VariableDeclaration" && node.init.kind !== "var") node.init.declarations.forEach((d) => add(d.id));
      break;
    case "ForInStatement":
    case "ForOfStatement":
      if (node.left.type === "VariableDeclaration" && node.left.kind !== "var") node.left.declarations.forEach((d) => add(d.id));
      break;
    case "CatchClause": if (node.param) add(node.param); break;
    case "ClassExpression": if (node.id) names.add(node.id.name); break;
    default: break;
  }
  return names;
}

const COMPOUND_OPS = new Set(["+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^="]);
const LOGICAL_OPS = new Set(["&&=", "||=", "??="]);
const NOT_REASSIGNABLE = { import: "an imported binding", const: "a const", class: "a class", function: "a function declaration" };

// The helpers the source gains next to a binding's declaration, in the order they are written.
const HELPER_KINDS = ["set", "inc", "dec"];
const helperText = (kind, fn, name) => {
  const param = name === "value" ? "next" : "value";
  if (kind === "set") return `function ${fn}(${param}) { return ${name} = ${param}; }`;
  return `function ${fn}() { return ${kind === "inc" ? "++" : "--"}${name}; }`;
};

// Where the operator sits after `left`: {restStart} is the first character after the
// operator and its trailing blanks. null when anything but blanks lies between
// (a comment, a closing parenthesis), which this tool will not rewrite.
function operatorSpan(src, left, op) {
  let i = left.end;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (!src.startsWith(op, i)) return null;
  i += op.length;
  while (i < src.length && /\s/.test(src[i])) i++;
  return { restStart: i };
}

// Plan the rewrite of every `X = e`, `X op= e`, `++X`, `X++`... in the moved functions whose X is a
// top-level var/let of the source. Fills s.setterEdits (offsets in the source text) and returns
// the helpers the source must gain, the sites rewritten and the assignments it cannot rewrite.
function planSetters({ selected, src0, ast, freeStarts, decls, from }) {
  const offenders = [];
  const helpers = new Map(); // helper function name -> {fn, kind, name, text, reuse, stmt}
  const bindings = new Map(); // binding -> [helper, ...] in order of first use
  let siteCount = 0;

  // names the helpers must not collide with: every identifier the source mentions
  const used = new Set(decls.keys());
  walkNodes(ast, (n) => { if (n.type === "Identifier") used.add(n.name); });
  const movedNames = new Set(selected.map((s) => s.fn.id.name));
  const topFns = new Map(); // name -> normalised text, to reuse a helper an earlier split generated
  for (const stmt of ast.body) {
    const info = functionOf(stmt);
    if (info) topFns.set(info.fn.id.name, src0.slice(info.fn.start, info.fn.end).replace(/\s+/g, " "));
  }
  const declStmt = new Map(); // binding -> top-level statement that declares it
  for (const stmt of ast.body) for (const name of topLevelDecls({ body: [stmt] }).keys()) if (!declStmt.has(name)) declStmt.set(name, stmt);

  // The helper of `kind` for binding `name`, callable at a site where the names in `blocked`
  // are bound by an enclosing scope (a local `set_x` would swallow the call), so a candidate
  // named like one of them is skipped and the next suffix tried.
  const helperFor = (kind, name, blocked) => {
    for (let n = 0; ; n++) {
      const fn = n === 0 ? `${kind}_${name}` : `${kind}_${name}_${n}`;
      if (blocked.has(fn) || movedNames.has(fn)) continue;
      const mine = helpers.get(fn);
      if (mine) {
        if (mine.kind === kind && mine.name === name) return mine;
        continue;
      }
      const text = helperText(kind, fn, name);
      if (used.has(fn) && topFns.get(fn) !== text) continue;
      const h = { fn, kind, name, text, reuse: used.has(fn), stmt: declStmt.get(name) };
      used.add(fn);
      helpers.set(fn, h);
      if (!bindings.has(name)) bindings.set(name, []);
      bindings.get(name).push(h);
      return h;
    }
  };

  const scopeCache = new Map();
  const blockedAt = (stack) => {
    const out = new Set();
    for (const node of stack) {
      if (!scopeCache.has(node)) scopeCache.set(node, scopeBindings(node));
      scopeCache.get(node).forEach((x) => out.add(x));
    }
    return out;
  };

  for (const s of selected) {
    const fname = s.fn.id.name;
    s.setterEdits = [];
    const refuse = (id, why) =>
      offenders.push(`${fname} assigns ${id.name} (top-level ${decls.get(id.name)} of ${from}) at line ${id.loc.start.line} - ${why}`);
    const bound = (id) => freeStarts.has(id.start) && decls.has(id.name);
    const rewritable = (id) => {
      const kind = decls.get(id.name);
      if (kind === "var" || kind === "let") return true;
      refuse(id, `${NOT_REASSIGNABLE[kind] ?? kind} cannot get a setter`);
      return false;
    };
    const edit = (start, end, text) => s.setterEdits.push({ start, end, text });

    walkScoped(s.stmt, null, [], (n, parent, stack) => {
      if (n.type === "AssignmentExpression") {
        if (n.left.type !== "Identifier") {
          patternIds(n.left).filter(bound).forEach((id) => refuse(id, "destructuring target"));
          return;
        }
        if (!bound(n.left) || !rewritable(n.left)) return;
        const name = n.left.name, op = n.operator;
        const span = operatorSpan(src0, n.left, op);
        if (!span || n.left.start !== n.start) return refuse(n.left, "unusual formatting (comment or parentheses around the target); edit by hand");
        const setter = helperFor("set", name, blockedAt(stack)).fn;
        siteCount++;
        if (op === "=") {
          edit(n.start, span.restStart, `${setter}(`);
          edit(n.end, n.end, ")");
        } else if (COMPOUND_OPS.has(op)) {
          edit(n.start, n.start, `${setter}(`);
          edit(n.left.end, span.restStart, ` ${op.slice(0, -1)} (`);
          edit(n.end, n.end, "))");
        } else if (LOGICAL_OPS.has(op)) {
          // a leading "(" could glue itself to a statement above that has no semicolon
          const wrap = parent && parent.type === "ExpressionStatement" ? false : true;
          if (wrap) edit(n.start, n.start, "(");
          edit(n.left.end, span.restStart, ` ${op.slice(0, -1)} (${setter}(`);
          edit(n.end, n.end, wrap ? ")))" : "))");
        }
      } else if (n.type === "UpdateExpression") {
        const arg = n.argument;
        if (arg.type !== "Identifier" || !bound(arg) || !rewritable(arg)) return;
        // x++ / x-- whose value nobody reads, or ++x / --x anywhere, is exactly `inc_x()` / `dec_x()`:
        // the helper holds the native ++/--, so strings and BigInts behave as before.
        const unused = parent && ((parent.type === "ExpressionStatement" && parent.expression === n) || (parent.type === "ForStatement" && parent.update === n));
        if (!n.prefix && !unused) return refuse(arg, `${n.operator} whose value is used (postfix; write ${n.operator}${arg.name} or move it to a statement)`);
        siteCount++;
        edit(n.start, n.end, `${helperFor(n.operator === "++" ? "inc" : "dec", arg.name, blockedAt(stack)).fn}()`);
      } else if ((n.type === "ForInStatement" || n.type === "ForOfStatement") && n.left.type !== "VariableDeclaration") {
        patternIds(n.left).filter(bound).forEach((id) => refuse(id, "for-in/of target"));
      }
    });
  }

  // each helper goes right after the statement that declares its binding
  const inserts = [];
  const byStmt = new Map();
  for (const h of helpers.values()) {
    if (h.reuse) continue;
    if (!byStmt.has(h.stmt)) byStmt.set(h.stmt, []);
    byStmt.get(h.stmt).push(h);
  }
  for (const [stmt, list] of byStmt) {
    const body = list
      .sort((a, b) => byCodepoint(a.name, b.name) || HELPER_KINDS.indexOf(a.kind) - HELPER_KINDS.indexOf(b.kind) || byCodepoint(a.fn, b.fn))
      .map((x) => x.text).join("\n");
    const nl = src0.indexOf("\n", stmt.end);
    const lineEnd = nl < 0 ? src0.length : nl;
    if (/^[ \t]*(\/\/.*)?$/.test(src0.slice(stmt.end, lineEnd)))
      inserts.push({ pos: nl < 0 ? src0.length : nl + 1, text: (nl < 0 ? "\n" : "") + body + "\n" });
    else inserts.push({ pos: stmt.end, text: "\n" + body + "\n" });
  }
  return { offenders, bindings, helpers: [...helpers.values()], siteCount, inserts };
}

// ---- main ------------------------------------------------------------------
// Text in, text out: nothing on disk is read or written.
//   splitModuleText({ sourceText, sourcePath, targetPath, names | lines, setters, purpose,
//                     siblings: [{ path, text }] })
// `siblings` are the files next to the target that may import a moved name from the source.
// Returns { ok, errors, report, moved, setters, leftBehind, texts } where texts is
// { target, source, siblings: [{ path, text }] } (the new text of every file the split changes;
// the paths are the given ones, resolved). splitModule() runs on this and then writes the files.
export function splitModuleText(opts) {
  const { sourceText, sourcePath, targetPath, siblings = [], ...rest } = opts;
  if (typeof sourceText !== "string") throw new TypeError("splitModuleText needs { sourceText }");
  return splitModule({ ...rest, from: sourcePath, to: targetPath, sourceText, siblingTexts: siblings, textMode: true, dry: true });
}

export function splitModule(opts) {
  const o = { dry: false, purpose: null, repoRoot: REPO_ROOT, ...opts };
  const result = { ok: false, written: false, errors: [], report: "", moved: [], files: [] };
  try {
    run(o, result);
    result.ok = true;
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    result.errors = e.messages;
    result.report = ["split_module: ABORTED, nothing written", ...e.messages.map((m) => "  " + m)].join("\n");
  }
  return result;
}

function run(o, result) {
  if (!o.from || !o.to) throw new Abort("need --from and --to");
  const textMode = !!o.textMode;
  const srcAbs = path.resolve(o.from), newAbs = path.resolve(o.to);
  if (!textMode && !fs.existsSync(srcAbs)) throw new Abort(`${o.from} does not exist`);
  if (!textMode && fs.existsSync(newAbs)) throw new Abort(`${o.to} already exists; this tool only creates new files`);
  if (samePath(srcAbs, newAbs)) throw new Abort("--from and --to are the same file");
  const names = parseNames(o.names), ranges = parseLineRanges(o.lines);
  if (!names.length && !ranges.length) throw new Abort("need --names or --lines");
  const areaRoot = path.dirname(srcAbs);
  const relToRepo = (abs) => {
    const rel = posix(path.relative(o.repoRoot, abs));
    return rel.startsWith("..") || path.isAbsolute(rel) ? posix(path.relative(path.dirname(srcAbs), abs)) : rel;
  };
  const srcRel = relToRepo(srcAbs), newRel = relToRepo(newAbs);
  const newBase = path.basename(newAbs);

  // ---- parse the source, pick the functions
  const src0 = norm(textMode ? o.sourceText : fs.readFileSync(srcAbs, "utf8"));
  const { ast, comments } = parse(src0, o.from);
  const decls = topLevelDecls(ast);
  const wanted = new Set(names);
  const selected = []; // {stmt, fn, exported, chunk}
  const leftBehind = [];
  const inRange = (line) => ranges.some(([a, b]) => line >= a && line <= b);
  const problems = [];
  ast.body.forEach((stmt, i) => {
    const info = functionOf(stmt);
    const line = stmt.loc.start.line;
    const pick = info && (wanted.has(info.fn.id.name) || inRange(line));
    if (pick) {
      const chunk = chunkFor(src0, stmt, i ? ast.body[i - 1].end : 0, comments);
      if (chunk.error) problems.push(`${info.fn.id.name} (line ${line}) ${chunk.error}`);
      else selected.push({ stmt, ...info, chunk });
      wanted.delete(info.fn.id.name);
    } else if (!info && inRange(line)) {
      leftBehind.push(describeStatement(stmt));
    }
  });
  if (problems.length) throw new Abort(["cannot move cleanly:", ...problems.map((p) => "  " + p)]);
  for (const n of wanted) {
    const kind = decls.get(n);
    problems.push(kind ? `${n} is a top-level ${kind}, not a function declaration` : `${n} is not declared at the top level of ${o.from}`);
  }
  if (problems.length) throw new Abort(problems);
  if (!selected.length) throw new Abort("no top-level function declarations selected");
  const movedNames = new Set(selected.map((s) => s.fn.id.name));

  // ---- free names of the moved code, and (with --setters) the assignments to rewrite
  const movedStmts = selected.map((s) => s.stmt);
  let free = freeOccurrences(movedStmts);
  const freeStarts = new Set();
  for (const occ of free.values()) occ.forEach((n) => freeStarts.add(n.start));
  const setterPlan = o.setters ? planSetters({ selected, src0, ast, freeStarts, decls, from: o.from }) : null;

  // Relative string paths inside the moved code - import("./x.js"), new URL("./x",
  // import.meta.url), new URL(...) - resolve against the file they live in, so
  // they are rewritten for the new file's directory like the static imports.
  let rewrittenPaths = 0;
  const relocates = !samePath(path.dirname(newAbs), areaRoot); // same directory: relative paths keep their base
  const isImportMetaUrl = (n) => n && n.type === "MemberExpression" && !n.computed && n.object.type === "MetaProperty" && n.property.name === "url";
  for (const s of selected) {
    const edits = [];
    walkNodes(s.stmt, (n) => {
      // Only import() and new URL(x, import.meta.url) resolve against the module. A plain
      // string given to new Worker()/SharedWorker() resolves against the page, so it stays.
      let lit = null;
      if (n.type === "ImportExpression") lit = n.source;
      else if (n.type === "NewExpression" && n.callee.type === "Identifier" && n.callee.name === "URL" && n.arguments[0] && isImportMetaUrl(n.arguments[1])) lit = n.arguments[0];
      if (!lit) return;
      const rel = n.type === "ImportExpression" ? isRelative : isRelativeUrl;
      let value, q;
      if (lit.type !== "Literal" && lit.type !== "TemplateLiteral" && relocates && mayBeRelative(lit, rel))
        throw new Abort(`${s.fn.id.name} (line ${lit.loc.start.line}): ${n.type === "ImportExpression" ? "import(...)" : "new URL(..., import.meta.url)"} with a computed path that may be relative cannot be relocated to ${o.to}; move it by hand or make the path a literal`);
      if (lit.type === "Literal" && typeof lit.value === "string") { value = lit.value; q = src0[lit.start]; }
      else if (lit.type === "TemplateLiteral") {
        value = lit.quasis[0].value.cooked;
        q = "`";
        if (lit.expressions.length) {
          if (relocates && !value) throw new Abort(`${s.fn.id.name} (line ${lit.loc.start.line}): a module path that starts with a template expression may be relative and cannot be relocated; move it by hand`);
          if (rel(value)) throw new Abort(`${s.fn.id.name} (line ${lit.loc.start.line}): a relative module path built from a template with expressions cannot be relocated; move it by hand`);
          return;
        }
      } else return;
      if (!rel(value)) return;
      if (!relocates && !isRelative(value)) return; // "assets/x.bin" keeps its base while the directory does
      const next = importPath(newAbs, path.resolve(areaRoot, value), areaRoot);
      if (next === value) return;
      edits.push({ start: lit.start - s.chunk.chunkStart, end: lit.end - s.chunk.chunkStart, text: q + next + q });
    });
    const pathEdits = edits.length;
    if (setterPlan) for (const e of s.setterEdits) edits.push({ ...e, start: e.start - s.chunk.chunkStart, end: e.end - s.chunk.chunkStart });
    if (edits.length) { s.chunk.text = applyEdits(s.chunk.text, edits); rewrittenPaths += pathEdits; }
  }

  // ---- the safety guard
  const offenders = setterPlan ? [...setterPlan.offenders] : [];
  if (!setterPlan)
    for (const s of selected)
      for (const id of assignedIdentifiers(s.stmt))
        if (freeStarts.has(id.start) && decls.has(id.name))
          offenders.push(`${s.fn.id.name} assigns ${id.name} (top-level ${decls.get(id.name)} of ${o.from}) at line ${id.loc.start.line}`);
  // A direct eval sees the module's bindings, which a moved function no longer shares.
  for (const s of selected)
    walkNodes(s.stmt, (n) => {
      if (n.type === "CallExpression" && n.callee.type === "Identifier" && n.callee.name === "eval" && freeStarts.has(n.callee.start))
        offenders.push(`${s.fn.id.name} calls eval(...) directly at line ${n.loc.start.line}; it can reach the source's bindings, so keep it in place`);
    });
  if (offenders.length)
    throw new Abort([
      "GUARD: moved code would break at runtime. An imported binding is read-only, so assigning a",
      "top-level binding of the source throws, and a direct eval cannot see them. Offenders:",
      ...offenders.map((m) => "  " + m),
      ...(setterPlan ? [`(--setters would have rewritten ${setterPlan.siteCount} other site(s) across ${setterPlan.bindings.size} binding(s); ${selected.length} functions selected)`] : []),
    ]);

  // The rewritten text no longer assigns, and may no longer read, some bindings, and now
  // calls the setters: recompute what it needs from the source.
  const setterNames = setterPlan ? setterPlan.helpers.map((h) => h.fn) : [];
  if (setterPlan && setterPlan.siteCount) {
    setterNames.forEach((n) => decls.set(n, "function"));
    free = freeOccurrences(parse(selected.map((s) => s.chunk.text).join("\n\n"), "the rewritten moved code").ast.body);
  }

  const srcImports = new Map(); // local -> {decl, spec}
  for (const stmt of ast.body)
    if (stmt.type === "ImportDeclaration")
      for (const spec of stmt.specifiers) srcImports.set(spec.local.name, { decl: stmt, spec });

  const copiedImports = new Map(); // module path in the new file -> {def, ns, named: Map(imported -> local)}
  const needFromSource = [];
  for (const name of [...free.keys()].sort(byCodepoint)) {
    const imp = srcImports.get(name);
    if (imp) {
      const raw = imp.decl.source.value;
      const key = isRelative(raw) ? importPath(newAbs, path.resolve(areaRoot, raw), areaRoot) : raw;
      if (!copiedImports.has(key)) copiedImports.set(key, { def: null, ns: null, named: new Map() });
      const g = copiedImports.get(key);
      if (imp.spec.type === "ImportDefaultSpecifier") g.def = name;
      else if (imp.spec.type === "ImportNamespaceSpecifier") g.ns = name;
      else g.named.set(imp.spec.imported.name ?? imp.spec.imported.value, name);
    } else if (decls.has(name)) needFromSource.push(name);
    // else: a platform global
  }

  // ---- remove from the source, and clean the export lists in the same pass
  // (acorn rejects a list naming a function that is gone, so no re-parse in between)
  const cuts = selected.map((s) => ({ s: s.chunk.chunkStart, e: s.chunk.removeEnd, collapse: true }));
  if (setterPlan) for (const ins of setterPlan.inserts) cuts.push({ s: ins.pos, e: ins.pos, text: ins.text });
  const removedFromLists = new Set();
  const plainExported = new Set(); // moved names a plain export list keeps exporting
  let emptyLists = 0;
  for (const decl of ast.body) {
    if (decl.type !== "ExportNamedDeclaration" || decl.declaration || decl.source) continue;
    // A plain `export { f };` (no "// for js/modeler/..." header) is the source's own
    // public API: it stays, and f is imported back so the export still resolves.
    if (!headerCommentOf(decl, comments, src0)) {
      decl.specifiers.forEach((sp) => movedNames.has(sp.local.name) && plainExported.add(sp.local.name));
      continue;
    }
    const exportedName = (sp) => sp.exported.name ?? sp.exported.value;
    const aliased = decl.specifiers.filter((sp) => movedNames.has(sp.local.name) && exportedName(sp) !== sp.local.name);
    if (aliased.length) throw new Abort(`export list line ${decl.loc.start.line} exports moved ${aliased[0].local.name} under another name; edit by hand`);
    const keep = decl.specifiers.filter((sp) => !movedNames.has(sp.local.name));
    if (keep.length === decl.specifiers.length) continue;
    decl.specifiers.filter((sp) => !keep.includes(sp)).forEach((sp) => removedFromLists.add(sp.local.name));
    const header = headerCommentOf(decl, comments, src0);
    if (!keep.length) {
      emptyLists++;
      cuts.push({ s: lineStart(src0, header ? header.start : decl.start), e: afterLine(src0, decl.end) });
    } else {
      const multi = src0.slice(decl.start, decl.end).includes("\n");
      cuts.push({ s: decl.start, e: decl.end, text: renderList("export", keep.map((sp) => src0.slice(sp.start, sp.end)), null, !multi) });
    }
  }
  const B = removeRanges(src0, cuts);
  // acorn rejects an export list naming a function that is gone, so parse with a stub for each
  const pb = parse(B + [...plainExported].map((n) => `\nfunction ${n}() {}`).join(""), o.from);

  // ---- what the remaining source still needs back
  const freeB = freeOccurrences(pb.ast.body);
  const backNames = [...movedNames].filter((n) => freeB.has(n) || plainExported.has(n)).sort(byCodepoint);
  const freeBStarts = new Set();
  for (const occ of freeB.values()) occ.forEach((n) => freeBStarts.add(n.start));
  const remainingOffenders = assignedIdentifiers({ type: "Program", body: pb.ast.body })
    .filter((id) => freeBStarts.has(id.start) && movedNames.has(id.name))
    .map((id) => `remaining code assigns moved function ${id.name} at line ${id.loc.start.line} of the shortened source`);
  if (remainingOffenders.length)
    throw new Abort(["GUARD: a moved function is reassigned by code that stays:", ...remainingOffenders.map((m) => "  " + m)]);
  const exportsB = collectExports(pb.ast);

  // ---- siblings in the new file's directory
  const newDir = path.dirname(newAbs);
  const siblings = [];
  const siblingMovedNames = new Set();
  const siblingFiles = (textMode
    ? o.siblingTexts.map((x) => ({ file: path.resolve(x.path), text: x.text }))
    : fs.existsSync(newDir)
      ? fs.readdirSync(newDir).filter((f) => f.endsWith(".js")).map((f) => path.join(newDir, f)).map((file) => ({ file, text: null }))
      : [])
    .filter((x) => !samePath(x.file, srcAbs) && !samePath(x.file, newAbs))
    .sort((a, b) => byCodepoint(a.file, b.file));
  for (const { file, text: given } of siblingFiles) {
    const text = norm(given ?? fs.readFileSync(file, "utf8"));
    let parsed;
    try { parsed = parse(text, file); } catch (e) { continue; }
    const fromSrc = parsed.ast.body.filter((s) => s.type === "ImportDeclaration" && isRelative(s.source.value) && samePath(path.resolve(path.dirname(file), s.source.value), srcAbs));
    const edits = [];
    const moving = [];
    for (const d of fromSrc) {
      const hit = d.specifiers.filter((sp) => sp.type === "ImportSpecifier" && movedNames.has(sp.imported.name ?? sp.imported.value));
      if (!hit.length) continue;
      hit.forEach((sp) => moving.push({ imported: sp.imported.name ?? sp.imported.value, text: text.slice(sp.start, sp.end) }));
      const keep = d.specifiers.filter((sp) => !hit.includes(sp));
      if (!keep.length) edits.push({ start: lineStart(text, d.start), end: afterLine(text, d.end), text: "" });
      else if (keep.every((sp) => sp.type === "ImportSpecifier")) {
        const multi = text.slice(d.start, d.end).includes("\n");
        edits.push({ start: d.start, end: d.end, text: renderList("import", keep.map((sp) => text.slice(sp.start, sp.end)), d.source.value, !multi) });
      } else throw new Abort(`${relToRepo(file)} imports a moved name next to a default/namespace import; edit it by hand`);
    }
    if (!moving.length) continue;
    moving.sort((a, b) => byCodepoint(a.imported, b.imported));
    moving.forEach((m) => siblingMovedNames.add(m.imported));
    const target = importPath(file, newAbs, areaRoot);
    const others = parsed.ast.body.filter((s) => s.type === "ImportDeclaration" && !fromSrc.includes(s));
    const next = others.find((s) => compareImportPaths(s.source.value, target) > 0);
    let pos;
    if (next) pos = lineStart(text, next.start);
    else if (fromSrc.length) pos = lineStart(text, fromSrc[0].start);
    else {
      const lastImp = parsed.ast.body.filter((s) => s.type === "ImportDeclaration").pop();
      pos = lastImp ? afterLine(text, lastImp.end) : 0;
    }
    edits.push({ start: pos, end: pos, text: renderList("import", moving.map((m) => m.text), target, true) + "\n" });
    siblings.push({ file, rel: relToRepo(file), before: text, after: applyEdits(text, edits), moved: moving.map((m) => m.imported) });
  }

  // ---- names the new file imports from the source, and what that source must export
  const selfSpecs = [];
  const newlyExported = [];
  const alreadyExported = [];
  const exportedAs = new Map(); // local -> exported name
  for (const [exp, local] of exportsB.names)
    if (local && (exp === local || !exportedAs.has(local))) exportedAs.set(local, exp);
  for (const name of needFromSource) {
    const exp = exportedAs.get(name);
    if (exp === name) { selfSpecs.push(name); alreadyExported.push(name); }
    else if (exp) { selfSpecs.push(`${exp} as ${name}`); alreadyExported.push(name); }
    else { selfSpecs.push(name); newlyExported.push(name); }
  }

  // ---- the new file
  const neededOutside = new Set([...backNames, ...siblingMovedNames]);
  const reexported = selected.filter((s) => s.exported).map((s) => s.fn.id.name).sort(byCodepoint);
  // moved functions the source or a sibling imports back go in ONE trailing list, as
  // in the hand splits, so the function text itself stays byte-for-byte unchanged
  const exportNames = selected.filter((s) => !s.exported && neededOutside.has(s.fn.id.name)).map((s) => s.fn.id.name).sort(byCodepoint);
  let body = "";
  selected.forEach((s, i) => {
    const text = s.chunk.text; // verbatim, bar the relative paths rewritten above
    if (i) {
      const gap = src0.slice(selected[i - 1].chunk.textEnd, s.chunk.chunkStart);
      body += /^\s*$/.test(gap) && gap.includes("\n") ? gap : "\n\n";
    }
    body += text;
  });
  const importLines = [];
  const groups = [...copiedImports.entries()].sort((a, b) => compareImportPaths(a[0], b[0]));
  for (const [from, g] of groups) {
    const named = [...g.named.entries()].sort((a, b) => byCodepoint(a[0], b[0])).map(([imp, loc]) => (imp === loc ? imp : `${imp} as ${loc}`));
    const head = [g.def, g.ns ? `* as ${g.ns}` : null].filter(Boolean);
    if (!named.length) importLines.push(`import ${head.join(", ")} from "${from}";`);
    else if (!head.length) importLines.push(renderList("import", named, from, true));
    else if (!g.ns) importLines.push(`import ${g.def}, { ${named.join(", ")} } from "${from}";`);
    else throw new Abort(`${from}: default + namespace + named imports together; edit by hand`);
  }
  if (selfSpecs.length) {
    const sorted = [...selfSpecs].sort(byCodepoint);
    importLines.push(renderList("import", sorted, importPath(newAbs, srcAbs, areaRoot)));
  }
  const purpose = o.purpose || `The CAD editor's ${path.basename(newBase, ".js").replace(/_/g, " ")}`;
  const newText = [
    renderHeader(purpose, srcRel, importPath(newAbs, srcAbs, areaRoot)),
    ...importLines,
    "",
    body,
    "",
    ...(exportNames.length ? [renderList("export", exportNames, null), ""] : []),
  ].join("\n");

  // ---- the shortened source
  const edits = [];
  const importNames = [...new Set([...backNames, ...reexported])].sort(byCodepoint);
  const imports = pb.ast.body.filter((s) => s.type === "ImportDeclaration");
  const modelerImports = imports.filter((s) => s.source.value.startsWith("./modeler/"));
  const anchor = (modelerImports.length ? modelerImports : imports).slice(-1)[0];
  const importAt = anchor ? afterLine(B, anchor.end) : 0;
  const newSpec = importPath(srcAbs, newAbs, areaRoot);
  if (importNames.length) {
    let text = renderList("import", importNames, newSpec) + "\n";
    if (reexported.length) text += renderList("export", reexported, null, true) + "\n";
    edits.push({ start: importAt, end: importAt, text });
  }
  if (newlyExported.length) {
    const lists = pb.ast.body.filter((s) => s.type === "ExportNamedDeclaration" && !s.declaration && !s.source);
    const headed = lists.filter((s) => headerCommentOf(s, pb.comments, B));
    const after = (headed.length ? headed : lists).slice(-1)[0];
    const at = after ? afterLine(B, after.end) : importAt;
    edits.push({
      start: at, end: at,
      text: `// for ${newRel} (live bindings: it sees every reassignment)\n${renderList("export", [...newlyExported].sort(byCodepoint), null)}\n`,
    });
  }
  const C = applyEdits(B, edits);

  // ---- static verification of every output before anything is written
  verify({ srcAbs, newAbs, srcBefore: src0, srcAfter: C, newText, siblings, areaRoot, relToRepo });

  // ---- report
  const movedLines = selected.reduce((n, s) => n + s.chunk.text.split("\n").length, 0);
  const lines = [];
  const list = (a, max = 14) => (a.length > max ? a.slice(0, max).join(", ") + `, ... (+${a.length - max} more)` : a.join(", "));
  lines.push(`split_module: ${srcRel} -> ${newRel}${o.dry ? "  [dry run, nothing written]" : ""}`);
  lines.push(`moved: ${selected.length} functions, ${movedLines} lines (${reexported.length} of them "export function", re-exported from the source)`);
  lines.push(`  ${list(selected.map((s) => s.fn.id.name))}`);
  if (setterPlan) {
    const b = [...setterPlan.bindings].map(([name, hs]) =>
      (hs.every((h) => h.fn === `${h.kind}_${name}` && !h.reuse) ? name : `${name} via ${hs.map((h) => h.fn + (h.reuse ? " (existing)" : "")).join(", ")}`));
    lines.push(`setters: ${setterPlan.bindings.size} bindings (${b.join(", ")}), ${setterPlan.siteCount} sites rewritten`);
  }
  if (rewrittenPaths) lines.push(`relative paths rewritten inside moved code: ${rewrittenPaths}`);
  lines.push(`imports in ${newBase}: ${importLines.length} statements; ${[...copiedImports.values()].reduce((n, g) => n + g.named.size + (g.def ? 1 : 0) + (g.ns ? 1 : 0), 0)} names copied from the source's imports`);
  lines.push(`from the source (${path.basename(srcAbs)}): ${selfSpecs.length} names (${newlyExported.length} newly exported for it, ${alreadyExported.length} already exported)`);
  if (newlyExported.length) lines.push(`  newly exported: ${list([...newlyExported].sort(byCodepoint))}`);
  lines.push(`back-imports in ${path.basename(srcAbs)}: ${backNames.length}${backNames.length ? " (" + list(backNames, 10) + ")" : ""}`);
  lines.push(`siblings edited: ${siblings.length}${siblings.map((s) => `\n  ${s.rel}: ${s.moved.length} name(s) now import from ${newBase}`).join("")}`);
  lines.push(`source export lists: ${removedFromLists.size} moved names removed, ${emptyLists} emptied lists deleted`);
  lines.push(`left behind in the ranges: ${leftBehind.length}${leftBehind.length ? "\n" + leftBehind.slice(0, 12).map((l) => "  " + l).join("\n") + (leftBehind.length > 12 ? `\n  ... (+${leftBehind.length - 12} more)` : "") : ""}`);
  lines.push(setterPlan && setterPlan.siteCount
    ? "guard: pass (assignments to source top-level bindings go through setters; outputs parse, resolve, link)"
    : "guard: pass (no moved code assigns a source top-level binding; outputs parse, resolve, link)");
  lines.push(`add ${newRel} to survey-assets.json, then run npm run check`);
  result.report = lines.join("\n");
  result.moved = selected.map((s) => s.fn.id.name);
  if (setterPlan)
    result.setters = {
      // binding -> its setter (its first helper when only ++/-- touch it)
      bindings: Object.fromEntries([...setterPlan.bindings].map(([n, hs]) => [n, (hs.find((h) => h.kind === "set") || hs[0]).fn])),
      helpers: setterPlan.helpers.map((h) => h.fn),
      sites: setterPlan.siteCount,
    };
  result.leftBehind = leftBehind;
  result.files = [srcAbs, newAbs, ...siblings.map((s) => s.file)];
  result.texts = { target: newText, source: C, siblings: siblings.map((s) => ({ path: s.file, text: s.after })) };

  if (o.dry || textMode) return;
  const originals = [];
  const plan = [
    { file: newAbs, text: newText, was: null },
    ...siblings.map((s) => ({ file: s.file, text: s.after, was: fs.readFileSync(s.file, "utf8") })),
    { file: srcAbs, text: C, was: fs.readFileSync(srcAbs, "utf8") },
  ];
  try {
    for (const p of plan) { writeVerified(p.file, p.text); originals.push(p); }
  } catch (e) {
    for (const p of originals.reverse()) {
      try { if (p.was == null) fs.rmSync(p.file, { force: true }); else fs.writeFileSync(p.file, p.was); } catch {}
    }
    throw new Abort(`write failed, rolled back: ${e.message}`);
  }
  result.written = true;
}

function writeVerified(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let last = null;
  for (let i = 0; i < 3; i++) {
    try {
      fs.writeFileSync(file, text, "utf8");
      if (fs.readFileSync(file, "utf8") === text) return;
      last = new Error("read-back differs");
    } catch (e) { last = e; }
  }
  throw new Error(`${file}: ${last.message}`);
}

function describeStatement(stmt) {
  const line = stmt.loc.start.line;
  const s = (stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration") && stmt.declaration ? stmt.declaration : stmt;
  switch (s.type) {
    case "VariableDeclaration": return `${s.kind} ${s.declarations.flatMap((d) => patternIds(d.id).map((i) => i.name)).join(", ")} (line ${line})`;
    case "ClassDeclaration": return `class ${s.id ? s.id.name : "(anonymous)"} (line ${line})`;
    case "FunctionDeclaration": return `function ${s.id ? s.id.name : "(default)"} (line ${line}, not movable)`;
    case "ImportDeclaration": return `import from ${s.source.value} (line ${line})`;
    case "ExportNamedDeclaration": return `export list/re-export (line ${line})`;
    case "ExpressionStatement": return `statement (line ${line})`;
    default: return `${s.type} (line ${line})`;
  }
}

function freeNameSet(text, file) {
  const set = new Set();
  analyze(parse(text, file).ast, (n) => set.add(n.name), GLOBALS);
  return set;
}

function verify({ srcAbs, newAbs, srcBefore, srcAfter, newText, siblings, areaRoot, relToRepo }) {
  const errors = [];
  const before = freeNameSet(srcBefore, "source (before)");
  const files = [
    { abs: srcAbs, text: srcAfter, preexisting: before },
    { abs: newAbs, text: newText, preexisting: before },
    ...siblings.map((s) => ({ abs: s.file, text: s.after, preexisting: freeNameSet(s.before, s.rel) })),
  ];
  const exportsByFile = new Map();
  const parsed = new Map();
  for (const f of files) {
    const { ast } = parse(f.text, relToRepo(f.abs));
    parsed.set(f.abs, ast);
    const ex = collectExports(ast);
    exportsByFile.set(f.abs, ex);
    for (const d of ex.dupes) errors.push(`${relToRepo(f.abs)} exports ${d} twice`);
    const now = freeNameSet(f.text, relToRepo(f.abs));
    for (const n of now) if (!f.preexisting.has(n)) errors.push(`${relToRepo(f.abs)}: ${n} is not declared, imported, or a global`);
  }
  for (const f of files) {
    for (const stmt of parsed.get(f.abs).body) {
      if (stmt.type !== "ImportDeclaration" || !isRelative(stmt.source.value)) continue;
      const target = path.resolve(path.dirname(f.abs), stmt.source.value);
      const hit = files.find((x) => samePath(x.abs, target));
      if (!hit) continue;
      const ex = exportsByFile.get(hit.abs);
      for (const sp of stmt.specifiers) {
        if (sp.type !== "ImportSpecifier") continue;
        const n = sp.imported.name ?? sp.imported.value;
        if (!ex.names.has(n) && !ex.star) errors.push(`${relToRepo(f.abs)} imports ${n} from ${stmt.source.value}, which does not export it`);
      }
    }
  }
  // the new file must hold nothing but imports and function declarations
  for (const stmt of parsed.get(newAbs).body) {
    const ok = stmt.type === "ImportDeclaration" || functionOf(stmt) || (stmt.type === "ExportNamedDeclaration" && !stmt.declaration && !stmt.source);
    if (!ok) errors.push(`${relToRepo(newAbs)}: unexpected top-level ${stmt.type} at line ${stmt.loc.start.line}`);
  }
  if (errors.length) throw new Abort(["verification failed:", ...errors.map((e) => "  " + e)]);
}

// ---- CLI -------------------------------------------------------------------
function parseArgs(argv) {
  const o = { dry: false };
  const need = (i, flag) => {
    if (i + 1 >= argv.length) throw new Abort(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline = null;
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) { inline = a.slice(eq + 1); a = a.slice(0, eq); }
    const val = () => (inline != null ? inline : (i++, need(i - 1, a)));
    switch (a) {
      case "--from": o.from = val(); break;
      case "--to": o.to = val(); break;
      case "--names": o.names = val(); break;
      case "--lines": o.lines = val(); break;
      case "--purpose": o.purpose = val(); break;
      case "--dry": o.dry = true; break;
      case "--setters": o.setters = true; break;
      case "--help": case "-h": o.help = true; break;
      default: throw new Abort(`unknown argument ${a}`);
    }
  }
  return o;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch (_) {
    return false;
  }
}

if (isMainModule()) {
  const usage = 'usage: node tools/split_module.mjs --from <file> --to <newfile> (--names a,b,c | --lines 5000-5999[,7000-7100]) [--purpose "text"] [--setters] [--dry]';
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
    console.error(e.message + "\n" + usage);
    process.exit(2);
  }
  if (opts.help) { console.error(usage); process.exit(0); }
  const result = splitModule(opts);
  (result.ok ? console.log : console.error)(result.report);
  process.exit(result.ok ? 0 : 1);
}

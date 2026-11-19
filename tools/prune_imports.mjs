#!/usr/bin/env node
// Remove import specifiers a module never references.
//
//   node tools/prune_imports.mjs [--dry] <files or globs...>
//   node tools/prune_imports.mjs [--dry] --all        # js/ server/ tools/ uikit/
//
// A file split leaves every piece with the parent's whole import list. This
// drops the specifiers the piece does not use. If every specifier of a
// statement is unused the statement becomes a bare side-effect import
// (`import "./x.js";`), never a deletion, so the module is still loaded and the
// evaluation order is unchanged. A name that is only re-exported through an
// `export { name }` list counts as used.
//
// Usage is decided by tools/module_check.mjs's scope walk: the import
// declarations are left out of the program, so every reference to an imported
// name surfaces as a free identifier (shadowed names do not).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { analyze, defaultFiles, REPO_ROOT } from "./module_check.mjs";

const WRAP_COLS = 80;

function parse(code, comments) {
  return acorn.parse(code, {
    ecmaVersion: "latest", sourceType: "module", allowHashBang: true,
    onComment: comments || undefined,
  });
}

// Names (local bindings) of imports that the program references.
function usedNames(ast) {
  const imported = new Set();
  for (const n of ast.body) {
    if (n.type === "ImportDeclaration") n.specifiers.forEach((s) => imported.add(s.local.name));
  }
  const used = new Set();
  const rest = Object.assign({}, ast, { body: ast.body.filter((n) => n.type !== "ImportDeclaration") });
  analyze(rest, (id) => { if (imported.has(id.name)) used.add(id.name); }, new Set());
  return used;
}

function specText(s) {
  const a = s.imported.name !== undefined ? s.imported.name : s.imported.value;
  return a === s.local.name ? a : `${a} as ${s.local.name}`;
}

// Rebuild an import statement from the specifiers that survive.
function rebuild(node, kept, text, multiline) {
  const quote = text[node.source.start];
  const src = quote + node.source.value + quote;
  const semi = text[node.end - 1] === ";" ? ";" : "";
  if (!kept.length) return `import ${src}${semi}`;
  const def = kept.find((s) => s.type === "ImportDefaultSpecifier");
  const ns = kept.find((s) => s.type === "ImportNamespaceSpecifier");
  const named = kept.filter((s) => s.type === "ImportSpecifier").map(specText);
  const head = [];
  if (def) head.push(def.local.name);
  if (ns) head.push(`* as ${ns.local.name}`);
  const oneLine = () => {
    const parts = head.slice();
    if (named.length) parts.push(`{ ${named.join(", ")} }`);
    return `import ${parts.join(", ")} from ${src}${semi}`;
  };
  const line = oneLine();
  if (!multiline || !named.length || line.length <= WRAP_COLS) return line;
  const lines = [];
  let cur = " ";
  for (const n of named) {
    if (cur.length > 1 && (cur + " " + n + ",").length > WRAP_COLS) { lines.push(cur); cur = " "; }
    cur += " " + n + ",";
  }
  lines.push(cur);
  const prefix = head.length ? `import ${head.join(", ")}, {` : "import {";
  return `${prefix}\n${lines.join("\n")}\n} from ${src}${semi}`;
}

// -> { code, changes: [{ source, removed: [names], bare }], bareCount }
export function pruneImports(code) {
  const comments = [];
  const ast = parse(code, comments);
  const used = usedNames(ast);
  const edits = [];
  const changes = [];
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration" || !node.specifiers.length) continue;
    if (node.attributes && node.attributes.length) continue;
    const unused = node.specifiers.filter((s) => !used.has(s.local.name));
    if (!unused.length) continue;
    // a comment inside the statement would be lost by a rebuild
    if (comments.some((c) => c.start >= node.start && c.end <= node.end)) continue;
    const kept = node.specifiers.filter((s) => used.has(s.local.name));
    const multiline = code.slice(node.start, node.end).includes("\n");
    edits.push({ start: node.start, end: node.end, text: rebuild(node, kept, code, multiline) });
    changes.push({ source: node.source.value, removed: unused.map((s) => s.local.name), bare: !kept.length });
  }
  let out = code;
  for (const e of edits.slice().reverse()) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (edits.length) parse(out); // the rewrite must still parse
  return { code: out, changes, bareCount: changes.filter((c) => c.bare).length };
}

function expand(arg) {
  if (!arg.includes("*")) return [arg];
  const dir = path.dirname(arg);
  const esc = path.basename(arg).split("*").map((p) => p.replace(/[.+^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("^" + esc.join(".*") + "$");
  let names = [];
  try { names = fs.readdirSync(path.resolve(dir)); } catch (_) { /* no such dir */ }
  return names.filter((n) => re.test(n)).sort().map((n) => path.join(dir, n));
}

function main(argv) {
  const dry = argv.includes("--dry");
  const args = argv.filter((a) => a !== "--dry");
  let files;
  if (args.includes("--all")) files = defaultFiles();
  else files = args.flatMap(expand);
  files = [...new Set(files.map((f) => path.resolve(f)))].filter((f) => /\.m?js$/.test(f) && fs.existsSync(f));
  if (!files.length) {
    console.error("usage: node tools/prune_imports.mjs [--dry] <files|globs...|--all>");
    return 2;
  }
  let nFiles = 0, nSpecs = 0, nBare = 0;
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    const code = fs.readFileSync(file, "utf8");
    let res;
    try { res = pruneImports(code); } catch (e) { console.error(`${rel}: skipped (${e.message})`); continue; }
    if (!res.changes.length) continue;
    nFiles++;
    for (const c of res.changes) {
      nSpecs += c.removed.length;
      console.log(`${rel}: ${c.bare ? "bare " : ""}${c.source}: ${c.removed.join(", ")}`);
    }
    nBare += res.bareCount;
    if (!dry) fs.writeFileSync(file, res.code);
  }
  console.log(`${dry ? "would prune" : "pruned"} ${nSpecs} specifier(s) in ${nFiles} file(s); ${nBare} bare import(s)`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

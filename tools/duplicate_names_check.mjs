#!/usr/bin/env node
// No two files of one split module may declare the same top-level name.
//
//   node tools/duplicate_names_check.mjs     exit 1 on a duplicate
//
// A split module is js/<name>.js plus the pieces moved out of it into
// js/<name>/*.js. As ES modules each piece has its own scope, so two pieces
// may both declare `function activeSketch()` and the browser never complains.
// But the tests read a split module as ONE script (moduleSource /
// modelerSource in tests/helpers/module_source.mjs), and in that joined text
// the second declaration is "SyntaxError: Identifier 'activeSketch' has
// already been declared": every test that evaluates the module fails at once
// (7b3b865c broke 405 tests this way). Rename one of the two.
//
// The families and their files come from moduleFiles() itself, so this check
// joins exactly what the tests join. js/<name>/ folders that hold independent
// modules rather than pieces of js/<name>.js (INDEPENDENT) are skipped, unless
// some test or tool does join them with moduleSource("js/<name>.js").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { moduleFiles } from "../tests/helpers/module_source.mjs";

const ROOT = path.normalize(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

// js/physics/ is the physics engine's own modules, loaded through
// physics_facade.js -> physics.js; nothing reads it as one joined script.
export const INDEPENDENT = new Set(["js/physics.js"]);

function bindPattern(node, add) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": add(node.name); break;
    case "ObjectPattern":
      for (const p of node.properties) bindPattern(p.type === "RestElement" ? p.argument : p.value, add);
      break;
    case "ArrayPattern": for (const e of node.elements) bindPattern(e, add); break;
    case "RestElement": bindPattern(node.argument, add); break;
    case "AssignmentPattern": bindPattern(node.left, add); break;
  }
}

// Top-level names a module declares: function, class, var/let/const
// (destructuring and multi-declarator lists included), exported or not.
// Imports are not counted: moduleSource strips the pieces' import blocks.
export function topLevelNames(text) {
  const ast = acorn.parse(text, { ecmaVersion: "latest", sourceType: "module", allowHashBang: true });
  const names = new Set();
  const add = (n) => names.add(n);
  for (let node of ast.body) {
    if ((node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") && node.declaration) {
      node = node.declaration;
    }
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) add(node.id.name);
    else if (node.type === "VariableDeclaration") for (const d of node.declarations) bindPattern(d.id, add);
  }
  return names;
}

// files: [{ path, text }] of one family -> [{ name, files: [path, ...] }]
export function duplicateNames(files) {
  const where = new Map();
  for (const f of files) {
    for (const n of topLevelNames(f.text)) {
      if (!where.has(n)) where.set(n, []);
      where.get(n).push(f.path);
    }
  }
  return [...where]
    .filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, files: paths }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// "js/x.js" paths that tests/ and tools/ name in a literal moduleSource(...) /
// moduleFiles(...) call; used to keep checking an INDEPENDENT folder once
// something does join it.
function joinedByCallers(root) {
  const out = new Set(["js/modeler.js"]); // modelerSource()/modelerFiles()
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.m?js$/.test(e.name)) {
        const re = /module(?:Source|Files)\(\s*["'`](js\/[\w.-]+\.js)["'`]/g;
        for (const m of fs.readFileSync(p, "utf8").matchAll(re)) out.add(m[1]);
      }
    }
  };
  for (const d of ["tests", "uikit/tests", "tools"]) walk(path.join(root, d));
  return out;
}

// Every js/<name>.js that has a js/<name>/ folder beside it, the rule
// moduleFiles() joins by, minus INDEPENDENT folders nothing joins.
export function splitFamilies(root = ROOT) {
  const js = path.join(root, "js");
  const joined = joinedByCallers(root);
  return fs.readdirSync(js, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(js, e.name + ".js")))
    .map((e) => "js/" + e.name + ".js")
    .filter((rel) => !INDEPENDENT.has(rel) || joined.has(rel))
    .sort();
}

export function checkTree(root = ROOT) {
  const problems = [];
  for (const rel of splitFamilies(root)) {
    const files = moduleFiles(rel).map((p) => ({ path: p, text: fs.readFileSync(path.join(root, p), "utf8") }));
    for (const d of duplicateNames(files)) problems.push({ family: rel, ...d });
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const problems = checkTree();
  if (problems.length) {
    console.error("duplicate_names_check: top-level names declared in more than one file of a split module.");
    console.error("The tests join each family into one script (moduleSource), where this is a SyntaxError. Rename one.\n");
    for (const p of problems) console.error(`  ${p.family}: ${p.name}\n    ${p.files.join("\n    ")}`);
    process.exit(1);
  }
  console.log(`duplicate_names_check: ${splitFamilies().length} split families, no duplicate top-level names.`);
}

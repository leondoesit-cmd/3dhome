#!/usr/bin/env node
// Keeps the codebase in pieces an agent can read: no source file over
// FILE_MAX lines and no function over FN_MAX lines. Files and functions that
// were already bigger when this gate arrived are listed in
// tools/size_baseline.json and may not grow past their recorded size (plus a
// small SLACK); they may only shrink. Run as part of `npm run check`.
//
//   node tools/size_check.mjs            check (exit 1 on a violation)
//   node tools/size_check.mjs --ratchet  lower baseline entries that shrank,
//                                        drop ones now under the limit
//
// Over the limit? Split, do not raise the baseline: tools/split_module.mjs
// moves functions into js/<name>/ pieces, tools/extract_block.mjs cuts a
// giant function (AGENTS.md "Keeping the structure").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as acorn from "../vendor/acorn/acorn.mjs";

export const FILE_MAX = 1500, FN_MAX = 300, FILE_SLACK = 40, FN_SLACK = 20;
const ROOT = path.normalize(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const BASELINE = path.join(ROOT, "tools", "size_baseline.json");
const DIRS = ["js", "css", "server", "tools", "uikit"];
const SKIP = /(^|\/)(vendor|node_modules)\//;

export function sourceFiles(root = ROOT) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel + "/" + e.name;
      if (SKIP.test(r + "/")) continue;
      if (e.isDirectory()) walk(r);
      else if (/\.(m?js|css)$/.test(e.name)) out.push(r);
    }
  };
  for (const d of DIRS) if (fs.existsSync(path.join(root, d))) walk(d);
  return out.sort();
}

const lineCount = (text) => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

// Every named function (declarations, `x = function/arrow`, methods) with its
// length in lines; anonymous ones are keyed by the function around them.
export function functionSizes(text) {
  let ast;
  try { ast = acorn.parse(text, { ecmaVersion: "latest", sourceType: "module", locations: true }); }
  catch { try { ast = acorn.parse(text, { ecmaVersion: "latest", sourceType: "script", locations: true }); } catch { return new Map(); } }
  const sizes = new Map();
  const note = (name, node) => {
    const n = node.loc.end.line - node.loc.start.line + 1;
    if (n > (sizes.get(name) || 0)) sizes.set(name, n);
  };
  const walk = (node, owner, nameHint) => {
    if (!node || typeof node.type !== "string") return;
    let inner = owner;
    if (/Function/.test(node.type)) {
      const name = node.id?.name || nameHint || (owner ? owner + ">(anonymous)" : "(anonymous)");
      note(name, node);
      inner = name;
    }
    for (const key in node) {
      if (key === "loc" || key === "type") continue;
      const v = node[key];
      const hintFor = (child) =>
        node.type === "VariableDeclarator" && key === "init" && node.id.type === "Identifier" ? node.id.name
        : (node.type === "Property" || node.type === "MethodDefinition" || node.type === "PropertyDefinition") && key === "value" && node.key?.name ? node.key.name
        : node.type === "AssignmentExpression" && key === "right" && node.left.type === "Identifier" ? node.left.name
        : node.type === "AssignmentExpression" && key === "right" && node.left.type === "MemberExpression" && node.left.property?.name ? node.left.property.name
        : undefined;
      if (Array.isArray(v)) v.forEach((c) => walk(c, inner, hintFor(c)));
      else if (v && typeof v.type === "string") walk(v, inner, hintFor(v));
    }
  };
  walk(ast, null);
  return sizes;
}

export function measure(root = ROOT) {
  const files = {}, functions = {};
  for (const rel of sourceFiles(root)) {
    const text = fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
    files[rel] = lineCount(text);
    if (/\.m?js$/.test(rel)) for (const [name, n] of functionSizes(text)) functions[rel + "#" + name] = n;
  }
  return { files, functions };
}

export function check({ files, functions }, baseline) {
  const problems = [];
  for (const [rel, n] of Object.entries(files)) {
    const cap = baseline.files?.[rel];
    if (cap != null ? n > cap + FILE_SLACK : n > FILE_MAX)
      problems.push(`${rel}: ${n} lines (limit ${cap != null ? `${cap}+${FILE_SLACK}, frozen at its size when the gate arrived` : FILE_MAX})`);
  }
  for (const [key, n] of Object.entries(functions)) {
    const cap = baseline.functions?.[key];
    if (cap != null ? n > cap + FN_SLACK : n > FN_MAX)
      problems.push(`${key.replace("#", " ")}(): ${n} lines (limit ${cap != null ? `${cap}+${FN_SLACK}, frozen` : FN_MAX})`);
  }
  return problems;
}

function isMain() {
  try { return path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url); } catch { return false; }
}

if (isMain()) {
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : { files: {}, functions: {} };
  const now = measure();
  if (process.argv.includes("--init")) {
    // one-time: freeze everything currently over the limits
    const pick = (o, max) => Object.fromEntries(Object.entries(o).filter(([, n]) => n > max).sort());
    fs.writeFileSync(BASELINE, JSON.stringify({ files: pick(now.files, FILE_MAX), functions: pick(now.functions, FN_MAX) }, null, 1) + "\n");
    console.log("baseline written");
  } else if (process.argv.includes("--ratchet")) {
    // only ever lowers: shrunk entries drop to their new size, entries under the limit go
    let changed = 0;
    for (const [kind, max] of [["files", FILE_MAX], ["functions", FN_MAX]]) {
      for (const [key, cap] of Object.entries(baseline[kind] || {})) {
        const n = now[kind][key];
        if (n == null || n <= max) { delete baseline[kind][key]; changed++; }
        else if (n < cap) { baseline[kind][key] = n; changed++; }
      }
    }
    fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 1) + "\n");
    console.log(`baseline ratcheted down: ${changed} entr${changed === 1 ? "y" : "ies"}`);
  } else {
    const problems = check(now, baseline);
    const fileCount = Object.keys(now.files).length;
    if (!problems.length) {
      console.log(`sizes ok: ${fileCount} files within ${FILE_MAX} lines, functions within ${FN_MAX} (${Object.keys(baseline.files).length + Object.keys(baseline.functions).length} older ones frozen)`);
    } else {
      console.log(`${problems.length} size violation(s) — split instead of growing (AGENTS.md "Keeping the structure"):`);
      for (const p of problems) console.log("  " + p);
      process.exitCode = 1;
    }
  }
}

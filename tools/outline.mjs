#!/usr/bin/env node
// Compact, always-current outline of a big source file, so agents can skip reading it.
//
//   node tools/outline.mjs <file> [--grep <word>]
//
// JS/MJS: one line per top-level (column 0) declaration, plus `// ---- title` section comments.
// CSS:    top-level `/* ---- title */` and `/* ==== */` section headers.
// Rows are `<line>\t<kind> <name>` or `<line>\t## <title>`, read straight from disk on every run.
// `outlineText(text, { css })` returns the same rows as data (used by tools/test_changed.mjs).
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const clean = (s) => s.replace(/\*\/.*$/, "").replace(/^[\s=-]+|[\s=-]+$/g, "").trim().slice(0, 90);

// Top-level declarations as [pattern, kind builder, name group, label builder]. Anchored at column 0 by the ^.
const DECLS = [
  [/^(export\s+(?:default\s+)?)?(async\s+)?function\b\s*\*?\s*([\w$]+)/, () => "fn", 3, (m) => `${m[2] ? "async " : ""}fn ${m[3]}`],
  [/^(export\s+(?:default\s+)?)?class\s+([\w$]+)/, () => "class", 2, (m) => `class ${m[2]}`],
  [/^(export\s+(?:default\s+)?)?(const|let|var)\s+([\w$]+)\s*=/, (m) => m[2], 3, (m) => `${m[2]} ${m[3]}`],
];

// The outline of `text` as rows: { line, kind, name, exported, section, text }.
// A section row has kind "section", section true and the title as its name;
// `text` is the label the CLI prints after the line number.
export function outlineText(text, { css = false } = {}) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const rows = [];
  lines.forEach((ln, i) => {
    const n = i + 1;
    const sec = css ? /^\/\*\s*[-=]{3,}(.*)$/.exec(ln) : /^\/\/\s*[-=]{3,}(.*)$/.exec(ln);
    if (sec) {
      // a boxed header (`/* =====` alone on its line) has its title on the next line
      const title = clean(sec[1]) || clean((lines[i + 1] ?? "").replace(/^\s*(\/\/|\*)?/, ""));
      if (title) rows.push({ line: n, kind: "section", name: title, exported: false, section: true, text: title });
      return;
    }
    if (css) return;
    for (const [re, kindOf, nameGroup, label] of DECLS) {
      const m = re.exec(ln);
      if (!m) continue;
      const pre = (m[1] ?? "").replace(/\s+/g, " ").trim();
      rows.push({
        line: n, kind: kindOf(m), name: m[nameGroup], exported: !!pre, section: false,
        text: `${pre ? pre + " " : ""}${label(m)}`,
      });
      return;
    }
  });
  return rows;
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

function main() {
  const usage = (msg) => {
    if (msg) console.error(msg);
    console.error("usage: node tools/outline.mjs <file> [--grep <word>]");
    process.exit(1);
  };

  const argv = process.argv.slice(2);
  const gi = argv.indexOf("--grep");
  const grep = gi >= 0 ? (argv[gi + 1] ?? "").toLowerCase() : "";
  const file = argv.filter((a, i) => a !== "--grep" && argv[i - 1] !== "--grep")[0];
  if (!file) usage();

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    usage(`cannot read ${file}: ${e.code ?? e.message}`);
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const total = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  const rows = outlineText(text, { css: /\.css$/i.test(file) });
  const shown = rows.filter((r) => r.text.toLowerCase().includes(grep));
  const out = [`${file}: ${total} lines, ${shown.length} entries`];
  for (const r of shown) out.push(`${r.line}\t${r.section ? "## " : ""}${r.text}`);
  console.log(out.join("\n"));
}

if (isMainModule()) main();

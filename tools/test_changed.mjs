#!/usr/bin/env node
// Run only the test files related to the current change.
//
//   node tools/test_changed.mjs [--list] [--broad] [--base <ref>] [-- <node args>]
//   node tools/test_changed.mjs <file.test.mjs>...   run exactly those files
//   node tools/test_changed.mjs --all                run every Node test file
//
// Positional files win over --all; both skip git selection. Otherwise changed
// files = git diff against HEAD (or --base <ref>) plus untracked files.
// Changed test files are selected directly; for each changed source file, any
// test whose text mentions its basename is selected.
//
// The CAD editor source (js/modeler.js, js/modeler/*.js) is selected finer: the
// changed line ranges (git diff -U0, both sides) are mapped to the top-level
// declarations they touch (tools/outline.mjs), and a test that reads the editor
// source (helpers/modeler_source) is selected when it names one of those
// declarations as a whole word, or names the changed file's path. It falls back
// to "every test using helpers/modeler_source" when more than 40 declarations
// changed; --broad forces that. Lines of import statements and export lists never count.
// Output goes through tools/test_reporter_failures.mjs (failures + one summary line).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { outlineText } from "./outline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIRS = ["tests", "uikit/tests"];
const SOURCE_RE = /^(js|server|tools|css|uikit)\/|^index\.html$/;
export const MAX_DECLARATIONS = 40;
const MODELER_HELPER = "helpers/modeler_source";
const USES_MODELER_SOURCE = /modeler_source|modelerSource/;

// ---- pure pieces (no git, no disk) ---------------------------------------

export function isEditorSource(file) {
  return /\.js$/.test(file) && (file === "js/modeler.js" || file.startsWith("js/modeler/"));
}

// "js/modeler.js" -> "js/modeler.js"; "js/modeler/inspector.js" -> "modeler/inspector.js"
export function editorPathNeedle(file) {
  return file.startsWith("js/modeler/") ? file.slice("js/".length) : file;
}

// Hunks of a `git diff -U0` text: [{ oldStart, oldCount, newStart, newCount }]. A missing count is 1.
export function parseHunks(diffText) {
  const hunks = [];
  const re = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let m;
  while ((m = re.exec(diffText))) {
    hunks.push({
      oldStart: +m[1], oldCount: m[2] === undefined ? 1 : +m[2],
      newStart: +m[3], newCount: m[4] === undefined ? 1 : +m[4],
    });
  }
  return hunks;
}

// New-side ranges [{ start, count }]. A pure deletion (count 0) at line c touches line c.
export function newRanges(hunks) {
  return hunks.map((h) => ({ start: h.newStart, count: h.newCount }));
}
// Old-side ranges; a pure insertion (count 0) removed nothing, so it has none.
export function oldRanges(hunks) {
  return hunks.filter((h) => h.oldCount > 0).map((h) => ({ start: h.oldStart, count: h.oldCount }));
}

function declarations(outline) {
  return outline.filter((r) => !r.section);
}

// 1-based lines of import statements and \`export { ... };\` lists (with the
// "// for js/modeler/..." comment above one). modelerSource() strips these, so
// a change confined to them cannot alter what a source-reading test sees.
export function ignorableLines(text) {
  const src = text.replace(/\r\n/g, "\n");
  const out = new Set();
  const re = /^(?:\/\/ for js\/modeler\/[^\n]*\n)?(?:import\b[^;]*;|export\s*\{[^}]*\}(?:\s*from\s*["'][^"']+["'])?\s*;|export\s*\*[^;]*;)/gm;
  let m;
  while ((m = re.exec(src))) {
    let line = 1;
    for (let i = src.indexOf("\n"); i >= 0 && i < m.index; i = src.indexOf("\n", i + 1)) line++;
    const n = m[0].split("\n").length;
    for (let k = 0; k < n; k++) out.add(line + k);
  }
  return out;
}

const isVariable = (d) => d.kind === "const" || d.kind === "let" || d.kind === "var";

// Last line of a variable declaration's own statement: its first line when that
// ends the statement, else the closing line (column 0 "}", "]" or ")") of its initializer.
function variableEnd(lines, decl, nextLine) {
  const first = (lines[decl.line - 1] ?? "").trimEnd();
  const limit = nextLine - 1;
  if (first.endsWith(";")) return decl.line;
  for (let n = decl.line + 1; n <= limit; n++) {
    if (/^[}\])]/.test(lines[n - 1] ?? "")) return n;
  }
  return limit;
}

// Names of the top-level declarations whose span overlaps a range. A declaration
// spans from its own line to the line before the next declaration (the last one to EOF).
// Without \`text\` that is all there is: a pure deletion (count 0) at line c touches
// the declaration containing c.
// With \`text\` (the file those ranges refer to) the check is per changed line:
// blank lines, import statements and export lists are skipped, a pure deletion
// is skipped (the old side's ranges carry it), and a line after a top-level
// variable's own statement belongs to no declaration, so the variable's name
// (often short, like \`root\`) is not used unless the variable itself changed.
export function changedDeclarations(outline, ranges, text) {
  const decls = declarations(outline);
  const names = new Set();
  if (text == null) {
    for (const { start, count } of ranges) {
      const last = count > 0 ? start + count - 1 : start;
      decls.forEach((d, i) => {
        const end = i + 1 < decls.length ? decls[i + 1].line - 1 : Infinity;
        if (d.line <= last && end >= start) names.add(d.name);
      });
    }
    return [...names];
  }
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const ignore = ignorableLines(text);
  const ends = decls.map((d, i) => (isVariable(d)
    ? variableEnd(lines, d, i + 1 < decls.length ? decls[i + 1].line : lines.length + 1)
    : Infinity));
  for (const { start, count } of ranges) {
    for (let n = Math.max(start, 1); n < start + count; n++) {
      if (ignore.has(n) || !(lines[n - 1] ?? "").trim()) continue;
      let lo = 0;
      let hi = decls.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (decls[mid].line <= n) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (idx >= 0 && n <= ends[idx]) names.add(decls[idx].name);
    }
  }
  return [...names];
}

// All top-level declaration names (a new, deleted or fully replaced file).
export function allDeclarations(outline) {
  return [...new Set(declarations(outline).map((r) => r.name))];
}

// What the editor-source files of a change need. `files` is [{ file }]; `io` supplies
// diff(file) (git diff -U0 text), oldText(file) and newText(file) (null when the file
// does not exist on that side). Returns { names, paths, declCount, fallback }.
export function planEditorChanges(files, io, { maxDeclarations = MAX_DECLARATIONS } = {}) {
  const names = new Set();
  const paths = [];
  const keys = new Set();
  let fallback = null;
  for (const { file } of files) {
    paths.push(editorPathNeedle(file));
    const newText = io.newText(file);
    const oldText = io.oldText(file);
    const add = (list) => list.forEach((n) => { names.add(n); keys.add(`${file}:${n}`); });
    const newOutline = newText == null ? [] : outlineText(newText);
    const oldOutline = oldText == null ? [] : outlineText(oldText);
    if (newText == null || oldText == null) {
      // created or deleted: every declaration of the side that exists
      add(allDeclarations(newText == null ? oldOutline : newOutline));
      continue;
    }
    const hunks = parseHunks(io.diff(file));
    const nr = newRanges(hunks);
    const or = oldRanges(hunks);
    add(changedDeclarations(newOutline, nr, newText));
    add(changedDeclarations(oldOutline, or, oldText));
  }
  if (!fallback && keys.size > maxDeclarations) {
    fallback = `${keys.size} declarations changed (limit ${maxDeclarations})`;
  }
  return { names, paths, declCount: keys.size, fallback };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// One regex matching any of the names as a whole word (`$` counts as a word character).
export function wholeWordRegex(names) {
  const list = [...names];
  if (!list.length) return null;
  return new RegExp(`(?<![\\w$])(?:${list.map(escapeRe).join("|")})(?![\\w$])`);
}

// Pick the tests to run. `changedTests` are selected directly, `needles` match by
// substring, `editor` ({ names, paths }) matches by whole-word declaration name
// among tests that read the editor source, or by the changed file's path.
// Returns { selected: Set, viaEditor: Set }.
export function selectTests({ allTests, textOf, changedTests = [], needles = [], editor = null }) {
  const selected = new Set(changedTests.filter((t) => allTests.includes(t)));
  const viaEditor = new Set();
  const nameRe = editor ? wholeWordRegex(editor.names) : null;
  for (const test of allTests) {
    if (selected.has(test)) continue;
    const text = textOf(test);
    if (needles.some((n) => text.includes(n))) {
      selected.add(test);
    } else if (editor && ((nameRe && USES_MODELER_SOURCE.test(text) && nameRe.test(text)) || editor.paths.some((p) => text.includes(p)))) {
      selected.add(test);
      viaEditor.add(test);
    }
  }
  return { selected, viaEditor };
}

// ---- CLI ------------------------------------------------------------------

export function parseArgs(argv) {
  const dd = argv.indexOf("--");
  const nodeArgs = dd >= 0 ? argv.slice(dd + 1) : [];
  const own = dd >= 0 ? argv.slice(0, dd) : argv;
  const baseIdx = own.indexOf("--base");
  return {
    nodeArgs,
    listOnly: own.includes("--list"),
    runAll: own.includes("--all"),
    broad: own.includes("--broad"),
    positional: own.filter((a, i) => a.endsWith(".mjs") && (baseIdx < 0 || i !== baseIdx + 1)),
    baseGiven: baseIdx >= 0,
    base: baseIdx >= 0 ? own[baseIdx + 1] : "HEAD",
  };
}

function gitRaw(args) {
  return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
}
const gitLines = (args) => gitRaw(args).split(/\r?\n/).filter(Boolean);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { listOnly, runAll, broad, positional, base, nodeArgs } = args;
  if (args.baseGiven && !base) {
    console.error("--base needs a ref");
    process.exit(2);
  }

  const tracked = positional.length || runAll ? [] : gitLines(["diff", "--name-only", base]);
  const untracked = positional.length || runAll ? [] : gitLines(["ls-files", "--others", "--exclude-standard"]);
  const changed = [...new Set([...tracked, ...untracked])];

  const allTests = [];
  for (const dir of TEST_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith(".test.mjs")) allTests.push(`${dir}/${f}`);
    }
  }

  const textCache = new Map();
  const textOf = (file) => {
    if (!textCache.has(file)) textCache.set(file, fs.readFileSync(path.join(ROOT, file), "utf8"));
    return textCache.get(file);
  };

  const changedTests = [];
  const needles = [];
  const editorFiles = [];
  for (const file of changed) {
    if (/(^|\/)tests\/[^/]+\.test\.mjs$/.test(file)) {
      changedTests.push(file);
      continue;
    }
    if (/\.browser\.mjs$/.test(file) || !SOURCE_RE.test(file)) continue;
    if (isEditorSource(file) && !broad) {
      editorFiles.push({ file });
      continue;
    }
    let needle = path.posix.basename(file);
    // "index.js" alone would match everything; keep the parent directory.
    if (/^index\./.test(needle)) needle = path.posix.join(path.posix.basename(path.posix.dirname(file)), needle);
    needles.push(needle);
    if (isEditorSource(file)) needles.push(MODELER_HELPER);
  }

  let editor = null;
  let note = broad && changed.some(isEditorSource) ? "broad: --broad" : null;
  let declCount = 0;
  if (editorFiles.length) {
    const untrackedSet = new Set(untracked);
    const readOr = (fn) => { try { return fn(); } catch { return null; } };
    const plan = planEditorChanges(editorFiles, {
      diff: (f) => (untrackedSet.has(f) ? "" : gitRaw(["diff", "-U0", base, "--", f])),
      newText: (f) => readOr(() => fs.readFileSync(path.join(ROOT, f), "utf8")),
      oldText: (f) => (untrackedSet.has(f) ? null : readOr(() => gitRaw(["show", `${base}:${f}`]))),
    });
    declCount = plan.declCount;
    if (plan.fallback) {
      note = `broad: ${plan.fallback}`;
      for (const { file } of editorFiles) needles.push(path.posix.basename(file));
      needles.push(MODELER_HELPER);
    } else {
      editor = plan;
    }
  }

  const { selected, viaEditor } = selectTests({ allTests, textOf, changedTests, needles, editor });
  const files = positional.length ? positional : runAll ? allTests : [...selected].sort();

  if (listOnly) {
    if (!positional.length && !runAll) {
      const detail = note ? ` (${note})` : editor ? ` (${viaEditor.size} from ${declCount} changed declarations)` : "";
      console.error(`running ${files.length} test files${detail}`);
    }
    for (const f of files) console.log(f);
    process.exit(0);
  }
  if (!files.length) {
    console.log("no related tests; run npm run check");
    process.exit(0);
  }

  const detail = positional.length || runAll ? ""
    : note ? ` (${note})`
    : editor ? ` (${viaEditor.size} from ${declCount} changed declarations)` : "";
  console.log(`running ${files.length} test files${detail}`);
  const res = spawnSync(process.execPath, [
    "--test", "--test-timeout=600000",
    "--test-reporter=./tools/test_reporter_failures.mjs",
    ...nodeArgs, ...files,
  ], { cwd: ROOT, stdio: "inherit" });
  process.exit(res.status ?? 1);
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

if (isMainModule()) main();

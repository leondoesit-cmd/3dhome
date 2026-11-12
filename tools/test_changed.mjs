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
// It also falls back (and prints why) when the declarations cannot be identified
// reliably: the outline throws on a file, or a changed line belongs to no declaration
// (a top-level statement, say) and is not blank, a comment, an import or an export list.
//
// Some tests read sources through a helper by pattern, so they never name the file:
// styles_source reads css/styles_NN_*.css (listed in index.html), module_source reads
// js/<name>.js + js/<name>/*.js, modeler_source wraps module_source. HELPER_READERS maps a
// changed path to the helper, and the tests using it (following helper imports
// recursively) are selected: all of them, or those naming the parent module. A changed
// tests/helpers/X.mjs selects every test whose recursive helper set includes X.
// Output goes through tools/test_reporter_failures.mjs (failures + one summary line).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { outlineText } from "./outline.mjs";
import * as acorn from "../vendor/acorn/acorn.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIRS = ["tests", "uikit/tests"];
const SOURCE_RE = /^(js|server|tools|css|uikit)\/|^index\.html$/;
export const MAX_DECLARATIONS = 40;
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

// 1-based lines that are only comment: `//` lines and `/* ... */` blocks that start
// a line (every line of the block, including text-only ones).
export function commentLines(lines) {
  const out = new Set();
  let inBlock = false;
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (inBlock || t.startsWith("/*")) {
      const close = t.indexOf("*/", inBlock ? 0 : 2);
      inBlock = close < 0;
      if (close < 0 || t.endsWith("*/")) out.add(i + 1); // `/* a */ code();` is code
    } else if (t.startsWith("//")) {
      out.add(i + 1);
    }
  });
  return out;
}

// start line -> end line of every top-level statement (an `export` wrapper counts as its
// statement), from a real parse. Throws when the text does not parse.
function statementEnds(text) {
  const ast = acorn.parse(text, { ecmaVersion: "latest", sourceType: "module", locations: true, allowHashBang: true });
  const ends = new Map();
  for (const st of ast.body) if (!ends.has(st.loc.start.line)) ends.set(st.loc.start.line, st.loc.end.line);
  return ends;
}

// Names of the top-level declarations whose span overlaps a range. Without `text` a
// declaration spans from its own line to the line before the next declaration (the last
// one to EOF): a pure deletion (count 0) at line c touches the declaration containing c.
// With `text` (the file those ranges refer to; it is parsed) a declaration spans exactly
// its own statement, and the check is per changed line: blank lines, comments, import
// statements and export lists are skipped, a pure deletion is skipped (the old side's
// ranges carry it), and a line after a declaration's statement (a top-level statement
// between two functions, say) belongs to no declaration, so the preceding name is not
// blamed for it. Outline rows that start no statement (column-0 text inside a template
// literal) are dropped. Throws when `text` does not parse.
export function changedDeclarations(outline, ranges, text) {
  return changedDeclarationsDetailed(outline, ranges, text).names;
}

// Same walk, also reporting `unmapped`: 1-based changed lines that fall in no
// declaration and are not blank, a comment, an import or an export list (a
// top-level statement, or code after a variable's own statement). Their effect
// cannot be pinned to a name, which is what the caller falls back on.
export function changedDeclarationsDetailed(outline, ranges, text) {
  const decls = declarations(outline);
  const names = new Set();
  const unmapped = [];
  if (text == null) {
    for (const { start, count } of ranges) {
      const last = count > 0 ? start + count - 1 : start;
      decls.forEach((d, i) => {
        const end = i + 1 < decls.length ? decls[i + 1].line - 1 : Infinity;
        if (d.line <= last && end >= start) names.add(d.name);
      });
    }
    return { names: [...names], unmapped };
  }
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const ignore = ignorableLines(text);
  const comments = commentLines(lines);
  const stmtEnd = statementEnds(normalized);
  const real = decls.filter((d) => stmtEnd.has(d.line));
  const ends = real.map((d) => stmtEnd.get(d.line));
  for (const { start, count } of ranges) {
    for (let n = Math.max(start, 1); n < start + count; n++) {
      const line = (lines[n - 1] ?? "").trim();
      if (ignore.has(n) || comments.has(n) || !line) continue;
      let lo = 0;
      let hi = real.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (real[mid].line <= n) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (idx >= 0 && n <= ends[idx]) names.add(real[idx].name);
      else unmapped.push(n);
    }
  }
  return { names: [...names], unmapped };
}

// All top-level declaration names (a new, deleted or fully replaced file).
export function allDeclarations(outline) {
  return [...new Set(declarations(outline).map((r) => r.name))];
}

// What the editor-source files of a change need. `files` is [{ file }]; `io` supplies
// diff(file) (git diff -U0 text), oldText(file) and newText(file) (null when the file
// does not exist on that side). Returns { names, paths, declCount, fallback }.
export function planEditorChanges(files, io, { maxDeclarations = MAX_DECLARATIONS, outline = outlineText } = {}) {
  const names = new Set();
  const paths = [];
  const keys = new Set();
  let fallback = null;
  for (const { file } of files) {
    paths.push(editorPathNeedle(file));
    const newText = io.newText(file);
    const oldText = io.oldText(file);
    const add = (list) => list.forEach((n) => { names.add(n); keys.add(`${file}:${n}`); });
    let newOutline;
    let oldOutline;
    try {
      newOutline = newText == null ? [] : outline(newText);
      oldOutline = oldText == null ? [] : outline(oldText);
    } catch (e) {
      fallback ||= `${file}: outline failed (${e?.message ?? e})`;
      continue;
    }
    if (newText == null || oldText == null) {
      // created or deleted: every declaration of the side that exists
      add(allDeclarations(newText == null ? oldOutline : newOutline));
      continue;
    }
    const hunks = parseHunks(io.diff(file));
    const nr = newRanges(hunks);
    const or = oldRanges(hunks);
    const side = (label, ol, ranges, text) => {
      let r;
      try {
        r = changedDeclarationsDetailed(ol, ranges, text);
      } catch (err) {
        fallback ||= `${file}${label}: cannot parse to find declaration ends (${err?.message ?? err})`;
        return;
      }
      add(r.names);
      if (r.unmapped.length) fallback ||= `${file}:${r.unmapped[0]}${label} is outside any declaration`;
    };
    side("", newOutline, nr, newText);
    side(" (old side)", oldOutline, or, oldText);
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

// ---- helpers that read sources by pattern ----------------------------------

// Does a `git diff -U0` of index.html add or remove a stylesheet <link>?
export function touchesStylesheetLinks(diffText) {
  return /^[+-](?![+-]{2}).*<link\b[^>]*\bstylesheet\b/m.test(diffText);
}

// Changed path -> the test helper that reads it by pattern. `reads(file, diffOf)`
// returns null, or { needles }: the helper's users are selected when they name one
// of the needles; no needles selects every user of the helper.
export const HELPER_READERS = [
  { helper: "styles_source", reads: (f, diffOf) => (/^css\/styles_\d+_[\w-]+\.css$/.test(f)
    || (f === "index.html" && touchesStylesheetLinks(diffOf?.(f) ?? ""))) ? {} : null },
  { helper: "module_source", reads: (f) => {
    const m = /^js\/([\w-]+)(?:\/[\w.-]+)?\.js$/.exec(f);
    return m ? { needles: [`js/${m[1]}.js`] } : null;
  } },
  { helper: "modeler_source", reads: (f) => (isEditorSource(f) ? {} : null) },
];

// Module name of a changed test helper (tests/helpers/x.mjs -> "x"), else null.
export function changedHelperName(file) {
  const m = /(?:^|\/)tests\/helpers\/([^/]+)\.mjs$/.exec(file);
  return m ? m[1] : null;
}

// [{ helper, needles|null }] for one changed file. A changed test helper selects
// every test whose recursive helper set (collectHelpers) includes it.
export function helperReaders(file, diffOf) {
  const out = [];
  const own = changedHelperName(file);
  if (own) out.push({ helper: own, needles: null });
  for (const { helper, reads } of HELPER_READERS) {
    const r = reads(file, diffOf);
    if (r) out.push({ helper, needles: r.needles ?? null });
  }
  return out;
}

const HELPER_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+\.mjs)["']/g;

// Repo-relative paths of the tests/helpers/*.mjs modules `text` (the file `from`) imports.
export function helperPaths(text, from) {
  const out = [];
  for (const m of text.matchAll(HELPER_IMPORT)) {
    const p = path.posix.normalize(path.posix.join(path.posix.dirname(from), m[1]));
    if (/(^|\/)tests\/helpers\/[^/]+\.mjs$/.test(p)) out.push(p);
  }
  return out;
}

// Helper text without comments, so a name an example comment mentions does not count.
export function stripComments(text) {
  return text.replace(/(^|\s)\/\*[\s\S]*?\*\//g, "$1").replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

// A test's own text plus that of every helper it imports, followed recursively
// (helpers import helpers) with a visited set, each read once.
// `readText(path)` returns "" for a missing file. Returns { text, helpers } where
// helpers is the Set of module names reached (modeler_source, module_source, ...).
export function collectHelpers(file, readText) {
  const own = readText(file);
  const parts = [own];
  const helpers = new Set();
  const seen = new Set();
  const queue = helperPaths(own, file);
  while (queue.length) {
    const p = queue.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    helpers.add(path.posix.basename(p, ".mjs"));
    const t = readText(p);
    parts.push(stripComments(t));
    queue.push(...helperPaths(t, p));
  }
  return { text: parts.join("\n"), helpers };
}

// Pick the tests to run. `changedTests` are selected directly, `needles` match by
// substring, `editor` ({ names, paths }) matches by whole-word declaration name
// among tests that read the editor source, or by the changed file's path.
// `readers` ([{ helper, needles|null }], see helperReaders) select the tests whose
// `helpersOf(test)` (a Set of helper names) has the helper, and that name a needle if any.
// Returns { selected: Set, viaEditor: Set }.
export function selectTests({ allTests, textOf, changedTests = [], needles = [], editor = null, readers = [], helpersOf = () => new Set() }) {
  const selected = new Set(changedTests.filter((t) => allTests.includes(t)));
  const viaEditor = new Set();
  const nameRe = editor ? wholeWordRegex(editor.names) : null;
  for (const test of allTests) {
    if (selected.has(test)) continue;
    const text = textOf(test);
    if (needles.some((n) => text.includes(n))) {
      selected.add(test);
    } else if (readers.some((r) => helpersOf(test).has(r.helper) && (!r.needles || r.needles.some((n) => text.includes(n))))) {
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

  const fileCache = new Map();
  const read = (file) => {
    if (!fileCache.has(file)) {
      try { fileCache.set(file, fs.readFileSync(path.join(ROOT, file), "utf8")); } catch { fileCache.set(file, ""); }
    }
    return fileCache.get(file);
  };
  // a test's text plus the tests/helpers/ modules it imports, followed
  // recursively: a test that reaches js/track.js only through helpers/rc_track.mjs
  // (or modeler_source -> module_source) still names it
  const collected = new Map();
  const collect = (file) => {
    if (!collected.has(file)) collected.set(file, collectHelpers(file, read));
    return collected.get(file);
  };
  const textOf = (file) => collect(file).text;
  const helpersOf = (file) => collect(file).helpers;

  const changedTests = [];
  const needles = [];
  const readers = [];
  const editorFiles = [];
  const diffOf = (f) => { try { return gitRaw(["diff", "-U0", base, "--", f]); } catch { return ""; } };
  for (const file of changed) {
    if (/(^|\/)tests\/[^/]+\.test\.mjs$/.test(file)) {
      changedTests.push(file);
      continue;
    }
    if (changedHelperName(file)) {
      readers.push(...helperReaders(file, diffOf));
      continue;
    }
    if (/\.browser\.mjs$/.test(file) || !SOURCE_RE.test(file)) continue;
    if (isEditorSource(file) && !broad) {
      editorFiles.push({ file });
      continue;
    }
    readers.push(...helperReaders(file, diffOf));
    let needle = path.posix.basename(file);
    // "index.js" alone would match everything; keep the parent directory.
    if (/^index\./.test(needle)) needle = path.posix.join(path.posix.basename(path.posix.dirname(file)), needle);
    needles.push(needle);
    // a split piece js/<name>/x.js is read through moduleSource("js/<name>.js"),
    // so the tests that name its parent module cover it too
    const parent = /^(js\/[\w-]+)\/[\w.-]+\.js$/.exec(file);
    if (parent && fs.existsSync(path.join(ROOT, parent[1] + ".js"))) needles.push(parent[1] + ".js");
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
      for (const { file } of editorFiles) {
        needles.push(path.posix.basename(file));
        readers.push(...helperReaders(file, diffOf));
      }
    } else {
      editor = plan;
    }
  }

  const { selected, viaEditor } = selectTests({ allTests, textOf, changedTests, needles, editor, readers, helpersOf });
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

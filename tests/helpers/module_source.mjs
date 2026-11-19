// A module's source, as the tests that read it expect: js/<name>.js followed
// by the sections split out of it into js/<name>/*.js (sorted) with
// tools/split_module.mjs, so a test keeps finding a function whichever of
// those files it now lives in. Line endings are normalised to \n.
//
// The result reads as ONE module, the way <name>.js did before the split:
// the split files' import blocks, the main file's imports from them, and the
// `export { a, b };` lists the split added (the main file had none before it)
// are left out — they would declare or export the same names twice for a
// test that parses the whole text. Everything else is kept as written.
//
//   moduleSource("js/view3d.js")   moduleFiles("js/view3d.js")
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const cache = new Map();

// "js/view3d.js" -> { base: "js/", name: "view3d" }
function split(rel) {
  const m = /^(.*\/)?([^/]+)\.js$/.exec(rel);
  if (!m) throw new Error("moduleFiles: not a .js path: " + rel);
  return { base: m[1] || "", name: m[2] };
}

// repo-relative paths: the main file, then js/<name>/*.js sorted
export function moduleFiles(rel) {
  const { base, name } = split(rel);
  let parts = [];
  try {
    parts = readdirSync(new URL(base + name + "/", ROOT)).filter((f) => f.endsWith(".js")).sort();
  } catch {}
  return [rel, ...parts.map((f) => base + name + "/" + f)];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
// `import ... from "...";`, single- or multi-line, at the start of a line
const IMPORT = /^import\s[^;]*?\sfrom\s*["'][^"']+["'];[ \t]*\n/gm;

export function moduleSource(rel) {
  if (!cache.has(rel)) {
    const { base, name } = split(rel);
    // `export { ... };` lists, with the "// for js/<name>/..." line above them
    const exportList = new RegExp(
      "^(?:// for " + escapeRe(base + name) + "/[^\\n]*\\n)?export \\{[^}]*\\};[ \\t]*\\n", "gm");
    const fromPiece = new RegExp("from\\s*[\"']\\./" + escapeRe(name) + "/");
    cache.set(
      rel,
      moduleFiles(rel)
        .map((f, i) => {
          const s = readFileSync(new URL(f, ROOT), "utf8").replace(/\r\n/g, "\n");
          const own = i === 0
            ? s.replace(IMPORT, (m) => (fromPiece.test(m) ? "" : m))
            : s.replace(IMPORT, "");
          return own.replace(exportList, "");
        })
        .join("\n"),
    );
  }
  return cache.get(rel);
}

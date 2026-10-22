// The CAD editor's source, as the tests that read it expect: js/modeler.js
// followed by the sections split out of it into js/modeler/*.js (sorted), so
// a test keeps finding a function whichever of those files it now lives in.
// Line endings are normalised to \n.
//
// The result reads as ONE module, the way modeler.js did before the split:
// the split files' import blocks, modeler.js's imports from them, and the
// `export { a, b };` lists the split added (modeler.js had none before it)
// are left out — they would declare or export the same names twice for a
// test that parses the whole text. Everything else is kept as written.
import { readFileSync, readdirSync } from "node:fs";

const JS = new URL("../../js/", import.meta.url);
let cached = null;

export function modelerFiles() {
  let parts = [];
  try {
    parts = readdirSync(new URL("modeler/", JS)).filter((f) => f.endsWith(".js")).sort();
  } catch {}
  return ["modeler.js", ...parts.map((f) => "modeler/" + f)];
}

// `import ... from "...";`, single- or multi-line, at the start of a line
const IMPORT = /^import\s[^;]*?\sfrom\s*["'][^"']+["'];[ \t]*\n/gm;
// `export { ... };` lists, with the "// for js/modeler/..." line above them
const EXPORT_LIST = /^(?:\/\/ for js\/modeler\/[^\n]*\n)?export \{[^}]*\};[ \t]*\n/gm;

export function modelerSource() {
  if (cached == null)
    cached = modelerFiles()
      .map((f, i) => {
        const s = readFileSync(new URL(f, JS), "utf8").replace(/\r\n/g, "\n");
        const own = i === 0
          ? s.replace(IMPORT, (m) => (/from\s*["']\.\/modeler\//.test(m) ? "" : m))
          : s.replace(IMPORT, "");
        return own.replace(EXPORT_LIST, "");
      })
      .join("\n");
  return cached;
}

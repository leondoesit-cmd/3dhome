// The i18n source as a single text, for the string-table assertions.
//
// js/i18n.js used to hold `var STR = { he: {...}, en: {...} }` inline, and a
// dozen tests assert on that text: a regex for one translated line, or a slice
// between "\n  he: {" and "\n  en: {" to check a key exists in both languages.
// The tables now ship one file per locale (js/i18n/he.js, js/i18n/en.js) so a
// session downloads only the language it shows.
//
// This helper reads the real runtime module and the real locale files and
// stitches them back into the shape those assertions were written against —
// same bytes, same order, same two-space indentation. Nothing is stubbed: a
// key deleted from js/i18n/en.js still fails the test that demands it.
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

async function tableBody(lang) {
  const src = await readFile(new URL(`js/i18n/${lang}.js`, root), "utf8");
  const start = src.indexOf("export default {\n");
  const end = src.lastIndexOf("\n};");
  if (start < 0 || end < 0) throw new Error(`js/i18n/${lang}.js is not an object-literal default export`);
  return src
    .slice(start + "export default {\n".length, end)
    .split("\n")
    .map((line) => (line.length ? "  " + line : line))
    .join("\n");
}

export async function readI18nSource() {
  const [runtime, he, en] = await Promise.all([
    readFile(new URL("js/i18n.js", root), "utf8"),
    tableBody("he"),
    tableBody("en"),
  ]);
  return `${runtime}\nvar STR = {\n  he: {\n${he}\n  },\n  en: {\n${en}\n  },\n};\n`;
}

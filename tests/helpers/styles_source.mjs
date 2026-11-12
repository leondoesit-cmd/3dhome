// The planner + CAD editor stylesheet, as the tests that read it expect: the
// css/styles_NN_<area>.css pieces that replaced css/styles.css, in the order
// index.html links them (read from index.html, so the list cannot drift),
// concatenated. Line endings are normalised to \n.
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
let cached = null;

// "css/styles_01_base.css", ... in index.html link order
export function stylesFiles() {
  const html = readFileSync(new URL("index.html", ROOT), "utf8");
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*\bhref="(css\/styles_\d+_[a-z0-9_]+\.css)(?:\?[^"]*)?"/g)) out.push(m[1]);
  return out;
}

export function stylesSource() {
  if (cached == null)
    cached = stylesFiles()
      .map((f) => readFileSync(new URL(f, ROOT), "utf8").replace(/\r\n/g, "\n"))
      .join("");
  return cached;
}

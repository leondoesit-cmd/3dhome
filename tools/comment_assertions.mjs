/* Which source assertions in the suite are satisfied only by a COMMENT?
 *
 * ~1100 of this suite's assert.match calls pin a rule by matching a module's
 * text. The text includes the comments, and this codebase comments densely —
 * usually quoting the very call the comment explains. So an assertion can pass
 * on prose alone, and go on passing after the code it claims to pin is deleted.
 * Two of those were written here in one afternoon before anyone noticed.
 *
 * This walks every tests/<name>.test.mjs, maps each `const x = readFile(new
 * URL("../js/y.js"))` (and slices taken from one) to its module, and re-tests
 * each literal regex against the module with its comments blanked
 * (tests/source.mjs). Anything that stops matching is listed.
 *
 * Asserting that a comment still exists is a real, if weak, thing to want —
 * "this decision is written down where the next person will look". Say so on
 * the line with a `prose-ok` marker and this leaves it alone; everything else
 * is treated as an assertion about code that a reflowed comment can break.
 *
 * Exits non-zero when it finds one, so it can gate (`npm run check`).
 *   node tools/comment_assertions.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stripComments } from "../tests/source.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const raw = new Map(), code = new Map();

/* readI18nSource() (tests/helpers/i18n_source.mjs) hands a test the runtime
   module and both locale tables as one text, because the string tables moved to
   js/i18n/<lang>.js. Resolve it to those real files, or the ~35 assertions that
   read it would silently drop out of this check. */
const I18N = "js/i18n.js + js/i18n/*.js";
const I18N_PARTS = ["js/i18n.js", "js/i18n/he.js", "js/i18n/en.js"];

async function source(rel) {
  if (!raw.has(rel)) {
    if (rel === I18N) {
      const parts = await Promise.all(I18N_PARTS.map((p) => source(p)));
      raw.set(rel, parts.every(Boolean) ? parts.join("\n") : null);
    } else {
      try { raw.set(rel, await readFile(ROOT + rel, "utf8")); } catch { raw.set(rel, null); }
    }
  }
  return raw.get(rel);
}
async function stripped(rel) {
  if (!code.has(rel)) {
    const body = await source(rel);
    code.set(rel, body == null ? null : stripComments(body));
  }
  return code.get(rel);
}

/* One regex literal starting at text[i] === "/", or null if it does not close
   on this line (in which case it was a division sign, not a literal). */
function readRegexLiteral(text, i) {
  let j = i + 1, inClass = false, closed = false;
  while (j < text.length) {
    const ch = text[j];
    if (ch === "\\") { j += 2; continue; }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) { j++; closed = true; break; }
    else if (ch === "\n") return null;
    j++;
  }
  if (!closed) return null;
  while (j < text.length && /[a-z]/.test(text[j])) j++;
  return text.slice(i, j);
}

const files = (await readdir(ROOT + "tests")).filter((f) => f.endsWith(".test.mjs"));
let checked = 0, unparsed = 0;
const hits = [];

for (const file of files) {
  const text = await readFile(ROOT + "tests/" + file, "utf8");
  const owner = new Map();
  for (const m of text.matchAll(
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?readFile\(\s*new URL\(\s*"\.\.\/([^"]+)"/g,
  ))
    owner.set(m[1], m[2]);
  for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?readI18nSource\(/g))
    owner.set(m[1], I18N);
  // a slice of a known source is still that source's text
  for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*\.slice\(/g))
    if (owner.has(m[2])) owner.set(m[1], owner.get(m[2]));
  if (!owner.size) continue;

  for (let at = text.indexOf("assert.match("); at !== -1; at = text.indexOf("assert.match(", at + 1)) {
    const open = at + "assert.match(".length,
      comma = text.indexOf(",", open);
    if (comma === -1) break;
    const name = text.slice(open, comma).trim();
    const rel = owner.get(name);
    if (!rel) continue;
    let p = comma + 1;
    while (p < text.length && /\s/.test(text[p])) p++;
    const literal = text[p] === "/" ? readRegexLiteral(text, p) : null;
    if (!literal) { unparsed++; continue; }
    const cut = literal.lastIndexOf("/");
    let re;
    try {
      re = new RegExp(literal.slice(1, cut), literal.slice(cut + 1).replace(/[gy]/g, ""));
    } catch { unparsed++; continue; }
    const body = await source(rel);
    if (!body) continue;
    // an assertion that says it means the prose is left alone
    const lineStart = text.lastIndexOf("\n", at) + 1;
    let lineEnd = text.indexOf("\n", at);
    if (lineEnd === -1) lineEnd = text.length;
    const around = text.slice(text.lastIndexOf("\n", lineStart - 2) + 1, lineEnd);
    if (around.includes("prose-ok")) continue;
    checked++;
    if (re.test(body) && !re.test(await stripped(rel)))
      hits.push({
        where: file + ":" + text.slice(0, at).split("\n").length,
        target: rel,
        literal: literal.length > 96 ? literal.slice(0, 93) + "..." : literal,
      });
  }
}

console.log(
  "checked " + checked + " source assertions" +
  (unparsed ? " (" + unparsed + " not a plain regex literal)" : ""),
);
if (!hits.length) {
  console.log("none of them are satisfied only by a comment");
} else {
  console.log(hits.length + " satisfied only by a comment — assert the code, or");
  console.log("mark the line `prose-ok` if pinning the comment is the point:");
  hits.forEach((h) => console.log("\n  " + h.where + "  -> " + h.target + "\n    " + h.literal));
  process.exitCode = 1;
}

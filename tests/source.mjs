/* Reading a module as CODE rather than as text.
 *
 * Most of this suite asserts against source: 1800-odd assert.match calls that
 * pin a rule the runtime cannot be asked about cheaply ("the drag commits once,
 * at the end"). Those regexes match the file as a STRING, so they also match
 * the comments — and this codebase comments densely, quoting the very call each
 * comment explains. That cuts both ways and both ways are wrong:
 *
 *   assert.match(src, /window\.__plannerChrome/)      passes on the comment
 *                                                     that says it was removed
 *   assert.doesNotMatch(src, /window\.__plannerChrome/) fails for the same reason
 *
 * A test that passes because of a sentence in a comment is not a test. Both of
 * those happened here in one afternoon, which is what this file is for.
 *
 * Comments are BLANKED, not deleted: every one becomes spaces of the same
 * length, newlines kept. Offsets and line numbers therefore match the original
 * exactly, so a test may slice by marker on the raw text and strip afterwards
 * (or the other way round) and get the same answer — which matters, because the
 * markers tests slice on are often themselves comments.
 */
import { readFile } from "node:fs/promises";

/* Whether a `/` at this point starts a regex literal or is a division sign is
   genuinely ambiguous in JavaScript; every tokenizer decides it from the last
   meaningful token. A regex can only follow something that cannot END an
   expression, so: an operator, an opening bracket, a comma, a semicolon, or one
   of the keywords below. After an identifier, a number, or a closing bracket,
   the slash is division. Getting this wrong only matters when a regex literal
   contains comment characters — a regex that matches the start of a block
   comment, say — but that is exactly the sort of line a stripper has no
   business mangling. (Writing that example out in this comment is what ended
   the comment early the first time.) */
const BEFORE_REGEX = /[({[,;:!&|?+\-*%~^<>=]$/;
const KEYWORD_BEFORE_REGEX =
  /\b(return|typeof|instanceof|in|of|new|delete|void|do|else|yield|await|case)$/;

function regexAllowed(before) {
  const trimmed = before.replace(/\s+$/, "");
  if (!trimmed) return true;
  return BEFORE_REGEX.test(trimmed) || KEYWORD_BEFORE_REGEX.test(trimmed);
}

/* Replace every comment with spaces, leaving strings, template literals and
   regex literals exactly as they are. */
export function stripComments(source) {
  const src = String(source);
  let out = "";
  let i = 0;
  const blank = (text) => text.replace(/[^\n]/g, " ");

  while (i < src.length) {
    const c = src[i], next = src[i + 1];

    if (c === "/" && next === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && next === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? src.length : j + 2;
      out += blank(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      // a template literal can hold ${ ... } with strings of its own inside it,
      // so it is walked with a depth counter rather than scanned for its quote
      let j = i + 1, depth = 0;
      while (j < src.length) {
        const ch = src[j];
        if (ch === "\\") { j += 2; continue; }
        if (c === "`" && ch === "$" && src[j + 1] === "{") { depth++; j += 2; continue; }
        if (c === "`" && depth && ch === "}") { depth--; j++; continue; }
        if (ch === c && !depth) { j++; break; }
        if (ch === "\n" && c !== "`") break; // an unterminated quote: give up here
        j++;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (c === "/" && regexAllowed(out)) {
      let j = i + 1, inClass = false, closed = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === "\\") { j += 2; continue; }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) { j++; closed = true; break; }
        else if (ch === "\n") break;
        j++;
      }
      if (closed) {
        while (j < src.length && /[a-z]/.test(src[j])) j++; // flags
        out += src.slice(i, j);
        i = j;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** The file as written. */
export function readSource(url) {
  return readFile(url, "utf8");
}

/** The file with its comments blanked — what a structural assertion wants. */
export async function readCode(url) {
  return stripComments(await readSource(url));
}

/* The comment stripper the structural assertions read their sources through.
   Test infrastructure that is wrong does not fail — it makes other tests lie —
   so this covers the cases that would do that: comment characters inside
   strings, templates and regex literals, and the offset guarantee tests rely on
   when they slice a file by marker. */
import test from "node:test";
import assert from "node:assert/strict";
import { stripComments, readCode } from "./source.mjs";

test("comments go, and nothing else does", () => {
  const src = [
    "var a = 1; // the tail of a line",
    "/* a whole block",
    "   over several lines */",
    "var b = 2;",
  ].join("\n");
  const out = stripComments(src);
  assert.match(out, /var a = 1;/);
  assert.match(out, /var b = 2;/);
  assert.doesNotMatch(out, /tail of a line/);
  assert.doesNotMatch(out, /a whole block/);
});

test("offsets and line numbers survive, so a marker slice still lands", () => {
  const src = 'var a = 1; // note\nfunction target() {}\n/* trailing */\n';
  const out = stripComments(src);
  assert.equal(out.length, src.length, "same length");
  assert.equal(out.split("\n").length, src.split("\n").length, "same line count");
  assert.equal(out.indexOf("function target"), src.indexOf("function target"),
    "a slice taken on the raw text lines up with the stripped text");
});

test("comment characters inside strings are code, not comments", () => {
  const src = [
    'var url = "http://127.0.0.1:8765/api";',
    "var glob = 'js/*.js';",
    'var block = "/* not a comment */";',
    "var tpl = `${\"//nested\"} and /* this */`;",
  ].join("\n");
  const out = stripComments(src);
  assert.match(out, /http:\/\/127\.0\.0\.1:8765\/api/, "a URL is not a line comment");
  assert.match(out, /js\/\*\.js/, "a glob is not a block comment");
  assert.match(out, /\/\* not a comment \*\//);
  assert.match(out, /\/\/nested/, "nor is anything inside a template's \\${}");
});

test("a regex literal keeps whatever it matches", () => {
  const src = [
    "var comment = /\\/\\*[\\s\\S]*?\\*\\//g;",
    "var line = /\\/\\/.*$/m;",
    "var cls = /[/*]/;",
  ].join("\n");
  const out = stripComments(src);
  assert.equal(out, src, "a file of regexes is left exactly as written");
});

test("division is not mistaken for a regex", () => {
  const src = "var half = width / 2; // halve it\nvar r = other / 2;";
  const out = stripComments(src);
  assert.match(out, /var half = width \/ 2;/);
  assert.match(out, /var r = other \/ 2;/);
  assert.doesNotMatch(out, /halve it/);
});

test("an unterminated block comment takes the rest of the file, not a throw", () => {
  const out = stripComments("var a = 1;\n/* off we go\nvar b = 2;");
  assert.match(out, /var a = 1;/);
  assert.doesNotMatch(out, /var b = 2;/);
});

test("readCode answers about the code, where the raw text cannot", async () => {
  /* The case that produced this file: history.js removed a window hop and says
     so in a comment, so "is it gone?" cannot be asked of the raw text. */
  const { readSource } = await import("./source.mjs");
  const raw = await readSource(new URL("../js/history.js", import.meta.url));
  const code = await readCode(new URL("../js/history.js", import.meta.url));
  assert.match(raw, /window\.__plannerChrome/, "the comment still explains the old hop");
  assert.doesNotMatch(code, /window\.__plannerChrome/, "but no code makes it");
  assert.match(code, /export function onAfterRestore\(fn\)/, "the registration is real code");
});

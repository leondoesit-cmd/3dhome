import test from "node:test";
import assert from "node:assert/strict";
import { check, functionSizes, FILE_MAX, FN_MAX, FILE_SLACK, FN_SLACK } from "../tools/size_check.mjs";

const empty = { files: {}, functions: {} };

test("a new file or function over the limit fails; at the limit it passes", () => {
  assert.equal(check({ files: { "js/a.js": FILE_MAX }, functions: { "js/a.js#f": FN_MAX } }, empty).length, 0);
  const problems = check({ files: { "js/a.js": FILE_MAX + 1 }, functions: { "js/a.js#f": FN_MAX + 1 } }, empty);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /js\/a\.js: \d+ lines/);
  assert.match(problems[1], /js\/a\.js f\(\): \d+ lines/);
});

test("a frozen file or function may not grow past its size plus the slack", () => {
  const baseline = { files: { "js/big.js": 3000 }, functions: { "js/big.js#giant": 900 } };
  assert.equal(check({ files: { "js/big.js": 3000 + FILE_SLACK }, functions: { "js/big.js#giant": 900 + FN_SLACK } }, baseline).length, 0);
  assert.equal(check({ files: { "js/big.js": 3001 + FILE_SLACK }, functions: { "js/big.js#giant": 901 + FN_SLACK } }, baseline).length, 2);
});

test("functions are measured by name, arrows and methods included", () => {
  const body = (n) => Array.from({ length: n }, () => "  x++;").join("\n");
  const sizes = functionSizes(`function outer() {\n${body(5)}\n  setTimeout(() => {\n${body(3)}\n  });\n}\nconst arrow = () => {\n${body(4)}\n};\nclass C { method() {\n${body(2)}\n} }\n`);
  assert.equal(sizes.get("outer"), 12);
  assert.equal(sizes.get("outer>(anonymous)"), 5);
  assert.equal(sizes.get("arrow"), 6);
  assert.equal(sizes.get("method"), 4);
});

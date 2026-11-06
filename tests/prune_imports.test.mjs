import test from "node:test";
import assert from "node:assert/strict";
import * as acorn from "../vendor/acorn/acorn.mjs";
import { pruneImports } from "../tools/prune_imports.mjs";

const reparse = (code) => acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });

test("unused named specifiers are dropped, used ones keep their order", () => {
  const src = `import { a, b, c } from "./x.js";\nconsole.log(a, c);\n`;
  const r = pruneImports(src);
  assert.equal(r.code, `import { a, c } from "./x.js";\nconsole.log(a, c);\n`);
  assert.deepEqual(r.changes.map((c) => c.removed), [["b"]]);
  reparse(r.code);
});

test("an alias counts by its local name", () => {
  const r = pruneImports(`import { a as b, c as d } from "./x.js";\nuse(d);\n`);
  assert.equal(r.code, `import { c as d } from "./x.js";\nuse(d);\n`);
});

test("unused default import is dropped, named kept", () => {
  const r = pruneImports(`import def, { a } from "./x.js";\na();\n`);
  assert.equal(r.code, `import { a } from "./x.js";\na();\n`);
});

test("unused named kept alongside a used default", () => {
  const r = pruneImports(`import def, { a } from "./x.js";\ndef();\n`);
  assert.equal(r.code, `import def from "./x.js";\ndef();\n`);
});

test("a used namespace import is untouched; an unused one is dropped", () => {
  const used = `import * as ns from "./x.js";\nns.go();\n`;
  assert.equal(pruneImports(used).code, used);
  const r = pruneImports(`import * as ns from "./x.js";\n`);
  assert.equal(r.code, `import "./x.js";\n`);
});

test("all specifiers unused -> bare side-effect import, never deletion", () => {
  const r = pruneImports(`import { a, b } from './x.js'\nimport def from "./y.js";\nlet z = 1;\n`);
  assert.equal(r.code, `import './x.js'\nimport "./y.js";\nlet z = 1;\n`);
  assert.equal(r.bareCount, 2);
  reparse(r.code);
});

test("a name used only in an export list counts as used", () => {
  const src = `import { a, b } from "./x.js";\nexport { a };\n`;
  const r = pruneImports(src);
  assert.equal(r.code, `import { a } from "./x.js";\nexport { a };\n`);
});

test("a shadowing local is not a use of the import", () => {
  const src = `import { a, b } from "./x.js";\nfunction f(a) { return a; }\nb();\n`;
  assert.equal(pruneImports(src).code, `import { b } from "./x.js";\nfunction f(a) { return a; }\nb();\n`);
});

test("names mentioned only in strings and comments are unused", () => {
  const r = pruneImports(`import { a } from "./x.js";\n// a\nconst s = "a";\n`);
  assert.equal(r.code, `import "./x.js";\n// a\nconst s = "a";\n`);
});

test("a file with nothing to prune comes back byte-identical", () => {
  const src = `import { a } from "./x.js";\nimport "./side.js";\na();\n`;
  const r = pruneImports(src);
  assert.equal(r.code, src);
  assert.equal(r.changes.length, 0);
});

test("a multi-line import stays wrapped at ~80 columns, with trailing comma", () => {
  const names = Array.from({ length: 12 }, (_, i) => `someLongName${i}`);
  const src = `import {\n  ${names.join(", ")},\n  dead,\n} from "./x.js";\n${names.map((n) => n + "();").join("")}\n`;
  const r = pruneImports(src);
  const head = r.code.split("\n");
  assert.equal(head[0], "import {");
  assert.ok(head.slice(0, head.indexOf(`} from "./x.js";`) + 1).every((l) => l.length <= 80), r.code);
  assert.ok(!r.code.includes("dead"));
  assert.ok(r.code.includes(`} from "./x.js";`));
  reparse(r.code);
});

test("a multi-line import that now fits collapses to one line", () => {
  const r = pruneImports(`import {\n  a,\n  b,\n} from "./x.js";\na();\n`);
  assert.equal(r.code, `import { a } from "./x.js";\na();\n`);
});

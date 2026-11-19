// tools/test_changed.mjs: mapping a diff to the declarations it touches and
// picking the tests that name them. Pure strings, no git, no disk.
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHunks, newRanges, oldRanges, changedDeclarations, allDeclarations, ignorableLines,
  planEditorChanges, wholeWordRegex, selectTests, parseArgs, editorPathNeedle,
  helperReaders, helperPaths, collectHelpers, touchesStylesheetLinks, changedHelperName,
} from "../tools/test_changed.mjs";
import { outlineText } from "../tools/outline.mjs";

const SOURCE = [
  'import { a } from "./a.js";', // 1
  "", // 2
  "function alpha() {", // 3
  "  return 1;", // 4
  "}", // 5
  "", // 6
  "function beta() {", // 7
  "  return 2;", // 8
  "}", // 9
  "const gamma = 3;", // 10
  "export async function delta() {", // 11
  "  return 4;", // 12
  "}", // 13
  "",
].join("\n");
const outline = outlineText(SOURCE);

test("outlineText returns structured rows", () => {
  const rows = outline.map((r) => [r.line, r.kind, r.name, r.exported]);
  assert.deepEqual(rows, [
    [3, "fn", "alpha", false], [7, "fn", "beta", false], [10, "const", "gamma", false], [11, "fn", "delta", true],
  ]);
});

test("parseHunks reads both sides, a missing count is 1", () => {
  const diff = "diff --git a/x b/x\n@@ -4 +4 @@\n-a\n+b\n@@ -8,2 +8,0 @@\n-x\n-y\n@@ -20,0 +21,3 @@\n+p\n";
  assert.deepEqual(parseHunks(diff), [
    { oldStart: 4, oldCount: 1, newStart: 4, newCount: 1 },
    { oldStart: 8, oldCount: 2, newStart: 8, newCount: 0 },
    { oldStart: 20, oldCount: 0, newStart: 21, newCount: 3 },
  ]);
  assert.deepEqual(oldRanges(parseHunks(diff)).map((r) => r.start), [4, 8]);
  assert.equal(newRanges(parseHunks(diff)).length, 3);
});

test("a hunk inside one function selects only that function", () => {
  assert.deepEqual(changedDeclarations(outline, [{ start: 8, count: 1 }]), ["beta"]);
  assert.deepEqual(changedDeclarations(outline, [{ start: 4, count: 1 }]), ["alpha"]);
  // the last declaration runs to EOF
  assert.deepEqual(changedDeclarations(outline, [{ start: 40, count: 2 }]), ["delta"]);
});

test("a range across two functions selects both", () => {
  assert.deepEqual(changedDeclarations(outline, [{ start: 5, count: 4 }]).sort(), ["alpha", "beta"]);
});

test("a pure deletion touches the declaration containing its line", () => {
  assert.deepEqual(changedDeclarations(outline, [{ start: 8, count: 0 }]), ["beta"]);
  const hunks = parseHunks("@@ -8,2 +8,0 @@\n");
  assert.deepEqual(changedDeclarations(outline, newRanges(hunks)), ["beta"]);
  // a pure insertion removed nothing from the old side
  assert.deepEqual(oldRanges(parseHunks("@@ -8,0 +9,2 @@\n")), []);
});

test("a deleted declaration is found on the old side", () => {
  const oldText = SOURCE;
  const newText = SOURCE.replace(/function beta\(\) \{\n {2}return 2;\n\}\n/, "");
  const hunks = parseHunks("@@ -7,3 +6,0 @@\n");
  const names = changedDeclarations(outlineText(oldText), oldRanges(hunks));
  assert.deepEqual(names, ["beta"]);
  // the new side only sees the neighbour that now holds the cut
  assert.deepEqual(changedDeclarations(outlineText(newText), newRanges(hunks)), ["alpha"]);
});

test("allDeclarations lists every top-level name", () => {
  assert.deepEqual(allDeclarations(outline), ["alpha", "beta", "gamma", "delta"]);
});

test("ignorableLines covers imports, multi-line imports and export lists with their comment", () => {
  const text = '// h\nimport { a } from "./a.js";\nimport {\n  b,\n} from "./b.js";\n\n// for js/modeler/x.js\nexport { a,\n  b };\nfunction f() {}\n';
  assert.deepEqual([...ignorableLines(text)].sort((x, y) => x - y), [2, 3, 4, 5, 7, 8, 9]);
});

test("whole-word matching: fillOps does not match fillOpsX", () => {
  const re = wholeWordRegex(["fillOps"]);
  assert.ok(re.test("sourceFunctionText(source, 'fillOps')"));
  assert.ok(re.test("source.indexOf('function fillOps(')"));
  assert.ok(!re.test("function fillOpsX() {}"));
  assert.ok(!re.test("myfillOps"));
  assert.ok(!re.test("fillOps$"));
  assert.ok(wholeWordRegex(["$q"]).test("call $q()"));
  assert.equal(wholeWordRegex([]), null);
});

const TESTS = {
  "tests/a.test.mjs": "import { modelerSource } from './helpers/modeler_source.mjs';\nsourceFunctionText(s, 'fillOps');",
  "tests/b.test.mjs": "import { modelerSource } from './helpers/modeler_source.mjs';\nsourceFunctionText(s, 'fillOpsX');",
  "tests/c.test.mjs": "// fillOps is mentioned but the editor source is not read",
  "tests/d.test.mjs": "import { modelerSource } from './helpers/modeler_source.mjs';\nreadFile('js/modeler/inspector.js');",
  "tests/e.test.mjs": "import { modelerSource } from './helpers/modeler_source.mjs';\nunrelated();",
};
const allTests = Object.keys(TESTS);
const textOf = (f) => TESTS[f];

test("selectTests picks editor-source readers naming the declaration or the path", () => {
  const editor = { names: new Set(["fillOps"]), paths: [editorPathNeedle("js/modeler/inspector.js")] };
  const { selected, viaEditor } = selectTests({ allTests, textOf, editor });
  assert.deepEqual([...selected].sort(), ["tests/a.test.mjs", "tests/d.test.mjs"]);
  assert.deepEqual([...viaEditor].sort(), ["tests/a.test.mjs", "tests/d.test.mjs"]);
});

test("selectTests keeps changed tests and substring needles for other files", () => {
  const { selected, viaEditor } = selectTests({
    allTests, textOf, changedTests: ["tests/c.test.mjs", "tests/missing.test.mjs"], needles: ["unrelated"],
  });
  assert.deepEqual([...selected].sort(), ["tests/c.test.mjs", "tests/e.test.mjs"]);
  assert.equal(viaEditor.size, 0);
});

test("broad rule: the helper needle selects every editor-source reader", () => {
  const { selected } = selectTests({ allTests, textOf, needles: ["helpers/modeler_source"] });
  assert.deepEqual([...selected].sort(), ["tests/a.test.mjs", "tests/b.test.mjs", "tests/d.test.mjs", "tests/e.test.mjs"]);
});

// ---- planEditorChanges with fake io ---------------------------------------

function fakeIo({ oldText, newText, diff }) {
  return { oldText: () => oldText, newText: () => newText, diff: () => diff };
}

test("planEditorChanges: one hunk in one function", () => {
  const plan = planEditorChanges([{ file: "js/modeler.js" }], fakeIo({
    oldText: SOURCE, newText: SOURCE, diff: "@@ -8 +8 @@\n-  return 2;\n+  return 20;\n",
  }));
  assert.deepEqual([...plan.names], ["beta"]);
  assert.equal(plan.declCount, 1);
  assert.equal(plan.fallback, null);
  assert.deepEqual(plan.paths, ["js/modeler.js"]);
});

test("planEditorChanges: a removed function comes from the old side", () => {
  const newText = SOURCE.replace(/function beta\(\) \{\n {2}return 2;\n\}\n/, "");
  const plan = planEditorChanges([{ file: "js/modeler/x.js" }], fakeIo({
    oldText: SOURCE, newText, diff: "@@ -7,3 +6,0 @@\n-function beta() {\n-  return 2;\n-}\n",
  }));
  assert.ok(plan.names.has("beta"));
  assert.deepEqual(plan.paths, ["modeler/x.js"]);
  assert.equal(plan.fallback, null);
});

test("planEditorChanges: a new file contributes all its declarations", () => {
  const plan = planEditorChanges([{ file: "js/modeler/new.js" }], fakeIo({ oldText: null, newText: SOURCE, diff: "" }));
  assert.deepEqual([...plan.names].sort(), ["alpha", "beta", "delta", "gamma"]);
  assert.equal(plan.declCount, 4);
});

test("planEditorChanges: a deleted file contributes the old declarations", () => {
  const plan = planEditorChanges([{ file: "js/modeler/gone.js" }], fakeIo({ oldText: SOURCE, newText: null, diff: "" }));
  assert.deepEqual([...plan.names].sort(), ["alpha", "beta", "delta", "gamma"]);
});

const WITH_TOP = [
  'import { a } from "./a.js";', // 1
  "import {", // 2
  "  b,", // 3
  '} from "./b.js";', // 4
  "", // 5
  "var root = null;", // 6
  "// stray top-level statement", // 7
  "setup();", // 8
  "function alpha() {", // 9
  "  return 1;", // 10
  "}", // 11
  "// for js/modeler/x.js", // 12
  "export { alpha,", // 13
  "  root };", // 14
  "const table = {", // 15
  "  k: 1,", // 16
  "};", // 17
  "",
].join("\n");
const planFor = (diff) => planEditorChanges([{ file: "js/modeler.js" }], fakeIo({ oldText: WITH_TOP, newText: WITH_TOP, diff }));

test("planEditorChanges: an import-only hunk selects nothing", () => {
  const plan = planFor("@@ -1 +1 @@\n-import { a } from './a.js';\n+import { a, c } from './a.js';\n@@ -3,0 +4,1 @@\n+  c,\n");
  assert.deepEqual([...plan.names], []);
  assert.equal(plan.fallback, null);
});

test("planEditorChanges: an export-list-only hunk (comment included) selects nothing", () => {
  const plan = planFor("@@ -12,3 +12,3 @@\n");
  assert.deepEqual([...plan.names], []);
  assert.equal(plan.fallback, null);
});

test("planEditorChanges: a hunk mixing an import line with a function body still selects the function", () => {
  const plan = planFor("@@ -4 +4 @@\n@@ -10 +10 @@\n");
  assert.deepEqual([...plan.names].sort(), ["alpha"]);
});

test("planEditorChanges: a line after a variable does not use the variable's name", () => {
  // line 7-8 follow `var root` but belong to no function
  assert.deepEqual([...planFor("@@ -8,0 +8,1 @@\n+setup();\n").names], []);
  // the variable's own line does count
  assert.deepEqual([...planFor("@@ -6 +6 @@\n").names], ["root"]);
  // so does the body of a multi-line initializer
  assert.deepEqual([...planFor("@@ -16 +16 @@\n").names], ["table"]);
});

test("planEditorChanges: more than the limit falls back, exactly the limit does not", () => {
  const body = (n) => Array.from({ length: n }, (_, i) => `function f${i}() {\n  return ${i};\n}\n`).join("");
  const text = `// top\n${body(41)}`;
  const diffAll = `@@ -1,0 +2,${41 * 3} @@\n`;
  const over = planEditorChanges([{ file: "js/modeler.js" }], fakeIo({ oldText: text, newText: text, diff: diffAll }));
  assert.equal(over.declCount, 41);
  assert.match(over.fallback, /41 declarations changed/);
  const text40 = `// top\n${body(40)}`;
  const at = planEditorChanges([{ file: "js/modeler.js" }], fakeIo({
    oldText: text40, newText: text40, diff: `@@ -1,0 +2,${40 * 3} @@\n`,
  }));
  assert.equal(at.declCount, 40);
  assert.equal(at.fallback, null);
});

test("planEditorChanges counts declarations across files", () => {
  const files = [{ file: "js/modeler/a.js" }, { file: "js/modeler/b.js" }];
  const plan = planEditorChanges(files, fakeIo({ oldText: SOURCE, newText: SOURCE, diff: "@@ -4 +4 @@\n" }), { maxDeclarations: 1 });
  // the same name in two files counts twice
  assert.equal(plan.declCount, 2);
  assert.ok(plan.fallback);
});

test("parseArgs", () => {
  const a = parseArgs(["--broad", "--list", "--base", "HEAD~1", "x.test.mjs", "--", "--test-only"]);
  assert.equal(a.broad, true);
  assert.equal(a.listOnly, true);
  assert.equal(a.base, "HEAD~1");
  assert.deepEqual(a.positional, ["x.test.mjs"]);
  assert.deepEqual(a.nodeArgs, ["--test-only"]);
  assert.equal(parseArgs([]).base, "HEAD");
});

// ---- fallback when declarations cannot be identified ------------------------

test("planEditorChanges: a changed top-level statement falls back and says why", () => {
  // line 8 is `setup();`, after `var root` and before any function
  const plan = planFor("@@ -8 +8 @@\n-setup();\n+setup(1);\n");
  assert.match(plan.fallback, /js\/modeler\.js:8 is outside any declaration/);
  // comments, blanks, imports and export lists do not trigger it
  assert.equal(planFor("@@ -7 +7 @@\n@@ -5 +5 @@\n@@ -2,3 +2,3 @@\n@@ -12,3 +12,3 @@\n").fallback, null);
});

test("planEditorChanges: a hunk in a file with no declarations falls back", () => {
  const plan = planEditorChanges([{ file: "js/modeler/x.js" }], fakeIo({
    oldText: "doIt();\n", newText: "doIt(2);\n", diff: "@@ -1 +1 @@\n",
  }));
  assert.match(plan.fallback, /x\.js:1 is outside any declaration/);
});

test("planEditorChanges: an outline that throws falls back", () => {
  const plan = planEditorChanges([{ file: "js/modeler.js" }], fakeIo({
    oldText: SOURCE, newText: SOURCE, diff: "@@ -8 +8 @@\n",
  }), { outline: () => { throw new Error("unexpected token"); } });
  assert.match(plan.fallback, /js\/modeler\.js: outline failed \(unexpected token\)/);
});

// ---- helpers that read sources by pattern -----------------------------------

test("helperReaders: a styles piece maps to styles_source, any user", () => {
  assert.deepEqual(helperReaders("css/styles_07_mobile_menus.css"), [{ helper: "styles_source", needles: null }]);
  assert.deepEqual(helperReaders("css/ui_system.css"), []);
  assert.deepEqual(helperReaders("css/styles.css"), []);
});

test("helperReaders: index.html counts only when its stylesheet links changed", () => {
  const linkDiff = '@@ -176 +176 @@\n-    <link rel="stylesheet" href="css/styles_01_base.css?v=a" />\n+    <link rel="stylesheet" href="css/styles_01_base.css?v=b" />\n';
  const otherDiff = '@@ -10 +10 @@\n-    <title>a</title>\n+    <title>b</title>\n';
  assert.equal(touchesStylesheetLinks(linkDiff), true);
  assert.equal(touchesStylesheetLinks(otherDiff), false);
  assert.deepEqual(helperReaders("index.html", () => linkDiff), [{ helper: "styles_source", needles: null }]);
  assert.deepEqual(helperReaders("index.html", () => otherDiff), []);
});

test("helperReaders: js pieces map to module_source by parent module, the editor also to modeler_source", () => {
  assert.deepEqual(helperReaders("js/view3d/camera.js"), [{ helper: "module_source", needles: ["js/view3d.js"] }]);
  assert.deepEqual(helperReaders("js/view3d.js"), [{ helper: "module_source", needles: ["js/view3d.js"] }]);
  assert.deepEqual(helperReaders("js/modeler/inspector.js").map((r) => r.helper), ["module_source", "modeler_source"]);
  assert.deepEqual(helperReaders("tools/x.mjs"), []);
});

test("selectTests: a styles piece selects every styles_source user, and only them", () => {
  const files = {
    "tests/s1.test.mjs": "import { stylesSource } from './helpers/styles_source.mjs';\nstylesSource();",
    "tests/s2.test.mjs": "import { x } from './helpers/wrapper.mjs';",
    "tests/plain.test.mjs": "mentions nothing about css",
  };
  const helpers = { "tests/s1.test.mjs": new Set(["styles_source"]), "tests/s2.test.mjs": new Set(["wrapper", "styles_source"]) };
  const { selected } = selectTests({
    allTests: Object.keys(files), textOf: (f) => files[f],
    readers: helperReaders("css/styles_03_menus_panels.css"), helpersOf: (f) => helpers[f] ?? new Set(),
  });
  assert.deepEqual([...selected].sort(), ["tests/s1.test.mjs", "tests/s2.test.mjs"]);
});

test("selectTests: module_source users are picked only when they name the parent module", () => {
  const files = {
    "tests/m1.test.mjs": "moduleSource('js/view3d.js')",
    "tests/m2.test.mjs": "moduleSource('js/other.js')",
  };
  const { selected } = selectTests({
    allTests: Object.keys(files), textOf: (f) => files[f],
    readers: helperReaders("js/view3d/camera.js"), helpersOf: () => new Set(["module_source"]),
  });
  assert.deepEqual([...selected], ["tests/m1.test.mjs"]);
});

const DISK = {
  "tests/deep.test.mjs": "import { a } from './helpers/helper_a.mjs';\nrun(a);",
  "tests/helpers/helper_a.mjs": "import { b } from './helper_b.mjs';\nexport const a = b;",
  "tests/helpers/helper_b.mjs": "import { a } from './helper_a.mjs';\nimport x from '../../js/not_a_helper.mjs';\n// js/commented.js\nreadFileSync('js/track.js');",
  "tests/helpers/modeler_source.mjs": "import { moduleSource } from './module_source.mjs';",
  "tests/helpers/module_source.mjs": "/* js/view3d.js */\n// moduleSource('js/view3d.js')\nexport const moduleSource = () => '';",
  "tests/ms.test.mjs": "import { modelerSource } from './helpers/modeler_source.mjs';",
};

test("helperPaths resolves relative imports and keeps only tests/helpers modules", () => {
  assert.deepEqual(helperPaths(DISK["tests/deep.test.mjs"], "tests/deep.test.mjs"), ["tests/helpers/helper_a.mjs"]);
  assert.deepEqual(helperPaths(DISK["tests/helpers/helper_b.mjs"], "tests/helpers/helper_b.mjs"), ["tests/helpers/helper_a.mjs"]);
  assert.deepEqual(helperPaths("await import('./helpers/q.mjs'); import '../js/x.js';", "uikit/tests/t.test.mjs"), ["uikit/tests/helpers/q.mjs"]);
});

test("collectHelpers follows helper imports recursively, once each, without cycles", () => {
  const reads = [];
  const readText = (p) => { reads.push(p); return DISK[p] ?? ""; };
  const { text, helpers } = collectHelpers("tests/deep.test.mjs", readText);
  assert.deepEqual([...helpers].sort(), ["helper_a", "helper_b"]);
  assert.ok(text.includes("js/track.js"));
  assert.equal(reads.length, new Set(reads).size, "each file is read once");
  // a test importing helper A that imports helper B naming the changed module is selected
  const { selected } = selectTests({
    allTests: ["tests/deep.test.mjs", "tests/ms.test.mjs"],
    textOf: (f) => collectHelpers(f, readText).text,
    needles: ["track.js"],
  });
  assert.deepEqual([...selected], ["tests/deep.test.mjs"]);
});

test("collectHelpers: helper comments do not name modules, and wrappers expose inner helpers", () => {
  const { text, helpers } = collectHelpers("tests/ms.test.mjs", (p) => DISK[p] ?? "");
  assert.deepEqual([...helpers].sort(), ["modeler_source", "module_source"]);
  assert.ok(!text.includes("view3d.js"));
  // so a module_source reader finds the wrapper's users when the parent module is named
  const { selected } = selectTests({
    allTests: ["tests/ms.test.mjs"], textOf: () => text + "\nmoduleSource('js/view3d.js')",
    readers: helperReaders("js/view3d.js"), helpersOf: () => helpers,
  });
  assert.equal(selected.size, 1);
});

test("planEditorChanges: block-comment lines at top level do not trigger the fallback", () => {
  const text = "var a = 1;\n/* long note\n   second line\n*/\nfunction f() {\n  return 1;\n}\n";
  const plan = planEditorChanges([{ file: "js/modeler.js" }], fakeIo({ oldText: text, newText: text, diff: "@@ -3 +3 @@\n" }));
  assert.equal(plan.fallback, null);
  const code = planEditorChanges([{ file: "js/modeler.js" }], fakeIo({
    oldText: "var a = 1;\n/* c */ run();\nfunction f() {}\n", newText: "var a = 1;\n/* c */ run();\nfunction f() {}\n", diff: "@@ -2 +2 @@\n",
  }));
  assert.match(code.fallback, /:2 is outside any declaration/);
});

test("a changed tests/helpers module selects every test whose recursive helper set includes it", () => {
  assert.equal(changedHelperName("tests/helpers/module_source.mjs"), "module_source");
  assert.equal(changedHelperName("uikit/tests/helpers/q.mjs"), "q");
  assert.equal(changedHelperName("tests/x.test.mjs"), null);
  assert.deepEqual(helperReaders("tests/helpers/module_source.mjs"), [{ helper: "module_source", needles: null }]);
  // helper_b is reached by deep.test only through helper_a; ms.test reaches module_source through modeler_source
  const readText = (p) => DISK[p] ?? "";
  const helpersOf = (f) => collectHelpers(f, readText).helpers;
  const allT = ["tests/deep.test.mjs", "tests/ms.test.mjs"];
  const pick = (file) => [...selectTests({
    allTests: allT, textOf: (f) => collectHelpers(f, readText).text, readers: helperReaders(file), helpersOf,
  }).selected];
  assert.deepEqual(pick("tests/helpers/helper_b.mjs"), ["tests/deep.test.mjs"]);
  assert.deepEqual(pick("tests/helpers/module_source.mjs"), ["tests/ms.test.mjs"]);
  assert.deepEqual(pick("tests/helpers/unused.mjs"), []);
});

// ---- a function's span ends where its statement ends ------------------------

const BETWEEN = [
  "function alpha() {", // 1
  "  return 1;", // 2
  "}", // 3
  "registry.add(alpha);", // 4
  "",
  "class Box {", // 6
  "  m() { return 1; }", // 7
  "}", // 8
  "Box.defaults = {};", // 9
  "export const table = {", // 10
  "  k: 1,", // 11
  "};", // 12
  "init();", // 13
  "function beta() {", // 14
  "  return 2;", // 15
  "}", // 16
  "",
].join("\n");
const planBetween = (diff, text = BETWEEN) => planEditorChanges([{ file: "js/modeler.js" }], fakeIo({ oldText: text, newText: text, diff }));

test("planEditorChanges: a top-level statement after a function is not blamed on that function", () => {
  // `registry.add(alpha);` follows alpha's closing brace: it belongs to no declaration, so the fallback applies
  const stmt = planBetween("@@ -4 +4 @@\n");
  assert.match(stmt.fallback, /js\/modeler\.js:4 is outside any declaration/);
  assert.deepEqual([...stmt.names], []);
  // the same for a class, and for a statement after an exported variable
  assert.match(planBetween("@@ -9 +9 @@\n").fallback, /:9 is outside any declaration/);
  assert.match(planBetween("@@ -13 +13 @@\n").fallback, /:13 is outside any declaration/);
  // lines inside the spans still select exactly their declaration
  for (const [diff, name] of [["@@ -2 +2 @@\n", "alpha"], ["@@ -7 +7 @@\n", "Box"], ["@@ -11 +11 @@\n", "table"], ["@@ -15 +15 @@\n", "beta"], ["@@ -14 +14 @@\n", "beta"], ["@@ -3 +3 @@\n", "alpha"]]) {
    const p = planBetween(diff);
    assert.deepEqual([...p.names], [name], diff);
    assert.equal(p.fallback, null, diff);
  }
});

test("planEditorChanges: the old side is judged against the old text's spans", () => {
  const newText = BETWEEN.replace("registry.add(alpha);\n", "");
  // removing line 4: the old side's range sits in no declaration; the new side has nothing to map
  const p = planEditorChanges([{ file: "js/modeler.js" }], fakeIo({ oldText: BETWEEN, newText, diff: "@@ -4 +3,0 @@\n-registry.add(alpha);\n" }));
  assert.match(p.fallback, /:4 \(old side\) is outside any declaration/);
});

test("planEditorChanges: column-0 text inside a template literal is not a declaration", () => {
  const text = [
    "function alpha() {", // 1
    "  return `", // 2
    "function fake() {", // 3
    "const nope = 1;", // 4
    "`;", // 5
    "}", // 6
    "function beta() { return 2; }", // 7
    "",
  ].join("\n");
  const p = planBetween("@@ -4 +4 @@\n", text);
  assert.deepEqual([...p.names], ["alpha"]);
  assert.equal(p.fallback, null);
});

test("planEditorChanges: text that does not parse falls back and says so", () => {
  const broken = "function alpha() {\n  return 1;\n";
  const p = planBetween("@@ -2 +2 @@\n", broken);
  assert.match(p.fallback, /js\/modeler\.js: cannot parse to find declaration ends/);
});

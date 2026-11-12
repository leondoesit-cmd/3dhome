// tools/duplicate_names_check.mjs: two files of one split module family may
// not declare the same top-level name, since the tests join the family into
// one script where the second declaration is a SyntaxError.
import test from "node:test";
import assert from "node:assert/strict";
import { checkTree, duplicateNames, splitFamilies, topLevelNames } from "../tools/duplicate_names_check.mjs";

test("top-level names: functions, classes, var/let/const with destructuring, not imports", () => {
  const names = topLevelNames(`
    import { imported } from "./a.js";
    import * as ns from "./b.js";
    export function f() { const inner = 1; return inner; }
    class C {}
    export default function dflt() {}
    let a = 1, b = 2;
    const { c, d: e, ...rest } = obj, [g, , h = 3, ...tail] = arr;
    export const k = 4;
    var v;
    if (x) { var hoisted = 1; }
  `);
  assert.deepEqual([...names].sort(), ["C", "a", "b", "c", "dflt", "e", "f", "g", "h", "k", "rest", "tail", "v"]);
});

test("a family with a name declared in two files is reported with both paths", () => {
  const dups = duplicateNames([
    { path: "js/fx.js", text: "import { activeSketch } from './fx/guide.js';\nexport function main() {}\n" },
    { path: "js/fx/guide.js", text: "export function activeSketch() {}\nconst [goTourStep] = [1];\n" },
    { path: "js/fx/sketch.js", text: "function activeSketch() {}\nlet goTourStep = 2, other = 3;\n" },
  ]);
  assert.deepEqual(dups, [
    { name: "activeSketch", files: ["js/fx/guide.js", "js/fx/sketch.js"] },
    { name: "goTourStep", files: ["js/fx/guide.js", "js/fx/sketch.js"] },
  ]);
});

test("a clean family reports nothing", () => {
  assert.deepEqual(duplicateNames([
    { path: "js/ok.js", text: "import { b } from './ok/b.js';\nexport function a() { return b(); }\n" },
    { path: "js/ok/b.js", text: "export function b() { const a = 1; return a; }\n" },
    { path: "js/ok/c.js", text: "export const c = 1;\n" },
  ]), []);
});

test("the families are the joined splits, not js/physics/'s independent modules", () => {
  const fams = splitFamilies();
  for (const f of ["js/modeler.js", "js/view3d.js", "js/interaction.js", "js/ui.js"]) assert.ok(fams.includes(f), f);
  assert.ok(!fams.includes("js/physics.js"));
});

test("the current tree has no duplicate top-level names in a split family", () => {
  assert.deepEqual(checkTree(), []);
});

// js/split_dock.js: whether the planner's Split docks its 3D into the right
// column, or keeps plan and 3D side by side / stacked in the canvas.
import test from "node:test";
import assert from "node:assert/strict";
import { dockSplit3D, inspectorFacts } from "../js/split_dock.js";

const column = { inspectorShown: true, inspectorOverlay: false };
const drawer = { inspectorShown: true, inspectorOverlay: true };

test("a wide desktop window docks Split's 3D at the top of the inspector column", () => {
  assert.equal(dockSplit3D({ desk: true, ...column }), true);
});

test("2D or 3D alone never docks", () => {
  assert.equal(dockSplit3D({ desk: true, max2d: true, ...column }), false);
  assert.equal(dockSplit3D({ desk: true, max3d: true, ...column }), false);
});

test("the inspector as a drawer (1024px and below), open or closed, keeps the 3D in the canvas", () => {
  assert.equal(dockSplit3D({ desk: true, ...drawer }), false);
});

test("a hidden inspector or a compact / classic layout keeps the 3D in the canvas", () => {
  assert.equal(dockSplit3D({ desk: true, inspectorShown: false, inspectorOverlay: false }), false);
  assert.equal(dockSplit3D({ desk: false, ...column }), false);
  assert.equal(dockSplit3D(undefined), false);
});

test("inspectorFacts reads display, visibility and position from the computed style", () => {
  const style = (cs) => () => cs;
  assert.deepEqual(inspectorFacts({}, style({ display: "flex", visibility: "visible", position: "static" })), column);
  assert.deepEqual(inspectorFacts({}, style({ display: "flex", visibility: "visible", position: "absolute" })), drawer);
  assert.deepEqual(inspectorFacts({}, style({ display: "flex", visibility: "visible", position: "fixed" })), drawer);
  assert.equal(inspectorFacts({}, style({ display: "none", visibility: "visible", position: "static" })).inspectorShown, false);
  assert.equal(inspectorFacts({}, style({ display: "flex", visibility: "hidden", position: "static" })).inspectorShown, false);
  assert.equal(inspectorFacts(null, style({})).inspectorShown, false);
});

// the wiring: placeSplit3D decides through dockSplit3D and re-decides on resize
test("placeSplit3D takes its decision from dockSplit3D and follows window resizes", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../js/pro_ribbon.js", import.meta.url), "utf8");
  const { sourceFunctionText } = await import("./helpers/source_function.mjs");
  const fn = sourceFunctionText(src, "placeSplit3D");
  assert.match(fn, /dockSplit3D\(\{/);
  assert.match(fn, /inspectorFacts\(insp,/);
  assert.match(src, /addEventListener\("resize", function \(\) \{ placeSplit3D\(proDesk\(\)\); \}\)/);
});

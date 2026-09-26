import test from "node:test";
import assert from "node:assert/strict";
import { addCenterSlot } from "../js/sketch_center_slot.js";
import { solveSketch } from "../js/sketch_solver.js";
import { analyzeSketchProfiles } from "../js/sketch_profiles.js";

test("centrepoint slot remains centred, tangent and fully defined through length and width edits", () => {
  let sequence = 0;
  const sketch = { points: [], entities: [], constraints: [] };
  addCenterSlot(sketch, { length: 2.54, width: 1.27, x: 2, y: 3, fixCenter: true }, () => "slot" + ++sequence);
  assert.equal(solveSketch(sketch).status, "fully-constrained");
  const restored = JSON.parse(JSON.stringify(sketch));
  restored.constraints.find((c) => c.type === "distance").value = 10.16;
  restored.constraints.find((c) => c.type === "radius").value = .8;
  assert.equal(solveSketch(restored).status, "fully-constrained");
  const [a, b, midpoint] = restored.points;
  assert.ok(Math.abs((a.x + b.x) / 2 - 2) < 1e-8);
  assert.ok(Math.abs(a.y - 3) < 1e-8 && Math.abs(b.y - 3) < 1e-8);
  assert.ok(Math.abs(midpoint.x - 2) < 1e-8 && Math.abs(midpoint.y - 3) < 1e-8);
  assert.ok(Math.abs(b.x - a.x - 10.16) < 1e-8);
  const profiles = analyzeSketchProfiles(restored);
  assert.equal(profiles.profiles.length, 1);
});

test("an unpinned centrepoint slot drags as a whole and keeps its size", () => {
  let sequence = 0;
  const sketch = { points: [], entities: [], constraints: [] };
  addCenterSlot(sketch, { length: 2.54, width: 1.27 }, () => "drag" + ++sequence);
  assert.equal(solveSketch(sketch).degreesOfFreedom, 2);
  // the editor pins the held point for the length of a drag
  const midpoint = sketch.points[2];
  midpoint.x = 3; midpoint.y = -2; midpoint.fixed = true;
  assert.ok(solveSketch(sketch).converged);
  midpoint.fixed = false;
  const [a, b] = sketch.points;
  assert.ok(Math.abs(midpoint.x - 3) < 1e-6 && Math.abs(midpoint.y + 2) < 1e-6);
  assert.ok(Math.abs(b.x - a.x - 2.54) < 1e-6 && Math.abs(a.y + 2) < 1e-6 && Math.abs(b.y + 2) < 1e-6);
});

test("invalid centrepoint slot dimensions leave the sketch untouched", () => {
  const sketch = { points: [], entities: [], constraints: [] };
  for (const width of [0, -1, Infinity, NaN]) {
    assert.throws(() => addCenterSlot(sketch, { length: 2.54, width }, () => "unused"));
    assert.deepEqual(sketch, { points: [], entities: [], constraints: [] });
  }
});

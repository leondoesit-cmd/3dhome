import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { solveSketch } from "../js/sketch_solver.js";
import { ensureSketchOriginPoint, pickIsOrigin, sketchOriginPoint } from "../js/core/sketch_origin.js";
import { readFileSync } from "node:fs";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test("the Origin is a fixed point that a pick near (0, 0) finds or makes once", () => {
  const sketch = { points: [{ id: "a", x: -14.478, y: 3.869 }], entities: [], constraints: [] };
  let next = 1;
  const first = ensureSketchOriginPoint(sketch, () => "o" + next++);
  assert.equal(first.created, true);
  assert.deepEqual([first.point.x, first.point.y, first.point.origin], [0, 0, true]);
  assert.ok(sketch.constraints.some((c) => c.type === "fixed" && c.point === first.point.id && c.x === 0 && c.y === 0));
  const again = ensureSketchOriginPoint(sketch, () => "o" + next++);
  assert.equal(again.created, false, "picking the Origin twice does not stack points");
  assert.equal(again.point, first.point);
  assert.equal(sketch.points.length, 2);
  // A point the user already fixed at (0, 0) counts as the Origin.
  const drawn = { points: [{ id: "c", x: 0, y: 0 }], entities: [], constraints: [{ id: "f", type: "fixed", point: "c", x: 0, y: 0 }] };
  assert.equal(sketchOriginPoint(drawn).id, "c");
  assert.equal(pickIsOrigin({ u: 0.05, v: -0.05 }, 0.1), true);
  assert.equal(pickIsOrigin({ u: 0.5, v: 0 }, 0.1), false);
});

test("HandlePath: a 2.500 in dimension from the Origin to the horizontal line sets the handle's height", () => {
  // Right Plane (u = z, v = y). Horizontal line from Boss-Stop's rim (u 0) back toward the housing, drawn at v 6.9.
  const sketch = {
    plane: "side", offset: 0,
    points: [{ id: "l", x: 0, y: 6.9 }, { id: "r", x: -13.2, y: 6.9 }],
    entities: [{ id: "h", type: "line", a: "l", b: "r" }],
    constraints: [{ id: "hz", type: "horizontal", entity: "h" }],
  };
  let next = 1;
  const origin = ensureSketchOriginPoint(sketch, () => "id" + next++).point;
  sketch.constraints.push({ id: "d", type: "pointLineDistance", point: origin.id, a: "h", value: 2.5 * 2.54 });
  assert.equal(solveSketch(sketch).converged, true);
  const l = sketch.points.find((p) => p.id === "l"), r = sketch.points.find((p) => p.id === "r");
  assert.ok(near(l.y, 6.35) && near(r.y, 6.35), "the line sits 6.35 cm from the Origin: " + JSON.stringify([l, r]));
  assert.ok(near(origin.x, 0) && near(origin.y, 0), "the Origin does not move");
});

/* --- the editor wiring ---------------------------------------------------- */

const modeler = modelerSource();

test("Smart Dimension picks the Origin when nothing else is under the pointer", () => {
  assert.match(modeler, /var dhit = hitSketch\(uv, e\.pointerType\);[\s\S]{0,420}if \(!dhit && pickIsOrigin\(uv, \(e\.pointerType === "touch" \? 14 : 7\) \/ E\.scl\)\) \{/, "a miss near (0, 0) is an Origin pick");
  assert.match(modeler, /if \(!sketchOriginPoint\(ensureSketch\(E\.def\)\)\) pushUndo\(t\("opDim"\)\);\s*dhit = ensureSketchOriginPoint\(ensureSketch\(E\.def\), uid\)\.point;/, "made once, undoable, then used as a point");
});

test("Cancel removes a dimension the pick just created", () => {
  assert.match(modeler, /function editPlacedDimension\(sketch, constraint, historyAlreadyOpen, clientX, clientY, discardOnCancel, created\)[\s\S]{0,200}created:!!created/, "the editor is told the dimension is new");
  assert.match(modeler, /editPlacedDimension\(drag\.sketch, drag\.constraint, true, clientX, clientY, !drag\.created && !drag\.moved, drag\.created\);/, "a fresh pick passes created");
  assert.match(modeler, /function cancelDimensionEditor\(\) \{[\s\S]{0,120}if \(state\.created\) \{[\s\S]{0,160}filter\(function \(candidate\) \{ return candidate !== state\.constraint; \}\)/, "and Cancel takes a created dimension back out");
});

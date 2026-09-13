import test from "node:test";
import assert from "node:assert/strict";
import { solveSketch, circleData } from "../js/sketch_solver.js";
import { filletSketchCorner, findFilletCorner } from "../js/sketch_fillet.js";

function L(radius = 1.27) {
  return {
    points: [
      { id: "v", x: 0, y: 0 },
      { id: "b", x: 0, y: 10, fixed: true },
      { id: "c", x: 10, y: 0, fixed: true },
    ],
    entities: [
      { id: "vert", type: "line", name: "Line", a: "v", b: "b" },
      { id: "horiz", type: "line", name: "Line", a: "v", b: "c" },
    ],
    constraints: [
      { id: "vv", type: "vertical", entity: "vert" },
      { id: "hh", type: "horizontal", entity: "horiz" },
    ],
    radius,
  };
}

function points(sketch) {
  return new Map(sketch.points.map((point) => [point.id, point]));
}

test("HandlePath fillet trims two lines and inserts a tangent arc of the given radius", () => {
  const sketch = L();
  const made = filletSketchCorner(sketch, { vertexId: "v", radius: 1.27 }, (n => n + Math.random().toString(36).slice(2, 6)));
  const report = solveSketch(sketch);
  assert.equal(report.converged, true);
  assert.equal(sketch.constraints.some((c) => c.type === "vertical" && c.entity === "vert"), true);
  assert.equal(sketch.constraints.some((c) => c.type === "horizontal" && c.entity === "horiz"), true);
  assert.equal(sketch.constraints.filter((c) => c.type === "tangent").length, 2);
  const map = points(sketch);
  const arc = circleData(made.arc, map);
  assert.ok(Math.abs(arc.radius - 1.27) < 1e-6);
  const a = map.get(sketch.entities.find((e) => e.id === "vert").a);
  const b = map.get(sketch.entities.find((e) => e.id === "vert").b);
  const near = a.id === "b" ? b : a;
  assert.ok(Math.abs(near.x) < 1e-6);
  assert.ok(Math.abs(near.y - 1.27) < 1e-4);
  const ha = map.get(sketch.entities.find((e) => e.id === "horiz").a);
  const hb = map.get(sketch.entities.find((e) => e.id === "horiz").b);
  const hNear = ha.id === "c" ? hb : ha;
  assert.ok(Math.abs(hNear.y) < 1e-6);
  assert.ok(Math.abs(hNear.x - 1.27) < 1e-4);
});

test("a driving fillet radius rebuilds the tangent points", () => {
  const sketch = L();
  const made = filletSketchCorner(sketch, { vertexId: "v", radius: 1.27 });
  const dim = sketch.constraints.find((c) => c.type === "radius" && c.entity === made.arc.id);
  dim.value = 2.54;
  const report = solveSketch(sketch);
  assert.equal(report.converged, true);
  const arc = circleData(made.arc, points(sketch));
  assert.ok(Math.abs(arc.radius - 2.54) < 1e-4);
});

test("a HandlePath fillet with pinned ends stays fully defined", () => {
  const sketch = L();
  filletSketchCorner(sketch, { entityIds: ["vert", "horiz"], radius: 1.27 });
  const report = solveSketch(sketch);
  assert.equal(report.converged, true);
  assert.equal(report.status, "fully-constrained");
});

test("a radius larger than the shorter leg is refused", () => {
  const sketch = L();
  assert.throws(() => filletSketchCorner(sketch, { vertexId: "v", radius: 12 }), /too large/);
});

test("parallel lines are refused", () => {
  const sketch = {
    points: [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 8 },
      { id: "c", x: 3, y: 0 }, { id: "d", x: 3, y: 8 },
    ],
    entities: [
      { id: "l1", type: "line", a: "a", b: "b" },
      { id: "l2", type: "line", a: "c", b: "d" },
    ],
    constraints: [],
  };
  assert.throws(() => findFilletCorner(sketch, { entityIds: ["l1", "l2"] }), /share a vertex/);
});

test("collinear lines that share a vertex are refused", () => {
  const sketch = {
    points: [
      { id: "v", x: 0, y: 0 },
      { id: "b", x: 8, y: 0 },
      { id: "c", x: -6, y: 0 },
    ],
    entities: [
      { id: "l1", type: "line", a: "v", b: "b" },
      { id: "l2", type: "line", a: "v", b: "c" },
    ],
    constraints: [],
  };
  assert.throws(() => filletSketchCorner(sketch, { vertexId: "v", radius: 1 }), /parallel or collinear/);
});

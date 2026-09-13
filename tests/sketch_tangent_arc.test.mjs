import test from "node:test";
import assert from "node:assert/strict";
import { entityOutgoingTangent, tangentArc } from "../js/sketch_tangent_arc.js";
import { solveSketch } from "../js/sketch_solver.js";

test("a LongRib tangent arc from a horizontal line is a quarter-circle", () => {
  const start = { u: 0, v: 0, pointId: "p" };
  const end = { u: -1, v: 1 };
  const arc = tangentArc(start, { x: -1, y: 0 }, end);
  assert.ok(arc);
  assert.ok(Math.abs(arc.radius - 1) < 1e-9);
  assert.ok(Math.abs(arc.centre.u) < 1e-9);
  assert.ok(Math.abs(arc.centre.v - 1) < 1e-9);
  const distStart = Math.hypot((arc.start.u ?? arc.start.x) - arc.centre.u, (arc.start.v ?? arc.start.y) - arc.centre.v);
  const distEnd = Math.hypot((arc.end.u ?? arc.end.x) - arc.centre.u, (arc.end.v ?? arc.end.y) - arc.centre.v);
  assert.ok(Math.abs(distStart - 1) < 1e-9);
  assert.ok(Math.abs(distEnd - 1) < 1e-9);
});

test("an end along the tangent is a line, not an arc", () => {
  assert.equal(tangentArc({ u: 0, v: 0 }, { x: -1, y: 0 }, { u: -4, v: 0 }), null);
});

test("HandlePath continues past the line endpoint, not back along the segment", () => {
  const sketch = {
    points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }],
    entities: [{ id: "h", type: "line", a: "a", b: "b" }],
    constraints: [],
  };
  const left = entityOutgoingTangent(sketch, "a");
  assert.ok(left);
  assert.ok(Math.abs(left.tangent.x + 1) < 1e-9);
  assert.ok(Math.abs(left.tangent.y) < 1e-9);
  const right = entityOutgoingTangent(sketch, "b");
  assert.ok(Math.abs(right.tangent.x - 1) < 1e-9);
});

test("a tangent constraint keeps the arc on the line after the line moves", () => {
  const sketch = {
    points: [
      { id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 10, y: 0, fixed: true },
      { id: "c", x: 0, y: 1 }, { id: "p", x: 0, y: 0 }, { id: "q", x: -1, y: 1, fixed: true },
    ],
    entities: [
      { id: "h", type: "line", a: "a", b: "b" },
      { id: "arc", type: "arc", c: "c", a: "p", b: "q" },
    ],
    constraints: [
      { id: "coin", type: "coincident", a: "p", b: "a" },
      { id: "tan", type: "tangent", a: "h", b: "arc" },
    ],
  };
  assert.equal(solveSketch(sketch).converged, true);
  const centre = sketch.points.find((point) => point.id === "c");
  assert.ok(Math.abs(Math.hypot(centre.x, centre.y - 0) - 1) < 1e-4 || Math.abs(centre.x) < 1e-3);
  sketch.points.find((point) => point.id === "a").y = 2;
  sketch.points.find((point) => point.id === "b").y = 2;
  assert.equal(solveSketch(sketch).converged, true);
  const lineY = sketch.points.find((point) => point.id === "a").y;
  const start = sketch.points.find((point) => point.id === "p");
  assert.ok(Math.abs(start.y - lineY) < 1e-4, JSON.stringify(start));
});

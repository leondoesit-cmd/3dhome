// Slots, regular polygons, ellipses and the circular pattern.
//
// Each of these is only worth having if it is *held* — the point of building a
// slot out of parallel sides and tangency rather than out of four frozen points
// is that dragging one end keeps it a slot. So every test here checks the
// relationship survives a move, not just that the first draw looked right.

import test from "node:test";
import assert from "node:assert/strict";
import { solveSketch, ellipseData, pruneOrphanPoints, removeSketchEntity } from "../js/sketch_solver.js";
import { circularPatternEntities } from "../js/sketch_pattern.js";
import { analyzeSketchProfiles } from "../js/sketch_profiles.js";

const points = (sketch) => new Map(sketch.points.map((p) => [p.id, p]));
const pt = (sketch, id) => sketch.points.find((p) => p.id === id);

/* ---- slot: two sides, two caps, parallel sides tangent at all four joints ---- */

// centreline (0,0)→(40,0), half width 5 — the same construction the editor's
// addSketchSlot lays down
function slotDoc(length = 40, w = 5) {
  const scale = length / 40;
  return {
    points: [
      { id: "ca", x: 0, y: 0 }, { id: "cb", x: 40 * scale, y: 0 },
      { id: "a0", x: 0, y: w }, { id: "a1", x: 0, y: -w },
      { id: "b0", x: 40 * scale, y: w }, { id: "b1", x: 40 * scale, y: -w },
    ],
    entities: [
      { id: "S1", type: "line", a: "a1", b: "b1" },
      { id: "CB", type: "arc", c: "cb", a: "b1", b: "b0" },
      { id: "S0", type: "line", a: "b0", b: "a0" },
      { id: "CA", type: "arc", c: "ca", a: "a0", b: "a1" },
      { id: "CL", type: "line", a: "ca", b: "cb", construction: true },
    ],
    constraints: [
      { id: "p0", type: "parallel", a: "S0", b: "CL" },
      { id: "t0", type: "tangent", a: "S0", b: "CA" },
      { id: "p1", type: "parallel", a: "S1", b: "CL" },
      { id: "t1", type: "tangent", a: "S1", b: "CA" },
      { id: "t2", type: "tangent", a: "S0", b: "CB" },
      { id: "t3", type: "tangent", a: "S1", b: "CB" },
    ],
  };
}

test("a slot has exactly the five freedoms a slot has", () => {
  const s = slotDoc();
  const result = solveSketch(s);
  assert.equal(result.status, "under-constrained");
  // centre x, centre y, angle, length, width
  assert.equal(result.degreesOfFreedom, 5);
});

/* The old slot — equal radius, tangency at the near cap only — also read 5, but
   only because a forward-difference Jacobian filled a row whose exact slope is
   zero. Its far rim points meet the cap at a double root, so to first order they
   slide: with exact slopes it kept two freedoms after every dimension. */
test("a slot with its position, angle, length and width dimensioned is fully defined", () => {
  const s = slotDoc();
  s.constraints.push(
    { id: "f", type: "fixed", point: "ca", x: 0, y: 0 }, { id: "h", type: "horizontal", entity: "CL" },
    { id: "L", type: "distance", entity: "CL", value: 40 }, { id: "w", type: "radius", entity: "CA", value: 5 });
  const result = solveSketch(s);
  assert.equal(result.status, "fully-constrained", JSON.stringify(result));
  const nearOnly = slotDoc();
  nearOnly.constraints = nearOnly.constraints.filter((c) => c.id !== "t2" && c.id !== "t3");
  nearOnly.constraints.push({ id: "eq", type: "equal", a: "CA", b: "CB" }, ...s.constraints.slice(-4));
  assert.equal(solveSketch(nearOnly).degreesOfFreedom, 2, "near-cap tangency alone leaves the far rim sliding");
});

/* The same shape has the same freedoms whatever it is drawn at. It did not:
   the rank test used an absolute pivot tolerance against a Jacobian whose rows
   are in different units, so a slot drawn at 8 cm and the same slot at 400 cm
   ranked differently and the larger one reported a freedom it does not have. */
test("the degrees-of-freedom count does not depend on how big the sketch is", () => {
  [[8, 1], [40, 5], [75, 25], [400, 60]].forEach(([length, width]) => {
    const report = solveSketch(slotDoc(length, width));
    assert.equal(report.degreesOfFreedom, 5, `a ${length} cm slot still has five freedoms`);
  });
});

test("a slot is a closed profile the feature engine can consume", () => {
  const analysis = analyzeSketchProfiles(slotDoc());
  assert.equal(analysis.status, "ready");
  assert.equal(analysis.profiles.length, 1);
  assert.equal(analysis.openEnds.length, 0);
  // the construction centreline must not appear as geometry of its own
  assert.ok(!analysis.profiles[0].entityIds.includes("CL"));
});

test("dragging one end of a slot keeps it a slot", () => {
  const s = slotDoc();
  // drag the far cap centre up and out, pinned the way the editor pins a
  // dragged point
  const end = pt(s, "cb");
  end.x = 55; end.y = 30; end.fixed = true;
  pt(s, "ca").fixed = true;
  const result = solveSketch(s);
  assert.ok(result.converged, "the solver found a slot for the new centreline");

  const map = points(s);
  const reach = (id, from) => Math.hypot(map.get(id).x - from.x, map.get(id).y - from.y);
  const start = pt(s, "ca");
  assert.ok(Math.abs(reach("b0", end) - reach("b1", end)) < 1e-3, "the far cap stays circular");
  assert.ok(Math.abs(reach("a0", start) - reach("a1", start)) < 1e-3, "so does the near cap");
  assert.ok(Math.abs(reach("b0", end) - reach("a0", start)) < 1e-3, "and both caps share one radius");

  // both sides stay parallel to the new centreline
  const axis = Math.atan2(end.y - start.y, end.x - start.x);
  [["a1", "b1"], ["a0", "b0"]].forEach(([from, to]) => {
    const side = Math.atan2(map.get(to).y - map.get(from).y, map.get(to).x - map.get(from).x);
    const off = Math.abs(Math.atan2(Math.sin(side - axis), Math.cos(side - axis)));
    assert.ok(off < 1e-3, `side ${from}→${to} stayed parallel to the centreline (off by ${off})`);
  });
});

test("a dimensioned slot width survives the drag exactly", () => {
  const s = slotDoc();
  // the width dimension the editor writes: a radius on one cap, which the
  // tangent sides then carry to the other
  s.constraints.push({ id: "w", type: "radius", entity: "CA", value: 5 });
  const end = pt(s, "cb");
  end.x = 55; end.y = 30; end.fixed = true;
  pt(s, "ca").fixed = true;
  assert.ok(solveSketch(s).converged);

  const map = points(s);
  ["b0", "b1"].forEach((id) => {
    assert.ok(Math.abs(Math.hypot(map.get(id).x - end.x, map.get(id).y - end.y) - 5) < 1e-3,
      "the dimensioned width is held through the move");
  });
});

/* ---- regular polygon: chords of a construction circle, held equal ---- */

function polygonDoc(n = 6, r = 20) {
  const sketch = { points: [{ id: "c", x: 0, y: 0 }], entities: [], constraints: [] };
  sketch.entities.push({ id: "G", type: "circle", c: "c", r, construction: true });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    sketch.points.push({ id: "p" + i, x: Math.cos(a) * r, y: Math.sin(a) * r });
    sketch.constraints.push({ id: "on" + i, type: "pointOnCircle", point: "p" + i, entity: "G" });
  }
  for (let i = 0; i < n; i++) sketch.entities.push({ id: "L" + i, type: "line", a: "p" + i, b: "p" + ((i + 1) % n) });
  for (let i = 0; i < n - 1; i++) sketch.constraints.push({ id: "eq" + i, type: "equal", a: "L" + i, b: "L" + (i + 1) });
  return sketch;
}

test("a regular polygon keeps four freedoms: centre, size and rotation", () => {
  const result = solveSketch(polygonDoc(6, 20));
  assert.equal(result.degreesOfFreedom, 4);
  assert.notEqual(result.status, "over-constrained");
});

test("driving the guide circle resizes the whole polygon", () => {
  const s = polygonDoc(6, 20);
  s.constraints.push({ id: "r", type: "radius", entity: "G", value: 35 });
  const result = solveSketch(s);
  assert.ok(result.converged);

  const map = points(s);
  const centre = map.get("c");
  const sides = [];
  for (let i = 0; i < 6; i++) {
    const a = map.get("p" + i), b = map.get("p" + ((i + 1) % 6));
    assert.ok(Math.abs(Math.hypot(a.x - centre.x, a.y - centre.y) - 35) < 1e-2, "corner rides the resized circle");
    sides.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  assert.ok(Math.max(...sides) - Math.min(...sides) < 1e-2, "and every side is still the same length");
});

/* ---- ellipse: three scalars the solver drives ---- */

const ellipseDoc = () => ({
  points: [{ id: "c", x: 10, y: 4 }],
  entities: [{ id: "E", type: "ellipse", c: "c", rx: 30, ry: 12, rot: 0.4 }],
  constraints: [],
});

test("an ellipse carries five freedoms: centre, both semi-axes and its tilt", () => {
  assert.equal(solveSketch(ellipseDoc()).degreesOfFreedom, 5);
});

test("a radius dimension drives the named semi-axis only", () => {
  const s = ellipseDoc();
  s.constraints.push({ id: "d1", type: "radius", entity: "E", value: 44 });
  s.constraints.push({ id: "d2", type: "radius", entity: "E", axis: "minor", value: 9 });
  const result = solveSketch(s);
  assert.ok(result.converged, "both axes are reachable");
  const e = ellipseData(s.entities[0], points(s));
  assert.ok(Math.abs(e.rx - 44) < 1e-3, `major drove to 44, got ${e.rx}`);
  assert.ok(Math.abs(e.ry - 9) < 1e-3, `minor drove to 9, got ${e.ry}`);
  assert.equal(result.degreesOfFreedom, 3, "centre and tilt are still free");
});

test("a point put on an ellipse lands on the curve, not on a circle", () => {
  const s = ellipseDoc();
  s.entities[0].rot = 0;
  s.points.push({ id: "q", x: 60, y: 30 });
  s.points[0].fixed = true;
  s.entities[0].fixed = true;                     // hold the ellipse, move the point
  s.constraints.push({ id: "on", type: "pointOnCircle", point: "q", entity: "E" });
  assert.ok(solveSketch(s).converged);
  const q = pt(s, "q"), c = pt(s, "c");
  const implicit = ((q.x - c.x) / 30) ** 2 + ((q.y - c.y) / 12) ** 2;
  assert.ok(Math.abs(implicit - 1) < 1e-3, `point satisfies the ellipse equation (${implicit})`);
});

test("an ellipse is a closed profile on its own", () => {
  const analysis = analyzeSketchProfiles(ellipseDoc());
  assert.equal(analysis.profiles.length, 1);
  assert.equal(analysis.profiles[0].kind, "ellipse");
  assert.ok(Math.abs(Math.abs(analysis.profiles[0].area) - Math.PI * 30 * 12) / (Math.PI * 30 * 12) < 0.01);
});

/* ---- circular pattern ---- */

// one small circle at (25,0), to be arrayed about the origin
const boltDoc = () => ({
  points: [{ id: "o", x: 0, y: 0, fixed: true }, { id: "h", x: 25, y: 0 }],
  entities: [{ id: "H", type: "circle", c: "h", r: 3 }],
  constraints: [],
});

test("a circular pattern places its copies evenly around the centre", () => {
  const s = boltDoc();
  const made = circularPatternEntities(s, ["H"], { count: 6, center: "o" });
  assert.equal(made.copies.length, 5);
  assert.equal(made.dimensions.length, 5);
  solveSketch(s);

  const angles = s.entities.map((e) => {
    const c = pt(s, e.c);
    return { r: Math.hypot(c.x, c.y), a: (Math.atan2(c.y, c.x) * 180) / Math.PI };
  });
  angles.forEach((h) => assert.ok(Math.abs(h.r - 25) < 1e-6, "every copy sits on the bolt circle"));
  const sorted = angles.map((h) => (h.a + 360) % 360).sort((x, y) => x - y);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(Math.abs(sorted[i] - sorted[i - 1] - 60) < 1e-6, "60° apart");
  }
});

test("the pattern is live: moving the source turns the whole ring", () => {
  const s = boltDoc();
  circularPatternEntities(s, ["H"], { count: 4, center: "o" });
  const source = pt(s, "h");
  source.x = 0; source.y = 40; source.fixed = true;      // drag the source a quarter turn out
  const result = solveSketch(s);
  assert.ok(result.converged);

  s.entities.forEach((e) => {
    const c = pt(s, e.c);
    assert.ok(Math.abs(Math.hypot(c.x, c.y) - 40) < 1e-3, "the ring followed out to the new radius");
    assert.ok(Math.abs(e.r - 3) < 1e-3, "and copies keep the source's radius");
  });
});

test("editing the pattern angle re-spaces the ring from one number", () => {
  const s = boltDoc();
  const made = circularPatternEntities(s, ["H"], { count: 3, center: "o" });
  pt(s, "h").fixed = true;
  // the k-th copy's dimension is k × pitch; retune to a 30° pitch
  made.dimensions.forEach((dim, k) => { dim.value = 30 * (k + 1); });
  assert.ok(solveSketch(s).converged);

  const copyAngles = made.copies.map((copy) => {
    const c = pt(s, copy.entities[0].c);
    return (Math.atan2(c.y, c.x) * 180) / Math.PI;
  });
  assert.ok(Math.abs(copyAngles[0] - 30) < 1e-3, `first copy at 30°, got ${copyAngles[0]}`);
  assert.ok(Math.abs(copyAngles[1] - 60) < 1e-3, `second copy at 60°, got ${copyAngles[1]}`);
});

test("a pattern shrinks rather than dissolving when a copy is deleted", () => {
  const s = boltDoc();
  const made = circularPatternEntities(s, ["H"], { count: 4, center: "o" });
  const doomed = made.copies[0].entities[0];
  removeSketchEntity(s, doomed.id);
  pruneOrphanPoints(s);

  const rotations = s.constraints.filter((c) => c.type === "rotation");
  assert.equal(rotations.length, 2, "the other two copies keep their pitch");
  rotations.forEach((c) => {
    c.pairs.forEach((pair) => {
      assert.ok(s.points.some((p) => p.id === pair[0]), "no rotation names a point that is gone");
      assert.ok(s.points.some((p) => p.id === pair[1]));
    });
  });
  assert.ok(solveSketch(s).converged, "and the sketch still solves");
});

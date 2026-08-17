import test from "node:test";
import assert from "node:assert/strict";
import { mirrorEntities, linearPatternEntities } from "../js/sketch_pattern.js";
import { solveSketch } from "../js/sketch_solver.js";

// a vertical mirror axis at x = 0, plus one line off to its right
const mirrorDoc = () => ({
  points: [
    { id: "m1", x: 0, y: 0, fixed: true }, { id: "m2", x: 0, y: 50, fixed: true },
    { id: "a", x: 10, y: 5 }, { id: "b", x: 30, y: 20 },
  ],
  entities: [
    { id: "AXIS", type: "line", a: "m1", b: "m2", construction: true },
    { id: "L", type: "line", a: "a", b: "b" },
  ],
  constraints: [],
});

test("mirror places the copy across the axis", () => {
  const s = mirrorDoc();
  const made = mirrorEntities(s, ["L"], "AXIS");
  assert.equal(made.entities.length, 1);
  const copy = made.entities[0];
  const pt = (id) => s.points.find((p) => p.id === id);
  assert.ok(Math.abs(pt(copy.a).x + 10) < 1e-9, "x is reflected");
  assert.ok(Math.abs(pt(copy.a).y - 5) < 1e-9, "y is unchanged");
  assert.ok(Math.abs(pt(copy.b).x + 30) < 1e-9);
});

test("a mirrored copy stays mirrored when the original moves", () => {
  const s = mirrorDoc();
  const made = mirrorEntities(s, ["L"], "AXIS");
  const copy = made.entities[0];
  const pt = (id) => s.points.find((p) => p.id === id);

  // Move the source, exactly as dragging its point does — including the pin the
  // drag applies. Without it the source is as free as the copy and the solver
  // satisfies the symmetry by meeting in the middle instead of following you.
  pt("a").x = 40; pt("a").y = -12; pt("a").fixed = true;
  const result = solveSketch(s);
  assert.equal(result.converged, true);
  assert.ok(Math.abs(pt(copy.a).x + 40) < 1e-3, `reflection followed, got ${pt(copy.a).x}`);
  assert.ok(Math.abs(pt(copy.a).y + 12) < 1e-3);
});

test("mirror refuses a missing or non-line axis, and never mirrors the axis itself", () => {
  const s = mirrorDoc();
  assert.equal(mirrorEntities(s, ["L"], "nope"), null);
  assert.equal(mirrorEntities(s, ["AXIS"], "AXIS"), null, "an axis alone leaves nothing to mirror");
  s.entities.push({ id: "C", type: "circle", c: "a", r: 5 });
  const made = mirrorEntities(s, ["L", "C"], "AXIS");
  assert.equal(made.entities.length, 2);
  assert.ok(s.constraints.some((c) => c.type === "equal"), "a mirrored circle keeps its radius");
});

/* ---- linear pattern ---- */

const patternDoc = () => ({
  points: [{ id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 0, y: 40, fixed: true }],
  entities: [{ id: "L", type: "line", a: "a", b: "b" }],
  constraints: [],
});

test("a linear pattern lays out the requested number of copies at the given pitch", () => {
  const s = patternDoc();
  const made = linearPatternEntities(s, ["L"], { count: 4, spacing: 25, direction: "u" });
  assert.equal(made.copies.length, 3, "count includes the original");
  assert.equal(s.entities.length, 4);
  const xs = s.entities.map((e) => s.points.find((p) => p.id === e.a).x).sort((m, n) => m - n);
  assert.deepEqual(xs.map((x) => Math.round(x)), [0, 25, 50, 75]);
});

test("a pattern is live: driving one spacing dimension moves that copy", () => {
  const s = patternDoc();
  const made = linearPatternEntities(s, ["L"], { count: 3, spacing: 20, direction: "u" });
  // one pitch dimension per copy, not one per point — that is the number the
  // user edits, and duplicates would all have to be kept in agreement
  assert.equal(made.dimensions.length, 2);
  made.dimensions.find((d) => Math.abs(d.value - 20) < 1e-9).value = 60;
  const result = solveSketch(s);
  assert.equal(result.converged, true);
  const xs = s.entities.map((e) => s.points.find((p) => p.id === e.a).x).sort((m, n) => m - n);
  assert.deepEqual(xs.map((x) => Math.round(x)), [0, 40, 60], "the first copy moved out to 60");
});

test("each copy keeps the shape of its source, not just one anchored corner", () => {
  const s = patternDoc();
  linearPatternEntities(s, ["L"], { count: 3, spacing: 20, direction: "u" });
  const len = (e) => {
    const a = s.points.find((p) => p.id === e.a), b = s.points.find((p) => p.id === e.b);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  // stretch the source; every copy must still be the same line
  s.points.find((p) => p.id === "b").y = 90;
  s.points.find((p) => p.id === "b").fixed = true;
  solveSketch(s);
  const lengths = s.entities.map(len);
  lengths.forEach((l) => assert.ok(Math.abs(l - lengths[0]) < 1e-3, `copies followed the source length, got ${lengths}`));
  assert.ok(Math.abs(lengths[0] - 90) < 1e-3);
});

test("patterning along V steps in the other axis", () => {
  const s = patternDoc();
  linearPatternEntities(s, ["L"], { count: 3, spacing: 15, direction: "v" });
  const copies = s.entities.slice(1).map((e) => s.points.find((p) => p.id === e.a));
  copies.forEach((p) => assert.ok(Math.abs(p.x) < 1e-9, "x is untouched"));
  assert.deepEqual(copies.map((p) => Math.round(p.y)).sort((m, n) => m - n), [15, 30]);
});

test("a pattern refuses nonsense input rather than making junk geometry", () => {
  const s = patternDoc();
  assert.equal(linearPatternEntities(s, ["L"], { count: 5, spacing: 0 }), null);
  assert.equal(linearPatternEntities(s, ["L"], { count: 5, spacing: NaN }), null);
  assert.equal(linearPatternEntities(s, ["gone"], { count: 5, spacing: 10 }), null);
  assert.equal(s.entities.length, 1, "nothing was added on any of those");
});

test("a pattern of one is still a pair, and an absurd count is capped", () => {
  const s = patternDoc();
  const made = linearPatternEntities(s, ["L"], { count: 1, spacing: 10 });
  assert.equal(made.copies.length, 1, "count clamps up to 2");
  const s2 = patternDoc();
  const big = linearPatternEntities(s2, ["L"], { count: 5000, spacing: 10 });
  assert.equal(big.copies.length, 199, "and down to 200");
});

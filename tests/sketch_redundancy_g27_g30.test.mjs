import test from "node:test";
import assert from "node:assert/strict";

import { collapsedEntityIds, pruneImpliedRelations, refusesAsRepeat, sketchEntitySizes, solveSketch } from "../js/sketch_solver.js";

/* LENSCAP ThreadSection as drawn in the editor (Top Plane, 3x the book, cm):
   a horizontal centerline from the right vertical centerline's middle to the
   point both left centerlines start from, and a closed trapezoid round them. */
function threadSection() {
  const P = { p156: [9.5, 4.9], p157: [6, 4.9], p160: [9.5, 4], p161: [9.5, 5.9], p164: [6, 3], p167: [6, 6.8] };
  const points = Object.entries(P).map(([id, [x, y]]) => ({ id, x, y }));
  const line = (id, a, b, construction = false) => ({ id, type: "line", a, b, construction });
  const entities = [
    line("L1", "p156", "p157", true), line("L2", "p160", "p161", true), line("L3", "p157", "p164", true), line("L4", "p157", "p167", true),
    line("L5", "p164", "p160"), line("L6", "p160", "p161"), line("L7", "p161", "p167"), line("L8", "p167", "p164"),
  ];
  const constraints = [
    { id: "h1", type: "horizontal", entity: "L1" }, { id: "v2", type: "vertical", entity: "L2" },
    { id: "v3", type: "vertical", entity: "L3" }, { id: "v4", type: "vertical", entity: "L4" },
  ];
  return { plane: "top", points, entities, constraints };
}

test("inferred Verticals the sketch already implies are not added (G27)", () => {
  const s = threadSection();
  s.constraints.push({ id: "v6", type: "vertical", entity: "L6" }, { id: "v8", type: "vertical", entity: "L8" });
  const dropped = pruneImpliedRelations(s, ["v6", "v8"]);
  assert.deepEqual(dropped.sort(), ["v6", "v8"]);
  assert.equal(solveSketch(s).redundant, false);
});

test("an inferred relation that removes a freedom is kept", () => {
  const s = threadSection();
  s.constraints.push({ id: "h5", type: "horizontal", entity: "L5" });
  assert.deepEqual(pruneImpliedRelations(s, ["h5"]), []);
  assert.ok(s.constraints.some((c) => c.id === "h5"));
});

test("a relation that only repeats the sketch is refused while freedoms remain (G27)", () => {
  const s = threadSection();
  s.constraints.push(
    { id: "mid", type: "midpoint", point: "p156", entity: "L2" },
    { id: "e23", type: "equal", a: "L2", b: "L3" }, { id: "e24", type: "equal", a: "L2", b: "L4" },
    { id: "e85", type: "equal", a: "L8", b: "L5" },
  );
  const previous = solveSketch(s);
  assert.equal(previous.redundant, false, JSON.stringify(previous));
  assert.ok(previous.degreesOfFreedom > 0);
  s.constraints.push({ id: "e87", type: "equal", a: "L8", b: "L7" });
  const report = solveSketch(s);
  assert.equal(report.degreesOfFreedom, previous.degreesOfFreedom, "the symmetry already made the slants equal");
  assert.equal(refusesAsRepeat(report, previous), true);
});

test("the book's ThreadSection relations define it fully with nothing repeated", () => {
  const s = threadSection();
  s.constraints.push(
    { id: "mid", type: "midpoint", point: "p156", entity: "L2" },
    { id: "e23", type: "equal", a: "L2", b: "L3" }, { id: "e24", type: "equal", a: "L2", b: "L4" },
    { id: "e85", type: "equal", a: "L8", b: "L5" },
    { id: "d", type: "distance", a: "p164", b: "p167", value: 0.3175 },
    { id: "pierce", type: "fixed", point: "p157", x: -6.223876, y: -3.2385 },
  );
  const report = solveSketch(s);
  assert.equal(report.status, "fully-constrained", JSON.stringify(report));
});

test("a relation that collapses a line is caught, not reported as solved (G30)", () => {
  const s = threadSection();
  s.constraints.push({ id: "mid", type: "midpoint", point: "p156", entity: "L2" }, { id: "v8", type: "vertical", entity: "L8" });
  solveSketch(s);
  const sizes = sketchEntitySizes(s);
  assert.deepEqual(collapsedEntityIds(s, sizes), []);
  s.constraints.push({ id: "h8", type: "horizontal", entity: "L8" });
  solveSketch(s);
  assert.ok(collapsedEntityIds(s, sizes).includes("L8"), "Horizontal on a Vertical line crushed it");
});

test("the Line tool drops its inferred Vertical when the line joins two vertical centerlines' ends (G27)", async () => {
  const { readFileSync } = await import("node:fs");
  const { inferLineRelations, constraintAlreadyPresent } = await import("../js/modeler_inference.js");
  const source = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
  const start = source.indexOf("function makeWallSegment("), end = source.indexOf("\nfunction finishWallChain(", start);
  const s = threadSection();
  s.entities = s.entities.filter((e) => e.id !== "L8");
  let next = 0;
  const uid = () => "n" + (++next);
  // snapping onto an existing point returns that point, as the editor does
  const point = (doc, p) => p.pointId || (() => { const id = uid(); doc.points.push({ id, x: p.u, y: p.v }); return id; })();
  const make = new Function("E", "sketchForView", "newSketchPoint", "uid", "sketchPoint", "inferTangentCircle", "inferLineRelations", "constraintAlreadyPresent", "resolveSketch", "pruneImpliedRelations", "solveSketch",
    source.slice(start, end) + ";return makeWallSegment;")(
    { wallWidth: 5, _osnap: null }, () => s, point, uid, (doc, id) => doc.points.find((p) => p.id === id), () => null,
    inferLineRelations, constraintAlreadyPresent, () => {}, pruneImpliedRelations, solveSketch);
  const line = make({ u: 6, v: 6.8, pointId: "p167" }, { u: 6, v: 3, pointId: "p164" });
  assert.ok(line);
  assert.equal(s.constraints.some((c) => c.type === "vertical" && c.entity === line.id), false, "the edge is vertical already");
  assert.equal(solveSketch(s).redundant, false);
});

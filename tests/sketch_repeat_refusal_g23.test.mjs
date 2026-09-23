import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { solveSketch, refusesAsRepeat } from "../js/sketch_solver.js";

// G23, HOUSING HandleProfile (units cm). The profile's mirror relations already
// state a few things twice (Symmetric about the vertical centerline and the
// Midpoint on the top line both put that midpoint on the centerline, and so
// on), which the solver rightly counts as redundant. While a freedom was left
// the status read "under-constrained", so none of that was ever refused; the
// first relation that took the last freedom turned the status "over-constrained"
// and was rolled back as a repeat, although it added an independent equation.
// The Pierce of Point6 is replaced by a fixed point at its bound target.
const P = [
  [-1.27, 6.35], [1.27, 6.35], [1.27, 6.096], [1.27, 5.842], [0, 0], [0, 6.35], [-1.27, 6.096],
  [-0.502, 6.096], [-1.27, 5.842], [1.27, 5.842], [-1.27, 6.096], [-1.27, 6.35], [-1.27, 5.842],
];

function handleProfile() {
  const points = P.map(([x, y], i) => ({ id: "p" + (i + 1), x, y }));
  const entities = [
    { id: "L1", type: "line", a: "p1", b: "p2" },
    { id: "A1", type: "arc", a: "p2", b: "p4", c: "p3" },
    { id: "L2", type: "line", a: "p5", b: "p6", construction: true },
    { id: "L3", type: "line", a: "p7", b: "p8", construction: true },
    { id: "L4", type: "line", a: "p9", b: "p10" },
    { id: "A2", type: "arc", a: "p13", b: "p12", c: "p11" },
  ];
  let n = 0;
  const c = (o) => ({ id: "c" + (++n), ...o });
  const constraints = [
    c({ type: "horizontal", entity: "L1" }), c({ type: "tangent", a: "L1", b: "A1" }), c({ type: "vertical", entity: "L2" }),
    c({ type: "horizontal", entity: "L3" }), c({ type: "radius", entity: "A1", value: 0.254 }), c({ type: "pointOnLine", point: "p3", entity: "L3" }),
    c({ type: "symmetric", a: "p1", b: "p9", entity: "L3" }), c({ type: "symmetric", a: "p2", b: "p10", entity: "L3" }), c({ type: "coincident", a: "p10", b: "p4" }),
    c({ type: "symmetric", a: "p1", b: "p2", entity: "L2" }), c({ type: "symmetric", a: "p3", b: "p11", entity: "L2" }), c({ type: "symmetric", a: "p2", b: "p12", entity: "L2" }),
    c({ type: "symmetric", a: "p4", b: "p13", entity: "L2" }), c({ type: "midpoint", point: "p6", entity: "L1" }), c({ type: "fixed", point: "p6", x: 0, y: 6.35 }),
    c({ type: "distance", a: "p11", b: "p3", value: 2.54 }), c({ type: "fixed", point: "p5", x: 0, y: 0 }), c({ type: "coincident", a: "p7", b: "p11" }),
  ];
  return { plane: "front", points, entities, constraints };
}

const pt = (s, id) => s.points.find((p) => p.id === id);

test("the drawn HandleProfile has one free construction end and redundancy it already carried", () => {
  const s = handleProfile();
  const r = solveSketch(s);
  assert.equal(r.converged, true);
  assert.equal(r.degreesOfFreedom, 1, JSON.stringify(r));
  assert.equal(r.status, "under-constrained");
  assert.equal(r.redundant, true);
  assert.ok(r.redundancy > 0, "redundancy is counted: " + r.redundancy);
  assert.ok(Math.abs(pt(s, "p8").x + 0.502) < 1e-9, "the right end of the horizontal centerline did not move");
});

for (const [label, relation] of [
  ["a two-point Vertical", { type: "vertical", a: "p8", b: "p3" }],
  ["a Coincident", { type: "coincident", a: "p8", b: "p3" }],
]) {
  test(label + " between the free centerline end and the arc centre is accepted and defines the sketch", () => {
    const before = handleProfile();
    const previous = solveSketch(before);
    const s = handleProfile();
    s.constraints.push({ id: "new", ...relation });
    const r = solveSketch(s);
    assert.equal(r.converged, true);
    assert.equal(r.degreesOfFreedom, 0, JSON.stringify(r));
    assert.equal(r.rank, previous.rank + 1, "the new relation adds an independent equation");
    assert.equal(refusesAsRepeat(r, previous), false, "it took the last freedom, so it is not a repeat");
    assert.ok(Math.abs(pt(s, "p8").x - 1.27) < 1e-9, "the end moved onto the arc centre: " + pt(s, "p8").x);
    assert.ok(Math.abs(pt(s, "p8").y - 6.096) < 1e-9);
  });
}

test("a relation that only repeats what is already set is still refused", () => {
  const defined = handleProfile();
  defined.constraints.push({ id: "v", type: "vertical", a: "p8", b: "p3" });
  const previous = solveSketch(defined);
  assert.equal(previous.degreesOfFreedom, 0);
  const s = structuredClone(defined);
  s.constraints.push({ id: "again", type: "horizontal", a: "p1", b: "p2" }); // L1 is already horizontal
  const r = solveSketch(s);
  assert.equal(r.status, "over-constrained");
  assert.ok(r.redundancy > previous.redundancy, "one more dependent row");
  assert.equal(refusesAsRepeat(r, previous), true);
});

test("without a previous report an over-constrained result is refused as before", () => {
  const s = handleProfile();
  s.constraints.push({ id: "new", type: "vertical", a: "p8", b: "p3" });
  const r = solveSketch(s);
  assert.equal(refusesAsRepeat(r, null), true);
  assert.equal(refusesAsRepeat(r, { diagnostics: false, degreesOfFreedom: null, redundancy: null }), true);
  assert.equal(refusesAsRepeat({ ...r, status: "under-constrained" }, null), false, "only an over-constrained result is a repeat");
  assert.equal(refusesAsRepeat({ ...r, status: "fully-constrained" }, null), false);
});

/* --- the editor wiring ---------------------------------------------------- */

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");

test("resolveSketch rolls back an over-constrained edit only when it is a repeat of what was already set", () => {
  const body = modeler.slice(modeler.indexOf("function resolveSketch("), modeler.indexOf("function syncSketchDrivenParts("));
  assert.match(body, /var previousReport = E\._solveSketchId === sketch\.id && E\.solveInfo && E\.solveInfo\.degreesOfFreedom != null \? E\.solveInfo : null;/, "the last full report for this sketch is kept before the solve");
  assert.match(body, /if \(before && \(E\.solveInfo\.status === "conflicting" \|\| refusesAsRepeat\(E\.solveInfo, previousReport\)/, "the rollback asks refusesAsRepeat");
  assert.match(body, /collapsedEntityIds\(sketch, before\.sizes\)\.length/, "an edit that crushes a drawn entity is rolled back too (G30)");
  assert.doesNotMatch(body, /if \(before && \(E\.solveInfo\.status === "conflicting" \|\| E\.solveInfo\.status === "over-constrained"\)\)/, "no blanket over-constrained rollback");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { dimensionHitYieldsToPoint, hitSketchDimensionHit } from "../js/sketch_dimensions.js";

// HOUSING HandleProfile (step ~500): "Dimension the two arc centres 1.000 in."
// The R .100 dimension's leader runs out of the right arc's centre, and its
// 10 px band swallowed every click on that centre, so the second centre could
// never be picked. In SOLIDWORKS a sketch point under the cursor wins over a
// dimension leader; only the label itself is grabbed first.
const toPx = (x, y) => ({ x: 400 + x * 35, y: 300 - y * 35 });

function handleProfile() {
  return {
    points: [
      { id: "c2", x: 1.2, y: 6.096 }, { id: "t2", x: 1.2, y: 6.35 }, { id: "b2", x: 1.2, y: 5.842 },
      { id: "c6", x: -1.2, y: 6.096 },
    ],
    entities: [{ id: "arc2", type: "arc", c: "c2", a: "b2", b: "t2" }],
    constraints: [{ id: "r", type: "radius", entity: "arc2", value: 0.254 }],
  };
}

test("a click on the arc centre lands on the radius leader", () => {
  const s = handleProfile();
  const centre = toPx(1.2, 6.096);
  const hit = hitSketchDimensionHit(s, centre.x, centre.y, toPx, 10);
  assert.equal(hit?.constraint.id, "r");
  assert.equal(hit?.kind, "line", "the centre is on the leader, not in the label");
});

test("a sketch point under the cursor wins over a dimension leader", () => {
  const s = handleProfile();
  const centre = toPx(1.2, 6.096);
  const hit = hitSketchDimensionHit(s, centre.x, centre.y, toPx, 10);
  assert.equal(dimensionHitYieldsToPoint(hit, s.points[0]), null, "the arc centre is picked instead");
});

test("the label is still grabbed first, and a leader with nothing under it still drags", () => {
  const s = handleProfile();
  const label = { constraint: s.constraints[0], kind: "label" };
  assert.equal(dimensionHitYieldsToPoint(label, s.points[0]), label, "the label keeps the click");
  const leader = { constraint: s.constraints[0], kind: "line" };
  assert.equal(dimensionHitYieldsToPoint(leader, null), leader, "no point under the cursor");
  // an entity (not a point) under the cursor does not take a leader's click
  assert.equal(dimensionHitYieldsToPoint(leader, { id: "arc2", type: "arc" }), leader);
  assert.equal(dimensionHitYieldsToPoint(null, s.points[0]), null);
});

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");

test("the Select and Dimension tools ask the rule before grabbing a dimension", () => {
  assert.match(
    modeler,
    /var sketchDim = dimensionHitYieldsToPoint\(placedDimensionHit\(ensureSketch\(E\.def\), dimLocalX, dimLocalY\), hitSketch\(uv, e\.pointerType\)\);/,
    "a leader hit gives way to the sketch point under the pointer",
  );
});

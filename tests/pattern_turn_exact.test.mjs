/* A pattern copy's OWN turn, on the exact side.
 *
 * rotatePatternPart records a circular or curve copy's turn on the part as
 * `patternRotations`; buildPart nests it as THREE groups around the whole body,
 * so the VIEWPORT was always right. The exact feature tree emitted no row for
 * it at all, so STEP/IGES export, mass properties and interference rebuilt
 * every circular and curve copy at the SEED's angle — translated but never
 * turned. Linear patterns never showed it: placePatternCopy/movePart bake a
 * linear offset into the definition, and there is no turn to lose. A curve copy
 * is the half-and-half case: the translation is baked, the turn was not.
 *
 * WHY THE SEED IS AN L. Total volume is identical whether or not the copies are
 * turned — a rigid transform preserves it — so volume cannot see this bug at
 * all, and a CUBE patterned about its own axis is very nearly invariant under
 * the turn as well. Every assertion below is therefore on POSITION, of a shape
 * with no rotational symmetry whatsoever.
 */
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  circularPatternStepDegrees, curvePatternPlacements, patternPlacementTransform,
  RIGID_IDENTITY, rigidTransformIsIdentity,
} from "../js/core/pattern_geometry.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { cloneData, exactBrepForPart, partPatternRotations, partPatternTransform, placePatternCopy } from "../js/modeler_part_geometry.js";
import { disposeBrep, loadCadKernel, placeBrep } from "../js/cad_kernel.js";

const modeler = (modelerSource()).replace(/\r\n/g,"\n");
const tree = readFileSync(new URL("../js/cad_feature_tree.js", import.meta.url), "utf8");

const centroid = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try {
    oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false);
    const point = props.CentreOfMass();
    try { return { x:point.X(), y:point.Y(), z:point.Z() }; } finally { point.delete(); }
  } finally { props.delete(); }
};

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

/* The corner box, in the SHAPE's own frame: x from Xmin, z from Zmin. It is
   the arm nothing else is under, so it moves distinctly under any turn. */
const bounds = async (brep) => {
  const oc = await loadCadKernel(), box = new oc.Bnd_Box_1();
  try {
    oc.BRepBndLib.Add(brep.shape, box, true);
    const min = box.CornerMin(), max = box.CornerMax();
    try { return { x0:min.X(), y0:min.Y(), z0:min.Z(), x1:max.X(), y1:max.Y(), z1:max.Z() }; }
    finally { min.delete(); max.delete(); }
  } finally { box.delete(); }
};

const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const boxApart = (a, b) => Math.max(...["x0", "y0", "z0", "x1", "y1", "z1"].map((key) => Math.abs(a[key] - b[key])));

/* An L, 20 long on each arm and 6 wide, extruded 8 tall — no rotational
   symmetry of any order, so its centre of mass alone pins its angle. */
const L_SEED = {
  kind:"ext", id:"l-seed", axis:"y", from:0, to:8,
  pts:[{u:40, v:-10}, {u:60, v:-10}, {u:60, v:-4}, {u:46, v:-4}, {u:46, v:10}, {u:40, v:10}],
};

/* The rows rebuildFeatureTreeFromDocument writes for one such part: the
   extrude, then the part's own pattern turn OUTSIDE it. Passing `false` for the
   turn is the pre-fix tree, kept as the control every case asserts against —
   the numbers it produces are the bug. */
function partFeatures(part, withTurn) {
  const features = [{ id:"body", type:"extrude", name:"Extrude", inputs:[], references:[],
    params:{ axis:part.axis, from:part.from, to:part.to, points:cloneData(part.pts) } }];
  const turn = partPatternTransform(part);
  if (withTurn && !rigidTransformIsIdentity(turn)) features.push({
    id:"body:pattern-turn", type:"transformBody", name:"Pattern turn", inputs:["body"], references:[],
    params:{ matrix:turn.matrix.slice(), translation:{ ...turn.translation } },
  });
  return { featureVersion:1, features };
}

async function treeAnswer(part, withTurn) {
  const run = await regenerateFeatures(partFeatures(part, withTurn));
  try {
    assert.ok(run.ok, JSON.stringify(run.issues));
    return { centre:await centroid(run.finalShape), box:await bounds(run.finalShape), volume:await volume(run.finalShape) };
  } finally { releaseRegeneration(run); }
}

/* What buildPart draws: exactBrepForPart, then the rotation groups around it. */
async function viewportAnswer(part) {
  const body = await exactBrepForPart(part);
  let turned = null;
  try {
    turned = await placeBrep(body, partPatternTransform(part));
    return { centre:await centroid(turned), box:await bounds(turned), volume:await volume(turned) };
  } finally { disposeBrep(body); if (turned) disposeBrep(turned); }
}

/* Where the copy belongs: the seed's own solid under the placement transform,
   which is the one answer patternPlacementTransform gives every consumer. */
async function laidAnswer(params, placement, step) {
  const body = await exactBrepForPart(L_SEED);
  let placed = null;
  try {
    placed = await placeBrep(body, patternPlacementTransform(params, placement, step));
    return { centre:await centroid(placed), box:await bounds(placed), volume:await volume(placed) };
  } finally { disposeBrep(body); if (placed) disposeBrep(placed); }
}

/* --- circular: the whole transform is the turn --------------------------- */

const RING = { mode:"circular", axis:"y", count:4, angle:360, equalSpacing:true, radialDistance:0 };
const RING_STEP = circularPatternStepDegrees(RING, RING.count) * Math.PI / 180;

test("every circular copy is EXPORTED at its own angle, not at the seed's", async () => {
  for (const index of [1, 2, 3]) {
    const placement = { circularIndex:index, instance:index };
    const copy = placePatternCopy(cloneData(L_SEED), RING, placement, RING_STEP);
    assert.equal(partPatternRotations(copy).length, 1, "a circular copy carries exactly one turn");

    const laid = await laidAnswer(RING, placement, RING_STEP);
    const withTurn = await treeAnswer(copy, true);
    const withoutTurn = await treeAnswer(copy, false);

    assert.ok(apart(withTurn.centre, laid.centre) < 1e-6,
      "copy " + index + ": the exact tree puts it where it was laid, " + JSON.stringify(withTurn.centre) + " vs " + JSON.stringify(laid.centre));
    assert.ok(boxApart(withTurn.box, laid.box) < 1e-6, "copy " + index + ": and at the same extent");

    // the control: the tree WITHOUT the turn row is the bug, and it is far away
    assert.ok(apart(withoutTurn.centre, laid.centre) > 1,
      "copy " + index + ": an unturned copy must land elsewhere, " + apart(withoutTurn.centre, laid.centre).toFixed(3) + " cm");
    // and volume cannot tell the two apart, which is why position is asserted
    assert.ok(Math.abs(withoutTurn.volume - laid.volume) < 1e-6,
      "copy " + index + ": volume is blind to the turn — " + withoutTurn.volume + " either way");
  }
});

test("the exact tree and the viewport describe one circular copy", async () => {
  const placement = { circularIndex:2, instance:2 };
  const copy = placePatternCopy(cloneData(L_SEED), RING, placement, RING_STEP);
  const drawn = await viewportAnswer(copy), exported = await treeAnswer(copy, true);
  assert.ok(apart(drawn.centre, exported.centre) < 1e-6,
    "viewport " + JSON.stringify(drawn.centre) + " vs exact tree " + JSON.stringify(exported.centre));
  assert.ok(boxApart(drawn.box, exported.box) < 1e-6, "and the same bounds");
});

/* --- curve: the translation was baked, the turn was not ------------------ */

const ARC_PATH = Array.from({ length:24 }, (_, i) => {
  const a = -Math.PI / 2 + (i / 23) * (Math.PI / 2);
  return { x:5 + 60 * Math.cos(a), y:0, z:60 + 60 * Math.sin(a) };
});
const ARC = { mode:"curve", path:ARC_PATH, curveCount:6, curveAlign:"tangent" };

test("a curve copy is exported turned as well as moved", async () => {
  const placements = curvePatternPlacements(ARC);
  assert.ok(placements.length >= 3, "the arc must produce copies to check");
  for (const placement of placements.slice(1, 4)) {
    const copy = placePatternCopy(cloneData(L_SEED), ARC, placement, 0);
    assert.equal(partPatternRotations(copy).length, 3, "a tangent-aligned curve copy carries three axis turns");

    const laid = await laidAnswer(ARC, placement, 0);
    const withTurn = await treeAnswer(copy, true);
    const withoutTurn = await treeAnswer(copy, false);

    assert.ok(apart(withTurn.centre, laid.centre) < 1e-6,
      "station " + placement.instance + ": " + JSON.stringify(withTurn.centre) + " vs " + JSON.stringify(laid.centre));
    assert.ok(boxApart(withTurn.box, laid.box) < 1e-6, "station " + placement.instance + ": same extent");

    /* The half-and-half control: the translation IS baked, so the unturned tree
       is not wildly adrift the way the circular one is — it is at the right
       station facing the wrong way. That is precisely why this case is the one
       most easily got wrong, and why the assertion is on the bounding box as
       well as on the centre. */
    assert.ok(apart(withoutTurn.centre, laid.centre) > 0.5,
      "station " + placement.instance + ": unturned centre is " + apart(withoutTurn.centre, laid.centre).toFixed(3) + " cm out");
    assert.ok(boxApart(withoutTurn.box, laid.box) > 1,
      "station " + placement.instance + ": and it faces the wrong way, " + boxApart(withoutTurn.box, laid.box).toFixed(3) + " cm on an extent");
  }
});

test("the exact tree and the viewport describe one curve copy", async () => {
  const placement = curvePatternPlacements(ARC)[2];
  const copy = placePatternCopy(cloneData(L_SEED), ARC, placement, 0);
  const drawn = await viewportAnswer(copy), exported = await treeAnswer(copy, true);
  assert.ok(apart(drawn.centre, exported.centre) < 1e-6,
    "viewport " + JSON.stringify(drawn.centre) + " vs exact tree " + JSON.stringify(exported.centre));
  assert.ok(boxApart(drawn.box, exported.box) < 1e-6, "and the same bounds");
});

/* --- linear stays exactly as it was -------------------------------------- */

test("a linear copy carries no turn, so no row is emitted for it", async () => {
  const copy = placePatternCopy(cloneData(L_SEED), { mode:"linear" }, { x:30, y:0, z:0, instance:1 }, 0);
  assert.deepEqual(partPatternRotations(copy), [], "a linear offset is baked into the definition");
  assert.ok(rigidTransformIsIdentity(partPatternTransform(copy)), "and its turn is the identity");
  assert.equal(partFeatures(copy, true).features.length, 1, "so the tree is the one body row it always was");
  const answer = await treeAnswer(copy, true);
  assert.ok(Math.abs(answer.box.x0 - (L_SEED.pts[0].u + 30)) < 1e-6, "moved, not turned: " + answer.box.x0);
});

/* --- the wiring ---------------------------------------------------------- */

test("the pattern turn is emitted last, outside the merges and the finishes", () => {
  const emit = modeler.match(/function emitPartPatternTurn\([\s\S]*?\n\}\n/)[0];
  assert.match(emit, /partPatternTransform\(part\)/, "one shared answer, not a second composition");
  assert.match(emit, /rigidTransformIsIdentity\(turn\)/, "an unturned part emits no row");
  assert.match(emit, /type:"transformBody"/);
  const rebuild = modeler.match(/function rebuildFeatureTreeFromDocument\([\s\S]*?\n\}\n/)[0];
  const merges = rebuild.indexOf("emitPartMerges(target, part, feature)");
  const finishes = rebuild.indexOf("exactOperations.forEach");
  const turn = rebuild.indexOf("emitPartPatternTurn(target, part, feature)");
  assert.ok(merges > 0 && finishes > merges && turn > finishes,
    "the turn wraps the finished body: merges " + merges + ", finishes " + finishes + ", turn " + turn);
  assert.match(tree, /else if \(feature\.type === "transformBody"\) \{/);
  assert.match(tree, /result = await placeBrep\(source, effectiveParams\);/);
});

test("patternRotationTransform composes in buildPart's order", () => {
  /* buildPart walks the list from the END, adding each turn as a group AROUND
     what it has so far, so the world transform is R[n-1] . ... . R[0]. A
     reversed composition is the classic silent failure — it is correct for a
     single rotation, which is every circular copy, and wrong for the three a
     curve copy carries. Two turns about different pivots that do not commute
     are the smallest case that can tell. */
  const build = modeler.match(/function buildPart\(g, p, displayStyle, presentationOnly = false\) \{[\s\S]*?var opt = \{/)[0];
  assert.match(build, /for\(var rotationIndex=rotations\.length-1;rotationIndex>=0;rotationIndex--\)/,
    "newest turn outermost");
  const rotations = [{ axis:"y", angle:0.7, pivot:{ x:12, y:0, z:0 } }, { axis:"x", angle:-0.4, pivot:{ x:0, y:5, z:-3 } }];
  const composed = partPatternTransform({ patternRotations:rotations });
  // R[1] . R[0] applied to a point, written out the long way
  const single = (rotation) => partPatternTransform({ patternRotations:[rotation] });
  const inner = single(rotations[0]), outer = single(rotations[1]);
  const point = { x:3, y:-6, z:9 };
  const step = (transform, q) => ({
    x:transform.matrix[0] * q.x + transform.matrix[1] * q.y + transform.matrix[2] * q.z + transform.translation.x,
    y:transform.matrix[3] * q.x + transform.matrix[4] * q.y + transform.matrix[5] * q.z + transform.translation.y,
    z:transform.matrix[6] * q.x + transform.matrix[7] * q.y + transform.matrix[8] * q.z + transform.translation.z,
  });
  const expected = step(outer, step(inner, point)), actual = step(composed, point);
  assert.ok(apart(expected, actual) < 1e-12, JSON.stringify(actual) + " vs " + JSON.stringify(expected));
  // and the reversed order really is a different answer, so this test can fail
  const reversed = step(inner, step(outer, point));
  assert.ok(apart(reversed, expected) > 1, "the two orders must be distinguishable: " + apart(reversed, expected).toFixed(3));
  assert.ok(rigidTransformIsIdentity(RIGID_IDENTITY));
});

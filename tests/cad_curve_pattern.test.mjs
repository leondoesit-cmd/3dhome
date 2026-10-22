/* Pattern along a sketched curve.
 *
 * The layout enum gained a third member rather than the codebase gaining a
 * third feature: linear, circular and curve differ only in where the stations
 * are, and everything downstream of that — the skip list, the 128 cap, the
 * merge box, the seed selection — is shared.
 *
 * ORIENTATION. Instance i is turned by the rotation that carries the FIRST
 * station's frame onto station i's, using pathFrames()' parallel-transport
 * frame. The tests below hold that to three things it must not do: spin on a
 * straight run (Frenet's failure), flip through an inflection (Frenet's other
 * failure), and disagree with itself between the two transforms a placement
 * carries — the three axis rotations the viewport applies and the single rigid
 * matrix the kernel is handed.
 */
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { featureDefaults, featureSpec, validateFeatureDefinition } from "../js/core/feature_catalog.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import {
  LINEAR_PATTERN_INSTANCE_LIMIT, curvePatternPath, curvePatternPlacements, rotatePointAroundAxis,
} from "../js/core/pattern_geometry.js";
import { pathFrames } from "../js/core/profile_curves.js";
import { curvePatternBrep, disposeBrep, loadCadKernel, makeBrepPrimitive } from "../js/cad_kernel.js";

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const bounds = async (brep) => {
  const oc = await loadCadKernel(), box = new oc.Bnd_Box_1();
  try {
    oc.BRepBndLib.AddOptimal(brep.shape, box, false, true);
    const min = box.CornerMin(), max = box.CornerMax();
    try { return { x0:min.X(), y0:min.Y(), z0:min.Z(), x1:max.X(), y1:max.Y(), z1:max.Z() }; }
    finally { min.delete(); max.delete(); }
  } finally { box.delete(); }
};

const line = (length, count = 20) => Array.from({ length: count + 1 }, (_, i) => ({ x: (length * i) / count, y: 0, z: 0 }));
const quarter = (radius, count = 64) => Array.from({ length: count + 1 }, (_, i) => {
  const a = (i / count) * (Math.PI / 2);
  return { x: radius * Math.cos(a), y: 0, z: radius * Math.sin(a) };
});
// an S in the XZ plane: two opposed arcs, so the curve has a real inflection
const ess = (radius, count = 64) => {
  const first = Array.from({ length: count + 1 }, (_, i) => {
    const a = (i / count) * Math.PI;
    return { x: radius - radius * Math.cos(a), y: 0, z: radius * Math.sin(a) };
  });
  const second = Array.from({ length: count }, (_, i) => {
    const a = ((i + 1) / count) * Math.PI;
    return { x: 2 * radius + radius * Math.cos(a) - radius, y: 0, z: -radius * Math.sin(a) };
  }).map((p) => ({ x: p.x + 2 * radius, y: 0, z: p.z }));
  return first.concat(second);
};

// the rotation the placement asks the viewport for, applied to a vector
const turn = (placement, vector) => {
  let v = { ...vector };
  placement.rotations.forEach((rotation) => { v = rotatePointAroundAxis(v, rotation.axis, rotation.angle, { x: 0, y: 0, z: 0 }); });
  return v;
};

const apply = (placement, point) => ({
  x: placement.matrix[0] * point.x + placement.matrix[1] * point.y + placement.matrix[2] * point.z + placement.translation.x,
  y: placement.matrix[3] * point.x + placement.matrix[4] * point.y + placement.matrix[5] * point.z + placement.translation.y,
  z: placement.matrix[6] * point.x + placement.matrix[7] * point.y + placement.matrix[8] * point.z + placement.translation.z,
});

const near = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

/* --- the catalogue entry ------------------------------------------------- */

test("curve is a third layout of the one pattern feature", () => {
  const spec = featureSpec("pattern");
  const mode = spec.editor.groups.flatMap((group) => group.fields).find((field) => field.key === "mode");
  assert.deepEqual(mode.choices.map((choice) => choice.value), ["linear", "circular", "curve"]);
  assert.deepEqual(spec.parameters.mode.values, ["linear", "circular", "curve"]);
  const defaults = featureDefaults("pattern");
  ["curveCount", "curveSpacingMode", "curveSpacing", "curveAlign"].forEach((key) => {
    assert.ok(key in defaults, key + " has a default");
    assert.ok(spec.parameters[key], key + " is a declared parameter");
    assert.ok(spec.editor.groups.flatMap((group) => group.fields).some((field) => field.key === key), key + " is on the form");
  });
  assert.equal(spec.parameters.curveCount.max, LINEAR_PATTERN_INSTANCE_LIMIT, "the declared cap is the pattern's own 128");
  // A linear or circular pattern names no sketch and must keep validating.
  assert.deepEqual(validateFeatureDefinition({
    id: "p1", type: "pattern", params: featureDefaults("pattern"), references: { features: ["f0"] },
  }).filter((issue) => issue.severity === "error"), []);
  assert.deepEqual(validateFeatureDefinition({
    id: "p2", type: "pattern", params: { ...featureDefaults("pattern"), mode: "curve" },
    references: { features: ["f0"], sketches: ["s1"] },
  }).filter((issue) => issue.severity === "error"), []);
});

/* --- the layout ---------------------------------------------------------- */

test("fitting the copies to the curve spreads them by arc length, seed excluded", () => {
  const placements = curvePatternPlacements({ path: line(30), curveCount: 4 });
  assert.equal(placements.length, 3, "four instances means three copies beside the seed");
  assert.deepEqual(placements.map((placement) => Math.round(placement.x)), [10, 20, 30]);
  assert.deepEqual(placements.map((placement) => placement.instance), [1, 2, 3]);
  assert.ok(placements.every((placement) => near(placement.y, 0) && near(placement.z, 0)));
});

test("a fixed arc spacing walks from the start and stops at the end of the curve", () => {
  const placements = curvePatternPlacements({ path: line(30), curveCount: 20, curveSpacingMode: "spacing", curveSpacing: 7 });
  assert.deepEqual(placements.map((placement) => Math.round(placement.x)), [7, 14, 21, 28],
    "it stops at the end of the run instead of piling copies on the last point");
});

test("arc spacing is measured along the curve, not across the chord", () => {
  const radius = 10, placements = curvePatternPlacements({ path: quarter(radius), curveCount: 3 });
  const half = placements[0];
  // half of a quarter turn: 45 degrees round, not the midpoint of the chord
  assert.ok(near(half.x, radius * Math.cos(Math.PI / 4) - radius, 0.02), "x " + half.x);
  assert.ok(near(half.z, radius * Math.sin(Math.PI / 4), 0.02), "z " + half.z);
});

test("the skip list and the 128 cap apply to the curve layout too", () => {
  const skipped = curvePatternPlacements({ path: line(40), curveCount: 5, skipInstances: "2, 4" });
  assert.deepEqual(skipped.map((placement) => placement.instance), [1, 3]);
  const capped = curvePatternPlacements({ path: line(40), curveCount: 5000 });
  assert.equal(capped.length, LINEAR_PATTERN_INSTANCE_LIMIT - 1, "128 instances including the seed");
});

test("a path with no length, or with fewer than two distinct points, produces nothing", () => {
  assert.deepEqual(curvePatternPlacements({ path: [] }), []);
  assert.deepEqual(curvePatternPlacements({ path: [{ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }] }), []);
  assert.deepEqual(curvePatternPath({ path: [{ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }] }).length, 1, "repeats weld");
});

/* --- orientation --------------------------------------------------------- */

test("a straight run does not spin the copies, which is why the frame is not Frenet", () => {
  const placements = curvePatternPlacements({ path: line(30), curveCount: 4 });
  placements.forEach((placement) => {
    placement.rotations.forEach((rotation) => assert.ok(near(rotation.angle, 0, 1e-9), "angle " + rotation.angle));
    assert.deepEqual(placement.matrix.map((value) => Math.round(value)), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

test("along a curve each copy is turned onto that station's tangent", () => {
  const path = quarter(10), frames = pathFrames(path);
  const placements = curvePatternPlacements({ path, curveCount: 5 });
  placements.forEach((placement) => {
    const carried = turn(placement, frames[0].tangent);
    const station = frames.reduce((best, frame) => Math.abs(frame.distance - placement.distance) < Math.abs(best.distance - placement.distance) ? frame : best);
    ["x", "y", "z"].forEach((axis) => assert.ok(near(carried[axis], station.tangent[axis], 0.02),
      "instance " + placement.instance + " tangent " + axis + ": " + carried[axis] + " vs " + station.tangent[axis]));
  });
});

test("the normal is carried across an inflection instead of flipping through it", () => {
  const path = ess(10), frames = pathFrames(path);
  const placements = curvePatternPlacements({ path, curveCount: 25 });
  let previous = frames[0].normal;
  placements.forEach((placement) => {
    const carried = turn(placement, frames[0].normal);
    const along = carried.x * previous.x + carried.y * previous.y + carried.z * previous.z;
    // Frenet's normal jumps to its opposite at the inflection; this must not.
    assert.ok(along > 0.5, "instance " + placement.instance + " kept its up vector (dot " + along + ")");
    previous = carried;
  });
});

test("keeping the seed's orientation moves the copies without turning them", () => {
  const placements = curvePatternPlacements({ path: quarter(10), curveCount: 4, curveAlign: "none" });
  placements.forEach((placement) => {
    assert.deepEqual(placement.rotations, []);
    assert.deepEqual(placement.matrix, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    assert.ok(near(placement.translation.x, placement.x) && near(placement.translation.z, placement.z),
      "and the rigid transform is the same plain offset");
  });
});

test("the viewport's three rotations and the kernel's matrix describe the same placement", () => {
  const path = ess(6), frames = pathFrames(path), base = frames[0].origin;
  const placements = curvePatternPlacements({ path, curveCount: 7 });
  const probe = { x: base.x + 1.5, y: base.y - 0.75, z: base.z + 0.25 };
  placements.forEach((placement) => {
    // viewport: translate by the offset, then turn about the station
    const moved = { x: probe.x + placement.x, y: probe.y + placement.y, z: probe.z + placement.z };
    let viewport = moved;
    placement.rotations.forEach((rotation) => { viewport = rotatePointAroundAxis(viewport, rotation.axis, rotation.angle, rotation.pivot); });
    const kernel = apply(placement, probe);
    ["x", "y", "z"].forEach((axis) => assert.ok(near(viewport[axis], kernel[axis], 1e-9),
      "instance " + placement.instance + " " + axis + ": " + viewport[axis] + " vs " + kernel[axis]));
  });
});

/* --- lowering to the kernel ---------------------------------------------- */

test("a curve pattern lowers to its own kernel op rather than to a grid of offsets", () => {
  const document = {
    features: [
      { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:2, h:2, d:2 } },
      { id: "p1", type: "pattern", name: "Pattern", inputs: ["b1"], references: { features: ["b1"], sketches: ["s1"] },
        params: { ...featureDefaults("pattern"), mode: "curve", curveCount: 4, path: quarter(10) } },
    ],
    history: [
      { id: "history:feature:b1", kind: "feature", targetId: "b1", name: "Box", status: "pending" },
      { id: "history:feature:p1", kind: "feature", targetId: "p1", name: "Pattern", status: "pending" },
    ],
  };
  const compiled = compileKernelFeatureTree(document);
  const lowered = compiled.features.find((feature) => feature.id === "p1");
  assert.equal(lowered.type, "curvePattern", "not linearGridPattern, which would drop every turn");
  assert.equal(lowered.params.placements.length, 3);
  lowered.params.placements.forEach((placement) => {
    assert.equal(placement.matrix.length, 9);
    assert.ok(placement.translation && Number.isFinite(placement.translation.x));
  });
});

/* --- the real kernel ----------------------------------------------------- */

test("the kernel places one turned copy per station and keeps every one solid", async () => {
  const seed = await makeBrepPrimitive({ type: "box", x: -1, y: -1, z: -1, w: 2, h: 2, d: 2 });
  let patterned = null;
  try {
    const placements = curvePatternPlacements({ path: line(30), curveCount: 4 });
    patterned = await curvePatternBrep(seed, { placements });
    assert.ok(near(await volume(patterned), 8 * 4, 1e-6), "four separate 2x2x2 cubes");
    const box = await bounds(patterned);
    assert.ok(near(box.x0, -1) && near(box.x1, 31), "the run reaches from the seed to the far station");
  } finally { disposeBrep(seed); if (patterned) disposeBrep(patterned); }
});

test("a rigid transform is what the kernel gets: the copies turn but do not grow", async () => {
  // A slab, so a copy that was rotated is measurably somewhere a translated one
  // would not be, and one that was scaled or skewed weighs the wrong amount.
  const seed = await makeBrepPrimitive({ type: "box", x: 8, y: -0.5, z: -0.5, w: 4, h: 1, d: 1 });
  let patterned = null;
  try {
    const placements = curvePatternPlacements({ path: quarter(10), curveCount: 3 });
    patterned = await curvePatternBrep(seed, { placements });
    assert.ok(near(await volume(patterned), 4 * 3, 1e-6), "three slabs of exactly the seed's volume");
    const box = await bounds(patterned);
    // the last copy stands at the top of the quarter turn, pointing up the Z
    assert.ok(box.z1 > 11, "a copy really was turned onto the curve (z1 " + box.z1 + ")");
    assert.ok(near(box.y0, -0.5) && near(box.y1, 0.5), "and nothing left the plane of the curve");
  } finally { disposeBrep(seed); if (patterned) disposeBrep(patterned); }
});

test("a placement with no transform fails loudly instead of stacking a copy on the seed", async () => {
  const seed = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 });
  try {
    await assert.rejects(curvePatternBrep(seed, { placements: [{ x: 1, y: 0, z: 0 }] }), /no transform/);
    await assert.rejects(curvePatternBrep(null, { placements: [] }), /seed is unavailable/);
  } finally { disposeBrep(seed); }
});

/* --- the editor wiring --------------------------------------------------- */

const modeler = modelerSource();
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");

test("the editor lays every pattern copy through one placement helper", () => {
  assert.match(partGeometry, /function placePatternCopy\(copy, params, placement, circularStep\)/);
  /* Preview, apply and document rebuild must not drift apart again. Apply and
     rebuild now share layPatternCopies (see cad_pattern_merge.test.mjs), so the
     three sites are the helper's definition, the live preview and that one
     layer — one fewer place to drift, not one more. */
  assert.equal(((modeler + partGeometry).match(/placePatternCopy\(/g) || []).length, 3);
  assert.match(modeler, /function layPatternCopies\(/);
  assert.match(modeler, /if\(params && params\.mode==="curve"\)return curvePatternPlacements\(resolvePatternCurvePath\(params\)\);/);
});

test("only an open Pattern command may sample the selected sketch for its curve", () => {
  assert.match(modeler, /if\(!E\.authoring \|\| E\.authoring\.featureType!=="pattern" \|\| E\.authoring\.featureEdit\)return params;/);
  assert.match(modeler, /patternNeedCurve/);
});

/* Pattern "Merge instances" — the seventh and last declared-but-ignored control.
 *
 * quickPatternPart() called addPart() once per copy and never read mergeResult,
 * so the box was inert: you always got N separate bodies. It now means what a
 * CAD modeller means by it — copies that share material become ONE solid and
 * the wall between them goes, copies that reach nothing stay their own body —
 * and the body COUNT is therefore the geometry's answer, not the flag's.
 *
 * The load-bearing assertions below are the three that distinguish a real
 * boolean fuse from a grouping: an overlapping run comes out as one body whose
 * volume is STRICTLY LESS than the sum of its copies (shared material counted
 * once, internal wall gone), a spread run comes out as N bodies summing to
 * N x seed, and a partly overlapping run comes out as exactly the number of
 * clusters the geometry forms — not 1 and not N.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { featureDefaults } from "../js/core/feature_catalog.js";
import { patternPlacementTransform, rotatePointAroundAxis, circularPatternStepDegrees } from "../js/core/pattern_geometry.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { placedBodyBrep } from "../js/modeler_part_geometry.js";
import {
  brepConnectedGroups, brepsOverlap, disposeBrep, extractBrepTopology, filletBrep,
  loadCadKernel, makeBrepPrimitive, placeBrep, shellBrep,
} from "../js/cad_kernel.js";

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
const strings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const solidCount = async (brep) => {
  const oc = await loadCadKernel();
  const explorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  try { while (explorer.More()) { n++; explorer.Next(); } } finally { explorer.delete(); }
  return n;
};

const faceCount = async (brep) => {
  const oc = await loadCadKernel();
  const explorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  try { while (explorer.More()) { n++; explorer.Next(); } } finally { explorer.delete(); }
  return n;
};

// a 10 x 10 x 10 cube at the origin: the seed every case below patterns
const CUBE = { kind: "box", id: "seed", x0: 0, x1: 10, y0: 0, y1: 10, z0: 0, z1: 10 };
const CUBE_VOLUME = 1000;
const along = (x) => ({ matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: { x, y: 0, z: 0 } });
const boundsAt = (x) => ({ x0: x, x1: x + 10, y0: 0, y1: 10, z0: 0, z1: 10 });

/* --- what the fuse actually produces ------------------------------------ */

test("overlapping copies fuse to ONE body of strictly less than their sum", async () => {
  // three cubes at 0, 6, 12: each shares a 4-thick slab with the next
  let fused = null;
  try {
    fused = await placedBodyBrep({ part: CUBE, placements: [along(0), along(6), along(12)] });
    assert.equal(await solidCount(fused), 1, "the overlapping run is one solid");
    const measured = await volume(fused);
    assert.ok(measured < 3 * CUBE_VOLUME - 1e-6,
      "shared material is counted once: " + measured + " must be under " + 3 * CUBE_VOLUME);
    // 22 long x 10 x 10 — exactly the union, so nothing was double counted
    assert.ok(Math.abs(measured - 2200) < 1e-6, "actual " + measured);
    // and the internal walls are gone: a 22x10x10 block has six faces, while
    // three touching-but-separate cubes would show far more
    assert.equal(await faceCount(fused), 6, "no internal wall survives the fuse");
  } finally { if (fused) disposeBrep(fused); }
});

test("copies with gaps stay N bodies whose volumes sum to N x the seed", async () => {
  const positions = [0, 40, 80, 120];
  const copies = [];
  let seed = null;
  try {
    seed = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: 10, h: 10, d: 10 });
    for (const x of positions) copies.push(await placeBrep(seed, along(x)));
    const groups = await brepConnectedGroups(copies.map((brep, index) => ({ brep, bounds: boundsAt(positions[index]) })));
    assert.equal(groups.length, positions.length, "nothing reaches anything, so nothing merges");
    let total = 0;
    for (const copy of copies) total += await volume(copy);
    assert.ok(Math.abs(total - positions.length * CUBE_VOLUME) < 1e-6, "actual " + total);
  } finally { copies.forEach(disposeBrep); if (seed) disposeBrep(seed); }
});

test("a partly overlapping run yields exactly the clusters the geometry forms", async () => {
  // 0 and 6 overlap; 40 and 46 overlap; 100 is alone. Two clusters and a
  // single, so three bodies — not one, and not five.
  const positions = [0, 6, 40, 46, 100];
  const copies = [];
  let seed = null, first = null, second = null;
  try {
    seed = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: 10, h: 10, d: 10 });
    for (const x of positions) copies.push(await placeBrep(seed, along(x)));
    const groups = await brepConnectedGroups(copies.map((brep, index) => ({ brep, bounds: boundsAt(positions[index]) })));
    assert.equal(groups.length, 3, "three connected clusters: " + JSON.stringify(groups));
    assert.deepEqual(groups.map((group) => group.length).sort(), [1, 2, 2]);
    // and each multi-member cluster really is one solid once built
    first = await placedBodyBrep({ part: CUBE, placements: [along(0), along(6)] });
    second = await placedBodyBrep({ part: CUBE, placements: [along(40), along(46)] });
    assert.equal(await solidCount(first), 1);
    assert.equal(await solidCount(second), 1);
    assert.ok(Math.abs(await volume(first) - 1600) < 1e-6, "16 long, not 20: the overlap is shared");
  } finally { copies.forEach(disposeBrep); [seed, first, second].forEach((entry) => entry && disposeBrep(entry)); }
});

test("overlap is decided by the solids, not by their bounding boxes", async () => {
  /* Two thin blades turned about Y: their boxes intersect near the axis and the
     blades touch nowhere. A box test would fuse them into a body that does not
     exist, which is why the kernel is asked. */
  let seed = null, turned = null;
  try {
    seed = await makeBrepPrimitive({ type: "box", x: 2, y: 0, z: -0.2, w: 20, h: 4, d: 0.4 });
    const step = Math.PI / 2;
    const c = Math.cos(step), s = Math.sin(step);
    turned = await placeBrep(seed, { matrix: [c, 0, s, 0, 1, 0, -s, 0, c], translation: { x: 0, y: 0, z: 0 } });
    assert.equal(await brepsOverlap(seed, turned), false, "the blades share no material");
    const groups = await brepConnectedGroups([{ brep: seed }, { brep: turned }]);
    assert.equal(groups.length, 2, "so they stay two bodies");
  } finally { [seed, turned].forEach((entry) => entry && disposeBrep(entry)); }
});

test("mergeResult false is still N bodies, even where they overlap", async () => {
  // the un-merged answer: the same two placements built as separate solids
  let seed = null, a = null, b = null;
  try {
    seed = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: 10, h: 10, d: 10 });
    a = await placeBrep(seed, along(0));
    b = await placeBrep(seed, along(6));
    assert.equal(await solidCount(a) + await solidCount(b), 2);
    assert.ok(Math.abs((await volume(a)) + (await volume(b)) - 2000) < 1e-6,
      "two whole cubes, the overlap counted twice — which is what NOT merging means");
    assert.equal(featureDefaults("pattern").mergeResult, false, "and it is still the default");
  } finally { [seed, a, b].forEach((entry) => entry && disposeBrep(entry)); }
});

/* --- the fused body is a real body downstream --------------------------- */

test("a fillet and a shell both work on a fused pattern result", async () => {
  let fused = null, rounded = null, hollow = null;
  try {
    fused = await placedBodyBrep({ part: CUBE, placements: [along(0), along(6)] });
    rounded = await filletBrep(fused, 1);
    assert.equal(await solidCount(rounded), 1, "the round takes on one body");
    assert.ok(await volume(rounded) < await volume(fused), "and removes material");
    // the top face of the fused block: one face, because the seam between the
    // two copies was welded — before the unify pass this pick was half a lid
    const faces = (extractBrepTopology(fused).topology || []).filter((entry) => entry.kind === "face");
    const lid = faces.filter((entry) => Math.abs((entry.descriptor?.normal?.y || 0) - 1) < 1e-6);
    assert.equal(lid.length, 1, "the fused block has one top face, not one per copy");
    hollow = await shellBrep(fused, 1, { facePersistentIds: [lid[0].persistentId] });
    assert.equal(await solidCount(hollow), 1);
    assert.ok(await volume(hollow) < await volume(fused), "the shell hollows the fused body");
  } finally { [fused, rounded, hollow].forEach((entry) => entry && disposeBrep(entry)); }
});

test("the exact tree rebuilds the fused pattern and mass counts it once", async () => {
  /* Exactly what rebuildFeatureTreeFromDocument now writes for a merged
     pattern: the host body, the fused instances as one placedBody row, and the
     union that makes them one. Before this, mass, interference and STEP export
     saw a document that had never heard of the merge. */
  const def = {
    featureVersion: 1,
    features: [
      { id: "seed", type: "box", name: "Seed", params: { x: 0, y: 0, z: 0, w: 10, h: 10, d: 10 }, inputs: [], references: [] },
      { id: "copies", type: "placedBody", name: "Merged body 1", inputs: [], references: [], params: {
        part: CUBE, placements: [along(6), along(12)],
      } },
      { id: "merge", type: "union", name: "Merge 1", params: {}, inputs: ["seed", "copies"], references: [] },
    ],
  };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(run.ok, JSON.stringify(run.issues));
    assert.equal(await solidCount(run.finalShape), 1, "one body in the exact tree too");
    const measured = await volume(run.finalShape);
    assert.ok(measured < 3 * CUBE_VOLUME, "the shared material is not billed twice");
    assert.ok(Math.abs(measured - 2200) < 1e-6, "actual " + measured);
  } finally { releaseRegeneration(run); }
});

test("a merged pattern survives a save: the recipe is plain JSON", async () => {
  const entry = { kind: "placed", part: CUBE, placements: [along(6)], featureId: "feat_x", patternFeatureId: "feat_x" };
  const reloaded = JSON.parse(JSON.stringify(entry));
  assert.deepEqual(reloaded, entry, "nothing in the record is a typed array or a class");
  let built = null;
  try {
    built = await placedBodyBrep(reloaded);
    assert.equal(await solidCount(built), 1);
    assert.ok(Math.abs(await volume(built) - CUBE_VOLUME) < 1e-6);
  } finally { if (built) disposeBrep(built); }
});

/* --- every pattern mode reaches the same fuse --------------------------- */

test("linear, circular and curve placements all become one rigid transform", () => {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const linear = patternPlacementTransform({ mode: "linear" }, { x: 6, y: 0, z: 0 }, 0);
  assert.deepEqual(linear.matrix, identity);
  assert.deepEqual(linear.translation, { x: 6, y: 0, z: 0 });

  // the circular transform has to agree with the rotation the viewport applies
  const params = { mode: "circular", axis: "y", count: 4, angle: 360, radialDistance: 8 };
  const step = circularPatternStepDegrees(params, 4) * Math.PI / 180;
  const placed = patternPlacementTransform(params, { circularIndex: 1 }, step);
  const point = { x: 3, y: 2, z: -1 };
  const expected = rotatePointAroundAxis(point, "y", step, { x: -8, y: 0, z: 0 });
  const m = placed.matrix, t = placed.translation;
  const actual = {
    x: m[0] * point.x + m[1] * point.y + m[2] * point.z + t.x,
    y: m[3] * point.x + m[4] * point.y + m[5] * point.z + t.y,
    z: m[6] * point.x + m[7] * point.y + m[8] * point.z + t.z,
  };
  ["x", "y", "z"].forEach((axis) => assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-9,
    axis + ": " + actual[axis] + " vs " + expected[axis]));

  // the curve mode already carried its own pair; it is passed straight through
  const curve = patternPlacementTransform({ mode: "curve" }, { matrix: [0, -1, 0, 1, 0, 0, 0, 0, 1], translation: { x: 1, y: 2, z: 3 } }, 0);
  assert.deepEqual(curve.matrix, [0, -1, 0, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual(curve.translation, { x: 1, y: 2, z: 3 });
});

/* --- the wiring ---------------------------------------------------------- */

test("one placement path lays every pattern copy, merged or not", () => {
  // placePatternCopy stays the single choke point: Apply and the rebuild that
  // follows a parameter edit both go through layPatternCopies, which is the
  // only caller left.
  assert.match(modeler, /function layPatternCopies\(seed, params, feature, placements, circularStep, push\) \{/);
  assert.match(modeler, /layPatternCopies\(p,params,feature,placements,circularStep,addPart\);/);
  assert.match(modeler, /layPatternCopies\(seed,feature\.params,feature,placements,circularStep,function\(copy\)\{E\.def\.parts\.push\(copy\);\}\);/);
  const layer = modeler.match(/function layPatternCopies\([\s\S]*?\n\}\n/)[0];
  assert.match(layer, /placePatternCopy\(copy,params,placement,circularStep\)/);
  assert.match(layer, /params\.mergeResult\?patternMergeSource\(seed\):null/, "the control is read here and nowhere else");
  // exactly two calls: the definition and the one place it is used per caller
  assert.equal((modeler.match(/placePatternCopy\(/g) || []).length, 2, "the preview and the layer, and no third path");
});

test("a merged pattern is fused by the kernel, not guessed from boxes", () => {
  const fuse = modeler.match(/function fusePatternInstances\([\s\S]*?\n\}\n/)[0];
  assert.match(fuse, /await brepConnectedGroups\(/, "the kernel decides which copies share material");
  assert.match(fuse, /if\(group\.length<2\)return;/, "a cluster of one is left exactly as it was laid");
  assert.match(fuse, /kind:"placed"/);
  // and a stale answer is dropped rather than applied to a document that moved
  assert.match(fuse, /if\(E\.def!==def\|\|!members\.every\(/);
  // memory: every placed copy and the base solid are released
  assert.match(fuse, /copies\.forEach\(function\(copy\)\{disposeBrep\(copy\);\}\);/);
  assert.match(fuse, /if\(base\)disposeBrep\(base\);/);
});

test("the fused instances reach the viewport, the exact tree and a rebuild", () => {
  // one builder, two callers — the viewport's merge loop and the exact tree
  assert.match(partGeometry, /if \(cut\.kind === "placed"\) return placedBodyBrep\(cut\);/);
  assert.match(modeler, /if \(merge\.kind === "placed"\) return \{ type:"placedBody"/);
  const tree = readFileSync(new URL("../js/cad_feature_tree.js", import.meta.url), "utf8");
  assert.match(tree, /else if \(feature\.type === "placedBody"\) \{/);
  assert.match(tree, /result = await placedBodyBrep\(effectiveParams\);/);
  // a parameter edit starts from the un-merged run rather than stacking fusions
  assert.match(modeler, /function clearPatternMerges\(featureId\) \{/);
  assert.match(modeler, /clearPatternMerges\(feature\.id\);/);
  // and a body the kernel cannot rebuild says so instead of pretending
  assert.match(modeler, /if\(!partSupportsExactMesh\(seed\)\)\{flash\(t\("patternMergeUnsupported"\)\);return;\}/);
  ["patternMergeUnsupported", "patternMergeFail", "patternMerged"].forEach((key) => {
    assert.match(strings, new RegExp("\\n  " + key + ": \\[\""), key + " has a [he, en] entry");
  });
});

test("a fused instance travels with the body it was fused into", () => {
  // world-placed, so it moves in the shift and not in a profile loop
  assert.match(partGeometry, /if \(merge\.kind !== "placed"\) return;/);
  assert.match(partGeometry, /placement\.translation\.x \+= dx; placement\.translation\.y \+= dy; placement\.translation\.z \+= dz;/);
});

test("the merged copy is the whole body, cached mesh excluded", () => {
  const source = partGeometry.match(/export function patternMergeSource\([\s\S]*?\n\}\n/)[0];
  assert.match(source, /"meshData"/, "the tessellation cache is a Float32Array carrier and never saved");
  assert.match(source, /"featureId"/, "and the copy is not a second body claiming the seed's identity");
  assert.doesNotMatch(source, /"holes"/, "but its holes and cuts are part of the shape being copied");
  assert.doesNotMatch(source, /"cuts3d"/);
});

test("the merged pattern's live preview is debounced, tokened and honest", () => {
  /* The runtime browser case proves the picture; these are the invariants that
     case cannot reach — the ones a kernel run per keystroke, or a badge that
     lies for a moment, would quietly break. */
  const sync = modeler.match(/function syncMergedPatternPreview\([\s\S]*?\n\}\n/)[0];
  assert.match(sync, /!params\.mergeResult \|\| !seed \|\| !\(instances \|\| \[\]\)\.length \|\| !partSupportsExactMesh\(seed\)/,
    "merge off, no seed or a body the kernel cannot rebuild asks the kernel nothing");
  assert.match(sync, /E\._featurePreviewToken=token/, "the fuse rides the one preview token");
  assert.match(sync, /clearTimeout\(E\._featureExactPreviewTimer\)/, "a parameter drag coalesces onto one run");
  assert.match(sync, /patternMergePreviewBadge\(liveBadge,"approximate"/,
    "the badge says approximate while the un-merged copies are what is drawn");
  assert.match(sync, /setTimeout\(function\(\)\{[\s\S]*runMergedPatternPreview/);

  const run = modeler.match(/async function runMergedPatternPreview\([\s\S]*?\n\}\n/)[0];
  assert.match(run, /await brepConnectedGroups\(/, "the kernel decides which copies share material");
  assert.match(run, /if\(!mergedPatternPreviewIsLive\(token\)\)return;/, "a superseded run draws nothing");
  assert.match(run, /patternMergePreviewBadge\(liveBadge,"exact","ph-broadcast",t\("livePatternMergeApart"\)\)/,
    "nothing overlapping makes the copies themselves the exact answer");
  assert.match(run, /patternMergePreviewBadge\(liveBadge,"error","ph-warning",t\("livePatternMergeFail"\)\)/);
  const failure = run.match(/\}catch\(error\)\{[\s\S]*?\}finally\{/)[0];
  assert.doesNotMatch(failure, /previewParts=/, "a kernel failure withdraws nothing — the copies stand");
  // memory: every placed copy and the base solid are released
  assert.match(run, /placed\.forEach\(function\(copy\)\{disposeBrep\(copy\);\}\);/);
  assert.match(run, /if\(base\)disposeBrep\(base\);/);
  assert.match(run, /disposeBrep\(solid\);/);

  // and dismissing the form drops the pass, so no mesh lands in an empty scene
  const clear = modeler.match(/function clearFeaturePreview\(refresh\) \{[\s\S]*?\n\}\n/)[0];
  assert.match(clear, /E\.authoring\.mergedPatternPreview=null;/);
  assert.match(clear, /E\._featurePreviewToken=\(E\._featurePreviewToken \|\| 0\)\+1;/);

  ["livePatternMergeCheck", "livePatternMergeReady", "livePatternMergeApart", "livePatternMergeFail"].forEach((key) => {
    assert.match(strings, new RegExp("\\n  " + key + ": \\[\""), key + " has a [he, en] entry");
  });
});

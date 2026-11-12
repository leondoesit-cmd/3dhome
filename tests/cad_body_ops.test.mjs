/* Split Body and Move / Copy Body — the two features that consume an existing
 * body rather than a sketch.
 *
 * Both are only reachable at all because exactBrepForPart() now starts a kernel
 * body from its recipe: before that, splitting or moving a swept pipe was
 * refused before it began. The tests below therefore also run them on a swept
 * body, not only on a primitive.
 */
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { featureDefaults, featureSpec, validateFeatureDefinition } from "../js/core/feature_catalog.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { FEATURE_COMMAND, buildCommandCatalog } from "../js/modeler_commands.js";
import { buildKernelBrep, kernelBodySpec } from "../js/core/kernel_body.js";
import { disposeBrep, loadCadKernel, makeBrepPrimitive, moveBodyBrep, splitBrep } from "../js/cad_kernel.js";

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

const solidCount = async (brep) => {
  const oc = await loadCadKernel();
  const explorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let n = 0;
  try { while (explorer.More()) { n++; explorer.Next(); } } finally { explorer.delete(); }
  return n;
};

const cube = (size = 10) => makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: size, h: size, d: size });

const square = (half, z = 0) => [
  { x: -half, y: -half, z }, { x: half, y: -half, z }, { x: half, y: half, z }, { x: -half, y: half, z },
];

// the swept bar from the kernel-body tests: 2 x 2 carried 20 along +Z
const sweptBar = () => buildKernelBrep(kernelBodySpec("sweep", {
  profile: square(1), path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }], solid: true,
}));

/* --- split ---------------------------------------------------------------- */

test("a split keeps the side that was asked for, and the two add back up", async () => {
  const brep = await cube(10);
  let above = null, below = null, both = null;
  try {
    above = await splitBrep(brep, { axis: "y", offset: 4, keep: "positive" });
    below = await splitBrep(brep, { axis: "y", offset: 4, keep: "negative" });
    both = await splitBrep(brep, { axis: "y", offset: 4, keep: "both" });
    assert.ok(Math.abs(await volume(above) - 600) < 1e-3, "6 of the 10 sits above y=4");
    assert.ok(Math.abs(await volume(below) - 400) < 1e-3, "and 4 below it");
    assert.ok(Math.abs(await volume(both) - 1000) < 1e-3, "no material is lost to the cut");
    const top = await bounds(above), bottom = await bounds(below);
    assert.ok(Math.abs(top.y0 - 4) < 1e-6 && Math.abs(bottom.y1 - 4) < 1e-6, "both halves meet on the plane itself");
    assert.equal(await solidCount(both), 2, "\"both\" is two solids, not one scored one");
    assert.equal(await solidCount(above), 1);
  } finally { [brep, above, below, both].forEach((entry) => entry && disposeBrep(entry)); }
});

test("the plane axis chooses which way the part comes apart", async () => {
  const brep = await cube(10);
  let onX = null;
  try {
    onX = await splitBrep(brep, { axis: "x", offset: 2.5, keep: "positive" });
    assert.ok(Math.abs(await volume(onX) - 750) < 1e-3);
    assert.ok(Math.abs((await bounds(onX)).x0 - 2.5) < 1e-6);
  } finally { disposeBrep(brep); if (onX) disposeBrep(onX); }
});

test("a swept body can be split — the very thing the old refusal blocked", async () => {
  const brep = await sweptBar();
  let half = null;
  try {
    half = await splitBrep(brep, { axis: "z", offset: 5, keep: "positive" });
    assert.ok(Math.abs(await volume(half) - 60) < 1.5, "15 of the bar's 20 survives (2x2x15)");
  } finally { disposeBrep(brep); if (half) disposeBrep(half); }
});

test("a plane that misses the body says so instead of returning it unchanged", async () => {
  const brep = await cube(10);
  try {
    await assert.rejects(splitBrep(brep, { axis: "y", offset: 40 }), /misses the body/);
    await assert.rejects(splitBrep(brep, { axis: "y", offset: 0 }), /misses the body/, "a plane on the face is not a cut");
  } finally { disposeBrep(brep); }
});

/* --- move / copy ---------------------------------------------------------- */

test("a move shifts the whole body and changes nothing about it", async () => {
  const brep = await cube(10);
  let moved = null;
  try {
    moved = await moveBodyBrep(brep, { dx: 5, dy: -2, dz: 0 });
    assert.ok(Math.abs(await volume(moved) - 1000) < 1e-3, "a move is not a deformation");
    const box = await bounds(moved);
    assert.ok(Math.abs(box.x0 - 5) < 1e-6 && Math.abs(box.y0 + 2) < 1e-6 && Math.abs(box.z0) < 1e-6);
  } finally { disposeBrep(brep); if (moved) disposeBrep(moved); }
});

test("the rotation turns about the body's own centre, not the world origin", async () => {
  const brep = await makeBrepPrimitive({ type: "box", x: 100, y: 0, z: 0, w: 10, h: 4, d: 2 });
  let turned = null;
  try {
    turned = await moveBodyBrep(brep, { angle: 90, axis: "y" });
    const box = await bounds(turned);
    // 10 x 2 in plan becomes 2 x 10, centred where it already was (105, 1)
    assert.ok(Math.abs(box.x0 - 104) < 1e-6 && Math.abs(box.x1 - 106) < 1e-6, "it turned in place: " + JSON.stringify(box));
    assert.ok(Math.abs(box.z0 + 4) < 1e-6 && Math.abs(box.z1 - 6) < 1e-6);
    assert.ok(Math.abs(await volume(turned) - 80) < 1e-3);
  } finally { disposeBrep(brep); if (turned) disposeBrep(turned); }
});

test("the turn happens before the offset, so the two numbers read in order", async () => {
  const brep = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: 10, h: 4, d: 2 });
  let moved = null;
  try {
    moved = await moveBodyBrep(brep, { angle: 90, axis: "y", dx: 50 });
    const box = await bounds(moved);
    // turned about (5,1) to span x 4..6, z -4..6, then carried 50 along +X
    assert.ok(Math.abs(box.x0 - 54) < 1e-6 && Math.abs(box.x1 - 56) < 1e-6, JSON.stringify(box));
  } finally { disposeBrep(brep); if (moved) disposeBrep(moved); }
});

test("a copy leaves two bodies standing, not one fused lump", async () => {
  const brep = await cube(10);
  let copied = null;
  try {
    copied = await moveBodyBrep(brep, { dx: 30, copy: true });
    assert.ok(Math.abs(await volume(copied) - 2000) < 1e-3, "both bodies are there");
    assert.equal(await solidCount(copied), 2, "and they are still two");
    const box = await bounds(copied);
    assert.ok(Math.abs(box.x0) < 1e-6 && Math.abs(box.x1 - 40) < 1e-6);
  } finally { disposeBrep(brep); if (copied) disposeBrep(copied); }
});

test("a move with nothing to move is refused rather than rebuilt for nothing", async () => {
  const brep = await cube(10);
  try {
    await assert.rejects(moveBodyBrep(brep, {}), /nothing to move/);
    await assert.rejects(moveBodyBrep(brep, { dx: 0, angle: 0 }), /nothing to move/);
  } finally { disposeBrep(brep); }
});

/* --- the catalogue and the rebuild path ---------------------------------- */

test("both features declare exactly the parameters their kernel call reads", () => {
  assert.deepEqual(Object.keys(featureDefaults("splitBody")).sort(), ["axis", "keep", "offset"]);
  assert.deepEqual(Object.keys(featureDefaults("moveBody")).sort(), ["angle", "axis", "copy", "dx", "dy", "dz"]);
  ["splitBody", "moveBody"].forEach((type) => {
    const spec = featureSpec(type);
    const fields = spec.editor.groups.flatMap((group) => group.fields).map((field) => field.key);
    assert.deepEqual(fields.slice().sort(), Object.keys(featureDefaults(type)).sort(), type + " offers its parameters and nothing else");
    fields.forEach((key) => assert.ok(spec.parameters[key], type + "." + key + " is declared"));
  });
  ["splitBody", "moveBody"].forEach((type) => {
    const issues = validateFeatureDefinition({ id: "f1", type, params: featureDefaults(type), references: {} });
    assert.ok(issues.map((issue) => issue.code).includes("missing-feature-input"), type + " needs a body");
  });
});

test("a split and a move rebuild in a feature tree against the step before them", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:10, h:10, d:10 } },
    { id: "s1", type: "splitBody", name: "Split", inputs: ["b1"], references: { features: ["b1"] },
      params: { ...featureDefaults("splitBody"), axis: "y", offset: 4, keep: "positive" } },
    { id: "m1", type: "moveBody", name: "Move", inputs: ["s1"], references: { features: ["s1"] },
      params: { ...featureDefaults("moveBody"), dx: 20 } },
  ] };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(!run.issues.some((issue) => issue.code === "regeneration-failed"), JSON.stringify(run.issues));
    assert.ok(Math.abs(await volume(run.results.get("s1")) - 600) < 1e-3);
    const moved = run.results.get("m1");
    assert.ok(Math.abs(await volume(moved) - 600) < 1e-3, "the move carried the half, not the whole box");
    assert.ok(Math.abs((await bounds(moved)).x0 - 20) < 1e-6);
  } finally { releaseRegeneration(run); }
});

test("a split that misses fails alone and leaves nothing behind", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:10, h:10, d:10 } },
    { id: "s1", type: "splitBody", name: "Split", inputs: ["b1"], references: { features: ["b1"] },
      params: { ...featureDefaults("splitBody"), axis: "y", offset: 99 } },
  ] };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(run.issues.some((issue) => issue.code === "regeneration-failed"));
    assert.equal(run.results.has("s1"), false);
  } finally { releaseRegeneration(run); }
});

/* --- the editor wiring --------------------------------------------------- */

const modeler = modelerSource().replace(/\r\n/g, "\n");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("both features reach the ribbon, the command handler and the apply path", () => {
  assert.equal(FEATURE_COMMAND.splitBody, "splitbodyfeature");
  assert.equal(FEATURE_COMMAND.moveBody, "movebodyfeature");
  const catalog = buildCommandCatalog({ t: (key) => key, editor: { docType: "part", def: { parts: [] } }, activeParts: () => [], closedSketchProfile: () => null });
  ["splitbodyfeature", "movebodyfeature"].forEach((id) => {
    const command = catalog.find((entry) => entry.id === id);
    assert.ok(command, id + " is in the ribbon catalog");
    assert.equal(command.available(), false, id + " is greyed out with no body");
  });
  assert.match(modeler, /commandButton\("splitbodyfeature", t\("splitBodyOp"\)\)/);
  assert.match(modeler, /commandButton\("movebodyfeature", t\("moveBodyOp"\)\)/);
  assert.match(modeler, /else if \(id === "splitbodyfeature"\) openParametricFeature\("splitBody"\);/);
  assert.match(modeler, /else if \(id === "movebodyfeature"\) openParametricFeature\("moveBody"\);/);
  assert.match(modeler, /else if\(type==="splitBody"\)ok=quickSplitBodyPart\(params\);/);
  assert.match(modeler, /else if\(type==="moveBody"\)ok=quickMoveBodyPart\(params\);/);
  assert.match(partGeometry, /next=await splitBrep\(solid, operation\.params \|\| \{\}\);/);
  assert.match(partGeometry, /next=await moveBodyBrep\(solid, operation\.params \|\| \{\}\);/);
});

test("splitting into two bodies makes two PARTS, each carrying one side", () => {
  const split = modeler.match(/function quickSplitBodyPart\(options\)[\s\S]*?\n\}\n/)[0];
  assert.match(split, /resetClonedPartIdentity\(cloneData\(p\)\)/, "the other half is a part of its own");
  assert.match(split, /record\(p,"positive"\);\s*\n\s*record\(other,"negative"\);/, "complementary sides, one per part");
  assert.match(split, /var sourceFeatureId=cutTargetFeatureId\(p\);/, "both rows name the body they were cut from (its head), not the clone's empty id");
  assert.match(split, /delete other\.meshData; delete other\.bounds;/, "the clone does not draw the whole body until it rebuilds");
  assert.match(split, /if \(!partSupportsExactMesh\(p\)\) \{ flash\(t\("splitBodyFail"\)\); return false; \}/);
});

test("a body copy is a second part, and the kernel is never asked to fuse the two", () => {
  const move = modeler.match(/function quickMoveBodyPart\(options\)[\s\S]*?\n\}\n/)[0];
  assert.match(move, /var kernelParams=\{\.\.\.params,copy:false\};/, "the compound belongs to the tree, not to a part");
  assert.match(move, /target=resetClonedPartIdentity\(cloneData\(p\)\)/);
  assert.match(move, /flash\(t\("moveBodyNothing"\)\)/, "a no-op move is refused out loud");
  // and the re-emitted exact tree must not drop an operation that has no
  // single scrubbed amount — that left STEP export weighing an unsplit body
  assert.match(modeler, /var BODY_OPERATIONS = new Set\(\["splitBody", "moveBody"\]\);/);
  assert.match(modeler, /if \(FINISH_AMOUNT_KEY\[operation\.type\]===undefined && !BODY_OPERATIONS\.has\(operation\.type\)\) return;/);
});

test("every split and move string exists in both languages", () => {
  const keys = ["splitBodyOp", "splitBodyFail", "moveBodyOp", "moveBodyFail", "moveBodyNothing",
    "fcFeatSplitBody", "fcFeatMoveBody", "fcGrpSplitDefinition", "fcGrpOffset", "fcGrpRotation",
    "fcFldPlaneNormal", "fcFldPlanePosition", "fcFldKeep", "fcFldOffsetX", "fcFldRotationAxis", "fcFldLeaveCopy",
    "fcOptKeepBoth", "fcOptKeepPositive", "fcOptKeepNegative"];
  keys.forEach((key) => {
    const match = modelerStrings.match(new RegExp("\\n  " + key + ': \\["([^"]+)", "([^"]+)"\\]'));
    assert.ok(match, key + " has a [he, en] pair in TXT");
    assert.notEqual(match[1], "");
    assert.notEqual(match[2], "");
  });
  // the two names built by substitution go through tf(), never concatenation
  assert.match(modelerStrings, /splitBodyHalf: \["[^{]*\{name\}[^"]*", "[^{]*\{name\}[^"]*"\]/);
  assert.match(modelerStrings, /moveBodyCopyName: \["[^{]*\{name\}[^"]*", "[^{]*\{name\}[^"]*"\]/);
  assert.match(modeler, /tf\("splitBodyHalf",\{name:/);
  assert.match(modeler, /tf\("moveBodyCopyName",\{name:/);
});

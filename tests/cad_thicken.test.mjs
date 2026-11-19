/* Thicken: give a surface a thickness.
 *
 * The kernel trap this feature is built around, confirmed below rather than
 * assumed: BRepOffsetAPI_MakeThickSolid::MakeThickSolidBySimple(face, +offset)
 * returns an INSIDE-OUT solid — a negative volume — while the same call with a
 * negative offset does not. Shipping that unfixed means a body that meshes to
 * inverted normals and weighs a negative mass in the BOM.
 */
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { featureDefaults, featureSpec, validateFeatureDefinition } from "../js/core/feature_catalog.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { FEATURE_COMMAND, buildCommandCatalog } from "../js/modeler_commands.js";
import { buildKernelBrep, kernelBodySpec } from "../js/core/kernel_body.js";
import { disposeBrep, extractBrepTopology, loadCadKernel, makeBrepPrimitive, shellBrep, thickenBrep } from "../js/cad_kernel.js";

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

const wallId = (brep, axis, wanted) => {
  const face = brep.topology.find((item) => item.kind === "face"
    && item.descriptor.surface === "plane"
    && Math.abs((item.descriptor.normal[axis] || 0) - wanted) < 1e-6);
  assert.ok(face, "the body has a planar face whose normal is " + wanted + " along " + axis);
  return face.persistentId;
};

const cube = async (size = 10) => {
  const brep = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: size, h: size, d: size });
  extractBrepTopology(brep, { ownerFeatureId: "cube" });
  return brep;
};

const square = (half, z = 0) => [
  { x: -half, y: -half, z }, { x: half, y: -half, z }, { x: half, y: half, z }, { x: -half, y: half, z },
];

// A sweep with "Create solid" off: four faces, no volume at all.
const surface = async () => {
  const brep = await buildKernelBrep(kernelBodySpec("sweep", {
    profile: square(1), path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }], solid: false,
  }));
  extractBrepTopology(brep, { ownerFeatureId: "surface" });
  return brep;
};

/* --- the catalogue entry, no WASM --------------------------------------- */

test("thicken is a feature of its own, with the two inputs it actually uses", () => {
  const spec = featureSpec("thicken");
  assert.ok(spec, "the catalogue knows the type");
  assert.deepEqual(Object.keys(featureDefaults("thicken")).sort(), ["direction", "thickness"]);
  const fields = spec.editor.groups.flatMap((group) => group.fields).map((field) => field.key);
  assert.deepEqual(fields.slice().sort(), ["direction", "thickness"]);
  fields.forEach((key) => assert.ok(spec.parameters[key], key + " is a declared parameter"));
});

test("thicken demands a body and at least one face", () => {
  const issues = validateFeatureDefinition({ id: "f1", type: "thicken", params: featureDefaults("thicken"), references: {} });
  assert.ok(issues.map((issue) => issue.code).includes("missing-feature-input"));
});

/* --- the real kernel ----------------------------------------------------- */

test("a positive offset comes back inside out, and thicken hands back a positive solid", async () => {
  const oc = await loadCadKernel(), brep = await cube(10);
  try {
    // The raw call, so the trap is recorded rather than remembered.
    const maker = new oc.BRepOffsetAPI_MakeThickSolid();
    const progress = new oc.Message_ProgressRange_1();
    const explorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    try {
      maker.MakeThickSolidBySimple(explorer.Current(), 2);
      maker.Build(progress);
      const props = new oc.GProp_GProps_1();
      oc.BRepGProp.VolumeProperties_1(maker.Shape(), props, false, false, false);
      const raw = props.Mass();
      props.delete();
      assert.ok(raw < 0, "MakeThickSolidBySimple(face, +2) really does return a negative volume (" + raw + ")");
    } finally { explorer.delete(); progress.delete(); maker.delete(); }

    const thick = await thickenBrep(brep, 2, { facePersistentIds: [wallId(brep, "x", 1)], direction: "outside" });
    try { assert.ok(await volume(thick) > 0, "and the feature never hands a negative-volume body downstream"); }
    finally { disposeBrep(thick); }
  } finally { disposeBrep(brep); }
});

test("thickening a face of a solid grows a boss of exactly that thickness", async () => {
  const brep = await cube(10);
  let thick = null;
  try {
    thick = await thickenBrep(brep, 2, { facePersistentIds: [wallId(brep, "x", 1)], direction: "outside" });
    assert.ok(Math.abs(await volume(thick) - 1200) < 1e-3, "1000 plus a 10 x 10 x 2 slab");
    const box = await bounds(thick);
    assert.ok(Math.abs(box.x1 - 12) < 1e-6, "the body reaches two further along the face normal");
    assert.ok(Math.abs(box.x0) < 1e-6 && Math.abs(box.y1 - 10) < 1e-6, "and nowhere else");
  } finally { disposeBrep(brep); if (thick) disposeBrep(thick); }
});

test("two faces thicken as one wall, not as two overlapping slabs", async () => {
  const brep = await cube(10);
  let thick = null;
  try {
    thick = await thickenBrep(brep, 2, {
      facePersistentIds: [wallId(brep, "x", 1), wallId(brep, "z", 1)], direction: "outside",
    });
    const grown = await volume(thick) - 1000;
    // Two 10x10x2 slabs are 400; sewn first, the shared corner is counted once,
    // so the answer must be under that and over one slab alone.
    assert.ok(grown > 200 && grown < 400, "the shared edge is not thickened twice (" + grown + ")");
  } finally { disposeBrep(brep); if (thick) disposeBrep(thick); }
});

test("inward thickening fills a cavity instead of growing the outside", async () => {
  const brep = await cube(10);
  let hollow = null, thick = null;
  try {
    // open-topped box, 1 thick: 1000 - 8*8*9 = 424
    hollow = await shellBrep(brep, 1, { facePersistentIds: [wallId(brep, "y", 1)] });
    extractBrepTopology(hollow, { ownerFeatureId: "shelled" });
    const before = await volume(hollow);
    const inner = hollow.topology.find((item) => item.kind === "face"
      && item.descriptor.surface === "plane"
      && Math.abs((item.descriptor.normal.x || 0) + 1) < 1e-6
      && Math.abs(item.descriptor.origin.x - 9) < 1e-6);
    assert.ok(inner, "the shelled box has an inward-facing wall at x=9");
    thick = await thickenBrep(hollow, 2, { facePersistentIds: [inner.persistentId], direction: "outside" });
    const after = await volume(thick);
    // the 8 x 9 inner wall carried 2 into the cavity
    assert.ok(Math.abs((after - before) - 144) < 1e-3, "the wall got thicker on the cavity side (" + before + " -> " + after + ")");
    const box = await bounds(thick);
    assert.ok(Math.abs(box.x1 - 10) < 0.01, "and the outside of the part did not move");
  } finally { disposeBrep(brep); if (hollow) disposeBrep(hollow); if (thick) disposeBrep(thick); }
});

test("a surface body becomes a solid, and the direction picks which side", async () => {
  const brep = await surface();
  let out = null, into = null;
  try {
    const wall = wallId(brep, "x", 1);   // the +X sheet of the open tube
    out = await thickenBrep(brep, 0.5, { facePersistentIds: [wall], direction: "outside" });
    into = await thickenBrep(brep, 0.5, { facePersistentIds: [wall], direction: "inside" });
    // a 2 x 20 sheet at 0.5 thick, either way
    assert.ok(Math.abs(await volume(out) - 20) < 1e-3, "the surface has a volume now");
    assert.ok(Math.abs(await volume(into) - 20) < 1e-3);
    const a = await bounds(out), b = await bounds(into);
    assert.ok(Math.abs(a.x1 - 1.5) < 1e-6, "outward lands beyond the sheet");
    assert.ok(Math.abs(b.x1 - 1) < 1e-6 && Math.abs(b.x0 - 0.5) < 1e-6, "inward lands behind it");
    // nothing was fused: a surface has no solid to fuse into
    assert.ok(Math.abs(a.z1 - a.z0 - 20) < 1e-6);
  } finally { disposeBrep(brep); if (out) disposeBrep(out); if (into) disposeBrep(into); }
});

test("thicken refuses an empty selection and a zero thickness", async () => {
  const brep = await cube(10);
  try {
    await assert.rejects(thickenBrep(brep, 2, { facePersistentIds: [] }), /no resolved faces/);
    await assert.rejects(thickenBrep(brep, 0, { facePersistentIds: [wallId(brep, "x", 1)] }), /non-zero thickness/);
  } finally { disposeBrep(brep); }
});

/* --- the whole path: catalogue -> rebuild -> kernel ---------------------- */

test("a thicken step in a feature tree rebuilds against the face it names", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:10, h:10, d:10 } },
    { id: "t1", type: "thicken", name: "Thicken", inputs: ["b1"], params: { ...featureDefaults("thicken"), thickness: 2 },
      references: { features: ["b1"], topology: [
        { type: "topology-reference", kind: "face", persistentId: "b1:face:right", ownerFeatureId: "b1", semantic: "right" },
      ] } },
  ] };
  const run = await regenerateFeatures(def);
  try {
    assert.deepEqual(run.issues, [], "the box names its faces and the thicken resolves one of them");
    const thick = run.results.get("t1");
    assert.ok(thick?.shape, "the thicken produced a body");
    assert.ok(Math.abs(await volume(thick) - 1200) < 1e-3, "and it is the same slab the kernel test measured");
  } finally { releaseRegeneration(run); }
});

test("a thicken that names no face fails on its own rather than passing the input through", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:10, h:10, d:10 } },
    { id: "t1", type: "thicken", name: "Thicken", inputs: ["b1"], params: featureDefaults("thicken"), references: { features: ["b1"], topology: [] } },
  ] };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(run.issues.some((issue) => issue.code === "regeneration-failed"), "the step reports its own failure");
    assert.equal(run.results.has("t1"), false, "and leaves no body behind pretending it worked");
  } finally { releaseRegeneration(run); }
});

/* --- the editor wiring --------------------------------------------------- */

const modeler = modelerSource();
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("thicken reaches the ribbon, the command handler and the apply path", () => {
  assert.equal(FEATURE_COMMAND.thicken, "thickenfeature");
  const catalog = buildCommandCatalog({ t: (key) => key, editor: { docType: "part", def: { parts: [] } }, activeParts: () => [], closedSketchProfile: () => null });
  const command = catalog.find((entry) => entry.id === "thickenfeature");
  assert.ok(command, "the ribbon knows the command");
  assert.equal(command.available(), false, "and it is greyed out with no body to thicken");
  assert.match(modeler, /commandButton\("thickenfeature", t\("thickenOp"\)\)/);
  assert.match(modeler, /else if \(id === "thickenfeature"\) openParametricFeature\("thicken"\);/);
  assert.match(modeler, /else if\(type==="thicken"\)ok=quickThickenPart\(params\);/);
  assert.match(partGeometry, /next=await thickenBrep\(solid, operation\.amount/);
  assert.match(modeler, /type:"thicken",amount:thickness,targets:targets/);
  // face-driven, like shell and draft — the selection collector must say "face"
  assert.match(partGeometry, /var FACE_DRIVEN_OPERATIONS = new Set\(\["shell", "dome", "draft", "thicken"\]\);/);
  assert.match(modeler, /FINISH_AMOUNT_KEY = \{[^}]*thicken:"thickness"/);
});

test("every thicken string the form can show exists in both languages", () => {
  const keys = ["thickenOp", "thickenFail", "selectFaceThicken", "fcFeatThicken", "fcGrpThickenDefinition"];
  keys.forEach((key) => {
    const match = modelerStrings.match(new RegExp("\\n  " + key + ': \\["([^"]+)", "([^"]+)"\\]'));
    assert.ok(match, key + " has a [he, en] pair in TXT");
    assert.notEqual(match[1], "", key + " has Hebrew");
    assert.notEqual(match[2], "", key + " has English");
  });
});

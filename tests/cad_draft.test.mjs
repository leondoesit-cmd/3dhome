import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import { featureDefaults, featureSpec, validateFeatureDefinition } from "../js/core/feature_catalog.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { FEATURE_COMMAND, buildCommandCatalog } from "../js/modeler_commands.js";
import { disposeBrep, draftBrep, extractBrepTopology, loadCadKernel, makeBrepPrimitive } from "../js/cad_kernel.js";

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

// The +X wall of a 10-cube, named by the extraction so a test can select it the
// way the feature does rather than by explorer position.
const wallId = (brep, axis, wanted) => {
  const face = brep.topology.find((item) => item.kind === "face"
    && item.descriptor.surface === "plane"
    && Math.abs((item.descriptor.normal[axis] || 0) - wanted) < 1e-6);
  assert.ok(face, "the cube has a planar face whose normal is " + wanted + " along " + axis);
  return face.persistentId;
};

const cube = async (size = 10) => {
  const brep = await makeBrepPrimitive({ type: "box", x: 0, y: 0, z: 0, w: size, h: size, d: size });
  extractBrepTopology(brep, { ownerFeatureId: "cube" });
  return brep;
};

/* --- the catalogue entry, no WASM --------------------------------------- */

test("draft is a feature of its own, with the four inputs it actually uses", () => {
  const spec = featureSpec("draft");
  assert.ok(spec, "the catalogue knows the type");
  assert.deepEqual(Object.keys(featureDefaults("draft")).sort(), ["angle", "neutral", "neutralOffset", "pullAxis", "pullDirection"]);
  // Every declared field is a parameter the kernel reads; nothing decorative.
  const fields = spec.editor.groups.flatMap((group) => group.fields).map((field) => field.key);
  assert.deepEqual(fields.slice().sort(), ["angle", "neutral", "neutralOffset", "pullAxis", "pullDirection"]);
  fields.forEach((key) => assert.ok(spec.parameters[key], key + " is a declared parameter"));
});

test("draft demands a body and at least one face", () => {
  const issues = validateFeatureDefinition({ id: "f1", type: "draft", params: featureDefaults("draft"), references: {} });
  const codes = issues.map((issue) => issue.code);
  assert.ok(codes.includes("missing-feature-input"), "no body and no face is an error, not a silent no-op");
});

/* --- the real kernel ----------------------------------------------------- */

const WEDGE_5DEG = 0.5 * 10 * Math.tan((5 * Math.PI) / 180) * 10 * 10;

test("a positive angle tapers the wall so the body releases along the pull direction", async () => {
  const brep = await cube(10);
  let drafted = null;
  try {
    const before = await volume(brep);
    assert.ok(Math.abs(before - 1000) < 1e-6, "the cube starts at 1000");
    // Pull +Y, neutral plane at the top: the +X wall pivots on the line
    // x=10,y=10 and flares out going down, so the section shrinks as y grows —
    // which is what "draft" means. The flare is a wedge 10*tan(5°) x 10 x 10/2.
    drafted = await draftBrep(brep, 5, {
      facePersistentIds: [wallId(brep, "x", 1)],
      pullAxis: "y", pullDirection: "forward", neutral: "end", neutralOffset: 0,
    });
    const after = await volume(drafted);
    assert.ok(Math.abs((after - before) - WEDGE_5DEG) < 1e-3, "gained " + (after - before) + ", expected " + WEDGE_5DEG);
    const box = await bounds(drafted);
    assert.ok(Math.abs(box.x1 - (10 + 10 * Math.tan((5 * Math.PI) / 180))) < 1e-6, "the far end is one tangent wider");
    assert.ok(Math.abs(box.y0) < 1e-6 && Math.abs(box.y1 - 10) < 1e-6, "the pull axis itself is untouched");
  } finally { disposeBrep(brep); if (drafted) disposeBrep(drafted); }
});

test("the neutral plane decides which end keeps its size, not which way the taper runs", async () => {
  const brep = await cube(10);
  let drafted = null;
  try {
    drafted = await draftBrep(brep, 5, {
      facePersistentIds: [wallId(brep, "x", 1)],
      pullAxis: "y", pullDirection: "forward", neutral: "start",
    });
    const box = await bounds(drafted);
    // Anchored at y=0 instead: the bottom keeps x=10 and the top leans in, so
    // the same taper now costs a wedge rather than adding one.
    assert.ok(Math.abs(box.x1 - 10) < 1e-6, "the neutral end still measures 10");
    assert.ok(Math.abs((1000 - await volume(drafted)) - WEDGE_5DEG) < 1e-3, "same wedge, other side of the parting line");
  } finally { disposeBrep(brep); if (drafted) disposeBrep(drafted); }
});

test("a negative angle tips the wall the other way", async () => {
  const brep = await cube(10);
  let drafted = null;
  try {
    drafted = await draftBrep(brep, -5, {
      facePersistentIds: [wallId(brep, "x", 1)],
      pullAxis: "y", pullDirection: "forward", neutral: "end",
    });
    assert.ok(Math.abs((1000 - await volume(drafted)) - WEDGE_5DEG) < 1e-3, "the same wedge is removed instead of added");
    const box = await bounds(drafted);
    assert.ok(Math.abs(box.x1 - 10) < 1e-6, "nothing grows past the original wall");
  } finally { disposeBrep(brep); if (drafted) disposeBrep(drafted); }
});

test("the neutral offset moves the parting line the taper pivots on", async () => {
  const brep = await cube(10);
  let drafted = null;
  try {
    // Neutral at the top minus 4: the pivot is y=6, so the widest point (y=0)
    // is only 6*tan(5°) out and the top is 4*tan(5°) in.
    drafted = await draftBrep(brep, 5, {
      facePersistentIds: [wallId(brep, "x", 1)],
      pullAxis: "y", pullDirection: "forward", neutral: "end", neutralOffset: -4,
    });
    const box = await bounds(drafted), tan = Math.tan((5 * Math.PI) / 180);
    assert.ok(Math.abs(box.x1 - (10 + 6 * tan)) < 1e-6, "the flare is measured from y=6, not from y=10");
  } finally { disposeBrep(brep); if (drafted) disposeBrep(drafted); }
});

test("the pull direction chooses which walls can be drafted at all", async () => {
  const brep = await cube(10);
  try {
    // The +Y face is square to a +Y pull: there is no line to tilt it about.
    await assert.rejects(
      draftBrep(brep, 5, { facePersistentIds: [wallId(brep, "y", 1)], pullAxis: "y", neutral: "end" }),
      /cannot tilt|draft failed/i,
      "a face perpendicular to the pull reports a failure rather than returning the input",
    );
  } finally { disposeBrep(brep); }
});

test("draft refuses an empty selection and a zero angle", async () => {
  const brep = await cube(10);
  try {
    await assert.rejects(draftBrep(brep, 5, { facePersistentIds: [] }), /no resolved faces/);
    await assert.rejects(draftBrep(brep, 0, { facePersistentIds: [wallId(brep, "x", 1)] }), /non-zero/);
  } finally { disposeBrep(brep); }
});

/* --- the whole path: catalogue -> rebuild -> kernel ---------------------- */

test("a draft step in a feature tree rebuilds against the face it names", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:10, h:10, d:10 } },
    { id: "d1", type: "draft", name: "Draft", inputs: ["b1"], params: featureDefaults("draft"),
      references: { features: ["b1"], topology: [
        { type: "topology-reference", kind: "face", persistentId: "b1:face:right", ownerFeatureId: "b1", semantic: "right" },
      ] } },
  ] };
  def.features[1].params.angle = 5;
  const run = await regenerateFeatures(def);
  try {
    assert.deepEqual(run.issues, [], "the box names its faces and the draft resolves one of them");
    const drafted = run.results.get("d1");
    assert.ok(drafted?.shape, "the draft produced a body");
    const after = await volume(drafted);
    assert.ok(Math.abs((after - 1000) - WEDGE_5DEG) < 1e-3, "and it is the same wedge the kernel test measured");
    assert.equal(drafted.topology.filter((item) => item.kind === "face").length, 6, "a drafted box is still six faces");
  } finally { releaseRegeneration(run); }
});

test("a draft that names no face fails on its own rather than building the input unchanged", async () => {
  const def = { features: [
    { id: "b1", type: "box", name: "Box", inputs: [], references: {}, params: { x:0, y:0, z:0, w:10, h:10, d:10 } },
    { id: "d1", type: "draft", name: "Draft", inputs: ["b1"], params: featureDefaults("draft"), references: { features: ["b1"], topology: [] } },
  ] };
  const run = await regenerateFeatures(def);
  try {
    assert.ok(run.issues.some((issue) => issue.code === "regeneration-failed"), "the step reports its own failure");
    assert.equal(run.results.has("d1"), false, "and leaves no body behind pretending it worked");
  } finally { releaseRegeneration(run); }
});

/* --- the editor wiring --------------------------------------------------- */

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("draft reaches the ribbon, the command handler and the apply path", () => {
  assert.equal(FEATURE_COMMAND.draft, "draftfeature");
  const catalog = buildCommandCatalog({ t: (key) => key, editor: { docType: "part", def: { parts: [] } }, activeParts: () => [], closedSketchProfile: () => null });
  const command = catalog.find((entry) => entry.id === "draftfeature");
  assert.ok(command, "the ribbon knows the command");
  assert.equal(command.available(), false, "and it is greyed out with no solid to draft");
  assert.match(modeler, /commandButton\("draftfeature", t\("draftOp"\)\)/);
  assert.match(modeler, /else if \(id === "draftfeature"\) openParametricFeature\("draft"\);/);
  assert.match(modeler, /else if\(type==="draft"\)ok=quickDraftPart\(params\);/);
  // the exact operation the part records, and the kernel call it makes
  assert.match(partGeometry, /next=await draftBrep\(solid, operation\.amount/);
  assert.match(modeler, /type:"draft",amount:angle,targets:targets/);
});

test("every draft string the form can show exists in both languages", () => {
  const keys = ["draftOp", "draftFail", "selectFaceDraft", "fcFeatDraft", "fcGrpDraftDefinition",
    "fcFldPullDirection", "fcFldNeutralPlane", "fcFldNeutralOffset", "fcOptNeutralStart", "fcOptNeutralEnd"];
  keys.forEach((key) => {
    const match = modelerStrings.match(new RegExp("\\n  " + key + ': \\["([^"]+)", "([^"]+)"\\]'));
    assert.ok(match, key + " has a [he, en] pair in TXT");
    assert.notEqual(match[1], "", key + " has Hebrew");
    assert.notEqual(match[2], "", key + " has English");
  });
});

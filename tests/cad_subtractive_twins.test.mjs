import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { featureDefaults, featureSpec, validateFeatureDefinition } from "../js/core/feature_catalog.js";
import { createFeatureDefinition, createSketchDefinition, ensureParametricDocument } from "../js/core/parametric_document.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { loadCadKernel } from "../js/cad_kernel.js";
import { FEATURE_COMMAND, buildCommandCatalog } from "../js/modeler_commands.js";

const volume = async (brep) => {
  const oc = await loadCadKernel(), props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
};

const documentWithBlock = () => {
  const doc = ensureParametricDocument({ id: "d", name: "d" });
  const profile = createSketchDefinition(doc, { referenceId: "plane:top", name: "Profile" });
  const path = createSketchDefinition(doc, { referenceId: "plane:front", name: "Path" });
  const block = createFeatureDefinition(doc, "box", { params: { x:-10, y:0, z:-10, w:20, h:20, d:20 } });
  return { doc, profile, path, block };
};

const buildCompiled = async (doc) => {
  const compiled = compileKernelFeatureTree(doc);
  assert.deepEqual(compiled.issues, [], "the history lowers cleanly");
  const run = await regenerateFeatures({ ...compiled.document, features: compiled.features });
  return { compiled, run };
};

/* --- the catalogue ------------------------------------------------------- */

test("each cut asks for a body as well as the profile its additive twin asks for", () => {
  for (const [cut, additive] of [["revolveCut", "revolve"], ["sweepCut", "sweep"]]) {
    const spec = featureSpec(cut), twin = featureSpec(additive);
    assert.ok(spec, cut + " is in the catalogue");
    assert.deepEqual(spec.selection.sketches, twin.selection.sketches, cut + " consumes the same sketches as " + additive);
    assert.deepEqual(spec.selection.features, { min: 1, max: 1 }, cut + " additionally needs one body");
    assert.deepEqual(spec.defaults.operation, "subtract");
  }
  // and a cut with a profile but no body is rejected, not silently ignored
  const issues = validateFeatureDefinition({ id: "f", type: "revolveCut", params: featureDefaults("revolveCut"), references: { sketches: ["s"] } });
  assert.ok(issues.some((issue) => issue.role === "features"), "no body is an error");
});

/* --- the lowering: one revolve, one sweep, never two --------------------- */

test("a revolve cut lowers to the revolve step plus a subtract, not a second revolve", async () => {
  const { doc, profile, block } = documentWithBlock();
  const cut = createFeatureDefinition(doc, "revolveCut", {
    inputs: [block.id],
    references: { sketches: [profile.id], features: [block.id], topology: [], references: ["axis:y"] },
    params: { ...featureDefaults("revolveCut"), axis: "y", points: [{u:0,v:0},{u:5,v:0},{u:5,v:20},{u:0,v:20}] },
  });
  const { compiled, run } = await buildCompiled(doc);
  try {
    const steps = compiled.features.filter((step) => step.type !== "sketch").map((step) => step.type);
    assert.deepEqual(steps, ["box", "revolve", "subtract"], "the tool is an ordinary revolve");
    const tool = compiled.features.find((step) => step.id === cut.id + ":tool");
    assert.equal(tool.type, "revolve");
    const subtract = compiled.features.find((step) => step.id === cut.id);
    assert.deepEqual(subtract.inputs, [block.id, tool.id], "the block loses the tool, in that order");

    assert.deepEqual(run.issues, []);
    const measured = await volume(run.finalShape);
    const expected = 20 * 20 * 20 - Math.PI * 25 * 20; // the block less a full-height Ø10 bore
    assert.ok(Math.abs(measured - expected) < 1e-6, "measured " + measured + ", expected " + expected);
  } finally { releaseRegeneration(run); }
});

test("a partial revolve cut removes only the sector it is given", async () => {
  const { doc, profile, block } = documentWithBlock();
  createFeatureDefinition(doc, "revolveCut", {
    inputs: [block.id],
    references: { sketches: [profile.id], features: [block.id], topology: [], references: ["axis:y"] },
    params: { ...featureDefaults("revolveCut"), angle: 90, axis: "y", points: [{u:0,v:0},{u:5,v:0},{u:5,v:20},{u:0,v:20}] },
  });
  const { run } = await buildCompiled(doc);
  try {
    const measured = await volume(run.finalShape);
    const expected = 8000 - (Math.PI * 25 * 20) / 4;
    assert.ok(Math.abs(measured - expected) < 1e-6, "a quarter turn removes a quarter of the bore");
  } finally { releaseRegeneration(run); }
});

test("a sweep cut lowers to the sweep step plus a subtract and carves the channel", async () => {
  const { doc, profile, path, block } = documentWithBlock();
  const cut = createFeatureDefinition(doc, "sweepCut", {
    inputs: [block.id],
    references: { sketches: [profile.id, path.id], features: [block.id], topology: [], references: [] },
    params: {
      ...featureDefaults("sweepCut"),
      // a 3 x 3 section driven straight up the Y axis, out through both faces
      profile: [{x:-1.5,y:0,z:-1.5},{x:1.5,y:0,z:-1.5},{x:1.5,y:0,z:1.5},{x:-1.5,y:0,z:1.5}],
      path: [{x:0,y:-2,z:0},{x:0,y:22,z:0}],
    },
  });
  const { compiled, run } = await buildCompiled(doc);
  try {
    const steps = compiled.features.filter((step) => step.type !== "sketch").map((step) => step.type);
    assert.deepEqual(steps, ["box", "sweep", "subtract"], "the tool is an ordinary sweep");
    assert.equal(compiled.features.find((step) => step.id === cut.id + ":tool").type, "sweep");
    assert.deepEqual(run.issues, []);
    const measured = await volume(run.finalShape);
    assert.ok(Math.abs(measured - (8000 - 9 * 20)) < 1e-6, "measured " + measured + ", expected " + (8000 - 180));
  } finally { releaseRegeneration(run); }
});

test("a cut with no body is refused when it is authored, not at rebuild time", () => {
  const { doc, profile } = documentWithBlock();
  assert.throws(() => createFeatureDefinition(doc, "revolveCut", {
    inputs: [],
    references: { sketches: [profile.id], features: [], topology: [], references: ["axis:y"] },
    params: { ...featureDefaults("revolveCut"), axis: "y", points: [{u:0,v:0},{u:5,v:0},{u:5,v:20},{u:0,v:20}] },
  }), /requires 1 features selection/, "the selection rule is enforced where the feature is created");
  assert.equal((doc.features || []).some((feature) => feature.type === "revolveCut"), false, "and nothing half-made is left behind");
});

/* --- the editor wiring --------------------------------------------------- */

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = readFileSync(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("both cuts reach the ribbon and are gated on a body as well as a profile", () => {
  assert.equal(FEATURE_COMMAND.revolveCut, "revolvecutfeature");
  assert.equal(FEATURE_COMMAND.sweepCut, "sweepcutfeature");
  const editor = { docType: "part", def: { parts: [], sketches: [{ id:"a" }, { id:"b" }] } };
  // a closed profile and two sketches, but nothing to cut into
  const catalog = buildCommandCatalog({ t: (key) => key, editor, activeParts: () => [], closedSketchProfile: () => ({}) });
  ["revolvecutfeature", "sweepcutfeature"].forEach((id) => {
    const command = catalog.find((entry) => entry.id === id);
    assert.ok(command, id + " is a ribbon command");
    assert.equal(command.available(), false, id + " needs a body");
    assert.equal(command.reason(), "cmdNeedSolid", id + " says so");
  });
  // and with a body present both open
  const withBody = buildCommandCatalog({ t: (key) => key, editor, activeParts: () => [{ id: "p" }], closedSketchProfile: () => ({}) });
  ["revolvecutfeature", "sweepcutfeature"].forEach((id) => {
    assert.equal(withBody.find((entry) => entry.id === id).available(), true, id + " is available");
  });
});

test("the editor records each cut as a tool on the body, built by the additive maker", () => {
  assert.match(modeler, /else if \(id === "revolvecutfeature"\) openParametricFeature\("revolveCut"\);/);
  assert.match(modeler, /else if \(id === "sweepcutfeature"\) openParametricFeature\("sweepCut"\);/);
  assert.match(modeler, /else if\(type==="revolveCut"\)ok=createRevolveCutFeature/);
  assert.match(modeler, /else if\(type==="sweepCut"\)ok=createMultiSketchFeature\("sweepCut",params\);/);
  assert.match(modeler, /commandButton\("revolvecutfeature", t\("opRevolveCut"\)\)/);
  assert.match(modeler, /commandButton\("sweepcutfeature", t\("opSweepCut"\)\)/);
  // one cutter builder, and it calls the same two makers the bodies use
  const cutter = modeler.slice(modeler.indexOf("async function toolSolidBrep"), modeler.indexOf("var exactBuildTimers"));
  assert.match(partGeometry, /cut\.kind === "revolve"\) return makeBrepRevolve/);
  assert.match(partGeometry, /cut\.kind === "sweep"\) return makeBrepSweep/);
  assert.match(modeler, /cuts3d\.push\(\{kind:"revolve"/);
  assert.match(modeler, /cuts3d\.push\(\{kind:"sweep"/);
});

test("every subtractive-twin string exists in both languages", () => {
  ["opRevolveCut", "opSweepCut", "cutNeedExactBody", "fcFeatRevolveCut", "fcFeatSweepCut"].forEach((key) => {
    const match = modelerStrings.match(new RegExp("\\n  " + key + ': \\["([^"]+)", "([^"]+)"\\]'));
    assert.ok(match, key + " has a [he, en] pair in TXT");
    assert.notEqual(match[1], "", key + " has Hebrew");
    assert.notEqual(match[2], "", key + " has English");
  });
});

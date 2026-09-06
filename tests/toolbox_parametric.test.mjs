import test from "node:test";
import assert from "node:assert/strict";

import { createFeatureDefinition, createPartDocument, updateFeatureDefinition } from "../js/core/parametric_document.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { buildTreeModel } from "../js/core/tree_model.js";
import { TOOLBOX_FAMILIES } from "../js/toolbox/catalog.js";
import { generateToolboxPart } from "../js/toolbox/generate.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";

function familyParams(family, lod = 2) {
  const sizeKey = family.defaultSize || family.sizes?.[0]?.key || family.sizes?.[0]?.size;
  const params = { kind:family.kind, sizeKey, lod };
  if (family.hasLength) params.lengthMm = family.defaultLength
    || family.sizes?.find((row) => (row.key || row.size) === sizeKey)?.lengthMm
    || family.lengthOptions?.[0];
  Object.entries(family.options || {}).forEach(([key,values]) => { params[key] = values[0]; });
  return params;
}

test("a Toolbox insertion is one canonical editable feature and one body", () => {
  const document = createPartDocument({ name: "Toolbox feature" });
  const feature = createFeatureDefinition(document, "toolbox", {
    name: "M8×30 ISO 4762",
    params: { kind: "shcs", sizeKey: "M8", lengthMm: 30 },
  });

  assert.equal(document.history.length, 1);
  assert.equal(document.history[0].targetId, feature.id);
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true);
  assert.ok(compiled.features.some((item) => item.type === "union"));
  assert.equal(compiled.features.at(-1).id, feature.id);
  assert.equal(compiled.features.at(-1).type, "subtract");

  const rebuilt = rebuildParametricDocument(document);
  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.bodies.length, 1);
  assert.equal(rebuilt.bodies[0].featureId, feature.id);

  const tree = buildTreeModel(document, { authoringSystem: "parametric-v1", bodies: rebuilt.bodies });
  const bodySection = tree.nodes.find((node) => node.id === "section:bodies");
  assert.equal(bodySection.children.length, 1);
});

test("editing Toolbox length regenerates kernel geometry from feature parameters", () => {
  const document = createPartDocument({ name: "Editable Toolbox feature" });
  const feature = createFeatureDefinition(document, "toolbox", {
    params: { kind: "shcs", sizeKey: "M8", lengthMm: 30 },
  });
  const shank = () => compileKernelFeatureTree(document).features.find((item) => item.id === feature.id + ":part:0");

  assert.equal(shank().params.h, 3);
  updateFeatureDefinition(document, feature.id, { params: { lengthMm: 50 } });
  assert.equal(shank().params.h, 5);
  assert.equal(document.history.length, 1);
});

test("Toolbox exact geometry is independent of viewport LOD", () => {
  const compile = (lod) => {
    const document = createPartDocument({ name:"LOD independence" });
    createFeatureDefinition(document, "toolbox", { id:"feature:toolbox", params:{ kind:"shcs", sizeKey:"M8", lengthMm:30, groupId:"feature:toolbox", lod } });
    return compileKernelFeatureTree(document).features.map((feature) => ({ id:feature.id, type:feature.type, params:feature.params, inputs:feature.inputs }));
  };
  assert.deepEqual(compile(0), compile(2));
});

test("Toolbox source options preserve a stable instance group", () => {
  const first = generateToolboxPart({ kind:"shcs", sizeKey:"M8", lengthMm:30, groupId:"feature:stable", lod:2 });
  const second = generateToolboxPart(first.sourceOptions);
  assert.equal(first.sourceOptions.groupId, "feature:stable");
  assert.equal(second.groupId, first.groupId);
  assert.ok(second.parts.every((part) => part.standardGroupId === "feature:stable"));
});

test("invalid Toolbox catalog edits become rebuild diagnostics instead of throws", () => {
  const document = createPartDocument({ name:"Invalid Toolbox edit" });
  const feature = createFeatureDefinition(document, "toolbox", { params:{ kind:"shcs", sizeKey:"M8", lengthMm:30 } });
  feature.params.kind = "not-a-family";
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, false);
  assert.ok(compiled.issues.some((issue) => issue.featureId === feature.id && issue.code === "feature-lowering-failed"));
  const rebuilt = rebuildParametricDocument(document);
  assert.equal(rebuilt.ok, false);
  assert.ok(rebuilt.issues.some((issue) => issue.featureId === feature.id));
});

test("every Toolbox family executes through the exact BREP kernel", { timeout:30000 }, async () => {
  const failures = [];
  for (const family of TOOLBOX_FAMILIES) {
    const document = createPartDocument({ name:family.kind });
    const feature = createFeatureDefinition(document, "toolbox", { name:family.kind, params:familyParams(family, 0) });
    feature.params.groupId = feature.id;
    const compiled = compileKernelFeatureTree(document);
    let run;
    try {
      run = await regenerateFeatures({ ...compiled.document, features:compiled.features });
      if (!compiled.ok || !run.ok || !run.finalShape) failures.push({ family:family.kind, compile:compiled.issues, exact:run.issues });
    } catch (error) {
      failures.push({ family:family.kind, error:String(error.message || error) });
    } finally {
      if (run) releaseRegeneration(run);
    }
  }
  assert.deepEqual(failures, []);
});

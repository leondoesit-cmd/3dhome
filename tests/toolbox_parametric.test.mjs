import test from "node:test";
import assert from "node:assert/strict";

import { createFeatureDefinition, createPartDocument, updateFeatureDefinition } from "../js/core/parametric_document.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { buildTreeModel } from "../js/core/tree_model.js";

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

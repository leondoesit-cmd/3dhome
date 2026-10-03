import test from "node:test";
import assert from "node:assert/strict";
import { toolboxFastener } from "../js/cad_toolbox.js";
import { ensureConfigurations, captureConfiguration, setActiveConfiguration } from "../js/cad_configurations.js";
import { restoreToolboxProjections } from "../js/core/toolbox_projection_restore.js";

function fixture() {
  const feature = { id: "screw", type: "toolbox", params: { kind: "shcs", size: "M6", sizeKey: "M6", lengthMm: 25, threadMode: "cosmetic", lod: 2 } };
  const generated = toolboxFastener(feature.params);
  assert.equal(generated.ok, true);
  return { features: [feature], parts: generated.parts.map((part, i) => ({ ...part, ...(i === 2 ? { id: "socket" } : {}), featureId: feature.id, toolboxFeatureId: feature.id })) };
}

test("idless legacy Toolbox appearances roundtrip by unambiguous recipe role and retain current standard metadata", () => {
  const document = fixture();
  Object.assign(document.parts[0], { materialName: "Alloy Steel", materialCatalogId: "stock:alloy-steel", density: 7.7 });
  ensureConfigurations(document);
  const short = document.activeConfiguration;
  document.features[0].params.lengthMm = 70;
  const long = captureConfiguration(document, { name: "M6x70" });
  // Reproduce snapshots saved before projection roles were included.
  document.configurations.forEach(cfg => cfg.modelValues.appearances.forEach(row => {
    delete row.toolboxFeatureId; delete row.toolboxProjectionIndex;
  }));
  const reopened = JSON.parse(JSON.stringify(document));
  let identities;
  for (const id of [long.id, short, long.id, short]) {
    setActiveConfiguration(reopened, id);
    assert.equal(reopened.parts[0].materialName, "Alloy Steel");
    assert.equal(reopened.parts[0].density, 7.7);
    assert.ok(reopened.parts.every(part => part.materialName === "Alloy Steel" && part.density === 7.7), "fused substrate projections share the assigned body material");
    assert.equal(reopened.toolboxParts[0].material, "Alloy Steel");
    assert.equal(reopened.toolboxParts[0].propertyClass, null, "substitution cannot certify catalog strength");
    assert.equal(reopened.toolboxParts[0].catalogPropertyClass, "8.8");
    assert.equal(new Set(reopened.parts.map(part => part.id)).size, 3);
    assert.ok(reopened.parts.every(part => part.id));
    const current = reopened.parts.map(part => part.id);
    if (identities) assert.deepEqual(current, identities);
    identities = current;
    const length = id === short ? 25 : 70;
    assert.ok(reopened.parts.every(part => !part.standardPart || part.standardPart.designation.includes("x " + length)), "BOM identities follow the active length");
    assert.equal(reopened.parts[0].standardCompliance.lengthMm, length);
  }
});

test("Toolbox feature replay preserves authored qualification and stable projection IDs while updating geometry", () => {
  const document = fixture(), feature = document.features[0];
  Object.assign(document.parts[0], { materialQualificationId: "qualified-alloy", materialName: "Alloy Steel", density: 7.7 });
  restoreToolboxProjections(document, feature, toolboxFastener(feature.params));
  const ids = document.parts.map(part => part.id);
  feature.params.lengthMm = 70;
  restoreToolboxProjections(document, feature, toolboxFastener(feature.params));
  assert.deepEqual(document.parts.map(part => part.id), ids);
  assert.equal(document.parts[0].materialQualificationId, "qualified-alloy");
  assert.equal(document.parts[0].density, 7.7);
  ensureConfigurations(document);
  const cfg = document.activeConfiguration;
  const reopened = JSON.parse(JSON.stringify(document));
  reopened.parts[0].materialQualificationId = "wrong";
  setActiveConfiguration(reopened, cfg);
  assert.equal(reopened.parts[0].materialQualificationId, "qualified-alloy");
  assert.equal(reopened.parts[0].standardCompliance.lengthMm, 70);
});

test("editing recipe material and finish replaces unqualified catalog defaults through cold replay", () => {
  const document = fixture(), feature = document.features[0];
  restoreToolboxProjections(document, feature, toolboxFastener(feature.params));
  const ids = document.parts.map(part => part.id);
  assert.equal(document.parts[0].materialName, "Steel 8.8 Zinc");
  feature.params.material = "steel";
  feature.params.finish = "black-oxide";
  restoreToolboxProjections(document, feature, toolboxFastener(feature.params));
  const reopened = JSON.parse(JSON.stringify(document));
  restoreToolboxProjections(reopened, reopened.features[0], toolboxFastener(reopened.features[0].params));
  assert.deepEqual(reopened.parts.map(part => part.id), ids);
  assert.ok(reopened.parts.every(part => part.materialName === "Steel" && part.materialCatalogId === "toolbox:steel"));
  assert.equal(reopened.toolboxParts[0].material, "Steel");
  assert.equal(reopened.toolboxParts[0].finish, "Black Oxide");
  assert.ok(!reopened.toolboxParts[0].propertyClass, "generic steel does not certify 8.8");
  assert.equal(reopened.parts.find(part => part.previewOnly).opacity, 0);
});

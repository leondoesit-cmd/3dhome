import test from "node:test";
import assert from "node:assert/strict";
import { toolboxFastener, toolboxBOMFromParts, collectToolboxItems } from "../js/cad_toolbox.js";
import { synchronizeToolboxMaterial } from "../js/core/toolbox_assigned_material.js";

test("legacy secondary default appearances cannot advertise catalog strength after body material substitution", () => {
  const generated = toolboxFastener({ kind: "shcs", size: "M6", lengthMm: 70, lod: 2, threadMode: "cosmetic" });
  const parts = generated.parts.map(part => ({ ...part, toolboxFeatureId: "screw" }));
  Object.assign(parts[1], { materialCatalogId: "stock:alloy-steel", materialName: "Alloy Steel", density: 7.7 });
  const original = JSON.stringify(parts);
  const row = toolboxBOMFromParts(parts)[0];
  assert.equal(row.quantity, 1);
  assert.equal(row.material, "Alloy Steel");
  assert.equal(row.materialId, "stock:alloy-steel");
  assert.equal(row.propertyClass, "");
  assert.equal(row.designation, "ISO 4762 - M6 x 70");
  assert.equal(JSON.stringify(parts), original, "BOM reading never rewrites legacy geometry");
  const assemblyRow = collectToolboxItems({ components: [{ standardPart: generated.metadata, def: { parts } }] })[0];
  assert.equal(assemblyRow.material, "Alloy Steel");
  assert.equal(assemblyRow.propertyClass, "");
  const document = { parts, toolboxParts: [{ ...generated.metadata, featureId: "screw" }] };
  const ids = parts.map(part => part.id);
  const cutter = parts.find(part => part.previewOnly);
  assert.equal(cutter.opacity, 0);
  parts[1].materialQualificationId = "qualified-alloy";
  synchronizeToolboxMaterial(document, "screw");
  assert.ok(parts.every(part => part.standardPart.material === "Alloy Steel" && part.standardPart.propertyClass === null));
  assert.equal(document.toolboxParts[0].catalogPropertyClass, "8.8");
  assert.equal(document.toolboxParts[0].catalogDesignation, "ISO 4762 - M6 x 70 - 8.8");
  assert.ok(parts.every(part => part.materialName === "Alloy Steel" && part.density === 7.7 && part.materialQualificationId === "qualified-alloy"));
  assert.deepEqual(parts.map(part => part.id), ids);
  assert.equal(cutter.opacity, 0);
  assert.equal(cutter.previewOnly, true);
  synchronizeToolboxMaterial(document, "screw");
  assert.equal(document.toolboxParts[0].designation, "ISO 4762 - M6 x 70", "repeated synchronization stays stable");
  const head = parts[1];
  Object.assign(head, { materialName: "Steel", materialCatalogId: "stock:steel", density: 7.85 });
  delete head.materialQualificationId;
  synchronizeToolboxMaterial(document, "screw", head);
  assert.ok(parts.every(part => part.materialName === "Steel" && part.density === 7.85 && !part.materialQualificationId), "a later assignment on any fused projection replaces the previous substrate material");
});

test("a standard nylon insert is a constituent material, not a manual nut-body substitution", () => {
  const generated = toolboxFastener({ kind: "nyloc-nut", size: "M8" });
  assert.equal(generated.ok, true);
  const row = toolboxBOMFromParts(generated.parts)[0];
  assert.equal(row.material, generated.metadata.material);
  assert.equal(row.materialId, generated.metadata.materialId);
  const parts = generated.parts.map(part => ({ ...part, toolboxFeatureId: "nut" }));
  const insert = parts.find(part => part.materialId === "nylon");
  const originalInsert = structuredClone(insert);
  Object.assign(parts[0], { materialName: "Alloy Steel", materialCatalogId: "stock:alloy-steel", density: 7.7 });
  synchronizeToolboxMaterial({ parts, toolboxParts: [{ ...generated.metadata, featureId: "nut" }] }, "nut");
  assert.equal(parts[0].materialName, "Alloy Steel");
  for (const key of ["materialName", "materialCatalogId", "materialId", "density", "color", "metal", "rough"]) assert.equal(insert[key], originalInsert[key], key);
});

test("an unmodified catalog fastener retains its actual selected property class", () => {
  const generated = toolboxFastener({ kind: "shcs", size: "M6", lengthMm: 25 });
  const row = toolboxBOMFromParts(generated.parts)[0];
  assert.equal(row.material, generated.metadata.material);
  assert.equal(row.propertyClass, "8.8");
  assert.equal(row.designation, "ISO 4762 - M6 x 25 - 8.8");
});

test("nut designation and BOM identity omit a leftover screw-picker length", () => {
  const short = toolboxFastener({ kind: "hex-nut", size: "M6", lengthMm: 20 });
  const long = toolboxFastener({ kind: "hex-nut", size: "M6", lengthMm: 70 });
  assert.equal(short.metadata.designation, "ISO 4032:2023 - M6");
  assert.equal(short.metadata.dimensionsMm.lengthMm, undefined);
  assert.equal(short.metadata.dimensionsMm.headHeightMm, 5.2);
  assert.equal(short.metadata.catalogKey, long.metadata.catalogKey);
  assert.equal(toolboxBOMFromParts(short.parts.concat(long.parts))[0].quantity, 2);
});

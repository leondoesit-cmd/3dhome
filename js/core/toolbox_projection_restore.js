export const partAppearanceKeys = ["color", "metal", "rough", "opacity", "density", "materialName", "materialCatalogId", "materialQualificationId", "densitySource", "customProperties"];

// A Toolbox recipe has one native body, but several disposable viewport
// primitives. Give those primitives stable identities and retain authored
// appearance while replacing dimensions and standard-part metadata.
export function restoreToolboxProjections(document, feature, generated) {
  if (!feature.toolboxAutoName || feature.name === feature.toolboxAutoName) {
    feature.name = generated.callout;
    feature.toolboxAutoName = generated.callout;
    const history = (document.history || []).find(item => item.targetId === feature.id);
    if (history) history.name = feature.name;
  }
  const previous = (document.parts || []).filter(part => part.toolboxFeatureId === feature.id);
  const used = new Set();
  const parts = generated.parts.map((item, index) => {
    const old = previous.find(part => !used.has(part) && part.toolboxProjectionIndex === index) ||
      previous.find(part => !used.has(part) && part.kind === item.kind && part.name === item.name) || previous[index];
    if (old) used.add(old);
    const appearance = {};
    // Unqualified Toolbox appearances belong to the recipe. Changing its
    // material/finish must replace those defaults, while a separately assigned
    // stock or qualified material survives dimensional replay.
    const recipeAppearance = old?.materialCatalogId?.startsWith("toolbox:") && !old.materialQualificationId;
    if (old) for (const key of partAppearanceKeys) {
      if (recipeAppearance && key !== "opacity" && key !== "customProperties") continue;
      if (old[key] !== undefined) appearance[key] = old[key];
    }
    return { ...item, ...appearance, id: old?.id || feature.id + ":projection:" + index,
      featureId: feature.id, toolboxFeatureId: feature.id, toolboxProjectionIndex: index };
  });
  const first = (document.parts || []).findIndex(part => part.toolboxFeatureId === feature.id);
  document.parts = (document.parts || []).filter(part => part.toolboxFeatureId !== feature.id);
  document.parts.splice(first < 0 ? document.parts.length : first, 0, ...parts);
  document.toolboxParts = (document.toolboxParts || []).filter(item => item.featureId !== feature.id);
  document.toolboxParts.push({ featureId: feature.id, ...generated.metadata });
  synchronizeToolboxMaterial(document, feature.id);
  return parts;
}
import { synchronizeToolboxMaterial } from "./toolbox_assigned_material.js";

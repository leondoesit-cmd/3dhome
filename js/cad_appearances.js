import { cylinderAxis } from "./core/cylinder_axis.js";
import { frameFromPlane } from "./core/frame.js";
import { TOOLBOX_MATERIALS } from "./toolbox/schema.js";
// Per-face / per-body appearances and press-fit inserts. An appearance override
// stores a topology reference plus a material; it never mutates the solid, so
// a brass bushing lining and a painted housing can share one body tree.

export const STOCK_MATERIALS = Object.freeze({
  aluminum1060: { name: "Aluminum 1060", color: "#b7c7cf", metal: 0.72, rough: 0.32,
    density: 0.0975 * 453.59237 / (2.54 ** 3),
    densitySource: "Hydro Alloy 1xxx, revision 2019/01, p. 1: 0.0975 lb/in³ (nominal)",
    densitySourceUrl: "https://www.hydro.com/globalassets/01-products--services/extruded-profiles/americas/ena-resources/alloy-data-sheets/hydro_2019_data_sheet_1xxx.pdf" },
  aluminum2014: { name: "Aluminum 2014", color: "#b7c7cf", metal: 0.72, rough: 0.32, density: 2.80,
    densitySource: "Worthwill Aluminum, Density of Aluminum, p. 1: 2014, 2.8 g/cm³",
    densitySourceUrl: "https://www.worthwillaluminium.com/weight-calculator/density-table/density-dataset-en.pdf" },
  aluminum: { name: "Aluminum 6061", color: "#8fb8c4", metal: 0.72, rough: 0.32, density: 2.70 },
  steel: { name: "Steel 304", color: "#aeb7c2", metal: 0.78, rough: 0.28, density: 8.00,
    densitySource: "Atlas Steels Product Reference Manual, Section 9 Physical Properties, p. 7 (October 2016): 304/S30400, 8000 kg/m³ (8.0 g/cm³); representative CAD reference density, not cast-grade certification",
    densitySourceUrl: "https://atlassteels.com.au/documents/9-Appendices.pdf#page=7" },
  aisi1020: { name: "AISI 1020 (SOLIDWORKS reference)", color: "#a7adb2", metal: 0.76, rough: 0.40, density: 7.90,
    densitySource: "SOLIDWORKS Student Workbook 2011, Appendix A: AISI 1020, 0.0079 g/mm³; CAD reference density",
    densitySourceUrl: "https://www.solidworks.com/sw/docs/Student_WB_2011_ENG.pdf" },
  plainCarbonSteel: { name: "Plain Carbon Steel (grade unspecified)", color: "#a7adb2", metal: 0.76, rough: 0.40, density: 7.85,
    densitySource: "Alleima 20C carbon steel material datasheet: 7.85 g/cm³; representative reference density, not a certified grade",
    densitySourceUrl: "https://www.alleima.com/en/technical-center/material-datasheets/strip-steel/alleima-20c/" },
  castAlloySteel: { name: "Cast Alloy Steel (SOLIDWORKS reference)", color: "#a6adb4", metal: 0.78, rough: 0.42, density: 7.30,
    densitySource: "SDC Publications, Beginner's Guide to SolidWorks 2011, p. 66: Cast Alloy Steel library density 7300 kg/m³; reference material, grade unspecified",
    densitySourceUrl: "https://static.sdcpublications.com/pdfsample/978-1-58503-626-4-2.pdf" },
  alloySteel: { name: "Alloy Steel (SOLIDWORKS reference)", color: "#a6adb4", metal: 0.78, rough: 0.42, density: 7.70,
    densitySource: "SOLIDWORKS Simulation API, Apply Material to Bodies example: Alloy Steel DENS 7700 kg/m³; educational reference, grade unspecified, not a load certification",
    densitySourceUrl: "https://help.solidworks.com/2024/English/api/swsimulationapi/Apply_Material_to_Bodies_Example_VBNET.htm",
    referenceYoungModulusMPa: 210000, referencePoissonRatio: 0.28 },
  ferriticStainless: { name: "Ferritic stainless steel (grade unspecified)", color: "#aeb7c2", metal: 0.78, rough: 0.28, density: 7.70,
    densitySource: "ISSF, The Ferritic Solution, p. 28: typical ferritic-family density 7.7 g/cm³; grade unspecified",
    densitySourceUrl: "https://www.worldstainless.org/Files/issf/non-image-files/PDF/ISSF_The_Ferritic_Solution_English.pdf" },
  copper: { name: "Copper (grade unspecified)", color: "#b87333", metal: 0.80, rough: 0.30,
    density: 0.321 * 453.59237 / (2.54 ** 3),
    densitySource: "Planchard, Engineering Graphics with SOLIDWORKS 2021, exercise 5.11: 0.321 lb/in³; grade unspecified" },
  brass: { name: "Brass C360", color: "#c4a35a", metal: 0.65, rough: 0.28, density: 8.50 },
  plastic: { name: "ABS", color: "#3d6ea8", metal: 0.04, rough: 0.55, density: 1.04 },
  pbtGeneralPurpose: { name: "PBT General Purpose (unfilled reference)", color: "#30343b", metal: 0.02, rough: 0.55, density: 1.31,
    densitySource: "Celanese, Celanex PBT Short-Term Properties Guide: unfilled 2002 specific gravity 1.31 (ASTM D792); representative grade reference, not the SOLIDWORKS library value",
    densitySourceUrl: "https://www.celanese.com/-/media/Engineered-Materials/Files/Product-Technical-Guides/POM-031R1_HostaformPOM-PTXfuelPPT_AM_0314.pdf" },
  titanium: { name: "Titanium Grade 5", color: "#9aa3ad", metal: 0.7, rough: 0.35, density: 4.43 },
  rubber: { name: "Nitrile rubber (NBR-770 reference)", color: "#2a2a2c", metal: 0.02, rough: 0.72, density: 1.30,
    densitySource: "Burly Seal Products, NBR-770 Nitrile 70 Shore A: specific gravity 1.30; nominal CAD reference density 1.30 g/cm³, not the book's unspecified Rubber library value or a material/load certification",
    densitySourceUrl: "https://www.burlyseal.com/materials/" },
  polycarbonate: { name: "Polycarbonate", color: "#c5d4dc", metal: 0.04, rough: 0.22, density: 1.20 },
});

export const DEFAULT_MASS_DENSITY = 7.85;

export function stockMaterialKey(part) {
  const catalog = String(part?.materialCatalogId || "");
  if (catalog.startsWith("stock:")) return catalog.slice(6);
  if (part?.material && STOCK_MATERIALS[part.material]) return part.material;
  if (part?.materialName) {
    const hit = Object.keys(STOCK_MATERIALS).find((key) => STOCK_MATERIALS[key].name === part.materialName);
    if (hit) return hit;
  }
  return null;
}

export function stockMaterialForPart(part) {
  const key = stockMaterialKey(part);
  return key ? STOCK_MATERIALS[key] : null;
}

export function drawingMaterialName(def) {
  if (def?.material) return def.material;
  if (def?.kind === "assembly" || def?.parts?.length !== 1) return "";
  const part = def.parts[0];
  return stockMaterialForPart(part)?.name || part.materialName || "";
}

export function partMaterialDensity(part, fallback = DEFAULT_MASS_DENSITY) {
  const authored = Number(part?.density);
  if (Number.isFinite(authored) && authored > 0) return authored;
  const stock = stockMaterialForPart(part);
  if (stock?.density > 0) return stock.density;
  const catalog = String(part?.materialCatalogId || "");
  if (catalog.startsWith("toolbox:")) {
    const row = TOOLBOX_MATERIALS[catalog.slice(8)];
    if (row?.density > 0) return row.density;
  }
  if (part?.materialId && TOOLBOX_MATERIALS[part.materialId]?.density > 0) {
    return TOOLBOX_MATERIALS[part.materialId].density;
  }
  const custom = Number(part?.customDensity);
  if (catalog === "custom" && custom > 0) return custom;
  return Number(fallback) > 0 ? Number(fallback) : DEFAULT_MASS_DENSITY;
}

export function createAppearanceOverride(options = {}) {
  const stock = STOCK_MATERIALS[options.material] || null;
  return {
    id: options.id || "app_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    persistentId: options.persistentId || null,
    kind: options.kind || "face",
    material: options.material || null,
    opacity: Number.isFinite(Number(options.opacity)) ? Math.max(0, Math.min(1, Number(options.opacity))) : 1,
    name: options.name || stock?.name || "Custom",
    color: options.color || stock?.color || "#888888",
    metal: Number.isFinite(Number(options.metal)) ? Number(options.metal) : (stock?.metal ?? 0.1),
    rough: Number.isFinite(Number(options.rough)) ? Number(options.rough) : (stock?.rough ?? 0.5),
  };
}

export function applyAppearanceOverrides(parts, overrides = []) {
  if (!overrides.length) return parts;
  const byId = new Map(overrides.filter((item) => item.kind === "body" || item.kind === "part").map((item) => [item.persistentId, item]));
  return (parts || []).map((part) => {
    const hit = byId.get(part.id) || byId.get(part.featureId);
    if (!hit) return part;
    return { ...part, color: hit.color, metal: hit.metal, rough: hit.rough, materialName: hit.name, appearanceId: hit.id };
  });
}

/* An older material-pane path could attach a body override to a selected
   sketch point. Such an override cannot paint a solid and should not survive
   the next save. Keep every real body/feature target, including suppressed
   feature targets, and leave face/edge appearances untouched. */
export function pruneSketchTargetedBodyAppearances(def) {
  if (!Array.isArray(def?.appearances) || !def.appearances.length) return 0;
  const sketchIds = new Set((def.sketches || []).flatMap((sketch) => [
    ...(sketch.points || []).map((point) => point.id),
    ...(sketch.entities || []).map((entity) => entity.id),
  ]));
  if (!sketchIds.size) return 0;
  const bodyIds = new Set([
    ...(def.parts || []).flatMap((part) => [part.id, part.featureId, part.derivedFeatureId]),
    ...(def.features || []).map((feature) => feature.id),
  ]);
  const before = def.appearances.length;
  def.appearances = def.appearances.filter((item) =>
    !((item.kind === "body" || item.kind === "part") && sketchIds.has(item.persistentId) && !bodyIds.has(item.persistentId)));
  return before - def.appearances.length;
}

// The same legacy selection path also copied body-material fields onto sketch
// points. Keep intentional point styling alone; remove only points that carry
// unmistakable material metadata, along with the finish fields copied with it.
export function pruneSketchMaterialFields(def) {
  let cleaned = 0;
  const fields = ["materialCatalogId", "materialQualificationId", "materialName", "density", "densitySource", "color", "metal", "rough"];
  for (const sketch of def?.sketches || []) {
    for (const point of sketch.points || []) {
      if (point.materialCatalogId == null && point.materialQualificationId == null && point.materialName == null && point.density == null) continue;
      for (const field of fields) delete point[field];
      cleaned++;
    }
  }
  return cleaned;
}

export function faceAppearanceOverrides(overrides = []) {
  return (overrides || []).filter((item) => item.kind === "face" && item.persistentId);
}

export function upsertAppearanceOverride(overrides, next) {
  const list = Array.isArray(overrides) ? overrides.slice() : [];
  if (!next || !next.persistentId) return list.concat(next ? [next] : []);
  const index = list.findIndex((item) => item.persistentId === next.persistentId && item.kind === next.kind);
  if (index < 0) {
    list.push(next);
    return list;
  }
  list[index] = { ...list[index], ...next, id: list[index].id };
  return list;
}

export function appearanceForReference(overrides, reference) {
  if (!reference) return null;
  return (overrides || []).find((item) => item.persistentId === reference.persistentId && (!item.kind || item.kind === reference.kind)) || null;
}

export function normalizeInsertFeature(params = {}) {
  const innerMm = Number(params.innerMm) || Number(params.diameterMm) || 8;
  const outerMm = Number(params.outerMm) || innerMm + 4;
  const lengthMm = Number(params.lengthMm) || innerMm * 1.25;
  const material = params.material && STOCK_MATERIALS[params.material] ? params.material : "brass";
  const stock = STOCK_MATERIALS[material];
  return {
    innerMm, outerMm, lengthMm,
    inner: innerMm / 10, outer: outerMm / 10, length: lengthMm / 10,
    material, materialName: stock.name,
    color: params.color || stock.color, metal: stock.metal, rough: stock.rough,
    mergeResult: false,
    origin: params.origin || { x: 0, y: 0, z: 0 },
    axis: cylinderAxis(params.axis),
  };
}

export function insertBody(params) {
  const insert = normalizeInsertFeature(params);
  const segs = 24, r = insert.inner / 2;
  const hole = Array.from({ length: segs }, (_, i) => {
    const a = (i / segs) * Math.PI * 2;
    return { u: Math.cos(a) * r, v: Math.sin(a) * r };
  });
  const outer = Array.from({ length: segs }, (_, i) => {
    const a = (i / segs) * Math.PI * 2, r = insert.outer / 2;
    return { u: Math.cos(a) * r, v: Math.sin(a) * r };
  });
  return {
    kind: "ext",
    name: insert.materialName + " insert",
    axis: insert.axis,
    frame: frameFromPlane(insert.origin,insert.axis),
    from: 0, to: insert.length,
    pts: outer,
    holes: [hole],
    color: insert.color, metal: insert.metal, rough: insert.rough,
    materialName: insert.materialName,
    manufacturingRole: "insert",
    insert: insert,
  };
}

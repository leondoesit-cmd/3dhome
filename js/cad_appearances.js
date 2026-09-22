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
  steel: { name: "Steel 304", color: "#aeb7c2", metal: 0.78, rough: 0.28, density: 8.00 },
  castAlloySteel: { name: "Cast Alloy Steel (SOLIDWORKS reference)", color: "#a6adb4", metal: 0.78, rough: 0.42, density: 7.30,
    densitySource: "SDC Publications, Beginner's Guide to SolidWorks 2011, p. 66: Cast Alloy Steel library density 7300 kg/m³; reference material, grade unspecified",
    densitySourceUrl: "https://static.sdcpublications.com/pdfsample/978-1-58503-626-4-2.pdf" },
  ferriticStainless: { name: "Ferritic stainless steel (grade unspecified)", color: "#aeb7c2", metal: 0.78, rough: 0.28, density: 7.70,
    densitySource: "ISSF, The Ferritic Solution, p. 28: typical ferritic-family density 7.7 g/cm³; grade unspecified",
    densitySourceUrl: "https://www.worldstainless.org/Files/issf/non-image-files/PDF/ISSF_The_Ferritic_Solution_English.pdf" },
  copper: { name: "Copper (grade unspecified)", color: "#b87333", metal: 0.80, rough: 0.30,
    density: 0.321 * 453.59237 / (2.54 ** 3),
    densitySource: "Planchard, Engineering Graphics with SOLIDWORKS 2021, exercise 5.11: 0.321 lb/in³; grade unspecified" },
  brass: { name: "Brass C360", color: "#c4a35a", metal: 0.65, rough: 0.28, density: 8.50 },
  plastic: { name: "ABS", color: "#3d6ea8", metal: 0.04, rough: 0.55, density: 1.04 },
  titanium: { name: "Titanium Grade 5", color: "#9aa3ad", metal: 0.7, rough: 0.35, density: 4.43 },
  rubber: { name: "Nitrile rubber", color: "#2a2a2c", metal: 0.02, rough: 0.72, density: 1.30 },
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

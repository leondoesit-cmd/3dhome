// Per-face / per-body appearances and press-fit inserts. An appearance override
// stores a topology reference plus a material; it never mutates the solid, so
// a brass bushing lining and a painted housing can share one body tree.

export const STOCK_MATERIALS = Object.freeze({
  aluminum: { name: "Aluminum 6061", color: "#8fb8c4", metal: 0.72, rough: 0.32, density: 2.70 },
  steel: { name: "Steel 304", color: "#aeb7c2", metal: 0.78, rough: 0.28, density: 8.00 },
  brass: { name: "Brass C360", color: "#c4a35a", metal: 0.65, rough: 0.28, density: 8.50 },
  plastic: { name: "ABS", color: "#3d6ea8", metal: 0.04, rough: 0.55, density: 1.04 },
  titanium: { name: "Titanium Grade 5", color: "#9aa3ad", metal: 0.7, rough: 0.35, density: 4.43 },
});

export function createAppearanceOverride(options = {}) {
  const stock = STOCK_MATERIALS[options.material] || null;
  return {
    id: options.id || "app_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    persistentId: options.persistentId || null,
    kind: options.kind || "face",
    material: options.material || null,
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
    axis: params.axis || { x: 0, y: 1, z: 0 },
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
    axis: "y",
    from: insert.origin.y, to: insert.origin.y + insert.length,
    pts: outer,
    holes: [hole],
    x: insert.origin.x, z: insert.origin.z,
    color: insert.color, metal: insert.metal, rough: insert.rough,
    materialName: insert.materialName,
    manufacturingRole: "insert",
    insert: insert,
  };
}

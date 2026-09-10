import { cloneDomain } from "./schema.js";
import { mergeCabinetAdvanced } from "./cabinet_advanced.js";

export function safeId(value) {
  return String(value == null ? "part" : value).replace(/[^A-Za-z0-9:_-]/g, "_");
}

function layoutPartToEditor(part, stableId) {
  const common = {
    id: stableId,
    featureId: "feature:" + stableId,
    name: part.role || part.mat || "Cabinet part",
    color: part.mat === "front" || part.mat === "doorPanel" ? "#d0b48c" : part.mat === "metal" ? "#8c9298" : "#e2ded4",
    metal: part.mat === "metal" || part.mat === "handle" || part.mat === "rail" ? 0.75 : 0.04,
    rough: part.mat === "metal" || part.mat === "handle" || part.mat === "rail" ? 0.3 : 0.72,
    role: part.role,
    materialRole: part.mat,
    cabinetUnit: part.unit,
    source: cloneDomain(part),
  };
  if (part.k === "box") return { ...common, kind: "box", x0: part.x0, x1: part.x1, y0: part.y0, y1: part.y1, z0: part.z0, z1: part.z1 };
  if (part.k === "cyl") {
    const rx = part.rx || 0, rz = part.rz || 0;
    const axis = { x: -Math.sin(rz), y: Math.cos(rx) * Math.cos(rz), z: Math.sin(rx) * Math.cos(rz) };
    return { ...common, kind: "cyl", x: part.x - axis.x * part.hgt / 2, y: part.y - axis.y * part.hgt / 2, z: part.z - axis.z * part.hgt / 2, r: part.r, h: part.hgt, axis };
  }
  if (part.k === "sph") return { ...common, kind: "sph", x: part.x, y: part.y, z: part.z, r: part.r };
  if (part.k === "poly" && Array.isArray(part.pts)) {
    return { ...common, kind: "ext", axis: "y", from: part.y0, to: part.y1, pts: part.pts.map((point) => ({ u: point.x, v: point.z })) };
  }
  return null;
}

export function semanticCabinetParts(layout) {
  const occurrences = new Map();
  return layout.parts.map((part) => {
    const role = safeId(part.role || part.mat || part.k);
    const unit = part.unit == null ? "fixed" : "unit_" + safeId(part.unit);
    const family = role + ":" + unit;
    const occurrence = (occurrences.get(family) || 0) + 1;
    occurrences.set(family, occurrence);
    return layoutPartToEditor(part, "cabpart:" + family + ":" + occurrence);
  }).filter(Boolean);
}


// Manufacturing consumes the same edited board envelopes as the model editor.
export function cabinetLayoutParts(parts) {
  const roles = { panel: "divider", trim: "plinth", front: "door", hardware: "metal" };
  const materials = { board: "carcass", front: "front", back: "back", metal: "metal" };
  return parts.filter((part) => !part.suppressed).map((part) => {
    const source = cloneDomain(part.source || {});
    const common = { ...source, role: roles[part.role] || part.role || source.role,
      mat: materials[part.materialRole] || part.materialRole || source.mat || "carcass", unit: part.cabinetUnit, authoredPartId: part.id };
    if (part.kind === "box") return { ...common, k: "box", x0: part.x0, x1: part.x1, y0: part.y0, y1: part.y1, z0: part.z0, z1: part.z1 };
    if (part.kind === "cyl") return { ...common, k: "cyl", x: part.x + (part.axis?.x || 0) * part.h / 2, y: part.y + (part.axis?.y ?? 1) * part.h / 2, z: part.z + (part.axis?.z || 0) * part.h / 2, r: part.r, hgt: part.h, rx: source.rx, rz: source.rz };
    if (part.kind === "sph") return { ...common, k: "sph", x: part.x, y: part.y, z: part.z, r: part.r };
    if (part.kind === "ext" && part.axis === "y" && !part.frame) {
      const pts = (part.pts || []).map((point) => ({ x: point.u, z: point.v }));
      const xs = pts.map((point) => point.x), zs = pts.map((point) => point.z);
      return { ...common, k: "poly", pts, y0: part.from, y1: part.to,
        bw: Math.max(...xs) - Math.min(...xs), bd: Math.max(...zs) - Math.min(...zs),
        x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    }
    return { ...common, k: "authored", manufacturingIncomplete: true };
  });
}

export function applyCabinetLayoutEdits(layout, edits) {
  if (!edits) return layout;
  const parts = mergeCabinetAdvanced(semanticCabinetParts(layout), edits, "Part");
  layout.parts = cabinetLayoutParts(parts);
  return layout;
}

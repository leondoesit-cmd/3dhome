// LOD triangle meshes for toolbox solids. The viewport still draws document
// primitives; this concatenates the same tessellation the drawing sheet uses
// so a coarse LOD is a cheaper envelope, not a different part.

import { tessellateParts } from "../core/part_tessellate.js";
import { normalizeLod } from "./geom.js";
import { generateToolboxPart } from "./generate.js";

export function toolboxLodMesh(result, lod) {
  const level = lod == null ? normalizeLod(result && result.lod) : normalizeLod(lod);
  const existingLevel = result && result.parts ? normalizeLod(result.lod) : null;
  const needsRegeneration = result && result.parts && existingLevel !== level;
  const regenerationOptions = needsRegeneration
    ? { ...(result.sourceOptions || { kind: result.kind, size: result.sizeKey || result.size, sizeKey: result.sizeKey, lengthMm: result.lengthMm }), groupId: result.groupId, lod: level }
    : null;
  const source = needsRegeneration
    ? generateToolboxPart(regenerationOptions)
    : (result && result.parts ? result : generateToolboxPart({ ...(result || {}), lod: level }));
  const bodies = tessellateParts(source.parts || []);
  const positions = [];
  bodies.forEach((body) => {
    for (let i = 0; i < body.positions.length; i++) positions.push(body.positions[i]);
  });
  return {
    lod: level,
    bodyCount: bodies.length,
    positions,
    triangleCount: Math.floor(positions.length / 9),
  };
}

export function toolboxEnvelope(result) {
  const parts = result && result.parts || [];
  const box = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  const push = (x, y, z) => {
    box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    box.z0 = Math.min(box.z0, z); box.z1 = Math.max(box.z1, z);
  };
  parts.forEach((part) => {
    if (part.kind === "box") {
      push(part.x0, part.y0, part.z0); push(part.x1, part.y1, part.z1);
    } else if (part.kind === "cyl") {
      const r = Math.max(part.r || 0, part.r2 || 0);
      push((part.x || 0) - r, part.y || 0, (part.z || 0) - r);
      push((part.x || 0) + r, (part.y || 0) + (part.h || 0), (part.z || 0) + r);
    } else if (part.kind === "ext") {
      const lo = Math.min(part.from || 0, part.to || 0), hi = Math.max(part.from || 0, part.to || 0);
      (part.pts || []).forEach((pt) => {
        if (part.axis === "y") { push(pt.u, lo, pt.v); push(pt.u, hi, pt.v); }
        else if (part.axis === "x") { push(lo, pt.v, pt.u); push(hi, pt.v, pt.u); }
        else { push(pt.u, pt.v, lo); push(pt.u, pt.v, hi); }
      });
    } else {
      tessellateParts([part]).forEach((body) => {
        for (let i = 0; i + 2 < body.positions.length; i += 3) {
          push(body.positions[i], body.positions[i + 1], body.positions[i + 2]);
        }
      });
    }
  });
  if (!Number.isFinite(box.x0)) return null;
  return box;
}

// Interference Detection, Mass Properties & Bill of Materials (BOM).

import { booleanBrep } from "./cad_kernel.js";
import { framePoint } from "./core/frame.js";

export async function detectInterference(assemblyComponents) {
  const interferences = [];
  // A component the user has hidden is not in the way of anything.
  const visible = (assemblyComponents || []).filter((component) => component.visible !== false);
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const c1 = visible[i], c2 = visible[j];
      const a = componentBounds(c1), b = componentBounds(c2);
      const overlap = a && b ? intersectionBounds(a, b) : null;
      if (c1.brep?.shape && c2.brep?.shape) {
        try {
          const res = await booleanBrep("intersect", c1.brep, c2.brep);
          if (res?.shape) {
            interferences.push({
              a: c1.id,
              b: c2.id,
              volume: null,
              exact: true,
              bounds: overlap,
            });
          }
        } catch (_) {}
      } else {
        if (!a || !b) continue;
        const dx = Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0), dy = Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0), dz = Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0);
        if (dx > 1e-6 && dy > 1e-6 && dz > 1e-6) interferences.push({a:c1.id,b:c2.id,volume:Math.round(dx*dy*dz*100)/100,exact:false,bounds:overlap});
      }
    }
  }
  return interferences;
}

export function componentBounds(component) {
  /* Bounds the caller has already measured win: the editor knows every part
     kind and applies the component's rotation, where the fallback below knows
     three primitive kinds and only translates. A measured `null` is an answer
     too — it means the caller looked and found nothing to measure, as when
     every body in the component is suppressed. Treating that as "no answer"
     and re-measuring `def.parts` here put the suppressed geometry back, and
     reported it clashing with its neighbours. */
  if (component.bounds !== undefined) return component.bounds;
  const parts = component.def?.parts || component.parts || [];
  if (!parts.length) return null;
  const out={x0:Infinity,y0:Infinity,z0:Infinity,x1:-Infinity,y1:-Infinity,z1:-Infinity};
  for (const p of parts) {
    let b=null;
    if(p.kind==="box") b={x0:Math.min(p.x0,p.x1),x1:Math.max(p.x0,p.x1),y0:Math.min(p.y0,p.y1),y1:Math.max(p.y0,p.y1),z0:Math.min(p.z0,p.z1),z1:Math.max(p.z0,p.z1)};
    else if(p.kind==="cyl"||p.kind==="sph"){const r=p.r||0,h=p.kind==="cyl"?p.h:r*2;b={x0:p.x-r,x1:p.x+r,y0:p.kind==="cyl"?p.y:p.y-r,y1:p.kind==="cyl"?p.y+h:p.y+r,z0:p.z-r,z1:p.z+r};}
    if(!b) continue; for(const k of Object.keys(out)) out[k]=k.endsWith("0")?Math.min(out[k],b[k]):Math.max(out[k],b[k]);
  }
  if(!Number.isFinite(out.x0)) return null;
  const t=component.transform||{}; out.x0+=t.x||0;out.x1+=t.x||0;out.y0+=t.y||0;out.y1+=t.y||0;out.z0+=t.z||0;out.z1+=t.z||0; return out;
}

export function intersectionBounds(a, b) {
  if (!a || !b) return null;
  const bounds = {
    x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), z0: Math.max(a.z0, b.z0),
    x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), z1: Math.min(a.z1, b.z1),
  };
  return bounds.x1 > bounds.x0 && bounds.y1 > bounds.y0 && bounds.z1 > bounds.z0 ? bounds : null;
}

export function generateBOM(assembly) {
  const map = new Map();
  for (const comp of assembly.components || []) {
    const key = comp.modelKey || comp.name || "Unknown";
    const existing = map.get(key) || { key, name: comp.name || key, quantity: 0 };
    existing.quantity += 1;
    map.set(key, existing);
  }
  return Array.from(map.values());
}

/* Signed area and area centroid of a closed (u, v) loop.  Sign carries the
   winding, which is what lets a hole subtract instead of being guessed at. */
function loopMoments(pts) {
  let twiceArea = 0, cu = 0, cv = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j].u * pts[i].v - pts[i].u * pts[j].v;
    twiceArea += cross;
    cu += (pts[j].u + pts[i].u) * cross;
    cv += (pts[j].v + pts[i].v) * cross;
  }
  const area = twiceArea / 2;
  if (Math.abs(area) < 1e-9) return { area: 0, u: 0, v: 0 };
  return { area, u: cu / (6 * area), v: cv / (6 * area) };
}

/* Net profile: outline minus holes, in absolute area with a combined centroid.
   Winding is normalised away because a hole is a hole whichever way it is
   wound — the outline is what defines "inside". */
function profileMoments(outline, holes) {
  const face = loopMoments(outline);
  let area = Math.abs(face.area), mu = Math.abs(face.area) * face.u, mv = Math.abs(face.area) * face.v;
  for (const hole of holes || []) {
    if (!Array.isArray(hole) || hole.length < 3) continue;
    const h = loopMoments(hole), a = Math.abs(h.area);
    area -= a; mu -= a * h.u; mv -= a * h.v;
  }
  if (area <= 1e-9) return { area: 0, u: face.u, v: face.v };
  return { area, u: mu / area, v: mv / area };
}

/* (u, v, w) of an extrusion in model space.  `frame` is authoritative when the
   feature was sketched on an arbitrary plane; the axis letters are the legacy
   orthogonal cases and must agree with basePartBounds() in modeler.js. */
function extrusionPoint(part, u, v, w) {
  if (part.frame) return framePoint(part.frame, u, v, w);
  if (part.axis === "y") return { x: u, y: w, z: v };
  if (part.axis === "z") return { x: u, y: v, z: w };
  return { x: w, y: v, z: u };
}

/* ∫∫ u·v dA over a closed polygon — the product moment about the origin.  A
   solid of revolution needs it: its centre of height is the u-weighted mean of
   the profile, not the profile's own centroid. */
function loopProductMoment(pts) {
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i], cross = a.u * b.v - b.u * a.v;
    sum += cross * (a.u * b.v + b.u * a.v + 2 * a.u * a.v + 2 * b.u * b.v);
  }
  return sum / 24;
}

/* Volume and volume centroid of one part, in model space.  Returns a zero
   volume rather than a made-up block for anything it cannot measure: an
   invented number is worse than an obviously missing one on a mass report. */
function partMass(part) {
  const none = { volume: 0, x: 0, y: 0, z: 0 };
  if (!part) return none;
  if (part.kind === "box") {
    const volume = Math.abs((part.x1 - part.x0) * (part.y1 - part.y0) * (part.z1 - part.z0));
    return { volume, x: (part.x0 + part.x1) / 2, y: (part.y0 + part.y1) / 2, z: (part.z0 + part.z1) / 2 };
  }
  if (part.kind === "cyl") {
    // r2 makes this a frustum; its centroid is not at half height.
    const r0 = Math.abs(part.r) || 0, r1 = part.r2 != null ? Math.abs(part.r2) : r0, h = Math.abs(part.h) || 0;
    const volume = (Math.PI * h * (r0 * r0 + r0 * r1 + r1 * r1)) / 3;
    const denom = r0 * r0 + r0 * r1 + r1 * r1;
    const offset = denom > 1e-9 ? (h * (r0 * r0 + 2 * r0 * r1 + 3 * r1 * r1)) / (4 * denom) : h / 2;
    return { volume, x: part.x || 0, y: (part.y || 0) + offset, z: part.z || 0 };
  }
  if (part.kind === "sph") {
    return { volume: (4 / 3) * Math.PI * Math.pow(Math.abs(part.r) || 0, 3), x: part.x || 0, y: part.y || 0, z: part.z || 0 };
  }
  if (part.kind === "ext" && Array.isArray(part.pts) && part.pts.length > 2) {
    const profile = profileMoments(part.pts, part.holes);
    const from = Number(part.from) || 0, to = Number(part.to) || 0;
    const volume = profile.area * Math.abs(to - from);
    if (volume <= 0) return none;
    return { volume, ...extrusionPoint(part, profile.u, profile.v, (from + to) / 2) };
  }
  if (part.kind === "rev" && Array.isArray(part.pts) && part.pts.length > 2) {
    // Pappus: revolving the profile about the vertical axis at (x, z).
    const profile = loopMoments(part.pts);
    const area = Math.abs(profile.area);
    const volume = 2 * Math.PI * Math.abs(profile.u) * area;
    if (volume <= 0) return none;
    const firstMoment = profile.area * profile.u; // ∫∫ u dA, signed like the loop
    const product = loopProductMoment(part.pts);  // ∫∫ u·v dA, signed the same way
    const y = Math.abs(firstMoment) > 1e-9 ? product / firstMoment : profile.v;
    return { volume, x: part.x || 0, y, z: part.z || 0 };
  }
  if (part.kind === "loft" && Array.isArray(part.pts0) && Array.isArray(part.pts1)) {
    // Prismatoid rule — exact for a linear loft between two rings.
    const a = loopMoments(part.pts0), b = loopMoments(part.pts1);
    const mid = part.pts0.length === part.pts1.length
      ? loopMoments(part.pts0.map((q, i) => ({ u: (q.u + part.pts1[i].u) / 2, v: (q.v + part.pts1[i].v) / 2 })))
      : { area: (a.area + b.area) / 2, u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 };
    const from = Number(part.from) || 0, to = Number(part.to) || 0, h = Math.abs(to - from);
    const areas = [Math.abs(a.area), 4 * Math.abs(mid.area), Math.abs(b.area)];
    const volume = (h / 6) * (areas[0] + areas[1] + areas[2]);
    if (volume <= 0) return none;
    const weights = areas, spans = [from, (from + to) / 2, to];
    const centres = [a, mid, b];
    let total = 0, u = 0, v = 0, w = 0;
    for (let i = 0; i < 3; i++) { total += weights[i]; u += weights[i] * centres[i].u; v += weights[i] * centres[i].v; w += weights[i] * spans[i]; }
    return { volume, ...extrusionPoint(part, u / total, v / total, w / total) };
  }
  const positions = part.meshData && part.meshData.positions;
  if (Array.isArray(positions) && positions.length >= 9) {
    // Divergence theorem over the triangle soup — exact for a closed mesh.
    let volume = 0, x = 0, y = 0, z = 0;
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
      const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
      const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
      const signed = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      volume += signed;
      x += signed * (ax + bx + cx) / 4; y += signed * (ay + by + cy) / 4; z += signed * (az + bz + cz) / 4;
    }
    if (Math.abs(volume) < 1e-9) return none;
    return { volume: Math.abs(volume), x: x / volume, y: y / volume, z: z / volume };
  }
  const bounds = part.bounds;
  if (bounds && Number.isFinite(bounds.x0) && Number.isFinite(bounds.x1)) {
    const volume = Math.abs((bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0) * (bounds.z1 - bounds.z0));
    return { volume, x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2, z: (bounds.z0 + bounds.z1) / 2 };
  }
  return none;
}

export function computeMassProperties(def, options) {
  const density = Number(options && options.density) > 0 ? Number(options.density) : 7.85; // g/cm³, steel default
  let totalVolume = 0, sx = 0, sy = 0, sz = 0, unmeasured = 0;
  for (const part of def.parts || []) {
    const m = partMass(part);
    if (m.volume <= 0) { unmeasured++; continue; }
    totalVolume += m.volume; sx += m.volume * m.x; sy += m.volume * m.y; sz += m.volume * m.z;
  }
  const round = (value) => Math.round(value * 100) / 100;
  return {
    volumeCm3: round(totalVolume),
    massKg: round((totalVolume * density) / 1000),
    density,
    unmeasured,
    centerOfMass: totalVolume
      ? { x: round(sx / totalVolume), y: round(sy / totalVolume), z: round(sz / totalVolume) }
      : { x: 0, y: 0, z: 0 },
  };
}

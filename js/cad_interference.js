import {replayComponentPatterns} from "./core/assembly_component_pattern.js";
import { cylinderAxis, cylinderBounds } from "./core/cylinder_axis.js";
import { revolveInterval, revolvePlacement, revolveBounds } from "./core/revolve_geometry.js";
// Interference Detection, Mass Properties & Bill of Materials (BOM).

import {rotationOf} from "./cad_mate_model.js";
import {applyRigidMatrix,rotatedPatternBounds} from "./core/pattern_geometry.js";
import { brepMaterialIntersection } from "./cad_kernel.js";
import { framePoint } from "./core/frame.js";
import { bomIdentity } from "./toolbox/schema.js";
import { assemblyPartNumber, documentDescription, documentProperty } from "./core/custom_properties.js";
import { drawingMaterialName } from "./cad_appearances.js";

export async function detectInterference(assemblyComponents, options={}) {
  const interferences = [];
  // A component the user has hidden is not in the way of anything.
  const visible = (assemblyComponents || []).filter((component) => component.visible !== false);
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      if(options.signal?.aborted)throw new DOMException('Interference check cancelled','AbortError');
      const c1 = visible[i], c2 = visible[j];
      const a = componentBounds(c1), b = componentBounds(c2);
      const overlap = a && b ? intersectionBounds(a, b) : null;
      if (c1.brep?.shape && c2.brep?.shape) {
        if (!overlap && a && b) continue;
        options.onProgress?.({a:c1.id,b:c2.id,stage:'intersection'});
        const intersection=await brepMaterialIntersection(c1.brep,c2.brep);
        if (intersection.intersects) {
          interferences.push({
            a: c1.id,
            b: c2.id,
            volume: intersection.volume,
            exact: true,
            bounds: intersection.bounds ? {x0:intersection.bounds.min.x,y0:intersection.bounds.min.y,z0:intersection.bounds.min.z,x1:intersection.bounds.max.x,y1:intersection.bounds.max.y,z1:intersection.bounds.max.z} : overlap,
          });
        }
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
    else if(p.kind==="cyl")b=cylinderBounds(p);
    else if(p.kind==="rev")b=revolveBounds(p);
    else if(p.kind==="sph"){const r=p.r||0,h=p.kind==="cyl"?p.h:r*2;b={x0:p.x-r,x1:p.x+r,y0:p.kind==="cyl"?p.y:p.y-r,y1:p.kind==="cyl"?p.y+h:p.y+r,z0:p.z-r,z1:p.z+r};}
    else if(p.kind==="ext"&&Array.isArray(p.pts)&&p.pts.length){
      const points=p.pts.flatMap(q=>[extrusionPoint(p,q.u,q.v,p.from),extrusionPoint(p,q.u,q.v,p.to)]);
      b={};for(const axis of ['x','y','z']){b[axis+'0']=Math.min(...points.map(q=>q[axis]));b[axis+'1']=Math.max(...points.map(q=>q[axis]));}
    }
    if(p.suppressed||p.visible===false)continue;
    if(b)b=rotatedPatternBounds(b,p.patternRotations||[]);
    if(!b) continue; for(const k of Object.keys(out)) out[k]=k.endsWith("0")?Math.min(out[k],b[k]):Math.max(out[k],b[k]);
  }
  if(!Number.isFinite(out.x0)) return null;
  const t=component.transform||{},rotation=rotationOf(t).flat(),points=[];
  for(const x of [out.x0,out.x1])for(const y of [out.y0,out.y1])for(const z of [out.z0,out.z1])points.push(applyRigidMatrix(rotation,{x,y,z}));
  for(const axis of ['x','y','z']){out[axis+'0']=Math.min(...points.map(p=>p[axis]))+(t[axis]||0);out[axis+'1']=Math.max(...points.map(p=>p[axis]))+(t[axis]||0);}return out;
}

export function intersectionBounds(a, b) {
  if (!a || !b) return null;
  const bounds = {
    x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), z0: Math.max(a.z0, b.z0),
    x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), z1: Math.min(a.z1, b.z1),
  };
  return bounds.x1 > bounds.x0 && bounds.y1 > bounds.y0 && bounds.z1 > bounds.z0 ? bounds : null;
}

function componentStandardPart(component) {
  if (!component) return null;
  if (component.standardPart) return component.standardPart;
  if (component.def && component.def.standardPart) return component.def.standardPart;
  const parts = (component.def && component.def.parts) || component.parts || [];
  for (const part of parts) {
    if (part && part.standardPart) return part.standardPart;
  }
  return null;
}

export function generateBOM(assembly) {
  replayComponentPatterns(assembly);
  const map = new Map();
  for (const comp of assembly.components || []) {
    if (!comp || comp.suppressed) continue;
    const meta = componentStandardPart(comp);
    // a sub-assembly is one line, as in a top-level-only BOM
    const sourceKey = (meta && bomIdentity(meta)) || (meta && meta.designation) || comp.modelKey || comp.assemblyKey || comp.name || "Unknown";
    const row = {
      name: (meta && meta.designation) || comp.name || sourceKey, quantity: 0,
      description: documentDescription(comp) || documentDescription(comp.def) || "",
      partNumber: assemblyPartNumber(comp, comp.def),
      standard: meta && meta.standard || "", material: documentProperty(comp, "Material") || comp.material || (meta && meta.material) || documentProperty(comp.def, "Material") || drawingMaterialName(comp.def) || "",
      finish: meta && meta.finish || "", category: meta && meta.category || "",
      materialId: meta && meta.materialId || "", propertyClass: meta && meta.propertyClass || "",
    };
    // A shared library definition can supply different configured parts. A
    // BOM row also must not swallow explicit occurrence metadata overrides.
    // Exclude occurrence names/IDs so equivalent repeated parts still count.
    const configurationId = comp.configurationId || comp.def?.activeConfiguration || comp.asm?.activeConfiguration || "";
    const key = JSON.stringify([sourceKey, configurationId, row.partNumber, row.description, row.material, row.finish, row.standard, row.propertyClass]);
    const existing = map.get(key) || {...row, key};
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
    const axis=cylinderAxis(part.axis),sign=Math.sign(part.h)||1;
    return {volume,x:(part.x||0)+axis.x*offset*sign,y:(part.y||0)+axis.y*offset*sign,z:(part.z||0)+axis.z*offset*sign};
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
    const points=part.pts.map(p=>({u:Math.abs(p.u),v:p.v}));
    const profile=loopMoments(points),firstMoment=profile.area*profile.u;
    const {start,end,span}=revolveInterval(part);
    const volume=span*Math.abs(firstMoment);
    if(volume<=0)return none;
    let secondMoment=0;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[j],b=points[i],cross=a.u*b.v-b.u*a.v;
      secondMoment+=cross*(a.u*a.u+a.u*b.u+b.u*b.u)/12;
    }
    const radius=secondMoment/firstMoment,height=loopProductMoment(points)/firstMoment;
    return {volume,...revolvePlacement(part,radius*(Math.cos(start)-Math.cos(end))/span,height,radius*(Math.sin(end)-Math.sin(start))/span)};
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
  /* A kernel body is measured from its tessellation below, and from nothing
     else: while the kernel is still building (or after it failed) there is no
     shape, and the bounds fallback at the end of this function would report a
     solid block where a swept pipe belongs. An obviously missing number beats
     an invented one on a mass report. */
  if (part.kind === "kernel" && !(part.meshData && (part.meshData.positions || []).length >= 9)) return none;
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
  return none;
}

export function computeMassProperties(def, options) {
  const density = Number(options && options.density) > 0 ? Number(options.density) : 7.85; // g/cm³, steel default
  let totalVolume = 0, sx = 0, sy = 0, sz = 0, unmeasured = 0;
  for (const part of def.parts || []) {
    if (!part || part.suppressed) continue;
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

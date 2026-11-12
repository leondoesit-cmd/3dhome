import {splineControls,sampleBezier} from "../sketch_spline.js";
// Typed profile segments: what the sketch actually drew, kept intact on the
// way to the exact kernel.
//
// Sampling a circle into forty chords is honest enough for a preview mesh, but
// it is a lie in a B-rep. The consequences are not cosmetic: STEP/IGES ship a
// faceted prism, a fillet on the "round" edge lands on forty separate faces,
// and the mesh-side topology — which deliberately merges tangent chords into
// ONE cylindrical face — then disagrees with the kernel about how many faces
// exist, so picking, drawings and mass properties all diverge from the screen.
// So a feature carries the curve kinds down as well as the sampled points.
//
// Segment shapes. Coordinates are the sketch plane's {u,v} here; the kernel
// maps them to world and also accepts world {x,y,z} for 3D callers:
//   { type:"line",    from, to }
//   { type:"arc",     from, mid, to, center, radius }   // mid: interior point
//   { type:"circle",  center, radius }                  // closes a wire alone
//   { type:"ellipse", center, rx, ry, rot }             // rot radians, CCW
//   { type:"spline",  points:[...] }                    // genuinely freeform
// `mid` is what the kernel builds an arc from (three points fix a circle and
// its direction at once), so a caller never has to agree with us about which
// way "start angle to end angle" runs.

import { curveSegments } from "../sketch_profiles.js";

const TAU = Math.PI * 2;

const at = (p) => ({ u: p.x, v: p.y });
const near = (a, b, tolerance) => Math.hypot(a.u - b.u, a.v - b.v) <= tolerance;

function pointMap(sketch) {
  return new Map((sketch?.points || []).map((p) => [p.id, p]));
}

function arcData(entity, points) {
  const center = points.get(entity.c ?? entity.center), a = points.get(entity.a), b = points.get(entity.b);
  if (!center || !a || !b) return null;
  const radius = Math.hypot(a.x - center.x, a.y - center.y);
  if (radius < 1e-6) return null;
  const start = Math.atan2(a.y - center.y, a.x - center.x), end = Math.atan2(b.y - center.y, b.x - center.x);
  let span = (end - start + TAU) % TAU;
  if (span < 1e-7) span = TAU;                     // a→b coincident means a full turn
  const middle = start + span / 2;
  return {
    center: at(center), radius, span,
    a: at(a), b: at(b),
    mid: { u: center.x + Math.cos(middle) * radius, v: center.y + Math.sin(middle) * radius },
  };
}

/* Walk an already-chosen profile into traversal order. The analyzer in
   sketch_profiles.js does the same thing to produce points; it cannot hand us
   the ordering because a profile is stored as a bare point array. */
function orderChain(entities, points, tolerance, open=false) {
  const remaining = entities.slice();
  const ends = (entity) => {
    const a = points.get(entity.a), b = points.get(entity.b);
    return a && b ? { a: at(a), b: at(b) } : null;
  };
  // Kernel edge directions and pick order need not run along an open profile.
  // Start at a free end so the chain can be walked in either direction.
  let startIndex = 0, forward = true;
  if (open && remaining.length > 1) {
    const pairs = remaining.map(ends);
    if (pairs.some(pair => !pair)) return null;
    const free = (p, i) => pairs.every((pair, j) => i === j || (!near(p, pair.a, tolerance) && !near(p, pair.b, tolerance)));
    const i = pairs.findIndex((pair, j) => free(pair.a, j) || free(pair.b, j));
    if (i >= 0) { startIndex = i; forward = free(pairs[i].a, i); }
  }
  const first = remaining.splice(startIndex, 1)[0], head = ends(first);
  if (!head) return null;
  const steps = [{ entity: first, forward }];
  let tail = forward ? head.b : head.a;
  while (remaining.length) {
    const index = remaining.findIndex((entity) => {
      const p = ends(entity);
      return p && (near(p.a, tail, tolerance) || near(p.b, tail, tolerance));
    });
    if (index < 0) return null;
    const next = remaining.splice(index, 1)[0], p = ends(next), forward = near(p.a, tail, tolerance);
    steps.push({ entity: next, forward });
    tail = forward ? p.b : p.a;
  }
  return open || near(tail, head.a, tolerance) ? steps : null;
}

function segmentFor(step, points) {
  const { entity, forward } = step;
  if(entity.projectedCurve){
    const curve={...structuredClone(entity.projectedCurve)};
    if(!forward){
      curve.from=entity.projectedCurve.to;
      curve.to=entity.projectedCurve.from;
      curve.reversed=!curve.reversed;
      if(Array.isArray(curve.samples)) curve.samples=[...curve.samples].reverse();
    }
    return curve;
  }
  if (entity.type === "line") {
    const a = points.get(entity.a), b = points.get(entity.b);
    if (!a || !b) return null;
    return forward ? { type: "line", from: at(a), to: at(b) } : { type: "line", from: at(b), to: at(a) };
  }
  if(entity.type==="spline"){const controls=splineControls(entity,points);if(!controls)return null;const c=(forward?controls:controls.slice().reverse()).map(at);return {type:"bezier",controls:c,from:c[0],to:c[3]};}
  if (entity.type !== "arc") return null;
  const arc = arcData(entity, points);
  if (!arc) return null;
  // The mid point belongs to the arc, not to a direction, so only the ends swap.
  return {
    type: "arc", center: arc.center, radius: arc.radius, mid: arc.mid,
    from: forward ? arc.a : arc.b, to: forward ? arc.b : arc.a,
  };
}

/* Consecutive endpoints may sit up to `tolerance` apart — the analyzer treats
   them as one vertex when it samples, and a wire builder will not. Weld the
   chain onto its first-seen coordinates so the kernel gets a closed loop. */
function weld(segments) {
  for (let i = 0; i < segments.length; i++) {
    const next = segments[(i + 1) % segments.length];
    if (next.from && segments[i].to) {next.from = segments[i].to;if(next.type==="bezier")next.controls[0]=next.from;}
  }
  return segments;
}

// The typed form of a stored profile, or null when the selection is not one we
// can describe exactly (an unknown entity kind, a broken chain, a deleted
// point). Null is not an error: the caller still has the sampled points.
export function sketchProfileSegments(sketch, entityIds, tolerance = 0.05, options = {}) {
  if (!sketch || !Array.isArray(entityIds) || !entityIds.length) return null;
  const byId = new Map((sketch.entities || []).map((e) => [e.id, e]));
  const entities = entityIds.map((id) => byId.get(id));
  if (entities.some((e) => !e)) return null;
  const points = pointMap(sketch);
  if (entities.length === 1) {
    const entity = entities[0], center = points.get(entity.c ?? entity.center);
    if (entity.type === "circle") {
      const radius = Math.abs(Number(entity.r) || 0);
      return center && radius >= 1e-4 ? [{ type: "circle", center: at(center), radius }] : null;
    }
    if (entity.type === "ellipse") {
      const rx = Math.abs(Number(entity.rx) || 0), ry = Math.abs(Number(entity.ry) || 0);
      return center && rx >= 1e-4 && ry >= 1e-4
        ? [{ type: "ellipse", center: at(center), rx, ry, rot: Number(entity.rot) || 0 }] : null;
    }
  }
  if (entities.some((e) => e.type !== "line" && e.type !== "arc" && e.type!=="spline")) return null;
  const ordered = orderChain(entities, points, Math.max(1e-6, tolerance), options.open);
  if (!ordered) return null;
  const segments = ordered.map((step) => {
    const segment=segmentFor(step,points);
    return segment&&options.includeEntityIds?{...segment,sourceEntityId:step.entity.id}:segment;
  });
  return segments.every(Boolean) && segments.length ? (options.open ? segments : weld(segments)) : null;
}

// Sample typed segments back into the polyline the mesh side speaks. Used to
// check a conversion against the analyzer's own points, and as the degradation
// path for any consumer that cannot take curves.
export function segmentProfilePoints(segments) {
  if (!Array.isArray(segments)) return null;
  const out = [];
  const push = (p) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last.u - p.u, last.v - p.v) > 1e-9) out.push(p);
  };
  for (const segment of segments) {
    if (segment.type === "line") { push(segment.from); continue; }
    if(segment.type==="bezier"){sampleBezier(segment.controls.map(p=>({x:p.u,y:p.v}))).slice(0,-1).map(at).forEach(push);continue;}
    if (segment.type === "kernelCurve") { (segment.samples || []).forEach(push); continue; }
    if (segment.type === "spline") { (segment.points || []).forEach(push); continue; }
    if (segment.type === "circle" || segment.type === "ellipse") {
      const rx = segment.type === "circle" ? segment.radius : segment.rx;
      const ry = segment.type === "circle" ? segment.radius : segment.ry;
      const rot = Number(segment.rot) || 0, cos = Math.cos(rot), sin = Math.sin(rot);
      const count = curveSegments(Math.max(rx, ry), TAU, 16, 128);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
        push({ u: segment.center.u + x * cos - y * sin, v: segment.center.v + x * sin + y * cos });
      }
      continue;
    }
    if (segment.type !== "arc") { push(segment.from); continue; }
    const start = Math.atan2(segment.from.v - segment.center.v, segment.from.u - segment.center.u);
    const middle = Math.atan2(segment.mid.v - segment.center.v, segment.mid.u - segment.center.u);
    const end = Math.atan2(segment.to.v - segment.center.v, segment.to.u - segment.center.u);
    let span = (end - start + TAU) % TAU;
    if (span < 1e-7) span = TAU;
    // Whether the traversal runs CCW is decided by the side `mid` falls on.
    const ccw = ((middle - start + TAU) % TAU) <= span;
    const sweep = ccw ? span : span - TAU;
    const steps = curveSegments(segment.radius, Math.abs(sweep), 4, 64);
    for (let i = 0; i < steps; i++) {
      const a = start + (sweep * i) / steps;
      push({ u: segment.center.u + Math.cos(a) * segment.radius, v: segment.center.v + Math.sin(a) * segment.radius });
    }
  }
  return out;
}

const norm = (v) => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/* A rotation-minimising frame along a sampled path: each station's normal is
   the previous one carried across, not recomputed from curvature. Frenet flips
   the normal through an inflection and spins it wildly on a straight run, which
   is exactly the twist a swept section must not pick up for free — any twist in
   the result should be the one the user asked for. */
export function pathFrames(points) {
  const path = (points || []).map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0, z: Number(p.z) || 0 }));
  if (path.length < 2) return null;
  const tangents = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    return norm({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
  });
  const seed = Math.abs(tangents[0].z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  let normal = norm(cross(seed, tangents[0]));
  const frames = [];
  let length = 0;
  for (let i = 0; i < path.length; i++) {
    if (i) {
      const previous = path[i - 1];
      length += Math.hypot(path[i].x - previous.x, path[i].y - previous.y, path[i].z - previous.z);
      const t = tangents[i], projected = { x: normal.x - t.x * dot(normal, t), y: normal.y - t.y * dot(normal, t), z: normal.z - t.z * dot(normal, t) };
      if (Math.hypot(projected.x, projected.y, projected.z) > 1e-9) normal = norm(projected);
      else normal = norm(cross(frames[i - 1].binormal, t));
    }
    frames.push({ origin: path[i], tangent: tangents[i], normal, binormal: norm(cross(tangents[i], normal)), distance: length });
  }
  if (length < 1e-12) return null;
  frames.forEach((frame) => { frame.t = frame.distance / length; });
  return frames;
}

// True for the typed form. A bare point array is the legacy shape and must keep
// building a polygon wire exactly as it did before.
export function isSegmentProfile(value) {
  const list = Array.isArray(value) ? value : value?.segments;
  return Array.isArray(list) && list.length > 0 && list.every((item) => item && typeof item.type === "string");
}

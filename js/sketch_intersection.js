import { frameProjectPoint } from "./core/frame.js";

const EPS = 1e-7;

export function projectWorldToSketch(sketch, point) {
  if (sketch?.frameSpace === "local" && sketch.frame) {
    const q = frameProjectPoint(sketch.frame, point);
    return { x: q.u, y: q.v, w: q.w };
  }
  const axis = sketch?.plane === "top" ? "y" : sketch?.plane === "front" ? "z" : "x";
  const w = Number(sketch?.offset) || 0;
  if (axis === "x") return { x: point.z, y: point.y, w: point.x - w };
  if (axis === "z") return { x: point.x, y: point.y, w: point.z - w };
  return { x: point.x, y: point.z, w: point.y - w };
}

export function lineLineIntersection(a, b) {
  if (!a || !b) return null;
  const dx1 = a.b.x - a.a.x, dy1 = a.b.y - a.a.y;
  const dx2 = b.b.x - b.a.x, dy2 = b.b.y - b.a.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < EPS) return null;
  const t = ((b.a.x - a.a.x) * dy2 - (b.a.y - a.a.y) * dx2) / denom;
  return { x: a.a.x + t * dx1, y: a.a.y + t * dy1 };
}

function edgeEndpoints(edge) {
  const descriptor = edge?.descriptor || edge || {};
  if (Array.isArray(descriptor.endpoints) && descriptor.endpoints.length >= 2) return descriptor.endpoints;
  if (descriptor.curve === "line" && descriptor.origin && descriptor.axis && Number(descriptor.measure) > 0) {
    const origin = descriptor.origin, axis = descriptor.axis, half = Number(descriptor.measure) / 2;
    const length = Math.hypot(axis.x || 0, axis.y || 0, axis.z || 0) || 1;
    const ux = (axis.x || 0) / length, uy = (axis.y || 0) / length, uz = (axis.z || 0) / length;
    return [
      { x: (origin.x || 0) - ux * half, y: (origin.y || 0) - uy * half, z: (origin.z || 0) - uz * half },
      { x: (origin.x || 0) + ux * half, y: (origin.y || 0) + uy * half, z: (origin.z || 0) + uz * half },
    ];
  }
  return [];
}

/* The sketch plane's normal in world space. */
export function sketchNormal(sketch) {
  if (sketch?.frameSpace === "local" && sketch.frame?.normal) {
    const n = sketch.frame.normal, l = Math.hypot(n.x || 0, n.y || 0, n.z || 0) || 1;
    return { x: (n.x || 0) / l, y: (n.y || 0) / l, z: (n.z || 0) / l };
  }
  const axis = sketch?.plane === "top" ? "y" : sketch?.plane === "front" ? "z" : "x";
  return { x: axis === "x" ? 1 : 0, y: axis === "y" ? 1 : 0, z: axis === "z" ? 1 : 0 };
}

/* A complete circle whose plane stands square to the sketch plane shows edge-on
   as a straight segment: HOUSING's Boss-Stop rim in the Right Plane is the
   "right vertical edge" the book picks. Its ends are the centre plus and minus
   the radius along the in-sketch direction square to the circle's axis. */
function edgeOnCircleEnds(sketch, descriptor) {
  if (descriptor?.curve !== "circle" || !descriptor.origin || !descriptor.axis || !(Number(descriptor.radius) > 0)) return [];
  const n = sketchNormal(sketch), a = descriptor.axis, al = Math.hypot(a.x || 0, a.y || 0, a.z || 0) || 1;
  const ax = { x: (a.x || 0) / al, y: (a.y || 0) / al, z: (a.z || 0) / al };
  if (Math.abs(ax.x * n.x + ax.y * n.y + ax.z * n.z) > 1e-6) return [];
  const d = { x: ax.y * n.z - ax.z * n.y, y: ax.z * n.x - ax.x * n.z, z: ax.x * n.y - ax.y * n.x };
  const dl = Math.hypot(d.x, d.y, d.z);
  if (dl < EPS) return [];
  const r = Number(descriptor.radius) / dl, o = descriptor.origin;
  return [
    { x: (o.x || 0) - d.x * r, y: (o.y || 0) - d.y * r, z: (o.z || 0) - d.z * r },
    { x: (o.x || 0) + d.x * r, y: (o.y || 0) + d.y * r, z: (o.z || 0) + d.z * r },
  ];
}

export function modelEdgeSketchLine(sketch, edge) {
  const project = (ends) => {
    if (ends.length < 2) return null;
    const a = projectWorldToSketch(sketch, ends[0]);
    const b = projectWorldToSketch(sketch, ends[ends.length - 1]);
    return Math.hypot(b.x - a.x, b.y - a.y) < EPS ? null : { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
  };
  /* A complete circle from the kernel carries its seam vertex as both end
     points, so projecting them gives nothing; seen edge-on it is still its
     diameter. That is the rebuilt Boss-Stop rim HOUSING HandlePath is
     coincident with (the editor's pick had no end points, so only the rebuild
     failed and the save never went through). */
  return project(edgeEndpoints(edge)) || project(edgeOnCircleEnds(sketch, edge?.descriptor || edge));
}

export function intersectionOfModelEdges(sketch, edgeA, edgeB) {
  const endsA = edgeEndpoints(edgeA), endsB = edgeEndpoints(edgeB);
  for (const p of endsA) {
    for (const q of endsB) {
      if (Math.hypot((p.x || 0) - (q.x || 0), (p.y || 0) - (q.y || 0), (p.z || 0) - (q.z || 0)) < 1e-6) {
        const uv = projectWorldToSketch(sketch, p);
        return { x: uv.x, y: uv.y };
      }
    }
  }
  const la = modelEdgeSketchLine(sketch, edgeA), lb = modelEdgeSketchLine(sketch, edgeB);
  const hit = lineLineIntersection(la, lb);
  if (!hit) throw new Error("The selected edges are parallel or do not meet on this sketch");
  return hit;
}

export function bindIntersectionTargets(sketch, resolveEdge) {
  for (const constraint of sketch.constraints || []) {
    if (constraint.type !== "intersection" || !constraint.edgeA || !constraint.edgeB) continue;
    const edgeA = resolveEdge?.(constraint.edgeA), edgeB = resolveEdge?.(constraint.edgeB);
    if (!edgeA || !edgeB) throw new Error("An intersection edge is unavailable");
    const hit = intersectionOfModelEdges(sketch, edgeA, edgeB);
    constraint.x = hit.x;
    constraint.y = hit.y;
  }
  return sketch;
}

export function hitProjectedModelEdge(sketch, uv, edges, tol) {
  let best = null, bd = tol;
  for (const edge of edges || []) {
    if (edge?.kind && edge.kind !== "edge") continue;
    const line = modelEdgeSketchLine(sketch, edge);
    if (!line) continue;
    const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y, len2 = dx * dx + dy * dy;
    const t = len2 > EPS ? Math.max(0, Math.min(1, ((uv.x - line.a.x) * dx + (uv.y - line.a.y) * dy) / len2)) : 0;
    const d = Math.hypot(uv.x - (line.a.x + dx * t), uv.y - (line.a.y + dy * t));
    if (d < bd) { bd = d; best = edge; }
  }
  return best;
}

/* Coincident with a model edge (SOLIDWORKS: a sketch point and an edge, then
   Coincident). The point stays on the edge's line as seen on this sketch plane;
   the line is re-read from the rebuilt edge, so it follows the body. */
export function bindModelEdgeTargets(sketch, resolveEdge) {
  for (const constraint of sketch.constraints || []) {
    if (constraint.type !== "onModelEdge" || !constraint.edge) continue;
    const edge = resolveEdge?.(constraint.edge);
    if (!edge) throw new Error("A coincident model edge is unavailable");
    const line = modelEdgeSketchLine(sketch, edge);
    if (!line) throw new Error("The model edge does not show as a line on this sketch plane");
    Object.assign(constraint, { ax: line.a.x, ay: line.a.y, bx: line.b.x, by: line.b.y });
  }
  return sketch;
}

/* Pierce (SOLIDWORKS: a sketch point and a curve of another sketch, then
   Pierce): the point sits where that line or arc crosses this sketch's plane,
   re-read on every rebuild. */
export function pierceOfSketchEntity(sketch, source, entityId, worldPoint) {
  const entity = (source?.entities || []).find((item) => item.id === entityId);
  if (!entity) throw new Error("The pierced curve is unavailable");
  const point = (id) => (source.points || []).find((item) => item.id === id);
  const toWorld = (p) => worldPoint(source, p.x, p.y);
  const w = (p) => projectWorldToSketch(sketch, p).w;
  const crossing = (p, q) => {
    const wp = w(p), wq = w(q);
    if (Math.abs(wp) < 1e-9) return p;
    if (wp * wq > 0 || Math.abs(wp - wq) < 1e-12) return null;
    const t = wp / (wp - wq);
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t };
  };
  let hit = null;
  if (entity.type === "line") {
    const a = point(entity.a), b = point(entity.b);
    if (!a || !b) throw new Error("The pierced line has no end points");
    hit = crossing(toWorld(a), toWorld(b)) || (Math.abs(w(toWorld(b))) < 1e-9 ? toWorld(b) : null);
  } else if (entity.type === "arc" || entity.type === "circle") {
    const c = point(entity.c ?? entity.center);
    if (!c) throw new Error("The pierced arc has no centre");
    const r = entity.type === "circle" ? Number(entity.r) : Math.hypot(point(entity.a).x - c.x, point(entity.a).y - c.y);
    let start = 0, sweep = Math.PI * 2;
    if (entity.type === "arc") {
      const a = point(entity.a), b = point(entity.b);
      start = Math.atan2(a.y - c.y, a.x - c.x);
      sweep = Math.atan2(b.y - c.y, b.x - c.x) - start;
      if (sweep <= 0) sweep += Math.PI * 2;
    }
    const steps = 96;
    let prev = toWorld({ x: c.x + r * Math.cos(start), y: c.y + r * Math.sin(start) });
    for (let i = 1; i <= steps && !hit; i++) {
      const angle = start + sweep * i / steps, next = toWorld({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) });
      if (crossing(prev, next)) {
        let lo = start + sweep * (i - 1) / steps, hi = angle;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2, pm = toWorld({ x: c.x + r * Math.cos(mid), y: c.y + r * Math.sin(mid) });
          if (w(pm) * w(toWorld({ x: c.x + r * Math.cos(lo), y: c.y + r * Math.sin(lo) })) <= 0) hi = mid; else lo = mid;
        }
        hit = toWorld({ x: c.x + r * Math.cos((lo + hi) / 2), y: c.y + r * Math.sin((lo + hi) / 2) });
      }
      prev = next;
    }
  } else throw new Error("Pierce needs a line or an arc");
  if (!hit) throw new Error("The pierced curve does not cross this sketch plane");
  const uv = projectWorldToSketch(sketch, hit);
  return { x: uv.x, y: uv.y };
}

export function bindPierceTargets(sketch, sketches, worldPoint) {
  for (const constraint of sketch.constraints || []) {
    if (constraint.type !== "pierce" || !constraint.sketchId) continue;
    const source = (sketches || []).find((item) => item.id === constraint.sketchId);
    if (!source) throw new Error("The pierced sketch is unavailable");
    const hit = pierceOfSketchEntity(sketch, source, constraint.entityId, worldPoint);
    constraint.x = hit.x;
    constraint.y = hit.y;
  }
  return sketch;
}

export function sketchIntersectionOwners(sketch) {
  const ids = [];
  for (const constraint of sketch.constraints || []) {
    if (constraint.type === "onModelEdge" && constraint.edge?.ownerFeatureId) { ids.push(constraint.edge.ownerFeatureId); continue; }
    if (constraint.type !== "intersection") continue;
    if (constraint.edgeA?.ownerFeatureId) ids.push(constraint.edgeA.ownerFeatureId);
    if (constraint.edgeB?.ownerFeatureId) ids.push(constraint.edgeB.ownerFeatureId);
  }
  return ids;
}

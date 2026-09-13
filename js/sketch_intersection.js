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

export function modelEdgeSketchLine(sketch, edge) {
  const ends = edgeEndpoints(edge);
  if (ends.length < 2) return null;
  const a = projectWorldToSketch(sketch, ends[0]);
  const b = projectWorldToSketch(sketch, ends[ends.length - 1]);
  if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) return null;
  return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
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

export function sketchIntersectionOwners(sketch) {
  const ids = [];
  for (const constraint of sketch.constraints || []) {
    if (constraint.type !== "intersection") continue;
    if (constraint.edgeA?.ownerFeatureId) ids.push(constraint.edgeA.ownerFeatureId);
    if (constraint.edgeB?.ownerFeatureId) ids.push(constraint.edgeB.ownerFeatureId);
  }
  return ids;
}

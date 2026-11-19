import { frameProjectPoint } from "./core/frame.js";
import { vertexKey } from "./core/topology_selection.js";

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

export function edgeEndpoints(edge) {
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
  const descriptor = edge?.descriptor || edge || {};
  const curve = descriptor.curve;
  if (!curve || curve === "line") return project(edgeEndpoints(edge)) || project(edgeOnCircleEnds(sketch, descriptor));
  /* Only a straight edge is its chord. A B-spline, hyperbola or ellipse joined
     end to end is not, and neither is a circular arc lying in the plane, so
     they are no line for a relation, pick or Convert to hang a point on (the
     loft's rail chords used to steal picks meant for the Boss-Stop rim).
     A circle standing square to the plane does show as a segment: its whole
     diameter when complete, else the span of its end points. */
  if (curve !== "circle") return null;
  if (!edgeOnCircle(sketch, descriptor)) return null;
  return project(edgeEndpoints(edge)) || project(edgeOnCircleEnds(sketch, descriptor));
}

function edgeOnCircle(sketch, descriptor) {
  if (!descriptor?.axis) return false;
  const n = sketchNormal(sketch), a = descriptor.axis, al = Math.hypot(a.x || 0, a.y || 0, a.z || 0) || 1;
  return Math.abs(((a.x || 0) * n.x + (a.y || 0) * n.y + (a.z || 0) * n.z) / al) <= 1e-6;
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
    if (constraint.type !== "intersection" || constraint.sectionFace || !constraint.edgeA || !constraint.edgeB) continue;
    const edgeA = resolveEdge?.(constraint.edgeA), edgeB = resolveEdge?.(constraint.edgeB);
    if (!edgeA || !edgeB) throw new Error("An intersection edge is unavailable");
    const hit = intersectionOfModelEdges(sketch, edgeA, edgeB);
    constraint.x = hit.x;
    constraint.y = hit.y;
  }
  return sketch;
}

/* Sketch-plane samples along a converted curve (arc, circle or ellipse). */
function curveSamples(curve, steps = 96) {
  if (curve.kind === "ellipse") {
    const c = Math.cos(curve.rot), s = Math.sin(curve.rot);
    return Array.from({ length: steps + 1 }, (_, i) => {
      const a = TAU * i / steps, x = curve.rx * Math.cos(a), y = curve.ry * Math.sin(a);
      return { x: curve.center.x + x * c - y * s, y: curve.center.y + x * s + y * c };
    });
  }
  const from = curve.kind === "arc" ? Math.atan2(curve.start.y - curve.center.y, curve.start.x - curve.center.x) : 0;
  const sweep = curve.kind === "arc" ? turn(Math.atan2(curve.end.y - curve.center.y, curve.end.x - curve.center.x) - from) : TAU;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + sweep * i / steps;
    return { x: curve.center.x + curve.radius * Math.cos(a), y: curve.center.y + curve.radius * Math.sin(a) };
  });
}

export function hitProjectedModelEdge(sketch, uv, edges, tol) {
  let best = null, bd = tol;
  for (const edge of edges || []) {
    if (edge?.kind && edge.kind !== "edge") continue;
    const line = modelEdgeSketchLine(sketch, edge);
    let d;
    if (line) {
      const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y, len2 = dx * dx + dy * dy;
      const t = len2 > EPS ? Math.max(0, Math.min(1, ((uv.x - line.a.x) * dx + (uv.y - line.a.y) * dy) / len2)) : 0;
      d = Math.hypot(uv.x - (line.a.x + dx * t), uv.y - (line.a.y + dy * t));
    } else {
      /* A circle, arc or ellipse lying parallel to the sheet is drawn there as
         itself, so it is picked along its own curve (to Convert it). */
      let curve = null;
      try { curve = modelEdgeSketchCurve(sketch, edge); } catch (error) { continue; }
      if (curve.kind === "line") continue;
      const samples = curveSamples(curve);
      d = Infinity;
      for (let i = 1; i < samples.length; i++) d = Math.min(d, distanceToSegment(uv, samples[i - 1], samples[i]));
    }
    if (d < bd) { bd = d; best = edge; }
  }
  return best;
}

/* ---- a model edge as sketch geometry (Convert Entities) ----

   What a model edge is when it is brought into this sketch: a line, an arc, a
   circle or an ellipse in sketch coordinates, re-read from the rebuilt edge
   every time. A curve must lie in a plane parallel to the sketch, since a
   tilted circle projects to an ellipse the sketch could only fake; a B-spline
   has no exact sketch entity. Each refusal says why. */
const sub3 = (a, b) => ({ x: (a.x || 0) - (b.x || 0), y: (a.y || 0) - (b.y || 0), z: (a.z || 0) - (b.z || 0) });
const add3 = (a, b) => ({ x: (a.x || 0) + (b.x || 0), y: (a.y || 0) + (b.y || 0), z: (a.z || 0) + (b.z || 0) });
const len3 = (a) => Math.hypot(a.x || 0, a.y || 0, a.z || 0);
const TAU = Math.PI * 2;
const turn = (a) => ((a % TAU) + TAU) % TAU;

function parallelToSketch(sketch, normal) {
  const n = sketchNormal(sketch), l = len3(normal || {});
  return l > EPS && Math.abs(Math.abs(((normal.x || 0) * n.x + (normal.y || 0) * n.y + (normal.z || 0) * n.z) / l) - 1) <= 1e-6;
}
const flat = (sketch, p) => { const q = projectWorldToSketch(sketch, p); return { x: q.x, y: q.y }; };
const samePoint = (a, b, tol = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

/* Which way round an arc runs, in the sketch's own counter-clockwise sense: the
   kernel sorts an edge's end points by coordinate, so the side the arc sweeps is
   told by a point on it (its midpoint), or failing that by its length. */
function orientArc(center, radius, p, q, inside, sweep) {
  const angle = (point) => Math.atan2(point.y - center.y, point.x - center.x);
  const span = turn(angle(q) - angle(p));
  let forward;
  if (inside) forward = turn(angle(inside) - angle(p)) < span;
  else if (Number.isFinite(sweep)) forward = Math.abs(span - sweep) <= Math.abs(TAU - span - sweep);
  else throw new Error("The arc edge does not say which side of its ends it runs");
  return { kind: "arc", center, radius, start: forward ? p : q, end: forward ? q : p };
}

/* A circle through projected samples (the tessellated arc of an analytic
   extrusion), or null when they do not all sit on one. */
function circleThrough(points) {
  if (points.length < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length, my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of points) {
    const u = p.x - mx, v = p.y - my;
    suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12) return null;
  const bu = (suuu + suvv) / 2, bv = (svvv + svuu) / 2;
  const center = { x: mx + (bu * svv - bv * suv) / det, y: my + (bv * suu - bu * suv) / det };
  const radius = points.reduce((s, p) => s + Math.hypot(p.x - center.x, p.y - center.y), 0) / points.length;
  const worst = points.reduce((m, p) => Math.max(m, Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius)), 0);
  return Number.isFinite(radius) && worst <= Math.max(1e-5, radius * 1e-4) ? { center, radius } : null;
}

/* World points along an elliptical edge, for drawing and screen picking. */
export function ellipseEdgePoints(descriptor, steps = 72) {
  const e = descriptor?.ellipse;
  if (!e?.center || !e.normal || !e.majorAxis || !(e.majorRadius > 0) || !(e.minorRadius > 0)) return [];
  const n = e.normal, nl = len3(n), ml = len3(e.majorAxis);
  if (nl < EPS || ml < EPS) return [];
  const x = { x: e.majorAxis.x / ml, y: e.majorAxis.y / ml, z: e.majorAxis.z / ml };
  const y = { x: (n.y * x.z - n.z * x.y) / nl, y: (n.z * x.x - n.x * x.z) / nl, z: (n.x * x.y - n.y * x.x) / nl };
  const out = [];
  const first = e.first ?? 0, last = e.last ?? TAU;
  for (let i = 0; i <= steps; i++) {
    const a = first + (last - first) * i / steps, c = Math.cos(a) * e.majorRadius, s = Math.sin(a) * e.minorRadius;
    out.push({ x: e.center.x + x.x * c + y.x * s, y: e.center.y + x.y * c + y.y * s, z: e.center.z + x.z * c + y.z * s });
  }
  return out;
}

export function modelEdgeSketchCurve(sketch, edge) {
  const d = edge?.descriptor || edge || {};
  const ends = edgeEndpoints(edge);
  if (!d.curve || d.curve === "line") {
    const line = modelEdgeSketchLine(sketch, edge);
    if (!line) throw new Error("The edge stands square to the sketch plane, so it shows as a point");
    return { kind: "line", start: line.a, end: line.b };
  }
  if (d.curve === "circle") {
    if (!d.origin || !(Number(d.radius) > 0)) throw new Error("The circular edge carries no centre or radius");
    if (!parallelToSketch(sketch, d.axis)) throw new Error("The circular edge is not parallel to the sketch plane");
    const center = flat(sketch, d.origin), radius = Number(d.radius);
    const closed = ends.length < 2 || len3(sub3(ends[0], ends[ends.length - 1])) < 1e-6;
    if (closed) return { kind: "circle", center, radius };
    return orientArc(center, radius, flat(sketch, ends[0]), flat(sketch, ends[ends.length - 1]),
      d.arcMidpoint ? flat(sketch, d.arcMidpoint) : null, Number(d.measure) / radius);
  }
  if (d.curve === "ellipse") {
    const e = d.ellipse;
    if (!e?.center || !e.majorAxis || !(e.majorRadius > 0) || !(e.minorRadius > 0)) throw new Error("The elliptical edge carries no axes; rebuild the part and pick it again");
    if (!parallelToSketch(sketch, e.normal)) throw new Error("The elliptical edge is not parallel to the sketch plane");
    if (ends.length >= 2 && len3(sub3(ends[0], ends[ends.length - 1])) > 1e-6) throw new Error("Only a complete elliptical edge converts; a partial one has no sketch entity");
    const center = flat(sketch, e.center), tip = flat(sketch, add3(e.center, e.majorAxis));
    return { kind: "ellipse", center, rx: e.majorRadius, ry: e.minorRadius, rot: Math.atan2(tip.y - center.y, tip.x - center.x) };
  }
  if (d.curve === "polyline" && ends.length >= 2) {
    const points = ends.map((p) => flat(sketch, p)), first = points[0], last = points[points.length - 1];
    const closed = points.length > 3 && samePoint(first, last);
    const chord = Math.hypot(last.x - first.x, last.y - first.y);
    const straight = !closed && chord > EPS && points.every((p) => Math.abs((p.x - first.x) * (last.y - first.y) - (p.y - first.y) * (last.x - first.x)) / chord <= 1e-6 * Math.max(1, chord));
    if (straight) return { kind: "line", start: first, end: last };
    const fit = circleThrough(closed ? points.slice(0, -1) : points);
    if (!fit) throw new Error("The edge is neither straight nor circular on this sketch plane");
    if (closed) return { kind: "circle", center: fit.center, radius: fit.radius };
    return orientArc(fit.center, fit.radius, first, last, points[points.length >> 1], null);
  }
  throw new Error("A " + d.curve + " edge has no exact sketch entity to convert to");
}

/* A named place on a model edge, as the sketch plane sees it: its start, its
   end (a picked model VERTEX is one of these on an edge that ends there) or its
   midpoint. Read from the rebuilt edge, so it moves when the body does.
   Converted curves add the centre of an arc, circle or ellipse, and an arc's
   two ends in the order the sketch arc runs (arcStart, arcEnd). */
export function modelEdgeAnchor(sketch, edge, at) {
  if (at === "center" || at === "arcStart" || at === "arcEnd") {
    const curve = modelEdgeSketchCurve(sketch, edge);
    if (at === "center" && curve.center) return { x: curve.center.x, y: curve.center.y };
    if (curve.kind === "arc") return { ...(at === "arcStart" ? curve.start : curve.end) };
    throw new Error(at === "center" ? "A straight model edge has no centre" : "The model edge is no longer an arc");
  }
  const ends = edgeEndpoints(edge);
  if (ends.length < 2) throw new Error("The model edge has no end points to relate to");
  const a = ends[0], b = ends[ends.length - 1];
  const descriptor = edge?.descriptor || {};
  const chord = { x: ((a.x || 0) + (b.x || 0)) / 2, y: ((a.y || 0) + (b.y || 0)) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
  const world = at === "end" ? b : at === "mid" ? (descriptor.arcMidpoint || chord) : a;
  if (at === "mid" && Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0), (a.z || 0) - (b.z || 0)) < EPS) throw new Error("A closed model edge has no midpoint to relate to");
  const uv = projectWorldToSketch(sketch, world);
  return { x: uv.x, y: uv.y };
}

/* Where a model edge that stands square to the sketch plane (so it shows as a
   single point, not a line) pierces that plane. */
export function modelEdgePierce(sketch, edge) {
  const ends = edgeEndpoints(edge);
  if (ends.length < 2) return null;
  const a = projectWorldToSketch(sketch, ends[0]), b = projectWorldToSketch(sketch, ends[ends.length - 1]);
  if (Math.abs(a.w - b.w) < EPS || Math.hypot(b.x - a.x, b.y - a.y) >= EPS) return null;
  return { x: a.x, y: a.y };
}

/* The end of an edge a picked vertex is: the edge entry that ends at the
   vertex's point, and which end. Vertices are derived from edge ends and keyed
   by position, so a bare vertex reference cannot follow a rebuild by itself;
   the edge and its end can. */
export function vertexEdgeBinding(vertex, edges, tol = 1e-3) {
  const p = vertex?.descriptor?.point || vertex?.descriptor?.origin;
  if (!p) return null;
  for (const edge of edges || []) {
    if (edge?.kind && edge.kind !== "edge") continue;
    const ends = edgeEndpoints(edge);
    if (ends.length < 2) continue;
    const d = (q) => Math.hypot((q.x || 0) - (p.x || 0), (q.y || 0) - (p.y || 0), (q.z || 0) - (p.z || 0));
    if (d(ends[0]) <= tol) return { edge, at: "start" };
    if (d(ends[ends.length - 1]) <= tol) return { edge, at: "end" };
  }
  return null;
}

/* A corner of the model under the pointer, as the sketch plane sees it. */
export function hitProjectedModelVertex(sketch, uv, edges, tol, accept) {
  let best = null, bd = tol;
  for (const edge of edges || []) {
    if (edge?.kind && edge.kind !== "edge") continue;
    const ends = edgeEndpoints(edge);
    if (ends.length < 2) continue;
    for (const world of [ends[0], ends[ends.length - 1]]) {
      if (accept && !accept(world)) continue;
      const q = projectWorldToSketch(sketch, world), d = Math.hypot(uv.x - q.x, uv.y - q.y);
      if (d < bd) {
        bd = d;
        best = { kind: "vertex", persistentId: vertexKey(world), ownerFeatureId: edge.ownerFeatureId, descriptor: { point: { x: world.x, y: world.y, z: world.z }, origin: { x: world.x, y: world.y, z: world.z }, semantic: vertexKey(world) } };
      }
    }
  }
  return best;
}

// Older Convert Entities lines stored just two onModelEdge endpoint pins.
// Require a live line connecting both ends of the same edge: a single manual
// vertex/midpoint relation does not mean that edge has already been converted.
export function convertedPins(sketch) {
  const constraints = (sketch.constraints || []).filter(c => c.type === "onModelEdge" && c.edge?.persistentId);
  const live = new Set((sketch.entities || []).map(e => e.id));
  const pins = new Set(constraints.filter(c => c.convert && live.has(c.entity)));
  const byPoint = new Map();
  for (const c of constraints) {
    if (c.convert || c.entity != null || !["start", "end"].includes(c.at)) continue;
    if (!byPoint.has(c.point)) byPoint.set(c.point, []);
    byPoint.get(c.point).push(c);
  }
  for (const line of sketch.entities || []) {
    if (line.type !== "line" || line.a === line.b) continue;
    for (const a of byPoint.get(line.a) || []) {
      const b = byPoint.get(line.b)?.find(c => c.edge.persistentId === a.edge.persistentId && c.at !== a.at);
      if (b) { pins.add(a); pins.add(b); }
    }
  }
  return pins;
}

const worldDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => (a.x || 0) * (b.x || 0) + (a.y || 0) * (b.y || 0) + (a.z || 0) * (b.z || 0);

function lineEndsReversed(group, byPoint) {
  const { edge, ends, pins } = group;
  for (const pin of pins) {
    for (const other of byPoint.get(pin.point)) {
      if (other === group) continue;
      const matches = ends.map(end => other.ends.some(p => worldDistance(p, end) < 1e-6));
      if (matches[0] !== matches[1]) return matches[0] !== (pin.at === "start");
    }
  }
  const ref = pins[0].edge, original = edgeEndpoints(ref);
  if (original.length < 2) return false;
  const before = sub3(original.at(-1), original[0]), now = sub3(ends[1], ends[0]);
  const oldAxis = ref.descriptor?.axis, axis = edge.descriptor?.axis;
  return oldAxis && axis ? dot(before, oldAxis) * dot(now, axis) < 0 : dot(before, now) < 0;
}

// Exact descriptors sort their endpoints by coordinate. Identify a line's
// shared vertex by its incident edges first. For a free line, use the native
// curve direction (or the previous chord if a lightweight edge has no axis).
export function convertedPinVertices(sketch, resolveEdge) {
  const byEdge = new Map(), byPoint = new Map(), vertices = new Map();
  for (const pin of convertedPins(sketch)) {
    if (pin.suppressed || pin.at === "center") continue;
    const id = pin.edge.persistentId;
    if (!byEdge.has(id)) {
      const edge = resolveEdge(pin.edge), ends = edgeEndpoints(edge);
      byEdge.set(id, ends.length < 2 ? null : { edge, ends: [ends[0], ends.at(-1)], pins: [] });
    }
    const group = byEdge.get(id);
    if (!group) continue;
    group.pins.push(pin);
    if (!byPoint.has(pin.point)) byPoint.set(pin.point, []);
    byPoint.get(pin.point).push(group);
  }
  for (const group of byEdge.values()) {
    if (!group) continue;
    const { edge, ends, pins } = group;
    if (pins.some(p => p.at === "arcStart" || p.at === "arcEnd")) {
      const curve = modelEdgeSketchCurve(sketch, edge);
      if (curve.kind !== "arc") throw new Error("The converted model edge is no longer an arc");
      for (const pin of pins) {
        const p = pin.at === "arcStart" ? curve.start : curve.end;
        const world = ends.find(end => {
          const q = projectWorldToSketch(sketch, end);
          return Math.hypot(q.x - p.x, q.y - p.y) < 1e-6;
        });
        if (!world) throw new Error("The converted arc endpoint is unavailable");
        vertices.set(pin, world);
      }
      continue;
    }
    const flip = lineEndsReversed(group, byPoint);
    for (const pin of pins) {
      const atLast = (pin.at === "end") !== flip;
      vertices.set(pin, ends[atLast ? 1 : 0]);
    }
  }
  return vertices;
}

/* Coincident with a model edge (SOLIDWORKS: a sketch point and an edge, then
   Coincident). The point stays on the edge's line as seen on this sketch plane;
   the line is re-read from the rebuilt edge, so it follows the body.
   - The "at" field (start | end | mid) pins the point to that place on the edge instead
     (a picked vertex; Midpoint; Convert Entities' end points).
   - An edge square to the plane shows as a point, and the point is pinned to
     where it pierces the plane.
   A reference that no longer resolves throws; nothing is baked. */
export function bindModelEdgeTargets(sketch, resolveEdge) {
  if (!sketch.constraints?.some(c => c.type === "onModelEdge" && !c.suppressed)) return sketch;
  const resolved = new Map();
  const lookup = ref => {
    if (!resolved.has(ref.persistentId)) resolved.set(ref.persistentId, resolveEdge?.(ref));
    return resolved.get(ref.persistentId);
  };
  const vertices = convertedPinVertices(sketch, lookup);
  for (const constraint of sketch.constraints || []) {
    if (constraint.type !== "onModelEdge" || !constraint.edge || constraint.suppressed) continue;
    const edge = lookup(constraint.edge);
    if (!edge) throw new Error("A coincident model edge is unavailable");
    if (constraint.convert) {
      const entity = sketch.entities.find(item => item.id === constraint.entity);
      if (!entity) throw new Error("The converted sketch entity is unavailable");
      const curve = modelEdgeSketchCurve(sketch, edge);
      if (entity.type !== curve.kind) throw new Error("The converted model edge is no longer a " + entity.type);
      const anchor = vertices.has(constraint) ? projectWorldToSketch(sketch, vertices.get(constraint))
        : constraint.at === "center" ? curve.center
        : constraint.at === "start" || constraint.at === "arcStart" ? curve.start : curve.end;
      Object.assign(constraint, { px: anchor.x, py: anchor.y });
      if (curve.kind === "circle") constraint.radius = curve.radius;
      if (curve.kind === "ellipse") Object.assign(constraint, { rx: curve.rx, ry: curve.ry, rot: curve.rot });
      continue;
    }
    for (const key of ["ax", "ay", "bx", "by", "px", "py"]) delete constraint[key];
    if (constraint.at) {
      const anchor = vertices.has(constraint) ? projectWorldToSketch(sketch, vertices.get(constraint))
        : modelEdgeAnchor(sketch, edge, constraint.at);
      Object.assign(constraint, { px: anchor.x, py: anchor.y });
      continue;
    }
    const line = modelEdgeSketchLine(sketch, edge);
    if (line) { Object.assign(constraint, { ax: line.a.x, ay: line.a.y, bx: line.b.x, by: line.b.y }); continue; }
    const pierce = modelEdgePierce(sketch, edge);
    if (!pierce) throw new Error("The model edge does not show as a line on this sketch plane");
    Object.assign(constraint, { px: pierce.x, py: pierce.y });
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
    if (constraint.sectionFace?.ownerFeatureId) ids.push(constraint.sectionFace.ownerFeatureId);
  }
  return ids;
}

/* Picking on a sketch that is drawn over the model through a perspective
   camera: an edge off the sketch plane is not where its plane projection is, so
   the click is compared in SCREEN space with where the model edge is actually
   drawn. `toScreen(world)` maps a world point to canvas pixels (or null when it
   is behind the camera). Only real straight edges and circles are pickable (a
   B-spline's chord is not the curve); relations still read the plane
   projection of whatever was picked. */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 > EPS ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function hitScreenModelVertex(px, edges, tol, toScreen, accept) {
  let best = null, bd = tol;
  for (const edge of edges || []) {
    if (edge?.kind && edge.kind !== "edge") continue;
    const ends = edgeEndpoints(edge);
    if (ends.length < 2) continue;
    for (const world of [ends[0], ends[ends.length - 1]]) {
      if (accept && !accept(world)) continue;
      const s = toScreen(world);
      if (!s) continue;
      const d = Math.hypot(px.x - s.x, px.y - s.y);
      if (d < bd) {
        bd = d;
        best = { kind: "vertex", persistentId: vertexKey(world), ownerFeatureId: edge.ownerFeatureId, descriptor: { point: { x: world.x, y: world.y, z: world.z }, origin: { x: world.x, y: world.y, z: world.z }, semantic: vertexKey(world) } };
      }
    }
  }
  return best;
}

export function hitScreenModelEdge(px, edges, tol, toScreen, pointsOf) {
  let best = null, bd = tol;
  for (const edge of edges || []) {
    if (edge?.kind && edge.kind !== "edge") continue;
    const curve = edge?.descriptor?.curve;
    if (curve && curve !== "line" && curve !== "circle" && curve !== "ellipse" && curve !== "polyline") continue;
    const world = curve === "ellipse" ? ellipseEdgePoints(edge.descriptor) : pointsOf(edge.descriptor) || [];
    if (world.length < 2) continue;
    const screen = world.map(toScreen);
    let d = Infinity;
    for (let i = 1; i < screen.length; i++) {
      if (!screen[i - 1] || !screen[i]) continue;
      d = Math.min(d, distanceToSegment(px, screen[i - 1], screen[i]));
    }
    if (d < bd) { bd = d; best = edge; }
  }
  return best;
}

/* A vertex on the sketch face takes precedence over its edges. A vertex
   behind the face should not mask a rim drawn directly under the pointer. */
export function pickSketchModelTopology(sketch, pos, edges, tolerance, toScreen, pointsOf) {
  const hitVertex = accept => toScreen ? hitScreenModelVertex(pos, edges, tolerance, toScreen, accept)
    : hitProjectedModelVertex(sketch, pos, edges, tolerance, accept);
  const onPlane = p => Math.abs(projectWorldToSketch(sketch, p).w) <= 1e-5;
  const vertex = hitVertex(onPlane);
  if (vertex) return vertex;
  const hit = candidates => toScreen ? hitScreenModelEdge(pos, candidates, tolerance, toScreen, pointsOf)
    : hitProjectedModelEdge(sketch, pos, candidates, tolerance);
  const faceEdges = edges.filter(edge => {
    const d = edge.descriptor;
    if (d.curve === "ellipse" || d.curve === "circle") {
      const center = d.ellipse?.center || d.origin;
      return center && onPlane(center) && parallelToSketch(sketch, d.ellipse?.normal || d.axis);
    }
    const ends = edgeEndpoints(edge);
    return ends.length > 1 && ends.every(onPlane);
  });
  return hit(faceEdges) || hitVertex() || hit(edges);
}

// Persistent topology naming for the canonical rebuild pipeline.
//
// A reference never stores an explorer index ("edge 7").  It stores the
// producing feature, a semantic persistent id and a geometric descriptor.  A
// rebuild first tries the id, then the semantic role, then the descriptor.  A
// close but non-exact descriptor match is reported as a rebind; ambiguous or
// missing matches are hard failures for the consuming feature.

import { frameDirection, framePoint } from "./frame.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const q = (value) => Math.round((Number(value) || 0) * 1000) / 1000;
const clone = (value) => value == null ? value : typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

function point(x = 0, y = 0, z = 0) { return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 }; }
function vector(x = 0, y = 0, z = 0) { return point(x, y, z); }
function distance(a, b) { return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0), (a?.z || 0) - (b?.z || 0)); }
function length(v) { return Math.hypot(v?.x || 0, v?.y || 0, v?.z || 0); }
function normalized(v) { const size = length(v) || 1; return vector((v?.x || 0) / size, (v?.y || 0) / size, (v?.z || 0) / size); }
function dot(a, b) { const av = normalized(a), bv = normalized(b); return av.x * bv.x + av.y * bv.y + av.z * bv.z; }
function dotRaw(a, b) { return (a?.x || 0) * (b?.x || 0) + (a?.y || 0) * (b?.y || 0) + (a?.z || 0) * (b?.z || 0); }
function cross(a, b) {
  return vector(
    (a?.y || 0) * (b?.z || 0) - (a?.z || 0) * (b?.y || 0),
    (a?.z || 0) * (b?.x || 0) - (a?.x || 0) * (b?.z || 0),
    (a?.x || 0) * (b?.y || 0) - (a?.y || 0) * (b?.x || 0),
  );
}

export function topologyDescriptorSignature(descriptor = {}) {
  const origin = descriptor.origin || descriptor.center || {};
  const direction = descriptor.normal || descriptor.axis || {};
  return [
    descriptor.surface || descriptor.curve || "unknown",
    q(origin.x), q(origin.y), q(origin.z),
    q(direction.x), q(direction.y), q(direction.z),
    q(descriptor.measure), descriptor.semantic || "",
  ].join(":");
}

export function createTopologyReference(ownerFeatureId, kind, persistentId, descriptor = {}, extras = {}) {
  const members = extras.memberPersistentIds || descriptor.memberPersistentIds;
  const reference = {
    type: "topology-reference",
    ownerFeatureId,
    kind,
    persistentId,
    semantic: descriptor.semantic,
    descriptor: clone(descriptor),
    signature: topologyDescriptorSignature(descriptor),
  };
  if (Array.isArray(members) && members.length) reference.memberPersistentIds = members.slice();
  return reference;
}

function topologyItem(feature, kind, token, descriptor) {
  const persistentId = feature.id + ":" + kind + ":" + token;
  return {
    ownerFeatureId: feature.id,
    kind,
    persistentId,
    semantic: descriptor.semantic || token,
    descriptor: clone(descriptor),
    signature: topologyDescriptorSignature(descriptor),
  };
}

function boxBounds(params = {}) {
  const x0 = finite(params.x0) ? params.x0 : Number(params.x) || 0;
  const y0 = finite(params.y0) ? params.y0 : Number(params.y) || 0;
  const z0 = finite(params.z0) ? params.z0 : Number(params.z) || 0;
  const x1 = finite(params.x1) ? params.x1 : x0 + (Number(params.w ?? params.width) || 0);
  const y1 = finite(params.y1) ? params.y1 : y0 + (Number(params.h ?? params.height) || 0);
  const z1 = finite(params.z1) ? params.z1 : z0 + (Number(params.d ?? params.depth) || 0);
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
}

function boxTopology(feature, params) {
  const b = boxBounds(params), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
  const dx = b.x1 - b.x0, dy = b.y1 - b.y0, dz = b.z1 - b.z0;
  const faces = [
    ["left", point(b.x0, cy, cz), vector(-1, 0, 0), dy * dz], ["right", point(b.x1, cy, cz), vector(1, 0, 0), dy * dz],
    ["bottom", point(cx, b.y0, cz), vector(0, -1, 0), dx * dz], ["top", point(cx, b.y1, cz), vector(0, 1, 0), dx * dz],
    ["back", point(cx, cy, b.z0), vector(0, 0, -1), dx * dy], ["front", point(cx, cy, b.z1), vector(0, 0, 1), dx * dy],
  ].map(([semantic, origin, normal, measure]) => topologyItem(feature, "face", semantic, { surface: "plane", semantic, origin, normal, measure }));
  const edges = [];
  for (const y of [["bottom", b.y0], ["top", b.y1]]) for (const z of [["back", b.z0], ["front", b.z1]]) {
    const semantic = "x:" + y[0] + ":" + z[0];
    edges.push(topologyItem(feature, "edge", semantic, { curve: "line", semantic, origin: point(cx, y[1], z[1]), axis: vector(1, 0, 0), measure: dx }));
  }
  for (const x of [["left", b.x0], ["right", b.x1]]) for (const z of [["back", b.z0], ["front", b.z1]]) {
    const semantic = "y:" + x[0] + ":" + z[0];
    edges.push(topologyItem(feature, "edge", semantic, { curve: "line", semantic, origin: point(x[1], cy, z[1]), axis: vector(0, 1, 0), measure: dy }));
  }
  for (const x of [["left", b.x0], ["right", b.x1]]) for (const y of [["bottom", b.y0], ["top", b.y1]]) {
    const semantic = "z:" + x[0] + ":" + y[0];
    edges.push(topologyItem(feature, "edge", semantic, { curve: "line", semantic, origin: point(x[1], y[1], cz), axis: vector(0, 0, 1), measure: dz }));
  }
  return faces.concat(edges);
}

function cylinderTopology(feature, params = {}) {
  const x = Number(params.x) || 0, y = Number(params.y) || 0, z = Number(params.z) || 0;
  const radius = Math.max(0, Number(params.r ?? params.radius) || 0), height = Math.max(0, Number(params.h ?? params.height) || 0);
  const axisName = params.axis || "y";
  const axis = axisName === "x" ? vector(1, 0, 0) : axisName === "z" ? vector(0, 0, 1) : vector(0, 1, 0);
  const base = point(x, y, z), top = point(x + axis.x * height, y + axis.y * height, z + axis.z * height);
  const middle = point((base.x + top.x) / 2, (base.y + top.y) / 2, (base.z + top.z) / 2);
  return [
    topologyItem(feature, "face", "side", { surface: "cylinder", semantic: "side", origin: middle, axis, measure: 2 * Math.PI * radius * height, radius }),
    topologyItem(feature, "face", "bottom", { surface: "plane", semantic: "bottom", origin: base, normal: vector(-axis.x, -axis.y, -axis.z), measure: Math.PI * radius * radius }),
    topologyItem(feature, "face", "top", { surface: "plane", semantic: "top", origin: top, normal: axis, measure: Math.PI * radius * radius }),
    topologyItem(feature, "edge", "bottom-rim", { curve: "circle", semantic: "bottom-rim", origin: base, axis, measure: 2 * Math.PI * radius, radius }),
    topologyItem(feature, "edge", "top-rim", { curve: "circle", semantic: "top-rim", origin: top, axis, measure: 2 * Math.PI * radius, radius }),
    topologyItem(feature, "axis", "center", { curve: "line", semantic: "center", origin: middle, axis, measure: height }),
  ];
}

function extrusionBounds(params = {}) {
  if (!Array.isArray(params.points) || params.points.length < 3) return null;
  const us = params.points.map((p) => Number(p.u ?? p.x) || 0), vs = params.points.map((p) => Number(p.v ?? p.y) || 0);
  const from = Number(params.from) || 0, to = Number(params.to) || 0, axis = params.axis || "y";
  if (axis === "x") return { x0: from, x1: to, y0: Math.min(...vs), y1: Math.max(...vs), z0: Math.min(...us), z1: Math.max(...us) };
  if (axis === "z") return { x0: Math.min(...us), x1: Math.max(...us), y0: Math.min(...vs), y1: Math.max(...vs), z0: from, z1: to };
  return { x0: Math.min(...us), x1: Math.max(...us), y0: from, y1: to, z0: Math.min(...vs), z1: Math.max(...vs) };
}

function extrusionTopology(feature, params = {}) {
  const points = params.points || [];
  if (points.length < 3) return [];
  const axisName = params.axis || "y", from = Number(params.from) || 0, to = Number(params.to) || 0;
  const depth = to - from, absoluteDepth = Math.abs(depth), middle = (from + to) / 2;
  const mapPoint = (u, v, w) => params.frame ? framePoint(params.frame, u, v, w)
    : axisName === "x" ? point(w, v, u) : axisName === "z" ? point(u, v, w) : point(u, w, v);
  const mapVector = (u, v, w) => params.frame ? frameDirection(params.frame, u, v, w)
    : axisName === "x" ? vector(w, v, u) : axisName === "z" ? vector(u, v, w) : vector(u, w, v);
  let twiceArea = 0, cu = 0, cv = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    const cross = (Number(a.u) || 0) * (Number(b.v) || 0) - (Number(b.u) || 0) * (Number(a.v) || 0);
    twiceArea += cross;
    cu += ((Number(a.u) || 0) + (Number(b.u) || 0)) * cross;
    cv += ((Number(a.v) || 0) + (Number(b.v) || 0)) * cross;
  }
  if (Math.abs(twiceArea) > 1e-9) { cu /= 3 * twiceArea; cv /= 3 * twiceArea; }
  else { cu = points.reduce((sum, item) => sum + (Number(item.u) || 0), 0) / points.length; cv = points.reduce((sum, item) => sum + (Number(item.v) || 0), 0) / points.length; }
  const sign = twiceArea >= 0 ? 1 : -1, direction = depth >= 0 ? 1 : -1;
  const topology = [
    topologyItem(feature, "face", "start", { surface:"plane", semantic:"start", origin:mapPoint(cu, cv, from), normal:mapVector(0, 0, -direction), measure:Math.abs(twiceArea) / 2 }),
    topologyItem(feature, "face", "end", { surface:"plane", semantic:"end", origin:mapPoint(cu, cv, to), normal:mapVector(0, 0, direction), measure:Math.abs(twiceArea) / 2 }),
  ];
  const count = points.length;
  const at = (index) => {
    const p = points[((index % count) + count) % count];
    return { u:Number(p.u) || 0, v:Number(p.v) || 0 };
  };
  const tokenAt = (index) => params.profileEntityIds?.[index] || String(index + 1);
  const segments = points.map((_, index) => {
    const a = at(index), b = at(index + 1), du = b.u - a.u, dv = b.v - a.v;
    const measure = Math.hypot(du, dv) || 1e-9;
    return { a, b, du, dv, measure, ux:du / measure, uy:dv / measure };
  });
  /* A tessellated arc reaches this function as fifty short chords. Naming each
     one is what turned a cylinder into a barrel of staves on screen: fifty side
     faces, and a vertical edge drawn down every seam between them. Chords that
     meet within this angle are one wall of one curved face, and the joint
     between them is not an edge at all — only a real corner is. */
  const TANGENT = 0.30;   // rad ≈ 17°, well below the sharpest fillet-worthy corner
  const sameEntity = Array.isArray(params.profileEntityIds) && params.profileEntityIds.length === count;
  const corner = (index) => {
    const previous = segments[(index - 1 + count) % count], current = segments[index];
    if (sameEntity && params.profileEntityIds[(index - 1 + count) % count] !== params.profileEntityIds[index]) return true;
    return Math.acos(Math.max(-1, Math.min(1, previous.ux * current.ux + previous.uy * current.uy))) > TANGENT;
  };
  const corners = segments.map((_, index) => index).filter(corner);
  // No corner anywhere means the whole loop is one smooth wall: a circle.
  const runs = corners.length
    ? corners.map((start, i) => {
        const end = corners[(i + 1) % corners.length];
        const span = ((end - start + count - 1) % count) + 1;
        return Array.from({ length:span }, (_, k) => (start + k) % count);
      })
    : [segments.map((_, index) => index)];

  runs.forEach((run) => {
    const token = tokenAt(run[0]);
    const first = segments[run[0]], last = segments[run[run.length - 1]];
    const arcLength = run.reduce((sum, index) => sum + segments[index].measure, 0);
    const loop = run.map((index) => segments[index].a).concat(run.length === count ? [] : [last.b]);
    const mid = segments[run[(run.length - 1) >> 1]];
    const outward = (s) => mapVector(sign * s.uy, -sign * s.ux, 0);
    const sideSemantic = "side:" + token, fit = run.length > 1 ? fitCircle(loop) : null;
    if (run.length === 1) {
      topology.push(topologyItem(feature, "face", sideSemantic, {
        surface:"plane", semantic:sideSemantic, origin:mapPoint((first.a.u+first.b.u)/2,(first.a.v+first.b.v)/2,middle),
        normal:outward(first), measure:first.measure * absoluteDepth,
      }));
    } else {
      // A merged wall is a swept surface. When the run is a true arc — the
      // common case, since it came from a circle or an arc entity — carry the
      // axis and radius so a picker can recognise the whole cylinder rather
      // than whichever facet the ray happened to land on.
      topology.push(topologyItem(feature, "face", sideSemantic, Object.assign({
        surface: fit ? "cylinder" : "ruled", semantic:sideSemantic,
        origin: fit ? mapPoint(fit.u, fit.v, middle) : mapPoint((mid.a.u+mid.b.u)/2,(mid.a.v+mid.b.v)/2,middle),
        normal: outward(mid), measure:arcLength * absoluteDepth,
      }, fit ? { axis:mapVector(0, 0, direction), radius:fit.radius } : {})));
    }
    for (const end of [["start", from], ["end", to]]) {
      const semantic = "profile:" + token + ":" + end[0], closed = run.length === count;
      // A closed smooth loop is a rim, and saying so lets consumers draw and
      // measure a real circle instead of re-reading the polyline it was cut from.
      topology.push(topologyItem(feature, "edge", semantic, closed && fit ? {
        curve:"circle", semantic, origin:mapPoint(fit.u, fit.v, end[1]), axis:mapVector(0, 0, direction),
        radius:fit.radius, measure:arcLength,
      } : {
        curve: run.length > 1 ? "polyline" : "line", semantic,
        origin:mapPoint((first.a.u + last.b.u) / 2, (first.a.v + last.b.v) / 2, end[1]),
        axis:mapVector(first.ux, first.uy, 0), measure:arcLength,
        endpoints:loop.concat(closed ? [first.a] : []).map((p) => mapPoint(p.u, p.v, end[1])),
      }));
    }
    // Only a real corner gets a vertical edge; the seams inside a run do not.
    if (corners.length) {
      const depthSemantic = "depth:" + token;
      topology.push(topologyItem(feature, "edge", depthSemantic, {
        curve:"line", semantic:depthSemantic, origin:mapPoint(first.a.u, first.a.v, middle), axis:mapVector(0, 0, direction), measure:absoluteDepth,
        endpoints:[mapPoint(first.a.u, first.a.v, from), mapPoint(first.a.u, first.a.v, to)],
      }));
    }
  });
  return topology;
}

/* Least-squares circle through a polyline (Kåsa fit), rejected when the points
   do not actually sit on it — an ellipse or a rounded rectangle side must not
   be mistaken for an arc. */
function fitCircle(loop) {
  if (!Array.isArray(loop) || loop.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  loop.forEach(({ u, v }) => {
    const z = u * u + v * v;
    sx += u; sy += v; sxx += u * u; syy += v * v; sxy += u * v; sxz += u * z; syz += v * z; sz += z;
  });
  const n = loop.length;
  const a = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [sxz, syz, sz];
  const determinant = a[0][0]*(a[1][1]*a[2][2]-a[1][2]*a[2][1]) - a[0][1]*(a[1][0]*a[2][2]-a[1][2]*a[2][0]) + a[0][2]*(a[1][0]*a[2][1]-a[1][1]*a[2][0]);
  if (!finite(determinant) || Math.abs(determinant) < 1e-9) return null;
  const solve = (column) => {
    const m = a.map((row, i) => row.map((value, j) => (j === column ? b[i] : value)));
    return (m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])) / determinant;
  };
  const u = solve(0) / 2, v = solve(1) / 2, c = solve(2);
  const squared = c + u * u + v * v;
  if (!finite(squared) || squared <= 1e-9) return null;
  const radius = Math.sqrt(squared);
  const worst = loop.reduce((max, p) => Math.max(max, Math.abs(Math.hypot(p.u - u, p.v - v) - radius)), 0);
  return worst <= Math.max(1e-4, radius * 0.02) ? { u, v, radius } : null;
}

/* A sampled sketch circle is a closed polyline whose length is ~2πr. Arcs and
   rounded-rectangle corners fail that check and stay polygons. */
export function fitProfileCircle(points) {
  if (!Array.isArray(points) || points.length < 12) return null;
  const fit = fitCircle(points);
  if (!fit) return null;
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    len += Math.hypot((Number(a.u) || 0) - (Number(b.u) || 0), (Number(a.v) || 0) - (Number(b.v) || 0));
  }
  const expected = 2 * Math.PI * fit.radius;
  if (!expected || Math.abs(len - expected) > expected * 0.06) return null;
  return fit;
}

export function topologyMemberIds(reference) {
  const members = reference?.memberPersistentIds;
  if (Array.isArray(members) && members.length) return members.slice();
  return reference?.persistentId ? [reference.persistentId] : [];
}

function lineEndpointsFromDescriptor(descriptor = {}) {
  if (Array.isArray(descriptor.endpoints) && descriptor.endpoints.length >= 2) return descriptor.endpoints;
  const origin = descriptor.origin, axis = descriptor.axis, measure = Number(descriptor.measure);
  if (!origin || !axis || !finite(measure)) return origin ? [origin] : [];
  const size = length(axis) || 1, half = measure / (2 * size);
  return [
    point(origin.x - axis.x * half, origin.y - axis.y * half, origin.z - axis.z * half),
    point(origin.x + axis.x * half, origin.y + axis.y * half, origin.z + axis.z * half),
  ];
}

function pointOnPlane(p, origin, normal, tol) {
  return Math.abs(dotRaw(vector((p?.x || 0) - origin.x, (p?.y || 0) - origin.y, (p?.z || 0) - origin.z), normal)) <= tol;
}

/* A picked face in Fillet/Chamfer means every edge that bounds that face, the
   way SolidWorks and Fusion apply a finish when the user clicked the face
   instead of walking its perimeter. */
export function edgeLiesOnFace(edge, face) {
  const fd = face?.descriptor || {}, ed = edge?.descriptor || {};
  const origin = fd.origin || fd.center;
  const faceSpan = Math.sqrt(Math.abs(Number(fd.measure) || Number(ed.measure) || 1));
  const tol = Math.max(0.6, faceSpan * 0.08, Math.abs(Number(ed.measure) || 0) * 0.03);
  if (fd.surface === "plane" && origin && fd.normal) {
    const n = normalized(fd.normal);
    if (ed.curve === "circle") {
      if (!pointOnPlane(ed.origin || {}, origin, n, tol)) return false;
      return Math.abs(Math.abs(dot(ed.axis, n)) - 1) <= 0.12;
    }
    const points = lineEndpointsFromDescriptor(ed);
    if (points.length >= 2) return points.every((p) => pointOnPlane(p, origin, n, tol));
    if (ed.origin && ed.axis) {
      return pointOnPlane(ed.origin, origin, n, tol) && Math.abs(dot(ed.axis, n)) <= 0.18;
    }
    return false;
  }
  if (fd.surface === "cylinder" && origin && fd.axis && finite(Number(fd.radius))) {
    const axis = normalized(fd.axis), radius = Number(fd.radius);
    const radial = (p) => {
      const rel = vector((p?.x || 0) - origin.x, (p?.y || 0) - origin.y, (p?.z || 0) - origin.z);
      const along = dotRaw(rel, axis);
      return vector(rel.x - axis.x * along, rel.y - axis.y * along, rel.z - axis.z * along);
    };
    const radialTol = Math.max(tol, radius * 0.08);
    if (ed.curve === "circle") {
      if (Math.abs((Number(ed.radius) || 0) - radius) > radialTol) return false;
      if (Math.abs(Math.abs(dot(ed.axis, axis)) - 1) > 0.08) return false;
      return length(radial(ed.origin || {})) <= radialTol;
    }
    if (ed.curve === "line" || ed.curve === "polyline") {
      if (ed.axis && Math.abs(Math.abs(dot(ed.axis, axis)) - 1) > 0.12) return false;
      const points = lineEndpointsFromDescriptor(ed);
      return points.length > 0 && points.every((p) => Math.abs(length(radial(p)) - radius) <= radialTol);
    }
  }
  return false;
}

export function edgesBoundingFace(face, registry) {
  const source = registry?.byPersistentId ? registry : createTopologyRegistry(registry || []);
  const resolved = (face?.persistentId && source.byPersistentId.get(face.persistentId)) || face;
  if (!resolved || resolved.kind !== "face") return [];
  return source.list.filter((item) => item.kind === "edge" && edgeLiesOnFace(item, resolved));
}

function expandFinishFacesToEdges(references, source, add) {
  (references || []).forEach((reference) => {
    if (reference?.kind && reference.kind !== "face") return;
    const resolved = resolveTopologyReference(reference, source, { threshold: 1.25, ambiguityTolerance: 0.08 });
    const face = (resolved.status === "exact" || resolved.status === "rebound") ? resolved.topology : source.byPersistentId.get(reference?.persistentId);
    if (!face || face.kind !== "face") return;
    edgesBoundingFace(face, source).forEach((edge) => add(edge.persistentId));
  });
}

/* Finish operations (fillet/chamfer/shell) must consume the kernel edge that
   the picker meant, not only the string it stored. Tessellated picks, merged
   circles and a rebuilt BREP all produce different persistent ids for the
   same geometric edge — resolve those by descriptor before giving up. A face
   with no edges picked expands to every edge that bounds it. */
export function resolveFinishTargetIds(references, registry, kind) {
  const source = registry?.byPersistentId ? registry : createTopologyRegistry(registry || []);
  const ids = [];
  const geometryKeys = new Set();
  /* Two ids can name one physical edge (a kernel edge and the tessellated
     overlay line the user actually clicked). Dedupe on geometry as well as on
     the id string, or a multi-pick reports — and finishes — the same edge
     twice. */
  const geometryKey = (item) => {
    const descriptor = item?.descriptor || {};
    const signature = topologyDescriptorSignature(descriptor);
    return signature.slice(0, signature.lastIndexOf(":"));
  };
  const add = (id) => {
    if (!id || ids.includes(id)) return false;
    const item = source.byPersistentId.get(id);
    if (!item || (kind && item.kind !== kind)) return false;
    const key = geometryKey(item);
    if (geometryKeys.has(key)) return false;
    geometryKeys.add(key);
    ids.push(id);
    return true;
  };
  /* Resolve every reference on its own. An earlier version fell back to
     descriptor matching only when NOTHING resolved by id, so a mixed pick —
     one kernel edge plus one tessellated edge — silently dropped the
     tessellated one while the panel still counted it. */
  (references || []).forEach((reference) => {
    if (!reference) return;
    let matched = false;
    topologyMemberIds(reference).forEach((id) => { if (add(id)) matched = true; });
    if (add(reference.persistentId)) matched = true;
    if (matched) return;
    if (kind === "edge" && reference.kind === "face") return;   // expanded below
    const resolved = resolveTopologyReference(reference, source, { threshold: 1.25, ambiguityTolerance: 0.08 });
    if (resolved.topology) add(resolved.topology.persistentId);
  });
  if (kind === "edge") expandFinishFacesToEdges(references, source, add);
  return ids;
}

export function resolveMergedTopology(entries, persistentId) {
  if (!persistentId) return null;
  return (entries || []).find((entry) => entry.persistentId === persistentId || (entry.memberPersistentIds || []).includes(persistentId)) || null;
}

function endpointKey(point) {
  return [Math.round((point?.x || 0) * 500), Math.round((point?.y || 0) * 500), Math.round((point?.z || 0) * 500)].join(":");
}

export function fitCircle3(points) {
  if (!Array.isArray(points) || points.length < 4) return null;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    nx += ((a.y || 0) - (b.y || 0)) * ((a.z || 0) + (b.z || 0));
    ny += ((a.z || 0) - (b.z || 0)) * ((a.x || 0) + (b.x || 0));
    nz += ((a.x || 0) - (b.x || 0)) * ((a.y || 0) + (b.y || 0));
  }
  const axis = normalized(vector(nx, ny, nz));
  if (length(axis) < 1e-9) return null;
  const origin = points[0];
  const seed = Math.abs(axis.y) < 0.9 ? vector(0, 1, 0) : vector(1, 0, 0);
  const u = normalized(cross(axis, seed)), v = normalized(cross(axis, u));
  const fit = fitCircle(points.map((p) => ({
    u: ((p.x || 0) - origin.x) * u.x + ((p.y || 0) - origin.y) * u.y + ((p.z || 0) - origin.z) * u.z,
    v: ((p.x || 0) - origin.x) * v.x + ((p.y || 0) - origin.y) * v.y + ((p.z || 0) - origin.z) * v.z,
  })));
  if (!fit) return null;
  return {
    origin: point(origin.x + u.x * fit.u + v.x * fit.v, origin.y + u.y * fit.u + v.y * fit.v, origin.z + u.z * fit.u + v.z * fit.v),
    axis,
    radius: fit.radius,
  };
}

function mergedTopologyItem(seed, members, kind, descriptor) {
  const ids = members.map((item) => item.persistentId).filter(Boolean);
  return {
    ...clone(seed),
    kind,
    persistentId: seed.persistentId,
    semantic: descriptor.semantic || seed.semantic,
    descriptor: clone(descriptor),
    signature: topologyDescriptorSignature(descriptor),
    memberPersistentIds: ids,
  };
}

function mergeCircleEdges(edges) {
  const groups = new Map(), leftover = [];
  edges.forEach((edge) => {
    const d = edge.descriptor || {};
    if (d.curve !== "circle" || !finite(Number(d.radius))) { leftover.push(edge); return; }
    const axis = normalized(d.axis || vector(0, 1, 0));
    const sign = axis.x + axis.y + axis.z < 0 ? -1 : 1;
    const origin = d.origin || {};
    const key = [
      Math.round((origin.x || 0) * 10), Math.round((origin.y || 0) * 10), Math.round((origin.z || 0) * 10),
      Math.round(axis.x * sign * 10), Math.round(axis.y * sign * 10), Math.round(axis.z * sign * 10),
      Math.round(Number(d.radius) * 20),
    ].join(":");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  });
  const merged = [];
  groups.forEach((group) => {
    if (group.length === 1) merged.push(group[0]);
    else merged.push(mergedTopologyItem(group[0], group, "edge", {
      curve: "circle", semantic: group[0].semantic, origin: group[0].descriptor.origin,
      axis: group[0].descriptor.axis, radius: group[0].descriptor.radius,
      measure: group.reduce((sum, item) => sum + (Number(item.descriptor.measure) || 0), 0),
    }));
  });
  return merged.concat(leftover);
}

function mergeLineEdgesIntoCircles(edges) {
  const lines = [], leftover = [];
  edges.forEach((edge) => {
    const d = edge.descriptor || {};
    if (d.curve === "line" && Array.isArray(d.endpoints) && d.endpoints.length >= 2) lines.push(edge);
    else leftover.push(edge);
  });
  const at = new Map();
  const add = (key, index, end) => {
    if (!at.has(key)) at.set(key, []);
    at.get(key).push({ index, end });
  };
  lines.forEach((edge, index) => {
    add(endpointKey(edge.descriptor.endpoints[0]), index, 0);
    add(endpointKey(edge.descriptor.endpoints[1]), index, 1);
  });
  const used = new Set(), merged = [];
  lines.forEach((edge, startIndex) => {
    if (used.has(startIndex)) return;
    const run = [startIndex];
    used.add(startIndex);
    let head = endpointKey(edge.descriptor.endpoints[0]), tail = endpointKey(edge.descriptor.endpoints[1]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const key of [head, tail]) {
        const next = (at.get(key) || []).find((item) => !used.has(item.index));
        if (!next) continue;
        used.add(next.index);
        const other = lines[next.index].descriptor.endpoints[1 - next.end];
        if (key === head) { run.unshift(next.index); head = endpointKey(other); }
        else { run.push(next.index); tail = endpointKey(other); }
        grew = true;
        break;
      }
    }
    const points = [];
    run.forEach((index, i) => {
      const ends = lines[index].descriptor.endpoints;
      if (!i) { points.push(ends[0], ends[1]); return; }
      const last = points[points.length - 1];
      points.push(distance(last, ends[0]) <= distance(last, ends[1]) ? ends[1] : ends[0]);
    });
    const closed = head === tail && run.length >= 3;
    if (closed && points.length > 1 && endpointKey(points[0]) === endpointKey(points[points.length - 1])) points.pop();
    const first = points[0], last = points[points.length - 1];
    const span = Math.max(0.35, distance(first, last) || Number(lines[run[0]]?.descriptor?.measure) || 1);
    const nearlyClosed = !closed && run.length >= 6 && first && last && distance(first, last) <= span;
    /* Coarse tessellation puts a 30° "corner" on every chord of a real circle.
       Fit the loop first; angle is only a hint, not a veto. */
    const fit = ((closed || nearlyClosed) && run.length >= 6) ? fitCircle3(points) : null;
    if (fit) {
      const members = run.map((index) => lines[index]);
      merged.push(mergedTopologyItem(members[0], members, "edge", {
        curve: "circle", semantic: members[0].semantic, origin: fit.origin, axis: fit.axis,
        radius: fit.radius, measure: 2 * Math.PI * fit.radius,
      }));
    } else {
      run.forEach((index) => leftover.push(lines[index]));
    }
  });
  return merged.concat(leftover);
}

function cylinderFromTwoPlanes(a, b) {
  const n1 = normalized(a.descriptor.normal), n2 = normalized(b.descriptor.normal);
  const alignment = Math.abs(dot(n1, n2));
  if (alignment > 0.999 || alignment < 0.85) return null;
  const axis = normalized(cross(n1, n2));
  if (length(axis) < 1e-6) return null;
  const c1 = a.descriptor.origin, c2 = b.descriptor.origin;
  const drop = (v) => {
    const along = dotRaw(v, axis);
    return vector(v.x - axis.x * along, v.y - axis.y * along, v.z - axis.z * along);
  };
  const dn = drop(vector(n1.x - n2.x, n1.y - n2.y, n1.z - n2.z));
  const dc = drop(vector(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z));
  const dnLen = length(dn);
  if (dnLen < 1e-6) return null;
  const radius = length(dc) / dnLen;
  if (!finite(radius) || radius < 1e-4) return null;
  const origin = point(c1.x - n1.x * radius, c1.y - n1.y * radius, c1.z - n1.z * radius);
  return { axis, origin, radius };
}

function fitCylinderFromPlanes(faces) {
  if (!Array.isArray(faces) || faces.length < 2) return null;
  if (faces.length === 2) return cylinderFromTwoPlanes(faces[0], faces[1]);
  const normals = faces.map((face) => normalized(face.descriptor.normal));
  let axis = vector(0, 0, 0), pairs = 0;
  for (let i = 0; i < normals.length; i++) {
    for (let j = i + 1; j < normals.length; j++) {
      const alignment = Math.abs(dot(normals[i], normals[j]));
      if (alignment > 0.999 || alignment < 0.85) continue;
      const candidate = normalized(cross(normals[i], normals[j]));
      if (length(candidate) < 1e-6) continue;
      if (pairs && dot(candidate, axis) < 0) { candidate.x *= -1; candidate.y *= -1; candidate.z *= -1; }
      axis.x += candidate.x; axis.y += candidate.y; axis.z += candidate.z;
      pairs++;
    }
  }
  if (pairs < 3) return null;
  axis = normalized(axis);
  const origin0 = faces[0].descriptor.origin;
  const seed = Math.abs(axis.y) < 0.9 ? vector(0, 1, 0) : vector(1, 0, 0);
  const u = normalized(cross(axis, seed)), v = normalized(cross(axis, u));
  const fit = fitCircle(faces.map((face) => {
    const p = face.descriptor.origin;
    return {
      u: (p.x - origin0.x) * u.x + (p.y - origin0.y) * u.y + (p.z - origin0.z) * u.z,
      v: (p.x - origin0.x) * v.x + (p.y - origin0.y) * v.y + (p.z - origin0.z) * v.z,
    };
  }));
  if (!fit) return null;
  return {
    origin: point(origin0.x + u.x * fit.u + v.x * fit.v, origin0.y + u.y * fit.u + v.y * fit.v, origin0.z + u.z * fit.u + v.z * fit.v),
    axis,
    radius: fit.radius,
  };
}

function planeMatchesCylinder(face, cylinder) {
  const d = face.descriptor || {}, origin = d.origin, normal = d.normal;
  if (!origin || !normal || Math.abs(dot(normal, cylinder.axis)) > 0.25) return false;
  const radial = vector(
    origin.x - cylinder.origin.x,
    origin.y - cylinder.origin.y,
    origin.z - cylinder.origin.z,
  );
  const along = dotRaw(radial, cylinder.axis);
  radial.x -= cylinder.axis.x * along; radial.y -= cylinder.axis.y * along; radial.z -= cylinder.axis.z * along;
  return Math.abs(length(radial) - cylinder.radius) <= Math.max(0.35, cylinder.radius * 0.06);
}

function mergeCylindricalFaces(faces) {
  const planes = [], cylinders = [], leftover = [];
  faces.forEach((face) => {
    const surface = face.descriptor?.surface;
    if (surface === "cylinder" && finite(Number(face.descriptor.radius))) cylinders.push(face);
    else if (surface === "plane" && face.descriptor?.normal && face.descriptor?.origin) planes.push(face);
    else leftover.push(face);
  });
  const groupedCylinders = new Map();
  cylinders.forEach((face) => {
    const d = face.descriptor, axis = normalized(d.axis || vector(0, 1, 0));
    const sign = axis.x + axis.y + axis.z < 0 ? -1 : 1;
    const origin = d.origin || {};
    const axial = (origin.x || 0) * axis.x + (origin.y || 0) * axis.y + (origin.z || 0) * axis.z;
    const key = [
      Math.round(axis.x * sign * 20), Math.round(axis.y * sign * 20), Math.round(axis.z * sign * 20),
      Math.round(Number(d.radius) * 50), Math.round(axial * 10),
    ].join(":");
    if (!groupedCylinders.has(key)) groupedCylinders.set(key, []);
    groupedCylinders.get(key).push(face);
  });
  const merged = [];
  groupedCylinders.forEach((group) => {
    if (group.length === 1) merged.push(group[0]);
    else merged.push(mergedTopologyItem(group[0], group, "face", {
      surface: "cylinder", semantic: group[0].semantic, origin: group[0].descriptor.origin,
      axis: group[0].descriptor.axis, radius: group[0].descriptor.radius,
      measure: group.reduce((sum, item) => sum + (Number(item.descriptor.measure) || 0), 0),
    }));
  });
  const remaining = planes.slice();
  while (remaining.length) {
    const seed = remaining.pop(), cluster = [seed];
    let fit = null;
    for (let i = remaining.length - 1; i >= 0; i--) {
      fit = cylinderFromTwoPlanes(seed, remaining[i]);
      if (!fit) continue;
      cluster.push(remaining.splice(i, 1)[0]);
      break;
    }
    let grew = !!fit;
    while (grew) {
      grew = false;
      fit = fitCylinderFromPlanes(cluster);
      if (!fit) break;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (!planeMatchesCylinder(remaining[i], fit)) continue;
        cluster.push(remaining.splice(i, 1)[0]);
        grew = true;
      }
    }
    fit = fitCylinderFromPlanes(cluster);
    if (fit && cluster.length >= 6) {
      merged.push(mergedTopologyItem(cluster[0], cluster, "face", {
        surface: "cylinder", semantic: cluster[0].semantic, origin: fit.origin,
        axis: fit.axis, radius: fit.radius,
        measure: cluster.reduce((sum, item) => sum + (Number(item.descriptor.measure) || 0), 0),
      }));
    } else leftover.push(...cluster);
  }
  return merged.concat(leftover);
}

/* Tessellated circles and cylindrical walls reach the picker as many short
   chords / staves. Merging them is what lets a fillet consume a whole rim
   instead of one facet, and what lights the entire bore when a wall is picked. */
export function mergeSmoothTopology(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const edges = mergeLineEdgesIntoCircles(mergeCircleEdges(list.filter((entry) => entry.kind === "edge")));
  const faces = mergeCylindricalFaces(list.filter((entry) => entry.kind === "face"));
  const other = list.filter((entry) => entry.kind !== "edge" && entry.kind !== "face");
  return other.concat(faces, edges);
}

function inheritedTopology(feature, inputs) {
  const output = [];
  inputs.forEach((input) => (input?.topology || []).forEach((item) => output.push({
    ...clone(item), inheritedBy: feature.id, sourcePersistentId: item.sourcePersistentId || item.persistentId,
  })));
  return output;
}

function consumedTopologyIds(feature, params, inherited = []) {
  const kinds = feature.type === "shell" ? new Set(["face"]) : new Set(["edge"]);
  if (!["fillet", "chamfer", "shell"].includes(feature.type)) return new Set();
  const ids = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.persistentId === "string" && kinds.has(value.kind)) ids.add(value.persistentId);
    else Object.values(value).forEach(visit);
  };
  visit(params?.targets);
  visit(params?.topologyReferences);
  if (feature.type !== "shell") {
    const registry = createTopologyRegistry(inherited);
    const visitFaces = (value) => {
      if (!value || typeof value !== "object") return;
      if (value.kind === "face") {
        edgesBoundingFace(value, registry).forEach((edge) => ids.add(edge.persistentId));
        return;
      }
      Object.values(value).forEach(visitFaces);
    };
    visitFaces(params?.targets);
    visitFaces(params?.topologyReferences);
  }
  return ids;
}

export function topologyForFeature(feature, params = {}, inputs = []) {
  if (!feature?.id) return [];
  if (["direct", "import"].includes(feature.type) && Array.isArray(params.topology)) {
    return params.topology.map((item) => ({ ...clone(item), ownerFeatureId:feature.id }));
  }
  if (feature.type === "box") return boxTopology(feature, params);
  if (feature.type === "cylinder") return cylinderTopology(feature, params);
  if (feature.type === "extrude") return extrusionTopology(feature, params);
  if (feature.type === "procedural" && finite(Number(params.width)) && finite(Number(params.depth)) && finite(Number(params.height))) {
    return boxTopology(feature, { x0: -Number(params.width) / 2, x1: Number(params.width) / 2, y0: 0, y1: Number(params.height), z0: -Number(params.depth) / 2, z1: Number(params.depth) / 2 });
  }
  if (["cut", "fillet", "chamfer", "shell", "union", "subtract", "intersect", "mirror", "linearPattern", "linearGridPattern", "circularPattern", "pattern"].includes(feature.type)) {
    const inherited = inheritedTopology(feature, inputs), consumed = consumedTopologyIds(feature, params, inherited);
    return consumed.size ? inherited.filter((item) => !consumed.has(item.persistentId)) : inherited;
  }
  return [];
}

export function createTopologyRegistry(items = []) {
  const list = [];
  const byPersistentId = new Map();
  const append = (item) => {
    if (!item?.persistentId) return;
    if (!byPersistentId.has(item.persistentId)) list.push(item);
    byPersistentId.set(item.persistentId, item);
  };
  items.forEach((item) => {
    if (Array.isArray(item)) item.forEach(append);
    else if (Array.isArray(item?.topology)) item.topology.forEach(append);
    else append(item);
  });
  return { list, byPersistentId };
}

function fallbackDescriptor(reference) {
  if (reference?.descriptor) return reference.descriptor;
  if (reference?.frame) return {
    surface: reference.frame.surface,
    origin: reference.frame.origin,
    normal: reference.frame.normal,
    axis: reference.frame.axis,
    measure: reference.frame.measure,
    semantic: reference.semantic,
  };
  return null;
}

function descriptorScore(wanted, candidate) {
  const descriptor = candidate.descriptor || {};
  let score = 0;
  if ((wanted.surface || wanted.curve) && (wanted.surface || wanted.curve) !== (descriptor.surface || descriptor.curve)) score += 2;
  if (wanted.semantic && descriptor.semantic !== wanted.semantic) score += 0.35;
  const scale = Math.max(1, Math.sqrt(Math.abs(Number(wanted.measure) || Number(descriptor.measure) || 1)));
  score += distance(wanted.origin || wanted.center, descriptor.origin || descriptor.center) / scale;
  const wantedDirection = wanted.normal || wanted.axis, candidateDirection = descriptor.normal || descriptor.axis;
  if (wantedDirection && candidateDirection) score += 1 - Math.abs(dot(wantedDirection, candidateDirection));
  if (finite(Number(wanted.measure)) && finite(Number(descriptor.measure))) score += Math.abs(Number(wanted.measure) - Number(descriptor.measure)) / Math.max(1, Math.abs(Number(wanted.measure)));
  return score;
}

export function resolveTopologyReference(reference, registry, options = {}) {
  const source = registry?.byPersistentId ? registry : createTopologyRegistry(registry || []);
  const exact = source.byPersistentId.get(reference?.persistentId);
  if (exact && (!reference.kind || exact.kind === reference.kind)) return { status: "exact", reference, topology: exact, score: 0 };
  let candidates = source.list.filter((item) => !reference?.kind || item.kind === reference.kind);
  if (reference?.ownerFeatureId) {
    const owned = candidates.filter((item) => item.ownerFeatureId === reference.ownerFeatureId);
    if (owned.length) candidates = owned;
  }
  if (reference?.semantic) {
    const semantic = candidates.filter((item) => item.semantic === reference.semantic);
    if (semantic.length === 1) return { status: "rebound", reference, topology: semantic[0], score: 0, reason: "semantic-role" };
    if (semantic.length) candidates = semantic;
  }
  const wanted = fallbackDescriptor(reference);
  if (!wanted || !candidates.length) return { status: "missing", reference, topology: null, reason: candidates.length ? "missing-fallback" : "no-candidates" };
  const ranked = candidates.map((item) => ({ item, score: descriptorScore(wanted, item) })).sort((a, b) => a.score - b.score || a.item.persistentId.localeCompare(b.item.persistentId));
  const threshold = finite(options.threshold) ? options.threshold : 0.45;
  if (!ranked.length || ranked[0].score > threshold) return { status: "missing", reference, topology: null, score: ranked[0]?.score, reason: "outside-tolerance" };
  if (ranked[1] && Math.abs(ranked[1].score - ranked[0].score) < (options.ambiguityTolerance || 0.025)) {
    return { status: "ambiguous", reference, topology: null, candidates: ranked.slice(0, 3).map((entry) => entry.item), score: ranked[0].score };
  }
  return { status: "rebound", reference, topology: ranked[0].item, score: ranked[0].score, reason: "geometric-fallback" };
}

export function featureTopologyReferences(feature) {
  // An import feature publishes these records; they are produced topology,
  // not references which need to resolve against an upstream registry.
  if (["direct", "import"].includes(feature?.type)) return [];
  const found = [], seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.persistentId === "string" && (value.type === "topology-reference" || ["face", "edge", "axis", "vertex"].includes(value.kind))) {
      const key = value.ownerFeatureId + "|" + value.kind + "|" + value.persistentId;
      if (!seen.has(key)) { seen.add(key); found.push(value); }
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(feature?.references);
  visit(feature?.params);
  visit(feature?.topologyReferences);
  return found;
}

export function resolveFeatureTopologyReferences(feature, registry, options = {}) {
  const resolutions = featureTopologyReferences(feature).map((reference) => resolveTopologyReference(reference, registry, options));
  const issues = [];
  resolutions.forEach((resolution) => {
    if (resolution.status === "rebound") issues.push({
      severity: "warning", code: "topology-reference-rebound", featureId: feature.id,
      reference: resolution.reference.persistentId, reboundTo: resolution.topology.persistentId,
      message: (feature.name || feature.id) + " rebound " + resolution.reference.persistentId + " to " + resolution.topology.persistentId,
    });
    else if (resolution.status === "missing" || resolution.status === "ambiguous") issues.push({
      severity: "error", code: resolution.status === "ambiguous" ? "ambiguous-topology-reference" : "missing-topology-reference",
      featureId: feature.id, reference: resolution.reference.persistentId,
      candidates: resolution.candidates?.map((item) => item.persistentId) || [],
      message: (feature.name || feature.id) + " has an " + resolution.status + " topology reference: " + resolution.reference.persistentId,
    });
  });
  return { resolutions, issues };
}

// Rebinding is kept separate from resolution so previews and failed rebuilds
// remain side-effect free.  The model editor calls this only when a document is
// explicitly saved, preserving an audit trail of the old names.
export function applyTopologyRebindings(resolutions = []) {
  const applied = [];
  resolutions.forEach((resolution) => {
    if (resolution.status !== "rebound" || !resolution.reference || !resolution.topology) return;
    const reference = resolution.reference, previous = reference.persistentId;
    reference.previousPersistentIds = Array.from(new Set([...(reference.previousPersistentIds || []), previous]));
    reference.persistentId = resolution.topology.persistentId;
    reference.ownerFeatureId = resolution.topology.ownerFeatureId;
    reference.semantic = resolution.topology.semantic;
    reference.descriptor = clone(resolution.topology.descriptor);
    reference.signature = resolution.topology.signature;
    applied.push({ from: previous, to: reference.persistentId, reason: resolution.reason || "rebound" });
  });
  return applied;
}

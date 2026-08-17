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

export function createTopologyReference(ownerFeatureId, kind, persistentId, descriptor = {}) {
  return {
    type: "topology-reference",
    ownerFeatureId,
    kind,
    persistentId,
    semantic: descriptor.semantic,
    descriptor: clone(descriptor),
    signature: topologyDescriptorSignature(descriptor),
  };
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

function inheritedTopology(feature, inputs) {
  const output = [];
  inputs.forEach((input) => (input?.topology || []).forEach((item) => output.push({
    ...clone(item), inheritedBy: feature.id, sourcePersistentId: item.sourcePersistentId || item.persistentId,
  })));
  return output;
}

function consumedTopologyIds(feature, params) {
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
    const inherited = inheritedTopology(feature, inputs), consumed = consumedTopologyIds(feature, params);
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

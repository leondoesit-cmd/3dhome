import { cylinderAxis } from "./cylinder_axis.js";
// Persistent topology naming for the canonical rebuild pipeline.
//
// A reference never stores an explorer index ("edge 7").  It stores the
// producing feature, a semantic persistent id and a geometric descriptor.  A
// rebuild first tries the id, then the semantic role, then the descriptor.  A
// close but non-exact descriptor match is reported as a rebind; ambiguous or
// missing matches are hard failures for the consuming feature.

import { frameDirection, framePoint } from "./frame.js";
import { ribLoop } from "./rib_profile.js";

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
    /* Not cloned. Every caller below builds this descriptor as a fresh literal
       and keeps no reference to it, and descriptors are read-only everywhere
       downstream — there is no `entry.descriptor.<field> = ...` anywhere in the
       codebase, and the two places that replace a descriptor swap the whole
       object rather than editing one. Cloning it was 32 structuredClone calls
       per rebuild of a two-feature document, for a mutation that never happens.
       `tests/topology_descriptor_immutability.test.mjs` fails if that stops
       being true. */
    descriptor,
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
  const axis = cylinderAxis(axisName);
  const base = point(x, y, z), top = point(x + axis.x * height, y + axis.y * height, z + axis.z * height);
  const middle = point((base.x + top.x) / 2, (base.y + top.y) / 2, (base.z + top.z) / 2);
  return [
    topologyItem(feature, "face", "side", {
      surface: "cylinder", semantic: "side", origin: middle, axis, radius,
      measure: 2 * Math.PI * radius * height,
      along: { min: -height / 2, max: height / 2 },
    }),
    topologyItem(feature, "face", "bottom", { surface: "plane", semantic: "bottom", origin: base, normal: vector(-axis.x, -axis.y, -axis.z), measure: Math.PI * radius * radius }),
    topologyItem(feature, "face", "top", { surface: "plane", semantic: "top", origin: top, normal: axis, measure: Math.PI * radius * radius }),
    topologyItem(feature, "edge", "bottom-rim", { curve: "circle", semantic: "bottom-rim", origin: base, axis, measure: 2 * Math.PI * radius, radius }),
    topologyItem(feature, "edge", "top-rim", { curve: "circle", semantic: "top-rim", origin: top, axis, measure: 2 * Math.PI * radius, radius }),
    topologyItem(feature, "axis", "center", { curve: "line", semantic: "center", origin: middle, axis, measure: height }),
  ];
}

function sphereTopology(feature, params = {}) {
  const x = Number(params.x) || 0, y = Number(params.y) || 0, z = Number(params.z) || 0;
  const radius = Math.max(0, Number(params.r ?? params.radius) || 0);
  const center = point(x, y, z);
  return [
    topologyItem(feature, "face", "surface", {
      surface: "sphere", semantic: "surface", origin: center, center, radius,
      measure: 4 * Math.PI * radius * radius,
    }),
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
     between them is not an edge at all — only a real corner is.
     Sketch circles are sampled at 16 points (22.5°). That has to count as
     smooth — 17° was tight enough that a drawn circle extruded as a barrel. */
  const TANGENT = 0.42;   // rad ≈ 24°, above a 16-gon chord and below a 30° corner
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

  /* How much of its circle a merged run actually covers. Axis and radius alone
     do not describe a face: a gear's tooth flank fits a circle of radius 120
     whose five-percent band is wider than the tooth, so every consumer that
     matched on radius alone painted — and picked — geometry all the way round
     the body. The angles use the same basis as every other arc in this file. */
  const runArc = (loop, fit, closed) => {
    const axis = mapVector(0, 0, direction), origin = mapPoint(fit.u, fit.v, middle);
    const basis = basisFromAxis(axis);
    const angles = loop.map((p) => angleAround(mapPoint(p.u, p.v, middle), origin, basis));
    if (angles.length < 2) return null;
    const TAU = Math.PI * 2;
    let walked = 0, low = 0, high = 0;
    for (let i = 1; i < angles.length; i++) {
      let step = angles[i] - angles[i - 1];
      while (step <= -Math.PI) step += TAU;
      while (step > Math.PI) step -= TAU;
      walked += step;
      low = Math.min(low, walked); high = Math.max(high, walked);
    }
    const sweep = closed ? TAU : high - low;
    if (!(sweep > 1e-9)) return null;
    return { start: angles[0] + low, sweep, step: sweep / (angles.length - 1), closed };
  };

  runs.forEach((run) => {
    const token = tokenAt(run[0]);
    const first = segments[run[0]], last = segments[run[run.length - 1]];
    const arcLength = run.reduce((sum, index) => sum + segments[index].measure, 0);
    const loop = run.map((index) => segments[index].a).concat(run.length === count ? [] : [last.b]);
    const mid = segments[run[(run.length - 1) >> 1]];
    const outward = (s) => mapVector(sign * s.uy, -sign * s.ux, 0);
    const sideSemantic = "side:" + token, fit = run.length > 1 ? fitCircle(loop) : null;
    const arcOfRun = fit ? runArc(loop, fit, run.length === count) : null;
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
      }, fit ? Object.assign({
        axis:mapVector(0, 0, direction), radius:fit.radius,
        along:{ min: -absoluteDepth / 2, max: absoluteDepth / 2 },
      }, arcOfRun ? { arc:arcOfRun } : {}) : {})));
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

/* The wall a hole or a pocket leaves behind.
   Extrusion topology names the outer profile only, so an inner loop had no face
   at all: picking inside a bore resolved nothing and the viewport fell back to
   a plane through whichever facet the ray hit — one stave lit up where the user
   had picked a round face. Running the same profile-run merge over the cut loop
   gives the bore its own cylindrical (or, for a rectangular pocket, planar)
   faces. The caps are dropped: a through hole has none, and a blind one gets
   its floor from the body it was cut into. */
export function cutWallTopology(feature, params = {}) {
  if (!feature?.id) return [];
  const tag = params.tag != null ? String(params.tag) : "0";
  return extrusionTopology(feature, params)
    .filter((entry) => entry.kind === "face" && String(entry.semantic || "").startsWith("side:"))
    .map((entry, index) => {
      const semantic = "hole:" + tag + ":wall:" + index;
      return {
        ...entry,
        persistentId: feature.id + ":face:" + semantic,
        semantic,
        descriptor: { ...entry.descriptor, semantic },
        signature: topologyDescriptorSignature({ ...entry.descriptor, semantic }),
      };
    });
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
  const tol = Math.max(1e-5, faceSpan * 1e-6, Math.abs(Number(ed.measure) || 0) * 1e-6);
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
  let resolved = (face?.persistentId && source.byPersistentId.get(face.persistentId));
  if (!resolved && face) {
    const rebound = resolveTopologyReference(face, source, { threshold: 1.25, ambiguityTolerance: 0.08 });
    if (rebound.status === "exact" || rebound.status === "rebound") resolved = rebound.topology;
    else resolved = face;
  }
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
      // Kernel and mesh aliases can both describe the same complete rim.
      // Their combined coverage cannot exceed one circumference.
      measure: Math.min(2 * Math.PI * Math.abs(Number(group[0].descriptor.radius)), group.reduce((sum, item) => sum + (Number(item.descriptor.measure) || 0), 0)),
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
  const endpointAt = (index, end) => lines[index].descriptor.endpoints[end];
  const direction = (from, to) => {
    const size = distance(from, to) || 1;
    return vector((to.x - from.x) / size, (to.y - from.y) / size, (to.z - from.z) / size);
  };
  /* Follow the curve, do not just follow the points. Where an arc ends, its last
     chord meets a straight side and a wall seam on the same vertex; taking
     whichever edge was stored first walked the chain off the rim and left the
     whole arc unfitted, one rib per chord. A chord only continues a chord when
     the direction barely changes. */
  const MAX_TURN = 40 * Math.PI / 180;
  const bestContinuation = (key, incoming, chord) => {
    let best = null;
    (at.get(key) || []).forEach((item) => {
      if (used.has(item.index)) return;
      const from = endpointAt(item.index, item.end), to = endpointAt(item.index, 1 - item.end);
      /* A slot's straight side leaves its cap exactly tangent, so direction
         alone would swallow a 15 cm edge into a fan of 7 mm chords and then fit
         no circle at all. Tessellation chords are all about the same length;
         a real edge next door is not. */
      const size = distance(from, to);
      if (!(size > 0) || size > chord * 3 || size * 3 < chord) return;
      const turn = Math.acos(Math.max(-1, Math.min(1, dotRaw(incoming, direction(from, to)))));
      if (turn > MAX_TURN) return;
      if (!best || turn < best.turn) best = { item, turn, to, size };
    });
    return best;
  };
  lines.forEach((edge, startIndex) => {
    if (used.has(startIndex)) return;
    const run = [startIndex];
    used.add(startIndex);
    let head = endpointKey(edge.descriptor.endpoints[0]), tail = endpointKey(edge.descriptor.endpoints[1]);
    let headOut = direction(edge.descriptor.endpoints[1], edge.descriptor.endpoints[0]);
    let tailOut = direction(edge.descriptor.endpoints[0], edge.descriptor.endpoints[1]);
    let headChord = distance(edge.descriptor.endpoints[0], edge.descriptor.endpoints[1]);
    let tailChord = headChord;
    let grew = true;
    while (grew) {
      grew = false;
      for (const side of [{ key: head, at: "head" }, { key: tail, at: "tail" }]) {
        const atHead = side.at === "head";
        const next = bestContinuation(side.key, atHead ? headOut : tailOut, atHead ? headChord : tailChord);
        if (!next) continue;
        used.add(next.item.index);
        const from = endpointAt(next.item.index, next.item.end);
        if (atHead) { run.unshift(next.item.index); head = endpointKey(next.to); headOut = direction(from, next.to); headChord = next.size; }
        else { run.push(next.item.index); tail = endpointKey(next.to); tailOut = direction(from, next.to); tailChord = next.size; }
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
    /* "Nearly closed" has to mean one chord short of closing. Comparing the gap
       with itself, as this once did, called every open arc a full circle and
       drew a whole ring where half of one existed. */
    let chordSum = 0;
    for (let i = 1; i < points.length; i++) chordSum += distance(points[i - 1], points[i]);
    const chord = chordSum / Math.max(1, points.length - 1);
    const nearlyClosed = !closed && run.length >= 6 && first && last
      && distance(first, last) <= Math.max(0.35, chord * 1.5);
    /* Coarse tessellation puts a 30° "corner" on every chord of a real circle.
       Fit the loop first; angle is only a hint, not a veto. */
    const fit = ((closed || nearlyClosed) && run.length >= 6) ? soundLoopFit(points) : null;
    /* An arc that never closes is still one edge. The rim of a slot cap or a
       fillet arrives as a fan of chords, and leaving them apart is what makes a
       round cut pick one short rib at a time instead of the whole curve. */
    const arc = !fit && !closed && run.length >= 4 ? soundArcFit(points) : null;
    if (fit || arc) {
      const members = run.map((index) => lines[index]);
      const shape = fit || arc;
      merged.push(mergedTopologyItem(members[0], members, "edge", {
        curve: "circle", semantic: members[0].semantic, origin: shape.origin, axis: shape.axis,
        radius: shape.radius,
        measure: fit ? 2 * Math.PI * fit.radius : arc.measure,
        ...(fit ? {} : { endpoints: [points[0], points[points.length - 1]] }),
      }));
    } else {
      run.forEach((index) => leftover.push(lines[index]));
    }
  });
  return merged.concat(leftover);
}

/* fitCircle rejects a fit whose worst point is off by more than two percent OF
   THE RADIUS IT INVENTED, so a chain that barely curves buys itself both a huge
   radius and, with it, a huge licence: a gear rim closed a loop and came back a
   circle. Judge a closed chain the way soundArcFit judges an open one — against
   the chords it is actually made of, which is a scale the data owns. */
function soundLoopFit(points) {
  const fit = fitCircle3(points);
  if (!fit) return null;
  let chain = distance(points[points.length - 1], points[0]);
  for (let i = 1; i < points.length; i++) chain += distance(points[i - 1], points[i]);
  const chord = chain / points.length;
  const basis = basisFromAxis(fit.axis);
  let worst = 0;
  for (const p of points) worst = Math.max(worst, Math.abs(length(radialFromAxis(p, fit.origin, basis.n)) - fit.radius));
  return worst <= Math.max(0.02, chord * 0.06) ? fit : null;
}

/* A chord fan is an arc only when every point really sits on the circle it
   claims and the chain actually turns. Both tests are scale-free: an "is the
   radius bigger than the chain" rule reads as true for any fan under about 60
   degrees, which is most of the arcs worth merging. */
function soundArcFit(points) {
  const fit = fitCircle3(points);
  if (!fit) return null;
  let chain = 0;
  for (let i = 1; i < points.length; i++) chain += distance(points[i - 1], points[i]);
  const chord = chain / Math.max(1, points.length - 1);
  if (!(fit.radius > 1e-6)) return null;
  const basis = basisFromAxis(fit.axis);
  let worst = 0;
  for (const p of points) worst = Math.max(worst, Math.abs(length(radialFromAxis(p, fit.origin, basis.n)) - fit.radius));
  if (worst > Math.max(0.02, chord * 0.06)) return null;
  const TAU = Math.PI * 2;
  const startAngle = angleAround(points[0], fit.origin, basis);
  let sweep = angleAround(points[points.length - 1], fit.origin, basis) - startAngle;
  while (sweep <= -Math.PI) sweep += TAU;
  while (sweep > Math.PI) sweep -= TAU;
  // the chords run one way round; a sweep that disagrees with their length is
  // the long way round the same circle
  if (Math.abs(Math.abs(sweep) * fit.radius - chain) > Math.abs((TAU - Math.abs(sweep)) * fit.radius - chain)) {
    sweep = sweep >= 0 ? sweep - TAU : sweep + TAU;
  }
  const measure = Math.abs(sweep) * fit.radius;
  if (Math.abs(sweep) < 0.3 || Math.abs(measure - chain) > Math.max(0.05, chain * 0.08)) return null;
  return { origin: fit.origin, axis: fit.axis, radius: fit.radius, measure };
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
  /* Which side of each facet the axis sits on. A boss turns its facets away
     from the axis; a bore turns them toward it, and assuming the boss case put
     the axis of every hole wall on the far side of the material — so no other
     stave matched, nothing merged, and a cut came back one facet at a time. */
  const side = dotRaw(dc, dn) >= 0 ? 1 : -1;
  const origin = point(c1.x - side * n1.x * radius, c1.y - side * n1.y * radius, c1.z - side * n1.z * radius);
  return { axis, origin, radius, side };
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
  const origin = point(origin0.x + u.x * fit.u + v.x * fit.v, origin0.y + u.y * fit.u + v.y * fit.v, origin0.z + u.z * fit.u + v.z * fit.v);
  // Do the facets look outward from this axis (a boss) or inward (a bore)?
  let outward = 0;
  faces.forEach((face) => {
    const radial = radialFromAxis(face.descriptor.origin, origin, axis);
    outward += dotRaw(radial, normalized(face.descriptor.normal)) >= 0 ? 1 : -1;
  });
  return { origin, axis, radius: fit.radius, side: outward >= 0 ? 1 : -1 };
}

/* The part of `point` - `origin` that is perpendicular to `axis`. */
function radialFromAxis(pointOn, origin, axis) {
  const radial = vector((pointOn?.x || 0) - origin.x, (pointOn?.y || 0) - origin.y, (pointOn?.z || 0) - origin.z);
  const along = dotRaw(radial, axis);
  return vector(radial.x - axis.x * along, radial.y - axis.y * along, radial.z - axis.z * along);
}

/* A repeatable (u, v) pair across an axis, so an angle measured here means the
   same thing wherever it is measured again. */
function basisFromAxis(axis) {
  const n = normalized(axis || vector(0, 1, 0));
  const seed = Math.abs(n.y) < 0.9 ? vector(0, 1, 0) : vector(1, 0, 0);
  const u = normalized(cross(n, seed));
  return { n, u, v: normalized(cross(n, u)) };
}

function angleAround(pointOn, origin, basis) {
  const radial = radialFromAxis(pointOn, origin, basis.n);
  return Math.atan2(dotRaw(radial, basis.v), dotRaw(radial, basis.u));
}

/* Is this point inside the turn the face actually covers? Every consumer that
   asked only "is it at this radius from this axis" answered yes all the way
   round the body — which is how hovering one gear tooth lit five of them and a
   swathe of empty space besides. A descriptor with no arc is a whole turn, as
   it always was. `slack` is in radians and defaults to half a facet. */
export function pointWithinCylinderArc(pointOn, descriptor = {}, slack) {
  const arc = descriptor.arc;
  if (!arc || arc.closed || !finite(Number(arc.sweep)) || !finite(Number(arc.start))) return true;
  const sweep = Math.abs(Number(arc.sweep));
  const TAU = Math.PI * 2;
  if (!(sweep > 1e-9) || sweep >= TAU - 1e-9) return true;
  const origin = descriptor.origin || descriptor.center, axis = descriptor.axis;
  if (!origin || !axis || !pointOn) return true;
  const give = finite(Number(slack)) ? Math.abs(Number(slack))
    : finite(Number(arc.step)) ? Math.abs(Number(arc.step)) / 2 : 0;
  let delta = (angleAround(pointOn, origin, basisFromAxis(axis)) - Number(arc.start)) % TAU;
  if (delta < 0) delta += TAU;
  // just short of the start is on the face, not almost all the way round it
  if (delta > sweep + give) delta -= TAU;
  return delta >= -give && delta <= sweep + give;
}

/* Where a merged wall starts and stops turning, and how much of it is really
   one tessellated surface. The facet midpoints of a wall sit at an even pitch
   around its axis, so: the biggest gap between them is the turn the wall does
   not cover, and the longest row of facets at that even pitch is the evidence
   that they belong together at all. Without that evidence any few
   almost-parallel faces fit some enormous circle — which is how a slot's flat
   side and four staves off two different caps once became one wall of radius
   59. A row can still be interrupted, as it is where a boss clips a slot cap
   short, so the test is the longest row, not every gap. */
function arcSpanOfAngles(angles) {
  const sorted = angles.slice().sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const TAU = Math.PI * 2;
  const gaps = [sorted[0] + TAU - sorted[sorted.length - 1]];
  let gapAt = 0, gap = gaps[0];
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i] - sorted[i - 1];
    gaps.push(delta);
    if (delta > gap) { gap = delta; gapAt = i; }
  }
  const spread = gaps.slice().sort((a, b) => a - b);
  const closed = gap <= spread[spread.length >> 1] * 1.6;
  const steps = (closed ? gaps : gaps.filter((value, index) => index !== gapAt)).slice().sort((a, b) => a - b);
  if (!steps.length) return null;
  const step = steps[steps.length >> 1];
  if (!(step > 1e-9)) return null;
  let run = 1, longest = 1;
  gaps.forEach((value, index) => {
    if (!closed && index === gapAt) { run = 1; return; }
    if (value <= step * 2.2) { run++; longest = Math.max(longest, run); } else run = 1;
  });
  return { start: sorted[gapAt % sorted.length], sweep: closed ? TAU : TAU - gap, step, closed, run: longest };
}

function projectAlong(point, origin, axis) {
  return ((point?.x || 0) - origin.x) * axis.x
    + ((point?.y || 0) - origin.y) * axis.y
    + ((point?.z || 0) - origin.z) * axis.z;
}

function cylinderHeight(face, radius) {
  const d = face?.descriptor || {};
  const measure = Number(d.measure), r = Math.abs(Number(d.radius) || radius) || 0;
  if (d.surface === "cylinder" && r > 1e-9 && finite(measure) && measure > 0) return measure / (2 * Math.PI * r);
  return 0;
}

function axialSpanOfFaces(faces, origin, axis, radius) {
  let min = Infinity, max = -Infinity;
  (faces || []).forEach((face) => {
    const d = face?.descriptor || {};
    const p = d.origin || d.center || d.centroid;
    const bounds = d.bounds;
    if (bounds?.min && bounds?.max
      && [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(finite)) {
      /* Kernel planar staves carry an exact world-space AABB even when their
         descriptor has no endpoints. Project its extreme corner in each axis
         direction to recover the real cylinder height. */
      const low = {
        x: axis.x >= 0 ? bounds.min.x : bounds.max.x,
        y: axis.y >= 0 ? bounds.min.y : bounds.max.y,
        z: axis.z >= 0 ? bounds.min.z : bounds.max.z,
      };
      const high = {
        x: axis.x >= 0 ? bounds.max.x : bounds.min.x,
        y: axis.y >= 0 ? bounds.max.y : bounds.min.y,
        z: axis.z >= 0 ? bounds.max.z : bounds.min.z,
      };
      min = Math.min(min, projectAlong(low, origin, axis));
      max = Math.max(max, projectAlong(high, origin, axis));
    }
    if (d.along && finite(Number(d.along.min)) && finite(Number(d.along.max))) {
      const t0 = p ? projectAlong(p, origin, axis) : 0;
      min = Math.min(min, t0 + Number(d.along.min));
      max = Math.max(max, t0 + Number(d.along.max));
      return;
    }
    if (!p) return;
    const mid = projectAlong(p, origin, axis);
    const half = cylinderHeight(face, radius) / 2;
    min = Math.min(min, mid - half);
    max = Math.max(max, mid + half);
    (d.endpoints || []).forEach((point) => {
      const along = projectAlong(point, origin, axis);
      min = Math.min(min, along);
      max = Math.max(max, along);
    });
  });
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

function axialSpansOverlap(a, b, gap) {
  return a.max + gap >= b.min && b.max + gap >= a.min;
}

function cylinderSweep(descriptor = {}) {
  const sweep = Math.abs(Number(descriptor.arc?.sweep));
  return finite(sweep) && sweep > 1e-9 ? Math.min(Math.PI * 2, sweep) : Math.PI * 2;
}

function cylinderSpanFromDescriptor(descriptor = {}, radius = Number(descriptor.radius)) {
  if (descriptor.along && finite(Number(descriptor.along.min)) && finite(Number(descriptor.along.max))) {
    return { min: Number(descriptor.along.min), max: Number(descriptor.along.max) };
  }
  const measure = Number(descriptor.measure), r = Math.abs(Number(radius));
  if (!finite(measure) || measure <= 0 || !finite(r) || r <= 1e-9) return null;
  const height = measure / (r * cylinderSweep(descriptor));
  return finite(height) && height > 0 ? { min: -height / 2, max: height / 2 } : null;
}

function planeMatchesCylinder(face, cylinder) {
  const d = face.descriptor || {}, origin = d.origin, normal = d.normal;
  if (!origin || !normal || Math.abs(dot(normal, cylinder.axis)) > 0.25) return false;
  const radial = radialFromAxis(origin, cylinder.origin, cylinder.axis);
  /* A 16-gon stave's midpoint sits at r·cos(π/16) ≈ 0.981 r. The old 2 mm
     floor rejected every small drawn circle; a 4 % band still keeps a slot
     wall from joining a neighbouring bore. */
  if (Math.abs(length(radial) - cylinder.radius) > Math.max(0.05, cylinder.radius * 0.04)) return false;
  /* A facet of a cylinder faces straight out of it. Without this the tolerance
     alone lets a huge invented radius sweep up half a body: at r = 90 even a
     two-percent band is nearly two centimetres wide. */
  const facing = dotRaw(normalized(radial), normalized(normal));
  if (Math.abs(facing) < 0.985) return false;
  /* Same radius is not the same wall: a bore drilled down the middle of a boss
     shares its axis, and a facet that faces the axis never belongs to the one
     that faces away from it. */
  return finite(cylinder.side) ? facing * cylinder.side > 0 : true;
}

/* Do two stretches of one cylinder actually touch, or are they separate lands
   that merely share a radius? The axial rule below asks this of a stepped
   shaft; this asks it round the circumference, for the twenty root fillets of
   a gear — same axis, same radius, same height, and twenty separate faces.
   Faces that do not say what arc they cover fall back to the old answer. */
function arcSpansTouch(a, b) {
  if (!a || !b || a.closed || b.closed) return true;
  if (!finite(Number(a.sweep)) || !finite(Number(b.sweep))) return true;
  const TAU = Math.PI * 2;
  const give = Math.max(Number(a.step) || 0, Number(b.step) || 0) * 1.5;
  let delta = (Number(b.start) - Number(a.start)) % TAU;
  if (delta < 0) delta += TAU;
  return delta <= Number(a.sweep) + give || TAU - delta <= Number(b.sweep) + give;
}

/* One span out of several, when a wall was assembled from runs that each know
   the arc they cover. Anything with a real gap in it — or that wraps past the
   seam where angles change sign — declines to answer, and the wall keeps the
   whole turn it had before. */
function unionArcSpans(arcs) {
  if (!arcs.length) return null;
  const TAU = Math.PI * 2;
  const sorted = arcs.slice().sort((a, b) => Number(a.start) - Number(b.start));
  let start = Number(sorted[0].start), end = start + Math.abs(Number(sorted[0].sweep));
  let step = Math.abs(Number(sorted[0].step)) || 0;
  if (!finite(start) || !finite(end)) return null;
  for (let i = 1; i < sorted.length; i++) {
    const from = Number(sorted[i].start), to = from + Math.abs(Number(sorted[i].sweep));
    if (!finite(from) || !finite(to)) return null;
    step = Math.max(step, Math.abs(Number(sorted[i].step)) || 0);
    if (from > end + step * 1.5) return null;
    end = Math.max(end, to);
  }
  const sweep = end - start;
  if (!(sweep > 1e-9)) return null;
  return sweep >= TAU - step * 1.5
    ? { start, sweep: TAU, step, closed: true } : { start, sweep, step, closed: false };
}

function mergeCylindricalFaces(faces) {
  const planes = [], cylinders = [], leftover = [];
  faces.forEach((face) => {
    const surface = face.descriptor?.surface;
    if (surface === "cylinder" && finite(Number(face.descriptor.radius))) cylinders.push(face);
    else if (surface === "plane" && face.descriptor?.normal && face.descriptor?.origin) planes.push(face);
    else leftover.push(face);
  });
  /* One wall per surface, however many faces the kernel cut it into. A slot cap
     that a boss clips in the middle arrives as two groups of staves either side
     of the boss wall; they are one cylinder and have to pick as one. */
  const walls = [];
  const sameWall = (wall, fit, span) => {
    if (Math.abs(dot(wall.fit.axis, fit.axis)) <= 0.999) return false;
    if (Math.abs(wall.fit.radius - fit.radius) > Math.max(0.15, fit.radius * 0.03)) return false;
    if (length(radialFromAxis(fit.origin, wall.fit.origin, wall.fit.axis)) > Math.max(0.15, fit.radius * 0.03)) return false;
    if (finite(wall.fit.side) && finite(fit.side) && wall.fit.side !== fit.side) return false;
    /* Same axis and radius is not the same land: a stepped shaft has two
       cylindrical faces that would otherwise collapse into one pick. Overlap
       (or a hairline touch) along the axis is what says they are one wall. */
    const gap = Math.max(0.5, fit.radius * 0.08);
    return axialSpansOverlap(wall.along, span, gap);
  };
  const addWall = (fit, members, angles) => {
    const span = axialSpanOfFaces(members, fit.origin, fit.axis, fit.radius);
    const arcs = members.map((face) => face.descriptor?.arc).filter(Boolean);
    /* Joining ANY stretch of the wall joins the wall: a circle drawn as four
       arc entities arrives as four runs, and the fourth touches only the third. */
    const joins = (entry) => !arcs.length || !entry.arcs.length
      || arcs.some((arc) => entry.arcs.some((other) => arcSpansTouch(other, arc)));
    const wall = walls.find((entry) => sameWall(entry, fit, axialSpanOfFaces(members, entry.fit.origin, entry.fit.axis, fit.radius)) && joins(entry));
    if (!wall) { walls.push({ fit, members: members.slice(), angles: angles ? angles.slice() : [], arcs, along: span }); return; }
    wall.members.push(...members);
    wall.arcs.push(...arcs);
    if (angles) wall.angles.push(...angles);
    const union = axialSpanOfFaces(wall.members, wall.fit.origin, wall.fit.axis, wall.fit.radius);
    wall.along = union;
  };

  cylinders.forEach((face) => {
    const d = face.descriptor;
    const axis = normalized(d.axis || vector(0, 1, 0));
    const origin = d.origin || d.center || point();
    const radius = Math.abs(Number(d.radius));
    /* A bore and the boss around it can share an axis and a radius; the face
       normal against the radius says which of the two this is. */
    const side = d.centroid && d.normal
      ? (dotRaw(radialFromAxis(d.centroid, origin, axis), normalized(d.normal)) >= 0 ? 1 : -1)
      : undefined;
    addWall({ origin, axis, radius, side }, [face], null);
  });

  /* Which staves belong to one wall is decided by the best cylinder any pair of
     them proposes, not by whichever partner happens to come first. A slot has
     two caps of the same radius on the same axis, and pairing a facet of one
     with a facet of the other produces a fit that describes neither: taking the
     first fit that parsed left both caps in pieces. */
  const remaining = planes.slice();
  const CHEAP = 120;   // beyond this a part is a mesh import, not a modelled body
  while (remaining.length >= 4) {
    const seed = remaining.pop();
    let best = null;
    /* The partner that describes a stave best is the stave beside it, so try the
       closest normals first and stop there. Scanning every pair instead turned a
       hover over a cut body into tens of milliseconds of arithmetic. */
    const seedNormal = normalized(seed.descriptor.normal);
    const partners = remaining
      .map((face, index) => ({ index, alignment: Math.abs(dot(seedNormal, face.descriptor.normal)) }))
      .filter((entry) => entry.alignment >= 0.85 && entry.alignment <= 0.999)
      .sort((left, right) => right.alignment - left.alignment)
      .slice(0, 6);
    for (const partner of partners) {
      const fit = cylinderFromTwoPlanes(seed, remaining[partner.index]);
      if (!fit) continue;
      const gap = Math.max(0.5, fit.radius * 0.08);
      const pool = remaining.filter((face) => planeMatchesCylinder(face, fit));
      const members = [];
      let span = axialSpanOfFaces([seed], fit.origin, fit.axis, fit.radius);
      let grew = true;
      while (grew) {
        grew = false;
        for (const face of pool) {
          if (members.includes(face)) continue;
          const faceSpan = axialSpanOfFaces([face], fit.origin, fit.axis, fit.radius);
          if (!axialSpansOverlap(span, faceSpan, gap)) continue;
          members.push(face);
          span = { min: Math.min(span.min, faceSpan.min), max: Math.max(span.max, faceSpan.max) };
          grew = true;
        }
      }
      /* Most facets wins, and a tie goes to the tighter wall: the smaller radius
         is the one that explains the same staves without inventing room. */
      if (!best || members.length > best.members.length
        || (members.length === best.members.length && fit.radius < best.fit.radius)) best = { fit, members };
      if (best.members.length === remaining.length || (remaining.length > CHEAP && best.members.length >= 3)) break;
    }
    const cluster = best ? [seed].concat(best.members) : [seed];
    const fit = best && cluster.length >= 4 ? fitCylinderFromPlanes(cluster) || best.fit : null;
    const basis = fit ? basisFromAxis(fit.axis) : null;
    const angles = fit ? cluster.map((item) => angleAround(item.descriptor.origin, fit.origin, basis)) : null;
    const arc = angles ? arcSpanOfAngles(angles) : null;
    // four facets in a row at one pitch, and a wall that actually turns
    if (fit && arc && arc.run >= 4 && (arc.closed || arc.sweep >= 0.2)) {
      const kept = new Set(best.members);
      for (let i = remaining.length - 1; i >= 0; i--) if (kept.has(remaining[i])) remaining.splice(i, 1);
      addWall(fit, cluster, angles);
    } else leftover.push(seed);
  }

  const merged = [];
  walls.forEach((wall) => {
    if (wall.members.length === 1 && !wall.angles.length) { merged.push(wall.members[0]); return; }
    /* Only a wall made entirely of facets can say where its facet seams are; one
       that also holds a real cylindrical face has no seams to hide. */
    const arc = wall.angles.length === wall.members.length && wall.angles.length >= 2
      ? arcSpanOfAngles(wall.angles)
      : wall.arcs.length === wall.members.length ? unionArcSpans(wall.arcs) : null;
    const measure = wall.members.reduce((sum, item) => sum + (Number(item.descriptor.measure) || 0), 0);
    /* Facet topology usually stores only each stave's centre and area. Its raw
       axial span is therefore a zero-width point at mid-height. Recover the
       actual height from lateral area / arc length before publishing `along`,
       otherwise the viewport clips a whole-cylinder highlight to a thin ring. */
    const rawAlong = wall.along;
    const along = rawAlong && rawAlong.max - rawAlong.min > 1e-6
      ? rawAlong
      : cylinderSpanFromDescriptor({ measure, ...(arc ? { arc } : {}) }, wall.fit.radius);
    merged.push(mergedTopologyItem(wall.members[0], wall.members, "face", {
      surface: "cylinder", semantic: wall.members[0].semantic,
      origin: wall.fit.origin, axis: wall.fit.axis, radius: wall.fit.radius,
      measure,
      ...(along ? { along } : {}),
      ...(arc ? { arc } : {}),
    }));
  });
  leftover.push(...remaining);
  return merged.concat(leftover);
}

/* A tessellated cylinder can arrive as many planar side faces plus one straight
   edge between every pair of facets. Once those faces have been recognised as
   one cylindrical face, the vertical facet joins are no longer CAD edges:
   drawing or picking them makes a round cut behave like a polygon.
   A partial wall — a slot cap, a fillet — still has two real generatrices at its
   ends, so a seam only counts as one when the merged face turns past it on both
   sides. Analytic cylinders carry no arc span; for those the old whole-turn
   coverage test still decides. */
export function isCylinderTessellationSeam(edge, cylinders) {
  if (edge?.kind !== "edge") return false;
  const descriptor = edge.descriptor || {};
  if (descriptor.curve !== "line" && descriptor.curve !== "polyline") return false;
  const endpoints = lineEndpointsFromDescriptor(descriptor);
  if (endpoints.length < 2) return false;
  const first = endpoints[0], last = endpoints[endpoints.length - 1];
  return cylinders.some((face) => {
    const cylinder = face.descriptor || {}, axis = normalized(cylinder.axis || vector(0, 1, 0));
    const origin = cylinder.origin || cylinder.center, radius = Number(cylinder.radius);
    if (!origin || !finite(radius) || radius <= 0) return false;
    const dx = last.x - first.x, dy = last.y - first.y, dz = last.z - first.z;
    const height = Math.abs(dx * axis.x + dy * axis.y + dz * axis.z);
    const chord = Math.hypot(dx, dy, dz);
    if (height < 1e-6 || height / chord < 0.985) return false;
    const onWall = endpoints.every((point) => {
      const radial = vector(point.x - origin.x, point.y - origin.y, point.z - origin.z);
      const along = dotRaw(radial, axis);
      radial.x -= axis.x * along; radial.y -= axis.y * along; radial.z -= axis.z * along;
      return Math.abs(length(radial) - radius) <= Math.max(0.25, radius * 0.025);
    });
    if (!onWall) return false;
    /* Coaxial lands can share radius and orientation while being physically
       disconnected. A boundary on one land is never a tessellation seam of a
       different land, so both edge endpoints must lie inside this face's axial
       interval before its angular coverage is considered. */
    const alongSpan = cylinderSpanFromDescriptor(cylinder, radius);
    if (alongSpan) {
      const axialTolerance = Math.max(0.25, radius * 0.025);
      if (!endpoints.every((point) => {
        const along = projectAlong(point, origin, axis);
        return along >= alongSpan.min - axialTolerance && along <= alongSpan.max + axialTolerance;
      })) return false;
    }
    const arc = cylinder.arc;
    if (arc && finite(arc.step) && arc.step > 0) {
      if (arc.closed) return true;
      const basis = basisFromAxis(axis);
      const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2, z: (first.z + last.z) / 2 };
      const TAU = Math.PI * 2;
      let delta = (angleAround(mid, origin, basis) - arc.start) % TAU;
      if (delta < 0) delta += TAU;
      return delta > arc.step * 0.25 && delta < arc.sweep - arc.step * 0.25;
    }
    const coverage = Number(cylinder.measure) / (2 * Math.PI * radius * height);
    return finite(coverage) && coverage > 0.9 && coverage < 1.12;
  });
}

/* Tessellated circles and cylindrical walls reach the picker as many short
   chords / staves. Merging them is what lets a fillet consume a whole rim
   instead of one facet, and what lights the entire bore when a wall is picked. */
export function mergeSmoothTopology(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  const faces = mergeCylindricalFaces(list.filter((entry) => entry.kind === "face"));
  const cylinders = faces.filter((entry) => entry.descriptor?.surface === "cylinder");
  /* Drop the facet seams before chaining, not after. A seam ends on the same
     point as the two rim chords beside it, so leaving it in the pile made the
     chain walk up the wall mid-arc and no rim ever fitted a circle. */
  const edges = mergeLineEdgesIntoCircles(mergeCircleEdges(
    list.filter((entry) => entry.kind === "edge" && !isCylinderTessellationSeam(entry, cylinders))));
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
  visit(feature?.references);
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
    visitFaces(feature?.references);
  }
  return ids;
}

/* THE FACES THESE FOUR FEATURES CREATE.
 *
 * thicken, rib, splitBody and moveBody were inheritance-only: they consumed
 * names and made none. A fillet taken on a face one of them CREATED therefore
 * bound by extraction — geometry matched against the rebuilt solid — and lost
 * its grip the moment an upstream parameter moved. Naming the new faces is
 * what makes those references survive a rebuild.
 *
 * Each namer covers the case it can state exactly and returns nothing for the
 * case it cannot, because a named face with the wrong descriptor mis-binds and
 * is worse than an unnamed one. The two gaps are called out where they are. */
function splitTopology(feature, params = {}, inherited = []) {
  const axisName = params.axis === "x" ? "x" : params.axis === "z" ? "z" : "y";
  const offset = Number(params.offset) || 0, keep = params.keep || "both";
  // The plane is stated by an axis and a coordinate; the two coordinates it
  // does not fix come from where the body already is.
  const origins = inherited.map((item) => item.descriptor?.origin || item.descriptor?.center).filter(Boolean);
  if (!origins.length) return [];
  const mean = (key) => origins.reduce((sum, q) => sum + (Number(q[key]) || 0), 0) / origins.length;
  const at = { x: mean("x"), y: mean("y"), z: mean("z") };
  at[axisName] = offset;
  const normal = (sign) => vector(axisName === "x" ? sign : 0, axisName === "y" ? sign : 0, axisName === "z" ? sign : 0);
  const created = [];
  // The face on the piece ABOVE the plane looks back down it, and vice versa.
  if (keep !== "negative") created.push(topologyItem(feature, "face", "cut-positive", { surface: "plane", semantic: "cut-positive", origin: point(at.x, at.y, at.z), normal: normal(-1) }));
  if (keep !== "positive") created.push(topologyItem(feature, "face", "cut-negative", { surface: "plane", semantic: "cut-negative", origin: point(at.x, at.y, at.z), normal: normal(1) }));
  return created;
}

function thickenTopology(feature, params = {}) {
  // The offset twin of each selected face: same surface, same normal, pushed
  // by the thickness. The band around the rim is a face too, but its shape is
  // the face's boundary, which a descriptor does not carry — so it is left to
  // extraction rather than named wrongly.
  const thickness = Math.abs(Number(params.thickness) || 0);
  if (!(thickness > 1e-9)) return [];
  const pull = params.direction === "inside" ? -1 : 1;
  const seen = new Set(), created = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.kind === "face" && typeof value.persistentId === "string") {
      const descriptor = fallbackDescriptor(value);
      const origin = descriptor?.origin, normal = descriptor?.normal;
      if (!origin || !normal || seen.has(value.persistentId)) return;
      seen.add(value.persistentId);
      created.push(topologyItem(feature, "face", "offset:" + value.persistentId, {
        ...descriptor, semantic: "offset",
        origin: point((Number(origin.x) || 0) + (Number(normal.x) || 0) * thickness * pull,
          (Number(origin.y) || 0) + (Number(normal.y) || 0) * thickness * pull,
          (Number(origin.z) || 0) + (Number(normal.z) || 0) * thickness * pull),
      }));
      return;
    }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    Object.values(value).forEach(visit);
  };
  visit(params.targets); visit(params.topologyReferences); visit(feature.references);
  return created;
}

function ribTopology(feature, params = {}) {
  /* A rib's web is the open line offset into a closed loop and run along the
     sketch normal, which is exactly an extrusion — so the extrusion namer does
     the work and the two walls, the end and the cap all get the names an
     extruded profile gets. Only a BLIND rib: "up to the body" measures its
     depth against the solid it braces, a number this pure function does not
     have, and a wall named at the wrong depth would mis-bind. */
  const line = params.points || params.line || [];
  const thickness = Math.abs(Number(params.thickness) || 0);
  if (line.length < 2 || !(thickness > 1e-9) || params.extent !== "blind") return [];
  const depth = Math.abs(Number(params.depth) || 0);
  if (!(depth > 1e-9)) return [];
  const from = Number(params.from) || 0, run = params.direction === "reverse" ? -1 : 1;
  let loop;
  try { loop = ribLoop(line, thickness, params.side); }
  catch { return []; }
  if (!Array.isArray(loop) || loop.length < 3) return [];
  return extrusionTopology(feature, { axis: params.axis, frame: params.frame, from, to: from + run * depth, points: loop });
}

function movedTopology(feature, params = {}, inherited = [], inputs = []) {
  const dx=Number(params.dx)||0,dy=Number(params.dy)||0,dz=Number(params.dz)||0,angle=(Number(params.angle)||0)*Math.PI/180;
  let placement=params.placement;
  if(!placement){
    let pivot=params.pivot;
    const source=inputs[0],p=source?.params || {};
    if(!pivot && source?.type==='box')pivot={x:p.x0!=null?(p.x0+p.x1)/2:(Number(p.x)||0)+(Number(p.w ?? p.width)||0)/2,y:p.y0!=null?(p.y0+p.y1)/2:(Number(p.y)||0)+(Number(p.h ?? p.height)||0)/2,z:p.z0!=null?(p.z0+p.z1)/2:(Number(p.z)||0)+(Number(p.d ?? p.depth)||0)/2};
    // A complex body's pivot is a native volume property. Preserve identity,
    // but publish no stale geometry while waiting for native regeneration.
    if (angle && !pivot) {
      const pending = inherited.map(item => ({...item,
        persistentId: params.copy ? item.persistentId + ':copy:' + feature.id : item.persistentId,
        descriptor:{pendingTransform:true},signature:"pending-transform:"+item.persistentId}));
      return params.copy ? inherited.concat(pending) : pending;
    }
    pivot=pivot || {x:0,y:0,z:0};
    const c=Math.cos(angle),s=Math.sin(angle),m=params.axis==='x'?[1,0,0,0,c,-s,0,s,c]:params.axis==='z'?[c,-s,0,s,c,0,0,0,1]:[c,0,s,0,1,0,-s,0,c];
    placement={matrix:m,translation:{x:pivot.x+dx-(m[0]*pivot.x+m[1]*pivot.y+m[2]*pivot.z),y:pivot.y+dy-(m[3]*pivot.x+m[4]*pivot.y+m[5]*pivot.z),z:pivot.z+dz-(m[6]*pivot.x+m[7]*pivot.y+m[8]*pivot.z)}};
  }
  const m=placement.matrix,t=placement.translation;
  const rotate=p=>({x:m[0]*p.x+m[1]*p.y+m[2]*p.z,y:m[3]*p.x+m[4]*p.y+m[5]*p.z,z:m[6]*p.x+m[7]*p.y+m[8]*p.z});
  const move=p=>{const q=rotate(p);return{x:q.x+t.x,y:q.y+t.y,z:q.z+t.z};};
  const moved=inherited.map(item=>{
    const d=clone(item.descriptor || {});
    for(const key of ['origin','center'])if(d[key])d[key]=move(d[key]);
    for(const key of ['normal','axis','xAxis','yAxis','direction','tangent'])if(d[key])d[key]=rotate(d[key]);
    if(d.endpoints)d.endpoints=d.endpoints.map(move);
    if(d.bounds?.min && d.bounds?.max){const corners=[];for(const x of [d.bounds.min.x,d.bounds.max.x])for(const y of [d.bounds.min.y,d.bounds.max.y])for(const z of [d.bounds.min.z,d.bounds.max.z])corners.push(move({x,y,z}));d.bounds={min:Object.fromEntries(['x','y','z'].map(k=>[k,Math.min(...corners.map(p=>p[k]))])),max:Object.fromEntries(['x','y','z'].map(k=>[k,Math.max(...corners.map(p=>p[k]))]))};}
    return {...item,descriptor:d,signature:topologyDescriptorSignature(d)};
  });
  return params.copy ? inherited.concat(moved.map(item=>({...item,persistentId:item.persistentId+':copy:'+feature.id}))) : moved;
}

export function topologyForFeature(feature, params = {}, inputs = []) {
  if (!feature?.id) return [];
  if (["direct", "import"].includes(feature.type) && Array.isArray(params.topology)) {
    return params.topology.map((item) => ({ ...clone(item), ownerFeatureId:feature.id }));
  }
  if (feature.type === "box") return boxTopology(feature, params);
  if (feature.type === "cylinder") return cylinderTopology(feature, params);
  if (feature.type === "sphere") return sphereTopology(feature, params);
  if (feature.type === "extrude") return extrusionTopology(feature, params);
  if (feature.type === "procedural" && finite(Number(params.width)) && finite(Number(params.depth)) && finite(Number(params.height))) {
    return boxTopology(feature, { x0: -Number(params.width) / 2, x1: Number(params.width) / 2, y0: 0, y1: Number(params.height), z0: -Number(params.depth) / 2, z1: Number(params.depth) / 2 });
  }
  if (["cut", "fillet", "chamfer", "shell", "dome", "draft", "thicken", "rib", "splitBody", "moveBody", "union", "subtract", "intersect", "mirror", "linearPattern", "linearGridPattern", "circularPattern", "curvePattern", "pattern"].includes(feature.type)) {
    const inherited = inheritedTopology(feature, inputs), consumed = consumedTopologyIds(feature, params, inherited);
    const kept = consumed.size ? inherited.filter((item) => !consumed.has(item.persistentId)) : inherited;
    if (feature.type === "moveBody") return movedTopology(feature, params, kept, inputs);
    if (feature.type === "splitBody") return kept.concat(splitTopology(feature, params, kept));
    if (feature.type === "thicken") return kept.concat(thickenTopology(feature, params));
    if (feature.type === "rib") return kept.concat(ribTopology(feature, params));
    return kept;
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

function directionalSemantic(d) {
  if (!d) return null;
  const ax = Math.abs(d.x || 0), ay = Math.abs(d.y || 0), az = Math.abs(d.z || 0);
  if (ay >= ax && ay >= az) return (d.y || 0) >= 0 ? "top" : "bottom";
  if (ax >= az) return (d.x || 0) >= 0 ? "right" : "left";
  return (d.z || 0) >= 0 ? "front" : "back";
}

function descriptorScore(wanted, candidate) {
  const descriptor = candidate.descriptor || {};
  let score = 0;
  if ((wanted.surface || wanted.curve) && (wanted.surface || wanted.curve) !== (descriptor.surface || descriptor.curve)) score += 2;
  const wantedDir = wanted.normal || wanted.axis, candDir = descriptor.normal || descriptor.axis;
  const semanticMatch = wanted.semantic && (
    descriptor.semantic === wanted.semantic ||
    (descriptor.surface === "plane" && candDir && directionalSemantic(candDir) === wanted.semantic)
  );
  if (wanted.semantic && !semanticMatch) score += 0.35;
  const scale = Math.max(1, Math.sqrt(Math.abs(Number(wanted.measure) || Number(descriptor.measure) || 1)));
  const wo = wanted.origin || wanted.center, co = descriptor.origin || descriptor.center;
  if (wo && co) {
    if (descriptor.surface === "plane" && candDir) {
      const planeDist = Math.abs(dot(vector(wo.x - co.x, wo.y - co.y, wo.z - co.z), candDir));
      const totalDist = distance(wo, co);
      const inPlaneDist = Math.sqrt(Math.max(0, totalDist * totalDist - planeDist * planeDist));
      score += (planeDist * 1.5 + inPlaneDist * 0.15) / scale;
    } else {
      score += distance(wo, co) / scale;
    }
  }
  if (wantedDir && candDir) score += 1 - Math.abs(dot(wantedDir, candDir));
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

// Selection grammar over a solid's topology: loop, tangent chain, connected
// and invert — the operations a CAD user reaches for instead of clicking
// twelve edges one at a time.
//
// Everything here is descriptor math over the same topology entries the picker
// and the finish features already use, so it runs without a renderer and is
// testable on its own. The editor supplies the entries; nothing in this file
// knows about three.js, the viewport, or the current selection UI.

import { edgeLiesOnFace, edgesBoundingFace, createTopologyRegistry } from "./topology.js";

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const len = (v) => Math.hypot(v?.x || 0, v?.y || 0, v?.z || 0);
const unit = (v) => { const n = len(v) || 1; return vec((v?.x || 0) / n, (v?.y || 0) / n, (v?.z || 0) / n); };
const dot = (a, b) => (a?.x || 0) * (b?.x || 0) + (a?.y || 0) * (b?.y || 0) + (a?.z || 0) * (b?.z || 0);
const sub = (a, b) => vec((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0), (a?.z || 0) - (b?.z || 0));
const add = (a, b) => vec((a?.x || 0) + (b?.x || 0), (a?.y || 0) + (b?.y || 0), (a?.z || 0) + (b?.z || 0));
const scale = (v, k) => vec((v?.x || 0) * k, (v?.y || 0) * k, (v?.z || 0) * k);
const finite = (n) => Number.isFinite(Number(n));

/* Both ends of an edge in world space. A circle has no ends to chain through,
   which is why it reports none rather than a fabricated pair — a closed rim is
   already the whole chain. */
export function edgeEndpoints(edge) {
  const d = edge?.descriptor || {};
  if (Array.isArray(d.endpoints) && d.endpoints.length >= 2) return [d.endpoints[0], d.endpoints[d.endpoints.length - 1]];
  if (d.curve === "circle") return [];
  const origin = d.origin, axis = d.axis, measure = Number(d.measure);
  if (!origin || !axis || !finite(measure)) return [];
  const half = measure / (2 * (len(axis) || 1));
  return [sub(origin, scale(axis, half)), add(origin, scale(axis, half))];
}

/* Any vector at right angles to `axis`. Picking the smallest component to
   cross against keeps this stable for axes aligned to a basis direction, which
   is most of them in practice. */
function perpendicular(axis) {
  const a = unit(axis);
  const pick = Math.abs(a.x) <= Math.abs(a.y) && Math.abs(a.x) <= Math.abs(a.z) ? vec(1, 0, 0)
    : Math.abs(a.y) <= Math.abs(a.z) ? vec(0, 1, 0) : vec(0, 0, 1);
  const cross = vec(a.y * pick.z - a.z * pick.y, a.z * pick.x - a.x * pick.z, a.x * pick.y - a.y * pick.x);
  return len(cross) > 1e-9 ? unit(cross) : vec(1, 0, 0);
}

/* A point ON the edge, which is not the same as the middle of its descriptor.
   A circle's origin is its CENTRE — a point on the axis, where a cylinder has
   no radial direction and therefore no normal. Asking for tangency there
   silently answered "no" for every blend that meets along a circular edge. */
export function pointOnEdge(edge) {
  const d = edge?.descriptor || {};
  const ends = edgeEndpoints(edge);
  if (ends.length >= 2) return scale(add(ends[0], ends[1]), 0.5);
  if (d.curve === "circle" && d.origin && d.axis && finite(d.radius)) {
    return add(d.origin, scale(perpendicular(d.axis), Number(d.radius)));
  }
  return d.origin || null;
}

/* The surface normal of a face at a point on it. A plane answers the same
   everywhere; a cylinder answers radially, which is the whole reason tangency
   has to be evaluated AT the shared edge rather than from stored normals. */
export function faceNormalAt(face, point) {
  const d = face?.descriptor || {};
  if (d.surface === "cylinder" && d.axis && d.origin && point) {
    const axis = unit(d.axis), rel = sub(point, d.origin);
    const along = dot(rel, axis);
    const radial = sub(rel, scale(axis, along));
    if (len(radial) > 1e-6) return unit(radial);
  }
  return d.normal ? unit(d.normal) : null;
}

const isFace = (entry) => entry?.kind === "face";
const isEdge = (entry) => entry?.kind === "edge";
const idOf = (entry) => entry?.persistentId;

function byId(entries) {
  const map = new Map();
  (entries || []).forEach((entry) => { if (idOf(entry)) map.set(idOf(entry), entry); });
  return map;
}

function resolveEntry(reference, entries) {
  if (!reference) return null;
  const direct = byId(entries).get(reference.persistentId);
  return direct || reference;
}

/* The lenient resolve above lets a reference stand in for itself, which is
   what the loop path wants — edgesBoundingFace() rebinds by descriptor and can
   still find the face after a rebuild renumbered it. Adjacency cannot: a
   reference that is not among these entries has no neighbours here, and
   answering with the reference itself would report a body containing something
   it does not. */
function strictEntry(reference, entries) {
  if (!reference) return null;
  return byId(entries).get(reference.persistentId) || null;
}

function resolveSelection(selected, entries) {
  const chosen = new Map();
  (selected || []).forEach((reference) => {
    const entry = strictEntry(reference, entries);
    if (entry) chosen.set(idOf(entry), entry);
  });
  return chosen;
}

export function facesTouchingEdge(edge, entries) {
  if (!isEdge(edge)) return [];
  return (entries || []).filter((entry) => isFace(entry) && edgeLiesOnFace(edge, entry));
}

/* Two faces meet smoothly when their surfaces share a normal along the edge
   between them — a fillet against the wall it blends into, or a cylinder
   against its tangent plane. Evaluated at the shared edge's midpoint so a
   curved face is judged where it actually touches, not at its own origin. */
export function facesAreTangent(a, b, sharedEdge, tolerance = 0.02) {
  const at = pointOnEdge(sharedEdge);
  if (!at) return false;
  const na = faceNormalAt(a, at), nb = faceNormalAt(b, at);
  if (!na || !nb) return false;
  return Math.abs(Math.abs(dot(na, nb)) - 1) <= tolerance;
}

/* Two edges continue one another when they meet at a point and leave it in the
   same direction. Endpoints are compared against the size of the geometry
   rather than an absolute epsilon: a 4 mm chamfer and a 4 m wall arrive here
   through the same code. */
export function edgesAreTangent(a, b, tolerance = 0.02) {
  const ea = edgeEndpoints(a), eb = edgeEndpoints(b);
  if (ea.length < 2 || eb.length < 2) return false;
  const span = Math.max(Math.abs(Number(a?.descriptor?.measure) || 0), Math.abs(Number(b?.descriptor?.measure) || 0), 1);
  const tol = Math.max(1e-4, span * 0.02);
  const tangentAt=(edge,ends,point)=>{
    const d=edge.descriptor || {};
    if(d.curve==='circle' && d.origin && d.axis){
      const radial=sub(point,d.origin),axis=d.axis;
      const tangent=vec(axis.y*radial.z-axis.z*radial.y,axis.z*radial.x-axis.x*radial.z,axis.x*radial.y-axis.y*radial.x);
      return len(tangent)>1e-9?unit(tangent):null;
    }
    const tangent=sub(ends[1],ends[0]);return len(tangent)>1e-9?unit(tangent):null;
  };
  return ea.some(pa=>eb.some(pb=>{
    if(len(sub(pa,pb))>tol)return false;
    const da=tangentAt(a,ea,pa),db=tangentAt(b,eb,pb);
    return !!da && !!db && Math.abs(Math.abs(dot(da,db))-1)<=tolerance;
  }));
}

/* Every edge that bounds the face under the pointer. From an edge, the loop is
   the boundary of the face it bounds — an edge borders two, so the smaller one
   is taken: that is the pocket or boss the user is pointing at rather than the
   slab it was cut from. */
export function selectLoop(reference, entries) {
  const list = entries || [];
  const entry = resolveEntry(reference, list);
  if (isFace(entry)) return edgesBoundingFace(entry, createTopologyRegistry(list));
  if (!isEdge(entry)) return [];
  const faces = facesTouchingEdge(entry, list);
  if (!faces.length) return [];
  const smallest = faces.slice().sort((a, b) =>
    Math.abs(Number(a.descriptor?.measure) || Infinity) - Math.abs(Number(b.descriptor?.measure) || Infinity))[0];
  return edgesBoundingFace(smallest, createTopologyRegistry(list));
}

/* The smooth run through the picked entity: faces that blend into one another,
   or edges that continue one another. Breadth-first from the pick, so a chain
   that forks (a fillet meeting two walls) collects both branches. */
export function selectTangentChain(reference, entries) {
  const list = entries || [];
  const entry = resolveEntry(reference, list);
  if (!entry || (!isFace(entry) && !isEdge(entry))) return [];
  const pool = list.filter(isFace(entry) ? isFace : isEdge);
  /* The chain is seeded with the picked entity, so a reference that is not in
     these entries at all would come back as a one-item "chain" of something
     the body does not contain. Nothing to grow from is an empty answer. */
  if (!pool.some((candidate) => idOf(candidate) === idOf(entry))) return [];
  const seen = new Set([idOf(entry)]);
  const chain = [entry];
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift();
    pool.forEach((candidate) => {
      if (seen.has(idOf(candidate))) return;
      const joined = isFace(entry)
        ? sharedEdgeBetween(current, candidate, list)
        : (edgesAreTangent(current, candidate) ? true : null);
      if (!joined) return;
      if (isFace(entry) && !facesAreTangent(current, candidate, joined)) return;
      seen.add(idOf(candidate));
      chain.push(candidate);
      queue.push(candidate);
    });
  }
  return chain;
}

function sharedEdgeBetween(a, b, entries) {
  return (entries || []).find((entry) => isEdge(entry) && edgeLiesOnFace(entry, a) && edgeLiesOnFace(entry, b)) || null;
}

/* The corners of a body, derived from the ends of its edges rather than stored
   alongside them. A corner is shared by three edges, so the id has to come
   from WHERE the point is, not from which edge reported it — otherwise one
   corner arrives as three references that cannot be deduplicated or toggled
   against each other. Quantised to a tenth of a millimetre at centimetre
   scale, which is finer than any geometry this editor builds and coarse enough
   to survive the float noise of a rebuild. */
export function vertexKey(point, precision = 1e4) {
  const round = (n) => Math.round((Number(n) || 0) * precision) / precision;
  return "vertex:" + round(point?.x) + ":" + round(point?.y) + ":" + round(point?.z);
}

export function vertexEntriesFrom(entries) {
  const out = new Map();
  (entries || []).filter(isEdge).forEach((edge) => {
    edgeEndpoints(edge).forEach((point) => {
      const key = vertexKey(point);
      if (out.has(key)) return;
      out.set(key, {
        kind: "vertex",
        persistentId: key,
        ownerFeatureId: edge.ownerFeatureId,
        descriptor: { point: vec(point.x, point.y, point.z), origin: vec(point.x, point.y, point.z), semantic: key },
      });
    });
  });
  return Array.from(out.values());
}

/* What touches this entry: faces that share an edge with it, edges that share
   an end. Adjacency, not tangency — grow spreads across hard corners on
   purpose, which is what separates it from selecting a smooth run. */
export function topologyNeighbours(entry, entries) {
  const list = entries || [];
  if (isFace(entry)) return list.filter((candidate) =>
    isFace(candidate) && idOf(candidate) !== idOf(entry) && !!sharedEdgeBetween(entry, candidate, list));
  if (isEdge(entry)) return list.filter((candidate) =>
    isEdge(candidate) && idOf(candidate) !== idOf(entry) && edgesShareEnd(entry, candidate));
  return [];
}

function edgesShareEnd(a, b) {
  const ea = edgeEndpoints(a), eb = edgeEndpoints(b);
  if (!ea.length || !eb.length) return false;
  const span = Math.max(Math.abs(Number(a?.descriptor?.measure) || 0), Math.abs(Number(b?.descriptor?.measure) || 0), 1);
  const tol = Math.max(1e-4, span * 0.02);
  return ea.some((pa) => eb.some((pb) => len(sub(pa, pb)) <= tol));
}

/* One ring outwards: everything already selected, plus everything touching it.
   Repeated presses walk across the body a ring at a time, which is how a
   region gets selected without drawing a window around it. */
export function growSelection(selected, entries) {
  const list = entries || [];
  const chosen = resolveSelection(selected, list);
  if (!chosen.size) return [];
  Array.from(chosen.values()).forEach((entry) => {
    topologyNeighbours(entry, list).forEach((neighbour) => {
      if (!chosen.has(idOf(neighbour))) chosen.set(idOf(neighbour), neighbour);
    });
  });
  return Array.from(chosen.values());
}

/* One ring inwards: drop anything on the edge of the selection, keeping only
   entries whose every neighbour is also selected. The inverse of grow, so the
   two undo each other on a region with an interior. */
export function shrinkSelection(selected, entries) {
  const list = entries || [];
  const chosen = resolveSelection(selected, list);
  if (!chosen.size) return [];
  return Array.from(chosen.values()).filter((entry) => {
    const neighbours = topologyNeighbours(entry, list);
    return neighbours.length > 0 && neighbours.every((neighbour) => chosen.has(idOf(neighbour)));
  });
}

/* Everything of the same kind produced by the same feature — "select all faces
   of this body" without walking adjacency, which is what the command means in
   a single-body part. */
export function selectConnected(reference, entries) {
  const entry = resolveEntry(reference, entries || []);
  if (!entry) return [];
  const owner = entry.ownerFeatureId;
  return (entries || []).filter((candidate) =>
    candidate.kind === entry.kind && (!owner || candidate.ownerFeatureId === owner));
}

/* Everything of the selected kinds that is not currently selected. Scoped to
   the kinds already in hand so inverting an edge selection cannot silently
   hand back a pile of faces. */
export function invertSelection(selected, entries) {
  const chosen = new Set((selected || []).map(idOf).filter(Boolean));
  const kinds = new Set((selected || []).map((entry) => entry?.kind).filter(Boolean));
  if (!kinds.size) return [];
  return (entries || []).filter((entry) => kinds.has(entry.kind) && !chosen.has(idOf(entry)));
}

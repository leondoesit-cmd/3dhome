/* Triangles for a document's bodies, without a renderer.
 *
 * The drawing sheet needs the same solid the viewport shows, but it also has to
 * work where there is no WebGL at all: the SVG exporter, a saved-model
 * thumbnail, and every test in tests/. So each part kind is tessellated here
 * from its own parameters, with the SAME axis mapping the rest of the app uses
 * (see cad_drawings.js partBoundsOf and modeler.js buildExt) — a mapping that
 * disagreed would put the hole on the wrong face of the drawing.
 *
 * Winding is outward everywhere. It is not decoration: hidden-line removal
 * finds a smooth body's outline by asking whether two faces disagree about
 * facing the viewer, and a flipped triangle makes that question return "yes"
 * along every seam.
 */

import { framePoint } from "./frame.js";

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function pushTriangle(out, a, b, c) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function pushQuad(out, a, b, c, d) {
  pushTriangle(out, a, b, c);
  pushTriangle(out, a, c, d);
}

/* ---- polygons ----------------------------------------------------------- */

export function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.u * b.v - b.u * a.v;
  }
  return area / 2;
}

/* Ear clipping with bridged holes: enough for the profiles a sketch produces
   (simple, non-self-intersecting loops), and small enough to read. */
export function triangulatePolygon(outer, holes = []) {
  let ring = outer.slice();
  if (polygonArea(ring) < 0) ring.reverse();
  for (const hole of holes) {
    const loop = hole.slice();
    if (loop.length < 3) continue;
    if (polygonArea(loop) > 0) loop.reverse();          // holes run the other way
    ring = bridgeHole(ring, loop);
  }
  const indices = ring.map((point, index) => index);
  const triangles = [];
  let guard = indices.length * indices.length;
  while (indices.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const prev = ring[indices[(i - 1 + indices.length) % indices.length]];
      const ear = ring[indices[i]];
      const next = ring[indices[(i + 1) % indices.length]];
      if (cross2(prev, ear, next) <= 0) continue;       // reflex corner
      let clean = true;
      for (let k = 0; k < indices.length && clean; k++) {
        if (k === i || k === (i - 1 + indices.length) % indices.length || k === (i + 1) % indices.length) continue;
        if (pointInTriangle(ring[indices[k]], prev, ear, next)) clean = false;
      }
      if (!clean) continue;
      triangles.push([prev, ear, next]);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;                                 // degenerate ring; stop early
  }
  if (indices.length === 3) triangles.push([ring[indices[0]], ring[indices[1]], ring[indices[2]]]);
  return triangles;
}

const cross2 = (a, b, c) => (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);

function pointInTriangle(point, a, b, c) {
  const d1 = cross2(a, b, point), d2 = cross2(b, c, point), d3 = cross2(c, a, point);
  const negative = d1 < 0 || d2 < 0 || d3 < 0, positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/* Join a hole to the outer ring with a doubled-back bridge at the pair of
   points closest to each other — the classic cut that turns a ring with a hole
   into one simple polygon an ear clipper can eat. */
function bridgeHole(outer, hole) {
  let bestOuter = 0, bestHole = 0, best = Infinity;
  for (let i = 0; i < outer.length; i++) {
    for (let k = 0; k < hole.length; k++) {
      const distance = Math.hypot(outer[i].u - hole[k].u, outer[i].v - hole[k].v);
      if (distance < best) { best = distance; bestOuter = i; bestHole = k; }
    }
  }
  const merged = outer.slice(0, bestOuter + 1);
  for (let i = 0; i <= hole.length; i++) merged.push(hole[(bestHole + i) % hole.length]);
  merged.push(outer[bestOuter]);
  return merged.concat(outer.slice(bestOuter + 1));
}

/* ---- part kinds --------------------------------------------------------- */

function boxTriangles(part) {
  const x0 = Math.min(num(part.x0), num(part.x1)), x1 = Math.max(num(part.x0), num(part.x1));
  const y0 = Math.min(num(part.y0), num(part.y1)), y1 = Math.max(num(part.y0), num(part.y1));
  const z0 = Math.min(num(part.z0), num(part.z1)), z1 = Math.max(num(part.z0), num(part.z1));
  const p = (x, y, z) => ({ x, y, z });
  const out = [];
  pushQuad(out, p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1));   // +z
  pushQuad(out, p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0));   // -z
  pushQuad(out, p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1));   // +x
  pushQuad(out, p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0));   // -x
  pushQuad(out, p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0));   // +y
  pushQuad(out, p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1));   // -y
  return out;
}

function cylinderTriangles(part, steps = 48) {
  const r0 = Math.abs(num(part.r)), r1 = Number.isFinite(Number(part.r2)) ? Math.abs(num(part.r2)) : r0;
  const height = num(part.h), cx = num(part.x), cy = num(part.y), cz = num(part.z);
  const out = [];
  const ring = (radius, y) => Array.from({ length: steps }, (unused, i) => {
    const angle = (i / steps) * Math.PI * 2;
    return { x: cx + Math.cos(angle) * radius, y, z: cz + Math.sin(angle) * radius };
  });
  const bottom = ring(r0, cy), top = ring(r1, cy + height);
  for (let i = 0; i < steps; i++) {
    const next = (i + 1) % steps;
    pushQuad(out, bottom[i], top[i], top[next], bottom[next]);
    pushTriangle(out, { x: cx, y: cy, z: cz }, bottom[i], bottom[next]);
    pushTriangle(out, { x: cx, y: cy + height, z: cz }, top[next], top[i]);
  }
  return out;
}

function sphereTriangles(part, columns = 32, rows = 16) {
  const radius = Math.abs(num(part.r)), cx = num(part.x), cy = num(part.y), cz = num(part.z);
  const at = (column, row) => {
    const theta = (column / columns) * Math.PI * 2, phi = (row / rows) * Math.PI;
    return {
      x: cx + radius * Math.sin(phi) * Math.cos(theta),
      y: cy + radius * Math.cos(phi),
      z: cz + radius * Math.sin(phi) * Math.sin(theta),
    };
  };
  const out = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = at(column, row), b = at(column + 1, row), c = at(column + 1, row + 1), d = at(column, row + 1);
      if (row === 0) pushTriangle(out, a, c, d);
      else if (row === rows - 1) pushTriangle(out, a, b, c);
      else pushQuad(out, a, b, c, d);
    }
  }
  return out;
}

/* The (u, v) plane an extrusion is drawn on, and the direction it grows. Kept
   in one place because three modules have to agree about it. */
export function extrusionFrame(part) {
  if (part.frame) {
    const origin = framePoint(part.frame, 0, 0, 0);
    return {
      origin,
      u: part.frame.xAxis, v: part.frame.yAxis, w: part.frame.normal,
      from: num(part.from), to: num(part.to),
    };
  }
  const axis = part.axis === "x" ? "x" : part.axis === "y" ? "y" : "z";
  const map = {
    z: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 1, z: 0 }, w: { x: 0, y: 0, z: 1 } },
    y: { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, w: { x: 0, y: 1, z: 0 } },
    x: { u: { x: 0, y: 0, z: 1 }, v: { x: 0, y: 1, z: 0 }, w: { x: 1, y: 0, z: 0 } },
  }[axis];
  return {
    origin: { x: 0, y: 0, z: 0 }, u: map.u, v: map.v, w: map.w,
    from: Math.min(num(part.from), num(part.to)), to: Math.max(num(part.from), num(part.to)),
  };
}

function extrusionTriangles(part) {
  const outline = (part.pts || []).map((point) => ({ u: num(point.u), v: num(point.v) }));
  if (outline.length < 3) return [];
  const holes = (part.holes || [])
    .map((hole) => (Array.isArray(hole) ? hole : hole?.points || hole?.loop || []))
    .filter((loop) => loop && loop.length >= 3 && !loop.suppressed)
    .map((loop) => loop.map((point) => ({ u: num(point.u), v: num(point.v) })));
  const frame = extrusionFrame(part);
  const at = (u, v, w) => ({
    x: frame.origin.x + frame.u.x * u + frame.v.x * v + frame.w.x * w,
    y: frame.origin.y + frame.u.y * u + frame.v.y * v + frame.w.y * w,
    z: frame.origin.z + frame.u.z * u + frame.v.z * v + frame.w.z * w,
  });
  const low = Math.min(frame.from, frame.to), high = Math.max(frame.from, frame.to);
  /* Two of the three axis mappings are left-handed (u × v points AGAINST the
     extrusion), so a cap wound counter-clockwise in (u, v) would face into the
     body. One sign, applied everywhere, keeps the solid outward-wound. */
  const cross = {
    x: frame.u.y * frame.v.z - frame.u.z * frame.v.y,
    y: frame.u.z * frame.v.x - frame.u.x * frame.v.z,
    z: frame.u.x * frame.v.y - frame.u.y * frame.v.x,
  };
  const flip = cross.x * frame.w.x + cross.y * frame.w.y + cross.z * frame.w.z < 0;
  const out = [];
  for (const triangle of triangulatePolygon(outline, holes)) {
    const [a, b, c] = flip ? [triangle[0], triangle[2], triangle[1]] : triangle;
    pushTriangle(out, at(a.u, a.v, high), at(b.u, b.v, high), at(c.u, c.v, high));
    pushTriangle(out, at(a.u, a.v, low), at(c.u, c.v, low), at(b.u, b.v, low));
  }
  const wall = (loop, outward) => {
    const ring = loop.slice();
    if ((polygonArea(ring) > 0) !== outward) ring.reverse();
    if (flip) ring.reverse();
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      pushQuad(out, at(a.u, a.v, low), at(b.u, b.v, low), at(b.u, b.v, high), at(a.u, a.v, high));
    }
  };
  wall(outline, true);
  for (const hole of holes) wall(hole, false);
  return out;
}

/* A profile spun about an axis. Approximated at 48 steps, which is what the
   viewport does too, so the drawing's silhouette matches the shaded model. */
function revolveTriangles(part, steps = 48) {
  const profile = (part.pts || []).map((point) => ({ u: num(point.u), v: num(point.v) }));
  if (profile.length < 2) return [];
  const axis = part.axis === "x" ? "x" : part.axis === "z" ? "z" : "y";
  const centre = { x: num(part.x), y: num(part.y), z: num(part.z) };
  const at = (point, angle) => {
    const radius = Math.abs(point.u), height = point.v;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    if (axis === "y") return { x: centre.x + radius * cos, y: centre.y + height, z: centre.z + radius * sin };
    if (axis === "x") return { x: centre.x + height, y: centre.y + radius * cos, z: centre.z + radius * sin };
    return { x: centre.x + radius * cos, y: centre.y + radius * sin, z: centre.z + height };
  };
  const out = [];
  for (let step = 0; step < steps; step++) {
    const a0 = (step / steps) * Math.PI * 2, a1 = ((step + 1) / steps) * Math.PI * 2;
    for (let i = 0; i + 1 < profile.length; i++) {
      pushQuad(out, at(profile[i], a0), at(profile[i + 1], a0), at(profile[i + 1], a1), at(profile[i], a1));
    }
  }
  return out;
}

/* An indexed mesh is expanded to the flat triangle soup the projector reads;
   an already-flat one is handed straight through. */
export function meshDataTriangles(meshData) {
  const positions = meshData?.positions;
  if (!positions?.length) return [];
  if (!meshData.indices?.length) return Array.from(positions, Number);
  const out = new Array(meshData.indices.length * 3);
  for (let i = 0; i < meshData.indices.length; i++) {
    const index = meshData.indices[i] * 3;
    out[i * 3] = Number(positions[index]);
    out[i * 3 + 1] = Number(positions[index + 1]);
    out[i * 3 + 2] = Number(positions[index + 2]);
  }
  return out;
}

/* One body's triangles, or the envelope box when the kind carries no geometry
   this module can build — the fidelity the sheet has always fallen back to. */
export function tessellatePart(part) {
  if (!part) return null;
  if (part.meshData && !part.exactPending) {
    const positions = meshDataTriangles(part.meshData);
    if (positions.length >= 9) return { id: part.id, name: part.name, positions };
  }
  let positions = [];
  if (part.kind === "box") positions = boxTriangles(part);
  else if (part.kind === "cyl") positions = cylinderTriangles(part);
  else if (part.kind === "sph") positions = sphereTriangles(part);
  else if (part.kind === "ext") positions = extrusionTriangles(part);
  else if (part.kind === "rev") positions = revolveTriangles(part);
  if (positions.length < 9) return null;
  return { id: part.id, name: part.name, positions };
}

export function tessellateParts(parts) {
  const bodies = [];
  for (const part of parts || []) {
    const body = tessellatePart(part);
    if (body) bodies.push(body);
  }
  return bodies;
}

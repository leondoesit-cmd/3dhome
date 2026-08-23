/* Mobile room-scan normalization.

   Apple RoomPlan's CapturedRoom is a native API (not a browser API), but a
   CapturedRoom can be JSON encoded by the scanning app and handed to this
   local-first planner.  Android browsers with WebXR can also produce a simple
   corner trace.  Both routes end here as centimetre CAD centre-lines so the
   regular architectural wall importer remains the single source of truth. */

const CM_PER_UNIT = {
  m: 100, meter: 100, meters: 100,
  cm: 1, centimeter: 1, centimeters: 1,
  mm: 0.1, millimeter: 0.1, millimeters: 0.1,
  ft: 30.48, foot: 30.48, feet: 30.48,
};

export class RoomScanError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

function number(v, fallback = 0) {
  v = Number(v);
  return Number.isFinite(v) ? v : fallback;
}

function vec3(value) {
  if (Array.isArray(value)) return value.length === 2
    ? { x: number(value[0]), y: 0, z: number(value[1]) }
    : { x: number(value[0]), y: number(value[1]), z: number(value[2]) };
  if (!value || typeof value !== "object") return null;
  return { x: number(value.x), y: number(value.y), z: number(value.z) };
}

function dimensions(surface) {
  const raw = surface && (surface.dimensions || surface.dimension || surface.size);
  const d = Array.isArray(raw) && raw.length === 2
    ? { x: number(raw[0]), y: number(raw[1]), z: 0 }
    : vec3(raw);
  return {
    width: number(surface && surface.width, d ? d.x : 0),
    height: number(surface && surface.height, d ? d.y : 0),
    depth: number(surface && (surface.depth || surface.thickness), d ? d.z : 0),
  };
}

function flatTransform(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length === 16) return value.map(Number);
  if (value.elements) return flatTransform(value.elements);
  if (value.matrix) return flatTransform(value.matrix);
  if (Array.isArray(value.columns) && value.columns.length === 4) {
    const out = [];
    value.columns.forEach((col) => {
      const v = Array.isArray(col) ? col : [col.x, col.y, col.z, col.w];
      out.push(number(v[0]), number(v[1]), number(v[2]), number(v[3]));
    });
    return out;
  }
  return null;
}

/* RoomPlan uses column-major simd_float4x4 transforms: local X runs along a
   wall and the fourth column is its world-space centre.  position/yaw is also
   accepted for small third-party bridges that avoid serializing SIMD types. */
function surfaceFrame(surface) {
  const m = flatTransform(surface && surface.transform);
  if (m && m.every(Number.isFinite)) {
    const axisLen = Math.hypot(m[0], m[2]);
    return {
      center: { x: m[12], y: m[13], z: m[14] },
      axis: axisLen > 1e-6 ? { x: m[0] / axisLen, z: m[2] / axisLen } : { x: 1, z: 0 },
    };
  }
  const p = vec3(surface && (surface.position || surface.center || surface.translation));
  if (!p) return null;
  const yaw = number(surface.yaw != null ? surface.yaw : surface.rotation, 0);
  return { center: { x: p.x, y: p.y, z: p.z }, axis: { x: Math.cos(yaw), z: Math.sin(yaw) } };
}

function unitScale(data) {
  const raw = String((data && (data.unit || data.units || data.measurementUnit)) || "m").toLowerCase();
  return CM_PER_UNIT[raw] || 100;
}

function roomPayload(data) {
  if (!data || typeof data !== "object") return null;
  return data.capturedRoom || data.roomPlan || data.room || data;
}

function directLine(wall, scale) {
  const a = vec3(wall.start || wall.a || wall.from);
  const b = vec3(wall.end || wall.b || wall.to);
  if (!a || !b) return null;
  return {
    a: { x: a.x * scale, z: a.z * scale },
    b: { x: b.x * scale, z: b.z * scale },
    thickness: Math.max(4, number(wall.thickness, 10 / scale) * scale),
    height: Math.max(100, number(wall.height, 270 / scale) * scale),
    layer: "room-scan",
  };
}

function surfaceLine(wall, scale) {
  const frame = surfaceFrame(wall), d = dimensions(wall);
  if (!frame || !(d.width > 0)) return null;
  const half = d.width * scale / 2;
  const cx = frame.center.x * scale, cz = frame.center.z * scale;
  return {
    a: { x: cx - frame.axis.x * half, z: cz - frame.axis.z * half },
    b: { x: cx + frame.axis.x * half, z: cz + frame.axis.z * half },
    thickness: Math.max(4, (d.depth || 10 / scale) * scale),
    height: Math.max(100, (d.height || 270 / scale) * scale),
    layer: "room-scan",
  };
}

function openingRecord(surface, scale, type) {
  const frame = surfaceFrame(surface), d = dimensions(surface);
  if (!frame) return null;
  const measuredSill = Math.max(0, frame.center.y - (d.height || 0) / 2);
  return {
    type,
    center: { x: frame.center.x * scale, z: frame.center.z * scale },
    width: Math.max(20, (d.width || (type === "window" ? 120 : 90) / scale) * scale),
    height: Math.max(20, (d.height || (type === "window" ? 120 : 205) / scale) * scale),
    sill: type === "window" ? number(surface.sillHeight != null ? surface.sillHeight : surface.sill, measuredSill || 90 / scale) * scale : 0,
  };
}

function moveToPositive(cad) {
  const points = [];
  cad.lines.forEach((line) => points.push(line.a, line.b));
  if (!points.length) return cad;
  const minX = Math.min(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z));
  const dx = minX < 0 ? -minX + 20 : 0;
  const dz = minZ < 0 ? -minZ + 20 : 0;
  if (!dx && !dz) return cad;
  cad.lines.forEach((line) => {
    line.a.x += dx; line.b.x += dx; line.a.z += dz; line.b.z += dz;
  });
  cad.doors.concat(cad.windows).forEach((op) => {
    op.center.x += dx; op.center.z += dz;
  });
  return cad;
}

export function parseRoomScan(input) {
  let data = input;
  if (typeof data === "string") {
    try { data = JSON.parse(data); }
    catch (e) { throw new RoomScanError("bad-json", "The scan file is not valid JSON"); }
  }
  const room = roomPayload(data);
  if (!room) throw new RoomScanError("bad-json", "The scan file has no room data");
  const scale = unitScale(room.unit ? room : data);
  const rawWalls = Array.isArray(room.walls) ? room.walls : [];
  const lines = rawWalls.map((wall) => directLine(wall, scale) || surfaceLine(wall, scale)).filter(Boolean);
  if (lines.length < 3)
    throw new RoomScanError("no-walls", "The scan needs at least three measured walls");

  const doors = [], windows = [];
  [
    [room.doors, "door"],
    [room.windows, "window"],
    [room.openings, "passage"],
  ].forEach(([list, type]) => {
    (Array.isArray(list) ? list : []).forEach((surface) => {
      const op = openingRecord(surface, scale, type);
      if (!op) return;
      (type === "window" ? windows : doors).push(op);
    });
  });

  const cad = moveToPositive({ lines, doors, windows });
  const confidence = rawWalls.map((w) => number(w.confidence, NaN)).filter(Number.isFinite);
  return {
    source: /roomplan|capturedroom/i.test(String(data.format || data.type || "")) || data.capturedRoom ? "Apple RoomPlan" : "Room scan",
    cad,
    wallCount: lines.length,
    openingCount: doors.length + windows.length,
    averageConfidence: confidence.length ? confidence.reduce((a, b) => a + b, 0) / confidence.length : null,
  };
}

export function roomScanFromPoints(points, options = {}) {
  const clean = (Array.isArray(points) ? points : [])
    .map((p) => ({ x: number(p && p.x, NaN), z: number(p && p.z, NaN) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  if (clean.length > 2 && Math.hypot(clean[0].x - clean[clean.length - 1].x, clean[0].z - clean[clean.length - 1].z) < 5)
    clean.pop();
  if (clean.length < 3) throw new RoomScanError("no-walls", "Mark at least three room corners");
  const height = Math.max(100, number(options.heightCm, 270));
  const thickness = Math.max(4, number(options.thicknessCm, 10));
  const lines = clean.map((p, i) => ({
    a: { ...p }, b: { ...clean[(i + 1) % clean.length] }, height, thickness, layer: "ar-scan",
  }));
  return {
    source: "WebXR AR",
    cad: moveToPositive({ lines, doors: [], windows: [] }),
    wallCount: lines.length,
    openingCount: 0,
    averageConfidence: null,
  };
}

function scalePoint(p, k, ox, oz) {
  return { x: ox + (p.x - ox) * k, z: oz + (p.z - oz) * k };
}

export function longestScanEdge(result) {
  const lines = result && result.cad && result.cad.lines || [];
  let best = null, bestLen = 0;
  lines.forEach((line) => {
    const len = Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z);
    if (len > bestLen) { bestLen = len; best = { a: line.a, b: line.b, length: len }; }
  });
  return best;
}

/* Scale the whole scan so a measured pair of points becomes `knownCm` long.
   Used after a laser/tape reading on one wall. Origin is the first point so
   the plan does not jump when the user only wanted a size correction.

   PLAN ONLY. A tape across a wall corrects the drift in the horizontal fit,
   and nothing about how tall the door is — scaling heights and sills with the
   same factor turned a 205 cm door into a 256 cm one on a 25% correction.
   Pass {heights: true} if the whole capture really was mis-scaled. */
export function scaleScan(result, knownCm, from, to, opts) {
  if (!result || !result.cad) throw new RoomScanError("bad-json", "The scan has no geometry to scale");
  const edge = (!from || !to) ? longestScanEdge(result) : null;
  const a = from || (edge && edge.a);
  const b = to || (edge && edge.b);
  if (!a || !b) throw new RoomScanError("no-walls", "Pick two points on a measured wall");
  const measured = Math.hypot(b.x - a.x, b.z - a.z);
  const known = Number(knownCm);
  if (!(measured > 0.5) || !(known > 0.5))
    throw new RoomScanError("bad-scale", "Enter a positive measured length");
  const k = known / measured;
  const vertical = !!(opts && opts.heights);
  const ox = a.x, oz = a.z;
  result.cad.lines.forEach((line) => {
    line.a = scalePoint(line.a, k, ox, oz);
    line.b = scalePoint(line.b, k, ox, oz);
    if (line.thickness) line.thickness *= k;
    if (vertical && line.height) line.height *= k;
  });
  (result.cad.doors || []).concat(result.cad.windows || []).forEach((op) => {
    op.center = scalePoint(op.center, k, ox, oz);
    if (op.width) op.width *= k;
    if (vertical && op.height) op.height *= k;
    if (vertical && op.sill) op.sill *= k;
  });
  result.scaleFactor = (result.scaleFactor || 1) * k;
  return result;
}

/* A corner tapped in AR is the INSIDE face of the wall, not its centre-line,
   so using the loop directly makes every room a wall-thickness too big. Push
   each edge outward by half its thickness (negative `sign` pulls in) by
   offsetting the polygon along its own edge normals. */
export function insetScan(result, sign) {
  const lines = result && result.cad && result.cad.lines || [];
  if (lines.length < 3) return result;
  const dir = sign < 0 ? -1 : 1;
  // signed area tells us which way the loop winds, so "outward" is consistent
  let area = 0;
  lines.forEach((line) => { area += line.a.x * line.b.z - line.b.x * line.a.z; });
  const wind = area >= 0 ? 1 : -1;
  const moved = lines.map((line) => {
    const dx = line.b.x - line.a.x, dz = line.b.z - line.a.z;
    const len = Math.hypot(dx, dz) || 1;
    const off = ((line.thickness || 10) / 2) * dir * wind;
    // left normal of the edge, scaled to half the wall
    const nx = (dz / len) * off, nz = (-dx / len) * off;
    return {
      line,
      a: { x: line.a.x + nx, z: line.a.z + nz },
      b: { x: line.b.x + nx, z: line.b.z + nz },
    };
  });
  // re-close the loop on the offset edges so corners stay sharp
  moved.forEach((cur, i) => {
    const prev = moved[(i - 1 + moved.length) % moved.length];
    const hit = intersect(prev.a, prev.b, cur.a, cur.b);
    if (hit) { prev.line.b = { ...hit }; cur.line.a = { ...hit }; }
    else { cur.line.a = { ...cur.a }; cur.line.b = { ...cur.b }; }
  });
  moved.forEach((cur) => {
    if (!cur.line.b || cur.line.b === cur.line.a) cur.line.b = { ...cur.b };
  });
  result.faceOffset = (result.faceOffset || 0) + dir;
  return result;
}

function intersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z;
  const d2x = p4.x - p3.x, d2z = p4.z - p3.z;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null; // parallel edges have no corner
  const t = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / den;
  return { x: p1.x + d1x * t, z: p1.z + d1z * t };
}

export function offsetScan(result, dx, dz) {
  if (!result || !result.cad) return result;
  result.cad.lines.forEach((line) => {
    line.a.x += dx; line.b.x += dx; line.a.z += dz; line.b.z += dz;
  });
  (result.cad.doors || []).concat(result.cad.windows || []).forEach((op) => {
    op.center.x += dx; op.center.z += dz;
  });
  return result;
}

export function scanBounds(result) {
  const lines = result && result.cad && result.cad.lines || [];
  const pts = [];
  lines.forEach((line) => pts.push(line.a, line.b));
  if (!pts.length) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0, width: 0, depth: 0 };
  const minX = Math.min(...pts.map((p) => p.x)), minZ = Math.min(...pts.map((p) => p.z));
  const maxX = Math.max(...pts.map((p) => p.x)), maxZ = Math.max(...pts.map((p) => p.z));
  return { minX, minZ, maxX, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

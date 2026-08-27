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

/* Keep capability diagnosis independent from browser globals so the UI can
   explain why AR is unavailable instead of collapsing every phone/browser
   failure into the same vague message. */
export function roomScanArIssue(environment = {}) {
  if (environment.secureContext === false) return "insecure";
  /* Ask the real capability first. Short-circuiting on "this is an iPhone"
     would keep reporting AR as unavailable on the day Safari ships WebXR, and
     on the WebXR browsers that already run on iOS. The Apple wording is only
     the more useful phrasing of "no WebXR here". */
  if (!environment.xrApi) return environment.appleMobile ? "apple-mobile" : "no-webxr";
  if (environment.sessionSupported === false)
    return environment.appleMobile ? "apple-mobile" : "unsupported";
  return null;
}

export function roomScanArStartIssue(error) {
  const name = String(error && error.name || "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "permission";
  if (name === "SecurityError") return "insecure";
  if (name === "NotSupportedError") return "unsupported";
  return "start-failed";
}

/* Ignore an accidental double-tap at the same physical corner. Besides
   producing a zero-length wall, it makes the closing edge and calibration
   look plausible enough that the mistake is hard to notice later. */
export function appendRoomScanPoint(points, point, minimumDistanceCm = 15) {
  const next = vec3(point);
  if (!next) return false;
  const clean = { x: next.x, z: next.z };
  const last = points && points[points.length - 1];
  if (last && Math.hypot(clean.x - last.x, clean.z - last.z) < Math.max(0, minimumDistanceCm))
    return false;
  points.push(clean);
  return true;
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
    // a default section is a constant, not a measurement: see scaleScan
    nominalThickness: !Number.isFinite(Number(wall.thickness)),
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
    nominalThickness: !(d.depth > 0),
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

/* Wall records arrive in whatever order the capture wrote them. An AR trace is
   a loop by construction, but a RoomPlan export lists surfaces in scan order
   and happily puts two opposite walls next to each other. Any corner pass that
   assumed lines[i-1] touches lines[i] therefore mangled real imports, so those
   passes rebuild an explicit oriented loop first and bail out when the records
   do not actually close a room. */
function loopTolerance(lines) {
  let thickest = 0;
  lines.forEach((line) => { thickest = Math.max(thickest, number(line && line.thickness, 0)); });
  return Math.max(24, thickest * 2);
}

function loopOrder(lines, tolerance) {
  if (!Array.isArray(lines) || lines.length < 3) return null;
  const tol = Math.max(1, number(tolerance, 24));
  const near = (p, q) => p && q && Math.hypot(p.x - q.x, p.z - q.z) <= tol;
  const used = new Set([0]);
  const chain = [{ index: 0, a: lines[0].a, b: lines[0].b, flip: false }];
  let end = lines[0].b;
  const gap = (p, q) => (p && q ? Math.hypot(p.x - q.x, p.z - q.z) : Infinity);
  while (used.size < lines.length) {
    let found = -1, flip = false, bestGap = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      // an edge may be stored either way round; orient it onto the open end,
      // and prefer the closest candidate so a narrow room cannot cross-link
      const ga = gap(lines[i].a, end), gb = gap(lines[i].b, end);
      if (ga <= tol && ga < bestGap) { bestGap = ga; found = i; flip = false; }
      if (gb <= tol && gb < bestGap) { bestGap = gb; found = i; flip = true; }
    }
    if (found < 0) return null; // open chain, branch, or a stray wall record
    used.add(found);
    const a = flip ? lines[found].b : lines[found].a;
    const b = flip ? lines[found].a : lines[found].b;
    chain.push({ index: found, a, b, flip });
    end = b;
  }
  return near(end, chain[0].a) ? chain : null;
}

function writeLoop(lines, chain) {
  chain.forEach((seg) => {
    const line = lines[seg.index];
    if (!line) return;
    line.a = seg.flip ? { x: seg.b.x, z: seg.b.z } : { x: seg.a.x, z: seg.a.z };
    line.b = seg.flip ? { x: seg.a.x, z: seg.a.z } : { x: seg.b.x, z: seg.b.z };
  });
}

function segmentLength(line) {
  return Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z);
}

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return { t, d: Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)) };
}

/* A wall record with no length is not a wall. The importer drops it later, so
   left in place it only inflates the reported wall count, draws a stray dot in
   the preview and gives the corner passes a direction of (0,0) to work with. */
function usableLine(line) {
  return !!line && segmentLength(line) >= 1;
}

function dropDegenerateLines(lines) {
  const out = [];
  lines.filter(usableLine).forEach((line) => {
    const dup = out.some((k) =>
      (Math.hypot(k.a.x - line.a.x, k.a.z - line.a.z) < 2 && Math.hypot(k.b.x - line.b.x, k.b.z - line.b.z) < 2) ||
      (Math.hypot(k.a.x - line.b.x, k.a.z - line.b.z) < 2 && Math.hypot(k.b.x - line.a.x, k.b.z - line.a.z) < 2));
    if (!dup) out.push(line);
  });
  return out;
}

/* RoomPlan encodes per-surface confidence as an enum, not a float, so a real
   CapturedRoom export used to average to null and the low-confidence walls the
   user should re-scan were never surfaced at all. */
const CONFIDENCE_WORDS = { high: 1, medium: 0.6, low: 0.3 };

function confidenceValue(raw) {
  if (typeof raw === "string") {
    const word = CONFIDENCE_WORDS[raw.trim().toLowerCase()];
    return word != null ? word : NaN;
  }
  return number(raw, NaN);
}

/* Put the walls in loop order once, at the door, so everything downstream can
   simply walk the array: the preview's floor fill did not, and drew a RoomPlan
   export (which arrives in scan order) as an hourglass across the room. */
function orderLoop(lines) {
  const chain = loopOrder(lines, loopTolerance(lines));
  if (!chain) return lines;
  return chain.map((seg) => {
    const line = lines[seg.index];
    return seg.flip
      ? Object.assign({}, line, { a: { x: line.b.x, z: line.b.z }, b: { x: line.a.x, z: line.a.z } })
      : line;
  });
}

/* RoomPlan fits a plane to the visible part of each wall, so the planes stop
   short of (or run past) the corners and the loop is a ring of near misses.
   Left alone, the wall graph merges whichever endpoint it saw first and the
   corner lands wherever that was; past its tolerance it does not merge at all
   and the room never closes. Pull both ends onto the true intersection. */
function weldCorners(lines) {
  if (lines.length < 3) return lines;
  const cut = lines.map((line, i) => {
    const next = lines[(i + 1) % lines.length];
    const hit = intersect(line.a, line.b, next.a, next.b);
    if (!hit) return null; // parallel neighbours have no corner to weld to
    // a corner that lands far outside the wall means these two do not meet
    const reach = Math.max(30, Math.min(segmentLength(line), segmentLength(next)) / 2);
    return Math.hypot(hit.x - line.b.x, hit.z - line.b.z) <= reach ? hit : null;
  });
  cut.forEach((hit, i) => {
    if (!hit) return;
    lines[i].b = { x: hit.x, z: hit.z };
    lines[(i + 1) % lines.length].a = { x: hit.x, z: hit.z };
  });
  return lines;
}

/* Floor area is the number people scan a room to find out, and the review panel
   only ever showed them a wall count. Shoelace over the loop. */
export function scanArea(result) {
  const lines = result && result.cad && result.cad.lines || [];
  if (lines.length < 3) return 0;
  let twice = 0;
  lines.forEach((line) => { twice += line.a.x * line.b.z - line.b.x * line.a.z; });
  return Math.abs(twice) / 2;
}

/* RoomPlan recognizes the furniture in the room as well as its shell, and all
   of it was being thrown away — the half of the scan that makes an imported
   plan look like the actual room instead of an empty box. RoomPlan's own
   category enum first, then the spellings third-party bridges use. */
const OBJECT_TYPES = {
  bed: "bed", sofa: "sofa", chair: "chair", table: "table", storage: "wardrobe",
  refrigerator: "fridge", stove: "cooktop", oven: "oven", dishwasher: "dishwasher",
  sink: "sink", washerdryer: "washer", toilet: "toilet", bathtub: "bathtub",
  television: "tv", fireplace: "fireplace", stairs: "stairs",
  desk: "desk", bookshelf: "bookshelf", nightstand: "nightstand", dresser: "dresser",
  wardrobe: "wardrobe", cabinet: "sideboard", armchair: "armchair", stool: "stool",
  shower: "shower", washer: "washer", dryer: "dryer", tv: "tv", couch: "sofa",
};

export function scanObjectType(category) {
  const key = String(category == null ? "" : category).toLowerCase().replace(/[^a-z]/g, "");
  return OBJECT_TYPES[key] || null;
}

function objectRecord(surface, scale) {
  const type = scanObjectType(surface && (surface.category || surface.type || surface.label));
  if (!type) return null;
  const frame = surfaceFrame(surface), d = dimensions(surface);
  if (!frame) return null;
  return {
    type,
    category: String((surface && (surface.category || surface.type)) || type),
    center: { x: frame.center.x * scale, z: frame.center.z * scale },
    // the planner's item frame is x=width, z=depth, and rot turns +x toward +z
    w: Math.max(10, (d.width || 60 / scale) * scale),
    d: Math.max(10, (d.depth || 60 / scale) * scale),
    h: Math.max(5, (d.height || 60 / scale) * scale),
    rot: Math.atan2(frame.axis.z, frame.axis.x) * 180 / Math.PI,
  };
}

/* The angle a corner would make if it were committed where the reticle is
   now. Shown live so the user can straighten up BEFORE placing the corner,
   rather than discovering the room is out of square in the review panel. */
export function scanOrthoAngle(prev, corner, live) {
  if (!prev || !corner || !live) return null;
  const a = Math.atan2(prev.z - corner.z, prev.x - corner.x);
  const b = Math.atan2(live.z - corner.z, live.x - corner.x);
  if (Math.hypot(prev.x - corner.x, prev.z - corner.z) < 1) return null;
  if (Math.hypot(live.x - corner.x, live.z - corner.z) < 1) return null;
  let deg = Math.abs((b - a) * 180 / Math.PI) % 360;
  if (deg > 180) deg = 360 - deg;
  return deg;
}

/* Being horizontal is not the same as being the floor: plane detection returns
   table tops, beds and kitchen counters just as happily, and a corner dropped
   on one is wrong by the height of the furniture. With a local-floor reference
   space the floor is y=0; without one, the lowest hit seen so far is the best
   estimate on offer. Centimetres, like everything else here. */
export function hitIsRaised(y, floorY, maxRiseCm = 35) {
  const at = Number(y);
  if (!Number.isFinite(at)) return false;
  return at - number(floorY, 0) > Math.max(0, number(maxRiseCm, 35));
}

/* A WebXR hit-test pose is oriented with its Y axis along the surface normal,
   so a hit on a skirting board, a chair leg or a wall arrives looking exactly
   like a floor hit unless you read the orientation. */
export function hitPoseIsFloor(orientation, minUp = 0.75) {
  if (!orientation) return true; // no orientation reported: trust the hit
  const x = number(orientation.x), y = number(orientation.y);
  const z = number(orientation.z), w = number(orientation.w);
  if (!(Math.abs(x) + Math.abs(y) + Math.abs(z) + Math.abs(w) > 0)) return true;
  // the pose's up vector is (0,1,0) rotated by the quaternion
  const up = 1 - 2 * (x * x + z * z);
  return Math.abs(up) >= minUp;
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
  (cad.objects || []).forEach((o) => { o.center.x += dx; o.center.z += dz; });
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
  const lines = dropDegenerateLines(
    rawWalls.map((wall) => directLine(wall, scale) || surfaceLine(wall, scale)).filter(Boolean));
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

  const objects = (Array.isArray(room.objects) ? room.objects : [])
    .map((object) => objectRecord(object, scale)).filter(Boolean);
  const cad = moveToPositive({ lines: weldCorners(orderLoop(lines)), doors, windows, objects });
  const confidence = rawWalls.map((w) => confidenceValue(w && w.confidence)).filter(Number.isFinite);
  return {
    source: /roomplan|capturedroom/i.test(String(data.format || data.type || "")) || data.capturedRoom ? "Apple RoomPlan" : "Room scan",
    cad,
    wallCount: lines.length,
    droppedCount: rawWalls.length - lines.length,
    openingCount: doors.length + windows.length,
    objectCount: objects.length,
    averageConfidence: confidence.length ? confidence.reduce((a, b) => a + b, 0) / confidence.length : null,
    lowConfidenceCount: confidence.filter((c) => c < 0.5).length,
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
  const lines = dropDegenerateLines(clean.map((p, i) => ({
    a: { ...p }, b: { ...clean[(i + 1) % clean.length] }, height, thickness,
    // an AR trace measures corners, never wall sections
    nominalThickness: true, layer: "ar-scan",
  })));
  if (lines.length < 3) throw new RoomScanError("no-walls", "Mark at least three room corners");
  return {
    source: "WebXR AR",
    cad: moveToPositive({ lines, doors: [], windows: [], objects: [] }),
    wallCount: lines.length,
    droppedCount: 0,
    openingCount: 0,
    objectCount: 0,
    averageConfidence: null,
    lowConfidenceCount: 0,
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
    /* Thickness is a horizontal measurement, so a mis-scaled capture really
       does get it wrong and it scales with the rest. A nominal section was
       never measured, though: scaling that constant just invents a wall
       thickness the tape said nothing about. */
    if (line.thickness && !line.nominalThickness) line.thickness *= k;
    if (vertical && line.height) line.height *= k;
  });
  (result.cad.doors || []).concat(result.cad.windows || []).forEach((op) => {
    op.center = scalePoint(op.center, k, ox, oz);
    if (op.width) op.width *= k;
    if (vertical && op.height) op.height *= k;
    if (vertical && op.sill) op.sill *= k;
  });
  // furniture was measured by the same mis-scaled capture as the walls
  (result.cad.objects || []).forEach((o) => {
    o.center = scalePoint(o.center, k, ox, oz);
    o.w *= k; o.d *= k;
    if (vertical) o.h *= k;
  });
  result.scaleFactor = (result.scaleFactor || 1) * k;
  return result;
}

/* A corner tapped in AR is the INSIDE face of the wall, so the captured loop
   is half a wall thickness inside the centre-lines the planner stores. Using
   it directly leaves every room that much short in each direction.

   RoomPlan's own convention is NOT verified here: its wall surfaces are planes
   fitted to what the camera saw, which argues for the visible face, but that
   has not been checked against a real CapturedRoom export on a device. The
   import therefore defaults to no offset and leaves the choice to the user,
   rather than moving everyone's walls on an assumption. Push each edge out along its own
   normal (negative `sign` pulls in) and re-cut the corners.

   Corner re-cutting only makes sense between edges that genuinely meet, so the
   loop is rebuilt from shared endpoints rather than assumed from array order:
   a RoomPlan export that lists two opposite walls consecutively would
   otherwise be intersected corner-to-corner and come out as garbage. */
export function insetScan(result, sign) {
  const lines = result && result.cad && result.cad.lines || [];
  if (lines.length < 3) return result;
  const dir = sign < 0 ? -1 : 1;
  const chain = loopOrder(lines, loopTolerance(lines));
  // an unordered or open set still gets the offset, just without sharp corners
  const seq = chain || lines.map((line, index) => ({ index, a: line.a, b: line.b, flip: false }));
  // signed area tells us which way the loop winds, so "outward" is consistent
  let area = 0;
  seq.forEach((s) => { area += s.a.x * s.b.z - s.b.x * s.a.z; });
  const wind = area >= 0 ? 1 : -1;
  const moved = seq.map((s) => {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z;
    const len = Math.hypot(dx, dz) || 1;
    const off = ((lines[s.index].thickness || 10) / 2) * dir * wind;
    // left normal of the edge, scaled to half the wall
    const normal = { x: (dz / len) * off, z: (-dx / len) * off };
    return {
      index: s.index, flip: s.flip, normal, src: { a: s.a, b: s.b },
      a: { x: s.a.x + normal.x, z: s.a.z + normal.z },
      b: { x: s.b.x + normal.x, z: s.b.z + normal.z },
    };
  });
  if (chain) {
    // re-close the loop on the offset edges so corners stay sharp
    moved.forEach((cur, i) => {
      const prev = moved[(i - 1 + moved.length) % moved.length];
      const hit = intersect(prev.a, prev.b, cur.a, cur.b);
      if (!hit) return; // parallel neighbours have no corner; keep the offsets
      prev.b = { x: hit.x, z: hit.z };
      cur.a = { x: hit.x, z: hit.z };
    });
  }
  /* An opening lives in the same face as its wall. Left where it was, it ends
     up half a thickness proud of the wall it belongs to, which is enough for
     the importer to fail to match it back. Carry it on the same normal. */
  (result.cad.doors || []).concat(result.cad.windows || []).forEach((op) => {
    if (!op || !op.center) return;
    let best = null, bestD = Infinity;
    moved.forEach((m) => {
      const hit = pointSegmentDistance(op.center, m.src.a, m.src.b);
      if (hit.d < bestD) { bestD = hit.d; best = m; }
    });
    if (best) op.center = { x: op.center.x + best.normal.x, z: op.center.z + best.normal.z };
  });
  /* Furniture stays put: this offset moves the wall from its measured face to
     its centre-line, which says nothing about where the bed was. */
  writeLoop(lines, moved);
  result.faceOffset = (result.faceOffset || 0) + dir;
  return result;
}

/* A corner tapped by hand in AR is never square: a normal living room comes
   back one to three degrees out on each wall, which reads as a visibly skewed
   plan and leaves furniture unable to sit flush. Snap every edge that is close
   to the room's own dominant axis onto that grid, then re-cut the corners from
   the straightened edges. A genuinely oblique wall sits outside the tolerance
   and keeps its measured direction. */
export function squareScan(result, toleranceDeg = 12) {
  const lines = result && result.cad && result.cad.lines || [];
  if (lines.length < 3) return result;
  const chain = loopOrder(lines, loopTolerance(lines));
  if (!chain) return result; // nothing safe to square without real corners
  const tol = Math.max(0, number(toleranceDeg, 12)) * Math.PI / 180;
  /* Dominant orientation: a length-weighted circular mean of the edge angles
     folded onto a quarter turn, so all four walls of a rectangle vote for the
     same grid and the long walls carry more weight than a short jog. */
  let sx = 0, sz = 0;
  chain.forEach((s) => {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    const ang = Math.atan2(s.b.z - s.a.z, s.b.x - s.a.x);
    sx += Math.cos(ang * 4) * len; sz += Math.sin(ang * 4) * len;
  });
  if (!sx && !sz) return result;
  const quarter = Math.PI / 2;
  /* atan2/4 folds the vote onto a quarter turn, so `base` is how far the room
     is rotated off the world grid. A trace that is only a degree or two off is
     almost always meant to be axis-aligned — every other tool in the planner
     works on that grid — so absorb the tilt rather than preserving it. A room
     deliberately traced on a diagonal falls outside the tolerance and keeps
     its own orientation, with its walls squared to each other. */
  const rawBase = Math.atan2(sz, sx) / 4;
  let base = rawBase;
  if (Math.abs(base) <= tol) base = 0;
  const EPS_ANGLE = 1e-9;
  let snapped = 0;
  const seq = chain.map((s) => {
    const len = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z);
    const ang = Math.atan2(s.b.z - s.a.z, s.b.x - s.a.x);
    const target = base + Math.round((ang - base) / quarter) * quarter;
    const delta = Math.abs(target - ang);
    // dust below EPS_ANGLE is not a correction; counting it reports work
    // that never happened on a capture that was already square
    const use = delta <= tol && delta > EPS_ANGLE ? target : ang;
    if (use !== ang) snapped++;
    return {
      index: s.index, flip: s.flip, a: s.a, b: s.b, len,
      mid: { x: (s.a.x + s.b.x) / 2, z: (s.a.z + s.b.z) / 2 },
      dir: { x: Math.cos(use), z: Math.sin(use) },
    };
  });
  if (!snapped) return result;
  // corners are where the straightened edge lines now cross
  const far = (s, k) => ({ x: s.mid.x + s.dir.x * s.len * k, z: s.mid.z + s.dir.z * s.len * k });
  const corners = seq.map((cur, i) => {
    const prev = seq[(i - 1 + seq.length) % seq.length];
    const hit = intersect(far(prev, -1), far(prev, 1), far(cur, -1), far(cur, 1));
    /* Two nearly-parallel neighbours cross a long way from the room. Rather
       than fling a corner across the plan, keep the measured one. */
    const limit = Math.max(30, Math.min(prev.len, cur.len));
    if (!hit || Math.hypot(hit.x - cur.a.x, hit.z - cur.a.z) > limit) return { x: cur.a.x, z: cur.a.z };
    return hit;
  });
  const openings = (result.cad.doors || []).concat(result.cad.windows || []);
  // remember where each opening sat along its wall before the wall moved
  const held = openings.map((op) => {
    if (!op || !op.center) return null;
    let best = null, bestD = Infinity;
    seq.forEach((s, i) => {
      const hit = pointSegmentDistance(op.center, s.a, s.b);
      if (hit.d < bestD) { bestD = hit.d; best = { i, t: hit.t }; }
    });
    return best;
  });
  /* Absorbing the room's tilt is a rigid rotation of everything inside it —
     leave the furniture behind and a squared scan hands back a room whose bed
     is at an angle to its own walls. */
  const spin = base - rawBase;
  const objects = result.cad.objects || [];
  if (spin && objects.length) {
    let px = 0, pz = 0;
    seq.forEach((s) => { px += s.a.x; pz += s.a.z; });
    px /= seq.length; pz /= seq.length;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    objects.forEach((o) => {
      const dx = o.center.x - px, dz = o.center.z - pz;
      o.center = { x: px + dx * cs - dz * sn, z: pz + dx * sn + dz * cs };
      o.rot = (o.rot || 0) + spin * 180 / Math.PI;
    });
  }
  seq.forEach((s, i) => { s.a = corners[i]; s.b = corners[(i + 1) % seq.length]; });
  openings.forEach((op, k) => {
    const at = held[k];
    if (!at) return;
    const s = seq[at.i];
    op.center = { x: s.a.x + (s.b.x - s.a.x) * at.t, z: s.a.z + (s.b.z - s.a.z) * at.t };
  });
  writeLoop(lines, seq);
  result.squaredCount = snapped;
  return result;
}

/* A trace whose corners were tapped out of order comes back as a bowtie: the
   walls still measure plausibly and the preview still looks like a room, so
   the mistake is only obvious once it is a plan. Report it instead. */
export function scanSelfIntersects(result) {
  const lines = result && result.cad && result.cad.lines || [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (segmentsCross(lines[i], lines[j])) return true;
    }
  }
  return false;
}

function segmentsCross(u, v) {
  const shared = [u.a, u.b].some((p) => [v.a, v.b].some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 1));
  if (shared) return false; // neighbours are supposed to touch at a corner
  const side = (a, b, p) => Math.sign((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
  const d1 = side(u.a, u.b, v.a), d2 = side(u.a, u.b, v.b);
  const d3 = side(v.a, v.b, u.a), d4 = side(v.a, v.b, u.b);
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
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
  (result.cad.objects || []).forEach((o) => { o.center.x += dx; o.center.z += dz; });
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

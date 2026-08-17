// Pure plan/section helpers for straight, circular and special walls.
//
// Coordinates are expressed in the application's x/z plan plane and `s` is
// always centre-line distance from the wall's a end.  The module deliberately
// has no state import so it can be used by persistence, snapping and mesh code
// without creating a dependency cycle.

const EPS = 1e-9;
const TAU = Math.PI * 2;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function number(value) {
  if (finite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return finite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function modTau(angle) {
  const result = angle % TAU;
  return result < 0 ? result + TAU : result;
}

function point(value) {
  if (!value || typeof value !== "object") return null;
  const x = number(value.x);
  const z = number(value.z ?? value.y);
  return x == null || z == null ? null : { x, z };
}

function nodePoint(nodes, reference) {
  const direct = point(reference);
  if (direct) return direct;
  if (reference == null || nodes == null) return null;

  let value = null;
  if (nodes instanceof Map) value = nodes.get(reference);
  else if (Array.isArray(nodes)) {
    value = nodes[reference];
    if (!value) value = nodes.find((candidate) => candidate && candidate.id === reference);
  } else if (typeof nodes === "object") value = nodes[reference];
  return point(value);
}

function curveSpec(wall) {
  if (!wall || typeof wall !== "object") return {};
  if (wall.curve && typeof wall.curve === "object") return wall.curve;
  if (wall.geometry && typeof wall.geometry === "object") return wall.geometry;
  return wall;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = number(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function centerPoint(wall, spec, nodes) {
  const direct = nodePoint(nodes, spec.center ?? spec.c ?? wall.center ?? wall.c);
  if (direct) return direct;
  const x = firstNumber(spec.cx, spec.centerX, wall.cx, wall.centerX);
  const z = firstNumber(spec.cz, spec.centerZ, wall.cz, wall.centerZ);
  return x == null || z == null ? null : { x, z };
}

function directionSign(wall, spec) {
  const explicitSweep = firstNumber(spec.sweep, spec.sweepAngle, wall.sweep, wall.sweepAngle);
  if (explicitSweep != null && Math.abs(explicitSweep) > EPS) return Math.sign(explicitSweep);
  const clockwise = spec.clockwise ?? spec.cw ?? wall.clockwise ?? wall.cw;
  if (typeof clockwise === "boolean") return clockwise ? -1 : 1;
  const direction = String(spec.direction ?? wall.direction ?? "").toLowerCase();
  if (direction === "cw" || direction === "clockwise") return -1;
  if (direction === "ccw" || direction === "counterclockwise" || direction === "anticlockwise") return 1;
  return 0;
}

function requestedLargeArc(wall, spec) {
  if (typeof spec.largeArc === "boolean") return spec.largeArc;
  if (typeof wall.largeArc === "boolean") return wall.largeArc;
  const sweep = firstNumber(spec.sweep, spec.sweepAngle, wall.sweep, wall.sweepAngle);
  return sweep != null ? Math.abs(sweep) > Math.PI + EPS : null;
}

function sweepBetween(startAngle, endAngle, wantedSign, largeArc) {
  let positive = modTau(endAngle - startAngle);
  if (positive < EPS || TAU - positive < EPS) return 0;
  let sweep;
  if (wantedSign > 0) sweep = positive;
  else if (wantedSign < 0) sweep = positive - TAU;
  else sweep = positive <= Math.PI ? positive : positive - TAU;

  if (largeArc === true && Math.abs(sweep) < Math.PI - EPS)
    sweep += sweep > 0 ? -TAU : TAU;
  else if (largeArc === false && Math.abs(sweep) > Math.PI + EPS)
    sweep += sweep > 0 ? -TAU : TAU;
  return sweep;
}

function lineGeometry(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length <= EPS) return null;
  return {
    kind: "line",
    type: "line",
    a,
    b,
    bulge: 0,
    dx,
    dz,
    chord: length,
    length,
    L: length,
    ux: dx / length,
    uz: dz / length,
    ang: Math.atan2(dz, dx),
  };
}

function arcFromBulge(a, b, bulge) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const chord = Math.hypot(dx, dz);
  if (chord <= EPS || !finite(bulge) || Math.abs(bulge) <= EPS) return null;

  const sweep = 4 * Math.atan(bulge);
  if (Math.abs(sweep) <= EPS || Math.abs(sweep) >= TAU - EPS) return null;
  const centerOffset = (chord * (1 - bulge * bulge)) / (4 * bulge);
  const center = {
    x: (a.x + b.x) / 2 + (-dz / chord) * centerOffset,
    z: (a.z + b.z) / 2 + (dx / chord) * centerOffset,
  };
  const radius = (chord * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const startAngle = Math.atan2(a.z - center.z, a.x - center.x);
  return {
    kind: "arc",
    type: "arc",
    a,
    b,
    center,
    cx: center.x,
    cz: center.z,
    radius,
    r: radius,
    bulge,
    sweep,
    startAngle,
    endAngle: startAngle + sweep,
    clockwise: sweep < 0,
    largeArc: Math.abs(sweep) > Math.PI,
    chord,
    length: radius * Math.abs(sweep),
    L: radius * Math.abs(sweep),
  };
}

function centerFromRadius(a, b, radius, sign, largeArc) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const chord = Math.hypot(dx, dz);
  if (chord <= EPS || radius < chord / 2 - EPS) return null;
  const offset = Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4));
  const sweepSign = sign || 1;
  const side = sweepSign * (largeArc ? -1 : 1);
  return {
    x: (a.x + b.x) / 2 + (-dz / chord) * offset * side,
    z: (a.z + b.z) / 2 + (dx / chord) * offset * side,
  };
}

function arcFromCenter(a, b, center, radiusHint, sign, largeArc) {
  const ra = Math.hypot(a.x - center.x, a.z - center.z);
  const rb = Math.hypot(b.x - center.x, b.z - center.z);
  if (ra <= EPS || rb <= EPS) return null;
  const radius = radiusHint == null ? (ra + rb) / 2 : Math.abs(radiusHint);
  if (radius <= EPS) return null;

  // A centre/radius arc cannot pass through inconsistent endpoints.  A small
  // tolerance permits ordinary JSON and UI rounding without hiding bad data.
  const tolerance = Math.max(1e-6, radius * 1e-5);
  if (Math.abs(ra - radius) > tolerance || Math.abs(rb - radius) > tolerance) return null;

  const startAngle = Math.atan2(a.z - center.z, a.x - center.x);
  const actualEnd = Math.atan2(b.z - center.z, b.x - center.x);
  const sweep = sweepBetween(startAngle, actualEnd, sign, largeArc);
  if (Math.abs(sweep) <= EPS || Math.abs(sweep) >= TAU - EPS) return null;
  const chord = Math.hypot(b.x - a.x, b.z - a.z);
  return {
    kind: "arc",
    type: "arc",
    a,
    b,
    center: { x: center.x, z: center.z },
    cx: center.x,
    cz: center.z,
    radius,
    r: radius,
    bulge: Math.tan(sweep / 4),
    sweep,
    startAngle,
    endAngle: startAngle + sweep,
    clockwise: sweep < 0,
    largeArc: Math.abs(sweep) > Math.PI,
    chord,
    length: radius * Math.abs(sweep),
    L: radius * Math.abs(sweep),
  };
}

/**
 * Return one canonical, measured line/arc descriptor or null for an invalid
 * wall.  Invalid curve metadata degrades to the usable endpoint line; callers
 * can therefore open older or partially edited projects safely.
 */
export function normalizeWallGeometry(wall, nodes) {
  if (!wall || typeof wall !== "object") return null;
  const spec = curveSpec(wall);
  const a = nodePoint(nodes, wall.a ?? spec.a);
  const b = nodePoint(nodes, wall.b ?? spec.b);
  const line = a && b ? lineGeometry(a, b) : null;
  if (!line) return null;

  const bulge = firstNumber(spec.bulge, wall.bulge);
  if (bulge != null && Math.abs(bulge) > EPS) return arcFromBulge(a, b, bulge) || line;

  const rawKind = String(
    spec.kind ?? spec.type ?? wall.geometryType ?? wall.curveType ?? "",
  ).toLowerCase();
  const radiusHint = firstNumber(spec.radius, spec.r, wall.radius, wall.r);
  let center = centerPoint(wall, spec, nodes);
  const sign = directionSign(wall, spec);
  const largeArc = requestedLargeArc(wall, spec);
  const wantsArc = rawKind === "arc" || rawKind === "circulararc" || center || radiusHint != null;
  if (!wantsArc) return line;

  if (!center && radiusHint != null)
    center = centerFromRadius(a, b, Math.abs(radiusHint), sign, largeArc === true);
  if (!center) return line;
  return arcFromCenter(a, b, center, radiusHint, sign, largeArc) || line;
}

/** Alias with the naming used by the existing straight-wall geometry API. */
export function wallCurveGeom(wall, nodes) {
  return normalizeWallGeometry(wall, nodes);
}

/** Sample a centre-line point at clamped arc length s. */
export function pointAtWall(wall, s, nodes) {
  const geometry = wallCurveGeom(wall, nodes);
  if (!geometry) return null;
  const distance = clamp(firstNumber(s) ?? 0, 0, geometry.length);
  if (geometry.kind === "line") {
    return {
      x: geometry.a.x + geometry.ux * distance,
      z: geometry.a.z + geometry.uz * distance,
      s: distance,
      t: geometry.length ? distance / geometry.length : 0,
    };
  }
  const angle = geometry.startAngle + geometry.sweep * (distance / geometry.length);
  return {
    x: geometry.center.x + Math.cos(angle) * geometry.radius,
    z: geometry.center.z + Math.sin(angle) * geometry.radius,
    s: distance,
    t: distance / geometry.length,
    angle,
  };
}

/** Return the unit tangent in the wall's a-to-b direction at distance s. */
export function tangentAtWall(wall, s, nodes) {
  const geometry = wallCurveGeom(wall, nodes);
  if (!geometry) return null;
  const distance = clamp(firstNumber(s) ?? 0, 0, geometry.length);
  if (geometry.kind === "line")
    return { x: geometry.ux, z: geometry.uz, ux: geometry.ux, uz: geometry.uz, s: distance };
  const angle = geometry.startAngle + geometry.sweep * (distance / geometry.length);
  const direction = Math.sign(geometry.sweep);
  const x = -Math.sin(angle) * direction;
  const z = Math.cos(angle) * direction;
  return { x, z, ux: x, uz: z, s: distance, angle };
}

function directedAngleFromStart(angle, geometry) {
  return geometry.sweep > 0
    ? modTau(angle - geometry.startAngle)
    : -modTau(geometry.startAngle - angle);
}

/** Find the nearest point on the finite wall centre-line. */
export function projectToWall(wall, x, z, nodes) {
  const qx = number(x);
  const qz = number(z);
  const geometry = wallCurveGeom(wall, nodes);
  if (!geometry || qx == null || qz == null) return null;

  let s;
  if (geometry.kind === "line") {
    s = clamp((qx - geometry.a.x) * geometry.ux + (qz - geometry.a.z) * geometry.uz, 0, geometry.length);
  } else {
    const vx = qx - geometry.center.x;
    const vz = qz - geometry.center.z;
    const radialLength = Math.hypot(vx, vz);
    let inside = false;
    if (radialLength > EPS) {
      const angle = Math.atan2(vz, vx);
      const delta = directedAngleFromStart(angle, geometry);
      inside = geometry.sweep > 0
        ? delta >= -EPS && delta <= geometry.sweep + EPS
        : delta <= EPS && delta >= geometry.sweep - EPS;
      if (inside) s = clamp(Math.abs(delta) * geometry.radius, 0, geometry.length);
    }
    if (!inside) {
      const da = Math.hypot(qx - geometry.a.x, qz - geometry.a.z);
      const db = Math.hypot(qx - geometry.b.x, qz - geometry.b.z);
      s = da <= db ? 0 : geometry.length;
    }
  }

  const projected = pointAtWall(wall, s, nodes);
  const tangent = tangentAtWall(wall, s, nodes);
  const dx = qx - projected.x;
  const dz = qz - projected.z;
  const distance = Math.hypot(dx, dz);
  return {
    x: projected.x,
    z: projected.z,
    s,
    t: geometry.length ? s / geometry.length : 0,
    distance,
    d: distance,
    signedOffset: tangent.x * dz - tangent.z * dx,
    point: { x: projected.x, z: projected.z },
    tangent: { x: tangent.x, z: tangent.z },
  };
}

/**
 * Return a simple closed polygon: the left face from a to b, followed by the
 * right face from b to a. Circular offsets are exact concentric samples.
 */
export function curvedWallOutline(wall, thickness, nodes, segments) {
  const geometry = wallCurveGeom(wall, nodes);
  if (!geometry) return [];
  const suppliedThickness = firstNumber(thickness, wall && wall.thickness);
  const half = Math.max(0, suppliedThickness ?? 0) / 2;
  const count = geometry.kind === "line"
    ? 1
    : Math.max(2, Math.floor(firstNumber(segments) ?? Math.ceil(Math.abs(geometry.sweep) / (Math.PI / 24))));
  const left = [];
  const right = [];
  for (let index = 0; index <= count; index++) {
    const s = (geometry.length * index) / count;
    const p = pointAtWall(wall, s, nodes);
    const tangent = tangentAtWall(wall, s, nodes);
    const nx = -tangent.z;
    const nz = tangent.x;
    left.push({ x: p.x + nx * half, z: p.z + nz * half });
    right.push({ x: p.x - nx * half, z: p.z - nz * half });
  }
  return left.concat(right.reverse());
}

/** Construct the unique circular arc from start, through, end. */
export function makeArcFromThreePoints(aValue, throughValue, bValue) {
  const a = point(aValue);
  const through = point(throughValue);
  const b = point(bValue);
  if (!a || !through || !b) return null;

  const determinant = 2 * (
    a.x * (through.z - b.z) +
    through.x * (b.z - a.z) +
    b.x * (a.z - through.z)
  );
  const scale = Math.max(
    1,
    Math.hypot(through.x - a.x, through.z - a.z),
    Math.hypot(b.x - through.x, b.z - through.z),
  );
  if (Math.abs(determinant) <= EPS * scale * scale) return null;

  const aa = a.x * a.x + a.z * a.z;
  const mm = through.x * through.x + through.z * through.z;
  const bb = b.x * b.x + b.z * b.z;
  const center = {
    x: (aa * (through.z - b.z) + mm * (b.z - a.z) + bb * (a.z - through.z)) / determinant,
    z: (aa * (b.x - through.x) + mm * (a.x - b.x) + bb * (through.x - a.x)) / determinant,
  };
  const radius = Math.hypot(a.x - center.x, a.z - center.z);
  const startAngle = Math.atan2(a.z - center.z, a.x - center.x);
  const middleAngle = Math.atan2(through.z - center.z, through.x - center.x);
  const endAngle = Math.atan2(b.z - center.z, b.x - center.x);
  const positiveToEnd = modTau(endAngle - startAngle);
  const positiveToMiddle = modTau(middleAngle - startAngle);
  const sweep = positiveToMiddle <= positiveToEnd + EPS
    ? positiveToEnd
    : positiveToEnd - TAU;
  if (Math.abs(sweep) <= EPS || Math.abs(sweep) >= TAU - EPS) return null;
  return {
    kind: "arc",
    type: "arc",
    a,
    b,
    through,
    center,
    cx: center.x,
    cz: center.z,
    radius,
    r: radius,
    sweep,
    bulge: Math.tan(sweep / 4),
    clockwise: sweep < 0,
    largeArc: Math.abs(sweep) > Math.PI,
    startAngle,
    endAngle: startAngle + sweep,
    chord: Math.hypot(b.x - a.x, b.z - a.z),
    length: radius * Math.abs(sweep),
    L: radius * Math.abs(sweep),
  };
}

function linePoints(line) {
  if (Array.isArray(line)) return line.length >= 2 ? [point(line[0]), point(line[1])] : null;
  if (!line || typeof line !== "object") return null;
  const a = point(line.a ?? line.start ?? line.from);
  const b = point(line.b ?? line.end ?? line.to);
  return a && b ? [a, b] : null;
}

function segmentParameter(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  return lengthSquared <= EPS ? NaN : ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSquared;
}

/**
 * Fillet two directed segments. By default line 1 arrives at its `b` end and
 * line 2 leaves from its `a` end. `options.extend` permits tangencies outside
 * the finite segments; `line1Arm`/`line2Arm` may be "a" or "b" to pick the
 * other ray at the intersection.
 */
export function makeTangentArc(line1, line2, radiusValue, options = {}) {
  const first = linePoints(line1);
  const second = linePoints(line2);
  const radius = firstNumber(radiusValue);
  if (!first || !second || radius == null || radius <= EPS) return null;
  const [a0, a1] = first;
  const [b0, b1] = second;
  const adx = a1.x - a0.x;
  const adz = a1.z - a0.z;
  const bdx = b1.x - b0.x;
  const bdz = b1.z - b0.z;
  const cross = adx * bdz - adz * bdx;
  if (Math.abs(cross) <= EPS * Math.max(1, Math.hypot(adx, adz) * Math.hypot(bdx, bdz))) return null;
  const qx = b0.x - a0.x;
  const qz = b0.z - a0.z;
  const ta = (qx * bdz - qz * bdx) / cross;
  const intersection = { x: a0.x + adx * ta, z: a0.z + adz * ta };

  const firstArm = options.line1Arm === "b" ? a1 : a0;
  const secondArm = options.line2Arm === "a" ? b0 : b1;
  const firstLength = Math.hypot(firstArm.x - intersection.x, firstArm.z - intersection.z);
  const secondLength = Math.hypot(secondArm.x - intersection.x, secondArm.z - intersection.z);
  if (firstLength <= EPS || secondLength <= EPS) return null;
  const u1 = { x: (firstArm.x - intersection.x) / firstLength, z: (firstArm.z - intersection.z) / firstLength };
  const u2 = { x: (secondArm.x - intersection.x) / secondLength, z: (secondArm.z - intersection.z) / secondLength };
  const angle = Math.acos(clamp(u1.x * u2.x + u1.z * u2.z, -1, 1));
  if (angle <= EPS || Math.PI - angle <= EPS) return null;
  const tangentDistance = radius / Math.tan(angle / 2);
  if (!finite(tangentDistance)) return null;
  const tangent1 = {
    x: intersection.x + u1.x * tangentDistance,
    z: intersection.z + u1.z * tangentDistance,
  };
  const tangent2 = {
    x: intersection.x + u2.x * tangentDistance,
    z: intersection.z + u2.z * tangentDistance,
  };
  if (!options.extend) {
    const p1 = segmentParameter(tangent1, a0, a1);
    const p2 = segmentParameter(tangent2, b0, b1);
    if (p1 < -EPS || p1 > 1 + EPS || p2 < -EPS || p2 > 1 + EPS) return null;
  }

  const bisectorLength = Math.hypot(u1.x + u2.x, u1.z + u2.z);
  if (bisectorLength <= EPS) return null;
  const centerDistance = radius / Math.sin(angle / 2);
  const center = {
    x: intersection.x + ((u1.x + u2.x) / bisectorLength) * centerDistance,
    z: intersection.z + ((u1.z + u2.z) / bisectorLength) * centerDistance,
  };
  const incoming = { x: -u1.x, z: -u1.z };
  const turn = incoming.x * u2.z - incoming.z * u2.x;
  const startAngle = Math.atan2(tangent1.z - center.z, tangent1.x - center.x);
  const endAngle = Math.atan2(tangent2.z - center.z, tangent2.x - center.x);
  const sweep = sweepBetween(startAngle, endAngle, Math.sign(turn), false);
  if (Math.abs(sweep) <= EPS) return null;
  return {
    kind: "arc",
    type: "arc",
    a: tangent1,
    b: tangent2,
    center,
    cx: center.x,
    cz: center.z,
    radius,
    r: radius,
    sweep,
    bulge: Math.tan(sweep / 4),
    clockwise: sweep < 0,
    largeArc: false,
    startAngle,
    endAngle: startAngle + sweep,
    length: radius * Math.abs(sweep),
    L: radius * Math.abs(sweep),
    chord: Math.hypot(tangent2.x - tangent1.x, tangent2.z - tangent1.z),
    intersection,
    tangent1,
    tangent2,
    tangentDistance,
    trim1: tangentDistance,
    trim2: tangentDistance,
  };
}

function reverseDirectionFields(target) {
  if (!target || typeof target !== "object") return target;
  const result = { ...target };
  if (number(result.bulge) != null) result.bulge = -number(result.bulge);
  if (number(result.sweep) != null) result.sweep = -number(result.sweep);
  if (number(result.sweepAngle) != null) result.sweepAngle = -number(result.sweepAngle);
  if (typeof result.clockwise === "boolean") result.clockwise = !result.clockwise;
  if (typeof result.cw === "boolean") result.cw = !result.cw;
  if (typeof result.direction === "string") {
    const direction = result.direction.toLowerCase();
    if (direction === "cw" || direction === "clockwise") result.direction = direction === "cw" ? "ccw" : "counterclockwise";
    else if (direction === "ccw" || direction === "counterclockwise" || direction === "anticlockwise")
      result.direction = direction === "ccw" ? "cw" : "clockwise";
  }
  return result;
}

function profileLengthHint(wall) {
  return firstNumber(wall && wall.length, wall && wall.L, wall && wall.curveLength);
}

function reverseProfile(profile, length) {
  if (!Array.isArray(profile)) return profile;
  return profile.slice().reverse().map((entry) => {
    if (Array.isArray(entry)) {
      const copy = entry.slice();
      if (length != null && number(copy[0]) != null) copy[0] = length - number(copy[0]);
      return copy;
    }
    if (!entry || typeof entry !== "object") return entry;
    const copy = { ...entry };
    if (number(copy.t) != null) copy.t = 1 - number(copy.t);
    for (const key of ["s", "distance", "at", "position"])
      if (length != null && number(copy[key]) != null) copy[key] = length - number(copy[key]);
    return copy;
  });
}

/** Return a non-mutating a/b reversal while preserving the physical arc. */
export function reverseWallCurve(wall) {
  if (!wall || typeof wall !== "object") return wall;
  const result = reverseDirectionFields(wall);
  result.a = wall.b;
  result.b = wall.a;
  if (wall.curve && typeof wall.curve === "object") {
    result.curve = reverseDirectionFields(wall.curve);
    if (Object.hasOwn(wall.curve, "a") || Object.hasOwn(wall.curve, "b")) {
      result.curve.a = wall.curve.b;
      result.curve.b = wall.curve.a;
    }
  }
  if (wall.geometry && typeof wall.geometry === "object") {
    result.geometry = reverseDirectionFields(wall.geometry);
    if (Object.hasOwn(wall.geometry, "a") || Object.hasOwn(wall.geometry, "b")) {
      result.geometry.a = wall.geometry.b;
      result.geometry.b = wall.geometry.a;
    }
  }
  const length = profileLengthHint(wall);
  if (Array.isArray(wall.profile)) result.profile = reverseProfile(wall.profile, length);
  if (Array.isArray(wall.heightProfile)) result.heightProfile = reverseProfile(wall.heightProfile, length);
  if (Array.isArray(wall.wallProfile)) result.wallProfile = reverseProfile(wall.wallProfile, length);
  return result;
}

function rawProfile(wall) {
  if (!wall || typeof wall !== "object") return [];
  let profile = wall.profile ?? wall.heightProfile ?? wall.wallProfile ?? [];
  if (profile && !Array.isArray(profile) && typeof profile === "object")
    profile = profile.points ?? profile.top ?? profile.heights ?? [];
  return Array.isArray(profile) ? profile : [];
}

/** Normalize height controls to sorted, absolute `{s, height}` points. */
export function normalizeWallProfile(wall) {
  const length = profileLengthHint(wall);
  const controls = [];
  rawProfile(wall).forEach((entry, index) => {
    let rawS;
    let rawHeight;
    if (Array.isArray(entry)) {
      rawS = entry[0];
      rawHeight = entry[1];
    } else if (entry && typeof entry === "object") {
      rawS = entry.s ?? entry.distance ?? entry.at ?? entry.position;
      if (rawS == null && entry.t != null && length != null) rawS = number(entry.t) * length;
      rawHeight = entry.height ?? entry.h ?? entry.top ?? entry.y;
    }
    let s = number(rawS);
    const height = number(rawHeight);
    if (s == null || height == null) return;
    s = Math.max(0, length == null ? s : Math.min(length, s));
    controls.push({ s, height: Math.max(0, height), _index: index });
  });
  controls.sort((left, right) => left.s - right.s || left._index - right._index);
  const result = [];
  controls.forEach((control) => {
    const previous = result[result.length - 1];
    const clean = { s: control.s, height: control.height };
    if (previous && Math.abs(previous.s - clean.s) <= EPS) result[result.length - 1] = clean;
    else result.push(clean);
  });
  return result;
}

/** Linearly evaluate the wall's editable top profile at centre-line distance s. */
export function wallProfileHeight(wall, s, baseHeight) {
  const base = Math.max(0, firstNumber(baseHeight, wall && wall.height) ?? 0);
  const length = profileLengthHint(wall);
  const at = Math.max(0, length == null ? (firstNumber(s) ?? 0) : clamp(firstNumber(s) ?? 0, 0, length));
  const controls = normalizeWallProfile(wall);
  if (!controls.length) return base;
  const points = controls.slice();
  if (points[0].s > EPS) points.unshift({ s: 0, height: base });
  if (length != null && points[points.length - 1].s < length - EPS) points.push({ s: length, height: base });
  if (at <= points[0].s) return points[0].height;
  for (let index = 1; index < points.length; index++) {
    const right = points[index];
    if (at > right.s) continue;
    const left = points[index - 1];
    const span = right.s - left.s;
    if (span <= EPS) return right.height;
    const t = (at - left.s) / span;
    return left.height + (right.height - left.height) * t;
  }
  return points[points.length - 1].height;
}

/** Canonical special-wall classifier used by persistence and builders. */
export function normalizeWallKind(value) {
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? value.wallKind ?? value.kind ?? value.specialKind ?? value.type
      : "";
  const token = String(candidate ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (token === "roomdivider" || token === "divider" || token === "invisiblewall" || token === "invisible")
    return "roomDivider";
  if (token === "half" || token === "halfwall" || token === "kneewall") return "half";
  if (token === "pony" || token === "ponywall" || token === "splitwall") return "pony";
  if (token === "railing" || token === "rail" || token === "balustrade") return "railing";
  return "normal";
}

function resolveType(resolver, reference, wall, role) {
  if (reference && typeof reference === "object") return reference;
  if (typeof resolver === "function") return resolver(reference, wall, role) ?? null;
  if (resolver instanceof Map) return resolver.get(reference) ?? null;
  if (resolver && typeof resolver === "object") return resolver[reference] ?? null;
  return null;
}

function segment(role, bottom, top, reference, resolver, wall, kind, solid = true) {
  if (top - bottom <= EPS) return null;
  return {
    kind,
    role,
    bottom,
    top,
    y0: bottom,
    y1: top,
    height: top - bottom,
    wallTypeId: reference && typeof reference !== "object" ? reference : null,
    wallType: resolveType(resolver, reference, wall, role),
    solid,
  };
}

/**
 * Expand a normal/half/pony/railing wall into semantic vertical bands. Room
 * dividers intentionally have no physical band. The optional resolver may be
 * a function, Map or id-keyed object.
 */
export function verticalSegments(wall, typeResolver) {
  if (!wall || typeof wall !== "object") return [];
  const kind = normalizeWallKind(wall);
  if (kind === "roomDivider") return [];
  const primary = wall.wallTypeId ?? wall.typeId ?? wall.wallType ?? null;
  const primaryType = resolveType(typeResolver, primary, wall, "body");
  const typeHeight = firstNumber(primaryType && primaryType.height, primaryType && primaryType.defaultHeight);
  let total = Math.max(0, firstNumber(wall.height, typeHeight) ?? 260);

  if (kind === "half") {
    total = Math.max(0, firstNumber(wall.halfHeight, wall.capHeight, wall.height, typeHeight) ?? 100);
    const band = segment("body", 0, total, primary, typeResolver, wall, kind, true);
    return band ? [band] : [];
  }
  if (kind === "pony") {
    const pony = wall.pony && typeof wall.pony === "object" ? wall.pony : {};
    const split = clamp(
      firstNumber(wall.ponyHeight, wall.splitHeight, wall.lowerHeight, pony.height, pony.splitHeight) ?? total / 2,
      0,
      total,
    );
    const lowerRef = wall.lowerWallTypeId ?? wall.lowerTypeId ?? pony.lowerWallTypeId ?? pony.lowerTypeId ?? primary;
    const upperRef = wall.upperWallTypeId ?? wall.upperTypeId ?? pony.upperWallTypeId ?? pony.upperTypeId ?? primary;
    return [
      segment("lower", 0, split, lowerRef, typeResolver, wall, kind, true),
      segment("upper", split, total, upperRef, typeResolver, wall, kind, true),
    ].filter(Boolean);
  }
  if (kind === "railing") {
    total = Math.max(0, firstNumber(wall.railingHeight, wall.railHeight, wall.height) ?? 100);
    const curb = clamp(firstNumber(wall.curbHeight, wall.baseHeight) ?? 0, 0, total);
    const railRef = wall.railingTypeId ?? wall.railTypeId ?? primary;
    return [
      segment("base", 0, curb, primary, typeResolver, wall, kind, true),
      segment("railing", curb, total, railRef, typeResolver, wall, kind, false),
    ].filter(Boolean);
  }
  const band = segment("body", 0, total, primary, typeResolver, wall, kind, true);
  return band ? [band] : [];
}

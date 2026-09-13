// How far an extrude or cut runs. Blind and mid-plane keep the typed depth.
// Through-all, up-to-next and up-to-face (the book's Up To Surface) replace
// that depth with a measured interval along the pull, re-resolved each rebuild
// so a shell that moves still terminates on the same face.
import { frameDot, frameNormalize, framePoint, frameVector } from "./frame.js";

export const UP_TO_FACE_CONDITIONS = new Set(["up-to-face", "up-to-surface"]);
export const UP_TO_FACE_MISSING = "Up to surface requires a selected face";
export const UP_TO_FACE_MISSED = "The selected face is not in the extrusion direction";
export const UP_TO_NEXT_MISSED = "Up to next never meets a face along the extrusion";

const NEAR = 1e-4;
const PAD = 1e-3;

export function isUpToFace(condition) {
  return UP_TO_FACE_CONDITIONS.has(String(condition || ""));
}

export function endConditionHidesDepth(condition) {
  const value = String(condition || "blind");
  return value === "through-all" || value === "up-to-next" || isUpToFace(value);
}

export function extrusionAxisVector(params = {}) {
  if (params.frame?.normal) return frameNormalize(params.frame.normal);
  const axis = params.axis || "y";
  if (axis === "x") return { x: 1, y: 0, z: 0 };
  if (axis === "z") return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 1, z: 0 };
}

export function extrusionMapPoint(params, u = 0, v = 0, w = 0) {
  if (params?.frame) return framePoint(params.frame, u, v, w);
  const axis = params?.axis || "y";
  if (axis === "z") return { x: Number(u) || 0, y: Number(v) || 0, z: Number(w) || 0 };
  if (axis === "x") return { x: Number(w) || 0, y: Number(v) || 0, z: Number(u) || 0 };
  return { x: Number(u) || 0, y: Number(w) || 0, z: Number(v) || 0 };
}

export function aabbFromBox(box) {
  if (!box) return null;
  if (box.min && box.max) {
    return {
      min: { x: Number(box.min.x) || 0, y: Number(box.min.y) || 0, z: Number(box.min.z) || 0 },
      max: { x: Number(box.max.x) || 0, y: Number(box.max.y) || 0, z: Number(box.max.z) || 0 },
    };
  }
  if (Number.isFinite(box.x0) && Number.isFinite(box.y0) && Number.isFinite(box.z0)) {
    return {
      min: { x: box.x0, y: box.y0, z: box.z0 },
      max: { x: box.x1, y: box.y1, z: box.z1 },
    };
  }
  return null;
}

export function aabbFromTopology(entries = []) {
  let min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  let found = false;
  for (const entry of entries || []) {
    const box = aabbFromBox(entry?.descriptor?.bounds) || aabbFromBox(entry?.bounds);
    const origin = entry?.descriptor?.origin || entry?.descriptor?.center || entry?.origin;
    if (box) {
      found = true;
      min.x = Math.min(min.x, box.min.x); min.y = Math.min(min.y, box.min.y); min.z = Math.min(min.z, box.min.z);
      max.x = Math.max(max.x, box.max.x); max.y = Math.max(max.y, box.max.y); max.z = Math.max(max.z, box.max.z);
    } else if (origin) {
      found = true;
      min.x = Math.min(min.x, origin.x); min.y = Math.min(min.y, origin.y); min.z = Math.min(min.z, origin.z);
      max.x = Math.max(max.x, origin.x); max.y = Math.max(max.y, origin.y); max.z = Math.max(max.z, origin.z);
    }
  }
  return found ? { min, max } : null;
}

export function farBoundAlongAxis(bounds, origin, direction) {
  const box = aabbFromBox(bounds);
  if (!box) return null;
  const o = frameVector(origin), d = frameNormalize(direction);
  let far = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    far = Math.max(far, (x - o.x) * d.x + (y - o.y) * d.y + (z - o.z) * d.z);
  }
  return Number.isFinite(far) ? far : null;
}

export function faceSurface(face) {
  if (!face) return null;
  return face.descriptor || (face.origin || face.normal || face.axis ? face : null);
}

export function raySurfaceHit(origin, direction, surface) {
  const geom = faceSurface(surface);
  if (!geom) return null;
  const kind = geom.surface || (geom.normal && !geom.axis ? "plane" : geom.axis && Number(geom.radius) > 0 ? "cylinder" : null);
  if (kind === "plane" || (geom.normal && kind !== "cylinder" && kind !== "cone")) {
    return rayPlane(origin, direction, geom.origin, geom.normal);
  }
  if (kind === "cylinder" || (geom.axis && Number.isFinite(Number(geom.radius)) && !Number.isFinite(Number(geom.angle)))) {
    return rayCylinder(origin, direction, geom.origin, geom.axis, Number(geom.radius));
  }
  if (kind === "cone" || Number.isFinite(Number(geom.angle))) {
    return rayCone(origin, direction, geom.origin, geom.axis, Number(geom.radius), Number(geom.angle));
  }
  return null;
}

export function resolvedEndFace(params, resolutions = []) {
  const wanted = params?.endFace;
  if (!wanted) return null;
  const wantedId = wanted.persistentId;
  const hit = (resolutions || []).find((entry) => {
    const ref = entry?.reference;
    if (ref === wanted) return true;
    if (wantedId && (ref?.persistentId === wantedId || entry?.topology?.persistentId === wantedId)) return true;
    return false;
  });
  return hit?.topology || wanted;
}

export function resolveExtrudeExtent(params, options = {}) {
  const condition = params?.endCondition || "blind";
  if (condition === "blind" || condition === "mid-plane" || !condition) return params;
  const reverse = params.direction === "reverse" ? -1 : 1;
  const from = Number.isFinite(Number(params.from)) ? Number(params.from) : (Number(params.offset) || 0);
  const axis = extrusionAxisVector(params);
  const pull = { x: axis.x * reverse, y: axis.y * reverse, z: axis.z * reverse };
  const samples = profileSamples(params);
  let distance;
  if (isUpToFace(condition)) {
    const face = options.endFace || resolvedEndFace(params, options.resolutions);
    if (!faceSurface(face)) throw new Error(UP_TO_FACE_MISSING);
    distance = firstHit(samples, from, params, pull, [face], { skipNear: true });
    if (!(distance > NEAR)) throw new Error(UP_TO_FACE_MISSED);
  } else if (condition === "up-to-next") {
    const faces = (options.hostFaces || []).filter((entry) => (entry?.kind || "face") === "face");
    distance = firstHit(samples, from, params, pull, faces, { skipNear: true });
    if (!(distance > NEAR)) throw new Error(UP_TO_NEXT_MISSED);
  } else if (condition === "through-all") {
    const bounds = aabbFromBox(options.hostBounds) || aabbFromTopology(options.hostFaces);
    if (!bounds) return params;
    const start = extrusionMapPoint(params, samples[0]?.u || 0, samples[0]?.v || 0, from);
    const far = farBoundAlongAxis(bounds, start, pull);
    if (!(far > NEAR)) return params;
    distance = far + PAD;
  } else {
    return params;
  }
  return { ...params, from, to: from + reverse * distance };
}

function profileSamples(params) {
  const points = (params.points || []).map((point) => ({ u: Number(point.u ?? point.x) || 0, v: Number(point.v ?? point.y) || 0 }));
  if (!points.length) return [{ u: 0, v: 0 }];
  const centroid = points.reduce((sum, point) => ({ u: sum.u + point.u, v: sum.v + point.v }), { u: 0, v: 0 });
  centroid.u /= points.length;
  centroid.v /= points.length;
  return [centroid, ...points];
}

function firstHit(samples, from, params, pull, faces, options = {}) {
  let best = Infinity;
  for (const sample of samples) {
    const origin = extrusionMapPoint(params, sample.u, sample.v, from);
    for (const face of faces || []) {
      const hit = raySurfaceHit(origin, pull, face);
      if (!Number.isFinite(hit)) continue;
      if (options.skipNear && hit < NEAR) continue;
      if (hit > NEAR && hit < best) best = hit;
    }
  }
  return Number.isFinite(best) ? best : null;
}

function rayPlane(origin, direction, planeOrigin, planeNormal) {
  if (!planeOrigin || !planeNormal) return null;
  const normal = frameNormalize(planeNormal);
  const denom = frameDot(direction, normal);
  if (Math.abs(denom) < 1e-9) return null;
  return frameDot({
    x: (planeOrigin.x || 0) - (origin.x || 0),
    y: (planeOrigin.y || 0) - (origin.y || 0),
    z: (planeOrigin.z || 0) - (origin.z || 0),
  }, normal) / denom;
}

function rayCylinder(origin, direction, cylOrigin, cylAxis, radius) {
  if (!(radius > 0) || !cylOrigin || !cylAxis) return null;
  const axis = frameNormalize(cylAxis);
  const w = {
    x: (origin.x || 0) - (cylOrigin.x || 0),
    y: (origin.y || 0) - (cylOrigin.y || 0),
    z: (origin.z || 0) - (cylOrigin.z || 0),
  };
  const dPerp = perp(direction, axis), wPerp = perp(w, axis);
  const a = frameDot(dPerp, dPerp), b = 2 * frameDot(dPerp, wPerp), c = frameDot(wPerp, wPerp) - radius * radius;
  return smallestPositiveRoot(a, b, c);
}

function rayCone(origin, direction, coneOrigin, coneAxis, radius, angle) {
  if (!coneOrigin || !coneAxis) return null;
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-9) return rayCylinder(origin, direction, coneOrigin, coneAxis, radius);
  const axis = frameNormalize(coneAxis);
  const tanA = Math.tan(angle);
  if (!Number.isFinite(tanA) || Math.abs(tanA) < 1e-12) return rayCylinder(origin, direction, coneOrigin, coneAxis, radius);
  const along = Number.isFinite(radius) ? radius / tanA : 0;
  const apex = { x: (coneOrigin.x || 0) - axis.x * along, y: (coneOrigin.y || 0) - axis.y * along, z: (coneOrigin.z || 0) - axis.z * along };
  const cosA = Math.cos(angle), c2 = cosA * cosA;
  const v = { x: (origin.x || 0) - apex.x, y: (origin.y || 0) - apex.y, z: (origin.z || 0) - apex.z };
  const dU = frameDot(direction, axis), vU = frameDot(v, axis);
  const dD = frameDot(direction, direction), vD = frameDot(v, direction), vV = frameDot(v, v);
  return smallestPositiveRoot(dU * dU - dD * c2, 2 * (vU * dU - vD * c2), vU * vU - vV * c2);
}

function perp(vector, axis) {
  const amount = frameDot(vector, axis);
  return { x: (vector.x || 0) - axis.x * amount, y: (vector.y || 0) - axis.y * amount, z: (vector.z || 0) - axis.z * amount };
}

function smallestPositiveRoot(a, b, c) {
  const roots = [];
  if (Math.abs(a) < 1e-14) {
    if (Math.abs(b) > 1e-14) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    roots.push((-b - sqrt) / (2 * a), (-b + sqrt) / (2 * a));
  }
  const positive = roots.filter((root) => Number.isFinite(root) && root > NEAR);
  return positive.length ? Math.min(...positive) : null;
}

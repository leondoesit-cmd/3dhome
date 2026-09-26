// Orthonormal local frames shared by sketches, analytic topology and the exact
// kernel.  Sketch coordinates are always (u, v); features add w along normal.

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function frameVector(value = {}) {
  return { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
}

export function frameDot(a, b) {
  return finite(a?.x) * finite(b?.x) + finite(a?.y) * finite(b?.y) + finite(a?.z) * finite(b?.z);
}

export function frameCross(a, b) {
  return {
    x: finite(a?.y) * finite(b?.z) - finite(a?.z) * finite(b?.y),
    y: finite(a?.z) * finite(b?.x) - finite(a?.x) * finite(b?.z),
    z: finite(a?.x) * finite(b?.y) - finite(a?.y) * finite(b?.x),
  };
}

export function frameNormalize(value, fallback = { x: 0, y: 0, z: 1 }) {
  const vector = frameVector(value), length = Math.hypot(vector.x, vector.y, vector.z);
  if (length < 1e-9) return frameVector(fallback);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function projectedAxis(seed, normal) {
  const amount = frameDot(seed, normal);
  return frameNormalize({ x: seed.x - normal.x * amount, y: seed.y - normal.y * amount, z: seed.z - normal.z * amount });
}

export function frameFromPlane(origin, normal, preferredXAxis) {
  const n = frameNormalize(normal, { x: 0, y: 1, z: 0 });
  let seed = preferredXAxis && Math.abs(frameDot(frameNormalize(preferredXAxis), n)) < 0.98
    ? frameNormalize(preferredXAxis)
    : Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: n.x >= 0 ? -1 : 1 };
  let xAxis = projectedAxis(seed, n);
  // Keep elevation sketches upright when the face normal points backward.
  if (Math.abs(n.z) > 0.995 && xAxis.x * n.z < 0) xAxis = { x: -xAxis.x, y: -xAxis.y, z: -xAxis.z };
  const yAxis = frameNormalize(frameCross(n, xAxis), { x: 0, y: 1, z: 0 });
  return { origin: frameVector(origin), xAxis, yAxis, normal: n };
}

export function framePoint(frame, u = 0, v = 0, w = 0) {
  const basis = frame || frameFromPlane({}, { x: 0, y: 1, z: 0 });
  return {
    x: finite(basis.origin?.x) + basis.xAxis.x * finite(u) + basis.yAxis.x * finite(v) + basis.normal.x * finite(w),
    y: finite(basis.origin?.y) + basis.xAxis.y * finite(u) + basis.yAxis.y * finite(v) + basis.normal.y * finite(w),
    z: finite(basis.origin?.z) + basis.xAxis.z * finite(u) + basis.yAxis.z * finite(v) + basis.normal.z * finite(w),
  };
}

export function frameDirection(frame, u = 0, v = 0, w = 0) {
  const basis = frame || frameFromPlane({}, { x: 0, y: 1, z: 0 });
  return frameNormalize({
    x: basis.xAxis.x * finite(u) + basis.yAxis.x * finite(v) + basis.normal.x * finite(w),
    y: basis.xAxis.y * finite(u) + basis.yAxis.y * finite(v) + basis.normal.y * finite(w),
    z: basis.xAxis.z * finite(u) + basis.yAxis.z * finite(v) + basis.normal.z * finite(w),
  });
}

export function frameProjectPoint(frame, point) {
  const delta = {
    x: finite(point?.x) - finite(frame?.origin?.x),
    y: finite(point?.y) - finite(frame?.origin?.y),
    z: finite(point?.z) - finite(frame?.origin?.z),
  };
  return { u: frameDot(delta, frame.xAxis), v: frameDot(delta, frame.yAxis), w: frameDot(delta, frame.normal) };
}

// A planar face's centroid moves when holes are added. Its bounding extents
// remain a stable sketch origin for those edits, while projection keeps the
// origin on the actual support plane even with kernel tolerance in the bounds.
export function faceFrameOrigin(descriptor, anchor = "face-centroid") {
  const origin = frameVector(descriptor?.origin);
  if (anchor !== "bounds-center") return origin;
  const min = descriptor?.bounds?.min, max = descriptor?.bounds?.max;
  if (!min || !max || ![min.x,min.y,min.z,max.x,max.y,max.z].every(Number.isFinite)) return origin;
  const centre = { x:(min.x+max.x)/2, y:(min.y+max.y)/2, z:(min.z+max.z)/2 };
  const normal = frameNormalize(descriptor?.normal);
  const distance = frameDot({x:centre.x-origin.x,y:centre.y-origin.y,z:centre.z-origin.z},normal);
  return {x:centre.x-normal.x*distance,y:centre.y-normal.y*distance,z:centre.z-normal.z*distance};
}

export function realignFrame(frame, origin, normal) {
  return frameFromPlane(origin, normal, frame?.xAxis);
}

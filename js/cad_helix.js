// Helix / spiral reference curves. Sampled in document centimetres so a
// thread, knurl or helical sweep can share one path without talking to the
// kernel. Handedness follows the ISO right-hand screw rule: a right-hand
// helix advances along +axis as the angle increases.

const TAU = Math.PI * 2;

function vec(x, y, z) { return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 }; }

export function normalizeVec(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function orthonormal(axis) {
  const n = normalizeVec(axis);
  const helper = Math.abs(n.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
  const u = normalizeVec({
    x: n.y * helper.z - n.z * helper.y,
    y: n.z * helper.x - n.x * helper.z,
    z: n.x * helper.y - n.y * helper.x,
  });
  const v = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };
  return { axis: n, u, v };
}

export function normalizeHelixSpec(spec = {}) {
  const derivedPitch = spec.pitch == null && Number(spec.turns)>0 && Number.isFinite(Number(spec.height)) ? Number(spec.height)/Number(spec.turns) : Number(spec.pitch);
  const pitch = Math.max(1e-6, derivedPitch || 0);
  const turns = Number.isFinite(Number(spec.turns)) ? Number(spec.turns) : (Number(spec.height) || pitch) / pitch;
  const height = Number.isFinite(Number(spec.height)) ? Number(spec.height) : pitch * turns;
  const radiusStart = Math.max(0, Number(spec.radius ?? spec.radiusStart) || 0);
  const radiusEnd = Math.max(0, Number(spec.radiusEnd ?? radiusStart) || 0);
  const handed = spec.handedness === "lh" || spec.handedness === "left" ? "lh" : "rh";
  return {
    origin: vec(spec.origin?.x, spec.origin?.y, spec.origin?.z),
    axis: normalizeVec(spec.axis || { x: 0, y: 1, z: 0 }),
    radius: radiusStart,
    radiusStart,
    radiusEnd,
    pitch,
    turns: Math.max(0, turns),
    height,
    startAngle: Number(spec.startAngle) || 0,
    handedness: handed,
  };
}

export function helixPoint(spec, t) {
  const h = normalizeHelixSpec(spec);
  const s = Math.max(0, Math.min(1, Number(t) || 0));
  const frame = orthonormal(h.axis);
  const sign = h.handedness === "lh" ? -1 : 1;
  const angle = h.startAngle + sign * h.turns * TAU * s;
  const radius = h.radiusStart + (h.radiusEnd - h.radiusStart) * s;
  const along = h.height * s;
  const cu = Math.cos(angle), sv = Math.sin(angle);
  return {
    x: h.origin.x + frame.axis.x * along + frame.u.x * radius * cu + frame.v.x * radius * sv,
    y: h.origin.y + frame.axis.y * along + frame.u.y * radius * cu + frame.v.y * radius * sv,
    z: h.origin.z + frame.axis.z * along + frame.u.z * radius * cu + frame.v.z * radius * sv,
    t: s,
    angle,
    radius,
  };
}

export function helixSegmentsPerTurn(spec) {
  const h = normalizeHelixSpec(spec);
  const requested = Number(spec.segmentsPerTurn);
  if (Number.isFinite(requested) && requested >= 8) return Math.min(128, Math.round(requested));
  const circumference = TAU * Math.max(h.radiusStart, h.radiusEnd, 0.1);
  return Math.max(16, Math.min(64, Math.round(circumference / Math.max(h.pitch / 4, 0.05))));
}

export function sampleHelix(spec, options = {}) {
  const h = normalizeHelixSpec(spec);
  const perTurn = helixSegmentsPerTurn({ ...h, segmentsPerTurn: options.segmentsPerTurn });
  const count = Math.max(2, Math.round(perTurn * Math.max(h.turns, 1e-6)) + 1);
  const points = [];
  for (let i = 0; i < count; i++) points.push(helixPoint(h, i / (count - 1)));
  return { spec: h, points, length: helixLength(h) };
}

export function helixLength(spec) {
  const h = normalizeHelixSpec(spec);
  const dr=h.radiusEnd-h.radiusStart, omega=TAU*h.turns;
  if(Math.abs(dr)<1e-12)return Math.hypot(omega*h.radiusStart,h.height);
  // Simpson integration of |dP/dt| includes radial travel for tapered helices.
  const speed=t=>Math.hypot(omega*(h.radiusStart+dr*t),dr,h.height);
  const n=128;let sum=speed(0)+speed(1);
  for(let i=1;i<n;i++)sum+=(i%2?4:2)*speed(i/n);
  return sum/(3*n);
}

export function helixFrameAt(spec, t) {
  const h = normalizeHelixSpec(spec);
  const a = helixPoint(h, Math.max(0, t - 1e-4));
  const b = helixPoint(h, Math.min(1, t + 1e-4));
  const tangent = normalizeVec({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
  const point = helixPoint(h, t);
  const basis=orthonormal(h.axis),angle=point.angle;
  const radial={x:basis.u.x*Math.cos(angle)+basis.v.x*Math.sin(angle),y:basis.u.y*Math.cos(angle)+basis.v.y*Math.sin(angle),z:basis.u.z*Math.cos(angle)+basis.v.z*Math.sin(angle)};
  return { origin: point, tangent, radial, axis: h.axis };
}

export function createHelix(options = {}) {
  const spec = normalizeHelixSpec(options);
  return {
    id: options.id || "helix_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type: "reference_helix",
    name: options.name || "Helix",
    ...spec,
  };
}

export function isHelixRecord(item) {
  return !!(item && (item.type === "reference_helix" || item.type === "helix"));
}

export function sweepUsesHelixPath(sketchCount, selectedHelix) {
  return !!(selectedHelix && Number(sketchCount) === 1);
}

export function documentHelixOverlays(def) {
  const seen = new Set();
  const curves = [];
  const add = (ref) => {
    if (!isHelixRecord(ref) || seen.has(ref.id)) return;
    seen.add(ref.id);
    curves.push({ id: ref.id, kind: "helix", name: ref.name, points: sampleHelix(ref).points });
  };
  (def?.referenceGeometry || []).forEach(add);
  (def?.references || []).forEach(add);
  return curves;
}

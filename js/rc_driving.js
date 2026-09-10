// Geometry and driving rules shared by the driver aids and rivals (cm, seconds).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function courseFingerprint(center) {
  let hash = 2166136261;
  for (const p of center) {
    for (const value of [p.x, p.z, p.y || 0, p.w || 13, p.gap ? 1 : 0]) {
      hash = Math.imul(hash ^ Math.round(value * 10), 16777619) >>> 0;
    }
  }
  return 'home3d_rc_v3_' + center.length + '_' + hash.toString(36);
}

export function motorDrag(throttle, drag) {
  // Strong engine braking when released; rolling resistance under power.
  return drag * (1 - 0.88 * clamp(throttle, 0, 1));
}

export function passedGate(from, to, gate, next, halfWidth) {
  if (!from || Math.abs(to.y - gate.y) >= 12) return false;
  let ux = gate.ux, uz = gate.uz;
  if (!Number.isFinite(ux) || !Number.isFinite(uz)) {
    const length = Math.hypot(next.x - gate.x, next.z - gate.z) || 1;
    ux = (next.x - gate.x) / length; uz = (next.z - gate.z) / length;
  }
  const before = (from.x - gate.x) * ux + (from.z - gate.z) * uz;
  const after = (to.x - gate.x) * ux + (to.z - gate.z) * uz;
  if (before > 0.1 || after < 0 || after <= before) return false;
  const t = clamp(-before / (after - before), 0, 1);
  const x = from.x + (to.x - from.x) * t - gate.x;
  const z = from.z + (to.z - from.z) * t - gate.z;
  return Math.abs(x * uz - z * ux) <= halfWidth + 2;
}

export function courseAhead(center, car, maxSpeed) {
  if (!center || center.length < 3) return null;
  let nearest = 0, best = Infinity;
  for (let i = 0; i < center.length; i++) {
    const p = center[i];
    const d = (p.x - car.x) ** 2 + (p.z - car.z) ** 2 + 4 * ((p.y || 0) - car.y) ** 2;
    if (d < best) { best = d; nearest = i; }
  }
  let distance = 0, target = center[nearest], speed = maxSpeed, turn = 0;
  const look = clamp(Math.abs(car.v) * 0.35, 12, 32);
  const horizon = Math.max(45, Math.abs(car.v) * 1.2);
  for (let j = 1; j < center.length && distance < horizon; j++) {
    const a = center[(nearest + j - 1) % center.length];
    const b = center[(nearest + j) % center.length];
    const c = center[(nearest + j + 1) % center.length];
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z);
    distance += ab;
    if (distance <= look || j === 1) target = b;
    if (ab < 0.1 || bc < 0.1) continue;
    const angle = Math.atan2((b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z),
      (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z));
    if (Math.abs(angle) < 0.015) continue;
    const radius = (ab + bc) / (2 * Math.abs(angle));
    const cornerSpeed = Math.min(maxSpeed, Math.sqrt(radius * 60), radius * 1.55);
    const approachSpeed = Math.sqrt(cornerSpeed ** 2 + 2 * 100 * Math.max(0, distance - look));
    if (approachSpeed < speed) { speed = approachSpeed; turn = Math.sign(angle); }
  }
  return { target, speed: Math.max(20, speed), turn, off: Math.sqrt(best) };
}

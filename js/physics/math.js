// Pure helpers for the rigid-body engine. No THREE, no cannon-es — unit tests
// import this file from Node without an import map.

export const FIXED_STEP = 1 / 120;
export const MAX_SUB_STEPS = 8;
export const MAX_SETTLE_SPEED = 250;
export const MAX_ACTIVE_SPEED = 1200;
export const MAX_ANGULAR_SPEED = 30;
export const DEBRIS_RETIRE_SECONDS = 2.5;
export const MIN_HALF_EXTENT = 0.1;
export const VOLUME_MASS_SCALE = 10000;
export const MIN_DYNAMIC_MASS = 0.05;
export const MAX_DYNAMIC_MASS = 500;
export const CHAIN_SHATTER_SPEED = 500;
export const GROUP_WORLD = 1;
export const GROUP_DEBRIS = 2;
export const GROUP_CHARACTER = 4;
export const MOUNTED_MIN_Y = 20;

// Cannon (and Rapier, Jolt, …) want SI metres. The rest of the app is
// centimetres. Convert at the solver boundary only.
export const CM_TO_M = 0.01;
export const M_TO_CM = 100;
export const GRAVITY_M = 9.81;
export const MAX_SETTLE_SPEED_M = MAX_SETTLE_SPEED * CM_TO_M;
export const MAX_ACTIVE_SPEED_M = MAX_ACTIVE_SPEED * CM_TO_M;
export const CHAIN_SHATTER_SPEED_M = CHAIN_SHATTER_SPEED * CM_TO_M;
export const SLEEP_SPEED_M = 0.2;
export const DEBRIS_SLEEP_SPEED_M = 0.12;

export function toM(cm) {
  return cm * CM_TO_M;
}

export function toCm(m) {
  return m * M_TO_CM;
}

export function vecToM(v) {
  return { x: v.x * CM_TO_M, y: v.y * CM_TO_M, z: v.z * CM_TO_M };
}

export function vecToCm(v) {
  return { x: v.x * M_TO_CM, y: v.y * M_TO_CM, z: v.z * M_TO_CM };
}

export function slideAlongNormal(dx, dy, dz, nx, ny, nz) {
  const dot = dx * nx + dy * ny + dz * nz;
  if (dot >= 0) return { x: dx, y: dy, z: dz };
  return { x: dx - nx * dot, y: dy - ny * dot, z: dz - nz * dot };
}

export const MATERIAL_PROFILES = {
  standard: { density: 1.0, friction: 0.6, restitution: 0.05 },
  metal: { density: 2.5, friction: 0.42, restitution: 0.12 },
  masonry: { density: 2.0, friction: 0.82, restitution: 0.02 },
  ceramic: { density: 1.8, friction: 0.55, restitution: 0.08 },
  glass: { density: 1.2, friction: 0.32, restitution: 0.06 },
  wood: { density: 1.0, friction: 0.64, restitution: 0.07 },
  plastic: { density: 0.6, friction: 0.38, restitution: 0.18 },
  fabric: { density: 0.4, friction: 0.92, restitution: 0.01 },
};

export const DEFAULT_PART_PROPS = { yield: 22, ultimate: 35, shatter: 55 };
export const DEFAULT_STATIC_PROPS = { yield: 50, ultimate: 60, shatter: 70, type: "masonry" };
export const DEFAULT_SINGLE_PROPS = { shatter: 55 };

export function mixFriction(a, b) {
  return Math.sqrt(a * b);
}

export function mixRestitution(a, b) {
  return Math.sqrt(a * b);
}

export function massFromCubicVolume(volume, density) {
  return Math.min(MAX_DYNAMIC_MASS, Math.max(MIN_DYNAMIC_MASS, (volume * density) / VOLUME_MASS_SCALE));
}

export function massFromVolume(sx, sy, sz, density) {
  return massFromCubicVolume(sx * sy * sz, density);
}

export function dynamicMargin(sx, sy, sz) {
  return Math.min(1.5, sx * 0.02, sy * 0.02, sz * 0.02);
}

export function halfExtentsFor(sx, sy, sz, margin) {
  const m = margin || 0;
  return {
    x: Math.max(sx / 2 - m, MIN_HALF_EXTENT),
    y: Math.max(sy / 2 - m, MIN_HALF_EXTENT),
    z: Math.max(sz / 2 - m, MIN_HALF_EXTENT),
  };
}

export function aabbSize(min, max) {
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

export function aabbVolume(min, max) {
  const s = aabbSize(min, max);
  return Math.max(0, s[0] * s[1] * s[2]);
}

export function aabbUnion(boxes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i].min, b = boxes[i].max;
    for (let k = 0; k < 3; k++) {
      if (a[k] < min[k]) min[k] = a[k];
      if (b[k] > max[k]) max[k] = b[k];
    }
  }
  return { min, max };
}

export function compoundPartsFromAabbs(boxes, isDynamic) {
  const parts = [];
  for (let i = 0; i < boxes.length; i++) {
    const { min, max } = boxes[i];
    const size = aabbSize(min, max);
    const margin = isDynamic ? dynamicMargin(size[0], size[1], size[2]) : 0;
    parts.push({
      halfExtents: halfExtentsFor(size[0], size[1], size[2], margin),
      offset: {
        x: (min[0] + max[0]) / 2,
        y: (min[1] + max[1]) / 2,
        z: (min[2] + max[2]) / 2,
      },
    });
  }
  return parts;
}

export function clampImpulse(imp, mass, maxDv) {
  const cap = maxDv || MAX_ACTIVE_SPEED;
  const len = Math.hypot(imp.x, imp.y, imp.z);
  const max = Math.max(0.01, mass) * cap;
  if (len > max && len > 0) {
    const k = max / len;
    return { x: imp.x * k, y: imp.y * k, z: imp.z * k };
  }
  return { x: imp.x, y: imp.y, z: imp.z };
}

export function applyClampToVec(imp, mass, maxDv) {
  const c = clampImpulse(imp, mass, maxDv);
  imp.x = c.x;
  imp.y = c.y;
  imp.z = c.z;
  return imp;
}

export function hitStress(impulseLength, mass, stressBase) {
  if (stressBase != null) return stressBase;
  const deltaV = impulseLength / Math.max(1, mass);
  return deltaV / 8;
}

export function partStress(baseStress, radius, distToImpact, volume) {
  const dist = Math.max(1, distToImpact);
  const vol = Math.max(1, volume);
  const falloff = Math.min(1, radius / dist);
  const sizeFactor = Math.min(3, Math.max(0.5, Math.cbrt(VOLUME_MASS_SCALE / vol)));
  return baseStress * falloff * sizeFactor;
}

export function chainShatterSpeed(strengthK) {
  return CHAIN_SHATTER_SPEED * strengthK;
}

export function chainShatterSpeedM(strengthK) {
  return CHAIN_SHATTER_SPEED_M * strengthK;
}

export function linearSpeedScale(speed, hit) {
  const max = hit ? MAX_ACTIVE_SPEED : MAX_SETTLE_SPEED;
  if (speed > max && speed > 0) return max / speed;
  return 1;
}

export function linearSpeedScaleM(speed, hit) {
  const max = hit ? MAX_ACTIVE_SPEED_M : MAX_SETTLE_SPEED_M;
  if (speed > max && speed > 0) return max / speed;
  return 1;
}

export function angularSpeedScale(speed) {
  if (speed > MAX_ANGULAR_SPEED && speed > 0) return MAX_ANGULAR_SPEED / speed;
  return 1;
}

export function clampStrength(k) {
  return Math.min(5, Math.max(0.2, Number(k) || 1));
}

export function resolvePhysicsRole(userData, minY) {
  const explicit = userData && userData.physicsRole;
  if (explicit === "dynamic" || explicit === "static" || explicit === "ignore") return explicit;
  const item = userData && userData.item;
  if (item) {
    if (Number.isFinite(item.elev) && item.elev > MOUNTED_MIN_Y) return "static";
    if (Number.isFinite(minY) && minY > MOUNTED_MIN_Y) return "static";
    return "dynamic";
  }
  return "static";
}

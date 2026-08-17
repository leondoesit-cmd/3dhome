// Rapier adapter. Scene, damage, and fracture stay in centimetres; this file
// is the only place that speaks SI metres to the solver.
import * as RAPIER from "../../vendor/rapier/rapier.mjs";
import { ctx } from "./registry.js";
import {
  CM_TO_M,
  M_TO_CM,
  GRAVITY_M,
  FIXED_STEP,
  GROUP_WORLD,
  GROUP_DEBRIS,
  GROUP_CHARACTER,
} from "./math.js";

export { RAPIER };
export const BODY_DYNAMIC = 1;
export const BODY_STATIC = 2;
export const BODY_SLEEPING = 2;

let nativeReady = null;
let queryDirty = false;

export function initNative() {
  if (!nativeReady) nativeReady = RAPIER.init();
  return nativeReady;
}

function markQueryDirty() {
  queryDirty = true;
}

export function syncQueryPipeline() {
  if (!queryDirty || !ctx.world || !ctx.world.raw) return;
  const dt = ctx.world.raw.timestep;
  ctx.world.raw.timestep = 0;
  ctx.world.raw.step();
  ctx.world.raw.timestep = dt;
  queryDirty = false;
}

export function interactionGroups(membership, filter) {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export class Vec3 {
  constructor(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new Vec3(this.x, this.y, this.z);
  }
  setZero() {
    this.x = this.y = this.z = 0;
    return this;
  }
  length() {
    return Math.hypot(this.x, this.y, this.z);
  }
  normalize() {
    const len = this.length() || 1;
    this.x /= len;
    this.y /= len;
    this.z /= len;
    return this;
  }
  scale(scalar, target) {
    const out = target || this;
    out.x = this.x * scalar;
    out.y = this.y * scalar;
    out.z = this.z * scalar;
    return out;
  }
}

export class Quat {
  constructor(x, y, z, w) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = w == null ? 1 : w;
  }
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }
  copy(q) {
    this.x = q.x;
    this.y = q.y;
    this.z = q.z;
    this.w = q.w;
    return this;
  }
  clone() {
    return new Quat(this.x, this.y, this.z, this.w);
  }
  normalize() {
    const len = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= len;
    this.y /= len;
    this.z /= len;
    this.w /= len;
    return this;
  }
}

export function vec3(x, y, z) {
  return new Vec3(x, y, z);
}

export class PhysicsBody {
  constructor(raw, opts) {
    this.raw = raw;
    this.colliders = [];
    this.userData = { hit: false };
    this.isDynamic = !!opts.isDynamic;
    this.friction = opts.friction || 0.6;
    this.restitution = opts.restitution || 0.05;
    this.groups = opts.groups != null ? opts.groups : GROUP_WORLD;
    this.mask = opts.mask != null ? opts.mask : GROUP_WORLD | GROUP_DEBRIS | GROUP_CHARACTER;
    this.position = new Vec3();
    this.previousPosition = new Vec3();
    this.interpolatedPosition = new Vec3();
    this.velocity = new Vec3();
    this.angularVelocity = new Vec3();
    this.quaternion = new Quat();
    this.previousQuaternion = new Quat();
    this.interpolatedQuaternion = new Quat();
    this.force = { setZero() {} };
    this.torque = { setZero() {} };
    this.pullFromRapier(false);
  }
  get type() {
    return this.isDynamic ? BODY_DYNAMIC : BODY_STATIC;
  }
  get mass() {
    return this.raw ? this.raw.mass() : 0;
  }
  get sleepState() {
    return this.raw && this.raw.isSleeping() ? BODY_SLEEPING : 0;
  }
  wakeUp() {
    if (this.raw) this.raw.wakeUp();
  }
  flushToRapier() {
    if (!this.raw) return;
    this.raw.setTranslation(this.position, true);
    this.raw.setRotation(this.quaternion, true);
    if (this.isDynamic) {
      this.raw.setLinvel(this.velocity, true);
      this.raw.setAngvel(this.angularVelocity, true);
    }
  }
  pullFromRapier(rememberPrevious) {
    if (!this.raw) return;
    if (rememberPrevious) {
      this.previousPosition.copy(this.position);
      this.previousQuaternion.copy(this.quaternion);
    }
    const t = this.raw.translation();
    this.position.set(t.x, t.y, t.z);
    const r = this.raw.rotation();
    this.quaternion.set(r.x, r.y, r.z, r.w);
    const v = this.raw.linvel();
    this.velocity.set(v.x, v.y, v.z);
    const w = this.raw.angvel();
    this.angularVelocity.set(w.x, w.y, w.z);
    if (!rememberPrevious) {
      this.previousPosition.copy(this.position);
      this.previousQuaternion.copy(this.quaternion);
      this.interpolatedPosition.copy(this.position);
      this.interpolatedQuaternion.copy(this.quaternion);
    }
  }
  interpolate(alpha) {
    const a = alpha || 0;
    this.interpolatedPosition.set(
      this.previousPosition.x + (this.position.x - this.previousPosition.x) * a,
      this.previousPosition.y + (this.position.y - this.previousPosition.y) * a,
      this.previousPosition.z + (this.position.z - this.previousPosition.z) * a,
    );
    this.interpolatedQuaternion.set(
      this.previousQuaternion.x + (this.quaternion.x - this.previousQuaternion.x) * a,
      this.previousQuaternion.y + (this.quaternion.y - this.previousQuaternion.y) * a,
      this.previousQuaternion.z + (this.quaternion.z - this.previousQuaternion.z) * a,
      this.previousQuaternion.w + (this.quaternion.w - this.previousQuaternion.w) * a,
    ).normalize();
  }
  applyImpulse(impulse, point) {
    if (!this.raw) return this;
    const hasPoint = point && (point.x || point.y || point.z);
    if (hasPoint) this.raw.applyImpulseAtPoint(impulse, point, true);
    else this.raw.applyImpulse(impulse, true);
    this.pullFromRapier(false);
    return this;
  }
}

export class NativeWorld {
  constructor() {
    this.raw = new RAPIER.World({ x: 0, y: -GRAVITY_M, z: 0 });
    this.raw.timestep = FIXED_STEP;
    this.raw.numSolverIterations = 8;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.byHandle = new Map();
    this.accumulator = 0;
    this.time = 0;
    this.onBeginContact = null;
  }
  step(fixed, dt, maxSub) {
    this.accumulator += dt;
    let n = 0;
    while (this.accumulator >= fixed && n < maxSub) {
      this.byHandle.forEach(body => body.flushToRapier());
      this.raw.step(this.eventQueue);
      queryDirty = false;
      this.drainContacts();
      this.byHandle.forEach(body => body.pullFromRapier(true));
      this.accumulator -= fixed;
      this.time += fixed;
      n++;
    }
    const alpha = n > 0 ? this.accumulator / fixed : 0;
    this.byHandle.forEach(body => body.interpolate(alpha));
  }
  drainContacts() {
    const fn = this.onBeginContact;
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started || !fn) return;
      const c1 = this.raw.getCollider(h1);
      const c2 = this.raw.getCollider(h2);
      if (!c1 || !c2) return;
      const r1 = c1.parent();
      const r2 = c2.parent();
      if (!r1 || !r2) return;
      const bodyA = this.byHandle.get(r1.handle);
      const bodyB = this.byHandle.get(r2.handle);
      if (!bodyA || !bodyB) return;
      fn({ bodyA, bodyB });
    });
  }
  addBody(body) {
    if (body && body.raw) this.byHandle.set(body.raw.handle, body);
  }
  removeBody(body) {
    if (!body || !body.raw) return;
    this.byHandle.delete(body.raw.handle);
    if (body.raw.isValid()) this.raw.removeRigidBody(body.raw);
    markQueryDirty();
    body.raw = null;
    body.colliders = [];
  }
  free() {
    if (this.eventQueue) this.eventQueue.free();
    if (this.raw) this.raw.free();
    this.byHandle.clear();
    this.eventQueue = null;
    this.raw = null;
  }
}

export function createWorld() {
  const world = new NativeWorld();
  const groundDesc = RAPIER.RigidBodyDesc.fixed();
  const groundRaw = world.raw.createRigidBody(groundDesc);
  const groundCol = world.raw.createCollider(
    RAPIER.ColliderDesc.cuboid(400, 0.05, 400)
      .setTranslation(0, -0.05, 0)
      .setFriction(0.8)
      .setRestitution(0)
      .setCollisionGroups(interactionGroups(GROUP_WORLD, GROUP_WORLD | GROUP_DEBRIS | GROUP_CHARACTER)),
    groundRaw,
  );
  const ground = new PhysicsBody(groundRaw, {
    isDynamic: false,
    groups: GROUP_WORLD,
    mask: GROUP_WORLD | GROUP_DEBRIS | GROUP_CHARACTER,
  });
  ground.colliders.push(groundCol);
  world.addBody(ground);
  ctx.world = world;
  ctx.groundBody = ground;
  markQueryDirty();
  return world;
}

export function disposeNativeWorld() {
  clearCharacter();
  if (!ctx.world) return;
  ctx.world.free();
  ctx.world = null;
  ctx.groundBody = null;
}

export function createBody(opts) {
  if (!ctx.world) return null;
  const isDynamic = !!opts.isDynamic;
  const desc = isDynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed();
  desc.setLinearDamping(opts.linearDamping != null ? opts.linearDamping : 0.25);
  desc.setAngularDamping(opts.angularDamping != null ? opts.angularDamping : 0.35);
  desc.setCanSleep(true);
  if (isDynamic) {
    desc.setCcdEnabled(true);
    desc.setSoftCcdPrediction(0.04);
  }
  const raw = ctx.world.raw.createRigidBody(desc);
  const body = new PhysicsBody(raw, opts);
  ctx.world.addBody(body);
  markQueryDirty();
  return body;
}

export function addBoxShape(body, hxCm, hyCm, hzCm, oxCm, oyCm, ozCm, mass) {
  if (!ctx.world || !body || !body.raw) return null;
  const desc = RAPIER.ColliderDesc.cuboid(hxCm * CM_TO_M, hyCm * CM_TO_M, hzCm * CM_TO_M)
    .setTranslation(oxCm * CM_TO_M, oyCm * CM_TO_M, ozCm * CM_TO_M)
    .setFriction(body.friction)
    .setRestitution(body.restitution)
    .setCollisionGroups(interactionGroups(body.groups, body.mask))
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  if (body.isDynamic) desc.setMass(Math.max(0.001, mass || 0.001));
  const col = ctx.world.raw.createCollider(desc, body.raw);
  body.colliders.push(col);
  markQueryDirty();
  return col;
}

export function createBoxBodyCm(opts) {
  const body = createBody({
    isDynamic: !!opts.dynamic,
    friction: opts.friction || 0.6,
    restitution: opts.restitution || 0.05,
    groups: opts.groups != null ? opts.groups : GROUP_WORLD,
    mask: opts.mask != null ? opts.mask : GROUP_WORLD | GROUP_DEBRIS | GROUP_CHARACTER,
  });
  addBoxShape(body, opts.hx, opts.hy, opts.hz, 0, 0, 0, opts.mass || 1);
  setPositionCm(body, opts.x, opts.y, opts.z);
  body.flushToRapier();
  body.pullFromRapier(false);
  return body;
}

export function markDebrisBody(body) {
  if (!body) return;
  body.groups = GROUP_DEBRIS;
  body.mask = GROUP_WORLD;
  body.userData.debris = true;
  body.userData.sleepSince = null;
  const groups = interactionGroups(GROUP_DEBRIS, GROUP_WORLD);
  body.colliders.forEach(col => {
    col.setCollisionGroups(groups);
    col.setFriction(0.45);
    col.setRestitution(0.04);
    const he = col.halfExtents();
    if (he) col.setHalfExtents({ x: he.x * 0.55, y: he.y * 0.55, z: he.z * 0.55 });
  });
  markQueryDirty();
}

export function getPositionCm(body) {
  return {
    x: body.position.x * M_TO_CM,
    y: body.position.y * M_TO_CM,
    z: body.position.z * M_TO_CM,
  };
}

export function setPositionCm(body, x, y, z) {
  body.position.set(x * CM_TO_M, y * CM_TO_M, z * CM_TO_M);
  body.previousPosition.copy(body.position);
  body.interpolatedPosition.copy(body.position);
  if (body.raw) body.raw.setTranslation(body.position, true);
}

export function getVelocityCm(body) {
  return {
    x: body.velocity.x * M_TO_CM,
    y: body.velocity.y * M_TO_CM,
    z: body.velocity.z * M_TO_CM,
  };
}

export function applyImpulseCm(body, imp, point) {
  const i = vec3(imp.x * CM_TO_M, imp.y * CM_TO_M, imp.z * CM_TO_M);
  const p = point
    ? vec3(point.x * CM_TO_M, point.y * CM_TO_M, point.z * CM_TO_M)
    : null;
  body.applyImpulse(i, p);
  return body;
}

let charRaw = null;
let charCollider = null;
let charController = null;
let charRadiusM = 0;
let charHalfM = 0;

export function clearCharacter() {
  if (charController) {
    charController.free();
    charController = null;
  }
  if (charRaw && ctx.world && ctx.world.raw) {
    ctx.world.raw.removeRigidBody(charRaw);
    markQueryDirty();
  }
  charRaw = null;
  charCollider = null;
  charRadiusM = 0;
  charHalfM = 0;
}

function ensureCharacter(radiusM, halfM) {
  if (!ctx.world || !ctx.world.raw) return false;
  if (charCollider && Math.abs(charRadiusM - radiusM) < 0.005 && Math.abs(charHalfM - halfM) < 0.005) {
    return true;
  }
  clearCharacter();
  const desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
  charRaw = ctx.world.raw.createRigidBody(desc);
  charCollider = ctx.world.raw.createCollider(
    RAPIER.ColliderDesc.capsule(halfM, radiusM)
      .setCollisionGroups(interactionGroups(GROUP_CHARACTER, GROUP_WORLD)),
    charRaw,
  );
  charController = ctx.world.raw.createCharacterController(0.01);
  charController.setApplyImpulsesToDynamicBodies(false);
  charController.setSlideEnabled(true);
  charController.disableAutostep();
  charController.disableSnapToGround();
  charRadiusM = radiusM;
  charHalfM = halfM;
  markQueryDirty();
  return true;
}

export function moveCharacterCm(x, y, z, dx, dy, dz, radius, height) {
  const r = Math.max(8, radius || 18) * CM_TO_M;
  const h = Math.max(r * 2 + 0.04, (height || 165) * CM_TO_M);
  const half = Math.max(0.02, h / 2 - r);
  if (!ensureCharacter(r, half)) {
    return { x: x + dx, y: y + dy, z: z + dz, hit: false };
  }
  syncQueryPipeline();
  const originY = y * CM_TO_M + r + half + 0.005;
  charRaw.setTranslation({ x: x * CM_TO_M, y: originY, z: z * CM_TO_M }, true);
  ctx.world.raw.propagateModifiedBodyPositionsToColliders();
  charController.computeColliderMovement(
    charCollider,
    { x: dx * CM_TO_M, y: dy * CM_TO_M, z: dz * CM_TO_M },
    undefined,
    interactionGroups(GROUP_CHARACTER, GROUP_WORLD),
  );
  const mv = charController.computedMovement();
  const nx = x + mv.x * M_TO_CM;
  const ny = y + mv.y * M_TO_CM;
  const nz = z + mv.z * M_TO_CM;
  charRaw.setTranslation({ x: nx * CM_TO_M, y: originY + mv.y, z: nz * CM_TO_M }, true);
  let hit = false;
  const n = charController.numComputedCollisions();
  for (let i = 0; i < n; i++) {
    const col = charController.computedCollision(i);
    if (col && col.normal1 && Math.abs(col.normal1.y) < 0.55) hit = true;
  }
  return { x: nx, y: ny, z: nz, hit };
}

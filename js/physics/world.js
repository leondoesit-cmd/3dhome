import * as THREE from "three";
import { ctx, resetLookups } from "./registry.js";
import {
  FIXED_STEP,
  MAX_SUB_STEPS,
  DEBRIS_RETIRE_SECONDS,
  chainShatterSpeedM,
  linearSpeedScaleM,
  angularSpeedScale,
  clampStrength,
  M_TO_CM,
} from "./math.js";
import { installMaterials } from "./materials.js";
import { createPhysicsBody, removePhysicsObject, retireDebrisBody } from "./shapes.js";
import { stepParticles, clearParticles } from "./vfx.js";
import { stepCloth, clearCloth } from "./cloth.js";
import { clearCharacter } from "./character.js";
import {
  BODY_DYNAMIC,
  BODY_SLEEPING,
  createWorld,
  disposeNativeWorld,
} from "./native.js";
import { safeDeltaSeconds } from "../physics_runtime.js";

const syncWorldPosition = new THREE.Vector3();
const syncWorldQuaternion = new THREE.Quaternion();
const syncParentQuaternion = new THREE.Quaternion();

export { removePhysicsObject };

export function addPhysicsBody(mesh, isDynamic) {
  if (!ctx.world) initPhysics();
  return createPhysicsBody(mesh, isDynamic);
}

export function setStrength(k) {
  ctx.strengthK = clampStrength(k);
  return ctx.strengthK;
}

export function getStrength() {
  return ctx.strengthK;
}

export function toggleHitMode() {
  ctx.hitMode = ctx.hitMode === "punch" ? "hammer" : "punch";
  return ctx.hitMode;
}

export function getHitMode() {
  return ctx.hitMode;
}

export function toggleSlowMo() {
  ctx.slowMo = !ctx.slowMo;
  return ctx.slowMo;
}

export function isPhysicsEnabled() {
  return ctx.enabled;
}

export function isPhysicsBusy() {
  if (!ctx.enabled || !ctx.world) return false;
  if (ctx.particles && ctx.particles.length) return true;
  for (let i = 0; i < ctx.physicsBodies.length; i++) {
    const body = ctx.physicsBodies[i] && ctx.physicsBodies[i].body;
    if (body && body.type === BODY_DYNAMIC && body.sleepState !== BODY_SLEEPING)
      return true;
  }
  return false;
}

export function getPhysicsBodies() {
  return ctx.physicsBodies;
}

export function togglePhysics(enabled) {
  ctx.enabled = enabled;
  if (!ctx.enabled) disposeWorld();
  return ctx.enabled;
}

function onBeginContact(event) {
  const bodyA = event.bodyA;
  const bodyB = event.bodyB;
  const vA = bodyA.velocity;
  const vB = bodyB.velocity;
  const relativeVelocity = Math.hypot(vA.x - vB.x, vA.y - vB.y, vA.z - vB.z);
  const chainHit = bodyA.userData?.hit || bodyB.userData?.hit;
  if (!chainHit || relativeVelocity <= chainShatterSpeedM(ctx.strengthK)) return;

  const pA = ctx.bodyLookup.get(bodyA);
  const pB = ctx.bodyLookup.get(bodyB);
  const impulse = {
    x: (vA.x - vB.x) * M_TO_CM * 100,
    y: (Math.abs(vA.y - vB.y) * M_TO_CM + 100) * 100,
    z: (vA.z - vB.z) * M_TO_CM * 100,
  };
  const point = {
    x: bodyA.position.x * M_TO_CM,
    y: bodyA.position.y * M_TO_CM,
    z: bodyA.position.z * M_TO_CM,
  };

  queueIfGroup(pA, { x: -impulse.x, y: -impulse.y, z: -impulse.z }, point);
  queueIfGroup(pB, impulse, point);
}

function queueIfGroup(physicsObj, impulse, point) {
  if (!physicsObj || physicsObj.body.type !== BODY_DYNAMIC) return;
  if (!physicsObj.mesh.children || physicsObj.mesh.children.length === 0) return;
  if (physicsObj.body.userData.shatterQueued) return;
  if (physicsObj.mesh.type !== "Group") return;
  physicsObj.body.userData.shatterQueued = true;
  ctx.shatterQueue.push({ obj: physicsObj, impulse, point });
}

export function initPhysics() {
  if (ctx.world) return;
  installMaterials();
  createWorld();
  ctx.onBeginContact = onBeginContact;
  ctx.world.onBeginContact = onBeginContact;
}

export function clearPhysics() {
  if (ctx.world) {
    ctx.physicsBodies.slice().forEach(removePhysicsObject);
    ctx.world.accumulator = 0;
  }
  clearParticles();
  clearCloth();
  ctx.debris.forEach(d => {
    if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
  });
  resetLookups();
}

export function disposeWorld() {
  clearCharacter();
  clearPhysics();
  disposeNativeWorld();
  ctx.world = null;
  ctx.groundBody = null;
  ctx.onBeginContact = null;
}

export function clearDebris() {
  if (ctx.world) {
    ctx.debris.forEach(d => {
      if (d.body) {
        const physicsObject = ctx.bodyLookup.get(d.body);
        if (physicsObject) removePhysicsObject(physicsObject);
        else ctx.world.removeBody(d.body);
      }
      if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
    });
  }
  ctx.debris = [];
}

function syncMeshFromBody(obj) {
  const body = obj.body;
  const pos = body.interpolatedPosition || body.position;
  const quat = body.interpolatedQuaternion || body.quaternion;
  syncWorldPosition.set(pos.x * M_TO_CM, pos.y * M_TO_CM, pos.z * M_TO_CM);
  syncWorldQuaternion.set(quat.x, quat.y, quat.z, quat.w);
  if (obj.mesh.parent) {
    obj.mesh.parent.updateMatrixWorld(true);
    obj.mesh.parent.worldToLocal(syncWorldPosition);
    obj.mesh.parent.getWorldQuaternion(syncParentQuaternion).invert();
    syncWorldQuaternion.premultiply(syncParentQuaternion);
  }
  obj.mesh.position.copy(syncWorldPosition);
  obj.mesh.quaternion.copy(syncWorldQuaternion).normalize();
  obj.mesh.updateMatrixWorld(true);
}

function bodyIsFinite(body) {
  const p = body.position, q = body.quaternion, v = body.velocity, a = body.angularVelocity;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, a.x, a.y, a.z]
    .every(Number.isFinite);
}

function rememberSafeBodyState(obj) {
  obj.lastSafePosition.copy(obj.body.position);
  obj.lastSafeQuaternion.copy(obj.body.quaternion);
}

function restoreSafeBodyState(obj) {
  obj.body.position.copy(obj.lastSafePosition);
  obj.body.previousPosition.copy(obj.lastSafePosition);
  obj.body.interpolatedPosition.copy(obj.lastSafePosition);
  obj.body.quaternion.copy(obj.lastSafeQuaternion);
  obj.body.previousQuaternion.copy(obj.lastSafeQuaternion);
  obj.body.interpolatedQuaternion.copy(obj.lastSafeQuaternion);
  obj.body.velocity.setZero();
  obj.body.angularVelocity.setZero();
  obj.body.force.setZero();
  obj.body.torque.setZero();
  obj.body.flushToRapier();
}

export function syncPhysicsToThree(delta) {
  if (!ctx.enabled || !ctx.world) return;
  const timeScale = ctx.slowMo ? 0.1 : 1.0;
  const dt = safeDeltaSeconds(delta, 1 / 60) * timeScale;
  if (!dt) return;
  ctx.world.step(FIXED_STEP, dt, MAX_SUB_STEPS);

  const retire = [];
  ctx.physicsBodies.forEach(obj => {
    if (obj.body.type !== BODY_DYNAMIC) return;
    const v = obj.body.velocity;
    if (!bodyIsFinite(obj.body)) restoreSafeBodyState(obj);
    const speed = v.length();
    const lin = linearSpeedScaleM(speed, !!obj.body.userData?.hit);
    if (lin !== 1) v.scale(lin, v);
    const angularSpeed = obj.body.angularVelocity.length();
    const ang = angularSpeedScale(angularSpeed);
    if (ang !== 1) obj.body.angularVelocity.scale(ang, obj.body.angularVelocity);
    if (lin !== 1 || ang !== 1) obj.body.flushToRapier();
    syncMeshFromBody(obj);
    rememberSafeBodyState(obj);

    if (obj.body.userData?.debris) {
      if (obj.body.sleepState === BODY_SLEEPING) {
        if (obj.body.userData.sleepSince == null) obj.body.userData.sleepSince = ctx.world.time;
        else if (ctx.world.time - obj.body.userData.sleepSince >= DEBRIS_RETIRE_SECONDS) retire.push(obj);
      } else obj.body.userData.sleepSince = null;
    }
  });
  retire.forEach(retireDebrisBody);
  stepParticles(dt);
  stepCloth(dt);
}

export function takeShatterQueue() {
  if (!ctx.shatterQueue.length) return [];
  const queued = ctx.shatterQueue;
  ctx.shatterQueue = [];
  return queued;
}

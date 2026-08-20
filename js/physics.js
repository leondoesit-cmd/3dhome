const MAX_SUB_STEPS = 3;

import {
  addPhysicsBody as shapesAddPhysicsBody,
  clearDebris,
  clearPhysics,
  disposeWorld,
  getHitMode,
  getPhysicsBodies,
  getStrength,
  initPhysics,
  isPhysicsBusy as worldIsPhysicsBusy,
  isPhysicsEnabled,
  setStrength,
  setDestructionMode,
  getDestructionMode,
  syncPhysicsToThree as stepWorld,
  takeShatterQueue,
  toggleHitMode,
  togglePhysics,
  toggleSlowMo,
} from "./physics/world.js";
import { initNative } from "./physics/native.js";
import {
  drainShatterQueue,
  explodeAt,
  hitAlongRay,
  hitObjectAtCenter,
} from "./physics/damage.js";
import { spawnHangingCloth } from "./physics/cloth.js";
import { isCharacterReady, moveKinematicCapsule } from "./physics/character.js";

export function ready() {
  return initNative();
}

export function isPhysicsBusy() {
  return worldIsPhysicsBusy();
}

export function addPhysicsBody(mesh, isDynamic) {
  const body = shapesAddPhysicsBody(mesh, isDynamic);
  if (!body) return null;
  if (isDynamic) body.sleep();
  return body;
}

export {
  clearDebris,
  clearPhysics,
  disposeWorld,
  explodeAt,
  getHitMode,
  getPhysicsBodies,
  getStrength,
  setDestructionMode,
  getDestructionMode,
  hitAlongRay,
  hitObjectAtCenter,
  initPhysics,
  isPhysicsEnabled,
  setStrength,
  toggleHitMode,
  togglePhysics,
  toggleSlowMo,
  spawnHangingCloth,
  isCharacterReady,
  moveKinematicCapsule,
};

export function syncPhysicsToThree(delta) {
  if (!isPhysicsBusy()) return;
  stepWorld(delta);
  drainShatterQueue(takeShatterQueue());
}

const MAX_SUB_STEPS = 3;

import {
  clearDebris,
  clearPhysics,
  disposeWorld,
  drainShatterQueue,
  explodeAt,
  getHitMode,
  getPhysicsBodies,
  getStrength,
  hitAlongRay,
  hitObjectAtCenter,
  initPhysics,
  isCharacterReady,
  isPhysicsBusy as worldIsPhysicsBusy,
  isPhysicsEnabled,
  moveKinematicCapsule,
  setStrength,
  spawnHangingCloth,
  stepWorld,
  takeShatterQueue,
  toggleHitMode,
  togglePhysics,
  toggleSlowMo,
} from "./physics/world.js";
import { addPhysicsBody as shapesAddPhysicsBody } from "./physics/shapes.js";

export function isPhysicsBusy() {
  return worldIsPhysicsBusy();
}

export function addPhysicsBody(mesh, isDynamic) {
  const body = shapesAddPhysicsBody(mesh, isDynamic);
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

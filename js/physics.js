// Public rigid-body engine. Internals live in js/physics/; this file is the
// stable import path used by physics_facade.js.
import {
  addPhysicsBody,
  clearDebris,
  clearPhysics,
  disposeWorld,
  getHitMode,
  getPhysicsBodies,
  getStrength,
  initPhysics,
  isPhysicsEnabled,
  setStrength,
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

export {
  addPhysicsBody,
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
  stepWorld(delta);
  drainShatterQueue(takeShatterQueue());
}

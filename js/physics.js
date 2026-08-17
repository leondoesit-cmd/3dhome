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
  isPhysicsBusy,
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
import { addPhysicsBody } from "./physics/shapes.js";

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
  isPhysicsBusy,
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

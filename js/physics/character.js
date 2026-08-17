import { ctx } from "./registry.js";
import { moveCharacterCm, clearCharacter as clearNativeCharacter } from "./native.js";

export function moveKinematicCapsule(x, y, z, dx, dy, dz, radius, height) {
  if (!ctx.enabled || !ctx.world) {
    return { x: x + dx, y: y + dy, z: z + dz, hit: false };
  }
  return moveCharacterCm(x, y, z, dx, dy, dz, radius, height);
}

export function isCharacterReady() {
  return !!(ctx.enabled && ctx.world);
}

export function clearCharacter() {
  clearNativeCharacter();
}

// Lightweight bridge that keeps Rapier and fracture geometry out of the
// initial module graph. The real engine is fetched only when destruction mode
// is enabled; all per-frame calls remain synchronous no-ops until then.
let engine = null;
let pending = null;
let strength = 1;
let destructionMode = "full";

function syncCrosshair(on) {
  const ch = document.getElementById("crosshair");
  if (ch) ch.style.display = on ? "block" : "none";
}

export function loadPhysics() {
  if (engine) return Promise.resolve(engine);
  if (!pending) pending = import("./physics.js").then(async (module) => {
    await module.ready();
    engine = module;
    engine.setStrength(strength);
    engine.setDestructionMode(destructionMode);
    return engine;
  });
  return pending;
}

export function setStrength(value) {
  strength = Math.min(5, Math.max(0.2, Number(value) || 1));
  if (engine) engine.setStrength(strength);
  return strength;
}
export function getStrength() { return engine ? engine.getStrength() : strength; }

export function setDestructionMode(mode) {
  if (mode === "none" || mode === "parts" || mode === "full") {
    destructionMode = mode;
    if (engine) engine.setDestructionMode(destructionMode);
  }
  return destructionMode;
}
export function getDestructionMode() {
  return engine ? engine.getDestructionMode() : destructionMode;
}
export function getHitMode() { return engine ? engine.getHitMode() : "punch"; }
export function isPhysicsEnabled() { return !!engine && engine.isPhysicsEnabled(); }
export function isPhysicsBusy() { return !!engine && typeof engine.isPhysicsBusy === "function" && engine.isPhysicsBusy(); }
export function togglePhysics(value) {
  const on = engine ? engine.togglePhysics(value) : false;
  syncCrosshair(on);
  return on;
}
export function clearPhysics() { if (engine) engine.clearPhysics(); }
export function clearDebris() { if (engine) engine.clearDebris(); }
export function syncPhysicsToThree(delta) { if (engine) engine.syncPhysicsToThree(delta); }
export function addPhysicsBody(mesh, dynamic) { return engine ? engine.addPhysicsBody(mesh, dynamic) : null; }
export function hitObjectAtCenter(camera, scene) { if (engine) engine.hitObjectAtCenter(camera, scene); }
export function hitAlongRay(origin, dir, scene, hit, range) {
  return engine ? engine.hitAlongRay(origin, dir, scene, hit, range) : false;
}
export function explodeAt(center, radius, power, scene) {
  return engine ? engine.explodeAt(center, radius, power, scene) : 0;
}
export function toggleSlowMo() { return engine ? engine.toggleSlowMo() : false; }
export function toggleHitMode() { return engine ? engine.toggleHitMode() : "punch"; }
export function spawnHangingCloth(parent, opts) {
  return engine ? engine.spawnHangingCloth(parent, opts) : null;
}
export function isCharacterReady() { return engine ? engine.isCharacterReady() : false; }
export function moveKinematicCapsule(x, y, z, dx, dy, dz, radius, height) {
  return engine
    ? engine.moveKinematicCapsule(x, y, z, dx, dy, dz, radius, height)
    : { x: x + dx, y: y + dy, z: z + dz, hit: false };
}

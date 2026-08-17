// Lightweight bridge that keeps cannon-es and fracture geometry out of the
// initial module graph. The real engine is fetched only when destruction mode
// is enabled; all per-frame calls remain synchronous no-ops until then.
let engine = null;
let pending = null;
let strength = 1;

export function loadPhysics() {
  if (engine) return Promise.resolve(engine);
  if (!pending) pending = import("./physics.js").then((module) => {
    engine = module;
    engine.setStrength(strength);
    return engine;
  });
  return pending;
}

export function setStrength(value) {
  strength = Math.min(5, Math.max(0.2, Number(value) || 1));
  if (engine) engine.setStrength(strength);
  return strength;
}
export function isPhysicsEnabled() { return !!engine && engine.isPhysicsEnabled(); }
export function togglePhysics(value) { return engine ? engine.togglePhysics(value) : false; }
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

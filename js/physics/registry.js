// Mutable engine state shared by world / shapes / damage / vfx.
// Kept in one place so those modules do not import each other.

export const ctx = {
  enabled: false,
  world: null,
  groundBody: null,
  onBeginContact: null,
  physicsBodies: [],
  bodyLookup: new Map(),
  meshLookup: new WeakMap(),
  physicsMaterial: null,
  debrisMaterial: null,
  materialByType: new Map(),
  slowMo: false,
  particles: [],
  debris: [],
  shatterQueue: [],
  cloth: [],
  strengthK: 1,
  hitMode: "punch",
  destructionMode: "full", // "full" (fracture into shards), "parts" (dismantle parts only), "none" (disabled)
};

export function resetLookups() {
  ctx.physicsBodies = [];
  ctx.bodyLookup = new Map();
  ctx.meshLookup = new WeakMap();
  ctx.particles = [];
  ctx.debris = [];
  ctx.shatterQueue = [];
  ctx.cloth = [];
}

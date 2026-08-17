/* Night Shift shared state + tuning. Imported by world/game subsystems. */
import * as THREE from "three";

/* ---- tuning ------------------------------------------------------------- */
export const EYE = 162,          // eye height above the floor (cm)
  EYE_CROUCH = 104,
  P_RAD = 24,           // player collision radius
  P_CLEAR = 172,        // body height used against furniture height bands
  STEP = 42,            // ledge the player/zombies step over without blocking
  SPD_WALK = 215,       // cm/s
  SPD_SPRINT = 380,
  SPD_CROUCH = 118,
  ACCEL = 14,           // movement smoothing (1/s)
  GRAV = 900,
  MAX_HP = 100,
  MAX_ARMOR = 100,
  MELEE_REACH = 96,
  Z_MAX_ALIVE = 18,     // draw-call cap: procedural rigs have many moving parts
  REST_LEN = 12;        // seconds of resupply between waves (HUD counts it down)

/* ---- module state ------------------------------------------------------- */
export const Z = {
  active: false,
  grp: null,
  col: null,
  colDirty: true,
  keys: {},
  bound: false,
  hud: null,
  t: 0,
  raf: 0,
  locked: false,
  paused: false,
  saved: null,
  lamps: [],
  zeds: [],
  pickups: [],
  frags: [],      // live thrown grenades
  gibs: [],
  env: null,      // the exterior built outside the windows this session
  envFlicker: null,
  decals: null,
  parts: null,
  fireParts: null,
  tracers: null,
  doorsOpened: [],
  moonBeams: null,
  audio: null,
  sndTOs: [],   // pending deferred sound timeouts, cleared on audioClose()
  noiseT: 0,
  msgT: 0,
  hitT: 0,
  killStreak: 0,
  streakT: 0,
  combo: 0,
  comboT: 0,
  score: 0,
  timeScale: 1,
  slowT: 0,
  p: null,
  wave: null,
  flash: null,
  view: null,
  shake: 0,
  shakeV: { x: 0, y: 0 },
  distract: 0, // 0..1 player distraction from staring at pretty undead
  stats: { kills: 0, heads: 0, melee: 0, best: 0, shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0 },
};

// Optional callbacks registered by zombies_game.js so world systems can play
// sounds / touch the HUD without a circular import.
export const hooks = {
  sndClick: null,
  sndFlesh: null,
  sndGrowl: null,
  sndScream: null,
  sndDeath: null,
  sndDoor: null,
  sndSwipe: null,
  hudDirty: null,
  say: null,
  hitMarker: null,
  flashScreen: null,
  hurtPlayer: null,
  onKill: null,
  onHeadshot: null,
};

export function zActive() {
  return Z.active;
}

export function zDebug() {
  return {
    active: Z.active,
    zeds: Z.zeds.length,
    wave: Z.wave && Z.wave.n,
    pending: Z.wave && Z.wave.pending,
    hp: Z.p && Math.round(Z.p.hp),
    weapon: Z.p && Z.p.weapon,
    ammo: Z.p && Z.p.ammo,
    frags: Z.p && Z.p.frags,
    liveFrags: Z.frags.length,
    burning: Z.zeds.filter(function (z) { return z.burn > 0; }).length,
    env: Z.env && Z.env.theme,
    lamps: Z.lamps.length,
    segs: Z.col && Z.col.segs.length,
    rects: Z.col && Z.col.rects.length,
    kills: Z.stats.kills,
  };
}

export const rnd = Math.random;
export function rr(a, b) {
  return a + rnd() * (b - a);
}
export function pick(a) {
  return a[(rnd() * a.length) | 0];
}

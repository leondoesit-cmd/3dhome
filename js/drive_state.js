// Drive-mode shared state — the ONE owner of everything the drive modules
// mutate across file boundaries.
//
// Why this file exists: drive.js was split before without moving its shared
// `let`s anywhere, so the pieces referenced bindings that no longer existed
// (elevReady, ELEV_Z) or tried to WRITE an imported binding, which ES modules
// forbid outright. Both failures are invisible until the line actually runs.
//
// The rule here: anything more than one drive module touches lives on `D` (or
// one of the exported containers) and is reached by PROPERTY access. Property
// writes work across modules; rebinding an import does not. If you need new
// shared state, add a field to `D` — never a bare `let` in a feature module.
import * as THREE from "three";

// ---- session-scoped mutable state ------------------------------------------
// Everything that used to be a rebindable module-level `let` in drive.js.
// Grouped by concern; reset by resetSession() on every beginSession().
export const D = {
  // --- overlay / renderer ---
  overlay: null,
  canvas: null,
  running: false,
  raf: 0,
  scene: null,
  camera: null,
  renderer: null,
  carGroup: null,
  wheels: null,
  sun: null,
  hudEls: null,

  // --- frame / input ---
  keys: {},
  lastT: 0,
  camPos: null, // null = snap the chase camera next frame
  steerVis: 0, // smoothed steering angle, for the visible front wheels
  anchor: null, // mirror of drive_geo's anchor for local reads

  // --- car / player ---
  vehicles: [], // {mesh,x,z,heading,hp,wrecked,lastFx,pendingBoom,burnUntil}
  activeV: null, // the vehicle `car` state drives (its mesh = carGroup)
  weapons: null, // FPS system instance (created once, lives on the scene)
  stepAcc: 0, // footstep distance accumulator
  bobT: 0, // head-bob phase
  charredMat: null, // shared burnt-out wreck material

  // --- session (mode-specific; null when the overlay is closed) ---
  ses: null,

  // --- world: buildings + roads ---
  bldGroup: null,
  roadGroup: null,
  bldPolys: [],
  bldRegistry: [],
  roadSegs: [],
  routeMesh: null,

  // --- Street View facades ---
  svDB: null,
  svBusy: false,
  svLastFetch: 0,
  svBudget: 60,

  // --- sky / time of day ---
  todIdx: 0,
  hemi: null,
  sky: null,
  skyUni: null,
  pmrem: null,
  envRT: null,
  skyT: 0,
  envCanvas: null,
  envTex: null,

  // --- audio ---
  audio: null,
  muted: false,

  // --- tyre marks ---
  skidMesh: null,
  skidPos: null,
  skidBirth: null,
  skidUni: null,
  skidHead: 0,

  // --- multiplayer ---
  unsubNet: null,
  lastCarSend: 0,
};

// ---- long-lived containers -------------------------------------------------
// Mutated in place, never reassigned, so a plain `const` export is safe.
export const groundTiles = new Map(); // "tx_ty" -> mesh
export const tileColors = new Map(); // "tx_ty" -> Uint8ClampedArray (RGBA 32×32)
export const bldChunks = new Set();
export const bldById = new Set();
export const roadById = new Set();
export const roadGrid = new Map(); // "gx_gz" -> [segIdx]
export const skidPrev = [null, null]; // last ground contact of each rear wheel

// meters / rad (0=north). rideY: smoothed ride height (null = snap next frame).
// pitchS/rollS track the terrain; dive/lean are the body's weight transfer.
export const car = {
  x: 0, z: 0, heading: 0, vx: 0, vz: 0, rideY: null,
  slip: 0, lastFwd: 0, pitchS: 0, rollS: 0, dive: 0, lean: 0,
};

// GTA-style: F bails out of the car into a first-person walker (pointer-lock
// mouse look + weapons, see js/weapons.js); F near any parked/abandoned car
// gets back behind the wheel. Parked cars spawn along streamed streets.
export const player = {
  x: 0, z: 0, y: 0, vy: 0, // feet position (meters, local frame)
  yaw: 0, pitch: 0, // look angles (yaw shares the car heading convention)
  onFoot: false, onGround: true,
};

export const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin("anonymous");

// ---- constants -------------------------------------------------------------
export const MAX_PARKED = 38;
export const PARKED_COLORS = [
  0x2f5d8a, 0x8a8d92, 0x27282c, 0xb0b4ba, 0x7a2d24,
  0x3f6b43, 0xc7a44a, 0x5b4a78, 0xd8d5cf, 0x9c3550,
];
export const ROAD_Y = 0.12; // asphalt float over the ground skin (crest-tear headroom)
export const CAR_Y = 0.06; // wheel-bottom clearance above whatever surface the car is on
export const RG = 40; // road-index bucket size (m)
export const SHADOW_HALF = 110;
export const GHOST_COLORS = [0x3d6ea5, 0x5d8a4e, 0xc2a24f, 0x8a5d9e, 0x4e8a8a];
export const HUD_ARC = 138.2; // path length of the semicircular gauge arc

// ---- helpers ---------------------------------------------------------------
export function fmtMs(ms) {
  const m = Math.floor(ms / 60000),
    s = Math.floor((ms % 60000) / 1000),
    d = Math.floor((ms % 1000) / 100);
  return m + ":" + (s < 10 ? "0" : "") + s + "." + d;
}

// Per-session reset. Anything cached across sessions on purpose (audio ctx,
// mute flag, the Street View IndexedDB handle, materials) is deliberately NOT
// cleared here — see stopDrive() for teardown that must dispose GPU objects.
export function resetSessionState() {
  D.camPos = null;
  D.steerVis = 0;
  D.stepAcc = 0;
  D.bobT = 0;
  D.bldPolys = [];
  D.bldRegistry = [];
  D.roadSegs = [];
  D.svBudget = 60;
  D.svLastFetch = 0;
  D.lastCarSend = 0;
  bldChunks.clear();
  bldById.clear();
  roadById.clear();
  roadGrid.clear();
  tileColors.clear();
  skidPrev[0] = skidPrev[1] = null;
  Object.assign(car, {
    x: 0, z: 0, heading: 0, vx: 0, vz: 0, rideY: null,
    slip: 0, lastFwd: 0, pitchS: 0, rollS: 0, dive: 0, lean: 0,
  });
  Object.assign(player, {
    x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: 0, onFoot: false, onGround: true,
  });
}

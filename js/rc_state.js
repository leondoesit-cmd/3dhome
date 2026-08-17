/* Micro-RC shared state + tuning. */
// Micro RC truck racing inside the home model.
// The cars drive on the main view3d scene floor (units = cm): a 2D+height
// collision model is precomputed from wall segments (with door gaps cut) plus
// the world AABBs of furniture meshes, so trucks slalom between table legs,
// bounce off sofas, CLIMB low ledges (rugs, books, step-ramps ≤ STEP_H), drive
// across furniture tops and fall off edges under gravity. The player's truck
// body can be any custom model designed in the modeler (js/modeler.js) —
// wheels are added automatically. F exits the truck into a micro on-foot
// figure (and re-enters / steals the nearest truck), mirroring js/drive.js.
// Cars carry hit points: wall slams, rams and hard landings damage them until
// the truck bursts into tumbling parts and respawns at its last gate.
import * as THREE from "three";
import { S, clamp, fin } from "./state.js";
import {
  wallGeom,
  detectRooms,
  roomHidden,
  hiddenSets,
  pointInPoly,
} from "./geometry.js";
import { FURN } from "./furniture.js";
import { openModeler } from "./modeler.js";

import { buildRoad } from "./track.js";
import { surfaceHeightAt, surfaceHeightNear, surfaceSampleAt } from "./road_surface.js";
import { t } from "./i18n.js";
import {
  kartInit,
  kartBuild,
  kartClear,
  kartReset,
  kartTick,
  kartUse,
  kartSlot,
  kartSpark,
  kartHit,
  kartOnWreck,
  kartSetOn,
  kartIsOn,
} from "./kart.js";
import {
  editorInit,
  editorOpen,
  editorClose,
  editorActive,
  editorSynced,
  editorTick,
  editorPointerDown,
  editorPointerMove,
  editorPointerUp,
  editorContext,
} from "./rc_editor.js";
import {
  has3D,
  ensureBuilt,
  getMainScene,
  getMainCamera,
  setExternalTick,
  orbitRefresh,
  toggleWalk,
  isWalk,
} from "./view3d.js";



export const hooks = {
  updateHpBar: null,
  showMsg: null,
  syncCarMesh: null,
};

// ---- tuning (cm, seconds) — micro scale: a ~3.8cm truck ---------------------
export let BODY_L = 3.8, // target truck body length (custom models are scaled to this)
  WHEEL_R = 0.7,
  AXLE_Z = 1.3, // front/rear axle offset from center
  TRACK_X = 1.1, // wheel lateral offset
  COLL_R = 1.8, // car collision circle radius
  CAR_CLEAR = 2.6, // body height band used for "does this AABB block me"
  // NOT halved with the truck: the floor-level road deck and the jump's kicker
  // both have to stay climbable, and a forgiving step is what keeps a truck
  // from being stopped dead by a rug edge
  STEP_H = 2.2, // max ledge the truck can climb (rug, book, step ramp)
  GRAV = 600, // cm/s² — a touch under real so falls read nicely at micro scale
  MAXV = 78, // calmer scale speed: enough for jumps without feeling like top gear
  REV_MAX = 28,
  ACC = 88,
  BRAKE = 240,
  DRAG = 1.65, // releases the throttle into useful engine braking
  TURN_MAX = 3.35, // progressive steering instead of twitchy full-speed rotation
  PASS_R = 20, // checkpoint pass radius (player)
  PASS_R_AI = 30,
  PASS_R_MINOR = 42, // smoothing waypoints collect generously — no gate hunting
  FOOT_SPD = 11,
  FOOT_RUN = 19,
  FOOT_R = 0.6,
  FOOT_CLEAR = 2,
  FIG_STEP = 0.9,
  FIG_SCALE = 0.013, // micro figure ≈ 2.3cm tall
  MAX_HP = 100,
  WRECK_RESPAWN_MS = 2600,
  // ---- water pools (track-builder tool) ----
  WATER_R = 26, // default pool radius
  WATER_SURF = 0.45, // water surface height above the floor — under the road
  // deck, so a pool the circuit crosses stays a floor hazard
  WATER_SINK = 0.7, // cosmetic body sink while wading
  WATER_MAXV = 0.45, // top-speed fraction while in water
  // ---- kart layer: drift, mini-turbo, boosts (see js/kart.js) ----
  DRIFT_MIN_V = 40, // speed needed to hop into a drift
  DRIFT_TIER = [0.7, 1.6, 2.7], // seconds of charge per spark colour
  DRIFT_BOOST = [520, 900, 1400], // ms of mini-turbo per tier
  HOP_MS = 0.26, // hop animation length
  BOOST_MULT = 1.55, // top-speed multiplier while boosting
  STAR_MULT = 1.22,
  SMALL_MULT = 0.6, // shrunk by lightning
  COIN_MULT = 0.022, // +2.2% top speed per coin (10 coins ≈ +22%)
  ROCKET_WIN = 620, // rocket-start window before GO
  ROCKET_MS = 1500, // boost it grants
  STALL_MS = 900; // penalty for jumping the start
export let AI_NAMES = ["Turbo", "Nitro", "Dusty", "Bolt", "Rusty", "Comet"];
export let AI_COLORS = [
  0xd94f3d, 0x3d8fd9, 0x53b06a, 0xb268d9, 0xd9a13d, 0x3dc9c0,
];
export let PLAYER_COLOR = 0xf2b23a;
export let MAX_OPP = 5;

// ---- difficulty -------------------------------------------------------------
// One place for every knob that separates a relaxed race from a real one. The
// bots were previously pinned at 0.88 skill with a permanent rubber band, which
// made them both unbeatable at the start and impossible to lose to at the end.
//   skill/step — top-speed fraction of the first bot, and the gap per grid slot
//   catchUp/slowLead — the rubber band, applied on lap+gate progress vs. player
//   items — how eagerly the bots fire what they pick up
//   look — how far ahead they read the road when braking for a bend
export const DIFFICULTY = {
  easy: { skill: 0.76, step: 0.03, catchUp: 1.03, slowLead: 0.86, items: 0.5, look: 3 },
  normal: { skill: 0.88, step: 0.05, catchUp: 1.08, slowLead: 0.95, items: 1, look: 4 },
  hard: { skill: 1.0, step: 0.035, catchUp: 1.02, slowLead: 0.995, items: 1.45, look: 5 },
};
export function diffCfg() {
  return DIFFICULTY[R.difficulty] || DIFFICULTY.normal;
}

// ---- module state -----------------------------------------------------------
export const R = {
  active: false,
  phase: "drive", // "drive" | "foot"
  cars: [], // player is the car with .ai === false
  fig: null, // micro on-foot figure {grp,x,y,z,heading}
  col: null, // {segs:[], doorSegs:[], rects:[]}
  track: null, // {wps:[{x,z,y,grp,ringMat}], sig}
  race: null, // {state:'count'|'run'|'done', t0, ...}
  laps: 3,
  opp: 2,
  mode: "race", // "race" = grid + rivals · "trial" = solo against the ghost
  difficulty: "normal", // see DIFFICULTY
  paused: false, // pause menu open — the sim and the clock both freeze
  camMode: "chase", // "chase" | "hood" | "cockpit"
  minimap: true, // corner map of the circuit (js/rc_minimap.js)
  ghostOn: true, // replay the best lap as a translucent truck in time trial
  volume: 0.8, // master audio level (0 = muted)
  bank: 0, // coins banked across every race — see bankAdd()
  tunes: {}, // truckKey -> physConfig, so each truck keeps its own setup
  mp: null, // multiplayer session (js/rc_mp.js) when racing a friend
  truckKey: "", // "" = built-in default truck
  keys: {},
  cam: { pos: null, yawOff: 0, dist: 24, drag: false, lx: 0 },
  // editor overview camera (js/rc_editor.js 👁 button)
  edCam: { on: false, cx: 0, cz: 0, dist: 400 },
  openedDoors: [],
  shards: [], // flying wreck debris {m,vx,vy,vz,rx,ry,rz,t0,gy}
  waters: [], // placed pools {x,z,r,grp,mat}
  waterTool: false, // panel 💧 toggle: clicks in the 3D view add/remove pools
  touch: {}, // held on-screen controls (phones/tablets)
  pad: { item: false, rescue: false, menu: false }, // gamepad edge state
  spray: [], // short-lived water droplets {m,vx,vy,vz,t0}
  hud: null,
  audio: null,
  colDirty: false,
  // invisible guard walls along the floor-level road. ON by default: the road
  // now tours the whole flat, so driving off it is nearly always a mistake
  // rather than a choice. Turn it off to roam the rooms freely.
  walls: true,
  // The apartment IS the circuit: no ribbon on the floor, the route climbs onto
  // the furniture, and road is built only where nothing in the room can carry a
  // truck — access ramps, short bridges and the jump. ON by default; the full
  // Rainbow-Road ribbon (spiral, flyover) is one click away.
  homeMode: true,
  msgT: 0,
  prevNear: null,
  prevFov: null,
  // ---- track editor state (js/rc_editor.js owns the UI) ----
  customAnchors: null,
  anchorsSig: null, // the plan those anchors were drawn on — see planSig()
  // "pass by this side of the sofa, this way round" — the editor's face rules.
  // They only mean anything together with customAnchors (the anchors carry each
  // rule's id), so they are stored and cleared with them.
  faceRules: null,
  roadWidth: 26,
  highElevation: 105,
  roadTheme: "asphalt",
  // Continuous and fully guarded is the safe default. A deliberate ramp jump
  // can still be enabled in the track editor for layouts with enough runway.
  hasJump: false,
  physConfig: {
    MAXV: 78,
    ACC: 88,
    TURN_MAX: 3.35,
    GRAV: 600,
    BRAKE: 240,
  },
};

// A route is drawn for ONE apartment: anchors laid out in a studio are nonsense
// the moment the walls move, so every stored route carries the plan it was made
// for and is dropped when that plan no longer matches. Walls only — moving a
// sofa doesn't invalidate a lap, and the sig is order-independent so a wall
// deleted and redrawn in place still counts as the same flat.
export function planSig() {
  var parts = [];
  S.walls.forEach(function (w) {
    var g = wallGeom(w);
    if (g.L < 1) return;
    var a = Math.round(g.a.x / 10) + ":" + Math.round(g.a.z / 10),
      b = Math.round(g.b.x / 10) + ":" + Math.round(g.b.z / 10);
    parts.push(a < b ? a + "|" + b : b + "|" + a);
  });
  parts.sort();
  var s = parts.join(","),
    h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return parts.length + "-" + h.toString(36);
}

// The stored route, but only if it belongs to the flat on screen. A mismatch
// clears it so the auto tour takes over instead of draping the old lap over
// whatever was generated.
export function customAnchors() {
  if (!R.customAnchors || R.customAnchors.length < 3) return null;
  if (R.anchorsSig && R.anchorsSig === planSig()) return R.customAnchors.slice();
  R.customAnchors = null;
  R.anchorsSig = null;
  R.faceRules = null;
  prefsSave();
  return null;
}

// ---- garage -----------------------------------------------------------------
// A setup belongs to a truck: a monster-truck tune on a drift kart is nonsense,
// and re-dialling four sliders every time you switch trucks is worse. The
// active R.physConfig is still the single source the physics reads — these two
// just park a copy under the truck it was dialled for.
export function tuneKey() {
  return R.truckKey || "__default";
}
export function tuneStore() {
  R.tunes[tuneKey()] = Object.assign({}, R.physConfig);
}
export function tuneLoad() {
  var saved = R.tunes[tuneKey()];
  if (saved) R.physConfig = Object.assign({}, R.physConfig, saved);
  applyPhysicsConfig();
}

// Coins are spent inside a race (top speed) and banked after it, so designing
// and racing a truck accumulates something that outlives the session.
export function bankAdd(n) {
  if (!fin(n) || n <= 0) return R.bank;
  R.bank = Math.round(R.bank + n);
  prefsSave();
  return R.bank;
}

export function applyPhysicsConfig() {
  if (!R.physConfig) return;
  if (fin(R.physConfig.MAXV)) MAXV = R.physConfig.MAXV;
  if (fin(R.physConfig.ACC)) ACC = R.physConfig.ACC;
  if (fin(R.physConfig.TURN_MAX)) TURN_MAX = R.physConfig.TURN_MAX;
  if (fin(R.physConfig.GRAV)) GRAV = R.physConfig.GRAV;
  if (fin(R.physConfig.BRAKE)) BRAKE = R.physConfig.BRAKE;
}

export function prefsLoad() {
  try {
    var p = JSON.parse(localStorage.getItem("home3d_rc") || "{}");
    if (p.truck != null) R.truckKey = p.truck;
    if (fin(p.opp)) R.opp = clamp(p.opp, 0, MAX_OPP);
    if (fin(p.laps)) R.laps = clamp(p.laps, 1, 9);
    if (p.items != null) kartSetOn(!!p.items);
    if (p.walls != null) R.walls = !!p.walls;
    if (p.homeMode != null) R.homeMode = !!p.homeMode;
    if (Array.isArray(p.customAnchors)) R.customAnchors = p.customAnchors;
    if (Array.isArray(p.faceRules)) R.faceRules = p.faceRules;
    if (p.anchorsSig) R.anchorsSig = p.anchorsSig;
    if (p.mode === "race" || p.mode === "trial") R.mode = p.mode;
    if (DIFFICULTY[p.difficulty]) R.difficulty = p.difficulty;
    if (p.camMode === "chase" || p.camMode === "hood" || p.camMode === "cockpit")
      R.camMode = p.camMode;
    if (p.minimap != null) R.minimap = !!p.minimap;
    if (p.ghostOn != null) R.ghostOn = !!p.ghostOn;
    if (fin(p.volume)) R.volume = clamp(p.volume, 0, 1);
    if (fin(p.bank)) R.bank = Math.max(0, Math.round(p.bank));
    if (p.tunes && typeof p.tunes === "object") R.tunes = p.tunes;
    if (fin(p.roadWidth)) R.roadWidth = p.roadWidth;
    if (fin(p.highElevation)) R.highElevation = p.highElevation;
    if (p.roadTheme) R.roadTheme = p.roadTheme;
    // Safety v2 changed the default circuit from an unavoidable open gap to a
    // continuous deck. Do not carry the legacy `true` default forward; after
    // this one-time migration, an explicit editor choice is persisted normally.
    if (p.safetyVersion >= 2 && p.hasJump != null) R.hasJump = !!p.hasJump;
    else R.hasJump = false;
    if (p.physConfig) {
      R.physConfig = Object.assign({}, R.physConfig, p.physConfig);
      applyPhysicsConfig();
    }
  } catch (e) {}
}
export function prefsSave() {
  try {
    localStorage.setItem(
      "home3d_rc",
      JSON.stringify({
        truck: R.truckKey,
        opp: R.opp,
        laps: R.laps,
        mode: R.mode,
        difficulty: R.difficulty,
        camMode: R.camMode,
        minimap: R.minimap,
        ghostOn: R.ghostOn,
        volume: R.volume,
        bank: R.bank,
        tunes: R.tunes,
        items: kartIsOn(),
        walls: R.walls,
        homeMode: R.homeMode,
        customAnchors: R.customAnchors,
        faceRules: R.faceRules,
        anchorsSig: R.anchorsSig,
        roadWidth: R.roadWidth,
        highElevation: R.highElevation,
        roadTheme: R.roadTheme,
        hasJump: R.hasJump,
        safetyVersion: 2,
        physConfig: R.physConfig,
      }),
    );
  } catch (e) {}
}



export function rcActive() {
  return R.active;
}

/* Night Shift gameplay: weapons, HUD, player, waves, input, mode toggle. */
import * as THREE from "three";
import { legacyIntensity } from "./gpu.js";
import { S, clamp, fin } from "./state.js";
import {
  has3D,
  init3D,
  getMainScene,
  getMainCamera,
  getDynGroup,
  setExternalTick,
  ensureBuilt,
  isWalk,
  toggleWalk,
  orbitRefresh,
  setQualityPreset,
  setGameRendererQuality,
  clearGameRendererQuality,
  setGameRenderEffect,
} from "./view3d.js";
import { t } from "./i18n.js";
import { awardRunPoints, encounterCap, securedCount, reachableFloor, cameraPose } from "./zombies_rules.js";
import { createBodyCamera } from "./zombies_camera.js";
import { pointInPoly, roomName } from "./geometry.js";
import {
  Z, hooks, zActive, EYE, EYE_CROUCH, P_RAD, P_CLEAR, STEP, SPD_WALK, SPD_SPRINT, SPD_CROUCH,
  ACCEL, GRAV, MAX_HP, MAX_ARMOR, Z_MAX_ALIVE, REST_LEN, RUN_WAVES, EXTRACT_LEN, rr, pick, rnd,
} from "./zombies_state.js";
import {
  buildCol,
  blockedAt,
  buildFlashlight,
  collideCircle,
  moveCircle,
  damageZed,
  decal,
  ensureTex,
  enterHorror,
  exitHorror,
  freeSpot,
  groundAt,
  initFX,
  interiorBounds,
  liveRooms,
  losClear,
  makeNoise,
  noRaycast,
  removeZed,
  shake,
  sparkBurst,
  dustBurst,
  impactMark,
  buildMoonBeams,
  spawnZed,
  stepFX,
  stepFlashlight,
  stepLamps,
  stepMoonBeams,
  stepZed,
  stepZedVisuals,
  setFXDensity,
  setNightShiftQuality,
  tracer,
  clearZedGeoCache,
  prewarmRigs,
  ownsGeo,
  igniteZed,
  severPart,
  spawnPart,
  spawnFirePart,
  boneBurst,
  harvestPracticals,
  applyHorrorGrade,
  resetTexCache,
  Z_TYPES,
  stepAcidClouds,
  clearAcidClouds,
  stepWeather,
  isNearBloodDecal,
  isNearGlassDebris,
} from "./zombies_world.js";
import {
  enableDestruction,
  disableDestruction,
  destructReady,
  damageWorld,
  explodeWorld,
  stepDestruct,
  setGameDestructionMode,
} from "./zombies_destruct.js";
import { buildExterior, stepEnv, clearEnv, resetEnvMats } from "./zombies_env.js";
import {
  tex,
  normalTex,
  roughTex,
  roughBoost,
  setTexBudget,
  disposeTexLib,
} from "./zombies_tex.js";
import { dampingFactor, forEachPhysicsStep, safeDeltaSeconds } from "./physics_runtime.js";
import { isPhysicsEnabled, moveKinematicCapsule } from "./physics_facade.js";
import { initCritters, stepCritters, clearCritters } from "./zombies_critters.js";
import {
  bindEvents, jump, pauseGame, shove, syncResponsiveHud, tick, touchPulse,
  unbindEvents, unlockPointer, wantsTouchControls,
} from "./zombies_game/input.js";
import {
  buyIntermission, initRadar, objectiveCount, objectiveLabel,
  objectiveProgress, removeNavMarker, spawnFuseBox, spawnPerkStations,
  startWave, updateInteractPrompt,
} from "./zombies_game/world_spawns.js";
import {
  audioClose, buildHud, flashScreen, hitMarker, hudDirty, hurtPlayer,
  loadBloodImgs, newPlayer, say,
} from "./zombies_game/hud.js";
import {
  sndBlast, sndClick, sndDeath, sndDoor, sndFlame, sndFlesh, sndGrowl,
  sndHammer, sndImpact, sndPerk, sndPickup, sndPower, sndReload, sndScream,
  sndShot, sndSwipe, sndThunder, sndWhoosh,
} from "./zombies_game/audio.js";
import { audio, clearPickups, setWeapon } from "./zombies_game/weapons.js";
// for js/zombies_game/input.js (live bindings: it sees every reassignment)
export { JUMP_V, KEYMAP, W, _movePoint2D, gameSettings };
// for js/zombies_game/world_spawns.js (live bindings: it sees every reassignment)
export {
  FRAG, INTERMISSION_OFFERS, MIN_SPAWN_DIST, W_ORDER, houseAliveCap,
  qualityHordeCap, spawnInsideHouse,
};
// for js/zombies_game/hud.js (live bindings: it sees every reassignment)
export {
  BLOOD_SRC, BLOOD_TINTS, PAUSE_CONTROLS, applyGameSettings, bloodImgs,
  hudNeedsUpdate, restart, saveGameSettings, set_bloodImgs,
  set_hudNeedsUpdate, syncSettingsUi,
};
// for js/zombies_game/audio.js (live bindings: it sees every reassignment)
export { ambT, set_ambT };
// for js/zombies_game/weapons.js (live bindings: it sees every reassignment)
export {
  W_UNLOCK, _camDir, _rc, _tmpIdx, _tmpVecs, _v0, _v1, buildViewModel,
  set__tmpIdx, vm, vmCache,
};


export function zSpawnTest(type, dist) {
  if (!Z.active) return null;
  Z.zeds.slice().forEach(removeZed);
  Z.zeds = [];
  var d = dist || 240;
  var zd = spawnZed(type || "walker", Z.p.x + Math.sin(Z.p.yaw) * d, Z.p.z + Math.cos(Z.p.yaw) * d);
  zd.alerted = true;
  zd.state = "chase";
  return { x: zd.x, z: zd.z, type: zd.type };
}

/* ===========================================================================
   6. WEAPONS — household melee + firearms, procedural viewmodels
   =========================================================================== */
var W = {
  knife: {
    melee: true, dmg: 38, rate: 0.3, reach: 86, arc: 0.52, key: "z_w_knife",
    icon: "🔪", stagger: 0.22, dismember: 0.18, swing: 0.2, hand: "stab",
  },
  hammer: {
    melee: true, dmg: 58, rate: 0.58, reach: 90, arc: 0.58, key: "z_w_hammer",
    icon: "🔨", stagger: 0.55, dismember: 0.28, swing: 0.28, hand: "chop",
  },
  pan: {
    melee: true, dmg: 44, rate: 0.64, reach: 96, arc: 1.0, key: "z_w_pan",
    icon: "🍳", stagger: 0.9, dismember: 0.06, swing: 0.32, hand: "swing",
  },
  bat: {
    melee: true, dmg: 52, rate: 0.6, reach: 124, arc: 0.88, key: "z_w_bat",
    icon: "🏏", stagger: 0.75, dismember: 0.12, swing: 0.3, hand: "swing",
  },
  axe: {
    melee: true, dmg: 88, rate: 0.88, reach: 110, arc: 0.6, key: "z_w_axe",
    icon: "🪓", stagger: 0.7, dismember: 0.85, swing: 0.38, hand: "chop",
  },
  pistol: {
    dmg: 28, rpm: 360, mag: 12, reserve: 72, pellets: 1, spread: 0.007,
    bloom: 0.014, kick: 0.014, auto: false, reload: 1.05, key: "z_w_pistol",
    icon: "🔫", noise: 1500, snd: { cut: 2800, dur: 0.18, gain: 0.52 },
  },
  smg: {
    dmg: 16, rpm: 820, mag: 36, reserve: 144, pellets: 1, spread: 0.022,
    bloom: 0.009, kick: 0.008, auto: true, reload: 1.55, key: "z_w_smg",
    icon: "🔫", noise: 1750, snd: { cut: 2200, dur: 0.14, gain: 0.44 },
  },
  shotgun: {
    dmg: 16, rpm: 82, mag: 7, reserve: 35, pellets: 10, spread: 0.055,
    bloom: 0.028, kick: 0.04, auto: false, reload: 2.4, key: "z_w_shotgun",
    icon: "🔫", noise: 2400, snd: { cut: 1500, dur: 0.34, gain: 0.88 },
  },
  nailgun: {
    dmg: 24, rpm: 300, mag: 28, reserve: 140, pellets: 1, spread: 0.012,
    bloom: 0.01, kick: 0.01, auto: true, reload: 1.35, key: "z_w_nailgun",
    icon: "⚙️", noise: 850, snd: { cut: 3400, dur: 0.11, gain: 0.36 },
  },
  // Flamethrower: not hitscan at all. It projects a short cone of fuel that
  // ignites anything inside it — low instant damage, but burning is a death
  // sentence that also spreads. "mag" is the tank, reloading swaps bottles.
  flamer: {
    flame: true, dmg: 13, rpm: 600, mag: 220, reserve: 440, pellets: 1,
    spread: 0, bloom: 0.004, kick: 0.004, auto: true, reload: 2.6,
    key: "z_w_flamer", icon: "🔥", noise: 900, reach: 300, arc: 0.42,
    snd: { cut: 900, dur: 0.2, gain: 0.3 },
  },
};
var W_ORDER = ["knife", "hammer", "pan", "bat", "axe", "pistol", "smg", "shotgun", "nailgun", "flamer"];
// Still used if a weapon is locked. Dev builds start with the full kit so every
// gun and melee can be tested without scavenging a pickup first.
var W_UNLOCK = ["shotgun", "hammer", "smg", "bat", "axe", "nailgun", "flamer", "pan"];
var PAUSE_CONTROLS = [
  { kbd: "WASD", key: "z_control_move" },
  { kbd: "SHIFT", key: "z_control_sprint" },
  { kbd: "SPACE", key: "z_control_jump" },
  { kbd: "X", key: "z_control_shove" },
  { kbd: "R", key: "z_control_reload" },
  { kbd: "F", key: "z_control_flash" },
  { kbd: "E", key: "z_touch_interact" },
  { kbd: "LMB", key: "z_touch_fire" },
];

/* --- frag grenades -------------------------------------------------------
   Thrown on G, not a slot weapon: cooked by a fuse, not by contact, so they
   bounce into the next room and go off behind the door. */
var FRAG = {
  fuse: 2.6,
  radius: 420,       // lethal-ish core, damage falls off to nothing at the edge
  dmg: 215,
  power: 1.35,       // blast strength handed to the destruction stack
  throwV: 720,
  maxCarry: 6,
};

var Z_SETTINGS_KEY = "home3d_nightshift_settings";
function gameSettings() {
  if (Z.settings) return Z.settings;
  var saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(Z_SETTINGS_KEY) || "{}") || {};
  } catch (e) {}
  var savedQuality = Number(saved.quality),
    savedDestruct = Number(saved.destruct),
    savedAlive = Number(saved.maxAlive),
    savedFx = Number(saved.fx),
    savedSens = Number(saved.sens),
    savedVol = Number(saved.volume);
  var quality = fin(savedQuality) ? Math.round(clamp(savedQuality, 0, 2)) : 0;
  Z.settings = {
    quality: quality,
    sandbox: !!saved.sandbox,
    difficulty: ["easy", "normal", "hard"].includes(saved.difficulty) ? saved.difficulty : "normal",
    bodycam: saved.bodycam !== false,
    fov: fin(Number(saved.fov)) ? clamp(Number(saved.fov), 60, 95) : 82,
    shake: fin(Number(saved.shake)) ? clamp(Number(saved.shake), 0, 1) : 0.45,
    bob: fin(Number(saved.bob)) ? clamp(Number(saved.bob), 0, 1) : 0.5,
    lens: fin(Number(saved.lens)) ? clamp(Number(saved.lens), 0, 1) : 0.65,
    flashes: fin(Number(saved.flashes)) ? clamp(Number(saved.flashes), 0, 1) : 0.35,
    blood: saved.blood !== false,
    // no saved choice: match the old coupling (destruction only at High)
    // rather than defaulting low-spec devices into paying for physics
    destruct: fin(savedDestruct) ? Math.round(clamp(savedDestruct, 0, 2)) : quality >= 2 ? 2 : 0,
    maxAlive: fin(savedAlive) ? Math.round(clamp(savedAlive, 8, 16)) : 12,
    fx: fin(savedFx) ? Math.round(clamp(savedFx, 25, 100)) : 50,
    // 1.0 matches the original look speed. 70% volume keeps the previous master gain.
    sens: fin(savedSens) ? clamp(savedSens, 0.35, 2.4) : 1,
    invertY: !!saved.invertY,
    volume: fin(savedVol) ? Math.round(clamp(savedVol, 0, 100)) : 70,
  };
  return Z.settings;
}
function saveGameSettings() {
  try {
    localStorage.setItem(Z_SETTINGS_KEY, JSON.stringify(gameSettings()));
  } catch (e) {}
}
function applyGameSettings() {
  var cfg = gameSettings();
  Z.sens = cfg.sens;
  if (Z.active) setGameRendererQuality(cfg.quality);
  setNightShiftQuality(cfg.quality);
  setFXDensity(cfg.fx / 100);
  syncDestruction(cfg.destruct);
  if (Z.hud && Z.hud.root) Z.hud.root.classList.toggle("z-lite", cfg.quality === 0);
  if (Z.hud) {
    Z.hud.root.classList.toggle("z-no-blood", !cfg.blood);
    Z.hud.root.classList.toggle("z-no-flashes", cfg.flashes === 0);
    Z.hud.root.classList.toggle("z-bodycam", cfg.bodycam);
  }
  if (Z.active) setGameRenderEffect(cfg.bodycam && cfg.lens > 0 ? bodyCameraFactory : null);
  applyAudioVolume();
}
function applyAudioVolume() {
  var A = Z.audio;
  if (!A || !A.master || !A.ctx) return;
  var v = (gameSettings().volume || 0) / 100;
  try {
    A.master.gain.setTargetAtTime(0.88 * v, A.ctx.currentTime, 0.02);
  } catch (e) {
    A.master.gain.value = 0.88 * v;
  }
}
function qualityHordeCap() {
  return 16; // Graphics quality never changes encounter rules.
}
function bodyCameraFactory(renderer, scene, camera) {
  var effect = createBodyCamera(renderer, scene, camera);
  return { render: function () { effect.render(gameSettings(), Z.t, Z.blackout); }, dispose: effect.dispose };
}
// A 12 m² studio cannot host the graphics-tier horde cap. One live threat
// per ~6 m² keeps wave 1 from stacking eight walkers on the player.
function houseAliveCap() {
  var b = interiorBounds();
  if (!b) return 16;
  var areaM2 = ((b.maxx - b.minx) * (b.maxz - b.minz)) / 10000;
  return Math.max(2, Math.min(16, Math.floor(areaM2 / 6) || 2));
}
function spawnInsideHouse(x, z) {
  var rooms = liveRooms();
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].pts && pointInPoly(x, z, rooms[i].pts)) return true;
  }
  return false;
}
function syncDestruction(destructMode) {
  if (!Z.active) return;
  var d = destructMode != null ? destructMode : gameSettings().destruct;
  setGameDestructionMode(d);
}
function syncSettingsUi() {
  if (!Z.hud || !Z.hud.qualitySlider) return;
  var cfg = gameSettings(),
    qualityKeys = ["z_quality_fast", "z_quality_balanced", "z_quality_high"],
    destructKeys = ["z_destruct_off", "z_destruct_parts", "z_destruct_full"],
    qualityCap = qualityHordeCap(),
    effectiveHorde = Math.min(cfg.maxAlive, qualityCap);
  Z.hud.qualitySlider.value = cfg.quality;
  if (Z.hud.destructSlider) {
    Z.hud.destructSlider.value = cfg.destruct != null ? cfg.destruct : 1;
    Z.hud.destructValue.textContent = t(destructKeys[cfg.destruct != null ? cfg.destruct : 1]);
  }
  Z.hud.hordeSlider.max = qualityCap;
  Z.hud.hordeSlider.value = effectiveHorde;
  Z.hud.fxSlider.value = cfg.fx;
  Z.hud.qualityValue.textContent = t(qualityKeys[cfg.quality]);
  Z.hud.hordeValue.textContent = effectiveHorde;
  Z.hud.fxValue.textContent = cfg.fx + "%";
  if (Z.hud.sensSlider) {
    Z.hud.sensSlider.value = Math.round(cfg.sens * 100);
    Z.hud.sensValue.textContent = Math.round(cfg.sens * 100) + "%";
  }
  if (Z.hud.volSlider) {
    Z.hud.volSlider.value = cfg.volume;
    Z.hud.volValue.textContent = cfg.volume + "%";
  }
  if (Z.hud.invertY) Z.hud.invertY.checked = !!cfg.invertY;
}

/* --- procedural viewmodels (centimetres, camera space: -Z = forward) ------- */
/* Everything textured in the mode, released together. Leaving Night Shift
   used to hand back the geometry but keep every 1024² map resident for the
   rest of the planner session, which on a laptop GPU is real memory taken
   from the design view the user just went back to. */
function dropTextureCaches() {
  for (var k in VMAT) VMAT[k].dispose();
  VMAT = {};
  resetTexCache();
  resetEnvMats();
  disposeTexLib();
}

// Relief per weapon material. The viewmodel sits ~30cm from the near plane
// and is the one thing on screen in every single frame, so it is worth the
// derived maps: machining marks on steel, grain in the stock, pitting on
// rust. Wood is the deepest, polished steel the shallowest.
var WPN_RELIEF = {
  "assets/textures/wpn_metal.jpg": 1.2,
  "assets/textures/wpn_wood.jpg": 2.4,
  "assets/textures/wpn_rust.jpg": 2.8,
};

var VMAT = {};
function vm(hex, rough, metal, mapUrl, rep) {
  var k = hex + "|" + rough + "|" + metal + "|" + (mapUrl || "") + "|" + (rep || 1);
  if (!VMAT[k]) {
    var params = {
      color: hex,
      roughness: rough,
      metalness: metal,
    };
    if (mapUrl) {
      var r = rep || 1,
        shiny = metal > 0.5,
        lo = shiny ? 0.45 : 0.55;
      params.map = tex(mapUrl, { rep: r });
      params.normalMap = normalTex(mapUrl, {
        rep: r,
        strength: WPN_RELIEF[mapUrl] == null ? 1.6 : WPN_RELIEF[mapUrl],
      });
      params.normalScale = new THREE.Vector2(1, 1);
      // Metal polishes up where the map is bright (handled edges), wood and
      // rust do the opposite; invert carries that.
      params.roughnessMap = roughTex(mapUrl, { rep: r, lo: lo, invert: shiny });
      params.roughness = Math.min(1, rough * roughBoost(lo));
    }
    VMAT[k] = new THREE.MeshStandardMaterial(params);
  }
  return VMAT[k];
}
function vbox(g, w, h, d, x, y, z, m, rx, ry, rz) {
  var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  if (rx) o.rotation.x = rx;
  if (ry) o.rotation.y = ry;
  if (rz) o.rotation.z = rz;
  g.add(o);
  return o;
}
function vcyl(g, r1, r2, h, x, y, z, m, rx, rz) {
  var o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), m);
  o.position.set(x, y, z);
  if (rx) o.rotation.x = rx;
  if (rz) o.rotation.z = rz;
  g.add(o);
  return o;
}

function buildViewModel(key) {
  var g = new THREE.Group(),
    steel = vm(0x9aa0a8, 0.28, 0.92, "assets/textures/wpn_metal.jpg", 1),
    dark = vm(0x242830, 0.48, 0.65, "assets/textures/wpn_metal.jpg", 1),
    wood = vm(0x6e4c2e, 0.7, 0.06, "assets/textures/wpn_wood.jpg", 1),
    rubber = vm(0x16171b, 0.95, 0),
    brass = vm(0xb08a4a, 0.4, 0.7, "assets/textures/wpn_rust.jpg", 1),
    muzzle = new THREE.Object3D();
  if (key === "knife") {
    vbox(g, 2.4, 0.55, 16, 0, 0, -10, steel);
    var tip = vbox(g, 2.4, 0.55, 6, 0, 0, -19.5, steel);
    tip.scale.set(0.35, 1, 1);
    // fuller groove
    vbox(g, 0.6, 0.2, 12, 0, 0.35, -10, vm(0x6a7078, 0.25, 0.95));
    vbox(g, 3.6, 2.2, 4, 0, 0, -1, brass); // guard
    vbox(g, 3.0, 2.4, 10, 0, 0, 5, rubber);
    muzzle.position.set(0, 0, -22);
  } else if (key === "hammer") {
    vcyl(g, 1.4, 1.5, 28, 0, 0, -5, wood, Math.PI / 2);
    vbox(g, 5.0, 4.6, 10, 0, 0.5, -18, steel);
    vbox(g, 3.4, 7.2, 3.2, 0, -0.5, -23, steel, 0.35);
    vcyl(g, 1.8, 1.8, 4, 0, 0, 8, rubber, Math.PI / 2);
    muzzle.position.set(0, 0, -22);
  } else if (key === "pan") {
    vcyl(g, 12, 12.5, 3.2, 0, 0, -23, dark, Math.PI / 2);
    vcyl(g, 10, 10.4, 2.4, 0, 0, -22.4, vm(0x3d4046, 0.35, 0.55), Math.PI / 2);
    vcyl(g, 1.25, 1.25, 20, 0, 0, -6, rubber, Math.PI / 2);
    vcyl(g, 1.6, 1.6, 3, 0, 0, 5, dark, Math.PI / 2);
    muzzle.position.set(0, 0, -26);
  } else if (key === "bat") {
    vcyl(g, 1.5, 3.6, 44, 0, 0, -18, wood, Math.PI / 2);
    vcyl(g, 1.9, 1.9, 12, 0, 0, 4, rubber, Math.PI / 2);
    vcyl(g, 2.4, 2.4, 2, 0, 0, 10, dark, Math.PI / 2);
    for (var n = 0; n < 7; n++)
      vcyl(g, 0.3, 0.22, 7, Math.cos(n * 1.7) * 3.2, Math.sin(n * 1.7) * 3.2, -24 - n * 2.6, steel, 0, Math.PI / 2);
    muzzle.position.set(0, 0, -40);
  } else if (key === "axe") {
    vcyl(g, 1.6, 2.0, 42, 0, 0, -14, wood, Math.PI / 2);
    vbox(g, 1.8, 14, 14, 0, 2.6, -32, steel);
    vbox(g, 1.5, 15, 5, 0, 2.6, -39, vm(0xc4ccd4, 0.18, 0.95));
    // bit edge shine
    vbox(g, 0.5, 14, 2, 0.9, 2.6, -40, vm(0xe8eef4, 0.15, 1));
    muzzle.position.set(0, 0, -36);
  } else if (key === "shotgun") {
    vcyl(g, 1.45, 1.45, 48, -1.0, 0.2, -22, steel, Math.PI / 2);
    vcyl(g, 1.45, 1.45, 48, 1.0, 0.2, -22, steel, Math.PI / 2);
    vbox(g, 5.2, 5.8, 18, 0, -1.0, -2, wood);
    vbox(g, 4.2, 8, 14, 0, -4.2, 8, wood, 0.28);
    vbox(g, 4.8, 3.6, 14, 0, -3.2, -22, wood);   // pump
    vbox(g, 2, 2, 6, 0, 3.2, -8, dark); // sight
    muzzle.position.set(0, 0.2, -48);
  } else if (key === "smg") {
    vbox(g, 5.2, 7.2, 24, 0, 0, -6, dark);
    vcyl(g, 1.15, 1.15, 26, 0, 1.5, -26, steel, Math.PI / 2);
    vcyl(g, 1.6, 1.6, 4, 0, 1.5, -38, steel, Math.PI / 2); // suppressor ring
    vbox(g, 3.2, 14, 5.5, 0, -9, -4, dark, 0.16);    // magazine
    vbox(g, 3.2, 6.5, 9, 0, -5.2, 7, dark, 0.48);       // grip
    vbox(g, 1.5, 1.5, 16, 0, 4.6, -12, dark);    // rail
    vbox(g, 4, 2, 6, 0, 5.5, -8, dark); // optic base
    muzzle.position.set(0, 1.5, -40);
  } else if (key === "nailgun") {
    vbox(g, 6.5, 8.5, 18, 0, 0, -6, vm(0xd04a20, 0.5, 0.25));
    vbox(g, 3.6, 3.6, 14, 0, 1.2, -20, steel);
    vcyl(g, 3.8, 3.8, 3.5, 5.5, 2.2, -6, vm(0x1c1f26, 0.65, 0.35), 0, Math.PI / 2);
    vbox(g, 3.6, 7.5, 9, 0, -6.5, 4, vm(0x1c1f26, 0.65, 0.35), 0.42);
    vbox(g, 2, 2, 4, 0, 4.5, -10, dark);
    muzzle.position.set(0, 1.2, -28);
  } else if (key === "flamer") {
    // pressure tank on the side, wand out front, pilot flame at the tip
    vcyl(g, 3.8, 3.8, 22, 5.2, -3.5, 7, vm(0xc03a1a, 0.55, 0.35), 0);
    vcyl(g, 3.4, 3.4, 20, 9.0, -3.5, 8.5, vm(0x9a9ea6, 0.4, 0.7), 0);
    vbox(g, 4.2, 5.4, 20, 0, 0, -6, dark);
    vcyl(g, 1.5, 1.9, 34, 0, 1.2, -26, steel, Math.PI / 2);
    vcyl(g, 3.0, 2.4, 5, 0, 1.2, -44, vm(0x6a6e74, 0.5, 0.6), Math.PI / 2);
    vbox(g, 3.0, 6.4, 8, 0, -5.4, 3, rubber, 0.4);
    // pilot light: a tiny always-on ember so the wand reads as lit
    var pilot = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9 })
    );
    pilot.position.set(1.6, 2.2, -44);
    g.add(pilot);
    g.userData.pilot = pilot;
    muzzle.position.set(0, 1.2, -46);
  } else {
    // pistol
    vbox(g, 3.5, 6.2, 18, 0, 0, -6, dark);
    vcyl(g, 0.95, 0.95, 8, 0, 0.7, -17, steel, Math.PI / 2);
    vbox(g, 3.1, 8.5, 6, 0, -6.8, 2.5, vm(0x181a20, 0.75, 0.25), 0.26);
    vbox(g, 1.2, 1.5, 1.6, 0, 3.6, -14, steel);
    vbox(g, 2.8, 1.2, 4, 0, 3.8, -8, dark); // slide serrations block
    muzzle.position.set(0, 0.7, -20);
  }
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.renderOrder = 4;
      o.frustumCulled = false;
    }
  });
  noRaycast(g);
  return g;
}

var vmCache = {};
function clearViewModels() {
  var cam = getMainCamera();
  for (var k in vmCache) {
    cam.remove(vmCache[k]);
    vmCache[k].traverse(function (o) {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  }
  vmCache = {};
  Z.view = null;
}

/* --- firing -------------------------------------------------------------- */
var _rc = new THREE.Raycaster();
_rc.far = 6000;
var _v0 = new THREE.Vector3(),
  _v1 = new THREE.Vector3();
// Shared sequential 2D collision scratch. Movement helpers consume the point
// synchronously, so gameplay does not need to allocate one on every substep.
var _movePoint2D = { x: 0, z: 0 };

/* ---- reusable Vector3 pool for hot paths --------------------------------
   These replace the dozens of `new THREE.Vector3()` that fire/melee/damage
   created per frame, eliminating the GC pressure that triggered stutters.   */
var _tmpVecs = [];
for (var _ti = 0; _ti < 12; _ti++) _tmpVecs.push(new THREE.Vector3());
var _tmpIdx = 0;
function set__tmpIdx(value) { return _tmpIdx = value; }

// Dedicated direction vector for camDir — avoids cloning _v1 every shot
var _camDir = new THREE.Vector3();

var ambT = rr(10, 22);
function set_ambT(value) { return ambT = value; }

var hudNeedsUpdate = true;
function set_hudNeedsUpdate(value) { return hudNeedsUpdate = value; }

/* ---- visor blood ----------------------------------------------------------
   Blood on the CAMERA, not in the world. The old version stamped CSS radial
   gradients, which read as flat red circles floating over the picture. This
   draws the real fx_blood_*.png splatters into a canvas the size of the
   viewport, so they have actual edges, drips and satellite droplets, and they
   PERSIST until you wipe them with V (the slow bleed-off below is only a safety
   valve so a player who never wipes is not blinded forever). */
var BLOOD_SRC = ["fx_blood_1.png", "fx_blood_2.png", "fx_blood_3.png"];
var bloodImgs = null;
function set_bloodImgs(value) { return bloodImgs = value; }

/* The fx_blood_*.png files are WHITE alpha masks, not coloured art — drawn
   straight they are invisible against a lit wall. Each mask is tinted once into
   an offscreen canvas (source-in over a vertical gradient) and those are what
   get stamped: cheaper than tinting per splat, and the gradient gives the
   splatter a darker, more venous base than a flat fill would. */
var BLOOD_TINTS = [
  ["#b4141d", "#4d0206"], // fresh arterial
  ["#8d0d14", "#320104"], // a little older
  ["#6d1016", "#280003"], // near-dry
];

var MIN_SPAWN_DIST = 180;

var INTERMISSION_OFFERS = {
  ammo: { cost: 300, key: "z_buy_ammo" },
  fortify: { cost: 250, key: "z_buy_fortify" },
  recover: { cost: 200, key: "z_buy_recover" },
};

/* ===========================================================================
   12. INPUT
   =========================================================================== */
var KEYMAP = {
  KeyW: "fwd", ArrowUp: "fwd",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  ShiftLeft: "sprint", ShiftRight: "sprint",
  ControlLeft: "crouchKey", KeyC: "crouchKey",
};

// Vertical launch. The player already has full vertical physics (gravity,
// P.vy, ground clamp, step-up) for walking off furniture, so a jump is just an
// upward impulse — but only from the ground, or holding Space would let you
// climb the air. GRAV is 900cm/s^2, so 330 gives a ~60cm apex: comfortably over
// the 42cm STEP ledge, low enough that it is not a platformer.
var JUMP_V = 330;

/* ===========================================================================
   14. MODE TOGGLE
   =========================================================================== */
function clearWorld() {
  removeNavMarker();
  Z.zeds.slice().forEach(removeZed);
  Z.zeds = [];
  clearPickups();
  Z.frags.forEach(function (f) {
    if (Z.grp) Z.grp.remove(f.g);
    f.g.traverse(function (o) {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
  });
  Z.frags = [];
  clearEnv();
  clearCritters();
  clearAcidClouds();
  if (Z.grp) {
    var scene = getMainScene();
    Z.grp.traverse(function (o) {
      if (o.isMesh && ownsGeo(o.geometry)) o.geometry.dispose();
    });
    scene.remove(Z.grp);
    Z.grp = null;
  }
  Z.barricades = [];
  Z.perkStations = [];
  Z.fuseBox = null;
  Z.boss = null;
  Z.objective = null;
  Z.director = null;
  Z.extraction = null;
  Z.intermission = null;
  Z.victory = false;
  Z.touchMode = wantsTouchControls();
  Z.parts = null;
  Z.tracers = null;
  Z.decals = null;
  Z.impacts = null;
  Z.motes = null;
  Z.mflash = null;
  Z.fireLight = null;
  Z.blastLight = null;
  Z.gibs = [];
  // every rig that referenced the shared body geometry is gone with the group
  clearZedGeoCache();
}

function restart() {
  clearWorld();
  if (setTexBudget(gameSettings().quality)) {
    clearViewModels();
    dropTextureCaches();
  }
  // Changing the in-game texture budget drops the shared maps before calling
  // restart. Recreate them before FX materials consume the decal families.
  ensureTex();
  var scene = getMainScene();
  Z.grp = new THREE.Group();
  scene.add(Z.grp);
  initFX();
  buildMoonBeams();
  // a different world outside the windows every run
  buildExterior();
  initCritters();
  Z.stats = { kills: 0, heads: 0, melee: 0, best: Z.stats.best, shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0 };
  Z.score = 0;
  Z.credits = 0;
  Z.cameraMotion = {};
  Z.tutorialStage = 0;
  Z.combo = 0;
  Z.comboT = 0;
  Z.killStreak = 0;
  Z.timeScale = 1;
  Z.slowT = 0;
  Z.p = newPlayer();
  Z.wave = { n: 0, state: "rest", timer: 0, pending: 0, pool: [] };
  Z.barricades = [];
  Z.perks = { speed: false, jugg: false, damage: false };
  Z.perkStations = [];
  Z.fuseBox = null;
  Z.blackout = false;
  Z.storm = { nextLightning: rr(14, 26) };
  Z.boss = null;
  Z.interactPrompt = "";
  initRadar();
  spawnPerkStations();
  spawnFuseBox();
  if (Z.flash) {
    Z.flash.batt = 100;
    Z.flash.on = true;
  }
  if (Z.hud) {
    Z.hud.dead.classList.remove("on");
    Z.hud.victory.classList.remove("on");
    Z.hud.intermission.classList.remove("on");
    if (Z.hud.hint) Z.hud.hint.classList.remove("fade");
    var bctx = Z.hud.blood && Z.hud.blood.getContext && Z.hud.blood.getContext("2d");
    if (bctx) bctx.clearRect(0, 0, Z.hud.blood.width, Z.hud.blood.height);
    Z.hud.blood.classList.remove("on");
    Z.bloodDirty = false;
    loadBloodImgs(); // tint the splatter masks now, not on the first hit
  }
  // start with the pistol out and the knife in the belt
  Z.p.weapon = "pistol";
  Z.view = null;
  setWeapon("knife");
  setWeapon("pistol");
  startWave(1);
  hudDirty();
  pauseGame(true, true);
  // The briefing is up and nothing is animating: the cheapest moment in the
  // whole run to pay for the rig caches, which otherwise miss on every one of
  // wave 1's spawns.
  prewarmRigs();
}

// A game in a 40%-wide split pane is not a game. Take the whole canvas while
// the mode runs and put the user's layout back exactly as it was on exit.
function maximize3D(on) {
  var cc = document.getElementById("center-canvas");
  if (!cc) return;
  var isMax = cc.classList.contains("max-view-3d");
  if (on) {
    Z.prevMax = isMax ? null : cc.classList.contains("max-view-2d") ? "view-2d" : "split";
    if (!isMax && window.__setViewMode) window.__setViewMode("3d");
  } else if (Z.prevMax && window.__setViewMode) {
    // If the device folded down while playing, a split restoration would make
    // the planner unusable. Return compact phones to their normal plan pane;
    // tablets/desktops still get the exact pre-game view back.
    var compactPhone = document.body.classList.contains("compact-nav") && Math.min(window.innerWidth, window.innerHeight) < 600;
    window.__setViewMode(compactPhone ? "plan" : Z.prevMax === "view-2d" ? "plan" : "split");
    Z.prevMax = null;
  }
}

export function toggleZombies(on) {
  /* Night Shift is played inside the planner's own 3D scene, and three is
     late-bound now (js/three_lazy.js): a phone session that started on the
     plan has no renderer yet. Build one and come back, rather than
     refusing to start. `false` here means "not running yet", which is what
     the caller already reads it as. */
  if (!has3D()) {
    init3D().then(function (ok) { if (ok) toggleZombies(on); });
    return false;
  }
  var want = on == null ? !Z.active : !!on;
  if (want === Z.active) return Z.active;
  var scene = getMainScene(),
    cam = getMainCamera();
  if (want) {
    if (isWalk()) toggleWalk(false);
    ensureBuilt();
    // The planner may use 2x pixels + SSAO + large shadows. Those are fine for
    // a still design view, but disastrous with dozens of animated rigs.
    Z.prevQuality = (S.workspace && S.workspace.quality) || "auto";
    gameSettings();
    setGameRendererQuality(Z.settings.quality);
    // Texel budget follows the same slider. If it moved since the last
    // session the cached maps are the wrong size, so drop them first —
    // materials are rebuilt from scratch below either way.
    if (setTexBudget(Z.settings.quality)) dropTextureCaches();
    ensureTex();
    buildHud();
    bindEvents();
    Z.grp = new THREE.Group();
    scene.add(Z.grp);
    // the camera must live in the scene graph for its children (viewmodel,
    // flashlight, light cone) to be rendered at all
    if (!cam.parent) scene.add(cam);
    Z.prevNear = cam.near;
    Z.baseFov = cam.fov || 60;
    cam.near = 4;
    cam.updateProjectionMatrix();
    Z.colDirty = true;
    buildCol();
    initFX();
    applyGameSettings();
    enterHorror();
    buildFlashlight();
    Z.active = true;
    applyGameSettings();
    Z.t = 0;
    Z.keys = {};
    Z.doorsOpened = [];
    audio();
    // Destruction (Rapier on every piece of furniture) is a High-only
    // extra. Fast/Balanced stay playable: the 2D collision snapshot is enough
    // for zombies and bullets, and enabling the full rigid-body world is what
    // froze M-series laptops at session start.
    if (Z.settings.quality >= 2) enableDestruction();
    restart();
    Z.hud.root.classList.add("on");
    Z.hud.hint.textContent = t("z_hint");
    setExternalTick(tick);
    document.body.classList.add("zombies-on");
    maximize3D(true);
  } else {
    Z.active = false;
    Z.paused = false;
    setExternalTick(null);
    unbindEvents();
    unlockPointer();
    disableDestruction();
    clearWorld();
    exitHorror();
    // strip camera children we added
    if (Z.flash) {
      cam.remove(Z.flash.sp);
      cam.remove(Z.flash.cone);
      if (Z.flash.fill) cam.remove(Z.flash.fill);
      if (Z.flash.sp.target && Z.flash.sp.target.parent)
        Z.flash.sp.target.parent.remove(Z.flash.sp.target);
      Z.flash.sp.dispose && Z.flash.sp.dispose();
      Z.flash.cone.geometry.dispose();
      Z.flash.mat.dispose();
      Z.flash = null;
    }
    clearViewModels();
    // clearWorld() above already took every mesh out of the scene, so nothing
    // is left pointing at these maps
    dropTextureCaches();
    Z.view = null;
    // doors the game forced open go back to how the user had them
    Z.doorsOpened.forEach(function (d) {
      if (d.userData) d.userData.open = false;
    });
    Z.doorsOpened = [];
    if (cam.parent === scene) scene.remove(cam);
    if (Z.prevNear != null) {
      cam.near = Z.prevNear;
      Z.prevNear = null;
    }
    if (Z.baseFov != null) {
      cam.fov = Z.baseFov;
      cam.updateProjectionMatrix();
      Z.baseFov = null;
    }
    audioClose();
    if (Z.hud) {
      Z.hud.root.classList.remove("on", "z-lite", "distracted", "adrenaline", "paused", "melee", "aiming");
      Z.hud.pause.classList.remove("on");
      Z.hud.dead.classList.remove("on");
      if (Z.hud.damage) Z.hud.damage.style.opacity = 0;
      if (Z.hud.flash) Z.hud.flash.style.opacity = 0;
      if (Z.hud.chrom) Z.hud.chrom.style.opacity = 0;
    }
    document.body.classList.remove("zombies-on");
    maximize3D(false);
    orbitRefresh();
    clearGameRendererQuality();
    setQualityPreset(Z.prevQuality || ((S.workspace && S.workspace.quality) || "auto"));
    Z.prevQuality = null;
  }
  var btn = document.getElementById("zombieBtn");
  if (btn) btn.classList.toggle("active", Z.active);
  return Z.active;
}

// The plan can change underneath the game (an edit, or the rebuild that
// destruction mode needs to generate rigid bodies). Re-snapshot collision and
// re-grade: a rebuild hands back brand-new lights at full planner brightness,
// which would floodlight the flat mid-wave.
window.addEventListener("scene3d:rebuilt", function () {
  if (!Z.active) return;
  Z.colDirty = true;
  applyHorrorGrade();   // fog/background/exposure come back as the planner's day
  harvestPracticals();  // and every practical is a brand-new full-brightness light
  buildMoonBeams();
});


// Wire world → HUD/audio callbacks now that local functions exist.
hooks.sndClick = sndClick;
hooks.sndFlesh = sndFlesh;
hooks.sndGrowl = sndGrowl;
hooks.sndScream = sndScream;
hooks.sndDeath = sndDeath;
hooks.sndDoor = sndDoor;
hooks.sndSwipe = sndSwipe;
hooks.sndHammer = sndHammer;
hooks.sndPower = sndPower;
hooks.sndThunder = sndThunder;
hooks.sndPerk = sndPerk;
hooks.hudDirty = hudDirty;
hooks.say = say;
hooks.hitMarker = hitMarker;
hooks.flashScreen = flashScreen;
hooks.hurtPlayer = hurtPlayer;
hooks.onKill = function (zd, gib) {
  hitMarker("kill");
  if (Z.director) Z.director.lastKill = Z.t;
  if (Z.killStreak >= 5) {
    Z.slowT = Math.max(Z.slowT || 0, 0.2);
    Z.timeScale = 0.4;
    flashScreen("#ff2200", 0.12);
  } else if (gib) {
    Z.slowT = Math.max(Z.slowT || 0, 0.1);
    Z.timeScale = 0.45;
  }
  hudDirty();
};
hooks.onHeadshot = function () {
  flashScreen("#ff6644", 0.08);
};
hooks.onScreamerCall = function () {
  if (!Z.wave || Z.wave.state !== "fight") return;
  Z.wave.pending = Math.min(Z.wave.total + 4, Z.wave.pending + 3);
  if (Z.director) {
    Z.director.phase = "peak";
    Z.director.phaseT = Math.max(Z.director.phaseT, 4);
  }
  say(t("z_screamer_reinforcements"), 2.0);
  hudDirty();
};

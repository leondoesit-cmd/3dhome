/* Night Shift gameplay: weapons, HUD, player, waves, input, mode toggle. */
import * as THREE from "three";
import { legacyIntensity } from "./gpu.js";
import { S, clamp, fin } from "./state.js";
import {
  has3D,
  getMainScene,
  getMainCamera,
  getDynGroup,
  setExternalTick,
  ensureBuilt,
  isWalk,
  toggleWalk,
  orbitRefresh,
  setQualityPreset,
} from "./view3d.js";
import { t } from "./i18n.js";
import {
  Z, hooks, zActive, EYE, EYE_CROUCH, P_RAD, P_CLEAR, STEP, SPD_WALK, SPD_SPRINT, SPD_CROUCH,
  ACCEL, GRAV, MAX_HP, MAX_ARMOR, Z_MAX_ALIVE, REST_LEN, rr, pick, rnd,
} from "./zombies_state.js";
import {
  buildCol,
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
import { initCritters, stepCritters, clearCritters } from "./zombies_critters.js";


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
    savedAlive = Number(saved.maxAlive),
    savedFx = Number(saved.fx);
  Z.settings = {
    quality: fin(savedQuality) ? Math.round(clamp(savedQuality, 0, 2)) : 0,
    maxAlive: fin(savedAlive) ? Math.round(clamp(savedAlive, 8, 24)) : 18,
    fx: fin(savedFx) ? Math.round(clamp(savedFx, 25, 100)) : 50,
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
  if (Z.active) setQualityPreset(["performance", "balanced", "quality"][cfg.quality]);
  setNightShiftQuality(cfg.quality);
  setFXDensity(cfg.fx / 100);
}
function syncSettingsUi() {
  if (!Z.hud || !Z.hud.qualitySlider) return;
  var cfg = gameSettings(),
    qualityKeys = ["z_quality_fast", "z_quality_balanced", "z_quality_high"],
    qualityCap = [12, 18, 24][cfg.quality || 0],
    effectiveHorde = Math.min(cfg.maxAlive, qualityCap);
  Z.hud.qualitySlider.value = cfg.quality;
  Z.hud.hordeSlider.max = qualityCap;
  Z.hud.hordeSlider.value = effectiveHorde;
  Z.hud.fxSlider.value = cfg.fx;
  Z.hud.qualityValue.textContent = t(qualityKeys[cfg.quality]);
  Z.hud.hordeValue.textContent = effectiveHorde;
  Z.hud.fxValue.textContent = cfg.fx + "%";
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
function setWeapon(key) {
  var P = Z.p;
  if (!P || P.weapon === key || !P.owned[key]) return;
  P.weapon = key;
  P.reloading = 0;
  P.swing = 0;
  P.nextShot = 0;
  var cam = getMainCamera();
  if (Z.view) Z.view.visible = false;
  if (!vmCache[key]) {
    vmCache[key] = buildViewModel(key);
    cam.add(vmCache[key]);
  }
  Z.view = vmCache[key];
  Z.view.visible = true;
  Z.view.position.set(11, -9.5, -17);
  Z.view.rotation.set(0, 0, 0);
  sndClick();
  say(t(W[key].key), 0.9);
  hudDirty();
}
function cycleWeapon(dir) {
  var P = Z.p,
    have = W_ORDER.filter(function (k) {
      return P.owned[k];
    });
  var i = have.indexOf(P.weapon);
  setWeapon(have[(i + dir + have.length) % have.length]);
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
function tmpVec(x, y, z) {
  var v = _tmpVecs[_tmpIdx];
  _tmpIdx = (_tmpIdx + 1) % _tmpVecs.length;
  return v.set(x || 0, y || 0, z || 0);
}
// Reset pool index at the start of each fire/melee function so inner loops
// never wrap around and overwrite a vector a surrounding scope still needs.
function tmpReset() { _tmpIdx = 0; }

// Dedicated direction vector for camDir — avoids cloning _v1 every shot
var _camDir = new THREE.Vector3();

function camDir(spread) {
  var cam = getMainCamera();
  cam.getWorldDirection(_camDir);
  if (spread) {
    _camDir.x += rr(-spread, spread);
    _camDir.y += rr(-spread, spread);
    _camDir.z += rr(-spread, spread);
    _camDir.normalize();
  }
  return _camDir;
}

// resolve which body part a mesh belongs to (head = big damage, limbs = gore)
function partOf(obj) {
  var p = obj;
  while (p) {
    if (p.userData && p.userData.part) return p.userData.part;
    p = p.parent;
  }
  return "body";
}
function zedOf(obj) {
  var p = obj;
  while (p) {
    if (p.userData && p.userData.zed && p.userData.zed !== true) return p.userData.zed;
    p = p.parent;
  }
  return null;
}

function isViewOrPlayerObject(obj) {
  var cam = getMainCamera();
  var o = obj;
  while (o) {
    if (o === cam || o === Z.view) return true;
    if (o.userData && (o.userData.gib || o.userData.noHit || o.userData.isView || o.userData.pickup)) return true;
    o = o.parent;
  }
  return false;
}

function hitscan(origin, dir, range) {
  _rc.set(origin, dir);
  _rc.far = range || 6000;
  var dyn = getDynGroup();
  var list = [];
  var ms = getMainScene();
  if (ms) list.push(ms);
  else {
    if (Z.grp) list.push(Z.grp);
    if (dyn) list.push(dyn);
  }
  var hits = _rc.intersectObjects(list, true);
  for (var i = 0; i < hits.length; i++) {
    var h = hits[i];
    if (!h.object.visible) continue;
    if (isViewOrPlayerObject(h.object)) continue;
    // skip flying severed parts / gore chunks
    if (h.object.userData && h.object.userData.gib) continue;
    var mat = h.object.material;
    if (mat && mat.blending === THREE.AdditiveBlending) continue; // fx/beams
    if (h.object.isPoints || h.object.isLine) continue;
    var zd = zedOf(h.object);
    if (zd && zd.dead) continue;
    return {
      point: h.point,
      dist: h.distance,
      zed: zd,
      obj: h.object,
      normal:
        h.face && h.object.matrixWorld
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld)
          : new THREE.Vector3(0, 1, 0),
    };
  }
  return null;
}

// Destruction is an enhancement to combat, not a requirement for it. The
// physics scene can be rebuilt asynchronously while a shot is in flight, so
// keep a stale physics mesh from taking the entire game loop down with it.
function damageWorldSafely(origin, dir, kind) {
  if (!destructReady()) return false;
  try {
    return damageWorld(origin, dir, kind);
  } catch (e) {
    return false;
  }
}

/* What a round landing on the world looks like: a short spark spit, a puff of
   pulverised surface, and a scuff that stays. `markChance` throttles the mark
   for shotguns, where eight pellets a shot would otherwise flush the shared
   decal ring buffer (and every blood stain in it) in two trigger pulls. */
function worldImpact(point, normal, markChance) {
  sparkBurst(point.x, point.y, point.z, normal.x, normal.y, normal.z, 5, true);
  dustBurst(point.x, point.y, point.z, normal.x, normal.y, normal.z, 5);
  if (markChance >= 1 || rnd() < markChance)
    impactMark(point.x, point.y, point.z, normal.x, normal.y, normal.z, rr(7, 12));
  sndImpact(point);
}

// A flame cone is broad, but it still needs a clear path to each target. The
// centre ray is only suitable for clipping the visual jet; using it for all
// targets let fire pass through walls whenever a zombie stood in the middle.
function flameCanReach(origin, target, maxDist, zd) {
  var toTarget = tmpVec(target.x - origin.x, target.y - origin.y, target.z - origin.z),
    distance = toTarget.length();
  if (distance > maxDist || distance < 0.001) return false;
  toTarget.multiplyScalar(1 / distance);
  var hit = hitscan(origin, toTarget, distance + 14);
  return !hit || hit.zed === zd || hit.dist >= distance - 12;
}

// head/limb classification from mesh tags first, then hit height
function zedPart(zd, point, obj) {
  var tagged = obj ? partOf(obj) : null;
  if (tagged === "head" || tagged === "limb" || tagged === "body") return tagged;
  var rel = point.y - zd.y,
    top = 172 * zd.rig.scale;
  if (zd.crawler) return rel > 44 ? "head" : "body";
  if (rel > top * 0.82) return "head";
  if (rel < top * 0.4) return "limb";
  return "body";
}

/* --- flamethrower: a cone of burning fuel, not a bullet ------------------- */
function flame(dt) {
  var P = Z.p,
    def = W.flamer;
  if (P.reloading > 0) return;
  if (P.ammo.flamer <= 0) {
    if (Z.t > (P.nextShot || 0)) {
      sndClick();
      P.nextShot = Z.t + 0.4;
      if (P.reserve.flamer > 0) reload();
      else say(t("z_no_fuel"), 0.9);
    }
    return;
  }
  // Fuel burns by time, not by trigger pulls. `rpm` is also the tank's
  // consumption rate, so a 600-rpm flamer consumes ten fuel units/second.
  // The old fixed 50ms step consumed twenty and made a full tank vanish in
  // about eleven seconds.
  var fuelInterval = 60 / def.rpm;
  P.flameFuel = (P.flameFuel || 0) + dt;
  while (P.flameFuel >= fuelInterval && P.ammo.flamer > 0) {
    P.flameFuel -= fuelInterval;
    P.ammo.flamer--;
    Z.stats.shots++;
  }
  hudDirty();

  var cam = getMainCamera();
  cam.getWorldPosition(_v0);
  var origin = _v0; // stays valid — not pooled
  cam.getWorldDirection(_v1);
  var dir = _v1;     // stays valid — not pooled
  var muzzleW = tmpVec();
  if (Z.view && Z.view.userData.muzzle) Z.view.userData.muzzle.getWorldPosition(muzzleW);
  else muzzleW.copy(origin);

  // the jet stops at the first wall, so you can't burn through a door
  var wall = hitscan(origin, dir, def.reach);
  var reach = wall && !wall.zed ? Math.max(40, wall.dist - 10) : def.reach;

  // visual: fuel motes accelerating away from the wand and dying out
  for (var i = 0; i < 7; i++) {
    var t2 = rr(0.05, 1) * reach,
      spread = t2 * 0.18;
    spawnFlamePart(
      muzzleW.x + dir.x * t2 + rr(-spread, spread),
      muzzleW.y + dir.y * t2 + rr(-spread, spread) + t2 * 0.0004,
      muzzleW.z + dir.z * t2 + rr(-spread, spread),
      dir,
      t2 / reach
    );
  }
  if (!Z.fireLight) {
    Z.fireLight = new THREE.PointLight(0xff7420, 0, 700, 2);
    Z.grp.add(Z.fireLight);
  }
  var rk = reach * 0.45;
  Z.fireLight.position.set(muzzleW.x + dir.x * rk, muzzleW.y + dir.y * rk, muzzleW.z + dir.z * rk);
  Z.fireLight.intensity = legacyIntensity(5.5 + Math.sin(Z.t * 30) * 1.6, 700);
  Z.fireLight.userData.t = 0.09;

  // damage: everything inside the cone, LOS already handled by `reach`
  P.flameTick = (P.flameTick || 0) - dt;
  var doDamage = P.flameTick <= 0;
  if (doDamage) P.flameTick = 0.1;
  for (var zi = 0; zi < Z.zeds.length && doDamage; zi++) {
    var zd = Z.zeds[zi];
    if (zd.dead) continue;
    var dx = zd.x - P.x,
      dy = zd.y + 90 - (P.y + EYE),
      dz = zd.z - P.z,
      d = Math.hypot(dx, dy, dz) || 1;
    if (d > reach + 40) continue;
    if ((dx / d) * dir.x + (dy / d) * dir.y + (dz / d) * dir.z < 1 - def.arc * 0.5) continue;
    if (!flameCanReach(origin, tmpVec(zd.x, zd.y + 90, zd.z), reach + 40, zd)) continue;
    damageZed(zd, def.dmg, tmpVec(zd.x, zd.y + 100, zd.z), dir, "body", false);
    igniteZed(zd, rr(4.5, 7));
  }
  // sustained heat weakens structure too — thin panels and glass give way
  if (doDamage && wall && !wall.zed && rnd() < 0.25)
    damageWorldSafely(origin, dir, "burn");

  P.bloom = Math.min(0.05, P.bloom + 0.0016);
  shake(0.045);
  makeNoise(P.x, P.z, def.noise);
  if (Z.t > (P.flameSndT || 0)) {
    P.flameSndT = Z.t + 0.18;
    sndFlame();
  }
}

function spawnFlamePart(x, y, z, dir, k) {
  // The dedicated fire pool gives the stream a white core, orange crown and
  // upward curl. Particles already sampled down the cone get a shorter life so
  // the visible jet ends exactly at the wall/reach limit.
  var hot = 1 - k * 0.58;
  spawnFirePart(
    x, y, z,
    dir.x * rr(260, 520) + rr(-55, 55),
    dir.y * rr(240, 500) + rr(15, 75),
    dir.z * rr(260, 520) + rr(-55, 55),
    rr(18, 34) * (0.8 + k * 0.55),
    rr(0.18, 0.36) * (1 - k * 0.35),
    hot
  );
  // A little dark exhaust behind the bright flame keeps it volumetric.
  if (k > 0.5 && rnd() < 0.28)
    spawnPart(
      x, y, z,
      dir.x * rr(25, 70) + rr(-25, 25), rr(45, 90), dir.z * rr(25, 70) + rr(-25, 25),
      rr(12, 23), 0.16, 0.13, 0.11, rr(0.45, 0.8), -GRAV * 0.08
    );
}

function fire() {
  var P = Z.p,
    def = W[P.weapon];
  if (P.dead || Z.paused) return;
  if (def.melee) return meleeSwing();
  if (def.flame) return; // driven per-frame from stepPlayer while held
  if (P.reloading > 0) return;
  if (Z.t < P.nextShot) return;
  if (P.ammo[P.weapon] <= 0) {
    sndClick();
    P.nextShot = Z.t + 0.25;
    if (P.reserve[P.weapon] > 0) reload();
    else say(t("z_no_ammo"), 0.9);
    return;
  }
  P.ammo[P.weapon]--;
  P.nextShot = Z.t + 60 / def.rpm;
  Z.stats.shots++;
  var cam = getMainCamera();
  cam.getWorldPosition(_v0);
  var origin = _v0; // stays valid — not pooled
  var muzzleW = tmpVec();
  if (Z.view && Z.view.userData.muzzle)
    Z.view.userData.muzzle.getWorldPosition(muzzleW);
  else muzzleW.copy(origin);

  var sprd =
    (def.spread + P.bloom) *
    (P.aim ? 0.38 : 1) *
    (P.crouch ? 0.85 : 1) *
    (1 + (P.distract || 0) * 1.6);
  for (var p = 0; p < def.pellets; p++) {
    var d = camDir(sprd);
    var h = hitscan(origin, d, 6000);
    var end = h
      ? h.point
      : tmpVec(origin.x + d.x * 3000, origin.y + d.y * 3000, origin.z + d.z * 3000);
    tracer(muzzleW.x, muzzleW.y, muzzleW.z, end.x, end.y, end.z);
    if (!h) continue;
    if (h.zed) {
      var part = zedPart(h.zed, h.point, h.obj);
      // falloff: point-blank hits hit harder
      var fall = h.dist < 180 ? 1.15 : h.dist > 900 ? 0.82 : 1;
      var dealt = damageZed(h.zed, def.dmg * fall, h.point, d, part, false);
      // damageZed attaches an articulated wound to the exact body/garment.
      // The old extra world-space decal stayed behind when the zombie moved,
      // exposing a flat floating card and doubling every visible hit.
      if (part === "head") {
        P.hitStop = Math.max(P.hitStop, 0.045);
        Z.slowT = Math.max(Z.slowT || 0, 0.12);
        Z.timeScale = 0.35;
      } else if (dealt > 40) P.hitStop = Math.max(P.hitStop, 0.03);
    } else {
      // The round has to leave a mark. Before, a wall hit produced sparks and
      // nothing else, so the only evidence a shot landed was the structure
      // breaking — which is why "no impact" read as the wall exploding.
      worldImpact(h.point, h.normal, def.pellets > 1 ? 0.3 : 1);
      // rounds chew furnishings: glass goes first, then panels and cabinetry.
      // Walls themselves are exempt (see HIT.immune in zombies_destruct.js).
      damageWorldSafely(origin, d, def.pellets > 1 ? "buck" : "bullet");
    }
  }
  // recoil into the look angles + viewmodel kick
  var kickMul = P.aim ? 0.55 : 1;
  P.pitch = clamp(P.pitch + def.kick * rr(0.7, 1.3) * kickMul, -1.35, 1.35);
  P.yaw += rr(-def.kick, def.kick) * 0.4 * kickMul;
  P.bloom = Math.min(0.07, P.bloom + def.bloom * (P.aim ? 0.45 : 1));
  P.vmKick = Math.min(1, P.vmKick + (def.kick * 18));
  shake(def.kick * 4);
  muzzleFlash(muzzleW, def);
  sndShot(def);
  makeNoise(P.x, P.z, def.noise * (P.aim ? 0.85 : 1));
  flashScreen("#ffd9a0", 0.07);
  hudDirty();
}

function muzzleFlash(pos, def) {
  var F = Z.mflash;
  if (!F) {
    F = Z.mflash = new THREE.PointLight(0xffd9a0, 0, 620, 2);
    Z.grp.add(F);
  }
  F.position.copy(pos);
  F.intensity = legacyIntensity(7 * (def.pellets > 1 ? 1.6 : 1), 620);
  F.userData.t = 0.055;
  sparkBurst(pos.x, pos.y, pos.z, 0, 0, 0, def.pellets > 1 ? 14 : 7, true);
}

function reload() {
  var P = Z.p,
    def = W[P.weapon];
  if (def.melee || P.reloading > 0) return;
  if (P.ammo[P.weapon] >= def.mag || P.reserve[P.weapon] <= 0) return;
  P.reloading = def.reload;
  sndReload();
  say(t("z_reloading"), def.reload);
}
function finishReload() {
  var P = Z.p,
    def = W[P.weapon],
    need = def.mag - P.ammo[P.weapon],
    take = Math.min(need, P.reserve[P.weapon]);
  P.ammo[P.weapon] += take;
  P.reserve[P.weapon] -= take;
  hudDirty();
}

/* --- melee: an arc sweep, generous but short ----------------------------- */
function meleeSwing() {
  var P = Z.p,
    def = W[P.weapon];
  if (P.swing > 0 || Z.t < P.nextShot) return;
  P.swing = def.swing;
  P.swingMax = def.swing;
  P.swingHit = false;
  P.nextShot = Z.t + def.rate;
  sndWhoosh(def);
  P.stam = Math.max(0, P.stam - 6);
}
function meleeConnect() {
  var P = Z.p,
    def = W[P.weapon],
    cam = getMainCamera();
  cam.getWorldPosition(_v0);
  var fx = Math.sin(P.yaw),
    fz = Math.cos(P.yaw),
    hitAny = false;
  // sweep the arc against zombie centres, nearest first
  var cands = Z.zeds
    .filter(function (zd) {
      return !zd.dead && Math.hypot(zd.x - P.x, zd.z - P.z) < def.reach + 30;
    })
    .sort(function (a, b) {
      return (
        Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)
      );
    });
  for (var i = 0; i < cands.length && i < 3; i++) {
    var zd = cands[i],
      dx = zd.x - P.x,
      dz = zd.z - P.z,
      d = Math.hypot(dx, dz) || 1;
    var ang = Math.acos(clamp((dx / d) * fx + (dz / d) * fz, -1, 1));
    if (ang > def.arc) continue;
    var hy = zd.y + (zd.crawler ? 40 : rr(90, 150));
    var pt = tmpVec(zd.x, hy, zd.z);
    var dir = tmpVec(dx / d, 0, dz / d);
    // aiming high with an axe takes the head off
    var part = P.pitch < -0.12 ? "limb" : P.pitch > 0.16 && rnd() < 0.5 ? "head" : "body";
    if (rnd() < def.dismember) part = rnd() < 0.5 ? "head" : "limb";
    damageZed(zd, def.dmg, pt, dir, part, true);
    zd.stagger = Math.max(zd.stagger, def.stagger);
    // knockback
    zd.x += (dx / d) * def.stagger * 30;
    zd.z += (dz / d) * def.stagger * 30;
    hitAny = true;
    shake(0.28);
    P.hitStop = Math.max(P.hitStop, part === "head" ? 0.08 : 0.04);
    if (part === "head") {
      Z.slowT = Math.max(Z.slowT || 0, 0.14);
      Z.timeScale = 0.3;
    }
    if (def.arc < 0.7) break;                     // stabs hit one thing
  }
  if (!hitAny) {
    // hit the world instead: sparks + a satisfying clang
    cam.getWorldDirection(_v1);
    var swingDir = _v1.clone();
    var h = hitscan(_v0.clone(), swingDir, def.reach + 20);
    if (h) {
      worldImpact(h.point, h.normal, 1);
      shake(0.14);
      // an axe into a cabinet should take the door off, same as in walk mode
      damageWorld(_v0.clone(), swingDir, "melee");
    }
  }
  makeNoise(P.x, P.z, 260);
}

/* ===========================================================================
   6b. FRAG GRENADES — thrown, bounced, cooked
   =========================================================================== */
function throwFrag(lob) {
  var P = Z.p;
  if (P.dead || Z.paused) return;
  if ((P.frags || 0) <= 0) {
    sndClick();
    say(t("z_no_frags"), 0.9);
    return;
  }
  if (Z.t < (P.nextFrag || 0)) return;
  P.nextFrag = Z.t + 0.55;
  P.frags--;
  var cam = getMainCamera();
  cam.getWorldPosition(_v0);
  cam.getWorldDirection(_v1);
  var dir = _v1.clone(),
    speed = FRAG.throwV * (lob ? 0.45 : 1);

  var g = new THREE.Group();
  var bodyM = new THREE.Mesh(
    new THREE.SphereGeometry(4.4, 10, 8),
    vm(0x3d4a30, 0.62, 0.35)
  );
  bodyM.scale.set(1, 1.22, 1);
  g.add(bodyM);
  g.add(
    new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2.4, 8), vm(0x8a8f96, 0.4, 0.7))
  ).position.y = 5.4;
  // a blinking primer so a live one is findable on a dark floor
  var led = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xff3020 })
  );
  led.position.set(0, 5.6, 2.4);
  g.add(led);
  g.position.copy(_v0).add(dir.clone().multiplyScalar(28));
  Z.grp.add(g);

  Z.frags.push({
    g: g,
    led: led,
    x: g.position.x, y: g.position.y, z: g.position.z,
    vx: dir.x * speed,
    vy: dir.y * speed + 130,
    vz: dir.z * speed,
    fuse: FRAG.fuse,
    rest: 0,
  });
  sndWhoosh(W.pan);
  hudDirty();
}

function stepFrags(dt) {
  for (var i = Z.frags.length - 1; i >= 0; i--) {
    var f = Z.frags[i];
    f.fuse -= dt;
    // ballistic arc, then bounce off floor/furniture and slide to a stop
    f.vy -= GRAV * dt;
    _movePoint2D.x = f.x;
    _movePoint2D.z = f.z;
    moveCircle(_movePoint2D, f.vx * dt, f.vz * dt, 5, f.y, 12, 0);
    // a blocked step means it hit something upright — kill the horizontal push
    var wantX = f.x + f.vx * dt,
      wantZ = f.z + f.vz * dt;
    if (Math.abs(_movePoint2D.x - wantX) > 0.5 || Math.abs(_movePoint2D.z - wantZ) > 0.5) {
      f.vx *= -0.35;
      f.vz *= -0.35;
      sndImpact({ x: f.x, y: f.y, z: f.z });
    }
    f.x = _movePoint2D.x;
    f.z = _movePoint2D.z;
    f.y += f.vy * dt;
    var floor = groundAt(f.x, f.z, f.y, 0);
    if (f.y <= floor + 4) {
      f.y = floor + 4;
      if (f.vy < -60) {
        f.vy *= -0.36;                       // bounce
        f.vx *= 0.62;
        f.vz *= 0.62;
        sndImpact({ x: f.x, y: f.y, z: f.z });
      } else {
        f.vy = 0;
        f.vx *= Math.pow(0.02, dt);          // friction to rest
        f.vz *= Math.pow(0.02, dt);
      }
    }
    f.g.position.set(f.x, f.y, f.z);
    f.g.rotation.x += (f.vz * 0.0006 + 0.02);
    f.g.rotation.z -= (f.vx * 0.0006 + 0.02);
    // primer blinks faster as the fuse runs out
    if (f.led) f.led.visible = Math.sin(Z.t * (10 + (FRAG.fuse - f.fuse) * 14)) > 0;
    if (f.fuse <= 0) {
      detonate(f.x, f.y, f.z);
      Z.grp.remove(f.g);
      f.g.traverse(function (o) {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      Z.frags.splice(i, 1);
    }
  }
}

// Survivors of a close blast keep coming, minus a limb.
function loseLimbToBlast(zd, dir) {
  var opts = [];
  if (zd.limbs.armL) opts.push("armL");
  if (zd.limbs.armR) opts.push("armR");
  if (!zd.crawler && zd.limbs.legL) opts.push("legL");
  if (!zd.crawler && zd.limbs.legR) opts.push("legR");
  if (opts.length) severPart(zd, pick(opts), dir, "blow", 1.2);
}

function detonate(x, y, z) {
  var P = Z.p;
  // --- the flash itself
  var L = Z.blastLight;
  if (!L) {
    L = Z.blastLight = new THREE.PointLight(0xffca70, 0, 1400, 2);
    Z.grp.add(L);
  }
  L.position.set(x, y + 20, z);
  L.intensity = legacyIntensity(30, 1400);
  L.userData.t = 0.16;
  sparkBurst(x, y + 10, z, 0, 1, 0, 40, true);
  boneBurst(x, y + 10, z, 12);
  decal(x, 1.2, z, 0, 1, 0, rr(120, 190));
  sndBlast({ x: x, y: y, z: z });

  // --- zombies: falloff from the core, blocked by walls
  for (var i = Z.zeds.length - 1; i >= 0; i--) {
    var zd = Z.zeds[i];
    if (zd.dead) continue;
    var d = Math.hypot(zd.x - x, zd.y + 90 - y, zd.z - z);
    if (d > FRAG.radius) continue;
    // a wall between you and the blast is most of a grenade's mercy
    var shielded = !losClear(x, z, zd.x, zd.z);
    var k = (1 - d / FRAG.radius) * (shielded ? 0.3 : 1);
    var dmg = FRAG.dmg * k * k;
    if (dmg < 4) continue;
    var dir = tmpVec((zd.x - x) / (d || 1), 0.3, (zd.z - z) / (d || 1));
    // Always score it against the torso: the limb zone carries a 0.7 damage
    // multiplier, so using it for close hits made the epicentre the *weakest*
    // place to stand. Dismemberment is applied on top instead.
    damageZed(zd, dmg, tmpVec(zd.x, zd.y + 90, zd.z), dir, "body", false);
    if (!zd.dead) {
      if (d < FRAG.radius * 0.4 && !shielded) loseLimbToBlast(zd, dir);
      zd.stagger = Math.max(zd.stagger, 0.9 * k);
      zd.x += dir.x * 60 * k;
      zd.z += dir.z * 60 * k;
    }
  }

  // --- the room itself
  explodeWorld({ x: x, y: y, z: z }, FRAG.radius * 0.85, FRAG.power);

  // --- the player, if they cooked it in their own hand
  var pd = Math.hypot(P.x - x, P.y + 90 - y, P.z - z);
  if (pd < FRAG.radius) {
    var pk = 1 - pd / FRAG.radius;
    if (!losClear(x, z, P.x, P.z)) pk *= 0.3;
    if (pk > 0.05) hurtPlayer(FRAG.dmg * 0.42 * pk * pk, { x: x, z: z });
  }
  shake(1.5 * clamp(1 - pd / (FRAG.radius * 1.6), 0.15, 1));
  flashScreen("#ffcf90", clamp(0.5 * (1 - pd / FRAG.radius), 0.06, 0.5));
  makeNoise(x, z, 2600);
  Z.slowT = Math.max(Z.slowT || 0, 0.16);
  Z.timeScale = 0.45;
}

function stepViewModel(dt) {
  var P = Z.p,
    v = Z.view;
  if (!v) return;
  var def = W[P.weapon];
  // sway from look delta, bob from walking, kick from firing
  P.swayX += (P.lookDX * -0.25 - P.swayX) * Math.min(1, dt * 9);
  P.swayY += (P.lookDY * -0.2 - P.swayY) * Math.min(1, dt * 9);
  P.lookDX *= 0.82;
  P.lookDY *= 0.82;
  var bobA = P.speedK * (P.sprint ? 2.4 : 1.4),
    bx2 = Math.sin(P.bob) * bobA,
    by = Math.abs(Math.cos(P.bob)) * bobA * 0.8;
  P.vmKick *= Math.pow(0.0016, dt);
  var sw = 0,
    swRot = 0;
  if (P.swing > 0) {
    P.swing -= dt;
    var k = 1 - P.swing / P.swingMax;
    if (!P.swingHit && k > 0.34) {
      P.swingHit = true;
      meleeConnect();
    }
    // wind up then whip through
    var e = k < 0.3 ? -k / 0.3 : Math.sin(((k - 0.3) / 0.7) * Math.PI);
    if (def.hand === "stab") {
      sw = -e * 26;
      swRot = e * 0.2;
    } else if (def.hand === "chop") {
      swRot = -e * 1.6;
      sw = -e * 10;
    } else {
      swRot = -e * 1.1;
      P.vmYaw = e * 0.9;
    }
    if (P.swing <= 0) P.vmYaw = 0;
  } else P.vmYaw = (P.vmYaw || 0) * 0.8;
  var rl = P.reloading > 0 ? Math.sin((1 - P.reloading / W[P.weapon].reload) * Math.PI) : 0;
  v.position.set(
    11 + P.swayX + bx2 + (P.aim ? -11 : 0),
    -9.5 + P.swayY + by - rl * 10 - P.vmKick * 1.2 + (P.aim ? 3.4 : 0),
    -17 + P.vmKick * 4 + sw + (P.aim ? 4 : 0)
  );
  v.rotation.set(
    -P.vmKick * 0.35 + swRot + rl * 0.9,
    (P.vmYaw || 0) - P.swayX * 0.02,
    rl * 0.5 + (P.vmYaw || 0) * 0.4
  );
}

/* ===========================================================================
   7. PICKUPS — ammo, health and new weapons, laid on the real furniture
   =========================================================================== */
function surfaceSpots(n) {
  // prefer real worktop/table/shelf heights (40–120cm) — that's where you'd
  // actually leave a box of shells
  var out = [];
  if (!Z.col) return out;
  var cands = Z.col.rects.filter(function (r) {
    var h = r.y1;
    return h > 38 && h < 122 && r.x1 - r.x0 > 30 && r.z1 - r.z0 > 30;
  });
  for (var i = 0; i < n; i++) {
    if (!cands.length) break;
    var r = pick(cands);
    out.push({
      x: rr(r.x0 + 8, r.x1 - 8),
      z: rr(r.z0 + 8, r.z1 - 8),
      y: r.y1 + 6,
    });
  }
  return out;
}

function makePickup(kind, x, y, z, weapon) {
  var g = new THREE.Group();
  var col =
    kind === "health" ? 0x2fd06a :
    kind === "weapon" ? 0xffc23c :
    kind === "armor" ? 0x5ec8ff :
    kind === "adrenaline" ? 0xff66aa :
    kind === "frag" ? 0xff8c3a :
    0x4aa6ff;
  var glow = new THREE.Mesh(
    new THREE.SphereGeometry(11, 16, 12),
    new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  g.add(glow);
  var ring = new THREE.Mesh(
    new THREE.TorusGeometry(12, 0.7, 8, 24),
    new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  var body;
  if (kind === "health") {
    body = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 8), vm(0xeef0f2, 0.45, 0.12));
  } else if (kind === "weapon") {
    body = buildViewModel(weapon);
    body.scale.setScalar(0.55);
  } else if (kind === "armor") {
    body = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 6), vm(0x3a4a58, 0.55, 0.45));
  } else if (kind === "adrenaline") {
    body = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 10), vm(0xff88bb, 0.35, 0.2));
    body.rotation.z = Math.PI / 2;
  } else if (kind === "frag") {
    // a bandolier of them, so it reads as more than one
    body = new THREE.Group();
    for (var fi = 0; fi < 3; fi++) {
      var fg = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), vm(0x3d4a30, 0.62, 0.35));
      fg.scale.set(1, 1.2, 1);
      fg.position.set((fi - 1) * 8, 0, 0);
      body.add(fg);
    }
  } else {
    body = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 9), vm(0x3a4a2c, 0.65, 0.12));
  }
  g.add(body);
  if (kind === "health") {
    var c1 = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 0.7), vm(0xd02020, 0.35, 0));
    c1.position.z = 4.1;
    g.add(c1);
    var c2 = c1.clone();
    c2.rotation.z = Math.PI / 2;
    g.add(c2);
  } else if (kind === "armor") {
    var plate = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 1), vm(0x6a8aaa, 0.4, 0.6));
    plate.position.z = 3.5;
    g.add(plate);
  }
  // The additive shell already reads as a pickup. A PointLight per pickup
  // multiplied the cost of every nearby material and tanked crowded rooms.
  g.position.set(x, y, z);
  Z.grp.add(g);
  var pu = { g: g, kind: kind, weapon: weapon, x: x, y: y, z: z, ph: rnd() * 6, ring: ring };
  Z.pickups.push(pu);
  return pu;
}

function scatterPickups(wave) {
  clearPickups();
  var spots = surfaceSpots(5 + Math.min(6, wave));
  // fall back to room centres when the flat has no worktops
  if (spots.length < 3) {
    liveRooms().forEach(function (r) {
      var f = freeSpot(r.cx + rr(-80, 80), r.cz + rr(-80, 80), 20);
      spots.push({ x: f.x, z: f.z, y: 22 });
    });
  }
  spots.forEach(function (s, i) {
    var roll = rnd();
    var kind =
      roll < 0.25 ? "health" :
      roll < 0.38 ? "armor" :
      roll < 0.45 ? "adrenaline" :
      roll < 0.6 ? "frag" :
      "ammo";
    // first slots bias toward ammo/health
    if (i < 2) kind = i === 0 ? "health" : "ammo";
    makePickup(kind, s.x, s.y + 4, s.z);
  });
  // a new weapon shows up every couple of waves
  var locked = W_ORDER.filter(function (k) {
    return !Z.p.owned[k];
  });
  if (locked.length && (wave === 1 || wave % 2 === 0)) {
    var s2 = spots.length ? pick(spots) : { x: Z.p.x + 120, z: Z.p.z, y: 30 };
    makePickup("weapon", s2.x, s2.y + 6, s2.z, locked[0]);
  }
}

function disposePickup(pu) {
  if (Z.grp) Z.grp.remove(pu.g);
  pu.g.traverse(function (o) {
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
}

// Uncollected drops from earlier waves would otherwise pile up forever.
function clearPickups() {
  Z.pickups.forEach(disposePickup);
  Z.pickups = [];
}

function stepPickups(dt) {
  for (var i = Z.pickups.length - 1; i >= 0; i--) {
    var pu = Z.pickups[i];
    pu.ph += dt;
    pu.g.position.y = pu.y + Math.sin(pu.ph * 2.2) * 4;
    pu.g.rotation.y += dt * 1.5;
    if (pu.ring) {
      pu.ring.rotation.z += dt * 2.4;
      pu.ring.scale.setScalar(1 + Math.sin(pu.ph * 3) * 0.08);
    }
    if (Math.hypot(pu.x - Z.p.x, pu.z - Z.p.z) < 58 && Math.abs(pu.y - Z.p.y) < 140) {
      takePickup(pu);
      disposePickup(pu);
      Z.pickups.splice(i, 1);
    }
  }
}

function takePickup(pu) {
  var P = Z.p;
  if (pu.kind === "health") {
    P.hp = Math.min(MAX_HP, P.hp + 40);
    say(t("z_pick_health"), 1.2);
    flashScreen("#2fd06a", 0.16);
  } else if (pu.kind === "armor") {
    P.armor = Math.min(MAX_ARMOR, (P.armor || 0) + 50);
    say(t("z_pick_armor"), 1.3);
    flashScreen("#5ec8ff", 0.14);
  } else if (pu.kind === "adrenaline") {
    P.adrenalT = Math.max(P.adrenalT || 0, 8);
    P.stam = 100;
    say(t("z_pick_adrenal"), 1.4);
    flashScreen("#ff66aa", 0.18);
  } else if (pu.kind === "frag") {
    P.frags = Math.min(FRAG.maxCarry, (P.frags || 0) + 2);
    say(t("z_pick_frag"), 1.2);
    flashScreen("#ff8c3a", 0.12);
  } else if (pu.kind === "weapon") {
    P.owned[pu.weapon] = true;
    if (!W[pu.weapon].melee) {
      P.reserve[pu.weapon] = (P.reserve[pu.weapon] || 0) + W[pu.weapon].reserve;
      P.ammo[pu.weapon] = W[pu.weapon].mag;
    }
    say(t("z_pick_weapon", { w: t(W[pu.weapon].key) }), 1.8);
    setWeapon(pu.weapon);
  } else {
    var guns = W_ORDER.filter(function (k) {
      return P.owned[k] && !W[k].melee;
    });
    if (guns.length) {
      guns.forEach(function (k) {
        P.reserve[k] = (P.reserve[k] || 0) + Math.round(W[k].mag * 0.9);
      });
      say(t("z_pick_ammo"), 1.2);
    } else {
      P.hp = Math.min(MAX_HP, P.hp + 15);
      say(t("z_pick_ammo"), 1.2);
    }
    if (Z.flash) Z.flash.batt = Math.min(100, Z.flash.batt + 45);
  }
  Z.score = (Z.score || 0) + 25;
  sndPickup();
  hudDirty();
}

/* ===========================================================================
   8. AUDIO — everything procedural (no assets), positioned in stereo
   =========================================================================== */
function audio() {
  if (Z.audio) return Z.audio;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var master = ctx.createGain();
    master.gain.value = 0.62;
    master.connect(ctx.destination);
    // permanent ambient bed: two detuned drones through a slow filter sweep
    var bed = ctx.createGain();
    bed.gain.value = 0.0;
    bed.connect(master);
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    lp.Q.value = 3;
    lp.connect(bed);
    var o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = 41;
    var o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 27.5;
    o1.connect(lp);
    o2.connect(lp);
    o1.start();
    o2.start();
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    var lg = ctx.createGain();
    lg.gain.value = 90;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    bed.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4);
    // reusable noise buffer
    var nb = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate),
      nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    Z.audio = { ctx: ctx, master: master, noise: nb, bed: bed, drone: lp };
  } catch (e) {
    Z.audio = null;
  }
  return Z.audio;
}
function panFor(x, z) {
  var A = audio();
  if (!A) return null;
  var p = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : null;
  if (!p) return null;
  var dx = x - Z.p.x,
    dz = z - Z.p.z,
    fx = Math.sin(Z.p.yaw),
    fz = Math.cos(Z.p.yaw),
    rx = -fz,
    rz = fx,
    d = Math.hypot(dx, dz) || 1;
  p.pan.value = clamp(((dx / d) * rx + (dz / d) * rz) * -1, -1, 1);
  return p;
}
function distGain(x, z, ref) {
  var d = Math.hypot(x - Z.p.x, z - Z.p.z);
  return clamp(1 - d / (ref || 1600), 0, 1);
}
function noiseSrc(A) {
  var s = A.ctx.createBufferSource();
  s.buffer = A.noise;
  s.loop = true;
  return s;
}
function sndShot(def) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.setValueAtTime(def.snd.cut * 2.4, now);
  f.frequency.exponentialRampToValueAtTime(def.snd.cut * 0.35, now + def.snd.dur);
  g.gain.setValueAtTime(def.snd.gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + def.snd.dur);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + def.snd.dur + 0.03);
  // body thump
  var o = A.ctx.createOscillator(),
    og = A.ctx.createGain();
  o.frequency.setValueAtTime(160, now);
  o.frequency.exponentialRampToValueAtTime(42, now + 0.16);
  og.gain.setValueAtTime(def.snd.gain * 0.8, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  o.connect(og);
  og.connect(A.master);
  o.start(now);
  o.stop(now + 0.22);
}
function sndClick() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "highpass";
  f.frequency.value = 2600;
  g.gain.setValueAtTime(0.22, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.06);
}
function sndReload() {
  var A = audio();
  if (!A) return;
  // Deferred clicks must not outlive the session: firing after audioClose()
  // would lazily build a fresh AudioContext (and its permanent ambient bed).
  [0.18, 0.42].forEach(function (d) {
    var id = setTimeout(function () {
      var i = Z.sndTOs.indexOf(id);
      if (i >= 0) Z.sndTOs.splice(i, 1);
      if (Z.active && Z.audio) sndClick();
    }, d * 1000);
    Z.sndTOs.push(id);
  });
  sndClick();
}
function sndWhoosh(def) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "bandpass";
  f.frequency.setValueAtTime(320, now);
  f.frequency.exponentialRampToValueAtTime(1400, now + 0.2);
  f.Q.value = 1.6;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.3, now + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0008, now + 0.28);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.3);
}
// Zombie claw/swipe — air whoosh, plus a wet hit if the strike connects.
function sndSwipe(zd, hit) {
  sndWhoosh(W.pan);
  if (hit && zd) sndFlesh({ x: zd.x, y: (Z.p && Z.p.y) || 100, z: zd.z }, false);
}
function sndFlesh(pt, head) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain(),
    p = panFor(pt.x, pt.z);
  f.type = "lowpass";
  f.frequency.setValueAtTime(head ? 1600 : 900, now);
  f.frequency.exponentialRampToValueAtTime(180, now + 0.14);
  g.gain.setValueAtTime((head ? 0.5 : 0.3) * distGain(pt.x, pt.z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  s.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  s.start(now);
  s.stop(now + 0.2);
}
function sndImpact(pt) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain(),
    p = panFor(pt.x, pt.z);
  f.type = "bandpass";
  f.frequency.value = rr(900, 2600);
  f.Q.value = 2;
  g.gain.setValueAtTime(0.22 * distGain(pt.x, pt.z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  s.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  s.start(now);
  s.stop(now + 0.12);
}
function sndGrowl(zd, alert) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    dur = alert ? 0.9 : rr(0.5, 1.1),
    o = A.ctx.createOscillator(),
    o2 = A.ctx.createOscillator(),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain(),
    p = panFor(zd.x, zd.z);
  o.type = "sawtooth";
  o2.type = "square";
  var base = zd.type === "brute" ? 48 : zd.type === "runner" ? 116 : 74;
  o.frequency.setValueAtTime(base * rr(0.85, 1.15), now);
  o.frequency.linearRampToValueAtTime(base * (alert ? 1.7 : 0.75), now + dur);
  o2.frequency.setValueAtTime(base * 1.51, now);
  o2.frequency.linearRampToValueAtTime(base * 0.9, now + dur);
  f.type = "lowpass";
  f.frequency.value = alert ? 1500 : 700;
  f.Q.value = 6;
  var gain = (alert ? 0.5 : 0.28) * distGain(zd.x, zd.z, 1500);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(gain, now + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  o.connect(f);
  o2.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  o.start(now);
  o2.start(now);
  o.stop(now + dur + 0.05);
  o2.stop(now + dur + 0.05);
}
function sndScream(zd) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    o = A.ctx.createOscillator(),
    g = A.ctx.createGain(),
    f = A.ctx.createBiquadFilter();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(320, now);
  o.frequency.exponentialRampToValueAtTime(1750, now + 0.35);
  o.frequency.exponentialRampToValueAtTime(420, now + 1.5);
  f.type = "bandpass";
  f.frequency.value = 1400;
  f.Q.value = 3;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.5, now + 0.1);
  g.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
  o.connect(f);
  f.connect(g);
  g.connect(A.master);
  o.start(now);
  o.stop(now + 1.7);
}
function sndDeath(zd) {
  sndGrowl({ x: zd.x, z: zd.z, type: "walker" }, false);
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.setValueAtTime(700, now);
  f.frequency.exponentialRampToValueAtTime(120, now + 0.5);
  g.gain.setValueAtTime(0.3 * distGain(zd.x, zd.z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.6);
}
function sndDoor(x, z) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    o = A.ctx.createOscillator(),
    g = A.ctx.createGain(),
    p = panFor(x, z);
  o.type = "sawtooth";
  o.frequency.setValueAtTime(220, now);
  o.frequency.linearRampToValueAtTime(90, now + 0.8);
  g.gain.setValueAtTime(0.06 * distGain(x, z), now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
  o.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  o.start(now);
  o.stop(now + 0.9);
}
// Flamethrower: filtered noise roar with a low rumble under it, looped in
// short overlapping grains so holding the trigger sounds continuous.
function sndFlame() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "bandpass";
  f.frequency.setValueAtTime(rr(420, 700), now);
  f.frequency.linearRampToValueAtTime(rr(900, 1500), now + 0.2);
  f.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.24, now + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.26);
}

// Grenade: a hard crack, a body-hitting thump, and a tail of debris hiss.
function sndBlast(pt) {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    p = panFor(pt.x, pt.z),
    gain = 0.55 + 0.45 * distGain(pt.x, pt.z, 2200);
  var s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.setValueAtTime(4200, now);
  f.frequency.exponentialRampToValueAtTime(220, now + 0.7);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  s.connect(f);
  f.connect(g);
  (p ? (g.connect(p), p) : g).connect(A.master);
  s.start(now);
  s.stop(now + 0.95);
  var o = A.ctx.createOscillator(),
    og = A.ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(120, now);
  o.frequency.exponentialRampToValueAtTime(28, now + 0.4);
  og.gain.setValueAtTime(gain, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  o.connect(og);
  og.connect(A.master);
  o.start(now);
  o.stop(now + 0.55);
}

function sndHurt() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();
  f.type = "lowpass";
  f.frequency.value = 500;
  g.gain.setValueAtTime(0.55, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.32);
}
function sndPickup() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  [660, 990].forEach(function (fr, i) {
    var o = A.ctx.createOscillator(),
      g = A.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = fr;
    g.gain.setValueAtTime(0.0001, now + i * 0.07);
    g.gain.linearRampToValueAtTime(0.18, now + i * 0.07 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.2);
    o.connect(g);
    g.connect(A.master);
    o.start(now + i * 0.07);
    o.stop(now + i * 0.07 + 0.22);
  });
}
function sndStinger() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  [180, 191, 268, 372].forEach(function (fr) {
    var o = A.ctx.createOscillator(),
      g = A.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = fr;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.13, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    o.connect(g);
    g.connect(A.master);
    o.start(now);
    o.stop(now + 1.5);
  });
}
function sndHeartbeat() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  [0, 0.19].forEach(function (d, i) {
    var o = A.ctx.createOscillator(),
      g = A.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(66, now + d);
    o.frequency.exponentialRampToValueAtTime(34, now + d + 0.14);
    g.gain.setValueAtTime(0.0001, now + d);
    g.gain.linearRampToValueAtTime(i ? 0.2 : 0.3, now + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.2);
    o.connect(g);
    g.connect(A.master);
    o.start(now + d);
    o.stop(now + d + 0.22);
  });
}
function sndFootstep(sprint) {
  var A = audio();
  if (!A || !Z.p) return;
  var now = A.ctx.currentTime,
    s = noiseSrc(A),
    f = A.ctx.createBiquadFilter(),
    g = A.ctx.createGain();

  var isBlood = isNearBloodDecal(Z.p.x, Z.p.z);
  var isGlass = isNearGlassDebris(Z.p.x, Z.p.z);

  if (isBlood) {
    f.type = "bandpass";
    f.frequency.value = rr(1100, 2000);
    g.gain.setValueAtTime((sprint ? 0.2 : 0.12), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  } else if (isGlass) {
    f.type = "highpass";
    f.frequency.value = rr(2800, 4800);
    g.gain.setValueAtTime((sprint ? 0.16 : 0.09), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  } else {
    f.type = "lowpass";
    f.frequency.value = rr(400, 800);
    g.gain.setValueAtTime((sprint ? 0.13 : 0.07), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
  }

  s.connect(f);
  f.connect(g);
  g.connect(A.master);
  s.start(now);
  s.stop(now + 0.13);
}

var ambT = rr(10, 22);
function stepHorrorAmbience(dt) {
  if (!Z.active || Z.paused) return;
  ambT -= dt;
  if (ambT <= 0) {
    ambT = rr(14, 30);
    playHouseCreak();
  }
}

function playHouseCreak() {
  var A = audio();
  if (!A) return;
  var now = A.ctx.currentTime;
  var osc = A.ctx.createOscillator();
  var gain = A.ctx.createGain();

  osc.type = "sine";
  var f0 = rr(85, 140);
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.linearRampToValueAtTime(f0 * rr(0.75, 1.25), now + 0.6);

  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

  osc.connect(gain);
  gain.connect(A.master);
  osc.start(now);
  osc.stop(now + 0.68);
}
function audioClose() {
  Z.sndTOs.forEach(clearTimeout);
  Z.sndTOs = [];
  if (Z.audio) {
    try {
      Z.audio.ctx.close();
    } catch (e) {}
    Z.audio = null;
  }
}

/* ===========================================================================
   9. HUD + SCREEN FX (DOM layer over the 3D canvas)
   =========================================================================== */
function buildHud() {
  if (Z.hud) return;
  var host = document.getElementById("view-3d") || document.body;
  var el = document.createElement("div");
  el.id = "zHud";
  el.innerHTML =
    '<canvas id="zGrain"></canvas>' +
    '<div id="zVig"></div>' +
    '<canvas id="zBlood"></canvas>' +
    '<div id="zFlashCol"></div>' +
    '<div id="zChrom"></div>' +
    '<div id="zCross"><i></i><i></i><i></i><i></i><b></b></div>' +
    '<div id="zHitMark"></div>' +
    '<div id="zDamage"><i></i></div>' +
    '<div id="zTop"><span id="zWave"></span><span id="zKills"></span><span id="zScore"></span></div>' +
    '<div id="zMission"><div><span id="zMissionLabel"></span><strong id="zMissionCount"></strong></div><b><i></i></b></div>' +
    '<div id="zThreat"><i></i><span></span></div>' +
    '<div id="zCombo"></div>' +
    '<div id="zMsg"></div>' +
    '<div id="zBottom">' +
    '<div id="zVitals"><div id="zHpBar"><i></i></div><div id="zArmorBar"><i></i></div><div id="zStamBar"><i></i></div>' +
    '<div id="zDistractBar"><i></i></div>' +
    '<div id="zBatt"><span>🔦</span><div id="zBattBar"><i></i></div></div></div>' +
    '<div id="zDistractFx"></div>' +
    '<div id="zAmmo"><span id="zFrags"></span><span id="zWName"></span><span id="zAmmoN"></span></div>' +
    "</div>" +
    '<div id="zWheel"></div>' +
    '<div id="zHint"></div>' +
    '<div id="zPause"><div class="z-pause-card"><span class="z-eyebrow"></span><h2></h2><p></p>' +
    '<div class="z-controls"><span><kbd>WASD</kbd><small></small></span><span><kbd>SHIFT</kbd><small></small></span>' +
    '<span><kbd>SPACE</kbd><small></small></span><span><kbd>R</kbd><small></small></span></div>' +
    '<div class="z-game-settings"><h3></h3>' +
    '<label><span><b id="zQualityLabel"></b><output id="zQualityValue"></output></span><input id="zQualitySlider" type="range" min="0" max="2" step="1"></label>' +
    '<label><span><b id="zHordeLabel"></b><output id="zHordeValue"></output></span><input id="zHordeSlider" type="range" min="8" max="24" step="2"></label>' +
    '<label><span><b id="zFxLabel"></b><output id="zFxValue"></output></span><input id="zFxSlider" type="range" min="25" max="100" step="25"></label></div>' +
    '<button id="zResume"></button><button id="zExit"></button></div></div>' +
    '<div id="zDead"><h2></h2><p></p><button id="zAgain"></button></div>';
  host.appendChild(el);
  Z.hud = {
    root: el,
    grain: el.querySelector("#zGrain"),
    vig: el.querySelector("#zVig"),
    blood: el.querySelector("#zBlood"),
    flash: el.querySelector("#zFlashCol"),
    chrom: el.querySelector("#zChrom"),
    cross: el.querySelector("#zCross"),
    hit: el.querySelector("#zHitMark"),
    damage: el.querySelector("#zDamage"),
    wave: el.querySelector("#zWave"),
    kills: el.querySelector("#zKills"),
    score: el.querySelector("#zScore"),
    combo: el.querySelector("#zCombo"),
    mission: el.querySelector("#zMission"),
    missionLabel: el.querySelector("#zMissionLabel"),
    missionCount: el.querySelector("#zMissionCount"),
    missionBar: el.querySelector("#zMission b i"),
    threat: el.querySelector("#zThreat"),
    threatText: el.querySelector("#zThreat span"),
    msg: el.querySelector("#zMsg"),
    hp: el.querySelector("#zHpBar i"),
    armor: el.querySelector("#zArmorBar i"),
    stam: el.querySelector("#zStamBar i"),
    distract: el.querySelector("#zDistractBar i"),
    distractFx: el.querySelector("#zDistractFx"),
    batt: el.querySelector("#zBattBar i"),
    wname: el.querySelector("#zWName"),
    ammo: el.querySelector("#zAmmoN"),
    frags: el.querySelector("#zFrags"),
    wheel: el.querySelector("#zWheel"),
    hint: el.querySelector("#zHint"),
    pause: el.querySelector("#zPause"),
    pauseEye: el.querySelector("#zPause .z-eyebrow"),
    pauseH: el.querySelector("#zPause h2"),
    pauseP: el.querySelector("#zPause p"),
    resume: el.querySelector("#zResume"),
    exit: el.querySelector("#zExit"),
    settingsH: el.querySelector("#zPause .z-game-settings h3"),
    qualityLabel: el.querySelector("#zQualityLabel"),
    qualityValue: el.querySelector("#zQualityValue"),
    qualitySlider: el.querySelector("#zQualitySlider"),
    hordeLabel: el.querySelector("#zHordeLabel"),
    hordeValue: el.querySelector("#zHordeValue"),
    hordeSlider: el.querySelector("#zHordeSlider"),
    fxLabel: el.querySelector("#zFxLabel"),
    fxValue: el.querySelector("#zFxValue"),
    fxSlider: el.querySelector("#zFxSlider"),
    dead: el.querySelector("#zDead"),
    deadH: el.querySelector("#zDead h2"),
    deadP: el.querySelector("#zDead p"),
    again: el.querySelector("#zAgain"),
  };
  Z.hud.again.addEventListener("click", function (e) {
    e.stopPropagation();
    restart();
  });
  var controlLabels = el.querySelectorAll("#zPause .z-controls small");
  ["z_control_move", "z_control_sprint", "z_control_shove", "z_control_reload"].forEach(function (key, i) {
    if (controlLabels[i]) controlLabels[i].textContent = t(key);
  });
  Z.hud.settingsH.textContent = t("z_settings");
  Z.hud.qualityLabel.textContent = t("z_setting_quality");
  Z.hud.hordeLabel.textContent = t("z_setting_horde");
  Z.hud.fxLabel.textContent = t("z_setting_fx");
  Z.hud.qualitySlider.addEventListener("input", function () {
    gameSettings().quality = Number(this.value);
    saveGameSettings();
    // Texture dimensions are baked into every current material. Rebuild the
    // paused run when that budget changes instead of leaving this part of the
    // graphics setting dormant until the next Night Shift session.
    var texBudgetChanged = setTexBudget(gameSettings().quality);
    applyGameSettings();
    if (texBudgetChanged && Z.active) {
      clearViewModels();
      dropTextureCaches();
      restart();
    }
    syncSettingsUi();
  });
  Z.hud.hordeSlider.addEventListener("input", function () {
    gameSettings().maxAlive = Number(this.value);
    saveGameSettings();
    syncSettingsUi();
  });
  Z.hud.fxSlider.addEventListener("input", function () {
    gameSettings().fx = Number(this.value);
    saveGameSettings();
    applyGameSettings();
    syncSettingsUi();
  });
  syncSettingsUi();
  Z.hud.resume.addEventListener("click", function (e) {
    e.stopPropagation();
    pauseGame(false);
  });
  Z.hud.exit.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleZombies(false);
  });
  initGrain();
}

// animated film grain: one small tiled canvas redrawn a few times a second
function initGrain() {
  var c = Z.hud.grain;
  c.width = 96;
  c.height = 96;
  Z.grainCtx = c.getContext("2d");
  Z.grainT = 0;
}
function stepGrain(dt) {
  Z.grainT -= dt;
  if (Z.grainT > 0 || !Z.grainCtx) return;
  Z.grainT = 0.12;
  var x = Z.grainCtx,
    img = x.createImageData(96, 96),
    d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var v = 128 + (Math.random() - 0.5) * 190;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 26;
  }
  x.putImageData(img, 0, 0);
}

var hudNeedsUpdate = true;
function hudDirty() {
  hudNeedsUpdate = true;
}
function hudSync() {
  if (!Z.hud || !Z.p) return;
  var P = Z.p,
    def = W[P.weapon];
  // DOM/compositing does not need to run at render frequency. Combat events
  // still set hudNeedsUpdate, while smooth bars remain clear at ~12 Hz.
  if (!hudNeedsUpdate && Z.t < (Z.hudNext || 0)) return;
  Z.hudNext = Z.t + 0.08;
  Z.hud.hp.style.width = clamp((P.hp / MAX_HP) * 100, 0, 100) + "%";
  Z.hud.hp.style.background =
    P.hp > 55 ? "#c8202a" : P.hp > 25 ? "#e0611a" : "#ff2020";
  if (Z.hud.armor) {
    Z.hud.armor.style.width = clamp(((P.armor || 0) / MAX_ARMOR) * 100, 0, 100) + "%";
    Z.hud.armor.parentElement.style.opacity = (P.armor || 0) > 0 ? "1" : "0.25";
  }
  Z.hud.stam.style.width = clamp(P.stam, 0, 100) + "%";
  if (Z.hud.distract) {
    var dk = clamp((P.distract || 0) * 100, 0, 100);
    Z.hud.distract.style.width = dk + "%";
    Z.hud.distract.parentElement.style.opacity = dk > 4 ? "1" : "0.2";
  }
  if (Z.flash) Z.hud.batt.style.width = clamp(Z.flash.batt, 0, 100) + "%";
  if (Z.hud.combo) {
    if (Z.combo >= 2 && Z.comboT > 0) {
      Z.hud.combo.textContent = "COMBO ×" + Z.combo;
      Z.hud.combo.classList.add("on");
    } else Z.hud.combo.classList.remove("on");
  }
  var live = 0,
    nearest = Infinity;
  for (var zi = 0; zi < Z.zeds.length; zi++) {
    if (Z.zeds[zi].dead) continue;
    live++;
    nearest = Math.min(nearest, Math.hypot(Z.zeds[zi].x - P.x, Z.zeds[zi].z - P.z));
  }
  if (Z.wave && Z.hud.mission) {
    if (Z.wave.state === "fight") {
      var remaining = Math.max(0, (Z.wave.pending || 0) + live),
        total = Math.max(1, Z.wave.total || remaining || 1);
      Z.hud.missionLabel.textContent = Z.wave.event
        ? t("z_objective_event", { event: Z.wave.event.toUpperCase() })
        : t("z_objective_survive");
      Z.hud.missionCount.textContent = t("z_remaining", { n: remaining });
      Z.hud.missionBar.style.width = clamp((1 - remaining / total) * 100, 0, 100) + "%";
    } else {
      var nextIn = Math.max(0, Math.ceil(REST_LEN - Z.wave.timer));
      Z.hud.missionLabel.textContent = t("z_objective_resupply");
      Z.hud.missionCount.textContent = t("z_next_in", { n: nextIn });
      Z.hud.missionBar.style.width = clamp((Z.wave.timer / REST_LEN) * 100, 0, 100) + "%";
    }
  }
  if (Z.hud.threat) {
    var level = nearest < 190 ? "danger" : nearest < 430 ? "near" : "clear";
    Z.hud.threat.className = level;
    Z.hud.threatText.textContent = t("z_threat_" + level);
  }
  if (!hudNeedsUpdate) return;
  hudNeedsUpdate = false;
  Z.hud.wname.textContent = W[P.weapon].icon + " " + t(def.key);
  Z.hud.ammo.textContent = def.melee
    ? "∞"
    : P.ammo[P.weapon] + " / " + P.reserve[P.weapon];
  Z.hud.ammo.classList.toggle("low", !def.melee && P.ammo[P.weapon] <= def.mag * 0.25);
  if (Z.hud.frags) {
    Z.hud.frags.textContent = "💣 " + (P.frags || 0);
    Z.hud.frags.classList.toggle("low", !P.frags);
  }
  Z.hud.wave.textContent = t("z_wave_n", { n: Z.wave.n });
  Z.hud.kills.textContent = "☠ " + Z.stats.kills;
  if (Z.hud.score) Z.hud.score.textContent = "★ " + (Z.score || 0);
  var html = "";
  W_ORDER.forEach(function (k, i) {
    if (!P.owned[k]) return;
    html +=
      '<span class="' +
      (k === P.weapon ? "on" : "") +
      '">' +
      (i + 1) +
      " " +
      W[k].icon +
      "</span>";
  });
  Z.hud.wheel.innerHTML = html;
}

function say(msg, dur) {
  if (!Z.hud) return;
  Z.hud.msg.textContent = msg;
  Z.hud.msg.classList.add("on");
  Z.msgT = dur || 1.5;
}
function hitMarker(head) {
  if (!Z.hud) return;
  Z.hud.hit.classList.remove("on", "head");
  void Z.hud.hit.offsetWidth;
  Z.hud.hit.classList.add("on");
  if (head) Z.hud.hit.classList.add("head");
  Z.hitT = 0.18;
}
function flashScreen(color, alpha) {
  if (!Z.hud) return;
  Z.hud.flash.style.background = color;
  Z.hud.flash.style.opacity = alpha;
  Z.flashT = 0.12;
}
function showDamageDirection(src) {
  if (!Z.hud || !Z.hud.damage || !src || !Z.p) return;
  var bearing = Math.atan2(src.x - Z.p.x, src.z - Z.p.z),
    relative = bearing - Z.p.yaw;
  Z.hud.damage.style.transform = "translate(-50%, -50%) rotate(" + relative + "rad)";
  Z.hud.damage.classList.remove("on");
  void Z.hud.damage.offsetWidth;
  Z.hud.damage.classList.add("on");
  clearTimeout(Z.damageTO);
  Z.damageTO = setTimeout(function () {
    if (Z.hud && Z.hud.damage) Z.hud.damage.classList.remove("on");
  }, 720);
}
/* ---- visor blood ----------------------------------------------------------
   Blood on the CAMERA, not in the world. The old version stamped CSS radial
   gradients, which read as flat red circles floating over the picture. This
   draws the real fx_blood_*.png splatters into a canvas the size of the
   viewport, so they have actual edges, drips and satellite droplets, and they
   PERSIST until you wipe them with V (the slow bleed-off below is only a safety
   valve so a player who never wipes is not blinded forever). */
var BLOOD_SRC = ["fx_blood_1.png", "fx_blood_2.png", "fx_blood_3.png"];
var bloodImgs = null;

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

function tintMask(img, tint) {
  var c = document.createElement("canvas");
  c.width = c.height = 512; // half the source; it is a blurred grime layer
  var x = c.getContext("2d");
  x.drawImage(img, 0, 0, 512, 512);
  var g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, tint[0]);
  g.addColorStop(1, tint[1]);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  return c;
}

function loadBloodImgs() {
  if (bloodImgs) return bloodImgs;
  bloodImgs = [];
  BLOOD_SRC.forEach(function (n) {
    var im = new Image();
    im.onload = function () {
      BLOOD_TINTS.forEach(function (tint) {
        try { bloodImgs.push(tintMask(im, tint)); } catch (e) {}
      });
    };
    im.src = "assets/textures/" + n;
  });
  return bloodImgs;
}

// The overlay canvas is sized in CSS pixels (not DPR-scaled): it is a smeared
// grime layer, so resolution buys nothing and a full-DPR canvas on a 4K screen
// would cost real time every wipe frame.
function bloodCtx() {
  var c = Z.hud && Z.hud.blood;
  if (!c || !c.getContext) return null;
  var w = c.clientWidth | 0,
    h = c.clientHeight | 0;
  if (!w || !h) return null;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c.getContext("2d");
}

function bloodSplat(intensity) {
  var ctx = bloodCtx();
  if (!ctx) return;
  var imgs = loadBloodImgs(),
    c = Z.hud.blood;
  // the tinted sprites arrive asynchronously; nothing to stamp until they do
  if (!imgs.length) return;
  var n = Math.round(2 + intensity * 3);
  for (var i = 0; i < n; i++) {
    var im = imgs[(Math.random() * imgs.length) | 0];
    // bias toward the edges: a splatter across the middle of the view is the
    // one thing that actually stops you playing
    var edge = Math.random() < 0.62;
    var x = edge ? (Math.random() < 0.5 ? rr(-0.05, 0.3) : rr(0.7, 1.05)) : rr(0.15, 0.85);
    var y = edge ? (Math.random() < 0.5 ? rr(-0.05, 0.35) : rr(0.65, 1.05)) : rr(0.1, 0.9);
    var s = rr(0.18, 0.5) * (0.7 + intensity * 0.5) * Math.min(c.width, c.height);
    ctx.save();
    ctx.translate(x * c.width, y * c.height);
    ctx.rotate(Math.random() * Math.PI * 2);
    ctx.globalAlpha = rr(0.45, 0.9);
    ctx.drawImage(im, -s / 2, -s / 2, s, s * rr(0.75, 1.3));
    ctx.restore();
  }
  Z.bloodDirty = true;
  c.classList.add("on");
}

/* V — drag a forearm across the visor. Real smear: the canvas is repeatedly
   drawn back onto itself, offset and slightly scaled, while a destination-out
   wedge eats it from one side. That streaks the existing pixels instead of
   cross-fading them, which is what makes it read as wiping rather than as the
   blood politely disappearing. */
function wipeVisor() {
  var ctx = bloodCtx();
  if (!ctx || Z.wiping) return;
  var c = Z.hud.blood;
  Z.wiping = true;
  var t0 = performance.now(),
    DUR = 620,
    dir = Math.random() < 0.5 ? 1 : -1;
  sndFootstep(false); // cloth-on-glass scuff; no dedicated sample
  (function step() {
    var k = Math.min(1, (performance.now() - t0) / DUR);
    // smear: redraw offset along the wipe direction, fading as it goes
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(c, dir * 9, 2);
    ctx.globalAlpha = 1;
    // erase a soft-edged band that sweeps across, leaving thinning streaks
    var band = c.width * 0.55,
      lead = (dir > 0 ? -band + k * (c.width + band * 2) : c.width + band - k * (c.width + band * 2));
    var grd = ctx.createLinearGradient(lead - dir * band, 0, lead + dir * band, 0);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.5, "rgba(0,0,0,0.72)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
    if (k < 1) requestAnimationFrame(step);
    else {
      // whatever survived the sweep goes with a final clean pass
      ctx.clearRect(0, 0, c.width, c.height);
      c.classList.remove("on");
      Z.wiping = false;
      Z.bloodDirty = false;
    }
  })();
}

// Safety bleed-off: a very slow erase so blood cannot accumulate to the point
// of blindness if the player never presses V. Called from the game tick.
function fadeVisor(dt) {
  if (!Z.bloodDirty || Z.wiping) return;
  Z.bloodFadeT = (Z.bloodFadeT || 0) + dt;
  if (Z.bloodFadeT < 0.25) return; // ~4Hz, not every frame
  Z.bloodFadeT = 0;
  var ctx = bloodCtx();
  if (!ctx) return;
  var c = Z.hud.blood;
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,0.012)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "source-over";
}

/* ===========================================================================
   10. PLAYER
   =========================================================================== */
function newPlayer() {
  var b = interiorBounds(),
    rooms = liveRooms(),
    start = rooms.length
      ? rooms.sort(function (a, c) {
          return c.area - a.area;
        })[0]
      : null;
  var sx = start ? start.cx : b ? (b.minx + b.maxx) / 2 : 0,
    sz = start ? start.cz : b ? (b.minz + b.maxz) / 2 : 0;
  var f = freeSpot(sx, sz, P_RAD);
  return {
    x: f.x,
    z: f.z,
    y: 0,
    vy: 0,
    yaw: Math.PI,
    pitch: 0,
    hp: MAX_HP,
    armor: 0,
    stam: 100,
    crouch: false,
    sprint: false,
    aim: false,
    vx: 0,
    vz: 0,
    bob: 0,
    speedK: 0,
    dead: false,
    deadT: 0,
    hurtT: 0,
    regenT: 0,
    adrenalT: 0,
    dodgeT: 0,
    weapon: "knife",
    // Keep the signature ranged weapons available from the opening wave. The
    // remaining household weapons still arrive as pickups during progression.
    owned: { knife: true, pistol: true, smg: true, shotgun: true, flamer: true },
    ammo: {
      pistol: W.pistol.mag,
      smg: W.smg.mag,
      shotgun: W.shotgun.mag,
      flamer: W.flamer.mag,
    },
    reserve: {
      pistol: W.pistol.reserve,
      smg: W.smg.reserve,
      shotgun: W.shotgun.reserve,
      flamer: W.flamer.reserve,
    },
    nextShot: 0,
    reloading: 0,
    swing: 0,
    swingMax: 0,
    swingHit: false,
    bloom: 0,
    vmKick: 0,
    swayX: 0,
    swayY: 0,
    lookDX: 0,
    lookDY: 0,
    stepD: 0,
    firing: false,
    shoveT: 0,
    frags: 3,
    nextFrag: 0,
    flameFuel: 0,
    flameTick: 0,
    hitStop: 0,
    distract: 0,
    distractLook: 0,
  };
}

function hurtPlayer(dmg, src) {
  var P = Z.p;
  if (P.dead) return;
  // i-frames during dodge
  if (P.dodgeT > 0.12) return;
  var raw = dmg;
  // armor absorbs 60% until depleted
  if (P.armor > 0) {
    var absorbed = Math.min(P.armor, raw * 0.6);
    P.armor -= absorbed;
    raw -= absorbed;
  }
  // adrenaline reduces damage slightly
  if (P.adrenalT > 0) raw *= 0.75;
  P.hp -= raw;
  Z.stats.dmgTaken = (Z.stats.dmgTaken || 0) + raw;
  P.hurtT = 0.55;
  P.regenT = 6.5;
  bloodSplat(clamp(raw / 22, 0.3, 1.7));
  showDamageDirection(src);
  shake(0.55 + Math.min(0.4, raw * 0.02));
  sndHurt();
  if (Z.flash) Z.flash.dip = 0.28;
  // break combo on damage
  Z.combo = 0;
  Z.comboT = 0;
  // knocked back a step
  if (src) {
    var dx = P.x - src.x,
      dz = P.z - src.z,
      d = Math.hypot(dx, dz) || 1;
    _movePoint2D.x = P.x + (dx / d) * 30;
    _movePoint2D.z = P.z + (dz / d) * 30;
    collideCircle(_movePoint2D, P_RAD, P.y, P_CLEAR, STEP);
    P.x = _movePoint2D.x;
    P.z = _movePoint2D.z;
  }
  if (P.hp <= 0) {
    P.hp = 0;
    P.dead = true;
    P.deadT = 0;
    Z.stats.best = Math.max(Z.stats.best, Z.wave.n);
    sndStinger();
    if (Z.hud) {
      Z.hud.deadH.textContent = t("z_dead");
      Z.hud.deadP.textContent = t("z_dead_stats", {
        w: Z.wave.n,
        k: Z.stats.kills,
        h: Z.stats.heads,
        s: Z.score || 0,
      });
      Z.hud.again.textContent = t("z_again");
      Z.hud.dead.classList.add("on");
    }
    unlockPointer();
  }
  hudDirty();
}

function stepPlayer(dt) {
  var P = Z.p,
    K = Z.keys;
  if (P.dead) {
    P.deadT += dt;
    return;
  }
  if (P.hitStop > 0) {
    P.hitStop -= dt;
    return; // freeze player briefly on meaty hits
  }
  if (P.dodgeT > 0) P.dodgeT -= dt;
  if (P.adrenalT > 0) P.adrenalT -= dt;

  // stamina
  P.sprint = !!K.sprint && P.stam > 2 && !P.crouch && (K.fwd || K.back || K.left || K.right);
  if (P.sprint) P.stam = Math.max(0, P.stam - dt * (P.adrenalT > 0 ? 14 : 24));
  else P.stam = Math.min(100, P.stam + dt * (P.crouch ? 26 : 16) * (P.adrenalT > 0 ? 1.4 : 1));

  var spd = P.crouch ? SPD_CROUCH : P.sprint ? SPD_SPRINT : SPD_WALK;
  // low-HP adrenaline surge + pickup boost
  if (P.hp < 30) spd *= 1.08;
  if (P.adrenalT > 0) spd *= 1.22;
  if (P.aim) spd *= 0.55;
  if (P.swing > 0) spd *= 0.78;
  if (P.dodgeT > 0) spd *= 1.85;
  var fx = Math.sin(P.yaw),
    fz = Math.cos(P.yaw),
    rx = -fz,
    rz = fx,
    mx = 0,
    mz = 0;
  if (K.fwd) { mx += fx; mz += fz; }
  if (K.back) { mx -= fx; mz -= fz; }
  if (K.right) { mx += rx; mz += rz; }
  if (K.left) { mx -= rx; mz -= rz; }
  var l = Math.hypot(mx, mz);
  if (l > 0.001) {
    mx /= l;
    mz /= l;
  }
  var k = dampingFactor(ACCEL, dt);
  P.vx += (mx * spd - P.vx) * k;
  P.vz += (mz * spd - P.vz) * k;
  // continuous collision so sprinting can't skip thin walls / door jambs
  _movePoint2D.x = P.x;
  _movePoint2D.z = P.z;
  moveCircle(_movePoint2D, P.vx * dt, P.vz * dt, P_RAD, P.y, P.crouch ? 100 : P_CLEAR, STEP);
  P.x = _movePoint2D.x;
  P.z = _movePoint2D.z;
  // vertical: step up onto furniture, fall off it
  var g = groundAt(P.x, P.z, P.y, STEP);
  if (g > P.y) P.y = Math.min(g, P.y + 280 * dt);
  else {
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    if (P.y <= g) {
      P.y = g;
      P.vy = 0;
    }
  }
  // head bob + footsteps
  var sp2 = Math.hypot(P.vx, P.vz);
  P.speedK = clamp(sp2 / SPD_WALK, 0, 2.4);
  P.bob += dt * sp2 * (P.sprint ? 0.052 : 0.042);
  P.stepD += sp2 * dt;
  var stride = P.sprint ? 145 : P.crouch ? 210 : 170;
  if (P.stepD > stride) {
    P.stepD = 0;
    sndFootstep(P.sprint);
    if (P.sprint) makeNoise(P.x, P.z, 400);
  }
  // recovery
  if (P.regenT > 0) P.regenT -= dt;
  else if (P.hp < MAX_HP) P.hp = Math.min(MAX_HP, P.hp + dt * 2.6);
  if (P.hurtT > 0) P.hurtT -= dt;
  P.bloom = Math.max(0, P.bloom - dt * (P.aim ? 0.14 : 0.1));
  if (P.reloading > 0) {
    P.reloading -= dt * (P.adrenalT > 0 ? 1.25 : 1);
    if (P.reloading <= 0) finishReload();
  }
  // auto weapons keep firing while held; the flamer is a continuous stream
  if (P.firing && W[P.weapon].flame) flame(dt);
  else if (P.firing && W[P.weapon].auto) fire();

  // doors creak open as you approach (and stay open)
  if (Z.col)
    Z.col.doorSegs.forEach(function (ds) {
      if (!ds.pivot || ds.pivot.userData.open) return;
      var mx2 = (ds.ax + ds.bx) / 2,
        mz2 = (ds.az + ds.bz) / 2;
      if (Math.hypot(P.x - mx2, P.z - mz2) < 95) {
        ds.pivot.userData.open = true;
        Z.doorsOpened.push(ds.pivot);
        sndDoor(mx2, mz2);
      }
    });

  // --- distraction: looking at pretty / siren undead softens aim and focus
  stepDistract(dt, P);
  fadeVisor(dt); // slow bleed-off of visor blood (V wipes it properly)

  // heartbeat when hurt, close, distracted, or adrenal
  var near = 1e9;
  for (var i = 0; i < Z.zeds.length; i++)
    if (!Z.zeds[i].dead) near = Math.min(near, Z.zeds[i].dist);
  var panic = P.hp < 40 || near < 220 || P.adrenalT > 0 || P.distract > 0.45;
  Z.hbT = (Z.hbT || 0) - dt;
  if (panic && Z.hbT <= 0) {
    Z.hbT = P.distract > 0.6 ? 0.48 : P.hp < 25 ? 0.55 : P.adrenalT > 0 ? 0.5 : 0.82;
    sndHeartbeat();
  }
}

function stepDistract(dt, P) {
  var fx = Math.sin(P.yaw) * Math.cos(P.pitch),
    fy = Math.sin(P.pitch),
    fz = Math.cos(P.yaw) * Math.cos(P.pitch);
  var gain = 0,
    bestLook = null,
    bestDot = 0.55;
  for (var i = 0; i < Z.zeds.length; i++) {
    var zd = Z.zeds[i];
    if (zd.dead) continue;
    var dx = zd.x - P.x,
      dy = (zd.y + (zd.female ? 120 : 110)) - (P.y + EYE),
      dz = zd.z - P.z,
      d = Math.hypot(dx, dy, dz) || 1;
    if (d > 900) continue;
    var dot = (dx * fx + dy * fy + dz * fz) / d;
    if (dot < 0.55) continue;
    // body center bias: looking at torso (not headshots) is more distracting
    var torsoDot = dot;
    if (P.pitch < -0.05 && P.pitch > -0.55) torsoDot += 0.12;
    var power = (zd.distract || 0.2) * (0.4 + torsoDot) * (1 - d / 1000);
    if (zd.state === "tease") power *= 2.1;
    if (zd.grabbing) power *= 1.8;
    if (zd.siren) power *= 1.35;
    if (!losClear(P.x, P.z, zd.x, zd.z) && d > 200) power *= 0.25;
    gain += power;
    if (torsoDot > bestDot) {
      bestDot = torsoDot;
      bestLook = zd;
    }
  }
  // accumulate / decay
  if (gain > 0.08) {
    P.distract = Math.min(1, P.distract + gain * dt * 0.85);
    P.distractLook = bestLook;
  } else {
    P.distract = Math.max(0, P.distract - dt * (P.sprint ? 0.55 : 0.28));
    if (P.distract < 0.05) P.distractLook = null;
  }
  Z.distract = P.distract;
  // combat penalties
  if (P.distract > 0.15) {
    P.bloom = Math.min(0.09, P.bloom + P.distract * dt * 0.06);
    // slight mouse drift toward the body they're ogling
    if (bestLook && P.distract > 0.35) {
      var wantPitch = Math.atan2(
        bestLook.y + 105 - (P.y + EYE),
        Math.hypot(bestLook.x - P.x, bestLook.z - P.z)
      );
      P.pitch += (wantPitch - P.pitch) * dt * P.distract * 0.55;
    }
  }
  // whisper cue at peaks
  if (P.distract > 0.72 && rnd() < dt * 0.4) {
    say(t("z_distract_heavy"), 0.9);
    flashScreen("#ff6699", 0.06);
  }
}

function applyCamera() {
  var P = Z.p,
    cam = getMainCamera();
  var eye = (P.crouch ? EYE_CROUCH : EYE) + Math.abs(Math.sin(P.bob)) * 2.4 * P.speedK;
  if (P.dead) eye = clamp(EYE - P.deadT * 180, 26, EYE); // the fall
  var pitch = P.pitch + Z.shakeV.y + (P.dead ? Math.min(0.9, P.deadT * 0.5) : 0);
  var yaw = P.yaw + Z.shakeV.x;
  cam.position.set(P.x, P.y + eye, P.z);
  var dx = Math.cos(pitch) * Math.sin(yaw),
    dy = Math.sin(pitch),
    dz = Math.cos(pitch) * Math.cos(yaw);
  cam.up.set(0, 1, 0);
  cam.lookAt(P.x + dx * 400, P.y + eye + dy * 400, P.z + dz * 400);
  // roll: lean into strafing, tilt hard when dying
  var strafe = (Z.keys.right ? 1 : 0) - (Z.keys.left ? 1 : 0);
  cam.rotateZ((P.dead ? Math.min(1.2, P.deadT * 0.8) : 0) + strafe * -0.02 - Math.sin(P.bob) * 0.007 * P.speedK);
  // FOV punch: aim tightens, sprint opens up, hurt/adrenal/distract pulses
  if (Z.baseFov == null) Z.baseFov = cam.fov || 60;
  var want =
    Z.baseFov +
    (P.sprint ? 6 : 0) -
    (P.aim ? 12 : 0) +
    (P.hurtT > 0 ? 2 : 0) +
    (P.adrenalT > 0 ? 4 : 0) +
    (P.distract > 0.3 ? P.distract * 5 : 0);
  // frame-rate independent approach (~0.18 per 60Hz frame)
  cam.fov += (want - cam.fov) * (1 - Math.pow(0.82, (Z.lastDt || 1 / 60) * 60));
  cam.updateProjectionMatrix();
}

/* ===========================================================================
   11. WAVES
   =========================================================================== */
function spawnPoints() {
  // prefer doorways and windows far from the player and out of sight
  var pts = [];
  if (Z.col) {
    Z.col.windows.forEach(function (w) {
      pts.push({ x: w.x + w.nx * 40, z: w.z + w.nz * 40 });
      pts.push({ x: w.x - w.nx * 40, z: w.z - w.nz * 40 });
    });
    Z.col.doorSegs.forEach(function (d) {
      pts.push({ x: (d.ax + d.bx) / 2, z: (d.az + d.bz) / 2 });
    });
  }
  liveRooms().forEach(function (r) {
    pts.push({ x: r.cx, z: r.cz });
    r.pts.forEach(function (p, i) {
      var q = r.pts[(i + 1) % r.pts.length];
      pts.push({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
    });
  });
  var b = interiorBounds();
  if (!pts.length && b)
    for (var i = 0; i < 8; i++)
      pts.push({ x: rr(b.minx + 60, b.maxx - 60), z: rr(b.minz + 60, b.maxz - 60) });
  return pts;
}

function pickSpawn() {
  var pts = Z.spawnPts && Z.spawnPts.length ? Z.spawnPts : (Z.spawnPts = spawnPoints());
  var best = null,
    bestScore = -1e9;
  for (var i = 0; i < 14; i++) {
    var p = pick(pts);
    if (!p) break;
    var d = Math.hypot(p.x - Z.p.x, p.z - Z.p.z);
    if (d < 260) continue;
    // never stack two of them on the same spot — a pile of overlapping bodies
    // reads as one broken mesh instead of two zombies
    var crowded = false;
    for (var q = 0; q < Z.zeds.length; q++) {
      var o2 = Z.zeds[q];
      if (!o2.dead && Math.hypot(o2.x - p.x, o2.z - p.z) < 85) crowded = true;
    }
    if (crowded) continue;
    var hidden = !losClear(p.x, p.z, Z.p.x, Z.p.z);
    var score = (hidden ? 900 : 0) + Math.min(d, 1400) - Math.max(0, d - 1600);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (!best) {
    var b = interiorBounds();
    best = b
      ? { x: rr(b.minx + 60, b.maxx - 60), z: rr(b.minz + 60, b.maxz - 60) }
      : { x: Z.p.x + 400, z: Z.p.z + 400 };
  }
  return best;
}

function waveTypes(n) {
  // the mix gets nastier: runners from 2, brutes from 3, screamers from 4
  var pool = [];
  for (var k in Z_TYPES) {
    if (k === "runner" && n < 2) continue;
    if (k === "brute" && n < 3) continue;
    if (k === "bloater" && n < 3) continue;
    if (k === "screamer" && n < 4) continue;
    if (k === "crawler" && n < 2) continue;
    var w = Z_TYPES[k].w;
    if (k === "runner") w += n * 6;
    if (k === "brute") w += n * 2;
    if (k === "bloater") w += Math.max(0, n - 2) * 2;
    if (k === "screamer") w += Math.max(0, n - 3) * 2;
    if (k === "crawler") w += Math.max(0, n - 1) * 2;
    for (var i = 0; i < w; i++) pool.push(k);
  }
  return pool;
}

function startWave(n) {
  var total = Math.min(52, 5 + n * 3 + (n >= 5 ? n : 0));
  // special event waves
  var event = null;
  if (n > 1 && n % 5 === 0) event = "horde";
  else if (n > 2 && n % 4 === 0) event = "blackout";
  else if (n >= 6 && n % 3 === 0) event = "runners";

  var pool = waveTypes(n);
  if (event === "horde") {
    total = Math.min(60, total + 10);
    pool = pool.concat(pool.filter(function (k) { return k === "walker" || k === "crawler"; }));
  } else if (event === "runners") {
    pool = [];
    for (var r = 0; r < 40; r++) pool.push(r < 30 ? "runner" : "walker");
  }

  Z.wave = {
    n: n,
    total: total,
    pending: total,
    state: "fight",
    timer: 0,
    spawnT: 0,
    pool: pool,
    event: event,
    bossSpawned: false,
  };
  Z.spawnPts = spawnPoints();
  if (event === "horde") say(t("z_event_horde", { n: n }), 2.8);
  else if (event === "blackout") {
    say(t("z_event_blackout", { n: n }), 2.8);
    // kill most practicals for a while
    Z.lamps.forEach(function (L) {
      if (!L._savedMode) L._savedMode = L.mode;
      L.mode = "dead";
    });
    if (Z.flash) Z.flash.batt = Math.min(Z.flash.batt, 45);
  } else if (event === "runners") say(t("z_event_runners", { n: n }), 2.8);
  else say(t("z_wave_start", { n: n }), 2.4);
  sndStinger();
  scatterPickups(n);
  // boss brute every 5 waves
  if (n >= 5 && n % 5 === 0) {
    var bp = pickSpawn();
    var boss = spawnZed("brute", bp.x, bp.z);
    boss.hp *= 1.6;
    boss.maxHp = boss.hp;
    boss.spd *= 1.1;
    boss.dmg *= 1.25;
    boss.alerted = true;
    boss.state = "chase";
    boss.rig.root.scale.multiplyScalar(1.12);
    Z.wave.pending = Math.max(0, Z.wave.pending - 1);
    Z.wave.bossSpawned = true;
    say(t("z_boss"), 2.2);
  }
  hudDirty();
}

function stepWave(dt) {
  var Wv = Z.wave;
  if (!Wv) return;
  Wv.timer += dt;
  if (Wv.state === "fight") {
    Wv.spawnT -= dt;
    var live = Z.zeds.filter(function (z2) {
      return !z2.dead;
    }).length;
    // A horde is hundreds of separately animated meshes. Keep the user's
    // horde choice as an upper bound, while the graphics tier supplies a safe
    // visual cap so Fast actually reduces both CPU simulation and draw calls.
    var qualityCap = [12, 18, 24][gameSettings().quality || 0];
    var aliveCap = Math.min(gameSettings().maxAlive || Z_MAX_ALIVE, qualityCap);
    if (Wv.pending > 0 && Wv.spawnT <= 0 && live < aliveCap) {
      var baseCd = Wv.event === "horde" ? 1.4 : Wv.event === "runners" ? 1.1 : 2.4;
      Wv.spawnT = clamp(baseCd - Wv.n * 0.14, 0.35, 2.5) * rr(0.55, 1.35);
      var p = pickSpawn(),
        type = pick(Wv.pool);
      var zd = spawnZed(type, p.x, p.z);
      // late waves: slight stat ramp
      if (Wv.n > 6) {
        zd.hp *= 1 + (Wv.n - 6) * 0.04;
        zd.spd *= 1 + (Wv.n - 6) * 0.02;
      }
      Wv.pending--;
    }
    if (Wv.pending <= 0 && live === 0) {
      Wv.state = "rest";
      Wv.timer = 0;
      say(t("z_wave_clear", { n: Wv.n }), 3);
      Z.stats.best = Math.max(Z.stats.best, Wv.n);
      Z.score = (Z.score || 0) + 150 + Wv.n * 40;
      // reward: ammo + battery + small heal/armor
      W_ORDER.forEach(function (k2) {
        if (Z.p.owned[k2] && !W[k2].melee)
          Z.p.reserve[k2] = (Z.p.reserve[k2] || 0) + Math.round(W[k2].mag * 1.1);
      });
      if (Z.flash) Z.flash.batt = 100;
      Z.p.frags = Math.min(FRAG.maxCarry, (Z.p.frags || 0) + 1);
      Z.p.hp = Math.min(MAX_HP, Z.p.hp + 15);
      Z.p.armor = Math.min(MAX_ARMOR, (Z.p.armor || 0) + 15);
      // restore blackout lamps
      Z.lamps.forEach(function (L) {
        if (L._savedMode) L.mode = L._savedMode;
      });
      hudDirty();
    }
  } else if (Wv.state === "rest") {
    if (Wv.timer > REST_LEN) startWave(Wv.n + 1);
    else if (Wv.timer > REST_LEN - 3 && !Wv.warned) {
      Wv.warned = true;
      say(t("z_wave_next"), 2.6);
    }
  }
}

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

function onKeyDown(e) {
  if (!Z.active) return;
  // Night Shift owns the keyboard while active; do not also trigger planner
  // shortcuts (notably P, which otherwise opens Photo Mode behind the pause UI).
  e.stopImmediatePropagation();
  if ((e.code === "KeyP" || e.code === "Escape") && !Z.p.dead) {
    // Escape first releases pointer lock; the lock-change handler opens pause.
    if (e.code === "Escape" && Z.locked) return;
    pauseGame(!Z.paused);
    e.preventDefault();
    return;
  }
  if (Z.paused) {
    e.preventDefault();
    return;
  }
  var m = KEYMAP[e.code];
  if (m) {
    Z.keys[m] = true;
    if (m === "crouchKey") Z.p.crouch = true;
    e.preventDefault();
    return;
  }
  if (e.code.indexOf("Digit") === 0) {
    // 1-9 pick slots 1-9; 0 picks the tenth (the flamer)
    var n = parseInt(e.code.slice(5), 10);
    n = n === 0 ? 9 : n - 1;
    if (W_ORDER[n] && Z.p.owned[W_ORDER[n]]) setWeapon(W_ORDER[n]);
    e.preventDefault();
    return;
  }
  if (e.code === "KeyG") throwFrag(Z.keys.crouchKey); // crouched = short lob
  else if (e.code === "KeyR") reload();
  else if (e.code === "KeyF") {
    if (Z.flash) {
      Z.flash.on = !Z.flash.on && Z.flash.batt > 0;
      sndClick();
      say(Z.flash.on ? t("z_flash_on") : t("z_flash_off"), 0.8);
    }
  } else if (e.code === "KeyQ") cycleWeapon(-1);
  else if (e.code === "KeyE") cycleWeapon(1);
  else if (e.code === "KeyV") wipeVisor();
  else if (e.code === "KeyX") {
    // shove — pushes everything in front of you back hard. Moved off Space when
    // Space became jump; it is a real mechanic (stamina cost + dodge burst), so
    // it got rebound rather than dropped.
    shove();
  } else if (e.code === "Space") jump();
  else return;
  e.preventDefault();
}
function onKeyUp(e) {
  if (!Z.active) return;
  e.stopImmediatePropagation();
  var m = KEYMAP[e.code];
  if (m) {
    Z.keys[m] = false;
    if (m === "crouchKey") Z.p.crouch = false;
  }
}

// Vertical launch. The player already has full vertical physics (gravity,
// P.vy, ground clamp, step-up) for walking off furniture, so a jump is just an
// upward impulse — but only from the ground, or holding Space would let you
// climb the air. GRAV is 900cm/s^2, so 330 gives a ~60cm apex: comfortably over
// the 42cm STEP ledge, low enough that it is not a platformer.
var JUMP_V = 330;
function jump() {
  var P = Z.p;
  if (P.dead || P.stam < 8) return;
  // grounded test: gravity zeroes vy on landing, so a live vy means airborne
  var g = groundAt(P.x, P.z, P.y, STEP);
  if (P.y > g + 2 || P.vy > 0) return;
  P.vy = JUMP_V * (P.crouch ? 0.72 : 1);
  P.stam -= 8;
  sndFootstep(true);
  makeNoise(P.x, P.z, 260); // landing thud draws attention
}

function shove() {
  var P = Z.p;
  if (P.shoveT > 0 || P.stam < 16) return;
  P.shoveT = 0.55;
  P.stam -= 16;
  // also a short dodge burst in look direction
  P.dodgeT = 0.28;
  var fx = Math.sin(P.yaw),
    fz = Math.cos(P.yaw),
    any = false;
  // break free of grabs
  Z.zeds.forEach(function (zd) {
    if (zd.dead) return;
    zd.grabT = 0;
    zd.grabbing = false;
    var dx = zd.x - P.x,
      dz = zd.z - P.z,
      d = Math.hypot(dx, dz) || 1;   // a grabbing zed can sit exactly on you
    if (d > 140) return;
    if ((dx / d) * fx + (dz / d) * fz < 0.28) return;
    zd.x += (dx / d) * 82;
    zd.z += (dz / d) * 82;
    zd.stagger = Math.max(zd.stagger, 0.75);
    zd.windup = 0;
    zd.cool = Math.max(zd.cool, 0.85);
    damageZed(zd, 8, tmpVec(zd.x, zd.y + 110, zd.z), tmpVec(dx / d, 0, dz / d), "body", true);
    any = true;
  });
  // lunge forward
  _movePoint2D.x = P.x + fx * 48;
  _movePoint2D.z = P.z + fz * 48;
  collideCircle(_movePoint2D, P_RAD, P.y, P_CLEAR, STEP);
  P.x = _movePoint2D.x;
  P.z = _movePoint2D.z;
  sndWhoosh(W.pan);
  if (any) shake(0.35);
  say(t("z_shove"), 0.5);
}

function onMouseMove(e) {
  if (!Z.active || Z.paused) return;
  var P = Z.p;
  if (P.dead) return;
  var dx = clamp(e.movementX || 0, -60, 60),
    dy = clamp(e.movementY || 0, -60, 60);
  var sens = (P.aim ? 0.0014 : 0.0024) * (Z.sens || 1);
  P.yaw -= dx * sens;
  P.pitch = clamp(P.pitch - dy * sens, -1.35, 1.35);
  P.lookDX += dx;
  P.lookDY += dy;
}
function onMouseDown(e) {
  if (!Z.active || Z.paused) return;
  if (Z.p.dead) return;
  if (e.button === 0) {
    Z.p.firing = true;
    fire();
  } else if (e.button === 2) {
    Z.p.aim = true;
  }
  // upgrading to a pointer lock is only legal from a real click gesture
  lockPointer();
  e.preventDefault();
}
function onMouseUp(e) {
  if (!Z.active) return;
  if (e.button === 0) Z.p.firing = false;
  if (e.button === 2) Z.p.aim = false;
}
function onWheel(e) {
  if (!Z.active || Z.paused) return;
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
  e.preventDefault();
}
function onContext(e) {
  if (Z.active) e.preventDefault();
}
function onLockChange() {
  var cv = document.getElementById("v3d");
  var wasLocked = Z.locked;
  Z.locked = document.pointerLockElement === cv;
  if (wasLocked && !Z.locked && Z.active && Z.p && !Z.p.dead && !Z.paused) pauseGame(true);
}
function lockPointer() {
  var cv = document.getElementById("v3d");
  if (cv && !document.pointerLockElement && cv.requestPointerLock) {
    try {
      var req = cv.requestPointerLock();
      if (req && req.catch) req.catch(function () {});
    } catch (e) {}
  }
}
function unlockPointer() {
  if (document.pointerLockElement && document.exitPointerLock) {
    try {
      document.exitPointerLock();
    } catch (e) {}
  }
}

function pauseGame(on, ready) {
  if (!Z.active || !Z.hud || (Z.p && Z.p.dead)) return;
  Z.paused = !!on;
  Z.keys = {};
  if (Z.p) {
    Z.p.firing = false;
    Z.p.aim = false;
  }
  Z.hud.pause.classList.toggle("on", Z.paused);
  Z.hud.root.classList.toggle("paused", Z.paused);
  if (Z.paused) {
    Z.hud.pauseEye.textContent = ready ? t("z_briefing") : t("z_paused");
    Z.hud.pauseH.textContent = ready ? t("z_ready_title") : t("z_paused_title");
    Z.hud.pauseP.textContent = ready ? t("z_ready_copy") : t("z_paused_copy");
    Z.hud.resume.textContent = ready ? t("z_start") : t("z_resume");
    Z.hud.exit.textContent = t("z_exit");
    unlockPointer();
  } else {
    if (Z.audio && Z.audio.ctx && Z.audio.ctx.state === "suspended") Z.audio.ctx.resume();
    lockPointer();
  }
}

function bindEvents() {
  if (Z.bound) return;
  Z.bound = true;
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("mousemove", onMouseMove);
  // remember the exact target: resolving #v3d again at unbind time can pick a
  // different element (or window) and leave the old listeners live
  var cv = (Z.evTarget = document.getElementById("v3d") || window);
  cv.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  cv.addEventListener("wheel", onWheel, { passive: false });
  cv.addEventListener("contextmenu", onContext);
  document.addEventListener("pointerlockchange", onLockChange);
}
function unbindEvents() {
  if (!Z.bound) return;
  Z.bound = false;
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("keyup", onKeyUp, true);
  window.removeEventListener("mousemove", onMouseMove);
  var cv = Z.evTarget || window;
  cv.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mouseup", onMouseUp);
  cv.removeEventListener("wheel", onWheel);
  cv.removeEventListener("contextmenu", onContext);
  Z.evTarget = null;
  document.removeEventListener("pointerlockchange", onLockChange);
}

/* ===========================================================================
   13. FRAME
   =========================================================================== */
function tick(deltaMs) {
  if (!Z.active) return false;
  var rawDt = safeDeltaSeconds(deltaMs, 0.016);
  if (Z.paused) {
    hudSync();
    applyCamera();
    return true;
  }
  // brief slow-mo on headshots / multi-kills
  if (Z.slowT > 0) {
    Z.slowT -= rawDt;
    if (Z.slowT <= 0) Z.timeScale = 1;
  } else Z.timeScale = 1;
  var dt = rawDt * (Z.timeScale || 1);
  Z.lastDt = dt;
  Z.t += dt;
  // Collision rebuild is expensive (scene traversal + AABB queries, 20-60ms).
  // Defer it to an idle callback so it never blocks a render frame.
  if (Z.colDirty && !Z.colPending) {
    Z.colPending = true;
    Z.colDirty = false;
    (typeof requestIdleCallback === 'function' ? requestIdleCallback : function(cb) { setTimeout(cb, 80); })(function () {
      Z.colPending = false;
      buildCol();
    });
  }
  forEachPhysicsStep(dt, function (stepDt) {
    stepPlayer(stepDt);
    for (var i = Z.zeds.length - 1; i >= 0; i--) stepZed(Z.zeds[i], stepDt, true);
    stepFrags(stepDt);
  });
  // Physics may split a slow frame into as many as three slices. Updating the
  // articulated rigs after integration avoids calculating poses that can never
  // be rendered, while preserving the exact final pose and graphics quality.
  for (var zi = Z.zeds.length - 1; zi >= 0; zi--) stepZedVisuals(Z.zeds[zi], dt);
  if (Z.p.shoveT > 0) Z.p.shoveT -= dt;
  if (Z.comboT > 0) {
    Z.comboT -= dt;
    if (Z.comboT <= 0) Z.combo = 0;
  }
  stepWave(dt);
  stepPickups(dt);
  stepEnv(dt);
  stepCritters(dt);
  stepAcidClouds(dt);
  stepWeather(dt);
  stepHorrorAmbience(dt);
  stepDestruct(dt);
  stepLamps(dt);
  stepMoonBeams(dt);
  stepFlashlight(dt);
  stepFX(dt);
  stepViewModel(dt);
  applyCamera();
  // muzzle flash / flame jet / blast lights all decay the same way
  // Inline checks — zero allocation per frame.
  if (Z.mflash && Z.mflash.intensity > 0) {
    Z.mflash.userData.t -= dt;
    if (Z.mflash.userData.t <= 0) Z.mflash.intensity = 0;
  }
  if (Z.fireLight && Z.fireLight.intensity > 0) {
    Z.fireLight.userData.t -= dt;
    if (Z.fireLight.userData.t <= 0) Z.fireLight.intensity = 0;
  }
  if (Z.blastLight && Z.blastLight.intensity > 0) {
    Z.blastLight.userData.t -= dt;
    if (Z.blastLight.userData.t <= 0) Z.blastLight.intensity = 0;
  }
  // screen fx timers
  if (Z.msgT > 0) {
    Z.msgT -= dt;
    if (Z.msgT <= 0 && Z.hud) Z.hud.msg.classList.remove("on");
  }
  if (Z.flashT > 0) {
    Z.flashT -= dt;
    if (Z.flashT <= 0 && Z.hud) Z.hud.flash.style.opacity = 0;
  }
  if (Z.hitT > 0) {
    Z.hitT -= dt;
    if (Z.hitT <= 0 && Z.hud) Z.hud.hit.classList.remove("on", "head");
  }
  if (Z.streakT > 0) {
    Z.streakT -= dt;
    if (Z.streakT <= 0) Z.killStreak = 0;
  }
  stepGrain(dt);
  hudSync();
  if (Z.hud) {
    var P = Z.p;
    // vignette tightens with damage + when they're close
    var dmgK = 1 - P.hp / MAX_HP,
      hurt = Math.max(0, P.hurtT / 0.55),
      adr = P.adrenalT > 0 ? 0.2 : 0,
      distK = P.distract || 0;
    Z.hud.vig.style.opacity = (0.48 + dmgK * 0.42 + hurt * 0.35 + adr + distK * 0.25).toFixed(3);
    Z.hud.vig.style.setProperty("--z-red", (dmgK * 0.85 + hurt + adr * 0.5).toFixed(3));
    Z.hud.vig.style.setProperty("--z-pink", distK.toFixed(3));
    // chromatic aberration pulse on hurt / adrenaline / distraction
    if (Z.hud.chrom) {
      var ca = hurt * 0.55 + (P.adrenalT > 0 ? 0.25 : 0) + (Z.timeScale < 0.9 ? 0.35 : 0) + distK * 0.45;
      Z.hud.chrom.style.opacity = ca.toFixed(3);
    }
    if (Z.hud.distractFx) {
      Z.hud.distractFx.style.opacity = (distK * 0.55).toFixed(3);
    }
    // crosshair spread follows bloom + distraction
    var aimTight = P.aim ? 0.45 : 1;
    Z.hud.cross.style.setProperty(
      "--gap",
      (4 + P.bloom * 240 * aimTight + P.speedK * 4.5 + distK * 18 + (W[P.weapon].melee ? 7 : 0)).toFixed(1) + "px"
    );
    Z.hud.root.classList.toggle("melee", !!W[P.weapon].melee);
    Z.hud.root.classList.toggle("aiming", !!P.aim);
    Z.hud.root.classList.toggle("distracted", distK > 0.35);
    Z.hud.root.classList.toggle("adrenaline", P.adrenalT > 0);
  }
  return true;
}

/* ===========================================================================
   14. MODE TOGGLE
   =========================================================================== */
function clearWorld() {
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
  Z.combo = 0;
  Z.comboT = 0;
  Z.killStreak = 0;
  Z.timeScale = 1;
  Z.slowT = 0;
  Z.p = newPlayer();
  Z.wave = { n: 0, state: "rest", timer: 0, pending: 0, pool: [] };
  if (Z.flash) Z.flash.batt = 100;
  if (Z.hud) {
    Z.hud.dead.classList.remove("on");
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
    window.__setViewMode(Z.prevMax === "view-2d" ? "plan" : "split");
    Z.prevMax = null;
  }
}

export function toggleZombies(on) {
  if (!has3D) return false;
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
    setQualityPreset(["performance", "balanced", "quality"][Z.settings.quality]);
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
    Z.t = 0;
    Z.keys = {};
    Z.doorsOpened = [];
    audio();
    // Destruction loads cannon-es and rebuilds the scene for rigid bodies. It
    // resolves on its own time; the game is playable (just not yet breakable)
    // until it does, so nothing here waits on it.
    enableDestruction();
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
      Z.baseFov = null;
    }
    cam.updateProjectionMatrix();
    audioClose();
    if (Z.hud) {
      Z.hud.root.classList.remove("on");
      Z.hud.dead.classList.remove("on");
    }
    document.body.classList.remove("zombies-on");
    maximize3D(false);
    orbitRefresh();
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
hooks.hudDirty = hudDirty;
hooks.say = say;
hooks.hitMarker = hitMarker;
hooks.flashScreen = flashScreen;
hooks.hurtPlayer = hurtPlayer;
hooks.onKill = function (zd, gib) {
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

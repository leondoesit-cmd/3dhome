import { awardRunPoints } from "./zombies_rules.js";
/* Night Shift world: collision, textures, VFX, horror grade, zombie AI/mesh. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  Fn, Discard, attribute, uniform, texture, uv, positionView, positionLocal,
  positionGeometry, vec2, vec3, vec4, float, mix, sin, smoothstep, screenDPR,
} from "three/tsl";
import { LUX, legacyIntensity } from "./gpu.js";
// The flashlight keeps a SOFT decay on purpose: it is the only thing the
// player sees by, and true inverse-square would blow out a wall at arm's
// length by the same factor it kills the far side of a room.
const FLASH_DECAY = 1.25;
// Authored as intensity 3.4 / throw 1950 / decay 1.25 before the units change.
// The reference fraction is small on purpose: 1950cm is the beam's MAXIMUM
// reach, but the surface you actually see by is a wall a metre or two away, so
// the beam is calibrated at ~170cm (0.09 of the throw). Matching at half the
// throw instead makes the near field blow out to flat white.
const FLASH_I = legacyIntensity(3.4, 1950, FLASH_DECAY, 0.09);
import { S, clamp, fin } from "./state.js";
import {
  getMainScene,
  getMainCamera,
  getRenderer,
  getDynGroup,
  getRigLights,
  applyEnv,
} from "./view3d.js";
import { wallGeom, hiddenSets, detectRooms, roomHidden, usedNodes } from "./geometry.js";
import { t } from "./i18n.js";
import {
  Z, hooks, P_CLEAR, STEP, GRAV, rr, pick, rnd,
} from "./zombies_state.js";
import * as Col2D from "./col2d.js";
import { runtimeCollisionRects, hasRuntimeRepresentation } from "./core/runtime.js";
import {
  tex as texLoad,
  normalTex as texNormal,
  registerFallback,
  texAniso,
} from "./zombies_tex.js";
import { alertCritters } from "./zombies_critters.js";
import {
  clearAcidClouds, igniteZed, isNearBloodDecal, isNearGlassDebris, makeNoise,
  removeZed, screamerCall, spawnAcidCloud, stepAcidClouds, stepBurn,
  stepWeather, triggerLightning,
} from "./zombies_world/hazards.js";
import {
  animZed, damageZed, killZed, stepZed, stepZedVisuals, trySeverFromHit,
} from "./zombies_world/zombie_damage_anim.js";
import {
  boneMat, boxGeo, buildZombie, bx, clearZedGeoCache, clothMat, cy, eyeMat,
  hairMat, lipMat, ownsGeo, sp, spawnZed, sphGeo, stumpMat,
} from "./zombies_world/zombie_build.js";
import {
  applyHorrorGrade, buildFlashlight, buildMoonBeams, clearMoonBeams,
  enterHorror, exitHorror, fleshMat, harvestPracticals, prettyMat,
  stepFlashlight, stepLamps, stepMoonBeams,
} from "./zombies_world/atmosphere.js";
import {
  bloodBurst, boneBurst, clearGibs, decal, detachToWorld, dustBurst,
  ensureGibs, explodeBody, fleshStrings, goreChunks, impactMark, initFX,
  setFXDensity, setNightShiftQuality, severPart, shake, sparkBurst,
  spawnFirePart, spawnFleshChunk, spawnPart, stepFX, stepGibs, tracer,
} from "./zombies_world/fx_gore.js";
import {
  ensureTex, noRaycast, prettyRoughTex, resetTexCache,
} from "./zombies_world/textures.js";
export { ensureTex, noRaycast, prettyRoughTex, resetTexCache };
export { bloodBurst, boneBurst, clearGibs, decal, detachToWorld, dustBurst, ensureGibs, explodeBody, fleshStrings, goreChunks, impactMark, initFX, setFXDensity, setNightShiftQuality, severPart, shake, sparkBurst, spawnFirePart, spawnFleshChunk, spawnPart, stepFX, stepGibs, tracer };
export { applyHorrorGrade, buildFlashlight, buildMoonBeams, clearMoonBeams, enterHorror, exitHorror, fleshMat, harvestPracticals, prettyMat, stepFlashlight, stepLamps, stepMoonBeams };
export { boneMat, buildZombie, bx, clearZedGeoCache, clothMat, cy, eyeMat, hairMat, lipMat, ownsGeo, sp, spawnZed, stumpMat };
export { animZed, damageZed, killZed, stepZed, stepZedVisuals, trySeverFromHit };
export { clearAcidClouds, igniteZed, isNearBloodDecal, isNearGlassDebris, makeNoise, removeZed, screamerCall, spawnAcidCloud, stepAcidClouds, stepBurn, stepWeather, triggerLightning };
// for js/zombies_world/hazards.js (live bindings: it sees every reassignment)
export { ACID_CLOUDS, WEATHER, nsQuality, set_ACID_CLOUDS };
// for js/zombies_world/zombie_damage_anim.js (live bindings: it sees every reassignment)
export { HIT_SURFACE_MAT, NO_RAYCAST, TEX, _zedMovePoint };
// for js/zombies_world/zombie_build.js (live bindings: it sees every reassignment)
export {
  CLOTHES, FLESH_SKINS, GEO, GEO_STEP, HAIR_COLS, PRETTY_SKINS, Zmat,
  prewarmRun, set_GEO, set_prewarmRun,
};
// for js/zombies_world/atmosphere.js (live bindings: it sees every reassignment)
export { FLASH_DECAY, FLASH_I };
// for js/zombies_world/fx_gore.js (live bindings: it sees every reassignment)
export { _gibMat, _gibPos, _gibQuat, _gibScl };
// for js/zombies_world/textures.js (live bindings: it sees every reassignment)
export {
  CLOTH_FILES, bloodSplatCanvas, fleshCanvas, impactCanvas,
  set_HIT_SURFACE_MAT, set_TEX, set_Zmat,
};

function nsQuality() {
  return Z.renderQuality == null ? 0 : Z.renderQuality;
}

/* ===========================================================================
   1. COLLISION MODEL — shared Col2D resolver (walls + doors + furniture)
   =========================================================================== */
export function floorOpenings(w) {
  return S.openings.filter(function (o) {
    return (
      o.wall === w.id &&
      (o.type === "door" || o.type === "passage") &&
      (o.sill || 0) <= 5 &&
      o.width > 40
    );
  });
}

/* Reusable temporaries for buildCol — avoid allocating per door/wall */
var _colBox3 = new THREE.Box3();
var _colVec3 = new THREE.Vector3();

export function buildCol() {
  var scene = getMainScene();
  if (!scene) return;
  scene.updateMatrixWorld(true);
  var col = { segs: [], doorSegs: [], rects: [], windows: [] };
  var hidden = hiddenSets();
  S.walls.forEach(function (w) {
    if (hidden.walls[w.id]) return;
    var gm = wallGeom(w);
    if (gm.L < 1) return;
    // slightly fatten walls so thin partitions still catch circles
    var half = Math.max(w.thickness / 2, 6);
    function seg(s0, s1, pivot) {
      if (s1 - s0 < 1) return;
      var e = {
        ax: gm.a.x + gm.ux * s0,
        az: gm.a.z + gm.uz * s0,
        bx: gm.a.x + gm.ux * s1,
        bz: gm.a.z + gm.uz * s1,
        half: half,
      };
      if (pivot) {
        e.pivot = pivot;
        col.doorSegs.push(e);
      } else col.segs.push(e);
    }
    S.openings.forEach(function (o) {
      if (o.wall !== w.id || o.type !== "window") return;
      col.windows.push({
        x: gm.a.x + gm.ux * o.s,
        z: gm.a.z + gm.uz * o.s,
        nx: -gm.uz,
        nz: gm.ux,
        sill: o.sill || 90,
        h: o.height || 120,
        w: o.width || 100,
      });
    });
    var ops = floorOpenings(w).sort(function (a, b) {
      return a.s - b.s;
    });
    var pos = 0;
    ops.forEach(function (o) {
      var l = clamp(o.s - o.width / 2 + 4, 0, gm.L),
        r = clamp(o.s + o.width / 2 - 4, 0, gm.L);
      if (r <= pos) return;
      seg(pos, l);
      if (o.type === "door") {
        var cx = gm.a.x + gm.ux * o.s,
          cz = gm.a.z + gm.uz * o.s,
          best = null,
          bd = 1e9;
        (scene.doors || []).forEach(function (d) {
          if (d.geometry) {
            if (!d.geometry.boundingBox) d.geometry.computeBoundingBox();
            if (d.geometry.boundingBox) _colBox3.copy(d.geometry.boundingBox).applyMatrix4(d.matrixWorld);
            else _colBox3.setFromObject(d);
          } else {
            _colBox3.setFromObject(d);
          }
          if (_colBox3.isEmpty()) return;
          _colBox3.getCenter(_colVec3);
          var dd = Math.hypot(_colVec3.x - cx, _colVec3.z - cz);
          if (dd < o.width && dd < bd) {
            bd = dd;
            best = d;
          }
        });
        seg(l, r, best || undefined);
        if (!best) col.doorSegs.pop();
      }
      pos = r;
    });
    seg(pos, gm.L);
  });
  // furniture: collect mesh AABBs then merge per item (no hairline gaps)
  var box3 = new THREE.Box3();
  var raw = runtimeCollisionRects(S);
  var dyn = getDynGroup();
  if (dyn)
    dyn.traverse(function (o) {
      if (!o.isMesh) return;
      var p = o,
        it = null;
      while (p && !it) {
        if (p.userData && p.userData.zed) return;
        if (p.userData && p.userData.gib) return;
        if (p.userData && p.userData.item) it = p.userData.item;
        p = p.parent;
      }
      if (!it) return;
      if (hasRuntimeRepresentation(S, it)) return;
      if (o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        if (o.geometry.boundingBox) box3.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        else box3.setFromObject(o);
      } else {
        box3.setFromObject(o);
      }
      if (box3.isEmpty()) return;
      if (box3.max.x - box3.min.x < 4 || box3.max.z - box3.min.z < 4) return;
      if (box3.max.y - box3.min.y < 3) return;
      raw.push({
        x0: box3.min.x,
        z0: box3.min.z,
        x1: box3.max.x,
        z1: box3.max.z,
        y0: box3.min.y,
        y1: box3.max.y,
        item: it,
      });
    });
  col.rects = Col2D.padRects(Col2D.mergeItemRects(raw), 2);
  Col2D.buildSpatialIndex(col, 180);
  Z.col = col;
  Z.colDirty = false;
}

export function groundAt(x, z, y, step) {
  return Col2D.groundAt(Z.col, x, z, y, step);
}

var _colDirectOpt = { passes: 4, state: { hit: 0, hard: 0 } };
var _colMoveOpt = { passes: 3, state: { hit: 0, hard: 0 } };
var _colProbeOpt = { passes: 2, state: { hit: 0, hard: 0 } };
var _colProbePoint = { x: 0, z: 0 };

export function collideCircle(p, r, y, clear, step) {
  return Col2D.collideCircle(Z.col, p, r, y, clear, step, _colDirectOpt);
}

export function moveCircle(p, dx, dz, r, y, clear, step) {
  return Col2D.moveCircle(Z.col, p, dx, dz, r, y, clear, step, _colMoveOpt);
}

export function blockedAt(x, z, r, y, clear, step) {
  _colProbePoint.x = x;
  _colProbePoint.z = z;
  return Col2D.collideCircle(Z.col, _colProbePoint, r, y, clear, step, _colProbeOpt) > 0.01;
}

export function freeSpot(x, z, r) {
  return Col2D.freeSpot(Z.col, x, z, r, 0, P_CLEAR, STEP, 280, 18, 16);
}

export function losClear(ax, az, bx, bz) {
  return Col2D.losClear(Z.col, ax, az, bx, bz);
}

export function interiorBounds() {
  var u = usedNodes(),
    minx = 1e9,
    minz = 1e9,
    maxx = -1e9,
    maxz = -1e9,
    any = false;
  for (var k in u) {
    var n = S.nodes[k];
    if (!n || !fin(n.x) || !fin(n.z)) continue;
    minx = Math.min(minx, n.x);
    maxx = Math.max(maxx, n.x);
    minz = Math.min(minz, n.z);
    maxz = Math.max(maxz, n.z);
    any = true;
  }
  return any ? { minx: minx, minz: minz, maxx: maxx, maxz: maxz } : null;
}

export function liveRooms() {
  return detectRooms().filter(function (r) {
    return !roomHidden(r.key) && r.area > 25000;
  });
}

/* ===========================================================================
   2. TEXTURES — the undead's photographic maps, plus what is still painted
   Loading, tiling, normals, roughness and the texel budget live in
   zombies_tex.js; this section owns what is specific to bodies. The painters
   below are of two kinds: the ones still generating maps nothing ships a
   photo for (roughness variation, the particle spray), and the ones that are
   registered as offline stand-ins for the photos in assets/textures.
   Everything here is built once and shared, so a horde of 26 still costs one
   set of maps.
   =========================================================================== */
var TEX = {};
function set_TEX(value) { return TEX = value; }
export function cnv(w, h) {
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
export function ctex(c, rep) {
  var t2 = new THREE.CanvasTexture(c);
  t2.colorSpace = THREE.SRGBColorSpace;
  t2.anisotropy = texAniso();
  if (rep) {
    t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    t2.repeat.set(rep, rep);
  }
  return t2;
}

function fleshCanvas(base, spot) {
  var S = 256,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  // subsurface mottling layers
  for (i = 0; i < 420; i++) {
    var r = rr(3, 48) * 0.5,
      px = rnd() * S,
      py = rnd() * S;
    var g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, spot + (0.12 + rnd() * 0.38) + ")");
    g.addColorStop(1, spot + "0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, 6.3);
    x.fill();
  }
  // micro pores / grain
  for (i = 0; i < 1400; i++) {
    x.fillStyle = "rgba(20,12,14," + rr(0.02, 0.1) + ")";
    x.fillRect(rnd() * S, rnd() * S, rr(0.5, 1.6), rr(0.5, 1.6));
  }
  // dark veins with branching
  x.lineWidth = 0.9;
  for (i = 0; i < 45; i++) {
    x.strokeStyle = "rgba(38,18,26," + rr(0.12, 0.42) + ")";
    x.beginPath();
    var vx = rnd() * S,
      vy = rnd() * S,
      a = rnd() * 6.3;
    x.moveTo(vx, vy);
    for (var k = 0; k < 8; k++) {
      a += rr(-0.85, 0.85);
      vx += Math.cos(a) * rr(4, 9);
      vy += Math.sin(a) * rr(4, 9);
      x.lineTo(vx, vy);
      if (k === 3 || k === 5) {
        x.moveTo(vx, vy);
        var ba = a + rr(-1.2, 1.2);
        x.lineTo(vx + Math.cos(ba) * 8, vy + Math.sin(ba) * 8);
        x.moveTo(vx, vy);
      }
    }
    x.stroke();
  }
  // open wounds + scabs
  for (i = 0; i < 16; i++) {
    var wx = rnd() * S,
      wy = rnd() * S,
      wr = rr(4, 18);
    var wg = x.createRadialGradient(wx, wy, 0, wx, wy, wr);
    wg.addColorStop(0, "rgba(110,8,12,0.92)");
    wg.addColorStop(0.35, "rgba(70,6,10,0.7)");
    wg.addColorStop(0.7, "rgba(40,4,8,0.35)");
    wg.addColorStop(1, "rgba(30,4,8,0)");
    x.fillStyle = wg;
    x.beginPath();
    x.arc(wx, wy, wr, 0, 6.3);
    x.fill();
    // crust rim
    x.strokeStyle = "rgba(30,8,10," + rr(0.25, 0.55) + ")";
    x.lineWidth = rr(0.8, 1.8);
    x.beginPath();
    x.ellipse(wx, wy, wr * 0.7, wr * 0.45, rnd() * 3, 0, 6.3);
    x.stroke();
  }
  // pale bone peek-through patches
  for (i = 0; i < 6; i++) {
    x.fillStyle = "rgba(180,170,150," + rr(0.08, 0.22) + ")";
    x.beginPath();
    x.ellipse(rnd() * S, rnd() * S, rr(3, 8), rr(1.5, 4), rnd() * 3, 0, 6.3);
    x.fill();
  }
  return c;
}

// Roughness variation baked from the same flesh layout — wet wounds, dry scabs.
export function fleshRoughTex() {
  var S = 128,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  // base flesh: mid-high roughness
  x.fillStyle = "#a89c90";
  x.fillRect(0, 0, S, S);
  // dry scab crusts (lighter = rougher, catches the flashlight)
  for (i = 0; i < 20; i++) {
    var rx = rnd() * S,
      ry = rnd() * S,
      rr0 = rr(4, 18);
    var rg = x.createRadialGradient(rx, ry, 0, rx, ry, rr0);
    rg.addColorStop(0, "rgba(220,205,190,0.7)");
    rg.addColorStop(0.6, "rgba(180,165,150,0.3)");
    rg.addColorStop(1, "rgba(160,150,140,0)");
    x.fillStyle = rg;
    x.beginPath();
    x.arc(rx, ry, rr0, 0, 6.3);
    x.fill();
  }
  // wet open wounds (darker = smoother = sharp specular glint)
  for (i = 0; i < 18; i++) {
    var wx = rnd() * S,
      wy = rnd() * S,
      wr = rr(3, 14);
    var wg = x.createRadialGradient(wx, wy, 0, wx, wy, wr);
    wg.addColorStop(0, "rgba(20,10,12,0.92)");
    wg.addColorStop(0.5, "rgba(50,25,30,0.6)");
    wg.addColorStop(1, "rgba(100,60,70,0)");
    x.fillStyle = wg;
    x.beginPath();
    x.arc(wx, wy, wr, 0, 6.3);
    x.fill();
  }
  var t2 = ctex(c, 1);
  t2.colorSpace = THREE.NoColorSpace;
  return t2;
}

/* ---- wound / impact decals ------------------------------------------------
   Old hit marks were hardcoded 0.2-second quad flashes that vanished the
   instant you turned away. Real gunshot wounds stay on the flesh and real
   bullet holes stay in the drywall.

   Two decoupled pools:
     * Zombie articulated wounds — parented directly to the struck limb's bone,
       so a chest wound rides the breathing bob and an arm wound swings with the
       strike.
     * Wall / floor / door impacts — placed in world space against the hit normal,
       offset by a fraction of a millimetre to prevent Z-fighting.

   Both pools share procedural alpha textures baked here so there are zero
   network requests or disk assets needed. */

// A bullet hole in plaster / brick: powdery crushed rim, dark shattered centre,
// fine radial fractures stretching outward.
function impactCanvas() {
  var S = 128,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i,
    cx = S / 2,
    cy = S / 2;
  x.clearRect(0, 0, S, S);

  // 1. dust halo — powder thrown off the strike. Built from a dozen offset
  //    smudges rather than one radial gradient: a clean bright disc is the
  //    single biggest tell that a mark is a stamped image, because nothing
  //    that actually happens to a wall is perfectly circular.
  function smudge(px, py, r, a) {
    var sg = x.createRadialGradient(px, py, 0, px, py, r);
    sg.addColorStop(0, "rgba(198,190,178," + a + ")");
    sg.addColorStop(0.55, "rgba(186,178,166," + a * 0.45 + ")");
    sg.addColorStop(1, "rgba(176,168,157,0)");
    x.fillStyle = sg;
    x.beginPath();
    x.arc(px, py, r, 0, 6.3);
    x.fill();
  }
  for (i = 0; i < 14; i++) {
    smudge(cx + rr(-8, 8), cy + rr(-8, 8), rr(24, 46), rr(0.18, 0.42));
  }

  // 2. crushed masonry crater — jagged perimeter with sharp angular bite marks
  x.fillStyle = "rgba(42,34,28,0.92)";
  x.beginPath();
  var numCrater = 18;
  for (i = 0; i < numCrater; i++) {
    var ang = (i / numCrater) * 6.283,
      rad = rr(11, 20);
    var px0 = cx + Math.cos(ang) * rad,
      py0 = cy + Math.sin(ang) * rad;
    if (i === 0) x.moveTo(px0, py0);
    else x.lineTo(px0, py0);
  }
  x.closePath();
  x.fill();

  // 3. spall rim: bright shattered aggregate around the crater lip
  x.strokeStyle = "rgba(224,218,206,0.85)";
  x.lineWidth = 1.2;
  x.stroke();

  // 4. deep core void — near-black cavity
  x.fillStyle = "rgba(10,8,6,0.98)";
  x.beginPath();
  for (i = 0; i < 12; i++) {
    var a4 = (i / 12) * 6.283,
      r4 = rr(4, 9);
    var cx0 = cx + Math.cos(a4) * r4,
      cy0 = cy + Math.sin(a4) * r4;
    if (i === 0) x.moveTo(cx0, cy0);
    else x.lineTo(cx0, cy0);
  }
  x.closePath();
  x.fill();

  // 5. micro fractures branching off the edge
  x.strokeStyle = "rgba(24,18,14,0.75)";
  x.lineWidth = 0.9;
  for (i = 0; i < 8; i++) {
    var a5 = rnd() * 6.283;
    var sx = cx + Math.cos(a5) * rr(10, 16),
      sy = cy + Math.sin(a5) * rr(10, 16);
    x.beginPath();
    x.moveTo(sx, sy);
    for (var step = 0; step < 4; step++) {
      a5 += rr(-0.45, 0.45);
      sx += Math.cos(a5) * rr(6, 12);
      sy += Math.sin(a5) * rr(6, 12);
      x.lineTo(sx, sy);
    }
    x.stroke();
  }

  // 6. burnt gunpowder ring
  var bg = x.createRadialGradient(cx, cy, 5, cx, cy, 26);
  bg.addColorStop(0, "rgba(20,16,12,0.65)");
  bg.addColorStop(0.4, "rgba(35,26,18,0.35)");
  bg.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = bg;
  x.beginPath();
  x.arc(cx, cy, 26, 0, 6.3);
  x.fill();

  return c;
}

function bloodSplatCanvas() {
  var c = cnv(256, 256),
    x = c.getContext("2d"),
    cx = 128,
    cy = 128,
    i;
  x.clearRect(0, 0, 256, 256);
  // center clot
  var g = x.createRadialGradient(cx, cy, 0, cx, cy, 38);
  g.addColorStop(0, "rgba(70,2,6,0.95)");
  g.addColorStop(0.4, "rgba(90,4,8,0.85)");
  g.addColorStop(0.75, "rgba(110,6,12,0.45)");
  g.addColorStop(1, "rgba(80,2,4,0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, 38, 0, 6.3);
  x.fill();
  // irregular lobes
  for (i = 0; i < 14; i++) {
    var a = rnd() * 6.3,
      d = rr(6, 32),
      r = rr(8, 22);
    var lg = x.createRadialGradient(
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      0,
      cx + Math.cos(a) * d,
      cy + Math.sin(a) * d,
      r
    );
    lg.addColorStop(0, "rgba(75,3,7,0.92)");
    lg.addColorStop(0.6, "rgba(95,5,10,0.5)");
    lg.addColorStop(1, "rgba(60,2,4,0)");
    x.fillStyle = lg;
    x.beginPath();
    x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, 6.3);
    x.fill();
  }
  // satellite droplets
  for (i = 0; i < 30; i++) {
    var sa = rnd() * 6.3,
      sd = rr(28, 85),
      sr = rr(1.2, 4.2);
    x.fillStyle = "rgba(" + ((70 + rnd() * 40) | 0) + ",4,8," + rr(0.45, 0.95) + ")";
    x.beginPath();
    x.arc(cx + Math.cos(sa) * sd, cy + Math.sin(sa) * sd, sr, 0, 6.3);
    x.fill();
  }
  return c;
}

/* The undead skin pool. There is exactly one flesh photo and one "pretty"
   photo — the arrays used to hold the same texture object four and six times
   over, so every walker in the horde wore an identical face at identical UVs.
   Uploading four copies of a 1024² map to fix that would cost ~22MB of VRAM
   for what is really a colour difference, so the pool varies by tint and
   roughness over the one shared map instead: free, and it reads across a
   room. Index 0 stays untinted so the photo is still seen as authored. */
var FLESH_SKINS = [
  { tint: 0xffffff, rough: 0.78 },
  { tint: 0xbec9ac, rough: 0.86 }, // gone green
  { tint: 0xd3b6c2, rough: 0.7 },  // bruised, wet
  { tint: 0xd8cf9e, rough: 0.9 },  // jaundiced and dried out
];
var PRETTY_SKINS = [
  { tint: 0xffffff, rough: 0.42 },
  { tint: 0xf2dccc, rough: 0.38 },
  { tint: 0xd7ab8a, rough: 0.44 },
  { tint: 0xb07c58, rough: 0.4 },
  { tint: 0x8a5c3e, rough: 0.46 },
  { tint: 0xe6bfb4, rough: 0.36 },
];

// Weave depth per textile (n): knit and camo are chunky, leather and denim
// are tight, floral is a print on flat cotton and should barely bump at all.
// base/accent are only read when the photo is missing and the procedural
// stand-in has to paint something recognisable in its place.
var CLOTH_FILES = [
  { k: "plaid", n: 1.6, base: 0x6b3a34, accent: 0x241a16 },
  { k: "floral", n: 0.8, base: 0xa8968c, accent: 0x8c4a5a },
  { k: "denim", n: 2.0, base: 0x3a4a66, accent: 0x22304a },
  { k: "leather", n: 1.4, base: 0x3a2a22, accent: 0x1c130f },
  { k: "camo", n: 2.4, base: 0x4a5238, accent: 0x2c3222 },
  { k: "knit", n: 3.2, base: 0x6a5a48, accent: 0x4a3c30 },
];

/* ===========================================================================
   3. FX POOLS — particles, tracers, decals, screen shake
   =========================================================================== */
/* Every shot raycasts the whole game group; particles, tracers, decals, dust
   and gibs were being intersected only to be filtered out afterwards. An
   empty raycast() makes three.js skip them outright — a shotgun blast is 10
   of these traversals. */
var NO_RAYCAST = function () {};

/* ===========================================================================
   SEVERED BODY PARTS — real meshes tear off and tumble with physics
   mode "cut"  = melee slice (arc spin, medium force)
   mode "blow" = gunshot / explode (high velocity tumble)
   =========================================================================== */
var _gibPos = new THREE.Vector3(),
  _gibQuat = new THREE.Quaternion(),
  _gibScl = new THREE.Vector3(),
  _gibMat = new THREE.Matrix4(),
  _gibDir = new THREE.Vector3();

/* ===========================================================================
   5. ZOMBIES — procedural bodies, shambling animation, dismemberment, AI
   =========================================================================== */
var Zmat = { flesh: [], pretty: [], cloth: {}, clothLayer: {}, stump: null, eye: null, bone: null, eyeGlow: {}, lip: null, hair: {} };
function set_Zmat(value) { return Zmat = value; }

/* Body-part geometry cache -------------------------------------------------
   Rigs are built from ~110 primitives each with continuously randomised
   dimensions, so every spawn used to allocate (and every death dispose) a
   fresh pile of BufferGeometry. Quantising the dimensions makes them collide
   into a shared set instead. Shared geometry is tagged so the disposal paths
   (removeZed, gib expiry, clearWorld) leave it alone; clearZedGeoCache()
   frees the lot once the whole group is gone.

   The bucket is RELATIVE, not absolute. An absolute 0.25cm grid sounds fine
   against a 170cm body, but the dimensions it has to catch run from a 1.8cm
   finger to a 46cm thigh and are products of four or five independent randoms
   — 0.25cm is 0.5% of a thigh, so nothing ever collided: the 60th zombie of a
   run was still minting ~20 fresh BufferGeometries, and the cache had grown to
   1400 of them. Every one of those is a first-render GPU buffer upload, which
   is why spawns hitched worst at the start of a wave and never quite stopped.
   A ~4% step is below what the eye resolves at either end of that range and
   bounds the cache at a couple of hundred entries, reached within a few
   spawns. */
var GEO = {};
function set_GEO(value) { return GEO = value; }
var GEO_STEP = Math.log(1.04);   // ~4% relative buckets
/* Build (and throw away) one rig of each type so the geometry, material and
   texture caches are hot before the first wave. The first rig of a run costs
   ~30ms and the next few ~8ms each, all of it cache misses.  This used to run
   all types synchronously just after opening the mode: the briefing could not
   paint until that work completed, which made every launch feel like a stall.
   One type per idle turn lets the paused briefing appear immediately while
   retaining the warm caches for players who take a moment to read it. */
var prewarmRun = 0;
function set_prewarmRun(value) { return prewarmRun = value; }
export function prewarmRigs() {
  var types = Object.keys(Z_TYPES),
    run = ++prewarmRun,
    at = 0;
  function warm(type) {
    var rig = buildZombie(type),
      mats = new Set();
    rig.root.traverse(function (o) {
      if (o.isMesh && o.material) mats.add(o.material);
    });
    // the palette entries in Zmat are shared with every future rig and must
    // survive; only the per-rig clones (skin tints, accents) are ours to free
    var keep = new Set();
    Zmat.flesh.concat(Zmat.pretty).forEach(function (m) { if (m) keep.add(m); });
    ["cloth", "clothLayer", "eyeGlow", "hair"].forEach(function (g) {
      for (var k in Zmat[g]) keep.add(Zmat[g][k]);
    });
    ["stump", "eye", "bone", "lip"].forEach(function (k) {
      if (Zmat[k]) keep.add(Zmat[k]);
    });
    mats.forEach(function (m) {
      if (!keep.has(m)) m.dispose();
    });
    // Batching creates a few per-rig merged geometries. The warm-up rig never
    // enters the scene, so it has no normal removeZed/clearWorld disposal path.
    rig.root.traverse(function (o) {
      if (o.isMesh && ownsGeo(o.geometry)) o.geometry.dispose();
    });
  }
  function next() {
    // A restart or exit invalidates both the old cache and this work queue.
    if (run !== prewarmRun || !Z.active || at >= types.length) return;
    warm(types[at++]);
    if (at < types.length) {
      if (typeof requestIdleCallback === "function") requestIdleCallback(next, { timeout: 120 });
      else setTimeout(next, 0);
    }
  }
  // Yield once so the pause overlay and its first rendered game frame reach
  // the screen before any geometry allocation begins.
  if (typeof requestIdleCallback === "function") requestIdleCallback(next, { timeout: 120 });
  else setTimeout(next, 0);
}

export var Z_TYPES = {
  walker: { hp: 105, spd: 72, dmg: 12, scale: 1.0, rate: 1.1, w: 58, eye: 0xff3a10 },
  runner: { hp: 68, spd: 228, dmg: 10, scale: 0.92, rate: 0.62, w: 20, eye: 0xffaa22 },
  brute: { hp: 380, spd: 70, dmg: 30, scale: 1.34, rate: 1.65, w: 9, eye: 0xff1020 },
  crawler: { hp: 58, spd: 105, dmg: 9, scale: 0.9, rate: 0.85, w: 9, eye: 0xcc2208 },
  screamer: { hp: 85, spd: 118, dmg: 7, scale: 0.96, rate: 1.15, w: 7, eye: 0xaa44ff },
  bloater: { hp: 180, spd: 64, dmg: 16, scale: 1.25, rate: 1.4, w: 10, eye: 0x55ff22, toxic: true },
  titan: { hp: 750, spd: 84, dmg: 42, scale: 1.6, rate: 1.75, w: 0, eye: 0xff0055, boss: true },
};
var CLOTHES = [0x2c3540, 0x3d3126, 0x4a2530, 0x27343a, 0x554b3a, 0x1f2b23, 0x413040, 0x2a2a32];
var HAIR_COLS = [
  0x1a0a08, 0x2c1810, 0x3d2214, 0x5c3a1e, 0x8b5a2b, 0xc4a070,
  0xd8b090, 0x4a1020, 0x6b2038, 0x1a1a22, 0x2a3040, 0xe8d0b0,
];

var HIT_SURFACE_MAT = { wound: null, tear: null };
function set_HIT_SURFACE_MAT(value) { return HIT_SURFACE_MAT = value; }

/* ---- AI ----------------------------------------------------------------- */
var _zedMovePoint = { x: 0, z: 0 };

/* ===========================================================================
   TOXIC ACID CLOUD (Bloater Death Effect)
   =========================================================================== */
var ACID_CLOUDS = [];
function set_ACID_CLOUDS(value) { return ACID_CLOUDS = value; }

/* ===========================================================================
   DYNAMIC WEATHER — Lightning Flashes & Rolling Thunder
   =========================================================================== */
var WEATHER = {
  timer: rr(12, 22),
  flashT: 0,
  thunderDelay: 0,
  thunderDist: 0,
};


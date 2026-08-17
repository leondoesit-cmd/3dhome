/* Night Shift world: collision, textures, VFX, horror grade, zombie AI/mesh. */
import * as THREE from "three";
import {
  Fn, Discard, attribute, uniform, texture, uv, positionView, positionLocal,
  vec2, vec3, vec4, float, mix, sin, smoothstep, screenDPR,
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
  var S = 512,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  // subsurface mottling layers
  for (i = 0; i < 420; i++) {
    var r = rr(3, 48),
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
  for (i = 0; i < 2800; i++) {
    x.fillStyle = "rgba(20,12,14," + rr(0.02, 0.1) + ")";
    x.fillRect(rnd() * S, rnd() * S, rr(0.6, 2.2), rr(0.6, 2.2));
  }
  // dark veins with branching
  x.lineWidth = 1.1;
  for (i = 0; i < 70; i++) {
    x.strokeStyle = "rgba(38,18,26," + rr(0.12, 0.42) + ")";
    x.beginPath();
    var vx = rnd() * S,
      vy = rnd() * S,
      a = rnd() * 6.3;
    x.moveTo(vx, vy);
    for (var k = 0; k < 10; k++) {
      a += rr(-0.85, 0.85);
      vx += Math.cos(a) * rr(6, 14);
      vy += Math.sin(a) * rr(6, 14);
      x.lineTo(vx, vy);
      if (k === 4 || k === 7) {
        x.moveTo(vx, vy);
        var ba = a + rr(-1.2, 1.2);
        x.lineTo(vx + Math.cos(ba) * 12, vy + Math.sin(ba) * 12);
        x.moveTo(vx, vy);
      }
    }
    x.stroke();
  }
  // open wounds + scabs
  for (i = 0; i < 22; i++) {
    var wx = rnd() * S,
      wy = rnd() * S,
      wr = rr(6, 28);
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
    x.lineWidth = rr(1, 2.4);
    x.beginPath();
    x.ellipse(wx, wy, wr * 0.7, wr * 0.45, rnd() * 3, 0, 6.3);
    x.stroke();
  }
  // pale bone peek-through patches
  for (i = 0; i < 8; i++) {
    x.fillStyle = "rgba(180,170,150," + rr(0.08, 0.22) + ")";
    x.beginPath();
    x.ellipse(rnd() * S, rnd() * S, rr(4, 12), rr(2, 6), rnd() * 3, 0, 6.3);
    x.fill();
  }
  return c;
}

// Roughness variation baked from the same flesh layout — wet wounds, dry scabs.
export function fleshRoughTex() {
  var S = 256,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  x.fillStyle = "#c8c8c8";
  x.fillRect(0, 0, S, S);
  for (i = 0; i < 180; i++) {
    x.fillStyle = "rgba(255,255,255," + rr(0.05, 0.25) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(4, 28), 0, 6.3);
    x.fill();
  }
  for (i = 0; i < 40; i++) {
    // wet wound centers = low roughness (darker in map)
    x.fillStyle = "rgba(20,20,20," + rr(0.35, 0.7) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(3, 14), 0, 6.3);
    x.fill();
  }
  var t2 = ctex(c, 1);
  t2.colorSpace = THREE.NoColorSpace;
  return t2;
}

function bloodCanvas() {
  var c = cnv(256, 256),
    x = c.getContext("2d"),
    i;
  x.clearRect(0, 0, 256, 256);
  function blob(px, py, r, a) {
    var g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, "rgba(110,4,8," + a + ")");
    g.addColorStop(0.45, "rgba(72,2,6," + a * 0.85 + ")");
    g.addColorStop(0.78, "rgba(48,1,4," + a * 0.35 + ")");
    g.addColorStop(1, "rgba(40,0,3,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, 6.3);
    x.fill();
  }
  blob(128, 128, 78, 0.95);
  for (i = 0; i < 48; i++) {
    var a = rnd() * 6.3,
      d = rr(28, 110);
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rr(4, 22), rr(0.3, 0.92));
  }
  // drip streaks
  for (i = 0; i < 14; i++) {
    var sx = rr(40, 216),
      sy = rr(80, 200);
    var lg = x.createLinearGradient(sx, sy, sx + rr(-8, 8), sy + rr(30, 80));
    lg.addColorStop(0, "rgba(90,3,6,0.7)");
    lg.addColorStop(1, "rgba(50,0,4,0)");
    x.fillStyle = lg;
    x.fillRect(sx - 2, sy, rr(2, 5), rr(28, 70));
  }
  return c;
}

/* A round hits plaster and leaves three things, in this order of readability:
   a pale ring of powdered surface, hairline cracks radiating out of it, and a
   small black crater in the middle. Reusing a blood splatter tinted grey gave
   none of that — it read as a picture pasted on the wall, because that is
   exactly what it was. Everything here fades to zero alpha well inside the
   quad, so the mark has no visible border to give the trick away. */
function impactCanvas() {
  var S = 256,
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
    x.arc(px, py, r, 0, 6.283);
    x.fill();
  }
  smudge(cx, cy, 58, 0.1);
  for (i = 0; i < 13; i++) {
    var sa = rnd() * 6.283,
      sd = rr(14, 62);
    smudge(cx + Math.cos(sa) * sd, cy + Math.sin(sa) * sd, rr(10, 30), rr(0.03, 0.1));
  }
  // a scatter of hard specks — grit blown clear of the crater
  for (i = 0; i < 26; i++) {
    var ga = rnd() * 6.283,
      gd = rr(24, 78);
    x.fillStyle = "rgba(" + (rnd() < 0.5 ? "38,33,28," : "196,188,175,") + rr(0.15, 0.5) + ")";
    x.beginPath();
    x.arc(cx + Math.cos(ga) * gd, cy + Math.sin(ga) * gd, rr(0.7, 2.3), 0, 6.283);
    x.fill();
  }

  // 2. hairline cracks — struck out of the crater lip, tapering as they go
  var cracks = 5 + ((rnd() * 5) | 0);
  for (i = 0; i < cracks; i++) {
    var a = rnd() * 6.283,
      len = rr(38, 96),
      px = cx + Math.cos(a) * 22,
      py = cy + Math.sin(a) * 22;
    x.beginPath();
    x.moveTo(px, py);
    // a couple of kinks so it does not read as a drawn ray
    var steps = 3,
      ca = a;
    for (var s = 1; s <= steps; s++) {
      ca += rr(-0.42, 0.42);
      px += Math.cos(ca) * (len / steps);
      py += Math.sin(ca) * (len / steps);
      x.lineTo(px, py);
    }
    var cg = x.createLinearGradient(cx, cy, px, py);
    cg.addColorStop(0, "rgba(28,24,20,0.75)");
    cg.addColorStop(1, "rgba(40,36,30,0)");
    x.strokeStyle = cg;
    x.lineWidth = rr(1.1, 2.6);
    x.stroke();
  }

  // 3. spall ring — the chipped lip, brighter than the wall because it is
  //    freshly broken material. Drawn as an irregular annulus, not a circle.
  x.beginPath();
  for (i = 0; i <= 40; i++) {
    var ra = (i / 40) * 6.283,
      rr1 = 30 + Math.sin(ra * 3.1 + 0.7) * 5 + rr(-3, 3);
    var qx = cx + Math.cos(ra) * rr1,
      qy = cy + Math.sin(ra) * rr1;
    i === 0 ? x.moveTo(qx, qy) : x.lineTo(qx, qy);
  }
  x.closePath();
  var ring = x.createRadialGradient(cx, cy, 12, cx, cy, 34);
  ring.addColorStop(0, "rgba(150,143,132,0.08)");
  ring.addColorStop(0.6, "rgba(202,194,181,0.40)");
  ring.addColorStop(1, "rgba(184,176,164,0.06)");
  x.fillStyle = ring;
  x.fill();

  // 4. the crater itself — near-black, hard-edged, small
  var hole = x.createRadialGradient(cx - 2, cy - 2, 0, cx, cy, 20);
  hole.addColorStop(0, "rgba(6,5,4,0.97)");
  hole.addColorStop(0.62, "rgba(14,12,10,0.93)");
  hole.addColorStop(0.88, "rgba(30,26,22,0.55)");
  hole.addColorStop(1, "rgba(40,35,30,0)");
  x.fillStyle = hole;
  x.beginPath();
  for (i = 0; i <= 24; i++) {
    var ha = (i / 24) * 6.283,
      hr = 17 + Math.sin(ha * 2.3 + 1.9) * 2.5 + rr(-1.6, 1.6);
    var hx = cx + Math.cos(ha) * hr,
      hy = cy + Math.sin(ha) * hr;
    i === 0 ? x.moveTo(hx, hy) : x.lineTo(hx, hy);
  }
  x.closePath();
  x.fill();

  return c;
}

export function sprayTex() {
  var c = cnv(64, 64),
    x = c.getContext("2d");
  var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  var t2 = new THREE.CanvasTexture(c);
  return t2;
}

function clothCanvas() {
  var S = 256,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  x.fillStyle = "#ffffff";
  x.fillRect(0, 0, S, S);
  // woven fabric grain
  for (i = 0; i < S; i += 2) {
    x.fillStyle = "rgba(0,0,0," + (0.03 + (i % 4 === 0 ? 0.04 : 0)) + ")";
    x.fillRect(0, i, S, 1);
    x.fillStyle = "rgba(0,0,0," + (0.02 + (i % 6 === 0 ? 0.03 : 0)) + ")";
    x.fillRect(i, 0, 1, S);
  }
  for (i = 0; i < 1600; i++) {
    x.fillStyle = "rgba(0,0,0," + rr(0.02, 0.14) + ")";
    x.fillRect(rnd() * S, rnd() * S, rr(1, 6), rr(1, 4));
  }
  // grime + dried blood at the hem
  for (i = 0; i < 55; i++) {
    x.fillStyle = "rgba(48,10,10," + rr(0.08, 0.4) + ")";
    x.beginPath();
    x.arc(rnd() * S, rr(S * 0.45, S), rr(4, 22), 0, 6.3);
    x.fill();
  }
  // mud / dirt
  for (i = 0; i < 40; i++) {
    x.fillStyle = "rgba(40,32,22," + rr(0.06, 0.28) + ")";
    x.beginPath();
    x.ellipse(rnd() * S, rnd() * S, rr(6, 24), rr(3, 12), rnd() * 3, 0, 6.3);
    x.fill();
  }
  // tears
  x.strokeStyle = "rgba(0,0,0,0.6)";
  x.lineWidth = 2.4;
  for (i = 0; i < 10; i++) {
    x.beginPath();
    var sx = rnd() * S,
      sy = rnd() * S;
    x.moveTo(sx, sy);
    x.lineTo(sx + rr(-28, 28), sy + rr(8, 40));
    x.stroke();
  }
  return c;
}

// Textile stand-in: a palette/pattern seed per garment file, so a wardrobe
// painted without the photos is still six distinguishable fabrics rather than
// one flat weave repeated across the horde.
function uniqueClothCanvas(base, accent, style) {
  var S = 256,
    c = cnv(S, S),
    x = c.getContext("2d");
  x.fillStyle = "#" + (base >>> 0).toString(16).padStart(6, "0");
  x.fillRect(0, 0, S, S);
  var ac = "#" + (accent >>> 0).toString(16).padStart(6, "0");
  x.globalAlpha = 0.34;
  if (style % 3 === 0) {
    for (var i = -S; i < S * 2; i += 28) {
      x.fillStyle = ac;
      x.fillRect(i, 0, 10, S);
      x.fillRect(0, i, S, 8);
    }
  } else if (style % 3 === 1) {
    for (var j = 0; j < S; j += 34) {
      x.fillStyle = ac;
      x.fillRect(0, j, S, 7);
      x.fillRect(j, 0, 7, S);
    }
  } else {
    x.fillStyle = ac;
    for (var k = 0; k < 34; k++) {
      x.beginPath();
      x.arc(rnd() * S, rnd() * S, rr(4, 18), 0, 6.3);
      x.fill();
    }
  }
  x.globalAlpha = 1;
  // woven grain and grime, repeated on every layer but with a unique phase
  for (var q0 = 0; q0 < S; q0 += 3) {
    x.fillStyle = "rgba(255,255,255," + rr(0.018, 0.07) + ")";
    x.fillRect(0, q0, S, 1);
    x.fillStyle = "rgba(0,0,0," + rr(0.018, 0.08) + ")";
    x.fillRect(q0, 0, 1, S);
  }
  for (var d = 0; d < 180; d++) {
    x.fillStyle = "rgba(26,12,10," + rr(0.025, 0.16) + ")";
    x.fillRect(rnd() * S, rnd() * S, rr(1, 7), rr(1, 5));
  }
  return c;
}

// A small transparent jagged slash used as the visible opening in a damaged
// garment.  It is layered over a persistent blood/skin decal at the same hit.
function clothTearCanvas() {
  var S = 128,
    c = cnv(S, S),
    x = c.getContext("2d");
  x.clearRect(0, 0, S, S);
  x.strokeStyle = "rgba(8,4,5,0.96)";
  x.lineWidth = 12;
  x.lineCap = "round";
  x.beginPath();
  x.moveTo(18, 96);
  x.lineTo(45, 72);
  x.lineTo(35, 54);
  x.lineTo(78, 24);
  x.lineTo(104, 14);
  x.stroke();
  x.strokeStyle = "rgba(150,18,22,0.86)";
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(20, 94);
  x.lineTo(46, 70);
  x.lineTo(37, 52);
  x.lineTo(80, 23);
  x.stroke();
  return c;
}

// Smooth “pretty undead” skin — pale porcelain, less necrosis blotching.
function prettySkinCanvas(base, blush, vein) {
  var S = 512,
    c = cnv(S, S),
    x = c.getContext("2d"),
    i;
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  // soft subsurface warmth
  for (i = 0; i < 80; i++) {
    var r = rr(20, 90),
      px = rnd() * S,
      py = rnd() * S;
    var g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, blush + (0.08 + rnd() * 0.12) + ")");
    g.addColorStop(1, blush + "0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, 6.3);
    x.fill();
  }
  // fine pores
  for (i = 0; i < 1200; i++) {
    x.fillStyle = "rgba(40,20,24," + rr(0.015, 0.05) + ")";
    x.fillRect(rnd() * S, rnd() * S, 1.2, 1.2);
  }
  // faint veins (pretty, not grotesque)
  x.lineWidth = 0.8;
  for (i = 0; i < 18; i++) {
    x.strokeStyle = vein + rr(0.06, 0.16) + ")";
    x.beginPath();
    var vx = rnd() * S,
      vy = rnd() * S,
      a = rnd() * 6.3;
    x.moveTo(vx, vy);
    for (var k = 0; k < 5; k++) {
      a += rr(-0.5, 0.5);
      vx += Math.cos(a) * 10;
      vy += Math.sin(a) * 10;
      x.lineTo(vx, vy);
    }
    x.stroke();
  }
  // tiny beauty marks / freckles
  for (i = 0; i < 40; i++) {
    x.fillStyle = "rgba(90,40,30," + rr(0.08, 0.22) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(0.6, 2.2), 0, 6.3);
    x.fill();
  }
  // very few small bruises (undead cue without ruining the look)
  for (i = 0; i < 4; i++) {
    var wx = rnd() * S,
      wy = rnd() * S,
      wr = rr(4, 12);
    var wg = x.createRadialGradient(wx, wy, 0, wx, wy, wr);
    wg.addColorStop(0, "rgba(90,30,50,0.25)");
    wg.addColorStop(1, "rgba(40,10,20,0)");
    x.fillStyle = wg;
    x.beginPath();
    x.arc(wx, wy, wr, 0, 6.3);
    x.fill();
  }
  return c;
}

export function prettyRoughTex() {
  var S = 256,
    c = cnv(S, S),
    x = c.getContext("2d");
  // mostly smooth (light grey = higher roughness mid); keep soft
  x.fillStyle = "#b8b0aa";
  x.fillRect(0, 0, S, S);
  for (var i = 0; i < 60; i++) {
    x.fillStyle = "rgba(255,255,255," + rr(0.05, 0.2) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(8, 40), 0, 6.3);
    x.fill();
  }
  // oily/wet highlights zones (darker = smoother)
  for (i = 0; i < 25; i++) {
    x.fillStyle = "rgba(30,30,30," + rr(0.15, 0.4) + ")";
    x.beginPath();
    x.arc(rnd() * S, rnd() * S, rr(6, 22), 0, 6.3);
    x.fill();
  }
  var t2 = ctex(c, 1);
  t2.colorSpace = THREE.NoColorSpace;
  return t2;
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

/* Offline stand-ins. The mode's photographic maps sit in assets/, which is
   the one part of the app that is not vendored — open index.html without them
   (or with a file:// path the browser refuses) and every surface used to fall
   back to flat white. These procedural painters predate the photos and were
   left stranded when they landed; registered here they are the fallback the
   loader draws instead, and because the library derives normals and roughness
   from whatever it ends up with, the substitute is a full material rather
   than a colour. Each url gets a fixed seed set so the stand-in is at least
   the right fabric. */
function registerFallbacks() {
  registerFallback("assets/textures/zombie_flesh.jpg", function () {
    return fleshCanvas("#6b6a52", "rgba(74,96,58,");
  });
  registerFallback("assets/textures/zombie_pretty_flesh.jpg", function () {
    return prettySkinCanvas("#d8bfae", "rgba(200,120,120,", "rgba(90,110,150,");
  });
  registerFallback("assets/textures/zombie_cloth.jpg", clothCanvas);
  registerFallback("assets/textures/fx_tear_1.png", clothTearCanvas);
  registerFallback("assets/textures/fx_tear_v2.png", clothTearCanvas);
  registerFallback("assets/textures/fx_wound_entry_v2.png", bloodCanvas);
  registerFallback("assets/textures/fx_wound_graze_v2.png", bloodCanvas);
  registerFallback("assets/textures/fx_blood_spatter_v2.png", bloodCanvas);
  [1, 2, 3].forEach(function (n) {
    registerFallback("assets/textures/fx_blood_" + n + ".png", bloodCanvas);
  });
  CLOTH_FILES.forEach(function (f, i) {
    registerFallback("assets/textures/cloth_" + f.k + ".jpg", function () {
      return uniqueClothCanvas(f.base, f.accent, i);
    });
  });
}

export function ensureTex() {
  if (TEX.ready) return;
  registerFallbacks();

  // One shared photo per skin family, plus the normal map derived from it —
  // without that the flashlight sweeping over a body produced no shading at
  // all and the undead read as painted mannequins.
  TEX.fleshMap = texLoad("assets/textures/zombie_flesh.jpg", { rep: 1 });
  TEX.fleshNorm = texNormal("assets/textures/zombie_flesh.jpg", { rep: 1, strength: 2.6 });
  TEX.prettyMap = texLoad("assets/textures/zombie_pretty_flesh.jpg", { rep: 1 });
  TEX.prettyNorm = texNormal("assets/textures/zombie_pretty_flesh.jpg", { rep: 1, strength: 1.5 });

  TEX.fleshRough = fleshRoughTex();
  TEX.prettyRough = prettyRoughTex();
  TEX.cloth = texLoad("assets/textures/zombie_cloth.jpg", { rep: 1 });
  TEX.clothNorm = texNormal("assets/textures/zombie_cloth.jpg", { rep: 1, strength: 2 });

  // Decals are quads, not tiling surfaces: repeat wrapping made the bilinear
  // filter sample across the far edge and smear blood along the border.
  // World stains, skin wounds and fabric tears are different phenomena. The
  // old path reused the same square blood photos for all three, which made a
  // hit read as an image pasted over the material instead of damaged material.
  TEX.blood = [texLoad("assets/textures/fx_blood_spatter_v2.png", { clamp: true })];
  TEX.wound = [
    texLoad("assets/textures/fx_wound_entry_v2.png", { clamp: true }),
    texLoad("assets/textures/fx_wound_graze_v2.png", { clamp: true })
  ];
  TEX.tear = texLoad("assets/textures/fx_tear_v2.png", { clamp: true });
  // Three bullet holes so a burst into one spot does not stamp the same
  // silhouette three times — that repetition is most of what makes decals
  // read as stickers.
  TEX.impact = [0, 1, 2].map(function () {
    var t = new THREE.CanvasTexture(impactCanvas());
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
  TEX.spray = sprayTex();

  TEX.clothes = {};
  TEX.clothesNorm = {};
  CLOTH_FILES.forEach(function (f) {
    var url = "assets/textures/cloth_" + f.k + ".jpg";
    TEX.clothes[f.k] = texLoad(url, { rep: 2 });
    TEX.clothesNorm[f.k] = texNormal(url, { rep: 2, strength: f.n });
  });
  TEX.ready = true;
}

// Drops every texture and material the undead are built from. Survives a
// restart on purpose — only leaving the mode (or a change of texel budget)
// pays to rebuild them. Textures loaded through the library are released by
// disposeTexLib(); the procedural ones are ours to free.
export function resetTexCache() {
  function kill(t) {
    if (t && t.isTexture) t.dispose();
  }
  Object.keys(TEX).forEach(function (k) {
    var v = TEX[k];
    if (Array.isArray(v)) v.forEach(kill);
    else if (v && typeof v === "object" && !v.isTexture)
      Object.keys(v).forEach(function (kk) {
        kill(v[kk]);
      });
    else kill(v);
  });
  TEX = {};
  Zmat.flesh.forEach(function (m) {
    m && m.dispose();
  });
  Zmat.pretty.forEach(function (m) {
    m && m.dispose();
  });
  ["cloth", "eyeGlow", "hair"].forEach(function (g) {
    for (var k in Zmat[g]) Zmat[g][k].dispose();
  });
  ["stump", "eye", "bone", "lip"].forEach(function (k) {
    if (Zmat[k]) Zmat[k].dispose();
  });
  Zmat = { flesh: [], pretty: [], cloth: {}, stump: null, eye: null, bone: null, eyeGlow: {}, lip: null, hair: {} };
  for (var h in HIT_SURFACE_MAT) if (HIT_SURFACE_MAT[h]) HIT_SURFACE_MAT[h].dispose();
  HIT_SURFACE_MAT = { wound: null, tear: null };
}

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
export function noRaycast(o) {
  o.traverse
    ? o.traverse(function (c) {
        c.raycast = NO_RAYCAST;
      })
    : (o.raycast = NO_RAYCAST);
  return o;
}

/* A unit quad turned into an instanced geometry — the carrier for both particle
   pools. See the note in initFX: WebGPU cannot draw sized points, so particles
   are billboarded sprite instances. */
function instancedQuad(count) {
  var base = new THREE.PlaneGeometry(1, 1);
  var g = new THREE.InstancedBufferGeometry();
  // Node materials resolve `uv()` from the *rendered* geometry.  Referencing
  // PlaneGeometry's attributes directly made the WebGPU path lose that
  // attribute after the temporary base geometry was disposed, producing a
  // console warning on the first muzzle-flash/fire-particle render.
  g.setIndex(base.index.clone());
  g.setAttribute("position", base.attributes.position.clone());
  g.setAttribute("uv", base.attributes.uv.clone());
  g.instanceCount = count;
  base.dispose();
  return g;
}

// A decal is still alpha-masked, but its carrier no longer has four perfectly
// straight sides. This irregular fan removes the last visible rectangular
// silhouette under grazing light, low mip levels and overlapping marks.
function organicDecalGeometry(seed, points) {
  points = points || 14;
  var pos = new Float32Array((points + 1) * 3),
    uv0 = new Float32Array((points + 1) * 2),
    idx = new Uint16Array(points * 3);
  uv0[0] = uv0[1] = 0.5;
  for (var i = 0; i < points; i++) {
    var a = (i / points) * Math.PI * 2;
    var wobble = Math.sin(seed * 12.9898 + i * 7.113) * 0.5 + 0.5;
    var rad = 0.43 + wobble * 0.065;
    var vi = i + 1,
      px = Math.cos(a) * rad,
      py = Math.sin(a) * rad;
    pos[vi * 3] = px;
    pos[vi * 3 + 1] = py;
    uv0[vi * 2] = px + 0.5;
    uv0[vi * 2 + 1] = py + 0.5;
    idx[i * 3] = 0;
    idx[i * 3 + 1] = vi;
    idx[i * 3 + 2] = ((i + 1) % points) + 1;
  }
  var geo = new THREE.BufferGeometry();
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv0, 2));
  geo.computeVertexNormals();
  return geo;
}

export function initFX() {
  var g = Z.grp;
  // --- particles: one Points system, two visual classes via per-vertex color
  var N = 1200;
  var geo = instancedQuad(N);
  var pos = new Float32Array(N * 3),
    col = new Float32Array(N * 3),
    siz = new Float32Array(N);
  for (var i = 0; i < N; i++) pos[i * 3 + 1] = -99999;
  // Instance attributes are prefixed so they cannot collide with the quad's own
  // `position`/`uv`. stepFX writes these arrays directly, by name.
  geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute("iCol", new THREE.InstancedBufferAttribute(col, 3));
  geo.setAttribute("iSize", new THREE.InstancedBufferAttribute(siz, 1));
  // INSTANCED SPRITES, not THREE.Points. three's own PointsNodeMaterial docs
  // are explicit: "WebGPU only supports point primitives with 1 pixel size...
  // If an application wants to render points with a size larger than 1 pixel,
  // the material should be used with Sprite and instancing." So on the WebGPU
  // backend a Points cloud is invisible (1px dots) no matter what sizeNode says
  // — which is why the blood and the flamethrower rendered as nothing useful.
  // PointsNodeMaterial on a MESH, not SpriteNodeMaterial. The billboard-quad
  // expansion (setupVertexSprite) lives in PointsNodeMaterial and runs for any
  // object that is NOT isPoints. SpriteNodeMaterial has no setupVertex at all,
  // so the quad stays at its raw 1cm local size and is invisible at any range.
  var mat = new THREE.PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  mat.positionNode = attribute("iPos"); // per-instance billboard centre
  var partDist = positionView.z.negate().max(1);
  // Faithful port of the original gl_PointSize. setupVertexSprite ends with
  //   pointSize = sizeNode * screenDPR          (sizeAttenuation off)
  // and pointSize is in PHYSICAL pixels — the same units gl_PointSize used — so
  // dividing by screenDPR here cancels three's multiply and reproduces the old
  // `size * 380 / dist` exactly, keeping the hand-tuned particle scale.
  mat.sizeAttenuation = false;
  mat.sizeNode = attribute("iSize").mul(380).div(partDist).div(screenDPR);
  mat.colorNode = Fn(function () {
    // Derive the unit-quad coordinates from local position. Besides avoiding
    // an unnecessary vertex attribute, this also keeps the WebGPU node path
    // from asking for `uv` on an instanced particle carrier.
    var puv = positionLocal.xy.add(vec2(0.5));
    var d = puv.sub(vec2(0.5)).length();
    var tx = texture(TEX.spray, puv);
    // GLSL smoothstep with edge0 > edge1 is undefined; written as an explicit
    // inverted ramp instead of relying on driver leniency.
    var vA = smoothstep(180, 2200, partDist).oneMinus();
    Discard(tx.a.lessThan(0.02).or(d.greaterThan(0.5)));
    var soft = smoothstep(0.15, 0.5, d).oneMinus();
    var a = tx.a.mul(soft).mul(vA);
    return vec4(attribute("iCol").mul(a.mul(0.45).add(0.55)), a);
  })();
  var pts = new THREE.Mesh(geo, mat);
  pts.frustumCulled = false;
  noRaycast(pts);
  g.add(pts);
  Z.parts = {
    pts: pts,
    geo: geo,
    n: N,
    activeN: N,
    head: 0,
    life: new Float32Array(N),
    max: new Float32Array(N),
    vx: new Float32Array(N),
    vy: new Float32Array(N),
    vz: new Float32Array(N),
    gr: new Float32Array(N),
    s0: new Float32Array(N),
    c0: new Float32Array(N * 3),
  };

  // Fire has its own additive pool. Reusing the blood/dust shader made flames
  // read as sparse grey dots; these particles have a tapered, white-hot core
  // and a soft orange crown, so both the jet and burning bodies stay legible.
  var FN = 720;
  var fg = instancedQuad(FN);
  var fp = new Float32Array(FN * 3),
    fs = new Float32Array(FN),
    fh = new Float32Array(FN),
    fa = new Float32Array(FN);
  for (var fi = 0; fi < FN; fi++) fp[fi * 3 + 1] = -99999;
  fg.setAttribute("iPos", new THREE.InstancedBufferAttribute(fp, 3));
  fg.setAttribute("iSize", new THREE.InstancedBufferAttribute(fs, 1));
  fg.setAttribute("iHeat", new THREE.InstancedBufferAttribute(fh, 1));
  fg.setAttribute("iAlpha", new THREE.InstancedBufferAttribute(fa, 1));
  // Same TSL port as the blood pool above — this one is the flamethrower jet
  // and burning bodies, which is why the fire weapons rendered as junk.
  var fm = new THREE.PointsNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  fm.positionNode = attribute("iPos");
  fm.sizeAttenuation = false;
  var fireDist = positionView.z.negate().max(1);
  // .max(1/dpr): the original clamped gl_PointSize (physical px) to 1
  fm.sizeNode = attribute("iSize").mul(420).div(fireDist).div(screenDPR).max(float(1).div(screenDPR));
  fm.colorNode = Fn(function () {
    var puv = positionLocal.xy.add(vec2(0.5));
    var y = puv.y;
    var x = puv.x.sub(0.5).abs();
    var vHeat = attribute("iHeat");
    var vAlpha = attribute("iAlpha");
    // tapered flame: narrow at the tip, wide at the base
    var width = mix(float(0.12), float(0.47), y.oneMinus());
    var edge = smoothstep(width.mul(0.62), width, x).oneMinus();
    var cap = smoothstep(0.0, 0.12, y).mul(smoothstep(0.72, 1.0, y).oneMinus());
    var flick = sin(puv.x.mul(17).add(puv.y.mul(29)).add(vHeat.mul(19))).mul(0.16).add(0.84);
    var mask = edge.mul(cap).mul(flick).mul(vAlpha);
    Discard(mask.lessThan(0.015));
    var orange = vec3(1.0, 0.16, 0.015);
    var yellow = vec3(1.0, 0.62, 0.035);
    var white = vec3(1.0, 0.94, 0.58);
    var col = mix(orange, yellow, smoothstep(0.12, 0.62, vHeat));
    col = mix(col, white, smoothstep(0.62, 1.0, vHeat).mul(smoothstep(0.08, 0.38, x).oneMinus()));
    return vec4(col.mul(mask).mul(1.55), mask.mul(0.9));
  })();
  var fpts = new THREE.Mesh(fg, fm);
  fpts.frustumCulled = false;
  fpts.renderOrder = 12;
  noRaycast(fpts);
  g.add(fpts);
  Z.fireParts = {
    pts: fpts, geo: fg, n: FN, activeN: FN, head: 0,
    life: new Float32Array(FN), max: new Float32Array(FN),
    vx: new Float32Array(FN), vy: new Float32Array(FN), vz: new Float32Array(FN),
    s0: new Float32Array(FN), heat0: new Float32Array(FN),
  };

  // --- tracers: a fixed pool of fading line segments
  var TN = 64;
  var tg = new THREE.BufferGeometry();
  var tp = new Float32Array(TN * 6),
    tc = new Float32Array(TN * 6);
  tg.setAttribute("position", new THREE.BufferAttribute(tp, 3));
  tg.setAttribute("color", new THREE.BufferAttribute(tc, 3));
  var tl = new THREE.LineSegments(
    tg,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    })
  );
  tl.frustumCulled = false;
  noRaycast(tl);
  g.add(tl);
  Z.tracers = { m: tl, geo: tg, n: TN, head: 0, life: new Float32Array(TN) };

  // --- blood decals: lit, organically clipped stains rather than unlit quads
  var DN = 96;
  var decals = [];
  for (var d = 0; d < DN; d++) {
    var dmat = new THREE.MeshStandardMaterial({
      map: TEX.blood[d % TEX.blood.length],
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.045,
      opacity: 0.92,
      roughness: 0.48,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    var m = new THREE.Mesh(organicDecalGeometry(d + 11, 16), dmat);
    m.visible = false;
    m.renderOrder = 3;
    noRaycast(m);
    g.add(m);
    decals.push(m);
  }
  Z.decals = { list: decals, head: 0, activeN: DN };

  /* --- bullet holes: their own ring buffer, deliberately NOT sharing the
     blood pool. Two differences carry the whole effect:
       * the material is LIT. Blood is unlit on purpose (it should stay vivid
         in the dark), but an unlit grey mark keeps its own brightness while
         the wall around it swings with the flashlight, and the eye reads
         anything that ignores the light as pasted on. A standard material
         means the hole darkens and glints exactly like the plaster it is in.
       * the quad sits 0.35cm off the surface instead of 1.4. At the range you
         actually inspect a wall, 1.4cm of parallax is visible as the mark
         sliding over the surface as you strafe. polygonOffset, not distance,
         is what keeps it out of z-fighting. */
  var IN = 48;
  var impacts = [];
  for (var q = 0; q < IN; q++) {
    var imat = new THREE.MeshStandardMaterial({
      map: TEX.impact[q % TEX.impact.length],
      transparent: true,
      alphaTest: 0.025,
      roughness: 0.95,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    var im = new THREE.Mesh(organicDecalGeometry(q + 101, 13), imat);
    im.visible = false;
    im.renderOrder = 2; // under blood — a wall gets shot before it gets bled on
    noRaycast(im);
    g.add(im);
    impacts.push(im);
  }
  Z.impacts = { list: impacts, head: 0, activeN: IN };

  // --- dust motes: the flashlight beam needs something to catch
  var MN = 440,
    mg = new THREE.BufferGeometry(),
    mp = new Float32Array(MN * 3),
    mc = new Float32Array(MN * 3),
    // WebGPURenderer turns PointsMaterial's sprite map into a node lookup.
    // Supplying a stable centre UV prevents its first render from warning
    // about a missing vertex attribute whenever a weapon wakes the FX pass.
    mu = new Float32Array(MN * 2);
  for (var k = 0; k < MN; k++) {
    mp[k * 3] = rr(-700, 700);
    mp[k * 3 + 1] = rr(0, 280);
    mp[k * 3 + 2] = rr(-700, 700);
    var warm = rnd() < 0.35;
    mc[k * 3] = warm ? 1 : 0.72;
    mc[k * 3 + 1] = warm ? 0.92 : 0.82;
    mc[k * 3 + 2] = warm ? 0.7 : 1;
    mu[k * 2] = mu[k * 2 + 1] = 0.5;
  }
  mg.setAttribute("position", new THREE.BufferAttribute(mp, 3));
  mg.setAttribute("color", new THREE.BufferAttribute(mc, 3));
  mg.setAttribute("uv", new THREE.BufferAttribute(mu, 2));
  var motes = new THREE.Points(
    mg,
    new THREE.PointsMaterial({
      size: 3.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      map: TEX.spray,
      alphaTest: 0.02,
    })
  );
  motes.frustumCulled = false;
  noRaycast(motes);
  g.add(motes);
  Z.motes = { m: motes, geo: mg, n: MN, activeN: MN, phase: 0 };
  setFXDensity((Z.settings && Z.settings.fx ? Z.settings.fx : 50) / 100);
}

export function setFXDensity(value) {
  var k = clamp(Number(value) || 0.5, 0.25, 1);
  // FX is its own accessibility/gameplay setting, but render quality must
  // still be able to reduce the per-frame particle and decal draw load.
  // Previously the fixed minima kept Fast drawing almost the same amount of
  // fire as High (and made the graphics slider look ineffective).
  var visual = clamp(k * (Z.qualityFxScale == null ? 1 : Z.qualityFxScale), 0.1, 1);
  Z.fxDensity = visual;
  if (Z.parts) Z.parts.activeN = Math.max(100, Math.round(Z.parts.n * visual));
  if (Z.fireParts) Z.fireParts.activeN = Math.max(100, Math.round(Z.fireParts.n * visual));
  if (Z.decals) Z.decals.activeN = Math.max(16, Math.round(Z.decals.list.length * visual));
  if (Z.impacts) Z.impacts.activeN = Math.max(12, Math.round(Z.impacts.list.length * visual));
  if (Z.motes) {
    Z.motes.activeN = Math.max(70, Math.round(Z.motes.n * visual));
    Z.motes.geo.setDrawRange(0, Z.motes.activeN);
  }
}

function applyZedShadowQuality(root) {
  if (!root) return;
  var shadows = (Z.renderQuality || 0) > 0;
  root.traverse(function (o) {
    if (!o.isMesh) return;
    // Preserve the detail trim's deliberate shadow exclusions.  The setting
    // only switches off work that was otherwise going to be rendered.
    if (o.userData.zShadow == null) o.userData.zShadow = !!o.castShadow;
    o.castShadow = shadows && o.userData.zShadow;
  });
}

// Night Shift has a moving flashlight and a large pile of alpha/instanced FX
// that are outside the planner's generic renderer preset.  Give the in-game
// slider ownership of those costs too, so Fast is materially faster instead
// of merely changing a canvas option.
export function setNightShiftQuality(value) {
  var quality = Math.round(clamp(Number(value) || 0, 0, 2));
  Z.renderQuality = quality;
  Z.qualityFxScale = [0.45, 0.72, 1][quality];

  if (Z.flash) {
    var size = quality === 2 ? 1536 : quality === 1 ? 1024 : 512;
    Z.flash.sp.castShadow = quality > 0;
    Z.flash.sp.shadow.mapSize.set(size, size);
    Z.flash.volumetric = quality > 0;
    if (Z.flash.cone) Z.flash.cone.visible = Z.flash.volumetric;
  }
  Z.zeds.forEach(function (zed) { applyZedShadowQuality(zed.rig && zed.rig.root); });
  setFXDensity((Z.settings && Z.settings.fx ? Z.settings.fx : 50) / 100);
}

export function spawnFirePart(x, y, z, vx, vy, vz, size, life, heat) {
  var F = Z.fireParts;
  if (!F || rnd() > Math.max(0.55, Z.fxDensity || 0.5)) return;
  var i = F.head;
  F.head = (F.head + 1) % (F.activeN || F.n);
  F.life[i] = F.max[i] = life;
  F.vx[i] = vx;
  F.vy[i] = vy;
  F.vz[i] = vz;
  F.s0[i] = size;
  F.heat0[i] = heat == null ? 1 : heat;
  var p = F.geo.attributes.iPos.array;
  p[i * 3] = x;
  p[i * 3 + 1] = y;
  p[i * 3 + 2] = z;
}

export function spawnPart(x, y, z, vx, vy, vz, size, r, g, b, life, grav) {
  var P = Z.parts;
  if (!P) return;
  if (rnd() > (Z.fxDensity || 0.5)) return;
  var i = P.head;
  P.head = (P.head + 1) % (P.activeN || P.n);
  P.life[i] = life;
  P.max[i] = life;
  P.vx[i] = vx;
  P.vy[i] = vy;
  P.vz[i] = vz;
  P.gr[i] = grav;
  P.s0[i] = size;
  P.c0[i * 3] = r;
  P.c0[i * 3 + 1] = g;
  P.c0[i * 3 + 2] = b;
  var pa = P.geo.attributes.iPos.array;
  pa[i * 3] = x;
  pa[i * 3 + 1] = y;
  pa[i * 3 + 2] = z;
}

export function bloodBurst(x, y, z, dx, dy, dz, amount) {
  for (var i = 0; i < amount; i++) {
    var sp = rr(70, 420);
    var mist = rnd() < 0.35;
    spawnPart(
      x + rr(-4, 4), y + rr(-3, 3), z + rr(-4, 4),
      (dx + rr(-0.75, 0.75)) * sp,
      (dy + rr(-0.15, 0.95)) * sp * (mist ? 0.55 : 1),
      (dz + rr(-0.75, 0.75)) * sp,
      mist ? rr(2.4, 7.5) : rr(1.4, 5.8),
      rr(0.42, 0.72), rr(0.01, 0.05), rr(0.02, 0.06),
      mist ? rr(0.35, 0.8) : rr(0.55, 1.45),
      GRAV * (mist ? 0.55 : 1.15)
    );
  }
}
export function goreChunks(x, y, z, amount) {
  for (var i = 0; i < amount; i++) {
    spawnPart(
      x, y, z,
      rr(-220, 220), rr(80, 380), rr(-220, 220),
      rr(5, 14),
      rr(0.28, 0.55), rr(0.03, 0.08), rr(0.04, 0.09),
      rr(1.0, 2.2),
      GRAV * 1.3
    );
  }
}
export function sparkBurst(x, y, z, nx, ny, nz, amount, warm) {
  for (var i = 0; i < amount; i++) {
    spawnPart(
      x, y, z,
      (nx + rr(-0.55, 0.55)) * rr(60, 320),
      (ny + rr(-0.25, 0.85)) * rr(60, 320),
      (nz + rr(-0.55, 0.55)) * rr(60, 320),
      rr(1.0, 3.2),
      warm ? 1 : 0.7, warm ? 0.78 : 0.68, warm ? 0.32 : 0.72,
      rr(0.2, 0.55),
      GRAV * 0.55
    );
  }
}
/* Pulverised plaster/board off a bullet strike: slow, near-weightless grey
   motes that hang in the flashlight cone for a moment. Sparks alone read as
   metal, which made every wall hit look like a ricochet off a girder. */
export function dustBurst(x, y, z, nx, ny, nz, amount) {
  for (var i = 0; i < amount; i++) {
    var g = rr(0.32, 0.5);
    spawnPart(
      x, y, z,
      (nx + rr(-0.7, 0.7)) * rr(18, 90),
      (ny + rr(-0.2, 0.9)) * rr(18, 90),
      (nz + rr(-0.7, 0.7)) * rr(18, 90),
      rr(2.2, 6),
      g, g * 0.95, g * 0.88,
      rr(0.3, 0.75),
      GRAV * 0.14
    );
  }
}
export function boneBurst(x, y, z, amount) {
  for (var i = 0; i < amount; i++) {
    spawnPart(
      x, y, z,
      rr(-160, 160), rr(40, 260), rr(-160, 160),
      rr(2.2, 5.5),
      rr(0.75, 0.95), rr(0.7, 0.88), rr(0.55, 0.72),
      rr(0.7, 1.4),
      GRAV * 1.1
    );
  }
}

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

export function ensureGibs() {
  if (!Z.gibs) Z.gibs = [];
}

export function clearGibs() {
  if (!Z.gibs) return;
  Z.gibs.forEach(function (g) {
    if (!g || !g.mesh) return;
    if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
    g.mesh.traverse(function (o) {
      if (o.isMesh && o.geometry && o.userData && o.userData.gibOwnedGeo) o.geometry.dispose();
    });
  });
  Z.gibs = [];
}

// Reparent a limb/head group into world space, keeping its pose.
export function detachToWorld(obj) {
  if (!obj || !Z.grp) return null;
  obj.updateWorldMatrix(true, true);
  _gibMat.copy(obj.matrixWorld);
  _gibMat.decompose(_gibPos, _gibQuat, _gibScl);
  if (obj.parent) obj.parent.remove(obj);
  Z.grp.add(obj);
  obj.position.copy(_gibPos);
  obj.quaternion.copy(_gibQuat);
  obj.scale.copy(_gibScl);
  obj.updateMatrixWorld(true);
  // severed parts no longer count as living hit targets
  obj.traverse(function (o) {
    if (!o.userData) o.userData = {};
    o.userData.zed = true; // zedOf treats `true` as non-entity
    o.userData.gib = true;
    o.userData.part = null;
    o.raycast = NO_RAYCAST;
    if (o.isMesh && o.geometry) o.userData.gibOwnedGeo = ownsGeo(o.geometry);
  });
  return obj;
}

// Soft stretch of flesh strands at the cut plane for a brief moment.
export function fleshStrings(x, y, z, dx, dy, dz, amount) {
  var len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  for (var i = 0; i < amount; i++) {
    var side = rr(-40, 40),
      up = rr(-20, 50);
    spawnPart(
      x + rr(-6, 6),
      y + rr(-4, 4),
      z + rr(-6, 6),
      dx * rr(30, 90) + rr(-50, 50),
      dy * rr(20, 80) + up,
      dz * rr(30, 90) + rr(-50, 50),
      rr(3, 8),
      rr(0.45, 0.7),
      0.04,
      0.05,
      rr(0.25, 0.55),
      GRAV * 0.7
    );
  }
}

// Procedural meat chunk mesh (not a full limb) — blown flesh pieces.
export function spawnFleshChunk(x, y, z, vx, vy, vz, size, mode) {
  ensureGibs();
  if (Z.gibs.length > 48) {
    var old = Z.gibs.shift();
    if (old && old.mesh) {
      if (old.mesh.parent) old.mesh.parent.remove(old.mesh);
      old.mesh.traverse(function (o) {
        if (o.isMesh && o.geometry && o.userData.gibOwnedGeo) o.geometry.dispose();
      });
    }
  }
  var g = new THREE.Group();
  var s = size || rr(5, 14);
  var mat = stumpMat();
  var flesh = fleshMat((rnd() * 4) | 0);
  // irregular cluster of blobs
  var core = new THREE.Mesh(
    sphGeo(s * 0.55, 8, 6),
    flesh
  );
  core.scale.set(rr(0.7, 1.3), rr(0.6, 1.2), rr(0.7, 1.4));
  g.add(core);
  var n = 2 + ((rnd() * 3) | 0);
  for (var i = 0; i < n; i++) {
    var bit = new THREE.Mesh(
      boxGeo(s * rr(0.3, 0.7), s * rr(0.25, 0.55), s * rr(0.3, 0.7)),
      rnd() < 0.35 ? boneMat() : rnd() < 0.5 ? mat : flesh
    );
    bit.position.set(rr(-s, s) * 0.4, rr(-s, s) * 0.35, rr(-s, s) * 0.4);
    bit.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    g.add(bit);
  }
  // bloody stump face
  var stump = new THREE.Mesh(sphGeo(s * 0.35, 8, 6), mat);
  stump.position.set(0, s * 0.2, 0);
  g.add(stump);
  g.traverse(function (o) {
    if (o.isMesh) {
      o.castShadow = true;
      o.userData.gib = true;
      o.userData.zed = true;
      // the blob geometry now comes from the shared cache; only geometry this
      // gib actually owns may be disposed when it is recycled
      if (ownsGeo(o.geometry)) o.userData.gibOwnedGeo = true;
    }
  });
  g.position.set(x, y, z);
  noRaycast(g);
  Z.grp.add(g);
  var force = mode === "blow" ? 1.35 : 0.85;
  var gib = {
    mesh: g,
    x: x,
    y: y,
    z: z,
    vx: (vx + rr(-40, 40)) * force,
    vy: (vy + rr(40, 160)) * force,
    vz: (vz + rr(-40, 40)) * force,
    wx: rr(-10, 10),
    wy: rr(-8, 8),
    wz: rr(-10, 10),
    life: rr(4.5, 7.5),
    maxLife: 7,
    bounce: 0,
    settled: false,
    dripT: 0,
    mode: mode || "blow",
    owned: true,
  };
  Z.gibs.push(gib);
  return gib;
}

// Detach a living limb/head mesh and fling it as a gib.
// partKey: "armL"|"armR"|"legL"|"legR"|"head"|"leg" (both legs)
export function severPart(zd, partKey, dir, mode, forceMul) {
  if (!zd || !zd.rig || !Z.grp) return null;
  ensureGibs();
  mode = mode || "blow";
  forceMul = forceMul == null ? 1 : forceMul;
  var r = zd.rig;
  var targets = [];

  if (partKey === "leg") {
    if (zd.limbs.legL) targets.push({ key: "legL", obj: r.legL && r.legL.hip });
    if (zd.limbs.legR) targets.push({ key: "legR", obj: r.legR && r.legR.hip });
  } else if (partKey === "armL" && zd.limbs.armL) {
    targets.push({ key: "armL", obj: r.armL && r.armL.sh });
  } else if (partKey === "armR" && zd.limbs.armR) {
    targets.push({ key: "armR", obj: r.armR && r.armR.sh });
  } else if (partKey === "head" && zd.limbs.head) {
    targets.push({ key: "head", obj: r.head });
  } else if (partKey === "legL" && zd.limbs.legL) {
    targets.push({ key: "legL", obj: r.legL && r.legL.hip });
  } else if (partKey === "legR" && zd.limbs.legR) {
    targets.push({ key: "legR", obj: r.legR && r.legR.hip });
  }

  if (!targets.length) return null;

  var dx = (dir && dir.x) || 0,
    dy = (dir && dir.y) || 0.3,
    dz = (dir && dir.z) || 1;
  var dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;

  var last = null;
  targets.forEach(function (t, ti) {
    if (!t.obj || !t.obj.parent) return;
    // world position before detach (for FX)
    t.obj.updateWorldMatrix(true, true);
    var wp = new THREE.Vector3();
    t.obj.getWorldPosition(wp);

    var mesh = detachToWorld(t.obj);
    if (!mesh) return;

    // stump on the remaining body
    addStump(zd, t.key, wp);

    // mark limb gone
    zd.limbs[t.key] = false;
    if (t.key === "legL" || t.key === "legR") {
      if (!zd.limbs.legL && !zd.limbs.legR) {
        zd.crawler = true;
        zd.spd *= 0.75;
      }
    }
    if (t.key === "armL" || t.key === "armR") zd.dmg *= 0.72;
    if (t.key === "head") {
      // headless: eyes already on the flying head
      if (r.eyes) r.eyes = [];
    }

    // velocity profile by mode
    var base =
      mode === "cut"
        ? rr(180, 340)
        : mode === "explode"
        ? rr(380, 720)
        : rr(260, 520);
    base *= forceMul;
    // side scatter so multi-limb gibs fan out
    var side = (ti - (targets.length - 1) * 0.5) * 0.55;
    var sx = -dz * side + rr(-0.35, 0.35);
    var sz = dx * side + rr(-0.35, 0.35);
    var vx = (dx + sx) * base;
    var vy = (dy + (mode === "cut" ? 0.55 : 0.85) + rr(0.1, 0.5)) * base * 0.75;
    var vz = (dz + sz) * base;

    // spin: cut spins hard around the blade plane; blow tumbles chaotically
    var wx, wy, wz;
    if (mode === "cut") {
      wx = rr(-4, 4);
      wy = rr(8, 18) * (rnd() < 0.5 ? 1 : -1);
      wz = rr(-5, 5);
    } else {
      wx = rr(-14, 14);
      wy = rr(-12, 12);
      wz = rr(-14, 14);
    }

    // cap pool
    if (Z.gibs.length > 40) {
      var old = Z.gibs.shift();
      if (old && old.mesh && old.mesh.parent) old.mesh.parent.remove(old.mesh);
    }

    var gib = {
      mesh: mesh,
      x: wp.x,
      y: wp.y,
      z: wp.z,
      vx: vx,
      vy: vy,
      vz: vz,
      wx: wx,
      wy: wy,
      wz: wz,
      life: mode === "explode" ? rr(5, 8) : rr(5.5, 9),
      maxLife: 9,
      bounce: 0,
      settled: false,
      dripT: 0,
      mode: mode,
      part: t.key,
      owned: true, // we own disposal after detach
    };
    // snap mesh to exact world pos (detach already did)
    mesh.position.set(wp.x, wp.y, wp.z);
    Z.gibs.push(gib);
    last = gib;

    // FX at the cut
    bloodBurst(wp.x, wp.y, wp.z, dx, 0.4, dz, mode === "blow" || mode === "explode" ? 28 : 18);
    goreChunks(wp.x, wp.y, wp.z, mode === "explode" ? 12 : 8);
    fleshStrings(wp.x, wp.y, wp.z, dx, dy, dz, mode === "cut" ? 14 : 8);
    if (mode !== "cut") boneBurst(wp.x, wp.y, wp.z, 4);
    decal(wp.x, 0.8, wp.z, 0, 1, 0, rr(30, 60));

    // a few free meat chunks peel off the stump
    var chunks = mode === "explode" ? 5 : mode === "blow" ? 3 : 2;
    for (var c = 0; c < chunks; c++) {
      spawnFleshChunk(
        wp.x + rr(-8, 8),
        wp.y + rr(-6, 6),
        wp.z + rr(-8, 8),
        dx * rr(80, 280) + rr(-100, 100),
        rr(60, 280),
        dz * rr(80, 280) + rr(-100, 100),
        rr(4, 11),
        mode === "cut" ? "cut" : "blow"
      );
    }
  });

  return last;
}

function addStump(zd, key, worldHit) {
  var r = zd.rig;
  if (!r) return;
  var stump;
  if (key === "head") {
    stump = sp(r.neck, 6.2, 0, 12, 0, stumpMat(), "body", 10);
    // bone ring
    var bone = cy(r.neck, 4.2, 3.6, 4, 0, 10, 0, boneMat(), "body", 8);
    bone.position.y = 9;
  } else if (key === "armL") {
    stump = sp(r.torso, 6.5, -19, 56, 0, stumpMat(), "body", 10);
    sp(r.torso, 3.5, -19, 56, 2, boneMat(), "body", 6);
  } else if (key === "armR") {
    stump = sp(r.torso, 6.5, 19, 56, 0, stumpMat(), "body", 10);
    sp(r.torso, 3.5, 19, 56, 2, boneMat(), "body", 6);
  } else if (key === "legL" || key === "legR") {
    var sx = key === "legL" ? -1 : 1;
    stump = sp(r.torso, 7.5, sx * 10, 4, 2, stumpMat(), "body", 10);
    sp(r.torso, 4, sx * 10, 2, 2, boneMat(), "body", 6);
  }
  if (stump) {
    // pulse the stump briefly via scale (no shared-mat emissive)
    stump.userData.stumpPulse = 0.35;
  }
  // arterial spray from stump location
  if (worldHit) {
    bloodBurst(worldHit.x, worldHit.y, worldHit.z, 0, 1, 0, 10);
  }
}

// Full-body catastrophic break: every remaining limb flies off + torso chunks.
export function explodeBody(zd, dir, power) {
  if (!zd || !zd.rig) return;
  power = power || 1;
  var d = dir || { x: rr(-1, 1), y: 0.5, z: rr(-1, 1) };
  var order = ["head", "armL", "armR", "legL", "legR"];
  order.forEach(function (k, i) {
    if (!zd.limbs[k]) return;
    var ang = (i / order.length) * Math.PI * 2 + rr(-0.4, 0.4);
    var ld = {
      x: d.x * 0.5 + Math.sin(ang) * 0.85,
      y: 0.55 + rr(0, 0.4),
      z: d.z * 0.5 + Math.cos(ang) * 0.85,
    };
    severPart(zd, k, ld, "explode", power * rr(0.9, 1.25));
  });
  // torso meat explosion
  var tx = zd.x,
    ty = zd.y + 110,
    tz = zd.z;
  for (var i = 0; i < 10; i++) {
    spawnFleshChunk(
      tx + rr(-20, 20),
      ty + rr(-30, 40),
      tz + rr(-20, 20),
      rr(-400, 400),
      rr(120, 480),
      rr(-400, 400),
      rr(6, 16),
      "blow"
    );
  }
  bloodBurst(tx, ty, tz, 0, 1, 0, 40);
  goreChunks(tx, ty, tz, 22);
  boneBurst(tx, ty, tz, 12);
  decal(tx, 0.8, tz, 0, 1, 0, rr(80, 140));
  shake(0.55);
}

export function stepGibs(dt) {
  ensureGibs();
  if (!Z.gibs.length) return;
  for (var i = Z.gibs.length - 1; i >= 0; i--) {
    var g = Z.gibs[i];
    if (!g || !g.mesh) {
      Z.gibs.splice(i, 1);
      continue;
    }
    g.life -= dt;
    if (g.life <= 0) {
      if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
      if (g.owned) {
        g.mesh.traverse(function (o) {
          if (o.isMesh && o.geometry && o.userData.gibOwnedGeo) o.geometry.dispose();
        });
      }
      Z.gibs.splice(i, 1);
      continue;
    }

    if (!g.settled) {
      g.vy -= GRAV * 1.05 * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.z += g.vz * dt;

      // floor bounce
      var floor = 4;
      try {
        floor = Math.max(4, groundAt(g.x, g.z, g.y, STEP));
      } catch (e) {}
      if (g.y < floor + 3) {
        g.y = floor + 3;
        if (Math.abs(g.vy) > 40) {
          g.vy *= -0.32;
          g.vx *= 0.55;
          g.vz *= 0.55;
          g.wx *= 0.6;
          g.wy *= 0.7;
          g.wz *= 0.6;
          g.bounce++;
          if (g.bounce === 1) {
            decal(g.x, floor + 0.6, g.z, 0, 1, 0, rr(18, 40));
            bloodBurst(g.x, g.y, g.z, 0, 0.4, 0, 6);
          }
        } else {
          g.vy = 0;
          g.vx *= 0.82;
          g.vz *= 0.82;
          g.wx *= 0.75;
          g.wy *= 0.75;
          g.wz *= 0.75;
          if (Math.hypot(g.vx, g.vz) < 12 && Math.hypot(g.wx, g.wy, g.wz) < 0.8) {
            g.settled = true;
            g.vx = g.vy = g.vz = 0;
            g.wx = g.wy = g.wz = 0;
          }
        }
      }

      // tumble
      g.mesh.rotation.x += g.wx * dt;
      g.mesh.rotation.y += g.wy * dt;
      g.mesh.rotation.z += g.wz * dt;
      g.mesh.position.set(g.x, g.y, g.z);

      // cut mode: slight stretch squash while spinning fast
      if (g.mode === "cut" && !g.settled) {
        var spin = Math.min(1.15, 0.9 + Math.hypot(g.wx, g.wy, g.wz) * 0.01);
        g.mesh.scale.setScalar(spin);
      }
    } else {
      g.mesh.position.set(g.x, g.y, g.z);
    }

    // arterial drip while flying / freshly landed
    g.dripT -= dt;
    if (g.dripT <= 0 && g.life > 1.2 && g.y > 10) {
      g.dripT = g.settled ? rr(0.12, 0.28) : rr(0.04, 0.1);
      spawnPart(
        g.x + rr(-4, 4),
        g.y + rr(-6, 2),
        g.z + rr(-4, 4),
        rr(-20, 20),
        rr(-80, -20),
        rr(-20, 20),
        rr(1.4, 3.5),
        rr(0.4, 0.65),
        0.02,
        0.03,
        rr(0.35, 0.7),
        GRAV * 1.2
      );
    }

    // fade scale near end of life
    if (g.life < 1.2) {
      var fade = Math.max(0.05, g.life / 1.2);
      g.mesh.scale.setScalar(fade);
    }
  }
}

export function tracer(x0, y0, z0, x1, y1, z1) {
  var T = Z.tracers;
  if (!T) return;
  var i = T.head;
  T.head = (T.head + 1) % T.n;
  T.life[i] = 0.09;
  var a = T.geo.attributes.position.array,
    c = T.geo.attributes.color.array;
  a[i * 6] = x0; a[i * 6 + 1] = y0; a[i * 6 + 2] = z0;
  a[i * 6 + 3] = x1; a[i * 6 + 4] = y1; a[i * 6 + 5] = z1;
  c[i * 6] = 1; c[i * 6 + 1] = 0.85; c[i * 6 + 2] = 0.45;
  c[i * 6 + 3] = 1; c[i * 6 + 4] = 0.6; c[i * 6 + 5] = 0.2;
  T.geo.attributes.position.needsUpdate = true;
  T.geo.attributes.color.needsUpdate = true;
}

export function decal(x, y, z, nx, ny, nz, size) {
  var D = Z.decals;
  if (!D) return;
  var m = D.list[D.head];
  D.head = (D.head + 1) % (D.activeN || D.list.length);
  m.visible = true;
  m.scale.set(size, size * rr(0.75, 1.2), 1);
  var n = new THREE.Vector3(nx, ny, nz).normalize();
  // polygonOffset handles z-fighting; a tiny physical offset avoids the
  // parallax that made the old 1.4cm-away card slide over a wall when strafing.
  m.position.set(x + n.x * 0.12, y + n.y * 0.12, z + n.z * 0.12);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  m.rotateZ(rnd() * 6.3);
  if (m.material && m.material.opacity != null) m.material.opacity = rr(0.72, 0.95);
}

/* A bullet hole. Round — the blood quad's 0.75–1.2 aspect jitter is right for
   a splatter and wrong here, since a stretched hole is the other giveaway that
   you are looking at a stamped image. Variety comes from the three textures
   and the spin instead. */
export function impactMark(x, y, z, nx, ny, nz, size) {
  var I = Z.impacts;
  if (!I) return;
  var m = I.list[I.head];
  I.head = (I.head + 1) % (I.activeN || I.list.length);
  m.visible = true;
  m.scale.set(size * rr(0.92, 1.08), size * rr(0.88, 1.12), 1);
  var n = new THREE.Vector3(nx, ny, nz).normalize();
  m.position.set(x + n.x * 0.08, y + n.y * 0.08, z + n.z * 0.08);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  m.rotateZ(rnd() * 6.3);
  if (m.material && m.material.opacity != null) m.material.opacity = rr(0.82, 1);
}

export function shake(amount) {
  Z.shake = Math.min(1.6, Z.shake + amount);
}

export function stepFX(dt) {
  var P = Z.parts;
  if (P) {
    var pa = P.geo.attributes.iPos.array,
      ca = P.geo.attributes.iCol.array,
      sa = P.geo.attributes.iSize.array;
    for (var i = 0; i < (P.activeN || P.n); i++) {
      if (P.life[i] <= 0) {
        if (sa[i] !== 0) sa[i] = 0;
        continue;
      }
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        sa[i] = 0;
        // blood that lands leaves a small stain
        if (P.c0[i * 3] > 0.3 && P.c0[i * 3 + 1] < 0.1 && pa[i * 3 + 1] < 12 && rnd() < 0.28)
          decal(pa[i * 3], 0.7, pa[i * 3 + 2], 0, 1, 0, rr(14, 34));
        continue;
      }
      P.vy[i] -= P.gr[i] * dt;
      pa[i * 3] += P.vx[i] * dt;
      pa[i * 3 + 1] += P.vy[i] * dt;
      pa[i * 3 + 2] += P.vz[i] * dt;
      if (pa[i * 3 + 1] < 1.2) {
        pa[i * 3 + 1] = 1.2;
        P.vy[i] *= -0.24;
        P.vx[i] *= 0.5;
        P.vz[i] *= 0.5;
      }
      var k = P.life[i] / P.max[i];
      sa[i] = P.s0[i] * (0.45 + 0.55 * k);
      ca[i * 3] = P.c0[i * 3] * (0.35 + 0.65 * k);
      ca[i * 3 + 1] = P.c0[i * 3 + 1] * (0.35 + 0.65 * k);
      ca[i * 3 + 2] = P.c0[i * 3 + 2] * (0.35 + 0.65 * k);
    }
    P.geo.attributes.iPos.needsUpdate = true;
    P.geo.attributes.iCol.needsUpdate = true;
    P.geo.attributes.iSize.needsUpdate = true;
  }
  var F = Z.fireParts;
  if (F) {
    var fpa = F.geo.attributes.iPos.array,
      fsa = F.geo.attributes.iSize.array,
      fha = F.geo.attributes.iHeat.array,
      faa = F.geo.attributes.iAlpha.array;
    for (var f = 0; f < (F.activeN || F.n); f++) {
      if (F.life[f] <= 0) {
        if (fsa[f] !== 0) fsa[f] = 0;
        continue;
      }
      F.life[f] -= dt;
      if (F.life[f] <= 0) {
        fsa[f] = 0;
        continue;
      }
      var fk = F.life[f] / F.max[f];
      fpa[f * 3] += F.vx[f] * dt;
      fpa[f * 3 + 1] += F.vy[f] * dt;
      fpa[f * 3 + 2] += F.vz[f] * dt;
      // Hot fuel travels forward first; cooling fire curls upward and widens.
      F.vx[f] *= Math.max(0, 1 - dt * 1.9);
      F.vz[f] *= Math.max(0, 1 - dt * 1.9);
      F.vy[f] += 115 * dt;
      fsa[f] = F.s0[f] * (0.72 + (1 - fk) * 0.72);
      fha[f] = Math.max(0.05, F.heat0[f] * fk);
      faa[f] = Math.min(1, (1 - fk) * 5) * Math.min(1, fk * 3.2);
    }
    F.geo.attributes.iPos.needsUpdate = true;
    F.geo.attributes.iSize.needsUpdate = true;
    F.geo.attributes.iHeat.needsUpdate = true;
    F.geo.attributes.iAlpha.needsUpdate = true;
  }
  stepGibs(dt);
  var T = Z.tracers;
  if (T) {
    var live = false,
      tc = T.geo.attributes.color.array;
    for (var j = 0; j < T.n; j++) {
      if (T.life[j] <= 0) continue;
      T.life[j] -= dt;
      live = true;
      var kk = Math.max(0, T.life[j] / 0.09);
      tc[j * 6] = kk; tc[j * 6 + 1] = 0.85 * kk; tc[j * 6 + 2] = 0.45 * kk;
      tc[j * 6 + 3] = kk; tc[j * 6 + 4] = 0.6 * kk; tc[j * 6 + 5] = 0.2 * kk;
    }
    if (live) T.geo.attributes.color.needsUpdate = true;
  }
  // dust drifts and follows the player so the beam always has motes in it
  var M = Z.motes;
  if (M) {
    M.phase += dt * 0.35;
    var ma = M.geo.attributes.position.array,
      px = Z.p.x,
      pz = Z.p.z;
    for (var q = 0; q < (M.activeN || M.n); q++) {
      ma[q * 3 + 1] += Math.sin(M.phase + q) * 0.22;
      ma[q * 3] += Math.cos(M.phase * 0.7 + q * 0.3) * 0.16;
      var dx = ma[q * 3] - px,
        dz = ma[q * 3 + 2] - pz;
      if (dx > 620) ma[q * 3] -= 1240;
      else if (dx < -620) ma[q * 3] += 1240;
      if (dz > 620) ma[q * 3 + 2] -= 1240;
      else if (dz < -620) ma[q * 3 + 2] += 1240;
      if (ma[q * 3 + 1] > 265) ma[q * 3 + 1] = 4;
      else if (ma[q * 3 + 1] < 2) ma[q * 3 + 1] = 262;
    }
    M.geo.attributes.position.needsUpdate = true;
  }
  Z.shake = Math.max(0, Z.shake - dt * 2.6);
  Z.shakeV.x = (rnd() - 0.5) * Z.shake * 0.045;
  Z.shakeV.y = (rnd() - 0.5) * Z.shake * 0.045;
}

/* ===========================================================================
   4. HORROR GRADE — take over the lighting rig, keep the user's own lamps
   =========================================================================== */
/* Harvest the model's own lamps. They stay ON but become sick, low, flickery
   practicals: this is the "uses the lighting already in the model" bit.
   Split out of enterHorror because rebuild3D() (which destruction mode
   triggers to generate rigid bodies) replaces every light in `dyn` — the
   graded originals are gone and the fresh ones are at full planner brightness
   until they are re-harvested. */
export function harvestPracticals() {
  var dyn = getDynGroup();
  Z.lamps = [];
  if (dyn)
    dyn.traverse(function (o) {
      if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
        Z.lamps.push({
          l: o,
          i0: o.intensity,
          c0: o.color.getHex(),
          d0: o.distance,
          // most practicals are dying; a couple burn steady
          mode: rnd() < 0.28 ? "steady" : rnd() < 0.6 ? "flicker" : rnd() < 0.84 ? "strobe" : "dead",
          ph: rnd() * 10,
          out: 0,
        });
        o.color.setHex(rnd() < 0.28 ? 0xff4a28 : rnd() < 0.55 ? 0xffc878 : 0xa8c4ff);
        // practicals must not light the whole flat: short throw, low output,
        // so the flashlight stays the thing you actually see by
        var shrunk = Math.min(o.distance || 420, 460) * 0.58;
        // Shrinking `distance` used to dim a light everywhere, because the old
        // falloff was (1 - d/D)^n — D was part of the brightness. Physical
        // lights only use it as a hard cutoff, so the same line no longer dims
        // anything and the practicals blew out to white. Re-apply the dimming
        // the throw change used to imply, on top of the artistic 0.38.
        var throwK = o.distance > 0 ? Math.pow(shrunk / o.distance, o.decay || 2) : 1;
        o.distance = shrunk;
        o.intensity *= 0.38 * throwK;
        if (o.decay != null) o.decay = 2;
      }
    });
  Z.emissives = [];
  if (dyn)
    dyn.traverse(function (o) {
      if (o.isMesh && o.material && o.material.userData && o.material.userData.glow)
        Z.emissives.push({ m: o.material, e0: o.material.emissiveIntensity });
    });
}

/* The scene-level night grade. Split from enterHorror (which snapshots what it
   is overwriting) because rebuild3D() re-applies the planner's daylight
   environment — fog, background and exposure all come back, and the flat turns
   into an overcast afternoon mid-wave. Re-applying is safe; re-saving is not. */
export function applyHorrorGrade() {
  var scene = getMainScene(),
    ren = getRenderer(),
    rig = getRigLights();
  // pitch-black night with heavy exponential fog: in centimetres a density of
  // ~0.00085 means the far wall of a big room is already half-eaten.
  scene.fog = new THREE.FogExp2(0x03050a, 0.00095);
  scene.background = new THREE.Color(0x010205);
  ren.toneMappingExposure = 0.48;
  if (rig.sun) {
    rig.sun.intensity = LUX * 0.045;                 // cold moon wash
    rig.sun.color.setHex(0x7a92d4);
    rig.sun.castShadow = false;                // the flashlight owns shadows now
  }
  if (rig.hemi) {
    rig.hemi.intensity = LUX * 0.07;
    rig.hemi.color.setHex(0x1a2848);
    rig.hemi.groundColor.setHex(0x04050a);
  }
  if (rig.fill) {
    rig.fill.intensity = LUX * 0.04;
    rig.fill.color.setHex(0x3a5c88);
  }
  if (rig.stars) rig.stars.visible = true;
  scene.environment = null;                    // no soft IBL fill — pure dark
  // The gradient sky dome is an unlit, unfogged basic mesh, so none of the
  // above touches it — it stays a pale daylight backdrop behind every window.
  // That never showed before (you could not see out); now that there is a
  // world out there, it has to be night out there too.
  if (rig.sky && rig.sky.material) {
    rig.sky.material.color.setHex(0x0a1020);
    rig.sky.material.needsUpdate = true;
  }

}

export function enterHorror() {
  var scene = getMainScene(),
    ren = getRenderer(),
    rig = getRigLights(),
    dyn = getDynGroup();
  Z.saved = {
    fog: scene.fog,
    bg: scene.background,
    exposure: ren.toneMappingExposure,
    sunI: rig.sun ? rig.sun.intensity : 0,
    sunC: rig.sun ? rig.sun.color.getHex() : 0,
    sunShadow: rig.sun ? rig.sun.castShadow : false,
    hemiI: rig.hemi ? rig.hemi.intensity : 0,
    hemiSky: rig.hemi ? rig.hemi.color.getHex() : 0,
    hemiGnd: rig.hemi ? rig.hemi.groundColor.getHex() : 0,
    fillI: rig.fill ? rig.fill.intensity : 0,
    fillC: rig.fill ? rig.fill.color.getHex() : 0,
    starsVis: rig.stars ? rig.stars.visible : false,
    skyCol: rig.sky && rig.sky.material ? rig.sky.material.color.getHex() : null,
    env: scene.environment,
  };
  applyHorrorGrade();
  harvestPracticals();

  // moonlight shafts through exterior windows
  buildMoonBeams();
}

export function exitHorror() {
  var scene = getMainScene(),
    ren = getRenderer(),
    rig = getRigLights(),
    sv = Z.saved;
  if (!sv) return;
  scene.fog = sv.fog;
  scene.background = sv.bg;
  scene.environment = sv.env;
  ren.toneMappingExposure = sv.exposure;
  if (rig.sun) {
    rig.sun.intensity = sv.sunI;
    rig.sun.color.setHex(sv.sunC);
    rig.sun.castShadow = sv.sunShadow;
  }
  if (rig.hemi) {
    rig.hemi.intensity = sv.hemiI;
    rig.hemi.color.setHex(sv.hemiSky);
    rig.hemi.groundColor.setHex(sv.hemiGnd);
  }
  if (rig.fill) {
    rig.fill.intensity = sv.fillI;
    rig.fill.color.setHex(sv.fillC);
  }
  if (rig.stars) rig.stars.visible = sv.starsVis;
  if (rig.sky && rig.sky.material && sv.skyCol != null) {
    rig.sky.material.color.setHex(sv.skyCol);
    rig.sky.material.needsUpdate = true;
  }
  Z.lamps.forEach(function (L) {
    L.l.intensity = L.i0;
    L.l.color.setHex(L.c0);
    L.l.distance = L.d0;
  });
  (Z.emissives || []).forEach(function (E) {
    E.m.emissiveIntensity = E.e0;
  });
  Z.lamps = [];
  Z.emissives = [];
  clearMoonBeams();
  Z.saved = null;
  try {
    applyEnv();
  } catch (e) {}
}

export function buildMoonBeams() {
  clearMoonBeams();
  if (!Z.col || !Z.grp) return;
  var beams = [];
  Z.col.windows.forEach(function (w, i) {
    if (i > 3) return;
    var H = 520 + rr(0, 180),
      R = (w.w || 100) * 0.42;
    var cg = new THREE.ConeGeometry(R, H, 18, 1, true);
    cg.rotateX(-Math.PI / 2);
    // aim inward along window normal
    // TSL port (see the particle pools above — raw ShaderMaterial cannot run on
    // WebGPURenderer). uI stays a live uniform so stepMoonBeams can pulse it.
    var uI = uniform(0.55 + rnd() * 0.35);
    var mat = new THREE.NodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    mat.side = THREE.DoubleSide;
    mat.colorNode = Fn(function () {
      // The cone is rotated onto its side, so local -Z runs from its wide
      // window end to its tip. This avoids sampling a UV attribute that the
      // WebGPU node builder may not carry through an instanced render path.
      var beamU = positionLocal.z.negate().add(H / 2).div(H).clamp(0, 1);
      var a = beamU.oneMinus().pow(1.8).mul(0.09).mul(uI);
      return vec4(vec3(0.541, 0.651, 0.878).mul(a), a); // 0x8aa6e0
    })();
    mat.userData.uI = uI;
    var mesh = new THREE.Mesh(cg, mat);
    mesh.position.set(w.x + w.nx * (H * 0.35), (w.sill || 90) + (w.h || 120) * 0.35, w.z + w.nz * (H * 0.35));
    mesh.lookAt(w.x + w.nx * H, mesh.position.y - 40, w.z + w.nz * H);
    mesh.renderOrder = 1;
    Z.grp.add(mesh);
    beams.push({ mesh: mesh, light: null, ph: rnd() * 10 });
  });
  Z.moonBeams = beams;
}
export function clearMoonBeams() {
  if (!Z.moonBeams) return;
  Z.moonBeams.forEach(function (b) {
    if (b.mesh) {
      Z.grp && Z.grp.remove(b.mesh);
      b.mesh.geometry && b.mesh.geometry.dispose();
      b.mesh.material && b.mesh.material.dispose();
    }
    if (b.light) Z.grp && Z.grp.remove(b.light);
  });
  Z.moonBeams = null;
}
export function stepMoonBeams(dt) {
  if (!Z.moonBeams) return;
  Z.moonBeams.forEach(function (b) {
    b.ph += dt;
    var k = 0.85 + 0.15 * Math.sin(b.ph * 0.7 + Math.sin(b.ph * 0.21) * 2);
    // TSL uniform handles now live on material.userData (see buildMoonBeams)
    if (b.mesh && b.mesh.material.userData.uI) b.mesh.material.userData.uI.value = k;
    if (b.light) b.light.intensity = legacyIntensity(0.28 * k, b.light.distance);
  });
}

export function stepLamps(dt) {
  Z.lamps.forEach(function (L) {
    L.ph += dt;
    var k = 1;
    if (L.mode === "flicker") {
      // brown-out sag + occasional dropout
      k = 0.55 + 0.45 * Math.sin(L.ph * 7.3 + Math.sin(L.ph * 2.1) * 3);
      if (L.out > 0) {
        L.out -= dt;
        k = 0.04;
      } else if (rnd() < dt * 0.5) L.out = rr(0.05, 0.35);
    } else if (L.mode === "strobe") {
      k = ((L.ph * 11) | 0) % 3 === 0 ? 1.25 : 0.12;
      if (rnd() < dt * 0.2) L.ph += rr(0.2, 0.7);
    } else if (L.mode === "dead") {
      // busted fitting: dark, with the odd arc-spark that lights the room for
      // a single frame — the cheapest jump-scare in the building
      k = 0;
      if (rnd() < dt * 0.35) k = rr(1.6, 3);
    } else {
      k = 0.86 + 0.14 * Math.sin(L.ph * 1.7);
    }
    // the model's own lamps stay recognisable but never light the whole flat
    L.l.intensity = L.i0 * 0.3 * k;
  });
  // wave-danger red pulse on the practicals when a horde is closing
  if (Z.wave && Z.wave.state === "fight" && Z.zeds.length) {
    var near = 1e9;
    for (var i = 0; i < Z.zeds.length; i++)
      if (!Z.zeds[i].dead) near = Math.min(near, Z.zeds[i].dist);
    if (near < 320) {
      var pulse = 0.5 + 0.5 * Math.sin(Z.t * 6);
      Z.lamps.forEach(function (L) {
        L.l.color.setRGB(1, 0.42 - 0.2 * pulse, 0.22 - 0.14 * pulse);
      });
    }
  }
}

/* ---- flashlight: shadow-casting spot + volumetric cone + dying battery ---- */
export function buildFlashlight() {
  var cam = getMainCamera();
  var sp = new THREE.SpotLight(0xfff2dc, FLASH_I, 1950, 0.4, 0.62, FLASH_DECAY);
  var quality = Z.renderQuality == null ? 0 : Z.renderQuality;
  sp.castShadow = quality > 0;
  var shadowSize = quality === 2 ? 1536 : quality === 1 ? 1024 : 512;
  sp.shadow.mapSize.set(shadowSize, shadowSize);
  sp.shadow.camera.near = 5;
  sp.shadow.camera.far = 2000;
  sp.shadow.bias = -0.0012;
  sp.shadow.normalBias = 1.8;
  sp.shadow.radius = 2.5;
  sp.position.set(8, -6, 1);
  var tgt = new THREE.Object3D();
  tgt.position.set(0, 0, -1000);
  cam.add(sp);
  cam.add(tgt);
  sp.target = tgt;

  // warm fill just in front of the lens so nearby geometry reads
  var fill = new THREE.PointLight(0xffe8c8, legacyIntensity(0.55, 140), 140, 2);
  fill.position.set(6, -5, -18);
  cam.add(fill);

  // volumetric cone: apex at the lens, additive, soft falloff + dust noise
  var H = 1600,
    Rr = H * Math.tan(0.42);
  var cg = new THREE.ConeGeometry(Rr, H, 36, 1, true);
  cg.rotateX(Math.PI / 2);
  cg.translate(0, 0, -H / 2);
  // TSL port of the volumetric flashlight cone. uI (dip/flicker) and uT (dust
  // drift) stay live uniforms — stepFlashlight writes them every frame.
  var uH = uniform(H), uI = uniform(1), uT = uniform(0);
  var cm = new THREE.NodeMaterial();
  cm.transparent = true;
  cm.depthWrite = false;
  cm.blending = THREE.AdditiveBlending;
  cm.side = THREE.DoubleSide;
  cm.colorNode = Fn(function () {
    var vP = positionLocal;
    var u = vP.z.negate().div(uH).clamp(0, 1);
    var rad = vP.xy.length().div(uH.mul(0.42).mul(u).add(1).max(0.001));
    var edge = smoothstep(0.35, 1.0, rad).oneMinus();
    // cheap value hash, same as the GLSL original
    var h = sin(vP.xy.mul(0.1).add(uT.mul(0.15)).dot(vec2(127.1, 311.7))).mul(43758.5453).fract();
    var dust = h.mul(0.15).add(0.85);
    var a = u.oneMinus().pow(2.1).mul(smoothstep(0.0, 0.07, u)).mul(0.175).mul(uI).mul(edge).mul(dust);
    var c = mix(vec3(1.0, 0.95, 0.82), vec3(0.65, 0.74, 1.0), u.mul(u));
    return vec4(c.mul(a), a);
  })();
  cm.userData.uI = uI;
  cm.userData.uT = uT;
  var cone = new THREE.Mesh(cg, cm);
  cone.position.set(8, -6, 0);
  cone.renderOrder = 2;
  cone.frustumCulled = false;
  cam.add(cone);

  Z.flash = {
    sp: sp, fill: fill, cone: cone, mat: cm, on: true, batt: 100, flick: 0, dip: 0,
    volumetric: quality > 0,
  };
  cone.visible = Z.flash.volumetric;
}

export function stepFlashlight(dt) {
  var F = Z.flash;
  if (!F) return;
  if (F.on) F.batt = Math.max(0, F.batt - dt * 0.72);
  else F.batt = Math.min(100, F.batt + dt * 0.75);   // resting recovers a little
  var live = F.on && F.batt > 0;
  if (!live && F.on && F.batt <= 0) {
    F.on = false;
    hooks.say && hooks.say(t("z_flash_dead"), 1.6);
    hooks.sndClick && hooks.sndClick();
  }
  var k = live ? 1 : 0;
  if (live) {
    // low battery = stutter; getting hit = a hard dip
    var lowK = F.batt < 26 ? 1 : 0;
    F.flick += dt;
    if (lowK && rnd() < dt * 3.2) F.dip = rr(0.05, 0.28);
    if (F.dip > 0) {
      F.dip -= dt;
      k = 0.1;
    } else k = 1 - lowK * 0.25 * (0.5 + 0.5 * Math.sin(F.flick * 21));
    // slight aim sway on the cone
    if (F.cone) {
      F.cone.rotation.z = Math.sin(Z.t * 1.7) * 0.008;
      F.cone.rotation.x = Math.sin(Z.t * 1.1) * 0.006;
    }
  }
  F.sp.intensity = FLASH_I * k;
  if (F.fill) F.fill.intensity = legacyIntensity(0.55, 140) * k;
  F.mat.userData.uI.value = k;
  if (F.mat.userData.uT) F.mat.userData.uT.value = Z.t;
  F.cone.visible = F.volumetric && k > 0.02;
}

/* ===========================================================================
   5. ZOMBIES — procedural bodies, shambling animation, dismemberment, AI
   =========================================================================== */
var Zmat = { flesh: [], pretty: [], cloth: {}, stump: null, eye: null, bone: null, eyeGlow: {}, lip: null, hair: {} };
export function fleshMat(i) {
  var s = FLESH_SKINS[i % FLESH_SKINS.length];
  if (!Zmat.flesh[i])
    Zmat.flesh[i] = new THREE.MeshStandardMaterial({
      map: TEX.fleshMap,
      normalMap: TEX.fleshNorm || null,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: TEX.fleshRough || null,
      color: s.tint,
      roughness: s.rough,
      metalness: 0.02,
      envMapIntensity: 0.15,
    });
  return Zmat.flesh[i];
}
// Smooth attractive skin — used for the exposed skin under the clothing.
export function prettyMat(i) {
  ensureTex();
  var s = PRETTY_SKINS[i % PRETTY_SKINS.length];
  if (!Zmat.pretty[i])
    Zmat.pretty[i] = new THREE.MeshStandardMaterial({
      map: TEX.prettyMap,
      normalMap: TEX.prettyNorm || null,
      // pores and fine wrinkles only; a hard normal turns skin into orange peel
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: TEX.prettyRough || null,
      color: s.tint,
      roughness: s.rough,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
  return Zmat.pretty[i];
}
export function lipMat() {
  if (!Zmat.lip)
    Zmat.lip = new THREE.MeshStandardMaterial({
      color: 0xa03038,
      roughness: 0.35,
      metalness: 0.08,
      emissive: 0x200408,
      emissiveIntensity: 0.15,
    });
  return Zmat.lip;
}
export function hairMat(hex) {
  if (!Zmat.hair[hex])
    Zmat.hair[hex] = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.55,
      metalness: 0.12,
      envMapIntensity: 0.4,
    });
  return Zmat.hair[hex];
}
export function clothMat(hex) {
  if (!Zmat.cloth[hex])
    Zmat.cloth[hex] = new THREE.MeshStandardMaterial({
      map: TEX.cloth,
      normalMap: TEX.clothNorm || null,
      normalScale: new THREE.Vector2(0.9, 0.9),
      color: hex,
      roughness: 0.92,
      metalness: 0.04,
      envMapIntensity: 0.1,
    });
  return Zmat.cloth[hex];
}
export function stumpMat() {
  if (!Zmat.stump)
    Zmat.stump = new THREE.MeshStandardMaterial({
      color: 0x5e0a10,
      roughness: 0.38,
      metalness: 0.05,
      emissive: 0x2a0508,
      emissiveIntensity: 0.35,
    });
  return Zmat.stump;
}
export function boneMat() {
  if (!Zmat.bone)
    Zmat.bone = new THREE.MeshStandardMaterial({
      color: 0xc8bba0,
      roughness: 0.55,
      metalness: 0.05,
    });
  return Zmat.bone;
}
export function eyeMat(hex) {
  var c = hex || 0xff3a10;
  if (!Zmat.eyeGlow[c])
    Zmat.eyeGlow[c] = new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  return Zmat.eyeGlow[c];
}

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
var GEO_STEP = Math.log(1.04);   // ~4% relative buckets
function q(v) {
  if (!v) return 0;
  var s = v < 0 ? -1 : 1,
    a = Math.abs(v);
  // below half a centimetre the relative step is finer than the eye or the
  // renderer cares about; snap those to a flat 0.05cm grid instead
  if (a < 0.5) return s * (Math.round(a * 20) / 20);
  return s * Math.round(Math.exp(Math.round(Math.log(a) / GEO_STEP) * GEO_STEP) * 100) / 100;
}
function sharedGeo(key, make) {
  var g = GEO[key];
  if (!g) {
    g = GEO[key] = make();
    g.userData.shared = true;
  }
  return g;
}
/* Build (and throw away) one rig of each type so the geometry, material and
   texture caches are hot before the first wave. The first rig of a run costs
   ~30ms and the next few ~8ms each, all of it cache misses.  This used to run
   all types synchronously just after opening the mode: the briefing could not
   paint until that work completed, which made every launch feel like a stall.
   One type per idle turn lets the paused briefing appear immediately while
   retaining the warm caches for players who take a moment to read it. */
var prewarmRun = 0;
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
    ["cloth", "eyeGlow", "hair"].forEach(function (g) {
      for (var k in Zmat[g]) keep.add(Zmat[g][k]);
    });
    ["stump", "eye", "bone", "lip"].forEach(function (k) {
      if (Zmat[k]) keep.add(Zmat[k]);
    });
    mats.forEach(function (m) {
      if (!keep.has(m)) m.dispose();
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

export function clearZedGeoCache() {
  prewarmRun++;
  for (var k in GEO) GEO[k].dispose();
  GEO = {};
}
// true when the holder owns this geometry outright and may dispose it;
// false for cache-shared body parts, which only clearZedGeoCache() frees
export function ownsGeo(geo) {
  return !!(geo && !(geo.userData && geo.userData.shared));
}

export function bx(parent, w, h, d, x, y, z, mat, part) {
  var m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  parent.add(m);
  return m;
}
function boxGeo(w, h, d) {
  w = q(w); h = q(h); d = q(d);
  return sharedGeo("b" + w + "," + h + "," + d, function () {
    return new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  });
}
function cylGeo(r1, r2, h, segs, open) {
  r1 = q(r1); r2 = q(r2); h = q(h);
  return sharedGeo("c" + r1 + "," + r2 + "," + h + "," + segs + (open ? "o" : ""), function () {
    return new THREE.CylinderGeometry(r1, r2, h, segs, 1, !!open);
  });
}
function sphGeo(r, w, h) {
  r = q(r);
  return sharedGeo("s" + r + "," + w + "," + h, function () {
    return new THREE.SphereGeometry(r, w, h);
  });
}

export function cy(parent, r1, r2, h, x, y, z, mat, part, segs) {
  var m = new THREE.Mesh(cylGeo(r1, r2, h, segs || 12), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  parent.add(m);
  return m;
}
export function sp(parent, r, x, y, z, mat, part, segs) {
  var m = new THREE.Mesh(sphGeo(r, segs || 14, segs ? segs - 2 : 12), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  parent.add(m);
  return m;
}

export var Z_TYPES = {
  walker: { hp: 105, spd: 72, dmg: 12, scale: 1.0, rate: 1.1, w: 58, eye: 0xff3a10 },
  runner: { hp: 68, spd: 228, dmg: 10, scale: 0.92, rate: 0.62, w: 20, eye: 0xffaa22 },
  brute: { hp: 380, spd: 70, dmg: 30, scale: 1.34, rate: 1.65, w: 9, eye: 0xff1020 },
  crawler: { hp: 58, spd: 105, dmg: 9, scale: 0.9, rate: 0.85, w: 9, eye: 0xcc2208 },
  screamer: { hp: 85, spd: 118, dmg: 7, scale: 0.96, rate: 1.15, w: 7, eye: 0xaa44ff },
  bloater: { hp: 180, spd: 64, dmg: 16, scale: 1.25, rate: 1.4, w: 10, eye: 0x55ff22, toxic: true },
};
var CLOTHES = [0x2c3540, 0x3d3126, 0x4a2530, 0x27343a, 0x554b3a, 0x1f2b23, 0x413040, 0x2a2a32];
var HAIR_COLS = [
  0x1a0a08, 0x2c1810, 0x3d2214, 0x5c3a1e, 0x8b5a2b, 0xc4a070,
  0xd8b090, 0x4a1020, 0x6b2038, 0x1a1a22, 0x2a3040, 0xe8d0b0,
];

function makeClothLayer(base, accent, style, layer, female) {
  var kind;
  if (layer === "pants") {
    kind = "denim";
  } else if (layer === "coat") {
    kind = style % 2 === 0 ? "leather" : "camo";
  } else {
    if (female) {
      kind = style % 2 === 0 ? "floral" : "knit";
    } else {
      kind = style % 3 === 0 ? "plaid" : style % 3 === 1 ? "knit" : "camo";
    }
  }
  var leather = kind === "leather";

  var mat = new THREE.MeshStandardMaterial({
    map: TEX.clothes[kind],
    // The weave is the whole point of these photos and it was being thrown
    // away: at repeat 2 over a torso, colour alone cannot tell denim from
    // knitwear under a flashlight. Leather is smoother than it is bumpy, so
    // it leans on roughness while knit and camo lean on the normal.
    normalMap: (TEX.clothesNorm && TEX.clothesNorm[kind]) || null,
    normalScale: new THREE.Vector2(leather ? 0.6 : 1, leather ? 0.6 : 1),
    color: base,
    roughness: leather ? 0.4 : 0.88,
    metalness: leather ? 0.1 : 0.02,
    side: THREE.DoubleSide,
    envMapIntensity: 0.12,
  });
  return { mat: mat, layer: layer, damage: 0 };
}

function addClothMesh(parent, geometry, layer, part, list, layerName, sway) {
  var mesh = new THREE.Mesh(geometry, layer.mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.part = part || "body";
  mesh.userData.cloth = true;
  mesh.userData.clothLayer = layerName;
  mesh.userData.clothSway = sway || 1;
  mesh.userData.clothBaseRX = mesh.rotation.x;
  mesh.userData.clothBaseRY = mesh.rotation.y;
  mesh.userData.clothBaseRZ = mesh.rotation.z;
  parent.add(mesh);
  list.push(mesh);
  return mesh;
}

// A two-joint fabric strip is much cheaper than cloth simulation, yet it
// gives loose hems and coats a convincing delayed follow-through. The root is
// parented to the same body joint as the garment, while the two segments are
// animated independently in applyJiggle().
function addClothFlap(parent, width, height, x, y, z, layer, part, list, flaps, sway) {
  var root = new THREE.Group();
  root.position.set(x, y, z);
  root.userData.cloth = true;
  root.userData.clothLayer = layer.layer;
  root.userData.part = part || "body";
  parent.add(root);

  var upper = new THREE.Group();
  root.add(upper);
  var upperMesh = addClothMesh(
    upper, boxGeo(width, height * 0.52, 1.35), layer, part, list, layer.layer, sway
  );
  upperMesh.position.y = -height * 0.26;

  var lower = new THREE.Group();
  lower.position.y = -height * 0.52;
  upper.add(lower);
  var lowerMesh = addClothMesh(
    lower, boxGeo(width * 0.94, height * 0.48, 1.18), layer, part, list, layer.layer, sway * 1.25
  );
  lowerMesh.position.y = -height * 0.24;

  var flap = {
    root: root, upper: upper, lower: lower,
    sway: sway || 1, phase: rnd() * 6.28,
    // Longer panels carry more momentum; left/right coat tails get opposite
    // torsion while turning. These are scalars only—no extra bones or meshes.
    drag: clamp(height / 30, 0.45, 1.25),
    side: x < -0.5 ? -1 : x > 0.5 ? 1 : 0,
    upperX: 0, upperY: 0, upperZ: 0, lowerX: 0, lowerY: 0, lowerZ: 0,
    upperVX: 0, upperVY: 0, upperVZ: 0, lowerVX: 0, lowerVY: 0, lowerVZ: 0,
  };
  flaps.push(flap);
  return flap;
}

// Clothing is made from thin moving shells attached to the same shoulder/hip
// groups as the body.  This means the fabric inherits every step, stagger and
// death pose, while the small sway pass below gives loose layers their own lag.
function buildClothes(torso, legL, legR, armL, armR, p) {
  var bulk = p.bulk,
    hipW = p.hipW,
    chestW = p.chestW,
    waist = p.waist,
    lean = p.lean,
    legLen = p.legLen,
    type = p.type,
    female = p.female,
    clothes = [],
    flaps = [],
    layers = {};
  var palettes = [
    [0x283647, 0x9b5a45], [0x44352d, 0xbca46c], [0x3b2938, 0x8d556d],
    [0x243b35, 0x8ba07c], [0x4b4640, 0xb7aa91], [0x252832, 0x697d9c],
  ];
  var idx = (rnd() * palettes.length) | 0;
  var pal = palettes[idx];
  layers.shirt = makeClothLayer(pal[0], pal[1], (idx + 1) % 3, "shirt", female);
  layers.pants = makeClothLayer(pick(CLOTHES), pal[1], (idx + 2) % 3, "pants", female);
  layers.sleeve = makeClothLayer(pal[0], pal[1], (idx + 3) % 3, "sleeve", female);
  layers.coat = makeClothLayer(pal[1], pal[0], (idx + 4) % 3, "coat", female);

  var shirt = cylGeo(
    15.2 * bulk * chestW * 1.08,
    12.8 * bulk * waist * 1.10,
    type === "brute" ? 53 : 49,
    18, true
  );
  var shirtMesh = addClothMesh(torso, shirt, layers.shirt, "body", clothes, "shirt", 0.75);
  shirtMesh.position.set(0, 31, 0);
  shirtMesh.scale.z = female ? 1.24 : 1.08;
  shirtMesh.userData.clothLayerRef = layers.shirt;

  var shorts = cylGeo(
    17.0 * bulk * hipW,
    13.2 * bulk * waist,
    female ? 22 : 19,
    18, true
  );
  var shortMesh = addClothMesh(torso, shorts, layers.pants, "body", clothes, "pants", 0.65);
  shortMesh.position.set(0, 4, 0);
  shortMesh.userData.clothLayerRef = layers.pants;

  function legCloth(leg) {
    if (!leg || !leg.hip) return;
    var thigh = cylGeo(10.0 * bulk, 8.2 * bulk, 45 * lean * legLen, 14, true);
    var tm = addClothMesh(leg.hip, thigh, layers.pants, "limb", clothes, "pants", 0.9);
    tm.position.y = -23 * lean * legLen;
    tm.userData.clothLayerRef = layers.pants;
    if (leg.knee) {
      var shin = cylGeo(7.0 * bulk, 5.8 * bulk, 43 * lean * legLen, 14, true);
      var sm = addClothMesh(leg.knee, shin, layers.pants, "limb", clothes, "pants", 1.05);
      sm.position.y = -22 * lean * legLen;
      sm.userData.clothLayerRef = layers.pants;
    }
  }
  legCloth(legL);
  legCloth(legR);

  function armCloth(arm) {
    if (!arm || !arm.sh) return;
    var upper = cylGeo(6.7 * bulk, 5.6 * bulk, 36, 14, true);
    var um = addClothMesh(arm.sh, upper, layers.sleeve, "limb", clothes, "sleeve", 1.1);
    um.position.y = -18;
    um.userData.clothLayerRef = layers.sleeve;
    if (arm.el) {
      var fore = cylGeo(5.9 * bulk, 4.8 * bulk, 34, 14, true);
      var fm = addClothMesh(arm.el, fore, layers.sleeve, "limb", clothes, "sleeve", 1.25);
      fm.position.y = -17;
      fm.userData.clothLayerRef = layers.sleeve;
    }
  }
  armCloth(armL);
  armCloth(armR);

  // Separate articulated hems make the clothing visibly lag behind the body.
  // They inherit torso motion first, then sway on their own two lightweight
  // joints. Splitting at the centre keeps a tear from looking like a decal on
  // a rigid postcard.
  if (type !== "crawler") {
    var coatChance = type === "brute" ? 0.9 : 0.72;
    if (rnd() < coatChance) {
      addClothFlap(torso, 12.5 * bulk * chestW, 31, -7.0 * bulk, 39, -14.8 * bulk, layers.coat, "body", clothes, flaps, 1.55);
      addClothFlap(torso, 12.5 * bulk * chestW, 31, 7.0 * bulk, 39, -14.8 * bulk, layers.coat, "body", clothes, flaps, 1.55);
    }
    // A short split shirt hem is present on every standing zombie, so the
    // layered-body system remains legible even when this spawn has no coat.
    addClothFlap(torso, 10.5 * bulk * waist, 13, 0, 12, 13.2 * bulk, layers.shirt, "body", clothes, flaps, 0.82);
  }
  return { meshes: clothes, flaps: flaps, layers: layers, palette: idx };
}

// Shaded-in skin for the parts that sit in a crease or catch less light.
function softenSkin(m) {
  m.color.multiplyScalar(0.92);
  m.roughness = Math.min(1, m.roughness + 0.06);
  return m;
}

// Higher-segment body parts for smoother curves
function spH(parent, r, x, y, z, mat, part) {
  return sp(parent, r, x, y, z, mat, part, 18);
}
function cyH(parent, r1, r2, h, x, y, z, mat, part) {
  return cy(parent, r1, r2, h, x, y, z, mat, part, 16);
}

// Hair is kept separate from the head mesh. Each lock has an anchor plus two
// articulated segments, making it follow head turns while retaining a small
// physical delay. This is deliberately a transform-only rig: dozens of
// zombies can use it without the cost of skinning or a cloth solver.
function addHairLock(parent, x, y, z, length, radius, mat, phase) {
  var anchor = new THREE.Group();
  anchor.position.set(x, y, z);
  parent.add(anchor);

  var upper = new THREE.Group();
  anchor.add(upper);
  var upperMesh = cyH(upper, radius, radius * 0.78, length * 0.56, 0, -length * 0.28, 0, mat, "head");
  upperMesh.userData.hair = true;

  var lower = new THREE.Group();
  lower.position.y = -length * 0.55;
  upper.add(lower);
  var lowerMesh = cyH(lower, radius * 0.8, radius * 0.34, length * 0.48, 0, -length * 0.24, 0, mat, "head");
  lowerMesh.userData.hair = true;

  return {
    anchor: anchor, upper: upper, lower: lower, phase: phase || 0,
    upperX: 0, upperZ: 0, lowerX: 0, lowerZ: 0,
    upperVX: 0, upperVZ: 0, lowerVX: 0, lowerVZ: 0,
  };
}

// Night Shift 21+: clothed undead with layered, damageable textiles.
export function buildZombie(type) {
  ensureTex();
  var T = Z_TYPES[type] || Z_TYPES.walker,
    root = new THREE.Group(),
    // fewer "pretty" skins; mix rot back in
    usePretty = type !== "brute" && type !== "crawler" ? rnd() < 0.42 : rnd() < 0.12,
    pi = (rnd() * PRETTY_SKINS.length) | 0,
    fi = (rnd() * FLESH_SKINS.length) | 0,
    fm = (usePretty ? prettyMat(pi) : fleshMat(fi)).clone(),
    // The soft material dresses cheeks, knees and creases on the SAME body,
    // so it is a nudge off this zombie's skin — not the next entry in the
    // palette, which now that the palette actually differs would have given
    // one undead a green torso and jaundiced limbs.
    fmSoft = softenSkin(fm.clone()),
    // more bruised / sickly accents
    accent = new THREE.MeshStandardMaterial({
      color: usePretty ? 0xa84850 : 0x6a3030,
      roughness: 0.62,
      metalness: 0.04,
      map: usePretty ? TEX.prettyMap : TEX.fleshMap,
      normalMap: (usePretty ? TEX.prettyNorm : TEX.fleshNorm) || null,
      normalScale: new THREE.Vector2(0.5, 0.5),
    }),
    cm = clothMat(pick(CLOTHES)),
    sc = T.scale * rr(0.94, 1.06),
    bulk = type === "brute" ? 1.2 : type === "bloater" ? 1.45 : type === "runner" ? 0.9 : 1,
    lean = type === "runner" ? 1.05 : 1,
    // balanced gender, less glam bias
    female =
      type === "screamer" ? rnd() < 0.7 :
      type === "brute" ? rnd() < 0.25 :
      type === "runner" ? rnd() < 0.5 :
      rnd() < 0.48,
    rags = rnd() < 0.28;

  // more natural / less exaggerated proportions
  var hipW = female ? rr(1.08, 1.2) : rr(0.98, 1.08),
    chestW = female ? rr(1.02, 1.12) : type === "brute" ? 1.22 : 1.06,
    waist = female ? rr(0.82, 0.92) : rr(0.92, 1.02),
    shoulder = female ? rr(0.9, 0.98) : type === "brute" ? 1.18 : 1.05,
    legLen = female ? 1.02 : 1.0;

  var body = new THREE.Group();
  root.add(body);

  // --- long smooth legs
  // --- long smooth legs
  function leg(sx) {
    var hip = new THREE.Group();
    hip.position.set(sx * 10.5 * bulk * hipW, 86, 0);
    var thighR = (female ? 9.2 : 8.6) * bulk;
    cyH(hip, thighR, thighR * 0.78, 46 * lean * legLen, 0, -23 * lean * legLen, 0, fm, "limb");
    // full outer thigh + hip curve
    spH(hip, thighR * 0.85, sx * 3.2, -4, -2, fm, "limb").scale.set(1.25, 1.45, 1.2);
    // inner thigh soft
    spH(hip, thighR * 0.45, -sx * 2.5, -14, 2, fmSoft, "limb").scale.set(0.9, 1.4, 1.0);
    var knee = new THREE.Group();
    knee.position.set(0, -46 * lean * legLen, 0);
    cyH(knee, 6.4 * bulk, 5.2 * bulk, 44 * lean * legLen, 0, -22 * lean * legLen, 0, fm, "limb");
    spH(knee, 5.0 * bulk, 0, -2, 2.5, fmSoft, "limb");
    // elegant foot
    var foot = spH(knee, 5.5 * bulk, 0, -44 * lean * legLen, 8, fm, "limb");
    foot.scale.set(0.85, 0.55, 1.55);
    bx(knee, 10 * bulk, 4.5, 20, 0, -45 * lean * legLen, 10, fm, "limb");
    // combined toes box
    bx(knee, 9.2 * bulk, 3.6, 6.5, 0, -46 * lean * legLen, 19, fm, "limb");
    hip.add(knee);
    body.add(hip);
    return { hip: hip, knee: knee };
  }
  var legL = leg(-1),
    legR = leg(1);

  // --- hourglass torso
  var torso = new THREE.Group();
  torso.position.set(0, 86, 0);
  body.add(torso);

  // wide hips
  cyH(torso, 15.5 * bulk * hipW, 12 * bulk * waist, 16, 0, 7, 0, fm, "body");
  // plump glutes (jiggle targets)
  var buttS = (female ? 10.2 : 9.0) * bulk * hipW;
  var buttL = spH(torso, buttS, -7.2 * hipW, 5, -9, fm, "body");
  buttL.scale.set(1.15, 1.25, 1.2);
  buttL.userData.baseSX = 1.15;
  buttL.userData.baseSY = 1.25;
  buttL.userData.baseSZ = 1.2;
  var buttR = spH(torso, buttS, 7.2 * hipW, 5, -9, fm, "body");
  buttR.scale.set(1.15, 1.25, 1.2);
  buttR.userData.baseSX = 1.15;
  buttR.userData.baseSY = 1.25;
  buttR.userData.baseSZ = 1.2;
  // soft lower back dimples
  if (female) {
    spH(torso, 2.2, -3, 14, -10, fmSoft, "body");
    spH(torso, 2.2, 3, 14, -10, fmSoft, "body");
  }

  // cinched waist
  cyH(torso, 11.5 * bulk * waist, 13.5 * bulk * chestW, 20, 0, 24, 1, fm, "body");
  // soft belly (female slight curve, not wound)
  spH(torso, 8 * waist * bulk, 0, 22, 7, fmSoft, "body").scale.set(1.15, 0.9, 0.85);

  // upper chest
  cyH(torso, 14.5 * bulk * chestW, 13 * bulk * shoulder, 26, 0, 46, 0, fm, "body");

  // --- breasts / pecs (groups stored for jiggle)
  var breastL = null,
    breastR = null,
    hairLocks = [];
  if (female) {
    var bSize = type === "brute" ? 11.5 : type === "runner" ? rr(9, 11) : rr(9.5, 12);
    var bY = 50,
      bZ = 10,
      bSpread = 7.6 * chestW;
    // streamlined teardrop breast shape
    function breast(sx) {
      var g = new THREE.Group();
      g.position.set(sx * bSpread, bY, bZ);
      g.userData.baseY = bY;
      g.userData.baseZ = bZ;
      g.userData.baseX = sx * bSpread;
      g.userData.jiggle = 0;
      torso.add(g);
      var main = new THREE.Mesh(sphGeo(bSize, 14, 12), fm);
      main.scale.set(1.02, 1.08, 1.15);
      main.position.set(0, -1.5, 0);
      main.castShadow = true;
      main.userData.part = "body";
      g.add(main);
      // areola + nipple
      var nip = new THREE.Mesh(sphGeo(2.4, 10, 8), accent);
      nip.scale.set(1, 1, 0.8);
      nip.position.set(0, -0.6, bSize * 0.95);
      nip.userData.part = "body";
      g.add(nip);
      return g;
    }
    breastL = breast(-1);
    breastR = breast(1);
    spH(torso, 4, 0, bY - 2, bZ + 2, fmSoft, "body").scale.set(0.6, 1.2, 0.8);
  } else {
    // defined athletic pecs
    spH(torso, 10 * bulk, -8.5, 51, 8, fm, "body").scale.set(1.4, 0.9, 1.05);
    spH(torso, 10 * bulk, 8.5, 51, 8, fm, "body").scale.set(1.4, 0.9, 1.05);
    spH(torso, 2.0, -7, 49, 13.5, accent, "body");
    spH(torso, 2.0, 7, 49, 13.5, accent, "body");
    // abs suggestion
    for (var ab = 0; ab < 3; ab++) {
      spH(torso, 3.2, -3.5, 28 + ab * 7, 8, fmSoft, "body").scale.set(1.1, 0.7, 0.6);
      spH(torso, 3.2, 3.5, 28 + ab * 7, 8, fmSoft, "body").scale.set(1.1, 0.7, 0.6);
    }
  }

  // shoulders — smooth, no boxy pads
  spH(torso, 7.5 * bulk * shoulder, -18 * shoulder, 58, 0, fm, "body");
  spH(torso, 7.5 * bulk * shoulder, 18 * shoulder, 58, 0, fm, "body");
  cyH(torso, 4.5, 4.5, 34 * bulk * shoulder, 0, 60, -1, fm, "body").rotation.z = Math.PI / 2;

  // visible decay — wounds, ribs, gut
  if (rnd() < 0.7) {
    spH(torso, rr(4, 7), rr(-10, 10), rr(28, 52), rnd() < 0.5 ? 10 : -11, stumpMat(), "body");
  }
  if (rnd() < 0.55) {
    bx(torso, rr(8, 18), 1.4, 2.2, rr(-8, 8), rr(10, 40), 10, stumpMat(), "body").rotation.z = rr(-0.5, 0.5);
  }
  if (rnd() < 0.45) {
    for (var rb = 0; rb < 2; rb++) {
      var rib = cyH(torso, 1.0, 1.0, 16 - rb * 2, 0, 32 + rb * 6, 9, boneMat(), "body");
      rib.rotation.z = Math.PI / 2;
    }
    spH(torso, 6, 0, 22, 9, stumpMat(), "body");
  }

  // --- anatomy
  if (female) {
    var mons = spH(torso, 6.2 * hipW, 0, 1.5, 9, fmSoft, "body");
    mons.scale.set(1.15, 0.65, 0.9);
    spH(torso, 2.4, 0, 0.4, 12.5, accent, "body").scale.set(1.2, 1.3, 0.85);
  } else {
    var shaftLen = type === "brute" ? 16 : rr(12, 15);
    var gen = new THREE.Group();
    gen.position.set(0, 0.5, 9.5);
    torso.add(gen);
    var shaft = new THREE.Mesh(cylGeo(2.7, 2.3, shaftLen, 12), fmSoft);
    shaft.rotation.x = Math.PI / 2 + 0.28;
    shaft.position.set(0, -0.5, shaftLen * 0.38);
    shaft.castShadow = true;
    shaft.userData.part = "body";
    gen.add(shaft);
    var sac = new THREE.Mesh(sphGeo(4.8, 10, 8), fm);
    sac.position.set(0, -2.8, 1.2);
    sac.scale.set(1.4, 1.1, 1.0);
    sac.castShadow = true;
    sac.userData.part = "body";
    gen.add(sac);
  }

  if (rags && female) {
    var band = cyH(torso, 16 * hipW, 16 * hipW, 2.5, 0, 10, 0, cm, "body");
    band.scale.set(1, 1, 0.7);
  }

  // --- head
  var neck = new THREE.Group();
  neck.position.set(0, 61 + (type === "brute" ? 3 : 0), 1);
  torso.add(neck);
  cyH(neck, female ? 4.6 : 5.2, female ? 5.0 : 5.6, 12, 0, 6, 0, fm, "head");
  if (female) spH(neck, 3.2, 0, 2, 3, fmSoft, "head").scale.set(1.1, 1.4, 0.9);

  var head = new THREE.Group();
  head.position.set(0, 14, 0);
  neck.add(head);
  var skullR = type === "brute" ? 13 : female ? 10.8 : 11.6;
  var skull = spH(head, skullR, 0, 3.5, 0.5, fm, "head");
  skull.scale.set(female ? 0.92 : 1.0, female ? 1.18 : 1.12, female ? 1.0 : 1.06);
  spH(head, female ? 4.4 : 4.0, -5.5, 1.5, 4, fmSoft, "head");
  spH(head, female ? 4.4 : 4.0, 5.5, 1.5, 4, fmSoft, "head");
  spH(head, 2.0, 0, 2.5, 10, fm, "head").scale.set(0.75, 1.1, 1.3);
  var lips = bx(head, female ? 7.5 : 8, 2.4, 3.2, 0, -3.2, 9.5, lipMat(), "head");
  lips.scale.set(1, 0.85, 1);
  if (type === "screamer") {
    bx(head, 8, 3.5, 4, 0, -5.5, 8, fm, "head");
    for (var ti = 0; ti < 4; ti++)
      bx(head, 1.4, 2.6, 1.2, (ti - 1.5) * 2.2, -6.5, 10, boneMat(), "head");
  } else {
    bx(head, 5.5, 1.2, 1.5, 0, -4.2, 10.5, boneMat(), "head");
  }
  bx(head, 4.5, 1.0, 1.5, -4, 6.5, 8.5, hairMat(0x1a1010), "head").rotation.z = 0.15;
  bx(head, 4.5, 1.0, 1.5, 4, 6.5, 8.5, hairMat(0x1a1010), "head").rotation.z = -0.15;
  spH(head, 2.2, -10, 2.5, 0, fm, "head").scale.set(0.6, 1.1, 0.85);
  spH(head, 2.2, 10, 2.5, 0, fm, "head").scale.set(0.6, 1.1, 0.85);

  // hair
  var hCol = pick(HAIR_COLS);
  var hm = hairMat(hCol);
  var hairTop = spH(head, female ? 12.2 : 11.5, 0, 8, -2, hm, "head");
  hairTop.scale.set(1.12, female ? 1.0 : 0.75, 1.18);
  spH(head, 5, 0, 7, 8, hm, "head").scale.set(1.6, 0.55, 0.7);
  if (female) {
    for (var hk = 0; hk < 3; hk++) {
      var a = (hk / 2) * Math.PI * 1.1 - Math.PI * 0.55;
      var lock = addHairLock(
        head,
        Math.sin(a) * 8.2,
        rr(-1, 3),
        -4.5 + Math.cos(a) * 4.2,
        rr(26, 38),
        2.2,
        hm,
        hk * 1.1
      );
      lock.anchor.rotation.x = rr(0.45, 0.75);
      lock.anchor.rotation.z = Math.sin(a) * 0.35;
      hairLocks.push(lock);
    }
    spH(head, 6, -8, 4, -2, hm, "head").scale.set(0.9, 1.4, 1.1);
    spH(head, 6, 8, 4, -2, hm, "head").scale.set(0.9, 1.4, 1.1);
  } else if (rnd() < 0.62) {
    for (var mk = 0; mk < 2; mk++) {
      var shortLock = addHairLock(
        head, (mk - 0.5) * 6.5, rr(2, 5), rr(-4, -6), rr(10, 16), 1.35, hm, 4 + mk * 1.2
      );
      shortLock.anchor.rotation.x = rr(0.35, 0.55);
      shortLock.anchor.rotation.z = (mk - 0.5) * 0.15;
      hairLocks.push(shortLock);
    }
  }

  // glowing eyes
  var eyeCol = female
    ? pick([0xff6688, 0xff4466, 0xaa66ff, 0x66ccff, T.eye || 0xff3a10])
    : T.eye || 0xff3a10;
  var eL = sp(head, female ? 2.5 : 2.3, -4.2, 4.5, 9.8, eyeMat(eyeCol), "head", 10),
    eR = sp(head, female ? 2.5 : 2.3, 4.2, 4.5, 9.8, eyeMat(eyeCol), "head", 10);
  eL.castShadow = eR.castShadow = false;
  var gL = sp(head, 4.8, -4.2, 4.5, 9.4, eyeMat(eyeCol), "head", 8),
    gR = sp(head, 4.8, 4.2, 4.5, 9.4, eyeMat(eyeCol), "head", 8);
  gL.material = gL.material.clone();
  gR.material = gR.material.clone();
  gL.material.opacity = gR.material.opacity = 0.4;
  gL.castShadow = gR.castShadow = false;

  // --- slender / toned arms
  function arm(sx) {
    var sh = new THREE.Group();
    sh.position.set(sx * 19 * bulk * shoulder, 57, 0);
    var armR = (female ? 5.2 : 6.2) * bulk;
    cyH(sh, armR, armR * 0.85, 36, 0, -18, 0, fm, "limb");
    var el = new THREE.Group();
    el.position.set(0, -36, 0);
    cyH(el, armR * 0.85, armR * 0.7, 34, 0, -17, 0, fm, "limb");
    spH(el, armR * 0.75, 0, 0, 0, fmSoft, "limb");
    var hand = spH(el, 5.5 * bulk, 0, -34, 2, fm, "limb");
    hand.scale.set(0.95, 0.75, 1.2);
    // combined fingers & thumb box
    var fingers = bx(el, 7.5 * bulk, 7.0, 3.0, 0, -39, 4.5, fm, "limb");
    fingers.rotation.x = 0.2;
    var thumb = bx(el, 2.2, 4.5, 2.0, sx * 4.0, -35, 3.5, fm, "limb");
    thumb.rotation.z = sx * 0.45;
    sh.add(el);
    torso.add(sh);
    return { sh: sh, el: el, hand: hand };
  }
  var armL = arm(-1),
    armR = arm(1);

  var clothes = buildClothes(torso, legL, legR, armL, armR, {
    bulk: bulk,
    hipW: hipW,
    chestW: chestW,
    waist: waist,
    lean: lean,
    legLen: legLen,
    type: type,
    female: female,
  });

  if (type === "brute") {
    spH(torso, 12, -17, 55, 0, fm, "body");
    spH(torso, 12, 17, 55, 0, fm, "body");
  } else if (type === "screamer") {
    spH(neck, 5, 0, 3, 5, fmSoft, "body").scale.set(1, 1.2, 1.3);
  }

  // slightly taller elegant females
  root.scale.setScalar(sc * (female && type !== "brute" ? 1.02 : 1));
  root.userData.zed = true;
  root.userData.female = female;
  root.userData.nude = false;
  root.userData.clothed = true;
  root.userData.pretty = usePretty;

  // faint cold aura only — no hot-pink glam glow
  var aura = null;
  if (usePretty && rnd() < 0.35) {
    aura = new THREE.PointLight(0x8866aa, legacyIntensity(0.22, 160), 160, 2);
    aura.position.set(0, 100, 16);
    root.add(aura);
  }

  // Shadow trim. The flashlight is the only shadow caster left in the mode, and
  // it renders the whole rig a second time into a 1536² map every frame. Around
  // 50 of a rig's ~120 primitives are detail under 5cm — fingers, toes, teeth,
  // abs, dimples, hair locks — none of which resolve as a shadow from across a
  // room. Dropping them from the shadow pass costs nothing visible and takes
  // ~40% off the per-zombie shadow draw calls.
  root.traverse(function (o) {
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    var bs = o.geometry.boundingSphere;
    if (bs && bs.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < 5) o.castShadow = false;
  });

  // fewer sirens; still a light distraction pull
  var siren = !!(female && usePretty && type !== "brute" && rnd() < 0.28);

  return {
    root: root,
    body: body,
    torso: torso,
    head: head,
    neck: neck,
    skull: skull,
    eyes: [eL, eR, gL, gR],
    rim: null,
    aura: aura,
    breastL: breastL,
    breastR: breastR,
    buttL: buttL,
    buttR: buttR,
    hairLocks: hairLocks,
    legL: legL,
    legR: legR,
    armL: armL,
    armR: armR,
    clothes: clothes,
    fleshMat: fm,
    fleshSoftMat: fmSoft,
    skinDamage: 0,
    scale: sc,
    type: type,
    female: female,
    nude: false,
    clothed: true,
    pretty: usePretty,
    siren: siren,
    distract: female && usePretty ? rr(0.35, 0.7) : female ? 0.25 : 0.12,
  };
}

export function spawnZed(type, x, z) {
  ensureTex();
  var T = Z_TYPES[type],
    rig = buildZombie(type);
  var spot = freeSpot(x, z, 22);
  var z0 = {
    type: type,
    female: !!(rig && rig.female),
    nude: false,
    clothed: true,
    pretty: !!(rig && rig.pretty),
    siren: !!(rig && rig.siren),
    distract: (rig && rig.distract) || 0.2,
    teaseT: 0,
    jiggle: 0,
    rig: rig,
    root: rig.root,
    x: spot.x,
    z: spot.z,
    y: 0,
    vy: 0,
    hp: T.hp * rr(0.9, 1.15) * (1 + (Z.wave.n - 1) * 0.09),
    maxHp: T.hp,
    spd: T.spd * rr(0.88, 1.14),
    dmg: T.dmg,
    rate: T.rate,
    head: 0,
    state: "idle",
    phase: rnd() * 10,
    stagger: 0,
    windup: 0,
    cool: 0,
    dead: false,
    deadT: 0,
    dist: 1e9,
    crawler: type === "crawler",
    limbs: { armL: true, armR: true, legL: true, legR: true, head: true },
    limbDmg: { armL: 0, armR: 0, legL: 0, legR: 0, head: 0 },
    clothDamage: 0,
    clothTears: [],
    skinWounds: [],
    growlT: rr(0.5, 4),
    alerted: false,
    wander: { x: spot.x, z: spot.z, t: 0 },
    feel: 0,
    grabT: 0,
    grabbing: false,
    hitFlash: 0,
    flankSign: rnd() < 0.5 ? -1 : 1,
    burstT: null,
    crowdT: rnd() * 0.12,
    frontCount: 0,
    sepT: rnd() * 0.06,
    doorT: rnd() * 0.16,
    animT: 0,
  };
  if (z0.crawler) {
    // legs already gone: drag along on the elbows
    if (rig.legL && rig.legL.hip) rig.legL.hip.visible = false;
    if (rig.legR && rig.legR.hip) rig.legR.hip.visible = false;
    z0.limbs.legL = z0.limbs.legR = false;
  }
  rig.root.position.set(z0.x, 0, z0.z);
  Z.grp.add(rig.root);
  // wire hit-detection back to the logical zombie from any mesh
  rig.root.traverse(function (o) {
    o.userData.zed = z0;
  });
  applyZedShadowQuality(rig.root);
  Z.zeds.push(z0);
  return z0;
}

export function killZed(zd, dir, gib, style) {
  if (zd.dead) return;
  zd.dead = true;
  zd.deadT = 0;
  zd.fallDir = Math.atan2(dir ? dir.x : 0, dir ? dir.z : 1);
  zd.gibbed = !!gib;
  Z.stats.kills++;
  Z.killStreak++;
  Z.streakT = 2.8;
  Z.combo = (Z.combo || 0) + 1;
  Z.comboT = 3.2;
  var basePts = zd.type === "brute" ? 250 : zd.type === "screamer" ? 180 : zd.type === "runner" ? 120 : 100;
  Z.score = (Z.score || 0) + Math.round(basePts * (1 + Math.min(8, Z.combo) * 0.15));
  bloodBurst(zd.x, 95, zd.z, 0, 0.4, 0, 28);
  decal(zd.x, 0.8, zd.z, 0, 1, 0, rr(55, 110));
  if (zd.type === "bloater") spawnAcidCloud(zd.x, zd.y + 40, zd.z);
  var how = style || "blow";
  if (gib) {
    // catastrophic break — limbs and flesh fly off the torso
    if (how === "cut") {
      // melee finish: limbs shear off in the swing direction one after another
      var order = ["head", "armL", "armR", "legL", "legR"];
      order.forEach(function (k, i) {
        if (!zd.limbs[k]) return;
        var ang = (i / 5) * 1.4 - 0.7;
        var ld = {
          x: (dir && dir.x) || Math.sin(ang),
          y: 0.35 + rnd() * 0.25,
          z: (dir && dir.z) || Math.cos(ang),
        };
        severPart(zd, k, ld, "cut", 0.95 + i * 0.05);
      });
      // torso meat ribbons
      for (var ci = 0; ci < 6; ci++)
        spawnFleshChunk(
          zd.x + rr(-16, 16),
          zd.y + rr(70, 140),
          zd.z + rr(-16, 16),
          ((dir && dir.x) || 0) * rr(80, 220) + rr(-60, 60),
          rr(40, 200),
          ((dir && dir.z) || 0) * rr(80, 220) + rr(-60, 60),
          rr(5, 12),
          "cut"
        );
      bloodBurst(zd.x, zd.y + 110, zd.z, (dir && dir.x) || 0, 0.5, (dir && dir.z) || 0, 30);
    } else {
      explodeBody(zd, dir || { x: 0, y: 1, z: 0 }, 1.1);
    }
    if (zd.rig && zd.rig.body) zd.rig.body.scale.setScalar(0.92);
  } else {
    // non-gib death: still a chance a loose limb tears free on the fall
    if (rnd() < 0.4) {
      var loose = [];
      if (zd.limbs.armL) loose.push("armL");
      if (zd.limbs.armR) loose.push("armR");
      if (zd.limbs.head && rnd() < 0.25) loose.push("head");
      if (loose.length)
        severPart(
          zd,
          pick(loose),
          dir || { x: rr(-1, 1), y: 0.4, z: rr(-1, 1) },
          how === "cut" ? "cut" : "blow",
          0.75
        );
    }
  }
  // eye lights die on whatever head remains attached
  if (zd.rig && zd.rig.eyes)
    zd.rig.eyes.forEach(function (ey) {
      if (ey && ey.parent) ey.visible = false;
    });
  if (zd.rig && zd.rig.rim) zd.rig.rim.intensity = 0;
  hooks.sndDeath && hooks.sndDeath(zd);
  hooks.onKill && hooks.onKill(zd, gib);
  if (Z.killStreak >= 3) hooks.say && hooks.say(t("z_streak", { n: Z.killStreak }), 1.2);
  hooks.hudDirty && hooks.hudDirty();
}

var HIT_SURFACE_MAT = { wound: null, tear: null };
function hitSurfaceMaterial(kind) {
  var k = kind === "tear" ? "tear" : kind + "_" + ((rnd() * TEX.wound.length) | 0);
  if (HIT_SURFACE_MAT[k]) return HIT_SURFACE_MAT[k];
  var map = kind === "tear" ? TEX.tear : TEX.wound[parseInt(k.split("_")[1], 10)];
  HIT_SURFACE_MAT[k] = new THREE.MeshStandardMaterial({
    map: map,
    color: 0xffffff,
    transparent: true,
    opacity: kind === "tear" ? 0.98 : 0.92,
    alphaTest: kind === "tear" ? 0.08 : 0.055,
    roughness: kind === "tear" ? 0.9 : 0.42,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  return HIT_SURFACE_MAT[k];
}

function hitAnchor(zd, point, part) {
  var r = zd && zd.rig;
  if (!r || !r.root) return null;
  r.root.updateMatrixWorld(true);
  var local = r.root.worldToLocal(point.clone());
  if (part === "head" && r.head && r.head.parent) return r.head;
  if (part === "limb") {
    if (local.y > 92) {
      var arm = local.x < 0 ? r.armL : r.armR;
      if (arm && arm.sh && arm.sh.parent) return arm.sh;
    }
    var leg = local.x < 0 ? r.legL : r.legR;
    if (leg && leg.knee && leg.knee.parent) return leg.knee;
    if (leg && leg.hip && leg.hip.parent) return leg.hip;
  }
  return r.torso && r.torso.parent ? r.torso : r.root;
}

// Keep fabric damage in the garment hierarchy. A tear attached to the body
// bone looked fixed in space whenever a loose sleeve, coat or hem swayed;
// choosing the nearest matching cloth shell means it now follows both the
// limb and the garment's secondary motion (and flies away with a severed
// limb because it is still inside that limb's group).
function clothAnchor(zd, layerName, point, fallback) {
  var r = zd && zd.rig,
    meshes = r && r.clothes && r.clothes.meshes;
  if (!meshes || !point) return fallback;
  var best = null,
    bestD = Infinity,
    wp = new THREE.Vector3();
  for (var i = 0; i < meshes.length; i++) {
    var mesh = meshes[i];
    if (!mesh || !mesh.parent || mesh.userData.clothLayer !== layerName) continue;
    mesh.updateWorldMatrix(true, false);
    mesh.getWorldPosition(wp);
    var d = wp.distanceToSquared(point);
    if (d < bestD) {
      bestD = d;
      best = mesh;
    }
  }
  return best || fallback;
}

function addSurfaceDecal(anchor, point, dir, size, kind, aspect) {
  if (!anchor || !point) return null;
  anchor.updateMatrixWorld(true);
  var localPoint = anchor.worldToLocal(point.clone());
  var outward = (dir && dir.lengthSq() > 0.0001 ? dir.clone().negate() : new THREE.Vector3(0, 0, 1)).normalize();
  var localNormal = anchor.worldToLocal(point.clone().add(outward)).sub(localPoint).normalize();
  if (!fin(localNormal.x) || localNormal.lengthSq() < 0.01) localNormal.set(0, 0, 1);
  var mat = hitSurfaceMaterial(kind);
  var mesh = new THREE.Mesh(organicDecalGeometry((rnd() * 10000) | 0, kind === "tear" ? 12 : 15), mat);
  mesh.scale.set(size, size * (aspect || 0.78), 1);
  mesh.position.copy(localPoint).add(localNormal.clone().multiplyScalar(0.025));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localNormal);
  mesh.rotation.z += rr(-0.45, 0.45);
  mesh.userData.zedHitFx = true;
  mesh.raycast = NO_RAYCAST;
  anchor.add(mesh);
  return mesh;
}

function damageSurface(zd, dmg, point, dir, part, melee) {
  if (!zd || !zd.rig || !point) return;
  var r = zd.rig;
  var skinK = Math.min(1, (r.skinDamage || 0) + Math.min(0.22, dmg / 260));
  r.skinDamage = skinK;
  // Skin materials are cloned per zombie, so impact bruising no longer tints
  // every other undead that happens to share the cached flesh map.
  // ...and the bruising multiplies the skin's own tint rather than replacing
  // it, so a shot no longer resets a green or jaundiced body back to the
  // untinted photo. tint0 is captured on the first hit, before any damage.
  [r.fleshMat, r.fleshSoftMat].forEach(function (m) {
    if (!m || !m.color) return;
    if (!m.userData.tint0) m.userData.tint0 = m.color.clone();
    var b = m.userData.tint0;
    m.color.setRGB(
      b.r * (1 - skinK * 0.2),
      b.g * (1 - skinK * 0.52),
      b.b * (1 - skinK * 0.46)
    );
    m.needsUpdate = true;
  });

  var relY = point.y - zd.y;
  var layerName = part === "limb" ? (relY < 78 ? "pants" : "sleeve") : relY < 38 ? "pants" : "shirt";
  var layer = r.clothes && r.clothes.layers && r.clothes.layers[layerName];
  var makeTear = false;
  if (layer) {
    layer.damage = Math.min(1, (layer.damage || 0) + Math.min(0.24, dmg / 120));
    zd.clothDamage = (zd.clothDamage || 0) + dmg;
    // Sustained fire accumulates damage; melee and strong rounds open fabric
    // immediately, while weak hits wait until the same spot has been worked.
    zd.clothImpact = (zd.clothImpact || 0) + dmg;
    makeTear = melee || dmg >= 12 || zd.clothImpact >= 22;
    if (makeTear) zd.clothImpact = Math.max(0, zd.clothImpact - 22);
    // Same rule for textiles: soil the garment's own colour, don't overwrite
    // it with a grey that made every damaged shirt the same shade.
    if (!layer.mat.userData.tint0) {
      layer.mat.userData.tint0 = layer.mat.color.clone();
      layer.mat.userData.rough0 = layer.mat.roughness;
    }
    var lb = layer.mat.userData.tint0;
    layer.mat.color.setRGB(
      lb.r * (1 - layer.damage * 0.18),
      lb.g * (1 - layer.damage * 0.24),
      lb.b * (1 - layer.damage * 0.24)
    );
    layer.mat.roughness = layer.mat.userData.rough0 - layer.damage * 0.18;
    layer.mat.needsUpdate = true;
  }

  var anchor = hitAnchor(zd, point, part);
  if (!anchor) return;
  var size = Math.max(4.5, Math.min(13, 4.5 + dmg * 0.055));
  var wound = addSurfaceDecal(anchor, point, dir, size, "wound", 0.85);
  if (wound) {
    zd.skinWounds = zd.skinWounds || [];
    zd.skinWounds.push(wound);
    if (zd.skinWounds.length > 10) {
      var old = zd.skinWounds.shift();
      if (old && old.parent) old.parent.remove(old);
      if (old && old.geometry) old.geometry.dispose();
    }
  }
  if (makeTear && layer) {
    var fabricAnchor = clothAnchor(zd, layerName, point, anchor);
    var tear = addSurfaceDecal(fabricAnchor, point, dir, size * 1.28, "tear", 0.54);
    if (tear) {
      tear.userData.clothLayer = layerName;
      zd.clothTears = zd.clothTears || [];
      zd.clothTears.push(tear);
      if (zd.clothTears.length > 8) {
        var oldT = zd.clothTears.shift();
        if (oldT && oldT.parent) oldT.parent.remove(oldT);
        if (oldT && oldT.geometry) oldT.geometry.dispose();
      }
    }
  }
}

export function damageZed(zd, dmg, point, dir, part, melee) {
  if (!zd || zd.dead) return 0;
  var mult = 1,
    head = part === "head";
  if (head) mult = 3.6;
  else if (part === "limb") mult = 0.7;
  // weakpoint: exposed gut
  if (!head && part === "body" && point && point.y - zd.y > 90 && point.y - zd.y < 120) mult *= 1.15;
  var d = dmg * mult;
  zd.hp -= d;
  damageSurface(zd, d, point, dir, part, melee);
  Z.stats.hits++;
  Z.stats.dmgDealt = (Z.stats.dmgDealt || 0) + d;
  if (head) Z.stats.heads++;
  if (melee) Z.stats.melee++;
  bloodBurst(point.x, point.y, point.z, dir.x * 0.45, 0.55, dir.z * 0.45, head ? 22 : 11);
  if (head) boneBurst(point.x, point.y, point.z, 3);
  hooks.hitMarker && hooks.hitMarker(head);
  hooks.sndFlesh && hooks.sndFlesh(point, head);
  if (head) hooks.onHeadshot && hooks.onHeadshot(zd, d);
  // stagger: heavy melee and shotguns rock them back
  zd.stagger = Math.max(zd.stagger, melee ? 0.48 : head ? 0.28 : 0.14);
  zd.alerted = true;
  if (zd.state === "tease") zd.state = "chase";
  zd.grabT = 0;
  zd.hitFlash = 0.12;
  zd.jiggle = Math.max(zd.jiggle || 0, melee ? 1.1 : 0.7);

  var mode = melee ? "cut" : "blow";
  var force = melee ? 1.05 : d > 50 ? 1.35 : 1.0;

  // accumulate limb trauma → animated sever when threshold crossed
  if (part === "limb" || head) {
    trySeverFromHit(zd, point, dir, d, melee, mode, force);
  } else if (part === "body" && d > 28) {
    // blown flesh chunks from torso without full limb loss
    var n = melee ? 1 : d > 45 ? 4 : 2;
    for (var ci = 0; ci < n; ci++) {
      spawnFleshChunk(
        point.x + rr(-6, 6),
        point.y + rr(-6, 6),
        point.z + rr(-6, 6),
        (dir.x || 0) * rr(60, 220) + rr(-80, 80),
        rr(40, 220),
        (dir.z || 0) * rr(60, 220) + rr(-80, 80),
        rr(4, 12),
        melee ? "cut" : "blow"
      );
    }
    if (d > 48 && rnd() < 0.35) {
      // catastrophic body hit can rip an arm free
      var arm = zd.limbs.armL && zd.limbs.armR ? pick(["armL", "armR"]) : zd.limbs.armL ? "armL" : zd.limbs.armR ? "armR" : null;
      if (arm) severPart(zd, arm, dir, mode, force * 0.9);
    }
  }

  if (zd.hp <= 0) {
    var style = melee ? "cut" : "blow";
    // decapitation on killing headshot — head flies off before body drops
    if (head && zd.limbs.head) {
      severPart(zd, "head", dir, style, force * 1.2);
    }
    // big damage, head kill, or heavy melee → full body break
    var doGib = d > 50 || head || (!melee && d > 40) || (melee && d > 45);
    killZed(zd, dir, doGib, style);
    return d;
  }
  return d;
}

// Pick nearest intact limb to the hit and either chip it or sever it.
export function trySeverFromHit(zd, point, dir, dmg, melee, mode, force) {
  if (!zd.limbDmg) zd.limbDmg = { armL: 0, armR: 0, legL: 0, legR: 0, head: 0 };
  var cand = [];
  function push(key, approxY, approxX) {
    if (!zd.limbs[key]) return;
    var wx = zd.x + (approxX || 0);
    var wy = zd.y + (approxY || 100);
    var wz = zd.z;
    var dist = point ? Math.hypot(point.x - wx, point.y - wy, point.z - wz) : 0;
    cand.push({ key: key, dist: dist });
  }
  push("head", 160, 0);
  push("armL", 130, -25);
  push("armR", 130, 25);
  push("legL", 50, -12);
  push("legR", 50, 12);
  if (!cand.length) return;
  cand.sort(function (a, b) {
    return a.dist - b.dist;
  });
  var best = cand[0].key;

  // headshots: only sever head on heavy hits (or kill path handles it)
  if (best === "head") {
    zd.limbDmg.head += dmg;
    if (zd.limbDmg.head > 55 && dmg > 20 && zd.hp > 0) {
      severPart(zd, "head", dir, mode, force);
      // headless zombie keeps staggering on remaining HP
      zd.stagger = Math.max(zd.stagger, 0.7);
      zd.spd *= 0.85;
    }
    return;
  }

  zd.limbDmg[best] = (zd.limbDmg[best] || 0) + dmg;
  var thresh = melee ? 28 : 36;
  // axes / heavy hits lower the bar
  if (dmg > 50) thresh *= 0.55;
  else if (dmg > 35) thresh *= 0.75;

  var shouldSever =
    zd.limbDmg[best] >= thresh ||
    (melee && dmg > 40 && rnd() < 0.7) ||
    (!melee && dmg > 30 && rnd() < 0.45);

  if (shouldSever) {
    severPart(zd, best, dir, mode, force);
  } else if (dmg > 12) {
    // chip of flesh even without full sever
    spawnFleshChunk(
      point.x,
      point.y,
      point.z,
      (dir.x || 0) * rr(40, 160),
      rr(30, 140),
      (dir.z || 0) * rr(40, 160),
      rr(3, 8),
      melee ? "cut" : "blow"
    );
  }
}

/* ---- animation ---------------------------------------------------------- */
function limbAttached(zd, key) {
  return !!(zd.limbs && zd.limbs[key]);
}
function armOK(zd, side) {
  return limbAttached(zd, side) && zd.rig[side] && zd.rig[side].sh && zd.rig[side].sh.parent;
}
function legOK(zd, side) {
  return limbAttached(zd, side) && zd.rig[side] && zd.rig[side].hip && zd.rig[side].hip.parent;
}

function springAngle(owner, valueKey, velocityKey, target, dt, stiffness, damping) {
  var value = owner[valueKey] || 0,
    velocity = owner[velocityKey] || 0;
  // Critically damped-ish transform spring. Capping dt avoids a tab-resume
  // spike snapping every lock and hem across the model.
  dt = Math.min(0.05, Math.max(0, dt || 0));
  velocity += (target - value) * (stiffness || 44) * dt;
  velocity *= Math.pow(damping || 0.018, dt);
  value += velocity * dt;
  owner[valueKey] = value;
  owner[velocityKey] = velocity;
  return value;
}

// One cheap motion sample drives every garment on this zombie. It provides
// coherent inertia from real travel and turning, replacing the old collection
// of unrelated sine waves without introducing a cloth solver or allocations.
function sampleClothMotion(zd, dt) {
  dt = Math.min(0.05, Math.max(0.001, dt || 0.016));
  if (zd.clothLastX == null) {
    zd.clothLastX = zd.x;
    zd.clothLastZ = zd.z;
    zd.clothLastHead = zd.head || 0;
  }
  var inv = 1 / dt,
    vx = (zd.x - zd.clothLastX) * inv,
    vz = (zd.z - zd.clothLastZ) * inv,
    head = zd.head || 0,
    fx = Math.sin(head),
    fz = Math.cos(head),
    rx = fz,
    rz = -fx,
    rawF = clamp((vx * fx + vz * fz) / 230, -1.35, 1.35),
    rawS = clamp((vx * rx + vz * rz) / 230, -1.1, 1.1),
    dh = head - zd.clothLastHead;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  var rawTurn = clamp(dh * inv / 6, -1.2, 1.2),
    prevF = zd.clothRawF || 0,
    prevS = zd.clothRawS || 0,
    follow = 1 - Math.exp(-dt * 8.5);

  zd.clothImpulseF = ((zd.clothImpulseF || 0) + clamp(rawF - prevF, -0.8, 0.8) * 0.62) * Math.pow(0.028, dt);
  zd.clothImpulseS = ((zd.clothImpulseS || 0) + clamp(rawS - prevS, -0.7, 0.7) * 0.55) * Math.pow(0.035, dt);
  zd.clothFlowF = (zd.clothFlowF || 0) + (rawF - (zd.clothFlowF || 0)) * follow;
  zd.clothFlowS = (zd.clothFlowS || 0) + (rawS - (zd.clothFlowS || 0)) * follow;
  zd.clothTurn = (zd.clothTurn || 0) + (rawTurn - (zd.clothTurn || 0)) * (1 - Math.exp(-dt * 11));
  zd.clothRawF = rawF;
  zd.clothRawS = rawS;
  zd.clothLastX = zd.x;
  zd.clothLastZ = zd.z;
  zd.clothLastHead = head;
}

function applyJiggle(zd, moving, ph, dt) {
  var r = zd.rig;
  if (!r) return;
  sampleClothMotion(zd, dt);
  var bounce = moving ? Math.abs(Math.sin(ph)) : Math.abs(Math.sin(ph * 0.5)) * 0.25;
  var hip = Math.sin(ph * 0.5);
  // impact jiggle decays
  zd.jiggle = Math.max(0, (zd.jiggle || 0) - dt * 4.2);
  var j = zd.jiggle;
  // toned-down body motion — still reads, less "bounce show"
  var jigAmp = (zd.female ? 0.55 : 0.3) * (0.35 + bounce * 0.55 + j * 1.4);

  if (r.breastL && r.breastL.userData.baseY != null) {
    var bl = r.breastL;
    bl.position.y = bl.userData.baseY - bounce * 1.6 * jigAmp - j * Math.sin(Z.t * 18) * 1.2;
    bl.position.z = bl.userData.baseZ + bounce * 0.7 * jigAmp;
    bl.rotation.x = bounce * 0.06 * jigAmp + j * Math.sin(Z.t * 14) * 0.08;
    bl.rotation.z = hip * 0.03 * jigAmp;
    bl.scale.setScalar(1 + bounce * 0.02 * jigAmp + j * 0.03);
  }
  if (r.breastR && r.breastR.userData.baseY != null) {
    var br = r.breastR;
    br.position.y = br.userData.baseY - bounce * 1.6 * jigAmp - j * Math.sin(Z.t * 18 + 1) * 1.2;
    br.position.z = br.userData.baseZ + bounce * 0.7 * jigAmp;
    br.rotation.x = bounce * 0.06 * jigAmp + j * Math.sin(Z.t * 14 + 1) * 0.08;
    br.rotation.z = -hip * 0.03 * jigAmp;
    br.scale.setScalar(1 + bounce * 0.02 * jigAmp + j * 0.03);
  }
  if (r.buttL && r.buttL.userData.baseSX) {
    var s = 1 + bounce * 0.04 * jigAmp + j * 0.05;
    r.buttL.scale.set(r.buttL.userData.baseSX * s, r.buttL.userData.baseSY * (1 + bounce * 0.03), r.buttL.userData.baseSZ * s);
    r.buttR.scale.set(r.buttR.userData.baseSX * s, r.buttR.userData.baseSY * (1 + bounce * 0.03), r.buttR.userData.baseSZ * s);
  }
  if (r.hairLocks && r.hairLocks.length) {
    for (var i = 0; i < r.hairLocks.length; i++) {
      var lock = r.hairLocks[i];
      if (!lock || !lock.upper || !lock.lower || !lock.anchor.parent) continue;
      var hAmp = (moving ? 0.22 : 0.06) + j * 0.16;
      var hPhase = ph * 0.8 + lock.phase;
      var hx = Math.sin(hPhase) * hAmp - Math.abs(Math.sin(hPhase * 0.5)) * hAmp * 0.35;
      var hz = Math.cos(hPhase * 0.74 + 0.8) * hAmp * 0.72;
      lock.upper.rotation.x = springAngle(lock, "upperX", "upperVX", hx, dt);
      lock.upper.rotation.z = springAngle(lock, "upperZ", "upperVZ", hz, dt);
      lock.lower.rotation.x = springAngle(lock, "lowerX", "lowerVX", hx * 1.45 + Math.sin(hPhase * 1.6) * hAmp * 0.42, dt);
      lock.lower.rotation.z = springAngle(lock, "lowerZ", "lowerVZ", hz * 1.5 + Math.cos(hPhase * 1.25) * hAmp * 0.38, dt);
    }
  }
  if (r.clothes && r.clothes.flaps) {
    var flowF = zd.clothFlowF || 0,
      flowS = zd.clothFlowS || 0,
      turn = zd.clothTurn || 0,
      impulseF = zd.clothImpulseF || 0,
      impulseS = zd.clothImpulseS || 0,
      travel = Math.min(1.4, Math.hypot(flowF, flowS));
    for (var fi = 0; fi < r.clothes.flaps.length; fi++) {
      var flap = r.clothes.flaps[fi];
      if (!flap || !flap.upper || !flap.lower || !flap.root.parent) continue;
      var cAmp = ((moving ? 0.055 : 0.014) + travel * 0.075 + j * 0.11) * flap.sway;
      var cPhase = ph * 0.72 + flap.phase;
      var cx = 0.035 + (flowF * 0.16 + impulseF * 0.2) * flap.drag + Math.sin(cPhase) * cAmp;
      var cz = -(flowS * 0.13 + impulseS * 0.18) * flap.drag + Math.cos(cPhase * 1.3) * cAmp * 0.55;
      var cy = -turn * (0.075 + Math.abs(flap.side) * 0.055) * flap.drag + flap.side * travel * 0.018;
      // Coat tails are deliberately softer than the upper attachment; the
      // lower half arrives late and keeps moving after a turn or sudden stop.
      flap.upper.rotation.x = springAngle(flap, "upperX", "upperVX", cx, dt, 38, 0.022);
      flap.upper.rotation.y = springAngle(flap, "upperY", "upperVY", cy, dt, 34, 0.026);
      flap.upper.rotation.z = springAngle(flap, "upperZ", "upperVZ", cz, dt, 36, 0.024);
      flap.lower.rotation.x = springAngle(flap, "lowerX", "lowerVX", cx * 1.62 + Math.sin(cPhase * 1.8) * cAmp * 0.38, dt, 25, 0.052);
      flap.lower.rotation.y = springAngle(flap, "lowerY", "lowerVY", cy * 1.7 + flap.side * turn * 0.04, dt, 23, 0.06);
      flap.lower.rotation.z = springAngle(flap, "lowerZ", "lowerVZ", cz * 1.5, dt, 24, 0.055);
    }
  }
  if (r.clothes && r.clothes.meshes) {
    var shellF = zd.clothFlowF || 0,
      shellS = zd.clothFlowS || 0,
      shellTurn = zd.clothTurn || 0,
      shellKickF = zd.clothImpulseF || 0,
      shellKickS = zd.clothImpulseS || 0;
    for (var ci = 0; ci < r.clothes.meshes.length; ci++) {
      var fabric = r.clothes.meshes[ci];
      if (!fabric || !fabric.parent) continue;
      var fs = fabric.userData.clothSway || 1;
      var fphase = (ci + 1) * 0.63;
      // Shells follow one shared flow field, with only a small phase offset for
      // weave flutter. This reads as one garment rather than vibrating parts.
      var fAmp = (moving ? 1 : 0.25) * (0.005 + bounce * 0.009) * fs;
      fabric.rotation.x = (fabric.userData.clothBaseRX || 0) + (shellF * 0.007 + shellKickF * 0.012) * fs + Math.sin(ph * 1.15 + fphase) * fAmp;
      fabric.rotation.z = (fabric.userData.clothBaseRZ || 0) - (shellS * 0.009 + shellKickS * 0.014 + shellTurn * 0.006) * fs + Math.sin(ph * 0.82 + fphase * 1.7) * fAmp;
      fabric.rotation.y = (fabric.userData.clothBaseRY || 0) - shellTurn * 0.004 * fs + Math.sin(ph * 0.68 + fphase) * fAmp * 0.35;
    }
  }
  if (r.aura) {
    r.aura.intensity = legacyIntensity(0.15 + 0.12 * Math.sin(Z.t * 2.2 + zd.phase) + (zd.state === "tease" ? 0.15 : 0), 160);
    r.aura.distance = zd.state === "tease" ? 200 : 150;
  }
}

export function animZed(zd, dt) {
  var r = zd.rig;
  if (!r || !r.body) return;
  var pretty = !!(r.pretty || zd.pretty);
  var female = !!(r.female || zd.female);
  var tease = zd.state === "tease";
  var burning = zd.burn > 0;
  var burnPanic = burning && zd.panicT > 0;
  var chaseMul = burnPanic ? 15 : burning ? 7.5 : tease ? 1.6 : zd.type === "runner" ? 11 : zd.type === "brute" ? 3.6 : pretty ? 4.2 : 5.0;
  var ph = (zd.phase += dt * (zd.state === "chase" || zd.state === "flank" || tease ? chaseMul : zd.state === "attack" ? 3.2 : 2.2));
  var hasHead = limbAttached(zd, "head") && r.head && r.head.parent;
  var hasAL = armOK(zd, "armL"),
    hasAR = armOK(zd, "armR"),
    hasLL = legOK(zd, "legL"),
    hasLR = legOK(zd, "legR");

  if (zd.dead) {
    zd.deadT += dt;
    var k = Math.min(1, zd.deadT / 0.75);
    var e = 1 - Math.pow(1 - k, 3);
    var side = Math.sin(zd.fallDir || 0) * 0.35;
    var fold = zd.gibbed ? 1.65 : 1.52;
    r.body.rotation.x = e * fold;
    r.body.rotation.z = e * side;
    r.body.position.y = -e * (zd.gibbed ? 36 : 28);
    r.root.position.y = zd.y - Math.max(0, zd.deadT - (zd.gibbed ? 2.2 : 3.5)) * 30;
    if (r.torso) r.torso.rotation.z = Math.sin(zd.deadT * 4) * 0.08 * (1 - k);
    if (hasAL) r.armL.sh.rotation.x = -0.4 - e * 1.2;
    if (hasAR) r.armR.sh.rotation.x = -0.4 - e * 0.85;
    if (hasLL) r.legL.hip.rotation.x = e * 0.4;
    if (hasLR) r.legR.hip.rotation.x = e * 0.55;
    // death jiggle burst
    applyJiggle(zd, false, zd.deadT * 8, dt);
    if (zd.deadT > 5.5) r.root.visible = zd.deadT < 8.2;
    if (r.eyes)
      r.eyes.forEach(function (ey) {
        if (ey && ey.parent) ey.visible = zd.deadT < 1.1 && hasHead;
      });
    if (r.aura) r.aura.intensity = legacyIntensity(Math.max(0, 0.5 - zd.deadT * 0.2), 160);
    return;
  }
  if (zd.hitFlash > 0) {
    zd.hitFlash -= dt;
    var punch = 1 + zd.hitFlash * 0.35;
    if (r.torso) r.torso.scale.setScalar(punch);
    zd.jiggle = Math.max(zd.jiggle || 0, 0.85);
  } else if (r.torso && r.torso.scale.x !== 1 && r.torso.scale.y === r.torso.scale.x)
    r.torso.scale.setScalar(1);

  var moving = zd.state === "chase" || zd.state === "wander" || zd.state === "flank";
  var sw = moving ? Math.sin(ph) : Math.sin(ph * 0.35) * 0.15;

  if (burning && !zd.crawler) {
    // A unique two-stage burn reaction: frantic, asymmetric flailing while the
    // panic timer is live, then a weakening convulsive stumble as health falls.
    var fireAmp = burnPanic ? 1 : 0.48;
    var wr = Math.sin(ph * 1.7);
    var wr2 = Math.sin(ph * 2.35 + 1.4);
    r.body.rotation.x = (burnPanic ? -0.06 : 0.38) + wr2 * 0.16 * fireAmp;
    r.body.rotation.z = wr * 0.22 * fireAmp;
    r.body.position.y = Math.abs(Math.sin(ph * 1.25)) * (burnPanic ? 7 : 3);
    if (r.torso) {
      r.torso.rotation.x = -0.12 + wr * 0.18 * fireAmp;
      r.torso.rotation.y = wr2 * 0.42 * fireAmp;
      r.torso.rotation.z = -wr * 0.2 * fireAmp;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -2.55 + wr * 0.65 * fireAmp;
      r.armL.sh.rotation.z = 0.75 + wr2 * 0.32 * fireAmp;
      r.armL.sh.rotation.y = wr2 * 0.3;
      if (r.armL.el) r.armL.el.rotation.x = -0.25 - Math.abs(wr2) * 0.75;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -2.35 - wr2 * 0.72 * fireAmp;
      r.armR.sh.rotation.z = -0.8 - wr * 0.3 * fireAmp;
      r.armR.sh.rotation.y = -wr * 0.3;
      if (r.armR.el) r.armR.el.rotation.x = -0.3 - Math.abs(wr) * 0.7;
    }
    if (hasLL) {
      r.legL.hip.rotation.x = wr * (burnPanic ? 1.05 : 0.45);
      if (r.legL.knee) r.legL.knee.rotation.x = Math.max(0, -wr) * 1.05;
    }
    if (hasLR) {
      r.legR.hip.rotation.x = -wr2 * (burnPanic ? 0.9 : 0.38);
      if (r.legR.knee) r.legR.knee.rotation.x = Math.max(0, wr2) * 0.9;
    }
    if (hasHead) {
      r.head.rotation.x = -0.42 + wr2 * 0.24;
      r.head.rotation.z = wr * 0.3;
    }
    zd.jiggle = Math.max(zd.jiggle || 0, burnPanic ? 0.52 : 0.25);
  } else if (zd.crawler) {
    r.body.rotation.x = 1.32;
    r.body.position.y = 22;
    if (hasAL) {
      r.armL.sh.rotation.x = -1.5 + sw * 0.95;
      if (r.armL.el) r.armL.el.rotation.x = -0.9;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -1.5 - sw * 0.95;
      if (r.armR.el) r.armR.el.rotation.x = -0.9;
    }
    if (r.torso) r.torso.rotation.z = sw * 0.18;
    if (hasHead) r.head.rotation.x = -0.35;
  } else if (zd.grabbing) {
    // intimate grab pose — pressed close, hips rolling
    r.body.rotation.x = 0.2;
    r.body.position.y = Math.sin(Z.t * 10) * 2;
    if (r.torso) {
      r.torso.rotation.z = Math.sin(Z.t * 9) * 0.14;
      r.torso.rotation.y = Math.sin(Z.t * 5) * 0.1;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -2.2;
      r.armL.sh.rotation.z = 0.5;
      if (r.armL.el) r.armL.el.rotation.x = -0.2;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -2.15;
      r.armR.sh.rotation.z = -0.5;
      if (r.armR.el) r.armR.el.rotation.x = -0.2;
    }
    if (hasHead) r.head.rotation.x = 0.35;
    zd.jiggle = Math.max(zd.jiggle || 0, 0.4);
  } else if (tease) {
    // brief pause / head-tilt lure — still undead, not a pin-up
    var tw = Math.sin(ph * 1.2);
    r.body.rotation.x = 0.12 + Math.sin(ph * 0.7) * 0.04;
    r.body.rotation.z = tw * 0.1;
    r.body.position.y = Math.abs(Math.sin(ph)) * 1.2;
    if (r.torso) {
      r.torso.rotation.y = tw * 0.12;
      r.torso.rotation.z = tw * 0.08;
      r.torso.rotation.x = 0.05;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -1.0 + tw * 0.15;
      r.armL.sh.rotation.z = 0.45;
      if (r.armL.el) r.armL.el.rotation.x = -0.7;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -0.95 - tw * 0.15;
      r.armR.sh.rotation.z = -0.45;
      if (r.armR.el) r.armR.el.rotation.x = -0.7;
    }
    if (hasLL) r.legL.hip.rotation.x = 0.1 + tw * 0.06;
    if (hasLR) r.legR.hip.rotation.x = -0.2 - tw * 0.05;
    if (hasHead) {
      r.head.rotation.x = 0.05;
      r.head.rotation.z = tw * 0.08;
    }
  } else if (zd.windup > 0) {
    // attack wind-up: lean back, arms raised for the swipe
    var wk = clamp(1 - zd.windup / 0.55, 0, 1);
    r.body.rotation.x = 0.05 - wk * 0.25;
    r.body.position.y = wk * 4;
    if (r.torso) {
      r.torso.rotation.x = -wk * 0.2;
      r.torso.rotation.y = Math.sin(Z.t * 20) * 0.04;
    }
    if (hasAL) {
      r.armL.sh.rotation.x = -2.4 - wk * 0.3;
      r.armL.sh.rotation.z = 0.5 + wk * 0.3;
      if (r.armL.el) r.armL.el.rotation.x = -0.3;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = -2.3 - wk * 0.35;
      r.armR.sh.rotation.z = -0.5 - wk * 0.3;
      if (r.armR.el) r.armR.el.rotation.x = -0.3;
    }
    if (hasLL) r.legL.hip.rotation.x = 0.2;
    if (hasLR) r.legR.hip.rotation.x = -0.15;
    if (hasHead) r.head.rotation.x = -0.25;
  } else {
    // classic uneven shamble — dragging foot, heavy lean, clawing arms
    var hunch = zd.type === "brute" ? 0.18 : zd.type === "runner" ? 0.22 : 0.28;
    if (pretty) hunch *= 0.85;
    var limp = 0.12; // permanent limp bias
    r.body.rotation.x = hunch + Math.sin(ph * 0.5) * 0.07;
    r.body.rotation.z = Math.sin(ph * 0.5) * (zd.type === "runner" ? 0.14 : 0.12) + limp * 0.3;
    r.body.position.y = Math.abs(Math.sin(ph)) * (moving ? (zd.type === "runner" ? 5.2 : 4.2) : 0.8);
    // asymmetric stride: right leg drags
    if (hasLL) {
      r.legL.hip.rotation.x = sw * (zd.type === "runner" ? 0.9 : 0.7);
      if (r.legL.knee) r.legL.knee.rotation.x = Math.max(0, -sw) * 0.85;
    }
    if (hasLR) {
      r.legR.hip.rotation.x = -sw * (zd.type === "runner" ? 0.55 : 0.4) - limp;
      if (r.legR.knee) r.legR.knee.rotation.x = Math.max(0, sw) * 0.35 + limp * 0.5;
    }
    // clawing reach
    var reach = zd.state === "chase" || zd.state === "flank" ? -1.45 : -0.55;
    if (zd.cool > 0.55) reach = -0.25; // recovery after swipe
    if (hasAL) {
      r.armL.sh.rotation.x = reach + sw * 0.32 + Math.sin(ph * 1.3) * 0.08;
      r.armL.sh.rotation.z = 0.28 + (zd.cool > 0.5 ? 0.15 : 0);
      r.armL.sh.rotation.y = Math.sin(ph * 0.8) * 0.1;
      if (r.armL.el) r.armL.el.rotation.x = -0.65 - Math.abs(sw) * 0.25;
    }
    if (hasAR) {
      r.armR.sh.rotation.x = reach - sw * 0.28 + Math.sin(ph * 1.1 + 1) * 0.08;
      r.armR.sh.rotation.z = -0.32 - (zd.cool > 0.5 ? 0.15 : 0);
      r.armR.sh.rotation.y = Math.sin(ph * 0.8 + 0.5) * 0.1;
      if (r.armR.el) r.armR.el.rotation.x = -0.6 - Math.abs(sw) * 0.22;
    }
    if (r.torso) {
      r.torso.rotation.z = sw * 0.14;
      r.torso.rotation.y = sw * 0.18;
      r.torso.rotation.x = Math.sin(ph * 0.6) * 0.05;
    }
    if (hasHead) r.head.rotation.x = zd.type === "screamer" ? -0.2 : 0.08 + Math.sin(ph * 0.4) * 0.06;
  }

  // head tracks player with lolling undead tilt
  if (r.neck && r.neck.parent) {
    var toP = Math.atan2(Z.p.x - zd.x, Z.p.z - zd.z) - zd.head;
    while (toP > Math.PI) toP -= 6.283;
    while (toP < -Math.PI) toP += 6.283;
    r.neck.rotation.y = zd.alerted || tease ? clamp(toP, -0.95, 0.95) : Math.sin(ph * 0.3) * 0.55;
    r.neck.rotation.z = Math.sin(ph * 0.23) * 0.32 + (zd.alerted ? 0.05 : 0.22);
    if (zd.stagger > 0) r.neck.rotation.x = -zd.stagger * 0.45;
    else r.neck.rotation.x = Math.sin(ph * 0.35) * 0.12;
  }
  if (zd.stagger > 0) {
    r.body.rotation.x -= zd.stagger * 1.15;
    r.body.position.y -= zd.stagger * 7;
    zd.jiggle = Math.max(zd.jiggle || 0, zd.stagger);
  }

  applyJiggle(zd, moving || tease, ph, dt);

  var eGlow = tease ? 1.4 : zd.alerted ? 1.15 : 0.4;
  if (r.eyes && hasHead)
    r.eyes.forEach(function (ey, i) {
      if (!ey || !ey.parent) return;
      var pulse = 0.85 + 0.35 * Math.sin(Z.t * (tease ? 6 : zd.alerted ? 11 : 5) + zd.phase + i);
      ey.scale.setScalar(eGlow * pulse * (i >= 2 ? 1.35 : 1));
    });
  if (r.rim) r.rim.intensity = legacyIntensity((zd.alerted ? 0.45 : 0.18) * (0.8 + 0.2 * Math.sin(Z.t * 6 + zd.phase)), r.rim.distance);
}

/* ---- AI ----------------------------------------------------------------- */
var _zedMovePoint = { x: 0, z: 0 };

export function stepZedVisuals(zd, dt) {
  if (!zd || !zd.root) return;
  // A dead rig still settles, but only its final pose for this rendered frame
  // matters. Live distant rigs retain their existing 20 Hz animation cadence.
  if (zd.dead) {
    animZed(zd, dt);
    return;
  }
  zd.animT += dt;
  var animStep = zd.dist > 750 ? 0.05 : 0;
  if (!animStep || zd.animT >= animStep) {
    animZed(zd, zd.animT);
    zd.animT = 0;
  }
}

export function stepZed(zd, dt, deferVisuals) {
  if (zd.burn > 0) stepBurn(zd, dt);
  if (zd.dead) {
    zd.deadT += dt;
    if (zd.deadT > 9) {
      removeZed(zd);
      return;
    }
    if (!deferVisuals) stepZedVisuals(zd, dt);
    return;
  }
  var dx = Z.p.x - zd.x,
    dz = Z.p.z - zd.z,
    dist = Math.hypot(dx, dz);
  zd.dist = dist;
  if (zd.stagger > 0) zd.stagger -= dt;
  if (zd.cool > 0) zd.cool -= dt;
  zd.grabbing = false;

  // --- perception (runners hear better, brutes see less but never forget)
  if (!zd.alerted) {
    var seeR = zd.type === "runner" ? 1100 : zd.type === "brute" ? 700 : 950;
    var hearsR = Z.p.sprint ? 700 : Z.p.crouch ? 110 : 340;
    if (zd.type === "runner") hearsR *= 1.25;
    var sees = dist < seeR && losClear(zd.x, zd.z, Z.p.x, Z.p.z);
    // flashlight beam can reveal you: if flashlight is on and pointing roughly at them
    if (!sees && Z.flash && Z.flash.on && dist < 900) {
      var fx = Math.sin(Z.p.yaw),
        fz = Math.cos(Z.p.yaw),
        tdx = (zd.x - Z.p.x) / (dist || 1),
        tdz = (zd.z - Z.p.z) / (dist || 1);
      if (tdx * fx + tdz * fz > 0.82) sees = true;
    }
    var hears = dist < hearsR;
    if (sees || hears) {
      zd.alerted = true;
      zd.state = "chase";
      hooks.sndGrowl && hooks.sndGrowl(zd, true);
      if (zd.type === "screamer") screamerCall(zd);
    }
  } else if (dist > 1800 && !losClear(zd.x, zd.z, Z.p.x, Z.p.z)) {
    if ((zd.lost = (zd.lost || 0) + dt) > (zd.type === "brute" ? 10 : 5.5)) {
      zd.alerted = false;
      zd.state = "wander";
      zd.lost = 0;
    }
  } else zd.lost = 0;

  // --- siren tease: hold mid-range and pose to spike player distraction
  if (zd.alerted && zd.siren && !Z.p.dead && !zd.crawler && zd.stagger <= 0) {
    if (dist > 140 && dist < 520 && losClear(zd.x, zd.z, Z.p.x, Z.p.z)) {
      zd.teaseT = (zd.teaseT || 0) + dt;
      // enter tease in waves
      if (zd.teaseT > 0.4 && (zd.state === "chase" || zd.state === "tease" || zd.state === "flank")) {
        if (zd.state !== "tease" && rnd() < dt * 1.8) {
          zd.state = "tease";
          zd.teaseMax = rr(2.0, 3.6);
          zd.teaseT = 0;
          hooks.sndGrowl && hooks.sndGrowl(zd, false);
          if (hooks.say && rnd() < 0.4) hooks.say(t("z_distract"), 1.1);
        }
      }
      // leave tease after a beat or if player gets close
      if (zd.state === "tease" && (zd.teaseT > (zd.teaseMax || 2.5) || dist < 160)) {
        zd.state = "chase";
        zd.teaseT = 0;
      }
    } else if (zd.state === "tease") {
      zd.state = "chase";
      zd.teaseT = 0;
    }
  }

  // --- attack / grab
  var reach = (zd.type === "brute" ? 92 : 78) * zd.rig.scale;
  if (zd.alerted && dist < reach && !Z.p.dead) {
    if (zd.state === "tease") zd.state = "chase";
    // grab: if player is cornered / standing still in face-hug range
    // pretty undead grab faster and hold longer (more "distracting")
    var grabNeed = zd.pretty || zd.female ? 0.35 : 0.55;
    if (dist < reach * 0.78 && zd.cool <= 0 && Z.p.speedK < 0.35) {
      zd.grabT = (zd.grabT || 0) + dt;
      if (zd.grabT > grabNeed) {
        zd.grabbing = true;
        hooks.hurtPlayer && hooks.hurtPlayer(zd.dmg * 0.35 * dt * 4, zd);
        if (Z.p) {
          Z.p.stam = Math.max(0, Z.p.stam - dt * 28);
          // intimate grab spikes distraction hard
          Z.p.distract = Math.min(1, (Z.p.distract || 0) + dt * (zd.distract || 0.5) * 1.8);
        }
        zd.jiggle = Math.max(zd.jiggle || 0, 0.7);
      }
    } else zd.grabT = Math.max(0, (zd.grabT || 0) - dt * 2);

    if (!zd.grabbing) {
      if (zd.windup > 0) {
        zd.windup -= dt;
        if (zd.windup <= 0) {
          // the swipe lands only if you're still in range — backpedalling works
          if (Math.hypot(Z.p.x - zd.x, Z.p.z - zd.z) < reach + 24) {
            var dmgMul = zd.type === "brute" ? 1.1 : 1;
            hooks.hurtPlayer && hooks.hurtPlayer(zd.dmg * dmgMul, zd);
            hooks.sndSwipe && hooks.sndSwipe(zd, true);
          } else hooks.sndSwipe && hooks.sndSwipe(zd, false);
          zd.cool = zd.rate;
        }
      } else if (zd.cool <= 0) {
        zd.windup = zd.type === "runner" ? 0.28 : zd.type === "brute" ? 0.55 : 0.4;
        hooks.sndGrowl && hooks.sndGrowl(zd, false);
      }
    }
    zd.state = "attack";
  } else if (zd.alerted) {
    zd.grabT = 0;
    // don't stomp siren tease / existing flank
    if (zd.state !== "tease") {
      // flanking: some zombies peel off to approach from the side when crowded
      zd.crowdT -= dt;
      if (zd.crowdT <= 0) {
        zd.crowdT = 0.12;
        zd.frontCount = 0;
        for (var fi = 0; fi < Z.zeds.length; fi++) {
          var oz = Z.zeds[fi];
          if (oz === zd || oz.dead || !oz.alerted) continue;
          // measure directly: oz.dist is only refreshed when that zed steps,
          // so half the horde would be judged on last frame's positions
          if (Math.hypot(oz.x - Z.p.x, oz.z - Z.p.z) < 200) zd.frontCount++;
        }
      }
      if (zd.frontCount >= 2 && dist > 140 && dist < 700 && rnd() < dt * 0.8) {
        zd.state = "flank";
        var side = zd.flankSign || (rnd() < 0.5 ? -1 : 1);
        zd.flankSign = side;
        var px = Math.sin(Z.p.yaw),
          pz = Math.cos(Z.p.yaw),
          rx = -pz,
          rz = px;
        zd.flankX = Z.p.x + rx * side * rr(140, 260) - px * 40;
        zd.flankZ = Z.p.z + rz * side * rr(140, 260) - pz * 40;
      } else if (zd.state !== "flank" || dist < 120) zd.state = "chase";
    }
  } else if (zd.state !== "wander" && rnd() < dt * 0.2) {
    zd.state = "wander";
    var b = interiorBounds();
    if (b) {
      zd.wander.x = rr(b.minx + 60, b.maxx - 60);
      zd.wander.z = rr(b.minz + 60, b.maxz - 60);
    }
  }

  // --- steering
  var tx, tz;
  if (zd.burn > 0 && zd.panicT > 0) {
    // blind: it runs away from whatever last hurt it, not toward you
    tx = zd.x - (Z.p.x - zd.x);
    tz = zd.z - (Z.p.z - zd.z);
  } else if (zd.state === "tease") {
    // hold ground and face the player
    tx = zd.x;
    tz = zd.z;
  } else if (zd.state === "flank" && zd.flankX != null) {
    tx = zd.flankX;
    tz = zd.flankZ;
    if (Math.hypot(tx - zd.x, tz - zd.z) < 50) zd.state = "chase";
  } else if (zd.state === "chase" || zd.state === "attack") {
    // lead the player slightly when sprinting (runners predict)
    var lead = zd.type === "runner" ? 0.18 : 0.05;
    tx = Z.p.x + (Z.p.vx || 0) * lead;
    tz = Z.p.z + (Z.p.vz || 0) * lead;
  } else {
    tx = zd.wander.x;
    tz = zd.wander.z;
    if (Math.hypot(tx - zd.x, tz - zd.z) < 40 && rnd() < dt * 2) zd.state = "idle";
  }
  var ang = Math.atan2(tx - zd.x, tz - zd.z);
  // wall feelers: probe left/right and slide along obstacles (crude but it
  // gets them through doorways, which is all a house needs)
  zd.feel += dt;
  if (zd.feel > 0.1) {
    zd.feel = 0;
    var probe = zd.type === "brute" ? 78 : 64,
      best = ang,
      found = false;
    for (var o = 0; o <= 6 && !found; o++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var a2 = ang + sgn * o * 0.32;
        if (
          !blockedAt(
            zd.x + Math.sin(a2) * probe,
            zd.z + Math.cos(a2) * probe,
            20, zd.y, zd.crawler ? 60 : 160, STEP
          )
        ) {
          best = a2;
          found = true;
          break;
        }
        if (o === 0) break;
      }
    }
    zd.steer = best;
  }
  var mv = zd.steer != null ? zd.steer : ang;
  var spd = zd.spd * (zd.stagger > 0 ? 0.12 : 1) * (zd.state === "attack" ? 0.18 : 1);
  if (zd.state === "tease") spd *= 0.08; // almost still while posing
  if (zd.windup > 0) spd *= 0.25;
  if (zd.grabbing) spd *= 0.05;
  // on fire: a blind panic sprint first, then a failing shamble
  if (zd.burn > 0) spd *= zd.panicT > 0 ? 1.55 : 0.82;
  // sirens approach a little slower so you watch them longer
  if (zd.siren && zd.state === "chase") spd *= 0.82;
  // runners burst when they first spot you
  if (zd.type === "runner" && zd.alerted) {
    if (zd.burstT == null) zd.burstT = 1.8;
    if (zd.burstT > 0) {
      zd.burstT -= dt;
      spd *= 1.22;
    }
  }
  _zedMovePoint.x = zd.x;
  _zedMovePoint.z = zd.z;
  var zR = zd.crawler ? 18 : zd.type === "brute" ? 26 : 22;
  moveCircle(
    _zedMovePoint,
    Math.sin(mv) * spd * dt,
    Math.cos(mv) * spd * dt,
    zR,
    zd.y,
    zd.crawler ? 60 : 160,
    STEP
  );
  zd.x = _zedMovePoint.x;
  zd.z = _zedMovePoint.z;
  // Separation is stable at 15–20 Hz; running this O(n²) pass every rendered
  // frame was wasted CPU in hordes.
  zd.sepT -= dt;
  if (zd.sepT <= 0) {
    zd.sepT = 0.06;
    for (var s = 0; s < Z.zeds.length; s++) {
      var ot = Z.zeds[s];
      if (ot === zd || ot.dead) continue;
      var sx = zd.x - ot.x,
        sz = zd.z - ot.z,
        sd = Math.hypot(sx, sz),
        minD = zd.type === "brute" ? 52 : 40;
      if (sd < minD && sd > 0.01) {
        var push = (minD - sd) * 0.55;
        zd.x += (sx / sd) * push;
        zd.z += (sz / sd) * push;
      }
    }
  }
  // open doors by walking into them (brutes smash faster)
  zd.doorT -= dt;
  if (Z.col && zd.alerted && zd.doorT <= 0) {
    zd.doorT = 0.16;
    Z.col.doorSegs.forEach(function (ds) {
      if (!ds.pivot || ds.pivot.userData.open) return;
      var mx = (ds.ax + ds.bx) / 2,
        mz = (ds.az + ds.bz) / 2;
      var need = zd.type === "brute" ? 95 : 68;
      if (Math.hypot(zd.x - mx, zd.z - mz) < need) {
        ds.pivot.userData.open = true;
        Z.doorsOpened.push(ds.pivot);
        hooks.sndDoor && hooks.sndDoor(mx, mz);
        if (zd.type === "brute") {
          shake(0.35);
          sparkBurst(mx, 100, mz, 0, 1, 0, 10, true);
        }
      }
    });
  }

  // ground follow (they climb onto furniture the same way the player does)
  var g = groundAt(zd.x, zd.z, zd.y, STEP);
  if (g > zd.y) zd.y = Math.min(g, zd.y + 200 * dt);
  else {
    zd.vy -= GRAV * dt;
    zd.y += zd.vy * dt;
    if (zd.y <= g) {
      zd.y = g;
      zd.vy = 0;
    }
  }
  // face travel (or face player while teasing / attacking)
  var facePlayer = Math.atan2(Z.p.x - zd.x, Z.p.z - zd.z);
  var face = zd.state === "tease" || zd.state === "attack" || zd.grabbing ? facePlayer : mv;
  var dh = face - zd.head;
  while (dh > Math.PI) dh -= 6.283;
  while (dh < -Math.PI) dh += 6.283;
  zd.head += dh * Math.min(1, dt * (zd.state === "tease" ? 4 : zd.type === "runner" ? 9 : 6));
  zd.root.position.set(zd.x, zd.y, zd.z);
  zd.root.rotation.y = zd.head;

  // idle growls, panned in 3D
  zd.growlT -= dt;
  if (zd.growlT <= 0) {
    zd.growlT = rr(2.2, 7.5) / (zd.alerted ? 2.2 : 1);
    if (dist < 1500) hooks.sndGrowl && hooks.sndGrowl(zd, false);
  }
  if (!deferVisuals) stepZedVisuals(zd, dt);
}

export function removeZed(zd) {
  Z.grp.remove(zd.root);
  zd.root.traverse(function (o) {
    if (o.isMesh && ownsGeo(o.geometry)) o.geometry.dispose();
  });
  var i = Z.zeds.indexOf(zd);
  if (i >= 0) Z.zeds.splice(i, 1);
}

/* ---- fire ----------------------------------------------------------------
   A burning zombie keeps coming — that is the point of it. Fire is damage over
   time plus panic: they sprint, they flail, they light the room, and anything
   they blunder into catches too, so a corridor of them cooks itself.          */
export function igniteZed(zd, seconds) {
  if (!zd || zd.dead) return;
  var fresh = !(zd.burn > 0);
  zd.burn = Math.max(zd.burn || 0, seconds || 4);
  if (fresh) {
    zd.panicT = rr(1.4, 2.6);
    hooks.sndScream && rnd() < 0.5 && hooks.sndScream(zd);
    if (zd.rig && zd.rig.root) {
      // one small light per burning body — capped by the alive cap already
      var fl = zd.fireLight;
      if (!fl) {
        fl = new THREE.PointLight(0xff6818, legacyIntensity(3.6, 420), 420, 2);
        fl.position.set(0, 100, 0);
        zd.rig.root.add(fl);
        zd.fireLight = fl;
      }
      fl.intensity = legacyIntensity(3.6, 420);
    }
  }
}

export function stepBurn(zd, dt) {
  if (!(zd.burn > 0)) return;
  zd.burn -= dt;
  if (zd.panicT > 0) zd.panicT -= dt;
  if (zd.burn <= 0) {
    zd.burn = 0;
    zd.panicT = 0;
    if (zd.fireLight) zd.fireLight.intensity = 0;
    return;
  }
  // Layered flames rise from feet, torso, shoulders and head instead of two
  // generic dots around the whole bounding box.
  zd.fireT = (zd.fireT || 0) - dt;
  if (zd.fireT <= 0) {
    zd.fireT = 0.035;
    var sc = zd.rig && zd.rig.scale ? zd.rig.scale : 1;
    var levels = zd.crawler ? [20, 42, 62] : [24, 68, 112, 152];
    for (var i = 0; i < levels.length; i++) {
      var wide = i === 1 || i === 2 ? 18 : 12;
      spawnFirePart(
        zd.x + rr(-wide, wide) * sc,
        zd.y + levels[i] * sc,
        zd.z + rr(-wide, wide) * sc,
        rr(-32, 32), rr(55, 125), rr(-32, 32),
        rr(18, 31) * sc, rr(0.35, 0.68), rr(0.55, 0.96)
      );
    }
    // Occasional soot and embers sell combustion without hiding the silhouette.
    if (rnd() < 0.34)
      spawnPart(
        zd.x + rr(-15, 15), zd.y + rr(80, 165) * sc, zd.z + rr(-15, 15),
        rr(-18, 18), rr(70, 125), rr(-18, 18), rr(9, 17),
        0.18, 0.13, 0.09, rr(0.55, 1.0), -GRAV * 0.05
      );
  }
  if (zd.fireLight) zd.fireLight.intensity = legacyIntensity(2.8 + Math.sin(Z.t * 26 + zd.phase) * 1.2, 420);
  if (zd.dead) return;
  // ~9 dps, and it does not care about armour or range
  zd.hp -= dt * 9;
  // fire spreads by contact: a burning body is a torch walking into a crowd
  zd.spreadT = (zd.spreadT || 0) - dt;
  if (zd.spreadT <= 0) {
    zd.spreadT = 0.25;
    for (var s = 0; s < Z.zeds.length; s++) {
      var o = Z.zeds[s];
      if (o === zd || o.dead || o.burn > 0) continue;
      if (Math.hypot(o.x - zd.x, o.z - zd.z) < 55) igniteZed(o, rr(3, 5));
    }
  }
  if (zd.hp <= 0) {
    killZed(zd, { x: 0, y: 1, z: 0 }, false, "burn");
    if (zd.burn > 0) zd.burn = 2.5; // keep smouldering on the corpse
  }
}

export function screamerCall(zd) {
  hooks.sndScream && hooks.sndScream(zd);
  Z.zeds.forEach(function (o) {
    if (o !== zd && !o.dead && Math.hypot(o.x - zd.x, o.z - zd.z) < 2200) {
      o.alerted = true;
      o.state = "chase";
    }
  });
  hooks.say && hooks.say(t("z_screamer"), 1.6);
  hooks.flashScreen && hooks.flashScreen("#7a0d18", 0.35);
}

// gunfire draws everything nearby
export function makeNoise(x, z, radius) {
  Z.zeds.forEach(function (o) {
    if (o.dead || o.alerted) return;
    if (Math.hypot(o.x - x, o.z - z) < radius) {
      o.alerted = true;
      o.state = "chase";
    }
  });
  alertCritters(x, z, radius);
}

/* ===========================================================================
   TOXIC ACID CLOUD (Bloater Death Effect)
   =========================================================================== */
var ACID_CLOUDS = [];

export function spawnAcidCloud(x, y, z) {
  ACID_CLOUDS.push({
    x: x, y: y, z: z,
    r: 30, maxR: 140,
    life: 6.5, maxLife: 6.5,
  });

  // Sound sizzle
  if (Z.audio && Z.audio.ctx && Z.audio.ctx.state === "running") {
    var ctx = Z.audio.ctx;
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(70, now + 0.5);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  }
}

export function stepAcidClouds(dt) {
  if (!Z.active || Z.paused) return;
  for (var i = ACID_CLOUDS.length - 1; i >= 0; i--) {
    var cloud = ACID_CLOUDS[i];
    cloud.life -= dt;
    var k = 1 - (cloud.life / cloud.maxLife);
    cloud.r = 30 + (cloud.maxR - 30) * Math.min(1, k * 2.2);

    // Green acid motes
    if (rnd() < 0.65) {
      spawnFirePart(
        cloud.x + rr(-cloud.r * 0.5, cloud.r * 0.5),
        cloud.y + rr(-10, 25),
        cloud.z + rr(-cloud.r * 0.5, cloud.r * 0.5),
        { x: rr(-20, 20), y: rr(15, 38), z: rr(-20, 20) },
        0.05,
        rr(18, 36)
      );
    }

    // Damage player inside cloud
    if (Z.p && !Z.p.dead) {
      var dPlayer = Math.hypot(Z.p.x - cloud.x, Z.p.z - cloud.z);
      if (dPlayer < cloud.r && Math.abs(Z.p.y - cloud.y) < 120) {
        Z.p.hp = Math.max(0, Z.p.hp - 8 * dt);
        Z.p.hurtT = Math.max(Z.p.hurtT || 0, 0.35);
        if (Z.hud && Z.hud.vig) {
          Z.hud.vig.style.setProperty("--z-green", "0.65");
        }
      }
    }

    if (cloud.life <= 0) {
      ACID_CLOUDS.splice(i, 1);
    }
  }
}

export function clearAcidClouds() {
  ACID_CLOUDS = [];
}

/* ===========================================================================
   DYNAMIC WEATHER — Lightning Flashes & Rolling Thunder
   =========================================================================== */
var WEATHER = {
  timer: rr(12, 22),
  flashT: 0,
  thunderDelay: 0,
  thunderDist: 0,
};

export function stepWeather(dt) {
  if (!Z.active || Z.paused) return;
  WEATHER.timer -= dt;
  if (WEATHER.timer <= 0) {
    WEATHER.timer = rr(14, 32);
    triggerLightning();
  }

  if (WEATHER.thunderDelay > 0) {
    WEATHER.thunderDelay -= dt;
    if (WEATHER.thunderDelay <= 0) {
      playThunder(WEATHER.thunderDist);
    }
  }
}

export function triggerLightning() {
  WEATHER.flashT = rr(0.12, 0.25);
  WEATHER.thunderDist = rr(800, 2400);
  WEATHER.thunderDelay = (WEATHER.thunderDist / 3400); // sound speed delay

  if (hooks.flashScreen) {
    hooks.flashScreen("#d0e4ff", WEATHER.flashT);
  }
  alertCritters(Z.p ? Z.p.x : 0, Z.p ? Z.p.z : 0, 1800);
}

function playThunder(dist) {
  if (!Z.audio || !Z.audio.ctx || Z.audio.ctx.state !== "running") return;
  var ctx = Z.audio.ctx;
  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  var filter = ctx.createBiquadFilter();
  var gain = ctx.createGain();

  var dur = rr(1.8, 3.5);
  var att = Math.max(0.1, 1 - dist / 2800);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(rr(45, 75), now);
  osc.frequency.exponentialRampToValueAtTime(rr(25, 40), now + dur);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(180 * att, now);
  filter.frequency.exponentialRampToValueAtTime(60, now + dur);

  gain.gain.setValueAtTime(0.6 * att, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + dur + 0.1);
}

/* ===========================================================================
   SURFACE DECAL & DEBRIS QUERIES (Footstep Audio Modifiers)
   =========================================================================== */
export function isNearBloodDecal(px, pz) {
  if (!Z.decals || !Z.decals.list) return false;
  for (var i = 0; i < Z.decals.list.length; i++) {
    var d = Z.decals.list[i];
    if (d.visible && d.position.y < 5) {
      if (Math.hypot(d.position.x - px, d.position.z - pz) < 45) return true;
    }
  }
  return false;
}

export function isNearGlassDebris(px, pz) {
  if (Z.frags && Z.frags.length) {
    for (var i = 0; i < Z.frags.length; i++) {
      var f = Z.frags[i];
      if (f.g && Math.hypot(f.x - px, f.z - pz) < 55) return true;
    }
  }
  return false;
}

// Kart-racer layer for the micro RC race (js/rc.js): item boxes, coins, boost
// pads and the throwables that make a race feel like a kart game — bananas,
// green/red shells, bob-ombs, mushrooms, the star, lightning and the spiny
// (blue) shell that hunts the leader.
//
// rc.js owns the cars, the 2.5D collision model and the track; it injects those
// internals once through kartInit(env). This module never touches them
// directly — it reads the world through `E` and writes item state back onto the
// car objects (item/itemN/coins/boostT/spinT/starT/smallT), which rc.js honours
// inside carPhysics. Keeping the split here means the driving model stays in
// one file and everything item-shaped stays in this one.
import * as THREE from "three";
import { clamp } from "./state.js";
import { getMainScene } from "./view3d.js";

var E = null; // env from rc.js — see kartInit()

// ---- tuning (cm, ms) --------------------------------------------------------
var SAMP = 6, // track polyline sampling step
  BOX_S = 3.4, // item box edge (a touch under the 3.8cm truck)
  BOX_Y = 2.8, // box center above its surface
  BOX_RESPAWN = 4000,
  LANE = 7, // lateral gap between the three boxes of a row
  ROW_SPACING = 195, // arc length between item-box rows
  COIN_SPACING = 40,
  COIN_Y = 2.2,
  PAD_SPACING = 300,
  PICK_R = 5, // car center → pickup collect radius
  SHELL_V = 205,
  SHELL_R = 1.7,
  SHELL_LIFE = 6500,
  RED_TURN = 4.6, // rad/s homing rate for the red shell
  BOMB_FUSE = 1150,
  BLAST_R = 18,
  SPINY_V = 250,
  SPIN_MS = 1150, // spin-out after a shell / banana
  SQUASH_MS = 1550, // longer flat-out after a blast
  STAR_MS = 7000,
  SMALL_MS = 6500,
  BOOST_MUSH = 1500,
  BOOST_PAD = 950,
  LOOSE_MS = 9000, // how long a dropped coin lingers
  MAX_COINS = 10,
  FX_MAX = 190;

// item table: [kind, weight when leading, weight when last]. The roll lerps
// between the two columns on the racer's normalised position, so the front runner
// gets bananas and shells while the tail of the field gets the panic buttons.
var TABLE = [
  ["banana", 34, 4],
  ["green", 30, 8],
  ["red", 10, 15],
  ["mush", 9, 20],
  ["mush3", 2, 13],
  ["bomb", 4, 11],
  ["star", 0, 12],
  ["bolt", 0, 7],
  ["spiny", 0, 10],
];
var ICON = {
  banana: "🍌",
  green: "🟢",
  red: "🔴",
  mush: "🍄",
  mush3: "🍄",
  bomb: "💣",
  star: "⭐",
  bolt: "⚡",
  spiny: "🔵",
};
export var ROULETTE = ["🍌", "🟢", "🔴", "🍄", "💣", "⭐", "⚡", "🔵"];

var K = {
  on: true,
  boxes: [], // {x,y,z,grp,taken}
  coins: [], // {x,y,z,m,taken,loose,born}
  pads: [], // {x,y,z,ux,uz,grp,chev:[]}
  shots: [], // live projectiles + dropped hazards
  fx: [], // particles
  held: [], // {car,kind,m} — the item model floating over each kart
  A: null, // shared geometry/material cache
};

export function kartInit(env) {
  E = env;
}
export function kartSetOn(on) {
  K.on = !!on;
}
export function kartIsOn() {
  return K.on;
}
export function kartItemIcon(kind) {
  return ICON[kind] || "";
}

// ---- canvas art -------------------------------------------------------------
// Every prop in here is a couple of centimetres across on screen, so detail has
// to come from texture and light rather than triangles. These little canvases
// are built once and cached in K.A next to the geometry, which means
// disposeAssets() sweeps them up with everything else.
function canvas2d(w, h) {
  var c = document.createElement("canvas");
  c.width = w;
  c.height = h || w;
  return c;
}
function texFrom(c) {
  var t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
function roundRectPath(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.lineTo(rx + w - r, ry);
  x.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
  x.lineTo(rx + w, ry + h - r);
  x.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
  x.lineTo(rx + r, ry + h);
  x.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
  x.lineTo(rx, ry + r);
  x.quadraticCurveTo(rx, ry, rx + r, ry);
  x.closePath();
}
function starPath(x, cx, cy, rOut, rIn, pts) {
  x.beginPath();
  for (var i = 0; i < pts * 2; i++) {
    var a = -Math.PI / 2 + (i * Math.PI) / pts,
      r = i % 2 ? rIn : rOut;
    var px = cx + Math.cos(a) * r,
      py = cy + Math.sin(a) * r;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.closePath();
}
// soft radial falloff — the workhorse behind every glow, halo and light pool
function glowTexture() {
  var c = canvas2d(128),
    x = c.getContext("2d");
  var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.62)");
  g.addColorStop(0.55, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return texFrom(c);
}
// frosted panel with a fat "?" — mapped onto all six faces of the item box
function boxTexture() {
  var c = canvas2d(128),
    x = c.getContext("2d");
  var g = x.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, "rgba(128,231,255,0.88)");
  g.addColorStop(0.5, "rgba(20,150,208,0.72)");
  g.addColorStop(1, "rgba(150,243,255,0.88)");
  roundRectPath(x, 5, 5, 118, 118, 16);
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = "rgba(236,253,255,0.95)";
  x.lineWidth = 6;
  x.stroke();
  // gold glyph with a dark outline: the box is see-through, so the "?" has to
  // hold up against a bright floor behind it as well as a dark wall
  x.font = "bold 96px system-ui, -apple-system, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.lineJoin = "round";
  x.lineWidth = 11;
  x.strokeStyle = "rgba(14,44,64,0.95)";
  x.strokeText("?", 64, 70);
  x.shadowColor = "rgba(255,214,80,0.9)";
  x.shadowBlur = 14;
  x.fillStyle = "#ffd23d";
  x.fillText("?", 64, 70);
  return texFrom(c);
}
// coin face: struck gold with a raised star
function coinTexture() {
  var c = canvas2d(128),
    x = c.getContext("2d");
  var g = x.createRadialGradient(46, 42, 4, 64, 64, 64);
  g.addColorStop(0, "#fff8d6");
  g.addColorStop(0.42, "#ffcd3c");
  g.addColorStop(1, "#b8790c");
  x.beginPath();
  x.arc(64, 64, 63, 0, Math.PI * 2);
  x.fillStyle = g;
  x.fill();
  x.beginPath();
  x.arc(64, 64, 55, 0, Math.PI * 2);
  x.strokeStyle = "rgba(122,78,6,0.75)";
  x.lineWidth = 5;
  x.stroke();
  x.beginPath();
  x.arc(64, 64, 50, 0, Math.PI * 2);
  x.strokeStyle = "rgba(255,246,205,0.7)";
  x.lineWidth = 2;
  x.stroke();
  starPath(x, 66, 68, 31, 13, 5);
  x.fillStyle = "rgba(120,74,4,0.55)"; // drop shadow = struck relief
  x.fill();
  starPath(x, 64, 65, 31, 13, 5);
  x.fillStyle = "#ffe9a0";
  x.fill();
  x.strokeStyle = "rgba(150,96,8,0.8)";
  x.lineWidth = 2.5;
  x.stroke();
  return texFrom(c);
}
// boost pad plate: dark rounded slab, hot border, chevron-free (those are mesh)
function padTexture() {
  var c = canvas2d(128, 176),
    x = c.getContext("2d");
  roundRectPath(x, 9, 9, 110, 158, 26);
  var g = x.createLinearGradient(0, 176, 0, 0);
  g.addColorStop(0, "rgba(4,20,32,0.94)");
  g.addColorStop(0.55, "rgba(9,48,72,0.9)");
  g.addColorStop(1, "rgba(16,86,120,0.9)");
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = "rgba(126,242,255,0.95)";
  x.lineWidth = 8;
  x.stroke();
  x.strokeStyle = "rgba(255,255,255,0.7)";
  x.lineWidth = 2.5;
  x.stroke();
  // hazard ticks along the flanks
  x.fillStyle = "rgba(126,242,255,0.32)";
  for (var i = 0; i < 7; i++) {
    x.fillRect(16, 26 + i * 21, 9, 12);
    x.fillRect(103, 26 + i * 21, 9, 12);
  }
  return texFrom(c);
}
// shell carapace: base colour, banding and (for the red one) its spots
function shellTexture(kind) {
  var c = canvas2d(128, 64),
    x = c.getContext("2d");
  var base =
    kind === "green" ? "#2fae4c" : kind === "red" ? "#d22b1e" : "#2452b8";
  var lit = kind === "green" ? "#7ce88b" : kind === "red" ? "#ff8a72" : "#6fa4ff";
  var g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, lit);
  g.addColorStop(0.45, base);
  g.addColorStop(1, kind === "green" ? "#186b32" : kind === "red" ? "#8d1710" : "#122f78");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 64);
  // segment seams running down the dome
  x.strokeStyle = "rgba(0,0,0,0.22)";
  x.lineWidth = 3;
  for (var i = 0; i < 8; i++) {
    x.beginPath();
    x.moveTo(i * 16 + 8, 0);
    x.lineTo(i * 16 + 8, 64);
    x.stroke();
  }
  if (kind === "red" || kind === "spiny") {
    x.fillStyle = kind === "red" ? "rgba(255,244,226,0.95)" : "rgba(226,238,255,0.85)";
    for (var s = 0; s < 6; s++) {
      x.beginPath();
      x.ellipse(12 + s * 21, 30 + (s % 2 ? 10 : -6), 8, 6, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  return texFrom(c);
}
// mushroom cap — white blobs on a red dome
function mushTexture() {
  var c = canvas2d(128, 64),
    x = c.getContext("2d");
  var g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "#ff7a6a");
  g.addColorStop(1, "#c81f18");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = "#fff6ec";
  var spots = [[18, 34, 11], [52, 26, 8], [86, 36, 12], [114, 24, 7], [70, 50, 6]];
  spots.forEach(function (s) {
    x.beginPath();
    x.arc(s[0], s[1], s[2], 0, Math.PI * 2);
    x.fill();
  });
  return texFrom(c);
}

// ---- shared assets ----------------------------------------------------------
function assets() {
  if (K.A) return K.A;
  var boxGeo = new THREE.BoxGeometry(BOX_S, BOX_S, BOX_S);
  var glowTex = glowTexture();
  var A = {
    glowTex: glowTex,
    boxTex: boxTexture(),
    coinTex: coinTexture(),
    padTex: padTexture(),
    boxGeo: boxGeo,
    boxEdge: new THREE.EdgesGeometry(boxGeo),
    boxMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x2aa6d0,
      emissiveIntensity: 0.35,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 1, // alpha comes from the map — the panel itself is glassy
      depthWrite: false,
    }),
    edgeMat: new THREE.LineBasicMaterial({
      color: 0xeafcff,
      transparent: true,
      opacity: 0.9,
    }),
    coreGeo: new THREE.OctahedronGeometry(1, 0),
    coreMat: new THREE.MeshStandardMaterial({
      color: 0xffd23d,
      emissive: 0xffa000,
      emissiveIntensity: 1.1,
      roughness: 0.22,
      metalness: 0.8,
    }),
    haloMat: new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x9ae8ff,
      transparent: true,
      opacity: 0.13, // additive on a lit interior blows out fast — keep it faint
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    }),
    poolGeo: new THREE.PlaneGeometry(BOX_S * 2.2, BOX_S * 2.2),
    poolMat: new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0x63d8ff,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    coinGeo: new THREE.CylinderGeometry(1, 1, 0.26, 20, 1),
    coinFaceMat: new THREE.MeshStandardMaterial({
      map: null, // filled in below (needs A.coinTex)
      color: 0xffffff,
      emissive: 0xffae12,
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.9,
    }),
    coinRimMat: new THREE.MeshStandardMaterial({
      color: 0xe2a415,
      emissive: 0x6b4400,
      roughness: 0.3,
      metalness: 0.95,
    }),
    padMat: new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    chevMat: new THREE.MeshBasicMaterial({
      color: 0x3fd0ff,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    railGeo: new THREE.BoxGeometry(0.9, 0.9, 23),
    railMat: new THREE.MeshBasicMaterial({
      color: 0x5fe6ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    sparkGeo: new THREE.TetrahedronGeometry(0.55),
    ringGeo: new THREE.RingGeometry(0.72, 1, 26),
  };
  A.coinGeo.rotateX(Math.PI / 2); // face sideways, spin about Y
  A.boxMat.map = A.boxTex;
  A.boxMat.emissiveMap = A.boxTex; // the "?" glows instead of going flat
  A.coinFaceMat.map = A.coinTex;
  A.padMat.map = A.padTex;
  A.ringGeo.rotateX(-Math.PI / 2);
  A.poolGeo.rotateX(-Math.PI / 2);
  K.A = A;
  return A;
}
function disposeAssets() {
  if (!K.A) return;
  for (var k in K.A) if (K.A[k] && K.A[k].dispose) K.A[k].dispose();
  K.A = null;
}
function disposeObj(o) {
  if (!o) return;
  o.traverse(function (c) {
    // a Sprite's geometry is a module-level singleton inside three — disposing
    // it would take out every sprite in the app, not just this prop
    if (c.geometry && c.geometry.dispose && !c.isSprite && !shared(c.geometry))
      c.geometry.dispose();
    if (c.material && c.material.dispose && !shared(c.material))
      c.material.dispose();
  });
}
function shared(x) {
  if (!K.A) return false;
  for (var k in K.A) if (K.A[k] === x) return true;
  return false;
}

// ---- track furniture --------------------------------------------------------
// even-length polyline through the waypoint loop, carrying the tangent so rows
// of boxes / boost pads can sit square across the racing line
function sampleLoop(wps) {
  var out = [],
    N = wps.length;
  for (var i = 0; i < N; i++) {
    var a = wps[i],
      b = wps[(i + 1) % N];
    var dx = b.x - a.x,
      dz = b.z - a.z,
      L = Math.hypot(dx, dz);
    if (L < 1e-3) continue;
    var n = Math.max(1, Math.round(L / SAMP));
    for (var k = 0; k < n; k++) {
      var u = k / n;
      out.push({
        x: a.x + dx * u,
        z: a.z + dz * u,
        y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * u,
        ux: dx / L,
        uz: dz / L,
      });
    }
  }
  return out;
}
// drivable height at a spot on the line — falls back to the line's own height
// so pickups on a bridge deck don't snap down to the floor below
function surfAt(x, z, y) {
  var g = E.groundAt(x, z, y + 5, 6);
  return g < y - 8 ? y : g;
}

// The box is built in layers so each can be animated on its own: the glass
// shell tumbles, the core counter-spins, and the halo/light pool stay upright
// (a rotating billboard or a tilted light pool on the floor reads as a bug).
function makeBox(x, y, z) {
  var A = assets();
  var g = new THREE.Group();
  g.userData.rc = true;
  var spin = new THREE.Group();
  spin.add(new THREE.Mesh(A.boxGeo, A.boxMat));
  spin.add(new THREE.LineSegments(A.boxEdge, A.edgeMat));
  g.add(spin);
  var core = new THREE.Mesh(A.coreGeo, A.coreMat);
  core.scale.setScalar(0.62);
  g.add(core);
  var halo = new THREE.Sprite(A.haloMat);
  halo.scale.setScalar(BOX_S * 1.7);
  g.add(halo);
  var pool = new THREE.Mesh(A.poolGeo, A.poolMat);
  pool.position.y = -BOX_Y + 0.25; // sits on the deck under the floating box
  g.add(pool);
  g.position.set(x, y + BOX_Y, z);
  getMainScene().add(g);
  return {
    x: x,
    y: y + BOX_Y,
    z: z,
    grp: g,
    spin: spin,
    core: core,
    halo: halo,
    pool: pool,
    taken: 0,
    ph: Math.random() * 6.28, // per-box phase so a row doesn't pulse in lockstep
  };
}
function makeCoin(x, y, z, loose) {
  var A = assets();
  // one mesh, three material groups: [rim, cap, cap] — the struck face is a
  // texture, which is far cheaper than modelling relief at 2cm across
  var m = new THREE.Mesh(A.coinGeo, [A.coinRimMat, A.coinFaceMat, A.coinFaceMat]);
  m.userData.rc = true;
  m.castShadow = true;
  m.position.set(x, y + COIN_Y, z);
  getMainScene().add(m);
  return {
    x: x,
    y: y + COIN_Y,
    z: z,
    m: m,
    taken: 0,
    loose: !!loose,
    born: performance.now(),
  };
}
function chevronGeo() {
  var s = new THREE.Shape();
  s.moveTo(-3.8, -1.8);
  s.lineTo(0, 1.3);
  s.lineTo(3.8, -1.8);
  s.lineTo(3.8, 0.3);
  s.lineTo(0, 3.4);
  s.lineTo(-3.8, 0.3);
  s.closePath();
  var g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // shape +y → world +z (the pad's travel direction)
  return g;
}
function makePad(p, y) {
  var A = assets();
  var g = new THREE.Group();
  g.userData.rc = true;
  var plate = new THREE.Mesh(new THREE.PlaneGeometry(17, 24), A.padMat);
  plate.rotation.x = -Math.PI / 2;
  g.add(plate);
  // glowing kerb rails down both flanks give the pad some height on screen
  for (var r = -1; r <= 1; r += 2) {
    var rail = new THREE.Mesh(A.railGeo, A.railMat);
    rail.position.set(r * 8.1, 0.45, 0);
    g.add(rail);
  }
  var chev = [];
  for (var i = 0; i < 3; i++) {
    var c = new THREE.Mesh(chevronGeo(), A.chevMat.clone());
    c.position.set(0, 0.25, -7.7 + i * 7.7);
    g.add(c);
    chev.push(c);
  }
  g.position.set(p.x, y + 0.6, p.z);
  g.rotation.y = Math.atan2(p.ux, p.uz); // local +Z = travel direction
  getMainScene().add(g);
  return { x: p.x, y: y, z: p.z, ux: p.ux, uz: p.uz, grp: g, chev: chev };
}

// lay item-box rows, coin trails and boost pads along the racing line.
// opts.pads = spots the track builder specifically wants a boost strip on
// (the run-in to a jump), on top of the ones found on the straights.
export function kartBuild(wps, opts) {
  kartClear();
  if (!K.on || !wps || wps.length < 3) return;
  ((opts && opts.pads) || []).forEach(function (p) {
    K.pads.push(makePad(p, p.y));
  });
  var pts = sampleLoop(wps);
  if (pts.length < 10) return;
  // scale the spacing to the lap so a pokey one-bedroom loop still gets a
  // handful of item rows and a mansion circuit doesn't drown in them
  var lap = pts.length * SAMP;
  var rowGap = clamp(lap / 4.5, 105, ROW_SPACING),
    padGap = clamp(lap / 3, 140, PAD_SPACING);
  var arc = 0,
    nextRow = rowGap * 0.5,
    nextCoin = 24,
    nextPad = padGap * 0.7;
  var line = wps[0]; // keep the starting grid itself clear
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    arc += SAMP;
    if (Math.hypot(p.x - line.x, p.z - line.z) < 45) continue;
    var px = -p.uz,
      pz = p.ux; // lateral
    if (arc >= nextRow) {
      nextRow = arc + rowGap;
      nextCoin = arc + 34; // no coins right under the boxes
      for (var l = -1; l <= 1; l++) {
        var bx = p.x + px * (l * LANE),
          bz = p.z + pz * (l * LANE);
        if (E.blockedAt(bx, bz, 3, p.y, E.CAR_CLEAR, E.STEP_H)) continue;
        K.boxes.push(makeBox(bx, surfAt(bx, bz, p.y), bz));
      }
    } else if (arc >= nextCoin) {
      nextCoin = arc + COIN_SPACING;
      var off = ((K.coins.length % 5) - 2) * 4.5; // gentle weave
      var cx = p.x + px * off,
        cz = p.z + pz * off;
      if (!E.blockedAt(cx, cz, 2.5, p.y, E.CAR_CLEAR, E.STEP_H))
        K.coins.push(makeCoin(cx, surfAt(cx, cz, p.y), cz, false));
    }
    if (arc >= nextPad && straightAt(pts, i)) {
      nextPad = arc + padGap;
      if (!E.blockedAt(p.x, p.z, 6, p.y, E.CAR_CLEAR, E.STEP_H))
        K.pads.push(makePad(p, surfAt(p.x, p.z, p.y)));
    }
  }
}
// enough clear run either side of this sample to lay a 34cm boost pad down
function straightAt(pts, i) {
  var a = pts[i],
    b = pts[(i + 3) % pts.length],
    c = pts[(i - 3 + pts.length) % pts.length];
  return a.ux * b.ux + a.uz * b.uz > 0.95 && a.ux * c.ux + a.uz * c.uz > 0.95;
}

export function kartClear() {
  var scene = getMainScene();
  if (scene) {
    K.boxes.forEach(function (b) {
      scene.remove(b.grp);
      disposeObj(b.grp);
    });
    K.coins.forEach(function (c) {
      scene.remove(c.m);
    });
    K.pads.forEach(function (p) {
      scene.remove(p.grp);
      disposeObj(p.grp);
    });
    K.shots.forEach(function (s) {
      scene.remove(s.m);
      disposeObj(s.m);
    });
    K.fx.forEach(function (f) {
      scene.remove(f.m);
      if (f.m.material && f.m.material.dispose) f.m.material.dispose();
    });
  }
  clearHeld();
  K.boxes = [];
  K.coins = [];
  K.pads = [];
  K.shots = [];
  K.fx = [];
  disposeAssets();
}

// clear only the live stuff (between races the track furniture stays put)
export function kartReset() {
  var scene = getMainScene();
  K.shots.forEach(function (s) {
    if (scene) scene.remove(s.m);
    disposeObj(s.m);
  });
  K.shots = [];
  clearHeld();
  K.coins = K.coins.filter(function (c) {
    if (!c.loose) return true;
    if (scene) scene.remove(c.m);
    return false;
  });
  K.boxes.forEach(function (b) {
    b.taken = 0;
    b.grp.visible = true;
  });
  K.coins.forEach(function (c) {
    c.taken = 0;
    c.m.visible = true;
  });
}

// ---- particles --------------------------------------------------------------
// One list drives four looks — `spark` (gravity-fed shards), `glow` (a soft
// camera-facing blob), `smoke` (buoyant and growing) and `ring` (a flat
// shockwave that expands where it was born). They all run through the same
// step, so an explosion can mix them freely without extra bookkeeping.
function fxRoom(n) {
  return K.fx.length + (n || 1) <= FX_MAX;
}
function fxPush(m, o) {
  var scene = getMainScene();
  if (!scene) return null;
  m.userData.rc = true;
  scene.add(m);
  K.fx.push({
    m: m,
    kind: o.kind || "spark",
    vx: o.vx || 0,
    vy: o.vy || 0,
    vz: o.vz || 0,
    grav: o.grav == null ? 0.55 : o.grav,
    drag: o.drag || 0,
    grow: o.grow || 0,
    spin: o.spin == null ? 1 : o.spin,
    op: o.op == null ? 1 : o.op,
    s0: m.scale.x,
    t0: o.now || performance.now(),
    life: o.life || 0.5,
  });
  return m;
}
// soft additive blob — the base of nearly every flash, trail and burst
function glowMesh(color, size, op) {
  var m = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: assets().glowTex,
      color: color,
      transparent: true,
      opacity: op == null ? 0.9 : op,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  m.scale.setScalar(size);
  return m;
}
function shardMesh(color, size) {
  var m = new THREE.Mesh(
    assets().sparkGeo,
    new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  m.scale.setScalar(size);
  return m;
}
function smokeMesh(color, size) {
  var m = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: assets().glowTex,
      color: color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  m.scale.setScalar(size);
  return m;
}
// flat expanding ring, laid on the surface it was spawned over
function shockwave(x, y, z, color, r, life) {
  if (!fxRoom(1)) return;
  var m = new THREE.Mesh(
    assets().ringGeo,
    new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  // the ring's outer radius is 1, so scale IS the radius in cm
  m.scale.setScalar(r * 0.25);
  m.position.set(x, y, z);
  fxPush(m, { kind: "ring", grav: 0, spin: 0, grow: r * 0.75, life: life || 0.45, op: 0.85 });
}
// generic burst: a bright core, a ring of glows and a few hard sparks so the
// silhouette doesn't read as pure fog
function puff(x, y, z, n, color, sp, size) {
  if (!getMainScene() || !fxRoom(n)) return;
  var now = performance.now(),
    sz = size || 1;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2,
      s = sp * (0.35 + Math.random() * 0.9);
    var shard = i % 3 === 2;
    var m = shard
      ? shardMesh(color, sz * (0.35 + Math.random() * 0.4))
      : glowMesh(color, sz * (1.5 + Math.random() * 1.6), 0.85);
    m.position.set(x, y, z);
    fxPush(m, {
      kind: shard ? "spark" : "glow",
      vx: Math.sin(a) * s,
      vz: Math.cos(a) * s,
      vy: sp * (0.35 + Math.random() * 0.75),
      grav: shard ? 0.55 : 0.25,
      drag: shard ? 0 : 2.2,
      grow: shard ? 0 : sz * 1.4,
      life: 0.45 + Math.random() * 0.4,
      now: now,
      op: 0.85,
    });
  }
}
// drift sparks: glints off the rear wheels, tinted by charge tier. The top tier
// also throws a flame lick so a purple mini-turbo is unmistakable.
export function kartSpark(car, tier, dt) {
  if (!K.A && !assets()) return;
  if (Math.random() > dt * (16 + tier * 12)) return;
  var col = tier >= 3 ? 0xc46bff : tier >= 2 ? 0xff9a2a : tier >= 1 ? 0x63c8ff : 0xdddddd;
  var back = -2,
    side = car.driftDir > 0 ? 1.5 : -1.5;
  var x = car.x + Math.sin(car.heading) * back + Math.cos(car.heading) * side,
    z = car.z + Math.cos(car.heading) * back - Math.sin(car.heading) * side;
  if (!getMainScene() || !fxRoom(2)) return;
  var now = performance.now();
  var m = shardMesh(col, 0.45 + tier * 0.16);
  m.position.set(x, car.y + 0.5, z);
  fxPush(m, {
    vx: (Math.random() - 0.5) * 30 - Math.sin(car.heading) * 20,
    vz: (Math.random() - 0.5) * 30 - Math.cos(car.heading) * 20,
    vy: 18 + Math.random() * 26,
    life: 0.3,
    now: now,
  });
  if (tier > 0) {
    var g = glowMesh(col, 1.1 + tier * 0.5, 0.55);
    g.position.set(x, car.y + 0.6, z);
    fxPush(g, {
      kind: "glow",
      grav: 0.1,
      drag: 3,
      grow: 1.6,
      vy: 10,
      life: 0.22,
      now: now,
      op: 0.55,
    });
  }
}
function stepFx(dt, now) {
  if (!K.fx.length) return;
  var scene = getMainScene();
  K.fx = K.fx.filter(function (f) {
    var age = (now - f.t0) / 1000,
      u = Math.min(1, age / f.life);
    if (f.kind === "ring") {
      f.m.scale.setScalar(f.s0 + f.grow * u);
      f.m.material.opacity = f.op * (1 - u) * (1 - u);
    } else {
      if (f.kind === "smoke") f.vy += (26 - f.vy * 1.4) * dt; // buoyant, damped
      else f.vy -= E.GRAV * f.grav * dt;
      if (f.drag) {
        var k = Math.max(0, 1 - f.drag * dt);
        f.vx *= k;
        f.vz *= k;
      }
      f.m.position.x += f.vx * dt;
      f.m.position.y += f.vy * dt;
      f.m.position.z += f.vz * dt;
      if (f.spin && f.m.isMesh) {
        f.m.rotation.x += dt * 9 * f.spin;
        f.m.rotation.y += dt * 7 * f.spin;
      }
      if (f.grow) f.m.scale.setScalar(f.s0 + f.grow * u);
      f.m.material.opacity = f.op * (1 - u * u);
    }
    if (age > f.life) {
      scene.remove(f.m);
      f.m.material.dispose();
      return false;
    }
    return true;
  });
}

// ---- hits -------------------------------------------------------------------
function dropCoins(car, n) {
  var have = car.coins || 0;
  n = Math.min(n, have);
  car.coins = have - n;
  for (var i = 0; i < n && K.coins.length < 220; i++) {
    var a = Math.random() * Math.PI * 2,
      d = 4 + Math.random() * 4.5;
    var x = car.x + Math.sin(a) * d,
      z = car.z + Math.cos(a) * d;
    K.coins.push(makeCoin(x, E.groundAt(x, z, car.y + 3, 4), z, true));
  }
}

// spin the car out; returns false when it was shielded (star) or already down
export function kartHit(car, now, kind) {
  if (!car || car.dead) return false;
  if (car.starT > now || car.spinT > now) return false;
  car.spinT = now + (kind === "blast" ? SQUASH_MS : SPIN_MS);
  car.spinDir = Math.random() < 0.5 ? -1 : 1;
  car.boostT = 0;
  car.driftT = 0;
  car.driftDir = 0;
  car.v *= kind === "blast" ? -0.1 : 0.2;
  if (kind === "blast") car.vy = 130;
  car.item = null;
  car.itemN = 0;
  dropCoins(car, kind === "blast" ? 3 : 2);
  puff(car.x, car.y + 1.8, car.z, kind === "blast" ? 16 : 9,
    kind === "blast" ? 0xffa02a : 0xfff0a0, kind === "blast" ? 80 : 46, 1.2);
  shockwave(car.x, car.y + 0.5, car.z, kind === "blast" ? 0xffb95e : 0xfff2b0,
    kind === "blast" ? 20 : 11, 0.34);
  E.beep(kind === "blast" ? 80 : 210, 0.18, 0.5);
  if (!car.ai) E.flash(kind === "blast" ? 0.9 : 0.6);
  return true;
}

export function kartOnWreck(car) {
  car.item = null;
  car.itemN = 0;
  car.coins = Math.floor((car.coins || 0) / 2);
}

// ---- items ------------------------------------------------------------------
function rollItem(car) {
  var cars = E.cars(),
    n = Math.max(1, cars.length);
  var f = n > 1 ? clamp(((car.place || 1) - 1) / (n - 1), 0, 1) : 0.35;
  var pool = [],
    total = 0;
  TABLE.forEach(function (row) {
    var w = row[1] + (row[2] - row[1]) * f;
    // panic items only exist for the back half of the field
    if ((row[0] === "star" || row[0] === "bolt" || row[0] === "spiny") && f < 0.34)
      w = 0;
    if (row[0] === "spiny" && n < 3) w = 0;
    if (w <= 0) return;
    total += w;
    pool.push([row[0], total]);
  });
  if (!pool.length) return "banana";
  var r = Math.random() * total;
  for (var i = 0; i < pool.length; i++) if (r <= pool[i][1]) return pool[i][0];
  return pool[pool.length - 1][0];
}

// ---- item models ------------------------------------------------------------
// These are ~3cm props seen from a chase camera a hand's width away, so the
// budget is a dozen small meshes each: silhouette first (a banana has to bend,
// a shell has to have a lip), then a texture for the surface detail.
function std(opt) {
  return new THREE.MeshStandardMaterial(opt);
}
function cachedTex(key, make) {
  var A = assets();
  if (!A[key]) A[key] = make();
  return A[key];
}
// a real crescent: a tube down a curve, then every ring pulled in toward the
// centreline so it tapers to a point at both ends instead of reading as a pipe
function bananaGeo() {
  var curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.4, -0.5, 0),
    new THREE.Vector3(-0.75, 0.32, 0),
    new THREE.Vector3(0.2, 0.6, 0),
    new THREE.Vector3(1.1, 0.18, 0),
    new THREE.Vector3(1.45, -0.42, 0),
  ]);
  var seg = 24,
    rad = 8;
  var g = new THREE.TubeGeometry(curve, seg, 0.4, rad, false);
  var pos = g.attributes.position,
    c = new THREE.Vector3();
  for (var i = 0; i <= seg; i++) {
    var t = i / seg;
    // fat through the middle, pinched at the stem and the blossom end
    var k = Math.pow(Math.sin(Math.PI * (0.1 + t * 0.8)), 0.55);
    curve.getPointAt(t, c);
    for (var j = 0; j <= rad; j++) {
      var idx = i * (rad + 1) + j;
      pos.setXYZ(
        idx,
        c.x + (pos.getX(idx) - c.x) * k,
        c.y + (pos.getY(idx) - c.y) * k,
        c.z + (pos.getZ(idx) - c.z) * k,
      );
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.rotateX(Math.PI / 2); // curve drawn in XY → lies flat in the world
  return g;
}
function bananaMesh() {
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    bananaGeo(),
    std({ color: 0xf7d64a, emissive: 0x3a2c00, roughness: 0.42, metalness: 0.05 }),
  );
  g.add(body);
  var tipMat = std({ color: 0x6a4a1c, roughness: 0.75 });
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.55, 6), tipMat);
  stem.position.set(-1.42, 0, -0.5);
  stem.rotation.x = 0.9;
  g.add(stem);
  var tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), tipMat);
  tip.position.set(1.46, 0, 0.42);
  g.add(tip);
  return g;
}
function shellMesh(kind) {
  var col = kind === "green" ? 0x3fc45a : kind === "red" ? 0xe0392b : 0x2f6bd8;
  var g = new THREE.Group();
  var dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
    std({
      map: cachedTex("shellTex_" + kind, function () {
        return shellTexture(kind);
      }),
      roughness: 0.14,
      metalness: 0.45,
      emissive: new THREE.Color(col).multiplyScalar(0.3),
    }),
  );
  g.add(dome);
  var cream = std({ color: 0xfaf0cf, roughness: 0.55 });
  // the lip where carapace meets belly — it's what makes it read as a shell
  var lip = new THREE.Mesh(new THREE.TorusGeometry(1.19, 0.14, 8, 22), cream);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.42;
  g.add(lip);
  var belly = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    cream,
  );
  belly.scale.y = 0.7; // a shallow underside — the carapace should dominate
  belly.position.y = -0.42;
  g.add(belly);
  if (kind === "spiny") {
    var spikeGeo = new THREE.ConeGeometry(0.3, 1.15, 7),
      spikeMat = std({ color: 0xeef4ff, emissive: 0x2a3c66, roughness: 0.3 });
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2;
      var s = new THREE.Mesh(spikeGeo, spikeMat);
      s.position.set(Math.sin(a) * 0.9, 0.9, Math.cos(a) * 0.9);
      s.rotation.set(Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55);
      g.add(s);
    }
    var crown = new THREE.Mesh(spikeGeo, spikeMat);
    crown.position.y = 1.6;
    crown.scale.setScalar(1.15);
    g.add(crown);
    // menace: a hot core that pulses while it hunts (stepShots drives it)
    var aura = glowMesh(0x5aa0ff, 5.5, 0.55);
    g.add(aura);
    g.userData.aura = aura;
  }
  return g;
}
function bombMesh() {
  var b = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 16, 12),
    std({ color: 0x1d2027, emissive: 0x000000, roughness: 0.32, metalness: 0.55 }),
  );
  b.add(body);
  b.userData.body = body; // flashed red as the fuse burns down
  var gold = std({ color: 0xf2c541, emissive: 0x3a2900, roughness: 0.35, metalness: 0.7 });
  // wind-up key
  var key = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 6, 14), gold);
  key.position.set(0, 0.25, -1.45);
  key.rotation.y = Math.PI / 2;
  b.add(key);
  var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.8, 6), gold);
  bar.position.set(0, 0.25, -1.45);
  bar.rotation.z = Math.PI / 2;
  b.add(bar);
  // feet and eyes: the difference between a bomb and a black ball
  for (var s = -1; s <= 1; s += 2) {
    var foot = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), gold);
    foot.scale.set(1, 0.55, 1.35);
    foot.position.set(s * 0.62, -1.24, 0.42);
    b.add(foot);
    var eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      std({ color: 0xfdfdfd, emissive: 0x333333, roughness: 0.3 }),
    );
    eye.scale.set(0.75, 1, 0.5);
    eye.position.set(s * 0.42, 0.36, 1.24);
    b.add(eye);
    var pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 6, 5),
      std({ color: 0x101010, roughness: 0.4 }),
    );
    pupil.position.set(s * 0.44, 0.34, 1.42);
    b.add(pupil);
  }
  var fuse = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.17, 1.1, 6),
    std({ color: 0xcbb489, roughness: 0.8 }),
  );
  fuse.position.y = 1.85;
  fuse.rotation.z = 0.18;
  b.add(fuse);
  var wick = glowMesh(0xffc248, 2.2, 1);
  wick.position.y = 2.55;
  b.add(wick);
  b.userData.wick = wick;
  return b;
}
function mushMesh(color) {
  var g = new THREE.Group();
  var cap = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.54),
    std({
      map: cachedTex("mushTex", mushTexture),
      color: color || 0xffffff,
      emissive: 0x3a0d09,
      roughness: 0.4,
    }),
  );
  cap.scale.y = 0.92;
  g.add(cap);
  var cream = std({ color: 0xfdf1dd, roughness: 0.6 });
  var gills = new THREE.Mesh(new THREE.CylinderGeometry(1.14, 1.05, 0.22, 18), cream);
  gills.position.y = -0.05;
  g.add(gills);
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, 1.15, 14), cream);
  stem.position.y = -0.7;
  g.add(stem);
  return g;
}
function starMesh() {
  var s = new THREE.Shape();
  for (var i = 0; i < 10; i++) {
    var a = -Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 ? 0.62 : 1.5;
    var px = Math.cos(a) * r,
      py = Math.sin(a) * r;
    if (i) s.lineTo(px, py);
    else s.moveTo(px, py);
  }
  s.closePath();
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, {
      depth: 0.34,
      bevelEnabled: true,
      bevelSize: 0.14,
      bevelThickness: 0.12,
      bevelSegments: 2,
    }),
    std({ color: 0xffe14a, emissive: 0xffa500, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.4 }),
  );
  body.position.z = -0.17;
  g.add(body);
  var halo = glowMesh(0xfff0a0, 5, 0.6);
  g.add(halo);
  g.userData.aura = halo;
  return g;
}
function boltMesh() {
  var s = new THREE.Shape();
  var pts = [[0.25, 1.55], [-0.85, 0.12], [-0.15, 0.12], [-0.45, -1.55], [0.85, -0.05], [0.12, -0.05]];
  pts.forEach(function (p, i) {
    if (i) s.lineTo(p[0], p[1]);
    else s.moveTo(p[0], p[1]);
  });
  s.closePath();
  var g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.1, bevelSegments: 1 }),
      std({ color: 0xffe75c, emissive: 0xffb300, emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.3 }),
    ),
  );
  var halo = glowMesh(0xfff6b0, 4.2, 0.5);
  g.add(halo);
  g.userData.aura = halo;
  return g;
}
// every item kind as a world model — used by the throwables and by the
// held-item display floating over the kart
function itemMesh(kind) {
  if (kind === "banana") return bananaMesh();
  if (kind === "green" || kind === "red" || kind === "spiny") return shellMesh(kind);
  if (kind === "bomb") return bombMesh();
  if (kind === "mush" || kind === "mush3") return mushMesh();
  if (kind === "star") return starMesh();
  if (kind === "bolt") return boltMesh();
  return mushMesh();
}

function shotMesh(kind) {
  var m = itemMesh(kind);
  m.userData.rc = true;
  m.traverse(function (o) {
    if (o.isMesh) o.castShadow = true;
  });
  getMainScene().add(m);
  return m;
}

function spawnShot(car, kind, back, now) {
  var dir = car.heading + (back ? Math.PI : 0);
  var ahead = kind === "banana" ? -4.5 : 5.5;
  var s = {
    kind: kind,
    owner: car,
    x: car.x + Math.sin(car.heading) * (back ? -Math.abs(ahead) : Math.abs(ahead)),
    z: car.z + Math.cos(car.heading) * (back ? -Math.abs(ahead) : Math.abs(ahead)),
    y: car.y + 2,
    vx: 0,
    vz: 0,
    vy: 0,
    born: now,
    arm: now + (back ? 240 : 90),
    life: SHELL_LIFE,
    bounces: 0,
    m: null,
  };
  if (kind === "banana") {
    s.life = 40000;
    s.y = car.y + 0.8;
    if (!back) {
      // pressing the button without reverse lobs it ahead — dropping it under
      // your own wheels would just spin you out
      s.vx = Math.sin(dir) * 115;
      s.vz = Math.cos(dir) * 115;
      s.vy = 75;
      s.flying = true;
      s.arm = now + 700;
    }
  } else if (kind === "bomb") {
    var sp = back ? 60 : 150;
    s.vx = Math.sin(dir) * sp;
    s.vz = Math.cos(dir) * sp;
    s.vy = 95;
    s.fuse = now + BOMB_FUSE;
    s.life = BOMB_FUSE + 400;
  } else if (kind === "spiny") {
    s.y = car.y + 10;
    s.life = 14000;
    s.target = leader(car);
    if (!s.target) return null;
  } else {
    s.vx = Math.sin(dir) * SHELL_V;
    s.vz = Math.cos(dir) * SHELL_V;
    if (kind === "red") {
      s.target = carAhead(car);
      s.life = 8000;
    }
  }
  s.m = shotMesh(kind);
  s.m.position.set(s.x, s.y, s.z);
  K.shots.push(s);
  return s;
}

function leader(not) {
  var best = null;
  E.cars().forEach(function (c) {
    if (c === not || c.dead) return;
    if (!best || (c.place || 9) < (best.place || 9)) best = c;
  });
  return best;
}
function carAhead(car) {
  var best = null;
  E.cars().forEach(function (c) {
    if (c === car || c.dead) return;
    if ((c.place || 9) >= (car.place || 9)) return;
    if (!best || (c.place || 9) > (best.place || 9)) best = c;
  });
  return best;
}

// deploy the held item. `back` throws/drops it behind (hold reverse).
export function kartUse(car, now, back) {
  if (!K.on || !car || car.dead || car.rollT > now) return false;
  var kind = car.item;
  if (!kind) return false;
  if (kind === "mush" || kind === "mush3") {
    car.boostT = Math.max(car.boostT || 0, now + BOOST_MUSH);
    car.v = Math.max(car.v, E.MAXV * 1.25);
    puff(car.x, car.y + 1.5, car.z, 8, 0xffd9a0, 45, 1.1);
    shockwave(car.x, car.y + 0.5, car.z, 0xffcf8a, 15, 0.32);
    E.beep(720, 0.16, 0.4);
    E.beep(1080, 0.12, 0.3);
  } else if (kind === "star") {
    car.starT = now + STAR_MS;
    car.spinT = 0;
    car.smallT = 0;
    puff(car.x, car.y + 1.6, car.z, 14, 0xffe066, 70, 1.3);
    shockwave(car.x, car.y + 0.5, car.z, 0xfff3b0, 24, 0.42);
    E.beep(880, 0.2, 0.45);
    E.beep(1320, 0.25, 0.35);
    if (!car.ai) E.msg("⭐", 900);
  } else if (kind === "bolt") {
    E.cars().forEach(function (c) {
      if (c === car || c.dead || c.starT > now) return;
      c.smallT = now + SMALL_MS;
      c.spinT = Math.max(c.spinT || 0, now + 450);
      c.v *= 0.3;
      dropCoins(c, 3);
      puff(c.x, c.y + 3, c.z, 8, 0xfff28a, 60, 1.2);
      // a bolt out of the ceiling: a column of glow collapsing onto the kart
      for (var b = 0; b < 4 && fxRoom(1); b++) {
        var zap = shardMesh(0xfff6a8, 0.85);
        zap.position.set(c.x, c.y + 4 + b * 3.2, c.z);
        fxPush(zap, { grav: 2.4, vy: -40 - b * 12, life: 0.24, now: now });
      }
      shockwave(c.x, c.y + 0.5, c.z, 0xfff6a8, 14, 0.3);
    });
    E.flash(1);
    E.beep(1400, 0.1, 0.5);
    E.beep(300, 0.35, 0.45);
  } else {
    if (!spawnShot(car, kind, !!back, now)) return false;
    E.beep(kind === "bomb" ? 260 : 520, 0.1, 0.35);
  }
  if (kind === "mush3" && (car.itemN || 0) > 1) car.itemN--;
  else {
    car.item = null;
    car.itemN = 0;
  }
  return true;
}

// ---- projectiles ------------------------------------------------------------
function explode(s, now) {
  var gy = E.groundAt(s.x, s.z, s.y + 4, 6);
  // layered: flash core → ground shockwave → fireball → smoke that lingers
  if (fxRoom(2)) {
    var core = glowMesh(0xfff3cf, 7, 1);
    core.position.set(s.x, s.y + 1, s.z);
    fxPush(core, { kind: "glow", grav: 0, grow: 12, life: 0.16, now: now, op: 1 });
  }
  shockwave(s.x, gy + 0.35, s.z, 0xffc46a, BLAST_R * 1.5, 0.42);
  shockwave(s.x, gy + 0.3, s.z, 0xfff0c0, BLAST_R * 0.9, 0.28);
  puff(s.x, s.y + 0.8, s.z, 18, 0xffa826, 105, 1.8);
  puff(s.x, s.y + 1.2, s.z, 6, 0xffe9a8, 55, 1.2);
  for (var i = 0; i < 6 && fxRoom(1); i++) {
    var sm = smokeMesh(0x4c4a48, 3.5 + Math.random() * 2.5);
    sm.position.set(
      s.x + (Math.random() - 0.5) * 5,
      s.y + 1 + Math.random() * 2,
      s.z + (Math.random() - 0.5) * 5,
    );
    fxPush(sm, {
      kind: "smoke",
      vx: (Math.random() - 0.5) * 26,
      vz: (Math.random() - 0.5) * 26,
      grow: 6,
      life: 0.9 + Math.random() * 0.6,
      now: now,
      op: 0.42,
    });
  }
  E.beep(70, 0.35, 0.6);
  E.cars().forEach(function (c) {
    if (c.dead) return;
    if (Math.hypot(c.x - s.x, c.z - s.z) > BLAST_R) return;
    if (Math.abs(c.y - s.y) > 14) return;
    kartHit(c, now, "blast");
  });
  var pc = E.player();
  if (pc && Math.hypot(pc.x - s.x, pc.z - s.z) < BLAST_R * 2.2) E.flash(0.5);
}

function stepShots(dt, now) {
  var scene = getMainScene();
  K.shots = K.shots.filter(function (s) {
    if (now - s.born > s.life) {
      if (s.kind === "bomb") explode(s, now);
      scene.remove(s.m);
      disposeObj(s.m);
      return false;
    }
    if (s.kind === "banana") {
      if (s.flying) {
        s.vy -= E.GRAV * dt;
        s.x += s.vx * dt;
        s.z += s.vz * dt;
        s.y += s.vy * dt;
        var gy = E.groundAt(s.x, s.z, s.y + 2, 4);
        if (s.y <= gy + 1.2) {
          s.y = gy + 1.2;
          s.flying = false;
          s.vx = s.vz = s.vy = 0;
        }
        s.m.position.set(s.x, s.y, s.z);
        s.m.rotation.x += dt * 7; // tumbles through the air, settles flat
        s.m.rotation.y += dt * 5;
      } else {
        s.m.rotation.x += (0 - s.m.rotation.x) * Math.min(1, dt * 8);
        s.m.rotation.y += dt * 1.2;
      }
    } else if (s.kind === "spiny") {
      // hunts the leader over everything — flies above the furniture
      var tg = s.target && !s.target.done && !s.target.dead ? s.target : leader(s.owner);
      s.target = tg;
      if (!tg) {
        explode(s, now);
        scene.remove(s.m);
        disposeObj(s.m);
        return false;
      }
      var dx = tg.x - s.x,
        dz = tg.z - s.z,
        d = Math.hypot(dx, dz) || 1;
      s.x += (dx / d) * SPINY_V * dt;
      s.z += (dz / d) * SPINY_V * dt;
      var want = E.groundAt(s.x, s.z, s.y + 30, 40) + (d < 26 ? 2.5 : 11);
      s.y += (want - s.y) * Math.min(1, dt * 3);
      s.m.position.set(s.x, s.y, s.z);
      s.m.rotation.y += dt * 9;
      // pulses harder the closer it gets, and drags a blue comet tail
      var aura = s.m.userData.aura;
      if (aura) {
        aura.scale.setScalar(5 + Math.sin(now / 90) * 0.9 + (d < 40 ? 1.6 : 0));
        aura.material.opacity = 0.45 + (d < 40 ? 0.3 : 0) + Math.sin(now / 70) * 0.12;
      }
      if (Math.random() < dt * 26 && fxRoom(1)) {
        var tr = glowMesh(0x6fb4ff, 1.7, 0.5);
        tr.position.set(s.x, s.y - 0.4, s.z);
        fxPush(tr, { kind: "glow", grav: 0, drag: 4, grow: 1.4, life: 0.34, now: now, op: 0.5 });
      }
      if (d < 4.5) {
        explode(s, now);
        scene.remove(s.m);
        disposeObj(s.m);
        return false;
      }
      return true;
    } else {
      if (s.kind === "red" && s.target && !s.target.dead) {
        var tx = s.target.x - s.x,
          tz = s.target.z - s.z;
        var want2 = Math.atan2(tx, tz);
        var cur = Math.atan2(s.vx, s.vz);
        var diff = want2 - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        var h = cur + clamp(diff, -RED_TURN * dt, RED_TURN * dt);
        s.vx = Math.sin(h) * SHELL_V;
        s.vz = Math.cos(h) * SHELL_V;
      }
      if (s.kind === "bomb") {
        s.vy -= E.GRAV * dt;
        s.y += s.vy * dt;
        var gb = E.groundAt(s.x, s.z, s.y, 4);
        if (s.y <= gb) {
          s.y = gb;
          s.vy *= -0.35;
          s.vx *= 0.6;
          s.vz *= 0.6;
        }
        // the fuse is the read on how long you have: it sparks faster, the
        // wick swells and the casing starts flashing red as it burns down
        var urg = clamp(1 - (s.fuse - now) / BOMB_FUSE, 0, 1);
        var wick = s.m.userData.wick;
        if (wick) {
          wick.scale.setScalar(1.9 + urg * 1.6 + Math.sin(now / (34 - urg * 18)) * 0.7);
          wick.material.color.setHSL(0.09 - urg * 0.07, 1, 0.6);
        }
        var casing = s.m.userData.body;
        if (casing)
          casing.material.emissive.setRGB(
            Math.max(0, Math.sin(now / (150 - urg * 100))) * urg * 0.9,
            0,
            0,
          );
        if (Math.random() < dt * (12 + urg * 40) && fxRoom(1)) {
          var sp = shardMesh(0xffd066, 0.3);
          sp.position.set(s.x, s.y + 2.6, s.z);
          fxPush(sp, {
            vx: (Math.random() - 0.5) * 26,
            vz: (Math.random() - 0.5) * 26,
            vy: 20 + Math.random() * 20,
            life: 0.28,
            now: now,
          });
        }
        if (now > s.fuse) {
          explode(s, now);
          scene.remove(s.m);
          disposeObj(s.m);
          return false;
        }
      }
      var p = { x: s.x, z: s.z };
      var sdx = s.vx * dt,
        sdz = s.vz * dt;
      var bx = s.x + sdx,
        bz = s.z + sdz;
      var pen = E.moveCircle
        ? E.moveCircle(p, sdx, sdz, SHELL_R, s.y, 3.2, 1.2)
        : (p.x = bx, p.z = bz, E.collideCircle(p, SHELL_R, s.y, 3.2, 1.2));
      if (pen > 0.01) {
        // the resolver's push direction IS the surface normal — reflect on it
        var nx = p.x - bx,
          nz = p.z - bz,
          nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        var dot = s.vx * nx + s.vz * nz;
        s.vx -= 2 * dot * nx;
        s.vz -= 2 * dot * nz;
        s.bounces++;
        puff(p.x, s.y, p.z, 3, 0xffffff, 30, 0.7);
        E.beep(430, 0.05, 0.25);
        if (s.kind === "bomb") {
          explode(s, now);
          scene.remove(s.m);
          disposeObj(s.m);
          return false;
        }
        if (s.bounces > 5) {
          puff(s.x, s.y, s.z, 6, 0xcccccc, 40, 0.9);
          scene.remove(s.m);
          disposeObj(s.m);
          return false;
        }
      }
      s.x = p.x;
      s.z = p.z;
      if (s.kind !== "bomb") s.y = E.groundAt(s.x, s.z, s.y + 3, 5) + 1.3;
      s.m.position.set(s.x, s.y, s.z);
      s.m.rotation.y += dt * 12;
    }
    // hit test against every car (the owner is safe until `arm` passes)
    var hitC = null;
    E.cars().forEach(function (c) {
      if (hitC || c.dead) return;
      if (c === s.owner && now < s.arm) return;
      if (Math.abs(c.y - s.y) > 6) return;
      if (Math.hypot(c.x - s.x, c.z - s.z) > E.COLL_R + SHELL_R + 0.6) return;
      hitC = c;
    });
    if (hitC) {
      if (hitC.starT > now || hitC.spinT > now) {
        // a starred kart just swats it away
        if (hitC.starT > now) puff(s.x, s.y + 1, s.z, 8, 0xffe066, 70, 1.2);
      }
      if (s.kind === "bomb") explode(s, now);
      else kartHit(hitC, now, "spin");
      scene.remove(s.m);
      disposeObj(s.m);
      return false;
    }
    return true;
  });
}

// ---- pickups ----------------------------------------------------------------
function stepPickups(dt, now) {
  var A = K.A;
  // the shared materials are animated once per frame, so every box on the
  // circuit shimmers through the same rainbow without a per-object cost
  if (A) {
    A.boxMat.emissive.setHSL((now / 2600) % 1, 0.85, 0.42);
    A.coreMat.emissiveIntensity = 0.85 + Math.sin(now / 190) * 0.45;
    A.coinFaceMat.emissiveIntensity = 0.28 + Math.max(0, Math.sin(now / 320)) * 0.5;
  }
  var bob = Math.sin(now / 260) * 0.9;
  K.boxes.forEach(function (b) {
    if (b.taken) {
      if (now - b.taken > BOX_RESPAWN) {
        b.taken = 0;
        b.grp.visible = true;
        b.grp.scale.setScalar(0.25); // pops back into existence
      }
      return;
    }
    var s = b.grp.scale.x;
    if (s < 1) b.grp.scale.setScalar(Math.min(1, s + dt * 3.4));
    b.spin.rotation.y += dt * 1.5;
    b.spin.rotation.x += dt * 0.7;
    b.grp.position.y = b.y + bob;
    b.core.rotation.y -= dt * 3.4;
    b.core.rotation.z += dt * 1.1;
    var pulse = 0.9 + Math.sin(now / 300 + b.ph) * 0.16;
    b.halo.scale.setScalar(BOX_S * 1.7 * pulse);
    b.pool.position.y = -BOX_Y + 0.25 - bob; // stays welded to the deck
    b.pool.scale.setScalar(0.92 + (1 - pulse) * 0.6);
  });
  var scene = getMainScene();
  K.coins = K.coins.filter(function (c) {
    if (c.loose && now - c.born > LOOSE_MS) {
      scene.remove(c.m);
      return false;
    }
    if (c.taken) {
      if (c.loose) {
        scene.remove(c.m); // dropped coins are one-shot
        return false;
      }
      if (now - c.taken > BOX_RESPAWN * 1.6) {
        c.taken = 0;
        c.m.visible = true;
      }
      return true;
    }
    c.m.rotation.y += dt * 4.5;
    // tip the coin a little as it turns so the struck face catches the light
    c.m.rotation.z = Math.sin(now / 420 + c.x) * 0.16;
    c.m.position.y = c.y + Math.sin(now / 220 + c.x) * 0.5;
    return true;
  });
  K.pads.forEach(function (p) {
    p.chev.forEach(function (c, i) {
      var u = (((now / 1000) * 18 + i * 7.7) % 23) / 23; // 0→1 along the pad
      c.position.z = u * 23 - 11.5;
      c.scale.setScalar(0.72 + u * 0.5);
      // brightest mid-pad, fading in and out at the ends: reads as flow
      c.material.opacity = 0.25 + Math.sin(u * Math.PI) * 0.75;
    });
  });
}

function collect(car, now) {
  if (car.dead || car.spinT > now) return;
  var i, d;
  for (i = 0; i < K.boxes.length; i++) {
    var b = K.boxes[i];
    if (b.taken) continue;
    if (Math.abs(car.y + 2 - b.y) > 7) continue;
    d = Math.hypot(car.x - b.x, car.z - b.z);
    if (d > PICK_R) continue;
    b.taken = now;
    b.grp.visible = false;
    puff(b.x, b.y, b.z, 10, 0x8ee6ff, 55, 1.1);
    shockwave(b.x, b.y - BOX_Y + 0.4, b.z, 0x9fefff, 13, 0.36);
    if (!car.item) {
      car.rollT = now + (car.ai ? 260 : 820);
      if (!car.ai) E.beep(660, 0.07, 0.3);
    }
  }
  for (i = 0; i < K.coins.length; i++) {
    var c = K.coins[i];
    if (c.taken) continue;
    if (Math.abs(car.y + 2 - c.y) > 7) continue;
    if (Math.hypot(car.x - c.x, car.z - c.z) > PICK_R) continue;
    c.taken = now;
    c.m.visible = false;
    if ((car.coins || 0) < MAX_COINS) {
      car.coins = (car.coins || 0) + 1;
      if (!car.ai) E.beep(1180, 0.05, 0.22);
    }
    puff(c.x, c.y, c.z, 4, 0xffd75e, 35, 0.8);
  }
  for (i = 0; i < K.pads.length; i++) {
    var p = K.pads[i];
    if (Math.abs(car.y - p.y) > 5.5) continue;
    var dx = car.x - p.x,
      dz = car.z - p.z;
    if (Math.abs(dx * p.ux + dz * p.uz) > 12) continue;
    if (Math.abs(dx * -p.uz + dz * p.ux) > 8.5) continue;
    if (car.padT > now) continue;
    car.padT = now + 500;
    car.boostT = Math.max(car.boostT || 0, now + BOOST_PAD);
    car.v = Math.max(car.v, E.MAXV * 1.3);
    puff(car.x, car.y + 1, car.z, 7, 0x7fe9ff, 45, 1);
    shockwave(p.x, p.y + 0.7, p.z, 0x7fe9ff, 16, 0.34);
    if (!car.ai) E.beep(880, 0.1, 0.3);
  }
}

// ---- AI item play -----------------------------------------------------------
function nearBehind(car) {
  var found = false;
  E.cars().forEach(function (c) {
    if (found || c === car || c.dead) return;
    var dx = c.x - car.x,
      dz = c.z - car.z,
      d = Math.hypot(dx, dz);
    if (d > 42) return;
    var f = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / (d || 1);
    if (f < -0.55) found = true;
  });
  return found;
}
function aimedAhead(car, range) {
  var found = false;
  E.cars().forEach(function (c) {
    if (found || c === car || c.dead) return;
    var dx = c.x - car.x,
      dz = c.z - car.z,
      d = Math.hypot(dx, dz);
    if (d > range) return;
    var f = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / (d || 1);
    if (f > 0.93) found = true;
  });
  return found;
}
function aiPlay(car, now) {
  if (!car.item || car.rollT > now || car.spinT > now) return;
  if ((car.aiItemT || 0) > now) return;
  // How eagerly a bot plays what it holds is set by the difficulty (see
  // DIFFICULTY in rc_state.js): a keener bot reacts sooner and fires from
  // further out. Absent the field it behaves exactly as it always did.
  var ag = car.aiItems == null ? 1 : car.aiItems;
  // ag <= 0 would make the cooldown Infinity/negative — a bot that never fires
  // (or fires every frame). Clamp to the laziest sane rhythm instead.
  car.aiItemT = now + (ag > 0.05 ? 260 / ag : 5200);
  var k = car.item;
  if (k === "banana") {
    if (nearBehind(car) || Math.random() < 0.01 * ag) kartUse(car, now, true);
  } else if (k === "green") {
    if (aimedAhead(car, 110 * ag)) kartUse(car, now, false);
    else if (nearBehind(car)) kartUse(car, now, true);
  } else if (k === "red") {
    if (carAhead(car)) kartUse(car, now, false);
  } else if (k === "mush" || k === "mush3") {
    if (Math.abs(car.v) > E.MAXV * 0.5) kartUse(car, now, false);
  } else if (k === "bomb") {
    if (aimedAhead(car, 90 * ag) || nearBehind(car))
      kartUse(car, now, !aimedAhead(car, 90 * ag));
    else if (Math.random() < 0.008 * ag) kartUse(car, now, false);
  } else kartUse(car, now, false); // star / bolt / spiny: fire and forget
}

// ---- held item + power-up trails --------------------------------------------
// The item you are carrying floats over the kart and an active power-up burns
// in the world, not just in the HUD — the chase camera sits close enough at
// this scale that a boosting or starred truck should read at a glance.
function clearHeld() {
  var scene = getMainScene();
  K.held.forEach(function (h) {
    if (scene) scene.remove(h.m);
    disposeObj(h.m);
  });
  K.held = [];
}
function stepHeld(dt, now) {
  var scene = getMainScene();
  if (!scene) return;
  var cars = E.cars();
  K.held = K.held.filter(function (h) {
    if (!h.car.dead && h.car.item === h.kind && cars.indexOf(h.car) >= 0) return true;
    scene.remove(h.m);
    disposeObj(h.m);
    return false;
  });
  cars.forEach(function (c) {
    if (c.dead || !c.item || (c.rollT || 0) > now) return;
    var h = null;
    for (var i = 0; i < K.held.length; i++) if (K.held[i].car === c) h = K.held[i];
    if (!h) {
      var m = itemMesh(c.item);
      m.userData.rc = true;
      m.scale.setScalar(0.42);
      scene.add(m);
      h = { car: c, kind: c.item, m: m };
      K.held.push(h);
    }
    var back = 4.2; // trails behind the cab rather than sitting on the roof
    h.m.position.set(
      c.x - Math.sin(c.heading) * back,
      (c.y || 0) + 5.2 + Math.sin(now / 320) * 0.35,
      c.z - Math.cos(c.heading) * back,
    );
    h.m.rotation.y += dt * 1.7;
  });
}
function stepAuras(dt, now) {
  E.cars().forEach(function (c) {
    if (c.dead) return;
    var rear = 2.4,
      x = c.x - Math.sin(c.heading) * rear,
      z = c.z - Math.cos(c.heading) * rear;
    if ((c.boostT || 0) > now && Math.random() < dt * 34 && fxRoom(2)) {
      // twin flame licks off the back of the truck
      for (var s = -1; s <= 1; s += 2) {
        var fx = x + Math.cos(c.heading) * s * 1.2,
          fz = z - Math.sin(c.heading) * s * 1.2;
        var g = glowMesh(Math.random() < 0.4 ? 0x9fe4ff : 0xffb03a, 1.6, 0.7);
        g.position.set(fx, (c.y || 0) + 1, fz);
        fxPush(g, {
          kind: "glow",
          grav: -0.15,
          drag: 5,
          grow: 1.8,
          vx: -Math.sin(c.heading) * 26,
          vz: -Math.cos(c.heading) * 26,
          life: 0.26,
          now: now,
          op: 0.7,
        });
      }
    }
    if ((c.starT || 0) > now && Math.random() < dt * 26 && fxRoom(1)) {
      var col = new THREE.Color().setHSL((now / 350) % 1, 1, 0.65);
      var st = shardMesh(col.getHex(), 0.5);
      st.position.set(
        c.x + (Math.random() - 0.5) * 4,
        (c.y || 0) + 1 + Math.random() * 3,
        c.z + (Math.random() - 0.5) * 4,
      );
      fxPush(st, { grav: 0.15, vy: 14 + Math.random() * 14, life: 0.5, now: now });
    }
  });
}

// ---- frame ------------------------------------------------------------------
export function kartTick(dt, now, racing) {
  if (!K.on) return;
  stepPickups(dt, now);
  stepHeld(dt, now);
  stepAuras(dt, now);
  var cars = E.cars();
  cars.forEach(function (c) {
    if (c.rollT && now > c.rollT) {
      c.rollT = 0;
      c.item = rollItem(c);
      c.itemN = c.item === "mush3" ? 3 : 1;
      if (!c.ai) E.beep(980, 0.1, 0.32);
    }
    if (racing) collect(c, now);
    if (c.ai && racing) aiPlay(c, now);
  });
  // a starred kart bowls over anything it touches
  cars.forEach(function (a) {
    if (!(a.starT > now) || a.dead) return;
    cars.forEach(function (b) {
      if (b === a || b.dead) return;
      if (Math.abs(a.y - b.y) > E.CAR_CLEAR) return;
      if (Math.hypot(a.x - b.x, a.z - b.z) > E.COLL_R * 2.4) return;
      if (kartHit(b, now, "spin")) {
        b.v = -30;
        b.vy = 70;
      }
    });
  });
  stepShots(dt, now);
  stepFx(dt, now);
}

// what the HUD slot should show right now
export function kartSlot(car, now) {
  if (!car) return { icon: "", n: 0, rolling: false };
  if (car.rollT > now)
    return {
      icon: ROULETTE[Math.floor(now / 70) % ROULETTE.length],
      n: 0,
      rolling: true,
    };
  return {
    icon: ICON[car.item] || "",
    n: car.item === "mush3" ? car.itemN || 0 : 0,
    rolling: false,
  };
}

if (typeof window !== "undefined")
  window.kartDebug = function () {
    K.make = itemMesh; // console/test hook: build any item model on demand
    return K;
  };

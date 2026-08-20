/* Time-trial ghost: record the player's best lap, replay it as a translucent
   truck running the same line beside them.

   The recording is a flat list of samples taken at a fixed interval — position,
   height and heading only. No physics is replayed: a ghost is a rendered
   memory, so it never collides, never picks anything up and never falls off.
   The store is keyed off the track signature (js/rc_world.js bestLapKey), so a
   ghost belongs to the circuit it was set on and a rebuilt track drops it. */
import * as THREE from "three";
import { AXLE_Z, TRACK_X, WHEEL_R } from "./rc_state.js";
import { bestLapKey, defaultTruckBody, buildWheel } from "./rc_world.js";

var SAMPLE_MS = 55; // ~18Hz — smooth enough once interpolated, small on disk
var GHOST_COLOR = 0x8fd4ff;

var G = {
  scene: null,
  rec: null, // samples for the lap being driven right now
  recT: 0, // when the current lap started
  lastS: 0, // last sample stamp
  play: null, // the stored best lap being replayed
  grp: null, // the translucent truck
  wheels: null,
  sig: "", // which track the loaded ghost belongs to
};

export function ghostInit(scene) {
  G.scene = scene;
}

// ---- the mesh ---------------------------------------------------------------
// Shared with js/rc_mp.js: a peer's truck is drawn exactly like a ghost, just
// in their own colour and without the transparency.
export function buildGhostTruck(color, opacity) {
  var grp = new THREE.Group();
  grp.userData.rc = true;
  var body = defaultTruckBody(color);
  grp.add(body);
  var wheels = [
    buildWheel(grp, -TRACK_X, AXLE_Z, true),
    buildWheel(grp, TRACK_X, AXLE_Z, true),
    buildWheel(grp, -TRACK_X, -AXLE_Z, false),
    buildWheel(grp, TRACK_X, -AXLE_Z, false),
  ];
  if (opacity < 1) {
    grp.traverse(function (o) {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        // Clone first: assembleCar shares nothing between trucks by design
        // (tintDamage mutates colours per car) and a ghost must not be the
        // exception that makes a real truck see-through.
        var c = m.clone();
        c.transparent = true;
        c.opacity = opacity;
        c.depthWrite = false;
        if (c.emissive) c.emissive.setHex(0x123044);
        o.material = c;
      });
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }
  return { grp: grp, wheels: wheels };
}

function disposeGhostMesh() {
  if (!G.grp) return;
  if (G.scene) G.scene().remove(G.grp);
  G.grp.traverse(function (o) {
    // never dispose a Sprite's shared singleton geometry
    if (o.geometry && o.geometry.dispose && !o.isSprite) o.geometry.dispose();
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        m.dispose();
      });
  });
  G.grp = null;
  G.wheels = null;
}

function ensureMesh() {
  if (G.grp || !G.scene) return;
  var built = buildGhostTruck(GHOST_COLOR, 0.42);
  G.grp = built.grp;
  G.wheels = built.wheels;
  G.grp.visible = false;
  G.scene().add(G.grp);
}

// ---- store ------------------------------------------------------------------
function storeKey() {
  var k = bestLapKey();
  return k ? k + "_ghost" : "";
}
export function ghostLoad() {
  var k = storeKey();
  G.play = null;
  G.sig = k;
  if (!k) return null;
  try {
    var raw = localStorage.getItem(k);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (d && Array.isArray(d.s) && d.s.length > 3) G.play = d;
  } catch (e) {
    G.play = null;
  }
  return G.play;
}
function ghostStore(ms) {
  var k = storeKey();
  if (!k || !G.rec || G.rec.length < 4) return;
  try {
    localStorage.setItem(k, JSON.stringify({ ms: Math.round(ms), s: G.rec }));
    G.play = { ms: Math.round(ms), s: G.rec.slice() };
  } catch (e) {
    // a long lap on a big apartment can bump the quota — a missing ghost is
    // not worth failing the lap over
  }
}
export function ghostHas() {
  return !!(G.play && G.play.s && G.play.s.length > 3);
}
export function ghostTime() {
  return G.play ? G.play.ms : 0;
}

// ---- recording --------------------------------------------------------------
export function ghostStartLap(now) {
  G.rec = [];
  G.recT = now;
  G.lastS = -1e9;
}
export function ghostRecord(car, now) {
  if (!G.rec || !car || car.dead) return;
  if (now - G.lastS < SAMPLE_MS) return;
  G.lastS = now;
  // one decimal on centimetres is well under a wheel radius, and halves the
  // JSON that has to fit in localStorage
  G.rec.push([
    Math.round((now - G.recT) / 10) / 100,
    Math.round(car.x * 10) / 10,
    Math.round(car.y * 10) / 10,
    Math.round(car.z * 10) / 10,
    Math.round(car.heading * 100) / 100,
  ]);
}
// Called when a lap closes. Returns true when this lap became the new ghost.
export function ghostFinishLap(lapMs, isBest) {
  var took = isBest && G.rec && G.rec.length > 3;
  if (took) ghostStore(lapMs);
  return !!took;
}

// ---- playback ---------------------------------------------------------------
export function ghostReset() {
  G.rec = null;
  ghostLoad();
  if (G.grp) G.grp.visible = false;
}

// `elapsed` = milliseconds into the player's current lap.
export function ghostTick(elapsed, show) {
  var on = show && ghostHas();
  if (!on) {
    if (G.grp) G.grp.visible = false;
    return;
  }
  ensureMesh();
  if (!G.grp) return;
  var s = G.play.s,
    tSec = elapsed / 1000;
  // past the end of the recorded lap the ghost is simply gone — it finished
  if (tSec > s[s.length - 1][0]) {
    G.grp.visible = false;
    return;
  }
  // samples are evenly spaced, so seek by ratio then walk the couple of steps
  // any jitter in the recording interval introduced
  var i = Math.min(s.length - 2, Math.max(0, Math.floor((tSec / s[s.length - 1][0]) * (s.length - 1))));
  while (i > 0 && s[i][0] > tSec) i--;
  while (i < s.length - 2 && s[i + 1][0] < tSec) i++;
  var a = s[i],
    b = s[i + 1],
    span = b[0] - a[0],
    f = span > 0 ? (tSec - a[0]) / span : 0;
  var x = a[1] + (b[1] - a[1]) * f,
    y = a[2] + (b[2] - a[2]) * f,
    z = a[3] + (b[3] - a[3]) * f;
  var dh = b[4] - a[4];
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  G.grp.position.set(x, y, z);
  G.grp.rotation.y = a[4] + dh * f;
  G.grp.visible = true;
  // roll the wheels off the ghost's own travel so it doesn't skate
  if (G.wheels) {
    var d = Math.hypot(b[1] - a[1], b[3] - a[3]) / Math.max(0.001, span);
    G.wheels.forEach(function (w) {
      w.spin.rotation.x += (d / WHEEL_R) * 0.016;
    });
  }
}

export function ghostClear() {
  disposeGhostMesh();
  G.rec = null;
  G.play = null;
}

export function ghostDebug() {
  return G;
}

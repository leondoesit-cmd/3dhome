/* Multiplayer for the micro-RC mode: race a friend's truck through your flat.

   Same shape as js/drive_mp.js — peers are rendered ghosts with no collision
   and no physics, driven by interpolated poses off the relay. Nothing about
   the local simulation changes when multiplayer is on, which is what keeps
   this safe: a dropped peer costs you a truck on screen, never a race.

   The one piece of real coordination is the start. The host broadcasts "we go
   in N milliseconds" rather than an absolute time, because the two browsers'
   performance.now() origins have nothing to do with each other.

   A route belongs to the flat it was drawn on (see planSig in rc_state.js), so
   a start from a friend racing a different apartment is refused rather than
   silently dropping you onto a circuit that doesn't exist. */
import * as THREE from "three";
import * as net from "./net.js";
import { R } from "./rc_state.js";
import { buildGhostTruck } from "./rc_ghost.js";

var PEER_COLORS = [0x6ad1ff, 0xff8ad1, 0x9dff6a, 0xffc46a, 0xc39dff];
var SEND_MS = 90;

var E = null; // env injected by rc_game.js
var unsub = null;
var lastSend = 0;

export function mpInit(env) {
  E = env;
}

function session() {
  if (!R.mp)
    R.mp = { on: false, ghosts: {}, board: {}, pending: null, hostCode: null };
  return R.mp;
}

export function mpActive() {
  return !!(R.mp && R.mp.on && net.NET.connected);
}
export function mpAvailable() {
  return !!net.NET.connected;
}
export function mpPeerCount() {
  return Object.keys((net.NET && net.NET.peers) || {}).length;
}

// ---- peer ghosts ------------------------------------------------------------
function nameTag(code) {
  var c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  var ctx = c.getContext("2d");
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(20,24,28,0.75)";
  ctx.beginPath();
  ctx.roundRect(28, 6, 200, 52, 14);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(net.peerName(code).slice(0, 12), 128, 44);
  var sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthTest: false,
    }),
  );
  // micro scale: the trucks are ~4cm long, so the tag is centimetres too
  sp.scale.set(9, 2.25, 1);
  sp.position.y = 5.5;
  return sp;
}

function ghostFor(code) {
  var S = session();
  var g = S.ghosts[code];
  if (g) return g;
  var i = Object.keys(S.ghosts).length;
  var built = buildGhostTruck(PEER_COLORS[i % PEER_COLORS.length], 1);
  var root = new THREE.Group();
  root.userData.rc = true;
  root.add(built.grp);
  var tag = nameTag(code);
  root.add(tag);
  E.scene().add(root);
  g = S.ghosts[code] = {
    root: root,
    truck: built.grp,
    wheels: built.wheels,
    tag: tag,
    cur: null,
    target: null,
    lap: 1,
    next: 1,
  };
  return g;
}

function dropGhost(code) {
  var S = session();
  var g = S.ghosts[code];
  if (!g) return;
  E.scene().remove(g.root);
  g.root.traverse(function (o) {
    // A Sprite's geometry is a module-level singleton in three — disposing it
    // kills every sprite in the app (learned the hard way in kart.js).
    if (o.isSprite) {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      return;
    }
    if (o.geometry && o.geometry.dispose) o.geometry.dispose();
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
        m.dispose();
      });
  });
  delete S.ghosts[code];
}

function clearGhosts() {
  var S = session();
  Object.keys(S.ghosts).forEach(dropGhost);
}

// ---- wire -------------------------------------------------------------------
function onData(msg) {
  var from = msg.from,
    d = msg.data;
  if (!d || !mpActive()) return;
  var S = session();
  if (d.k === "rc_car") {
    var g = ghostFor(from);
    g.target = { x: d.x, y: d.y, z: d.z, h: d.h };
    g.lap = d.l || 1;
    g.next = d.n || 1;
    if (!g.cur) g.cur = { x: d.x, y: d.y, z: d.z, h: d.h };
  } else if (d.k === "rc_start") {
    // a friend dropped the flag. Only join if we are looking at the same walls.
    if (d.sig && E.planSig() !== d.sig) {
      E.msg("⚠ " + E.t("rc_mp_other_flat"), 2600);
      return;
    }
    S.hostCode = from;
    E.msg(E.t("rc_mp_joining"), 1600);
    E.startRace({ laps: d.laps, mode: d.mode, inMs: d.in, remote: true });
  } else if (d.k === "rc_fin") {
    S.board[from] = { name: net.peerName(from), ms: d.ms, laps: d.laps };
    E.boardChanged();
  } else if (d.k === "rc_bye") {
    dropGhost(from);
    delete S.board[from];
  }
}

export function mpEnable(on) {
  var S = session();
  if (!!on === S.on) return S.on;
  S.on = !!on;
  if (S.on) {
    if (!net.NET.connected) net.connect();
    if (!unsub) {
      var offData = net.on("data", onData);
      var offLeave = net.on("peer-leave", function (p) {
        dropGhost(p.code);
        delete S.board[p.code];
      });
      unsub = function () {
        offData && offData();
        offLeave && offLeave();
      };
    }
  } else {
    if (net.NET.connected) net.sendData({ k: "rc_bye" });
    if (unsub) unsub();
    unsub = null;
    clearGhosts();
    S.board = {};
  }
  return S.on;
}

// Host: tell everyone in the room that the flag drops in `inMs`.
export function mpBroadcastStart(inMs, laps, mode) {
  if (!mpActive()) return;
  session().board = {};
  net.sendData({
    k: "rc_start",
    in: Math.round(inMs),
    laps: laps,
    mode: mode,
    sig: E.planSig(),
  });
}

export function mpFinish(ms, laps) {
  if (!mpActive()) return;
  net.sendData({ k: "rc_fin", ms: Math.round(ms), laps: laps });
}

export function mpBoard() {
  var S = R.mp;
  if (!S) return [];
  return Object.keys(S.board).map(function (code) {
    return {
      code: code,
      name: S.board[code].name,
      ms: S.board[code].ms,
    };
  });
}

export function mpTick(now, player) {
  if (!mpActive()) return;
  var S = session();
  if (player && !player.dead && now - lastSend > SEND_MS) {
    lastSend = now;
    net.sendData({
      k: "rc_car",
      x: Math.round(player.x * 10) / 10,
      y: Math.round(player.y * 10) / 10,
      z: Math.round(player.z * 10) / 10,
      h: Math.round(player.heading * 100) / 100,
      l: player.lap,
      n: player.next,
    });
  }
  for (var code in S.ghosts) {
    var g = S.ghosts[code];
    if (!g.target || !g.cur) continue;
    // 90ms between packets on a 4cm truck: smoothing matters more here than it
    // does at street scale, so the pose is eased rather than snapped.
    g.cur.x += (g.target.x - g.cur.x) * 0.22;
    g.cur.y += (g.target.y - g.cur.y) * 0.22;
    g.cur.z += (g.target.z - g.cur.z) * 0.22;
    var dh = g.target.h - g.cur.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    g.cur.h += dh * 0.22;
    g.root.position.set(g.cur.x, g.cur.y, g.cur.z);
    g.truck.rotation.y = g.cur.h;
  }
}

export function mpDispose() {
  mpEnable(false);
  R.mp = null;
}

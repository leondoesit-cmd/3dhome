// Drive-mode multiplayer: peer cars render as colored ghosts (no collision),
// plus the relay hookup that carries car poses, shots and damage.
import * as THREE from "three";
import * as net from "./net.js";
import { D, car, player, CAR_Y, GHOST_COLORS } from "./drive_state.js";
import { llToM, mToLL } from "./drive_geo.js";
import { buildCarMesh } from "./drive_car_mesh.js";
import { isNight } from "./drive_sky.js";
import { focusPos, surfaceY } from "./drive_world.js";
import { renderRaceResults, renderTaxiResults } from "./drive_modes.js";

const GHOST_TIMEOUT = 12000; // ms without a pose before a peer's car is removed

// ---- result sanity ---------------------------------------------------------
// A finish time is whatever the peer's browser says it is. Among friends that
// is fine; it is still worth refusing the physically impossible, and saying so
// rather than quietly believing it. Checked against three things we already
// know: our own race clock, the course length, and whether we actually watched
// them get to the last checkpoint.
export function courseMeters(points) {
  let m = 0;
  for (let i = 1; i < (points || []).length; i++) {
    const a = points[i - 1],
      b = points[i];
    const lat = ((a.lat + b.lat) * Math.PI) / 360;
    m += Math.hypot((b.lon - a.lon) * 111320 * Math.cos(lat), (b.lat - a.lat) * 111320);
  }
  return m;
}
export function finishSuspect(from, ms, now) {
  if (!D.ses || D.ses.mode !== "race" || !D.ses.t0) return false;
  if (!(ms > 0)) return true;
  // nobody finishes before the lights go out, or faster than the car can drive
  if (ms > now - D.ses.t0 + 2500) return true;
  if (ms < (courseMeters(D.ses.def.points) / 62) * 1000 * 0.9) return true;
  // and we should have seen them reach the last gate
  const seen = D.ses.peers && D.ses.peers[from];
  const need = Math.max(0, (D.ses.cps || []).length - 1);
  if (need && (!seen || (seen.cp || 0) < need)) return true;
  return false;
}

// ---- multiplayer ghosts ----------------------------------------------------
// simple on-foot figure for peers who left their car
export function buildFigure(color) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b48c });
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3138 });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.8, 8), pants);
  legs.position.y = 0.4;
  g.add(legs);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.85, 10), shirt);
  body.position.y = 1.22;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.86;
  g.add(head);
  return g;
}
export function ghostFor(code) {
  let g = D.ses.ghosts[code];
  if (g) return g;
  const i = Object.keys(D.ses.ghosts).length;
  const color = GHOST_COLORS[i % GHOST_COLORS.length];
  const root = new THREE.Group();
  const mesh = buildCarMesh(color, i + 1);
  mesh.userData.lamps.beams.visible = isNight(); // peers run lights too
  mesh.userData.lamps.head.emissiveIntensity = isNight() ? 2.6 : 0.4;
  mesh.userData.lamps.tail.emissiveIntensity = isNight() ? 1.1 : 0.3;
  const foot = buildFigure(color);
  foot.visible = false;
  root.add(mesh);
  root.add(foot);
  // name tag
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(20,24,28,0.75)";
  ctx.beginPath();
  ctx.roundRect(28, 6, 200, 52, 14);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(net.peerName(code).slice(0, 12), 128, 44);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }),
  );
  sp.scale.set(7, 1.75, 1);
  sp.position.y = 3.4;
  root.add(sp);
  D.scene.add(root);
  g = D.ses.ghosts[code] = { root, mesh, foot, tag: sp, cur: null, target: null };
  return g;
}
export function dropGhost(code) {
  const g = D.ses && D.ses.ghosts && D.ses.ghosts[code];
  if (!g) return;
  D.scene.remove(g.root);
  if (g.tag.material.map) g.tag.material.map.dispose();
  g.tag.material.dispose();
  delete D.ses.ghosts[code];
  if (D.ses.peers) delete D.ses.peers[code];
}
export function mpHook() {
  D.unsubNet = net.on("data", ({ from, data }) => {
    if (!D.ses || !D.ses.mp || data.id !== D.ses.def.id) return;
    if (data.k === "car") {
      const g = ghostFor(from);
      // Poses travel as lat/lon: a race anchors every client at the same start
      // point, but a free cruise anchors each of us at our OWN home, so raw
      // local metres would put peers on the wrong side of town.
      const at = data.la != null ? llToM(data.la, data.lo) : { x: data.x, z: data.z };
      g.target = { x: at.x, z: at.z, h: data.h, f: data.f ? 1 : 0 };
      g.seenAt = performance.now();
      if (!g.cur) g.cur = { ...g.target };
      // live standings ride the pose packet — no extra traffic
      if (D.ses.peers)
        D.ses.peers[from] = {
          cp: data.p || 0,
          dn: data.dn == null ? null : data.dn,
          cash: data.$ || 0,
          fin: D.ses.peers[from] ? D.ses.peers[from].fin : 0,
        };
    } else if (data.k === "fshot") {
      // peer fired: tracer + distance-attenuated crack
      if (D.weapons) {
        const fp = focusPos();
        D.weapons.remoteShot(
          data.o, data.d, data.w,
          Math.hypot(data.o[0] - fp.x, data.o[2] - fp.z),
        );
      }
    } else if (data.k === "fdmg") {
      if (D.weapons) D.weapons.damage(data.dmg);
    } else if (data.k === "race_fin") {
      D.ses.board[from] = {
        name: net.peerName(from),
        ms: data.ms != null ? data.ms : null,
        cash: data.cash,
        suspect: data.ms != null && finishSuspect(from, data.ms, performance.now()),
      };
      if (D.ses.peers && D.ses.peers[from]) {
        D.ses.peers[from].fin = data.ms || 0;
        if (data.cash != null) D.ses.peers[from].cash = data.cash;
      }
      // a peer finishing while your own card is already up refreshes it
      if (D.ses.finished && D.ses.mode === "race") renderRaceResults(null);
      else if (D.ses.finished && D.ses.mode === "taxi") renderTaxiResults(null, null);
    }
  });
  // peers who leave the room (or the relay) take their car with them
  D.unsubLeave = net.on("peer-leave", ({ code }) => dropGhost(code));
}
export function mpTick(now) {
  if (!D.ses.mp || !net.NET.connected) return;
  if (now - D.lastCarSend > 90) {
    D.lastCarSend = now;
    const fp = focusPos();
    const ll = mToLL(fp.x, fp.z);
    const target = D.ses.mode === "race" && D.ses.cps && D.ses.cps.length
      ? D.ses.cps[Math.min(D.ses.cpIndex, D.ses.cps.length - 1)]
      : null;
    net.sendData({
      k: "car",
      id: D.ses.def.id,
      x: Math.round(fp.x * 10) / 10,
      z: Math.round(fp.z * 10) / 10,
      la: Math.round(ll.lat * 1e6) / 1e6,
      lo: Math.round(ll.lon * 1e6) / 1e6,
      h: Math.round((player.onFoot ? player.yaw : car.heading) * 100) / 100,
      f: player.onFoot ? 1 : 0,
      // progress for everyone else's live standings board
      p: D.ses.cpIndex || 0,
      dn: target ? Math.round(Math.hypot(target.x - fp.x, target.z - fp.z)) : null,
      $: D.ses.cash || 0,
    });
  }
  for (const code in D.ses.ghosts) {
    const g = D.ses.ghosts[code];
    // a peer who quit mid-session used to leave a car parked forever
    if (g.seenAt && now - g.seenAt > GHOST_TIMEOUT) {
      dropGhost(code);
      continue;
    }
    if (!g.target || !g.cur) continue;
    g.cur.x += (g.target.x - g.cur.x) * 0.2;
    g.cur.z += (g.target.z - g.cur.z) * 0.2;
    let dh = g.target.h - g.cur.h;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    g.cur.h += dh * 0.2;
    const onFoot = !!g.target.f;
    g.mesh.visible = !onFoot;
    g.foot.visible = onFoot;
    g.tag.position.y = onFoot ? 2.5 : 3.4;
    g.root.position.set(
      g.cur.x,
      surfaceY(g.cur.x, g.cur.z) + (onFoot ? 0 : CAR_Y),
      g.cur.z,
    );
    g.root.rotation.y = -g.cur.h;
  }
}


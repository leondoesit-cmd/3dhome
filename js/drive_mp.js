// Drive-mode multiplayer: peer cars render as colored ghosts (no collision),
// plus the relay hookup that carries car poses, shots and damage.
import * as THREE from "three";
import * as net from "./net.js";
import { D, car, player, CAR_Y, GHOST_COLORS } from "./drive_state.js";
import { buildCarMesh } from "./drive_car_mesh.js";
import { isNight } from "./drive_sky.js";
import { focusPos, surfaceY } from "./drive_world.js";
import { renderRaceResults } from "./drive_modes.js";

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
export function mpHook() {
  D.unsubNet = net.on("data", ({ from, data }) => {
    if (!D.ses || !D.ses.mp || data.id !== D.ses.def.id) return;
    if (data.k === "car") {
      const g = ghostFor(from);
      g.target = { x: data.x, z: data.z, h: data.h, f: data.f ? 1 : 0 };
      if (!g.cur) g.cur = { ...g.target };
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
      };
      if (D.ses.finished && D.ses.mode === "race") renderRaceResults(null);
    }
  });
}
export function mpTick(now) {
  if (!D.ses.mp || !net.NET.connected) return;
  if (now - D.lastCarSend > 90) {
    D.lastCarSend = now;
    const fp = focusPos();
    net.sendData({
      k: "car",
      id: D.ses.def.id,
      x: Math.round(fp.x * 10) / 10,
      z: Math.round(fp.z * 10) / 10,
      h: Math.round((player.onFoot ? player.yaw : car.heading) * 100) / 100,
      f: player.onFoot ? 1 : 0,
    });
  }
  for (const code in D.ses.ghosts) {
    const g = D.ses.ghosts[code];
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


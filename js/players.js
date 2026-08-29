// Remote players — renders every peer in my current room as a walking human
// avatar with a floating name tag, driven by pose broadcasts from js/net.js.
//
// Avatars parent to the SCENE (not `dyn`) so they survive rebuild3D, exactly
// like the local walk avatar in view3d.js. Movement is smoothed here with a
// short lerp toward the last received pose (poses arrive at ~12 Hz), and each
// smoothing step calls requestRender() so the on-demand render loop paints.
import { THREE } from "./three_lazy.js";
import { S } from "./state.js";
import { getMainScene, requestRender } from "./view3d.js";
import { HumanFactory } from "./human.js";
import * as net from "./net.js";

const players = {}; // code -> {group, tag, cur:{x,z,yaw}, target:{x,z,yaw}|null, speaking}

function nameTag(text) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = Math.min(240, ctx.measureText(text).width + 28);
  ctx.fillStyle = "rgba(20,24,28,0.72)";
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 10, w, 44, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  sp.scale.set(90, 22.5, 1);
  sp.position.y = 200; // above the head
  sp.renderOrder = 999;
  return sp;
}

function ensurePlayer(code) {
  let p = players[code];
  if (p) return p;
  const scene = getMainScene();
  if (!scene) return null;
  const group = new THREE.Group();
  // deterministic look per friend code (stable across sessions)
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) % 997;
  const type = ["man", "woman", "man", "woman"][seed % 4];
  const body = new THREE.Group();
  HumanFactory.buildMesh(body, type, 172);
  // buildMesh marks it isHuman for the idle animation pass; remote players
  // animate through our own walk cycle instead, so unmark it
  body.userData.isHuman = false;
  group.add(body);
  const tag = nameTag(net.peerName(code));
  group.add(tag);
  group.visible = false;
  scene.add(group);
  p = players[code] = {
    group,
    body,
    tag,
    cur: { x: 0, z: 0, yaw: 0 },
    target: null,
    lastMove: 0,
    phase: Math.random() * 6,
  };
  return p;
}

function removePlayer(code) {
  const p = players[code];
  if (!p) return;
  const scene = getMainScene();
  if (scene) scene.remove(p.group);
  delete players[code];
  requestRender();
}

export function clearPlayers() {
  Object.keys(players).forEach(removePlayer);
}

// walk-cycle: swing limbs while the avatar is translating, settle when idle
function animateGait(p, moving, t) {
  const u = p.body.userData;
  const amp = moving ? 0.55 : 0;
  const w = t * 0.012 + p.phase;
  const target = Math.sin(w) * amp;
  if (u.leftLeg && u.rightLeg) {
    u.leftLeg.rotation.x += (target - u.leftLeg.rotation.x) * 0.4;
    u.rightLeg.rotation.x += (-target - u.rightLeg.rotation.x) * 0.4;
  }
  if (u.leftArm && u.rightArm) {
    u.leftArm.rotation.x += (-target * 0.7 - u.leftArm.rotation.x) * 0.4;
    u.rightArm.rotation.x += (target * 0.7 - u.rightArm.rotation.x) * 0.4;
  }
}

let rafOn = false;
function tick(t) {
  let any = false,
    live = false;
  for (const code in players) {
    const p = players[code];
    any = true;
    if (!p.target) continue;
    const dx = p.target.x - p.cur.x,
      dz = p.target.z - p.cur.z;
    let dyaw = p.target.yaw - p.cur.yaw;
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    const moving = Math.hypot(dx, dz) > 0.5;
    if (moving || Math.abs(dyaw) > 0.01) {
      p.cur.x += dx * 0.25;
      p.cur.z += dz * 0.25;
      p.cur.yaw += dyaw * 0.25;
      live = true;
    }
    if (moving) p.lastMove = t;
    p.group.position.set(p.cur.x, 0, p.cur.z);
    p.group.rotation.y = p.cur.yaw;
    animateGait(p, t - p.lastMove < 200, t);
    if (t - p.lastMove < 400) live = true;
  }
  if (live) requestRender();
  if (any) requestAnimationFrame(tick);
  else rafOn = false;
}
function wake() {
  if (!rafOn) {
    rafOn = true;
    requestAnimationFrame(tick);
  }
}

export function initPlayers() {
  net.on("pose", ({ from, pose }) => {
    const p = ensurePlayer(from);
    if (!p) return;
    if (!pose) {
      p.target = null;
      p.group.visible = false;
      requestRender();
      return;
    }
    if (!p.group.visible) {
      // first pose: snap instead of lerping across the room
      p.cur = { x: pose.x, z: pose.z, yaw: pose.yaw };
      p.group.visible = true;
    }
    p.target = { x: pose.x, z: pose.z, yaw: pose.yaw };
    // a backgrounded tab gets no rAF ticks, so the smoothing loop is frozen —
    // apply the pose hard here so the world is correct when the tab returns
    if (document.hidden) {
      p.cur = { x: pose.x, z: pose.z, yaw: pose.yaw };
      p.group.position.set(p.cur.x, 0, p.cur.z);
      p.group.rotation.y = p.cur.yaw;
    }
    wake();
    requestRender();
  });
  net.on("peer-leave", ({ code }) => removePlayer(code));
  net.on("room", () => {
    // drop avatars of anyone no longer in my room
    Object.keys(players).forEach((code) => {
      if (!net.NET.peers[code]) removePlayer(code);
    });
  });

  // broadcast my own pose on every walk-mode look/move (throttled in net.js)
  window.addEventListener("walk:look", () => {
    net.sendPose(
      S.walk2D ? { x: S.walk2D.x, z: S.walk2D.z, yaw: S.walk2D.yaw } : null,
    );
  });
}

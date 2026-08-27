// Drive-mode pedestrians — the people who make a streamed street look lived in.
//
// One-way imports (state → sky/world): drive_world never reaches back here, so
// the spawn call arrives from drive_traffic.js while a road way is being built.
//
// Deliberately NOT weapon targets: bullets pass through people. This module
// models exactly two reactions to a car — get out of the way, and (if that
// fails) go down, then pick yourself up and walk on. Nothing else happens to
// them, by design.
import * as THREE from "three";
import { D, car, player } from "./drive_state.js";
import { isNight } from "./drive_sky.js";
import { focusPos, insideBuilding, surfaceY } from "./drive_world.js";

export const MAX_PEDS = 20;
const DESPAWN_M = 240; // beyond this from the focus point a walker is recycled
const HIDE_M = 150; // beyond this they still exist but stop being drawn

// ---- shared meshes ---------------------------------------------------------
// Every walker is the same seven meshes; only the shirt material differs, so a
// crowd costs a handful of buffers and one material per palette entry.
const geos = {};
const shirtMats = new Map();
let skinMat = null,
  pantsMat = null,
  shadowMat = null;
const SHIRTS = [
  0xb2453a, 0x3d6ea5, 0x4f7a4a, 0xc2a24f, 0x8a5d9e,
  0xd8d5cf, 0x2f3438, 0xc2704f, 0x4a7d8a, 0xa5527a,
];
function shared() {
  if (geos.torso) return;
  geos.torso = new THREE.BoxGeometry(0.42, 0.62, 0.24);
  geos.head = new THREE.SphereGeometry(0.13, 10, 8);
  geos.limb = new THREE.BoxGeometry(0.15, 0.74, 0.19);
  geos.arm = new THREE.BoxGeometry(0.12, 0.58, 0.14);
  geos.shadow = new THREE.CircleGeometry(0.34, 12);
  skinMat = new THREE.MeshLambertMaterial({ color: 0xe0ab86 });
  pantsMat = new THREE.MeshLambertMaterial({ color: 0x2f3540 });
  shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false,
  });
}
function shirtMat(hex) {
  let m = shirtMats.get(hex);
  if (!m) shirtMats.set(hex, (m = new THREE.MeshLambertMaterial({ color: hex })));
  return m;
}
// A limb hangs from a pivot group so the walk cycle is one rotation per limb
// instead of per-frame position maths.
function limb(geo, mat, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -geo.parameters.height / 2;
  pivot.add(m);
  return pivot;
}
export function buildPed(hex) {
  shared();
  const g = new THREE.Group();
  const shirt = shirtMat(hex);
  const torso = new THREE.Mesh(geos.torso, shirt);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(geos.head, skinMat);
  head.position.y = 1.55;
  g.add(head);
  const lLeg = limb(geos.limb, pantsMat, -0.11, 0.8),
    rLeg = limb(geos.limb, pantsMat, 0.11, 0.8),
    lArm = limb(geos.arm, shirt, -0.27, 1.38),
    rArm = limb(geos.arm, shirt, 0.27, 1.38);
  g.add(lLeg, rLeg, lArm, rArm);
  // cheap contact shadow: 20 walkers casting real shadows costs more in the
  // shadow pass than they are worth at this size
  const sh = new THREE.Mesh(geos.shadow, shadowMat);
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.03;
  g.add(sh);
  g.userData.limbs = { torso, head, lLeg, rLeg, lArm, rArm };
  return g;
}

// ---- spawning --------------------------------------------------------------
// The sidewalk is the road centreline pushed out past the kerb.
function offsetLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    out.push({ x: pts[i].x + (-dz / l) * off, z: pts[i].z + (dx / l) * off });
  }
  return out;
}
// Crowd size follows the LENGTH of the street, not its vertex count: an OSM
// straight is two points and would otherwise never get anybody.
function lineLength(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return m;
}
// resample so a two-point street still has somewhere to walk to
function walkable(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 14));
    for (let k = 1; k <= n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}
export function spawnPedsOnWay(rpts, wid, wayId) {
  if (wid < 4 || rpts.length < 2 || D.peds.length >= MAX_PEDS) return;
  // fewer people out after dark, and never a crowd on a slip road
  const want = Math.min(
    isNight() ? 1 : 3,
    Math.max(1, Math.round(lineLength(rpts) / 110)),
    MAX_PEDS - D.peds.length,
  );
  if (Math.random() > (isNight() ? 0.4 : 0.8)) return;
  for (let n = 0; n < want; n++) {
    const side = (wayId + n) % 2 ? 1 : -1;
    const line = offsetLine(walkable(rpts), side * (wid / 2 + 1.25));
    const i = Math.floor(Math.random() * line.length);
    const p = line[i];
    if (insideBuilding(p.x, p.z)) continue;
    const fp = focusPos();
    if (Math.hypot(p.x - fp.x, p.z - fp.z) < 22) continue; // not on top of the player
    const g = buildPed(SHIRTS[(wayId + n * 3) % SHIRTS.length]);
    D.scene.add(g);
    D.peds.push({
      g, line, i,
      x: p.x, z: p.z,
      h: 0,
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 1.1 + Math.random() * 0.55,
      phase: Math.random() * 6.28,
      state: "walk",
      until: 0,
      vx: 0, vz: 0,
    });
  }
}
export function pedsClear() {
  D.peds.forEach((p) => D.scene.remove(p.g));
  D.peds.length = 0;
}
export function removePed(idx) {
  D.scene.remove(D.peds[idx].g);
  D.peds.splice(idx, 1);
}

// ---- per-frame -------------------------------------------------------------
// The only thing on the street moving fast enough to matter is the player's
// car, and its live coordinates are `car`, NOT activeV (whose x/z only catch up
// when the car is parked) — the same trap that once killed the skid marks.
// Every car moving fast enough to be worth dodging — the player's, and any of
// the AI traffic. Built once per frame, not per walker.
function threats() {
  const out = [];
  if (!player.onFoot) {
    const sp = Math.hypot(car.vx, car.vz);
    if (sp > 3) out.push({ x: car.x, z: car.z, vx: car.vx, vz: car.vz, sp });
  }
  for (const v of D.vehicles) {
    if (!v.ai || v.wrecked || v.ai.speed < 3) continue;
    const sp = v.ai.speed;
    out.push({ x: v.x, z: v.z, vx: Math.sin(v.heading) * sp, vz: -Math.cos(v.heading) * sp, sp });
  }
  return out;
}
function nearestThreat(list, x, z) {
  let best = null,
    bd = Infinity;
  for (const t of list) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best && bd < 26 ? best : null;
}
function startle(p, th, now) {
  // run for the far kerb, square to the car's path rather than straight down it
  const nx = -th.vz / th.sp,
    nz = th.vx / th.sp;
  const away = (p.x - th.x) * nx + (p.z - th.z) * nz >= 0 ? 1 : -1;
  p.vx = nx * away;
  p.vz = nz * away;
  p.state = "flee";
  p.until = now + 1500 + Math.random() * 700;
}
export function pedsTick(dt, now) {
  if (!D.peds.length) return;
  const fp = focusPos();
  const list = threats();
  for (let k = D.peds.length - 1; k >= 0; k--) {
    const p = D.peds[k];
    const th = nearestThreat(list, p.x, p.z);
    const far = Math.hypot(p.x - fp.x, p.z - fp.z);
    if (far > DESPAWN_M) {
      removePed(k);
      continue;
    }
    p.g.visible = far < HIDE_M;
    if (!p.g.visible) continue;

    if (p.state === "down") {
      if (now > p.until) {
        p.state = "walk";
        p.g.rotation.x = 0;
        p.g.rotation.z = 0;
      }
    } else if (th) {
      const d = Math.hypot(p.x - th.x, p.z - th.z);
      // a car at speed inside 2 m knocks a walker over: they roll clear, sit
      // out a couple of seconds and get back up. That is the whole outcome.
      if (d < 1.9 && th.sp > 5 && p.state !== "down") {
        p.state = "down";
        p.until = now + 2400;
        const l = Math.hypot(th.vx, th.vz) || 1;
        p.x += (th.vx / l) * 1.4;
        p.z += (th.vz / l) * 1.4;
      } else if (d < 11 && p.state !== "flee") {
        // only bolt if the car is actually coming this way
        const closing = ((p.x - th.x) * th.vx + (p.z - th.z) * th.vz) / (d || 1);
        if (closing > 3) startle(p, th, now);
      }
    }
    if (p.state === "flee" && now > p.until) {
      p.state = "walk";
      // rejoin the sidewalk at whichever point is nearest now
      let bi = 0,
        bd = Infinity;
      for (let i = 0; i < p.line.length; i++) {
        const d = Math.hypot(p.line[i].x - p.x, p.line[i].z - p.z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      p.i = bi;
    }

    let sp = 0;
    if (p.state === "walk") {
      const tgt = p.line[p.i];
      let dx = tgt.x - p.x,
        dz = tgt.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) {
        p.i += p.dir;
        if (p.i < 0 || p.i >= p.line.length) {
          p.dir = -p.dir;
          p.i = Math.max(0, Math.min(p.line.length - 1, p.i + p.dir * 2));
        }
      } else {
        sp = p.speed;
        p.x += (dx / d) * sp * dt;
        p.z += (dz / d) * sp * dt;
        p.h = Math.atan2(dx, -dz);
      }
    } else if (p.state === "flee") {
      sp = 4.2;
      const nx = p.x + p.vx * sp * dt,
        nz = p.z + p.vz * sp * dt;
      if (!insideBuilding(nx, nz)) {
        p.x = nx;
        p.z = nz;
      } else p.until = 0; // wall in the way — stop running, resume the walk
      p.h = Math.atan2(p.vx, -p.vz);
    }

    // pose
    const L = p.g.userData.limbs;
    if (p.state === "down") {
      p.g.rotation.x = -Math.PI / 2.2;
      L.lArm.rotation.x = -0.4;
      L.rArm.rotation.x = 0.4;
      L.lLeg.rotation.x = 0.3;
      L.rLeg.rotation.x = -0.2;
    } else {
      p.phase += dt * (sp * 3.2 + (sp > 0 ? 1.4 : 0));
      const swing = Math.sin(p.phase) * (p.state === "flee" ? 0.85 : 0.55);
      L.lLeg.rotation.x = swing;
      L.rLeg.rotation.x = -swing;
      if (p.state === "flee") {
        // hands up, elbows high — reads as "get out of the road" at a glance
        L.lArm.rotation.x = -2.3 + swing * 0.25;
        L.rArm.rotation.x = -2.3 - swing * 0.25;
      } else {
        L.lArm.rotation.x = -swing * 0.75;
        L.rArm.rotation.x = swing * 0.75;
      }
      L.torso.position.y = 1.12 + Math.abs(Math.sin(p.phase)) * 0.03;
      L.head.position.y = 1.55 + Math.abs(Math.sin(p.phase)) * 0.03;
    }
    p.g.position.set(p.x, surfaceY(p.x, p.z), p.z);
    p.g.rotation.y = -p.h;
  }
}
// introspection for tests/console
export function debugPeds() {
  return {
    count: D.peds.length,
    fleeing: D.peds.filter((p) => p.state === "flee").length,
    down: D.peds.filter((p) => p.state === "down").length,
  };
}

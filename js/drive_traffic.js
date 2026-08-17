// Drive-mode traffic & effects: parked/abandoned vehicles, wreck explosions,
// the weapon-system target list, tyre marks, beacons and the taxi passenger.
//
// Imports drive_world.js one-way; drive_world reaches back for maybeParkOnWay
// through its hook (wired in drive.js) so the two never import each other.
import * as THREE from "three";
import * as net from "./net.js";
import { elevIsReady } from "./drive_geo.js";
import {
  D, car, player, groundTiles, MAX_PARKED, PARKED_COLORS, CAR_Y, skidPrev,
} from "./drive_state.js";
import { isNight } from "./drive_sky.js";
import { insideBuilding, roadYAt, surfaceY } from "./drive_world.js";
import { buildCarMesh, CAR_TYPES } from "./drive_car_mesh.js";

// ---- vehicles --------------------------------------------------------------
export function placeVehicleMesh(v) {
  v.mesh.position.set(v.x, surfaceY(v.x, v.z) + CAR_Y, v.z);
  v.mesh.rotation.order = "YXZ";
  const fx = Math.sin(v.heading),
    fz = -Math.cos(v.heading);
  const pitch = elevIsReady()
    ? Math.atan2(
        surfaceY(v.x + fx * 2.2, v.z + fz * 2.2) -
          surfaceY(v.x - fx * 2.2, v.z - fz * 2.2),
        4.4,
      )
    : 0;
  v.mesh.rotation.set(pitch, -v.heading, 0);
}
export function spawnVehicle(color, x, z, heading, type) {
  const mesh = buildCarMesh(color, type);
  const v = {
    mesh, x, z, heading, hp: 100,
    wrecked: false, lastFx: 0, pendingBoom: 0, burnUntil: 0,
    braking: false, reversing: false,
  };
  D.scene.add(mesh);
  placeVehicleMesh(v);
  D.vehicles.push(v);
  syncVehicleLights(v);
  return v;
}
// Car geometry and paint live in module-level caches shared by every vehicle,
// so tearing one down only unhooks it from the scene — the per-car lamp
// materials are the sole thing this car actually owns.
export function disposeVehicleMesh(v) {
  D.scene.remove(v.mesh);
  (v.mesh.userData.ownMats || []).forEach((m) => m.dispose());
}
export function nearestVehicle(r) {
  let best = null,
    bd = r;
  for (let i = 0; i < D.vehicles.length; i++) {
    const v = D.vehicles[i];
    if (v.wrecked) continue;
    const d = Math.hypot(v.x - player.x, v.z - player.z) - 1.2; // ≈ body edge
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}
export function explodeVehicle(v) {
  if (v.wrecked) return;
  v.wrecked = true;
  v.hp = 0;
  v.burnUntil = performance.now() + 9000;
  const y = surfaceY(v.x, v.z) + 0.8;
  D.weapons.explosionAt(new THREE.Vector3(v.x, y, v.z));
  if (!D.charredMat)
    D.charredMat = new THREE.MeshStandardMaterial({
      color: 0x181a1c, roughness: 0.95, metalness: 0.1,
    });
  v.mesh.traverse((m) => {
    if (m.isMesh) m.material = D.charredMat;
  });
  syncVehicleLights(v); // lamps out, beams off
  // chain reaction: cook off nearby cars a beat later
  D.vehicles.forEach((o) => {
    if (o === v || o.wrecked || o.pendingBoom) return;
    if (Math.hypot(o.x - v.x, o.z - v.z) < 8)
      o.pendingBoom = performance.now() + 300 + Math.random() * 500;
  });
  // blast damage to the player
  const px = player.onFoot ? player.x : car.x,
    pz = player.onFoot ? player.z : car.z;
  const pd = Math.hypot(px - v.x, pz - v.z);
  if (!player.onFoot && v === D.activeV) {
    car.vx = car.vz = 0;
    D.weapons.damage(200); // went up with the car
  } else if (player.onFoot && pd < 10) {
    D.weapons.damage(Math.round(80 * (1 - pd / 10)) + 10);
  }
}
// smoke/fire trickle + delayed chain explosions (every frame)
export function vehiclesTick(now) {
  for (let i = 0; i < D.vehicles.length; i++) {
    const v = D.vehicles[i];
    if (v.pendingBoom && now >= v.pendingBoom) {
      v.pendingBoom = 0;
      explodeVehicle(v);
      continue;
    }
    if (v.wrecked) {
      if (now < v.burnUntil && now - v.lastFx > 95) {
        v.lastFx = now;
        const gy = surfaceY(v.x, v.z);
        D.weapons.puff(v.x + (Math.random() - 0.5) * 1.4, gy + 0.9, v.z + (Math.random() - 0.5) * 1.4, {
          color: [0xffb03c, 0xff7a26, 0xff4f1e][i % 3], size: 0.8 + Math.random() * 0.9,
          opacity: 0.9, add: true, vy: 1.8 + Math.random(), life: 0.4, grow: 0.8, damp: 0.94,
        });
        if (Math.random() < 0.5)
          D.weapons.puff(v.x, gy + 1.6, v.z, {
            color: 0x17181a, size: 1.1, opacity: 0.5, vy: 1.5,
            vx: (Math.random() - 0.5), vz: (Math.random() - 0.5),
            life: 1.5, grow: 1.4, damp: 0.98,
          });
      }
    } else if (v.hp < 45 && now - v.lastFx > 170) {
      // damaged engine smolders from the hood
      v.lastFx = now;
      const fx = Math.sin(v.heading),
        fz = -Math.cos(v.heading);
      D.weapons.puff(v.x + fx * 1.6, surfaceY(v.x, v.z) + 1, v.z + fz * 1.6, {
        color: 0x5a5d61, size: 0.5, opacity: 0.45, vy: 1.2,
        vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6,
        life: 1.1, grow: 0.9, damp: 0.98,
      });
    }
  }
}
// candidate parked-car spot along a freshly streamed road way
export function maybeParkOnWay(rpts, wid, wayId) {
  if (wid < 5.5 || D.vehicles.length >= MAX_PARKED || rpts.length < 2) return;
  if (Math.random() > 0.45) return;
  const i = Math.max(1, Math.floor(rpts.length / 2));
  const a = rpts[i - 1],
    b = rpts[i];
  if (Math.hypot(b.x - a.x, b.z - a.z) < 2) return;
  const h = Math.atan2(b.x - a.x, -(b.z - a.z));
  const side = wayId % 2 ? 1 : -1;
  const off = wid / 2 - 1.15;
  const px = (a.x + b.x) / 2 + Math.cos(h) * off * side,
    pz = (a.z + b.z) / 2 + Math.sin(h) * off * side;
  if (insideBuilding(px, pz)) return;
  for (let k = 0; k < D.vehicles.length; k++)
    if (Math.hypot(D.vehicles[k].x - px, D.vehicles[k].z - pz) < 11) return;
  spawnVehicle(
    PARKED_COLORS[wayId % PARKED_COLORS.length],
    px, pz, h + (side < 0 ? Math.PI : 0),
    Math.abs(Math.round(wayId / 7)) % CAR_TYPES.length, // mixed street traffic
  );
}

// ---- weapon-system hooks (ctx callbacks for js/weapons.js) -----------------
// everything a bullet can hit: the world, every car, every peer ghost
export function weaponTargets() {
  const list = [
    { root: D.bldGroup, kind: "world" },
    { root: D.roadGroup, kind: "world" },
  ];
  groundTiles.forEach((m) => list.push({ root: m, kind: "world" }));
  for (let i = 0; i < D.vehicles.length; i++) {
    const v = D.vehicles[i];
    if (v === D.activeV && !player.onFoot) continue; // don't shoot yourself
    list.push({ root: v.mesh, kind: "vehicle", ref: v });
  }
  if (D.ses)
    for (const code in D.ses.ghosts)
      list.push({ root: D.ses.ghosts[code].root, kind: "ghost", ref: code });
  return list;
}
export function weaponHit(kind, ref, dmg) {
  if (kind === "vehicle") {
    if (ref.wrecked) return;
    ref.hp -= dmg;
    if (ref.hp <= 0) explodeVehicle(ref);
  } else if (kind === "ghost") {
    if (D.ses && D.ses.mp && net.NET.connected)
      net.sendData({ k: "fdmg", id: D.ses.def.id, dmg }, ref);
  }
}
export function weaponShot(o, d, w) {
  if (D.ses && D.ses.mp && net.NET.connected)
    net.sendData({
      k: "fshot",
      id: D.ses.def.id,
      o: o.map((n) => Math.round(n * 10) / 10),
      d: d.map((n) => Math.round(n * 100) / 100),
      w,
    });
}

// ---- car models ------------------------------------------------------------
// A car is one extruded SIDE PROFILE — so the silhouette carries a real hood
// line, a raked windshield and cut wheel arches instead of stacked boxes —
// plus a dark glass greenhouse, a painted roof cap over A/C pillars, bumpers,
// lamp state for one vehicle: headlights follow the clock, tail lights follow
// the brake, reverse lamps follow the gear
export function syncVehicleLights(v) {
  const L = v.mesh.userData.lamps;
  if (!L) return;
  const night = isNight(),
    live = v === D.activeV && !player.onFoot && !v.wrecked;
  const braking = live && !!v.braking,
    rev = live && !!v.reversing;
  L.head.emissiveIntensity = v.wrecked ? 0 : night ? 2.6 : 0.4;
  L.tail.emissiveIntensity = v.wrecked ? 0 : braking ? 3.4 : night ? 1.1 : 0.3;
  L.rev.emissiveIntensity = rev ? 2.2 : 0;
  L.beams.visible = night && !v.wrecked && (live || v.ghost);
  L.glows.forEach((gl) => {
    const on = gl.kind === "head" ? night : braking || night;
    gl.sp.visible = !v.wrecked && on;
    gl.sp.material.opacity = 1;
  });
}

// ---- tyre marks ------------------------------------------------------------
// One ring buffer of quads in a single draw call. Each vertex carries the
// stamp's birth time, so the shader fades a mark out on its own and the CPU
// only touches the four corners it just laid down.
const SKID_MAX = 320, // quads before the oldest is recycled
  SKID_LIFE = 18; // seconds to fade out
export function skidInit() {
  const pos = new THREE.BufferAttribute(new Float32Array(SKID_MAX * 12), 3);
  const birth = new THREE.BufferAttribute(new Float32Array(SKID_MAX * 4).fill(-1e6), 1);
  const idx = new Uint16Array(SKID_MAX * 6);
  for (let q = 0; q < SKID_MAX; q++) {
    const v = q * 4,
      i = q * 6;
    idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2;
    idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", pos);
  geo.setAttribute("aBirth", birth);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, SKID_MAX * 6);
  D.skidUni = { uTime: { value: 0 }, uLife: { value: SKID_LIFE } };
  D.skidMesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms: D.skidUni,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        attribute float aBirth;
        uniform float uTime, uLife;
        varying float vA;
        void main() {
          vA = clamp(1.0 - (uTime - aBirth) / uLife, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          if (vA <= 0.004) discard;
          gl_FragColor = vec4(0.028, 0.028, 0.032, vA * 0.55);
        }`,
    }),
  );
  D.skidMesh.frustumCulled = false;
  D.skidMesh.renderOrder = 1;
  D.skidPos = pos;
  D.skidBirth = birth;
  D.scene.add(D.skidMesh);
}
export function skidClear() {
  if (!D.skidBirth) return;
  D.skidBirth.array.fill(-1e6);
  D.skidBirth.needsUpdate = true;
  D.skidHead = 0;
  skidPrev[0] = skidPrev[1] = null;
}
// lay one stamp between the wheel's last contact point and this one
export function skidStamp(slot, x, z, halfW, tSec) {
  const p = skidPrev[slot];
  if (!p) {
    skidPrev[slot] = { x, z };
    return;
  }
  const dx = x - p.x,
    dz = z - p.z,
    l = Math.hypot(dx, dz);
  if (l < 0.3) return;
  if (l > 6) {
    // teleport/respawn — don't smear a stripe across the map
    skidPrev[slot] = { x, z };
    return;
  }
  const nx = (-dz / l) * halfW,
    nz = (dx / l) * halfW;
  const y0 = surfaceY(p.x, p.z) + 0.045,
    y1 = surfaceY(x, z) + 0.045;
  const q = D.skidHead % SKID_MAX,
    o = q * 4;
  D.skidPos.setXYZ(o, p.x + nx, y0, p.z + nz);
  D.skidPos.setXYZ(o + 1, p.x - nx, y0, p.z - nz);
  D.skidPos.setXYZ(o + 2, x - nx, y1, z - nz);
  D.skidPos.setXYZ(o + 3, x + nx, y1, z + nz);
  for (let i = 0; i < 4; i++) D.skidBirth.setX(o + i, tSec);
  D.skidPos.needsUpdate = true;
  D.skidBirth.needsUpdate = true;
  D.skidHead++;
  skidPrev[slot] = { x, z };
}
// Slip/braking/dirt reactions for the car the player is driving. Position
// comes from `car` (the live drive state) — a vehicle's own x/z only catches
// up when you park it, so reading those would pin every mark to the spawn.
export function tyreFx(v, slip, fwd, tSec, now) {
  const T = v.mesh.userData.type,
    sp = Math.abs(fwd);
  const rear = T.ax[1] - T.len / 2,
    hx = Math.sin(car.heading),
    hz = -Math.cos(car.heading);
  const rx = Math.cos(car.heading),
    rz = Math.sin(car.heading);
  const lock = D.keys.brake && sp > 3;
  const slipping = Math.abs(slip) > 2.6 || lock;
  const half = T.wid / 2 - 0.14;
  for (let s = 0; s < 2; s++) {
    const side = s ? 1 : -1;
    const x = car.x + hx * rear + rx * half * side,
      z = car.z + hz * rear + rz * half * side;
    if (slipping) skidStamp(s, x, z, 0.13, tSec);
    else skidPrev[s] = { x, z };
  }
  if (!D.weapons) return;
  const onRoad = roadYAt(car.x, car.z) != null;
  const smoke = slipping && (Math.abs(slip) > 4.5 || lock) && sp > 6;
  const dust = !onRoad && sp > 7;
  if ((smoke || dust) && now - (v.lastTyre || 0) > 55) {
    v.lastTyre = now;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1;
      const x = car.x + hx * rear + rx * half * side,
        z = car.z + hz * rear + rz * half * side;
      D.weapons.puff(x, surfaceY(x, z) + 0.25, z, {
        color: dust ? 0x9c8b6d : 0xb9bcc0,
        size: dust ? 0.7 : 0.55,
        opacity: dust ? 0.4 : 0.32,
        vy: 0.9 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 0.8 - hx * sp * 0.06,
        vz: (Math.random() - 0.5) * 0.8 - hz * sp * 0.06,
        life: 1.1, grow: 1.5, damp: 0.95,
      });
    }
  }
}

// beacon pillar; col = hex. Returns group positioned by caller.
export function buildBeacon(col, radius) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.5, radius * 0.75, 260, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  beam.position.y = 130;
  g.add(beam);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.5, 24),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }),
  );
  disc.position.y = 0.3;
  g.add(disc);
  g.userData.setColor = (c) =>
    g.children.forEach((m) => m.material.color.set(c));
  return g;
}

// tiny passenger figure for taxi mode (bobbing while waiting)
export function buildPassenger() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b48c });
  const shirt = new THREE.MeshLambertMaterial({
    color: [0x3d6ea5, 0xa5527a, 0x5d8a4e, 0xc2704f][Math.floor(Math.random() * 4)],
  });
  const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.6, 10), shirt);
  bodyM.position.y = 1.1;
  g.add(bodyM);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), skin);
  head.position.y = 2.25;
  g.add(head);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 1.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xffc828 }),
  );
  arrow.rotation.x = Math.PI;
  arrow.position.y = 4.2;
  g.add(arrow);
  g.userData.arrow = arrow;
  return g;
}


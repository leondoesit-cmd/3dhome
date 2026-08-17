// Drive engine — 3D GTA-style driving over the real world. One engine, three
// session modes:
//   goto — free drive to a friend's address; arriving hands off to the visit
//          flow (js/visit.js).
//   race — ordered checkpoints (2 points = point-to-point). Countdown start,
//          live timer + splits, local best time, and in multiplayer the other
//          players' cars render live as colored ghosts (no collision).
//   taxi — Crazy-Taxi-style missions inside a play area: pick up a passenger,
//          deliver before the fare timer dies, chain fares until time is up.
//
// Scene: chase camera behind a 3D car, ground streamed from aerial imagery
// tiles, real building footprints (OSM Overpass) extruded per ~500 m chunk,
// OSRM route ribbons, beacons for destinations/checkpoints.
//
// World: local tangent plane in METERS anchored per session (races anchor at
// the start point so every multiplayer client shares one frame). +x = east,
// +z = south (the app's convention, see site.js llToLocalCm).
import * as THREE from "three";
import { createRenderer, render as gpuRender, ready as gpuReady, LUX } from "./gpu.js";
import { t } from "./i18n.js";
import { flash } from "./ui.js";
import { S } from "./state.js";

import * as net from "./net.js";
import { createWeapons } from "./weapons.js";
import { escapeHTML } from "./safe.js";
import {
  Z, TILE_PX, EARTH_C, setAnchor, llToM, mToLL, loadElevTile, elevAtLL, sampleElevM, ELEV_Z, elevIsReady, elevRef, elevSessionAge, elevReset, elevPromote,
} from "./drive_geo.js";
import {
  buildCarMesh, CAR_TYPES,
} from "./drive_car_mesh.js";
import {
  D, car, player, groundTiles, bldChunks, roadById, skidPrev, resetSessionState, fmtMs, MAX_PARKED, PARKED_COLORS, CAR_Y, SHADOW_HALF, GHOST_COLORS, HUD_ARC,
} from "./drive_state.js";
import {
  audioStart, audioStop, engineUpdate, gearRpm, sfx, GEARS, IDLE_RPM, REDLINE_RPM,
} from "./drive_audio.js";
import {
  TOD, applyTOD, isNight, setSkyHooks, skyMaterial, sunFollow,
} from "./drive_sky.js";
import {
  applyNightMat, bldMats, fetchRoute, focusPos, insideBuilding, roadYAt, setRouteRibbon, setWorldHooks, surfaceY, svTick, syncBuildings, syncTiles,
} from "./drive_world.js";
import {
  buildBeacon, buildPassenger, disposeVehicleMesh, explodeVehicle, maybeParkOnWay,
  nearestVehicle, placeVehicleMesh, skidClear, skidInit, spawnVehicle,
  syncVehicleLights, tyreFx, vehiclesTick, weaponHit, weaponShot, weaponTargets,
} from "./drive_traffic.js";
import {
  finishGoto, hudMsg, hudMsgOff, hudUpdate, raceSyncBeacons, raceTarget,
  raceTick, renderRaceResults, setModeHooks, taxiTick,
} from "./drive_modes.js";
import { mpHook, mpTick } from "./drive_mp.js";
import { dampingFactor, forEachPhysicsStep, safeDeltaSeconds } from "./physics_runtime.js";

// Z/TILE_PX/EARTH_C and lat-lon math live in drive_geo.js
// All shared mutable state lives in drive_state.js — see the note there.
function setSessionAnchor(a) {
  D.anchor = a;
  setAnchor(a);
}

// drawable road width (m) per OSM highway class; anything absent is skipped.
// road surface, ground tiles, OSM buildings/roads and routing live in drive_world.js
// sky / time-of-day / IBL live in drive_sky.js
// ---- scene bits ------------------------------------------------------------
function buildScene() {
  // hand the sky module its four world/traffic callbacks up front, so it never
  // has to import back into drive.js
  setWorldHooks({ maybeParkOnWay });
  setModeHooks({ stopDrive });
  setSkyHooks({
    focusPos,
    surfaceY,
    applyNightMat,
    syncVehicleLights,
    bldMats,
  });
  D.scene = new THREE.Scene();
  D.scene.fog = new THREE.Fog(0xb2cee6, 340, 2500);
  D.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4200);
  D.renderer = createRenderer({
    canvas: D.canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  D.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  D.renderer.outputColorSpace = THREE.SRGBColorSpace;
  D.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  D.renderer.toneMappingExposure = 1.0;
  D.renderer.shadowMap.enabled = true;
  D.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  D.sun = new THREE.DirectionalLight(0xfff3dc, LUX * 1.6);
  D.sun.castShadow = true;
  const mapSize = window.matchMedia("(pointer: coarse)").matches ? 1024 : 2048;
  D.sun.shadow.mapSize.set(mapSize, mapSize);
  D.sun.shadow.camera.left = -SHADOW_HALF;
  D.sun.shadow.camera.right = SHADOW_HALF;
  D.sun.shadow.camera.top = SHADOW_HALF;
  D.sun.shadow.camera.bottom = -SHADOW_HALF;
  D.sun.shadow.camera.near = 20;
  D.sun.shadow.camera.far = 620;
  D.sun.shadow.bias = -0.0006;
  D.sun.shadow.normalBias = 0.5;
  D.sun.shadow.camera.updateProjectionMatrix();
  D.scene.add(D.sun);
  D.scene.add(D.sun.target);
  D.hemi = new THREE.HemisphereLight(0x9cc3e8, 0x585440, LUX * 0.55);
  D.scene.add(D.hemi);

  D.skyUni = {
    uZen: { value: new THREE.Color(0x2f6ec4) },
    uHor: { value: new THREE.Color(0xc4dcf0) },
    uGnd: { value: new THREE.Color(0x59604f) },
    uSunC: { value: new THREE.Color(0xfff3dc) },
    uSunDir: { value: new THREE.Vector3(0.36, 0.66, -0.66) },
    uCloud: { value: 0.5 },
    uNight: { value: 0 },
    uTime: { value: 0 },
  };
  D.sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 20), skyMaterial());
  D.sky.frustumCulled = false;
  D.sky.renderOrder = -1;
  D.scene.add(D.sky);

  D.bldGroup = new THREE.Group();
  D.scene.add(D.bldGroup);
  D.roadGroup = new THREE.Group();
  D.scene.add(D.roadGroup);
  skidInit();
  applyTOD(D.todIdx);
  // applyTOD's PMREM env-map step is skipped while the GPU backend is still
  // coming up (async since r185), so run it again once the backend is live —
  // otherwise the cars keep the default env map and read as flat plastic.
  gpuReady(D.renderer).then(function () { applyTOD(D.todIdx); });
  // the player's car is a session vehicle now — see beginSession/spawnVehicle
}

// vehicles, tyre marks, beacons and weapon hooks live in drive_traffic.js
// ---- input -----------------------------------------------------------------
const MAP_CAR = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  Space: "brake",
};
const MAP_FOOT = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", KeyD: "right", // strafe
  ArrowLeft: "tleft", ArrowRight: "tright", // keyboard turn (no-mouse play)
  Space: "jump",
  ShiftLeft: "sprint", ShiftRight: "sprint",
};
function onKey(e, down) {
  const k = (player.onFoot ? MAP_FOOT : MAP_CAR)[e.code];
  if (k) {
    D.keys[k] = down;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (!down) return;
  if (e.code === "Escape") {
    stopDrive();
    e.preventDefault();
  } else if (e.code === "KeyM") {
    D.muted = !D.muted;
    flash(D.muted ? t("dr_muted") : t("dr_unmuted"));
  } else if (e.code === "KeyF") {
    toggleFoot();
    e.preventDefault();
  } else if (e.code === "KeyT") {
    applyTOD(D.todIdx + 1);
    flash(t(TOD[D.todIdx].key));
    e.preventDefault();
  } else if (D.weapons && D.weapons.key(e.code, performance.now())) {
    e.preventDefault();
  } else if (e.code === "Enter") {
    if (D.ses && D.ses.mode === "goto" && D.ses.arrived) finishGoto();
    else if (D.ses && D.ses.resultsShown) stopDrive();
  }
}
const keyDown = (e) => D.running && onKey(e, true);
const keyUp = (e) => D.running && onKey(e, false);

// ---- car ⇄ foot transitions ------------------------------------------------
function requestLock() {
  // NOTE: only call from a CLICK gesture — Chrome rejects keyboard-gesture
  // lock requests AND then cooldown-blocks the next real one for ~1 s.
  try {
    const p = D.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (_) {}
}
function setHint(key) {
  D.overlay.querySelector("#driveHint").textContent = t(key);
}
function toggleFoot() {
  if (!D.ses || D.ses.locked || D.weapons.isDead()) return;
  if (!player.onFoot) exitCar();
  else {
    const v = nearestVehicle(3.4);
    if (v) enterCar(v);
  }
}
function exitCar() {
  // park the active car exactly where the drive state left it
  D.activeV.x = car.x;
  D.activeV.z = car.z;
  D.activeV.heading = car.heading;
  car.vx = car.vz = 0;
  placeVehicleMesh(D.activeV);
  // step out the driver's side; other side if that's inside a building
  const rxc = Math.cos(car.heading),
    rzc = Math.sin(car.heading);
  let px = car.x - rxc * 2.2,
    pz = car.z - rzc * 2.2;
  if (insideBuilding(px, pz)) {
    px = car.x + rxc * 2.2;
    pz = car.z + rzc * 2.2;
  }
  player.x = px;
  player.z = pz;
  player.y = surfaceY(px, pz);
  player.vy = 0;
  player.onGround = true;
  player.yaw = car.heading;
  player.pitch = 0;
  player.onFoot = true;
  D.keys = {};
  D.stepAcc = 0;
  D.camera.near = 0.06; // viewmodel sits ~0.5 m out — don't near-clip it
  D.camera.updateProjectionMatrix();
  D.weapons.setActive(true);
  syncVehicleLights(D.activeV); // parked now: brake lights out, beams off
  D.overlay.querySelector("#driveHud").style.display = "none";
  D.hudEls.fx.style.opacity = 0;
  D.overlay.classList.add("onfoot");
  // mouse-look works unlocked too; the first click upgrades to pointer lock
  const lockEl = D.overlay.querySelector("#footLock");
  lockEl.style.display = "flex";
  clearTimeout(lockEl._t);
  lockEl._t = setTimeout(() => (lockEl.style.display = "none"), 4000);
  setHint("ft_hint");
  D.camPos = null;
}
function enterCar(v) {
  if (document.pointerLockElement) document.exitPointerLock();
  player.onFoot = false;
  D.weapons.setActive(false);
  D.camera.near = 0.5; // chase cam: keep depth precision for distant roads
  D.camera.updateProjectionMatrix();
  const prev = D.activeV;
  D.activeV = v;
  D.carGroup = v.mesh;
  D.wheels = v.mesh.userData.wheels;
  car.x = v.x;
  car.z = v.z;
  car.heading = v.heading;
  car.vx = car.vz = 0;
  car.slip = car.lastFwd = car.dive = car.lean = 0;
  car.pitchS = v.mesh.rotation.x;
  car.rollS = v.mesh.rotation.z;
  car.rideY = null;
  D.steerVis = 0;
  D.camPos = null;
  D.keys = {};
  skidPrev[0] = skidPrev[1] = null;
  if (prev && prev !== v) syncVehicleLights(prev);
  syncVehicleLights(v);
  D.overlay.querySelector("#driveHud").style.display = "";
  D.overlay.querySelector("#footPrompt").style.display = "none";
  D.overlay.querySelector("#footLock").style.display = "none";
  D.overlay.classList.remove("onfoot");
  setHint("dr_hint");
}
// after WASTED: wake up on foot next to where it happened
function respawnPlayer() {
  const px = player.onFoot ? player.x : car.x,
    pz = player.onFoot ? player.z : car.z;
  let sx = px,
    sz = pz;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2,
      tx = px + Math.sin(a) * 6,
      tz = pz + Math.cos(a) * 6;
    if (!insideBuilding(tx, tz)) {
      sx = tx;
      sz = tz;
      break;
    }
  }
  player.x = sx;
  player.z = sz;
  player.y = surfaceY(sx, sz);
  player.vy = 0;
  player.pitch = 0;
  if (!player.onFoot) {
    // died inside the car (it blew up) — come to on the pavement
    player.onFoot = true;
    D.keys = {};
    D.camera.near = 0.06;
    D.camera.updateProjectionMatrix();
    D.weapons.setActive(true);
    D.overlay.querySelector("#driveHud").style.display = "none";
    D.overlay.classList.add("onfoot");
    setHint("ft_hint");
  }
}

// ---- on-foot physics (meters) ----------------------------------------------
function stepFoot(dt) {
  const dead = D.weapons.isDead();
  if (D.keys.tleft) player.yaw -= 2.4 * dt;
  if (D.keys.tright) player.yaw += 2.4 * dt;
  const fwd = (D.keys.up ? 1 : 0) - (D.keys.down ? 1 : 0),
    str = (D.keys.right ? 1 : 0) - (D.keys.left ? 1 : 0);
  let mvx = 0,
    mvz = 0;
  if (!dead && (fwd || str)) {
    const fx = Math.sin(player.yaw),
      fz = -Math.cos(player.yaw),
      rxc = Math.cos(player.yaw),
      rzc = Math.sin(player.yaw);
    mvx = fx * fwd + rxc * str;
    mvz = fz * fwd + rzc * str;
    const l = Math.hypot(mvx, mvz) || 1;
    const sp =
      (D.keys.sprint ? 6.8 : 3.4) * (D.weapons.adsFactor() > 0.5 ? 0.55 : 1);
    mvx = (mvx / l) * sp;
    mvz = (mvz / l) * sp;
  }
  let nx = player.x + mvx * dt,
    nz = player.z + mvz * dt;
  if (insideBuilding(nx, nz) && !insideBuilding(player.x, player.z)) {
    nx = player.x;
    nz = player.z;
  }
  // cars are solid — push out radially
  for (let i = 0; i < D.vehicles.length; i++) {
    const v = D.vehicles[i];
    const d = Math.hypot(nx - v.x, nz - v.z);
    if (d < 1.9 && d > 0.01) {
      nx = v.x + ((nx - v.x) / d) * 1.9;
      nz = v.z + ((nz - v.z) / d) * 1.9;
    }
  }
  player.x = nx;
  player.z = nz;
  const gy = surfaceY(player.x, player.z);
  if (!dead && D.keys.jump && player.onGround) {
    player.vy = 6.2;
    player.onGround = false;
  }
  player.vy -= 21 * dt;
  player.y += player.vy * dt;
  if (player.y <= gy) {
    player.y = gy;
    player.vy = 0;
    player.onGround = true;
  }
  const spd = Math.hypot(mvx, mvz);
  if (player.onGround) D.bobT += dt * (D.keys.sprint ? 11 : 8) * Math.min(1, spd / 3);
  if (player.onGround && spd > 0.5) {
    D.stepAcc += spd * dt;
    if (D.stepAcc > (D.keys.sprint ? 2.7 : 2.1)) {
      D.stepAcc = 0;
      sfx(130 + Math.random() * 40, 45, 0, "triangle");
    }
  }
  return spd;
}

// ---- physics (meters) ------------------------------------------------------
function step(dt) {
  if (D.ses && D.ses.locked) {
    car.vx = car.vz = 0;
    return 0;
  }
  const maxFwd = 62, // ~223 km/h
    maxRev = 14, // ~50 km/h backwards
    brake = 60, // 100→0 in under half a second
    drag = 0.22; // gentle coast so lifting off doesn't feel like a parachute
  const hx = Math.sin(car.heading),
    hz = -Math.cos(car.heading);
  let fwd = car.vx * hx + car.vz * hz;
  // gearbox-style curve: hard launch off the line, tapering toward top speed
  const accel = 28 * (1 - (0.55 * Math.abs(fwd)) / maxFwd);
  if (D.keys.up) fwd += accel * dt;
  if (D.keys.down) fwd -= (fwd > 0.3 ? brake : 20) * dt; // 20 = snappy reverse
  if (!D.keys.up && !D.keys.down) fwd -= fwd * drag * dt;
  fwd = Math.max(-maxRev, Math.min(maxFwd, fwd));

  // full steering authority from ~9 m/s, but never mushy at parking speeds
  const speedK =
    Math.abs(fwd) < 0.4 ? 0 : Math.max(0.45, Math.min(1, Math.abs(fwd) / 9));
  const steer = (D.keys.left ? -1 : 0) + (D.keys.right ? 1 : 0);
  D.steerVis += (steer * 0.45 - D.steerVis) * dampingFactor(10, dt);
  const rate = 2.4 * steer * speedK * (D.keys.brake ? 1.55 : 1);
  car.heading += rate * (fwd >= 0 ? 1 : -1) * dt;

  // gravity along the slope: uphill bleeds speed, downhill adds it
  if (elevIsReady() && Math.abs(fwd) > 0.5) {
    const slope =
      (surfaceY(car.x + hx * 4, car.z + hz * 4) - surfaceY(car.x, car.z)) / 4;
    fwd -= 9.81 * Math.max(-0.45, Math.min(0.45, slope)) * dt * (fwd >= 0 ? 1 : -1);
  }

  const grip = D.keys.brake ? 1.8 : 7.5;
  const nhx = Math.sin(car.heading),
    nhz = -Math.cos(car.heading);
  const k = dampingFactor(grip, dt);
  car.vx += (nhx * fwd - car.vx) * k;
  car.vz += (nhz * fwd - car.vz) * k;
  const nx = car.x + car.vx * dt,
    nz = car.z + car.vz * dt;
  // ram a parked car: both take speed-scaled damage, we bounce off
  let hitV = null;
  for (let i = 0; i < D.vehicles.length; i++) {
    const v = D.vehicles[i];
    if (v === D.activeV) continue;
    if (Math.hypot(nx - v.x, nz - v.z) < 2.7) {
      hitV = v;
      break;
    }
  }
  if (hitV) {
    const sp = Math.hypot(car.vx, car.vz);
    if (sp > 5) {
      sfx(90, 160, 0, "square");
      if (D.weapons)
        D.weapons.sparks(
          new THREE.Vector3(
            (car.x + hitV.x) / 2,
            surfaceY(car.x, car.z) + 0.7,
            (car.z + hitV.z) / 2,
          ),
          8, 0xffd888, 6,
        );
      if (!hitV.wrecked) {
        hitV.hp -= sp * 1.4;
        if (hitV.hp <= 0) explodeVehicle(hitV);
      }
      if (!D.activeV.wrecked) {
        D.activeV.hp = D.activeV.hp ?? 100;
        D.activeV.hp -= sp * 0.5;
        if (D.activeV.hp <= 0) explodeVehicle(D.activeV);
      }
    }
    car.vx *= -0.3;
    car.vz *= -0.3;
  } else if (insideBuilding(nx, nz) && !insideBuilding(car.x, car.z)) {
    // block only the outside→inside transition so a bad spawn can't trap us
    car.vx *= -0.25;
    car.vz *= -0.25;
  } else {
    car.x = nx;
    car.z = nz;
  }
  const out = car.vx * nhx + car.vz * nhz;
  // sideways velocity — what the tyre FX, the body lean and the smoke read
  car.slip = car.vx * Math.cos(car.heading) + car.vz * Math.sin(car.heading);
  if (D.activeV) {
    D.activeV.braking = !!D.keys.down && out > 0.5;
    D.activeV.reversing = out < -0.4;
  }
  return out;
}

// HUD helpers and the goto/race/taxi mode logic live in drive_modes.js
// peer ghosts + relay wiring live in drive_mp.js
// ---- render ----------------------------------------------------------------
function draw(fwd, dt, tNow) {
  const speedKmh = Math.abs(fwd) * 3.6;
  if (!player.onFoot) {
    // ride the drive surface (asphalt when on a road, terrain otherwise):
    // height + pitch/roll from fore/aft and side samples of the SAME surface,
    // so on a road the car sits flat on the ribbon instead of tracking dirt
    // Smooth the ride height: roadYAt() takes the max over overlapping ribbon
    // segments, so on a curve (many self-overlapping segments at slightly
    // different heights) the "highest" one snaps as the car moves — a few cm of
    // jump per frame that jerked the camera. Ease toward the sampled surface to
    // filter those single-frame snaps while still tracking real slopes; snap
    // outright on big deltas (spawn / teleport) so we don't glide up from below.
    const rawGy = surfaceY(car.x, car.z);
    if (car.rideY == null || Math.abs(rawGy - car.rideY) > 2) car.rideY = rawGy;
    else car.rideY += (rawGy - car.rideY) * dampingFactor(10, dt);
    const gy = car.rideY;
    const fx = Math.sin(car.heading),
      fz = -Math.cos(car.heading),
      rx = Math.cos(car.heading),
      rz = Math.sin(car.heading);
    D.carGroup.position.set(car.x, gy + CAR_Y, car.z);
    D.carGroup.rotation.order = "YXZ";
    D.carGroup.rotation.y = -car.heading;
    if (elevIsReady()) {
      const pitch = Math.atan2(
        surfaceY(car.x + fx * 2.2, car.z + fz * 2.2) -
          surfaceY(car.x - fx * 2.2, car.z - fz * 2.2),
        4.4,
      );
      const roll = Math.atan2(
        surfaceY(car.x - rx * 0.95, car.z - rz * 0.95) -
          surfaceY(car.x + rx * 0.95, car.z + rz * 0.95),
        1.9,
      );
      car.pitchS += (pitch - car.pitchS) * dampingFactor(8, dt);
      car.rollS += (roll - car.rollS) * dampingFactor(8, dt);
    }
    // weight transfer: the nose dives under braking, squats under power, and
    // the body leans out of a slide — the cheapest cue that this is a car and
    // not a box sliding along the ground
    const acc = Math.max(-40, Math.min(40, (fwd - (car.lastFwd || 0)) / Math.max(dt, 0.001)));
    car.lastFwd = fwd;
    car.dive += (-acc * 0.0022 - car.dive) * Math.min(1, 7 * dt);
    car.dive = Math.max(-0.06, Math.min(0.06, car.dive));
    const leanT = Math.max(-0.055, Math.min(0.055, (car.slip || 0) * 0.007));
    car.lean += (leanT - car.lean) * Math.min(1, 6 * dt);
    D.carGroup.rotation.x = car.pitchS + car.dive;
    D.carGroup.rotation.z = car.rollS + car.lean;
    const wr = D.carGroup.userData.type.wr;
    D.wheels.forEach((w) => {
      if (w.front) w.pivot.rotation.y = -D.steerVis;
      w.mesh.rotation.x += (fwd * dt) / wr;
    });
    if (D.activeV) {
      tyreFx(D.activeV, car.slip || 0, fwd, tNow / 1000, tNow);
      syncVehicleLights(D.activeV);
    }

    // chase distance, pulled in when the spot behind us is inside a building —
    // narrow streets used to swallow the camera and fill the screen with wall
    let back = 11 + speedKmh * 0.045;
    for (let k = 0; k < 5 && back > 4; k++) {
      if (!insideBuilding(car.x - Math.sin(car.heading) * back, car.z + Math.cos(car.heading) * back))
        break;
      back *= 0.7;
    }
    const up = gy + 4.6 + speedKmh * 0.012;
    const tx = car.x - Math.sin(car.heading) * back,
      tz = car.z + Math.cos(car.heading) * back;
    if (!D.camPos) D.camPos = new THREE.Vector3(tx, up, tz);
    D.camPos.x += (tx - D.camPos.x) * Math.min(1, 5 * dt);
    D.camPos.y += (up - D.camPos.y) * Math.min(1, 5 * dt);
    D.camPos.z += (tz - D.camPos.z) * Math.min(1, 5 * dt);
    D.camera.position.copy(D.camPos);
    // high-speed rattle, and a kick when the back end steps out
    const shake =
      Math.max(0, speedKmh - 120) * 0.00035 + Math.min(0.05, Math.abs(car.slip || 0) * 0.006);
    if (shake > 0.0005) {
      D.camera.position.x += (Math.random() - 0.5) * shake;
      D.camera.position.y += (Math.random() - 0.5) * shake;
      D.camera.position.z += (Math.random() - 0.5) * shake;
    }
    D.camera.lookAt(car.x, gy + 1.6, car.z);
    D.camera.fov = 62 + Math.min(14, speedKmh * 0.09);
    D.camera.updateProjectionMatrix();
  } else {
    // first-person walker: eye at 1.62 m + head bob, mouse-look, ADS zoom
    const bobA =
      Math.min(1, Math.abs(fwd) / 3) * (player.onGround ? 1 : 0) *
      (1 - D.weapons.adsFactor());
    D.camera.position.set(
      player.x,
      player.y + 1.62 + Math.sin(D.bobT) * 0.045 * bobA,
      player.z,
    );
    D.camera.rotation.order = "YXZ";
    D.camera.rotation.set(player.pitch, -player.yaw, 0);
    const targetFov = 74 - D.weapons.adsFactor() * 22;
    D.camera.fov += (targetFov - D.camera.fov) * Math.min(1, 12 * dt);
    D.camera.updateProjectionMatrix();
    // F-prompt when a drivable car is in reach
    const fp = D.overlay.querySelector("#footPrompt");
    const nv = nearestVehicle(3.4);
    if (nv && !D.weapons.isDead()) {
      fp.style.display = "flex";
      fp.querySelector("span").textContent = t("ft_enter");
    } else fp.style.display = "none";
  }

  // per-mode target (drives HUD distance + edge arrow + beacon pulse)
  let target = null;
  if (D.ses.mode === "goto") target = D.ses.dest;
  else if (D.ses.mode === "race" && !D.ses.finished) target = raceTarget();
  else if (D.ses.mode === "taxi" && D.ses.fare)
    target =
      D.ses.fare.state === "pickup"
        ? { x: D.ses.fare.x, z: D.ses.fare.z }
        : { x: D.ses.fare.dx, z: D.ses.fare.dz };

  D.ses.beacons.forEach((b) => {
    const pulse = 1 + 0.18 * Math.sin(tNow / 260);
    b.scale.set(pulse, 1, pulse);
    b.rotation.y += dt * 0.8;
    b.position.y = surfaceY(b.position.x, b.position.z); // sit on road/terrain
  });
  if (D.ses.pax && D.ses.pax.visible)
    D.ses.pax.position.y = surfaceY(D.ses.pax.position.x, D.ses.pax.position.z);

  // atmosphere: the sky rides with the camera, the sun rides with the player
  // (keeping the shadow frustum tight), the clouds and tyre marks age
  D.skyT += dt;
  D.skyUni.uTime.value = D.skyT;
  D.skidUni.uTime.value = tNow / 1000;
  D.sky.position.copy(D.camera.position);
  sunFollow();
  // no-ops until the GPU backend has finished its async init
  gpuRender(D.renderer, D.scene, D.camera);

  // distances/arrow follow whoever you are right now: the car or your feet
  const ax = player.onFoot ? player.x : car.x,
    az = player.onFoot ? player.z : car.z,
    ah = player.onFoot ? player.yaw : car.heading;
  const distM = target ? Math.hypot(target.x - ax, target.z - az) : 0;
  if (!player.onFoot) hudUpdate(speedKmh, fwd, target ? distM : -1);

  const ar = D.overlay.querySelector("#driveArrow");
  if (target && distM > 60) {
    const ang = Math.atan2(target.x - ax, -(target.z - az)) - ah;
    ar.style.display = "block";
    ar.style.transform = "translate(-50%,-50%) rotate(" + (ang * 180) / Math.PI + "deg)";
  } else ar.style.display = "none";

  // mode ticks
  if (D.ses.mode === "goto") {
    if (!D.ses.arrived && distM < 28) {
      D.ses.arrived = true;
      D.overlay.querySelector("#driveArrive").style.display = "flex";
    } else if (D.ses.arrived && distM >= 40) {
      D.ses.arrived = false;
      D.overlay.querySelector("#driveArrive").style.display = "none";
    }
  } else if (D.ses.mode === "race") raceTick(tNow, distM);
  else if (D.ses.mode === "taxi") taxiTick(tNow);
  if (D.ses.mp) mpTick(tNow);
}

function loop(tNow) {
  if (!D.running) return;
  D.raf = requestAnimationFrame(loop);
  const dt = safeDeltaSeconds(D.lastT ? tNow - D.lastT : 16, 0.016);
  D.lastT = tNow;
  // promote to elevation-ready once the anchor's terrain tile decodes (or
  // give up after 5 s and run flat); flat-built ground tiles rebuild displaced
  if (!elevIsReady()) {
    const e = elevAtLL(D.anchor.lat, D.anchor.lon);
    if (e != null) elevPromote(e);
    else if (elevSessionAge(tNow) > 5000) elevPromote(null);
    if (elevIsReady() && groundTiles.size) {
      groundTiles.forEach((m) => {
        D.scene.remove(m);
        m.geometry.dispose();
        if (m.material.map) m.material.map.dispose();
        m.material.dispose();
      });
      groundTiles.clear();
    }
  }
  let fwd = 0;
  forEachPhysicsStep(dt, (stepDt) => {
    fwd = player.onFoot ? stepFoot(stepDt) : step(stepDt);
  });
  engineUpdate(
    player.onFoot ? -1 : Math.abs(fwd) * 3.6,
    player.onFoot ? 0 : D.keys.up ? 1 : D.keys.down ? 0.5 : 0,
    dt,
  );
  syncTiles();
  syncBuildings();
  svTick(tNow); // trickle real Street View facades onto nearby buildings
  vehiclesTick(tNow); // smoke, fire, delayed chain explosions
  D.weapons.tick(dt, tNow, player.onFoot ? Math.abs(fwd) : 0, player.onGround);
  draw(fwd, dt, tNow);
}

function sizeCanvas() {
  if (!D.canvas || !D.renderer) return;
  const w = D.overlay.clientWidth,
    h = D.overlay.clientHeight;
  D.renderer.setSize(w, h, false);
  D.camera.aspect = w / h;
  D.camera.updateProjectionMatrix();
}

// ---- session lifecycle -----------------------------------------------------
function beginSession(cfg) {
  if (D.running) return false;
  if (!D.overlay) buildOverlay();
  setSessionAnchor(cfg.anchor);
  if (!D.scene) buildScene();
  // reset per-session world (new anchor = new local frame)
  groundTiles.forEach((m) => {
    D.scene.remove(m);
    m.geometry.dispose();
    if (m.material.map) m.material.map.dispose();
    m.material.dispose();
  });
  groundTiles.clear();
  D.bldGroup.clear();
  D.roadGroup.clear();
  resetSessionState(); // one place clears the shared containers + car/player
  // terrain: new anchor = new reference elevation; prefetch its tile now
  elevReset(performance.now());
  {
    const n = Math.pow(2, ELEV_Z);
    const s = Math.sin((D.anchor.lat * Math.PI) / 180);
    loadElevTile(
      Math.floor(((D.anchor.lon + 180) / 360) * n),
      Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n),
    );
  }
  setRouteRibbon(null);
  skidClear();

  // vehicles + weapons: fresh per session (car/player were reset above)
  D.vehicles.forEach(disposeVehicleMesh);
  D.vehicles = [];
  D.camera.near = 0.5;
  D.camera.updateProjectionMatrix();
  if (!D.weapons)
    D.weapons = createWeapons({
      scene: D.scene,
      camera: D.camera,
      overlay: D.overlay,
      targets: weaponTargets,
      onHit: weaponHit,
      onShot: weaponShot,
      onDeath: respawnPlayer,
      kick: (dp, dy) => {
        player.pitch = Math.min(1.45, player.pitch + dp);
        player.yaw += dy;
      },
    });
  D.weapons.reset();
  D.weapons.setActive(false);
  D.weapons.setSession(true);
  D.activeV = spawnVehicle(0xc8372d, cfg.spawn.x, cfg.spawn.z, cfg.heading || 0, 5);
  D.carGroup = D.activeV.mesh;
  D.wheels = D.carGroup.userData.wheels;
  syncVehicleLights(D.activeV);
  D.overlay.querySelector("#driveHud").style.display = "";
  D.hudEls.fx.style.opacity = 0;
  D.overlay.querySelector("#footPrompt").style.display = "none";
  setHint("dr_hint");

  D.ses = cfg.ses;
  D.ses.beacons = [];
  D.ses.ghosts = {};
  car.x = cfg.spawn.x;
  car.z = cfg.spawn.z;
  car.vx = car.vz = 0;
  car.heading = cfg.heading || 0;
  D.keys = {};
  D.lastT = 0;

  D.overlay.querySelector("#driveDest").textContent = cfg.title || "";
  D.overlay.querySelector("#driveArrive").style.display = "none";
  D.overlay.querySelector("#driveResults").style.display = "none";
  D.overlay.querySelector("#driveTimer").textContent = "";
  hudMsgOff();
  D.overlay.style.display = "block";
  sizeCanvas();
  D.running = true;
  audioStart();
  if (D.ses.mp) mpHook();
  syncTiles();
  syncBuildings();
  D.raf = requestAnimationFrame(loop);
  return true;
}

export function isDriving() {
  return D.running;
}
// introspection for tests/console: world streaming counters
export function debugStats() {
  return {
    running: D.running,
    tiles: groundTiles.size,
    buildings: D.bldGroup ? D.bldGroup.children.length : 0,
    roads: D.roadGroup ? D.roadGroup.children.length : 0,
    chunks: bldChunks.size,
    roadIds: roadById.size,
    elevReady: elevIsReady(),
    elev0: Math.round(elevRef()),
    carY: Math.round(sampleElevM(car.x, car.z) * 10) / 10,
    vehicles: D.vehicles.length,
    wrecked: D.vehicles.reduce((n, v) => n + (v.wrecked ? 1 : 0), 0),
    onFoot: player.onFoot,
    yaw: Math.round(player.yaw * 100) / 100,
    pitch: Math.round(player.pitch * 100) / 100,
    hp: D.weapons ? Math.round(D.weapons.getHp()) : null,
    carHp: D.activeV ? Math.round(D.activeV.hp) : null,
  };
}
// introspection for tests/console: lighting + car material state
export function debugGfx() {
  const out = {
    tod: TOD[D.todIdx].key,
    env: !!D.envRT,
    exposure: D.renderer ? D.renderer.toneMappingExposure : null,
    sun: D.sun ? { i: D.sun.intensity, p: D.sun.position.toArray().map(Math.round) } : null,
    skid: D.skidHead,
    mats: [],
  };
  if (D.activeV)
    D.activeV.mesh.traverse((m) => {
      if (!m.isMesh) return;
      out.mats.push(
        m.material.type +
          " " + (m.material.color ? m.material.color.getHexString() : "-") +
          (m.material.envMap ? " env" : "") +
          (m.visible ? "" : " hidden"),
      );
    });
  return out;
}
// test hook (console/tests): blow up the nearest other vehicle
export function debugBoom() {
  let best = null,
    bd = 1e9;
  const fp = focusPos();
  D.vehicles.forEach((v) => {
    if (v === D.activeV || v.wrecked) return;
    const d = Math.hypot(v.x - fp.x, v.z - fp.z);
    if (d < bd) {
      bd = d;
      best = v;
    }
  });
  if (best) explodeVehicle(best);
  return bd;
}
export function stopDrive() {
  if (!D.running) return;
  D.running = false;
  cancelAnimationFrame(D.raf);
  audioStop();
  if (document.pointerLockElement) document.exitPointerLock();
  if (D.weapons) {
    D.weapons.setActive(false);
    D.weapons.setSession(false);
  }
  player.onFoot = false;
  if (D.overlay) D.overlay.classList.remove("onfoot");
  if (D.hudEls) D.hudEls.fx.style.opacity = 0;
  skidClear();
  D.vehicles.forEach(disposeVehicleMesh);
  D.vehicles = [];
  D.activeV = null;
  if (D.unsubNet) {
    D.unsubNet();
    D.unsubNet = null;
  }
  if (D.ses) {
    D.ses.beacons.forEach((b) => D.scene.remove(b));
    Object.values(D.ses.ghosts || {}).forEach((g) => D.scene.remove(g.root));
    if (D.ses.pax) D.scene.remove(D.ses.pax);
    if (D.ses.pickupRing) D.scene.remove(D.ses.pickupRing);
    D.ses = null;
  }
  if (D.overlay) D.overlay.style.display = "none";
}

// ---- public: goto (drive to a friend) --------------------------------------
export function startDrive(friend, onArrive) {
  if (D.running || !friend || friend.lat == null) return false;
  const to = { lat: friend.lat, lon: friend.lon };
  const from =
    S.site && S.site.lat != null
      ? { lat: S.site.lat, lon: S.site.lon }
      : { lat: to.lat - 0.006, lon: to.lon - 0.007 };
  setSessionAnchor(from); // set before llToM below
  const destM = (() => {
    const mLat = 111320,
      mLon = 111320 * Math.cos((from.lat * Math.PI) / 180);
    return { x: (to.lon - from.lon) * mLon, z: -(to.lat - from.lat) * mLat };
  })();
  const ok = beginSession({
    anchor: from,
    spawn: { x: 0, z: 0 },
    heading: Math.atan2(destM.x, -destM.z),
    title: t("dr_to", { name: friend.name }) + (friend.address ? " · " + friend.address : ""),
    ses: { mode: "goto", friend, onArrive, dest: destM, arrived: false },
  });
  if (!ok) return false;
  const beacon = buildBeacon(0xffc828, 12);
  beacon.position.set(destM.x, 0, destM.z);
  D.scene.add(beacon);
  D.ses.beacons.push(beacon);
  fetchRoute([from, to]).then((r) => {
    if (!D.running || !r) return;
    setRouteRibbon(r);
    if (Math.hypot(car.x, car.z) < 6 && Math.hypot(car.vx, car.vz) < 1) {
      car.x = r[0].x;
      car.z = r[0].z;
      const n = r[Math.min(4, r.length - 1)];
      car.heading = Math.atan2(n.x - car.x, -(n.z - car.z));
      D.camPos = null;
    }
  });
  return true;
}

// ---- public: race ----------------------------------------------------------
// def = {id, name?, points:[{lat,lon,label}...]}   (2+ points; [0] = start)
// mp  = null | {players:[codes incl. me], myIndex}
export function startRace(def, mp) {
  if (D.running || !def || def.points.length < 2) return false;
  const start = def.points[0];
  setSessionAnchor(start);
  const p1 = llToM(def.points[1].lat, def.points[1].lon);
  // side-by-side grid: each racer offset perpendicular to the start heading
  const heading = Math.atan2(p1.x, -p1.z);
  const off = mp ? (mp.myIndex - (mp.players.length - 1) / 2) * 3.4 : 0;
  const ok = beginSession({
    anchor: start,
    spawn: {
      x: Math.cos(heading) * off,
      z: Math.sin(heading) * off,
    },
    heading,
    title: "🏁 " + (def.name || t("mr_race")) + (mp ? " · " + mp.players.length + "P" : ""),
    ses: {
      mode: "race",
      def,
      mp,
      cps: [],
      cpIndex: 0,
      splits: [],
      board: {},
      finished: false,
      locked: true,
      countdownEnd: performance.now() + Math.max(800, mp && mp.startAt ? mp.startAt - Date.now() : 3600),
      cdShown: null,
    },
  });
  if (!ok) return false;
  // checkpoints skip the start point — it's where everyone already stands
  D.ses.cps = def.points.slice(1).map((p) => {
    const m = llToM(p.lat, p.lon);
    const b = buildBeacon(0x9aa0a6, 10);
    b.position.set(m.x, 0, m.z);
    D.scene.add(b);
    D.ses.beacons.push(b);
    return { x: m.x, z: m.z, mesh: b };
  });
  raceSyncBeacons();
  const gridOff = off,
    spawn0 = { x: car.x, z: car.z };
  fetchRoute(def.points).then((r) => {
    if (!D.running || !r) return;
    setRouteRibbon(r);
    // OSRM snapped the course to real roads — if the player hasn't driven off
    // yet, put the start grid ON the road (route arrives after the countdown
    // more often than not, so gate on movement, not on the clock; the same
    // r[0] on every client keeps multiplayer grids aligned)
    const moved = Math.hypot(car.x - spawn0.x, car.z - spawn0.z) > 6;
    if (!moved && Math.hypot(car.vx, car.vz) < 3 && D.ses && D.ses.mode === "race") {
      const n = r[Math.min(4, r.length - 1)];
      const h = Math.atan2(n.x - r[0].x, -(n.z - r[0].z));
      car.x = r[0].x + Math.cos(h) * gridOff;
      car.z = r[0].z + Math.sin(h) * gridOff;
      car.heading = h;
      D.camPos = null;
    }
  });
  return true;
}

// ---- public: taxi ----------------------------------------------------------
// def = {id, points:[{lat,lon}] (play-area center), durS}
export function startTaxi(def, mp) {
  if (D.running || !def || !def.points.length) return false;
  const center = def.points[0];
  const ok = beginSession({
    anchor: center,
    spawn: { x: 0, z: 0 },
    heading: 0,
    title: "🚕 " + t("tx_title"),
    ses: {
      mode: "taxi",
      def,
      mp,
      cash: 0,
      fares: 0,
      fare: null,
      board: {},
      finished: false,
      locked: true,
      countdownEnd: performance.now() + Math.max(800, mp && mp.startAt ? mp.startAt - Date.now() : 3600),
      cdShown: null,
    },
  });
  if (!ok) return false;
  D.ses.pax = buildPassenger();
  D.ses.pax.visible = false;
  D.scene.add(D.ses.pax);
  D.ses.pickupRing = buildBeacon(0xffc828, 12);
  D.ses.pickupRing.visible = false;
  D.scene.add(D.ses.pickupRing);
  D.ses.beacons.push(D.ses.pickupRing);
  D.ses.dropBeacon = buildBeacon(0x34c759, 14);
  D.ses.dropBeacon.visible = false;
  D.scene.add(D.ses.dropBeacon);
  D.ses.beacons.push(D.ses.dropBeacon);
  return true;
}

function buildOverlay() {
  D.overlay = document.createElement("div");
  D.overlay.id = "drive-overlay";
  D.overlay.innerHTML =
    '<canvas id="driveCanvas"></canvas>' +
    '<div id="driveTop"><span id="driveDest"></span>' +
    '<span id="driveTimer"></span>' +
    '<button id="driveExit"><i class="ph ph-x"></i> ' + t("dr_exit") + "</button></div>" +
    '<div id="driveSpeedFx"></div>' +
    '<div id="driveHud">' +
    '<div class="dr-gauge"><svg viewBox="0 0 100 64">' +
    '<path class="dr-arc-bg" d="M6 58 A44 44 0 0 1 94 58"/>' +
    '<path class="dr-arc" d="M6 58 A44 44 0 0 1 94 58"/></svg>' +
    '<div class="dr-read"><b>0</b><i>km/h</i></div></div>' +
    '<div class="dr-col"><div class="dr-gear">N</div>' +
    '<div class="dr-rev"><span></span></div>' +
    '<span class="dr-dist"></span></div></div>' +
    '<div id="driveArrow">▲</div>' +
    '<div id="driveMsg"></div>' +
    '<div id="driveArrive"><button id="driveEnterBtn"><i class="ph ph-door-open"></i> ' +
    t("dr_enter") + " <kbd>Enter</kbd></button></div>" +
    '<div id="driveResults"><div class="dr-res-card"><h2></h2>' +
    '<span class="dr-res-sub"></span><div class="dr-res-rows"></div>' +
    '<button id="driveResExit">' + t("dr_exit") + "</button></div></div>" +
    '<div id="footPrompt"><kbd>F</kbd><span></span></div>' +
    '<div id="footLock">' + t("ft_click") + "</div>" +
    '<div id="driveHint">' + t("dr_hint") + "</div>";
  document.body.appendChild(D.overlay);
  D.canvas = D.overlay.querySelector("#driveCanvas");
  D.hudEls = {
    arc: D.overlay.querySelector(".dr-arc"),
    num: D.overlay.querySelector(".dr-read b"),
    gear: D.overlay.querySelector(".dr-gear"),
    rev: D.overlay.querySelector(".dr-rev span"),
    dist: D.overlay.querySelector(".dr-dist"),
    fx: D.overlay.querySelector("#driveSpeedFx"),
  };
  D.hudEls.arc.style.strokeDasharray = HUD_ARC;
  D.hudEls.arc.style.strokeDashoffset = HUD_ARC;
  D.overlay.querySelector("#driveExit").addEventListener("click", stopDrive);
  D.overlay.querySelector("#driveResExit").addEventListener("click", stopDrive);
  D.overlay.querySelector("#driveEnterBtn").addEventListener("click", () => {
    if (D.ses && D.ses.mode === "goto") finishGoto();
  });
  window.addEventListener("resize", sizeCanvas);
  window.addEventListener("keydown", keyDown, true);
  window.addEventListener("keyup", keyUp, true);
  // ---- on-foot mouse: pointer-lock look + fire/ADS/weapon wheel ----
  D.canvas.addEventListener("mousedown", (e) => {
    if (!D.running || !player.onFoot) return;
    // fire even when the lock is denied (arrow keys still turn you);
    // the lock attempt itself is just the mouselook upgrade
    if (!document.pointerLockElement) requestLock();
    D.weapons.mouse(e.button, true, performance.now());
    e.preventDefault();
  });
  window.addEventListener("mouseup", (e) => {
    if (D.running && D.weapons) D.weapons.mouse(e.button, false, performance.now());
  });
  D.overlay.addEventListener("contextmenu", (e) => {
    if (D.running && player.onFoot) e.preventDefault();
  });
  D.overlay.addEventListener(
    "wheel",
    (e) => {
      if (D.running && player.onFoot) {
        D.weapons.wheel(e.deltaY, performance.now());
        e.preventDefault();
      }
    },
    { passive: false },
  );
  document.addEventListener("mousemove", (e) => {
    if (!D.running || !player.onFoot) return;
    let dx = e.movementX || 0,
      dy = e.movementY || 0;
    // no pointer lock? look anyway off the same deltas (clamped — the OS
    // cursor still exists and can jump); clicking upgrades to a real lock
    if (document.pointerLockElement !== D.canvas) {
      dx = Math.max(-60, Math.min(60, dx));
      dy = Math.max(-60, Math.min(60, dy));
    }
    player.yaw += dx * 0.0021;
    player.pitch = Math.max(
      -1.45,
      Math.min(1.45, player.pitch - dy * 0.0021),
    );
  });
  const syncLockHint = () => {
    D.overlay.querySelector("#footLock").style.display =
      D.running && player.onFoot && document.pointerLockElement !== D.canvas
        ? "flex"
        : "none";
  };
  document.addEventListener("pointerlockchange", syncLockHint);
  document.addEventListener("pointerlockerror", syncLockHint);
}

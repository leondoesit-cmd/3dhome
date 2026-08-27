// Drive-mode camera: the four rigs the C key cycles, plus the little director
// that runs the cinematic one.
//
// drive.js used to place the chase camera inline in draw(); it now hands the
// frame to applyCarCamera() and this module owns every rig. Nothing imports
// back into drive.js, so there is no cycle — the world queries it needs
// (is that spot inside a building, how high is the ground) come from
// drive_world.js, which knows nothing about cameras.
import * as THREE from "three";
import { D, car } from "./drive_state.js";
import { insideBuilding } from "./drive_world.js";

// chase = the classic third-person rig, hood/bumper = in-car, cinema = the
// auto-directed one that cuts between shots on its own
export const CAM_MODES = ["chase", "hood", "bumper", "cinema"];
export function camModeKey() {
  return "dr_cam_" + CAM_MODES[D.camMode || 0];
}
export function camMode() {
  return CAM_MODES[D.camMode || 0];
}
export function cycleCamera() {
  D.camMode = ((D.camMode || 0) + 1) % CAM_MODES.length;
  D.camPos = null; // cut, don't glide, between rigs
  D.cine = null;
  return camModeKey();
}
// The director also runs on demand from the modes: a sweep over the grid while
// the lights go out, and a slow orbit over the results card.
export function cinemaFor(ms, kind) {
  D.cineUntil = performance.now() + ms;
  D.cine = null;
  D.cineKind = kind || null;
  D.camPos = null;
}
export function cinemaOff() {
  D.cineUntil = 0;
  D.cineKind = null;
  D.cine = null;
  D.camPos = null;
}
export function cinemaActive(tNow) {
  return camMode() === "cinema" || (D.cineUntil || 0) > tNow;
}

// ---- shots -----------------------------------------------------------------
const SHOTS = ["orbit", "crane", "dolly", "flyby", "hero"];
function heading() {
  return {
    ax: Math.sin(car.heading), az: -Math.cos(car.heading), // ahead
    rx: Math.cos(car.heading), rz: Math.sin(car.heading), // right
  };
}
function newShot(tNow, forced) {
  const kind = forced || SHOTS[Math.floor(Math.random() * SHOTS.length)];
  const h = heading();
  const s = { kind, t0: tNow, until: tNow + 4200 + Math.random() * 2800, fov: 52 };
  const flip = Math.random() < 0.5 ? -1 : 1;
  if (kind === "orbit") {
    s.a = Math.random() * Math.PI * 2;
    s.r = 9 + Math.random() * 7;
    s.h = 2.2 + Math.random() * 3.2;
    s.w = flip * (0.2 + Math.random() * 0.22); // rad/s
    s.fov = 58;
  } else if (kind === "crane") {
    // straight down out of the sky onto the car's tail
    s.back = 15 + Math.random() * 10;
    s.side = flip * Math.random() * 8;
    s.h0 = 22 + Math.random() * 12;
    s.h1 = 4 + Math.random() * 2.5;
    s.fov = 46;
    s.until = tNow + 5200;
  } else if (kind === "dolly") {
    // camera-car running alongside
    s.side = flip * (9 + Math.random() * 6);
    s.back = -3 + Math.random() * 9;
    s.h = 1.6 + Math.random() * 1.8;
    s.fov = 42;
  } else if (kind === "flyby") {
    // a fixed spot down the road: the car drives past the lens
    const d = 36 + Math.random() * 30;
    s.px = car.x + h.ax * d + h.rx * flip * (5 + Math.random() * 9);
    s.pz = car.z + h.az * d + h.rz * flip * (5 + Math.random() * 9);
    s.h = 1.1 + Math.random() * 3.4;
    s.fov = 36;
  } else {
    // hero: low and ahead, looking back at the car as it comes on
    s.d = 20 + Math.random() * 12;
    s.side = flip * (1 + Math.random() * 3);
    s.h = 0.9 + Math.random() * 1.3;
    s.fov = 40;
  }
  return s;
}
// A shot ends on its own clock, or early once its framing falls apart: the car
// too far away, or a wall between it and the lens.
function shotSpot(s, tNow) {
  const h = heading();
  const age = (tNow - s.t0) / 1000;
  if (s.kind === "orbit") {
    const a = s.a + s.w * age;
    return { x: car.x + Math.sin(a) * s.r, y: s.h, z: car.z + Math.cos(a) * s.r };
  }
  if (s.kind === "crane") {
    const k = Math.min(1, age / 5); // ease the descent, don't drop like a rock
    const e = k * k * (3 - 2 * k);
    return {
      x: car.x - h.ax * s.back + h.rx * s.side,
      y: s.h0 + (s.h1 - s.h0) * e,
      z: car.z - h.az * s.back + h.rz * s.side,
    };
  }
  if (s.kind === "dolly")
    return {
      x: car.x + h.rx * s.side + h.ax * s.back,
      y: s.h,
      z: car.z + h.rz * s.side + h.az * s.back,
    };
  if (s.kind === "flyby") return { x: s.px, y: s.h, z: s.pz };
  return { x: car.x + h.ax * s.d + h.rx * s.side, y: s.h, z: car.z + h.az * s.d + h.rz * s.side };
}
function shotStale(s, spot, tNow) {
  if (tNow > s.until) return true;
  const d = Math.hypot(spot.x - car.x, spot.z - car.z);
  if (d > 130) return true; // the car drove out of the frame
  // a fixed lens is only interesting until the car is past and shrinking
  if ((s.kind === "flyby" || s.kind === "hero") && d > 60 && tNow - s.t0 > 1800) return true;
  return false;
}
function cinemaCamera(dt, tNow, gy, speedKmh) {
  const forced = D.cineKind && (D.cineUntil || 0) > tNow ? D.cineKind : null;
  let s = D.cine;
  let spot = s && shotSpot(s, tNow);
  if (!s || shotStale(s, spot, tNow)) {
    for (let k = 0; k < 6; k++) {
      s = newShot(tNow, forced);
      spot = shotSpot(s, tNow);
      if (!insideBuilding(spot.x, spot.z)) break; // don't set up inside a wall
    }
    D.cine = s;
    D.camPos = null; // a cut is a cut: snap, never glide, between shots
  }
  const y = gy + spot.y;
  if (!D.camPos) D.camPos = new THREE.Vector3(spot.x, y, spot.z);
  else {
    // the tracking rigs breathe toward their mark; a locked-off lens does not
    const k = s.kind === "flyby" ? 0 : Math.min(1, 3.2 * dt);
    D.camPos.x += (spot.x - D.camPos.x) * k;
    D.camPos.y += (y - D.camPos.y) * k;
    D.camPos.z += (spot.z - D.camPos.z) * k;
  }
  D.camera.position.copy(D.camPos);
  D.camera.lookAt(car.x, gy + 1.05, car.z);
  const fov = s.fov + Math.min(8, speedKmh * 0.03);
  D.camera.fov += (fov - D.camera.fov) * Math.min(1, 2.5 * dt);
  D.camera.updateProjectionMatrix();
}

// ---- in-car rigs -----------------------------------------------------------
function inCarCamera(dt, tNow, gy, speedKmh, bumper) {
  const h = heading();
  const fwd = bumper ? 2.5 : 1.0;
  const up = (bumper ? 0.5 : 1.16) + gy;
  D.camera.position.set(car.x + h.ax * fwd, up, car.z + h.az * fwd);
  D.camera.rotation.order = "YXZ";
  // the body's own weight transfer is the whole point of sitting this low
  D.camera.rotation.set(
    car.pitchS * 0.6 + car.dive * 1.4,
    -car.heading + (car.lean || 0) * 0.5,
    -(car.rollS * 0.5 + (car.lean || 0) * 0.8),
  );
  const shake = Math.max(0, speedKmh - 90) * 0.00042 + Math.min(0.05, Math.abs(car.slip || 0) * 0.005);
  if (shake > 0.0005) {
    D.camera.position.x += (Math.random() - 0.5) * shake;
    D.camera.position.y += (Math.random() - 0.5) * shake;
    D.camera.position.z += (Math.random() - 0.5) * shake;
  }
  const fov = (bumper ? 78 : 70) + Math.min(16, speedKmh * 0.1);
  D.camera.fov += (fov - D.camera.fov) * Math.min(1, 8 * dt);
  D.camera.updateProjectionMatrix();
  D.camPos = null; // so a switch back to chase snaps rather than sails in
}

// ---- chase (the default rig, moved here verbatim) --------------------------
function chaseCamera(dt, tNow, gy, speedKmh) {
  let back = 11 + speedKmh * 0.045;
  for (let k = 0; k < 5 && back > 4; k++) {
    if (!insideBuilding(car.x - Math.sin(car.heading) * back, car.z + Math.cos(car.heading) * back))
      break;
    back *= 0.7; // narrow streets used to swallow the camera
  }
  const up = gy + 4.6 + speedKmh * 0.012;
  const tx = car.x - Math.sin(car.heading) * back,
    tz = car.z + Math.cos(car.heading) * back;
  if (!D.camPos) D.camPos = new THREE.Vector3(tx, up, tz);
  D.camPos.x += (tx - D.camPos.x) * Math.min(1, 5 * dt);
  D.camPos.y += (up - D.camPos.y) * Math.min(1, 5 * dt);
  D.camPos.z += (tz - D.camPos.z) * Math.min(1, 5 * dt);
  D.camera.position.copy(D.camPos);
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
}

export function applyCarCamera(dt, tNow, gy, speedKmh) {
  const cine = cinemaActive(tNow);
  // letterbox + grade only while a cinematic lens is up
  if (D.overlay) D.overlay.classList.toggle("dr-cine", cine);
  if (cine) return cinemaCamera(dt, tNow, gy, speedKmh);
  const m = camMode();
  if (m === "hood" || m === "bumper") return inCarCamera(dt, tNow, gy, speedKmh, m === "bumper");
  return chaseCamera(dt, tNow, gy, speedKmh);
}
// introspection for tests/console
export function debugCam() {
  return {
    mode: camMode(),
    cine: D.cine ? D.cine.kind : null,
    forced: D.cineKind || null,
    fov: D.camera ? Math.round(D.camera.fov) : null,
  };
}

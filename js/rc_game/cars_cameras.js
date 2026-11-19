/* RC game car-vs-car contact, car mesh sync, AI input, kart HUD and the
   chase/inside/car cameras, split out of js/rc_game.js. It shares the editor's
   state through live imports from ../rc_game.js. */
import * as THREE from "three";
import { detectRooms } from "../geometry.js";
import { t } from "../i18n.js";
import { kartIsOn, kartSlot, kartTick } from "../kart.js";
import { forEachPhysicsStep, safeDeltaSeconds } from "../physics_runtime.js";
import { courseAhead } from "../rc_driving.js";
import { editorActive, editorTick } from "../rc_editor.js";
import { fmtT, ordinal, showMsg, updateGaps, updateLapHud, updatePlaces, updateStartLights, updateStuckHint, updateWrongWay } from "../rc_game/hud.js";
import { playerCar } from "../rc_game/pause_camera.js";
import { driveAudio, readPlayerInput, rescueCar } from "../rc_game/phases_input.js";
import { allDone, carPhysics, finishRace, updateRings } from "../rc_game/race.js";
import { ghostRecord, ghostStartLap, ghostTick } from "../rc_ghost.js";
import { miniSync, miniTick } from "../rc_minimap.js";
import { mpTick } from "../rc_mp.js";
import { CAR_CLEAR, COLL_R, DRIFT_MIN_V, FIG_STEP, FOOT_CLEAR, FOOT_R, FOOT_RUN, FOOT_SPD, GRAV, HOP_MS, MAXV, R, ROCKET_MS, ROCKET_WIN, STALL_MS, STEP_H } from "../rc_state.js";
import { applyDamage, beep, blockedAt, buildColModel, buildTrack, collideCircle, engineOff, engineTick, groundAt, moveCircle, openAllDoors, spraySpawn, stepShards, stepSpray, sting, waterAt } from "../rc_world.js";
import { surfaceHeightNear } from "../road_surface.js";
import { clamp } from "../state.js";
import { getMainCamera } from "../view3d.js";
import {
  FINISH_GRACE_MS, UP_FLAT, carBasis, carForward, carRight, carUp, lastTrack,
  moveScratch, set_lastTrack,
} from "../rc_game.js";

// bumper cars: circle-vs-circle between trucks, with ram damage on hard hits
function carVsCar(now) {
  for (var i = 0; i < R.cars.length; i++) {
    var a = R.cars[i];
    if (a.dead) continue;
    for (var j = i + 1; j < R.cars.length; j++) {
      var b = R.cars[j];
      if (b.dead) continue;
      if (Math.abs(a.y - b.y) > CAR_CLEAR) continue; // one is on the table
      var dx = b.x - a.x,
        dz = b.z - a.z,
        d = Math.hypot(dx, dz),
        min = COLL_R * 2 - 0.4;
      if (d >= min || d < 1e-6) continue;
      var nx = dx / d,
        nz = dz / d,
        push = (min - d) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      // closing speed along the contact normal decides the damage
      var avx = Math.sin(a.heading) * a.v,
        avz = Math.cos(a.heading) * a.v,
        bvx = Math.sin(b.heading) * b.v,
        bvz = Math.cos(b.heading) * b.v;
      var rel = (avx - bvx) * nx + (avz - bvz) * nz;
      var bFx = Math.sin(b.heading),
        bFz = Math.cos(b.heading);
      var aBehind = dx * bFx + dz * bFz > 0;
      // a rear tap that isn't a slam is a bump-draft: the lead truck gets a
      // shove, the trailer keeps most of its speed, and nobody explodes
      if (rel > 6 && rel <= 25) {
        if (aBehind) {
          b.v += rel * 0.12;
          a.v *= 0.94;
        } else {
          a.v += rel * 0.12;
          b.v *= 0.94;
        }
      }
      if (rel > 25 && now > a.hitCd && now > b.hitCd) {
        var dmg = (rel - 20) * 0.3;
        // the truck doing the ramming (faster along the contact normal) takes less
        var aInto = avx * nx + avz * nz,
          bInto = -(bvx * nx + bvz * nz);
        var aRams = aInto > bInto;
        applyDamage(a, dmg * (aRams ? 0.7 : 1), now);
        applyDamage(b, dmg * (aRams ? 1 : 0.7), now);
        a.hitCd = b.hitCd = now + 300;
        a.v *= 0.55;
        b.v *= 0.55;
        beep(90, 0.1, 0.5);
      }
      syncCarMesh(a);
      syncCarMesh(b);
    }
  }
}

function syncCarMesh(car) {
  if (car.dead) return;
  var now = performance.now();
  // hop arc when a drift starts, so the kart visibly pops off the floor
  var hop = car.hopT > 0 ? Math.sin((1 - car.hopT / HOP_MS) * Math.PI) * 1.3 : 0;
  car.grp.position.set(car.x, car.y - (car.sink || 0) + hop, car.z);
  // Oversteer still points the nose into the corner, but the vehicle's local
  // up axis follows the supporting triangle so banked/sloped roads cannot cut
  // through one side of the truck.
  var visualHeading = car.heading + (car.driftDir || 0) * 0.38;
  var up = car.surfaceUp || UP_FLAT;
  carUp.set(up.x, up.y, up.z).normalize();
  carForward.set(Math.sin(visualHeading), 0, Math.cos(visualHeading));
  carForward.addScaledVector(carUp, -carForward.dot(carUp)).normalize();
  carRight.crossVectors(carUp, carForward).normalize();
  carForward.crossVectors(carRight, carUp).normalize();
  carBasis.makeBasis(carRight, carUp, carForward);
  car.grp.quaternion.setFromRotationMatrix(carBasis);
  var shrunk = (car.smallT || 0) > now;
  var sc = shrunk ? 0.58 : 1;
  car.grp.scale.x += (sc - car.grp.scale.x) * 0.15;
  car.grp.scale.setScalar(car.grp.scale.x);
  car.wheels.forEach(function (w) {
    w.spin.rotation.x = car.spin;
    // front wheels counter-steer through a drift — the classic sideways pose
    if (w.steer)
      w.pivot.rotation.y = car.driftDir
        ? -car.driftDir * 0.3 + car.steer * 0.12
        : car.steer * 0.42;
  });
  if (car.body) {
    // cosmetic lean + airborne pitch + a battered rattle at low hp
    car.body.rotation.z = -car.steer * (car.v / MAXV) * (car.driftDir ? 0.22 : 0.1);
    car.body.rotation.x = clamp(-car.vy * 0.002, -0.25, 0.3);
    if (car.hp < 40 && Math.abs(car.v) > 8)
      car.body.rotation.z += (Math.random() - 0.5) * 0.05;
  }
  // star power: an additive rainbow shell around the kart while it lasts
  var starred = (car.starT || 0) > now;
  if (starred && !car.starFx) {
    car.starFx = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffe066,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    car.starFx.position.y = 1.2;
    car.grp.add(car.starFx);
  } else if (!starred && car.starFx) {
    car.grp.remove(car.starFx);
    car.starFx.geometry.dispose();
    car.starFx.material.dispose();
    car.starFx = null;
  }
  if (car.starFx) {
    car.starFx.material.color.setHSL((now / 400) % 1, 1, 0.62);
    car.starFx.scale.setScalar(1 + Math.sin(now / 90) * 0.07);
  }
}

function aiInput(car, dt) {
  var input = { fwd: false, back: false, left: false, right: false };
  if (!R.race || R.race.state !== "run" || car.done || car.dead) {
    return input;
  }
  var now = performance.now();
  if (car.revT > now) {
    // stuck recovery: back out with opposite steer
    input.back = true;
    if (car.revSteer > 0) input.right = true;
    else input.left = true;
    return input;
  }
  var wpsA = R.track.wps,
    NW = wpsA.length;
  var tgt = wpsA[car.next];
  var la = wpsA[(car.next + 1) % NW],
    la2 = wpsA[(car.next + 2) % NW];
  var ax = tgt.x,
    az = tgt.z;
  // Fluid line: when closing on a smoothing point, aim at the midpoint toward
  // the next one so the bot carves the curve instead of squaring the corner.
  // Only where the gates are far enough apart to have a curve — on the spiral
  // they sit ~14cm apart and cutting to the midpoint walks the bot off the deck.
  if (
    tgt.minor &&
    Math.hypot(tgt.x - car.x, tgt.z - car.z) < 34 &&
    Math.hypot(la.x - tgt.x, la.z - tgt.z) > 26
  ) {
    ax = (tgt.x + la.x) / 2;
    az = (tgt.z + la.z) / 2;
  }
  var ahead = courseAhead(R.track.center, car, MAXV * car.aiSkill);
  if (ahead && ahead.off < (R.roadWidth || 26)) { ax = ahead.target.x; az = ahead.target.z; }
  var want = Math.atan2(ax - car.x, az - car.z);
  var diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  var steer = clamp(diff * 3, -1, 1);
  // Hold a private racing line so the field doesn't sit in a single-file
  // queue, then swing out when a slower truck is blocking the gate.
  var lane = car.aiLane || 0;
  car.passSide = 0;
  for (var oi = 0; oi < R.cars.length; oi++) {
    var o = R.cars[oi];
    if (o === car || o.dead || o.done) continue;
    if (Math.abs((o.y || 0) - car.y) > 4) continue;
    var odx = o.x - car.x,
      odz = o.z - car.z,
      od = Math.hypot(odx, odz);
    if (od > 16 || od < 3.4) continue;
    var ofx = Math.sin(car.heading),
      ofz = Math.cos(car.heading);
    if (odx * ofx + odz * ofz < 3) continue;
    if (o.v > car.v + 6) continue;
    car.passSide = odx * ofz - odz * ofx >= 0 ? 1 : -1;
    break;
  }
  if (car.passSide) lane = car.passSide * 7.2;
  if (lane) {
    var ux = tgt.ux,
      uz = tgt.uz;
    if (ux == null || uz == null) {
      var sl = Math.hypot(la.x - tgt.x, la.z - tgt.z) || 1;
      ux = (la.x - tgt.x) / sl;
      uz = (la.z - tgt.z) / sl;
    }
    ax += uz * lane;
    az += -ux * lane;
    want = Math.atan2(ax - car.x, az - car.z);
    diff = want - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    steer = clamp(diff * 3, -1, 1);
  }
  // How hard the road bends over the next few gates — a bot that carries full
  // road speed into the spiral just understeers into the wall the whole way up.
  // Measured from the ROAD's own tangents: gates can sit 10cm apart on a tight
  // curve, and the angle between two of those is mostly noise.
  // how far ahead the bot reads the road is part of the difficulty: a short
  // horizon means braking late and running wide
  var t1 = tgt,
    t2 = wpsA[(car.next + (car.aiLook || 4)) % NW];
  var bend = 0;
  if (t1.ux != null && t2.ux != null) {
    var dot = clamp(t1.ux * t2.ux + t1.uz * t2.uz, -1, 1);
    bend = Math.acos(dot);
  }
  // feelers: brake/steer around furniture between waypoints
  var probe = 11 + Math.abs(car.v) * 0.28;
  var cBlock = blockedAt(
    car.x + Math.sin(car.heading) * probe,
    car.z + Math.cos(car.heading) * probe,
    1.8,
    car.y,
    CAR_CLEAR,
    STEP_H,
  );
  var lBlock = blockedAt(
    car.x + Math.sin(car.heading + 0.55) * probe * 0.8,
    car.z + Math.cos(car.heading + 0.55) * probe * 0.8,
    1.8,
    car.y,
    CAR_CLEAR,
    STEP_H,
  );
  var rBlock = blockedAt(
    car.x + Math.sin(car.heading - 0.55) * probe * 0.8,
    car.z + Math.cos(car.heading - 0.55) * probe * 0.8,
    1.8,
    car.y,
    CAR_CLEAR,
    STEP_H,
  );
  if (cBlock) steer += lBlock && !rBlock ? -0.9 : 0.9;
  else if (lBlock) steer -= 0.6;
  else if (rBlock) steer += 0.6;
  if (steer > 0.12) input.left = true;
  else if (steer < -0.12) input.right = true;
  input.steerAxis = -clamp(steer, -1, 1);
  // bots drift the tight corners too, and cash the mini-turbo on the exit
  if (kartIsOn() && !cBlock) {
    if (Math.abs(diff) > 0.42 && Math.abs(car.v) > DRIFT_MIN_V + 8)
      car.aiDrift = now + 420;
    input.drift = (car.aiDrift || 0) > now && Math.abs(diff) > 0.15;
  }
  var slow =
    (ahead && car.v > ahead.speed + 3) ||
    Math.abs(diff) > 1.15 ||
    (cBlock && Math.abs(car.v) > 40) ||
    (!car.passSide &&
      bend > 0.45 &&
      Math.abs(car.v) > MAXV * clamp(1 - bend * 0.42, 0.42, 1));
  if (slow && car.v > 25) {
    input.back = true;
    input.throttle = -0.55;
  } else {
    input.fwd = true;
    input.throttle = 1;
  }
  // Stuck detection on PROGRESS, not speed: a bot leaning on a wardrobe at
  // 24cm/s never trips a speed test, and used to push at it for the whole race.
  var dTgt = Math.hypot(car.x - tgt.x, car.z - tgt.z);
  if (car.progWp !== car.next) {
    car.progWp = car.next;
    car.progD = dTgt;
    car.stuck = 0;
    car.revs = 0;
  } else if (dTgt < (car.progD == null ? dTgt : car.progD) - 0.4) {
    car.progD = dTgt;
    car.stuck = 0;
  } else car.stuck += dt;
  if (input.fwd && Math.abs(car.v) < 2.5) car.stuck += dt;
  if (car.stuck > 1.7) {
    car.stuck = 0;
    car.progD = dTgt;
    car.revs = (car.revs || 0) + 1;
    if (car.revs > 2) {
      car.revs = 0;
      rescueCar(car); // backing out isn't working — lift it back onto the road
    } else {
      car.revT = now + 750;
      car.revSteer = steer >= 0 ? 1 : -1;
    }
  }
  return input;
}

function footStep(dt, input) {
  var f = R.fig;
  var mx = 0,
    mz = 0,
    yawBase = f.camYaw;
  input = input || R.keys;
  if (input.fwd) {
    mx += Math.sin(yawBase);
    mz += Math.cos(yawBase);
  }
  if (input.back) {
    mx -= Math.sin(yawBase);
    mz -= Math.cos(yawBase);
  }
  if (input.right) {
    mx += -Math.cos(yawBase);
    mz += Math.sin(yawBase);
  }
  if (input.left) {
    mx += Math.cos(yawBase);
    mz += -Math.sin(yawBase);
  }
  var moving = mx || mz;
  if (moving) {
    var l = Math.hypot(mx, mz);
    var spd = input.run ? FOOT_RUN : FOOT_SPD;
    if (f.y < 1.5 && waterAt(f.x, f.z)) {
      spd *= 0.45; // wading
      if (Math.random() < dt * 6) spraySpawn(f.x, f.y + 0.5, f.z, 1, 14);
    }
    var want = Math.atan2(mx / l, mz / l);
    var diff = want - f.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    f.heading += diff * Math.min(1, dt * 12);
    var p = moveScratch;
    p.x = f.x;
    p.z = f.z;
    var fdx = (mx / l) * spd * dt,
      fdz = (mz / l) * spd * dt;
    if (moveCircle) moveCircle(p, fdx, fdz, FOOT_R, f.y, FOOT_CLEAR, FIG_STEP);
    else {
      p.x += fdx;
      p.z += fdz;
      collideCircle(p, FOOT_R, f.y, FOOT_CLEAR, FIG_STEP);
    }
    f.x = p.x;
    f.z = p.z;
    f.bob += dt * (input.run ? 13 : 9);
  }
  // same ledge/fall rules as the trucks, tiny legs edition
  var g = groundAt(f.x, f.z, f.y, FIG_STEP);
  if (f.y > g + 0.05) {
    f.vy -= GRAV * dt;
    f.y += f.vy * dt;
    if (f.y <= g) {
      f.y = g;
      f.vy = 0;
    }
  } else {
    f.y += (g - f.y) * Math.min(1, dt * 14);
    f.vy = 0;
  }
  f.grp.position.set(f.x, f.y + Math.abs(Math.sin(f.bob)) * 0.11, f.z);
  f.grp.rotation.y = f.heading;
}

// item slot (with its roulette spin), coin purse and race position
function updateKartHud(now) {
  var pc = playerCar();
  var driving = !!(pc && R.phase === "drive");
  var items = kartIsOn() && driving;
  var racing = !!(driving && R.cars.length > 1 && R.race && R.race.state !== "done");
  R.hud.item.classList.toggle("on", !!items);
  R.hud.coins.classList.toggle("on", !!items);
  R.hud.pos.classList.toggle("on", racing);
  if (items) {
    var slot = kartSlot(pc, now);
    R.hud.itemIcon.textContent = slot.icon;
    R.hud.itemN.textContent = slot.n > 1 ? "×" + slot.n : "";
    R.hud.item.classList.toggle("rolling", slot.rolling);
    R.hud.item.classList.toggle("full", !!slot.icon && !slot.rolling);
    R.hud.coinN.textContent = String(pc.coins || 0);
  }
  if (!pc) return;
  var place = pc.place || 1;
  R.hud.posN.textContent = ordinal(place);
  R.hud.posOf.textContent = "/" + R.cars.length;
  if (pc.prevPlace && pc.prevPlace !== place && R.race && R.race.state === "run") {
    R.hud.pos.classList.remove("gained", "lost");
    void R.hud.pos.offsetWidth;
    R.hud.pos.classList.add(place < pc.prevPlace ? "gained" : "lost");
  }
  pc.prevPlace = place;
}

// Rise of the surface under the body per cm travelled along `yaw`, from the
// contact normal. Negative going downhill.
function slopeAlong(up, yaw) {
  if (!up || !up.y) return 0;
  var fx = Math.sin(yaw),
    fz = Math.cos(yaw);
  return clamp(-(up.x * fx + up.z * fz) / up.y, -1.2, 1.2);
}

function chaseCam(tx, ty, tz, yaw, dist, height, lookH, dt, up, speed, boosting, now, lookBack) {
  var camera = getMainCamera();
  var pace = clamp(Math.abs(speed || 0) / Math.max(1, MAXV), 0, 1.35);
  if (lookBack) yaw += Math.PI;
  var steerLook = lookBack ? 0 : R.cam.steerLook || 0;
  var cy = yaw + R.cam.yawOff + steerLook;
  var wx = tx - Math.sin(cy) * dist,
    wz = tz - Math.cos(cy) * dist;
  // Follow the road plane instead of hanging at a fixed height above the truck:
  // on a steep descent the deck BEHIND the car is metres higher, so a level boom
  // ends up inside/under the road. Pitching the boom with the local slope keeps
  // it over the tarmac and points the view down the hill.
  var slope = slopeAlong(up, cy);
  R.cam.slope = R.cam.slope || 0;
  R.cam.slope += (slope - R.cam.slope) * Math.min(1, dt * 4);
  var wy = ty + height - R.cam.slope * dist * 0.8;
  // Backstop for anything the slope term can't predict (a hump behind, the
  // spiral's own deck): never let the boom sink into a road layer at its own
  // (x,z). Ignore layers far above — a flyover overhead is not the floor.
  var surf = R.col && R.col.surface;
  if (surf && surf.length) {
    var sh = surfaceHeightNear(surf, wx, wz, wy, 60);
    if (sh != null && wy < sh + 4.5) wy = sh + 4.5;
  }
  if (!R.cam.pos) R.cam.pos = new THREE.Vector3(wx, wy, wz);
  var k = 1 - Math.exp(-8 * dt);
  R.cam.pos.x += (wx - R.cam.pos.x) * k;
  R.cam.pos.y += (wy - R.cam.pos.y) * k;
  R.cam.pos.z += (wz - R.cam.pos.z) * k;
  camera.position.copy(R.cam.pos);
  // A wider lens and a little high-frequency road buzz sell scale speed without
  // changing the handling. Keep the vibration out of R.cam.pos so it never
  // accumulates into camera drift.
  var baseFov = R.prevFov == null ? camera.fov : R.prevFov;
  var targetFov = baseFov + pace * 13 + (boosting ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 7);
  camera.updateProjectionMatrix();
  if (pace > 0.28) {
    var buzz = (pace - 0.28) * (boosting ? 0.34 : 0.2);
    camera.position.x += Math.sin((now || 0) * 0.041) * buzz;
    camera.position.y += Math.sin((now || 0) * 0.067) * buzz * 0.55;
  }
  var lookAhead = Math.max(0, speed || 0) * 0.075;
  camera.lookAt(
    tx + Math.sin(yaw) * lookAhead,
    ty + lookH + R.cam.slope * dist * 0.35,
    tz + Math.cos(yaw) * lookAhead,
  );
  // drift the manual orbit offset back to dead-center behind the car
  R.cam.yawOff *= Math.max(0, 1 - dt * (R.cam.drag ? 0 : 1.6));
}

// Cab cameras. At this scale the truck is ~4cm long, so the difference between
// "on the bonnet" and "behind the screen" is millimetres — what actually sells
// them apart is the lens and how much of the body is in frame. Both ride the
// road plane through the car's own surface normal, so a banked deck rolls the
// horizon instead of sliding the view through the tarmac.
function insideCam(car, dt, now, cockpit, lookBack) {
  var camera = getMainCamera();
  var up = car.surfaceUp || UP_FLAT;
  var yaw = car.heading + (car.driftDir || 0) * 0.38 + (lookBack ? Math.PI : 0);
  var fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
  var fx = lookBack ? -1.2 : cockpit ? -0.15 : 1.35, // along the truck: cab vs. nose
    hy = cockpit ? 1.85 : 1.15;
  var wx = car.x + fwd.x * fx,
    wz = car.z + fwd.z * fx,
    wy = car.y + hy + (up.y ? (1 - up.y) * 0.4 : 0);
  // no smoothing on position — a hood cam that lags is a hood cam that clips
  // through its own bonnet on every bump
  if (!R.cam.pos) R.cam.pos = new THREE.Vector3(wx, wy, wz);
  R.cam.pos.set(wx, wy, wz);
  camera.position.copy(R.cam.pos);
  var pace = clamp(Math.abs(car.v) / Math.max(1, MAXV), 0, 1.35);
  var baseFov = R.prevFov == null ? camera.fov : R.prevFov;
  var boosting = (car.boostT || 0) > now;
  var targetFov = baseFov + 8 + pace * 16 + (boosting ? 7 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 7);
  camera.updateProjectionMatrix();
  if (pace > 0.25) {
    var buzz = (pace - 0.25) * (boosting ? 0.22 : 0.13);
    camera.position.x += Math.sin(now * 0.053) * buzz;
    camera.position.y += Math.sin(now * 0.081) * buzz * 0.6;
  }
  camera.up.set(up.x || 0, up.y || 1, up.z || 0);
  camera.lookAt(
    car.x + fwd.x * 40,
    car.y + hy + slopeAlong(up, yaw) * 26,
    car.z + fwd.z * 40,
  );
  camera.up.set(0, 1, 0);
}

// Pick the camera the player asked for. Falls back to chase whenever the truck
// is wrecked — watching a shard cloud from inside the cab shows nothing.
function carCam(car, dt, now, lookBack) {
  var reversing = !lookBack && car.v < -10;
  var look = !!(lookBack || reversing);
  var mode = car.dead ? "chase" : R.camMode;
  if (look !== R.cam.wasLook) {
    R.cam.pos = null;
    R.cam.wasLook = look;
  }
  R.cam.steerLook = R.cam.steerLook || 0;
  R.cam.steerLook +=
    ((look ? 0 : (car.steer || 0) * 0.32) - R.cam.steerLook) * Math.min(1, dt * 5);
  if (mode === "hood" || mode === "cockpit") {
    insideCam(car, dt, now, mode === "cockpit", look);
    return;
  }
  chaseCam(
    car.x,
    car.y,
    car.z,
    car.heading,
    R.cam.dist + Math.abs(car.v) * 0.07,
    7.5 + R.cam.dist * 0.22,
    1.7,
    dt,
    car.surfaceUp,
    car.v,
    (car.boostT || 0) > now,
    now,
    look,
  );
}

// Results: a slow orbit of the winner, so the flag means something visually
// instead of the camera freezing wherever the race left it.
function resultsCam(dt, now) {
  var st = R.cam.results;
  var camera = getMainCamera();
  if (!st || !st.car || !camera) return;
  st.a += dt * 0.42;
  var car = st.car,
    dist = 17,
    hy = 8.5;
  var wx = car.x - Math.sin(st.a) * dist,
    wz = car.z - Math.cos(st.a) * dist,
    wy = car.y + hy;
  var surf = R.col && R.col.surface;
  if (surf && surf.length) {
    var sh = surfaceHeightNear(surf, wx, wz, wy, 60);
    if (sh != null && wy < sh + 4.5) wy = sh + 4.5;
  }
  if (!R.cam.pos) R.cam.pos = new THREE.Vector3(wx, wy, wz);
  var k = 1 - Math.exp(-4 * dt);
  R.cam.pos.x += (wx - R.cam.pos.x) * k;
  R.cam.pos.y += (wy - R.cam.pos.y) * k;
  R.cam.pos.z += (wz - R.cam.pos.z) * k;
  camera.position.copy(R.cam.pos);
  var baseFov = R.prevFov == null ? camera.fov : R.prevFov;
  camera.fov += (baseFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  camera.lookAt(car.x, car.y + 1.6, car.z);
}

// Editing camera: a free orbit high over the whole flat. The chase cam sits
// 24cm behind a 4cm truck, which is useless for laying out a circuit — with the
// editor open you want the whole loop and every handle on screen at once.
function editorCam(dt) {
  var camera = getMainCamera();
  var b = R.edCam;
  var yaw = R.cam.yawOff;
  var pitch = b.pitch == null ? 0.62 : b.pitch;
  var wx = b.cx - Math.sin(yaw) * b.dist * Math.sin(pitch) * 0.85,
    wz = b.cz - Math.cos(yaw) * b.dist * Math.sin(pitch) * 0.85;
  var hy = b.dist * Math.cos(pitch) * 0.82 + 18;
  if (!R.cam.pos) R.cam.pos = new THREE.Vector3(wx, hy, wz);
  var k = 1 - Math.exp(-6 * dt);
  R.cam.pos.x += (wx - R.cam.pos.x) * k;
  R.cam.pos.y += (hy - R.cam.pos.y) * k;
  R.cam.pos.z += (wz - R.cam.pos.z) * k;
  camera.position.copy(R.cam.pos);
  camera.lookAt(b.cx, 22, b.cz);
}

// Design in the 3D view: the apartment and the models ARE the course. Split
// remains available from the 🗺️ button if you want the 2D map beside it.
function editorSplit(on) {
  var cc = document.getElementById("center-canvas");
  if (!cc || !window.__setViewMode) return;
  if (on) {
    R.edPrevView = cc.classList.contains("max-view-2d")
      ? "plan"
      : cc.classList.contains("max-view-3d")
        ? "3d"
        : "split";
    // The map is the precise route editor and the 3D scene is the surface
    // picker. Hiding either one made the workflow look like two unrelated
    // tools. Desktop opens both; compact layouts keep the larger 3D view and
    // expose the map through the editor's labelled map button.
    var compact = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
    window.__setViewMode(compact ? "3d" : "split");
  } else if (R.edPrevView) {
    // Opening the editor now changes desktop 3D into Split as well, so every
    // previous view — including 3D — must be restored on Drive/Close.
    window.__setViewMode(R.edPrevView);
    R.edPrevView = null;
  }
}

// on/off switch used by the editor's 👁 button
function setOverview(on) {
  R.edCam.on = !!on;
  if (!on) {
    R.cam.pos = null;
    return;
  }
  var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, any = false;
  detectRooms().forEach(function (r) {
    (r.pts || []).forEach(function (p) {
      any = true;
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z);
      maxz = Math.max(maxz, p.z);
    });
  });
  if (!any) {
    minx = minz = -200;
    maxx = maxz = 200;
  }
  R.edCam.cx = (minx + maxx) / 2;
  R.edCam.cz = (minz + maxz) / 2;
  R.edCam.dist = clamp(Math.max(maxx - minx, maxz - minz) * 1.05, 120, 3000);
  if (R.edCam.pitch == null) R.edCam.pitch = 0.62;
  R.cam.pos = null;
}

function tick(delta) {
  if (!R.active) return false;
  // Paused: nothing steps and no clock advances, but the frame is still drawn
  // so the menu sits over the scene rather than a frozen screenshot of it.
  if (R.paused) {
    engineOff();
    return true;
  }
  var dt = safeDeltaSeconds(delta, 1 / 60);
  var now = performance.now();
  editorTick(now); // pulse the live editor's handles / animate its map
  var pInput = readPlayerInput(now);
  if (R.colDirty) {
    buildColModel();
    if (R.race) openAllDoors();
    // Furniture and doorway edits can invalidate the lane without moving walls.
    if (!R.race) buildTrack();
  }
  var pc = playerCar();
  // race countdown / clock
  if (R.race) {
    if (R.race.state === "count") {
      var left = R.race.t0 - now;
      // rocket start: hold the throttle inside the last moment of the countdown
      // and the kart launches; grab it too early and the motor floods
      if (pc && R.phase === "drive" && pInput.fwd && !R.race.armed) {
        R.race.armed = true;
        if (left <= ROCKET_WIN && !((pc.stallT || 0) > now)) R.race.rocket = true;
        else {
          pc.stallT = now + STALL_MS + left;
          showMsg("💨", 700);
        }
      }
      if (pc && !pInput.fwd) R.race.armed = false;
      if (left <= 0) {
        R.race.state = "run";
        R.race.lapT0 = R.race.t0; // lap 1 is timed from the flag, not from now
        ghostStartLap(R.race.t0);
        updateStartLights(0);
        showMsg(t("rc_go"), 900);
        sting("go");
        if (pc && R.race.rocket && pInput.fwd) {
          pc.boostT = now + ROCKET_MS;
          pc.v = MAXV * 1.2;
          showMsg(t("rc_rocket"), 1100);
          beep(660, 0.16, 0.45);
          beep(990, 0.22, 0.4);
        }
        // the bots get their own launch, weighted by skill
        R.cars.forEach(function (c) {
          if (c.ai && Math.random() < 0.45) c.boostT = now + ROCKET_MS * 0.7;
        });
      } else {
        var n = Math.ceil(left / 1000);
        if (R.race.lastN !== n) {
          R.race.lastN = n;
          sting("light"); // one light per second, like a start gantry
        }
        updateStartLights(left);
        showMsg(String(n), 300);
      }
    }
    var elapsed = Math.max(0, now - R.race.t0);
    R.hud.time.textContent = fmtT(elapsed);
    if (pc && !pc.done)
      R.hud.lap.textContent =
        t("rc_lap") + " " + Math.min(pc.lap, R.laps) + "/" + R.laps;
    updateLapHud(now, pc);
    if (pc) updateRings(pc.done ? -1 : pc.next);
    if (R.race.state === "run" && now - R.race.t0 > 800) updateStartLights(null);
    // The player is home but the bots are not: hold the result open for a
    // little while so their finishing order is raced for, not guessed, with a
    // skip for anyone who doesn't care.
    if (R.race.state === "run" && R.race.playerDone) {
      if (allDone()) finishRace(now, false);
      else {
        var waited = now - R.race.playerDone;
        if (waited > FINISH_GRACE_MS) finishRace(now, false);
        else {
          R.hud.wait.classList.add("on");
          R.hud.waitTxt.textContent =
            t("rc_waiting") + " " + Math.ceil((FINISH_GRACE_MS - waited) / 1000) + "s";
        }
      }
    } else if (R.race.state === "run" && pc && !pc.done && R.cars.length > 1) {
      // The whole field is home and the player is still out there: without an
      // exit offered here the race literally cannot end. Give them the same
      // skip the finishers get, a short beat after the last rival crosses.
      var lastAi = 0,
        aiGone = true;
      for (var ci = 0; ci < R.cars.length; ci++) {
        var ac = R.cars[ci];
        if (!ac.ai) continue;
        if (!ac.done) aiGone = false;
        else if (ac.finT > lastAi) lastAi = ac.finT;
      }
      if (aiGone && lastAi && now - R.race.t0 - lastAi > FINISH_GRACE_MS) {
        R.hud.wait.classList.add("on");
        R.hud.waitTxt.textContent = t("rc_field_done");
      }
    }
  }
  // cars
  R.cars.forEach(function (c) {
    var input;
    if (c.ai) input = aiInput(c, dt);
    else if (R.phase === "drive") input = pInput;
    else input = {};
    if (!c.ai && R.brakeAssist && R.race && R.race.state === "run" && input.fwd && !input.drift && !input.run) {
      var ahead = courseAhead(R.track.center, c, MAXV);
      if (ahead && ahead.off < R.roadWidth && c.v > ahead.speed + 2) input = Object.assign({}, input, { throttle: -0.45 });
    }
    forEachPhysicsStep(dt, function (stepDt) {
      carPhysics(c, stepDt, input, now);
    });
  });
  carVsCar(now);
  updatePlaces();
  kartTick(dt, now, !R.race || R.race.state !== "count");
  updateKartHud(now);
  updateGaps(pc);
  updateWrongWay(pc);
  updateStuckHint(pc, pInput, now);
  var coach = R.hud.root.querySelector("#rcCoach");
  var route = pc && R.race && R.race.state === "run" && !pc.done && courseAhead(R.track.center, pc, MAXV);
  coach.hidden = !route;
  if (route) coach.textContent = route.off > R.roadWidth ? t("rc_return_course") :
    pc.v > route.speed + 3 ? t("rc_brake_corner") : route.turn ?
      (route.turn > 0 ? "↶ " : "↷ ") + t("rc_corner_ahead") : t("rc_clear_straight");
  if (R.hud && R.hud.root)
    R.hud.root.classList.toggle("drafting", !!(pc && (pc.draft || 0) > 0.35));
  stepShards(dt, now);
  stepSpray(dt, now);
  R.waters.forEach(function (w) {
    if (w.mat) w.mat.userData.waterUniforms.uTime.value = now / 1000;
  });
  // On-foot movement is simulation, not presentation: it must run regardless of
  // which camera owns the frame (results orbit, editor overview), exactly like
  // the trucks' physics above. Nesting it in the camera branch is what froze
  // the figure whenever a results camera was left over.
  if (R.phase === "foot" && R.fig) footStep(dt, pInput);
  // player view
  if (R.cam.results) {
    resultsCam(dt, now);
    engineOff();
    R.hud.speed.textContent = "";
    R.hud.root.style.setProperty("--rc-speed", "0");
  } else if (R.edCam.on && editorActive()) {
    editorCam(dt);
    if (pc) R.hud.speed.textContent = "";
  } else if (R.phase === "drive" && pc) {
    var speedPace = clamp(Math.abs(pc.v) / Math.max(1, MAXV), 0, 1.35);
    var cameraBoost = (pc.boostT || 0) > now;
    carCam(pc, dt, now, !!(pInput.look || R.touch.look));
    R.hud.root.style.setProperty("--rc-speed", String(clamp((speedPace - 0.28) / 0.92, 0, 1)));
    R.hud.root.classList.toggle("boosting", cameraBoost);
    engineTick(pInput.fwd && !pc.dead, pc.dead ? 0 : pc.v);
    driveAudio(pc, now);
    R.hud.speed.textContent = pc.dead
      ? ""
      : Math.round(Math.abs(pc.v) * 0.036 * 10) / 10 + " " + t("rc_kmh");
  } else if (R.phase === "foot" && R.fig) {
    R.fig.camYaw = R.fig.camYaw != null ? R.fig.camYaw : R.fig.heading;
    // camera yaw follows the figure's travel, plus the manual drag offset
    var fd = R.fig.heading - R.fig.camYaw;
    while (fd > Math.PI) fd -= Math.PI * 2;
    while (fd < -Math.PI) fd += Math.PI * 2;
    R.fig.camYaw += fd * Math.min(1, dt * 2.2);
    chaseCam(R.fig.x, R.fig.y, R.fig.z, R.fig.camYaw, 11, 6.5, 1.7, dt, null, 0, false, now);
    R.hud.root.style.setProperty("--rc-speed", "0");
    engineOff();
    R.hud.speed.textContent = "";
  }
  // ghost: recorded on every lap, shown in time trial against the record
  if (pc && R.race && R.race.state === "run" && !pc.done) ghostRecord(pc, now);
  ghostTick(
    R.race && R.race.lapT0 ? now - R.race.lapT0 : 0,
    R.ghostOn && !!R.race && R.race.state === "run" && R.race.mode === "trial",
  );
  mpTick(now, pc);
  // the editor can rebuild the road mid-session; the map's static layer is
  // cached, so it has to be told when the circuit it drew no longer exists
  if (R.track !== lastTrack) {
    set_lastTrack(R.track);
    miniSync();
  }
  miniTick(now, pc);
  if (R.msgT && now > R.msgT) {
    R.hud.msg.classList.remove("on");
    R.msgT = 0;
  }
  return true;
}

export { editorSplit, setOverview, syncCarMesh, tick };

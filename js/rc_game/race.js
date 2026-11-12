/* RC game race finish, rings, waypoints and lap splits, split out of
   js/rc_game.js. It shares the editor's state through live imports from
   ../rc_game.js. */
import { t } from "../i18n.js";
import { kartIsOn, kartSpark } from "../kart.js";
import { dampingFactor } from "../physics_runtime.js";
import { motorDrag, passedGate } from "../rc_driving.js";
import { syncCarMesh } from "../rc_game/cars_cameras.js";
import { draftFactor, fmtT, showMsg, updatePlaces, updateSplitsHud, updateStartLights } from "../rc_game/hud.js";
import { centerIndexNear, clearCars, playerCar, saveSplits, showResults } from "../rc_game/pause_camera.js";
import { rescueCar } from "../rc_game/phases_input.js";
import { ghostFinishLap, ghostStartLap, ghostTick } from "../rc_ghost.js";
import { mpFinish } from "../rc_mp.js";
import { ACC, BOOST_MULT, BRAKE, CAR_CLEAR, COIN_MULT, COLL_R, DRAFT_MULT, DRAG, DRIFT_BOOST, DRIFT_MIN_V, DRIFT_TIER, GRAV, HOP_MS, MAXV, R, REV_MAX, SMALL_MULT, STAR_MULT, STEP_H, TURN_MAX, WATER_MAXV, WATER_SINK, WHEEL_R, WRECK_RESPAWN_MS, bankAdd, diffCfg } from "../rc_state.js";
import { applyDamage, beep, colHardHit, collideCircle, groundAt, inTrackGap, moveCircle, onRoad, respawnCar, saveBestLap, saveBestTime, spraySpawn, sting, thud, waterAt } from "../rc_world.js";
import { surfaceSampleAt } from "../road_surface.js";
import { clamp } from "../state.js";
import { UP_FLAT, moveScratch } from "../rc_game.js";

// One place where a race stops, whether that was everyone finishing, the grace
// period running out, or the player pressing skip.
function finishRace(now, skipped) {
  var race = R.race;
  if (!race || race.state === "done") return;
  race.state = "done";
  race.skipped = !!skipped;
  R.hud.wait.classList.remove("on");
  var pc = playerCar();
  // coins collected on track are banked, plus a podium bonus — this is the
  // only thing in the mode that outlives a single race
  var earned = (pc && pc.coins) || 0;
  if (pc && pc.done && R.cars.length > 1)
    earned += pc.place === 1 ? 30 : pc.place === 2 ? 20 : pc.place === 3 ? 10 : 5;
  if (race.newBestLap) earned += 15;
  race.earned = earned;
  if (earned) bankAdd(earned);
  // the winner's truck, orbited slowly, so a result is something you watch
  var star = R.cars.find(function (c) {
    return c.done && c.place === 1;
  }) || pc;
  R.cam.results = star ? { car: star, a: 0 } : null;
  sting(pc && pc.place === 1 && R.cars.length > 1 ? "best" : "finish");
  showResults();
}

function endRace() {
  R.race = null;
  R.cam.results = null;
  clearCars(true);
  updateRings(-1);
  R.hud.lap.textContent = "";
  R.hud.time.textContent = "";
  R.hud.lapT.textContent = "";
  R.hud.delta.textContent = "";
  R.hud.best.textContent = "";
  R.hud.wait.classList.remove("on");
  R.hud.splits.classList.remove("on");
  if (R.hud.gap) R.hud.gap.classList.remove("on");
  if (R.hud.warn) R.hud.warn.classList.remove("on");
  updateStartLights(null);
  ghostTick(0, false);
}

function updateRings(nextIdx) {
  if (!R.track) return;
  var guide = R.track.group.getObjectByName("rcCourseGuide");
  if (guide && guide.userData.nextGate !== nextIdx) {
    guide.userData.nextGate = nextIdx;
    var target = R.track.wps[nextIdx], end = target ? centerIndexNear(target.x, target.z) : -1;
    var count = R.track.center.length, colors = guide.geometry.getAttribute("color");
    colors.array.set(guide.userData.baseColors);
    guide.userData.courseRanges.forEach(function (range) {
      var behind = (end - range.i + count) % count;
      if (end < 0 || behind > 18) return;
      for (var j = range.start; j < range.start + range.count; j++) colors.setXYZ(j, 0.2, 1, 0.55);
    });
    colors.needsUpdate = true;
  }
  var pulse = 0.55 + 0.35 * Math.sin(performance.now() / 140);
  R.track.wps.forEach(function (wp, i) {
    if (!wp.mats) return;
    var next = i === nextIdx;
    wp.mats.forEach(function (m, k) {
      // k 0 = posts/banner, 1 = the curtain you drive through
      m.color.setHex(next ? 0xffd23d : i === 0 ? 0xdddddd : 0x7a8290);
      var base = wp.minor ? 0.32 : k ? 0.14 : 0.8;
      m.opacity = next ? (k ? 0.3 : 1) * pulse : base;
    });
  });
}

function checkWaypoints(car, now, from) {
  if (!R.race || car.done || car.dead) return;
  var wps = R.track && R.track.wps;
  if (!wps || !wps.length || !wps[car.next]) return;
  // Everyone must cross the same gate forwards, inside the lane. Sweeping the
  // movement segment also catches fast trucks that pass between frames.
  var hitIdx = passedGate(from, car, wps[car.next], wps[(car.next + 1) % wps.length],
    (R.roadWidth || 26) / 2) ? car.next : -1;
  if (hitIdx >= 0) {
    car.next = hitIdx; // in case a minor was skipped
    if (!car.ai && !wps[hitIdx].minor) beep(880, 0.08, 0.35);
    if (!car.ai && !wps[hitIdx].minor) recordSplit(hitIdx, now);
    if (car.next === 0) {
      car.lap++;
      if (!car.ai) closeLap(now);
      if (car.lap > R.laps) {
        car.done = true;
        car.finT = now - R.race.t0;
        if (!car.ai) {
          if (saveBestTime(car.finT)) R.race.newBestTime = true;
          showMsg(t("rc_finish"), 2400);
          mpFinish(car.finT, R.laps);
          // The race no longer stops the instant the player crosses: the bots
          // are still out there and their finishing order is a real result,
          // not something to extrapolate from progress. tick() closes it once
          // they are all home, the grace runs out, or the player skips.
          R.race.playerDone = now;
          updatePlaces();
          if (R.race.mode === "trial" || allDone()) finishRace(now, false);
        }
        return;
      }
      if (!car.ai) {
        if (car.lap === R.laps && R.laps > 1) {
          showMsg(t("rc_final_lap"), 1700);
          sting("lap");
        } else showMsg(t("rc_lap") + " " + car.lap + "/" + R.laps, 1200);
      }
    }
    car.next = (car.next + 1) % wps.length;
  }
}

function allDone() {
  return R.cars.every(function (c) {
    return c.done;
  });
}

// gate split for the lap in progress, and the delta against the best lap's
// time at the SAME gate
function recordSplit(idx, now) {
  var race = R.race;
  if (!race || race.state !== "run" || !race.lapT0) return;
  var tt = now - race.lapT0;
  race.splits[idx] = Math.round(tt);
  var ref = race.bestSplits && race.bestSplits[idx];
  if (ref > 0) {
    race.delta = tt - ref;
    race.deltaT = now + 2600;
  }
  updateSplitsHud(idx);
}

// The player just crossed the line: bank the lap, promote it if it is the
// fastest ever driven here, and open the next one.
function closeLap(now) {
  var race = R.race;
  if (!race) return;
  var start = race.lapT0 || race.t0;
  var lapMs = now - start;
  race.lapT0 = now;
  var isBest = false;
  if (lapMs > 400 && race.state === "run") {
    race.lapTimes.push(Math.round(lapMs));
    isBest = saveBestLap(lapMs);
    if (isBest) {
      race.newBestLap = true;
      race.bestSplits = race.splits.slice();
      saveSplits(race.bestSplits);
      showMsg(t("rc_best_lap") + " " + fmtT(lapMs), 1800);
      sting("best");
    } else sting("lap");
    race.delta = null;
  }
  race.splits = [];
  // the recording is kept only for the lap that set the record; either way the
  // next lap starts recording from here
  ghostFinishLap(lapMs, isBest);
  ghostStartLap(now);
}

// ---- drift & mini-turbo -----------------------------------------------------
// Hold the drift key mid-corner: the kart hops, locks into the turn and charges
// sparks (blue → orange → purple). Let go and the charge cashes out as a boost.
function driftTier(car) {
  var d = car.driftT || 0;
  return d >= DRIFT_TIER[2] ? 3 : d >= DRIFT_TIER[1] ? 2 : d >= DRIFT_TIER[0] ? 1 : 0;
}
function releaseDrift(car, now) {
  var tier = driftTier(car);
  if (tier) {
    car.boostT = Math.max(car.boostT || 0, now + DRIFT_BOOST[tier - 1]);
    car.v = Math.max(car.v, MAXV * (1.02 + tier * 0.1));
    if (!car.ai) beep(520 + tier * 170, 0.13, 0.32);
  }
  car.driftDir = 0;
  car.driftT = 0;
  car.driftTier = 0;
  car.driftPend = false;
}

// ---- per-frame simulation ---------------------------------------------------
function carPhysics(car, dt, input, now) {
  if (car.dead) {
    if (now - car.deadT > WRECK_RESPAWN_MS) respawnCar(car, now);
    return;
  }
  var locked = R.race && R.race.state === "count";
  var spun = (car.spinT || 0) > now,
    boosting = (car.boostT || 0) > now,
    starred = (car.starT || 0) > now,
    small = (car.smallT || 0) > now,
    stalled = (car.stallT || 0) > now;
  var analog = Number.isFinite(input.throttle) ? clamp(input.throttle, -1, 1) : null;
  var throttleTarget = !locked && !spun && !stalled
    ? (analog == null ? (input.fwd ? 1 : input.back ? -1 : 0) : analog)
    : 0;
  // RC triggers and keyboard keys used to hit the motor with an instant step.
  // A quick attack keeps it responsive, while the softer release prevents the
  // car pitching and changing direction every time a key is feathered.
  var reversingInput = throttleTarget && (car.throttle || 0) &&
    Math.sign(throttleTarget) !== Math.sign(car.throttle);
  var throttleRate = reversingInput
    ? 24
    : Math.abs(throttleTarget) > Math.abs(car.throttle || 0) ? 9 : 13;
  car.throttle = (car.throttle || 0) +
    (throttleTarget - (car.throttle || 0)) * dampingFactor(throttleRate, dt);
  var thr = Math.max(0, car.throttle),
    brk = Math.max(0, -car.throttle);
  var maxv = MAXV * (1 + Math.min(10, car.coins || 0) * COIN_MULT);
  if (car.ai) {
    maxv *= car.aiSkill;
    // rubber-band on lap+waypoint progress vs player
    var pc = playerCar();
    if (pc && R.race && R.race.state === "run") {
      var prog = car.lap * 100 + car.next,
        pprog = pc.lap * 100 + pc.next;
      // how hard the band pulls is the difficulty setting: on hard it barely
      // exists, so a lead you earn is a lead you keep
      var band = diffCfg();
      maxv *= prog < pprog ? band.catchUp : band.slowLead;
    }
  }
  var draft = draftFactor(car);
  car.draft = draft;
  if (draft > 0.08) maxv *= 1 + DRAFT_MULT * draft;
  if (boosting) maxv *= BOOST_MULT;
  if (starred) maxv *= STAR_MULT;
  if (small) maxv *= SMALL_MULT;
  if (thr) car.v += ACC * thr * (1 - (0.55 * Math.abs(car.v)) / maxv) * dt;
  if (boosting) car.v += ACC * 1.1 * dt; // the shove that sells a boost
  if (draft > 0.2 && thr > 0) car.v += ACC * 0.22 * draft * dt;
  if (brk) {
    if (car.v > 2) car.v -= BRAKE * brk * dt;
    else car.v -= ACC * 0.6 * brk * dt;
  }
  car.v -= car.v * motorDrag(thr, DRAG) * dt;
  car.v = clamp(car.v, -REV_MAX, maxv);
  // steering / drift state
  var st = spun ? 0 : Number.isFinite(input.steerAxis)
    ? -clamp(input.steerAxis, -1, 1)
    : (input.left ? 1 : 0) - (input.right ? 1 : 0);
  var wantDrift = !locked && !spun && kartIsOn() && !!(input.drift || input.run);
  if (car.hopT > 0) car.hopT = Math.max(0, car.hopT - dt);
  if (wantDrift && !car.driftHeld) {
    car.driftHeld = true;
    if (Math.abs(car.v) > DRIFT_MIN_V && car.y <= groundAt(car.x, car.z, car.y, STEP_H) + 1) {
      car.hopT = HOP_MS;
      if (!car.ai) beep(380, 0.05, 0.2);
      if (st) {
        car.driftDir = st;
        car.driftT = 0;
      } else car.driftPend = true; // hop first, pick the side on the way down
    }
  }
  if (!wantDrift) car.driftHeld = false;
  if (car.driftPend && wantDrift && st) {
    car.driftDir = st;
    car.driftT = 0;
    car.driftPend = false;
  }
  if ((!wantDrift || Math.abs(car.v) < 22) && (car.driftDir || car.driftPend))
    releaseDrift(car, now);
  var turnMul = 1;
  if (car.driftDir) {
    car.driftT = (car.driftT || 0) + dt;
    var tier = driftTier(car);
    if (tier !== car.driftTier) {
      car.driftTier = tier;
      if (tier && !car.ai) beep(640 + tier * 190, 0.05, 0.22);
    }
    // locked into the corner — steering only tightens or widens the arc
    var want = car.driftDir * (0.62 + 0.38 * clamp(st * car.driftDir, -1, 1));
    car.steer += (want - car.steer) * dampingFactor(12, dt);
    turnMul = 1.3;
    kartSpark(car, tier, dt);
  } else {
    car.driftTier = 0;
    // Faster centering/counter-steer makes corrections immediate, but a
    // slightly slower turn-in filters keyboard taps and noisy controller axes.
    var steeringBack = !st || Math.sign(st) !== Math.sign(car.steer || st);
    var steerRate = steeringBack ? 16 : 9;
    car.steer += (st - car.steer) * dampingFactor(steerRate, dt);
  }
  // Enough steering authority to park and recover at walking pace, tapering at
  // racing speed so a full key press cannot snap the truck sideways.
  var speedRatio = clamp(Math.abs(car.v) / Math.max(1, maxv), 0, 1);
  var rolling = Math.abs(car.v) / (Math.abs(car.v) + 4);
  var grip = rolling * (0.35 + 0.65 * (Math.abs(car.v) / (Math.abs(car.v) + 18)));
  var speedSteer = 1 - 0.38 * speedRatio * speedRatio;
  var groundSteer = car.grounded === false ? 0.18 : 1;
  if (spun) {
    // hit by a shell / banana: whipped around, throttle dead
    car.heading += (car.spinDir || 1) * 12 * dt * clamp((car.spinT - now) / 800, 0.3, 1);
    car.v -= car.v * 2.4 * dt;
  } else
    car.heading += car.steer * TURN_MAX * turnMul * grip * speedSteer * groundSteer *
      dt * (car.v < 0 ? -1 : 1);
  var speedBefore = Math.abs(car.v);
  var moveFromX = car.x,
    moveFromZ = car.z,
    wasGrounded = car.grounded !== false,
    wasOnRoad = onRoad(car.x, car.z, car.y);
  var p = moveScratch; // per-substep collision point — reused, never retained
  p.x = car.x;
  p.z = car.z;
  var dx = Math.sin(car.heading) * car.v * dt,
    dz = Math.cos(car.heading) * car.v * dt;
  // continuous collision — fast karts no longer tunnel thin walls / rails
  var pen = moveCircle
    ? moveCircle(p, dx, dz, COLL_R, car.y, CAR_CLEAR, STEP_H)
    : (p.x += dx, p.z += dz, collideCircle(p, COLL_R, car.y, CAR_CLEAR, STEP_H));
  var hardPen = colHardHit;
  car.x = p.x;
  car.z = p.z;
  // Guard rails line the whole elevated circuit now, so karts rub them
  // constantly — only a real head-on slam should cost hit points
  if (hardPen > 0.4 && speedBefore > 42) {
    if (now > car.hitCd) {
      // the impact is felt, not beeped — force scales with how hard it was
      if (!car.ai) thud(clamp((speedBefore - 42) / 70, 0.15, 1));
      if (!starred) applyDamage(car, (speedBefore - 38) * 0.26, now);
      car.hitCd = now + 300;
    }
    car.v *= 0.35;
    if (car.driftDir) releaseDrift(car, now); // a wall kills the charge
    if (car.dead) return; // wrecked by the impact
  } else if (pen > 0.01) car.v *= 1 - Math.min(0.9, dt * 4);
  // water: heavy drag + capped speed, wading spray, a splash on entry
  // A floor-level deck sits only 0.7cm above a pool. The old height-only test
  // treated a truck ON that deck as submerged and visually sank it by exactly
  // one wheel radius. Water affects the truck only when no road carries it.
  var roadUnderCar = onRoad(car.x, car.z, car.y);
  // Treat every non-jump edge as a closed safety barrier. Rails are assembled
  // segment by segment and deliberately open where two lanes overlap; a tiny
  // numerical opening there must never be a shortcut into empty space. Reject
  // support loss in the same frame, before gravity can put the kart below the
  // deck. The marked jump corridor remains genuinely airborne.
  // In home mode most of the lap has no deck at all: leaving an access ramp
  // sideways puts you on the floor of your own living room, which is allowed
  // and harmless. Only a deck the truck would actually FALL off still holds it.
  if (
    R.race &&
    R.race.state === "run" &&
    wasGrounded &&
    wasOnRoad &&
    !roadUnderCar &&
    (!R.homeMode || car.y > 8) &&
    !inTrackGap(car.x, car.z, car.y)
  ) {
    car.x = moveFromX;
    car.z = moveFromZ;
    car.v *= -0.12;
    roadUnderCar = true;
  }
  var inWater = car.y < 1.5 && waterAt(car.x, car.z) && !roadUnderCar;
  if (inWater) {
    if (!car.wet) {
      if (speedBefore > 35) {
        spraySpawn(car.x, car.y + 1, car.z, 9, speedBefore * 0.5);
        if (!car.ai) beep(180, 0.12, 0.4);
      }
      car.wet = true;
    }
    car.v *= 1 - Math.min(0.85, dt * 2.2);
    car.v = clamp(car.v, -REV_MAX * 0.5, MAXV * WATER_MAXV);
    if (Math.abs(car.v) > 14 && Math.random() < dt * 16)
      spraySpawn(car.x, car.y + 0.8, car.z, 2, Math.abs(car.v) * 0.4);
  } else car.wet = false;
  // Never carry residual visual sinking back onto the deck.
  if (roadUnderCar) car.sink = 0;
  else
    car.sink =
      (car.sink || 0) +
      ((car.wet ? WATER_SINK : 0) - (car.sink || 0)) * dampingFactor(6, dt);
  // vertical: climb ramps, launch off kickers, fall off edges under gravity
  var g = groundAt(car.x, car.z, car.y, STEP_H);
  // one scratch per car: this sample runs per car per physics substep
  var roadSample = surfaceSampleAt(
    R.col && R.col.surface,
    car.x,
    car.z,
    car.y,
    STEP_H,
    car.sampScratch || (car.sampScratch = { height: 0, normal: null }),
  );
  var roadSupport = roadSample && Math.abs(roadSample.height - g) < 0.08;
  // Stay attached while traversing a continuous descending road surface. A
  // lower height in the next triangle is a slope, not the start of a jump.
  // The deliberate gap has no road sample, so it still releases the truck.
  var followsRoad =
    car.grounded !== false &&
    roadSupport &&
    car.vy <= 0 &&
    car.y - g <= STEP_H + 0.4;
  var prevG = car.lastG == null ? g : car.lastG;
  car.lastG = g;
  if (!followsRoad && car.y > g + 0.05) {
    car.grounded = false;
    // just left the ground: a ramp being climbed throws the truck off its lip,
    // so carry the climb rate into the jump instead of dropping like a stone
    if (car.vy === 0 && (car.climb || 0) > 25) car.vy = car.climb;
    car.vy -= GRAV * dt;
    car.y += car.vy * dt;
    if (car.y <= g) {
      // a hard landing off a jump hurts; falling off the circuit does not —
      // Lakitu is already on the way, and charging for it wrecked the truck
      if (car.vy < -180 && !(car.offT > 0)) {
        applyDamage(car, (-car.vy - 180) * 0.12, now);
        if (!car.ai) thud(clamp((-car.vy - 180) / 260, 0.2, 1));
      }
      car.y = g;
      car.vy = 0;
      car.climb = 0;
      car.grounded = true;
      if (car.dead) return;
    }
  } else {
    // a real ramp rises gradually; a one-frame jump is a ledge snap, not lift
    var dg = g - prevG;
    var rate =
      dg > 0.01 && dg < 4
        ? clamp(dg / Math.max(dt, 0.001), 0, Math.abs(car.v) * 1.1)
        : 0;
    // Only a SUSTAINED climb launches. Taking the rate straight from one frame
    // meant any 2cm lip — a seam between two passes of the deck, the lip of a
    // rug — threw the truck into the air the moment the surface dropped again.
    // A kicker is climbed for a dozen frames, so it still reaches full lift.
    if (rate > 0)
      car.climb = (car.climb || 0) + (rate - (car.climb || 0)) * dampingFactor(10, dt);
    else car.climb = (car.climb || 0) * 0.4;
    // A grounded truck belongs ON the physical plane. Easing toward g left it
    // visibly below every rising/banked section for several frames and made
    // each mesh join read as a little hop even when collision never failed.
    car.y = g;
    car.vy = 0;
    car.grounded = true;
  }
  // Match the complete vehicle to the supporting road plane. Previously only
  // its centre height followed the deck, while the group stayed horizontal;
  // on a bank that necessarily buried the downhill wheels/body in the mesh.
  if (car.y <= g + 0.05) {
    if (roadSupport)
      car.surfaceUp = roadSample.normal;
    else car.surfaceUp = UP_FLAT;
  }
  // Lakitu: dropped off the road → fished back onto the circuit. The trigger sits
  // just INSIDE the 12cm tolerance checkWaypoints allows, so a truck stranded on
  // the floor beside a hump or under the spiral — close enough to its gate to
  // keep driving at it, too low to ever pass it — is picked up instead of
  // grinding there for the rest of the race
  var wpT = R.track && R.track.wps[car.next];
  if (wpT && wpT.y - car.y > 9) car.offT = (car.offT || 0) + dt;
  else car.offT = 0;
  // ...and the same for a kart that left the ribbon sideways without dropping —
  // out on the open floor beside the track, or under a flyover. Grounded only,
  // or the gap in the ramp-jump would count as leaving the circuit.
  // ...but never in home mode, where the floor and the furniture ARE the track:
  // there is no ribbon to be off, and fishing a truck out for driving on the
  // living-room floor is the whole complaint this mode answers. The waypoint
  // watchdog below still frees anything genuinely stuck.
  if (
    !R.homeMode &&
    R.race &&
    R.race.state === "run" &&
    now - R.race.t0 > 2000 && // grid grace: no fishing anyone out off the line
    !car.done &&
    car.y <= g + 0.05 &&
    !onRoad(car.x, car.z, car.y)
  )
    car.offRoadT = (car.offRoadT || 0) + dt;
  else car.offRoadT = 0;
  if (car.offRoadT > 1.6) {
    car.offRoadT = 0;
    rescueCar(car);
    if (!car.ai) {
      showMsg("🛟", 900);
      beep(300, 0.12, 0.35);
    }
    return;
  }
  // Backstop: whatever the reason — wedged on a rail, pinned in a corner, lost
  // under the deck — a truck that hasn't reached its gate in 9s gets moved on.
  if (car.wpClock != null && car.wpTgt === car.next) car.wpClock += dt;
  else {
    car.wpTgt = car.next;
    car.wpClock = 0;
  }
  if (car.wpClock > 9 && R.race && R.race.state === "run" && !car.done) {
    rescueCar(car);
    return;
  }
  if (car.offT > 0.5) {
    car.offT = 0;
    rescueCar(car);
    if (!car.ai) {
      showMsg("🛟", 900);
      beep(300, 0.12, 0.35);
    }
    return;
  }
  car.spin += (car.v / WHEEL_R) * dt;
  syncCarMesh(car);
  checkWaypoints(car, now, { x: moveFromX, z: moveFromZ, y: car.y });
}

export { allDone, carPhysics, endRace, finishRace, updateRings };

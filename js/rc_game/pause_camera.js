/* RC game pause menu, timers and camera modes, split out of js/rc_game.js. It
   shares the editor's state through live imports from ../rc_game.js. */
import { t } from "../i18n.js";
import { kartReset } from "../kart.js";
import { editorClose } from "../rc_editor.js";
import { syncCarMesh } from "../rc_game/cars_cameras.js";
import { fmtT, ordinal, showMsg, showPanel, updateHpBar, updateStartLights } from "../rc_game/hud.js";
import { enterCarPhase } from "../rc_game/phases_input.js";
import { endRace } from "../rc_game/race.js";
import { ghostReset } from "../rc_ghost.js";
import { mpActive, mpBoard, mpBroadcastStart } from "../rc_mp.js";
import { AI_COLORS, AI_NAMES, CAR_CLEAR, COLL_R, MAX_HP, PLAYER_COLOR, R, STEP_H, diffCfg, prefsSave } from "../rc_state.js";
import { assembleCar, beep, blockedAt, buildTrack, disposeGrp, engineOff, findFreeSpot, groundAt, kartResetCar, makeCar, onRoad, openAllDoors, tintDamage } from "../rc_world.js";
import { clamp } from "../state.js";
import { getMainScene } from "../view3d.js";
import { PAUSE_STAMPS, UP_FLAT, toggleRC } from "../rc_game.js";

function shiftTimers(ms) {
  R.cars.forEach(function (c) {
    PAUSE_STAMPS.forEach(function (k) {
      if (c[k]) c[k] += ms;
    });
  });
}

export function setPaused(on) {
  if (!R.active) return false;
  var want = !!on;
  if (want === R.paused) return R.paused;
  R.paused = want;
  if (want) {
    R.pauseT = performance.now();
    engineOff();
    showPauseMenu();
  } else {
    var d = performance.now() - (R.pauseT || performance.now());
    if (R.race) {
      R.race.t0 += d;
      if (R.race.lapT0) R.race.lapT0 += d;
      if (R.race.playerDone) R.race.playerDone += d;
    }
    shiftTimers(d);
    R.pauseT = 0;
    R.hud.pause.classList.remove("on");
  }
  return R.paused;
}

function showPauseMenu() {
  var el = R.hud.pause;
  el.replaceChildren();
  var h3 = document.createElement("h3");
  h3.textContent = t("rc_paused");
  el.appendChild(h3);
  [
    ["rc_resume", function () {
      setPaused(false);
    }, true],
    ["rc_restart", function () {
      setPaused(false);
      startRace();
    }, false],
    ["rc_menu", function () {
      setPaused(false);
      endRace();
      showPanel();
    }, false],
    ["rc_quit", function () {
      setPaused(false);
      toggleRC(false);
    }, false],
  ].forEach(function (row) {
    var b = document.createElement("button");
    b.textContent = t(row[0]);
    if (row[2]) b.className = "rc-primary";
    b.addEventListener("click", row[1]);
    el.appendChild(b);
  });
  el.classList.add("on");
}

function setCamMode(m) {
  R.camMode = m;
  R.cam.pos = null; // a new vantage point should cut, not swoop across the room
  prefsSave();
  showMsg(t("rc_cam_" + m), 1100);
}
function cycleCam() {
  var order = ["chase", "hood", "cockpit"];
  setCamMode(order[(order.indexOf(R.camMode) + 1) % order.length]);
}

function showResults() {
  var el = R.hud.results;
  // finishers by time, then everyone still out there by track progress
  var order = R.cars.slice().sort(function (a, b) {
    if (a.done !== b.done) return a.done ? -1 : 1;
    if (a.done) return a.finT - b.finT;
    return (b.prog || 0) - (a.prog || 0);
  });
  // friends racing the same circuit are ranked in by their reported time
  mpBoard().forEach(function (peer) {
    if (peer.ms == null) return;
    var row = { name: peer.name, done: true, finT: peer.ms, peer: true, ai: true };
    var at = order.findIndex(function (c) {
      return !c.done || c.finT > peer.ms;
    });
    if (at < 0) order.push(row);
    else order.splice(at, 0, row);
  });
  var myPlace = order.indexOf(playerCar()) + 1;
  el.replaceChildren();
  const h3 = document.createElement("h3");
  h3.textContent = t("rc_results");
  el.appendChild(h3);
  if (myPlace > 0 && R.cars.length > 1) {
    const place = document.createElement("div");
    place.className = "rc-res-place";
    place.textContent = ordinal(myPlace);
    el.appendChild(place);
  }
  order.forEach(function (c, i) {
    // AI names are fixed constants, peer names come off the relay; the player
    // row uses i18n. All of them go in as textContent so a name can never
    // introduce markup.
    var nm = c.ai ? c.name : t("rc_you");
    var medal = i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "";
    var row = document.createElement("div");
    row.className = "rc-res-row" + (c.ai ? "" : " me");
    var left = document.createElement("span");
    left.textContent = medal + (i + 1) + ". " + nm + (c.coins ? " ◉" + c.coins : "");
    var right = document.createElement("span");
    right.textContent = c.done ? fmtT(c.finT) : "—";
    row.append(left, right);
    el.appendChild(row);
  });
  // every lap the player drove, fastest one marked — the part of a result you
  // actually learn something from
  var laps = (R.race && R.race.lapTimes) || [];
  if (laps.length) {
    var fastest = Math.min.apply(null, laps);
    var box = document.createElement("div");
    box.className = "rc-res-laps";
    laps.forEach(function (ms, i) {
      var lr = document.createElement("div");
      lr.className = "rc-res-lap" + (ms === fastest ? " fast" : "");
      var a = document.createElement("span");
      a.textContent = t("rc_lap") + " " + (i + 1);
      var b = document.createElement("span");
      b.textContent = (ms === fastest ? "⚡ " : "") + fmtT(ms);
      lr.append(a, b);
      box.appendChild(lr);
    });
    el.appendChild(box);
  }
  if (R.race && R.race.earned) {
    var bank = document.createElement("div");
    bank.className = "rc-bank";
    bank.textContent = "◉ +" + R.race.earned + " → " + R.bank + " " + t("rc_bank");
    el.appendChild(bank);
  }
  const again = document.createElement("button");
  again.id = "rcAgain";
  again.className = "rc-primary";
  again.textContent = t("rc_restart");
  again.addEventListener("click", function () {
    el.classList.remove("on");
    startRace();
  });
  const menu = document.createElement("button");
  menu.id = "rcMenu";
  menu.textContent = t("rc_menu");
  menu.addEventListener("click", function () {
    el.classList.remove("on");
    endRace();
    showPanel();
  });
  el.append(again, menu);
  el.classList.add("on");
}

// starter definition for the modeler "design your truck" flow (modeler frame:
// x = width, z = depth/length, floor y = 0). Wheels are added by the RC mode
// and the whole body is scaled to micro size, so design at comfortable cm.
function starterTruckDef() {
  var id = 1;
  function part(p) {
    p.id = "rcp" + id++;
    return p;
  }
  return {
    key: "cm_rc_" + Date.now().toString(36),
    name: t("rc_truck_name"),
    price: 0,
    col: "#f2b23a",
    w: 20,
    d: 36,
    h: 16,
    parts: [
      part({ kind: "box", name: "chassis", x0: -8, x1: 8, y0: 0, y1: 3, z0: -16, z1: 14, color: "#33373d", rough: 0.6, metal: 0.4 }),
      part({ kind: "box", name: "body", x0: -9, x1: 9, y0: 3, y1: 7.5, z0: -16, z1: 16, color: "#f2b23a", rough: 0.35, metal: 0.2 }),
      part({ kind: "box", name: "cab", x0: -8, x1: 8, y0: 7.5, y1: 13, z0: -7, z1: 5, color: "#f2b23a", rough: 0.35, metal: 0.2 }),
      part({ kind: "box", name: "windshield", x0: -7, x1: 7, y0: 8, y1: 12.5, z0: 5, z1: 5.8, color: "#9fc6e0", rough: 0.08, metal: 0.6 }),
      part({ kind: "box", name: "spoiler", x0: -8, x1: 8, y0: 12, y1: 13.5, z0: -16, z1: -14.5, color: "#33373d", rough: 0.5, metal: 0.3 }),
    ],
  };
}

// ---- race flow --------------------------------------------------------------
function playerCar() {
  for (var i = 0; i < R.cars.length; i++) if (!R.cars[i].ai) return R.cars[i];
  return null;
}

function clearCars(keepPlayer) {
  R.cars = R.cars.filter(function (c) {
    if (keepPlayer && !c.ai) return true;
    getMainScene().remove(c.grp);
    disposeGrp(c.grp);
    return false;
  });
}

// Where on the dense centreline the start gate sits. The grid is laid out on
// the centreline itself, walking BACKWARDS along it — a straight line drawn
// back from wps[0] leaves the deck the moment the start is on a bend, which is
// what put trucks on the bare floor and had Lakitu fish them out on lap 1.
function centerIndexNear(x, z) {
  var C = R.track && R.track.center;
  if (!C || !C.length) return -1;
  var best = -1,
    bd = Infinity;
  for (var i = 0; i < C.length; i++) {
    var dx = C[i].x - x,
      dz = C[i].z - z,
      d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// Follow the centreline back `dist` cm from sample `i0` (closed loop).
function centerBack(i0, dist) {
  var C = R.track.center,
    n = C.length,
    i = i0,
    walked = 0;
  while (walked < dist) {
    var j = (i - 1 + n) % n;
    walked += Math.hypot(C[i].x - C[j].x, C[i].z - C[j].z);
    i = j;
    if (i === i0) break;
  }
  return C[i];
}

function gridPlace(car, idx, total) {
  if (!R.track || R.track.wps.length < 2) return;
  var wps = R.track.wps;
  var a = wps[0],
    b = wps[1];
  var dx = b.x - a.x,
    dz = b.z - a.z,
    dl = Math.hypot(dx, dz) || 1;
  var px = -dz / dl,
    pz = dx / dl;
  var off = (idx - (total - 1) / 2) * 7;
  var gx = a.x + px * off - (dx / dl) * 6,
    gz = a.z + pz * off - (dz / dl) * 6,
    gy = null,
    heading = Math.atan2(dx, dz);
  // Preferred layout: two columns on the centreline, staggered back one row per
  // pair, with the lateral offset kept well inside the deck's half width.
  var ci = centerIndexNear(a.x, a.z);
  if (ci >= 0) {
    var row = Math.floor(idx / 2),
      col = idx % 2 ? 1 : -1;
    var p = centerBack(ci, 8 + row * 9);
    var lat = Math.min(R.roadWidth * 0.25, 5) * (total > 1 ? col : 0);
    var ux = p.ux != null ? p.ux : dx / dl,
      uz = p.uz != null ? p.uz : dz / dl;
    var nx = -uz,
      nz = ux;
    gx = p.x + nx * lat;
    gz = p.z + nz * lat;
    gy = p.y != null ? p.y : null;
    heading = Math.atan2(ux, uz);
    // last guard: if the offset spot isn't over the deck, sit dead centre
    if (!R.homeMode && !onRoad(gx, gz, gy != null ? gy : 0)) {
      gx = p.x;
      gz = p.z;
    }
  }
  // findFreeSpot spirals out of furniture, which can walk a truck off the deck —
  // only accept its answer when the grid spot is genuinely obstructed.
  var spot = { x: gx, z: gz };
  if (blockedAt(gx, gz, COLL_R + 0.5, gy != null ? gy : 0, CAR_CLEAR, STEP_H)) {
    var free = findFreeSpot(gx, gz, COLL_R);
    // home mode has no deck to be walked off — clear floor is always a better
    // grid slot than the inside of a sideboard
    if (R.homeMode || onRoad(free.x, free.z, gy != null ? gy : 0)) spot = free;
  }
  car.x = spot.x;
  car.z = spot.z;
  car.y = groundAt(spot.x, spot.z, gy != null ? gy + STEP_H : 0, STEP_H);
  car.vy = 0;
  car.surfaceUp = UP_FLAT;
  car.grounded = true;
  car.heading = heading;
  car.v = 0;
  car.steer = 0;
  car.throttle = 0;
  // stale watchdog state from the previous race would otherwise fire Lakitu in
  // the first seconds of this one
  car.offRoadT = 0;
  car.offT = 0;
  car.wpClock = 0;
  car.wpTgt = 1;
  car.next = 1;
  car.lap = 1;
  car.done = false;
  car.finT = 0;
  kartResetCar(car);
  car.place = idx + 1;
  if (car.dead) {
    car.dead = false;
    car.hp = MAX_HP;
    assembleCar(car);
  } else {
    car.hp = MAX_HP;
    tintDamage(car);
  }
  syncCarMesh(car);
}

// Per-gate splits of the best lap. A delta needs something to be a delta
// against, and the gates are the only checkpoints both laps are guaranteed to
// share — times at fixed wall-clock offsets would compare different corners.
function splitsKey() {
  return R.track ? R.track.sig + "_sp" : "";
}
function loadSplits() {
  try {
    var raw = localStorage.getItem(splitsKey());
    var a = raw ? JSON.parse(raw) : null;
    return Array.isArray(a) ? a : null;
  } catch (e) {
    return null;
  }
}
function saveSplits(a) {
  try {
    localStorage.setItem(splitsKey(), JSON.stringify(a));
  } catch (e) {}
}

// `o` carries a remote start: {laps, mode, inMs, remote} when a friend on the
// relay dropped the flag (js/rc_mp.js), otherwise everything comes from prefs.
function startRace(o) {
  o = o || {};
  editorClose(); // no handles in the way once the flag drops
  setPaused(false);
  if (!R.track) buildTrack();
  if (!R.track) { showPanel(); showMsg(t("rc_course_failed"), 5000); return; }
  clearCars(true);
  var trial = (o.mode || R.mode) === "trial";
  if (o.laps) R.laps = clamp(o.laps, 1, 9);
  var pc = playerCar();
  if (!pc) {
    pc = makeCar({ color: PLAYER_COLOR });
    R.cars.push(pc);
  }
  var d = diffCfg();
  // Time trial is you, the clock and your own ghost — no grid, no items being
  // thrown at the lap you are trying to set.
  if (!trial)
    for (var i = 0; i < R.opp; i++) {
      R.cars.push(
        makeCar({
          ai: true,
          name: AI_NAMES[i % AI_NAMES.length],
          color: AI_COLORS[i % AI_COLORS.length],
          aiSkill: d.skill + i * d.step,
          aiItems: d.items,
          aiLook: d.look,
          aiLane: ((i % 3) - 1) * 5.4,
        }),
      );
    }
  R.cars.forEach(function (c, i) {
    gridPlace(c, i, R.cars.length);
  });
  if (R.phase === "foot") enterCarPhase(pc);
  openAllDoors();
  kartReset(); // fresh item boxes, no shells left over from the last race
  var countIn = o.inMs != null ? Math.max(600, o.inMs) : 3000;
  R.race = {
    state: "count",
    mode: trial ? "trial" : "race",
    t0: performance.now() + countIn,
    results: false,
    armed: false,
    rocket: false,
    lapT0: 0, // when the player's current lap started
    lapTimes: [], // one entry per completed lap
    splits: [], // gate times of the lap being driven
    bestSplits: loadSplits(), // …and of the best lap ever set here
    delta: null, // last gate's delta, shown in the HUD
    deltaT: 0,
    playerDone: 0, // when the player crossed — bots keep racing after
    earned: 0,
    remote: !!o.remote,
  };
  ghostReset();
  if (!o.remote && mpActive()) mpBroadcastStart(countIn, R.laps, R.race.mode);
  beep(440, 0.15, 0.4);
  R.hud.results.classList.remove("on");
  R.hud.wait.classList.remove("on");
  R.hud.splits.classList.remove("on");
  if (R.hud.gap) R.hud.gap.classList.remove("on");
  if (R.hud.warn) R.hud.warn.classList.remove("on");
  updateStartLights(null);
  R.cam.results = null;
  updateHpBar();
}

export {
  centerIndexNear, clearCars, cycleCam, gridPlace, playerCar, saveSplits,
  setCamMode, showResults, startRace, starterTruckDef,
};

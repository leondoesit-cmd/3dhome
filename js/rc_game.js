/* Micro-RC gameplay: HUD, race flow, simulation, input, mode toggle. */
import * as THREE from "three";
import { S, clamp, fin } from "./state.js";
import { detectRooms, roomHidden } from "./geometry.js";
import { FURN } from "./furniture.js";
import { openModeler } from "./modeler.js";
import { surfaceHeightNear, surfaceSampleAt } from "./road_surface.js";
import { t } from "./i18n.js";
import { dampingFactor, forEachPhysicsStep, safeDeltaSeconds } from "./physics_runtime.js";
import {
  kartInit,
  kartBuild,
  kartReset,
  kartTick,
  kartUse,
  kartSlot,
  kartSpark,
  kartSetOn,
  kartIsOn,
} from "./kart.js";
import {
  editorInit,
  editorOpen,
  editorClose,
  editorActive,
  editorTick,
  editorPointerDown,
  editorPointerMove,
  editorPointerUp,
  editorContext,
} from "./rc_editor.js";
import {
  has3D,
  ensureBuilt,
  getMainScene,
  getMainCamera,
  setExternalTick,
  orbitRefresh,
  toggleWalk,
  isWalk,
} from "./view3d.js";
import {
  ACC,
  AI_COLORS,
  AI_NAMES,
  BOOST_MULT,
  BRAKE,
  CAR_CLEAR,
  COIN_MULT,
  COLL_R,
  DRAG,
  DRIFT_BOOST,
  DRIFT_MIN_V,
  DRIFT_TIER,
  FIG_STEP,
  FOOT_CLEAR,
  FOOT_R,
  FOOT_RUN,
  FOOT_SPD,
  GRAV,
  HOP_MS,
  MAXV,
  MAX_HP,
  PASS_R,
  PASS_R_AI,
  PASS_R_MINOR,
  MAX_OPP,
  PLAYER_COLOR,
  R,
  REV_MAX,
  ROCKET_MS,
  ROCKET_WIN,
  SMALL_MULT,
  STALL_MS,
  STAR_MULT,
  STEP_H,
  TURN_MAX,
  DRAFT_MULT,
  DRAFT_DIST,
  WATER_MAXV,
  WATER_SINK,
  WHEEL_R,
  WRECK_RESPAWN_MS,
  applyPhysicsConfig,
  bankAdd,
  customAnchors,
  diffCfg,
  hooks,
  planSig,
  prefsLoad,
  prefsSave,
  tuneLoad,
  tuneStore,
} from "./rc_state.js";
import { miniInit, miniSetOn, miniSync, miniTick } from "./rc_minimap.js";
import {
  ghostClear,
  ghostFinishLap,
  ghostHas,
  ghostInit,
  ghostRecord,
  ghostReset,
  ghostStartLap,
  ghostTick,
  ghostTime,
} from "./rc_ghost.js";
import {
  mpActive,
  mpAvailable,
  mpBoard,
  mpBroadcastStart,
  mpDispose,
  mpEnable,
  mpFinish,
  mpInit,
  mpPeerCount,
  mpTick,
} from "./rc_mp.js";
import {
  applyDamage,
  assembleCar,
  audio,
  beep,
  bestLap,
  bestTime,
  blockedAt,
  buildColModel,
  buildTrack,
  clearTrack,
  colHardHit,
  collideCircle,
  moveCircle,
  disposeGrp,
  engineOff,
  engineTick,
  fig8Anchors,
  findFreeSpot,
  groundAt,
  inTrackGap,
  kartResetCar,
  makeCar,
  makeFig,
  onRoad,
  openAllDoors,
  ovalAnchors,
  respawnCar,
  restoreDoors,
  routeAllRooms,
  rumbleTick,
  saveBestLap,
  saveBestTime,
  setVolume,
  skidTick,
  spraySpawn,
  sting,
  thud,
  stepShards,
  stepSpray,
  swapPlayerBody,
  tintDamage,
  waterAt,
  waterClickPlace,
  watersClear,
  watersLoad,
} from "./rc_world.js";

export function rcDebug() {
  return {
    R: R,
    groundAt: groundAt,
    tick: tick,
    rescue: rescueCar,
    inTrackGap: inTrackGap,
    setPaused: setPaused,
    startRace: startRace,
    finishRace: finishRace,
    setCamMode: setCamMode,
  };
}
if (typeof window !== "undefined") window.rcDebug = rcDebug;

// ---- HUD --------------------------------------------------------------------
function buildHud() {
  if (R.hud) return;
  var host = document.getElementById("view-3d");
  var el = document.createElement("div");
  el.id = "rcHud";
  el.innerHTML =
    '<div id="rcTop"><span id="rcLap"></span><span id="rcTime"></span>' +
    '<span id="rcLapT"></span><span id="rcDelta"></span><span id="rcBest"></span></div>' +
    '<div id="rcSplits"></div>' +
    '<div id="rcLights" aria-hidden="true"><i></i><i></i><i></i></div>' +
    '<div id="rcMsg"></div>' +
    '<div id="rcWarn"></div>' +
    '<div id="rcSpeed"></div>' +
    '<div id="rcHp"><div id="rcHpFill"></div></div>' +
    '<div id="rcItem"><span id="rcItemIcon"></span><span id="rcItemN"></span></div>' +
    '<div id="rcCoins"><span class="rc-coin">◉</span><span id="rcCoinN">0</span></div>' +
    '<div id="rcPos"><span id="rcPosN"></span><span id="rcPosOf"></span></div>' +
    '<div id="rcGap"><span id="rcGapA"></span><span id="rcGapB"></span></div>' +
    '<div id="rcFlash"></div>' +
    '<div id="rcHint"></div>' +
    '<div id="rcTouch" aria-label="' + t("rc_touch_controls") + '">' +
    '<div class="rc-touch-steer"><button data-hold="left" aria-label="' + t("left") + '">◀</button>' +
    '<button data-hold="drift" class="rc-touch-drift" aria-label="' + t("rc_drift") + '">⚡</button>' +
    '<button data-hold="right" aria-label="' + t("right") + '">▶</button></div>' +
    '<div class="rc-touch-actions"><button data-action="rescue" aria-label="' + t("rc_rescue") + '">↻</button>' +
    '<button data-hold="look" class="rc-touch-look" aria-label="' + t("rc_look") + '">↺</button>' +
    '<button data-action="item" class="rc-touch-item" aria-label="' + t("rc_use_item") + '">🎁</button>' +
    '<button data-hold="back" aria-label="' + t("rc_brake") + '">▼</button>' +
    '<button data-hold="fwd" class="rc-touch-gas" aria-label="' + t("rc_accelerate") + '">▲</button></div></div>' +
    '<div id="rcWait"><span></span><button id="rcSkip"></button></div>' +
    '<div id="rcPanel"></div>' +
    '<div id="rcPause"></div>' +
    '<div id="rcResults"></div>';
  host.appendChild(el);
  R.hud = {
    root: el,
    lap: el.querySelector("#rcLap"),
    time: el.querySelector("#rcTime"),
    lapT: el.querySelector("#rcLapT"),
    delta: el.querySelector("#rcDelta"),
    splits: el.querySelector("#rcSplits"),
    lights: el.querySelector("#rcLights"),
    warn: el.querySelector("#rcWarn"),
    gap: el.querySelector("#rcGap"),
    gapA: el.querySelector("#rcGapA"),
    gapB: el.querySelector("#rcGapB"),
    wait: el.querySelector("#rcWait"),
    waitTxt: el.querySelector("#rcWait span"),
    skip: el.querySelector("#rcSkip"),
    pause: el.querySelector("#rcPause"),
    best: el.querySelector("#rcBest"),
    msg: el.querySelector("#rcMsg"),
    speed: el.querySelector("#rcSpeed"),
    hp: el.querySelector("#rcHp"),
    hpFill: el.querySelector("#rcHpFill"),
    item: el.querySelector("#rcItem"),
    itemIcon: el.querySelector("#rcItemIcon"),
    itemN: el.querySelector("#rcItemN"),
    coins: el.querySelector("#rcCoins"),
    coinN: el.querySelector("#rcCoinN"),
    pos: el.querySelector("#rcPos"),
    posN: el.querySelector("#rcPosN"),
    posOf: el.querySelector("#rcPosOf"),
    flash: el.querySelector("#rcFlash"),
    hint: el.querySelector("#rcHint"),
    touch: el.querySelector("#rcTouch"),
    panel: el.querySelector("#rcPanel"),
    results: el.querySelector("#rcResults"),
  };
  R.hud.skip.textContent = t("rc_skip");
  R.hud.skip.addEventListener("click", function () {
    finishRace(performance.now(), true);
  });
  miniInit(el);
  miniSetOn(R.minimap);
  bindTouchControls();
}

function bindTouchControls() {
  if (!R.hud || !R.hud.touch || R.hud.touch.dataset.bound) return;
  const root = R.hud.touch;
  root.dataset.bound = "1";
  root.querySelectorAll("[data-hold]").forEach(function (btn) {
    const key = btn.dataset.hold;
    const release = function () {
      R.touch[key] = false;
      btn.classList.remove("pressed");
    };
    btn.addEventListener("pointerdown", function (e) {
      R.touch[key] = true;
      btn.classList.add("pressed");
      btn.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  });
  root.querySelector('[data-action="item"]').addEventListener("pointerdown", function (e) {
    const pc = playerCar();
    if (R.phase === "drive" && pc) kartUse(pc, performance.now(), !!R.touch.back);
    e.preventDefault();
  });
  root.querySelector('[data-action="rescue"]').addEventListener("pointerdown", function (e) {
    if (R.phase === "drive") rescueCar(playerCar());
    e.preventDefault();
  });
}

// white-out pulse when the player is hit / lightning strikes
function hudFlash(strength) {
  if (!R.hud) return;
  var f = R.hud.flash;
  f.style.setProperty("--rcf", String(clamp(strength || 0.6, 0, 1) * 0.7));
  f.classList.remove("on");
  void f.offsetWidth; // restart the fade
  f.classList.add("on");
}

// 1st / 2nd / 3rd… by lap, gate and distance to the next gate
function updatePlaces() {
  var wps = R.track && R.track.wps;
  R.cars.forEach(function (c) {
    if (c.done) {
      c.prog = 1e9 - c.finT;
      return;
    }
    var d = 0;
    if (wps && wps[c.next])
      d = Math.hypot(c.x - wps[c.next].x, c.z - wps[c.next].z);
    c.prog = c.lap * 100000 + c.next * 1000 - Math.min(999, d);
  });
  R.cars
    .slice()
    .sort(function (a, b) {
      return b.prog - a.prog;
    })
    .forEach(function (c, i) {
      c.place = i + 1;
    });
}
function ordinal(n) {
  var s = t("rc_ord" + n);
  return s.indexOf("rc_ord") === 0 ? String(n) : s; // t() echoes missing keys
}
function updateHpBar() {
  var pc = playerCar();
  if (!R.hud || !pc) return;
  var f = clamp(pc.hp / MAX_HP, 0, 1);
  R.hud.hpFill.style.width = f * 100 + "%";
  R.hud.hpFill.style.background =
    f > 0.5 ? "#53b06a" : f > 0.25 ? "#e0a63d" : "#d94f3d";
}
function showMsg(txt, ms) {
  R.hud.msg.textContent = txt;
  R.hud.msg.classList.add("on");
  R.msgT = performance.now() + (ms || 1400);
}
function fmtT(ms) {
  var s = Math.floor(ms / 1000),
    m = Math.floor(s / 60);
  return m + ":" + ("0" + (s % 60)).slice(-2) + "." + Math.floor((ms % 1000) / 100);
}
// A gap of a tenth is meaningful on a 40-second indoor lap, so deltas get two
// decimals where the running clock only needs one.
function fmtDelta(ms) {
  return (ms <= 0 ? "−" : "+") + (Math.abs(ms) / 1000).toFixed(2);
}

// Distance along the circuit from the start/finish, plus completed laps.
// Rival gaps and the wrong-way test both need a number that means "how far
// around" rather than Euclidean distance across the living room.
function ensurePref() {
  var wps = R.track && R.track.wps;
  if (!wps || !wps.length) return null;
  if (R.track.pref && R.track.pref.length === wps.length + 1) return R.track.pref;
  var pref = [0];
  for (var i = 0; i < wps.length; i++) {
    var a = wps[i],
      b = wps[(i + 1) % wps.length];
    pref.push(pref[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  R.track.pref = pref;
  R.track.lapLen = pref[wps.length];
  return pref;
}
function pathPos(car) {
  var wps = R.track && R.track.wps;
  var pref = ensurePref();
  if (!wps || !pref || !car) return 0;
  var n = wps.length,
    k = ((car.next % n) + n) % n;
  var toGo = Math.hypot(car.x - wps[k].x, car.z - wps[k].z);
  var along = pref[k] - toGo;
  if (along < -pref[n] * 0.5) along += pref[n];
  return Math.max(0, (car.lap || 1) - 1) * pref[n] + along;
}

// 0..1: how fully this truck sits in another truck's wake (dead ahead, close).
function draftFactor(car) {
  var best = 0;
  if (!car || car.dead) return 0;
  var fx = Math.sin(car.heading),
    fz = Math.cos(car.heading);
  for (var i = 0; i < R.cars.length; i++) {
    var o = R.cars[i];
    if (o === car || o.dead || o.done) continue;
    if (Math.abs((o.y || 0) - (car.y || 0)) > 4) continue;
    var dx = o.x - car.x,
      dz = o.z - car.z,
      d = Math.hypot(dx, dz);
    if (d < 3.6 || d > DRAFT_DIST) continue;
    var along = (dx * fx + dz * fz) / d;
    if (along < 0.72) continue;
    var close = 1 - (d - 3.6) / (DRAFT_DIST - 3.6);
    best = Math.max(best, close * along);
  }
  return best;
}

function updateStartLights(left) {
  var el = R.hud && R.hud.lights;
  if (!el) return;
  if (left == null) {
    el.className = "";
    el.removeAttribute("data-lit");
    return;
  }
  if (left <= 0) {
    el.className = "on go";
    el.dataset.lit = "3";
    return;
  }
  el.className = "on";
  var n = Math.ceil(left / 1000);
  el.dataset.lit = String(clamp(4 - n, 0, 3));
}

function updateGaps(pc) {
  var hud = R.hud;
  if (!hud || !hud.gap) return;
  var racing = !!(R.race && R.race.state === "run" && pc && !pc.done && R.cars.length > 1);
  hud.gap.classList.toggle("on", racing);
  if (!racing) return;
  var me = pathPos(pc),
    ahead = null,
    behind = null,
    aPos = 1e12,
    bPos = -1e12;
  for (var i = 0; i < R.cars.length; i++) {
    var c = R.cars[i];
    if (c === pc || c.dead) continue;
    var p = pathPos(c);
    if (p > me && p < aPos) {
      aPos = p;
      ahead = c;
    }
    if (p < me && p > bPos) {
      bPos = p;
      behind = c;
    }
  }
  var spd = Math.max(22, Math.abs(pc.v));
  hud.gapA.textContent = ahead
    ? "▲ " + (ahead.ai ? ahead.name : t("rc_you")) + " " + (Math.abs(aPos - me) / spd).toFixed(2)
    : "";
  hud.gapB.textContent = behind
    ? "▼ " + (behind.ai ? behind.name : t("rc_you")) + " " + (Math.abs(me - bPos) / spd).toFixed(2)
    : "";
}

function updateWrongWay(pc) {
  var hud = R.hud;
  if (!hud || !hud.warn) return;
  var wps = R.track && R.track.wps;
  var racing = !!(R.race && R.race.state === "run" && pc && !pc.done && wps && wps.length);
  var wrong = false;
  if (racing && Math.abs(pc.v) > 10) {
    var tgt = wps[pc.next];
    if (tgt) {
      var want = Math.atan2(tgt.x - pc.x, tgt.z - pc.z);
      var diff = want - pc.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      wrong = Math.abs(diff) > 2.05;
    }
  }
  hud.warn.classList.toggle("on", wrong);
  if (wrong) hud.warn.textContent = t("rc_wrong_way");
}

function updateSplitsHud(idx) {
  var hud = R.hud,
    race = R.race;
  if (!hud || !hud.splits || !race) return;
  var ms = race.splits[idx];
  if (!(ms > 0)) return;
  hud.splits.classList.add("on");
  var ref = race.bestSplits && race.bestSplits[idx];
  var delta = ref > 0 ? ms - ref : null;
  hud.splits.textContent =
    "S" +
    (idx + 1) +
    " " +
    fmtT(ms) +
    (delta == null ? "" : "  " + fmtDelta(delta));
  hud.splits.className = "on" + (delta == null ? "" : delta <= 0 ? " rc-up" : " rc-down");
}

// how long the bots get to finish after the player crosses the line
var FINISH_GRACE_MS = 15000;

// Current-lap clock, the record to beat, and the running delta against that
// record measured at the last gate both laps passed through.
function updateLapHud(now, pc) {
  var race = R.race,
    hud = R.hud;
  var bLap = bestLap(),
    bTot = bestTime();
  hud.best.textContent = bLap
    ? t("rc_best_lap") + " " + fmtT(bLap)
    : bTot
      ? t("rc_best") + " " + fmtT(bTot)
      : "";
  if (!race || race.state !== "run" || !pc || pc.done || !race.lapT0) {
    hud.lapT.textContent = "";
    hud.delta.textContent = "";
    if (hud.splits) hud.splits.classList.remove("on");
    return;
  }
  hud.lapT.textContent = "⏱ " + fmtT(Math.max(0, now - race.lapT0));
  if (race.delta != null && now < race.deltaT) {
    hud.delta.textContent = fmtDelta(race.delta);
    hud.delta.className = race.delta <= 0 ? "rc-up" : "rc-down";
  } else hud.delta.textContent = "";
}

function truckOptions(sel) {
  sel.innerHTML = "";
  var o = document.createElement("option");
  o.value = "";
  o.textContent = t("rc_default_truck");
  sel.appendChild(o);
  for (var k in FURN) {
    if (!FURN[k].custom) continue;
    var op = document.createElement("option");
    op.value = k;
    op.textContent = FURN[k].label;
    sel.appendChild(op);
  }
  sel.value = FURN[R.truckKey] ? R.truckKey : "";
}

function opts(list, cur) {
  return list
    .map(function (o) {
      return (
        '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? " selected" : "") +
        ">" + o[1] + "</option>"
      );
    })
    .join("");
}

function showPanel() {
  var p = R.hud.panel;
  p.classList.add("on");
  var best = bestTime(),
    bLap = bestLap(),
    trial = R.mode === "trial";
  p.innerHTML =
    "<h3><i class='ph ph-car-profile'></i> " + t("rc_title") + "</h3>" +
    '<div class="rc-row rc-modes"><button id="rcModeRace"' +
    (trial ? "" : ' class="active"') + ">🏁 " + t("rc_mode_race") + "</button>" +
    '<button id="rcModeTrial"' + (trial ? ' class="active"' : "") +
    ">⏱️ " + t("rc_mode_trial") + "</button></div>" +
    '<label>' + t("rc_truck") + '</label>' +
    '<div class="rc-row"><select id="rcTruckSel"></select>' +
    '<button id="rcDesign" title="' + t("rc_design") + '"><i class="ph ph-wrench"></i></button></div>' +
    '<div class="rc-row"' + (trial ? ' style="display:none"' : "") +
    '><label>' + t("rc_opponents") + '</label><select id="rcOpp">' +
    opts(
      Array.from({ length: MAX_OPP + 1 }, function (_, n) {
        return [n, n];
      }),
      R.opp,
    ) +
    '</select><label>' + t("rc_laps") + '</label><select id="rcLaps">' +
    opts([[1, 1], [2, 2], [3, 3], [5, 5], [7, 7]], R.laps) +
    "</select></div>" +
    '<div class="rc-row"' + (trial ? ' style="display:none"' : "") +
    '><label>' + t("rc_difficulty") + '</label><select id="rcDiff">' +
    opts(
      [["easy", t("rc_diff_easy")], ["normal", t("rc_diff_normal")], ["hard", t("rc_diff_hard")]],
      R.difficulty,
    ) +
    "</select></div>" +
    '<div class="rc-row"><button id="rcItems"' +
    (kartIsOn() ? ' class="active"' : "") +
    '>🎁 ' + t("rc_items") + "</button>" +
    '<button id="rcWalls"' +
    (R.walls ? ' class="active"' : "") +
    '>🚧 ' + t("rc_walls") + "</button></div>" +
    '<div class="rc-row"><button id="rcHome"' +
    (R.homeMode ? ' class="active"' : "") +
    ' title="' + t("rc_home_hint") + '">🏠 ' + t("rc_home") + "</button></div>" +
    '<div class="rc-row"><label>' + t("rc_camera") + '</label><select id="rcCam">' +
    opts(
      [["chase", t("rc_cam_chase")], ["hood", t("rc_cam_hood")], ["cockpit", t("rc_cam_cockpit")]],
      R.camMode,
    ) +
    "</select></div>" +
    // NOT id="rcMini" — that is the minimap element itself, and its
    // `display:none` rule would hide this button too
    '<div class="rc-row"><button id="rcMiniBtn"' +
    (R.minimap ? ' class="active"' : "") + ">🗺️ " + t("rc_minimap") + "</button>" +
    '<button id="rcGhost"' + (R.ghostOn ? ' class="active"' : "") +
    ">👻 " + t("rc_ghost") + "</button></div>" +
    '<div class="rc-row"><label>🔊</label><input id="rcVol" type="range" min="0" max="100" value="' +
    Math.round(R.volume * 100) + '"></div>' +
    (mpAvailable()
      ? '<div class="rc-row"><button id="rcMp"' + (mpActive() ? ' class="active"' : "") +
        ">🌐 " + t("rc_multiplayer") + " (" + mpPeerCount() + ")</button></div>"
      : "") +
    '<label>' + t("rc_builder") + '</label>' +
    '<div class="rc-row"><button id="rcEditorBtn" class="rc-primary">🛣️ ' + t("rc_editor") + '</button>' +
    '<button id="rcWater"' +
    (R.waterTool ? ' class="active"' : "") +
    '>💧 ' + t("rc_water") + "</button></div>" +
    (best ? '<div class="rc-best">' + t("rc_best") + " " + fmtT(best) + "</div>" : "") +
    (bLap ? '<div class="rc-best">' + t("rc_best_lap") + " " + fmtT(bLap) +
      (ghostHas() ? " 👻" : "") + "</div>" : "") +
    '<div class="rc-bank">◉ ' + R.bank + " " + t("rc_bank") + "</div>" +
    '<button id="rcStart" class="rc-primary"><i class="ph ph-flag-checkered"></i> ' +
    (trial ? t("rc_start_trial") : t("rc_start")) + "</button>" +
    '<div class="rc-row"><button id="rcFree">' + t("rc_free") + "</button>" +
    '<button id="rcQuit">' + t("rc_quit") + "</button></div>";
  function mode(m) {
    R.mode = m;
    prefsSave();
    showPanel();
  }
  p.querySelector("#rcModeRace").addEventListener("click", function () {
    mode("race");
  });
  p.querySelector("#rcModeTrial").addEventListener("click", function () {
    mode("trial");
  });
  p.querySelector("#rcDiff") &&
    p.querySelector("#rcDiff").addEventListener("change", function (e) {
      R.difficulty = e.target.value;
      prefsSave();
    });
  p.querySelector("#rcCam").addEventListener("change", function (e) {
    setCamMode(e.target.value);
  });
  p.querySelector("#rcMiniBtn").addEventListener("click", function (e) {
    R.minimap = !R.minimap;
    e.target.classList.toggle("active", R.minimap);
    miniSetOn(R.minimap);
    prefsSave();
  });
  p.querySelector("#rcGhost").addEventListener("click", function (e) {
    R.ghostOn = !R.ghostOn;
    e.target.classList.toggle("active", R.ghostOn);
    prefsSave();
  });
  p.querySelector("#rcVol").addEventListener("input", function (e) {
    setVolume((parseInt(e.target.value, 10) || 0) / 100);
    prefsSave();
  });
  var mpBtn = p.querySelector("#rcMp");
  if (mpBtn)
    mpBtn.addEventListener("click", function () {
      var on = mpEnable(!mpActive());
      showMsg(on ? t("rc_mp_on") : t("rc_mp_off"), 1800);
      showPanel();
    });
  var sel = p.querySelector("#rcTruckSel");
  truckOptions(sel);
  sel.addEventListener("mousedown", function () {
    truckOptions(sel); // pick up trucks designed since the panel opened
  });
  p.querySelector("#rcEditorBtn").addEventListener("click", function () {
    hidePanel();
    R.waterTool = false;
    editorOpen();
  });
  sel.addEventListener("change", function () {
    // the setup you dialled for the truck you were driving stays with it
    tuneStore();
    R.truckKey = sel.value;
    tuneLoad();
    prefsSave();
    var pc = playerCar();
    if (pc && !pc.dead) swapPlayerBody(pc);
  });
  p.querySelector("#rcDesign").addEventListener("click", function () {
    openModeler(null, starterTruckDef());
  });
  p.querySelector("#rcOpp").addEventListener("change", function (e) {
    R.opp = parseInt(e.target.value, 10) || 0;
    prefsSave();
  });
  p.querySelector("#rcLaps").addEventListener("change", function (e) {
    R.laps = parseInt(e.target.value, 10) || 3;
    prefsSave();
  });
  p.querySelector("#rcItems").addEventListener("click", function (e) {
    kartSetOn(!kartIsOn());
    e.target.classList.toggle("active", kartIsOn());
    prefsSave();
    if (R.track) kartBuild(R.track.wps); // lay the boxes out (or clear them)
    if (!kartIsOn()) R.cars.forEach(kartResetCar);
    showMsg(kartIsOn() ? t("rc_items_on") : t("rc_items_off"), 1400);
  });
  p.querySelector("#rcWalls").addEventListener("click", function (e) {
    R.walls = !R.walls;
    e.target.classList.toggle("active", R.walls);
    prefsSave();
    showMsg(R.walls ? t("rc_walls_on") : t("rc_walls_off"), 1400);
  });
  p.querySelector("#rcHome").addEventListener("click", function (e) {
    R.homeMode = !R.homeMode;
    e.target.classList.toggle("active", R.homeMode);
    prefsSave();
    // the whole circuit changes shape — rebuild it and put everyone back on it
    buildTrack();
    R.cars.forEach(function (c, i) {
      gridPlace(c, i, R.cars.length);
    });
    showMsg(R.homeMode ? t("rc_home_on") : t("rc_home_off"), 2200);
  });
  p.querySelector("#rcWater").addEventListener("click", function (e) {
    R.waterTool = !R.waterTool;
    e.target.classList.toggle("active", R.waterTool);
    if (R.waterTool) showMsg(t("rc_water_hint"), 2600);
  });
  p.querySelector("#rcStart").addEventListener("click", function () {
    hidePanel();
    R.waterTool = false;
    startRace();
  });
  p.querySelector("#rcFree").addEventListener("click", hidePanel);
  p.querySelector("#rcQuit").addEventListener("click", function () {
    toggleRC(false);
  });
}
function hidePanel() {
  R.hud.panel.classList.remove("on");
}

// ---- pause ------------------------------------------------------------------
// Every gameplay timer is an absolute performance.now() stamp, so a pause has
// to slide them all forward by the time spent stopped — otherwise a 30-second
// break expires every boost, wreck timer and item cooldown at once, and the
// race clock counts the pause as lap time.
var PAUSE_STAMPS = [
  "boostT", "starT", "smallT", "spinT", "stallT", "padT", "rollT",
  "deadT", "hitCd", "revT", "aiDrift", "aiItemT",
];
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
    if (!onRoad(gx, gz, gy != null ? gy : 0)) {
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
  car.surfaceUp = { x: 0, y: 1, z: 0 };
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
  var countIn = o.inMs != null ? Math.max(600, o.inMs) : 3200;
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

function checkWaypoints(car, now) {
  if (!R.race || car.done || car.dead) return;
  var wps = R.track.wps;
  // minor (smoothing) points are generous and skippable: hitting the point
  // after a minor also counts, so a wide fluid line never strands the racer
  var cand = [car.next];
  if (wps[car.next].minor) cand.push((car.next + 1) % wps.length);
  var hitIdx = -1;
  for (var ci = 0; ci < cand.length; ci++) {
    var tgt = wps[cand[ci]];
    var rr = tgt.minor ? PASS_R_MINOR : car.ai ? PASS_R_AI : PASS_R;
    if (
      Math.hypot(car.x - tgt.x, car.z - tgt.z) < rr &&
      Math.abs(car.y - tgt.y) < 12 // a gate under the table doesn't count from the tabletop
    ) {
      hitIdx = cand[ci];
      break;
    }
  }
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
  car.v -= car.v * DRAG * dt;
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
  var p = { x: car.x, z: car.z };
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
  var roadSample = surfaceSampleAt(
    R.col && R.col.surface,
    car.x,
    car.z,
    car.y,
    STEP_H,
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
    else car.surfaceUp = { x: 0, y: 1, z: 0 };
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
  checkWaypoints(car, now);
}

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
      var av = { x: Math.sin(a.heading) * a.v, z: Math.cos(a.heading) * a.v };
      var bv = { x: Math.sin(b.heading) * b.v, z: Math.cos(b.heading) * b.v };
      var rel = (av.x - bv.x) * nx + (av.z - bv.z) * nz;
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
        var aInto = av.x * nx + av.z * nz,
          bInto = -(bv.x * nx + bv.z * nz);
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

var carUp = new THREE.Vector3(),
  carForward = new THREE.Vector3(),
  carRight = new THREE.Vector3(),
  carBasis = new THREE.Matrix4();
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
  var up = car.surfaceUp || { x: 0, y: 1, z: 0 };
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

function aiInput(car) {
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
  } else car.stuck += 1 / 60;
  if (input.fwd && Math.abs(car.v) < 2.5) car.stuck += 1 / 60;
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
    var p = { x: f.x, z: f.z };
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
  var up = car.surfaceUp || { x: 0, y: 1, z: 0 };
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
  var wx = b.cx - Math.sin(yaw) * b.dist * 0.55,
    wz = b.cz - Math.cos(yaw) * b.dist * 0.55;
  var hy = b.dist * 0.82;
  if (!R.cam.pos) R.cam.pos = new THREE.Vector3(wx, hy, wz);
  var k = 1 - Math.exp(-6 * dt);
  R.cam.pos.x += (wx - R.cam.pos.x) * k;
  R.cam.pos.y += (hy - R.cam.pos.y) * k;
  R.cam.pos.z += (wz - R.cam.pos.z) * k;
  camera.position.copy(R.cam.pos);
  camera.lookAt(b.cx, 0, b.cz);
}

// The editor owns the existing 2D pane and uses 3D only as a live preview.
// Force the normal split while it is open, then restore the user's view mode.
function editorSplit(on) {
  var cc = document.getElementById("center-canvas");
  if (!cc || !window.__setViewMode) return;
  if (on) {
    R.edPrevView = cc.classList.contains("max-view-2d")
      ? "plan"
      : cc.classList.contains("max-view-3d")
        ? "3d"
        : "split";
    if (R.edPrevView !== "split") window.__setViewMode("split");
  } else if (R.edPrevView) {
    if (R.edPrevView !== "split") window.__setViewMode(R.edPrevView);
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
  R.edCam.dist = clamp(Math.max(maxx - minx, maxz - minz) * 1.15, 120, 3000);
  R.cam.pos = null;
}

var lastTrack = null;

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
    // The walls moved (a room edited, a new apartment generated): the circuit
    // was laid out for the old flat, so lay a new one. Only when the plan
    // signature really changed — furniture edits fire this event too.
    if (!R.race && R.trackSig && R.trackSig !== planSig()) buildTrack();
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
    }
  }
  // cars
  R.cars.forEach(function (c) {
    var input;
    if (c.ai) input = aiInput(c);
    else if (R.phase === "drive") input = pInput;
    else input = {};
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
  if (R.hud && R.hud.root)
    R.hud.root.classList.toggle("drafting", !!(pc && (pc.draft || 0) > 0.35));
  stepShards(dt, now);
  stepSpray(dt, now);
  R.waters.forEach(function (w) {
    if (w.mat) w.mat.uniforms.uTime.value = now / 1000;
  });
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
    footStep(dt, pInput);
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
    lastTrack = R.track;
    miniSync();
  }
  miniTick(now, pc);
  if (R.msgT && now > R.msgT) {
    R.hud.msg.classList.remove("on");
    R.msgT = 0;
  }
  return true;
}

// Tyre and road noise for the player's truck. Both are continuous voices held
// open across frames (js/rc_world.js), so this only has to say how hard.
function driveAudio(car, now) {
  if (car.dead) {
    skidTick(0, 0);
    rumbleTick(0, "road");
    return;
  }
  // a drift is full scrub; otherwise it is how much steering the truck is
  // carrying at speed
  var slip = car.driftDir
    ? 1
    : Math.min(1, Math.abs(car.steer || 0) * clamp(Math.abs(car.v) / Math.max(1, MAXV), 0, 1) * 1.6);
  skidTick(slip, car.v);
  // a parquet floor is a surface, not rough ground: home mode has no ribbon to
  // be off, so only water changes the note there
  var kind = car.wet
    ? "water"
    : R.homeMode || onRoad(car.x, car.z, car.y)
      ? "road"
      : "off";
  rumbleTick(car.grounded === false ? 0 : car.v, kind);
}

// ---- phase switching (F: exit / enter truck) --------------------------------
function exitCarPhase() {
  var pc = playerCar();
  if (!pc || pc.dead || Math.abs(pc.v) > 35) return; // don't bail out at speed
  pc.v = 0;
  R.phase = "foot";
  if (!R.fig) R.fig = makeFig();
  var sx = Math.sin(pc.heading + Math.PI / 2),
    sz = Math.cos(pc.heading + Math.PI / 2);
  var p = { x: pc.x + sx * 4.5, z: pc.z + sz * 4.5 };
  collideCircle(p, FOOT_R, pc.y, FOOT_CLEAR, FIG_STEP);
  R.fig.x = p.x;
  R.fig.z = p.z;
  R.fig.y = pc.y;
  R.fig.vy = 0;
  R.fig.heading = pc.heading;
  R.fig.camYaw = pc.heading;
  R.fig.grp.visible = true;
  engineOff();
  R.hud.hint.textContent = t("rc_hint_foot");
}
function enterCarPhase(car) {
  // stepping into an AI truck steals it, GTA-style: control swaps over and the
  // old player truck becomes a bot
  var pc = playerCar();
  if (car.ai) {
    car.ai = false;
    if (pc && pc !== car) {
      pc.ai = true;
      pc.aiSkill = 0.9;
      pc.name = AI_NAMES[(R.cars.indexOf(pc) + 1) % AI_NAMES.length];
    }
  }
  R.phase = "drive";
  if (R.fig) R.fig.grp.visible = false;
  R.hud.hint.textContent = t("rc_hint_drive");
  updateHpBar();
}
function tryEnterCar() {
  if (!R.fig) return;
  var best = null,
    bd = 1e9;
  R.cars.forEach(function (c) {
    if (c.dead) return;
    var d = Math.hypot(c.x - R.fig.x, c.z - R.fig.z);
    if (d < 8 && Math.abs(c.y - R.fig.y) < 3.5 && d < bd) {
      bd = d;
      best = c;
    }
  });
  if (best) enterCarPhase(best);
}

// ---- input ------------------------------------------------------------------
function padButton(pad, n) {
  return !!(pad && pad.buttons && pad.buttons[n] && pad.buttons[n].pressed);
}
function padValue(pad, n) {
  return pad && pad.buttons && pad.buttons[n] ? pad.buttons[n].value || 0 : 0;
}
function deadZone(v, zone) {
  var a = Math.abs(v || 0);
  if (a <= zone) return 0;
  return Math.sign(v) * (a - zone) / (1 - zone);
}
function readPlayerInput(now) {
  var out = {
    fwd: !!(R.keys.fwd || R.touch.fwd),
    back: !!(R.keys.back || R.touch.back),
    left: !!(R.keys.left || R.touch.left),
    right: !!(R.keys.right || R.touch.right),
    drift: !!(R.keys.drift || R.touch.drift),
    run: !!R.keys.run,
    look: !!(R.keys.look || R.touch.look),
  };
  var pad = null;
  try {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
  } catch (_) {}
  if (!pad) {
    R.pad.item = R.pad.rescue = R.pad.menu = false;
    return out;
  }
  var steer = deadZone(pad.axes[0], 0.14);
  var stickThrottle = -deadZone(pad.axes[1], 0.18);
  var throttle = padValue(pad, 7) - padValue(pad, 6);
  if (Math.abs(stickThrottle) > Math.abs(throttle)) throttle = stickThrottle;
  if (padButton(pad, 12)) throttle = 1;
  if (padButton(pad, 13)) throttle = -1;
  if (padButton(pad, 14)) steer = -1;
  if (padButton(pad, 15)) steer = 1;
  if (out.left) steer = -1;
  if (out.right) steer = 1;
  if (out.fwd) throttle = 1;
  if (out.back) throttle = -1;
  // Preserve full lock but give the middle of an analogue stick more room for
  // precise corrections on the narrow miniature track.
  steer = Math.sign(steer) * Math.pow(Math.abs(steer), 1.35);
  out.steerAxis = clamp(steer, -1, 1);
  out.throttle = clamp(throttle, -1, 1);
  out.left = out.left || steer < -0.08;
  out.right = out.right || steer > 0.08;
  out.fwd = out.fwd || throttle > 0.08;
  out.back = out.back || throttle < -0.08;
  out.drift = out.drift || padButton(pad, 0) || padButton(pad, 4);
  out.run = out.run || padButton(pad, 10);
  out.look = out.look || padButton(pad, 1);
  var item = padButton(pad, 2) || padButton(pad, 5);
  var rescue = padButton(pad, 3);
  var menu = padButton(pad, 9);
  if (item && !R.pad.item && R.phase === "drive") {
    var pc = playerCar();
    if (pc) kartUse(pc, now, out.back);
  }
  if (rescue && !R.pad.rescue && R.phase === "drive") rescueCar(playerCar());
  if (menu && !R.pad.menu) {
    if (raceLive()) setPaused(!R.paused);
    else if (R.hud.panel.classList.contains("on")) hidePanel();
    else showPanel();
  }
  R.pad.item = item;
  R.pad.rescue = rescue;
  R.pad.menu = menu;
  return out;
}

// a race that is counting down or running — the states a pause makes sense in
function raceLive() {
  return !!(R.race && (R.race.state === "count" || R.race.state === "run"));
}

function modelerOpen() {
  var m = document.getElementById("modeler");
  return m && m.style.display !== "none" && m.style.display !== "";
}
function keyDir(e) {
  switch (e.code) {
    case "KeyW":
    case "ArrowUp":
      return "fwd";
    case "KeyS":
    case "ArrowDown":
      return "back";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    case "ShiftLeft":
    case "ShiftRight":
      return "run"; // on foot = sprint, in a kart = drift
    case "Space":
      return "drift";
  }
  return null;
}
function onKeyDown(e) {
  if (!R.active || modelerOpen()) return;
  var tag = (document.activeElement && document.activeElement.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  var d = keyDir(e);
  if (d) {
    R.keys[d] = true;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  // Ctrl is the editor's modifier (undo/redo) while it is open — don't also
  // fire the held item
  if (editorActive() && (e.ctrlKey || e.metaKey)) return;
  if (e.code === "KeyE" || e.code === "ControlLeft" || e.code === "ControlRight") {
    // fire the held item — holding reverse throws / drops it behind
    var pcU = playerCar();
    if (R.phase === "drive" && pcU) kartUse(pcU, performance.now(), !!R.keys.back);
    e.preventDefault();
    e.stopPropagation();
  } else if (e.code === "KeyF") {
    if (R.phase === "drive") exitCarPhase();
    else tryEnterCar();
    e.preventDefault();
    e.stopPropagation();
  } else if (e.code === "KeyR" && R.phase === "drive") {
    rescueCar(playerCar());
    e.preventDefault();
    e.stopPropagation();
  } else if (e.code === "KeyV") {
    R.keys.look = true;
    e.preventDefault();
    e.stopPropagation();
  } else if (e.code === "KeyC") {
    cycleCam();
    e.preventDefault();
    e.stopPropagation();
  } else if (e.code === "KeyM") {
    R.minimap = !R.minimap;
    miniSetOn(R.minimap);
    prefsSave();
    e.preventDefault();
    e.stopPropagation();
  } else if (e.code === "KeyP") {
    // mid-race P is a pause, not a settings panel — the panel is what you want
    // between races, the pause is what you want during one
    if (raceLive()) setPaused(!R.paused);
    else if (R.hud.panel.classList.contains("on")) hidePanel();
    else showPanel();
    e.preventDefault();
    e.stopPropagation();
  } else if (e.code === "Escape") {
    if (R.paused) setPaused(false);
    else if (R.hud.results.classList.contains("on"))
      R.hud.results.classList.remove("on");
    else if (editorActive()) {
      editorClose();
      showPanel();
    } else if (R.hud.panel.classList.contains("on")) hidePanel();
    else if (raceLive()) setPaused(true);
    else toggleRC(false);
    e.preventDefault();
    e.stopPropagation();
  }
}
function onKeyUp(e) {
  if (!R.active) return;
  var d = keyDir(e);
  if (d) R.keys[d] = false;
  if (e.code === "KeyV") R.keys.look = false;
}
// Lakitu: lift a truck back onto the circuit at the gate it was heading for,
// facing the one after it. Dropping it FORWARD rather than back at the gate it
// came from is what makes this a guaranteed recovery — a truck that couldn't
// reach a gate from behind would just fail the same way a second time.
function rescueCar(car) {
  var pc = car || playerCar();
  if (!pc || pc.dead || !R.track) return;
  var wps = R.track.wps;
  // skip forward past any gate the truck can't actually stand on, or a rescue
  // just drops it straight back into whatever ejected it
  var idx = pc.next,
    tries = 0;
  while (
    tries++ < 8 &&
    blockedAt(
      wps[idx % wps.length].x,
      wps[idx % wps.length].z,
      COLL_R,
      wps[idx % wps.length].y,
      CAR_CLEAR,
      STEP_H,
    )
  )
    idx++;
  pc.next = idx % wps.length;
  var at = wps[pc.next],
    nxt = wps[(pc.next + 1) % wps.length];
  // on the road the gate itself is the safe spot — only floor-level restarts
  // need the spiral search that keeps trucks out of the furniture
  var spot = at.y > 6 ? { x: at.x, z: at.z } : findFreeSpot(at.x, at.z, COLL_R);
  pc.x = spot.x;
  pc.z = spot.z;
  // A gate stores the height of its own centre, which on a spiral or a ramp is
  // up to ~20cm above the deck actually under (x,z) — dropping the truck there
  // made it fall onto the road below and read as another "fell off the track".
  // Ask the road surface where it really is, and only fall back to the gate.
  if (at.y > 6) {
    var sy = surfaceHeightNear(R.col && R.col.surface, spot.x, spot.z, at.y, 40);
    pc.y = sy != null ? sy : at.y;
  } else pc.y = groundAt(spot.x, spot.z, 0, STEP_H);
  pc.vy = 0;
  pc.surfaceUp = { x: 0, y: 1, z: 0 };
  pc.grounded = true;
  pc.sink = 0;
  pc.lastG = pc.y;
  pc.climb = 0;
  pc.heading = Math.atan2(nxt.x - at.x, nxt.z - at.z);
  pc.v = 0;
  pc.spinT = 0;
  pc.offT = 0;
  pc.offRoadT = 0;
  pc.wpClock = 0;
  pc.progD = null; // restart the AI's no-progress timer from the new spot
  pc.stuck = 0;
  syncCarMesh(pc);
}

var boundEvents = false;
function bindEvents() {
  if (boundEvents) return;
  boundEvents = true;
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener(
    "wheel",
    function (e) {
      if (!R.active || modelerOpen()) return;
      var host = document.getElementById("view-3d");
      if (!host.contains(e.target)) return;
      if (R.edCam.on && editorActive())
        R.edCam.dist = clamp(R.edCam.dist * (1 + e.deltaY * 0.0016), 60, 4000);
      else R.cam.dist = clamp(R.cam.dist * (1 + e.deltaY * 0.0012), 9, 70);
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true, passive: false },
  );
  var v3d = document.getElementById("v3d");
  // While the live editor is open it gets first refusal on every press: it
  // consumes the ones that grab a handle, and lets the rest fall through so the
  // chase camera still orbits and the truck is still drivable mid-edit.
  v3d.addEventListener("mousedown", function (e) {
    if (!R.active) return;
    if (editorActive() && editorPointerDown(e)) return;
    R.cam.drag = true;
    R.cam.lx = e.clientX;
    R.cam.moved = 0;
  });
  v3d.addEventListener("contextmenu", function (e) {
    if (R.active && editorActive()) editorContext(e);
  });
  window.addEventListener("mouseup", function (e) {
    if (R.active && editorActive() && editorPointerUp(e, R.cam.moved || 0)) {
      R.cam.drag = false;
      return;
    }
    if (R.active && R.cam.drag && R.waterTool && (R.cam.moved || 0) < 6)
      waterClickPlace(e);
    R.cam.drag = false;
  });
  window.addEventListener("mousemove", function (e) {
    if (!R.active) return;
    if (editorActive() && editorPointerMove(e)) return;
    if (!R.cam.drag) return;
    R.cam.moved = (R.cam.moved || 0) + Math.abs(e.clientX - R.cam.lx);
    R.cam.yawOff -= (e.clientX - R.cam.lx) * 0.008;
    R.cam.lx = e.clientX;
  });
  window.addEventListener("scene3d:rebuilt", function () {
    if (R.active) R.colDirty = true;
  });
}

// ---- mode toggle ------------------------------------------------------------
export function toggleRC(on) {
  if (!has3D) return false;
  var want = on == null ? !R.active : !!on;
  if (want === R.active) return R.active;
  var camera = getMainCamera();
  if (want) {
    if (isWalk()) toggleWalk(false);
    prefsLoad();
    bindEvents();
    buildHud();
    ensureBuilt();
    // the kart layer reads the world through these — everything it needs from
    // rc.js internals, injected once so the two modules stay decoupled
    kartInit({
      cars: function () {
        return R.cars;
      },
      player: playerCar,
      groundAt: groundAt,
      collideCircle: collideCircle,
      blockedAt: blockedAt,
      beep: beep,
      msg: showMsg,
      flash: hudFlash,
      COLL_R: COLL_R,
      CAR_CLEAR: CAR_CLEAR,
      STEP_H: STEP_H,
      MAXV: MAXV,
      GRAV: GRAV,
    });
    // same deal for the live 2D/3D track editor (js/rc_editor.js)
    editorInit({
      cfg: R,
      scene: getMainScene,
      camera: getMainCamera,
      rooms: function () {
        return detectRooms().filter(function (r) {
          return !roomHidden(r.key) && r.area > 12000;
        });
      },
      presets: { auto: routeAllRooms, oval: ovalAnchors, fig8: fig8Anchors },
      freeSpot: function (x, z) {
        return findFreeSpot(x, z, 12);
      },
      groundAt: groundAt,
      blockedAt: blockedAt,
      col: function () {
        return R.col;
      },
      track: function () {
        return R.track;
      },
      waters: function () {
        return R.waters;
      },
      cars: function () {
        return R.cars;
      },
      overview: setOverview,
      maxView: editorSplit,
      planSig: planSig,
      anchors: customAnchors, // null when the stored route is for another flat
      rebuild: buildTrack,
      clearTrack: clearTrack,
      save: prefsSave,
      // a setup dialled in the editor's Physics tab belongs to the truck it
      // was dialled for, not to the mode
      applyPhysics: function () {
        applyPhysicsConfig();
        tuneStore();
      },
      beep: beep,
      msg: showMsg,
      onExit: showPanel,
    });
    // ghost replay and peer trucks both draw into the main scene; neither
    // reaches into rc internals, same contract as the kart and editor layers
    ghostInit(getMainScene);
    mpInit({
      scene: getMainScene,
      planSig: planSig,
      msg: showMsg,
      t: t,
      startRace: startRace,
      boardChanged: function () {
        if (R.race && R.race.state === "done") showResults();
      },
    });
    tuneLoad(); // this truck's own setup
    setVolume(R.volume);
    buildColModel();
    buildTrack();
    miniSync();
    watersLoad();
    openAllDoors();
    R.active = true;
    R.waterTool = false;
    R.phase = "drive";
    R.keys = {};
    R.touch = {};
    R.pad = { item: false, rescue: false, menu: false };
    R.cam.pos = null;
    R.cam.yawOff = 0;
    // micro trucks need a tight near plane or the chase cam clips the world
    if (camera) {
      R.prevNear = camera.near;
      R.prevFov = camera.fov;
      camera.near = 0.8; // any closer and depth precision collapses (far=50000)
      camera.updateProjectionMatrix();
    }
    R.cars = [makeCar({ color: PLAYER_COLOR })];
    gridPlace(R.cars[0], 0, 1);
    R.hud.root.classList.add("on");
    R.hud.hint.textContent = t("rc_hint_drive");
    updateHpBar();
    audio();
    showPanel();
    setExternalTick(tick);
  } else {
    R.active = false;
    R.touch = {};
    R.paused = false;
    editorClose();
    setExternalTick(null);
    engineOff();
    ghostClear();
    mpDispose();
    tuneStore(); // keep whatever was dialled in for this truck
    prefsSave();
    clearCars(false);
    var scene = getMainScene();
    R.shards.forEach(function (s) {
      scene.remove(s.m);
      if (s.m.geometry) s.m.geometry.dispose();
      if (s.m.material && s.m.material.dispose) s.m.material.dispose();
    });
    R.shards = [];
    R.spray.forEach(function (s) {
      scene.remove(s.m);
      s.m.geometry.dispose();
      s.m.material.dispose();
    });
    R.spray = [];
    watersClear();
    R.waterTool = false;
    if (R.fig) {
      scene.remove(R.fig.grp);
      disposeGrp(R.fig.grp);
      R.fig = null;
    }
    clearTrack();
    restoreDoors();
    R.race = null;
    if (camera && R.prevNear != null) {
      camera.near = R.prevNear;
      if (R.prevFov != null) camera.fov = R.prevFov;
      camera.updateProjectionMatrix();
      R.prevNear = null;
      R.prevFov = null;
    }
    if (R.hud) {
      R.hud.root.classList.remove("on");
      hidePanel();
      R.hud.pause.classList.remove("on");
      R.hud.wait.classList.remove("on");
      R.hud.results.classList.remove("on");
      R.hud.msg.classList.remove("on");
      R.hud.root.style.setProperty("--rc-speed", "0");
      R.hud.root.classList.remove("boosting");
    }
    orbitRefresh();
  }
  var btn = document.getElementById("rcBtn");
  if (btn) btn.classList.toggle("active", R.active);
  window.dispatchEvent(new CustomEvent("rc:state", { detail: R.active }));
  return R.active;
}


hooks.updateHpBar = updateHpBar;
hooks.showMsg = showMsg;
hooks.syncCarMesh = syncCarMesh;

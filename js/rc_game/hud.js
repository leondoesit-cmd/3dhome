/* RC game HUD, touch controls, start lights, gaps, wrong-way and lap displays,
   split out of js/rc_game.js. It shares the editor's state through live imports
   from ../rc_game.js. */
import { FURN } from "../furniture.js";
import { t } from "../i18n.js";
import { kartBuild, kartIsOn, kartSetOn, kartUse } from "../kart.js";
import { openModeler } from "../modeler.js";
import { editorOpen } from "../rc_editor.js";
import { tick } from "../rc_game/cars_cameras.js";
import { gridPlace, playerCar, setCamMode, setPaused, startRace, starterTruckDef } from "../rc_game/pause_camera.js";
import { rescueCar } from "../rc_game/phases_input.js";
import { finishRace } from "../rc_game/race.js";
import { ghostHas } from "../rc_ghost.js";
import { miniInit, miniSetOn } from "../rc_minimap.js";
import { mpActive, mpAvailable, mpEnable, mpPeerCount } from "../rc_mp.js";
import { DRAFT_DIST, MAX_HP, MAX_OPP, R, prefsSave, tuneLoad, tuneStore } from "../rc_state.js";
import { bestLap, bestTime, buildTrack, groundAt, inTrackGap, kartResetCar, setVolume, swapPlayerBody } from "../rc_world.js";
import { clamp } from "../state.js";
import {
  lastStuckMsg, placeScratch, set_lastStuckMsg, toggleRC,
} from "../rc_game.js";

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
    '<div id="rcCoach" role="status"></div>' +
    '<div id="rcActions"><button id="rcPauseButton">' + t('rc_pause_action') + '</button><button id="rcRescueButton">' + t('rc_rescue') + '</button></div>' +
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
  el.querySelector("#rcPauseButton").addEventListener("click", function () { setPaused(!R.paused); });
  el.querySelector("#rcRescueButton").addEventListener("click", function () { rescueCar(); });
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
  placeScratch.length = 0;
  for (var i = 0; i < R.cars.length; i++) placeScratch.push(R.cars[i]);
  placeScratch
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
  // A stationary truck reads every lead as dist/22 seconds — cap the readout
  // instead of showing "166.69" for a rival one corner away.
  var fmtGap = function (d) {
    var s = d / spd;
    return s > 99.9 ? "99.9+" : s.toFixed(1);
  };
  hud.gapA.textContent = ahead
    ? "▲ " + (ahead.ai ? ahead.name : t("rc_you")) + " " + fmtGap(Math.abs(aPos - me))
    : "";
  hud.gapB.textContent = behind
    ? "▼ " + (behind.ai ? behind.name : t("rc_you")) + " " + fmtGap(Math.abs(me - bPos))
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

function updateStuckHint(pc, input, now) {
  var wedged =
    !!(pc && !pc.dead) &&
    R.phase === "drive" &&
    !(R.race && R.race.state === "count") &&
    !!(input.fwd || input.back) &&
    Math.abs(pc.v) < 3 &&
    pc.grounded !== false;
  if (!wedged) {
    R.stuckSince = 0;
    return;
  }
  if (!R.stuckSince) R.stuckSince = now;
  if (now - R.stuckSince > 2500 && now - lastStuckMsg > 9000) {
    set_lastStuckMsg(now);
    showMsg(t("rc_stuck"), 2600);
  }
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
    '<button id="rcAssist" aria-pressed="' + R.brakeAssist + '">' + t('rc_brake_assist') + ': ' + t(R.brakeAssist ? 'rc_on' : 'rc_off') + '</button>' +
    '<p class="rc-howto">' + t('rc_quick_help') + '</p>' +
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
    '<p id="rcCourseStatus" role="status"></p>' +
    (R.track && R.track.feats.automatic && !R.followAnchors ? '<button id="rcReverse" aria-pressed="' + R.reverseCourse + '">↔ ' + t('rc_reverse_course') + '</button>' : '') +
    '<button id="rcStart" class="rc-primary"><i class="ph ph-flag-checkered"></i> ' +
    (trial ? t("rc_start_trial") : t("rc_start")) + "</button>" +
    '<div class="rc-row"><button id="rcFree">' + t("rc_free") + "</button>" +
    '<button id="rcQuit">' + t("rc_quit") + "</button></div>";
  p.querySelector("#rcCourseStatus").textContent = R.trackError || (!R.track ? t("rc_course_failed") : t("rc_course_ready"));
  var coverage = R.track && R.track.feats.coverage;
  if (coverage && !R.trackError) p.querySelector("#rcCourseStatus").textContent =
    t("rc_house_tour") + " · " + coverage.visited + "/" + coverage.total + " " + t("rc_tour_objects") +
    " · " + coverage.rooms + "/" + coverage.totalRooms + " " + t("rc_tour_rooms");
  else if (R.homeFeatures && R.homeMode && R.track && !R.trackError) p.querySelector("#rcCourseStatus").textContent = t("rc_tour_fallback");
  p.querySelector("#rcStart").disabled = !R.track;
  p.querySelector("#rcAssist").addEventListener("click", function () {
    R.brakeAssist = !R.brakeAssist; prefsSave(); showPanel();
  });
  var reverse = p.querySelector("#rcReverse");
  if (reverse) reverse.addEventListener("click", function () {
    R.reverseCourse = !R.reverseCourse;
    buildTrack();
    R.cars.forEach(function (c, i) { gridPlace(c, i, R.cars.length); });
    prefsSave(); showPanel();
  });
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
    showPanel();
    if (!R.trackError) showMsg(R.homeMode ? t("rc_home_on") : t("rc_home_off"), 2200);
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

export {
  buildHud, draftFactor, fmtT, hidePanel, hudFlash, ordinal, showMsg,
  showPanel, updateGaps, updateHpBar, updateLapHud, updatePlaces,
  updateSplitsHud, updateStartLights, updateStuckHint, updateWrongWay,
};

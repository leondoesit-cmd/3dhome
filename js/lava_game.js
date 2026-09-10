/* The Floor is Lava — player, HUD, ghost replay, input, mode toggle. */
import * as THREE from "three";
import { S, clamp, fin } from "./state.js";
import {
  has3D,
  init3D,
  getMainScene,
  getMainCamera,
  setExternalTick,
  ensureBuilt,
  isWalk,
  toggleWalk,
  orbitRefresh,
  setQualityPreset,
  setGameRendererQuality,
  clearGameRendererQuality,
} from "./view3d.js";
import { t, onLangChange } from "./i18n.js";
import { dampingFactor, forEachPhysicsStep, safeDeltaSeconds } from "./physics_runtime.js";
import { isPhysicsEnabled, moveKinematicCapsule } from "./physics_facade.js";
import {
  L, lavaActive, EYE, EYE_CROUCH, P_RAD, P_CLEAR, STEP,
  SPD_WALK, SPD_SPRINT, SPD_CROUCH, ACCEL, GRAV, JUMP_V,
  COYOTE, JUMP_BUF, MANTLE_DUR, BURN_MARGIN, P_CROUCH_CLEAR, P_SCALE,
  GEM_FREEZE, EXTRACT_HOLD, GHOST_SAMPLE_MS, LAVA_START_Y,
  FREEZE_BAR, DEATH_HOLD,
  specFor, nextLavaY, heatFactor, isBurned, formatTime, formatDelta,
  planSignature, ghostStoreKey, mantleTarget, collectGem, reachedExtract,
  interpolateGhost, ghostSample, comboOnLand, firstStep, countdownFor,
} from "./lava_state.js";
import {
  castWeb, aimAnchor, findCling, findCeiling, wallBasis, ropeConstrain, lookDir,
  WEB_RANGE, WEB_MIN, ZIP_SPEED, ZIP_ARRIVE, ZIP_MAX_T, CLING_REACH,
  CRAWL_SPD, CRAWL_SPRINT, WALL_JUMP_OUT, WALL_JUMP_UP, NO_CLING,
  SWING_ACCEL, REEL_SPD, SWING_MIN_LEN, AUTO_REEL, hangLength,
} from "./lava_spider.js";
import {
  buildCol, groundAt, moveCircle, spawnCourseMeshes, stepCourseVisuals,
  stepLavaVisual, applyScorch, clearScorch, enterHeat, exitHeat,
  spawnPlayer, audioOpen, audioClose, applyAudioVolume,
  sndSiren, sndGem, sndExtract, sndBurn, sndLand, startRumble, stepRumble, stopRumble,
  stepGhostVisual, disposeGroup, reheatAfterRebuild, relayoutAfterRebuild, stepGuide,
  rebuildLavaMesh, collideCircle, updateWebLine, wallTop, sndWeb,
} from "./lava_world.js";
import { detectTouch } from "./chrome_posture.js";

var KEYMAP = {
  KeyW: "fwd", ArrowUp: "fwd",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  ShiftLeft: "sprint", ShiftRight: "sprint",
  ControlLeft: "crouchKey", ControlRight: "crouchKey",
};

var PAUSE_CONTROLS = [
  { kbd: "WASD", key: "lv_control_move" },
  { kbd: "SHIFT", key: "lv_control_sprint" },
  { kbd: "SPACE", key: "lv_control_jump" },
  { kbd: "HOLD JUMP", key: "lv_control_mantle" },
  { kbd: "CTRL", key: "lv_control_crouch" },
  { kbd: "WALL", key: "lv_control_cling" },
  { kbd: "SPACE", key: "lv_control_walljump" },
  { kbd: "LMB / F", key: "lv_control_swing" },
  { kbd: "RMB / E", key: "lv_control_zip" },
];

var _movePoint2D = { x: 0, z: 0 };
var _aimT = 0;
var _aimOn = false;
var _scorchT = 0;
var _sirenT = 0;

function gameSettings() {
  if (L.settings) return L.settings;
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem("home3d_lava") || "{}") || {}; } catch (e) {}
  L.settings = {
    quality: fin(saved.quality) ? clamp(saved.quality, 0, 2) : 1,
    diff: specFor(saved.diff).id,
    sens: fin(saved.sens) ? clamp(saved.sens, 0.35, 2.4) : 1,
    invertY: !!saved.invertY,
    volume: fin(saved.volume) ? Math.round(clamp(saved.volume, 0, 100)) : 70,
    ghost: saved.ghost !== false,
  };
  return L.settings;
}

function persistSettings() {
  try { localStorage.setItem("home3d_lava", JSON.stringify(L.settings)); } catch (e) {}
}

function planSig() {
  return planSignature(S.nodes, S.walls, S.items);
}

function loadGhost() {
  L.ghostPlay = null;
  L.bestMs = 0;
  var k = ghostStoreKey(planSig(), gameSettings().diff);
  try {
    var raw = localStorage.getItem(k);
    if (!raw) return;
    var d = JSON.parse(raw);
    if (d && Array.isArray(d.s) && d.s.length > 3) {
      L.ghostPlay = d;
      L.bestMs = d.ms || 0;
    }
  } catch (e) {}
}

function saveGhost(ms) {
  if (!L.ghostRec || L.ghostRec.length < 4) return false;
  var k = ghostStoreKey(planSig(), gameSettings().diff);
  try {
    localStorage.setItem(k, JSON.stringify({ ms: Math.round(ms), s: L.ghostRec }));
    L.ghostPlay = { ms: Math.round(ms), s: L.ghostRec.slice() };
    L.bestMs = Math.round(ms);
    return true;
  } catch (e) {
    return false;
  }
}

function buildHud() {
  if (L.hud) return;
  var host = document.getElementById("view-3d") || document.body;
  var el = document.createElement("div");
  el.id = "lvHud";
  el.innerHTML =
    '<div id="lvHeat"></div>' +
    '<div id="lvHaze"></div>' +
    '<div id="lvVig"></div>' +
    '<div id="lvCross"><i></i><i></i><i></i><i></i></div>' +
    '<div id="lvCompass"><i></i></div>' +
    '<div id="lvTop">' +
    '<span id="lvTime">0:00.00</span>' +
    '<span id="lvDelta"></span>' +
    '<span id="lvGems"></span>' +
    "</div>" +
    '<div id="lvRise"><b><i id="lvRiseFill"></i><i id="lvFreezeFill"></i></b><span id="lvRiseLbl"></span></div>' +
    '<div id="lvCombo"></div>' +
    '<div id="lvMsg"></div>' +
    '<div id="lvCount"></div>' +
    '<div id="lvMantle"></div>' +
    '<div id="lvHint"></div>' +
    '<button type="button" id="lvPauseBtn" aria-label=""></button>' +
    '<div id="lvTouch" aria-label="">' +
    '<div id="lvStick" class="lv-touch-stick"><i></i></div>' +
    '<div class="lv-touch-actions">' +
    '<button type="button" data-act="crouch"></button>' +
    '<button type="button" data-act="sprint"></button>' +
    '<button type="button" data-act="zip"></button>' +
    '<button type="button" data-act="web"></button>' +
    '<button type="button" data-act="jump"></button>' +
    "</div></div>" +
    '<div id="lvReady"><div class="lv-card">' +
    '<span class="lv-eyebrow"></span><h2></h2><p></p>' +
    '<div class="lv-diffs">' +
    '<button type="button" data-diff="casual"></button>' +
    '<button type="button" data-diff="standard"></button>' +
    '<button type="button" data-diff="inferno"></button>' +
    "</div>" +
    '<label class="lv-check"><input id="lvGhostOn" type="checkbox" checked><span></span></label>' +
    '<div class="lv-controls"></div>' +
    '<button type="button" id="lvStart"></button>' +
    '<button type="button" id="lvReadyExit"></button>' +
    "</div></div>" +
    '<div id="lvPause"><div class="lv-card">' +
    '<span class="lv-eyebrow"></span><h2></h2><p></p>' +
    '<div class="lv-controls"></div>' +
    '<div class="lv-settings">' +
    '<label><span><b id="lvQualityLabel"></b><output id="lvQualityValue"></output></span>' +
    '<input id="lvQualitySlider" type="range" min="0" max="2" step="1"></label>' +
    '<label><span><b id="lvSensLabel"></b><output id="lvSensValue"></output></span>' +
    '<input id="lvSensSlider" type="range" min="35" max="240" step="5"></label>' +
    '<label class="lv-check"><input id="lvInvertY" type="checkbox"><span id="lvInvertLabel"></span></label>' +
    '<label><span><b id="lvVolLabel"></b><output id="lvVolValue"></output></span>' +
    '<input id="lvVolSlider" type="range" min="0" max="100" step="5"></label>' +
    "</div>" +
    '<button type="button" id="lvResume"></button>' +
    '<button type="button" id="lvExit"></button>' +
    "</div></div>" +
    '<div id="lvEnd"><div class="lv-card">' +
    "<h2></h2><p></p>" +
    '<button type="button" id="lvAgain"></button>' +
    '<button type="button" id="lvEndExit"></button>' +
    '<span class="lv-endhint"></span>' +
    "</div></div>";
  host.appendChild(el);
  L.hud = {
    root: el,
    heat: el.querySelector("#lvHeat"),
    vig: el.querySelector("#lvVig"),
    time: el.querySelector("#lvTime"),
    delta: el.querySelector("#lvDelta"),
    gems: el.querySelector("#lvGems"),
    rise: el.querySelector("#lvRise"),
    riseFill: el.querySelector("#lvRiseFill"),
    freezeFill: el.querySelector("#lvFreezeFill"),
    riseLbl: el.querySelector("#lvRiseLbl"),
    combo: el.querySelector("#lvCombo"),
    msg: el.querySelector("#lvMsg"),
    count: el.querySelector("#lvCount"),
    mantle: el.querySelector("#lvMantle"),
    compass: el.querySelector("#lvCompass"),
    haze: el.querySelector("#lvHaze"),
    hint: el.querySelector("#lvHint"),
    pauseBtn: el.querySelector("#lvPauseBtn"),
    touch: el.querySelector("#lvTouch"),
    stick: el.querySelector("#lvStick"),
    ready: el.querySelector("#lvReady"),
    pause: el.querySelector("#lvPause"),
    end: el.querySelector("#lvEnd"),
  };
  wireHud();
  localizeHud();
}

function wireHud() {
  var h = L.hud;
  h.pauseBtn.addEventListener("click", function () { pauseGame(!L.paused); });
  h.root.querySelector("#lvStart").addEventListener("click", function () { beginRun(); });
  h.root.querySelector("#lvReadyExit").addEventListener("click", function () { toggleLava(false); });
  h.root.querySelector("#lvResume").addEventListener("click", function () { pauseGame(false); });
  h.root.querySelector("#lvExit").addEventListener("click", function () { toggleLava(false); });
  h.root.querySelector("#lvAgain").addEventListener("click", function () { restart(); });
  h.root.querySelector("#lvEndExit").addEventListener("click", function () { toggleLava(false); });
  h.root.querySelectorAll("[data-diff]").forEach(function (b) {
    b.addEventListener("click", function () {
      gameSettings().diff = b.getAttribute("data-diff");
      persistSettings();
      loadGhost();
      if (!L.started) previewCourse();
      localizeHud();
    });
  });
  var ghostOn = h.root.querySelector("#lvGhostOn");
  ghostOn.addEventListener("change", function () {
    gameSettings().ghost = ghostOn.checked;
    persistSettings();
  });
  var sens = h.root.querySelector("#lvSensSlider");
  sens.addEventListener("input", function () {
    gameSettings().sens = clamp(parseFloat(sens.value) / 100, 0.35, 2.4);
    persistSettings();
    localizeHud();
  });
  var inv = h.root.querySelector("#lvInvertY");
  inv.addEventListener("change", function () {
    gameSettings().invertY = inv.checked;
    persistSettings();
  });
  var vol = h.root.querySelector("#lvVolSlider");
  vol.addEventListener("input", function () {
    gameSettings().volume = Math.round(clamp(parseFloat(vol.value), 0, 100));
    persistSettings();
    applyAudioVolume();
    localizeHud();
  });
  var quality = h.root.querySelector("#lvQualitySlider");
  quality.addEventListener("input", function () {
    gameSettings().quality = Math.round(clamp(parseFloat(quality.value), 0, 2));
    persistSettings();
    applyLavaQuality();
    localizeHud();
  });
  h.touch.querySelectorAll("button").forEach(function (btn) {
    var act = btn.getAttribute("data-act");
    btn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      if (act === "jump") {
        L.keys.jumpHold = true;
        tryJump();
      }
      if (act === "sprint") L.keys.sprint = true;
      if (act === "crouch") L.keys.crouchKey = true;
      if (act === "zip") fireZip();
      if (act === "web") {
        L.keys.web = true;
        fireWeb();
      }
    });
    btn.addEventListener("pointerup", function () {
      if (act === "jump") L.keys.jumpHold = false;
      if (act === "sprint") L.keys.sprint = false;
      if (act === "crouch") L.keys.crouchKey = false;
      if (act === "web") {
        L.keys.web = false;
        if (L.p) releaseWeb(L.p);
      }
    });
    btn.addEventListener("pointerleave", function () {
      if (act === "jump") L.keys.jumpHold = false;
      if (act === "sprint") L.keys.sprint = false;
      if (act === "crouch") L.keys.crouchKey = false;
      if (act === "web") {
        L.keys.web = false;
        if (L.p) releaseWeb(L.p);
      }
    });
    btn.addEventListener("pointercancel", function () {
      if (act === "jump") L.keys.jumpHold = false;
      if (act === "sprint") L.keys.sprint = false;
      if (act === "crouch") L.keys.crouchKey = false;
      if (act === "web") {
        L.keys.web = false;
        if (L.p) releaseWeb(L.p);
      }
    });
  });
  bindStick();
}

function localizeHud() {
  if (!L.hud) return;
  var cfg = gameSettings();
  var r = L.hud.root;
  r.querySelector("#lvReady .lv-eyebrow").textContent = t("lv_briefing");
  r.querySelector("#lvReady h2").textContent = t("lv_ready_title");
  r.querySelector("#lvReady p").textContent = t("lv_ready_copy");
  r.querySelector("#lvStart").textContent = t("lv_start");
  r.querySelector("#lvReadyExit").textContent = t("lv_exit");
  r.querySelector("#lvPause .lv-eyebrow").textContent = t("lv_paused");
  r.querySelector("#lvPause h2").textContent = t("lv_paused_title");
  r.querySelector("#lvPause p").textContent = t("lv_paused_copy");
  r.querySelector("#lvResume").textContent = t("lv_resume");
  r.querySelector("#lvExit").textContent = t("lv_exit");
  r.querySelector("#lvAgain").textContent = t("lv_again");
  r.querySelector(".lv-endhint").textContent = t("lv_retry_key");
  r.querySelector("#lvEndExit").textContent = t("lv_exit");
  r.querySelector("#lvGhostOn").nextElementSibling.textContent = t("lv_ghost_toggle");
  r.querySelector("#lvSensLabel").textContent = t("lv_setting_look");
  r.querySelector("#lvSensValue").textContent = Math.round(cfg.sens * 100) + "%";
  r.querySelector("#lvSensSlider").value = String(Math.round(cfg.sens * 100));
  r.querySelector("#lvInvertLabel").textContent = t("lv_setting_invert");
  r.querySelector("#lvInvertY").checked = !!cfg.invertY;
  r.querySelector("#lvVolLabel").textContent = t("lv_setting_volume");
  r.querySelector("#lvVolValue").textContent = cfg.volume + "%";
  r.querySelector("#lvVolSlider").value = String(cfg.volume);
  r.querySelector("#lvQualityLabel").textContent = t("lv_setting_quality");
  var qKeys = ["lv_quality_fast", "lv_quality_balanced", "lv_quality_high"];
  r.querySelector("#lvQualityValue").textContent = t(qKeys[cfg.quality] || qKeys[1]);
  r.querySelector("#lvQualitySlider").value = String(cfg.quality);
  r.querySelector("#lvGhostOn").checked = cfg.ghost !== false;
  r.querySelectorAll("[data-diff]").forEach(function (b) {
    var id = b.getAttribute("data-diff");
    b.textContent = t("lv_diff_" + id);
    b.classList.toggle("on", cfg.diff === id);
  });
  var controls = PAUSE_CONTROLS.map(function (c) {
    return "<span><kbd>" + c.kbd + "</kbd><small>" + t(c.key) + "</small></span>";
  }).join("");
  r.querySelectorAll(".lv-controls").forEach(function (n) { n.innerHTML = controls; });
  L.hud.pauseBtn.setAttribute("aria-label", t("lv_touch_pause"));
  L.hud.touch.setAttribute("aria-label", t("lv_touch_controls"));
  var sprintBtn = L.hud.touch.querySelector('[data-act="sprint"]');
  var jumpBtn = L.hud.touch.querySelector('[data-act="jump"]');
  var crouchBtn = L.hud.touch.querySelector('[data-act="crouch"]');
  if (sprintBtn) sprintBtn.setAttribute("aria-label", t("lv_control_sprint"));
  if (jumpBtn) jumpBtn.setAttribute("aria-label", t("lv_touch_jump"));
  if (crouchBtn) crouchBtn.setAttribute("aria-label", t("lv_touch_crouch"));
  var webBtn = L.hud.touch.querySelector('[data-act="web"]');
  var zipBtn = L.hud.touch.querySelector('[data-act="zip"]');
  if (webBtn) webBtn.setAttribute("aria-label", t("lv_touch_web"));
  if (zipBtn) zipBtn.setAttribute("aria-label", t("lv_touch_zip"));
  L.hud.mantle.textContent = t("lv_mantle_prompt");
  L.hud.hint.textContent = t("lv_hint");
  var best = L.bestMs ? t("lv_best") + " " + formatTime(L.bestMs) : t("lv_no_best");
  r.querySelector("#lvReady p").textContent = t("lv_ready_copy") + " · " + best;
}

/* The same test the rest of the app uses (js/chrome_posture.js): some Android
   WebViews report a FINE pointer on a pure-touch device, and a coarse-only
   query there left the player with no stick AND a pointer-lock request. */
function wantsTouchControls() {
  return detectTouch();
}

function reduceMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return false;
  }
}

function wallSegs() {
  return L.col && L.col.segs;
}

function applyLavaQuality() {
  var q = gameSettings().quality;
  setGameRendererQuality(q);
  if (L.grp && L.bounds) rebuildLavaMesh(L.grp, L.bounds, q);
}

function previewCourse() {
  ensureBuilt();
  buildCol();
  var scene = getMainScene();
  if (!scene) return;
  if (L.grp) {
    scene.remove(L.grp);
    disposeGroup(L.grp);
  }
  L.grp = new THREE.Group();
  scene.add(L.grp);
  spawnCourseMeshes(L.grp, specFor(gameSettings().diff), gameSettings().quality);
  var spot = spawnPlayer();
  L.p = newPlayer(spot);
  if (L.extract) {
    L.p.yaw = Math.atan2(L.extract.x - L.p.x, L.extract.z - L.p.z);
  }
  L.lavaY = LAVA_START_Y;
  L.t = 0;
  L.visT = 0;
  L.freeze = 0;
}

function resetTouchPointers() {
  L.stick = { x: 0, y: 0 };
  L.lookTouch = null;
  if (L.keys) {
    L.keys.jumpHold = false;
    L.keys.sprint = false;
    L.keys.crouchKey = false;
  }
  if (L.hud && L.hud.stick) {
    var knob = L.hud.stick.querySelector("i");
    if (knob) knob.style.transform = "";
  }
}

function syncResponsiveHud() {
  if (!L.hud || !L.hud.root) return;
  var vv = window.visualViewport;
  var w = Math.round(vv && vv.width ? vv.width : window.innerWidth || 1024);
  var h = Math.round(vv && vv.height ? vv.height : window.innerHeight || 768);
  var touch = wantsTouchControls();
  var ratio = w / Math.max(1, h);
  var root = L.hud.root;
  root.classList.toggle("lv-touch", touch);
  root.classList.toggle("lv-narrow", w <= 360);
  root.classList.toggle("lv-phone", w < 600);
  root.classList.toggle("lv-tablet", touch && w >= 600);
  root.classList.toggle("lv-landscape", ratio > 1.12);
  root.classList.toggle("lv-short", h <= 520);
  var center = document.getElementById("center-canvas");
  if (L.active && center && !center.classList.contains("max-view-3d") && window.__setViewMode)
    window.__setViewMode("3d");
}

function onGameViewportChange() {
  syncResponsiveHud();
  resetTouchPointers();
}

function bindStick() {
  var el = L.hud.stick;
  var origin = null;
  function setFrom(e) {
    if (!origin) return;
    var r = el.getBoundingClientRect();
    var dx = (e.clientX - origin.x) / (r.width * 0.42);
    var dy = (e.clientY - origin.y) / (r.height * 0.42);
    var mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; mag = 1; }
    L.stick = { x: dx, y: -dy };
    el.querySelector("i").style.transform = "translate(" + dx * 22 + "px," + dy * 22 + "px)";
  }
  el.addEventListener("pointerdown", function (e) {
    origin = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
    setFrom(e);
  });
  el.addEventListener("pointermove", function (e) { if (origin) setFrom(e); });
  function end() {
    origin = null;
    L.stick = { x: 0, y: 0 };
    el.querySelector("i").style.transform = "";
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("lostpointercapture", end);
}

function say(msg, dur) {
  if (!L.hud) return;
  L.hud.msg.textContent = msg;
  L.hud.msg.classList.add("on");
  L.msgT = dur || 1.4;
}

function newPlayer(spot) {
  return {
    x: spot.x, y: spot.y, z: spot.z,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0.12,
    crouch: false, sprint: false,
    airborne: false,
    coyote: 0, jumpBuf: 0,
    mantle: 0, mantleY: 0, mantleX: 0, mantleZ: 0,
    bob: 0, speedK: 0,
    dead: false, won: false, deadT: 0,
    extractT: 0,
    gems: 0,
    /* the spider kit: what you are holding, what you fired, and how long
       until you are allowed to stick to something again */
    cling: null, ceil: null, noCling: 0,
    web: null, zip: null, roll: 0, webs: 0,
  };
}

/* ---- the spider kit ---- */

function bodyOf(P) {
  return P && P.crouch ? P_CROUCH_CLEAR : P_CLEAR;
}

function eyeY(P) {
  return P && P.crouch ? EYE_CROUCH : EYE;
}

function clingOpts(P) {
  return {
    wallTop: wallTop(), body: bodyOf(P), rad: P_RAD,
    ceilY: wallTop(), bounds: L.bounds,
  };
}

/* What a fired line is allowed to catch: the same world the walk code
   collides with, plus the ceiling plane the planner never builds a mesh for. */
function webOpts() {
  return { wallTop: wallTop(), ceilY: wallTop(), bounds: L.bounds, range: WEB_RANGE };
}

/* The line leaves the hand, not the pupil — a rope drawn from the exact centre
   of the screen is a dot, and reads as no rope at all. */
function handPos(P) {
  var eye = eyeY(P);
  var f = lookDir(P.yaw, P.pitch);
  var rx = Math.cos(P.yaw),
    rz = -Math.sin(P.yaw);
  return {
    x: P.x + rx * P_RAD * 0.8 + f.x * P_RAD,
    y: P.y + eye - P_RAD * 0.35 + f.y * P_RAD,
    z: P.z + rz * P_RAD * 0.8 + f.z * P_RAD,
  };
}

function releaseWeb(P) {
  if (P) P.web = null;
}

function releaseCling(P, grace) {
  if (!P) return;
  P.cling = null;
  P.ceil = null;
  P.noCling = Math.max(P.noCling || 0, grace || 0);
}

/* Sticking to a surface is a landing: it ends a fall, it is where the combo
   chain continues, and it is the only way up anything taller than a shoebox
   now that the runner is 42cm tall. */
function attachCling(P, cl) {
  P.cling = {
    nx: cl.nx, nz: cl.nz, top: cl.top, bottom: cl.bottom,
    kind: cl.kind, id: cl.id,
  };
  P.ceil = null;
  P.x = cl.px + cl.nx * P_RAD;
  P.z = cl.pz + cl.nz * P_RAD;
  P.vx = 0;
  P.vy = 0;
  P.vz = 0;
  P.airborne = false;
  releaseWeb(P);
  landOn("cling:" + (cl.id == null ? cl.kind : cl.id));
  sndLand();
}

function attachCeiling(P, c) {
  P.ceil = { y: c.y, id: c.id };
  P.cling = null;
  P.y = c.y - bodyOf(P);
  P.vx = 0;
  P.vy = 0;
  P.vz = 0;
  P.airborne = false;
  releaseWeb(P);
  landOn("ceil:" + (c.id == null ? "roof" : c.id));
  sndLand();
}

function tryCling(P) {
  if (!L.col || P.noCling > 0 || P.crouch || P.mantle > 0) return false;
  if (P.vy > 0) {
    var c = findCeiling(L.col, P.x, P.y, P.z, CLING_REACH, clingOpts(P));
    if (c) {
      attachCeiling(P, c);
      return true;
    }
  }
  var cl = findCling(L.col, P.x, P.y, P.z, CLING_REACH, clingOpts(P));
  if (!cl) return false;
  // only into a surface you are actually meeting, so a jump straight up
  // beside a wall is still a jump
  var into = P.vx * -cl.nx + P.vz * -cl.nz;
  if (into < 4 && P.vy > -12) return false;
  attachCling(P, cl);
  return true;
}

/* Off the wall: away from it, along the sightline, and up. */
function wallLeap(P) {
  var f = lookDir(P.yaw, P.pitch);
  if (P.ceil) {
    P.vx = f.x * WALL_JUMP_OUT * 0.8;
    P.vz = f.z * WALL_JUMP_OUT * 0.8;
    P.vy = -20;
  } else {
    var n = P.cling;
    P.vx = n.nx * WALL_JUMP_OUT + f.x * WALL_JUMP_OUT * 0.7;
    P.vz = n.nz * WALL_JUMP_OUT + f.z * WALL_JUMP_OUT * 0.7;
    P.vy = WALL_JUMP_UP;
  }
  releaseCling(P, NO_CLING);
  P.airborne = true;
  P.coyote = 0;
  P.jumpBuf = 0;
}

function fireZip() {
  var P = L.p;
  if (!P || P.dead || P.won || !L.started || L.paused || !L.col) return;
  var eye = eyeY(P);
  var d = lookDir(P.yaw, P.pitch);
  var h = castWeb(L.col, P.x, P.y + eye, P.z, d.x, d.y, d.z, WEB_RANGE, webOpts());
  if (!h || h.dist < WEB_MIN) {
    say(t("lv_web_miss"), 0.6);
    return;
  }
  releaseWeb(P);
  releaseCling(P, 0);
  P.webs++;
  P.zip = { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, kind: h.kind, t: 0 };
  P.mantle = 0;
  sndWeb();
}

function fireWeb() {
  var P = L.p;
  if (!P || P.dead || P.won || !L.started || L.paused || !L.col) return;
  if (P.web) return;
  var eye = eyeY(P);
  var h = aimAnchor(L.col, P.x, P.y + eye, P.z, P.yaw, P.pitch, webOpts());
  if (!h) {
    say(t("lv_web_miss"), 0.6);
    return;
  }
  releaseCling(P, NO_CLING);
  P.zip = null;
  P.webs++;
  var len = Math.hypot(P.x - h.x, P.y - h.y, P.z - h.z);
  P.web = { x: h.x, y: h.y, z: h.z, len: Math.max(SWING_MIN_LEN, len), taut: false };
  /* Fired from a standstill the rope is already slack at exactly its own
     length, so nothing happens: you stand there attached to the ceiling. The
     first swing has to be a launch — off the floor and along the line — and
     from then on the arc feeds itself. */
  if (!P.airborne) {
    var fx = h.x - P.x,
      fz = h.z - P.z,
      fl = Math.hypot(fx, fz);
    P.vy = Math.max(P.vy, JUMP_V * 0.9);
    if (fl > 1) {
      P.vx += (fx / fl) * SPD_SPRINT * 0.85;
      P.vz += (fz / fl) * SPD_SPRINT * 0.85;
    }
  }
  P.airborne = true;
  sndWeb();
}

/* The zip ignores the collision hull on purpose: the line was fired down a
   clear ray, so the flight along it is clear by construction, and stepping it
   through moveCircle instead made every zip stop dead on the doorframe it had
   just been aimed through. */
function stepZip(P, dt) {
  var z = P.zip;
  z.t += dt;
  var ty = z.y;
  if (z.ny > 0.5) ty = z.y; // a top face: stand on it
  else if (z.ny < -0.5) ty = z.y - bodyOf(P); // an underside: hang off it
  else ty = z.y - bodyOf(P) * 0.5; // a wall: meet it chest-on
  var dx = z.x - z.nx * P_RAD - P.x,
    dy = ty - P.y,
    dz = z.z - z.nz * P_RAD - P.z;
  var d = Math.hypot(dx, dy, dz);
  var stepLen = ZIP_SPEED * dt;
  if (d <= Math.max(ZIP_ARRIVE, stepLen) || z.t > ZIP_MAX_T || d < 1e-3) {
    if (d > 1e-3) {
      P.x += dx;
      P.y += dy;
      P.z += dz;
    }
    P.zip = null;
    P.noCling = 0;
    // carry a little of the pull out the far side, so a zip chains into a jump
    P.vx = d > 1e-3 ? (dx / d) * ZIP_SPEED * 0.35 : 0;
    P.vz = d > 1e-3 ? (dz / d) * ZIP_SPEED * 0.35 : 0;
    P.vy = 0;
    P.airborne = true;
    if (z.ny < -0.5) {
      var c = findCeiling(L.col, P.x, P.y, P.z, CLING_REACH * 2, clingOpts(P));
      if (c) attachCeiling(P, c);
    } else if (Math.abs(z.ny) < 0.5) {
      var cl = findCling(L.col, P.x, P.y, P.z, CLING_REACH * 2, clingOpts(P));
      if (cl) attachCling(P, cl);
    }
    return;
  }
  P.x += (dx / d) * stepLen;
  P.y += (dy / d) * stepLen;
  P.z += (dz / d) * stepLen;
  P.vx = (dx / d) * ZIP_SPEED;
  P.vy = (dy / d) * ZIP_SPEED;
  P.vz = (dz / d) * ZIP_SPEED;
  P.airborne = true;
}

/* Crawling. Movement is in the plane of the surface and steered by the
   sightline, then the body is re-glued to whatever is nearest — which is what
   carries the runner around an outside corner without a special case for it. */
function stepCling(P, dt) {
  var K = L.keys;
  if (K.crouchKey) {
    releaseCling(P, NO_CLING);
    return;
  }
  var stickX = L.stick ? L.stick.x : 0,
    stickY = L.stick ? L.stick.y : 0;
  var mF = (K.fwd ? 1 : 0) - (K.back ? 1 : 0) + stickY,
    mR = (K.right ? 1 : 0) - (K.left ? 1 : 0) + stickX;
  var ml = Math.hypot(mF, mR);
  if (ml > 1) {
    mF /= ml;
    mR /= ml;
  }
  var spd = K.sprint ? CRAWL_SPRINT : CRAWL_SPD;
  P.speedK = clamp(Math.hypot(mF, mR) * (spd / SPD_WALK), 0, 2.4);

  if (P.ceil) {
    var f = lookDir(P.yaw, 0);
    var rx = Math.cos(P.yaw),
      rz = -Math.sin(P.yaw);
    _movePoint2D.x = P.x;
    _movePoint2D.z = P.z;
    var body = bodyOf(P);
    moveCircle(
      _movePoint2D,
      (f.x * mF + rx * mR) * spd * dt,
      (f.z * mF + rz * mR) * spd * dt,
      P_RAD, P.y, body, STEP
    );
    P.x = _movePoint2D.x;
    P.z = _movePoint2D.z;
    var c = findCeiling(L.col, P.x, P.y, P.z, CLING_REACH * 2.2, clingOpts(P));
    if (!c) {
      releaseCling(P, 0.05);
      return;
    }
    P.ceil = c;
    P.y = c.y - body;
    return;
  }

  var cl = P.cling;
  var b = wallBasis(cl.nx, cl.nz, P.yaw, P.pitch);
  P.x += (b.ux * mF + b.rx * mR) * spd * dt;
  P.y += (b.uy * mF + b.ry * mR) * spd * dt;
  P.z += (b.uz * mF + b.rz * mR) * spd * dt;
  P.vx = 0;
  P.vy = 0;
  P.vz = 0;

  var g = groundAt(P.x, P.z, P.y + 2, STEP);
  if (P.y <= g) {
    P.y = g;
    releaseCling(P, 0.02);
    return;
  }
  if (P.y >= cl.top - 1) {
    if (cl.kind === "wall") {
      // the top of a wall is the ceiling: there is nothing to step onto
      P.y = cl.top - 1;
      var c2 = findCeiling(L.col, P.x, P.y, P.z, CLING_REACH * 2, clingOpts(P));
      if (c2) attachCeiling(P, c2);
      return;
    }
    // over the lip and onto the top face
    P.y = cl.top;
    P.x -= cl.nx * (P_RAD + 2);
    P.z -= cl.nz * (P_RAD + 2);
    var gt = groundAt(P.x, P.z, P.y + 4, STEP);
    if (gt > P.y - 6 && gt < P.y + 8) P.y = gt;
    releaseCling(P, 0.05);
    sndLand();
    return;
  }
  var next = findCling(L.col, P.x, P.y, P.z, CLING_REACH * 2.2, clingOpts(P));
  if (!next) {
    releaseCling(P, 0.05);
    return;
  }
  P.cling = {
    nx: next.nx, nz: next.nz, top: next.top, bottom: next.bottom,
    kind: next.kind, id: next.id,
  };
  P.x = next.px + next.nx * P_RAD;
  P.z = next.pz + next.nz * P_RAD;
}

function landOn(id) {
  var c = comboOnLand(L.lastLandId, id, L.combo);
  L.combo = c.combo;
  L.lastLandId = c.id;
  if (c.freeze) L.freeze += c.freeze;
  if (!reduceMotion()) L.fovPunch = Math.max(L.fovPunch || 0, 4);
}

function restart() {
  ensureBuilt();
  clearScorch();
  (L.doorsOpened || []).forEach(function (d) {
    if (d && d.userData) d.userData.open = false;
  });
  L.doorsOpened = [];
  buildCol();
  if (L.grp) {
    var scene = getMainScene();
    scene.remove(L.grp);
    disposeGroup(L.grp);
  }
  var scene = getMainScene();
  L.grp = new THREE.Group();
  scene.add(L.grp);
  var spec = specFor(gameSettings().diff);
  spawnCourseMeshes(L.grp, spec, gameSettings().quality);
  loadGhost();
  var spot = spawnPlayer();
  L.p = newPlayer(spot);
  /* The siren lasts as long as THIS start needs. Everything downstream reads
     L.spec rather than the difficulty table, so the run has one clock. */
  var step = firstStep(L.platforms, spot.x, spot.z, spot.y, wallSegs());
  L.spec = Object.assign({}, spec, {
    countdown: countdownFor(spec, step ? step.dist : 0, 1),
  });
  if (L.extract) {
    L.p.yaw = Math.atan2(L.extract.x - L.p.x, L.extract.z - L.p.z);
  }
  L.t = 0;
  L.visT = 0;
  L.runMs = 0;
  L.lavaY = LAVA_START_Y;
  L.freeze = 0;
  L.combo = 0;
  L.lastLandId = null;
  L.started = true;
  L.paused = false;
  L.endDelay = 0;
  L.endShown = false;
  L.fovPunch = 0;
  L.ghostFade = 0;
  L.ghostRec = [];
  L.ghostLast = -1e9;
  L.keys = {};
  L.stick = { x: 0, y: 0 };
  L.hud.end.classList.remove("on");
  L.hud.ready.classList.remove("on");
  L.hud.pause.classList.remove("on");
  L.hud.hint.classList.remove("fade");
  L.hud.root.classList.remove("ended", "paused", "ready");
  audioOpen();
  startRumble();
  sndSiren();
  _sirenT = 0.9;
  lockPointer();
  syncResponsiveHud();
  if (wantsTouchControls()) L.hud.touch.classList.add("on");
  else L.hud.touch.classList.remove("on");
}

/* The difficulty table is the floor; the live run's clock is L.spec. */
function runSpec() {
  return L.spec || specFor(gameSettings().diff);
}

function beginRun() {
  restart();
}

function showReady() {
  L.started = false;
  L.paused = false;
  L.endShown = false;
  L.endDelay = 0;
  /* stepCamera needs a player to have a viewpoint at all, and without one the
     briefing card sat over whatever the orbit camera happened to be buried in.
     A parked player puts the camera at eye height on the spawn tile, so the
     card is framed by the room the run is about to happen in. */
  previewCourse();
  loadGhost();
  localizeHud();
  syncResponsiveHud();
  L.hud.ready.classList.add("on");
  L.hud.root.classList.add("ready");
  L.hud.end.classList.remove("on");
  L.hud.pause.classList.remove("on");
}

function pauseGame(on) {
  if (!L.active || !L.started || (L.p && (L.p.dead || L.p.won))) return;
  L.paused = !!on;
  L.hud.pause.classList.toggle("on", L.paused);
  L.hud.root.classList.toggle("paused", L.paused);
  if (L.paused) {
    stopRumble();
    unlockPointer();
  } else lockPointer();
}

function showEndCard() {
  if (L.endShown || !L.p || !L.hud) return;
  L.endShown = true;
  var P = L.p;
  var totalGems = (L.gems || []).length;
  var perfect = totalGems > 0 && P.gems >= totalGems;
  if (P.won) {
    var ms = L.runMs;
    var isBest = !L.bestMs || ms < L.bestMs;
    if (isBest) {
      saveGhost(ms);
      L.bestMs = Math.round(ms);
    }
    L.hud.end.querySelector("h2").textContent = t("lv_win");
    L.hud.end.querySelector("p").textContent =
      t("lv_win_copy", { time: formatTime(ms), gems: String(P.gems) }) +
      (perfect ? " · " + t("lv_all_gems") : "") +
      (isBest ? " · " + t("lv_new_best") : "");
  } else {
    L.hud.end.querySelector("h2").textContent = t("lv_dead");
    L.hud.end.querySelector("p").textContent = t("lv_dead_copy", { time: formatTime(L.runMs) });
  }
  L.hud.end.classList.add("on");
  L.hud.root.classList.add("ended");
  unlockPointer();
}

function finishRun(won) {
  var P = L.p;
  if (!P || P.dead || P.won) return;
  stopRumble();
  if (won) {
    P.won = true;
    sndExtract();
    L.fovPunch = reduceMotion() ? 0 : 6;
    L.endDelay = 0.2;
  } else {
    P.dead = true;
    sndBurn();
    L.fovPunch = reduceMotion() ? 0 : 14;
    L.endDelay = DEATH_HOLD;
  }
}

function tryJump() {
  var P = L.p;
  if (!P || P.dead || P.won || P.mantle > 0) return;
  P.jumpBuf = JUMP_BUF;
  maybeJump();
}

function maybeJump() {
  var P = L.p;
  if (!P || P.jumpBuf <= 0) return;
  if (P.cling || P.ceil) {
    wallLeap(P);
    return;
  }
  var g = groundAt(P.x, P.z, P.y, STEP);
  var grounded = P.y <= g + 3 && P.vy <= 40;
  if (!grounded && P.coyote <= 0) return;
  P.vy = JUMP_V * (P.crouch ? 0.78 : 1);
  P.airborne = true;
  P.coyote = 0;
  P.jumpBuf = 0;
}

function tryMantle() {
  var P = L.p;
  if (!P || P.mantle > 0 || P.dead || P.won) return;
  /* Jump is one key for two moves, and the wall leap has to win: with a ledge
     anywhere in reach the mantle used to fire on the same keypress a frame
     later and swallow the leap whole — vaulting you straight back onto the
     thing you had just pushed off. */
  if (P.noCling > 0 || P.web || P.zip) return;
  if (!L.keys.fwd && !(L.stick && L.stick.y > 0.4) && P.jumpBuf <= 0 && !L.keys.jumpHold) return;
  var ledge = mantleTarget(L.platforms, P.x, P.z, P.y, P.yaw, { lavaY: L.lavaY });
  if (!ledge) return;
  P.mantle = MANTLE_DUR;
  P.mantleY = ledge.y1;
  var mx = Math.min(8, (ledge.x1 - ledge.x0) * 0.45);
  var mz = Math.min(8, (ledge.z1 - ledge.z0) * 0.45);
  P.mantleX = clamp(P.x + Math.sin(P.yaw) * 18, ledge.x0 + mx, ledge.x1 - mx);
  P.mantleZ = clamp(P.z + Math.cos(P.yaw) * 18, ledge.z0 + mz, ledge.z1 - mz);
  P.vy = 0;
  P.jumpBuf = 0;
}

function stepPlayer(dt) {
  var P = L.p, K = L.keys;
  if (!P || P.dead || P.won) {
    if (P) P.deadT += dt;
    return;
  }
  if (P.jumpBuf > 0) P.jumpBuf -= dt;
  if (P.coyote > 0) P.coyote -= dt;
  if (P.noCling > 0) P.noCling -= dt;
  if (P.zip) {
    stepZip(P, dt);
    P.bob += dt * 6;
    return;
  }
  if (P.cling || P.ceil) {
    P.crouch = false;
    stepCling(P, dt);
    maybeJump();
    return;
  }
  if (K.jumpHold) tryMantle();

  if (P.mantle > 0) {
    P.mantle -= dt;
    var k = 1 - P.mantle / MANTLE_DUR;
    P.y = P.y + (P.mantleY - P.y) * Math.min(1, k * 3.2);
    P.x += (P.mantleX - P.x) * Math.min(1, dt * 8);
    P.z += (P.mantleZ - P.z) * Math.min(1, dt * 8);
    P.vx = 0;
    P.vz = 0;
    P.vy = 40;
    if (P.mantle <= 0) {
      P.mantle = 0; // a residual -0.01 leaks into every `mantle > 0` guard
      P.y = P.mantleY;
      P.x = P.mantleX;
      P.z = P.mantleZ;
      P.vy = 0;
    }
    return;
  }

  var stickX = L.stick ? L.stick.x : 0,
    stickY = L.stick ? L.stick.y : 0,
    stickMag = Math.hypot(stickX, stickY);
  var moving = K.fwd || K.back || K.left || K.right || stickMag > 0.12;
  P.sprint = (!!K.sprint || stickMag > 0.82) && !P.crouch && moving;
  P.crouch = !!K.crouchKey;
  var spd = P.crouch ? SPD_CROUCH : P.sprint ? SPD_SPRINT : SPD_WALK;
  var fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = -fz, rz = fx, mx = 0, mz = 0;
  if (K.fwd) { mx += fx; mz += fz; }
  if (K.back) { mx -= fx; mz -= fz; }
  if (K.right) { mx += rx; mz += rz; }
  if (K.left) { mx -= rx; mz -= rz; }
  if (stickMag > 0.04) {
    mx += fx * stickY + rx * stickX;
    mz += fz * stickY + rz * stickX;
  }
  var l = Math.hypot(mx, mz);
  if (l > 0.001) { mx /= l; mz /= l; }
  var damp = dampingFactor(ACCEL, dt);
  if (P.web) {
    /* On the rope you steer, you do not drive: damping toward a walk speed
       would eat the arc the swing is entirely made of. */
    P.vx += mx * SWING_ACCEL * dt;
    P.vz += mz * SWING_ACCEL * dt;
    var cap = SPD_SPRINT * 3.6,
      flat = Math.hypot(P.vx, P.vz);
    if (flat > cap) {
      P.vx *= cap / flat;
      P.vz *= cap / flat;
    }
  } else {
    P.vx += (mx * spd - P.vx) * damp;
    P.vz += (mz * spd - P.vz) * damp;
  }
  _movePoint2D.x = P.x;
  _movePoint2D.z = P.z;
  var body = bodyOf(P);
  if (isPhysicsEnabled()) {
    var next = moveKinematicCapsule(P.x, P.y, P.z, P.vx * dt, 0, P.vz * dt, P_RAD, body);
    P.x = next.x;
    P.z = next.z;
  } else {
    moveCircle(_movePoint2D, P.vx * dt, P.vz * dt, P_RAD, P.y, body, STEP);
    P.x = _movePoint2D.x;
    P.z = _movePoint2D.z;
  }
  var g = groundAt(P.x, P.z, P.y, STEP);
  var wasAir = P.airborne;
  if (g > P.y) P.y = Math.min(g, P.y + 320 * dt);
  else {
    P.vy -= GRAV * dt;
    P.y += P.vy * dt;
    if (P.y <= g) {
      P.y = g;
      P.vy = 0;
    }
  }
  if (P.web) stepSwing(P, dt);
  P.airborne = P.y > g + 2 || P.vy > 0 || !!P.web;
  if (!P.airborne) P.coyote = COYOTE;
  if (wasAir && !P.airborne) {
    sndLand();
    landOn(landIdAt(P.x, P.z, P.y));
  }
  maybeJump();
  if (P.airborne && (K.jumpHold || P.jumpBuf > 0)) tryMantle();
  if (P.airborne && !P.web && !P.mantle) tryCling(P);

  P.speedK = clamp(Math.hypot(P.vx, P.vz) / SPD_WALK, 0, 2.4);
  P.bob += dt * Math.hypot(P.vx, P.vz) * (P.sprint ? 0.05 : 0.04);

  var gem = collectGem(L.gems, P.x, P.y + 35, P.z);
  if (gem) {
    gem.taken = true;
    P.gems++;
    L.freeze += gem.freeze || GEM_FREEZE;
    sndGem();
    if (!reduceMotion()) L.fovPunch = Math.max(L.fovPunch || 0, 3);
    say(t("lv_gem_got"), 0.9);
  }
  /* Not until the siren stops. The beacon used to be live through the whole
     countdown, so a spawn next to it ended the run at 0:00.00 — a "personal
     best" nobody can ever beat, recorded before the clock had started and with
     too few ghost samples to save a replay of. */
  if (L.t >= runSpec().countdown && reachedExtract(L.extract, P.x, P.y, P.z)) {
    P.extractT += dt;
    if (P.extractT >= EXTRACT_HOLD) finishRun(true);
  } else P.extractT = 0;

  if (L.col)
    L.col.doorSegs.forEach(function (ds) {
      if (!ds.pivot || ds.pivot.userData.open) return;
      var mx2 = (ds.ax + ds.bx) / 2,
        mz2 = (ds.az + ds.bz) / 2;
      if (Math.hypot(P.x - mx2, P.z - mz2) < 95) {
        ds.pivot.userData.open = true;
        L.doorsOpened.push(ds.pivot);
      }
    });
}

/* The rope, applied after the frame's own integration: hold forward or jump to
   reel in and the arc tightens into a climb, let go and everything the swing
   built is still in the velocity. */
function stepSwing(P, dt) {
  var w = P.web,
    K = L.keys;
  if (K.fwd || K.jumpHold) w.len = Math.max(SWING_MIN_LEN, w.len - REEL_SPD * dt);
  if (!w.taut) {
    // a slack line hauls itself in until it has an arc to swing on
    w.len = Math.max(hangLength(w.y, P.y), w.len - AUTO_REEL * dt);
  }
  var r = ropeConstrain(P.x, P.y, P.z, P.vx, P.vy, P.vz, w.x, w.y, w.z, w.len);
  w.taut = !!r;
  if (r) {
    P.x = r.x;
    P.y = r.y;
    P.z = r.z;
    P.vx = r.vx;
    P.vy = r.vy;
    P.vz = r.vz;
    _movePoint2D.x = P.x;
    _movePoint2D.z = P.z;
    collideCircle(_movePoint2D, P_RAD, P.y, bodyOf(P), STEP);
    /* The rope does not know about the sideboard. Without a response to the
       push-out the constraint just re-seats the body against it every frame
       and the swing grinds along the wall at full speed, going nowhere. Kill
       the speed that went into the surface, and on a real impact let go — a
       swing that ends against a wall is a swing that ends stuck to it. */
    var px = _movePoint2D.x - P.x,
      pz = _movePoint2D.z - P.z,
      pl = Math.hypot(px, pz);
    P.x = _movePoint2D.x;
    P.z = _movePoint2D.z;
    if (pl > 0.01) {
      var nx = px / pl,
        nz = pz / pl,
        into = -(P.vx * nx + P.vz * nz);
      if (into > 0) {
        P.vx += nx * into;
        P.vz += nz * into;
        if (into > 40) releaseWeb(P);
      }
    }
  }
  var g = groundAt(P.x, P.z, P.y, STEP);
  if (P.y < g) {
    P.y = g;
    if (P.vy < 0) P.vy = 0;
  }
  // reeled all the way to the anchor: the rope is spent
  if (P.y > w.y - P_RAD * 1.5 || w.len <= SWING_MIN_LEN + 0.01) {
    if (Math.hypot(P.x - w.x, P.y - w.y, P.z - w.z) < SWING_MIN_LEN + 2) releaseWeb(P);
  }
}

function landIdAt(x, z, y) {
  var R = L.platforms || [];
  for (var i = 0; i < R.length; i++) {
    var rc = R[i];
    if (x < rc.x0 || x > rc.x1 || z < rc.z0 || z > rc.z1) continue;
    if (Math.abs(rc.y1 - y) < 8) return (rc.item && (rc.item.id || rc.item.type)) || i;
  }
  return y < 4 ? "floor" : null;
}

function stepCamera(dt) {
  var cam = getMainCamera();
  var P = L.p;
  if (!cam || !P) return;
  var eye = eyeY(P);
  var bob = P.airborne || P.mantle > 0 ? 0 : Math.sin(P.bob) * 2.4 * P_SCALE * P.speedK;
  cam.position.set(P.x, P.y + eye + bob, P.z);
  var dx = Math.cos(P.pitch) * Math.sin(P.yaw),
    dy = Math.sin(P.pitch),
    dz = Math.cos(P.pitch) * Math.cos(P.yaw);
  /* The rope is the one thing in this mode that banks the horizon. Rolling the
     camera with the swing is what tells you which way the arc is going when
     the walls are a blur; the head stays level for everything else, cling and
     ceiling crawl included, because a wall crawl that rolls the world 90° is
     motion sickness, not a power. */
  var rollTo = 0;
  if (P.web && !reduceMotion()) {
    var rgt = Math.hypot(dx, dz) || 1;
    rollTo = clamp((P.vx * (-dz / rgt) + P.vz * (dx / rgt)) / 620, -0.42, 0.42);
  }
  P.roll += (rollTo - P.roll) * Math.min(1, dt * 5);
  if (Math.abs(P.roll) > 0.002) {
    var ur = Math.hypot(dx, dz) || 1,
      sr = Math.sin(P.roll),
      cr = Math.cos(P.roll);
    cam.up.set((-dz / ur) * sr, cr, (dx / ur) * sr);
  } else cam.up.set(0, 1, 0);
  cam.lookAt(P.x + dx * 400, P.y + eye + bob + dy * 400, P.z + dz * 400);
  var line = P.web || P.zip;
  updateWebLine(line ? handPos(P) : null, line);
  var motion = !reduceMotion();
  var heat = heatFactor(P.y, L.lavaY);
  var punch = L.fovPunch || 0;
  if (P.dead) punch += Math.min(10, (P.deadT || 0) * 12);
  cam.fov = motion ? 68 + heat * 8 + (P.sprint ? 4 : 0) + punch : 68;
  cam.updateProjectionMatrix();
}

function stepHud(spec, dt) {
  var P = L.p, h = L.hud;
  if (!P || !h) return;
  var rising = L.t >= spec.countdown;
  // the controls line has done its job once the player is running
  h.hint.classList.toggle("fade", L.t > spec.countdown + 2.2);
  h.time.textContent = formatTime(L.runMs);
  // a "lead" over the record before the clock has even started is meaningless
  h.delta.textContent = L.bestMs && rising ? formatDelta(L.runMs - L.bestMs) : "";
  h.delta.classList.toggle("behind", L.bestMs && L.runMs > L.bestMs);
  var left = L.gems.filter(function (g) { return !g.taken; }).length;
  h.gems.textContent = t("lv_gems", { n: String(P.gems), left: String(left) });
  var top = L.extract ? L.extract.y : 260;
  /* Before the melt starts the same bar drains the siren: standing still
     watching a 0% bar told the player nothing about how long they had. */
  var u = rising
    ? clamp(L.lavaY / Math.max(40, top), 0, 1)
    : 1 - clamp(L.t / Math.max(0.1, spec.countdown), 0, 1);
  h.rise.classList.toggle("counting", !rising);
  h.rise.classList.toggle("frozen", L.freeze > 0.04);
  h.riseFill.style.width = Math.round(u * 100) + "%";
  if (h.freezeFill)
    h.freezeFill.style.width = Math.round(clamp(L.freeze / FREEZE_BAR, 0, 1) * 100) + "%";
  h.riseLbl.textContent = L.freeze > 0.04 ? t("lv_frozen") : rising ? t("lv_rising") : t("lv_siren");
  h.combo.textContent = L.combo >= 2 ? t("lv_combo", { n: String(L.combo) }) : "";
  var heat = heatFactor(P.y, L.lavaY);
  h.heat.style.opacity = String(0.15 + heat * 0.7);
  h.vig.style.opacity = String(heat * 0.85);
  if (h.haze) {
    var hazeOn = heat > 0.45 && !reduceMotion();
    h.haze.style.opacity = hazeOn ? String((heat - 0.45) * 1.4) : "0";
  }
  var ledge = mantleTarget(L.platforms, P.x, P.z, P.y, P.yaw, { lavaY: L.lavaY });
  if (h.mantle) h.mantle.classList.toggle("on", !!(ledge && L.started && !P.dead && !P.won && !L.paused));
  if (h.compass && L.extract && L.started && !L.paused) {
    var hx = L.extract.x - P.x,
      hz = L.extract.z - P.z;
    var heading = Math.atan2(hx, hz) - P.yaw;
    h.compass.style.transform = "translate(-50%, -50%) rotate(" + heading + "rad)";
    h.compass.classList.add("on");
  } else if (h.compass) h.compass.classList.remove("on");
  /* What the crosshair is for: whether there is anything to fire at, and
     whether you are currently holding on to the house. */
  /* Six rays over every wall and box in the plan, four times a second rather
     than sixty: the reticle is a hint, and nobody can see it flicker. */
  _aimT -= dt || 0.016;
  if (_aimT <= 0) {
    _aimT = 0.25;
    _aimOn = false;
    if (L.col && L.started && !L.paused && !P.dead && !P.won && !P.web && !P.zip)
      _aimOn = !!aimAnchor(L.col, P.x, P.y + eyeY(P), P.z, P.yaw, P.pitch, webOpts());
  }
  h.root.classList.toggle("aim", _aimOn && !P.web && !P.zip);
  h.root.classList.toggle("clung", !!(P.cling || P.ceil));
  h.root.classList.toggle("swing", !!(P.web || P.zip));
  if (L.msgT > 0) {
    L.msgT -= dt || 0.016;
    if (L.msgT <= 0) h.msg.classList.remove("on");
  }
  if (rising) {
    if (L.t < spec.countdown + 0.8) {
      h.count.textContent = t("lv_go");
      h.count.classList.add("on");
    } else {
      h.count.classList.remove("on");
    }
  } else {
    var n = Math.ceil(spec.countdown - L.t);
    h.count.textContent = String(Math.max(1, n));
    h.count.classList.add("on");
  }
}

/* Sampled on the RUN clock, not the wall clock. A ghost is played back against
   L.runMs, so pacing it by performance.now() made the recording thin out
   exactly when the frame rate dropped — the moment the replay most needed to
   describe — and a run whose frames were slower than real time could finish
   with too few samples to save at all. */
function recordGhost() {
  var P = L.p;
  if (!P || !L.started || !(L.runMs >= 0) || L.t < runSpec().countdown) return;
  if (L.ghostRec.length && L.runMs - L.ghostLast < GHOST_SAMPLE_MS) return;
  L.ghostLast = L.runMs;
  L.ghostRec.push(ghostSample(L.runMs, 0, P.x, P.y, P.z, P.yaw));
}

function tick(deltaMs) {
  if (!L.active) return true;
  var dt = safeDeltaSeconds(deltaMs);
  var motion = !reduceMotion();
  L.visT = (L.visT || 0) + (motion ? dt : 0);
  if (L.fovPunch) L.fovPunch = Math.max(0, L.fovPunch - dt * 18);
  var P = L.p;
  if (L.paused || !L.started) {
    stepLavaVisual(L.lavaMesh, L.lavaY, L.visT, P ? heatFactor(P.y, L.lavaY) : 0.25, P ? P.x : null, P ? P.z : null, L.freeze, motion && L.freeze <= 0);
    stepCourseVisuals(dt, L.visT, motion);
    stepCamera(dt);
    return true;
  }
  if (P && (P.dead || P.won)) {
    P.deadT = (P.deadT || 0) + dt;
    if (!P.won) {
      L.t += dt;
      L.lavaY = nextLavaY(L.lavaY, dt, L.t, runSpec(), 0);
    }
    stepLavaVisual(L.lavaMesh, L.lavaY, L.visT, heatFactor(P.y, L.lavaY), P.x, P.z, 0, motion);
    stepCamera(dt);
    if (L.endDelay > 0) {
      L.endDelay -= dt;
      if (L.endDelay <= 0) showEndCard();
    } else if (!L.endShown) showEndCard();
    return true;
  }
  var spec = runSpec();
  forEachPhysicsStep(dt, function (slice) {
    stepPlayer(slice);
  });
  L.t += dt;
  if (L.t >= spec.countdown) L.runMs += dt * 1000;
  if (L.freeze > 0) L.freeze = Math.max(0, L.freeze - dt);
  L.lavaY = nextLavaY(L.lavaY, dt, L.t, spec, L.freeze);
  var heat = P ? heatFactor(P.y, L.lavaY) : 0;
  L.heat = heat;
  stepLavaVisual(L.lavaMesh, L.lavaY, L.visT, heat, P ? P.x : null, P ? P.z : null, L.freeze, motion && L.freeze <= 0);
  stepCourseVisuals(dt, L.visT, motion);
  stepGuide(P ? firstStep(L.platforms, P.x, P.z, P.y, wallSegs()) : null, L.t < spec.countdown, L.t);
  _scorchT += dt;
  if (_scorchT > 0.2) {
    _scorchT = 0;
    applyScorch(L.lavaY);
  }
  _sirenT += dt;
  if (L.t < spec.countdown && _sirenT > 1.05) {
    _sirenT = 0;
    sndSiren();
  }
  stepRumble(heat, L.t >= spec.countdown);
  if (P && !P.dead && !P.won && isBurned(P.y, L.lavaY, BURN_MARGIN) && L.t >= spec.countdown) {
    finishRun(false);
  }
  recordGhost();
  if (gameSettings().ghost && L.ghostPlay && L.t >= spec.countdown) {
    L.ghostFade = Math.min(1, (L.ghostFade || 0) + dt * 2.4);
    stepGhostVisual(interpolateGhost(L.ghostPlay.s, L.runMs / 1000), true, L.ghostFade);
  } else {
    L.ghostFade = 0;
    stepGhostVisual(null, false);
  }
  stepCamera(dt);
  stepHud(spec, dt);
  return true;
}

function applyLookDelta(dx, dy, touch) {
  var P = L.p;
  if (!P || P.dead || P.won || L.paused || !L.started) return;
  var cfg = gameSettings();
  var sens = 0.0022 * (cfg.sens || 1) * (touch ? 1.15 : 1);
  var invert = cfg.invertY ? -1 : 1;
  P.yaw -= dx * sens;
  P.pitch = clamp(P.pitch - dy * sens * invert, -1.35, 1.35);
}

function onKeyDown(e) {
  if (!L.active) return;
  e.stopImmediatePropagation();
  if ((e.code === "KeyP" || e.code === "Escape") && L.started && L.p && !L.p.dead && !L.p.won) {
    if (e.code === "Escape" && L.locked) return;
    pauseGame(!L.paused);
    e.preventDefault();
    return;
  }
  if (L.p && (L.p.dead || L.p.won) && (e.code === "KeyR" || e.code === "Space")) {
    restart();
    e.preventDefault();
    return;
  }
  if (!L.started || L.paused) {
    if (e.code === "Space" && !L.started) beginRun();
    e.preventDefault();
    return;
  }
  var m = KEYMAP[e.code];
  if (m) {
    L.keys[m] = true;
    e.preventDefault();
    return;
  }
  if (e.code === "KeyF") {
    if (!L.keys.web) {
      L.keys.web = true;
      fireWeb();
    }
    e.preventDefault();
    return;
  }
  if (e.code === "KeyE") {
    fireZip();
    e.preventDefault();
    return;
  }
  if (e.code === "Space") {
    L.keys.jumpHold = true;
    tryJump();
    e.preventDefault();
  }
}

function onKeyUp(e) {
  if (!L.active) return;
  e.stopImmediatePropagation();
  var m = KEYMAP[e.code];
  if (m) L.keys[m] = false;
  if (e.code === "KeyF") {
    L.keys.web = false;
    if (L.p) releaseWeb(L.p);
  }
  if (e.code === "Space") L.keys.jumpHold = false;
}

function onMouseMove(e) {
  if (!L.active || !L.started || L.paused) return;
  applyLookDelta(e.movementX || 0, e.movementY || 0, false);
}

/* Re-grab the cursor when the player clicks back into the world — but ONLY
   the world. Bound at window level with no target test, this used to fire on
   the pause menu and the briefing card too, and its preventDefault() meant the
   look-sensitivity and volume sliders could not be dragged at all: mousedown
   never reached them. */
function onMouseDown(e) {
  if (!L.active || !L.started || L.paused) return;
  if (L.p && (L.p.dead || L.p.won)) return;
  if (e.target && e.target.closest && e.target.closest("#lvHud .lv-card, #lvPauseBtn, #lvTouch")) return;
  /* Once the cursor is captured the two mouse buttons ARE the web: left holds
     a swing line, right fires a zip. Before that, a click is still just the
     click that grabs the cursor back. */
  if (L.locked) {
    if (e.button === 2) fireZip();
    else if (e.button === 0) {
      L.keys.web = true;
      fireWeb();
    }
  } else lockPointer();
  e.preventDefault();
}

function onMouseUp(e) {
  if (!L.active) return;
  if (e.button === 0 && L.keys.web) {
    L.keys.web = false;
    if (L.p) releaseWeb(L.p);
  }
}

function onContext(e) {
  if (L.active) e.preventDefault();
}

function onLockChange() {
  var cv = document.getElementById("v3d");
  var was = L.locked;
  L.locked = document.pointerLockElement === cv;
  if (was && !L.locked && L.active && L.started && L.p && !L.p.dead && !L.p.won && !L.paused) {
    pauseGame(true);
  }
}

function lockPointer() {
  if (wantsTouchControls()) return;
  var cv = document.getElementById("v3d");
  if (cv && !document.pointerLockElement && cv.requestPointerLock) {
    try {
      var req = cv.requestPointerLock();
      if (req && req.catch) req.catch(function () {});
    } catch (e) {}
  }
}

function unlockPointer() {
  if (document.pointerLockElement && document.exitPointerLock) {
    try { document.exitPointerLock(); } catch (e) {}
  }
}

function onLookPointerDown(e) {
  if (!L.active || !L.started || L.paused || !wantsTouchControls()) return;
  if (e.pointerType === "mouse") return;
  var t = e.target;
  if (t && t.closest && t.closest("#lvStick, .lv-touch-actions, #lvPauseBtn, #lvPause, #lvReady, #lvEnd, button, input, label")) return;
  L.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
}

function onLookPointerMove(e) {
  if (!L.lookTouch || e.pointerId !== L.lookTouch.id) return;
  applyLookDelta(e.clientX - L.lookTouch.x, e.clientY - L.lookTouch.y, true);
  L.lookTouch.x = e.clientX;
  L.lookTouch.y = e.clientY;
}

function onLookPointerUp(e) {
  if (L.lookTouch && e.pointerId === L.lookTouch.id) L.lookTouch = null;
}

function bindEvents() {
  if (L.bound) return;
  L.bound = true;
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("contextmenu", onContext);
  document.addEventListener("pointerlockchange", onLockChange);
  window.addEventListener("pointerdown", onLookPointerDown);
  window.addEventListener("pointermove", onLookPointerMove);
  window.addEventListener("pointerup", onLookPointerUp);
  window.addEventListener("pointercancel", onLookPointerUp);
  window.addEventListener("orientationchange", onGameViewportChange);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", onGameViewportChange);
  window.addEventListener("resize", onGameViewportChange);
}

function unbindEvents() {
  if (!L.bound) return;
  L.bound = false;
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("keyup", onKeyUp, true);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mouseup", onMouseUp);
  window.removeEventListener("contextmenu", onContext);
  document.removeEventListener("pointerlockchange", onLockChange);
  window.removeEventListener("pointerdown", onLookPointerDown);
  window.removeEventListener("pointermove", onLookPointerMove);
  window.removeEventListener("pointerup", onLookPointerUp);
  window.removeEventListener("pointercancel", onLookPointerUp);
  window.removeEventListener("orientationchange", onGameViewportChange);
  if (window.visualViewport) window.visualViewport.removeEventListener("resize", onGameViewportChange);
  window.removeEventListener("resize", onGameViewportChange);
}

function maximize3D(on) {
  var cc = document.getElementById("center-canvas");
  if (!cc) return;
  var isMax = cc.classList.contains("max-view-3d");
  if (on) {
    L.prevMax = isMax ? null : cc.classList.contains("max-view-2d") ? "view-2d" : "split";
    if (!isMax && window.__setViewMode) window.__setViewMode("3d");
  } else if (L.prevMax && window.__setViewMode) {
    var compactPhone = document.body.classList.contains("compact-nav") && Math.min(window.innerWidth, window.innerHeight) < 600;
    window.__setViewMode(compactPhone ? "plan" : L.prevMax === "view-2d" ? "plan" : "split");
    L.prevMax = null;
  }
}

function clearWorld() {
  var scene = getMainScene();
  if (L.grp && scene) scene.remove(L.grp);
  disposeGroup(L.grp);
  L.grp = null;
  L.lavaMesh = null;
  L.ghostMesh = null;
  L.stepMesh = null;
  L.webMesh = null;
  L.spec = null;
  L.gems = [];
  L.platforms = [];
  L.crates = [];
  L.extract = null;
  L.col = null;
  L.bounds = null;
  // the briefing screen builds a fresh one to look through; a stale player
  // would park the camera at the last run's death spot, in the last plan
  L.p = null;
  clearScorch();
  L.doorsOpened.forEach(function (d) {
    if (d.userData) d.userData.open = false;
  });
  L.doorsOpened = [];
}

export { lavaActive };

export function toggleLava(on) {
  /* The Floor is Lava is played inside the planner's own 3D scene, and three is
     late-bound now (js/three_lazy.js): a phone session that started on the
     plan has no renderer yet. Build one and come back, rather than
     refusing to start. `false` here means "not running yet", which is what
     the caller already reads it as. */
  if (!has3D()) {
    init3D().then(function (ok) { if (ok) toggleLava(on); });
    return false;
  }
  var want = on == null ? !L.active : !!on;
  if (want === L.active) return L.active;
  var scene = getMainScene(),
    cam = getMainCamera();
  if (want) {
    if (isWalk()) toggleWalk(false);
    ensureBuilt();
    L.prevQuality = (S.workspace && S.workspace.quality) || "auto";
    gameSettings();
    setGameRendererQuality(L.settings.quality);
    buildHud();
    bindEvents();
    if (!cam.parent) scene.add(cam);
    L.prevNear = cam.near;
    L.baseFov = cam.fov || 60;
    cam.near = 4;
    cam.updateProjectionMatrix();
    L.active = true;
    L.keys = {};
    enterHeat();
    syncResponsiveHud();
    L.hud.root.classList.add("on");
    document.body.classList.add("lava-on");
    maximize3D(true);
    setExternalTick(tick);
    showReady();
  } else {
    L.active = false;
    L.paused = false;
    L.started = false;
    setExternalTick(null);
    unbindEvents();
    unlockPointer();
    clearWorld();
    exitHeat();
    if (cam.parent === scene) scene.remove(cam);
    if (L.prevNear != null) {
      cam.near = L.prevNear;
      L.prevNear = null;
    }
    if (L.baseFov != null) {
      cam.fov = L.baseFov;
      cam.updateProjectionMatrix();
      L.baseFov = null;
    }
    audioClose();
    if (L.hud) {
      L.hud.root.classList.remove("on", "paused", "ended", "ready");
      L.hud.ready.classList.remove("on");
      L.hud.pause.classList.remove("on");
      L.hud.end.classList.remove("on");
    }
    document.body.classList.remove("lava-on");
    maximize3D(false);
    orbitRefresh();
    clearGameRendererQuality();
    setQualityPreset(L.prevQuality || ((S.workspace && S.workspace.quality) || "auto"));
    L.prevQuality = null;
  }
  var btn = document.getElementById("lavaBtn");
  if (btn) btn.classList.toggle("active", L.active);
  return L.active;
}

/* rebuild3D() replaces the dynamic group wholesale: the planner's daylight
   environment comes back, every house lamp is a new object, and the fresh
   collision set knows nothing about the crate spine this run is standing on.
   All three have to be re-established or the mode silently turns back into a
   brightly lit room with holes in the course. */
window.addEventListener("scene3d:rebuilt", function () {
  if (!L.active) return;
  buildCol();
  relayoutAfterRebuild();
  reheatAfterRebuild();
});

if (typeof onLangChange === "function") {
  onLangChange(function () {
    if (L.hud && L.active) localizeHud();
  });
}

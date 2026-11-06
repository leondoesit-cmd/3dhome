/* Night Shift keyboard and mouse input, jump, shove and look, split out of
   js/zombies_game.js. It shares the editor's state through live imports from
   ../zombies_game.js. */
import { t } from "../i18n.js";
import { forEachPhysicsStep, safeDeltaSeconds } from "../physics_runtime.js";
import { clamp } from "../state.js";
import { stepCritters } from "../zombies_critters.js";
import { stepDestruct } from "../zombies_destruct.js";
import { stepEnv } from "../zombies_env.js";
import { sndClick, sndFlesh, sndWhoosh, stepHorrorAmbience } from "../zombies_game/audio.js";
import { hudDirty, hudSync, say, stepGrain, stepPlayer } from "../zombies_game/hud.js";
import { cycleWeapon, fire, reload, stepFrags, stepPickups, stepViewModel, tmpVec } from "../zombies_game/weapons.js";
import { applyCamera, handleInteract, onKeyDown, stepRadar, stepStorm, stepWave } from "../zombies_game/world_spawns.js";
import { EYE, MAX_HP, P_CLEAR, P_RAD, STEP, Z } from "../zombies_state.js";
import { buildCol, collideCircle, damageZed, groundAt, losClear, shake, stepAcidClouds, stepFX, stepFlashlight, stepLamps, stepMoonBeams, stepWeather, stepZed, stepZedVisuals } from "../zombies_world.js";
import {
  JUMP_V, KEYMAP, W, _movePoint2D, gameSettings,
} from "../zombies_game.js";

function onKeyUp(e) {
  if (!Z.active) return;
  e.stopImmediatePropagation();
  var m = KEYMAP[e.code];
  if (m) {
    Z.keys[m] = false;
    if (m === "crouchKey") Z.p.crouch = false;
  }
}

function jump() {
  var P = Z.p;
  if (P.dead || P.stam < 8) return;
  // grounded test: gravity zeroes vy on landing, so a live vy means airborne
  var g = groundAt(P.x, P.z, P.y, STEP);
  if (P.y > g + 2 || P.vy > 0) return;
  P.vy = JUMP_V * (P.crouch ? 0.72 : 1);
  P.stam -= 8;
  P.airborne = true;
}

function shove() {
  var P = Z.p;
  if (P.shoveT > 0 || P.stam < 16) return;
  P.shoveT = 0.55;
  P.stam -= 16;
  P.dodgeT = 0.28;
  P.hitStop = 0.04;
  var fx = Math.sin(P.yaw),
    fz = Math.cos(P.yaw);
  var hitAny = false;
  for (var i = 0; i < Z.zeds.length; i++) {
    var zd = Z.zeds[i];
    if (zd.dead) continue;
    // break free of grabs — a grabbing zed sits exactly on you, so this has
    // to happen before (and regardless of) the cone check below
    zd.grabT = 0;
    zd.grabbing = false;
    var dx = zd.x - P.x,
      dz = zd.z - P.z,
      d = Math.hypot(dx, dz) || 1;
    if (d > 145) continue;
    if ((dx / d) * fx + (dz / d) * fz < 0.35) continue;
    zd.stagger = Math.max(zd.stagger, 0.95);
    zd.windup = 0;
    zd.cool = Math.max(zd.cool, 0.85);
    zd.x += (dx / d) * 75;
    zd.z += (dz / d) * 75;
    damageZed(zd, 8, tmpVec(zd.x, zd.y + 110, zd.z), tmpVec(dx / d, 0, dz / d), "body", true);
    hitAny = true;
  }
  // lunge forward
  _movePoint2D.x = P.x + fx * 48;
  _movePoint2D.z = P.z + fz * 48;
  collideCircle(_movePoint2D, P_RAD, P.y, P_CLEAR, STEP);
  P.x = _movePoint2D.x;
  P.z = _movePoint2D.z;
  sndWhoosh(W.knife);
  if (hitAny) {
    shake(0.35);
    sndFlesh(tmpVec(P.x + fx * 50, P.y + 110, P.z + fz * 50), false);
  }
  say(t("z_shove"), 0.5);
}

function applyLookDelta(dx, dy, touch) {
  var P = Z.p;
  if (!P || P.dead || Z.paused) return;
  dx = clamp(dx, -80, 80);
  dy = clamp(dy, -80, 80);
  var cfg = gameSettings();
  var sens = (P.aim ? 0.0014 : 0.0024) * (cfg.sens || 1) * (touch ? 1.15 : 1);
  var invert = cfg.invertY ? -1 : 1;
  P.yaw -= dx * sens;
  P.pitch = clamp(P.pitch - dy * sens * invert, -1.35, 1.35);
  P.lookDX += dx;
  P.lookDY += dy;
}

function onMouseMove(e) {
  if (!Z.active || Z.paused) return;
  applyLookDelta(e.movementX || 0, e.movementY || 0, false);
}
function onMouseDown(e) {
  if (!Z.active || Z.paused) return;
  if (Z.p && Z.p.dead) return;
  if (e.button === 0) {
    Z.p.firing = true;
    fire();
  } else if (e.button === 2) {
    Z.p.aim = true;
    hudDirty();
  }
  lockPointer();
  e.preventDefault();
}
function onMouseUp(e) {
  if (!Z.active || !Z.p) return;
  if (e.button === 0) Z.p.firing = false;
  else if (e.button === 2) {
    Z.p.aim = false;
    hudDirty();
  }
}
function onWheel(e) {
  if (!Z.active || Z.paused) return;
  e.preventDefault();
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
}
function onContext(e) {
  if (Z.active) e.preventDefault();
}
function wantsTouchControls() {
  var coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return coarse || (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
}

function touchPulse(pattern) {
  if (!Z.touchMode || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(pattern); } catch (e) {}
}

function resetTouchPointers() {
  Z.stick = { x: 0, y: 0 };
  Z.lookPtr = null;
  Z.mobileAssistTarget = null;
  if (Z.p) Z.p.firing = false;
  if (!Z.hud) return;
  var nub = Z.hud.stick && Z.hud.stick.querySelector("i");
  if (nub) nub.style.transform = "translate(0px, 0px)";
  if (Z.hud.stick) Z.hud.stick.classList.remove("pressed");
  Z.hud.touch.querySelectorAll(".pressed").forEach(function (el) { el.classList.remove("pressed"); });
}

function syncResponsiveHud() {
  if (!Z.hud || !Z.hud.root) return;
  var vv = window.visualViewport;
  var w = Math.round(vv && vv.width ? vv.width : window.innerWidth || 1024);
  var h = Math.round(vv && vv.height ? vv.height : window.innerHeight || 768);
  var touch = wantsTouchControls();
  var ratio = w / Math.max(1, h);
  Z.touchMode = touch;
  Z.viewport = { w: w, h: h };
  var root = Z.hud.root;
  root.classList.toggle("z-touch", touch);
  root.classList.toggle("z-narrow", w <= 360);
  root.classList.toggle("z-phone", w < 600);
  root.classList.toggle("z-tablet", touch && w >= 600);
  root.classList.toggle("z-fold-open", touch && w >= 600 && w <= 920 && ratio >= 0.78 && ratio <= 1.35);
  root.classList.toggle("z-landscape", ratio > 1.12);
  root.classList.toggle("z-short", h <= 520);
  root.style.setProperty("--z-visual-height", h + "px");
  // The planner's compact shell normally promotes the plan pane when a phone
  // or Fold crosses a breakpoint. During Night Shift the game owns the canvas;
  // reassert 3D after that shell listener runs so resize/unfold cannot collapse
  // the HUD to a hidden zero-size #view-3d.
  var center = document.getElementById("center-canvas");
  if (Z.active && center && !center.classList.contains("max-view-3d") && window.__setViewMode)
    window.__setViewMode("3d");
}

function onGameViewportChange() {
  syncResponsiveHud();
  // A browser rotation can cancel pointer capture without delivering pointerup.
  // Explicitly neutralise movement/fire so the player never keeps running or
  // shooting after unfolding or changing orientation.
  resetTouchPointers();
}

function signedAngle(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

// Touch look has no mouse-sized precision. While the fire control is held,
// gently pull toward a visible torso already near the reticle; it never snaps,
// selects through walls, or turns the player toward an off-screen target.
function stepMobileAimAssist(dt) {
  var P = Z.p;
  if (!Z.touchMode || !P || !P.firing || W[P.weapon].melee || P.dead) {
    Z.mobileAssistTarget = null;
    return;
  }
  Z.aimAssistT = (Z.aimAssistT || 0) - dt;
  if (Z.aimAssistT <= 0) {
    Z.aimAssistT = 0.1;
    var best = null, bestScore = 1e9;
    for (var i = 0; i < Z.zeds.length; i++) {
      var zd = Z.zeds[i];
      if (zd.dead) continue;
      var dx = zd.x - P.x, dz = zd.z - P.z, dist = Math.hypot(dx, dz);
      if (dist > 1050 || dist < 30 || !losClear(P.x, P.z, zd.x, zd.z)) continue;
      var yawErr = signedAngle(Math.atan2(dx, dz), P.yaw);
      var wantPitch = Math.atan2(zd.y + (zd.crawler ? 48 : 105) - (P.y + EYE), dist);
      var pitchErr = wantPitch - P.pitch;
      if (Math.abs(yawErr) > 0.16 || Math.abs(pitchErr) > 0.2) continue;
      var score = Math.abs(yawErr) * 2 + Math.abs(pitchErr) + dist / 6000;
      if (score < bestScore) { bestScore = score; best = zd; }
    }
    Z.mobileAssistTarget = best;
  }
  var target = Z.mobileAssistTarget;
  if (!target || target.dead) return;
  var tx = target.x - P.x, tz = target.z - P.z, td = Math.hypot(tx, tz) || 1;
  var yawStep = signedAngle(Math.atan2(tx, tz), P.yaw);
  var pitchStep = Math.atan2(target.y + (target.crawler ? 48 : 105) - (P.y + EYE), td) - P.pitch;
  var k = clamp(dt * 5.5, 0, 0.32);
  P.yaw += yawStep * k;
  P.pitch = clamp(P.pitch + pitchStep * k, -1.35, 1.35);
}

function onLockChange() {
  var cv = document.getElementById("v3d");
  var wasLocked = Z.locked;
  Z.locked = document.pointerLockElement === cv;
  if (wasLocked && !Z.locked && Z.active && Z.p && !Z.p.dead && !Z.paused) pauseGame(true);
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
    try {
      document.exitPointerLock();
    } catch (e) {}
  }
}

function onLookPointerDown(e) {
  if (!Z.active || Z.paused || !Z.p || Z.p.dead) return;
  if (e.pointerType === "mouse") return;
  var t = e.target;
  if (t && t.closest && t.closest("button, input, label, #zPause, #zDead, #zVictory, #zIntermission, #zStick, .z-touch-actions, #zPauseBtn")) return;
  Z.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY };
}
function onLookPointerMove(e) {
  if (!Z.lookPtr || e.pointerId !== Z.lookPtr.id) return;
  applyLookDelta(e.clientX - Z.lookPtr.x, e.clientY - Z.lookPtr.y, true);
  Z.lookPtr.x = e.clientX;
  Z.lookPtr.y = e.clientY;
}
function onLookPointerUp(e) {
  if (Z.lookPtr && e.pointerId === Z.lookPtr.id) Z.lookPtr = null;
}

function bindTouchControls() {
  if (!Z.hud || !Z.hud.touch) return;
  if (Z.touchBound) return;
  Z.touchBound = true;
  var stick = Z.hud.stick,
    nub = stick.querySelector("i");
  var stickActive = false,
    stickId = null,
    srect = null;
  function updateStickNub(x, y) {
    nub.style.transform = "translate(" + x * 32 + "px, " + y * 32 + "px)";
  }
  function releaseStick(e) {
    if (stickId !== null && e.pointerId !== stickId) return;
    stickActive = false;
    stickId = null;
    Z.stick = { x: 0, y: 0 };
    updateStickNub(0, 0);
    stick.classList.remove("pressed");
  }
  function stickFromEvent(e) {
    if (!srect) srect = stick.getBoundingClientRect();
    var cx = srect.left + srect.width / 2,
      cy = srect.top + srect.height / 2,
      dx = (e.clientX - cx) / (srect.width / 2),
      dy = (e.clientY - cy) / (srect.height / 2);
    var d = Math.hypot(dx, dy);
    if (d > 1) {
      dx /= d;
      dy /= d;
    }
    Z.stick = { x: clamp(dx, -1, 1), y: clamp(-dy, -1, 1) };
    updateStickNub(dx, dy);
  }
  stick.addEventListener("pointerdown", function (e) {
    if (!Z.active || Z.paused || (Z.p && Z.p.dead)) return;
    stickActive = true;
    stickId = e.pointerId;
    srect = stick.getBoundingClientRect();
    stick.classList.add("pressed");
    if (stick.setPointerCapture) stick.setPointerCapture(e.pointerId);
    stickFromEvent(e);
    e.preventDefault();
    e.stopPropagation();
  });
  stick.addEventListener("pointermove", function (e) {
    if (!stickActive || e.pointerId !== stickId) return;
    stickFromEvent(e);
  });
  stick.addEventListener("pointerup", releaseStick);
  stick.addEventListener("pointercancel", releaseStick);
  stick.addEventListener("lostpointercapture", releaseStick);

  Z.hud.touch.querySelectorAll("[data-hold], [data-act]").forEach(function (btn) {
    var hold = btn.getAttribute("data-hold");
    var act = btn.getAttribute("data-act");
    if (hold === "fire") {
      var release = function () {
        if (Z.p) Z.p.firing = false;
        btn.classList.remove("pressed");
      };
      btn.addEventListener("pointerdown", function (e) {
        if (!Z.active || Z.paused || !Z.p || Z.p.dead) return;
        Z.p.firing = true;
        fire();
        touchPulse(8);
        btn.classList.add("pressed");
        if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("lostpointercapture", release);
      return;
    }
    btn.addEventListener("pointerdown", function (e) {
      if (!Z.active || Z.paused || !Z.p || Z.p.dead) return;
      if (act === "reload") reload();
      else if (act === "flash" && Z.flash) {
        Z.flash.on = !Z.flash.on && Z.flash.batt > 0;
        sndClick();
        say(Z.flash.on ? t("z_flash_on") : t("z_flash_off"), 0.8);
      } else if (act === "shove") shove();
      else if (act === "jump") jump();
      else if (act === "weapon") cycleWeapon(1);
      else if (act === "interact") handleInteract();
      touchPulse(act === "interact" || act === "shove" ? 18 : 10);
      e.preventDefault();
      e.stopPropagation();
    });
  });
}

function pauseGame(on, ready) {
  if (!Z.active || !Z.hud || (Z.p && Z.p.dead)) return;
  Z.paused = !!on;
  Z.keys = {};
  Z.stick = { x: 0, y: 0 };
  Z.lookPtr = null;
  if (Z.p) {
    Z.p.firing = false;
    Z.p.aim = false;
  }
  Z.hud.pause.classList.toggle("on", Z.paused);
  Z.hud.root.classList.toggle("paused", Z.paused);
  if (Z.paused) {
    Z.hud.pauseEye.textContent = ready ? t("z_briefing") : t("z_paused");
    Z.hud.pauseH.textContent = ready ? t("z_ready_title") : t("z_paused_title");
    Z.hud.pauseP.textContent = ready ? t("z_ready_copy") : t("z_paused_copy");
    Z.hud.resume.textContent = ready ? t("z_start") : t("z_resume");
    Z.hud.exit.textContent = t("z_exit");
    unlockPointer();
  } else {
    if (Z.audio && Z.audio.ctx && Z.audio.ctx.state === "suspended") Z.audio.ctx.resume();
    lockPointer();
  }
}

function bindEvents() {
  if (Z.bound) return;
  Z.bound = true;
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("pointerdown", onLookPointerDown);
  window.addEventListener("pointermove", onLookPointerMove);
  window.addEventListener("pointerup", onLookPointerUp);
  window.addEventListener("pointercancel", onLookPointerUp);
  // remember the exact target: resolving #v3d again at unbind time can pick a
  // different element (or window) and leave the old listeners live
  var cv = (Z.evTarget = document.getElementById("v3d") || window);
  cv.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  cv.addEventListener("wheel", onWheel, { passive: false });
  cv.addEventListener("contextmenu", onContext);
  document.addEventListener("pointerlockchange", onLockChange);
  window.addEventListener("resize", onGameViewportChange);
  window.addEventListener("orientationchange", onGameViewportChange);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", onGameViewportChange);
  if (typeof window.matchMedia === "function") {
    Z.coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    if (Z.coarsePointerQuery.addEventListener) Z.coarsePointerQuery.addEventListener("change", onGameViewportChange);
  }
  bindTouchControls();
  syncResponsiveHud();
}
function unbindEvents() {
  if (!Z.bound) return;
  Z.bound = false;
  window.removeEventListener("keydown", onKeyDown, true);
  window.removeEventListener("keyup", onKeyUp, true);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("pointerdown", onLookPointerDown);
  window.removeEventListener("pointermove", onLookPointerMove);
  window.removeEventListener("pointerup", onLookPointerUp);
  window.removeEventListener("pointercancel", onLookPointerUp);
  var cv = Z.evTarget || window;
  cv.removeEventListener("mousedown", onMouseDown);
  window.removeEventListener("mouseup", onMouseUp);
  cv.removeEventListener("wheel", onWheel);
  cv.removeEventListener("contextmenu", onContext);
  Z.evTarget = null;
  document.removeEventListener("pointerlockchange", onLockChange);
  window.removeEventListener("resize", onGameViewportChange);
  window.removeEventListener("orientationchange", onGameViewportChange);
  if (window.visualViewport) window.visualViewport.removeEventListener("resize", onGameViewportChange);
  if (Z.coarsePointerQuery && Z.coarsePointerQuery.removeEventListener)
    Z.coarsePointerQuery.removeEventListener("change", onGameViewportChange);
  Z.coarsePointerQuery = null;
  Z.stick = { x: 0, y: 0 };
  Z.lookPtr = null;
}

/* ===========================================================================
   13. FRAME
   =========================================================================== */
function tick(deltaMs) {
  if (!Z.active) return false;
  var rawDt = safeDeltaSeconds(deltaMs, 0.016);
  if (Z.paused) {
    hudSync();
    applyCamera();
    return true;
  }
  // brief slow-mo on headshots / multi-kills
  if (Z.slowT > 0) {
    Z.slowT -= rawDt;
    if (Z.slowT <= 0) Z.timeScale = 1;
  } else Z.timeScale = 1;
  var dt = rawDt * (Z.timeScale || 1);
  Z.lastDt = dt;
  Z.t += dt;
  stepMobileAimAssist(dt);
  // Collision rebuild is expensive (scene traversal + AABB queries, 20-60ms).
  // Defer it to an idle callback so it never blocks a render frame.
  if (Z.colDirty && !Z.colPending) {
    Z.colPending = true;
    Z.colDirty = false;
    (typeof requestIdleCallback === 'function' ? requestIdleCallback : function(cb) { setTimeout(cb, 80); })(function () {
      Z.colPending = false;
      buildCol();
    });
  }
  forEachPhysicsStep(dt, function (stepDt) {
    stepPlayer(stepDt);
    for (var i = Z.zeds.length - 1; i >= 0; i--) stepZed(Z.zeds[i], stepDt, true);
    stepFrags(stepDt);
  });
  // Physics may split a slow frame into as many as three slices. Updating the
  // articulated rigs after integration avoids calculating poses that can never
  // be rendered, while preserving the exact final pose and graphics quality.
  for (var zi = Z.zeds.length - 1; zi >= 0; zi--) stepZedVisuals(Z.zeds[zi], dt);
  if (Z.p.shoveT > 0) Z.p.shoveT -= dt;
  if (Z.comboT > 0) {
    Z.comboT -= dt;
    if (Z.comboT <= 0) Z.combo = 0;
  }
  stepWave(dt);
  stepPickups(dt);
  stepEnv(dt);
  stepCritters(dt);
  stepAcidClouds(dt);
  stepWeather(dt);
  stepStorm(dt);
  stepRadar();
  stepHorrorAmbience(dt);
  stepDestruct(dt);
  stepLamps(dt);
  stepMoonBeams(dt);
  stepFlashlight(dt);
  stepFX(dt);
  stepViewModel(dt);
  applyCamera();
  // muzzle flash / flame jet / blast lights all decay the same way
  // Inline checks — zero allocation per frame.
  if (Z.mflash && Z.mflash.intensity > 0) {
    Z.mflash.userData.t -= dt;
    if (Z.mflash.userData.t <= 0) Z.mflash.intensity = 0;
  }
  if (Z.fireLight && Z.fireLight.intensity > 0) {
    Z.fireLight.userData.t -= dt;
    if (Z.fireLight.userData.t <= 0) Z.fireLight.intensity = 0;
  }
  if (Z.blastLight && Z.blastLight.intensity > 0) {
    Z.blastLight.userData.t -= dt;
    if (Z.blastLight.userData.t <= 0) Z.blastLight.intensity = 0;
  }
  // screen fx timers
  if (Z.msgT > 0) {
    Z.msgT -= dt;
    if (Z.msgT <= 0 && Z.hud) Z.hud.msg.classList.remove("on");
  }
  if (Z.flashT > 0) {
    Z.flashT -= dt;
    if (Z.flashT <= 0 && Z.hud) Z.hud.flash.style.opacity = 0;
  }
  if (Z.hitT > 0) {
    Z.hitT -= dt;
    if (Z.hitT <= 0 && Z.hud) Z.hud.hit.classList.remove("on", "head");
  }
  if (Z.streakT > 0) {
    Z.streakT -= dt;
    if (Z.streakT <= 0) Z.killStreak = 0;
  }
  stepGrain(dt);
  hudSync();
  // These are DOM/CSS overlay writes, not world simulation. A 25 Hz visual
  // cadence stays responsive while avoiding a full style/compositing pass on
  // every rendered frame, which was especially costly on mobile browsers.
  if (Z.hud && Z.t >= (Z.screenFxNext || 0)) {
    Z.screenFxNext = Z.t + 0.04;
    var P = Z.p;
    // vignette tightens with damage + when they're close
    var dmgK = clamp(1 - P.hp / (Z.perks.jugg ? 150 : MAX_HP), 0, 1),
      hurt = Math.max(0, P.hurtT / 0.55) * gameSettings().flashes,
      adr = P.adrenalT > 0 ? 0.2 : 0,
      distK = P.distract || 0;
    Z.hud.vig.style.opacity = (0.48 + dmgK * 0.42 + hurt * 0.35 + adr + distK * 0.25).toFixed(3);
    Z.hud.vig.style.setProperty("--z-red", (dmgK * 0.85 + hurt + adr * 0.5).toFixed(3));
    Z.hud.vig.style.setProperty("--z-pink", distK.toFixed(3));
    // chromatic aberration pulse on hurt / adrenaline / distraction
    if (Z.hud.chrom) {
      var ca = hurt * 0.55 + (P.adrenalT > 0 ? 0.25 : 0) + (Z.timeScale < 0.9 ? 0.35 : 0) + distK * 0.45;
      Z.hud.chrom.style.opacity = (ca * gameSettings().flashes).toFixed(3);
    }
    if (Z.hud.distractFx) {
      Z.hud.distractFx.style.opacity = (distK * 0.55 * gameSettings().flashes).toFixed(3);
    }
    // crosshair spread follows bloom + distraction
    var aimTight = P.aim ? 0.45 : 1;
    Z.hud.cross.style.setProperty(
      "--gap",
      (4 + P.bloom * 240 * aimTight + P.speedK * 4.5 + distK * 18 + (W[P.weapon].melee ? 7 : 0)).toFixed(1) + "px"
    );
    Z.hud.root.classList.toggle("melee", !!W[P.weapon].melee);
    Z.hud.root.classList.toggle("aiming", !!P.aim);
    Z.hud.root.classList.toggle("distracted", distK > 0.35);
    Z.hud.root.classList.toggle("adrenaline", P.adrenalT > 0);
    Z.hud.cross.classList.toggle("assist", !!Z.mobileAssistTarget);
    if (Z.hud.hint) Z.hud.hint.classList.toggle("fade", Z.t > 11);
  }
  return true;
}

export {
  bindEvents, jump, pauseGame, shove, syncResponsiveHud, tick, touchPulse,
  unbindEvents, unlockPointer, wantsTouchControls,
};

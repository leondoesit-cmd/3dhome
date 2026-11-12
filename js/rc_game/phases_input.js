/* RC game driving audio, exit/enter car phases, input, rescue and event
   binding, split out of js/rc_game.js. It shares the editor's state through
   live imports from ../rc_game.js. */
import { t } from "../i18n.js";
import { kartUse } from "../kart.js";
import { editorActive, editorClose, editorContext, editorPointerDown, editorPointerMove, editorPointerUp } from "../rc_editor.js";
import { syncCarMesh } from "../rc_game/cars_cameras.js";
import { hidePanel, showPanel, updateHpBar } from "../rc_game/hud.js";
import { cycleCam, playerCar, setPaused } from "../rc_game/pause_camera.js";
import { miniSetOn } from "../rc_minimap.js";
import { AI_NAMES, CAR_CLEAR, COLL_R, FIG_STEP, FOOT_CLEAR, FOOT_R, MAXV, R, STEP_H, prefsSave } from "../rc_state.js";
import { blockedAt, collideCircle, engineOff, findFreeSpot, groundAt, makeFig, onRoad, rumbleTick, skidTick, waterClickPlace } from "../rc_world.js";
import { surfaceHeightNear } from "../road_surface.js";
import { clamp } from "../state.js";
import { UP_FLAT, boundEvents, set_boundEvents, toggleRC } from "../rc_game.js";

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
    else if (R.hud.results.classList.contains("on")) {
      R.hud.results.classList.remove("on");
      // Hiding the sheet without clearing the orbit camera leaves the view
      // circling the winner forever (and footStep unreachable — see tick()).
      R.cam.results = null;
      R.cam.pos = null; // cut back to the player instead of swooping over
    }
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
  pc.surfaceUp = UP_FLAT;
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

function bindEvents() {
  if (boundEvents) return;
  set_boundEvents(true);
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
    R.cam.ly = e.clientY;
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
    R.cam.moved = (R.cam.moved || 0) + Math.abs(e.clientX - R.cam.lx) + Math.abs(e.clientY - (R.cam.ly || e.clientY));
    R.cam.yawOff -= (e.clientX - R.cam.lx) * 0.008;
    if (R.edCam.on && editorActive())
      R.edCam.pitch = clamp(
        (R.edCam.pitch == null ? 0.62 : R.edCam.pitch) + (e.clientY - (R.cam.ly || e.clientY)) * 0.004,
        0.22,
        1.15,
      );
    R.cam.lx = e.clientX;
    R.cam.ly = e.clientY;
  });
  window.addEventListener("scene3d:rebuilt", function () {
    if (R.active) R.colDirty = true;
  });
}

export { bindEvents, driveAudio, enterCarPhase, readPlayerInput, rescueCar };

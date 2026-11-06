/* Micro-RC gameplay: HUD, race flow, simulation, input, mode toggle. */
import * as THREE from "three";
import { S, clamp, fin } from "./state.js";
import { motorDrag, passedGate, courseAhead } from "./rc_driving.js";
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
  init3D,
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
import {
  bindEvents, driveAudio, enterCarPhase, readPlayerInput, rescueCar,
} from "./rc_game/phases_input.js";
import {
  editorSplit, setOverview, syncCarMesh, tick,
} from "./rc_game/cars_cameras.js";
import { endRace, finishRace } from "./rc_game/race.js";
import {
  clearCars, gridPlace, playerCar, setCamMode, setPaused, showResults,
  startRace, starterTruckDef,
} from "./rc_game/pause_camera.js";
import {
  buildHud, hidePanel, hudFlash, rcDebug, showMsg, showPanel, updateHpBar,
} from "./rc_game/hud.js";
export { rcDebug };
export { setPaused };
// for js/rc_game/phases_input.js (live bindings: it sees every reassignment)
export { UP_FLAT, boundEvents, set_boundEvents };
// for js/rc_game/cars_cameras.js (live bindings: it sees every reassignment)
export {
  FINISH_GRACE_MS, carBasis, carForward, carRight, carUp, lastTrack,
  moveScratch, set_lastTrack,
};
// for js/rc_game/pause_camera.js (live bindings: it sees every reassignment)
export { PAUSE_STAMPS };
// for js/rc_game/hud.js (live bindings: it sees every reassignment)
export { lastStuckMsg, placeScratch, set_lastStuckMsg };

if (typeof window !== "undefined") window.rcDebug = rcDebug;

// 1st / 2nd / 3rd… by lap, gate and distance to the next gate
var placeScratch = []; // runs every frame — never allocate the sort copy

// Shared scratch objects for the per-substep hot paths. Read-only after fill;
// the collision calls below mutate them in place and never retain them.
var moveScratch = { x: 0, z: 0 };
// Cars "on the flat" all share this instead of allocating a fresh up vector
// several times per frame. Nothing ever mutates surfaceUp in place.
var UP_FLAT = { x: 0, y: 1, z: 0 };

// Throttle pinned but the truck isn't moving — it's wedged against something.
// Say the rescue key out loud instead of letting the player grind HP into a
// table leg (the hint re-arms slowly so it never spams).
var lastStuckMsg = 0;
function set_lastStuckMsg(value) { return lastStuckMsg = value; }

// how long the bots get to finish after the player crosses the line
var FINISH_GRACE_MS = 15000;

// ---- pause ------------------------------------------------------------------
// Every gameplay timer is an absolute performance.now() stamp, so a pause has
// to slide them all forward by the time spent stopped — otherwise a 30-second
// break expires every boost, wreck timer and item cooldown at once, and the
// race clock counts the pause as lap time.
var PAUSE_STAMPS = [
  "boostT", "starT", "smallT", "spinT", "stallT", "padT", "rollT",
  "deadT", "hitCd", "revT", "aiDrift", "aiItemT",
];

var carUp = new THREE.Vector3(),
  carForward = new THREE.Vector3(),
  carRight = new THREE.Vector3(),
  carBasis = new THREE.Matrix4();

var lastTrack = null;
function set_lastTrack(value) { return lastTrack = value; }

var boundEvents = false;
function set_boundEvents(value) { return boundEvents = value; }

// ---- mode toggle ------------------------------------------------------------
export function toggleRC(on) {
  /* RC race is played inside the planner's own 3D scene, and three is
     late-bound now (js/three_lazy.js): a phone session that started on the
     plan has no renderer yet. Build one and come back, rather than
     refusing to start. `false` here means "not running yet", which is what
     the caller already reads it as. */
  if (!has3D()) {
    init3D().then(function (ok) { if (ok) toggleRC(on); });
    return false;
  }
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
    var cc = document.getElementById("center-canvas");
    R.playPrevView = cc && (cc.classList.contains("max-view-2d") ? "plan" : cc.classList.contains("max-view-3d") ? "3d" : "split");
    if (window.__setViewMode) window.__setViewMode("3d");
    document.body.classList.add("rc-playing");
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
    document.body.classList.remove("rc-playing");
    if (R.playPrevView && window.__setViewMode) window.__setViewMode(R.playPrevView);
    R.playPrevView = null;
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
      scene.remove(s.m); // shared geometry/material — dispose once, not per drop
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
    R.cam.results = null; // the results orbit must not leak into the next session
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

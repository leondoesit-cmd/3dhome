// 3D scene: renderer/camera/lights, builds walls + items, sun-by-time-of-day, orbit controls.
// three is LATE-BOUND (js/three_lazy.js): the renderer is 3.5 MB and must not
// sit on the synchronous boot module graph. `THREE`, `TSL` and `ADDONS` are
// empty objects until init3D() awaits loadThree(); every use below is inside a
// function body, so nothing here reads them at module-evaluation time.
// Node-based post-processing (three r185). The classic EffectComposer/SSAOPass
// stack does not run on WebGPURenderer at all, so AO + AA are rebuilt as a TSL
// node graph: GTAO replaces SSAO (ground-truth occlusion, far fewer artifacts)
// and TRAA replaces FXAA (temporal, resolves edges instead of blurring them).
import { THREE, TSL, ADDONS, loadThree, threeLoaded } from "./three_lazy.js";
import { createRenderer, LUX, legacyIntensity } from "./gpu.js";
import {
  S,
  clamp,
  fin,
  TILE,
  WALL_T,
  FLOOR,
  WALLC,
  GLASS,
  WOOD,
  HANDLE,
  MAT_PROPS,
} from "./state.js";
import {
  box,
  cyl,
  sph,
  clearGroup,
  polyMesh,
  floorTexture,
  groundTexture,
} from "./primitives.js";
import { FURN, lampColor, buildItem as buildFurn, elevOffset } from "./furniture.js";
import { refreshRuntimePlacements } from "./core/runtime.js";
import { getTexturePresetBumpUrl } from "./textures.js";
import { HumanFactory } from "./human.js";
import { SITE, llToLocalCm } from "./site.js";
import {
  wallGeom,
  straightThroughAt,
  wallJoinRole,
  wallSolidAtNode,
  wallSolidTop,
  faceShiftAt,
  wallBandOutline,
  tJoinStep,
  detectRooms,
  contentBounds,
  roomByKey,
  roomFloor,
  roomHidden,
  hiddenSets,
  usedNodes,
  nodeDegree,
  wallById,
  wallPointAt,
  wallTangentAt,
  distSeg,
} from "./geometry.js";
import { holesForRoom, hitSlabOpening, openingCorners, slabOpenings } from "./slab_openings.js";
import {
  normalizeWall,
  wallLayerBands,
  wallThickness,
  wallTypeById,
} from "./wall_types.js";
import {
  normalizeWallKind,
  normalizeWallProfile,
  wallProfileHeight,
  verticalSegments,
  HALF_WALL_HEIGHT,
} from "./wall_curves.js";
import {
  syncPhysicsToThree,
  addPhysicsBody,
  clearPhysics,
  isPhysicsEnabled,
  isPhysicsBusy,
  hitObjectAtCenter,
  toggleSlowMo,
  moveKinematicCapsule,
  spawnHangingCloth,
} from "./physics_facade.js";
import { safeDeltaMilliseconds } from "./physics_runtime.js";
import { resolvePhysicsRole } from "./physics/math.js";
import { buildMEP3D } from "./mep.js";
import { wallFraming } from "./wall_framing.js";
import { ceilingHeight } from "./elevation.js";

/* "Is there a live 3D scene?" — a QUESTION now, not a load-time constant.
   It used to be `typeof THREE !== "undefined"`, i.e. always true, evaluated the
   moment the module was parsed. three is late-bound (js/three_lazy.js), so
   there is no honest synchronous answer at import time: the truthful one is
   "not yet". `ready3D` starts false, flips once init3D() has actually built the
   scene, and every guard below reads it — so a call that arrives before the
   renderer exists no-ops exactly as it did on a machine without WebGL. */
var ready3D = false;
export function has3D() {
  return ready3D;
}
/* Non-null while init3D() is in flight, so a second caller joins the first
   instead of building a second renderer on the same canvas. */
var init3DPromise = null;

var scene, renderer, camera, dyn, sun, hemi, flt, stars, selectionOutline;
// real-world site overlay (js/site.js): aerial ground group + street-view skybox.
// Both live on `scene` (not `dyn`) so they survive rebuild3D's dyn.clear().
var siteGroup = null, // holds the aerial ground plane, rotated by groundRot
  siteAerialMesh = null,
  siteAerialTex = null,
  svBox = null, // world-anchored street-view pano dome (see setStreetViewCube)
  skyDome = null, // gradient sky dome ref (hidden when street view is on)
  groundPlaneRef = null;
// backdrop sphere geometry: the pano wraps an inside-out sphere of radius
// SV_RADIUS around the scene (no ground projection — see setStreetViewCube).
var SV_CAM_H = 250, // backdrop center height on floor 0 (cm, ~pano eye level)
  SV_RADIUS = 8000, // backdrop sphere radius (cm) — large enough to read as ∞
  // Floor look-down scale. applySite drops the sphere center below the camera
  // by floorCm * SV_RADIUS / SV_BLDG_DIST, so an upper floor puts the camera
  // above the pano's equator and looks down at the street at a believable
  // angle (as if the facing facade were ~SV_BLDG_DIST away). floor=0 is level.
  SV_BLDG_DIST = 2000;

export function getMainScene() {
  return scene;
}
export function getMainCamera() {
  return camera;
}
// external modes that re-grade the whole image (js/zombies.js horror mode)
// need the renderer itself — tone-mapping exposure, shadow map, clear color.
export function getRenderer() {
  return renderer;
}
// the furniture/wall subtree (external modes raycast against it and dim the
// lamp lights that live inside it)
export function getDynGroup() {
  return dyn;
}
// the scene's key lights, so a mode can save/restore the whole lighting rig
export function getRigLights() {
  return { sun: sun, hemi: hemi, fill: flt, stars: stars, sky: skyDome };
}
// A detached copy of the live selection bounds for secondary cameras such as
// the inspector preview. Returning a clone prevents its fit calculations from
// mutating the Box3 used by the main view's selection helper.
export function getSelectionBox3D() {
  var box = selected3DBox();
  return box ? box.clone() : null;
}
// Root objects for the current spatial selection. Secondary views can clone
// these into a non-destructive overlay so the selection remains legible even
// when it is tucked directly behind a wall. The live objects never leave dyn.
export function getSelectionObjects3D() {
  if (!S.sel || !dyn) return [];
  var out = [];
  function add(object) {
    if (object && out.indexOf(object) < 0) out.push(object);
  }
  if (S.sel.kind === "item") {
    var item = itemCache.get(S.sel.ref && S.sel.ref.id);
    add(item && item.g);
  } else if (S.sel.kind === "items") {
    (S.sel.refs || []).forEach(function (ref) {
      var cached = itemCache.get(ref && ref.id);
      add(cached && cached.g);
    });
  } else if (S.sel.kind === "wall" || S.sel.kind === "walls") {
    var walls = S.sel.kind === "wall" ? [S.sel.ref] : S.sel.refs || [];
    dyn.traverse(function (object) {
      if (object.userData && walls.indexOf(object.userData.wall) >= 0) add(object);
    });
  } else if (S.sel.kind === "opening") {
    dyn.traverse(function (object) {
      if (object.userData && object.userData.opening === S.sel.ref) add(object);
    });
  }
  return out;
}
// external per-frame controller (RC race mode, js/rc.js): fn(deltaMs, time)
// returns truthy while it needs continuous painting. While set, it owns the
// camera — upd() goes inert so orbit input can't fight it.
var extTick = null;
export function setExternalTick(fn) {
  extTick = fn;
  needsRender = true;
}
export function orbitRefresh() {
  upd();
}

var post, aoPass, traaPass, usePost = false; // AO/AA post-processing node graph
// TRAA is temporal: one painted frame is not enough for it to converge, and the
// on-demand loop below would otherwise stop after a single paint and leave the
// image visibly noisy. After the last real change we keep painting this many
// extra "settle" frames so the temporal history fills in, then go idle again.
var SETTLE_FRAMES = 6;
var settle = 0;
var renderErrLogged = false;
// set when updateEnvMap had to skip because the GPU backend was not up yet
var envDeferred = false;
// On-demand rendering: post-processing + the 4K shadow map are far too expensive
// to redraw at display refresh when nothing is moving. We only paint a frame
// when something actually changed (`needsRender`) or an animation is live
// (doors easing, humans, physics, walk movement). Every camera move funnels
// through upd()/walkLook(), so flagging there covers all interaction.
var needsRender = true; // paint the next frame
var shadowsDirty = true; // rebuild the sun shadow map next paint (geometry/sun changed)
var shadowThrottleT = 0;  // timestamp of last shadow pass (for extLive throttle)
var qualityPreset = "auto";
var gameRendererLock = false;
export function requestRender() { needsRender = true; settle = SETTLE_FRAMES; }
export function requestShadowUpdate() { shadowsDirty = true; needsRender = true; settle = SETTLE_FRAMES; }

export function setQualityPreset(preset) {
  qualityPreset = ["auto", "performance", "balanced", "quality"].indexOf(preset) >= 0 ? preset : "auto";
  if (!renderer || gameRendererLock) return qualityPreset;
  return applyPlannerQuality();
}

function plannerCompact() {
  // `document.body` is null until the body element is parsed, so the guard has
  // to reach that far — checking only for `document` still throws on the very
  // case it was written to survive.
  return typeof document !== "undefined" && !!document.body
    && document.body.classList.contains("compact-nav");
}

function applyPlannerQuality() {
  var effective = qualityPreset;
  var compact = plannerCompact();
  if (effective === "auto") {
    var memory = navigator.deviceMemory || 8;
    var cores = navigator.hardwareConcurrency || 8;
    effective = memory <= 4 || cores <= 4 ? "performance" : memory >= 8 && cores >= 8 ? "quality" : "balanced";
    /* Still orbit on a phone: keep contact shadows and AO. Games cap their
       own budget through setGameRendererQuality and never reach this path. */
    if (compact && effective === "performance") effective = "balanced";
  }
  var ratio = effective === "performance" ? 1 : effective === "quality" ? 2 : 1.5;
  if (compact && ratio > 1.5) ratio = 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
  renderer.shadowMap.enabled = effective !== "performance";
  if (sun) sun.shadow.mapSize.set(effective === "quality" ? 4096 : 2048, effective === "quality" ? 4096 : 2048);
  usePost = effective !== "performance" && !!post;
  // GTAO at half resolution is nearly indistinguishable at "balanced" and roughly
  // halves the AO cost; "quality" runs it 1:1.
  if (aoPass) aoPass.resolutionScale = effective === "quality" ? 1 : 0.5;
  var canvas = renderer.domElement;
  setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  requestShadowUpdate();
  return effective;
}

// Night Shift (and any other live first-person mode) cannot reuse the CAD
// quality stack. A 14" M2 Pro panel is ~3024×1964 CSS pixels; 2× DPR + GTAO +
// TRAA + a 4096² sun map is a still-view budget, and it freezes the moment
// dozens of articulated rigs start moving. Cap pixel ratio, skip post, and
// only pay for shadows the flashlight actually casts.
export function setGameRendererQuality(quality) {
  gameRendererLock = true;
  if (!renderer) return;
  quality = Math.round(Math.max(0, Math.min(2, Number(quality) || 0)));
  var ratio = quality >= 2 ? 1.25 : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio));
  renderer.shadowMap.enabled = quality > 0;
  usePost = false;
  var canvas = renderer.domElement;
  setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  requestShadowUpdate();
}

export function clearGameRendererQuality() {
  gameRendererLock = false;
}
var skyCanvas,
  skyTex,
  envPT = null; // gradient sky dome + env snapshot for the path tracer
var pmrem, // PMREMGenerator for image-based lighting
  envSrcCanvas, // equirect gradient painted for IBL
  envSrcTex,
  envRT = null; // current prefiltered environment render target
var tgt,
  radius,
  theta,
  phi,
  DEFr,
  userMoved = false,
  framedInterior = false; // compact Frame uses the same near-wall cutaway as CAD edit
// person "walk" mode — first-person (fpv) or third-person (tpv)
var EYE_H = 165, // eye height (cm) above the floor
  BODY_H = 172; // avatar total height (cm)
var walk = false,
  walkView = "fpv", // "fpv" | "tpv"
  walkPos = { x: 0, y: 0, z: 0 }, // feet position on the floor
  yaw = Math.PI,
  pitch = 0,
  tpDist = 230, // third-person camera distance from the avatar
  freeMove = false, // when true: no-clip, walk through walls too
  keys = {},
  touchMove = { x: 0, z: 0 },
  walkControls = null,
  avatar = null;

// simple stylized human, built once and parented to the scene (not `dyn`,
// so it survives geometry rebuilds). Local +Z is "forward".
function buildAvatar() {
  if (avatar || !scene) return;
  avatar = new THREE.Group();
  var skin = 0xe8b48c,
    shirt = 0x3d6ea5,
    pants = 0x394a5a,
    hair = 0x3a2c22;
  // legs
  cyl(avatar, -6, 24, 0, 6, 48, pants, { rough: 0.85, metal: 0 });
  cyl(avatar, 6, 24, 0, 6, 48, pants, { rough: 0.85, metal: 0 });
  // torso (tapered a touch at the shoulders)
  cyl(avatar, 0, 78, 0, 15, 60, shirt, { rough: 0.8, metal: 0, r2: 17 });
  // arms
  cyl(avatar, -19, 78, 0, 4.5, 54, shirt, { rough: 0.8, metal: 0 });
  cyl(avatar, 19, 78, 0, 4.5, 54, shirt, { rough: 0.8, metal: 0 });
  // head + hair + a small nose to read facing direction
  sph(avatar, 0, 122, 0, 12, skin, { rough: 0.7 });
  sph(avatar, 0, 128, -2, 12.5, hair, { rough: 0.9 });
  sph(avatar, 0, 120, 12, 2.6, skin, { rough: 0.7 });
  avatar.visible = false;
  scene.add(avatar);
}

function walkLook() {
  needsRender = true;
  // mirror the pose for the 2D plan's you-are-here indicator (plan2d listens
  // for walk:look and repaints, rAF-throttled)
  S.walk2D = walk
    ? { x: walkPos.x, z: walkPos.z, yaw: yaw, tp: walkView === "tpv" }
    : null;
  window.dispatchEvent(new Event("walk:look"));
  var lookDist = 400,
    dx = Math.cos(pitch) * Math.sin(yaw),
    dy = Math.sin(pitch),
    dz = Math.cos(pitch) * Math.cos(yaw);
  var eyeX = walkPos.x,
    eyeY = walkPos.y + EYE_H,
    eyeZ = walkPos.z;
  if (avatar) {
    avatar.visible = walk && walkView === "tpv";
    avatar.position.set(walkPos.x, walkPos.y, walkPos.z);
    avatar.rotation.y = yaw; // local +Z faces (sin yaw, cos yaw)
  }
  if (walk && walkView === "tpv") {
    // orbit the camera behind the avatar, aiming at its torso and sitting a bit
    // above the sightline for a nice over-the-shoulder framing of the whole body;
    // clamp inside the room so walls never occlude the person
    var pX = walkPos.x,
      pY = walkPos.y + 95, // torso pivot
      pZ = walkPos.z;
    var elev = 45; // lift the camera above the sightline
    var cx = pX - dx * tpDist,
      cy = pY - dy * tpDist + elev,
      cz = pZ - dz * tpDist;
    var bb = freeMove ? null : interiorBounds();
    if (bb) {
      var m = 10;
      cx = clamp(cx, bb.minx + m, bb.maxx - m);
      cz = clamp(cz, bb.minz + m, bb.maxz - m);
    }
    cy = clamp(cy, 30, 265);
    camera.position.set(cx, cy, cz);
    camera.lookAt(pX, pY, pZ);
  } else {
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.lookAt(eyeX + dx * lookDist, eyeY + dy * lookDist, eyeZ + dz * lookDist);
  }
}
function moveWalk() {
  var spd = 4,
    fx = Math.sin(yaw),
    fz = Math.cos(yaw),
    rx = -Math.cos(yaw),
    rz = Math.sin(yaw),
    mx = 0,
    mz = 0;
  if (keys.fwd) {
    mx += fx;
    mz += fz;
  }
  if (keys.back) {
    mx -= fx;
    mz -= fz;
  }
  if (keys.right) {
    mx += rx;
    mz += rz;
  }
  if (keys.left) {
    mx -= rx;
    mz -= rz;
  }
  if (touchMove.z || touchMove.x) {
    mx += fx * -touchMove.z + rx * touchMove.x;
    mz += fz * -touchMove.z + rz * touchMove.x;
  }
  if (mx || mz) {
    var l = Math.hypot(mx, mz) || 1;
    var dx = (mx / l) * spd;
    var dz = (mz / l) * spd;
    var curX = walkPos.x, curZ = walkPos.z, nx, nz;
    if (isPhysicsEnabled()) {
      var next = moveKinematicCapsule(curX, walkPos.y, curZ, dx, 0, dz, 18, EYE_H);
      nx = next.x;
      nz = next.z;
    } else {
      nx = curX + dx;
      nz = curZ + dz;
    }
    /* A stairwell is a hole in the floor, so it has to stop the walker as well
       as the renderer — walkPos.y is fixed, so without this you stroll straight
       across the well. Axis-separated so the edge can be walked ALONG rather
       than stuck to. No-clip ignores it, like it ignores walls. */
    if (voidBlocked(nx, nz)) {
      if (!voidBlocked(nx, curZ)) nz = curZ;
      else if (!voidBlocked(curX, nz)) nx = curX;
      else { nx = curX; nz = curZ; }
    }
    walkPos.x = nx;
    walkPos.z = nz;
    if (!isPhysicsEnabled()) clampWalk();
    walkLook();
  }
}
// the walker's body stops at the curb, not with its centre over the drop
function voidBlocked(x, z) {
  if (freeMove) return false;
  return !!hitSlabOpening(x, z, 16);
}
// bounds of the wall footprint from centerlines only (no furniture padding,
// unlike contentBounds) — this is the interior the person/camera must stay in
function interiorBounds() {
  var u = usedNodes(),
    minx = 1e9,
    minz = 1e9,
    maxx = -1e9,
    maxz = -1e9,
    any = false;
  for (var k in u) {
    var n = S.nodes[k];
    if (!n || !fin(n.x) || !fin(n.z)) continue;
    minx = Math.min(minx, n.x);
    maxx = Math.max(maxx, n.x);
    minz = Math.min(minz, n.z);
    maxz = Math.max(maxz, n.z);
    any = true;
  }
  if (!any || maxx - minx < 1 || maxz - minz < 1) return null;
  return { minx: minx, minz: minz, maxx: maxx, maxz: maxz };
}
// keep the person inside the building footprint (walls block; furniture never
// does). In free-move / no-clip the person can pass through walls too.
function clampWalk() {
  if (freeMove) return;
  var bb = interiorBounds();
  if (!bb) return;
  var m = 22;
  walkPos.x = clamp(walkPos.x, bb.minx + m, bb.maxx - m);
  walkPos.z = clamp(walkPos.z, bb.minz + m, bb.maxz - m);
}
export function isWalk() {
  return walk;
}
export function isFreeMove() {
  return freeMove;
}
export function toggleFreeMove() {
  freeMove = !freeMove;
  return freeMove;
}
export function walkViewMode() {
  return walkView;
}
export function toggleWalkView() {
  if (!walk) return walkView;
  walkView = walkView === "fpv" ? "tpv" : "fpv";
  walkLook();
  return walkView;
}
export function toggleWalk(on) {
  if (!ready3D) return false;
  walk = on == null ? !walk : !!on;
  keys = {}; // drop any keys held from before (prevents "stuck" movement)
  touchMove.x = touchMove.z = 0;
  if (walkControls) walkControls.hidden = !walk;
  if (walk) {
    buildAvatar();
    var ib = interiorBounds(),
      bb = contentBounds();
    walkPos = ib
      ? { x: (ib.minx + ib.maxx) / 2, y: 0, z: (ib.minz + ib.maxz) / 2 }
      : { x: bb.cx, y: 0, z: bb.cz };
    yaw = Math.PI;
    pitch = 0;
    tpDist = 230;
    walkLook();
  } else {
    if (avatar) avatar.visible = false;
    S.walk2D = null;
    window.dispatchEvent(new Event("walk:look"));
    upd();
  }
  return walk;
}

/* Per-opening frame profile. Every field is optional on the opening object —
   an old scene (or one never touched in the inspector) falls back to the
   dimensions that used to be hard-coded here, so nothing shifts on load.
   jamb/head/sillW are the visible frame widths per direction (cm); depth is
   how far the frame stands proud of the wall (total extra thickness); mull is
   the divider (mullion) thickness with mullV/mullH counts. */
export function frameSpec(o) {
  var isWin = o.type === "window";
  var n = function (v, d) { return v != null && isFinite(v) ? Math.max(0, +v) : d; };
  return {
    jamb: n(o.frJamb, o.type === "door" || isWin ? 3 : 0),
    head: n(o.frHead, o.type === "door" || isWin ? 3 : 0),
    sillW: n(o.frSillW, isWin ? 3 : 0),
    depth: n(o.frDepth, 1.6),
    mull: n(o.frMull, isWin ? 2 : 0),
    mullV: o.frMullV != null ? Math.max(0, Math.round(o.frMullV)) : isWin ? 1 : 0,
    mullH: o.frMullH != null ? Math.max(0, Math.round(o.frMullH)) : 0,
  };
}

function localBox(g, u0, u1, y0, y1, T, color, opt) {
  if (u1 - u0 <= 0.01 || y1 - y0 <= 0.01) return;
  var o = opt ? Object.assign({ sharp: true }, opt) : { sharp: true };
  var m = box(g, u0, u1, y0, y1, -T / 2, T / 2, color, o);
  // Wall segments are masonry regardless of paint color (the color-based
  // material table would classify a painted wall as furniture board).
  if (m && !(o.trans || o.transmission != null)) m.userData.physicsProps = MAT_PROPS.masonry;
  return m;
}

function buildStraightWall(w, col, tex) {
  if (col == null) col = WALLC;
  normalizeWall(w, S);
  var gm = wallGeom(w);
  if (gm.L < 1) return;
  var g = new THREE.Group();
  g.position.set(gm.a.x, 0, gm.a.z);
  g.rotation.y = Math.atan2(-gm.dz, gm.dx);
  g.userData.wall = w;
  g.userData.physicsRole = "static";
  dyn.add(g);
  var T = wallThickness(w, S),
    H = w.height,
    L = gm.L;

  function getCursor(isStart) {
    // Match joining walls by Node ID (topology) instead of coordinate proximity.
    // This prevents the "vanishing walls" bug where parallel/near walls get incorrectly 
    // truncated by the distance threshold.
    var nodeId = isStart ? w.a : w.b;
    var mt = 0,
      endWalls = [w];
    S.walls.forEach(function (ow) {
      if (ow === w || !wallSolidAtNode(ow, nodeId)) return;
      if (ow.a === nodeId || ow.b === nodeId) {
        mt = Math.max(mt, ow.thickness);
        endWalls.push(ow);
      }
    });
    // free end: nothing joins here, or what does has an opening across the joint
    // and so was never built there (see wallSolidAtNode)
    if (mt === 0) return isStart ? 0 : L;
    var manualJoin = w.join && w.join[isStart ? "a" : "b"];
    if (manualJoin === "through") return isStart ? -mt / 2 - 0.1 : L + mt / 2 + 0.1;
    if (manualJoin === "butt") return isStart ? mt / 2 - 0.1 : L - mt / 2 + 0.1;
    /* Anything running straight back out of this node is one physical straight
       run stored as two walls, not a corner: a wall split by a newly landed
       branch, or simply two walls drawn end to end. There is no mitre for these
       (faceShiftAt says so, and endMitre below then returns null), so the cut
       taken here is the final one and it has to be right on its own — end both
       halves AT the shared node.

       The old rule instead cut this wall back by the NEIGHBOUR's half thickness
       while the neighbour cut back by OURS, which only cancels while the two are
       equally thick. Join a 12 cm wall to a 14 cm one end to end and the run was
       left with a 1 cm slot straight through it; a branch landing on the joint
       opened the same mismatch out into a triangular spike. */
    if (straightThroughAt(nodeId, isStart ? gm.ux : -gm.ux, isStart ? gm.uz : -gm.uz, w))
      return isStart ? 0 : L;
    /* A T-branch must stop at the through-run's NEAR face, not at half the
       neighbour's thickness. After the run is hung on its interior that face
       sits on the shared node, so mt/2 left a one-thickness gap of daylight
       between the branch and the wall it is welded to. */
    if (wallJoinRole(w, nodeId) === "branch") {
      var bx = isStart ? gm.ux : -gm.ux,
        bz = isStart ? gm.uz : -gm.uz,
        bh = T / 2,
        btp = faceShiftAt(nodeId, bx, bz, isStart ? 1 : -1, w, bh),
        btm = faceShiftAt(nodeId, bx, bz, isStart ? -1 : 1, w, bh),
        bNear = Math.min(btp, btm);
      return isStart ? bNear - 0.1 : L - bNear + 0.1;
    }
    // At a corner, pick one deterministic "through" wall to span it (lowest id).
    endWalls.sort(function (a, b) { return a.id - b.id; });
    var throughWall = endWalls[0];
    var isThrough = throughWall.id === w.id;

    // add 0.1 (1mm) overlap to all connections to perfectly seal MSAA rasterization cracks
    if (isStart) return isThrough ? -mt / 2 - 0.1 : mt / 2 - 0.1;
    else return isThrough ? L + mt / 2 + 0.1 : L - mt / 2 + 0.1;
  }

  var startCursor = getCursor(true);
  var endCursor = getCursor(false);
  var stepA = tJoinStep(w, "a"),
    stepB = tJoinStep(w, "b");
  if (stepA) startCursor = Math.min(stepA.tp, stepA.tm) - 0.05;
  if (stepB) endCursor = L - Math.min(stepB.tp, stepB.tm) + 0.05;

  /* ---- mitred ends ----
     getCursor above stops (or spans) the wall at ONE position along its axis,
     which is only ever right at a square corner: at 60 degrees a square cut
     leaves a wedge of daylight on the outside of the joint and a lump on the
     inside. The two faces of the wall want DIFFERENT cut positions, so the end
     of the extrusion is sheared to the same mitre line the plan draws
     (js/geometry.js wallOutline). Local +z is side +1, local x runs a->b. */
  function endMitre(isStart) {
    if (tJoinStep(w, isStart ? "a" : "b")) return null;
    var node = isStart ? w.a : w.b;
    var joined = S.walls.some(function (ow) {
      return ow !== w && (ow.a === node || ow.b === node) && wallSolidAtNode(ow, node);
    });
    if (!joined) return null; // free end: nothing to mitre against
    var dx = isStart ? gm.ux : -gm.ux,
      dz = isStart ? gm.uz : -gm.uz,
      h = T / 2,
      lim = Math.max(0, L - 0.2);
    // how far in from the node the face on side s starts
    function t(s) {
      var v = faceShiftAt(node, dx, dz, isStart ? s : -s, w, h);
      return v > lim ? lim : v < -lim ? -lim : v;
    }
    var tp = t(1),
      tm = t(-1);
    // everything meeting here runs straight on (a split wall, not a corner):
    // there is no mitre, and the ends must keep the overlap getCursor gave them
    if (!tp && !tm) return null;
    var
      // x = mid + k*z, so that x(+T/2) and x(-T/2) land on the two face lines.
      // 0.05 cm past the mitre line each way, so neighbouring walls overlap by
      // a hair instead of showing a rasterisation crack down the joint.
      mid = isStart ? (tp + tm) / 2 - 0.05 : L - (tp + tm) / 2 + 0.05,
      k = ((isStart ? 1 : -1) * (tp - tm)) / T;
    return { mid: mid, k: k };
  }
  var mitA = endMitre(true),
    mitB = endMitre(false);
  /* Move every vertex sitting ON an end face onto the mitre line, leaning it
     with depth. Interior vertices (opening reveals) are untouched — their x is
     nowhere near a cursor. */
  function mitre(geo) {
    if (!mitA && !mitB) return;
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i),
        m = Math.abs(x - startCursor) < 0.01 ? mitA
          : Math.abs(x - endCursor) < 0.01 ? mitB
          : null;
      if (m) p.setX(i, m.mid + m.k * p.getZ(i));
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  }

  var skirtC = new THREE.Color(col).multiplyScalar(0.8).getHex(),
    skT = T + 2.6; // baseboard color + thickness (1.3cm proud per face)
  var ops = S.openings
    .filter(function (o) {
      return o.wall === w.id;
    })
    .map(function (o) {
      return {
        /* The opening this was derived from. Everything below is a clamped,
           flattened COPY for the builder, so identity is lost — and selection
           matches on identity (userData.opening === S.sel.ref). Carry the
           original across or a straight wall's doors and windows can never be
           resolved back to the document. */
        src: o,
        // clamp opening to fit within the actual drawn wall segment
        s: clamp(o.s, startCursor + o.width / 2, endCursor - o.width / 2),
        width: o.width,
        height: o.height,
        sill: o.type === "window" ? o.sill : 0,
        type: o.type,
        overlapL: o.overlapL,
        isSliding: !!o.isSliding,
        mat: o.mat,
        color: o.color,
        slideDir: o.slideDir,
        isPocket: !!o.isPocket,
        swingDir: o.swingDir,
        // frame / mullion profile (see frameSpec) — undefined means "default"
        frJamb: o.frJamb,
        frHead: o.frHead,
        frSillW: o.frSillW,
        frDepth: o.frDepth,
        frMull: o.frMull,
        frMullV: o.frMullV,
        frMullH: o.frMullH,
      };
    })
    .sort(function (a, b) {
      return a.s - b.s;
    });
  // NOTE: this object goes straight into MeshStandardMaterial, so it uses
  // three's own property names — not primitives.js's `rough`/`tex` shorthand.
  // (`tex` is applied further down, after the loader resolves.)
  /* Extruded wall faces are architectural planes, never a smooth organic
     surface. After an oblique mitre, averaged vertex normals reveal the two
     triangulation halves as a large light/dark wedge even though the geometry
     is coplanar. Flat shading keeps each planar face visually straight. */
  var matOpts = { roughness: 0.9, flatShading: true };

  var hasWall = endCursor > startCursor;

  // Openings that span the shape's full height (seamless passages, and any
  // door/passage reaching the ceiling) must SPLIT the wall into separate
  // left/right shapes: a hole covering the outer contour's full vertical
  // extent disconnects it, which the triangulator can't represent — it left
  // stray wall faces and an uncut baseboard band across the opening.
  var wallCuts = [], wallHoles = [], skirtCuts = [], skirtHoles = [];
  ops.forEach(function (o) {
    var widthOffset = frameSpec(o).jamb;
    var l = Math.max(startCursor, Math.min(endCursor, o.s - o.width / 2 - widthOffset)),
      r = Math.max(startCursor, Math.min(endCursor, o.s + o.width / 2 + widthOffset));
    if (l >= r) return;

    var y0 = o.sill || 0;
    var y1 = y0 + o.height;
    var cutY0 = y0 <= 0 ? -2.5 : y0; // Cut all the way through the base
    if (y1 > H) y1 = H;
    if (cutY0 <= -2.5 && y1 >= H - 0.01) wallCuts.push({ l: l, r: r });
    else wallHoles.push({ l: l, r: r, y0: cutY0, y1: y1 });

    // baseboard: any opening reaching the floor removes the skirt entirely
    if (y0 < 7) {
      if (y0 <= 0) skirtCuts.push({ l: l, r: r });
      else skirtHoles.push({ l: l, r: r, y0: y0 });
    }
  });

  // split [start,end] into the sub-segments left over between full cuts
  function splitSegs(start, end, cuts) {
    var segs = [],
      pos = start;
    cuts
      .slice()
      .sort(function (a, b) { return a.l - b.l; })
      .forEach(function (c) {
        if (c.l > pos) segs.push([pos, Math.min(c.l, end)]);
        pos = Math.max(pos, c.r);
      });
    if (pos < end) segs.push([pos, end]);
    return segs.filter(function (s) { return s[1] - s[0] > 0.2; });
  }

  function rectShape(x0, x1, y0, y1) {
    var sh = new THREE.Shape();
    sh.moveTo(x0, y0);
    sh.lineTo(x1, y0);
    sh.lineTo(x1, y1);
    sh.lineTo(x0, y1);
    sh.lineTo(x0, y0);
    return sh;
  }

  function makeWallShapes(x0, x1) {
    if (!(x1 - x0 > 0.2)) return [];
    return splitSegs(x0, x1, wallCuts).map(function (sg) {
      var sh = rectShape(sg[0], sg[1], -2.5, H);
      wallHoles.forEach(function (h) {
        var hl = Math.max(h.l, sg[0]),
          hr = Math.min(h.r, sg[1]);
        if (hl >= hr) return;
        var hole = new THREE.Path();
        hole.moveTo(hl, h.y0);
        hole.lineTo(hr, h.y0);
        hole.lineTo(hr, h.y1);
        hole.lineTo(hl, h.y1);
        hole.lineTo(hl, h.y0);
        sh.holes.push(hole);
      });
      return sh;
    });
  }

  // wall shapes: start at -2.5 so the wall meets the ground plane (y=-2.5)
  // with no visible gap/seam along the exterior base
  var wallShapes = hasWall ? makeWallShapes(startCursor, endCursor) : [];
  var skirtShapes = hasWall
    ? splitSegs(startCursor, endCursor, skirtCuts).map(function (sg) {
        var sh = rectShape(sg[0], sg[1], 0, 7);
        skirtHoles.forEach(function (h) {
          var hl = Math.max(h.l, sg[0]),
            hr = Math.min(h.r, sg[1]);
          if (hl >= hr) return;
          var hole = new THREE.Path();
          hole.moveTo(hl, h.y0);
          hole.lineTo(hr, h.y0);
          hole.lineTo(hr, 7);
          hole.lineTo(hl, 7);
          hole.lineTo(hl, h.y0);
          sh.holes.push(hole);
        });
        return sh;
      })
    : [];

  if (hasWall && wallShapes.length) {
    // X-ray mode: dim, see-through walls so embedded MEP conduits show through
    var xray = !!(S.mep && S.mep.xray && (typeof S.mep.xray === "object" ? S.mep.xray.walls : S.mep.xray));
    var layerBands = wallLayerBands(w, S);
    function addLayerGeom(band, shapes, z0, z1, applyMitre) {
      var depth = z1 - z0;
      if (!(depth > 0.01) || !shapes || !shapes.length) return;
      if (band.airGap && band.framing) return;
      var geom = new THREE.ExtrudeGeometry(shapes, { depth: depth, bevelEnabled: false });
      geom.translate(0, 0, z0);
      if (applyMitre) mitre(geom);
      var isGeneric = w.wallTypeId === "generic" || layerBands.length === 1 && band.material === "generic-masonry";
      var layerColor = isGeneric ? col : (band.color || col);
      var isGlass = band.role === "glazing" || /glass/i.test(String(band.material || ""));
      var materialProps = Object.assign({ color: layerColor }, matOpts);
      if (isGlass) Object.assign(materialProps, { transparent: true, opacity: 0.34, transmission: 0.72, roughness: 0.12, side: THREE.DoubleSide });
      var mat = new THREE.MeshStandardMaterial(materialProps);
      // A user-applied wall texture remains the visible finish, while an
      // authored assembly without a texture keeps each layer's semantic color.
      if (tex) {
        if (!S.customTexCache) S.customTexCache = {};
        if (!S.customTexCache[tex]) {
          var tx = new THREE.TextureLoader().load(tex, function() { S.dirty3D = true; S.repaint3D = true; });
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.colorSpace = THREE.SRGBColorSpace;
          S.customTexCache[tex] = tx;
        }
        var scale = w.texScale || 200;
        if (S.customTexCache[tex].image) {
          var txc = S.customTexCache[tex].clone();
          txc.repeat.set(1 / scale, 1 / scale);
          mat.map = txc;
          mat.color.setHex(0xffffff);
        }
        var bUrl = getTexturePresetBumpUrl(tex);
        if (bUrl) {
          if (!S.customBumpCache) S.customBumpCache = {};
          if (!S.customBumpCache[bUrl]) {
            var btx = new THREE.TextureLoader().load(bUrl, function() { S.dirty3D = true; S.repaint3D = true; });
            btx.wrapS = btx.wrapT = THREE.RepeatWrapping;
            S.customBumpCache[bUrl] = btx;
          }
          if (S.customBumpCache[bUrl].image) {
            var btxCloned = S.customBumpCache[bUrl].clone();
            btxCloned.repeat.set(1 / scale, 1 / scale);
            mat.bumpMap = btxCloned;
            mat.bumpScale = w.texBump != null ? w.texBump : 0.20;
          }
        }
      }
      if (xray) {
        mat.transparent = true;
        mat.opacity = 0.18;
        mat.depthWrite = false;
      }
      var mesh = new THREE.Mesh(geom, mat);
      mesh.receiveShadow = !xray;
      mesh.castShadow = !xray;
      mesh.userData.wallLayer = { wallId: w.id, layerId: band.id, material: band.material };
      if (!isGlass) mesh.userData.physicsProps = MAT_PROPS.masonry;
      g.add(mesh);
    }
    layerBands.forEach(function (band) {
      var slices;
      if ((stepA || stepB) && band.start < -0.01 && band.end > 0.01) {
        slices = [
          { z0: band.start, z1: 0, side: -1 },
          { z0: 0, z1: band.end, side: 1 },
        ];
      } else if (stepA || stepB) {
        slices = [{ z0: band.start, z1: band.end, side: (band.start + band.end) / 2 >= 0 ? 1 : -1 }];
      } else {
        slices = [{ z0: band.start, z1: band.end, side: 0 }];
      }
      slices.forEach(function (slice) {
        var x0 = startCursor, x1 = endCursor, shapes = wallShapes;
        if (slice.side) {
          if (stepA) x0 = (slice.side > 0 ? stepA.tp : stepA.tm) - 0.05;
          if (stepB) x1 = L - (slice.side > 0 ? stepB.tp : stepB.tm) + 0.05;
          shapes = makeWallShapes(x0, x1);
        }
        addLayerGeom(band, shapes, slice.z0, slice.z1, !slice.side);
      });
    });

    addWallFraming(dyn, w, xray);

    if (skirtShapes.length) {
      var skGeom = new THREE.ExtrudeGeometry(skirtShapes, { depth: skT, bevelEnabled: false });
      skGeom.translate(0, 0, -skT / 2);
      mitre(skGeom);
      var skMat = new THREE.MeshStandardMaterial({ color: skirtC, roughness: 0.9, flatShading: true });
      if (xray) { skMat.transparent = true; skMat.opacity = 0.18; skMat.depthWrite = false; }
      var skMesh = new THREE.Mesh(skGeom, skMat);
      skMesh.receiveShadow = !xray;
      skMesh.castShadow = !xray;
      g.add(skMesh);
    }
  }

  // Draw frames for openings
  ops.forEach(function (o) {
    /* Straight walls build an opening's frames, leaf and glazing straight into
       the wall group, with no per-opening holder — unlike the sampled path,
       where addSampledOpening() parents them under a Group carrying
       userData.opening. Selection reads that tag (getSelectionObjects3D, and
       the picker at pickAt), so on a straight wall — the common case — a door
       or window resolved to nothing: clicking one could not frame it and the
       inspector's 3D preview waited forever for geometry that was never going
       to be identified. Tag whatever THIS opening adds, so both paths answer
       the same question the same way without re-parenting anything. */
    var childrenBefore = g.children.length;
    var FR = frameSpec(o);
    var widthOffset = FR.jamb;
    var l = Math.max(startCursor, Math.min(endCursor, o.s - o.width / 2 - widthOffset)),
      r = Math.max(startCursor, Math.min(endCursor, o.s + o.width / 2 + widthOffset));
    if (l >= r) return;
    var fT = T + FR.depth;
    // jamb/head can't eat more than the opening itself
    var jamb = Math.min(FR.jamb, (r - l) / 2 - 1);
    if (!(jamb > 0)) jamb = 0;
    var isSeamless = o.type === "passage" && o.overlapL != null && Math.abs(o.width - o.overlapL) < 2 && Math.abs(o.height - H) < 2 && o.sill <= 1;
    if (o.type === "door") {
      var head = Math.min(FR.head, o.height - 5);
      if (!(head > 0)) head = 0;
      if (jamb > 0) {
        localBox(g, l, l + jamb, 0, o.height, fT, 0xece4d4, { rough: 0.8 });
        localBox(g, r - jamb, r, 0, o.height, fT, 0xece4d4, { rough: 0.8 });
      }
      if (head > 0) localBox(g, l + jamb, r - jamb, o.height - head, o.height, fT, 0xece4d4, { rough: 0.8 });
      if (o.type === "door") {
        var doorPivot = new THREE.Group();
        doorPivot.userData = { isDoor: true, open: false, slideDir: 1, type: "swing", width: o.width, maxOpen: Math.PI / 2 };
        if (o.isSliding || o.isPocket) {
          doorPivot.userData.type = "slide";
          var isPocket = !!o.isPocket;
          var matColor = o.color ? parseInt(o.color.slice(1), 16) : WOOD;
          var panelOpts = { rough: 0.6 };
          if (o.mat === "glass") {
            panelOpts = { trans: true, opacity: 1, transmission: 0.9, metal: 0.1, rough: 0.05, cast: false };
          } else if (o.mat === "frosted") {
            panelOpts = { trans: true, opacity: 1, transmission: 0.8, metal: 0.0, rough: 0.7, cast: false };
          }
          var spaceLeft = (o.s - o.width / 2) - startCursor;
          var spaceRight = endCursor - (o.s + o.width / 2);
          var canLeft = spaceLeft >= o.width - 10;
          var canRight = spaceRight >= o.width - 10;
          var slideDir = 1;
          if (o.slideDir === "-1") slideDir = -1;
          else if (o.slideDir === "1") slideDir = 1;
          else slideDir = canRight ? 1 : (canLeft ? -1 : 1);
          
          doorPivot.userData.slideDir = slideDir;
          var fF = fT / 2;

          if (isPocket) {
            if (o.mat === "glass" || o.mat === "frosted") {
              var frameW = 6;
              // Draw wooden frame for the glass pocket door
              box(doorPivot, l + 1, l + frameW, 1, o.height - 1, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              box(doorPivot, r - frameW, r - 1, 1, o.height - 1, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              box(doorPivot, l + frameW, r - frameW, o.height - frameW, o.height - 1, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              box(doorPivot, l + frameW, r - frameW, 1, frameW, -0.75, 0.75, matColor === GLASS ? WOOD : matColor, { rough: 0.6 });
              // Draw the inner glass panel
              box(doorPivot, l + frameW, r - frameW, frameW, o.height - frameW, -0.2, 0.2, matColor, panelOpts);
            } else {
              box(doorPivot, l + 1, r - 1, 1, o.height - 1, -0.75, 0.75, matColor, panelOpts);
            }
            if (slideDir === 1) {
              box(doorPivot, l + 6, l + 9, o.height * 0.5 - 6, o.height * 0.5 + 6, 0.75, 1.25, HANDLE, { metal: 0.7 });
              box(doorPivot, l + 6, l + 9, o.height * 0.5 - 6, o.height * 0.5 + 6, -1.25, -0.75, HANDLE, { metal: 0.7 });
            } else {
              box(doorPivot, r - 9, r - 6, o.height * 0.5 - 6, o.height * 0.5 + 6, 0.75, 1.25, HANDLE, { metal: 0.7 });
              box(doorPivot, r - 9, r - 6, o.height * 0.5 - 6, o.height * 0.5 + 6, -1.25, -0.75, HANDLE, { metal: 0.7 });
            }
          } else {
            box(doorPivot, l - 1, r + 1, 1, o.height + 1, fF + 0.3, fF + 1.8, matColor, panelOpts);

            var railL = slideDir === 1 ? l - 2 : r - (r - l) * 2 - 2;
            var railR = slideDir === 1 ? l + (r - l) * 2 + 2 : r + 2;
            railL = Math.max(startCursor, railL);
            railR = Math.min(endCursor, railR);
            box(g, railL, railR, o.height + 1, o.height + 4, fF, fF + 2.2, 0x555555, { metal: 0.8, rough: 0.4 });

            if (slideDir === 1) {
              box(doorPivot, l + 6, l + 9, o.height * 0.5 - 10, o.height * 0.5 + 10, fF + 1.8, fF + 3, HANDLE, { metal: 0.7 });
            } else {
              box(doorPivot, r - 9, r - 6, o.height * 0.5 - 10, o.height * 0.5 + 10, fF + 1.8, fF + 3, HANDLE, { metal: 0.7 });
            }
          }
        } else {
          var swingDir = o.swingDir || "R_IN";
          var isLeftHinge = swingDir.startsWith("L");
          var isInward = swingDir.endsWith("IN");
          
          var maxRot = Math.PI / 2;
          doorPivot.userData.maxOpen = isLeftHinge 
            ? (isInward ? maxRot : -maxRot)
            : (isInward ? -maxRot : maxRot);

          doorPivot.position.set(isLeftHinge ? l + jamb : r - jamb, 0, 0);
          var dw = r - l - 2 * jamb;
          
          var zP0 = isInward ? -2 : 0;
          var zP1 = isInward ? 0 : 2;

          var hX0 = isLeftHinge ? dw - 4 : -dw + 1;
          var hX1 = isLeftHinge ? dw - 1 : -dw + 4;
          var pX0 = isLeftHinge ? 0 : -dw;
          var pX1 = isLeftHinge ? dw : 0;

          box(doorPivot, pX0, pX1, 1, o.height - head, zP0, zP1, WOOD, { rough: 0.6 });
          // Handles on both sides
          box(doorPivot, hX0, hX1, o.height * 0.5 - 6, o.height * 0.5 + 6, zP0 - 0.4, zP0, HANDLE, { metal: 0.7, rough: 0.3 });
          box(doorPivot, hX0, hX1, o.height * 0.5 - 6, o.height * 0.5 + 6, zP1, zP1 + 0.4, HANDLE, { metal: 0.7, rough: 0.3 });
        }
        g.add(doorPivot);
        if (scene && scene.doors) scene.doors.push(doorPivot);
      }
    } else if (o.type === "window") {
      var top = o.sill + o.height;
      var wHead = Math.max(0, Math.min(FR.head, o.height / 2 - 1));
      var wSill = Math.max(0, Math.min(FR.sillW, o.height / 2 - 1));
      if (jamb > 0) {
        localBox(g, l, l + jamb, o.sill, top, fT, 0xf2eee4, { rough: 0.7 });
        localBox(g, r - jamb, r, o.sill, top, fT, 0xf2eee4, { rough: 0.7 });
      }
      if (wSill > 0) localBox(g, l + jamb, r - jamb, o.sill, o.sill + wSill, fT, 0xf2eee4, { rough: 0.7 });
      if (wHead > 0) localBox(g, l + jamb, r - jamb, top - wHead, top, fT, 0xf2eee4, { rough: 0.7 });
      var gl = l + jamb, gr = r - jamb, gy0 = o.sill + wSill, gy1 = top - wHead;
      box(g, gl, gr, gy0, gy1, -1, 1, GLASS, { trans: true, opacity: 0.34, metal: 0.1, rough: 0.05, cast: false });
      // mullions: vertical + horizontal dividers, evenly spaced across the glass
      var mt = FR.mull, md = Math.max(1.2, mt * 0.6);
      if (mt > 0) {
        for (var mi = 1; mi <= FR.mullV; mi++) {
          var mx = gl + ((gr - gl) * mi) / (FR.mullV + 1);
          box(g, mx - mt / 2, mx + mt / 2, gy0, gy1, -md, md, 0xf2eee4, { rough: 0.7 });
        }
        for (var hi = 1; hi <= FR.mullH; hi++) {
          var my = gy0 + ((gy1 - gy0) * hi) / (FR.mullH + 1);
          box(g, gl, gr, my - mt / 2, my + mt / 2, -md, md, 0xf2eee4, { rough: 0.7 });
        }
      }
    }
    // seamless passage: draw nothing — a fully open connection
    for (var ci = childrenBefore; ci < g.children.length; ci++)
      g.children[ci].userData.opening = o.src;
  });
}

/* Curves and vertically-special walls cannot be represented by the old single
   straight extrusion.  Build them as short, watertight prisms along arc length.
   Breakpoints are inserted at opening jambs and editable profile controls, so
   openings stay exact and a sloped top does not become a coarse staircase. */
function sampledWallBreaks(w, gm) {
  var values = [0, gm.L];
  var maxStep = gm.kind === "arc" ? Math.max(8, Math.min(30, gm.curve.radius * Math.PI / 24)) : 80;
  var count = Math.max(1, Math.ceil(gm.L / maxStep));
  for (var i = 1; i < count; i++) values.push((gm.L * i) / count);
  normalizeWallProfile(w).forEach(function (p) { values.push(clamp(p.s, 0, gm.L)); });
  S.openings.forEach(function (o) {
    if (o.wall !== w.id) return;
    values.push(clamp(o.s - o.width / 2, 0, gm.L));
    values.push(clamp(o.s + o.width / 2, 0, gm.L));
  });
  values.sort(function (a, b) { return a - b; });
  return values.filter(function (v, i) { return !i || v - values[i - 1] > 0.01; });
}

function sampledEndCorners(w, s, offset0, offset1, atHeight) {
  var gm = wallGeom(w);
  var nearA = s <= 0.01, nearB = gm && s >= gm.L - 0.01;
  if (gm && gm.kind === "line" && (nearA || nearB)) {
    var step = tJoinStep(w, nearA ? "a" : "b", atHeight);
    if (step) {
      var shift = (offset0 + offset1) / 2 >= -0.01 ? step.tp : step.tm;
      var node = nearA ? (S.nodes[w.a] || gm.a) : (S.nodes[w.b] || gm.b);
      var along = nearA ? 1 : -1,
        ux = gm.ux * along,
        uz = gm.uz * along,
        nx = -gm.uz,
        nz = gm.ux;
      function pt(off) {
        return [node.x + ux * shift + nx * off, node.z + uz * shift + nz * off];
      }
      return [pt(offset0), pt(offset1)];
    }
    var band = wallBandOutline(w, offset0, offset1, atHeight);
    if (band) {
      return nearA
        ? [[band.a0.x, band.a0.z], [band.a1.x, band.a1.z]]
        : [[band.b0.x, band.b0.z], [band.b1.x, band.b1.z]];
    }
  }
  var p = wallPointAt(w, s), t = wallTangentAt(w, s);
  if (!p || !t) return null;
  var nx = -t.uz, nz = t.ux;
  return [
    [p.x + nx * offset0, p.z + nz * offset0],
    [p.x + nx * offset1, p.z + nz * offset1],
  ];
}

function sampledPrismGeometry(w, s0, s1, offset0, offset1, bottom0, bottom1, top0, top1) {
  top0 = Math.max(bottom0, top0);
  top1 = Math.max(bottom1, top1);
  if (s1 - s0 <= 0.001 || (top0 - bottom0 <= 0.001 && top1 - bottom1 <= 0.001)) return null;
  var atHeight = Math.min(bottom0, bottom1);
  var c0 = sampledEndCorners(w, s0, offset0, offset1, atHeight);
  var c1 = sampledEndCorners(w, s1, offset0, offset1, atHeight);
  if (!c0 || !c1) return null;
  var footprint = [c0[0], c0[1], c1[0], c1[1]];
  var pos = [];
  footprint.forEach(function (p, i) { pos.push(p[0], i < 2 ? bottom0 : bottom1, p[1]); });
  footprint.forEach(function (p, i) { pos.push(p[0], i < 2 ? top0 : top1, p[1]); });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex([
    0, 2, 3, 0, 3, 1,
    4, 5, 7, 4, 7, 6,
    0, 4, 6, 0, 6, 2,
    1, 3, 7, 1, 7, 5,
    0, 1, 5, 0, 5, 4,
    2, 6, 7, 2, 7, 3,
  ]);
  geo.computeVertexNormals();
  return geo;
}

function sampledLayerMaterial(w, band, fallbackColor, xray) {
  var isGeneric = w.wallTypeId === "generic" || band.material === "generic-masonry";
  var color = isGeneric ? fallbackColor : (band.color || fallbackColor);
  var isGlass = band.role === "glazing" || /glass/i.test(String(band.material || ""));
  var opts = { color: color, roughness: isGlass ? 0.12 : 0.9, metalness: 0, flatShading: true };
  if (isGlass) Object.assign(opts, { transparent: true, opacity: 0.34, transmission: 0.72, side: THREE.DoubleSide });
  if (w.phase === "demolition" || w.phase === "demolish") Object.assign(opts, { color: 0xc66b62, transparent: true, opacity: 0.55 });
  if (xray) Object.assign(opts, { transparent: true, opacity: 0.18, depthWrite: false });
  return new THREE.MeshStandardMaterial(opts);
}

function openingAtSample(w, s) {
  for (var i = 0; i < S.openings.length; i++) {
    var o = S.openings[i];
    if (o.wall === w.id && s > o.s - o.width / 2 + 0.001 && s < o.s + o.width / 2 - 0.001) return o;
  }
  return null;
}

function addSampledSolid(group, w, gm, vertical, col, xray) {
  var typedWall = Object.assign({}, w);
  if (vertical.wallTypeId && vertical.wallTypeId !== w.wallTypeId) {
    typedWall.wallTypeId = vertical.wallTypeId;
    delete typedWall.layers;
  }
  normalizeWall(typedWall, S);
  var bands = wallLayerBands(typedWall, S);
  var breaks = sampledWallBreaks(w, gm);
  bands.forEach(function (band) {
    if (band.airGap && band.framing) return;
    var mat = sampledLayerMaterial(typedWall, band, col, xray);
    for (var i = 0; i + 1 < breaks.length; i++) {
      var s0 = breaks[i], s1 = breaks[i + 1], mid = (s0 + s1) / 2;
      var profile0 = wallProfileHeight(w, s0, w.height);
      var profile1 = wallProfileHeight(w, s1, w.height);
      var lo0 = vertical.bottom, lo1 = vertical.bottom;
      var hi0 = Math.min(vertical.top, profile0), hi1 = Math.min(vertical.top, profile1);
      if (hi0 <= lo0 && hi1 <= lo1) continue;
      var opening = openingAtSample(w, mid);
      var ranges;
      if (!opening) ranges = [{ b0: lo0, b1: lo1, t0: hi0, t1: hi1 }];
      else {
        var oy0 = opening.type === "window" ? Math.max(0, opening.sill || 0) : 0;
        var oy1 = oy0 + Math.max(0, opening.height || 0);
        ranges = [
          { b0: lo0, b1: lo1, t0: Math.min(hi0, oy0), t1: Math.min(hi1, oy0) },
          { b0: Math.max(lo0, oy1), b1: Math.max(lo1, oy1), t0: hi0, t1: hi1 },
        ];
      }
      ranges.forEach(function (range) {
        var slices = [{ o0: band.start, o1: band.end }];
        if (band.start < -0.01 && band.end > 0.01 &&
            (tJoinStep(w, "a", range.b0) || tJoinStep(w, "b", range.b0))) {
          slices = [{ o0: band.start, o1: 0 }, { o0: 0, o1: band.end }];
        }
        slices.forEach(function (slice) {
          var geo = sampledPrismGeometry(w, s0, s1, slice.o0, slice.o1, range.b0, range.b1, range.t0, range.t1);
          if (!geo) return;
          var mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = !xray;
          mesh.receiveShadow = !xray;
          mesh.userData.wallLayer = { wallId: w.id, layerId: band.id, material: band.material, role: vertical.role };
          if (!(band.role === "glazing" || /glass/i.test(String(band.material || "")))) mesh.userData.physicsProps = MAT_PROPS.masonry;
          group.add(mesh);
        });
      });
    }
  });
}

function framingColor(material) {
  return /steel|metal|galv/i.test(String(material || "")) ? 0x9aa6ad : 0xb98252;
}

/* Physical framing view generated from the same take-off used by schedules.
   It normally sits inside finish layers; glass, section cuts and MEP x-ray
   expose the real studs/tracks instead of a solid placeholder cavity. */
function addWallFraming(parent, w, xray) {
  var framing = wallFraming(S, w);
  if (!framing.members.length) return;
  var bands = wallLayerBands(w, S), byLayer = {};
  bands.forEach(function (band) { byLayer[band.id] = band; });
  var root = new THREE.Group(); root.userData.wallFraming = w.id; parent.add(root);
  framing.members.forEach(function (member) {
    var band = byLayer[member.layerId] || { center: 0 }, color = framingColor(member.material),
      material = new THREE.MeshStandardMaterial({ color: color, roughness: .72, metalness: /steel|metal|galv/i.test(String(member.material || "")) ? .45 : 0,
        transparent: !!xray, opacity: xray ? .42 : 1, depthWrite: !xray });
    if (member.point && Number.isFinite(member.s) && !Number.isFinite(member.start)) {
      var stud = new THREE.Mesh(new THREE.BoxGeometry(member.width, member.length, member.depth), material);
      var tx = member.tangent.x, tz = member.tangent.z, nx = -tz, nz = tx;
      stud.position.set(member.point.x + nx * band.center, member.bottom + member.length / 2, member.point.z + nz * band.center);
      stud.rotation.y = -Math.atan2(tz, tx); stud.castShadow = !xray; root.add(stud); return;
    }
    if (!Number.isFinite(member.start) || !Number.isFinite(member.end)) return;
    var run = member.end - member.start, count = Math.max(1, Math.ceil(run / 40));
    for (var i = 0; i < count; i++) {
      var s0 = member.start + run * i / count, s1 = member.start + run * (i + 1) / count,
        p0 = wallPointAt(w, s0), p1 = wallPointAt(w, s1), dx = p1.x - p0.x, dz = p1.z - p0.z,
        length = Math.hypot(dx, dz), mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2,
        tangent = wallTangentAt(w, (s0 + s1) / 2), fnx = -tangent.z, fnz = tangent.x;
      if (!(length > .01)) continue;
      var plate = new THREE.Mesh(new THREE.BoxGeometry(length + .3, member.width, member.depth), material);
      plate.position.set(mx + fnx * band.center, member.bottom + member.width / 2, mz + fnz * band.center);
      plate.rotation.y = -Math.atan2(dz, dx); plate.castShadow = !xray; root.add(plate);
    }
  });
}

function addRailSegment(group, a, b, y, height, depth, color, xray) {
  var dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (length < 0.01) return;
  var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.58, metalness: 0.12, transparent: xray, opacity: xray ? 0.18 : 1, depthWrite: !xray });
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(length + 0.5, height, depth), mat);
  mesh.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.castShadow = !xray;
  mesh.receiveShadow = !xray;
  group.add(mesh);
}

function addSampledRailing(group, w, gm, vertical, col, xray) {
  var top = vertical.top, bottom = vertical.bottom;
  var spacing = Math.max(20, Number(w.railing && w.railing.spacing) || Number(w.postSpacing) || 100);
  var railT = Math.max(2, Math.min(8, Number(w.railing && w.railing.railThickness) || 5));
  var depth = Math.max(3, Math.min(wallThickness(w, S), Number(w.railing && w.railing.depth) || 6));
  var steps = Math.max(1, Math.ceil(gm.L / Math.min(spacing, 45)));
  var pts = [];
  for (var i = 0; i <= steps; i++) pts.push(wallPointAt(w, gm.L * i / steps));
  [top - railT / 2, bottom + (top - bottom) * 0.48].forEach(function (y) {
    for (var j = 0; j + 1 < pts.length; j++) addRailSegment(group, pts[j], pts[j + 1], y, railT, depth, col, xray);
  });
  var posts = Math.max(1, Math.ceil(gm.L / spacing));
  for (var p = 0; p <= posts; p++) {
    var point = wallPointAt(w, gm.L * p / posts);
    var mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.58, metalness: 0.12, transparent: xray, opacity: xray ? 0.18 : 1, depthWrite: !xray });
    var post = new THREE.Mesh(new THREE.BoxGeometry(railT, top - bottom, depth), mat);
    post.position.set(point.x, (bottom + top) / 2, point.z);
    post.castShadow = !xray;
    group.add(post);
  }
}

function addSampledOpening(group, w, o) {
  if (o.type === "passage") return;
  var gm = wallGeom(w), s = clamp(o.s, o.width / 2, gm.L - o.width / 2);
  var point = wallPointAt(w, s), tangent = wallTangentAt(w, s);
  if (!point || !tangent) return;
  var holder = new THREE.Group();
  holder.position.set(point.x, 0, point.z);
  holder.rotation.y = -Math.atan2(tangent.uz, tangent.ux);
  holder.userData.opening = o;
  group.add(holder);
  var half = o.width / 2, T = wallThickness(w, S), FR = frameSpec(o);
  var y0 = o.type === "window" ? o.sill || 0 : 0;
  var top = Math.min(y0 + o.height, wallProfileHeight(w, s, w.height));
  if (top - y0 <= 1) return;
  var jamb = Math.min(FR.jamb, half - 1);
  if (jamb > 0) {
    localBox(holder, -half, -half + jamb, y0, top, T + FR.depth, 0xeee9df, { rough: 0.75 });
    localBox(holder, half - jamb, half, y0, top, T + FR.depth, 0xeee9df, { rough: 0.75 });
  }
  if (FR.head > 0) localBox(holder, -half + jamb, half - jamb, Math.max(y0, top - FR.head), top, T + FR.depth, 0xeee9df, { rough: 0.75 });
  if (o.type === "window") {
    var sill = Math.min(FR.sillW, (top - y0) / 2);
    if (sill > 0) localBox(holder, -half + jamb, half - jamb, y0, y0 + sill, T + FR.depth, 0xeee9df, { rough: 0.75 });
    localBox(holder, -half + jamb, half - jamb, y0 + sill, top - Math.min(FR.head, (top - y0) / 2), 2, GLASS, { trans: true, opacity: 0.34, transmission: 0.9, rough: 0.05, cast: false });
  } else if (o.type === "door") {
    var pivot = new THREE.Group();
    var left = String(o.swingDir || "R_IN").startsWith("L");
    pivot.position.x = left ? -half + jamb : half - jamb;
    pivot.userData = { isDoor: true, open: false, type: "swing", width: o.width, maxOpen: left ? Math.PI / 2 : -Math.PI / 2 };
    localBox(pivot, left ? 0 : -o.width + 2 * jamb, left ? o.width - 2 * jamb : 0, 1, Math.max(2, top - FR.head), 2, o.color ? parseInt(o.color.slice(1), 16) : WOOD, { rough: 0.6 });
    holder.add(pivot);
    if (scene && scene.doors) scene.doors.push(pivot);
  }
}

function neighborJoinHeights(w) {
  var cuts = [];
  [w.a, w.b].forEach(function (nodeId) {
    S.walls.forEach(function (ow) {
      if (ow === w || (ow.a !== nodeId && ow.b !== nodeId)) return;
      if (!wallSolidAtNode(ow, nodeId)) return;
      var top = wallSolidTop(ow);
      if (top > 0.5) cuts.push(top);
    });
  });
  return cuts;
}

function hasHeightMismatchedJoin(w) {
  var my = wallSolidTop(w);
  return neighborJoinHeights(w).some(function (h) { return Math.abs(h - my) > 1; });
}

function splitVerticalForJoins(w, segments) {
  var cuts = neighborJoinHeights(w);
  if (!cuts.length) return segments;
  var out = [];
  segments.forEach(function (seg) {
    var ys = [seg.bottom, seg.top];
    cuts.forEach(function (c) {
      if (c > seg.bottom + 0.5 && c < seg.top - 0.5) ys.push(c);
    });
    ys.sort(function (a, b) { return a - b; });
    var last = ys[0];
    for (var i = 1; i < ys.length; i++) {
      if (ys[i] - last < 0.5) continue;
      out.push(Object.assign({}, seg, { bottom: last, top: ys[i] }));
      last = ys[i];
    }
  });
  return out.length ? out : segments;
}

function buildSampledWall(w, col) {
  normalizeWall(w, S);
  var gm = wallGeom(w), kind = normalizeWallKind(w);
  if (!gm || gm.L < 1 || kind === "roomDivider") return;
  var group = new THREE.Group();
  group.userData.wall = w;
  group.userData.physicsRole = "static";
  dyn.add(group);
  var renderWall = Object.assign({}, w);
  if (kind === "half" && renderWall.halfHeight == null && renderWall.capHeight == null) renderWall.halfHeight = Math.min(renderWall.height, HALF_WALL_HEIGHT);
  if (kind === "railing" && renderWall.railingHeight == null && renderWall.railHeight == null) renderWall.railingHeight = Math.min(renderWall.height, 100);
  var segments = splitVerticalForJoins(renderWall, verticalSegments(renderWall, function (id) { return wallTypeById(S, id); }));
  var xray = !!(S.mep && S.mep.xray && (typeof S.mep.xray === "object" ? S.mep.xray.walls : S.mep.xray));
  segments.forEach(function (vertical) {
    if (vertical.solid) addSampledSolid(group, renderWall, gm, vertical, col, xray);
    else addSampledRailing(group, renderWall, gm, vertical, col, xray);
  });
  addWallFraming(group, renderWall, xray);
  S.openings.filter(function (o) { return o.wall === w.id; }).forEach(function (o) { addSampledOpening(group, renderWall, o); });
}

function buildWall(w, col, tex) {
  normalizeWall(w, S);
  var kind = normalizeWallKind(w), gm = wallGeom(w);
  if (kind === "roomDivider") return;
  if (gm.kind === "line" && kind === "normal" && normalizeWallProfile(w).length === 0 && !hasHeightMismatchedJoin(w))
    return buildStraightWall(w, col, tex);
  return buildSampledWall(w, col == null ? WALLC : col);
}

/* Where a piece SITS, as opposed to what it looks like. Split out of buildItem
   so a drag can re-place an existing group instead of regenerating it.
   elevOffset re-hangs a piece whose `elev` was set (a placeholder point on a
   wall or ceiling does exactly that); it is 0 for everything else. */
function placeItem(g, it) {
  // undo/redo swaps in fresh item objects with the same ids and the same
  // signature, so a reused group must be re-pointed at the live one — rc.js and
  // modeler.js both read back through userData.item.
  g.userData.item = it;
  g.position.set(it.x, elevOffset(it), it.z);
  g.rotation.y = (-it.rot * Math.PI) / 180;
}

function buildItem(it) {
  var f = FURN[it.type];
  if (!f) return null;
  var g = new THREE.Group();
  placeItem(g, it);
  itemsRoot.add(g);
  buildFurn(g, it);
  tagItemPhysicsRole(g, it);
  if (f.lamp) {
    var L = f.lamp,
      on = it.lightOn !== false,
      col = lampColor(it),
      mul = it.lightI != null ? it.lightI : 1;
    g.userData.lampOff = !on;
    g.traverse(function (o) {
      if (
        o.isMesh &&
        o.material &&
        o.material.userData &&
        o.material.userData.glow
      ) {
        o.material.emissive.setHex(col);
        o.material.emissiveIntensity = on ? 0.4 + 1.4 * S.artK : 0;
      }
    });
    if (on) {
      var ly = typeof L.y === "function" ? L.y(it) : L.y;
      if (fin(ly)) {
        // Physical candela for a centimetre-scale scene, calibrated against this
        // lamp's OWN throw — see gpu.js. Without the conversion a lamp's
        // inverse-square falloff divides by ~62500 and it lights nothing at all.
        var base = legacyIntensity(L.intensity * mul, L.dist || 500);
        var pl;
        if (it.spot) {
          pl = new THREE.SpotLight(
            col,
            base * (0.45 + 1.9 * S.artK),
            L.dist || 500,
            ((it.cone != null ? it.cone : 45) * Math.PI) / 180,
            0.5,
            2
          );
          var pitch = (it.pitch != null ? it.pitch : 0) * Math.PI / 180;
          var tObj = new THREE.Object3D();
          tObj.position.set(0, ly - 100 * Math.cos(pitch), 100 * Math.sin(pitch));
          g.add(tObj);
          pl.target = tObj;
        } else {
          pl = new THREE.PointLight(
            col,
            base * (0.45 + 1.9 * S.artK),
            L.dist || 500,
            2
          );
        }
        pl.position.set(0, ly, 0);
        pl.userData.baseI = base;
        g.add(pl);
      }
    }
  }
  return g;
}

/* ---- furniture cache -------------------------------------------------------
   Furniture is the bulk of a rebuild (~139 of 179 ms on a 37-piece flat), and
   almost none of it changes when a wall moves, the sun moves or a floor texture
   changes. So item groups live in their own subtree that survives clearGroup,
   keyed by a signature of every field that affects how the piece is BUILT — its
   own x/z/rot are excluded, because those go on the group transform and can be
   re-applied without regenerating anything.

   itemsRoot stays a child of `dyn` so applyEnv's traversal (lamp intensity,
   glow) and the physics sweep still reach every piece. */
var itemsRoot = null;
var itemCache = new Map(); // item id -> { g, sig }

/* Split view should describe one shared model, not two unrelated pictures.
   A lightweight Box3Helper mirrors the plan/tree selection without touching
   furniture materials (many catalogue meshes deliberately share them). */
function selected3DBox() {
  if (!S.sel || !dyn) return null;
  var box = new THREE.Box3(), found = false;
  function addObject(o) {
    if (!o) return;
    o.updateWorldMatrix(true, true);
    box.expandByObject(o, true);
    found = true;
  }
  if (S.sel.kind === "item") {
    var one = itemCache.get(S.sel.ref && S.sel.ref.id);
    addObject(one && one.g);
  } else if (S.sel.kind === "items") {
    (S.sel.refs || []).forEach(function (it) {
      var c = itemCache.get(it && it.id);
      addObject(c && c.g);
    });
  } else if (S.sel.kind === "walls") {
    (S.sel.refs || []).forEach(function (wall) {
      dyn.traverse(function (o) {
        if (o.userData && o.userData.wall === wall) addObject(o);
      });
    });
  } else if (S.sel.kind === "wall" || S.sel.kind === "opening") {
    var field = S.sel.kind, ref = S.sel.ref;
    dyn.traverse(function (o) {
      if (o.userData && o.userData[field] === ref) addObject(o);
    });
  } else if (S.sel.kind === "room") {
    var room = roomByKey(S.sel.ref), pts = room && room.nidx && room.nidx.map(function (i) { return S.nodes[i]; }).filter(Boolean);
    if (pts && pts.length) {
      var minx = Math.min.apply(null, pts.map(function (p) { return p.x; })),
        maxx = Math.max.apply(null, pts.map(function (p) { return p.x; })),
        minz = Math.min.apply(null, pts.map(function (p) { return p.z; })),
        maxz = Math.max.apply(null, pts.map(function (p) { return p.z; }));
      box.set(new THREE.Vector3(minx, 2, minz), new THREE.Vector3(maxx, 8, maxz));
      found = true;
    }
  }
  if (!found || box.isEmpty()) return null;
  return box.expandByScalar(2);
}
function syncSelectionOutline() {
  if (!scene) return;
  if (!selectionOutline) {
    selectionOutline = new THREE.Box3Helper(new THREE.Box3(), 0x28c7ad);
    selectionOutline.name = "Planner selection outline";
    selectionOutline.renderOrder = 999;
    selectionOutline.material.depthTest = false;
    selectionOutline.material.transparent = true;
    selectionOutline.material.opacity = 0.95;
    scene.add(selectionOutline);
  }
  var box = selected3DBox();
  selectionOutline.visible = !!box;
  if (box) {
    selectionOutline.box.copy(box);
    selectionOutline.updateMatrixWorld(true);
  }
}

/* Editing a model in the modeler changes how a piece is BUILT without changing
   the piece's own data, so the signature alone would keep serving the old
   geometry. Folding a catalogue revision into it invalidates every entry the
   one time the catalogue changes. */
var catalogRev = 0;
window.addEventListener("catalogUpdated", function () {
  catalogRev++;
});

/* A custom texture is only attached to a material once its bitmap has decoded
   (an image-less clone crashes the renderer's texture upload). The piece built
   during that window has no map and its signature is unchanged, so the item
   cache would serve the untextured group forever — invalidate it when the
   image lands. */
window.addEventListener("customTextureLoaded", function () {
  catalogRev++;
  S.dirty3D = true;
  needsRender = true;
});

function itemSig(it) {
  try {
    return catalogRev + "|" + JSON.stringify(it, function (k, v) {
      // only the piece's OWN placement is transform-only. A nested x/z inside a
      // custom model's part list genuinely changes its shape, so `this === it`
      // keeps the exclusion to the top level.
      return this === it && (k === "x" || k === "z" || k === "rot") ? 0 : v;
    });
  } catch (e) {
    return null; // unserialisable -> never matches, so it always rebuilds
  }
}

function disposeSubtree(o) {
  o.traverse(function (c) {
    if (c.geometry) c.geometry.dispose();
    if (c.material)
      [].concat(c.material).forEach(function (m) {
        m.dispose();
      });
  });
}

function dropItem(id) {
  var c = itemCache.get(id);
  if (!c) return;
  itemsRoot.remove(c.g);
  disposeSubtree(c.g);
  itemCache.delete(id);
}

// Rebuild one piece and (re)cache it. The signature is taken AFTER the build so
// that a builder which annotates its item doesn't make the entry miss forever.
function buildAndCache(it) {
  dropItem(it.id);
  var g = buildItem(it);
  if (g) itemCache.set(it.id, { g: g, sig: itemSig(it) });
  return g;
}

// Reconcile itemsRoot against S.items: build what is new or changed, drop what
// is gone or hidden, and merely re-transform everything else.
function syncItems(hid) {
  var live = {};
  S.items.forEach(function (it) {
    if (hid.items[it.id]) return;
    live[it.id] = 1;
    var c = itemCache.get(it.id);
    if (c && c.sig != null && c.sig === itemSig(it)) {
      placeItem(c.g, it);
      return;
    }
    buildAndCache(it);
  });
  Array.from(itemCache.keys()).forEach(function (id) {
    if (!live[id]) dropItem(id);
  });
}

/* Drain S.items3D — the cheap path a drag or an inspector edit uses instead of
   S.dirty3D. Anything it cannot do piecewise escalates to a full rebuild. */
function applyItemOps() {
  // nothing has been built yet — there is no cached group to update
  if (!itemsRoot) {
    S.items3D.clear();
    S.dirty3D = true;
    return;
  }
  var byId = {};
  S.items.forEach(function (it) {
    byId[it.id] = it;
  });
  var escalate = false;
  S.items3D.forEach(function (mode, id) {
    var it = byId[id],
      c = itemCache.get(id);
    // no live item, or nothing cached to update (e.g. the piece is inside a
    // hidden room) — only the full path knows what to do
    if (!it || !c) {
      escalate = true;
      return;
    }
    if (mode === "move") placeItem(c.g, it);
    else if (!buildAndCache(it)) escalate = true;
  });
  S.items3D.clear();
  shadowsDirty = true;
  needsRender = true;
  // physics owns item transforms while it runs, and bodies are built per
  // rebuild — hand back to the full path rather than desyncing them
  if (escalate || isPhysicsEnabled()) S.dirty3D = true;
}

export function rebuild3D() {
  if (!ready3D) return;
  refreshRuntimePlacements(S);
  // geometry is changing — the shadow map and the frame both need a redraw
  shadowsDirty = true;
  needsRender = true;
  S.items3D.clear(); // a full rebuild subsumes every queued per-item update
  clearPhysics();
  if (!itemsRoot) itemsRoot = new THREE.Group();
  dyn.remove(itemsRoot); // keep the furniture subtree out of the disposal below
  clearGroup(dyn);
  scene.doors = [];
  var bb = contentBounds();
  var gw = bb.w + 900,
    gd = bb.d + 900,
    gt = groundTexture();
  gt.repeat.set(gw / 160, gd / 160);
  var gp = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gd),
    new THREE.MeshStandardMaterial({ map: gt, roughness: 0.97, metalness: 0 }),
  );
  gp.rotation.x = -Math.PI / 2;
  gp.position.set(bb.cx, -2.5, bb.cz);
  gp.receiveShadow = true;
  var st = typeof S !== "undefined" && S.site ? S.site : {};
  var showSV = st.enabled && st.streetView && svBox;
  gp.visible = !showSV;
  
  groundPlaneRef = gp; // Save reference for toggling in applySite
  dyn.add(gp);
  var rooms = detectRooms(),
    hid = hiddenSets(rooms),
    matCache = {};
  function fmatFor(t, customTex, customBump) {
    var key = customTex ? "custom_" + customTex : t;
    if (!matCache[key]) {
      // per-material sheen so polished floors reflect the environment (IBL) like a showroom
      var FLOOR_ROUGH = {
        epoxy: 0.12,
        marble: 0.22,
        marbleDark: 0.2,
        porcelain: 0.28,
        granite: 0.3,
        wood: 0.4,
        parquet: 0.35,
        tiles: 0.25,
        marble: 0.15,
        terrazzo: 0.25,
        slate: 0.62,
        pebble: 0.7,
        brick: 0.8,
        deck: 0.8,
        concrete: 0.75,
        balcony: 0.7,
        carpet: 0.95,
        carpetGrey: 0.95,
      };
      var mat = new THREE.MeshStandardMaterial({
        roughness: customTex ? 0.55 : FLOOR_ROUGH[t] != null ? FLOOR_ROUGH[t] : 0.65,
        metalness: 0.04,
        envMapIntensity: 1.0,
        side: THREE.DoubleSide,
      });
      var bumpScale = customBump != null ? customBump : 0.20;

      if (customTex) {
        if (!S.customTexCache) S.customTexCache = {};
        if (!S.customTexCache[customTex]) {
          var tx = new THREE.TextureLoader().load(customTex, function() { S.repaint3D = true; });
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          S.customTexCache[customTex] = tx;
        }
        mat.map = S.customTexCache[customTex];
        mat.color.setHex(0xffffff);

        try {
          var bumpUrl = getTexturePresetBumpUrl(customTex);
          if (bumpUrl) {
            if (!S.customBumpCache) S.customBumpCache = {};
            if (!S.customBumpCache[bumpUrl]) {
              var bloader = new THREE.TextureLoader();
              bloader.setCrossOrigin("anonymous");
              var btx = bloader.load(bumpUrl, function() { S.repaint3D = true; });
              btx.wrapS = btx.wrapT = THREE.RepeatWrapping;
              S.customBumpCache[bumpUrl] = btx;
            }
            mat.bumpMap = S.customBumpCache[bumpUrl];
            mat.bumpScale = bumpScale;
          }
        } catch (e) {
          console.warn("Custom texture bump load error:", e);
        }
      } else {
        mat.map = floorTexture(t);
        try {
          var bUrl2 = getTexturePresetBumpUrl(t);
          if (bUrl2) {
            if (!S.customBumpCache) S.customBumpCache = {};
            if (!S.customBumpCache[bUrl2]) {
              var bloader2 = new THREE.TextureLoader();
              bloader2.setCrossOrigin("anonymous");
              var btx2 = bloader2.load(bUrl2, function() { S.repaint3D = true; });
              btx2.wrapS = btx2.wrapT = THREE.RepeatWrapping;
              S.customBumpCache[bUrl2] = btx2;
            }
            mat.bumpMap = S.customBumpCache[bUrl2];
            mat.bumpScale = bumpScale;
          }
        } catch (e) {
          console.warn("Floor bump load error:", e);
        }
      }
      matCache[key] = mat;
    }
    return matCache[key];
  }
  var xrayFloor = !!(S.mep && S.mep.xray && typeof S.mep.xray === "object" && S.mep.xray.floor);
  var xrayCeiling = !!(S.mep && S.mep.xray && typeof S.mep.xray === "object" && S.mep.xray.ceiling);
  var xrayWalls = !!(S.mep && S.mep.xray && (typeof S.mep.xray === "object" ? S.mep.xray.walls : S.mep.xray));
  if (rooms.length) {
    rooms.forEach(function (r) {
      if (roomHidden(r.key)) return;
      var t = roomFloor(r.key);
      var cTex = S.roomMeta[r.key] && S.roomMeta[r.key].floorTex;
      var cScale = S.roomMeta[r.key] && S.roomMeta[r.key].floorScale;
      var cBump = S.roomMeta[r.key] && S.roomMeta[r.key].floorBump;
      var scaleVal = cScale ? cScale : (cTex ? 200 : (TILE[t] || 240));
      var fmat = fmatFor(t, cTex, cBump);
      if (xrayFloor) {
        fmat = fmat.clone();
        fmat.transparent = true;
        fmat.opacity = 0.18;
        fmat.depthWrite = false;
      }
      var holes = holesForRoom(r.pts);
      var m = polyMesh(r.pts, 0, scaleVal, fmat, holes);
      if (m) {
        m.receiveShadow = !xrayFloor;
        m.castShadow = !xrayFloor;
        dyn.add(m);
      }
    });
    // Seamless passages: two adjacent rooms (e.g. a corridor and a room) each
    // stop their floor slab at their own wall centerline, leaving a bare strip
    // between them that reads as a dark seam. For a passage that has been made
    // seamless (full overlap width, full wall height, no sill) bridge that strip
    // with a floor patch so the surface is visually continuous.
    var wallToRoomKey = {};
    rooms.forEach(function (r) {
      r.key.split(",").forEach(function (id) { wallToRoomKey[id] = r.key; });
    });
    var bridged = {};
    S.openings.forEach(function (o) {
      if (o.overlapL == null) return;
      if (hid.walls[o.wall]) return;
      var w = wallById(o.wall);
      if (!w) return;
      var seamless =
        Math.abs(o.width - o.overlapL) < 2 &&
        (o.sill || 0) <= 1;
      if (!seamless) return;
      // Find the mate opening: one corridor drag can create openings on MANY
      // walls (one per connected room) sharing a single `paired` array, so
      // don't take the first opening on another wall — it may belong to a
      // different connection across the plan. Pick the physically closest
      // opening on a nearby PARALLEL wall.
      var g1 = wallGeom(w);
      var s1 = clamp(o.s, o.width / 2, g1.L - o.width / 2);
      var P1 = wallPointAt(w, s1), T1 = wallTangentAt(w, s1);
      var P1x = P1.x, P1z = P1.z;
      var o2 = null, w2 = null, g2 = null, s2 = 0, P2x = 0, P2z = 0, bestD = Infinity;
      (o.paired || []).forEach(function (pid) {
        if (pid === o.id) return;
        var c = S.openings.find(function (x) { return x.id === pid; });
        if (!c || c.wall === o.wall) return;
        var cw = wallById(c.wall);
        if (!cw) return;
        var cg = wallGeom(cw);
        var cs = clamp(c.s, c.width / 2, cg.L - c.width / 2);
        var CT = wallTangentAt(cw, cs);
        if (Math.abs(T1.ux * CT.ux + T1.uz * CT.uz) < 0.999) return; // not parallel
        var CP = wallPointAt(cw, cs), cx = CP.x, cz = CP.z;
        var d = Math.hypot(cx - P1x, cz - P1z);
        // only bridge across a real adjacency: wall gap plus a small tolerance
        if (d > (w.thickness + cw.thickness) / 2 + 12 || d >= bestD) return;
        bestD = d;
        o2 = c; w2 = cw; g2 = cg; s2 = cs; P2x = cx; P2z = cz;
      });
      if (!o2) return;
      // draw one patch per connection, not once per opening
      var pairKey = [o.id, o2.id].sort(function (a, b) { return a - b; }).join("-");
      if (bridged[pairKey]) return;
      bridged[pairKey] = 1;
      var hw = Math.min(o.width, o2.width) / 2;
      // align wall 2's direction to wall 1 so the quad winds consistently
      var T2 = wallTangentAt(w2, s2), u2x = T2.ux, u2z = T2.uz;
      if (T1.ux * u2x + T1.uz * u2z < 0) { u2x = -u2x; u2z = -u2z; }
      var pts = [
        { x: P1x - T1.ux * hw, z: P1z - T1.uz * hw },
        { x: P1x + T1.ux * hw, z: P1z + T1.uz * hw },
        { x: P2x + u2x * hw, z: P2z + u2z * hw },
        { x: P2x - u2x * hw, z: P2z - u2z * hw },
      ];
      var rk = wallToRoomKey[o.wall] || wallToRoomKey[o2.wall];
      var ft = rk ? roomFloor(rk) : "tiles";
      var cTex = rk && S.roomMeta[rk] && S.roomMeta[rk].floorTex;
      var cScale = rk && S.roomMeta[rk] && S.roomMeta[rk].floorScale;
      var scaleVal = cScale ? cScale : (cTex ? 200 : (TILE[ft] || 240));
      var bmMat = fmatFor(ft, cTex);
      if (xrayFloor) {
        bmMat = bmMat.clone();
        bmMat.transparent = true;
        bmMat.opacity = 0.18;
        bmMat.depthWrite = false;
      }
      var bm = polyMesh(pts, 0, scaleVal, bmMat);
      if (bm) {
        bm.receiveShadow = !xrayFloor;
        bm.castShadow = !xrayFloor;
        dyn.add(bm);
      }
      // Bridge the wall jambs too: between the two cut walls there is a strip
      // (wall gap + any lateral offset of the paired openings) that exposes the
      // raw wall ends. Cover each side with a vertical wall-colored panel so
      // the reveal reads as one continuous jamb.
      var jH = Math.min(w.height || 270, w2.height || 270);
      var meta1 = S.roomMeta[wallToRoomKey[o.wall]], meta2 = S.roomMeta[wallToRoomKey[o2.wall]];
      var jCol = (meta1 && meta1.wall != null) ? meta1.wall
        : (meta2 && meta2.wall != null) ? meta2.wall
        : S.wallColor;
      var jMat = new THREE.MeshStandardMaterial({ color: jCol, roughness: 0.9 });
      if (xrayWalls) {
        jMat.transparent = true;
        jMat.opacity = 0.18;
        jMat.depthWrite = false;
      }
      var t1 = w.thickness || 10, t2 = w2.thickness || 10;
      // lateral offset between the two paired opening edges (walls dragged imprecisely)
      var loff = Math.abs((P2x - P1x) * T1.ux + (P2z - P1z) * T1.uz);
      // wide enough to swallow the corner overcut when the opening sits at a wall end, but perfectly flush
      var jT = Math.max(t1, t2) + loff;
      [-1, 1].forEach(function (sgn) {
        var ax = P1x + T1.ux * hw * sgn, az = P1z + T1.uz * hw * sgn;
        var bx = P2x + u2x * hw * sgn, bz = P2z + u2z * hw * sgn;
        var len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) return; // edges already flush
        // run the jamb from wall1's far face to wall2's far face so it plugs
        // the corner cube left empty when the through-wall was fully cut away
        var dx = (bx - ax) / len, dz = (bz - az) / len;
        ax -= dx * (t1 / 2 + 0.2); az -= dz * (t1 / 2 + 0.2);
        bx += dx * (t2 / 2 + 0.2); bz += dz * (t2 / 2 + 0.2);
        len = Math.hypot(bx - ax, bz - az);
        var jm = new THREE.Mesh(new THREE.BoxGeometry(len, jH + 2.5, jT), jMat);
        jm.position.set((ax + bx) / 2, (jH - 2.5) / 2, (az + bz) / 2);
        jm.rotation.y = -Math.atan2(bz - az, bx - ax);
        jm.receiveShadow = !xrayWalls;
        jm.castShadow = !xrayWalls;
        dyn.add(jm);
      });
      // and the ceiling strip, when ceilings are shown
      if (S.showCeiling || xrayCeiling) {
        var cMat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.96, side: THREE.DoubleSide });
        if (xrayCeiling) {
          cMat.transparent = true;
          cMat.opacity = 0.18;
          cMat.depthWrite = false;
        }
        var cm = polyMesh(pts, jH, 160, cMat);
        if (cm) {
          cm.receiveShadow = S.showCeiling && !xrayCeiling;
          cm.castShadow = S.showCeiling && !xrayCeiling;
          dyn.add(cm);
        }
      }
    });
    rooms.forEach(function (r) {
      if (roomHidden(r.key)) return;
      var rmat;
      if (S.showCeiling || xrayCeiling) {
        rmat = new THREE.MeshStandardMaterial({
          color: 0xf3efe6,
          roughness: 0.96,
          side: THREE.DoubleSide,
        });
        if (xrayCeiling) {
          rmat.transparent = true;
          rmat.opacity = 0.18;
          rmat.depthWrite = false;
        }
      } else {
        rmat = new THREE.MeshStandardMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
      }
      /* A void cuts the FLOOR SLAB it sits on, not the ceiling above it. Only
         the active storey renders, so punching the ceiling too opened the room
         to empty sky instead of to the floor above. Floor-only is the honest
         cut until stacked storeys render together. */
      var m = polyMesh(r.pts, r.ceilH, 160, rmat);
      if (m) {
        m.castShadow = S.showCeiling && !xrayCeiling;
        m.receiveShadow = S.showCeiling && !xrayCeiling;
        dyn.add(m);
      }
    });
  } else {
    var fBoxOpt = { cast: !xrayFloor, rough: 0.9 };
    if (xrayFloor) {
      fBoxOpt.trans = true;
      fBoxOpt.opacity = 0.18;
    }
    var slab = [
      { x: bb.minx - 40, z: bb.minz - 40 },
      { x: bb.maxx + 40, z: bb.minz - 40 },
      { x: bb.maxx + 40, z: bb.maxz + 40 },
      { x: bb.minx - 40, z: bb.maxz + 40 },
    ];
    /* Without a closed room there is no room polygon to punch, and the void
       used to be a silent no-op on the flat fallback slab. Cut the fallback
       too, so a stairwell drawn before the walls close still reads as a hole. */
    var fallbackHoles = holesForRoom(slab);
    if (fallbackHoles.length) {
      var fmatFlat = new THREE.MeshStandardMaterial({ color: FLOOR, roughness: 0.9 });
      if (xrayFloor) {
        fmatFlat.transparent = true;
        fmatFlat.opacity = 0.18;
        fmatFlat.depthWrite = false;
      }
      var fm = polyMesh(slab, 0, 240, fmatFlat, fallbackHoles);
      if (fm) {
        fm.castShadow = !xrayFloor;
        fm.receiveShadow = !xrayFloor;
        dyn.add(fm);
      }
    } else {
      box(
        dyn,
        bb.minx - 40,
        bb.maxx + 40,
        -3,
        0,
        bb.minz - 40,
        bb.maxz + 40,
        FLOOR,
        fBoxOpt,
      );
    }
  }
  /* The curb around each well. Outside the rooms branch so a void on an
     unclosed plan still gets its edge. */
  var rimMat = new THREE.MeshStandardMaterial({ color: 0x8a8178, roughness: 0.92 });
  slabOpenings().forEach(function (o) {
    var cs = openingCorners(o), ri, a, b, len, rim;
    for (ri = 0; ri < 4; ri++) {
      a = cs[ri]; b = cs[(ri + 1) % 4];
      len = Math.hypot(b.x - a.x, b.z - a.z);
      if (!(len > 2)) continue;
      rim = new THREE.Mesh(new THREE.BoxGeometry(len, 6, 3.2), rimMat);
      rim.position.set((a.x + b.x) / 2, 3, (a.z + b.z) / 2);
      rim.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      rim.castShadow = false;
      rim.receiveShadow = true;
      dyn.add(rim);
    }
  });
  // per-room wall color overrides (a wall shared by two painted rooms takes the last one's color)
  var wallColorMap = {};
  rooms.forEach(function (r) {
    var c = S.roomMeta[r.key] && S.roomMeta[r.key].wall;
    if (c != null)
      r.key.split(",").forEach(function (id) {
        wallColorMap[id] = c;
      });
  });
  S.walls.forEach(function (w) {
    if (hid.walls[w.id]) return;
    buildWall(w, wallColorMap[w.id] != null ? wallColorMap[w.id] : S.wallColor, w.tex);
  });
  // daylight through each WINDOW (soft sky light at the opening, scaled by daylight)
  S.openings.forEach(function (o) {
    if (o.type !== "window") return;
    if (hid.walls[o.wall]) return;
    var w = wallById(o.wall);
    if (!w) return;
    var gm = wallGeom(w);
    var s = clamp(o.s, o.width / 2, gm.L - o.width / 2),
      y = o.sill + o.height / 2;
    var winDist = Math.max(o.width, o.height) * 4 + 260;
    var pl = new THREE.PointLight(
      0xcfe2f2,
      legacyIntensity(0.9, winDist) * S.dayK,
      winDist,
      2,
    );
    var wp = wallPointAt(w, s);
    pl.position.set(wp.x, y, wp.z);
    pl.userData.baseI = legacyIntensity(0.9, winDist);
    pl.userData.win = true;
    dyn.add(pl);
  });
  dyn.add(itemsRoot);
  syncItems(hid);
  // MEP conduits + device markers embedded in the model
  buildMEP3D(dyn, THREE);

  if (isPhysicsEnabled()) {
    initPhysicsForScene();
  }
  applySite(); // reposition the aerial overlay for the new content bounds
  // external modes (RC race) rebuild their collision snapshot off this event
  updateSeeThrough(); // the wall groups are brand new: re-apply the dollhouse cut
  window.dispatchEvent(new Event("scene3d:rebuilt"));
}

function tagItemPhysicsRole(g, it) {
  if (it) g.userData.item = it;
  var minY;
  g.updateMatrixWorld(true);
  var bb = new THREE.Box3().setFromObject(g);
  if (!bb.isEmpty()) minY = bb.min.y;
  g.userData.physicsRole = resolvePhysicsRole(g.userData, minY);
}

export function initPhysicsForScene() {
  if (!dyn) return;
  clearPhysics();
  var items = itemsRoot ? itemsRoot.children : [];
  dyn.children
    .filter(function (c) { return c !== itemsRoot; })
    .concat(items)
    .forEach(function(c) {
      var minY;
      if (c.userData.item && c.userData.physicsRole !== "dynamic" && c.userData.physicsRole !== "static") {
        var ibb = new THREE.Box3().setFromObject(c);
        if (!ibb.isEmpty()) minY = ibb.min.y;
      }
      var role = resolvePhysicsRole(c.userData, minY);
      if (role === "ignore") return;
      var hasGeometry = false;
      c.traverse(function(node) {
        if (node.isMesh) hasGeometry = true;
      });
      if (hasGeometry) addPhysicsBody(c, role === "dynamic");
    });
  hangWindowCloth(dyn);
}

function hangWindowCloth(container) {
  if (!container || !S.openings || !S.openings.length) return;
  var o = S.openings.find(function (op) { return op.type === "window"; });
  if (!o) return;
  var w = wallById(o.wall);
  if (!w) return;
  var gm = wallGeom(w);
  if (!gm || !(gm.L > 1)) return;
  var s = clamp(o.s, (o.width || 80) / 2, gm.L - (o.width || 80) / 2);
  var nx = -gm.uz, nz = gm.ux;
  var thick = (w.thickness || 12) / 2 + 4;
  spawnHangingCloth(container, {
    x: gm.a.x + gm.ux * s + nx * thick,
    y: (o.sill || 90) + (o.height || 120) - 4,
    z: gm.a.z + gm.uz * s + nz * thick,
    width: Math.min(o.width || 80, 90) - 8,
    height: Math.max(70, (o.height || 120) - 10),
    nx: nx,
    nz: nz,
  });
}

function cP() {
  phi = Math.max(0.12, Math.min(Math.PI / 2, phi));
}
function cR() {
  radius = Math.max(180, Math.min(4000, radius));
}
function upd() {
  if (extTick) return; // an external mode (RC race) owns the camera
  if (!isFinite(radius) || !isFinite(theta) || !isFinite(phi)) {
    radius = DEFr;
    theta = 0.92;
    phi = 0.95;
  }
  if (!isFinite(tgt.x) || !isFinite(tgt.y) || !isFinite(tgt.z))
    tgt.set(200, 70, 150);
  var sp = Math.sin(phi);
  camera.position.set(
    tgt.x + radius * sp * Math.cos(theta),
    tgt.y + radius * Math.cos(phi),
    tgt.z + radius * sp * Math.sin(theta),
  );
  camera.lookAt(tgt);
  updateSeeThrough();
  needsRender = true;
}

/* Walls that stand between the camera and what it is looking at are the whole
   reason a piece "can only be dragged from certain angles": you cannot aim at
   what you cannot see. In 3D edit mode those near-side walls step out of the
   way (the dollhouse cut every CAD view does), and step back the moment edit
   mode is off. Only visibility is touched — no material is mutated and no
   rebuild is triggered — so this is safe to run on every camera move. */
function updateSeeThrough() {
  if (!dyn || !camera || !tgt) return;
  var on = (!!S.edit3D || framedInterior) && !walk && !extTick;
  var changed = false;
  dyn.children.forEach(function (g) {
    var w = g.userData && g.userData.wall;
    if (!w) return;
    /* A floor switch replaces S.nodes/S.walls before rebuild3D replaces dyn.
       Compact mode can frame the interior during that one-frame handoff, so a
       stale mesh must not resolve its old node indices against the new floor.
       The live wall objects are authoritative; the old group disappears on
       the rebuild immediately afterwards. */
    if (S.walls.indexOf(w) < 0) return;
    if (!on) {
      if (g.userData.seeThrough) {
        g.userData.seeThrough = false;
        g.visible = true;
        changed = true;
      }
      return;
    }
    var gm = wallGeom(w);
    if (!gm || gm.L < 1) return;
    // signed side of the wall's infinite line for the camera and for the point
    // the view is centred on; opposite signs mean the wall is in between
    var nx = -gm.uz, nz = gm.ux;
    var dc = (camera.position.x - gm.a.x) * nx + (camera.position.z - gm.a.z) * nz,
      dt = (tgt.x - gm.a.x) * nx + (tgt.z - gm.a.z) * nz;
    var between = dc * dt < 0 && Math.abs(dc) > wallThickness(w, S) / 2;
    // ...and only if the wall actually spans the line of sight, not if it is
    // an unrelated wall whose infinite line happens to cut the view
    if (between) {
      var t = Math.abs(dc) / Math.max(1e-3, Math.abs(dc) + Math.abs(dt));
      var cx = camera.position.x + (tgt.x - camera.position.x) * t,
        cz = camera.position.z + (tgt.z - camera.position.z) * t;
      var sAt = (cx - gm.a.x) * gm.ux + (cz - gm.a.z) * gm.uz;
      between = sAt > -60 && sAt < gm.L + 60;
    }
    if (g.userData.seeThrough !== between || g.visible === between) changed = true;
    g.userData.seeThrough = between;
    g.visible = !between;
  });
  /* Visibility is a render input just like camera position. toggleEdit3D()
     calls this directly, outside upd(), so without this wake-up the cutaway
     did not appear until the next orbit or Frame action. */
  if (changed) needsRender = true;
}

export function frameView() {
  if (!ready3D) return;
  var bb = contentBounds();
  var diag = Math.hypot(bb.w, bb.d);
  var compact = plannerCompact();
  framedInterior = compact;
  /* Phone 3D is a look INTO the room, not a dollhouse from above. Keep the
     shallower polar angle, but aim near the upper wall line: aiming at 80 cm
     made the sightline hit the near wall below its top, so Frame showed almost
     nothing except the exterior wall it was meant to look over. */
  var targetY = compact
    ? clamp(ceilingHeight() * 0.78, 180, 230)
    : Math.min(120, bb.d * 0.2 + 60);
  tgt.set(bb.cx, targetY, bb.cz);
  sun.target.position.set(bb.cx, 0, bb.cz);
  radius = clamp(diag * (compact ? 1.08 : 1.15) + (compact ? 180 : 220), 200, 4000);
  theta = compact ? 0.78 : 0.92;
  phi = compact ? 1.05 : 0.95;
  userMoved = true;
  tgtTween = null;
  upd();
}

/* ---- orbit navigation: pan, zoom-to-cursor, keyboard fly, focus-on-point ----
   The orbit camera is a target (`tgt`) plus spherical offset. Rotating changes
   theta/phi and the wheel changes radius; everything below moves the TARGET,
   which is what "navigating the space" actually means — without it you can only
   ever circle the one spot the view was framed on. */
var navRight = null,
  navUp = null,
  navFwd = null,
  navRay = null,
  navPlane = null,
  navHit = null,
  navKeys = {}, // held navigation keys (see navCode)
  navHover = false, // pointer is over the 3D canvas
  navFocus = false, // the 3D canvas was clicked into (WASD gate)
  tgtTween = null; // eased target move (double-click focus)

// Keep the target near the model. Without a leash a fast pan sends the camera
// into empty space with no landmark to navigate back by.
function clampTarget() {
  var bb = contentBounds(),
    diag = Math.hypot(bb.w, bb.d),
    m = Math.max(1200, diag * 0.9);
  tgt.x = clamp(tgt.x, bb.cx - m, bb.cx + m);
  tgt.z = clamp(tgt.z, bb.cz - m, bb.cz + m);
  tgt.y = clamp(tgt.y, -100, 1400);
}
// world-space camera axes for the current orientation
function navBasis() {
  if (!navRight) {
    navRight = new THREE.Vector3();
    navUp = new THREE.Vector3();
    navFwd = new THREE.Vector3();
  }
  navRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  navUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  navFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
}
// pixels -> world units at the target's distance (so a drag tracks the cursor)
function pxScale() {
  var h = (renderer.domElement.clientHeight || 600);
  return (2 * radius * Math.tan(((camera.fov || 55) * Math.PI) / 360)) / h;
}
// drag-pan: slide the target across the screen plane
function panPixels(dx, dy) {
  if (extTick) return; // RC/race mode owns the camera
  navBasis();
  var k = pxScale();
  tgt.addScaledVector(navRight, -dx * k);
  tgt.addScaledVector(navUp, dy * k);
  clampTarget();
  tgtTween = null;
  upd();
}
// normalized device coords for a client point inside the canvas
function ndc(cx, cy) {
  var r = renderer.domElement.getBoundingClientRect();
  return {
    x: ((cx - r.left) / Math.max(1, r.width)) * 2 - 1,
    y: -((cy - r.top) / Math.max(1, r.height)) * 2 + 1,
  };
}
function pointerRay(cx, cy) {
  if (!navRay) navRay = new THREE.Raycaster();
  var n = ndc(cx, cy);
  navRay.setFromCamera(new THREE.Vector2(n.x, n.y), camera);
  return navRay;
}
// where the pointer ray meets the horizontal plane through the target — the
// pivot for zoom-to-cursor (a plane, not the geometry: cheap on every wheel tick)
function pointerGround(cx, cy) {
  var ray = pointerRay(cx, cy);
  if (!navPlane) navPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  navPlane.constant = -tgt.y;
  if (!navHit) navHit = new THREE.Vector3();
  var p = ray.ray.intersectPlane(navPlane, navHit);
  return p && isFinite(p.x) && isFinite(p.z) ? p : null;
}
// wheel/pinch zoom. With a pointer position the point under the cursor stays
// put, so you zoom INTO the corner you are looking at instead of the center.
function zoomBy(factor, cx, cy) {
  if (extTick) return;
  var r0 = radius;
  radius = r0 * factor;
  cR();
  if (cx != null) {
    var piv = pointerGround(cx, cy);
    if (piv) {
      var f = clamp(1 - radius / r0, -0.6, 0.6);
      tgt.x += (piv.x - tgt.x) * f;
      tgt.z += (piv.z - tgt.z) * f;
      clampTarget();
    }
  }
  tgtTween = null;
  upd();
}
// double-click: ease the target onto whatever is under the cursor, so the next
// orbit spins around that object rather than around the room's center
function focusAt(cx, cy) {
  var ray = pointerRay(cx, cy),
    hits = ray.intersectObjects([dyn], true).filter(function (h) {
      return h.object.visible && h.object.type !== "Sprite";
    });
  var p = hits.length ? hits[0].point : pointerGround(cx, cy);
  if (!p) return;
  tgtTween = {
    t: 0,
    dur: 320,
    x0: tgt.x, y0: tgt.y, z0: tgt.z,
    x1: p.x, y1: clamp(p.y, 0, 1400), z1: p.z,
    r0: radius,
    r1: clamp(Math.min(radius, Math.max(220, radius * 0.6)), 180, 4000),
  };
  userMoved = true;
  needsRender = true;
}
/* ---- 3D edit mode: drag furniture straight in the perspective view ----
   The view keeps doing what a view does — pick a piece under the cursor, turn
   the pointer into a world position — and hands every model change to
   interaction.js, so a piece dragged here snaps, stacks and undoes exactly as
   it does on the plan. interaction.js imports this module, so it is pulled in
   lazily (on the first toggle) rather than statically: an import cycle here
   would be evaluated while the scene module is still half-built. */
var editMod = null, // interaction.js once loaded
  editDrag = null; // { it, off, plane, mode, y0, elev0 }

export function isEdit3D() {
  return !!S.edit3D;
}
export function toggleEdit3D(on) {
  if (!ready3D) return false;
  S.edit3D = on == null ? !S.edit3D : !!on;
  if (S.edit3D) {
    if (!editMod)
      import("./interaction.js").then(function (m) {
        editMod = m;
      });
  } else editDrag = null;
  updateSeeThrough(); // hide/restore the near-side walls for the new mode
  if (renderer) renderer.domElement.style.cursor = S.edit3D ? "move" : "";
  return S.edit3D;
}
/* What a picked mesh belongs to. Furniture groups carry userData.item, opening
   holders carry userData.opening and wall groups carry userData.wall; a pick can
   land on any descendant of one, so walk up to the first tagged ancestor.
   The wall itself is NOT draggable — its geometry only ever gets in the way of
   the piece behind it — so a hit that resolves to bare wall is reported as such
   and skipped, letting the ray carry on to whatever stands behind the wall. */
function targetOf(obj) {
  for (var o = obj; o; o = o.parent) {
    if (!o.userData) continue;
    if (o.userData.item) return { kind: "item", ref: o.userData.item };
    if (o.userData.opening) return { kind: "opening", ref: o.userData.opening };
    if (o.userData.wall) return { kind: "wall", ref: o.userData.wall };
  }
  return null;
}
// Everything the 3D edit mode can grab: pieces and openings, never walls, and
// never gated on whether the thing is the FIRST surface under the cursor — the
// ray keeps going past walls, so a sofa behind a wall drags from any angle.
function pickEditTarget(cx, cy) {
  if (!dyn) return null;
  var hits = pointerRay(cx, cy).intersectObjects([dyn], true);
  for (var i = 0; i < hits.length; i++) {
    var h = hits[i];
    if (!h.object.visible || h.object.type === "Sprite") continue;
    var t = targetOf(h.object);
    if (!t || t.kind === "wall") continue;
    return { kind: t.kind, ref: t.ref, point: h.point };
  }
  return null;
}
// world cm per screen pixel at a given distance — the scale an Alt-drag needs
// so the piece tracks the cursor instead of shooting off. pxScale() is the
// same formula at the orbit target's distance; rescale it to the grab point.
function pxScaleAt(dist) {
  return pxScale() * (dist / Math.max(1, radius));
}
// where the pointer ray meets a horizontal plane at height y
function rayAtHeight(cx, cy, y) {
  var ray = pointerRay(cx, cy);
  if (!navPlane) navPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  navPlane.constant = -y;
  if (!navHit) navHit = new THREE.Vector3();
  var p = ray.ray.intersectPlane(navPlane, navHit);
  return p && isFinite(p.x) && isFinite(p.z) ? { x: p.x, z: p.z } : null;
}
// mousedown in edit mode: returns true when a piece was grabbed (and the
// orbit must therefore stay out of this drag)
function editDown(e) {
  if (!S.edit3D || walk || extTick || e.button !== 0 || e.shiftKey) return false;
  var hit = pickEditTarget(e.clientX, e.clientY);
  if (!hit || !editMod) return false;
  // grab on the horizontal plane through the point actually clicked, so the
  // thing does not jump when you grab it by its top
  var gy = hit.point.y,
    g = rayAtHeight(e.clientX, e.clientY, gy);
  if (!g) return false;
  if (hit.kind === "opening") {
    if (!editMod.begin3DOpeningDrag || !editMod.begin3DOpeningDrag(hit.ref)) return false;
    var s0 = editMod.opening3DPos(hit.ref, g.x, g.z);
    if (s0 == null) return false;
    editDrag = { kind: "opening", ref: hit.ref, gy: gy, offS: hit.ref.s - s0 };
    needsRender = true;
    return true;
  }
  var it = hit.ref;
  if (!editMod.begin3DItemDrag(it)) return false;
  editDrag = {
    kind: "item",
    it: it,
    gy: gy,
    off: { x: it.x - g.x, z: it.z - g.z },
    // Alt = raise/lower instead of slide, decided per drag at pointer-down
    vert: !!e.altKey,
    y0: e.clientY,
    elev0: fin(it.elev) ? it.elev : 0,
    scale: pxScaleAt(hit.point.distanceTo(camera.position)),
  };
  needsRender = true;
  return true;
}
function editMove(e) {
  if (!editDrag) return;
  var d = editDrag;
  if (d.kind === "opening") {
    var p = rayAtHeight(e.clientX, e.clientY, d.gy);
    if (!p) return;
    editMod.drag3DOpeningTo(d.ref, p.x, p.z, d.offS);
    needsRender = true;
    return;
  }
  if (d.vert) {
    editMod.drag3DItemElev(d.it, d.elev0 + (d.y0 - e.clientY) * d.scale);
  } else {
    var g = rayAtHeight(e.clientX, e.clientY, d.gy);
    if (!g) return;
    editMod.drag3DItemTo(d.it, g.x + d.off.x, g.z + d.off.z);
  }
  needsRender = true;
}
function editUp() {
  if (!editDrag) return;
  var wasOpening = editDrag.kind === "opening";
  editDrag = null;
  if (editMod) {
    if (wasOpening) editMod.end3DOpeningDrag();
    else editMod.end3DItemDrag();
  }
  needsRender = true;
}

// map a physical key to a navigation action (layout independent, so it works
// on a Hebrew keyboard too)
function navCode(e) {
  switch (e.code) {
    case "ArrowUp": return "fwd";
    case "ArrowDown": return "back";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "KeyW": return "fwd";
    case "KeyS": return "back";
    case "KeyA": return "left";
    case "KeyD": return "right";
    case "KeyE": case "PageUp": return "up";
    case "KeyQ": case "PageDown": return "down";
    case "Equal": case "NumpadAdd": return "in";
    case "Minus": case "NumpadSubtract": return "out";
  }
  return null;
}
// per-frame keyboard movement. Speed scales with the zoom level, so the view
// crawls when you are inside a cupboard and sweeps when you are above the plot.
function navTick(dt) {
  var f = navKeys.fwd ? 1 : 0,
    b = navKeys.back ? 1 : 0,
    l = navKeys.left ? 1 : 0,
    r = navKeys.right ? 1 : 0,
    u = navKeys.up ? 1 : 0,
    d = navKeys.down ? 1 : 0,
    zi = navKeys.in ? 1 : 0,
    zo = navKeys.out ? 1 : 0;
  if (!(f || b || l || r || u || d || zi || zo)) return false;
  var s = radius * 0.9 * (navKeys.fast ? 2.4 : 1) * Math.min(dt, 64) / 1000;
  if (f || b || l || r) {
    navBasis();
    // move along the ground, not along the tilted view axis — otherwise
    // "forward" dives into the floor
    var fx = navFwd.x, fz = navFwd.z, fl = Math.hypot(fx, fz) || 1;
    tgt.x += ((fx / fl) * (f - b) + navRight.x * (r - l)) * s;
    tgt.z += ((fz / fl) * (f - b) + navRight.z * (r - l)) * s;
  }
  if (u || d) tgt.y += (u - d) * s * 0.6;
  if (zi || zo) {
    radius *= 1 + (zo - zi) * 0.9 * (Math.min(dt, 64) / 1000);
    cR();
  }
  clampTarget();
  tgtTween = null;
  upd();
  return true;
}

/* ---- CAD-style view-orientation gizmo (axis triad + click-to-snap views) ----
   A small SVG triad in the corner of the 3D view. It re-projects the world X/Y/Z
   axes through the live camera each frame so it always shows the current
   orientation; clicking an axis nub (or the centre = home/iso) snaps the camera
   to that standard view, like a CAD ViewCube. */
var gizmoEl = null, gizmoAxes = [], gzTmpV = null, gzTmpM = null, viewTween = null;
var AXIS_DEFS = [
  { key: "+x", dir: [1, 0, 0], col: "#e0564f", label: "X", pos: true },
  { key: "-x", dir: [-1, 0, 0], col: "#e0564f", label: "", pos: false },
  { key: "+y", dir: [0, 1, 0], col: "#3fa34d", label: "Y", pos: true },
  { key: "-y", dir: [0, -1, 0], col: "#3fa34d", label: "", pos: false },
  { key: "+z", dir: [0, 0, 1], col: "#4f8cf6", label: "Z", pos: true },
  { key: "-z", dir: [0, 0, -1], col: "#4f8cf6", label: "", pos: false },
];
var GZ = { size: 84, cx: 42, cy: 42, R: 27 };
function buildViewGizmo() {
  var host = document.getElementById("view-3d");
  if (!host || gizmoEl) return;
  var NS = "http://www.w3.org/2000/svg";
  gizmoEl = document.createElement("div");
  gizmoEl.className = "view-gizmo";
  gizmoEl.setAttribute("data-i18n-title", "gizmoHint");
  gizmoEl.title = "Click an axis to snap the view";
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 " + GZ.size + " " + GZ.size);
  AXIS_DEFS.forEach(function (a) {
    if (a.pos) {
      var ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", GZ.cx); ln.setAttribute("y1", GZ.cy);
      ln.setAttribute("stroke", a.col); ln.setAttribute("stroke-width", 2);
      a.line = ln; svg.appendChild(ln);
    }
  });
  var home = document.createElementNS(NS, "circle");
  home.setAttribute("cx", GZ.cx); home.setAttribute("cy", GZ.cy); home.setAttribute("r", 3.6);
  home.setAttribute("class", "gz-home");
  home.addEventListener("click", function (e) { e.stopPropagation(); frameView(); });
  svg.appendChild(home);
  AXIS_DEFS.forEach(function (a) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "gz-nub");
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("r", 8);
    a.circle = c; g.appendChild(c);
    if (a.label) {
      var tx = document.createElementNS(NS, "text");
      tx.setAttribute("text-anchor", "middle"); tx.setAttribute("dy", "3.2");
      tx.setAttribute("class", "gz-lbl"); tx.textContent = a.label;
      a.text = tx; g.appendChild(tx);
    }
    g.addEventListener("click", function (e) { e.stopPropagation(); setStandardView(a.key); });
    a.g = g; a.svg = svg;
    svg.appendChild(g);
  });
  gizmoEl.appendChild(svg);
  host.appendChild(gizmoEl);
  gzTmpV = new THREE.Vector3();
  gzTmpM = new THREE.Matrix4();
  gizmoAxes = AXIS_DEFS;
  updateViewGizmo();
}
function updateViewGizmo() {
  if (!gizmoEl || !camera) return;
  gizmoEl.style.display = walk ? "none" : "block"; // hide in walk mode
  if (walk) return;
  camera.updateMatrixWorld();
  gzTmpM.copy(camera.matrixWorld).invert();
  gizmoAxes.forEach(function (a) {
    var v = gzTmpV.set(a.dir[0], a.dir[1], a.dir[2]).transformDirection(gzTmpM);
    a._x = GZ.cx + v.x * GZ.R;
    a._y = GZ.cy - v.y * GZ.R;
    a._depth = v.z; // view space: +z points toward the viewer → front nubs bigger
    a.circle.setAttribute("cx", a._x);
    a.circle.setAttribute("cy", a._y);
    a.circle.setAttribute("r", Math.max(4.5, 8 + a._depth * 2.2));
    a.circle.setAttribute("fill", a.pos ? a.col : "#fff");
    a.circle.setAttribute("stroke", a.col);
    a.circle.setAttribute("stroke-width", a.pos ? 0 : 1.6);
    a.circle.setAttribute("opacity", (0.5 + 0.5 * (a._depth * 0.5 + 0.5)).toFixed(2));
    if (a.text) { a.text.setAttribute("x", a._x); a.text.setAttribute("y", a._y); }
    if (a.line) { a.line.setAttribute("x2", a._x); a.line.setAttribute("y2", a._y); }
  });
  // painter's order: append nearer nubs last so they sit on top
  gizmoAxes.slice().sort(function (p, q) { return p._depth - q._depth; })
    .forEach(function (a) { a.svg.appendChild(a.g); });
}
function viewAngles(key, curTheta) {
  var H = Math.PI / 2;
  if (key === "+x") return { theta: 0, phi: H };
  if (key === "-x") return { theta: Math.PI, phi: H };
  if (key === "+z") return { theta: H, phi: H };
  if (key === "-z") return { theta: -H, phi: H };
  if (key === "+y") return { theta: curTheta, phi: 0.12 };
  if (key === "-y") return { theta: curTheta, phi: H };
  return { theta: curTheta, phi: phi };
}
function setStandardView(key) {
  framedInterior = false;
  var a = viewAngles(key, theta);
  var d = a.theta - theta;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  viewTween = {
    t: 0, dur: 380,
    th0: theta, ph0: phi,
    th1: theta + d, ph1: clamp(a.phi, 0.12, Math.PI / 2),
  };
  userMoved = true;
  needsRender = true;
}

function lerpC(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
}
// Sun by time-of-day + house north bearing; updates sky, ambient and lamp brightness.
// Prefilter a 3-stop equirect gradient (zenith→horizon→ground) into scene.environment.
// Called from applyEnv whenever the sky colors change (not per-frame — PMREM is costly).
var lastEnvKey = null; // skip the costly PMREM re-prefilter when the sky palette is unchanged
function updateEnvMap(zenC, horC, groundHex) {
  if (!pmrem || !envSrcCanvas) return;
  // PMREM prefiltering is real GPU work and throws outright on a renderer whose
  // backend has not come up yet — which is the state applyEnv() runs in during
  // init3D, since the WebGPU/WebGL2 backend initialises asynchronously. Skip and
  // let the init handler re-run applyEnv() once the backend is live.
  if (!renderer || !renderer.initialized) {
    envDeferred = true;
    return;
  }
  var key = zenC.getHexString() + horC.getHexString() + groundHex;
  if (key === lastEnvKey && envRT) return;
  lastEnvKey = key;
  var ex = envSrcCanvas.getContext("2d"),
    H = envSrcCanvas.height,
    grd = ex.createLinearGradient(0, 0, 0, H);
  // scale sky colors down: the env map is an ambient *fill*, not a second sun,
  // so a lit gradient would flood the room and flatten it.
  var z = zenC.clone().multiplyScalar(0.62),
    h = horC.clone().multiplyScalar(0.62);
  grd.addColorStop(0.0, "#" + z.getHexString());
  grd.addColorStop(0.5, "#" + h.getHexString());
  grd.addColorStop(0.52, "#" + groundHex);
  grd.addColorStop(1.0, "#" + groundHex);
  ex.fillStyle = grd;
  ex.fillRect(0, 0, envSrcCanvas.width, H);
  envSrcTex.needsUpdate = true;
  var rt = pmrem.fromEquirectangular(envSrcTex);
  if (envRT) envRT.dispose();
  envRT = rt;
  scene.environment = rt.texture;
}

export function applyEnv() {
  if (!ready3D) return;
  // the sun/lighting is about to move — the shadow map (and the frame) is stale
  shadowsDirty = true;
  needsRender = true;
  var bb = contentBounds(),
    cx = bb.cx,
    cz = bb.cz,
    R = Math.max(Math.hypot(bb.w, bb.d), 300);
  var sr = 6,
    ss = 18,
    on = S.hour > sr && S.hour < ss,
    E,
    Ap;
  if (on) {
    var t = (S.hour - sr) / (ss - sr);
    E = Math.sin(t * Math.PI) * 1.02;
    Ap = ((S.northAngle + 90 + t * 180) * Math.PI) / 180;
  } else {
    E = -0.25;
    Ap = ((S.northAngle + (S.hour <= sr ? 80 : 280)) * Math.PI) / 180;
  }
  var ce = Math.cos(E),
    se = Math.sin(E);
  var dx = ce * Math.sin(Ap),
    dy = Math.max(se, 0.04),
    dz = -ce * Math.cos(Ap),
    D = R * 1.7 + 450;
  sun.position.set(cx + dx * D, dy * D, cz + dz * D);
  sun.target.position.set(cx, 0, cz);
  var s = R * 0.85 + 220;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.far = D * 2.4;
  if (sun.shadow.camera.updateProjectionMatrix)
    sun.shadow.camera.updateProjectionMatrix();
  var dk = on ? clamp(se / 0.85, 0, 1) : 0;
  S.dayK = dk;
  var lowK = on ? 1 - clamp(E / 0.7, 0, 1) : 1;
  // LUX: physical lights divide irradiance by PI, so every pre-r185 intensity
  // literal in this rig is PI too dim as written. See gpu.js.
  sun.intensity = LUX * (on ? 0.35 + 1.15 * dk : 0);
  sun.color.copy(lerpC(0xfff4e0, 0xff7a36, lowK));
  hemi.intensity = LUX * (0.02 + 0.05 * dk); // env map now supplies most sky ambient
  flt.intensity = LUX * 0.0;
  // gradient sky: zenith->horizon colors, shared with the path tracer via envPT
  var zen = on ? lerpC(0x5f93c8, 0xb46a4a, lowK) : new THREE.Color(0x070b14);
  var hor = on ? lerpC(0xd8e6f2, 0xf0a35c, lowK) : new THREE.Color(0x182233);
  envPT = {
    zenith: [zen.r, zen.g, zen.b],
    horizon: [hor.r, hor.g, hor.b],
    ground: [0.3, 0.34, 0.24],
    night: on ? 0 : 1,
  };
  if (skyCanvas) {
    var sx = skyCanvas.getContext("2d"),
      grd = sx.createLinearGradient(0, 0, 0, skyCanvas.height);
    grd.addColorStop(0, "#" + zen.getHexString()); // canvas top = zenith
    grd.addColorStop(0.62, "#" + hor.getHexString()); // horizon band
    grd.addColorStop(1, "#" + hor.clone().multiplyScalar(0.75).getHexString()); // below horizon, slightly darker
    sx.fillStyle = grd;
    sx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    skyTex.needsUpdate = true;
  }
  var bg = on ? lerpC(0xbfd6ec, 0xe8975a, lowK) : new THREE.Color(0x0d1320);
  scene.background = bg;
  if (!scene.fog) scene.fog = new THREE.Fog(hor.getHex(), 2600, 9500);
  else scene.fog.color.copy(hor);
  if (stars) stars.visible = !on;
  // refresh image-based lighting to match the new sky (ground tone darkens at night)
  updateEnvMap(zen, hor, on ? "3a3d30" : "0a0d14");
  renderer.toneMappingExposure = on ? 1.12 : 0.95;
  S.artK = on ? 0.12 + 0.55 * (1 - dk) : 1.0;
  dyn.traverse(function (o) {
    if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
      o.intensity = o.userData.win
        ? o.userData.baseI * 1.5 * dk
        : o.userData.baseI * (0.45 + 1.9 * S.artK);
    }
    if (
      o.isMesh &&
      o.material &&
      o.material.userData &&
      o.material.userData.glow
    ) {
      var off = o.parent && o.parent.userData && o.parent.userData.lampOff;
      o.material.emissiveIntensity = off ? 0 : 0.4 + 1.4 * S.artK;
    }
  });
  applySite(); // keep the site skybox/sky-dome visibility in sync with day/night
}

// Position + toggle the real-world site overlay (aerial ground + street-view
// skybox). Cheap and idempotent — safe to call after any scene/site change.
export function applySite() {
  if (!ready3D) return;
  var st = S.site || {};
  var showSV = st.enabled && st.streetView && svBox;
  // apartment floor within the real building: drop the surroundings (skybox +
  // aerial ground) so window views come from the right height. 300cm/floor.
  var floorCm = Math.max(0, st.floor || 0) * 300;

  // ---- aerial ground plane (scaled to real-world meters) ----
  // Also shown in street-view mode: the pano skybox is a background at
  // infinity, so the satellite imagery supplies the actual ground under the
  // model, Google-Earth style.
  var showAerial = st.enabled && st.show3D && SITE.aerial && SITE.aerial.canvas;
  if (showAerial) {
    var bb = contentBounds();
    if (!siteGroup) {
      siteGroup = new THREE.Group();
      siteAerialMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({
          roughness: 0.95,
          metalness: 0,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      siteAerialMesh.rotation.x = -Math.PI / 2; // lie flat; texture-north -> -Z
      siteAerialMesh.receiveShadow = true;
      siteGroup.add(siteAerialMesh);
      scene.add(siteGroup);
    }
    // (re)build the texture only when the underlying canvas changes
    if (!siteAerialTex || siteAerialTex.image !== SITE.aerial.canvas) {
      if (siteAerialTex) siteAerialTex.dispose();
      siteAerialTex = new THREE.CanvasTexture(SITE.aerial.canvas);
      siteAerialMesh.material.map = siteAerialTex;
      siteAerialMesh.material.needsUpdate = true;
    }
    siteAerialMesh.scale.set(SITE.aerial.wcm, SITE.aerial.hcm, 1);
    siteAerialMesh.material.opacity = st.opacity != null ? st.opacity : 0.85;
    siteGroup.position.set(bb.cx + (st.offX || 0), -2.4 - floorCm, bb.cz + (st.offZ || 0));
    siteGroup.rotation.y = ((st.groundRot || 0) * Math.PI) / 180;
    siteGroup.visible = true;
  } else if (siteGroup) {
    siteGroup.visible = false;
  }
  // ---- street-view pano dome ----
  var showSV = st.enabled && st.streetView && svBox;
  if (svBox) {
    svBox.visible = !!showSV;
    if (showSV) {
      var bb2 = contentBounds();
      var cx = bb2.cx + (st.offX || 0);
      var cz = bb2.cz + (st.offZ || 0);
      var pX = 0,
        pZ = 0;
      var rad = ((st.groundRot || 0) * Math.PI) / 180;
      if (svBox.userData.panoLat && svBox.userData.panoLon && st.lat && st.lon) {
        var po = llToLocalCm(svBox.userData.panoLat, svBox.userData.panoLon, st.lat, st.lon);
        var cos = Math.cos(rad),
          sin = Math.sin(rad);
        pX = po.x * cos + po.z * sin;
        pZ = -po.x * sin + po.z * cos;
      }
      // Anchor the backdrop sphere at the car's real location so the pano
      // lines up with the model's compass orientation. On an upper floor, drop
      // the sphere center below the camera (scaled by SV_BLDG_DIST) so the
      // camera sits above the pano's equator and looks down at the street at a
      // believable angle — no projection, so nothing smears at any height.
      svBox.position.set(
        cx + pX,
        SV_CAM_H - floorCm * (SV_RADIUS / SV_BLDG_DIST),
        cz + pZ,
      );
      svBox.rotation.y = rad;
    }
  }

  // Hide the green ground plane in Street View mode (only room + SV ground)
  // and when the apartment is on an upper floor with the aerial lowered —
  // otherwise the procedural ground at y=0 hides the real surroundings below.
  if (groundPlaneRef) {
    groundPlaneRef.visible = !showSV && !(showAerial && floorCm > 0);
  }

  if (skyDome) skyDome.visible = !showSV;
  // repaint only — NEVER set S.dirty3D here: rebuild3D() and applyEnv() both
  // call applySite(), so flagging a rebuild from inside it made every edit
  // kick off an infinite full-rebuild loop (rebuild → applySite → dirty3D →
  // rebuild next frame, at frame rate, leaking GPU memory each pass).
  needsRender = true;
}

// Build/replace the street-view skybox from 6 cube-face <img>s (or null to
// clear). Face keys: px,nx,py,ny,pz,nz. Called by the UI after fetch.
export function setStreetViewCube(faces) {
  if (!ready3D) return;
  if (svBox) {
    scene.remove(svBox);
    svBox.geometry.dispose();
    [].concat(svBox.material || []).forEach(function (m) {
      if (m.map) m.map.dispose();
      if (m.uniforms && m.uniforms.sky && m.uniforms.sky.value)
        m.uniforms.sky.value.dispose();
      m.dispose();
    });
    svBox = null;
  }
  if (!faces) {
    applySite();
    return;
  }
  // Clean photographic backdrop: the 6 Street View cube faces wrap a plain
  // inside-out sphere around the scene — a pure skybox, NOT projected onto a
  // ground plane. A single street-level pano has no real pixels for far/
  // overhead ground, so flattening its lower half onto a plane stretches a
  // thin band of horizon pixels across the whole floor (the "smeared ground"
  // streaks, unavoidable from one pano). Keeping it as a backdrop sphere means
  // every direction samples the photo at its true angle — buildings, trees and
  // sky read correctly and nothing ever smears, at any floor. The room sits
  // inside; the ground directly below is the pano's own nadir (road under the
  // capture car), which is fine as a distant floor and never stretches.
  var blank = null;
  function faceImg(k) {
    if (faces[k]) return faces[k];
    if (!blank) {
      blank = document.createElement("canvas");
      blank.width = blank.height = 4;
      var bx = blank.getContext("2d");
      bx.fillStyle = "#8a94a0";
      bx.fillRect(0, 0, 4, 4);
    }
    return blank;
  }
  var cubeTex = new THREE.CubeTexture(
    ["px", "nx", "py", "ny", "pz", "nz"].map(faceImg),
  );
  cubeTex.needsUpdate = true;
  // Plain sphere at SV_RADIUS — no per-vertex ground projection. The camera
  // orbits a small room near the center, so parallax against a sphere this
  // large reads as "at infinity".
  var geo = new THREE.SphereGeometry(SV_RADIUS, 64, 32);
  var mat = new THREE.ShaderMaterial({
    uniforms: { sky: { value: cubeTex } },
    // Sample direction is the per-fragment object-space direction from the
    // sphere center — exact for every fragment.
    vertexShader:
      "varying vec3 vPos;\n" +
      "void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    // -x flip = the BackSide (inside-out) mirroring fix. Raw sample, no tone
    // mapping: the pano is a finished photo — ACES washes it out.
    fragmentShader:
      "uniform samplerCube sky; varying vec3 vPos;\n" +
      "void main(){ vec3 d = normalize(vPos); gl_FragColor = textureCube(sky, vec3(-d.x, d.y, d.z)); }",
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  svBox = new THREE.Mesh(geo, mat);
  if (faces._panoLat && faces._panoLon) {
    svBox.userData = { panoLat: faces._panoLat, panoLon: faces._panoLon };
  }
  svBox.renderOrder = -2; // early in the opaque pass; geometry covers it
  svBox.frustumCulled = false; // the camera usually sits inside it
  scene.add(svBox);
  applySite();
}

export function setSize(w, h) {
  if (!ready3D || w === 0 || h === 0) return;
  needsRender = true;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = 45;
  camera.updateProjectionMatrix();
  // The node graph tracks the renderer's own size — no per-pass resize needed,
  // unlike the old EffectComposer which had to be sized pass by pass.
  settle = SETTLE_FRAMES; // a resize invalidates TRAA's history
}

// One render tick: through the AO/AA node graph when available, else direct.
// Both throw if the backend has not finished initialising, so callers must
// respect renderer.initialized (the animate loop and snapshot3D both do).
function renderScene() {
  if (!renderer || !renderer.initialized) return;
  if (usePost && post) post.render();
  else renderer.render(scene, camera);
}

export function setOrbitCamera(opts) {
  if (!opts) return;
  framedInterior = false;
  if (typeof opts.theta === "number" && isFinite(opts.theta)) theta = opts.theta;
  if (typeof opts.phi === "number" && isFinite(opts.phi)) phi = clamp(opts.phi, 0.12, Math.PI / 2);
  if (typeof opts.radius === "number" && isFinite(opts.radius)) radius = clamp(opts.radius, 180, 4000);
  if (opts.target) {
    if (typeof opts.target.x === "number") tgt.x = opts.target.x;
    if (typeof opts.target.y === "number") tgt.y = opts.target.y;
    if (typeof opts.target.z === "number") tgt.z = opts.target.z;
  }
  userMoved = true;
  upd();
  needsRender = true;
}

export function getOrbitCamera() {
  return {
    theta: theta,
    phi: phi,
    radius: radius,
    target: { x: tgt.x, y: tgt.y, z: tgt.z },
  };
}

// PNG snapshot of the current 3D view (render first so the buffer is fresh).
// Returns a Promise: the GPU queue has to drain before the canvas is readable,
// so unlike the old synchronous WebGL path this cannot return a data URL inline.
export function snapshot3D() {
  if (!ready3D || !renderer || !renderer.initialized) return Promise.resolve(null);
  // Kept promise-returning even though the read is synchronous: the backend may
  // not be up yet (the guard above), and callers already handle the async form.
  try {
    renderScene();
    return Promise.resolve(renderer.domElement.toDataURL("image/png"));
  } catch (e) {
    console.warn("3D snapshot failed:", e);
    return Promise.resolve(null);
  }
}

export function exportGLTF(cb) {
  if (!ready3D) return cb(null);
  import("three/addons/exporters/GLTFExporter.js").then(function (mod) {
    ensureBuilt();
    var exporter = new mod.GLTFExporter();
    exporter.parse(dyn, function (gltf) { cb(gltf); }, { binary: true });
  }).catch(function () { cb(null); });
}

// Flush a pending rebuild so the extractor sees the current model.
export function ensureBuilt() {
  if (!ready3D) return;
  if (S.dirty3D) {
    S.dirty3D = false;
    rebuild3D();
    applyEnv();
  }
}

// Extract the full scene as plain data (analytic prims + triangles) for the path-tracer worker.
export function extractPTScene() {
  if (!ready3D) return null;
  ensureBuilt();
  if (!envPT) applyEnv();
  scene.updateMatrixWorld(true);
  var fwd = camera.getWorldDirection(new THREE.Vector3());
  var right = new THREE.Vector3()
    .crossVectors(fwd, new THREE.Vector3(0, 1, 0))
    .normalize();
  var up = new THREE.Vector3().crossVectors(right, fwd);
  var sd = new THREE.Vector3()
    .subVectors(sun.target.position, sun.position)
    .normalize();
  var materials = [],
    matKey = {},
    textures = [],
    texKey = {},
    prims = [],
    lights = [];
  function regTex(map) {
    if (texKey[map.uuid] != null) return texKey[map.uuid];
    var img = map.image,
      c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    var x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    var d = x.getImageData(0, 0, c.width, c.height);
    texKey[map.uuid] = textures.length;
    textures.push({
      w: c.width,
      h: c.height,
      rx: map.repeat.x || 1,
      ry: map.repeat.y || 1,
      data: d.data,
    });
    return texKey[map.uuid];
  }
  function regMat(m) {
    var em =
      m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)
        ? [m.emissive.r, m.emissive.g, m.emissive.b]
        : [0, 0, 0];
    var rec = {
      color: [m.color.r, m.color.g, m.color.b],
      rough: m.roughness != null ? m.roughness : 0.8,
      metal: m.metalness || 0,
      opacity: m.transparent ? m.opacity : 1,
      emissive: em,
      emissiveI: m.emissiveIntensity || 0,
      tex: m.map ? regTex(m.map) : -1,
    };
    var key =
      rec.color.join(",") +
      "|" +
      rec.rough +
      "|" +
      rec.metal +
      "|" +
      rec.opacity +
      "|" +
      rec.emissive.join(",") +
      "|" +
      rec.emissiveI +
      "|" +
      rec.tex;
    if (matKey[key] == null) {
      matKey[key] = materials.length;
      materials.push(rec);
    }
    return matKey[key];
  }
  // rigid inverse of matrixWorld as row-major affine 12 floats (e is column-major)
  function rigidInv(o) {
    var e = new THREE.Matrix4().copy(o.matrixWorld).invert().elements;
    return [
      e[0],
      e[4],
      e[8],
      e[12],
      e[1],
      e[5],
      e[9],
      e[13],
      e[2],
      e[6],
      e[10],
      e[14],
    ];
  }
  /* undo the candela conversion so the tracer sees pre-r185 intensity units */
  function legacyPower(o) {
    var d = o.distance || 0;
    if (!(d > 0)) return o.intensity / (Math.PI * 250 * 250);
    return (o.intensity * 16) / (Math.PI * d * d);
  }
  function aabbOf(o) {
    var b = new THREE.Box3().setFromObject(o);
    return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
  }
  function triPrim(mi, A, B, C, uv) {
    return {
      t: "t",
      m: mi,
      p: [A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z],
      uv: uv,
      aabb: [
        Math.min(A.x, B.x, C.x) - 0.5,
        Math.min(A.y, B.y, C.y) - 0.5,
        Math.min(A.z, B.z, C.z) - 0.5,
        Math.max(A.x, B.x, C.x) + 0.5,
        Math.max(A.y, B.y, C.y) + 0.5,
        Math.max(A.z, B.z, C.z) + 0.5,
      ],
    };
  }
  dyn.traverse(function (o) {
    if (o.isPointLight || o.isSpotLight) {
      if (!o.userData.win) {
        var lp = o.getWorldPosition(new THREE.Vector3());
        lights.push({
          p: [lp.x, lp.y, lp.z],
          r: 7,
          color: [o.color.r, o.color.g, o.color.b],
          // The tracer's LAMP_SCALE is calibrated against pre-r185 (unitless)
          // intensities. Scene lights now carry physical candela from
          // legacyIntensity(i, dist) = i * PI * (dist/2)^2 / 4, so invert that
          // here — otherwise every lamp arrives ~10^5 too strong.
          power: legacyPower(o),
        });
      }
      return;
    }
    if (!o.isMesh) return;
    var m = o.material;
    if (!m || (m.transparent && m.opacity === 0)) return; // invisible ceiling
    var g = o.geometry,
      mi = regMat(m),
      p = g.parameters;
    if (g.type === "BoxGeometry" || g.type === "RoundedBoxGeometry") {
      // Always use bounding box: RoundedBoxGeometry extends BoxGeometry and
      // inherits type="BoxGeometry", but passes (1,1,1) to super so
      // g.parameters are wrong.  computeBoundingBox works for both.
      g.computeBoundingBox();
      var hx = (g.boundingBox.max.x - g.boundingBox.min.x) / 2;
      var hy = (g.boundingBox.max.y - g.boundingBox.min.y) / 2;
      var hz = (g.boundingBox.max.z - g.boundingBox.min.z) / 2;
      prims.push({
        t: "b",
        m: mi,
        inv: rigidInv(o),
        h: [hx, hy, hz],
        aabb: aabbOf(o),
      });
    } else if (g.type === "CylinderGeometry") {
      prims.push({
        t: "c",
        m: mi,
        inv: rigidInv(o),
        r: Math.max(p.radiusTop, p.radiusBottom),
        hh: p.height / 2,
        aabb: aabbOf(o),
      });
    } else if (g.type === "SphereGeometry") {
      var wp = o.getWorldPosition(new THREE.Vector3());
      prims.push({
        t: "s",
        m: mi,
        c: [wp.x, wp.y, wp.z],
        r: p.radius,
        aabb: aabbOf(o),
      });
    } else if (g.type === "PlaneGeometry") {
      var hw = p.width / 2,
        hh = p.height / 2,
        MW = o.matrixWorld;
      var A = new THREE.Vector3(-hw, -hh, 0).applyMatrix4(MW),
        B = new THREE.Vector3(hw, -hh, 0).applyMatrix4(MW),
        C = new THREE.Vector3(hw, hh, 0).applyMatrix4(MW),
        D = new THREE.Vector3(-hw, hh, 0).applyMatrix4(MW);
      prims.push(triPrim(mi, A, B, C, [0, 0, 1, 0, 1, 1]));
      prims.push(triPrim(mi, A, C, D, [0, 0, 1, 1, 0, 1]));
    } else if (g.isBufferGeometry && g.attributes && g.attributes.position) {
      // Real triangles with their uvs: polyMesh floors/ceilings (indexed) and
      // the walls, which are ExtrudeGeometry and therefore NON-indexed — they
      // used to be dropped entirely, so photo mode rendered a house with no walls.
      var pa = g.attributes.position,
        ua = g.attributes.uv,
        ix = g.index ? g.index.array : null,
        cnt = ix ? ix.length : pa.count,
        MW2 = o.matrixWorld,
        k;
      for (k = 0; k + 2 < cnt; k += 3) {
        var i0 = ix ? ix[k] : k,
          i1 = ix ? ix[k + 1] : k + 1,
          i2 = ix ? ix[k + 2] : k + 2;
        var a = new THREE.Vector3()
          .fromBufferAttribute(pa, i0)
          .applyMatrix4(MW2);
        var b2 = new THREE.Vector3()
          .fromBufferAttribute(pa, i1)
          .applyMatrix4(MW2);
        var c2 = new THREE.Vector3()
          .fromBufferAttribute(pa, i2)
          .applyMatrix4(MW2);
        var uv = ua
          ? [
              ua.getX(i0),
              ua.getY(i0),
              ua.getX(i1),
              ua.getY(i1),
              ua.getX(i2),
              ua.getY(i2),
            ]
          : [0, 0, 0, 0, 0, 0];
        prims.push(triPrim(mi, a, b2, c2, uv));
      }
    }
  });
  return {
    camera: {
      pos: [camera.position.x, camera.position.y, camera.position.z],
      fwd: [fwd.x, fwd.y, fwd.z],
      up: [up.x, up.y, up.z],
      fov: camera.fov,
      // Photo mode uses the live projection ratio by default. Previously its
      // fixed 16:9 canvas changed the framing and made other viewports look
      // stretched or cropped when entering photo mode.
      aspect: camera.aspect,
    },
    sun: {
      dir: [sd.x, sd.y, sd.z],
      color: [sun.color.r, sun.color.g, sun.color.b],
      // same unit story as the lamps: sun.intensity is LUX-scaled (x PI) now,
      // while the tracer's SUN_SCALE/SUN_DISC were tuned pre-r185
      intensity: sun.intensity / Math.PI,
      angRad: 0.032,
    },
    sky: envPT,
    exposure: renderer.toneMappingExposure,
    materials: materials,
    textures: textures,
    prims: prims,
    lights: lights,
  };
}

/* Build the 3D scene. ASYNC now: it fetches three first (js/three_lazy.js), so
   the 2D planner is interactive before the renderer has even been downloaded.
   Idempotent — repeated calls return the same promise, and once it has resolved
   they resolve immediately. Resolves to has3D(): false means three would not
   load (the #nothree panel is showing), which is the same answer the old
   `typeof THREE` check gave on a browser without it. */
export function init3D() {
  if (init3DPromise) return init3DPromise;
  init3DPromise = loadThree().then(build3D).catch(function (e) {
    if (window.console && console.error) console.error("three failed to load:", e);
    var v3d = document.getElementById("v3d"),
      nothree = document.getElementById("nothree");
    if (v3d) v3d.style.display = "none";
    if (nothree) nothree.style.display = "flex";
    return false;
  });
  return init3DPromise;
}

function build3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef0f3);
  // WebGPURenderer drives a WebGPU backend where the browser has it and silently
  // falls back to its own WebGL2 backend where it does not (WebKitGTK, older
  // Safari) — same API, same node materials, so there is only one code path to
  // maintain. See gpu.js for the backend policy and the forceWebGL test switch.
  renderer = createRenderer({
    canvas: document.getElementById("v3d"),
    // antialias:false is deliberate. MSAA makes the scene pass multisampled while
    // the depth/normal targets GTAO and TRAA read from are single-sampled, and the
    // per-frame depth copy then fails with a sample-count validation error. TRAA
    // is the antialiasing here — it resolves edges temporally instead, which also
    // beats MSAA on the alpha-tested foliage and thin trim in these scenes.
    antialias: false,

  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  // PCFSoft is available again on WebGPURenderer: shadow filtering goes through
  // the TSL node system (PCFSoftShadowFilter), not the old WebGLShadowMap that
  // deprecated this type. It is the only filter here that honours shadow.radius,
  // which is what gives the sun a penumbra instead of a hard stencil edge.
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Shadows are camera-independent, so there's no reason to re-render the (4K)
  // shadow map every frame while the user just orbits. Update it on demand —
  // only when geometry or the sun actually moved (see shadowsDirty).
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // Image-based lighting: prefilter the gradient sky into an environment map so
  // every PBR material gets sky-directional ambient + real reflections (kills the flat look).
  pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  envSrcCanvas = document.createElement("canvas");
  envSrcCanvas.width = 128;
  envSrcCanvas.height = 64;
  envSrcTex = new THREE.CanvasTexture(envSrcCanvas);
  envSrcTex.mapping = THREE.EquirectangularReflectionMapping;
  // near=10 (not 1): with far=12000 a near of 1 wastes almost all depth
  // precision, z-fighting the 1mm wall-joint overlaps into dashed seams.
  camera = new THREE.PerspectiveCamera(45, 1, 10, 50000);
  hemi = new THREE.HemisphereLight(0xffffff, 0x9c8d6f, LUX * 0.6);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff3df, LUX * 0.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.bias = -0.0005;
  // scene units are centimeters; normalBias must be large enough to clear a
  // shadow texel (~1cm) or walls self-shadow into zigzag acne along edges —
  // the proud baseboard/door-frame trim (0.8–1.3cm) needs extra clearance.
  sun.shadow.normalBias = 3.5;
  sun.shadow.radius = 6; // penumbra width; needs PCFSoftShadowMap to have any effect
  scene.add(sun);
  scene.add(sun.target);
  flt = new THREE.DirectionalLight(0xeaf0ff, LUX * 0.26);
  flt.position.set(-420, 300, -460);
  scene.add(flt);
  dyn = new THREE.Group();
  scene.add(dyn);
  /* From here on there IS a scene, so the has3D()/ready3D guards must open:
     the rest of this function calls applyEnv() and rebuild3D(), which are two
     of them. Everything they need (scene, renderer, camera, dyn) exists. */
  ready3D = true;

  // Post-processing: AO gives the contact/corner darkening that makes interiors
  // read as real instead of "floating"; TRAA cleans the edges the raster pass
  // leaves behind. Built as a TSL node graph rather than a pass chain — the
  // scene pass writes colour, normal and velocity into one MRT so AO and AA can
  // share it instead of each re-rendering the scene.
  try {
    post = new THREE.RenderPipeline(renderer);
    // samples:0 pins the scene pass to single-sampled. PassNode otherwise
    // inherits renderer.samples, and a multisampled colour target with the
    // single-sampled depth GTAO/TRAA read produces a per-frame WebGPU
    // sample-count validation error on the depth copy.
    var scenePass = TSL.pass(scene, camera, { samples: 0 });
    scenePass.setMRT(TSL.mrt({ output: TSL.output, normal: TSL.normalView, velocity: TSL.velocity }));
    var colorNode = scenePass.getTextureNode("output");
    var depthNode = scenePass.getTextureNode("depth");
    var normalNode = scenePass.getTextureNode("normal");
    var velocityNode = scenePass.getTextureNode("velocity");

    aoPass = ADDONS.ao(depthNode, normalNode, camera);
    // GTAO's radius is in WORLD units, unlike the old SSAO kernelRadius which was
    // in its own screen-ish space. Scene units are centimetres (room ~400–600cm),
    // so contact occlusion wants tens of cm, not the 0.25 metre-scale default.
    aoPass.radius.value = 18;
    aoPass.distanceExponent.value = 1.2;
    aoPass.thickness.value = 12;
    aoPass.distanceFallOff.value = 1;
    aoPass.scale.value = 1.1; // slightly over 1: interiors read better with firm contact shadows
    aoPass.samples.value = 16;

    // AO multiplies the beauty pass, then TRAA resolves the result.
    // GTAO renders into a single-channel RedFormat target, so the occlusion has
    // to be broadcast to rgb before multiplying — multiplying the vec4 directly
    // zeroes green and blue and the whole view comes out red.
    var lit = colorNode.mul(TSL.vec4(TSL.vec3(aoPass.getTextureNode().r), 1));
    traaPass = ADDONS.traa(lit, depthNode, velocityNode, camera);
    // ?post=raw|ao|traa (or localStorage home3d_post) bisects the graph when the
    // image comes out wrong — "raw" is the bare scene pass, "ao" adds GTAO.
    var stage = (/[?&]post=(\w+)/.exec(location.search) || [])[1] ||
      (function () { try { return localStorage.getItem("home3d_post"); } catch (e) { return null; } })() ||
      "traa";
    post.outputNode = stage === "raw" ? colorNode : stage === "ao" ? lit : traaPass;
    usePost = true;
  } catch (e) {
    console.warn("post-processing unavailable, falling back to direct render:", e);
    post = null;
    usePost = false;
  }
  setQualityPreset((S.workspace && S.workspace.quality) || "auto");
  window.addEventListener("mf-posture", function () {
    if (!plannerCompact()) framedInterior = false;
    if (renderer && !gameRendererLock) applyPlannerQuality();
    upd();
  });

  // The backend comes up asynchronously (adapter/device request on WebGPU). The
  // animate loop already skips frames until renderer.initialized flips, so all
  // this has to do is wake it once the backend is live and report which one we
  // actually got — useful when a machine silently lands on the WebGL2 fallback.
  renderer.init().then(function () {
    // Anything that needed real GPU work during init3D was deferred to here.
    // applyEnv() rebuilds the IBL/PMREM environment, the sky and the sun from
    // current state, so re-running it is the whole catch-up.
    if (envDeferred) {
      envDeferred = false;
      try { applyEnv(); } catch (e) { console.error("deferred applyEnv failed:", e); }
    }
    needsRender = true;
    settle = SETTLE_FRAMES;
    var backend = renderer.backend && renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
    if (window.console && console.info) console.info("3D backend: " + backend + " (three r" + THREE.REVISION + ")");
    window.dispatchEvent(new CustomEvent("renderBackendReady", { detail: { backend: backend } }));
  }).catch(function (e) {
    console.error("3D backend failed to initialise:", e);
  });

  // star dome, shown only at night (deterministic layout)
  (function () {
    var pos = [],
      R = 6800;
    for (var i = 0; i < 420; i++) {
      var az = (i * 2.399963) % (Math.PI * 2),
        el = 0.06 + (((i * 97) % 100) / 100) * 1.35;
      pos.push(
        R * Math.cos(el) * Math.cos(az),
        R * Math.sin(el),
        R * Math.cos(el) * Math.sin(az),
      );
    }
    var sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0xcfdcf2,
        size: 2.5,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        fog: false,
      }),
    );
    stars.visible = false;
    stars.renderOrder = -1;
    scene.add(stars);
  })();

  // gradient sky dome (repainted by applyEnv); stars render in front of it
  skyCanvas = document.createElement("canvas");
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  skyTex = new THREE.CanvasTexture(skyCanvas);
  skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 24, 12),
    new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  skyDome.renderOrder = -2;
  scene.add(skyDome);

  tgt = new THREE.Vector3(200, 70, 150);
  radius = 620;
  theta = 0.92;
  phi = 0.95;
  DEFr = 620;

  var el = renderer.domElement,
    down = false,
    dragPan = false, // this drag pans instead of orbiting
    lx = 0,
    ly = 0;
  /* Touch-only walkthrough movement. Looking remains on the canvas; the
     left-hand pad supplies forward/back/strafe without stealing that gesture. */
  walkControls = document.createElement("div");
  walkControls.className = "walk-touch-controls";
  walkControls.hidden = true;
  walkControls.innerHTML = '<div class="walk-stick"><span></span></div>';
  el.parentNode.appendChild(walkControls);
  var walkStick = walkControls.firstElementChild,
    walkKnob = walkStick.firstElementChild,
    stickPointer = null;
  function updateStick(e) {
    var r = walkStick.getBoundingClientRect(),
      radius = r.width * 0.32,
      dx = e.clientX - (r.left + r.width / 2),
      dy = e.clientY - (r.top + r.height / 2),
      len = Math.hypot(dx, dy) || 1,
      scale = Math.min(1, radius / len);
    dx *= scale; dy *= scale;
    walkKnob.style.transform = "translate(" + dx + "px," + dy + "px)";
    touchMove.x = dx / radius;
    touchMove.z = dy / radius;
  }
  function releaseStick(e) {
    if (stickPointer !== e.pointerId) return;
    stickPointer = null;
    touchMove.x = touchMove.z = 0;
    walkKnob.style.transform = "";
  }
  walkStick.addEventListener("pointerdown", function (e) {
    stickPointer = e.pointerId;
    walkStick.setPointerCapture(e.pointerId);
    updateStick(e);
    e.preventDefault();
  });
  walkStick.addEventListener("pointermove", function (e) {
    if (stickPointer === e.pointerId) updateStick(e);
  });
  walkStick.addEventListener("pointerup", releaseStick);
  walkStick.addEventListener("pointercancel", releaseStick);
  el.addEventListener("mouseenter", function () {
    navHover = true;
  });
  el.addEventListener("mouseleave", function () {
    navHover = false;
    if (!navFocus) navKeys = {};
  });
  // clicking into the 3D view "engages" it: that is the gate for the WASD keys,
  // which are shared with global shortcuts (W = walk mode) elsewhere in the app
  window.addEventListener(
    "mousedown",
    function (e) {
      var on = e.target === el;
      if (navFocus && !on) navKeys = {};
      navFocus = on;
    },
    true,
  );
  window.addEventListener("blur", function () {
    navKeys = {};
  });
  el.addEventListener("mousedown", function (e) {
    // edit mode gets first refusal on a plain left press: it only claims the
    // drag when a piece is actually under the cursor, so empty space and
    // right/middle/Shift still orbit and pan as usual
    if (editDown(e)) {
      down = false;
      dragPan = false;
      return;
    }
    down = true;
    userMoved = true;
    // middle button, right button or Shift+left = pan; plain left = orbit
    dragPan = !walk && (e.button === 1 || e.button === 2 || e.shiftKey);
    if (e.button === 1) e.preventDefault(); // no autoscroll cursor
    lx = e.clientX;
    ly = e.clientY;
  });
  // right-drag pans, so suppress the browser menu over the canvas
  el.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  el.addEventListener("dblclick", function (e) {
    if (walk || extTick) return;
    userMoved = true;
    focusAt(e.clientX, e.clientY);
  });
  window.addEventListener("mouseup", function () {
    editUp();
    down = false;
    dragPan = false;
  });
  window.addEventListener("mousemove", function (e) {
    if (editDrag) {
      editMove(e);
      return;
    }
    if (!down) return;
    if (walk) {
      yaw -= (e.clientX - lx) * 0.005;
      pitch = Math.max(-1.3, Math.min(1.3, pitch - (e.clientY - ly) * 0.005));
      lx = e.clientX;
      ly = e.clientY;
      walkLook();
      return;
    }
    var dx = e.clientX - lx,
      dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    // Shift counts mid-drag too, so you can start orbiting and slide over
    if (dragPan || e.shiftKey) {
      panPixels(dx, dy);
      return;
    }
    theta -= dx * 0.005;
    phi -= dy * 0.005;
    cP();
    upd();
  });
  // map a physical key (layout-independent, so it works with a Hebrew/other
  // keyboard layout too) to a movement direction
  function moveDir(e) {
    switch (e.code) {
      case "KeyW":
      case "ArrowUp":
        return "fwd";
      case "KeyS":
      case "ArrowDown":
        return "back";
      case "KeyD":
      case "ArrowRight":
        return "right";
      case "KeyA":
      case "ArrowLeft":
        return "left";
    }
    return null;
  }
  window.addEventListener("keydown", function (e) {
    if (!walk) return;
    var d = moveDir(e);
    if (d) {
      keys[d] = true;
      e.preventDefault();
    } else if (e.code === "KeyV") {
      var m = toggleWalkView();
      window.dispatchEvent(new CustomEvent("walkview", { detail: m }));
      e.preventDefault();
    } else if (e.code === "KeyG" || e.code === "Keyע") {
      if (isPhysicsEnabled()) {
        hitObjectAtCenter(camera, scene);
      }
      e.preventDefault();
    } else if (e.code === "KeyT" || e.code === "Keyא") {
      if (isPhysicsEnabled()) {
        const slowMo = toggleSlowMo();
        // ui.js owns flash(); view3d can't import it (ui.js imports us), so
        // this rides the same CustomEvent bridge as walkview/freemove above
        window.dispatchEvent(new CustomEvent("slowmo", { detail: slowMo }));
      }
      e.preventDefault();
    } else if (e.code === "KeyF") {
      var toggledDoor = false;
      if (scene && scene.doors && scene.doors.length > 0) {
        var minD = Infinity;
        var nearestDoor = null;
        scene.doors.forEach(function(d) {
          var pos = new THREE.Vector3();
          d.getWorldPosition(pos);
          var dist = Math.hypot(pos.x - walkPos.x, pos.z - walkPos.z);
          if (dist < 150 && dist < minD) {
            minD = dist;
            nearestDoor = d;
          }
        });
        if (nearestDoor) {
          nearestDoor.userData.open = !nearestDoor.userData.open;
          toggledDoor = true;
        }
      }
      if (!toggledDoor) {
        var fm = toggleFreeMove();
        window.dispatchEvent(new CustomEvent("freemove", { detail: fm }));
      }
      e.preventDefault();
    } else if (e.code === "Escape") toggleWalk(false);
  });
  window.addEventListener("keyup", function (e) {
    var d = moveDir(e);
    if (d) keys[d] = false;
  });
  el.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      userMoved = true;
      if (walk) {
        // in third-person, the wheel pulls the camera in/out; ignore in first-person
        if (walkView === "tpv") {
          tpDist = clamp(tpDist * (1 + e.deltaY * 0.0012), 90, 900);
          walkLook();
        }
        return;
      }
      // Ctrl/⌘+wheel is the pinch-zoom gesture on trackpads; treat it as zoom
      // too (never as a page zoom), and zoom toward the cursor either way.
      zoomBy(1 + e.deltaY * 0.0012, e.clientX, e.clientY);
    },
    { passive: false },
  );
  // ---- keyboard navigation (orbit mode) ----
  // Capture phase + stopPropagation: the same keys drive plan-editing shortcuts
  // in ui.js / interaction.js, and while you are navigating the 3D view they
  // must not also nudge the selection or switch tools.
  function navGate(e, code) {
    if (walk || extTick || !camera) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    var ae = document.activeElement;
    if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return false;
    if (ae && ae.isContentEditable) return false;
    if (!navHover && !navFocus) return false;
    // WASD only once the view has been clicked into — a bare W over the canvas
    // still means "walk mode" for anyone used to that shortcut
    if (/^Key[WASD]$/.test(e.code)) return navFocus;
    return true;
  }
  window.addEventListener(
    "keydown",
    function (e) {
      var c = navCode(e);
      if (!c || !navGate(e, c)) return;
      navKeys[c] = true;
      navKeys.fast = e.shiftKey;
      userMoved = true;
      needsRender = true;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  window.addEventListener(
    "keyup",
    function (e) {
      var c = navCode(e);
      if (!c) return;
      if (navKeys[c]) e.stopPropagation();
      navKeys[c] = false;
      navKeys.fast = e.shiftKey;
    },
    true,
  );
  var tm = 0,
    ld = 0,
    cx0 = 0, // last two-finger centroid (drives touch panning)
    cy0 = 0,
    tapT = 0, // last single-tap time+position, for double-tap focus
    tapX = 0,
    tapY = 0;
  function d2(e) {
    var a = e.touches[0],
      b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function cen(e) {
    var a = e.touches[0],
      b = e.touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }
  el.addEventListener(
    "touchstart",
    function (e) {
      userMoved = true;
      if (e.touches.length === 1) {
        tm = 1;
        lx = e.touches[0].clientX;
        ly = e.touches[0].clientY;
        /* Edit mode gets first refusal on a single finger, exactly as it does
           on a left press: with no piece under the finger editDown declines
           and the touch orbits as before. editDown reads button/altKey/shiftKey,
           which a Touch does not carry — a plain object supplies the mouse
           defaults (a second finger is how you pan, so nothing is lost). */
        if (
          editDown({
            clientX: lx,
            clientY: ly,
            button: 0,
            shiftKey: false,
            altKey: false,
          })
        ) {
          tm = 3; // dragging a piece: neither orbit nor pinch until it is let go
          e.preventDefault();
        }
      } else if (e.touches.length >= 2) {
        tm = 2;
        ld = d2(e);
        var c = cen(e);
        cx0 = c.x;
        cy0 = c.y;
      }
    },
    { passive: false },
  );
  el.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault();
      if (tm === 3) {
        if (e.touches.length === 1) editMove(e.touches[0]);
        return;
      }
      if (tm === 1 && e.touches.length === 1) {
        if (walk) {
          yaw -= (e.touches[0].clientX - lx) * 0.006;
          pitch = Math.max(-1.3, Math.min(1.3, pitch - (e.touches[0].clientY - ly) * 0.006));
          lx = e.touches[0].clientX;
          ly = e.touches[0].clientY;
          walkLook();
        } else {
          theta -= (e.touches[0].clientX - lx) * 0.006;
          phi -= (e.touches[0].clientY - ly) * 0.006;
          lx = e.touches[0].clientX;
          ly = e.touches[0].clientY;
          cP();
          upd();
        }
      } else if (tm === 2 && e.touches.length >= 2) {
        var d = d2(e),
          f = ld / Math.max(d, 1),
          c = cen(e),
          mx = c.x - cx0,
          my = c.y - cy0;
        ld = d;
        cx0 = c.x;
        cy0 = c.y;
        if (walk) {
          if (walkView === "tpv") {
            tpDist = clamp(tpDist * f, 90, 900);
            walkLook();
          }
        } else {
          // two fingers do both at once: spread/squeeze zooms, sliding pans
          if (Math.abs(1 - f) > 0.002) zoomBy(f, c.x, c.y);
          if (Math.hypot(mx, my) > 0.5) panPixels(mx, my);
        }
      }
    },
    { passive: false },
  );
  el.addEventListener("touchend", function (e) {
    if (tm === 3) {
      if (e.touches.length === 0) {
        editUp();
        tm = 0;
      }
      return; // a piece drag is never also a double-tap
    }
    if (e.touches.length === 0) {
      // double-tap (one finger, same spot, under 320ms) focuses that point
      if (tm === 1 && !walk) {
        var now = performance.now();
        if (now - tapT < 320 && Math.hypot(lx - tapX, ly - tapY) < 30) {
          focusAt(lx, ly);
          tapT = 0;
        } else {
          tapT = now;
          tapX = lx;
          tapY = ly;
        }
      }
      tm = 0;
    } else if (e.touches.length === 1) {
      tm = 1;
      lx = e.touches[0].clientX;
      ly = e.touches[0].clientY;
    }
  });

  el.addEventListener("touchcancel", function () {
    if (tm === 3) editUp();
    tm = 0;
  });

  upd();
  applyEnv();
  
  // returns true while any door is still easing toward its target (so the loop
  // keeps painting until it settles, then goes idle)
  function updateDoors() {
    if (!scene || !scene.doors) return false;
    var moving = false;
    scene.doors.forEach(function(d) {
      if (!d.userData) return;
      if (d.userData.type === "swing") {
        var targetRot = d.userData.open ? d.userData.maxOpen : 0;
        var delta = targetRot - d.rotation.y;
        if (Math.abs(delta) > 1e-4) {
          d.rotation.y += delta * 0.1;
          moving = true;
        } else d.rotation.y = targetRot;
      } else if (d.userData.type === "slide") {
        var maxSlide = d.userData.width * 0.9;
        var targetX = d.userData.open ? d.userData.slideDir * maxSlide : 0;
        var dx = targetX - d.position.x;
        if (Math.abs(dx) > 1e-3) {
          d.position.x += dx * 0.1;
          moving = true;
        } else d.position.x = targetX;
      }
    });
    return moving;
  }

  /* returns true if any human is present (they animate continuously, so their
     presence keeps the render loop live)

     People are FURNITURE, so their groups hang under itemsRoot, not directly
     off dyn — dyn.children only ever held itemsRoot itself. This pass used to
     scan dyn.children, matched nobody, and so people stood frozen while
     humansLive stayed false forever. A traverse finds them wherever the item
     reconciler has parented them.

     Throttled to ~30fps, and it only pays for the traverse on the frames it
     actually animates. The sway is slow enough that half-rate is invisible,
     and this pass is the one thing in an otherwise idle scene that can pin
     the render loop (and the 4096² shadow map, see the gate below) at display
     rate. Frames in between reuse the last answer so `live` stays stable. */
  var humanFrameT = 0, humansPresent = false;
  function updateHumans(time) {
    if (!dyn) return false;
    if (humanFrameT && time - humanFrameT < 33) return humansPresent;
    humanFrameT = time;
    var any = false;
    dyn.traverse(function (c) {
      if (c.userData && c.userData.isHuman) {
        HumanFactory.animateHuman(c, time);
        any = true;
      }
    });
    humansPresent = any;
    return any;
  }

  var lastTime = 0;
  buildViewGizmo();
  (function animate(time) {
    time = time || performance.now();
    var delta = safeDeltaMilliseconds(lastTime ? time - lastTime : 16, 16);
    lastTime = time;
    requestAnimationFrame(animate);
    if (S.repaint3D) {
      // lightweight path: something visual changed (texture load, overlay
      // param) but the model didn't — repaint without rebuilding the scene
      S.repaint3D = false;
      needsRender = true;
    }
    // per-item path first: it may escalate to S.dirty3D, and a full rebuild
    // already covers everything it would have done
    if (S.items3D.size && !S.dirty3D) applyItemOps();
    if (S.dirty3D) {
      S.dirty3D = false;
      try {
        rebuild3D();
        applyEnv();
        // compile() issues GPU work, so it too has to wait for the backend
        if (renderer && renderer.initialized && scene && camera) {
          renderer.compile(scene, camera);
        }
      } catch (err) {
        if (window.console && console.error)
          console.error("rebuild3D failed:", err);
      }
    }
    // CAD view-gizmo camera tween (eased snap to a standard view)
    if (viewTween) {
      viewTween.t += delta;
      var vk = Math.min(1, viewTween.t / viewTween.dur);
      var ve = vk < 0.5 ? 2 * vk * vk : 1 - Math.pow(-2 * vk + 2, 2) / 2;
      theta = viewTween.th0 + (viewTween.th1 - viewTween.th0) * ve;
      phi = viewTween.ph0 + (viewTween.ph1 - viewTween.ph0) * ve;
      cP();
      upd();
      if (vk >= 1) viewTween = null;
    }
    // eased target move (double-click / double-tap focus)
    if (tgtTween) {
      var tt = tgtTween;
      tt.t += delta;
      var tk = Math.min(1, tt.t / tt.dur),
        te = 1 - Math.pow(1 - tk, 3);
      tgt.set(
        tt.x0 + (tt.x1 - tt.x0) * te,
        tt.y0 + (tt.y1 - tt.y0) * te,
        tt.z0 + (tt.z1 - tt.z0) * te,
      );
      radius = tt.r0 + (tt.r1 - tt.r0) * te;
      upd();
      if (tk >= 1) tgtTween = null;
    }
    // held navigation keys (pan / rise / zoom) — needs a live frame while down
    if (!walk) navTick(delta);
    syncPhysicsToThree(delta);
    if (walk) moveWalk();
    var extLive = false;
    if (extTick) {
      try {
        extLive = !!extTick(delta, time);
      } catch (err) {
        if (window.console && console.error)
          console.error("external tick failed:", err);
      }
    }
    // Collect live animations. Each of these mutates the scene, so any of them
    // being active means we must paint this frame (and the next).
    var doorsMoving = updateDoors();
    var humansLive = updateHumans(time);
    var physicsLive = isPhysicsBusy();
    // Nothing can be painted until the WebGPU/WebGL2 backend has finished its
    // async init; keep the loop alive and pick up on the frame after it lands.
    if (!renderer || !renderer.initialized) return;
    var live = doorsMoving || humansLive || physicsLive || extLive;
    if (needsRender || live || settle > 0) {
      // Live animation keeps TRAA's history fed on its own; `settle` only has to
      // cover the frames after motion stops.
      if (needsRender || live) settle = SETTLE_FRAMES;
      else settle--;
      needsRender = false;
      // Refresh the sun shadow map only when geometry/light actually changed.
      // Physics and human motion move shadow-casters too, so keep it live then.
      // extLive (Night Shift tick) is true every frame but the indoor scene is
      // mostly static — throttle shadow passes to ~5 Hz to avoid hammering the
      // GPU with a 4096² depth re-render 60 times a second.
      if (extLive) {
        if (!shadowThrottleT || time - shadowThrottleT > 200) {
          renderer.shadowMap.needsUpdate = true;
          shadowThrottleT = time;
        }
      } else if (shadowsDirty || physicsLive) {
        renderer.shadowMap.needsUpdate = true;
        shadowsDirty = false;
        shadowThrottleT = time;
      } else if (humansLive) {
        // Same reasoning as extLive above: people move slowly and are small in
        // frame, so re-rendering a 4096² depth map for their sway on every
        // frame is the most expensive thing in an otherwise static room. Cap
        // it at ~5 Hz. Geometry and physics keep the immediate path above.
        if (!shadowThrottleT || time - shadowThrottleT > 200) {
          renderer.shadowMap.needsUpdate = true;
          shadowThrottleT = time;
        }
      }
      syncSelectionOutline();
      try {
        renderScene();
      } catch (e) {
        // Never silently swallow this: a broken post-processing graph paints
        // pure black and an empty catch makes it look like nothing ran at all.
        // Log once, then drop to a direct render so the view stays usable.
        if (!renderErrLogged) {
          renderErrLogged = true;
          if (window.console && console.error) console.error("renderScene failed, falling back to direct render:", e);
        }
        usePost = false;
        try { renderer.render(scene, camera); } catch (e2) {}
      }
      updateViewGizmo(); // keep the orientation triad in sync with the camera
    }
  })();
  return true;
}

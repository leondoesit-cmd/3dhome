import { buildBlueprintUnderlay3D } from './blueprint_3d.js';
import { createPlannerDrawing } from './planner_drawing.js';
import { updateCabinetRuntimeMesh } from './cabinet_mesh.js';
import { switchFloorAndWait } from './floors.js';
import { buildSurveyGeometry } from './survey_mesh.js';
import { moveSurveyWalker, navigationPosition, navigationFloorTransition } from './navigation_geometry.js';
import { navigationProfile, cameraRetraction } from "./navigation_profile.js";
import { createCameraSweep } from './camera_sweep.js';
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
import { createRenderer, LUX, legacyIntensity, retainShaderCaches } from "./gpu.js";
import { primeGpuTier } from "./material_tier.js";
import {
  S,
  clamp,
  fin,
  TILE,
  WALL_T,
  WALL_H,
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
  worldUVs,
  groundTexture,
} from "./primitives.js";
import { FURN, lampColor, buildItem as buildFurn, elevOffset, itemVSpan } from "./furniture.js";
import { refreshRuntimePlacements } from "./core/runtime.js";
import { getTexturePresetBumpUrl } from "./textures.js";
import { pbrEntryFor, pbrTextures, pbrSurfaceMaterial, legacyTextureUrl, legacyFloorKey, materialById, sharedRepeat, textureMisses } from "./pbr_material.js";
import { createRoomBounce, roomIrradiance, spotFlux, pointFlux, lightMaskRoom, SKY_ONLY, UNMASKED } from "./room_bounce.js";
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
  roomName,
  hiddenSets,
  usedNodes,
  nodeDegree,
  wallById,
  wallPointAt,
  wallTangentAt,
  distSeg,
  pointInPoly,
} from "./geometry.js";
import { holesForRoom, hitSlabOpening, openingCorners, slabOpenings } from "./slab_openings.js";
import { roofMeshTriangles } from "./roof.js";
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
  projectToWall,
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
import { layerRank, layerOf, isLayerVisible, isLayerGhosted } from "./layers.js";
import { wallFraming } from "./wall_framing.js";
import { fmtLen } from "./display_units.js";
import { ceilingHeight } from "./elevation.js";
import { classifyOpeningCut, clipTrianglesBelowY, topFaceTriangles, cutHeightFor, nearSideWall } from "./wall_cut.js";
import { nearCutOn, cutStyle, STUB_HEIGHT, FADE_LEVEL } from "./wall_view.js";
import { itemUserVis, itemUserUnpickable } from "./user_layers.js";
import { siteLayout } from "./site_dressing.js";
import { skyPixels, prefilterInto } from "./sky_model.js";

/* "Is there a live 3D scene?" — a QUESTION now, not a load-time constant.
   It used to be `typeof THREE !== "undefined"`, i.e. always true, evaluated the
   moment the module was parsed. three is late-bound (js/three_lazy.js), so
   there is no honest synchronous answer at import time: the truthful one is
   "not yet". `ready3D` starts false, flips once init3D() has actually built the
   scene, and every guard below reads it — so a call that arrives before the
   renderer exists no-ops exactly as it did on a machine without WebGL. */
var ready3D = false;
let plannerRenderHook = null;
let pendingOrbitCamera = null;
let pendingNavigationView = null;
export function setPlannerRenderHook(fn) { plannerRenderHook = fn; }
export function plannerPlanePoint3D(cx,cy,origin,normal) {
  if(!ready3D||!camera||extTick)return null;
  const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(normal.x,normal.y,normal.z),new THREE.Vector3(origin.x,origin.y,origin.z));
  const p=pointerRay(cx,cy).ray.intersectPlane(plane,new THREE.Vector3());
  return p?{x:p.x,y:p.y,z:p.z}:null;
}
/* The planner (planner_3d.js) owns editing in its 3D pane and decides itself
   which touches are edits; it turns this off so a finger it leaves to
   navigation is never grabbed by the older edit-mode piece drag. */
var legacyTouchEdit = true;
export function setLegacyTouchEdit(on) {
  legacyTouchEdit = !!on;
}
export function plannerPointer3D(cx,cy) {
  if (!ready3D || !camera || extTick) return null;
  const r=renderer.domElement.getBoundingClientRect();
  const ray=pointerRay(cx,cy);
  let point=rayAtHeight(cx,cy,0), hit=null;
  if (!['wall','arcwall','rect','roomstamp','slabvoid'].includes(S.tool)) {
    for(const rank of [0,1]) {
      for(const h of ray.intersectObjects(pickableRoots(rank),true)) {
        if(cutAway(h.object))continue;
        const target=targetOf(h.object);
        if(!target)continue;
        hit={...target,rank,point:{x:h.point.x,y:h.point.y,z:h.point.z}};
        point={x:h.point.x,z:h.point.z};break;
      }
      if(hit)break;
    }
  }
  // A wall mesh is picked on its face, but planner hosts are measured along
  // their centreline. Preserve the physical hit separately for elevations.
  if(hit?.kind==='wall' && S.tool!=='point') {
    const projected=projectToWall(hit.ref,point.x,point.z,S.nodes);
    if(projected)point={x:projected.x,z:projected.z};
    if(S.tool==='select') {
      let nearest=12;
      for(const index of [hit.ref.a,hit.ref.b]) {
        const node=S.nodes[index];if(!node)continue;
        for(const height of [0,hit.point.y]) {
          const q=new THREE.Vector3(node.x,height,node.z).project(camera);
          if(q.z < -1 || q.z > 1)continue;
          const pixels=Math.hypot(r.left+(q.x+1)*r.width/2-cx,r.top+(1-q.y)*r.height/2-cy);
          if(pixels<nearest){nearest=pixels;point={x:node.x,z:node.z};}
        }
      }
    }
  }
  if(!point)return null;
  const distance=Math.max(1,camera.position.distanceTo(new THREE.Vector3(point.x,hit?.point.y||0,point.z)));
  const scale=r.height/(2*Math.tan(camera.fov*Math.PI/360)*distance);
  return {point,hit,scale,width:r.width,height:r.height};
}

export function has3D() {
  return ready3D;
}
/* Non-null while init3D() is in flight, so a second caller joins the first
   instead of building a second renderer on the same canvas. */
var init3DPromise = null;

var scene, renderer, camera, dyn, sun, hemi, stars, selectionOutline;
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

/* A second renderer drawing the planner scene (the inspector preview) needs
   the same light classes: the room-bounce light, and the masks that stop
   unshadowed lights and the sky at walls and ceilings. */
export function registerPlannerLights(r) {
  if (!roomBounce || !r) return false;
  roomBounce.register(r);
  return true;
}
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
  // no fill light: a directional fill shone through every wall and ceiling
  return { sun: sun, hemi: hemi, fill: null, stars: stars, sky: skyDome };
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
var regionShadowT = 0; // timestamp of the last drag-region shadow redraw
var shadowsFromRebuild = false, rebuildShadowT = 0; // a wall drag rebuilds every frame
var lastRebuildT = -1e9; // when the last full rebuild ran (see the compile below it)
var firstCompiled = false, compileGate = false; // the first draw waits a frame for #v3dPrep to paint
var prepUntilDrawn = false; // #v3dPrep comes down after the first draw
var qualityPreset = "auto";
var gameRendererLock = false;
var drawingOverlay = null, drawingEnabled = false, drawingCanvas = null;
// The drawing reads as a floor-plan sheet: structure and its dimensions. The
// furniture layer is opt-in (setDrawingFurniture) so the default stays clean.
var drawingFurniture = false, drawingWalls = [];
export function setDrawingFurniture(on) {
  drawingFurniture = !!on;
  requestRender();
  return drawingFurniture;
}
/* Overlay preferences the on-screen panel edits: how strongly dimension ink
   that stands behind a wall still shows (0 hides it), whether hovering a
   piece, opening or wall sketches it with its own dimensions, and how strong
   that hover sketch is. */
var drawingPrefs = { hiddenOpacity: 0.25, hover: true, hoverOpacity: 0.9 };
var drawingHoverObj = null, drawingHoverXY = null, drawingHoverQueued = false;
export function setDrawingOptions(next) {
  if (!next) return getDrawingOptions();
  if (Number.isFinite(next.hiddenOpacity)) drawingPrefs.hiddenOpacity = Math.min(1, Math.max(0, next.hiddenOpacity));
  if (Number.isFinite(next.hoverOpacity)) drawingPrefs.hoverOpacity = Math.min(1, Math.max(0, next.hoverOpacity));
  if (typeof next.hover === "boolean") drawingPrefs.hover = next.hover;
  if (!drawingPrefs.hover) drawingHoverObj = null;
  requestRender();
  return getDrawingOptions();
}
export function getDrawingOptions() {
  return Object.assign({}, drawingPrefs);
}
// The tagged ancestor a hover names: a piece, an opening, or a wall.
function drawingHoverTarget(cx, cy) {
  if (!dyn) return null;
  var ray = pointerRay(cx, cy);
  var roots = [itemsRoot, structureRoot].filter(function (r) { return r && r.visible; });
  var hits = ray.intersectObjects(roots, true);
  for (var i = 0; i < hits.length; i++) {
    var o = hits[i].object;
    if (!o.visible || o.type === "Sprite" || !o.isMesh) continue;
    if (cutAway(o)) continue;
    var mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some(function (m) { return m && m.visible && (!m.transparent || m.opacity >= 0.5); })) continue;
    for (var t = o; t; t = t.parent) {
      if (t.userData && (t.userData.item || t.userData.opening || t.userData.wall)) return t;
    }
    return null; // a floor, roof or slab: nothing to measure, and it hides what is behind
  }
  return null;
}
function drawingHoverAt(cx, cy) {
  drawingHoverXY = cx == null ? null : { x: cx, y: cy };
  if (drawingHoverQueued) return;
  drawingHoverQueued = true;
  requestAnimationFrame(function () {
    drawingHoverQueued = false;
    var next = drawingEnabled && drawingPrefs.hover && drawingHoverXY && !walk && !extTick
      ? drawingHoverTarget(drawingHoverXY.x, drawingHoverXY.y) : null;
    if (next !== drawingHoverObj) { drawingHoverObj = next; requestRender(); }
  });
}
export function toggleDrawing3D() {
  drawingEnabled = !drawingEnabled;
  drawingHoverObj = null;
  if (!drawingEnabled && drawingOverlay) {
    drawingOverlay.dispose();
    drawingOverlay = null;
    if (drawingCanvas) { drawingCanvas.remove(); drawingCanvas = null; }
  }
  requestRender();
  return drawingEnabled;
}
var gameEffectFactory = null, gameEffect = null;
export function setGameRenderEffect(factory) {
  if (factory === gameEffectFactory) return;
  if (gameEffect) gameEffect.dispose();
  gameEffect = null;
  gameEffectFactory = factory;
}
/* WebGPURenderer ignores the autoUpdate / needsUpdate switches on renderer.shadowMap — those
   were WebGLRenderer's. Its ShadowNode reads each LIGHT's shadow.autoUpdate
   (default true), so left alone every shadow map, the 4096² sun plus a
   six-face cube per shadowed room light at night, re-rendered on every orbit
   frame and the shadow passes were most of the frame. The on-demand policy is
   applied per light instead: `now` redraws every shadow this frame, otherwise
   a map is kept unless it has never been drawn (a light that starts casting,
   or comes into view, between requests would otherwise show an empty map). */
var drawnShadows = new WeakSet();
function lightShown(o) {
  for (var a = o; a; a = a.parent) if (!a.visible) return false;
  return o.layers.test(camera.layers);
}
/* `box`: the region an item drag changed. Only the lights that can reach it
   redraw — a sofa moved in the lounge does not re-render the bedroom lamp's
   six-face cube. The sun reaches everything. */
/* ---- a rebuild keeps the shaders it already has ----
   three caches each built node shader (keyed by material and geometry
   layout) only while a live material uses it, and frees it with the last
   one. A rebuild disposed every old wall, floor and trim material BEFORE the
   new, identical ones were drawn, so each rebuild threw the whole cache away
   and the next frame built every shader graph again: ~140 ms of every wall
   drag, editor tweak or undo, where the rebuild itself is ~15 ms. The old
   subtree is now detached at once (nothing draws or picks it) and disposed
   only after the new scene has been painted, by which time every shader it
   shares with the new one has been picked up again. */
var retired = [];
function retireGroup(g) {
  if (!g) return;
  var kids = g.children.slice();
  kids.forEach(function (c) { g.remove(c); });
  // rebuilds while nothing paints (the plan view) must not pile up
  while (retired.length >= 2) disposeEntry(retired.shift());
  retired.push({ kids: kids, frames: 2 });
}
function disposeEntry(r) {
  var holder = new THREE.Group();
  /* a pooled light (window daylight) is handed back to the new build, and
     anything else re-used is parented again by now: leave those alone */
  r.kids.forEach(function (c) { if (!c.parent && !c.isLight) holder.add(c); });
  clearGroup(holder);
}
function disposeRetired() {
  retired = retired.filter(function (r) {
    if (--r.frames > 0) return true;
    disposeEntry(r);
    return false;
  });
}
/* One planner surface material per distinct finish, kept across rebuilds.
   three caches a built node shader only while a material using it is alive,
   and a fresh node graph never matches the old one's cache key anyway (its
   nodes are new objects), so a rebuild that made the floor, wall-finish,
   lawn and roof materials afresh re-built all of their shaders — and their
   shadow-pass variants — on the next frame. A shared material's own
   dispose() does nothing, so clearGroup and every other disposal path pass
   it by; a clone (x-ray, ghosting, fades) is an ordinary material again.
   Only falling out of this memo releases one. */
var surfaceMemo = new Map(), SURFACE_MEMO_MAX = 96;
function keepShared() {}
function isSharedSurface(m) {
  return !!m && m.dispose === keepShared;
}
function surfaceMaterial(entry, o) {
  var rp = (o && o.repeat) || [1, 1];
  var tx = pbrTextures(entry);
  if (!tx) return null;
  var key = [entry.id, tx.map && tx.map.uuid, rp[0], rp[1], o && o.tint, o && o.side, o && o.envMapIntensity, o && o.antiTile].join("|");
  var hit = surfaceMemo.get(key);
  if (hit) {
    surfaceMemo.delete(key); // most recently used last
    surfaceMemo.set(key, hit);
    return hit;
  }
  var mat = pbrSurfaceMaterial(entry, o);
  if (!mat) return null;
  mat.dispose = keepShared;
  surfaceMemo.set(key, mat);
  if (surfaceMemo.size > SURFACE_MEMO_MAX) {
    var oldest = surfaceMemo.keys().next().value;
    THREE.Material.prototype.dispose.call(surfaceMemo.get(oldest));
    surfaceMemo.delete(oldest);
  }
  return mat;
}
var shadowDirtyBox = null, _lightPos = null;
function markShadowRegion(box) {
  if (!box || box.isEmpty()) return;
  if (shadowDirtyBox) shadowDirtyBox.union(box);
  else shadowDirtyBox = box.clone();
  needsRender = true;
  settle = SETTLE_FRAMES;
}
function lightReaches(o, box) {
  if (o.isDirectionalLight) return true;
  if (!_lightPos) _lightPos = new THREE.Vector3();
  o.getWorldPosition(_lightPos);
  return !o.distance || box.distanceToPoint(_lightPos) < o.distance;
}
/* `hold`: rebuilds are coming back to back (see rebuildShadowT). A map that
   has a picture already (a window light handed back to the pool and out again
   on every rebuild) keeps it until the paced redraw; only a light that has
   never drawn draws at once. */
var everDrawn = new WeakSet();
function syncShadowUpdates(now, box, hold) {
  scene.traverse(function (o) {
    if (!o.isLight || !o.castShadow || !o.shadow) return;
    var sh = o.shadow;
    var stale = !drawnShadows.has(sh) && !(hold && everDrawn.has(sh));
    var draw = now || stale || (!!box && lightReaches(o, box));
    sh.autoUpdate = draw;
    if (draw && lightShown(o)) { drawnShadows.add(sh); everDrawn.add(sh); }
  });
}
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

var plannerShadowsEnabled = true;
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
  plannerShadowsEnabled = effective !== "performance";
  renderer.shadowMap.enabled = plannerShadowsEnabled || !!S.invisibleRoof;
  if (sun) sun.shadow.mapSize.set(effective === "quality" ? 4096 : 2048, effective === "quality" ? 4096 : 2048);
  usePost = effective !== "performance" && !!post;
  // GTAO at half resolution is nearly indistinguishable at "balanced" and roughly
  // halves the AO cost; "quality" runs it 1:1.
  if (aoPass) aoPass.resolutionScale = effective === "quality" ? 1 : 0.5;
  var canvas = renderer.domElement;
  setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
  fitPracticalLights();
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
  fitPracticalLights(); // a game redraws every casting light each frame
  requestShadowUpdate();
}

export function clearGameRendererQuality() {
  setGameRenderEffect(null);
  gameRendererLock = false;
  fitPracticalLights();
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
  walkFloorPending = false,
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

let cameraBoom = 230, cameraAt = 0;
let cameraSweep = null;
function walkLook() {
  const profile=navigationProfile(S);
  EYE_H=profile.eyeHeight;
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
    // retract against physical geometry along the camera boom
    var pX = walkPos.x,
      pY = walkPos.y + 95, // torso pivot
      pZ = walkPos.z;
    var elev = 45; // lift the camera above the sightline
    var cx = pX - dx * tpDist,
      cy = pY - dy * tpDist + elev,
      cz = pZ - dz * tpDist;
    const pivot=new THREE.Vector3(pX,pY,pZ), desired=new THREE.Vector3(cx,cy,cz);
    const direction=desired.clone().sub(pivot), desiredDistance=direction.length();
    direction.normalize();
    let allowed=desiredDistance;
    if(!freeMove&&dyn){
      cameraSweep ||= createCameraSweep(THREE);
      allowed=cameraSweep.distance(layerRoots().map(e=>e.root),pivot,direction,desiredDistance,profile.cameraRadius);
    }
    const now=performance.now();
    cameraBoom=cameraRetraction(cameraBoom,allowed,desiredDistance,Math.min(.1,(now-cameraAt)/1000));cameraAt=now;
    const safe=pivot.addScaledVector(direction,cameraBoom);cx=safe.x;cy=safe.y;cz=safe.z;
    S.cameraObstructed=allowed<desiredDistance-1;
    camera.position.set(cx, cy, cz);
    camera.lookAt(pX, pY, pZ);
  } else {
    S.cameraObstructed=false;
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.lookAt(eyeX + dx * lookDist, eyeY + dy * lookDist, eyeZ + dz * lookDist);
  }
}
function moveWalk(dt) {
  if(document.documentElement.dataset.plannerViewport==='plan'||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){for(const key of Object.keys(keys))keys[key]=false;return;}
  const profile=navigationProfile(S);
  tpDist=profile.cameraDistance;
  var spd = profile.speed * Math.min(.05,Math.max(0,dt||0)),
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
  if ((mx || mz) && !walkFloorPending) {
    var l = Math.hypot(mx, mz) || 1;
    var dx = (mx / l) * spd;
    var dz = (mz / l) * spd;
    var curX = walkPos.x, curZ = walkPos.z, nx, nz;
    const next=freeMove?{x:curX+dx,y:walkPos.y,z:curZ+dz}:moveSurveyWalker(S,walkPos,dx,dz,profile,detectRooms());
    nx=next.x;nz=next.z;walkPos.y=next.y;
    walkPos.x = nx;
    walkPos.z = nz;
    const landing=freeMove?null:navigationFloorTransition(S,walkPos,profile);
    if(landing){
      walkFloorPending=true;
      switchFloorAndWait(landing.floorId).then(floor=>{
        if(floor&&walk){walkPos=landing.position;S.dirty3D=true;walkLook();}
      }).catch(error=>console.error("Walking floor transition failed",error))
        .finally(()=>{walkFloorPending=false;});
    }
    walkLook();
  } else if(walkView==='tpv')walkLook();
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
  // walking needs full-height walls; leaving walk puts the dollhouse cut back
  if (S.cutaway && S.cutaway.on) S.dirty3D = true;
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
    if(!navigationPosition(S,walkPos,navigationProfile(S),detectRooms()).clear){
      const rooms=detectRooms();let found=null;
      for(const room of rooms){for(const p of room.pts){const candidate={x:(p.x+room.cx)/2,y:0,z:(p.z+room.cz)/2};if(navigationPosition(S,candidate,navigationProfile(S),rooms).clear){found=candidate;break;}}if(found)break;}
      if(found)walkPos=found;
    }
    const support=navigationPosition(S,walkPos,navigationProfile(S),detectRooms());
    if(support.clear)walkPos.y=support.y;
    yaw = Math.PI;
    pitch = 0;
    tpDist = navigationProfile(S).cameraDistance;
    walkLook();
  } else {
    if (avatar) avatar.visible = false;
    S.walk2D = null;
    window.dispatchEvent(new Event("walk:look"));
    upd();
  }
  return walk;
}

/* MEP X-ray (see-through walls/floor/ceiling) exists to show the services
   buried in them, so it applies only while the services layer is shown: with
   the layer hidden it would just leave the floors glass over the lawn. */
function mepXray(part) {
  var x = S.mep && S.mep.xray;
  if (!x || !(isLayerVisible("mep") || isLayerGhosted("mep"))) return false;
  if (part === "walls") return typeof x === "object" ? !!x.walls : !!x;
  return typeof x === "object" && !!x[part];
}

/* ---- garden round a dollhouse (js/site_dressing.js) ----
   Paving apron, clipped hedges with gaps at the outside doors, a tree at each
   lawn corner. Only for the dollhouse view, and never over real site imagery:
   the aerial and street view ARE the surroundings. Tagged role "site" so the
   exporters can leave it out. */
var siteDressRef = null;
function houseBounds() {
  var b = null;
  S.walls.forEach(function (w) {
    var a = S.nodes[w.a], c = S.nodes[w.b], h = (w.thickness || 10) / 2;
    if (!a || !c) return;
    [a, c].forEach(function (p) {
      if (!b) b = { minx: p.x, maxx: p.x, minz: p.z, maxz: p.z };
      b.minx = Math.min(b.minx, p.x - h); b.maxx = Math.max(b.maxx, p.x + h);
      b.minz = Math.min(b.minz, p.z - h); b.maxz = Math.max(b.maxz, p.z + h);
    });
  });
  return b;
}
function buildSiteDressing(streetView) {
  siteDressRef = null;
  // applySite() hides it again under an aerial photo
  if (!isFinite(cutH()) || streetView) return;
  var hb = houseBounds();
  if (!hb) return;
  var doors = [];
  S.openings.forEach(function (o) {
    if (o.type !== "door" && o.type !== "passage") return;
    var w = wallById(o.wall), p = w && wallPointAt(w, o.s);
    if (p) doors.push({ x: p.x, z: p.z });
  });
  var lay = siteLayout(hb, doors), g = new THREE.Group();
  g.userData.role = "site";
  var pv = lay.paving,
    pm = polyMesh([{ x: pv.x0, z: pv.z0 }, { x: pv.x1, z: pv.z0 }, { x: pv.x1, z: pv.z1 }, { x: pv.x0, z: pv.z1 }],
      -1.2, 180, surfaceMaterial(materialById("floor_pavers")) ||
        new THREE.MeshStandardMaterial({ map: floorTexture("pavers"), roughness: 0.88, metalness: 0 }));
  if (pm) {
    pm.receiveShadow = true;
    pm.castShadow = false;
    pm.userData.role = "site";
    g.add(pm);
  }
  var HEDGE_C = 0x4d6b33, LEAF_C = 0x5b7a3c;
  lay.hedges.forEach(function (h) {
    var m = box(g, h.x0, h.x1, -2.5, 70, h.z0, h.z1, HEDGE_C, { rough: 0.95 });
    if (m) m.userData.role = "site";
    // a clipped hedge is not a slab: lumps along its top
    var along = h.x1 - h.x0 >= h.z1 - h.z0, len = along ? h.x1 - h.x0 : h.z1 - h.z0,
      n = Math.max(1, Math.round(len / 40)), r = Math.min(h.x1 - h.x0, h.z1 - h.z0) * 0.5;
    for (var i = 0; i < n; i++) {
      var f = (i + 0.5) / n,
        x = along ? h.x0 + len * f : (h.x0 + h.x1) / 2,
        z = along ? (h.z0 + h.z1) / 2 : h.z0 + len * f;
      var sp = sph(g, x, 64, z, r, i % 2 ? HEDGE_C : LEAF_C, { rough: 0.95 });
      if (sp) sp.userData.role = "site";
    }
  });
  var L = lay.lawn;
  [[L.x0 + 150, L.z0 + 150], [L.x1 - 150, L.z0 + 150], [L.x0 + 150, L.z1 - 150], [L.x1 - 150, L.z1 - 150]].forEach(function (c, i) {
    var t = cyl(g, c[0], 95, c[1], 12, 190, 0x5a4432, { rough: 0.9 });
    if (t) t.userData.role = "site";
    [[0, 230, 0, 95], [-45, 200, 30, 70], [40, 205, -25, 72], [10, 285, 15, 62]].forEach(function (b) {
      var s = sph(g, c[0] + b[0], b[1], c[1] + b[2], b[3] * (0.9 + 0.1 * (i % 2)), i % 2 ? 0x587a3a : 0x4e7033, { rough: 0.95 });
      if (s) s.userData.role = "site";
    });
  });
  structureRoot.add(g);
  siteDressRef = g;
}

/* ---- dollhouse cutaway (js/wall_cut.js) ----
   The effective wall cut: Infinity unless the cutaway is on. First person and
   the game modes that play inside the model need their full-height walls. */
function cutH() {
  var game = typeof document !== "undefined" && document.body &&
    /(^| )(lava-on|zombies-on|rc-playing)( |$)/.test(document.body.className);
  if (stubBuildH) return stubBuildH; // a near-wall stub is building (stubFor)
  if (buildingShadowWalls) return Infinity;
  return cutHeightFor(S.cutaway, { walk: walk, game: game });
}

/* ---- shadow-only geometry ----
   What the view takes away so you can see in (the walls above the dollhouse
   cut, the near walls in edit view, the ceilings and roof over a cut house, an
   "invisible" roof) is still part of the building, so it must still stop the
   sun. Hiding it outright let daylight pour straight down onto every floor.
   Those pieces live on in `shadowRoot` on a layer the view camera (and every
   raycast) skips but the sun's shadow camera renders, with no userData of
   their own, so selection, physics, the drawing overlay and export never see
   them. */
var SHADOW_ONLY_LAYER = 5;
var shadowRoot = null;
var buildingShadowWalls = false; // cutH() reports no cut while the full-height shadow walls build
var shadowStandIns = new WeakMap(); // wall group -> its shadow-only copy (see-through walls)
function makeShadowOnly(o) {
  o.traverse(function (n) {
    n.layers.set(SHADOW_ONLY_LAYER);
    n.userData = {};
    if (n.isMesh) n.receiveShadow = false;
  });
  return o;
}
/* A shadow-only copy sharing the source's geometry and materials. Built by
   hand rather than with clone(): clone() JSON-copies userData, which on door
   and opening groups holds live objects. */
function shadowCopy(src) {
  var out = src.isMesh ? new THREE.Mesh(src.geometry, src.material) : new THREE.Group();
  out.position.copy(src.position);
  out.quaternion.copy(src.quaternion);
  out.scale.copy(src.scale);
  if (src.isMesh) out.castShadow = src.castShadow;
  src.children.forEach(function (c) {
    if (c.visible !== false) out.add(shadowCopy(c));
  });
  return out;
}
/* Rebuild the walls a dollhouse cut lowered at their full height, into
   shadowRoot. The builders add straight to structureRoot and register door
   pivots, so both are redirected for the duration. */
function buildShadowWalls(hid) {
  var keepRoot = structureRoot, doorCount = scene.doors ? scene.doors.length : 0;
  var tmp = new THREE.Group();
  structureRoot = tmp;
  buildingShadowWalls = true;
  try {
    S.walls.forEach(function (w) {
      if (hid.walls[w.id] || !(w.height > cutH0())) return;
      buildWall(w, WALLC, null);
    });
  } finally {
    buildingShadowWalls = false;
    structureRoot = keepRoot;
    if (scene.doors) scene.doors.length = doorCount;
  }
  tmp.children.slice().forEach(function (g) { shadowRoot.add(makeShadowOnly(g)); });
}
function cutH0() {
  return cutHeightFor(S.cutaway, { walk: false, game: false });
}
function relMatrix(obj, root) {
  var m = new THREE.Matrix4();
  for (var o = obj; o && o !== root; o = o.parent) {
    o.updateMatrix();
    m.premultiply(o.matrix);
  }
  return m;
}
/* Clip every mesh under `root` (door leaves, frames, glass, mullions) to
   y <= yMax in root space. Geometry is re-expressed in root space, clipped,
   and mapped back, so a mesh under a rotated pivot cuts on the level. A mesh
   wholly above is hidden rather than emptied, so its group keeps its tags. */
function clipBelow(root, yMax) {
  var meshes = [];
  root.traverse(function (o) { if (o.isMesh && o.geometry && !o.userData.wallCap) meshes.push(o); });
  meshes.forEach(function (mesh) {
    var src = mesh.geometry, geo = src.index ? src.toNonIndexed() : src;
    var pa = geo.attributes.position;
    if (!pa) return;
    var M = relMatrix(mesh, root), inv = new THREE.Matrix4().copy(M).invert(),
      nM = new THREE.Matrix3().getNormalMatrix(M), nInv = new THREE.Matrix3().getNormalMatrix(inv);
    var v = new THREE.Vector3(), n = new THREE.Vector3(), maxY = -Infinity;
    var pos = new Float32Array(pa.count * 3), na = geo.attributes.normal,
      nrm = na ? new Float32Array(pa.count * 3) : null, ua = geo.attributes.uv;
    for (var i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(M);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      if (v.y > maxY) maxY = v.y;
      if (nrm) {
        n.fromBufferAttribute(na, i).applyMatrix3(nM).normalize();
        nrm[i * 3] = n.x; nrm[i * 3 + 1] = n.y; nrm[i * 3 + 2] = n.z;
      }
    }
    if (maxY <= yMax + 0.01) {
      if (geo !== src) geo.dispose();
      return;
    }
    var c = clipTrianglesBelowY(pos, nrm, ua ? ua.array : null, yMax);
    if (geo !== src) geo.dispose();
    if (!c.pos.length) {
      mesh.visible = false;
      return;
    }
    for (var j = 0; j < c.pos.length; j += 3) {
      v.set(c.pos[j], c.pos[j + 1], c.pos[j + 2]).applyMatrix4(inv);
      c.pos[j] = v.x; c.pos[j + 1] = v.y; c.pos[j + 2] = v.z;
      if (c.nrm) {
        n.set(c.nrm[j], c.nrm[j + 1], c.nrm[j + 2]).applyMatrix3(nInv).normalize();
        c.nrm[j] = n.x; c.nrm[j + 1] = n.y; c.nrm[j + 2] = n.z;
      }
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(c.pos, 3));
    if (c.nrm) out.setAttribute("normal", new THREE.Float32BufferAttribute(c.nrm, 3));
    else out.computeVertexNormals();
    if (c.uv) out.setAttribute("uv", new THREE.Float32BufferAttribute(c.uv, 2));
    src.dispose();
    mesh.geometry = out;
  });
}
/* The wall tops at the cut, as their own mesh in the cap colour: the crisp
   white (or black) band a presentation cutaway draws along every wall. Taken
   from the wall's OWN top faces, so mitres and opening gaps are exact. */
var CAP_COLORS = { white: 0xf6f4ef, dark: 0x2a2826 };
function addWallCaps(g, yCut) {
  var tri = [];
  g.children.forEach(function (m) {
    if (!m.isMesh || !m.userData.wallLayer || !m.geometry) return;
    var geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry,
      M = relMatrix(m, g), pa = geo.attributes.position, v = new THREE.Vector3(),
      pos = new Float32Array(pa.count * 3);
    for (var i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(M);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    if (geo !== m.geometry) geo.dispose();
    topFaceTriangles(pos, yCut).forEach(function (t) {
      for (var k = 0; k < 9; k++) tri.push(pos[t * 9 + k] + (k % 3 === 1 ? 0.08 : 0));
    });
  });
  if (!tri.length) return;
  var cg = new THREE.BufferGeometry();
  cg.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  cg.computeVertexNormals();
  var cap = (S.cutaway && S.cutaway.cap) === "dark" ? "dark" : "white";
  var mat = new THREE.MeshStandardMaterial({ color: CAP_COLORS[cap], roughness: 0.85, metalness: 0 });
  var mesh = new THREE.Mesh(cg, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.role = "wallCap";
  mesh.userData.wallCap = true;
  g.add(mesh);
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
  structureRoot.add(g);
  var T = wallThickness(w, S),
    Hfull = w.height,
    // the dollhouse cut, when it is lower than the wall (see cutH)
    H = Math.min(Hfull, cutH()),
    L = gm.L;
  // what the drawing overlay's hover measures: the wall's own run and
  // height, not the mesh box, which carries the mitred corner overlaps
  g.userData.drawExtent = { x0: 0, x1: L, y0: 0, y1: H };

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
        isDouble: !!o.isDouble,
        leafA: o.leafA,
        leafB: o.leafB,
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
  var wallCuts = [], wallHoles = [], wallSills = [], skirtCuts = [], skirtHoles = [];
  ops.forEach(function (o) {
    var widthOffset = frameSpec(o).jamb;
    var l = Math.max(startCursor, Math.min(endCursor, o.s - o.width / 2 - widthOffset)),
      r = Math.max(startCursor, Math.min(endCursor, o.s + o.width / 2 + widthOffset));
    if (l >= r) return;

    var y0 = o.sill || 0;
    var y1 = y0 + o.height;
    var cutY0 = y0 <= 0 ? -2.5 : y0; // Cut all the way through the base
    if (y1 > H) y1 = H;
    var how = classifyOpeningCut(cutY0, y1, H, -2.5);
    if (how === "cut") wallCuts.push({ l: l, r: r });
    else if (how === "notch") {
      // a window reaching the cut: split the wall, keep the block under it
      wallCuts.push({ l: l, r: r });
      wallSills.push({ l: l, r: r, y1: cutY0 });
    } else if (how === "hole") wallHoles.push({ l: l, r: r, y0: cutY0, y1: y1 });

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
    var sills = wallSills.map(function (sl) {
      var a = Math.max(sl.l, x0), b = Math.min(sl.r, x1);
      return b - a > 0.2 ? rectShape(a, b, -2.5, sl.y1) : null;
    }).filter(Boolean);
    return sills.concat(splitSegs(x0, x1, wallCuts).map(function (sg) {
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
    }));
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
    var xray = mepXray("walls");
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
      // A library material ("mat:<id>") becomes a PBR node material once its
      // bitmaps are in; until then (or offline) its old procedural preset.
      var bandTex = tex;
      var wallPbr = !isGlass && pbrEntryFor(bandTex);
      if (wallPbr) {
        var pbrScale = w.texScale || wallPbr.sizeCm;
        var pbrMat = surfaceMaterial(wallPbr, { repeat: [1 / pbrScale, 1 / pbrScale] });
        if (pbrMat) {
          mat = pbrMat;
          bandTex = null;
        } else bandTex = legacyTextureUrl(wallPbr);
      }
      if (bandTex) {
        if (!S.customTexCache) S.customTexCache = {};
        if (!S.customTexCache[bandTex]) {
          var tx = new THREE.TextureLoader().load(bandTex, function() { S.dirty3D = true; S.repaint3D = true; });
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.colorSpace = THREE.SRGBColorSpace;
          S.customTexCache[bandTex] = tx;
        }
        var scale = w.texScale || 200;
        if (S.customTexCache[bandTex].image) {
          mat.map = sharedRepeat(S.customTexCache[bandTex], 1 / scale, 1 / scale); // one upload per repeat
          mat.color.setHex(0xffffff);
        }
        var bUrl = getTexturePresetBumpUrl(bandTex);
        if (bUrl) {
          if (!S.customBumpCache) S.customBumpCache = {};
          if (!S.customBumpCache[bUrl]) {
            var btx = new THREE.TextureLoader().load(bUrl, function() { S.dirty3D = true; S.repaint3D = true; });
            btx.wrapS = btx.wrapT = THREE.RepeatWrapping;
            S.customBumpCache[bUrl] = btx;
          }
          if (S.customBumpCache[bUrl].image) {
            mat.bumpMap = sharedRepeat(S.customBumpCache[bUrl], 1 / scale, 1 / scale);
            mat.bumpScale = w.texBump != null ? w.texBump : 0.20;
          }
        }
      }
      if (xray) {
        if (isSharedSurface(mat)) mat = mat.clone(); // never change a shared surface
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

    addWallFraming(structureRoot, w, xray);

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
        } else if (o.isDouble) {
          doorPivot.userData.type = "double";
          var pairDir = o.swingDir || "R_IN";
          var pairInward = pairDir.endsWith("IN");
          var pairSign = pairInward ? 1 : -1;
          var pairWidth = r - l - 2 * jamb;
          var leafA = Math.max(1, Math.min(pairWidth - 1, +(o.leafA || pairWidth / 2)));
          var leafB = pairWidth - leafA;
          var pairZ0 = pairInward ? -2 : 0;
          var pairZ1 = pairInward ? 0 : 2;
          var leftLeaf = new THREE.Group();
          leftLeaf.position.set(l + jamb, 0, 0);
          leftLeaf.userData.maxOpen = pairSign * Math.PI / 2;
          box(leftLeaf, 0, leafA, 1, o.height - head, pairZ0, pairZ1, WOOD, { rough: 0.6 });
          box(leftLeaf, leafA - 4, leafA - 1, o.height * 0.5 - 6, o.height * 0.5 + 6, pairZ1, pairZ1 + 0.4, HANDLE, { metal: 0.7, rough: 0.3 });
          var rightLeaf = new THREE.Group();
          rightLeaf.position.set(r - jamb, 0, 0);
          rightLeaf.userData.maxOpen = -pairSign * Math.PI / 2;
          box(rightLeaf, -leafB, 0, 1, o.height - head, pairZ0, pairZ1, WOOD, { rough: 0.6 });
          box(rightLeaf, -leafB + 1, -leafB + 4, o.height * 0.5 - 6, o.height * 0.5 + 6, pairZ1, pairZ1 + 0.4, HANDLE, { metal: 0.7, rough: 0.3 });
          doorPivot.add(leftLeaf, rightLeaf);
          doorPivot.userData.leaves = [leftLeaf, rightLeaf];
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
        doorPivot.userData.opening=o.src;doorPivot.userData.open=o.src?.open===true;
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
  if (H < Hfull) {
    clipBelow(g, H);
    addWallCaps(g, H);
    g.userData.drawExtent.y1 = H;
  }
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
    if (String(o.wall) === String(w.id) && s > o.s - o.width / 2 + 0.001 && s < o.s + o.width / 2 - 0.001) return o;
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
    pivot.userData = { opening:o, isDoor: true, open: o.open===true, type: o.isDouble ? "double" : "swing", width: o.width, maxOpen: left ? Math.PI / 2 : -Math.PI / 2 };
    if (o.isDouble) {
      var usable = o.width - 2 * jamb;
      var aWidth = Math.max(1, Math.min(usable - 1, +(o.leafA || usable / 2)));
      var bWidth = usable - aWidth;
      var inward = String(o.swingDir || "R_IN").endsWith("IN");
      var sign = inward ? 1 : -1;
      var lp = new THREE.Group(), rp = new THREE.Group();
      lp.position.x = -half + jamb;
      rp.position.x = half - jamb;
      lp.userData.maxOpen = sign * Math.PI / 2;
      rp.userData.maxOpen = -sign * Math.PI / 2;
      localBox(lp, 0, aWidth, 1, Math.max(2, top - FR.head), 2, o.color ? parseInt(o.color.slice(1), 16) : WOOD, { rough: 0.6 });
      localBox(rp, -bWidth, 0, 1, Math.max(2, top - FR.head), 2, o.color ? parseInt(o.color.slice(1), 16) : WOOD, { rough: 0.6 });
      pivot.add(lp, rp);
      pivot.userData.leaves = [lp, rp];
    } else {
      pivot.position.x = left ? -half + jamb : half - jamb;
      localBox(pivot, left ? 0 : -o.width + 2 * jamb, left ? o.width - 2 * jamb : 0, 1, Math.max(2, top - FR.head), 2, o.color ? parseInt(o.color.slice(1), 16) : WOOD, { rough: 0.6 });
    }
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
  structureRoot.add(group);
  var renderWall = Object.assign({}, w);
  var Hc = cutH(), cutting = Hc < renderWall.height;
  if (cutting) renderWall.height = Hc;
  if (kind === "half" && renderWall.halfHeight == null && renderWall.capHeight == null) renderWall.halfHeight = Math.min(renderWall.height, HALF_WALL_HEIGHT);
  if (kind === "railing" && renderWall.railingHeight == null && renderWall.railHeight == null) renderWall.railingHeight = Math.min(renderWall.height, 100);
  var segments = splitVerticalForJoins(renderWall, verticalSegments(renderWall, function (id) { return wallTypeById(S, id); }));
  var xray = mepXray("walls");
  segments.forEach(function (vertical) {
    if (vertical.solid) addSampledSolid(group, renderWall, gm, vertical, col, xray);
    else addSampledRailing(group, renderWall, gm, vertical, col, xray);
  });
  addWallFraming(group, renderWall, xray);
  S.openings.filter(function (o) { return String(o.wall) === String(w.id); }).forEach(function (o) { addSampledOpening(group, renderWall, o); });
  if (cutting) {
    clipBelow(group, Hc);
    addWallCaps(group, Hc); // curved and profiled walls get their cut tops too
  }
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
  /* Ceiling fittings would float in the sky over a cut house, and wall-hung
     pieces (art, mirrors, upper cabinets, a hood) would stick up out of the
     cut wall they hang on: both hide while the cutaway is on. Anything that
     stands on the floor stays whole, however tall — a wardrobe rising past
     the cut is how a dollhouse render shows it. */
  var hc = cutH(), hideForCut = false;
  if (isFinite(hc)) {
    var vs = null;
    try { vs = itemVSpan(it); } catch (e) { vs = null; }
    hideForCut = !!(vs && (vs.lo >= hc - 1 || (vs.lo > 60 && vs.hi > hc + 2)));
  }
  // only ever undo a hide this rule made; other code owns other hides
  if (hideForCut) {
    g.visible = false;
    g.userData.cutHid = true;
  } else if (g.userData.cutHid) {
    g.visible = true;
    g.userData.cutHid = false;
  }
}

/* ---- light identity ---------------------------------------------------------
   three keys every lit shader on the scene's light OBJECTS: LightsNode hashes
   each light's id and sorts the lights by it. A light rebuilt as a new object
   therefore changes the key of every lit material in the house, and each one
   regenerates its node graph. When the fresh ids also reorder the spot/point
   sequence, the shader text changes and every one of them recompiles: ~16
   programs of ~100 KB with 18 lights, 1-3 s apiece on the WebGL2 fallback.
   Window daylight is rebuilt on every rebuild3D and outlived the cached lamps,
   so the second rebuild after a load always flipped the order and paid that
   in full (twice just for opening the cabinet designer).

   So both kinds take their light from here: a light of the same type that a
   previous build let go, lowest id first. An unchanged house gets back exactly
   the light set it had, and nothing recompiles. A released light keeps its
   shadow map, so lamps rebuilt at night stop leaking one cube target each. */
var spareLights = { PointLight: [], SpotLight: [] };
var windowLights = []; // the daylight lights of the last rebuild3D
var roomBounce = null; // the one light carrying each room's bounce, see fitBounceLights

function takeLight(type, color, intensity, distance, decay, angle, penumbra) {
  var spare = spareLights[type], l;
  if (spare.length) {
    spare.sort(function (a, b) { return a.id - b.id; });
    l = spare.shift();
  } else l = type === "SpotLight" ? new THREE.SpotLight() : new THREE.PointLight();
  l.color.set(color);
  l.intensity = intensity;
  l.distance = distance;
  l.decay = decay;
  if (l.isSpotLight) {
    l.angle = angle;
    l.penumbra = penumbra;
    l.target = new THREE.Object3D();
  }
  l.position.set(0, 0, 0);
  l.visible = true;
  l.castShadow = false; // fitPracticalLights sets the shadow up again if it casts
  l.userData = { pooledLight: true };
  return l;
}

function releaseLight(l) {
  if (l.parent) l.parent.remove(l);
  drawnShadows.delete(l.shadow); // a reused caster draws its new surroundings
  spareLights[l.isSpotLight ? "SpotLight" : "PointLight"].push(l);
}

function releaseItemLights(g) {
  var lights = [];
  g.traverse(function (o) { if (o.isLight && o.userData.pooledLight) lights.push(o); });
  lights.forEach(releaseLight);
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
          pl = takeLight(
            "SpotLight",
            col,
            base * (0.45 + 1.9 * S.artK),
            L.dist || 500,
            2,
            ((it.cone != null ? it.cone : 45) * Math.PI) / 180,
            0.5
          );
          var pitch = (it.pitch != null ? it.pitch : 0) * Math.PI / 180;
          var tObj = new THREE.Object3D();
          tObj.position.set(0, ly - 100 * Math.cos(pitch), 100 * Math.sin(pitch));
          g.add(tObj);
          pl.target = tObj;
        } else {
          pl = takeLight("PointLight", col, base * (0.45 + 1.9 * S.artK), L.dist || 500, 2);
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

/* ---- layer roots -----------------------------------------------------------
   itemsRoot above exists for the item cache, but its shape — one named subtree
   holding everything of one kind — is also exactly what a work-set layer needs.
   Give it two siblings on the same pattern and "raycast only the furniture"
   becomes a list of Object3Ds rather than a per-hit filter.

     dyn
      ├─ ground plane, per-window daylight PointLights   (not layer-governed)
      ├─ structureRoot   walls, their framing and openings, room floors,
      │                  ceilings, passage bridges, slab-void curbs
      ├─ itemsRoot       furniture (survives clearGroup — see above)
      └─ mepRoot         conduits and device markers from buildMEP3D

   The ground plane and the site overlay stay OUT of all three: they are not
   selectable in the planner, so putting them on a layer would only give the
   user a switch that hides the floor they are standing on.

   Unlike itemsRoot these two are rebuilt from scratch on every rebuild3D, so
   they are plain children of `dyn` and clearGroup disposes them with the rest.
   The extra level of nesting is invisible outside this file: every consumer of
   getDynGroup() — zombies_game, zombies_world, lava_world, inspector_preview —
   reaches the scene through Object3D.traverse or a recursive raycast, and both
   descend as far as there is anything to descend into. The two places in HERE
   that walked `dyn.children` one level deep are the exception, and both are
   flattened over the new roots explicitly (initPhysicsForScene,
   updateSeeThrough). */
var structureRoot = null,
  mepRoot = null;

/* Which layer id each root answers to. Kept as a function rather than a table
   because the roots are re-created on every rebuild and a captured reference
   would go stale after the first one. */
function layerRoots() {
  return [
    { id: "structure", root: structureRoot },
    { id: "furniture", root: itemsRoot },
    { id: "mep", root: mepRoot },
  ];
}

/* The roots a planner ray may touch at exactly this rank — 0 for the work set,
   1 for everything else the user can currently see. Rank Infinity (ghosted or
   hidden) is never returned by either call, and that exclusion has to happen
   HERE rather than through `root.visible`: THREE.Raycaster does not test
   `visible` at all — `intersect()` in vendor/three/three.core.js checks only
   `object.layers` before calling `raycast`, then recurses into every child
   regardless — which is why the hit loops below filter `h.object.visible` by
   hand, and why an invisible root would otherwise still return hits. */
function pickableRoots(rank) {
  var out = [];
  layerRoots().forEach(function (e) {
    if (e.root && layerRank(e.id) === rank) out.push(e.root);
  });
  return out;
}

/* Ghosting is a MATERIAL change, and the materials under these roots are
   shared: fmatFor caches one floor material per texture across every room, and
   the furniture catalogue deliberately shares them between pieces (see
   selected3DBox). Setting `opacity` on what a mesh happens to be pointing at
   would therefore turn a ghosted wall into a ghosted sofa, permanently — the
   original value is gone. So each mesh gets its own clone while it is ghosted
   and the untouched original is parked on userData; un-ghosting puts it back
   and disposes the clone, which is the only thing that keeps a user toggling
   the ghost switch from leaking a material set per toggle.

   0.35 rather than something fainter: below about a third the wall stops
   reading as a surface with a position and starts reading as a smudge, which
   defeats the purpose of leaving it on screen at all. */
var GHOST_OPACITY = 0.35;
function ghostSwap(root, on) {
  if (!root) return;
  root.traverse(function (o) {
    if (!o.material) return;
    var base = o.userData.ghostBase;
    if (on) {
      if (base) return; // already ghosted — never clone a clone
      o.userData.ghostBase = o.material;
      var ghosts = [].concat(o.material).map(function (m) {
        var c = m.clone();
        c.transparent = true;
        c.opacity = Math.min(c.opacity, GHOST_OPACITY);
        // a ghost that writes depth hides whatever it is meant to be revealing
        c.depthWrite = false;
        return c;
      });
      o.material = Array.isArray(o.userData.ghostBase) ? ghosts : ghosts[0];
    } else {
      if (!base) return;
      [].concat(o.material).forEach(function (m) {
        m.dispose();
      });
      o.material = base;
      delete o.userData.ghostBase;
    }
  });
}

/* The same swap, but remembering on the root itself which way round it already
   is. applyLayers3D() runs on every piecewise item update — the per-frame path
   a 3D drag takes — and an unconditional traverse of the whole model there
   would hand back with one hand what the layer split just saved with the
   other. `ghostHeld` makes the overwhelmingly common no-op case a flag read.

   Only ROOTS carry the flag. The one caller that works on a subtree instead
   (dropItem) reaches for ghostSwap() directly, because there is no flag to
   consult there and the traverse is a single item group wide. */
function ghostRoot(root, on) {
  if (!root) return;
  on = !!on;
  if (!!root.userData.ghostHeld === on) return;
  // a near wall mid-fade wears clones of its own: hand them back first
  if (root === structureRoot) settleSeeFades();
  ghostSwap(root, on);
  root.userData.ghostHeld = on;
}

/* Push the layer table's visibility onto the three roots. Hidden hides the
   whole subtree; ghosted still draws, faintly. Neither state is pickable —
   layerRank returns Infinity for both and pickableRoots drops the root — so
   this function only has to get the PICTURE right.

   Exported because the layer UI has to call it: nothing here polls, and the
   scene is rendered on demand. rebuild3D calls it too, since structureRoot and
   mepRoot are new objects after every rebuild and start out plain. */
export function applyLayers3D() {
  layerRoots().forEach(function (e) {
    if (!e.root) return;
    e.root.visible = isLayerVisible(e.id) || isLayerGhosted(e.id);
    ghostRoot(e.root, isLayerGhosted(e.id));
  });
  // a ghost swap hands a faded near wall's clones back: fade it again
  updateSeeThrough(true);
  // ...and un-ghosting the Furniture layer hands back a faded user layer's
  itemCache.forEach(function (c) {
    if (c.g.userData.userGhost || (c.g.userData.item && c.g.userData.item.ulayer)) syncUserGhost(c.g);
  });
  needsRender = true;
}

/* The layer UI lives in another module and this one is not on its import path,
   so the coupling runs the other way: it announces, we listen. Registered at
   module scope rather than inside init3D because the switch can be flipped
   before the 3D view has ever been opened — ready3D gates the work, and a
   scene built later picks the state up from rebuild3D's own call. */
if (typeof window !== "undefined") {
  // the Walls switch or the cut style changed; a new selection moves what
  // the cut opens towards and which wall it keeps
  ["walls3d:changed", "planner-selection"].forEach(function (type) {
    window.addEventListener(type, function () {
      if (!ready3D) return;
      updateSeeThrough();
      warmFadePipelines();
    });
  });
}
if (typeof window !== "undefined")
  window.addEventListener("layers:changed", function () {
    if (!ready3D) return;
    applyLayers3D();
    // X-ray follows the services layer (mepXray), and it is baked into the
    // wall and floor materials, so a layer switch has to rebuild them
    if (S.mep && S.mep.xray) S.dirty3D = true;
  });

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
/* The camera half of TRAA's velocity (build3D): this frame's and the last
   painted frame's unjittered view-projection. Called outside render(), where
   TRAA has already taken its sub-pixel jitter back off the projection. */
var velUniforms = null;
function syncCameraVelocity() {
  if (!velUniforms) return;
  camera.updateMatrixWorld();
  velUniforms.prevViewProj.value.copy(velUniforms.curViewProj.value);
  velUniforms.curViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  velUniforms.projInv.value.copy(camera.projectionMatrixInverse);
  velUniforms.world.value.copy(camera.matrixWorld);
  if (!velUniforms.primed) {
    velUniforms.prevViewProj.value.copy(velUniforms.curViewProj.value);
    velUniforms.primed = true;
  }
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
   image lands. Only the pieces that were built short of a bitmap
   (buildAndCache notes it): bumping catalogRev here threw away every piece
   in the house, and a texture first wanted by the walls (the dollhouse cut's
   finishes) then rebuilt all the furniture once per image that landed. */
window.addEventListener("customTextureLoaded", function () {
  itemCache.forEach(function (c) { if (c.missedTexture) c.sig = null; });
  S.dirty3D = true;
  needsRender = true;
});

function itemSig(it) {
  try {
    // Canonical definitions can change independently of their placed item.
    // Include their complete data so an explicit build request cannot retain
    // stale geometry, derived bounds or rules after a definition edit.
    return catalogRev + "|" + JSON.stringify({ item: it, definition: S.parametric?.definitions?.[it.definitionId] }, function (k, v) {
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
  // same trap as rebuild3D: while the furniture layer is ghosted every mesh
  // here points at a clone, and disposing that would strand the original
  ghostSwap(c.g, false);
  itemsRoot.remove(c.g);
  releaseItemLights(c.g);
  disposeSubtree(c.g);
  itemCache.delete(id);
}

// Rebuild one piece and (re)cache it. The signature is taken AFTER the build so
// that a builder which annotates its item doesn't make the entry miss forever.
function buildAndCache(it) {
  dropItem(it.id);
  var missed = textureMisses();
  var g = buildItem(it);
  if (g) itemCache.set(it.id, { g: g, sig: itemSig(it), catalogRev: catalogRev, missedTexture: textureMisses() !== missed });
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
      syncUserGhost(c.g);
      return;
    }
    var g = buildAndCache(it);
    if (g) syncUserGhost(g);
  });
  Array.from(itemCache.keys()).forEach(function (id) {
    if (!live[id]) dropItem(id);
  });
}

/* A piece on a faded user layer (js/user_layers.js) is ghosted on its own,
   with the same clone-and-park swap the Furniture layer's ghost uses. The two
   share the meshes: the layer ghost skips a mesh that is already ghosted, and
   un-ghosting the layer hands every clone back, so applyLayers3D() runs this
   again for every cached piece afterwards. */
function syncUserGhost(g) {
  var it = g && g.userData.item;
  var want = !!(it && it.ulayer && itemUserVis(it) === "ghost");
  if (want) {
    ghostSwap(g, true);
    g.userData.userGhost = true;
  } else if (g && g.userData.userGhost) {
    g.userData.userGhost = false;
    if (!(itemsRoot && itemsRoot.userData.ghostHeld)) ghostSwap(g, false);
  }
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
  var escalate = false, region = new THREE.Box3(), lampMoved = false;
  S.items3D.forEach(function (mode, id) {
    var it = byId[id],
      c = itemCache.get(id);
    // no live item, or nothing cached to update (e.g. the piece is inside a
    // hidden room) — only the full path knows what to do
    if (!it || !c) {
      escalate = true;
      return;
    }
    // where the piece was and where it lands: both shadows change
    region.union(new THREE.Box3().setFromObject(c.g));
    if (FURN[it.type] && FURN[it.type].lamp) lampMoved = true;
    if (mode === "move") placeItem(c.g, it);
    else {
      var signature = itemSig(it);
      if (signature != null && signature === c.sig) placeItem(c.g, it);
      else if (c.catalogRev === catalogRev && updateCabinetRuntimeMesh(c.g, it)) {
        placeItem(c.g, it);
        c.sig = itemSig(it);
      } else if (!buildAndCache(it)) escalate = true;
    }
    var now = itemCache.get(id);
    if (now) region.union(new THREE.Box3().setFromObject(now.g));
  });
  S.items3D.clear();
  /* A lamp carried into another room, or out of the house, takes its range
     clip and its shadow with it: left alone it kept the old room's settings
     and lit the rooms through the walls from outside. */
  if (lampMoved) fitPracticalLights();
  markShadowRegion(region);
  needsRender = true;
  /* A piece rebuilt on this path arrives with fresh, solid materials, so a
     ghosted furniture layer has to be re-applied over it. ghostRoot's flag
     already reads "ghosted", so go through ghostSwap — it skips every mesh
     that still holds a ghostBase and therefore only touches the new ones. */
  if (isLayerGhosted("furniture")) ghostSwap(itemsRoot, true);
  // physics owns item transforms while it runs, and bodies are built per
  // rebuild — hand back to the full path rather than desyncing them
  if (escalate || isPhysicsEnabled()) S.dirty3D = true;
}

// Zero opacity keeps the camera and AO pass clear. The renderer's shadow
// override uses opaque depth for these untextured, double-sided surfaces.
function plannerCeilingMaterial(xray) {
  // An opaque ceiling gets the baked paint (polyMesh uv: one unit per 160 cm).
  if (S.showCeiling && !xray) {
    var paint = surfaceMaterial(materialById("ceiling_paint"), {
      repeat: [160 / 200, 160 / 200], tint: 0xf3efe6, side: THREE.DoubleSide,
    });
    if (paint) return paint;
  }
  return new THREE.MeshStandardMaterial({
    color: 0xf3efe6, roughness: 0.96, side: THREE.DoubleSide,
    transparent: !S.showCeiling || xray,
    opacity: xray ? 0.18 : S.showCeiling ? 1 : 0,
    depthWrite: !!S.showCeiling && !xray,
  });
}

export function rebuild3D() {
  if (!ready3D) return;
  refreshRuntimePlacements(S);
  if (!gameRendererLock) renderer.shadowMap.enabled = plannerShadowsEnabled || !!S.invisibleRoof;
  // geometry is changing — the shadow map and the frame both need a redraw
  // (paced, see rebuildShadowT in the loop)
  shadowsDirty = true;
  shadowsFromRebuild = true;
  needsRender = true;
  S.items3D.clear(); // a full rebuild subsumes every queued per-item update
  clearPhysics();
  if (!itemsRoot) itemsRoot = new THREE.Group();
  /* Hand the ghosted materials back before anything is disposed. clearGroup
     disposes what it finds on `o.material`, which while ghosting is a CLONE —
     the original would survive as an orphan. Only the two roots clearGroup is
     about to take are un-ghosted: itemsRoot survives the disposal intact, and
     re-cloning every catalogue material on it once per rebuild would be pure
     churn. applyLayers3D() at the end puts the other two back. */
  settleSeeFades(); // the same goes for a near wall caught mid-fade
  ghostRoot(structureRoot, false);
  ghostRoot(mepRoot, false);
  dyn.remove(itemsRoot); // keep the furniture subtree out of the disposal below
  retireGroup(dyn); // takes the previous structureRoot and mepRoot with it
  structureRoot = new THREE.Group();
  stubRoot = new THREE.Group();
  stubRoot.userData.physicsRole = "ignore";
  stubRoot.userData.exportSkip = true;
  structureRoot.add(stubRoot);
  wallBuildArgs = {};
  mepRoot = new THREE.Group();
  shadowRoot = new THREE.Group();
  shadowRoot.userData.physicsRole = "ignore";
  shadowRoot.userData.exportSkip = true;
  shadowStandIns = new WeakMap();
  dyn.add(shadowRoot);
  /* Which layer each root IS, as data rather than as a module-local variable.
     js/blender_export.js walks `dyn` from the outside and has to know where the
     three roots end and the individual walls, slabs and pieces begin; matching
     on "a Group whose children look structural" would break the first time a
     root came back empty. */
  structureRoot.userData.layerRoot = "structure";
  itemsRoot.userData.layerRoot = "furniture";
  mepRoot.userData.layerRoot = "mep";
  dyn.add(structureRoot);
  scene.doors = [];
  var bb = contentBounds();
  var gw = bb.w + 900,
    gd = bb.d + 900,
    gt = groundTexture();
  gt.repeat.set(gw / 160, gd / 160);
  var lawn = materialById("ground_lawn");
  var gp = new THREE.Mesh(
    new THREE.PlaneGeometry(gw, gd),
    surfaceMaterial(lawn, { repeat: [gw / lawn.sizeCm, gd / lawn.sizeCm] }) ||
      new THREE.MeshStandardMaterial({ map: gt, roughness: 0.97, metalness: 0 }),
  );
  gp.rotation.x = -Math.PI / 2;
  gp.position.set(bb.cx, -2.5, bb.cz);
  gp.receiveShadow = true;
  var st = typeof S !== "undefined" && S.site ? S.site : {};
  var showSV = st.enabled && st.streetView && svBox;
  // Under-floor runs sit below this plane. A transparent room slab alone is
  // insufficient: the opaque site ground would still depth-occlude every pipe.
  gp.visible = !showSV && !mepXray("floor");
  
  gp.userData.role = "ground";
  groundPlaneRef = gp; // Save reference for toggling in applySite
  dyn.add(gp);
  buildSiteDressing(showSV);
  var rooms = detectRooms(),
    hid = hiddenSets(rooms),
    matCache = {};
  function fmatFor(t, customTex, customBump) {
    var key = customTex ? "custom_" + customTex : t;
    if (!matCache[key]) {
      // Library material first: a "mat:<id>" finish, or the baked version of
      // this floor type. Not ready yet → the procedural floor below, which a
      // finished load replaces on the rebuild it triggers.
      var floorPbr = customTex ? pbrEntryFor(customTex) : pbrEntryFor("floor:" + t);
      if (floorPbr) {
        var pbrFloor = surfaceMaterial(floorPbr, { side: THREE.DoubleSide, envMapIntensity: 0.7 });
        if (pbrFloor) {
          matCache[key] = pbrFloor;
          return pbrFloor;
        }
        if (customTex) {
          var legacyKey = legacyFloorKey(floorPbr);
          if (legacyKey) { t = legacyKey; customTex = null; }
          else customTex = legacyTextureUrl(floorPbr);
        }
      }
      // per-material sheen so polished floors reflect the environment (IBL) like a showroom
      var FLOOR_ROUGH = {
        epoxy: 0.12,
        marble: 0.18,
        marbleDark: 0.2,
        porcelain: 0.28,
        granite: 0.3,
        // oiled/matte boards: a lacquer-bright sky reflection seen from above
        // bleaches the grain out of a wood floor
        wood: 0.62,
        laminate: 0.6,
        darkwood: 0.58,
        parquet: 0.55,
        tiles: 0.25,
        terrazzo: 0.25,
        slate: 0.62,
        pebble: 0.7,
        brick: 0.8,
        deck: 0.8,
        concrete: 0.75,
        pavers: 0.85,
        balcony: 0.7,
        carpet: 0.95,
        carpetGrey: 0.95,
      };
      var mat = new THREE.MeshStandardMaterial({
        roughness: customTex ? 0.55 : FLOOR_ROUGH[t] != null ? FLOOR_ROUGH[t] : 0.65,
        metalness: 0.04,
        envMapIntensity: 0.7,
        side: THREE.DoubleSide,
      });
      var bumpScale = customBump != null ? customBump : 0.20;

      if (customTex) {
        if (!S.customTexCache) S.customTexCache = {};
        if (!S.customTexCache[customTex]) {
          var tx = new THREE.TextureLoader().load(customTex, function() { S.repaint3D = true; });
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.colorSpace = THREE.SRGBColorSpace;
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
  var xrayFloor = mepXray("floor");
  var xrayCeiling = mepXray("ceiling");
  var xrayWalls = mepXray("walls");
  if (rooms.length) {
    rooms.forEach(function (r) {
      if (roomHidden(r.key)) return;
      var t = roomFloor(r.key);
      var cTex = S.roomMeta[r.key] && S.roomMeta[r.key].floorTex;
      var cScale = S.roomMeta[r.key] && S.roomMeta[r.key].floorScale;
      var cBump = S.roomMeta[r.key] && S.roomMeta[r.key].floorBump;
      var cEntry = cTex && pbrEntryFor(cTex);
      var scaleVal = cScale ? cScale : (cEntry ? cEntry.sizeCm : cTex ? 200 : (TILE[t] || 240));
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
        // named so an export can say WHICH room's floor this is (blender_names.js)
        m.userData.role = "floor";
        m.userData.roomLabel = roomName(r.key) || "";
        m.userData.finish = t || "";
        structureRoot.add(m);
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
      var bmEntry = cTex && pbrEntryFor(cTex);
      var scaleVal = cScale ? cScale : (bmEntry ? bmEntry.sizeCm : cTex ? 200 : (TILE[ft] || 240));
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
        bm.userData.role = "floorBridge";
        bm.userData.roomLabel = (rk && roomName(rk)) || "";
        structureRoot.add(bm);
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
        jm.userData.role = "jamb";
        structureRoot.add(jm);
      });
      // Cover passage bridges as well as the enclosed rooms. Built even with
      // ceilings off (at opacity 0, like the rooms'): it still shades the floor.
      {
        var cMat = plannerCeilingMaterial(xrayCeiling);
        var cm = polyMesh(pts, jH, 160, cMat);
        if (cm) {
          cm.receiveShadow = S.showCeiling && !xrayCeiling;
          cm.castShadow = !xrayCeiling;
          cm.userData.role = S.showCeiling || xrayCeiling ? "ceiling" : "ceilingHidden";
          structureRoot.add(cm);
        }
      }
    });
    rooms.forEach(function (r) {
      if (roomHidden(r.key)) return;
      var rmat = plannerCeilingMaterial(xrayCeiling);
      /* A void cuts the FLOOR SLAB it sits on, not the ceiling above it. Only
         the active storey renders, so punching the ceiling too opened the room
         to empty sky instead of to the floor above. Floor-only is the honest
         cut until stacked storeys render together. */
      var m = polyMesh(r.pts, r.ceilH, 160, rmat);
      if (m) {
        // hidden or not, the ceiling is what keeps the noon sun off the floor
        m.castShadow = !xrayCeiling;
        m.receiveShadow = S.showCeiling && !xrayCeiling;
        /* With ceilings switched off this slab is still built, at opacity 0, so
           the room keeps a surface for rays and physics. Say so, rather than
           leaving an export to guess from the material why a ceiling it can see
           in the outliner is invisible in the viewport. */
        m.userData.role = S.showCeiling || xrayCeiling ? "ceiling" : "ceilingHidden";
        m.userData.roomLabel = roomName(r.key) || "";
        structureRoot.add(m);
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
        fm.userData.role = "floor";
        structureRoot.add(fm);
      }
    } else {
      var fbox = box(
        structureRoot,
        bb.minx - 40,
        bb.maxx + 40,
        -3,
        0,
        bb.minz - 40,
        bb.maxz + 40,
        FLOOR,
        fBoxOpt,
      );
      if (fbox) fbox.userData.role = "floor";
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
      rim.userData.role = "curb";
      structureRoot.add(rim);
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
  drawingWalls = S.walls.filter(function (w) { return !hid.walls[w.id]; });
  drawingHoverObj = null; // its meshes were just disposed
  S.walls.forEach(function (w) {
    if (hid.walls[w.id]) return;
    wallBuildArgs[w.id] = [wallColorMap[w.id] != null ? wallColorMap[w.id] : S.wallColor, w.tex];
    buildWall(w, wallBuildArgs[w.id][0], wallBuildArgs[w.id][1]);
  });
  // the walls a dollhouse cut lowered still throw their full-height shadows
  if (isFinite(cutH())) buildShadowWalls(hid);
  // an invisible roof is still built, as a shadow caster only
  if (S.roof) {
    var roofTriangles = roofMeshTriangles(S.roof), roofPositions = [];
    roofTriangles.forEach(function (triangle) { triangle.forEach(function (p) { roofPositions.push(p.x, p.y, p.z); }); });
    if (roofPositions.length) {
      var roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute("position", new THREE.Float32BufferAttribute(roofPositions, 3));
      roofGeo.computeVertexNormals();
      var roofEntry = materialById(S.roof.finish) || materialById("roof_clay_tile");
      worldUVs(roofGeo, roofEntry.sizeCm);
      var roofMesh = new THREE.Mesh(roofGeo, surfaceMaterial(roofEntry, { side: THREE.DoubleSide }) ||
        new THREE.MeshStandardMaterial({ color: 0x725b50, roughness: 0.82, side: THREE.DoubleSide }));
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      roofMesh.userData.role = "roof";
      if (S.invisibleRoof) shadowRoot.add(makeShadowOnly(roofMesh));
      else structureRoot.add(roofMesh);
    }
  }
  // daylight through each WINDOW (soft sky light at the opening, scaled by daylight)
  windowLights.forEach(releaseLight); // same lights back, same shaders (see takeLight)
  windowLights = [];
  S.openings.forEach(function (o) {
    if (o.type !== "window") return;
    if (hid.walls[o.wall]) return;
    var w = wallById(o.wall);
    if (!w) return;
    var gm = wallGeom(w);
    var s = clamp(o.s, o.width / 2, gm.L - o.width / 2),
      y = o.sill + o.height / 2;
    var winDist = Math.max(o.width, o.height) * 4 + 260;
    var wp = wallPointAt(w, s);
    // Sky light pours IN through the glass: a wide spot just inside the room
    // the window serves, aimed into it and slightly down, with its throw
    // stopped at that room (its far corner, and while it does not cast, the
    // room mask: see fitLightMasks). A point light on the wall centre line lit the
    // facade and the room behind a partition as much as the room with the
    // window, and pulled inside it burned a hotspot onto the window wall.
    var inset = (w.thickness || WALL_T) / 2 + 4, lightRoom = null, lx = wp.x, lz = wp.z, nx = 0, nz = 0;
    [1, -1].some(function (side) {
      var px = wp.x - gm.uz * inset * side, pz = wp.z + gm.ux * inset * side;
      lightRoom = roomContaining(px - gm.uz * 30 * side, pz + gm.ux * 30 * side);
      if (lightRoom) { lx = px; lz = pz; nx = -gm.uz * side; nz = gm.ux * side; }
      return !!lightRoom;
    });
    var throwCm = lightRoom ? Math.min(winDist, roomReach(lightRoom, lx, lz, y)) : winDist;
    var pl = lightRoom
      ? takeLight("SpotLight", 0xcfe2f2, legacyIntensity(0.9, winDist) * S.dayK, throwCm, 2, Math.PI * 0.44, 1)
      : takeLight("PointLight", 0xcfe2f2, legacyIntensity(0.9, winDist) * S.dayK, winDist, 2);
    windowLights.push(pl);
    pl.position.set(lx, y, lz);
    if (lightRoom) {
      pl.target.position.set(lx + nx * 200, y - 70, lz + nz * 200);
      dyn.add(pl.target);
    }
    pl.userData.baseI = legacyIntensity(0.9, winDist);
    pl.userData.win = true;
    /* Daylight is LIGHTING, not structure: it hangs off `dyn` rather than
       structureRoot so that ghosting the walls to read the plan through them
       does not also plunge the rooms into artificial-light-only gloom. */
    dyn.add(pl);
  });
  dyn.add(itemsRoot);
  syncItems(hid);
  fitPracticalLights();
  buildBounceLights(rooms);
  // MEP conduits + device markers embedded in the model. buildMEP3D takes its
  // parent, and returns early on its own m.show / m.show3D flags — those stay
  // as filters ON TOP of the mep layer, which owns the root's visibility.
  dyn.add(mepRoot);
  buildMEP3D(mepRoot, THREE);
  buildSurveyGeometry(structureRoot,THREE,S.surveyFeatures);
  if(isLayerVisible("underlay"))buildBlueprintUnderlay3D(dyn,THREE,S.blueprintTrace);

  if (isPhysicsEnabled()) {
    initPhysicsForScene();
  }
  applySite(); // reposition the aerial overlay for the new content bounds
  // a cut house has no ceiling to look down through, but its rooms are still
  // roofed against the sun: the ceilings and roof go shadow-only
  if (isFinite(cutH()))
    structureRoot.children.filter(function (o) {
      return o.userData && (o.userData.role === "ceiling" || o.userData.role === "roof");
    }).forEach(function (o) {
      if (o.castShadow) shadowRoot.add(makeShadowOnly(o));
      else o.visible = false;
    });
  // the wall groups are brand new: re-apply the cut as it stood, without a fade
  updateSeeThrough(true);
  warmFadePipelines();
  applyLayers3D(); // the roots are brand new too: re-apply hide/ghost to them
  // external modes (RC race) rebuild their collision snapshot off this event
  window.dispatchEvent(new Event("scene3d:rebuilt"));
}

/* ---- practical lights stay in their room --------------------------------
   A PointLight knows nothing about walls: unshadowed, it lights straight
   through them, so a 6.8m ceiling-light throw used to wash the bedroom next
   door as brightly as its own. Each lamp's range is clipped to the farthest
   corner of the room it hangs in — the physical falloff window is smooth, so
   the clip itself never shows — while its intensity stays calibrated to its
   own catalogue throw. A sphere that fills the corners still crosses the
   nearest wall, so a lamp that does not cast is also masked to its own room
   (fitLightMasks). At dusk and at night (when practicals carry the scene)
   the main ceiling fixture of each room also casts a soft shadow, so furniture
   sits on the floor instead of floating in flat light. Shadow maps update on
   demand only, so the cost is paid when something moves, not every frame. */
/* ---- light that bounces: the room fills itself ----
   Split-flux interreflection per room, carried by ONE light for the whole
   house (see js/room_bounce.js): the flux that enters each room through its
   windows and from its lamps, times ρ/(1−ρ), spread over the room's surfaces.
   Walls stop it exactly — the map it reads is the plan — and the light is
   always on and never casts, so refitting it never changes the light set the
   shaders are keyed on. ρ = 0.5: pale walls and a mid floor. */
var BOUNCE_RHO = 0.5;
var bounceRooms = []; // the rooms the bounce map was last drawn for
function buildBounceLights(rooms) {
  if (!roomBounce) return;
  var shown = rooms.filter(function (r) { return !roomHidden(r.key); });
  var same = shown.length === bounceRooms.length && shown.every(function (r, i) { return r === bounceRooms[i]; });
  if (!same) {
    bounceRooms = shown;
    roomBounce.setRooms(shown, WALL_H);
  }
  fitLightMasks(); // the rooms may have been renumbered
  fitBounceLights();
}
/* Which room each unshadowed light may light (see js/room_bounce.js): its
   own, numbered as the plan map numbers them. A casting light is stopped by
   its shadow map, so it keeps reaching through a doorway into the next room. */
function fitLightMasks() {
  if (!roomBounce) return;
  var rooms = roomBounce.rooms();
  // the sky's own light reaches only what is under the open sky, and the sun
  // too whenever it has no shadow map to stop it at the roof (shadows off)
  // maskRoomUnshadowed: the mask in a renderer that draws no shadow maps
  // (the inspector preview), see effectiveMaskRoom
  if (hemi) hemi.userData.maskRoom = SKY_ONLY;
  if (sun) {
    sun.userData.maskRoom = sun.castShadow && renderer && renderer.shadowMap.enabled ? UNMASKED : SKY_ONLY;
    sun.userData.maskRoomUnshadowed = SKY_ONLY;
  }
  windowLights.forEach(function (l) {
    l.userData.maskRoom = lightMaskRoom(rooms, l.position.x, l.position.z, l.castShadow);
    l.userData.maskRoomUnshadowed = lightMaskRoom(rooms, l.position.x, l.position.z, false);
  });
  if (itemsRoot) itemsRoot.children.forEach(function (g) {
    var it = g.userData && g.userData.item;
    if (!it || !FURN[it.type] || !FURN[it.type].lamp) return;
    g.traverse(function (o) {
      if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
        o.userData.maskRoom = lightMaskRoom(rooms, it.x, it.z, o.castShadow);
        o.userData.maskRoomUnshadowed = lightMaskRoom(rooms, it.x, it.z, false);
      }
    });
  });
  needsRender = true;
}
function lightFlux(l) {
  return l.isSpotLight ? spotFlux(l.intensity, l.angle, l.penumbra) : pointFlux(l.intensity);
}
function fitBounceLights() {
  if (!roomBounce) return;
  var sources = [];
  function add(x, z, l) {
    sources.push({ x: x, z: z, flux: lightFlux(l), color: [l.color.r, l.color.g, l.color.b] });
  }
  windowLights.forEach(function (l) { if (l.visible && l.intensity > 0) add(l.position.x, l.position.z, l); });
  if (itemsRoot) itemsRoot.children.forEach(function (g) {
    var it = g.userData && g.userData.item;
    if (!it || !FURN[it.type] || !FURN[it.type].lamp) return;
    g.traverse(function (o) { if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null && o.visible) add(it.x, it.z, o); });
  });
  roomBounce.setIrradiance(roomIrradiance(bounceRooms, sources, BOUNCE_RHO, WALL_H));
  needsRender = true;
}
function roomContaining(x, z) {
  var rooms = detectRooms();
  for (var i = 0; i < rooms.length; i++) if (pointInPoly(x, z, rooms[i].pts)) return rooms[i];
  return null;
}
function roomReach(room, x, z, y) {
  var far = 0;
  room.pts.forEach(function (p) { far = Math.max(far, Math.hypot(p.x - x, p.z - z, y || 0)); });
  return Math.max(220, far + 40);
}
var PRACTICAL_SHADOW = { ceilingLight: 1, pendant: 1, chandelier: 1 };
/* ---- one shadow budget for every light that can cast ----
   Every shadow map is one more sampled texture in EVERY lit material's
   fragment stage, and WebGPU's default per-stage limit is 16; the PBR maps
   and the environment take about five, the bounce map (js/room_bounce.js)
   one more. Past it every pipeline in the house
   fails at once (a big flat at night used to ask for a cube per room), and
   each map is also five more depth taps in every pixel. So the lights that
   cast are chosen here, in order of what it costs the picture to go without:
     1. a lamp OUTSIDE every room whose throw reaches the house: with a
        shadow it lights the rooms through their windows. Over budget its
        mask keeps it outside them (see fitLightMasks), facade glow intact.
     2. at dusk and at night, the main ceiling fixture of each room (largest
        rooms first), so furniture sits on the floor in lamplight;
     3. by day, the brightest windows' daylight (the sky seen through the
        glass), so furniture throws its shadow away from the window. They
        hand over to the practicals at dusk rather than adding to them.
   The sun takes one slot by day. A light whose map is stale after this
   (it starts casting, or its range moved) is redrawn on its own; nothing
   here invalidates the other maps. */
var MAX_SHADOW_MAPS = 8;
function distToRooms(x, z) {
  var best = Infinity;
  detectRooms().forEach(function (r) {
    var n = r.pts.length;
    for (var i = 0; i < n; i++) {
      var p = r.pts[i], q = r.pts[(i + 1) % n], dx = q.x - p.x, dz = q.z - p.z;
      var t = clamp(((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      best = Math.min(best, Math.hypot(x - p.x - t * dx, z - p.z - t * dz));
    }
  });
  return best;
}
function castSetup(o, kind) {
  var sh = o.shadow;
  if (kind === "window") {
    // a pooled light keeps the map it already has (see takeLight)
    if (!sh.map) sh.mapSize.set(512, 512);
    sh.radius = 4; // the sky through a window is a big source
    sh.bias = -0.0006;
    sh.normalBias = 3;
    sh.camera.near = 12; // clears the window's own frame and sill trim
  } else {
    if (!sh.map) sh.mapSize.set(512, 512);
    sh.camera.near = 4;
    sh.bias = -0.002;
    sh.normalBias = 2.5;
    sh.radius = 5;
  }
  var far = Math.max(60, o.distance);
  if (sh.camera.far !== far) {
    sh.camera.far = far;
    if (sh.camera.updateProjectionMatrix) sh.camera.updateProjectionMatrix();
    drawnShadows.delete(sh);
  }
}
function fitPracticalLights() {
  if (!itemsRoot) return;
  var allowed = plannerShadowsEnabled && !gameRendererLock && !!renderer && renderer.shadowMap.enabled;
  var night = (S.artK || 0) > 0.5;
  var want = [], shadowRooms = {};
  itemsRoot.children.forEach(function (g) {
    var it = g.userData && g.userData.item;
    if (!it || !FURN[it.type] || !FURN[it.type].lamp) return;
    var room = roomContaining(it.x, it.z), gap = room ? 0 : distToRooms(it.x, it.z);
    g.traverse(function (o) {
      if (!(o.isPointLight || o.isSpotLight) || o.userData.baseI == null) return;
      if (o.userData.throwCm == null) o.userData.throwCm = o.distance;
      var y = o.position.y + elevOffset(it);
      o.distance = room ? Math.min(o.userData.throwCm, roomReach(room, it.x, it.z, y)) : o.userData.throwCm;
      if (!room && gap < o.distance) {
        // the room outlines run down the wall centre lines
        want.push({ l: o, kind: "lamp", rank: 0, size: 0 });
      } else if (room && night && o.isPointLight && PRACTICAL_SHADOW[it.type] && !shadowRooms[room.key]) {
        shadowRooms[room.key] = true;
        want.push({ l: o, kind: "lamp", rank: 1, size: room.area || 0 });
      }
    });
  });
  if (!night && (S.dayK || 0) > 0.02)
    windowLights.forEach(function (l) {
      if (l.isSpotLight) want.push({ l: l, kind: "window", rank: 2, size: l.userData.baseI });
    });
  want.sort(function (a, b) { return a.rank - b.rank || b.size - a.size; });
  var slots = allowed ? MAX_SHADOW_MAPS - (sun && sun.castShadow ? 1 : 0) : 0;
  var casting = new Set();
  want.slice(0, Math.max(0, slots)).forEach(function (w) { casting.add(w.l); });
  var lights = windowLights.slice();
  itemsRoot.traverse(function (o) { if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) lights.push(o); });
  lights.forEach(function (o) {
    var cast = casting.has(o);
    if (cast) castSetup(o, o.userData.win ? "window" : "lamp");
    if (o.castShadow !== cast) o.castShadow = cast;
  });
  fitLightMasks(); // whatever does not cast now stops at its room's walls
  needsRender = true;
  settle = SETTLE_FRAMES;
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
  /* One body per BUILT THING, so this wants the wall groups, floor slabs,
     conduits and furniture groups — not the three layer roots that now stand
     between `dyn` and most of them. Flatten the roots back out by one level;
     everything reachable is exactly what `dyn.children` held before the split
     (the roots' own children are still the individual groups and meshes). */
  var items = itemsRoot ? itemsRoot.children : [];
  dyn.children
    .filter(function (c) { return c !== itemsRoot && c !== structureRoot && c !== mepRoot; })
    .concat(structureRoot ? structureRoot.children : [])
    .concat(mepRoot ? mepRoot.children : [])
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
var overviewRadiusLimit = 4000;
function cR() {
  radius = Math.max(180, Math.min(overviewRadiusLimit, radius));
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
   what you cannot see. While the Walls switch (js/wall_view.js) is on Cutaway,
   the near side of the house steps out of the way in 3D edit mode (which walls
   count is nearSideWall() in js/wall_cut.js).

   - What it opens towards is the selected room or piece when one is on screen,
     else the orbit target: the cut follows what you are working on, not where
     the last pan happened to leave the camera's pivot.
   - The selected wall (or the wall of a selected door or window) never steps
     away: you cannot edit a wall that vanishes when you pick it.
   - A cut wall becomes a knee-high stub, a faint ghost, or nothing, by the
     user's choice (cutStyle), and walls fade over SEE_FADE_MS rather than pop.

   No rebuild is triggered, so this is safe to run on every camera move. */
function updateSeeThrough(instant) {
  if (!dyn || !camera || !tgt) return;
  // the dollhouse cut already opens every room; hiding whole walls on top of
  // it would take their caps away too
  var on = ((!!S.edit3D && nearCutOn()) || framedInterior) && !walk && !extTick && !isFinite(cutH());
  var changed = false;
  /* Wall groups are children of structureRoot, not of `dyn` — a one-level scan
     aimed at `dyn` would match nothing at all and the dollhouse cut would
     silently stop happening, which is the same trap the humans pass fell into
     when furniture moved under itemsRoot (see updateHumans). */
  if (!structureRoot) return;
  var cam = camera.position, aim = on ? seeAim() : tgt, keep = on ? keptWalls() : null;
  structureRoot.children.forEach(function (g) {
    var w = g.userData && g.userData.wall;
    if (!w) return;
    /* A floor switch replaces S.nodes/S.walls before rebuild3D replaces dyn.
       Compact mode can frame the interior during that one-frame handoff, so a
       stale mesh must not resolve its old node indices against the new floor.
       The live wall objects are authoritative; the old group disappears on
       the rebuild immediately afterwards. */
    if (S.walls.indexOf(w) < 0) return;
    var was = !!g.userData.seeThrough, cut = false;
    if (on && keep.indexOf(w) < 0) {
      var gm = wallGeom(w);
      if (!gm || gm.L < 1) return;
      cut = nearSideWall({ ax: gm.a.x, az: gm.a.z, ux: gm.ux, uz: gm.uz, L: gm.L, half: wallThickness(w, S) / 2 }, cam, aim, was);
    }
    if (cut === was && !seeOutOfStep(g, cut)) return;
    setSeeThrough(g, cut, instant);
    changed = true;
  });
  /* Visibility is a render input just like camera position. toggleEdit3D()
     calls this directly, outside upd(), so without this wake-up the cutaway
     did not appear until the next orbit or Frame action. */
  if (changed) needsRender = true;
}

// How far a cut wall fades: a faint ghost in the "fade" style, out otherwise.
function seeRest(cut) {
  return !cut ? 1 : cutStyle() === "fade" ? FADE_LEVEL : 0;
}
/* Does this wall's picture disagree with its state? True after the cut style
   changed, or when something else touched its visibility: a wall is re-synced
   then, not only when its cut state flips. A wall still moving is in step as
   long as it is moving towards the right place. */
function seeOutOfStep(g, cut) {
  var rest = seeRest(cut), f = g.userData.seeFade;
  if (f) return f.to !== rest;
  var stub = g.userData.seeStub;
  if ((cut && cutStyle() === "stub") !== !!(stub && stub.visible)) return true;
  return rest === 1 ? !g.visible : rest === 0 ? g.visible : true;
}

function setSeeThrough(g, cut, instant) {
  g.userData.seeThrough = cut;
  // the wall stepped out of the view, not out of the sunlight
  var standIn = shadowStandIns.get(g);
  if (cut && !standIn && shadowRoot) {
    standIn = makeShadowOnly(shadowCopy(g));
    shadowStandIns.set(g, standIn);
    shadowRoot.add(standIn);
  }
  if (standIn) standIn.visible = cut;
  // a wall coming back loses its stub at once; one going away gets it when it
  // lands (endSeeFade), so the two never stand in the same place
  if (!cut && g.userData.seeStub) g.userData.seeStub.visible = false;
  fadeWall(g, seeRest(cut), instant);
  if (!g.userData.seeFade) syncStub(g);
}

function syncStub(g) {
  var want = !!g.userData.seeThrough && cutStyle() === "stub";
  var stub = want ? stubFor(g) : g.userData.seeStub;
  if (stub) stub.visible = want;
}

/* The walls the cut leaves alone whatever the camera does: the one being
   edited. A selected door or window keeps its wall for the same reason. */
function keptWalls() {
  var sel = S.sel, out = [];
  if (!sel) return out;
  if (sel.kind === "wall" && sel.ref) out.push(sel.ref);
  else if (sel.kind === "walls" && sel.refs) out = sel.refs.slice();
  else if (sel.kind === "opening" && sel.ref) {
    var w = wallById(sel.ref.wall);
    if (w) out.push(w);
  }
  return out;
}

/* Where the cut opens towards: the selected room's middle or the selected
   pieces, while that point is on screen; the orbit target otherwise. */
var seeAimV = null;
function seeAim() {
  var p = selectionAim();
  if (!p) return tgt;
  if (!seeAimV) seeAimV = new THREE.Vector3();
  seeAimV.set(p.x, tgt.y, p.z).project(camera);
  if (seeAimV.z > 1 || Math.abs(seeAimV.x) > 1 || Math.abs(seeAimV.y) > 1) return tgt;
  return { x: p.x, y: tgt.y, z: p.z };
}
function selectionAim() {
  var sel = S.sel;
  if (!sel) return null;
  var pts = null;
  if (sel.kind === "room") {
    var room = roomByKey(sel.ref);
    pts = room && room.nidx && room.nidx.map(function (i) { return S.nodes[i]; });
  } else if (sel.kind === "item" && sel.ref) pts = [sel.ref];
  else if (sel.kind === "items" && sel.refs) pts = sel.refs;
  pts = (pts || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.z); });
  if (!pts.length) return null;
  var x = 0, z = 0;
  pts.forEach(function (p) { x += p.x; z += p.z; });
  return { x: x / pts.length, z: z / pts.length };
}

/* ---- the stub ----
   The knee-high wall a cut wall leaves in the "stub" style, built by the same
   wall builder the dollhouse cut uses (cutH() answers STUB_HEIGHT while it
   runs), so doors stay open gaps, windows sit above it and its top gets the
   cut cap. Built the first time a wall is cut, into stubRoot under
   structureRoot so the structure layer's hide and ghost reach it; it has no
   tags of its own, so picking, physics and export pass it by. */
var stubRoot = null,
  stubBuildH = 0,
  wallBuildArgs = {}; // wall id -> [colour, texture] it was built with
function stubFor(g) {
  if (g.userData.seeStub) return g.userData.seeStub;
  var w = g.userData.wall;
  if (!stubRoot || !w) return null;
  var keepRoot = structureRoot, doorCount = scene.doors ? scene.doors.length : 0;
  var tmp = new THREE.Group(), args = wallBuildArgs[w.id] || [S.wallColor, w.tex];
  structureRoot = tmp;
  stubBuildH = STUB_HEIGHT;
  try {
    buildWall(w, args[0], args[1]);
  } finally {
    stubBuildH = 0;
    structureRoot = keepRoot;
    if (scene.doors) scene.doors.length = doorCount;
  }
  var stub = new THREE.Group();
  tmp.children.slice().forEach(function (c) { stub.add(c); });
  stub.traverse(function (o) {
    o.userData = {};
  });
  stub.visible = false;
  // built after the structure layer was ghosted: ghost it too, as the rest are
  if (structureRoot.userData.ghostHeld) ghostSwap(stub, true);
  stubRoot.add(stub);
  g.userData.seeStub = stub;
  return stub;
}

/* ---- the movement itself ----
   Two ways for a near wall to go, both over SEE_FADE_MS:

   "sink"  — Low and Hidden. The wall slides down into the floor (to stub
             height, or all the way), the way the games that made the switch
             familiar do it. Only the group's position moves: no material is
             touched, so nothing new has to be compiled on the GPU and the
             first orbit is as smooth as the hundredth.
   "alpha" — Faded. The wall's materials are swapped for per-mesh clones
             (userData.seeBase parks the originals, the rule ghostSwap follows,
             because materials can be shared) and their opacity eases. A wall
             resting faded keeps its clones (seeHeld) until it comes back or
             settleSeeFades() hands them back before the layer ghost or a
             rebuild touches the same materials. The clones need transparent
             GPU pipelines; warmFadePipelines() builds those ahead of time. */
var SEE_FADE_MS = 180;
var seeFading = new Set(), // walls moving this frame
  seeHeld = new Set(); // every wall mid-way or resting faded
function fadeWall(g, to, instant) {
  var f = g.userData.seeFade;
  var from = f ? f.k : g.visible ? 1 : 0;
  if (!f && from === to) return;
  var mode = (to > 0 && to < 1) || (from > 0 && from < 1 && !f) || cutStyle() === "fade" ? "alpha" : "sink";
  if (f && f.mode !== mode) {
    // the style changed mid-way: land where this one was going, then move anew
    endSeeFade(g);
    f = null;
    from = g.visible ? 1 : 0;
    if (from === to) return;
  }
  if (instant || !renderer || !renderer.initialized) {
    // a brand-new wall takes its predecessor's state as it is, and nothing
    // drawn yet has a movement to watch
    if (f) {
      f.to = to > 0 ? 1 : 0;
      endSeeFade(g);
    }
    if (to === 0 || to === 1) {
      g.visible = to > 0;
      return;
    }
    f = holdSeeFade(g, to, "alpha");
    seeFading.delete(g);
    g.visible = true;
    paintSeeFade(g);
    return;
  }
  if (!f) f = holdSeeFade(g, from, mode);
  f.to = to;
  g.visible = true;
  seeFading.add(g);
  paintSeeFade(g);
}
function holdSeeFade(g, k, mode) {
  var w = g.userData.wall,
    H = (w && Number(w.height)) || 250;
  var f = (g.userData.seeFade = {
    k: k,
    to: k,
    mode: mode,
    y0: g.position.y,
    drop: Math.max(0, H - (cutStyle() === "stub" ? STUB_HEIGHT : 0)),
  });
  if (mode === "alpha") seeMaterials(g, true);
  seeHeld.add(g);
  return f;
}
function seeMaterials(g, on) {
  g.traverse(function (o) {
    if (!o.isMesh || !o.material) return;
    if (on) {
      if (o.userData.seeBase) return;
      o.userData.seeBase = o.material;
      var fades = [].concat(o.material).map(function (m) {
        var c = m.clone();
        c.userData.seeOpacity = c.transparent ? c.opacity : 1;
        c.transparent = true;
        c.depthWrite = false; // a fading wall must not hide what it is uncovering
        return c;
      });
      o.material = Array.isArray(o.userData.seeBase) ? fades : fades[0];
    } else {
      if (!o.userData.seeBase) return;
      [].concat(o.material).forEach(function (m) {
        m.dispose();
      });
      o.material = o.userData.seeBase;
      delete o.userData.seeBase;
    }
  });
}
function paintSeeFade(g) {
  var f = g.userData.seeFade,
    k = f.k,
    e = k * k * (3 - 2 * k); // smoothstep: no visible kink at either end
  if (f.mode === "sink") {
    g.position.y = f.y0 - (1 - e) * f.drop;
    return;
  }
  g.traverse(function (o) {
    if (!o.userData.seeBase) return;
    [].concat(o.material).forEach(function (m) {
      m.opacity = m.userData.seeOpacity * e;
    });
  });
}
function endSeeFade(g) {
  var f = g.userData.seeFade;
  seeFading.delete(g);
  seeHeld.delete(g);
  if (!f) return;
  if (f.mode === "alpha") seeMaterials(g, false);
  else g.position.y = f.y0;
  delete g.userData.seeFade;
  g.visible = f.to > 0;
  syncStub(g);
}
// Advance every running movement by one frame; true while any is still running.
function stepSeeFades(delta) {
  var step = delta / SEE_FADE_MS;
  Array.from(seeFading).forEach(function (g) {
    var f = g.userData.seeFade;
    if (!f) return void seeFading.delete(g);
    f.k = f.to > f.k ? Math.min(f.to, f.k + step) : Math.max(f.to, f.k - step);
    if (f.k !== f.to) paintSeeFade(g);
    else if (f.to === 0 || f.to === 1) endSeeFade(g);
    else {
      paintSeeFade(g);
      seeFading.delete(g); // resting faded: clones stay, frames stop
    }
  });
  return seeFading.size > 0;
}
/* Land every wall mid-way or resting faded: before the layer ghost swaps the
   same materials, and before a rebuild disposes them. A resting faded wall
   comes back shown; updateSeeThrough(true) puts it back afterwards. */
function settleSeeFades() {
  Array.from(seeHeld).forEach(function (g) {
    var f = g.userData.seeFade;
    if (f) f.to = f.to > 0 ? 1 : 0;
    endSeeFade(g);
  });
}

/* The first faded wall used to stall the view for seconds: every wall material
   needs a transparent variant, and the GPU compiled them all on the frame the
   fade began. While the Faded style is chosen, this builds one variant per
   kind of wall material ahead of time, asynchronously, on tiny stand-in meshes
   that stay in the scene (a pipeline lives only while something uses it). */
var warmRoot = null,
  warmKeys = new Set(),
  warmGeo = null,
  warmQueued = false;
function warmKey(m) {
  return [m.type, m.side, m.vertexColors ? 1 : 0]
    .concat(["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap"].map(function (k) {
      return m[k] ? 1 : 0;
    }))
    .join("|");
}
function warmFadePipelines() {
  if (warmQueued || cutStyle() !== "fade" || !renderer || !renderer.compileAsync || !structureRoot || !scene || !camera) return;
  warmQueued = true;
  var run = function () {
    warmQueued = false;
    if (!structureRoot || !scene) return;
    if (!warmRoot) {
      warmRoot = new THREE.Group();
      warmRoot.name = "fade pipeline warm-up";
      warmRoot.userData.physicsRole = "ignore";
      warmRoot.userData.exportSkip = true;
      warmGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    }
    var fresh = [];
    structureRoot.traverse(function (o) {
      if (!o.isMesh || !o.material || o.userData.seeBase) return;
      [].concat(o.material).forEach(function (m) {
        if (!m || m.transparent) return;
        var key = warmKey(m);
        if (warmKeys.has(key)) return;
        warmKeys.add(key);
        var c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        c.opacity = 0.001;
        var mesh = new THREE.Mesh(warmGeo, c);
        mesh.frustumCulled = false;
        mesh.castShadow = mesh.receiveShadow = false;
        mesh.position.copy(tgt);
        mesh.raycast = function () {};
        warmRoot.add(mesh);
        fresh.push(mesh);
      });
    });
    if (!fresh.length) return;
    if (warmRoot.parent !== scene) scene.add(warmRoot);
    renderer.compileAsync(warmRoot, camera, scene).catch(function () {
      /* a failed warm-up only means the first fade compiles on the spot */
    });
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 200);
}

/* Is this hit on something the near-side cut has taken away? THREE.Raycaster
   tests neither `visible` nor an ancestor's, so a wall group that is hidden
   (or fading, or resting faded) still answers every ray with its own meshes —
   and so do the doors and windows hung in it. */
function cutAway(o) {
  for (var a = o; a; a = a.parent) if (!a.visible || (a.userData && a.userData.seeThrough)) return true;
  return false;
}

/* The presentation cutaway camera: three-quarter azimuth, steep from above,
   the whole house in frame — the view a dollhouse render is shot from. */
export function frameDollhouse() {
  if (!ready3D) return;
  var bb = contentBounds();
  framedInterior = false;
  tgt.set(bb.cx, 0, bb.cz);
  sun.target.position.set(bb.cx, 0, bb.cz);
  // a tall, narrow pane fits the house by its width: pull back to suit
  var aspect = camera && camera.aspect > 0 ? camera.aspect : 1.6;
  var distance = (Math.hypot(bb.w, bb.d) * 1.08 + 160) * Math.max(1, Math.pow(1.5 / aspect, 0.85));
  // A cover screen needs more than the normal 40 m orbit ceiling to fit an
  // entire apartment. Keep that range available when the user then zooms.
  overviewRadiusLimit = Math.max(4000, Math.min(12000, distance * 1.2));
  radius = clamp(distance, 300, overviewRadiusLimit);
  theta = 0.78;
  phi = 0.62;
  userMoved = true;
  tgtTween = null;
  upd();
}

export function frameView() {
  if (!ready3D) return;
  overviewRadiusLimit = 4000;
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
/* double-click: ease the target onto whatever is under the cursor, so the next
   orbit spins around that object rather than around the room's center.

   This is FRAMING, not selection, and it deliberately keeps rank 1. The work
   set says what you are editing; it has no opinion about where you want to
   stand. Refusing to orbit around a wall you can plainly see, because you
   happen to be furnishing, would read as the camera being broken rather than
   as a layer being respected — and there is no consolation prize here the way
   there is for a pick, because the fallback is the flat ground plane and the
   view would just sink to the floor. Rank Infinity is another matter: ghosted
   and hidden geometry is not there to be double-clicked, so pickableRoots
   leaves it out and the ground fallback takes over.

   The ground plane and the per-window lights hang off `dyn` outside all three
   roots, so they are added back explicitly — framing on bare floor is exactly
   what a double-click into empty space should do. */
function focusAt(cx, cy) {
  if (!dyn) return;
  var roots = dyn.children.filter(function (c) {
    return c !== structureRoot && c !== itemsRoot && c !== mepRoot;
  });
  var ray = pointerRay(cx, cy),
    hits = ray
      .intersectObjects(roots.concat(pickableRoots(0), pickableRoots(1)), true)
      .filter(function (h) {
        return h.object.type !== "Sprite" && !cutAway(h.object);
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
   and skipped, letting the ray carry on to whatever stands behind the wall.

   Two more things get the same treatment, and for the same reason — returning
   null lets the caller's loop walk on to the next hit instead of stopping on
   something it cannot act on:

   - a rank-Infinity item or opening. Its root is already left out of the
     raycast (pickableRoots), so this is belt and braces rather than the only
     guard; it keeps targetOf honest on its own terms, for the day a second
     caller hands it a mesh from somewhere else.
   - a LOCKED opening. The lock is per-object, not per-layer, so no root-level
     filter can see it; and a pinned window that merely refused to move would
     shadow the sideboard standing in front of it. */
function targetOf(obj) {
  for (var o = obj; o; o = o.parent) {
    if (!o.userData) continue;
    if (o.userData.item)
      return layerRank("furniture") === Infinity || itemUserUnpickable(o.userData.item)
        ? null
        : { kind: "item", ref: o.userData.item };
    if (o.userData.opening) {
      if (layerRank("structure") === Infinity || o.userData.opening.locked) return null;
      return { kind: "opening", ref: o.userData.opening };
    }
    if (o.userData.wall) return { kind: "wall", ref: o.userData.wall };
  }
  return null;
}
/* Everything the 3D edit mode can grab: pieces and openings, never walls, and
   never gated on whether the thing is the FIRST surface under the cursor — the
   ray keeps going past walls, so a sofa behind a wall drags from any angle.

   Two passes, not one, and this is the 3D half of the TV-against-the-wall bug.
   The rank-0 layers are tested alone first, so a piece of furniture wins the
   pick outright over a wall that is nearer the camera; only when every focused
   layer misses does the rank-1 pass run. Depth order still decides WITHIN a
   pass, which is why each pass is its own distance-sorted raycast rather than
   one call whose results get re-sorted afterwards.

   The rank of the winning pass rides along on the result: a rank-1 hit is a
   legitimate answer to "what is under the cursor" but must never start a drag
   (see editDown), mirroring the 2D rule. */
function pickEditTarget(cx, cy) {
  if (!dyn) return null;
  var ray = pointerRay(cx, cy);
  for (var rank = 0; rank <= 1; rank++) {
    var roots = pickableRoots(rank);
    if (!roots.length) continue;
    var hits = ray.intersectObjects(roots, true);
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (h.object.type === "Sprite" || cutAway(h.object)) continue;
      var t = targetOf(h.object);
      if (!t || t.kind === "wall") continue;
      return { kind: t.kind, ref: t.ref, point: h.point, rank: rank };
    }
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
  /* A rank-1 hit is off the work set: it answered "what is under the cursor"
     and is allowed to, but it must not start a gesture. Declining here rather
     than in pickEditTarget is what lets the orbit have the press instead —
     dragging the camera is the more useful thing to do with a click on
     something you are not currently editing. The event is the same one the 2D
     hit chain fires so a single piece of UI can explain both refusals. */
  if (hit.rank !== 0) {
    /* Select it anyway. Refusing the DRAG is the rule; refusing to say what
       was clicked is not, and 2D has always filled the inspector from a
       rank-1 hit. Without this the 3D pane goes dead for anything structural
       under the boot work set — the click does nothing a user can see. */
    if (editMod && editMod.select3DTarget)
      editMod.select3DTarget({ kind: hit.kind, ref: hit.ref });
    window.dispatchEvent(
      /* Same detail shape the 2D chain emits (js/interaction.js blockedDrag),
         so one pill can read both: `sel` is the selection that was refused,
         `layer` its layer id, `reason` the gate that failed — here always
         "rank", since editDown only reaches this branch for a non-zero rank.
         `where` is the extra field 3D adds, so the UI can place the pill in
         the right pane. */
      new CustomEvent("layers:blocked-drag", {
        detail: {
          sel: { kind: hit.kind, ref: hit.ref },
          layer: layerOf(hit.kind),
          reason: "rank",
          where: "3d",
        },
      }),
    );
    return false;
  }
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
var gizmoEl = null, gizmoAxes = [], gzCompass = null, gzTmpV = null, gzTmpM = null, viewTween = null;
var AXIS_DEFS = [
  { key: "+x", dir: [1, 0, 0], col: "#e0564f", label: "X", pos: true },
  { key: "-x", dir: [-1, 0, 0], col: "#e0564f", label: "", pos: false },
  { key: "+y", dir: [0, 1, 0], col: "#3fa34d", label: "Y", pos: true },
  { key: "-y", dir: [0, -1, 0], col: "#3fa34d", label: "", pos: false },
  { key: "+z", dir: [0, 0, 1], col: "#4f8cf6", label: "Z", pos: true },
  { key: "-z", dir: [0, 0, -1], col: "#4f8cf6", label: "", pos: false },
];
var GZ = { size: 84, cx: 42, cy: 42, R: 20 };
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

  var compass = document.createElementNS(NS, "g");
  compass.setAttribute("class", "gz-compass");
  compass.setAttribute("title", "North (click to face North)");

  var ring = document.createElementNS(NS, "circle");
  ring.setAttribute("cx", GZ.cx); ring.setAttribute("cy", GZ.cy); ring.setAttribute("r", 35.5);
  ring.setAttribute("class", "gz-compass-ring");
  compass.appendChild(ring);

  var nPoly = document.createElementNS(NS, "polygon");
  nPoly.setAttribute("points", "42,1.5 38.5,6.5 45.5,6.5");
  nPoly.setAttribute("fill", "#e0564f");
  compass.appendChild(nPoly);

  var nCirc = document.createElementNS(NS, "circle");
  nCirc.setAttribute("cx", 42); nCirc.setAttribute("cy", 8.5); nCirc.setAttribute("r", 5);
  nCirc.setAttribute("fill", "#c0563b"); nCirc.setAttribute("stroke", "#ffffff"); nCirc.setAttribute("stroke-width", 1);
  compass.appendChild(nCirc);

  var nTxt = document.createElementNS(NS, "text");
  nTxt.setAttribute("x", 42); nTxt.setAttribute("y", 8.5); nTxt.setAttribute("dy", 2.6);
  nTxt.setAttribute("text-anchor", "middle");
  nTxt.setAttribute("class", "gz-lbl gz-north-lbl");
  nTxt.textContent = "N";
  compass.appendChild(nTxt);

  var sTick = document.createElementNS(NS, "line");
  sTick.setAttribute("x1", 42); sTick.setAttribute("y1", 74.5); sTick.setAttribute("x2", 42); sTick.setAttribute("y2", 78);
  sTick.setAttribute("class", "gz-compass-tick s-tick");
  compass.appendChild(sTick);
  var eTick = document.createElementNS(NS, "line");
  eTick.setAttribute("x1", 74.5); eTick.setAttribute("y1", 42); eTick.setAttribute("x2", 78); eTick.setAttribute("y2", 42);
  eTick.setAttribute("class", "gz-compass-tick");
  compass.appendChild(eTick);
  var wTick = document.createElementNS(NS, "line");
  wTick.setAttribute("x1", 6); wTick.setAttribute("y1", 42); wTick.setAttribute("x2", 9.5); wTick.setAttribute("y2", 42);
  wTick.setAttribute("class", "gz-compass-tick");
  compass.appendChild(wTick);

  compass.addEventListener("click", function (e) {
    e.stopPropagation();
    setStandardView("-z");
  });
  svg.appendChild(compass);
  gzCompass = compass;

  AXIS_DEFS.forEach(function (a) {
    if (a.pos) {
      var ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", GZ.cx); ln.setAttribute("y1", GZ.cy);
      ln.setAttribute("stroke", a.col); ln.setAttribute("stroke-width", 2);
      a.line = ln; svg.appendChild(ln);
    }
  });
  var home = document.createElementNS(NS, "circle");
  home.setAttribute("cx", GZ.cx); home.setAttribute("cy", GZ.cy); home.setAttribute("r", 3.2);
  home.setAttribute("class", "gz-home");
  home.addEventListener("click", function (e) { e.stopPropagation(); frameView(); });
  svg.appendChild(home);
  AXIS_DEFS.forEach(function (a) {
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "gz-nub");
    var c = document.createElementNS(NS, "circle");
    c.setAttribute("r", a.pos ? 6.5 : 5);
    a.circle = c; g.appendChild(c);
    if (a.label) {
      var tx = document.createElementNS(NS, "text");
      tx.setAttribute("text-anchor", "middle"); tx.setAttribute("dy", "3.0");
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
    a.circle.setAttribute("r", a.pos ? Math.max(4.2, 6.5 + a._depth * 1.8) : Math.max(3.5, 5 + a._depth * 1.2));
    a.circle.setAttribute("fill", a.pos ? a.col : "#fff");
    a.circle.setAttribute("stroke", a.col);
    a.circle.setAttribute("stroke-width", a.pos ? 0 : 1.4);
    a.circle.setAttribute("opacity", (0.5 + 0.5 * (a._depth * 0.5 + 0.5)).toFixed(2));
    if (a.text) { a.text.setAttribute("x", a._x); a.text.setAttribute("y", a._y); }
    if (a.line) { a.line.setAttribute("x2", a._x); a.line.setAttribute("y2", a._y); }
  });
  if (gzCompass) {
    var deg = ((Math.PI / 2 - theta) * 180 / Math.PI) + (S.northAngle || 0);
    gzCompass.setAttribute("transform", "rotate(" + deg.toFixed(2) + " 42 42)");
  }
  // painter's order: append nearer nubs last so they sit on top
  gizmoAxes.slice().sort(function (p, q) { return p._depth - q._depth; })
    .forEach(function (a) { if (a.svg && a.g) a.svg.appendChild(a.g); });
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
var lastSkyKey = null;
var lastEnvKey = null; // skip the costly PMREM re-prefilter when the sky palette is unchanged
var hdrSkyTex = null; // the half-float sky that is prefiltered into envRT
/* The environment as a half-float procedural sky (js/sky_model.js): linear
   radiance with the sun's glow and disc above 1, so glossy surfaces show a
   real highlight and the prefiltered fill is brighter on the sun's side.
   Returns null (and the caller paints the old gradient) if the backend
   cannot take the texture. */
function hdrSkyTexture(zenC, horC, groundHex, sunDir, sunCol, day) {
  try {
    if (!THREE.DataUtils || !THREE.HalfFloatType) return null;
    var W = 256, H = 128, g = new THREE.Color("#" + groundHex);
    var p = {
      // an ambient FILL, not a second sun: the direct light is the sun lamp
      zenith: [zenC.r * 0.55, zenC.g * 0.55, zenC.b * 0.55],
      horizon: [horC.r * 0.6, horC.g * 0.6, horC.b * 0.6],
      ground: [g.r * 0.9, g.g * 1.0, g.b * 0.8],
      sunColor: [sunCol.r, sunCol.g, sunCol.b],
      sunI: 30 * day,
      glowI: 0.9 * day,
    };
    var f = skyPixels(W, H, [sunDir.x, sunDir.y, sunDir.z], p);
    // one texture for the session, refilled in place: a new one per hour
    // was a fresh GPU allocation for a picture of the same size and format
    var tex = hdrSkyTex;
    if (!tex) {
      tex = new THREE.DataTexture(new Uint16Array(f.length), W, H, THREE.RGBAFormat, THREE.HalfFloatType);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.minFilter = tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
    }
    var half = tex.image.data;
    for (var i = 0; i < f.length; i++) half[i] = THREE.DataUtils.toHalfFloat(f[i]);
    tex.needsUpdate = true;
    hdrSkyTex = tex;
    return tex;
  } catch (e) {
    return null;
  }
}
function updateEnvMap(zenC, horC, groundHex, sunDir, sunCol, day) {
  if (!pmrem || !envSrcCanvas) return;
  // PMREM prefiltering is real GPU work and throws outright on a renderer whose
  // backend has not come up yet — which is the state applyEnv() runs in during
  // init3D, since the WebGPU/WebGL2 backend initialises asynchronously. Skip and
  // let the init handler re-run applyEnv() once the backend is live.
  if (!renderer || !renderer.initialized) {
    envDeferred = true;
    return;
  }
  var key = zenC.getHexString() + horC.getHexString() + groundHex +
    (sunDir ? "|" + [sunDir.x, sunDir.y, sunDir.z].map(function (v) { return Math.round(v * 50); }).join(",") : "");
  /* The cache is about not re-prefiltering the same sky, NOT about whether the
     scene is still using it: a game mode that nulls scene.environment for its
     own grade got the daylight sky back on exit but no image-based fill at
     all, because the key had not changed and this returned before the
     assignment. Re-hanging a texture we already have is free. */
  if (key === lastEnvKey && envRT) {
    scene.environment = envRT.texture;
    return;
  }
  lastEnvKey = key;
  var hdr = sunDir ? hdrSkyTexture(zenC, horC, groundHex, sunDir, sunCol || new THREE.Color(0xffffff), day || 0) : null;
  if (hdr) {
    var hrt = null;
    try { hrt = prefilterSky(hdr); } catch (e) { hrt = null; }
    if (hrt) return;
  }
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
  prefilterSky(envSrcTex);
}
/* Prefilter `src` into the environment the scene already holds (see
   prefilterInto): same target, new pixels. A new target per sky re-keyed
   every lit material (~640 ms per time-of-day step on a large flat), and a
   target disposed while a bind group still holds it fails the next submit. */
function prefilterSky(src) {
  var rt = prefilterInto(pmrem, src, envRT);
  if (rt !== envRT) {
    if (envRT) envRT.dispose();
    envRT = rt;
  }
  scene.environment = rt.texture;
  return rt;
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
  // The sun is the key light and the sky is fill. With the sky map at full
  // strength the two came out nearly equal, so interiors read flat and white
  // walls clipped; a stronger, warmer sun over a dimmer sky gives shadows
  // that actually model the rooms. The penumbra widens as the sun drops.
  sun.intensity = LUX * (on ? 0.45 + 1.4 * dk : 0);
  sun.color.copy(lerpC(0xfff1db, 0xff7a36, lowK));
  sun.shadow.radius = 3 + 6 * lowK;
  // a sun below the horizon still cost a 4096² pass and a texture in every shader
  sun.castShadow = on;
  /* Light in the order nature has it: the sun's patch through a window is
     several times brighter than the diffuse sky light around it, which is
     brighter than the bounce that fills the rest of the room. The window
     sky light used to put twice the sun's illuminance on the floor beside the
     glass, so a sun patch vanished into it. */
  scene.environmentIntensity = on ? 0.53 + 0.21 * lowK : 0.55;
  hemi.intensity = LUX * (0.02 + 0.05 * dk); // env map now supplies most sky ambient
  // gradient sky: zenith->horizon colors, shared with the path tracer via envPT
  var zen = on ? lerpC(0x5f93c8, 0xb46a4a, lowK) : new THREE.Color(0x070b14);
  var hor = on ? lerpC(0xd8e6f2, 0xf0a35c, lowK) : new THREE.Color(0x182233);
  envPT = {
    zenith: [zen.r, zen.g, zen.b],
    horizon: [hor.r, hor.g, hor.b],
    ground: [0.3, 0.34, 0.24],
    night: on ? 0 : 1,
  };
  var skyGround = hor.clone().multiplyScalar(0.75).getHexString();
  var skyKey = zen.getHexString() + hor.getHexString() + skyGround;
  if (skyCanvas && skyKey !== lastSkyKey) {
    lastSkyKey = skyKey;
    var sx = skyCanvas.getContext("2d"),
      grd = sx.createLinearGradient(0, 0, 0, skyCanvas.height);
    grd.addColorStop(0, "#" + zen.getHexString()); // canvas top = zenith
    grd.addColorStop(0.62, "#" + hor.getHexString()); // horizon band
    grd.addColorStop(1, "#" + skyGround); // below horizon, slightly darker
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
  updateEnvMap(zen, hor, on ? "3a3d30" : "0a0d14",
    new THREE.Vector3(dx, dy, dz).normalize(), sun.color, on ? dk : 0);
  // a dollhouse view keeps its ceilings and full-height walls as shadow
  // casters (see shadowRoot), so its rooms are lit like rooms seen from inside
  renderer.toneMappingExposure = on ? 1.28 : 0.95;
  S.artK = on ? 0.12 + 0.55 * (1 - dk) : 1.0;
  dyn.traverse(function (o) {
    if ((o.isPointLight || o.isSpotLight) && o.userData.baseI != null) {
      o.intensity = o.userData.win
        ? o.userData.baseI * 0.6 * dk
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
  fitPracticalLights(); // night practicals take over the shadows from the sun
  fitBounceLights(); // and the light they let in fills each room
  applySite(); // keep the site skybox/sky-dome visibility in sync with day/night
  runRelightHooks();
}

/* A game mode overwrites the whole rig — sun, hemisphere, environment map,
   exposure, and every practical in the house. applyEnv() above is the one
   place the planner's daylight lands, and it runs on its own schedule (the
   initial build finishes it AFTER the mode has already graded the scene, which
   is how The Floor is Lava came up as a bright showroom). Whoever is holding a
   grade registers here and re-applies at the end of every relight; nothing in
   this file needs to know which mode that is. */
var relightHooks = [];

export function onRelight(fn) {
  if (typeof fn !== "function") return function () {};
  relightHooks.push(fn);
  return function () {
    var i = relightHooks.indexOf(fn);
    if (i >= 0) relightHooks.splice(i, 1);
  };
}

function runRelightHooks() {
  for (var i = 0; i < relightHooks.length; i++) {
    try {
      relightHooks[i]();
    } catch (e) {
      /* a mode that fails to re-grade must not take the planner's own
         lighting pass down with it */
    }
  }
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
    // Satellite imagery is another ground surface above the service plane.
    // Keep it out of the way during under-floor inspection as well.
    siteGroup.visible = !mepXray("floor");
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
    groundPlaneRef.visible = !showSV && !mepXray("floor") && !(showAerial && floorCm > 0);
    if (siteDressRef) siteDressRef.visible = groundPlaneRef.visible && !showAerial;
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
      if (m.userData.sky) m.userData.sky.dispose();
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
  // A node material: the node builder rejects a raw ShaderMaterial and swaps
  // in a blank default, which is what this dome drew until it was ported.
  var mat = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // The pano is a finished photo — ACES washes it out. (Honoured on the
    // direct render path; the post pipeline tone-maps the whole frame.)
    toneMapped: false,
  });
  // Sample direction is the per-fragment object-space direction from the
  // sphere center — exact for every fragment. The cube-texture node applies
  // the -x flip itself for a plain CubeTexture: the same BackSide (inside-out)
  // mirroring fix the GLSL version did by hand.
  mat.colorNode = TSL.cubeTexture(cubeTex, TSL.positionLocal.normalize());
  mat.userData.sky = cubeTex;
  svBox = new THREE.Mesh(geo, mat);
  if (faces._panoLat && faces._panoLon) {
    svBox.userData = { panoLat: faces._panoLat, panoLon: faces._panoLon };
  }
  svBox.renderOrder = -2; // early in the opaque pass; geometry covers it
  svBox.frustumCulled = false; // the camera usually sits inside it
  scene.add(svBox);
  applySite();
}

var lastViewWidth = 0, lastViewHeight = 0, lastViewRatio = 0;
export function setSize(w, h) {
  if (!ready3D || w === 0 || h === 0) return;
  var ratio = renderer.getPixelRatio();
  // ResizeObserver can repeat the same size while chrome settles. Keep the
  // existing render targets and temporal history until size or DPR changes.
  if (w === lastViewWidth && h === lastViewHeight && ratio === lastViewRatio) return;
  lastViewWidth = w; lastViewHeight = h; lastViewRatio = ratio;
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
  if (drawingEnabled && !drawingOverlay) {
    drawingOverlay = createPlannerDrawing(THREE);
    drawingCanvas = document.createElement('canvas');
    drawingCanvas.className = 'planner-drawing-overlay';
    drawingCanvas.setAttribute('aria-hidden', 'true');
    renderer.domElement.parentElement.appendChild(drawingCanvas);
  }
  if (drawingOverlay) {
    drawingOverlay.group.visible = !gameRendererLock && !extTick;
    drawingCanvas.hidden = !drawingOverlay.group.visible;
    if (drawingOverlay.group.visible) {
      drawingOverlay.sync(drawingFurniture ? [structureRoot, itemsRoot] : [structureRoot]);
      var segs = [];
      drawingWalls.forEach(function (w) {
        var a = S.nodes[w.a], b = S.nodes[w.b];
        if (a && b) segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
      });
      drawingOverlay.setPlan(segs, function (cm) { return fmtLen(cm); });
      drawingOverlay.setOccluders([structureRoot]);
      drawingOverlay.setOptions(drawingPrefs);
      if (drawingHoverObj && !drawingHoverObj.parent) drawingHoverObj = null;
      drawingOverlay.setHover(drawingPrefs.hover ? drawingHoverObj : null);
    }
  }
  if (gameEffectFactory) {
    try {
      if (!gameEffect) gameEffect = gameEffectFactory(renderer, scene, camera);
      gameEffect.render();
      return;
    } catch (error) {
      console.warn("Body camera lens unavailable; using direct rendering", error);
      setGameRenderEffect(null);
    }
  }
  if (usePost && post) post.render();
  else renderer.render(scene, camera);
  if (drawingOverlay && drawingOverlay.group.visible) {
    drawingOverlay.draw(drawingCanvas, camera, renderer.domElement.clientWidth, renderer.domElement.clientHeight, Math.min(window.devicePixelRatio || 1, 2));
  }
  if (plannerRenderHook) plannerRenderHook();
}

export function setOrbitCamera(opts) {
  if (!opts) return;
  if(!tgt){pendingOrbitCamera=opts;return;}
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

export function getNavigationView(){return {walk,walkView,position:{...walkPos},yaw,pitch,freeMove,orbit:getOrbitCamera()};}
export function restoreNavigationView(view){
  if(!view)return;if(!ready3D||!tgt){pendingNavigationView=view;return;}
  toggleWalk(!!view.walk);walkView=view.walkView==='tpv'?'tpv':'fpv';freeMove=!!view.freeMove;
  if(view.position&&['x','y','z'].every(k=>Number.isFinite(view.position[k])))walkPos={...view.position};
  if(Number.isFinite(view.yaw))yaw=view.yaw;if(Number.isFinite(view.pitch))pitch=view.pitch;
  if(walk)walkLook();else setOrbitCamera(view.orbit);
  window.dispatchEvent(new Event('planner-navigation-restored'));requestRender();
}

export function getOrbitCamera() {
  return {
    theta: theta,
    phi: phi,
    radius: radius,
    target: { x: tgt?.x || 0, y: tgt?.y || 0, z: tgt?.z || 0 },
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

/* glTF export lives in js/blender_export.js, not here. It used to be four
   lines pointing GLTFExporter straight at `dyn`, which is a renderer's scene
   graph: centimetres, no names, view aids and all. What it produced opened in
   Blender as a 100x oversized pile of "Object.001". The replacement builds a
   throwaway scene first; getDynGroup() and ensureBuilt() are what it needs
   from here. */

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
    // calibrated against the lamp's catalogue throw, not its room-clipped range
    var d = o.userData.throwCm || o.distance || 0;
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
    if (o.userData?.exportSkip) return;
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
  /* The scene's materials ask the material tier whether the GPU is a CPU
     rasteriser. Until the WebGPU adapter has answered that (primeGpuTier,
     started at boot) the tier finds out by creating a throwaway WebGL
     context — ~0.7 s with the main thread blocked, on every first visit. The
     adapter answers within the time three takes to load anyway. */
  init3DPromise = Promise.all([loadThree(), primeGpuTier()]).then(build3D).catch(function (e) {
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
  // PCF, not PCFSoft: in r185 PCFSoftShadowFilter is a fixed 3×3-texel gather
  // that never reads shadow.radius, so every penumbra this rig sets (the sun
  // widening at dusk, the night practicals) came out as the same hard edge.
  // PCFShadowFilter samples a Vogel disk scaled by shadow.radius, rotated per
  // pixel — the penumbra the radius asks for. Point lights use their own
  // filter, which reads radius either way.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Shadows are camera-independent, so there's no reason to re-render the (4K)
  // shadow map every frame while the user just orbits. They update on demand —
  // only when geometry or the sun actually moved (see shadowsDirty) — per light,
  // through syncShadowUpdates: WebGPURenderer has no renderer-wide switch.
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
  // the sun also sees what the view hides (see shadowRoot); a mask beyond
  // layer 0 stops the shadow camera inheriting the view camera's layers
  sun.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
  scene.add(sun);
  scene.add(sun.target);
  dyn = new THREE.Group();
  scene.add(dyn);
  // on `scene`, not `dyn`: one light for the life of the view (see fitBounceLights).
  // Its plan map also keeps the sky and every unshadowed light out of the
  // rooms they cannot reach (see fitLightMasks); a game grading the house
  // with its own rig holds the masks off.
  roomBounce = createRoomBounce(THREE, TSL, { masks: function () { return !gameRendererLock && !relightHooks.length; } });
  roomBounce.register(renderer);
  roomBounce.confineSky(scene);
  scene.add(roomBounce.light);
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
    // three's velocity node keeps the previous CAMERA view matrix in the
    // per-object uniform group, so every camera move dirtied every object's
    // uniform buffer: one upload per mesh per frame, which on the WebGPU
    // backend (a queue.writeBuffer each) was the bulk of an orbit frame. The
    // value is per camera, like the previous projection beside it, so it
    // belongs to the render group: uploaded once per pass, and a static mesh's
    // own buffer stays untouched while the view moves.
    if (TSL.velocity.previousCameraViewMatrix && TSL.renderGroup)
      TSL.velocity.previousCameraViewMatrix.setGroup(TSL.renderGroup);
    /* No per-object velocity in the MRT. With a velocity target bound, three
       refreshes EVERY object's uniforms on every frame (needsVelocity), even
       a static wall, even inside a recorded bundle: ~7 ms of an orbit frame
       on the ~830 meshes of a furnished flat (half the frame). TRAA gets a camera-motion
       velocity instead, rebuilt from depth and last frame's camera — exact
       for everything that stands still, which in a planner is everything but
       the piece being dragged, and TRAA's variance clipping keeps that one
       from smearing. Matrices are the unjittered ones, as three's own
       velocity uses (see syncCameraVelocity). */
    scenePass.setMRT(TSL.mrt({ output: TSL.output }));
    var colorNode = scenePass.getTextureNode("output");
    var depthNode = scenePass.getTextureNode("depth");
    velUniforms = {
      curViewProj: TSL.uniform(new THREE.Matrix4()),
      prevViewProj: TSL.uniform(new THREE.Matrix4()),
      projInv: TSL.uniform(new THREE.Matrix4()),
      world: TSL.uniform(new THREE.Matrix4()),
      primed: false,
    };
    var cameraVelocity = TSL.Fn(function () {
      var uvN = TSL.uv();
      var depth = depthNode.load(uvN.mul(depthNode.size())).r;
      var view = TSL.getViewPosition(uvN, depth, velUniforms.projInv);
      var world = velUniforms.world.mul(TSL.vec4(view, 1));
      var cur = velUniforms.curViewProj.mul(world), prev = velUniforms.prevViewProj.mul(world);
      return TSL.vec4(cur.xy.div(cur.w).sub(prev.xy.div(prev.w)), 0, 1);
    })();
    var velocityNode = TSL.convertToTexture(cameraVelocity);

    /* Normals from depth, not from a normal target: the walls are flat-shaded
       and re-cut by the dollhouse, and their vertex normals disagreed with the
       depth GTAO marches through — every wall seen from above read as ~40%
       occluded (dark grey) on open, flat plaster. Depth is the truth GTAO
       measures against anyway, and dropping the normal target saves a
       full-screen write per frame. */
    aoPass = ADDONS.ao(depthNode, null, camera);
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
    // "vel" shows TRAA's camera velocity (|ndc offset| × 20) for checking reprojection,
    // "aoonly" the ambient occlusion alone
    post.outputNode = stage === "raw" ? colorNode : stage === "ao" ? lit
      : stage === "vel" ? TSL.vec4(velocityNode.sample(TSL.uv()).xy.abs().mul(20), 0, 1)
      : stage === "aoonly" ? TSL.vec4(TSL.vec3(aoPass.getTextureNode().r), 1) : traaPass;
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
    // the dusk and dawn shadow handoffs re-key every material; keep the
    // other half of the day's shaders instead of rebuilding them each time
    retainShaderCaches(renderer);
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
    // Instanced billboard quads, not THREE.Points: WebGPU only draws 1px point
    // primitives, so a 2.5px Points star field shrank to specks. A
    // PointsNodeMaterial on a MESH runs three's sprite expansion instead, with
    // the same size / sizeAttenuation meaning PointsMaterial had.
    var quad = new THREE.PlaneGeometry(1, 1);
    var sg = new THREE.InstancedBufferGeometry();
    sg.setIndex(quad.index.clone());
    sg.setAttribute("position", quad.attributes.position.clone());
    sg.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
    sg.instanceCount = pos.length / 3;
    quad.dispose();
    var starMat = new THREE.PointsNodeMaterial({
      color: 0xcfdcf2,
      size: 2.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    });
    starMat.positionNode = TSL.attribute("iPos");
    stars = new THREE.Mesh(sg, starMat);
    // the quad's own bounds are 1cm at the origin; the dome is 68m out, so
    // neither culling nor a scene raycast may use them
    stars.frustumCulled = false;
    stars.raycast = function () {};
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
  if(pendingOrbitCamera){const saved=pendingOrbitCamera;pendingOrbitCamera=null;setOrbitCamera(saved);}
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
  el.addEventListener("pointermove", function (e) {
    if (!drawingEnabled || !drawingPrefs.hover) return;
    // no hover sketch while orbiting, panning or dragging a piece
    drawingHoverAt(down || editDrag || e.buttons ? null : e.clientX, e.clientY);
  });
  el.addEventListener("mouseleave", function () {
    if (drawingHoverObj || drawingHoverXY) drawingHoverAt(null);
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
    dragPan = !walk && (e.button === 1 || e.shiftKey);
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
    const focused=document.activeElement;
    if (!walk || document.documentElement.dataset.plannerViewport==='plan' || focused?.matches('input,textarea,select,[contenteditable="true"]') || document.querySelector('#cad-entry:not([hidden]) input:focus')) return;
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
          window.dispatchEvent(new CustomEvent('planner-door-toggle',{detail:{opening:nearestDoor.userData.opening,open:!nearestDoor.userData.open}}));
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
          legacyTouchEdit &&
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
      } else if (d.userData.type === "double") {
        (d.userData.leaves || []).forEach(function(leaf) {
          var leafTarget = d.userData.open ? leaf.userData.maxOpen : 0;
          var leafDelta = leafTarget - leaf.rotation.y;
          if (Math.abs(leafDelta) > 1e-4) {
            leaf.rotation.y += leafDelta * 0.1;
            moving = true;
          } else leaf.rotation.y = leafTarget;
        });
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
  if(pendingNavigationView){const view=pendingNavigationView;pendingNavigationView=null;restoreNavigationView(view);}
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
        /* compile() issues GPU work, so it too has to wait for the backend.
           It walks the whole scene in a render context of its own — the frame
           that follows does all of that again — so it only pays when there
           is time before the next rebuild: during a drag it was ~17 ms of
           every frame. */
        var nowT = performance.now();
        if (renderer && scene && camera && !firstCompiled) {
          /* The first build: every shader in the house is new, and the
             frame that draws it builds them all in one task (~1.6 s frozen
             on a large flat). That cannot be split from here: compileAsync
             builds against a render context the post-processed frame never
             uses (three keys every shader on its context, and the scene
             pass renders nested inside the output pass), so waiting for it
             — up to its 6 s timeout, every time — saved ~0.6 s of the
             freeze and kept the view blank for the 6 s. So the freeze is
             shown for what it is instead: "Preparing the 3D view…" goes up
             now, paints on this frame, and the frame after it draws; it
             comes down once that draw is done. */
          firstCompiled = true;
          compileGate = true;
          var prep = document.getElementById("v3dPrep");
          if (prep) prep.style.display = "block";
          var open = function () {
            if (!compileGate) return;
            compileGate = false; needsRender = true; settle = SETTLE_FRAMES;
            prepUntilDrawn = !!prep;
          };
          requestAnimationFrame(open); // after this loop's own next frame
          setTimeout(open, 250); // a hidden tab runs no frames
        }
        lastRebuildT = nowT;
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
    if (walk) moveWalk(delta / 1000);
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
    if (seeFading.size) {
      stepSeeFades(delta);
      needsRender = true;
    }
    var humansLive = updateHumans(time);
    var physicsLive = isPhysicsBusy();
    // Nothing can be painted until the WebGPU/WebGL2 backend has finished its
    // async init; keep the loop alive and pick up on the frame after it lands.
    if (!renderer || !renderer.initialized) return;
    if (compileGate) return; // the first build is still compiling (see the rebuild above)
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
      var shadowPass = false, shadowBox = shadowDirtyBox, shadowHold = false;
      shadowDirtyBox = null;
      if (extLive) {
        // The external modes' own lights (Night Shift's flashlight) move with
        // the player every frame; their shadows stay live, see syncShadowUpdates.
        shadowPass = true;
      } else if (shadowsDirty && shadowsFromRebuild && !physicsLive && !doorsMoving &&
          time - rebuildShadowT < 100) {
        shadowHold = true;
        /* Rebuild after rebuild (a wall or opening being dragged): every map
           redrawn on each one was a third of the frame. They follow at
           ~10 Hz; the dirt is kept, so the frame after the last rebuild still
           gets its full redraw. */
        needsRender = true;
      } else if (shadowsDirty || physicsLive || doorsMoving) {
        shadowPass = true;
        if (shadowsFromRebuild) rebuildShadowT = time;
        shadowsDirty = false;
        shadowsFromRebuild = false;
        shadowThrottleT = time;
      } else if (humansLive) {
        // People move slowly and are small in frame, so re-rendering a 4096²
        // depth map for their sway on every frame is the most expensive thing
        // in an otherwise static room. Cap it at ~5 Hz. Geometry and physics
        // keep the immediate path above.
        if (!shadowThrottleT || time - shadowThrottleT > 200) {
          shadowPass = true;
          shadowThrottleT = time;
        }
      }
      /* A drag moves its piece every pointer event, and redrawing the maps
         that reach it (the sun's 4096², a room's six-face cube, the windows)
         on each one was most of a drag frame. They follow at ~10 Hz while it
         moves; the region is kept, and keeps the loop awake, until the
         redraw where the piece came to rest has landed. */
      if (shadowBox && !shadowPass && time - regionShadowT < 100) {
        markShadowRegion(shadowBox);
        shadowBox = null;
      } else if (shadowBox) regionShadowT = time;
      syncCameraVelocity();
      syncShadowUpdates(shadowPass, shadowBox, shadowHold);
      syncSelectionOutline();
      try {
        renderScene();
        if (prepUntilDrawn) {
          prepUntilDrawn = false;
          var prepEl = document.getElementById("v3dPrep");
          if (prepEl) prepEl.style.display = "none";
        }
        if (retired.length) disposeRetired();
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

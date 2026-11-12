import './blueprint_3d.js';
import './core/precise_bounds_cache.js';
import { createSceneRegistry } from './core/scene_registry.js';
import './core/wall_build_key.js';
import { createPlannerDrawing } from './planner_drawing.js';
import './cabinet_mesh.js';
import './floors.js';
import './survey_mesh.js';
import './navigation_geometry.js';
import "./navigation_profile.js";
import './camera_sweep.js';
// 3D scene: renderer/camera/lights, builds walls + items, sun-by-time-of-day, orbit controls.
// three is LATE-BOUND (js/three_lazy.js): the renderer is 3.5 MB and must not
// sit on the synchronous boot module graph. `THREE`, `TSL` and `ADDONS` are
// empty objects until init3D() awaits loadThree(); every use below is inside a
// function body, so nothing here reads them at module-evaluation time.
// Node-based post-processing (three r185). The classic EffectComposer/SSAOPass
// stack does not run on WebGPURenderer at all, so AO + AA are rebuilt as a TSL
// node graph: GTAO replaces SSAO (ground-truth occlusion, far fewer artifacts)
// and TRAA replaces FXAA (temporal, resolves edges instead of blurring them).
import { THREE, TSL, ADDONS, loadThree } from "./three_lazy.js";
import { createRenderer, LUX, retainShaderCaches } from "./gpu.js";
import { primeGpuTier } from "./material_tier.js";
import { S, clamp } from "./state.js";
import { clearGroup } from "./primitives.js";
import "./furniture.js";
import "./core/runtime.js";
import "./textures.js";
import { pbrTextures, pbrSurfaceMaterial } from "./pbr_material.js";
import { createLightLoop } from "./light_loop.js";
import { createRoomBounce, roomInspectionFill, UNMASKED } from "./room_bounce.js";
import { HumanFactory } from "./human.js";
import "./site.js";
import "./geometry.js";
import "./slab_openings.js";
import "./roof.js";
import "./wall_types.js";
import { projectToWall } from "./wall_curves.js";
import {
  syncPhysicsToThree, isPhysicsEnabled, isPhysicsBusy, hitObjectAtCenter,
  toggleSlowMo,
} from "./physics_facade.js";
import { safeDeltaMilliseconds } from "./physics_runtime.js";
import "./physics/math.js";
import "./mep.js";
import "./layers.js";
import "./wall_framing.js";
import { fmtLen } from "./display_units.js";
import "./elevation.js";
import "./wall_cut.js";
import "./wall_view.js";
import "./user_layers.js";
import "./site_dressing.js";
import "./sky_model.js";
import { lightLoopWanted } from "./view3d/wall_build.js";
import { frameSpec } from "./view3d/site_cutaway.js";
import {
  applyEnv, applySite, buildViewGizmo, onRelight, setSize, setStreetViewCube,
  updateViewGizmo,
} from "./view3d/gizmo_env.js";
import {
  editDown, editMove, editUp, focusAt, isEdit3D, navCode, navTick,
  rayAtHeight, targetOf, toggleEdit3D,
} from "./view3d/navigation_edit.js";
import {
  cP, cutAway, frameDollhouse, frameView, panPixels, pointerRay, stepSeeFades,
  upd, updateSeeThrough, warmFadePipelines, zoomBy,
} from "./view3d/see_through.js";
import {
  finishPrewarm, fitPracticalLights, initPhysicsForScene, prewarmHolds,
  schedulePrewarm, startPrewarm,
} from "./view3d/lighting.js";
import {
  applyItemOps, applyLayers3D, pickableRoots, rebuild3D, selected3DBox,
} from "./view3d/items_layers.js";
import {
  clearGameRendererQuality, isFreeMove, isWalk, moveWalk,
  setGameRendererQuality, toggleFreeMove, toggleWalk, toggleWalkView,
  walkLook, walkViewMode,
} from "./view3d/walk_mode.js";
import { wireRenderLoopAndGestures } from "./view3d/render_loop.js";
import { setupSkyAndWalkControls } from "./view3d/sky_walk.js";
import { setupRendererAndShadows } from "./view3d/renderer_setup.js";
export { clearGameRendererQuality, isFreeMove, isWalk, setGameRendererQuality, toggleFreeMove, toggleWalk, toggleWalkView, walkViewMode };
export { applyLayers3D, rebuild3D };
export { initPhysicsForScene };
export { frameDollhouse, frameView };
export { isEdit3D, toggleEdit3D };
export { applyEnv, applySite, onRelight, setSize, setStreetViewCube };
export { frameSpec };
// for js/view3d/wall_build.js (live bindings: it sees every reassignment)
export { drawnShadows, itemsRoot, scene, spareLights, structureRoot };
// for js/view3d/site_cutaway.js (live bindings: it sees every reassignment)
export {
  CAP_COLORS, SHADOW_ONLY_LAYER, buildingShadowWalls, isSharedSurface,
  stubBuildH, surfaceMaterial, walk,
};
// for js/view3d/gizmo_env.js (live bindings: it sees every reassignment)
export {
  AXIS_DEFS, GZ, SETTLE_FRAMES, SV_BLDG_DIST, SV_CAM_H, SV_RADIUS, camera,
  dyn, envRT, envSrcCanvas, envSrcTex, gizmoAxes, gizmoEl, groundPlaneRef,
  gzCompass, gzTmpM, gzTmpV, hdrSkyTex, hemi, lastEnvKey, lastSkyKey,
  lastViewHeight, lastViewRatio, lastViewWidth, phi, pmrem, prewarmRun,
  ready3D, relightHooks, renderer, set_envDeferred, set_envPT, set_envRT,
  set_framedInterior, set_gizmoAxes, set_gizmoEl, set_gzCompass, set_gzTmpM,
  set_gzTmpV, set_hdrSkyTex, set_lastEnvKey, set_lastSkyKey,
  set_lastViewHeight, set_lastViewRatio, set_lastViewWidth, set_needsRender,
  set_settle, set_shadowsDirty, set_siteAerialMesh, set_siteAerialTex,
  set_siteGroup, set_svBox, set_userMoved, set_viewTween, siteAerialMesh,
  siteAerialTex, siteDressRef, siteGroup, skyCanvas, skyDome, skyTex, stars,
  sun, svBox, theta,
};
// for js/view3d/navigation_edit.js (live bindings: it sees every reassignment)
export {
  editDrag, editMod, extTick, mepRoot, navFwd, navHit, navKeys, navPlane,
  navRight, radius, set_editDrag, set_editMod, set_navHit, set_navPlane,
  set_radius, set_tgtTween, tgt,
};
// for js/view3d/see_through.js (live bindings: it sees every reassignment)
export {
  DEFr, SEE_FADE_MS, framedInterior, navRay, navUp, overviewRadiusLimit,
  plannerCompact, seeAimV, seeFading, seeHeld, seeStubs, set_navFwd,
  set_navRay, set_navRight, set_navUp, set_overviewRadiusLimit, set_phi,
  set_seeAimV, set_structureRoot, set_stubBuildH, set_theta, set_warmGeo,
  set_warmQueued, set_warmRoot, shadowRoot, shadowStandIns, stubRoot,
  wallBuildArgs, warmGeo, warmKeys, warmQueued, warmRoot,
};
// for js/view3d/lighting.js (live bindings: it sees every reassignment)
export {
  BOUNCE_RHO, MAX_SHADOW_MAPS, PRACTICAL_SHADOW, PREWARM_IDLE_MS, SHADOW_SETS,
  bounceRooms, gameRendererLock, needsRender, plannerShadowsEnabled,
  prewarmPass, roomBounce, set_bounceRooms, set_prewarmDue, set_prewarmRun,
  set_starsWarm, settle, starsWarm, usePost, windowLights,
};
// for js/view3d/items_layers.js (live bindings: it sees every reassignment)
export {
  GHOST_OPACITY, catalogRev, itemCache, markShadowRegion, retireGroup,
  reusableWalls, selectionBoundsCache, set_buildingShadowWalls,
  set_drawingHoverObj, set_drawingWalls, set_groundPlaneRef, set_itemsRoot,
  set_mepRoot, set_reusableWalls, set_selectionBoundsCache, set_shadowRoot,
  set_shadowStandIns, set_shadowsFromRebuild, set_stubRoot, set_wallBuildArgs,
  set_windowLights,
};
// for js/view3d/walk_mode.js (live bindings: it sees every reassignment)
export {
  EYE_H, avatar, cameraAt, cameraBoom, cameraSweep, freeMove, keys, pitch,
  set_EYE_H, set_avatar, set_cameraAt, set_cameraBoom, set_cameraSweep,
  set_freeMove, set_gameRendererLock, set_keys, set_pitch, set_siteDressRef,
  set_tpDist, set_usePost, set_walk, set_walkFloorPending, set_walkPos,
  set_walkView, set_yaw, touchMove, tpDist, walkControls, walkFloorPending,
  walkPos, walkView, yaw,
};
// for js/view3d/render_loop.js (live bindings: it sees every reassignment)
export {
  compileGate, dec_settle, disposeRetired, firstCompiled, gestureRebuildMs,
  lastRebuildT, pendingNavigationView, prepUntilDrawn, prewarmDue,
  rebuildShadowT, regionShadowT, renderErrLogged, renderScene, retired,
  set_compileGate, set_firstCompiled, set_gestureRebuildMs, set_lastRebuildT,
  set_pendingNavigationView, set_prepUntilDrawn, set_rebuildShadowT,
  set_regionShadowT, set_renderErrLogged, set_shadowDirtyBox,
  set_shadowThrottleT, shadowDirtyBox, shadowThrottleT, shadowsDirty,
  shadowsFromRebuild, syncCameraVelocity, syncSelectionOutline,
  syncShadowUpdates, tgtTween, view3dLocals, viewTween,
};
// for js/view3d/sky_walk.js (live bindings: it sees every reassignment)
export {
  applyPlannerQuality, drawingEnabled, drawingHoverAt, drawingHoverObj,
  drawingHoverXY, drawingPrefs, envDeferred, navFocus, navHover,
  pendingOrbitCamera, set_DEFr, set_navFocus, set_navHover, set_navKeys,
  set_pendingOrbitCamera, set_skyCanvas, set_skyDome, set_skyTex, set_stars,
  set_tgt, set_walkControls,
};
// for js/view3d/renderer_setup.js (live bindings: it sees every reassignment)
export {
  aoPass, lightLoop, post, set_aoPass, set_camera, set_dyn, set_envSrcCanvas,
  set_envSrcTex, set_hemi, set_lightLoop, set_pmrem, set_post,
  set_prewarmPass, set_ready3D, set_renderer, set_roomBounce, set_scene,
  set_sun, set_traaPass, set_velUniforms, traaPass, velUniforms,
};

/* "Is there a live 3D scene?" — a QUESTION now, not a load-time constant.
   It used to be `typeof THREE !== "undefined"`, i.e. always true, evaluated the
   moment the module was parsed. three is late-bound (js/three_lazy.js), so
   there is no honest synchronous answer at import time: the truthful one is
   "not yet". `ready3D` starts false, flips once init3D() has actually built the
   scene, and every guard below reads it — so a call that arrives before the
   renderer exists no-ops exactly as it did on a machine without WebGL. */
var ready3D = false;
function set_ready3D(value) { return ready3D = value; }
let plannerRenderHook = null;
let pendingOrbitCamera = null;
function set_pendingOrbitCamera(value) { return pendingOrbitCamera = value; }
let pendingNavigationView = null;
function set_pendingNavigationView(value) { return pendingNavigationView = value; }
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
function set_camera(value) { return camera = value; }
function set_dyn(value) { return dyn = value; }
function set_hemi(value) { return hemi = value; }
function set_renderer(value) { return renderer = value; }
function set_scene(value) { return scene = value; }
function set_sun(value) { return sun = value; }
function set_stars(value) { return stars = value; }
// real-world site overlay (js/site.js): aerial ground group + street-view skybox.
// Both live on `scene` (not `dyn`) so they survive rebuild3D's dyn.clear().
var siteGroup = null, // holds the aerial ground plane, rotated by groundRot
  siteAerialMesh = null,
  siteAerialTex = null,
  svBox = null, // world-anchored street-view pano dome (see setStreetViewCube)
  skyDome = null, // gradient sky dome ref (hidden when street view is on)
  groundPlaneRef = null;
function set_skyDome(value) { return skyDome = value; }
function set_groundPlaneRef(value) { return groundPlaneRef = value; }
function set_siteAerialMesh(value) { return siteAerialMesh = value; }
function set_siteAerialTex(value) { return siteAerialTex = value; }
function set_siteGroup(value) { return siteGroup = value; }
function set_svBox(value) { return svBox = value; }
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
/* Ends the idle prewarm's run (see startPrewarm) and says whether one was in
   progress: until it is over the lights are on another hour's shadow set,
   which a second renderer drawing now would draw. The run stops after the
   build in flight, as input here stops it; the next quiet spell starts it
   again. */
export function stopShadowSetPrewarm() {
  if (!prewarmRun) return false;
  prewarmRun.stop = true;
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
function set_aoPass(value) { return aoPass = value; }
function set_post(value) { return post = value; }
function set_traaPass(value) { return traaPass = value; }
function set_usePost(value) { return usePost = value; }
// TRAA is temporal: one painted frame is not enough for it to converge, and the
// on-demand loop below would otherwise stop after a single paint and leave the
// image visibly noisy. After the last real change we keep painting this many
// extra "settle" frames so the temporal history fills in, then go idle again.
var SETTLE_FRAMES = 6;
var settle = 0;
function dec_settle() { return --settle; }
function set_settle(value) { return settle = value; }
var renderErrLogged = false;
function set_renderErrLogged(value) { return renderErrLogged = value; }
// set when updateEnvMap had to skip because the GPU backend was not up yet
var envDeferred = false;
function set_envDeferred(value) { return envDeferred = value; }
// On-demand rendering: post-processing + the 4K shadow map are far too expensive
// to redraw at display refresh when nothing is moving. We only paint a frame
// when something actually changed (`needsRender`) or an animation is live
// (doors easing, humans, physics, walk movement). Every camera move funnels
// through upd()/walkLook(), so flagging there covers all interaction.
var needsRender = true; // paint the next frame
function set_needsRender(value) { return needsRender = value; }
var shadowsDirty = true; // rebuild the sun shadow map next paint (geometry/sun changed)
function set_shadowsDirty(value) { return shadowsDirty = value; }
var shadowThrottleT = 0;  // timestamp of last shadow pass (for extLive throttle)
function set_shadowThrottleT(value) { return shadowThrottleT = value; }
var regionShadowT = 0; // timestamp of the last drag-region shadow redraw
function set_regionShadowT(value) { return regionShadowT = value; }
var shadowsFromRebuild = false, rebuildShadowT = 0; // a wall drag rebuilds every frame
function set_rebuildShadowT(value) { return rebuildShadowT = value; }
function set_shadowsFromRebuild(value) { return shadowsFromRebuild = value; }
var lastRebuildT = -1e9; // when the last full rebuild ran (see the compile below it)
function set_lastRebuildT(value) { return lastRebuildT = value; }
var gestureRebuildMs = 0; // what a rebuild during the current gesture cost (rebuild3D + applyEnv)
function set_gestureRebuildMs(value) { return gestureRebuildMs = value; }
var firstCompiled = false, compileGate = false; // the first draw waits a frame for #v3dPrep to paint
function set_compileGate(value) { return compileGate = value; }
function set_firstCompiled(value) { return firstCompiled = value; }
var prepUntilDrawn = false; // #v3dPrep comes down after the first draw
function set_prepUntilDrawn(value) { return prepUntilDrawn = value; }
var qualityPreset = "auto";
var gameRendererLock = false;
function set_gameRendererLock(value) { return gameRendererLock = value; }
var drawingOverlay = null, drawingEnabled = false, drawingCanvas = null;
// The drawing reads as a floor-plan sheet: structure and its dimensions. The
// furniture layer is opt-in (setDrawingFurniture) so the default stays clean.
var drawingFurniture = false, drawingWalls = [];
function set_drawingWalls(value) { return drawingWalls = value; }
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
function set_drawingHoverObj(value) { return drawingHoverObj = value; }
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
function set_shadowDirtyBox(value) { return shadowDirtyBox = value; }
/* Bumped by everything that changes what casts shadows short of a full
   rebuild (a moved or resized piece, a requested redraw). Another renderer
   with shadow maps of its own (the inspector preview's stand-in lights)
   compares it to know its maps are out of date. */
var shadowRev = 0;
export function shadowRevision() {
  return shadowRev;
}
// it also says so, for a renderer whose last paint came before the change
// (an inspector edit can land up to 300 ms after the preview repainted)
function bumpShadowRevision() {
  shadowRev++;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("scene3d:shadows"));
}
/* `requeue`: the paced redraw putting back a region it already had, not a
   new change: it must not tell other renderers their maps went stale. */
function markShadowRegion(box, requeue) {
  if (!box || box.isEmpty()) return;
  if (!requeue) bumpShadowRevision();
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
export function requestShadowUpdate() { bumpShadowRevision(); shadowsDirty = true; needsRender = true; settle = SETTLE_FRAMES; }

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

var skyCanvas,
  skyTex,
  envPT = null; // gradient sky dome + env snapshot for the path tracer
function set_skyCanvas(value) { return skyCanvas = value; }
function set_skyTex(value) { return skyTex = value; }
function set_envPT(value) { return envPT = value; }
var pmrem, // PMREMGenerator for image-based lighting
  envSrcCanvas, // equirect gradient painted for IBL
  envSrcTex,
  envRT = null; // current prefiltered environment render target
function set_envSrcCanvas(value) { return envSrcCanvas = value; }
function set_envSrcTex(value) { return envSrcTex = value; }
function set_pmrem(value) { return pmrem = value; }
function set_envRT(value) { return envRT = value; }
var tgt,
  radius,
  theta,
  phi,
  DEFr,
  userMoved = false,
  framedInterior = false; // compact Frame uses the same near-wall cutaway as CAD edit
function set_DEFr(value) { return DEFr = value; }
function set_tgt(value) { return tgt = value; }
function set_phi(value) { return phi = value; }
function set_theta(value) { return theta = value; }
function set_radius(value) { return radius = value; }
function set_framedInterior(value) { return framedInterior = value; }
function set_userMoved(value) { return userMoved = value; }
// person "walk" mode — first-person (fpv) or third-person (tpv)
var EYE_H = 165, // eye height (cm) above the floor
  BODY_H = 172; // avatar total height (cm)
function set_EYE_H(value) { return EYE_H = value; }
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
function set_walkControls(value) { return walkControls = value; }
function set_avatar(value) { return avatar = value; }
function set_freeMove(value) { return freeMove = value; }
function set_keys(value) { return keys = value; }
function set_pitch(value) { return pitch = value; }
function set_tpDist(value) { return tpDist = value; }
function set_walk(value) { return walk = value; }
function set_walkFloorPending(value) { return walkFloorPending = value; }
function set_walkPos(value) { return walkPos = value; }
function set_walkView(value) { return walkView = value; }
function set_yaw(value) { return yaw = value; }

let cameraBoom = 230, cameraAt = 0;
function set_cameraAt(value) { return cameraAt = value; }
function set_cameraBoom(value) { return cameraBoom = value; }
let cameraSweep = null;
function set_cameraSweep(value) { return cameraSweep = value; }

/* ---- garden round a dollhouse (js/site_dressing.js) ----
   Paving apron, clipped hedges with gaps at the outside doors, a tree at each
   lawn corner. Only for the dollhouse view, and never over real site imagery:
   the aerial and street view ARE the surroundings. Tagged role "site" so the
   exporters can leave it out. */
var siteDressRef = null;
function set_siteDressRef(value) { return siteDressRef = value; }

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
function set_shadowRoot(value) { return shadowRoot = value; }
var buildingShadowWalls = false; // cutH() reports no cut while the full-height shadow walls build
function set_buildingShadowWalls(value) { return buildingShadowWalls = value; }
var shadowStandIns = new WeakMap(); // wall group -> its shadow-only copy (see-through walls)
function set_shadowStandIns(value) { return shadowStandIns = value; }
/* The wall tops at the cut, as their own mesh in the cap colour: the crisp
   white (or black) band a presentation cutaway draws along every wall. Taken
   from the wall's OWN top faces, so mitres and opening gaps are exact. */
var CAP_COLORS = { white: 0xf6f4ef, dark: 0x2a2826 };

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
function set_windowLights(value) { return windowLights = value; }
var roomBounce = null; // the one light carrying each room's bounce, see fitBounceLights
function set_roomBounce(value) { return roomBounce = value; }
var lightLoop = null; // the loop drawing every light that casts no shadow, see js/light_loop.js
function set_lightLoop(value) { return lightLoop = value; }

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
function set_itemsRoot(value) { return itemsRoot = value; }
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
function set_mepRoot(value) { return mepRoot = value; }
function set_structureRoot(value) { return structureRoot = value; }

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
var selectionBoundsCache = null;
function set_selectionBoundsCache(value) { return selectionBoundsCache = value; }
/* The camera half of TRAA's velocity (build3D): this frame's and the last
   painted frame's unjittered view-projection. Called outside render(), where
   TRAA has already taken its sub-pixel jitter back off the projection. */
var velUniforms = null;
function set_velUniforms(value) { return velUniforms = value; }
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

var reusableWalls = new Map();
function set_reusableWalls(value) { return reusableWalls = value; }

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
function set_bounceRooms(value) { return bounceRooms = value; }
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

/* ---- shadow sets built ahead of the handoff ----
   Which lights cast is part of every lit shader's key, and the day's and
   the night's casters cannot share one shader (16 textures a stage). So
   dusk (the window shadows hand over to the ceiling lamps), sunset (the sun
   stops casting) and dawn each built their shaders the first time they
   came, ~850 ms with the page frozen; repeats are cheap (retainShaderCaches).

   So once the view has been idle a few seconds, the shaders of the other
   sets are built ahead. The lights take each set in turn and three's
   compileAsync builds one mesh's shaders at a time, yielding between the
   stages of each build (~6 slices of a ~450 ms shader). Two things make
   them the shaders the frames will ask for: the scene pass's target and MRT
   stay set until the build is done (the output code depends on them), and
   the render context is the one the scene pass draws in, at its call depth
   (three keys every shader on it; compileAsync alone takes depth 0, which
   no planner frame uses). Nothing is drawn meanwhile, so the temporary set
   never shows. Anything that wants a frame (input, a time change, an edit)
   ends the run after the build in flight, with the hour's own lights back.
   The shadow maps' own depth shaders are not built this way; those are the
   cheap part of a handoff. */
var prewarmPass = null; // the scene pass: its target, MRT and call depth key the shaders
function set_prewarmPass(value) { return prewarmPass = value; }
var prewarmDue = 0; // when to start (performance.now), 0 for nothing to do
function set_prewarmDue(value) { return prewarmDue = value; }
var prewarmRun = null; // the run in progress
function set_prewarmRun(value) { return prewarmRun = value; }
var PREWARM_IDLE_MS = 3000;
var starsWarm = false; // the star field's shader is built (see startPrewarm)
function set_starsWarm(value) { return starsWarm = value; }
var SHADOW_SETS = [
  { night: false, sun: true }, // day: the sun and the windows
  { night: true, sun: true }, // dusk and dawn: the sun and the ceiling lamps
  { night: true, sun: false }, // night: the ceiling lamps
];

var overviewRadiusLimit = 4000;
function set_overviewRadiusLimit(value) { return overviewRadiusLimit = value; }

/* Where the cut opens towards: the selected room's middle or the selected
   pieces, while that point is on screen; the orbit target otherwise. */
var seeAimV = null;
function set_seeAimV(value) { return seeAimV = value; }

/* ---- the stub ----
   The knee-high wall a cut wall leaves in the "stub" style, built by the same
   wall builder the dollhouse cut uses (cutH() answers STUB_HEIGHT while it
   runs), so doors stay open gaps, windows sit above it and its top gets the
   cut cap. Built the first time a wall is cut, into stubRoot under
   structureRoot so the structure layer's hide and ghost reach it; it has no
   tags of its own, so picking, physics and export pass it by. */
/* wall group -> its stub. Not userData: Object3D.copy deep-copies userData
   through JSON, so a stub kept there was serialized whole (meshes, materials,
   textures as PNG) by every clone of its wall, 1-2 s in the inspector preview. */
var seeStubs = new WeakMap();
var stubRoot = null,
  stubBuildH = 0,
  wallBuildArgs = {}; // wall id -> [colour, texture] it was built with
function set_stubRoot(value) { return stubRoot = value; }
function set_wallBuildArgs(value) { return wallBuildArgs = value; }
function set_stubBuildH(value) { return stubBuildH = value; }

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

/* The first faded wall used to stall the view for seconds: every wall material
   needs a transparent variant, and the GPU compiled them all on the frame the
   fade began. While the Faded style is chosen, this builds one variant per
   kind of wall material ahead of time, asynchronously, on tiny stand-in meshes
   that stay in the scene (a pipeline lives only while something uses it). */
var warmRoot = null,
  warmKeys = new Set(),
  warmGeo = null,
  warmQueued = false;
function set_warmGeo(value) { return warmGeo = value; }
function set_warmQueued(value) { return warmQueued = value; }
function set_warmRoot(value) { return warmRoot = value; }

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
function set_navFocus(value) { return navFocus = value; }
function set_navHover(value) { return navHover = value; }
function set_navKeys(value) { return navKeys = value; }
function set_navFwd(value) { return navFwd = value; }
function set_navRay(value) { return navRay = value; }
function set_navRight(value) { return navRight = value; }
function set_navUp(value) { return navUp = value; }
function set_navHit(value) { return navHit = value; }
function set_navPlane(value) { return navPlane = value; }
function set_tgtTween(value) { return tgtTween = value; }

/* ---- 3D edit mode: drag furniture straight in the perspective view ----
   The view keeps doing what a view does — pick a piece under the cursor, turn
   the pointer into a world position — and hands every model change to
   interaction.js, so a piece dragged here snaps, stacks and undoes exactly as
   it does on the plan. interaction.js imports this module, so it is pulled in
   lazily (on the first toggle) rather than statically: an import cycle here
   would be evaluated while the scene module is still half-built. */
var editMod = null, // interaction.js once loaded
  editDrag = null; // { it, off, plane, mode, y0, elev0 }
function set_editDrag(value) { return editDrag = value; }
function set_editMod(value) { return editMod = value; }

/* ---- CAD-style view-orientation gizmo (axis triad + click-to-snap views) ----
   A small SVG triad in the corner of the 3D view. It re-projects the world X/Y/Z
   axes through the live camera each frame so it always shows the current
   orientation; clicking an axis nub (or the centre = home/iso) snaps the camera
   to that standard view, like a CAD ViewCube. */
var gizmoEl = null, gizmoAxes = [], gzCompass = null, gzTmpV = null, gzTmpM = null, viewTween = null;
function set_gizmoAxes(value) { return gizmoAxes = value; }
function set_gizmoEl(value) { return gizmoEl = value; }
function set_gzCompass(value) { return gzCompass = value; }
function set_gzTmpM(value) { return gzTmpM = value; }
function set_gzTmpV(value) { return gzTmpV = value; }
function set_viewTween(value) { return viewTween = value; }
var AXIS_DEFS = [
  { key: "+x", dir: [1, 0, 0], col: "#e0564f", label: "X", pos: true },
  { key: "-x", dir: [-1, 0, 0], col: "#e0564f", label: "", pos: false },
  { key: "+y", dir: [0, 1, 0], col: "#3fa34d", label: "Y", pos: true },
  { key: "-y", dir: [0, -1, 0], col: "#3fa34d", label: "", pos: false },
  { key: "+z", dir: [0, 0, 1], col: "#4f8cf6", label: "Z", pos: true },
  { key: "-z", dir: [0, 0, -1], col: "#4f8cf6", label: "", pos: false },
];
var GZ = { size: 84, cx: 42, cy: 42, R: 20 };

// Sun by time-of-day + house north bearing; updates sky, ambient and lamp brightness.
// Prefilter a 3-stop equirect gradient (zenith→horizon→ground) into scene.environment.
// Called from applyEnv whenever the sky colors change (not per-frame — PMREM is costly).
var lastSkyKey = null;
function set_lastSkyKey(value) { return lastSkyKey = value; }
var lastEnvKey = null; // skip the costly PMREM re-prefilter when the sky palette is unchanged
function set_lastEnvKey(value) { return lastEnvKey = value; }
var hdrSkyTex = null; // the half-float sky that is prefiltered into envRT
function set_hdrSkyTex(value) { return hdrSkyTex = value; }

/* A game mode overwrites the whole rig — sun, hemisphere, environment map,
   exposure, and every practical in the house. applyEnv() above is the one
   place the planner's daylight lands, and it runs on its own schedule (the
   initial build finishes it AFTER the mode has already graded the scene, which
   is how The Floor is Lava came up as a bright showroom). Whoever is holding a
   grade registers here and re-applies at the end of every relight; nothing in
   this file needs to know which mode that is. */
var relightHooks = [];

var lastViewWidth = 0, lastViewHeight = 0, lastViewRatio = 0;
function set_lastViewHeight(value) { return lastViewHeight = value; }
function set_lastViewRatio(value) { return lastViewRatio = value; }
function set_lastViewWidth(value) { return lastViewWidth = value; }

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

const view3dLocals = {
  el: undefined, lx: undefined, ly: undefined, tm: undefined, ld: undefined, cx0: undefined,
  cy0: undefined, tapT: undefined, tapX: undefined, tapY: undefined, d2: undefined, cen: undefined,
};

function build3D() {
  view3dLocals.d2 = d2;
  view3dLocals.cen = cen;
  setupRendererAndShadows();
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
  view3dLocals.el.addEventListener(
    "touchstart",
    function (e) {
      userMoved = true;
      if (e.touches.length === 1) {
        view3dLocals.tm = 1;
        view3dLocals.lx = e.touches[0].clientX;
        view3dLocals.ly = e.touches[0].clientY;
        /* Edit mode gets first refusal on a single finger, exactly as it does
           on a left press: with no piece under the finger editDown declines
           and the touch orbits as before. editDown reads button/altKey/shiftKey,
           which a Touch does not carry — a plain object supplies the mouse
           defaults (a second finger is how you pan, so nothing is lost). */
        if (
          legacyTouchEdit &&
          editDown({
            clientX: view3dLocals.lx,
            clientY: view3dLocals.ly,
            button: 0,
            shiftKey: false,
            altKey: false,
          })
        ) {
          view3dLocals.tm = 3; // dragging a piece: neither orbit nor pinch until it is let go
          e.preventDefault();
        }
      } else if (e.touches.length >= 2) {
        view3dLocals.tm = 2;
        view3dLocals.ld = (0, view3dLocals.d2)(e);
        var c = (0, view3dLocals.cen)(e);
        view3dLocals.cx0 = c.x;
        view3dLocals.cy0 = c.y;
      }
    },
    { passive: false },
  );
  wireRenderLoopAndGestures();
  return true;
}


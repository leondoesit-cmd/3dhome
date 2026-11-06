import { saveLocalProject, loadLocalProject } from "./core/project_store.js";
import { deliverExport } from "./export_delivery.js";
import { normalizeSurvey, normalizeSurveyFeatures } from "./survey.js";
import { normalizeNavigationProfile } from "./navigation_profile.js";
import { roomMeasurements } from "./room_summary.js";
import { resizeSelectedRoom } from "./ui_planning_guide.js";
import { newDocumentKey, normalizeBaselines, normalizeRedesign, mergeBaselineArchives } from "./redesign.js";
import { normalizePlanningGuide } from "./planning_guide.js";
import { displayUnit, fmtLen, writeLen, parseLen, unitLabel, fmtAreaM2, syncDisplayUnitLabels } from "./display_units.js";
import { inferDomainFromElementId } from "./unit_settings.js";
import { activeEditor } from "./pro_shell.js";
// UI controller: property panels, control wiring, ownership tree, save/load.
import { S, uid, fin, hexStr, touchItem3D } from "./state.js";
import {
  roomByKey,
  roomFloor,
  roomName,
  wallGeom,
  detectRooms,
  itemsInRoom,
  nodeDegree,
  wallClearLength,
  wallDimSide,
  jointInfo,
  setWallEnd,
  wallLocFace,
  wallOffsetVec,
  contentBounds,
} from "./geometry.js";
import {
  FURN,
  flabel,
  isLamp,
  lampColor,
  mkItem,
  emptyScene,
  PRICE,
  itemPrice,
  clearVSpanCache,
} from "./furniture.js";
import { defaultApartment } from "./demo_house.js";
import { t, toggleLang, onLangChange } from "./i18n.js";
import { snapshotSmart, loadSmart, ensureSmartHome, syncSmartFromLamp } from "./smarthome.js";
import { pushDevice } from "./smarthome_connect.js";
import { render2D, fitView, wx, wz, dropPoint, updatePlanGizmo, planImageCanvas } from "./plan2d.js";
import { saveLayers } from "./layers.js";
import {
  snapshotNodes, enforceLocks, captureLock, setLocked, isLocked, syncLocks,
  captureClear, syncClears, fitWallClearLength, setWallThicknessPreservingClear,
  relaxLocks, settleWallDim, setWallReference, hangStraightRunOnFace,
} from "./constraint_engine.js";
import { initWarnPanel, renderWarnPanel } from "./ui_warn.js";
import { alignItems, distributeItems, matchRotation } from "./item_align.js";
import {
  applyAutoFace, flushToWall, markManualRot, refaceItem, rotStep, setRotStep,
} from "./item_orient.js";
import { renderParams, addParam, renderRoomCons, runRoomConAction } from "./ui_params.js";
import {
  applyEnv,
  frameView,
  toggleWalk,
  toggleWalkView,
  walkViewMode,
  toggleFreeMove,
  isFreeMove,
  snapshot3D,
  has3D,
  rebuild3D,
  isWalk,
  setQualityPreset,
  toggleEdit3D,
  toggleDrawing3D,
  setDrawingOptions,
} from "./view3d.js";
import { normalizeCutaway } from "./wall_cut.js";
import { loadPhysics, togglePhysics, isPhysicsEnabled, clearDebris, setStrength, toggleHitMode } from "./physics_facade.js";
import {
  setTool,
  deleteSel,
  dupSel,
  openWall,
  openSegment,
  placeOpeningOnSelected,
  addSpace,
  rotateRoom,
  autoArrangeAll,
  startConPick,
  applyNodePairRelation,
  togglePinSelected,
  startOpeningAlignPick,
  filletSelectedWalls,
  chamferSelectedWalls,
  restoreSelectedSharpCorner,
  updateSelectedCornerTreatment,
} from "./interaction.js";
import {
  setWallDrawPreset, setWallDrawFrom, activeWallPresetId, isWallDrawTool,
} from "./wall_draw.js";
import {
  solveWallCons, addWallRelation, addOffset, addEqualSpacing,
  removeCon, flipConDirection, repin, setConReport, setConSuppressed,
  setConValue, addEqualLengthSet, addWallAngle, conLabelText, conUnit,
  addOpeningCentre, addOpeningFromCorner, addOpeningSpacing, pinnedNodes,
  angleSectorAtNode, sectorAngle, setJointAngleTarget, jointAngleLengthImpact,
} from "./wall_constraints.js";
import { placeSquareArm } from "./joint_square.js";
import {
  pushHistory,
  beginHistory,
  commitPending,
  cancelPending,
  undo,
  redo,
  mountHistoryPanel,
  currentHistoryId,
  beginHistoryTransaction,
  commitHistoryTransaction,
  abortHistoryTransaction,
} from "./history.js";
import { usedCustomModels, refreshCatalogSelect } from "./model_catalog.js";
import { loadModeler, modelerNow, projectNeedsBuilder } from "./modeler_launch.js";
import { itemPlaceCommand, executeCommand } from "./commands/index.js";

import { select, fillProps, roomMetaFor, selLamp, refreshMarkerReadout, syncWallEnd, syncWallSide, squarableArm, wallTakeoffRows, wallFlipSymmetric, wallFaceMaterials } from "./ui_props.js";
import {
  updateCost,
  exportCostCSV,
  refreshTree,
  withoutRoomPrompts,
} from "./ui_tree.js";
import { markSaved, getDirtyRevision } from "./persist.js";
import {
  reseat,
  rotateWith,
  descendantsOf,
  orphanChildren,
  normalizeStacks,
  findSupport,
} from "./stack.js";

const UI_COMMAND_HISTORY = Object.freeze({
  current: currentHistoryId,
  begin: beginHistoryTransaction,
  commit: commitHistoryTransaction,
  abort: abortHistoryTransaction,
});
import { loadMEP } from "./mep.js";
import { renderPanel as refreshMEPPanel } from "./ui_mep.js";
import {
  markers, markerItem, markerLabel, attachToMarker, detachMarker,
  placeOnMarker, moveMarker, setMarkerSurface, normalizeMarkers, releaseIfMoved,
  duplicateMarker,
} from "./markers.js";
import { normalizeSlabOpenings, stairVoidFields, applyStairMoveTo } from "./slab_openings.js";
import { floorAbove, addSlabOpeningToFloor, updateStairVoidsOnFloors } from "./floors.js";
import { broadcastPlanOp } from "./plan_sync.js";
import { openLibraryPicker } from "./ui_libpick.js";
import {
  exportParametricProject,
  importParametricProject,
  rebuildProject,
  requestItemDimension,
  applyItemDimension,
} from "./core/project.js";
import { exportSpatialProject } from "./core/spatial_project.js";
import {
  requestCabinetDimension,
  applyCabinetDimension,
} from "./parametric_cabinet.js";
import { ceilingHeight } from "./elevation.js";
import {
  ensureWallTypes,
  flipWall,
  normalizeWall,
  setWallPhase,
  setWallType,
  wallLayers,
  wallMaterialQuantities,
} from "./wall_types.js";
import { normalizeWallKind, normalizeWallProfile, setWallKind } from "./wall_curves.js";
import { wallSchedule, wallScheduleCSV, csvCell } from "./wall_schedule.js";
import { wallFramingTakeoff } from "./wall_framing.js";
import { convertCadToWalls } from "./cad_to_walls.js";
import { convertGeoJsonToWalls } from "./geojson_to_walls.js";
import { normalizeBlueprintReference, syncBlueprintTraceControls } from "./blueprint_trace.js";
import { windowChromePosture } from "./chrome_posture.js";
import { initDropdownMenus } from "./dropdown_menus.js";
import { normalizePlanStyle, planStyle } from "./plan_style.js";
import { initUI } from "./ui/init_ui.js";
export { initUI };

export { select, fillProps, updateCost, exportCostCSV, refreshTree };
// for js/ui/init_ui.js (live bindings: it sees every reassignment)
export {
  UI_COMMAND_HISTORY, applyRoomFloor, bindLength, bindNum, compass, download,
  exportWallScheduleFile, fmtHour, initDrawingPanel, lavaModule,
  loadLavaModule, loadRCModule, loadZombieModule, openWallTypeEditorDialog,
  parseFieldLength, rcModule, restack, saveTextDownload, syncWalkView,
  turnItem, writeFieldLength, zombieModule,
};

var rcModule = null;
function loadRCModule() {
  return rcModule ? Promise.resolve(rcModule) : import("./rc.js").then(function (m) {
    rcModule = m;
    return m;
  });
}

// Night Shift (zombie survival) is lazy-loaded the same way — it pulls in a
// pile of procedural textures/audio nobody needs unless they ask for it.
var zombieModule = null;
function loadZombieModule() {
  return zombieModule
    ? Promise.resolve(zombieModule)
    : import("./zombies.js").then(function (m) {
        zombieModule = m;
        return m;
      });
}

var lavaModule = null;
function loadLavaModule() {
  return lavaModule
    ? Promise.resolve(lavaModule)
    : import("./lava.js").then(function (m) {
        lavaModule = m;
        return m;
      });
}

/* ---- stacking (js/stack.js) from the inspector ----
   Two edits in the inspector move a piece the stack has to follow: its HEIGHT
   (whatever stands on it has to rise or drop with its top) and its ROTATION
   (a stack turns with its host instead of sliding off the corner). Both are
   funnelled through these two so no field can forget one of them. */
/* A stairwell void is bound to its flight by `stairsId`, and usually lives on
   the storey above — so moving the stairs has to reach the active scene AND
   the stored floor scenes. Before this the link was written and never read,
   and the void simply stayed where it was. */
export function syncStairVoids(it) {
  if (!it || it.type !== "stairs" || it.id == null) return false;
  var changed = applyStairMoveTo(S.slabOpenings, it);
  if (updateStairVoidsOnFloors(it, applyStairMoveTo)) changed = true;
  if (changed) S.dirty3D = true;
  return changed;
}
function restack(it) {
  reseat(it);
  syncStairVoids(it);
  descendantsOf(it, new Set([it]), []).forEach(function (c) {
    touchItem3D(c, "move");
  });
}
function turnItem(it, deg) {
  var d = deg - (it.rot || 0);
  it.rot = deg;
  /* Typed or clicked, this angle is the user's. The automatic facing
     (js/item_orient.js) never touches the piece again until "face by
     surroundings" hands it back. */
  markManualRot(it);
  syncStairVoids(it);
  rotateWith(it, d, new Set([it])).forEach(function (c) {
    touchItem3D(c, "move");
  });
}

/* `mode` picks the 3D update this field needs. Fields that only touch the
   SELECTED PIECE take the per-item path — typing in a width box used to rebuild
   the whole scene on every keystroke, which is what made the size fields feel
   like they lagged. Omit it (walls, openings, rooms…) for a full rebuild. */
function bindNum(id, fn, mode, eventName) {
  document.getElementById(id).addEventListener(eventName || "input", function () {
    var v = parseFloat(this.value);
    if (isNaN(v)) return;
    commitPending();
    var normalized = fn(v);
    // A committed field must show the value that was actually accepted. This
    // matters for wall lengths, whose safety bounds used to leave (say) "2"
    // in the box while the model had already been clamped to 5 cm.
    if (fin(normalized)) this.value = normalized;
    if (mode && S.sel && S.sel.kind === "item") touchItem3D(S.sel.ref, mode);
    else S.dirty3D = true;
    render2D();
  });
}

function lengthUnit(idOrEl) {
  var id = typeof idOrEl === "string" ? idOrEl : (idOrEl && idOrEl.id);
  var dom = inferDomainFromElementId(id);
  return displayUnit(dom || "plan");
}

function parseFieldLength(text, idOrEl) {
  var id = typeof idOrEl === "string" ? idOrEl : (idOrEl && idOrEl.id);
  var dom = inferDomainFromElementId(id);
  var cm = parseLen(text, dom || lengthUnit(idOrEl));
  return Number.isFinite(cm) ? cm : NaN;
}

function writeFieldLength(input, cm) {
  if (!input) return;
  writeLen(input, cm);
}

function bindLength(id, fn, mode, eventName) {
  var el = document.getElementById(id);
  if (!el) return;
  el.addEventListener(eventName || "change", function () {
    var v = parseFieldLength(this.value, id);
    if (!Number.isFinite(v)) return;
    commitPending();
    var normalized = fn(v);
    if (fin(normalized)) writeFieldLength(this, normalized);
    if (mode && S.sel && S.sel.kind === "item") touchItem3D(S.sel.ref, mode);
    else S.dirty3D = true;
    render2D();
  });
}

/* ---- plan drawing style (js/plan_style.js) ----
   Switching style repaints the plan only: nothing in the model or the 3D scene
   depends on it. */
export function syncPlanStyleUI() {
  if (typeof document === "undefined") return;
  var cur = planStyle();
  document.querySelectorAll("[data-plan-style]").forEach(function (b) {
    var on = b.getAttribute("data-plan-style") === cur;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
  document.body.classList.toggle("plan-presentation", cur === "presentation");
  var chip = document.querySelector(".plan-style-btn");
  if (chip) chip.setAttribute("aria-pressed", cur === "presentation" ? "true" : "false");
}
export function setPlanStyle(style) {
  var next = normalizePlanStyle(style);
  if (next === planStyle()) return;
  S.planStyle = next;
  syncPlanStyleUI();
  render2D();
}

/* ---- dollhouse cutaway (js/wall_cut.js) ----
   A view setting that saves with the scene, like the plan style. Every change
   rebuilds the walls, since the cut is geometry. */
export function syncCutawayUI() {
  if (typeof document === "undefined") return;
  var c = normalizeCutaway(S.cutaway);
  var cb = document.getElementById("cb_cutaway");
  if (cb) cb.checked = c.on;
  var opts = document.getElementById("cutawayOpts");
  if (opts) opts.hidden = !c.on;
  var h = document.getElementById("cutawayH");
  if (h && document.activeElement !== h) h.value = String(c.height);
  var out = document.getElementById("cutawayHOut");
  if (out) out.textContent = fmtLen(c.height);
  document.querySelectorAll("[data-cut-cap]").forEach(function (b) {
    var on = b.getAttribute("data-cut-cap") === c.cap;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on ? "true" : "false");
  });
  var chip = document.getElementById("dollhouseBtn");
  if (chip) chip.setAttribute("aria-pressed", c.on ? "true" : "false");
}
export function setCutaway(patch) {
  S.cutaway = normalizeCutaway(Object.assign({}, S.cutaway, patch || {}));
  syncCutawayUI();
  S.dirty3D = true;
  // the 3D view's Walls switch (js/ui_wall_view.js) shows the same bit
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("walls3d:changed"));
}

/* ---- persistence: one serializer shared by localStorage save and file export ---- */
// exported: the multiplayer visit flow (js/visit.js) snapshots/restores scenes
export function sceneObject(includeWorkspace) {
  var data = {
    idc: S.idc,
    spatial: exportSpatialProject(S),
    wallDrawDefaults: S.wallDrawDefaults,
    floorTex: S.floorTex,
    wallColor: S.wallColor,
    showCeiling: S.showCeiling,
    invisibleRoof: S.invisibleRoof,
    roof: S.roof,
    showDims: S.showDims,
    interiorDims: S.interiorDims,
    planStyle: S.planStyle,
    cutaway: S.cutaway,
    // acknowledged constraint warnings (js/constraint_engine.js) — an
    // "ignore this one" is a decision about the design, so it travels with it
    ignoredWarnings: S.ignoredWarnings,
    hour: S.hour,
    northAngle: S.northAngle,
    planRot: S.planRot,
    viewAxis: S.viewAxis,
    // real-world site params (lat/lon/zoom/overlay settings + fetched
    // footprint). Imagery itself is re-fetched on load, not stored.
    site: S.site,
    blueprintTrace: S.blueprintTrace,
    // MEP infrastructure networks (electrical/water/drain/comms) + view flags
    mep: S.mep
      ? {
          nodes: S.mep.nodes,
          runs: S.mep.runs,
          circuits: S.mep.circuits,
          branches: S.mep.branches,
          profile: S.mep.profile,
          show: S.mep.show,
          show3D: S.mep.show3D,
          xray: typeof S.mep.xray === "object" ? S.mep.xray : { walls: !!S.mep.xray, floor: false, ceiling: false },
          snapAngle: S.mep.snapAngle,
          wallRoute: S.mep.wallRoute,
          animate: S.mep.animate,
          layer: S.mep.layer,
          routePolicy: S.mep.routePolicy,
          vis: S.mep.vis,
          layerVis: S.mep.layerVis,
        }
      : undefined,
    smarthome: snapshotSmart(ensureSmartHome()),
    // embed custom-model definitions the scene uses, so exported files are
    // self-contained and load on machines without this browser's model library
    customModels: usedCustomModels(S.items),
    parametric: exportParametricProject(S),
  };
  if (includeWorkspace !== false && S.workspace) {
    // Keep the active floor current whenever any existing save/export path runs.
    var active = (S.workspace.floors || []).find(function (f) {
      return f.id === S.workspace.activeFloor;
    });
    if (active) active.scene = JSON.parse(JSON.stringify(data));
    data.workspace = S.workspace;
  }
  return data;
}
export function serialize() {
  return JSON.stringify(sceneObject(true));
}
export function applyData(d) {
  // Accept either a parsed object or a raw JSON string (project store, visit
  // restore, and a few call sites pass one or the other). Reject anything else
  // up front so a corrupt import cannot partially wipe the live scene.
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch (err) {
      throw new Error("Invalid scene JSON");
    }
  }
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    throw new Error("Invalid scene data");
  }
  if(d.spatial)d={...d,nodes:d.spatial.nodes,walls:d.spatial.walls,wallTypes:d.spatial.wallTypes,openings:d.spatial.openings,items:d.spatial.instances,markers:d.spatial.markers,slabOpenings:d.spatial.slabOpenings,annotations:d.spatial.annotations,surveyFeatures:d.spatial.surveyFeatures,roomMeta:d.spatial.rooms,cabinetPresets:d.spatial.cabinetPresets,wallCons:d.spatial.wallCons,roomCons:d.spatial.roomCons,planVars:d.spatial.planVars};
  return applyDataRequest(d, ++applyRequestGeneration);
}

/* A request gets its place in the ordering before it can wait for the lazily
   loaded custom-model builder. Two requests may wait on the same import; the
   newest request, rather than the first promise callback registered, owns the
   right to commit once that import completes. */
var applyRequestGeneration = 0;
function applyDataRequest(d, requestGeneration) {
  /* Custom models must register into FURN BEFORE the item filter below, which
     drops anything FURN does not know — register late and a project's custom
     furniture is silently discarded, and serialize() cannot re-embed it either
     (it reads FURN[type].custom). Registering needs the part->geometry builder
     in js/modeler.js, which is no longer on the boot graph.

     So this function applies SYNCHRONOUSLY in every case it can — no custom
     models, or the editor already resident — and returns an already-resolved
     promise. Only a payload whose custom definitions cannot be registered yet
     has to fetch the builder first and start again from the top; the retry is
     safe precisely here, because nothing above this point has mutated S.

     Callers that read S straight after MUST await the result. Everything below
     the early return still runs in the caller's own tick for the common case,
     so a synchronous caller stays correct whenever no fetch was needed. */
  var customDefs = Array.isArray(d.customModels) ? d.customModels : [];
  /* projectNeedsBuilder() looks deeper than customDefs: a multi-storey project
     keeps each floor's definitions nested under workspace.floors[].scene, and
     switchFloor() applies those synchronously with no chance to await. Fetching
     once here, for the whole project, is what keeps every later floor switch
     correct. */
  if (projectNeedsBuilder(d)) {
    var modeler = modelerNow();
    if (!modeler) {
      /* Fetching the builder takes long enough for another scene request to
         arrive. Re-applying an older request then would silently overwrite the
         user's newer choice, so only the latest valid apply request may commit.
         Callers get false for a superseded request. */
      return loadModeler().then(function () {
        if (applyRequestGeneration !== requestGeneration) return false;
        return applyDataRequest(d, requestGeneration);
      });
    }
    var customAdded = 0;
    customDefs.forEach(function (def) { if (modeler.registerCustomModel(def)) customAdded++; });
    if (customAdded) refreshCatalogSelect();
  }
  importParametricProject(S, d.parametric || {});
  if (Array.isArray(d.cabinetPresets)) {
    S.spatial.cabinetPresets = JSON.parse(JSON.stringify(d.cabinetPresets));
  }
  S.nodes = (d.nodes || []).map(function (n) {
    return { x: fin(n && n.x) ? n.x : 0, z: fin(n && n.z) ? n.z : 0 };
  });
  S.wallTypes = Array.isArray(d.wallTypes)
    ? JSON.parse(JSON.stringify(d.wallTypes))
    : [];
  S.wallDrawDefaults = Object.assign(
    { typeId: "generic", kind: "normal", datum: "center", loc: "center", dimSide: 0, from: "center", phase: "new", offsetDist: 120 },
    d.wallDrawDefaults && typeof d.wallDrawDefaults === "object"
      ? d.wallDrawDefaults
      : {},
  );
  S.walls = (d.walls || [])
    .filter(function (w) {
      return w && S.nodes[w.a] && S.nodes[w.b];
    })
    .map(function (w) {
      return {
        id: w.id || uid(),
        a: w.a,
        b: w.b,
        thickness: fin(w.thickness) ? w.thickness : 10,
        height: fin(w.height) ? w.height : 270,
        wallTypeId: typeof w.wallTypeId === "string" ? w.wallTypeId : undefined,
        layers: Array.isArray(w.layers) ? JSON.parse(JSON.stringify(w.layers)) : undefined,
        flip: !!w.flip,
        layersReversed: !!(w.layersReversed || w.reverseLayers || w.flip),
        datum: ({
          outer: "exterior",
          mainOutside: "main-exterior",
          mainInside: "main-interior",
          inner: "interior",
          exterior: "exterior",
          "main-exterior": "main-exterior",
          center: "center",
          "main-interior": "main-interior",
          interior: "interior",
        })[w.datum] || "center",
        kind: ["normal", "roomDivider", "half", "pony", "railing"].indexOf(w.kind) !== -1
          ? w.kind
          : "normal",
        fullHeight: fin(w.fullHeight) ? w.fullHeight : undefined,
        phase: ["existing", "demolition", "demolish", "new"].indexOf(w.phase) !== -1
          ? (w.phase === "demolish" ? "demolition" : w.phase)
          : "new",
        upperWallTypeId: typeof w.upperWallTypeId === "string" ? w.upperWallTypeId : undefined,
        splitHeight: fin(w.splitHeight) ? w.splitHeight : undefined,
        geometry: w.geometry && typeof w.geometry === "object"
          ? JSON.parse(JSON.stringify(w.geometry))
          : undefined,
        profile: w.profile && typeof w.profile === "object"
          ? JSON.parse(JSON.stringify(w.profile))
          : undefined,
        baseProfile: Array.isArray(w.baseProfile)
          ? JSON.parse(JSON.stringify(w.baseProfile))
          : undefined,
        railing: w.railing && typeof w.railing === "object"
          ? JSON.parse(JSON.stringify(w.railing))
          : undefined,
        join: w.join && typeof w.join === "object"
          ? JSON.parse(JSON.stringify(w.join))
          : undefined,
        layerOverrides: Array.isArray(w.layerOverrides)
          ? JSON.parse(JSON.stringify(w.layerOverrides))
          : undefined,
        tex: w.tex || undefined,
        // dimension lock (js/constraint_engine.js). Absent in older files, and
        // absent means LOCKED — syncLocks() captures the measurements below
        // from the geometry that was just loaded.
        lock: w.lock === false ? false : undefined,
        lockL: fin(w.lockL) ? w.lockL : undefined,
        // face-length companion to lockL; older files get it from syncLocks()
        lockClearL: fin(w.lockClearL) ? w.lockClearL : undefined,
        lockAng: fin(w.lockAng) ? w.lockAng : undefined,
        // stated INTERIOR length (js/constraint_engine.js); syncClears() fills
        // it in for older files from the geometry as saved
        clearL: fin(w.clearL) ? w.clearL : undefined,
        // which face the stated length is measured along; absent = decide from
        // the drawing (js/geometry.js wallDimSide)
        dimSide: w.dimSide === 1 || w.dimSide === -1 || w.dimSide === 0
          ? w.dimSide
          : undefined,
        // which line of the wall S.nodes stores (js/geometry.js wallLocFace).
        // Absent = the centreline, which is what every older file means.
        loc: w.loc === "face" || w.loc === "center" ? w.loc : undefined,
        // "the user typed this length" — outranks derived lengths when an
        // over-constrained loop has to pick a wall to yield
        dimUser: w.dimUser ? 1 : undefined,
      };
    });
  S.openings = (d.openings || []).filter(function (o) {
    return o && fin(o.s) && fin(o.width);
  });
  ensureWallTypes(S);
  S.items = (d.items || [])
    .filter(function (it) {
      return (
        it &&
        FURN[it.type] &&
        fin(it.x) &&
        fin(it.z) &&
        fin(it.w) &&
        fin(it.d) &&
        fin(it.h)
      );
    })
    .map(function (it) {
      return {
        id: it.id || uid(),
        type: it.type,
        x: it.x,
        z: it.z,
        w: it.w,
        d: it.d,
        h: it.h,
        rot: fin(it.rot) ? it.rot : 0,
        lightOn: it.lightOn,
        lightI: fin(it.lightI) ? it.lightI : undefined,
        lightColor: fin(it.lightColor) ? it.lightColor : undefined,
        // spotlight shape — written by the inspector's light controls. This
        // mapper is a whitelist, so any new item field must be added here or
        // it silently vanishes on load/import.
        spot: it.spot ? true : undefined,
        cone: fin(it.cone) ? it.cone : undefined,
        pitch: fin(it.pitch) ? it.pitch : undefined,
        // mounting height (world Y of the piece's bottom) — set when the piece
        // stands on a placeholder point that is up a wall or on the ceiling
        elev: fin(it.elev) ? it.elev : undefined,
        // the piece this one STANDS ON (js/stack.js). `elev` above is derived
        // from it and re-derived on load, so the link is the durable half.
        on: it.on != null ? it.on : undefined,
        /* The wall this piece is held flush against (js/item_align.js), so a
           kitchen run pushed against a wall is still against it after the file
           is reopened — and after that wall is later moved. */
        hold: it.hold && it.hold.wall != null
          ? {
              wall: it.hold.wall,
              gap: Number(it.hold.gap) || 0,
              side: it.hold.side === -1 ? -1 : 1,
            }
          : undefined,
        /* The angle was set by hand, so the automatic facing must keep its
           hands off it — a fact about the design, not about this session.
           (This mapper is a whitelist: without the line the flag is lost and
           a reopened plan starts re-turning pieces the user had aimed.) */
        rotUser: it.rotUser ? 1 : undefined,
        locked: !!it.locked,
        groupId: it.groupId,
        // the piece's style variant (see furniture.js) — a plain id
        variant: typeof it.variant === "string" ? it.variant : undefined,
        /* A modular cabinet's whole design lives in `it.cab` (cabinet.js): its
           division, its fronts, the sheet each material role is bought as. It is
           plain JSON, and `normalizeSpec` re-validates whatever arrives here on
           first use, so a spec from an older file heals itself rather than
           throwing. Without this line a saved cabinet came back as the default
           preset for its size — the design, the materials and the price with it. */
        cab: it.cab && typeof it.cab === "object" ? it.cab : undefined,
        definitionId: typeof it.definitionId === "string" ? it.definitionId : undefined,
        parameterOverrides: it.parameterOverrides && typeof it.parameterOverrides === "object" ? it.parameterOverrides : undefined,
        materialOverrides: it.materialOverrides && typeof it.materialOverrides === "object" ? it.materialOverrides : undefined,
        configuration: it.configuration && typeof it.configuration === "object" ? it.configuration : undefined,
        runtimeState: it.runtimeState && typeof it.runtimeState === "object" ? it.runtimeState : undefined,
        // live smart-home state (lights / climate / appliances). Bindings live
        // on S.smarthome; this is the per-piece on/brightness/setpoint snapshot.
        smart: it.smart && typeof it.smart === "object" ? it.smart : undefined,
      };
    });
  // after S.items is final: a point whose object did not survive the filter
  // above simply loads as a free point
  S.markers = normalizeMarkers(d.markers, S.items);
  S.slabOpenings = normalizeSlabOpenings(d.slabOpenings);
  S.annotations = Array.isArray(d.annotations) ? d.annotations.filter(a => a && typeof a.kind === "string" && Number.isFinite(a.x) && Number.isFinite(a.z)) : [];
  S.surveyFeatures=normalizeSurveyFeatures(d.surveyFeatures);
  // …and a piece whose host did not survive simply loads on the floor. Mount
  // heights of stacked pieces are re-derived here rather than trusted, so a
  // file written before a model's shape changed still stacks correctly.
  normalizeStacks();
  rebuildProject(S, FURN);
  S.idc = d.idc || 1000;
  if (d.workspace && typeof d.workspace === "object") {
    const previousWorkspace = S.workspace;
    S.workspace = { ...d.workspace, survey:normalizeSurvey(d.workspace.survey), navigationProfile:normalizeNavigationProfile(d.workspace.navigationProfile), guidance: normalizePlanningGuide(d.workspace.guidance) };
    S.workspace.documentKey = typeof d.workspace.documentKey === "string" && d.workspace.documentKey ? d.workspace.documentKey : newDocumentKey();
    S.workspace.baselines = normalizeBaselines(d.workspace.baselines);
    if (previousWorkspace?.documentKey === S.workspace.documentKey)
      S.workspace.baselines = mergeBaselineArchives(previousWorkspace.baselines, S.workspace.baselines);
    S.workspace.redesign = normalizeRedesign(d.workspace.redesign, S.workspace.baselines);
    if (!Array.isArray(S.workspace.floors)) S.workspace.floors = [];
    if (!Array.isArray(S.workspace.constraints)) S.workspace.constraints = [];
    if (!Array.isArray(S.workspace.comments)) S.workspace.comments = [];
    if (!S.workspace.role) S.workspace.role = "owner";
    if (!S.workspace.quality) S.workspace.quality = "auto";
    document.body.dataset.projectRole = S.workspace.role;
    setQualityPreset(S.workspace.quality);
  }
  if (!d.workspace) S.workspace = { ...S.workspace, documentKey: newDocumentKey(), baselines: Object.freeze([]), redesign: {}, survey:normalizeSurvey(null), navigationProfile:normalizeNavigationProfile(), guidance: normalizePlanningGuide(null) };
  if (d.floorTex) {
    S.floorTex = d.floorTex;
    var floorsel = document.getElementById("floorsel");
    if (floorsel) floorsel.value = S.floorTex;
  }
  if (fin(d.wallColor)) {
    S.wallColor = d.wallColor;
    var wallcol = document.getElementById("wallcol");
    if (wallcol) wallcol.value = hexStr(S.wallColor);
  }
  S.invisibleRoof = d.invisibleRoof === true;
  S.roof = d.roof && typeof d.roof === "object" ? d.roof : null;
  var cbRoof = document.getElementById("cb_invisible_roof");
  if (cbRoof) cbRoof.checked = S.invisibleRoof;
  window.dispatchEvent(new Event("planner-navigation-restored"));
  if (d.showCeiling != null) {
    S.showCeiling = d.showCeiling;
    var cbCeil = document.getElementById("cb_ceil");
    if (cbCeil) cbCeil.checked = S.showCeiling;
  }
  if (d.showDims != null) {
    S.showDims = d.showDims;
    var cbDims = document.getElementById("cb_dims");
    if (cbDims) cbDims.checked = S.showDims;
  }
  if (d.interiorDims != null) {
    S.interiorDims = !!d.interiorDims;
    var cbIn = document.getElementById("cb_interior");
    if (cbIn) cbIn.checked = S.interiorDims;
  }
  // a file saved before plan styles existed opens as the technical plan
  S.planStyle = normalizePlanStyle(d.planStyle);
  syncPlanStyleUI();
  S.cutaway = normalizeCutaway(d.cutaway);
  syncCutawayUI();
  S.roomStamp=null;S.placeType=null;S.drawing=false;S.drawFrom=null;S.arcDraft=null;S.rectDraft=null;S.biteDraft=null;S.offsetDraft=null;S.joinPick=null;S.previewPt=null;S.action=null;S.drag=null;
  S.roomMeta = d.roomMeta || {};
  S.wallCons = Array.isArray(d.wallCons) ? JSON.parse(JSON.stringify(d.wallCons)) : [];
  S.roomCons = Array.isArray(d.roomCons) ? JSON.parse(JSON.stringify(d.roomCons)) : [];
  S.planVars = Array.isArray(d.planVars) ? JSON.parse(JSON.stringify(d.planVars)) : [];
  S.ignoredWarnings =
    d.ignoredWarnings && typeof d.ignoredWarnings === "object"
      ? d.ignoredWarnings
      : {};
  S.warnHover = S.warnSel = null;
  S.conHover = null;
  // an older file has no captured measurements — hold what it was saved with
  syncLocks();
  syncClears(); // ...and holds the interior spans it was drawn with
  if (fin(d.hour)) S.hour = d.hour;
  if (fin(d.northAngle)) S.northAngle = d.northAngle;
  S.planRot = fin(d.planRot) ? d.planRot : 0;
  S.viewAxis = d.viewAxis || "top";
  S.blueprintTrace = normalizeBlueprintReference(d.blueprintTrace);
  syncBlueprintTraceControls();
  updatePlanGizmo();
  if (d.site && typeof d.site === "object") {
    // merge onto defaults so older files without newer fields stay valid
    S.site = Object.assign({}, S.site, d.site);
    // let the site panel resync + re-fetch imagery (decoupled to avoid a
    // circular import between ui.js and ui_site.js)
    window.dispatchEvent(new CustomEvent("site:reload"));
  }
  loadMEP(d.mep);
  refreshMEPPanel();
  loadSmart(d.smarthome);
  if (typeof window.__renderSmartHome === "function") window.__renderSmartHome();
  syncEnvUI();
  // rebuild the rooms/items tree — this also drives updateCost(), so without it
  // the panel keeps showing the PREVIOUS scene's rooms and price after a
  // load/import/visit. A loaded plan's rooms already exist, so no new-room
  // prompts for them.
  withoutRoomPrompts(refreshTree);
  select(null);
  S.dirty3D = true;
  fitView();
  render2D();
  frameView();
  applyEnv();
  window.__plannerChrome?.renderFloorTabs();
  window.dispatchEvent(new CustomEvent("planner-units"));
  // Already applied — resolved, so `await applyData(...)` costs a microtask and
  // nothing else. Only the builder-fetch path above is genuinely asynchronous.
  return Promise.resolve(true);
}
function download(name, url) {
  var a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Toast notifications (top-center, stacking, theme-aware). Every module's
// feedback goes through here, so the 2D hint bar stays a hint bar.
var toastRoot = null;
/* Global structure lock (the plan's padlock). Selecting a wall, corner, room
   or opening still works — only DRAGGING them is refused — so the lock can be
   left on for the whole furnishing pass without hiding the structure. */
export function setLockStruct(on) {
  S.lockStruct = !!on;
  var b = document.getElementById("lockStructBtn");
  if (b) {
    b.classList.toggle("active", S.lockStruct);
    var i = b.querySelector("i");
    if (i)
      i.className =
        "ph " + (S.lockStruct ? "ph-lock-simple" : "ph-lock-simple-open");
  }
  flash(t(S.lockStruct ? "lock_on" : "lock_off"), S.lockStruct ? "success" : null);
  /* S.lockStruct is a live accessor onto S.layers.structure.locked
     (js/state.js), so this button and the structure chip write the same bit.
     Persist it like any other layer preference and announce it: js/ui_layers.js
     re-syncs the chips off `layers:changed`, and js/view3d.js listens for the
     same event to re-apply layer state to the 3D roots. */
  saveLayers();
  window.dispatchEvent(new CustomEvent("layers:changed"));
  render2D();
  return S.lockStruct;
}

// 3D edit mode: drag pieces straight in the perspective view
export function setEdit3D(on) {
  var st = toggleEdit3D(!!on);
  var b = document.getElementById("edit3dBtn");
  if (b) b.classList.toggle("active", st);
  flash(t(st ? "edit3d_on" : "edit3d_off"), st ? "success" : null);
  return st;
}

/* Some gestures try an edit, measure it, and throw it away (see bestSquare).
   A discarded attempt must not announce itself, so the toasts raised inside one
   are dropped and the caller says what actually happened. */
var quiet = 0;
export function quietly(fn) {
  quiet++;
  try {
    return fn();
  } finally {
    quiet--;
  }
}

/* `action` ({ label, run }) adds one button to the toast — an immediate way to
   take back what the message announces — and keeps it up a little longer so
   there is time to reach for it. Returns a function that takes the toast down
   early, for a prompt that the user has just answered. */
export function flash(msg, kind, action) {
  if (quiet) return function () {};
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.id = "toast-root";
    toastRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRoot);
  }
  while (toastRoot.children.length >= 3) toastRoot.firstChild.remove();
  /* The stylesheet's top clears only the top bar; under the ribbon a toast
     covered the very tools it was talking about. */
  var ribbon = document.getElementById("pro-ribbon");
  var ribbonBottom = ribbon && ribbon.offsetParent ? ribbon.getBoundingClientRect().bottom : 0;
  toastRoot.style.top = ribbonBottom > 64 ? Math.round(ribbonBottom + 8) + "px" : "";
  var el = document.createElement("div");
  el.className = "toast" + (kind === "error" ? " toast-error" : kind === "success" ? " toast-success" : "");
  var ic =
    kind === "error"
      ? "ph-warning-circle"
      : kind === "success"
        ? "ph-check-circle"
        : "ph-info";
  el.innerHTML = '<i class="ph ' + ic + '"></i><span></span>';
  el.querySelector("span").textContent = msg;
  var gone = false;
  function dismiss() {
    if (gone) return;
    gone = true;
    el.classList.remove("on");
    setTimeout(function () {
      el.remove();
    }, 300);
  }
  if (action && action.label && typeof action.run === "function") {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-act";
    btn.textContent = action.label;
    btn.addEventListener("click", function () {
      dismiss();
      action.run();
    });
    el.appendChild(btn);
  }
  toastRoot.appendChild(el);
  requestAnimationFrame(function () {
    el.classList.add("on");
  });
  setTimeout(dismiss, action ? 4500 : 2400);
  return dismiss;
}

// Minimal shared modal on the .bp-overlay/.bp-modal theme classes.
// Returns {overlay, modal, body, actions, close, onClose}; Escape / backdrop click close it.
export function openModal(titleText) {
  document.querySelectorAll(".bp-overlay").forEach(function (o) {
    if (o.parentNode) o.parentNode.removeChild(o);
  });
  var overlay = document.createElement("div");
  overlay.className = "bp-overlay";
  var modal = document.createElement("div");
  modal.className = "bp-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  if (titleText) modal.setAttribute("aria-label", titleText);
  var head = document.createElement("div");
  head.className = "modal-head-row";
  var h = document.createElement("h3");
  h.textContent = titleText;
  head.appendChild(h);
  var closeX = document.createElement("button");
  closeX.type = "button";
  closeX.className = "modal-close-x";
  closeX.setAttribute("aria-label", "Close");
  closeX.textContent = "×";
  closeX.addEventListener("click", function () { close(); });
  head.appendChild(closeX);
  var body = document.createElement("div");
  body.style.display = "flex";
  body.style.flexDirection = "column";
  body.style.gap = "12px";
  var actions = document.createElement("div");
  actions.className = "bp-btnrow";
  modal.appendChild(head);
  modal.appendChild(body);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  var closeHandlers = [];
  function close() {
    document.removeEventListener("keydown", onKey);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    for (var i = 0; i < closeHandlers.length; i++) {
      try { closeHandlers[i](); } catch (e) {}
    }
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  overlay.addEventListener("mousedown", function (e) {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("pointerdown", function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
  return {
    overlay: overlay,
    modal: modal,
    body: body,
    actions: actions,
    close: close,
    onClose: function (fn) {
      if (typeof fn === "function") closeHandlers.push(fn);
    }
  };
}

function saveTextDownload(name, textValue, mime) {
  var blob = new Blob(["\ufeff" + textValue], { type: mime || "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

/* Project-local wall assembly editor. Built-ins are installed as editable
   copies in the project, so changes and new types travel with JSON/floors and
   never depend on this browser's local storage. */
function openWallTypeEditorDialog() {
  ensureWallTypes(S);
  var english = document.documentElement.lang === "en";
  var dialog = openModal(english ? "Wall type assemblies" : "טיפוסי ומבני קיר");
  var draftTypes = JSON.parse(JSON.stringify(S.wallTypes));
  var picker = document.createElement("select"), name = document.createElement("input"), category = document.createElement("input"), layers = document.createElement("div");
  name.placeholder = english ? "Type name" : "שם הטיפוס";
  category.placeholder = english ? "Category" : "קטגוריה";
  layers.className = "wall-type-layer-editor";
  function fillPicker(wanted) {
    picker.innerHTML = "";
    draftTypes.forEach(function (type) {
      var option = document.createElement("option"); option.value = type.id; option.textContent = type.name; picker.appendChild(option);
    });
    picker.value = wanted || (S.sel && S.sel.kind === "wall" && S.sel.ref.wallTypeId) || "generic";
  }
  function current() { return draftTypes.find(function (type) { return type.id === picker.value; }); }
  function renderType() {
    var type = current(); if (!type) return;
    name.value = type.name; category.value = type.category || "custom"; layers.innerHTML = "";
    type.layers.forEach(function (layer, index) {
      var row = document.createElement("div"); row.className = "wall-type-layer-row";
      var material = document.createElement("input"); material.value = layer.material || layer.role || "generic"; material.title = english ? "Material" : "חומר";
      var thickness = document.createElement("input"); thickness.type = "number"; thickness.min = ".1"; thickness.step = ".1"; thickness.value = layer.thickness; thickness.title = english ? "Thickness (cm)" : "עובי (ס״מ)";
      var color = document.createElement("input"); color.type = "color"; color.value = /^#[0-9a-f]{6}$/i.test(layer.color || "") ? layer.color : "#d8d3c8";
      var main = document.createElement("input"); main.type = "radio"; main.name = "wall-main-layer"; main.checked = !!layer.main; main.title = english ? "Main layer" : "שכבה ראשית";
      var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.disabled = type.layers.length <= 1;
      material.addEventListener("input", function () { layer.material = this.value; layer.role = layer.role || "layer"; });
      thickness.addEventListener("input", function () { var value = Number(this.value); if (value > 0) layer.thickness = value; });
      color.addEventListener("input", function () { layer.color = this.value; });
      main.addEventListener("change", function () { type.layers.forEach(function (entry, i) { entry.main = i === index; }); renderType(); });
      remove.addEventListener("click", function () { type.layers.splice(index, 1); if (!type.layers.some(function (entry) { return entry.main; })) type.layers[0].main = true; renderType(); });
      row.append(material, thickness, color, main, remove); layers.appendChild(row);
    });
  }
  fillPicker(); picker.addEventListener("change", renderType);
  name.addEventListener("input", function () { var type = current(); if (type) type.name = this.value.slice(0, 80); });
  category.addEventListener("input", function () { var type = current(); if (type) type.category = this.value.slice(0, 40); });
  var addLayer = document.createElement("button"); addLayer.type = "button"; addLayer.textContent = english ? "+ Add layer" : "+ הוסף שכבה";
  addLayer.addEventListener("click", function () { var type = current(); if (!type) return; type.layers.push({ id: "layer-" + Date.now().toString(36), thickness: 2, material: "finish", color: "#ded9cc", role: "finish", main: false }); renderType(); });
  var duplicate = document.createElement("button"); duplicate.type = "button"; duplicate.textContent = english ? "Duplicate as custom" : "שכפל כטיפוס מותאם";
  duplicate.addEventListener("click", function () {
    var source = current(); if (!source) return;
    var copy = JSON.parse(JSON.stringify(source)), base = "custom-" + Date.now().toString(36), id = base, n = 2;
    while (draftTypes.some(function (type) { return type.id === id; })) id = base + "-" + n++;
    copy.id = id; copy.name = source.name + (english ? " copy" : " — עותק"); copy.category = "custom"; draftTypes.push(copy); fillPicker(id); renderType();
  });
  var save = document.createElement("button"); save.type = "button"; save.className = "primary"; save.textContent = english ? "Save assemblies" : "שמור מבנים";
  save.addEventListener("click", function () { S.wallTypes = draftTypes; ensureWallTypes(S); S.dirty3D = true; fillProps(); render2D(); updateCost(); dialog.close(); });
  var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = t("cancel"); cancel.addEventListener("click", dialog.close);
  dialog.body.append(picker, name, category, layers, addLayer);
  dialog.actions.append(duplicate, cancel, save); renderType();
}

function exportWallScheduleFile() {
  ensureWallTypes(S);
  var csv = wallScheduleCSV(wallSchedule(S));
  var quantities = wallMaterialQuantities(S);
  function cell(value) { return typeof value === "number" ? '"' + value.toFixed(3) + '"' : csvCell(value); }
  csv += "\r\n\r\n\"Material\",\"Layer role\",\"Phase\",\"Length (m)\",\"Net area (m²)\",\"Volume (m³)\"";
  quantities.forEach(function (q) {
    Object.keys(q.phases || {}).forEach(function (phase) {
      var p = q.phases[phase];
      csv += "\r\n" + [q.material, q.role || q.layer, phase, p.length / 100, p.netArea / 10000, p.volume / 1000000]
        .map(cell).join(",");
    });
  });
  var framing = wallFramingTakeoff(S);
  if (framing.quantities.length) {
    csv += "\r\n\r\n\"Framing material\",\"Member\",\"Phase\",\"Count\",\"Length (m)\",\"Volume (m³)\"";
    framing.quantities.forEach(function (q) {
      csv += "\r\n" + [q.material, q.kind, q.phase, q.count, q.length / 100, q.volume / 1000000]
        .map(cell).join(",");
    });
  }
  saveTextDownload("wall-schedule.csv", csv);
}

function fmtHour(h) {
  var hh = Math.floor(h),
    mm = Math.round((h - hh) * 60);
  return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
}
function compass(a) {
  a = ((a % 360) + 360) % 360;
  var d = t("c_dirs");
  return a + "° · " + t("c_north") + " " + d[Math.round(a / 45) % 8];
}
export function lockUI() {
  document.getElementById("workspace").style.pointerEvents = "none";
}
export function unlockUI() {
  document.getElementById("workspace").style.pointerEvents = "";
}
/* The two rotate buttons show the step they will actually apply, and the step
   chooser shows which one is live. One readout, so a 90° press can never look
   like a 15° one. */
export function syncRotStepUI() {
  var step = rotStep();
  document.querySelectorAll("[data-act^='rotStep']").forEach(function (b) {
    var v = parseInt(b.getAttribute("data-act").slice(7), 10);
    b.classList.toggle("active", v === step);
  });
  document.querySelectorAll(".rot-step-lbl").forEach(function (el) {
    el.textContent = step + "\u00b0";
  });
}

export function isLegacyUI() {
  return document.documentElement.getAttribute("data-ui") === "legacy";
}

var armToastDismiss = null; // the open "Click the plan to place X" toast
export function placeFurnAt(type, x, z) {
  var result = executeCommand(itemPlaceCommand, { type: type, x: x, z: z }, {
    domain: "planner",
    state: S,
    history: UI_COMMAND_HISTORY,
    version: { current: currentHistoryId },
    itemCatalog: FURN,
    services: {
      createItem: mkItem,
      applyAutoFace: function (it, px, pz) {
        var ctx = { host: findSupport(it, px, pz) };
        applyAutoFace(it, px, pz, ctx);
        var flush = flushToWall(it, px, pz, ctx);
        if (flush) {
          it.x = Math.round(flush.x * 10) / 10;
          it.z = Math.round(flush.z * 10) / 10;
        }
      },
    },
  }, { label: t("f_itemPlaced") });
  if (!result.ok || !result.created.length) {
    flash(t("f_placeFail"), "error");
    return;
  }
  var madeId = result.created[0].id;
  var it = S.items.find(function (item) { return item.id === madeId; });
  if (!it) return;
  S.placeType = null;
  // "Click the plan to place X" has been answered
  if (armToastDismiss) { armToastDismiss(); armToastDismiss = null; }
  window.dispatchEvent(new CustomEvent("planner-place"));
  select({ kind: "item", ref: it });
  S.dirty3D = true;
  render2D();
  updateCost();
  window.dispatchEvent(new CustomEvent("planner-item-created", { detail: { item: it } }));
}

export function addFurnItem(type) {
  /* With a placeholder point selected, the library becomes that point's picker:
     the piece lands ON the point instead of in the middle of the view. This is
     the "add the object later" half of the feature — the point was placed and
     measured first, the object is chosen whenever you have decided. */
  var mk = S.sel && S.sel.kind === "marker" ? S.sel.ref : null;
  if (mk) {
    pushHistory();
    var held = markerItem(mk);
    if (held) {
      S.items = S.items.filter(function (i) {
        return i !== held;
      });
      orphanChildren(null);
    }
    var placed = placeOnMarker(mk, type);
    if (!placed) {
      flash(t("f_placeFail"), "error");
      return;
    }
    flash(t("f_mkPlaced", { name: flabel(type), pt: markerLabel(mk) }), "success");
    S.dirty3D = true;
    render2D();
    refreshTree();
    fillProps();
    return;
  }
  if (!isLegacyUI()) {
    S.placeType = type;
    var planEl = document.getElementById("plan");
    if (planEl) planEl.style.cursor = "crosshair";
    window.dispatchEvent(new CustomEvent("planner-place"));
    armToastDismiss = flash(t("furn_place_armed", { name: flabel(type) }));
    return;
  }
  var p = dropPoint(); // never NaN, even with the plan pane hidden
  var cx = Math.round(p.x / 2) * 2,
    cz = Math.round(p.z / 2) * 2;
  placeFurnAt(type, cx, cz);
}
export function syncEnvUI() {
  document.getElementById("hour").value = S.hour;
  document.getElementById("hourval").textContent = fmtHour(S.hour);
  document.getElementById("north").value = S.northAngle;
  document.getElementById("northval").textContent = compass(S.northAngle);
}

// show/hide + label the first/third-person + free-move toggle buttons
function syncWalkView(on, mode) {
  // the 3D view's own Walk / Third person toggles (planner_3d.js) follow too
  window.dispatchEvent(new Event("planner-navigation-restored"));
  var btn = document.getElementById("walkViewBtn");
  if (btn) {
    btn.style.display = on ? "" : "none";
    var m = mode || walkViewMode();
    var lbl = document.getElementById("walkViewLbl");
    if (lbl) lbl.textContent = m === "tpv" ? "TPV" : "FPV";
    btn.classList.toggle("active", m === "tpv");
  }
  var fb = document.getElementById("freeMoveBtn");
  if (fb) {
    fb.style.display = on ? "" : "none";
    fb.classList.toggle("active", isFreeMove());
  }
  var pb = document.getElementById("physicsBtn");
  if (pb) {
    pb.style.display = on ? "" : "none";
    pb.classList.toggle("active", isPhysicsEnabled());
  }
  var cdb = document.getElementById("clearDebrisBtn");
  if (cdb) {
    cdb.style.display = on ? "" : "none";
  }
  var hmb = document.getElementById("hitModeBtn");
  if (hmb) {
    hmb.style.display = on ? "" : "none";
  }
  var sw = document.getElementById("strengthWrap");
  if (sw) {
    sw.style.display = on ? "inline-flex" : "none";
  }
}

/* Which end of the selected wall a length/angle edit moves: the half the user
   picked (hover+click in the plan, or the inspector's segmented control), and
   only failing that the old heuristic — move the freer end. */
export function editEnd(w) {
  if (S.wallEditEnd === "a" || S.wallEditEnd === "b" || S.wallEditEnd === "mid")
    return S.wallEditEnd;
  return nodeDegree(w.a) < nodeDegree(w.b) ? "a" : "b";
}
/* Auto face selection depends on the surrounding room/joints. A length or
   angle edit can deliberately release one of those joints, so resolve and
   pin the face before moving anything; otherwise the same physical wall can
   silently switch to its opposite face halfway through the edit. */
export function pinDimSide(w) {
  if (w.dimSide !== 1 && w.dimSide !== -1 && w.dimSide !== 0)
    w.dimSide = wallDimSide(w);
}
/* Typing a dimension is the clearest statement a user can make about a wall,
   so it always wins: the wall becomes exactly that long / that angled, and
   any neighbour that would have to stretch to stay attached lets go of the
   joint instead (which then glows until it is dealt with). */
export function afterWallDim(w, before, target, end, allowLockedYield, alsoActive) {
  w.clearL = target;
  /* `alsoActive` are walls the gesture is KNOWN to change — the neighbour a
     rotated corner drags with it. Declaring them up front is the difference
     between the solver adjusting the one wall that has to give and it hunting
     for a victim somewhere else in the loop. */
  var active = alsoActive && alsoActive.length ? [w.id].concat(alsoActive) : [w.id];
  /* Let the rest of the plan FOLLOW the edit before deciding anything is in
     conflict with it. Typing a room's width used to release a corner on the
     spot, because the two side walls had been swung off square by the moved
     end; relaxing first slides them along instead, so the room simply gets
     wider and stays square. Only what the relaxation cannot satisfy — the
     opposite wall, whose own stated length now contradicts this one — is
     still a real contradiction, and only that releases a joint. */
  var relaxed = settleWallDim(w, target, end, active, allowLockedYield);
  var released = enforceLocks(before, active.concat(relaxed.yielded));
  fitWallClearLength(w, target, end);
  captureLock(w);
  // ...and then the explicit dimensions get the last word, since those were
  // typed too, and about relationships this wall's own length cannot state
  solveWallCons();
  renderWarnPanel();
  // Reflect the final geometry (including the now-pinned measurement face)
  // immediately; otherwise the inspector can keep showing the pre-edit lock
  // and "Auto" face until the wall is selected again.
  fillProps();
  if (released) flash(t("f_jointReleased", { n: released }));
  return { relaxed: relaxed, released: released };
}

/* ---- squaring to 90° ----------------------------------------------------

   Both squaring gestures rotate one wall and hand the bill to the plan. What
   the bill may be paid with is the whole problem: a closed room cannot take a
   rotation without SOMETHING giving, and the engine's general answer — let a
   locked wall somewhere yield its stated length — used to shrink a 400 cm room
   to 374 to square one corner, silently, while reporting only success.

   So each gesture is now tried both ways from the same starting geometry and
   the better outcome is kept:

     A. the corner that moves hands the change to its own neighbour — the one
        wall the rotation demonstrably drags — and nothing else in the plan is
        touched. On the common case (a room corner) this squares the corner and
        leaves every other dimension exactly as it was.
     B. the old whole-loop relaxation, which may buy the fit with somebody
        else's length. Only used when A cannot square the corner at all.

   Whatever is finally kept, the walls whose stated length changed are counted
   and said out loud. */

/* Everything an attempt can move, so a losing attempt can be put back. Node
   objects are replaced wholesale (a released joint pushes new ones), and every
   wall record the constraint engine writes to is restored on the wall itself. */
function planState() {
  return {
    nodes: S.nodes.map(function (n) {
      return n ? { x: n.x, z: n.z } : null;
    }),
    walls: S.walls.map(function (w) {
      return {
        w: w, a: w.a, b: w.b, clearL: w.clearL,
        lockL: w.lockL, lockClearL: w.lockClearL, lockAng: w.lockAng, dimSide: w.dimSide,
      };
    }),
  };
}
function restorePlan(st) {
  S.nodes.length = 0;
  st.nodes.forEach(function (n) {
    S.nodes.push(n ? { x: n.x, z: n.z } : null);
  });
  st.walls.forEach(function (r) {
    r.w.a = r.a;
    r.w.b = r.b;
    r.w.clearL = r.clearL;
    r.w.lockL = r.lockL;
    r.w.lockClearL = r.lockClearL;
    r.w.lockAng = r.lockAng;
    r.w.dimSide = r.dimSide;
  });
}

/* The wall a rotation inevitably drags with it, and which therefore pays for
   it: the single other wall meeting at the corner that moves. Only a plain
   corner qualifies — at a junction the cost is not one wall's to pay, and an
   unlocked wall is not paying anything because it never held a dimension. */
function absorbingWall(ni, exclude) {
  if (ni == null || nodeDegree(ni) !== 2) return null;
  for (var i = 0; i < S.walls.length; i++) {
    var w = S.walls[i];
    if (w !== exclude && (w.a === ni || w.b === ni))
      return isLocked(w) ? w : null;
  }
  return null;
}
/* How many OTHER walls came out reading a different interior length. */
function resizedCount(before, exceptId) {
  var n = 0;
  S.walls.forEach(function (w) {
    if (w.id === exceptId) return;
    var was = before.clear && before.clear[w.id];
    if (!fin(was)) return;
    var now = wallClearLength(w);
    if (fin(now) && Math.abs(now - was) > 0.5) n++;
  });
  return n;
}
/* Worst deviation from square (or from a straight run) at one corner. */
function cornerOff(ni) {
  var ji = jointInfo(ni);
  if (!ji || !ji.gaps.length) return 999;
  var worst = 0;
  ji.gaps.forEach(function (g) {
    var d = Math.min(
      Math.abs(g.deg - 90),
      Math.abs(g.deg - 180),
      Math.abs(g.deg - 270)
    );
    if (d > worst) worst = d;
  });
  return worst;
}
/* Put a floor material on a room. There are now three ways to ask for it — the
   inspector select, the contextual row's Floor button and a double-tap on the
   plan — and exactly one of them may own the rule that makes the pick stick.

   That rule is the custom-texture drop. An uploaded image on a room OVERRIDES
   its material in 3D (`cTex` beats `t` in view3d.js fmatFor), so choosing a
   preset on top of one used to change a value nothing renders: the tile you
   picked was simply not the floor you got, with nothing on screen saying why.
   The upload is discarded and the swap is named, because silently throwing
   away an image somebody chose is the other way to get this wrong. */
function applyRoomFloor(key, type) {
  if (!key || !type) return false;
  var meta = (S.roomMeta[key] = S.roomMeta[key] || {});
  var hadTex = !!meta.floorTex;
  if (meta.floor === type && !hadTex) return false; // nothing to undo
  pushHistory();
  meta.floor = type;
  if (hadTex) delete meta.floorTex;
  S.dirty3D = true;
  fillProps();
  render2D();
  if (hadTex) flash(t("floor_custom_dropped"));
  return true;
}

/* What to say afterwards. A squaring that cost other walls their stated length
   says so and how many — the plan quietly changing size behind a cheerful
   "squared to 90°" is what made this operation untrustworthy. */
export function squaredMsg(score, okKey) {
  if (!score || !score.resized) return t(okKey || "f_jointSquared");
  return score.resized === 1
    ? t("f_squaredResized1")
    : t("f_squaredResized", { n: score.resized });
}
function betterSquare(a, b) {
  var sa = a.off < 0.05,
    sb = b.off < 0.05;
  if (sa !== sb) return sa; // squaring it at all comes first
  if (a.released !== b.released) return a.released < b.released;
  if (a.resized !== b.resized) return a.resized < b.resized;
  return a.off < b.off - 1e-9;
}

/* Run the same edit under both strategies and keep the better result.
   `place()` re-does the node move from the restored geometry each time and
   returns { end, adopt } — which end of the wall it moved, and the neighbours
   that end drags. `measure()` scores how square the result came out. */
function bestSquare(w, heldLength, place, measure) {
  var before = snapshotNodes(),
    saved = planState(),
    best = null;
  [false, true].forEach(function (loose) {
    restorePlan(saved);
    var p = place();
    if (!p) return;
    var adopt = loose ? [] : (p.adopt || []).filter(Boolean);
    if (!loose && !adopt.length) return; // same edit as the loose attempt
    /* An adopted neighbour accepts what it now measures instead of defending
       what it used to: that is what makes the rest of the plan unnecessary as
       a source of slack. */
    adopt.forEach(function (n) {
      captureClear(n);
      captureLock(n);
    });
    var r = quietly(function () {
      return afterWallDim(
        w, before, heldLength, p.end, loose,
        adopt.map(function (n) { return n.id; })
      );
    });
    adopt.forEach(function (n) {
      captureClear(n);
      captureLock(n);
    });
    var score = {
      off: measure(),
      released: r.released,
      resized: resizedCount(before, w.id),
    };
    if (!best || betterSquare(score, best.score))
      best = { score: score, state: planState() };
  });
  if (!best) {
    restorePlan(saved);
    return null;
  }
  restorePlan(best.state);
  if (best.score.released)
    flash(t("f_jointReleased", { n: best.score.released }));
  S.dirty3D = true;
  fillProps();
  render2D();
  refreshTree();
  renderWarnPanel(true);
  return best.score;
}

/* Square a wall to the nearest 90° multiple and settle surrounding loops.
   Returns the outcome (truthy) or false if no end of it may move. */
export function squareWall(w, end) {
  if (!w) return false;
  var pins = pinnedNodes(),
    chosenEnd = end || editEnd(w);
  /* A pin is a statement that this corner does not move. Squaring used to walk
     straight through one; now the gesture takes the other end instead, and
     refuses outright when both corners are pinned. */
  if (pins[w.a] && pins[w.b]) return false;
  if (chosenEnd === "mid" && (pins[w.a] || pins[w.b]))
    chosenEnd = pins[w.a] ? "b" : "a";
  else if (chosenEnd !== "mid" && pins[w[chosenEnd]])
    chosenEnd = chosenEnd === "a" ? "b" : "a";

  pinDimSide(w);
  if (!fin(w.clearL)) w.clearL = wallClearLength(w);
  var heldLength = w.clearL,
    targetDeg = 0;
  return bestSquare(
    w,
    heldLength,
    function () {
      var gm = wallGeom(w),
        curDeg = (Math.atan2(gm.dz, gm.dx) * 180) / Math.PI;
      while (curDeg < 0) curDeg += 360;
      targetDeg = Math.round(curDeg / 90) * 90;
      if (targetDeg === 360) targetDeg = 0;
      var ang = (targetDeg * Math.PI) / 180,
        adopt = [];
      if (chosenEnd === "mid") {
        var mx = (gm.a.x + gm.b.x) / 2,
          mz = (gm.a.z + gm.b.z) / 2,
          h = gm.L / 2;
        setWallEnd(w, "a", { x: mx - Math.cos(ang) * h, z: mz - Math.sin(ang) * h });
        setWallEnd(w, "b", { x: mx + Math.cos(ang) * h, z: mz + Math.sin(ang) * h });
        adopt = [absorbingWall(w.a, w), absorbingWall(w.b, w)];
      } else if (chosenEnd === "a") {
        var b = S.nodes[w.b];
        S.nodes[w.a] = {
          x: b.x - Math.cos(ang) * gm.L,
          z: b.z - Math.sin(ang) * gm.L,
        };
        adopt = [absorbingWall(w.a, w)];
      } else {
        var a = S.nodes[w.a];
        S.nodes[w.b] = {
          x: a.x + Math.cos(ang) * gm.L,
          z: a.z + Math.sin(ang) * gm.L,
        };
        adopt = [absorbingWall(w.b, w)];
      }
      w.lockAng = targetDeg;
      return { end: chosenEnd, adopt: adopt };
    },
    function () {
      var cur = ((((wallGeom(w).ang * 180) / Math.PI) % 360) + 360) % 360,
        d = Math.abs(cur - targetDeg) % 360;
      return d > 180 ? 360 - d : d;
    }
  );
}

/* Square two walls meeting at a joint relative to each other and settle
   surrounding loops. Returns the outcome (truthy) or false if the corner
   offers nothing that may be swung. */
export function squareJoint(ni, wA, wB) {
  var ji = jointInfo(ni);
  if (!ji || ji.arms.length < 2) return false;
  var pick = squarableArm(ji, wA && wB ? [wA.id, wB.id] : null);
  if (!pick) return false;

  var pins = pinnedNodes();
  // The selected joint is the pivot. Moving it to work around a pinned far
  // endpoint changes every arm at the joint and can spoil a different angle.
  if (pins[pick.move.other]) return false;

  var moveWall = pick.move.wall;
  pinDimSide(moveWall);
  var heldLength = fin(moveWall.clearL)
    ? moveWall.clearL
    : wallClearLength(moveWall);

  return bestSquare(
    moveWall,
    heldLength,
    function () {
      /* Re-read the corner each attempt: the arm bearings are taken from the
         geometry that was just restored, not from the pre-attempt reading. */
      var info = jointInfo(ni);
      if (!info) return null;
      var arms = {};
      info.arms.forEach(function (a) {
        arms[a.wall.id] = a;
      });
      var live = { move: arms[pick.move.wall.id], keep: arms[pick.keep.wall.id] };
      if (!live.move || !live.keep) return null;
      var placement = placeSquareArm(ni, live, pins);
      if (!placement) return null;
      moveWall.lockAng = placement.targetDeg;
      return {
        end: placement.movedEnd,
        adopt: [absorbingWall(live.move.other, moveWall)],
      };
    },
    function () {
      return cornerOff(ni);
    }
  );
}

/* Numeric corner-angle authoring. A corner is enough geometry to state this
   dimension; selecting two corners remains the separate compare/equal-angle
   workflow. The first Apply is read-only. If the driven arm closes a loop (or
   its far-side component is pinned), the modal asks for explicit permission
   before the solver may trade any wall length for the requested angle. */
export function showJointAngleDialog(ni) {
  var sec = angleSectorAtNode(ni);
  if (!sec) {
    flash(t("nd_set_angle_need_two"), "error");
    return false;
  }
  var current = sectorAngle(sec), dlg = openModal(t("nd_set_angle_title"));
  var readout = document.createElement("p");
  readout.className = "t";
  readout.textContent = t("nd_set_angle_current", {
    v: Math.round((Number(current) || 0) * 10) / 10,
  });
  var label = document.createElement("label");
  label.className = "dim-row";
  var caption = document.createElement("span");
  caption.textContent = t("nd_set_angle_value");
  var input = document.createElement("input");
  input.type = "number";
  input.inputMode = "decimal";
  input.min = "0.1";
  input.max = "359.9";
  input.step = "0.1";
  input.value = Math.round((Number(current) || 90) * 10) / 10;
  label.appendChild(caption);
  label.appendChild(input);
  var note = document.createElement("small");
  note.className = "parametric-proposal-issue";
  note.hidden = true;
  dlg.body.appendChild(readout);
  dlg.body.appendChild(label);
  dlg.body.appendChild(note);

  var cancel = document.createElement("button");
  cancel.textContent = t("cancel");
  cancel.addEventListener("click", dlg.close);
  var apply = document.createElement("button");
  apply.className = "btn-accent";
  apply.textContent = t("nd_set_angle_apply");
  dlg.actions.appendChild(cancel);
  dlg.actions.appendChild(apply);

  function invalid() {
    note.hidden = false;
    note.textContent = t("nd_set_angle_invalid");
    input.focus();
  }
  function finish(value, allowLengthChange) {
    pushHistory();
    var made = setJointAngleTarget(sec, value, allowLengthChange);
    if (!made) {
      flash(t("wc_failed"), "error");
      return;
    }
    var result = solveWallCons();
    S.dirty3D = true;
    dlg.close();
    fillProps();
    render2D();
    refreshTree();
    renderWarnPanel(true);
    if (result.unresolved) flash(t("wc_unresolved", { n: result.unresolved }), "error");
    else flash(t("nd_angle_set", { v: Math.round(value * 10) / 10 }), "success");
  }
  function submit() {
    var value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0 || value >= 360) return invalid();
    var impact = jointAngleLengthImpact(sec, value);
    if (!impact.needsChange) return finish(value, false);

    /* Do not mutate the plan until this second, explicit choice. The Cancel
       path therefore needs no rollback and cannot leave a half-authored
       constraint behind. */
    note.hidden = false;
    note.textContent = t("nd_set_angle_length_warning", { n: impact.walls.length });
    input.disabled = true;
    apply.remove();
    var allow = document.createElement("button");
    allow.className = "btn-accent";
    allow.textContent = t("nd_set_angle_allow_lengths");
    allow.addEventListener("click", function () { finish(value, true); });
    dlg.actions.appendChild(allow);
  }
  apply.addEventListener("click", submit);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  });
  setTimeout(function () { input.focus(); input.select(); }, 0);
  return true;
}

/* The Drawing overlay's on-screen settings. Per-viewer preferences, so they
   live in localStorage (guarded: private windows throw) rather than the plan. */
var drawingPanelReady = false;
function initDrawingPanel() {
  if (drawingPanelReady) return;
  var panel = document.getElementById("drawing3dPanel");
  if (!panel) return;
  drawingPanelReady = true;
  var hiddenIn = document.getElementById("drawing3dHidden"),
    hoverIn = document.getElementById("drawing3dHover"),
    inkIn = document.getElementById("drawing3dHoverInk");
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem("home3d_drawing3d") || "{}") || {}; } catch (e) { saved = {}; }
  if (Number.isFinite(saved.hiddenOpacity)) hiddenIn.value = Math.round(saved.hiddenOpacity * 100);
  if (typeof saved.hover === "boolean") hoverIn.checked = saved.hover;
  if (Number.isFinite(saved.hoverOpacity)) inkIn.value = Math.round(saved.hoverOpacity * 100);
  function apply() {
    var prefs = setDrawingOptions({
      hiddenOpacity: Number(hiddenIn.value) / 100,
      hover: hoverIn.checked,
      hoverOpacity: Number(inkIn.value) / 100,
    });
    document.getElementById("drawing3dHiddenOut").textContent = hiddenIn.value + "%";
    document.getElementById("drawing3dHoverInkOut").textContent = inkIn.value + "%";
    inkIn.disabled = !hoverIn.checked;
    panel.classList.toggle("hover-off", !hoverIn.checked);
    try { localStorage.setItem("home3d_drawing3d", JSON.stringify(prefs)); } catch (e) {}
  }
  [hiddenIn, hoverIn, inkIn].forEach(function (input) {
    input.addEventListener("input", apply);
    input.addEventListener("change", apply);
  });
  apply();
}

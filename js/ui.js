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
  defaultScene,
  emptyScene,
  PRICE,
  itemPrice,
  clearVSpanCache,
} from "./furniture.js";
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
  applyAutoFace, markManualRot, refaceItem, rotStep, setRotStep,
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
} from "./view3d.js";
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
import { wallSchedule, wallScheduleCSV } from "./wall_schedule.js";
import { wallFramingTakeoff } from "./wall_framing.js";
import { convertCadToWalls } from "./cad_to_walls.js";
import { convertGeoJsonToWalls } from "./geojson_to_walls.js";
import { normalizeBlueprintReference, syncBlueprintTraceControls } from "./blueprint_trace.js";
import { windowChromePosture } from "./chrome_posture.js";
import { initDropdownMenus } from "./dropdown_menus.js";

export { select, fillProps, updateCost, exportCostCSV, refreshTree };

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
    showDims: S.showDims,
    interiorDims: S.interiorDims,
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
          show: S.mep.show,
          show3D: S.mep.show3D,
          xray: typeof S.mep.xray === "object" ? S.mep.xray : { walls: !!S.mep.xray, floor: false, ceiling: false },
          snapAngle: S.mep.snapAngle,
          wallRoute: S.mep.wallRoute,
          animate: S.mep.animate,
          layer: S.mep.layer,
          routePolicy: S.mep.routePolicy,
          vis: S.mep.vis,
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
  if(d.spatial)d={...d,nodes:d.spatial.nodes,walls:d.spatial.walls,wallTypes:d.spatial.wallTypes,openings:d.spatial.openings,items:d.spatial.instances,markers:d.spatial.markers,slabOpenings:d.spatial.slabOpenings,surveyFeatures:d.spatial.surveyFeatures,roomMeta:d.spatial.rooms,cabinetPresets:d.spatial.cabinetPresets,wallCons:d.spatial.wallCons,roomCons:d.spatial.roomCons,planVars:d.spatial.planVars};
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

export function flash(msg, kind) {
  if (quiet) return;
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.id = "toast-root";
    toastRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRoot);
  }
  while (toastRoot.children.length >= 3) toastRoot.firstChild.remove();
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
  toastRoot.appendChild(el);
  requestAnimationFrame(function () {
    el.classList.add("on");
  });
  setTimeout(function () {
    el.classList.remove("on");
    setTimeout(function () {
      el.remove();
    }, 300);
  }, 2400);
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
  csv += "\r\n\r\n\"Material\",\"Layer role\",\"Phase\",\"Length (m)\",\"Net area (m²)\",\"Volume (m³)\"";
  quantities.forEach(function (q) {
    Object.keys(q.phases || {}).forEach(function (phase) {
      var p = q.phases[phase];
      csv += "\r\n" + [q.material, q.role || q.layer, phase, p.length / 100, p.netArea / 10000, p.volume / 1000000]
        .map(function (value) { return '"' + String(typeof value === "number" ? value.toFixed(3) : value).replace(/"/g, '""') + '"'; }).join(",");
    });
  });
  var framing = wallFramingTakeoff(S);
  if (framing.quantities.length) {
    csv += "\r\n\r\n\"Framing material\",\"Member\",\"Phase\",\"Count\",\"Length (m)\",\"Volume (m³)\"";
    framing.quantities.forEach(function (q) {
      csv += "\r\n" + [q.material, q.kind, q.phase, q.count, q.length / 100, q.volume / 1000000]
        .map(function (value) { return '"' + String(typeof value === "number" ? value.toFixed(3) : value).replace(/"/g, '""') + '"'; }).join(",");
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
        applyAutoFace(it, px, pz, { host: findSupport(it, px, pz) });
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
    flash(t("furn_place_armed", { name: flabel(type) }));
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

export function initUI() {
  // destruction-strength slider (walk mode): scales material break thresholds
  var strengthSlider = document.getElementById("strengthSlider");
  if (strengthSlider) {
    setStrength(parseFloat(strengthSlider.value));
    strengthSlider.addEventListener("input", function () {
      setStrength(parseFloat(strengthSlider.value));
    });
  }
  // keyboard "V" toggles the walk perspective from view3d; reflect it in the UI
  window.addEventListener("walkview", function (e) {
    syncWalkView(true, e.detail);
    flash(e.detail === "tpv" ? t("f_viewTpv") : t("f_viewFpv"));
  });
  // keyboard "T" toggles physics slow-motion from view3d
  window.addEventListener("slowmo", function (e) {
    flash(t(e.detail ? "f_slowMoOn" : "f_slowMoOff"));
  });
  // keyboard "F" toggles free-move (no-clip) from view3d; reflect it in the UI
  window.addEventListener("freemove", function (e) {
    var fb = document.getElementById("freeMoveBtn");
    if (fb) fb.classList.toggle("active", e.detail);
    flash(e.detail ? t("f_freeOn") : t("f_freeOff"));
  });
  // numeric property inputs
  bindLength("w_len", function (v) {
    var w = S.sel.ref;
    if (S.sel.kind !== "wall") return;
    v = Math.max(5, Math.min(3000, v));
    pinDimSide(w);
    // typed by hand: from now on this length outranks any DERIVED one when the
    // relaxation has to choose which wall yields in an over-constrained loop
    w.dimUser = 1;
    var before = snapshotNodes();
    var gm = wallGeom(w);
    // Add the hidden offset to get the full node-to-node length
    var targetL = v + (gm.L - wallClearLength(w));
    var end = editEnd(w);
    if (end === "mid") {
      // grow/shrink symmetrically about the midpoint — both halves change
      var mx = (gm.a.x + gm.b.x) / 2, mz = (gm.a.z + gm.b.z) / 2, h = targetL / 2;
      // gm is the wall's own line; setWallEnd maps back onto the node line
      setWallEnd(w, "a", { x: mx - gm.ux * h, z: mz - gm.uz * h });
      setWallEnd(w, "b", { x: mx + gm.ux * h, z: mz + gm.uz * h });
    } else if (end === "a") {
      var b = S.nodes[w.b];
      S.nodes[w.a] = { x: b.x - gm.ux * targetL, z: b.z - gm.uz * targetL };
    } else {
      var a = S.nodes[w.a];
      S.nodes[w.b] = { x: a.x + gm.ux * targetL, z: a.z + gm.uz * targetL };
    }
    // the typed number IS the interior dimension the wall now holds. The lock
    // pass runs FIRST (it decides which joints survive the edit); only then are
    // the interior spans of whatever is still attached restored.
    afterWallDim(w, before, v, end);
    return v;
  }, null, "change");
  bindNum("w_ang", function (v) {
    var w = S.sel.ref;
    if (S.sel.kind !== "wall") return;
    pinDimSide(w);
    if (!fin(w.clearL)) w.clearL = wallClearLength(w);
    var heldLength = w.clearL;
    var before = snapshotNodes();
    var gm = wallGeom(w),
      ang = (v * Math.PI) / 180;
    // Pivot about the better-connected end and swing the freer one, matching
    // w_len. This used to always move `b`, so retyping an angle could drag a
    // junction and silently reshape every wall meeting it — while editing the
    // same wall's LENGTH correctly left that junction alone.
    var end = editEnd(w);
    if (end === "mid") {
      var mx = (gm.a.x + gm.b.x) / 2, mz = (gm.a.z + gm.b.z) / 2, h = gm.L / 2;
      setWallEnd(w, "a", { x: mx - Math.cos(ang) * h, z: mz - Math.sin(ang) * h });
      setWallEnd(w, "b", { x: mx + Math.cos(ang) * h, z: mz + Math.sin(ang) * h });
    } else if (end === "a") {
      var b = S.nodes[w.b];
      S.nodes[w.a] = {
        x: b.x - Math.cos(ang) * gm.L,
        z: b.z - Math.sin(ang) * gm.L,
      };
    } else {
      var a = S.nodes[w.a];
      S.nodes[w.b] = {
        x: a.x + Math.cos(ang) * gm.L,
        z: a.z + Math.sin(ang) * gm.L,
      };
    }
    w.lockAng = v;
    afterWallDim(w, before, heldLength, end);
    return v;
  }, null, "change");
  // segmented picker: which half of the wall a length/angle edit moves
  var wEndBox = document.getElementById("w_end");
  if (wEndBox)
    wEndBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-end]");
      if (!b) return;
      S.wallEditEnd = b.dataset.end || null;
      syncWallEnd();
      render2D();
    });
  /* Picking the measured face re-states the dimension without moving anything:
     the wall is the same wall, the tape just moved to the other face — so the
     held interior length is re-read from that face. */
  var wSideBox = document.getElementById("w_side");
  if (wSideBox)
    wSideBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-side]");
      if (!b || !S.sel || S.sel.kind !== "wall") return;
      var w = S.sel.ref,
        v = b.dataset.side;
      pushHistory();
      // on a face-located wall the stored line IS this face, so changing it
      // re-hangs the wall — setWallReference owns both cases
      setWallReference(w, { dimSide: v === "" ? null : +v });
      S.dirty3D = true;
      syncWallSide(w);
      fillProps();
      render2D();
    });
  /* Which line of the wall the model stores. The corner stays where it is and
     the wall re-hangs on it — see setWallReference. "Whole run" (and a
     thickness edit of a collinear run) hangs every member on the same face so
     the interior is flush; a 90° branch sharing the T-node stays welded. */
  var wLocBox = document.getElementById("w_loc");
  if (wLocBox)
    wLocBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-loc]");
      if (!b || b.disabled || !S.sel || S.sel.kind !== "wall") return;
      var w = S.sel.ref,
        v = b.dataset.loc;
      pushHistory();
      if (v === "face-run") hangStraightRunOnFace(w, wallDimSide(w));
      else setWallReference(w, { loc: v });
      S.dirty3D = true;
      refreshTree();
      syncWallSide(w);
      fillProps();
      render2D();
    });

  function editWallDefinition(change, affectsGeometry) {
    if (!S.sel || S.sel.kind !== "wall") return;
    pushHistory();
    normalizeWall(S.sel.ref, S);
    change(S.sel.ref);
    if (affectsGeometry !== false) S.dirty3D = true;
    fillProps();
    render2D();
    updateCost();
  }

  var wallTypeSelect = document.getElementById("w_type");
  if (wallTypeSelect)
    wallTypeSelect.addEventListener("change", function () {
      var typeId = this.value;
      editWallDefinition(function (w) {
        pinDimSide(w);
        var oldThickness = w.thickness;
        setWallType(w, typeId, S);
        var targetThickness = w.thickness;
        // Let the established thickness path keep the selected clear face in
        // place; changing assembly must not silently resize the room.
        w.thickness = oldThickness;
        setWallThicknessPreservingClear(w, targetThickness, editEnd(w));
      });
    });

  var wallKindSelect = document.getElementById("w_kind");
  if (wallKindSelect)
    wallKindSelect.addEventListener("change", function () {
      var kind = normalizeWallKind(this.value);
      editWallDefinition(function (w) {
        setWallKind(w, kind);
      });
    });

  var wallPhaseSelect = document.getElementById("w_phase");
  if (wallPhaseSelect)
    wallPhaseSelect.addEventListener("change", function () {
      var phase = this.value;
      editWallDefinition(function (w) { setWallPhase(w, phase); });
    });

  var wallDatumSelect = document.getElementById("w_datum");
  if (wallDatumSelect)
    wallDatumSelect.addEventListener("change", function () {
      var datum = {
        outer: "exterior",
        mainOutside: "main-exterior",
        mainInside: "main-interior",
        inner: "interior",
      }[this.value] || "center";
      editWallDefinition(function (w) { w.datum = datum; });
    });

  var upperTypeSelect = document.getElementById("w_upper_type");
  if (upperTypeSelect)
    upperTypeSelect.addEventListener("change", function () {
      var typeId = this.value;
      editWallDefinition(function (w) { w.upperWallTypeId = typeId; });
    });

  /* End joins are a segmented picker now rather than a select: three ways two
     walls can meet, drawn instead of named. Same edit either way — "auto"
     removes the override so the joint solver keeps deciding. */
  ["a", "b"].forEach(function (end) {
    var joinBox = document.getElementById("w_join_" + end);
    if (!joinBox) return;
    joinBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-join]");
      if (!b) return;
      var mode = b.dataset.join;
      editWallDefinition(function (w) {
        if (!w.join || typeof w.join !== "object") w.join = {};
        if (mode === "auto") delete w.join[end];
        else w.join[end] = mode;
        if (!Object.keys(w.join).length) delete w.join;
      });
    });
  });

  bindLength("w_split_h", function (v) {
    if (!S.sel || S.sel.kind !== "wall") return;
    S.sel.ref.splitHeight = Math.max(1, Math.min(S.sel.ref.height - 1, v));
    fillProps();
    return S.sel.ref.splitHeight;
  }, null, "change");

  bindLength("w_bulge", function (v) {
    if (!S.sel || S.sel.kind !== "wall") return;
    var w = S.sel.ref;
    v = Math.max(-5, Math.min(5, v));
    if (Math.abs(v) < 0.000001) {
      delete w.geometry;
      delete w.curve;
      delete w.bulge;
    } else {
      w.geometry = { kind: "arc", bulge: v };
      delete w.curve;
      delete w.bulge;
    }
    fillProps();
    return v;
  }, null, "change");

  function updateWallProfile() {
    if (!S.sel || S.sel.kind !== "wall") return;
    var w = S.sel.ref, length = wallGeom(w).L;
    function val(id, fallback) {
      var n = parseLen(document.getElementById(id).value);
      return Number.isFinite(n) ? Math.max(0, Math.min(600, n)) : fallback;
    }
    var topA = val("w_top_a", w.height), topB = val("w_top_b", w.height);
    var baseA = Math.min(val("w_base_a", 0), topA);
    var baseB = Math.min(val("w_base_b", 0), topB);
    // Preserve intermediate controls authored by an imported/elevation edit;
    // these four compact fields only replace the two endpoint controls.
    var middle = normalizeWallProfile(w).filter(function (p) {
      return p.s > 0.000001 && p.s < length - 0.000001;
    });
    var oldBase = w.profile && !Array.isArray(w.profile) && Array.isArray(w.profile.base)
      ? w.profile.base : Array.isArray(w.baseProfile) ? w.baseProfile : [];
    var baseMiddle = oldBase.filter(function (p) {
      var s = Number(Array.isArray(p) ? p[0] : p && p.s);
      return Number.isFinite(s) && s > 0.000001 && s < length - 0.000001;
    });
    w.profile = {
      points: [{ s: 0, height: topA }].concat(middle, [{ s: length, height: topB }]),
      base: [{ s: 0, height: baseA }].concat(baseMiddle, [{ s: length, height: baseB }]),
    };
    delete w.baseProfile;
    w.height = Math.max(topA, topB);
    fillProps();
  }
  ["w_top_a", "w_top_b", "w_base_a", "w_base_b"].forEach(function (id) {
    bindNum(id, function () { updateWallProfile(); }, null, "change");
  });

  bindLength("w_th", function (v) {
    if (S.sel.kind !== "wall") return;
    v = Math.max(2, Math.min(60, v));
    var w = S.sel.ref;
    normalizeWall(w, S);
    pinDimSide(w);
    var authoredLayers = wallLayers(w, S);
    if (w.layersReversed) authoredLayers.reverse();
    authoredLayers = authoredLayers.map(function (layer) { return Object.assign({}, layer); });
    var total = authoredLayers.reduce(function (sum, layer) { return sum + layer.thickness; }, 0);
    var main = authoredLayers.find(function (layer) { return layer.main; }) || authoredLayers[0];
    var others = total - main.thickness;
    v = Math.max(v, others + 0.1);
    main.thickness = v - others;
    w.layers = authoredLayers;
    var result = setWallThicknessPreservingClear(w, v, editEnd(w));
    renderWarnPanel();
    fillProps();
    if (result.released)
      flash(t("f_jointReleased", { n: result.released }));
    return v;
  }, null, "change");
  bindLength("w_h", function (v) {
    if (S.sel.kind === "wall")
      S.sel.ref.height = Math.max(20, Math.min(600, v));
    return S.sel.kind === "wall" ? S.sel.ref.height : v;
  }, null, "change");
  /* Planner sizing is a parameter/configuration request, never a mesh scale.
     Continuous valid edits rebuild immediately; family/module changes wait for
     an explicit choice in this compact proposal dialog. */
  function finishSmartDimension(it, dimension) {
    clearVSpanCache();
    if (dimension === "height") restack(it);
    touchItem3D(it, "build");
    fillProps();
    refreshTree();
    render2D();
  }
  function applySmartChoice(it, dimension, result, alternativeId, dlg) {
    commitPending();
    if (it.cab) applyCabinetDimension(S, it, result, alternativeId);
    else applyItemDimension(S, it, result, alternativeId, FURN[it.type] || {});
    if (dlg) dlg.close();
    finishSmartDimension(it, dimension);
  }
  function showSmartProposal(it, dimension, result, input) {
    var dlg = openModal(t("cfg_required"));
    var message = document.createElement("p");
    message.textContent = result.message || t("cfg_choose");
    dlg.body.appendChild(message);
    (result.issues || []).slice(0, 4).forEach(function (issue) {
      var note = document.createElement("small");
      note.className = "parametric-proposal-issue";
      note.textContent = "• " + (issue.msg || issue.message || issue.code);
      dlg.body.appendChild(note);
    });
    (result.alternatives || []).forEach(function (choice, index) {
      var button = document.createElement("button");
      button.className = index === 0 ? "btn-accent parametric-choice" : "parametric-choice";
      var title = document.createElement("strong");
      title.textContent = choice.label;
      button.appendChild(title);
      if (choice.reason) {
        var reason = document.createElement("small");
        reason.textContent = choice.reason;
        button.appendChild(reason);
      }
      button.addEventListener("click", function () {
        applySmartChoice(it, dimension, result, choice.id, dlg);
      });
      dlg.body.appendChild(button);
    });
    var cancel = document.createElement("button");
    cancel.textContent = t("cfg_keep_size");
    cancel.addEventListener("click", function () {
      cancelPending();
      writeFieldLength(input, it[{ width: "w", depth: "d", height: "h" }[dimension]]);
      dlg.close();
    });
    dlg.actions.appendChild(cancel);
  }
  function bindSmartDimension(id, dimension) {
    var input = document.getElementById(id);
    /* `live` is a scrub tick from the mobile dimension dial (js/ui_dim_knob.js),
       not a finished edit. It applies whatever the model accepts outright and
       says nothing otherwise: a proposal dialog or an error toast belongs to
       the moment the finger lifts, not to the middle of a drag — and the dial
       ends every gesture with a real blur, so both still get their say. */
    function validateDimension(event) {
      if (!S.sel || S.sel.kind !== "item") return;
      var live = !!event && event.type === "mf-scrub";
      var it = S.sel.ref, value = parseFieldLength(this.value);
      var field = { width: "w", depth: "d", height: "h" }[dimension];
      if (!Number.isFinite(value) || Math.abs(value - it[field]) < 0.0001) return;
      var result = it.cab
        ? requestCabinetDimension(it, dimension, value, ceilingHeight())
        : requestItemDimension(S, it, dimension, value, FURN[it.type] || {});
      if (result.status === "applied") applySmartChoice(it, dimension, result, null, null);
      else if (live) return;
      else if (result.status === "proposal") showSmartProposal(it, dimension, result, this);
      else {
        cancelPending();
        writeFieldLength(this, it[{ width: "w", depth: "d", height: "h" }[dimension]]);
        flash(result.message || "That dimension cannot be changed", "error");
      }
    }
    input.addEventListener("blur", validateDimension);
    input.addEventListener("mf-scrub", validateDimension);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); this.blur(); }
    });
  }
  bindSmartDimension("i_w", "width");
  bindSmartDimension("i_d", "depth");
  bindSmartDimension("i_h", "height");
  // rotation is pure transform -> nothing is regenerated at all
  bindNum("i_rot", function (v) {
    if (S.sel.kind === "item") {
      turnItem(S.sel.ref, ((v % 360) + 360) % 360);
      document.getElementById("i_rot_range").value = S.sel.ref.rot;
    }
  }, "move");
  bindNum("i_rot_range", function (v) {
    if (S.sel.kind === "item") {
      turnItem(S.sel.ref, ((v % 360) + 360) % 360);
      document.getElementById("i_rot").value = S.sel.ref.rot;
    }
  }, "move");
  // style/finish variant of the selected piece
  document.getElementById("i_variant").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "item") return;
    pushHistory();
    S.sel.ref.variant = this.value;
    clearVSpanCache(); // a shape variant changes how high the piece reaches
    restack(S.sel.ref);
    touchItem3D(S.sel.ref, "build");
    render2D();
  });
  function syncPaired(firstOp) {
    if (!firstOp.paired) return;
    var w1 = S.walls.find(function(w) { return w.id === firstOp.wall; });
    if (!w1) return;
    var g1 = wallGeom(w1);
    var px = g1.a.x + g1.ux * firstOp.s;
    var pz = g1.a.z + g1.uz * firstOp.s;
    firstOp.paired.forEach(function(oid) {
      if (oid === firstOp.id) return;
      var op = S.openings.find(function(o) { return o.id === oid; });
      if (!op) return;
      var w2 = S.walls.find(function(w) { return w.id === op.wall; });
      if (!w2) return;
      var g2 = wallGeom(w2);
      op.width = firstOp.width;
      op.height = firstOp.height;
      op.sill = firstOp.sill;
      op.s = (px - g2.a.x) * g2.ux + (pz - g2.a.z) * g2.uz;
    });
  }

  bindLength("o_w", function (v) {
    if (S.sel.kind === "opening") {
      var oldWidth = S.sel.ref.width || 1;
      S.sel.ref.width = Math.max(20, Math.min(600, v));
      if (S.sel.ref.isDouble) {
        var share = Math.max(0.15, Math.min(0.85, (Number(S.sel.ref.leafA) || oldWidth / 2) / oldWidth));
        S.sel.ref.leafA = S.sel.ref.width * share;
        S.sel.ref.leafB = S.sel.ref.width - S.sel.ref.leafA;
      }
      syncPaired(S.sel.ref);
      return S.sel.ref.width;
    }
  });
  bindLength("o_h", function (v) {
    if (S.sel.kind === "opening") {
      S.sel.ref.height = Math.max(20, Math.min(400, v));
      syncPaired(S.sel.ref);
      return S.sel.ref.height;
    }
  });
  bindLength("o_sill", function (v) {
    if (S.sel.kind === "opening") {
      S.sel.ref.sill = Math.max(0, Math.min(300, v));
      syncPaired(S.sel.ref);
    }
  });
  /* Frame / mullion profile. Each field writes one optional property on the
     opening; frameSpec() in view3d.js supplies the default when it is absent,
     so a scene saved before this existed still builds the old frame. */
  function bindFrame(id, prop, lo, hi, round) {
    bindLength(id, function (v) {
      if (!S.sel || S.sel.kind !== "opening") return;
      var o = S.sel.ref;
      v = Math.max(lo, Math.min(hi, round ? Math.round(v) : v));
      o[prop] = v;
      syncPaired(o);
      (o.paired || []).forEach(function (oid) {
        var op = S.openings.find(function (x) { return x.id === oid; });
        if (op) op[prop] = v;
      });
      return v;
    });
  }
  bindFrame("o_fr_jamb", "frJamb", 0, 30);
  bindFrame("o_fr_head", "frHead", 0, 30);
  bindFrame("o_fr_sillw", "frSillW", 0, 30);
  bindFrame("o_fr_depth", "frDepth", 0, 20);
  bindFrame("o_fr_mull", "frMull", 0, 20);
  bindFrame("o_fr_mullv", "frMullV", 0, 12, true);
  bindFrame("o_fr_mullh", "frMullH", 0, 12, true);

  bindLength("o_m_l", function(v) {
    if (S.sel.kind === "opening" && S.sel.ref.overlapL != null) {
      var o = S.sel.ref;
      var currentRight = (o.overlapCenter + o.overlapL/2) - (o.s + o.width/2);
      v = Math.max(0, Math.min(o.overlapL - 20 - currentRight, v));
      var newW = o.overlapL - v - currentRight;
      var newS = o.overlapCenter - o.overlapL/2 + v + newW/2;
      o.width = newW; o.s = newS;
      syncPaired(o);
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  });
  bindLength("o_m_r", function(v) {
    if (S.sel.kind === "opening" && S.sel.ref.overlapL != null) {
      var o = S.sel.ref;
      var currentLeft = (o.s - o.width/2) - (o.overlapCenter - o.overlapL/2);
      v = Math.max(0, Math.min(o.overlapL - 20 - currentLeft, v));
      var newW = o.overlapL - currentLeft - v;
      var newS = o.overlapCenter + o.overlapL/2 - v - newW/2;
      o.width = newW; o.s = newS;
      syncPaired(o);
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  });
  bindLength("o_m_b", function(v) {
    if (S.sel.kind === "opening") {
      S.sel.ref.sill = Math.max(0, v);
      syncPaired(S.sel.ref);
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  });
  bindLength("o_m_t", function(v) {
    if (S.sel.kind === "opening") {
      var w = S.walls.find(function(wa) { return wa.id === S.sel.ref.wall; });
      if (w) {
        S.sel.ref.height = Math.max(20, w.height - S.sel.ref.sill - v);
        syncPaired(S.sel.ref);
        S.dirty3D = true;
        render2D();
        fillProps();
      }
    }
  });

  // room name / floor / wall color
  // The command owns history; ordinary bindNum would create a second checkpoint.
  const resizeInspectorRoom = (width, depth) => {
    if (!S.sel || S.sel.kind !== "room") return;
    resizeSelectedRoom({roomKey:S.sel.ref, width, depth});
    // Also restore the accepted values after a refusal or invalid input.
    fillProps();
  };
  for (const [id, axis] of [["r_w", "width"], ["r_d", "depth"]]) {
    document.getElementById(id).addEventListener("change", function () {
      if (!S.sel || S.sel.kind !== "room") return;
      const size = roomMeasurements(S, roomByKey(S.sel.ref))?.interior;
      if (!size) return;
      const value = this.value.trim() === "" ? NaN : parseFieldLength(this.value, id);
      resizeInspectorRoom(axis === "width" ? value : size.width,
        axis === "depth" ? value : size.depth);
    });
  }
  const bindNudgeBtn = (id, deltaW, deltaD) => {
    document.getElementById(id)?.addEventListener("click", () => {
      if (!S.sel || S.sel.kind !== "room") return;
      const size = roomMeasurements(S, roomByKey(S.sel.ref))?.interior;
      if (size) resizeInspectorRoom(size.width + deltaW, size.depth + deltaD);
    });
  };
  bindNudgeBtn("r_w_down", -10, 0);
  bindNudgeBtn("r_w_up", 10, 0);
  bindNudgeBtn("r_d_down", 0, -10);
  bindNudgeBtn("r_d_up", 0, 10);
  document.getElementById("r_name").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    m.name = this.value;
    render2D();
  });
  document.getElementById("r_floor").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "room") return;
    applyRoomFloor(S.sel.ref, this.value);
  });
  var floorPickBtn = document.getElementById("r_floor_pick");
  if (floorPickBtn)
    floorPickBtn.addEventListener("click", function () {
      runAction("roomFloor");
    });
  document.getElementById("r_floor_scale").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    m.floorScale = parseFloat(this.value);
    S.dirty3D = true;
  });
  document.getElementById("r_floor_bump").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    var val = parseFloat(this.value) / 100;
    m.floorBump = val;
    var lbl = document.getElementById("r_floor_bump_val");
    if (lbl) lbl.textContent = Math.round(val * 100) + "%";
    S.dirty3D = true;
  });
  var currentTexTarget = null;
  document.getElementById("r_wall").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    m.wall = parseInt(this.value.slice(1), 16);
    S.dirty3D = true;
  });

  // global wall color
  document.getElementById("wallcol").addEventListener("input", function () {
    commitPending();
    S.wallColor = parseInt(this.value.slice(1), 16);
    S.dirty3D = true;
  });

  // per-fixture light controls
  document.getElementById("l_on").addEventListener("change", function () {
    var it = selLamp();
    if (!it) return;
    pushHistory();
    it.lightOn = this.checked;
    syncSmartFromLamp(it);
    touchItem3D(it, "build");
    pushDevice(it, { on: this.checked });
  });
  document.getElementById("l_int").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.lightI = parseFloat(this.value);
    syncSmartFromLamp(it);
    document.getElementById("l_intval").textContent =
      Math.round(it.lightI * 100) + "%";
    touchItem3D(it, "build");
    pushDevice(it, { brightness: it.smart ? it.smart.brightness : Math.round(it.lightI * 100) });
  });
  document.getElementById("l_col").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.lightColor = parseInt(this.value.slice(1), 16);
    syncSmartFromLamp(it);
    touchItem3D(it, "build");
    pushDevice(it, { color: this.value });
  });
  
  document.getElementById("l_type").addEventListener("change", function () {
    var it = selLamp();
    if (!it) return;
    pushHistory();
    it.spot = this.value === "spot";
    fillProps();
    touchItem3D(it, "build");
  });
  document.getElementById("l_cone").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.cone = parseFloat(this.value);
    touchItem3D(it, "build");
  });
  document.getElementById("l_pitch").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.pitch = parseFloat(this.value);
    touchItem3D(it, "build");
  });
  
  document.getElementById("o_type_sel").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.isSliding = this.value === "sliding";
    S.sel.ref.isPocket = this.value === "pocket";
    S.sel.ref.isDouble = this.value === "double";
    if (S.sel.ref.isDouble) {
      S.sel.ref.leafA = Number(S.sel.ref.leafA) || S.sel.ref.width / 2;
      S.sel.ref.leafB = S.sel.ref.width - S.sel.ref.leafA;
    }
    fillProps();
    S.dirty3D = true;
    render2D();
  });
  document.getElementById("o_mat").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.mat = this.value;
    fillProps();
    S.dirty3D = true;
  });
  document.getElementById("o_col").addEventListener("input", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    commitPending();
    S.sel.ref.color = this.value;
    S.dirty3D = true;
  });
  document.getElementById("o_swing_dir").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.swingDir = this.value;
    fillProps();
    S.dirty3D = true;
    render2D();
  });
  document.querySelectorAll("#o_swing_grid [data-swing]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!S.sel || S.sel.kind !== "opening") return;
      pushHistory();
      S.sel.ref.swingDir = button.dataset.swing;
      fillProps();
      S.dirty3D = true;
      render2D();
    });
  });
  function setDoorLeaf(which, value) {
    if (!S.sel || S.sel.kind !== "opening" || !S.sel.ref.isDouble) return;
    var o = S.sel.ref, minLeaf = Math.min(20, o.width / 2);
    value = Math.max(minLeaf, Math.min(o.width - minLeaf, value));
    o.leafA = which === "a" ? value : o.width - value;
    o.leafB = o.width - o.leafA;
    return which === "a" ? o.leafA : o.leafB;
  }
  bindLength("o_leaf_a", function (v) { return setDoorLeaf("a", v); });
  bindLength("o_leaf_b", function (v) { return setDoorLeaf("b", v); });
  document.getElementById("o_slide_dir").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.slideDir = this.value;
    S.dirty3D = true;
    render2D();
  });

  var texInput = document.getElementById("texInput");
  if (texInput) {
    texInput.addEventListener("change", function (e) {
      if (!e.target.files.length) return;
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = function(ev) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement("canvas");
          var maxS = 512;
          var w = img.width, h = img.height;
          if (w > maxS || h > maxS) {
            if (w > h) { h = Math.round(h * maxS / w); w = maxS; }
            else { w = Math.round(w * maxS / h); h = maxS; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          
          if (currentTexTarget === "wall" && S.sel && S.sel.kind === "wall") {
            pushHistory();
            S.sel.ref.tex = dataUrl;
            S.dirty3D = true;
          } else if (currentTexTarget === "floor") {
            var m = roomMetaFor();
            if (m) {
              pushHistory();
              m.floorTex = dataUrl;
              S.dirty3D = true;
              render2D();
            }
          }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    });
  }

  // history: snapshot before a continuous edit (commit on first change, cancel if untouched)
  [
    "w_len",
    "w_ang",
    "w_th",
    "w_h",
    "w_split_h",
    "w_bulge",
    "w_top_a",
    "w_top_b",
    "w_base_a",
    "w_base_b",
    "i_w",
    "i_d",
    "i_h",
    "i_rot",
    "i_rot_range",
    "o_w",
    "o_h",
    "o_sill",
    "o_leaf_a",
    "o_leaf_b",
    "o_fr_jamb",
    "o_fr_head",
    "o_fr_sillw",
    "o_fr_depth",
    "o_fr_mull",
    "o_fr_mullv",
    "o_fr_mullh",
    "r_name",
    "r_wall",
    "mk_x",
    "mk_y",
    "mk_z",
    "mk_name",
    "mk_req",
    "mk_note",
    "sv_x",
    "sv_z",
    "sv_w",
    "sv_d",
    "sv_rot",
    "sv_name",
    "nd_x",
    "nd_z",
    "l_int",
    "l_col",
    "l_cone",
    "l_pitch",
    "o_col",
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("focus", beginHistory);
    el.addEventListener("blur", cancelPending);
  });

  // manual "open segment" controls (live preview while a wall is selected)
  function updSeg() {
    if (!S.sel || S.sel.kind !== "wall") {
      S.segPreview = null;
      return;
    }
    var pos = parseFloat(document.getElementById("ow_pos").value) || 0,
      w = parseLen(document.getElementById("ow_w").value) || 0,
      h = parseLen(document.getElementById("ow_h").value) || 0;
    document.getElementById("ow_posval").textContent = fmtLen(pos);
    S.segPreview = { s: pos, width: w, height: h };
    render2D();
  }
  document.getElementById("ow_pos").addEventListener("input", updSeg);
  document.getElementById("ow_w").addEventListener("input", updSeg);
  document.getElementById("ow_h").addEventListener("input", updSeg);

  // tools
  document.querySelectorAll(".tool").forEach(function (b) {
    // the toolbar also holds toggles (the structure lock) that share the .tool
    // chrome but are actions, not tools — those go through runAction instead
    if (!b.getAttribute("data-tool")) return;
    b.addEventListener("click", function () {
      setTool(b.getAttribute("data-tool"));
    });
  });

  function applyToolNames(on) {
    var bar = document.getElementById("plan-toolbar");
    var btn = document.getElementById("toolNamesToggle");
    if (bar) bar.classList.toggle("show-titles", !!on);
    if (btn) {
      btn.classList.toggle("active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    window.dispatchEvent(new Event("resize"));
  }
  function toggleToolNames() {
    var bar = document.getElementById("plan-toolbar");
    var on = bar ? !bar.classList.contains("show-titles") : true;
    applyToolNames(on);
    try { localStorage.setItem("mf_tool_titles", on ? "1" : "0"); } catch (_) {}
  }
  function initToolNames() {
    var on = true;
    try { on = localStorage.getItem("mf_tool_titles") !== "0"; } catch (_) {}
    applyToolNames(on);
  }
  window.__toggleToolNames = toggleToolNames;
  initToolNames();

  function syncWallDrawPalette() {
    var pal = document.getElementById("plan-wall-palette");
    if (!pal) return;
    var wasHidden = pal.hidden;
    pal.hidden = !isWallDrawTool(S.tool);
    // A newly chosen wall tool opens its choices. Once placement begins the
    // palette compacts to one reveal button so it no longer covers the draw.
    if (wasHidden && !pal.hidden) pal.classList.remove("auto-collapsed");
    var collapse = document.getElementById("wallPaletteToggle");
    if (collapse) {
      var expanded = !pal.classList.contains("auto-collapsed");
      collapse.setAttribute("aria-expanded", expanded ? "true" : "false");
      collapse.title = t(expanded ? "wd_collapse" : "wd_expand");
      collapse.setAttribute("aria-label", collapse.title);
      var ci = collapse.querySelector("i");
      if (ci) ci.className = expanded ? "ph ph-caret-left" : "ph ph-sliders-horizontal";
    }
    // These are icon-only toggles whose meaning lives in a `title` tooltip —
    // which touch devices and screen readers never surface. State the choice
    // through aria-pressed and carry the tooltip over as the accessible name.
    var preset = activeWallPresetId();
    pal.querySelectorAll("[data-wall-preset]").forEach(function (b) {
      var on = b.getAttribute("data-wall-preset") === preset;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (!b.getAttribute("aria-label") && b.title) b.setAttribute("aria-label", b.title);
    });
    var from = (S.wallDrawDefaults && S.wallDrawDefaults.from) || "center";
    pal.querySelectorAll("[data-wall-from]").forEach(function (b) {
      var on = b.getAttribute("data-wall-from") === from;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    pal.querySelectorAll(".wd-choice-select").forEach(function (select) {
      select.querySelectorAll("option").forEach(function (option) {
        option.textContent = t(option.dataset.labelKey);
      });
      select.value = select.dataset.choice === "preset" ? preset : from;
      select.setAttribute("aria-label", t(select.dataset.choice === "preset" ? "wd_types" : "wd_from"));
    });
  }
  var pal = document.getElementById("plan-wall-palette");
  if (pal) {
    // Desktop ribbon uses named choices; touch layouts keep the visual buttons.
    [[".wd-types", "data-wall-preset", "preset"], [".wd-loc", "data-wall-from", "from"]].forEach(function (spec) {
      var group = pal.querySelector(spec[0]);
      if (!group) return;
      var select = document.createElement("select");
      select.className = "wd-choice-select";
      select.dataset.choice = spec[2];
      group.querySelectorAll("button").forEach(function (button) {
        var option = document.createElement("option");
        option.value = button.getAttribute(spec[1]);
        option.dataset.labelKey = button.dataset.i18nTitle || button.dataset.i18nAria;
        select.appendChild(option);
      });
      group.after(select);
      select.addEventListener("change", function () {
        if (spec[2] === "preset") setWallDrawPreset(select.value);
        else setWallDrawFrom(select.value);
        syncWallDrawPalette();
        render2D();
      });
    });
    pal.addEventListener("click", function (e) {
      var collapseBtn = e.target.closest("#wallPaletteToggle");
      if (collapseBtn) {
        pal.classList.toggle("auto-collapsed");
        syncWallDrawPalette();
        return;
      }
      var presetBtn = e.target.closest("[data-wall-preset]");
      if (presetBtn) {
        setWallDrawPreset(presetBtn.getAttribute("data-wall-preset"));
        if (!isWallDrawTool(S.tool)) setTool("wall");
        syncWallDrawPalette();
        render2D();
        return;
      }
      var fromBtn = e.target.closest("[data-wall-from]");
      if (fromBtn) {
        setWallDrawFrom(fromBtn.getAttribute("data-wall-from"));
        syncWallDrawPalette();
        render2D();
      }
    });
  }
  window.addEventListener("planner-tool", syncWallDrawPalette);
  window.addEventListener("planner-draw-defaults", syncWallDrawPalette);
  window.addEventListener("planner-draw-start", function () {
    if (pal && !pal.hidden && !pal.closest('.pt-zone[data-zone="top"]')) {
      pal.classList.add("auto-collapsed");
      syncWallDrawPalette();
    }
  });
  onLangChange(syncWallDrawPalette);
  syncWallDrawPalette();

  // display controls
  document.getElementById("cb_dims").addEventListener("change", function () {
    S.showDims = this.checked;
    render2D();
  });
  /* Interior vs centreline dimensions. Switching INTO interior mode re-reads
     every wall's current inside span as its intent, so nothing jumps the moment
     the box is ticked — the geometry only moves on the next edit. */
  var cbInterior = document.getElementById("cb_interior");
  if (cbInterior)
    cbInterior.addEventListener("change", function () {
      S.interiorDims = this.checked;
      if (S.interiorDims) S.walls.forEach(captureClear);
      render2D();
      fillProps();
    });
  document.querySelectorAll(".snap-toggle").forEach(function (cb) {
    cb.addEventListener("change", function () {
      S.snapObj = this.checked;
      document.querySelectorAll(".snap-toggle").forEach(function (other) {
        other.checked = S.snapObj;
      });
    });
  });
  /* Automatic facing (js/item_orient.js). Same shape as the snap toggle it
     sits next to, because it is the same kind of promise: the editor may help
     while you drag, and this is the switch that stops it. */
  document.querySelectorAll(".face-toggle").forEach(function (cb) {
    cb.checked = S.autoFace !== false;
    cb.addEventListener("change", function () {
      S.autoFace = this.checked;
      document.querySelectorAll(".face-toggle").forEach(function (other) {
        other.checked = S.autoFace;
      });
    });
  });
  syncRotStepUI();
  document.getElementById("cb_invisible_roof").addEventListener("change", function () {
    S.invisibleRoof = this.checked;
    S.dirty3D = true;
    window.dispatchEvent(new Event("planner-navigation-restored"));
  });
  document.getElementById("cb_ceil").addEventListener("change", function () {
    S.showCeiling = this.checked;
    S.dirty3D = true;
  });
  document.getElementById("floorsel").addEventListener("change", function () {
    S.floorTex = this.value;
    S.dirty3D = true;
    render2D();
  });

  // environment (sun updates live, no full rebuild)
  document.getElementById("hour").addEventListener("input", function () {
    S.hour = parseFloat(this.value);
    document.getElementById("hourval").textContent = fmtHour(S.hour);
    applyEnv();
  });
  document.getElementById("north").addEventListener("input", function () {
    S.northAngle = parseFloat(this.value);
    document.getElementById("northval").textContent = compass(S.northAngle);
    applyEnv();
    render2D();
  });

  // placeholder-point inspector: position (carries the object standing on it)
  // and a free-text name for the plan label
  bindLength("mk_x", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, v, S.sel.ref.y, S.sel.ref.z);
    refreshMarkerReadout();
  });
  bindLength("mk_y", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, S.sel.ref.x, Math.max(0, v), S.sel.ref.z);
    refreshMarkerReadout();
  });
  bindLength("mk_z", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, S.sel.ref.x, S.sel.ref.y, v);
    refreshMarkerReadout();
  });
  var mkSurf = document.getElementById("mk_surface");
  if (mkSurf)
    mkSurf.addEventListener("change", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      pushHistory();
      setMarkerSurface(S.sel.ref, this.value);
      S.dirty3D = true;
      refreshMarkerReadout();
      refreshTree();
      render2D();
    });
  /* The selected dimension's own value. `change` rather than `input`, unlike
     the geometry fields: every keystroke here re-solves the whole constraint
     set and moves corners, so typing "240" would drag the plan to 2 cm and
     then to 24 cm on the way. */
  document.getElementById("con_value").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    var unit = conUnit(S.sel.ref);
    var v = unit === "deg" ? parseFloat(this.value) : parseLen(this.value, "plan");
    if (!Number.isFinite(v)) return;
    pushHistory();
    setConValue(S.sel.ref.id, v);
    var r = solveWallCons();
    if (r.unresolved) flash(t("wc_unresolved", { n: r.unresolved }), "error");
    fillProps();
    refreshTree();
    renderWarnPanel(true);
  });

  /* Report and suppress are the two ways to stop a dimension driving, and they
     are different: a suppressed dimension is switched off, a reference one is
     still measured and still shown — it simply has no say in where the
     geometry goes. */
  document.getElementById("con_report").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    pushHistory();
    setConReport(S.sel.ref.id, this.checked);
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); renderWarnPanel(true);
  });
  document.getElementById("con_off").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    pushHistory();
    setConSuppressed(S.sel.ref.id, this.checked);
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); renderWarnPanel(true);
  });

  /* Typing a corner's coordinates moves the junction itself, so every wall
     meeting it follows — the keyboard equivalent of dragging the bare corner,
     including the re-capture of what those walls now measure. */
  function moveJoint(x, z) {
    if (!S.sel || S.sel.kind !== "node") return;
    var n = S.nodes[S.sel.ref];
    if (!n) return;
    commitPending();
    if (fin(x)) n.x = x;
    if (fin(z)) n.z = z;
    solveWallCons();
    S.walls.forEach(function (w) {
      if (w.a !== S.sel.ref && w.b !== S.sel.ref) return;
      captureLock(w);
      captureClear(w);
    });
    S.dirty3D = true;
    fillProps();
  }
  bindLength("nd_x", function (v) {
    moveJoint(v, null);
  });
  bindLength("nd_z", function (v) {
    moveJoint(null, v);
  });

  /* The point's brief: how much clear space this spot is supposed to keep, and
     a free-text note about what it is for. Neither moves anything — they change
     what the readouts (and the plan's hover card) say about the spot, which is
     the whole job of a placeholder. An empty required-clearance field means
     "no requirement", so it is cleared rather than parsed as 0. */
  var mkReq = document.getElementById("mk_req");
  if (mkReq)
    mkReq.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      var v = parseLen(this.value);
      S.sel.ref.req = this.value === "" || !Number.isFinite(v) ? null : Math.max(0, v);
      refreshMarkerReadout();
      render2D();
    });
  var mkNote = document.getElementById("mk_note");
  if (mkNote)
    mkNote.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      S.sel.ref.note = this.value.slice(0, 80);
      render2D();
    });
  var mkName = document.getElementById("mk_name");
  if (mkName)
    mkName.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      S.sel.ref.name = this.value.slice(0, 24);
      refreshMarkerReadout();
      refreshTree();
      render2D();
    });

  bindLength("sv_x", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.x = v;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
  });
  bindLength("sv_z", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.z = v;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
  });
  bindLength("sv_w", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.w = Math.max(40, v);
    return S.sel.ref.w;
  });
  bindLength("sv_d", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.d = Math.max(40, v);
    return S.sel.ref.d;
  });
  bindNum("sv_rot", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.rot = ((v % 360) + 360) % 360;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
    return S.sel.ref.rot;
  });
  var svName = document.getElementById("sv_name");
  if (svName)
    svName.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "slabvoid") return;
      commitPending();
      S.sel.ref.name = this.value.slice(0, 32);
      document.getElementById("selname_sv").textContent = S.sel.ref.name || t("sv_title");
      refreshTree();
      render2D();
    });

  var addfurnBtn = document.getElementById("addfurn");
  if (addfurnBtn) {
    addfurnBtn.addEventListener("click", function () {
      var type = document.getElementById("furnsel").value;
      addFurnItem(type);
    });
  }

  const themes = ["light", "soft", "mid", "dark", "chrome"];
  /* The inline bootstrap in index.html has already resolved and applied the
     starting theme, and with nothing stored that answer comes from the
     browser's prefers-color-scheme. Re-deriving it from localStorage alone
     here would overwrite that with light on every dark-mode boot, so an
     explicit stored choice wins first and the bootstrap's answer second. */
  var curTheme = localStorage.getItem("home3d_theme");
  if (!themes.includes(curTheme)) curTheme = document.documentElement.getAttribute("data-theme");
  if (!themes.includes(curTheme)) curTheme = "light";

  const updateThemeIcon = (theme) => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const icon = btn.querySelector("i");
    if (icon) {
      icon.className = theme === "chrome" ? "ph ph-google-chrome-logo" : (theme === "dark" ? "ph ph-moon" : (theme === "mid" ? "ph ph-cloud-sun" : (theme === "soft" ? "ph ph-cloud" : "ph ph-sun")));
    }
    var label = t("theme_" + theme) + " · " + t("theme_click");
    btn.title = label;
    btn.setAttribute("aria-label", label);
  };

  function applyTheme(theme, persist) {
    if (!themes.includes(theme)) theme = "light";
    curTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    if (persist !== false) localStorage.setItem("home3d_theme", theme);
    updateThemeIcon(theme);
    if (persist === false) return;
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
    render2D();
    S.dirty3D = true;
  }

  applyTheme(curTheme, false);
  onLangChange(function () { updateThemeIcon(curTheme); });

  document.getElementById("themeToggle").addEventListener("click", function () {
    let idx = themes.indexOf(curTheme);
    if (idx === -1) idx = 0;
    applyTheme(themes[(idx + 1) % themes.length]);
  });

  // Mobile drawer toggles
  document.getElementById("toggle-left") &&
    document
      .getElementById("toggle-left")
      .addEventListener("click", function (e) {
        document.body.classList.toggle("show-left");
        document.body.classList.remove("show-right");
        syncNavPanels();
      });
  document.getElementById("toggle-right") &&
    document
      .getElementById("toggle-right")
      .addEventListener("click", function (e) {
        document.body.classList.toggle("show-right");
        document.body.classList.remove("show-left");
        syncNavPanels();
      });
  document.getElementById("center-canvas") &&
    document
      .getElementById("center-canvas")
      .addEventListener("click", function (e) {
        document.body.classList.remove("show-left");
        document.body.classList.remove("show-right");
        syncNavPanels();
      });

  // Mobile bottom nav + backdrop
  function closeDrawers() {
    document.body.classList.remove("show-left", "show-right");
    syncNavPanels();
  }
  /* The nav's two panel buttons are toggles, so they have to read as pressed
     while their drawer is open — otherwise the only way to tell whether a tap
     landed is to look for the drawer that is covering the screen anyway. The
     three view buttons are highlighted from main.js (syncMobileNav). */
  function syncNavPanels() {
    var b = document.body;
    document.querySelectorAll("#mobile-nav [data-mnav]").forEach(function (el) {
      var k = el.dataset.mnav;
      if (k !== "left" && k !== "right") return;
      var open = b.classList.contains(k === "left" ? "show-left" : "show-right");
      el.classList.toggle("active", open);
      el.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  var backdrop = document.getElementById("drawer-backdrop");
  backdrop && backdrop.addEventListener("click", closeDrawers);

  /* Swipe a drawer back off the edge it came from. The backdrop tap already
     closes it, but on a phone the drawer covers most of the screen and the
     sliver of backdrop left over is a poor target — the gesture is the one
     that needs no aiming. Direction is per-drawer and mirrored for RTL, so
     "away from the edge it is anchored to" always means the same thing. */
  ["left-sidebar", "right-inspector"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var sx = 0,
      sy = 0,
      live = false;
    el.addEventListener(
      "touchstart",
      function (e) {
        live = e.touches.length === 1;
        if (!live) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true },
    );
    el.addEventListener(
      "touchmove",
      function (e) {
        if (!live || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - sx,
          dy = e.touches[0].clientY - sy;
        // A mostly-vertical drag is the panel's own scroll; leave it alone.
        if (Math.abs(dy) > Math.abs(dx)) {
          live = false;
          return;
        }
        var rtl = document.documentElement.dir === "rtl";
        var outward = id === "left-sidebar" ? (rtl ? 1 : -1) : rtl ? -1 : 1;
        if (dx * outward > 70) {
          live = false;
          closeDrawers();
        }
      },
      { passive: true },
    );
    el.addEventListener("touchend", function () {
      live = false;
    });
  });

  /* The bottom nav itself is owned by js/mobile_shell.js (View / Tools / Add /
     Properties / More, each opening a sheet). Only the drawer plumbing above —
     backdrop tap, outward swipe, closeDrawers — is still shared with it. */
  syncNavPanels();

  /* The bottom nav is for fingers, not for narrow windows: a tablet is as wide
     as a laptop and still has no cursor, so it needs the one-tap pane switcher
     as much as a phone does. A narrow desktop window keeps the hamburgers. */
  var coarse = null;
  try {
    coarse = window.matchMedia("(pointer: coarse)");
  } catch (_) {}
  /* A posture change RETARGETS the closed panels' resting transform — the side
     drawer parks at translateX(±100%), the phone sheet at translateY(100%) —
     and `transition: transform` on #left-sidebar/#right-inspector happily
     animates between the two. Until this first pass runs, the markup is still
     in the side-drawer posture, so on every phone load both closed panels flew
     in across the canvas at negative x. The transition belongs to opening and
     closing a panel, not to deciding which shape it has, so posture settles
     with `.posture-ready` off and CSS holds the transition until the new
     resting place has been painted. */
  var posturePrev = "";
  function settlePosture() {
    /* Two frames: one for the new posture's resting transform to be computed
       and painted, one to be sure it was, before the transition comes back. A
       single frame still hands the animation the old position to start from. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add("posture-ready");
      });
    });
  }
  function applyCompactNav() {
    /* Posture is a pure function of CSS pixels + touch (js/chrome_posture.js).
       An unfolded Fold's inner display reports one segment, so hinge media
       queries never match there — roomy is both-axes tablet-sized instead. */
    var p = windowChromePosture();
    var flipped = document.body.classList.contains("compact-nav") !== p.compact;
    var key = [p.compact, p.dockRail, p.sheetDrawers, p.splitRow].join("|");
    var settled = key !== posturePrev;
    if (settled) {
      posturePrev = key;
      document.body.classList.remove("posture-ready");
    }
    document.body.classList.toggle("compact-nav", p.compact);
    // The floor strip hides itself on a compact layout while there is only one
    // floor; crossing the threshold has to re-ask it, or it stays hidden on a
    // desktop window that was merely narrow a moment ago.
    if (flipped && window.__plannerChrome) window.__plannerChrome.renderFloorTabs();
    document.body.classList.toggle("dock-rail", p.dockRail);
    document.body.classList.toggle("sheet-drawers", p.sheetDrawers);
    document.body.classList.toggle("split-row", p.splitRow);
    if (settled) settlePosture();
    window.dispatchEvent(new CustomEvent("mf-posture"));
  }
  coarse &&
    (coarse.addEventListener
      ? coarse.addEventListener("change", applyCompactNav)
      : coarse.addListener(applyCompactNav));
  window.addEventListener("resize", applyCompactNav);
  applyCompactNav();

  // Galaxy Fold (and other foldables): when the app spans both halves of an
  // unfolded screen, tag the body so CSS can lay the 2D/3D panes side by side
  // across the hinge instead of stacking them over it. Two postures, opposite
  // answers: a vertical crease (side-by-side segments) wants the panes in a
  // row so the seam falls between them; a horizontal crease (a laptop-style
  // half-open book) wants them stacked, for the same reason.
  function foldMq(list) {
    return list
      .map(function (q) {
        try {
          return window.matchMedia(q);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  }
  var vFoldQueries = foldMq([
    "(horizontal-viewport-segments: 2)",
    "(screen-spanning: single-fold-vertical)",
  ]);
  var hFoldQueries = foldMq([
    "(vertical-viewport-segments: 2)",
    "(screen-spanning: single-fold-horizontal)",
  ]);
  function anyMatch(qs) {
    return qs.some(function (mq) {
      return mq.matches;
    });
  }
  function applyFoldSpan() {
    document.body.classList.toggle("fold-span", anyMatch(vFoldQueries));
    document.body.classList.toggle("fold-stack", anyMatch(hFoldQueries));
  }
  vFoldQueries.concat(hFoldQueries).forEach(function (mq) {
    mq.addEventListener
      ? mq.addEventListener("change", applyFoldSpan)
      : mq.addListener(applyFoldSpan);
  });
  applyFoldSpan();

  // Topbar dropdown menus (File / Edit / Export / More). Portaled to <body>
  // because the glass topbar's backdrop-filter would clip a position:fixed
  // child. Open/close/pin/path live in js/dropdown_menus.js so customize-mode
  // pinning and nested submenus cannot drift from a click on a trigger.
  initDropdownMenus(document, {
    onAction: function (act) { runAction(act); },
    selectionKind: function () { return S.sel ? S.sel.kind : null; },
  });

  // Collapsible panel sections (click header to fold)
  document.querySelectorAll(".panel-section > h3").forEach(function (h) {
    h.addEventListener("click", function () {
      h.parentElement.classList.toggle("collapsed");
    });
  });
  // constraint-engine warning list (js/ui_warn.js)
  initWarnPanel();
  renderParams(); // the plan-parameter list is generated, like the warning list
  // the edit tree (js/ui_history.js), scoped to whatever is selected
  mountHistoryPanel(document.getElementById("planHist"));

  function handleActionClick(e) {
    var act = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
    if (!act) {
      // try parent
      var p = e.target.closest("button");
      if (p) act = p.getAttribute("data-act");
      if (!act) return;
    }
    runAction(act, e); // the click itself, so an action can read its modifiers
  }

  // Single dispatch point for every named action. Menus, toolbar buttons and
  // keyboard shortcuts all funnel through here, so a shortcut can never drift
  // from what the matching menu item does.
  /* One dispatch point, one global handle. js/mobile_shell.js builds its rows
     at runtime and cannot use the delegated [data-act] listeners bound to the
     static chrome, so it calls in here instead of duplicating any behaviour. */
  window.__runAction = runAction;
  async function runAction(act, ev) {
    if (S.workspace && S.workspace.role === "viewer") {
      var readOnlyActions = ["workspace", "frame", "drawing3d", "walk", "walkview", "freemove", "photo", "png2d", "png3d", "exportjson", "exportgltf", "exportCost", "tree", "shortcuts", "plannerTutorial", "viewPlan", "view3d", "viewSplit", "openModeler", "friends", "toggleLegacy", "newPlan", "toggleToolNames"];
      if (readOnlyActions.indexOf(act) < 0) {
        flash("Viewer access is read-only", "error");
        return;
      }
    }
    if (act === "addFloor") {
      window.__plannerChrome && window.__plannerChrome.addFloorFromUI();
    } else if (act === "undo") undo();
    else if (act === "redo") redo();
    else if (act === "wallTypeEditor") openWallTypeEditorDialog();
    else if (act === "exportWallSchedule") exportWallScheduleFile();
    else if (act === "lockStruct") setLockStruct(!S.lockStruct);
    else if (act === "toggleToolNames") toggleToolNames();
    else if (act === "edit3d") setEdit3D(!S.edit3D);
    else if (act === "drawing3d") {
      const on = toggleDrawing3D();
      const button = document.getElementById("drawing3dBtn");
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    }
    else if (act === "workspace") (await import("./workspace.js")).openWorkspace();
    else if (act === "openModeler") (await import("./modeler.js")).openModeler();
    else if (act === "uikitCustomize") (await import("./uikit_host/index.js")).openCustomize();
    else if (act === "plannerTutorial") (await import("./planner_tutorial.js")).showPlannerHub();
    else if (act === "agent") (await import("./ui_agent.js")).openAgent();
    else if (act === "friends") {
      var fb = document.getElementById("friendsBtn");
      if (fb) fb.click();
    } else if (act === "toggleLegacy") {
      if (window.__plannerChrome) window.__plannerChrome.toggleLegacyUI();
    } else if (act === "newPlan") {
      if (window.__plannerChrome) window.__plannerChrome.openStartScreen();
    } else if (act === "viewPlan") {
      if (typeof window.__setViewMode === "function") window.__setViewMode("plan");
      try { localStorage.setItem("home3d_viewmode", "plan"); } catch (_) {}
    } else if (act === "view3d") {
      if (typeof window.__setViewMode === "function") window.__setViewMode("3d");
      try { localStorage.setItem("home3d_viewmode", "3d"); } catch (_) {}
    } else if (act === "viewSplit") {
      if (typeof window.__setViewMode === "function") window.__setViewMode("split");
      try { localStorage.setItem("home3d_viewmode", "split"); } catch (_) {}
    } else if (act === "hintRect") {
      setTool("rect");
    } else if (act === "hintDoor") {
      setTool("door");
    } else if (act === "hintLibrary") {
      if (window.__plannerChrome) window.__plannerChrome.setLeftTab("library");
    } else if (act === "deleteSel") {
      deleteSel();
      updateCost();
    } else if (act === "slabFromStairs") {
      if (!S.sel || S.sel.kind !== "item" || S.sel.ref.type !== "stairs") return;
      pushHistory();
      /* The void cuts the slab the stairs LAND on, so it belongs to the storey
         above — putting it on the stairs' own storey punched a hole at the
         bottom of the flight. With no storey above there is nothing to cut, so
         say so rather than silently making a hole in this floor. */
      var above = floorAbove();
      var vo = stairVoidFields(S.sel.ref);
      if (!vo) return;
      if (above) {
        addSlabOpeningToFloor(above.id, vo);
        S.dirty3D = true;
        render2D();
        refreshTree();
        flash(t("sv_on_floor", { floor: above.name }), "success");
      } else {
        flash(t("sv_need_floor_above"), "error");
      }
    } else if (act === "dupSel") {
      dupSel();
      updateCost();
    } else if (act === "roomFloor") {
      if (!S.sel || S.sel.kind !== "room") return;
      var rfKey = S.sel.ref;
      (await import("./ui_floorpick.js")).openFloorPicker(roomFloor(rfKey), function (type) {
        /* The room can be deselected while the picker is open (it is a modal
           over a live plan, not a modal over a frozen one), so the pick is
           applied to the key it was opened FOR rather than to whatever is
           selected when it closes. */
        applyRoomFloor(rfKey, type);
      });
    } else if (act === "prodSize") {
      (await import("./ui_prodsize.js")).openProdSizeDialog();
    } else if (act === "pvAdd") {
      addParam();
    } else if (act === "rcArea" || act === "rcMinDim" || act === "rcRect") {
      if (!S.sel || S.sel.kind !== "room") return;
      if (runRoomConAction(act, S.sel.ref)) { refreshTree(); renderWarnPanel(true); }
    } else if (AL_ACTS[act]) {
      /* Align / distribute / match rotation on a multi-item selection. All of
         them are edits to positions, so all of them are undoable and all of
         them re-touch the 3D transforms of what they moved. */
      if (!S.sel || S.sel.kind !== "items") return;
      var picks = S.sel.refs, verb = AL_ACTS[act], n = 0;
      pushHistory();
      if (verb.kind === "align") n = alignItems(picks, verb.how);
      else if (verb.kind === "dist") n = distributeItems(picks, verb.how);
      else n = matchRotation(picks);
      if (!n) return void flash(t("al_none"));
      picks.forEach(function (it) { touchItem3D(it, verb.kind === "rot" ? "rot" : "move"); });
      S.dirty3D = true;
      fillProps(); render2D(); refreshTree(); updateCost();
      flash(t("al_done", { n: n }));
    } else if (act === "groupItems") {
      if (S.sel && S.sel.kind === "items") {
        pushHistory();
        var gid = uid();
        S.sel.refs.forEach(function(it) { it.groupId = gid; });
        flash("Items grouped");
      }
    } else if (act === "ungroupItems") {
      if (S.sel && S.sel.kind === "items") {
        pushHistory();
        S.sel.refs.forEach(function(it) { delete it.groupId; });
        flash("Items ungrouped");
      }
    } else if (act === "mkPlace") {
      // browse the library and put the chosen piece on the selected point
      // (replacing whatever stood there — addFurnItem handles swap + history).
      // The point stays selected while the browser is open, which is exactly
      // what makes addFurnItem seat the piece instead of dropping it mid-view.
      if (S.sel && S.sel.kind === "marker") {
        var mkHeld = markerItem(S.sel.ref);
        openLibraryPicker(
          function (type) {
            if (S.sel && S.sel.kind === "marker") addFurnItem(type);
          },
          { current: mkHeld ? mkHeld.type : null, title: t("mk_pick_title") }
        );
      }
    } else if (act === "mkRelease") {
      // unpair without touching the object: the point is free again, the
      // object stays exactly where it is
      if (S.sel && S.sel.kind === "marker" && markerItem(S.sel.ref)) {
        pushHistory();
        detachMarker(S.sel.ref);
        fillProps();
        refreshTree();
        render2D();
      }
    } else if (act === "ndSquare") {
      /* Swing the arm about this corner to the nearest right angle from
         the arm that stays. Its LENGTH is preserved — the complaint being
         fixed is the angle, and shortening a wall to square it would trade one
         wrong number for another. */
      if (S.sel && S.sel.kind === "node") {
        pushHistory();
        var sq = squareJoint(S.sel.ref);
        if (sq) flash(squaredMsg(sq));
        else flash(t("f_squareBlocked"), "error");
      }
    } else if (act === "ndSetAngle") {
      if (S.sel && S.sel.kind === "node") showJointAngleDialog(S.sel.ref);
    } else if (act === "ndPin") togglePinSelected();
    else if (act === "ndCoincident") applyNodePairRelation("coincident");
    else if (act === "ndSymmetric") applyNodePairRelation("symmetric");
    else if (act === "ndSymmetricPerp") applyNodePairRelation("symmetricPerp");
    else if (act === "ndCompareAngle") {
      /* Same relation as "Equal angles", authored as a REFERENCE dimension:
         it reads both corners and their difference instead of forcing them
         together. The comparison and the correction are one keystroke apart
         on purpose — you usually want to look before you straighten. */
      S.nodePairReport = true;
      applyNodePairRelation("equalAngle");
      S.nodePairReport = false;
    } else if (act === "ndJoin") applyNodePairRelation("join");
    else if (act === "ndDistance") applyNodePairRelation("distance");
    else if (act === "ndAlignX") applyNodePairRelation("alignX");
    else if (act === "ndAlignZ") applyNodePairRelation("alignZ");
    else if (act === "ndDistanceX") applyNodePairRelation("axisDistX");
    else if (act === "ndDistanceZ") applyNodePairRelation("axisDistZ");
    else if (act === "ndEqualAngle") applyNodePairRelation("equalAngle");
    else if (act === "wmFillet") {
      var radiusInput = document.getElementById("wm_fillet_radius");
      var filletResult = filletSelectedWalls(radiusInput ? Number(radiusInput.value) : 30);
      if (filletResult.ok) flash(t("wm_fillet_done"), "success");
      else {
        var filletError = {
          selection: "wm_fillet_selection",
          radius: "wm_fillet_large",
          "not-shared": "wm_fillet_not_shared",
          "curved-input": "wm_fillet_curved",
          "too-large": "wm_fillet_large",
          hosted: "wm_fillet_hosted",
        }[filletResult.reason] || "wm_fillet_large";
        flash(t(filletError), "error");
      }
    }
    else if (act === "wmChamfer") {
      var chamferInput = document.getElementById("wm_chamfer_distance");
      var chamferResult = chamferSelectedWalls(chamferInput ? Number(chamferInput.value) : 30);
      if (chamferResult.ok) flash(t("wm_chamfer_done"), "success");
      else {
        var chamferError = {
          selection: "wm_fillet_selection",
          distance: "wm_fillet_large",
          "not-shared": "wm_fillet_not_shared",
          "curved-input": "wm_fillet_curved",
          "too-large": "wm_fillet_large",
          collinear: "wm_chamfer_collinear",
          hosted: "wm_fillet_hosted",
        }[chamferResult.reason] || "wm_fillet_large";
        flash(t(chamferError), "error");
      }
    }
    else if (["wmParallel", "wmPerpendicular", "wmCollinear", "wmEqualLength", "wmOffset", "wmEqualSpacing", "wmWallAngle", "wmEqualLenSet"].indexOf(act) !== -1) {
      if (S.sel && S.sel.kind === "walls") {
        var selectedWalls = S.sel.refs;
        var relation = null;
        pushHistory();
        if (act === "wmEqualSpacing") relation = addEqualSpacing(selectedWalls.map(function (w) { return w.id; }));
        else if (act === "wmEqualLenSet") relation = addEqualLengthSet(selectedWalls.map(function (w) { return w.id; }));
        else if (act === "wmWallAngle")
          // the SECOND selected wall is the reference, matching the
          // driven-first convention the rest of this palette uses
          relation = addWallAngle(selectedWalls[0].id, selectedWalls[1].id, null);
        else if (selectedWalls.length === 2) {
          var driven = selectedWalls[1].id, reference = selectedWalls[0].id;
          relation = act === "wmOffset" ? addOffset(driven, reference, null) : addWallRelation({
            wmParallel: "parallel", wmPerpendicular: "perpendicular",
            wmCollinear: "collinear", wmEqualLength: "equalLength",
          }[act], driven, reference);
        }
        if (relation) {
          solveWallCons(); fillProps(); render2D(); refreshTree();
          flash("Wall relation added", "success");
        } else flash("This relation does not fit the selected walls", "error");
      }
    }
    else if (act === "mkDup") {
      // a second spot with the same brief, offset so the copy is not hidden
      // under the original; the copy is selected because it is what you came
      // to position
      if (S.sel && S.sel.kind === "marker") {
        pushHistory();
        var cp = duplicateMarker(S.sel.ref, 30, 30);
        if (cp) select({ kind: "marker", ref: cp });
        refreshTree();
        render2D();
      }
    } else if (act === "mkGoItem") {
      var goIt = S.sel && S.sel.kind === "marker" ? markerItem(S.sel.ref) : null;
      if (goIt) {
        select({ kind: "item", ref: goIt });
        render2D();
      }
    } else if (act === "autoGenerate") {
      var dlg = openModal(t("auto_gen"));
      function selRow(lblKey, opts) {
        var row = document.createElement("div");
        row.className = "bp-row";
        var lbl = document.createElement("label");
        var sp = document.createElement("span");
        sp.textContent = t(lblKey);
        var sel = document.createElement("select");
        opts.forEach(function (o) {
          var op = document.createElement("option");
          op.value = o[0];
          op.textContent = t(o[1]);
          sel.appendChild(op);
        });
        lbl.appendChild(sp);
        lbl.appendChild(sel);
        row.appendChild(lbl);
        dlg.body.appendChild(row);
        return sel;
      }
      var sizeSel = selRow("ag_size", [
        ["small", "ag_small"],
        ["large", "ag_large"],
        ["random", "ag_random"],
      ]);
      var repSel = selRow("ag_action", [
        ["replace", "ag_replace"],
        ["append", "ag_append"],
      ]);
      var btnCancel = document.createElement("button");
      btnCancel.textContent = t("cancel");
      btnCancel.onclick = dlg.close;
      var btnGen = document.createElement("button");
      btnGen.className = "btn-accent";
      btnGen.innerHTML = '<i class="ph ph-magic-wand"></i> ';
      btnGen.appendChild(document.createTextNode(t("ag_create")));
      btnGen.onclick = async function () {
        var sz = sizeSel.value;
        var rep = repSel.value === "replace";
        dlg.close();
        var loaded = await Promise.all([
          import("./generator.js"),
          import("./mep_auto.js"),
        ]);
        var generated = executeCommand(loaded[0].apartmentGenerateCommand, {
          size: sz,
          replace: rep,
          seed: sz === "random" ? Math.floor(Math.random() * 0xffffffff) : 1,
        }, {
          domain: "planner",
          state: S,
          history: UI_COMMAND_HISTORY,
          version: { current: currentHistoryId },
        }, { label: t("ag_generated") });
        if (!generated.ok) {
          flash(t(generated.reason === "PROTECTED_STRUCTURE" ? "redesign_protected" : "f_placeFail"), "error");
          return;
        }
        loaded[1].autoInfrastructure(); // rough-in electrical/water/drain/comms for the new rooms
        refreshMEPPanel();
        S.dirty3D = true;
        render2D();
        // the generator names its own rooms — don't prompt for each one
        withoutRoomPrompts(refreshTree);
        fitView();
        flash(t("ag_generated"), "success");
      };
      dlg.actions.appendChild(btnCancel);
      dlg.actions.appendChild(btnGen);
    } else if (act === "autoArrange") {
      autoArrangeAll();
    } else if (act === "addroom") addSpace(340, 280, t("room"));
    else if (act === "addcorr") addSpace(110, 320, t("corridor"), true);
    else if (act === "keepAutoOpen") {
      if (S.sel && S.sel.kind === "room") {
        var rMeta = S.roomMeta[S.sel.ref];
        if (rMeta && rMeta.autoOpenings) {
          pushHistory();
          var oids = rMeta.autoOpenings;
          if (oids && oids.length > 0) {
            var firstOp = S.openings.find(function(o) { return o.id === oids[0]; });
            if (firstOp) {
              var wall = S.walls.find(function(w) { return w.id === firstOp.wall; });
              if (wall) {
                var adjKey = Object.keys(S.roomMeta).find(function(k) { return k.split(",").indexOf(String(wall.id)) > -1; });
                if (adjKey) {
                  rMeta.floor = roomFloor(adjKey);
                  S.dirty3D = true;
                }
              }
            }
          }
          delete rMeta.autoOpenings;
          fillProps();
        }
      }
    } else if (act === "customAutoOpen") {
      if (S.sel && S.sel.kind === "room") {
        var rMeta = S.roomMeta[S.sel.ref];
        if (rMeta && rMeta.autoOpenings) {
          pushHistory();
          var oids = rMeta.autoOpenings;
          var firstOp;
          if (oids && oids.length > 0) {
            oids.forEach(function(oid) {
              var op = S.openings.find(function(o) { return o.id === oid; });
              if (op) {
                op.width = Math.max(40, op.overlapL - 10);
                op.height = 210;
                if (!firstOp) firstOp = op;
              }
            });
            S.dirty3D = true;
            render2D();
          }
          delete rMeta.autoOpenings;
          if (firstOp) {
            select({ kind: "opening", ref: firstOp });
          } else {
            fillProps();
          }
        }
      }
    } else if (act === "frameReset") {
      if (S.sel && S.sel.kind === "opening") {
        pushHistory();
        var fo = S.sel.ref;
        var fTargets = fo.paired
          ? fo.paired.map(function (id) { return S.openings.find(function (op) { return op.id === id; }); })
          : [fo];
        fTargets.forEach(function (op) {
          if (!op) return;
          ["frJamb", "frHead", "frSillW", "frDepth", "frMull", "frMullV", "frMullH"].forEach(function (k) {
            delete op[k];
          });
        });
        S.dirty3D = true;
        render2D();
        fillProps();
      }
    } else if (act === "makeSeamless") {
      if (S.sel && S.sel.kind === "opening") {
        pushHistory();
        var o = S.sel.ref;
        var targets = o.paired ? o.paired.map(function(id) { return S.openings.find(function(op) { return op.id === id; }); }) : [o];
        targets.forEach(function(op) {
          if (op && op.overlapL != null) {
            op.width = op.overlapL;
            op.s = op.overlapCenter;
            op.sill = 0;
            var wWall = S.walls.find(function(w) { return w.id === op.wall; });
            if (wWall) op.height = wWall.height;
          }
        });
        S.dirty3D = true;
        render2D();
        fillProps();
      }
    } else if (act === "matchFloor") {
      if (S.sel && S.sel.kind === "opening") {
        pushHistory();
        var o = S.sel.ref;
        var oWall = S.walls.find(function(w) { return w.id === o.wall; });
        if (oWall) {
          import("./geometry.js").then(function(geom) {
            var og = geom.wallGeom(oWall);
            var px = og.a.x + og.ux * o.s, pz = og.a.z + og.uz * o.s;
            var nearbyKeys = [];
            Object.keys(S.roomMeta).forEach(function(k) {
              var wids = k.split(",");
              var hasNear = S.walls.some(function(w) {
                if (wids.indexOf(String(w.id)) === -1) return false;
                var wg = geom.wallGeom(w);
                return geom.distSeg(px, pz, wg.a.x, wg.a.z, wg.b.x, wg.b.z) < w.thickness/2 + 20;
              });
              if (hasNear) nearbyKeys.push(k);
            });
            if (nearbyKeys.length > 1) {
              if (nearbyKeys.length === 2) {
                var srcFloor = geom.roomFloor(nearbyKeys[0]);
                if (S.roomMeta[nearbyKeys[0]].isCorridor) srcFloor = geom.roomFloor(nearbyKeys[1]);
                nearbyKeys.forEach(function(k) {
                  S.roomMeta[k].floor = srcFloor;
                });
                S.dirty3D = true;
                render2D();
                flash(t("f_floorMatched"), "success");
              } else {
                var dlgMf = openModal(t("match_floor"));
                var list = document.createElement("div");
                list.className = "modal-list";
                nearbyKeys.forEach(function (k) {
                  var b = document.createElement("button");
                  var rName = (S.roomMeta[k] && S.roomMeta[k].name) || t("room");
                  b.innerHTML = '<i class="ph ph-squares-four"></i> ';
                  b.appendChild(
                    document.createTextNode(
                      rName + " (" + t("floor_" + geom.roomFloor(k)) + ")"
                    )
                  );
                  b.onclick = function () {
                    var srcFloor = geom.roomFloor(k);
                    nearbyKeys.forEach(function (k2) {
                      S.roomMeta[k2].floor = srcFloor;
                    });
                    S.dirty3D = true;
                    render2D();
                    flash(t("f_floorMatched"), "success");
                    dlgMf.close();
                  };
                  list.appendChild(b);
                });
                dlgMf.body.appendChild(list);
                var closeBtn = document.createElement("button");
                closeBtn.textContent = t("cancel");
                closeBtn.onclick = dlgMf.close;
                dlgMf.actions.appendChild(closeBtn);
              }
            } else {
              flash(t("f_noAdjRoom"), "error");
            }
          });
        }
      }
    } else if (act === "closeAutoOpen") {
      if (S.sel && S.sel.kind === "room") {
        var rMeta = S.roomMeta[S.sel.ref];
        if (rMeta && rMeta.autoOpenings) {
          pushHistory();
          var oids = rMeta.autoOpenings;
          S.openings = S.openings.filter(function(o) { return oids.indexOf(o.id) === -1; });
          delete rMeta.autoOpenings;
          fillProps();
          S.dirty3D = true;
          render2D();
        }
      }
    } else if (act === "lang") toggleLang();
    else if (act === "rotL" && S.sel && S.sel.kind === "item") {
      pushHistory();
      turnItem(S.sel.ref, (((S.sel.ref.rot - rotStep()) % 360) + 360) % 360);
      S.dirty3D = true;
      fillProps();
      render2D();
    } else if (act === "rotR" && S.sel && S.sel.kind === "item") {
      pushHistory();
      turnItem(S.sel.ref, (((S.sel.ref.rot + rotStep()) % 360) + 360) % 360);
      S.dirty3D = true;
      fillProps();
      render2D();
    } else if (act === "rotSel90") {
      /* The quarter turn, independent of the 15/45/90 step control. The step
         lives in the item inspector, which on a phone is behind a sheet — a
         one-tap rotate that silently obeyed a setting the user cannot see
         while pressing it would turn the piece by an amount they never chose.
         Multi-selection turns each piece about its own centre, which is what
         "rotate these chairs" means; rotating the group about a common pivot
         would move them, and moving is what the drag is for. */
      var rotPicks = !S.sel ? [] : S.sel.kind === "item" ? [S.sel.ref]
        : S.sel.kind === "items" ? S.sel.refs.slice() : [];
      rotPicks = rotPicks.filter(function (it) { return it && !it.locked; });
      if (!rotPicks.length) return;
      pushHistory();
      rotPicks.forEach(function (it) {
        turnItem(it, (((it.rot || 0) + 90) % 360 + 360) % 360);
      });
      S.dirty3D = true;
      fillProps();
      render2D();
    } else if (act === "flipSwing") {
      /* One verb for the whole hinge: hand first, then the side it opens to.
         Four taps return the door to where it started, so the control is safe
         to press repeatedly — which is how a swing is actually chosen, by
         watching the arc rather than by reading "Right, out" in a dropdown. */
      if (!S.sel || S.sel.kind !== "opening") return;
      var swOp = S.sel.ref;
      if (swOp.type !== "door" || swOp.isSliding || swOp.isPocket) {
        flash(t("f_swingNA"), "error");
        return;
      }
      var SWING_CYCLE = ["R_IN", "L_IN", "L_OUT", "R_OUT"];
      var swAt = SWING_CYCLE.indexOf(swOp.swingDir || "R_IN");
      pushHistory();
      swOp.swingDir = SWING_CYCLE[(swAt < 0 ? 0 : swAt + 1) % SWING_CYCLE.length];
      S.dirty3D = true;
      fillProps();
      render2D();
      flash(t("f_swingNow", { dir: t("d_" + swOp.swingDir.toLowerCase()) }));
    } else if (act && act.indexOf("rotStep") === 0) {
      // rotStep15 / rotStep45 / rotStep90
      setRotStep(parseInt(act.slice(7), 10));
      syncRotStepUI();
    } else if (act === "faceAuto" && S.sel && S.sel.kind === "item") {
      /* Back to the automatic angle: forget that this piece was turned by hand
         and re-read its surroundings where it stands. */
      var fit = S.sel.ref;
      pushHistory();
      var turned = refaceItem(fit, { host: findSupport(fit, fit.x, fit.z) });
      if (turned)
        rotateWith(fit, turned, new Set([fit])).forEach(function (c) {
          touchItem3D(c, "move");
        });
      touchItem3D(fit, "move");
      fillProps();
      render2D();
      flash(turned ? t("f_faced") : t("f_faceSame"));
    } else if (act === "roomRotL") rotateRoom(-rotStep());
    else if (act === "roomRotR") rotateRoom(rotStep());
    else if (act === "openwall") openWall();
    else if (act === "addWallDoor" || act === "addWallWindow" || act === "addWallPassage") {
      var openingType = act === "addWallDoor" ? "door" : act === "addWallWindow" ? "window" : "passage";
      var posEl = document.getElementById("ow_pos");
      var along = posEl ? parseFloat(posEl.value) : NaN;
      var placed = placeOpeningOnSelected(openingType, isFinite(along) ? { s: along } : {});
      if (placed) flash(t("f_openingPlaced", { name: t(openingType) }));
    } else if (act === "openseg") {
      if (S.segPreview)
        openSegment(S.segPreview.s, S.segPreview.width, S.segPreview.height);
    } else if (act && act.indexOf("op") === 0 &&
      ["opCentre", "opFromA", "opFromB", "opAlignX", "opAlignZ", "opSpacing"].indexOf(act) !== -1) {
      /* Position dimensions for the selected opening. The two "line up"
         verbs need a second opening, so they arm a pick the way the wall
         relations do; the rest complete immediately. */
      if (!S.sel || S.sel.kind !== "opening") return;
      var op = S.sel.ref;
      if (act === "opAlignX" || act === "opAlignZ") {
        startOpeningAlignPick(op, act === "opAlignX" ? "x" : "z");
        return void flash(t("wc_pick_openAlign"));
      }
      /* Every refusal is decided BEFORE pushHistory, so a rejected click does
         not leave a no-op undo entry that swallows the next Ctrl+Z — the same
         rule the point tool learned. */
      var run = null;
      if (act === "opSpacing") {
        /* Every opening on the SAME wall, in the order they sit along it:
           "equally spaced" is a statement about a run, and openings cannot be
           multi-selected, so asking the user to pick them would be a button
           that never works. */
        run = (S.openings || [])
          .filter(function (q) { return q.wall === op.wall; })
          .sort(function (a, b) { return a.s - b.s; })
          .map(function (q) { return q.id; });
        if (run.length < 3) return void flash(t("wc_openNeed3"), "error");
      }
      pushHistory();
      var opMade = act === "opCentre" ? addOpeningCentre(op.id)
        : act === "opSpacing" ? addOpeningSpacing(run)
          : addOpeningFromCorner(op.id, act === "opFromB" ? "b" : "a", null);
      if (!opMade) return void flash(t("wc_failed"), "error");
      solveWallCons();
      S.dirty3D = true;
      fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
      flash(t("wc_added", { v: conLabelText(opMade, t) }));
    } else if (act === "conFlip" || act === "conDelete" || act === "conRepin") {
      /* The three verbs on a dimension picked from the plan. All of them are
         edits to the design, so all of them push history and re-solve — a
         swapped hold or a deleted dimension changes where the corners are. */
      if (!S.sel || S.sel.kind !== "con") return;
      var pc0 = S.sel.ref;
      pushHistory();
      if (act === "conDelete") {
        removeCon(pc0.id);
        select(null);
      } else if (act === "conRepin") {
        repin(pc0.id);
      } else if (!flipConDirection(pc0.id)) {
        flash(t("wc_flipFail"), "error");
      }
      solveWallCons();
      S.dirty3D = true;
      fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
    } else if ((act === "conHorizontal" || act === "conVertical") && S.sel && S.sel.kind === "wall") {
      pushHistory();
      addWallRelation(act === "conHorizontal" ? "horizontal" : "vertical", S.sel.ref.id);
      solveWallCons();
      fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
    } else if (
      (["conDist", "conAngle", "conOffset", "conParallel", "conPerpendicular",
        "conCollinear", "conEqualLength", "conPointWall"].indexOf(act) !== -1) &&
      S.sel &&
      S.sel.kind === "wall"
    ) {
      /* Arm the pick and hand the plan back to the user — the second half of
         a dimension is a piece of geometry, and there is no honest way to name
         one in a dropdown. The end it measures FROM is whichever half of the
         wall is currently picked (the same A/B segmented control above), so
         "from this corner, 240 to that one" is two clicks and a number. */
      var conKinds = {
        conDist: "dist", conAngle: "angle", conOffset: "offset",
        conParallel: "parallel", conPerpendicular: "perpendicular",
        conCollinear: "collinear", conEqualLength: "equalLength",
        conPointWall: "pointWall",
      };
      var kind = conKinds[act];
      if ((kind === "dist" || kind === "pointWall") &&
          S.wallEditEnd !== "a" && S.wallEditEnd !== "b") {
        flash(t("wc_pick_source"), "error");
        return;
      }
      startConPick(kind, S.sel.ref, S.wallEditEnd === "b" ? "b" : "a");
      fillProps();
      flash(t("wc_pick_" + kind));
    } else if (act === "reverseWallLayers" && S.sel && S.sel.kind === "wall") {
      /* A symmetric stack has nothing to mirror. The button is disabled in that
         case, but the keyboard and the tree can still reach the action — so
         refuse here too rather than push an undo entry that changes nothing. */
      normalizeWall(S.sel.ref, S);
      if (wallFlipSymmetric(S.sel.ref)) {
        flash(t("wallReverseNA"), "error");
        return;
      }
      pushHistory();
      flipWall(S.sel.ref);
      S.dirty3D = true;
      fillProps(); render2D(); updateCost();
      // near-white finishes make the swap almost invisible in 3D; name it
      var flipped = wallFaceMaterials(S.sel.ref);
      flash(t("wallReverseWhat", { out: flipped.out, in: flipped.in }), "success");
    } else if (act === "copyWallStyle" && S.sel && S.sel.kind === "wall") {
      pushHistory();
      var styleWall = normalizeWall(S.sel.ref, S);
      S.wallDrawDefaults = {
        typeId: styleWall.wallTypeId,
        kind: normalizeWallKind(styleWall),
        datum: styleWall.datum,
        loc: styleWall.loc === "face" ? "face" : "center",
        dimSide: styleWall.dimSide === 1 || styleWall.dimSide === -1 ? styleWall.dimSide : 0,
        from: styleWall.loc === "face"
          ? (styleWall.datum === "interior" || styleWall.datum === "main-interior" ? (styleWall.datum || "interior") : "exterior")
          : "center",
        phase: styleWall.phase,
        layersReversed: !!styleWall.layersReversed,
        upperWallTypeId: styleWall.upperWallTypeId,
        splitHeight: styleWall.splitHeight,
        height: styleWall.height,
      };
      flash(document.documentElement.lang === "en" ? "Wall style copied to drawing defaults" : "סגנון הקיר הועתק לברירת המחדל", "success");
      window.dispatchEvent(new CustomEvent("planner-draw-defaults"));
    } else if (act === "straightenWall" && S.sel && S.sel.kind === "wall") {
      pushHistory();
      var straightWall = S.sel.ref;
      delete straightWall.geometry;
      delete straightWall.curve;
      delete straightWall.bulge;
      delete straightWall.radius;
      delete straightWall.r;
      delete straightWall.center;
      delete straightWall.cx;
      delete straightWall.cz;
      S.dirty3D = true;
      fillProps(); render2D();
    } else if (act === "restoreSharpCorner" && S.sel && S.sel.kind === "wall") {
      var restoreResult = restoreSelectedSharpCorner();
      if (restoreResult.ok) flash(t("wallRestoreCornerDone"), "success");
      else flash(t(restoreResult.reason === "connector-hosted" ? "wallRestoreCornerHosted" : "wallRestoreCornerChanged"), "error");
    } else if (act === "updateCornerTreatment" && S.sel && S.sel.kind === "wall") {
      var oldCornerType = S.sel.ref.cornerTreatment && S.sel.ref.cornerTreatment.type;
      var newCornerType = document.getElementById("w_corner_type").value;
      var newCornerValue = parseLen(document.getElementById("w_corner_value").value);
      var cornerUpdateResult = updateSelectedCornerTreatment(newCornerType, newCornerValue);
      if (cornerUpdateResult.ok)
        flash(t(oldCornerType === newCornerType ? "wallCornerUpdated" : "wallCornerConverted"), "success");
      else {
        var cornerUpdateError = cornerUpdateResult.reason === "hosted" || cornerUpdateResult.reason === "connector-hosted"
          ? "wallRestoreCornerHosted"
          : cornerUpdateResult.reason === "not-shared" || cornerUpdateResult.reason === "changed"
            ? "wallRestoreCornerChanged" : "wm_fillet_large";
        flash(t(cornerUpdateError), "error");
      }
    } else if (act === "squareWall" && S.sel && S.sel.kind === "wall") {
      pushHistory();
      var sqw = squareWall(S.sel.ref, S.wallEditEnd);
      if (sqw) flash(squaredMsg(sqw, "f_wallSquared"));
      else flash(t("f_squareBlocked"), "error");
    } else if (act === "lockWallDim" && S.sel && S.sel.kind === "wall") {
      /* Unlocking a wall opts it out of the constraint engine: it will be
         stretched and swung by edits at its corners like any ordinary sketch
         line. Locking it again holds whatever it measures right now. */
      pushHistory();
      setLocked(S.sel.ref, !isLocked(S.sel.ref));
      flash(t(isLocked(S.sel.ref) ? "f_wallLocked" : "f_wallUnlocked"));
      fillProps();
      render2D();
    } else if (act === "lockItem" && S.sel && S.sel.kind === "item") {
      pushHistory();
      S.sel.ref.locked = !S.sel.ref.locked;
      fillProps();
      render2D();
    } else if (act === "lockRoom" && S.sel && S.sel.kind === "room") {
      pushHistory();
      var m = (S.roomMeta[S.sel.ref] = S.roomMeta[S.sel.ref] || {});
      m.locked = !m.locked;
      fillProps();
      render2D();
    } else if (act === "lockRoomItems" && S.sel && S.sel.kind === "room") {
      var r = roomByKey(S.sel.ref);
      if (r) {
        pushHistory();
        var any = itemsInRoom(r).some(function (i) {
          return !i.locked;
        });
        itemsInRoom(r).forEach(function (i) {
          i.locked = any;
        });
        flash(any ? t("f_roomItemsLocked") : t("f_roomItemsUnlocked"));
        render2D();
        refreshTree();
      }
    } else if (act === "tree") {
      document.getElementById("tree").classList.toggle("on");
      refreshTree();
    } else if (act === "rc") {
      var rc = await loadRCModule();
      // walk mode and RC mode both drive the camera — never both
      if (!rc.rcActive() && document.getElementById("walkBtn").classList.contains("active")) {
        toggleWalk(false);
        document.getElementById("walkBtn").classList.remove("active");
        syncWalkView(false);
      }
      if (zombieModule && zombieModule.zActive()) zombieModule.toggleZombies(false);
      if (lavaModule && lavaModule.lavaActive()) lavaModule.toggleLava(false);
      var rcOn = rc.toggleRC();
      flash(rcOn ? t("f_rcOn") : t("f_rcOff"));
    } else if (act === "zombies") {
      var zm = await loadZombieModule();
      // walk / RC / Night Shift / Lava all drive the camera — only one at a time
      if (!zm.zActive()) {
        if (rcModule && rcModule.rcActive()) rcModule.toggleRC(false);
        if (lavaModule && lavaModule.lavaActive()) lavaModule.toggleLava(false);
        if (document.getElementById("walkBtn").classList.contains("active")) {
          toggleWalk(false);
          document.getElementById("walkBtn").classList.remove("active");
          syncWalkView(false);
        }
      }
      var zOn = zm.toggleZombies();
      flash(zOn ? t("f_zombiesOn") : t("f_zombiesOff"));
    } else if (act === "lava") {
      var lv = await loadLavaModule();
      if (!lv.lavaActive()) {
        if (rcModule && rcModule.rcActive()) rcModule.toggleRC(false);
        if (zombieModule && zombieModule.zActive()) zombieModule.toggleZombies(false);
        if (document.getElementById("walkBtn").classList.contains("active")) {
          toggleWalk(false);
          document.getElementById("walkBtn").classList.remove("active");
          syncWalkView(false);
        }
      }
      var lvOn = lv.toggleLava();
      flash(lvOn ? t("f_lavaOn") : t("f_lavaOff"));
    } else if (act === "walk") {
      if (rcModule && rcModule.rcActive()) rcModule.toggleRC(false);
      if (zombieModule && zombieModule.zActive()) zombieModule.toggleZombies(false);
      if (lavaModule && lavaModule.lavaActive()) lavaModule.toggleLava(false);
      var on = toggleWalk();
      document.getElementById("walkBtn").classList.toggle("active", on);
      syncWalkView(on);
      if (!on && isPhysicsEnabled()) {
        togglePhysics(false);
        var pb = document.getElementById("physicsBtn");
        if (pb) pb.classList.remove("active");
        S.dirty3D = true;
      }
      flash(on ? t("f_walkOn") : t("f_walkOff"));
    } else if (act === "walkview") {
      var m = toggleWalkView();
      syncWalkView(true, m);
      flash(m === "tpv" ? t("f_viewTpv") : t("f_viewFpv"));
    } else if (act === "freemove") {
      var fm = toggleFreeMove();
      if (fm) document.getElementById("freeMoveBtn").classList.add("active");
      else document.getElementById("freeMoveBtn").classList.remove("active");
    } else if (act === "physics") {
      var pb = document.getElementById("physicsBtn");
      if (isPhysicsEnabled()) {
        togglePhysics(false);
        if (pb) pb.classList.remove("active");
        S.dirty3D = true; // Refresh 3D to reset objects
      } else {
        await loadPhysics();
        togglePhysics(true);
        if (pb) pb.classList.add("active");
        rebuild3D(); // Generate rigid bodies
      }
    } else if (act === "hitmode") {
      await loadPhysics();
      var hm = toggleHitMode();
      var hmb2 = document.getElementById("hitModeBtn");
      if (hmb2) {
        hmb2.innerHTML =
          hm === "hammer"
            ? '<i class="ph ph-hammer"></i>'
            : '<i class="ph ph-hand-fist"></i>';
        hmb2.classList.toggle("active", hm === "hammer");
      }
      flash(hm === "hammer" ? "🔨 Hammer" : "👊 Punch");
    } else if (act === "clearDebris") {
      clearDebris();
    } else if (act === "photo") {
      if (!(await import("./photomode.js")).openPhotoMode())
        flash(t("f_no3d"), "error");
    } else if (act === "frame") {
      fitView();
      render2D();
      frameView();
    } else if (act === "reset") {
      if (typeof window !== "undefined" && !window.confirm(t("reset_confirm"))) return;
      pushHistory();
      defaultScene();
      S.roomMeta = {};
      S.blueprintTrace = null;
      syncBlueprintTraceControls();
      S.markers = []; // points belong to the plan that was reset away
      S.slabOpenings = [];
      S.surveyFeatures=[];
      S.workspace.survey=normalizeSurvey(null);
      S.hour = 13;
      S.northAngle = 0;
      S.wallColor = 0xefe9dd;
      document.getElementById("wallcol").value = "#efe9dd";
      loadMEP(null);
      refreshMEPPanel();
      S.planRot = 0;
      S.viewAxis = "top";
      updatePlanGizmo();
      syncEnvUI();
      setTool("select");
      S.dirty3D = true;
      fitView();
      render2D();
      fillProps();
      withoutRoomPrompts(refreshTree); // the starter scene's room is not a discovery
      frameView();
      applyEnv();
    } else if (act === "save") {
      try {
        var savingRevision = getDirtyRevision();
        await saveLocalProject(serialize());
        markSaved(savingRevision);
        flash(t("f_saved"), "success");
      } catch (err) {
        // Storage may still be exhausted; offer a file export in that case.
        var quota =
          err &&
          (err.name === "QuotaExceededError" ||
            err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
            err.code === 22);
        flash(quota ? t("f_saveQuota") : t("f_saveFail"), "error");
      }
    } else if (act === "load") {
      try {
        var raw = await loadLocalProject();
        if (!raw) {
          flash(t("f_noSave"), "error");
          return;
        }
        pushHistory();
        // A saved project can carry custom models whose builder is not resident
        // yet, so applyData may be asynchronous — confirm only once it applied.
        Promise.resolve(applyData(JSON.parse(raw))).then(function (applied) {
          if (!applied) { flash(t("f_loadFail"), "error"); return; }
          markSaved();
          flash(t("f_loaded"), "success");
        }, function () { flash(t("f_loadFail"), "error"); });
      } catch (err) {
        flash(t("f_loadFail"), "error");
      }
    } else if (act === "exportjson") {
      try {
        var blob = new Blob([serialize()], { type: "application/json" });
        var delivery = await deliverExport("home-plan.json", blob);
        if (delivery.saved) flash(t("f_downloaded"), "success");
      } catch (err) {
        flash(t("f_exportFail"), "error");
      }
    } else if (act === "importjson") {
      document.getElementById("importfile").click();
    } else if (act === "importBlueprint") {
      (await import("./ui_blueprint.js")).openBlueprintModal();
    } else if (act === "importBlueprintTrace") {
      (await import("./ui_blueprint_trace.js")).openBlueprintTraceModal();
    } else if (act === "roomScan") {
      (await import("./ui_room_scan.js")).openRoomScanModal();
    } else if (act === "png2d") {
      try {
        /* The plan is two stacked canvases now (model + HUD), so `#plan` alone
           is the model half and exporting it would lose selection chrome,
           guides and cursors. planImageCanvas() renders both synchronously and
           returns a composited offscreen copy. */
        var src = planImageCanvas();
        /* …but that copy is offscreen, so its `clientWidth` is 0 and the dpr
           below would silently collapse to 1, halving every label and rule on a
           retina export. Measure the LIVE element instead — it is the one with
           a layout box, and both canvases are sized from it. */
        var live = document.getElementById("plan");
        var extra = 56;
        var out = document.createElement("canvas");
        out.width = src.width;
        out.height = src.height + extra * (window.devicePixelRatio || 1);
        var ctx = out.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(src, 0, 0);
        var dpr = out.width / Math.max(1, (live && live.clientWidth) || src.width);
        var by = src.height;
        var bw = out.width;
        var bh = extra * dpr;
        ctx.strokeStyle = "#20242a";
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeRect(0.5 * dpr, by + 0.5 * dpr, bw - dpr, bh - dpr);
        ctx.beginPath();
        ctx.moveTo(bw * 0.46, by);
        ctx.lineTo(bw * 0.46, by + bh);
        ctx.moveTo(bw * 0.68, by);
        ctx.lineTo(bw * 0.68, by + bh);
        ctx.moveTo(bw * 0.84, by);
        ctx.lineTo(bw * 0.84, by + bh);
        ctx.stroke();
        ctx.fillStyle = "#20242a";
        ctx.font = (11 * dpr) + "px Inter, Helvetica, Arial, sans-serif";
        ctx.textBaseline = "middle";
        var title = (S.workspace && S.workspace.name) || "Untitled";
        ctx.fillText(title, 10 * dpr, by + bh * 0.38);
        ctx.font = (9 * dpr) + "px Inter, Helvetica, Arial, sans-serif";
        ctx.fillStyle = "#5b6b80";
        ctx.fillText("Do not scale drawing. Verify all dimensions on site.", 10 * dpr, by + bh * 0.72);
        ctx.fillText("SCALE", bw * 0.47, by + bh * 0.32);
        ctx.fillText("DATE", bw * 0.69, by + bh * 0.32);
        ctx.fillText("SHEET", bw * 0.85, by + bh * 0.32);
        ctx.fillStyle = "#20242a";
        ctx.font = (12 * dpr) + "px Inter, Helvetica, Arial, sans-serif";
        ctx.fillText("A-01", bw * 0.85, by + bh * 0.72);
        ctx.fillText(new Date().toISOString().slice(0, 10), bw * 0.69, by + bh * 0.72);
        // A screen-resolution raster has no physical size, so it has no scale.
        // Stamping "1:20" on it invites someone to measure off the print.
        ctx.fillText("NTS", bw * 0.47, by + bh * 0.72);
        var pngBlob = await new Promise(resolve => out.toBlob(resolve, "image/png"));
        if (!pngBlob) throw new Error("PNG encoding failed");
        var pngDelivery = await deliverExport("home-plan-2d.png", pngBlob);
        if (pngDelivery.saved) flash(t("f_planPng"));
      } catch (err) {
        flash(t("f_pngFail"), "error");
      }
    } else if (act === "png3d") {
      // async: the GPU queue must drain before the canvas can be read back
      snapshot3D().then(function (u3) {
        if (u3) {
          download("home-3d.png", u3);
          flash(t("f_snap3d"));
        } else flash(has3D() ? t("f_snapFail") : t("f_no3d"), "error");
      });
    } else if (act === "exportgltf") {
      /* Straight to the file when the modifier is held — the options are
         remembered, so the second export of an afternoon rarely needs the
         dialog (js/ui_blender.js). */
      var bx = await import("./ui_blender.js");
      if (!has3D()) flash(t("f_no3d"), "error");
      else if (ev && (ev.shiftKey || ev.altKey)) bx.runExport();
      else bx.openBlenderExport();
    } else if (act === "cutPlan") {
      (await import("./ui_nest.js")).openNestForPlan();
    } else if (act === "exportCost") {
      exportCostCSV();
      flash(t("f_downloaded"), "success");
    } else if (act === "openTextureGallery") {
      var { openTextureGallery } = await import("./ui_textures.js");
      openTextureGallery();
    } else if (act === "uploadFloorTex") {
      currentTexTarget = "floor";
      var texInput = document.getElementById("texInput");
      if (texInput) texInput.click();
    } else if (act === "uploadWallTex") {
      currentTexTarget = "wall";
      var texInput = document.getElementById("texInput");
      if (texInput) texInput.click();
    } else if (act === "clearWallTex" && S.sel && S.sel.kind === "wall") {
      // back to whatever the assembly's own finish layer says
      pushHistory();
      delete S.sel.ref.tex;
      S.dirty3D = true;
      fillProps();
      render2D();
    } else if (act === "exportWallTakeoff" && S.sel && S.sel.kind === "wall") {
      /* The quantities shown for the selected wall, as the same CSV shape the
         project schedule exports — one wall's worth, so a single elevation can
         be priced without exporting the whole building. */
      var toWall = S.sel.ref;
      var toCsv = [['"Wall"', '"Item"', '"Detail"', '"Quantity"'].join(",")];
      wallTakeoffRows(toWall).forEach(function (r) {
        toCsv.push([toWall.id, r.k, r.s || "", r.v]
          .map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","));
      });
      saveTextDownload("wall-" + toWall.id + "-takeoff.csv", toCsv.join("\r\n"));
      flash(t("f_downloaded"), "success");
    } else if (act === "shortcuts") {
      showShortcuts();
    }
  }

  // ---- keyboard cheat sheet (topbar ⌨ button, or "?" anywhere) ----
  var shortcutsModal = null;
  /* The guide used to say "Ctrl" on every platform. The app's own handlers have
     always accepted Cmd as well (`var mod = e.ctrlKey || e.metaKey`), so the
     shortcuts worked on a Mac while the documentation for them named a key
     Mac users do not reach for. Substituting only the modifiers — and dropping
     the "+" separators only when something was actually substituted, so the
     row that documents the "+" key is not emptied — keeps every other cap as
     written. */
  var MAC_KEYS = /Mac|iPhone|iPad|iPod/i.test(
    (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""
  );
  function macCap(part) {
    if (!MAC_KEYS) return part;
    var out = part
      .replace(/\bCtrl\b/g, "⌘")
      .replace(/\bAlt\b/g, "⌥")
      .replace(/\bShift\b/g, "⇧")
      .replace(/\bDel\b/g, "⌫");
    return out === part ? part : out.replace(/\+/g, "");
  }

  /* Any static <kbd data-kbd="..."> in the markup gets the same treatment, so
     a menu item's hint agrees with the guide. Platform does not change while
     the page is open, so this runs once. */
  function applyPlatformKeyCaps() {
    document.querySelectorAll("kbd[data-kbd]").forEach(function (el) {
      el.textContent = macCap(el.getAttribute("data-kbd"));
    });
  }
  applyPlatformKeyCaps();

  function showShortcuts() {
    if (shortcutsModal) {
      shortcutsModal.close();
      shortcutsModal = null;
      return;
    }
    var SECTIONS = [
      ["keys_sec_general", [
        ["Ctrl+S", "k_save"],
        ["Ctrl+O", "k_import"],
        ["Ctrl+E", "k_export"],
        ["?", "k_help"],
      ]],
      ["keys_sec_edit", [
        ["Ctrl+Z", "k_undo"],
        ["Ctrl+Y", "k_redo"],
        ["Ctrl+D", "k_dup"],
        ["Ctrl+A", "k_selall"],
        ["Ctrl+G", "k_group"],
        ["Ctrl+Shift+G", "k_ungroup"],
        ["Del", "k_del"],
        ["R", "k_rot"],
        ["← ↑ → ↓", "k_nudge"],
        ["Esc", "k_esc"],
      ]],
      ["keys_sec_tools", [["1 2 3 4 5", "k_tools"]]],
      ["keys_sec_draft", [
        ["0…9", "k_typedim"],
        ["Tab", "k_typetab"],
        ["Enter", "k_typeok"],
        ["F3", "k_osnap"],
        ["F8", "k_ortho"],
        ["F9", "k_gridsnap"],
      ]],
      ["keys_sec_view", [
        ["F", "k_frame"],
        ["W", "k_walk"],
        ["P", "k_photo"],
        ["C", "k_rc"],
      ]],
      ["keys_sec_nav3d", [
        ["Drag", "k_orbit"],
        ["Shift+Drag / MMB / RMB", "k_pan"],
        ["← ↑ → ↓ / WASD", "k_navmove"],
        ["Q E", "k_navheight"],
        ["+ −", "k_navzoom"],
        ["Wheel", "k_navwheel"],
        ["Double-click", "k_navfocus"],
      ]],
      ["keys_sec_con", [
        ["Ctrl+Shift+P", "k_conParallel"],
        ["Ctrl+Shift+O", "k_conPerp"],
        ["Ctrl+Shift+C", "k_conCollinear"],
        ["Ctrl+Shift+E", "k_conEqual"],
        ["Ctrl+Shift+F", "k_conPin"],
        ["Ctrl+Shift+J", "k_conJoin"],
        ["Ctrl+Shift+M", "k_conSym"],
        ["Alt+drag", "k_conOverride"],
        ["Tab", "k_snapCycle"],
        ["Shift+E/M/I/R/F", "k_snapOnly"],
      ]],
      ["keys_sec_walk", [
        ["WASD", "k_move"],
        ["V", "k_walkview"],
        ["G", "k_hit"],
      ]],
      ["keys_sec_uikit", [
        ["Ctrl+Alt+E", "k_uikit_toggle"],
        ["Ctrl+Alt+U", "k_uikit_reset"],
        ["Tab", "k_uikit_select"],
        ["← ↑ → ↓", "k_uikit_move"],
        ["Alt+Arrow", "k_uikit_moveout"],
        ["Ctrl+G", "k_uikit_group"],
        ["Ctrl+Shift+G", "k_uikit_ungroup"],
        ["Del", "k_uikit_hide"],
        ["Esc", "k_uikit_exit"],
      ]],
    ];
    var m = openModal(t("keys_title"));
    shortcutsModal = m;
    m.onClose(function () {
      shortcutsModal = null;
    });
    var wrap = document.createElement("div");
    wrap.className = "keys-grid";
    SECTIONS.forEach(function (sec) {
      var h = document.createElement("div");
      h.className = "keys-sec";
      h.textContent = t(sec[0]);
      wrap.appendChild(h);
      sec[1].forEach(function (row) {
        var r = document.createElement("div");
        r.className = "keys-row";
        var k = document.createElement("span");
        k.className = "keys-combo";
        // split on spaces so each key gets its own <kbd> cap
        row[0].split(" ").forEach(function (part) {
          var kb = document.createElement("kbd");
          kb.textContent = macCap(part);
          k.appendChild(kb);
        });
        var d = document.createElement("span");
        d.className = "keys-desc";
        d.textContent = t(row[1]);
        r.appendChild(k);
        r.appendChild(d);
        wrap.appendChild(r);
      });
    });
    m.body.appendChild(wrap);
    var hint = document.createElement("div");
    hint.className = "t keys-hint";
    hint.textContent = t("keys_hint");
    m.body.appendChild(hint);
    var closeBtn = document.createElement("button");
    closeBtn.className = "btn-accent";
    closeBtn.textContent = t("keys_close");
    closeBtn.addEventListener("click", function () {
      m.close();
      shortcutsModal = null;
    });
    m.actions.appendChild(closeBtn);
    m.overlay.addEventListener("click", function (e) {
      if (e.target === m.overlay) shortcutsModal = null;
    });
    closeBtn.focus();
  }

  // ---- global keyboard shortcuts ----
  // Editor-wide accelerators. Canvas/selection keys (tools, nudge, rotate) stay
  // in interaction.js; these are the app-level ones that mirror menu items.
  document.addEventListener("keydown", function (e) {
    var ae = document.activeElement;
    if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return;
    if (isWalk()) return; // walk/drive modes own the keyboard
    if (lavaModule && lavaModule.lavaActive()) return;
    var mod = e.ctrlKey || e.metaKey;
    /* Constraint verbs: Ctrl/Cmd+Shift+letter, acting on whatever is selected.
       Authoring a relation used to mean selecting, then finding the right
       button in the inspector, then clicking the target — fine once, tiring
       for the twentieth. Behind a modifier rather than on bare letters
       because the bare ones are already spoken for (F frames, W walks,
       P photographs) and a drafting verb that fires while you meant to frame
       the view is worse than no shortcut. Checked BEFORE the plain Ctrl block,
       which does not test shiftKey and would otherwise export the project on
       Ctrl+Shift+E. */
    if (mod && e.shiftKey && !e.altKey) {
      var ck = e.key.toLowerCase(), verb = CON_KEYS[ck];
      if (verb) { e.preventDefault(); runConVerb(verb); return; }
    }
    /* Ctrl/Cmd+Alt+E opens the interface customizer. It has to be tested here,
       before the two blocks below that bail out on Alt entirely.
       e.code, NOT e.key: on macOS Option+E is a dead key for the acute accent,
       so the event arrives with key "´" and a shortcut written against the
       letter silently never fires on a Mac. The physical key is the only
       reliable identity for an Alt combination. Routed through runAction so
       the menu item and the shortcut cannot drift apart. */
    if (mod && e.altKey && !e.shiftKey && e.code === "KeyE") {
      e.preventDefault();
      runAction("uikitCustomize");
      return;
    }
    if (mod && !e.altKey) {
      var k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); runAction("save"); }
      else if (k === "o") { e.preventDefault(); runAction("importjson"); }
      else if (k === "e") { e.preventDefault(); runAction("exportjson"); }
      else if (k === "d") { e.preventDefault(); runAction("dupSel"); }
      else if (k === "g") {
        e.preventDefault();
        runAction(e.shiftKey ? "ungroupItems" : "groupItems");
      } else if (k === "a") { e.preventDefault(); selectAllItems(); }
      return;
    }
    if (e.altKey) return;
    if (e.key === "F1") {
      e.preventDefault();
      runAction("plannerTutorial");
    } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
      e.preventDefault();
      showShortcuts();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      runAction("frame");
    } else if (e.key === "w" || e.key === "W") {
      e.preventDefault();
      runAction("walk");
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      runAction("photo");
    } else if (e.key === "c" || e.key === "C") {
      // C for "car" — the RC race was menu-only, which made the whole mode
      // easy to never find. RC's own keymap runs capture-first and stops
      // propagation, so inside the mode C still cycles the camera.
      e.preventDefault();
      runAction("rc");
    }
  });

  /* One letter per relation, chosen for the word rather than the internal
     type name: F for fix, J for join, M for mirror, C for collinear. */
  var CON_KEYS = {
    p: "parallel",
    o: "perpendicular",
    c: "collinear",
    e: "equal",
    f: "pin",
    j: "coincident",
    m: "symmetric",
  };

  /* Apply a relation to the current selection, working out from what IS
     selected what the verb should mean: "equal" is equal length between two
     walls and equal angles between two corners, because that is the same
     intent expressed about different geometry. */
  function runConVerb(verb) {
    var sel = S.sel;
    if (!sel) return flash(t("wc_needSel"), "error");

    if (verb === "pin") {
      if (sel.kind === "node" || sel.kind === "nodes") return void togglePinSelected();
      return flash(t("wc_needCorner"), "error");
    }
    if (sel.kind === "nodes" && sel.refs.length === 2) {
      if (verb === "coincident") return void applyNodePairRelation("coincident");
      if (verb === "symmetric") return void applyNodePairRelation("symmetric");
      if (verb === "equal") return void applyNodePairRelation("equalAngle");
      return flash(t("wc_needWalls"), "error");
    }
    if (sel.kind === "walls" && sel.refs.length === 2) {
      var type = verb === "equal" ? "equalLength" : verb;
      if (["parallel", "perpendicular", "collinear", "equalLength"].indexOf(type) === -1)
        return flash(t("wc_needCorner"), "error");
      pushHistory();
      // the palette's convention: first selected is driven, second is the held
      // reference — the keyboard must not quietly reverse it
      var made = addWallRelation(type, sel.refs[0].id, sel.refs[1].id);
      if (!made) return flash(t("wc_failed"), "error");
      solveWallCons();
      S.dirty3D = true;
      fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
      return void flash(t("wc_added", { v: t("wc_add" + type.charAt(0).toUpperCase() + type.slice(1)) }));
    }
    flash(t("wc_needTwo"), "error");
  }

  /* The align palette, as a table: verb name -> what it does. */
  var AL_ACTS = {
    alLeft: { kind: "align", how: "left" },
    alRight: { kind: "align", how: "right" },
    alCenterX: { kind: "align", how: "centerX" },
    alTop: { kind: "align", how: "top" },
    alBottom: { kind: "align", how: "bottom" },
    alCenterZ: { kind: "align", how: "centerZ" },
    alDistX: { kind: "dist", how: "x" },
    alDistZ: { kind: "dist", how: "z" },
    alSameRot: { kind: "rot" },
  };

  // Ctrl+A — select every unlocked item in the scene (items are a flat list).
  function selectAllItems() {
    var refs = (S.items || []).filter(function (it) {
      return !it.locked;
    });
    if (!refs.length) return;
    select(refs.length > 1 ? { kind: "items", refs: refs } : { kind: "item", ref: refs[0] });
    render2D();
  }

  // Bind right-inspector, topbar, and left-sidebar to the shared click handler
  ["right-inspector", "topbar", "left-sidebar", "center-canvas"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", handleActionClick);
  });

  // file import (hidden <input type=file>)
  document.getElementById("importfile").addEventListener("change", function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        pushHistory();
        var geo = (d && (d.type === "FeatureCollection" || Array.isArray(d.features) || d.type === "Feature")) ? d : null;
        var cad = d.cadEntities || d.cad || ((d.lines || d.arcs) ? d : null);
        if (geo) {
          var convertedGeo = convertGeoJsonToWalls(geo, { height: 300, firstId: S.idc });
          S.nodes = convertedGeo.nodes; S.walls = convertedGeo.walls; S.openings = convertedGeo.openings;
          S.items = []; S.markers = []; S.roomMeta = convertedGeo.roomMeta || {}; S.idc = convertedGeo.nextId || S.walls.length + 1;
          ensureWallTypes(S); rebuildProject(S, FURN); S.sel = null; S.dirty3D = true;
          render2D(); fitView(); refreshTree(); updateCost();
        } else if (cad && (Array.isArray(cad.lines) || Array.isArray(cad.arcs))) {
          var converted = convertCadToWalls(cad, {
            wallTypeByLayer: d.wallTypeByLayer || cad.wallTypeByLayer || {},
            singleLineWalls: !!(d.singleLineWalls || cad.singleLineWalls),
            defaultThickness: Number(d.defaultThickness || cad.defaultThickness) || 10,
            height: Number(d.height || cad.height) || 270,
            firstId: S.idc,
          });
          S.nodes = converted.nodes; S.walls = converted.walls; S.openings = converted.openings;
          S.items = []; S.markers = []; S.roomMeta = {}; S.idc = converted.nextId;
          ensureWallTypes(S); rebuildProject(S, FURN); S.sel = null; S.dirty3D = true;
          render2D(); fitView(); refreshTree(); updateCost();
          flash(t("f_imported"), "success");
        } else {
          // The imported file is the one path that routinely carries custom
          // models this browser has never seen; wait for the builder.
          Promise.resolve(applyData(d)).then(function (applied) {
            if (!applied) { flash(t("f_badFile"), "error"); return; }
            flash(t("f_imported"), "success");
          }, function () { flash(t("f_badFile"), "error"); });
        }
      } catch (err) {
        flash(t("f_badFile"), "error");
      }
    };
    rd.onerror = function () {
      flash(t("f_readFail"), "error");
    };
    rd.readAsText(f);
  });
}

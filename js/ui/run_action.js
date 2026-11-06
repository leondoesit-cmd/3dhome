/* The planner's runAction: the single dispatch point for every named UI action
   (menus, buttons, shortcuts), lifted out of initUI, split out of
   js/ui/init_ui.js. It shares the editor's state through live imports from
   ./init_ui.js. */
import { syncBlueprintTraceControls } from "../blueprint_trace.js";
import { executeCommand } from "../commands/index.js";
import { isLocked, setLocked } from "../constraint_engine.js";
import { loadLocalProject, saveLocalProject } from "../core/project_store.js";
import { defaultApartment } from "../demo_house.js";
import { parseLen } from "../display_units.js";
import { deliverExport } from "../export_delivery.js";
import { addSlabOpeningToFloor, floorAbove } from "../floors.js";
import { itemsInRoom, roomByKey, roomFloor } from "../geometry.js";
import { currentHistoryId, pushHistory, redo, undo } from "../history.js";
import { t, toggleLang } from "../i18n.js";
import { addSpace, applyNodePairRelation, autoArrangeAll, chamferSelectedWalls, deleteSel, dupSel, filletSelectedWalls, openSegment, openWall, placeOpeningOnSelected, restoreSelectedSharpCorner, rotateRoom, setTool, startConPick, startOpeningAlignPick, togglePinSelected, updateSelectedCornerTreatment } from "../interaction.js";
import { alignItems, distributeItems, matchRotation } from "../item_align.js";
import { refaceItem, rotStep, setRotStep } from "../item_orient.js";
import { saveLayers } from "../layers.js";
import { detachMarker, duplicateMarker, markerItem } from "../markers.js";
import { loadMEP } from "../mep.js";
import { getDirtyRevision, markSaved } from "../persist.js";
import { clearDebris, isPhysicsEnabled, loadPhysics, toggleHitMode, togglePhysics } from "../physics_facade.js";
import { planStyle } from "../plan_style.js";
import { fitView, planImageCanvas, render2D, updatePlanGizmo } from "../plan2d.js";
import { stairVoidFields } from "../slab_openings.js";
import { findSupport, rotateWith } from "../stack.js";
import { S, touchItem3D, uid } from "../state.js";
import { normalizeSurvey } from "../survey.js";
import { openLibraryPicker } from "../ui_libpick.js";
import { renderPanel as refreshMEPPanel } from "../ui_mep.js";
import { addParam, runRoomConAction } from "../ui_params.js";
import { fillProps, select, wallFaceMaterials, wallFlipSymmetric, wallTakeoffRows } from "../ui_props.js";
import { exportCostCSV, refreshTree, updateCost, withoutRoomPrompts } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { UI_COMMAND_HISTORY, addFurnItem, applyData, applyRoomFloor, download, exportWallScheduleFile, flash, initDrawingPanel, lavaModule, loadLavaModule, loadRCModule, loadZombieModule, openModal, openWallTypeEditorDialog, rcModule, saveTextDownload, serialize, setCutaway, setEdit3D, setLockStruct, setPlanStyle, showJointAngleDialog, squareJoint, squareWall, squaredMsg, syncEnvUI, syncRotStepUI, syncWalkView, turnItem, zombieModule } from "../ui.js";
import { applyEnv, frameView, has3D, rebuild3D, snapshot3D, toggleDrawing3D, toggleFreeMove, toggleWalk, toggleWalkView } from "../view3d.js";
import { addEqualLengthSet, addEqualSpacing, addOffset, addOpeningCentre, addOpeningFromCorner, addOpeningSpacing, addWallAngle, addWallRelation, conLabelText, flipConDirection, removeCon, repin, solveWallCons } from "../wall_constraints.js";
import { normalizeWallKind } from "../wall_curves.js";
import { flipWall, normalizeWall } from "../wall_types.js";
import { uiLocals } from "./ui_locals.js";
import { runSelectionAction } from "./selection_actions.js";
import {
  runNodeConstraintAction, runWallConstraintAction, runWallModifierAction,
} from "./wall_actions.js";
import { runFileAction, runHistoryAction } from "./file_actions.js";
import {
  runHintAction, runMarkerAction, runPanelAction, runViewAction,
} from "./view_actions.js";
import { runOpeningAction } from "./opening_actions.js";

const RUN_SELECTION_ACTIONS = new Set([
  "addFloor", "lockStruct", "deleteSel", "slabFromStairs", "dupSel", "roomFloor", "prodSize",
  "pvAdd", "rcArea", "rcMinDim", "rcRect", "alLeft", "alRight", "alCenterX", "alTop", "alBottom",
  "alCenterZ", "alDistX", "alDistZ", "alSameRot", "groupItems", "ungroupItems", "autoGenerate",
  "autoArrange", "addroom", "addcorr", "makeSeamless", "matchFloor", "rotL", "rotR", "rotSel90",
  "faceAuto", "roomRotL", "roomRotR", "lockItem", "lockRoom", "lockRoomItems",
]);
const RUN_HISTORY_ACTIONS = new Set(["undo", "redo"]);
const RUN_WALL_MODIFIER_ACTIONS = new Set([
  "wallTypeEditor", "wmFillet", "wmChamfer", "wmParallel", "wmPerpendicular", "wmCollinear",
  "wmEqualLength", "wmOffset", "wmEqualSpacing", "wmWallAngle", "wmEqualLenSet",
  "reverseWallLayers", "copyWallStyle", "straightenWall", "restoreSharpCorner",
  "updateCornerTreatment", "squareWall", "lockWallDim",
]);
const RUN_FILE_ACTIONS = new Set([
  "exportWallSchedule", "newPlan", "photo", "reset", "save", "load", "exportjson", "importjson",
  "importBlueprint", "importBlueprintTrace", "roomScan", "png2d", "png3d", "exportgltf",
  "cutPlan", "exportCost", "uploadFloorTex", "uploadWallTex", "clearWallTex", "exportWallTakeoff",
]);
const RUN_PANEL_ACTIONS = new Set([
  "toggleToolNames", "workspace", "openModeler", "uikitCustomize", "plannerTutorial", "agent",
  "friends", "toggleLegacy", "lang", "tree", "rc", "zombies", "lava", "openTextureGallery",
  "shortcuts",
]);
const RUN_VIEW_ACTIONS = new Set([
  "edit3d", "dollhouse", "togglePlanStyle", "drawing3d", "viewPlan", "view3d", "viewSplit",
  "frameReset", "walk", "walkview", "freemove", "physics", "hitmode", "clearDebris", "frame",
]);
const RUN_HINT_ACTIONS = new Set(["hintRect", "hintDoor", "hintLibrary"]);
const RUN_MARKER_ACTIONS = new Set(["mkPlace", "mkRelease", "mkDup", "mkGoItem"]);
const RUN_NODE_CONSTRAINT_ACTIONS = new Set([
  "ndSquare", "ndSetAngle", "ndPin", "ndCoincident", "ndSymmetric", "ndSymmetricPerp",
  "ndCompareAngle", "ndJoin", "ndDistance", "ndAlignX", "ndAlignZ", "ndDistanceX", "ndDistanceZ",
  "ndEqualAngle",
]);
const RUN_OPENING_ACTIONS = new Set([
  "keepAutoOpen", "customAutoOpen", "closeAutoOpen", "flipSwing", "openwall", "addWallDoor",
  "addWallWindow", "addWallPassage", "openseg", "opCentre", "opFromA", "opFromB", "opAlignX",
  "opAlignZ", "opSpacing",
]);
const RUN_WALL_CONSTRAINT_ACTIONS = new Set([
  "conFlip", "conDelete", "conRepin", "conHorizontal", "conVertical", "conDist", "conRefDim",
  "conAngle", "conOffset", "conParallel", "conPerpendicular", "conCollinear", "conEqualLength",
  "conPointWall",
]);
// lifted out of initUI()
async function runAction(act, ev) {
  if (S.workspace && S.workspace.role === "viewer") {
    var readOnlyActions = ["workspace", "frame", "togglePlanStyle", "dollhouse", "drawing3d", "walk", "walkview", "freemove", "photo", "png2d", "png3d", "exportjson", "exportgltf", "exportCost", "tree", "shortcuts", "plannerTutorial", "viewPlan", "view3d", "viewSplit", "openModeler", "friends", "toggleLegacy", "newPlan", "toggleToolNames"];
    if (readOnlyActions.indexOf(act) < 0) {
      flash("Viewer access is read-only", "error");
      return;
    }
  }
  if (RUN_SELECTION_ACTIONS.has(act)) return runSelectionAction(act, ev);
  if (RUN_HISTORY_ACTIONS.has(act)) return runHistoryAction(act, ev);
  if (RUN_WALL_MODIFIER_ACTIONS.has(act)) return runWallModifierAction(act, ev);
  if (RUN_FILE_ACTIONS.has(act)) return runFileAction(act, ev);
  if (RUN_PANEL_ACTIONS.has(act)) return runPanelAction(act, ev);
  if (RUN_VIEW_ACTIONS.has(act)) return runViewAction(act, ev);
  if (RUN_HINT_ACTIONS.has(act)) return runHintAction(act, ev);
  if (RUN_MARKER_ACTIONS.has(act)) return runMarkerAction(act, ev);
  if (RUN_NODE_CONSTRAINT_ACTIONS.has(act)) return runNodeConstraintAction(act, ev);
  if (RUN_OPENING_ACTIONS.has(act)) return runOpeningAction(act, ev);
  if (RUN_WALL_CONSTRAINT_ACTIONS.has(act)) return runWallConstraintAction(act, ev);
  if (act && act.indexOf("rotStep") === 0) {
    // rotStep15 / rotStep45 / rotStep90
    setRotStep(parseInt(act.slice(7), 10));
    syncRotStepUI();
  }
}

export { runAction };

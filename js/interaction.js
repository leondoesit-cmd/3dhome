import { activeEditor } from "./pro_shell.js";
import { openingDrawDefaults } from "./opening_draw_defaults.js";
import { sx, sz, wx, wz, rotatePx, toBasePx, planRotRad, inputScale, inputBounds, inputIs3D, plannerInputView, setPlannerInputView, registerPlannerController } from "./planner_input.js";
import { generatedChangePermission, captureProtectedStructure, validateProtectedStructure } from "./redesign.js";
// Pointer/keyboard interaction: hit-testing, tools, drag/draw, and structural edit operations.
import { S, WALL_T, WALL_H, uid, fin, clamp, SNAP_GRID, throttle, touchItem3D } from "./state.js";
import {
  wallGeom,
  wallById,
  usedNodes,
  detectRooms,
  roomByKey,
  distSeg,
  snapAdj,
  itemsInRoom,
  hiddenSets,
  pendingCuts,
  wallCuts,
  armAngles,
  equalWallAngleTranslation,
  openingAtWallPosition,
  nearestWallLanding,
  wallPointAt,
  wallTangentAt,
  wallProject,
  wallClearLength,
  reconcileRoomMeta,
  roomEdgeHandles,
  normalizeStructure,
} from "./geometry.js";
import {
  applyWallDrawDefaults, drawFaceBack, isWallDrawTool, extendToHit, throughCrossings,
  offsetGhost, offsetSideFromCursor, joinProposal, paintWallWithDefaults,
  reverseWallStyle, resolveWallDrawDefaults, applyDrawDirLock, resetDrawDirLock,
} from "./wall_draw.js";
import { makeArcFromThreePoints, normalizeWallKind } from "./wall_curves.js";
import { canonicalPlacementItem, canonicalPlacementWall, placementBatchFitsScene, placementWallFingerprint } from "./placement_resolver.js";
import {
  applyCornerRestore, applyCornerTreatmentUpdate, applyWallChamfer, applyWallFillet,
  proposeCornerRestore, proposeCornerTreatmentUpdate, proposeWallChamfer, proposeWallFillet,
} from "./wall_fillet.js";
import { FURN, isLamp, itemVSpan, mkItem } from "./furniture.js";
import { holdToWall, reseatHeldItems } from "./item_align.js";
import { applyAutoFace, markManualRot, rotStep } from "./item_orient.js";
import { t, tTouch } from "./i18n.js";
import { fmtLen, unitLabel } from "./display_units.js";
import { plan, render2D, fitView, dropPoint, pickCon as flatPickCon, touchLensDistanceMap, setDragProxy, clearDragProxy } from "./plan2d.js";
import { select, fillProps, refreshTree, flash, setLockStruct, placeFurnAt } from "./ui.js";
import { syncWallEnd } from "./ui_props.js";
import {
  pushHistory,
  beginHistory,
  commitPending,
  cancelPending,
  undo,
  redo,
  currentHistoryId,
  beginHistoryTransaction,
  commitHistoryTransaction,
  abortHistoryTransaction,
  captureHistorySession, restoreHistorySession,
  armHistoryGesture, disarmHistoryGesture, prepareHistoryGesture,
} from "./history.js";
import { isWalk } from "./view3d.js";
import { layerRank, layerOf, canDrag, aiCanMove, isLayerLocked, isLayerHidden } from "./layers.js";
import { refLocked, itemUserUnpickable, userLayerOf } from "./user_layers.js";
import { planIndex } from "./spatial_index.js";
import {
  ensureMEP, snapMEPPoint, routeResolve, wallPath, addNode, hitMEP, nodePos,
  finishRoute, cancelMEP, cancelRoute, deleteMEP, detachNodesFromWalls, runCrossesOpening,
} from "./mep.js";
import {
  isElevation as flatIsElevation, elevationHit, elevPick, elevDragTo, elevNudge,
  elevWallAt, elevItemGrab, elevDragItemTo, elevNudgeItem,
  elevOpeningGrab, elevDragOpeningTo, elevNudgeOpening,
} from "./elevation.js";
import {
  findSupport,
  attach as stackAttach,
  detach as stackDetach,
  hostOf,
  carryChildren,
  rotateWith,
  wouldCycle,
  topOf,
  descendantsOf,
  orphanChildren,
  refreshSupport,
  reseat as stackReseat,
} from "./stack.js";
import {
  markers, addMarker, deleteMarker, hitMarker, markerItem, markerLabel,
  moveMarker, releaseIfMoved,
} from "./markers.js";
import {
  hitSlabOpening, openingFromRect, removeSlabOpening,
} from "./slab_openings.js";
import { broadcastPlanOp, itemMovePlanOp, itemMovePlanOps, sendPlanCursor } from "./plan_sync.js";
import { syncStairVoids } from "./ui.js";
import {
  snapshotNodes, enforceLocks, captureLock, canWeld, hitWarning,
  captureClear, preserveClear,
} from "./constraint_engine.js";
import {
  solveWallCons, pruneCons, addDistance, addJointAngle, addOffset,
  anchorAtWallEnd, conCurrent, prepareStableAnchors, mergeAnchorNodes,
  nodeAnchor, rehomeAnchorOwner, addAxisAlignment, addEqualAngle,
  angleSectorAtNode, addWallRelation, addPointWallDistance, addAxisDistance,
  addFixed, addCoincident, addSymmetric, addMidpoint, addPointOnLine,
  addWallAngle, addEqualLengthSet, pinnedNodes, wallCons, anchorNode, removeCon,
  addOpeningAlign, stabilizeOpeningCornerRefs, setConReport,
} from "./wall_constraints.js";
import {
  syncWarnHighlight, setConstraintHover, renderWarnPanel,
} from "./ui_warn.js";
import { hudKeydown, onDrawEnded, updateCadHud, entryOpen } from "./cad_hud.js";
import { roomPreset, rectInterior, CONNECTION_MODES } from "./room_presets.js";
import { solveDock, corridorRect, translateRect } from "./room_dock.js";
import { placeRoom, cutOpening, connectionForWall } from "./room_stamp.js";
import { wallSeparates, detachRoomSeam, roomMetaKey } from "./room_graph.js";
import {
  beginTouchPrecision, planTouchPrecisionKind, touchPrecisionPoint, updateTouchPrecision,
} from "./touch_precision.js";
import {
  cancelTouchPrecisionTrial, dispatchPrecisionCommit, dispatchPrecisionMove,
  getTouchPrecisionMode, getTouchPrecisionPrefs, releaseTouchPrecisionTrial, startTouchPrecisionTrial,
  touchPrecisionTrialOwns, updateTouchPrecisionTrial,
} from "./touch_precision_ui.js";
import {
  openingPlaceCommand, wallDrawCommand, itemDuplicateCommand, roomCreateCommand, roomStampCommand,
  executeCommand, executeCommandBatch, executePrepared, plannerCommand, prepareCommand, previewPrepared,
} from "./commands/index.js";
import {
  begin3DItemDrag, begin3DOpeningDrag, drag3DItemElev, drag3DItemTo,
  drag3DOpeningTo, end3DItemDrag, end3DOpeningDrag, opening3DPos, rotateItems,
  select3DTarget,
} from "./interaction/view3d_edit.js";
import {
  addSpace, afterPlacementCommandBatch, applyNodePairRelation, auditDragProxy,
  autoArrangeAll, beforePlacementCommandBatch, cleanupPlacementCommandBatch,
  commitItemPlacement, deleteRoom, finalizeItemPlacement, moveItemTo,
  normalizedRotation, openSegment, openWall, ownedNodeAnchor,
  placeOpeningOnSelected, rotateRoom, togglePinSelected,
  validatePlacementRelations, weldCoincidentNodes, weldNodes,
} from "./interaction/layout_drag.js";
import {
  agentCommandEnvironment, applyRemove, blockedDrag, conPickActive, deleteSel,
  dupSel, endConPick, eraseKey, executePlannerProposal, finishConPick,
  finishRemove, getOrMakeNode, healDrawnWallEnds, materializePlannerWall,
  pickErase, previewPlannerCommand, resolveLanding, selectAtScreen,
  splitIntersectionWalls, splitWallAt, startConPick, startNodeConPick,
  startOpeningAlignPick, targetLocked, wallHalfAt,
} from "./interaction/wall_edit.js";
import { snapMul, snapPoint, snapWallPoint } from "./interaction/wall_snap.js";
import {
  adoptMergedRoomMeta, arcWallPoint, armRoomStamp, buildDragCorridor,
  chamferSelectedWalls, commitRoomStamp, commitSlabFromTo, connectFusedWalls,
  cycleRoomStampConnMode, disarmRoomStamp, filletSelectedWalls,
  flipRoomStampDoorWall, fuseDroppedRoom, pickRoomEdge, rectPointTyped,
  rehomeDraggedRoom, resizeRoomStamp, restoreSelectedSharpCorner,
  roomEdgeLimit, roomOwnWalls, rotateRoomStamp, setRoomStampConnMode,
  setRoomStampSize, updateRoomGhost, updateSelectedCornerTreatment,
  wallPointPolar,
} from "./interaction/room_tools.js";
import {
  beginMEPDrag, commitPaintWall, commitRectFromTo, commitRoute,
  commitWallBite, dragMEP, finishDraw, handleBreakClick, handleJoinClick,
  handleOffsetClick, handleReverseClick, setTool, syncElevationTools,
  wallPoint,
} from "./interaction/mep_tools.js";
import {
  exteriorDoorSwing, hitItem, hitNode, hitOpening, hitRoom, hitWall,
  planIndexRecords, planPickSurface, tolCm, updateWallProbe,
} from "./interaction/hit_test.js";
export { updateWallProbe };
export { finishDraw, setTool, syncElevationTools, wallPoint };
export { arcWallPoint, armRoomStamp, chamferSelectedWalls, commitRoomStamp, cycleRoomStampConnMode, disarmRoomStamp, filletSelectedWalls, flipRoomStampDoorWall, rectPointTyped, resizeRoomStamp, restoreSelectedSharpCorner, rotateRoomStamp, setRoomStampConnMode, setRoomStampSize, updateRoomGhost, updateSelectedCornerTreatment, wallPointPolar };
export { snapPoint };
export { conPickActive, deleteSel, dupSel, endConPick, executePlannerProposal, previewPlannerCommand, resolveLanding, selectAtScreen, startConPick, startNodeConPick, startOpeningAlignPick, wallHalfAt };
export { addSpace, applyNodePairRelation, autoArrangeAll, deleteRoom, moveItemTo, openSegment, openWall, placeOpeningOnSelected, rotateRoom, togglePinSelected, weldCoincidentNodes, weldNodes };
export { begin3DItemDrag, begin3DOpeningDrag, drag3DItemElev, drag3DItemTo, drag3DOpeningTo, end3DItemDrag, end3DOpeningDrag, opening3DPos, rotateItems, select3DTarget };
// for js/interaction/layout_drag.js (live bindings: it sees every reassignment)
export { CEILING_TYPES, CENTER_TYPES, dropDragProxy, proxyNodes };
// for js/interaction/wall_edit.js (live bindings: it sees every reassignment)
export { PLANNER_COMMAND_HISTORY, pickCon };
// for js/interaction/wall_snap.js (live bindings: it sees every reassignment)
export { FOLD_TOL, INC_TOL, SNAP_BONUS, SNAP_GATE, WALL_TOL };
// for js/interaction/mep_tools.js (live bindings: it sees every reassignment)
export { STRUCTURE_AUTHOR_TOOLS, isElevation };
// for js/interaction/hit_test.js (live bindings: it sees every reassignment)
export { KIND_CACHE, SNAP_FLASH_MS, WALL_SNAP_GAP, snapSession };

function pickCon(x,y){return inputIs3D()?plannerInputView()?.constraint||null:flatPickCon(x,y);}
function isElevation() { return !inputIs3D() && flatIsElevation(); }

const PLANNER_COMMAND_HISTORY = Object.freeze({
  current: currentHistoryId,
  begin: beginHistoryTransaction,
  commit: commitHistoryTransaction,
  abort: abortHistoryTransaction,
});

/* ---- hit testing (world cm -> selection) ----
   A fingertip covers roughly a 9mm disc; a mouse cursor covers one pixel. The
   pick tolerances below are authored for the mouse and widened by PICK_SLOP
   while the gesture in progress is a touch, so the same tap that looks like it
   landed on a corner actually grabs it. Only PICKING grows — snap thresholds
   stay put, since those decide what the design becomes, not what you hit. */
export var PICK_SLOP = 1;
export function setPickSlop(pointerType) {
  PICK_SLOP = pointerType === "touch" ? 1.9 : 1;
}
/* ---- shared broad phase --------------------------------------------------
   Every pointer path in this file used to answer "what is near the cursor?" by
   walking the whole model. `snapPoint()` rebuilt its candidate set from
   scratch on each pointermove — a pass over the corners, the markers, the
   walls (five separate times), the openings and the items — and the `hit*`
   family scanned the same arrays linearly right behind it. js/spatial_index.js
   is the uniform grid that replaces the scans; this section is the planner's
   half of the deal: it turns S into records, keeps the shared `planIndex`
   pointed at them, and hands each caller a candidate list.

   Two invariants make the swap safe, and both are load-bearing:

     - the grid is a BROAD phase only. Every exact test — a corner's distance, a
       wall's perpendicular projection, an item's rotated-box containment, the
       `nearCursor` window on the intersection pass — still runs, unchanged, on
       whatever comes back. The grid may hand back records the caller then
       rejects; what it may never do is leave one out.
     - so every record's box is a SUPERSET of the geometry it stands for, and
       every query radius is a superset of the reach the exact test uses. A wall
       box covers its arc and is padded by a full thickness (half for the wall's
       own body, half again because wallGeom() shifts a location-line wall's
       endpoints laterally without moving its arc centre). An item box is the
       axis-aligned hull of its rotated footprint.

   Ordering is the other half of "same winner". The linear passes iterated
   S.walls / S.items / S.openings in array order and the corner loop in
   ascending node index, and both the snap sort (stable, so equal scores keep
   the order they were offered in) and the `d < bd` ties in hitNode/hitWall
   read that order. Every record therefore carries `ord`, its position in the
   array it came from, and nearRecs() sorts by it. */
var KIND_CACHE = {};

/* The layer filter in force for the current gesture.

   This is the gap layers.js leaves open on purpose. `layerAllowsSnapKind()`
   filters by snap KIND, and corner / midpoint / onwall map to no layer at all —
   which is what keeps centring a sofa on a wall alive while furniture is the
   work set. The cost of that choice is that hiding structure would not stop it
   offering corners, because nothing on the kind side knows where the corner
   came from. The source layer does know, and this is where it is asked: a
   hidden layer contributes no records, so it contributes no candidates of any
   kind. Widening the kind table instead would have taken the sofa-centring
   snap away with it.

   Ghosted layers are deliberately still indexed. They are already unhittable
   (every hit test refuses rank Infinity up front) but they remain snappable,
   which is what a faded reference layer is for. */
var snapSession = null;
/* Pin the layer filter for the length of a gesture and rebuild the index
   against it. Pinning rather than reading live means a drag cannot change what
   it snaps to halfway through because a panel was toggled under it. Pass a
   predicate to override; the default is "everything not hidden". */
export function beginSnapSession(layerFilter) {
  var open = {};
  ["structure", "furniture", "annotations", "mep"].forEach(function (id) {
    open[id] = layerFilter ? !!layerFilter(id) : !isLayerHidden(id);
  });
  snapSession = { open: open };
  planIndex.invalidate();
}
export function endSnapSession() {
  if (!snapSession) return;
  snapSession = null;
  planIndex.invalidate();
}

/* Point the shared index at this module's view of the model, then mark it
   stale so the first real query builds against a loaded plan rather than the
   empty one that exists at import time. */
planIndex.build(planIndexRecords);
planIndex.invalidate();

/* How close a piece's face has to come to a wall's face before it clicks flush.
   A hand-sized distance in centimetres — deliberately NOT scaled by zoom, so
   the snap behaves the same whether the plan is zoomed in or out. */
const WALL_SNAP_GAP = 9;
const SNAP_FLASH_MS = 300;

/* ---- tools ---- */
const STRUCTURE_AUTHOR_TOOLS = Object.freeze({
  wall: 1, arcwall: 1, rect: 1, roomstamp: 1, door: 1, window: 1,
  passage: 1, slabvoid: 1, walloffset: 1, walljoin: 1, wallbreak: 1,
  wallbite: 1, wallreverse: 1, wallpaint: 1,
});

if (typeof window !== "undefined")
  window.addEventListener("blueprint:trace-walls", function () { setTool("wall"); });
if (typeof window !== "undefined")
  window.addEventListener("layers:changed", syncElevationTools);

/* Reusable wall style defaults live in js/wall_draw.js so the inspector,
   rectangle tool, offset tool and typed polar input all stamp the same
   type / draw-from / location line. */

/* Two tolerances, because the two candidate sets are very different.
   The 15° increments blanket the circle — nothing is ever more than 7.5° from
   one — so a wide gate would snap EVERY angle and off-increment walls could
   never be drawn at all. A tight gate keeps them sticky near the increments
   while leaving the middle of each 15° span freely drawable.
   Wall directions are sparse and matching one is a deliberate intent
   ("continue/parallel that wall"), so they get the generous gate. */
const INC_TOL = (5 * Math.PI) / 180;
const WALL_TOL = (12 * Math.PI) / 180;
/* How close to an existing arm at the SAME corner counts as folding the new
   wall onto it. Deliberately not scaled by the snap-strength control — this is
   not an aid you can turn down, it is a shape the model must not contain. */
const FOLD_TOL = (4 * Math.PI) / 180;

/* Resolve a raw world point to a drafting snap.

   RANKED, NOT ORDERED. This used to be a ladder of early returns in a fixed
   CAD precedence — corner, then midpoint, then intersection, and so on — so
   the FIRST kind with anything inside the tolerance won regardless of how far
   away it was. A midpoint 13 cm from the cursor beat an intersection 2 cm from
   it, which is the whole "the snap grabbed the wrong thing" complaint: the
   answer was never the point the user was aiming at. Now every kind offers a
   candidate, and they compete on distance to the cursor with a small
   per-kind bonus (in PIXELS, so it means the same at every zoom) breaking ties
   in favour of the more meaningful snap. A corner still beats an on-wall point
   under the cursor; it no longer beats one 10 cm nearer.

   `fromIdx` is the corner(s) being drawn/dragged from — an index, an array of
   indices, or null. Passing several (a dragged corner has one wall on each
   side) means the angle can snap relative to ANY of them, not just the first.

   Returns {x, z, node, wall, s}: `node` = snap onto an existing corner,
   `wall`+`s` = snap onto a point along that wall, which the caller splits. */

/* A candidate kind's name and the preference chip that gates it are not the
   same word: several kinds land "on a wall" and the chips are named for what
   the user recognises. One map instead of the name being spelled two ways in
   four places. */
const SNAP_GATE = {
  corner: "corner",
  marker: "marker",
  blueprint: "marker",
  midpoint: "midpoint",
  itemCorner: "item",
  intersection: "intersection",
  perpendicular: "perpendicular",
  wall: "onwall",
  extension: "extension",
  jamb: "onwall",
  openingBlocked: "onwall",
  close: "corner",
  hit: "onwall",
};

/* Tie-break bonus in screen pixels. A kind with bonus 6 wins against a
   candidate 6 px closer, and loses to one 7 px closer. Ordered the way a
   drafter reads the drawing: a real vertex outranks a derived point, which
   outranks a point that merely lies on something. */
const SNAP_BONUS = {
  corner: 6,
  marker: 6,
  blueprint: 6,
  intersection: 5,
  midpoint: 4,
  itemCorner: 3,
  perpendicular: 3,
  extension: 1,
  wall: 0,
  /* The jamb outranks the blocked-opening warning it sits on the edge of.
     Both are offered at the cursor's own projection onto the wall, so at the
     jamb itself they were the same distance apart and the warning's higher
     bonus always took it: aiming AT the jamb — the one place a wall may join —
     reported "cannot connect inside an opening". Anywhere the jamb is out of
     snapping range the warning still wins, which is the case it is for. */
  jamb: 7,
  openingBlocked: 6,
  close: 8,
  hit: 6,
};

/* ---- smart auto-layout ---------------------------------------------------
   One-click tidy: pushes back-to-wall furniture flush against walls (facing
   the room, packed with clearance), centers tables/rugs, and hangs ceiling
   fixtures in the middle. Rectangular-room heuristic (uses each room's bbox);
   L-shaped rooms still get a reasonable perimeter arrangement. */
var CENTER_TYPES = { table: 1, roundTable: 1, coffee: 1, island: 1, dressTable: 1 };
// Anything that hangs from the slab: it must not eat wall run length, and it
// belongs over the middle of the room. The AC parts live here for the same
// reason the lights do — a diffuser pushed flush against a wall is nonsense.
var CEILING_TYPES = {
  ceilingLight: 1, pendant: 1,
  acDiffuser: 1, acReturn: 1, acCassette: 1, acDucted: 1,
};

/* Move ONE piece to a world position, with the full drag semantics: the 2cm
   grid, the smart alignment snap, the stacking host, and the riders standing
   on it. Both the plan drag and the 3D-view drag go through here, so a piece
   behaves the same whichever view you grabbed it in. */
/* ---- drag proxy ----------------------------------------------------------
   For the length of a gesture the pieces being dragged are lifted off the model
   canvas and redrawn on the HUD (js/plan2d.js, setDragProxy). The payoff is
   that the model canvas — the expensive half, the one that grows with the plan
   — paints twice for a whole drag instead of once per pointermove.

   The price is a promise: while the proxy is up the model image is FROZEN, so
   anything the gesture moves that the proxy did not lift would keep being drawn
   at its old position until pointerup. Two things in this file break that
   promise if left alone, and both are handled here rather than at the call
   sites:

     - a dragged piece carries whatever is standing on it (carryChildren, via
       moveItemTo and the multi-selection branch), and those children are not in
       S.sel. armDragProxy() adds the whole stack below the selection instead.
     - the two corner gestures run enforceLocks() and dragSolve() on every move,
       and both are allowed to move corners this drag never grabbed — a
       dimension elsewhere in the drawing relaxing, a locked neighbour letting
       go of a joint — as well as to change the node array outright
       (splitIntersectionWalls, weldNodes). None of that is predictable from the
       selection, so auditDragProxy() checks it after the fact against the
       snapshot those paths already take, and drops the proxy the moment
       something outside it has moved. Dropping it forces one full model paint,
       which is exactly the repair. */
var proxyNodes = null;
/* Lift the current drag onto the HUD. Called once, immediately after S.action
   is set on pointerdown, for the three gestures the proxy understands. */
function armDragProxy() {
  proxyNodes = null;
  if (S.action === "item" && S.sel) {
    /* Everything standing on the selection, at any depth: carryChildren moves
       exactly this set on every frame of the drag. */
    var base = S.sel.refs || (S.sel.ref ? [S.sel.ref] : []);
    var seen = new Set(base);
    var kids = [];
    base.forEach(function (it) { descendantsOf(it, seen, kids); });
    setDragProxy(kids.length ? [S.sel, { kind: "items", refs: kids }] : S.sel);
    return;
  }
  if (S.action === "wall" && S.wallDrag) {
    var w = S.wallDrag.wall;
    setDragProxy({ kind: "wall", ref: w });
    // the corners the gesture is allowed to move: a whole-wall drag translates
    // both of its own, and nothing else
    proxyNodes = [w.a, w.b];
    return;
  }
  if (S.action === "node" && S.nodeDrag) {
    setDragProxy({ kind: "node", ref: S.nodeDrag.node });
    proxyNodes = [S.nodeDrag.node];
  }
}
// Put the model image back and stop auditing. A no-op when no proxy is up, so
// it is safe to call unconditionally at every way a gesture can end.
function dropDragProxy() {
  proxyNodes = null;
  clearDragProxy();
}

/* ---- event wiring ---- */
export function initInteraction() {
  var pointers = {},
    pinch = null,
    nudgeT = 0, // active touch pointers + pinch state + last arrow-nudge time
    eraseSeen = null,
    erasePushed = false,
    spacePan = false,
    touchHostPlacement = null;
  function planPrecisionPoint(e, ox, oy, bounds, begin) {
    if (!e || e.pointerType !== "touch") return { x: ox, y: oy };
    var kind = planTouchPrecisionKind(S.tool, S.placeType);
    if (!kind) {
      S.touchContact = null;
      return { x: ox, y: oy };
    }
    if (begin || !S.touchContact || S.touchContact.pointerId !== e.pointerId || S.touchContact.kind !== kind)
      S.touchContact = beginTouchPrecision(e, ox, oy, bounds, kind);
    else updateTouchPrecision(S.touchContact, ox, oy);
    return touchPrecisionPoint(S.touchContact, ox, oy);
  }
  function beginPlanPrecisionTrial(e, ox, oy) {
    var mode = getTouchPrecisionMode();
    if (mode === "lens") return false;
    S.touchContact = null;
    startTouchPrecisionTrial({
      mode: mode,
      pointerId: e.pointerId,
      canvas: plan,
      x: ox,
      y: oy,
      axes: ["X", "Z"],
      unitLabel: unitLabel(),
      sourceCanvases: function () { return [plan]; },
      screenToModel: function (point) { return { x: wx(point.x, point.y), y: wz(point.x, point.y) }; },
      modelToScreen: function (point) {
        var screen = rotatePx(sx(point.x), sz(point.y));
        return { x: screen.x, y: screen.y };
      },
      describe: function (point) {
        var world = { x: wx(point.x, point.y), z: wz(point.x, point.y) };
        var secondary = mode === "rough" ? "1:" + getTouchPrecisionPrefs().refineRatio : "";
        if (S.drawing && S.drawFrom != null && S.nodes[S.drawFrom]) {
          var from = S.nodes[S.drawFrom], length = Math.hypot(world.x - from.x, world.z - from.z);
          var angle = Math.atan2(world.z - from.z, world.x - from.x) * 180 / Math.PI;
          secondary = "L " + fmtLen(length) + " · ∠ " + Math.round(angle * 10) / 10 + "°";
        }
        return { primary:"X " + fmtLen(world.x, { suffix: false }) + " · Z " + fmtLen(world.z, { suffix: false }), secondary:secondary };
      },
      getDistances: function (point) { return touchLensDistanceMap(point.x, point.y, true); },
      onMove: function (point) { dispatchPrecisionMove(plan, point); },
      onSnap: function (direction, point) {
        var count = Math.max(1, (S.snapAlts || []).length);
        S.snapCycle = ((Number(S.snapCycle) || 0) + direction + count) % count;
        var snapped = snapPoint(wx(point.x, point.y), wz(point.x, point.y), S.drawFrom);
        var screen = rotatePx(sx(snapped.x), sz(snapped.z));
        return { x:screen.x, y:screen.y };
      },
      onConfirm: function (point) { dispatchPrecisionCommit(plan, point); },
      onCancel: function () { S.touchContact=null; S.previewPt=null; S.snapGuides=[]; render2D(); },
    });
    return true;
  }
  function setSpacePan(on) {
    spacePan = !!on;
    if (plan) plan.classList.toggle("space-pan", spacePan);
  }
  function modelerKeyboardOwnsInput() {
    var modeler = document.getElementById("modeler");
    if (modeler && modeler.style.display !== "none") return true;
    /* The cabinet designer is the same kind of modal editor over the plan, and
       its keys overlap the planner's: Delete removed a compartment AND deleted
       the cabinet itself from the plan underneath, Ctrl+Z undid both
       histories, R rotated the hidden item. */
    return activeEditor() === "cab";
  }
  window.addEventListener("keydown", function (e) {
    if (modelerKeyboardOwnsInput()) return;
    var ae = document.activeElement;
    if (e.code !== "Space" || e.ctrlKey || e.metaKey || e.altKey ||
        (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) || isWalk()) return;
    e.preventDefault();
    setSpacePan(true);
  });
  window.addEventListener("keyup", function (e) {
    if (e.code === "Space") setSpacePan(false);
  });
  window.addEventListener("blur", function () { setSpacePan(false); });
  function beginEraseStroke() {
    eraseSeen = Object.create(null);
    erasePushed = false;
  }
  function strokeErase(hit) {
    if (!hit || !eraseSeen) return;
    var key = eraseKey(hit);
    if (eraseSeen[key]) return;
    if (targetLocked(hit)) {
      flash(t("f_targetLockedDel"), "error");
      eraseSeen[key] = 1;
      return;
    }
    if (!erasePushed) {
      pushHistory();
      erasePushed = true;
    }
    eraseSeen[key] = 1;
    /* Erasing the wall BETWEEN two rooms is the way to open one space into
       another — knock the partition out and the face trace finds one room
       where there were two. It is also, from the outside, indistinguishable
       from erasing any other wall, so it says what it did: without that, the
       two names collapsing into one looks like the app lost something. */
    var mergedRooms = hit && hit.kind === "wall" && hit.ref
      ? wallSeparates(detectRooms(), hit.ref.id) : null;
    if (applyRemove(hit)) finishRemove();
    if (mergedRooms) {
      adoptMergedRoomMeta(mergedRooms);
      flash(t("rp_merged"));
    }
  }
  function placeOpeningAt(tool, px, pz) {
    /* Resolve exactly one host with the same resolver used by wallProbe. The
       previous commit path independently collected every nearby wall, so a
       click on a corner could create two coincident doors even though hover
       highlighted only one wall. */
    var wall = hitWall(px, pz);
    var projected = wall && wallProject(wall, px, pz);
    if (!wall || !projected) {
      flash(t("opening_need_wall"));
      window.dispatchEvent(new CustomEvent("planner-opening-missed", {
        detail: { tool: tool, x: px, z: pz },
      }));
      return false;
    }
    var swing = tool === "door" ? exteriorDoorSwing(wall, projected.s) : null;
    var result = executeCommand(openingPlaceCommand, {
      wallId: wall.id,
      type: tool,
      s: projected.s,
      ...openingDrawDefaults(tool),
      ...(swing ? { swingDir: swing } : {}),
    }, agentCommandEnvironment(), {
      label: t("f_openingPlaced", { name: t(tool) }),
      /* The tool stays armed, like the point and MEP tools: a flat takes a
         dozen openings, and dropping back to select after each one cost a
         trip to the ribbon per window. The new one is still selected, so the
         inspector shows it; Esc or right-click ends the tool. */
      presentation: { selectCreated: true },
    });
    if (!result.ok || !result.created.length) {
      flash(t("opening_need_wall"));
      return false;
    }
    var madeId = result.created[0].id;
    var made = S.openings.find(function (opening) { return opening.id === madeId; });
    if (!made) return false;
    return true;
  }
  /* ---- two-finger tap = undo, three-finger tap = redo ----
     The two editing actions a phone user reaches for constantly, given a
     gesture so they cost no screen at all. Armed by the second finger landing
     and disarmed by any real pinch: a tap is fingers down and up inside
     TWOTAP_MS with the pair barely moving, which is nothing like the zoom
     gesture it shares a starting position with.

     Redo rides the SAME detector rather than a parallel one, counting the most
     fingers the gesture ever had. A third finger never lands at the same
     millisecond as the second, so a separate three-finger arm would either
     have to re-arm (restarting the clock mid-gesture) or race the two-finger
     one — and either way an ordinary pinch that briefly grew a third finger
     would start meaning something. */
  var TWOTAP_MS = 260,
    TWOTAP_SLOP = 16,
    twoTap = null,
    preTouchSel = null; // what was selected before this gesture's first finger
  function armTwoTap() {
    var ids = Object.keys(pointers);
    if (twoTap) {
      // Already armed by an earlier finger: only the count grows, so the clock
      // still runs from when the gesture actually started.
      twoTap.n = Math.max(twoTap.n, ids.length);
      return;
    }
    var a = pointers[ids[0]],
      b = pointers[ids[1]];
    twoTap = {
      t: Date.now(),
      d0: Math.hypot(a.x - b.x, a.y - b.y),
      ax: a.x,
      ay: a.y,
      n: ids.length,
    };
  }
  function breakTwoTap() {
    twoTap = null;
  }
  function tryTwoTap() {
    if (!twoTap) return false;
    var hit = Date.now() - twoTap.t <= TWOTAP_MS;
    var fingers = twoTap.n;
    twoTap = null;
    if (!hit) return false;
    /* The first finger of the gesture already picked whatever it landed on.
       The gesture means "undo", not "select this", so put the selection back
       before undoing — which then replaces it with its own if it has one. */
    S.sel = preTouchSel;
    if (fingers >= 3) redo();
    else undo();
    render2D();
    if (navigator.vibrate) navigator.vibrate(12);
    return true;
  }

  function beginPinch() {
    var ids = Object.keys(pointers),
      a = pointers[ids[0]],
      b = pointers[ids[1]],
      mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      wmx: (mx - S.OX) / inputScale(),
      wmy: (my - S.OY) / inputScale(),
      sc: inputScale(),
    };
    cancelPending();
    S.wallPress = null; // a second finger turns the gesture into navigation
    S.dragRoom = null;
    S.wallAngleGuide = null;
    S.alignX = S.alignZ = null;
    S.touchContact = null;
    touchHostPlacement = null;
    S.action = "pinch";
  }
  function updatePinch() {
    var ids = Object.keys(pointers);
    if (ids.length < 2) return;
    var a = pointers[ids[0]],
      b = pointers[ids[1]];
    var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    // Any actual zoom or pan means this was a pinch, not a tap.
    if (twoTap && (Math.abs(dist - twoTap.d0) > TWOTAP_SLOP ||
        Math.hypot(a.x - twoTap.ax, a.y - twoTap.ay) > TWOTAP_SLOP))
      breakTwoTap();
    S.SC = clamp(pinch.sc * (dist / pinch.dist), 0.08, 6);
    S.OX = mx - pinch.wmx * inputScale();
    S.OY = my - pinch.wmy * inputScale();
    render2D();
  }

  /* ---- long press = right click ----
     Touch has no second button, so the contextual menu would be unreachable on
     a phone or tablet. A press that stays put for LONGPRESS_MS aborts whatever
     drag it had started (nothing has moved, so cancelling the pending history
     step leaves no trace) and asks main.js to open the menu at the finger. */
  var LONGPRESS_MS = 480,
    LONGPRESS_SLOP = 10, // px of wander still counted as "held still"
    lp = null;
  function cancelLongPress() {
    if (lp) {
      clearTimeout(lp.timer);
      lp = null;
    }
  }
  function armLongPress(e) {
    cancelLongPress();
    var sx = e.clientX,
      sy = e.clientY,
      id = e.pointerId;
    lp = {
      x: sx,
      y: sy,
      id: id,
      timer: setTimeout(function () {
        lp = null;
        cancelPending();
        // the press became a context menu, so whatever drag it had started is
        // abandoned here and never reaches endAction
        dropDragProxy();
        S.action = null;
        S.dragRoom = null;
        S.nodeDrag = null;
        S.wallDrag = null;
        S.wallAngleGuide = null;
        S.mepDrag = null;
        S.stackHost = null;
        S.alignX = S.alignZ = null;
        stopAutoPan();
        try {
          plan.releasePointerCapture(id);
        } catch (_) {}
        render2D();
        plan.dispatchEvent(
          new CustomEvent("plan-longpress", {
            detail: { clientX: sx, clientY: sy },
          }),
        );
      }, LONGPRESS_MS),
    };
  }
  function trackLongPress(e) {
    if (!lp) return;
    if (Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LONGPRESS_SLOP)
      cancelLongPress();
  }

  plan.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  let gestureSession = null;
  function pointerDown(e) {
    gestureSession = null;
    armHistoryGesture(() => { gestureSession = captureHistorySession(); });
    setPickSlop(e.pointerType);
    /* Open a snap session for the gesture. It pins which layers may contribute
       candidates (see beginSnapSession) so a panel toggled mid-drag cannot
       change what the drag snaps to, and it gives the index one build to serve
       the whole gesture's hit tests and pointermoves. endAction closes it. */
    beginSnapSession();
    if(e.isTrusted)plan.setPointerCapture(e.pointerId);
    var r = inputBounds(plan);
    var ox = e.clientX - r.left;
    var oy = e.clientY - r.top;

    // CAD-standard navigation temporarily wins over every editing tool. A
    // middle drag or Space+left drag pans without changing the active tool.
    if (e.button === 1 || (spacePan && e.button === 0)) {
      e.preventDefault();
      S.action = "pan";
      S.panStart = { ox: S.OX, oy: S.OY, px: ox, py: oy };
      plan.classList.add("is-panning");
      return;
    }

    /* Elevation views: wall drawing stays in the plan, but items, openings and
       placeholder points are edited in the two axes the elevation can see
       (along the facade, and height). */
    if (isElevation()) {
      if (S.tool === "erase") {
        if (e.button === 2) { setTool("select"); return; }
        beginEraseStroke();
        S.action = "erase";
        var eh = elevationHit(ox, oy);
        if (eh && eh.kind !== "room") strokeErase(eh);
        return;
      }
      if (S.tool === "wall" || S.tool === "arcwall") {
        setTool("select");
      }
      if (S.tool === "point") {
        if (e.button === 2) { setTool("select"); render2D(); return; }
        var ep = elevPick(ox, oy);
        if (!ep) { flash(t("f_placeFail"), "error"); return; }
        pushHistory();
        var emk = addMarker(ep);
        if (!emk) { flash(t("f_placeFail"), "error"); return; }
        S.markerPreview = null;
        select({ kind: "marker", ref: emk });
        render2D();
        refreshTree();
        return;
      }
      if (S.tool === "door" || S.tool === "window" || S.tool === "passage") {
        var ewh = elevWallAt(ox, oy, true);
        if (!ewh) return;
        var elevationTool = S.tool, edd = openingDrawDefaults(elevationTool), sill = edd.sill;
        if (S.tool === "window" && isFinite(ewh.v))
          sill = Math.max(0, Math.round(ewh.v - edd.height / 2));
        sill = clamp(sill, 0, Math.max(0, (ewh.w.height || WALL_H) - edd.height));
        var elevationResult = executeCommand(openingPlaceCommand, {
          wallId: ewh.w.id, type: elevationTool, s: ewh.s,
          width: edd.width, height: edd.height, sill: sill,
        }, agentCommandEnvironment(), {
          label: t("f_openingPlaced", { name: t(elevationTool) }),
          presentation: { selectCreated: true, switchToolTo: "select" },
        });
        if (!elevationResult.ok) flash(t("opening_need_wall"), "error");
        return;
      }
      var eh = elevationHit(ox, oy);
      select(eh || null);
      /* Selection is unconditional; the GESTURE is not. An elevation obeys the
         same rule as the plan — a hit on a layer that is visible but off the
         work set, on a locked layer, or on a pinned object fills the inspector
         and stops there, so reading a wall's opening while furnishing can
         never slide it by accident. */
      if (eh && e.button !== 2) {
        if (!canDrag(eh)) {
          blockedDrag(eh);
        } else if (eh.kind === "marker") {
          S.action = "markerElev";
          beginHistory();
        } else if (eh.kind === "item") {
          S.action = "itemElev";
          S.elevGrab = elevItemGrab(eh.ref, ox, oy);
          beginHistory();
        } else if (eh.kind === "opening") {
          S.action = "openingElev";
          S.elevGrab = elevOpeningGrab(eh.ref, ox, oy);
          beginHistory();
        }
      }
      render2D();
      return;
    }

    if (e.pointerType === "touch") {
      S.touchDrag = true; // gates the snap haptic to actual finger drags
      if (!Object.keys(pointers).length) preTouchSel = S.sel;
      pointers[e.pointerId] = { x: ox, y: oy };
      if (Object.keys(pointers).length >= 2) {
        cancelLongPress(); // a second finger is a pinch, never a menu
        armTwoTap();
        beginPinch();
        return;
      }
      // Only the select tool has a contextual menu; while a tool is drawing,
      // a long press is just a slow first click.
      if (!S.tool || S.tool === "select") armLongPress(e);
    }
    if (e.pointerType === "touch" && planTouchPrecisionKind(S.tool, S.placeType) && beginPlanPrecisionTrial(e, ox, oy))
      return;
    var precisionPoint = planPrecisionPoint(e, ox, oy, r, true);
    var px = wx(precisionPoint.x, precisionPoint.y),
      pz = wz(precisionPoint.x, precisionPoint.y);

    /* Picking the OTHER side of a new dimension. Armed from the wall
       inspector, it swallows exactly one click and then disarms — a modal
       state that outlives its own gesture is how an editor starts feeling
       possessed. Right-click (or Escape, handled with the other keys) cancels. */
    if (S.conPick) {
      if (e.button === 2) {
        endConPick(null);
        return;
      }
      finishConPick(px, pz);
      return;
    }

    /* Host-based creation must hit the wall/item under the finger exactly, so
       it uses no offset. Touch waits for release, however: the held frame can
       show the magnified host and the user can slide to refine before commit. */
    if (e.pointerType === "touch" && S.touchContact && S.touchContact.kind === "lens" &&
        (S.placeType || S.tool === "door" || S.tool === "window" || S.tool === "passage")) {
      touchHostPlacement = {
        pointerId: e.pointerId,
        tool: S.tool,
        placeType: S.placeType,
      };
      render2D();
      return;
    }

    if (S.tool === "wall") {
      if (e.button === 2) {
        if (S.drawing) prepareHistoryGesture();
        finishDraw();
        return;
      }
      if (S.drawing && S.measureTarget === "manual" && e.shiftKey) {
        var mw = hitWall(px, pz);
        if (mw) {
          var mi = S.measureWalls.indexOf(mw.id);
          if (mi === -1) S.measureWalls.push(mw.id);
          else S.measureWalls.splice(mi, 1);
          render2D();
        }
        return;
      }
      if (!S.drawing && (e.altKey || e.metaKey)) {
        var paintHost = hitWall(px, pz);
        if (paintHost) { commitPaintWall(paintHost); return; }
      }
      /* First segment supports Chief Architect's press-drag-release gesture.
         A stationary press remains the familiar first click of click-click
         placement; endAction commits only when the pointer actually travelled. */
      var wasDrawing = S.drawing;
      // A continued first segment can change topology without another push.
      prepareHistoryGesture();
      wallPoint(snapWallPoint(px, pz, S.drawFrom));
      if (!wasDrawing && S.drawing)
        S.wallPress = { pointerId: e.pointerId, x: ox, y: oy };
      return;
    }
    if (S.tool === "walloffset") {
      if (e.button === 2) { S.offsetDraft = null; S.previewPt = null; render2D(); return; }
      handleOffsetClick(px, pz);
      return;
    }
    if (S.tool === "wallbreak") {
      if (e.button === 2) { setTool("select"); return; }
      handleBreakClick(px, pz);
      return;
    }
    if (S.tool === "wallbite") {
      if (e.button === 2) { S.biteDraft = null; setTool("select"); render2D(); return; }
      var bw = hitWall(px, pz);
      var bp = bw && wallProject(bw, px, pz);
      if (!bw || !bp) { flash(t("wd_bite_need")); return; }
      S.biteDraft = { wall: bw.id, s0: bp.s, s1: bp.s };
      S.action = "wallbite";
      render2D();
      return;
    }
    if (S.tool === "walljoin") {
      if (e.button === 2) { S.joinPick = null; setTool("select"); return; }
      handleJoinClick(px, pz);
      return;
    }
    if (S.tool === "wallreverse") {
      if (e.button === 2) { setTool("select"); return; }
      handleReverseClick(px, pz);
      return;
    }
    if (S.tool === "wallpaint") {
      if (e.button === 2) { setTool("select"); return; }
      var pw = hitWall(px, pz);
      if (pw) commitPaintWall(pw);
      else flash(t("wd_paint_need"));
      return;
    }
    if (S.tool === "erase") {
      if (e.button === 2) { setTool("select"); return; }
      beginEraseStroke();
      S.action = "erase";
      strokeErase(pickErase(px, pz, ox, oy));
      return;
    }
    if (S.tool === "arcwall") {
      if (e.button === 2) {
        S.arcDraft = null; S.previewPt = null; render2D();
        return;
      }
      arcWallPoint(snapPoint(px, pz, null));
      return;
    }
    if (S.tool === "rect") {
      if (e.button === 2) {
        S.rectDraft = null; S.previewPt = null; setTool("select"); render2D();
        return;
      }
      var rp = snapPoint(px, pz, null);
      if (!S.rectDraft) {
        S.rectDraft = { x: rp.x, z: rp.z };
        S.previewPt = { x: rp.x, z: rp.z };
        render2D();
        return;
      }
      if (commitRectFromTo(S.rectDraft, rp)) setTool("select");
      S.rectDraft = null;
      S.previewPt = null;
      render2D();
      return;
    }
    if (S.tool === "roomstamp") {
      if (e.button === 2) { disarmRoomStamp(); setTool("select"); render2D(); return; }
      updateRoomGhost(px, pz);
      commitRoomStamp();
      // the preset stays armed; the ghost follows the pointer to the next room
      updateRoomGhost(px, pz);
      render2D();
      return;
    }
    if (S.tool === "slabvoid") {
      if (e.button === 2) {
        S.rectDraft = null; S.previewPt = null; setTool("select"); render2D();
        return;
      }
      var sp = snapPoint(px, pz, null);
      if (!S.rectDraft) {
        S.rectDraft = { x: sp.x, z: sp.z };
        S.previewPt = { x: sp.x, z: sp.z };
        render2D();
        return;
      }
      if (commitSlabFromTo(S.rectDraft, sp)) setTool("select");
      S.rectDraft = null;
      S.previewPt = null;
      render2D();
      return;
    }
    if (S.tool === "annotation" && S.annotationDraft) {
      if (e.button === 2) { S.annotationDraft = null; setTool("select"); render2D(); return; }
      var draft = S.annotationDraft;
      var point = snapPoint(px, pz, null);
      if (!fin(point.x) || !fin(point.z)) return;
      if ((draft.kind === "dimension" || draft.kind === "section") && !draft.from) {
        draft.from = { x: point.x, z: point.z }; render2D(); return;
      }
      var start = draft.from || point;
      if (draft.from && Math.hypot(point.x - start.x, point.z - start.z) < 1) return;
      pushHistory();
      var annotation = { id: uid(), kind: draft.kind, x: start.x, z: start.z,
        ...(draft.from ? { x2: point.x, z2: point.z } : {}),
        ...(draft.text ? { text: draft.text } : {}), ...(draft.symbol ? { symbol: draft.symbol } : {}) };
      S.annotations.push(annotation);
      S.annotationDraft = null;
      setTool("select"); render2D();
      window.dispatchEvent(new CustomEvent("planner-annotation-created", { detail: { annotation } }));
      return;
    }
    if (S.placeType && (!S.tool || S.tool === "select")) {
      if (e.button === 2) {
        S.placeType = null;
        window.dispatchEvent(new CustomEvent("planner-place"));
        render2D();
        return;
      }
      placeFurnAt(S.placeType, px, pz);
      return;
    }
    if (S.tool === "door" || S.tool === "window" || S.tool === "passage") {
      if (e.button === 2) { setTool("select"); render2D(); return; }
      placeOpeningAt(S.tool, px, pz);
      return;
    }

    /* Placeholder point: drop a measured spot on the plan. It goes through the
       same snapPoint the wall tool uses, so a point can be pinned exactly to a
       corner, to a spot on a wall, or to the grid — a point that is only
       roughly where you meant is not worth measuring from. The tool stays armed
       for rapid placement (Esc or right-click to stop), matching mepNode. */
    if (S.tool === "point") {
      if (e.button === 2) { setTool("select"); render2D(); return; }
      /* With the plan pane hidden the transform is all zeros and wx/wz hand
         back NaN, so this has to be resolved and CHECKED before anything is
         committed: a NaN point is invisible, unmeasurable, and still saves
         (as null) — the same trap dropPoint() was written for. Validating
         before pushHistory also keeps a refusal from leaving a no-op undo
         entry that would swallow the next Ctrl+Z. */
      var mp = snapPoint(px, pz, null);
      if (!fin(mp.x) || !fin(mp.z)) mp = dropPoint();
      if (!fin(mp.x) || !fin(mp.z)) {
        flash(t("f_placeFail"), "error");
        return;
      }
      pushHistory();
      // Plan points start at floor height; 3D picks retain the measured
      // surface height. Wall points also retain their host and facing side.
      var nm = addMarker(planPickSurface(mp, px, pz));
      if (!nm) return;
      S.markerPreview = null;
      S.snapGuides = [];
      select({ kind: "marker", ref: nm });
      render2D();
      refreshTree();
      return;
    }

    // MEP: place a device
    if (S.tool === "mepNode") {
      var m0 = ensureMEP();
      if (!m0.place) return;
      if (e.button === 2) { setTool("select"); render2D(); return; }
      pushHistory();
      var sp = snapMEPPoint(px, pz);
      var nn = addNode(m0.place.sys, m0.place.kind, sp.x, sp.z,
        sp.wall != null ? sp.wall : null, sp.s != null ? sp.s : null, m0.layer);
      select({ kind: "mepNode", ref: nn });
      S.dirty3D = true;
      render2D();
      refreshTree();
      return; // tool stays armed for rapid placement (Esc / select to stop)
    }
    // MEP: route a pipe/cable (click to add vertices; dbl-click/Enter/right-click to finish)
    if (S.tool === "mepRoute") {
      var m1 = ensureMEP();
      if (!m1.place) return;
      if (e.button === 2) { commitRoute(); return; }
      var rp = snapMEPPoint(px, pz);
      if (!m1.route) {
        m1.route = { sys: m1.place.sys, k: m1.place.kind, layer: m1.layer, pts: [{ x: rp.x, z: rp.z }], preview: null };
        m1.route.pts[0].wall = rp.wall;
        m1.route.pts[0].s = rp.s;
      } else if (m1.wallRoute) {
        // follow the walls between the last vertex and this click, the way the
        // chase/pipe actually gets cut, instead of flying straight across
        var lastPt = m1.route.pts[m1.route.pts.length - 1];
        var routed = wallPath(lastPt, rp, m1.layer);
        if (!routed) {
          flash(t("mep_doorBlocked"), "error");
          return;
        }
        routed.forEach(function (p) { m1.route.pts.push(p); });
      } else {
        m1.route.pts.push({ x: rp.x, z: rp.z });
      }
      render2D();
      return;
    }

    // select tool
    if (e.button === 2) {
      S.action = "pan";
      S.panStart = { ox: S.OX, oy: S.OY, px: e.offsetX, py: e.offsetY };
      return;
    }
    // Clear old transient state from projects saved before connected placement.
    S.freshWall = null;
    /* ---- the select-tool pick chain, run twice ----

       The chain below is the old one, unchanged in order, wrapped in a
       function that only tests the layers at ONE rank. It is then run at rank
       0 and, if nothing focused answered, at rank 1.

       That is the whole fix for "I clicked the TV and got the wall". The plan
       draws the wall band after the items, and every test used to scan
       everything in one pass, so whichever band happened to be checked first
       won regardless of what the user was doing. Now the layer being edited is
       consulted first as a group, and everything else only gets the click when
       the focused layers all missed. Nothing becomes unclickable: a rank-1 hit
       still selects and still fills the inspector — it just never arms a drag
       (see canDrag in js/layers.js), so an off-work-set wall is readable
       without being movable.

       Each gate is `layerRank(id) === pass`, which also disposes of rank
       Infinity for free: a ghosted or hidden layer equals neither 0 nor 1, so
       it is never reached in either pass, and no band is ever tested twice.

       ORDER WITHIN A PASS IS LOAD-BEARING and every step of it is explained
       where it sits. In short: MEP before items so a socket standing on
       furniture is still grabbable; dimension labels before corners and walls
       because a label is a small box drawn on top of everything; placeholder
       points before items and openings because a point is a ~12px target that
       is usually standing INSIDE the footprint of the thing it holds. Rooms
       are not in the chain at all — the floor swallows every click inside it,
       so it answers after BOTH passes (see runRoomPass below). */
    function runSelectPass(pass) {
      // MEP entities are selectable/draggable with the select tool (before items,
      // so a device sitting on furniture is still grabbable)
      if (layerRank("mep") === pass) {
        var hm = hitMEP(px, pz, inputScale());
        if (hm) {
          var msel = hm.kind === "mepRun" ? { kind: "mepRun", ref: hm.ref } : hm;
          select(msel);
          if (canDrag(msel)) beginMEPDrag(hm, px, pz);
          else {
            S.action = null;
            blockedDrag(msel);
          }
          render2D();
          return true;
        }
      }
      /* A dimension's own label is selectable, so a constraint can be edited,
         flipped, suppressed or deleted from the drawing instead of only from a
         list that is filtered by whichever wall happens to be selected. Tested
         against SCREEN coordinates, because that is where the labels were laid
         out, and against the boxes the renderer actually drew (see pickCon) so
         the target can never drift from the glyph.

         Deliberately BEFORE corners and walls: a label is a small box the user
         aimed at, and it is drawn on top of everything, so it must pick first or
         the thing underneath swallows every click on it. The pin's ring is the
         exception and carries its own offset tag for exactly this reason. */
      if (layerRank("annotations") === pass) {
        var hc = pickCon(e.offsetX, e.offsetY);
        if (hc) {
          select({ kind: "con", ref: hc });
          renderWarnPanel(true);
          render2D();
          return true;
        }
      }
      if (layerRank("structure") === pass) {
        var hn = hitNode(px, pz);
        if (hn != null) {
          /* Ctrl/Cmd (and Shift for parity with item selection) selects structural
             features without starting a drag. Two selected corners unlock the
             contextual Join/Distance/Align/Equal-angle palette in the inspector. */
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            var pickedNodes = S.sel && S.sel.kind === "nodes"
              ? S.sel.refs.slice()
              : S.sel && S.sel.kind === "node" ? [S.sel.ref] : [];
            var existingNode = pickedNodes.indexOf(hn);
            if (existingNode === -1) pickedNodes.push(hn);
            else pickedNodes.splice(existingNode, 1);
            /* No cap. It used to drop the oldest corner past two, which made the
               pair relations easy to reach and made everything that needs three
               or more — pinning a run of corners, equal spacing, "all of these on
               one line" — impossible to even select for. The pair-only verbs
               disable themselves when the count is wrong, which is the honest way
               round: the selection says what you picked, the palette says what
               can be done with it. */
            select(pickedNodes.length > 1
              ? { kind: "nodes", refs: pickedNodes }
              : pickedNodes.length === 1 ? { kind: "node", ref: pickedNodes[0] } : null);
            S.action = null;
            render2D();
            return true;
          }
          /* Picking a glowing corner also picks its warning, so the message list
             scrolls to it and highlights the same thing the canvas does. */
          var hwarn = hitWarning(px, pz, tolCm(14));
          /* Grabbing the END of the wall that is already selected resizes THAT wall
             alone: its neighbours hold their locked dimensions and simply release
             the joint (see js/constraint_engine.js). Grabbing a bare corner still
             moves the whole joint — the user took hold of the junction itself, so
             every wall on it is being edited on purpose. */
          var endOf =
            S.sel && S.sel.kind === "wall" &&
            (S.sel.ref.a === hn || S.sel.ref.b === hn)
              ? S.sel.ref
              : null;
          // grabbing the end of the wall you had selected keeps that wall selected:
          // the gesture is an edit OF that wall, not a pick of the junction
          if (!endOf) select({ kind: "node", ref: hn });
          S.warnSel = hwarn ? hwarn.key : null; // after select(), which clears it
          if (hwarn) syncWarnHighlight();
          /* Pick it, read it, but don't let a stray drag move it. canDrag asks
             three questions at once — is structure the work set, is the layer's
             padlock open (that IS S.lockStruct), and is the corner itself
             pinned — so the same call covers the rank-1 case and the L key. */
          var nodeSel = { kind: "node", ref: hn };
          if (canDrag(nodeSel)) {
            S.action = "node";
            S.nodeDrag = { node: hn, wall: endOf ? endOf.id : null };
            S.jointsReleased = 0;
            beginHistory();
          } else {
            S.action = null;
            blockedDrag(nodeSel);
          }
          render2D();
          return true;
        }
      }
      /* Placeholder points are picked before items and openings: a point is a
         ~12px target that is very often standing INSIDE the footprint of the
         object it holds, so anything with a larger hit area would bury it. */
      if (layerRank("annotations") === pass) {
        var hmk = hitMarker(px, pz, inputScale());
        if (hmk) {
          var mkSel = { kind: "marker", ref: hmk };
          select(mkSel);
          if (canDrag(mkSel)) {
            S.action = "marker";
            beginHistory();
            S.dragOff = { x: px - hmk.x, z: pz - hmk.z };
          } else {
            S.action = null;
            blockedDrag(mkSel);
          }
          render2D();
          return true;
        }
      }
      if (layerRank("structure") === pass) {
        var ho = hitOpening(px, pz);
        if (ho) {
          var opSel = { kind: "opening", ref: ho };
          select(opSel);
          if (!canDrag(opSel)) {
            S.action = null;
            blockedDrag(opSel);
            render2D();
            return true;
          }
          S.action = "opening";
          beginHistory();
          var w2 = wallById(ho.wall),
            gm2 = wallGeom(w2);
          S.dragOff.s = (px - gm2.a.x) * gm2.ux + (pz - gm2.a.z) * gm2.uz - ho.s;
          render2D();
          return true;
        }
      }
      if (layerRank("furniture") === pass) {
        var hi = hitItem(px, pz);
        if (hi) {
          var toSelect = [hi];
          if (hi.groupId) {
            var hid = hiddenSets();
            toSelect = S.items.filter(function(it) {
              return it.groupId === hi.groupId && !hid.items[it.id] && !itemUserUnpickable(it);
            });
          }

          if (e.shiftKey) {
            var cur = (S.sel && S.sel.kind === "items") ? S.sel.refs : (S.sel && S.sel.kind === "item" ? [S.sel.ref] : []);
            toSelect.forEach(function(it) {
              if (cur.indexOf(it) === -1) cur.push(it);
            });
            if (cur.length > 1) {
              select({ kind: "items", refs: cur });
            } else {
              select({ kind: "item", ref: cur[0] });
            }
            S.action = "item";
          } else {
            var inCur = (S.sel && S.sel.kind === "items" && S.sel.refs.indexOf(hi) !== -1);
            if (!inCur) {
              if (toSelect.length > 1) select({ kind: "items", refs: toSelect });
              else select({ kind: "item", ref: hi });
            }
            S.action = "item";
          }

          if (S.sel.kind === "items") {
            var cx = 0, cz = 0;
            S.sel.refs.forEach(function(it) { cx += it.x; cz += it.z; });
            cx /= S.sel.refs.length; cz /= S.sel.refs.length;
            S.dragOff = { x: px - cx, z: pz - cz };
            S.dragOrig = S.sel.refs.map(function(it) { return { it: it, x: it.x, z: it.z }; });
          } else {
            S.dragOff = { x: px - hi.x, z: pz - hi.z };
          }
          /* The selection above is made either way — the inspector fills for a
             pinned sofa exactly as it does for a free one. Only the GESTURE is
             withdrawn, and canDrag reads the selection that was actually made,
             so a marquee is refused only when every piece in it is pinned. */
          if (!canDrag(S.sel)) {
            S.action = null;
            blockedDrag(S.sel);
          }
          if (S.action) beginHistory();
          render2D();
          return true;
        }
      }
      if (layerRank("structure") === pass) {
        var hv = hitSlabOpening(px, pz);
        if (hv) {
          var voidSel = { kind: "slabvoid", ref: hv };
          select(voidSel);
          if (canDrag(voidSel)) {
            S.action = "slabvoid";
            beginHistory();
            S.dragOff = { x: px - hv.x, z: pz - hv.z };
          } else {
            S.action = null;
            blockedDrag(voidSel);
          }
          render2D();
          return true;
        }
        var hw = hitWall(px, pz);
        if (hw) {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            var pickedWalls = S.sel && S.sel.kind === "walls"
              ? S.sel.refs.slice()
              : S.sel && S.sel.kind === "wall" ? [S.sel.ref] : [];
            var wallAt = pickedWalls.indexOf(hw);
            if (wallAt === -1) pickedWalls.push(hw); else pickedWalls.splice(wallAt, 1);
            select(pickedWalls.length > 1
              ? { kind: "walls", refs: pickedWalls }
              : pickedWalls.length === 1 ? { kind: "wall", ref: pickedWalls[0] } : null);
            S.action = null; render2D(); return true;
          }
          // clicking a half of the ALREADY selected wall picks which half a typed
          // length/angle edit grows or shrinks (first click just selects the wall)
          if (S.sel && S.sel.kind === "wall" && S.sel.ref === hw) {
            var half = wallHalfAt(hw, px, pz);
            S.wallEditEnd = S.wallEditEnd === half ? null : half;
            syncWallEnd();
          } else select({ kind: "wall", ref: hw });
          /* The body of a wall is a drag handle: the whole wall travels, both
             corners with it. It is a rigid move, so the wall keeps its own length
             and angle; anything else meeting those corners is stretched instead
             (and a locked neighbour lets go of the joint rather than deform) —
             the same rule a room drag follows. A pure click moves nothing: the
             delta is grid-quantised, so it stays 0 until the pointer really
             travels, which is what keeps the half-picking click above intact. */
          var wallSel = { kind: "wall", ref: hw };
          if (canDrag(wallSel)) {
            S.action = "wall";
            beginHistory();
            S.jointsReleased = 0;
            S.wallDrag = {
              wall: hw,
              sx: px,
              sz: pz,
              orig: [hw.a, hw.b].map(function (i) {
                return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
              }),
            };
            S.wallAngleGuide = null;
          } else {
            S.action = null;
            blockedDrag(wallSel);
          }
          render2D();
          return true;
        }
      }
      return false;
    }
    /* An edge handle of the ALREADY SELECTED room outranks everything, because
       it is a control the user can see and has deliberately aimed at. It is
       offered only for the current selection, so it can never intercept a
       click meant for a piece of furniture in a room nobody selected. */
    function runRoomEdgePass() {
      if (!S.sel || S.sel.kind !== "room") return false;
      var handle = pickRoomEdge(px, pz);
      if (!handle) return false;
      var edgeSel = { kind: "wall", ref: handle.wall };
      if (!canDrag(edgeSel)) {
        /* Clearing matters as much as refusing: an action left armed by the
           previous pointerdown would otherwise run against the side that was
           just refused. */
        S.action = null;
        blockedDrag(edgeSel);
        return true;
      }
      S.action = "wall";
      beginHistory();
      S.jointsReleased = 0;
      S.wallDrag = {
        wall: handle.wall,
        sx: px,
        sz: pz,
        orig: [handle.wall.a, handle.wall.b].map(function (i) {
          return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
        }),
        /* What makes this a RESIZE rather than a wall drag: the side may only
           travel along its own normal, so pulling the end wall of a room
           cannot also slide it sideways and turn the rectangle into a
           parallelogram. */
        edge: { axis: handle.axis, ux: handle.ux, uz: handle.uz, room: S.sel.ref },
        limit: roomEdgeLimit(S.sel.ref, handle),
      };
      S.wallAngleGuide = null;
      render2D();
      return true;
    }
    /* The room is the LAST resort, after both passes rather than at the end of
       the structure block inside each one.

       A room is not a thing you aim at — it is the whole floor area, and every
       click that lands inside it hits it. Ranking it with the rest of structure
       therefore broke the two-pass rule it was supposed to serve: with the work
       set on structure (which is where the wall tool leaves it), a rank-0 room
       answered the click before pass 1 ever ran, so a sofa, a sink or a TV
       standing on that floor could not be selected at all — the press grabbed
       the room and dragged the whole plan, carrying the furniture along inside
       it. Precise targets on every layer now get both passes first, and the
       floor only answers when none of them did. */
    function runRoomPass() {
      var rank = layerRank("structure");
      if (rank !== 0 && rank !== 1) return false;
      var hk = hitRoom(px, pz);
      if (!hk) return false;
      var rm = roomByKey(hk);
      var roomSel = { kind: "room", ref: hk };
      /* On touch the floor is also where you put your finger to pan, and on a
         zoomed-in plan there is little else to grab: a drag that starts in a
         room nobody had selected used to carry the room (and its furniture)
         off instead. Touch now follows "select first, then drag" — the press
         still selects the room, but only a drag on the ALREADY selected room
         moves it; otherwise the finger pans. Mouse is unchanged. */
      var priorSel = e.pointerType === "touch" ? preTouchSel : S.sel;
      var wasSelected = !!priorSel && priorSel.kind === "room" && priorSel.ref === hk;
      select(roomSel);
      if (e.pointerType === "touch" && !wasSelected && !inputIs3D()) {
        S.action = "pan";
        S.panStart = { ox: S.OX, oy: S.OY, px: e.offsetX, py: e.offsetY };
        render2D();
        return true;
      }
      /* canDrag folds in all three of the old conditions — the work set,
         S.lockStruct, and the per-room padlock it reads out of S.roomMeta
         (a room selection's ref is a KEY, not an object). `rm` staying in
         the test is not redundant: a room key with no live polygon has no
         corners to move. */
      if (rm && canDrag(roomSel)) {
        S.action = "room";
        beginHistory();
        /* An attached room is broken off its neighbours first, so what travels
           is the room and nothing else. detachRoomSeam returns the corners the
           room now owns; a free-standing room has no seam and keeps its own. */
        // Selection alone must never detach shared walls. Wait for a real drag.
        var carry = rm.nidx;
        S.dragRoom = {
          key: hk,
          started: false,
          sx: px,
          sz: pz,
          orig: carry.map(function (i) {
            return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
          }),
          // items sitting inside the room travel with it (relative offset kept)
          items: itemsInRoom(rm).map(function (it) {
            return { it: it, x: it.x, z: it.z };
          }),
        };
      } else {
        S.action = null;
        if (rm) blockedDrag(roomSel);
      }
      render2D();
      return true;
    }
    /* One arming point for all three proxied gestures rather than one beside
       each `S.action = ` — the passes hand back true only after they have set
       S.action and filled the matching drag record, which is exactly when the
       proxy can read what it is lifting. */
    if (runRoomEdgePass()) return void armDragProxy();
    if (runSelectPass(0)) return void armDragProxy();
    if (runSelectPass(1)) return void armDragProxy();
    if (runRoomPass()) return void armDragProxy();
    // blank space: same "I'm done" gesture as Esc — drop the selection and
    // fall back to the select tool
    select(null);
    if (S.tool !== "select") setTool("select");
    S.action = inputIs3D() ? null : "pan";
    S.panStart = { ox: S.OX, oy: S.OY, px: e.offsetX, py: e.offsetY };
    render2D();
  }
  plan.addEventListener("pointerdown", function(e) { setPlannerInputView(null); pointerDown(e); });

  /* ---- edge auto-pan ----
     A gesture that reaches the border of the plan canvas — drawing a wall,
     dragging an item/corner/room/point/MEP run — scrolls the view that way
     instead of stopping dead, so the user never has to drop the gesture, pan,
     and pick it back up. The loop shifts the view and then replays the last
     pointer position through the normal move handler, so the dragged thing
     keeps tracking the cursor (which now sits over new world coordinates). */
  var AP_BAND = 44, // px of canvas edge that triggers the scroll
    AP_MAX = 11, // px per 60Hz frame at the border, once fully ramped up
    AP_RAMP = 550; // ms of easing from a crawl to full speed
  var apRAF = 0,
    apPtr = null,
    apT0 = 0, // when this scroll started, for the ramp
    apLast = 0; // previous frame stamp, so speed is time-based not frame-based
  // deflection into the edge band, eased: grazing the band barely moves, and
  // the speed only builds as the cursor pushes further out
  function apAxis(v, size) {
    var d = 0;
    if (v < AP_BAND) d = (v - AP_BAND) / AP_BAND;
    else if (v > size - AP_BAND) d = (v - (size - AP_BAND)) / AP_BAND;
    d = clamp(d, -1, 1);
    return Math.sign(d) * d * d * AP_MAX;
  }
  // is the current gesture one that should drag the view along with it?
  function apActive() {
    if (isElevation() || S.action === "pan" || S.action === "pinch") return false;
    if (S.tool === "wall" && S.drawing && S.drawFrom != null) return true;
    if (S.tool === "arcwall" && S.arcDraft) return true;
    if (S.tool === "mepRoute") {
      var mr = S.mep;
      if (mr && mr.route && mr.route.pts && mr.route.pts.length) return true;
    }
    return (
      S.action === "item" ||
      S.action === "node" ||
      S.action === "wall" ||
      S.action === "marker" ||
      S.action === "room" ||
      S.action === "mep"
    );
  }
  function apStep(now) {
    apRAF = 0;
    if (!apPtr || !apActive() || !(S.CW > 0 && S.CH > 0)) return;
    var dpx = apAxis(apPtr.x, S.CW),
      dpy = apAxis(apPtr.y, S.CH);
    if (!dpx && !dpy) return;
    // ease in over AP_RAMP ms so a momentary brush past the edge nudges the
    // view instead of throwing it, and scale by real elapsed time so the speed
    // doesn't depend on the frame rate
    var ramp = 0.25 + 0.75 * clamp((now - apT0) / AP_RAMP, 0, 1);
    var dt = clamp((now - apLast) / 16.7, 0.5, 2);
    apLast = now;
    dpx *= ramp * dt;
    dpy *= ramp * dt;
    // the shift is in screen space; the stored offset lives in the base frame
    var pa = -planRotRad();
    S.OX -= dpx * Math.cos(pa) - dpy * Math.sin(pa);
    S.OY -= dpx * Math.sin(pa) + dpy * Math.cos(pa);
    // replay the pointer so the drag/preview follows the scrolled view
    planMove({ offsetX: apPtr.x, offsetY: apPtr.y, pointerType: "mouse" });
    render2D();
    apRAF = requestAnimationFrame(apStep);
  }
  function autoPanFrom(e) {
    apPtr = { x: e.offsetX, y: e.offsetY };
    if (!apRAF && apActive() && (apAxis(apPtr.x, S.CW) || apAxis(apPtr.y, S.CH))) {
      // each time the cursor re-enters the band the ramp starts over
      apT0 = apLast = performance.now();
      apRAF = requestAnimationFrame(apStep);
    }
  }
  function stopAutoPan() {
    if (apRAF) cancelAnimationFrame(apRAF);
    apRAF = 0;
    apPtr = null;
  }

  /* The constraint pass that runs sixty times a second, as opposed to the one
     that runs when a gesture lands. Two differences, both deliberate:

       - it solves only the constraints reachable from the corners being
         dragged. Re-relaxing every dimension in the drawing on every mouse
         move is work whose result is thrown away a sixteenth of a second
         later, and on a large plan it is what makes a drag feel heavy.
       - Alt suppresses it entirely (S.conOverride), so a corner can be pulled
         somewhere a dimension forbids without first dismantling the dimension.
         The full solve at endAction still runs, so letting go snaps the plan
         back to what it says — the override is for the gesture, not a way to
         quietly leave the drawing contradicting itself. */
  function dragSolve(nodes) {
    if (S.conOverride) return { passes: 0, moved: 0, unresolved: 0 };
    return solveWallCons({
      nodes: (nodes || []).filter(function (n) { return n != null; }),
    });
  }

  /* Finish a corner that was dragged onto a wall: split the host where the
     corner has come to rest and merge the two into one shared joint. Called
     once, from the end of the gesture — see the note in the drag handler about
     why doing it per frame tore the host wall to pieces. Returns whichever
     corner index survives, which is the one the drag now owns. */
  function landNodeOnWall(ni, host, active) {
    var n = S.nodes[ni];
    if (!host || !n || host.a === ni || host.b === ni) return ni;
    var g = wallGeom(host),
      pr = wallProject(host, n.x, n.z);
    if (!pr || !fin(pr.s) || pr.s <= 1 || pr.s >= g.L - 1) return ni;
    var before = snapshotNodes(),
      mid = splitWallAt(host, pr.s);
    S.nodes[ni].x = S.nodes[mid].x;
    S.nodes[ni].z = S.nodes[mid].z;
    S.jointsReleased += enforceLocks(before, active);
    dragSolve([ni, mid]);
    if (!canWeld(mid, ni, active)) return ni;
    weldNodes(mid, ni);
    return mid;
  }

  var planMove = function (e) {
    if (isElevation()) {
      // items, openings and points are live in the two elevation axes
      if (S.action === "markerElev" && S.sel && S.sel.kind === "marker") {
        commitPending();
        var dp = elevDragTo(S.sel.ref, e.offsetX, e.offsetY);
        if (dp) {
          moveMarker(S.sel.ref, dp.x, dp.y, dp.z);
          touchItem3D(markerItem(S.sel.ref), "move");
          render2D();
        }
        return;
      }
      if (S.action === "itemElev" && S.sel && S.sel.kind === "item") {
        commitPending();
        if (S.sel.ref.on != null) stackDetach(S.sel.ref);
        elevDragItemTo(S.sel.ref, e.offsetX, e.offsetY, S.elevGrab);
        touchItem3D(S.sel.ref, "move");
        S.dirty3D = true;
        render2D();
        return;
      }
      if (S.action === "openingElev" && S.sel && S.sel.kind === "opening") {
        commitPending();
        elevDragOpeningTo(S.sel.ref, e.offsetX, e.offsetY, S.elevGrab);
        S.dirty3D = true;
        render2D();
        return;
      }
      if (S.tool === "point") {
        S.markerPreview = elevPick(e.offsetX, e.offsetY);
        render2D();
      }
      if (S.tool === "erase") {
        var ee = elevationHit(e.offsetX, e.offsetY);
        S.eraseHover = ee && ee.kind !== "room" ? ee : null;
        if (S.action === "erase" && S.eraseHover) strokeErase(S.eraseHover);
        render2D();
      }
      return;
    }
    if (e.pointerType === "touch" && touchPrecisionTrialOwns(e.pointerId)) {
      updateTouchPrecisionTrial(e.pointerId, e.offsetX, e.offsetY);
      return;
    }
    if (e.pointerType === "touch" && pointers[e.pointerId])
      pointers[e.pointerId] = { x: e.offsetX, y: e.offsetY };
    /* Hold Alt to drag WITHOUT the dimension solver pulling back. Every
       constraint system needs this escape hatch: when the drawing fights you,
       suppressing one gesture has to be cheaper than finding and suppressing
       the constraint, and far cheaper than deleting it and authoring it again.
       Read per move rather than latched at pointerdown, so the key can be
       taken and released mid-drag. */
    S.conOverride = !!(e && e.altKey);
    trackLongPress(e);
    if (S.action === "pinch") {
      updatePinch();
      return;
    }
    var moveRect = inputBounds(plan);
    var movePoint = planPrecisionPoint(e, e.offsetX, e.offsetY, moveRect, false);
    var px = wx(movePoint.x, movePoint.y),
      pz = wz(movePoint.x, movePoint.y);
    sendPlanCursor(px, pz);
    /* "How far along this wall am I?" — answered for EVERY gesture, before any
       of the per-action branches return: hovering, dragging a piece, or drawing
       the next wall. It is the question you are asking whenever the cursor is
       over a wall, and it used to need a measure-tool detour. */
    updateWallProbe(px, pz);
    if (S.tool === "wall") {
      /* The four-way overlay and snap mark follow the cursor from the moment
         the tool is armed — not only after the first click — so you can read
         distances to walls and objects before placing the start corner. */
      if (S.drawing && S.drawFrom != null) {
        /* Once a dimension is being typed the keyboard owns the endpoint: a
           nudge of the mouse must not silently overwrite the number just
           entered. Same rule as every CAD's dynamic input. */
        if (entryOpen()) return;
        var p = snapWallPoint(px, pz, S.drawFrom);
        S.previewPt = { x: p.x, z: p.z };
        render2D();
        return;
      }
      var p0 = snapPoint(px, pz, null);
      S.previewPt = fin(p0.x) && fin(p0.z) ? { x: p0.x, z: p0.z } : null;
      render2D();
      return;
    }
    if (S.tool === "walloffset") {
      if (S.offsetDraft && S.offsetDraft.hostId != null) {
        var oh = wallById(S.offsetDraft.hostId);
        if (oh) {
          S.offsetDraft.side = offsetSideFromCursor(oh, px, pz);
          S.previewPt = { x: px, z: pz };
        }
      } else {
        S.previewPt = { x: px, z: pz };
      }
      render2D();
      return;
    }
    if (S.action === "wallbite" && S.biteDraft) {
      var bWall = wallById(S.biteDraft.wall);
      var bProj = bWall && wallProject(bWall, px, pz);
      if (bProj) S.biteDraft.s1 = clamp(bProj.s, 0, wallGeom(bWall).L);
      render2D();
      return;
    }
    if (S.tool === "wallbreak" || S.tool === "walljoin" || S.tool === "wallreverse" || S.tool === "wallpaint" || S.tool === "wallbite") {
      S.previewPt = { x: px, z: pz };
      render2D();
      return;
    }
    if (S.tool === "erase") {
      S.eraseHover = pickErase(px, pz, e.offsetX, e.offsetY);
      if (S.action === "erase" && S.eraseHover) strokeErase(S.eraseHover);
      render2D();
      return;
    }
    if (S.tool === "arcwall") {
      var ap = snapPoint(px, pz, null);
      S.previewPt = fin(ap.x) && fin(ap.z) ? { x: ap.x, z: ap.z } : null;
      render2D();
      return;
    }
    if (S.tool === "rect" || S.tool === "slabvoid") {
      var rrp = snapPoint(px, pz, null);
      S.previewPt = fin(rrp.x) && fin(rrp.z) ? { x: rrp.x, z: rrp.z } : null;
      render2D();
      return;
    }
    if (S.tool === "roomstamp") {
      S.previewPt = fin(px) && fin(pz) ? { x: px, z: pz } : null;
      updateRoomGhost(px, pz);
      render2D();
      return;
    }
    if (S.placeType && (!S.tool || S.tool === "select")) {
      var plp = snapPoint(px, pz, null);
      S.previewPt = { x: plp.x, z: plp.z };
      render2D();
      return;
    }
    if (S.tool === "door" || S.tool === "window" || S.tool === "passage") {
      render2D(); // refresh the direct-touch lens while sliding along its host
      return;
    }
    // placeholder-point tool: ghost the snapped landing spot (snapPoint also
    // fills S.snapGuides, so the alignment run to a corner is visible too)
    if (S.tool === "point") {
      var pp = snapPoint(px, pz, null);
      S.markerPreview = fin(pp.x) && fin(pp.z) ? planPickSurface(pp, px, pz) : null;
      render2D();
      return;
    }
    // MEP route rubber-band + CAD angle readout
    if (S.tool === "mepRoute") {
      var mr = ensureMEP();
      if (mr.route && mr.route.pts.length) {
        var last = mr.route.pts[mr.route.pts.length - 1];
        var res = routeResolve(last, px, pz);
        // delta angle vs. the previous committed segment
        if (mr.route.pts.length >= 2) {
          var pv = mr.route.pts[mr.route.pts.length - 2];
          var pang = Math.atan2(last.z - pv.z, last.x - pv.x);
          var da = Math.abs(((res.ang - pang) * 180) / Math.PI);
          da = da % 360; if (da > 180) da = 360 - da;
          res.dAng = Math.round(da);
        }
        // in wall-follow mode show the path that will actually be committed,
        // recomputed only when the resolved end has really moved
        if (mr.wallRoute) {
          var pk = Math.round(res.x) + "," + Math.round(res.z);
          if (mr.route._pk !== pk) {
            mr.route._pk = pk;
            mr.route.previewPath = wallPath(last, res, mr.layer);
            mr.route.previewBlocked = !mr.route.previewPath;
          }
        } else { mr.route.previewPath = null; mr.route.previewBlocked = false; }
        mr.route.preview = res;
        render2D();
      }
      return;
    }
    // MEP drag (node / vertex / whole run)
    if (S.action === "mep" && S.mepDrag) {
      commitPending();
      dragMEP(px, pz);
      S.dirty3D = true;
      render2D();
      return;
    }
    // always-on distance overlay: track the cursor + the item under it while
    // idle on the select tool (over empty floor it measures from the point).
    if (!S.action && S.tool === "select") {
      /* Hover follows the FOCUSED layers only — rank 0, not merely "hittable".
         Rank 1 stays clickable on purpose, but hover is the readout that runs
         with no click at all, and a hover card that keeps inspecting the wall
         while you are aiming at the TV in front of it re-creates exactly the
         problem the two-pass pick chain removes. So each band below asks for
         rank 0 rather than reusing the hit test's Infinity gate. */
      var focus = {
        structure: layerRank("structure") === 0,
        furniture: layerRank("furniture") === 0,
        annotations: layerRank("annotations") === 0,
      };
      S.hoverItem = focus.furniture ? hitItem(px, pz) : null;
      S.hoverPt = { x: px, z: pz };
      // a point under the cursor reads itself out without being selected —
      // same precedence as the click path, where a point wins over the piece
      // standing on it
      S.hoverMarker = focus.annotations ? hitMarker(px, pz, inputScale()) : null;
      // ...and a corner under it reads out the same way, so "what meets here,
      // at what angle" is answerable without clicking anything
      S.hoverNode = focus.structure && S.hoverMarker == null ? hitNode(px, pz) : null;
      // Constraint labels are real pick targets, so hovering one must reveal
      // the same relation that a click would select (and the same row in the
      // side panel). Screen coordinates are used because pickCon records the
      // exact boxes rendered by the canvas.
      var hoverCon = focus.annotations ? pickCon(e.offsetX, e.offsetY) : null;
      setConstraintHover(hoverCon);
      plan.style.cursor = hoverCon ? "pointer" : "default";
      // hovering the selected wall highlights the half you'd be resizing
      S.wallHoverHalf =
        focus.structure && S.sel && S.sel.kind === "wall" && hitWall(px, pz) === S.sel.ref
          ? wallHalfAt(S.sel.ref, px, pz)
          : null;
      /* Passing over a glowing corner lights up its row in the warning list —
         and hovering that row lights up the corner. Same field, both ways
         round, so the plan and the list are never telling different stories. */
      var hoverWarn = focus.annotations ? hitWarning(px, pz, tolCm(14)) : null;
      var hk = hoverWarn ? hoverWarn.key : null;
      if (hk !== S.warnHover) {
        S.warnHover = hk;
        syncWarnHighlight();
      }
      render2D();
      return;
    }
    if (!S.action) return;
    if (S.action === "pan") {
      // a screen-space drag maps to a base-frame shift rotated by −planRot
      var pa = -planRotRad();
      var dpx = e.offsetX - S.panStart.px, dpy = e.offsetY - S.panStart.py;
      S.OX = S.panStart.ox + dpx * Math.cos(pa) - dpy * Math.sin(pa);
      S.OY = S.panStart.oy + dpx * Math.sin(pa) + dpy * Math.cos(pa);
      render2D();
      return;
    }
    // dragging a placeholder point: same drafting snap as placing it, and the
    // object standing on it comes along (moveMarker carries it)
    if (S.action === "marker" && S.sel && S.sel.kind === "marker") {
      commitPending();
      var mps = snapPoint(px - S.dragOff.x, pz - S.dragOff.z, null);
      // the plan edits x/z only — a point's height belongs to the elevations
      moveMarker(S.sel.ref, mps.x, S.sel.ref.y, mps.z);
      touchItem3D(markerItem(S.sel.ref), "move");
      render2D();
      return;
    }
    if (S.action === "slabvoid" && S.sel && S.sel.kind === "slabvoid") {
      commitPending();
      var snapped = snapPoint(px - S.dragOff.x, pz - S.dragOff.z, null);
      S.sel.ref.x = snapped.x;
      S.sel.ref.z = snapped.z;
      S.dirty3D = true;
      render2D();
      return;
    }
    if (S.action === "item" && S.sel && (S.sel.kind === "item" || S.sel.kind === "items")) {
      commitPending();
      /* Alt suspends the automatic facing for THIS drag only (endAction clears
         it). The angle a piece was given by hand is otherwise remembered for
         good, which is too big a commitment for "just this once". */
      S.orientHold = !!e.altKey;
      if (S.sel.kind === "items") {
        var tarX = Math.round((px - S.dragOff.x) / 2) * 2;
        var tarZ = Math.round((pz - S.dragOff.z) / 2) * 2;
        var cx = 0, cz = 0;
        S.dragOrig.forEach(function(o) { cx += o.x; cz += o.z; });
        cx /= S.dragOrig.length; cz /= S.dragOrig.length;
        var mdx = tarX - cx, mdz = tarZ - cz;
        // pieces standing on a dragged piece travel with it — but only once, so
        // a selection holding both a table and the lamp on it stays put
        var movedSet = new Set();
        S.dragOrig.forEach(function(o) { movedSet.add(o.it); });
        var frameMoves = S.dragOrig.map(function(o) {
          return { entry: o, dx: o.x + mdx - o.it.x, dz: o.z + mdz - o.it.z };
        });
        frameMoves.forEach(function(move) {
           var o = move.entry;
           o.it.x += move.dx;
           o.it.z += move.dz;
           touchItem3D(o.it, "move");
        });
        frameMoves.forEach(function (move) {
          carryChildren(move.entry.it, move.dx, move.dz, movedSet).forEach(function (c) {
            touchItem3D(c, "move");
          });
        });
        S.dragOrig.forEach(function (o) { refreshSupport(o.it); });
      } else {
        moveItemTo(S.sel.ref, px - S.dragOff.x, pz - S.dragOff.z);
      }
      // nothing but the piece's own transform moved — a whole-scene rebuild per
      // pointermove is what made dragging feel like it lagged a second behind
      render2D();
      return;
    }
    if (S.action === "node" && S.nodeDrag) {
      commitPending();
      var ni = S.nodeDrag.node;
      if (!S.nodes[ni]) return;
      /* Which walls this gesture is allowed to reshape. Grabbing the end of the
         wall you already had selected edits THAT wall — everything else meeting
         the corner keeps its locked length and angle and lets go of the joint.
         Grabbing a bare corner is a direct move of the joint itself, so all of
         its walls follow it (and re-record their measurements when it lands). */
      var active = [];
      S.walls.forEach(function (w) {
        if (w.a !== ni && w.b !== ni) return;
        if (!S.nodeDrag.wall || S.nodeDrag.wall === w.id) active.push(w.id);
      });
      // Every wall meeting this corner is a valid angle reference, plus the
      // corner itself so it can't snap onto its own position. Using only the
      // first neighbour (as this did) let one edge of a rectangle stay square
      // while the other drifted off-angle.
      var connected = [ni];
      S.walls.forEach(function (w) {
        if (w.a === ni) connected.push(w.b);
        if (w.b === ni) connected.push(w.a);
      });
      var before = snapshotNodes();
      // same rule as the wall tool: dropped near a wall's own corner, it IS
      // that corner — splitting there would leave a stub with no length
      var p = resolveLanding(snapPoint(px, pz, connected));
      if (p.walls && p.walls.length) {
        var crossing = splitIntersectionWalls(p);
        if (crossing != null) p = { x: p.x, z: p.z, node: crossing, wall: null };
      }
      if (p.node != null) {
        S.nodeDrag.landOn = null; // a corner-to-corner weld is not a wall landing
        S.nodes[ni].x = S.nodes[p.node].x;
        S.nodes[ni].z = S.nodes[p.node].z;
        S.jointsReleased += enforceLocks(before, active);
        dragSolve([ni, p.node]);
        auditDragProxy(before);
        // coincident is not connected — merge, or the shape only LOOKS closed.
        // The walls being dragged may change shape to make the joint; anything
        // else at that corner may not, and enforceLocks has already given those
        // their own corner back, so this weld can only touch the dragged ones.
        if (canWeld(p.node, ni, active)) {
          weldNodes(p.node, ni);
          // a weld renumbers S.nodes, and the proxy's corner list is indices —
          // there is nothing to remap it to, so the gesture finishes unproxied
          dropDragProxy();
          ni = p.node;
          if (!S.nodeDrag.wall) select({ kind: "node", ref: ni });
          S.nodeDrag.node = ni;
        }
      } else if (p.wall) {
        /* Dropping a corner onto a wall joins it there — but that join is a
           topology commit (a split AND a weld), and doing it on every
           pointermove shredded the host. Each frame split what was left of it
           again: dragging one corner of a room along the wall next to it left a
           chain of stubs, a pile of coincident corners and a shape that no
           longer closed. Preview it as a plain move, remember the host, and
           commit once when the gesture ends. */
        S.nodes[ni].x = p.x;
        S.nodes[ni].z = p.z;
        S.nodeDrag.landOn = p.wall.id;
        S.jointsReleased += enforceLocks(before, active);
        dragSolve([ni]);
        auditDragProxy(before);
      } else {
        S.nodes[ni].x = p.x;
        S.nodes[ni].z = p.z;
        S.nodeDrag.landOn = null;
        S.jointsReleased += enforceLocks(before, active);
        dragSolve([ni]);
        auditDragProxy(before);
      }
      S.dirty3D = true;
      fillProps();
      render2D();
      return;
    }
    /* Whole-wall translation. Both corners move by the same vector, so the
       wall itself is not being re-dimensioned — only whatever else hangs off
       those corners is. Alignment works like the room drag: the pair of
       corners snaps to any other corner they line up with, so a wall slid
       across the plan still lands square with the rest of it. */
    if (S.action === "wall" && S.wallDrag) {
      commitPending();
      var wd = S.wallDrag;
      var wdx = Math.round((px - wd.sx) / SNAP_GRID) * SNAP_GRID,
        wdz = Math.round((pz - wd.sz) / SNAP_GRID) * SNAP_GRID,
        WTHR = 12 / inputScale();
      // A side handle has one degree of freedom. Remove off-axis pointer
      // motion before angle snapping, otherwise symmetry can turn it into an
      // unwanted change of the room's width or depth.
      if (wd.edge) { if (wd.edge.axis === "x") wdz = 0; else wdx = 0; }
      var mine = {};
      wd.orig.forEach(function (o) {
        mine[o.i] = 1;
      });
      var oxs = [],
        ozs = [],
        used = usedNodes();
      for (var uk in used) {
        if (mine[uk]) continue;
        oxs.push(S.nodes[uk].x);
        ozs.push(S.nodes[uk].z);
      }
      var wxs = wd.orig.map(function (o) {
          return o.x + wdx;
        }),
        wzs = wd.orig.map(function (o) {
          return o.z + wdz;
        });
      var wax = snapAdj(
        [Math.min.apply(null, wxs), Math.max.apply(null, wxs)],
        oxs,
        WTHR,
      );
      var waz = snapAdj(
        [Math.min.apply(null, wzs), Math.max.apply(null, wzs)],
        ozs,
        WTHR,
      );
      var moveX = wdx + wax,
        moveZ = wdz + waz,
        base = {
          a: { x: wd.orig[0].x, z: wd.orig[0].z },
          b: { x: wd.orig[1].x, z: wd.orig[1].z },
        },
        symmetryOn =
          S.osnap !== false &&
          (!S.snapKinds || S.snapKinds.symmetry !== false),
        equal = symmetryOn
          ? equalWallAngleTranslation(wd.wall, base, moveX, moveZ)
          : null,
        strength = fin(S.snapStrength) ? S.snapStrength : 1,
        catchDist = (8 * strength) / inputScale(),
        previewDist = (28 * strength) / inputScale();
      S.wallAngleGuide = null;
      if (equal && equal.correction <= previewDist) {
        var caught = equal.correction <= catchDist;
        S.wallAngleGuide = {
          wall: wd.wall,
          pair: equal.pair,
          angleA: caught ? equal.angle : equal.rawA,
          angleB: caught ? equal.angle : equal.rawB,
          correctionX: equal.correctionX,
          correctionZ: equal.correctionZ,
          snapped: caught,
        };
        if (caught) {
          moveX = equal.dx;
          moveZ = equal.dz;
        }
      }
      /* A room-edge drag is the same move with two rules on it: the side may
         only travel along its own normal, and it may not be pushed so far in
         that the room stops being one. Applied here rather than at the start
         so the grid quantisation and the equal-angle snap above still get
         their say about how far along that normal it lands. */
      if (wd.edge) {
        if (wd.edge.axis === "x") moveZ = 0; else moveX = 0;
        var lim = wd.limit;
        if (lim) {
          var from = wd.edge.axis === "x" ? wd.orig[0].x : wd.orig[0].z;
          var to = from + (wd.edge.axis === "x" ? moveX : moveZ);
          if (lim.sign * (to - lim.opposite) < lim.minSpan) {
            to = lim.opposite + lim.sign * lim.minSpan;
            if (wd.edge.axis === "x") moveX = to - from; else moveZ = to - from;
          }
        }
      }
      var beforeWall = snapshotNodes();
      wd.orig.forEach(function (o) {
        S.nodes[o.i].x = o.x + moveX;
        S.nodes[o.i].z = o.z + moveZ;
      });
      /* Every wall meeting either corner is part of this edit and may change
         shape — the same rule as grabbing a bare corner, applied to both of a
         wall's corners at once. Handing enforceLocks an empty active list (as
         a room drag does) would be wrong here: a room drag tears loose only
         the walls that BRIDGE it to something else, but every neighbour of a
         single wall is such a bridge, so the wall would leave the plan open
         behind it on every drag. */
      var wact = S.walls
        .filter(function (w) {
          return mine[w.a] || mine[w.b];
        })
        .map(function (w) {
          return w.id;
        });
      S.jointsReleased += enforceLocks(beforeWall, wact);
      dragSolve(Object.keys(mine).map(Number));
      auditDragProxy(beforeWall);
      S.dirty3D = true;
      render2D();
      return;
    }
    if (S.action === "opening" && S.sel && S.sel.kind === "opening") {
      commitPending();
      var o = S.sel.ref,
        w = wallById(o.wall),
        gm = wallGeom(w);
      var s = (px - gm.a.x) * gm.ux + (pz - gm.a.z) * gm.uz - S.dragOff.s;
      o.s = clamp(s, o.width / 2, gm.L - o.width / 2);
      S.dirty3D = true;
      render2D();
      return;
    }
    if (S.action === "room" && S.dragRoom) {
      if (!S.dragRoom.started) {
        if (Math.hypot(px - S.dragRoom.sx, pz - S.dragRoom.sz) * inputScale() < 3) return;
        commitPending();
        var carry = detachRoomSeam(S, S.dragRoom.key, detectRooms());
        if (carry) S.dragRoom.orig = carry.map(function (i) {
          return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
        });
        S.dragRoom.started = true;
      }
      commitPending();
      var dx = Math.round((px - S.dragRoom.sx) / SNAP_GRID) * SNAP_GRID,
        dz = Math.round((pz - S.dragRoom.sz) / SNAP_GRID) * SNAP_GRID,
        THR = 12 / inputScale();
      var inR = {};
      S.dragRoom.orig.forEach(function (o) {
        inR[o.i] = 1;
      });
      var ox = [],
        oz = [],
        u = usedNodes();
      for (var k in u) {
        if (inR[k]) continue;
        ox.push(S.nodes[k].x);
        oz.push(S.nodes[k].z);
      }
      var xs = S.dragRoom.orig.map(function (o) {
          return o.x + dx;
        }),
        zs = S.dragRoom.orig.map(function (o) {
          return o.z + dz;
        });
      var ax = snapAdj(
        [Math.min.apply(null, xs), Math.max.apply(null, xs)],
        ox,
        THR,
      );
      var az = snapAdj(
        [Math.min.apply(null, zs), Math.max.apply(null, zs)],
        oz,
        THR,
      );
      /* The same magnet the preset tool places rooms with.
       *
         snapAdj above lines the room's bounding box up with other CORNERS, so
         it only helps when something already sits at that exact coordinate.
         Pushing a room against the side of a longer wall — the "drag them
         together until they share a wall" gesture this whole feature is for —
         matched nothing, and the room came to rest two or three centimetres
         off. Two or three centimetres is worse than either touching or being
         clearly apart: the drop's weld tolerance is 2 cm, so it looks joined
         and is not.

         So the dock solver gets first refusal, exactly as it does while
         stamping, and only falls back to the corner alignment. Its own walls
         are excluded, or the room would dock against itself.

         A corridor answer is allowed here too, and drawn while the drag is
         still live: hold a room roughly a corridor's width off a wall and the
         hallway that would be built appears in the gap, outlined, before
         anything is committed. That preview is the whole licence for the mode
         — a room springing into existence on release that the user was never
         shown would be the app inventing geometry. */
      var roomRect = {
        x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
        z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs),
      };
      var roomDock = solveDock(S, roomRect, {
        snap: 40 * (fin(S.snapStrength) ? S.snapStrength : 1),
        skipWalls: roomOwnWalls(S.dragRoom),
      });
      if (roomDock) { ax = roomDock.dx; az = roomDock.dz; }
      S.dragRoom.dock = roomDock;
      /* The gap is measured from where the room is ABOUT to be, not where the
         pointer left it — the snap above is part of the proposal. */
      S.dragRoom.corridor = roomDock && roomDock.mode === "corridor"
        ? corridorRect(translateRect(roomRect, roomDock.dx, roomDock.dz), roomDock)
        : null;
      var beforeRoom = snapshotNodes();
      S.dragRoom.orig.forEach(function (o) {
        S.nodes[o.i].x = o.x + dx + ax;
        S.nodes[o.i].z = o.z + dz + az;
      });
      /* The room's own walls travel rigidly, so none of their dimensions change
         and enforceLocks leaves them alone. A wall that BRIDGES this room and
         something else does get stretched — that one lets go instead, which is
         the whole rule: the room moves, the corridor wall keeps its length. */
      S.jointsReleased += enforceLocks(beforeRoom, []);
      solveWallCons();
      if (S.dragRoom.items)
        S.dragRoom.items.forEach(function (o) {
          o.it.x = o.x + dx + ax;
          o.it.z = o.z + dz + az;
        });
      S.dirty3D = true;
      render2D();
      return;
    }
  };
  // Movement cancels the long press on the RAW event, not the throttled one:
  // a fast flick can cross the slop and be back before planMove next runs.
  plan.addEventListener("pointermove", trackLongPress);
  const throttledPlanMove=throttle(function (e) {
    setPlannerInputView(null);
    autoPanFrom(e);
    planMove(e);
  });
  plan.addEventListener('pointermove',e=>{
    // offsetX/offsetY are target-relative only during event dispatch. Capture
    // the canvas coordinates before deferring work to the animation frame.
    const r=plan.getBoundingClientRect();
    throttledPlanMove({type:e.type,clientX:e.clientX,clientY:e.clientY,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,
      pointerId:e.pointerId,pointerType:e.pointerType,button:e.button,buttons:e.buttons,altKey:e.altKey,shiftKey:e.shiftKey,
      ctrlKey:e.ctrlKey,metaKey:e.metaKey,timeStamp:e.timeStamp,target:e.target,isTrusted:e.isTrusted,
      preventDefault:()=>{},stopPropagation:()=>{}});
  });

  function endAction(e) {
    try {
    if (e?.type === "pointercancel") {
      const active = S.action;
      cancelLongPress(); stopAutoPan(); dropDragProxy(); endSnapSession();
      S.wallPress = null;
      disarmHistoryGesture();
      if (active && active !== "pan" && gestureSession) restoreHistorySession(gestureSession);
      gestureSession = null;
      S.action = null; S.drag = null; S.dragRoom = null; S.touchContact = null;
      render2D(); return;
    }
    cancelLongPress();
    // Every pointerup and pointercancel lands here, so this is the one place a
    // gesture is guaranteed to be over. It has to run before the settle solve
    // below moves the rest of the drawing, and it forces the full model paint
    // that puts the dragged object back onto the document image.
    dropDragProxy();
    endSnapSession();
    stopAutoPan();
    if (e && touchPrecisionTrialOwns(e.pointerId)) {
      releaseTouchPrecisionTrial(e.pointerId, e.type === "pointercancel");
      S.touchDrag = false;
      S.touchContact = null;
      delete pointers[e.pointerId];
      render2D();
      return;
    }
    if (touchHostPlacement && (!e || e.pointerId === touchHostPlacement.pointerId)) {
      var pendingHost = touchHostPlacement;
      touchHostPlacement = null;
      if (e && e.type === "pointerup") {
        var hostRect = inputBounds(plan);
        var hostX = e.clientX - hostRect.left, hostY = e.clientY - hostRect.top;
        var hostPoint = planPrecisionPoint(e, hostX, hostY, hostRect, false);
        var hostPx = wx(hostPoint.x, hostPoint.y), hostPz = wz(hostPoint.x, hostPoint.y);
        if (pendingHost.placeType && S.placeType === pendingHost.placeType)
          placeFurnAt(pendingHost.placeType, hostPx, hostPz);
        else if (S.tool === pendingHost.tool)
          placeOpeningAt(pendingHost.tool, hostPx, hostPz);
      }
    }
    /* A first wall may be drawn in one press-drag-release gesture. Keep a
       click (or tiny hand jitter) as the first half of click-click placement;
       only a deliberate drag commits here. Do this before clearing the one-shot
       snap override so the release resolves exactly like a normal wall click. */
    if (S.wallPress && (!e || e.pointerId === S.wallPress.pointerId)) {
      var wp = S.wallPress;
      S.wallPress = null;
      if (e && e.type === "pointerup" && S.tool === "wall" && S.drawing) {
        var wr = inputBounds(plan),
          wox = e.clientX - wr.left,
          woy = e.clientY - wr.top;
        var releasePoint = planPrecisionPoint(e, wox, woy, wr, false);
        if (Math.hypot(wox - wp.x, woy - wp.y) > 5)
          {
            wallPoint(snapWallPoint(wx(releasePoint.x, releasePoint.y), wz(releasePoint.x, releasePoint.y), S.drawFrom));
            /* A drag is Chief Architect's normal one-wall gesture: release
               commits that wall and ends its rubber band. The Wall tool stays
               armed, so the next wall starts with another independent drag.
               A stationary click deliberately keeps the precision click-click
               path available for typed length/angle entry. */
            finishDraw();
          }
      }
    }
    // the next drag starts with a clean slate, so re-snapping to the same wall
    // flashes again rather than staying silent
    S.snapFlashKey = null;
    /* Both snap overrides are per-gesture on purpose. A forced kind or a
       cycled alternative fixes THIS click; carrying either into the next one
       reproduces the problem it was invented to solve, where a momentary fix
       silently becomes a persistent setting. */
    S.snapOnly = null;
    S.snapCycle = 0;
    if (e && e.pointerType === "touch") {
      S.touchDrag = false;
      S.touchContact = null;
      delete pointers[e.pointerId];
      // Both fingers gone, nothing zoomed: that was the undo gesture.
      if (!Object.keys(pointers).length && tryTwoTap()) return;
    }
    /* Settle the topology BEFORE anything reads it. A dropped room has walls
       to weld and duplicates to merge, and the corridor pass below works off
       "which walls does this room have" — asked too early, it answered with
       the pre-drop pair of overlapping walls and cut a passage through each of
       them. Re-homing runs here too, so the corridor pass looks the room up by
       a key that still exists. */
    if (S.action === "room" && S.dragRoom && !S.dragRoom.started) {
      cancelPending(); S.action = null; S.dragRoom = null;
      render2D(); return;
    }
    if (S.action === "room" && S.dragRoom) {
      S.dragRoom.items.forEach(function (o) { releaseIfMoved(o.it); });
      var draggedKey = S.sel && S.sel.kind === "room" ? S.sel.ref : null;
      var fusedWalls = fuseDroppedRoom(S.dragRoom);
      rehomeDraggedRoom(S.dragRoom, draggedKey);
      connectFusedWalls(fusedWalls);
      buildDragCorridor(S.dragRoom);
    }
    if (S.action === "room" && S.sel && S.sel.kind === "room") {
      var rKey = S.sel.ref;
      var rMeta = S.roomMeta[rKey];
      /* A room stamped from a preset brings its own answer to "how do these
         two spaces connect" (js/room_presets.js), and the drop has already
         acted on it. This pass is the older, geometric one — every collinear
         overlap becomes a full-width opening, paired through `overlapL` — and
         it is what a corridor drawn by hand still wants. Running both gave the
         stamped corridor an opening as wide as the whole wall AND pairing
         metadata nobody asked for. */
      if (rMeta && rMeta.isCorridor && !rMeta.preset) {
        var wids = rKey.split(",");
        var corridorWalls = S.walls.filter(function(w) { return wids.indexOf(String(w.id)) > -1; });
        var otherWalls = S.walls.filter(function(w) { return wids.indexOf(String(w.id)) === -1; });
        var newOpenings = [];

        corridorWalls.forEach(function(cw) {
          var cg = wallGeom(cw);
          otherWalls.forEach(function(ow) {
            var og = wallGeom(ow);
            var dot = cg.ux * og.ux + cg.uz * og.uz;
            if (Math.abs(dot) > 0.999) {
              if (distSeg(cg.a.x, cg.a.z, og.a.x, og.a.z, og.b.x, og.b.z) < (cw.thickness + ow.thickness) / 2 + 6) {
                var ta = (og.a.x - cg.a.x) * cg.ux + (og.a.z - cg.a.z) * cg.uz;
                var tb = (og.b.x - cg.a.x) * cg.ux + (og.b.z - cg.a.z) * cg.uz;
                var tmin = Math.max(0, Math.min(ta, tb));
                var tmax = Math.min(cg.L, Math.max(ta, tb));
                var overlap = tmax - tmin;
                if (overlap > 40) {
                  var s = tmin + overlap / 2;
                  var width = overlap;
                  var Px = cg.a.x + cg.ux * s, Pz = cg.a.z + cg.uz * s;
                  S.walls.forEach(function(x) {
                    var g = wallGeom(x);
                    if (distSeg(Px, Pz, g.a.x, g.a.z, g.b.x, g.b.z) < x.thickness / 2 + 6) {
                      var ss = (Px - g.a.x) * g.ux + (Pz - g.a.z) * g.uz;
                      /* Anything already occupying that stretch of wall — not
                         just an opening whose CENTRE is within 20 cm. A door
                         cut by the drop's own fuse pass a moment earlier sits
                         at whatever station the wall had room for, so the old
                         centre test happily added a second opening beside it. */
                      var exists = S.openings.some(function(op) {
                        return op.wall === x.id
                          && op.s + op.width / 2 > ss - width / 2
                          && op.s - op.width / 2 < ss + width / 2;
                      });
                      if (!exists) {
                        /* Corridor inference is still a model creation path.
                           Route it through the same validated command as the
                           pointer, elevation and agent entry points; the room
                           drag already owns the surrounding history gesture. */
                        var corridorResult = executeCommand(openingPlaceCommand, {
                          wallId: x.id,
                          type: "passage",
                          s: ss,
                          width: width,
                          height: x.height,
                          sill: 0,
                        }, agentCommandEnvironment(), { history: false });
                        if (corridorResult.ok && corridorResult.created.length) {
                          var createdId = corridorResult.created[0].id;
                          var o = S.openings.find(function(op) { return op.id === createdId; });
                          if (o) {
                            o.overlapL = overlap;
                            o.overlapCenter = o.s;
                            newOpenings.push(o);
                          }
                        }
                      }
                    }
                  });
                }
              }
            }
          });
        });

        if (newOpenings.length > 0) {
          var oids = newOpenings.map(function(o) { return o.id; });
          newOpenings.forEach(function(o) { o.paired = oids; });
          rMeta.autoOpenings = oids;
          flash(t("Auto-created opening. Check right panel to manage."));
          S.dirty3D = true;
          render2D();
          fillProps();
        }
      }
    }

    if (S.action === "wallbite") commitWallBite();
    if (S.action === "mep") {
      fillProps(); // refresh readouts (length, position) after a drag
      refreshTree(); // connectivity flags may have changed
    }
    // An object dragged clear of the point it was standing on frees that point.
    // Room drags carry their contents, so those count too.
    if (S.action === "item" && S.sel) {
      /* A piece dropped flush against a wall is held to it from now on. Only
         when the flush snap actually engaged during THIS drag — inferring it
         from the final position alone would grab pieces that merely happen to
         end up near a wall, which is most of them in a small room. */
      var heldWall = S.itemSnapWall != null && wallById(S.itemSnapWall);
      if (S.sel.kind === "item") finalizeItemPlacement(S.sel.ref, {
        releaseMarker: true, holdWallId: heldWall && heldWall.id,
      });
      else if (S.sel.kind === "items") S.sel.refs.forEach(function(item) {
        finalizeItemPlacement(item, { releaseMarker: true });
      });
      S.itemSnapWall = null;
      S.orientHold = false; // Alt was for that gesture, not for the session
      /* The drag may have turned the piece for you (js/item_orient.js), so the
         inspector's rotation has to be re-read — a number that disagrees with
         the plan is worse than no number. */
      fillProps();
    }
    /* A side pushed up against the neighbouring room has to JOIN it, exactly
       as a whole dragged room does — otherwise resizing a room until it
       touches its neighbour leaves two walls in the same place and a sliver of
       nothing between them. Same repair, same code. */
    if (S.action === "wall" && S.wallDrag && S.wallDrag.edge) {
      var edgeKey = S.wallDrag.edge.room;
      var edgeFused = fuseDroppedRoom(S.wallDrag);
      rehomeDraggedRoom(S.wallDrag, edgeKey);
      connectFusedWalls(edgeFused);
    }
    /* A corner drag is a deliberate re-dimensioning of the walls it moved, so
       those walls now HOLD what the user just drew — otherwise the very next
       edit elsewhere would snap them back to their pre-drag size. */
    if (S.action === "node" && S.nodeDrag) {
      // the corner was left resting on a wall: make that a real joint, once
      if (S.nodeDrag.landOn != null) {
        var host = wallById(S.nodeDrag.landOn),
          hn = S.nodeDrag.node,
          hostActive = [];
        S.walls.forEach(function (w) {
          if (w.a !== hn && w.b !== hn) return;
          if (!S.nodeDrag.wall || S.nodeDrag.wall === w.id) hostActive.push(w.id);
        });
        var landed = landNodeOnWall(hn, host, hostActive);
        S.nodeDrag.node = landed;
        S.nodeDrag.landOn = null;
        if (!S.nodeDrag.wall) select({ kind: "node", ref: landed });
      }
      var dn = S.nodeDrag.node;
      S.walls.forEach(function (w) {
        if (w.a !== dn && w.b !== dn) return;
        if (!S.nodeDrag.wall || S.nodeDrag.wall === w.id) {
          captureLock(w);
          captureClear(w); // ...including the interior span it now reads
        }
      });
      fillProps(); // the inspector's "held at" readout is one of these numbers
    }
    /* Same rule one step out for a wall that was dragged bodily: the walls it
       stretched on the way now hold what the user just drew, and so does the
       wall itself (its own numbers did not change, but re-reading them costs
       nothing and keeps the pair in step). */
    if (S.action === "wall" && S.wallDrag) {
      var ends = {};
      S.wallDrag.orig.forEach(function (o) {
        ends[o.i] = 1;
      });
      S.walls.forEach(function (w) {
        if (!ends[w.a] && !ends[w.b]) return;
        captureLock(w);
        captureClear(w);
      });
      fillProps();
    }
    if (S.action === "item" && S.sel && (S.sel.kind === "item" || S.sel.kind === "items")) {
      var movedRoots = S.sel.kind === "item" ? [S.sel.ref] : S.sel.refs;
      // a dragged flight of stairs takes its stairwell void with it
      movedRoots.forEach(function(item) { if (syncStairVoids(item)) render2D(); });
      itemMovePlanOps(movedRoots, S.items).forEach(broadcastPlanOp);
    } else if (S.action === "opening" && S.sel && S.sel.kind === "opening") {
      broadcastPlanOp({ type: "openingSet", id: S.sel.ref.id, fields: { s: S.sel.ref.s } });
    } else if (S.action === "slabvoid" && S.sel && S.sel.kind === "slabvoid") {
      broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
      fillProps();
    } else if (S.action === "node" && S.nodeDrag && S.nodes[S.nodeDrag.node]) {
      var bn = S.nodes[S.nodeDrag.node];
      // `n` guards the index: no op syncs wall creation, so a peer whose node
      // array has grown must resync rather than move a different corner
      broadcastPlanOp({ type: "nodeMove", index: S.nodeDrag.node, n: S.nodes.length, x: bn.x, z: bn.z });
    }
    /* The gesture is over, so the sub-graph shortcut and the Alt override both
       expire here and the WHOLE dimension set gets the last word. A drag that
       suppressed the solver therefore ends with the plan obeying its
       dimensions again — the override buys a gesture, never a drawing that
       silently disagrees with what it says. */
    if (S.action === "node" || S.action === "wall" || S.action === "room") {
      S.conOverride = false;
      var settle = solveWallCons();
      /* Held pieces follow the walls they are held against, and they follow
         AFTER the dimensions have settled — re-seating against a wall that is
         still about to move would just have to be redone. */
      if (reseatHeldItems()) S.dirty3D = true;
      if (settle.unresolved) flash(t("wc_unresolved", { n: settle.unresolved }), "error");
    }
    S.conOverride = false;
    if (S.jointsReleased) {
      flash(t("f_jointReleased", { n: S.jointsReleased }));
      S.jointsReleased = 0;
    }
    if (S.action === "marker" || S.action === "markerElev" ||
        S.action === "itemElev" || S.action === "openingElev" || S.action === "slabvoid") fillProps();
    if (S.action === "item" || S.action === "room" || S.action === "node" ||
        S.action === "wall" || S.action === "marker" || S.action === "markerElev" ||
        S.action === "itemElev" || S.action === "openingElev" || S.action === "slabvoid")
      refreshTree();
    if (S.action === "item" || S.action === "marker" || S.action === "markerElev" ||
        S.action === "itemElev" || S.action === "openingElev" || S.action === "slabvoid")
      S.dirty3D = true;
    // drafting guides belong to the drag that produced them — corner and point
    // drags both go through snapPoint — so they end with it. Only those two:
    // the wall tool is mid-gesture on pointerup and still needs its guides.
    var dragUsedSnap = S.action === "marker" || S.action === "node";
    cancelPending();
    S.action = null;
    plan.classList.remove("is-panning");
    eraseSeen = null;
    erasePushed = false;
    S.dragRoom = null;
    S.nodeDrag = null;
    S.wallDrag = null;
    if (S.wallAngleGuide && S.wallAngleGuide.snapped)
      S.wallAngleGuide.until = Date.now() + 900;
    else S.wallAngleGuide = null;
    S.mepDrag = null;
    S.elevGrab = null;
    var hadGuides = dragUsedSnap && S.snapGuides && S.snapGuides.length;
    if (hadGuides) S.snapGuides = [];
    // the "you are dropping onto THIS" highlight belongs to the drag as well
    var hadHost = !!S.stackHost;
    S.stackHost = null;
    if (S.alignX != null || S.alignZ != null || hadGuides || hadHost) {
      S.alignX = S.alignZ = null;
      render2D();
    }
    } finally {
      disarmHistoryGesture();
      gestureSession = null;
    }
  }
  registerPlannerController({down:pointerDown, move:planMove, up:endAction, cancel:endAction, double:doubleClick});
  window.addEventListener("planner-cancel-gesture", () => endAction({type:"pointercancel"}));
  plan.addEventListener("pointerup", e => { setPlannerInputView(null); endAction(e); });
  plan.addEventListener("pointercancel", endAction);
  if (typeof window !== "undefined")
    window.addEventListener("plan:view-axis", syncElevationTools);
  plan.addEventListener("pointerleave", function () {
    S.touchContact = null;
    // a captured drag keeps scrolling past the border; the wall/route tools are
    // between clicks with no capture, so losing the cursor must stop the scroll
    if (!S.action) stopAutoPan();
    var draftHover =
      S.previewPt &&
      !S.drawing &&
      !S.arcDraft &&
      !S.rectDraft &&
      (S.tool === "wall" || S.tool === "arcwall" || S.tool === "rect" || S.tool === "slabvoid");
    if (S.hoverItem || S.hoverPt || S.markerPreview || S.wallHoverHalf ||
        S.warnHover || S.conHover || S.wallProbe || S.hoverMarker || S.hoverNode != null ||
        S.eraseHover || draftHover) {
      S.hoverItem = null;
      S.hoverPt = null;
      S.hoverMarker = null;
      S.hoverNode = null;
      S.wallHoverHalf = null;
      S.wallProbe = null;
      S.markerPreview = null;
      S.eraseHover = null;
      if (draftHover) {
        S.previewPt = null;
        S.snapGuides = [];
        S.snapInfo = null;
      }
      if (S.conHover) setConstraintHover(null);
      if (S.tool === "select") plan.style.cursor = "default";
      if (S.warnHover) {
        S.warnHover = null;
        syncWarnHighlight();
      }
      render2D();
    }
  });
  function doubleClick(e) {
    if (S.tool === "wall") return void finishDraw();
    if (S.tool === "arcwall" && S.arcDraft && S.arcDraft.through && S.previewPt)
      return void arcWallPoint(S.previewPt);
    if (S.tool === "mepRoute") return void commitRoute();
    if (S.tool && S.tool !== "select") return;
    if (S.workspace && S.workspace.role === "viewer") return;
    if (isElevation()) return; // the elevation pane draws a side view, not a plan
    /* Direct manipulation for the verb each object is asked for most. Both are
       the same edit the contextual row offers, one tap cheaper, and both are
       cyclic — a second double-click undoes the first — so there is nothing to
       learn and nothing to lose by trying it.

       The hit test is repeated here rather than trusting S.sel: the two clicks
       that make a double-click have already selected whatever the FIRST one
       landed on, so acting on the selection alone would rotate the chair you
       had selected a minute ago when you double-click empty floor next to it. */
    var r = inputBounds(plan),
      ox = e.clientX - r.left,
      oy = e.clientY - r.top,
      px = wx(ox, oy),
      pz = wz(ox, oy);
    var op = hitOpening(px, pz);
    if (op && op.type === "door" && !op.isSliding && !op.isPocket) {
      if (window.__runAction) {
        select({ kind: "opening", ref: op });
        window.__runAction("flipSwing");
      }
      return;
    }
    var it = hitItem(px, pz);
    if (it && !it.locked && window.__runAction) {
      select({ kind: "item", ref: it });
      window.__runAction("rotSel90");
      return;
    }
    /* The floor is tried LAST because it is the biggest target on the plan:
       tested first it would swallow every piece and every door standing on it.
       Bare ground is not a room, so a double-tap outside the walls still means
       nothing at all. */
    var rk = hitRoom(px, pz);
    if (rk != null && window.__runAction) {
      select({ kind: "room", ref: rk });
      window.__runAction("roomFloor");
    }
  }
  plan.addEventListener("dblclick", e => { setPlannerInputView(null); doubleClick(e); });

  plan.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      if (isElevation()) return; // elevations auto-fit; no zoom/pan
      var f = Math.pow(1.0015, -e.deltaY);
      var r = inputBounds(plan);
      var ox = e.clientX - r.left, oy = e.clientY - r.top;
      var bx = wx(ox, oy),
        bz = wz(ox, oy);
      S.SC = clamp(inputScale() * f, 0.08, 6);
      // keep the world point under the cursor fixed (in the rotated base frame)
      var base = toBasePx(ox, oy);
      S.OX = base.x - bx * inputScale();
      S.OY = base.y - bz * inputScale();
      render2D();
    },
    { passive: false },
  );

  window.addEventListener("keydown", function (e) {
    // The modeler is a modal editor layered over the plan. Its shortcuts share
    // letters with planner commands (notably L: sketch Line vs structure
    // Lock), and the planner listener is registered first, so stopping the
    // event inside the modeler is already too late. Leave every key to the
    // visible modeler before the planner mutates hidden state behind it.
    if (modelerKeyboardOwnsInput()) return;
    if (S.workspace && S.workspace.role === "viewer") return;
    // Browser extensions and other integrations can dispatch a keydown-like
    // event without KeyboardEvent.key. There is no planner shortcut to run.
    if (typeof e.key !== "string" || !e.key) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    // Walk/drive modes own the keyboard (WASD, V, G, T…). Without this, keys
    // like Delete or 1-5 kept editing the plan behind the first-person view.
    if (isWalk() && inputIs3D() && /^(Key[WASD]|Arrow)/.test(e.code)) return;
    /* A digit typed while the wall tool is rubber-banding means "this exact
       length", not "switch to the door tool" — the precision entry gets first
       refusal on the key before the 1-6 shortcuts below can claim it. */
    if (hudKeydown(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl-combos handled in ui.js
    if (e.key === "Escape") {
      // Esc during a live drag abandons the gesture's selection while the
      // pointer is still down; the proxy is keyed on objects rather than the
      // selection, so it would otherwise stay up with nothing driving it.
      dropDragProxy();
      var cancelledTutorDraft = !!(S.drawing || S.offsetDraft || S.joinPick || S.arcDraft || S.rectDraft);
      S.freshWall = null; // "I'm done" ends the just-drawn run too
      if (S.conPick) endConPick(null);
      else if (S.drawing) finishDraw();
      else if (S.offsetDraft) { S.offsetDraft = null; S.previewPt = null; render2D(); }
      else if (S.joinPick) { S.joinPick = null; render2D(); }
      else if (S.arcDraft) { S.arcDraft = null; S.previewPt = null; render2D(); }
      else if (S.rectDraft) { S.rectDraft = null; S.previewPt = null; setTool("select"); }
      else if (S.roomStamp) { disarmRoomStamp(); S.previewPt = null; setTool("select"); }
      else if (S.placeType) {
        S.placeType = null;
        S.previewPt = null;
        window.dispatchEvent(new CustomEvent("planner-place"));
      }
      else if (S.tool === "mepRoute" && ensureMEP().route) cancelRoute();
      else if (S.tool && S.tool.indexOf("mep") === 0) setTool("select");
      else if (S.tool === "point" || S.tool === "slabvoid") setTool("select");
      else {
        // Esc always lands you back on the select tool, not just deselected —
        // "I'm done with this" means done with the tool too.
        select(null);
        if (S.tool !== "select") setTool("select");
      }
      render2D();
      if (cancelledTutorDraft) window.dispatchEvent(new CustomEvent("planner-draft-cancel"));
    } else if (e.key === "Enter" && S.tool === "mepRoute") {
      commitRoute();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSel();
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "m" || e.key === "M")) {
      cycleRoomStampConnMode();
      return;
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "d" || e.key === "D" || e.key === "Tab")) {
      e.preventDefault();
      flipRoomStampDoorWall();
      return;
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      resizeRoomStamp(e.key === "[" ? -10 : 10, 0);
      return;
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "{" || e.key === "}")) {
      e.preventDefault();
      resizeRoomStamp(0, e.key === "{" ? -10 : 10);
      return;
    } else if (e.key === "r" || e.key === "R") {
      // while a preset room is armed R turns the RECTANGLE, not the selection:
      // that is the only thing on screen the user is steering
      if (S.tool === "roomstamp" && S.roomStamp) { rotateRoomStamp(); return; }
      /* The step is whatever the inspector is set to (15/45/90), and Shift
         turns the other way — one key for both directions beats two. */
      var rStep = rotStep() * (e.shiftKey ? -1 : 1);
      if (S.sel && S.sel.kind === "item") {
        pushHistory();
        S.sel.ref.rot = (((S.sel.ref.rot + rStep) % 360) + 360) % 360;
        markManualRot(S.sel.ref);
        S.dirty3D = true;
        fillProps();
        render2D();
      } else if (S.sel && S.sel.kind === "items") rotateItems(rStep);
      else if (S.sel && S.sel.kind === "room") rotateRoom(rStep);
      else if (S.sel && S.sel.kind === "slabvoid") {
        pushHistory();
        S.sel.ref.rot = (((S.sel.ref.rot + rStep) % 360) + 360) % 360;
        S.dirty3D = true;
        fillProps();
        render2D();
        broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
      }
    }     else if (e.key === "1") setTool("select");
    else if (e.key === "2") setTool("wall");
    else if (e.key === "3") setTool("door");
    else if (e.key === "4") setTool("window");
    else if (e.key === "5") setTool("passage");
    else if (e.key === "6") setTool("point");
    else if (e.key === "7") setTool("arcwall");
    else if (e.key === "8") setTool("rect");
    else if (e.key === "9") setTool("slabvoid");
    else if (e.key === "0") armRoomStamp(S.roomStamp ? S.roomStamp.id : "bedroom");
    else if (e.key === "e" || e.key === "E") setTool("erase");
    // L toggles the structure lock — the same button the plan toolbar shows
    else if (e.key === "l" || e.key === "L") setLockStruct(!S.lockStruct);
    else if (e.key.indexOf("Arrow") === 0 && S.sel && S.sel.kind === "marker") {
      e.preventDefault();
      var nowM = Date.now();
      if (!nudgeT || nowM - nudgeT > 800) pushHistory();
      nudgeT = nowM;
      var stM = e.shiftKey ? 10 : 2,
        mk = S.sel.ref;
      // Arrows always move the point along the two axes the CURRENT view can
      // see: x/z from above, and horizontal-plus-HEIGHT in an elevation.
      var dU = e.key === "ArrowLeft" ? -stM : e.key === "ArrowRight" ? stM : 0;
      var dV = e.key === "ArrowUp" ? stM : e.key === "ArrowDown" ? -stM : 0;
      if (isElevation()) {
        var np = elevNudge(mk, dU, dV);
        moveMarker(mk, np.x, np.y, np.z);
      } else {
        moveMarker(mk, mk.x + dU, mk.y, mk.z - dV);
      }
      if (markerItem(mk)) S.dirty3D = true;
      fillProps();
      render2D();
    } else if (
      e.key.indexOf("Arrow") === 0 &&
      S.sel &&
      (S.sel.kind === "item" || S.sel.kind === "items")
    ) {
      e.preventDefault();
      // group rapid keypresses into one undo step
      var now = Date.now();
      if (!nudgeT || now - nudgeT > 800) pushHistory();
      nudgeT = now;
      var st = e.shiftKey ? 10 : 2,
        it = S.sel.kind === "item" ? S.sel.ref : null;
      if (it && it.locked) return;
      if (isElevation() && it) {
        var dUe = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0,
          dVe = e.key === "ArrowUp" ? st : e.key === "ArrowDown" ? -st : 0;
        elevNudgeItem(it, dUe, dVe);
        S.dirty3D = true;
        fillProps();
        render2D();
        return;
      }
      var ndx = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0,
        ndz = e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
      var nudged = it ? [it] : S.sel.refs;
      var nSet = new Set(nudged);
      nudged.forEach(function (r) { r.x += ndx; r.z += ndz; });
      // whatever stands on a nudged piece is nudged with it
      nudged.forEach(function (r) { carryChildren(r, ndx, ndz, nSet); });
      // a nudge is small, so a stacked piece normally stays on its host; it only
      // comes off once its centre has actually left the host's footprint
      nudged.forEach(refreshSupport);
      // nudged off its placeholder point -> that point is free again
      nudged.forEach(releaseIfMoved);
      S.dirty3D = true;
      fillProps();
      render2D();
    } else if (
      e.key.indexOf("Arrow") === 0 &&
      isElevation() &&
      S.sel &&
      S.sel.kind === "opening"
    ) {
      e.preventDefault();
      var nowO = Date.now();
      if (!nudgeT || nowO - nudgeT > 800) pushHistory();
      nudgeT = nowO;
      var stO = e.shiftKey ? 10 : 2,
        dUo = e.key === "ArrowLeft" ? -stO : e.key === "ArrowRight" ? stO : 0,
        dVo = e.key === "ArrowUp" ? stO : e.key === "ArrowDown" ? -stO : 0;
      elevNudgeOpening(S.sel.ref, dUo, dVo);
      S.dirty3D = true;
      fillProps();
      render2D();
    }
  });
}

import { activeEditor } from "./pro_shell.js";
import { openingDrawDefaults } from "./opening_draw_defaults.js";
import { sx, sz, wx, wz, rotatePx, toBasePx, planRotRad, inputScale, inputBounds, inputIs3D, plannerInputView, setPlannerInputView, registerPlannerController } from "./planner_input.js";
import "./redesign.js";
// Pointer/keyboard interaction: hit-testing, tools, drag/draw, and structural edit operations.
import { S, WALL_H, uid, fin, clamp, SNAP_GRID, throttle, touchItem3D } from "./state.js";
import {
  wallGeom, wallById, usedNodes, detectRooms, roomByKey, distSeg, snapAdj,
  itemsInRoom, hiddenSets, equalWallAngleTranslation, wallProject,
} from "./geometry.js";
import { offsetSideFromCursor } from "./wall_draw.js";
import "./wall_curves.js";
import "./placement_resolver.js";
import "./wall_fillet.js";
import "./furniture.js";
import { reseatHeldItems } from "./item_align.js";
import { markManualRot, rotStep } from "./item_orient.js";
import { t } from "./i18n.js";
import { fmtLen, unitLabel } from "./display_units.js";
import { plan, render2D, dropPoint, pickCon as flatPickCon, touchLensDistanceMap, setDragProxy, clearDragProxy } from "./plan2d.js";
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
import { layerRank, canDrag, isLayerHidden } from "./layers.js";
import { itemUserUnpickable } from "./user_layers.js";
import { planIndex } from "./spatial_index.js";
import {
  ensureMEP, snapMEPPoint, routeResolve, wallPath, addNode, hitMEP, cancelRoute,
} from "./mep.js";
import {
  isElevation as flatIsElevation, elevationHit, elevPick, elevDragTo, elevNudge,
  elevWallAt, elevItemGrab, elevDragItemTo, elevNudgeItem,
  elevOpeningGrab, elevDragOpeningTo, elevNudgeOpening,
} from "./elevation.js";
import {
  detach as stackDetach, carryChildren, descendantsOf, refreshSupport,
} from "./stack.js";
import {
  addMarker, hitMarker, markerItem, moveMarker, releaseIfMoved,
} from "./markers.js";
import { hitSlabOpening } from "./slab_openings.js";
import { broadcastPlanOp, itemMovePlanOps, sendPlanCursor } from "./plan_sync.js";
import { syncStairVoids } from "./ui.js";
import {
  snapshotNodes, enforceLocks, captureLock, canWeld, hitWarning, captureClear,
} from "./constraint_engine.js";
import { solveWallCons } from "./wall_constraints.js";
import {
  syncWarnHighlight, setConstraintHover, renderWarnPanel,
} from "./ui_warn.js";
import { hudKeydown, entryOpen } from "./cad_hud.js";
import "./room_presets.js";
import { solveDock, corridorRect, translateRect } from "./room_dock.js";
import "./room_stamp.js";
import { wallSeparates, detachRoomSeam } from "./room_graph.js";
import {
  beginTouchPrecision, planTouchPrecisionKind, touchPrecisionPoint, updateTouchPrecision,
} from "./touch_precision.js";
import {
  dispatchPrecisionCommit, dispatchPrecisionMove, getTouchPrecisionMode,
  getTouchPrecisionPrefs, releaseTouchPrecisionTrial, startTouchPrecisionTrial,
  touchPrecisionTrialOwns, updateTouchPrecisionTrial,
} from "./touch_precision_ui.js";
import { openingPlaceCommand, executeCommand } from "./commands/index.js";
import {
  begin3DItemDrag, begin3DOpeningDrag, drag3DItemElev, drag3DItemTo,
  drag3DOpeningTo, end3DItemDrag, end3DOpeningDrag, opening3DPos, rotateItems,
  select3DTarget,
} from "./interaction/view3d_edit.js";
import {
  addSpace, applyNodePairRelation, auditDragProxy, autoArrangeAll, deleteRoom,
  finalizeItemPlacement, moveItemTo, openSegment, openWall,
  placeOpeningOnSelected, rotateRoom, togglePinSelected, weldCoincidentNodes,
  weldNodes,
} from "./interaction/layout_drag.js";
import {
  agentCommandEnvironment, applyRemove, blockedDrag, conPickActive, deleteSel,
  dupSel, endConPick, eraseKey, executePlannerProposal, finishConPick,
  finishRemove, pickErase, previewPlannerCommand, resolveLanding,
  selectAtScreen, splitIntersectionWalls, splitWallAt, startConPick,
  startNodeConPick, startOpeningAlignPick, targetLocked, wallHalfAt,
} from "./interaction/wall_edit.js";
import { snapPoint, snapWallPoint } from "./interaction/wall_snap.js";
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
import {
  wireLongPressAndPointerUp, wirePlanListeners,
} from "./interaction/pointer_up.js";
import { wirePlanMove } from "./interaction/plan_move.js";
import {
  autoPanFrom, dragSolve, landNodeOnWall, stopAutoPan,
} from "./interaction/auto_pan.js";
import { pointerDown } from "./interaction/pointer_down.js";
import {
  armTwoTap, beginEraseStroke, beginPinch, beginPlanPrecisionTrial,
  modelerKeyboardOwnsInput, placeOpeningAt, planPrecisionPoint, setSpacePan,
  strokeErase, tryTwoTap, updatePinch,
} from "./interaction/gesture_helpers.js";
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
// for js/interaction/pointer_up.js (live bindings: it sees every reassignment)
export { interactionLocals };
// for js/interaction/pointer_down.js (live bindings: it sees every reassignment)
export { armDragProxy };

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

const interactionLocals = {
  nudgeT: undefined, modelerKeyboardOwnsInput: undefined, pointers: undefined,
  touchHostPlacement: undefined, eraseSeen: undefined, erasePushed: undefined,
  planPrecisionPoint: undefined, placeOpeningAt: undefined, tryTwoTap: undefined,
  cancelLongPress: undefined, gestureSession: undefined, pointerDown: undefined,
  autoPanFrom: undefined, stopAutoPan: undefined, landNodeOnWall: undefined, planMove: undefined,
  strokeErase: undefined, updatePinch: undefined, trackLongPress: undefined, dragSolve: undefined,
  AP_BAND: undefined, AP_MAX: undefined, AP_RAMP: undefined, apRAF: undefined, apPtr: undefined,
  apT0: undefined, apLast: undefined, spacePan: undefined, beginPlanPrecisionTrial: undefined,
  beginEraseStroke: undefined, preTouchSel: undefined, armTwoTap: undefined, beginPinch: undefined,
  armLongPress: undefined, pinch: undefined, twoTap: undefined, TWOTAP_MS: undefined,
  TWOTAP_SLOP: undefined,
};

/* ---- event wiring ---- */
export function initInteraction() {
  interactionLocals.beginPlanPrecisionTrial = beginPlanPrecisionTrial;
  interactionLocals.beginEraseStroke = beginEraseStroke;
  interactionLocals.armTwoTap = armTwoTap;
  interactionLocals.beginPinch = beginPinch;
  interactionLocals.armLongPress = armLongPress;
  interactionLocals.strokeErase = strokeErase;
  interactionLocals.updatePinch = updatePinch;
  interactionLocals.trackLongPress = trackLongPress;
  interactionLocals.dragSolve = dragSolve;
  interactionLocals.planPrecisionPoint = planPrecisionPoint;
  interactionLocals.placeOpeningAt = placeOpeningAt;
  interactionLocals.tryTwoTap = tryTwoTap;
  interactionLocals.cancelLongPress = cancelLongPress;
  interactionLocals.pointerDown = pointerDown;
  interactionLocals.autoPanFrom = autoPanFrom;
  interactionLocals.stopAutoPan = stopAutoPan;
  interactionLocals.landNodeOnWall = landNodeOnWall;
  interactionLocals.modelerKeyboardOwnsInput = modelerKeyboardOwnsInput;
  interactionLocals.pointers = {};
  interactionLocals.pinch = null;
  interactionLocals.nudgeT = 0;
  interactionLocals.eraseSeen = null;
  interactionLocals.erasePushed = false;
  interactionLocals.spacePan = false;
  interactionLocals.touchHostPlacement = null;
  window.addEventListener("keydown", function (e) {
    if ((0, interactionLocals.modelerKeyboardOwnsInput)()) return;
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
  interactionLocals.TWOTAP_MS = 260;
  interactionLocals.TWOTAP_SLOP = 16;
  interactionLocals.twoTap = null;
  interactionLocals.preTouchSel = null; // what was selected before this gesture's first finger

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
    (0, interactionLocals.cancelLongPress)();
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
        (0, interactionLocals.stopAutoPan)();
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
      (0, interactionLocals.cancelLongPress)();
  }

  plan.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });
  interactionLocals.gestureSession = null;
  plan.addEventListener("pointerdown", function(e) { setPlannerInputView(null); (0, interactionLocals.pointerDown)(e); });

  /* ---- edge auto-pan ----
     A gesture that reaches the border of the plan canvas — drawing a wall,
     dragging an item/corner/room/point/MEP run — scrolls the view that way
     instead of stopping dead, so the user never has to drop the gesture, pan,
     and pick it back up. The loop shifts the view and then replays the last
     pointer position through the normal move handler, so the dragged thing
     keeps tracking the cursor (which now sits over new world coordinates). */
  interactionLocals.AP_BAND = 44;
  interactionLocals.AP_MAX = 11;
  interactionLocals.AP_RAMP = 550; // ms of easing from a crawl to full speed
  interactionLocals.apRAF = 0;
  interactionLocals.apPtr = null;
  interactionLocals.apT0 = 0;
  interactionLocals.apLast = 0; // previous frame stamp, so speed is time-based not frame-based

  wirePlanMove();
  // Movement cancels the long press on the RAW event, not the throttled one:
  // a fast flick can cross the slop and be back before planMove next runs.
  plan.addEventListener("pointermove", interactionLocals.trackLongPress);
  wireLongPressAndPointerUp();

  wirePlanListeners();
}


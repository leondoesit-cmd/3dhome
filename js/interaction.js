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
// Screen px of tolerance -> world cm, slop applied. Guards the degenerate
// transform (SC 0/NaN) the same way the call sites used to do by hand.
function tolCm(px) {
  var v = (px * PICK_SLOP) / inputScale();
  return isFinite(v) && v > 0 ? v : px * PICK_SLOP;
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
function kindList(kind) {
  return KIND_CACHE[kind] || (KIND_CACHE[kind] = [kind]);
}
/* Candidates of one kind within `r` of the cursor, in the array order the
   linear scans used. Sorting a handful of records per query is far below the
   scan it replaces, and it is what keeps an exact-tie winner identical. */
function nearRecs(px, pz, r, kind) {
  var out = planIndex.query(px, pz, r, kindList(kind));
  if (out.length > 1) out.sort(function (a, b) { return a.ord - b.ord; });
  return out;
}

/* The axis-aligned box of a wall's centreline, padded by a whole thickness.

   For an arc the box is the exact one: the two endpoints, plus each of the four
   axis extremes of the circle that falls inside the swept angle. Sampling the
   curve would not do — a sampled hull can cut a bulge, and a wall the grid
   forgets is a snap the user loses. */
function wallBoxOf(w, g) {
  var x0, x1, z0, z1;
  if (g.kind === "arc" && g.curve && g.curve.center && fin(g.curve.radius)) {
    var c = g.curve;
    var pts = [g.a, g.b, c.a, c.b];
    x0 = z0 = Infinity;
    x1 = z1 = -Infinity;
    pts.forEach(function (p) {
      if (!p || !fin(p.x) || !fin(p.z)) return;
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.z < z0) z0 = p.z;
      if (p.z > z1) z1 = p.z;
    });
    for (var q = 0; q < 4; q++) {
      var base = (q * Math.PI) / 2;
      for (var turn = -2; turn <= 2; turn++) {
        var ang = base + turn * 2 * Math.PI;
        var t = c.sweep ? (ang - c.startAngle) / c.sweep : -1;
        if (!(t >= 0 && t <= 1)) continue;
        var ex = c.center.x + Math.cos(ang) * c.radius,
          ez = c.center.z + Math.sin(ang) * c.radius;
        if (ex < x0) x0 = ex;
        if (ex > x1) x1 = ex;
        if (ez < z0) z0 = ez;
        if (ez > z1) z1 = ez;
        break;
      }
    }
  } else {
    x0 = Math.min(g.a.x, g.b.x);
    x1 = Math.max(g.a.x, g.b.x);
    z0 = Math.min(g.a.z, g.b.z);
    z1 = Math.max(g.a.z, g.b.z);
  }
  if (!fin(x0) || !fin(z0) || !fin(x1) || !fin(z1)) return null;
  var pad = Math.max(0, w.thickness || 0);
  return { minx: x0 - pad, minz: z0 - pad, maxx: x1 + pad, maxz: z1 + pad };
}

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
function layerOpen(id) {
  if (snapSession) return snapSession.open[id] !== false;
  return !isLayerHidden(id);
}
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

/* Everything the pointer paths can land on, as index records. Called by the
   index itself on the first query after an invalidation, which is why it is
   handed over as a function rather than an array: a gesture that mutates the
   model twenty times pays for one rebuild, on the first query that needs it,
   instead of one per mutation.

   Node records carry the ids of the walls that use them because hitNode()
   refuses a corner left behind only by hidden walls, and that question cannot
   be answered from the corner alone. `usedNodes()` — the set snapPoint's corner
   pass reads — is the same set without the hidden filter, so both callers are
   served by one record list. */
function planIndexRecords() {
  var recs = [];
  if (layerOpen("structure")) {
    var byNode = {};
    S.walls.forEach(function (w, i) {
      var g = wallGeom(w);
      if (!g || !g.a || !g.b) return;
      var box = wallBoxOf(w, g);
      if (box) {
        box.kind = "wall";
        box.id = w.id;
        box.ref = w;
        box.ord = i;
        recs.push(box);
      }
      [w.a, w.b].forEach(function (k) {
        var n = S.nodes[k];
        if (!n || !fin(n.x) || !fin(n.z)) return;
        var rec = byNode[k];
        if (!rec) {
          rec = byNode[k] = {
            kind: "node", id: +k, ord: +k, walls: [],
            minx: n.x, minz: n.z, maxx: n.x, maxz: n.z,
          };
          recs.push(rec);
        }
        rec.walls.push(w.id);
      });
    });
    /* An opening takes its whole host wall's box. Its jambs and the cursor
       projection both callers measure from lie on that wall, so the wall's box
       is a superset of anything either could reach — and one that is already
       arc-correct, where a box spanning only the two jamb points would cut the
       bulge of a curved wall between them. Openings are few per wall, so the
       coarser box costs a handful of rejected candidates and no scan. */
    S.openings.forEach(function (o, i) {
      var w = wallById(o.wall);
      if (!w) return;
      var g = wallGeom(w);
      if (!g || !fin(g.L)) return;
      var box = wallBoxOf(w, g);
      if (!box) return;
      box.kind = "opening";
      box.id = o.id;
      box.ref = o;
      box.ord = i;
      recs.push(box);
    });
  }
  if (layerOpen("furniture"))
    S.items.forEach(function (it, i) {
      if (!it || !fin(it.x) || !fin(it.z)) return;
      var a = ((it.rot || 0) * Math.PI) / 180,
        ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
      // half-extents of the axis-aligned hull of the rotated footprint
      var hx = (Math.abs(it.w || 0) * ca + Math.abs(it.d || 0) * sa) / 2,
        hz = (Math.abs(it.w || 0) * sa + Math.abs(it.d || 0) * ca) / 2;
      recs.push({
        kind: "item", id: it.id, ref: it, ord: i,
        minx: it.x - hx, maxx: it.x + hx, minz: it.z - hz, maxz: it.z + hz,
      });
    });
  if (layerOpen("annotations"))
    (S.markers || []).forEach(function (m, i) {
      if (!m || !fin(m.x) || !fin(m.z)) return;
      recs.push({
        kind: "marker", id: m.id, ref: m, ord: i,
        minx: m.x, maxx: m.x, minz: m.z, maxz: m.z,
      });
    });
  return recs;
}
/* Point the shared index at this module's view of the model, then mark it
   stale so the first real query builds against a loaded plan rather than the
   empty one that exists at import time. */
planIndex.build(planIndexRecords);
planIndex.invalidate();

/* ---- rank gates on the hit tests ----
   Every hit function below opens by asking its layer's rank and answering null
   at Infinity — ghosted or hidden geometry is not there as far as the pointer
   is concerned. Ranks 0 and 1 both still answer; separating those two is the
   pointerdown chain's job (see runSelectPass), not the hit test's, because a
   rank-1 wall must still be selectable and readable in the inspector. */
function hitNode(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  // corners of the walls actually on the plan — a corner left only by hidden
  // walls isn't drawn, so it isn't grabbable either (mirrors plan2d drawNodes)
  var hid = hiddenSets(),
    thr = tolCm(10),
    best = null,
    bd = thr;
  /* Records arrive in ascending node index, which is the order the `for..in`
     over usedNodes() ran in — and `d < bd` is strict, so two coincident corners
     are still separated the same way round. */
  var near = nearRecs(px, pz, thr, "node");
  for (var i = 0; i < near.length; i++) {
    var rec = near[i], shown = false;
    for (var j = 0; j < rec.walls.length; j++)
      if (!hid.walls[rec.walls[j]]) { shown = true; break; }
    if (!shown) continue;
    var n = S.nodes[rec.id];
    if (!n) continue;
    var d = Math.hypot(px - n.x, pz - n.z);
    if (d < bd) {
      bd = d;
      best = rec.id;
    }
  }
  return best;
}
function hitOpening(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  var hid = hiddenSets();
  // backwards, as the linear scan was: the opening latest in the array wins an
  // overlap. nearRecs() hands them back in array order, so reversing it here is
  // the same traversal over a shorter list.
  var nearOp = nearRecs(px, pz, tolCm(10), "opening");
  for (var i = nearOp.length - 1; i >= 0; i--) {
    var o = nearOp[i].ref,
      w = wallById(o.wall);
    if (!w || hid.walls[o.wall]) continue;
    var gm = wallGeom(w), projected = wallProject(w, px, pz);
    if (!projected) continue;
    var s = clamp(o.s, o.width / 2, gm.L - o.width / 2);
    if (Math.abs(projected.s - s) < o.width / 2 && projected.distance < w.thickness / 2 + tolCm(10))
      return o;
  }
  return null;
}
function inItem(px, pz, it, pad) {
  var A = (it.rot * Math.PI) / 180,
    ca = Math.cos(A),
    sa = Math.sin(A);
  var lx = (px - it.x) * ca + (pz - it.z) * sa,
    lz = -(px - it.x) * sa + (pz - it.z) * ca;
  return Math.abs(lx) <= it.w / 2 + pad && Math.abs(lz) <= it.d / 2 + pad;
}
// What is drawn is what can be picked: anything a hidden room took off the
// plan is skipped here too (hiddenSets costs nothing when nothing is hidden).
function hitItem(px, pz) {
  if (layerRank("furniture") === Infinity) return null;
  var i,
    it,
    hid = hiddenSets();
  /* The lamp pass grows the footprint by up to tolCm(16) + tolCm(6) along the
     item's OWN axes, so a point it accepts can sit as far as that times root
     two from the axis-aligned box the grid stores. 1.5 is the smallest tidy
     number above root two, and querying wide costs a few rejected candidates
     where querying short would lose a lamp at 45 degrees. */
  var near = nearRecs(px, pz, tolCm(22) * 1.5, "item");
  // both passes still run newest-first, so the piece drawn on top wins
  for (i = near.length - 1; i >= 0; i--) {
    it = near[i].ref;
    // hidden pieces, and pieces on a faded user layer, are not there to grab
    if (hid.items[it.id] || itemUserUnpickable(it)) continue;
    if (
      isLamp(it) &&
      inItem(
        px,
        pz,
        it,
        Math.max(0, tolCm(16) - Math.min(it.w, it.d) / 2) + tolCm(6),
      )
    )
      return it;
  }
  for (i = near.length - 1; i >= 0; i--) {
    it = near[i].ref;
    if (hid.items[it.id] || itemUserUnpickable(it)) continue;
    if (!isLamp(it) && inItem(px, pz, it, 0)) return it;
  }
  return null;
}
function hitWall(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  var best = null,
    bd = 1e9,
    hid = hiddenSets();
  /* A wall record's box already carries a full thickness of padding, so a wall
     whose centreline is within thickness/2 + tolCm(8) of the cursor has its box
     within tolCm(8) of it. Records come back in S.walls order and the tie test
     stays strict, so an exact tie is still won by the earlier wall. */
  nearRecs(px, pz, tolCm(8), "wall").forEach(function (rec) {
    var w = rec.ref;
    if (hid.walls[w.id]) return;
    var projected = wallProject(w, px, pz);
    var d = projected ? projected.distance : Infinity;
    if (d < w.thickness / 2 + tolCm(8) && d < bd) {
      bd = d;
      best = w;
    }
  });
  return best;
}
/* The wall under the cursor plus where along it the cursor sits, as the two
   distances a tape measure would give: from the wall's start to here, and from
   here to its end. Both are INTERIOR distances (the corner cuts are taken off
   the ends), so the pair adds up to the number the wall is labelled with. */
export function updateWallProbe(px, pz) {
  // before the first render the scale is 0, which makes hitWall's screen-space
  // tolerance infinite — every wall would answer
  var w = inputScale() > 0 ? hitWall(px, pz) : null;
  if (!w) {
    if (S.wallProbe) S.wallProbe = null;
    return;
  }
  var gm = wallGeom(w),
    c = wallCuts(w),
    projected = wallProject(w, px, pz),
    s = projected ? projected.s : 0,
    point = wallPointAt(w, s);
  S.wallProbe = {
    wall: w,
    x: point.x,
    z: point.z,
    fromA: Math.max(0, s - c.a),
    toB: Math.max(0, gm.L - c.b - s),
  };
}
function hitRoom(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  var rs = detectRooms(),
    best = null,
    ba = 1e18;
  for (var i = 0; i < rs.length; i++)
    if (pointInPolyR(px, pz, rs[i].pts) && rs[i].area < ba) {
      ba = rs[i].area;
      best = rs[i].key;
    }
  return best;
}
function pointInPolyR(x, z, pts) {
  var inside = false,
    i,
    j;
  for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i].x,
      zi = pts[i].z,
      xj = pts[j].x,
      zj = pts[j].z;
    if (zi > z != zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi)
      inside = !inside;
  }
  return inside;
}

/* ---- smart alignment: snap a dragged item to other items' edges/centers and wall corners ---- */
// axis-aligned half-extents of an item's footprint (accounts for rotation)
function halfExtents(it) {
  var w = it.w || 0,
    d = it.d || 0,
    a = ((it.rot || 0) * Math.PI) / 180,
    c = Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a));
  return { hx: c * (w / 2) + s * (d / 2), hz: s * (w / 2) + c * (d / 2) };
}
// snap a dragged coordinate on one axis. `itemLines` are edge/center coords of
// other items (matched against the dragged item's near-edge/center/far-edge so
// items can sit flush, align sides, or share a center). `nodeLines` are wall
// corners (matched to the dragged center only). Returns {center, line} or null.
function snapAxis(v, half, itemLines, nodeLines, thr) {
  var best = null,
    bd = thr,
    handles = [0, -half, half],
    i,
    j;
  for (j = 0; j < itemLines.length; j++) {
    for (i = 0; i < handles.length; i++) {
      var center = itemLines[j] - handles[i],
        d = Math.abs(v - center);
      if (d < bd) {
        bd = d;
        best = { center: center, line: itemLines[j] };
      }
    }
  }
  for (i = 0; i < nodeLines.length; i++) {
    var dn = Math.abs(v - nodeLines[i]);
    if (dn < bd) {
      bd = dn;
      best = { center: nodeLines[i], line: nodeLines[i] };
    }
  }
  return best;
}
/* How close a piece's face has to come to a wall's face before it clicks flush.
   A hand-sized distance in centimetres — deliberately NOT scaled by zoom, so
   the snap behaves the same whether the plan is zoomed in or out. */
const WALL_SNAP_GAP = 9;
const SNAP_FLASH_MS = 300;
/* A snap that happens silently reads as the editor moving the piece on its own.
   The piece blinks for a moment when a snap ENGAGES (not on every frame it
   stays engaged, which would be a strobe) — `key` identifies what it snapped
   to, so sliding along one wall flashes once. */
function flashSnap(it, key) {
  if (!it) return;
  if (S.snapFlashKey === key) return;
  S.snapFlashKey = key;
  S.snapFlash = key ? { id: it.id, until: Date.now() + SNAP_FLASH_MS } : null;
  /* The same "it engaged" cue for a finger, which is covering the blink. Gated
     on the key change above, so sliding along one wall buzzes once rather than
     once per frame. */
  if (key && S.touchDrag && navigator.vibrate) navigator.vibrate(8);
}
function alignItem(nx, nz, it) {
  S.alignX = null;
  S.alignZ = null;
  if (S.snapObj === false) return { x: nx, z: nz };

  var mul = snapMul(),
    thr = (8 * mul) / inputScale(),
    he = it ? halfExtents(it) : { hx: 0, hz: 0 },
    itemsX = [],
    itemsZ = [],
    nodesX = [],
    nodesZ = [],
    u = usedNodes();
  for (var k in u) {
    nodesX.push(S.nodes[k].x);
    nodesZ.push(S.nodes[k].z);
  }
  S.items.forEach(function (o) {
    if (o === it) return;
    var oe = halfExtents(o);
    itemsX.push(o.x, o.x - oe.hx, o.x + oe.hx);
    itemsZ.push(o.z, o.z - oe.hz, o.z + oe.hz);
  });
  var bx = snapAxis(nx, he.hx, itemsX, nodesX, thr),
    bz = snapAxis(nz, he.hz, itemsZ, nodesZ, thr);

  if (bx == null && bz == null && it) {
    /* Snap flush to a wall — but only from CLOSE UP. The gate used to be
       `thr + max(w,d)`, i.e. the piece's own size, so a 2 m sofa was captured
       from two metres away and there was no way to stand one just off a wall.
       Now it is the GAP between the piece's face and the wall's face that has
       to be small, which is the distance the eye is judging anyway. */
    var snapP = null,
      bestGap = WALL_SNAP_GAP * mul,
      snapW = null;
    S.walls.forEach(function (w) {
      var gm = wallGeom(w);
      var dx = gm.b.x - gm.a.x, dz = gm.b.z - gm.a.z;
      var l2 = dx * dx + dz * dz;
      if (l2 < 1) return;
      var t = clamp(((nx - gm.a.x) * dx + (nz - gm.a.z) * dz) / l2, 0, 1);
      var px = gm.a.x + t * dx, pz = gm.a.z + t * dz;
      var dist = Math.hypot(nx - px, nz - pz);
      var nx_dir = nx - px, nz_dir = nz - pz;
      if (dist > 0.001) { nx_dir /= dist; nz_dir /= dist; }
      else { nx_dir = -gm.uz; nz_dir = gm.ux; }
      // Distance from wall to the item CENTER so its (possibly rotated) footprint
      // sits flush against the inner face: project the rotation-aware half-extents
      // onto the wall normal (nx_dir,nz_dir is that unit normal), then add half the
      // wall thickness (nodes lie on the centerline, not the inner face).
      var td =
        he.hx * Math.abs(nx_dir) +
        he.hz * Math.abs(nz_dir) +
        (w.thickness || 0) / 2;
      var gap = Math.abs(dist - td); // how far the piece's face is off the wall's
      if (gap < bestGap) {
        bestGap = gap;
        snapW = w;
        snapP = { x: px + nx_dir * td, z: pz + nz_dir * td };
      }
    });
    if (snapP) {
      flashSnap(it, "wall:" + snapW.id);
      /* Remember what it went flush against. endAction turns this into a
         standing hold, so a sofa pushed against a wall STAYS against it when
         the wall is later moved or the room resized — which is what the user
         meant by pushing it there, and what used to quietly come undone. */
      S.itemSnapWall = snapW.id;
      return snapP;
    }
    S.itemSnapWall = null;
  }
  flashSnap(it, bx || bz ? "align:" + (bx ? bx.line : "-") + "," + (bz ? bz.line : "-") : null);

  S.alignX = bx != null ? bx.line : null;
  S.alignZ = bz != null ? bz.line : null;
  return { x: bx != null ? bx.center : nx, z: bz != null ? bz.center : nz };
}

/* A plan click resolved to a point spec for addMarker.

   From above, a click is a floor point — unless snapPoint landed it ON a wall,
   in which case the point belongs to that wall: record the wall and the normal
   pointing back toward where the cursor actually was, which is the side of the
   wall the user is working on. That is what lets the point later be raised up
   the wall in an elevation, and what makes a piece seated on it face the room.
   `raw` may already carry a wall from snapPoint's edge snap. */
function planPickSurface(p, cx, cz) {
  var surfaceHit = inputIs3D() ? plannerInputView()?.hit : null;
  var spec = { x: p.x, y: fin(surfaceHit?.point?.y) ? surfaceHit.point.y : 0, z: p.z, surface: "floor", wall: null, nx: 0, nz: 0 };
  var best = null,
    bd = tolCm(10);
  S.walls.forEach(function (w) {
    if (surfaceHit && (surfaceHit.kind !== "wall" || surfaceHit.ref.id !== w.id)) return;
    var g = wallGeom(w), projected = wallProject(w, p.x, p.z);
    var d = projected ? projected.distance : Infinity;
    if (d < (w.thickness || 0) / 2 + bd && (best === null || d < best.d)) {
      best = { w: w, g: g, d: d, projected: projected };
    }
  });
  if (!best) return spec;
  var g2 = best.g, localTangent = wallTangentAt(best.w, best.projected.s) || { x: g2.ux, z: g2.uz },
    nx = -localTangent.z,
    nz = localTangent.x;
  // point the normal at the side the cursor is on — that is the face the user
  // is looking at, and the side a piece should end up on
  var side = (cx - g2.a.x) * nx + (cz - g2.a.z) * nz;
  if (side < 0) { nx = -nx; nz = -nz; }
  spec.surface = "wall";
  spec.wall = best.w.id;
  spec.nx = nx;
  spec.nz = nz;
  return spec;
}

/* ---- tools ---- */
const STRUCTURE_AUTHOR_TOOLS = Object.freeze({
  wall: 1, arcwall: 1, rect: 1, roomstamp: 1, door: 1, window: 1,
  passage: 1, slabvoid: 1, walloffset: 1, walljoin: 1, wallbreak: 1,
  wallbite: 1, wallreverse: 1, wallpaint: 1,
});

export function setTool(toolName) {
  cancelTouchPrecisionTrial();
  if (!toolName) toolName = "select";
  if (isElevation() && isWallDrawTool(toolName)) {
    flash(t("tool_plan_only"));
    toolName = "select";
  }
  if (STRUCTURE_AUTHOR_TOOLS[toolName] && isLayerLocked("structure")) {
    flash(t("tool_structure_locked"), "error");
    toolName = "select";
  }
  S.tool = toolName;
  if (S.conHover != null) setConstraintHover(null);
  S.eraseHover = null;
  S.freshWall = null; // picking any tool ends the just-drawn run
  if (toolName !== "wall") finishDraw();
  if (toolName !== "arcwall") S.arcDraft = null;
  if (toolName !== "rect" && toolName !== "slabvoid") S.rectDraft = null;
  if (toolName !== "roomstamp") { S.roomGhost = null; S.roomPrepared = null; }
  /* Picking the tool from the toolbar or with 0 has to arm SOMETHING, or the
     first move over the plan shows nothing and the tool looks broken. The last
     preset used survives, so this default only ever fires once a session. */
  if (toolName === "roomstamp" && !S.roomStamp) {
    var firstPreset = roomPreset("bedroom");
    if (firstPreset)
      S.roomStamp = { id: firstPreset.id, rot: 0, w: firstPreset.w, d: firstPreset.d, connMode: "auto", doorWallIndex: 0 };
  }
  if (toolName !== "walloffset") S.offsetDraft = null;
  if (toolName !== "walljoin") S.joinPick = null;
  if (toolName !== "wallbite") S.biteDraft = null;
  if (toolName !== "point") {
    S.markerPreview = null;
    S.snapGuides = [];
  }
  if (toolName !== "select") S.placeType = null;
  // leaving the MEP tools clears any armed palette entry + in-progress route
  if (toolName.indexOf("mep") !== 0) cancelMEP();
  document.querySelectorAll(".tool").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-tool") === toolName);
  });
  if (plan && plan.style) plan.style.cursor = toolName === "select" && !S.placeType ? "default" : "crosshair";
  if (toolName !== "point") S.snapInfo = null;
  if (document.documentElement) document.documentElement.setAttribute("data-tool", toolName || "select");
  window.dispatchEvent(new CustomEvent("planner-tool"));
  updateCadHud();
  syncElevationTools();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("planner-draw-defaults"));
}

if (typeof window !== "undefined")
  window.addEventListener("blueprint:trace-walls", function () { setTool("wall"); });
if (typeof window !== "undefined")
  window.addEventListener("layers:changed", syncElevationTools);

export function syncElevationTools() {
  var elev = isElevation();
  if (elev && (S.tool === "wall" || S.tool === "arcwall")) {
    S.tool = "select";
    if (plan) plan.style.cursor = "default";
  }
  if (typeof document === "undefined") return;
  document.querySelectorAll(".tool[data-tool]").forEach(function (b) {
    var tool = b.getAttribute("data-tool");
    var blocked = elev && isWallDrawTool(tool);
    var locked = !!STRUCTURE_AUTHOR_TOOLS[tool] && isLayerLocked("structure");
    b.disabled = !!blocked || locked;
    b.classList.toggle("elev-blocked", blocked);
    b.classList.toggle("layer-blocked", locked);
    b.classList.toggle("active", b.getAttribute("data-tool") === S.tool);
    if (blocked) b.title = t("tool_plan_only");
    else if (locked) b.title = t("tool_structure_locked");
    else if (b.getAttribute("data-i18n-title")) b.title = t(b.getAttribute("data-i18n-title"));
  });
}

/* ---- MEP tool helpers ---- */
// finish the in-progress route into a run (or discard if <2 points)
function commitRoute() {
  var m = ensureMEP();
  if (!m.route) return;
  if (m.route.pts.length >= 2) {
    if (runCrossesOpening(m.route)) {
      flash(t("mep_doorBlocked"), "error");
      return;
    }
    pushHistory();
    var run = finishRoute();
    select({ kind: "mepRun", ref: run });
    setTool("select");
  } else {
    cancelRoute();
  }
  S.dirty3D = true;
  render2D();
  refreshTree();
}
// arm a drag on the hit MEP entity (node move / vertex move / whole-run move)
function beginMEPDrag(hm, px, pz) {
  S.action = "mep";
  beginHistory();
  if (hm.kind === "mepNode") {
    var p = nodePos(hm.ref);
    S.mepDrag = { mode: "node", ref: hm.ref, ox: px - p.x, oz: pz - p.z };
  } else if (hm.vi >= 0) {
    S.mepDrag = { mode: "vertex", ref: hm.ref, vi: hm.vi };
  } else {
    S.mepDrag = {
      mode: "run", ref: hm.ref, sx: px, sz: pz,
      orig: hm.ref.pts.map(function (p) { return { x: p.x, z: p.z }; }),
    };
  }
}
function dragMEP(px, pz) {
  var d = S.mepDrag;
  if (!d) return;
  if (d.mode === "node") {
    var sp = snapMEPPoint(px - d.ox, pz - d.oz);
    // only wall-plane devices ride a wall; ceiling/floor devices stay free
    var onWall = d.ref.layer === "wall" && sp.wall != null;
    d.ref.wall = onWall ? sp.wall : null;
    d.ref.s = onWall ? sp.s : null;
    d.ref.x = sp.x;
    d.ref.z = sp.z;
  } else if (d.mode === "vertex") {
    var sp2 = snapMEPPoint(px, pz);
    var oldX = d.ref.pts[d.vi].x, oldZ = d.ref.pts[d.vi].z;
    d.ref.pts[d.vi].x = sp2.x;
    d.ref.pts[d.vi].z = sp2.z;
    if (runCrossesOpening(d.ref)) {
      d.ref.pts[d.vi].x = oldX;
      d.ref.pts[d.vi].z = oldZ;
    }
  } else if (d.mode === "run") {
    var dx = Math.round((px - d.sx) / SNAP_GRID) * SNAP_GRID;
    var dz = Math.round((pz - d.sz) / SNAP_GRID) * SNAP_GRID;
    d.orig.forEach(function (o, i) {
      d.ref.pts[i].x = o.x + dx;
      d.ref.pts[i].z = o.z + dz;
    });
    if (runCrossesOpening(d.ref))
      d.orig.forEach(function (o, i) { d.ref.pts[i].x = o.x; d.ref.pts[i].z = o.z; });
  }
}
export function finishDraw() {
  healDrawnWallEnds();
  S.drawing = false;
  S.drawFrom = null;
  S.drawStart = null;
  S.drawFromSplit = false;
  S.drawWalls = [];
  S.wallPress = null;
  S.previewPt = null;
  S.snapGuides = [];
  S.snapInfo = null;
  resetDrawDirLock();
  onDrawEnded();
  render2D();
  // Drawing walls can create, split or merge rooms — the tree has to resync,
  // and refreshTree is also what hands room metadata over to a room whose
  // bounding-wall set just changed (see reconcileRoomMeta).
  refreshTree();
}

/* One point of the wall tool: the first lays the start corner, the second
   builds the wall. Split out of the pointerdown handler so the typed
   length/angle entry (js/cad_hud.js) commits through the SAME path — a wall
   drawn by keyboard is then identical to one drawn by mouse, including the
   history entry, node reuse, topology splits and connected-run continuation. */
export function wallPoint(p) {
  if (!p || !fin(p.x) || !fin(p.z)) return null;
  p = resolveLanding(p, true);
  if (p.blockedOpening != null) {
    flash(t("wall_opening_blocked"), "error");
    return null;
  }
  /* The first corner owns the undo snapshot for the first segment. Landing
     that corner on a host wall may split the host immediately, but that split
     is only an implementation detail of the wall the user is drawing. Do not
     take another snapshot at the second corner or Ctrl+Z exposes the invisible
     half-split topology. Continued runs still get one snapshot per additional
     visible segment. */
  if (!S.drawing || (S.drawWalls || []).length) pushHistory();
  if (!S.drawing) {
    // Landing mid-span SPLITS that wall (getOrMakeNode), which is a change of
    // topology, not of somebody's stated interior dimension — see below.
    resetDrawDirLock();
    S.drawFromSplit = !!p.wall || !!(p.walls && p.walls.length);
    S.drawWalls = [];
    S.drawFrom = getOrMakeNode(p);
    S.drawStart = S.drawFrom;
    S.drawing = true;
    window.dispatchEvent(new CustomEvent("planner-draw-start"));
    S.previewPt = { x: p.x, z: p.z };
    render2D();
    return null;
  }
  /* The INTERIOR span the user just drew — the very number the rubber band was
     showing — read before the wall exists, because the corners it lands on cut
     into it and the intent is what was on screen, not what the geometry will
     measure afterwards. */
  var from = S.nodes[S.drawFrom],
    drawn = from
      ? Math.max(
          0,
          Math.hypot(p.x - from.x, p.z - from.z) -
            (S.interiorDims !== false ? pendingCuts(S.drawFrom, p) : 0),
        )
      : 0;
  /* Interior dimensions are only defended for a wall drawn CORNER TO CORNER.
     A wall started or ended in the middle of an existing one splits it into two
     new walls, and there is no earlier interior measurement of those halves to
     hold — trying anyway made a T-junction shove the whole plan around. Same
     for a wall drawn out in the open: nothing was cut, nothing to restore. */
  var cleanEnds = !S.drawFromSplit && !p.wall && !(p.walls && p.walls.length);
  var drawDefaults = resolveWallDrawDefaults();
  var fromNodeId = S.drawFrom;
  var fromPoint = S.nodes[fromNodeId];
  var commandResult = executeCommand(wallDrawCommand, {
    from: { x: fromPoint.x, z: fromPoint.z },
    to: { x: p.x, z: p.z },
    type: drawDefaults.typeId,
    kind: drawDefaults.kind,
    loc: drawDefaults.loc,
    dimSide: drawDefaults.dimSide,
    height: drawDefaults.height,
    thickness: drawDefaults.thickness,
    datum: drawDefaults.datum,
    phase: drawDefaults.phase,
  }, {
    domain: "planner",
    state: S,
    version: { current: currentHistoryId },
    services: {
      materializeWall: function (params, env) {
        return materializePlannerWall(params, env, {
          fromNodeId: fromNodeId,
          toLanding: p,
        });
      },
    },
  }, { history: false });
  var madeEntry = commandResult.ok && commandResult.created.find(function (entry) {
    return entry.kind === "wall";
  });
  var made = madeEntry ? wallById(madeEntry.id) : null;
  var nb = made ? made.b : fromNodeId;
  if (made) S.drawWalls.push(made.id);
  S.dirty3D = true;
  /* Chief-style continuous placement: the far endpoint becomes the origin of
     the next segment. The tool stays armed and the live dimensions immediately
     restart from that joint; right-click, double-click or Escape ends the run.
     All commits still pass through this one function, so click-drag, click-click
     and typed polar input create identical topology. */
  if (made) {
    if (drawn > 0) made.clearL = drawn;
    if (cleanEnds) preserveClear([made.a, made.b]);
    splitCrossedByNewWall(made);
  }
  S.drawFrom = nb;
  S.drawFromSplit = !!p.wall || !!(p.walls && p.walls.length);
  S.drawing = true;
  resetDrawDirLock();
  S.previewPt = { x: S.nodes[nb].x, z: S.nodes[nb].z };
  S.freshWall = null;
  render2D();
  /* A closed loop is a room the moment the last wall lands, not when the user
     right-clicks to stop. Auto-close also ends the run so the next click is
     not a stray continuation out of the new room. */
  if (made && S.drawStart != null && nb === S.drawStart && (S.drawWalls || []).length >= 3) {
    finishDraw();
    return made;
  }
  if (made) refreshTree();
  return made;
}

/* Reusable wall style defaults live in js/wall_draw.js so the inspector,
   rectangle tool, offset tool and typed polar input all stamp the same
   type / draw-from / location line. */

function splitCrossedByNewWall(made) {
  var hits = throughCrossings(made);
  if (!hits.length) return;
  hits.forEach(function (hit) {
    var host = wallById(hit.hostId);
    if (!host || !made) return;
    var hostHit = wallProject(host, hit.x, hit.z);
    var madeHit = wallProject(made, hit.x, hit.z);
    if (!hostHit || !madeHit) return;
    var hostNode = splitWallAt(host, hostHit.s);
    var madeNode = splitWallAt(made, madeHit.s);
    var extra = S.walls[S.walls.length - 1];
    if (extra && extra.id !== made.id && S.drawWalls.indexOf(extra.id) < 0)
      S.drawWalls.push(extra.id);
    if (hostNode != null && madeNode != null && hostNode !== madeNode)
      weldNodes(hostNode, madeNode);
  });
}

function commitPaintWall(wall) {
  if (!wall) return;
  pushHistory();
  paintWallWithDefaults(wall);
  S.dirty3D = true;
  select({ kind: "wall", ref: wall });
  fillProps();
  render2D();
  refreshTree();
  flash(t("wd_painted"), "success");
}

function handleOffsetClick(px, pz) {
  if (!S.offsetDraft) {
    var host = hitWall(px, pz);
    if (!host) { flash(t("wd_offset_need")); return; }
    S.offsetDraft = {
      hostId: host.id,
      dist: resolveWallDrawDefaults().offsetDist,
      side: offsetSideFromCursor(host, px, pz),
    };
    render2D();
    return;
  }
  var host2 = wallById(S.offsetDraft.hostId);
  if (!host2) { S.offsetDraft = null; return; }
  S.offsetDraft.side = offsetSideFromCursor(host2, px, pz);
  commitOffsetWall();
}

function commitOffsetWall() {
  var d = S.offsetDraft, host = d && wallById(d.hostId);
  if (!host) return;
  var ghost = offsetGhost(host, d.dist, d.side);
  if (!ghost) return;
  pushHistory();
  var a = getOrMakeNode(resolveLanding({ x: ghost.a.x, z: ghost.a.z }, true));
  var b = getOrMakeNode(resolveLanding({ x: ghost.b.x, z: ghost.b.z }, true));
  if (a === b) { flash(tTouch("hint_tool_rect")); return; }
  var made = applyWallDrawDefaults({
    id: uid(), a: a, b: b, thickness: WALL_T, height: WALL_H,
  });
  S.walls.push(made);
  if (wallClearLength(made) > 0) made.clearL = wallClearLength(made);
  captureLock(made); captureClear(made);
  S.drawWalls = [made.id];
  healDrawnWallEnds();
  S.drawWalls = [];
  S.offsetDraft = null;
  S.wallDrawDefaults = Object.assign({}, S.wallDrawDefaults || {}, { offsetDist: d.dist });
  S.dirty3D = true;
  select({ kind: "wall", ref: made });
  render2D();
  refreshTree();
}

function handleBreakClick(px, pz) {
  var w = hitWall(px, pz);
  if (!w) { flash(t("wd_break_need")); return; }
  var pr = wallProject(w, px, pz), g = wallGeom(w);
  if (!pr || pr.s < 8 || pr.s > g.L - 8) { flash(t("wd_break_end")); return; }
  pushHistory();
  splitWallAt(w, pr.s);
  S.dirty3D = true;
  render2D();
  refreshTree();
}

/* Bite a span out of a wall.
 *
 * The eraser removes a wall whole, and a passage cuts a hole with a lintel
 * over it. Between those two there was nothing, and "open this partition up
 * for two metres" is a normal thing to want — the alcove, the pass-through,
 * the half-wall that opens a kitchen onto a living room. What is left after a
 * bite is the two stubs, with nothing above the gap: the wall genuinely stops
 * and starts again, which is what makes it different from a passage.
 *
 * Biting a party wall opens one space into the other, exactly as erasing it
 * whole does, so it goes through the same metadata repair — otherwise the
 * merged space takes whichever of the two names the generic reconciler reaches
 * first. */
function commitWallBite() {
  var draft = S.biteDraft;
  S.biteDraft = null;
  if (!draft) return;
  var wall = wallById(draft.wall);
  if (!wall) return;
  var g = wallGeom(wall);
  var lo = Math.max(0, Math.min(draft.s0, draft.s1));
  var hi = Math.min(g.L, Math.max(draft.s0, draft.s1));
  if (hi - lo < 20) { flash(t("wd_bite_short")); return; }

  pushHistory();
  var merging = wallSeparates(detectRooms(), wall.id);
  var middle = wall;
  /* Two cuts, in this order: the leading stub first, so the second cut is
     measured along what is left rather than along the original. splitWallAt
     keeps the near half in place and returns the new far half at the end of
     the wall list. */
  if (lo > 8) {
    splitWallAt(middle, lo);
    middle = S.walls[S.walls.length - 1];
  }
  var rest = wallGeom(middle);
  if (hi - lo < rest.L - 8) splitWallAt(middle, hi - lo);
  applyRemove({ kind: "wall", ref: middle });
  pruneCons();
  if (S.sel && S.sel.kind === "wall" && S.sel.ref === middle) select(null);
  if (merging) adoptMergedRoomMeta(merging);
  S.dirty3D = true;
  normalizeStructure();
  render2D();
  refreshTree();
  fillProps();
  flash(merging ? t("rp_merged") : t("wd_bite_done", { n: Math.round(hi - lo) }));
}

function handleJoinClick(px, pz) {
  var w = hitWall(px, pz);
  if (!w) { flash(t("wd_join_need")); return; }
  if (!S.joinPick) {
    S.joinPick = w;
    select({ kind: "wall", ref: w });
    flash(t("wd_join_second"));
    render2D();
    return;
  }
  var prop = joinProposal(S.joinPick, w);
  if (!prop) {
    S.joinPick = w;
    select({ kind: "wall", ref: w });
    flash(t("wd_join_colin"), "error");
    return;
  }
  pushHistory();
  var keep = prop.keep, drop = prop.drop;
  var pts = S.openings.filter(function (o) {
    return o.wall === keep.id || o.wall === drop.id;
  }).map(function (o) {
    var host = o.wall === keep.id ? keep : drop;
    return { o: o, p: wallPointAt(host, o.s) };
  });
  keep.a = prop.farKeep;
  keep.b = prop.farDrop;
  delete keep.geometry;
  delete keep.curve;
  pts.forEach(function (entry) {
    if (!entry.p) return;
    var pr = wallProject(keep, entry.p.x, entry.p.z);
    if (!pr) return;
    entry.o.wall = keep.id;
    entry.o.s = pr.s;
  });
  S.walls = S.walls.filter(function (x) { return x.id !== drop.id; });
  S.openings = S.openings.filter(function (o) { return o.wall !== drop.id; });
  captureLock(keep); captureClear(keep);
  pruneCons();
  S.joinPick = null;
  S.dirty3D = true;
  select({ kind: "wall", ref: keep });
  render2D();
  refreshTree();
  flash(t("wd_joined"), "success");
}

function handleReverseClick(px, pz) {
  var w = hitWall(px, pz);
  if (!w) { flash(t("wd_reverse_need")); return; }
  pushHistory();
  reverseWallStyle(w);
  S.dirty3D = true;
  select({ kind: "wall", ref: w });
  fillProps();
  render2D();
  flash(t("wd_reversed"), "success");
}

function commitRectFromTo(a, b) {
  var defaults = resolveWallDrawDefaults();
  var result = executeCommand(roomCreateCommand, {
    // Snap candidates also carry optional UI metadata. Commands take points,
    // not that metadata (which may contain undefined values at shared corners).
    from: { x: a.x, z: a.z },
    to: { x: b.x, z: b.z },
    type: defaults.typeId,
    kind: defaults.kind,
    loc: defaults.loc,
    dimSide: defaults.dimSide,
    height: defaults.height,
    thickness: defaults.thickness,
    datum: defaults.datum,
    phase: defaults.phase,
  }, {
    domain: "planner",
    state: S,
    history: PLANNER_COMMAND_HISTORY,
    version: { current: currentHistoryId },
    services: { materializeWall: materializePlannerWall },
  }, { label: t("h_addRoom") });
  if (!result.ok) {
    flash(tTouch("hint_tool_rect"));
    return null;
  }
  var wallIds = result.created.filter(function (entry) { return entry.kind === "wall"; })
    .map(function (entry) { return entry.id; });
  var walls = S.walls.filter(function (wall) { return wallIds.indexOf(wall.id) >= 0; });
  S.dirty3D = true;
  render2D();
  refreshTree();
  window.dispatchEvent(new CustomEvent("planner-room-created", { detail: { walls: walls } }));
  return walls;
}

/* ---- preset rooms --------------------------------------------------------
   Drawing a flat one wall at a time asks the user to hold the whole plan in
   their head. Stamping asks them for one thing at a time: pick "bedroom",
   move it until it snaps against the wall it should share, click.

   Three pieces do that, and only the middle one lives here:

     js/room_presets.js  what a bedroom is (clear size, floor, door width)
     js/room_dock.js     where the rectangle wants to land, given the drawing
     js/room_graph.js    building it so the result is still a planar graph,
                         reusing the wall it landed against instead of laying a
                         second one on top of it

   This file only turns pointer positions into those calls and puts the result
   through the planner's own choreography — history, the 3D rebuild, the tree.

   The armed preset SURVIVES a placement. Laying out a flat is "bedroom,
   bedroom, bathroom, corridor", and going back to the palette between every
   one of those is the difference between a tool and a chore. Escape or the
   right button disarms it. */
export function armRoomStamp(presetId, options) {
  var preset = roomPreset(presetId);
  if (!preset) return null;
  var opts = options || {};
  S.roomStamp = {
    id: preset.id,
    checklistId: opts.checklistId || "",
    rot: Number(opts.rot) || 0,
    w: fin(opts.w) ? opts.w : preset.w,
    d: fin(opts.d) ? opts.d : preset.d,
    connMode: opts.connMode || (S.roomStamp && S.roomStamp.connMode) || "auto",
    doorWallIndex: opts.doorWallIndex != null ? Number(opts.doorWallIndex) : 0,
  };
  S.roomGhost = null;
  setTool("roomstamp");
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
  return S.roomStamp;
}

export function disarmRoomStamp() {
  S.roomStamp = null;
  S.roomGhost = null;
  S.roomPrepared = null;
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

/* R while stamping turns the rectangle a quarter turn — the preset's clear
   size swaps rather than the rectangle rotating, because a room stamped at 37
   degrees would dock against nothing. */
export function rotateRoomStamp() {
  if (!S.roomStamp) return;
  S.roomStamp.rot = (S.roomStamp.rot + 90) % 360;
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

export function setRoomStampConnMode(mode) {
  var st = S.roomStamp;
  if (!st) return;
  if (CONNECTION_MODES.indexOf(mode) === -1) return;
  st.connMode = mode;
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

export function cycleRoomStampConnMode() {
  var st = S.roomStamp;
  if (!st) return;
  var cur = st.connMode || "auto";
  var idx = CONNECTION_MODES.indexOf(cur);
  var next = CONNECTION_MODES[(idx + 1) % CONNECTION_MODES.length];
  setRoomStampConnMode(next);
}

export function flipRoomStampDoorWall() {
  var st = S.roomStamp;
  if (!st) return;
  st.doorWallIndex = ((st.doorWallIndex || 0) + 1) % 4;
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

/* Manual dimensions may fall below advisory furnishing preferences. */
export function resizeRoomStamp(dw, dd) {
  var st = S.roomStamp, preset = st && roomPreset(st.id);
  if (!preset) return;
  st.w = Math.max(20, st.w + (dw || 0));
  st.d = Math.max(20, st.d + (dd || 0));
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

export function setRoomStampSize(w, d) {
  var st = S.roomStamp;
  if (!st) return;
  if (fin(w)) st.w = Math.max(20, w);
  if (fin(d)) st.d = Math.max(20, d);
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp", { detail: { reason: "size" } }));
}

function roomStampSpec() {
  var defaults = resolveWallDrawDefaults();
  return {
    thickness: defaults.thickness,
    height: defaults.height,
    wallTypeId: defaults.typeId,
    kind: defaults.kind,
    loc: defaults.loc,
    dimSide: defaults.dimSide,
    datum: defaults.datum,
    phase: defaults.phase,
  };
}

/* Where the armed room would land if the click happened now. The dock solver
   gets first refusal; only when nothing is in reach does the grid have a say,
   because a room snapped to the grid but 3 cm off its neighbour is worse than
   one flush against it and off the grid. */
export function updateRoomGhost(px, pz) {
  var st = S.roomStamp;
  if (!st || !roomPreset(st.id)) { S.roomGhost = null; return null; }
  /* The ghost is a PREPARED PLAN, not a second opinion about where the room
     goes. Everything the click is about to do — the rectangle, the grid
     fallback, the dock, the refusal — is decided once, in
     js/commands/room_stamp.js, and drawn from the result. The two used to be
     separate pieces of arithmetic that happened to agree.

     A refusal still carries its rectangle (see that module), so a stamp over an
     existing room keeps a ghost to draw, in red, where the pointer is. */
  S.roomPrepared = prepareCommand(roomStampCommand, roomStampParams(px, pz), roomCommandEnvironment());
  var prep = S.roomPrepared;
  if (prep.ok) {
    var p = prep.plan.params;
    S.roomGhost = {
      rect: p.rect, dock: p.dock, preset: p.preset,
      corridor: p.corridor, size: p.size, blocked: null,
      connMode: p.connMode, doorWallIndex: p.doorWallIndex,
    };
  } else if (prep.rect) {
    S.roomGhost = {
      rect: prep.rect, dock: null, preset: st.id, corridor: null,
      size: rectInterior(prep.rect, roomStampSpec().thickness),
      blocked: prep.room != null ? prep.room : true,
      blockedReason: prep.reason || "ROOM_STAMP_FAILED",
      connMode: st.connMode || "auto", doorWallIndex: st.doorWallIndex || 0,
    };
  } else {
    S.roomGhost = null;
  }
  return S.roomGhost;
}

function roomStampParams(px, pz) {
  var st = S.roomStamp, spec = roomStampSpec();
  return {
    preset: st.id,
    checklistId: st.checklistId || "",
    x: px,
    z: pz,
    rot: st.rot,
    w: st.w,
    d: st.d,
    connMode: st.connMode || "auto",
    doorWallIndex: st.doorWallIndex != null ? st.doorWallIndex : 0,
    spec: spec,
  };
}

/* The planner's own services, on top of the shared agent environment: the face
   trace the overlap guard needs, and the wall split that re-homes openings. */
function roomCommandEnvironment() {
  var env = agentCommandEnvironment();
  env.services = Object.assign({}, env.services, {
    detectRooms: detectRooms,
    splitWall: splitPlannerWallAt,
  });
  return env;
}

export function commitRoomStamp() {
  var ghost = S.roomGhost, st = S.roomStamp, prepared = S.roomPrepared;
  if (!ghost || !st) return null;
  if (!prepared || !prepared.ok) {
    var prepareReason = prepared && prepared.reason;
    flash(prepareReason === "ROOM_OVERLAPS" ? t("rp_overlap")
      : t("rp_failed_reason", { reason: prepareReason || "ROOM_STAMP_FAILED" }), "error");
    return null;
  }
  /* Apply the plan the ghost was drawn from, rather than re-deriving it. The
     executor re-runs prepare and refuses if the two disagree, which is exactly
     the guarantee worth having here: what is committed is what was shown. */
  var result = executePrepared(prepared, roomCommandEnvironment(), { label: t("rp_placed") });
  if (!result.ok) {
    ghost.blocked = ghost.blocked || true;
    ghost.blockedReason = result.reason || "ROOM_STAMP_FAILED";
    S.roomPrepared = null;
    flash(result.reason === "ROOM_OVERLAPS" ? t("rp_overlap")
      : t("rp_failed_reason", { reason: result.reason || "ROOM_STAMP_FAILED" }), "error");
    render2D();
    return null;
  }
  var madeWallIds = result.created
    .filter(function (entry) { return entry.kind === "wall"; })
    .map(function (entry) { return entry.id; });
  // every wall the stamp built records its clear span, the same way a wall
  // drawn by hand does — otherwise the first dimension edit on one of them
  // has nothing to hold
  madeWallIds.forEach(function (id) {
    var w = wallById(id);
    if (!w) return;
    var clear = wallClearLength(w);
    if (clear > 0) w.clearL = clear;
  });
  var walls = S.walls.filter(function (w) { return madeWallIds.indexOf(w.id) >= 0; });
  reconcileRoomMeta();
  render2D();
  refreshTree();
  window.dispatchEvent(new CustomEvent("planner-room-created", { detail: { walls: walls } }));
  var dock = prepared.plan.params.dock;
  var opened = result.created.some(function (entry) { return entry.kind === "opening"; });
  var isConnOpen = prepared.plan.params.connMode === "open";
  /* Docked but unopened is worth saying out loud: it means the shared wall was
     too short, or too full, to take a door, and the room is sealed until the
     user cuts one. */
  flash(dock && isConnOpen ? t("rp_placedOpen")
    : dock && dock.mode === "corridor" ? t("rp_placedCorridor")
    : dock && dock.mode === "insert" ? t("rp_placedInsert")
    : opened ? t("rp_placedDocked")
    : dock ? t("rp_noDoor") : t("rp_placed"),
    dock && dock.mode !== "insert" && dock.mode !== "corridor" && !opened && !isConnOpen ? "error" : undefined);
  S.roomPrepared = null;
  if (st.checklistId) { disarmRoomStamp(); setTool("select"); }
  return result;
}

/* The planner's own wall split, in the shape js/room_graph.js asks for: cut at
   a point, hand back the node the halves now share. splitWallAt() re-homes
   openings, MEP devices, dimension locks and anchors onto that node, none of
   which the headless fallback in room_graph.js knows about. */
/* Follow a room that has just been dragged to its new key.
 *
   Its bounding walls change identity the moment it docks — one of them is now
   the neighbour's wall, another is half of what it was — so the key its name,
   floor and lock hang from stops naming anything. The generic repair in
   geometry.js cannot help here: it re-homes an orphan by the centroid the
   entry RECORDS, and a room that has just been dragged is no longer at the
   centroid it recorded. It is at the one the gesture just put it at, which is
   the only thing that knows.

   Also re-points the selection, because everything downstream in this
   pointerup — the corridor pass included — looks the room up by S.sel.ref. */
function rehomeDraggedRoom(drag, oldKey) {
  if (!oldKey) return;
  var meta = S.roomMeta[oldKey];
  var rooms = detectRooms();
  if (!meta || rooms.some(function (r) { return r.key === oldKey; })) return;
  var cx = 0, cz = 0, n = 0;
  (drag.orig || []).forEach(function (o) {
    var p = S.nodes[o.i];
    if (!p) return;
    cx += p.x; cz += p.z; n++;
  });
  if (!n) return;
  cx /= n; cz /= n;
  var home = rooms.find(function (r) {
    return !S.roomMeta[r.key] && pointInPolyR(cx, cz, r.pts);
  });
  if (!home) return;
  delete S.roomMeta[oldKey];
  meta.cx = home.cx;
  meta.cz = home.cz;
  S.roomMeta[home.key] = meta;
  if (S.sel && S.sel.kind === "room" && S.sel.ref === oldKey) S.sel.ref = home.key;
}

/* The edge handle under the pointer, for the room that is currently selected.
   The radius is in pixels so it stays grabbable at any zoom. */
function pickRoomEdge(px, pz) {
  if (!S.sel || S.sel.kind !== "room") return null;
  var reach = 11 / inputScale(), best = null;
  roomEdgeHandles(S.sel.ref).forEach(function (h) {
    var d = Math.hypot(h.x - px, h.z - pz);
    if (d <= reach && (!best || d < best.d)) best = Object.assign({ d: d }, h);
  });
  return best;
}

/* Keep a positive clear span; preset furnishing minima remain advisory. */
function roomEdgeLimit(key, handle) {
  var room = roomByKey(key);
  if (!room) return null;
  var clearMin = 20;
  var along = handle.axis === "x" ? "x" : "z";
  var lo = Infinity, hi = -Infinity;
  room.pts.forEach(function (p) {
    lo = Math.min(lo, p[along]);
    hi = Math.max(hi, p[along]);
  });
  var here = handle.axis === "x" ? handle.x : handle.z;
  // the side of the room this handle is NOT on
  var opposite = Math.abs(here - lo) < Math.abs(here - hi) ? hi : lo;
  return {
    axis: handle.axis,
    opposite: opposite,
    /* Which side of the far wall this one started on. Distance alone is not a
       limit: pushed far enough, the side sails straight through the opposite
       one and out the other side, and the room comes back the "right" size
       again — inside out, with its walls crossed. */
    sign: here >= opposite ? 1 : -1,
    minSpan: clearMin + (Number(handle.wall.thickness) || WALL_T),
  };
}

/* Build the hallway a room drag proposed, and open it at both ends.
 *
 * The corridor's two long walls are laid exactly on the faces they separate —
 * the dragged room's near side and the wall it stopped short of — so stampRect
 * finds both of them already standing and reports them as SHARED rather than
 * building a second wall on top of either. That is what makes the corridor a
 * space between two rooms instead of a box wedged between them, and it is why
 * the openings go through the shared walls rather than through anything new.
 *
 * Only ever called for a drop whose preview showed the corridor. */
function buildDragCorridor(drag) {
  var gap = drag && drag.corridor;
  if (!gap || !drag.dock || drag.dock.mode !== "corridor") return;
  var built = placeRoom(S, {
    preset: "corridor",
    rect: gap,
    spec: roomStampSpec(),
    dock: null,
    connect: false,
    // the gap between two rooms, by construction: nothing to overlap
    allowOverlap: true,
    detectRooms: detectRooms,
    splitWall: splitPlannerWallAt,
  });
  if (!built.ok) return;
  var live = detectRooms();
  var opened = 0;
  built.shared.forEach(function (id) {
    if (!wallById(id)) return;
    if (cutOpening(S, id, connectionForWall(S, id, live))) opened++;
  });
  built.created.forEach(function (id) {
    var w = wallById(id);
    if (!w) return;
    var clear = wallClearLength(w);
    if (clear > 0) w.clearL = clear;
  });
  S.dirty3D = true;
  reconcileRoomMeta();
  refreshTree();
  flash(opened ? t("rp_placedCorridor") : t("rp_placed"));
}

/* The walls a dragged room owns outright — both ends among the corners the
   gesture is moving. They are excluded from the dock solver, which would
   otherwise find the room's own far wall and pull it onto itself. */
function roomOwnWalls(drag) {
  var mine = {};
  (drag.orig || []).forEach(function (o) { mine[o.i] = 1; });
  var ids = new Set();
  S.walls.forEach(function (w) { if (mine[w.a] && mine[w.b]) ids.add(w.id); });
  return ids;
}

/* One space, one name. Merging a bathroom into a bedroom leaves two orphaned
   metadata entries whose centroids both fall inside the room that is left, and
   the generic reconciler in geometry.js hands the survivor whichever it reaches
   first — so knocking a cupboard through into a living room could rename the
   living room "Store". The room that contributed the most floor keeps its name,
   its finish and its lock; the smaller entry is dropped rather than left
   orphaned in the save. */
function adoptMergedRoomMeta(before) {
  var ranked = before.slice().sort(function (a, b) { return (b.area || 0) - (a.area || 0); });
  /* Through roomMetaKey, not S.roomMeta[key]. Today's caller hands over keys
     from a trace taken moments earlier, so they happen to be live — but the
     day a structural edit lands between the trace and the merge, reading by
     key alone silently makes the LARGER room the one with no metadata, and the
     small room's name wins. That is exactly how the open-mode merge broke. */
  var metaKeys = ranked.map(function (o) { return roomMetaKey(S, o); });
  var winner = metaKeys.map(function (k) { return k && S.roomMeta[k]; }).find(Boolean);
  if (!winner) return;
  var merged = detectRooms().find(function (r) {
    return before.every(function (o) { return o.key !== r.key; })
      && pointInPolyR(ranked[0].cx, ranked[0].cz, r.pts);
  });
  if (!merged) return;
  before.forEach(function (o) { delete S.roomMeta[o.key]; });
  metaKeys.forEach(function (k) { if (k) delete S.roomMeta[k]; });
  winner.cx = merged.cx;
  winner.cz = merged.cz;
  S.roomMeta[merged.key] = winner;
}

/* What happens when a room is DROPPED against another one.
 *
 * The drag itself only moves corners, so a room pushed up against its
 * neighbour arrives with two walls lying exactly on top of each other: one the
 * room brought, one the neighbour already had. That is not a party wall, it is
 * a defect — the face trace finds a zero-width room between them, the 3D view
 * builds both, and there is no single wall to hang a door on. It also looks
 * completely correct on screen, which is what makes it worth an explicit pass.
 *
 * So dropping finishes the join the drag implied, in the order the topology
 * needs:
 *
 *   1. a corner that landed in the MIDDLE of somebody else's wall splits it,
 *      turning a touch into a junction;
 *   2. corners that are now in the same place become one corner;
 *   3. two walls that now run between the same pair of corners become one —
 *      the survivor keeps the openings of both, because a door the user cut
 *      into either of them is a door they still want;
 *   4. and if that leaves a shared wall with nothing through it, the rooms get
 *      the door the gesture was obviously asking for.
 *
 * A drop that touches nothing does nothing here. */
function fuseDroppedRoom(drag) {
  if (!drag || !drag.orig || !drag.orig.length) return null;
  /* Corners the room owns. It GROWS: splitting one of the room's own walls
     gives it a new corner, and both halves are still the room's. */
  var mineNode = new Set(drag.orig.map(function (o) { return o.i; }));
  var isMine = function (w) { return mineNode.has(w.a) && mineNode.has(w.b); };

  // 1. somebody else's wall under one of my corners
  drag.orig.forEach(function (o) { cutUnder(o.i, function (w) { return !isMine(w); }); });
  /* 2. ...and MY wall under somebody else's corner, which is the same event
     seen from the other side. Cutting only one way looks symmetrical until the
     two walls are different lengths: drop a 330 cm corridor against a 310 cm
     room and none of the corridor's corners land inside the room's wall, so
     nothing was cut, nothing welded, and the two walls stayed overlapping —
     visibly joined, structurally two walls with a sliver between them. */
  var foreign = [], used = usedNodes();
  for (var uk in used) if (!mineNode.has(Number(uk))) foreign.push(Number(uk));
  foreign.forEach(function (ni) {
    var made = cutUnder(ni, isMine);
    if (made != null) mineNode.add(made);
  });

  /* Split whichever wall passing `accept` this corner is sitting in the middle
     of, and return the corner the two halves now share. One host per corner: a
     second pass would only find the half just made. */
  function cutUnder(ni, accept) {
    var p = S.nodes[ni];
    if (!p) return null;
    for (var k = 0; k < S.walls.length; k++) {
      var w = S.walls[k];
      if (!accept(w) || w.a === ni || w.b === ni) continue;
      var g = wallGeom(w), hit = wallProject(w, p.x, p.z);
      if (!g || !hit || !fin(g.L) || hit.distance > 2) continue;
      if (hit.s <= 2 || hit.s >= g.L - 2) continue;
      var cut = splitWallAt(w, hit.s);
      return fin(cut) ? cut : null;
    }
    return null;
  }
  weldCoincidentNodes();
  var fused = dedupeCoincidentWalls();
  if (!fused.length) return fused;
  S.dirty3D = true;
  reconcileRoomMeta();
  refreshTree();
  return fused;
}

/* Cut the connection through each wall the drop turned into a party wall.
 *
   Split out from the fuse, and run AFTER the dragged room has been re-keyed,
   because what the opening should BE is read off the two rooms' presets — and
   a room whose metadata key is still the pre-drop one looks, to that lookup,
   like a room with no preset at all. Doing this inside the fuse gave a corridor
   an 80 cm door instead of the passage it asks for. */
function connectFusedWalls(fused) {
  if (!fused || !fused.length) return;
  var live = detectRooms();
  var opened = 0;
  fused.forEach(function (id) {
    if (!wallById(id)) return;
    var made = cutOpening(S, id, connectionForWall(S, id, live));
    if (made) opened++;
  });
  if (opened) S.dirty3D = true;
  flash(opened ? t("rp_placedDocked") : t("rp_placed"));
}

/* Two walls between the same pair of corners are one wall. The survivor is the
   older one — it is the wall the rest of the drawing already refers to, in
   dimensions, in constraints and in whatever the user has selected. Returns
   the ids of the walls that turned out to be shared. */
function dedupeCoincidentWalls() {
  var byPair = {}, fused = [], dead = {};
  S.walls.forEach(function (w) {
    var lo = Math.min(w.a, w.b), hi = Math.max(w.a, w.b), key = lo + "_" + hi;
    var keep = byPair[key];
    if (!keep) { byPair[key] = w; return; }
    dead[w.id] = keep.id;
    if (fused.indexOf(keep.id) === -1) fused.push(keep.id);
  });
  if (!fused.length) return fused;
  /* The openings of the wall that goes come with it — but only where the
     survivor has room for them. Two rooms pushed together, each with a door in
     the wall they are about to share, is the ordinary case, and moving both
     doors across leaves two of them stacked at the same station: one wall, two
     coincident doors, drawn on top of each other and both real in 3D.

     Two passes, because one is not enough: the survivor's OWN openings have to
     be known before any are moved onto it. Checking against "everything seen so
     far" made the winner whichever door happened to come first in the array —
     which is to say, the wall that happened to be drawn first. */
  var staying = S.openings.filter(function (o) { return !dead[o.wall]; });
  var moved = [];
  S.openings.forEach(function (o) {
    if (!dead[o.wall]) return;
    var host = dead[o.wall];
    var taken = staying.concat(moved).some(function (q) {
      return q.wall === host && q.s + q.width / 2 > o.s - o.width / 2
        && q.s - q.width / 2 < o.s + o.width / 2;
    });
    if (taken) return; // the survivor already has a way through, there
    o.wall = host;
    moved.push(o);
  });
  S.openings = staying.concat(moved);
  S.walls = S.walls.filter(function (w) { return !dead[w.id]; });
  pruneCons();
  if (S.sel && S.sel.kind === "wall" && dead[S.sel.ref.id]) select(null);
  return fused;
}

function splitPlannerWallAt(state, wall, point) {
  var proj = wallProject(wall, point.x, point.z);
  if (!proj || !fin(proj.s)) return null;
  var ni = splitWallAt(wall, proj.s);
  return fin(ni) ? ni : null;
}

function commitSlabFromTo(a, b) {
  var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  var z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  if (x1 - x0 < 40 || z1 - z0 < 40) {
    flash(tTouch("hint_tool_slabvoid"));
    return null;
  }
  pushHistory();
  var o = openingFromRect(a, b);
  if (!o) return null;
  S.dirty3D = true;
  render2D();
  refreshTree();
  select({ kind: "slabvoid", ref: o });
  broadcastPlanOp({ type: "slabAdd", opening: JSON.parse(JSON.stringify(o)) });
  return o;
}

/* Replace a sharp shared corner with a true tangent arc.  Validation happens
   before history is pushed, so an infeasible radius never creates a ghost
   undo step.  The two original wall ids survive (important for dimensions and
   schedules); only their meeting ends move to the tangent points. */
export function filletSelectedWalls(radius) {
  var walls = S.sel && S.sel.kind === "walls" ? S.sel.refs : null;
  if (!walls || walls.length !== 2) return { ok: false, reason: "selection" };
  var proposal = proposeWallFillet(S, walls[0], walls[1], radius);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyWallFillet(S, walls[0], walls[1], radius, { makeId: uid });
  if (!result.ok) return result;
  captureLock(walls[0]); captureClear(walls[0]);
  captureLock(walls[1]); captureClear(walls[1]);
  captureLock(result.wall); captureClear(result.wall);
  pruneCons();
  S.dirty3D = true;
  select({ kind: "wall", ref: result.wall });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Cut back both arms by the same authored distance and bridge them with a
   straight semantic wall.  This is a wall operation, not a decorative line,
   so the diagonal participates in rooms, layers, schedules and 3D. */
export function chamferSelectedWalls(distance) {
  var walls = S.sel && S.sel.kind === "walls" ? S.sel.refs : null;
  if (!walls || walls.length !== 2) return { ok: false, reason: "selection" };
  var proposal = proposeWallChamfer(S, walls[0], walls[1], distance);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyWallChamfer(S, walls[0], walls[1], distance, { makeId: uid });
  if (!result.ok) return result;
  captureLock(walls[0]); captureClear(walls[0]);
  captureLock(walls[1]); captureClear(walls[1]);
  captureLock(result.wall); captureClear(result.wall);
  pruneCons();
  S.dirty3D = true;
  select({ kind: "wall", ref: result.wall });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Collapse a generated arc/diagonal connector and extend its two original
   arms back to their current line intersection. */
export function restoreSelectedSharpCorner() {
  var connector = S.sel && S.sel.kind === "wall" ? S.sel.ref : null;
  var proposal = proposeCornerRestore(S, connector);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyCornerRestore(S, connector);
  if (!result.ok) return result;
  result.arms.forEach(function (wall) { captureLock(wall); captureClear(wall); });
  pruneCons();
  S.dirty3D = true;
  select({ kind: "node", ref: result.jointNode });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Parametric edit/convert for a generated corner connector. */
export function updateSelectedCornerTreatment(type, value) {
  var connector = S.sel && S.sel.kind === "wall" ? S.sel.ref : null;
  var proposal = proposeCornerTreatmentUpdate(S, connector, type, value);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyCornerTreatmentUpdate(S, connector, type, value);
  if (!result.ok) return result;
  result.arms.forEach(function (wall) { captureLock(wall); captureClear(wall); });
  captureLock(result.wall); captureClear(result.wall);
  pruneCons();
  S.dirty3D = true;
  select({ kind: "wall", ref: result.wall });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Three-point circular wall: start, a point on the desired arc, then end.
   Endpoints participate in the normal topology/splitting model; the through
   point is geometric control only. */
export function arcWallPoint(p) {
  if (!p || !fin(p.x) || !fin(p.z)) return null;
  var draft = S.arcDraft;
  if (!draft) {
    p = resolveLanding(p, true);
    if (p.blockedOpening != null) { flash(t("wall_opening_blocked"), "error"); return null; }
    // Keep the first point detached until a complete arc can be committed.
    // Cancelling or switching views must not leave a node or split a host.
    S.arcDraft = { startNode: p.node ?? null, startPoint: { x: p.x, z: p.z }, through: null };
    S.previewPt = { x: p.x, z: p.z };
    render2D();
    return null;
  }
  if (!draft.through) {
    draft.through = { x: p.x, z: p.z };
    S.previewPt = { x: p.x, z: p.z };
    render2D();
    return null;
  }
  p = resolveLanding(p, true);
  if (p.blockedOpening != null) { flash(t("wall_opening_blocked"), "error"); return null; }
  var start = S.nodes[draft.startNode] || draft.startPoint, arc = makeArcFromThreePoints(start, draft.through, p);
  if (!arc) { flash(t("f_placeFail"), "error"); return null; }
  pushHistory();
  var startNode = draft.startNode ?? getOrMakeNode(resolveLanding(start, true));
  var endNode = getOrMakeNode(resolveLanding({ x: p.x, z: p.z }, true)), made = null;
  if (endNode !== startNode) {
    made = applyWallDrawDefaults({
      id: uid(), a: startNode, b: endNode, thickness: WALL_T, height: WALL_H,
      geometry: { type: "arc", bulge: arc.bulge },
    });
    S.walls.push(made);
    captureLock(made); captureClear(made);
  }
  S.arcDraft = { startNode: endNode, through: null };
  S.previewPt = { x: S.nodes[endNode].x, z: S.nodes[endNode].z };
  S.dirty3D = true;
  if (made) captureLock(made);
  render2D(); refreshTree();
  return made;
}

/* Place the next wall point at an exact length + absolute angle from the
   corner being drawn from. Degrees follow the inspector's ANGLE field —
   atan2(dz,dx), 0 = east, -90 = up the plan — so a length/angle pair typed
   here and the same pair read back off a selected wall are the same numbers. */
export function wallPointPolar(len, angDeg) {
  if (!S.drawing || S.drawFrom == null) return null;
  var a = S.nodes[S.drawFrom];
  if (!a || !fin(len) || len <= 0) return null;
  var r = (angDeg * Math.PI) / 180;
  /* A typed length is an INTERIOR measurement like every other length in the
     editor, so the corner this wall grows out of is added back before the far
     end is placed — type 300 next to a 10 cm wall and the finished wall reads
     300 inside, not 295. */
  var run = len + (S.interiorDims !== false ? pendingCuts(S.drawFrom, null) : 0);
  return wallPoint({
    x: a.x + Math.cos(r) * run,
    z: a.z + Math.sin(r) * run,
    node: null,
    wall: null,
  });
}

// smallest signed angular difference a-b, wrapped to [-π,π]
function angDelta(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
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

/* Every tolerance in snapPoint() goes through here, so the one strength
   control in the status bar moves them together and none can be left behind.
   Clamped because a strength of 0 would silently disable snapping while the
   chips still read "on", and anything past 2 makes the whole plan magnetic. */
function snapMul() {
  var m = S.snapStrength;
  return fin(m) ? clamp(m, 0.25, 2) : 1;
}
/* Wall-to-wall connections get a wider capture band than ordinary object
   snaps. At overview zoom a 10 cm wall face plus furniture drawn over it can
   sit well beyond the generic 14 px cursor radius, but ending a wall there is
   still unambiguously a connection. OSNAP remains the explicit off switch for
   intentional near-wall gaps. */
function wallJoinTolerance() {
  if (S.osnap === false) return 0;
  /* 30 cm is also the validator's definition of an endpoint "near another
     wall". If the plan would otherwise show the red near-wall open-end cross,
     placement resolves the connection instead. */
  return Math.min(50, Math.max(30, tolCm(28) * snapMul()));
}
// is this individual snap enabled? OSNAP is still the master switch for the
// two that pick geometry (corner / on-wall); the angular ones answer only to
// their own kind, exactly like a real CAD's separate OSNAP and POLAR.
function snapOn(kind) {
  var k = S.snapKinds;
  return !k || k[kind] !== false;
}

function wallLineIntersection(a, b) {
  var ga = wallGeom(a), gb = wallGeom(b),
    den = ga.dx * gb.dz - ga.dz * gb.dx;
  if (!fin(den) || Math.abs(den) < 1e-8) return null;
  var qx = gb.a.x - ga.a.x, qz = gb.a.z - ga.a.z,
    ta = (qx * gb.dz - qz * gb.dx) / den,
    tb = (qx * ga.dz - qz * ga.dx) / den;
  return {
    x: ga.a.x + ga.dx * ta, z: ga.a.z + ga.dz * ta,
    ta: ta, tb: tb, ga: ga, gb: gb,
  };
}

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
function kindGate(kind) {
  return SNAP_GATE[kind] || kind;
}

/* Is this wall near enough to the cursor to be worth intersecting? The
   intersection pass is the only O(walls²) work in the hot path, and it ran in
   full on every mouse move. A padded bounding-box test in front of it costs
   nothing and drops almost every pair on a large plan. */
function nearCursor(w, px, pz, pad) {
  var A = S.nodes[w.a], B = S.nodes[w.b];
  if (!A || !B) return false;
  return (
    px >= Math.min(A.x, B.x) - pad && px <= Math.max(A.x, B.x) + pad &&
    pz >= Math.min(A.z, B.z) - pad && pz <= Math.max(A.z, B.z) + pad
  );
}

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

/* When the user has demanded ONE kind for this click (see snapOverride), every
   other candidate is discarded rather than merely outranked. */
function overrideKind() {
  return S.snapOnly || null;
}

/* Exported for tests/snap_broad_phase.test.mjs, which pins the claim the whole
   broad phase rests on: widen every query to the entire model and the winner
   must not move. Nothing in the app imports it — the resolver is used by this
   file's own drag and draw paths. */
export function snapPoint(px, pz, fromIdx) {
  var origins =
    fromIdx == null ? [] : Array.isArray(fromIdx) ? fromIdx.slice() : [fromIdx];
  var mul = snapMul();
  var thr = (14 * mul) / inputScale();
  if (!isFinite(thr) || thr <= 0) thr = 14 * mul; // degenerate transform: fixed cm
  S.snapGuides = []; // recomputed below; stale guides must never linger
  S.snapInfo = null; // ditto — the HUD must never show the previous latch

  /* Snap radii are authored for a mouse and deliberately NOT widened by
     PICK_SLOP (see the note at the top of this file): they decide what the
     design becomes, not what you hit. Closing the loop you are drawing is the
     exception, and for the same reason wallJoinTolerance() is one — it is a
     CONNECTION, not a measurement. Nothing else can be within a fingertip of
     your own starting corner, so missing it by 4px cannot mean "put the corner
     here instead"; it means the finger is fatter than the mouse this radius
     was written for. Missing it left a loose stub and an unclosed room, which
     is the single most expensive miss in the whole touch drawing flow. */
  var REACH = { close: thr * PICK_SLOP };

  // Object snap off: corners and on-wall points stop attracting the cursor.
  // Angle + grid still apply below, exactly like OSNAP in a real CAD.
  var osnap = S.osnap !== false;
  var only = overrideKind();
  var cands = [];
  /* `kind` is the snap's name, `hit` its world point, `extra` whatever the
     caller needs to commit it (a node index, a wall + distance along it).
     Candidates outside the tolerance are dropped here so the ranking below
     only ever sees things the user could plausibly have been aiming at.
     `aim` is where the cursor is MEASURED from when that differs from where the
     point lands — a face snap is aimed at the face but commits to the
     centreline behind it (see the jamb block below). */
  function offer(kind, x, z, extra, aim) {
    if (!osnap) return;
    if (only ? only !== kind : !snapOn(kindGate(kind))) return;
    var ax = aim ? aim.x : x,
      az = aim ? aim.z : z;
    var d = Math.hypot(px - ax, pz - az);
    if (d > (REACH[kind] || thr)) return;
    cands.push({
      kind: kind, x: x, z: z, d: d,
      score: d * (inputScale() > 0 ? inputScale() : 1) - (SNAP_BONUS[kind] || 0),
      extra: extra || {},
    });
  }

  /* The broad phase. Everything below asks the shared grid for the handful of
     records near the cursor instead of walking S — see the "shared broad phase"
     block near the top of this file for why each radius is the one it is, and
     why nothing the exact tests below would have accepted can be missing from
     these lists. `wide` is the reach the two construction-geometry passes need:
     an intersection or an extension is offered from a wall that may be a whole
     extWindow away from the point it produces. */
  var extWindow = Math.max(100, thr * 8);
  var nearNodes = nearRecs(px, pz, thr, "node"),
    nearWalls = nearRecs(px, pz, thr, "wall"),
    wideWalls = nearRecs(px, pz, thr + extWindow, "wall"),
    nearItems = nearRecs(px, pz, thr, "item"),
    nearMarks = nearRecs(px, pz, thr, "marker"),
    nearOpens = nearRecs(px, pz, thr, "opening");

  // 1. existing corners
  nearNodes.forEach(function (rec) {
    if (origins.indexOf(rec.id) !== -1) return;
    var n = S.nodes[rec.id];
    if (n) offer("corner", n.x, n.z, { node: rec.id });
  });
  if (S.tool === "wall" && S.drawing && S.drawStart != null &&
      (S.drawWalls || []).length >= 2 && origins.indexOf(S.drawStart) === -1) {
    var st = S.nodes[S.drawStart];
    if (st) offer("close", st.x, st.z, { node: S.drawStart });
  }

  /* 2. placeholder points. These were measurable but not aimable: a point
     could anchor a dimension while being impossible to actually draw a wall
     onto, which defeats most of the reason to place one. They are datums, so
     they rank alongside corners. */
  nearMarks.forEach(function (rec) {
    var m = rec.ref;
    if (!m || !fin(m.x) || !fin(m.z)) return;
    offer("marker", m.x, m.z, {});
  });

  // The two calibration picks are real datums on the sheet. Offering them to
  // the normal OSNAP resolver makes the first traced wall land exactly on the
  // measured endpoints while every existing angle/alignment guide remains in
  // force for the rest of the run.
  if (S.blueprintTrace && S.blueprintTrace.visible !== false)
    (S.blueprintTrace.guidePoints || []).forEach(function (p) {
      if (p && fin(p.x) && fin(p.z)) offer("blueprint", p.x, p.z, {});
    });

  // 3. wall midpoints — a frequent architectural datum that should not need
  // eyeballing or a temporary half-length dimension.
  nearWalls.forEach(function (rec) {
    var w = rec.ref;
    if (origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w), midpoint = wallPointAt(w, g.L / 2);
    offer("midpoint", midpoint.x, midpoint.z,
      { wall: w, s: g.L / 2 });
  });

  /* A wall can terminate at an opening jamb, but not in the empty opening.
     Make both jambs first-class snap targets so this valid connection is just
     as easy to hit as a midpoint or an endpoint.

     Snap the new wall's FACE to the jamb, not its centreline — the surface
     snapping Chief Architect does, and the only version that leaves the opening
     alone. Landing the centreline on the jamb puts half a wall thickness inside
     the passage, so opening 86 and drawing a bay off both jambs used to give a
     74 cm way through with a half-thickness reveal down each side. Landing it
     half a thickness back into the SOLID side instead butts the wall against
     the host's face with its own face continuing the reveal, and the 86 stays
     86. The cursor is still measured against the jamb itself: that is the line
     being aimed at, and at any real zoom the offset centreline is further away
     than the snap tolerance. */
  var faceBack = drawFaceBack();
  nearOpens.forEach(function (rec) {
    var o = rec.ref;
    var w = wallById(o.wall);
    if (!w || origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w), half = Math.max(0, o.width || 0) / 2;
    [[o.s - half, -1], [o.s + half, 1]].forEach(function (jamb) {
      var s = jamb[0];
      if (s <= 1 || s >= g.L - 1) return;
      // backing off the jamb always moves AWAY from the opening, so the only
      // thing to guard is running off the end of the host wall
      var sc = clamp(s + jamb[1] * faceBack, 0, g.L);
      var backed = wallPointAt(w, sc), jambPoint = wallPointAt(w, s);
      offer("jamb", backed.x, backed.z, { wall: w, s: sc }, jambPoint);
    });
  });

  /* 4. furniture footprints. The wall tool ignored items entirely, so drawing
     a partition flush to an existing cabinet run was done by eye even though
     dragging the cabinet itself has snapped to walls for ages. The four
     rotated corners and the centre are offered; edge midpoints are not, or a
     large sofa carpets the plan in snap targets. */
  nearItems.forEach(function (rec) {
    var it = rec.ref;
    if (!it || it.locked) return;
    var a = ((it.rot || 0) * Math.PI) / 180,
      ca = Math.cos(a), sa = Math.sin(a),
      hw = (it.w || 0) / 2, hd = (it.d || 0) / 2;
    offer("itemCorner", it.x, it.z, {});
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      var lx = q[0] * hw, lz = q[1] * hd;
      offer("itemCorner", it.x + lx * ca - lz * sa, it.z + lx * sa + lz * ca, {});
    });
  });

  // 5. real or nearby virtual intersections. A real crossing carries every
  // wall it lies on so committing the point splits and welds all of them.
  for (var ia = 0; ia < wideWalls.length; ia++) {
    var wa = wideWalls[ia].ref;
    if (origins.indexOf(wa.a) !== -1 || origins.indexOf(wa.b) !== -1) continue;
    /* Only wall pairs whose bounding boxes come near the cursor are tested.
       The nested loop used to run over every pair on every mouse move, which
       is fine at thirty walls and not at three hundred. The grid narrows the
       list the pairs are drawn from; nearCursor stays because it is the exact
       window this pass is specified in terms of, and because wideWalls is a
       superset of what it accepts. Records are in S.walls order, so ia < ib
       still enumerates each unordered pair exactly once, the same way round. */
    if (!nearCursor(wa, px, pz, extWindow)) continue;
    for (var ib = ia + 1; ib < wideWalls.length; ib++) {
      var wb = wideWalls[ib].ref;
      if (origins.indexOf(wb.a) !== -1 || origins.indexOf(wb.b) !== -1) continue;
      if (!nearCursor(wb, px, pz, extWindow)) continue;
      var ip = wallLineIntersection(wa, wb);
      if (!ip) continue;
      var beyondA = ip.ta < 0 ? -ip.ta * ip.ga.L : ip.ta > 1 ? (ip.ta - 1) * ip.ga.L : 0,
        beyondB = ip.tb < 0 ? -ip.tb * ip.gb.L : ip.tb > 1 ? (ip.tb - 1) * ip.gb.L : 0;
      if (beyondA > extWindow || beyondB > extWindow) continue;
      var land = [];
      if (ip.ta > 0.001 && ip.ta < 0.999) land.push({ id: wa.id });
      if (ip.tb > 0.001 && ip.tb < 0.999) land.push({ id: wb.id });
      offer("intersection", ip.x, ip.z, { walls: land });
    }
  }

  // 6. perpendicular foot from any active origin to a wall segment.
  origins.forEach(function (oi) {
    var O = S.nodes[oi];
    if (!O) return;
    nearWalls.forEach(function (rec) {
      var w = rec.ref;
      if (w.a === oi || w.b === oi) return;
      var g = wallGeom(w), foot = wallProject(w, O.x, O.z), s = foot && foot.s;
      if (s <= 1 || s >= g.L - 1) return;
      offer("perpendicular", foot.x, foot.z, { wall: w, s: s });
    });
  });

  // 7. a point ON a wall — without this you can only ever connect to a corner,
  // so a wall drawn across a room left floating endpoints, never split what it
  // crossed, and produced no new rooms.
  nearWalls.forEach(function (rec) {
    var w = rec.ref;
    // a wall we are drawing FROM is not a valid landing target
    if (origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w);
    if (!fin(g.L) || g.L <= 0) return;
    var projected = wallProject(w, px, pz), s = projected && projected.s;
    if (s <= 1 || s >= g.L - 1) return; // ends belong to the corner snap above
    var opening = openingAtWallPosition(w, s, 0.05);
    offer(
      opening ? "openingBlocked" : "wall",
      projected.x,
      projected.z,
      { wall: w, s: s, blockedOpening: opening ? opening.id : null },
    );
  });

  // 8. wall extension line. Unlike an on-wall snap this is construction
  // geometry only: it does not lengthen the reference wall automatically.
  wideWalls.forEach(function (rec) {
    var w = rec.ref;
    if (origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w);
    if (g.kind === "arc") return; // a finite arc has no single straight extension ray
    var s = (px - g.a.x) * g.ux + (pz - g.a.z) * g.uz;
    if (s >= 0 && s <= g.L) return;
    if (s < -extWindow || s > g.L + extWindow) return;
    offer("extension", g.a.x + g.ux * s, g.a.z + g.uz * s, {});
  });

  /* Rank. Sorting rather than tracking a running best because the HUD's Tab
     key cycles through the alternatives under the cursor, which needs the
     whole ordered list, not just its head. */
  if (cands.length) {
    cands.sort(function (a, b) { return a.score - b.score; });
    S.snapAlts = cands.slice(0, 6).map(function (c) {
      return { kind: c.kind, x: c.x, z: c.z };
    });
    /* Tab steps the choice down the ranked list for as long as the same set
       of candidates stays under the cursor. */
    var pickIdx = 0;
    if (fin(S.snapCycle) && S.snapCycle > 0) pickIdx = S.snapCycle % cands.length;
    var win = cands[pickIdx];
    S.snapInfo = { type: win.kind, x: win.x, z: win.z, alts: cands.length };
    return {
      x: win.x, z: win.z,
      node: win.extra.node != null ? win.extra.node : null,
      wall: win.extra.wall || null,
      s: win.extra.s,
      walls: win.extra.walls,
      blockedOpening: win.extra.blockedOpening,
    };
  }
  S.snapAlts = [];

  // 7. angle snap from the origin corner(s)
  if (origins.length) {
    /* The one consumer of the FULL corner set that survives the broad phase.
       An alignment run is a ray from the origin, not a disc around the cursor —
       the corner it lines up with can be anywhere on the plan — so there is no
       radius to query with and the whole set is genuinely needed. It is read
       here rather than at the top of the function because everything above
       returns before reaching it whenever an object snap wins. */
    var u = usedNodes();
    var pick = null;
    origins.forEach(function (oi) {
      var a = S.nodes[oi];
      if (!a) return;
      var dx = px - a.x,
        dz = pz - a.z,
        len = Math.hypot(dx, dz);
      if (len <= 1) return;
      var raw = Math.atan2(dz, dx);
      /* A direction that runs straight along a wall ALREADY leaving this
         corner is not a direction: the new segment would lie on top of that
         wall, which is the 0° joint the constraint engine complains about
         afterwards. Ortho makes it especially easy to hit — 0° is a perfectly
         good multiple of 90° — so it is ruled out here, at the aim, instead of
         being reported once the damage is done. Only the SAME direction is
         blocked; the opposite one (180°, a straight run through the corner) is
         how a split wall continues and stays available. */
      var folds = armAngles(oi, origins);
      function foldBlocked(c) {
        for (var fi = 0; fi < folds.length; fi++)
          if (Math.abs(angDelta(c, folds[fi])) < FOLD_TOL) return true;
        return false;
      }
      var ang = raw,
        bestDiff = 1e9,
        angLocked = false,
        chosenKind = "free";
      if (S.ortho) {
        var oAng = Math.round(raw / (Math.PI / 2)) * (Math.PI / 2);
        // blocked quarter turn -> take the nearest one that is free rather
        // than silently drawing the overlap
        if (foldBlocked(oAng)) {
          var alt = null,
            altD = 1e9;
          for (var qi = 0; qi < 4; qi++) {
            var qa = qi * (Math.PI / 2);
            if (foldBlocked(qa)) continue;
            var qd = Math.abs(angDelta(raw, qa));
            if (qd < altD) {
              altD = qd;
              alt = qa;
            }
          }
          if (alt != null) oAng = alt;
        }
        ang = oAng;
        bestDiff = 0;
        angLocked = true;
        chosenKind = "ortho";
      } else {
        // Candidates: every 15°, PLUS the direction of every existing wall (both
        // ways). World-absolute 15°s alone made it impossible to continue or
        // parallel an angled wall — e.g. an imported site footprint at 7°.
        var incAng = raw,
          incDiff = 1e9;
        if (snapOn("inc")) for (var deg = 0; deg < 360; deg += 15) {
          var c = (deg * Math.PI) / 180,
            df = Math.abs(angDelta(raw, c));
          if (foldBlocked(c)) continue;
          if (df < incDiff) {
            incDiff = df;
            incAng = c;
          }
        }
        var wallAng = raw,
          wallDiff = 1e9,
          wallKind = "angle";
        if (snapOn("bisector") && folds.length >= 2) {
          for (var bi = 0; bi < folds.length; bi++) for (var bj = bi + 1; bj < folds.length; bj++) {
            var f1 = folds[bi], f2 = folds[bj], delta = angDelta(f2, f1),
              bis = f1 + delta / 2;
            [bis, bis + Math.PI].forEach(function (c) {
              var df = Math.abs(angDelta(raw, c));
              if (!foldBlocked(c) && df < wallDiff) {
                wallDiff = df; wallAng = c; wallKind = "bisector";
              }
            });
          }
        }
        if (snapOn("walldir")) S.walls.forEach(function (w) {
          var g = wallGeom(w);
          if (!fin(g.ang)) return;
          [g.ang, g.ang + Math.PI].forEach(function (c) {
            var df = Math.abs(angDelta(raw, c));
            if (foldBlocked(c)) return;
            if (df < wallDiff) {
              wallDiff = df;
              wallAng = c;
              wallKind = "angle";
            }
          });
        });
        var incOk = incDiff < INC_TOL * mul,
          wallOk = wallDiff < WALL_TOL * mul;
        // Outside BOTH gates the pointer's own angle is kept, so an off-increment
        // wall is drawable at all — the snap used to be unconditional.
        if (incOk && (!wallOk || incDiff <= wallDiff)) {
          ang = incAng;
          bestDiff = incDiff;
          angLocked = true;
          chosenKind = "angle";
        } else if (wallOk) {
          ang = wallAng;
          bestDiff = wallDiff;
          angLocked = true;
          chosenKind = wallKind;
        }
      }
      /* Free aim is still not allowed to fold the wall back onto its
         neighbour: pushed off to the edge of the blocked wedge, so the segment
         gets as close as it can without becoming the overlap. */
      if (foldBlocked(ang)) {
        var near = folds[0],
          nearD = 1e9;
        folds.forEach(function (f) {
          var d0 = Math.abs(angDelta(ang, f));
          if (d0 < nearD) {
            nearD = d0;
            near = f;
          }
        });
        ang = near + (angDelta(ang, near) >= 0 ? FOLD_TOL : -FOLD_TOL);
      }
      // Round the distance ALONG the ray. Rounding x and z independently (as
      // this used to) pushes the point back off the angle it just snapped to,
      // which cost up to ~0.5° whenever the origin corner was itself off-grid.
      var L = S.gsnap === false
        ? len
        : Math.max(SNAP_GRID, Math.round(len / SNAP_GRID) * SNAP_GRID);

      /* Alignment inference: slide along the ray to the exact length where the
         endpoint lines up with an existing corner or opening jamb, horizontally or vertically.
         This is what makes "draw the opposite wall and stop level with that
         corner" a single confident gesture instead of eyeballing the grid —
         the ray already fixes the 90°, this fixes where it ends. */
      var ux = Math.cos(ang),
        uz = Math.sin(ang),
        alignTol = (12 * mul) / inputScale();
      if (!isFinite(alignTol) || alignTol <= 0) alignTol = 12 * mul;
      var bestT = null,
        bestGap = alignTol;

      var alignTargets = [];
      for (var nk in u) {
        var q = S.nodes[nk];
        if (!q || origins.indexOf(+nk) !== -1) continue;
        alignTargets.push({ x: q.x, z: q.z });
      }
      var faceBack = drawFaceBack();
      (S.openings || []).forEach(function (o) {
        var w = wallById(o.wall);
        if (!w || origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
        var g = wallGeom(w), half = Math.max(0, o.width || 0) / 2;
        [[o.s - half, -1], [o.s + half, 1]].forEach(function (jamb) {
          var s = jamb[0];
          if (s <= 1 || s >= g.L - 1) return;
          var sc = clamp(s + jamb[1] * faceBack, 0, g.L);
          alignTargets.push(wallPointAt(w, sc));
        });
      });

      if (snapOn("align")) for (var ti = 0; ti < alignTargets.length; ti++) {
        var q = alignTargets[ti];
        // where the ray's x reaches q.x, and where its z reaches q.z
        if (Math.abs(ux) > 1e-6) {
          var tx = (q.x - a.x) / ux;
          if (tx > 1 && Math.abs(tx - L) < bestGap) {
            bestGap = Math.abs(tx - L);
            bestT = tx;
          }
        }
        if (Math.abs(uz) > 1e-6) {
          var tz = (q.z - a.z) / uz;
          if (tz > 1 && Math.abs(tz - L) < bestGap) {
            bestGap = Math.abs(tz - L);
            bestT = tz;
          }
        }
      }
      var guides = [];
      if (bestT != null) {
        L = bestT;
        var fx = a.x + ux * L,
          fz = a.z + uz * L;
        // every corner/jamb the endpoint now lines up with gets its own guide
        for (var ti2 = 0; ti2 < alignTargets.length; ti2++) {
          var q2 = alignTargets[ti2];
          if (Math.abs(q2.x - fx) < 0.5 || Math.abs(q2.z - fz) < 0.5)
            guides.push({ x1: q2.x, z1: q2.z, x2: fx, z2: fz });
        }
      }

      var cand = {
        x: a.x + Math.cos(ang) * L,
        z: a.z + Math.sin(ang) * L,
        node: null,
        wall: null,
        d: bestDiff,
        ang: ang,
        kind: S.ortho ? "ortho" : guides.length ? "align" : angLocked ? chosenKind : "free",
        guides: guides,
      };
      if (!pick || cand.d < pick.d) pick = cand;
    });
    if (pick) {
      S.snapGuides = pick.guides;
      S.snapInfo = { type: pick.kind, x: pick.x, z: pick.z, ang: pick.ang };
      return { x: pick.x, z: pick.z, node: null, wall: null };
    }
  }

  // 10. plain grid
  var gx = S.gsnap === false ? px : Math.round(px / SNAP_GRID) * SNAP_GRID,
    gz = S.gsnap === false ? pz : Math.round(pz / SNAP_GRID) * SNAP_GRID;
  S.snapInfo = { type: S.gsnap === false ? "free" : "grid", x: gx, z: gz };
  return { x: gx, z: gz, node: null, wall: null };
}

function snapWallPoint(px, pz, fromIdx) {
  var p = snapPoint(px, pz, fromIdx);
  if (!(S.tool === "wall" && S.drawing && fromIdx != null)) return p;
  var origin = S.nodes[fromIdx];
  if (!origin) return p;
  p = applyDrawDirLock(origin, p);
  if (p.node != null || p.wall || (p.walls && p.walls.length)) return p;
  var hit = extendToHit(origin, p, wallJoinTolerance());
  if (!hit) return p;
  S.snapInfo = { type: "hit", x: hit.x, z: hit.z, alts: (S.snapInfo && S.snapInfo.alts) || 1 };
  return { x: hit.x, z: hit.z, node: null, wall: hit.wall, s: hit.s };
}

/* ---- picking the far side of a new dimension ----------------------------
   startConPick() is called by the wall inspector with the wall the dimension
   belongs to and which kind is being authored; the next click on the plan
   resolves the target and creates the constraint. Everything about WHAT gets
   picked is decided here rather than in the UI module, because only this file
   knows how a plan coordinate becomes a corner, a wall or a reference point. */
export function startConPick(kind, wall, end, report = false) {
  if (!wall) return false;
  S.conPick = { kind: kind, wall: wall.id, end: end === "b" ? "b" : "a", report: !!report };
  setTool("select");
  render2D();
  return true;
}

/* Armed pick for "line this opening up with that one": the second opening is
   a piece of geometry on another wall, so it is clicked, not chosen from a
   list. */
export function startOpeningAlignPick(opening, axis) {
  if (!opening) return false;
  S.conPick = { kind: "openAlign", opening: opening.id, axis: axis === "z" ? "z" : "x" };
  setTool("select");
  render2D();
  fillProps();
  return true;
}

/* The same armed-pick flow, started from a pair of selected CORNERS instead of
   a selected wall. Symmetry is the case that needs it: two corners are only
   half the relation — the mirror line is a third piece of geometry, and there
   is no honest way to name a wall in a dropdown. */
export function startNodeConPick(kind, nodes) {
  if (!nodes || nodes.length !== 2) return false;
  S.conPick = { kind: kind, nodes: nodes.slice() };
  setTool("select");
  render2D();
  fillProps();
  return true;
}
export function endConPick(msg) {
  S.conPick = null;
  if (msg) flash(msg, "error");
  render2D();
  fillProps();
}
export function conPickActive() {
  return !!S.conPick;
}

function finishConPick(px, pz) {
  var pick = S.conPick;

  /* An opening-alignment pick resolves against another OPENING, not a wall or
     a corner, so it is answered before either of those hit tests. */
  if (pick.kind === "openAlign") {
    var other = hitOpening(px, pz);
    if (!other || other.id === pick.opening) return endConPick(t("wc_needOpening"));
    pushHistory();
    var alignMade = addOpeningAlign(pick.opening, other.id, pick.axis);
    if (!alignMade) return endConPick(t("wc_failed"));
    S.conPick = null;
    var openResult = solveWallCons();
    S.dirty3D = true;
    render2D();
    fillProps();
    refreshTree();
    renderWarnPanel(true);
    flash(openResult.unresolved
      ? t("wc_unresolved", { n: openResult.unresolved })
      : t("wc_added", { v: t("wc_openAlign") }), openResult.unresolved ? "error" : undefined);
    return;
  }

  /* Picks armed from a corner pair resolve their third piece of geometry
     here. Handled before the wall-based picks below because these carry no
     `wall` at all — they were started from a selection of corners. */
  if (pick.nodes) {
    var axisWall = hitWall(px, pz);
    if (!axisWall) return endConPick(t("wc_needWall"));
    pushHistory();
    var symA = ownedNodeAnchor(pick.nodes[0]),
      symB = ownedNodeAnchor(pick.nodes[1]),
      symMade = addSymmetric(symA, symB, {
        k: pick.kind === "symmetricPerp" ? "perp" : "wall",
        id: axisWall.id,
      });
    if (!symMade) return endConPick(t("wc_failed"));
    S.conPick = null;
    var symResult = solveWallCons();
    S.dirty3D = true;
    render2D();
    fillProps();
    refreshTree();
    renderWarnPanel(true);
    flash(symResult.unresolved
      ? t("wc_unresolved", { n: symResult.unresolved })
      : t("wc_added", { v: t("wc_addSymmetric") }), symResult.unresolved ? "error" : undefined);
    return;
  }

  var w = wallById(pick.wall);
  if (!w) return endConPick(null);
  pushHistory();
  var made = null;

  if (pick.kind === "dist") {
    // a corner first, then a reference point — the two things a distance can
    // sensibly be measured to. A bare wall has no single point to measure to.
    var ni = hitNode(px, pz),
      target = null;
    if (ni != null) {
      var own = S.walls.find(function (q) {
        return q.a === ni || q.b === ni;
      });
      if (own) target = { k: "wall", id: own.id, end: own.a === ni ? "a" : "b" };
    }
    if (!target) {
      var mk = hitMarker(px, pz, inputScale());
      if (mk) target = { k: "marker", id: mk.id };
    }
    if (!target) return endConPick(t("wc_needPoint"));
    var from = { k: "wall", id: w.id, end: pick.end };
    // the wall's own end must not be measured to itself
    if (target.k === "wall" && target.id === w.id && target.end === pick.end)
      return endConPick(t("wc_needPoint"));
    // hold the TARGET and drive this wall's corner: the user selected this
    // wall, so this wall is the thing they expect to move
    made = addDistance(target, from, null, "a");
  } else if (pick.kind === "angle") {
    var other = hitWall(px, pz);
    if (!other || other.id === w.id) return endConPick(t("wc_needWall"));
    // the joint is whichever corner the two walls share
    var shared = null;
    [w.a, w.b].forEach(function (n) {
      if (other.a === n || other.b === n) shared = n;
    });
    if (shared == null) return endConPick(t("wc_needJoint"));
    var jointAn = { k: "wall", id: w.id, end: w.a === shared ? "a" : "b" };
    // the wall that was clicked is held; the selected one swings
    made = addJointAngle(jointAn, other.id, w.id, null);
  } else if (pick.kind === "offset") {
    var ref = hitWall(px, pz);
    if (!ref || ref.id === w.id) return endConPick(t("wc_needWall"));
    made = addOffset(w.id, ref.id, null);
  } else if (pick.kind === "pointWall") {
    var distRef = hitWall(px, pz);
    if (!distRef || distRef.id === w.id) return endConPick(t("wc_needWall"));
    made = addPointWallDistance(nodeAnchor(pick.end === "b" ? w.b : w.a, w.id, pick.end), distRef.id);
  } else if (pick.kind === "wallAngle") {
    var angRef = hitWall(px, pz);
    if (!angRef || angRef.id === w.id) return endConPick(t("wc_needWall"));
    made = addWallAngle(w.id, angRef.id, null);
  } else if (pick.kind === "midpoint" || pick.kind === "pointOnLine") {
    var lineRef = hitWall(px, pz);
    if (!lineRef || lineRef.id === w.id) return endConPick(t("wc_needWall"));
    var cornerAn = nodeAnchor(pick.end === "b" ? w.b : w.a, w.id, pick.end);
    made = pick.kind === "midpoint"
      ? addMidpoint(cornerAn, lineRef.id)
      : addPointOnLine(cornerAn, lineRef.id);
  } else {
    var relationRef = hitWall(px, pz);
    if (!relationRef || relationRef.id === w.id) return endConPick(t("wc_needWall"));
    made = addWallRelation(pick.kind, w.id, relationRef.id);
  }

  if (!made) return endConPick(t("wc_failed"));
  if (pick.report) setConReport(made.id, true);
  S.conPick = null;
  /* Numeric dimensions are seeded from the geometry as drawn. Geometric
     relations (parallel/perpendicular/etc.) still need a solve here; without
     it they were created red and inert until some unrelated later edit. */
  var madeResult = solveWallCons();
  S.dirty3D = true;
  render2D();
  fillProps();
  refreshTree();
  renderWarnPanel(true);
  flash(madeResult.unresolved
    ? t("wc_unresolved", { n: madeResult.unresolved })
    : t("wc_added", { v: Math.round(conCurrent(made) || 0) }), madeResult.unresolved ? "error" : undefined);
}

/* Which half of `w` the point (px,pz) falls in — "a" (the a-end half) or "b".
   Used by the plan to let you pick which end a typed length edit moves. */
export function wallHalfAt(w, px, pz) {
  var g = wallGeom(w), projected = wallProject(w, px, pz);
  return (!projected || projected.s < g.L / 2) ? "a" : "b";
}

/* Split `w` at distance `s` from its a-end and return the new middle node.
   Everything that rides the wall parametrically has to be re-homed: openings
   keep their position by moving to whichever half now contains them, and MEP
   devices do the same (they resolve through `wall`+`s`, so leaving them on the
   shortened wall would slide them along it). */
function splitWallAt(w, s) {
  stabilizeOpeningCornerRefs(w);
  prepareStableAnchors();
  var g = wallGeom(w), splitPoint = wallPointAt(w, s), original = JSON.parse(JSON.stringify(w));
  var ni = S.nodes.push({ x: splitPoint.x, z: splitPoint.z }) - 1;
  var oldB = w.b;
  w.b = ni;
  var w2 = {
    id: uid(),
    a: ni,
    b: oldB,
    thickness: w.thickness,
    height: w.height,
    tex: w.tex,
  };
  ["wallTypeId", "layers", "layersReversed", "datum", "kind", "phase",
   "upperWallTypeId", "splitHeight", "profile", "railing", "join",
   "layerOverrides", "dimSide", "loc"].forEach(function (key) {
    if (original[key] !== undefined) w2[key] = JSON.parse(JSON.stringify(original[key]));
  });
  if (g.kind === "arc" && g.curve) {
    var fraction = clamp(s / g.L, 0, 1), sweepA = g.curve.sweep * fraction,
      sweepB = g.curve.sweep - sweepA;
    w.geometry = { type: "arc", bulge: Math.tan(sweepA / 4) };
    w2.geometry = { type: "arc", bulge: Math.tan(sweepB / 4) };
  }
  S.walls.push(w2);
  rehomeAnchorOwner(oldB, w.id, w2.id, "b");
  // both halves are new dimensions the user asked for, so they hold THOSE —
  // leaving w's old full length recorded would make the next unrelated edit
  // try to restore a wall that is deliberately half as long now
  captureLock(w);
  captureLock(w2);
  // ...and neither half is holding the parent's interior span any more
  captureClear(w);
  captureClear(w2);
  S.openings.forEach(function (o) {
    if (o.wall !== w.id) return;
    if (o.s > s) {
      o.wall = w2.id;
      o.s -= s;
    }
  });
  S.openings.forEach(function (o) {
    var host = o.wall === w.id ? w : o.wall === w2.id ? w2 : null;
    if (!host) return;
    var length = wallGeom(host).L;
    var width = Math.max(0, Number(o.width) || 0);
    if (width > length) { width = length; o.width = width; }
    var half = width / 2;
    o.s = Math.max(half, Math.min(Math.max(half, length - half), Number(o.s) || 0));
  });
  if (S.mep && S.mep.nodes)
    S.mep.nodes.forEach(function (n) {
      if (n.wall !== w.id || !fin(n.s)) return;
      if (n.s > s) {
        n.wall = w2.id;
        n.s -= s;
      }
    });
  return ni;
}

/* A landing point resolved against reality BEFORE anything is built.

   Landing ON a wall splits it — but a split a few centimetres from that wall's
   own corner leaves a stub shorter than the wall is thick: a "wall" with no
   interior length at all, a junction that cannot be drawn, and (because the
   parent wall is now two walls with no stated dimension between them) a plan
   whose numbers quietly change. Anything closer to an end than the wall's own
   thickness is therefore the CORNER, not a split — which is what the user was
   aiming at anyway. */
export function resolveLanding(p, options) {
  if (!p || p.node != null) return p;
  var autoJoin = typeof options === "object" ? options.autoJoin !== false : !!options;
  var exclude = typeof options === "object" && Array.isArray(options.exclude)
    ? options.exclude.slice()
    : S.drawing && S.drawFrom != null ? [S.drawFrom] : [];
  /* Chief-style wall intersection: a click visibly beside a wall still joins
     the wall when it lands within a small screen-aware capture band. This is
     intentionally a COMMIT rule, not only a cursor snap—the cursor may have
     preferred a nearby cabinet corner, grid point or angle alignment, but a
     wall endpoint touching an existing wall must become shared topology rather
     than a coincident-looking loose end. */
  if (autoJoin && !p.wall && !(p.walls && p.walls.length)) {
    var joinTol = wallJoinTolerance(),
      near = nearestWallLanding(
        p.x,
        p.z,
        joinTol,
        exclude,
      );
    if (near) {
      var blocked = openingAtWallPosition(near.wall, near.s, 0.05);
      p = {
        x: near.x,
        z: near.z,
        node: null,
        wall: near.wall,
        s: near.s,
        blockedOpening: blocked ? blocked.id : null,
      };
    }
  }
  if (!p.wall) return p;
  var g = wallGeom(p.wall),
    s = fin(p.s) ? p.s : (p.x - g.a.x) * g.ux + (p.z - g.a.z) * g.uz,
    tol = Math.max(p.wall.thickness || 0, 6);
  if (s <= tol || s >= g.L - tol) {
    var end = s <= tol ? p.wall.a : p.wall.b,
      n = S.nodes[end];
    return { x: n.x, z: n.z, node: end, wall: null };
  }
  return p;
}
function splitIntersectionWalls(p) {
  if (!p || !p.walls || !p.walls.length) return null;
  var base = null;
  p.walls.forEach(function (entry) {
    var w = wallById(entry.id), ni = null;
    if (!w) return;
    var g = wallGeom(w), s = (p.x - g.a.x) * g.ux + (p.z - g.a.z) * g.uz,
      tol = Math.max(w.thickness || 0, 6);
    if (s <= tol) ni = w.a;
    else if (s >= g.L - tol) ni = w.b;
    else ni = splitWallAt(w, s);
    if (base == null) base = ni;
    else if (ni !== base) weldNodes(base, ni);
  });
  return base;
}
function getOrMakeNode(p) {
  if (p.node != null) return p.node;
  if (p.walls && p.walls.length) {
    var cross = splitIntersectionWalls(p);
    if (cross != null) return cross;
  }
  if (p.wall) return splitWallAt(p.wall, p.s); // landing on a wall splits it
  S.nodes.push({ x: p.x, z: p.z });
  return S.nodes.length - 1;
}

/* Planner adapter for wall.draw. The command owns validation/default values;
   this adapter exposes the existing split/weld landing machinery instead of
   duplicating topology rules in the command core. */
function materializePlannerWall(params, env, context) {
  context = context || {};
  var oldNodeCount = S.nodes.length;
  var a = context.fromNodeId != null ? context.fromNodeId
    : getOrMakeNode(resolveLanding({ x: params.from.x, z: params.from.z }, {
        autoJoin: true,
        exclude: [],
      }));
  var b = context.toLanding
    ? getOrMakeNode(context.toLanding)
    : getOrMakeNode(resolveLanding({ x: params.to.x, z: params.to.z }, {
        autoJoin: true,
        exclude: [a],
      }));
  if (a === b) return { ok: false, reason: "ZERO_LENGTH_WALL" };
  var wall = {
    id: uid(), a: a, b: b,
    thickness: params.thickness,
    height: params.height,
    wallTypeId: params.type,
    kind: params.kind,
    loc: params.loc,
    dimSide: params.dimSide,
  };
  if (params.datum) wall.datum = params.datum;
  if (params.phase) wall.phase = params.phase;
  S.walls.push(wall);
  var clear = wallClearLength(wall);
  if (clear > 0) wall.clearL = clear;
  var createdNodeIds = [];
  for (var i = oldNodeCount; i < S.nodes.length; i++) createdNodeIds.push(i);
  var result = {
    ok: true,
    wall: wall,
    createdNodeIds: createdNodeIds,
    changedNodeIds: [a, b].filter(function (id) { return id < oldNodeCount; }),
  };
  return result;
}

/* `ai`: an AI proposal (preview or confirmed apply) — item moves answer to
   aiCanMove(), which skips the work-set rule; everything else is unchanged. */
function agentCommandEnvironment(options) {
  var ai = !!(options && options.ai);
  return {
    domain: "planner",
    state: S,
    history: PLANNER_COMMAND_HISTORY,
    version: { current: currentHistoryId },
    itemCatalog: FURN,
    services: {
      canPlaceItem: function (item) {
        return !!item && !item.locked && (ai ? aiCanMove : canDrag)({ kind: "item", ref: item });
      },
      validatePlacementGuard: validatePlacementGuard,
      commitItemPlacement: commitItemPlacement,
      beforeCommandBatchApply: beforePlacementCommandBatch,
      afterCommandBatchApply: afterPlacementCommandBatch,
      cleanupCommandBatchApply: cleanupPlacementCommandBatch,
      postValidateCommands: validatePlacementRelations,
      materializeWall: materializePlannerWall,
      createItem: mkItem,
      applyAutoFace: function (item, x, z) {
        applyAutoFace(item, x, z, { host: findSupport(item, x, z) });
      },
      presentCommandResult: function (result, presentation) {
        if (result.effects && result.effects.dirty3D) S.dirty3D = true;
        if (presentation && presentation.selectCreated && result.created.length) {
          var entry = result.created.find(function (item) { return item.kind !== "node"; });
          var ref = entry && (entry.kind === "wall" ? wallById(entry.id)
            : entry.kind === "opening" ? S.openings.find(function (o) { return o.id === entry.id; })
            : entry.kind === "item" ? S.items.find(function (it) { return it.id === entry.id; }) : null);
          if (ref) select({ kind: entry.kind, ref: ref });
        }
        if (presentation && presentation.switchToolTo) setTool(presentation.switchToolTo);
        render2D();
        if (result.effects && result.effects.refreshTree) refreshTree();
        if (result.effects && result.effects.refreshInspector) fillProps();
        (result.effects && result.effects.events || []).forEach(function (event) {
          if (event.type === "planner-item-moved") {
            var moved = (S.items || []).find(function(item) { return String(item.id) === String(event.entityId); });
            if (moved) broadcastPlanOp(itemMovePlanOp(moved));
          }
          window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
        });
      },
    },
  };
}

function currentPlacementWallFingerprint(id) {
  var sampled = canonicalPlacementWall(wallById(id), {
    wallGeom: wallGeom, wallPointAt: wallPointAt, normalizeWallKind: normalizeWallKind,
  });
  return placementWallFingerprint(sampled);
}

function currentPlacementScene() {
  var geometry = { wallGeom: wallGeom, wallPointAt: wallPointAt, normalizeWallKind: normalizeWallKind };
  return {
    items: (S.items || []).map(function(item) {
      return placementItemProjection(item);
    }),
    walls: (S.walls || []).map(function(wall) { return canonicalPlacementWall(wall, geometry); }).filter(Boolean),
    rooms: detectRooms().map(function(room) {
      return { key: room.key, area: room.area, pts: room.pts,
        wallIds: String(room.key || "").split(",").filter(Boolean) };
    }),
  };
}

function placementItemProjection(item) {
  return canonicalPlacementItem(item, { itemVSpan: itemVSpan });
}

function validatePlacementGuard(guard) {
  if (!guard || typeof guard !== "object") return false;
  if (guard.hostWall) {
    if (String(guard.hostWall.fingerprint || "") !==
        String(currentPlacementWallFingerprint(guard.hostWall.id) || "")) return false;
  }
  if (guard.referenceItem) {
    var expected = guard.referenceItem;
    var item = (S.items || []).find(function(candidate) { return String(candidate.id) === String(expected.id); });
    var rotationDelta = Math.abs(normalizedRotation(item && item.rot) - normalizedRotation(expected.rot));
    if (!item || Math.abs(Number(item.x) - Number(expected.x)) > 0.05 ||
        Math.abs(Number(item.z) - Number(expected.z)) > 0.05 ||
        Math.min(rotationDelta, 360 - rotationDelta) > 0.05) return false;
  }
  if (guard.targetHold != null && Array.isArray(guard.excludedItemIds) && guard.excludedItemIds.length) {
    var targetId = String(guard.excludedItemIds[0]);
    var target = (S.items || []).find(function(item) { return String(item.id) === targetId; });
    if (!target || JSON.stringify(target.hold || null) !== String(guard.targetHold)) return false;
  }
  return true;
}

export function previewPlannerCommand(commandId, params, options) {
  const permission = generatedChangePermission(S, commandId, params);
  if (!permission.ok) return permission;
  var command = plannerCommand(commandId), env = agentCommandEnvironment(options);
  if (!command) return { ok: false, reason: "INVALID_COMMAND" };
  var prepared = prepareCommand(command, params || {}, env);
  if (!prepared.ok) return prepared;
  var preview = previewPrepared(prepared, env);
  if (!preview.ok) return preview;
  var result = {
    ok: true,
    commandId: command.id,
    params: prepared.params,
    plan: prepared.plan,
    preview: preview.preview,
  };
  if (command.id === "item.move") {
    var moveParams = prepared.plan && prepared.plan.params;
    var target = moveParams && (S.items || []).find(function(item) {
      return String(item.id) === String(moveParams.itemId);
    });
    if (target && target.hold && moveParams.holdWallId == null)
      result.warnings = ["PRESERVED_WALL_HOLD"];
  }
  return result;
}

export function executePlannerProposal(proposal, options = {}) {
  if (S.workspace && S.workspace.role === "viewer")
    return { ok: false, reason: "PERMISSION_DENIED" };
  var proposals = proposal && Array.isArray(proposal.commands) ? proposal.commands : [proposal];
  if (!proposals.length) return { ok: false, reason: "INVALID_PLAN" };
  var env = agentCommandEnvironment(options), requests = [];
  for (var i = 0; i < proposals.length; i++) {
    var entry = proposals[i];
    if (!entry || !entry.commandId || !entry.plan) return { ok: false, reason: "INVALID_PLAN" };
    const permission = generatedChangePermission(S, entry.commandId, entry.params || entry.plan.params);
    if (!permission.ok) return permission;
    var command = plannerCommand(entry.commandId);
    if (!command) return { ok: false, reason: "INVALID_COMMAND" };
    var refreshed = prepareCommand(command, entry.params || entry.plan.params || {}, env);
    if (!refreshed.ok) return refreshed;
    if (JSON.stringify(refreshed.plan.params) !== JSON.stringify(entry.plan.params))
      return { ok: false, reason: "PREVIEW_INVALIDATED" };
    requests.push({ command: command, params: refreshed.params, plan: refreshed.plan });
  }
  const protectedBefore = captureProtectedStructure(S);
  return executeCommandBatch(requests, env, {
    postValidate: () => {
      const protectedResult = validateProtectedStructure(protectedBefore, S);
      if (!protectedResult.ok) return protectedResult;
      return options.postValidate ? options.postValidate() : protectedResult;
    },
    label: proposals.length > 1 ? "AI: batch change" : "AI: " + requests[0].command.id,
    presentation: { selectCreated: true, switchToolTo: "select" },
  });
}

/* Final connection repair for the walls committed in THIS run only. A wall
   endpoint can visually touch a host yet remain loose when a grid/furniture
   snap outranks the wall snap. Chief-style placement treats that as a wall
   intersection. Restricting the repair to `drawWalls` preserves deliberate
   gaps and old survey geometry elsewhere in the plan. */
function healDrawnWallEnds() {
  var ids = S.drawWalls || [];
  if (!ids.length) return 0;
  var made = {};
  ids.forEach(function (id) { made[id] = 1; });
  var joinTol = wallJoinTolerance(),
    healed = 0;
  if (!(joinTol > 0)) return 0;

  // Snapshot the candidate ends; splitting a host adds walls while we iterate.
  var ends = [];
  S.walls.forEach(function (w) {
    if (!made[w.id]) return;
    ends.push({ wall: w, end: "a", node: w.a });
    ends.push({ wall: w, end: "b", node: w.b });
  });
  ends.forEach(function (e) {
    var ni = e.end === "a" ? e.wall.a : e.wall.b,
      n = S.nodes[ni];
    if (!n) return;
    var degree = 0;
    S.walls.forEach(function (w) {
      if (w.a === ni || w.b === ni) degree++;
    });
    if (degree !== 1) return; // already a real joint
    var near = nearestWallLanding(n.x, n.z, joinTol, [ni]);
    if (!near || openingAtWallPosition(near.wall, near.s, 0.05)) return;
    var land = resolveLanding({
      x: near.x, z: near.z, node: null, wall: near.wall, s: near.s,
    });
    var target = getOrMakeNode(land);
    if (target == null || target === ni) return;
    weldNodes(target, ni);
    healed++;
  });
  if (healed) S.dirty3D = true;
  return healed;
}

/* ---- structural edit operations ---- */
// Hit-test a screen point (canvas-local px,py) and select the topmost element
// under it, mirroring the select-tool precedence. Returns the resulting S.sel
// (or null). Used by the right-click contextual menu.
export function selectAtScreen(ox, oy) {
  var px = wx(ox, oy),
    pz = wz(ox, oy);
  var hmk = hitMarker(px, pz, inputScale());
  var ho = hmk ? null : hitOpening(px, pz);
  if (hmk) {
    select({ kind: "marker", ref: hmk });
  } else if (ho) {
    select({ kind: "opening", ref: ho });
  } else {
    var hi = hitItem(px, pz);
    if (hi) {
      var toSelect = [hi];
      if (hi.groupId) {
        var hid = hiddenSets();
        toSelect = S.items.filter(function (it) {
          return it.groupId === hi.groupId && !hid.items[it.id] && !itemUserUnpickable(it);
        });
      }
      select(
        toSelect.length > 1
          ? { kind: "items", refs: toSelect }
            : { kind: "item", ref: hi },
      );
    } else {
      var hv = hitSlabOpening(px, pz);
      if (hv) {
        select({ kind: "slabvoid", ref: hv });
      } else {
      var hw = hitWall(px, pz);
      if (hw) {
        select({ kind: "wall", ref: hw });
      } else {
        var hk = hitRoom(px, pz);
        if (hk) select({ kind: "room", ref: hk });
        else select(null);
      }
      }
    }
  }
  render2D();
  return S.sel;
}

/* Is this selection locked against being moved or removed?

   Two independent padlocks answer here. The LAYER's lock covers everything on
   it at once (`S.lockStruct` is the structure layer's, so the old L-key
   behaviour arrives through this branch), and the OBJECT's own `locked` flag
   covers the one thing the user pinned. Either is enough.

   It used to understand items and nothing else, which meant a locked wall or a
   pinned MEP device refused a drag (the pointerdown chain checked `lockStruct`
   by hand) but was still deleted without complaint. The object test is now the
   generic one, so it extends to structure and MEP for free: a multi-selection
   counts as locked only when EVERY member is — a marquee that caught one
   pinned chair among ten should still move the other nine — and `kind: "room"`
   is the odd one out because its `ref` is a room KEY, with the flag living in
   S.roomMeta. `canDrag` in js/layers.js mirrors these same two rules
   deliberately; keep them in step. Rank is NOT consulted here: refusing to
   delete an off-work-set object is a different, harsher policy than refusing
   to drag it, and only `canDrag` makes that call. */
function targetLocked(sel) {
  if (!sel) return false;
  var id = layerOf(sel.kind);
  if (id && isLayerLocked(id)) return true;
  if (sel.kind === "room") {
    var meta = S.roomMeta && S.roomMeta[sel.ref];
    return !!(meta && meta.locked);
  }
  // refLocked: its own pin, or the padlock of the user layer it is on
  if (Array.isArray(sel.refs))
    return sel.refs.length > 0 && sel.refs.every(refLocked);
  return refLocked(sel.ref);
}

/* A drag was asked for and refused. The reason is worth showing at the cursor —
   "this layer isn't the one you're editing" and "this thing is pinned" call for
   completely different next actions — but this module owns no DOM, so it says
   so on the window and js/ui_layers.js draws the pill.

   `reason` is the FIRST gate that failed, in the order canDrag() tests them:
     "rank"   — the layer is visible but off the work set (or unreachable)
     "layer"  — the layer's own padlock is closed
     "object" — the thing itself is pinned
     "ulayer" — the user layer it is on is locked (`ulayer` is that layer's id)
   `layer` is the layer id, or null for a kind that belongs to no layer. */
function blockedDrag(sel) {
  if (!sel || typeof window === "undefined" || !window.dispatchEvent) return;
  var id = layerOf(sel.kind),
    reason = "object",
    ul = null;
  if (!id || layerRank(id) !== 0) reason = "rank";
  else if (isLayerLocked(id)) reason = "layer";
  else {
    var first = sel.ref || (sel.refs && sel.refs[0]),
      L = first && !first.locked ? userLayerOf(first) : null;
    if (L && L.locked) {
      reason = "ulayer";
      ul = L.id;
    }
  }
  window.dispatchEvent(
    new CustomEvent("layers:blocked-drag", {
      // `where` lets one pill serve both panes; js/view3d.js emits "3d".
      detail: { sel: sel, layer: id, reason: reason, ulayer: ul, where: inputIs3D()?"3d":"2d" },
    }),
  );
}

function applyRemove(sel) {
  if (!sel) return false;
  if (sel.kind === "item") {
    S.items = S.items.filter(function (i) { return i !== sel.ref; });
    orphanChildren(null);
  } else if (sel.kind === "items") {
    var lockedSkipped = sel.refs.filter(function (i) { return refLocked(i); }).length;
    S.items = S.items.filter(function (i) {
      return sel.refs.indexOf(i) === -1 || refLocked(i);
    });
    if (lockedSkipped) flash(t("f_someLockedSkipped", { n: lockedSkipped }));
    orphanChildren(null);
  } else if (sel.kind === "opening") {
    S.openings = S.openings.filter(function (o) { return o !== sel.ref; });
  } else if (sel.kind === "wall") {
    var id = sel.ref.id;
    detachNodesFromWalls(function (wid) { return wid === id; });
    S.walls = S.walls.filter(function (w) { return w !== sel.ref; });
    S.openings = S.openings.filter(function (o) { return o.wall !== id; });
  } else if (sel.kind === "walls") {
    var wallIds = new Set(sel.refs.map(function (w) { return w.id; }));
    detachNodesFromWalls(function (wid) { return wallIds.has(wid); });
    S.walls = S.walls.filter(function (w) { return !wallIds.has(w.id); });
    S.openings = S.openings.filter(function (o) { return !wallIds.has(o.wall); });
  } else if (sel.kind === "node") {
    var ni = sel.ref, goneW = {};
    S.walls.forEach(function (w) {
      if (w.a === ni || w.b === ni) goneW[w.id] = 1;
    });
    detachNodesFromWalls(goneW);
    S.walls = S.walls.filter(function (w) { return w.a !== ni && w.b !== ni; });
    S.openings = S.openings.filter(function (o) { return !goneW[o.wall]; });
  } else if (sel.kind === "marker") {
    deleteMarker(sel.ref);
  } else if (sel.kind === "slabvoid") {
    broadcastPlanOp({ type: "slabRemove", id: sel.ref.id });
    removeSlabOpening(sel.ref);
  } else if (sel.kind === "mepNode" || sel.kind === "mepRun") {
    deleteMEP(sel);
  } else if (sel.kind === "con" && sel.ref) {
    removeCon(sel.ref.id);
  } else {
    return false;
  }
  return true;
}

function finishRemove() {
  pruneCons();
  select(null);
  S.dirty3D = true;
  render2D();
  refreshTree();
}

function pickErase(px, pz, ox, oy) {
  if (ox != null) {
    var hc = pickCon(ox, oy);
    if (hc) return { kind: "con", ref: hc };
  }
  var hm = hitMEP(px, pz, inputScale());
  if (hm) return hm;
  var hmk = hitMarker(px, pz, inputScale());
  if (hmk) return { kind: "marker", ref: hmk };
  var ho = hitOpening(px, pz);
  if (ho) return { kind: "opening", ref: ho };
  var hi = hitItem(px, pz);
  if (hi) return { kind: "item", ref: hi };
  var hv = hitSlabOpening(px, pz, 4);
  if (hv) return { kind: "slabvoid", ref: hv };
  var hw = hitWall(px, pz);
  if (hw) return { kind: "wall", ref: hw };
  return null;
}

function eraseKey(hit) {
  if (!hit) return "";
  if (hit.kind === "node") return "node:" + hit.ref;
  var id = hit.ref && hit.ref.id != null ? hit.ref.id : hit.ref;
  return hit.kind + ":" + id;
}

export function deleteSel() {
  if (!S.sel) return;
  // Lock has to be honoured BEFORE pushHistory, or refusing to delete still
  // leaves a no-op entry on the undo stack that swallows the next Ctrl+Z.
  if (targetLocked(S.sel)) {
    flash(t("f_targetLockedDel"), "error");
    return;
  }
  if (S.sel.kind === "room") {
    deleteRoom(S.sel.ref); // pushes its own history entry
    return;
  }
  pushHistory();
  applyRemove(S.sel);
  finishRemove();
}
export function dupSel() {
  if (S.sel && S.sel.kind === "item") {
    var result = executeCommand(itemDuplicateCommand, {
      sourceId: S.sel.ref.id, offsetX: 30, offsetZ: 30, regroup: false,
    }, agentCommandEnvironment(), {
      label: "Duplicate item", presentation: { selectCreated: true },
    });
    if (!result.ok) flash(t("f_placeFail"), "error");
  } else if (S.sel && S.sel.kind === "items") {
    var many = executeCommand(itemDuplicateCommand, {
      sourceIds: S.sel.refs.map(function(item) { return item.id; }),
      offsetX: 30, offsetZ: 30, regroup: true,
    }, agentCommandEnvironment(), { label: "Duplicate items" });
    if (!many.ok) { flash(t("f_placeFail"), "error"); return; }
    var madeIds = new Set(many.created.map(function(entry) { return String(entry.id); }));
    select({ kind: "items", refs: S.items.filter(function(item) { return madeIds.has(String(item.id)); }) });
    render2D();
  }
}

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

function arrangeRoom(r) {
  var items = itemsInRoom(r).filter(function (it) {
    return !it.locked;
  });
  if (!items.length) return;
  var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  r.pts.forEach(function (p) {
    minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
    minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z);
  });
  var inset = WALL_T / 2 + 4, // inner wall face + breathing gap
    gap = 12, // space between neighbours along a wall
    corner = 8, // keep off the exact corner
    cx = (minx + maxx) / 2,
    cz = (minz + maxz) / 2;
  // 4 walls: top(z=minz,rot0,front+Z) right(x=maxx,rot90) bottom(z=maxz,rot180) left(x=minx,rot270)
  var walls = [
    { axis: "x", lo: minx + inset + corner, hi: maxx - inset - corner, fixed: minz + inset, rot: 0 },
    { axis: "z", lo: minz + inset + corner, hi: maxz - inset - corner, fixed: maxx - inset, rot: 90 },
    { axis: "x", lo: minx + inset + corner, hi: maxx - inset - corner, fixed: maxz - inset, rot: 180 },
    { axis: "z", lo: minz + inset + corner, hi: maxz - inset - corner, fixed: minx + inset, rot: 270 },
  ];
  walls.forEach(function (w) {
    w.cursor = w.lo;
  });

  var rugs = [], mids = [], ceil = [], wallItems = [];
  items.forEach(function (it) {
    if (it.type === "rug") rugs.push(it);
    else if (CEILING_TYPES[it.type]) ceil.push(it);
    else if (CENTER_TYPES[it.type]) mids.push(it);
    else wallItems.push(it);
  });
  // biggest first packs tighter
  wallItems.sort(function (a, b) {
    return b.w * b.d - a.w * a.d;
  });

  wallItems.forEach(function (it) {
    var run = it.w; // width runs along the wall, depth (d) faces it
    var best = null;
    walls.forEach(function (w) {
      var remaining = w.hi - w.cursor;
      if (remaining >= run && (!best || remaining > best.rem))
        best = { w: w, rem: remaining };
    });
    if (!best) {
      mids.push(it); // no wall run fits — fall back to the centre row
      return;
    }
    var w = best.w,
      along = w.cursor + run / 2;
    w.cursor += run + gap;
    it.rot = w.rot;
    if (w.axis === "x") {
      it.x = along;
      it.z = w.rot === 0 ? w.fixed + it.d / 2 : w.fixed - it.d / 2;
    } else {
      it.z = along;
      it.x = w.rot === 270 ? w.fixed + it.d / 2 : w.fixed - it.d / 2;
    }
  });

  // rugs sit dead centre; ceiling fixtures share the ceiling, so spread them
  // along it instead of stacking every light and diffuser on one point
  rugs.forEach(function (it) {
    it.rot = 0;
    it.x = cx;
    it.z = cz;
  });
  var ceilTotal = ceil.reduce(function (s, it) { return s + it.w; }, 0) + gap * Math.max(0, ceil.length - 1),
    ceilX = cx - ceilTotal / 2;
  ceil.forEach(function (it) {
    it.rot = 0;
    it.x = ceil.length === 1 ? cx : ceilX + it.w / 2;
    it.z = cz;
    ceilX += it.w + gap;
  });
  // tables/islands in a centred row (over the rug)
  var totalW = mids.reduce(function (s, it) {
    return s + it.w;
  }, 0) + gap * Math.max(0, mids.length - 1);
  var startX = cx - totalW / 2;
  mids.forEach(function (it) {
    it.rot = 0;
    it.x = startX + it.w / 2;
    it.z = cz;
    startX += it.w + gap;
  });
}

export function autoArrangeAll() {
  var rooms = detectRooms();
  if (!rooms.length) {
    flash(t("f_needRoom"));
    return;
  }
  pushHistory();
  rooms.forEach(arrangeRoom);
  select(null);
  S.dirty3D = true;
  render2D();
  refreshTree();
  flash(t("f_arranged"));
}

/* Repoint every wall that used `from` at `keep`, then drop any wall that has
   collapsed to zero length. Two corners at the same coordinates are NOT
   connected — detectRooms walks node indices, so a shape closed by a coincident
   pair reads as open and yields no room at all. */
export function weldNodes(keep, from) {
  if (keep === from) return;
  mergeAnchorNodes(keep, from);
  S.walls.forEach(function (w) {
    if (w.a === from) w.a = keep;
    if (w.b === from) w.b = keep;
  });
  var dead = {};
  S.walls.forEach(function (w) {
    if (w.a === w.b) dead[w.id] = 1;
  });
  if (Object.keys(dead).length) {
    detachNodesFromWalls(dead);
    S.walls = S.walls.filter(function (w) {
      return !dead[w.id];
    });
    S.openings = S.openings.filter(function (o) {
      return !dead[o.wall];
    });
  }
}
function weldAt(ni) {
  var n = S.nodes[ni];
  if (!n) return;
  for (var k = 0; k < S.nodes.length; k++) {
    if (k === ni) continue;
    var m = S.nodes[k];
    if (m && Math.abs(m.x - n.x) < 2 && Math.abs(m.z - n.z) < 2 && canWeld(ni, k))
      weldNodes(ni, k);
  }
}
/* Merge every pair of corners sitting on top of each other. Dragging a corner
   onto another used to copy its coordinates and stop there, leaving a shape
   that looked closed but detected zero rooms; nothing outside openWall() ever
   welded. Runs after an edit settles, from normalizeStructure(). */
export function weldCoincidentNodes() {
  var u = usedNodes(),
    idx = Object.keys(u).map(Number);
  for (var i = 0; i < idx.length; i++) {
    var a = S.nodes[idx[i]];
    if (!a) continue;
    for (var j = i + 1; j < idx.length; j++) {
      var b = S.nodes[idx[j]];
      if (!b) continue;
      /* The 2 cm gate is wider than the constraint engine's idea of "the same
         point", so an automatic weld could quietly drag a locked wall's end up
         to 2 cm and undo a joint the engine had just released. canWeld refuses
         exactly those; coincident corners (the normal case) still merge. */
      if (
        Math.abs(a.x - b.x) < 2 && Math.abs(a.z - b.z) < 2 &&
        canWeld(idx[i], idx[j])
      )
        weldNodes(idx[i], idx[j]);
    }
  }
}

function ownedNodeAnchor(ni) {
  var w = S.walls.find(function (q) { return q.a === ni || q.b === ni; });
  return nodeAnchor(ni, w && w.id, w ? (w.a === ni ? "a" : "b") : null);
}

/* Contextual relations for two explicitly selected corners. The order is
   meaningful: the first is the held reference, the second is driven. */
/* Pin the selected corner (or every corner of a multi-selection). Its own
   entry point because a pin is the one relation that needs exactly ONE piece
   of geometry — every other verb here is about a pair. */
export function togglePinSelected() {
  var nodes = S.sel && S.sel.kind === "nodes" ? S.sel.refs.slice()
    : S.sel && S.sel.kind === "node" ? [S.sel.ref] : [];
  if (!nodes.length) return false;
  pushHistory();
  var pins = pinnedNodes(), removed = 0, added = 0;
  nodes.forEach(function (ni) {
    if (pins[ni]) {
      // already pinned: the button is a toggle, so unpin it
      wallCons()
        .filter(function (c) { return c.type === "fixed" && anchorNode(c.a) === ni; })
        .forEach(function (c) { removeCon(c.id); removed++; });
    } else if (addFixed(ownedNodeAnchor(ni))) added++;
  });
  var pinResult = solveWallCons();
  S.dirty3D = true;
  fillProps();
  render2D();
  refreshTree();
  renderWarnPanel(true);
  flash(pinResult.unresolved
    ? t("wc_unresolved", { n: pinResult.unresolved })
    : added ? t("f_pinned", { n: added }) : t("f_unpinned", { n: removed }),
  pinResult.unresolved ? "error" : undefined);
  return true;
}

export function applyNodePairRelation(type) {
  if (!S.sel || S.sel.kind !== "nodes" || S.sel.refs.length !== 2) return false;
  var keep = S.sel.refs[0], drive = S.sel.refs[1], A = S.nodes[keep], B = S.nodes[drive];
  if (!A || !B || keep === drive) return false;
  if (type === "join") {
    var active = S.walls.filter(function (w) { return w.a === drive || w.b === drive; });
    var ids = active.map(function (w) { return w.id; });
    if (!canWeld(keep, drive, ids)) {
      flash("The selected dimensions prevent this join", "error");
      return false;
    }
    pushHistory();
    B.x = A.x; B.z = A.z;
    weldNodes(keep, drive);
    active.forEach(function (w) { captureLock(w); captureClear(w); });
    var joinResult = solveWallCons();
    select({ kind: "node", ref: keep });
    S.dirty3D = true;
    render2D();
    refreshTree();
    renderWarnPanel(true);
    flash(joinResult.unresolved
      ? t("wc_unresolved", { n: joinResult.unresolved })
      : "Corners joined", joinResult.unresolved ? "error" : "success");
    return true;
  }
  /* Symmetry needs a third piece of geometry, so it arms a pick instead of
     completing here — the mirror line is a wall the user clicks next. */
  if (type === "symmetric" || type === "symmetricPerp") {
    startNodeConPick(type, [keep, drive]);
    flash(t("wc_pick_symmetric"));
    return true;
  }
  pushHistory();
  var a = ownedNodeAnchor(keep), b = ownedNodeAnchor(drive), made = null;
  if (type === "distance") made = addDistance(a, b, null, "a");
  else if (type === "coincident") made = addCoincident(a, b, "a");
  else if (type === "alignX" || type === "alignZ") made = addAxisAlignment(type, a, b);
  else if (type === "axisDistX" || type === "axisDistZ") made = addAxisDistance(type, a, b);
  else if (type === "equalAngle") {
    function selectedSector(ni) {
      var picked = S.nodePairAngles && S.nodePairAngles[ni];
      return picked ? angleSectorAtNode(ni, picked.w1, picked.w2) : angleSectorAtNode(ni);
    }
    made = addEqualAngle(selectedSector(keep), selectedSector(drive));
    /* A reference equal-angle is the "compare these two corners" verb: it
       measures both sectors and their difference without straightening
       anything. Same relation, no say in the geometry. */
    if (made && S.nodePairReport) made.report = true;
  }
  if (!made) {
    flash("This relation cannot be created from the selected corners", "error");
    return false;
  }
  var relationResult = solveWallCons();
  S.dirty3D = true;
  fillProps();
  render2D();
  refreshTree();
  renderWarnPanel(true);
  if (relationResult.unresolved) {
    flash(t("wc_unresolved", { n: relationResult.unresolved }), "error");
    return true;
  }
  flash(type === "equalAngle" ? "Angles made equal" : "Relation added", "success");
  return true;
}
/* The inspector uses the same single-host command as pointer placement. A
   selected wall is already an unambiguous target; nearby coincident walls are
   never inferred or modified as a side effect. */
export function placeOpeningOnSelected(type, opts) {
  if (!S.sel || S.sel.kind !== "wall") return null;
  type = type === "door" || type === "window" || type === "passage" ? type : "passage";
  var w = S.sel.ref, options = opts || {}, gm = wallGeom(w);
  var params = { wallId: w.id, type: type, s: options.s != null ? Number(options.s) : gm.L / 2 };
  ["width", "height", "sill"].forEach(function (key) { if (options[key] != null) params[key] = Number(options[key]); });
  var result = executeCommand(openingPlaceCommand, params, agentCommandEnvironment(), {
    label: t("f_openingPlaced", { name: t(type) }),
    presentation: { selectCreated: true },
  });
  if (!result.ok || !result.created.length) return null;
  var made = S.openings.find(function (opening) { return opening.id === result.created[0].id; });
  if (!made) return null;
  S.segPreview = null;
  return made;
}

export function openWall() {
  if (!S.sel || S.sel.kind !== "wall") return;
  var w = S.sel.ref;
  pushHistory();
  weldAt(w.a);
  weldAt(w.b);
  var A = w.a,
    B = w.b,
    ids = {};
  S.walls.forEach(function (x) {
    if ((x.a === A && x.b === B) || (x.a === B && x.b === A)) ids[x.id] = 1;
  });
  var n = Object.keys(ids).length;
  detachNodesFromWalls(ids);
  S.walls = S.walls.filter(function (x) {
    return !ids[x.id];
  });
  S.openings = S.openings.filter(function (o) {
    return !ids[o.wall];
  });
  pruneCons(); // a dimension to a wall that is gone is worse than no dimension
  select(null);
  S.dirty3D = true;
  render2D();
  refreshTree(); // removing walls merges rooms — resync the tree + room metadata
  flash(t("f_wallOpened", { n: n }));
}
export function addSpace(w, d, label, isCorridor) {
  var dp = dropPoint(); // never NaN, even with the plan pane hidden
  var cx = Math.round(dp.x / 10) * 10,
    cz = Math.round(dp.z / 10) * 10;
  var defaults = resolveWallDrawDefaults();
  var result = executeCommand(roomCreateCommand, {
    from: { x: cx - w / 2, z: cz - d / 2 }, to: { x: cx + w / 2, z: cz + d / 2 },
    type: defaults.typeId, kind: defaults.kind, loc: defaults.loc, dimSide: defaults.dimSide,
    height: defaults.height, thickness: defaults.thickness, datum: defaults.datum, phase: defaults.phase,
    name: label, isCorridor: !!isCorridor,
  }, agentCommandEnvironment(), { label: t("f_added", { label: label }) });
  if (!result.ok) { flash(t("f_placeFail"), "error"); return; }
  var key = result.created.filter(function (entry) { return entry.kind === "wall"; })
    .map(function (entry) { return entry.id; }).sort(function (a, b) { return a - b; }).join(",");
  setTool("select");
  select({ kind: "room", ref: key });
  render2D();
  flash(t("f_added", { label: label }));
}
// open a manual segment in the selected wall: a passage of given width/height centered at `s` (cm along wall).
// also cuts any wall coincident at that point (the adjacent room's matching wall) so both open.
export function openSegment(s, width, height) {
  var made = placeOpeningOnSelected("passage", { s: s, width: width, height: height, sill: 0 });
  if (made) flash(t("f_segOpened", { w: Math.round(made.width), h: Math.round(made.height) }));
}
/* Delete a whole room: its items, the walls that bound it alone, and their
   openings. A wall shared with a neighbouring room is kept — it still bounds
   that room — so deleting one of two rooms leaves the survivor intact and the
   party wall standing. Undoable like every other structural edit. */
export function deleteRoom(key) {
  var r = roomByKey(key);
  if (!r) return false;
  if (S.roomMeta[key] && S.roomMeta[key].locked) {
    flash(t("f_roomLockedDel"), "error");
    return false;
  }
  pushHistory();
  var shared = {};
  detectRooms().forEach(function (o) {
    if (o.key === key) return;
    o.key.split(",").forEach(function (id) {
      shared[id] = 1;
    });
  });
  var kill = {};
  key.split(",").forEach(function (id) {
    if (!shared[id]) kill[id] = 1;
  });
  var dead = itemsInRoom(r);
  S.items = S.items.filter(function (it) {
    return dead.indexOf(it) === -1;
  });
  // a piece outside the room could have been standing on one inside it
  orphanChildren(null);
  detachNodesFromWalls(kill);
  S.walls = S.walls.filter(function (w) {
    return !kill[w.id];
  });
  S.openings = S.openings.filter(function (o) {
    return !kill[o.wall];
  });
  pruneCons();
  delete S.roomMeta[key];
  var selGone =
    S.sel &&
    ((S.sel.kind === "room" && S.sel.ref === key) ||
      (S.sel.kind === "item" && dead.indexOf(S.sel.ref) !== -1) ||
      (S.sel.kind === "items" &&
        S.sel.refs.some(function (it) {
          return dead.indexOf(it) !== -1;
        })) ||
      (S.sel.kind === "wall" && kill[S.sel.ref.id]) ||
      (S.sel.kind === "opening" && kill[S.sel.ref.wall]));
  if (selGone) select(null);
  S.dirty3D = true;
  refreshTree();
  render2D();
  flash(t("f_roomDeleted", { n: dead.length }));
  return true;
}

export function rotateRoom(deg) {
  if (!S.sel || S.sel.kind !== "room") return;
  var r = roomByKey(S.sel.ref);
  if (!r) return;
  pushHistory();
  var a = (deg * Math.PI) / 180,
    ca = Math.cos(a),
    sa = Math.sin(a),
    cx = r.cx,
    cz = r.cz,
    seen = {};
  r.nidx.forEach(function (i) {
    if (seen[i]) return;
    seen[i] = 1;
    var n = S.nodes[i],
      dx = n.x - cx,
      dz = n.z - cz;
    n.x = Math.round((cx + dx * ca - dz * sa) * 10) / 10;
    n.z = Math.round((cz + dx * sa + dz * ca) * 10) / 10;
  });
  // items in the room rotate with it (position about the room center + own heading)
  itemsInRoom(r).forEach(function (it) {
    var dx = it.x - cx,
      dz = it.z - cz;
    it.x = Math.round((cx + dx * ca - dz * sa) * 10) / 10;
    it.z = Math.round((cz + dx * sa + dz * ca) * 10) / 10;
    it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360;
  });
  S.dirty3D = true;
  fillProps();
  render2D();
}

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
/* Did this frame move a corner the proxy never lifted? `before` is the
   snapshotNodes() array the corner drags already take for enforceLocks, so this
   costs one comparison pass over the corners and no extra snapshot. A change in
   the node array's own length is a topology commit (a split or a weld) and is
   treated as a miss without looking further. */
function auditDragProxy(before) {
  if (!proxyNodes || !before) return;
  if (S.nodes.length !== before.length) return void dropDragProxy();
  for (var i = 0; i < S.nodes.length; i++) {
    if (proxyNodes.indexOf(i) !== -1) continue;
    var b = before[i], n = S.nodes[i];
    if (!b !== !n) return void dropDragProxy();
    if (b && n && (b.x !== n.x || b.z !== n.z)) return void dropDragProxy();
  }
}

function normalizedRotation(value) {
  return ((Number(value) || 0) % 360 + 360) % 360;
}

/* Apply an already-resolved translation. This is deliberately below every
   pointer/model intent resolver: it never grids, aligns, auto-faces or reads
   viewport/modifier state. Drag calls it once per frame; a prepared command
   calls it once inside its existing history transaction. */
function applyResolvedItemTranslation(it, x, z, options) {
  options = options || {};
  var oldX = Number(it.x), oldZ = Number(it.z), changed = [it];
  it.x = Number(x);
  it.z = Number(z);
  var host = null;
  if (options.resolveSupport !== false) {
    var oldOn = it.on, oldElev = it.elev;
    host = findSupport(it, it.x, it.z);
    if (host) stackAttach(it, host);
    else if (it.on != null) stackDetach(it);
    /* Changing this item's own elevation changes the top inherited by every
       rider above it. Translation alone cannot repair that vertical chain. */
    stackReseat(it);
    if (oldOn !== it.on || oldElev !== it.elev) {
      descendantsOf(it, new Set([it]), []).forEach(function(child) {
        if (changed.indexOf(child) === -1) changed.push(child);
        if (options.touch3D) touchItem3D(child, "move");
      });
    }
    if (options.trackDragState) S.stackHost = host || null;
  }
  var moved = new Set(options.excludedItems || []); moved.add(it);
  carryChildren(it, it.x - oldX, it.z - oldZ, moved).forEach(function(child) {
    changed.push(child);
    if (options.touch3D) touchItem3D(child, "move");
  });
  if (options.touch3D) touchItem3D(it, "move");
  return changed;
}

/* Drop-time domain effects, shared by 2D/3D gestures and command commits.
   Absence of holdWallId means PRESERVE an existing hold; raw coordinates must
   never invent or silently release one. */
function finalizeItemPlacement(it, options) {
  options = options || {};
  if (!it) return;
  if (options.releaseMarker !== false) releaseIfMoved(it);
  if (options.holdWallId != null) {
    var wall = wallById(options.holdWallId);
    if (wall && !it.locked) holdToWall(it, wall, 0);
  }
  if (options.markRotationUser) markManualRot(it);
}

/* One-shot exact-pose commit used by planner commands. Resolution has already
   happened, so re-running moveItemTo here would incorrectly apply zoom-aware
   snapping and drag-only auto-facing a second time. */
function commitItemPlacement(it, placement, env) {
  placement = placement || {};
  // The same gate the command validated with, so an AI proposal (exempt from
  // the work-set rule) commits exactly what it previewed.
  var allowed = env && env.services && typeof env.services.canPlaceItem === "function"
    ? env.services.canPlaceItem(it) : canDrag({ kind: "item", ref: it });
  if (!it || it.locked || !allowed)
    return { ok: false, reason: it && it.locked ? "ITEM_LOCKED" : "PERMISSION_DENIED" };
  var changed = [it], oldRot = normalizedRotation(it.rot);
  if (placement.rotationSpecified) {
    var nextRot = normalizedRotation(placement.rotation), delta = nextRot - oldRot;
    it.rot = nextRot;
    var spun = new Set(env && env.placementBatchItems || []); spun.add(it);
    rotateWith(it, delta, spun).forEach(function(child) { changed.push(child); });
  }
  applyResolvedItemTranslation(it, placement.x, placement.z, {
    resolveSupport: !(env && env.placementBatchItems),
    excludedItems: env && env.placementBatchItems,
  }).forEach(function(entry) {
    if (changed.indexOf(entry) === -1) changed.push(entry);
  });
  finalizeItemPlacement(it, {
    releaseMarker: true,
    holdWallId: placement.holdWallId,
    markRotationUser: placement.rotationSpecified && placement.markRotationUser,
  });
  syncStairVoids(it);
  return { ok: true, changedIds: changed.map(function(entry) { return entry.id; }) };
}

function beforePlacementCommandBatch(entries, env) {
  var items = new Set(), ids = new Set();
  (entries || []).forEach(function(entry) {
    if (!entry || entry.commandId !== "item.move") return;
    var id = entry.plan && entry.plan.params && entry.plan.params.itemId;
    if (ids.has(String(id))) return;
    ids.add(String(id));
    var item = (S.items || []).find(function(candidate) { return String(candidate.id) === String(id); });
    if (item) items.add(item);
  });
  var moveCount = (entries || []).filter(function(entry) { return entry && entry.commandId === "item.move"; }).length;
  if (ids.size !== moveCount) return { ok: false, reason: "AMBIGUOUS_ITEM_TARGET" };
  var semantic = (entries || []).filter(function(entry) {
    return entry && entry.commandId === "item.move" && entry.plan && entry.plan.params && entry.plan.params.placementGuard;
  }).map(function(entry) {
    var params = entry.plan.params;
    return { itemId: params.itemId, x: params.to.x, z: params.to.z,
      rot: params.rotationSpecified ? params.rotation : null };
  });
  if (semantic.length && !placementBatchFitsScene(currentPlacementScene(), semantic))
    return { ok: false, reason: "PLACEMENT_GEOMETRY_CHANGED" };
  env.placementBatchItems = items.size ? items : null;
  return { ok: true };
}

function afterPlacementCommandBatch(_entries, env) {
  var items = env.placementBatchItems;
  if (!items) return { ok: true };
  var changed = [];
  items.forEach(function(item) {
    var oldOn = item.on, oldElev = item.elev;
    var host = findSupport(item, item.x, item.z);
    if (host) stackAttach(item, host);
    else if (item.on != null) stackDetach(item);
    stackReseat(item);
    changed.push({ kind: "item", id: item.id });
    if (oldOn !== item.on || oldElev !== item.elev) {
      descendantsOf(item, new Set([item]), []).forEach(function(child) {
        changed.push({ kind: "item", id: child.id });
      });
    }
  });
  return { ok: true, changed: changed };
}

function cleanupPlacementCommandBatch(_entries, env) {
  env.placementBatchItems = null;
}

function validatePlacementRelations(summary) {
  var changedIds = new Set((summary.changed || []).filter(function(entry) {
    return entry && entry.kind === "item";
  }).map(function(entry) { return String(entry.id); }));
  if (!changedIds.size) return { ok: true };
  var markerOwners = new Set();
  for (var i = 0; i < S.items.length; i++) {
    var item = S.items[i];
    if (!changedIds.has(String(item.id))) continue;
    if (!Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.z)) ||
        !Number.isFinite(Number(item.rot || 0))) return { ok: false, reason: "POST_VALIDATION_FAILED" };
    if (item.on != null) {
      var host = hostOf(item);
      if (!host || wouldCycle(item, host) || !Number.isFinite(Number(item.elev)) ||
          Math.abs(Number(item.elev) - Number(topOf(host))) > 1e-6)
        return { ok: false, reason: "POST_VALIDATION_FAILED" };
    }
    if (item.hold && !wallById(item.hold.wall)) return { ok: false, reason: "POST_VALIDATION_FAILED" };
  }
  (S.markers || []).forEach(function(marker) {
    if (!marker || marker.itemId == null || !changedIds.has(String(marker.itemId))) return;
    var key = String(marker.itemId);
    if (markerOwners.has(key)) markerOwners.add("duplicate:" + key);
    else markerOwners.add(key);
  });
  if (Array.from(markerOwners).some(function(key) { return key.indexOf("duplicate:") === 0; }))
    return { ok: false, reason: "POST_VALIDATION_FAILED" };
  return { ok: true };
}

export function moveItemTo(it, nx, nz) {
  var tx = Math.round(nx / 2) * 2,
    tz = Math.round(nz / 2) * 2;
  /* Which way it faces is settled BEFORE the position snap, not after: turning
     a piece changes its footprint, and the flush-to-wall snap below measures
     that footprint. Deciding afterwards left a bed snapped flush by its side
     and then turned, i.e. standing half inside the wall. (js/item_orient.js) */
  var faced = applyAutoFace(it, tx, tz, { host: findSupport(it, tx, tz) });
  // a piece standing on this one turns with it, exactly as a manual rotation
  if (faced) rotateWith(it, faced, new Set([it]));
  var a = alignItem(tx, tz, it);
  applyResolvedItemTranslation(it, a.x, a.z, { trackDragState: true, touch3D: true });
}

/* ---- 3D-view editing (js/view3d.js drives these) ----
   The 3D view owns the picking and the ray→floor math; everything that touches
   the model itself lives here, next to the plan drag it mirrors — history,
   snapping and stacking must not fork per view. */
/* The 3D twin of a rank-1 pick in the plan. A click on something off the work
   set still answers "what is this" — it selects and fills the inspector — but
   it must not arm a gesture, so js/view3d.js calls this instead of a
   begin*Drag and then hands the press to the orbit.

   It lives here rather than in view3d.js because `select` comes from ui.js and
   ui.js already imports view3d.js; the reverse edge would be a cycle. view3d
   reaches it through the same lazily-imported `editMod` it uses for the drag
   verbs. Without it the 3D pane is a dead surface for anything structural
   under the boot work set, while the identical click in 2D fills the panel. */
export function select3DTarget(sel) {
  if (!sel || !sel.ref) return false;
  select(sel);
  S.action = "item";
  render2D();
  return true;
}
export function begin3DItemDrag(it) {
  if (!it) return false;
  /* One permission for both views. The 3D drag used to consult only the
     piece's own `locked` flag, so a work set or a layer padlock that stopped
     the plan drag did nothing here and the two views disagreed about whether
     the same piece could be moved. `canDrag` is the single answer; the refusal
     is announced so the pill appears at the cursor in 3D as well. */
  var sel = { kind: "item", ref: it };
  if (!canDrag(sel)) {
    blockedDrag(sel);
    return false;
  }
  select(sel);
  S.action = "item";
  S.itemSnapWall = null;
  S.orientHold = false;
  beginHistory();
  render2D();
  return true;
}
export function drag3DItemTo(it, nx, nz) {
  if (!it) return;
  commitPending();
  moveItemTo(it, nx, nz);
  render2D();
}
// raise/lower the piece off its floor (Alt-drag in 3D). Detaches from a host,
// because "hovering 40cm over the table" is a manual height, not a stack.
export function drag3DItemElev(it, elev) {
  if (!it) return;
  commitPending();
  if (it.on != null) stackDetach(it);
  it.elev = Math.max(0, Math.round(elev));
  touchItem3D(it, "move");
  stackReseat(it);
  descendantsOf(it, new Set([it]), []).forEach(function (c) {
    touchItem3D(c, "move");
  });
  render2D();
}
/* Openings drag in 3D too — the same slide along their host wall the plan drag
   does, so a door can be nudged while you are looking at the room it opens
   into. Walls themselves stay fixed: their geometry is the frame everything
   else is measured against, and the plan is the place to redraw it. */
export function begin3DOpeningDrag(o) {
  if (!o || !wallById(o.wall)) return false;
  select({ kind: "opening", ref: o });
  beginHistory();
  render2D();
  return true;
}
// where a world point falls along the opening's wall (cm from the wall start),
// or null when the wall is gone — the 3D view uses it to take a grab offset
export function opening3DPos(o, x, z) {
  var w = o && wallById(o.wall);
  if (!w) return null;
  var gm = wallGeom(w);
  if (!gm || gm.L < 1) return null;
  return (x - gm.a.x) * gm.ux + (z - gm.a.z) * gm.uz;
}
export function drag3DOpeningTo(o, x, z, offS) {
  var s = opening3DPos(o, x, z);
  if (s == null) return;
  commitPending();
  var gm = wallGeom(wallById(o.wall));
  o.s = clamp(s + (offS || 0), o.width / 2, gm.L - o.width / 2);
  S.dirty3D = true;
  render2D();
}
export function end3DOpeningDrag() {
  cancelPending();
  fillProps();
  render2D();
}

export function end3DItemDrag() {
  cancelPending();
  if (S.sel && S.sel.kind === "item") {
    finalizeItemPlacement(S.sel.ref, { releaseMarker: true, holdWallId: S.itemSnapWall });
    if (syncStairVoids(S.sel.ref)) render2D();
    itemMovePlanOps([S.sel.ref], S.items).forEach(broadcastPlanOp);
  }
  S.itemSnapWall = null;
  S.orientHold = false;
  if (S.stackHost || S.alignX != null || S.alignZ != null) {
    S.stackHost = null;
    S.alignX = S.alignZ = null;
  }
  S.action = null;
  fillProps();
  render2D();
}

export function rotateItems(deg) {
  if (!S.sel || S.sel.kind !== "items") return;
  pushHistory();
  var cx = 0, cz = 0;
  S.sel.refs.forEach(function(it) { cx += it.x; cz += it.z; });
  cx /= S.sel.refs.length; cz /= S.sel.refs.length;
  var a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  /* Pieces standing on a rotated piece turn with it, about the SAME centre as
     the selection — a stack has to arrive where its host arrives, so it takes
     the group's transform, not one about its own host. */
  var spun = new Set(S.sel.refs),
    riders = [];
  S.sel.refs.forEach(function (it) { descendantsOf(it, spun, riders); });
  S.sel.refs.concat(riders).forEach(function(it) {
      var dx = it.x - cx, dz = it.z - cz;
      it.x = cx + dx * ca - dz * sa;
      it.z = cz + dx * sa + dz * ca;
      it.rot = ((((it.rot || 0) + deg) % 360) + 360) % 360;
      // turned by hand -> the automatic facing leaves it alone from here
      markManualRot(it);
  });
  S.dirty3D = true;
  fillProps();
  render2D();
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
    return !!(modeler && modeler.style.display !== "none");
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
    var result = executeCommand(openingPlaceCommand, {
      wallId: wall.id,
      type: tool,
      s: projected.s,
      ...openingDrawDefaults(tool),
    }, agentCommandEnvironment(), {
      label: t("f_openingPlaced", { name: t(tool) }),
      presentation: { selectCreated: true, switchToolTo: "select" },
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
    gestureSession = captureHistorySession();
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
    if (e?.type === "pointercancel") {
      const active = S.action;
      cancelLongPress(); stopAutoPan(); dropDragProxy(); endSnapSession();
      S.wallPress = null;
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

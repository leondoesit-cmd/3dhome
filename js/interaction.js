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
} from "./geometry.js";
import {
  applyWallDrawDefaults, drawFaceBack, isWallDrawTool, extendToHit, throughCrossings,
  offsetGhost, offsetSideFromCursor, joinProposal, paintWallWithDefaults,
  reverseWallStyle, resolveWallDrawDefaults, touchEffectiveOffsetY, TOUCH_DRAW_OFFSET_PX,
} from "./wall_draw.js";
import { makeArcFromThreePoints } from "./wall_curves.js";
import {
  applyCornerRestore, applyCornerTreatmentUpdate, applyWallChamfer, applyWallFillet,
  proposeCornerRestore, proposeCornerTreatmentUpdate, proposeWallChamfer, proposeWallFillet,
} from "./wall_fillet.js";
import { isLamp } from "./furniture.js";
import { holdToWall, reseatHeldItems } from "./item_align.js";
import { applyAutoFace, markManualRot, rotStep } from "./item_orient.js";
import { t } from "./i18n.js";
import { plan, render2D, fitView, wx, wz, dropPoint, toBasePx, planRotRad, pickCon } from "./plan2d.js";
import { select, fillProps, refreshTree, flash, setLockStruct, placeFurnAt } from "./ui.js";
import { syncWallEnd } from "./ui_props.js";
import {
  pushHistory,
  beginHistory,
  commitPending,
  cancelPending,
  undo,
  redo,
} from "./history.js";
import { isWalk } from "./view3d.js";
import {
  ensureMEP, snapMEPPoint, routeResolve, wallPath, addNode, hitMEP, nodePos,
  finishRoute, cancelMEP, cancelRoute, deleteMEP, detachNodesFromWalls, runCrossesOpening,
} from "./mep.js";
import {
  isElevation, elevationHit, elevPick, elevDragTo, elevNudge,
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
import { broadcastPlanOp, sendPlanCursor } from "./plan_sync.js";
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
  addOpeningAlign,
} from "./wall_constraints.js";
import {
  syncWarnHighlight, setConstraintHover, renderWarnPanel,
} from "./ui_warn.js";
import { hudKeydown, onDrawEnded, updateCadHud, entryOpen } from "./cad_hud.js";

/* ---- hit testing (world cm -> selection) ----
   A fingertip covers roughly a 9mm disc; a mouse cursor covers one pixel. The
   pick tolerances below are authored for the mouse and widened by PICK_SLOP
   while the gesture in progress is a touch, so the same tap that looks like it
   landed on a corner actually grabs it. Only PICKING grows — snap thresholds
   stay put, since those decide what the design becomes, not what you hit. */
export var PICK_SLOP = 1;
export { touchEffectiveOffsetY, TOUCH_DRAW_OFFSET_PX };

export function setPickSlop(pointerType) {
  PICK_SLOP = pointerType === "touch" ? 1.9 : 1;
}
// Screen px of tolerance -> world cm, slop applied. Guards the degenerate
// transform (SC 0/NaN) the same way the call sites used to do by hand.
function tolCm(px) {
  var v = (px * PICK_SLOP) / S.SC;
  return isFinite(v) && v > 0 ? v : px * PICK_SLOP;
}
function hitNode(px, pz) {
  // corners of the walls actually on the plan — a corner left only by hidden
  // walls isn't drawn, so it isn't grabbable either (mirrors plan2d drawNodes)
  var hid = hiddenSets(),
    u = {},
    thr = tolCm(10),
    best = null,
    bd = thr;
  S.walls.forEach(function (w) {
    if (hid.walls[w.id]) return;
    u[w.a] = 1;
    u[w.b] = 1;
  });
  for (var k in u) {
    var n = S.nodes[k],
      d = Math.hypot(px - n.x, pz - n.z);
    if (d < bd) {
      bd = d;
      best = +k;
    }
  }
  return best;
}
function hitOpening(px, pz) {
  var hid = hiddenSets();
  for (var i = S.openings.length - 1; i >= 0; i--) {
    var o = S.openings[i],
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
  var i,
    it,
    hid = hiddenSets();
  for (i = S.items.length - 1; i >= 0; i--) {
    it = S.items[i];
    if (hid.items[it.id]) continue;
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
  for (i = S.items.length - 1; i >= 0; i--) {
    it = S.items[i];
    if (hid.items[it.id]) continue;
    if (!isLamp(it) && inItem(px, pz, it, 0)) return it;
  }
  return null;
}
function hitWall(px, pz) {
  var best = null,
    bd = 1e9,
    hid = hiddenSets();
  S.walls.forEach(function (w) {
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
  var w = S.SC > 0 ? hitWall(px, pz) : null;
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
    thr = (8 * mul) / S.SC,
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
  var spec = { x: p.x, y: 0, z: p.z, surface: "floor", wall: null, nx: 0, nz: 0 };
  var best = null,
    bd = tolCm(10);
  S.walls.forEach(function (w) {
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
export function setTool(toolName) {
  if (!toolName) toolName = "select";
  if (isElevation() && isWallDrawTool(toolName)) {
    flash(t("tool_plan_only"));
    toolName = "select";
  }
  S.tool = toolName;
  if (S.conHover != null) setConstraintHover(null);
  S.eraseHover = null;
  S.freshWall = null; // picking any tool ends the just-drawn run
  if (toolName !== "wall") finishDraw();
  if (toolName !== "arcwall") S.arcDraft = null;
  if (toolName !== "rect" && toolName !== "slabvoid") S.rectDraft = null;
  if (toolName !== "walloffset") S.offsetDraft = null;
  if (toolName !== "walljoin") S.joinPick = null;
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
  plan.style.cursor = toolName === "select" && !S.placeType ? "default" : "crosshair";
  if (toolName !== "point") S.snapInfo = null;
  document.documentElement.setAttribute("data-tool", toolName || "select");
  window.dispatchEvent(new CustomEvent("planner-tool"));
  updateCadHud();
  syncElevationTools();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("planner-draw-defaults"));
}

if (typeof window !== "undefined")
  window.addEventListener("blueprint:trace-walls", function () { setTool("wall"); });

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
    b.disabled = !!blocked;
    b.classList.toggle("elev-blocked", blocked);
    b.classList.toggle("active", b.getAttribute("data-tool") === S.tool);
    if (blocked) b.title = t("tool_plan_only");
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
  pushHistory();
  if (!S.drawing) {
    // Landing mid-span SPLITS that wall (getOrMakeNode), which is a change of
    // topology, not of somebody's stated interior dimension — see below.
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
  var nb = getOrMakeNode(p),
    made = null;
  if (nb !== S.drawFrom) {
    made = {
      id: uid(),
      a: S.drawFrom,
      b: nb,
      thickness: WALL_T,
      height: WALL_H,
    };
    applyWallDrawDefaults(made);
    S.walls.push(made);
    S.drawWalls.push(made.id);
  }
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
  if (a === b) { flash(t("hint_tool_rect")); return; }
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
  var x0 = Math.min(a.x, b.x),
    x1 = Math.max(a.x, b.x),
    z0 = Math.min(a.z, b.z),
    z1 = Math.max(a.z, b.z);
  if (x1 - x0 < 20 || z1 - z0 < 20) {
    flash(t("hint_tool_rect"));
    return null;
  }
  pushHistory();
  var n0 = getOrMakeNode(resolveLanding({ x: x0, z: z0 }, true));
  var n1 = getOrMakeNode(resolveLanding({ x: x1, z: z0 }, true));
  var n2 = getOrMakeNode(resolveLanding({ x: x1, z: z1 }, true));
  var n3 = getOrMakeNode(resolveLanding({ x: x0, z: z1 }, true));
  var walls = [
    { id: uid(), a: n0, b: n1, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: n1, b: n2, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: n2, b: n3, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: n3, b: n0, thickness: WALL_T, height: WALL_H },
  ];
  walls.forEach(applyWallDrawDefaults);
  S.walls.push(walls[0], walls[1], walls[2], walls[3]);
  walls.forEach(function (w) {
    if (wallClearLength(w) > 0) w.clearL = wallClearLength(w);
  });
  S.dirty3D = true;
  render2D();
  refreshTree();
  return walls;
}

function commitSlabFromTo(a, b) {
  var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  var z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  if (x1 - x0 < 40 || z1 - z0 < 40) {
    flash(t("hint_tool_slabvoid"));
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
    pushHistory();
    S.arcDraft = { startNode: getOrMakeNode(p), through: null };
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
  var start = S.nodes[draft.startNode], arc = makeArcFromThreePoints(start, draft.through, p);
  if (!arc) { flash(t("f_placeFail"), "error"); return null; }
  pushHistory();
  var endNode = getOrMakeNode(p), made = null;
  if (endNode !== draft.startNode) {
    made = applyWallDrawDefaults({
      id: uid(), a: draft.startNode, b: endNode, thickness: WALL_T, height: WALL_H,
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

function snapPoint(px, pz, fromIdx) {
  var origins =
    fromIdx == null ? [] : Array.isArray(fromIdx) ? fromIdx.slice() : [fromIdx];
  var mul = snapMul();
  var thr = (14 * mul) / S.SC;
  if (!isFinite(thr) || thr <= 0) thr = 14 * mul; // degenerate transform: fixed cm
  S.snapGuides = []; // recomputed below; stale guides must never linger
  S.snapInfo = null; // ditto — the HUD must never show the previous latch

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
    if (d > thr) return;
    cands.push({
      kind: kind, x: x, z: z, d: d,
      score: d * (S.SC > 0 ? S.SC : 1) - (SNAP_BONUS[kind] || 0),
      extra: extra || {},
    });
  }

  var u = usedNodes();

  // 1. existing corners
  for (var k in u) {
    if (origins.indexOf(+k) !== -1) continue;
    var n = S.nodes[k];
    offer("corner", n.x, n.z, { node: +k });
  }
  if (S.tool === "wall" && S.drawing && S.drawStart != null &&
      (S.drawWalls || []).length >= 2 && origins.indexOf(S.drawStart) === -1) {
    var st = S.nodes[S.drawStart];
    if (st) offer("close", st.x, st.z, { node: S.drawStart });
  }

  /* 2. placeholder points. These were measurable but not aimable: a point
     could anchor a dimension while being impossible to actually draw a wall
     onto, which defeats most of the reason to place one. They are datums, so
     they rank alongside corners. */
  (S.markers || []).forEach(function (m) {
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
  S.walls.forEach(function (w) {
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
  S.openings.forEach(function (o) {
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
  (S.items || []).forEach(function (it) {
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
  var extWindow = Math.max(100, thr * 8);
  for (var ia = 0; ia < S.walls.length; ia++) {
    var wa = S.walls[ia];
    if (origins.indexOf(wa.a) !== -1 || origins.indexOf(wa.b) !== -1) continue;
    /* Only wall pairs whose bounding boxes come near the cursor are tested.
       The nested loop used to run over every pair on every mouse move, which
       is fine at thirty walls and not at three hundred. */
    if (!nearCursor(wa, px, pz, extWindow)) continue;
    for (var ib = ia + 1; ib < S.walls.length; ib++) {
      var wb = S.walls[ib];
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
    S.walls.forEach(function (w) {
      if (w.a === oi || w.b === oi) return;
      var g = wallGeom(w), foot = wallProject(w, O.x, O.z), s = foot && foot.s;
      if (s <= 1 || s >= g.L - 1) return;
      offer("perpendicular", foot.x, foot.z, { wall: w, s: s });
    });
  });

  // 7. a point ON a wall — without this you can only ever connect to a corner,
  // so a wall drawn across a room left floating endpoints, never split what it
  // crossed, and produced no new rooms.
  S.walls.forEach(function (w) {
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
  S.walls.forEach(function (w) {
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
        alignTol = (12 * mul) / S.SC;
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
export function startConPick(kind, wall, end) {
  if (!wall) return false;
  S.conPick = { kind: kind, wall: wall.id, end: end === "b" ? "b" : "a" };
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
      var mk = hitMarker(px, pz);
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
export function resolveLanding(p, autoJoin) {
  if (!p || p.node != null) return p;
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
        S.drawing && S.drawFrom != null ? [S.drawFrom] : [],
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
  var hmk = hitMarker(px, pz);
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
        toSelect = S.items.filter(function (it) {
          return it.groupId === hi.groupId;
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

function targetLocked(sel) {
  if (!sel) return false;
  if (sel.kind === "item") return !!sel.ref.locked;
  if (sel.kind === "items")
    return sel.refs.length > 0 && sel.refs.every(function (i) { return i.locked; });
  return false;
}

function applyRemove(sel) {
  if (!sel) return false;
  if (sel.kind === "item") {
    S.items = S.items.filter(function (i) { return i !== sel.ref; });
    orphanChildren(null);
  } else if (sel.kind === "items") {
    var lockedSkipped = sel.refs.filter(function (i) { return i.locked; }).length;
    S.items = S.items.filter(function (i) {
      return sel.refs.indexOf(i) === -1 || i.locked;
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
  var hm = hitMEP(px, pz);
  if (hm) return hm;
  var hmk = hitMarker(px, pz);
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
    flash(t("f_itemLockedDel"), "error");
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
/* Copy an item wholesale, then override only what a copy must not share.
   Listing fields by hand here is exactly how duplicates came to silently lose
   spot/cone/pitch when the light inspector gained them — a clone cannot drift
   from the item schema, so new fields are carried for free. */
function cloneItem(src, over) {
  var it = Object.assign({}, src);
  it.id = uid();
  delete it.locked; // a copy you can't move is a trap
  delete it.groupId; // callers opt back in
  Object.assign(it, over || {});
  if (it.groupId === undefined) delete it.groupId;
  return it;
}

export function dupSel() {
  if (S.sel && S.sel.kind === "item") {
    pushHistory();
    var s = S.sel.ref,
      it = cloneItem(s, { x: s.x + 30, z: s.z + 30 });
    S.items.push(it);
    select({ kind: "item", ref: it });
    S.dirty3D = true;
    render2D();
    refreshTree();
  } else if (S.sel && S.sel.kind === "items") {
    pushHistory();
    var newItems = [];
    var newGroupId = uid();
    var hasGroup = S.sel.refs.some(function(i) { return i.groupId; });
    S.sel.refs.forEach(function(s) {
      var it = cloneItem(s, {
        x: s.x + 30,
        z: s.z + 30,
        groupId: hasGroup && s.groupId ? newGroupId : undefined,
      });
      S.items.push(it);
      newItems.push(it);
    });
    select({ kind: "items", refs: newItems });
    S.dirty3D = true;
    render2D();
    refreshTree();
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
var OPENING_DEFAULTS = {
  door: { width: 90, height: 205, sill: 0 },
  window: { width: 120, height: 120, sill: 90 },
  passage: { width: 120, height: 210, sill: 0 },
};

/* Place a door, window, or passage on the selected wall (and any wall that
   sits on the same run at that station). The plan tools do the same from a
   click; the inspector calls this so the wall does not have to be re-picked. */
export function placeOpeningOnSelected(type, opts) {
  if (!S.sel || S.sel.kind !== "wall") return null;
  type = type === "door" || type === "window" || type === "passage" ? type : "passage";
  var defs = OPENING_DEFAULTS[type];
  var w = S.sel.ref,
    gm = wallGeom(w),
    options = opts || {};
  var width = clamp(options.width != null ? options.width : defs.width, 10, gm.L);
  var height = clamp(options.height != null ? options.height : defs.height, 20, w.height);
  var sill = clamp(options.sill != null ? options.sill : defs.sill, 0, Math.max(0, w.height - height));
  var s = options.s != null ? options.s : gm.L / 2;
  s = clamp(s, width / 2, gm.L - width / 2);
  pushHistory();
  var chosenPoint = wallPointAt(w, s),
    Px = chosenPoint.x,
    Pz = chosenPoint.z,
    made = null;
  S.walls.forEach(function (x) {
    var g = wallGeom(x);
    var projected = wallProject(x, Px, Pz);
    if (projected && projected.distance < x.thickness / 2 + 6) {
      var o = {
        id: uid(),
        type: type,
        wall: x.id,
        s: projected.s,
        // a coincident wall can be shorter than the selected one
        width: Math.min(width, g.L),
        height: x === w ? height : Math.min(height, x.height),
        sill: x === w ? sill : Math.min(sill, Math.max(0, x.height - height)),
      };
      o.s = clamp(o.s, o.width / 2, Math.max(o.width / 2, g.L - o.width / 2));
      S.openings.push(o);
      if (x === w) made = o;
      else if (!made) made = o;
    }
  });
  if (!made) return null;
  S.segPreview = null;
  select({ kind: "opening", ref: made });
  S.dirty3D = true;
  render2D();
  refreshTree();
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
  pushHistory();
  var dp = dropPoint(); // never NaN, even with the plan pane hidden
  var cx = Math.round(dp.x / 10) * 10,
    cz = Math.round(dp.z / 10) * 10;
  var x0 = cx - w / 2,
    z0 = cz - d / 2,
    x1 = cx + w / 2,
    z1 = cz + d / 2,
    n = S.nodes.length;
  S.nodes.push(
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  );
  var a = [
    { id: uid(), a: n, b: n + 1, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: n + 1, b: n + 2, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: n + 2, b: n + 3, thickness: WALL_T, height: WALL_H },
    { id: uid(), a: n + 3, b: n, thickness: WALL_T, height: WALL_H },
  ];
  a.forEach(applyWallDrawDefaults);
  S.walls.push(a[0], a[1], a[2], a[3]);
  var key = a
    .map(function (x) {
      return x.id;
    })
    .sort(function (p, q) {
      return p - q;
    })
    .join(",");
  S.roomMeta[key] = { name: label, isCorridor: !!isCorridor };
  setTool("select");
  select({ kind: "room", ref: key });
  S.dirty3D = true;
  render2D();
  refreshTree();
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
export function moveItemTo(it, nx, nz) {
  var px0 = it.x,
    pz0 = it.z;
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
  it.x = a.x;
  it.z = a.z;
  /* The vertical axis of the same snap: whatever the piece now sits over
     becomes its host, and its bottom lands on that host's top. Re-run on
     every move (rather than only on drop) so the 3D view shows the piece
     climbing onto the machine while the pointer is still down. */
  var host = findSupport(it, it.x, it.z);
  if (host) stackAttach(it, host);
  else if (it.on != null) stackDetach(it);
  S.stackHost = host || null;
  // a piece standing ON the dragged piece rides along
  carryChildren(it, it.x - px0, it.z - pz0, new Set([it])).forEach(function (c) {
    touchItem3D(c, "move");
  });
  // placeItem() reads elevOffset, so the cheap "move" path already lifts
  // the piece onto its host — no rebuild needed for a change of height
  touchItem3D(it, "move");
}

/* ---- 3D-view editing (js/view3d.js drives these) ----
   The 3D view owns the picking and the ray→floor math; everything that touches
   the model itself lives here, next to the plan drag it mirrors — history,
   snapping and stacking must not fork per view. */
export function begin3DItemDrag(it) {
  if (!it || it.locked) return false;
  select({ kind: "item", ref: it });
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
  carryChildren(it, 0, 0, new Set([it])).forEach(function (c) {
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
  if (S.stackHost || S.alignX != null || S.alignZ != null) {
    S.stackHost = null;
    S.alignX = S.alignZ = null;
  }
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
    spacePan = false;
  function setSpacePan(on) {
    spacePan = !!on;
    if (plan) plan.classList.toggle("space-pan", spacePan);
  }
  window.addEventListener("keydown", function (e) {
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
      flash(t("f_itemLockedDel"), "error");
      eraseSeen[key] = 1;
      return;
    }
    if (!erasePushed) {
      pushHistory();
      erasePushed = true;
    }
    eraseSeen[key] = 1;
    if (applyRemove(hit)) finishRemove();
  }
  /* ---- two-finger tap = undo ----
     The one editing action a phone user reaches for constantly, given a
     gesture so it costs no screen at all. Armed by the second finger landing
     and disarmed by any real pinch: a tap is two fingers down and up inside
     TWOTAP_MS with the pair barely moving, which is nothing like the zoom
     gesture it shares a starting position with. */
  var TWOTAP_MS = 260,
    TWOTAP_SLOP = 16,
    twoTap = null,
    preTouchSel = null; // what was selected before this gesture's first finger
  function armTwoTap() {
    var ids = Object.keys(pointers);
    var a = pointers[ids[0]],
      b = pointers[ids[1]];
    twoTap = { t: Date.now(), d0: Math.hypot(a.x - b.x, a.y - b.y), ax: a.x, ay: a.y };
  }
  function breakTwoTap() {
    twoTap = null;
  }
  function tryTwoTap() {
    if (!twoTap) return false;
    var hit = Date.now() - twoTap.t <= TWOTAP_MS;
    twoTap = null;
    if (!hit) return false;
    /* The first finger of the gesture already picked whatever it landed on.
       The gesture means "undo", not "select this", so put the selection back
       before undoing — which then replaces it with its own if it has one. */
    S.sel = preTouchSel;
    undo();
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
      wmx: (mx - S.OX) / S.SC,
      wmy: (my - S.OY) / S.SC,
      sc: S.SC,
    };
    cancelPending();
    S.wallPress = null; // a second finger turns the gesture into navigation
    S.dragRoom = null;
    S.wallAngleGuide = null;
    S.alignX = S.alignZ = null;
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
    S.OX = mx - pinch.wmx * S.SC;
    S.OY = my - pinch.wmy * S.SC;
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
  plan.addEventListener("pointerdown", function (e) {
    setPickSlop(e.pointerType);
    plan.setPointerCapture(e.pointerId);
    var r = plan.getBoundingClientRect();
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
        pushHistory();
        var edefs = {
          door: { width: 90, height: 205, sill: 0 },
          window: { width: 120, height: 120, sill: 90 },
          passage: { width: 120, height: 210, sill: 0 },
        };
        var edd = edefs[S.tool],
          egm = wallGeom(ewh.w),
          o = {
            id: uid(),
            type: S.tool,
            wall: ewh.w.id,
            s: ewh.s,
            width: edd.width,
            height: edd.height,
            sill: edd.sill,
          };
        if (S.tool === "window" && isFinite(ewh.v))
          o.sill = Math.max(0, Math.round(ewh.v - edd.height / 2));
        o.s = clamp(o.s, o.width / 2, Math.max(o.width / 2, egm.L - o.width / 2));
        var maxSill = Math.max(0, (ewh.w.height || WALL_H) - o.height);
        o.sill = clamp(o.sill, 0, maxSill);
        S.openings.push(o);
        select({ kind: "opening", ref: o });
        setTool("select");
        S.dirty3D = true;
        render2D();
        return;
      }
      var eh = elevationHit(ox, oy);
      select(eh || null);
      if (eh && e.button !== 2) {
        if (eh.kind === "marker") {
          S.action = "markerElev";
          beginHistory();
        } else if (eh.kind === "item" && !eh.ref.locked) {
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
    var effOy = touchEffectiveOffsetY(oy, e.pointerType, S.tool, S.action);
    if (e.pointerType === "touch" && effOy !== oy) {
      S.touchContact = { ox: ox, oy: oy, effOy: effOy, pointerId: e.pointerId };
    } else if (e.pointerType === "touch") {
      S.touchContact = null;
    }
    var px = wx(ox, effOy),
      pz = wz(ox, effOy);

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
      var ws = S.walls.filter(function (w) {
        var projected = wallProject(w, px, pz);
        return projected && projected.distance < w.thickness / 2 + tolCm(12);
      });
      if (!ws.length) {
        flash(t("opening_need_wall"));
        return;
      }
      pushHistory();
      var made = null,
        defs = {
          door: { width: 90, height: 205, sill: 0 },
          window: { width: 120, height: 120, sill: 90 },
          passage: { width: 120, height: 210, sill: 0 },
        },
        dd = defs[S.tool];
      ws.forEach(function (w) {
        var gm = wallGeom(w), landing = wallProject(w, px, pz);
        var s = landing ? landing.s : 0;
        var o = {
          id: uid(),
          type: S.tool,
          wall: w.id,
          s: s,
          width: dd.width,
          height: dd.height,
          sill: dd.sill,
        };
        o.s = clamp(
          o.s,
          o.width / 2,
          Math.max(o.width / 2, gm.L - o.width / 2),
        );
        S.openings.push(o);
        if (!made) made = o;
      });
      if (made) {
        select({ kind: "opening", ref: made });
        setTool("select");
        S.dirty3D = true;
        render2D();
      }
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
      // A point dropped from above is a floor point at y=0; landing it ON a
      // wall records that wall (and which way is into the room) so it can be
      // raised up that wall from an elevation without re-picking it.
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
    // MEP entities are selectable/draggable with the select tool (before items,
    // so a device sitting on furniture is still grabbable)
    var hm = hitMEP(px, pz);
    if (hm) {
      select(hm.kind === "mepRun" ? { kind: "mepRun", ref: hm.ref } : hm);
      beginMEPDrag(hm, px, pz);
      render2D();
      return;
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
    var hc = pickCon(e.offsetX, e.offsetY);
    if (hc) {
      select({ kind: "con", ref: hc });
      renderWarnPanel(true);
      render2D();
      return;
    }
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
        return;
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
      // structure lock: pick it, read it, but don't let a stray drag move it
      if (!S.lockStruct) {
        S.action = "node";
        S.nodeDrag = { node: hn, wall: endOf ? endOf.id : null };
        S.jointsReleased = 0;
        beginHistory();
      } else S.action = null;
      render2D();
      return;
    }
    /* Placeholder points are picked before items and openings: a point is a
       ~12px target that is very often standing INSIDE the footprint of the
       object it holds, so anything with a larger hit area would bury it. */
    var hmk = hitMarker(px, pz);
    if (hmk) {
      select({ kind: "marker", ref: hmk });
      S.action = "marker";
      beginHistory();
      S.dragOff = { x: px - hmk.x, z: pz - hmk.z };
      render2D();
      return;
    }
    var ho = hitOpening(px, pz);
    if (ho) {
      select({ kind: "opening", ref: ho });
      if (S.lockStruct) {
        S.action = null;
        render2D();
        return;
      }
      S.action = "opening";
      beginHistory();
      var w2 = wallById(ho.wall),
        gm2 = wallGeom(w2);
      S.dragOff.s = (px - gm2.a.x) * gm2.ux + (pz - gm2.a.z) * gm2.uz - ho.s;
      render2D();
      return;
    }
    var hi = hitItem(px, pz);
    if (hi) {
      var toSelect = [hi];
      if (hi.groupId) {
         toSelect = S.items.filter(function(it) { return it.groupId === hi.groupId; });
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
         if (hi.locked) S.action = null;
         S.dragOff = { x: px - hi.x, z: pz - hi.z };
      }
      if (S.action) beginHistory();
      render2D();
      return;
    }
    var hv = hitSlabOpening(px, pz);
    if (hv) {
      select({ kind: "slabvoid", ref: hv });
      S.action = "slabvoid";
      beginHistory();
      S.dragOff = { x: px - hv.x, z: pz - hv.z };
      render2D();
      return;
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
        S.action = null; render2D(); return;
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
      if (!S.lockStruct) {
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
      } else S.action = null;
      render2D();
      return;
    }
    var hk = hitRoom(px, pz);
    if (hk) {
      var rm = roomByKey(hk);
      select({ kind: "room", ref: hk });
      if (rm && !S.lockStruct && !(S.roomMeta[hk] && S.roomMeta[hk].locked)) {
        S.action = "room";
        beginHistory();
        S.dragRoom = {
          sx: px,
          sz: pz,
          orig: rm.nidx.map(function (i) {
            return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
          }),
          // items sitting inside the room travel with it (relative offset kept)
          items: itemsInRoom(rm).map(function (it) {
            return { it: it, x: it.x, z: it.z };
          }),
        };
      }
      render2D();
      return;
    }
    // blank space: same "I'm done" gesture as Esc — drop the selection and
    // fall back to the select tool
    select(null);
    if (S.tool !== "select") setTool("select");
    S.action = "pan";
    S.panStart = { ox: S.OX, oy: S.OY, px: e.offsetX, py: e.offsetY };
    render2D();
  });

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
    var effOy = touchEffectiveOffsetY(e.offsetY, e.pointerType, S.tool, S.action);
    if (e.pointerType === "touch" && effOy !== e.offsetY) {
      S.touchContact = { ox: e.offsetX, oy: e.offsetY, effOy: effOy, pointerId: e.pointerId };
    } else if (e.pointerType === "touch") {
      S.touchContact = null;
    }
    var px = wx(e.offsetX, effOy),
      pz = wz(e.offsetX, effOy);
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
    if (S.tool === "wallbreak" || S.tool === "walljoin" || S.tool === "wallreverse" || S.tool === "wallpaint") {
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
    if (S.placeType && (!S.tool || S.tool === "select")) {
      var plp = snapPoint(px, pz, null);
      S.previewPt = { x: plp.x, z: plp.z };
      render2D();
      return;
    }
    // placeholder-point tool: ghost the snapped landing spot (snapPoint also
    // fills S.snapGuides, so the alignment run to a corner is visible too)
    if (S.tool === "point") {
      var pp = snapPoint(px, pz, null);
      S.markerPreview = fin(pp.x) && fin(pp.z) ? { x: pp.x, z: pp.z } : null;
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
      S.hoverItem = hitItem(px, pz);
      S.hoverPt = { x: px, z: pz };
      // a point under the cursor reads itself out without being selected —
      // same precedence as the click path, where a point wins over the piece
      // standing on it
      S.hoverMarker = hitMarker(px, pz);
      // ...and a corner under it reads out the same way, so "what meets here,
      // at what angle" is answerable without clicking anything
      S.hoverNode = S.hoverMarker == null ? hitNode(px, pz) : null;
      // Constraint labels are real pick targets, so hovering one must reveal
      // the same relation that a click would select (and the same row in the
      // side panel). Screen coordinates are used because pickCon records the
      // exact boxes rendered by the canvas.
      var hoverCon = pickCon(e.offsetX, e.offsetY);
      setConstraintHover(hoverCon);
      plan.style.cursor = hoverCon ? "pointer" : "default";
      // hovering the selected wall highlights the half you'd be resizing
      S.wallHoverHalf =
        S.sel && S.sel.kind === "wall" && hitWall(px, pz) === S.sel.ref
          ? wallHalfAt(S.sel.ref, px, pz)
          : null;
      /* Passing over a glowing corner lights up its row in the warning list —
         and hovering that row lights up the corner. Same field, both ways
         round, so the plan and the list are never telling different stories. */
      var hoverWarn = hitWarning(px, pz, tolCm(14));
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
        S.dragOrig.forEach(function(o) {
           o.it.x = o.x + mdx;
           o.it.z = o.z + mdz;
           touchItem3D(o.it, "move");
        });
        S.dragOrig.forEach(function (o) {
          carryChildren(o.it, mdx, mdz, movedSet).forEach(function (c) {
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
        S.nodes[ni].x = S.nodes[p.node].x;
        S.nodes[ni].z = S.nodes[p.node].z;
        S.jointsReleased += enforceLocks(before, active);
        dragSolve([ni, p.node]);
        // coincident is not connected — merge, or the shape only LOOKS closed.
        // The walls being dragged may change shape to make the joint; anything
        // else at that corner may not, and enforceLocks has already given those
        // their own corner back, so this weld can only touch the dragged ones.
        if (canWeld(p.node, ni, active)) {
          weldNodes(p.node, ni);
          ni = p.node;
          if (!S.nodeDrag.wall) select({ kind: "node", ref: ni });
          S.nodeDrag.node = ni;
        }
      } else if (p.wall) {
        // dropping a corner onto a wall joins it there
        var mid = splitWallAt(p.wall, p.s);
        S.nodes[ni].x = S.nodes[mid].x;
        S.nodes[ni].z = S.nodes[mid].z;
        S.jointsReleased += enforceLocks(before, active);
        dragSolve([ni, mid]);
        if (canWeld(mid, ni, active)) {
          weldNodes(mid, ni);
          ni = mid;
          if (!S.nodeDrag.wall) select({ kind: "node", ref: ni });
          S.nodeDrag.node = ni;
        }
      } else {
        S.nodes[ni].x = p.x;
        S.nodes[ni].z = p.z;
        S.jointsReleased += enforceLocks(before, active);
        dragSolve([ni]);
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
        WTHR = 12 / S.SC;
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
        catchDist = (8 * strength) / S.SC,
        previewDist = (28 * strength) / S.SC;
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
      commitPending();
      var dx = Math.round((px - S.dragRoom.sx) / SNAP_GRID) * SNAP_GRID,
        dz = Math.round((pz - S.dragRoom.sz) / SNAP_GRID) * SNAP_GRID,
        THR = 12 / S.SC;
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
  plan.addEventListener("pointermove", throttle(function (e) {
    autoPanFrom(e);
    planMove(e);
  }));

  function endAction(e) {
    cancelLongPress();
    stopAutoPan();
    /* A first wall may be drawn in one press-drag-release gesture. Keep a
       click (or tiny hand jitter) as the first half of click-click placement;
       only a deliberate drag commits here. Do this before clearing the one-shot
       snap override so the release resolves exactly like a normal wall click. */
    if (S.wallPress && (!e || e.pointerId === S.wallPress.pointerId)) {
      var wp = S.wallPress;
      S.wallPress = null;
      if (e && e.type === "pointerup" && S.tool === "wall" && S.drawing) {
        var wr = plan.getBoundingClientRect(),
          wox = e.clientX - wr.left,
          woy = e.clientY - wr.top;
        var effWoy = touchEffectiveOffsetY(woy, e.pointerType, S.tool, S.action);
        if (Math.hypot(wox - wp.x, woy - wp.y) > 5)
          {
            wallPoint(snapWallPoint(wx(wox, effWoy), wz(wox, effWoy), S.drawFrom));
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
    if (S.action === "room" && S.sel && S.sel.kind === "room") {
      var rKey = S.sel.ref;
      var rMeta = S.roomMeta[rKey];
      if (rMeta && rMeta.isCorridor) {
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
                      var exists = S.openings.some(function(op) {
                        return op.wall === x.id && Math.abs(op.s - ss) < 20;
                      });
                      if (!exists) {
                        var o = { id: uid(), type: "passage", wall: x.id, s: ss, width: width, height: x.height, sill: 0, overlapL: overlap, overlapCenter: ss };
                        S.openings.push(o);
                        newOpenings.push(o);
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

    if (S.action === "mep") {
      fillProps(); // refresh readouts (length, position) after a drag
      refreshTree(); // connectivity flags may have changed
    }
    // An object dragged clear of the point it was standing on frees that point.
    // Room drags carry their contents, so those count too.
    if (S.action === "item" && S.sel) {
      if (S.sel.kind === "item") releaseIfMoved(S.sel.ref);
      else if (S.sel.kind === "items") S.sel.refs.forEach(releaseIfMoved);
      /* A piece dropped flush against a wall is held to it from now on. Only
         when the flush snap actually engaged during THIS drag — inferring it
         from the final position alone would grab pieces that merely happen to
         end up near a wall, which is most of them in a small room. */
      var heldWall = S.itemSnapWall != null && wallById(S.itemSnapWall);
      if (heldWall && S.sel.kind === "item" && !S.sel.ref.locked)
        holdToWall(S.sel.ref, heldWall, 0);
      S.itemSnapWall = null;
      S.orientHold = false; // Alt was for that gesture, not for the session
      /* The drag may have turned the piece for you (js/item_orient.js), so the
         inspector's rotation has to be re-read — a number that disagrees with
         the plan is worse than no number. */
      fillProps();
    }
    if (S.action === "room" && S.dragRoom)
      S.dragRoom.items.forEach(function (o) { releaseIfMoved(o.it); });
    /* A corner drag is a deliberate re-dimensioning of the walls it moved, so
       those walls now HOLD what the user just drew — otherwise the very next
       edit elsewhere would snap them back to their pre-drag size. */
    if (S.action === "node" && S.nodeDrag) {
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
    if (S.action === "item" && S.sel && S.sel.kind === "item") {
      // a dragged flight of stairs takes its stairwell void with it
      if (syncStairVoids(S.sel.ref)) render2D();
      broadcastPlanOp({ type: "itemMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
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
  plan.addEventListener("pointerup", endAction);
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
  plan.addEventListener("dblclick", function () {
    if (S.tool === "wall") finishDraw();
    else if (S.tool === "arcwall" && S.arcDraft && S.arcDraft.through && S.previewPt)
      arcWallPoint(S.previewPt);
    else if (S.tool === "mepRoute") commitRoute();
  });

  plan.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      if (isElevation()) return; // elevations auto-fit; no zoom/pan
      var f = Math.pow(1.0015, -e.deltaY);
      var r = plan.getBoundingClientRect();
      var ox = e.clientX - r.left, oy = e.clientY - r.top;
      var bx = wx(ox, oy),
        bz = wz(ox, oy);
      S.SC = clamp(S.SC * f, 0.08, 6);
      // keep the world point under the cursor fixed (in the rotated base frame)
      var base = toBasePx(ox, oy);
      S.OX = base.x - bx * S.SC;
      S.OY = base.y - bz * S.SC;
      render2D();
    },
    { passive: false },
  );

  window.addEventListener("keydown", function (e) {
    if (S.workspace && S.workspace.role === "viewer") return;
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
    if (isWalk()) return;
    /* A digit typed while the wall tool is rubber-banding means "this exact
       length", not "switch to the door tool" — the precision entry gets first
       refusal on the key before the 1-6 shortcuts below can claim it. */
    if (hudKeydown(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl-combos handled in ui.js
    if (e.key === "Escape") {
      S.freshWall = null; // "I'm done" ends the just-drawn run too
      if (S.conPick) endConPick(null);
      else if (S.drawing) finishDraw();
      else if (S.offsetDraft) { S.offsetDraft = null; S.previewPt = null; render2D(); }
      else if (S.joinPick) { S.joinPick = null; render2D(); }
      else if (S.arcDraft) { S.arcDraft = null; S.previewPt = null; render2D(); }
      else if (S.rectDraft) { S.rectDraft = null; S.previewPt = null; setTool("select"); }
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
    } else if (e.key === "Enter" && S.tool === "mepRoute") {
      commitRoute();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSel();
    } else if (e.key === "r" || e.key === "R") {
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

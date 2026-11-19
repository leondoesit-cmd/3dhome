/* Dragging a piece that lives ON a wall across that wall's face
   (FURNITURE_PLACEMENT_PLAN.md Stage 3b). moveItemTo (layout_drag.js) hands
   every frame of an on-wall piece's drag here first (js/item_orient.js
   isOnWall: hung types, wall cabinets, `hold.onWall`).

   3D: the wall is the face the cursor aims at, else the one the piece is on;
       the drag ray meets that face pushed out by half the piece's depth, which
       gives (s, y): along the wall and height. 2D: the piece slides along its
       wall (s only, height kept) and crosses to another wall when the pointer
       is clearly nearer to it. Either way the grab offset in (s, y) is taken
       on the drag's first frame, so the piece never jumps under the cursor;
       moving onto another wall re-faces the piece there, keeps its height and
       puts the cursor at its centre along the new wall.
   Snaps, limits and live distances: js/wall_plane_snap.js snapOnWall, fed
   here with the other pieces on that face (their real outlines projected on
   the wall, their real heights), its openings, and its placeholder points
   (js/markers.js). Painted by js/interaction/wall_plane_guides.js.

   The top part is pure (plain data in, numbers out; tests/wall_plane_drag
   .test.mjs); the planner adapter below it reads the plan. */
import { S, touchItem3D } from "../state.js";
import { wallById } from "../geometry.js";
import { wallElevationSpan } from "../elevation.js";
import { findWallGap, rotFacing } from "../fit_cabinet.js";
import { itemVSpan, knownVSpan } from "../furniture.js";
import { holdToWall } from "../item_align.js";
import { itemOutline, outlineExtent } from "../item_outline.js";
import { isOnWall, onWallByType, wallSnapSegments } from "../item_orient.js";
import { attachToMarker, markers } from "../markers.js";
import { inputIs3D, inputScale, plannerInputView } from "../planner_input.js";
import { attach as stackAttach, descendantsOf, detach as stackDetach, findSupport, reseat as stackReseat, rotateWith } from "../stack.js";
import { rayToWallPlane, snapOnWall, wallPlanePose } from "../wall_plane_snap.js";

// 2D: another wall takes the piece when the pointer is this much nearer to its face (cm)
export var SWITCH_MARGIN = 25;
// 3D with no wall aimed: a face hit this far under the floor means the cursor is on the floor
export var FLOOR_DIP = 40;
// a piece whose back is within this of a face stands against it (its neighbours list)
export var FACE_BAND = 15;
// the pointer may be this far past a wall's end and still be beside it
var SPAN_SLACK = 30;

function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
function r1(v) { return Math.round(v * 10) / 10; }
function norm(deg) { return ((deg % 360) + 360) % 360; }

/* ---- pure ---------------------------------------------------------------- */

/** wallSnapSegments()-shaped walls -> straight pieces with a stable key (an
 *  arc's chords share its id, the key tells them apart); physical only. */
export function wallSegs(walls) {
  var out = [];
  (walls || []).forEach(function (w, i) {
    if (!w || w.physical === false || !w.a || !w.b) return;
    var dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L = Math.hypot(dx, dz);
    if (!(L > 0.5)) return;
    out.push({ key: String(w.id) + "#" + i, id: w.id, a: { x: w.a.x, z: w.a.z }, b: { x: w.b.x, z: w.b.z },
      t: Math.max(0, num(w.t, 0)), L: L, ux: dx / L, uz: dz / L });
  });
  return out;
}

/** The face frame of one side of a wall (side +1 = the side of its left
 *  normal (-uz, ux), item_align.js holdToWall's sign): origin on that face
 *  at the wall's start, u along the wall, n out of the face. */
export function wallFaceFrame(g, side) {
  var sd = side === -1 ? -1 : 1, nx = -g.uz * sd, nz = g.ux * sd;
  return { ox: g.a.x + nx * g.t / 2, oz: g.a.z + nz * g.t / 2, ux: g.ux, uz: g.uz, nx: nx, nz: nz };
}

function segLocal(g, x, z) {
  var px = x - g.a.x, pz = z - g.a.z;
  return { s: px * g.ux + pz * g.uz, d: -px * g.uz + pz * g.ux };
}
// distance from a point to a wall's face (the near one), past its ends measured to the end
function faceDist(g, x, z) {
  var l = segLocal(g, x, z), s = Math.max(0, Math.min(g.L, l.s));
  return Math.hypot(l.s - s, Math.max(0, Math.abs(l.d) - g.t / 2));
}

/** The wall face nearest a plan point: { g, side, gap } or null. `onlyId`
 *  restricts it to the chords of one wall. */
export function nearestFace(segs, x, z, onlyId) {
  var best = null;
  (segs || []).forEach(function (g) {
    if (onlyId != null && String(g.id) !== String(onlyId)) return;
    var l = segLocal(g, x, z);
    if (onlyId == null && (l.s < -SPAN_SLACK || l.s > g.L + SPAN_SLACK)) return;
    var gap = faceDist(g, x, z);
    if (!best || gap < best.gap) best = { g: g, side: l.d >= 0 ? 1 : -1, gap: gap };
  });
  return best;
}

/** The free run along a face at s (between the side walls standing in the
 *  piece's depth band; js/fit_cabinet.js findWallGap), in the frame's s. */
export function runLimits(segs, g, frame, s, depth) {
  var sc = Math.max(0, Math.min(g.L, s)),
    pick = { x: frame.ox + frame.ux * sc + frame.nx * 0.01, z: frame.oz + frame.uz * sc + frame.nz * 0.01 },
    gap = findWallGap(pick, segs.map(function (o) { return { id: o.id, a: o.a, b: o.b, t: o.t }; }), [], {
      wallId: g.id, side: { x: frame.nx, z: frame.nz }, depth: Math.max(1, depth), minWidth: 0,
    });
  if (!gap || !gap.ok) return { left: 0, right: g.L };
  var off = (gap.frame.ox - frame.ox) * frame.ux + (gap.frame.oz - frame.oz) * frame.uz;
  return { left: gap.left + off, right: gap.right + off };
}

/** The other pieces on a face as snapOnWall rects { s, y, w, h, id }: those
 *  held to this wall on this side, and any whose outline's back lies within
 *  FACE_BAND of the face (a TV unit standing under the TV). others =
 *  [{ id, poly, y, h, hold }] (poly: js/item_outline.js; y, h: real vertical
 *  span). s and w come from the outline projected on the wall. */
export function wallRects(others, g, side, frame) {
  var out = [];
  (others || []).forEach(function (o) {
    if (!o || !o.poly || !o.poly.length) return;
    var held = o.hold && String(o.hold.wall) === String(g.id) && (o.hold.side == null || o.hold.side === side);
    var q = outlineExtent(o.poly, frame.ox, frame.oz, frame.nx, frame.nz);
    if (!held && !(q.lo > -2 && q.lo < FACE_BAND)) return;
    var e = outlineExtent(o.poly, frame.ox, frame.oz, frame.ux, frame.uz);
    if (e.hi < -SPAN_SLACK || e.lo > g.L + SPAN_SLACK) return;
    out.push({ s: (e.lo + e.hi) / 2, w: e.hi - e.lo, y: num(o.y, 0), h: Math.max(0, num(o.h, 0)), id: o.id });
  });
  return out;
}

/** This wall's openings as { s, w, sill, head } (a straight wall's s is the
 *  opening's own s; an arc's chords get none). */
export function wallOpenings(openings, g, straight) {
  if (!straight) return [];
  return (openings || []).filter(function (o) { return o && String(o.wall) === String(g.id); }).map(function (o) {
    var sill = Math.max(0, num(o.sill, 0));
    return { s: num(o.s, 0), w: Math.max(0, num(o.width, 0)), sill: sill, head: sill + Math.max(0, num(o.height, 0)) };
  });
}

/** Every opening in the face a run lies on, in the frame's s: this wall's own
 *  and those of the straight walls collinear with it whose face is the same
 *  plane (js/fit_cabinet.js findWallGap joins those into one run, so a door
 *  in the next segment of a long wall is beside the piece), kept to the run
 *  { left, right }. An arc's chords get none (an opening's s runs along the
 *  arc). -> [{ s, w, sill, head, kind (the opening's type), id, wall }] */
export function runOpenings(openings, segs, g, frame, run) {
  var count = {}, face = {};
  (segs || []).forEach(function (o) { var k = String(o.id); count[k] = (count[k] || 0) + 1; });
  if (count[String(g.id)] !== 1) return [];
  segs.forEach(function (o) {
    if (count[String(o.id)] !== 1 || Math.abs(o.ux * frame.uz - o.uz * frame.ux) > 0.01) return;
    var qa = (o.a.x - frame.ox) * frame.nx + (o.a.z - frame.oz) * frame.nz,
      qb = (o.b.x - frame.ox) * frame.nx + (o.b.z - frame.oz) * frame.nz;
    if (Math.abs(qa + o.t / 2) <= 2 && Math.abs(qb + o.t / 2) <= 2) face[String(o.id)] = o;
  });
  var lo = run && Number.isFinite(run.left) ? run.left : -Infinity, hi = run && Number.isFinite(run.right) ? run.right : Infinity;
  var out = [];
  (openings || []).forEach(function (o) {
    var sg = o && face[String(o.wall)];
    if (!sg) return;
    var c = num(o.s, 0), w = Math.max(0, num(o.width, 0)), sill = Math.max(0, num(o.sill, 0)),
      s = (sg.a.x + sg.ux * c - frame.ox) * frame.ux + (sg.a.z + sg.uz * c - frame.oz) * frame.uz;
    if (s + w / 2 < lo - 0.5 || s - w / 2 > hi + 0.5) return; // past a side wall: another room
    out.push({ s: s, w: w, sill: sill, head: sill + Math.max(0, num(o.height, 0)), kind: String(o.type || "opening"), id: o.id, wall: o.wall });
  });
  return out;
}

/** Placeholder points on this face (js/markers.js, surface "wall", this wall,
 *  normal toward this side) as { s, y, id }. */
export function wallPoints(points, g, frame) {
  return (points || []).filter(function (m) {
    return m && m.surface === "wall" && String(m.wall) === String(g.id) &&
      num(m.nx, 0) * frame.nx + num(m.nz, 0) * frame.nz > 0;
  }).map(function (m) {
    return { s: (num(m.x, 0) - frame.ox) * frame.ux + (num(m.z, 0) - frame.oz) * frame.uz, y: num(m.y, 0), id: m.id };
  });
}

// the chord of wall `id` a point lies along (the nearest one)
function chordOf(segs, id, x, z) {
  var f = nearestFace(segs, x, z, id);
  return f ? f.g : null;
}

/** One frame of an on-wall drag.
 *  o = { item:{ id, type, w, d, variant, x, z, y, h }  pose before this frame
 *                                    (y = bottom, h = real vertical span)
 *        walls, others, openings, points   (plain data, see the adapters above)
 *        top:   number | function(wallId) -> the wall's top
 *        is3D, ray:{o,d}, aim:{ wallId, nx, nz, x, z } | null
 *        point:{ x, z }   the cursor on the plan
 *        held:{ wallId, side } | null   the wall the piece stands against
 *        memo   the previous frame's `memo`, null on the drag's first frame
 *        tol, lock (Shift), free (no snapping) }
 *  -> null (no wall at all) or
 *     { x, z, rot, elev, wallId, side, frame, snap, ext:{ off, w, h }, memo } */
export function solveWallDrag(o) {
  var segs = wallSegs(o.walls), it = o.item || {};
  if (!segs.length) return null;
  var depth = Math.max(0, num(it.d, 0)), h = Math.max(0, num(it.h, 0)),
    memo = o.memo ? Object.assign({}, o.memo) : null, cur = null;
  if (memo) cur = segs.find(function (g) { return g.key === memo.key; }) || null;
  var point = o.point || { x: num(it.x, 0), z: num(it.z, 0) };

  function cursorOn(g, side, keepY) {
    var f = wallFaceFrame(g, side);
    if (o.is3D && o.ray) {
      var hit = rayToWallPlane(o.ray, f, depth / 2);
      if (hit && !(o.aim == null && hit.y < -FLOOR_DIP)) return { s: hit.s, y: hit.y, ray: true };
    }
    return { s: (point.x - f.ox) * f.ux + (point.z - f.oz) * f.uz, y: keepY, ray: false };
  }

  if (!cur) {
    // first frame: the wall the piece is on, and where on it the cursor holds it
    var start = null;
    if (o.held && o.held.wallId != null) {
      var hg = chordOf(segs, o.held.wallId, num(it.x, 0), num(it.z, 0));
      if (hg) start = { g: hg, side: o.held.side === -1 ? -1 : o.held.side === 1 ? 1 : segLocal(hg, it.x, it.z).d >= 0 ? 1 : -1 };
    }
    if (!start) start = nearestFace(segs, num(it.x, 0), num(it.z, 0), null);
    if (!start) {
      // beside no wall's span: the nearest face anyway
      var any = null;
      segs.forEach(function (g) { var d = faceDist(g, it.x, it.z); if (!any || d < any.gap) any = { g: g, side: segLocal(g, it.x, it.z).d >= 0 ? 1 : -1, gap: d }; });
      start = any;
    }
    cur = start.g;
    var f0 = wallFaceFrame(cur, start.side),
      s0 = (num(it.x, 0) - f0.ox) * f0.ux + (num(it.z, 0) - f0.oz) * f0.uz,
      y0 = num(it.y, 0), c0 = cursorOn(cur, start.side, y0);
    memo = { key: cur.key, wallId: cur.id, side: start.side, offS: s0 - c0.s, offY: y0 - c0.y, start: { s: s0, y: y0 }, y: y0 };
  }

  // which wall this frame
  var next = null;
  if (o.is3D && o.aim && o.aim.wallId != null) {
    var ag = chordOf(segs, o.aim.wallId, num(o.aim.x, 0), num(o.aim.z, 0));
    if (ag) next = { g: ag, side: num(o.aim.nx, 0) * -ag.uz + num(o.aim.nz, 0) * ag.ux >= 0 ? 1 : -1 };
  } else {
    var c = o.is3D ? cursorOn(cur, memo.side, memo.y) : null;
    if (!c || !c.ray) {
      var nf = nearestFace(segs, point.x, point.z, null);
      if (nf && nf.g.key !== cur.key && nf.gap + SWITCH_MARGIN < faceDist(cur, point.x, point.z))
        next = { g: nf.g, side: nf.side };
    }
  }
  if (next && (next.g.key !== memo.key || next.side !== memo.side)) {
    cur = next.g;
    memo = { key: cur.key, wallId: cur.id, side: next.side, offS: 0, offY: memo.offY, start: null, y: memo.y };
  }

  var side = memo.side, frame = wallFaceFrame(cur, side), rot = rotFacing(frame.nx, frame.nz);
  var cc = cursorOn(cur, side, memo.y - memo.offY);
  var want = { s: cc.s + memo.offS, y: cc.ray ? cc.y + memo.offY : memo.y };
  if (!memo.start) memo.start = { s: want.s, y: want.y };

  // the piece's real extent along this wall once it faces out of it
  var ext = outlineExtent(itemOutline(it, { x: 0, z: 0, rot: rot }), 0, 0, frame.ux, frame.uz),
    off = (ext.lo + ext.hi) / 2, wAlong = ext.hi - ext.lo;
  var run = runLimits(segs, cur, frame, want.s, depth),
    top = typeof o.top === "function" ? o.top(cur.id) : o.top;
  var snap = snapOnWall({
    rect: { s: want.s + off, y: want.y, w: wAlong, h: h, id: it.id },
    wall: { left: run.left, right: run.right, top: num(top, Infinity) },
    items: wallRects(o.others, cur, side, frame),
    openings: runOpenings(o.openings, segs, cur, frame, run),
    points: wallPoints(o.points, cur, frame),
    tol: o.tol, free: !!o.free,
    lockAxis: o.is3D ? (o.lock ? true : null) : "s",
    start: o.is3D ? { s: memo.start.s + off, y: memo.start.y } : { s: want.s + off, y: memo.y },
  });
  var pose = wallPlanePose(frame, snap.s - off, snap.y, depth);
  memo.y = snap.y;
  return {
    x: pose.x, z: pose.z, rot: pose.rot, elev: pose.elev, wallId: cur.id, side: side,
    frame: frame, snap: snap, ext: { off: off, w: wAlong, h: h }, memo: memo,
  };
}

/** Where a piece goes when it is put on a wall (the itemOnWall action): flush
 *  on the nearest face within `reach`, facing out of it, height kept.
 *  -> { x, z, rot, wallId, side } or null. */
export function onWallFit(it, walls, reach) {
  var segs = wallSegs(walls), f = nearestFace(segs, num(it.x, 0), num(it.z, 0), null);
  if (!f || f.gap - num(it.d, 0) / 2 > (reach == null ? 220 : reach)) return null;
  var frame = wallFaceFrame(f.g, f.side),
    s = (num(it.x, 0) - frame.ox) * frame.ux + (num(it.z, 0) - frame.oz) * frame.uz,
    pose = wallPlanePose(frame, Math.max(0, Math.min(f.g.L, s)), 0, num(it.d, 0));
  return { x: pose.x, z: pose.z, rot: pose.rot, wallId: f.g.id, side: f.side };
}

/* ---- planner adapter ----------------------------------------------------- */

/* The drag's memo, keyed by the piece and the press that started the drag
   (S.dragOff is a new object per press); like layout_drag.js wallSnapMemo it
   is read only while S.itemSnapWall still names its wall, so it dies when the
   gesture ends (endAction / end3DItemDrag clear S.itemSnapWall). */
var live = null;
// the last frame, for the guides: kept after the drop while the piece stays put
var lastView = null;

function liveMemo(it) {
  var m = live;
  return m && m.id === it.id && m.token === S.dragOff && S.itemSnapWall != null &&
    String(S.itemSnapWall) === String(m.wallId) ? m : null;
}

function vspanOf(o) {
  var sp = knownVSpan(o);
  if (sp) return sp;
  var lo = num(o.elev, 0);
  return { lo: lo, hi: lo + num(o.h, 0) };
}

/** One frame of the drag. false: not an on-wall piece (or Alt, or no walls):
 *  moveItemTo carries on as for any piece. hooks = { apply, flash }:
 *  layout_drag.js applyResolvedItemTranslation and hit_test.js flashSnap. */
export function wallPlaneDrag(it, nx, nz, hooks) {
  if (!it || S.orientHold || !isOnWall(it)) return false;
  var span = itemVSpan(it), h = span && span.hi > span.lo ? span.hi - span.lo : num(it.h, 0);
  var riders = descendantsOf(it, new Set([it]), []), skip = new Set([it.id]);
  riders.forEach(function (r) { skip.add(r.id); });
  var view = plannerInputView(), is3D = inputIs3D(), drag = is3D && view && view.drag;
  var off = S.dragOff || { x: 0, z: 0 }, m = liveMemo(it);
  var aim = drag && drag.aim && drag.aim.wallId != null &&
    [drag.aim.nx, drag.aim.nz, drag.aim.x, drag.aim.z].every(function (v) { return Number.isFinite(Number(v)); }) ? drag.aim : null;
  var scale = num(inputScale(), 1) || 1;
  var r = solveWallDrag({
    item: { id: it.id, type: it.type, variant: it.variant, w: it.w, d: it.d, x: it.x, z: it.z, y: span ? span.lo : num(it.elev, 0), h: h },
    walls: wallSnapSegments(),
    others: (S.items || []).filter(function (o) { return o && !skip.has(o.id); }).map(function (o) {
      var sp = vspanOf(o);
      return { id: o.id, poly: itemOutline(o), y: sp.lo, h: sp.hi - sp.lo, hold: o.hold };
    }),
    openings: S.openings, points: markers(),
    top: function (id) { var w = wallById(id); return w ? wallElevationSpan(w).top : Infinity; },
    is3D: is3D, ray: drag && drag.ray, aim: aim,
    point: { x: nx + num(off.x, 0), z: nz + num(off.z, 0) },
    held: m ? null : it.hold ? { wallId: it.hold.wall, side: it.hold.side } : null,
    memo: m ? m.memo : null,
    tol: Math.max(1, Math.min(30, 8 / scale)), lock: !!S.orthoHold, free: S.snapObj === false,
  });
  if (!r) return false;
  live = { id: it.id, token: S.dragOff, wallId: r.wallId, memo: r.memo };
  applyPose(it, r, hooks);
  S.itemSnapWall = r.wallId;
  S.stackHost = null;
  lastView = { id: it.id, x: it.x, z: it.z, elev: it.elev, frame: r.frame, snap: r.snap, ext: r.ext, wallId: r.wallId };
  if (hooks && hooks.flash) {
    var k = r.snap.snapped;
    hooks.flash(it, k.s || k.y ? "wallplane:" + r.wallId + ":" + k.s + ":" + k.y : null);
  }
  return true;
}

function applyPose(it, r, hooks) {
  var delta = norm(r.rot - norm(num(it.rot, 0)));
  if (delta > 1e-6 && delta < 360 - 1e-6) {
    it.rot = r.rot;
    rotateWith(it, delta, new Set([it])).forEach(function (c) { touchItem3D(c, "move"); });
  }
  if (it.on != null) stackDetach(it); // hung at a chosen height, not standing on a host
  it.elev = r1(r.elev);
  stackReseat(it);
  descendantsOf(it, new Set([it]), []).forEach(function (c) { touchItem3D(c, "move"); });
  if (hooks && hooks.apply) hooks.apply(it, r.x, r.z, { resolveSupport: false, trackDragState: true, touch3D: true });
  else { it.x = r.x; it.z = r.z; touchItem3D(it, "move"); }
}

/** Drop time (layout_drag.js finalizeItemPlacement, before the marker
 *  release): a piece dropped while snapped onto a free placeholder point (or
 *  its own) is attached to it, so the wall drag and the Point tool end in the
 *  same state. */
export function wallPlaneDrop(it) {
  var m = it && liveMemo(it);
  if (!m || !lastView || lastView.id !== it.id) return false;
  var pid = lastView.snap && lastView.snap.pointId;
  if (pid == null) return false;
  var pt = markers().find(function (p) { return p.id === pid; });
  if (!pt || (pt.itemId != null && pt.itemId !== it.id)) return false;
  attachToMarker(pt, it);
  touchItem3D(it, "move");
  return true;
}

/** What the guides paint: the last frame of the drag of the selected piece
 *  (`dragging`), or of its last drag while it has not moved since. */
export function wallPlaneView() {
  var sel = S.sel && S.sel.kind === "item" ? S.sel.ref : null, v = lastView;
  if (!sel || !v || v.id !== sel.id) return null;
  var dragging = !!liveMemo(sel);
  if (!dragging && (Math.abs(sel.x - v.x) > 0.05 || Math.abs(sel.z - v.z) > 0.05 || num(sel.elev, -1) !== num(v.elev, -1))) return null;
  return Object.assign({ dragging: dragging }, v);
}

/** What toggleOnWall(it) would do, changing nothing: "always" and "nowall"
 *  leave the piece as it is, so the action records no history step for them.
 *  `walls` as wallSnapSegments() (the default). */
export function onWallToggleOutcome(it, walls) {
  if (!it) return null;
  if (it.hold && it.hold.onWall) return "off";
  if (onWallByType(it.type)) return "always";
  return onWallFit(it, walls || wallSnapSegments()) ? "on" : "nowall";
}

/** The itemOnWall action's edit (history and repaint are the caller's).
 *  -> "on" | "off" | "always" (a type that is always on a wall) | "nowall". */
export function toggleOnWall(it) {
  if (!it) return null;
  if (onWallByType(it.type) && !(it.hold && it.hold.onWall)) return "always";
  if (it.hold && it.hold.onWall) {
    // back to the floor, or onto whatever it now stands over
    delete it.hold.onWall;
    delete it.elev;
    var host = findSupport(it, it.x, it.z);
    if (host) stackAttach(it, host);
    stackReseat(it);
    touchAll(it);
    return "off";
  }
  var span = itemVSpan(it), keep = span ? span.lo : num(it.elev, 0);
  var fit = onWallFit(it, wallSnapSegments());
  if (!fit) return "nowall";
  var w = wallById(fit.wallId);
  if (!w) return "nowall";
  if (it.on != null) stackDetach(it);
  var delta = norm(fit.rot - norm(num(it.rot, 0)));
  if (delta > 1e-6 && delta < 360 - 1e-6) { it.rot = fit.rot; rotateWith(it, delta, new Set([it])); }
  var dx = fit.x - it.x, dz = fit.z - it.z;
  it.x = fit.x; it.z = fit.z;
  descendantsOf(it, new Set([it]), []).forEach(function (c) { c.x += dx; c.z += dz; });
  it.elev = r1(keep);
  holdToWall(it, w, 0);
  it.hold.onWall = 1;
  stackReseat(it);
  touchAll(it);
  return "on";
}
function touchAll(it) {
  touchItem3D(it, "move");
  descendantsOf(it, new Set([it]), []).forEach(function (c) { touchItem3D(c, "move"); });
}

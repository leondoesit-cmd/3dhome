/* Dragging a piece across a wall: the wall plane, and the snaps on it.

   Pure: no planner state, no DOM, no three. The adapter
   (js/interaction/wall_plane_drag.js) builds plain numbers from the plan and
   gets numbers back, so Node can test every case.

   Wall coordinates, in cm:
     s  distance along the wall face (the wall frame's u axis); a rect's s is
        its CENTRE along the wall, as an opening's s is.
     y  height above the floor; a rect's y is its BOTTOM (= the item's elev).

   A wall frame is { ox, oz, ux, uz, nx, nz }: origin on the wall FACE at s=0,
   u the unit tangent, n the unit face normal pointing into the room (the
   `frame` shape js/fit_cabinet.js findWallGap returns). */
import { rotFacing } from "./fit_cabinet.js";

export const WALL_SNAP_DEFAULTS = Object.freeze({
  tol: 8, // cm; the caller passes 8 px / scale
  step: 1, // cm; the grid when nothing snaps
});

function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
function r1(v) { return Math.round(v * 10) / 10; }

/* The drag ray against the wall face pushed out by depthOffset along n.
   ray = { o:{x,y,z}, d:{x,y,z} } -> { s, y } or null (parallel, or behind). */
export function rayToWallPlane(ray, f, depthOffset) {
  if (!ray || !ray.o || !ray.d || !f) return null;
  var dn = ray.d.x * f.nx + ray.d.z * f.nz;
  if (Math.abs(dn) < 1e-6) return null;
  var off = num(depthOffset, 0);
  var px = f.ox + f.nx * off, pz = f.oz + f.nz * off;
  var t = ((px - ray.o.x) * f.nx + (pz - ray.o.z) * f.nz) / dn;
  if (!(t >= 0)) return null;
  var hx = ray.o.x + ray.d.x * t, hy = ray.o.y + ray.d.y * t, hz = ray.o.z + ray.d.z * t;
  return { s: (hx - f.ox) * f.ux + (hz - f.oz) * f.uz, y: hy };
}

/* The item pose for (s, y) on a wall: a piece `depth` deep whose back sits on
   the face, front (local +Z) along n. x, z = centre of the footprint; rot in
   degrees, js/item_orient.js's convention (front = (-sin rot, cos rot)),
   exact, via fit_cabinet.js rotFacing; elev = y (the piece's bottom). */
export function wallPlanePose(f, s, y, depth) {
  var half = Math.max(0, num(depth, 0)) / 2;
  return {
    x: f.ox + f.ux * s + f.nx * half,
    z: f.oz + f.uz * s + f.nz * half,
    rot: rotFacing(f.nx, f.nz),
    elev: num(y, 0),
  };
}

/* ---- snapping ----------------------------------------------------------- */

function sCandidates(r, wall, items, openings, points) {
  var w = r.w, out = [], full = { lo: 0, hi: Number.isFinite(wall.top) ? wall.top : r.y + r.h };
  function add(v, at, kind, ref, id) { out.push({ v: v, at: at, kind: kind, ref: ref, id: id }); }
  // placeholder points on this wall (js/markers.js): the piece's CENTRE on the point (first: a tie goes to the point)
  (points || []).forEach(function (p) {
    add(p.s, p.s, "point", p.y > 0.5 ? { lo: p.y, hi: p.y } : full, p.id);
  });
  if (Number.isFinite(wall.left)) add(wall.left + w / 2, wall.left, "end", full);
  if (Number.isFinite(wall.right)) add(wall.right - w / 2, wall.right, "end", full);
  if (Number.isFinite(wall.left) && Number.isFinite(wall.right)) {
    var c = (wall.left + wall.right) / 2;
    add(c, c, "run-centre", full);
  }
  items.forEach(function (it) {
    var L = it.s - it.w / 2, R = it.s + it.w / 2, ref = { lo: it.y, hi: it.y + it.h };
    add(R + w / 2, R, "item-edge", ref, it.id);
    add(L - w / 2, L, "item-edge", ref, it.id);
    add(L + w / 2, L, "item-edge", ref, it.id);
    add(R - w / 2, R, "item-edge", ref, it.id);
    add(it.s, it.s, "item-centre", ref, it.id);
  });
  openings.forEach(function (o) {
    var L = o.s - o.w / 2, R = o.s + o.w / 2, ref = { lo: o.sill, hi: o.head };
    add(R + w / 2, R, "opening-edge", ref);
    add(L - w / 2, L, "opening-edge", ref);
    add(L + w / 2, L, "opening-edge", ref);
    add(R - w / 2, R, "opening-edge", ref);
    add(o.s, o.s, "opening-centre", ref);
  });
  // equal gaps: centred between the nearest neighbour on each side
  var spans = items.map(function (it) { return { lo: it.s - it.w / 2, hi: it.s + it.w / 2 }; })
    .concat(openings.map(function (o) { return { lo: o.s - o.w / 2, hi: o.s + o.w / 2 }; }));
  var ln = null, rn = null;
  spans.forEach(function (p) {
    if (p.hi <= r.s && (!ln || p.hi > ln.hi)) ln = p;
    if (p.lo >= r.s && (!rn || p.lo < rn.lo)) rn = p;
  });
  if (ln && rn && rn.lo - ln.hi >= w) {
    var m = (ln.hi + rn.lo) / 2;
    add(m, m, "equal", full);
  }
  return out;
}

function yCandidates(r, wall, items, openings, points) {
  var h = r.h, out = [];
  function add(v, at, kind, ref, id) { out.push({ v: v, at: at, kind: kind, ref: ref, id: id }); }
  // a point up the wall: centred on it in height too (a floor-level point
  // leaves the height alone, as js/markers.js seatItem does)
  (points || []).forEach(function (p) {
    if (p.y > 0.5) add(p.y - h / 2, p.y, "point", { lo: p.s, hi: p.s }, p.id);
  });
  var run = { lo: Number.isFinite(wall.left) ? wall.left : r.s - r.w / 2, hi: Number.isFinite(wall.right) ? wall.right : r.s + r.w / 2 };
  add(0, 0, "floor", run);
  if (Number.isFinite(wall.top)) add(wall.top - h, wall.top, "ceiling", run);
  items.forEach(function (it) {
    var B = it.y, T = it.y + it.h, ref = { lo: it.s - it.w / 2, hi: it.s + it.w / 2 };
    add(T, T, "item-top", ref, it.id); // standing on it / hung just above it
    add(B - h, B, "item-bottom", ref, it.id);
    add(B, B, "item-bottom", ref, it.id);
    add(T - h, T, "item-top", ref, it.id);
    add((B + T) / 2 - h / 2, (B + T) / 2, "item-centre", ref, it.id);
  });
  openings.forEach(function (o) {
    var ref = { lo: o.s - o.w / 2, hi: o.s + o.w / 2 };
    if (o.sill > 0.5) { add(o.sill - h, o.sill, "sill", ref); add(o.sill, o.sill, "sill", ref); }
    if (Number.isFinite(o.head)) { add(o.head, o.head, "head", ref); add(o.head - h, o.head, "head", ref); }
  });
  return out;
}

// nearest candidate within tol that keeps the piece inside its limits; ties keep the earlier one
function nearest(cands, raw, tol, clamp) {
  var best = null;
  cands.forEach(function (c) {
    var dist = Math.abs(c.v - raw);
    if (dist > tol || Math.abs(clamp(c.v) - c.v) > 1e-6) return;
    if (!best || dist < best.dist - 1e-9) best = Object.assign({ dist: dist }, c);
  });
  return best;
}

/* How far below the piece's mid-height a side's quieter "-end" dim runs (cm),
   so it does not lie on top of the nearer stop's line. */
export const END_DIM_DROP = 12;

// what a dim reached: { reach, id?, what? } (what: the opening's type)
function reachOf(p) {
  if (!p) return { reach: "end" };
  var r = { reach: p.src };
  if (p.id != null) r.id = p.id;
  if (p.src === "opening") r.what = p.what;
  return r;
}

function dimsFor(s, y, w, h, wall, items, openings) {
  var lo = s - w / 2, hi = s + w / 2, out = [];
  function push(d, p) { out.push(Object.assign(d, p)); }
  push({ axis: "y", kind: "floor", from: 0, to: y, value: r1(y), at: s }, { reach: "floor" });
  if (Number.isFinite(wall.top)) push({ axis: "y", kind: "ceiling", from: y + h, to: wall.top, value: r1(wall.top - y - h), at: s }, { reach: "ceiling" });
  var all = items.map(function (it) { return { lo: it.s - it.w / 2, hi: it.s + it.w / 2, b: it.y, t: it.y + it.h, src: "item", id: it.id }; })
    .concat(openings.map(function (o) { return { lo: o.s - o.w / 2, hi: o.s + o.w / 2, b: o.sill, t: o.head, src: "opening", id: o.id, what: o.kind || "opening" }; }));
  // straight down / up: the nearest thing under / over the piece's own width
  var below = null, above = null;
  all.forEach(function (p) {
    if (!(p.lo < hi - 0.01 && p.hi > lo + 0.01)) return;
    if (p.t <= y + 0.01 && (below == null || p.t > below.t)) below = p;
    if (p.b >= y + h - 0.01 && (above == null || p.b < above.b)) above = p;
  });
  if (below != null) push({ axis: "y", kind: "below", from: below.t, to: y, value: r1(y - below.t), at: s }, reachOf(below));
  if (above != null && Number.isFinite(above.b)) push({ axis: "y", kind: "above", from: y + h, to: above.b, value: r1(above.b - y - h), at: s }, reachOf(above));
  var spans = all.filter(function (p) { return p.b < y + h && p.t > y; }); // only what is level with the piece
  var WL = Number.isFinite(wall.left) ? wall.left : null, WR = Number.isFinite(wall.right) ? wall.right : null,
    L = WL, R = WR, lp = null, rp = null;
  spans.forEach(function (p) {
    if (p.hi <= lo + 0.01 && (L == null || p.hi > L)) { L = p.hi; lp = p; }
    if (p.lo >= hi - 0.01 && (R == null || p.lo < R)) { R = p.lo; rp = p; }
  });
  var mid = y + h / 2, endAt = mid - END_DIM_DROP >= 1 ? mid - END_DIM_DROP : mid + END_DIM_DROP;
  if (L != null) push({ axis: "s", kind: "left", from: L, to: lo, value: r1(lo - L), at: mid }, reachOf(lp));
  if (R != null) push({ axis: "s", kind: "right", from: hi, to: R, value: r1(R - hi), at: mid }, reachOf(rp));
  // an opening is the nearer stop: the run's end (the corner) still matters for planning
  if (lp && lp.src === "opening" && WL != null && WL < L - 0.01)
    push({ axis: "s", kind: "left-end", from: WL, to: lo, value: r1(lo - WL), at: endAt }, { reach: "end" });
  if (rp && rp.src === "opening" && WR != null && WR > R + 0.01)
    push({ axis: "s", kind: "right-end", from: hi, to: WR, value: r1(WR - hi), at: endAt }, { reach: "end" });
  return out;
}

/* Snap a piece being dragged across a wall.
   o = { rect:{ s, y, w, h, id? }   the wanted pose (s = centre, y = bottom)
         wall:{ left, right, top }  the free run in s and the wall's top at the piece
         items:[{ s, y, w, h, id }] other pieces on this wall (rect.id is skipped)
         openings:[{ s, w, sill, head }]
         points:[{ s, y, id }]  placeholder points on this face (js/markers.js):
                  the piece's CENTRE snaps to one (kind "point"); y <= 0.5 is a
                  floor-level point, which only offers s
         tol      cm (8 px / scale), default 8
         lockAxis "s" | "y" (move along that axis only) | true (the dominant one
                  from `start`) | falsy
         start:{ s, y }  the pose at drag start (Shift lock)
         free     Alt: no snapping, no grid; limits still apply }
   -> { s, y, lock, pointId (the point the piece now sits on, or null),
        snapped:{ s, y } (kinds or null),
        guides:[{ axis, at, from, to, kind, id? }],  axis "s": a vertical line at s=at
              from y=from to y=to; axis "y": a horizontal line at y=at from s=from to s=to
        dims:[{ axis, kind, from, to, value, at }] }
          kind "floor"/"ceiling": to the floor / the wall top (always);
          "below"/"above": to the nearest piece or opening under / over the
          piece's own width (only when there is one); "left"/"right": to the
          nearest thing level with it, else the end of the run;
          "left-end"/"right-end": when an opening is that side's nearer stop,
          the distance to the run's end as well (at = mid-height less
          END_DIM_DROP, so the two lines do not overlap).
          Every dim also says what it reached: reach "floor" | "ceiling" |
          "end" | "item" (+ id) | "opening" (+ id, what: the opening's type);
          openings:[{ s, w, sill, head, kind?, id? }] (kind: "door", "window", ...) */
export function snapOnWall(o) {
  o = o || {};
  var r = o.rect || {}, wl = o.wall || {};
  var wall = { left: num(wl.left, -Infinity), right: num(wl.right, Infinity), top: num(wl.top, Infinity) };
  var w = Math.max(0, num(r.w, 0)), h = Math.max(0, num(r.h, 0));
  var items = (o.items || []).filter(function (it) { return it && (r.id == null || it.id !== r.id); }).map(function (it) {
    return { s: num(it.s, 0), y: num(it.y, 0), w: Math.max(0, num(it.w, 0)), h: Math.max(0, num(it.h, 0)), id: it.id };
  });
  var openings = (o.openings || []).filter(Boolean).map(function (p) {
    var sill = num(p.sill, 0);
    return { s: num(p.s, 0), w: Math.max(0, num(p.w, 0)), sill: sill, head: num(p.head, Infinity), kind: p.kind, id: p.id };
  });
  var points = (o.points || []).filter(Boolean).map(function (p) {
    return { s: num(p.s, 0), y: num(p.y, 0), id: p.id };
  });
  var tol = Math.max(0, num(o.tol, WALL_SNAP_DEFAULTS.tol));
  var s = num(r.s, 0), y = num(r.y, 0), start = o.start, lock = null;
  if (o.lockAxis === "s" || o.lockAxis === "y") lock = o.lockAxis;
  else if (o.lockAxis && start) lock = Math.abs(s - num(start.s, s)) >= Math.abs(y - num(start.y, y)) ? "s" : "y";
  if (lock === "s" && start) y = num(start.y, y);
  if (lock === "y" && start) s = num(start.s, s);

  function clampS(v) {
    if (w >= wall.right - wall.left) return (wall.left + wall.right) / 2;
    return Math.max(wall.left + w / 2, Math.min(wall.right - w / 2, v));
  }
  function clampY(v) {
    if (h >= wall.top) return 0;
    return Math.max(0, Math.min(wall.top - h, v));
  }
  s = clampS(s); y = clampY(y);
  var pick = { s: null, y: null };
  if (!o.free) {
    var rr = { s: s, y: y, w: w, h: h };
    if (lock !== "y") pick.s = nearest(sCandidates(rr, wall, items, openings, points), s, tol, clampS);
    if (lock !== "s") pick.y = nearest(yCandidates(rr, wall, items, openings, points), y, tol, clampY);
    var step = WALL_SNAP_DEFAULTS.step;
    s = pick.s ? pick.s.v : lock === "y" ? s : clampS(Math.round(s / step) * step);
    y = pick.y ? pick.y.v : lock === "s" ? y : clampY(Math.round(y / step) * step);
  }

  var guides = [];
  if (pick.s) guides.push(Object.assign({
    axis: "s", at: pick.s.at, kind: pick.s.kind,
    from: Math.min(y, pick.s.ref.lo), to: Math.max(y + h, pick.s.ref.hi),
  }, pick.s.id != null ? { id: pick.s.id } : {}));
  if (pick.y) guides.push(Object.assign({
    axis: "y", at: pick.y.at, kind: pick.y.kind,
    from: Math.min(s - w / 2, pick.y.ref.lo), to: Math.max(s + w / 2, pick.y.ref.hi),
  }, pick.y.id != null ? { id: pick.y.id } : {}));
  // the piece sits ON a point: centred on it along the wall, and in height
  // too unless the point is at floor level (its height is left alone there)
  var pointId = null;
  if (pick.s && pick.s.kind === "point") {
    var pt = points.find(function (p) { return p.id === pick.s.id; });
    if (pt && (pt.y <= 0.5 ? true : pick.y && pick.y.kind === "point" && pick.y.id === pt.id)) pointId = pt.id;
  }
  return {
    s: s, y: y, lock: lock, pointId: pointId,
    snapped: { s: pick.s ? pick.s.kind : null, y: pick.y ? pick.y.kind : null },
    guides: guides,
    dims: dimsFor(s, y, w, h, wall, items, openings),
  };
}

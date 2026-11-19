/* Where a dragged (or newly placed) piece goes relative to the walls.
   ---------------------------------------------------------------------------
   One resolver for "flush by default, never through a wall"
   (FURNITURE_PLACEMENT_PLAN.md, Stage 1). Plain data in, a pose out: no
   three.js, no DOM, no planner state, so it runs in Node as it is. The caller
   turns the plan's walls into straight segments (an arc as its chords) and
   decides the piece's mode (item_orient.js orientMode).

   Rules, in order:
     1. AIMED WALL (3D). The wall face the cursor is on: the piece goes flush
        on that face, at the aim point along the wall.
     2. CAPTURE BY NEARNESS. Otherwise the nearest face whose gap to the
        piece's near face is under the capture distance for its kind; once
        flush it lets go only beyond RELEASE_MUL × that (hysteresis via `prev`).
     3. CORNER. Then the same test once against the walls not parallel to the
        first one, sliding along the first wall into the corner.
     4. COLLISION. The rotated footprint may not overlap a physical wall's
        solid, and the centre may not cross a wall's line inside its span. It
        is pushed back flush to the side it came from — unless the target lies
        past the far face by more than the piece's reach + TUNNEL_CLEAR and fits
        there, which is a deliberate move into the next room.
     5. A wall with `physical === false` neither captures nor blocks.
   `free` (Alt) skips everything; `snap: false` skips 1–3 (collision stays);
   `collide: false` skips 4. Item-against-item collision is not done here:
   stacking depends on pieces overlapping.

   Rotation convention (as item_align.js reseatHeldItems and placement_resolver
   itemCorners): local +X in the world is (cos a, sin a), local +Z (front) is
   (-sin a, cos a). */
import { itemCorners, polygonsOverlap } from "./placement_resolver.js";

// how far a piece's near face may be from a wall face to be pulled flush (cm)
export var CAPTURE = { hung: 220, wall: 30, run: 30, seat: 9, free: 9 };
// once flush, the piece lets go only past this multiple of its capture distance
export var RELEASE_MUL = 1.6;
// how far past the far face (beyond the piece's own reach) a target must lie
// before a wall is crossed rather than pushed against
export var TUNNEL_CLEAR = 30;
// a hung piece is pulled into a corner only from this close (cm), not from
// its whole 220 cm reach
export var HUNG_CORNER = 30;
// |sin| of the angle between two walls under which they count as parallel
var PARALLEL_SIN = 0.34;
var EPS = 1e-6;

function num(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}
function sgn(v) {
  return v > EPS ? 1 : v < -EPS ? -1 : 0;
}

function segOf(w) {
  if (!w || w.physical === false || !w.a || !w.b) return null;
  var ax = num(w.a.x), az = num(w.a.z), dx = num(w.b.x) - ax, dz = num(w.b.z) - az,
    L = Math.hypot(dx, dz);
  if (!(L > 0.5)) return null;
  var ux = dx / L, uz = dz / L;
  return { id: w.id, ax: ax, az: az, L: L, ux: ux, uz: uz, nx: -uz, nz: ux, t: Math.max(0, num(w.t)) };
}
// (s along the wall from a, signed distance on the wall's +normal)
function local(sg, x, z) {
  var px = x - sg.ax, pz = z - sg.az;
  return { s: px * sg.ux + pz * sg.uz, d: px * sg.nx + pz * sg.nz };
}
function at(sg, s, d) {
  return { x: sg.ax + sg.ux * s + sg.nx * d, z: sg.az + sg.uz * s + sg.nz * d };
}

/* Half the piece's footprint measured along the unit direction (nx,nz): how
   far its face reaches from its centre toward a wall with that normal. */
export function footReach(item, nx, nz) {
  var a = (num(item && item.rot) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  return (num(item && item.w) / 2) * Math.abs(ca * nx + sa * nz) +
    (num(item && item.d) / 2) * Math.abs(-sa * nx + ca * nz);
}

// does the piece (half-length `ru` along the wall) at station s lie beside the wall?
function inSpan(sg, s, ru) {
  return s + ru > -sg.t / 2 && s - ru < sg.L + sg.t / 2;
}

/* Which face of `sg` the piece belongs on when it goes from `p` (its pose
   last frame) toward `q`. The side it came from, unless its centre crosses
   the wall's line inside the span AND lands past the far face by more than
   its reach + TUNNEL_CLEAR: that is a move into the next room. */
function sideFor(sg, p, q, rn, ru) {
  var lp = local(sg, p.x, p.z), lq = local(sg, q.x, q.z),
    ps = sgn(lp.d), qs = sgn(lq.d);
  if (!ps) return { side: qs || 1, crossed: false, tunnel: false };
  if (!qs || qs === ps) return { side: ps, crossed: false, tunnel: false };
  var f = lp.d / (lp.d - lq.d), sx = lp.s + f * (lq.s - lp.s);
  if (!inSpan(sg, sx, ru)) return { side: qs, crossed: false, tunnel: false };
  var past = lq.d * qs - sg.t / 2;
  if (past > rn + TUNNEL_CLEAR) return { side: qs, crossed: true, tunnel: true };
  return { side: ps, crossed: true, tunnel: false };
}

function capOf(mode, mul) {
  var c = CAPTURE[mode] != null ? CAPTURE[mode] : CAPTURE.wall;
  return mode === "hung" ? c : c * mul;
}

// the centre's distance from the wall's line for the piece to sit flush
function flushOff(sg, item) {
  return sg.t / 2 + footReach(item, sg.nx, sg.nz);
}

function aimedFlush(item, segs, aim) {
  var sg = null;
  for (var i = 0; i < segs.length; i++) {
    if (String(segs[i].id) !== String(aim.wallId)) continue;
    // an arc comes as several chords of one id: the chord the aim point is on
    var la = local(segs[i], num(aim.x), num(aim.z));
    if (!sg || (la.s >= 0 && la.s <= segs[i].L)) sg = segs[i];
    if (la.s >= 0 && la.s <= segs[i].L) break;
  }
  if (!sg) return null;
  var side = num(aim.nx) * sg.nx + num(aim.nz) * sg.nz >= 0 ? 1 : -1,
    s = local(sg, num(aim.x), num(aim.z)).s,
    p = at(sg, s, side * flushOff(sg, item));
  return { sg: sg, side: side, x: p.x, z: p.z };
}

function nearestFlush(item, segs, q, cap, prev) {
  var best = null, bestGap = Infinity;
  segs.forEach(function (sg) {
    var rn = footReach(item, sg.nx, sg.nz), ru = footReach(item, sg.ux, sg.uz),
      lq = local(sg, q.x, q.z);
    if (!inSpan(sg, lq.s, ru)) return;
    // the side comes from the move (a deliberate crossing flips it); being
    // held on that same face last frame only widens the release distance
    var side = sideFor(sg, item, q, rn, ru).side,
      held = prev && prev.wallId != null && String(prev.wallId) === String(sg.id) &&
        (prev.side == null || prev.side === side),
      gap = Math.abs(lq.d * side - sg.t / 2 - rn),
      limit = cap * (held ? RELEASE_MUL : 1);
    if (gap >= limit || gap >= bestGap) return;
    bestGap = gap;
    var p = at(sg, lq.s, side * (sg.t / 2 + rn));
    best = { sg: sg, side: side, x: p.x, z: p.z };
  });
  return best;
}

// slide along the first wall into a corner with a non-parallel one
function cornerFlush(item, segs, first, cap, prev) {
  var s1 = first.sg, best = null, bestGap = Infinity;
  segs.forEach(function (sg) {
    if (String(sg.id) === String(s1.id)) return;
    var dot = s1.ux * sg.nx + s1.uz * sg.nz; // |sin| of the angle between the walls
    if (Math.abs(dot) < PARALLEL_SIN) return;
    var rn = footReach(item, sg.nx, sg.nz), ru = footReach(item, sg.ux, sg.uz),
      l = local(sg, first.x, first.z);
    if (!inSpan(sg, l.s, ru)) return;
    var held = prev && prev.corner != null && String(prev.corner) === String(sg.id),
      side = sideFor(sg, item, first, rn, ru).side,
      want = sg.t / 2 + rn,
      gap = Math.abs(l.d * side - want),
      limit = cap * (held ? RELEASE_MUL : 1);
    if (gap >= limit || gap >= bestGap) return;
    var delta = (want - l.d * side) / (dot * side);
    bestGap = gap;
    best = { sg: sg, side: side, x: first.x + s1.ux * delta, z: first.z + s1.uz * delta };
  });
  return best;
}

function wallRect(sg) {
  var h = sg.t / 2, ex = sg.ux * sg.L, ez = sg.uz * sg.L;
  return [
    { x: sg.ax + sg.nx * h, z: sg.az + sg.nz * h },
    { x: sg.ax + ex + sg.nx * h, z: sg.az + ez + sg.nz * h },
    { x: sg.ax + ex - sg.nx * h, z: sg.az + ez - sg.nz * h },
    { x: sg.ax - sg.nx * h, z: sg.az - sg.nz * h },
  ];
}
function overlapsWall(item, x, z, sg) {
  return polygonsOverlap(itemCorners(item, x, z, num(item.rot)), wallRect(sg));
}
function fitsAt(item, x, z, segs) {
  return !segs.some(function (sg) { return overlapsWall(item, x, z, sg); });
}

/* Rule 4. Returns { x, z, blocked, wallId, side } — wallId/side of the last
   wall it was pushed against (it ends flush there). `keep` { wallId, side }:
   the face the capture already chose for that wall (from the aim, or a
   deliberate crossing judged on the pointer's target): kept, not re-judged
   from the snapped point. */
function collide(item, q, segs, keep) {
  var p = { x: num(item.x), z: num(item.z) },
    cur = { x: q.x, z: q.z },
    out = { blocked: false, wallId: null, side: null, tangent: null };
  for (var pass = 0; pass < 4; pass++) {
    var moved = false;
    for (var i = 0; i < segs.length; i++) {
      var sg = segs[i], rn = footReach(item, sg.nx, sg.nz), ru = footReach(item, sg.ux, sg.uz),
        sd = keep && String(keep.wallId) === String(sg.id) && (keep.side === 1 || keep.side === -1)
          ? { side: keep.side, crossed: false, tunnel: false }
          : sideFor(sg, p, cur, rn, ru);
      if (sd.tunnel && fitsAt(item, cur.x, cur.z, segs)) continue;
      if (!sd.crossed && !overlapsWall(item, cur.x, cur.z, sg)) continue;
      var lc = local(sg, cur.x, cur.z), want = sg.t / 2 + rn;
      if (!sd.crossed && lc.d * sd.side >= want - 0.05) continue;
      var push = want - lc.d * sd.side;
      cur = { x: cur.x + sg.nx * sd.side * push, z: cur.z + sg.nz * sd.side * push };
      out.blocked = true;
      out.wallId = sg.id;
      out.side = sd.side;
      out.tangent = { ux: sg.ux, uz: sg.uz };
      moved = true;
    }
    if (!moved) break;
  }
  if (out.blocked && !fitsAt(item, cur.x, cur.z, segs) && fitsAt(item, p.x, p.z, segs)) {
    // wedged (an acute corner the pushes cannot settle): stay where it was
    cur = { x: p.x, z: p.z };
    out.wallId = null;
    out.side = null;
    out.tangent = null;
  }
  out.x = cur.x;
  out.z = cur.z;
  return out;
}

/** resolveItemDrag({ item, target, walls, mode, aim, prev, free, mul, snap, collide, keep })
    item   { type, w, d, rot, x, z } — its pose BEFORE this frame (x, z = where it came from)
    target { x, z }                  — where the pointer wants the centre
    walls  [{ id, a:{x,z}, b:{x,z}, t, physical }] — straight pieces; an arc as its chords
    mode   "hung" | "wall" | "run" | "seat" | "free"   (item_orient.js orientMode)
    aim    { wallId, nx, nz, x, z } | null — the wall face under the cursor (3D)
    prev   { wallId, side, corner } | null — what it was flush to last frame
    free   Alt held: the target, untouched
    mul    snap distance scale (snapMul / input scale); hung capture ignores it
    snap   false: no magnetic capture (rules 1–3), collision stays
    collide false: capture only
    keep   { wallId, side } — a capture pass's result handed to a later
           collision-only pass, so the face it chose is not undone
  → { x, z, wallId, side, flush, corner, blocked, tangent }
    tangent {ux, uz} of the wall (the chord, for an arc) it is flush to, or null */
export function resolveItemDrag(o) {
  o = o || {};
  var item = o.item || {}, tg = o.target || {},
    out = { x: num(tg.x), z: num(tg.z), wallId: null, side: null, flush: false, corner: null, blocked: false, tangent: null };
  if (o.free) return out;
  var segs = (o.walls || []).map(segOf).filter(Boolean);
  if (!segs.length) return out;
  var mode = CAPTURE[o.mode] != null ? o.mode : "wall",
    mul = num(o.mul) > 0 ? num(o.mul) : 1,
    prev = o.prev || null,
    q = { x: out.x, z: out.z };
  if (o.snap !== false) {
    var cap = capOf(mode, mul),
      first = o.aim && o.aim.wallId != null && mode !== "free" ? aimedFlush(item, segs, o.aim) : null;
    if (!first) first = nearestFlush(item, segs, q, cap, prev);
    if (first) {
      var cc = mode === "hung" ? Math.min(cap, HUNG_CORNER * mul) : cap,
        corner = cornerFlush(item, segs, first, cc, prev),
        fin = corner || first;
      out.x = fin.x;
      out.z = fin.z;
      out.wallId = first.sg.id;
      out.side = first.side;
      out.flush = true;
      out.corner = corner ? corner.sg.id : null;
      out.tangent = { ux: first.sg.ux, uz: first.sg.uz };
    }
  }
  if (o.collide !== false) {
    var keep = out.flush ? { wallId: out.wallId, side: out.side } : o.keep || null,
      c = collide(item, { x: out.x, z: out.z }, segs, keep);
    out.x = c.x;
    out.z = c.z;
    out.blocked = c.blocked;
    if (c.wallId != null && !out.flush) {
      out.wallId = c.wallId;
      out.side = c.side;
      out.flush = true;
      out.tangent = c.tangent;
    }
  }
  return out;
}

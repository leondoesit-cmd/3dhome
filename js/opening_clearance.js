/* Doors, windows and passages in a FLOOR piece's live distances, pure (the
   planner adapter is js/measure.js measureSides / measureVertical; the
   on-wall drag has its own, js/interaction/wall_plane_drag.js runOpenings).

   - Along a wall: a piece standing against a wall (its outline within
     NEAR_WALL of the face, or held to it: `held`) gets, on each side along
     that wall, the distance from its outline to the nearest edge of an
     opening in that wall whose height range overlaps the piece's, when that
     is nearer than what the side's sweep already reports (kind "opening").
     The line runs on the wall face, from the piece's extreme point along
     the wall to the opening's edge.
   - Up: a piece against a wall whose top is below a window's sill in that
     wall, overlapping the window's width, gets the distance up to the sill
     when that is nearer than the up hit it already has.
   - Facing: a side hit that reports a wall (kind "wall") within FACING_REACH,
     with the piece overlapping an opening's width in that wall, is marked
     `facing: <type>` and `openingId` (the piece stands in front of it).

   Walls are { id, a, b, t, arc? } (centre line; an arc's chord gets no
   openings), openings { id, wall, kind, s, w, sill, head } in the wall's own
   s (from its start, along it). Distances in cm. */
import { wallGap } from "./clearance.js";

export var NEAR_WALL = 20;
export var FACING_REACH = 100;

// item_outline.js outlineExtent (kept local: that module pulls the furniture tables in)
function outlineExtent(poly, ox, oz, ux, uz) {
  var lo = Infinity, hi = -Infinity;
  poly.forEach(function (p) { var v = (p.x - ox) * ux + (p.z - oz) * uz; if (v < lo) lo = v; if (v > hi) hi = v; });
  return { lo: lo, hi: hi };
}

// the wall's frame toward the piece: u along it, n out of the face toward the piece
function frameOf(w, poly) {
  var dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L = Math.hypot(dx, dz);
  if (!(L > 1e-9)) return null;
  var ux = dx / L, uz = dz / L, nx = -uz, nz = ux, cx = 0, cz = 0;
  poly.forEach(function (p) { cx += p.x / poly.length; cz += p.z / poly.length; });
  if ((cx - w.a.x) * nx + (cz - w.a.z) * nz < 0) { nx = -nx; nz = -nz; }
  var h = (Number(w.t) || 0) / 2;
  return {
    L: L, ux: ux, uz: uz, nx: nx, nz: nz,
    at: function (s, lift) { var q = h + (lift || 0); return { x: w.a.x + ux * s + nx * q, z: w.a.z + uz * s + nz * q }; },
  };
}

function byWall(openings) {
  var m = {};
  (openings || []).forEach(function (o) {
    if (!o) return;
    var k = String(o.wall);
    (m[k] = m[k] || []).push(o);
  });
  return m;
}

// the walls the piece stands against, each with its frame, extent along it and openings
function againstWalls(o) {
  var poly = o.poly, ops = byWall(o.openings), held = {}, out = [];
  (o.held || []).forEach(function (id) { if (id != null) held[String(id)] = true; });
  (o.walls || []).forEach(function (w) {
    var list = ops[String(w.id)];
    if (!list || !list.length || w.arc || !w.a || !w.b) return;
    var g = wallGap(poly, w);
    if (!held[String(w.id)] && (!g || g.gap > NEAR_WALL)) return;
    var f = frameOf(w, poly);
    if (f) out.push({ w: w, f: f, ext: outlineExtent(poly, w.a.x, w.a.z, f.ux, f.uz), ops: list });
  });
  return out;
}

function overlapsV(op, span) {
  return !span || (op.sill < span.hi - 0.5 && op.head > span.lo + 0.5);
}

/** The side distances to openings, and the facing marks.
 *  o = { poly, span:{lo, hi}, dirs (clearance.js sideDirs), walls, openings,
 *        held:[wallId], hits (floorClearances' result) }
 *  -> a new hit list: `hits` (copied; a facing wall hit gains facing,
 *     openingId) followed by the added
 *     { dir, kind:"opening", gap, from:{x,z}, to:{x,z}, id (opening), wallId, what (its type) } */
export function openingSideHits(o) {
  var hits = (o.hits || []).map(function (h) { return Object.assign({}, h); });
  var poly = o.poly, dirs = o.dirs || [];
  if (!poly || !poly.length || !(o.openings && o.openings.length)) return hits;
  var best = {};
  againstWalls(o).forEach(function (a) {
    a.ops.forEach(function (op) {
      if (!overlapsV(op, o.span)) return;
      var olo = op.s - op.w / 2, ohi = op.s + op.w / 2, sign = 0, gap = 0, s0 = 0, s1 = 0;
      if (ohi <= a.ext.lo + 0.01) { sign = -1; gap = a.ext.lo - ohi; s0 = a.ext.lo; s1 = ohi; }
      else if (olo >= a.ext.hi - 0.01) { sign = 1; gap = olo - a.ext.hi; s0 = a.ext.hi; s1 = olo; }
      else return; // the piece stands in front of it: see facing
      if (gap < 0.5) return;
      var vx = a.f.ux * sign, vz = a.f.uz * sign, dir = null, dot = -Infinity;
      dirs.forEach(function (d) { var k = d.x * vx + d.z * vz; if (k > dot) { dot = k; dir = d; } });
      if (!dir || dot < 0.5) return;
      if (best[dir.key] && best[dir.key].gap <= gap) return;
      best[dir.key] = { dir: dir.key, kind: "opening", gap: gap, from: a.f.at(s0), to: a.f.at(s1), id: op.id, wallId: a.w.id, what: op.kind || "opening" };
    });
  });
  // facing: a wall hit square in front of an opening the piece overlaps
  var walls = {};
  (o.walls || []).forEach(function (w) { walls[String(w.id)] = w; });
  var ops = byWall(o.openings);
  hits.forEach(function (h) {
    if (h.kind !== "wall" || !(h.gap <= FACING_REACH)) return;
    var w = walls[String(h.id)], list = ops[String(h.id)];
    if (!w || w.arc || !list) return;
    var f = frameOf(w, poly);
    if (!f) return;
    var ext = outlineExtent(poly, w.a.x, w.a.z, f.ux, f.uz), mid = (ext.lo + ext.hi) / 2, pick = null;
    list.forEach(function (op) {
      if (!(op.s - op.w / 2 < ext.hi - 0.5 && op.s + op.w / 2 > ext.lo + 0.5)) return;
      if (!pick || Math.abs(op.s - mid) < Math.abs(pick.s - mid)) pick = op;
    });
    if (pick) { h.facing = pick.kind || "opening"; h.openingId = pick.id; }
  });
  dirs.forEach(function (d) {
    var b = best[d.key];
    if (!b) return;
    var side = hits.filter(function (h) { return h.dir === d.key && (h.kind === "wall" || h.kind === "item"); })[0];
    if (!side || b.gap < side.gap - 0.01) hits.push(b);
  });
  return hits;
}

/** Up to a window's sill: a piece against a wall, under a window in it.
 *  o = { poly, span:{lo, hi}, walls, openings, held, up (the up hit it has, or null) }
 *  -> { dir:"up", kind:"opening", gap, from:{x,y,z}, to:{x,y,z}, id, wallId, what } or null
 *  (points on the wall face, 1 cm into the room, over the middle of the overlap). */
export function openingSillHit(o) {
  var poly = o.poly, span = o.span;
  if (!poly || !poly.length || !span || !(o.openings && o.openings.length)) return null;
  var best = null;
  againstWalls(o).forEach(function (a) {
    a.ops.forEach(function (op) {
      if (!(op.sill > 0.5) || op.sill < span.hi - 0.5) return;
      var lo = Math.max(a.ext.lo, op.s - op.w / 2), hi = Math.min(a.ext.hi, op.s + op.w / 2);
      if (!(hi > lo + 0.5)) return;
      if (best && best.op.sill <= op.sill) return;
      best = { op: op, a: a, s: (lo + hi) / 2 };
    });
  });
  if (!best) return null;
  var gap = best.op.sill - span.hi;
  if (!(gap >= 0.5)) return null;
  if (o.up && o.up.to && Number(o.up.to.y) <= best.op.sill + 0.01) return null; // something nearer already
  var p = best.a.f.at(best.s, 1);
  return {
    dir: "up", kind: "opening", gap: gap, from: { x: p.x, y: span.hi, z: p.z }, to: { x: p.x, y: best.op.sill, z: p.z },
    id: best.op.id, wallId: best.a.w.id, what: best.op.kind || "opening",
  };
}

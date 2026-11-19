/* The planner side of kept distances (js/item_keep.js), as pure pieces the
   planner adapter (js/item_keep_scene.js) feeds with the plan: the plain
   scene, typing a distance (hit -> keep -> translation), adding a keep with
   its refusals, the re-seat pass over every piece with keeps, and a held
   piece's gap. Plain data in, plain data out; no three, no DOM, no S. */
import {
  applyKeep, canAddKeep, keepFromFloorHit, keepFromWallDim, keepOrder, measureKeep,
  normalizeKeep, normalizeKeeps, pruneKeeps, solveKeeps, wouldCycle,
} from "./item_keep.js";

function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
function fin(v) { return typeof v === "number" && Number.isFinite(v); }

/** A plan opening (S.openings: `s` is its CENTRE along the wall from the
 *  wall's start, `sill` its bottom, `height` its height) as the keep model
 *  reads it: { id, wall, s, width, sill, head }. */
export function openingForKeep(o) {
  if (!o || o.id == null || o.wall == null) return null;
  var sill = Math.max(0, num(o.sill, 0));
  return { id: o.id, wall: o.wall, s: num(o.s, 0), width: Math.max(0, num(o.width, 0)), sill: sill, head: sill + Math.max(0, num(o.height, 0)) };
}

/** buildKeepScene({ walls, openings, items, ceiling }, deps) -> the scene of
 *  js/item_keep.js. deps: geom(wall) -> { a, b, L, kind? } (the plan's
 *  wallGeom; arcs, kind other than "line", are left out), outline(item),
 *  span(item) -> { lo, hi } | null. Walls with physical === false are out;
 *  an opening counts on a wall that is in. */
export function buildKeepScene(src, deps) {
  src = src || {};
  var walls = [], ids = {};
  (src.walls || []).forEach(function (w) {
    if (!w || w.physical === false) return;
    var g = deps.geom(w);
    if (!g || !(g.L > 0) || (g.kind && g.kind !== "line") || !g.a || !g.b) return;
    walls.push({ id: w.id, a: { x: g.a.x, z: g.a.z }, b: { x: g.b.x, z: g.b.z }, t: Math.max(0, num(w.thickness, 0)) });
    ids[String(w.id)] = 1;
  });
  var openings = (src.openings || []).map(openingForKeep).filter(function (o) { return o && ids[String(o.wall)]; });
  var items = [];
  (src.items || []).forEach(function (it) {
    if (!it || it.id == null) return;
    var poly = deps.outline(it), sp = deps.span(it);
    if (!Array.isArray(poly) || poly.length < 2) return;
    var elev = num(it.elev, 0);
    items.push({ id: it.id, outline: poly, lo: sp && fin(sp.lo) ? sp.lo : elev, hi: sp && fin(sp.hi) ? sp.hi : elev + num(it.h, 0) });
  });
  var out = { walls: walls, items: items, openings: openings };
  if (fin(src.ceiling)) out.ceiling = src.ceiling;
  return out;
}

/** A loaded piece's `keep` (js/ui.js applyDataRequest's whitelist):
 *  normalized, or undefined when nothing is left. */
export function keptOnLoad(raw) {
  var k = normalizeKeeps(raw);
  return k.length ? k : undefined;
}

/** The piece as the keep model reads it. */
export function keepItemOf(it, outline, span) {
  var elev = num(it && it.elev, 0);
  return {
    id: it.id, outline: outline, x: num(it.x, 0), z: num(it.z, 0),
    lo: span && fin(span.lo) ? span.lo : elev, hi: span && fin(span.hi) ? span.hi : elev + num(it.h, 0),
  };
}
export function shiftedItem(me, d) {
  var dx = num(d && d.dx, 0), dz = num(d && d.dz, 0), dy = num(d && d.dy, 0);
  return {
    id: me.id, outline: me.outline.map(function (p) { return { x: p.x + dx, z: p.z + dz }; }),
    x: me.x + dx, z: me.z + dz, lo: me.lo + dy, hi: me.hi + dy,
  };
}

function refKey(r) {
  return [r.kind, r.id == null ? "" : String(r.id), r.edge || "", r.end || ""].join("|");
}
/** Do two keeps measure the same thing (a live distance and a stored keep)? */
export function sameMeasure(a, b) {
  a = normalizeKeep(a); b = normalizeKeep(b);
  if (!a || !b || refKey(a.ref) !== refKey(b.ref)) return false;
  if (a.axis === "y" || b.axis === "y") return a.axis === b.axis && a.sign === b.sign;
  if (a.ref.kind !== "item") return true;
  return a.axis.x * b.axis.x + a.axis.z * b.axis.z > 0.98;
}
/** The index of the stored keep that measures what `keep` does, or -1. */
export function matchKeep(keeps, keep) {
  var list = Array.isArray(keeps) ? keeps : [];
  for (var i = 0; i < list.length; i++) if (sameMeasure(list[i], keep)) return i;
  return -1;
}

/** What a pill measured, as a keep (value = the current distance), or null:
 *  a keep ({ ref }), a wall-plane distance ({ dim, frame, wall, items?,
 *  openings? }) or a floor hit (js/measure_cache.js). */
export function toKeep(src, me, scene) {
  if (!src || typeof src !== "object") return null;
  if (src.ref) return normalizeKeep(src);
  if (src.keep && src.keep.ref) return normalizeKeep(src.keep);
  if (src.dim) return keepFromWallDim(src.dim, me, { scene: scene, wall: src.wall, frame: src.frame, items: src.items, openings: src.openings });
  return keepFromFloorHit(src, me, { scene: scene });
}

/** Typing a distance: planDistance(keeps, keep, value, me, scene) ->
 *  { dx, dz, dy, keep (normalized, value set), index (the stored keep it is,
 *  or -1), me (the piece moved) } or { error }: js/item_keep.js applyKeep's
 *  codes, and "parallel-conflict" when the piece's other kept distances would
 *  pull it straight back. */
export function planDistance(keeps, keep, value, me, scene) {
  var k = normalizeKeep(keep);
  if (!k) return { error: "invalid" };
  var r = applyKeep(k, value, me, scene);
  if (r.error) return r;
  var list = normalizeKeeps(keeps), index = matchKeep(list, k), moved = shiftedItem(me, r);
  var others = list.filter(function (_, i) { return i !== index; });
  if (others.length) {
    var s = solveKeeps(others, moved, scene);
    if (Math.abs(s.dx) + Math.abs(s.dz) + Math.abs(s.dy) > 0.05) return { error: "parallel-conflict" };
  }
  k.value = typeof value === "string" ? Number(value) : value;
  return { dx: r.dx, dz: r.dz, dy: r.dy, keep: k, index: index, me: moved };
}

/** May the piece keep this distance? -> { ok: true } | { ok: false, reason }:
 *  "cycle" (pieces kept to each other in a loop) or canAddKeep's reasons.
 *  all: [{ id, keep }] every piece with keeps. me: the piece where the keep
 *  will hold (after the move that sets its value). */
export function checkAddKeep(all, itemId, keeps, keep, me, scene) {
  // the piece itself takes part even when it keeps nothing yet (a chain back to it is the loop)
  var list = (all || []).filter(function (e) { return e && String(e.id) !== String(itemId); }).concat([{ id: itemId, keep: keeps || [] }]);
  if (wouldCycle(list, itemId, keep)) return { ok: false, reason: "cycle" };
  return canAddKeep(keeps, keep, { itemId: itemId, item: me, scene: scene });
}

/** A held piece's gap to its wall (js/item_align.js it.hold.gap) at the
 *  piece's pose `me`, or null when the wall is not in the scene. */
export function holdGap(hold, me, scene) {
  if (!hold || hold.wall == null) return null;
  var g = measureKeep({ axis: { x: 1, z: 0 }, ref: { kind: "wall", id: hold.wall, side: hold.side === -1 ? -1 : 1 } }, me, scene);
  return g == null ? null : Math.max(0, g);
}

function refsIn(keeps, set) {
  return keeps.some(function (k) { return k.ref.kind === "item" && set.has(String(k.ref.id)); });
}

/** The re-seat pass: reseatKept(items, deps, opts) -> { moved:[item],
 *  pruned:[item], conflicts:{ id: [{ index, reason }] } }.
 *  items: the plan's pieces (those with `keep` take part, in keepOrder: a
 *  piece kept to another comes after it). For each: keeps whose reference is
 *  gone are dropped (an emptied list is deleted), then solveKeeps moves it
 *  through deps.move(item, { dx, dz, dy }) unless it is locked or
 *  deps.skip(item). deps.scene() is asked again for each piece (a piece moved
 *  before it may be its reference); deps.me(item) is the piece now.
 *  opts.only: ids (strings) of the pieces that changed; only those and the
 *  pieces kept to them (in a chain) take part. Without it, all do. */
export function reseatKept(items, deps, opts) {
  var out = { moved: [], pruned: [], conflicts: {} }, only = opts && opts.only ? new Set(Array.from(opts.only, String)) : null;
  var withKeeps = (items || []).filter(function (it) { return it && it.id != null && Array.isArray(it.keep) && it.keep.length; });
  if (!withKeeps.length) return out;
  var byId = {};
  withKeeps.forEach(function (it) { if (!byId[String(it.id)]) byId[String(it.id)] = it; });
  keepOrder(withKeeps.map(function (it) { return { id: it.id, keep: it.keep }; })).order.forEach(function (id) {
    var it = byId[String(id)];
    if (!it) return;
    var scene = deps.scene(), had = normalizeKeeps(it.keep), kept = pruneKeeps(it.keep, scene);
    if (kept.length !== had.length) {
      out.pruned.push(it);
      if (kept.length) it.keep = kept;
      else delete it.keep;
    }
    if (!kept.length) return;
    if (only && !only.has(String(it.id)) && !refsIn(kept, only)) return;
    var s = solveKeeps(kept, deps.me(it), scene);
    if (s.conflicts.length) out.conflicts[String(it.id)] = s.conflicts;
    if (it.locked || (deps.skip && deps.skip(it))) return;
    if (Math.abs(s.dx) + Math.abs(s.dz) + Math.abs(s.dy) <= 1e-6) return;
    deps.move(it, { dx: s.dx, dz: s.dz, dy: s.dy });
    out.moved.push(it);
    if (only) only.add(String(it.id));
  });
  return out;
}

/** Keeps that point at something no longer in the scene, dropped (no moves):
 *  pruneAll(items, scene) -> the items whose list changed. */
export function pruneAll(items, scene) {
  var changed = [];
  (items || []).forEach(function (it) {
    if (!it || !Array.isArray(it.keep)) return;
    var had = normalizeKeeps(it.keep), kept = pruneKeeps(it.keep, scene);
    if (kept.length === had.length && had.length === it.keep.length) return;
    if (kept.length) it.keep = kept;
    else delete it.keep;
    changed.push(it);
  });
  return changed;
}

/** For painting: each stored keep of a piece with its distance now and
 *  whether it holds (within `tol`, 0.05 cm). */
export function keepStates(keeps, me, scene, tol) {
  var t = tol == null ? 0.05 : tol;
  return normalizeKeeps(keeps).map(function (k, i) {
    var gap = me ? measureKeep(k, me, scene) : null;
    return { index: i, keep: k, gap: gap, ok: gap != null && k.value != null && Math.abs(gap - k.value) <= t };
  });
}

/** Where to draw a kept distance on its own: { a, b } world points, the
 *  piece's side first (y given for vertical ones; horizontal ones lie on the
 *  floor, y absent). */
export function keepSegment(keep, me, gap) {
  var k = normalizeKeep(keep);
  if (!k || !me || !Array.isArray(me.outline) || !me.outline.length || !fin(gap)) return null;
  var cx = 0, cz = 0;
  me.outline.forEach(function (p) { cx += p.x / me.outline.length; cz += p.z / me.outline.length; });
  if (k.axis === "y") {
    var y0 = k.sign > 0 ? me.hi : me.lo, y1 = y0 + k.sign * gap;
    return { a: { x: cx, y: y0, z: cz }, b: { x: cx, y: y1, z: cz } };
  }
  var best = null, bd = -Infinity;
  me.outline.forEach(function (p) {
    var d = p.x * k.axis.x + p.z * k.axis.z;
    if (d > bd + 1e-6) { bd = d; best = p; }
  });
  // the extreme edge's middle, when two corners share it
  var tied = me.outline.filter(function (p) { return Math.abs(p.x * k.axis.x + p.z * k.axis.z - bd) <= 1e-6; });
  if (tied.length > 1) best = { x: tied.reduce(function (s, p) { return s + p.x; }, 0) / tied.length, z: tied.reduce(function (s, p) { return s + p.z; }, 0) / tied.length };
  return { a: { x: best.x, z: best.z }, b: { x: best.x + k.axis.x * gap, z: best.z + k.axis.z * gap } };
}

/** parseDistanceInput(text, parse) -> cm, or NaN. `parse(text)` is the
 *  planner's unit parser (js/display_units.js parseLen with the furniture
 *  domain); a decimal comma is read as a point, and blanks are ignored. */
export function parseDistanceInput(text, parse) {
  var raw = String(text == null ? "" : text).trim().replace(/\s+/g, " ");
  if (!raw) return NaN;
  if (/^-?\d+,\d+/.test(raw) && raw.indexOf(".") === -1) raw = raw.replace(",", ".");
  var v = parse(raw);
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}


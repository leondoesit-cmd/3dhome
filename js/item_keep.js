/* Kept distances: a shown clearance turned into something the user can edit
   ("type 60") or keep ("stay 60 cm from this wall"). Pure: plain data in,
   plain data out; no three, no DOM, no planner state.

   Storage convention (the planner adapter owns it): `it.keep = [keep, ...]`
   on the item, at most KEEP_MAX (3), beside the older single-wall relation
   `it.hold` (js/item_align.js holdToWall / reseatHeldItems), which it does
   not replace. An adapter re-seats held pieces first, then kept ones in
   keepOrder(); a piece with both should not keep the hold's wall again.

   A keep names WHAT is measured, never where things are now:
     {
       axis:  "y"                vertical (up / down), or
              { x, z }           unit plan direction from the piece TOWARD the
                                 reference, as it was when the keep was made.
                                 Refs anchored to a wall (wall, opening,
                                 wall-end) re-derive it from the wall each time,
                                 so it follows a wall that turns; item refs
                                 use it as stored (a "near" line keeps the
                                 direction it had when made).
       sign:  +1 | -1            vertical only: +1 the reference is above,
                                 -1 below. Always +1 for a horizontal keep.
       ref: {
         kind: "wall"            perpendicular gap to the wall's face
               "item"            gap to another piece (sweep along axis, or
                                 top/bottom spans when vertical)
               "opening"         a door/window edge: a jamb (horizontal) or
                                 sill/head (vertical)
               "wall-end"        the end of a wall's free run (along it)
               "floor"|"ceiling" vertical only
         id:   wall / item / opening id (absent for floor, ceiling)
         side: +1|-1             wall, wall-end: which face (+1 = the side the
                                 wall normal (-dz, dx)/L of a->b points to),
                                 recorded when made, like it.hold.side
         edge: "a"|"b"           opening, horizontal: the jamb nearer the
                                 wall's end a / b;
               "sill"|"head"     opening, vertical
         end:  "a"|"b"           wall-end: which end of the wall
       },
       value: cm >= 0            the kept distance (absent: descriptor only)
       src:   "side"|"near"|"vertical"|"wall-plane"   where it was made (UI only)
     }

   Distances (cm, signed: negative = past / into the reference):
     wall      min over the outline of its distance to the face (the outline's
               extreme point toward it, js/clearance.js wallGap), ignoring
               whether that point is beside the wall's extent;
     item      js/clearance.js sweepGap along axis; when the other piece is
               off to the side of the swept band, or the two overlap, the
               projected gap along axis instead;
     opening / wall-end   the projected gap along the wall from the outline's
               extreme point to the jamb / run end;
     vertical  span gaps: ref above: refY - hi; below: lo - refY.
   Scene, plain data:
     { walls:[{ id, a:{x,z}, b:{x,z}, t }],
       items:[{ id, outline:[{x,z}], lo, hi }],        (may include the piece)
       openings:[{ id, wall, s, width, sill, head }],  s: CENTRE, cm from the
                                                       wall's a along a->b
       ceiling }                                       cm, or absent
   The piece: { id, outline (world cm, at its current pose), x, z, lo, hi }. */

export var KEEP_MAX = 3;

var EPS = 1e-9, TOL = 0.01, ITER = 12, MATCH = 0.05, PARALLEL = 0.02;
var KINDS = { wall: 1, item: 1, opening: 1, "wall-end": 1, floor: 1, ceiling: 1 };
var SRCS = { side: 1, near: 1, vertical: 1, "wall-plane": 1 };

function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
function fin(v) { return typeof v === "number" && Number.isFinite(v); }
function sameId(a, b) { return a === b || (a != null && b != null && String(a) === String(b)); }
function cross(a, b) { return a.x * b.z - a.z * b.x; }
function dot(a, b) { return a.x * b.x + a.z * b.z; }
function unit(x, z) {
  var L = Math.hypot(x, z);
  return L > 1e-9 ? { x: x / L, z: z / L } : null;
}
function clean(v) { return Math.abs(v) < 1e-9 ? 0 : v; }

/* ---- geometry (js/clearance.js's definitions, kept local) -------------- */

function raySeg(ox, oz, dx, dz, a, b) {
  var ex = b.x - a.x, ez = b.z - a.z, den = dx * ez - dz * ex;
  if (Math.abs(den) < EPS) return null;
  var wx = a.x - ox, wz = a.z - oz,
    t = (wx * ez - wz * ex) / den, u = (wx * dz - wz * dx) / den;
  if (t < -1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
  return Math.max(0, t);
}
function segsCross(a, b, c, d) {
  function o(p, q, r) { return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x); }
  var d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}
function inPoly(p, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function overlap(A, B) {
  for (var i = 0; i < A.length; i++)
    for (var j = 0; j < B.length; j++)
      if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return A.some(function (p) { return inPoly(p, B); }) || inPoly(B[0], A);
}
// first contact of A moving along unit d toward B (null: B is not in the way)
function sweep(A, B, d) {
  var best = null;
  A.forEach(function (p) {
    for (var j = 0; j < B.length; j++) {
      var t = raySeg(p.x, p.z, d.x, d.z, B[j], B[(j + 1) % B.length]);
      if (t != null && (best == null || t < best)) best = t;
    }
  });
  B.forEach(function (q) {
    for (var i = 0; i < A.length; i++) {
      var t = raySeg(q.x, q.z, -d.x, -d.z, A[i], A[(i + 1) % A.length]);
      if (t != null && (best == null || t < best)) best = t;
    }
  });
  return best;
}
function centroid(poly) {
  var cx = 0, cz = 0;
  poly.forEach(function (p) { cx += p.x / poly.length; cz += p.z / poly.length; });
  return { x: cx, z: cz };
}
// the outline pulled 0.05 cm toward its centre: touching is not overlapping
function shrink(poly) {
  var c = centroid(poly);
  return poly.map(function (p) {
    var u = unit(c.x - p.x, c.z - p.z);
    return u ? { x: p.x + u.x * 0.05, z: p.z + u.z * 0.05 } : p;
  });
}
function shift(poly, dx, dz) { return poly.map(function (p) { return { x: p.x + dx, z: p.z + dz }; }); }
function maxAlong(poly, a) {
  var m = -Infinity;
  poly.forEach(function (p) { m = Math.max(m, p.x * a.x + p.z * a.z); });
  return m;
}
function okPoly(poly) {
  return Array.isArray(poly) && poly.length >= 2 && poly.every(function (p) { return p && fin(p.x) && fin(p.z); });
}

function wallGeo(w) {
  if (!w || !w.a || !w.b) return null;
  var ax = num(w.a.x, NaN), az = num(w.a.z, NaN), bx = num(w.b.x, NaN), bz = num(w.b.z, NaN),
    L = Math.hypot(bx - ax, bz - az);
  if (!(L > EPS)) return null;
  var ux = (bx - ax) / L, uz = (bz - az) / L;
  return { a: { x: ax, z: az }, b: { x: bx, z: bz }, L: L, ux: ux, uz: uz, nx: -uz, nz: ux, t: Math.max(0, num(w.t, 0)) };
}
function wallPoly(g) {
  var h = g.t / 2, nx = g.nx * h, nz = g.nz * h;
  return [
    { x: g.a.x + nx, z: g.a.z + nz }, { x: g.b.x + nx, z: g.b.z + nz },
    { x: g.b.x - nx, z: g.b.z - nz }, { x: g.a.x - nx, z: g.a.z - nz },
  ];
}
function sideOf(g, poly) {
  var c = centroid(poly);
  return (c.x - g.a.x) * g.nx + (c.z - g.a.z) * g.nz >= 0 ? 1 : -1;
}
function segDist(p, a, b) {
  var ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez,
    u = L2 > EPS ? ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(p.x - a.x - ex * u, p.z - a.z - ez * u);
}

/* Where a wall face's free run ends, in s from a along a->b: the inner face
   of a wall that meets it at that end, else the wall's own end. */
function runLimit(g, wallId, end, side, scene) {
  var h = g.t / 2, fo = { x: g.a.x + g.nx * side * h, z: g.a.z + g.nz * side * h },
    u = { x: g.ux, z: g.uz }, E = end === "a" ? g.a : g.b, best = end === "a" ? 0 : g.L;
  ((scene && scene.walls) || []).forEach(function (w) {
    if (!w || sameId(w.id, wallId)) return;
    var o = wallGeo(w);
    if (!o || segDist(E, o.a, o.b) > o.t / 2 + h + 1) return;
    var P = wallPoly(o);
    for (var i = 0; i < 4; i++) {
      var p = P[i], e = { x: P[(i + 1) % 4].x - p.x, z: P[(i + 1) % 4].z - p.z }, den = cross(u, e);
      if (Math.abs(den) < EPS) continue;
      var wv = { x: p.x - fo.x, z: p.z - fo.z }, s = cross(wv, e) / den, t = cross(wv, u) / den;
      if (t < -1e-7 || t > 1 + 1e-7) continue;
      if (end === "a" && s <= g.L / 2 && s > best) best = s;
      if (end === "b" && s >= g.L / 2 && s < best) best = s;
    }
  });
  return best;
}

/* ---- scene lookups ------------------------------------------------------ */

function findIn(list, id) {
  return (list || []).find(function (x) { return x && sameId(x.id, id); }) || null;
}
function wallOf(scene, id) { return findIn(scene && scene.walls, id); }
function itemOf(scene, id) {
  var it = findIn(scene && scene.items, id);
  return it && okPoly(it.outline) ? it : null;
}
function openingOf(scene, id) {
  var o = findIn(scene && scene.openings, id);
  return o && wallGeo(wallOf(scene, o.wall)) ? o : null;
}
function moved(item, dx, dz, dy) {
  return {
    id: item.id, outline: shift(item.outline, dx, dz),
    x: num(item.x, 0) + dx, z: num(item.z, 0) + dz,
    lo: num(item.lo, NaN) + dy, hi: num(item.hi, NaN) + dy,
  };
}

/* ---- the keep object ---------------------------------------------------- */

function refKey(r) {
  return [r.kind, r.id == null ? "" : String(r.id), r.edge || "", r.end || "", r.side || ""].join("|");
}

/** normalizeKeep(raw) -> a clean keep, or null when it cannot mean anything. */
export function normalizeKeep(raw) {
  if (!raw || typeof raw !== "object" || !raw.ref || typeof raw.ref !== "object") return null;
  var r = raw.ref, kind = r.kind;
  if (!KINDS[kind]) return null;
  var ref = { kind: kind }, vertical = raw.axis === "y", out;
  if (kind !== "floor" && kind !== "ceiling") {
    if (r.id == null || (typeof r.id !== "string" && typeof r.id !== "number") || r.id === "") return null;
    ref.id = r.id;
  }
  if (vertical) {
    var sign = raw.sign === 1 || raw.sign === -1 ? raw.sign : kind === "ceiling" ? 1 : kind === "floor" ? -1 : 0;
    if (!sign || kind === "wall" || kind === "wall-end") return null;
    if ((kind === "floor" && sign !== -1) || (kind === "ceiling" && sign !== 1)) return null;
    if (kind === "opening") ref.edge = sign > 0 ? "sill" : "head";
    out = { axis: "y", sign: sign, ref: ref };
  } else {
    if (kind === "floor" || kind === "ceiling") return null;
    var a = raw.axis && unit(num(raw.axis.x, NaN), num(raw.axis.z, NaN));
    if (!a) return null;
    if (raw.sign === -1) a = { x: -a.x, z: -a.z };
    if (kind === "opening") {
      if (r.edge !== "a" && r.edge !== "b") return null;
      ref.edge = r.edge;
    }
    if (kind === "wall-end") {
      if (r.end !== "a" && r.end !== "b") return null;
      ref.end = r.end;
    }
    if ((kind === "wall" || kind === "wall-end") && (r.side === 1 || r.side === -1)) ref.side = r.side;
    out = { axis: { x: a.x, z: a.z }, sign: 1, ref: ref };
  }
  if (fin(raw.value) && raw.value >= 0) out.value = raw.value;
  if (SRCS[raw.src]) out.src = raw.src;
  return out;
}

function sameKeep(a, b) {
  if (refKey(a.ref) !== refKey(b.ref)) return false;
  if (a.axis === "y" || b.axis === "y") return a.axis === b.axis && a.sign === b.sign;
  return a.ref.kind === "wall" || a.ref.kind === "wall-end" || dot(a.axis, b.axis) > 1 - PARALLEL;
}

/** normalizeKeeps(raw) -> [keep] for loading saved data: drops junk and
 *  duplicates, keeps the first KEEP_MAX. Never throws. */
export function normalizeKeeps(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  raw.forEach(function (k) {
    var n;
    try { n = normalizeKeep(k); } catch (_) { n = null; }
    if (n && out.length < KEEP_MAX && !out.some(function (o) { return sameKeep(o, n); })) out.push(n);
  });
  return out;
}

/** describeKeep(keep) -> { target, id, edge, end, side, vertical, direction,
 *  axis, measure, value, src } or null. direction: "up"|"down" vertical,
 *  else "+x"|"-x"|"+z"|"-z" (within 1 degree) or "oblique"; measure:
 *  "perpendicular" (to a wall's face) | "along" (along axis) | "vertical". */
export function describeKeep(keep) {
  var k = normalizeKeep(keep);
  if (!k) return null;
  var v = k.axis === "y", dir;
  if (v) dir = k.sign > 0 ? "up" : "down";
  else {
    var c = Math.cos(Math.PI / 180);
    dir = k.axis.x >= c ? "+x" : k.axis.x <= -c ? "-x" : k.axis.z >= c ? "+z" : k.axis.z <= -c ? "-z" : "oblique";
  }
  return {
    target: k.ref.kind, id: k.ref.id == null ? null : k.ref.id,
    edge: k.ref.edge || null, end: k.ref.end || null, side: k.ref.side || null,
    vertical: v, direction: dir, axis: v ? null : { x: k.axis.x, z: k.axis.z },
    measure: v ? "vertical" : k.ref.kind === "wall" ? "perpendicular" : "along",
    value: k.value == null ? null : k.value, src: k.src || null,
  };
}

/* ---- measuring ---------------------------------------------------------- */

// the vertical reference height, or null
function refY(k, scene) {
  var r = k.ref;
  if (r.kind === "floor") return 0;
  if (r.kind === "ceiling") return fin(num(scene && scene.ceiling, NaN)) ? Number(scene.ceiling) : null;
  if (r.kind === "item") {
    var o = findIn(scene && scene.items, r.id);
    var y = o ? num(k.sign > 0 ? o.lo : o.hi, NaN) : NaN;
    return fin(y) ? y : null;
  }
  if (r.kind === "opening") {
    var op = openingOf(scene, r.id);
    var oy = op ? num(k.sign > 0 ? op.sill : op.head, NaN) : NaN;
    return fin(oy) ? oy : null;
  }
  return null;
}

// a wall-anchored horizontal ref: the wall's tangent picked to match `want`
function alongWall(g, want) {
  var a = { x: g.ux, z: g.uz };
  return dot(a, want) >= 0 ? a : { x: -a.x, z: -a.z };
}

/* resolve(keep, item, scene) -> { gap, axis:{x,z} | null, sign, wall } or
   null: the current signed gap, and the direction that closes it. */
function resolve(k, item, scene) {
  if (!item || !okPoly(item.outline)) return null;
  var r = k.ref;
  if (r.kind === "item" && sameId(r.id, item.id)) return null;
  if (k.axis === "y") {
    var y = refY(k, scene), lo = num(item.lo, NaN), hi = num(item.hi, NaN);
    if (y == null || !fin(lo) || !fin(hi)) return null;
    return { gap: k.sign > 0 ? y - hi : lo - y, axis: null, sign: k.sign };
  }
  var poly = item.outline, g, P, a;
  if (r.kind === "wall") {
    g = wallGeo(wallOf(scene, r.id));
    if (!g) return null;
    var side = r.side || sideOf(g, poly), N = { x: g.nx * side, z: g.nz * side };
    a = { x: -N.x, z: -N.z };
    // the face is at -(t/2) along a from the centre line; the piece's extreme point toward it
    return { gap: -(maxAlong(poly, a) - (g.a.x * a.x + g.a.z * a.z)) - g.t / 2, axis: a, wall: r.id };
  }
  if (r.kind === "opening") {
    var o = openingOf(scene, r.id);
    if (!o) return null;
    g = wallGeo(wallOf(scene, o.wall));
    var s = num(o.s, 0) + (r.edge === "b" ? 1 : -1) * Math.max(0, num(o.width, 0)) / 2;
    P = { x: g.a.x + g.ux * s, z: g.a.z + g.uz * s };
    a = alongWall(g, k.axis);
    return { gap: dot(P, a) - maxAlong(poly, a), axis: a, wall: o.wall };
  }
  if (r.kind === "wall-end") {
    g = wallGeo(wallOf(scene, r.id));
    if (!g) return null;
    var sl = runLimit(g, r.id, r.end, r.side || sideOf(g, poly), scene);
    P = { x: g.a.x + g.ux * sl, z: g.a.z + g.uz * sl };
    a = r.end === "a" ? { x: -g.ux, z: -g.uz } : { x: g.ux, z: g.uz };
    return { gap: dot(P, a) - maxAlong(poly, a), axis: a, wall: r.id };
  }
  // item
  var other = itemOf(scene, r.id);
  if (!other) return null;
  a = k.axis;
  var B = other.outline, proj = -maxAlong(B, { x: -a.x, z: -a.z }) - maxAlong(poly, a);
  if (overlap(shrink(poly), B)) return { gap: Math.min(0, proj), axis: a };
  var sw = sweep(poly, B, a);
  return { gap: sw == null ? proj : sw, axis: a };
}

/** measureKeep(keep, item, scene) -> the current distance in cm (signed:
 *  negative = past / into the reference), or null when the reference is gone
 *  (or the piece has no outline / span for it). */
export function measureKeep(keep, item, scene) {
  var k = normalizeKeep(keep), r = k && resolve(k, item, scene);
  return r ? r.gap : null;
}

/* ---- solving one ("type a number") ------------------------------------- */

// does moving the piece `dist` along unit `dir` run into a wall (other than `skip`)?
function blocked(poly, dir, dist, scene, skip) {
  if (!(dist > TOL)) return false;
  var small = shrink(poly), step = shift(small, dir.x * 0.5, dir.z * 0.5);
  return ((scene && scene.walls) || []).some(function (w) {
    if (!w || (skip != null && sameId(w.id, skip))) return false;
    var g = wallGeo(w);
    if (!g) return false;
    var P = wallPoly(g);
    if (overlap(small, P)) {
      // already in it: only heading further in counts
      var into = { x: g.nx, z: g.nz };
      if (sideOf(g, poly) > 0) into = { x: -into.x, z: -into.z };
      return dot(dir, into) > 1e-6;
    }
    var t = sweep(poly, P, dir);
    if (t == null) return false;
    if (t <= TOL) return overlap(step, P);
    return t < dist - TOL;
  });
}

/** applyKeep(keep, value, item, scene) -> { dx, dz, dy } the translation that
 *  makes the distance `value`, moving along the measurement axis only (dy
 *  alone for a vertical keep), or { error }:
 *  "bad-value" (not a finite number), "negative" (value < 0), "invalid"
 *  (not a keep), "self", "missing" (reference gone), "blocked" (a wall is in
 *  the way of the move), "below-floor" / "above-ceiling" (vertical). */
export function applyKeep(keep, value, item, scene) {
  var v = typeof value === "string" ? Number(value.trim() === "" ? NaN : value) : value;
  if (typeof v !== "number" || !Number.isFinite(v)) return { error: "bad-value" };
  if (v < 0) return { error: "negative" };
  var k = normalizeKeep(keep);
  if (!k) return { error: "invalid" };
  if (k.ref.kind === "item" && item && sameId(k.ref.id, item.id)) return { error: "self" };
  var r = resolve(k, item, scene);
  if (!r) return { error: "missing" };
  if (k.axis === "y") {
    var dy = k.sign > 0 ? r.gap - v : v - r.gap, lo = num(item.lo, 0) + dy, hi = num(item.hi, 0) + dy;
    if (lo < -TOL) return { error: "below-floor" };
    var ceil = num(scene && scene.ceiling, NaN);
    if (fin(ceil) && hi > ceil + TOL) return { error: "above-ceiling" };
    return { dx: 0, dz: 0, dy: clean(dy) };
  }
  var dx = 0, dz = 0, cur = r;
  for (var i = 0; i < ITER; i++) {
    var d = cur.gap - v;
    if (Math.abs(d) < 1e-9) break;
    dx += cur.axis.x * d; dz += cur.axis.z * d;
    cur = resolve(k, moved(item, dx, dz, 0), scene);
    if (!cur) return { error: "missing" };
  }
  var dist = Math.hypot(dx, dz);
  if (dist > TOL) {
    var dir = { x: dx / dist, z: dz / dist };
    if (blocked(item.outline, dir, dist, scene, r.wall)) return { error: "blocked" };
  }
  return { dx: clean(dx), dz: clean(dz), dy: 0 };
}

/* ---- solving a set ------------------------------------------------------ */

function solve2(r1, r2) {
  var det = r1.a.x * r2.a.z - r1.a.z * r2.a.x;
  if (Math.abs(det) < 1e-9) return { x: r1.a.x * r1.d, z: r1.a.z * r1.d };
  return { x: (r1.d * r2.a.z - r1.a.z * r2.d) / det, z: (r1.a.x * r2.d - r1.d * r2.a.x) / det };
}
function moveFor(rows) {
  if (!rows.length) return { x: 0, z: 0 };
  if (rows.length === 1) return { x: rows[0].a.x * rows[0].d, z: rows[0].a.z * rows[0].d };
  return solve2(rows[0], rows[1]);
}

/* The residuals (gap - value) of the accepted rows at a translation, with
   their axes; null when a reference cannot be measured there. */
function residuals(rows, item, scene, x, z) {
  var cur = moved(item, x, z, 0), out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = resolve(rows[i].k, cur, scene);
    if (!r) return null;
    out.push({ a: r.axis, d: r.gap - rows[i].k.value });
  }
  return out;
}
function worstOf(res) {
  return res.reduce(function (m, q) { return Math.max(m, Math.abs(q.d)); }, 0);
}
/* Newton on the translation. Wall / opening / wall-end gaps are linear with
   gradient -axis (one step); an item gap along a fixed axis also changes with
   sideways motion (a round or turned neighbour), so its gradient is taken
   numerically. A step that makes things worse is halved. */
function newton(rows, item, scene, iters) {
  var x = 0, z = 0, res = residuals(rows, item, scene, 0, 0), H = 0.01;
  for (var it = 0; it < iters && res; it++) {
    var worst = worstOf(res);
    if (worst < 1e-9) break;
    var grads = rows.map(function (row, i) {
      if (row.k.ref.kind !== "item") return { x: -res[i].a.x, z: -res[i].a.z };
      var rx = residuals([row], item, scene, x + H, z), rz = residuals([row], item, scene, x, z + H);
      return rx && rz ? { x: (rx[0].d - res[i].d) / H, z: (rz[0].d - res[i].d) / H } : { x: -res[i].a.x, z: -res[i].a.z };
    });
    var step;
    if (rows.length === 1) {
      var a = res[0].a, ga = dot(grads[0], a);
      step = Math.abs(ga) > 1e-6 ? -res[0].d / ga : res[0].d;
      step = { x: a.x * step, z: a.z * step };
    } else {
      var det = grads[0].x * grads[1].z - grads[0].z * grads[1].x;
      step = Math.abs(det) > 1e-6
        ? { x: (-res[0].d * grads[1].z + grads[0].z * res[1].d) / det, z: (-grads[0].x * res[1].d + res[0].d * grads[1].x) / det }
        : moveFor([{ a: res[0].a, d: res[0].d }, { a: res[1].a, d: res[1].d }]);
    }
    var next = null;
    for (var h = 0; h < 6; h++) {
      var tr = residuals(rows, item, scene, x + step.x, z + step.z);
      if (tr && worstOf(tr) < worst) { next = tr; break; }
      step = { x: step.x / 2, z: step.z / 2 };
    }
    if (!next) break;
    x += step.x; z += step.z; res = next;
  }
  return { x: x, z: z };
}

/** solveKeeps(keeps, item, scene, opts) -> { dx, dz, dy, satisfied:[index],
 *  conflicts:[{ index, reason }] } for an item's standing keeps (indices into
 *  `keeps`). Taken in order: the first horizontal keep, then the first one
 *  not parallel to it (two independent axes); a later horizontal one only
 *  holds when it already agrees ("parallel-conflict" when parallel to an
 *  accepted one, else "too-many"); likewise one vertical keep. Other reasons:
 *  "invalid", "no-value", "self", "missing", "unsolved" (did not converge).
 *  opts: { tol (0.01 cm), iterations (12) }. Exact in one step for wall /
 *  opening / wall-end refs; item refs along oblique axes iterate. */
export function solveKeeps(keeps, item, scene, opts) {
  opts = opts || {};
  var tol = num(opts.tol, TOL), iters = Math.max(1, Math.floor(num(opts.iterations, ITER)));
  var out = { dx: 0, dz: 0, dy: 0, satisfied: [], conflicts: [] }, reason = {}, rows = [], vert = null, list = [];
  (Array.isArray(keeps) ? keeps : []).forEach(function (raw, i) {
    var k = normalizeKeep(raw);
    if (!k) { reason[i] = "invalid"; return; }
    if (k.value == null) { reason[i] = "no-value"; return; }
    if (k.ref.kind === "item" && item && sameId(k.ref.id, item.id)) { reason[i] = "self"; return; }
    var r = resolve(k, item, scene);
    if (!r) { reason[i] = "missing"; return; }
    list.push({ i: i, k: k });
    if (k.axis === "y") {
      var dy = k.sign > 0 ? r.gap - k.value : k.value - r.gap;
      if (!vert) vert = { i: i, dy: dy };
      else if (Math.abs(dy - vert.dy) > tol) reason[i] = "parallel-conflict";
      return;
    }
    var row = { i: i, k: k, a: r.axis, d: r.gap - k.value };
    if (rows.length === 0 || (rows.length === 1 && Math.abs(cross(row.a, rows[0].a)) > PARALLEL)) { rows.push(row); return; }
    var mv = moveFor(rows), predicted = dot(mv, row.a);
    if (Math.abs(predicted - row.d) <= tol) return; // already agrees
    reason[i] = rows.some(function (q) { return Math.abs(cross(q.a, row.a)) <= PARALLEL; }) ? "parallel-conflict" : "too-many";
  });
  var pos = rows.length ? newton(rows, item, scene, iters) : { x: 0, z: 0 };
  out.dx = clean(pos.x); out.dz = clean(pos.z); out.dy = clean(vert ? vert.dy : 0);
  var fin_ = moved(item, out.dx, out.dz, out.dy);
  list.forEach(function (e) {
    if (reason[e.i]) return;
    var r = resolve(e.k, fin_, scene);
    if (r && Math.abs(r.gap - e.k.value) <= tol) out.satisfied.push(e.i);
    else reason[e.i] = "unsolved";
  });
  Object.keys(reason).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
    out.conflicts.push({ index: i, reason: reason[i] });
  });
  return out;
}

/** canAddKeep(keeps, keep, opts) -> { ok:true } | { ok:false, reason }
 *  before storing a new keep. reason: "invalid", "self" (opts.itemId is the
 *  reference), "duplicate", "too-many" (already KEEP_MAX, a second vertical,
 *  or a third independent horizontal direction), "parallel-conflict" (along
 *  the same direction as a kept one; or opposite to one and, given
 *  opts.item + opts.scene, the two values do not add up).
 *  opts: { itemId, item, scene, tol }. */
export function canAddKeep(keeps, keep, opts) {
  opts = opts || {};
  var k = normalizeKeep(keep);
  if (!k) return { ok: false, reason: "invalid" };
  var selfId = opts.itemId != null ? opts.itemId : opts.item && opts.item.id;
  if (k.ref.kind === "item" && selfId != null && sameId(k.ref.id, selfId)) return { ok: false, reason: "self" };
  var have = normalizeKeeps(keeps);
  if (have.some(function (h) { return sameKeep(h, k); })) return { ok: false, reason: "duplicate" };
  if (have.length >= KEEP_MAX) return { ok: false, reason: "too-many" };
  if (k.axis === "y") {
    return have.some(function (h) { return h.axis === "y"; }) ? { ok: false, reason: "too-many" } : { ok: true };
  }
  var dirs = [], bad = null, tol = num(opts.tol, TOL);
  have.forEach(function (h) {
    if (h.axis === "y" || bad) return;
    if (!dirs.some(function (d) { return Math.abs(cross(d, h.axis)) <= PARALLEL; })) dirs.push(h.axis);
    if (Math.abs(cross(h.axis, k.axis)) > PARALLEL) return;
    if (dot(h.axis, k.axis) > 0) { bad = "parallel-conflict"; return; }
    if (opts.item && opts.scene && h.value != null && k.value != null) {
      var r1 = resolve(h, opts.item, opts.scene), r2 = resolve(k, opts.item, opts.scene);
      // opposite sides: moving one way grows one gap as much as it shrinks the other
      if (r1 && r2 && Math.abs((r1.gap - h.value) + (r2.gap - k.value)) > tol) bad = "parallel-conflict";
    }
  });
  if (bad) return { ok: false, reason: bad };
  var fresh = !dirs.some(function (d) { return Math.abs(cross(d, k.axis)) <= PARALLEL; });
  if (fresh && dirs.length >= 2) return { ok: false, reason: "too-many" };
  return { ok: true };
}

/* ---- order across items -------------------------------------------------- */

function depsOf(entry, byId) {
  var out = [];
  normalizeKeeps(entry && entry.keep).forEach(function (k) {
    if (k.ref.kind !== "item" || sameId(k.ref.id, entry.id)) return;
    var key = String(k.ref.id);
    if (byId[key] && out.indexOf(key) === -1) out.push(key);
  });
  return out;
}
function indexItems(itemsWithKeeps) {
  var byId = {}, keys = [];
  (Array.isArray(itemsWithKeeps) ? itemsWithKeeps : []).forEach(function (e) {
    if (!e || e.id == null) return;
    var key = String(e.id);
    if (!byId[key]) { byId[key] = e; keys.push(key); }
  });
  return { byId: byId, keys: keys };
}

/** keepOrder(itemsWithKeeps) -> { order:[id], cycles:[[id]] }: items are
 *  [{ id, keep:[keep] }]; a piece kept to another piece comes after it.
 *  Stable: otherwise input order. Members of a cycle still appear once in
 *  `order` (where the walk met them); each cycle is listed in `cycles`. */
export function keepOrder(itemsWithKeeps) {
  var ix = indexItems(itemsWithKeeps), state = {}, order = [], cycles = [], stack = [];
  function visit(key) {
    if (state[key] === 2) return;
    if (state[key] === 1) {
      var cyc = stack.slice(stack.indexOf(key)).map(function (k) { return ix.byId[k].id; });
      cycles.push(cyc);
      return;
    }
    state[key] = 1; stack.push(key);
    depsOf(ix.byId[key], ix.byId).forEach(visit);
    stack.pop(); state[key] = 2;
    order.push(ix.byId[key].id);
  }
  ix.keys.forEach(visit);
  return { order: order, cycles: cycles };
}

/** wouldCycle(itemsWithKeeps, itemId, keep) -> true when giving item
 *  `itemId` this keep would make a loop of item-to-item keeps (or names the
 *  piece itself). */
export function wouldCycle(itemsWithKeeps, itemId, keep) {
  var k = normalizeKeep(keep);
  if (!k || k.ref.kind !== "item") return false;
  if (sameId(k.ref.id, itemId)) return true;
  var ix = indexItems(itemsWithKeeps), seen = {}, todo = [String(k.ref.id)], target = String(itemId);
  while (todo.length) {
    var key = todo.pop();
    if (key === target) return true;
    if (seen[key] || !ix.byId[key]) continue;
    seen[key] = 1;
    depsOf(ix.byId[key], ix.byId).forEach(function (d) { todo.push(d); });
  }
  return false;
}

/* ---- housekeeping -------------------------------------------------------- */

/** pruneKeeps(keeps, scene) -> the normalized keeps whose reference still
 *  exists (wall, item, opening and its wall; a ceiling keep needs
 *  scene.ceiling). */
export function pruneKeeps(keeps, scene) {
  return normalizeKeeps(keeps).filter(function (k) {
    var r = k.ref;
    if (r.kind === "floor") return true;
    if (r.kind === "ceiling") return fin(num(scene && scene.ceiling, NaN));
    if (r.kind === "wall" || r.kind === "wall-end") return !!wallGeo(wallOf(scene, r.id));
    if (r.kind === "opening") return !!openingOf(scene, r.id);
    return !!findIn(scene && scene.items, r.id);
  });
}

/* ---- builders ------------------------------------------------------------ */

function withValue(k, item, scene, fallback) {
  var m = scene ? measureKeep(k, item, scene) : null;
  var v = m != null ? m : num(fallback, NaN);
  if (fin(v)) k.value = Math.max(0, v);
  return normalizeKeep(k);
}

/** keepFromFloorHit(hit, item, ctx) -> keep (value = the current distance)
 *  or null. hit: a js/clearance.js floorClearances / verticalClearances hit,
 *  of which it reads `dir` ("up"/"down" are vertical), `kind` ("wall" |
 *  "item" | "near" | "ceiling" | "floor"), `id` (wall / item id), and for
 *  item and near hits `from` -> `to` (their direction is the axis; ctx.dir
 *  {x,z} is used when they coincide). ctx: { scene } — needed for a wall hit
 *  (which face the piece is on) and to measure the value (else hit.gap). */
export function keepFromFloorHit(hit, item, ctx) {
  if (!hit || typeof hit !== "object") return null;
  var scene = ctx && ctx.scene, k;
  if (hit.dir === "up" || hit.dir === "down" || hit.kind === "ceiling" || hit.kind === "floor") {
    var sign = hit.dir === "up" || hit.kind === "ceiling" ? 1 : -1;
    var kind = hit.kind === "item" || hit.kind === "ceiling" || hit.kind === "floor" ? hit.kind : null;
    if (!kind) return null;
    k = { axis: "y", sign: sign, ref: kind === "item" ? { kind: "item", id: hit.id } : { kind: kind }, src: "vertical" };
  } else if (hit.kind === "wall") {
    var g = wallGeo(wallOf(scene, hit.id));
    if (!g || !item || !okPoly(item.outline)) return null;
    var side = sideOf(g, item.outline);
    k = { axis: { x: -g.nx * side, z: -g.nz * side }, sign: 1, ref: { kind: "wall", id: hit.id, side: side }, src: "side" };
  } else if (hit.kind === "item" || hit.kind === "near") {
    var a = hit.from && hit.to ? unit(num(hit.to.x, 0) - num(hit.from.x, 0), num(hit.to.z, 0) - num(hit.from.z, 0)) : null;
    if (!a && ctx && ctx.dir) a = unit(num(ctx.dir.x, 0), num(ctx.dir.z, 0));
    if (!a) return null;
    k = { axis: a, sign: 1, ref: { kind: "item", id: hit.id }, src: hit.kind === "near" ? "near" : "side" };
  } else return null;
  return withValue(k, item, scene, hit.gap);
}

// the things on the wall plane, in the frame's s / y: ctx's own, or from the scene
function planeThings(ctx, f, item) {
  var scene = ctx.scene, items, openings;
  if (Array.isArray(ctx.items)) items = ctx.items.map(function (it) {
    return { id: it.id, lo: num(it.s, 0) - num(it.w, 0) / 2, hi: num(it.s, 0) + num(it.w, 0) / 2, b: num(it.y, 0), t: num(it.y, 0) + num(it.h, 0), dist: 0 };
  });
  else items = ((scene && scene.items) || []).filter(function (it) {
    return it && okPoly(it.outline) && !(item && sameId(it.id, item.id));
  }).map(function (it) {
    var lo = Infinity, hi = -Infinity, dist = Infinity;
    it.outline.forEach(function (p) {
      var s = (p.x - f.ox) * f.ux + (p.z - f.oz) * f.uz;
      lo = Math.min(lo, s); hi = Math.max(hi, s);
      dist = Math.min(dist, Math.abs((p.x - f.ox) * f.nx + (p.z - f.oz) * f.nz));
    });
    return { id: it.id, lo: lo, hi: hi, b: num(it.lo, NaN), t: num(it.hi, NaN), dist: dist };
  });
  var g = wallGeo(wallOf(scene, ctx.wall));
  if (Array.isArray(ctx.openings)) openings = ctx.openings.map(function (o) {
    return { id: o.id, lo: num(o.s, 0) - num(o.w, 0) / 2, hi: num(o.s, 0) + num(o.w, 0) / 2, b: num(o.sill, 0), t: num(o.head, Infinity) };
  });
  else openings = ((scene && scene.openings) || []).filter(function (o) { return o && g && sameId(o.wall, ctx.wall); }).map(function (o) {
    var c = num(o.s, 0), hw = Math.max(0, num(o.width, 0)) / 2;
    var s0 = (g.a.x + g.ux * (c - hw) - f.ox) * f.ux + (g.a.z + g.uz * (c - hw) - f.oz) * f.uz,
      s1 = (g.a.x + g.ux * (c + hw) - f.ox) * f.ux + (g.a.z + g.uz * (c + hw) - f.oz) * f.uz;
    return { id: o.id, lo: Math.min(s0, s1), hi: Math.max(s0, s1), b: num(o.sill, 0), t: num(o.head, Infinity) };
  });
  return { items: items, openings: openings, g: g };
}
function pick(cands, coord, field) {
  var best = null;
  cands.forEach(function (c) {
    if (Math.abs(c[field] - coord) > MATCH) return;
    if (!best || (c.dist || 0) < (best.dist || 0)) best = c;
  });
  return best;
}

/** keepFromWallDim(dim, item, ctx) -> keep or null. dim: a js/wall_plane_snap.js
 *  snapOnWall dim, of which it reads `kind` ("left" | "right" | "left-end" |
 *  "right-end" | "below" | "above" | "floor" | "ceiling"), `from`, `to`
 *  (wall s / y, to tell what the line ends on) and `value`.
 *  ctx: { scene, wall: the wall's id, frame: { ox, oz, ux, uz, nx, nz } (the
 *  same frame snapOnWall worked in), items?, openings?, ref? }.
 *  items [{ s, y, w, h, id }] / openings [{ s, w, sill, head, id }] in frame
 *  coordinates are the lists given to snapOnWall (with ids); when absent they
 *  are derived from the scene (the piece nearest the face wins a tie).
 *  ref { kind:"item"|"opening"|"wall-end", id } names the target outright.
 *  left/right ending on nothing known means the run's end (wall-end). */
export function keepFromWallDim(dim, item, ctx) {
  if (!dim || !ctx || !ctx.frame) return null;
  var f = {
    ox: num(ctx.frame.ox, 0), oz: num(ctx.frame.oz, 0), ux: num(ctx.frame.ux, 1), uz: num(ctx.frame.uz, 0),
    nx: num(ctx.frame.nx, 0), nz: num(ctx.frame.nz, 1),
  };
  var scene = ctx.scene, kind = dim.kind, k = null, th = planeThings(ctx, f, item), g = th.g, want = ctx.ref;
  if (kind === "floor") k = { axis: "y", sign: -1, ref: { kind: "floor" } };
  else if (kind === "ceiling") k = { axis: "y", sign: 1, ref: { kind: "ceiling" } };
  else if (kind === "below" || kind === "above") {
    var up = kind === "above", coord = num(up ? dim.to : dim.from, NaN), hit;
    if (want && want.kind === "item") hit = { kind: "item", id: want.id };
    else if (want && want.kind === "opening") hit = { kind: "opening", id: want.id };
    else {
      var ci = pick(th.items, coord, up ? "b" : "t"), co = pick(th.openings, coord, up ? "b" : "t");
      hit = ci ? { kind: "item", id: ci.id } : co ? { kind: "opening", id: co.id } : null;
    }
    if (!hit) return null;
    k = { axis: "y", sign: up ? 1 : -1, ref: hit };
  } else if (kind === "left" || kind === "right" || kind === "left-end" || kind === "right-end") {
    if (!g) return null;
    var right = kind === "right" || kind === "right-end",
      a = right ? { x: f.ux, z: f.uz } : { x: -f.ux, z: -f.uz },
      toB = dot(a, { x: g.ux, z: g.uz }) > 0, // heading toward end b
      side = f.nx * g.nx + f.nz * g.nz >= 0 ? 1 : -1, ref = null;
    if (want && (want.kind === "item" || want.kind === "opening" || want.kind === "wall-end")) {
      if (want.kind === "item") ref = { kind: "item", id: want.id };
      else if (want.kind === "opening") ref = { kind: "opening", id: want.id, edge: toB ? "a" : "b" };
    } else if (kind === "left" || kind === "right") {
      var c = num(right ? dim.to : dim.from, NaN), field = right ? "lo" : "hi",
        mi = pick(th.items, c, field), mo = pick(th.openings, c, field);
      if (mi) ref = { kind: "item", id: mi.id };
      // heading toward b, the near jamb is the one nearer a
      else if (mo) ref = { kind: "opening", id: mo.id, edge: toB ? "a" : "b" };
    }
    if (!ref) ref = { kind: "wall-end", id: ctx.wall, end: toB ? "b" : "a", side: side };
    k = { axis: a, sign: 1, ref: ref };
  }
  if (!k) return null;
  k.src = "wall-plane";
  return withValue(k, item, scene, dim.value);
}

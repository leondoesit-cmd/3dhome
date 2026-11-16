/* Clearances between real plan outlines (js/item_outline.js), pure.

   Two standard definitions, and the true gap:
   - wallGap: to a WALL, the perpendicular distance from the wall's face to the
     outline's extreme point toward it (the support point along the face
     normal), measured only where that point lies beside the wall's extent.
     A round table: centre distance minus radius; a turned box: its corner.
   - sweepGap: to another OBJECT along a direction, how far the outline can be
     translated before the two first touch. Exact for polygons, convex or not:
     the least of every vertex of one cast along the direction (or against
     it) onto the other's edges. An object off to the side of the swept band
     is never met, so it is not in the way.
   - minSeparation: the closest pair of points of two outlines (0 when they
     touch or overlap).
   Polygons are [{x, z}], closed implicitly. Distances in cm floats. */

var EPS = 1e-9;

// t >= 0 where the ray o + t d meets the segment a-b, or null
function raySeg(ox, oz, dx, dz, a, b) {
  var ex = b.x - a.x, ez = b.z - a.z, den = dx * ez - dz * ex;
  if (Math.abs(den) < EPS) return null;
  var wx = a.x - ox, wz = a.z - oz,
    t = (wx * ez - wz * ex) / den,
    u = (wx * dz - wz * dx) / den;
  if (t < -1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
  return Math.max(0, t);
}

function segsCross(a, b, c, d) {
  function o(p, q, r) { return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x); }
  var d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/** Point strictly inside a polygon (even-odd). */
export function pointInPolygon(p, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Do two outlines overlap (share interior)? */
export function outlinesOverlap(A, B) {
  if (!A.length || !B.length) return false;
  for (var i = 0; i < A.length; i++)
    for (var j = 0; j < B.length; j++)
      if (segsCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return pointInPolygon(A[0], B) || pointInPolygon(B[0], A) || A.some(function (p) { return pointInPolygon(p, B); });
}

/** sweepGap(A, B, dir) -> { gap, from, to } or null when B is not in the way.
 *  dir is a unit vector; `from` is the contact point on A, `to` on B. Two
 *  outlines that already overlap give gap 0. */
export function sweepGap(A, B, dir) {
  if (!A || !B || !A.length || !B.length) return null;
  if (outlinesOverlap(A, B)) return { gap: 0, from: A[0], to: A[0] };
  return sweepApart(A, B, dir);
}
// sweepGap for two outlines already known not to overlap
function sweepApart(A, B, dir) {
  var best = null, dx = dir.x, dz = dir.z;
  A.forEach(function (p) {
    for (var j = 0; j < B.length; j++) {
      var t = raySeg(p.x, p.z, dx, dz, B[j], B[(j + 1) % B.length]);
      if (t != null && (!best || t < best.gap)) best = { gap: t, from: p, to: { x: p.x + dx * t, z: p.z + dz * t } };
    }
  });
  B.forEach(function (q) {
    for (var i = 0; i < A.length; i++) {
      var t = raySeg(q.x, q.z, -dx, -dz, A[i], A[(i + 1) % A.length]);
      if (t != null && (!best || t < best.gap)) best = { gap: t, from: { x: q.x - dx * t, z: q.z - dz * t }, to: q };
    }
  });
  return best;
}

function closestOnSeg(p, a, b) {
  var ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez,
    u = L2 > EPS ? ((p.x - a.x) * ex + (p.z - a.z) * ez) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  return { x: a.x + ex * u, z: a.z + ez * u };
}

/** minSeparation(A, B) -> { gap, from, to }: the closest points (gap 0 when
 *  the outlines touch or overlap). */
export function minSeparation(A, B) {
  if (!A || !B || !A.length || !B.length) return null;
  if (outlinesOverlap(A, B)) return { gap: 0, from: A[0], to: A[0] };
  return separationApart(A, B);
}
// minSeparation for two outlines already known not to overlap
function separationApart(A, B) {
  var best = null;
  function scan(P, Q, flip) {
    P.forEach(function (p) {
      for (var j = 0; j < Q.length; j++) {
        var c = closestOnSeg(p, Q[j], Q[(j + 1) % Q.length]), g = Math.hypot(p.x - c.x, p.z - c.z);
        if (!best || g < best.gap) best = flip ? { gap: g, from: c, to: p } : { gap: g, from: p, to: c };
      }
    });
  }
  scan(A, B, false);
  scan(B, A, true);
  return best;
}

/** A wall as plain data: { a:{x,z}, b:{x,z}, t } (centre line, thickness).
 *  Its solid as a polygon. */
export function wallPolygon(w) {
  var dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L = Math.hypot(dx, dz) || 1,
    h = (Number(w.t) || 0) / 2, nx = (-dz / L) * h, nz = (dx / L) * h;
  return [
    { x: w.a.x + nx, z: w.a.z + nz }, { x: w.b.x + nx, z: w.b.z + nz },
    { x: w.b.x - nx, z: w.b.z - nz }, { x: w.a.x - nx, z: w.a.z - nz },
  ];
}

/** wallGap(poly, wall) -> { gap, from, to, nx, nz } or null: the face toward
 *  the outline, the outline's support point toward that face, and the foot of
 *  the perpendicular on it. null when that point is not beside the wall. */
export function wallGap(poly, w) {
  if (!poly || !poly.length || !w || !w.a || !w.b) return null;
  var dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L = Math.hypot(dx, dz);
  if (!(L > EPS)) return null;
  var ux = dx / L, uz = dz / L, nx = -uz, nz = ux, cx = 0, cz = 0;
  poly.forEach(function (p) { cx += p.x; cz += p.z; });
  cx /= poly.length; cz /= poly.length;
  if ((cx - w.a.x) * nx + (cz - w.a.z) * nz < 0) { nx = -nx; nz = -nz; }
  var half = (Number(w.t) || 0) / 2, best = null, bd = Infinity;
  poly.forEach(function (p) {
    var d = (p.x - w.a.x) * nx + (p.z - w.a.z) * nz;
    if (d < bd) { bd = d; best = p; }
  });
  var s = (best.x - w.a.x) * ux + (best.z - w.a.z) * uz;
  if (s < -half - 0.01 || s > L + half + 0.01) return null;
  var gap = Math.max(0, bd - half);
  return { gap: gap, from: best, to: { x: best.x - nx * gap, z: best.z - nz * gap }, nx: nx, nz: nz };
}

/* The four directions a floor piece is measured in: its own front, back,
   left and right; a round piece (no axes of its own) takes the nearest
   wall's normal and tangent. rot in degrees, item_orient's convention. */
export function sideDirs(rot, round, walls, poly) {
  var a = ((Number(rot) || 0) * Math.PI) / 180, fx = -Math.sin(a), fz = Math.cos(a);
  if (round && walls && walls.length && poly) {
    var near = null;
    walls.forEach(function (w) {
      var g = wallGap(poly, w);
      if (g && (!near || g.gap < near.gap)) near = g;
    });
    if (near) { fx = -near.nx; fz = -near.nz; }
  }
  return [
    { key: "front", x: fx, z: fz }, { key: "back", x: -fx, z: -fz },
    { key: "right", x: fz, z: -fx }, { key: "left", x: -fz, z: fx },
  ];
}

/** Where to put each hit's label: its line's midpoint, or, when that lands
 *  within `minPx` (18) screen px of a label already placed (two lines that
 *  cross), the first point further along its own line that is clear.
 *  project({x, z}) -> {x, y} screen px or null. -> [{x, z}] in hit order. */
export function labelSpots(hits, project, minPx) {
  var lim = minPx == null ? 18 : minPx, placed = [], TS = [0.5, 0.65, 0.35, 0.8, 0.2];
  return (hits || []).map(function (h) {
    var pick = null, first = null;
    for (var i = 0; i < TS.length && !pick; i++) {
      var w = { x: h.from.x + (h.to.x - h.from.x) * TS[i], z: h.from.z + (h.to.z - h.from.z) * TS[i] },
        q = project(w);
      if (!first) first = { w: w, q: q };
      if (!q || placed.every(function (p) { return Math.hypot(p.x - q.x, p.y - q.y) >= lim; })) pick = { w: w, q: q };
    }
    pick = pick || first;
    if (pick.q) placed.push(pick.q);
    return pick.w;
  });
}

/** The vertical clearances of a piece, pure.
 *  o = { poly, span:{lo, hi}, others:[{ id, poly, span:{lo, hi}|null }],
 *        ceiling, down (true: also measure under it) }
 *  -> [{ dir:"up"|"down", kind:"item"|"ceiling"|"floor", gap, from, to, id }]
 *  Up: from the top to the lowest piece whose outline overlaps this one in
 *  plan and whose bottom is at or over this top, else to `ceiling`. Down
 *  (only when asked: a piece off the floor and on no host): from the bottom
 *  to the highest piece under it overlapping in plan, else the floor (0).
 *  A piece with no span (not measured yet) is ignored. Points are 3D
 *  ({x, y, z}) at the outline's centre; a gap under 0.5 is left out. */
export function verticalClearances(o) {
  var poly = o.poly, span = o.span, out = [];
  if (!poly || !poly.length || !span) return out;
  var me = boundCircle(poly), above = null, below = null;
  (o.others || []).forEach(function (x) {
    if (!x || !x.span || !x.poly || !x.poly.length) return;
    var c = boundCircle(x.poly);
    if (Math.hypot(c.x - me.x, c.z - me.z) >= c.r + me.r) return; // apart in plan
    if (!outlinesOverlap(poly, x.poly)) return;
    if (x.span.lo >= span.hi - 0.5 && (!above || x.span.lo < above.span.lo)) above = x;
    else if (o.down && x.span.hi <= span.lo + 0.5 && (!below || x.span.hi > below.span.hi)) below = x;
  });
  function hit(dir, kind, y0, y1, id) {
    var gap = Math.abs(y1 - y0);
    if (gap >= 0.5 && Number.isFinite(gap)) out.push({ dir: dir, kind: kind, gap: gap, from: { x: me.x, y: y0, z: me.z }, to: { x: me.x, y: y1, z: me.z }, id: id });
  }
  if (above) hit("up", "item", span.hi, above.span.lo, above.id);
  else if (Number(o.ceiling) > span.hi) hit("up", "ceiling", span.hi, Number(o.ceiling));
  if (o.down && span.lo >= 0.5) {
    if (below) hit("down", "item", span.lo, below.span.hi, below.id);
    else hit("down", "floor", span.lo, 0);
  }
  return out;
}

/* Does the segment a-b pass through a wall's solid? Touching a face at an end
   (a piece flush to the wall) does not count; going through the thickness
   does. Wall solids are convex, so a segment inside one either crosses an
   edge properly or has its midpoint inside. Openings are not consulted. */
function throughWall(a, b, walls) {
  var mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  return walls.some(function (w) {
    var P = w.poly;
    for (var i = 0; i < P.length; i++) if (segsCross(a, b, P[i], P[(i + 1) % P.length])) return true;
    return pointInPolygon(mid, P);
  });
}

// axis-aligned bounds; outlines whose bounds are apart cannot overlap
function boxOf(P) {
  var b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (var i = 0; i < P.length; i++) {
    var p = P[i];
    if (p.x < b.x0) b.x0 = p.x;
    if (p.x > b.x1) b.x1 = p.x;
    if (p.z < b.z0) b.z0 = p.z;
    if (p.z > b.z1) b.z1 = p.z;
  }
  return b;
}
function boxesApart(a, b) { return a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0; }
function spanAlong(P, ux, uz) {
  var lo = Infinity, hi = -Infinity;
  for (var i = 0; i < P.length; i++) { var v = P[i].x * ux + P[i].z * uz; if (v < lo) lo = v; if (v > hi) hi = v; }
  return { lo: lo, hi: hi };
}
// the band an outline sweeps along d: its extent across d, and where it starts along d
function sweepBand(A, d) { return { across: spanAlong(A, -d.z, d.x), along: spanAlong(A, d.x, d.z) }; }
/* B cannot be met sweeping along d: wholly to one side of the band, or wholly
   behind the outline (0.01 cm slack, far above raySeg's own tolerance). */
function outOfBand(band, B, d) {
  var c = spanAlong(B, -d.z, d.x);
  if (c.hi < band.across.lo - 0.01 || c.lo > band.across.hi + 0.01) return true;
  return spanAlong(B, d.x, d.z).hi < band.along.lo - 0.01;
}

// centre and radius of a circle around an outline (its vertex centroid)
function boundCircle(poly) {
  var cx = 0, cz = 0, r = 0;
  poly.forEach(function (p) { cx += p.x / poly.length; cz += p.z / poly.length; });
  poly.forEach(function (p) { r = Math.max(r, Math.hypot(p.x - cx, p.z - cz)); });
  return { x: cx, z: cz, r: r };
}

/** The live distances of a floor piece.
 *  o = { poly, dirs, walls:[{ id, a, b, t }], others:[{ id, poly }],
 *        max (600), near (200), nearCount (4) }
 *  -> [{ dir, kind:"wall"|"item"|"near", gap, from, to, id }]
 *  In each direction the first thing the swept outline meets wins: a wall
 *  reports its perpendicular gap (wallGap), a piece the sweep gap. A side that
 *  is flush or overlapping, or has nothing within `max`, is left out. Then
 *  every other piece within `near` that no side already reports gets its
 *  closest-points line ("near", minSeparation), the `nearCount` nearest only,
 *  so a crowded room stays readable. A piece a side already reports is not
 *  repeated, and neither is one whose line would pass through a wall's solid
 *  (it is in another room); the next nearest visible one takes its slot. Pieces whose bounding circles are further apart than `near` are
 *  skipped before the exact (quadratic) closest-points search.
 *  A piece the outline already overlaps (a rug under it, a pendant over it
 *  that the caller did not filter) is not in the way on any side: it drops out
 *  alone. A wall it overlaps closes only the sides heading into that wall. */
export function floorClearances(o) {
  var poly = o.poly, max = o.max == null ? 600 : o.max, near = o.near == null ? 200 : o.near,
    nearCount = o.nearCount == null ? 4 : o.nearCount,
    pbox = boxOf(poly),
    walls = (o.walls || []).map(function (w) {
      var wp = wallPolygon(w), into = null;
      if (!boxesApart(pbox, boxOf(wp)) && outlinesOverlap(poly, wp)) {
        // the wall's normal pointing away from the piece: moving along it goes in
        var dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L = Math.hypot(dx, dz) || 1, cx = 0, cz = 0;
        poly.forEach(function (p) { cx += p.x / poly.length; cz += p.z / poly.length; });
        into = { x: dz / L, z: -dx / L };
        if ((cx - w.a.x) * into.x + (cz - w.a.z) * into.z > 0) into = { x: -into.x, z: -into.z };
      }
      return { w: w, poly: wp, into: into };
    }),
    others = (o.others || []).filter(function (x) {
      return x && x.poly && x.poly.length && (boxesApart(pbox, boxOf(x.poly)) || !outlinesOverlap(poly, x.poly));
    }),
    out = [], hitIds = [];
  /* Speed, same answers: what is known apart sweeps without the overlap test
     (sweepApart), and an obstacle wholly beside the swept band or behind the
     piece (it could not return a hit) is not swept at all. */
  (o.dirs || []).forEach(function (d) {
    var first = null, band = sweepBand(poly, d);
    walls.forEach(function (w) {
      if (w.into && d.x * w.into.x + d.z * w.into.z <= 1e-6) return; // overlapped, not ahead
      var g = w.into ? { gap: 0 } : outOfBand(band, w.poly, d) ? null : sweepApart(poly, w.poly, d);
      if (g && (!first || g.gap < first.g.gap)) first = { g: g, wall: w };
    });
    others.forEach(function (x) {
      var g = outOfBand(band, x.poly, d) ? null : sweepApart(poly, x.poly, d);
      if (g && (!first || g.gap < first.g.gap)) first = { g: g, item: x };
    });
    if (!first || first.g.gap < 0.5 || first.g.gap > max) return;
    if (first.wall) {
      var p = wallGap(poly, first.wall.w);
      var use = p && p.gap >= 0.5 ? p : first.g;
      out.push({ dir: d.key, kind: "wall", gap: use.gap, from: use.from, to: use.to, id: first.wall.w.id });
    } else {
      hitIds.push(first.item);
      out.push({ dir: d.key, kind: "item", gap: first.g.gap, from: first.g.from, to: first.g.to, id: first.item.id });
    }
  });
  if (near > 0 && nearCount > 0 && others.length) {
    var me = boundCircle(poly), nbs = [];
    others.forEach(function (x) {
      if (hitIds.indexOf(x) !== -1) return; // a side already measures it
      var c = boundCircle(x.poly);
      if (Math.hypot(c.x - me.x, c.z - me.z) - c.r - me.r > near) return; // cheap reject
      var g = separationApart(poly, x.poly);
      if (g && g.gap >= 0.5 && g.gap <= near && !throughWall(g.from, g.to, walls)) nbs.push({ dir: "near", kind: "near", gap: g.gap, from: g.from, to: g.to, id: x.id });
    });
    nbs.sort(function (a, b) { return a.gap - b.gap; });
    out.push.apply(out, nbs.slice(0, nearCount));
  }
  return out;
}

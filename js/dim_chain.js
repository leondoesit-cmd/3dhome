/* The plan's running dimension chains: the row of numbers outside the plan,
   between the building and its overall size, that reads every wall thickness
   and every clear span between walls in the order they appear along that
   axis (drafting convention: overall outermost, the chain nearer the plan).

   Pure — no canvas, no state — so Node tests drive it with plain walls. Each
   wall is { id, ang, pts }: its direction (radians, plan frame) and its
   footprint outline (the mitered polygon wallOutline gives). Only straight,
   axis-aligned walls take part; a diagonal or curved wall keeps its own
   dimension on the plan. */

var AXIS_TOL = Math.sin(3 * Math.PI / 180); // ±3° counts as axis-aligned
var MERGE_EPS = 0.5; // cm: faces closer than this are one point

/* Is this wall's direction along `axis` ("x" or "z")? */
function wallAlong(ang, axis) {
  var c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  return axis === "x" ? s <= AXIS_TOL : c <= AXIS_TOL;
}

function projExtent(pts, axis) {
  var lo = Infinity, hi = -Infinity;
  for (var i = 0; i < pts.length; i++) {
    var v = axis === "x" ? pts[i].x : pts[i].z;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo: lo, hi: hi };
}

/* The chain along `axis`: walls crossing that axis give "wall" intervals
   (their thickness), the ends of walls running along it add break points
   where they stop in open floor (a stub), and the gaps between consecutive
   points are "clear" spans. Returns { segs: [{ a, b, kind, ids }], walls:
   { id: { lo, hi } } } — `walls` is every taking-part wall's extent along the
   axis, which is what hover highlighting looks up. */
export function dimChain(walls, axis) {
  var crossing = [], breaks = [], extents = {};
  (walls || []).forEach(function (w) {
    if (!w || !w.pts || w.pts.length < 3 || !isFinite(w.ang)) return;
    var other = axis === "x" ? "z" : "x", e = projExtent(w.pts, axis);
    if (!(e.hi >= e.lo)) return;
    if (wallAlong(w.ang, other)) {
      extents[w.id] = e;
      crossing.push({ lo: e.lo, hi: e.hi, ids: [w.id] });
    } else if (wallAlong(w.ang, axis)) {
      extents[w.id] = e;
      breaks.push(e.lo, e.hi);
    }
  });
  if (!crossing.length) return { segs: [], walls: extents };
  crossing.sort(function (p, q) { return p.lo - q.lo; });
  var merged = [];
  crossing.forEach(function (c) {
    var last = merged[merged.length - 1];
    if (last && c.lo <= last.hi + MERGE_EPS) {
      last.hi = Math.max(last.hi, c.hi);
      c.ids.forEach(function (id) { if (last.ids.indexOf(id) === -1) last.ids.push(id); });
    } else merged.push({ lo: c.lo, hi: c.hi, ids: c.ids.slice() });
  });
  var first = merged[0].lo, lastHi = merged[merged.length - 1].hi;
  // a stub's free end, inside the chain's span and in open floor
  var free = breaks.filter(function (v) {
    if (v < first + MERGE_EPS || v > lastHi - MERGE_EPS) return false;
    for (var i = 0; i < merged.length; i++)
      if (v > merged[i].lo - MERGE_EPS && v < merged[i].hi + MERGE_EPS) return false;
    return true;
  }).sort(function (p, q) { return p - q; });
  var segs = [], fi = 0;
  merged.forEach(function (m, i) {
    segs.push({ a: m.lo, b: m.hi, kind: "wall", ids: m.ids });
    var next = merged[i + 1];
    if (!next) return;
    var at = m.hi;
    while (fi < free.length && free[fi] < next.lo) {
      if (free[fi] - at > MERGE_EPS) {
        segs.push({ a: at, b: free[fi], kind: "clear", ids: [] });
        at = free[fi];
      }
      fi++;
    }
    segs.push({ a: at, b: next.lo, kind: "clear", ids: [] });
  });
  return { segs: segs, walls: extents };
}

/* The chain segments that belong to one wall: the ones inside its extent
   along the axis. For a crossing wall that is its own thickness; for a wall
   running along the axis it is everything its length is made of. */
export function chainSegsOf(chain, id) {
  var e = chain && chain.walls[id];
  if (!e) return [];
  return chain.segs.filter(function (s) {
    return s.a >= e.lo - MERGE_EPS && s.b <= e.hi + MERGE_EPS;
  });
}

/* Whether the chains already state this wall's length or thickness, so the
   number on the wall itself can stay off the plan. */
export function chainCovers(chains, id) {
  return !!(chains && ((chains.x && chains.x.walls[id]) || (chains.z && chains.z.walls[id])));
}

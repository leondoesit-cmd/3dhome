// Shared 4-way clearance measurement.
//
// From an origin — either a bare point or an item's footprint — walk +x/-x/+z/-z
// and report the gap to the nearest obstacle on each ray: a wall's INNER face
// (wall geometry runs along the centerline, so half the thickness comes off) or
// another item's footprint edge.
//
// This lives on its own because two very different callers need the same
// numbers: plan2d draws them as dashed leaders on the canvas, and the inspector
// prints them for a selected placeholder point. Computing them twice would let
// the two drift.
import { S, WALL_H } from "./state.js";
import { wallGeom, rayIntersect } from "./geometry.js";
import { isLamp, itemVSpan, knownVSpan, measureVSpanSoon } from "./furniture.js";
import { floorClearances, sideDirs, verticalClearances } from "./clearance.js";
import { isRoundItem, itemOutline } from "./item_outline.js";
import { openingSideHits, openingSillHit } from "./opening_clearance.js";

// +x is east / +z is south in world cm (canvas x→right, z→down)
export const DIRS4 = [
  { dx: 1, dz: 0, key: "e" },
  { dx: -1, dz: 0, key: "w" },
  { dx: 0, dz: 1, key: "s" },
  { dx: 0, dz: -1, key: "n" },
];

// world corners of an item's (possibly rotated) footprint, CW order.
export function itemCorners(it) {
  var A = ((it.rot || 0) * Math.PI) / 180,
    c = Math.cos(A),
    s = Math.sin(A),
    hw = it.w / 2,
    hd = it.d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(function (p) {
    return { x: it.x + p[0] * c - p[1] * s, z: it.z + p[0] * s + p[1] * c };
  });
}

// nearest positive ray hit against a footprint's 4 edges (null if none).
export function rayToCorners(ox, oz, dx, dz, cs) {
  var minT = null;
  for (var i = 0; i < 4; i++) {
    var a = cs[i],
      b = cs[(i + 1) % 4];
    var tt = rayIntersect(ox, oz, dx, dz, a.x, a.z, b.x, b.z);
    if (tt !== null && tt > 0 && (minT === null || tt < minT)) minT = tt;
  }
  return minT;
}

/* One entry per direction that actually hits something, in DIRS4 order:
     { dir, ownT, hitT, gap, kind }
   `ownT` is how far the origin's own footprint reaches along that ray (0 for a
   bare point), so `gap` is the clear space beyond it.
   `kind` is "wall" or "item" for the obstacle that produced the hit.
   `ownCs` = the origin's own corners, or null to measure from a point.
   `skip`  = an item that must not be measured against — the origin item itself,
             or the object standing on the point being measured from.
   `target: "both"` reports the nearest wall AND the nearest item on each ray,
   so a drafting overlay can label them separately instead of collapsing to one. */
/* The obstacle footprints measure4 casts its rays against: each wall's thick
   quad and each item's corners, built lazily on first use. Without a scope one
   measure4 call builds them once for its four directions; inside
   withMeasureObstacles (one HUD paint's distance overlay) every origin of that
   paint shares them. Scoped to a synchronous pass, so a live drag is always
   read afresh by the next paint. The filters (target, wallIds, skip, lamps)
   stay per call, in the same order, so the hits are the same. */
var obstacleScope = 0, obstacleCache = null, footprintBuilds = 0;
export function withMeasureObstacles(fn) {
  obstacleScope++;
  try {
    return fn();
  } finally {
    if (--obstacleScope === 0) obstacleCache = null;
  }
}
// footprints built so far (tests: one per wall/item per scope)
export function measureFootprintBuilds() {
  return footprintBuilds;
}
function measureObstacles() {
  var c = obstacleCache;
  if (c && c.walls === S.walls && c.items === S.items) return c;
  c = { walls: S.walls, items: S.items, wallFaces: new Map(), itemCs: new Map() };
  if (obstacleScope) obstacleCache = c;
  return c;
}
/* The ray against the wall's own thick footprint, end faces included.
   Hitting the centreline and taking off t/2 was right only square-on
   (4 cm short of the truth for a 20 cm wall at 45°) and missed a wall
   whose end, not its line, stands in the way. null: a zero-length wall. */
function wallFaceQuad(c, w) {
  if (c.wallFaces.has(w)) return c.wallFaces.get(w);
  footprintBuilds++;
  var gm = wallGeom(w), quad = null;
  if (gm.L > 0) {
    var h = (w.thickness || 0) / 2, nx = -gm.uz * h, nz = gm.ux * h;
    quad = [
      { x: gm.a.x + nx, z: gm.a.z + nz }, { x: gm.b.x + nx, z: gm.b.z + nz },
      { x: gm.b.x - nx, z: gm.b.z - nz }, { x: gm.a.x - nx, z: gm.a.z - nz },
    ];
  }
  c.wallFaces.set(w, quad);
  return quad;
}
function itemCornersCached(c, o) {
  var cs = c.itemCs.get(o);
  if (!cs) {
    footprintBuilds++;
    cs = itemCorners(o);
    c.itemCs.set(o, cs);
  }
  return cs;
}
export function measure4(ox, oz, ownCs, skip, options) {
  options = options || {};
  var target = options.target || "nearest";
  var wallIds = options.wallIds || null;
  var both = target === "both";
  var out = [];
  var obs = measureObstacles();
  DIRS4.forEach(function (d) {
    var ownT = ownCs ? rayToCorners(ox, oz, d.dx, d.dz, ownCs) : 0;
    if (ownT === null) return;

    var wallT = null;
    var itemT = null;
    S.walls.forEach(function (w) {
      if (target === "object") return;
      if (target === "manual" && (!wallIds || wallIds.indexOf(w.id) === -1)) return;
      var quad = wallFaceQuad(obs, w);
      if (!quad) return;
      var face = rayToCorners(ox, oz, d.dx, d.dz, quad);
      if (face === null) return;
      if (face > ownT + 0.5 && (wallT === null || face < wallT)) wallT = face;
    });
    // other items (skip the origin + lamps: they're point/ceiling fixtures)
    S.items.forEach(function (o) {
      if (target === "wall" || target === "manual") return;
      if (o === skip || isLamp(o)) return;
      var tt = rayToCorners(ox, oz, d.dx, d.dz, itemCornersCached(obs, o));
      if (tt !== null && tt > ownT + 0.5 && (itemT === null || tt < itemT)) itemT = tt;
    });

    function pushHit(hitT, kind) {
      if (hitT === null) return;
      var gap = hitT - ownT;
      if (gap < 1) return; // touching / negligible
      out.push({ dir: d, ownT: ownT, hitT: hitT, gap: gap, kind: kind });
    }
    if (both) {
      pushHit(wallT, "wall");
      pushHit(itemT, "item");
      return;
    }
    if (wallT === null && itemT === null) return;
    if (itemT === null || (wallT !== null && wallT <= itemT)) pushHit(wallT, "wall");
    else pushHit(itemT, "item");
  });
  return out;
}

/* What a placeholder point measures FROM: itself while it is free, and its
   object's footprint once something stands on it — the clear space around the
   thing is the number you want, not the distance to a dot buried inside it.
   The piece is seated centred on the point (markers.js seatItem), so the two
   origins coincide; only the footprint changes. Every reader of a point's
   clearances goes through here so the plan, the elevations and the inspector
   cannot drift apart. */
export function markerOrigin(m, held) {
  if (held) return { ox: held.x, oz: held.z, cs: itemCorners(held), skip: held };
  return { ox: m.x, oz: m.z, cs: null, skip: null };
}
export function markerClearMap(m, held) {
  var o = markerOrigin(m, held);
  return measure4Map(o.ox, o.oz, o.cs, o.skip);
}

/* A piece's live distances from its REAL outline (js/item_outline.js), in its
   own four directions (a round piece: the nearest wall's), as
   js/clearance.js floorClearances defines them. measure4 above stays the
   Point tool's compass readout; this is the one for a piece being placed.
   `pose` {x, z, rot} overrides the piece's own. Plan walls only (arcs as
   their chords); lamps and the piece's riders are not obstacles.
   `target` filters like measure4's: "wall" (walls only), "object" (pieces
   only), "manual" (only the walls in `wallIds`), else everything.
   `near` / `nearCount` (200 cm, 4): the closest-points lines to the nearest
   pieces no side reports (floorClearances). */
export function measureSides(it, options) {
  options = options || {};
  if (!it) return [];
  // `outline`: measure from this instead (a group's cover, js/group_frame.js; `it` is its lead)
  var poly = options.outline || itemOutline(it, options.pose);
  var target = options.target || "nearest", walls = planWalls(target, options.wallIds || []);
  var inStack = target === "wall" || target === "manual" ? null : stackMembership(it);
  var others = !inStack ? [] : (S.items || []).filter(function (o) {
    return o && sideObstacle(it, o, options.skip, inStack);
  }).map(function (o) { return { id: o.id, poly: itemOutline(o) }; });
  var rot = options.pose && options.pose.rot != null ? options.pose.rot : it.rot;
  var dirs = sideDirs(rot, isRoundItem(it), walls, poly);
  var hits = floorClearances({
    poly: poly, dirs: dirs, walls: walls, others: others,
    max: options.max, near: options.near, nearCount: options.nearCount,
    behind: target === "nearest", // a side a piece blocks still reports its wall
  });
  // doors and windows in the walls it stands against (js/opening_clearance.js)
  if (!walls.length || !(S.openings && S.openings.length)) return hits;
  return openingSideHits({ poly: poly, span: ownSpan(it), dirs: dirs, walls: walls, openings: planOpenings(), held: heldWalls(it), hits: hits });
}

/* The plan walls a piece measures to: physical ones (arcs as their chords,
   marked `arc`), filtered by `target` as measureSides documents. */
function planWalls(target, wallIds) {
  var walls = [];
  (S.walls || []).forEach(function (w) {
    if (w.physical === false || target === "object") return;
    if (target === "manual" && wallIds.indexOf(w.id) === -1) return;
    var gm = wallGeom(w);
    if (!gm || !(gm.L > 0)) return;
    walls.push({ id: w.id, a: gm.a, b: gm.b, t: w.thickness || 0, arc: !!(gm.kind && gm.kind !== "line") });
  });
  return walls;
}
// S.openings as js/opening_clearance.js reads them (s along the wall, sill / head heights)
function planOpenings() {
  return (S.openings || []).filter(Boolean).map(function (o) {
    var sill = Math.max(0, Number(o.sill) || 0);
    return { id: o.id, wall: o.wall, kind: String(o.type || "opening"), s: Number(o.s) || 0,
      w: Math.max(0, Number(o.width) || 0), sill: sill, head: sill + Math.max(0, Number(o.height) || 0) };
  });
}
function ownSpan(it) {
  var span = itemVSpan(it), elev = Number(it.elev) || 0;
  return span && Number.isFinite(span.hi) ? span : { lo: elev, hi: elev + (Number(it.h) || 0) };
}
function heldWalls(it) {
  return it.hold && it.hold.wall != null ? [it.hold.wall] : [];
}

/* A floor piece's vertical clearances (js/clearance.js verticalClearances):
   up from its top to the lowest piece over it in plan (lamps, wall cabinets,
   shelves and hung pieces count here), else the ceiling (`options.ceiling`,
   the callers pass elevation.js ceilingHeight(); WALL_H when absent); down
   only for a piece in the air on no host. Its own stack is left out (a vase
   standing on it is not "over" it). A piece whose span is not measured yet is
   skipped and measured soon. `target` "wall" / "manual" keep the ceiling and
   floor only. */
export function measureVertical(it, options) {
  options = options || {};
  if (!it) return [];
  var span = itemVSpan(it), elev = Number(it.elev) || 0;
  if (!span || !Number.isFinite(span.hi)) span = { lo: elev, hi: elev + (Number(it.h) || 0) };
  var target = options.target || "nearest";
  var inStack = target === "wall" || target === "manual" ? null : stackMembership(it);
  var others = !inStack ? [] : (S.items || []).filter(function (o) {
    return o && o !== it && !inStack(o) && !FLAT_TYPES[o.type];
  }).map(function (o) {
    var s = knownVSpan(o);
    if (!s) measureVSpanSoon(o);
    return { id: o.id, poly: s ? itemOutline(o) : null, span: s };
  });
  var poly = itemOutline(it, options.pose);
  var out = verticalClearances({
    poly: poly, span: span, others: others,
    ceiling: options.ceiling != null ? options.ceiling : WALL_H,
    down: it.on == null && span.lo >= 0.5,
  });
  // under a window in the wall it stands against: up to the sill too
  if (target === "object" || !(S.openings && S.openings.length)) return out;
  var sill = openingSillHit({ poly: poly, span: span, walls: planWalls(target, options.wallIds || []), openings: planOpenings(),
    held: heldWalls(it), up: out.filter(function (h) { return h.dir === "up"; })[0] || null });
  if (sill) out.push(sill);
  return out;
}

// is `o` what `it` stands on (down its host chain) or something riding on it?
function stackMembership(it) {
  var byId, ancestors = new Set();
  function host(item) {
    if (item.on == null || Number.isNaN(item.on)) return null;
    if (!byId) {
      byId = new Map();
      for (const o of S.items || []) {
        if (o && !byId.has(o.id)) byId.set(o.id, o);
      }
    }
    return byId.get(item.on);
  }
  var parent = it;
  for (var n = 0; n < 32 && (parent = host(parent)); n++) ancestors.add(parent);
  return function (o) {
    if (ancestors.has(o)) return true;
    for (var k = 0; k < 32 && (o = host(o)); k++) if (o === it) return true;
    return false;
  };
}

/* Is `o` in the way of `it` on the floor? Not lamps, not flat pieces (a
   rug), not the piece's own stack (what it stands on, what rides on it), and
   not a piece whose height band misses this one's (wall art over a sofa, a
   pendant over a table). A span still unmeasured counts as in the way and is
   measured soon (the plan repaints on "vspan:ready"). */
var FLAT_TYPES = { rug: true };
function sideObstacle(it, o, skip, inStack) {
  if (o === it || (skip && skip.has(o)) || isLamp(o) || FLAT_TYPES[o.type]) return false;
  if (inStack(o)) return false;
  var mine = itemVSpan(it), span = knownVSpan(o);
  if (!span) { measureVSpanSoon(o); return true; }
  if (span.hi - span.lo < 3) return false;
  return !mine || (span.lo < mine.hi - 0.5 && mine.lo < span.hi - 0.5);
}

// the same four numbers keyed by compass letter, for text readouts.
// A direction with nothing in it (open plan, no wall that way) reads null.
export function measure4Map(ox, oz, ownCs, skip) {
  var m = { n: null, s: null, e: null, w: null };
  measure4(ox, oz, ownCs, skip).forEach(function (r) {
    m[r.dir.key] = r.gap;
  });
  return m;
}

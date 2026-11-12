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
import { S } from "./state.js";
import { wallGeom, rayIntersect } from "./geometry.js";
import { isLamp } from "./furniture.js";

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
export function measure4(ox, oz, ownCs, skip, options) {
  options = options || {};
  var target = options.target || "nearest";
  var wallIds = options.wallIds || null;
  var both = target === "both";
  var out = [];
  DIRS4.forEach(function (d) {
    var ownT = ownCs ? rayToCorners(ox, oz, d.dx, d.dz, ownCs) : 0;
    if (ownT === null) return;

    var wallT = null;
    var itemT = null;
    S.walls.forEach(function (w) {
      if (target === "object") return;
      if (target === "manual" && (!wallIds || wallIds.indexOf(w.id) === -1)) return;
      /* The ray against the wall's own thick footprint, end faces included.
         Hitting the centreline and taking off t/2 was right only square-on
         (4 cm short of the truth for a 20 cm wall at 45°) and missed a wall
         whose end, not its line, stands in the way. */
      var gm = wallGeom(w);
      if (!(gm.L > 0)) return;
      var h = (w.thickness || 0) / 2, nx = -gm.uz * h, nz = gm.ux * h;
      var face = rayToCorners(ox, oz, d.dx, d.dz, [
        { x: gm.a.x + nx, z: gm.a.z + nz }, { x: gm.b.x + nx, z: gm.b.z + nz },
        { x: gm.b.x - nx, z: gm.b.z - nz }, { x: gm.a.x - nx, z: gm.a.z - nz },
      ]);
      if (face === null) return;
      if (face > ownT + 0.5 && (wallT === null || face < wallT)) wallT = face;
    });
    // other items (skip the origin + lamps: they're point/ceiling fixtures)
    S.items.forEach(function (o) {
      if (target === "wall" || target === "manual") return;
      if (o === skip || isLamp(o)) return;
      var tt = rayToCorners(ox, oz, d.dx, d.dz, itemCorners(o));
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

// the same four numbers keyed by compass letter, for text readouts.
// A direction with nothing in it (open plan, no wall that way) reads null.
export function measure4Map(ox, oz, ownCs, skip) {
  var m = { n: null, s: null, e: null, w: null };
  measure4(ox, oz, ownCs, skip).forEach(function (r) {
    m[r.dir.key] = r.gap;
  });
  return m;
}

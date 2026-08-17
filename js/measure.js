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
     { dir, ownT, hitT, gap }
   `ownT` is how far the origin's own footprint reaches along that ray (0 for a
   bare point), so `gap` is the clear space beyond it.
   `ownCs` = the origin's own corners, or null to measure from a point.
   `skip`  = an item that must not be measured against — the origin item itself,
             or the object standing on the point being measured from. */
export function measure4(ox, oz, ownCs, skip, options) {
  options = options || {};
  var target = options.target || "nearest";
  var wallIds = options.wallIds || null;
  var out = [];
  DIRS4.forEach(function (d) {
    var ownT = ownCs ? rayToCorners(ox, oz, d.dx, d.dz, ownCs) : 0;
    if (ownT === null) return;

    var hitT = null;
    S.walls.forEach(function (w) {
      if (target === "object") return;
      if (target === "manual" && (!wallIds || wallIds.indexOf(w.id) === -1)) return;
      var gm = wallGeom(w);
      var tt = rayIntersect(ox, oz, d.dx, d.dz, gm.a.x, gm.a.z, gm.b.x, gm.b.z);
      if (tt === null) return;
      var face = tt - (w.thickness || 0) / 2;
      if (face > ownT + 0.5 && (hitT === null || face < hitT)) hitT = face;
    });
    // other items (skip the origin + lamps: they're point/ceiling fixtures)
    S.items.forEach(function (o) {
      if (target === "wall" || target === "manual") return;
      if (o === skip || isLamp(o)) return;
      var tt = rayToCorners(ox, oz, d.dx, d.dz, itemCorners(o));
      if (tt !== null && tt > ownT + 0.5 && (hitT === null || tt < hitT)) hitT = tt;
    });
    if (hitT === null) return;

    var gap = hitT - ownT;
    if (gap < 1) return; // touching / negligible
    out.push({ dir: d, ownT: ownT, hitT: hitT, gap: gap });
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

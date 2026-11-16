/* A piece's true plan outline, in world cm, as a closed polygon.

   Pure (FURN and the variant tables are plain data; nothing here builds a
   mesh), so Node can test it. Everything that measures a clearance from a
   piece's real edge (js/clearance.js, js/measure.js measureSides, the wall
   drag's neighbours in js/interaction/wall_plane_drag.js) starts here.

   - a round piece: a regular polygon of OUTLINE_SEGS sides inscribed in its
     true circle or ellipse (chord error r(1 - cos(pi/64)) = 0.12% of r);
   - a sectional sofa (a variant with a `chaise`, js/furniture_helpers.js):
     the L of the body plus the return that the builder adds in front of it;
   - everything else: the rotated w x d rectangle (measure.js itemCorners).
   Points are listed counter-clockwise in the item's local frame (x right,
   z front) before the rotation; the rotation is item_orient's convention
   (local +X = (cos a, sin a), local +Z = (-sin a, cos a)). */
import { vspec } from "./furniture.js";

export var OUTLINE_SEGS = 64;

/* Round pieces. CIRCLE_MIN: built as a circle of min(w, d) / 2 (their
   builders in js/furniture_models.js / furniture_extra.js); ELLIPSE: built
   to fill w x d. */
export var CIRCLE_MIN_TYPES = { roundTable: 1, pouf: 1, sideTable: 1, laundryBasket: 1 };
export var ELLIPSE_TYPES = { stool: 1, barstool: 1, dwc_bucket: 1, plant: 1 };

function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }

function ellipse(rx, rz, n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    out.push({ x: Math.cos(a) * rx, z: Math.sin(a) * rz });
  }
  return out;
}

/** The outline in the item's own frame (centre at 0,0), before rotation. */
export function localOutline(it) {
  var w = Math.max(0, num(it && it.w, 0)), d = Math.max(0, num(it && it.d, 0)),
    hw = w / 2, hd = d / 2, type = it && it.type;
  if (CIRCLE_MIN_TYPES[type]) return ellipse(Math.min(w, d) / 2, Math.min(w, d) / 2, OUTLINE_SEGS);
  if (ELLIPSE_TYPES[type]) return ellipse(hw, hd, OUTLINE_SEGS);
  var v = (type === "sofa" || type === "armchair") && it ? safeSpec(it) : null;
  if (v && (v.chaise === "l" || v.chaise === "r") && d < w) {
    var cd = num(v.chaiseD, d * 0.85), z1 = hd + cd;
    return v.chaise === "r"
      ? [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: z1 }, { x: hw - d, z: z1 }, { x: hw - d, z: hd }, { x: -hw, z: hd }]
      : [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw + d, z: hd }, { x: -hw + d, z: z1 }, { x: -hw, z: z1 }];
  }
  return [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }];
}
function safeSpec(it) {
  try { return vspec(it); } catch (_) { return null; }
}

/** True for a piece whose own axes mean nothing (a round one). */
export function isRoundItem(it) {
  return !!(it && (CIRCLE_MIN_TYPES[it.type] || ELLIPSE_TYPES[it.type]));
}

/** itemOutline(it [, pose]) -> [{x, z}] in world cm. `pose` {x, z, rot}
 *  overrides the item's own (a pose about to be applied). */
export function itemOutline(it, pose) {
  var p = pose || it || {}, x = num(p.x, 0), z = num(p.z, 0),
    a = (num(p.rot, 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return localOutline(it).map(function (q) {
    return { x: x + q.x * c - q.z * s, z: z + q.x * s + q.z * c };
  });
}

/** The outline's extent along a unit direction (ux, uz) from (ox, oz):
 *  { lo, hi } of (p - o) . u over the outline. */
export function outlineExtent(poly, ox, oz, ux, uz) {
  var lo = Infinity, hi = -Infinity;
  (poly || []).forEach(function (p) {
    var v = (p.x - ox) * ux + (p.z - oz) * uz;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  });
  return { lo: lo, hi: hi };
}

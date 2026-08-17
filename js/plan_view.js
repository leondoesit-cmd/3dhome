/* 2D plan view transform: world centimetres ↔ canvas pixels, including the
   CAD-style plan rotation around the canvas centre.

   Kept free of the canvas, THREE, and the furniture catalog so the mapping
   can be unit-tested in Node. plan2d.js is the drawing layer on top. */
import { S } from "./state.js";

export function planRotRad() {
  return ((S.planRot || 0) * Math.PI) / 180;
}

export function rotateAboutCanvas(px, py, a) {
  if (!a) return { x: px, y: py };
  var cx = S.CW / 2, cy = S.CH / 2, dx = px - cx, dy = py - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
export function unrotatePx(px, py) {
  return rotateAboutCanvas(px, py, -planRotRad());
}
export function rotatePx(px, py) {
  return rotateAboutCanvas(px, py, planRotRad());
}

// sx/sz map world→screen in the UNROTATED base frame. The plan view rotation is
// applied as a canvas transform around the centre in render2D, so drawing code
// keeps using sx/sz unchanged; only the world↔pixel inversion (wx/wz) and the
// pan/zoom math need to account for the rotation.
export function sx(x) {
  return S.OX + x * S.SC;
}
export function sz(z) {
  return S.OY + z * S.SC;
}
export function wx(px, py) {
  var b = unrotatePx(px, py);
  return (b.x - S.OX) / S.SC;
}
export function wz(px, py) {
  var b = unrotatePx(px, py);
  return (b.y - S.OY) / S.SC;
}
export function toBasePx(px, py) {
  return unrotatePx(px, py);
}

/* Put a world point in the middle of the plan view — used when a warning is
   picked from the message list and the offending corner is off screen. */
export function centerOn(x, z) {
  if (!(S.SC > 0) || !(S.CW > 0) || !(S.CH > 0)) return;
  S.OX = S.CW / 2 - x * S.SC;
  S.OY = S.CH / 2 - z * S.SC;
}
export function isOnScreen(x, z, margin) {
  var m = margin == null ? 60 : margin;
  var px = sx(x),
    py = sz(z);
  return px > m && py > m && px < S.CW - m && py < S.CH - m;
}

/* Where a newly created room/item should land, in world cm.

   The natural answer is "the middle of what the user is looking at", i.e. the
   plan's screen centre. But the plan canvas is `display:none` whenever the 2D
   pane is hidden — 3D maximized on desktop, and the 3D tab on phones — and then
   `S.CW/S.CH/S.SC` are all 0, so `wx()/wz()` divide by zero and hand back NaN.
   That silently produced furniture at {x:NaN,z:NaN} (invisible, but still
   counted in the cost estimate, and dropped on the next load) and rooms whose
   four walls collapsed onto the origin after a save.

   So: use the view centre only when the transform is actually usable, and
   otherwise fall back to the model — the centre of the existing walls, or the
   origin in an empty scene. Always returns finite numbers. */
export function dropPoint() {
  if (S.SC > 0 && S.CW > 0 && S.CH > 0) {
    var x = wx(S.CW / 2, S.CH / 2),
      z = wz(S.CW / 2, S.CH / 2);
    if (isFinite(x) && isFinite(z)) return { x: x, z: z };
  }
  var n = S.nodes && S.nodes.length ? S.nodes.filter(function (p) {
    return p && isFinite(p.x) && isFinite(p.z);
  }) : [];
  if (!n.length) return { x: 0, z: 0 };
  var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  n.forEach(function (p) {
    if (p.x < minx) minx = p.x;
    if (p.x > maxx) maxx = p.x;
    if (p.z < minz) minz = p.z;
    if (p.z > maxz) maxz = p.z;
  });
  return { x: (minx + maxx) / 2, z: (minz + maxz) / 2 };
}

export function niceScaleCm(sc) {
  var nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  if (!(sc > 0) || !isFinite(sc)) return nice[2];
  var best = nice[0],
    bestDiff = Infinity;
  for (var i = 0; i < nice.length; i++) {
    var px = nice[i] * sc;
    var diff = px < 55 ? 55 - px : px > 170 ? px - 170 : 0;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = nice[i];
    }
  }
  return best;
}

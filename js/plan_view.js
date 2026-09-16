/* 2D plan view transform: world centimetres ↔ canvas pixels, including the
   CAD-style plan rotation around the canvas centre.

   Kept free of the canvas, THREE, and the furniture catalog so the mapping
   can be unit-tested in Node. plan2d.js is the drawing layer on top. */
import { S } from "./state.js";
import { displayUnit } from "./display_units.js";
import { PLANNING_UNITS } from "./planning_units.js";

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

/* Pure framing math, kept out of the canvas module so the zero-size boot race
   has a real regression test. Invalid/hidden viewports return null and never
   manufacture the absorbing zoom value 0. */
export function fitTransform(bb, width, height, pad) {
  var W = Number(width), H = Number(height), opts = typeof pad === "object" && pad ? pad : {},
    pixelPad = Math.max(0, Number(typeof pad === "number" ? pad : opts.pixelPad) || 0),
    worldPad = Math.max(0, Number(opts.worldPad) || 0),
    minSpan = Math.max(0, Number(opts.minSpan) || 30);
  if (!bb || !(W > 0) || !(H > 0)) return null;
  var minx = Number(bb.minx), minz = Number(bb.minz),
    maxx = Number(bb.maxx), maxz = Number(bb.maxz);
  if (![minx, minz, maxx, maxz].every(isFinite)) return null;
  var rawW = maxx - minx, rawD = maxz - minz,
    w = Math.max(minSpan, rawW) + worldPad * 2,
    d = Math.max(minSpan, rawD) + worldPad * 2,
    sc = Math.min(Math.max(1, W - pixelPad * 2) / w, Math.max(1, H - pixelPad * 2) / d);
  if (!(sc > 0) || !isFinite(sc)) return null;
  return {
    sc: sc,
    ox: (W - rawW * sc) / 2 - minx * sc,
    oy: (H - rawD * sc) / 2 - minz * sc,
  };
}
export function isOnScreen(x, z, margin) {
  var m = margin == null ? 60 : margin;
  if (!(S.SC > 0) || !(S.CW > 0) || !(S.CH > 0)) return false;
  /* sx/sz are in the unrotated base frame. The plan rotation is applied around
     the canvas centre, so a point that is "inside" that AABB can sit off the
     visible pane after a 90° view — and the warning list would then refuse to
     centre on it. Test the pixel the user actually sees. */
  var scr = rotatePx(sx(x), sz(z));
  return scr.x > m && scr.y > m && scr.x < S.CW - m && scr.y < S.CH - m;
}

/* Keep a typed rubber-band (or any small set of world points) inside the plan
   pane. Auto-pan follows the mouse, so a length typed while the cursor stays
   put can run hundreds of centimetres off-screen; this pans, and zooms out
   only when the span is wider than the current view. It never zooms in. */
export function ensurePointsVisible(points, margin) {
  if (!(S.SC > 0) || !(S.CW > 0) || !(S.CH > 0)) return false;
  var m = margin == null ? 56 : Math.max(16, Number(margin) || 56);
  var pts = [];
  (points || []).forEach(function (p) {
    if (p && isFinite(p.x) && isFinite(p.z)) pts.push(p);
  });
  if (!pts.length) return false;

  function screenBox() {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      var scr = rotatePx(sx(p.x), sz(p.z));
      minX = Math.min(minX, scr.x);
      maxX = Math.max(maxX, scr.x);
      minY = Math.min(minY, scr.y);
      maxY = Math.max(maxY, scr.y);
    });
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  var box = screenBox();
  if (box.minX >= m && box.minY >= m && box.maxX <= S.CW - m && box.maxY <= S.CH - m)
    return false;

  var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  pts.forEach(function (p) {
    minx = Math.min(minx, p.x);
    maxx = Math.max(maxx, p.x);
    minz = Math.min(minz, p.z);
    maxz = Math.max(maxz, p.z);
  });
  var worldW = Math.max(maxx - minx, 1e-6),
    worldD = Math.max(maxz - minz, 1e-6),
    availW = Math.max(1, S.CW - m * 2),
    availH = Math.max(1, S.CH - m * 2),
    fitSc = Math.min(availW / worldW, availH / worldD),
    cx = (minx + maxx) / 2,
    cz = (minz + maxz) / 2,
    changed = false;

  if (fitSc < S.SC) {
    S.SC = fitSc;
    S.OX = S.CW / 2 - cx * S.SC;
    S.OY = S.CH / 2 - cz * S.SC;
    return true;
  }

  box = screenBox();
  var dx = 0, dy = 0;
  if (box.minX < m && box.maxX > S.CW - m) dx = S.CW / 2 - (box.minX + box.maxX) / 2;
  else if (box.minX < m) dx = m - box.minX;
  else if (box.maxX > S.CW - m) dx = S.CW - m - box.maxX;
  if (box.minY < m && box.maxY > S.CH - m) dy = S.CH / 2 - (box.minY + box.maxY) / 2;
  else if (box.minY < m) dy = m - box.minY;
  else if (box.maxY > S.CH - m) dy = S.CH - m - box.maxY;
  if (!dx && !dy) return changed;

  var pa = -planRotRad();
  S.OX += dx * Math.cos(pa) - dy * Math.sin(pa);
  S.OY += dx * Math.sin(pa) + dy * Math.cos(pa);
  return true;
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
  var unit = displayUnit();
  var nice;
  if (unit === "ft") nice = [30.48, 60.96, 152.4, 304.8, 609.6, 1524, 3048, 6096, 15240];
  else if (unit === "in") nice = [2.54, 5.08, 12.7, 25.4, 30.48, 60.96, 152.4, 304.8, 609.6];
  else if (unit === "m") nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  else if (unit === "mm") nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  else nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  if (!(sc > 0) || !isFinite(sc)) return nice[2] || PLANNING_UNITS[unit] || 10;
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

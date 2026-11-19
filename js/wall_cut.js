/* The dollhouse cut: walls built to a cut height instead of full height, so a
   3D view from above looks into the rooms like a presentation cutaway.

   The cut is GEOMETRY, not a clipping plane. Everything downstream (the
   shadow pass, photo mode's path tracer, GLB export, physics, picking) then
   sees the same walls the screen does, and nothing depends on per-material
   clipping support in the WebGPU backend.

   Pure array maths only; view3d.js wraps it for three geometry. */

/* How an opening in a wall of cut height H is built:
   "none"  — the opening starts above the cut: the wall below it is solid;
   "cut"   — it runs from the floor to (or past) the cut: the wall splits;
   "notch" — it starts above the floor and reaches the cut: the wall splits
             and a solid block stays under the sill (a hole touching the outer
             contour cannot be triangulated as a hole);
   "hole"  — it sits entirely inside the wall: an ordinary hole.
   `y0` is the bottom of the opening (≤ the wall base for doors). */
export function classifyOpeningCut(y0, y1, H, base) {
  var b = base == null ? -2.5 : base;
  if (y0 >= H - 0.01) return "none";
  var reachesTop = y1 >= H - 0.01;
  if (y0 <= b + 0.01) return reachesTop ? "cut" : "hole";
  return reachesTop ? "notch" : "hole";
}

/* Clip a NON-indexed triangle list to y <= yMax (Sutherland–Hodgman against
   one plane, per triangle), carrying normals and uvs along. Arrays are flat:
   pos xyz, nrm xyz (optional), uv uv (optional). Returns new flat arrays.
   Triangles wholly below are kept as they are; wholly above are dropped; a
   straddling triangle becomes one or two. */
export function clipTrianglesBelowY(pos, nrm, uv, yMax) {
  var outP = [], outN = nrm ? [] : null, outU = uv ? [] : null;
  var tri = pos.length / 9;
  function vert(i) {
    return {
      p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]],
      n: nrm ? [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]] : null,
      u: uv ? [uv[i * 2], uv[i * 2 + 1]] : null,
    };
  }
  function lerp(a, b, t) {
    return {
      p: [a.p[0] + (b.p[0] - a.p[0]) * t, yMax, a.p[2] + (b.p[2] - a.p[2]) * t],
      n: a.n ? [a.n[0] + (b.n[0] - a.n[0]) * t, a.n[1] + (b.n[1] - a.n[1]) * t, a.n[2] + (b.n[2] - a.n[2]) * t] : null,
      u: a.u ? [a.u[0] + (b.u[0] - a.u[0]) * t, a.u[1] + (b.u[1] - a.u[1]) * t] : null,
    };
  }
  function emit(v) {
    outP.push(v.p[0], v.p[1], v.p[2]);
    if (outN) outN.push(v.n[0], v.n[1], v.n[2]);
    if (outU) outU.push(v.u[0], v.u[1]);
  }
  for (var t = 0; t < tri; t++) {
    var vs = [vert(t * 3), vert(t * 3 + 1), vert(t * 3 + 2)];
    var inside = vs.map(function (v) { return v.p[1] <= yMax + 1e-6; });
    if (inside[0] && inside[1] && inside[2]) { vs.forEach(emit); continue; }
    if (!inside[0] && !inside[1] && !inside[2]) continue;
    var poly = [];
    for (var k = 0; k < 3; k++) {
      var a = vs[k], b = vs[(k + 1) % 3], ia = inside[k], ib = inside[(k + 1) % 3];
      if (ia) poly.push(a);
      if (ia !== ib) poly.push(lerp(a, b, (yMax - a.p[1]) / (b.p[1] - a.p[1])));
    }
    for (var f = 1; f + 1 < poly.length; f++) { emit(poly[0]); emit(poly[f]); emit(poly[f + 1]); }
  }
  return { pos: outP, nrm: outN, uv: outU };
}

/* Indices of the triangles lying flat ON the cut plane and facing up: the
   top of a wall built to height yCut. Those become the cap. */
export function topFaceTriangles(pos, yCut, eps) {
  var e = eps == null ? 0.02 : eps, out = [];
  for (var t = 0; t < pos.length / 9; t++) {
    var o = t * 9;
    if (Math.abs(pos[o + 1] - yCut) > e || Math.abs(pos[o + 4] - yCut) > e || Math.abs(pos[o + 7] - yCut) > e) continue;
    // face normal's y from the cross product of the two edges
    var ax = pos[o + 3] - pos[o], az = pos[o + 5] - pos[o + 2],
      bx = pos[o + 6] - pos[o], bz = pos[o + 8] - pos[o + 2];
    var ny = az * bx - ax * bz;
    if (ny > 1e-9) out.push(t);
  }
  return out;
}

/* Effective cut height: Infinity (no cut) unless the cutaway is on and the
   view is one a cut belongs in. First-person walking and the game modes need
   the whole wall. */
export const CUT_MIN = 60;
export function cutHeightFor(cutaway, opts) {
  if (!cutaway || !cutaway.on) return Infinity;
  if (opts && (opts.walk || opts.game)) return Infinity;
  var h = Number(cutaway.height);
  if (!isFinite(h)) h = 160;
  return Math.max(CUT_MIN, h);
}

/* ---- the near-side cut of 3D edit mode (view3d.js updateSeeThrough) ----

   Which walls step out of the way so the camera can see what it is looking
   at. The first rule only cut a wall that crossed the ONE ray from the camera
   to the orbit target, so while orbiting, the near walls off to either side of
   that ray kept standing in front of the rooms behind them, and walls popped
   in and out one at a time as the ray swept across their ends. This rule cuts
   the whole near side at once, the way a dollhouse view is drawn:

     - the wall's line runs between the camera and the target (it is on the
       near side, not behind what you are looking at);
     - some part of the wall is nearer the camera than the target, measured
       along the view, so a far wall whose line happens to slant across the
       view stays up;
     - it is turned towards the camera: a wall seen edge-on hides almost
       nothing and is what tells you where the rooms are, so it stays;
     - the view is not looking (almost) straight down, where walls hide next to
       nothing and "near side" stops meaning anything.

   Every threshold has a little hysteresis (`was`: the wall is cut now), so a
   camera resting on a boundary does not make a wall flicker.

   `w` is { ax, az, ux, uz, L, half }: the wall's start point, unit direction,
   length and half thickness. `cam` and `tgt` are { x, y, z }. */
export const NEAR_FACING_CUT = 0.42; // |cos| between wall normal and view: cut at or above
export const NEAR_FACING_KEEP = 0.3; // ...and a cut wall comes back below this
var NEAR_MARGIN = 15; // cm

export function nearSideWall(w, cam, tgt, was) {
  if (!w || !cam || !tgt || !(w.L > 0)) return false;
  var vx = tgt.x - cam.x, vz = tgt.z - cam.z, hd = Math.hypot(vx, vz);
  if (hd < 1) return false;
  var rise = (cam.y || 0) - (tgt.y || 0);
  if (rise > 0 && hd < rise * (was ? 0.22 : 0.3)) return false; // within ~17° of straight down
  vx /= hd;
  vz /= hd;
  var nx = -w.uz, nz = w.ux;
  if (Math.abs(nx * vx + nz * vz) < (was ? NEAR_FACING_KEEP : NEAR_FACING_CUT)) return false;
  var dc = (cam.x - w.ax) * nx + (cam.z - w.az) * nz,
    dt = (tgt.x - w.ax) * nx + (tgt.z - w.az) * nz;
  if (Math.abs(dc) <= (w.half || 0)) return false; // the camera is in the wall itself
  var beyond = dc > 0 ? -dt : dt; // how far past the wall the target lies, from the camera's side
  if (beyond < (was ? -NEAR_MARGIN : NEAR_MARGIN)) return false;
  var ea = (w.ax - tgt.x) * vx + (w.az - tgt.z) * vz,
    eb = (w.ax + w.ux * w.L - tgt.x) * vx + (w.az + w.uz * w.L - tgt.z) * vz;
  return Math.min(ea, eb) < (was ? NEAR_MARGIN : 0);
}

export function normalizeCutaway(c) {
  c = c && typeof c === "object" ? c : {};
  var h = Number(c.height);
  return {
    on: !!c.on,
    height: isFinite(h) ? Math.max(CUT_MIN, Math.min(400, h)) : 160,
    cap: c.cap === "dark" ? "dark" : "white",
  };
}

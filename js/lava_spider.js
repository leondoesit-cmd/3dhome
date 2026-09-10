/* The Floor is Lava — the spider kit: web casting, wall cling, rope swing.

   Kept DOM-free and THREE-free like lava_state.js so the whole movement
   vocabulary is testable in Node. Everything here works off the same collision
   snapshot the walk code uses (`L.col`): `segs` are thick wall centre-lines of
   unbounded height, `rects` are y0..y1 boxes. That is the entire world model —
   there is no mesh raycast in the loop, and there must not be: a web is fired
   several times a second and the plan can hold thousands of triangles. */
import { clamp } from "./state.js";
import { P_RAD, P_CLEAR } from "./lava_state.js";

export const WEB_RANGE = 1500,      // how far a line reaches (cm)
  WEB_MIN = 26,                     // anything closer than this is not a swing
  ZIP_SPEED = 620,                  // pull speed along a fired line
  ZIP_ARRIVE = 16,                  // "close enough", in cm to the anchor
  ZIP_MAX_T = 2.4,                  // a zip that cannot finish is a zip that ended
  CLING_REACH = 9,                  // gap between the body and a surface you can hold
  CRAWL_SPD = 118,                  // crawling is deliberately slower than sprinting
  CRAWL_SPRINT = 196,
  WALL_JUMP_OUT = 205,              // leap off a wall: away from it…
  WALL_JUMP_UP = 268,               // …and up
  NO_CLING = 0.22,                  // grace after letting go, so you don't re-stick
  SWING_ACCEL = 520,                // in-air steering while on the rope
  REEL_SPD = 150,                   // rope shortens while you hold forward
  AUTO_REEL = 520,                  // …and reels itself in while it hangs slack
  HANG_FRAC = 0.8,                  // how far under the anchor the arc settles
  SWING_MIN_LEN = 34,
  SWING_RISE = 24,                  // an anchor has to be above you to be a swing
  WALL_TOP = 260;                   // fallback wall height when the plan has none

/* ---- ray casting against the collision snapshot ---- */

/* 2D ray (o + t*d, d NOT normalised — it carries the 3D ray's XZ components,
   so t stays the 3D parameter) against a finite edge. -1 for a miss. */
function rayEdge(ox, oz, dx, dz, ax, az, bx, bz) {
  var ex = bx - ax,
    ez = bz - az;
  var den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return -1;
  var qx = ax - ox,
    qz = az - oz;
  var t = (qx * ez - qz * ex) / den;
  if (t < 0) return -1;
  var u = (qx * dz - qz * dx) / den;
  if (u < 0 || u > 1) return -1;
  return t;
}

function hitSeg(s, ox, oy, oz, dx, dy, dz, top, best) {
  var ex = s.bx - s.ax,
    ez = s.bz - s.az,
    el = Math.hypot(ex, ez);
  if (!(el > 0.001)) return best;
  var ux = ex / el,
    uz = ez / el,
    nx = -uz,
    nz = ux,
    h = s.half || 6;
  var ax = s.ax,
    az = s.az,
    bx = s.bx,
    bz = s.bz;
  var edges = [
    [ax + nx * h, az + nz * h, bx + nx * h, bz + nz * h, nx, nz],
    [bx + nx * h, bz + nz * h, bx - nx * h, bz - nz * h, ux, uz],
    [ax - nx * h, az - nz * h, bx - nx * h, bz - nz * h, -nx, -nz],
    [ax + nx * h, az + nz * h, ax - nx * h, az - nz * h, -ux, -uz],
  ];
  for (var i = 0; i < 4; i++) {
    var e = edges[i];
    var t = rayEdge(ox, oz, dx, dz, e[0], e[1], e[2], e[3]);
    if (t < 0 || (best && t >= best.dist)) continue;
    var y = oy + dy * t;
    if (y < 0 || y > top) continue;
    best = {
      x: ox + dx * t, y: y, z: oz + dz * t,
      nx: e[4], ny: 0, nz: e[5],
      dist: t, kind: "wall", top: top, bottom: 0, id: s.id || null,
    };
  }
  return best;
}

function hitRect(rc, ox, oy, oz, dx, dy, dz, best) {
  var tmin = 0,
    tmax = best ? best.dist : Infinity;
  var axis = -1,
    sign = 1;
  var lo = [rc.x0, rc.y0, rc.z0],
    hi = [rc.x1, rc.y1, rc.z1],
    o = [ox, oy, oz],
    d = [dx, dy, dz];
  for (var a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo[a] || o[a] > hi[a]) return best;
      continue;
    }
    var t1 = (lo[a] - o[a]) / d[a],
      t2 = (hi[a] - o[a]) / d[a],
      s = -1;
    if (t1 > t2) {
      var tt = t1;
      t1 = t2;
      t2 = tt;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      axis = a;
      sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return best;
  }
  if (axis < 0) return best; // the ray started inside the box
  return {
    x: ox + dx * tmin, y: oy + dy * tmin, z: oz + dz * tmin,
    nx: axis === 0 ? sign : 0,
    ny: axis === 1 ? sign : 0,
    nz: axis === 2 ? sign : 0,
    dist: tmin, kind: "rect", top: rc.y1, bottom: rc.y0,
    id: (rc.item && (rc.item.id || rc.item.type)) || null,
    rect: rc,
  };
}

/* Nearest surface along a ray. `d` need not be normalised; `dist` comes back
   in the same units it is expressed in (pass a unit vector for centimetres). */
export function castWeb(col, ox, oy, oz, dx, dy, dz, maxD, opts) {
  opts = opts || {};
  var top = opts.wallTop == null ? WALL_TOP : opts.wallTop;
  var range = maxD == null ? WEB_RANGE : maxD;
  var best = { dist: range };
  var segs = (col && col.segs) || [];
  for (var i = 0; i < segs.length; i++) best = hitSeg(segs[i], ox, oy, oz, dx, dy, dz, top, best);
  var doors = (col && col.doorSegs) || [];
  for (var k = 0; k < doors.length; k++) {
    if (doors[k].pivot && doors[k].pivot.userData && doors[k].pivot.userData.open) continue;
    best = hitSeg(doors[k], ox, oy, oz, dx, dy, dz, top, best);
  }
  var rects = (col && col.rects) || [];
  for (var j = 0; j < rects.length; j++) {
    if (rects[j]) best = hitRect(rects[j], ox, oy, oz, dx, dy, dz, best);
  }
  /* The ceiling is a plane, not a mesh: the planner draws walls, not a slab
     over the room, and without it a web fired upward in an ordinary flat
     catches nothing at all — which is most of the mode. Bounded by the plan so
     a line fired out of a window does not anchor on the sky. */
  if (opts.ceilY != null && dy > 1e-9) {
    var tc = (opts.ceilY - oy) / dy;
    if (tc >= 0 && tc < best.dist) {
      var cx = ox + dx * tc,
        cz = oz + dz * tc,
        bb = opts.bounds;
      if (!bb || (cx >= bb.minx && cx <= bb.maxx && cz >= bb.minz && cz <= bb.maxz))
        best = {
          x: cx, y: opts.ceilY, z: cz,
          nx: 0, ny: -1, nz: 0,
          dist: tc, kind: "ceiling", top: opts.ceilY, bottom: opts.ceilY, id: "ceiling",
        };
    }
  }
  if (opts.floor !== false && dy < -1e-9) {
    var t = -oy / dy;
    if (t >= 0 && t < best.dist)
      best = {
        x: ox + dx * t, y: 0, z: oz + dz * t,
        nx: 0, ny: 1, nz: 0,
        dist: t, kind: "floor", top: 0, bottom: 0, id: "floor",
      };
  }
  return best.kind ? best : null;
}

export function lookDir(yaw, pitch) {
  var cp = Math.cos(pitch || 0);
  return { x: cp * Math.sin(yaw || 0), y: Math.sin(pitch || 0), z: cp * Math.cos(yaw || 0) };
}

/* Where a swing line goes. Straight down the sightline first — that is the
   shot the player thinks they are taking — and only if that finds nothing
   worth hanging from does it fan upward, because a swing anchored below your
   head is a rope you fall onto, not one you ride. */
export function aimAnchor(col, ox, oy, oz, yaw, pitch, opts) {
  opts = opts || {};
  var rise = opts.rise == null ? SWING_RISE : opts.rise;
  var range = opts.range == null ? WEB_RANGE : opts.range;
  /* The sightline first — that is the shot the player thinks they are taking —
     then steeper, then FLATTER. The flat shots matter more than they look: in
     a room with no ceiling mesh the only thing high enough to hang from is the
     top of a wall across the flat, and every steep shot sails over it. */
  var lifts = [0, 0.3, 0.65, 1.05, -0.25, -0.5];
  for (var i = 0; i < lifts.length; i++) {
    var p = clamp(pitch + lifts[i], -1.35, 1.45);
    var d = lookDir(yaw, p);
    var h = castWeb(col, ox, oy, oz, d.x, d.y, d.z, range, opts);
    if (h && h.y >= oy + rise && h.dist >= WEB_MIN) return h;
  }
  return null;
}

/* ---- clinging ---- */

/* The closest surface the player could be holding onto right now. Returns the
   point ON the surface plus the normal pointing back at the player, so the
   caller can glue the body to it without caring what kind of thing it is. */
export function findCling(col, x, y, z, reach, opts) {
  opts = opts || {};
  var top = opts.wallTop == null ? WALL_TOP : opts.wallTop;
  var body = opts.body == null ? P_CLEAR : opts.body;
  var rad = opts.rad == null ? P_RAD : opts.rad;
  reach = reach == null ? CLING_REACH : reach;
  var best = null;
  function keep(c) {
    if (!best || c.gap < best.gap) best = c;
  }
  function wall(s) {
    var ex = s.bx - s.ax,
      ez = s.bz - s.az,
      el = Math.hypot(ex, ez);
    if (!(el > 0.001)) return;
    if (y >= top - 2) return; // over the top of the wall: nothing left to hold
    var ux = ex / el,
      uz = ez / el;
    var t = clamp((x - s.ax) * ux + (z - s.az) * uz, 0, el);
    var cx = s.ax + ux * t,
      cz = s.az + uz * t;
    var dx = x - cx,
      dz = z - cz,
      d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    var h = s.half || 6;
    var gap = d - h - rad;
    if (gap > reach) return;
    var nx = dx / d,
      nz = dz / d;
    keep({
      px: cx + nx * h, pz: cz + nz * h,
      nx: nx, nz: nz, gap: gap,
      top: top, bottom: 0, kind: "wall", id: s.id || null,
    });
  }
  var segs = (col && col.segs) || [];
  for (var i = 0; i < segs.length; i++) wall(segs[i]);
  var doors = (col && col.doorSegs) || [];
  for (var k = 0; k < doors.length; k++) {
    if (doors[k].pivot && doors[k].pivot.userData && doors[k].pivot.userData.open) continue;
    wall(doors[k]);
  }
  var rects = (col && col.rects) || [];
  for (var j = 0; j < rects.length; j++) {
    var rc = rects[j];
    if (!rc) continue;
    if (rc.y1 <= y + 2) continue; // below the feet — that is a floor, not a face
    if (rc.y0 >= y + body) continue; // over the head — no face beside you
    var cx2 = clamp(x, rc.x0, rc.x1),
      cz2 = clamp(z, rc.z0, rc.z1);
    var dx2 = x - cx2,
      dz2 = z - cz2,
      d2 = Math.hypot(dx2, dz2);
    if (d2 < 1e-3) continue; // inside its footprint: which face is ambiguous
    var gap2 = d2 - rad;
    if (gap2 > reach) continue;
    keep({
      px: cx2, pz: cz2,
      nx: dx2 / d2, nz: dz2 / d2, gap: gap2,
      top: rc.y1, bottom: rc.y0, kind: "rect",
      id: (rc.item && (rc.item.id || rc.item.type)) || null,
    });
  }
  return best;
}

/* A ceiling to hang from: the underside of a box just over your head. */
export function findCeiling(col, x, y, z, reach, opts) {
  opts = opts || {};
  var body = opts.body == null ? P_CLEAR : opts.body;
  reach = reach == null ? CLING_REACH : reach;
  var head = y + body;
  if (opts.ceilY != null && opts.ceilY >= head - 2 && opts.ceilY <= head + reach) {
    var bb = opts.bounds;
    if (!bb || (x >= bb.minx && x <= bb.maxx && z >= bb.minz && z <= bb.maxz))
      return { y: opts.ceilY, id: "ceiling" };
  }
  var rects = (col && col.rects) || [];
  var best = null;
  for (var i = 0; i < rects.length; i++) {
    var rc = rects[i];
    if (!rc) continue;
    if (rc.y0 < head - 2 || rc.y0 > head + reach) continue;
    if (x < rc.x0 || x > rc.x1 || z < rc.z0 || z > rc.z1) continue;
    if (!best || rc.y0 < best.y) best = { y: rc.y0, id: (rc.item && (rc.item.id || rc.item.type)) || null };
  }
  return best;
}

/* Movement basis on a vertical surface: "up" is the sightline flattened into
   the wall (so looking at the ceiling climbs and looking at the floor descends,
   which is how everyone expects a wall crawl to steer), "right" is across it. */
export function wallBasis(nx, nz, yaw, pitch) {
  var f = lookDir(yaw, pitch);
  var dot = f.x * nx + f.z * nz;
  var ux = f.x - nx * dot,
    uy = f.y,
    uz = f.z - nz * dot;
  var l = Math.hypot(ux, uy, uz);
  if (l < 0.08) {
    // staring straight into the wall leaves no in-plane direction: climb
    ux = 0;
    uy = 1;
    uz = 0;
    l = 1;
  }
  ux /= l;
  uy /= l;
  uz /= l;
  var rx = uy * nz,
    ry = uz * nx - ux * nz,
    rz = -uy * nx;
  var rl = Math.hypot(rx, ry, rz) || 1;
  return { ux: ux, uy: uy, uz: uz, rx: rx / rl, ry: ry / rl, rz: rz / rl };
}

/* ---- the rope ---- */

/* Inextensible rope: outside its length the body is pulled back onto the
   sphere and only the OUTWARD radial speed is removed. Killing the whole
   radial component would eat the fall that makes the swing, and adding a
   spring would make the line breathe. Returns null while there is slack. */
export function ropeConstrain(px, py, pz, vx, vy, vz, ax, ay, az, len) {
  var dx = px - ax,
    dy = py - ay,
    dz = pz - az;
  var d = Math.hypot(dx, dy, dz);
  if (!(d > 1e-3) || d <= len) return null;
  var nx = dx / d,
    ny = dy / d,
    nz = dz / d;
  var radial = vx * nx + vy * ny + vz * nz;
  if (radial < 0) radial = 0;
  return {
    x: ax + nx * len, y: ay + ny * len, z: az + nz * len,
    vx: vx - nx * radial, vy: vy - ny * radial, vz: vz - nz * radial,
    taut: true,
  };
}

/* The length a slack line settles at: long enough to be an arc, short enough
   that the bottom of the arc is off the floor. A rope fired at a ceiling from
   across the room is longer than the room is tall, and left at that length the
   "swing" is just a jog with a string attached — the pendulum never goes taut
   because every step takes you closer to the anchor. */
export function hangLength(anchorY, y) {
  return Math.max(SWING_MIN_LEN, (anchorY - y) * HANG_FRAC);
}

/* How much of the swing is left in the tank, 0..1 — drives the HUD arc. */
export function swingCharge(anchorY, y, len) {
  if (!(len > 0)) return 0;
  return clamp((anchorY - y) / len, 0, 1);
}

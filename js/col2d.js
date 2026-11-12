/* Shared 2D circle collision for floor-plan games (Night Shift, Micro-RC, karts).
   Walls = thick segments (with optional door pivots). Furniture = height-banded
   AABBs. Improvements over the old per-mode copies:
     • 3–4 relaxation passes so wall+furniture corners resolve cleanly
     • Segment endpoints treated as discs (no corner snag / tunnel)
     • Optional continuous sweep for fast movers
     • Item-level rect merge (stops mesh gaps letting you clip sofas)
     • Penetration clamp so deep embeds don't teleport
*/
import { clamp } from "./state.js";

export function rectBlocks(rc, y, clear, step) {
  return rc.y0 < y + clear && rc.y1 > y + step;
}

export function groundAt(col, x, z, y, step) {
  var g = 0;
  if (!col || !col.rects) return g;
  var R = col.rects;
  for (var i = 0; i < R.length; i++) {
    var rc = R[i];
    if (x < rc.x0 || x > rc.x1 || z < rc.z0 || z > rc.z1) continue;
    if (rc.y1 <= y + step + 0.01 && rc.y1 > g) g = rc.y1;
  }
  return g;
}

// Merge overlapping/nearby rects that share the same item id into one solid box.
// Per-mesh AABBs leave hairline gaps that circles slip through.
export function mergeItemRects(raw) {
  if (!raw || !raw.length) return [];
  var by = Object.create(null),
    orphans = [];
  for (var i = 0; i < raw.length; i++) {
    var r = raw[i],
      id = r.item && (r.item.id || r.item._id);
    if (id == null) {
      orphans.push(r);
      continue;
    }
    var k = String(id);
    if (!by[k]) {
      by[k] = {
        x0: r.x0,
        z0: r.z0,
        x1: r.x1,
        z1: r.z1,
        y0: r.y0,
        y1: r.y1,
        item: r.item,
      };
    } else {
      var m = by[k];
      m.x0 = Math.min(m.x0, r.x0);
      m.z0 = Math.min(m.z0, r.z0);
      m.x1 = Math.max(m.x1, r.x1);
      m.z1 = Math.max(m.z1, r.z1);
      m.y0 = Math.min(m.y0, r.y0);
      m.y1 = Math.max(m.y1, r.y1);
    }
  }
  var out = orphans.slice();
  for (var key in by) out.push(by[key]);
  return out;
}

// Inflate rects slightly so thin legs / open shelves still block.
export function padRects(rects, pad) {
  pad = pad == null ? 1.5 : pad;
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    r.x0 -= pad;
    r.z0 -= pad;
    r.x1 += pad;
    r.z1 += pad;
  }
  return rects;
}

// Optional uniform-grid broad phase. The narrow phase below is unchanged, so
// indexed and non-indexed collision produce the same contacts; the grid merely
// avoids testing every wall and furniture box in a large floor plan.
export function buildSpatialIndex(col, cellSize, queryPadding) {
  if (!col) return null;
  var size = Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 180;
  var padding = Number.isFinite(queryPadding) && queryPadding >= 0 ? queryPadding : 64;
  var cells = Object.create(null);

  function add(kind, shape, x0, z0, x1, z1) {
    var ix0 = Math.floor(x0 / size),
      iz0 = Math.floor(z0 / size),
      ix1 = Math.floor(x1 / size),
      iz1 = Math.floor(z1 / size);
    for (var ix = ix0; ix <= ix1; ix++)
      for (var iz = iz0; iz <= iz1; iz++) {
        var key = ix + "," + iz;
        var cell = cells[key] || (cells[key] = { segs: [], doorSegs: [], rects: [] });
        cell[kind].push(shape);
      }
  }

  function addSegments(list, kind) {
    for (var i = 0; i < list.length; i++) {
      var seg = list[i],
        half = seg.half || 0;
      // Cache the invariant segment vector for the hot narrow-phase path.
      seg._colDx = seg.bx - seg.ax;
      seg._colDz = seg.bz - seg.az;
      seg._colL2 = seg._colDx * seg._colDx + seg._colDz * seg._colDz;
      add(
        kind,
        seg,
        Math.min(seg.ax, seg.bx) - half - padding,
        Math.min(seg.az, seg.bz) - half - padding,
        Math.max(seg.ax, seg.bx) + half + padding,
        Math.max(seg.az, seg.bz) + half + padding
      );
    }
  }

  addSegments(col.segs || [], "segs");
  addSegments(col.doorSegs || [], "doorSegs");
  var rects = col.rects || [];
  for (var i = 0; i < rects.length; i++) {
    var rc = rects[i];
    add("rects", rc, rc.x0 - padding, rc.z0 - padding, rc.x1 + padding, rc.z1 + padding);
  }
  col.spatial = { cellSize: size, queryPadding: padding, cells: cells };
  return col.spatial;
}

// (fx, fz): unit direction to use when the centre sits exactly on the point
// (a segment passes its normal); +x otherwise.
function pushPoint(p, cx, cz, minR, soft, state, fx, fz) {
  var nx = p.x - cx,
    nz = p.z - cz,
    d = Math.hypot(nx, nz);
  if (d >= minR) return;
  if (d < 1e-6) {
    // (nx, nz) must keep length d, since the push below scales it by pen / d —
    // a unit vector here flung a body standing exactly on a wall line
    // ~minR * 1e6 away.
    d = 1e-6;
    nx = (fx != null ? fx : 1) * d;
    nz = (fz != null ? fz : 0) * d;
  }
  var pen = minR - d;
  // clamp single push so a deep embed can't fling the body across the room
  if (pen > minR * 1.5) pen = minR * 1.5;
  var s = pen / d;
  p.x += nx * s;
  p.z += nz * s;
  state.hit = Math.max(state.hit, pen);
  if (!soft) state.hard = Math.max(state.hard, pen);
}

function pushSeg(s, p, r, soft, state) {
  var dx = s._colDx != null ? s._colDx : s.bx - s.ax,
    dz = s._colDz != null ? s._colDz : s.bz - s.az,
    L2 = s._colL2 != null ? s._colL2 : dx * dx + dz * dz;
  if (L2 < 1e-6) {
    pushPoint(p, s.ax, s.az, r + (s.half || 0), soft, state);
    return;
  }
  var tt = clamp(((p.x - s.ax) * dx + (p.z - s.az) * dz) / L2, 0, 1);
  var cx = s.ax + dx * tt,
    cz = s.az + dz * tt;
  var half = s.half || 0,
    L = Math.sqrt(L2);
  pushPoint(p, cx, cz, r + half, soft, state, -dz / L, dx / L);
  // endpoint discs catch corners the capsule projection can miss when sliding
  if (tt <= 0.02) pushPoint(p, s.ax, s.az, r + half, soft, state);
  else if (tt >= 0.98) pushPoint(p, s.bx, s.bz, r + half, soft, state);
}

var EMPTY_SPATIAL_LIST = [];
function spatialList(spatial, p, r, kind, fallback) {
  // Indexed shapes are expanded by queryPadding, so a center-point lookup is
  // sufficient and preserves the original narrow-phase ordering exactly.
  if (r <= spatial.queryPadding) {
    var size = spatial.cellSize;
    var cell = spatial.cells[Math.floor(p.x / size) + "," + Math.floor(p.z / size)];
    return cell ? cell[kind] : EMPTY_SPATIAL_LIST;
  }
  return fallback; // unusually large bodies use the exact full scan
}

function pushRect(rc, p, r, y, clear, step, soft, state) {
  if (!rectBlocks(rc, y, clear, step)) return;
  var cx2 = clamp(p.x, rc.x0, rc.x1),
    cz2 = clamp(p.z, rc.z0, rc.z1);
  var nx2 = p.x - cx2,
    nz2 = p.z - cz2,
    d2 = Math.hypot(nx2, nz2);
  if (d2 >= r) return;
  if (d2 > 1e-6) {
    var pen = r - d2;
    if (pen > r * 1.5) pen = r * 1.5;
    p.x += (nx2 / d2) * pen;
    p.z += (nz2 / d2) * pen;
    state.hit = Math.max(state.hit, pen);
    if (!soft) state.hard = Math.max(state.hard, pen);
  } else {
    // center inside rect: exit nearest face
    var outs = [
      { d: p.x - rc.x0 + r, x: -1, z: 0 },
      { d: rc.x1 - p.x + r, x: 1, z: 0 },
      { d: p.z - rc.z0 + r, x: 0, z: -1 },
      { d: rc.z1 - p.z + r, x: 0, z: 1 },
    ];
    var best = outs[0];
    for (var i = 1; i < 4; i++) if (outs[i].d < best.d) best = outs[i];
    var push = Math.min(best.d, r * 2);
    p.x += best.x * push;
    p.z += best.z * push;
    state.hit = Math.max(state.hit, push);
    if (!soft) state.hard = Math.max(state.hard, push);
  }
}

/**
 * Resolve circle against a col model.
 * @param {object} col  { segs, doorSegs, rects, rails? }
 * @param {{x,z}} p     position (mutated)
 * @param {number} r    radius
 * @param {number} y    floor height of body
 * @param {number} clear body height above y
 * @param {number} step climbable ledge
 * @param {object} [opt]
 *   passes: relaxation iterations (default 3)
 *   walls: include soft rails (RC race)
 *   onHard: optional callback
 * @returns {number} max penetration resolved
 */
export function collideCircle(col, p, r, y, clear, step, opt) {
  opt = opt || {};
  if (!col) return 0;
  var passes = opt.passes != null ? opt.passes : 3;
  // Callers with a hot loop may supply one scratch object. It is reset here,
  // keeping the public result identical while avoiding garbage every probe.
  var state = opt.state || { hit: 0, hard: 0 };
  state.hit = 0;
  state.hard = 0;
  for (var pass = 0; pass < passes; pass++) {
    // `hit` is a running MAX, so measure this pass on its own: comparing the
    // max before and after stopped relaxing whenever a later pass pushed less
    // than the first one, i.e. almost always after pass 2.
    var prior = state.hit;
    state.hit = 0;
    colPass(col, p, r, y, clear, step, opt, state);
    var passHit = state.hit;
    state.hit = Math.max(prior, passHit);
    // early out when stable
    if (pass > 0 && passHit < 0.02) break;
  }
  if (opt.hardOut) opt.hardOut.value = state.hard;
  return state.hit;
}

export function colPass(col, p, r, y, clear, step, opt, state) {
  state = state || { hit: 0, hard: 0 };
  opt = opt || {};
  var i;
  // A purpose-built driving surface can own collision at this position. The
  // Micro-RC road uses this while the kart is physically supported by its deck:
  // apartment walls/furniture may pass below or visually beside a flyover, but
  // must not punch an invisible blocker through the racing lane. Road rails are
  // still resolved below, so this does not let the kart leave the circuit.
  var ignoreWorld = !!(opt.ignoreWorldAt && opt.ignoreWorldAt(p, y));
  var spatial = col.spatial;
  var segs = col.segs || [];
  if (!ignoreWorld) {
    var nearSegs = spatial ? spatialList(spatial, p, r, "segs", segs) : segs;
    for (i = 0; i < nearSegs.length; i++) pushSeg(nearSegs[i], p, r, false, state);
  }

  var doors = col.doorSegs || [];
  if (!ignoreWorld) {
    var nearDoors = spatial ? spatialList(spatial, p, r, "doorSegs", doors) : doors;
    for (i = 0; i < nearDoors.length; i++) {
      var ds = nearDoors[i];
      if (!ds.pivot || !ds.pivot.userData.open) pushSeg(ds, p, r, false, state);
    }
  }

  // optional RC road rails
  var rails = col.rails;
  if (rails) {
    var walls = opt.walls;
    for (i = 0; i < rails.length; i++) {
      var rl = rails[i];
      if (rl.soft && !walls) continue;
      if (rl.y0 < y + clear && rl.y1 > y + 0.4) pushSeg(rl, p, r, !!rl.soft, state);
    }
  }

  var rects = col.rects || [];
  if (!ignoreWorld) {
    var nearRects = spatial ? spatialList(spatial, p, r, "rects", rects) : rects;
    for (i = 0; i < nearRects.length; i++)
      pushRect(nearRects[i], p, r, y, clear, step, false, state);
  }

  return state.hit;
}

export function blockedAt(col, x, z, r, y, clear, step) {
  var p = { x: x, z: z };
  return collideCircle(col, p, r, y, clear, step, { passes: 2 }) > 0.01;
}

export function freeSpot(col, x, z, r, y, clear, step, maxRad, stepRad, spokes) {
  y = y || 0;
  clear = clear == null ? 160 : clear;
  step = step == null ? 40 : step;
  maxRad = maxRad || 260;
  stepRad = stepRad || 20;
  spokes = spokes || 14;
  if (!blockedAt(col, x, z, r + 2, y, clear, step)) return { x: x, z: z };
  for (var rad = stepRad; rad <= maxRad; rad += stepRad)
    for (var a = 0; a < spokes; a++) {
      var ang = (a / spokes) * Math.PI * 2 + rad * 0.15,
        px = x + Math.sin(ang) * rad,
        pz = z + Math.cos(ang) * rad;
      if (!blockedAt(col, px, pz, r + 2, y, clear, step)) return { x: px, z: pz };
    }
  return { x: x, z: z };
}

// Continuous collision: subdivide a move into steps so fast bodies don't skip walls.
export function moveCircle(col, p, dx, dz, r, y, clear, step, opt) {
  opt = opt || {};
  var dist = Math.hypot(dx, dz);
  if (dist < 1e-8) {
    collideCircle(col, p, r, y, clear, step, opt);
    return 0;
  }
  // step length ≈ 40% of radius (never less than 1 unit)
  var maxStep = Math.max(1, r * 0.4);
  var n = Math.min(12, Math.max(1, Math.ceil(dist / maxStep)));
  var sx = dx / n,
    sz = dz / n,
    hit = 0;
  for (var i = 0; i < n; i++) {
    p.x += sx;
    p.z += sz;
    hit = Math.max(hit, collideCircle(col, p, r, y, clear, step, opt));
  }
  return hit;
}

export function segCross(ax, az, bx, bz, cx, cz, dx2, dz2) {
  var r1 = bx - ax,
    r2 = bz - az,
    s1 = dx2 - cx,
    s2 = dz2 - cz;
  var den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return false;
  var u = ((cx - ax) * r2 - (cz - az) * r1) / den;
  var tt = ((cx - ax) * s2 - (cz - az) * s1) / den;
  return u >= 0 && u <= 1 && tt >= 0 && tt <= 1;
}

// LOS against wall + closed door segments. Furniture never blocks sight.
export function losClear(col, ax, az, bx, bz) {
  if (!col) return true;
  var i,
    segs = col.segs || [];
  for (i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (segCross(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz)) return false;
  }
  var doors = col.doorSegs || [];
  for (i = 0; i < doors.length; i++) {
    var d = doors[i];
    if (d.pivot && d.pivot.userData.open) continue;
    if (segCross(ax, az, bx, bz, d.ax, d.az, d.bx, d.bz)) return false;
  }
  return true;
}

// Soft separation between agents (zombies, cars) — keeps hordes from stacking.
export function separateAgents(agents, getXZ, setXZ, minDist, strength) {
  strength = strength == null ? 0.5 : strength;
  minDist = minDist || 40;
  var n = agents.length;
  for (var i = 0; i < n; i++) {
    var a = agents[i];
    if (!a || a.dead) continue;
    var A = getXZ(a);
    for (var j = i + 1; j < n; j++) {
      var b = agents[j];
      if (!b || b.dead) continue;
      var B = getXZ(b);
      var sx = A.x - B.x,
        sz = A.z - B.z,
        sd = Math.hypot(sx, sz);
      if (sd >= minDist || sd < 1e-4) continue;
      var push = ((minDist - sd) * strength) / 2;
      var ux = sx / sd,
        uz = sz / sd;
      setXZ(a, A.x + ux * push, A.z + uz * push);
      setXZ(b, B.x - ux * push, B.z - uz * push);
      A = getXZ(a);
    }
  }
}

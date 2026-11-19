/* The RC track's hairpins, dual lanes, ride anchors, grid routes and furniture
   lifts, split out of js/track.js. It shares the editor's state through live
   imports from ../track.js. */
import { pointInPoly } from "../geometry.js";
import { STEP_UP } from "../road_surface.js";
import { clamp } from "../state.js";
import { pathFree } from "../track/course_plan.js";
import {
  ATTRACT_MAX, ATTRACT_R, CAR_BAND, CELL, CLEAR_CAP, COVER_DY, DETOUR_MAX,
  DETOUR_SLOPE, FLOOR_Y, HAIRPIN, HAIRPIN_MAX, HAIRPIN_MIN, HAIRPIN_WIN, HALF,
  KERB_W, LANE_GAP, LANE_MIN, LANE_OFF, LANE_SAME, LEDGE, RIDE_FOOT,
  RIDE_HALF, RIDE_INSET, RIDE_MAX, RIDE_MIN, SAMP, TRUCK_PAD, crossesWall,
  tangent,
} from "../track.js";

// The 2D line is respaced after every pass that moves samples. The ASSEMBLED
// one never was — respace() rebuilds plain {x,y,z} and would drop the `gap`
// flags that carve the jump — so relaxing and curvature-limiting it left clumps
// behind: measured on a generated flat, 5% of the finished circuit was spaced
// under 1.6cm, and the tightest clump ran four samples 0.22cm apart where a fold
// the pass could not open had collapsed to a point instead. Every one of that
// track's worst turns sat inside a clump, and a 34° turn between two 2mm
// segments folds two full-width deck quads over each other — the torn, lipped
// ribbon this pipeline exists to avoid.
// So: the same walk, carrying the flags. `gap` comes from the segment a sample
// is emitted on, so the jump stays a run of gap samples rather than a hole that
// heals itself, and `at` records where each sample came from so an index into
// the old line can be followed to the new one.
function respaceKeep(pts, step) {
  if (pts.length < 3) return pts.slice();
  var first = { x: pts[0].x, z: pts[0].z, y: pts[0].y, gap: !!pts[0].gap, at: 0 };
  var out = [first],
    acc = 0;
  for (var j = 1; j <= pts.length; j++) {
    var a = pts[j - 1],
      b = pts[j % pts.length];
    var d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 1e-6) continue;
    acc += d;
    while (acc >= step) {
      var back = (acc - step) / d,
        f = 1 - back;
      out.push({
        x: b.x - (b.x - a.x) * back,
        z: b.z - (b.z - a.z) * back,
        y: a.y + (b.y - a.y) * f,
        // a sample sits ON this segment, so it is part of the jump only if the
        // segment it lies on is — taking either end would grow or shrink the gap
        gap: !!(a.gap && b.gap),
        at: j - 1,
      });
      acc -= step;
    }
  }
  while (
    out.length > 8 &&
    Math.hypot(out[out.length - 1].x - out[0].x, out[out.length - 1].z - out[0].z) <
      step * 0.5
  )
    out.pop();
  return out;
}

function signedTurn(pts, i) {
  var n = pts.length,
    a = pts[(i - 1 + n) % n],
    b = pts[i],
    c = pts[(i + 1) % n];
  var d = Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Don't splice a fitted arc in — SPREAD THE TWO LEGS APART. A dead end is a
// U-turn whose radius is half the distance between the leg that arrives and the
// leg that leaves, so the fix is to push those apart until that half-distance is
// a radius a truck can hold, easing the push out along both legs. The tip then
// rounds itself in the curvature pass, and because nothing is inserted or
// removed every other index into the line still means what it did.
// (A fitted arc was tried first and is a trap: its exit has no reason to line up
// with where the return leg actually runs, so each bulb bought its own radius by
// folding the line somewhere else — 8 splices, worst turn still 180 degrees.)
function spreadHairpins(pts, occ, minR) {
  var n = pts.length,
    fixed = 0,
    // Which tips have had their turn. Marked by INDEX, not by position: this
    // pass moves the samples it works on, so a tip recorded by where it used to
    // be is never recognised again and the same U gets opened over and over
    // until it is 60cm wide.
    handled = new Uint8Array(n);
  if (n < HAIRPIN_WIN * 6) return 0;
  for (var attempt = 0; attempt < HAIRPIN_MAX; attempt++) {
    var at = -1,
      worst = HAIRPIN;
    for (var i = 0; i < n; i++) {
      if (handled[i]) continue;
      var sum = 0;
      for (var k = -HAIRPIN_WIN; k <= HAIRPIN_WIN; k++)
        sum += signedTurn(pts, (i + k + n) % n);
      if (Math.abs(sum) <= worst) continue;
      worst = Math.abs(sum);
      at = i;
    }
    if (at < 0) break;
    function mark(r) {
      for (var m = -r; m <= r; m++) handled[(at + m + n) % n] = 1;
    }
    mark(HAIRPIN_WIN * 2);
    // the axis of the U: the tip, seen from back down the leg that arrives
    var back = pts[(at - HAIRPIN_WIN * 2 + n) % n],
      fwd = pts[(at + HAIRPIN_WIN * 2) % n];
    var ux = pts[at].x - back.x,
      uz = pts[at].z - back.z,
      ul = Math.hypot(ux, uz);
    if (ul < 1) continue;
    ux /= ul;
    uz /= ul;
    var nx = -uz,
      nz = ux;
    // how far apart the legs already are, measured clear of the tip itself
    var sep = (fwd.x - back.x) * nx + (fwd.z - back.z) * nz,
      side = sep >= 0 ? 1 : -1;
    for (var r = minR; r >= HAIRPIN_MIN; r *= 0.75) {
      var push = r - Math.abs(sep) / 2;
      if (push <= 0.5) break; // already wide enough to be driven round
      // spread over enough road that opening the U does not itself kink it
      var fade = Math.max(HAIRPIN_WIN, Math.ceil((r * 2.4) / SAMP)),
        off = [],
        worse = 0,
        ok = true;
      for (var k2 = -fade; k2 <= fade; k2++) {
        var w = 0.5 * (1 + Math.cos((Math.PI * k2) / (fade + 1))) * push,
          sg = (k2 >= 0 ? 1 : -1) * side,
          j = (at + k2 + n) % n;
        off.push({ i: j, x: nx * w * sg, z: nz * w * sg });
        var tx = pts[j].x + nx * w * sg,
          tz = pts[j].z + nz * w * sg;
        if (!occ) continue;
        if (crossesWall(occ, pts[j].x, pts[j].z, tx, tz)) ok = false;
        else if (!occ.free(tx, tz) && occ.free(pts[j].x, pts[j].z)) worse++;
      }
      // COUNT the samples this would put somewhere worse, never veto on the
      // first one. The offset fades out over a couple of dozen samples, so under
      // an all-or-nothing rule a single sample at the far tail of the fade —
      // usually one already brushing the wall the dead end is against — rejected
      // every radius on offer and the 180° tip stayed exactly as it was.
      if (!ok || worse > Math.max(2, Math.round(off.length * 0.12))) continue;
      off.forEach(function (o) {
        pts[o.i].x += o.x;
        pts[o.i].z += o.z;
      });
      mark(fade);
      fixed++;
      break;
    }
  }
  return fixed;
}

function dualLanes(anchors, half) {
  var N = anchors.length;
  if (N < 6) return anchors;
  var off = half * LANE_OFF;
  var out = anchors.map(function (a) {
    return Object.assign({}, a);
  });
  for (var i = 0; i < N; i++) {
    var twice = false;
    for (var j = 0; j < N && !twice; j++)
      if (
        j !== i &&
        Math.hypot(anchors[j].x - anchors[i].x, anchors[j].z - anchors[i].z) <
          LANE_SAME
      )
        twice = true;
    if (!twice) continue;
    // travel direction THROUGH this anchor, from the unshifted neighbours
    var p = anchors[(i - 1 + N) % N],
      q = anchors[(i + 1) % N];
    var dx = q.x - p.x,
      dz = q.z - p.z,
      l = Math.hypot(dx, dz);
    if (l < 1) continue;
    out[i].x += (dz / l) * off;
    out[i].z += (-dx / l) * off;
    out[i].lane = true;
  }
  return out;
}

// Where two passes still share a corridor, narrow BOTH decks so the pair fits
// between the walls instead of one being drawn over the other. Run on the
// assembled 3D line, so the test is "another pass at my height", not "another
// pass anywhere" — a flyover crossing 1m up is not sharing my tarmac.
function laneWidths(C, half) {
  var n = C.length,
    reach = half * 2 + LANE_GAP,
    want = new Float64Array(n);
  for (var a = 0; a < n; a++) {
    want[a] = half;
    if (C[a].w) {
      want[a] = C[a].w; // an explicit width (a home-mode ramp) wins
      continue;
    }
    var near = 1e9;
    for (var b = 0; b < n; b++) {
      if (Math.min(Math.abs(a - b), n - Math.abs(a - b)) < 14) continue;
      if (Math.abs((C[b].y || 0) - (C[a].y || 0)) > COVER_DY) continue;
      var dx = C[b].x - C[a].x,
        dz = C[b].z - C[a].z,
        d2 = dx * dx + dz * dz;
      if (d2 < near) near = d2;
    }
    near = Math.sqrt(near);
    if (near > reach) continue;
    // Exactly as narrow as the pair needs and no narrower: both decks plus
    // their kerbs have to fit inside the distance between the two lanes.
    want[a] = clamp(near / 2 - KERB_W, half * LANE_MIN, half);
  }
  // taper rather than step — a width that changes in one sample is a lip
  for (var s = 0; s < 4; s++) {
    var prev = Float64Array.from(want);
    for (var i = 0; i < n; i++)
      want[i] = Math.min(
        want[i],
        (prev[(i - 1 + n) % n] + prev[i] * 2 + prev[(i + 1) % n]) / 4,
      );
  }
  var count = 0;
  for (var k = 0; k < n; k++)
    if (want[k] < half - 0.05) {
      C[k].w = want[k];
      count++;
    }
  return count;
}

// `skip` holds the items home mode intends to DRIVE ON: they must not push the
// line away, or the route politely goes round the bed it is supposed to climb.
// A rejected item is handed back through block() and the line is cleared again.
function occupancy(env, x0, z0, x1, z1, high, skip, rooms) {
  var pad = HALF + 8;
  var gx0 = x0 - pad,
    gz0 = z0 - pad;
  var w = Math.ceil((x1 - x0 + pad * 2) / CELL),
    h = Math.ceil((z1 - z0 + pad * 2) / CELL);
  var g = new Uint8Array(Math.max(1, w * h));
  function mark(ax, az, bx, bz) {
    var i0 = clamp(Math.floor((ax - gx0) / CELL), 0, w - 1),
      i1 = clamp(Math.ceil((bx - gx0) / CELL), 0, w - 1),
      j0 = clamp(Math.floor((az - gz0) / CELL), 0, h - 1),
      j1 = clamp(Math.ceil((bz - gz0) / CELL), 0, h - 1);
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) g[j * w + i] = 1;
  }
  var clearance = null;
  function markRect(r) {
    mark(r.x0 - HALF, r.z0 - HALF, r.x1 + HALF, r.z1 + HALF);
    clearance = null;
  }
  (env.rects() || []).forEach(function (r) {
    if (skip && skip.indexOf(r) >= 0) return;
    // The SAME 2D line is driven twice — once on the floor and once on the
    // elevated deck — so it has to be clear at both heights. Checking only the
    // floor put gates inside wall cabinets and tall shelves a metre up, where
    // the collision resolver ejected trucks clean off the deck.
    var low = r.y0 < 7 && r.y1 > 2.5,
      highBlocked = r.y0 < (high || 0) + 7 && r.y1 > (high || 0) + 2.5;
    if (!low && !highBlocked) return;
    markRect(r);
  });
  (env.segs() || []).forEach(function (s) {
    var n = Math.max(1, Math.ceil(Math.hypot(s.bx - s.ax, s.bz - s.az) / (CELL * 0.5)));
    for (var k = 0; k <= n; k++) {
      var x = s.ax + ((s.bx - s.ax) * k) / n,
        z = s.az + ((s.bz - s.az) * k) / n,
        e = s.half + HALF;
      mark(x - e, z - e, x + e, z + e);
    }
  });
  // The garden is not part of the circuit. A router that only knows about walls
  // is delighted to find that the shortest way from the bedroom to the kitchen
  // goes out of the front door and round the outside of the flat, so mark
  // everything that is not floor as blocked — dilated by a few cells, because a
  // doorway's own centre lies inside the wall band and belongs to no room.
  if (rooms && rooms.length) {
    var insideCells = new Uint8Array(w * h);
    for (var cj = 0; cj < h; cj++)
      for (var ci = 0; ci < w; ci++) {
        var px = gx0 + (ci + 0.5) * CELL,
          pz = gz0 + (cj + 0.5) * CELL;
        for (var ri = 0; ri < rooms.length; ri++)
          if (pointInPoly(px, pz, rooms[ri].pts)) {
            insideCells[cj * w + ci] = 1;
            break;
          }
      }
    var grown = new Uint8Array(insideCells);
    for (var pass = 0; pass < 3; pass++) {
      var prev = new Uint8Array(grown);
      for (var dj = 0; dj < h; dj++)
        for (var di = 0; di < w; di++) {
          if (prev[dj * w + di]) continue;
          if (
            (di > 0 && prev[dj * w + di - 1]) ||
            (di < w - 1 && prev[dj * w + di + 1]) ||
            (dj > 0 && prev[(dj - 1) * w + di]) ||
            (dj < h - 1 && prev[(dj + 1) * w + di])
          )
            grown[dj * w + di] = 1;
        }
    }
    for (var gk = 0; gk < g.length; gk++) if (!grown[gk]) g[gk] = 1;
  }
  return {
    free: function (x, z) {
      var i = Math.floor((x - gx0) / CELL),
        j = Math.floor((z - gz0) / CELL);
      if (i < 0 || j < 0 || i >= w || j >= h) return false;
      return !g[j * w + i];
    },
    block: markRect,
    segs: env.segs() || [],
    grid: g,
    w: w,
    h: h,
    x0: gx0,
    z0: gz0,
    dirty: function () {
      clearance = null; // a newly blocked item invalidates the clearance field
    },
    // Cells to the nearest blocked one, capped — used to keep a route in the
    // middle of a doorway rather than scraping its jamb.
    room: function (i, j) {
      if (!clearance) {
        clearance = new Uint8Array(w * h);
        var queue = [],
          k;
        for (k = 0; k < g.length; k++)
          if (g[k]) {
            clearance[k] = 0;
            queue.push(k);
          } else clearance[k] = 255;
        for (var qi = 0; qi < queue.length; qi++) {
          var c = queue[qi],
            ci = c % w,
            cj = (c - ci) / w,
            nd = clearance[c] + 1;
          if (nd > CLEAR_CAP) continue;
          for (var d = 0; d < 4; d++) {
            var ni = ci + (d === 0 ? 1 : d === 1 ? -1 : 0),
              nj = cj + (d === 2 ? 1 : d === 3 ? -1 : 0);
            if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
            var nk = nj * w + ni;
            if (clearance[nk] <= nd) continue;
            clearance[nk] = nd;
            queue.push(nk);
          }
        }
      }
      return clearance[j * w + i];
    },
  };
}

function nearestFreeCell(occ, i, j) {
  if (i >= 0 && j >= 0 && i < occ.w && j < occ.h && !occ.grid[j * occ.w + i]) return [i, j];
  for (var r = 1; r < 24; r++)
    for (var dj = -r; dj <= r; dj++)
      for (var di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        var ni = i + di,
          nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= occ.w || nj >= occ.h) continue;
        if (!occ.grid[nj * occ.w + ni]) return [ni, nj];
      }
  return null;
}

function snapFree(p, occ) {
  var c = nearestFreeCell(
    occ,
    Math.floor((p.x - occ.x0) / CELL),
    Math.floor((p.z - occ.z0) / CELL),
  );
  if (!c) return false;
  p.x = occ.x0 + (c[0] + 0.5) * CELL;
  p.z = occ.z0 + (c[1] + 0.5) * CELL;
  return true;
}

function astar(occ, ax, az, bx, bz) {
  var w = occ.w,
    h = occ.h,
    N = w * h;
  var s = nearestFreeCell(occ, Math.floor((ax - occ.x0) / CELL), Math.floor((az - occ.z0) / CELL)),
    e = nearestFreeCell(occ, Math.floor((bx - occ.x0) / CELL), Math.floor((bz - occ.z0) / CELL));
  if (!s || !e) return null;
  var si = s[1] * w + s[0],
    ei = e[1] * w + e[0];
  if (si === ei) return [];
  var g = new Float32Array(N).fill(Infinity),
    from = new Int32Array(N).fill(-1),
    done = new Uint8Array(N),
    open = [si];
  g[si] = 0;
  function hCost(k) {
    var i = k % w,
      j = (k - i) / w;
    return Math.hypot(i - e[0], j - e[1]);
  }
  var fs = new Float32Array(N);
  fs[si] = hCost(si);
  while (open.length) {
    // small maps, small frontiers: a linear scan beats a heap's bookkeeping
    var bi = 0;
    for (var q = 1; q < open.length; q++) if (fs[open[q]] < fs[open[bi]]) bi = q;
    var cur = open.splice(bi, 1)[0];
    if (cur === ei) break;
    done[cur] = 1;
    var ci = cur % w,
      cj = (cur - ci) / w;
    for (var d = 0; d < 8; d++) {
      var di = d < 4 ? [1, -1, 0, 0][d] : [1, 1, -1, -1][d - 4],
        dj = d < 4 ? [0, 0, 1, -1][d] : [1, -1, 1, -1][d - 4];
      var ni = ci + di,
        nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      var nk = nj * w + ni;
      if (occ.grid[nk] || done[nk]) continue;
      // corners: never cut across the diagonal between two blocked cells
      if (di && dj && (occ.grid[cj * w + ni] || occ.grid[nj * w + ci])) continue;
      var step = di && dj ? 1.4142 : 1;
      // hug the middle of the room, not the skirting board
      step += (CLEAR_CAP - Math.min(CLEAR_CAP, occ.room(ni, nj))) * 0.7;
      var ng = g[cur] + step;
      if (ng >= g[nk]) continue;
      g[nk] = ng;
      from[nk] = cur;
      fs[nk] = ng + hCost(nk);
      if (open.indexOf(nk) < 0) open.push(nk);
    }
  }
  if (from[ei] < 0 && si !== ei) return null;
  var out = [],
    k = ei;
  while (k >= 0 && k !== si) {
    var i2 = k % w,
      j2 = (k - i2) / w;
    out.push({ x: occ.x0 + (i2 + 0.5) * CELL, z: occ.z0 + (j2 + 0.5) * CELL });
    k = from[k];
  }
  out.reverse();
  return out;
}

// Drop every waypoint the previous one can already see: an 8-connected grid path
// is a staircase, and a staircase makes a track full of 45° kinks no ramp can
// sit on.
function stringPull(pts, occ) {
  if (pts.length < 3) return pts;
  var out = [pts[0]],
    i = 0;
  while (i < pts.length - 1) {
    var j = pts.length - 1;
    for (; j > i + 1; j--)
      if (pathFree(occ, pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// Distance from a point to a segment — which leg of the tour passes closest to
// the bed.
function distToSeg(p, a, b) {
  var dx = b.x - a.x,
    dz = b.z - a.z,
    l2 = dx * dx + dz * dz;
  var t = l2 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

// Make the furniture part of the ROUTE, not an afterthought. The tour's own
// anchors are room centres and doorways with everything cleared out from under
// them, so a line drawn through them sails politely past the bed. Adding the bed
// as an anchor means the router paths INTO it and out the far side — one long
// straight run over the top, which is exactly what an access ramp needs at each
// end. (Bending a finished line at the bed instead gives a curve that arrives
// across a corner, and no ramp fits on a corner.)
function seedRideAnchors(loop, plats, tops, attract) {
  var out = loop.map(function (a) {
      var o = { x: a.x, z: a.z };
      if (a.ride) o.ride = a.ride;
      if (typeof a.y === "number") o.y = a.y;
      if (a.surf === "road" || a.surf === "home") o.surf = a.surf;
      return o;
    }),
    added = [];
  // an item the user has already told the route to climb is not a candidate for
  // a second, automatic detour onto the same thing
  var claimed = [];
  out.forEach(function (a) {
    if (a.ride && typeof a.ride === "object") claimed.push(a.ride);
  });
  // A waypoint that already stands on a model IS that visit. Snap it to the
  // driveable top and do not invent a second detour that loops around the lip
  // (which is what turned tabletops into flyovers).
  out.forEach(function (a) {
    if (a.ride) return;
    var hit = null;
    for (var i = 0; i < plats.length; i++) {
      var r = plats[i];
      if (claimed.indexOf(r) >= 0) continue;
      if (a.x < r.x0 || a.x > r.x1 || a.z < r.z0 || a.z > r.z1) continue;
      if (!hit || (r.x1 - r.x0) * (r.z1 - r.z0) < (hit.x1 - hit.x0) * (hit.z1 - hit.z0))
        hit = r;
    }
    if (!hit) return;
    var snap = rideTarget(hit, tops);
    if (!snap) return;
    a.x = snap.x;
    a.z = snap.z;
    a.ride = hit;
    claimed.push(hit);
    added.push(a);
  });
  if (attract === false) return { pts: out, added: added.length };
  var left = plats
    .filter(function (r) {
      return claimed.indexOf(r) < 0;
    })
    .map(function (r) {
      var t = rideTarget(r, tops);
      if (t) t.rect = r;
      return t;
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return b.y - a.y; // the bed / table before the footstool
    });
  // Greedy insertion: each remaining model lands on the loop leg it is
  // closest to, so the tour walks the apartment and climbs what it passes
  // rather than teleporting between the four tallest things. No radius cap —
  // a sofa in the far bedroom is exactly the kind of model the lap is for.
  while (left.length && added.length < ATTRACT_MAX) {
    var bi = -1,
      bj = -1,
      bd = ATTRACT_R;
    for (var t = 0; t < left.length; t++) {
      for (var i = 0; i < out.length; i++) {
        var d = distToSeg(left[t], out[i], out[(i + 1) % out.length]);
        if (d < bd) {
          bd = d;
          bi = i;
          bj = t;
        }
      }
    }
    if (bj < 0) break;
    var hit = left[bj];
    var anchor = { x: hit.x, z: hit.z, ride: hit.rect };
    out.splice(bi + 1, 0, anchor);
    added.push(anchor);
    left.splice(bj, 1);
  }
  return { pts: out, added: added.length };
}

export function seedHomeTour(loop, plats, tops) {
  return seedRideAnchors(loop, plats, tops).pts;
}

// The tour's anchors, joined by routes a truck can actually drive.
function gridRoute(anchors, occ) {
  var out = [],
    routed = 0;
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i],
      b = anchors[(i + 1) % anchors.length];
    out.push(a);
    if (pathFree(occ, a.x, a.z, b.x, b.z)) continue; // already a clear run
    var path = astar(occ, a.x, a.z, b.x, b.z);
    if (!path || !path.length) return { pts: [], routed: routed, failed: true };
    stringPull(path, occ).forEach(function (p, k, all) {
      if (k < all.length - 1) out.push(p); // the last one IS the next anchor
    });
    routed++;
  }
  return { pts: out, routed: routed };
}

function pushRun(pts, occ, from, len, tans) {
  var n = pts.length;
  // The ease-in HAS TO scale with the shove. A fixed five-sample fade turns a
  // 52cm detour into a 30cm-long ramp across the lane — a 180° fold, worse than
  // the obstacle it avoids. Spread it over ~1.6cm of road per cm of offset.
  function fadeFor(d) {
    return Math.max(3, Math.ceil((d * DETOUR_SLOPE) / SAMP));
  }
  var pad = fadeFor(DETOUR_MAX); // scored window: the same samples for every candidate
  function offAt(d, fade, k) {
    // k counts from the first faded sample of the widest window
    var rel = k - pad;
    if (rel >= 0 && rel < len) return d;
    var t = rel < 0 ? (rel + fade + 1) / (fade + 1) : (fade + len - rel) / (fade + 1);
    return d * 0.5 * (1 - Math.cos(Math.PI * clamp(t, 0, 1)));
  }
  // Score every candidate rather than demanding a perfect one. In a furnished
  // flat the grid is blocked for a road width around every wall and every unit,
  // so "all of it clears" is often true nowhere — and an all-or-nothing test
  // then does NOTHING, which is how the line ends up laid through the wardrobe
  // it was supposed to go round.
  var span = len + pad * 2;
  function cost(d, sg) {
    var fade = fadeFor(d),
      bad = 0;
    for (var k = 0; k < span; k++) {
      var i = (from - pad + k + n * 2) % n,
        t = tans[i],
        w = offAt(d, fade, k) * sg,
        x = pts[i].x - t.z * w,
        z = pts[i].z + t.x * w;
      // A detour that steps THROUGH a wall lands the line in the next room —
      // the same trap pushOffRect fell into. Rule it out, don't merely score it.
      if (crossesWall(occ, pts[i].x, pts[i].z, x, z)) return 1e9;
      if (!occ.free(x, z)) bad++;
    }
    return bad + d * 0.02; // ...nearest side and shortest shove first
  }
  var bestD = 0,
    bestSg = 1,
    best = cost(0, 1);
  if (best < 1) return 0;
  for (var d = 7; d <= DETOUR_MAX; d += 7)
    for (var sg = 1; sg >= -1; sg -= 2) {
      var c = cost(d, sg);
      if (c >= best) continue;
      best = c;
      bestD = d;
      bestSg = sg;
    }
  if (!bestD) return 0;
  var bestFade = fadeFor(bestD);
  for (var m = 0; m < span; m++) {
    var j = (from - pad + m + n * 2) % n,
      tj = tans[j],
      wj = offAt(bestD, bestFade, m) * bestSg;
    pts[j].x -= tj.z * wj;
    pts[j].z += tj.x * wj;
  }
  return 1;
}
function clearLine(pts, occ) {
  var n = pts.length,
    moved = 0;
  for (var pass = 0; pass < 3; pass++) {
    moved = 0;
    var blocked = new Uint8Array(n),
      any = 0,
      clear = -1;
    for (var i = 0; i < n; i++)
      if (occ.free(pts[i].x, pts[i].z)) {
        if (clear < 0) clear = i;
      } else {
        blocked[i] = 1;
        any++;
      }
    // nothing to fix, or nothing clear to lean the detour against
    if (!any || clear < 0) break;
    // Normals are taken from the line BEFORE anything moves: a run that shifts
    // its own neighbours would otherwise spiral away from the route.
    var tans = [];
    for (var t = 0; t < n; t++) tans.push(tangent(pts, t));
    var at = 0;
    while (at < n) {
      var k0 = (clear + at) % n;
      if (!blocked[k0]) {
        at++;
        continue;
      }
      var len = 0;
      while (len < n && blocked[(clear + at + len) % n]) len++;
      moved += pushRun(pts, occ, k0, len, tans);
      at += len;
    }
    if (!moved) break;
  }
  return moved;
}

// Guarantee vertical clearance where a crowded plan leaves no sideways route.
// clearLine() remains the first choice because driving around furniture looks
// natural. If samples are still inside a sofa/cabinet, the entire loop becomes
// one level flyover. A uniform deck cannot create a ramp lip where the circuit
// crosses itself, and turns an impossible road-through-object into a coherent,
// continuous fallback track.
function liftOverFurniture(C, env, half) {
  var rects = (env && env.rects && env.rects()) || [];
  if (!rects.length || C.length < 3) return 0;
  var BODY = 3.2,
    STEP = 2.2,
    MARGIN = 1.8,
    M = C.length;
  function near(box, p) {
    var cx = clamp(p.x, box.x0, box.x1),
      cz = clamp(p.z, box.z0, box.z1);
    return Math.hypot(p.x - cx, p.z - cz) <= half + MARGIN;
  }
  // Only invoke the fallback when the shaped route truly remains blocked.
  var blocked = false;
  for (var i = 0; i < M && !blocked; i++) {
    var p = C[i];
    if (p.gap) continue;
    for (var r = 0; r < rects.length; r++) {
      var box = rects[r];
      if (near(box, p) && box.y0 < p.y + BODY && box.y1 > p.y + STEP) {
        blocked = true;
        break;
      }
    }
  }
  if (!blocked) return 0;

  // A local hump can cross another pass of the same closed road and create a
  // new ledge. For an actually impossible layout, use one level, fully guarded
  // flyover instead: deterministic, continuous, and impossible for furniture
  // to intersect. Climb height until every vertical band above this route is
  // clear (including stacked/floating cabinets).
  var safeY = FLOOR_Y;
  for (var c = 0; c < M; c++) if (!C[c].gap) safeY = Math.max(safeY, C[c].y);
  for (var pass = 0; pass < rects.length + 1; pass++) {
    var nextY = safeY;
    for (var b = 0; b < rects.length; b++) {
      var rb = rects[b], relevant = false;
      for (var q = 0; q < M; q++)
        if (!C[q].gap && near(rb, C[q])) {
          relevant = true;
          break;
        }
      // The fallback is also a visual guarantee: its slab must sit above the
      // object, not merely within STEP_H of the top where physics could climb.
      if (relevant && rb.y0 < safeY + BODY && rb.y1 + MARGIN > safeY + 0.01)
        nextY = Math.max(nextY, rb.y1 + MARGIN);
    }
    if (nextY <= safeY + 0.01) break;
    safeY = nextY;
  }
  var raised = 0;
  for (var k = 0; k < M; k++) {
    if (C[k].gap || C[k].y >= safeY - 0.01) continue;
    C[k].y = safeY;
    raised++;
  }
  return raised;
}

// ---- home mode planning -----------------------------------------------------
// The surface the world already offers at (x,z): the floor, or a rug/threshold
// low enough that STEP_H drives straight onto it.
function groundUnder(env, x, z) {
  return env && env.groundAt ? env.groundAt(x, z, 2.6, 2.2) : 0;
}

function insideRect(r, x, z, inset) {
  return (
    x >= r.x0 + inset && x <= r.x1 - inset && z >= r.z0 + inset && z <= r.z1 - inset
  );
}

// The surface a truck could actually STAND on at (x,z): the highest part top no
// higher than a ramp can reach, and far enough inside that part's own footprint
// to be driven along. Read from the per-mesh boxes, never the merged item box —
// a sofa merges to the top of its backrest, and the thing you drive along is the
// seat 40cm below it.
function topUnder(tops, x, z) {
  var best = 0;
  for (var i = 0; i < tops.length; i++) {
    var t = tops[i];
    if (t.y1 > RIDE_MAX || t.y1 < RIDE_MIN || t.y1 <= best) continue;
    // a part you can drive ALONG, not the lid of a small box
    if (Math.min(t.x1 - t.x0, t.z1 - t.z0) < RIDE_FOOT) continue;
    if (!insideRect(t, x, z, RIDE_INSET)) continue;
    best = t.y1;
  }
  return best;
}

// Is the corridor over that surface clear? The backrest of the sofa, the lamp on
// the sideboard and the pillow on the bed all live in the same item box as the
// bit worth driving on.
function blockedAbove(tops, x, z, y) {
  for (var i = 0; i < tops.length; i++) {
    var t = tops[i];
    if (t.y1 <= y + STEP_UP || t.y0 >= y + CAR_BAND) continue;
    if (x < t.x0 - RIDE_HALF || x > t.x1 + RIDE_HALF) continue;
    if (z < t.z0 - RIDE_HALF || z > t.z1 + RIDE_HALF) continue;
    return true;
  }
  return false;
}

// The biggest driveable part of an item, and where its middle is: what the route
// aims at when it detours onto the furniture. For a sofa that is the seat, for a
// bed the mattress, for a table the top.
function rideTarget(r, tops) {
  var best = null,
    bestA = RIDE_FOOT * RIDE_FOOT * 0.5;
  for (var i = 0; i < tops.length; i++) {
    var t = tops[i];
    // A tabletop is its own mesh sitting 70cm up — requiring y0 on the floor
    // is what skipped every counter, desk and coffee table and left the tour
    // driving around the thing you came to drive on.
    if (t.y1 < RIDE_MIN || t.y1 > RIDE_MAX) continue;
    // it has to belong to this item's footprint, and be worth aiming at
    if (t.x0 < r.x0 - 2 || t.x1 > r.x1 + 2 || t.z0 < r.z0 - 2 || t.z1 > r.z1 + 2) continue;
    var w = t.x1 - t.x0,
      d = t.z1 - t.z0;
    if (Math.min(w, d) < RIDE_FOOT || w * d <= bestA) continue;
    bestA = w * d;
    best = { x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, y: t.y1 };
  }
  return best;
}

// Furniture the route is ALLOWED to climb onto: a part big enough to drive
// along, reachable by a ramp from the floor (or a bridge from another top).
// Standing on the floor is NOT required — a floating shelf or a tabletop mesh
// that does not include the legs is still a model you came to drive on.
function rideable(r, tops) {
  return Math.min(r.x1 - r.x0, r.z1 - r.z0) >= RIDE_FOOT && !!rideTarget(r, tops);
}

// The track editor offers "drive over this one" as a click on an item's top
// face, and it must offer it for exactly the items the builder can actually
// ramp onto — so it asks the builder rather than keeping its own copy of the
// rule (which would drift the first time RIDE_MAX moved).
export function canRide(r, tops) {
  return rideable(r, tops || []);
}
export function rideSpot(r, tops) {
  return rideTarget(r, tops || []);
}

// A hand-placed ride anchor arrives flagged `ride: true` — it knows it wants to
// be ON something, but not which rect that is (the editor and the builder hold
// different snapshots). Bind it to the plat it stands on and aim it at that
// item's driveable part, so from here on it is indistinguishable from one the
// router seeded itself: the re-route pass can drop it with the item when the
// ramp turns out not to fit.
function attachRides(anchors, plats, tops) {
  return anchors.map(function (a) {
    if (a.ride !== true) return a;
    var hit = null;
    for (var i = 0; i < plats.length; i++) {
      var r = plats[i];
      if (a.x < r.x0 || a.x > r.x1 || a.z < r.z0 || a.z > r.z1) continue;
      if (!hit || (r.x1 - r.x0) * (r.z1 - r.z0) < (hit.x1 - hit.x0) * (hit.z1 - hit.z0)) hit = r;
    }
    if (!hit) {
      var miss = { x: a.x, z: a.z };
      if (a.surf === "road" || a.surf === "home") miss.surf = a.surf;
      return miss;
    }
    var t = rideTarget(hit, tops);
    var out = { x: t ? t.x : a.x, z: t ? t.z : a.z, ride: hit };
    if (a.surf === "road" || a.surf === "home") out.surf = a.surf;
    return out;
  });
}

// What stands at (x,z) that a truck cannot simply climb — the highest top, and
// whether this exact point sits safely INSIDE one item's top face (so the route
// can be laid on it) rather than clipping its edge or two items at once.
function obstacleAt(rects, tops, x, z) {
  var top = 0,
    hits = 0,
    rect = null;
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (r.y1 <= LEDGE) continue; // a rug: drive over it, it is not an obstacle
    if (x < r.x0 - TRUCK_PAD || x > r.x1 + TRUCK_PAD) continue;
    if (z < r.z0 - TRUCK_PAD || z > r.z1 + TRUCK_PAD) continue;
    hits++;
    if (r.y1 > top) {
      top = r.y1;
      rect = r;
    }
  }
  if (!hits) return null;
  // Can the truck be driven ALONG here? It needs a part to stand on and nothing
  // sticking up through the corridor over it — which is what rules out a chair
  // tucked under the table, or the arm of the sofa. Anything BELOW that surface
  // (the light fitting whose box sits on the floor under the bed) is irrelevant:
  // you are driving over it, not into it.
  var ride = topUnder(tops, x, z);
  if (ride && blockedAbove(tops, x, z, ride)) ride = 0;
  return { top: top, rect: rect, ride: ride };
}

// Is there room for a ramp deck at (x,z) sitting `h` off the floor, ignoring the
// item the ramp is being built against? Height matters: a ramp already 30cm up
// passes clean over the rug bar and the light fitting at the foot of the bed,
// and rejecting those cost the mode most of its ramps.
function clearAt(rects, x, z, h, skip) {
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (r === skip || r.y1 <= LEDGE) continue;
    if (x < r.x0 - TRUCK_PAD || x > r.x1 + TRUCK_PAD) continue;
    if (z < r.z0 - TRUCK_PAD || z > r.z1 + TRUCK_PAD) continue;
    if (r.y1 <= h + STEP_UP) continue; // the deck is over it
    if (r.y0 >= h + CAR_BAND) continue; // ...or under it
    return false;
  }
  return true;
}

// clearLine only searches 52cm sideways, which is not enough to get out of a
// wardrobe the line entered end-on — and in home mode there is no elevated deck
// to fly over it with. Shove every sample inside the item straight out of its
// footprint in one move; clearLine and relaxKinks then smooth the detour.
function pushOffRect(pts, rect, occ) {
  var n = pts.length,
    moved = 0;
  for (var i = 0; i < n; i++) {
    var p = pts[i];
    if (p.x < rect.x0 - HALF || p.x > rect.x1 + HALF) continue;
    if (p.z < rect.z0 - HALF || p.z > rect.z1 + HALF) continue;
    var t = tangent(pts, i),
      nx = -t.z,
      nz = t.x,
      done = false;
    for (var d = 8; d <= 240 && !done; d += 8)
      for (var sg = 1; sg >= -1 && !done; sg -= 2) {
        var x = p.x + nx * d * sg,
          z = p.z + nz * d * sg;
        // The WAY there has to be clear as well, not just the destination: a
        // two-metre sideways shove that only checks where it lands happily puts
        // the sample in the next room, and the lap then drives through a wall.
        if (!pathFree(occ, p.x, p.z, x, z)) continue;
        p.x = x;
        p.z = z;
        moved++;
        done = true;
      }
  }
  return moved;
}

export {
  astar, attachRides, clearAt, clearLine, distToSeg, dualLanes, gridRoute,
  groundUnder, laneWidths, liftOverFurniture, obstacleAt, occupancy,
  pushOffRect, respaceKeep, rideTarget, rideable, seedRideAnchors, snapFree,
  spreadHairpins, stringPull,
};

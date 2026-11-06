/* The RC track's wall clearance, path repair, home runs, features, pads and
   course circuits, split out of js/track.js. It shares the editor's state
   through live imports from ../track.js. */
import { pointInPoly } from "../geometry.js";
import { STEP_UP } from "../road_surface.js";
import { clamp } from "../state.js";
import { buildCollision, buildMesh, buildRoadCandidate, buildWps, repeatLift, turnAt } from "../track/road_mesh.js";
import { astar, canRide, clearAt, clearLine, distToSeg, gridRoute, groundUnder, obstacleAt, occupancy, pushOffRect, rideTarget, snapFree, stringPull } from "../track/routes.js";
import {
  BRIDGE_CLEAR, BRIDGE_MAX, CAR_BAND, CELL, EDGE_N, FLOOR_Y, HALF,
  HALF_ACTIVE, HOME_ROUNDS, JUMP_H, JUMP_LAND, KERB_W, LEDGE, MIN_R_HOME,
  RAMP_GRADE, RAMP_STEEP, RAMP_TURN, RIDE_DROP, RIDE_HALF, RIDE_RUN,
  ROUTE_PAD, RUB, SAMP, SPIRAL_R, THICK, TRUCK_PAD, W, angleAt,
  limitCurvature, relaxKinks, resampleClosed, respace, set_HALF_ACTIVE,
  set_HOME_ACTIVE, tangent,
} from "../track.js";

// clearLine's smoothing rounds every corner, and a corner rounded at a doorway
// cuts through the jamb — which classic mode never noticed, because its deck
// flies through walls and fades them out. Home mode drives the actual floor, so
// prise the two ends of any segment that crosses something apart until it
// doesn't. A few rounds converge: each nudge is small and local.
// The grid is 12cm, so a step can clip the corner of a doorjamb between two
// probes and still read as free. Walls are the one thing that must never be
// approximated in home mode — test them exactly.
function wallClear(occ, x0, z0, x1, z1, margin) {
  var segs = occ.segs || [];
  if (!segs.length) return true;
  var steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i],
      dx = s.bx - s.ax,
      dz = s.bz - s.az,
      l2 = dx * dx + dz * dz || 1,
      r = s.half + (margin == null ? TRUCK_PAD : margin);
    for (var k = 0; k <= steps; k++) {
      var u = k / steps,
        px = x0 + (x1 - x0) * u,
        pz = z0 + (z1 - z0) * u;
      var t = clamp(((px - s.ax) * dx + (pz - s.az) * dz) / l2, 0, 1);
      if (Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t)) < r) return false;
    }
  }
  return true;
}

function repairPath(pts, occ) {
  var n = pts.length,
    out = [],
    fixed = 0;
  for (var i = 0; i < n; i++) {
    var a = pts[i],
      b = pts[(i + 1) % n];
    out.push(a);
    if (pathFree(occ, a.x, a.z, b.x, b.z) && wallClear(occ, a.x, a.z, b.x, b.z)) continue;
    // Route the offending step properly instead of shoving its ends apart: a
    // nudge big enough to clear a doorjamb drags the whole lap out of shape,
    // and the thing that knows the way round is the same A* that laid the line.
    var path = astar(occ, a.x, a.z, b.x, b.z);
    if (!path || !path.length) {
      // both ends sit in the same grid cell, so there is no route to lay: what
      // is wrong is the samples themselves, clipping the jamb they pass between.
      // Put them back in a cell a truck can actually be in.
      snapFree(a, occ);
      snapFree(b, occ);
      continue;
    }
    stringPull(path, occ).forEach(function (p, k, all) {
      if (k < all.length - 1) out.push({ x: p.x, z: p.z });
    });
    fixed++;
  }
  return { pts: out, fixed: fixed };
}

// Is the straight line between two points clear on the occupancy grid? Stepped
// at half a cell so nothing thinner than a wall can slip between the probes.
function pathFree(occ, x0, z0, x1, z1) {
  var steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.5)));
  for (var k = 0; k <= steps; k++) {
    var u = k / steps;
    if (!occ.free(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u)) return false;
  }
  return true;
}

// Group the samples the line cannot drive as-is into runs, each of which becomes
// one feature: a RIDE (the item's own top is the surface, so only the approach
// ramps are built) or a BRIDGE (a deck floating just over something too tall or
// too small to ride).
function homeRuns(pts, rects, tops) {
  var n = pts.length,
    hits = new Array(n),
    i;
  for (i = 0; i < n; i++) hits[i] = obstacleAt(rects, tops, pts[i].x, pts[i].z);
  var start = -1;
  for (i = 0; i < n; i++)
    if (!hits[i]) {
      start = i;
      break;
    }
  if (start < 0) return []; // the whole loop is blocked — nothing local to fix
  var runs = [],
    cur = null;
  for (var k = 0; k < n; k++) {
    var j = (start + k) % n,
      h = hits[j];
    if (!h) {
      if (cur) runs.push(cur);
      cur = null;
      continue;
    }
    if (cur && h.rect === cur.rect) {
      cur.e = start + k;
      cur.ride.push(h.ride);
      cur.top = Math.max(cur.top, h.top);
    } else {
      if (cur) runs.push(cur);
      cur = { s: start + k, e: start + k, rect: h.rect, top: h.top, ride: [h.ride] };
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

// Turn one run into a driveable feature, or report that it cannot be built here.
// The ramps are the expensive part: they need floor that is clear and a line
// that barely bends — a 40% grade laid round a corner folds over itself, which
// is the one thing that reliably drops a truck through the deck.
function planFeature(run, pts, rects, used, tops) {
  var n = pts.length,
    at = function (i) {
      return ((i % n) + n) % n;
    };
  var nRun = run.e - run.s + 1,
    runLen = nRun * SAMP;
  // The lip samples are where the ramp meets the item, so they often sit just
  // off the inset top. Requiring every inner sample to be on the surface is
  // what turned a tabletop tour into a flyover the moment the line clipped a
  // corner — drive ON a rideable model whenever the line spends a real stretch
  // through it.
  var lo = 1e9,
    hi = -1e9,
    rideHits = 0,
    k;
  for (k = 0; k < nRun; k++) {
    if (run.ride[k]) {
      rideHits++;
      lo = Math.min(lo, run.ride[k]);
      hi = Math.max(hi, run.ride[k]);
    }
  }
  var tgt = tops && run.rect ? rideTarget(run.rect, tops) : null;
  var innerRide =
    rideHits * SAMP >= RIDE_RUN && hi - lo <= 2.5 && rideHits >= nRun * 0.3;
  var ride = runLen >= RIDE_RUN && (!!tgt || innerRide);
  var top = ride ? (tgt ? tgt.y : hi) : run.top + BRIDGE_CLEAR;
  if (!ride && run.top > BRIDGE_MAX) return null; // go around it instead
  var edge = ride ? EDGE_N : 0;
  // Does a ramp of `rampN` samples fit, climbing to `top` from sample `foot`
  // towards `head`? The bend limit is weighted by how steep the ramp is THERE:
  // both ends ease out to level, and a corner on a level bit of plank is not a
  // fold. Insisting on straight the whole way rejected every ramp in a real
  // flat and the mode built nothing at all.
  function rampFits(foot, head, rampN) {
    var dir = head > foot ? 1 : -1;
    for (var k = 0; k <= rampN; k++) {
      var i = at(foot + dir * k),
        u = k / rampN,
        h = top * u * u * (3 - 2 * u),
        steep = 6 * u * (1 - u); // 0 at the ends, 1.5 through the middle
      if (used[i]) return false; // another feature owns it
      if (!clearAt(rects, pts[i].x, pts[i].z, h, run.rect)) return false;
      if (steep > 0.35 && turnAt(pts, i) > RAMP_TURN) return false;
    }
    return true;
  }
  // A gentle ramp is the nicer ramp, but a bedroom rarely has 130cm of clear
  // floor in front of the bed. Steepen until it fits rather than give up: a
  // short steep one is a kicker, which for a toy truck is a feature.
  for (var grade = RAMP_GRADE; grade <= RAMP_STEEP + 1e-6; grade += 0.15) {
    var rampN = clamp(Math.ceil(top / (grade * SAMP)), 4, 42),
      i,
      inOk = rampFits(run.s - rampN, run.s, rampN),
      outOk = rampFits(run.e + rampN, run.e, rampN);
    // The ENTRY ramp is not optional: you can always drive off something, but
    // without a way up the surface is simply a wall the lap runs into.
    if (!inOk) continue;
    for (i = run.s; i <= run.e; i++) if (used[at(i)]) return null;
    // One ramp is still a feature: drive up onto the coffee table and off the
    // far end. Only where the drop is small enough to land on, though — a truck
    // that falls off a dining table every lap arrives at the flag in pieces.
    if (!outOk && (top > RIDE_DROP || !ride)) continue;
    return {
      s: run.s,
      e: run.e,
      a0: inOk ? run.s - rampN : run.s,
      b1: outOk ? run.e + rampN : run.e,
      inRamp: inOk,
      outRamp: outOk,
      edge: edge,
      y: top,
      ride: ride,
      rect: run.rect,
      rampN: rampN,
    };
  }
  return null;
}

// Write a planned feature into the elevation profile. Ramp samples get a deck
// (nothing in the room holds them up); the middle of a ride does not, because
// the item's own top face is the road there.
function applyFeature(f, pts, prof, deck, hold, wide, used, env) {
  var n = pts.length,
    at = function (i) {
      return ((i % n) + n) % n;
    };
  function ramp(from, to) {
    // from = floor end, to = top end. The foot height is read ONCE: sampling it
    // per step would step the ramp wherever a rug ends under it.
    var steps = Math.abs(to - from) || 1,
      foot = pts[at(from)],
      g0 = groundUnder(env, foot.x, foot.z) + 0.25;
    for (var k = 0; k <= steps; k++) {
      var i = at(from + (to > from ? k : -k)),
        u = k / steps,
        ease = u * u * (3 - 2 * u);
      prof[i] = g0 + (f.y - g0) * ease;
      deck[i] = 1;
      hold[i] = 1;
      wide[i] = RIDE_HALF;
    }
  }
  if (f.inRamp !== false) ramp(f.a0, f.s + f.edge);
  if (f.outRamp !== false) ramp(f.b1, f.e - f.edge);
  // whatever the ramps did not already cover is the surface itself — and with
  // only one ramp, that runs all the way to the edge you drive off
  var from = f.s + (f.inRamp !== false ? f.edge + 1 : 0),
    to = f.e - (f.outRamp !== false ? f.edge + 1 : 0);
  for (var i = from; i <= to; i++) {
    var j = at(i);
    prof[j] = f.y;
    // A ride is driven ON the item: it needs a surface at the seat's height
    // (the item's own collision box tops out at its backrest) but no road drawn
    // over the thing you climbed up to drive on.
    deck[j] = f.ride ? 0 : 1;
    hold[j] = 1;
    wide[j] = RIDE_HALF;
  }
  for (var u2 = f.a0; u2 <= f.b1; u2++) used[at(u2)] = 1;
}

// Runs of samples whose step still scrapes a wall once the router has done its
// best — a doorway too narrow for the line's turn, or a leg A* could find no way
// round at all.
function wallRuns(pts, occ) {
  var n = pts.length,
    runs = [],
    cur = null;
  for (var i = 0; i < n; i++) {
    var a = pts[i],
      b = pts[(i + 1) % n];
    // Only where a truck genuinely cannot fit, not merely where the line runs
    // close to the skirting: decking every stretch that grazes a wall paved
    // most of a lap that drove perfectly well.
    if (wallClear(occ, a.x, a.z, b.x, b.z, RUB)) {
      if (cur) runs.push(cur);
      cur = null;
      continue;
    }
    if (cur) cur.e = i + 1;
    else cur = { s: i, e: i + 1 };
  }
  if (cur) runs.push(cur);
  return runs;
}

// A jump needs a straight, clear, unused run of floor. Home mode's version is a
// small kicker and a landing ramp with a real hole between them — the one bit of
// "road" that is worth seeing indoors.
function homeJump(pts, prof, deck, hold, wide, used, gapFlag, rects, env) {
  var n = pts.length,
    kickN = 7,
    gapN = 3,
    landN = 7,
    total = kickN + gapN + landN;
  // never across the start/finish line: the grid is laid out on those samples
  for (var s = 12; s < n - total - 6; s++) {
    var ok = true;
    for (var k = 0; k <= total && ok; k++) {
      var j = (s + k) % n,
        p = pts[j];
      if (used[j] || turnAt(pts, j) > RAMP_TURN * 0.8) ok = false;
      else if (!clearAt(rects, p.x, p.z, 0, null)) ok = false;
      else if (groundUnder(env, p.x, p.z) > LEDGE) ok = false;
    }
    if (!ok) continue;
    for (var m = 0; m <= total; m++) {
      var i = (s + m) % n;
      used[i] = 1;
      wide[i] = RIDE_HALF;
      if (m <= kickN) {
        prof[i] = 0.25 + (JUMP_H - 0.25) * (m / kickN);
        deck[i] = hold[i] = 1;
      } else if (m < kickN + gapN) {
        prof[i] = JUMP_H;
        gapFlag[i] = 1;
      } else {
        var u = (m - kickN - gapN) / landN;
        prof[i] = 0.25 + (JUMP_LAND - 0.25) * (1 - u);
        deck[i] = hold[i] = 1;
      }
    }
    return true;
  }
  return false;
}

// Does a candidate helix fit? The check is all-or-nothing on purpose: the kart
// laps the SAME circle at two heights, so one point clipping a wall or a
// wardrobe stops it dead halfway up. A helix that only mostly fits is worse
// than no helix at all — the caller falls back to a straight climb.
function spiralFits(cx, cz, r, rooms, occ) {
  var room = null;
  for (var i = 0; i < rooms.length; i++)
    if (pointInPoly(cx, cz, rooms[i].pts)) room = rooms[i];
  if (!room) return false;
  for (var k = 0; k < 24; k++) {
    var a = (k / 24) * Math.PI * 2;
    var x = cx + Math.sin(a) * r,
      z = cz + Math.cos(a) * r;
    if (!pointInPoly(x, z, room.pts)) return false;
    if (!occ.free(x, z)) return false;
  }
  return true;
}
function pickSpiral(pts, lo, hi, rooms, occ) {
  // widest, roundest helix that fits — settle for a tighter one before giving up
  for (var r = SPIRAL_R; r >= 38; r -= 4) {
    for (var i = lo; i <= hi; i += 2) {
      var t = tangent(pts, i);
      for (var s = -1; s <= 1; s += 2) {
        // centre one radius out to the left (s=1) or right (s=-1) of travel
        var cx = pts[i].x + -t.z * r * s,
          cz = pts[i].z + t.x * r * s;
        if (spiralFits(cx, cz, r, rooms, occ))
          return { i: i, cx: cx, cz: cz, r: r, side: s };
      }
    }
  }
  return null;
}

// Splice detours around anything the line cannot drive through, then iron the
// corners that splicing leaves behind.
function smoothAfterRepair(base, occ) {
  var out = respace(repairPath(base, occ).pts, SAMP);
  relaxKinks(out, occ, 40, false);
  // A* returns cell-to-cell steps and repairPath splices detours in: both leave
  // corners far sharper than anything a truck aims through. Open them to a
  // radius the line can be driven at — gently (MIN_R_HOME), because here the
  // truck is on the real floor and a doorway genuinely does turn tighter than
  // any road. Fewer rounds than the road gets: this runs once per repair, up to
  // four times a build, and with `allowHard` off most of its work is pinned by
  // the jambs anyway — 120 rounds tripled the build for no further gain.
  limitCurvature(out, occ, MIN_R_HOME, HOME_ROUNDS, false);
  out = respace(out, SAMP);
  // FINISH with the repair, never with a smoothing pass: relaxing kinks moves
  // samples, and a sample moved into a doorjamb is the very thing being fixed.
  return respace(repairPath(out, occ).pts, SAMP);
}

// The editor can pin a section to a surface: "pour a road here" or "stay on
// the floor/model". Applied after the automatic ramp/bridge planner so a
// hand-marked stretch wins without fighting the rest of the lap.
function applyUserSurf(C, anchors, halfVal) {
  if (!C || !anchors || anchors.length < 2) return;
  var n = anchors.length,
    has = false;
  for (var i = 0; i < n; i++) {
    if (anchors[i].surf === "road" || anchors[i].surf === "home") {
      has = true;
      break;
    }
  }
  if (!has) return;
  var band = Math.max(60, (halfVal || HALF) * 3);
  for (var k = 0; k < C.length; k++) {
    var p = C[k],
      best = null;
    for (i = 0; i < n; i++) {
      var a = anchors[i],
        b = anchors[(i + 1) % n];
      var dx = b.x - a.x,
        dz = b.z - a.z,
        l2 = dx * dx + dz * dz;
      var t = l2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var d = Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
      if (!best || d < best.d) best = { d: d, kind: a.surf, t: t };
    }
    if (!best || best.d > band) continue;
    if (best.kind !== "road" && best.kind !== "home") continue;
    if (best.kind === "road") {
      p.deck = true;
      p.hold = true;
    } else {
      p.deck = false;
    }
  }
}

// ---- build: home mode -------------------------------------------------------
// The apartment carries the truck. All this has to work out is where it CAN'T:
// every run of the line that meets something a truck cannot climb becomes either
// a ride (up a ramp, along the item's own top, down the other side) or a short
// bridge over it. Anything that can be neither is pushed out of the way and the
// line is cleared again. What is left — most of the lap — gets no geometry at
// all, just paint.
function buildHome(base, env, occ, plats, tops, L, halfVal, extra) {
  var rects = (env && env.rects && env.rects()) || [];
  var feats = { home: true, rides: 0, bridges: 0, jump: false };
  var follow = !!(extra && extra.follow);
  if (extra) {
    feats.routed = extra.routed;
    feats.detours = extra.detours;
    feats.follow = follow;
  }
  // A spliced-in detour arrives as straight legs meeting at square corners, and
  // an unrelaxed 90° corner is a turn no ramp can be built on: smooth after
  // every repair, not just after the first routing pass.
  if (!follow) base = smoothAfterRepair(base, occ);
  var n = base.length,
    best = null;
  // Up to three attempts: each one drops the items that turned out to be
  // unrideable (no room for a ramp, too sharp a bend) back into the grid and
  // re-routes around them, which is exactly what a driver would do. KEEP THE
  // BEST ONE, don't just take the last: re-routing for a sofa in the living
  // room happily throws away a perfectly good ramp onto the bed next door.
  for (var attempt = 0; attempt < (follow ? 1 : 3); attempt++) {
    var prof = new Float64Array(n),
      deck = new Uint8Array(n),
      hold = new Uint8Array(n),
      wide = new Float64Array(n),
      gapFlag = new Uint8Array(n),
      used = new Uint8Array(n);
    for (var i = 0; i < n; i++) prof[i] = groundUnder(env, base[i].x, base[i].z);
    var features = [],
      runs = homeRuns(base, rects, tops),
      rejected = [],
      leftover = [];
    for (var r = 0; r < runs.length; r++) {
      var f = planFeature(runs[r], base, rects, used, tops);
      if (!f) {
        if (rejected.indexOf(runs[r].rect) < 0) rejected.push(runs[r].rect);
        leftover.push(runs[r]);
        continue;
      }
      applyFeature(f, base, prof, deck, hold, wide, used, env);
      features.push(f);
    }
    const through = leftover.length + wallRuns(base, occ).length;
    const quality = courseQuality(base.map((p, i) => ({ x: p.x, z: p.z, y: prof[i], w: wide[i] || halfVal })), env, [], halfVal);
    var rides = 0;
    features.forEach(function (ft) {
      if (ft.ride) rides++;
    });
    // Safety outranks feature count; an extra climb cannot buy an invalid lap.
    var score = (quality.valid && !through ? 1000000 : 0) + rides * 4 + (features.length - rides) - through * 100;
    if (!best || score > best.score)
      best = {
        score: score,
        base: base.map(function (p) {
          return { x: p.x, z: p.z };
        }),
        prof: prof,
        deck: deck,
        hold: hold,
        wide: wide,
        gapFlag: gapFlag,
        used: used,
        features: features,
        through: through,
      };
    if (!rejected.length || attempt === 2) break;
    rejected.forEach(function (rect) {
      occ.block(rect);
      var at = plats.indexOf(rect);
      if (at >= 0) plats.splice(at, 1);
    });
    // Re-route properly rather than shoving the old line sideways: the router
    // now knows those items are solid, so it takes the way round them the same
    // way it took the way round the wardrobe in the first place. (A local shove
    // is the fallback for a route the grid cannot re-plan.)
    // ...and the anchors that pointed at an item we have just written off go
    // with it, or the router walks straight back onto the thing it cannot climb
    if (extra && extra.anchors)
      extra.anchors = extra.anchors.filter(function (a) {
        return !a.ride || plats.indexOf(a.ride) >= 0;
      });
    var again = extra && extra.anchors ? gridRoute(extra.anchors, occ) : null;
    if (again && again.pts.length >= 3) {
      var re = resampleClosed(again.pts, SAMP);
      if (re.length >= 14) base = re;
    } else
      rejected.forEach(function (rect) {
        pushOffRect(base, rect, occ);
      });
    clearLine(base, occ);
    relaxKinks(base, occ, 30, false);
    base = smoothAfterRepair(base, occ);
    n = base.length;
  }
  base = best.base;
  n = base.length;
  var prof = best.prof,
    deck = best.deck,
    hold = best.hold,
    wide = best.wide,
    gapFlag = best.gapFlag,
    features = best.features;
  feats.through = best.through;
  if (env && env.hasJump !== false)
    feats.jump = homeJump(base, prof, deck, hold, wide, best.used, gapFlag, rects, env);
  features.forEach(function (f) {
    if (f.ride) feats.rides++;
    else feats.bridges++;
  });
  // what the lap actually drives ON, for the editor's stats and the tests
  feats.rideList = features
    .filter(function (f) {
      return f.ride;
    })
    .map(function (f) {
      return {
        y: Math.round(f.y),
        len: Math.round((f.e - f.s + 1) * SAMP),
        ramps: (f.inRamp ? 1 : 0) + (f.outRamp ? 1 : 0),
      };
    });

  var C = base.map(function (p, i) {
    return {
      x: p.x,
      z: p.z,
      y: prof[i],
      gap: !!gapFlag[i],
      deck: !!deck[i],
      hold: !!hold[i],
      w: wide[i] || halfVal,
    };
  });
  applyUserSurf(C, extra && extra.userAnchors, halfVal);
  var M = C.length;
  for (var f2 = 0; f2 < M; f2++) {
    var a1 = C[(f2 - 1 + M) % M],
      b1 = C[(f2 + 1) % M];
    var dx = b1.x - a1.x,
      dz = b1.z - a1.z,
      l = Math.hypot(dx, dz) || 1;
    C[f2].ux = dx / l;
    C[f2].uz = dz / l;
  }
  repeatLift(C);
  // No banking indoors. A bare sample IS the floor or the top of a table and
  // cannot be rolled at all, and an access ramp is a 22cm plank a metre long —
  // rolling that while it also climbs and bends is how a deck folds over itself.
  for (var b = 0; b < M; b++) {
    C[b].bank = 0;
    if (!C[b].deck) C[b].lift = 0;
  }
  var col = buildCollision(C);
  var high = 0;
  C.forEach(function (p) {
    high = Math.max(high, p.y);
  });
  return {
    center: C,
    len: L,
    high: high,
    feats: feats,
    group: buildMesh(C, env, col),
    col: col,
    wps: buildWps(C),
    pads: homePads(C, features),
  };
}

// A boost strip at the foot of every access ramp: the run-up is what gets a
// small truck up onto a bed, and it makes the ramp read as something to aim at.
function homePads(C, features) {
  var out = [],
    M = C.length;
  (features || []).forEach(function (f) {
    if (f.inRamp === false || (!f.ride && f.y < 12)) return;
    var i = ((f.a0 - 2) % M + M) % M,
      c = C[i];
    if (c && !c.gap) out.push({ x: c.x, y: c.y, z: c.z, ux: c.ux, uz: c.uz });
  });
  return out;
}

// ---- build ------------------------------------------------------------------
// anchors: [{x,z}] closed loop · rooms: detectRooms() output · env: rc.js probes
// A circuit is accepted only after all shaping and feature placement. These
// checks use world centimetres and the full lane, including the closing leg.
export function courseQuality(C, env, rooms, half = 13) {
  const bad = (reason) => ({ valid: false, reason });
  if (!C || C.length < 14) return bad("short");
  const n = C.length, pref = [0];
  let minRadius = Infinity;
  const walls = env.segs ? env.segs() : [];
  const rects = env.rects ? env.rects() : [];
  for (let i = 0; i < n; i++) {
    const p = C[i], q = C[(i + 1) % n], a = C[(i + n - 1) % n];
    if (![p.x, p.z, p.y == null ? 0 : p.y].every(Number.isFinite)) return bad("invalid");
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    if (len < 0.5 || len > 12) return bad("spacing");
    pref.push(pref[i] + len);
    const angle = angleAt(a, p, q);
    const radius = angle > 1e-5
      ? (len + Math.hypot(p.x - a.x, p.z - a.z)) / (2 * angle) : Infinity;
    minRadius = Math.min(minRadius, radius);
    if (radius < MIN_R_HOME - 0.1) return bad("turn");
    const lane = Math.max(p.w || half, q.w || half);
    // Sample the swept corridor, not just its centre or its endpoints.
    for (let k = 0; k <= 2; k++) {
      const t = k / 2, x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t;
      const y = (p.y || 0) + ((q.y || 0) - (p.y || 0)) * t;
      const margin = lane + len / 4; // covers the space between probes
      if (walls.some(s => distToSeg({ x, z }, { x: s.ax, z: s.az }, { x: s.bx, z: s.bz }) < margin + s.half))
        return bad("wall");
      if (rects.some(r => {
        if (r.y0 >= y + CAR_BAND || r.y1 <= y + STEP_UP) return false;
        if (!(p.deck || q.deck || p.hold || q.hold))
          return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)) < margin;
        // Ramps meet a top at its edge. Inflating by the lane width in the
        // direction of travel falsely rejects that join. Sweep the actual
        // transverse lane instead, with a small sampling margin.
        const nx = -(q.z - p.z) / len, nz = (q.x - p.x) / len;
        for (let side = -lane; side <= lane; side += 1) {
          const px = x + nx * side, pz = z + nz * side;
          if (px >= r.x0 - len / 4 - 0.5 && px <= r.x1 + len / 4 + 0.5 && pz >= r.z0 - len / 4 - 0.5 && pz <= r.z1 + len / 4 + 0.5) return true;
        }
        return false;
      })) return bad("obstacle");
      if (rooms && rooms.some(r => r.ceilH && pointInPoly(x,z,r.pts) && y + 15 > r.ceilH)) return bad("ceiling");
      if ((env.tourDoors || []).some(d => d.height && Math.abs((x-d.x)*d.nx+(z-d.z)*d.nz) < lane+5 &&
        Math.abs((x-d.x)*d.ux+(z-d.z)*d.uz) < d.width/2 && y+10 > d.height)) return bad("door-height");
      if (rooms && rooms.length && !rooms.some(r => pointInPoly(x, z, r.pts) ||
        r.pts.some((v, j) => distToSeg({ x, z }, v, r.pts[(j + 1) % r.pts.length]) <= 6)))
        return bad("outside");
    }
    if (!p.gap && !q.gap && Math.abs((p.y || 0) - (q.y || 0)) > len * RAMP_STEEP)
      return bad("slope");
  }
  const length = pref[n];
  for (let i = 0; i < n; i++) {
    const p = C[i], q = C[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const along = Math.min(pref[j] - pref[i], length - pref[j] + pref[i]);
      if (along < Math.max(70, half * 5)) continue;
      const a = C[j], b = C[(j + 1) % n];
      if (Math.min(p.y || 0, q.y || 0) > Math.max(a.y || 0, b.y || 0) + CAR_BAND + 2 ||
          Math.min(a.y || 0, b.y || 0) > Math.max(p.y || 0, q.y || 0) + CAR_BAND + 2) continue;
      const gap = Math.max(p.w || half, q.w || half) + Math.max(a.w || half, b.w || half) + 2;
      if (Math.max(p.x, q.x) + gap < Math.min(a.x, b.x) || Math.max(a.x, b.x) + gap < Math.min(p.x, q.x) ||
          Math.max(p.z, q.z) + gap < Math.min(a.z, b.z) || Math.max(a.z, b.z) + gap < Math.min(p.z, q.z)) continue;
      const cross = (u, v, w) => (v.x - u.x) * (w.z - u.z) - (v.z - u.z) * (w.x - u.x);
      const crossing = cross(p, q, a) * cross(p, q, b) < 0 && cross(a, b, p) * cross(a, b, q) < 0;
      if (crossing || Math.min(distToSeg(p, a, b), distToSeg(q, a, b), distToSeg(a, p, q), distToSeg(b, p, q)) < gap)
        return bad("overlap");
    }
  }
  return { valid: true, length, minRadius };
}

// Follow a simple cycle of doorways. Tree branches are deliberately omitted:
// going into every room and retracing each doorway is a tour, not a race loop.
export function roomCircuit(rooms, connections) {
  const adj = rooms.map(() => []);
  connections.forEach(c => { adj[c.a].push(c); adj[c.b].push(c); });
  let best = [], budget = 4000;
  const starts = rooms.map((r, i) => i).sort((a, b) => (rooms[b].area || 0) - (rooms[a].area || 0));
  for (const start of starts) {
    const walk = (at, visited, edges) => {
      if (--budget < 0 || edges.length > 12) return;
      for (const edge of adj[at]) {
        if (edges.includes(edge)) continue;
        const to = edge.a === at ? edge.b : edge.a;
        if (to === start && edges.length >= 1) {
          const loop = edges.concat(edge);
          if (loop.length > best.length) best = loop;
        } else if (!visited.has(to)) {
          walk(to, new Set([...visited, to]), edges.concat(edge));
        }
      }
    };
    walk(start, new Set([start]), []);
    if (budget < 0) break;
  }
  // Room centres give a doorway approach room to bend. A two-room circuit
  // needs two distinct doors and four anchors, not a line between two doors.
  if (!best.length) return [];
  let at = best[0].a;
  if (!(best[1].a === best[0].b || best[1].b === best[0].b)) at = best[0].b;
  const out = [];
  for (const edge of best) {
    out.push({ x: rooms[at].cx, z: rooms[at].cz }, { x: edge.x, z: edge.z });
    at = edge.a === at ? edge.b : edge.a;
  }
  return out;
}

function roundedCourse(cx, cz, rx, rz) {
  const r = Math.min(60, rx, rz);
  if (r < MIN_R_HOME + 2) return [];
  const pts = [];
  for (let corner = 0; corner < 4; corner++) {
    const angle = corner * Math.PI / 2;
    const x = cx + (corner === 0 || corner === 3 ? 1 : -1) * (rx - r);
    const z = cz + (corner < 2 ? 1 : -1) * (rz - r);
    const steps = Math.ceil(Math.PI * r / 8);
    for (let k = 0; k <= steps; k++) {
      const a = angle + k / steps * Math.PI / 2;
      pts.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
    }
  }
  return respace(pts, SAMP);
}

// Prefer a valid connected loop; otherwise search smaller circuits in each
// room. Candidate generation never turns a failed path into a wall crossing.
function floorCircuit(anchors, rooms, env, half) {
  let best = null;
  const consider = pts => {
    if (pts.length < 14) return;
    const C = pts.map(p => ({ x: p.x, z: p.z, y: groundUnder(env, p.x, p.z), w: half, deck: false, hold: false }));
    const quality = courseQuality(C, env, rooms, half);
    if (quality.valid && (!best || quality.length > best.quality.length)) best = { C, quality };
  };
  consider(resampleClosed(anchors, SAMP));
  if (best) return best;
  for (const room of rooms) {
    const xs = room.pts.map(p => p.x), zs = room.pts.map(p => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const rx = (x1 - x0) / 2 - half - 14, rz = (z1 - z0) / 2 - half - 14;
    if (rx < 40 || rz < 40) continue;
    for (const sx of [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2]) {
      for (const sz of [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2]) {
        if (best && 4 * (rx * sx + rz * sz) <= best.quality.length) continue;
        for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
          consider(roundedCourse(cx + dx * rx * (1 - sx), cz + dz * rz * (1 - sz), rx * sx, rz * sz));
        }
      }
    }
  }
  return best;
}

function disposeRoad(road) {
  if (!road) return;
  const geometries = new Set(), materials = new Set();
  road.group.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}

// House tours are planned in two stages: a simple horizontal lap that covers
// rooms, then one continuous elevation profile above the objects it visits.
// Nearby objects share connecting road instead of each demanding a floor exit.
function tourCoverage(C, rects, rooms) {
  const items = new Map();
  for (const r of rects) {
    const key = r.item && r.item.id != null ? r.item.id : r;
    if (!items.has(key)) items.set(key, []);
    items.get(key).push(r);
  }
  let visited = 0, over = 0;
  for (const boxes of items.values()) {
    let near = false, above = false;
    for (const r of boxes) for (const p of C) {
      const distance = Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.z0 - p.z, 0, p.z - r.z1));
      if (distance <= 65 && Math.abs(p.y - Math.min(r.y1, Math.max(r.y0, p.y))) <= 65) near = true;
      if (distance === 0 && p.y >= r.y1 && p.y - r.y1 <= 14) above = true;
    }
    if (near) visited++;
    if (above) over++;
  }
  return { visited, total: items.size, over, totalRooms: rooms.length, rooms: rooms.filter(r => C.some(p => pointInPoly(p.x, p.z, r.pts))).length };
}

function tourElevations(base, env, half) {
  const rects = env.rects ? env.rects() : [], n = base.length;
  const arc = [0], required = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = base[i], q = base[(i + 1) % n];
    arc.push(arc[i] + Math.hypot(q.x - p.x, q.z - p.z));
    required[i] = Math.max(FLOOR_Y, groundUnder(env, p.x, p.z));
    for (const r of rects) {
      if (r.y0 >= 70) continue; // suspended objects are passed underneath
      // Include the whole slab and kerbs, with extra runway before its edge.
      const gap = Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.z0 - p.z, 0, p.z - r.z1));
      if (gap < half + KERB_W + 12) required[i] = Math.max(required[i], r.y1 + THICK + 1);
    }
  }
  const length = arc[n], profile = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let y = FLOOR_Y;
    for (let j = 0; j < n; j++) {
      if (required[j] <= FLOOR_Y) continue;
      const d = Math.min(Math.abs(arc[i] - arc[j]), length - Math.abs(arc[i] - arc[j]));
      // Quintic ramps arrive with zero slope and zero vertical acceleration.
      const run = Math.max(50, (required[j] - FLOOR_Y) * 1.875 / 0.55);
      const t = clamp((d - 18) / run, 0, 1);
      const ease = t * t * t * (10 + t * (-15 + 6 * t));
      y = Math.max(y, FLOOR_Y + (required[j] - FLOOR_Y) * (1 - ease));
    }
    profile[i] = y;
  }
  // Round transitions between overlapping ramps. Each height constraint has
  // an 18cm plateau extension, so this 12cm convolution preserves clearance.
  const C = base.map((p, i) => {
    let y = 0;
    for (let k = -2; k <= 2; k++) y += profile[(i + k + n) % n] * (3 - Math.abs(k)) / 9;
    return { x: p.x, z: p.z, y, w: half, deck: true, hold: true, bank: 0, lift: 0 };
  });
  C.forEach((p, i) => { const dir = tangent(C, i); p.ux = dir.x; p.uz = dir.z; });
  return C;
}

function tourBridge(a, b, door, side, half) {
  const normal = { x: b.x - a.x, z: b.z - a.z };
  const dot = normal.x * door.nx + normal.z * door.nz;
  const nx = door.nx * (dot < 0 ? -1 : 1), nz = door.nz * (dot < 0 ? -1 : 1);
  const px = door.x + door.ux * side * (half + 4), pz = door.z + door.uz * side * (half + 4);
  const mid = { x: px, z: pz, ux: nx, uz: nz };
  const out = [];
  function curve(p, q) {
    const length = Math.hypot(q.x - p.x, q.z - p.z), handle = length * 0.55;
    const count = Math.max(4, Math.ceil(length / 3));
    for (let k = 0; k < count; k++) {
      const t = k / count, u = 1 - t;
      out.push({ x: u*u*u*p.x + 3*u*u*t*(p.x+p.ux*handle) + 3*u*t*t*(q.x-q.ux*handle) + t*t*t*q.x,
        z: u*u*u*p.z + 3*u*u*t*(p.z+p.uz*handle) + 3*u*t*t*(q.z-q.uz*handle) + t*t*t*q.z });
    }
  }
  curve(a, mid); curve(mid, b);
  return out;
}

function joinTourLoops(A, B, door, half, valid) {
  if (door.width < 4 * half + 18) return null;
  const nearest = C => C.reduce((best, p, i) => Math.hypot(p.x-door.x,p.z-door.z) < Math.hypot(C[best].x-door.x,C[best].z-door.z) ? i : best, 0);
  for (const cut of [8, 11, 14, 18]) for (const reverse of [false, true]) {
    const bLoop = reverse ? B.slice().reverse() : B;
    const ai = nearest(A), bi = nearest(bLoop);
    const open = (C, at) => {
      const out = [];
      for (let k = cut; k <= C.length-cut; k++) {
        const i = (at+k)%C.length, p = C[i], dir = tangent(C,i);
        out.push({x:p.x,z:p.z,ux:dir.x,uz:dir.z});
      }
      return out;
    };
    if (Math.min(A.length,bLoop.length) <= cut*2+14) continue;
    const a = open(A,ai), b = open(bLoop,bi);
    for (const side of [-1,1]) {
      const joined = respace([...a, ...tourBridge(a[a.length-1],b[0],door,side,half), ...b,
        ...tourBridge(b[b.length-1],a[0],door,-side,half)], SAMP);
      if (valid(joined)) return joined;
    }
  }
  return null;
}

function houseTour(anchors, rooms, env, half) {
  const flatEnv = { ...env, rects: () => [] };
  const valid = pts => courseQuality(pts.map(p => ({...p,y:0})), flatEnv, rooms, half + KERB_W).valid;
  const rects = env.rects ? env.rects() : [];
  let best = null;
  function consider(base) {
    if (!valid(base)) return;
    const C = tourElevations(base, env, half);
    const quality = courseQuality(C, env, rooms, half);
    if (!quality.valid) return;
    const coverage = tourCoverage(C, rects, rooms);
    const averageHeight = C.reduce((s,p) => s+p.y,0)/C.length;
    const score = coverage.rooms * 10000 + coverage.visited * 1000 + coverage.over * 250 + quality.length * 0.15 - averageHeight;
    if (!best || score > best.score) best = { C, quality, coverage, score };
  }
  if (anchors.length > 2) consider(resampleClosed(anchors,SAMP));
  const shapes = [[1,1],[0.9,0.9],[0.8,0.8],[0.7,0.7],[0.6,0.6],[0.55,0.55],
    [0.6,0.85],[0.85,0.6],[0.7,1],[1,0.7],[0.55,0.85],[0.85,0.55]];
  for (const [sx,sz] of shapes) {
    const loops = rooms.map(room => {
      const xs=room.pts.map(p=>p.x), zs=room.pts.map(p=>p.z);
      const x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs);
      const pts=roundedCourse((x0+x1)/2,(z0+z1)/2,((x1-x0)/2-half-22)*sx,((z1-z0)/2-half-22)*sz);
      return pts.length && valid(pts) ? pts : null;
    });
    for (let start=0;start<loops.length;start++) {
      if (!loops[start]) continue;
      let joined=loops[start];
      const visited=new Set([start]);
      for (let pass=0;pass<rooms.length;pass++) {
        let added=false;
        for (const door of env.tourDoors || []) {
          const child=visited.has(door.a) ? door.b : visited.has(door.b) ? door.a : -1;
          if (child<0 || visited.has(child) || !loops[child]) continue;
          const candidate=joinTourLoops(joined,loops[child],door,half,valid);
          if (candidate) { joined=candidate;visited.add(child);added=true; }
        }
        if (!added) break;
      }
      consider(joined);
    }
  }
  if (!best) return null;
  if (env.reverseCourse) best.C.reverse();
  best.C.forEach((p,i)=>{ const dir=tangent(best.C,i);p.ux=dir.x;p.uz=dir.z; });
  const col=buildCollision(best.C);
  return {center:best.C, len:best.quality.length, high:Math.max(...best.C.map(p=>p.y)), quality:best.quality,
    feats:{home:true,automatic:true,tour:true,coverage:best.coverage,rides:best.coverage.over,bridges:1,jump:false,through:0,rideList:[]},
    group:buildMesh(best.C,env,col),col,wps:buildWps(best.C),pads:[]};
}

export function buildRoad(anchors, rooms, env) {
  const automatic = env.homeMode && !env.followAnchors && !anchors.some(p => Number.isFinite(p.y) || p.ride);
  if (!automatic) return buildRoadCandidate(anchors, rooms, env);
  set_HALF_ACTIVE((env.roadWidth || W) / 2);
  set_HOME_ACTIVE(true);
  if (env.homeFeatures) {
    const tour = houseTour(anchors, rooms, env, HALF_ACTIVE);
    if (tour) return tour;
  }
  const floor = floorCircuit(anchors, rooms, env, HALF_ACTIVE);
  if (!floor) return null;
  if (env.reverseCourse) floor.C.reverse();
  if (env.homeFeatures) {
    const featured = furnitureCircuit(floor, rooms, env, HALF_ACTIVE);
    if (featured) return featured;
  }
  return finishFloorCircuit(floor, rooms, env, HALF_ACTIVE);
}

function finishFloorCircuit(floor, rooms, env, half) {
  let C = floor.C;
  let jump = false;
  if (env.hasJump === true) {
    const n = C.length, prof = Float64Array.from(C, p => p.y);
    const deck = new Uint8Array(n), hold = new Uint8Array(n), wide = new Float64Array(n);
    const used = new Uint8Array(n), gap = new Uint8Array(n);
    if (homeJump(C, prof, deck, hold, wide, used, gap, env.rects ? env.rects() : [], env)) {
      const proposed = C.map((p, i) => Object.assign({}, p, { y: prof[i], deck: !!deck[i], hold: !!hold[i], w: wide[i] || half, gap: !!gap[i] }));
      if (courseQuality(proposed, env, rooms, half).valid) { C = proposed; jump = true; }
    }
  }
  C.forEach((p, i) => {
    const dir = tangent(C, i);
    p.ux = dir.x; p.uz = dir.z; p.bank = 0; p.lift = 0;
  });
  const col = buildCollision(C);
  return { center: C, len: floor.quality.length, high: Math.max(...C.map(p => p.y)),
    quality: courseQuality(C, env, rooms, half), feats: { home: true, automatic: true, rides: 0, bridges: 0, jump, through: 0, detours: 0, routed: 0, rideList: [] },
    group: buildMesh(C, env, col), col, wps: buildWps(C), pads: [] };
}

// Bend one clear straight toward a nearby rideable top with a broad, eased
// approach and exit. Feature proposals preserve the loop's ordering and never
// insert an out-and-back visit. At most four proposals, all checked in full.
function furnitureCircuit(floor, rooms, env, half) {
  const C = floor.C, n = C.length, rects = env.rects ? env.rects() : [];
  const tops = env.tops ? env.tops() : rects;
  const candidates = rects.filter(r => canRide(r, tops)).map(r => {
    const target = rideTarget(r, tops);
    if (!target) return null;
    let at = 0, dist = Infinity;
    C.forEach((p, i) => { const d = Math.hypot(p.x - target.x, p.z - target.z); if (d < dist) { at = i; dist = d; } });
    return { target, at, dist, rect: r };
  }).filter(Boolean).sort((a, b) => a.dist - b.dist);
  for (const candidate of candidates.slice(0, 4)) {
    const { target, at, dist } = candidate;
    const flat = Math.max(candidate.rect.x1 - candidate.rect.x0, candidate.rect.z1 - candidate.rect.z0) / 2 + half + 40;
    const reach = flat + Math.max(180, dist * 3, target.y / RAMP_GRADE + 100);
    if (reach * 2 > floor.quality.length * 0.75) continue;
    const dx = target.x - C[at].x, dz = target.z - C[at].z;
    const proposed = C.map((p, i) => {
      const along = Math.min((i - at + n) % n, (at - i + n) % n) * SAMP;
      const weight = along <= flat ? 1 : along < reach ? (1 + Math.cos(Math.PI * (along - flat) / (reach - flat))) / 2 : 0;
      return { x: p.x + dx * weight, z: p.z + dz * weight };
    });
    let base = respace(proposed, SAMP);
    const xs = base.map(p => p.x), zs = base.map(p => p.z);
    const occ = occupancy(env, Math.min(...xs) - ROUTE_PAD, Math.min(...zs) - ROUTE_PAD,
      Math.max(...xs) + ROUTE_PAD, Math.max(...zs) + ROUTE_PAD, 0, [], rooms);
    limitCurvature(base, occ, MIN_R_HOME + 10, HOME_ROUNDS, false);
    base = respace(base, SAMP);
    const road = buildHome(base, env, occ, [], tops, base.length * SAMP, half, { follow: true, detours: 1, routed: 0 });
    const quality = road && courseQuality(road.center, env, rooms, half);
    if (road && road.feats.rides && !road.feats.through && quality.valid) {
      road.quality = quality;
      road.feats.automatic = true;
      road.feats.follow = false;
      road.len = quality.length;
      return road;
    }
    disposeRoad(road);
  }
  return null;
}

export { buildHome, pathFree, pickSpiral };

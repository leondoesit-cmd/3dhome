/* The RC track's road candidates, turns, banking and lifts, road and guide
   meshes, split out of js/track.js. It shares the editor's state through live
   imports from ../track.js. */
import * as THREE from "three";
import { clamp } from "../state.js";
import { buildHome, pickSpiral } from "../track/course_plan.js";
import { attachRides, clearLine, dualLanes, gridRoute, laneWidths, liftOverFurniture, occupancy, respaceKeep, rideable, seedRideAnchors, spreadHairpins } from "../track/routes.js";
import {
  BANK_FADE, BANK_K, BANK_MAX, BANK_RATE, BANK_SMOOTH, COVER_DY, CURVE_ROUNDS,
  CURV_WIN, FLOOR_Y, GUIDE_LIFT, GUIDE_W, HALF, HIGH_FULL, HOME_ACTIVE,
  HUMP_H, HUMP_TURN, HUMP_W, KERB_H, KERB_W, KICK_RISE, KICK_Y, LAND_Y, MIN_R,
  PILLAR_GAP, RAIL_FROM, RAIL_H, REPEAT_LIFT, REPEAT_MAX, ROUTE_PAD, SAMP,
  SOFT_RAIL_H, SPIRAL_STEP, Strip, THICK, W, decked, halfAt, limitCurvature,
  relaxKinks, resampleClosed, respace, roundTurnarounds, set_HALF_ACTIVE,
  set_HOME_ACTIVE, solid, tangent,
} from "../track.js";

function buildRoadCandidate(anchors, rooms, env) {
  var W_VAL = (env && env.roadWidth) || W;
  var HALF_VAL = W_VAL / 2;
  set_HALF_ACTIVE(HALF_VAL);
  var homeMode = !!(env && env.homeMode);
  set_HOME_ACTIVE(homeMode);
  var manualHeight = anchors.some(function (a) {
    return typeof a.y === "number" && isFinite(a.y);
  });
  // The room tour drives every branch twice. Split those repeats into two lanes
  // before anything else touches the line — a hand-drawn route is left alone.
  var laneAnchors =
    homeMode || manualHeight ? anchors : dualLanes(anchors, (env && env.roadWidth ? env.roadWidth : W) / 2);
  var base = resampleClosed(roundTurnarounds(laneAnchors), SAMP);
  if (base.length < 14) return null;
  var bx0 = 1e9,
    bz0 = 1e9,
    bx1 = -1e9,
    bz1 = -1e9;
  base.forEach(function (p) {
    bx0 = Math.min(bx0, p.x);
    bx1 = Math.max(bx1, p.x);
    bz0 = Math.min(bz0, p.z);
    bz1 = Math.max(bz1, p.z);
  });
  var n = base.length,
    L = n * SAMP;

  // ---- feature plan, scaled to how much lap there is to play with ----
  var manualHigh = FLOOR_Y;
  if (manualHeight)
    anchors.forEach(function (a) {
      if (typeof a.y === "number" && isFinite(a.y)) manualHigh = Math.max(manualHigh, a.y);
    });
  var big = L >= 750,
    mid = L >= 430;
  var HIGH = manualHeight
    ? manualHigh
    : (env && env.highElevation != null) ? env.highElevation : (big ? HIGH_FULL : mid ? 62 : 34);
  // Home mode wants the line ON the coffee table and the bed, so the items it is
  // willing to climb are excluded from the grid that pushes the route away.
  var tops = (env && env.tops && env.tops()) || (env && env.rects && env.rects()) || [];
  var plats =
    homeMode && !manualHeight && env.attractFurniture !== false
      ? ((env && env.rects && env.rects()) || []).filter(function (r) {
          return rideable(r, tops);
        })
      : [];
  // home mode routes AROUND things rather than over them, so the grid has to
  // extend past the straight-line hull the anchors describe
  var pad = homeMode ? ROUTE_PAD : 0;
  var occ = occupancy(
    env,
    bx0 - pad,
    bz0 - pad,
    bx1 + pad,
    bz1 + pad,
    HIGH,
    plats,
    homeMode && !manualHeight ? rooms : null,
  );
  var follow = !!(env && env.followAnchors);
  var homeFeats = null;
  if (homeMode && !manualHeight) {
    // A driveable line, not a draped one: A* through the doorways and round the
    // furniture, string-pulled back to long straight runs.
    // NOT two lanes: splitting the tour here was tried and it costs more than
    // the fold it fixes. A* re-merges the legs in the doorway anyway (the
    // shifted anchors move the ends, not the route between them), while the
    // offset ends themselves scrape the jambs — decked pass-throughs went 3 to
    // 6 and corners under a 20cm radius doubled. The automatic planner now
    // avoids repeated branches and validates the completed feature proposal.
    // followAnchors: the live editor has taken the wheel. Keep ride snaps for
    // points the user put ON a model, but do not invent extra visits and do
    // not A* the line away from the handles they are dragging.
    var seeded = seedRideAnchors(
      roundTurnarounds(attachRides(anchors, plats, tops)),
      plats,
      tops,
      !follow && env.attractFurniture !== false,
    );
    if (!follow) {
      var routed = gridRoute(seeded.pts, occ);
      if (routed.failed) return null;
      if (routed.pts.length >= 3) {
        var re = resampleClosed(routed.pts, SAMP);
        if (re.length >= 14) base = re;
      }
      homeFeats = { routed: routed.routed, detours: seeded.added, anchors: seeded.pts, userAnchors: anchors };
    } else {
      var held = resampleClosed(seeded.pts, SAMP);
      if (held.length >= 14) base = held;
      homeFeats = { routed: 0, detours: 0, anchors: seeded.pts, follow: true, userAnchors: anchors };
    }
    n = base.length;
    L = n * SAMP;
  }
  // A user-locked line must stay under the handles; shoving it off furniture
  // is exactly the loss of control the editor is trying to stop.
  if (!(homeMode && follow)) {
    for (var cp = 0; cp < 3; cp++) {
      clearLine(base, occ);
      if (!relaxKinks(base, occ, 40, !homeMode)) break;
    }
    base = respace(base, SAMP);
    n = base.length;
    L = n * SAMP;
  }

  if (homeMode && !manualHeight)
    return buildHome(base, env, occ, plats, tops, L, HALF_VAL, homeFeats);

  // Open every corner the truck could not hold. The lanes were separated back
  // at the anchors, which puts a U-turn at the far end of each branch: this is
  // the pass that gives that U a radius.
  if (!manualHeight) {
    if (spreadHairpins(base, occ, MIN_R)) base = respace(base, SAMP);
    limitCurvature(base, occ, MIN_R, CURVE_ROUNDS, true);
    base = respace(base, SAMP);
    n = base.length;
    L = n * SAMP;
  }

  // A user-drawn height profile is the source of truth. Keep the automatic
  // spiral/jump planner out of the way and ease smoothly between anchor
  // heights so the visible 2D lift handles map directly to the driven surface.
  if (manualHeight) {
    var manualC = base.map(function (p) {
      return {
        x: p.x,
        z: p.z,
        y: clamp(typeof p.y === "number" ? p.y : FLOOR_Y, FLOOR_Y, 180),
        gap: false,
      };
    });
    relaxKinks(manualC, occ, 25);
    var manualM = manualC.length;
    for (var mf = 0; mf < manualM; mf++) {
      var ma = manualC[(mf - 1 + manualM) % manualM],
        mb = manualC[(mf + 1) % manualM];
      var mdx = mb.x - ma.x,
        mdz = mb.z - ma.z,
        ml = Math.hypot(mdx, mdz) || 1;
      manualC[mf].ux = mdx / ml;
      manualC[mf].uz = mdz / ml;
    }
    repeatLift(manualC);
    bankLine(manualC);
    var manualCol = buildCollision(manualC);
    return {
      center: manualC,
      len: L,
      high: manualHigh,
      feats: { manualHeight: true },
      group: buildMesh(manualC, env, manualCol),
      col: manualCol,
      wps: buildWps(manualC),
      pads: padSpots(manualC, -1),
    };
  }

  var landN = Math.max(6, Math.round(64 / SAMP)),
    // The editor's jump switch is a safety control, not just decoration. It
    // must remove the physical hole as well as the visible feature.
    gapN = env && env.hasJump === false ? 0 : big ? 5 : mid ? 4 : 0, // 30 / 24 / no gap
    kickN = gapN ? 4 : 0,
    dropN = Math.round(clamp(L * 0.15, 110, 260) / SAMP);
  var landEnd = n - 2,
    landStart = landEnd - landN,
    gapEnd = landStart,
    gapStart = gapEnd - gapN,
    kickEnd = gapStart,
    kickStart = kickEnd - kickN,
    dropEnd = kickStart,
    dropStart = dropEnd - dropN;
  var si = clamp(Math.round(n * 0.42), 10, dropStart - 14); // spiral entry
  var feats = { spiral: false, jump: gapN > 0 };
  if (dropStart <= si + 8) {
    // too little lap for the whole show — climb, cruise, come back down
    feats.jump = false;
    gapN = kickN = 0;
    landN = Math.max(4, Math.round(n * 0.18));
    landEnd = n - 2;
    landStart = gapEnd = gapStart = kickEnd = kickStart = dropEnd = landEnd - landN;
    dropStart = Math.max(si + 6, dropEnd - Math.round(n * 0.2));
    HIGH = Math.min(HIGH, 46);
  }
  var humpN = Math.round(HUMP_W / SAMP);

  var sp = pickSpiral(
    base,
    Math.max(6, Math.round(n * 0.14)),
    Math.max(8, Math.min(dropStart - 12, Math.round(n * 0.72))),
    rooms,
    occ,
  );
  var climbStart = 0,
    climbEnd = 0;
  if (sp) {
    si = sp.i;
    feats.spiral = true;
  } else {
    // no room in the flat for a helix — climb on a long straight ramp instead,
    // and only as high as that run can be made to gain without going vertical
    climbStart = si;
    climbEnd = Math.min(dropStart - 4, si + Math.round(460 / SAMP));
    var run = Math.max(1, (climbEnd - climbStart) * SAMP);
    HIGH = Math.min(HIGH, run * 0.2);
    feats.climbRun = run;
  }

  // The speed hump needs a straight the tour drives ONCE. On a doubled-back
  // stretch its flank stands proud of the flat pass beside it, and on a bend the
  // deck quads of the ramp overlap each other on the inside of the turn — both
  // leave a lip in the lane that every truck hits every lap. Slide it to the
  // nearest window that is clear on both counts, and if there is none, do
  // without: the hump is a garnish, the lip is a bug.
  var humpBad = doubledBack(base);
  for (var hb = 0; hb < n; hb++)
    if (turnAt(base, hb) > HUMP_TURN) humpBad[hb] = 1;
  // A winding flat may have no straight long enough for the full width: fit a
  // shorter, proportionally lower hump on a shorter straight rather than none.
  var humpFull = humpN,
    humpAt = -1;
  for (var hw = humpFull; hw >= Math.round(humpFull * 0.5); hw--) {
    humpAt = clearWindow(humpBad, Math.round(si * 0.55), hw, si);
    if (humpAt >= 0) {
      humpN = hw;
      break;
    }
  }
  var humpH = (HUMP_H * humpN) / humpFull; // same gradient at any width
  feats.hump = humpAt >= 0 ? Math.round(humpN * SAMP) : false;

  function floorY(i) {
    var d = Math.abs(i - humpAt);
    return (
      FLOOR_Y +
      (humpAt >= 0 && d < humpN
        ? humpH * 0.5 * (1 + Math.cos((Math.PI * d) / humpN))
        : 0)
    );
  }
  // elevation of the loop sample i (null = a gap in the road: the jump)
  function heightAt(i) {
    if (i < si) return floorY(i);
    if (!feats.spiral && i < climbEnd)
      return (
        FLOOR_Y +
        (HIGH - FLOOR_Y) * ((i - climbStart) / Math.max(1, climbEnd - climbStart))
      );
    if (i <= dropStart) return HIGH;
    if (i <= dropEnd)
      return HIGH + (KICK_Y - HIGH) * ((i - dropStart) / Math.max(1, dropEnd - dropStart));
    if (i <= kickEnd)
      return KICK_Y + KICK_RISE * ((i - dropEnd) / Math.max(1, kickEnd - dropEnd));
    if (i < gapEnd) return null; // airborne
    if (i <= landEnd) {
      // With no jump, join the descending deck directly to the landing ramp.
      // Starting that ramp at LAND_Y would otherwise create a 13cm cliff at
      // the exact point where the removed gap used to begin.
      var landTop = gapN ? LAND_Y : KICK_Y;
      return (
        FLOOR_Y +
        (landTop - FLOOR_Y) * (1 - (i - gapEnd) / Math.max(1, landEnd - gapEnd))
      );
    }
    return FLOOR_Y;
  }

  // ---- assemble the 3D centreline, splicing the helix in at `si` ----
  var C = [],
    dropAtC = -1; // where the descent starts, in C's own indices
  function push(x, z, y, gap) {
    C.push({ x: x, y: y, z: z, gap: !!gap });
  }
  for (var i = 0; i < n; i++) {
    // the helix adds a hundred-odd samples in the middle of the loop, so a base
    // index means nothing on the assembled line — the boost pads were being laid
    // that many samples short of the jump they belong to
    if (i === dropStart) dropAtC = C.length;
    // the helix's entry sample belongs to the BOTTOM of the climb — heightAt()
    // already reads as elevated from `si` on, which would leave a 1m cliff
    // between the approach road and the first turn
    var h = i === si && feats.spiral ? floorY(i) : heightAt(i);
    push(base[i].x, base[i].z, h == null ? KICK_Y : h, h == null);
    if (i === si && feats.spiral) {
      // helix: one full circle per turn, exiting on the same heading it entered
      var t = tangent(base, i);
      var vx = base[i].x - sp.cx,
        vz = base[i].z - sp.cz;
      var circ = 2 * Math.PI * sp.r;
      var y0 = floorY(i),
        rise = HIGH - y0;
      var turns = Math.max(1, Math.round(rise / (circ * 0.17)));
      var steps = Math.max(24, Math.round((circ * turns) / SPIRAL_STEP));
      var dir = sp.side; // +1 centre on the left → anticlockwise
      for (var k = 1; k <= steps; k++) {
        var a = dir * 2 * Math.PI * turns * (k / steps);
        var ca = Math.cos(a),
          sa = Math.sin(a);
        push(
          sp.cx + vx * ca - vz * sa,
          sp.cz + vx * sa + vz * ca,
          y0 + rise * (k / steps),
        );
      }
      feats.spiralTurns = turns;
      feats.spiralAt = { x: sp.cx, z: sp.cz, r: sp.r, top: HIGH };
    }
  }

  // The 2D pass above never sees the seams where the helix is spliced in, and
  // those are exactly where the sharpest folds were left. Relax the assembled
  // line too: the helix's own steps turn ~10° each, well under MAX_TURN, so the
  // circle itself is untouched and only the joins get straightened.
  relaxKinks(C, occ, 25);
  limitCurvature(C, occ, MIN_R, CURVE_ROUNDS, true);
  // Both of those move samples, and moved samples bunch — worst of all at a
  // corner too boxed in to open, where the pass pulls the tip in until the
  // samples pile up on it. Redistribute, open what is now openable, and END on a
  // redistribution so nothing the last pass bunched is left in the ribbon.
  function reflow() {
    var even = respaceKeep(C, SAMP);
    if (even.length < 14) return;
    if (dropAtC >= 0) {
      var moved = even.findIndex(function (p) {
        return p.at >= dropAtC;
      });
      dropAtC = moved < 0 ? -1 : moved;
    }
    C = even;
  }
  reflow();
  // A turnaround the 2D pass could not open is still here — and now that the
  // samples are evenly spread it shows up as one clean 170° vertex instead of a
  // clump that hid it. Spread its legs apart on the assembled line, where the
  // helix seams are visible too, then open what that made openable.
  spreadHairpins(C, occ, MIN_R);
  limitCurvature(C, occ, MIN_R, CURVE_ROUNDS, true);
  reflow();

  feats.bridged = liftOverFurniture(C, env, HALF_VAL);

  // ---- frames: tangent, lateral, bank ----
  var M = C.length;
  function frames() {
    for (var f = 0; f < M; f++) {
      var a1 = C[(f - 1 + M) % M],
        b1 = C[(f + 1) % M];
      var dx = b1.x - a1.x,
        dz = b1.z - a1.z,
        l = Math.hypot(dx, dz) || 1;
      C[f].ux = dx / l;
      C[f].uz = dz / l;
    }
  }
  frames();
  // narrow both decks wherever a pair still shares a corridor, then re-frame:
  // the width is read by the mesh, the collision prims and the rails alike
  if (!manualHeight) feats.lanes = laneWidths(C, HALF_VAL);
  repeatLift(C);
  bankLine(C);

  var col = buildCollision(C);
  return {
    center: C,
    len: L,
    high: HIGH,
    feats: feats,
    group: buildMesh(C, env, col),
    col: col,
    wps: buildWps(C),
    pads: padSpots(C, dropAtC),
  };
}

// Heading change (rad) at one sample of a closed 2D line.
function turnAt(pts, i) {
  var n = pts.length;
  var a = pts[(i - 1 + n) % n],
    b = pts[i],
    c = pts[(i + 1) % n];
  var d =
    Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// Which samples have another pass of the tour running within a road width? The
// route walks in and out of every room, so long stretches are driven twice, and
// any feature that changes the deck height has to keep off them.
function doubledBack(pts) {
  var M = pts.length,
    out = new Uint8Array(M);
  for (var i = 0; i < M; i++)
    for (var j = 0; j < M; j++) {
      if (Math.min(Math.abs(i - j), M - Math.abs(i - j)) < 14) continue;
      if (Math.abs(pts[j].x - pts[i].x) > HALF + 2) continue;
      if (Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z) > HALF + 2) continue;
      out[i] = 1;
      break;
    }
  return out;
}

// Nearest index to `want` whose ±`r` window is all clear in `flags`, searching
// outward and never past `limit` (the floor section ends there). -1 = nowhere.
function clearWindow(flags, want, r, limit) {
  var n = flags.length;
  function ok(c) {
    if (c - r < 1 || c + r >= limit) return false;
    for (var k = c - r; k <= c + r; k++) if (flags[(k + n) % n]) return false;
    return true;
  }
  for (var d = 0; d < limit; d++) {
    if (ok(want - d)) return want - d;
    if (ok(want + d)) return want + d;
  }
  return -1;
}

// Roll each sample into its corner. THE GAIN MATTERS: `dh / arc` is curvature
// (rad/cm) = 1/radius, so BANK_K is the roll wanted at a 1cm radius — 10 gives
// 0.1rad (6°) on a 1m bend. The original gain was 100× that, which pinned every
// single sample at ±BANK_MAX: the ribbon became a chain of maximally tilted
// plates, each with its edges 3.8cm above and below its own centreline, and the
// sign flipped 44 times a lap. That is what read as "the road is bumpers between
// the sections it is made from" — where two of those plates met or overlapped
// (the room tour drives many stretches twice) the join was a 2–4cm lip, big
// enough for `car.climb` to launch a truck off it.
function bankLine(C) {
  var M = C.length;
  // Curvature over a WINDOW of samples, never one 6cm segment: at that spacing a
  // single segment's turn is mostly resample noise, and noise here is a deck
  // that rolls left and right at random.
  for (var i = 0; i < M; i++) {
    var a = C[(i - CURV_WIN + M) % M],
      b = C[(i + CURV_WIN) % M];
    var dh = Math.atan2(b.ux, b.uz) - Math.atan2(a.ux, a.uz);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    var arc = 0;
    for (var w = -CURV_WIN; w < CURV_WIN; w++) {
      var s0 = C[(i + w + M) % M],
        s1 = C[(i + w + 1 + M) % M];
      arc += Math.hypot(s1.x - s0.x, s1.z - s0.z);
    }
    C[i].bank = clamp((dh / Math.max(arc, 1)) * BANK_K, -BANK_MAX, BANK_MAX);
  }
  for (var s = 0; s < BANK_SMOOTH; s++)
    for (var k = 0; k < M; k++)
      C[k].bank =
        (C[k].bank + C[(k + 1) % M].bank + C[(k - 1 + M) % M].bank) / 3;
  for (var f = 0; f < M; f++) {
    // A floor-level deck has to stay FLAT. It sits 0.7cm above the floor, so any
    // roll at all buries one edge and stands the other proud: 7.9% of the built
    // surface measured below y=0, half-sunk plates poking out of the floorboards.
    // Fade the bank in only once the deck is clear of the floor...
    C[f].bank *= clamp((C[f].y - FLOOR_Y) / BANK_FADE, 0, 1);
    // ...and flatten it where the road crosses or runs along ANOTHER pass of
    // itself at the same height. Two decks rolled opposite ways meet in a lip
    // the width of both rolls; level, they meet flush. Real interchanges flatten
    // at the crossing for the same reason.
    if (C[f].over) C[f].bank = 0;
  }
  // Blur the fades, so switching the roll off at a crossing is a transition
  // rather than a corner...
  for (var s2 = 0; s2 < 3; s2++)
    for (var k2 = 0; k2 < M; k2++)
      C[k2].bank =
        (C[k2].bank + C[(k2 + 1) % M].bank + C[(k2 - 1 + M) % M].bank) / 3;
  // ...and cap how fast the roll can change along the road, so no quad is left
  // twisted enough to put a ridge across the lane.
  for (var t = 0; t < 8; t++)
    for (var j = 0; j < M; j++) {
      var cur = C[j],
        nxt = C[(j + 1) % M];
      var d = nxt.bank - cur.bank;
      if (Math.abs(d) <= BANK_RATE) continue;
      var fix = (d > 0 ? d - BANK_RATE : d + BANK_RATE) / 2;
      nxt.bank -= fix;
      cur.bank += fix;
    }
}

// Where the tour drives the same stretch twice the two decks are coplanar and
// z-fight. Separate them by a hair — deterministic (same track, same look), and
// small enough that the step where a lifted pass crosses a flat one is far below
// anything a truck can feel. Read through edges()/widen(), so the collision
// triangles keep matching the rendered ones exactly.
function repeatLift(C) {
  var M = C.length;
  for (var i = 0; i < M; i++) {
    var p = C[i],
      depth = 0,
      prev = -99;
    for (var j = 0; j < i; j++) {
      var q = C[j];
      // consecutive samples always overlap; a flyover is not a repeat
      if (Math.min(i - j, M - (i - j)) < 14) continue;
      if (Math.abs(q.y - p.y) > 3) continue;
      if (Math.hypot(q.x - p.x, q.z - p.z) > HALF) continue;
      if (j - prev > 1) depth++; // one step per distinct pass, not per sample
      prev = j;
      // `over` is symmetric — the FIRST pass has to know it is overlapped too,
      // because bankLine levels both sides of a crossing, not just the later one.
      // Never break out of this scan early: an unvisited pair is an unmarked
      // sample, and the flag has to see every pass, not just the first few.
      q.over = p.over = true;
    }
    p.lift = Math.min(depth, REPEAT_MAX) * REPEAT_LIFT;
  }
}

// left / right deck edge of sample p, rolled by its bank angle
function edges(p) {
  var lx = -p.uz,
    lz = p.ux,
    h = halfAt(p);
  var dy = Math.sin(p.bank || 0) * h,
    y = p.y + (p.lift || 0);
  return [
    [p.x + lx * h, y + dy, p.z + lz * h],
    [p.x - lx * h, y - dy, p.z - lz * h],
  ];
}
function widen(p, w) {
  var lx = -p.uz,
    lz = p.ux;
  var dy = Math.sin(p.bank || 0) * w,
    y = p.y + (p.lift || 0);
  return [
    [p.x + lx * w, y + dy, p.z + lz * w],
    [p.x - lx * w, y - dy, p.z - lz * w],
  ];
}
function drop(v, d) {
  return [v[0], v[1] - d, v[2]];
}
function lift(v, d) {
  return [v[0], v[1] + d, v[2]];
}

// Is (x,z,y) already covered by a DIFFERENT pass of the road? Used to drop the
// rail between two overlapping passes — a wall down the middle of the road is a
// kart trap. `skip` ignores segments near this one in the centreline: on a tight
// bend a segment's own outer edge falls inside its neighbours a few steps along,
// and suppressing there would leave the outside of every hairpin unwalled.
function coveredAt(prims, x, z, y, skip) {
  for (var j = 0; j < prims.length; j++) {
    var r = prims[j];
    if (Math.abs(r.i - skip) < 16) continue;
    var qx = x - r.ax,
      qz = z - r.az;
    var tt = qx * r.ux + qz * r.uz;
    if (tt < 0 || tt > r.len) continue;
    if (Math.abs(qx * -r.uz + qz * r.ux) > r.half - 1) continue;
    // Only a lane the kart could STEP across counts as covering this edge.
    // At 9cm this suppressed the wall between a flat pass and one climbing the
    // hump beside it — and a kart that wandered over the missing wall fell off
    // the raised one onto the floor. That was the last repeatable way off the
    // road: same corner, every lap, both bots.
    if (Math.abs(r.y0 + ((r.y1 - r.y0) * tt) / r.len - y) < COVER_DY) return true;
  }
  return false;
}

function buildMesh(C, env, colInfo) {
  var M = C.length;
  var grp = new THREE.Group();
  grp.userData.rc = true;
  var deck = new Strip(),
    kerb = new Strip(),
    rail = new Strip(),
    dash = new Strip();
  // Every adjacent deck quad uses the same endpoint normal, including the
  // closing seam. Skirts keep sharp normals; the running surface is smooth.
  const topNormals = C.map((p, i) => {
    const a = C[(i + M - 1) % M], b = C[(i + 1) % M], e = edges(p);
    const along = new THREE.Vector3(b.x-a.x, b.y-a.y, b.z-a.z);
    const across = new THREE.Vector3(e[1][0]-e[0][0], e[1][1]-e[0][1], e[1][2]-e[0][2]);
    return along.cross(across).normalize();
  });
  var RED = [0.85, 0.16, 0.13],
    WHITE = [0.93, 0.93, 0.95],
    RAILA = [0.15, 0.75, 0.95],
    RAILB = [0.98, 0.98, 1.0];
  for (var i = 0; i < M; i++) {
    var p = C[i],
      q = C[(i + 1) % M];
    // the jump: no road across the void — and in home mode, no road at all
    // wherever the apartment itself is the running surface
    if (!decked(p) || !decked(q)) continue;
    var pe = edges(p),
      qe = edges(q);
    deck.quad(pe[0], qe[0], qe[1], pe[1], null, [topNormals[i], topNormals[(i+1)%M], topNormals[(i+1)%M], topNormals[i]]); // running surface
    var pb0 = drop(pe[0], THICK),
      pb1 = drop(pe[1], THICK),
      qb0 = drop(qe[0], THICK),
      qb1 = drop(qe[1], THICK);
    deck.quad(pb1, qb1, qb0, pb0); // underside
    deck.quad(pe[0], pb0, qb0, qe[0]); // skirts
    deck.quad(qe[1], qb1, pb1, pe[1]);
    // kerbs: alternating red/white blocks along both edges
    var col = (i >> 1) % 2 ? RED : WHITE;
    var po = widen(p, halfAt(p) + KERB_W),
      qo = widen(q, halfAt(q) + KERB_W);
    [0, 1].forEach(function (sd) {
      var a = lift(pe[sd], KERB_H),
        b = lift(qe[sd], KERB_H),
        c = lift(qo[sd], KERB_H * 0.6),
        d = lift(po[sd], KERB_H * 0.6);
      if (sd === 0) kerb.quad(a, b, c, d, col);
      else kerb.quad(d, c, b, a, col);
      kerb.quad(
        sd ? drop(d, KERB_H * 0.6 + THICK) : d,
        sd ? drop(c, KERB_H * 0.6 + THICK) : c,
        sd ? c : drop(c, KERB_H * 0.6 + THICK),
        sd ? d : drop(d, KERB_H * 0.6 + THICK),
        col,
      );
    });
    // centre dashes
    if ((i >> 1) % 3 === 0) {
      var pc = widen(p, 1.1),
        qc = widen(q, 1.1);
      dash.quad(lift(pc[0], 0.15), lift(qc[0], 0.15), lift(qc[1], 0.15), lift(pc[1], 0.15));
    }
    // side walls wherever the deck is off the floor — Rainbow-Road style.
    // This starts at the very bottom of the spiral on purpose: the tightest
    // radius on the circuit is its first turn, and without a wall there a kart
    // that understeers drops straight off and strands itself underneath.
    // Same `coveredAt` gate buildCollision uses: where a second pass of the
    // road runs alongside there is no collision rail, so drawing one there
    // paints a wall the kart drives straight through. Mesh and collision have
    // to agree or the road lies about where you can go.
    if (p.y > RAIL_FROM && q.y > RAIL_FROM) {
      var rc = (i >> 2) % 2 ? RAILA : RAILB;
      [0, 1].forEach(function (sd) {
        var a2 = lift(pe[sd], KERB_H),
          b2 = lift(qe[sd], KERB_H);
        if (
          colInfo &&
          coveredAt(colInfo.road, (a2[0] + b2[0]) / 2, (a2[2] + b2[2]) / 2, (p.y + (p.lift || 0) + q.y + (q.lift || 0)) / 2, i)
        )
          return;
        var a3 = lift(a2, RAIL_H),
          b3 = lift(b2, RAIL_H);
        if (sd === 0) rail.quad(a2, b2, b3, a3, rc);
        else rail.quad(a3, b3, b2, a2, rc);
      });
    }
  }
  var roadCol = 0x3c4149, roadRough = 0.92, roadMetal = 0.04, roadEmiss = 0x000000;
  if (env && env.theme === "wood") {
    roadCol = 0x7c4e29; roadRough = 0.75; roadMetal = 0.02;
  } else if (env && env.theme === "neon") {
    roadCol = 0x0d0926; roadRough = 0.2; roadMetal = 0.8; roadEmiss = 0x3b0a70;
  } else if (env && env.theme === "gold") {
    roadCol = 0xd4af37; roadRough = 0.25; roadMetal = 0.85; roadEmiss = 0x332500;
  }
  var roadMat = new THREE.MeshStandardMaterial({
    color: roadCol,
    roughness: roadRough,
    metalness: roadMetal,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
  });
  if (roadEmiss) roadMat.emissive = new THREE.Color(roadEmiss);
  var road = deck.mesh(roadMat);
  if (road) { road.name = "rcRoadDeck"; grp.add(road); }
  var km = kerb.mesh(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    }),
  );
  if (km) grp.add(km);
  var rm = rail.mesh(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x0a2c38,
      transparent: true,
      // 80% see-through: the rail marks the edge without hiding the road,
      // the next corner or a kart running alongside behind it
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  if (rm) grp.add(rm);
  var dm = dash.mesh(
    new THREE.MeshBasicMaterial({
      color: 0xf0e9d8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -12,
    }),
  );
  if (dm) grp.add(dm);
  var guide = guideMesh(C, env);
  if (guide) grp.add(guide);
  // pillars under the elevated stretches
  var pillarGeo = new THREE.CylinderGeometry(2.6, 3.4, 1, 8);
  var pillarMat = new THREE.MeshStandardMaterial({
    color: 0x6b7280,
    roughness: 0.85,
  });
  var since = 1e9;
  for (var k = 0; k < M; k++) {
    var c = C[k];
    since += SAMP;
    if (!decked(c) || c.y < 18 || since < PILLAR_GAP) continue;
    var g = env ? env.groundAt(c.x, c.z, 0, 2.2) : 0;
    var h = c.y - THICK - g;
    if (h < 8) continue;
    var m = new THREE.Mesh(pillarGeo, pillarMat);
    m.scale.set(1, h, 1);
    m.position.set(c.x, g + h / 2, c.z);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    since = 0;
  }
  return grp;
}

// The racing line, painted on the world instead of poured as a road. Home mode
// deletes the deck from every stretch the apartment can carry, so this is all
// that is left to show where the lap goes: a dashed line with an arrow every
// half metre, laid on whatever surface is actually under the sample — floor,
// rug or the top of the table the route climbs onto.
function guideMesh(C, env) {
  if (!env || !env.homeMode) return null;
  var M = C.length,
    line = new Strip(),
    ranges = [],
    AMBER = [1.0, 0.76, 0.2],
    CYAN = [0.35, 0.9, 1.0];
  function surf(p) {
    var g = env.groundAt ? env.groundAt(p.x, p.z, p.y + 1.5, 2.2) : 0;
    return (decked(p) ? p.y + (p.lift || 0) : Math.max(g, p.y)) + GUIDE_LIFT;
  }
  for (var i = 0; i < M; i++) {
    var p = C[i],
      q = C[(i + 1) % M];
    if (p.gap || q.gap) continue;
    var firstVertex = line.n;
    var py = surf(p),
      qy = surf(q);
    // A continuous line and two lane edges make ramps and floor agree.
    {
      var pl = -p.uz * GUIDE_W,
        pk = p.ux * GUIDE_W,
        ql = -q.uz * GUIDE_W,
        qk = q.ux * GUIDE_W;
      line.quad(
        [p.x + pl, py, p.z + pk],
        [q.x + ql, qy, q.z + qk],
        [q.x - ql, qy, q.z - qk],
        [p.x - pl, py, p.z - pk],
        AMBER,
      );
    }
    for (var side of [-1, 1]) {
      var edgeP = halfAt(p) * side, edgeQ = halfAt(q) * side;
      line.quad(
        [p.x - p.uz * (edgeP - 0.4), py, p.z + p.ux * (edgeP - 0.4)],
        [q.x - q.uz * (edgeQ - 0.4), qy, q.z + q.ux * (edgeQ - 0.4)],
        [q.x - q.uz * (edgeQ + 0.4), qy, q.z + q.ux * (edgeQ + 0.4)],
        [p.x - p.uz * (edgeP + 0.4), py, p.z + p.ux * (edgeP + 0.4)], [0.9, 0.95, 1],
      );
    }
    // arrowhead: which way round the lap you are meant to be going
    if (i % 8 === 0) {
      var nx = -p.uz,
        nz = p.ux,
        tipx = p.x + p.ux * 4.2,
        tipz = p.z + p.uz * 4.2;
      var grade = (qy - py) / (Math.hypot(q.x - p.x, q.z - p.z) || 1);
      line.quad(
        [tipx, py + grade * 4.2, tipz],
        [p.x - p.ux * 1.2 + nx * 2.8, py - grade * 1.2, p.z - p.uz * 1.2 + nz * 2.8],
        [p.x - p.ux * 1.2 - nx * 2.8, py - grade * 1.2, p.z - p.uz * 1.2 - nz * 2.8],
        [tipx, py + grade * 4.2, tipz],
        CYAN,
      );
    }
    ranges.push({ i: i, start: firstVertex, count: line.n - firstVertex });
  }
  var m = line.mesh(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -12,
    }),
  );
  // paint, not geometry: a line that casts a shadow reads as a kerb
  if (m) {
    m.castShadow = m.receiveShadow = false;
    m.name = "rcCourseGuide";
    m.userData.courseRanges = ranges;
    m.userData.baseColors = m.geometry.getAttribute("color").array.slice();
  }
  return m;
}

function surfaceTri(a, b, c) {
  return {
    ax: a[0], ay: a[1], az: a[2],
    bx: b[0], by: b[1], bz: b[2],
    cx: c[0], cy: c[1], cz: c[2],
    minx: Math.min(a[0], b[0], c[0]),
    maxx: Math.max(a[0], b[0], c[0]),
    minz: Math.min(a[2], b[2], c[2]),
    maxz: Math.max(a[2], b[2], c[2]),
  };
}

// Keep the broad centreline rectangles for rail-overlap tests, but use the
// exact rendered top triangles for vertical physics. Adjacent quads share the
// same vertices, so there are no synthetic discs, overlaps or height steps at
// their joins.
function buildCollision(C) {
  var M = C.length,
    road = [],
    surface = [],
    rails = [],
    gaps = [];
  function seg(k) {
    // does a road segment start at centreline sample k?
    return solid(C[(k + M) % M]) && solid(C[(k + 1 + M) % M]);
  }
  for (var i = 0; i < M; i++) {
    var p = C[i],
      q = C[(i + 1) % M];
    if (!solid(p) || !solid(q)) continue;
    var dx = q.x - p.x,
      dz = q.z - p.z,
      len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    var pe = edges(p),
      qe = edges(q);
    // Same split/order as Strip.quad(pe[0], qe[0], qe[1], pe[1]).
    surface.push(surfaceTri(pe[0], qe[0], qe[1]));
    surface.push(surfaceTri(pe[0], qe[1], pe[1]));
    road.push({
      i: i,
      ax: p.x,
      az: p.z,
      ux: dx / len,
      uz: dz / len,
      len: len,
      // a touch wider than the deck looks, so the very rim still holds a truck
      half: halfAt(p) + 0.8,
      // overlap into the neighbouring segments to close the wedge every bend
      // opens between two straight rectangles — but never across a jump
      e0: seg(i - 1) ? halfAt(p) : 0,
      e1: seg(i + 1) ? halfAt(p) : 0,
      y0: p.y + (p.lift || 0),
      y1: q.y + (q.lift || 0),
    });
  }
  // Record only the deliberate ramp-jump gap. Normal joins need no filler:
  // their collision triangles are the rendered triangles and share an edge.
  for (var m = 0; m < M; m++) {
    if (C[m].gap) {
      // Explicit jump corridor. rc.js uses this to distinguish the designed
      // airborne gap from an accidental hole at a bend or rail opening.
      gaps.push({ x: C[m].x, z: C[m].z, y: C[m].y, r: HALF + 6 });
      continue;
    }
  }
  // Walls go on every segment — but never where a second pass of the road runs
  // alongside, or the rail ends up standing in the middle of the other lane.
  // Elevated decks get a hard wall (falling off there is a long drop). Floor
  // level gets a `soft` one: collision-only, no mesh, and rc.js ignores it
  // outside a race, so free roam can still leave the ribbon and drive the rooms
  // while a race keeps you on the circuit instead of loose in the apartment.
  for (var k = 0; k < M; k++) {
    var a = C[k],
      b = C[(k + 1) % M];
    if (!solid(a) || !solid(b)) continue;
    // heights match the prims: the repeat lift is on the deck, so the rail band
    // and coveredAt's lane test have to read it too
    var ay = a.y + (a.lift || 0),
      by = b.y + (b.lift || 0);
    // A rail on a stretch with no visible deck has to be soft: there is no mesh
    // to explain it, so it may only pen a kart in during a race (and with the
    // guard-walls switch on), never while you are exploring the sofa.
    var soft = ay <= RAIL_FROM || by <= RAIL_FROM || !decked(a) || !decked(b);
    // ...and home mode drops those entirely. A continuous circuit can be lined
    // with invisible kerbs because you are always inside it; here the deck comes
    // in short isolated pieces, and fencing each one turns it into a box that
    // can only be entered end-on. Bots aiming at a gate inside a soft-railed
    // pass-through simply ground themselves against its side for the whole race.
    if (soft && HOME_ACTIVE) continue;
    var lx = -a.uz,
      lz = a.ux;
    for (var sd = 1; sd >= -1; sd -= 2) {
      var ax = a.x + lx * halfAt(a) * sd,
        az = a.z + lz * halfAt(a) * sd,
        bx = b.x + -b.uz * halfAt(b) * sd,
        bz = b.z + b.ux * halfAt(b) * sd;
      if (coveredAt(road, (ax + bx) / 2, (az + bz) / 2, (ay + by) / 2, k)) continue;
      rails.push({
        ax: ax,
        az: az,
        bx: bx,
        bz: bz,
        half: 0.8,
        soft: soft,
        y0: Math.min(ay, by) - 1,
        y1: Math.max(ay, by) + (soft ? SOFT_RAIL_H : RAIL_H),
      });
    }
  }
  return { road: road, surface: surface, rails: rails, gaps: gaps };
}

// Gates every ~110cm with smoothing points between them (rc.js and kart.js both
// read `minor`), never inside the jump gap. Spacing tightens with curvature:
// both the player's line and the AI's steering target run gate-to-gate in
// straight hops, and a 40cm helix sampled every 40cm chords clean off the deck.
function buildWps(C) {
  var M = C.length,
    wps = [],
    majorEvery = Math.max(9, Math.round(110 / SAMP)),
    minorEvery = Math.max(3, Math.round(34 / SAMP));
  var sinceMinor = 1e9,
    sinceMajor = 1e9,
    turn = 0;
  for (var i = 0; i < M; i++) {
    var c = C[i];
    sinceMinor++;
    sinceMajor++;
    if (i) {
      var d = Math.atan2(c.ux, c.uz) - Math.atan2(C[i - 1].ux, C[i - 1].uz);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turn += Math.abs(d);
    }
    if (c.gap) continue;
    var major = sinceMajor >= majorEvery;
    if (!major && sinceMinor < minorEvery && turn < 0.34) continue;
    wps.push({
      x: c.x,
      y: c.y,
      z: c.z,
      ux: c.ux,
      uz: c.uz,
      bank: c.bank,
      minor: !major,
    });
    sinceMinor = 0;
    turn = 0;
    if (major) sinceMajor = 0;
  }
  if (wps.length) wps[0].minor = false;
  return wps;
}

// boost strips: on the run-in to the jump, and out of the landing
function padSpots(C, dropStart) {
  var out = [],
    M = C.length;
  function at(i) {
    var c = C[(i + M) % M];
    if (!c || c.gap) return;
    out.push({ x: c.x, y: c.y, z: c.z, ux: c.ux, uz: c.uz });
  }
  if (dropStart > 0) {
    at(dropStart + 4);
    at(dropStart + 10);
  }
  return out;
}

export {
  buildCollision, buildMesh, buildRoadCandidate, buildWps, repeatLift, turnAt,
};

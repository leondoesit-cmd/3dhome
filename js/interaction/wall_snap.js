/* The planner's wall snapping, joins and connection picking, split out of
   js/interaction.js. It shares the editor's state through live imports from
   ../interaction.js. */
import { armAngles, openingAtWallPosition, usedNodes, wallById, wallGeom, wallPointAt, wallProject } from "../geometry.js";
import { nearRecs, tolCm } from "../interaction/hit_test.js";
import { angDelta } from "../interaction/room_tools.js";
import { inputScale } from "../planner_input.js";
import { S, SNAP_GRID, clamp, fin } from "../state.js";
import { applyDrawDirLock, drawFaceBack, extendToHit } from "../wall_draw.js";
import {
  FOLD_TOL, INC_TOL, PICK_SLOP, SNAP_BONUS, SNAP_GATE, WALL_TOL,
} from "../interaction.js";

/* Every tolerance in snapPoint() goes through here, so the one strength
   control in the status bar moves them together and none can be left behind.
   Clamped because a strength of 0 would silently disable snapping while the
   chips still read "on", and anything past 2 makes the whole plan magnetic. */
function snapMul() {
  var m = S.snapStrength;
  return fin(m) ? clamp(m, 0.25, 2) : 1;
}
/* Wall-to-wall connections get a wider capture band than ordinary object
   snaps. At overview zoom a 10 cm wall face plus furniture drawn over it can
   sit well beyond the generic 14 px cursor radius, but ending a wall there is
   still unambiguously a connection. OSNAP remains the explicit off switch for
   intentional near-wall gaps. */
function wallJoinTolerance() {
  if (S.osnap === false) return 0;
  /* 30 cm is also the validator's definition of an endpoint "near another
     wall". If the plan would otherwise show the red near-wall open-end cross,
     placement resolves the connection instead. */
  return Math.min(50, Math.max(30, tolCm(28) * snapMul()));
}
// is this individual snap enabled? OSNAP is still the master switch for the
// two that pick geometry (corner / on-wall); the angular ones answer only to
// their own kind, exactly like a real CAD's separate OSNAP and POLAR.
function snapOn(kind) {
  var k = S.snapKinds;
  return !k || k[kind] !== false;
}

function wallLineIntersection(a, b) {
  var ga = wallGeom(a), gb = wallGeom(b),
    den = ga.dx * gb.dz - ga.dz * gb.dx;
  if (!fin(den) || Math.abs(den) < 1e-8) return null;
  var qx = gb.a.x - ga.a.x, qz = gb.a.z - ga.a.z,
    ta = (qx * gb.dz - qz * gb.dx) / den,
    tb = (qx * ga.dz - qz * ga.dx) / den;
  return {
    x: ga.a.x + ga.dx * ta, z: ga.a.z + ga.dz * ta,
    ta: ta, tb: tb, ga: ga, gb: gb,
  };
}

function kindGate(kind) {
  return SNAP_GATE[kind] || kind;
}

/* Is this wall near enough to the cursor to be worth intersecting? The
   intersection pass is the only O(walls²) work in the hot path, and it ran in
   full on every mouse move. A padded bounding-box test in front of it costs
   nothing and drops almost every pair on a large plan. */
function nearCursor(w, px, pz, pad) {
  var A = S.nodes[w.a], B = S.nodes[w.b];
  if (!A || !B) return false;
  return (
    px >= Math.min(A.x, B.x) - pad && px <= Math.max(A.x, B.x) + pad &&
    pz >= Math.min(A.z, B.z) - pad && pz <= Math.max(A.z, B.z) + pad
  );
}

/* When the user has demanded ONE kind for this click (see snapOverride), every
   other candidate is discarded rather than merely outranked. */
function overrideKind() {
  return S.snapOnly || null;
}

/* Exported for tests/snap_broad_phase.test.mjs, which pins the claim the whole
   broad phase rests on: widen every query to the entire model and the winner
   must not move. Nothing in the app imports it — the resolver is used by this
   file's own drag and draw paths. */
export function snapPoint(px, pz, fromIdx) {
  var origins =
    fromIdx == null ? [] : Array.isArray(fromIdx) ? fromIdx.slice() : [fromIdx];
  var mul = snapMul();
  var thr = (14 * mul) / inputScale();
  if (!isFinite(thr) || thr <= 0) thr = 14 * mul; // degenerate transform: fixed cm
  S.snapGuides = []; // recomputed below; stale guides must never linger
  S.snapInfo = null; // ditto — the HUD must never show the previous latch

  /* Snap radii are authored for a mouse and deliberately NOT widened by
     PICK_SLOP (see the note at the top of this file): they decide what the
     design becomes, not what you hit. Closing the loop you are drawing is the
     exception, and for the same reason wallJoinTolerance() is one — it is a
     CONNECTION, not a measurement. Nothing else can be within a fingertip of
     your own starting corner, so missing it by 4px cannot mean "put the corner
     here instead"; it means the finger is fatter than the mouse this radius
     was written for. Missing it left a loose stub and an unclosed room, which
     is the single most expensive miss in the whole touch drawing flow. */
  var REACH = { close: thr * PICK_SLOP };

  // Object snap off: corners and on-wall points stop attracting the cursor.
  // Angle + grid still apply below, exactly like OSNAP in a real CAD.
  var osnap = S.osnap !== false;
  var only = overrideKind();
  var cands = [];
  /* `kind` is the snap's name, `hit` its world point, `extra` whatever the
     caller needs to commit it (a node index, a wall + distance along it).
     Candidates outside the tolerance are dropped here so the ranking below
     only ever sees things the user could plausibly have been aiming at.
     `aim` is where the cursor is MEASURED from when that differs from where the
     point lands — a face snap is aimed at the face but commits to the
     centreline behind it (see the jamb block below). */
  function offer(kind, x, z, extra, aim) {
    if (!osnap) return;
    if (only ? only !== kind : !snapOn(kindGate(kind))) return;
    var ax = aim ? aim.x : x,
      az = aim ? aim.z : z;
    var d = Math.hypot(px - ax, pz - az);
    if (d > (REACH[kind] || thr)) return;
    cands.push({
      kind: kind, x: x, z: z, d: d,
      score: d * (inputScale() > 0 ? inputScale() : 1) - (SNAP_BONUS[kind] || 0),
      extra: extra || {},
    });
  }

  /* The broad phase. Everything below asks the shared grid for the handful of
     records near the cursor instead of walking S — see the "shared broad phase"
     block near the top of this file for why each radius is the one it is, and
     why nothing the exact tests below would have accepted can be missing from
     these lists. `wide` is the reach the two construction-geometry passes need:
     an intersection or an extension is offered from a wall that may be a whole
     extWindow away from the point it produces. */
  var extWindow = Math.max(100, thr * 8);
  var nearNodes = nearRecs(px, pz, thr, "node"),
    nearWalls = nearRecs(px, pz, thr, "wall"),
    wideWalls = nearRecs(px, pz, thr + extWindow, "wall"),
    nearItems = nearRecs(px, pz, thr, "item"),
    nearMarks = nearRecs(px, pz, thr, "marker"),
    nearOpens = nearRecs(px, pz, thr, "opening");

  // 1. existing corners
  nearNodes.forEach(function (rec) {
    if (origins.indexOf(rec.id) !== -1) return;
    var n = S.nodes[rec.id];
    if (n) offer("corner", n.x, n.z, { node: rec.id });
  });
  if (S.tool === "wall" && S.drawing && S.drawStart != null &&
      (S.drawWalls || []).length >= 2 && origins.indexOf(S.drawStart) === -1) {
    var st = S.nodes[S.drawStart];
    if (st) offer("close", st.x, st.z, { node: S.drawStart });
  }

  /* 2. placeholder points. These were measurable but not aimable: a point
     could anchor a dimension while being impossible to actually draw a wall
     onto, which defeats most of the reason to place one. They are datums, so
     they rank alongside corners. */
  nearMarks.forEach(function (rec) {
    var m = rec.ref;
    if (!m || !fin(m.x) || !fin(m.z)) return;
    offer("marker", m.x, m.z, {});
  });

  // The two calibration picks are real datums on the sheet. Offering them to
  // the normal OSNAP resolver makes the first traced wall land exactly on the
  // measured endpoints while every existing angle/alignment guide remains in
  // force for the rest of the run.
  if (S.blueprintTrace && S.blueprintTrace.visible !== false)
    (S.blueprintTrace.guidePoints || []).forEach(function (p) {
      if (p && fin(p.x) && fin(p.z)) offer("blueprint", p.x, p.z, {});
    });

  // 3. wall midpoints — a frequent architectural datum that should not need
  // eyeballing or a temporary half-length dimension.
  nearWalls.forEach(function (rec) {
    var w = rec.ref;
    if (origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w), midpoint = wallPointAt(w, g.L / 2);
    offer("midpoint", midpoint.x, midpoint.z,
      { wall: w, s: g.L / 2 });
  });

  /* A wall can terminate at an opening jamb, but not in the empty opening.
     Make both jambs first-class snap targets so this valid connection is just
     as easy to hit as a midpoint or an endpoint.

     Snap the new wall's FACE to the jamb, not its centreline — the surface
     snapping Chief Architect does, and the only version that leaves the opening
     alone. Landing the centreline on the jamb puts half a wall thickness inside
     the passage, so opening 86 and drawing a bay off both jambs used to give a
     74 cm way through with a half-thickness reveal down each side. Landing it
     half a thickness back into the SOLID side instead butts the wall against
     the host's face with its own face continuing the reveal, and the 86 stays
     86. The cursor is still measured against the jamb itself: that is the line
     being aimed at, and at any real zoom the offset centreline is further away
     than the snap tolerance. */
  var faceBack = drawFaceBack();
  nearOpens.forEach(function (rec) {
    var o = rec.ref;
    var w = wallById(o.wall);
    if (!w || origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w), half = Math.max(0, o.width || 0) / 2;
    [[o.s - half, -1], [o.s + half, 1]].forEach(function (jamb) {
      var s = jamb[0];
      if (s <= 1 || s >= g.L - 1) return;
      // backing off the jamb always moves AWAY from the opening, so the only
      // thing to guard is running off the end of the host wall
      var sc = clamp(s + jamb[1] * faceBack, 0, g.L);
      var backed = wallPointAt(w, sc), jambPoint = wallPointAt(w, s);
      offer("jamb", backed.x, backed.z, { wall: w, s: sc }, jambPoint);
    });
  });

  /* 4. furniture footprints. The wall tool ignored items entirely, so drawing
     a partition flush to an existing cabinet run was done by eye even though
     dragging the cabinet itself has snapped to walls for ages. The four
     rotated corners and the centre are offered; edge midpoints are not, or a
     large sofa carpets the plan in snap targets. */
  nearItems.forEach(function (rec) {
    var it = rec.ref;
    if (!it || it.locked) return;
    var a = ((it.rot || 0) * Math.PI) / 180,
      ca = Math.cos(a), sa = Math.sin(a),
      hw = (it.w || 0) / 2, hd = (it.d || 0) / 2;
    offer("itemCorner", it.x, it.z, {});
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      var lx = q[0] * hw, lz = q[1] * hd;
      offer("itemCorner", it.x + lx * ca - lz * sa, it.z + lx * sa + lz * ca, {});
    });
  });

  // 5. real or nearby virtual intersections. A real crossing carries every
  // wall it lies on so committing the point splits and welds all of them.
  for (var ia = 0; ia < wideWalls.length; ia++) {
    var wa = wideWalls[ia].ref;
    if (origins.indexOf(wa.a) !== -1 || origins.indexOf(wa.b) !== -1) continue;
    /* Only wall pairs whose bounding boxes come near the cursor are tested.
       The nested loop used to run over every pair on every mouse move, which
       is fine at thirty walls and not at three hundred. The grid narrows the
       list the pairs are drawn from; nearCursor stays because it is the exact
       window this pass is specified in terms of, and because wideWalls is a
       superset of what it accepts. Records are in S.walls order, so ia < ib
       still enumerates each unordered pair exactly once, the same way round. */
    if (!nearCursor(wa, px, pz, extWindow)) continue;
    for (var ib = ia + 1; ib < wideWalls.length; ib++) {
      var wb = wideWalls[ib].ref;
      if (origins.indexOf(wb.a) !== -1 || origins.indexOf(wb.b) !== -1) continue;
      if (!nearCursor(wb, px, pz, extWindow)) continue;
      var ip = wallLineIntersection(wa, wb);
      if (!ip) continue;
      var beyondA = ip.ta < 0 ? -ip.ta * ip.ga.L : ip.ta > 1 ? (ip.ta - 1) * ip.ga.L : 0,
        beyondB = ip.tb < 0 ? -ip.tb * ip.gb.L : ip.tb > 1 ? (ip.tb - 1) * ip.gb.L : 0;
      if (beyondA > extWindow || beyondB > extWindow) continue;
      var land = [];
      if (ip.ta > 0.001 && ip.ta < 0.999) land.push({ id: wa.id });
      if (ip.tb > 0.001 && ip.tb < 0.999) land.push({ id: wb.id });
      offer("intersection", ip.x, ip.z, { walls: land });
    }
  }

  // 6. perpendicular foot from any active origin to a wall segment.
  origins.forEach(function (oi) {
    var O = S.nodes[oi];
    if (!O) return;
    nearWalls.forEach(function (rec) {
      var w = rec.ref;
      if (w.a === oi || w.b === oi) return;
      var g = wallGeom(w), foot = wallProject(w, O.x, O.z), s = foot && foot.s;
      if (s <= 1 || s >= g.L - 1) return;
      offer("perpendicular", foot.x, foot.z, { wall: w, s: s });
    });
  });

  // 7. a point ON a wall — without this you can only ever connect to a corner,
  // so a wall drawn across a room left floating endpoints, never split what it
  // crossed, and produced no new rooms.
  nearWalls.forEach(function (rec) {
    var w = rec.ref;
    // a wall we are drawing FROM is not a valid landing target
    if (origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w);
    if (!fin(g.L) || g.L <= 0) return;
    var projected = wallProject(w, px, pz), s = projected && projected.s;
    if (s <= 1 || s >= g.L - 1) return; // ends belong to the corner snap above
    /* GRID applies along the wall too. The raw foot of the cursor made every
       partition started on another wall land at 3591 or 2513, so a plan drawn
       with the grid on still needed each wall retyped. An axis-aligned wall
       rounds its free world coordinate (the partition lines up with the grid
       and its neighbours); any other wall rounds the distance along it. */
    if (S.gsnap !== false && g.kind !== "arc") {
      var sq = Math.abs(g.ux) > 0.9999 ? s + (Math.round(projected.x / SNAP_GRID) * SNAP_GRID - projected.x) / g.ux
        : Math.abs(g.uz) > 0.9999 ? s + (Math.round(projected.z / SNAP_GRID) * SNAP_GRID - projected.z) / g.uz
          : Math.round(s / SNAP_GRID) * SNAP_GRID;
      if (sq > 1 && sq < g.L - 1) {
        s = sq;
        projected = wallPointAt(w, s);
      }
    }
    var opening = openingAtWallPosition(w, s, 0.05);
    offer(
      opening ? "openingBlocked" : "wall",
      projected.x,
      projected.z,
      { wall: w, s: s, blockedOpening: opening ? opening.id : null },
    );
  });

  // 8. wall extension line. Unlike an on-wall snap this is construction
  // geometry only: it does not lengthen the reference wall automatically.
  wideWalls.forEach(function (rec) {
    var w = rec.ref;
    if (origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
    var g = wallGeom(w);
    if (g.kind === "arc") return; // a finite arc has no single straight extension ray
    var s = (px - g.a.x) * g.ux + (pz - g.a.z) * g.uz;
    if (s >= 0 && s <= g.L) return;
    if (s < -extWindow || s > g.L + extWindow) return;
    offer("extension", g.a.x + g.ux * s, g.a.z + g.uz * s, {});
  });

  /* Rank. Sorting rather than tracking a running best because the HUD's Tab
     key cycles through the alternatives under the cursor, which needs the
     whole ordered list, not just its head. */
  if (cands.length) {
    cands.sort(function (a, b) { return a.score - b.score; });
    S.snapAlts = cands.slice(0, 6).map(function (c) {
      return { kind: c.kind, x: c.x, z: c.z };
    });
    /* Tab steps the choice down the ranked list for as long as the same set
       of candidates stays under the cursor. */
    var pickIdx = 0;
    if (fin(S.snapCycle) && S.snapCycle > 0) pickIdx = S.snapCycle % cands.length;
    var win = cands[pickIdx];
    S.snapInfo = { type: win.kind, x: win.x, z: win.z, alts: cands.length };
    return {
      x: win.x, z: win.z,
      node: win.extra.node != null ? win.extra.node : null,
      wall: win.extra.wall || null,
      s: win.extra.s,
      walls: win.extra.walls,
      blockedOpening: win.extra.blockedOpening,
    };
  }
  S.snapAlts = [];

  // 7. angle snap from the origin corner(s)
  if (origins.length) {
    /* The one consumer of the FULL corner set that survives the broad phase.
       An alignment run is a ray from the origin, not a disc around the cursor —
       the corner it lines up with can be anywhere on the plan — so there is no
       radius to query with and the whole set is genuinely needed. It is read
       here rather than at the top of the function because everything above
       returns before reaching it whenever an object snap wins. */
    var u = usedNodes();
    var pick = null;
    origins.forEach(function (oi) {
      var a = S.nodes[oi];
      if (!a) return;
      var dx = px - a.x,
        dz = pz - a.z,
        len = Math.hypot(dx, dz);
      if (len <= 1) return;
      var raw = Math.atan2(dz, dx);
      /* A direction that runs straight along a wall ALREADY leaving this
         corner is not a direction: the new segment would lie on top of that
         wall, which is the 0° joint the constraint engine complains about
         afterwards. Ortho makes it especially easy to hit — 0° is a perfectly
         good multiple of 90° — so it is ruled out here, at the aim, instead of
         being reported once the damage is done. Only the SAME direction is
         blocked; the opposite one (180°, a straight run through the corner) is
         how a split wall continues and stays available. */
      var folds = armAngles(oi, origins);
      function foldBlocked(c) {
        for (var fi = 0; fi < folds.length; fi++)
          if (Math.abs(angDelta(c, folds[fi])) < FOLD_TOL) return true;
        return false;
      }
      var ang = raw,
        bestDiff = 1e9,
        angLocked = false,
        chosenKind = "free";
      if (S.ortho) {
        var oAng = Math.round(raw / (Math.PI / 2)) * (Math.PI / 2);
        // blocked quarter turn -> take the nearest one that is free rather
        // than silently drawing the overlap
        if (foldBlocked(oAng)) {
          var alt = null,
            altD = 1e9;
          for (var qi = 0; qi < 4; qi++) {
            var qa = qi * (Math.PI / 2);
            if (foldBlocked(qa)) continue;
            var qd = Math.abs(angDelta(raw, qa));
            if (qd < altD) {
              altD = qd;
              alt = qa;
            }
          }
          if (alt != null) oAng = alt;
        }
        ang = oAng;
        bestDiff = 0;
        angLocked = true;
        chosenKind = "ortho";
      } else {
        // Candidates: every 15°, PLUS the direction of every existing wall (both
        // ways). World-absolute 15°s alone made it impossible to continue or
        // parallel an angled wall — e.g. an imported site footprint at 7°.
        var incAng = raw,
          incDiff = 1e9;
        if (snapOn("inc")) for (var deg = 0; deg < 360; deg += 15) {
          var c = (deg * Math.PI) / 180,
            df = Math.abs(angDelta(raw, c));
          if (foldBlocked(c)) continue;
          if (df < incDiff) {
            incDiff = df;
            incAng = c;
          }
        }
        var wallAng = raw,
          wallDiff = 1e9,
          wallKind = "angle";
        if (snapOn("bisector") && folds.length >= 2) {
          for (var bi = 0; bi < folds.length; bi++) for (var bj = bi + 1; bj < folds.length; bj++) {
            var f1 = folds[bi], f2 = folds[bj], delta = angDelta(f2, f1),
              bis = f1 + delta / 2;
            [bis, bis + Math.PI].forEach(function (c) {
              var df = Math.abs(angDelta(raw, c));
              if (!foldBlocked(c) && df < wallDiff) {
                wallDiff = df; wallAng = c; wallKind = "bisector";
              }
            });
          }
        }
        if (snapOn("walldir")) S.walls.forEach(function (w) {
          var g = wallGeom(w);
          if (!fin(g.ang)) return;
          [g.ang, g.ang + Math.PI].forEach(function (c) {
            var df = Math.abs(angDelta(raw, c));
            if (foldBlocked(c)) return;
            if (df < wallDiff) {
              wallDiff = df;
              wallAng = c;
              wallKind = "angle";
            }
          });
        });
        var incOk = incDiff < INC_TOL * mul,
          wallOk = wallDiff < WALL_TOL * mul;
        // Outside BOTH gates the pointer's own angle is kept, so an off-increment
        // wall is drawable at all — the snap used to be unconditional.
        if (incOk && (!wallOk || incDiff <= wallDiff)) {
          ang = incAng;
          bestDiff = incDiff;
          angLocked = true;
          chosenKind = "angle";
        } else if (wallOk) {
          ang = wallAng;
          bestDiff = wallDiff;
          angLocked = true;
          chosenKind = wallKind;
        }
      }
      /* Free aim is still not allowed to fold the wall back onto its
         neighbour: pushed off to the edge of the blocked wedge, so the segment
         gets as close as it can without becoming the overlap. */
      if (foldBlocked(ang)) {
        var near = folds[0],
          nearD = 1e9;
        folds.forEach(function (f) {
          var d0 = Math.abs(angDelta(ang, f));
          if (d0 < nearD) {
            nearD = d0;
            near = f;
          }
        });
        ang = near + (angDelta(ang, near) >= 0 ? FOLD_TOL : -FOLD_TOL);
      }
      // Round the distance ALONG the ray. Rounding x and z independently (as
      // this used to) pushes the point back off the angle it just snapped to,
      // which cost up to ~0.5° whenever the origin corner was itself off-grid.
      var L = S.gsnap === false
        ? len
        : Math.max(SNAP_GRID, Math.round(len / SNAP_GRID) * SNAP_GRID);

      /* Alignment inference: slide along the ray to the exact length where the
         endpoint lines up with an existing corner or opening jamb, horizontally or vertically.
         This is what makes "draw the opposite wall and stop level with that
         corner" a single confident gesture instead of eyeballing the grid —
         the ray already fixes the 90°, this fixes where it ends. */
      var ux = Math.cos(ang),
        uz = Math.sin(ang),
        alignTol = (12 * mul) / inputScale();
      if (!isFinite(alignTol) || alignTol <= 0) alignTol = 12 * mul;
      var bestT = null,
        bestGap = alignTol;

      var alignTargets = [];
      for (var nk in u) {
        var q = S.nodes[nk];
        if (!q || origins.indexOf(+nk) !== -1) continue;
        alignTargets.push({ x: q.x, z: q.z });
      }
      var faceBack = drawFaceBack();
      (S.openings || []).forEach(function (o) {
        var w = wallById(o.wall);
        if (!w || origins.indexOf(w.a) !== -1 || origins.indexOf(w.b) !== -1) return;
        var g = wallGeom(w), half = Math.max(0, o.width || 0) / 2;
        [[o.s - half, -1], [o.s + half, 1]].forEach(function (jamb) {
          var s = jamb[0];
          if (s <= 1 || s >= g.L - 1) return;
          var sc = clamp(s + jamb[1] * faceBack, 0, g.L);
          alignTargets.push(wallPointAt(w, sc));
        });
      });

      if (snapOn("align")) for (var ti = 0; ti < alignTargets.length; ti++) {
        var q = alignTargets[ti];
        // where the ray's x reaches q.x, and where its z reaches q.z
        if (Math.abs(ux) > 1e-6) {
          var tx = (q.x - a.x) / ux;
          if (tx > 1 && Math.abs(tx - L) < bestGap) {
            bestGap = Math.abs(tx - L);
            bestT = tx;
          }
        }
        if (Math.abs(uz) > 1e-6) {
          var tz = (q.z - a.z) / uz;
          if (tz > 1 && Math.abs(tz - L) < bestGap) {
            bestGap = Math.abs(tz - L);
            bestT = tz;
          }
        }
      }
      var guides = [];
      if (bestT != null) {
        L = bestT;
        var fx = a.x + ux * L,
          fz = a.z + uz * L;
        // every corner/jamb the endpoint now lines up with gets its own guide
        for (var ti2 = 0; ti2 < alignTargets.length; ti2++) {
          var q2 = alignTargets[ti2];
          if (Math.abs(q2.x - fx) < 0.5 || Math.abs(q2.z - fz) < 0.5)
            guides.push({ x1: q2.x, z1: q2.z, x2: fx, z2: fz });
        }
      }

      var cand = {
        x: a.x + Math.cos(ang) * L,
        z: a.z + Math.sin(ang) * L,
        node: null,
        wall: null,
        d: bestDiff,
        ang: ang,
        kind: S.ortho ? "ortho" : guides.length ? "align" : angLocked ? chosenKind : "free",
        guides: guides,
      };
      if (!pick || cand.d < pick.d) pick = cand;
    });
    if (pick) {
      S.snapGuides = pick.guides;
      S.snapInfo = { type: pick.kind, x: pick.x, z: pick.z, ang: pick.ang };
      return { x: pick.x, z: pick.z, node: null, wall: null };
    }
  }

  // 10. plain grid
  var gx = S.gsnap === false ? px : Math.round(px / SNAP_GRID) * SNAP_GRID,
    gz = S.gsnap === false ? pz : Math.round(pz / SNAP_GRID) * SNAP_GRID;
  S.snapInfo = { type: S.gsnap === false ? "free" : "grid", x: gx, z: gz };
  return { x: gx, z: gz, node: null, wall: null };
}

function snapWallPoint(px, pz, fromIdx) {
  var p = snapPoint(px, pz, fromIdx);
  if (!(S.tool === "wall" && S.drawing && fromIdx != null)) return p;
  var origin = S.nodes[fromIdx];
  if (!origin) return p;
  p = applyDrawDirLock(origin, p);
  if (p.node != null || p.wall || (p.walls && p.walls.length)) return p;
  var hit = extendToHit(origin, p, wallJoinTolerance());
  if (!hit) return p;
  S.snapInfo = { type: "hit", x: hit.x, z: hit.z, alts: (S.snapInfo && S.snapInfo.alts) || 1 };
  return { x: hit.x, z: hit.z, node: null, wall: hit.wall, s: hit.s };
}

export { snapMul, snapWallPoint, wallJoinTolerance };

/* Constraint engine for the 2D plan: dimensions win over connections.
   ------------------------------------------------------------------
   Every wall is born with its length and angle LOCKED. When an edit somewhere
   else in the graph would stretch or swing a locked wall just to keep a shared
   corner together, the engine refuses: the wall keeps its exact measurements
   and the joint is released instead (the wall gets its own corner back at the
   position it was already standing on). Nothing is auto-repaired — the plan
   then GLOWS at every loose endpoint and every joint that is not square, and it
   is the user who decides what to do about it (fix it, or ignore that one
   warning for good).

   This is the opposite trade-off from a classic parametric sketcher, and it is
   deliberate: a drawn dimension is something the user measured in the real
   world, while a connection is something the editor inferred.

   Nothing here touches the DOM or THREE — it is pure model surgery + a
   read-only validation pass, so the plan renderer, the inspector and the
   warning list can all read from one source of truth. */
import { S, fin } from "./state.js";
import {
  wallGeom,
  wallCuts,
  wallClearLength,
  wallDimSide,
  wallSideNormal,
  straightRunNodes,
  setWallEnd,
  wallLocFace,
} from "./geometry.js";

/* Tolerances. LOCK_* decide when an edit counts as having DISTORTED a wall
   (below them it is float noise from rotating/rounding, not a real change);
   ANGLE_TOL decides when a joint stops counting as square. All three are well
   under what anyone can draw by hand, and well over IEEE-754 drift. */
export const LOCK_TOL_L = 0.25; // cm
export const LOCK_TOL_A = (0.05 * Math.PI) / 180; // rad
export const ANGLE_TOL = 0.5; // degrees, for the 90° joint check
const COINCIDENT = 0.4; // cm — corners this close are the same point

// smallest signed difference between two angles, wrapped to [-π,π]
function angDelta(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/* ---- the lock itself ---------------------------------------------------- */

/* Auto-lock: a wall is locked unless it was explicitly unlocked. Reading the
   default this way (rather than writing lock:true at every creation site) means
   walls drawn by the wall tool, the room/corridor buttons, the auto-generator,
   the blueprint importer and the OSM footprint importer are all locked without
   any of them knowing this module exists. */
export function isLocked(w) {
  return !!w && w.lock !== false;
}
/* Record the wall's current measurements as the ones being held. Called when a
   wall is created and whenever the user deliberately re-dimensions THAT wall —
   never when it merely got dragged along by something else. */
export function captureLock(w) {
  if (!w) return;
  var g = wallGeom(w);
  if (!fin(g.L)) return;
  w.lockL = g.L;
  w.lockAng = (g.ang * 180) / Math.PI;
}
export function setLocked(w, on) {
  if (!w) return;
  if (on) {
    w.lock = true;
    captureLock(w);
  } else w.lock = false;
}
/* Give every wall a captured measurement to hold. New walls (from any creation
   path) get theirs here; unlocked walls keep theirs refreshed so that turning
   the lock back on holds what is on screen, not what was there before. */
export function syncLocks() {
  S.walls.forEach(function (w) {
    if (!fin(w.lockL) || !fin(w.lockAng) || !isLocked(w)) captureLock(w);
  });
}

/* ---- enforcement -------------------------------------------------------- */

/* Positions of every corner, to compare against after an edit. Cheap enough to
   take on each frame of a drag (a plan has tens of corners, not thousands). */
export function snapshotNodes() {
  var snap = S.nodes.map(function (n) {
    return n ? { x: n.x, z: n.z } : null;
  });
  /* The interior length each wall was reading BEFORE the edit, carried along on
     the array itself so every existing caller keeps working. enforceLocks needs
     it because a wall's node-to-node length is not what the user dimensioned:
     thickening a neighbour moves this wall's corners without touching the
     number on the plan, and judging "deformed" by the centreline alone tore
     perfectly intact rooms apart (see interiorDeformed below). */
  var clear = {};
  S.walls.forEach(function (w) {
    var c = wallClearLength(w);
    if (fin(c)) clear[w.id] = c;
  });
  snap.clear = clear;
  return snap;
}

function cloneNode(p) {
  return S.nodes.push({ x: p.x, z: p.z }) - 1;
}

/* The core rule. `before` is a snapshotNodes() taken immediately before the
   edit; `activeIds` are the walls the user is deliberately editing (those are
   allowed to change shape — that is the whole point of the gesture).

   Any OTHER locked wall whose length or angle came out different is put back:
   whichever of its ends moved is handed a private corner at the spot it was
   standing on, which restores the wall exactly and releases the joint. A wall
   that merely travelled (both ends moved by the same vector — a room drag) is
   untouched, because a rigid move changes no dimension.

   Returns how many joints were released, so the caller can say so. */
export function enforceLocks(before, activeIds) {
  if (!before) return 0;
  var act = {};
  (activeIds || []).forEach(function (id) {
    act[id] = 1;
  });
  var released = 0;
  S.walls.forEach(function (w) {
    if (act[w.id] || !isLocked(w)) return;
    var pa = before[w.a],
      pb = before[w.b];
    if (!pa || !pb) return; // an end created BY this edit has nothing to restore
    var na = S.nodes[w.a],
      nb = S.nodes[w.b];
    if (!na || !nb) return;
    var movedA = Math.hypot(na.x - pa.x, na.z - pa.z) > COINCIDENT,
      movedB = Math.hypot(nb.x - pb.x, nb.z - pb.z) > COINCIDENT;
    if (!movedA && !movedB) return;
    var L0 = Math.hypot(pb.x - pa.x, pb.z - pa.z),
      a0 = Math.atan2(pb.z - pa.z, pb.x - pa.x),
      L1 = Math.hypot(nb.x - na.x, nb.z - na.z),
      a1 = Math.atan2(nb.z - na.z, nb.x - na.x);
    if (Math.abs(L1 - L0) < LOCK_TOL_L && Math.abs(angDelta(a1, a0)) < LOCK_TOL_A)
      return; // moved, but not deformed
    /* Interior dimensions are the stated ones, so they decide. A wall whose
       INTERIOR length and bearing both survived was not deformed, however far
       its centreline slid: that is exactly what happens to all four walls of a
       room when one of them is thickened, and defending the centreline there
       released every corner of an intact room. Re-read the centreline lock so
       the next edit compares against the geometry that is actually on screen. */
    if (interiorDims() && !interiorDeformed(w, before, a0, a1)) {
      captureLock(w);
      return;
    }
    var freed = null;
    if (movedA) {
      w.a = cloneNode(pa);
      released++;
      freed = "a";
    }
    if (movedB) {
      w.b = cloneNode(pb);
      released++;
      freed = freed ? "mid" : "b";
    }
    /* Releasing a corner also removes the CUT that corner was taking out of
       this wall, so putting the centreline back where it was left the wall
       reading 10 cm longer than the number it is defending. Slide the end that
       just became private — nothing else is attached to it — until the stated
       interior length reads true again. */
    if (freed && interiorDims() && fin(w.clearL))
      fitWallClearLength(w, w.clearL, freed);
  });
  return released;
}
/* Did the edit change what this wall MEASURES — its interior length or its
   bearing — as opposed to merely sliding its centreline sideways? `before` is a
   snapshotNodes(), which carries every wall's pre-edit interior length. */
function interiorDeformed(w, before, a0, a1) {
  if (Math.abs(angDelta(a1, a0)) >= LOCK_TOL_A) return true;
  var was = before.clear && before.clear[w.id];
  if (!fin(was)) return true; // nothing to compare: fall back to the old rule
  var now = wallClearLength(w);
  return !fin(now) || Math.abs(now - was) >= LOCK_TOL_L;
}

/* Would merging corner `from` into corner `keep` deform a locked wall?
   Welding is the editor's way of AUTO-connecting two corners that ended up on
   top of each other, so it falls squarely under the same rule: it may not buy a
   connection with someone else's measurements. `allowIds` are the walls the
   user is actively dragging, which are allowed to change.
   Two corners that are already the same point can always be merged — that is a
   bookkeeping merge, not a move. */
export function canWeld(keep, from, allowIds) {
  var k = S.nodes[keep],
    f = S.nodes[from];
  if (!k || !f) return true;
  if (Math.hypot(k.x - f.x, k.z - f.z) <= COINCIDENT) return true;
  var allow = {};
  (allowIds || []).forEach(function (id) {
    allow[id] = 1;
  });
  for (var i = 0; i < S.walls.length; i++) {
    var w = S.walls[i];
    if (allow[w.id] || !isLocked(w)) continue;
    var end = w.a === from ? "a" : w.b === from ? "b" : null;
    if (!end) continue;
    var o = S.nodes[end === "a" ? w.b : w.a];
    if (!o) continue;
    var L0 = Math.hypot(f.x - o.x, f.z - o.z),
      a0 = Math.atan2(f.z - o.z, f.x - o.x),
      L1 = Math.hypot(k.x - o.x, k.z - o.z),
      a1 = Math.atan2(k.z - o.z, k.x - o.x);
    if (Math.abs(L1 - L0) > LOCK_TOL_L || Math.abs(angDelta(a1, a0)) > LOCK_TOL_A)
      return false;
  }
  return true;
}

/* ---- interior (clear) dimensions ---------------------------------------- */

/* A person measuring a building measures INSIDE faces. So the number the user
   draws, reads off the plan and types into the inspector is the wall's CLEAR
   length, and it is the thing that must survive later edits: a 300 cm wall that
   then gets a 10 cm wall welded to each end used to read 290 cm, because the
   two corner cuts ate 5 cm each off a centreline that never moved. Here the
   wall grows OUTWARD instead and still measures 300 cm inside.

   `w.clearL` is that intent, captured whenever the user states it (drawing the
   wall, typing its length). Everything else — welding a corner, changing a
   thickness, deleting a wall — is a change of CUTS, and preserveClear() puts
   the geometry back so the stated interior numbers still hold.

   S.interiorDims === false turns the whole mechanism off and restores the old
   centreline behaviour (settings → "interior dimensions"). */
const CLEAR_TOL = 0.01; // cm — a tenth of a millimetre, far below any drawing
const CLEAR_ITERS = 60; // relaxation passes; a plan converges in a handful

export function interiorDims() {
  return S.interiorDims !== false;
}
export function captureClear(w) {
  if (!w) return;
  var c = wallClearLength(w);
  if (fin(c) && c > 0) w.clearL = c;
}

/* Finish an explicit inspector edit at the exact displayed clear length.
   enforceLocks() runs before this helper, so a moved end that conflicted with
   locked neighbours is already private. Adjusting that active endpoint is
   therefore deterministic and does not wake the whole-plan relaxation pass.
   A few iterations cover the rare case where a very oblique mitre changes its
   cut slightly as the endpoint settles. */
export function fitWallClearLength(w, target, end) {
  if (!w || !fin(target) || target <= 0) return;
  for (var i = 0; i < 12; i++) {
    var g = wallGeom(w),
      err = target - wallClearLength(w);
    if (!fin(err) || Math.abs(err) < CLEAR_TOL) break;
    /* g comes off the wall's OWN line, so every one of these has to go back
       through setWallEnd() — writing it straight into S.nodes would bake a
       face-located wall's offset into the node and slide it another half
       thickness on every edit. */
    if (end === "mid") {
      setWallEnd(w, "a", { x: g.a.x - g.ux * err / 2, z: g.a.z - g.uz * err / 2 });
      setWallEnd(w, "b", { x: g.b.x + g.ux * err / 2, z: g.b.z + g.uz * err / 2 });
    } else if (end === "a") {
      setWallEnd(w, "a", { x: g.a.x - g.ux * err, z: g.a.z - g.uz * err });
    } else {
      setWallEnd(w, "b", { x: g.b.x + g.ux * err, z: g.b.z + g.uz * err });
    }
  }
}
/* Give every wall an intent to hold. Walls from the room buttons, the
   generator, the blueprint importer and loaded files all pass through here, so
   none of them has to know this exists — same trick as syncLocks(). */
export function syncClears() {
  S.walls.forEach(function (w) {
    if (!fin(w.clearL)) captureClear(w);
  });
}

/* Restore every wall's stated interior length after the CUTS around it changed.

   The move is a RIGID SLIDE, never a stretch. A wall that must grow by `err`
   picks one of its ends and translates EVERYTHING hanging off that end — the
   whole connected sub-graph reached without crossing this wall — by `err` along
   its own axis. Every other wall in that group keeps its length AND its angle
   exactly, which is the whole point: the first version nudged the two corners
   of each wall independently, and a corner shared by two walls then received
   two different nudges and came out rotated. A perfectly square plan quietly
   went out of square one corner at a time.

   Consequences of the rigid rule, all of them wanted:
   - a wall inside a CLOSED loop cannot slide (the far end is reachable without
     crossing it), so it is left alone rather than deforming the loop;
   - a `pinned` corner (the one the user just placed) holds its whole side still,
     so the growth always happens on the other side.  */
function reachFrom(startNode, viaWall) {
  var seen = {},
    stack = [startNode];
  seen[startNode] = 1;
  while (stack.length) {
    var n = stack.pop();
    for (var i = 0; i < S.walls.length; i++) {
      var w = S.walls[i];
      if (w === viaWall) continue;
      var other = w.a === n ? w.b : w.b === n ? w.a : null;
      if (other == null || seen[other]) continue;
      seen[other] = 1;
      stack.push(other);
    }
  }
  return seen;
}

/* Restate WHICH LINE of the wall the model stores: the measured face
   (`dimSide`) and whether the node line follows it (`loc`).

   THE JOINT IS WHAT STAYS PUT. Re-hanging a wall on its face moves the wall's
   body sideways by half a thickness; the alternative — hold the body still and
   move the nodes instead — is what a single-wall CAD does, but here a node is a
   shared corner: it would drag every neighbour standing on it, and on a straight
   run it would drag the very wall the user is trying to line up with. So the
   corner stays, the wall re-hangs, and the plan says so.

   That is also exactly why this is the operation that produces a flush run:
   apply it to both walls of a run and BOTH faces land on the one node line,
   whatever their thicknesses. The interior dimensions around it are re-READ
   rather than defended — like a thickness edit, this changes what the
   neighbours measure, and defending the old numbers would shove the plan. */
export function setWallReference(w, next) {
  if (!w || !next) return;
  if (next.dimSide === null) delete w.dimSide;
  else if (next.dimSide !== undefined) w.dimSide = next.dimSide;
  if (next.loc === "face") {
    // "face" needs a face: resolve Auto, and never hang a wall on its centreline
    var side = wallDimSide(w);
    w.dimSide = side === 1 || side === -1 ? side : 1;
    w.loc = "face";
  } else if (next.loc !== undefined) delete w.loc;
  var touched = [w];
  S.walls.forEach(function (ow) {
    if (ow !== w && (ow.a === w.a || ow.a === w.b || ow.b === w.a || ow.b === w.b))
      touched.push(ow);
  });
  touched.forEach(function (ow) {
    captureClear(ow);
    if (isLocked(ow)) captureLock(ow);
  });
}

/* Slide a wall sideways so the face named by "Measured along" stays where it
   is, taking the whole STRAIGHT RUN with it.

   Two collinear walls meet at ONE node, so they necessarily share a centreline:
   there is no way to hold one of them still while the other's centreline steps
   sideways. Moving only the edited wall's two nodes therefore did not offset
   its collinear neighbour — it BENT it, pivoting it about its far corner. Past
   4.6° of bend the joint stops counting as a straight run at all, faceShiftAt()
   starts mitring it as a corner, and the neighbour is handed an end cut of
   (half a thickness)/sin(angle) — over a metre. preserveClear() then reads that
   as "this wall is a metre short" and stretches it for real. That is the whole
   bug: thickening one wall of a run silently doubled the wall above it.

   Translating the entire run keeps every member's length AND bearing exactly,
   the run stays straight, and the material added by the new thickness lands on
   the far side of the measured face — which is the visible behaviour asked for.
   Whatever the run's outer corners then owe the walls hanging off them is a
   plain axial change, i.e. exactly what preserveClear() already repairs. */
function moveWallSideways(w, dx, dz) {
  if (!dx && !dz) return;
  var run = straightRunNodes(w);
  for (var k in run) {
    var n = S.nodes[k];
    if (n) S.nodes[k] = { x: n.x + dx, z: n.z + dz };
  }
}

/* Change thickness about the face the user chose in "Measured along".
   Keeping that face fixed is the geometric reason the neighbouring clear
   lengths survive: at an interior corner the same face intersection remains
   in the same world position, while all added/removed material goes to the
   opposite side.  The selected wall is then fitted axially only if an oblique
   mitre leaves a small residual; `end` is the independent "Resize from" pick. */
export function setWallThicknessPreservingClear(w, thickness, end) {
  if (!w || !fin(thickness)) return { ids: [], released: 0 };
  thickness = Math.max(2, Math.min(60, thickness));
  syncClears();
  syncLocks();
  var target = fin(w.clearL) ? w.clearL : wallClearLength(w),
    old = fin(w.thickness) ? w.thickness : thickness,
    g = wallGeom(w),
    side = wallDimSide(w),
    normal = wallSideNormal(g),
    component = reachFrom(w.a, null),
    before = snapshotNodes(),
    ids = [];
  S.walls.forEach(function (ow) {
    if (component[ow.a] || component[ow.b]) ids.push(ow.id);
  });

  // Resolve Auto before topology/corner geometry changes, exactly like length
  // and angle edits do. From now on this is the wall's stable reference face.
  w.dimSide = side;
  w.thickness = thickness;
  /* A wall stored on its measured face needs no shift at all: the face IS the
     node line, so wallGeom() already grows the wall away from it and the node
     graph is untouched. That is the whole point of a location line, and it is
     why a flush run is also the quiet one to edit. */
  var shift = wallLocFace(w) ? 0 : ((thickness - old) / 2) * side;
  if (shift) moveWallSideways(w, -normal.x * shift, -normal.z * shift);

  fitWallClearLength(w, target, end);
  // Reconcile only the connected structure. Unrelated/open walls elsewhere in
  // the plan must not wake up because this wall changed thickness.
  preserveClear(null, ids);
  fitWallClearLength(w, target, end);

  /* Inside a room nothing above could have run: preserveClear() slides whole
     sub-graphs, and a wall in a closed loop has no side to slide. So the walls
     around this one are still holding whatever the new cuts left them with —
     which is how thickening one wall of a rectangle used to quietly resize the
     room. Relax the loop back onto every stated interior dimension first, with
     this wall held still, and only then look for a real contradiction. */
  var relaxed = settleWallDim(w, target, end, [w.id]);

  /* An explicitly chosen OUTER face can make a closed loop over-constrained:
     keeping that face fixed moves the adjoining inner faces, while the other
     locked clear lengths demand that they stay put. Dimensions win over an
     inferred connection, so release only the joints whose locked walls still
     disagree, then reconcile the now-open component exactly. The usual room-
     interior face never enters this branch and keeps every corner connected. */
  var conflict = S.walls.some(function (ow) {
    return ow !== w && ids.indexOf(ow.id) !== -1 && isLocked(ow) &&
      fin(ow.clearL) && Math.abs(wallClearLength(ow) - ow.clearL) >= CLEAR_TOL;
  });
  var released = 0;
  if (conflict) {
    released = enforceLocks(before, [w.id].concat(relaxed.yielded));
    preserveClear(null, ids);
    fitWallClearLength(w, target, end);
  }
  S.walls.forEach(function (ow) {
    if (ids.indexOf(ow.id) !== -1 && isLocked(ow)) captureLock(ow);
  });
  return { ids: ids, released: released };
}
/* Put the edited wall exactly on its typed number AND leave the rest of the
   plan agreeing with it. The two steps fight each other by design: fitting the
   wall moves one of its corners, which changes the cuts (and therefore the
   targets) of everything standing at that corner; relaxing those puts the
   corner under load again. Alternating them converges in two or three rounds —
   doing it once, as the first version did, left the fit's last nudge sitting on
   top of the neighbours and released their joints for it. */
export function settleWallDim(w, target, end, activeIds, allowLockedYield, preventLengthYield) {
  var worst = 0,
    yielded = [];
  for (var i = 0; i < 4; i++) {
    fitWallClearLength(w, target, end);
    var out = relaxLocks(activeIds, null, allowLockedYield, preventLengthYield);
    worst = out.worst;
    /* Yields ACCUMULATE across the rounds. A wall that yielded on the first
       pass has had its length recomputed on purpose; reporting only the last
       round's yields let enforceLocks() see that new length as damage and tear
       the corner off the wall the solver had just finished placing. */
    out.yielded.forEach(function (id) {
      if (yielded.indexOf(id) === -1) yielded.push(id);
    });
    if (worst < CLEAR_TOL && Math.abs(wallClearLength(w) - target) < CLEAR_TOL)
      break;
  }
  fitWallClearLength(w, target, end);
  return { worst: worst, yielded: yielded };
}
export function preserveClear(pinned, wallIds) {
  if (!interiorDims()) return;
  syncClears();
  var pin = {};
  (pinned || []).forEach(function (i) {
    pin[i] = 1;
  });
  /* A direct inspector edit is local: restoring every stored wall intent here
     made an unrelated open-ended wall jump the next time somebody confirmed a
     length or angle.  Creation/topology callers omit `wallIds` and still get
     the original whole-plan reconciliation; dimension editors pass the one
     wall the user actually changed. */
  var only = null;
  if (wallIds && wallIds.length) {
    only = {};
    wallIds.forEach(function (id) { only[id] = 1; });
  }
  for (var it = 0; it < CLEAR_ITERS; it++) {
    var worst = 0;
    for (var i = 0; i < S.walls.length; i++) {
      var w = S.walls[i];
      if (only && !only[w.id]) continue;
      if (!fin(w.clearL) || !isLocked(w)) continue;
      var a = S.nodes[w.a],
        b = S.nodes[w.b];
      if (!a || !b) continue;
      var g = wallGeom(w),
        c = wallCuts(w),
        target = w.clearL + c.a + c.b,
        err = target - g.L;
      if (!fin(err) || Math.abs(err) < CLEAR_TOL || target <= 0) continue;
      // the two sides of this wall, and whether either may move at all
      var sideB = reachFrom(w.b, w),
        sideA = sideB[w.a] ? null : reachFrom(w.a, w); // null => closed loop
      var canB = !sideB[w.a] && !anyPinned(sideB, pin),
        canA = sideA && !anyPinned(sideA, pin);
      var side = null,
        sign = 1;
      if (canB && canA) {
        // both free: slide the smaller side, so the growth happens at the loose
        // end of the plan rather than dragging the bulk of it around
        if (count(sideB) <= count(sideA)) side = sideB;
        else { side = sideA; sign = -1; }
      } else if (canB) side = sideB;
      else if (canA) { side = sideA; sign = -1; }
      else continue; // boxed in on both sides — leave the geometry alone
      var dx = g.ux * err * sign,
        dz = g.uz * err * sign;
      for (var k in side) {
        var n = S.nodes[k];
        if (!n) continue;
        n.x += dx;
        n.z += dz;
      }
      if (Math.abs(err) > worst) worst = Math.abs(err);
    }
    if (worst < CLEAR_TOL) break;
  }
  /* The centreline locks are downstream of the interior ones: a wall that just
     grew 5 cm to keep its inside face where the user put it has not been
     "distorted", so its held measurement is re-read rather than defended. */
  S.walls.forEach(function (w) {
    if ((!only || only[w.id]) && isLocked(w)) captureLock(w);
  });
}
/* ---- relaxation: the repair pass for geometry a rigid slide cannot fix -----

   preserveClear() above slides whole sub-graphs, which is exact and cheap but
   structurally cannot touch a wall inside a CLOSED loop: the far side of that
   wall is reachable without crossing it, so there is nothing to slide. A room
   is a closed loop, so the most ordinary edit there is — thicken one wall of a
   rectangle, or type a new width — left the other three walls holding numbers
   they were no longer measuring, silently.

   This pass fixes that the way a sketcher does: treat every locked wall as two
   constraints on the corner positions — its interior LENGTH and its BEARING —
   and project them one at a time (Gauss-Seidel) until the whole graph agrees.
   Corners of the walls the user is actively editing, and any explicitly pinned
   corner, have infinite mass and never move, so the user's own edit is the
   thing everything else settles around.

   A closed loop can also be genuinely over-constrained — type 500 on one side
   of a 400x300 room and the opposite wall's stated 400 cannot survive, because
   in a rectangle those two are the SAME dimension. Smearing that contradiction
   over every wall (which is what a plain least-squares pass does) leaves the
   whole room holding numbers nobody typed. Instead the pass YIELDS: the wall
   with the worst residual that the user never dimensioned by hand drops out of
   the constraint set, becomes a derived length, and the rest is solved again.
   That is why typing a room's width now widens the room, with the far wall
   following, instead of tearing a corner off it.

   Returns the worst interior-length error still outstanding, so the caller can
   tell "repaired" from "genuinely contradictory" and only release joints for
   the second case. */
const RELAX_ITERS = 300;
const RELAX_RATE = 0.6; // under-relaxation; an over-constrained loop otherwise rings

const NO_RELAX = { worst: 0, yielded: [] };
export function relaxLocks(activeIds, pinnedNodes, allowLockedYield, preventLengthYield) {
  if (!interiorDims()) return NO_RELAX;
  syncClears();
  syncLocks();
  var act = {};
  (activeIds || []).forEach(function (id) { act[id] = 1; });
  var fixed = {};
  (pinnedNodes || []).forEach(function (i) { fixed[i] = 1; });
  S.walls.forEach(function (w) {
    if (act[w.id]) { fixed[w.a] = 1; fixed[w.b] = 1; }
  });
  var connectedNodes = {};
  S.walls.forEach(function (w) {
    if (act[w.id]) { connectedNodes[w.a] = 1; connectedNodes[w.b] = 1; }
  });
  if (activeIds && activeIds.length) {
    var changed = true;
    while (changed) {
      changed = false;
      for (var ci = 0; ci < S.walls.length; ci++) {
        var cw = S.walls[ci];
        if (connectedNodes[cw.a] && !connectedNodes[cw.b]) {
          connectedNodes[cw.b] = 1;
          changed = true;
        } else if (connectedNodes[cw.b] && !connectedNodes[cw.a]) {
          connectedNodes[cw.a] = 1;
          changed = true;
        }
      }
    }
  }
  // only walls that state something, are allowed to hold it, and belong to the active component take part
  var parts = S.walls.filter(function (w) {
    var inConnected = !activeIds || !activeIds.length || connectedNodes[w.a] || connectedNodes[w.b];
    return isLocked(w) && fin(w.clearL) && S.nodes[w.a] && S.nodes[w.b] &&
      !(fixed[w.a] && fixed[w.b]) && inConnected;
  });
  if (!parts.length) return NO_RELAX;

  function moveNode(i, dx, dz) {
    if (fixed[i]) return;
    var n = S.nodes[i];
    if (!n) return;
    n.x += dx;
    n.z += dz;
  }
  /* One Gauss-Seidel solve over the given constraint set; returns the residual.
     wallCuts() walks every wall in the plan to find what stands at a corner, so
     recomputing it inside the sweep made the pass quadratic in the wall count —
     ten seconds on a 60-wall plan. The cuts are a function of the CORNER, not of
     the small axial corrections this loop applies, so they are refreshed every
     few sweeps instead of every one. */
  const CUT_REFRESH = 8;
  function solve(set, freeLen) {
    var worst = 0,
      last = null,
      targets = [];
    for (var it = 0; it < RELAX_ITERS; it++) {
      worst = 0;
      if (it % CUT_REFRESH === 0)
        for (var q = 0; q < set.length; q++) {
          var cq = wallCuts(set[q]);
          targets[q] = set[q].clearL + cq.a + cq.b;
        }
      for (var i = 0; i < set.length; i++) {
        var w = set[i],
          derived = freeLen && freeLen.indexOf(w) !== -1,
          g = wallGeom(w),
          // the node-to-node length at which the interior number comes out right
          target = targets[i];
        if (!fin(target) || target <= 0) continue;
        var err = derived ? 0 : target - g.L;
        if (Math.abs(err) > worst) worst = Math.abs(err);
        var fa = fixed[w.a] ? 0 : 1,
          fb = fixed[w.b] ? 0 : 1,
          sum = fa + fb;
        if (sum && err) {
          // length: pull the two corners apart / together along the wall's axis
          var k = (RELAX_RATE * err) / sum;
          moveNode(w.a, -g.ux * k * fa, -g.uz * k * fa);
          moveNode(w.b, g.ux * k * fb, g.uz * k * fb);
        }
        // bearing: swing the wall back onto the angle it is holding, about
        // whichever end is anchored (or its midpoint when both ends are free)
        if (!fin(w.lockAng) || !sum) continue;
        var g2 = wallGeom(w),
          off = angDelta((w.lockAng * Math.PI) / 180, g2.ang),
          dA = off * RELAX_RATE;
        /* The bearing error counts towards convergence too, as the sideways
           travel it puts on the far end. Measuring only the length error let
           the loop stop on a room that was the right size but a fraction of a
           degree out of square — and that fraction is above the tolerance at
           which enforceLocks() calls a wall distorted, so the corner was
           released immediately afterwards. */
        if (Math.abs(off) * g2.L > worst) worst = Math.abs(off) * g2.L;
        if (Math.abs(dA) < 1e-9) continue;
        var px = fa && fb ? (g2.a.x + g2.b.x) / 2 : fa ? g2.b.x : g2.a.x,
          pz = fa && fb ? (g2.a.z + g2.b.z) / 2 : fa ? g2.b.z : g2.a.z,
          cs = Math.cos(dA),
          sn = Math.sin(dA);
        swing(w.a, px, pz, cs, sn);
        swing(w.b, px, pz, cs, sn);
      }
      if (worst < CLEAR_TOL) break;
      /* Stop early when the sweeps stop buying anything. An over-constrained
         loop never reaches the tolerance, and grinding out the full iteration
         budget for it (once per candidate the yield search tries) is what the
         user would feel as a stutter on every typed dimension. */
      if (it >= 40 && it % CUT_REFRESH === CUT_REFRESH - 1) {
        if (last != null && Math.abs(last - worst) < 1e-4) break;
        last = worst;
      }
    }
    return worst;
  }
  function swing(idx, px, pz, cs, sn) {
    var n = S.nodes[idx];
    if (!n || fixed[idx]) return;
    var rx = n.x - px,
      rz = n.z - pz;
    moveNode(idx, rx * cs - rz * sn - rx, rx * sn + rz * cs - rz);
  }
  function residual(w) {
    var c = wallClearLength(w);
    return fin(c) ? Math.abs(c - w.clearL) : 0;
  }

  /* Every attempt starts from the same geometry. Solving again on top of a
     failed solve bakes that failure's skew into the next one, which is how the
     first version turned a contradictory room into a trapezoid. */
  var start = snapshotNodes();
  function restart() {
    for (var i = 0; i < start.length; i++) {
      if (start[i] && S.nodes[i]) {
        S.nodes[i].x = start[i].x;
        S.nodes[i].z = start[i].z;
      }
    }
  }
  /* Which wall pays when the loop is over-constrained. A length constraint can
     only fight another length along the SAME direction — in a rectangle the
     wall opposite the one being edited states the same dimension from the other
     side — so the most nearly parallel derived wall is the one that yields.
     Walls the user dimensioned by hand are never sacrificed: if only those are
     left in conflict the caller gets a non-zero residual and falls back to
     releasing the joint, which is the documented rule. */
  var axis = null;
  S.walls.forEach(function (w) {
    if (!axis && act[w.id] && S.nodes[w.a] && S.nodes[w.b]) axis = wallGeom(w);
  });
  function parallelism(w) {
    if (!axis) return 0;
    var g = wallGeom(w);
    return Math.abs(g.ux * axis.ux + g.uz * axis.uz);
  }
  var worst = solve(parts),
    yielded = [];
  for (var guard = 0; !preventLengthYield && guard < parts.length && worst >= LOCK_TOL_L; guard++) {
    var victim = null,
      best = -1;
    parts.forEach(function (w) {
      if (w.dimUser || yielded.indexOf(w) !== -1) return;
      if (residual(w) < CLEAR_TOL && parallelism(w) < 0.999) return;
      var score = parallelism(w) * 1000 + Math.min(residual(w), 999);
      if (score > best) { best = score; victim = w; }
    });
    if (!victim) break;
    yielded.push(victim);
    restart();
    worst = solve(parts, yielded);
  }
  // Tier 2: If derived-only yields did not satisfy the loop and locked yields are permitted (e.g. squaring)
  if (worst >= LOCK_TOL_L && allowLockedYield) {
    for (var guard2 = 0; guard2 < parts.length && worst >= LOCK_TOL_L; guard2++) {
      var victim2 = null,
        best2 = -1;
      parts.forEach(function (w) {
        if (yielded.indexOf(w) !== -1) return;
        if (residual(w) < CLEAR_TOL && parallelism(w) < 0.999) return;
        var score = parallelism(w) * 1000 + Math.min(residual(w), 999);
        if (score > best2) { best2 = score; victim2 = w; }
      });
      if (!victim2) break;
      yielded.push(victim2);
      restart();
      worst = solve(parts, yielded);
    }
  }
  if (worst >= LOCK_TOL_L && yielded.length) {
    // nothing worked; leave the plan on the plain attempt rather than on the
    // last, most-yielded one, and let the caller release the joint
    yielded.length = 0;
    restart();
    worst = solve(parts);
  }
  /* Whatever geometry the graph settled on IS the new truth for every wall that
     got there — those walls were not distorted, they were put back on their
     stated interior dimension. A yielded wall's length was derived all along,
     so it simply re-reads what it now measures. */
  yielded.forEach(captureClear);
  var okIds = yielded.map(function (w) { return w.id; });
  if (worst < LOCK_TOL_L) {
    parts.forEach(function (w) {
      if (residual(w) < LOCK_TOL_L) {
        var g = wallGeom(w);
        var angMatch = !fin(w.lockAng) || Math.abs(angDelta((w.lockAng * Math.PI) / 180, g.ang)) < LOCK_TOL_A;
        if (angMatch) {
          captureLock(w);
          if (okIds.indexOf(w.id) === -1) okIds.push(w.id);
        }
      }
    });
  }
  return {
    worst: worst,
    yielded: okIds,
  };
}

function anyPinned(set, pin) {
  for (var k in set) if (pin[k]) return true;
  return false;
}
function count(set) {
  var n = 0;
  for (var k in set) n++;
  return n;
}

/* ---- validation --------------------------------------------------------- */

/* Warnings are keyed by things that survive an edit. Node indices do NOT (they
   are array slots, reused and welded away), so an open end is keyed by its WALL
   plus which end it is, and a bad joint by the PAIR of wall ids meeting there —
   wall ids come from the same monotonic counter as everything else and are
   stable for the life of the wall. That is what lets "ignore this one warning"
   survive further editing instead of silently coming back. */
export function isIgnored(key) {
  return !!(S.ignoredWarnings && S.ignoredWarnings[key]);
}
export function ignoreWarning(key) {
  if (!S.ignoredWarnings) S.ignoredWarnings = {};
  S.ignoredWarnings[key] = 1;
}
export function unignoreWarning(key) {
  if (S.ignoredWarnings) delete S.ignoredWarnings[key];
}
export function clearIgnored() {
  S.ignoredWarnings = {};
}

var warnCache = { sig: "", list: [] };
function signature() {
  var out = S.walls.length + "/" + S.nodes.length;
  S.walls.forEach(function (w) {
    var a = S.nodes[w.a],
      b = S.nodes[w.b];
    if (!a || !b) return;
    out +=
      ";" + w.id + "," + a.x.toFixed(2) + "," + a.z.toFixed(2) + "," +
      b.x.toFixed(2) + "," + b.z.toFixed(2);
  });
  out += "|c:" + JSON.stringify(S.wallCons || []);
  return out;
}

function anchorMatchesNode(an, ni) {
  if (!an) return false;
  if (an.k === "node") return !!S.nodes[ni] && S.nodes[ni].vid === an.id;
  if (an.k === "wall") {
    var w = S.walls.find(function (q) { return q.id === an.id; });
    return !!w && (an.end === "b" ? w.b : w.a) === ni;
  }
  return false;
}
function sectorDeclaresPair(sec, ni, a, b) {
  if (!sec || !anchorMatchesNode(sec.joint, ni)) return false;
  return (sec.w1 === a && sec.w2 === b) || (sec.w1 === b && sec.w2 === a);
}
function explicitAnglePair(ni, a, b) {
  return (S.wallCons || []).some(function (c) {
    if (!c || c.off) return false;
    if (c.type === "angle")
      return anchorMatchesNode(c.joint, ni) &&
        ((c.w1 === a && c.w2 === b) || (c.w1 === b && c.w2 === a));
    if (c.type === "equalAngle")
      return sectorDeclaresPair(c.referenceAngle, ni, a, b) ||
        sectorDeclaresPair(c.drivenAngle, ni, a, b);
    return false;
  });
}

/* Every geometric complaint the engine has about the wall graph, ignored ones
   included (they carry `ignored:true` so the panel can list them separately).
   Two kinds:
     openEnd — a wall end that meets no other wall. Either it was never joined,
               or a locked neighbour let go of it during an edit.
     angle   — two walls meeting at anything other than a right angle. A
               straight run (180°, i.e. a wall that was split in two) is a
               continuation, not a corner, so it is not flagged. */
export function jointWarnings() {
  var sig = signature();
  // The cache is keyed on GEOMETRY only. Acknowledging a warning changes no
  // geometry, so the flag has to be re-stamped on every read or an "ignore"
  // would not take effect until the next time a wall moved.
  if (warnCache.sig === sig) return stampIgnored(warnCache.list);
  var list = [];

  // walls per corner, as outgoing directions
  var at = {};
  S.walls.forEach(function (w) {
    var a = S.nodes[w.a],
      b = S.nodes[w.b];
    if (!a || !b) return;
    var ang = Math.atan2(b.z - a.z, b.x - a.x);
    (at[w.a] = at[w.a] || []).push({ w: w, end: "a", ang: ang });
    (at[w.b] = at[w.b] || []).push({
      w: w,
      end: "b",
      ang: ang + (ang > 0 ? -Math.PI : Math.PI),
    });
  });

  Object.keys(at).forEach(function (k) {
    var ni = +k,
      arms = at[k],
      n = S.nodes[ni];
    if (!n) return;
    if (arms.length === 1) {
      var arm = arms[0];
      // A loose end sitting ON another wall reads very differently from one out
      // in the open — it is almost always a joint that let go — so say which.
      var near = nearOtherWall(n.x, n.z, arm.w.id);
      list.push({
        key: "end:" + arm.w.id + ":" + arm.end,
        kind: "openEnd",
        near: near,
        x: n.x,
        z: n.z,
        node: ni,
        walls: [arm.w.id],
      });
      return;
    }
    // angles between neighbouring arms, walking the fan once
    arms = arms.slice().sort(function (p, q) {
      return p.ang - q.ang;
    });
    var seen = {};
    for (var i = 0; i < arms.length; i++) {
      var p = arms[i],
        q = arms[(i + 1) % arms.length];
      if (p.w.id === q.w.id) continue; // a 2-arm corner yields the pair twice
      var lo = Math.min(p.w.id, q.w.id),
        hi = Math.max(p.w.id, q.w.id),
        pk = lo + "-" + hi;
      if (seen[pk]) continue;
      seen[pk] = 1;
      var d = Math.abs((angDelta(q.ang, p.ang) * 180) / Math.PI);
      if (Math.abs(d - 90) <= ANGLE_TOL) continue; // square
      if (Math.abs(d - 180) <= ANGLE_TOL) continue; // straight run, not a corner
      if (explicitAnglePair(ni, p.w.id, q.w.id)) continue; // deliberate angle
      list.push({
        key: "ang:" + pk,
        kind: "angle",
        angle: d,
        x: n.x,
        z: n.z,
        node: ni,
        walls: [p.w.id, q.w.id],
      });
    }
  });

  list.sort(function (a, b) {
    if (a.kind !== b.kind) return a.kind === "openEnd" ? -1 : 1;
    return a.key < b.key ? -1 : 1;
  });
  warnCache = { sig: sig, list: list };
  return stampIgnored(list);
}
function stampIgnored(list) {
  list.forEach(function (wr) {
    wr.ignored = isIgnored(wr.key);
  });
  return list;
}

/* The ones that still glow. */
export function activeWarnings() {
  return jointWarnings().filter(function (w) {
    return !w.ignored;
  });
}
export function warningByKey(key) {
  var l = jointWarnings();
  for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i];
  return null;
}
/* Prune ignore entries whose element is gone for good, so the "ignored" list
   does not fill up with the ghosts of deleted walls. Runs where the rest of the
   post-edit repairs run. */
export function pruneIgnored() {
  if (!S.ignoredWarnings) return;
  var live = {};
  S.walls.forEach(function (w) {
    live[w.id] = 1;
  });
  Object.keys(S.ignoredWarnings).forEach(function (k) {
    var ids = k.replace(/^(end|ang):/, "").split(/[:\-]/);
    for (var i = 0; i < ids.length; i++) {
      var id = +ids[i];
      if (fin(id) && String(id) === ids[i] && !live[id]) {
        delete S.ignoredWarnings[k];
        return;
      }
    }
  });
}

/* Is there another wall right under this point? Used only to word an open-end
   warning ("let go of that wall" vs "nothing here"). */
function nearOtherWall(x, z, skipId) {
  var best = null;
  S.walls.forEach(function (w) {
    if (w.id === skipId) return;
    var g = wallGeom(w);
    var t = ((x - g.a.x) * g.ux + (z - g.a.z) * g.uz) / g.L;
    if (t < -0.02 || t > 1.02) {
      // an endpoint of that wall counts too
      var d0 = Math.hypot(x - g.a.x, z - g.a.z),
        d1 = Math.hypot(x - g.b.x, z - g.b.z);
      var dd = Math.min(d0, d1);
      if (dd < 30 && (!best || dd < best.d)) best = { d: dd, id: w.id };
      return;
    }
    var px = g.a.x + g.ux * g.L * t,
      pz = g.a.z + g.uz * g.L * t,
      d = Math.hypot(x - px, z - pz);
    if (d < 30 && (!best || d < best.d)) best = { d: d, id: w.id };
  });
  return best;
}

/* Nearest warning glyph to a world point, for hover/pick in the plan. */
export function hitWarning(px, pz, thr) {
  var list = activeWarnings(),
    best = null,
    bd = thr;
  list.forEach(function (w) {
    var d = Math.hypot(px - w.x, pz - w.z);
    if (d < bd) {
      bd = d;
      best = w;
    }
  });
  return best;
}

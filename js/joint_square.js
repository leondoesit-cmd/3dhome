import { S, fin } from "./state.js";
import { wallGeom, nodeDegree } from "./geometry.js";
import { pinnedNodes } from "./wall_constraints.js";

/* Squaring a corner is two decisions, and only the second one is geometry:
   WHICH arm swings, and where it lands. The choice lives here, next to the
   placement and away from the DOM, because it is the half that decides whether
   the result looks right — and because it is the half worth testing. */

var SQUARE_TOL = 0.05, // degrees: what already reads as square on the plan
  STRAIGHT_TOL = 0.5; // degrees: what counts as a run passing straight through

/* How far a bearing sits from the nearest 90° of the plan's own grid. */
function offAxis(deg) {
  var m = ((deg % 90) + 90) % 90;
  return m > 45 ? 90 - m : m;
}
/* Unsigned angle between two bearings, 0..180. */
function between(p, q) {
  var d = Math.abs(p - q) % 360;
  return d > 180 ? 360 - d : d;
}

/* Which of two candidate arms should be the one that swings. Negative means
   `a` swings; the caller keeps the first arm on a tie, so the answer does not
   depend on the order jointInfo happened to sort the arms in.

   The first rule is the one that matters. An arm that is ALREADY square to the
   plan's grid is a statement of intent — somebody drew that wall straight — so
   the crooked arm is the one that moves. Without this the picker took whichever
   free-ended arm sorted first by bearing, which on half of all L-corners meant
   squaring the corner by skewing the wall that was already right: the corner
   read 90°, and nothing in the plan was on-axis any more.

   Only once neither arm (or both) is on-axis does cheapness decide: the freer
   far end first (moving it drags least of the plan behind it), then a wall
   whose length nobody typed, then whichever sits further off the grid. */
function swingFirst(a, b) {
  var oa = offAxis(a.ang),
    ob = offAxis(b.ang),
    aSq = oa < SQUARE_TOL,
    bSq = ob < SQUARE_TOL;
  if (aSq !== bSq) return aSq ? 1 : -1;
  var da = nodeDegree(a.other),
    db = nodeDegree(b.other);
  if (da !== db) return da - db;
  var ua = a.wall.dimUser ? 1 : 0,
    ub = b.wall.dimUser ? 1 : 0;
  if (ua !== ub) return ua - ub;
  if (Math.abs(oa - ob) > 1e-9) return ob - oa;
  return 0;
}

/* The arm the swinging one is squared AGAINST: the nearest bearing that is not
   its own straight continuation. A run through the corner is not a corner. */
function keepArm(arms, move) {
  var best = null,
    bestD = Infinity;
  arms.forEach(function (a) {
    if (a === move) return;
    var d = between(a.ang, move.ang);
    if (Math.abs(d - 180) < STRAIGHT_TOL) return;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  });
  return best;
}

/* Which arm "square it" is allowed to swing, and against what.

   Two arms never move: one that carries a straight run through this corner
   (swinging it would break the run to fix the branch — the T-junction case),
   and one whose far endpoint is pinned. A pin is never silently defeated, and
   the shared joint itself is always the pivot, so fixing one gap can never
   spoil another angle at the same corner.

   `only` restricts the answer to a named pair of wall ids — the warning panel
   fixes the exact two walls its message is about — and everything else applies
   to that pair unchanged. It used to have its own, looser rule, so the same
   corner could be squared two different ways depending on which button was
   pressed.

   Returns null when there is nothing to square or nothing that may move, and
   the corner inspector disables the button on exactly that answer. */
export function squarableArm(info, only) {
  if (!info || info.arms.length < 2) return null;
  var pins = pinnedNodes(),
    arms = info.arms,
    gaps = info.gaps;

  if (only && only.length) {
    arms = info.arms.filter(function (a) {
      return only.indexOf(a.wall.id) !== -1;
    });
    if (arms.length !== 2) return null;
    gaps = [{ deg: between(arms[0].ang, arms[1].ang) }];
  }

  // 1. nothing to fix: every gap already reads square, or straight through
  var pending = gaps.some(function (g) {
    return !(
      Math.abs(g.deg - 90) < SQUARE_TOL ||
      Math.abs(g.deg - 270) < SQUARE_TOL ||
      Math.abs(g.deg - 180) < SQUARE_TOL
    );
  });
  if (!pending) return null;

  /* 2. what may move at all. Straightness is a property of the whole corner,
     so it is read from every arm meeting there even when the caller named a
     pair: the third arm of a T is why the other two must hold still. */
  var cand = arms.filter(function (a) {
    if (pins[a.other]) return false;
    return !info.arms.some(function (b) {
      return b !== a && Math.abs(between(a.ang, b.ang) - 180) < STRAIGHT_TOL;
    });
  });
  if (!cand.length) return null;

  // 3. of those, the one that should
  var move = cand.reduce(function (best, a) {
    return swingFirst(a, best) < 0 ? a : best;
  });
  var keep = keepArm(arms, move);
  return keep ? { move: move, keep: keep } : null;
}

/* Put one arm of a joint exactly perpendicular to the arm that stays.

   The shared joint is always the pivot. Moving it would also move every other
   arm meeting there, so fixing one gap could spoil another angle. This follows
   the original local-edit rule: only an endpoint of a wall that CREATES the
   chosen angle may move. If that endpoint is pinned, the operation is not
   available; a pin must never be silently defeated by moving the joint. */
export function placeSquareArm(ni, pick, pins) {
  if (!pick || !pick.move || !pick.keep) return null;
  var joint = S.nodes[ni],
    farIndex = pick.move.other,
    far = S.nodes[farIndex];
  if (!joint || !far) return null;

  pins = pins || {};
  if (pins[farIndex]) return null;

  var L = Math.hypot(far.x - joint.x, far.z - joint.z);
  if (!fin(L) || L < 1e-4) return null;
  var base = (pick.keep.ang * Math.PI) / 180,
    cur = (pick.move.ang * Math.PI) / 180,
    rel = cur - base;
  while (rel <= -Math.PI) rel += 2 * Math.PI;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  var target = base + (rel >= 0 ? Math.PI / 2 : -Math.PI / 2);

  far.x = joint.x + Math.cos(target) * L;
  far.z = joint.z + Math.sin(target) * L;

  var gm = wallGeom(pick.move.wall),
    targetDeg = (gm.ang * 180) / Math.PI;
  while (targetDeg < 0) targetDeg += 360;
  return {
    movedEnd: pick.move.end === "a" ? "b" : "a",
    targetDeg: targetDeg % 360,
  };
}

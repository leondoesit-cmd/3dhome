/* Align and distribute for a multi-item selection.
   ---------------------------------------------------------------------------
   Dragging a piece has snapped to other pieces' edges and centres for a long
   time (alignItem in interaction.js), which is the right tool for placing ONE
   thing. It is the wrong tool for six: each drag only sees the piece in your
   hand, so a row of chairs comes out aligned in pairs and drifting overall,
   and there is no gesture at all for "spread these evenly".

   Two rules, both chosen to match what every other editor does, because this
   is a place where matching expectation matters more than being clever:

   1. ALIGN MOVES EVERYTHING TO THE FIRST SELECTED PIECE. Not to the bounding
      box, not to the average — to the one you picked first. That makes the
      result predictable before you click, and it gives the user a way to
      choose the target (pick it first) instead of guessing what the editor
      will decide.
   2. DISTRIBUTE HOLDS THE TWO EXTREMES AND SPREADS THE REST. Nothing at the
      ends moves, so distributing twice is a no-op rather than a slow crawl
      across the plan.

   Rotation is aligned too ("same rotation"), because a row of chairs at
   subtly different angles is the most common thing that looks wrong in a
   render and the hardest to spot in plan. */
import { S } from "./state.js";
import { wallById, wallGeom } from "./geometry.js";

/* The axis-aligned half-size of a piece's footprint, taking its rotation into
   account — the same measure the drag snap uses, so an aligned edge and a
   snapped edge mean the same thing. */
export function halfSpan(it) {
  var w = Number(it.w) || 0,
    d = Number(it.d) || 0,
    a = ((Number(it.rot) || 0) * Math.PI) / 180,
    c = Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a));
  return { hx: c * (w / 2) + s * (d / 2), hz: s * (w / 2) + c * (d / 2) };
}

/* One entry per verb. Each returns the NEW centre coordinate for `it`, given
   the piece being aligned to. Written as a table so a new alignment is one
   line rather than another branch in a growing conditional. */
var ALIGN = {
  left: function (it, ref) {
    return { x: refEdge(ref, "x", -1) + halfSpan(it).hx };
  },
  right: function (it, ref) {
    return { x: refEdge(ref, "x", 1) - halfSpan(it).hx };
  },
  centerX: function (it, ref) {
    return { x: ref.x };
  },
  top: function (it, ref) {
    return { z: refEdge(ref, "z", -1) + halfSpan(it).hz };
  },
  bottom: function (it, ref) {
    return { z: refEdge(ref, "z", 1) - halfSpan(it).hz };
  },
  centerZ: function (it, ref) {
    return { z: ref.z };
  },
};
function refEdge(ref, axis, sign) {
  var h = halfSpan(ref);
  return (axis === "x" ? ref.x : ref.z) + sign * (axis === "x" ? h.hx : h.hz);
}

/* Align `items` to the first of them. Returns how many actually moved, so the
   caller can skip the history entry and the re-render when nothing changed. */
export function alignItems(items, how) {
  var fn = ALIGN[how];
  if (!fn || !items || items.length < 2) return 0;
  var ref = items[0],
    moved = 0;
  items.slice(1).forEach(function (it) {
    if (it.locked) return; // a locked piece is not moved by anything
    var next = fn(it, ref);
    if (next.x != null && Math.abs(next.x - it.x) > 1e-6) {
      it.x = next.x;
      moved++;
    } else if (next.z != null && Math.abs(next.z - it.z) > 1e-6) {
      it.z = next.z;
      moved++;
    }
  });
  return moved;
}

/* Even gaps along one axis. The two extreme pieces stay exactly where they
   are and the rest are spread between them — measured CENTRE to centre, which
   is what reads as even when the pieces are the same size, and what a
   furniture run almost always is.

   Fewer than three pieces has no interior to distribute, so it is refused
   rather than silently doing nothing. */
export function distributeItems(items, axis) {
  if (!items || items.length < 3) return 0;
  var key = axis === "z" ? "z" : "x";
  var rows = items
    .filter(function (it) { return !it.locked; })
    .slice()
    .sort(function (a, b) { return a[key] - b[key]; });
  if (rows.length < 3) return 0;
  var first = rows[0][key],
    last = rows[rows.length - 1][key],
    step = (last - first) / (rows.length - 1),
    moved = 0;
  for (var i = 1; i < rows.length - 1; i++) {
    var want = first + step * i;
    if (Math.abs(rows[i][key] - want) < 1e-6) continue;
    rows[i][key] = want;
    moved++;
  }
  return moved;
}

/* Give every selected piece the first one's rotation. */
export function matchRotation(items) {
  if (!items || items.length < 2) return 0;
  var rot = Number(items[0].rot) || 0,
    moved = 0;
  items.slice(1).forEach(function (it) {
    if (it.locked || (Number(it.rot) || 0) === rot) return;
    it.rot = rot;
    moved++;
  });
  return moved;
}

/* ---- persistent item relations ------------------------------------------
   Aligning is an EDIT: it happens once and the pieces stay where they were
   put. That is right for a row of chairs and wrong for a kitchen run, which
   has to stay flush to its wall when the wall moves. These are the relations
   that keep holding, stored on the item itself rather than in S.wallCons —
   an item relation names an item and a wall, which is not the corner-anchor
   shape the wall constraints are built around, and giving it a fake anchor
   would break the "anchors are never indices" rule that file depends on.

   `it.hold = {wall:<id>, gap:<cm>}` — keep this piece's back face `gap` from
   that wall's face, at whatever position along the wall it currently sits. */
export function holdToWall(it, wall, gap) {
  if (!it || !wall) return false;
  var g = wallGeom(wall);
  /* WHICH SIDE of the wall the piece is on is recorded now, not recomputed
     later. Deriving it from the piece's current position each time meant that
     a wall dragged PAST its own furniture flipped the piece round to the near
     face — the sofa jumped through the wall to the far room instead of being
     pushed along with it. The parallel-offset constraint learned exactly this
     (see addOffset's signed value): the side is part of the statement, not
     something to re-observe. */
  var side = g && isFinite(g.L) && g.L > 0
    ? ((it.x - g.a.x) * -g.uz + (it.z - g.a.z) * g.ux >= 0 ? 1 : -1)
    : 1;
  it.hold = { wall: wall.id, gap: Number(gap) || 0, side: side };
  return true;
}
export function releaseHold(it) {
  if (!it || !it.hold) return false;
  delete it.hold;
  return true;
}

/* Re-seat every held piece against its wall. Called after the plan's geometry
   settles, for the same reason solveWallCons is: a piece that was flush before
   the wall moved must be flush after it. A piece whose wall is gone quietly
   releases — a hold that points at nothing is worse than no hold, because it
   would keep reporting about geometry the user cannot see. */
export function reseatHeldItems() {
  var moved = 0;
  (S.items || []).forEach(function (it) {
    if (!it || !it.hold) return;
    var w = wallById(it.hold.wall);
    if (!w) {
      delete it.hold;
      return;
    }
    var g = wallGeom(w);
    if (!g || !isFinite(g.L) || g.L <= 0) return;
    // where the piece sits ALONG the wall is left alone; only its distance
    // from the wall is restored, which is what "flush" actually means
    var along = (it.x - g.a.x) * g.ux + (it.z - g.a.z) * g.uz;
    var nx = -g.uz,
      nz = g.ux;
    // recorded when the hold was made — see holdToWall
    var side = it.hold.side === -1 ? -1 : 1;
    var h = halfSpan(it),
      off =
        (Number(w.thickness) || 0) / 2 +
        (h.hx * Math.abs(nx) + h.hz * Math.abs(nz)) +
        (Number(it.hold.gap) || 0);
    var wantX = g.a.x + g.ux * along + nx * side * off,
      wantZ = g.a.z + g.uz * along + nz * side * off;
    if (Math.hypot(wantX - it.x, wantZ - it.z) < 1e-6) return;
    it.x = wantX;
    it.z = wantZ;
    moved++;
  });
  return moved;
}

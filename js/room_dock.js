/* Where a room being dragged wants to land.
 *
 * Dragging a rectangle around a plan and asking the user to line it up by eye
 * is the part that never works: a fifth of a centimetre of misalignment leaves
 * two walls a hair apart, and instead of one party wall with a door in it you
 * get a slot of dead space that the face trace reads as a third room.
 *
 * So the drag does not place the rectangle where the pointer is. It asks this
 * module, on every move, where the rectangle WANTS to be, and there are only
 * ever two answers worth offering:
 *
 *   abut     — its edge lands exactly on an existing wall's centreline, so the
 *              two rooms end up sharing that one wall. The connection is then a
 *              door cut through it.
 *   corridor — it stops a corridor's width short, and the gap between them is
 *              filled with a circulation space open at both ends.
 *
 * Both also snap ALONG the wall, so the new room's corner lines up with the
 * neighbour's corner (or their centres line up) rather than landing 4 cm off.
 * That secondary snap is weaker than the face snap and never overrides it:
 * being flush is what makes the plan buildable, being aligned only makes it
 * tidy.
 *
 * Nothing here mutates anything. It reads the drawing and returns an offset.
 */

const DEFAULTS = Object.freeze({
  snap: 60,        // cm — how far a face reaches for a wall to lie against
  align: 45,       // cm — how far a corner reaches to line up along that wall
  minOverlap: 60,  // cm — less shared face than this is not a party wall
  corridor: 120,   // cm — clear width of the corridor the gap mode leaves
  /* How near the corridor's own width the gap has to be before the corridor
     mode is offered at all — and it is deliberately much tighter than `snap`.
     Sharing the face tolerance meant any gap from 60 to 180 cm proposed a
     corridor, so parking a room a metre and a half away from a wall invented a
     hall nobody asked for. Building a whole extra room is the most opinionated
     thing this solver can do; it should happen when the gesture is unmistakably
     "leave a corridor here", not whenever a room is loosely nearby. */
  corridorSnap: 35,
  corridorPenalty: 30, // abutting wins ties; a corridor is the deliberate choice
});

function axisOf(a, b, tol) {
  if (Math.abs(a.z - b.z) <= tol && Math.abs(a.x - b.x) > tol) return "h";
  if (Math.abs(a.x - b.x) <= tol && Math.abs(a.z - b.z) > tol) return "v";
  return null; // oblique walls are not dock targets: there is no flush answer
}

/* Every axis-aligned wall centreline in the drawing, as a face a room can be
   laid against. Walls are the target rather than rooms so that a single drawn
   wall, or the straight side of an L-shaped room, works the same way. */
export function dockFaces(state, options) {
  const tol = (options && options.tol) || 2;
  const skip = (options && options.skipWalls) || null;
  const faces = [];
  state.walls.forEach((w) => {
    if (skip && skip.has(w.id)) return;
    if (w.geometry && w.geometry.type === "arc") return;
    const a = state.nodes[w.a], b = state.nodes[w.b];
    if (!a || !b) return;
    const axis = axisOf(a, b, tol);
    if (!axis) return;
    faces.push(axis === "v"
      ? { axis: "v", at: (a.x + b.x) / 2, lo: Math.min(a.z, b.z), hi: Math.max(a.z, b.z), wall: w.id }
      : { axis: "h", at: (a.z + b.z) / 2, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x), wall: w.id });
  });
  return faces;
}

/* The along-the-wall snap: corner to corner, or centre to centre. Returns the
   smallest shift within tolerance, or 0 — never a shift that would be worse
   than leaving the room where the pointer put it. */
function alignShift(lo, hi, faceLo, faceHi, tol) {
  const candidates = [
    faceLo - lo, faceHi - hi,              // flush at either end
    faceLo - hi, faceHi - lo,              // just touching, end to end
    (faceLo + faceHi) / 2 - (lo + hi) / 2, // centred on the neighbour
  ];
  let best = 0, bestAbs = Infinity;
  candidates.forEach((d) => {
    const abs = Math.abs(d);
    if (abs <= tol && abs < bestAbs) { best = d; bestAbs = abs; }
  });
  return best;
}

function overlapOf(lo, hi, faceLo, faceHi) {
  return Math.min(hi, faceHi) - Math.max(lo, faceLo);
}

/* rect is the moving room's CENTRELINE rectangle at the pointer. Returns the
   winning proposal, or null when the room is out on its own — in which case
   the caller places it exactly where the pointer is (grid snapping still
   applies; that is the plan's business, not this module's). */
export function solveDock(state, rect, options) {
  const opts = Object.assign({}, DEFAULTS, options || {});
  const faces = opts.faces || dockFaces(state, opts);
  let best = null;

  faces.forEach((face) => {
    const across = face.axis === "v"
      ? { lo: rect.x0, hi: rect.x1 } : { lo: rect.z0, hi: rect.z1 };
    const along = face.axis === "v"
      ? { lo: rect.z0, hi: rect.z1 } : { lo: rect.x0, hi: rect.x1 };

    // four ways to meet this face: flush on either side, or a corridor short of it
    const proposals = [
      { d: face.at - across.hi, mode: "abut", side: -1 },
      { d: face.at - across.lo, mode: "abut", side: 1 },
      { d: face.at - across.hi - opts.corridor, mode: "corridor", side: -1 },
      { d: face.at - across.lo + opts.corridor, mode: "corridor", side: 1 },
    ];

    proposals.forEach((p) => {
      // a drag of a room that already exists asks only "where does this go
      // flush?" — a corridor there would be a room appearing mid-gesture
      if (p.mode === "corridor" && opts.abutOnly) return;
      if (Math.abs(p.d) > (p.mode === "corridor" ? opts.corridorSnap : opts.snap)) return;
      const shift = alignShift(along.lo, along.hi, face.lo, face.hi, opts.align);
      const overlap = overlapOf(along.lo + shift, along.hi + shift, face.lo, face.hi);
      if (overlap < opts.minOverlap) return;
      const cost = Math.abs(p.d) + 0.6 * Math.abs(shift)
        + (p.mode === "corridor" ? opts.corridorPenalty : 0);
      if (best && cost >= best.cost) return;
      best = {
        cost,
        mode: p.mode,
        side: p.side,
        axis: face.axis,
        hostWall: face.wall,
        overlap,
        gap: p.mode === "corridor" ? opts.corridor : 0,
        dx: face.axis === "v" ? p.d : shift,
        dz: face.axis === "v" ? shift : p.d,
        face,
      };
    });
  });
  return best;
}

export function translateRect(rect, dx, dz) {
  return { x0: rect.x0 + dx, z0: rect.z0 + dz, x1: rect.x1 + dx, z1: rect.z1 + dz };
}

/* The corridor a "corridor" dock implies: the strip between the room's face
   and the wall it stopped short of, spanning only the part of the two that
   actually face each other. It is returned in centreline coordinates like
   everything else, so its two long walls land exactly on the room's face and
   on the host wall — meaning the corridor SHARES a wall with each of them and
   both connections are a passage cut through a wall that already exists. */
export function corridorRect(rect, dock) {
  if (!dock || dock.mode !== "corridor") return null;
  const face = dock.face;
  if (dock.axis === "v") {
    const lo = Math.max(rect.z0, face.lo), hi = Math.min(rect.z1, face.hi);
    if (hi - lo <= 0) return null;
    return dock.side < 0
      ? { x0: rect.x1, x1: face.at, z0: lo, z1: hi }
      : { x0: face.at, x1: rect.x0, z0: lo, z1: hi };
  }
  const lo = Math.max(rect.x0, face.lo), hi = Math.min(rect.x1, face.hi);
  if (hi - lo <= 0) return null;
  return dock.side < 0
    ? { z0: rect.z1, z1: face.at, x0: lo, x1: hi }
    : { z0: face.at, z1: rect.z0, x0: lo, x1: hi };
}

export const DOCK_DEFAULTS = DEFAULTS;

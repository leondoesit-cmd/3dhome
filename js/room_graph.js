/* Stamping a room into the wall graph, and taking a wall back out again.
 *
 * The plan has no stored "room" entity: a room is a cycle of walls that
 * geometry.js finds by tracing half-edge faces (detectRoomCycles). That is the
 * right model — it is why erasing one wall between two rooms simply IS the
 * merged room, with no bookkeeping to keep in step — but it puts one hard
 * requirement on anything that adds geometry: what it leaves behind must be a
 * PLANAR graph. Two walls may touch only at a shared node, never cross in the
 * middle of each other and never lie on top of one another. A rectangle
 * dropped carelessly on top of an existing plan breaks all three of those, and
 * the symptom is not a crash — it is a room that silently stops being
 * detected, so the floor vanishes and the name goes with it.
 *
 * So stampRect() is not "push four walls". It is:
 *
 *   1. resolve each corner  — reuse a node that is already there, or split the
 *      wall the corner lands in the middle of, or make a new node;
 *   2. cut each new edge at every node and every existing wall it crosses, so
 *      the edge arrives as a chain of sub-segments that meet the rest of the
 *      drawing only at nodes;
 *   3. build the sub-segments that are missing, and RECOGNISE the ones that
 *      already exist. A sub-segment that is already a wall is the party wall
 *      between the new room and its neighbour — the whole point of docking —
 *      and building a second wall on top of it would give two coincident walls,
 *      a zero-area sliver face between them, and no shared wall to put a door
 *      in.
 *
 * Splitting an existing wall re-homes what rides it (openings by station, and
 * whatever else the planner tracks parametrically), which the planner knows
 * how to do and this module does not. So the split is an injected service with
 * a deliberately plain fallback, the same shape js/commands/wall_draw.js uses:
 * headless callers get correct topology, the app gets correct topology AND
 * correct openings.
 *
 * Coordinates here are CENTRELINE coordinates — what S.nodes holds. Interior
 * sizes belong to js/room_presets.js and are converted before anything reaches
 * this file.
 */

const TOL = 2; // cm — the same welding tolerance the layout generator uses
const PARAM_EPS = 1e-4;

function dist(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

/* Where does p fall on segment a->b? Returns null when it is not on it.
   `t` is the normalised station; `interior` says the hit is strictly between
   the ends, which is the only case that forces a split. */
export function pointOnSegment(p, a, b, tol) {
  const eps = tol == null ? TOL : tol;
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return null;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2;
  const px = a.x + t * dx, pz = a.z + t * dz;
  if (dist(px, pz, p.x, p.z) > eps) return null;
  const len = Math.sqrt(len2);
  if (t < -eps / len || t > 1 + eps / len) return null;
  return { t, x: px, z: pz, interior: t > eps / len && t < 1 - eps / len };
}

/* Proper crossing of two straight segments — the transversal case only.
   Collinear overlap deliberately returns null: that is not a crossing to cut,
   it is a shared wall, and step 3 resolves it by node identity instead. */
export function segmentCross(a, b, c, d, tol) {
  const eps = tol == null ? TOL : tol;
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null; // parallel or collinear
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  const lenAB = Math.hypot(r.x, r.z), lenCD = Math.hypot(s.x, s.z);
  const padAB = eps / (lenAB || 1), padCD = eps / (lenCD || 1);
  if (t <= padAB || t >= 1 - padAB) return null; // touching an end is not a crossing
  if (u <= padCD || u >= 1 - padCD) return null;
  return { t, u, x: a.x + t * r.x, z: a.z + t * r.z };
}

export function nodePoint(state, index) {
  const n = state.nodes[index];
  return n ? { x: n.x, z: n.z } : null;
}

/* Only nodes some wall still references are candidates for welding: the array
   is append-only (indices are identity, so nothing is ever spliced out) and it
   accumulates corpses from every deleted wall. Welding onto one of those would
   reuse a slot nothing draws. */
export function liveNodes(state) {
  const used = new Set();
  state.walls.forEach((w) => { used.add(w.a); used.add(w.b); });
  return used;
}

export function wallBetween(state, a, b) {
  return state.walls.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)) || null;
}

function straight(state, w) {
  // arcs are left alone entirely: a room rectangle never needs to cut one, and
  // guessing where to split a curve is how you corrupt somebody's bay window
  if (w.geometry && w.geometry.type === "arc") return null;
  const a = nodePoint(state, w.a), b = nodePoint(state, w.b);
  return a && b ? { a, b } : null;
}

function nextId(state) {
  const id = Number(state.idc) || 1;
  state.idc = id + 1;
  return id;
}

/* The plain split: cut `wall` at node `ni`, carry the wall's style onto the
   new half, and move any opening past the cut onto it. The planner injects its
   own richer version (locks, MEP devices, anchors) through options.splitWall. */
export function splitWallAtNode(state, wall, ni) {
  const g = straight(state, wall);
  if (!g) return null;
  const p = nodePoint(state, ni);
  const s = dist(g.a.x, g.a.z, p.x, p.z);
  const total = dist(g.a.x, g.a.z, g.b.x, g.b.z);
  if (s <= TOL || s >= total - TOL) return null;
  const oldB = wall.b;
  wall.b = ni;
  const half = { id: nextId(state), a: ni, b: oldB };
  ["thickness", "height", "tex", "wallTypeId", "layers", "layersReversed", "datum",
    "kind", "phase", "upperWallTypeId", "splitHeight", "profile", "railing", "join",
    "layerOverrides", "dimSide", "loc"].forEach((key) => {
    if (wall[key] !== undefined) half[key] = JSON.parse(JSON.stringify(wall[key]));
  });
  state.walls.push(half);
  (state.openings || []).forEach((o) => {
    if (o.wall !== wall.id) return;
    if (o.s > s) { o.wall = half.id; o.s -= s; }
  });
  return half;
}

/* The contract the injected splitter has to honour: cut `wall` at `point` and
   return the index of the node the two halves now meet at. It returns the node
   rather than being handed one because the planner's splitter makes its own —
   it has anchors and dimension locks to re-home onto it — and a caller that
   created a second node at the same spot would leave two coincident corners
   and a wall joined to the wrong one. */
function splitter(options) {
  const injected = options && options.splitWall;
  if (typeof injected === "function") return injected;
  return (state, wall, point) => {
    const ni = state.nodes.push({ x: point.x, z: point.z }) - 1;
    if (splitWallAtNode(state, wall, ni)) return ni;
    state.nodes.pop();
    return null;
  };
}

/* Resolve a point to a node index, creating whatever the drawing needs for it
   to be one: nothing (a node is already there), a split (the point is in the
   middle of a wall), or a fresh node. */
export function resolveNode(state, p, options) {
  const opts = options || {};
  const tol = opts.tol == null ? TOL : opts.tol;
  const live = liveNodes(state);
  for (const i of live) {
    const n = state.nodes[i];
    if (n && Math.abs(n.x - p.x) <= tol && Math.abs(n.z - p.z) <= tol) return { index: i, created: false };
  }
  // a wall this point sits inside has to be cut, or the new corner would touch
  // it without joining it and the face trace would run straight past
  for (let k = 0; k < state.walls.length; k++) {
    const w = state.walls[k], g = straight(state, w);
    if (!g) continue;
    const hit = pointOnSegment(p, g.a, g.b, tol);
    if (!hit || !hit.interior) continue;
    const ni = splitter(opts)(state, w, { x: hit.x, z: hit.z });
    if (ni == null) continue;
    return { index: ni, created: true, split: w.id };
  }
  const index = state.nodes.push({ x: p.x, z: p.z }) - 1;
  return { index, created: true };
}

/* One straight edge of the new room, from node `na` to node `nb`. Returns the
   ids of the walls it built plus the ids of the walls it FOUND — the shared
   ones. */
function buildEdge(state, na, nb, spec, options) {
  const opts = options || {};
  const tol = opts.tol == null ? TOL : opts.tol;
  const a = nodePoint(state, na), b = nodePoint(state, nb);
  if (!a || !b || dist(a.x, a.z, b.x, b.z) <= tol) return { created: [], shared: [] };

  const stops = [{ t: 0, n: na }, { t: 1, n: nb }];
  const seen = new Set([na, nb]);
  // every node already on this line becomes a stop, so the edge arrives split
  liveNodes(state).forEach((i) => {
    if (seen.has(i)) return;
    const hit = pointOnSegment(state.nodes[i], a, b, tol);
    if (hit && hit.interior) { stops.push({ t: hit.t, n: i }); seen.add(i); }
  });
  // ...and so does every wall it crosses, which is cut at the same point
  for (let k = 0; k < state.walls.length; k++) {
    const w = state.walls[k], g = straight(state, w);
    if (!g) continue;
    const x = segmentCross(a, b, g.a, g.b, tol);
    if (!x) continue;
    const ni = splitter(opts)(state, w, { x: x.x, z: x.z });
    if (ni == null) continue;
    stops.push({ t: x.t, n: ni });
  }
  stops.sort((p, q) => p.t - q.t);

  const created = [], shared = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i].n, to = stops[i + 1].n;
    if (from === to || stops[i + 1].t - stops[i].t < PARAM_EPS) continue;
    const existing = wallBetween(state, from, to);
    if (existing) { shared.push(existing.id); continue; }
    const wall = Object.assign({ id: nextId(state), a: from, b: to }, spec);
    state.walls.push(wall);
    created.push(wall.id);
  }
  return { created, shared };
}

export const DEFAULT_WALL_SPEC = Object.freeze({
  thickness: 10, height: 270, wallTypeId: "generic", kind: "normal", loc: "center", dimSide: 0,
});

/* Build the four walls of `rect` into the drawing.

   Returns the ids of the walls that were created, the ids of the walls it
   found already standing on the rectangle's boundary (`shared` — the party
   walls with whatever it docked against), and the room key the pair adds up
   to, so the caller can hang metadata on it without re-running the face trace. */
export function stampRect(state, rect, spec, options) {
  const opts = options || {};
  const wallSpec = Object.assign({}, DEFAULT_WALL_SPEC, spec || {});
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
  const z0 = Math.min(rect.z0, rect.z1), z1 = Math.max(rect.z0, rect.z1);
  if (x1 - x0 < 20 || z1 - z0 < 20) return { ok: false, reason: "ROOM_TOO_SMALL" };

  const corners = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const idx = corners.map((p) => resolveNode(state, p, opts).index);
  const created = [], shared = [];
  for (let i = 0; i < 4; i++) {
    const edge = buildEdge(state, idx[i], idx[(i + 1) % 4], wallSpec, opts);
    created.push(...edge.created);
    shared.push(...edge.shared);
  }
  const key = created.concat(shared).slice().sort((a, b) => Number(a) - Number(b)).join(",");
  return { ok: true, created, shared, nodes: idx, key, rect: { x0, z0, x1, z1 } };
}

/* Break a dragged room off its neighbours before it moves.
 *
 * A room is a cycle of walls, and an attached room's cycle INCLUDES the party
 * wall — whose two corners are equally the neighbour's corners. So dragging the
 * room by its own corner list dragged the neighbour's wall with it: pulling a
 * bathroom two metres clear of a bedroom stretched the bedroom two metres
 * wider, silently, and the plan came apart while looking as though it had
 * simply moved.
 *
 * The seam is broken the way it would be broken in the world: the party wall
 * STAYS with the neighbour that still needs it, and the room being taken away
 * grows its own wall in the same place. Concretely, every corner the room
 * shares with anything it does not own is cloned, the room's own walls are
 * re-pointed at the clones, and a fresh wall is built along each shared side.
 * The result is two coincident walls for as long as the rooms are coincident —
 * which is exactly one pointermove, and the drop's fuse merges them again if
 * the room is put back.
 *
 * Openings on the party wall stay on the wall that stays. A door in what is now
 * an outside wall is a front door, not a defect; deleting the user's opening
 * because the room behind it moved would be the destructive choice.
 *
 * `rooms` is the caller's face trace, and the return is the node list the drag
 * should carry — the clones, not the originals. Null when there is no seam to
 * break, so a free-standing room keeps its own corners untouched. */
export function detachRoomSeam(state, roomKey, rooms) {
  const room = (rooms || []).find((r) => r.key === roomKey);
  if (!room) return null;
  const others = new Set();
  rooms.forEach((r) => {
    if (r.key === roomKey) return;
    String(r.key).split(",").forEach((id) => others.add(id));
  });
  const keyIds = String(roomKey).split(",");
  if (!keyIds.some((id) => others.has(id))) return null; // free-standing: no seam

  const mine = [], shared = [];
  keyIds.forEach((id) => {
    const w = state.walls.find((q) => String(q.id) === String(id));
    if (w) (others.has(id) ? shared : mine).push(w);
  });
  if (!mine.length) return null;

  /* Clone every corner that anything outside `mine` also stands on. Only the
     room's own walls follow the clone; the party wall and the neighbour keep
     the original, which is what leaves them undisturbed. */
  const mineIds = new Set(mine.map((w) => w.id));
  const corners = new Set();
  mine.forEach((w) => { corners.add(w.a); corners.add(w.b); });
  const clone = new Map();
  corners.forEach((ni) => {
    const foreign = state.walls.some((w) => !mineIds.has(w.id) && (w.a === ni || w.b === ni));
    if (!foreign) return;
    const n = state.nodes[ni];
    clone.set(ni, state.nodes.push({ x: n.x, z: n.z }) - 1);
  });
  if (!clone.size) return null;
  mine.forEach((w) => {
    if (clone.has(w.a)) w.a = clone.get(w.a);
    if (clone.has(w.b)) w.b = clone.get(w.b);
  });

  // ...and a wall of its own along every side it used to borrow
  shared.forEach((w) => {
    const a = clone.has(w.a) ? clone.get(w.a) : w.a;
    const b = clone.has(w.b) ? clone.get(w.b) : w.b;
    if (a === b) return;
    const copy = { id: nextId(state), a, b };
    ["thickness", "height", "tex", "wallTypeId", "layers", "layersReversed", "datum",
      "kind", "phase", "upperWallTypeId", "splitHeight", "profile", "railing", "join",
      "layerOverrides", "dimSide", "loc"].forEach((key) => {
      if (w[key] !== undefined) copy[key] = JSON.parse(JSON.stringify(w[key]));
    });
    state.walls.push(copy);
    mine.push(copy);
  });

  const carried = new Set();
  mine.forEach((w) => { carried.add(w.a); carried.add(w.b); });
  return Array.from(carried);
}

/* Does this rectangle CROSS a room that is already there?
 *
 * Docking is the whole point, so touching is not overlapping: a rectangle laid
 * flush against a room shares its boundary line and must pass. What must not
 * pass is a rectangle that lands ON a room — inside it, across it, or around
 * it. All three shred the drawing in the same way, and the damage is invisible
 * at the moment it happens: the face trace finds the new sub-faces, none of
 * them has the metadata key the old room had, and the ROOMS THAT WERE ALREADY
 * THERE lose their names along with the new one. By the time it looks wrong,
 * the edit that caused it is several steps back.
 *
 * Three questions, because a rectangle and a polygon can overlap without any
 * of their edges crossing:
 *   - a corner of the room inside the rectangle (the rectangle swallowed it),
 *   - a corner of the rectangle inside the room (the rectangle is an island),
 *   - an edge properly crossing an edge (they straddle).
 * The rectangle is shrunk by the weld tolerance first, so a flush dock — whose
 * corners sit exactly ON the neighbour's boundary — answers no to all three. */
export function rectOverlapsRoom(rect, pts, tol) {
  const eps = tol == null ? TOL : tol;
  const x0 = rect.x0 + eps, z0 = rect.z0 + eps, x1 = rect.x1 - eps, z1 = rect.z1 - eps;
  if (!pts || pts.length < 3 || x1 <= x0 || z1 <= z0) return false;
  if (pts.some((p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1)) return true;
  const corners = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  if (corners.some((c) => pointInPolygon(c, pts))) return true;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let j = 0; j < pts.length; j++) {
      if (segmentCross(a, b, pts[j], pts[(j + 1) % pts.length], eps)) return true;
    }
  }
  return false;
}

/* The first room the rectangle lands on, or null. `rooms` is whatever the
   caller's face trace produced — [{ key, pts }] — so this module still knows
   nothing about the planner's state. */
export function rectOverlapsRooms(rect, rooms, tol) {
  return (rooms || []).find((r) => r && r.pts && rectOverlapsRoom(rect, r.pts, tol)) || null;
}

function pointOnPolygon(p, pts, tol) {
  if (!pts || pts.length < 2) return false;
  for (let i = 0; i < pts.length; i++) {
    if (pointOnSegment(p, pts[i], pts[(i + 1) % pts.length], tol)) return true;
  }
  return false;
}

/* True when `rect` sits entirely inside `pts`, including sitting flush against
   a side. That is the insert case: a bathroom eating into a living room has
   two corners ON the living room's wall, not inside it, and the overlap test
   above would call that a collision. Corners on the boundary, centroid in the
   interior, and no edge that actually crosses a host edge. */
export function rectInsideRoom(rect, pts, tol) {
  const eps = tol == null ? TOL : tol;
  if (!pts || pts.length < 3 || !rect) return false;
  const corners = [
    { x: rect.x0, z: rect.z0 }, { x: rect.x1, z: rect.z0 },
    { x: rect.x1, z: rect.z1 }, { x: rect.x0, z: rect.z1 },
  ];
  for (let i = 0; i < 4; i++) {
    const c = corners[i];
    if (!pointInPolygon(c, pts) && !pointOnPolygon(c, pts, eps)) return false;
  }
  const mid = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
  if (!pointInPolygon(mid, pts)) return false;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let j = 0; j < pts.length; j++) {
      if (segmentCross(a, b, pts[j], pts[(j + 1) % pts.length], eps)) return false;
    }
  }
  return true;
}

/* Local ray cast rather than geometry.js's: importing that would drag the
   planner's global state into a module that deliberately has none. */
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > p.z) !== (b.z > p.z)
      && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/* The eraser's other half: take one wall out and let the two rooms it
   separated become one space.
 *
 * Only the wall and what rode it are removed. Nodes are left in place — the
 * array is indexed by position, so removing one would renumber every wall in
 * the drawing — and the corners it used simply drop to a lower degree, which
 * the face trace handles. A wall that turns out to bound nothing on one side
 * is still erasable; the caller decides whether that is what the user meant. */
export function removeWall(state, wallId) {
  const wall = state.walls.find((w) => w.id === wallId);
  if (!wall) return { ok: false, reason: "WALL_NOT_FOUND" };
  state.walls = state.walls.filter((w) => w !== wall);
  const openings = (state.openings || []).filter((o) => o.wall === wallId);
  if (openings.length) state.openings = state.openings.filter((o) => o.wall !== wallId);
  return { ok: true, wall, openings };
}

/* Is this wall the party wall between two detected rooms? The eraser needs to
   know before it commits: erasing a shared wall MERGES two spaces (and should
   say so), while erasing an outside wall opens the plan to the world. */
export function wallSeparates(rooms, wallId) {
  const id = String(wallId);
  const touching = rooms.filter((r) => String(r.key).split(",").indexOf(id) !== -1);
  return touching.length === 2 ? touching : null;
}

/* The straight, axis-aligned faces of a room cycle, as segments the docking
   solver can aim at. Non-rectangular rooms contribute the edges that ARE axis
   aligned and ignore the rest, which is the honest answer: you can dock onto
   the straight part of an L. */
export function rectOfPoints(pts) {
  if (!pts || !pts.length) return null;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  pts.forEach((p) => {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  });
  return { x0, z0, x1, z1 };
}

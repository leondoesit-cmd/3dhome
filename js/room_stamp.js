/* Placing, lifting and merging whole rooms.
 *
 * This is the layer that turns "a bedroom, here, against that wall" into edits
 * to the wall graph: it picks the rectangle (js/room_presets.js), asks where it
 * should land (js/room_dock.js), builds it planar (js/room_graph.js), and then
 * does the three things that make the result feel like one gesture rather than
 * four walls appearing:
 *
 *   - the room gets its NAME and FLOOR straight away, keyed the way the rest of
 *     the app keys room metadata, with the centroid recorded so the key can
 *     change under it later without losing them;
 *   - where it docked, a door (or a passage, for circulation) is cut through
 *     the party wall, because a room you cannot walk into is not a room;
 *   - a corridor dock builds the corridor too, and opens it at both ends.
 *
 * Dragging an EXISTING room is the mirror image and lives in js/interaction.js
 * instead: a room is a cycle of walls, so there is nothing to pick up — the
 * drag moves its corners and the drop (fuseDroppedRoom) welds, de-duplicates
 * and opens whatever it landed against, reusing cutOpening() from here.
 *
 * Everything takes an explicit `state`, so all of it runs — and is tested —
 * without a DOM.
 */

import { presetRect, presetConnection, roomPreset } from "./room_presets.js";
import { stampRect, rectOverlapsRooms, rectInsideRoom, pointInPolygon, DEFAULT_WALL_SPEC, removeWall } from "./room_graph.js";
import { solveDock, corridorRect, translateRect } from "./room_dock.js";

const EDGE_MARGIN = 12; // cm of wall left beside an opening, so jambs can exist

function wallLength(state, w) {
  const a = state.nodes[w.a], b = state.nodes[w.b];
  return a && b ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
}

function wallById(state, id) {
  return state.walls.find((w) => w.id === id) || null;
}

function centroid(rect) {
  return { cx: (rect.x0 + rect.x1) / 2, cz: (rect.z0 + rect.z1) / 2 };
}

/* Cut one opening through a wall — centred if the wall is clear, and otherwise
   in the widest stretch that is not already spoken for.
 *
 * NOT called openWall(). interaction.js exports a function by that name which
 * DELETES a wall, and two same-named exports meaning opposite things is a trap
 * that has already been sprung once in this codebase.
 *
 * "Is this wall already connected?" is a question about DOORS AND PASSAGES, not
 * about openings in general. Treating any opening as an answer meant that
 * docking against a wall with a window in it produced no door at all, and said
 * nothing: the room came out sealed and the user had to notice. A window is an
 * obstacle to route around, not a connection.
 *
 * Returns null rather than a sliver when nothing fits. That is a real outcome —
 * a 60 cm party wall between a WC and a corridor cannot hold a door — and the
 * caller is expected to say so rather than swallow it. */
export function cutOpening(state, wallId, spec) {
  const wall = wallById(state, wallId);
  if (!wall) return null;
  const L = wallLength(state, wall);
  const here = (state.openings || []).filter((o) => o.wall === wallId);
  const connected = here.find((o) => o.type === "door" || o.type === "passage");
  if (connected) return connected; // already a way through; a second one is not an improvement

  const want = Number(spec && spec.width) || 80;
  const gap = widestFreeRun(here, L);
  if (!gap) return null;
  const width = Math.min(want, gap.hi - gap.lo);
  if (!(width >= 60)) return null;
  const opening = {
    id: Number(state.idc || 1),
    type: (spec && spec.type) || "door",
    wall: wallId,
    s: (gap.lo + gap.hi) / 2,
    width,
    height: Number(spec && spec.height) || 205,
    sill: Number(spec && spec.sill) || 0,
  };
  state.idc = opening.id + 1;
  state.openings.push(opening);
  return opening;
}

/* The longest run of wall with nothing in it, jambs included at both ends. */
function widestFreeRun(openings, L) {
  const busy = openings
    .map((o) => [o.s - o.width / 2 - EDGE_MARGIN, o.s + o.width / 2 + EDGE_MARGIN])
    .sort((a, b) => a[0] - b[0]);
  let best = null, cursor = EDGE_MARGIN;
  const consider = (lo, hi) => {
    if (hi - lo > (best ? best.hi - best.lo : 0)) best = { lo, hi };
  };
  busy.forEach((span) => {
    if (span[0] > cursor) consider(cursor, span[0]);
    cursor = Math.max(cursor, span[1]);
  });
  consider(cursor, L - EDGE_MARGIN);
  return best && best.hi > best.lo ? best : null;
}

/* The party walls the stamp landed on, longest first — the longest shared face
   is the one a door belongs in, and on an L-shaped meeting the short returns
   are not where anybody would put one. */
function sharedByLength(state, ids) {
  return ids
    .map((id) => ({ id, len: wallLength(state, wallById(state, id) || { a: -1, b: -1 }) }))
    .sort((a, b) => b.len - a.len);
}

export function roomMetaFor(state, key, preset, rect) {
  const c = centroid(rect);
  const meta = {
    name: preset ? preset.name : "",
    floor: preset ? preset.floor : undefined,
    preset: preset ? preset.id : undefined,
    /* The flag the rest of the app already reads for "this is circulation":
       the floor-inheritance rule in ui.js and the corridor opening pass in
       interaction.js both look for it. Storing only `preset` would have made a
       stamped corridor invisible to both — a corridor that behaves like a
       corridor everywhere except in the two places that ask. */
    isCorridor: !!(preset && preset.kind === "circulation") || undefined,
    cx: c.cx,
    cz: c.cz,
  };
  state.roomMeta = state.roomMeta || {};
  state.roomMeta[key] = meta;
  return meta;
}

/* Place a preset room whose centreline rectangle is `rect`.
 *
 * `dock` is the proposal solveDock() returned for that rectangle, already
 * applied to it — it is passed in only so the connection can be cut in the
 * right place and the corridor built. Pass null for a free-standing room. */
export function placeRoom(state, options) {
  const opts = options || {};
  const preset = typeof opts.preset === "string" ? roomPreset(opts.preset) : opts.preset;
  const spec = Object.assign({}, DEFAULT_WALL_SPEC, opts.spec || {});
  if (dockMode(opts.dock) === "insert" && !opts.explicitThickness) {
    spec.thickness = 10;
  }
  const rect = opts.rect;
  if (!rect) return { ok: false, reason: "INVALID_ROOM_BOUNDS" };

  /* Refuse before touching anything.
   *
     The guard is on by default and has to be switched OFF deliberately. It was
     the other way round at first — it only ran when the caller handed over a
     face trace — which made the safe behaviour the one you got by remembering
     to ask for it. The plan UI remembered; a script or an agent calling
     placeRoom() directly would not, and the failure is silent and destructive
     (a stamp across two rooms subdivides both and orphans their names).

     `rooms` is a trace the caller already has; otherwise one is taken from
     `detectRooms` if that was injected. With neither there is nothing to check
     against, which is the genuinely unguarded case — a blank plan, and the
     corridor this function builds for itself in the gap between two rooms. */
  if (!opts.allowOverlap) {
    const rooms = opts.rooms
      || (typeof opts.detectRooms === "function" ? opts.detectRooms() : null);
    const clash = rooms && rectOverlapsRooms(rect, rooms, opts.tol);
    /* Insert is the one overlap that is the point: the new room sits inside
       the host, flush to one of its walls. Any other overlap is still a
       refusal. */
    const inserting = dockMode(opts.dock) === "insert"
      && clash && opts.dock.hostKey && String(clash.key) === String(opts.dock.hostKey);
    if (clash && !inserting) return { ok: false, reason: "ROOM_OVERLAPS", room: clash.key };
  }

  const stamp = stampRect(state, rect, spec, opts);
  if (!stamp.ok) return stamp;
  if (preset) roomMetaFor(state, stamp.key, preset, stamp.rect);

  /* Re-home every room's metadata against the face trace — not just the new
     room's, and not until every wall this call is going to build has been
     built.

     A room is keyed by its sorted bounding wall ids, and docking SPLITS the
     wall it docked against, so the neighbour — which nobody touched — ends up
     with a boundary it did not have before and a key that names no room. It
     loses its name, its floor and its lock, silently: still drawn, still
     traced, just anonymous. Rebuilding the stamp's own key cannot fix that,
     because the room whose key went stale is not the room being stamped.

     Hence: ask the trace again, and give every orphaned entry to the face that
     contains the centroid it recorded. The planner runs the same repair after
     every structural edit (reconcileRoomMeta in geometry.js); doing it here as
     well is what lets placeRoom() leave the model consistent for callers that
     are not the plan UI — a test, the agent, a script. */
  const done = (result) => {
    if (typeof opts.detectRooms === "function")
      result.key = rehomeRoomMeta(state, opts.detectRooms(), result.key);
    return result;
  };

  const openings = [];
  const dock = opts.dock || null;
  if (dock && opts.connect !== false) {
    const conn = presetConnection(preset, insertNeighbour(state, dock), opts.connMode);
    if (conn.type === "open") {
      if (dock.mode === "abut") {
        /* Taking the party wall out merges two rooms into one space, so one of
           the two names has to go. Whose, is decided BEFORE the wall is
           removed, while there are still two rooms to compare. */
        const contributors = mergeContributors(state, opts, stamp);
        const removed = [];
        (stamp.shared || []).forEach((id) => {
          const res = removeWall(state, id);
          if (res.ok) removed.push(res.wall);
        });
        resolveMergedRoomMeta(state, opts, contributors);
        return done({
          ok: true, key: stamp.key, created: stamp.created, shared: [],
          openings: [], removedShared: removed, dock, mode: "open",
        });
      }
      if (dock.mode === "insert") {
        const candidates = innerCreatedWalls(state, stamp, dock);
        const ordered = candidates.map((id) => ({
          id,
          len: wallLength(state, wallById(state, id) || { a: -1, b: -1 }),
        })).sort((a, b) => b.len - a.len);
        const target = ordered[0];
        const removed = [];
        if (target) {
          const res = removeWall(state, target.id);
          if (res.ok) removed.push(res.wall);
        }
        return done({
          ok: true, key: stamp.key,
          created: stamp.created.filter((id) => !removed.some((w) => w.id === id)),
          shared: stamp.shared, openings: [], removedShared: removed, dock, mode: "open",
        });
      }
    }
    if (dock.mode === "insert") {
      const candidates = innerCreatedWalls(state, stamp, dock);
      const ordered = candidates.map((id) => ({
        id,
        len: wallLength(state, wallById(state, id) || { a: -1, b: -1 }),
      }));
      let target = null;
      if (opts.doorWallIndex != null && ordered.length > 1) {
        target = ordered[Math.abs(opts.doorWallIndex) % ordered.length];
      } else {
        const want = Number(conn && conn.width) || 80;
        target = ordered.find((c) => c.len >= want + 24)
          || ordered.slice().sort((a, b) => b.len - a.len)[0];
      }
      if (target) {
        const o = cutOpening(state, target.id, conn);
        if (o) openings.push(o);
      }
      return done({ ok: true, key: stamp.key, created: stamp.created, shared: stamp.shared, openings, dock });
    }
    if (dock.mode === "corridor") {
      const gap = corridorRect(rect, dock);
      const corridor = gap ? placeRoom(state, {
        preset: "corridor", rect: gap, spec, dock: null, connect: false,
        tol: opts.tol, splitWall: opts.splitWall,
        // the gap between two rooms, by construction — there is nothing there
        // to overlap, and the trace has not caught up with the room just built
        allowOverlap: true,
      }) : null;
      // the corridor was built ON the two faces it separates, so both of its
      // long walls are shared: one with the new room, one with the neighbour
      if (corridor && corridor.ok) {
        // the opening is into a CORRIDOR, so it is the corridor's own width that
        // decides it, not the door the two rooms either side would have shared
        const wide = presetConnection(preset, roomPreset("corridor"), opts.connMode);
        sharedByLength(state, corridor.shared).slice(0, 2).forEach((entry) => {
          const o = cutOpening(state, entry.id, { type: "passage", width: wide.width, height: 205, sill: 0 });
          if (o) openings.push(o);
        });
        return done({
          ok: true, key: stamp.key, corridorKey: corridor.key,
          created: stamp.created, shared: stamp.shared, openings, dock,
        });
      }
    }
    const sharedOrdered = sharedByLength(state, stamp.shared);
    const target = (opts.doorWallIndex != null && sharedOrdered.length > 1)
      ? sharedOrdered[Math.abs(opts.doorWallIndex) % sharedOrdered.length]
      : sharedOrdered[0];
    if (target) {
      const o = cutOpening(state, target.id, conn);
      if (o) openings.push(o);
    }
  }
  return done({ ok: true, key: stamp.key, created: stamp.created, shared: stamp.shared, openings, dock });
}

/* The rooms that are about to become one, captured while they are still two.
 *
 * Read from a fresh trace rather than from the caller's: the stamp has already
 * happened, so this sees the new room and the host as they are at the moment
 * the party wall goes. Each entry keeps the area, because area is what decides
 * the argument, and the centroid, because that is how the survivor is found
 * again afterwards. */
function mergeContributors(state, opts, stamp) {
  if (typeof opts.detectRooms !== "function") return [];
  const shared = new Set((stamp.shared || []).map(String));
  const meta = state.roomMeta || {};
  return opts.detectRooms()
    .filter((r) => String(r.key) === String(stamp.key)
      || String(r.key).split(",").some((id) => shared.has(id)))
    .map((r) => ({
      key: r.key, area: r.area || 0, cx: r.cx, cz: r.cz,
      /* Which metadata entry belongs to this room, which is NOT simply
         meta[r.key]. Docking split the host's wall, so the host is already
         keyed under a set of walls it no longer has — looking it up by key
         finds nothing, and the room with the most floor loses the argument by
         default. Fall back to the entry whose recorded centroid is inside it. */
      metaKey: meta[r.key] ? r.key : Object.keys(meta).find((k) => {
        const entry = meta[k];
        return entry && Number.isFinite(entry.cx) && Number.isFinite(entry.cz)
          && pointInPolygon({ x: entry.cx, z: entry.cz }, r.pts);
      }),
    }));
}

/* One space, one name.
 *
 * Merging leaves two metadata entries whose rooms no longer exist, and the
 * generic re-homing below cannot settle it: the first orphan to find the
 * merged face takes it, and the second — having found the face already taken —
 * is KEPT, orphaned, in the document and in every save after it. Which name
 * survived came down to key order, so stamping a WC against a living room in
 * open mode could leave the merged space called "WC" and strand the living
 * room's name in state.
 *
 * The room that contributed the most floor keeps its name, its finish and its
 * lock; the others are deleted rather than left behind. Same rule the eraser
 * follows when it takes a party wall out (adoptMergedRoomMeta in
 * js/interaction.js), because it is the same event. */
function resolveMergedRoomMeta(state, opts, contributors) {
  if (!contributors || contributors.length < 2) return;
  if (typeof opts.detectRooms !== "function") return;
  const meta = state.roomMeta || {};
  const ranked = contributors.slice().sort((a, b) => (b.area || 0) - (a.area || 0));
  const winner = ranked.map((c) => c.metaKey && meta[c.metaKey]).find(Boolean);
  if (!winner) return;
  const live = opts.detectRooms();
  const merged = live.find((r) => contributors.every((c) => String(c.key) !== String(r.key))
    && pointInPolygon({ x: ranked[0].cx, z: ranked[0].cz }, r.pts));
  if (!merged) return;
  contributors.forEach((c) => {
    delete meta[c.key];
    if (c.metaKey) delete meta[c.metaKey];
  });
  winner.cx = merged.cx;
  winner.cz = merged.cz;
  meta[merged.key] = winner;
}

/* Give every orphaned metadata entry to the live room whose polygon contains
   the centroid it was written with. One adopter per orphan, and a room that
   already carries metadata is never overwritten. Returns where `key` ended up,
   since the room just stamped can be the one that moved. */
function rehomeRoomMeta(state, rooms, key) {
  const meta = state.roomMeta || {};
  const live = new Set(rooms.map((r) => String(r.key)));
  const taken = new Set(rooms.filter((r) => meta[r.key]).map((r) => String(r.key)));
  let moved = key;
  Object.keys(meta).forEach((old) => {
    if (live.has(String(old))) return;
    const entry = meta[old];
    if (!entry || !Number.isFinite(entry.cx) || !Number.isFinite(entry.cz)) return;
    let home = rooms.find((r) => !taken.has(String(r.key))
      && pointInPolygon({ x: entry.cx, z: entry.cz }, r.pts));
    /* Inserting a room into a host can land the host's recorded centroid
       inside the new room, which already has metadata. The leftover L is
       then left unnamed. Hand the orphan to the largest free face instead. */
    if (!home) {
      home = rooms.filter((r) => !taken.has(String(r.key)))
        .sort((a, b) => (b.area || 0) - (a.area || 0))[0] || null;
    }
    if (!home) return;
    delete meta[old];
    meta[home.key] = entry;
    taken.add(String(home.key));
    if (String(old) === String(key)) moved = home.key;
  });
  return moved;
}

/* What kind of space is on the other side of the wall we docked against?
   Only the preset matters — a corridor on either side makes the connection an
   opening rather than a door. */
export function neighbourPreset(state, wallId) {
  const meta = state.roomMeta || {};
  const id = String(wallId);
  for (const key in meta) {
    if (key.split(",").indexOf(id) === -1) continue;
    const p = meta[key] && meta[key].preset;
    if (p) return roomPreset(p);
  }
  return null;
}

function dockMode(dock) {
  return dock && dock.mode;
}

function insertNeighbour(state, dock) {
  if (dock && dock.hostKey) {
    const meta = (state.roomMeta || {})[dock.hostKey];
    if (meta && meta.preset) return roomPreset(meta.preset);
  }
  return neighbourPreset(state, dock && dock.hostWall);
}

/* The new partition that faces the leftover host — opposite the wall the
   insert sat against. That is the wall a door belongs in; the shared outer
   wall is usually the exterior. */
function oppositeCreatedWalls(state, stamp, dock) {
  if (!stamp || !dock) return [];
  const rect = stamp.rect, tol = 2;
  const along = dock.axis === "v" ? "x" : "z";
  const at = dock.side < 0
    ? (dock.axis === "v" ? rect.x0 : rect.z0)
    : (dock.axis === "v" ? rect.x1 : rect.z1);
  return (stamp.created || []).filter((id) => {
    const w = wallById(state, id);
    if (!w) return false;
    const a = state.nodes[w.a], b = state.nodes[w.b];
    return a && b
      && Math.abs(a[along] - at) <= tol
      && Math.abs(b[along] - at) <= tol;
  });
}

/* In a corner insert, two new walls are created inside the host. Return all
   created interior partitions facing the host room, with the opposite wall first. */
export function innerCreatedWalls(state, stamp, dock) {
  if (!stamp || !dock) return [];
  const primary = oppositeCreatedWalls(state, stamp, dock);
  const others = (stamp.created || []).filter((id) => primary.indexOf(id) === -1);
  return primary.concat(others);
}

const MIN_LEFTOVER = 15000; // cm² — 1.5 m² of host must remain after an insert

/* An abut that landed INSIDE a room is an insert, not a collision, when the
   rectangle is fully contained and leaves a usable leftover. Otherwise it is
   still a collision (island, straddle, or swallowing the host). */
export function proposeInsert(rect, dock, rooms, tol) {
  if (!dock || dock.mode !== "abut" || !rect) return null;
  const host = (rooms || []).find((r) => r && r.pts && rectInsideRoom(rect, r.pts, tol));
  if (!host) return null;
  const area = Math.abs((rect.x1 - rect.x0) * (rect.z1 - rect.z0));
  if (!Number.isFinite(host.area) || host.area - area < MIN_LEFTOVER) return null;
  const eps = 4;
  const swallowed = (host.pts || []).every((p) =>
    p.x > rect.x0 + eps && p.x < rect.x1 - eps && p.z > rect.z0 + eps && p.z < rect.z1 - eps);
  if (swallowed) return null;
  return Object.assign({}, dock, { mode: "insert", hostKey: host.key });
}

function resolveDock(state, rect, options) {
  const opts = options || {};
  if (opts.dock === null) return { rect: rect, dock: null };
  let dock = opts.dock && typeof opts.dock === "object" ? opts.dock : solveDock(state, rect, opts);
  if (dock) rect = translateRect(rect, dock.dx, dock.dz);
  if (dock && dock.mode === "abut") {
    const rooms = opts.rooms
      || (typeof opts.detectRooms === "function" ? opts.detectRooms() : null);
    const insert = proposeInsert(rect, dock, rooms, opts.tol);
    if (insert) dock = insert;
  }
  return { rect: rect, dock: dock };
}

/* Convenience for the tool: preset + a point = a placed room. */
export function stampPresetAt(state, presetId, x, z, options) {
  const opts = options || {};
  const preset = roomPreset(presetId);
  if (!preset) return { ok: false, reason: "UNKNOWN_PRESET" };
  const spec = Object.assign({}, DEFAULT_WALL_SPEC, opts.spec || {});
  const placed = resolveDock(state,
    presetRect(preset, x, z, { thickness: spec.thickness, rot: opts.rot, w: opts.w, d: opts.d }),
    opts);
  return placeRoom(state, Object.assign({}, opts, { preset, rect: placed.rect, dock: placed.dock, spec }));
}

/* The opening two rooms sharing `wallId` should have, read off the presets they
   were stamped from. Falls back to a plain door, which is what an unlabelled
   pair of rooms wants. `rooms` is the caller's face trace. */
export function connectionForWall(state, wallId, rooms) {
  const id = String(wallId);
  const presets = (rooms || [])
    .filter((r) => String(r.key).split(",").indexOf(id) !== -1)
    .map((r) => {
      const meta = (state.roomMeta || {})[r.key];
      return meta && meta.preset ? roomPreset(meta.preset) : null;
    });
  return presetConnection(presets[0] || null, presets[1] || null);
}

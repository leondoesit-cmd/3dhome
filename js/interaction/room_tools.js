/* The planner's preset rooms, room stamps and room fusing, split out of
   js/interaction.js. It shares the editor's state through live imports from
   ../interaction.js. */
import { executePrepared, prepareCommand, roomStampCommand } from "../commands/index.js";
import { captureClear, captureLock } from "../constraint_engine.js";
import { detectRooms, pendingCuts, reconcileRoomMeta, roomByKey, roomEdgeHandles, usedNodes, wallById, wallClearLength, wallGeom, wallProject } from "../geometry.js";
import { pushHistory } from "../history.js";
import { t, tTouch } from "../i18n.js";
import { pointInPolyR } from "../interaction/hit_test.js";
import { weldCoincidentNodes } from "../interaction/layout_drag.js";
import { commitRectFromTo, setTool, wallPoint } from "../interaction/mep_tools.js";
import { agentCommandEnvironment, getOrMakeNode, resolveLanding, splitWallAt } from "../interaction/wall_edit.js";
import { broadcastPlanOp } from "../plan_sync.js";
import { render2D } from "../plan2d.js";
import { inputScale } from "../planner_input.js";
import { roomMetaKey } from "../room_graph.js";
import { CONNECTION_MODES, rectInterior, roomPreset } from "../room_presets.js";
import { connectionForWall, cutOpening, placeRoom } from "../room_stamp.js";
import { openingFromRect } from "../slab_openings.js";
import { S, WALL_H, WALL_T, fin, uid } from "../state.js";
import { renderWarnPanel } from "../ui_warn.js";
import { flash, refreshTree, select } from "../ui.js";
import { prepareStableAnchors, pruneCons } from "../wall_constraints.js";
import { makeArcFromThreePoints } from "../wall_curves.js";
import { applyWallDrawDefaults, resolveWallDrawDefaults } from "../wall_draw.js";
import { applyCornerRestore, applyCornerTreatmentUpdate, applyWallChamfer, applyWallFillet, proposeCornerRestore, proposeCornerTreatmentUpdate, proposeWallChamfer, proposeWallFillet } from "../wall_fillet.js";

/* ---- preset rooms --------------------------------------------------------
   Drawing a flat one wall at a time asks the user to hold the whole plan in
   their head. Stamping asks them for one thing at a time: pick "bedroom",
   move it until it snaps against the wall it should share, click.

   Three pieces do that, and only the middle one lives here:

     js/room_presets.js  what a bedroom is (clear size, floor, door width)
     js/room_dock.js     where the rectangle wants to land, given the drawing
     js/room_graph.js    building it so the result is still a planar graph,
                         reusing the wall it landed against instead of laying a
                         second one on top of it

   This file only turns pointer positions into those calls and puts the result
   through the planner's own choreography — history, the 3D rebuild, the tree.

   The armed preset SURVIVES a placement. Laying out a flat is "bedroom,
   bedroom, bathroom, corridor", and going back to the palette between every
   one of those is the difference between a tool and a chore. Escape or the
   right button disarms it. */
export function armRoomStamp(presetId, options) {
  var preset = roomPreset(presetId);
  if (!preset) return null;
  var opts = options || {};
  S.roomStamp = {
    id: preset.id,
    checklistId: opts.checklistId || "",
    rot: Number(opts.rot) || 0,
    w: fin(opts.w) ? opts.w : preset.w,
    d: fin(opts.d) ? opts.d : preset.d,
    connMode: opts.connMode || (S.roomStamp && S.roomStamp.connMode) || "auto",
    doorWallIndex: opts.doorWallIndex != null ? Number(opts.doorWallIndex) : 0,
  };
  S.roomGhost = null;
  setTool("roomstamp");
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
  return S.roomStamp;
}

export function disarmRoomStamp() {
  S.roomStamp = null;
  S.roomGhost = null;
  S.roomPrepared = null;
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

/* R while stamping turns the rectangle a quarter turn — the preset's clear
   size swaps rather than the rectangle rotating, because a room stamped at 37
   degrees would dock against nothing. */
export function rotateRoomStamp() {
  if (!S.roomStamp) return;
  S.roomStamp.rot = (S.roomStamp.rot + 90) % 360;
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

export function setRoomStampConnMode(mode) {
  var st = S.roomStamp;
  if (!st) return;
  if (CONNECTION_MODES.indexOf(mode) === -1) return;
  st.connMode = mode;
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

export function cycleRoomStampConnMode() {
  var st = S.roomStamp;
  if (!st) return;
  var cur = st.connMode || "auto";
  var idx = CONNECTION_MODES.indexOf(cur);
  var next = CONNECTION_MODES[(idx + 1) % CONNECTION_MODES.length];
  setRoomStampConnMode(next);
}

export function flipRoomStampDoorWall() {
  var st = S.roomStamp;
  if (!st) return;
  st.doorWallIndex = ((st.doorWallIndex || 0) + 1) % 4;
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

/* Manual dimensions may fall below advisory furnishing preferences. */
export function resizeRoomStamp(dw, dd) {
  var st = S.roomStamp, preset = st && roomPreset(st.id);
  if (!preset) return;
  st.w = Math.max(20, st.w + (dw || 0));
  st.d = Math.max(20, st.d + (dd || 0));
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp"));
}

export function setRoomStampSize(w, d) {
  var st = S.roomStamp;
  if (!st) return;
  if (fin(w)) st.w = Math.max(20, w);
  if (fin(d)) st.d = Math.max(20, d);
  if (S.previewPt) updateRoomGhost(S.previewPt.x, S.previewPt.z);
  render2D();
  window.dispatchEvent(new CustomEvent("planner-room-stamp", { detail: { reason: "size" } }));
}

function roomStampSpec() {
  var defaults = resolveWallDrawDefaults();
  return {
    thickness: defaults.thickness,
    height: defaults.height,
    wallTypeId: defaults.typeId,
    kind: defaults.kind,
    loc: defaults.loc,
    dimSide: defaults.dimSide,
    datum: defaults.datum,
    phase: defaults.phase,
  };
}

/* Where the armed room would land if the click happened now. The dock solver
   gets first refusal; only when nothing is in reach does the grid have a say,
   because a room snapped to the grid but 3 cm off its neighbour is worse than
   one flush against it and off the grid. */
export function updateRoomGhost(px, pz) {
  var st = S.roomStamp;
  if (!st || !roomPreset(st.id)) { S.roomGhost = null; return null; }
  /* The ghost is a PREPARED PLAN, not a second opinion about where the room
     goes. Everything the click is about to do — the rectangle, the grid
     fallback, the dock, the refusal — is decided once, in
     js/commands/room_stamp.js, and drawn from the result. The two used to be
     separate pieces of arithmetic that happened to agree.

     A refusal still carries its rectangle (see that module), so a stamp over an
     existing room keeps a ghost to draw, in red, where the pointer is. */
  S.roomPrepared = prepareCommand(roomStampCommand, roomStampParams(px, pz), roomCommandEnvironment());
  var prep = S.roomPrepared;
  if (prep.ok) {
    var p = prep.plan.params;
    S.roomGhost = {
      rect: p.rect, dock: p.dock, preset: p.preset,
      corridor: p.corridor, size: p.size, blocked: null,
      connMode: p.connMode, doorWallIndex: p.doorWallIndex,
    };
  } else if (prep.rect) {
    S.roomGhost = {
      rect: prep.rect, dock: null, preset: st.id, corridor: null,
      size: rectInterior(prep.rect, roomStampSpec().thickness),
      blocked: prep.room != null ? prep.room : true,
      blockedReason: prep.reason || "ROOM_STAMP_FAILED",
      connMode: st.connMode || "auto", doorWallIndex: st.doorWallIndex || 0,
    };
  } else {
    S.roomGhost = null;
  }
  return S.roomGhost;
}

function roomStampParams(px, pz) {
  var st = S.roomStamp, spec = roomStampSpec();
  return {
    preset: st.id,
    checklistId: st.checklistId || "",
    x: px,
    z: pz,
    rot: st.rot,
    w: st.w,
    d: st.d,
    connMode: st.connMode || "auto",
    doorWallIndex: st.doorWallIndex != null ? st.doorWallIndex : 0,
    spec: spec,
  };
}

/* The planner's own services, on top of the shared agent environment: the face
   trace the overlap guard needs, and the wall split that re-homes openings. */
function roomCommandEnvironment() {
  var env = agentCommandEnvironment();
  env.services = Object.assign({}, env.services, {
    detectRooms: detectRooms,
    splitWall: splitPlannerWallAt,
  });
  return env;
}

export function commitRoomStamp() {
  var ghost = S.roomGhost, st = S.roomStamp, prepared = S.roomPrepared;
  if (!ghost || !st) return null;
  if (!prepared || !prepared.ok) {
    var prepareReason = prepared && prepared.reason;
    flash(prepareReason === "ROOM_OVERLAPS" ? t("rp_overlap")
      : t("rp_failed_reason", { reason: prepareReason || "ROOM_STAMP_FAILED" }), "error");
    return null;
  }
  /* Apply the plan the ghost was drawn from, rather than re-deriving it. The
     executor re-runs prepare and refuses if the two disagree, which is exactly
     the guarantee worth having here: what is committed is what was shown. */
  var result = executePrepared(prepared, roomCommandEnvironment(), { label: t("rp_placed") });
  if (!result.ok) {
    ghost.blocked = ghost.blocked || true;
    ghost.blockedReason = result.reason || "ROOM_STAMP_FAILED";
    S.roomPrepared = null;
    flash(result.reason === "ROOM_OVERLAPS" ? t("rp_overlap")
      : t("rp_failed_reason", { reason: result.reason || "ROOM_STAMP_FAILED" }), "error");
    render2D();
    return null;
  }
  var madeWallIds = result.created
    .filter(function (entry) { return entry.kind === "wall"; })
    .map(function (entry) { return entry.id; });
  // every wall the stamp built records its clear span, the same way a wall
  // drawn by hand does — otherwise the first dimension edit on one of them
  // has nothing to hold
  madeWallIds.forEach(function (id) {
    var w = wallById(id);
    if (!w) return;
    var clear = wallClearLength(w);
    if (clear > 0) w.clearL = clear;
  });
  var walls = S.walls.filter(function (w) { return madeWallIds.indexOf(w.id) >= 0; });
  reconcileRoomMeta();
  render2D();
  refreshTree();
  window.dispatchEvent(new CustomEvent("planner-room-created", { detail: { walls: walls } }));
  var dock = prepared.plan.params.dock;
  var opened = result.created.some(function (entry) { return entry.kind === "opening"; });
  var isConnOpen = prepared.plan.params.connMode === "open";
  /* Docked but unopened is worth saying out loud: it means the shared wall was
     too short, or too full, to take a door, and the room is sealed until the
     user cuts one. */
  flash(dock && isConnOpen ? t("rp_placedOpen")
    : dock && dock.mode === "corridor" ? t("rp_placedCorridor")
    : dock && dock.mode === "insert" ? t("rp_placedInsert")
    : opened ? t("rp_placedDocked")
    : dock ? t("rp_noDoor") : t("rp_placed"),
    dock && dock.mode !== "insert" && dock.mode !== "corridor" && !opened && !isConnOpen ? "error" : undefined);
  S.roomPrepared = null;
  if (st.checklistId) { disarmRoomStamp(); setTool("select"); }
  return result;
}

/* The planner's own wall split, in the shape js/room_graph.js asks for: cut at
   a point, hand back the node the halves now share. splitWallAt() re-homes
   openings, MEP devices, dimension locks and anchors onto that node, none of
   which the headless fallback in room_graph.js knows about. */
/* Follow a room that has just been dragged to its new key.
 *
   Its bounding walls change identity the moment it docks — one of them is now
   the neighbour's wall, another is half of what it was — so the key its name,
   floor and lock hang from stops naming anything. The generic repair in
   geometry.js cannot help here: it re-homes an orphan by the centroid the
   entry RECORDS, and a room that has just been dragged is no longer at the
   centroid it recorded. It is at the one the gesture just put it at, which is
   the only thing that knows.

   Also re-points the selection, because everything downstream in this
   pointerup — the corridor pass included — looks the room up by S.sel.ref. */
function rehomeDraggedRoom(drag, oldKey) {
  if (!oldKey) return;
  var meta = S.roomMeta[oldKey];
  var rooms = detectRooms();
  if (!meta || rooms.some(function (r) { return r.key === oldKey; })) return;
  var cx = 0, cz = 0, n = 0;
  (drag.orig || []).forEach(function (o) {
    var p = S.nodes[o.i];
    if (!p) return;
    cx += p.x; cz += p.z; n++;
  });
  if (!n) return;
  cx /= n; cz /= n;
  var home = rooms.find(function (r) {
    return !S.roomMeta[r.key] && pointInPolyR(cx, cz, r.pts);
  });
  if (!home) return;
  delete S.roomMeta[oldKey];
  meta.cx = home.cx;
  meta.cz = home.cz;
  S.roomMeta[home.key] = meta;
  if (S.sel && S.sel.kind === "room" && S.sel.ref === oldKey) S.sel.ref = home.key;
}

/* The edge handle under the pointer, for the room that is currently selected.
   The radius is in pixels so it stays grabbable at any zoom. */
function pickRoomEdge(px, pz) {
  if (!S.sel || S.sel.kind !== "room") return null;
  var reach = 11 / inputScale(), best = null;
  roomEdgeHandles(S.sel.ref).forEach(function (h) {
    var d = Math.hypot(h.x - px, h.z - pz);
    if (d <= reach && (!best || d < best.d)) best = Object.assign({ d: d }, h);
  });
  return best;
}

/* Keep a positive clear span; preset furnishing minima remain advisory. */
function roomEdgeLimit(key, handle) {
  var room = roomByKey(key);
  if (!room) return null;
  var clearMin = 20;
  var along = handle.axis === "x" ? "x" : "z";
  var lo = Infinity, hi = -Infinity;
  room.pts.forEach(function (p) {
    lo = Math.min(lo, p[along]);
    hi = Math.max(hi, p[along]);
  });
  var here = handle.axis === "x" ? handle.x : handle.z;
  // the side of the room this handle is NOT on
  var opposite = Math.abs(here - lo) < Math.abs(here - hi) ? hi : lo;
  return {
    axis: handle.axis,
    opposite: opposite,
    /* Which side of the far wall this one started on. Distance alone is not a
       limit: pushed far enough, the side sails straight through the opposite
       one and out the other side, and the room comes back the "right" size
       again — inside out, with its walls crossed. */
    sign: here >= opposite ? 1 : -1,
    minSpan: clearMin + (Number(handle.wall.thickness) || WALL_T),
  };
}

/* Build the hallway a room drag proposed, and open it at both ends.
 *
 * The corridor's two long walls are laid exactly on the faces they separate —
 * the dragged room's near side and the wall it stopped short of — so stampRect
 * finds both of them already standing and reports them as SHARED rather than
 * building a second wall on top of either. That is what makes the corridor a
 * space between two rooms instead of a box wedged between them, and it is why
 * the openings go through the shared walls rather than through anything new.
 *
 * Only ever called for a drop whose preview showed the corridor. */
function buildDragCorridor(drag) {
  var gap = drag && drag.corridor;
  if (!gap || !drag.dock || drag.dock.mode !== "corridor") return;
  var built = placeRoom(S, {
    preset: "corridor",
    rect: gap,
    spec: roomStampSpec(),
    dock: null,
    connect: false,
    // the gap between two rooms, by construction: nothing to overlap
    allowOverlap: true,
    detectRooms: detectRooms,
    splitWall: splitPlannerWallAt,
  });
  if (!built.ok) return;
  var live = detectRooms();
  var opened = 0;
  built.shared.forEach(function (id) {
    if (!wallById(id)) return;
    if (cutOpening(S, id, connectionForWall(S, id, live))) opened++;
  });
  built.created.forEach(function (id) {
    var w = wallById(id);
    if (!w) return;
    var clear = wallClearLength(w);
    if (clear > 0) w.clearL = clear;
  });
  S.dirty3D = true;
  reconcileRoomMeta();
  refreshTree();
  flash(opened ? t("rp_placedCorridor") : t("rp_placed"));
}

/* The walls a dragged room owns outright — both ends among the corners the
   gesture is moving. They are excluded from the dock solver, which would
   otherwise find the room's own far wall and pull it onto itself. */
function roomOwnWalls(drag) {
  var mine = {};
  (drag.orig || []).forEach(function (o) { mine[o.i] = 1; });
  var ids = new Set();
  S.walls.forEach(function (w) { if (mine[w.a] && mine[w.b]) ids.add(w.id); });
  return ids;
}

/* One space, one name. Merging a bathroom into a bedroom leaves two orphaned
   metadata entries whose centroids both fall inside the room that is left, and
   the generic reconciler in geometry.js hands the survivor whichever it reaches
   first — so knocking a cupboard through into a living room could rename the
   living room "Store". The room that contributed the most floor keeps its name,
   its finish and its lock; the smaller entry is dropped rather than left
   orphaned in the save. */
function adoptMergedRoomMeta(before) {
  var ranked = before.slice().sort(function (a, b) { return (b.area || 0) - (a.area || 0); });
  /* Through roomMetaKey, not S.roomMeta[key]. Today's caller hands over keys
     from a trace taken moments earlier, so they happen to be live — but the
     day a structural edit lands between the trace and the merge, reading by
     key alone silently makes the LARGER room the one with no metadata, and the
     small room's name wins. That is exactly how the open-mode merge broke. */
  var metaKeys = ranked.map(function (o) { return roomMetaKey(S, o); });
  var winner = metaKeys.map(function (k) { return k && S.roomMeta[k]; }).find(Boolean);
  if (!winner) return;
  var merged = detectRooms().find(function (r) {
    return before.every(function (o) { return o.key !== r.key; })
      && pointInPolyR(ranked[0].cx, ranked[0].cz, r.pts);
  });
  if (!merged) return;
  before.forEach(function (o) { delete S.roomMeta[o.key]; });
  metaKeys.forEach(function (k) { if (k) delete S.roomMeta[k]; });
  winner.cx = merged.cx;
  winner.cz = merged.cz;
  S.roomMeta[merged.key] = winner;
}

/* What happens when a room is DROPPED against another one.
 *
 * The drag itself only moves corners, so a room pushed up against its
 * neighbour arrives with two walls lying exactly on top of each other: one the
 * room brought, one the neighbour already had. That is not a party wall, it is
 * a defect — the face trace finds a zero-width room between them, the 3D view
 * builds both, and there is no single wall to hang a door on. It also looks
 * completely correct on screen, which is what makes it worth an explicit pass.
 *
 * So dropping finishes the join the drag implied, in the order the topology
 * needs:
 *
 *   1. a corner that landed in the MIDDLE of somebody else's wall splits it,
 *      turning a touch into a junction;
 *   2. corners that are now in the same place become one corner;
 *   3. two walls that now run between the same pair of corners become one —
 *      the survivor keeps the openings of both, because a door the user cut
 *      into either of them is a door they still want;
 *   4. and if that leaves a shared wall with nothing through it, the rooms get
 *      the door the gesture was obviously asking for.
 *
 * A drop that touches nothing does nothing here. */
function fuseDroppedRoom(drag) {
  if (!drag || !drag.orig || !drag.orig.length) return null;
  /* Corners the room owns. It GROWS: splitting one of the room's own walls
     gives it a new corner, and both halves are still the room's. */
  var mineNode = new Set(drag.orig.map(function (o) { return o.i; }));
  var isMine = function (w) { return mineNode.has(w.a) && mineNode.has(w.b); };

  // 1. somebody else's wall under one of my corners
  drag.orig.forEach(function (o) { cutUnder(o.i, function (w) { return !isMine(w); }); });
  /* 2. ...and MY wall under somebody else's corner, which is the same event
     seen from the other side. Cutting only one way looks symmetrical until the
     two walls are different lengths: drop a 330 cm corridor against a 310 cm
     room and none of the corridor's corners land inside the room's wall, so
     nothing was cut, nothing welded, and the two walls stayed overlapping —
     visibly joined, structurally two walls with a sliver between them. */
  var foreign = [], used = usedNodes();
  for (var uk in used) if (!mineNode.has(Number(uk))) foreign.push(Number(uk));
  foreign.forEach(function (ni) {
    var made = cutUnder(ni, isMine);
    if (made != null) mineNode.add(made);
  });

  /* Split whichever wall passing `accept` this corner is sitting in the middle
     of, and return the corner the two halves now share. One host per corner: a
     second pass would only find the half just made. */
  function cutUnder(ni, accept) {
    var p = S.nodes[ni];
    if (!p) return null;
    for (var k = 0; k < S.walls.length; k++) {
      var w = S.walls[k];
      if (!accept(w) || w.a === ni || w.b === ni) continue;
      var g = wallGeom(w), hit = wallProject(w, p.x, p.z);
      if (!g || !hit || !fin(g.L) || hit.distance > 2) continue;
      if (hit.s <= 2 || hit.s >= g.L - 2) continue;
      var cut = splitWallAt(w, hit.s);
      return fin(cut) ? cut : null;
    }
    return null;
  }
  weldCoincidentNodes();
  var fused = dedupeCoincidentWalls();
  if (!fused.length) return fused;
  S.dirty3D = true;
  reconcileRoomMeta();
  refreshTree();
  return fused;
}

/* Cut the connection through each wall the drop turned into a party wall.
 *
   Split out from the fuse, and run AFTER the dragged room has been re-keyed,
   because what the opening should BE is read off the two rooms' presets — and
   a room whose metadata key is still the pre-drop one looks, to that lookup,
   like a room with no preset at all. Doing this inside the fuse gave a corridor
   an 80 cm door instead of the passage it asks for. */
function connectFusedWalls(fused) {
  if (!fused || !fused.length) return;
  var live = detectRooms();
  var opened = 0;
  fused.forEach(function (id) {
    if (!wallById(id)) return;
    var made = cutOpening(S, id, connectionForWall(S, id, live));
    if (made) opened++;
  });
  if (opened) S.dirty3D = true;
  flash(opened ? t("rp_placedDocked") : t("rp_placed"));
}

/* Two walls between the same pair of corners are one wall. The survivor is the
   older one — it is the wall the rest of the drawing already refers to, in
   dimensions, in constraints and in whatever the user has selected. Returns
   the ids of the walls that turned out to be shared. */
function dedupeCoincidentWalls() {
  var byPair = {}, fused = [], dead = {};
  S.walls.forEach(function (w) {
    var lo = Math.min(w.a, w.b), hi = Math.max(w.a, w.b), key = lo + "_" + hi;
    var keep = byPair[key];
    if (!keep) { byPair[key] = w; return; }
    dead[w.id] = keep.id;
    if (fused.indexOf(keep.id) === -1) fused.push(keep.id);
  });
  if (!fused.length) return fused;
  /* The openings of the wall that goes come with it — but only where the
     survivor has room for them. Two rooms pushed together, each with a door in
     the wall they are about to share, is the ordinary case, and moving both
     doors across leaves two of them stacked at the same station: one wall, two
     coincident doors, drawn on top of each other and both real in 3D.

     Two passes, because one is not enough: the survivor's OWN openings have to
     be known before any are moved onto it. Checking against "everything seen so
     far" made the winner whichever door happened to come first in the array —
     which is to say, the wall that happened to be drawn first. */
  var staying = S.openings.filter(function (o) { return !dead[o.wall]; });
  var moved = [];
  S.openings.forEach(function (o) {
    if (!dead[o.wall]) return;
    var host = dead[o.wall];
    var taken = staying.concat(moved).some(function (q) {
      return q.wall === host && q.s + q.width / 2 > o.s - o.width / 2
        && q.s - q.width / 2 < o.s + o.width / 2;
    });
    if (taken) return; // the survivor already has a way through, there
    o.wall = host;
    moved.push(o);
  });
  S.openings = staying.concat(moved);
  S.walls = S.walls.filter(function (w) { return !dead[w.id]; });
  pruneCons();
  if (S.sel && S.sel.kind === "wall" && dead[S.sel.ref.id]) select(null);
  return fused;
}

function splitPlannerWallAt(state, wall, point) {
  var proj = wallProject(wall, point.x, point.z);
  if (!proj || !fin(proj.s)) return null;
  var ni = splitWallAt(wall, proj.s);
  return fin(ni) ? ni : null;
}

function commitSlabFromTo(a, b) {
  var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  var z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  if (x1 - x0 < 40 || z1 - z0 < 40) {
    flash(tTouch("hint_tool_slabvoid"));
    return null;
  }
  pushHistory();
  var o = openingFromRect(a, b);
  if (!o) return null;
  S.dirty3D = true;
  render2D();
  refreshTree();
  select({ kind: "slabvoid", ref: o });
  broadcastPlanOp({ type: "slabAdd", opening: JSON.parse(JSON.stringify(o)) });
  return o;
}

/* Replace a sharp shared corner with a true tangent arc.  Validation happens
   before history is pushed, so an infeasible radius never creates a ghost
   undo step.  The two original wall ids survive (important for dimensions and
   schedules); only their meeting ends move to the tangent points. */
export function filletSelectedWalls(radius) {
  var walls = S.sel && S.sel.kind === "walls" ? S.sel.refs : null;
  if (!walls || walls.length !== 2) return { ok: false, reason: "selection" };
  var proposal = proposeWallFillet(S, walls[0], walls[1], radius);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyWallFillet(S, walls[0], walls[1], radius, { makeId: uid });
  if (!result.ok) return result;
  captureLock(walls[0]); captureClear(walls[0]);
  captureLock(walls[1]); captureClear(walls[1]);
  captureLock(result.wall); captureClear(result.wall);
  pruneCons();
  S.dirty3D = true;
  select({ kind: "wall", ref: result.wall });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Cut back both arms by the same authored distance and bridge them with a
   straight semantic wall.  This is a wall operation, not a decorative line,
   so the diagonal participates in rooms, layers, schedules and 3D. */
export function chamferSelectedWalls(distance) {
  var walls = S.sel && S.sel.kind === "walls" ? S.sel.refs : null;
  if (!walls || walls.length !== 2) return { ok: false, reason: "selection" };
  var proposal = proposeWallChamfer(S, walls[0], walls[1], distance);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyWallChamfer(S, walls[0], walls[1], distance, { makeId: uid });
  if (!result.ok) return result;
  captureLock(walls[0]); captureClear(walls[0]);
  captureLock(walls[1]); captureClear(walls[1]);
  captureLock(result.wall); captureClear(result.wall);
  pruneCons();
  S.dirty3D = true;
  select({ kind: "wall", ref: result.wall });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Collapse a generated arc/diagonal connector and extend its two original
   arms back to their current line intersection. */
export function restoreSelectedSharpCorner() {
  var connector = S.sel && S.sel.kind === "wall" ? S.sel.ref : null;
  var proposal = proposeCornerRestore(S, connector);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyCornerRestore(S, connector);
  if (!result.ok) return result;
  result.arms.forEach(function (wall) { captureLock(wall); captureClear(wall); });
  pruneCons();
  S.dirty3D = true;
  select({ kind: "node", ref: result.jointNode });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Parametric edit/convert for a generated corner connector. */
export function updateSelectedCornerTreatment(type, value) {
  var connector = S.sel && S.sel.kind === "wall" ? S.sel.ref : null;
  var proposal = proposeCornerTreatmentUpdate(S, connector, type, value);
  if (!proposal.ok) return proposal;
  pushHistory();
  prepareStableAnchors();
  var result = applyCornerTreatmentUpdate(S, connector, type, value);
  if (!result.ok) return result;
  result.arms.forEach(function (wall) { captureLock(wall); captureClear(wall); });
  captureLock(result.wall); captureClear(result.wall);
  pruneCons();
  S.dirty3D = true;
  select({ kind: "wall", ref: result.wall });
  refreshTree();
  renderWarnPanel(true);
  render2D();
  return result;
}

/* Three-point circular wall: start, a point on the desired arc, then end.
   Endpoints participate in the normal topology/splitting model; the through
   point is geometric control only. */
export function arcWallPoint(p) {
  if (!p || !fin(p.x) || !fin(p.z)) return null;
  var draft = S.arcDraft;
  if (!draft) {
    p = resolveLanding(p, true);
    if (p.blockedOpening != null) { flash(t("wall_opening_blocked"), "error"); return null; }
    // Keep the first point detached until a complete arc can be committed.
    // Cancelling or switching views must not leave a node or split a host.
    S.arcDraft = { startNode: p.node ?? null, startPoint: { x: p.x, z: p.z }, through: null };
    S.previewPt = { x: p.x, z: p.z };
    render2D();
    return null;
  }
  if (!draft.through) {
    draft.through = { x: p.x, z: p.z };
    S.previewPt = { x: p.x, z: p.z };
    render2D();
    return null;
  }
  p = resolveLanding(p, true);
  if (p.blockedOpening != null) { flash(t("wall_opening_blocked"), "error"); return null; }
  var start = S.nodes[draft.startNode] || draft.startPoint, arc = makeArcFromThreePoints(start, draft.through, p);
  if (!arc) { flash(t("f_placeFail"), "error"); return null; }
  pushHistory();
  var startNode = draft.startNode ?? getOrMakeNode(resolveLanding(start, true));
  var endNode = getOrMakeNode(resolveLanding({ x: p.x, z: p.z }, true)), made = null;
  if (endNode !== startNode) {
    made = applyWallDrawDefaults({
      id: uid(), a: startNode, b: endNode, thickness: WALL_T, height: WALL_H,
      geometry: { type: "arc", bulge: arc.bulge },
    });
    S.walls.push(made);
    captureLock(made); captureClear(made);
  }
  S.arcDraft = { startNode: endNode, through: null };
  S.previewPt = { x: S.nodes[endNode].x, z: S.nodes[endNode].z };
  S.dirty3D = true;
  if (made) captureLock(made);
  render2D(); refreshTree();
  return made;
}

/* Place the next wall point at an exact length + absolute angle from the
   corner being drawn from. Degrees follow the inspector's ANGLE field —
   atan2(dz,dx), 0 = east, -90 = up the plan — so a length/angle pair typed
   here and the same pair read back off a selected wall are the same numbers. */
export function wallPointPolar(len, angDeg) {
  if (!S.drawing || S.drawFrom == null) return null;
  var a = S.nodes[S.drawFrom];
  if (!a || !fin(len) || len <= 0) return null;
  var r = (angDeg * Math.PI) / 180;
  /* A typed length is an INTERIOR measurement like every other length in the
     editor, so the corner this wall grows out of is added back before the far
     end is placed — type 300 next to a 10 cm wall and the finished wall reads
     300 inside, not 295. */
  var run = len + (S.interiorDims !== false ? pendingCuts(S.drawFrom, null) : 0);
  return wallPoint({
    x: a.x + Math.cos(r) * run,
    z: a.z + Math.sin(r) * run,
    node: null,
    wall: null,
  });
}

/* The rectangle / slab-void tools' second corner from a typed width and depth
   (js/cad_hud.js). Same outcome as the second click: commit, then back to
   select. Signs pick the quadrant the rubber band was pointing into. */
export function rectPointTyped(w, d) {
  if (!S.rectDraft || (S.tool !== "rect" && S.tool !== "slabvoid")) return null;
  if (!fin(w) || !fin(d) || !w || !d) return null;
  var a = S.rectDraft;
  var to = { x: a.x + w, z: a.z + d };
  var made = S.tool === "rect" ? commitRectFromTo(a, to) : commitSlabFromTo(a, to);
  if (made) setTool("select");
  S.rectDraft = null;
  S.previewPt = null;
  render2D();
  return made;
}

// smallest signed angular difference a-b, wrapped to [-π,π]
function angDelta(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export {
  adoptMergedRoomMeta, angDelta, buildDragCorridor, commitSlabFromTo,
  connectFusedWalls, fuseDroppedRoom, pickRoomEdge, rehomeDraggedRoom,
  roomEdgeLimit, roomOwnWalls,
};

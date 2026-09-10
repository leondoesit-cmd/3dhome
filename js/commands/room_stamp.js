/* Placing a preset room, as a command.
 *
 * The gesture already worked: js/room_stamp.js builds the room, js/room_dock.js
 * decides where it lands, js/interaction.js drives the pointer. What it did not
 * do was go through the command layer, and three things follow from that. The
 * agent cannot place a room. The command log has no record of one being placed.
 * And the preview and the commit were two separate pieces of code that had to
 * agree with each other by hand — the ghost resolved a rectangle, and then the
 * click resolved it again.
 *
 * So the whole resolution lives in prepare(): preset to rectangle, the grid
 * fallback, the dock solve, the overlap refusal. The ghost is a preview of a
 * prepared plan and the click applies that same plan, which is the point of
 * the command layer rather than a formality — the two cannot drift.
 *
 * A REFUSAL STILL CARRIES ITS RECTANGLE. prepareCommand() folds every field of
 * a failed prepare into the failure, so a stamp that would land on an existing
 * room comes back as { ok: false, reason: "ROOM_OVERLAPS", rect } and the plan
 * can draw the ghost in red where the pointer actually is. Refusing with
 * nothing to show would make the ghost disappear exactly when the user most
 * needs to see where it is.
 */
import { planningGuide, assignChecklistRoom } from "../planning_guide.js";
import { roomPreset, presetRect, rectInterior } from "../room_presets.js";
import { solveDock, corridorRect, translateRect } from "../room_dock.js";
import { rectOverlapsRooms, DEFAULT_WALL_SPEC } from "../room_graph.js";
import { placeRoom, proposeInsert } from "../room_stamp.js";

export const ROOM_STAMP_CODES = Object.freeze([
  "UNKNOWN_PRESET",
  "INVALID_ROOM_ORIGIN",
  "ROOM_TOO_SMALL",
  "ROOM_OVERLAPS",
  "ROOM_STAMP_FAILED",
]);

/* SNAP_GRID's value, as a literal. Every module under commands/ keeps its own
   defaults rather than importing js/state.js — a command has to be executable
   against a caller-supplied state object, not the planner's global one. */
const GRID = 5;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function fail(reason, extra) {
  return Object.assign({ ok: false, reason: reason }, extra || {});
}

function versionOf(env) {
  if (env && env.version && typeof env.version.current === "function") return env.version.current();
  if (env && env.version != null && typeof env.version !== "object") return env.version;
  return null;
}

/* The face trace, if the caller has one to give. The planner injects
   geometry.js's; a headless client that injects nothing gets no overlap check
   here, and falls through to placeRoom's own guard at apply. */
function traceOf(env) {
  const fn = env && env.services && env.services.detectRooms;
  return typeof fn === "function" ? fn() : null;
}

function specOf(params) {
  const spec = Object.assign({}, DEFAULT_WALL_SPEC);
  const wanted = params.spec || params;
  ["thickness", "height"].forEach((key) => {
    if (finite(Number(wanted[key])) && Number(wanted[key]) > 0) spec[key] = Number(wanted[key]);
  });
  if (wanted.type) spec.wallTypeId = String(wanted.type);
  if (wanted.wallTypeId) spec.wallTypeId = String(wanted.wallTypeId);
  ["kind", "loc", "datum", "phase"].forEach((key) => {
    if (wanted[key]) spec[key] = String(wanted[key]);
  });
  if (finite(Number(wanted.dimSide))) spec.dimSide = Number(wanted.dimSide);
  return spec;
}

export function prepareRoomStamp(params, env) {
  params = params || {};
  const state = env && env.state;
  const preset = roomPreset(params.preset);
  if (!preset) return fail("UNKNOWN_PRESET");
  const x = Number(params.x), z = Number(params.z);
  if (!finite(x) || !finite(z)) return fail("INVALID_ROOM_ORIGIN");

  const entry = params.checklistId ? planningGuide(state).rooms.find((room) => room.id === params.checklistId) : null;
  if (params.checklistId) {
    if (!entry || entry.type !== preset.id) return fail("INVALID_CHECKLIST_ENTRY");
    if (entry.roomHid && (entry.floorId !== state.workspace.activeFloor
        ? (state.workspace.floors || []).some((floor) => floor.id === entry.floorId)
        : (traceOf(env) || []).some((room) => state.roomMeta[room.key]?.hid === entry.roomHid)))
      return fail("ROOM_ALREADY_ASSIGNED");
  }
  const spec = specOf(params);
  const width = finite(Number(params.w)) ? Number(params.w) : preset.w;
  const depth = finite(Number(params.d)) ? Number(params.d) : preset.d;
  if (width < 20 || depth < 20) return fail("ROOM_TOO_SMALL");

  let rect = presetRect(preset, x, z, {
    thickness: spec.thickness, rot: params.rot, w: width, d: depth,
  });

  /* The dock gets first refusal and the grid only speaks when nothing is in
     reach: a room snapped to the grid but three centimetres off its neighbour
     is worse than one flush against it and off the grid. */
  const dock = params.dock === false ? null : solveDock(state, rect, {
    snap: 60 * (finite(Number(state && state.snapStrength)) ? Number(state.snapStrength) : 1),
    abutOnly: !!params.abutOnly,
  });
  if (dock) rect = translateRect(rect, dock.dx, dock.dz);
  else if (params.grid !== false && !(state && state.gsnap === false)) {
    rect = translateRect(rect,
      Math.round(rect.x0 / GRID) * GRID - rect.x0,
      Math.round(rect.z0 / GRID) * GRID - rect.z0);
  }

  const rooms = traceOf(env);
  const clash = rectOverlapsRooms(rect, rooms);
  let usedDock = dock;
  if (clash) {
    const insert = proposeInsert(rect, dock, rooms);
    if (!insert) return fail("ROOM_OVERLAPS", { rect: rect, room: clash.key, dock: dock });
    usedDock = insert;
  }

  return {
    ok: true,
    plan: {
      command: "room.stamp",
      expectedVersion: params.expectedVersion != null ? params.expectedVersion : versionOf(env),
      params: {
        preset: preset.id,
        checklistId: entry ? entry.id : "",
        checklistName: entry ? entry.name : "",
        rect: rect,
        dock: usedDock || null,
        corridor: usedDock && usedDock.mode === "corridor" ? corridorRect(rect, usedDock) : null,
        spec: spec,
        connect: params.connect !== false,
        connMode: params.connMode || "auto",
        doorWallIndex: params.doorWallIndex != null ? Number(params.doorWallIndex) : 0,
        size: rectInterior(rect, spec.thickness),
      },
    },
  };
}

export function previewRoomStamp(plan) {
  const params = plan && plan.params;
  if (!params || !params.rect) return null;
  const r = params.rect;
  return {
    kind: "room",
    outline: [
      { x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 },
      { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 },
    ],
    corridor: params.corridor,
    dock: params.dock,
    connMode: params.connMode,
    size: params.size,
    style: "ghost-valid",
  };
}

export function applyRoomStamp(plan, env) {
  const params = plan && plan.params;
  const state = env && env.state;
  if (!params || !params.rect || !state) return fail("ROOM_STAMP_FAILED");
  const services = env.services || {};
  const out = placeRoom(state, {
    preset: params.preset,
    rect: params.rect,
    dock: params.dock,
    spec: params.spec,
    connect: params.connect,
    connMode: params.connMode,
    doorWallIndex: params.doorWallIndex,
    rooms: traceOf(env),
    detectRooms: typeof services.detectRooms === "function" ? services.detectRooms : undefined,
    splitWall: typeof services.splitWall === "function" ? services.splitWall : undefined,
  });
  if (!out.ok) return fail(out.reason || "ROOM_STAMP_FAILED", { room: out.room });

  if (params.checklistId) {
    const assignment = assignChecklistRoom(state, params.checklistId, out.key);
    if (!assignment.ok) return assignment;
  }
  const created = out.created.map((id) => ({ kind: "wall", id: id }))
    .concat(out.openings.map((o) => ({ kind: "opening", id: o.id })));
  const deleted = (out.removedShared || []).map((w) => ({ kind: "wall", id: w.id }));
  return {
    ok: true,
    created: created,
    deleted: deleted,
    mode: out.mode,
    // a shared wall is not new, but it now bounds a room it did not before and
    // may have gained the door through it
    changed: out.shared.map((id) => ({ kind: "wall", id: id }))
      .concat(params.checklistId ? [{ kind: "project", id: state.workspace.id }] : []),
    effects: {
      dirty3D: true,
      refreshTree: true,
      refreshInspector: true,
      events: [{
        type: "planner-room-created",
        wallIds: out.created.concat(out.shared),
        roomKey: out.key,
      }],
    },
  };
}

export const roomStampCommand = Object.freeze({
  id: "room.stamp",
  failureCodes: ROOM_STAMP_CODES,
  prepare: prepareRoomStamp,
  preview: previewRoomStamp,
  apply: applyRoomStamp,
});

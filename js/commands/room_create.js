// Rectangular room authoring command. A room is derived from its closed wall
// loop, so this command materializes four wall plans inside the executor's one
// transaction rather than inventing a second stored room entity.
import { applyWallDraw, prepareWallDraw } from "./wall_draw.js";

export const ROOM_CREATE_CODES = Object.freeze([
  "INVALID_ROOM_BOUNDS",
  "ROOM_TOO_SMALL",
  "ROOM_WALL_FAILED",
]);

function finitePoint(value) {
  return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.z))
    ? { x: Number(value.x), z: Number(value.z) }
    : null;
}

function fail(reason) {
  return { ok: false, reason: reason };
}

export function prepareRoomCreate(params, env) {
  params = params || {};
  var a = finitePoint(params.from), b = finitePoint(params.to);
  if (!a || !b) return fail("INVALID_ROOM_BOUNDS");
  var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  var z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  if (x1 - x0 < 20 || z1 - z0 < 20) return fail("ROOM_TOO_SMALL");
  var points = [
    { x: x0, z: z0 }, { x: x1, z: z0 },
    { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
  var shared = {};
  ["type", "kind", "loc", "dimSide", "height", "thickness", "datum", "phase"].forEach(function (key) {
    if (params[key] != null) shared[key] = params[key];
  });
  var walls = [];
  for (var i = 0; i < 4; i++) {
    var prepared = prepareWallDraw(Object.assign({}, shared, {
      from: points[i], to: points[(i + 1) % 4], expectedVersion: params.expectedVersion,
    }), env);
    if (!prepared.ok) return fail(prepared.reason || "ROOM_WALL_FAILED");
    walls.push(prepared.plan.params);
  }
  return {
    ok: true,
    plan: {
      command: "room.create",
      expectedVersion: params.expectedVersion != null
        ? params.expectedVersion
        : env && env.version && typeof env.version.current === "function"
          ? env.version.current() : null,
      params: {
        bounds: { x0: x0, z0: z0, x1: x1, z1: z1 }, walls: walls,
        name: params.name == null ? "" : String(params.name).slice(0, 120),
        isCorridor: !!params.isCorridor,
      },
    },
  };
}

export function previewRoomCreate(plan) {
  var bounds = plan && plan.params && plan.params.bounds;
  if (!bounds) return null;
  return {
    kind: "room",
    outline: [
      { x: bounds.x0, z: bounds.z0 }, { x: bounds.x1, z: bounds.z0 },
      { x: bounds.x1, z: bounds.z1 }, { x: bounds.x0, z: bounds.z1 },
    ],
    style: "ghost-valid",
  };
}

export function applyRoomCreate(plan, env) {
  var params = plan && plan.params;
  if (!params || !Array.isArray(params.walls) || params.walls.length !== 4)
    return fail("INVALID_ROOM_BOUNDS");
  var created = [], changed = [], wallIds = [];
  for (var i = 0; i < params.walls.length; i++) {
    var result = applyWallDraw({ command: "wall.draw", params: params.walls[i] }, env);
    if (!result.ok) return fail(result.reason || "ROOM_WALL_FAILED");
    created.push(...(result.created || []));
    changed.push(...(result.changed || []));
    (result.created || []).forEach(function (entry) {
      if (entry.kind === "wall") wallIds.push(entry.id);
    });
  }
  var roomKey = wallIds.slice().sort(function (a, b) { return Number(a) - Number(b); }).join(",");
  if (roomKey && env && env.state && env.state.roomMeta) {
    env.state.roomMeta[roomKey] = {
      name: params.name || "",
      isCorridor: !!params.isCorridor,
    };
  }
  return {
    ok: true,
    created: created,
    changed: changed,
    effects: {
      dirty3D: true,
      refreshTree: true,
      refreshInspector: true,
      events: [{ type: "planner-room-created", wallIds: wallIds, roomKey: roomKey }],
    },
  };
}

export const roomCreateCommand = Object.freeze({
  id: "room.create",
  failureCodes: ROOM_CREATE_CODES,
  prepare: prepareRoomCreate,
  preview: previewRoomCreate,
  apply: applyRoomCreate,
});

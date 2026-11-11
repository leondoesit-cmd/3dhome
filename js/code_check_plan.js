/* The live plan, described the way js/code_check.js reads it: one record per
   detected room with its type, clear area, clear width, clear height, the
   windows serving it and whether it has a door to the outside; the stair
   flights; the railing walls.

   Approximations, stated in the report so nobody mistakes them for survey
   data: the clear height is the lowest wall height round the room (no slab or
   ceiling build-up subtracted), the clear width is the short side of the
   room's interior bounding box, and window areas are rough openings. */
import { S, WALL_H, WALL_T } from "./state.js";
import { detectRooms } from "./geometry.js";
import { roomTypeOf } from "./room_types.js";
import { interiorBox, openingSides, polyArea } from "./apartment_rules.js";
import { activeFloorArea } from "./area_snapshot.js";
import { normalizeWallKind } from "./wall_curves.js";

function roomWallIds(room) {
  return (room.wallIds || String(room.key).split(",")).map(String);
}

// The finished-floor area the rulebook uses, for a room the exact area
// service could not resolve (curved or railing walls on the floor).
function approximateArea(room) {
  const n = room.pts.length;
  const perimeter = room.pts.reduce((sum, p, i) => sum + Math.hypot(room.pts[(i + 1) % n].x - p.x, room.pts[(i + 1) % n].z - p.z), 0);
  return (polyArea(room.pts) - perimeter * WALL_T / 2 + n * WALL_T * WALL_T / 4) / 10000;
}

export function planForCodeCheck(state = S) {
  const walls = state.walls || [], openings = state.openings || [], items = state.items || [];
  const rooms = detectRooms();
  let exact = null;
  try { exact = activeFloorArea(); } catch { exact = null; }
  const exactArea = new Map((exact && exact.entries || []).map((e) => [e.key, e.area]));
  const wallById = new Map(walls.map((w) => [String(w.id), w]));
  const perRoom = new Map(rooms.map((r) => [r.key, { windows: [], glazing: 0, exteriorDoor: false }]));

  openings.forEach((op) => {
    if (op.type !== "window" && op.type !== "door") return;
    const sides = openingSides(op, walls, rooms);
    if (!sides) return;
    [sides.a, sides.b].forEach((room) => {
      const rec = room && perRoom.get(room.key);
      if (!rec) return;
      if (op.type === "window") {
        rec.windows.push({ id: op.id, width: op.width, height: op.height, sill: op.sill || 0 });
        rec.glazing += op.width * op.height / 10000;
      } else if (!sides.a || !sides.b) rec.exteriorDoor = true;
    });
  });

  const meta = state.roomMeta || {};
  const planRooms = rooms.map((room) => {
    const b = interiorBox(room);
    const own = roomWallIds(room).map((id) => wallById.get(id)).filter(Boolean)
      .filter((w) => normalizeWallKind(w) === "normal");
    const heights = own.map((w) => Number(w.height)).filter((h) => Number.isFinite(h) && h > 0);
    const thick = own.map((w) => Number(w.thickness)).filter((t) => Number.isFinite(t) && t > 0);
    const area = exactArea.get(room.key);
    return {
      key: room.key,
      name: (meta[room.key] && meta[room.key].name) || null,
      type: roomTypeOf(meta[room.key]),
      area: Number.isFinite(area) ? area : approximateArea(room),
      width: Math.min(b.x1 - b.x0, b.z1 - b.z0),
      ceiling: heights.length ? Math.min(...heights) : (own.length ? WALL_H : null),
      wallThickness: thick.length ? Math.min(...thick) : (own.length ? WALL_T : null),
      ...perRoom.get(room.key),
    };
  });

  const stairs = items.filter((it) => it.type === "stairs").map((it) => {
    const steps = Number(it.configuration && it.configuration.stepCount) || Number(it.steps) || 10;
    const shape = (it.configuration && it.configuration.shape) || "straight";
    return {
      id: it.id,
      riser: Number(it.riserHeight) || it.h / steps,
      // a riser block carries one tread, so a straight flight's going is its
      // depth over the step count; winders and spirals are not measured here
      tread: shape === "straight" ? (Number(it.treadDepth) || it.d / steps) : null,
    };
  });
  const guards = walls.filter((w) => normalizeWallKind(w) === "railing")
    .map((w) => ({ id: w.id, height: Number(w.height) || 0 }));
  return { rooms: planRooms, stairs, guards };
}

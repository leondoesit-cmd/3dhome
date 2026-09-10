import test from "node:test";
import assert from "node:assert/strict";
import { planningGuide, normalizePlanningGuide, checklistStatus } from "../js/planning_guide.js";
import { planningGuideCommand } from "../js/commands/planning_guide.js";
import { roomStampCommand } from "../js/commands/room_stamp.js";
import { executeCommand, prepareCommand, executePrepared } from "../js/commands/executor.js";
import { roomTypeOf } from "../js/room_types.js";

function fixture() {
  const state = { nodes: [], walls: [], items: [], openings: [], roomMeta: {}, idc: 1,
    workspace: { id: "p", activeFloor: "f1", floors: [{ id: "f1" }, { id: "f2" }] } };
  let faces = [], snapshot, version = 0;
  const env = { state, version: { current: () => version },
    history: { current: () => version, begin: () => { snapshot = structuredClone(state); return {}; },
      commit: () => { version++; }, abort: () => { Object.assign(state, snapshot); } },
    services: { detectRooms: () => faces } };
  const edit = (params) => executeCommand(planningGuideCommand, params, env);
  return { state, env, edit, faces: (value) => { faces = value; } };
}

test("old and malformed files have compatible, unprotected defaults", () => {
  assert.deepEqual(normalizePlanningGuide(null), { version: 1, enabled: false, intention: "explore", details: { entrances: {}, routeWidth: 60, propertyType: "unspecified", usableAreaTarget: null }, rooms: [] });
  const out = normalizePlanningGuide({ intention: "bad", details: { usableAreaTarget: -1 }, rooms: [null, { id: "a", type: "bad" }, { id: "a" }] });
  assert.equal(out.rooms.length, 1);
  assert.equal(out.rooms[0].type, "bedroom");
  assert.equal(out.details.usableAreaTarget, null);
});

test("changing project preferences never changes geometry, snap settings or locks", () => {
  const { state, edit } = fixture();
  state.snapGrid = 5;
  const before = JSON.stringify([state.nodes, state.walls, state.openings, state.items]);
  assert.equal(edit({ action: "settings", intention: "recreate", enabled: true, usableAreaTarget: 83.47 }).ok, true);
  assert.equal(JSON.stringify([state.nodes, state.walls, state.openings, state.items]), before);
  assert.equal(state.snapGrid, 5);
  assert.equal(state.workspace.guidance.details.usableAreaTarget, 83.47);
});

test("checklist assignment follows hid across wall re-keying and goes unplaced when the face disappears", () => {
  const f = fixture();
  f.edit({ action: "add", id: "bed", type: "bedroom", name: "My room" });
  f.state.roomMeta.old = { hid: "r1" };
  f.faces([{ key: "old" }]);
  assert.equal(f.edit({ action: "assign", id: "bed", roomKey: "old" }).ok, true);
  f.state.roomMeta.new = f.state.roomMeta.old;
  delete f.state.roomMeta.old;
  assert.equal(checklistStatus(f.state, [{ key: "new" }])[0].roomKey, "new");
  assert.equal(checklistStatus(f.state, [])[0].status, "unplaced");
  f.state.workspace.activeFloor = "f2";
  assert.equal(checklistStatus(f.state, [])[0].status, "other_floor");
  f.state.workspace.floors = [{ id: "f2" }];
  assert.equal(checklistStatus(f.state, [])[0].status, "unplaced");
});

test("one room cannot fulfill two entries; removing or skipping entries preserves geometry", () => {
  const f = fixture();
  for (const id of ["a", "b"]) f.edit({ action: "add", id, type: "bedroom" });
  f.state.roomMeta.k = { hid: "r4" }; f.faces([{ key: "k" }]);
  assert.equal(f.edit({ action: "assign", id: "a", roomKey: "k" }).ok, true);
  assert.equal(f.edit({ action: "assign", id: "b", roomKey: "k" }).reason, "ROOM_ALREADY_ASSIGNED");
  f.edit({ action: "edit", id: "a", name: "Study", type: "office" });
  assert.equal(f.state.roomMeta.k.roomType, "office");
  f.edit({ action: "move", id: "a", direction: 1 });
  assert.deepEqual(planningGuide(f.state).rooms.map((room) => room.id), ["b", "a"]);
  f.edit({ action: "skip", id: "b" });
  assert.equal(checklistStatus(f.state, [{ key: "k" }])[0].status, "skipped");
  const meta = structuredClone(f.state.roomMeta);
  f.edit({ action: "remove", id: "a" });
  assert.deepEqual(f.state.roomMeta, meta);
});

test("a checklist stamp assigns its semantic room inside the transaction and rolls back as a whole", () => {
  const f = fixture();
  f.edit({ action: "add", id: "a", type: "bedroom", name: "Guest bedroom" });
  const before = structuredClone(f.state);
  const failed = executeCommand(roomStampCommand, { preset: "bedroom", checklistId: "a", x: 0, z: 0, dock: false }, f.env,
    { postValidate: () => ({ ok: false, reason: "TEST_REFUSAL" }) });
  assert.equal(failed.reason, "TEST_REFUSAL");
  assert.deepEqual(f.state, before);
  const result = executeCommand(roomStampCommand, { preset: "bedroom", checklistId: "a", x: 0, z: 0, dock: false }, f.env);
  assert.equal(result.ok, true);
  const [key] = Object.keys(f.state.roomMeta);
  assert.equal(f.state.roomMeta[key].name, "Guest bedroom");
  assert.equal(f.state.roomMeta[key].roomType, "bedroom");
  assert.equal(checklistStatus(f.state, [{ key }])[0].status, "placed");
  f.faces([{ key }]);
  assert.equal(prepareCommand(roomStampCommand, { preset: "bedroom", checklistId: "a", x: 900, z: 0 }, f.env).reason, "ROOM_ALREADY_ASSIGNED");
});

test("renaming a requirement invalidates an already visible placement preview", () => {
  const f = fixture();
  f.edit({ action: "add", id: "a", type: "bedroom", name: "Before" });
  const prepared = prepareCommand(roomStampCommand, { preset: "bedroom", checklistId: "a", x: 0, z: 0 }, f.env);
  assert.equal(prepared.ok, true);
  f.edit({ action: "edit", id: "a", name: "After" });
  assert.equal(executePrepared(prepared, f.env).reason, "PREVIEW_INVALIDATED");
  assert.equal(f.state.walls.length, 0);
});

test("explicit room types override renamed or translated display names", () => {
  assert.equal(roomTypeOf({ name: "חדר ילדים", roomType: "kidsRoom" }), "kidsRoom");
  assert.equal(roomTypeOf({ name: "Bathroom", roomType: "bedroom" }), "bedroom");
  assert.equal(roomTypeOf({ name: "Bedroom 2" }), "kidsRoom");
  assert.equal(roomTypeOf({ name: "Bedroom", roomType: "unknown" }), null);
});

test("viewer roles cannot change the guide", () => {
  const f = fixture(); f.state.workspace.role = "viewer";
  assert.equal(f.edit({ action: "add", id: "a", type: "bedroom" }).reason, "READ_ONLY");
  assert.equal(f.state.workspace.guidance, undefined);
});

test("a requirement assigned to a removed floor can be placed again", () => {
  const f = fixture();
  f.edit({ action: "add", id: "a", type: "bedroom" });
  Object.assign(f.state.workspace.guidance.rooms[0], { roomHid: "gone", floorId: "removed" });
  assert.equal(checklistStatus(f.state, [])[0].status, "unplaced");
  const result = executeCommand(roomStampCommand, { preset: "bedroom", checklistId: "a", x: 0, z: 0 }, f.env);
  assert.equal(result.ok, true);
  assert.equal(f.state.workspace.guidance.rooms[0].floorId, "f1");
});

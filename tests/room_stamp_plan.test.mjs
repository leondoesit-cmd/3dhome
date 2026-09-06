/* The other room-stamp suite (tests/room_stamp.test.mjs) runs against a plain
   object and counts faces with Euler's formula, which keeps it fast and free of
   the planner's global state — but it cannot see the thing that actually goes
   wrong when a stamp lands badly. A shredded plan is still a valid planar
   graph; what breaks is that the FACE TRACE finds sub-faces carrying nobody's
   metadata key, and rooms that were already named lose their names.

   So this suite drives the real S through the real detectRooms(). */
import test from "node:test";
import assert from "node:assert/strict";

import { S } from "../js/state.js";
import { detectRooms, roomClearSize, applyRoomClearSize } from "../js/geometry.js";
import { placeRoom, stampPresetAt, connectionForWall } from "../js/room_stamp.js";
import { roomStampCommand } from "../js/commands/room_stamp.js";
import { detachRoomSeam } from "../js/room_graph.js";
import { executeCommand, prepareCommand } from "../js/commands/executor.js";

function blankPlan() {
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.roomMeta = {};
  S.idc = 1;
  return S;
}

const plan = () => ({ rooms: detectRooms(), detectRooms });
const nameOf = (key) => (S.roomMeta[key] && S.roomMeta[key].name) || null;
const namedRooms = () => detectRooms().map((r) => nameOf(r.key));

test("a stamped room is a room the face trace can find, by name", () => {
  blankPlan();
  const out = stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  assert.ok(out.ok);
  const rooms = detectRooms();
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].key, out.key, "the key metadata was hung on is the key the trace produced");
  assert.equal(nameOf(rooms[0].key), "Bedroom");
});

test("docking a second room leaves two named rooms and one party wall", () => {
  blankPlan();
  const first = stampPresetAt(S, "livingKitchen", 0, 0, { dock: null });
  const second = stampPresetAt(S, "bedroom", 460, 30, plan());
  assert.ok(first.ok && second.ok);
  assert.equal(second.dock.mode, "abut");
  assert.equal(second.shared.length, 1);

  const rooms = detectRooms();
  assert.equal(rooms.length, 2);
  assert.deepEqual(namedRooms().sort(), ["Bedroom", "Living / kitchen"]);
  const party = String(second.shared[0]);
  assert.ok(rooms.every((r) => String(r.key).split(",").indexOf(party) !== -1),
    "the shared wall bounds both rooms");
  assert.equal(S.openings.filter((o) => String(o.wall) === party).length, 1);
});

test("a stamp that would shred the plan is refused, and the neighbours keep their names", () => {
  blankPlan();
  placeRoom(S, { preset: "bedroom", rect: { x0: 0, z0: 0, x1: 300, z1: 300 }, spec: {} });
  placeRoom(S, { preset: "kitchen", rect: { x0: 0, z0: 300, x1: 300, z1: 600 }, spec: {} });
  const before = namedRooms().sort();
  assert.deepEqual(before, ["Bedroom", "Kitchen"]);

  // across both of them: the case that used to leave five unnamed faces and
  // three orphaned metadata entries
  const out = placeRoom(S, {
    preset: "living", rect: { x0: 150, z0: 150, x1: 500, z1: 450 }, spec: {}, ...plan(),
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "ROOM_OVERLAPS");
  assert.deepEqual(namedRooms().sort(), before, "the rooms that were already there are untouched");
  assert.deepEqual(
    Object.keys(S.roomMeta).filter((k) => !detectRooms().some((r) => r.key === k)),
    [],
    "no orphaned metadata",
  );
});

test("an island stamped inside a room is refused too", () => {
  blankPlan();
  placeRoom(S, { preset: "living", rect: { x0: 0, z0: 0, x1: 500, z1: 400 }, spec: {} });
  const out = placeRoom(S, {
    preset: "wc", rect: { x0: 100, z0: 100, x1: 260, z1: 220 }, spec: {}, ...plan(),
  });
  assert.equal(out.ok, false);
  assert.equal(detectRooms().length, 1);
});

test("a preset stamped inward against a host wall inserts, with the door on the new inner wall", () => {
  blankPlan();
  const host = stampPresetAt(S, "livingKitchen", 0, 0, { dock: null, detectRooms });
  assert.ok(host.ok);
  // livingKitchen centreline is 530×430 about the origin, so the right wall
  // sits at x = 265. A WC is 160×120; flush inside that wall, its centre is 185.
  const out = stampPresetAt(S, "wc", 185, 0, plan());
  assert.ok(out.ok, out.reason);
  assert.equal(out.dock.mode, "insert");
  const rooms = detectRooms();
  assert.equal(rooms.length, 2);
  assert.deepEqual(namedRooms().sort(), ["Living / kitchen", "WC"]);

  assert.equal(S.openings.length, 1);
  assert.equal(S.openings[0].type, "door");
  const doorWall = S.walls.find((w) => w.id === S.openings[0].wall);
  const ax = S.nodes[doorWall.a].x, bx = S.nodes[doorWall.b].x;
  assert.ok(Math.abs(ax - 265) > 2 && Math.abs(bx - 265) > 2,
    "the door is not in the outer shared wall");
  assert.ok(Math.abs(ax - 105) <= 2 && Math.abs(bx - 105) <= 2,
    "it is in the new partition that faces the leftover host");

  const living = rooms.find((r) => nameOf(r.key) === "Living / kitchen");
  const wc = rooms.find((r) => nameOf(r.key) === "WC");
  assert.equal(roomClearSize(wc.key) && Math.round(roomClearSize(wc.key).w), 150);
  assert.equal(roomClearSize(living.key), null, "the leftover host is no longer a rectangle");
});

test("a typed clear size grows a rectangular room from the far corner", () => {
  blankPlan();
  const out = stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  const size = roomClearSize(out.key);
  assert.ok(size);
  assert.equal(Math.round(size.w), 350);
  assert.equal(Math.round(size.d), 300);
  const grown = applyRoomClearSize(out.key, 400, 320, { minW: 240, minD: 220 });
  assert.ok(grown.ok);
  const next = roomClearSize(out.key);
  assert.equal(Math.round(next.w), 400);
  assert.equal(Math.round(next.d), 320);
  const clamped = applyRoomClearSize(out.key, 10, 10, { minW: 240, minD: 220 });
  assert.equal(clamped.w, 240);
  assert.equal(Math.round(roomClearSize(out.key).w), 240);
});

test("a corridor dock builds three rooms and opens the corridor at both ends", () => {
  blankPlan();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null });
  const out = stampPresetAt(S, "bathroom", 180 + 120 + 125, 0, plan());
  assert.ok(out.ok);
  assert.equal(out.dock.mode, "corridor");
  const rooms = detectRooms();
  assert.equal(rooms.length, 3);
  assert.deepEqual(namedRooms().sort(), ["Bathroom", "Bedroom", "Corridor"]);
  assert.deepEqual(S.openings.map((o) => o.type), ["passage", "passage"]);
});

test("a stamped circulation room carries the isCorridor flag the rest of the app reads", () => {
  blankPlan();
  const corridor = stampPresetAt(S, "corridor", 0, 0, { dock: null, detectRooms });
  assert.equal(S.roomMeta[corridor.key].isCorridor, true);
  const bedroom = stampPresetAt(S, "bedroom", 0, 400, { dock: null, detectRooms });
  assert.equal(S.roomMeta[bedroom.key].isCorridor, undefined, "a bedroom is not circulation");
});

test("the connection between two rooms is read off both their presets", () => {
  blankPlan();
  const a = stampPresetAt(S, "corridor", 0, 0, { dock: null, detectRooms });
  const b = stampPresetAt(S, "wc", 0, 0 + 165 + 60 + 3, plan());
  assert.ok(b.ok && a.ok);
  const party = b.shared[0];
  const conn = connectionForWall(S, party, detectRooms());
  assert.equal(conn.type, "passage", "a corridor is open to what it serves");
  // and the same wall between two ordinary rooms is a door
  blankPlan();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  const second = stampPresetAt(S, "wc", 180 + 80 + 3, 0, plan());
  assert.equal(connectionForWall(S, second.shared[0], detectRooms()).type, "door");
  assert.equal(connectionForWall(S, second.shared[0], detectRooms()).width, 65, "the narrower leaf wins");
});

/* ---- the command layer -------------------------------------------------- */

/* A history adapter with no history: enough for the executor's transaction
   contract, which is all these tests need from it. */
function env() {
  let open = 0;
  return {
    domain: "planner",
    state: S,
    history: { begin: () => ++open, commit: () => { open--; }, abort: () => { open--; }, current: () => open },
    services: { detectRooms },
  };
}

test("a programmatic client can place a preset room through room.stamp", () => {
  blankPlan();
  const out = executeCommand(roomStampCommand, { preset: "bedroom", x: 0, z: 0 }, env(), { label: "stamp" });
  assert.equal(out.ok, true);
  assert.equal(out.created.filter((e) => e.kind === "wall").length, 4);
  const rooms = detectRooms();
  assert.equal(rooms.length, 1);
  assert.equal(nameOf(rooms[0].key), "Bedroom");
});

test("room.stamp docks and connects the same way the pointer does", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "bedroom", x: 0, z: 0 }, env(), { label: "a" });
  // deliberately a few centimetres off flush, as a pointer would be
  const out = executeCommand(roomStampCommand, { preset: "bathroom", x: 180 + 125 + 7, z: 4 }, env(), { label: "b" });
  assert.equal(out.ok, true);
  assert.equal(detectRooms().length, 2);
  assert.deepEqual(namedRooms().sort(), ["Bathroom", "Bedroom"]);
  const doors = out.created.filter((e) => e.kind === "opening");
  assert.equal(doors.length, 1, "the party wall was opened");
  assert.equal(out.changed.filter((e) => e.kind === "wall").length, 1, "and the shared wall is reported as changed");
});

test("room.stamp refuses to land on a room, and the refusal carries its rectangle", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "living", x: 0, z: 0 }, env(), { label: "a" });
  const walls = S.walls.length;
  const prepared = prepareCommand(roomStampCommand, { preset: "wc", x: 0, z: 0 }, env());
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, "ROOM_OVERLAPS");
  assert.ok(prepared.rect, "the ghost still has somewhere to draw itself");
  const out = executeCommand(roomStampCommand, { preset: "wc", x: 0, z: 0 }, env(), { label: "b" });
  assert.equal(out.ok, false);
  assert.equal(S.walls.length, walls, "nothing was built");
});

test("room.stamp inserts a WC inward against a living room wall", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "livingKitchen", x: 0, z: 0 }, env(), { label: "a" });
  const prepared = prepareCommand(roomStampCommand, { preset: "wc", x: 185, z: 0 }, env());
  assert.equal(prepared.ok, true);
  assert.equal(prepared.plan.params.dock.mode, "insert");
  const out = executeCommand(roomStampCommand, { preset: "wc", x: 185, z: 0 }, env(), { label: "b" });
  assert.equal(out.ok, true);
  assert.equal(detectRooms().length, 2);
  assert.deepEqual(namedRooms().sort(), ["Living / kitchen", "WC"]);
  assert.equal(out.created.filter((e) => e.kind === "opening").length, 1);
});

test("room.stamp rejects an unknown preset and a room below its own minimum", () => {
  blankPlan();
  assert.equal(prepareCommand(roomStampCommand, { preset: "ballroom", x: 0, z: 0 }, env()).reason, "UNKNOWN_PRESET");
  assert.equal(prepareCommand(roomStampCommand, { preset: "bedroom", x: 0 }, env()).reason, "INVALID_ROOM_ORIGIN");
  assert.equal(prepareCommand(roomStampCommand, { preset: "bedroom", x: 0, z: 0, w: 60 }, env()).reason, "ROOM_TOO_SMALL");
});

test("the prepared plan is what gets applied — preview and commit cannot drift", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "bedroom", x: 0, z: 0 }, env(), { label: "a" });
  const prepared = prepareCommand(roomStampCommand, { preset: "bathroom", x: 180 + 125 + 7, z: 4 }, env());
  assert.equal(prepared.ok, true);
  const preview = roomStampCommand.preview(prepared.plan, env());
  const rect = prepared.plan.params.rect;
  assert.deepEqual(preview.outline[0], { x: rect.x0, z: rect.z0 });
  assert.equal(rect.x0, 180, "the plan the ghost draws is already snapped flush");
});

/* ---- breaking a room off its neighbour ---------------------------------- */

test("detaching an attached room leaves the neighbour's walls exactly alone", () => {
  blankPlan();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  stampPresetAt(S, "bathroom", 180 + 125 + 5, 0, plan());
  const bedroom = detectRooms().find((r) => nameOf(r.key) === "Bedroom");
  const bathroom = detectRooms().find((r) => nameOf(r.key) === "Bathroom");
  const bedWalls = String(bedroom.key).split(",")
    .map((id) => S.walls.find((w) => String(w.id) === id))
    .map((w) => [w.id, S.nodes[w.a].x, S.nodes[w.a].z, S.nodes[w.b].x, S.nodes[w.b].z]);

  const carried = detachRoomSeam(S, bathroom.key, detectRooms());
  assert.ok(carried, "there was a seam to break");
  assert.equal(carried.length, 4, "the room carries four corners of its own");

  // move every corner the detach handed back
  carried.forEach((i) => { S.nodes[i].x += 400; });

  const bedAfter = bedWalls.map(([id]) => {
    const w = S.walls.find((q) => q.id === id);
    return [w.id, S.nodes[w.a].x, S.nodes[w.a].z, S.nodes[w.b].x, S.nodes[w.b].z];
  });
  assert.deepEqual(bedAfter, bedWalls, "not one of the neighbour's corners moved");
  const moved = detectRooms().find((r) => nameOf(r.key) === "Bathroom")
    || detectRooms().find((r) => r.cx > 400);
  assert.ok(moved, "and the room that was dragged is still a closed room");
});

test("a free-standing room has no seam to break", () => {
  blankPlan();
  const only = stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  assert.equal(detachRoomSeam(S, only.key, detectRooms()), null);
});

/* Tests for the Drop Chooser: Door / Passage / Open modes,
 * inner wall selection on inserts, and smart anchoring on resize.
 */
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { href: "http://localhost/" },
};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init || {});
  }
};
function makeElem() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    getAttribute() { return null; },
    querySelector: () => makeElem(),
    querySelectorAll: () => [],
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    removeEventListener() {},
    textContent: "",
    innerHTML: "",
  };
}
globalThis.document = {
  getElementById: () => makeElem(),
  querySelector: () => makeElem(),
  querySelectorAll: () => [],
  documentElement: makeElem(),
  createElement: () => Object.assign(makeElem(), { getContext: () => null }),
  addEventListener() {},
  body: makeElem(),
};

const { S } = await import("../js/state.js");
const { detectRooms, roomClearSize, applyRoomClearSize } = await import("../js/geometry.js");
const { placeRoom, stampPresetAt } = await import("../js/room_stamp.js");
const { roomStampCommand } = await import("../js/commands/room_stamp.js");
const { executeCommand, prepareCommand } = await import("../js/commands/executor.js");
const { CONNECTION_MODES, presetConnection, roomPreset } = await import("../js/room_presets.js");
const {
  armRoomStamp,
  disarmRoomStamp,
  setRoomStampConnMode,
  cycleRoomStampConnMode,
  flipRoomStampDoorWall,
  resizeRoomStamp,
} = await import("../js/interaction.js");

function blankPlan() {
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.roomMeta = {};
  S.idc = 1;
  S.roomStamp = null;
  S.roomGhost = null;
  S.roomPrepared = null;
  return S;
}

function env() {
  let open = 0;
  return {
    domain: "planner",
    state: S,
    history: { begin: () => ++open, commit: () => { open--; }, abort: () => { open--; }, current: () => open },
    services: { detectRooms },
  };
}

test("CONNECTION_MODES contains auto, door, passage, open", () => {
  assert.deepEqual(CONNECTION_MODES, ["auto", "door", "passage", "open"]);
});

test("presetConnection obeys explicit mode", () => {
  const bed = roomPreset("bedroom");
  const bath = roomPreset("bathroom");
  assert.equal(presetConnection(bed, bath, "open").type, "open");
  assert.equal(presetConnection(bed, bath, "passage").type, "passage");
  assert.equal(presetConnection(bed, bath, "door").type, "door");
});

test("abutting with connMode: door cuts a door in the shared party wall", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "bedroom", x: 0, z: 0 }, env(), { label: "a" });
  const out = executeCommand(
    roomStampCommand,
    { preset: "bathroom", x: 180 + 125 + 7, z: 4, connMode: "door" },
    env(),
    { label: "b" },
  );
  assert.equal(out.ok, true);
  assert.equal(detectRooms().length, 2);
  const openings = out.created.filter((e) => e.kind === "opening");
  assert.equal(openings.length, 1);
  const door = S.openings.find((o) => o.id === openings[0].id);
  assert.ok(door);
  assert.equal(door.type, "door");
});

test("abutting with connMode: passage cuts an open passage in the shared party wall", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "bedroom", x: 0, z: 0 }, env(), { label: "a" });
  const out = executeCommand(
    roomStampCommand,
    { preset: "bathroom", x: 180 + 125 + 7, z: 4, connMode: "passage" },
    env(),
    { label: "b" },
  );
  assert.equal(out.ok, true);
  assert.equal(detectRooms().length, 2);
  const openings = out.created.filter((e) => e.kind === "opening");
  assert.equal(openings.length, 1);
  const passage = S.openings.find((o) => o.id === openings[0].id);
  assert.ok(passage);
  assert.equal(passage.type, "passage");
});

test("abutting with connMode: open removes the party wall to create 1 merged open space", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "living", x: 0, z: 0 }, env(), { label: "a" });
  // Living room width = 450 clear + 10 = 460 centreline, x from -230 to 230
  // Place dining room abutting at +x
  const dining = roomPreset("dining"); // w: 360, d: 300 -> centreline w: 370
  // centre x = 230 + 370/2 = 415
  const out = executeCommand(
    roomStampCommand,
    { preset: "dining", x: 415 + 5, z: 0, connMode: "open" },
    env(),
    { label: "b" },
  );
  assert.equal(out.ok, true);
  // Party wall should have been removed, leaving one continuous room
  const rooms = detectRooms();
  assert.equal(rooms.length, 1, "the two spaces merged into 1 continuous open room");
  assert.equal(out.results[0].mode, "open");
  assert.equal(out.results[0].deleted.length >= 1, true, "shared wall was deleted");
});

test("inserting with connMode: open removes the inner partition to form an open alcove", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "livingKitchen", x: 0, z: 0 }, env(), { label: "a" });
  const out = executeCommand(
    roomStampCommand,
    { preset: "wc", x: 185, z: 0, connMode: "open" },
    env(),
    { label: "b" },
  );
  assert.equal(out.ok, true);
  assert.equal(out.results[0].mode, "open");
  assert.equal(out.results[0].deleted.length, 1, "inner partition was removed");
  // The host space now encompasses the alcove
  const rooms = detectRooms();
  assert.equal(rooms.length, 1, "alcove is merged with host room");
});

test("corner insert partitions default to 10cm interior thickness", () => {
  blankPlan();
  // Host room with 20cm thick exterior walls
  executeCommand(
    roomStampCommand,
    { preset: "livingKitchen", x: 0, z: 0, spec: { thickness: 20 } },
    env(),
    { label: "host" },
  );
  // Insert WC in corner
  const out = executeCommand(
    roomStampCommand,
    { preset: "wc", x: 185, z: 120 },
    env(),
    { label: "wc" },
  );
  assert.equal(out.ok, true);
  // Check newly created partition walls
  const createdWallIds = out.created.filter((e) => e.kind === "wall").map((e) => e.id);
  const createdWalls = S.walls.filter((w) => createdWallIds.includes(w.id));
  assert.ok(createdWalls.length > 0);
  for (const w of createdWalls) {
    assert.equal(w.thickness, 10, "insert partition walls use 10cm interior thickness");
  }
});

test("corner insert doorWallIndex selects which inner wall receives the opening", () => {
  blankPlan();
  executeCommand(roomStampCommand, { preset: "livingKitchen", x: 0, z: 0 }, env(), { label: "host" });
  // Stamp with doorWallIndex: 0
  const out0 = executeCommand(
    roomStampCommand,
    { preset: "wc", x: 185, z: 120, doorWallIndex: 0 },
    env(),
    { label: "wc0" },
  );
  assert.equal(out0.ok, true);
  const door0 = S.openings[0];
  assert.ok(door0);

  blankPlan();
  executeCommand(roomStampCommand, { preset: "livingKitchen", x: 0, z: 0 }, env(), { label: "host" });
  // Stamp with doorWallIndex: 1
  const out1 = executeCommand(
    roomStampCommand,
    { preset: "wc", x: 185, z: 120, doorWallIndex: 1 },
    env(),
    { label: "wc1" },
  );
  assert.equal(out1.ok, true);
  const door1 = S.openings[0];
  assert.ok(door1);
  assert.notEqual(door0.wall, door1.wall, "doorWallIndex: 1 chose the orthogonal inner wall");
});

test("smart anchoring in applyRoomClearSize expands into free space", () => {
  blankPlan();
  // Place two rooms side by side sharing a party wall along x = 180
  // Room 1 (Bedroom) from x = -180 to 180
  executeCommand(roomStampCommand, { preset: "bedroom", x: 0, z: 0 }, env(), { label: "bed" });
  // Room 2 (Bathroom) from x = 180 to 430
  executeCommand(
    roomStampCommand,
    { preset: "bathroom", x: 180 + 125 + 5, z: 0, connMode: "door" },
    env(),
    { label: "bath" },
  );

  const rooms = detectRooms();
  assert.equal(rooms.length, 2);

  // Identify Bedroom (left room, x from -180 to 180)
  // Its high x wall (x1 = 180) is shared with Bathroom!
  // Its low x wall (x0 = -180) is free!
  const bedRoom = rooms.find((r) => {
    const sz = roomClearSize(r.key);
    return sz && Math.round(sz.w) === 350;
  });
  assert.ok(bedRoom);

  const beforeSz = roomClearSize(bedRoom.key);
  // Expand width by 40 cm
  const result = applyRoomClearSize(bedRoom.key, beforeSz.w + 40, beforeSz.d);
  assert.equal(result.ok, true);
  // Smart anchoring should have moved the free wall (low x0 = -180 to -220)
  // while keeping the shared party wall (x1 = 180) untouched!
  const movedNodes = result.moved.map((m) => S.nodes[m.i]);
  assert.ok(movedNodes.length > 0);
  for (const n of movedNodes) {
    assert.ok(n.x < 0, "moved nodes are on the free side, not the shared side");
  }
});

test("roomStamp interaction helpers cycle modes and flip door walls", () => {
  blankPlan();
  armRoomStamp("bedroom");
  assert.ok(S.roomStamp);
  assert.equal(S.roomStamp.connMode, "auto");
  assert.equal(S.roomStamp.doorWallIndex, 0);

  cycleRoomStampConnMode();
  assert.equal(S.roomStamp.connMode, "door");

  cycleRoomStampConnMode();
  assert.equal(S.roomStamp.connMode, "passage");

  cycleRoomStampConnMode();
  assert.equal(S.roomStamp.connMode, "open");

  cycleRoomStampConnMode();
  assert.equal(S.roomStamp.connMode, "auto");

  setRoomStampConnMode("passage");
  assert.equal(S.roomStamp.connMode, "passage");

  flipRoomStampDoorWall();
  assert.equal(S.roomStamp.doorWallIndex, 1);

  flipRoomStampDoorWall();
  assert.equal(S.roomStamp.doorWallIndex, 2);

  const prevW = S.roomStamp.w;
  resizeRoomStamp(20, 0);
  assert.equal(S.roomStamp.w, prevW + 20);

  disarmRoomStamp();
  assert.equal(S.roomStamp, null);
});

/* ---- what the merge and the resize do to the OTHER room ------------------

   Both features above were tested by what they do to the room being acted on.
   These two are about the room nobody touched, which is where the damage was:
   a name stranded in the document, and a neighbour quietly turned into an
   L-shape. */

test("merging keeps the larger room's name, whichever order they were stamped", () => {
  const order = (first, second, x2) => {
    blankPlan();
    stampPresetAt(S, first, 0, 0, { dock: null, detectRooms });
    stampPresetAt(S, second, x2, 0, { rooms: detectRooms(), detectRooms, connMode: "open" });
    const rooms = detectRooms();
    return {
      rooms: rooms.length,
      names: rooms.map((r) => (S.roomMeta[r.key] || {}).name),
      orphans: Object.keys(S.roomMeta)
        .filter((k) => !rooms.some((r) => r.key === k))
        .map((k) => S.roomMeta[k].name),
    };
  };

  const small = order("wc", "livingKitchen", 80 + 265 + 6);
  assert.deepEqual(small, { rooms: 1, names: ["Living / kitchen"], orphans: [] });

  /* The same pair the other way round. This is the one that was wrong: the
     host's metadata key goes stale the moment the stamp splits its wall, so
     looking the winner up by key found nothing and the 1.5 m² WC took the
     merged space's name off a 22 m² living room. */
  const large = order("livingKitchen", "wc", 265 + 80 + 6);
  assert.deepEqual(large, { rooms: 1, names: ["Living / kitchen"], orphans: [] });
});

test("a room walled in on both sides refuses to be resized rather than eating a neighbour", () => {
  blankPlan();
  const plan = () => ({ rooms: detectRooms(), detectRooms });
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  stampPresetAt(S, "bathroom", 180 + 125 + 4, 0, plan());
  stampPresetAt(S, "kitchen", 180 + 250 + 165 + 4, 0, plan());
  const named = (n) => detectRooms().find((r) => (S.roomMeta[r.key] || {}).name === n);

  const mid = named("Bathroom");
  const size = roomClearSize(mid.key);
  const before = JSON.stringify(S.nodes);

  // wider: the sides are shared left and right
  const wider = applyRoomClearSize(mid.key, size.w + 160, size.d);
  assert.equal(wider.ok, false);
  assert.equal(wider.reason, "ROOM_SIDE_SHARED");
  assert.equal(wider.axis, "x");

  /* Deeper: its top and bottom walls are all its own, so a test that only
     looked at SIDES let this through — and it dragged the corners where the
     party walls were split, taking both neighbours' stubs with them. */
  const deeper = applyRoomClearSize(mid.key, size.w, size.d + 80);
  assert.equal(deeper.ok, false);
  assert.equal(deeper.axis, "z");

  assert.equal(JSON.stringify(S.nodes), before, "not one corner moved");
  assert.ok(roomClearSize(named("Kitchen").key), "the kitchen is still a rectangle");
  assert.ok(roomClearSize(named("Bedroom").key), "so is the bedroom");
});

test("a room with a free side still resizes, and its neighbour stays put", () => {
  blankPlan();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  stampPresetAt(S, "bathroom", 180 + 125 + 4, 0, { rooms: detectRooms(), detectRooms });
  const named = (n) => detectRooms().find((r) => (S.roomMeta[r.key] || {}).name === n);
  const bath = named("Bathroom"), size = roomClearSize(bath.key);

  const out = applyRoomClearSize(bath.key, size.w + 100, size.d);
  assert.equal(out.ok, true, "shared on one side only — the free side moves");
  assert.equal(Math.round(roomClearSize(named("Bathroom").key).w), size.w + 100);
  assert.equal(Math.round(roomClearSize(named("Bedroom").key).w), 350, "the bedroom is untouched");
});

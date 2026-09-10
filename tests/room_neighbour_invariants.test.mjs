/* The rule every room operation has to obey: LEAVE THE OTHER ROOMS ALONE.
 *
 * Four separate bugs in this feature were the same bug, written by two people
 * who were each testing carefully — just testing the room they were acting on:
 *
 *   docking a room split the neighbour's wall, so the neighbour's metadata key
 *     went stale and it came out unnamed;
 *   dragging an attached room carried the party wall's corners, so the room
 *     nobody touched got 300 cm wider;
 *   merging in open mode stranded the other room's name in the document, and
 *     which of the two names survived came down to stamp order;
 *   typing a new size for a room walled in on both sides pushed 160 cm into
 *     the neighbour and left it an L-shape.
 *
 * None of them is visible from the room being operated on. All of them are
 * obvious the moment you look at the census of everything else. So that census
 * is what this file is: one helper that photographs every room, and a set of
 * operations each asserting what it is and is not allowed to disturb.
 *
 * A new room operation belongs here. If it cannot state which rooms it changes
 * and leave the rest byte-identical, that is the finding.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { S } from "../js/state.js";
import { detectRooms, roomClearSize, applyRoomClearSize } from "../js/geometry.js";
import { stampPresetAt } from "../js/room_stamp.js";
import { detachRoomSeam } from "../js/room_graph.js";

function blank() {
  S.nodes = []; S.walls = []; S.openings = []; S.items = [];
  S.roomMeta = {}; S.wallCons = []; S.idc = 1;
  return S;
}

const plan = () => ({ rooms: detectRooms(), detectRooms });

/* Every room as it stands: what it is called, how much floor it has, where it
   is, and whether it is still a rectangle. Plus any metadata entry belonging
   to no room, which is how a stranded name shows up.
 *
   The SHAPE is recorded as area + extent, deliberately, not as the list of
   corners. Splitting a wall adds a collinear vertex to the traced polygon —
   docking against a room does that to it every time — and a room that has
   gained a redundant corner in the middle of a side it never moved has not
   been disturbed in any sense a user could see. Comparing vertex lists would
   fail on every one of these operations and would have to be relaxed until it
   said nothing. */
function census() {
  const rooms = detectRooms();
  return {
    rooms: rooms.map((r) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      r.pts.forEach((p) => {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
      });
      return {
        name: (S.roomMeta[r.key] || {}).name || null,
        area: Math.round(r.area || 0),
        extent: [x0, z0, x1, z1].map(Math.round).join(","),
        rect: !!roomClearSize(r.key),
      };
    }).sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.area - b.area),
    orphans: Object.keys(S.roomMeta)
      .filter((k) => !rooms.some((r) => r.key === k))
      .map((k) => S.roomMeta[k].name)
      .sort(),
  };
}

/* Everything in `before` that is not named in `changed` has to come through
   the operation untouched — same name, same floor, same outline — and no name
   may be left behind. */
function untouched(before, after, changed, message) {
  const held = (c) => c.rooms.filter((r) => (changed || []).indexOf(r.name) === -1);
  assert.deepEqual(held(after), held(before), message || "the other rooms are untouched");
  assert.deepEqual(after.orphans, [], "no room's name was left stranded");
}

test("docking a room leaves the host named, the same size, and still a rectangle", () => {
  blank();
  stampPresetAt(S, "livingKitchen", 0, 0, { dock: null, detectRooms });
  const before = census();
  assert.equal(before.rooms[0].rect, true);

  // the host's wall is SPLIT by this, which is what used to lose its name
  stampPresetAt(S, "bedroom", 265 + 185 + 6, 30, plan());
  const after = census();
  assert.equal(after.rooms.length, 2);
  untouched(before, after, ["Bedroom"], "the living room is exactly as it was");
});

test("a corridor dock leaves both rooms it serves untouched", () => {
  blank();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  const before = census();
  const out = stampPresetAt(S, "bathroom", 180 + 120 + 125, 0, plan());
  assert.equal(out.dock.mode, "corridor");
  untouched(before, census(), ["Bathroom", "Corridor"]);
});

test("an insert leaves the host room named, smaller, and no longer rectangular", () => {
  blank();
  stampPresetAt(S, "living", 0, 0, { dock: null, detectRooms });
  const before = census();
  const host = before.rooms[0];
  const out = stampPresetAt(S, "wc", -250 + 80, -205 + 60, plan());
  assert.equal(out.ok, true);
  const after = census();
  assert.deepEqual(after.orphans, [], "the host did not lose its name to the insert");
  const stillThere = after.rooms.find((r) => r.name === "Living room");
  assert.ok(stillThere, "the host is still called what it was called");
  assert.ok(stillThere.area < host.area, "and it gave up the floor the insert took");
});

test("merging keeps one name — the larger room's — and strands nothing", () => {
  const merge = (first, second, x2) => {
    blank();
    stampPresetAt(S, first, 0, 0, { dock: null, detectRooms });
    stampPresetAt(S, second, x2, 0, { ...plan(), connMode: "open" });
    return census();
  };
  const a = merge("wc", "livingKitchen", 80 + 265 + 6);
  const b = merge("livingKitchen", "wc", 265 + 80 + 6);
  assert.equal(a.rooms.length, 1);
  assert.equal(b.rooms.length, 1);
  assert.equal(a.rooms[0].name, "Living / kitchen");
  assert.equal(b.rooms[0].name, "Living / kitchen", "stamp order must not decide the name");
  assert.deepEqual(a.orphans, []);
  assert.deepEqual(b.orphans, []);
});

test("resizing a room with a free side moves nothing else", () => {
  blank();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  stampPresetAt(S, "bathroom", 180 + 125 + 4, 0, plan());
  const before = census();
  const bath = detectRooms().find((r) => (S.roomMeta[r.key] || {}).name === "Bathroom");
  const size = roomClearSize(bath.key);
  assert.equal(applyRoomClearSize(bath.key, size.w + 100, size.d).ok, true);
  untouched(before, census(), ["Bathroom"]);
});

test("resizing a room walled in on both sides changes nothing at all", () => {
  blank();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  stampPresetAt(S, "bathroom", 180 + 125 + 4, 0, plan());
  stampPresetAt(S, "kitchen", 180 + 250 + 165 + 4, 0, plan());
  const before = census();
  const mid = detectRooms().find((r) => (S.roomMeta[r.key] || {}).name === "Bathroom");
  const size = roomClearSize(mid.key);

  // both axes: the sides are shared left and right, and the CORNERS are shared
  // top and bottom because that is where the party walls were split
  assert.equal(applyRoomClearSize(mid.key, size.w + 160, size.d).reason, "ROOM_SIDE_SHARED");
  assert.equal(applyRoomClearSize(mid.key, size.w, size.d + 80).reason, "ROOM_SIDE_SHARED");
  untouched(before, census(), [], "a refused resize is not a partial one");
});

test("taking a room off its neighbour moves only the room", () => {
  blank();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  stampPresetAt(S, "bathroom", 180 + 125 + 5, 0, plan());
  const before = census();
  const bedBefore = before.rooms.find((r) => r.name === "Bedroom");
  const bath = detectRooms().find((r) => (S.roomMeta[r.key] || {}).name === "Bathroom");

  const carried = detachRoomSeam(S, bath.key, detectRooms());
  assert.ok(carried, "there was a seam to break");
  carried.forEach((i) => { S.nodes[i].x += 400; });

  /* Named rooms only. This is a MID-GESTURE state: the detach has changed the
     dragged room's walls, so its own metadata key is stale until the drop
     re-keys it (rehomeDraggedRoom, in js/interaction.js — the browser suite
     covers that end of it). What has to hold here is the other half: the room
     that was not grabbed has not moved a millimetre. */
  const after = census();
  assert.deepEqual(after.rooms.find((r) => r.name === "Bedroom"), bedBefore);
  assert.equal(after.rooms.length, 2, "and the room that was taken away is still a room");
});

test("the census itself notices a neighbour being damaged", () => {
  /* The harness has to be able to fail, or the tests above prove nothing.
     This does by hand exactly what the resize bug did by accident: move a
     corner the neighbour also stands on. */
  blank();
  stampPresetAt(S, "bedroom", 0, 0, { dock: null, detectRooms });
  stampPresetAt(S, "bathroom", 180 + 125 + 4, 0, plan());
  const before = census();
  const bath = detectRooms().find((r) => (S.roomMeta[r.key] || {}).name === "Bathroom");
  bath.nidx.forEach((i) => { S.nodes[i].z += 60; });
  assert.throws(() => untouched(before, census(), ["Bathroom"]),
    /the other rooms are untouched/,
    "moving a corner the bedroom also stands on has to be caught");
});

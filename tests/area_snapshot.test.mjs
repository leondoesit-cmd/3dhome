// js/area_snapshot.js activeFloorArea: the planning guide asks for it after
// every plan paint, so its cache key must not read the plan's pictures (wall
// textures, room floors are data: URLs of up to megabytes), while every
// geometric or room-type change still recomputes.
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { activeFloorArea } from "../js/area_snapshot.js";
import { detectRooms } from "../js/geometry.js";

function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.slabOpenings = []; S.wallTypes = []; S.roomMeta = {};
}

// how many characters JSON.stringify produced while `fn` ran
function stringified(fn) {
  const real = JSON.stringify;
  let chars = 0;
  JSON.stringify = function (...args) { const s = real.apply(JSON, args); chars += s ? s.length : 0; return s; };
  try { return { value: fn(), chars }; } finally { JSON.stringify = real; }
}

test("a picture on a wall or a room floor neither recomputes the area nor gets serialized", () => {
  room();
  const key = detectRooms()[0].key;
  S.roomMeta[key] = { name: "Den" };
  const plain = activeFloorArea();
  assert.ok(plain.entries.length >= 1);
  const big = (c) => "data:image/jpeg;base64," + c.repeat(1 << 20);
  S.walls[0].tex = big("A");
  S.roomMeta[key].floorTex = big("B");
  const run = stringified(() => activeFloorArea());
  console.log("# area key serialized " + run.chars + " characters with two 1 MB pictures");
  assert.equal(run.value, plain, "a picture-only change is a cache hit");
  assert.ok(run.chars < 20000, "the pictures are not serialized (" + run.chars + ")");
  // on a miss, the per-wall copies leave the pictures out too
  S.walls[0].thickness = 20;
  const miss = stringified(() => activeFloorArea());
  assert.notEqual(miss.value, plain, "a wall change recomputes");
  assert.ok(miss.chars < 20000, "the wall copies carry no picture (" + miss.chars + ")");
  // and gives what a plan without pictures gives
  delete S.walls[0].tex; delete S.roomMeta[key].floorTex;
  S.walls[0].thickness = 21; activeFloorArea(); S.walls[0].thickness = 20; // force a fresh compute
  assert.deepEqual(activeFloorArea(), miss.value);
});

test("the room type and the openings still change the area key", () => {
  room();
  const a = activeFloorArea();
  const key = detectRooms()[0].key;
  S.roomMeta[key] = { roomType: "balcony", floorTex: "data:image/png;base64,AAAA" };
  const b = activeFloorArea();
  assert.notEqual(b, a, "a room type recomputes");
  assert.notDeepEqual(b, a);
  S.openings = [{ id: "d", type: "door", wall: 1, s: 300, width: 90, sill: 0, height: 205 }];
  assert.notEqual(activeFloorArea(), b, "an opening recomputes");
  S.slabOpenings = [{ id: "v", x: 300, z: 200, w: 50, d: 50 }];
  const c = activeFloorArea();
  S.slabOpenings[0].w = 60;
  assert.notEqual(activeFloorArea(), c, "a slab opening recomputes");
});

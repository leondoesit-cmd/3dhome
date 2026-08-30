import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRoomCreate,
  prepareRoomCreate,
  previewRoomCreate,
} from "../js/commands/room_create.js";

function fixture() {
  return { nodes: [], walls: [], openings: [], items: [], idc: 10 };
}

test("room.create prepares four serializable wall plans and a pure preview", () => {
  const state = fixture(), env = { state, version: { current: () => 4 } };
  const result = prepareRoomCreate({
    from: { x: 100, z: 80 }, to: { x: 0, z: 0 },
    loc: "face", dimSide: 1, thickness: 20,
  }, env);
  assert.equal(result.ok, true);
  assert.equal(result.plan.expectedVersion, 4);
  assert.equal(result.plan.params.walls.length, 4);
  assert.ok(result.plan.params.walls.every((wall) => wall.loc === "face" && wall.dimSide === 1));
  const before = structuredClone(state);
  assert.deepEqual(previewRoomCreate(result.plan), {
    kind: "room",
    outline: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 80 }, { x: 0, z: 80 }],
    style: "ghost-valid",
  });
  assert.deepEqual(state, before);
  assert.doesNotThrow(() => JSON.stringify(result.plan));
});

test("room.create rejects invalid and undersized bounds with codes", () => {
  const env = { state: fixture() };
  assert.equal(prepareRoomCreate({ from: null, to: { x: 4, z: 4 } }, env).reason, "INVALID_ROOM_BOUNDS");
  assert.equal(prepareRoomCreate({ from: { x: 0, z: 0 }, to: { x: 19, z: 40 } }, env).reason, "ROOM_TOO_SMALL");
});

test("room.create fallback builds one closed four-wall loop", () => {
  const state = fixture(), env = { state };
  const prepared = prepareRoomCreate({ from: { x: 0, z: 0 }, to: { x: 400, z: 300 } }, env);
  const result = applyRoomCreate(prepared.plan, env);
  assert.equal(result.ok, true);
  assert.equal(state.nodes.length, 4);
  assert.equal(state.walls.length, 4);
  assert.deepEqual(state.walls.map((wall) => [wall.a, wall.b]), [[0, 1], [1, 2], [2, 3], [3, 0]]);
  assert.equal(result.created.filter((entry) => entry.kind === "wall").length, 4);
  assert.deepEqual(result.effects.events[0].wallIds, [10, 11, 12, 13]);
});

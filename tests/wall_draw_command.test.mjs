import test from "node:test";
import assert from "node:assert/strict";
import {
  applyWallDraw,
  prepareWallDraw,
  previewWallDraw,
  wallDrawCommand,
} from "../js/commands/wall_draw.js";

function fixture() {
  return { nodes: [{ x: 0, z: 0 }], walls: [], openings: [], items: [], idc: 8, tool: "wall", sel: null };
}

test("wall.draw prepares a finite serializable plan with normalized defaults", () => {
  const result = prepareWallDraw(
    { from: { x: 0, z: 0 }, to: { x: 300, z: 40 } },
    { state: fixture(), version: { current: () => 12 } },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan, {
    command: "wall.draw",
    expectedVersion: 12,
    params: {
      from: { x: 0, z: 0 }, to: { x: 300, z: 40 },
      type: "generic", kind: "normal", loc: "center", dimSide: 0,
      height: 270, thickness: 10,
    },
  });
  assert.doesNotThrow(() => JSON.stringify(result.plan));
});

test("wall.draw rejects invalid points, zero length, and invalid wall values", () => {
  const env = { state: fixture() };
  assert.equal(prepareWallDraw({ from: { x: NaN, z: 0 }, to: { x: 1, z: 0 } }, env).reason, "INVALID_WALL_POINT");
  assert.equal(prepareWallDraw({ from: { x: 2, z: 3 }, to: { x: 2, z: 3 } }, env).reason, "ZERO_LENGTH_WALL");
  assert.equal(prepareWallDraw({ from: { x: 0, z: 0 }, to: { x: 1, z: 0 }, thickness: 0 }, env).reason, "INVALID_WALL_VALUE");
});

test("wall.draw preview is JSON-only and leaves all document state untouched", () => {
  const state = fixture(), env = { state, version: 5 };
  const prepared = prepareWallDraw({
    from: { x: 0, z: 0 }, to: { x: 0, z: 200 },
    type: "exterior", kind: "normal", loc: "face", dimSide: 1,
    thickness: 24, height: 310,
  }, env);
  const before = structuredClone(state);
  assert.deepEqual(previewWallDraw(prepared.plan, env), {
    kind: "wall",
    from: { x: 0, z: 0 }, to: { x: 0, z: 200 },
    wallType: "exterior", wallKind: "normal",
    thickness: 24, height: 310, loc: "face", dimSide: 1,
    style: "ghost-valid",
  });
  assert.deepEqual(state, before);
});

test("wall.draw fallback exactly reuses nodes and creates one new endpoint and wall", () => {
  const state = fixture(), env = { state };
  const prepared = prepareWallDraw({ from: { x: 0, z: 0 }, to: { x: 200, z: 0 } }, env);
  const result = applyWallDraw(prepared.plan, env);
  assert.equal(result.ok, true);
  assert.deepEqual(state.nodes, [{ x: 0, z: 0 }, { x: 200, z: 0 }]);
  assert.deepEqual(state.walls, [{
    id: 8, a: 0, b: 1, thickness: 10, height: 270,
    wallTypeId: "generic", kind: "normal", loc: "center", dimSide: 0,
  }]);
  assert.equal(state.idc, 9);
  assert.deepEqual(result.created, [{ kind: "node", id: 1 }, { kind: "wall", id: 8 }]);
  assert.deepEqual(result.changed, []);
});

test("wall.draw delegates topology to the injected planner materializer", () => {
  const state = fixture();
  let received = null;
  const env = {
    state,
    services: {
      materializeWall(params, commandEnv) {
        received = { params: structuredClone(params), sameEnv: commandEnv === env };
        const wall = { id: 31, a: 0, b: 0 };
        state.walls.push(wall);
        return { ok: true, wall, createdNodeIds: [], changedNodeIds: [0] };
      },
    },
  };
  const prepared = prepareWallDraw({ from: { x: 0, z: 0 }, to: { x: 20, z: 0 } }, env);
  const result = applyWallDraw(prepared.plan, env);
  assert.equal(received.sameEnv, true);
  assert.deepEqual(received.params, prepared.plan.params);
  assert.deepEqual(result.created, [{ kind: "wall", id: 31 }]);
  assert.deepEqual(result.changed, [{ kind: "node", id: 0 }]);
});

test("wall.draw exposes every reason its command contract can return", () => {
  assert.deepEqual(new Set(wallDrawCommand.failureCodes), new Set([
    "INVALID_WALL_POINT", "ZERO_LENGTH_WALL", "INVALID_WALL_VALUE", "WALL_MATERIALIZATION_FAILED",
  ]));
});

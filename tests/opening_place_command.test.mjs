import test from "node:test";
import assert from "node:assert/strict";
import {
  OPENING_PLACE_CODES,
  applyOpeningPlace,
  openingPlaceCommand,
  prepareOpeningPlace,
  previewOpeningPlace,
} from "../js/commands/opening_place.js";

function fixture() {
  return {
    nodes: [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 0, z: 400 }],
    walls: [
      { id: 10, a: 0, b: 1, thickness: 10, height: 270 },
      { id: 11, a: 0, b: 2, thickness: 10, height: 270 },
    ],
    openings: [],
    items: [],
    idc: 20,
    sel: { kind: "wall", ref: { id: 999 } },
    tool: "door",
  };
}

test("opening.place prepares a serializable, normalized plan for one explicit wall", () => {
  const state = fixture();
  const result = prepareOpeningPlace(
    { wallId: 10, type: "door", s: 2 },
    { state, version: { current: () => 47 } },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan, {
    command: "opening.place",
    expectedVersion: 47,
    params: { wallId: 10, type: "door", s: 45, width: 90, height: 205, sill: 0 },
  });
  assert.doesNotThrow(() => JSON.stringify(result.plan));
});

test("opening.place refuses ambiguous, missing, invalid, and malformed targets with codes", () => {
  const state = fixture(), env = { state };
  assert.equal(prepareOpeningPlace({ type: "door", s: 100 }, env).reason, "AMBIGUOUS_TARGET");
  assert.equal(prepareOpeningPlace({ wallId: 404, type: "door", s: 100 }, env).reason, "HOST_WALL_NOT_FOUND");
  assert.equal(prepareOpeningPlace({ wallId: 10, type: "garage", s: 100 }, env).reason, "INVALID_OPENING_TYPE");
  assert.equal(prepareOpeningPlace({ wallId: 10, type: "door", s: NaN }, env).reason, "INVALID_OPENING_VALUE");
  state.nodes[1] = { x: 0, z: 0 };
  assert.equal(prepareOpeningPlace({ wallId: 10, type: "door", s: 0 }, env).reason, "INVALID_HOST_WALL");
  assert.deepEqual(new Set(openingPlaceCommand.failureCodes), new Set(OPENING_PLACE_CODES));
});

test("opening.place preview is a pure serializable ghost projection", () => {
  const state = fixture(), env = { state, version: 3 };
  const prepared = prepareOpeningPlace({ wallId: 10, type: "window", s: 175 }, env);
  const before = structuredClone(state);
  const preview = previewOpeningPlace(prepared.plan, env);
  assert.deepEqual(preview, {
    kind: "opening",
    wallId: 10,
    center: { x: 175, z: 0 },
    width: 120,
    height: 120,
    style: "ghost-valid",
  });
  assert.deepEqual(state, before);
  assert.doesNotThrow(() => JSON.stringify(preview));
});

test("opening.place applies exactly one opening even where two walls meet", () => {
  const state = fixture(), env = { state };
  const prepared = prepareOpeningPlace({ wallId: 10, type: "door", s: 0 }, env);
  const result = applyOpeningPlace(prepared.plan, env);
  assert.equal(result.ok, true);
  assert.equal(state.openings.length, 1);
  assert.deepEqual(state.openings[0], {
    id: 20, type: "door", wall: 10, s: 45, width: 90, height: 205, sill: 0,
  });
  assert.equal(state.idc, 21);
  assert.deepEqual(result.created, [{ kind: "opening", id: 20 }]);
  assert.deepEqual(result.changed, [{ kind: "wall", id: 10 }]);
});

test("opening.place preview respects a face-authored wall centreline", () => {
  const state = fixture();
  state.walls[0].loc = "face";
  state.walls[0].dimSide = 1;
  state.walls[0].thickness = 20;
  const prepared = prepareOpeningPlace({ wallId: 10, type: "passage", s: 200 }, { state });
  const preview = previewOpeningPlace(prepared.plan, { state });
  assert.deepEqual(preview.center, { x: 200, z: -10 });
});

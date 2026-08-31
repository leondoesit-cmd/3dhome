import test from "node:test";
import assert from "node:assert/strict";
import {
  applyItemDuplicate, prepareItemDuplicate, previewItemDuplicate,
} from "../js/commands/item_duplicate.js";

function fixture() {
  const state = {
    idc: 20,
    nodes: [], walls: [], openings: [],
    items: [
      { id: 4, type: "cabinet", x: 10, z: 20, w: 80, d: 60, h: 220,
        groupId: 8, locked: true, runtimeState: { mesh: true }, customSpec: { shelves: 5 } },
      { id: 5, type: "chair", x: 90, z: 20, w: 45, d: 45, h: 90, groupId: 8 },
    ],
  };
  return { state, env: { state, version: { current: () => 7 } } };
}

test("item.duplicate captures replayable source data and previews offsets", () => {
  const f = fixture();
  const prepared = prepareItemDuplicate({ sourceId: 4, offsetX: 30, offsetZ: -10, regroup: false }, f.env);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.plan.expectedVersion, 7);
  assert.deepEqual(prepared.plan.params.items[0].customSpec, { shelves: 5 });
  assert.deepEqual(previewItemDuplicate(prepared.plan).items[0].center, { x: 40, z: 10 });
  f.state.items[0].customSpec.shelves = 99;
  assert.deepEqual(prepared.plan.params.items[0].customSpec, { shelves: 5 });
});

test("item.duplicate preserves custom fields, clears runtime ownership and regroups a set", () => {
  const f = fixture();
  const prepared = prepareItemDuplicate({ sourceIds: [4, 5], offsetX: 30, offsetZ: 30 }, f.env);
  const result = applyItemDuplicate(prepared.plan, f.env);
  assert.equal(result.ok, true);
  assert.equal(result.created.length, 2);
  const copies = f.state.items.slice(-2);
  assert.deepEqual(copies[0].customSpec, { shelves: 5 });
  assert.equal(copies[0].locked, undefined);
  assert.equal(copies[0].runtimeState, undefined);
  assert.equal(copies[0].groupId, copies[1].groupId);
  assert.notEqual(copies[0].groupId, 8);
  assert.deepEqual([copies[0].x, copies[0].z], [40, 50]);
});

test("item.duplicate rejects missing and duplicate sources", () => {
  const f = fixture();
  assert.equal(prepareItemDuplicate({}, f.env).reason, "INVALID_ITEM_SOURCE");
  assert.equal(prepareItemDuplicate({ sourceIds: [4, 4] }, f.env).reason, "INVALID_ITEM_SOURCE");
  assert.equal(prepareItemDuplicate({ sourceId: 999 }, f.env).reason, "ITEM_SOURCE_NOT_FOUND");
});

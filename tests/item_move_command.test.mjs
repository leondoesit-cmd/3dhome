import test from "node:test";
import assert from "node:assert/strict";
import { prepareItemMove, previewItemMove, applyItemMove } from "../js/commands/item_move.js";

function fixture() {
  const state = { idc: 10, nodes: [], walls: [], openings: [], items: [
    { id: 15, type: "fridge", x: 355, z: 55, w: 75, d: 75, h: 190, rot: 0 },
  ] };
  return { state, env: { state, version: { current: () => 8 }, services: {
    commitItemPlacement(item, placement) {
      item.x = placement.x;
      item.z = placement.z;
      if (placement.rotationSpecified) item.rot = placement.rotation;
      return { ok: true, changedIds: [item.id] };
    },
  } } };
}

test("item.move prepares a pure ghost from relative movement", () => {
  const f = fixture();
  const before = structuredClone(f.state);
  const prepared = prepareItemMove({ itemId: 15, deltaX: -50 }, f.env);
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.plan.params.from, { x: 355, z: 55 });
  assert.deepEqual(prepared.plan.params.to, { x: 305, z: 55 });
  const preview = previewItemMove(prepared.plan);
  assert.equal(preview.kind, "item-move");
  assert.deepEqual(preview.delta, { x: -50, z: 0 });
  assert.deepEqual(f.state, before, "preview preparation must not move the fridge");
});

test("item.move applies only after command execution", () => {
  const f = fixture();
  const prepared = prepareItemMove({ itemId: 15, x: 305, z: 55 }, f.env);
  const result = applyItemMove(prepared.plan, f.env);
  assert.equal(result.ok, true);
  assert.deepEqual([f.state.items[0].x, f.state.items[0].z], [305, 55]);
  assert.deepEqual(result.changed, [{ kind: "item", id: 15 }]);
});

test("item.move can rotate an item onto a wall", () => {
  const f = fixture();
  const prepared = prepareItemMove({ itemId: 15, x: 375, z: 55, rot: 90 }, f.env);
  assert.equal(prepared.ok, true);
  assert.equal(prepared.plan.params.rotation, 90);
  const result = applyItemMove(prepared.plan, f.env);
  assert.equal(result.ok, true);
  assert.deepEqual([f.state.items[0].x, f.state.items[0].z, f.state.items[0].rot], [375, 55, 90]);
});

test("item.move requires one existing target and a complete destination", () => {
  const f = fixture();
  assert.equal(prepareItemMove({}, f.env).reason, "AMBIGUOUS_ITEM_TARGET");
  assert.equal(prepareItemMove({ itemId: 99, x: 0, z: 0 }, f.env).reason, "ITEM_SOURCE_NOT_FOUND");
  assert.equal(prepareItemMove({ itemId: 15 }, f.env).reason, "INVALID_ITEM_POSITION");
});

test("item.move fails closed without the canonical placement service", () => {
  const f = fixture();
  const prepared = prepareItemMove({ itemId: 15, x: 305, z: 55 }, f.env);
  delete f.env.services.commitItemPlacement;
  assert.equal(applyItemMove(prepared.plan, f.env).reason, "PLACEMENT_SERVICE_UNAVAILABLE");
  assert.deepEqual([f.state.items[0].x, f.state.items[0].z], [355, 55]);
});

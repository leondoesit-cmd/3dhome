import test from "node:test";
import assert from "node:assert/strict";
import {
  ITEM_PLACE_CODES,
  applyItemPlace,
  itemPlaceCommand,
  prepareItemPlace,
  previewItemPlace,
} from "../js/commands/item_place.js";

const catalog = {
  chair: { w: 48, d: 52, h: 86 },
  sofa: { width: 210, depth: 92, height: 82 },
  broken: { w: 0, d: 30, h: 40 },
};

function fixture() {
  return { items: [], idc: 30, sel: { kind: "wall" }, tool: "furn" };
}

test("item.place prepares a snapped serializable plan from catalog dimensions", () => {
  const state = fixture();
  const result = prepareItemPlace(
    { type: "chair", x: 13.1, z: -4.9 },
    { state, itemCatalog: catalog, version: { current: () => 12 } },
  );
  assert.deepEqual(result, {
    ok: true,
    plan: {
      command: "item.place",
      expectedVersion: 12,
      params: { type: "chair", x: 14, z: -4, rot: 0, w: 48, d: 52, h: 86 },
    },
  });
  assert.doesNotThrow(() => JSON.stringify(result.plan));
});

test("item.place accepts Map catalogs and long dimension names", () => {
  const result = prepareItemPlace(
    { type: "sofa", x: 1, z: 3, rot: 90 },
    { state: fixture(), catalog: new Map([["sofa", catalog.sofa]]) },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.params, {
    type: "sofa", x: 2, z: 4, rot: 90, w: 210, d: 92, h: 82,
  });
});

test("item.place returns stable diagnostic codes for invalid input", () => {
  const env = { state: fixture(), itemCatalog: catalog };
  assert.equal(prepareItemPlace({ x: 0, z: 0 }, env).reason, "INVALID_ITEM_TYPE");
  assert.equal(prepareItemPlace({ type: "desk", x: 0, z: 0 }, env).reason, "ITEM_TYPE_NOT_FOUND");
  assert.equal(prepareItemPlace({ type: "chair", x: Infinity, z: 0 }, env).reason, "INVALID_ITEM_POSITION");
  assert.equal(prepareItemPlace({ type: "chair", x: 0, z: NaN }, env).reason, "INVALID_ITEM_POSITION");
  assert.equal(prepareItemPlace({ type: "broken", x: 0, z: 0 }, env).reason, "INVALID_ITEM_DIMENSIONS");
  assert.deepEqual(new Set(itemPlaceCommand.failureCodes), new Set(ITEM_PLACE_CODES));
});

test("item.place preview is pure JSON with the snapped footprint", () => {
  const state = fixture(), env = { state, itemCatalog: catalog };
  const prepared = prepareItemPlace({ type: "chair", x: 13, z: 5 }, env);
  const before = structuredClone(state);
  const preview = previewItemPlace(prepared.plan, env);
  assert.deepEqual(preview, {
    kind: "item",
    type: "chair",
    center: { x: 14, z: 6 },
    width: 48,
    depth: 52,
    height: 86,
    rotation: 0,
    style: "ghost-valid",
  });
  assert.deepEqual(state, before);
  assert.doesNotThrow(() => JSON.stringify(preview));
});

test("item.place applies through its pure default without UI side effects", () => {
  const state = fixture(), env = { state, itemCatalog: catalog };
  const prepared = prepareItemPlace({ type: "chair", x: 13, z: 5 }, env);
  const result = applyItemPlace(prepared.plan, env);
  assert.deepEqual(state.items, [{
    id: 30, type: "chair", x: 14, z: 6, w: 48, d: 52, h: 86, rot: 0,
  }]);
  assert.equal(state.idc, 31);
  assert.deepEqual(result.created, [{ kind: "item", id: 30 }]);
  assert.deepEqual(result.changed, []);
  assert.equal(result.effects.dirty3D, true);
  assert.equal(state.sel.kind, "wall", "the command does not select the item");
  assert.equal(state.tool, "furn", "the command does not switch tools");
});

test("item.place uses injected runtime creation and auto-facing services", () => {
  const state = fixture(), calls = [];
  const env = {
    state,
    itemCatalog: catalog,
    services: {
      createItem(type, x, z, rot) {
        calls.push(["create", type, x, z, rot]);
        return { id: 77, type, x, z, rot, w: 48, d: 52, h: 86 };
      },
      applyAutoFace(item, x, z, context) {
        calls.push(["face", item.id, x, z, context]);
        item.rot = 180;
      },
    },
  };
  const prepared = prepareItemPlace({ type: "chair", x: 9, z: 11 }, env);
  const result = applyItemPlace(prepared.plan, env);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ["create", "chair", 10, 12, 0],
    ["face", 77, 10, 12, {}],
  ]);
  assert.equal(state.items[0].rot, 180);
  assert.equal(state.idc, 30, "the injected factory owns id allocation");
});

test("item.place rejects a failed injected factory without mutating the list", () => {
  const state = fixture(), env = {
    state,
    itemCatalog: catalog,
    services: { createItem: () => null },
  };
  const prepared = prepareItemPlace({ type: "chair", x: 0, z: 0 }, env);
  assert.deepEqual(applyItemPlace(prepared.plan, env), { ok: false, reason: "ITEM_CREATE_FAILED" });
  assert.deepEqual(state.items, []);
});

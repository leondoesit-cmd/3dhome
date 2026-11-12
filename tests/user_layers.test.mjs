import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import {
  userLayers, addUserLayer, removeUserLayer, renameUserLayer, assignUserLayer, itemsOnUserLayer,
  itemUserVis, itemUserLocked, itemUserUnpickable, refLocked, hideUserLayerItems, userLayerKey, nextUserLayerName,
} from "../js/user_layers.js";
import { canDrag } from "../js/layers.js";
import { hiddenSets } from "../js/geometry.js";
import { floorBelow, floorAbove } from "../js/floors.js";
import { WALL_MODES, CUT_STYLES, wallMode, nearCutOn, cutStyle, setNearCut, setCutStyle, resetWallView } from "../js/wall_view.js";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";

function fresh() {
  S.workspace = { ...S.workspace, userLayers: [] };
  S.items = [
    { id: "a", type: "sofa", x: 0, z: 0, w: 100, d: 50, rot: 0 },
    { id: "b", type: "chair", x: 200, z: 0, w: 50, d: 50, rot: 0 },
    { id: "c", type: "table", x: 400, z: 0, w: 80, d: 80, rot: 0 },
  ];
  S.roomMeta = {};
}

test("user layers: create, name, assign, take off, delete", () => {
  fresh();
  const L = addUserLayer("Kitchen");
  assert.equal(userLayers().length, 1);
  assert.equal(assignUserLayer([S.items[0], S.items[1]], L.id), 2);
  assert.deepEqual(itemsOnUserLayer(L.id).map((i) => i.id), ["a", "b"]);
  assert.ok(renameUserLayer(L.id, "  Phase 2 "));
  assert.equal(L.name, "Phase 2");
  assert.equal(renameUserLayer(L.id, "   "), false, "an empty name is refused");
  assignUserLayer([S.items[1]], null);
  assert.equal(S.items[1].ulayer, undefined);
  assert.ok(removeUserLayer(L.id));
  assert.equal(userLayers().length, 0);
  assert.equal(S.items[0].ulayer, undefined, "its pieces belong to none afterwards");
  assert.equal(nextUserLayerName("Layer"), "Layer 1");
});

test("user layers: hidden pieces leave through hiddenSets, faded ones stop picking", () => {
  fresh();
  const L = addUserLayer("Rented");
  assignUserLayer([S.items[2]], L.id);
  assert.equal(itemUserVis(S.items[2]), "show");
  L.vis = "hide";
  assert.deepEqual(hideUserLayerItems({}), { c: 1 });
  assert.equal(hiddenSets().items.c, 1, "the shared hidden set carries it");
  assert.ok(userLayerKey().includes(":hide"), "cache keys see the change");
  L.vis = "ghost";
  assert.deepEqual(hideUserLayerItems({}), {}, "faded is drawn, not hidden");
  assert.ok(itemUserUnpickable(S.items[2]));
  // a piece pointing at a layer that no longer exists belongs to none
  S.items[0].ulayer = "ul-gone";
  assert.equal(itemUserVis(S.items[0]), "show");
});

test("user layers: a locked layer refuses the drag like a pinned piece", () => {
  fresh();
  S.workSet = "furniture";
  S.layers.furniture.locked = false;
  S.layers.furniture.vis = "show";
  S.layers.furniture.pickOverride = null;
  const L = addUserLayer("Fixed");
  assignUserLayer([S.items[0]], L.id);
  assert.ok(canDrag({ kind: "item", ref: S.items[0] }));
  L.locked = true;
  assert.ok(itemUserLocked(S.items[0]) && refLocked(S.items[0]));
  assert.equal(canDrag({ kind: "item", ref: S.items[0] }), false);
  // a multi-selection is refused only when every member is locked
  assert.ok(canDrag({ kind: "items", refs: [S.items[0], S.items[1]] }));
});

test("floor below mirrors floor above", () => {
  const ws = {
    activeFloor: "f2",
    floors: [{ id: "f1", elevation: 0 }, { id: "f2", elevation: 300 }, { id: "f3", elevation: 600 }],
  };
  assert.equal(floorBelow(ws).id, "f1");
  assert.equal(floorAbove(ws).id, "f3");
  assert.equal(floorBelow({ ...ws, activeFloor: "f1" }), null);
});

test("walls switch: three positions, three looks, Down is the dollhouse cut", () => {
  resetWallView();
  assert.deepEqual(WALL_MODES, ["up", "cut", "down"]);
  assert.deepEqual(CUT_STYLES, ["stub", "fade", "hide"]);
  S.cutaway = { on: false, height: 160, cap: "white" };
  assert.equal(nearCutOn(), true);
  assert.equal(wallMode(), "cut");
  setNearCut(false);
  assert.equal(wallMode(), "up");
  S.cutaway = { on: true, height: 160, cap: "white" };
  assert.equal(wallMode(), "down");
  setCutStyle("fade");
  assert.equal(cutStyle(), "fade");
  setCutStyle("nonsense");
  assert.equal(cutStyle(), "fade");
  resetWallView();
  S.cutaway = { on: false, height: 160, cap: "white" };
});

test("the 3D view honours the switch, the stub and the kept wall", async () => {
  const src = moduleSource("js/view3d.js");
  assert.match(src, /\(\(!!S\.edit3D && nearCutOn\(\)\) \|\| framedInterior\)/);
  assert.match(src, /if \(stubBuildH\) return stubBuildH;/);
  assert.match(src, /structureRoot\.add\(stubRoot\)/);
  assert.match(src, /function keptWalls\(\)/);
  assert.match(src, /function seeAim\(\)/);
  assert.match(src, /\["walls3d:changed", "planner-selection"\]/);
  const nav = await readFile(new URL("../js/planner_3d.js", import.meta.url), "utf8");
  assert.match(nav, /wallsButton\(\)/);
});

test("the Layers tab carries workspaces, counts, the floor reference and user layers", async () => {
  const src = await readFile(new URL("../js/ui_layers.js", import.meta.url), "utf8");
  for (const p of ["build", "furnish", "services", "present"]) assert.match(src, new RegExp("\\b" + p + ": \\{"));
  assert.match(src, /function selectLayer\(/);
  assert.match(src, /function followReference\(/);
  assert.match(src, /function renderUserRows\(/);
  // a tool that moves the work set says so, with a way back
  assert.match(src, /t\("lay_ws_auto"/);
  assert.match(src, /label: t\("lay_ws_stay"/);
});

test("every new string exists in both locales", () => {
  const keys = Object.keys(en).filter((k) => /^(ul_|walls_|lay_preset|lay_ref|lay_select|lay_ws_auto|lay_ws_stay|lay_key)/.test(k));
  assert.ok(keys.length > 40);
  for (const k of keys) assert.equal(typeof he[k], "string", "he " + k);
});

test("the phone gets the same: Walls in the 3D toolbar, the new Layers parts in its drop-down", async () => {
  const shell = await readFile(new URL("../js/mobile_shell.js", import.meta.url), "utf8");
  assert.match(shell, /run: openWallsMenu/);
  assert.match(shell, /addEventListener\("walls3d:changed"/);
  const css = (await readFile(new URL("../css/pro_compact.css", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(css, /ps-layers-open #view-2d #layer-chips \.lchip\.lchip-x\[hidden\] \{ display: none !important; \}/,
    "the drop-down's own .lchip rule must not resurrect a hidden floor-reference row");
  for (const part of ["lchip-status", "lchip-presets", "lchip-count", "lchip-user"])
    assert.match(css, new RegExp("ps-layers-open #view-2d #layer-chips \." + part));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { runInNewContext } from "node:vm";
import { sourceFunctionText } from "./helpers/source_function.mjs";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "three") return { url: new URL("../vendor/three/three.module.js", import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith("three/addons/")) return { url: new URL("../vendor/three/addons/" + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { S } = await import("../js/state.js");
const { FURN, isLamp } = await import("../js/furniture.js");
const { apartmentGenerateCommand } = await import("../js/generator.js");
const { executeCommand } = await import("../js/commands/executor.js");
const { prepareItemDuplicate, applyItemDuplicate } = await import("../js/commands/item_duplicate.js");
const stack = await import("../js/stack.js");
const groups = await import("../js/group_frame.js");
const { orientMode, wallSnapSegments, applyAutoFace } = await import("../js/item_orient.js");
const { resolveItemDrag } = await import("../js/item_wall_snap.js");
const { usedNodes } = await import("../js/geometry.js");
const { refLocked } = await import("../js/user_layers.js");
const read = file => readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
function use(fn, source, env) {
  return runInNewContext("(" + sourceFunctionText(source, fn) + ")", env);
}
const pointer = read("interaction/pointer_down.js"), drag = read("interaction/layout_drag.js");
const noop = () => {};

function checkUnitDrags(peers, env, pick, movePointer) {
  for (const unit of peers) {
    const rad = unit.rot * Math.PI / 180, points = [];
    for (const u of [0, -0.35, 0.35]) for (const v of [0, -0.35, 0.35]) {
      points.push({ x: unit.x + u * unit.w * Math.cos(rad) - v * unit.d * Math.sin(rad),
        z: unit.z + u * unit.w * Math.sin(rad) + v * unit.d * Math.cos(rad) });
    }
    const hit = points.find(p => env.hitItem(p.x, p.z) === unit);
    assert.ok(hit, unit.type + " must expose a pickable part of its footprint");
    env.px = hit.x; env.pz = hit.z;
    S.sel = null;
    assert.equal(pick(0), true);
    assert.equal(S.sel.ref, unit);
    const pose = { ...unit }, others = peers.filter(it => it !== unit).map(it => [it, it.x, it.z]);
    movePointer(hit.x + 45, hit.z + 55, false);
    assert.ok(Math.hypot(unit.x - pose.x, unit.z - pose.z) > 1, unit.type + " should move in an ordinary drag");
    for (const [it, x, z] of others) assert.deepEqual([it.x, it.z], [x, z], it.type + " followed " + unit.type);
    delete unit.on; delete unit.elev;
    Object.assign(unit, pose);
  }
}

test("clicking and moving one generated unit leaves its set in place, explicit selection picks its visible peers", async () => {
  const env = { S, ...groups, ...stack, stackAttach: stack.attach, stackDetach: stack.detach, stackReseat: stack.reseat,
    wallSnapSegments, orientMode, applyAutoFace, resolveItemDrag, wallPlaneDrag: () => false,
    wallSnapMemo: null, wallSnapPrev: () => null, dragAim: () => null, snapMul: () => 1,
    flashSnap: noop, touchItem3D: noop, layerRank: name => name === "furniture" ? 0 : Infinity,
    hiddenSets: () => ({ items: {} }), itemUserUnpickable: () => false, refLocked, plannerInputView: () => null,
    canDrag: () => true, e: {}, render2D: noop, beginHistory: noop, select: s => { S.sel = s; } };
  env.applyResolvedItemTranslation = use("applyResolvedItemTranslation", drag, env);
  const hitTest = read("interaction/hit_test.js");
  Object.assign(env, { isLamp, nearRecs: () => S.items.map(ref => ({ ref })), tolCm: px => px / 3,
    interactionLocals: { trackLongPress: noop, planPrecisionPoint: (_e, x, y) => ({ x, y }) },
    isElevation: () => false, wireOrthoHoldKeys: noop, fin: Number.isFinite, plan: {},
    wx: x => x, wz: (_x, z) => z, inputBounds: () => ({}), sendPlanCursor: noop, updateWallProbe: noop,
    commitPending: noop, groupSnapMemo: null });
  env.inItem = use("inItem", hitTest, env);
  env.hitItem = use("hitItem", hitTest, env);
  env.furniturePickAt = use("furniturePickAt", pointer, env);
  env.usedNodes = usedNodes;
  for (const name of ["halfExtents", "snapAxis", "alignItem"]) env[name] = use(name, hitTest, env);
  env.moveItemTo = use("moveItemTo", drag, env);
  env.groupWallMove = use("groupWallMove", drag, env);
  use("wirePlanMove", read("interaction/plan_move.js"), env)();
  const pick = use("runSelectPass", pointer, env);
  Object.assign(env, { inputScale: () => 3, hitMarker: () => null, hitOpening: () => null });
  const contextPick = use("selectAtScreen", read("interaction/wall_edit.js"), env);
  const movePointer = (x, z, altKey = true) => env.interactionLocals.planMove({ pointerType: "mouse", offsetX: x, offsetY: z, altKey });
  for (const seed of [1, 42, 9876]) {
    const generated = executeCommand(apartmentGenerateCommand, { size: "large", seed, replace: true, replaceInfrastructure: true },
      { domain: "planner", state: S, itemCatalog: FURN }, { history: false });
    assert.equal(generated.ok, true, generated.reason);
    for (const zone of ["dining", "kitchen"]) {
      const peers = S.items.filter(it => it.functionalZone === zone);
      const unit = peers.find(it => it.type === (zone === "dining" ? "chair" : "sink"));
      assert.ok(unit && peers.length > 1, "missing set in " + zone);
      checkUnitDrags(peers, env, pick, movePointer);
      S.sel = null;
      Object.assign(env, { px: unit.x, pz: unit.z });
      assert.equal(contextPick(unit.x, unit.z).ref, unit, "context menu targets a single unit");
      S.sel = null;
      assert.equal(pick(0), true);
      assert.equal(S.sel.kind, "item", zone + " click must select just the unit");
      assert.equal(S.sel.ref, unit);
      const before = peers.filter(it => it !== unit).map(it => [it, it.x, it.z]);
      const start = [unit.x, unit.z];
      movePointer(unit.x + 8, unit.z + 4);
      assert.notDeepEqual([unit.x, unit.z], start);
      before.forEach(([it, x, z]) => assert.deepEqual([it.x, it.z], [x, z], it.type + " moved with " + unit.type));
      const hidden = peers.find(it => it !== unit);
      env.hiddenSets = () => ({ items: { [hidden.id]: true } });
      env.uiLocals = { AL_ACTS: {} };
      const actions = read("ui/selection_actions.js");
      env.selectableLayoutMembers = use("selectableLayoutMembers", actions, env);
      env.selectLayoutSet = use("selectLayoutSet", actions, env);
      env.runSelectionAction = use("runSelectionAction", actions, env);
      let button;
      const panel = { querySelector: selector => selector === "#selname2" ? { after: b => { button = b; } } : button };
      env.document = { getElementById: () => panel, createElement: () => ({ style: {}, dataset: {} }) };
      env.getLang = () => "en";
      use("showLayoutSetAction", actions, env)();
      assert.equal(button.textContent, "Select group");
      await button.onclick();
      assert.equal(S.sel.kind, "items");
      const visible = peers.filter(it => it !== hidden);
      assert.deepEqual(S.sel.refs.map(it => it.id).sort(), visible.map(it => it.id).sort());
      env.hiddenSets = () => ({ items: {} });
      const ceilingOverlay = { id: -1, type: "ceilingLight", x: unit.x, z: unit.z, w: 50, d: 50, h: 8, rot: 0 };
      S.items.push(ceilingOverlay);
      assert.equal(env.hitItem(unit.x, unit.z), ceilingOverlay);
      env.plannerInputView = () => ({ id: "3d", hit: { kind: "item", ref: unit } });
      env.px = unit.x;
      env.pz = unit.z;
      pick(0);
      assert.equal(S.sel.kind, "items", "the visible 3D unit retains the explicit selection, even with a ceiling light above");
      assert.deepEqual(S.dragOrig.map(o => o.it.id).sort(), visible.map(it => it.id).sort(), "explicit set is ready for a group drag");
      const hiddenStart = [hidden.x, hidden.z];
      movePointer(unit.x + 15, unit.z - 20);
      const first = S.dragOrig[0], dx = first.it.x - first.x, dz = first.it.z - first.z;
      assert.ok(Math.hypot(dx, dz) > 20);
      for (const o of S.dragOrig) {
        assert.ok(Math.abs(o.it.x - o.x - dx) < 1e-8 && Math.abs(o.it.z - o.z - dz) < 1e-8);
      }
      assert.deepEqual([hidden.x, hidden.z], hiddenStart);
      const pinned = visible.find(it => it !== unit);
      pinned.locked = true;
      env.blockedDrag = noop;
      pick(0);
      assert.equal(S.action, null, "a pinned member anchors the selected set");
      pinned.locked = false;
      S.items.pop();
      env.plannerInputView = () => null;
    }
  }
});

test("reopening an older generated set keeps units independent and preserves manual groups", () => {
  const table = { type: "table", id: 101, groupId: 100 };
  const chair = { type: "chair", id: 102, groupId: 100 };
  const manual = [{ type: "table", id: 111, groupId: 119 }, { type: "chair", id: 112, groupId: 119 }];
  const run = ["fridge", "sink", "cooktop", "trackLight"].map((type, i) =>
    ({ type, id: i === 3 ? 207 : 200 + i, groupId: 203 }));
  const items = [table, chair, ...manual, ...run];
  groups.restoreLayoutSets(items);
  assert.deepEqual(groups.layoutSetMembers(items, table), [table, chair]);
  assert.deepEqual(groups.layoutSetMembers(items, run[0]), run);
  assert.ok([table, chair, ...run].every(it => it.groupId == null));
  assert.ok(manual.every(it => it.groupId === 119 && groups.layoutSetId(it) == null));
});

test("copying a chair detaches it from the source set and copying sets preserves separate memberships", () => {
  const state = { idc: 100, items: [1, 2, 3, 4].map(id =>
    groups.setLayoutSetId({ type: "chair", id, x: id * 10, z: 5 }, id < 3 ? 7 : 8)) };
  function duplicate(ids) {
    const env = { state };
    const prepared = prepareItemDuplicate({ sourceIds: ids }, env);
    assert.equal(prepared.ok, true);
    const result = applyItemDuplicate(prepared.plan, env);
    assert.equal(result.ok, true);
    return result.created.map(({ id }) => state.items.find(it => it.id === id));
  }
  assert.equal(groups.layoutSetId(duplicate([1])[0]), undefined);
  const copies = duplicate([1, 2, 3, 4]);
  assert.deepEqual(groups.layoutSetMembers(state.items, copies[0]), copies.slice(0, 2));
  assert.deepEqual(groups.layoutSetMembers(state.items, copies[3]), copies.slice(2));
});

test("duplicate remaps partners and hosted accessories only to their own copied pieces", () => {
  const state = { idc: 100, items: [
    { id: 1, type: "table", x: 100, z: 100 },
    { id: 2, type: "chair", x: 100, z: 160, facesId: 1 },
    { id: 3, type: "tableLamp", x: 100, z: 100, on: 1, elev: 75 },
    { id: 4, type: "pendant", x: 100, z: 100, supportId: 1 }
  ] };
  const copy = ids => {
    const prepared = prepareItemDuplicate({ sourceIds: ids }, { state });
    const result = applyItemDuplicate(prepared.plan, { state });
    return result.created.map(({ id }) => state.items.find(it => it.id === id));
  };
  const [table, chair, lamp, pendant] = copy([1, 2, 3, 4]);
  assert.equal(chair.facesId, table.id);
  assert.equal(pendant.supportId, table.id);
  assert.equal(lamp.on, table.id);
  const [soloSeat, soloLamp, soloPendant] = copy([2, 3, 4]);
  assert.equal(soloSeat.facesId, undefined);
  assert.equal(soloLamp.on, undefined);
  assert.equal(soloLamp.elev, undefined);
  assert.equal(soloPendant.supportId, undefined);
});

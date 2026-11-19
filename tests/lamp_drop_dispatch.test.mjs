import assert from "node:assert/strict";
import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

// Run the planner controller's actual release branch. The DOM, history and
// network callbacks are sinks here. A true dirty3D makes the animation loop
// retire the structure, even when the transform queue has already drained.
const endAction = sourceFunctionText(moduleSource("js/interaction.js"), "endAction");
const finishDrop = sourceFunctionText(moduleSource("js/view3d.js"), "finishItemDrop3D");
function release({ movedBoundary, hidden, physics, alreadyDirty = false, fixture = true } = {}) {
  const lamp = { id: 1, type: "floorLamp" };
  const S = { action: "item", sel: { kind: "item", ref: lamp }, items: [lamp], dirty3D: alreadyDirty };
  const noop = () => {};
  const services = {
    S, plan: { classList: { remove: noop } },
    interactionLocals: { cancelLongPress: noop, stopAutoPan: noop },
    dropDragProxy: noop, endSnapSession: noop, touchPrecisionTrialOwns: () => false,
    finalizeItemPlacement: noop, fillProps: noop, syncStairVoids: () => false,
    itemMovePlanOps: () => [], broadcastPlanOp: noop, refreshTree: noop,
    cancelPending: noop, disarmHistoryGesture: noop,
    itemCache: new Map([[1, { g: { fixture } }]]), builtContentBounds: { minx: 0, maxx: 100, minz: 0, maxz: 100 },
    contentBounds: () => ({ minx: 0, maxx: movedBoundary ? 140 : 100, minz: 0, maxz: 100 }),
    hiddenSets: () => ({ items: hidden ? { 1: true } : {} }), isPhysicsEnabled: () => !!physics,
    extTick: null, gameRendererLock: false, updateSeeThrough: noop,
  };
  new Function(...Object.keys(services), finishDrop + '\n' + endAction + '\nendAction({ type: "pointerup" });')(...Object.values(services));
  assert.equal(S.action, null);
  return S.dirty3D;
}

test("a settled lamp release leaves the warm scene in place", () => {
  assert.equal(release(), false);
  assert.equal(release({ movedBoundary: true }), true, "sun camera and ground bounds changed");
  assert.equal(release({ hidden: true }), true, "the fixture left the visible scene");
  assert.equal(release({ physics: true }), true, "physics owns the transforms");
  assert.equal(release({ alreadyDirty: true }), true, "another pending structural edit still lands");
  assert.equal(release({ fixture: false }), true, "other item types retain their release behavior");
});

/* When the 3D loop may run a pending rebuild (js/view3d/rebuild_hold.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { stripComments } from "./source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { holdRebuild, HIDDEN_QUIET_MS, VISIBLE_EDIT_IDLE_MS, VISIBLE_PLAN_DRAG_REBUILD_MS } from "../js/view3d/rebuild_hold.js";

const base = { pending: true, hidden: false, pressed: false, sinceInput: 1e6, onPlan: false, sinceRebuild: 1e6, gestureRebuildMs: 0 };
const hold = (o) => holdRebuild(Object.assign({}, base, o));

test("nothing pending: never held", () => {
  assert.equal(hold({ pending: false, hidden: true, pressed: true, sinceInput: 0 }), false);
});

test("a hidden pane waits for a real pause, not 300 ms", () => {
  assert.equal(hold({ hidden: true, sinceInput: 400 }), true, "the user is still at work");
  assert.equal(hold({ hidden: true, sinceInput: HIDDEN_QUIET_MS - 1 }), true);
  assert.equal(hold({ hidden: true, sinceInput: HIDDEN_QUIET_MS }), false);
  assert.equal(hold({ hidden: true, pressed: true, sinceInput: 1e6 }), true, "a held button is a gesture in progress");
});

test("a pane that is shown builds what is pending at once (never stale on open)", () => {
  // the click that opened 3D was input a moment ago: a visible pane does not wait for quiet
  assert.equal(hold({ hidden: false, sinceInput: 5 }), false);
  assert.equal(hold({ hidden: false, sinceInput: 5, pressed: true, onPlan: false }), false, "a gesture in 3D itself");
});

test("a visible pane follows a 2D drag at ~8 Hz, slower for slow rebuilds (unchanged)", () => {
  const drag = { pressed: true, onPlan: true, sinceInput: 0 };
  assert.equal(hold({ ...drag, sinceRebuild: VISIBLE_PLAN_DRAG_REBUILD_MS - 1 }), true);
  assert.equal(hold({ ...drag, sinceRebuild: VISIBLE_PLAN_DRAG_REBUILD_MS }), false);
  assert.equal(hold({ ...drag, sinceRebuild: 500, gestureRebuildMs: 200 }), true, "3 x a 200 ms rebuild");
  assert.equal(hold({ ...drag, sinceRebuild: 600, gestureRebuildMs: 200 }), false);
  assert.equal(hold({ sinceInput: VISIBLE_EDIT_IDLE_MS }), false);
});

test("the render loop asks holdRebuild with the canvas's real visibility and every input", () => {
  const src = stripComments(moduleSource("js/view3d.js"));
  assert.match(src, /hidden: !!el && el\.getClientRects\(\)\.length === 0,/);
  assert.match(src, /sinceInput: time - editInputT,/);
  assert.match(src, /window\.addEventListener\("wheel", noteEditInput,/);
  assert.match(src, /var heldNow = holdHiddenRebuild\(time\);/);
});

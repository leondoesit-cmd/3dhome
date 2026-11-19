/* When the 3D loop may run a pending rebuild (js/view3d/rebuild_hold.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { stripComments } from "./source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { holdRebuild, plannerCanvasHidden, HIDDEN_QUIET_MS, VISIBLE_EDIT_IDLE_MS, VISIBLE_PLAN_DRAG_REBUILD_MS } from "../js/view3d/rebuild_hold.js";
import { stylesSource } from "./helpers/styles_source.mjs";

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

test("dragging in maximised Plan skips the 3D canvas layout read on every frame", () => {
  let reads = 0, inMaximisedPlan = true, visible = false;
  const canvas = {
    closest(selector) {
      assert.equal(selector, "#center-canvas.max-view-2d #view-3d");
      return inMaximisedPlan ? {} : null;
    },
    getClientRects() { reads++; return visible ? [{}] : []; },
  };
  assert.match(stylesSource(), /#center-canvas\.max-view-2d #view-3d,[^{]*\{\s*display: none !important;/);
  for (let i = 0; i < 30; i++) assert.equal(plannerCanvasHidden(canvas), true);
  assert.equal(reads, 0);
  inMaximisedPlan = false;
  visible = true;
  assert.equal(plannerCanvasHidden(canvas), false, "Split, 3D, or the pane reparented to the inspector");
  visible = false;
  assert.equal(plannerCanvasHidden(canvas), true, "some other ancestor hides the canvas");
  assert.equal(reads, 2);
});

test("a hidden pane rebuilds once for four completed materials in one load burst", () => {
  let rebuilds = 0, last = 0;
  for (const time of [25, 45, 80, 110]) {
    if (!hold({ hidden: true, sinceRebuild: time - last, waitingTextures: time < 110 })) {
      rebuilds++;
      last = time;
    }
  }
  assert.equal(rebuilds, 1);
  assert.equal(hold({ hidden: false, waitingTextures: true, sinceRebuild: 25 }), false);
  assert.equal(hold({ hidden: true, waitingTextures: true, sinceRebuild: HIDDEN_QUIET_MS }), false,
    "a slow load cannot strand another pending scene edit");
});

test("cold picture demand defers a hidden rebuild and opening 3D releases it immediately", () => {
  assert.equal(hold({ hidden: true, waitingPictures: true }), true);
  assert.equal(hold({ hidden: true, waitingPictures: false }), false);
  assert.equal(hold({ hidden: false, waitingPictures: true }), false);
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
  assert.match(src, /hidden: plannerCanvasHidden\(el\),/);
  assert.match(src, /drewOnce && plannerCanvasHidden\(renderer\.domElement\)/);
  assert.match(src, /sinceInput: time - editInputT,/);
  assert.match(src, /window\.addEventListener\("wheel", noteEditInput,/);
  assert.match(src, /var heldNow = holdHiddenRebuild\(time\);/);
});

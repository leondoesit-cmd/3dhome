/* What one gesture is allowed to cost the undo stack.
 *
 * snap() (js/history.js) is a JSON.stringify of the entire project — spatial,
 * workspace, parametric, MEP, smart-home. It is the most expensive thing in the
 * file, and the only honest way to make a drag cheaper is to call it less often,
 * never to make it smaller: what is in it is load-bearing (see the comments on
 * snap() itself, and "layer state stays out of the history snapshot" in
 * tests/layers.test.mjs).
 *
 * tools/perf_harness.mjs measured FOUR snapshots per 20-move drag. Two were the
 * gesture (begin on pointerdown, commit on the first move); the other two were
 * the history panel redrawing itself inside a closed dropdown — H.tree() asks
 * liveTargets() for the current step's targets and liveTargets() re-reads the
 * live model through get(). This pins both halves.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../js/edit_history.js";
import { readCode } from "./source.mjs";

/* A stand-in for the plan: a model, a counted snapshot, and the same three
   calls interaction.js makes — begin on pointerdown, commit on the first move
   that actually happens, and a commit per move after that (planMove does not
   track which move it is; the engine is what makes the repeats free). */
function rig() {
  let model = { x: 0 };
  let calls = 0;
  const H = createHistory({
    get: () => {
      calls++;
      return JSON.stringify(model);
    },
    set: (json) => {
      model = JSON.parse(json);
    },
  });
  return { H, snapshots: () => calls, reset: () => (calls = 0), read: () => model, move: (dx) => (model.x += dx) };
}

test("a drag gesture costs one snapshot to open and one to close, and no more", () => {
  const r = rig();
  r.H.seed();
  r.reset();

  r.H.begin(); // pointerdown: capture the state the drag starts from
  for (let i = 1; i <= 20; i++) {
    r.move(10);
    r.H.commit("Move"); // planMove commits on every move; only the first is real
  }

  assert.equal(r.snapshots(), 2, "20-move drag = 2 snapshots (begin + the one commit)");
  assert.equal(r.H.isPending(), false);
  assert.equal(r.read().x, 200);
});

test("a drag that never moves costs one snapshot and leaves no step behind", () => {
  const r = rig();
  r.H.seed();
  const before = r.H.tree().length;
  r.reset();

  r.H.begin();
  r.H.cancel(); // pointerup with no move at all

  assert.equal(r.snapshots(), 1, "the pointerdown snapshot is the only one");
  assert.equal(r.H.tree().length, before, "no do-nothing entry in the tree");
  assert.equal(r.H.canUndo(), false);
});

test("a gesture cancelled after it moved drops its step, not the one under it", () => {
  const r = rig();
  r.H.seed();
  r.move(5);
  r.H.push("Nudge"); // a completed edit the drag must not eat
  const settled = r.H.tree().length;

  r.H.begin();
  r.move(40);
  r.H.cancel();

  assert.equal(r.H.tree().length, settled, "the abandoned step is gone");
  assert.equal(r.H.canUndo(), true, "the edit before it is still undoable");
});

test("undo and redo still land either side of the drag", () => {
  const r = rig();
  r.H.seed();

  r.H.begin();
  r.move(10);
  r.H.commit("Move");
  for (let i = 0; i < 19; i++) {
    r.move(10);
    r.H.commit("Move");
  }
  assert.equal(r.read().x, 200);

  assert.equal(r.H.undo(), true);
  assert.equal(r.read().x, 0, "undo returns to the state pointerdown captured");
  assert.equal(r.H.redo(), true);
  assert.equal(r.read().x, 200, "redo returns to where the drag ended");
  assert.equal(r.H.undo(), true);
  assert.equal(r.read().x, 0, "and the pair is repeatable");
});

test("the history panel is not refreshed while it is off screen", async () => {
  /* index.html mounts the panel in #planHist inside the toolbar's history
     dropdown, which is display:none until its trigger is clicked. Refreshing it
     there is a whole snapshot spent on a list nobody can see, so a refresh asked
     for while it is hidden is remembered and replayed when it is shown. */
  const src = await readCode(new URL("../js/history.js", import.meta.url));

  const refresh = src.slice(
    src.indexOf("export function refreshHistoryPanel"),
    src.indexOf("export function pushHistory"),
  );
  assert.ok(refresh.length > 0, "found refreshHistoryPanel()");
  assert.match(refresh, /if\s*\(!panelShown\)\s*\{\s*panelStale = true;\s*return;\s*\}/);

  const mount = src.slice(
    src.indexOf("export function mountHistoryPanel"),
    src.indexOf("export function refreshHistoryPanel"),
  );
  assert.match(mount, /watchPanelVisibility\(\);/, "mounting starts watching");
  assert.match(src, /new IntersectionObserver\(/, "visibility is observed, not polled");
  // the skipped refresh has to be paid back, or the panel opens showing stale steps
  assert.match(src, /panelShown && panelStale[\s\S]{0,120}panel\.refresh\(\)/);
  // and where there is no observer at all, nothing is ever deferred
  assert.match(src, /typeof IntersectionObserver !== "function"[\s\S]{0,60}panelShown = true;/);
});

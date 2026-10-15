/* The 3D pane's touch ownership rule (js/planner_touch.js): which fingers
   edit and which navigate, and what counts as a tap. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { touchClaims3D, isTouchTap } from "../js/planner_touch.js";

const sofa = { kind: "item", ref: { id: 1 } };
const wall = { kind: "wall", ref: { id: 2 } };

test("drawing and placing tools own the finger wherever it lands", () => {
  for (const tool of ["wall", "door", "window", "rect", "erase"]) {
    assert.equal(touchClaims3D(tool, null, null), true, tool);
    assert.equal(touchClaims3D(tool, sofa, null), true, tool);
  }
});

test("with the select tool, empty space and unselected pieces orbit", () => {
  assert.equal(touchClaims3D("select", null, null), false);
  assert.equal(touchClaims3D("select", sofa, null), false);
  assert.equal(touchClaims3D("select", sofa, wall), false);
  assert.equal(touchClaims3D(undefined, null, sofa), false);
});

test("only the piece that is already selected drags", () => {
  assert.equal(touchClaims3D("select", sofa, { kind: "item", ref: sofa.ref }), true);
});

test("a tap is short and still; anything else was an orbit", () => {
  const start = { x: 100, y: 100, t: 1000 };
  assert.equal(isTouchTap(start, { x: 104, y: 103 }, 1200, 10, 450), true);
  assert.equal(isTouchTap(start, { x: 130, y: 100 }, 1200, 10, 450), false);
  assert.equal(isTouchTap(start, { x: 100, y: 100 }, 1600, 10, 450), false);
  assert.equal(isTouchTap(null, { x: 0, y: 0 }, 0, 10, 450), false);
});

test("the 3D pane only blocks touch while it owns the gesture", async () => {
  const src = await readFile(new URL("../js/planner_3d.js", import.meta.url), "utf8");
  // the view's own orbit / pinch handlers must see un-owned touches
  assert.match(src, /type\.startsWith\('touch'\)\?dragId!=null:e\.button===0/);
  // a second finger abandons the edit
  assert.match(src, /touchIds\.size>1[\s\S]*?send\('cancel',e\)/);
  // and the older edit-mode drag never grabs a finger left to navigation
  assert.match(src, /setLegacyTouchEdit\(false\)/);
  const view = await readFile(new URL("../js/view3d.js", import.meta.url), "utf8");
  assert.match(view, /legacyTouchEdit &&\s*editDown\(/);
});

test("on the plan, touch drags only an already-selected room", async () => {
  const src = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
  assert.match(src, /var priorSel = e\.pointerType === "touch" \? preTouchSel : S\.sel;/);
  assert.match(src, /if \(e\.pointerType === "touch" && !wasSelected && !inputIs3D\(\)\) \{\s*S\.action = "pan";/);
});

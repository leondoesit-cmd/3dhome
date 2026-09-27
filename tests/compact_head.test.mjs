/* The pure parts of the phone and fold chrome (js/compact_head.js): the order
 * the editor knob turns through and where each face sits on it, what the
 * one-row header names, and the recent tools the bottom toolbar offers. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KNOB_ORDER, knobStep, knobOffset, pickTitle, pushRecent } from "../js/compact_head.js";

test("the knob turns Plan → Model → Cabinet and wraps both ways", () => {
  assert.deepEqual(KNOB_ORDER, ["plan", "model", "cab"]);
  assert.equal(knobStep("plan", 1), "model");
  assert.equal(knobStep("model", 1), "cab");
  assert.equal(knobStep("cab", 1), "plan");
  assert.equal(knobStep("plan", -1), "cab");
  assert.equal(knobStep("plan", -2), "model");
  assert.equal(knobStep("nonsense", 1), "model", "an unknown editor starts from the planner");
});

test("on the drum the editor in front is centred, the previous above, the next below", () => {
  assert.equal(knobOffset("plan", "plan"), 0);
  assert.equal(knobOffset("model", "plan"), 1);
  assert.equal(knobOffset("cab", "plan"), -1);
  assert.equal(knobOffset("plan", "model"), -1);
  assert.equal(knobOffset("cab", "model"), 1);
  // every position holds exactly one face, whatever is in front
  for (const cur of KNOB_ORDER) assert.deepEqual(KNOB_ORDER.map((f) => knobOffset(f, cur)).sort(), [-1, 0, 1]);
});

test("the header names the selection first, else the tool in hand, else the project", () => {
  assert.deepEqual(pickTitle({ selName: "Sofa", selCode: "F8", selSub: "2000 × 900 mm", toolName: "Wall", project: "Home" }),
    { kind: "sel", main: "Sofa", code: "F8", sub: "2000 × 900 mm" });
  assert.deepEqual(pickTitle({ toolName: "Wall", toolSub: "2.40 m", project: "Home" }), { kind: "tool", main: "Wall", code: "", sub: "2.40 m" });
  assert.deepEqual(pickTitle({ project: "Home", place: "Ground floor" }), { kind: "project", main: "Home", code: "", sub: "Ground floor" });
  assert.deepEqual(pickTitle(), { kind: "project", main: "", code: "", sub: "" });
});

test("recent tools: most recent first, no repeats, a bounded list", () => {
  assert.deepEqual(pushRecent(["wall", "rect", "door"], "door", 4), ["door", "wall", "rect"]);
  assert.deepEqual(pushRecent(["wall", "rect", "door", "window"], "arcwall", 4), ["arcwall", "wall", "rect", "door"]);
  assert.deepEqual(pushRecent(null, "wall"), ["wall"]);
  assert.deepEqual(pushRecent(["wall"], "", 4), ["wall"]);
});

test("the compact chrome never names the editor in the header twice, and keeps undo off the toolbar", () => {
  const css = readFileSync(new URL("../css/pro_compact.css", import.meta.url), "utf8");
  // the switcher strip and the old pinned undo/redo pair are gone from the compact layout
  assert.match(css, /body\.pro-compact :is\(#m-editor-strip, \.ps-ed-strip, \.ps-ed-icons, \.ps-grid\) \{ display: none !important; \}/);
  assert.match(css, /body\.pro-compact \.ps-dock :is\(\.mctx-undo, \.cbm-undo\) \{ display: none !important; \}/);
  // Split needs a fold: a phone never shows it
  assert.match(css, /body\.pro-compact:not\(\.dock-rail\) :is\(\.ps-view \[data-view="split"\], \.cb-vmodes \[data-mode="split"\], #mdModeSplit\) \{ display: none !important; \}/);
});

/* Pure arithmetic tests for selection depth and sticky focus. */
import test from "node:test";
import assert from "node:assert/strict";
import { candidateAt, drillTarget, ascend, withinFocus } from "../editor/depth.js";

const root = { id: "root", type: "dock", children: ["topbar", "sidebar"] };
const topbar = { id: "topbar", type: "bar", children: ["groupA", "groupB"] };
const groupA = { id: "groupA", type: "group", children: ["btn1", "btn2"] };
const btn1 = { id: "btn1", type: "item" };
const btn2 = { id: "btn2", type: "item" };
const chain = ["root", "topbar", "groupA", "btn1"];

test("withinFocus identifies whether a hit lives inside the current focus container", () => {
  assert.equal(withinFocus(chain, "topbar"), true);
  assert.equal(withinFocus(chain, "groupA"), true);
  assert.equal(withinFocus(chain, "sidebar"), false);
  assert.equal(withinFocus(chain, null), true, "null focus means root level, contains all");
});

test("candidateAt resolves the selectable direct child of focus along the hit chain", () => {
  // At root focus: direct child below root is topbar
  assert.equal(candidateAt(chain, "root"), "topbar");
  assert.equal(candidateAt(chain, null), "topbar");

  // At topbar focus: direct child is groupA
  assert.equal(candidateAt(chain, "topbar"), "groupA");

  // At groupA focus: direct child is btn1
  assert.equal(candidateAt(chain, "groupA"), "btn1");

  // When hit IS focus: candidate is the node itself
  assert.equal(candidateAt(chain, "btn1"), "btn1");

  // When focus is not in chain: resets to root-level candidate
  assert.equal(candidateAt(chain, "otherContainer"), "topbar");
});

test("drillTarget identifies enterable containers and rejects leaves", () => {
  assert.equal(drillTarget(groupA), "groupA");
  assert.equal(drillTarget(topbar), "topbar");
  assert.equal(drillTarget(btn1), null, "leaf item cannot be entered");
  assert.equal(drillTarget({ id: "empty", type: "group", children: [] }), "empty", "empty container can be entered to drop items into");
  assert.equal(drillTarget({ id: "sep", type: "separator" }), null);
});

test("ascend returns the parent container and stops at root", () => {
  const parents = {
    btn1: "groupA",
    groupA: "topbar",
    topbar: "root",
    root: null,
  };
  const parentOf = (id) => parents[id];

  assert.equal(ascend("btn1", parentOf, "root"), "groupA");
  assert.equal(ascend("groupA", parentOf, "root"), "topbar");
  assert.equal(ascend("topbar", parentOf, "root"), "root");
  assert.equal(ascend("root", parentOf, "root"), null, "cannot ascend past root");
  assert.equal(ascend(null, parentOf, "root"), null);
});

test("focus invariant: focus is always an ancestor of selection", () => {
  const chains = {
    btn1: ["root", "topbar", "groupA", "btn1"],
    btn2: ["root", "topbar", "groupA", "btn2"],
  };
  const focus = "groupA";
  const selection = ["btn1", "btn2"];

  for (const selId of selection) {
    assert.ok(chains[selId].includes(focus), `${focus} must be in ancestor chain of ${selId}`);
  }
});

/* Which edges a node offers, and what a pull on one of them means. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_HANDLES, handleAt, handleRects, handlesFor, primaryAxis, rectFrom, resizeAxis, sizeFrom,
} from "../editor/resize.js";
import { groupProblem, nextGroupId, ungroupProblem } from "../editor/group.js";
import { normalizeDoc } from "../model/validate.js";

const stack = { type: "stack", orient: "col" };
const bar = { type: "bar", orient: "row" };

test("nothing is pinned to one axis unless the host asked for it", () => {
  // the sizing rules in uikit.css honour both edges, so both are offered
  assert.equal(resizeAxis(stack, null), "both");
  assert.equal(resizeAxis(bar, null), "both");
  assert.equal(resizeAxis({ type: "item" }, bar), "both");
});

test("the natural axis survives as a hint, without being a restriction", () => {
  // you widen a sidebar and you heighten a toolbar
  assert.equal(primaryAxis(stack, null), "x");
  assert.equal(primaryAxis(bar, null), "y");
  // a panel stacked in a sidebar stretches down; a button in a toolbar across
  assert.equal(primaryAxis({ type: "item" }, stack), "y");
  assert.equal(primaryAxis({ type: "item" }, bar), "x");
  assert.equal(primaryAxis({ type: "item", constraints: { resize: "x" } }, stack), "x",
    "a declared axis is still the answer");
});

test("the host's own declaration wins over the free default", () => {
  assert.equal(resizeAxis({ type: "item", constraints: { resize: "none" } }, stack), "none");
  assert.equal(resizeAxis({ type: "stack", constraints: { resize: "x" } }, null), "x");
  assert.equal(resizeAxis({ type: "item", entry: { constraints: { resize: "y" } } }, bar), "y",
    "a command's constraints live in the registry entry, not in the layout");
  assert.deepEqual(handlesFor({ type: "item", constraints: { resize: "none" } }, bar), [],
    "no axis means no handles, not handles that do nothing");
});

test("every edge and corner is offered by default", () => {
  assert.deepEqual(handlesFor(stack, null), ALL_HANDLES.slice());
  assert.deepEqual(handlesFor(bar, null), ALL_HANDLES.slice());
  assert.deepEqual(handlesFor({ type: "float" }, null), ALL_HANDLES.slice(), "a float is free on both");
  assert.deepEqual(handlesFor({ type: "stack", constraints: { resize: "x" } }, null), ["w", "e"],
    "a pinned axis still shows only its own two");
});

const rect = { x: 100, y: 100, w: 200, h: 80 };

test("handles straddle the edge they resize", () => {
  const rects = handleRects(rect, 10);
  assert.deepEqual(rects.e, { x: 295, y: 135, w: 10, h: 10 }, "centred on the right edge");
  assert.deepEqual(rects.nw, { x: 95, y: 95, w: 10, h: 10 });
  assert.equal(rects.s.y, 175, "half in, half out of the bottom edge");
});

test("a pull grows the box away from the handle, whichever side it is on", () => {
  assert.deepEqual(sizeFrom(rect, "e", 40, 0), { w: 240 });
  assert.deepEqual(sizeFrom(rect, "w", -40, 0), { w: 240 }, "dragging left widens from the left edge");
  assert.deepEqual(sizeFrom(rect, "s", 0, 20), { h: 100 });
  assert.deepEqual(sizeFrom(rect, "n", 0, -20), { h: 100 });
  assert.deepEqual(sizeFrom(rect, "se", 40, 20), { w: 240, h: 100 }, "a corner moves both");
});

test("Shift keeps the proportions, on an edge as well as a corner", () => {
  assert.deepEqual(sizeFrom(rect, "se", 40, 0, null, { aspect: true }), { w: 240, h: 96 },
    "the further-moved axis leads and the other follows the 200:80 ratio");
  assert.deepEqual(sizeFrom(rect, "e", 40, 0, null, { aspect: true }), { w: 240, h: 96 },
    "an edge drag picks up the second dimension it does not normally touch");
});

test("Alt frees the axis an edge handle does not own", () => {
  assert.deepEqual(sizeFrom(rect, "e", 40, 20, null, { free: true }), { w: 240, h: 100 });
});

test("a free node keeps the edge you are not holding still", () => {
  assert.deepEqual(rectFrom({ x: 100, y: 100, w: 200, h: 80 }, "nw", { w: 240, h: 100 }),
    { x: 60, y: 80, w: 240, h: 100 }, "pulling north-west moves the box as it grows");
  assert.deepEqual(rectFrom({ x: 100, y: 100, w: 200, h: 80 }, "se", { w: 240 }),
    { x: 100, y: 100, w: 240, h: 80 }, "pulling south-east moves nothing");
});

test("only the axes the handle touches are written", () => {
  assert.equal("h" in sizeFrom(rect, "e", 40, 99), false,
    "a horizontal drag must not pin a height the user never set");
  assert.equal("w" in sizeFrom(rect, "n", 99, 10), false);
  assert.equal(sizeFrom(rect, "nope", 5, 5), null);
});

test("constraints clamp the result, so a panel cannot be crushed", () => {
  assert.deepEqual(sizeFrom(rect, "w", 500, 0, { minW: 180 }), { w: 180 });
  assert.deepEqual(sizeFrom(rect, "e", 5000, 0, { maxW: 600 }), { w: 600 });
  assert.deepEqual(sizeFrom(rect, "s", 0, -5000, { minH: 60 }), { h: 60 });
});

test("a point hits the handle it is drawn over, and nothing when there are none", () => {
  assert.equal(handleAt({ x: 300, y: 140 }, rect, ["w", "e"], 10), "e");
  assert.equal(handleAt({ x: 100, y: 140 }, rect, ["w", "e"], 10), "w");
  assert.equal(handleAt({ x: 200, y: 140 }, rect, ["w", "e"], 10), null, "the middle is not a handle");
  assert.equal(handleAt({ x: 300, y: 140 }, rect, [], 10), null);
});

/* ---- grouping ----------------------------------------------------------- */

function doc() {
  return normalizeDoc({
    v: 1,
    variants: { base: { root: "n:app", patch: {} } },
    nodes: {
      "n:app": { type: "dock", children: ["n:top", "n:left"] },
      "n:top": { type: "bar", slot: "top", children: ["a", "b", "c"] },
      "n:left": { type: "stack", children: ["d"] },
      a: { type: "item", ref: "a" }, b: { type: "item", ref: "b" },
      c: { type: "item", ref: "c" }, d: { type: "item", ref: "d" },
    },
    overrides: { text: {}, tokens: {} },
  }).doc;
}

const PARENT = { a: "n:top", b: "n:top", c: "n:top", d: "n:left", "n:top": "n:app", "n:left": "n:app" };
const parentOf = (id) => PARENT[id] || null;

test("a group needs two or more things that already live together", () => {
  const d = doc();
  assert.equal(groupProblem(d, ["a", "b"], parentOf), null);
  assert.equal(groupProblem(d, ["a"], parentOf), "pick-two");
  assert.equal(groupProblem(d, ["a", "d"], parentOf), "same-parent-only");
  assert.equal(groupProblem(d, ["a", "n:app"], parentOf), "not-the-root");
});

test("a bound container is the host's own region, not a group to take apart", () => {
  const d = doc();
  assert.equal(ungroupProblem(d, "n:top"), "not-a-group",
    "dissolving #topbar would splice a toolbar into the app shell");
  assert.equal(ungroupProblem(d, "n:app"), "not-the-root");
  assert.equal(ungroupProblem(d, "a"), "not-a-group", "a leaf is not a group");
  assert.equal(ungroupProblem(d, "n:left"), null, "an unbound container is");
});

test("group ids are minted, never derived from the contents", () => {
  const d = doc();
  assert.equal(nextGroupId(d), "g:user1");
  d.nodes["g:user1"] = { type: "group", children: [] };
  assert.equal(nextGroupId(d), "g:user2",
    "a second group of the same two nodes must not collide with the first");
});

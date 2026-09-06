/* The two decisions customize mode makes that are pure arithmetic: what a key
   means, and where a drop lands. Both are the sort of thing that is
   excruciating to test through a browser and trivial to test as functions. */
import test from "node:test";
import assert from "node:assert/strict";
import { commandForKey, swallows } from "../editor/a11y.js";
import { axisOf, dropIndicator, insertionIndex, passedThreshold, DRAG_THRESHOLD } from "../editor/drag.js";

const key = (k, mods) => Object.assign({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, mods);

test("every gesture has a key, and the two arrow gestures stay distinct", () => {
  assert.deepEqual(commandForKey(key("Tab")), { name: "selectNext", dir: 1 });
  assert.deepEqual(commandForKey(key("Tab", { shiftKey: true })), { name: "selectNext", dir: -1 });

  assert.deepEqual(commandForKey(key("ArrowRight")), { name: "reorder", dir: 1 });
  assert.deepEqual(commandForKey(key("ArrowUp")), { name: "reorder", dir: -1 });
  assert.deepEqual(commandForKey(key("ArrowRight", { altKey: true })), { name: "moveOut", dir: 1 });
  assert.deepEqual(commandForKey(key("ArrowLeft", { altKey: true })), { name: "moveOut", dir: -1 });

  assert.deepEqual(commandForKey(key("Delete")), { name: "hide" });
  assert.deepEqual(commandForKey(key("Backspace")), { name: "hide" });
  assert.deepEqual(commandForKey(key("Escape")), { name: "exit" });
});

test("undo takes the platform's own accelerator, not a guess at the platform", () => {
  assert.deepEqual(commandForKey(key("z", { ctrlKey: true })), { name: "undo" });
  assert.deepEqual(commandForKey(key("z", { metaKey: true })), { name: "undo" });
  assert.deepEqual(commandForKey(key("Z", { metaKey: true, shiftKey: true })), { name: "redo" });
  assert.equal(commandForKey(key("z")), null, "unmodified z is not a command");
});

test("keys with no command are still swallowed, so they cannot reach the app", () => {
  // arrows would scroll the page and Tab would move focus out of the layout
  for (const k of ["Tab", "Escape", "ArrowUp", "ArrowDown", "Delete", "Backspace"]) {
    assert.ok(swallows(key(k)), k + " must not reach the host");
  }
  assert.ok(swallows(key("z", { ctrlKey: true })));
  assert.equal(swallows(key("a")), false, "ordinary typing is not the editor's business");
  assert.equal(commandForKey(null), null);
});

const row = [
  { x: 0, y: 0, w: 100, h: 30 },
  { x: 100, y: 0, w: 100, h: 30 },
  { x: 200, y: 0, w: 100, h: 30 },
];

test("a drop lands between children, by midpoint, so the gap is a real target", () => {
  assert.equal(insertionIndex(row, { x: 10, y: 15 }, "row"), 0, "before the first midpoint");
  assert.equal(insertionIndex(row, { x: 60, y: 15 }, "row"), 1, "past the first midpoint");
  assert.equal(insertionIndex(row, { x: 160, y: 15 }, "row"), 2);
  assert.equal(insertionIndex(row, { x: 999, y: 15 }, "row"), 3, "the far end means last, not nothing");
  assert.equal(insertionIndex([], { x: 5, y: 5 }, "row"), 0, "an empty container takes index 0");
});

/* The midpoint itself, which the tests above step over on both sides without
   ever landing on. It is one pixel wide and it is the only place the `>=` in
   insertionIndex differs from a `>`, so it is exactly where an off-by-one
   would live and nowhere else it could be seen. Counting the midpoint as PAST
   is what makes a drop aimed at the seam between two children land after the
   first rather than freezing on the boundary. */
test("a pointer exactly on a midpoint has passed it", () => {
  assert.equal(insertionIndex(row, { x: 50, y: 15 }, "row"), 1, "on the first midpoint, not before it");
  assert.equal(insertionIndex(row, { x: 150, y: 15 }, "row"), 2, "and on the second");
  assert.equal(insertionIndex(row, { x: 49, y: 15 }, "row"), 0, "one pixel short is still before");

  // The same rule read backwards, for a row whose visual order is reversed.
  const rtl = [
    { x: 200, y: 0, w: 100, h: 30 },
    { x: 100, y: 0, w: 100, h: 30 },
    { x: 0, y: 0, w: 100, h: 30 },
  ];
  assert.equal(insertionIndex(rtl, { x: 250, y: 15 }, "row"), 1, "on a midpoint, descending");
  assert.equal(insertionIndex(rtl, { x: 251, y: 15 }, "row"), 0, "one pixel short, descending");
});

test("a column is measured on the other axis", () => {
  const col = [
    { x: 0, y: 0, w: 200, h: 50 },
    { x: 0, y: 50, w: 200, h: 50 },
  ];
  assert.equal(insertionIndex(col, { x: 100, y: 10 }, "col"), 0);
  assert.equal(insertionIndex(col, { x: 100, y: 40 }, "col"), 1);
  assert.equal(insertionIndex(col, { x: 100, y: 90 }, "col"), 2);
});

test("visual order reversed from document order still gives a document index", () => {
  // what an RTL row looks like: child 0 is rightmost
  const rtl = [
    { x: 200, y: 0, w: 100, h: 30 },
    { x: 100, y: 0, w: 100, h: 30 },
    { x: 0, y: 0, w: 100, h: 30 },
  ];
  assert.equal(insertionIndex(rtl, { x: 290, y: 15 }, "row"), 0, "the right-hand end is the start");
  assert.equal(insertionIndex(rtl, { x: 10, y: 15 }, "row"), 3, "and the left-hand end is the end");
});

test("axis is taken from the node when it says, and from the boxes when it does not", () => {
  assert.equal(axisOf({ orient: "col" }, row), "col", "a stated orientation wins over the geometry");
  assert.equal(axisOf({ flow: "row" }, []), "row");
  assert.equal(axisOf(null, row), "row", "three boxes spread across x");
  assert.equal(axisOf(null, [{ x: 0, y: 0, w: 9, h: 9 }, { x: 0, y: 90, w: 9, h: 9 }]), "col");
  assert.equal(axisOf(null, []), "row", "nothing to infer from");
  assert.equal(axisOf({ entry: { kind: "menu" }, orient: "row" }, row), "col",
    "a menu is a column even though groups default to a row");
});

test("the drop indicator is a line at the seam, spanning the container", () => {
  const container = { x: 0, y: 0, w: 300, h: 30 };
  const first = dropIndicator(container, row, 0, "row");
  assert.equal(first.x, -1, "against the leading edge");
  assert.equal(first.h, 30, "and the full height of the bar");

  const last = dropIndicator(container, row, 3, "row");
  assert.equal(last.x, 299, "after the trailing edge of the last child");

  const empty = dropIndicator(container, [], 0, "row");
  assert.deepEqual(empty, { x: 0, y: 0, w: 2, h: 30 });
});

test("a press is a selection until it has travelled far enough to be a drag", () => {
  const from = { x: 100, y: 100 };
  assert.equal(passedThreshold(from, { x: 100 + DRAG_THRESHOLD, y: 100 }), false);
  assert.ok(passedThreshold(from, { x: 100 + DRAG_THRESHOLD + 1, y: 100 }));
  assert.ok(passedThreshold(from, { x: 100, y: 100 - DRAG_THRESHOLD - 1 }), "either direction");
});

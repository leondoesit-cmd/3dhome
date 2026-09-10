/* Pure arithmetic tests for drag geometry, tree zones, and placeholders. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  distanceToRect,
  dropPlaceholder,
  nearestContainer,
  SNAP_REACH,
  treeZone,
  treeDropTarget,
  passedThreshold,
  DRAG_THRESHOLD,
  TOUCH_DRAG_THRESHOLD,
} from "../editor/drag.js";
import { ghostRect, previewScale } from "../editor/ghost.js";

test("passedThreshold respects mouse and touch thresholds", () => {
  const from = { x: 10, y: 10 };
  assert.equal(passedThreshold(from, { x: 13, y: 10 }, DRAG_THRESHOLD), false);
  assert.equal(passedThreshold(from, { x: 15, y: 10 }, DRAG_THRESHOLD), true);

  // Touch threshold is 10px
  assert.equal(passedThreshold(from, { x: 18, y: 10 }, TOUCH_DRAG_THRESHOLD), false);
  assert.equal(passedThreshold(from, { x: 21, y: 10 }, TOUCH_DRAG_THRESHOLD), true);
});

test("treeZone identifies before, inside, and after boundaries", () => {
  const containerRect = { x: 0, y: 100, w: 200, h: 40 };

  // For a container: top 35% is before (< 114)
  assert.equal(treeZone(containerRect, { x: 10, y: 105 }, true), "before");
  // Middle 30% is inside (114 to 126)
  assert.equal(treeZone(containerRect, { x: 10, y: 120 }, true), "inside");
  // Bottom 35% is after (> 126)
  assert.equal(treeZone(containerRect, { x: 10, y: 135 }, true), "after");

  // For a leaf: upper half is before, lower half is after
  const leafRect = { x: 0, y: 100, w: 200, h: 40 };
  assert.equal(treeZone(leafRect, { x: 10, y: 110 }, false), "before");
  assert.equal(treeZone(leafRect, { x: 10, y: 130 }, false), "after");
});

test("dropPlaceholder calculates box position for row and col axes", () => {
  const container = { x: 50, y: 100, w: 300, h: 60 };
  const rects = [
    { x: 50, y: 100, w: 80, h: 50 },
    { x: 140, y: 100, w: 80, h: 50 },
  ];

  // In row axis: empty container
  const emptyBox = dropPlaceholder(container, [], 0, "row", { w: 40, h: 40 });
  assert.equal(emptyBox.x, 52);
  assert.equal(emptyBox.w, 40);

  // At index 1: before child 1 (which starts at x: 140)
  const boxMid = dropPlaceholder(container, rects, 1, "row", { w: 40, h: 40 });
  assert.equal(boxMid.x, 140);

  // At index 2: after last child
  const boxEnd = dropPlaceholder(container, rects, 2, "row", { w: 40, h: 40 });
  assert.equal(boxEnd.x, 220);
});

test("treeDropTarget calculates target and respects acceptsFn", () => {
  const rows = [
    { id: "groupA", rect: { x: 0, y: 0, w: 200, h: 30 }, isContainer: true, parentId: "root", index: 0, childrenCount: 2 },
    { id: "item1", rect: { x: 0, y: 30, w: 200, h: 30 }, isContainer: false, parentId: "groupA", index: 0 },
    { id: "item2", rect: { x: 0, y: 60, w: 200, h: 30 }, isContainer: false, parentId: "groupA", index: 1 },
  ];

  // Dragging item2 over groupA middle -> inside groupA
  const res1 = treeDropTarget(rows, { x: 10, y: 15 }, "item2", () => true);
  assert.equal(res1.valid, true);
  assert.equal(res1.parentId, "groupA");
  assert.equal(res1.index, 2);
  assert.equal(res1.zone, "inside");

  // Dragging item2 over item1 upper half -> before item1 (index 0 in groupA)
  const res2 = treeDropTarget(rows, { x: 10, y: 35 }, "item2", () => true);
  assert.equal(res2.valid, true);
  assert.equal(res2.parentId, "groupA");
  assert.equal(res2.index, 0);

  // Refusal when acceptsFn returns false
  const res3 = treeDropTarget(rows, { x: 10, y: 15 }, "item2", () => false);
  assert.equal(res3.valid, false);
  assert.equal(res3.reason, "incompatible");
});

test("treeDropTarget index is post-removal, so a downward sibling drop lands where the seam says", () => {
  const rows = [
    { id: "A", rect: { x: 0, y: 0, w: 200, h: 40 }, isContainer: true, parentId: "root", index: 0, childrenCount: 0 },
    { id: "B", rect: { x: 0, y: 40, w: 200, h: 40 }, isContainer: true, parentId: "root", index: 1, childrenCount: 0 },
    { id: "C", rect: { x: 0, y: 80, w: 200, h: 40 }, isContainer: true, parentId: "root", index: 2, childrenCount: 0 },
  ];

  // After B (lower half) — the seam under B — is index 1 once A has left.
  const afterB = treeDropTarget(rows, { x: 10, y: 70 }, "A", () => true);
  assert.equal(afterB.zone, "after");
  assert.equal(afterB.parentId, "root");
  assert.equal(afterB.index, 1, "A after B is slot 1 in [B, A, C], not 2");

  // Before B (upper half) is "leave A where it is": post-removal index 0.
  const beforeB = treeDropTarget(rows, { x: 10, y: 45 }, "A", () => true);
  assert.equal(beforeB.zone, "before");
  assert.equal(beforeB.index, 0, "dropping on B's top half does not swap A past B");

  // Upward: C before B stays 1, no subtraction because C sat after B.
  const beforeBFromC = treeDropTarget(rows, { x: 10, y: 45 }, "C", () => true);
  assert.equal(beforeBFromC.index, 1);
});

test("treeDropTarget refuses a drop into the dragged node's own subtree", () => {
  const rows = [
    { id: "outer", rect: { x: 0, y: 0, w: 200, h: 30 }, isContainer: true, parentId: "root", index: 0, childrenCount: 1 },
    { id: "inner", rect: { x: 0, y: 30, w: 200, h: 30 }, isContainer: true, parentId: "outer", index: 0, childrenCount: 0 },
  ];
  const intoChild = treeDropTarget(rows, { x: 10, y: 45 }, "outer", () => true);
  assert.equal(intoChild.valid, false, "type policy would allow group-into-group; ancestry must not");
  assert.equal(intoChild.zone, "inside");
});


/* ---- reaching for a target the pointer missed ---------------------------- */

const BAR = { id: "bar", rect: { x: 0, y: 0, w: 400, h: 40 } };
const GROUP = { id: "group", rect: { x: 100, y: 4, w: 90, h: 32 } };
const SIDE = { id: "side", rect: { x: 0, y: 60, w: 200, h: 500 } };

test("distance is measured to the box, not to its centre", () => {
  assert.equal(distanceToRect({ x: 200, y: 20 }, BAR.rect), 0, "inside is zero from anywhere in it");
  assert.equal(distanceToRect({ x: 200, y: 50 }, BAR.rect), 10);
  assert.equal(distanceToRect({ x: 10, y: 20 }, SIDE.rect), 40,
    "a tall panel is not further away because it is tall");
});

test("a drop in the gutter lands in the nearest thing that would take it", () => {
  const near = nearestContainer([BAR, GROUP, SIDE], { x: 200, y: 50 });
  assert.equal(near.id, "bar", "10px below the toolbar still means the toolbar");
  assert.equal(near.distance, 10);
});

test("a tie goes to the innermost box", () => {
  // the pointer sits inside both the bar and the group nested in it
  const near = nearestContainer([BAR, GROUP], { x: 140, y: 20 });
  assert.equal(near.id, "group", "the smaller of two equally-close boxes wins");
});

test("reach is finite, so a drag over empty canvas is honestly homeless", () => {
  assert.equal(nearestContainer([BAR], { x: 200, y: 40 + SNAP_REACH + 5 }), null);
  assert.equal(nearestContainer([], { x: 0, y: 0 }), null);
});

/* ---- the preview under the cursor ---------------------------------------- */

test("the preview keeps the grip the pointer took, it does not centre itself", () => {
  const rect = { x: 100, y: 100, w: 200, h: 40 };
  const grab = { dx: 180, dy: 20 };            // grabbed near the right-hand edge
  const at = ghostRect({ x: 500, y: 300 }, grab, rect, 1);
  assert.deepEqual(at, { x: 320, y: 280, w: 200, h: 40 });
  assert.equal(at.x + grab.dx, 500, "the grabbed pixel is still under the pointer");
  assert.equal(at.y + grab.dy, 300);
});

test("a scaled preview keeps the same proportional grip", () => {
  const rect = { x: 0, y: 0, w: 800, h: 600 };
  const scale = previewScale(rect);
  assert.ok(scale < 1, "a sidebar-sized node is shrunk to stay out of its own way");
  const at = ghostRect({ x: 500, y: 400 }, { dx: 400, dy: 300 }, rect, scale);
  assert.equal(at.x + Math.round(400 * scale), 500);
  assert.equal(at.y + Math.round(300 * scale), 400);
});

test("something already small enough is shown at its own size", () => {
  assert.equal(previewScale({ x: 0, y: 0, w: 120, h: 32 }), 1);
});

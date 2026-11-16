// Clickable distance pills (js/distance_pills.js): the registry a paint fills,
// hit testing (the pill on top wins, touch padding to 44 px, nearest centre
// when only padded boxes are under the finger) and Tab order within a piece.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOUCH_MIN, addPill, beginPills, hitPill, nextPill, onPillsBegin, padBox, piecePills, pillsOf, takeBegan,
} from "../js/distance_pills.js";

const pill = (x, y, w, h, itemId, tag) => ({ x, y, w, h, itemId, src: { tag } });

test("a point in a pill hits it; the one drawn last wins where pills overlap", () => {
  const a = pill(100, 100, 40, 20, "p", "a"), b = pill(120, 100, 40, 20, "p", "b");
  const list = [a, b];
  assert.equal(hitPill(list, 90, 100), a);
  assert.equal(hitPill(list, 115, 100), b);
  assert.equal(hitPill(list, 135, 100), b);
  assert.equal(hitPill(list, 100, 125), null);
  // the 2 px rim counts with a mouse
  assert.equal(hitPill(list, 79, 100), a);
  assert.equal(hitPill(list, 76, 100), null);
});

test("touch pads a small pill to 44 px; between two padded pills the nearer centre wins", () => {
  const a = pill(100, 100, 30, 18, "p", "a"), b = pill(150, 100, 30, 18, "p", "b");
  const box = padBox(a, true);
  assert.equal(box.x1 - box.x0, TOUCH_MIN);
  assert.equal(box.y1 - box.y0, TOUCH_MIN);
  assert.equal(hitPill([a, b], 100, 120), null, "a mouse needs the pill itself");
  assert.equal(hitPill([a, b], 100, 120, { touch: true }), a);
  assert.equal(hitPill([a, b], 121, 100, { touch: true }), a);
  assert.equal(hitPill([a, b], 128, 100, { touch: true }), b);
  // a finger really on a pill takes it, even when another padded centre is nearer
  const big = pill(200, 100, 100, 20, "p", "big"), small = pill(245, 118, 20, 10, "p", "small");
  assert.equal(hitPill([small, big], 240, 108, { touch: true }), big);
});

test("a paint starts empty and announces itself; bad boxes are not registered", () => {
  const seen = [];
  onPillsBegin((v) => seen.push(v));
  addPill("3d", pill(1, 1, 10, 10, "p"));
  beginPills("3d");
  assert.deepEqual(seen, ["3d"]);
  assert.equal(pillsOf("3d").length, 0);
  assert.equal(addPill("3d", pill(NaN, 1, 10, 10, "p")), null);
  assert.equal(addPill("3d", pill(1, 1, 0, 10, "p")), null);
  assert.ok(addPill("3d", pill(1, 1, 10, 10, "p")));
  assert.equal(pillsOf("3d").length, 1);
  assert.equal(takeBegan("3d"), true);
  assert.equal(takeBegan("3d"), false);
});

test("Tab walks the piece's own pills, one per box, and wraps", () => {
  const up = pill(50, 50, 30, 20, "p", "up"), down = pill(50, 50, 30, 20, "p", "down");
  const list = [pill(10, 10, 30, 20, "p", "w"), pill(10, 90, 30, 20, "q", "other"), down, up, pill(90, 10, 30, 20, "p", "e")];
  assert.deepEqual(piecePills(list, "p").map((p) => p.src.tag), ["w", "down", "e"]);
  assert.equal(nextPill(list, list[0], 1).src.tag, "down");
  assert.equal(nextPill(list, up, 1).src.tag, "e");
  assert.equal(nextPill(list, list[4], 1).src.tag, "w");
  assert.equal(nextPill(list, list[0], -1).src.tag, "e");
});

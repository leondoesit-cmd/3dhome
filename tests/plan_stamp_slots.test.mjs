/* Room stamps step out from under MEP device badges with services as the
   work set (js/plan2d/stamp_slots.js, used by drawRoomLabels). */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { insidePoly, mepStampObstacles, stampSlot, STAMP_OFFSETS } from "../js/plan2d/stamp_slots.js";

const square = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
// a stamp: name pill over the area pill, centred on (200, 200)
const stamp = [{ x: 200, y: 188, w: 80, h: 22 }, { x: 200, y: 212, w: 150, h: 20 }];
const overlaps = (b, o) => Math.abs(b.x - o.x) < (b.w + o.w) / 2 + 2 && Math.abs(b.y - o.y) < (b.h + o.h) / 2 + 2;

test("offsets are ordered nearest first and start at the stamp's own spot", () => {
  assert.deepEqual(STAMP_OFFSETS[0], [0, 0]);
  for (let i = 2; i < STAMP_OFFSETS.length; i++)
    assert.ok(Math.hypot(...STAMP_OFFSETS[i]) >= Math.hypot(...STAMP_OFFSETS[i - 1]) - 1.5);
});

test("an uncovered stamp stays where it is", () => {
  assert.deepEqual(stampSlot(stamp, [], square(0, 0, 400, 400)), [0, 0]);
  assert.deepEqual(stampSlot(stamp, [{ x: 360, y: 360, w: 24, h: 24 }], square(0, 0, 400, 400)), [0, 0]);
});

test("a badge on the stamp moves it to the nearest free slot inside the room", () => {
  const badge = { x: 205, y: 200, w: 24, h: 24 };
  const off = stampSlot(stamp, [badge], square(0, 0, 400, 400));
  assert.ok(off && (off[0] || off[1]));
  for (const b of stamp) {
    const moved = { ...b, x: b.x + off[0], y: b.y + off[1] };
    assert.ok(!overlaps(moved, badge), "the badge reads");
    assert.ok(insidePoly(moved.x - moved.w / 2, moved.y, square(0, 0, 400, 400)));
  }
  assert.ok(Math.hypot(...off) <= 48, "nearest, not far away: " + off);
});

test("no free slot inside the room: keep the spot (null = draw it faint)", () => {
  const room = square(120, 170, 280, 230); // just the stamp's own footprint
  assert.equal(stampSlot(stamp, [{ x: 200, y: 200, w: 24, h: 24 }], room), null);
});

test("only the services work set turns badges into obstacles", () => {
  const keep = S.workSet;
  S.workSet = "furniture";
  assert.equal(mepStampObstacles(), null);
  S.workSet = "structure";
  assert.equal(mepStampObstacles(), null);
  S.workSet = keep;
});

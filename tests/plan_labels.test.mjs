import test from "node:test";
import assert from "node:assert/strict";
import { roomLabelLines, roomLabelFont } from "../js/plan_labels.js";
import { formatLength } from "../js/planning_units.js";

const ft = (cm) => formatLength(cm, "ft", {});
const IN = 2.54;

test("room label: capital name and feet-inches size, like a marketing plan", () => {
  const l = roomLabelLines({
    name: "Lounge",
    meas: { interior: { width: (21 * 12 + 6) * IN, depth: 16 * 12 * IN } },
    fmt: ft,
  });
  assert.equal(l.title, "LOUNGE");
  assert.equal(l.size, `21'-6" X 16'-0"`);
});

test("room label: metric puts the unit on the last number only", () => {
  const l = roomLabelLines({
    name: "Kitchen",
    meas: { interior: { width: 390, depth: 490 } },
    fmt: (cm) => formatLength(cm, "cm", { suffix: false }),
    fmtLast: (cm) => formatLength(cm, "cm", {}),
  });
  assert.equal(l.size, "390 X 490 cm");
});

test("room label: Hebrew names pass through, non-rectangles use the bounding box", () => {
  const l = roomLabelLines({ name: "סלון", meas: { interior: null, referenceWidth: 500, referenceDepth: 300 }, fmt: String });
  assert.equal(l.title, "סלון");
  assert.equal(l.size, "500 X 300");
  assert.equal(roomLabelLines({ name: "", meas: null }).size, "");
});

test("room label font follows zoom within legible bounds", () => {
  assert.equal(roomLabelFont(0.01, true), 11);
  assert.equal(roomLabelFont(10, true), 20);
  assert.ok(roomLabelFont(0.6, false) >= 9 && roomLabelFont(0.6, false) <= 14);
});

import test from "node:test";
import assert from "node:assert/strict";
import { siteLayout, PAVE_CM, HEDGE } from "../js/site_dressing.js";

const bb = { minx: 0, maxx: 1000, minz: 0, maxz: 800 };

test("paving hugs the house and the lawn surrounds it", () => {
  const s = siteLayout(bb, []);
  assert.deepEqual(s.paving, { x0: -PAVE_CM, x1: 1000 + PAVE_CM, z0: -PAVE_CM, z1: 800 + PAVE_CM });
  assert.ok(s.lawn.x0 < s.paving.x0 && s.lawn.z1 > s.paving.z1);
  assert.equal(s.hedges.length, 4); // one closed run per side
});

test("an outside door opens a gap in the hedge it faces; inside doors do not", () => {
  const s = siteLayout(bb, [{ x: 500, z: 800 }, { x: 400, z: 400 }]);
  const south = s.hedges.filter((h) => h.z0 > 800 && h.x1 - h.x0 > h.z1 - h.z0);
  assert.equal(south.length, 2);
  const gap = south.sort((a, b) => a.x0 - b.x0);
  assert.ok(gap[0].x1 <= 500 - HEDGE.gap / 2 + 1e-9 && gap[1].x0 >= 500 + HEDGE.gap / 2 - 1e-9);
  // the other three sides stay whole
  assert.equal(s.hedges.length, 5);
});

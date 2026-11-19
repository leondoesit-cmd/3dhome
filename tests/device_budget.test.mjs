import test from "node:test";
import assert from "node:assert/strict";
import { pickBudget, adaptBatch, MID_BAKE_MS, SLOW_BAKE_MS } from "../js/device_budget.js";

test("static tiers: a big desktop is high, a 2-core or software device low, unknown memory mid", () => {
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16 }).tier, "high");
  assert.equal(pickBudget({ deviceMemory: 8, cores: 2 }).tier, "low");
  assert.equal(pickBudget({ software: true, cores: 16 }).tier, "low");
  assert.equal(pickBudget({ cores: 4 }).tier, "mid");
  assert.equal(pickBudget({}).tier, "mid");
  // Safari/Firefox expose no deviceMemory: cores alone may still reach high
  assert.equal(pickBudget({ cores: 10 }).tier, "high");
  assert.equal(pickBudget({ cores: 10, coarse: true }).tier, "mid");
});

test("a measured slow bake means less work ahead, never a different cache size", () => {
  const big = { deviceMemory: 16, cores: 16 };
  // measured on the RTX 5070 Ti desktop: median bake 5.1 ms (first 9), p90 17.7 ms
  assert.equal(pickBudget({ ...big, bakeMs: 5.1 }).tier, "high");
  assert.equal(pickBudget({ ...big, bakeMs: 17.7 }).tier, "high");
  assert.equal(pickBudget({ ...big, bakeMs: MID_BAKE_MS + 1 }).tier, "mid");
  assert.equal(pickBudget({ ...big, bakeMs: SLOW_BAKE_MS + 1 }).tier, "low");
  assert.equal(pickBudget({ ...big, bakeMs: 2 }).bakesPerSlice, 4);
  assert.equal(pickBudget({ ...big, bakeMs: MID_BAKE_MS + 1 }).bakesPerSlice, 3);
  assert.equal(pickBudget({ ...big, bakeMs: SLOW_BAKE_MS + 1 }).bakesPerSlice, 1);
  assert.equal(pickBudget({ ...big, bakeMs: MID_BAKE_MS + 1 }).prebakeNextBucket, false);
  // cache sizes are decided once, from the static signals: pictures already
  // stored are not evicted because a measurement arrived later
  for (const bakeMs of [2, MID_BAKE_MS + 1, SLOW_BAKE_MS + 1]) {
    const b = pickBudget({ ...big, bakeMs });
    assert.equal(b.cacheTier, "high");
    assert.equal(b.spritePixelBudget, pickBudget(big).spritePixelBudget);
    assert.equal(b.spritePersistCap, pickBudget(big).spritePersistCap);
  }
  // a fast bake never promotes a small device
  assert.equal(pickBudget({ deviceMemory: 2, cores: 8, bakeMs: 1 }).tier, "low");
});

test("weak and touch-first devices prewarm only after first use; software never", () => {
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16 }).prewarmOnFirstUse, false);
  assert.equal(pickBudget({ cores: 4 }).prewarmOnFirstUse, false);
  assert.equal(pickBudget({ cores: 8, deviceMemory: 8, coarse: true }).prewarmOnFirstUse, true);
  assert.equal(pickBudget({ cores: 2 }).prewarmOnFirstUse, true);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, bakeMs: SLOW_BAKE_MS + 1 }).prewarmOnFirstUse, true);
  assert.equal(pickBudget({ software: true, cores: 16 }).prewarmSprites, false);
});

test("cache sizes follow the tier and never claim much of a small quota", () => {
  const low = pickBudget({ software: true }), high = pickBudget({ deviceMemory: 16, cores: 16 });
  assert.ok(low.spritePixelBudget < high.spritePixelBudget);
  // measured peak 8.4e6 px (DPR 1) over a zoom sweep: no tier above the old 48e6 ceiling
  assert.ok(high.spritePixelBudget <= 48e6);
  assert.ok(low.spritePersistCap < high.spritePersistCap);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, quotaMB: 300 }).spritePersistCap, 100);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, quotaMB: 1 }).spritePersistCap, 50);
  assert.equal(pickBudget({ software: true }).prewarmSprites, false);
});

test("adaptBatch halves after a long task and recovers on clean slices", () => {
  assert.equal(adaptBatch(4, { longTaskMs: 70 }, 6), 2);
  assert.equal(adaptBatch(1, { longTaskMs: 70 }, 6), 1);
  assert.equal(adaptBatch(2, { longTaskMs: 10 }, 3), 3);
  assert.equal(adaptBatch(3, { longTaskMs: 0 }, 3), 3);
  assert.equal(adaptBatch(6, {}, 4), 4, "never above the budget");
  // one hitch costs a few slices, not the session
  let n = 4;
  n = adaptBatch(n, { longTaskMs: 120 }, 4);
  assert.equal(n, 2);
  for (let i = 0; i < 2; i++) n = adaptBatch(n, { longTaskMs: 30 }, 4);
  assert.equal(n, 4);
});

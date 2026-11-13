import test from "node:test";
import assert from "node:assert/strict";
import { pickBudget, adaptBatch } from "../js/device_budget.js";

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

test("a measured slow bake demotes the tier and shrinks the batch", () => {
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, bakeMs: 25 }).tier, "mid");
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, bakeMs: 60 }).tier, "low");
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, bakeMs: 2 }).bakesPerSlice, 4);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, bakeMs: 25 }).bakesPerSlice, 3);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, bakeMs: 60 }).bakesPerSlice, 1);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, longTaskMs: 80 }).bakesPerSlice, 2);
});

test("cache sizes follow the tier and never claim much of a small quota", () => {
  const low = pickBudget({ software: true }), high = pickBudget({ deviceMemory: 16, cores: 16 });
  assert.ok(low.spritePixelBudget < high.spritePixelBudget);
  assert.ok(low.spritePersistCap < high.spritePersistCap);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, quotaMB: 300 }).spritePersistCap, 100);
  assert.equal(pickBudget({ deviceMemory: 16, cores: 16, quotaMB: 1 }).spritePersistCap, 50);
  assert.equal(pickBudget({ software: true }).prewarmSprites, false);
});

test("adaptBatch halves after a long task and grows in long idle periods", () => {
  assert.equal(adaptBatch(4, { longTaskMs: 70 }, 6), 2);
  assert.equal(adaptBatch(1, { longTaskMs: 70 }, 6), 1);
  assert.equal(adaptBatch(2, { idleLeftMs: 30, ms: 4 }, 3), 3);
  assert.equal(adaptBatch(3, { idleLeftMs: 30, ms: 4 }, 3), 3);
  assert.equal(adaptBatch(3, { idleLeftMs: 5, ms: 12 }, 6), 3);
});

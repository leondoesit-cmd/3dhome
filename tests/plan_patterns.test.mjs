import test from "node:test";
import assert from "node:assert/strict";
import { patternLevel, patternMatrix, tilePixelAt, FLAT_BELOW_PX } from "../js/plan_patterns.js";

test("pattern level: smallest tile that covers the on-screen footprint", () => {
  assert.equal(patternLevel(200, 0.1, 1), 32); // 20 px
  assert.equal(patternLevel(200, 0.25, 2), 128); // 100 px
  assert.equal(patternLevel(200, 1, 1), 256);
  assert.equal(patternLevel(200, 3, 2), 512); // beyond the largest: capped
});

test("pattern level: too small to read becomes a flat fill", () => {
  assert.equal(patternLevel(200, (FLAT_BELOW_PX - 1) / 200, 1), "flat");
  assert.equal(patternLevel(0, 1, 1), "flat");
  assert.equal(patternLevel(200, NaN, 1), "flat");
});

test("pattern matrix: one tile spans its real size in cm", () => {
  const m = patternMatrix(120, 256, 10, 20, 0.5);
  assert.equal(m.a * 256, 60); // 120 cm at 0.5 px/cm
  assert.equal(m.e, 10);
  assert.equal(m.f, 20);
});

test("pattern is anchored to the world: pan and zoom keep a point's texel", () => {
  const a = tilePixelAt(137, 58, { OX: 0, OY: 0, SC: 0.4 }, 200, 128);
  const b = tilePixelAt(137, 58, { OX: 311, OY: -77, SC: 0.4 }, 200, 128);
  const c = tilePixelAt(137, 58, { OX: 311, OY: -77, SC: 1.7 }, 200, 128);
  for (const o of [b, c]) {
    assert.ok(Math.abs(o.u - a.u) < 1e-6 && Math.abs(o.v - a.v) < 1e-6);
  }
  assert.ok(Math.abs(a.u - (137 * 128) / 200) < 1e-6);
});

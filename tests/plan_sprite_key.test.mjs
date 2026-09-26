import test from "node:test";
import assert from "node:assert/strict";
import { spriteKey, spriteBucket, spriteMode, SPRITE_BUCKETS } from "../js/plan_sprite_key.js";

const sofa = { id: 7, type: "sofa", x: 100, z: 50, rot: 90, w: 220, d: 90, h: 85, variant: "grey" };

test("sprite key ignores where the piece stands and which way it faces", () => {
  const k = spriteKey(sofa, 256, 0);
  assert.equal(spriteKey({ ...sofa, x: -40, z: 900, rot: 270, id: 99, name: "x", locked: true }, 256, 0), k);
  // key order in the item never matters
  const shuffled = { h: 85, d: 90, w: 220, type: "sofa", variant: "grey", rot: 0 };
  assert.equal(spriteKey(shuffled, 256, 0), k);
});

test("sprite key changes with anything the builder reads", () => {
  const k = spriteKey(sofa, 256, 0);
  assert.notEqual(spriteKey({ ...sofa, variant: "leather" }, 256, 0), k);
  assert.notEqual(spriteKey({ ...sofa, w: 240 }, 256, 0), k);
  assert.notEqual(spriteKey({ ...sofa, tex: "oak" }, 256, 0), k);
  assert.notEqual(spriteKey({ ...sofa, cab: { doors: 2 } }, 256, 0), k);
  assert.notEqual(spriteKey({ ...sofa, configuration: { stepCount: 12 } }, 256, 0), k);
  assert.notEqual(spriteKey(sofa, 128, 0), k);
  assert.notEqual(spriteKey(sofa, 256, 1), k);
});

test("sprite bucket covers the longest side on screen", () => {
  assert.equal(spriteBucket(10), 64);
  assert.equal(spriteBucket(64), 64);
  assert.equal(spriteBucket(65), 128);
  assert.equal(spriteBucket(300), 512);
  assert.equal(spriteBucket(5000), SPRITE_BUCKETS[SPRITE_BUCKETS.length - 1]);
});

test("sprite mode: lamps and sensors keep symbols, hung pieces are dashed", () => {
  assert.equal(spriteMode({ type: "floorLamp" }, { lamp: true }), "glyph");
  assert.equal(spriteMode({ type: "motionSensor" }, {}), "glyph");
  assert.equal(spriteMode({ type: "upper" }, { vspan: { lo: 145, hi: 215 } }), "overhead");
  assert.equal(spriteMode({ type: "ceilingFan" }, {}), "overhead");
  assert.equal(spriteMode({ type: "shelf" }, { vspan: { lo: 160, hi: 190 } }), "overhead");
  assert.equal(spriteMode({ type: "sofa" }, { vspan: { lo: 0, hi: 85 } }), "sprite");
  assert.equal(spriteMode({ type: "rug" }, { vspan: { lo: 0, hi: 1 } }), "sprite");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSpatialIndex, collideCircle } from "../js/col2d.js";

function collisionModel() {
  return {
    segs: [
      { ax: -260, az: -80, bx: 260, bz: -80, half: 8 },
      { ax: 260, az: -80, bx: 260, bz: 260, half: 12 },
      { ax: -260, az: 260, bx: 260, bz: 260, half: 8 },
    ],
    doorSegs: [
      { ax: -260, az: -80, bx: -260, bz: 40, half: 8, pivot: { userData: { open: false } } },
    ],
    rects: [
      { x0: -40, z0: 20, x1: 55, z1: 95, y0: 0, y1: 90 },
      { x0: 170, z0: 145, x1: 225, z1: 215, y0: 0, y1: 140 },
    ],
  };
}

test("Night Shift spatial collision broad phase preserves narrow-phase results", () => {
  const plain = collisionModel();
  const indexed = collisionModel();
  buildSpatialIndex(indexed, 180, 64);
  const samples = [
    [-250, -76], [0, -70], [252, 10], [250, 252], [-255, 25],
    [-45, 45], [58, 80], [185, 150], [0, 0], [100, 120], [-300, 300],
  ];
  for (const [x, z] of samples) {
    const a = { x, z };
    const b = { x, z };
    const hitA = collideCircle(plain, a, 24, 0, 172, 42, { passes: 4 });
    const hitB = collideCircle(indexed, b, 24, 0, 172, 42, { passes: 4 });
    assert.ok(Math.abs(hitA - hitB) < 1e-9, `hit mismatch at ${x},${z}`);
    assert.ok(Math.abs(a.x - b.x) < 1e-9, `x mismatch at ${x},${z}`);
    assert.ok(Math.abs(a.z - b.z) < 1e-9, `z mismatch at ${x},${z}`);
  }
});

test("collision scratch state is reset between hot-loop probes", () => {
  const col = collisionModel();
  const state = { hit: 99, hard: 99 };
  const opt = { passes: 3, state };
  assert.ok(collideCircle(col, { x: 0, z: -78 }, 24, 0, 172, 42, opt) > 0);
  assert.equal(collideCircle(col, { x: 1000, z: 1000 }, 24, 0, 172, 42, opt), 0);
  assert.deepEqual(state, { hit: 0, hard: 0 });
});

test("Night Shift computes articulated poses once after physics substeps", async () => {
  const game = await readFile(new URL("../js/zombies_game.js", import.meta.url), "utf8");
  const world = await readFile(new URL("../js/zombies_world.js", import.meta.url), "utf8");
  assert.match(game, /stepZed\(Z\.zeds\[i\], stepDt, true\)/);
  assert.match(game, /for \(var zi = Z\.zeds\.length - 1; zi >= 0; zi--\) stepZedVisuals\(Z\.zeds\[zi\], dt\)/);
  assert.match(world, /Col2D\.buildSpatialIndex\(col, 180\)/);
  assert.match(world, /var _zedMovePoint = \{ x: 0, z: 0 \}/);
});

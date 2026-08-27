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

test("Night Shift Fast quality skips CAD post-processing and caps pixel ratio", async () => {
  const view = await readFile(new URL("../js/view3d.js", import.meta.url), "utf8");
  const game = await readFile(new URL("../js/zombies_game.js", import.meta.url), "utf8");
  const physics = await readFile(new URL("../js/physics.js", import.meta.url), "utf8");
  const facade = await readFile(new URL("../js/physics_facade.js", import.meta.url), "utf8");
  const world = await readFile(new URL("../js/zombies_world.js", import.meta.url), "utf8");
  assert.match(view, /export function setGameRendererQuality\(quality\)/);
  assert.match(view, /usePost = false/);
  assert.match(view, /var ratio = quality >= 2 \? 1\.25 : 1/);
  assert.match(view, /var physicsLive = isPhysicsBusy\(\)/);
  assert.match(game, /setGameRendererQuality\(Z\.settings\.quality\)/);
  assert.match(game, /clearGameRendererQuality\(\)/);
  assert.match(physics, /export function isPhysicsBusy\(\)/);
  assert.match(physics, /const MAX_SUB_STEPS = 3/);
  assert.match(physics, /if \(isDynamic\) body\.sleep\(\)/);
  assert.match(physics, /if \(!isPhysicsBusy\(\)\) return/);
  assert.match(facade, /export function isPhysicsBusy\(\)/);
  assert.match(world, /Z\.parts\.geo\.instanceCount = Z\.parts\.activeN/);
  assert.match(world, /Z\.fireParts\.geo\.instanceCount = Z\.fireParts\.activeN/);
  assert.match(world, /if \(type !== "crawler" && nsQuality\(\) > 0\)/);
  assert.match(world, /var lampCap = nsQuality\(\) >= 2 \? 8 : nsQuality\(\) >= 1 \? 3 : 2/);
});

test("Night Shift batches rigid zombie pieces and avoids idle visual uploads", async () => {
  const game = await readFile(new URL("../js/zombies_game.js", import.meta.url), "utf8");
  const world = await readFile(new URL("../js/zombies_world.js", import.meta.url), "utf8");
  assert.match(world, /import \{ mergeGeometries \} from "three\/addons\/utils\/BufferGeometryUtils\.js"/);
  assert.match(world, /function batchZombieRig\(rig\)/);
  assert.match(world, /batchZombieRig\(rig\)/);
  assert.match(world, /if \(partDirty\) \{/);
  assert.match(world, /if \(fireDirty\) \{/);
  assert.match(world, /if \(M\.updateT >= 0\.05\)/);
  assert.match(game, /Z\.radarNext = Z\.t \+ 0\.1/);
  assert.match(game, /Z\.screenFxNext = Z\.t \+ 0\.04/);
});

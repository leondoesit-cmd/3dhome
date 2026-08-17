import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const world = await readFile(new URL("../js/zombies_world.js", import.meta.url), "utf8");

test("cloth animation reacts to real travel, acceleration and turning", () => {
  assert.match(world, /function sampleClothMotion\(zd, dt\)/);
  assert.match(world, /rawF = clamp\(\(vx \* fx \+ vz \* fz\) \/ 230/);
  assert.match(world, /rawTurn = clamp\(dh \* inv \/ 6/);
  assert.match(world, /zd\.clothImpulseF/);
  assert.match(world, /sampleClothMotion\(zd, dt\);/);
});

test("coat tails use layered transform springs for delayed follow-through", () => {
  assert.match(world, /upperY: 0[\s\S]*lowerY: 0/);
  assert.match(world, /springAngle\(flap, "upperY", "upperVY", cy, dt, 34, 0\.026\)/);
  assert.match(world, /springAngle\(flap, "lowerY", "lowerVY", cy \* 1\.7/);
  assert.match(world, /lower half arrives late and keeps moving/);
});

test("cloth upgrade remains transform-only with the same mesh budget", () => {
  assert.equal((world.match(/addClothFlap\(/g) || []).length, 4);
  assert.doesNotMatch(world, /new THREE\.SkinnedMesh/);
  assert.doesNotMatch(world, /new CANNON\./);
  assert.match(world, /return \{ meshes: clothes, flaps: flaps, layers: layers/);
});

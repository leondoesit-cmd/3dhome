import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

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
  /* "Arrives late and keeps moving" is a pair of numbers, not a sentence: the
     lower flap is driven by a weaker spring with more overshoot than the upper
     one it hangs off. */
  const lines = stripComments(world).split("\n");
  const spring = (part, axis) => {
    // the driven value can itself be a call, so read the line, then take the
    // stiffness and damping off its tail
    const line = lines.find((l) => l.includes('springAngle(flap, "' + part + axis + '"'));
    return line && line.match(/, dt, (\d+(?:\.\d+)?), ([0-9.]+)\)/);
  };
  for (const axis of ["X", "Y", "Z"]) {
    const upper = spring("upper", axis), lower = spring("lower", axis);
    assert.ok(upper && lower, "both halves of the " + axis + " axis are sprung");
    assert.ok(Number(lower[1]) < Number(upper[1]), axis + ": the tail is the softer spring");
    assert.ok(Number(lower[2]) > Number(upper[2]), axis + ": and keeps moving longer");
  }
});

test("cloth upgrade remains transform-only with the same mesh budget", () => {
  assert.equal((world.match(/addClothFlap\(/g) || []).length, 4);
  assert.doesNotMatch(world, /new THREE\.SkinnedMesh/);
  assert.doesNotMatch(world, /new CANNON\./);
  assert.match(world, /return \{ meshes: clothes, flaps: flaps, layers: layers/);
});

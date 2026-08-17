import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  dampingFactor,
  forEachPhysicsStep,
  safeDeltaMilliseconds,
  safeDeltaSeconds,
} from "../js/physics_runtime.js";

const read = (name) => readFile(new URL("../" + name, import.meta.url), "utf8");

test("shared physics timing rejects bad deltas and caps tab-resume stalls", () => {
  assert.equal(safeDeltaSeconds(16), 0.016);
  assert.equal(safeDeltaSeconds(5000), 0.05);
  assert.equal(safeDeltaSeconds(-10), 0);
  assert.equal(safeDeltaSeconds(Number.NaN, 0.02), 0.02);
  assert.equal(safeDeltaMilliseconds(5000), 50);
});

test("kinematic substeps preserve elapsed time and bound every movement slice", () => {
  const steps = [];
  const count = forEachPhysicsStep(0.05, (dt) => steps.push(dt));
  assert.equal(count, 3);
  assert.ok(steps.every((dt) => dt <= 1 / 60 + 1e-12));
  assert.ok(Math.abs(steps.reduce((sum, dt) => sum + dt, 0) - 0.05) < 1e-12);
});

test("exponential damping is stable across different refresh rates", () => {
  const rate = 8;
  const oneFrame = dampingFactor(rate, 1 / 30);
  const halfFrame = dampingFactor(rate, 1 / 60);
  const twoHalfFrames = 1 - (1 - halfFrame) ** 2;
  assert.ok(Math.abs(oneFrame - twoHalfFrames) < 1e-12);
});

test("all real-time physics modes use the shared guarded clock", async () => {
  const [view, drive, rc, zombies] = await Promise.all([
    read("js/view3d.js"),
    read("js/drive.js"),
    read("js/rc_game.js"),
    read("js/zombies_game.js"),
  ]);
  assert.match(view, /safeDeltaMilliseconds/);
  assert.match(drive, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
  assert.match(rc, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
  assert.match(zombies, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
});

test("rigid-body engine uses high-frequency interpolation, material contacts and retirement", async () => {
  const physics = await read("js/physics.js");
  assert.match(physics, /FIXED_STEP = 1 \/ 120/);
  assert.match(physics, /interpolatedPosition/);
  assert.match(physics, /MATERIAL_PROFILES/);
  assert.match(physics, /Math\.sqrt\(a\.friction \* b\.friction\)/);
  assert.match(physics, /bodyLookup = new Map/);
  assert.match(physics, /DEBRIS_RETIRE_SECONDS/);
  assert.match(physics, /bodyIsFinite/);
});

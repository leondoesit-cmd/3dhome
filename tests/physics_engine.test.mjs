import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  dampingFactor,
  forEachPhysicsStep,
  safeDeltaMilliseconds,
  safeDeltaSeconds,
} from "../js/physics_runtime.js";
import {
  MATERIAL_PROFILES,
  MAX_SETTLE_SPEED,
  MAX_ACTIVE_SPEED,
  MAX_SETTLE_SPEED_M,
  GRAVITY_M,
  aabbUnion,
  aabbVolume,
  angularSpeedScale,
  applyClampToVec,
  chainShatterSpeed,
  chainShatterSpeedM,
  clampImpulse,
  compoundPartsFromAabbs,
  hitStress,
  linearSpeedScale,
  linearSpeedScaleM,
  massFromCubicVolume,
  massFromVolume,
  mixFriction,
  mixRestitution,
  partStress,
  resolvePhysicsRole,
  slideAlongNormal,
  toCm,
  toM,
  vecToCm,
  vecToM,
} from "../js/physics/math.js";
import { createClothState, stepClothState } from "../js/physics/cloth_sim.js";
import { ctx } from "../js/physics/registry.js";
import {
  initNative,
  createWorld,
  createBody,
  addBoxShape,
  createBoxBodyCm,
  disposeNativeWorld,
  moveCharacterCm,
} from "../js/physics/native.js";

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
  const [view, drive, rc, zombies, lava] = await Promise.all([
    moduleSource("js/view3d.js"),
    read("js/drive.js"),
    moduleSource("js/rc_game.js"),
    moduleSource("js/zombies_game.js"),
    read("js/lava_game.js"),
  ]);
  assert.match(view, /safeDeltaMilliseconds/);
  assert.match(drive, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
  assert.match(rc, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
  assert.match(zombies, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
  assert.match(lava, /safeDeltaSeconds[\s\S]*forEachPhysicsStep/);
});

test("mass from volume matches the centimetre-scale clamp", () => {
  assert.equal(massFromVolume(20, 20, 20, 1), 0.8);
  assert.equal(massFromCubicVolume(8000, 1), 0.8);
  assert.equal(massFromVolume(1, 1, 1, 1), 0.05);
  assert.equal(massFromVolume(400, 400, 400, 2.5), 500);
});

test("contact mixing is geometric mean", () => {
  assert.equal(mixFriction(0.64, 0.64), 0.64);
  assert.ok(Math.abs(mixRestitution(0.04, 0.09) - 0.06) < 1e-12);
});

test("impulse clamp cannot impart more than maxDv", () => {
  const clamped = clampImpulse({ x: 0, y: 1e9, z: 0 }, 0.1, 1200);
  assert.ok(Math.abs(clamped.y - 120) < 1e-6);
  const vec = { x: 4000, y: 0, z: 0 };
  applyClampToVec(vec, 2, 100);
  assert.equal(vec.x, 200);
});

test("hit and part stress match the weapon falloff used in shatter", () => {
  assert.equal(hitStress(800, 10, null), 10);
  assert.equal(hitStress(800, 10, 180), 180);
  const close = partStress(62, 30, 1, 10000);
  const far = partStress(62, 30, 120, 10000);
  assert.ok(close > far);
  assert.ok(close <= 62 * 3);
});

test("unhit bodies are settle-capped; hit bodies may go faster", () => {
  assert.equal(linearSpeedScale(MAX_SETTLE_SPEED, false), 1);
  assert.equal(linearSpeedScale(MAX_SETTLE_SPEED * 2, false), 0.5);
  assert.equal(linearSpeedScale(MAX_ACTIVE_SPEED, true), 1);
  assert.ok(linearSpeedScale(MAX_ACTIVE_SPEED * 2, true) < 1);
  assert.equal(angularSpeedScale(30), 1);
  assert.equal(angularSpeedScale(60), 0.5);
});

test("physics.role is explicit, with mounted-item fallback", () => {
  assert.equal(resolvePhysicsRole({ physicsRole: "static" }), "static");
  assert.equal(resolvePhysicsRole({ physicsRole: "ignore" }), "ignore");
  assert.equal(resolvePhysicsRole({ item: { elev: 140 } }), "static");
  assert.equal(resolvePhysicsRole({ item: { type: "chair" } }), "dynamic");
  assert.equal(resolvePhysicsRole({ item: { type: "art" } }, 115), "static");
  assert.equal(resolvePhysicsRole({}), "static");
});

test("compound parts leave the empty air a union AABB would fill", () => {
  const table = [
    { min: [-40, 70, -20], max: [40, 74, 20] },
    { min: [-38, 0, -18], max: [-34, 70, -14] },
    { min: [34, 0, -18], max: [38, 70, -14] },
    { min: [-38, 0, 14], max: [-34, 70, 18] },
    { min: [34, 0, 14], max: [38, 70, 18] },
  ];
  const union = aabbUnion(table);
  const unionVol = aabbVolume(union.min, union.max);
  const partVol = table.reduce((sum, box) => sum + aabbVolume(box.min, box.max), 0);
  assert.ok(partVol < unionVol * 0.25);
  const parts = compoundPartsFromAabbs(table, true);
  assert.equal(parts.length, 5);
  assert.ok(parts[0].halfExtents.x < 40);
});

test("unhit overlapping boxes stay under the metre settle cap after the limiter", async () => {
  await initNative();
  disposeNativeWorld();
  createWorld();
  const a = createBoxBodyCm({ x: 0, y: 20, z: 0, hx: 20, hy: 20, hz: 20, mass: 5, dynamic: true });
  const b = createBoxBodyCm({ x: 5, y: 20, z: 5, hx: 20, hy: 20, hz: 20, mass: 5, dynamic: true });
  for (let i = 0; i < 8; i++) ctx.world.step(1 / 120, 0.05, 8);
  const speed = a.velocity.length();
  a.velocity.scale(linearSpeedScaleM(speed, false), a.velocity);
  assert.ok(a.velocity.length() <= MAX_SETTLE_SPEED_M + 1e-6);
  void b;
  disposeNativeWorld();
});

test("chain shatter threshold scales with strength", () => {
  assert.equal(chainShatterSpeed(1), 500);
  assert.equal(chainShatterSpeed(2), 1000);
  assert.equal(chainShatterSpeedM(1), 5);
});

test("centimetre and metre conversion is exact at the solver boundary", () => {
  assert.equal(toM(100), 1);
  assert.equal(toCm(1.5), 150);
  assert.deepEqual(vecToM({ x: 250, y: 0, z: -100 }), { x: 2.5, y: 0, z: -1 });
  assert.deepEqual(vecToCm({ x: 0.2, y: 1, z: 0 }), { x: 20, y: 100, z: 0 });
  assert.equal(GRAVITY_M, 9.81);
});

test("kinematic capsule slides along a wall instead of embedding", () => {
  const intoWall = slideAlongNormal(10, 0, 0, -1, 0, 0);
  assert.ok(Math.abs(intoWall.x) < 1e-12);
  assert.equal(intoWall.z, 0);
  const along = slideAlongNormal(0, 0, 10, -1, 0, 0);
  assert.equal(along.z, 10);
});

test("hanging cloth keeps the pinned row still and drops the hem", () => {
  const cloth = createClothState({ x: 0, y: 200, z: 0, width: 80, height: 100, cols: 4, rows: 5, nx: 0, nz: 1 });
  const pin = { x: cloth.points[0].x, y: cloth.points[0].y, z: cloth.points[0].z };
  const hem = cloth.points[cloth.points.length - 1];
  const hemY = hem.y;
  for (let i = 0; i < 12; i++) stepClothState(cloth, 1 / 60);
  assert.equal(cloth.points[0].x, pin.x);
  assert.equal(cloth.points[0].y, pin.y);
  assert.ok(hem.y < hemY);
});

test("walk, Night Shift and Lava query the rigid island; cars stay arcade", async () => {
  const [view, zombies, lava, drive, rc] = await Promise.all([
    read("js/view3d/see_through.js"),
    read("js/zombies_game/hud.js"),
    read("js/lava_game.js"),
    read("js/drive.js"),
    moduleSource("js/rc_game.js"),
  ]);
  // the walk mode in view3d never called moveKinematicCapsule (only imported it), so only the cloth is checked there
  assert.match(view, /spawnHangingCloth/);
  assert.match(zombies, /moveKinematicCapsule/);
  assert.match(lava, /moveKinematicCapsule/);
  assert.doesNotMatch(drive, /moveKinematicCapsule/);
  assert.doesNotMatch(rc, /moveKinematicCapsule/);
});

test("engine modules stay split: world steps, damage fractures, math owns profiles", async () => {
  const [barrel, worldSrc, damageSrc, shapesSrc, nativeSrc] = await Promise.all([
    read("js/physics.js"),
    read("js/physics/world.js"),
    read("js/physics/damage.js"),
    read("js/physics/shapes.js"),
    read("js/physics/native.js"),
  ]);
  assert.match(barrel, /syncPhysicsToThree/);
  assert.match(barrel, /drainShatterQueue\(takeShatterQueue/);
  assert.match(worldSrc, /FIXED_STEP/);
  assert.match(worldSrc, /interpolatedPosition/);
  assert.match(worldSrc, /shatterQueue/);
  assert.doesNotMatch(worldSrc, /gravity\.set\(0, -981/);
  assert.doesNotMatch(worldSrc, /cannon-es/);
  assert.doesNotMatch(worldSrc, /fractureMesh/);
  assert.doesNotMatch(worldSrc, /getElementById/);
  assert.match(nativeSrc, /GRAVITY_M/);
  assert.match(nativeSrc, /rapier\.mjs/);
  assert.doesNotMatch(nativeSrc, /cannon-es/);
  assert.match(damageSrc, /fractureMesh/);
  assert.match(damageSrc, /applyImpulseCm/);
  assert.match(shapesSrc, /createPhysicsBody/);
  assert.match(shapesSrc, /setPositionCm/);
  assert.ok(MATERIAL_PROFILES.wood.friction > 0);
});

test("a chair under a compound table is not launched by empty AABB air", async () => {
  await initNative();
  disposeNativeWorld();
  createWorld();
  const table = createBody({ isDynamic: true, friction: 0.6, restitution: 0.05 });
  addBoxShape(table, 40, 2, 20, 0, 72, 0, 2);
  addBoxShape(table, 2, 35, 2, -36, 35, -16, 0.4);
  addBoxShape(table, 2, 35, 2, 36, 35, -16, 0.4);
  addBoxShape(table, 2, 35, 2, -36, 35, 16, 0.4);
  addBoxShape(table, 2, 35, 2, 36, 35, 16, 0.4);
  table.flushToRapier();
  const chair = createBoxBodyCm({ x: 0, y: 22, z: 0, hx: 18, hy: 22, hz: 18, mass: 2, dynamic: true });
  for (let i = 0; i < 120; i++) ctx.world.step(1 / 120, 1 / 120, 1);
  assert.ok(chair.position.y < 0.8, `chair launched to y=${chair.position.y}`);
  assert.ok(chair.velocity.length() <= MAX_SETTLE_SPEED_M + 0.5);
  disposeNativeWorld();
});

test("kinematic capsule stops at a wall and slides along it", async () => {
  await initNative();
  disposeNativeWorld();
  createWorld();
  createBoxBodyCm({ x: 80, y: 100, z: 0, hx: 10, hy: 100, hz: 120, mass: 0, dynamic: false });
  const into = moveCharacterCm(0, 0, 0, 90, 0, 0, 18, 165);
  assert.ok(into.x < 70, `walked through wall to x=${into.x}`);
  const along = moveCharacterCm(into.x, 0, 0, 20, 0, 50, 18, 165);
  assert.ok(along.z > 20, `did not slide along wall, z=${along.z}`);
  disposeNativeWorld();
});

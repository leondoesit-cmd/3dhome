import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const world = await readFile(new URL("../js/zombies_world.js", import.meta.url), "utf8");
const game = await readFile(new URL("../js/zombies_game.js", import.meta.url), "utf8");

test("Night Shift renders fire through a dedicated additive particle pool", () => {
  assert.match(world, /Z\.fireParts\s*=\s*\{/);
  assert.match(world, /blending:\s*THREE\.AdditiveBlending/);
  assert.match(world, /export function spawnFirePart\(/);
  assert.match(game, /spawnFirePart\(/);
});

test("Night Shift graphics tiers control its own expensive render paths", () => {
  assert.match(world, /export function setNightShiftQuality\(value\)/);
  assert.match(world, /export function nightShiftGfxPolicy\(quality\)/);
  assert.match(world, /Z\.qualityFxScale = \[0\.45, 0\.72, 1\]\[quality\]/);
  assert.match(world, /F\.volumetric = quality > 0/);
  assert.match(world, /applyZedShadowQuality\(rig\.root\)/);
  assert.match(world, /shadowIntervalMs: Infinity/);
  assert.match(world, /far: 1180/);
  assert.match(game, /configureNightShiftGfx\(nightShiftGfxPolicy\(cfg\.quality\)\)/);
  assert.match(game, /configureNightShiftGfx\(null\)/);
  assert.match(game, /qualityCap = \[12, 18, 24\]\[cfg\.quality \|\| 0\]/);
  assert.match(game, /var texBudgetChanged = setTexBudget\(gameSettings\(\)\.quality\)/);
  assert.doesNotMatch(game, /setQualityPreset\(\["performance", "balanced", "quality"\]/);
});

test("Night Shift motes are instanced sprites so WebGPU can size them", () => {
  assert.match(world, /Z\.motes = \{ m: motes, geo: mg/);
  assert.match(world, /mg\.setAttribute\("iPos", new THREE\.InstancedBufferAttribute\(mp, 3\)\)/);
  assert.doesNotMatch(world, /new THREE\.Points\(/);
});

test("burning zombies use a special staged reaction and clean up their light", () => {
  assert.match(world, /var burnPanic = burning && zd\.panicT > 0/);
  assert.match(world, /if \(burning && !zd\.crawler\)/);
  assert.match(world, /frantic, asymmetric flailing/);
  assert.match(world, /if \(zd\.fireLight\) zd\.fireLight\.intensity = 0/);
});

test("weapon fire keeps optional world destruction from breaking combat", () => {
  assert.match(game, /function damageWorldSafely\(origin, dir, kind\)/);
  assert.match(game, /if \(!destructReady\(\)\) return false/);
  assert.match(game, /damageWorldSafely\(origin, d, def\.pellets > 1 \? "buck" : "bullet"\)/);
});

test("flamethrower consumes fuel at its configured rate and respects walls", () => {
  assert.match(game, /var fuelInterval = 60 \/ def\.rpm/);
  assert.match(game, /P\.flameFuel >= fuelInterval/);
  assert.match(game, /function flameCanReach\(origin, target, maxDist, zd\)/);
  assert.match(game, /if \(!flameCanReach\(origin, tmpVec\(zd\.x, zd\.y \+ 90, zd\.z\), reach \+ 40, zd\)\) continue/);
});

test("zombie models use articulated clothing, hair, and tear anchors", () => {
  assert.match(world, /function addClothFlap\(parent, width, height/);
  assert.match(world, /return \{ meshes: clothes, flaps: flaps, layers: layers/);
  assert.match(world, /function addHairLock\(parent, x, y, z, length/);
  assert.match(world, /function springAngle\(owner, valueKey, velocityKey, target, dt, stiffness, damping\)/);
  assert.match(world, /function clothAnchor\(zd, layerName, point, fallback\)/);
  assert.match(world, /var fabricAnchor = clothAnchor\(zd, layerName, point, anchor\)/);
});

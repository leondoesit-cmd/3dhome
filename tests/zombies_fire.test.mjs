import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

const world = await readFile(new URL("../js/zombies_world.js", import.meta.url), "utf8");
const game = await readFile(new URL("../js/zombies_game.js", import.meta.url), "utf8");

test("Night Shift renders fire through a dedicated additive particle pool", () => {
  assert.match(world, /Z\.fireParts\s*=\s*\{/);
  assert.match(world, /blending:\s*THREE\.AdditiveBlending/);
  assert.match(world, /export function spawnFirePart\(/);
  assert.match(game, /spawnFirePart\(/);
  // dust motes are instanced sprite quads (WebGPU draws Points at 1px); the
  // spray texture is sampled from the quad's own position, so no uv lookup
  // can warn about a missing attribute when the FX pass wakes
  assert.match(world, /mg = instancedQuad\(MN\)/);
  assert.match(world, /texture\(TEX\.spray, positionGeometry\.xy\.add\(vec2\(0\.5\)\)\)/);
});

test("Night Shift graphics tiers control its own expensive render paths", () => {
  assert.match(world, /export function setNightShiftQuality\(value\)/);
  assert.match(world, /Z\.qualityFxScale = \[0\.45, 0\.72, 1\]\[quality\]/);
  assert.match(world, /Z\.flash\.volumetric = quality > 0/);
  assert.match(world, /applyZedShadowQuality\(rig\.root\)/);
  assert.match(game, /var qualityCap = qualityHordeCap\(\)/);
  assert.match(game, /function qualityHordeCap\(\)\s*\{\s*return 16/);
  assert.match(game, /if \(setTexBudget\(gameSettings\(\)\.quality\)\)/);
  assert.match(game, /setGameRendererQuality/);
  assert.match(game, /if \(Z\.settings\.quality >= 2\) enableDestruction\(\)/);
});

test("burning zombies use a special staged reaction and clean up their light", () => {
  assert.match(world, /var burnPanic = burning && zd\.panicT > 0/);
  assert.match(world, /if \(burning && !zd\.crawler\)/);
  /* Two stages and asymmetry are both in the code: panic scales the amplitude,
     and the two rotation drivers run at different rates so the limbs never
     mirror each other. */
  const burn = stripComments(world);
  assert.match(burn, /var fireAmp = burnPanic \? 1 : 0\.48;/, "panic is the loud stage");
  const wr = burn.match(/var wr = Math\.sin\(ph \* ([0-9.]+)\);/);
  const wr2 = burn.match(/var wr2 = Math\.sin\(ph \* ([0-9.]+) \+ ([0-9.]+)\);/);
  assert.ok(wr && wr2, "both drivers exist");
  assert.notEqual(wr[1], wr2[1], "at different rates, so the flailing cannot be symmetric");
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

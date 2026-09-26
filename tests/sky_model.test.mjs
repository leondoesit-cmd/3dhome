import test from "node:test";
import assert from "node:assert/strict";
import { skyRadiance, skyPixels, equirectDir } from "../js/sky_model.js";

const P = { zenith: [0.2, 0.35, 0.6], horizon: [0.6, 0.65, 0.7], ground: [0.2, 0.25, 0.15], sunColor: [1, 0.95, 0.85], sunI: 30, glowI: 0.9 };
const sun = [0.5, 0.6, -0.62].map((v, _, a) => v / Math.hypot(...a));

test("equirect layout matches three's lookup: row 0 is straight down, u = atan2(z, x)", () => {
  assert.ok(equirectDir(0.3, 0)[1] < -0.99);
  assert.ok(equirectDir(0.3, 1)[1] > 0.99);
  const d = equirectDir(0.5 + Math.atan2(0.6, 0.8) / (2 * Math.PI), 0.5);
  assert.ok(Math.abs(d[0] - 0.8) < 1e-9 && Math.abs(d[2] - 0.6) < 1e-9);
});

test("the sun is the brightest point and is HDR; the ground is darker than the sky", () => {
  const atSun = skyRadiance(sun, sun, P), away = skyRadiance([-sun[0], sun[1], -sun[2]], sun, P);
  assert.ok(atSun[0] > 5, "sun disc above 1");
  assert.ok(away[0] < 1.5);
  const up = skyRadiance([0, 1, 0], sun, P), down = skyRadiance([0, -1, 0], sun, P);
  assert.ok(up[2] > down[2]);
  // no sun lobe below the horizon at night
  assert.deepEqual(skyRadiance([0, 1, 0], [0, -0.5, 0.86], P), skyRadiance([0, 1, 0], [0, -0.5, 0.86], { ...P, sunI: 0, glowI: 0 }));
});

test("sky pixels are finite RGBA with opaque alpha", () => {
  const px = skyPixels(32, 16, sun, P);
  assert.equal(px.length, 32 * 16 * 4);
  for (let i = 0; i < px.length; i++) assert.ok(Number.isFinite(px[i]));
  for (let i = 3; i < px.length; i += 4) assert.equal(px[i], 1);
});

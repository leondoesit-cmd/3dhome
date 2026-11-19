import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../vendor/three/three.core.js";
import { THREE } from "../js/three_lazy.js";
import { S } from "../js/state.js";
import { box, limitPaintReflectance } from "../js/primitives.js";

Object.assign(THREE, core);
const parent = new core.Group();
function finish(color, options) {
  return box(parent, 0, 2, 0, 3, 0, 4, color, { sharp: true, ...options }).material;
}

test("polished and matte fixtures sample the same incident environment", () => {
  const paint = finish(0xffffff, { rough: 0.95 });
  const metal = finish(0xffffff, { rough: 0.04, metal: 1 });
  assert.equal(metal.envMapIntensity, 1);
  assert.equal(paint.envMapIntensity, metal.envMapIntensity);
  assert.equal(paint.color.r, 0.85);
  assert.equal(metal.color.r, 1);
  const red = finish(0xff4422);
  const original = new core.Color(0xff4422);
  assert.ok(Math.abs(red.color.g / red.color.r - original.g / original.r) < 1e-10);
  assert.equal(red.emissive.getHex(), 0);
  const mapped = new core.MeshStandardMaterial({ map: new core.Texture(), color: 0xffffff });
  limitPaintReflectance(mapped);
  assert.equal(mapped.color.r, 1, "the albedo map retains its full value");
});

test("continuous glass coverage and explicit lampshade tags survive construction", () => {
  const glass = finish(0xffffff, { transmission: 0.9, opacity: 0.34, metal: 0.1 });
  assert.equal(glass.transmission, 0.9);
  assert.equal(glass.opacity, 1);
  assert.equal(glass.transparent, false);
  assert.equal(glass.metalness, 0);
  assert.equal(glass.ior, 1.5);
  assert.equal(glass.color.r, 1);
  const shade = finish(0xeeddbb, { lampShade: "linen" });
  assert.equal(shade.userData.lampShade, "linen");
  assert.equal(shade.emissive.getHex(), 0);
  for (const hourScale of [0, 1]) {
    S.artK = hourScale;
    assert.equal(finish(0xffffff, { emis: 0xffffff }).emissiveIntensity, 1);
  }
});

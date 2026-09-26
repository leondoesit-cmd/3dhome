import test from "node:test";
import assert from "node:assert/strict";
import { pbrPixels, heightToNormal, PBR_FAMILIES } from "../js/pbr_textures.js";

const N = 64;

test("surface detail is deterministic", () => {
  for (const f of ["linen", "oak", "marble"]) {
    assert.deepEqual(pbrPixels(f, N).albedo, pbrPixels(f, N).albedo, f);
  }
});

test("detail albedo stays near white so the part's own colour still reads", () => {
  for (const f of PBR_FAMILIES) {
    const px = pbrPixels(f, N);
    let sum = 0;
    for (let i = 0; i < N * N; i++) sum += px.albedo[i * 4];
    const mean = sum / (N * N) / 255;
    assert.ok(mean >= 0.72 && mean <= 1, f + " mean " + mean.toFixed(3));
    assert.ok(px.tileCm > 0, f);
  }
});

test("tiles wrap: the seam is no rougher than the texture itself", () => {
  for (const f of ["linen", "boucle", "oak", "cotton", "leather", "plaster"]) {
    const a = pbrPixels(f, N).albedo;
    const at = (x, y) => a[(y * N + x) * 4];
    // each seam against the texture's own roughness in the same direction
    let innerX = 0, innerY = 0, seamX = 0, seamY = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N - 1; x++) {
        innerX += Math.abs(at(x + 1, y) - at(x, y));
        innerY += Math.abs(at(y, x + 1) - at(y, x));
      }
      seamX += Math.abs(at(0, y) - at(N - 1, y));
      seamY += Math.abs(at(y, 0) - at(y, N - 1));
    }
    const k = N * (N - 1);
    assert.ok(seamX / N <= (innerX / k) * 2.5 + 2, f + " x seam");
    assert.ok(seamY / N <= (innerY / k) * 2.5 + 2, f + " y seam");
  }
});

test("a flat height field is a flat normal map", () => {
  const n = heightToNormal(new Float32Array(16).fill(0.5), 4, 3);
  for (let i = 0; i < 16; i++) assert.deepEqual([n[i * 4], n[i * 4 + 1], n[i * 4 + 2]], [128, 128, 255]);
});

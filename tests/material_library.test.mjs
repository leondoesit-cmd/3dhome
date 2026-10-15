/* The baked material library: catalogue integrity, saved-reference parsing,
   legacy coverage (every procedural preset / floor painter / pbr family has a
   baked replacement), the device tier choice, and — for every id whose folder
   exists — that the bake produced the full file set. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  MATERIALS, materialById, materialForLegacy, isMaterialRef, materialRef, materialFromRef,
  materialUrl, materialFiles, codexPrompt, isOrganic, previewUrlFor,
} from "../js/material_library.js";
import { pickMaterialTier, isSoftwareRendererName } from "../js/material_tier.js";
import { PBR_FAMILIES } from "../js/pbr_textures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("ids are unique, folder-safe and every entry is well formed", () => {
  const ids = MATERIALS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of MATERIALS) {
    assert.match(m.id, /^[a-z0-9_]+$/i, m.id);
    assert.ok(["gallery", "floor", "detail", "surface"].includes(m.group), m.id);
    assert.ok(m.sizeCm > 0, m.id);
    assert.ok(m.rough[0] >= 0 && m.rough[0] <= m.rough[1] && m.rough[1] <= 1, m.id);
    assert.ok(m.metal >= 0 && m.metal <= 1, m.id);
    assert.ok(["opaque", "clearcoat", "polished", "fabric", "metal", "glass"].includes(m.kind), m.id);
    assert.ok(m.subject.length > 10, m.id);
  }
});

test("every gallery preset, floor painter and pbr family has a library entry", () => {
  const presets = readFileSync(join(root, "js", "textures.js"), "utf8")
    .match(/^\s*\{ id: "([a-z_]+)", cat:/gm)
    .map((line) => line.match(/id: "([a-z_]+)"/)[1]);
  assert.ok(presets.length >= 40);
  for (const id of presets) assert.ok(materialForLegacy("preset:" + id), "preset " + id);
  const state = readFileSync(join(root, "js", "state.js"), "utf8");
  const tileBlock = state.slice(state.indexOf("export const TILE"), state.indexOf("};", state.indexOf("export const TILE")));
  const floors = [...tileBlock.matchAll(/^\s+([a-zA-Z]+):\s*\d+/gm)].map((m) => m[1]);
  assert.ok(floors.length >= 20);
  for (const key of floors) {
    const m = materialForLegacy("floor:" + key);
    assert.ok(m, "floor " + key);
  }
  for (const fam of PBR_FAMILIES) assert.ok(materialForLegacy("pbr:" + fam), "pbr " + fam);
});

test("floor entries keep the painter's tile size so existing rooms keep their scale", () => {
  const state = readFileSync(join(root, "js", "state.js"), "utf8");
  const tileBlock = state.slice(state.indexOf("export const TILE"), state.indexOf("};", state.indexOf("export const TILE")));
  for (const [, key, cm] of tileBlock.matchAll(/^\s+([a-zA-Z]+):\s*(\d+)/gm)) {
    assert.equal(materialForLegacy("floor:" + key).sizeCm, Number(cm), key);
  }
});

test("mat: references round-trip and reject unknown ids", () => {
  assert.equal(materialRef("oak_natural"), "mat:oak_natural");
  assert.ok(isMaterialRef("mat:oak_natural"));
  assert.equal(materialFromRef("mat:oak_natural"), materialById("oak_natural"));
  assert.equal(isMaterialRef("mat:no_such_material"), false);
  assert.equal(materialFromRef("data:image/jpeg;base64,AAAA"), null);
  assert.equal(materialFromRef(null), null);
  assert.equal(previewUrlFor("mat:oak_natural"), "assets/materials/oak_natural/thumb.webp");
  assert.equal(previewUrlFor("https://x/y.jpg"), "https://x/y.jpg");
});

test("ORM resolves to 1k on every tier; colour and normal follow the tier", () => {
  assert.equal(materialUrl("oak_natural", "color", "2k"), "assets/materials/oak_natural/color_2k.webp");
  assert.equal(materialUrl("oak_natural", "normal", "1k"), "assets/materials/oak_natural/normal_1k.webp");
  assert.equal(materialUrl("oak_natural", "orm", "2k"), "assets/materials/oak_natural/orm_1k.webp");
  assert.deepEqual(materialFiles("x").sort(), [
    "assets/materials/x/color_1k.webp", "assets/materials/x/color_2k.webp",
    "assets/materials/x/normal_1k.webp", "assets/materials/x/normal_2k.webp",
    "assets/materials/x/orm_1k.webp", "assets/materials/x/thumb.webp",
  ]);
});

test("the Codex prompt states scale, seamlessness and neutral tint for details", () => {
  const p = codexPrompt(materialById("floor_wood"));
  assert.match(p, /200 x 200 cm/);
  assert.match(p, /seamless tileable/);
  assert.match(p, /orthographic/);
  assert.doesNotMatch(p, /multiplies this image/);
  assert.match(codexPrompt(materialById("detail_linen")), /multiplies this image/);
});

test("anti-tiling is only for patternless materials", () => {
  assert.ok(isOrganic("calacatta_gold"));
  assert.ok(isOrganic("ground_lawn"));
  assert.equal(isOrganic("subway_white"), false);
  assert.equal(isOrganic("floor_wood"), false);
  assert.equal(isOrganic("herringbone_parquet"), false);
  for (const m of MATERIALS) if (isOrganic(m.id)) assert.ok(materialById(m.id), m.id);
});

test("device tier: 2k on desktop, 1k on touch, small-screen or low-memory devices", () => {
  assert.equal(pickMaterialTier({}), "2k");
  assert.equal(pickMaterialTier({ deviceMemory: 16, minScreen: 1080 }), "2k");
  assert.equal(pickMaterialTier({ coarse: true }), "1k");
  // window width is not a device property: a narrow desktop window stays 2k
  assert.equal(pickMaterialTier({ posture: "sheet-drawers", minScreen: 1440 }), "2k");
  assert.equal(pickMaterialTier({ deviceMemory: 4 }), "1k");
  assert.equal(pickMaterialTier({ minScreen: 390 }), "1k");
  assert.equal(pickMaterialTier({ coarse: true, override: "2k" }), "2k");
  assert.equal(pickMaterialTier({ override: "1k" }), "1k");
  assert.equal(pickMaterialTier({ override: "4k" }), "2k");
  // a CPU rasteriser decodes and uploads every map itself
  assert.equal(pickMaterialTier({ software: true, deviceMemory: 32, minScreen: 1440 }), "1k");
  assert.equal(pickMaterialTier({ software: true, override: "2k" }), "2k");
});

test("every baked material folder is complete", () => {
  let baked = 0;
  for (const m of MATERIALS) {
    if (!existsSync(join(root, "assets", "materials", m.id))) continue;
    baked++;
    for (const f of materialFiles(m.id)) assert.ok(existsSync(join(root, f)), f);
  }
  assert.ok(baked >= 0);
});

test("software rasterisers are recognised by their WebGL renderer name", () => {
  for (const n of ["ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)", "llvmpipe (LLVM 15.0.7, 256 bits)", "Microsoft Basic Render Driver"])
    assert.equal(isSoftwareRendererName(n), true, n);
  for (const n of ["ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)", "Apple M2", "Adreno (TM) 740", ""])
    assert.equal(isSoftwareRendererName(n), false, n);
});

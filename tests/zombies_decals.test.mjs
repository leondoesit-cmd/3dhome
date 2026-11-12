import { moduleSource } from "./helpers/module_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const world = moduleSource("js/zombies_world.js");
const game = moduleSource("js/zombies_game.js");

test("zombie hits attach one articulated wound instead of a second world-space card", () => {
  assert.match(world, /var wound = addSurfaceDecal\(anchor, point, dir, size, "wound"/);
  assert.doesNotMatch(game, /damageZed\(h\.zed[\s\S]{0,260}\bdecal\(h\.point/);
});

test("wall and blood marks use lit irregular carriers with cut alpha edges", () => {
  assert.match(world, /function organicDecalGeometry\(seed, points\)/);
  assert.match(world, /new THREE\.MeshStandardMaterial\(\{\s*map: TEX\.blood/);
  assert.match(world, /alphaTest:\s*0\.045/);
  assert.match(world, /new THREE\.Mesh\(organicDecalGeometry\(q \+ 101, 13\), imat\)/);
  assert.match(world, /n\.x \* 0\.08/);
});

test("new hit textures are RGBA production assets", async () => {
  const names = [
    "fx_wound_entry_v2.png",
    "fx_wound_graze_v2.png",
    "fx_blood_spatter_v2.png",
    "fx_tear_v2.png",
  ];
  for (const name of names) {
    const png = await readFile(new URL("../assets/textures/" + name, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG", name);
    assert.equal(png[25], 6, `${name} must retain an RGBA alpha channel`);
    assert.ok(png.length > 100_000, `${name} should not be an empty placeholder`);
  }
});

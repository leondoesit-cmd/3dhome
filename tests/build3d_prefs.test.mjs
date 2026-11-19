/* The 3D build-preview setting (js/build3d_prefs.js): parse, clamp, defaults
   and the guarded storage round trip. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILD3D_PREFS_KEY, DEFAULT_BUILD3D_PREFS, OPACITY_MAX, OPACITY_MIN,
  clampOpacity, loadBuild3dPrefs, parseBuild3dPrefs, parseMode, saveBuild3dPrefs,
} from "../js/build3d_prefs.js";

function memory(initial) {
  const map = new Map(initial ? Object.entries(initial) : []);
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test("defaults: transparent ghosts at 0.45", () => {
  assert.deepEqual(DEFAULT_BUILD3D_PREFS, { mode: "ghost", opacity: 0.45 });
  assert.deepEqual(parseBuild3dPrefs(null), { mode: "ghost", opacity: 0.45 });
  assert.deepEqual(loadBuild3dPrefs(memory()), { mode: "ghost", opacity: 0.45 });
});

test("opacity is clamped to 0.15–0.9 and junk falls back to the default", () => {
  assert.equal(clampOpacity(0.05), OPACITY_MIN);
  assert.equal(clampOpacity(2), OPACITY_MAX);
  assert.equal(clampOpacity("0.6"), 0.6);
  assert.equal(clampOpacity(0.333333), 0.33);
  for (const junk of [NaN, "abc", "", undefined, null, {}, Infinity]) assert.equal(clampOpacity(junk), 0.45, String(junk));
});

test("mode is one of ghost / solid / outline", () => {
  assert.equal(parseMode("solid"), "solid");
  assert.equal(parseMode("outline"), "outline");
  assert.equal(parseMode("wireframe"), "ghost");
  assert.equal(parseMode(undefined), "ghost");
});

test("stored values parse from JSON text or objects; junk keeps the defaults", () => {
  assert.deepEqual(parseBuild3dPrefs('{"mode":"solid","opacity":0.7}'), { mode: "solid", opacity: 0.7 });
  assert.deepEqual(parseBuild3dPrefs({ mode: "outline" }), { mode: "outline", opacity: 0.45 });
  assert.deepEqual(parseBuild3dPrefs("{not json"), DEFAULT_BUILD3D_PREFS);
  assert.deepEqual(parseBuild3dPrefs("[1,2]"), DEFAULT_BUILD3D_PREFS);
  assert.deepEqual(parseBuild3dPrefs({ mode: 3, opacity: 99 }), { mode: "ghost", opacity: OPACITY_MAX });
});

test("save and load round-trip under mf_build3d_preview; a throwing store is survived", () => {
  const store = memory();
  assert.deepEqual(saveBuild3dPrefs({ mode: "solid", opacity: 0.1 }, store), { mode: "solid", opacity: OPACITY_MIN });
  assert.equal(BUILD3D_PREFS_KEY, "mf_build3d_preview");
  assert.ok(store.map.has("mf_build3d_preview"));
  assert.deepEqual(loadBuild3dPrefs(store), { mode: "solid", opacity: OPACITY_MIN });
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadBuild3dPrefs(broken), DEFAULT_BUILD3D_PREFS);
  assert.deepEqual(saveBuild3dPrefs({ mode: "outline" }, broken), { mode: "outline", opacity: 0.45 });
});

test("see-through wall opacity is its own clamped, stored setting", async () => {
  const m = await import("../js/build3d_prefs.js");
  assert.equal(m.clampWallOpacity(null), m.DEFAULT_WALL_OPACITY);
  assert.equal(m.clampWallOpacity("junk"), m.DEFAULT_WALL_OPACITY);
  assert.equal(m.clampWallOpacity(5), m.WALL_OPACITY_MAX);
  assert.equal(m.clampWallOpacity(0), m.WALL_OPACITY_MIN);
  const data = {};
  const store = { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  assert.equal(m.setWallXrayOpacity(0.4, store), 0.4);
  assert.equal(data[m.WALL_OPACITY_KEY], "0.4");
  assert.equal(m.wallXrayOpacity(store), 0.4);
});

import { stylesSource } from "./helpers/styles_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ICON_SEMANTIC_NAMES, ICON_THEME_IDS, ICON_THEME_ASSETS, loadIconTheme } from "../js/icon_theme_assets.js";

// Each language is now its own module (js/icon_themes/<id>.js) so a browser
// downloads only the one it draws with; loadIconTheme() fills ICON_THEME_ASSETS.
// These tests want all ten at once, so they ask for all ten.
await Promise.all(ICON_THEME_IDS.map(loadIconTheme));

const root = new URL("../", import.meta.url);
const iconSettings = await readFile(new URL("js/icon_settings.js", root), "utf8");
const appCss = stylesSource();
const indexHtml = await readFile(new URL("index.html", root), "utf8");
const report = JSON.parse(await readFile(new URL("tools/icon_theme_mapping_report.json", root), "utf8"));

const languages = ["lucide", "material", "mdi", "tabler", "huge", "cyber", "duotone", "retro", "brutalist", "sketch"];

test("ten independent SVG icon languages are wired through bootstrap and settings", () => {
  assert.deepEqual(Object.keys(ICON_THEME_ASSETS), languages);
  for (const id of languages) {
    assert.match(iconSettings, new RegExp(`id: "${id}"`), `${id} is listed in settings`);
    assert.match(appCss, new RegExp(`icon-theme-card\\[data-theme="${id}"\\]`), `${id} has an art-direction card`);
    assert.match(indexHtml, new RegExp(`"${id}"`), `${id} is accepted before first paint`);
  }
  assert.match(iconSettings, /<svg viewBox=/, "runtime emits SVG rather than swapping font weight");
  assert.match(appCss, /icon-svg-rendered::before\s*\{\s*content:\s*none/, "font fallback is hidden after SVG render");
});

test("every ModelForge semantic icon has a real asset in every language", () => {
  assert.equal(ICON_SEMANTIC_NAMES.length, 316);
  for (const semantic of ICON_SEMANTIC_NAMES) {
    for (const id of languages) {
      const theme = ICON_THEME_ASSETS[id];
      const assetName = theme.map[semantic];
      const asset = theme.icons[assetName];
      assert.ok(assetName, `${semantic} maps in ${id}`);
      assert.ok(asset && asset.body && asset.width && asset.height, `${semantic} has complete SVG data in ${id}`);
      assert.match(asset.body, /<(path|g|circle|rect|polygon|line|ellipse)\b/, `${semantic} contains vector geometry in ${id}`);
    }
  }
});

test("the ten choices are geometrically different, not color or weight variants", () => {
  let allTenDifferent = 0;
  for (const semantic of ICON_SEMANTIC_NAMES) {
    const geometries = languages.map((id) => {
      const theme = ICON_THEME_ASSETS[id];
      return theme.icons[theme.map[semantic]].body;
    });
    const distinct = new Set(geometries).size;
    assert.equal(distinct, 10, `${semantic} has ten distinct geometries`);
    if (distinct === 10) allTenDifferent += 1;
  }
  assert.equal(allTenDifferent, ICON_SEMANTIC_NAMES.length, "every icon has ten distinct geometries");
});

test("mapping report contains no generic fallback icons", () => {
  for (const id of languages) {
    assert.equal(report[id].quality.fallback, 0, `${id} has no generic fallback`);
    assert.equal(report[id].quality.direct + report[id].quality.fuzzy, ICON_SEMANTIC_NAMES.length);
  }
});

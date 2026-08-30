import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const interaction = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
const chrome = await readFile(new URL("../js/planner_chrome.js", import.meta.url), "utf8");
const api = await readFile(new URL("../js/furniture_api.js", import.meta.url), "utf8");

test("modern chrome keeps games, modeler and classic layout in the More menu", () => {
  assert.match(html, /id="moreMenu"/);
  assert.match(html, /data-act="openModeler"/);
  assert.match(html, /data-act="walk"/);
  assert.match(html, /data-act="rc"/);
  assert.match(html, /data-act="zombies"/);
  assert.match(html, /data-act="lava"/);
  assert.match(html, /data-act="toggleLegacy"/);
  assert.match(html, /data-act="openTextureGallery"/);
  assert.match(html, /data-act="autoGenerate"/);
  assert.match(html, /class="modeler-launch legacy-chrome"/);
  assert.match(html, /id="walkBtn" class="legacy-chrome"/);
});

test("the rectangle-room tool is on the plan toolbar and committed as four walls", () => {
  assert.match(html, /data-tool="rect"/);
  assert.match(interaction, /function commitRectFromTo\(a, b\)/);
  assert.match(interaction, /executeCommand\(roomCreateCommand/);
  assert.match(interaction, /materializeWall: materializePlannerWall/);
  assert.match(interaction, /else if \(e\.key === "8"\) setTool\("rect"\)/);
});

test("classic layout is a persisted toggle next to the extra tools", () => {
  assert.match(chrome, /home3d_ui/);
  assert.match(chrome, /function toggleLegacyUI\(/);
  assert.match(html, /data-ui", ui === "legacy" \? "legacy" : "modern"/);
});

test("a blank plan helper clears walls, items and openings", () => {
  assert.match(api, /export function emptyScene\(\)/);
  assert.match(api, /S\.walls = \[\]/);
  assert.match(api, /S\.items = \[\]/);
  assert.match(api, /S\.openings = \[\]/);
});

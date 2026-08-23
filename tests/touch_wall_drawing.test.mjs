import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { touchEffectiveOffsetY, TOUCH_DRAW_OFFSET_PX } from "../js/wall_draw.js";

const interactionSource = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
const plan2dSource = await readFile(new URL("../js/plan2d.js", import.meta.url), "utf8");
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("touchEffectiveOffsetY: mouse and non-touch pointers have zero offset", () => {
  assert.equal(touchEffectiveOffsetY(100, "mouse", "wall", null), 100);
  assert.equal(touchEffectiveOffsetY(250, "pen", "wall", null), 250);
  assert.equal(touchEffectiveOffsetY(300, "", "wall", null), 300);
});

test("touchEffectiveOffsetY: non-drawing tools have zero offset even with touch", () => {
  assert.equal(touchEffectiveOffsetY(100, "touch", "select", null), 100);
  assert.equal(touchEffectiveOffsetY(200, "touch", "erase", null), 200);
  assert.equal(touchEffectiveOffsetY(300, "touch", "door", null), 300);
});

test("touchEffectiveOffsetY: wall drawing tools apply ~52px offset above finger contact point", () => {
  const drawTools = ["wall", "arcwall", "rect", "slabvoid", "roomDivider"];
  drawTools.forEach((tool) => {
    assert.equal(touchEffectiveOffsetY(200, "touch", tool, null), 200 - TOUCH_DRAW_OFFSET_PX);
  });
});

test("touchEffectiveOffsetY: moving existing walls and nodes does not jump", () => {
  assert.equal(touchEffectiveOffsetY(150, "touch", "select", "node"), 150);
  assert.equal(touchEffectiveOffsetY(180, "touch", "select", "wall"), 180);
  assert.equal(touchEffectiveOffsetY(200, "touch", "walloffset", null), 200);
});

test("touchEffectiveOffsetY: clamps smoothly near canvas top edge", () => {
  // At oy=30, max offset is 30 - 12 = 18px -> effOy = 12
  assert.equal(touchEffectiveOffsetY(30, "touch", "wall", null), 12);
  // At oy=5, offset is 0 -> effOy = 5
  assert.equal(touchEffectiveOffsetY(5, "touch", "wall", null), 5);
});

test("planner: touchContact and drawTouchGuide are wired in interaction.js and plan2d.js", () => {
  assert.match(interactionSource, /S\.touchContact = \{ ox: ox, oy: oy, effOy: effOy, pointerId: e\.pointerId \};/);
  assert.match(interactionSource, /S\.touchContact = \{ ox: e\.offsetX, oy: e\.offsetY, effOy: effOy, pointerId: e\.pointerId \};/);
  assert.match(interactionSource, /S\.touchContact = null;/);
  assert.match(plan2dSource, /function drawTouchGuide\(\)/);
  assert.match(plan2dSource, /drawTouchGuide\(\);/);
});

test("modeler: sheet.tall expands to full height when hosting panels", () => {
  assert.match(css, /body\.compact-nav #md-sheet\.tall:\s*has\(\.md-sheet-host > \*\)\s*\{\s*height:\s*calc\(100% - 48px\) !important;/);
  assert.match(css, /body\.compact-nav #md-sheet\.tall\s*\{\s*height:\s*calc\(100% - 48px\) !important;/);
});

test("modeler: context bar and selection bar scroll horizontally on narrow screens", () => {
  assert.match(css, /body\.compact-nav #md-ctx\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.match(css, /body\.compact-nav #md-selection-bar:not\(\[hidden\]\)\s*\{[\s\S]*?overflow-x:\s*auto;/);
});

test("modeler: command grid supports 2 columns on folded/narrow mobile screens", () => {
  assert.match(css, /#modeler \.md-commandmanager\.md-borrowed \.md-command-items\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width:\s*360px\)\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
});

test("fold cover: planner labels and all modeler command tabs remain visible", () => {
  assert.doesNotMatch(css, /body\.compact-nav #mobile-nav button span,\s*#cabdes/);
  assert.match(css, /body\.compact-nav #mobile-nav button span\s*\{[\s\S]*?display:\s*block;/);
  assert.match(css, /#modeler \.md-commandmanager\.md-borrowed \.md-command-tabs > \[data-cmdtab\]\s*\{\s*flex:\s*1 1 25%;/);
});

test("planner: narrow CAD instruction clears the top plan controls", () => {
  assert.match(css, /@media \(max-width:\s*480px\)\s*\{[\s\S]*?body\.compact-nav #cad-status\s*\{[\s\S]*?top:\s*108px;/);
});

test("modeler: expanded height does not carry over to the next sheet", async () => {
  const src = await readFile(new URL("../js/modeler_mobile.js", import.meta.url), "utf8");
  // showSheet() clears the tall state before building the new panel
  assert.match(src, /release\(\);\n(?:\s*\/\*[\s\S]*?\*\/\n)?\s*setSheetTall\(false\);/);
  assert.match(src, /function setSheetTall\(on\) \{[\s\S]*?sheet\.classList\.toggle\("tall", !!on\);/);
});

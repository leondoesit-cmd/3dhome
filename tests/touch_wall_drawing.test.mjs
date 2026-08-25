import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const interactionSource = await readFile(new URL("../js/interaction.js", import.meta.url), "utf8");
const plan2dSource = await readFile(new URL("../js/plan2d.js", import.meta.url), "utf8");
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("planner: touchContact and drawTouchGuide are wired in interaction.js and plan2d.js", () => {
  assert.match(interactionSource, /S\.touchContact = beginTouchPrecision\(e, ox, oy, bounds, kind\);/);
  assert.match(interactionSource, /updateTouchPrecision\(S\.touchContact, ox, oy\);/);
  assert.match(interactionSource, /touchPrecisionPoint\(S\.touchContact, ox, oy\);/);
  assert.match(interactionSource, /S\.touchContact = null;/);
  assert.match(plan2dSource, /function drawTouchGuide\(\)/);
  assert.match(plan2dSource, /drawTouchPrecisionLens\(pc, plan, tc,/);
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

test("planner: one readout card accompanies the direct touch point", () => {
  assert.match(plan2dSource, /function touchDrawReadout\(\)/);
  assert.match(plan2dSource, /function drawTouchReadout\(ox, oy\)/);
  // anchored above the draw point, flipped below it only when the top is tight
  assert.match(plan2dSource, /var top = oy - 16 - h;\n\s*if \(top < topReservedPx\(\) \+ 6\) top = oy \+ 16;/);
  // the DOM instruction bar paints over the canvas — the card dodges it
  assert.match(plan2dSource, /function topReservedPx\(\)/);
  assert.match(plan2dSource, /drawTouchReadout\(ox, oy\);/);
  assert.doesNotMatch(plan2dSource, /if \(lifted\) drawTouchReadout/);
});

test("planner: the on-geometry copies stand down while a finger draws", async () => {
  const wallDrawSource = await readFile(new URL("../js/wall_draw.js", import.meta.url), "utf8");
  const hudSource = await readFile(new URL("../js/cad_hud.js", import.meta.url), "utf8");
  assert.match(wallDrawSource, /export function touchDrawing\(\)/);
  // the status bar drops its duplicate of the same three numbers
  assert.match(hudSource, /if \(touchDrawing\(\)\) main = "";/);
  // wall length/angle, parallel offset, close-loop, arc and rect labels
  const guarded = plan2dSource.match(/!touchDrawing\(\)/g) || [];
  assert.ok(guarded.length >= 5, `expected 5+ guarded labels, got ${guarded.length}`);
});

import { stylesSource } from "./helpers/styles_source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const interactionSource = moduleSource("js/interaction.js");
const plan2dSource = (moduleSource("js/plan2d.js")).replace(/\r\n/g,"\n");
const css = stylesSource();

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

test("modeler: the context bar wraps instead of scrolling, and reserves its real height", () => {
  // It used to scroll sideways, which hid Sweep and Loft past the right edge
  // of a 375px phone. It now wraps to a second and third row.
  const ctxRule = css.match(/body\.compact-nav #md-ctx \{[^}]*\}/)[0];
  assert.match(ctxRule, /flex-wrap:\s*wrap;/);
  assert.doesNotMatch(ctxRule, /overflow-x:\s*auto;/);
  // Stacked like an #md-nav slot.
  assert.match(css, /#md-ctx \.mctx-btn \{[\s\S]*?flex-direction:\s*column;/);
  // One fixed width, never grown. Sharing the row's spare width left the last,
  // half-empty row wider than the full row above it, so the rows stopped
  // reading as one grid. 0 0 is what keeps every verb identical on every row.
  const verbRule = css.match(/body\.compact-nav #md-ctx > \.mctx-btn:not\(\.mctx-icon-only\) \{[^}]*\}/)[0];
  assert.match(verbRule, /flex:\s*0 0 56px;/);
  assert.doesNotMatch(verbRule, /flex:\s*1 1/);
  // Undo/Redo are not modelling verbs. They used to take a full-width line of
  // this row; they now live at the trailing edge of the editor's .md-head, so
  // #md-ctx carries modelling verbs and nothing else.
  assert.doesNotMatch(css, /#md-ctx \.mctx-undo/);
  assert.match(css, /body\.compact-nav #modeler \.md-head-actions #mdUndo \{ order: 1; \}/);
  assert.match(css, /body\.compact-nav #modeler \.md-head-actions #mdClose \{ order: -1; \}/);
  // A wrapped row is taller than one line, so the height everything else
  // reserves against is measured in js/modeler_mobile.js, not assumed.
  assert.match(css, /body\.compact-nav\.md-open \{[\s\S]*?--m-ctx-block:\s*var\(--md-ctx-h, var\(--md-ctx-base\)\);/);
  // The selection bar is a single floating strip and still scrolls.
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
  const src = (await readFile(new URL("../js/modeler_mobile.js", import.meta.url), "utf8")).replace(/\r\n/g,"\n");
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

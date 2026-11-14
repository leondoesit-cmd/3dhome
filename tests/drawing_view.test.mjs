import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VIEW_MODES, viewModeOf } from "../js/view_modes.js";
import { zoomAbout, fitPage, sheetPageMm, MIN_ZOOM, MAX_ZOOM } from "../js/sheet_viewer.js";
import { wrapPlanSVG } from "../js/sheet_print.js";
import { draftingStandard } from "../js/drafting_standards.js";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const classes = (...names) => ({ contains: (n) => names.includes(n) });

test("the views are one group: Plan, 3D, Dollhouse, Split, Drawing", () => {
  assert.deepEqual(VIEW_MODES.map((m) => m.id), ["plan", "3d", "dollhouse", "split", "drawing"]);
  assert.deepEqual(VIEW_MODES.map((m) => m.act), ["viewPlan", "view3d", "viewDollhouse", "viewSplit", "viewDrawing"]);
  // the top bar carries every view as a button, in the same order
  const pill = /<div class="tb-pill modern-chrome" id="viewModePill"[\s\S]*?<\/div>/.exec(read("index.html"))[0];
  assert.deepEqual([...pill.matchAll(/data-view-mode="([^"]+)"/g)].map((m) => m[1]), VIEW_MODES.map((m) => m.id));
  for (const m of VIEW_MODES) assert.match(pill, new RegExp(`data-act="${m.act}"[^>]*data-view-mode="${m.id}"`));
  // every view action has its branch and its name in the view handler's Set
  const actions = read("js/ui/view_actions.js");
  for (const m of VIEW_MODES) {
    assert.match(actions, new RegExp(`"${m.act}"`), m.act);
    assert.match(actions, new RegExp(`act === "${m.act}"`), m.act);
  }
});

test("which view the work area is showing", () => {
  assert.equal(viewModeOf(classes("max-view-2d")), "plan");
  assert.equal(viewModeOf(classes("max-view-3d"), false), "3d");
  assert.equal(viewModeOf(classes("max-view-3d"), true), "dollhouse");
  assert.equal(viewModeOf(classes()), "split");
  assert.equal(viewModeOf(classes("max-view-2d", "sheet-view")), "drawing");
  assert.equal(viewModeOf(null), "split");
});

test("Drawing is a view of setViewMode, not a dialog", () => {
  const main = sourceFunctionText(moduleSource("js/main.js"), "setViewMode");
  assert.match(main, /mode === "drawing"/);
  assert.match(main, /classList\.add\("sheet-view"\)/);
  assert.match(main, /showDrawingView\(centerCanvas\)/);
  assert.match(main, /classList\.remove\("sheet-view"\)/);
  assert.match(main, /"drawing-view:leave"/);
  const view = read("js/ui_pro_drawing.js");
  assert.doesNotMatch(view, /createElement\("dialog"\)|showModal\(/);
  assert.match(sourceFunctionText(view, "openProDrawing"), /__setViewMode\("drawing"\)/);
  assert.match(sourceFunctionText(view, "hookOnce"), /addEventListener\("drawing-view:leave", hideDrawingView\)/);
  assert.match(read("js/pro_actions.js"), /proDrawing: \(\) => import\("\.\/ui_pro_drawing\.js"\)\.then\(\(m\) => m\.openProDrawing\(\)\)/);
});

test("zoom keeps the point under the pointer in place, and clamps", () => {
  const v = { zoom: 2, x: 30, y: -10 };
  const z = zoomAbout(v, 1.5, 200, 120);
  assert.equal(z.zoom, 3);
  // the paper point under (200, 120) before and after
  const before = [(200 - v.x) / v.zoom, (120 - v.y) / v.zoom], after = [(200 - z.x) / z.zoom, (120 - z.y) / z.zoom];
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9);
  assert.equal(zoomAbout(v, 1000, 0, 0).zoom, MAX_ZOOM);
  assert.equal(zoomAbout(v, 1e-6, 0, 0).zoom, MIN_ZOOM);
});

test("fit puts the whole page in the middle of the viewport", () => {
  const f = fitPage({ w: 420, h: 297 }, 1000, 600);
  assert.ok(420 * f.zoom <= 1000 && 297 * f.zoom <= 600);
  assert.ok(Math.abs(f.x * 2 + 420 * f.zoom - 1000) < 1e-9);
  assert.ok(Math.abs(f.y * 2 + 297 * f.zoom - 600) < 1e-9);
  // a tall narrow viewport (a phone) is limited by its width
  const p = fitPage({ w: 420, h: 297 }, 375, 700);
  assert.ok(Math.abs(420 * p.zoom - (375 - 2 * 24)) < 1e-9);
});

test("the page size comes from the sheet's own paper", () => {
  const svg = wrapPlanSVG("<line/>", { w: 1800, d: 1200 }, { standard: draftingStandard("de"), name: "x" });
  const page = sheetPageMm(svg);
  assert.ok(page.w > page.h && page.w >= 297, JSON.stringify(page));
  assert.deepEqual(sheetPageMm("<svg/>"), { w: 420, h: 297 });
});

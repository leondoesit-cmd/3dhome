import { stylesSource } from "./helpers/styles_source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fitTransform } from "../js/plan_view.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("plan framing refuses a zero-size viewport and recovers at a real size", () => {
  const bb = { minx: 0, minz: 0, maxx: 400, maxz: 300 };
  assert.equal(fitTransform(bb, 0, 0, { worldPad: 40, minSpan: 50 }), null);
  const tx = fitTransform(bb, 1000, 700, { worldPad: 40, minSpan: 50 });
  assert.ok(tx && tx.sc > 0);
  assert.ok(Number.isFinite(tx.ox) && Number.isFinite(tx.oy));
});

test("the first real canvas size repairs an invalid boot zoom", async () => {
  const src = await read("js/plan2d.js");
  assert.match(src, /if \(!fittingView && \(!\(S\.SC > 0\) \|\| !isFinite\(S\.SC\)\)\) fitView\(\)/);
  assert.match(src, /if \(!\(S\.CW > 0\) \|\| !\(S\.CH > 0\)\) return false/);
});

test("desktop plan navigation supports middle and Space drag panning", async () => {
  const src = moduleSource("js/interaction.js");
  assert.match(src, /e\.button === 1 \|\| \(spacePan && e\.button === 0\)/);
  assert.match(src, /e\.code !== "Space"/);
  assert.match(src, /plan\.classList\.add\("is-panning"\)/);
});

test("desktop split supports side-by-side, persistence, and divider reset", async () => {
  const [main, css, html] = await Promise.all([read("js/main.js"), stylesSource(), read("index.html")]);
  assert.match(main, /SPLIT_DIR_KEY = "home3d_splitdir"/);
  assert.match(main, /resizer\.addEventListener\("dblclick", function \(\) \{ setSplit\(50, true\); \}\)/);
  assert.match(css, /body\.split-side:not\(\.compact-nav\) #center-canvas/);
  assert.match(css, /\.split-orientation-btn\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /id="splitOrientationBtn"/);
});

test("catalog dragging shows a scaled footprint before drop", async () => {
  const [src, css] = await Promise.all([read("js/planner_chrome.js"), stylesSource()]);
  assert.match(src, /className = "furn-drop-ghost"/);
  assert.match(src, /Number\(f\.w \|\| 40\) \* S\.SC/);
  assert.match(css, /\.furn-drop-ghost/);
});

test("selection is mirrored into 3D without rebuilding shared materials", async () => {
  const [props, view] = await Promise.all([read("js/ui_props.js"), moduleSource("js/view3d.js")]);
  assert.match(props, /S\.repaint3D = true/);
  assert.match(view, /new THREE\.Box3Helper/);
  assert.match(view, /syncSelectionOutline\(\)/);
});

test("tree navigation frames rooms and items on double click", async () => {
  const src = await read("js/ui_tree.js");
  assert.match(src, /frameTreeTarget\(\{ kind: "room"/);
  assert.match(src, /frameTreeTarget\(\{ kind: "item"/);
  assert.match(src, /row\.ondblclick/);
});

test("confirmed localization and selected-hover contrast regressions stay fixed", async () => {
  const [props, css] = await Promise.all([read("js/ui_props.js"), stylesSource()]);
  assert.match(props, /roomTitle\.textContent = roomName\(r\.key\) \|\| t\("room"\)/);
  assert.match(css, /\.trRoom\.sel:hover,[\s\S]*background: linear-gradient\(135deg, var\(--accent\), var\(--accent-hover\)\)/);
});

test("wall options compact after drawing starts and cost actions remain sticky", async () => {
  const [interaction, ui, css, html] = await Promise.all([
    moduleSource("js/interaction.js"), read("js/ui.js"), stylesSource(), read("index.html"),
  ]);
  assert.match(interaction, /CustomEvent\("planner-draw-start"\)/);
  assert.match(ui, /pal\.classList\.add\("auto-collapsed"\)/);
  assert.match(css, /#plan-wall-palette\.auto-collapsed/);
  assert.match(css, /\.cost-actions \{[\s\S]*position: sticky/);
  assert.match(html, /class="cost-actions"/);
});

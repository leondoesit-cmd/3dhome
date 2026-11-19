import { stylesSource } from "./helpers/styles_source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { modelerSource } from "./helpers/modeler_source.mjs";
import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getTouchPrecisionMode,
  getTouchPrecisionPrefs,
  setTouchPrecisionPrefs,
} from "../js/touch_precision_ui.js";

const root = new URL("../", import.meta.url);
const [ui, settings, interaction, modeler, css, i18n] = await Promise.all([
  readFile(new URL("js/touch_precision_ui.js", root), "utf8"),
  readFile(new URL("js/ui_site.js", root), "utf8"),
  moduleSource("js/interaction.js"),
  modelerSource(),
  stylesSource(),
  readI18nSource(),
]);

test("touch Confirm commits typed coordinates before removing the focused field", () => {
  const body = ui.match(/confirm\.onclick=function\(\)\{([^}]+)\}/)?.[1];
  assert.ok(body, "native touch confirmation handler exists");
  const typed = { x: 6, y: 1 };
  let point = { x: 3.2, y: 2.7 };
  let committed;
  const confirm = Function("applyInputs", "finish", body).bind(null,
    () => { point = { ...typed }; },
    ok => { if (ok) committed = { ...point }; },
  );
  // No change or blur event is delivered before the user's Confirm click.
  confirm();
  assert.deepEqual(committed, typed);
});

test("touch precision preferences default to the direct loupe and sanitize tuning", () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
  };
  assert.equal(getTouchPrecisionMode(), "lens");
  setTouchPrecisionPrefs({ mode:"rough", refineRatio:8, portalZoom:99 });
  assert.deepEqual(getTouchPrecisionPrefs(), { mode:"rough", handedness:"right", refineRatio:8, portalZoom:6 });
  setTouchPrecisionPrefs({ mode:"unknown", refineRatio:3, portalZoom:1 });
  assert.deepEqual(getTouchPrecisionPrefs(), { mode:"lens", handedness:"right", refineRatio:4, portalZoom:3 });
  delete globalThis.localStorage;
});

test("direct loupe settings mirror around the dominant hand", () => {
  assert.match(ui, /touch_lens_hand/);
  assert.match(ui, /handedness:hand\.id/);
  assert.match(i18n, /touch_lens_hand_hint/);
});

test("settings expose three mutually exclusive touch precision systems", () => {
  assert.match(settings, /settings_touch_tab/);
  assert.match(settings, /buildTouchPrecisionSettings\(\)/);
  ["lens", "rough", "portal"].forEach((mode) => assert.match(ui, new RegExp(`id:"${mode}"`)));
  assert.match(ui, /input\.type = "radio"/);
  assert.match(i18n, /touch_mode_rough:[\s\S]*?Rough → Refine/);
  assert.match(i18n, /touch_mode_portal:[\s\S]*?פורטל דיוק/);
});

test("touch precision settings adapt to narrow sidebars without crushing cards", () => {
  assert.match(css, /#modeler #mdCons \.touch-mode-grid\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /#modeler #mdCons \.touch-mode-card/);
  assert.match(css, /@container \(max-width:\s*580px\)/);
  assert.match(css, /\.touch-mode-copy small\s*\{[\s\S]*?overflow-wrap:\s*break-word/);
});

test("rough/refine has relative motion, exact fields, locks, snaps, confirm and cancel", () => {
  assert.match(ui, /dragRelative\(surface,state\.ratio\)/);
  assert.match(ui, /input\.type = "number"/);
  assert.match(ui, /touch_lock_horizontal/);
  assert.match(ui, /touch_snap_prev/);
  assert.match(ui, /dispatchPrecisionCommit/);
  assert.match(ui, /if\(ok\)\{if\(options\.onConfirm\)/);
});

test("portal composites model and sketch canvases and supports micro-drag and X-ray", () => {
  assert.match(ui, /dragRelative\(portalCanvas,state\.zoom\)/);
  assert.match(ui, /var sources=options\.sourceCanvases/);
  assert.match(ui, /ctx\.drawImage\(source/);
  assert.match(modeler, /sources\.push\(E\.pv\.rr\.domElement\)/);
  assert.match(modeler, /onXray:function\(on\)\{setModelDisplay\(on\?"transparent":previousDisplay\)/);
  assert.match(css, /@media \(min-width:700px\) and \(pointer:coarse\)/);
});

test("both editors intercept only touch creation and leave lens mode on the old direct path", () => {
  assert.match(interaction, /e\.pointerType === "touch" && planTouchPrecisionKind\(S\.tool, S\.placeType\)/);
  assert.match(interaction, /if \(mode === "lens"\) return false/);
  assert.match(modeler, /e\.pointerType === "touch" && precisionKind[\s\S]*?trialMode !== "lens"/);
  assert.match(interaction, /touchPrecisionTrialOwns\(e\.pointerId\)/);
  assert.match(modeler, /touchPrecisionTrialOwns\(e\.pointerId\)/);
});

test("direct model primitives refine both endpoints instead of committing a zero-size drag", () => {
  assert.match(modeler, /var directDragTool = E\.tool === "rect"[\s\S]*?E\.tool === "cutc"/);
  assert.match(modeler, /if\(finishingDirectDrag\)\{dispatchPrecisionMove\(cv,point\);dispatchPrecisionUp\(cv,point\);\}/);
  assert.match(modeler, /else dispatchPrecisionDown\(cv,point\)/);
});

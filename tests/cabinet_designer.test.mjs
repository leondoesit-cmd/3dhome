import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

const chrome = await readFile(new URL("../js/ui_cabinet.js", import.meta.url), "utf8");
const view = await readFile(new URL("../js/ui_cabinet_view.js", import.meta.url), "utf8");
const inspect = await readFile(new URL("../js/ui_cabinet_inspect.js", import.meta.url), "utf8");
const ctx = await readFile(new URL("../js/ui_cabinet_ctx.js", import.meta.url), "utf8");
const ui = [chrome, view, inspect, ctx].join("\n");
const adapter = await readFile(new URL("../js/parametric_cabinet.js", import.meta.url), "utf8");
const planner = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const i18n = await readI18nSource();
const presets = await readFile(new URL("../js/cabinet_presets.js", import.meta.url), "utf8");
const engine = await readFile(new URL("../js/cabinet.js", import.meta.url), "utf8");

test("cabinet modules export the symbols chrome imports, not comment-trapped ones", async () => {
  const { formatCm, row, AXES } = await import("../js/ui_cabinet_ctx.js");
  assert.equal(typeof formatCm, "function");
  assert.equal(formatCm(12.34), "12.3");
  assert.equal(typeof row, "function");
  assert.ok(AXES.front);

  const inspectLive = inspect.replace(/\/\*[\s\S]*?\*\//g, "");
  const ctxLive = ctx.replace(/\/\*[\s\S]*?\*\//g, "");
  const viewLive = view.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const name of ["fillHits", "applySearch", "fillFamilies", "fillPresets", "startBlank", "fillInspector", "splitSection", "delSection", "splitColumn", "dupColumn", "delColumn", "fillLook", "fillTechnical", "fillChecks", "saveUserPreset", "fillMine", "fillHardware", "fillBOM", "exportBOM", "refillColumn"]) {
    assert.match(inspectLive, new RegExp("export function " + name + "\\("));
  }
  for (const name of ["formatCm", "row", "numInput", "select", "checkbox"]) {
    assert.match(ctxLive, new RegExp("export function " + name + "\\("));
  }
  for (const name of ["sizeCanvas", "setMode", "setAxis", "syncHint", "syncViewPreferences", "draw", "wireCanvas", "setTool", "exportPNG", "initPreview", "updatePreview", "renderPreview"]) {
    assert.match(viewLive, new RegExp("export function " + name + "\\("));
  }
});

test("overall size edits go through the parametric cabinet dimension request", () => {
  assert.match(chrome, /import \{\s*CAB_LIMITS, syncCabinetDefinition, requestCabinetDimension, applyCabinetDimension,/);
  assert.match(chrome, /function applyOverallSize\(dimension, input\)/);
  assert.match(chrome, /requestCabinetDimension\(E\.it, dimension, value, ceilingHeight\(\)\)/);
  assert.match(chrome, /applyCabinetDimension\(S, E\.it, result, alternativeId\)/);
  assert.match(chrome, /function showSizeProposal\(/);
  assert.match(chrome, /id="cbSizeDlg"/);
  assert.doesNotMatch(ui, /dim\.min = 20/);
  assert.doesNotMatch(chrome, /E\.it\[k\.toLowerCase\(\)\] = v/);
});

test("shared cabinet envelope limits match the catalogue ranges", () => {
  assert.match(adapter, /export const CAB_LIMITS = \{/);
  assert.match(adapter, /width: \{ field: "w", min: STD\.minCol, max: 600 \}/);
  assert.match(adapter, /depth: \{ field: "d", min: 20, max: 120 \}/);
  assert.match(adapter, /height: \{ field: "h", min: 30, max: 350 \}/);
  assert.match(adapter, /const limit = CAB_LIMITS\[dimension\]/);
  assert.match(adapter, /he\("המידה מחוץ לטווח מערכת הארונות"/);
});

test("composition keeps layout controls and defers manufacturing to Technical", () => {
  assert.match(inspect, /wrap\.appendChild\(el\("div", "cb-note", T\("techHint"\)\)\)/);
  assert.match(inspect, /setLevel\("technical"\)/);
  assert.match(inspect, /T\("shelfBoard"\)/);
  assert.match(inspect, /T\("plinthRecessed"\)/);
  const inspector = inspect.slice(inspect.indexOf("function fillInspector"), inspect.indexOf("function fillTechnical"));
  assert.match(inspector, /T\("carcassMode"\)/);
  assert.match(inspector, /T\("elev"\)/);
  assert.doesNotMatch(inspector, /row\(T\("panel"/);
  assert.doesNotMatch(inspector, /row\(T\("gap"/);
  const technical = inspect.slice(inspect.indexOf("function fillTechnical"), inspect.indexOf("function fillChecks"));
  assert.match(technical, /row\(T\("panel"/);
  assert.match(technical, /row\(T\("gap"/);
  assert.match(technical, /row\(T\("plinthType"/);
});

test("partition tools have keyboard shortcuts that do not steal paste", () => {
  assert.match(ui, /aria-keyshortcuts="V"/);
  assert.match(ui, /aria-keyshortcuts="H"/);
  assert.match(ui, /aria-keyshortcuts="X"/);
  assert.match(chrome, /if \(toolKey === "v"\)/);
  assert.match(chrome, /if \(toolKey === "x"\)/);
  assert.match(chrome, /if \(\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "v"\) return pasteColumn\(\)/);
  assert.match(chrome, /if \(!e\.ctrlKey && !e\.metaKey && !e\.altKey\)/);
  assert.match(chrome, /if \(!E\.sel\) E\.sel = \{ col: 0, sec: 0 \}/);
  assert.match(chrome, /if \(isSizeDlgOpen\(\)\)/);
});

test("PNG export redraws the front elevation even from the 3D workspace", () => {
  const png = view.slice(view.indexOf("function exportPNG"), view.indexOf("function initPreview"));
  assert.match(png, /if \(restoreMode === "3d" \|\| restoreAxis !== "front"\) setAxis\("front"\)/);
  assert.match(png, /sizeCanvas\(\)/);
  assert.match(png, /draw\(\)/);
  assert.match(png, /if \(restoreMode === "3d"\) setMode\("3d"\)/);
});

test("finish and hardware edits name themselves in designer history", () => {
  assert.match(inspect, /act\(T\("opLook"\)\)/);
  assert.match(inspect, /act\(T\("opHw"\) \+ " · " \+ label\)/);
  assert.match(inspect, /act\(T\("opHw"\)\); hw\.led = v/);
});

test("family chips show a compact name under the icon", () => {
  assert.match(inspect, /cb-chip-name/);
  assert.match(inspect, /famShort\(k\)/);
});

test("planner smart-dimension chrome is bilingual", () => {
  assert.match(i18n, /cfg_required: "נדרשת חלוקה חדשה"/);
  assert.match(i18n, /cfg_required: "Configuration required"/);
  assert.match(i18n, /cfg_keep_size: "Keep current size"/);
  assert.match(i18n, /cfg_choose: "Choose a valid configuration\."/);
  assert.match(planner, /t\("cfg_required"\)/);
  assert.match(planner, /t\("cfg_keep_size"\)/);
  assert.match(planner, /t\("cfg_choose"\)/);
  assert.doesNotMatch(planner, /Keep current size/);
});

test("user presets are stored on the spatial project, not localStorage", () => {
  assert.match(presets, /spatial\.cabinetPresets/);
  assert.match(presets, /touchSpatialProject/);
  assert.doesNotMatch(presets, /localStorage\.setItem\(LS_CAB_PRESETS/);
  assert.match(planner, /cabinetPresets:d\.spatial\.cabinetPresets/);
  assert.match(planner, /S\.spatial\.cabinetPresets/);
});

test("paste re-tags duplicate hid values in normalizeSpec rather than skipping them", () => {
  /* normalizeSpec is where every paste lands, so that is where the re-tagging
     has to happen — asserted on the code, since the comment saying so would
     satisfy a text match all by itself. */
  const spec = stripComments(engine).slice(engine.indexOf("export function normalizeSpec"));
  assert.match(spec, /tagParts\(sp\);/, "every normalize re-tags");
  const tag = stripComments(engine).slice(engine.indexOf("function tagParts"), engine.indexOf("export function normalizeSpec"));
  assert.doesNotMatch(tag, /splice\(|\.filter\(/, "a duplicate is re-tagged, never dropped");
  assert.match(tag, /dup\.push\(o\)/);
  assert.match(tag, /o\.hid = id/);
});

test("applyData keeps the modular cabinet spec on the item whitelist", () => {
  assert.match(planner, /cab: it\.cab && typeof it\.cab === "object" \? it\.cab : undefined/);
});

test("cabinet number inputs preserve focus on Enter instead of calling blur()", () => {
  assert.match(chrome, /dim\.addEventListener\("keydown",\s*function\s*\(e\)\s*\{/);
  assert.match(chrome, /if\s*\(e\.key\s*===\s*"Enter"\)\s*\{[\s\S]*?applyOverallSize[\s\S]*?this\.select\(\);/);
  assert.doesNotMatch(chrome, /dim\.addEventListener\("keydown",\s*function\s*\(e\)\s*\{[\s\S]*?this\.blur\(\);/);

  assert.match(ctx, /i\.addEventListener\("keydown",\s*function\s*\(e\)\s*\{/);
  assert.match(ctx, /if\s*\(e\.key\s*===\s*"Enter"\)\s*\{[\s\S]*?commit\(\);[\s\S]*?i\.select\(\);/);

  assert.match(inspect, /function withFocusPreserved\(wrap,\s*renderFn\)/);
  assert.match(inspect, /withFocusPreserved\(wrap,\s*function\s*\(\)\s*\{/);
});

test("empty column and 0-shelf/0-drawer hardening in cabinet layout", async () => {
  const { layoutCab } = await import("../js/cabinet.js");

  // Cabinet item with a zero-width column and an empty-secs column
  const itemZeroCol = {
    type: "wardrobe",
    w: 120, h: 200, d: 60,
    cab: {
      fam: "wardrobe",
      plinth: 8,
      panel: 1.8,
      cols: [
        { w: 0, secs: [{ t: "shelves", n: 0, h: 100 }], door: { t: "none" } },
        { w: 60, secs: [], door: { t: "none" } },
        { w: 60, secs: [{ t: "drawers", n: 0, h: 100 }], door: { t: "none" } },
      ],
    },
  };

  const layout = layoutCab(itemZeroCol);
  assert.ok(layout, "layoutCab returns a layout");
  assert.equal(layout.cols.length, 3, "preserves 3 column metadata entries");

  // Verify all parts have finite positive non-zero dimensions and no NaNs
  layout.parts.forEach((p, idx) => {
    if (p.k === "box") {
      assert.ok(Number.isFinite(p.x0) && Number.isFinite(p.x1), `part ${idx} x is finite`);
      assert.ok(Number.isFinite(p.y0) && Number.isFinite(p.y1), `part ${idx} y is finite`);
      assert.ok(Number.isFinite(p.z0) && Number.isFinite(p.z1), `part ${idx} z is finite`);
      assert.ok(Math.abs(p.x1 - p.x0) > 1e-4, `part ${idx} has non-zero width`);
      assert.ok(Math.abs(p.y1 - p.y0) > 1e-4, `part ${idx} has non-zero height`);
      assert.ok(Math.abs(p.z1 - p.z0) > 1e-4, `part ${idx} has non-zero depth`);
    }
  });

  // Verify column 0 (0 width) has 0 shelves
  const col0Sec = layout.cols[0].secs[0];
  assert.equal(col0Sec.shelves, 0, "0-shelf section creates 0 shelves");

  // Verify column 2 (0 drawers) creates 0 drawer fronts / drawer parts
  const col2Drawers = layout.parts.filter(p => p.role === "drawerFront" || p.role === "drawerBox");
  assert.equal(col2Drawers.length, 0, "0-drawer section creates 0 drawer parts");
});


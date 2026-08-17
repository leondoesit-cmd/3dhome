import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chrome = await readFile(new URL("../js/ui_cabinet.js", import.meta.url), "utf8");
const view = await readFile(new URL("../js/ui_cabinet_view.js", import.meta.url), "utf8");
const inspect = await readFile(new URL("../js/ui_cabinet_inspect.js", import.meta.url), "utf8");
const ctx = await readFile(new URL("../js/ui_cabinet_ctx.js", import.meta.url), "utf8");
const ui = [chrome, view, inspect, ctx].join("\n");
const adapter = await readFile(new URL("../js/parametric_cabinet.js", import.meta.url), "utf8");
const planner = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const i18n = await readFile(new URL("../js/i18n.js", import.meta.url), "utf8");
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
  assert.match(engine, /Copy\/paste clones a column whole, hid and/);
  assert.match(engine, /duplicates are re-tagged here rather than at every paste site/);
  const tag = engine.slice(engine.indexOf("function tagParts"), engine.indexOf("export function normalizeSpec"));
  assert.match(tag, /dup\.push\(o\)/);
  assert.match(tag, /o\.hid = id/);
});

test("applyData keeps the modular cabinet spec on the item whitelist", () => {
  assert.match(planner, /cab: it\.cab && typeof it\.cab === "object" \? it\.cab : undefined/);
});

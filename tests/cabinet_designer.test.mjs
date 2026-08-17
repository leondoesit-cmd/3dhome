import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ui = await readFile(new URL("../js/ui_cabinet.js", import.meta.url), "utf8");
const adapter = await readFile(new URL("../js/parametric_cabinet.js", import.meta.url), "utf8");

test("overall size edits go through the parametric cabinet dimension request", () => {
  assert.match(ui, /import \{\s*CAB_LIMITS, syncCabinetDefinition, requestCabinetDimension, applyCabinetDimension,/);
  assert.match(ui, /function applyOverallSize\(dimension, input\)/);
  assert.match(ui, /requestCabinetDimension\(E\.it, dimension, value, ceilingHeight\(\)\)/);
  assert.match(ui, /applyCabinetDimension\(S, E\.it, result, alternativeId\)/);
  assert.match(ui, /function showSizeProposal\(/);
  assert.match(ui, /id="cbSizeDlg"/);
  assert.doesNotMatch(ui, /dim\.min = 20/);
  assert.doesNotMatch(ui, /E\.it\[k\.toLowerCase\(\)\] = v/);
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
  assert.match(ui, /wrap\.appendChild\(el\("div", "cb-note", T\("techHint"\)\)\)/);
  assert.match(ui, /setLevel\("technical"\)/);
  assert.match(ui, /T\("shelfBoard"\)/);
  assert.match(ui, /T\("plinthRecessed"\)/);
  const inspector = ui.slice(ui.indexOf("function fillInspector"), ui.indexOf("function setTool"));
  assert.match(inspector, /T\("carcassMode"\)/);
  assert.match(inspector, /T\("elev"\)/);
  assert.doesNotMatch(inspector, /row\(T\("panel"/);
  assert.doesNotMatch(inspector, /row\(T\("gap"/);
  const technical = ui.slice(ui.indexOf("function fillTechnical"), ui.indexOf("function fillChecks"));
  assert.match(technical, /row\(T\("panel"/);
  assert.match(technical, /row\(T\("gap"/);
  assert.match(technical, /row\(T\("plinthType"/);
});

test("partition tools have keyboard shortcuts that do not steal paste", () => {
  assert.match(ui, /aria-keyshortcuts="V"/);
  assert.match(ui, /aria-keyshortcuts="H"/);
  assert.match(ui, /aria-keyshortcuts="X"/);
  assert.match(ui, /if \(toolKey === "v"\)/);
  assert.match(ui, /if \(toolKey === "x"\)/);
  assert.match(ui, /if \(\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === "v"\) return pasteColumn\(\)/);
  assert.match(ui, /if \(!e\.ctrlKey && !e\.metaKey && !e\.altKey\)/);
  assert.match(ui, /if \(!E\.sel\) E\.sel = \{ col: 0, sec: 0 \}/);
  assert.match(ui, /if \(isSizeDlgOpen\(\)\)/);
});

test("PNG export redraws the front elevation even from the 3D workspace", () => {
  const png = ui.slice(ui.indexOf("function exportPNG"), ui.indexOf("function exportBOM"));
  assert.match(png, /if \(restoreMode === "3d" \|\| restoreAxis !== "front"\) setAxis\("front"\)/);
  assert.match(png, /sizeCanvas\(\)/);
  assert.match(png, /draw\(\)/);
  assert.match(png, /if \(restoreMode === "3d"\) setMode\("3d"\)/);
});

test("finish and hardware edits name themselves in designer history", () => {
  assert.match(ui, /act\(T\("opLook"\)\)/);
  assert.match(ui, /act\(T\("opHw"\) \+ " · " \+ label\)/);
  assert.match(ui, /act\(T\("opHw"\)\); hw\.led = v/);
});

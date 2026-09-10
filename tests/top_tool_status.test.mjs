import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
const uiLayers = await readFile(new URL("../js/ui_layers.js", import.meta.url), "utf8");
const dockJs = await readFile(new URL("../js/plan_tools_dock.js", import.meta.url), "utf8");

test("2D view exposes a dedicated tool and alert status pill at the top of the pane", () => {
  assert.match(html, /id="plan-tool-status"/);
  assert.match(html, /class="plan-tool-status top-tool-status"/);
  assert.match(html, /id="planToolIdle"/);
  assert.match(html, /class="tool-status-idle"/);
  assert.match(html, /class="unlock-pill"/);
  assert.match(html, /class="up-msg"/);
  assert.match(html, /class="up-fix"/);
});

test("CSS formats the tool-status pill as a dockable panel", () => {
  assert.match(css, /\.plan-tool-status/);
  assert.match(css, /\.plan-tool-status \.tool-status-idle/);
  assert.match(css, /\.plan-tool-status\.has-msg[\s\S]*?\.tool-status-idle\s*\{[\s\S]*?display:\s*none !important;/);
  assert.match(css, /\.unlock-pill\s*\{/);
  assert.match(css, /\.unlock-pill\[hidden\]\s*\{\s*display:\s*none !important;/);
  assert.match(css, /\.unlock-pill \.up-fix/);
  assert.match(css, /\.pt-panel:has\(\.plan-tool-status\.has-msg\)/);
});

test("ui_layers.js exports syncToolStatus and integrates pill with 2D view", () => {
  assert.match(uiLayers, /export function syncToolStatus\(\)/);
  assert.match(uiLayers, /getStatusWrap/);
  assert.match(uiLayers, /window\.addEventListener\("planner-tool",/);
  assert.match(uiLayers, /window\.addEventListener\("planner-place",/);
  assert.match(uiLayers, /wrap\.classList\.add\("has-msg"\)/);
  assert.match(uiLayers, /wrap\.classList\.remove\("has-msg"\)/);
});

test("plan_tools_dock.js registers status as a dockable panel defaulting to top edge", () => {
  assert.match(dockJs, /key:\s*"status",\s*id:\s*"plan-tool-status"/);
  assert.match(dockJs, /status:\s*\{\s*zone:\s*"top",\s*order:\s*0\s*\}/);
});

test("plan chrome overlays are claimed as movable panels and snap is a thin magnet", () => {
  assert.match(dockJs, /key:\s*"floors",\s*id:\s*"floor-tabs"/);
  assert.match(dockJs, /key:\s*"cad",\s*id:\s*"cad-status"/);
  assert.match(dockJs, /sel:\s*"\.plan-gizmo"/);
  assert.match(dockJs, /var SNAP_PAD = 14;/);
  assert.match(dockJs, /function claimOverlays\(/);
  assert.match(dockJs, /function onSizeDown\(/);
});

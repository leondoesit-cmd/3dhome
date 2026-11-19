import { moduleSource } from "./helpers/module_source.mjs";
import { stylesSource } from "./helpers/styles_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const game = moduleSource("js/zombies_game.js");
const css = stylesSource();

test("touch actions have seven distinct grid placements and readable labels", () => {
  assert.match(game, /btn\.innerHTML = "<b><\/b><small><\/small>"/);
  assert.match(css, /grid-template-columns: 52px 52px 72px/);
  assert.match(css, /\[data-act="interact"\]\s*\{ grid-column: 2; grid-row: 3/);
  assert.match(css, /\.z-touch-fire\s*\{[\s\S]*?grid-column: 3; grid-row: 3/);
  assert.match(css, /\[data-act="reload"\]\s*\{ grid-column: 1; grid-row: 1/);
  assert.match(css, /\[data-act="jump"\]\s*\{ grid-column: 2; grid-row: 2/);
});

test("responsive posture tracks phone, folded, tablet, landscape, and short screens", () => {
  assert.match(game, /function syncResponsiveHud\(\)/);
  assert.match(game, /classList\.toggle\("z-narrow", w <= 360\)/);
  assert.match(game, /classList\.toggle\("z-tablet", touch && w >= 600\)/);
  assert.match(game, /classList\.toggle\("z-fold-open"/);
  assert.match(game, /classList\.toggle\("z-landscape", ratio > 1\.12\)/);
  assert.match(game, /classList\.toggle\("z-short", h <= 520\)/);
});

test("rotation releases captured touch movement and fire state", () => {
  assert.match(game, /function resetTouchPointers\(\)/);
  assert.match(game, /if \(Z\.p\) Z\.p\.firing = false/);
  assert.match(game, /window\.addEventListener\("orientationchange", onGameViewportChange\)/);
  assert.match(game, /window\.visualViewport\.addEventListener\("resize", onGameViewportChange\)/);
  assert.match(game, /Z\.touchBound = true/);
});

test("compact planner breakpoints cannot hide the active 3D game pane", () => {
  assert.match(game, /Z\.active && center && !center\.classList\.contains\("max-view-3d"\)/);
  assert.match(game, /window\.__setViewMode\("3d"\)/);
  assert.match(game, /var compactPhone = document\.body\.classList\.contains\("compact-nav"\)/);
});

test("phone and fold controls respect safe areas and stay disjoint", () => {
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /#zHud\.z-touch\.z-narrow \.z-touch-stick/);
  assert.match(css, /grid-template-columns: 40px 40px 56px/);
  assert.match(css, /#zHud\.z-narrow #zRadarWrap \{ width: 82px; height: 82px/);
  assert.match(css, /#zHud\.z-narrow #zMission \{ box-sizing: border-box; width: calc\(100vw - 110px\)/);
});

test("tablet and short-landscape layouts use their own reach envelopes", () => {
  assert.match(css, /#zHud\.z-touch\.z-tablet \.z-touch-stick \{ width: 136px/);
  assert.match(css, /grid-template-columns: 58px 58px 80px/);
  assert.match(css, /#zHud\.z-touch\.z-landscape\.z-short \.z-touch-actions/);
  assert.match(css, /grid-template-columns: 40px 40px 40px 58px/);
  assert.match(css, /#zHud\.z-landscape\.z-short #zTop \{ top: calc\(max\(10px, env\(safe-area-inset-top\)\) \+ 54px\)/);
  assert.match(css, /@media \(max-height: 520px\) and \(min-width: 600px\)/);
});

test("spanning foldables keep the intermission panel off the hinge", () => {
  assert.match(css, /body\.fold-span #zHud #zIntermission/);
  assert.match(css, /width: min\(44vw, 520px\); transform: none/);
});

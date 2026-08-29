import { readI18nSource } from "./helpers/i18n_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

const game = await readFile(new URL("../js/zombies_game.js", import.meta.url), "utf8");
const i18n = await readI18nSource();
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("pause sheet labels jump on Space and shove on X", () => {
  assert.match(game, /kbd: "SPACE", key: "z_control_jump"/);
  assert.match(game, /kbd: "X", key: "z_control_shove"/);
  assert.match(i18n, /z_control_jump: "Jump"/);
  assert.match(i18n, /z_control_shove: "Shove \/ dodge"/);
  assert.doesNotMatch(game, /z_control_shove", "z_control_reload"\]/);
});

test("dev kit unlocks every weapon from the opening wave", () => {
  assert.match(game, /W_ORDER\.forEach\(function \(k\) \{ o\[k\] = true; \}\)/);
  assert.match(game, /W_ORDER\.forEach\(function \(k\) \{ if \(!W\[k\]\.melee\) a\[k\] = W\[k\]\.mag; \}\)/);
  // the scavenging order is still declared — unlocking everything up front is a
  // dev-build shortcut past it, not its deletion
  assert.match(stripComments(game), /var W_UNLOCK = \[/);
  assert.doesNotMatch(game, /owned: \{ knife: true, pistol: true \}/);
});

test("death screen can return to the planner", () => {
  assert.match(game, /button id="zDeadExit"/);
  assert.match(game, /Z\.hud\.deadExit\.addEventListener\("click"/);
  assert.match(game, /Z\.hud\.deadExit\.textContent = t\("z_exit"\)/);
});

test("look, invert, and volume persist with Night Shift settings", () => {
  assert.match(game, /sens: fin\(savedSens\) \? clamp\(savedSens, 0\.35, 2\.4\) : 1/);
  assert.match(game, /invertY: !!saved\.invertY/);
  assert.match(game, /volume: fin\(savedVol\) \? Math\.round\(clamp\(savedVol, 0, 100\)\) : 70/);
  assert.match(game, /function applyLookDelta\(/);
  assert.match(game, /cfg\.invertY \? -1 : 1/);
  assert.match(game, /function applyAudioVolume\(/);
});

test("Night Shift exposes analog stick and fire controls on coarse pointers", () => {
  assert.match(game, /function wantsTouchControls\(/);
  assert.match(game, /function bindTouchControls\(/);
  assert.match(game, /id="zStick"/);
  assert.match(game, /data-hold="fire"/);
  assert.match(game, /if \(wantsTouchControls\(\)\) return;/);
  assert.match(css, /@media \(pointer: coarse\) \{\s*#zTouch \{ display: block; \}/);
  assert.match(i18n, /z_touch_controls: "Night Shift touch controls"/);
});

test("jump alerts on landing rather than takeoff", () => {
  assert.match(game, /P\.airborne = P\.y > g \+ 2 \|\| P\.vy > 0;/);
  assert.match(game, /if \(wasAir && !P\.airborne && impactVy < -140\) \{\s*sndFootstep\(true\);\s*makeNoise\(P\.x, P\.z, 260\);/);
  assert.match(game, /P\.vy = JUMP_V \* \(P\.crouch \? 0\.72 : 1\);\s*P\.stam -= 8;\s*P\.airborne = true;/);
  assert.doesNotMatch(game, /P\.stam -= 8;\s*sndFootstep\(true\);\s*makeNoise\(P\.x, P\.z, 260\); \/\/ landing thud/);
});

test("combo readout and pause settings are translated", () => {
  assert.match(game, /t\("z_combo", \{ n: Z\.combo \}\)/);
  assert.match(i18n, /z_combo: "Combo ×\{n\}"/);
  assert.match(i18n, /z_setting_look: "Look sensitivity"/);
  assert.match(i18n, /z_setting_invert: "Invert look"/);
});

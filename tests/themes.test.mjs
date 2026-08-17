import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
const i18n = await readFile(new URL("../js/i18n.js", import.meta.url), "utf8");
const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");

const THEMES = ["light", "soft", "mid", "dark"];
const TOKENS = [
  "--bg-app",
  "--bg-panel",
  "--bg-topbar",
  "--bg-canvas-2d",
  "--bg-canvas-3d",
  "--border-color",
  "--text-main",
  "--text-muted",
  "--accent",
  "--accent-hover",
  "--accent-soft",
  "--accent-glow",
  "--accent-alpha",
  "--on-accent",
  "--btn-bg",
  "--btn-bg-hover",
  "--btn-border",
  "--input-bg",
  "--input-border",
  "--shadow-sm",
  "--shadow-md",
  "--separator",
  "--glass-blur",
  "--danger",
  "--danger-soft",
  "--warn",
  "--success",
  "--overlay",
  "--hud-bg",
  "--hud-fg",
  "--scrollbar",
  "--scrollbar-hover",
  "--preview-from",
  "--preview-to",
  "--app-glow-a",
  "--app-glow-b",
  "--panel-bg",
  "--color-scheme",
];

function blockFor(theme) {
  const needle = theme === "light"
    ? '[data-theme="light"]'
    : `[data-theme="${theme}"]`;
  const start = css.indexOf(needle);
  assert.notEqual(start, -1, `missing ${needle} theme block`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close + 2);
}

test("every UI theme defines the shared token set", () => {
  for (const theme of THEMES) {
    const block = blockFor(theme);
    for (const token of TOKENS) {
      assert.match(block, new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`),
        `${theme} is missing ${token}`);
    }
  }
});

test("chrome uses shared tokens instead of leftover per-theme colour overrides", () => {
  assert.match(css, /background:\s*var\(--overlay\)/);
  assert.match(css, /background:\s*var\(--hud-bg\)/);
  assert.match(css, /color:\s*var\(--hud-fg\)/);
  assert.match(css, /background:\s*var\(--scrollbar\)/);
  assert.match(css, /var\(--preview-from\)/);
  assert.match(css, /var\(--on-accent\)/);
  assert.match(css, /color-scheme:\s*var\(--color-scheme\)/);
  assert.doesNotMatch(css, /\[data-theme="dark"\] button\.active/);
  assert.doesNotMatch(css, /\[data-theme="dark"\] \.tb-pill button\.active/);
  assert.doesNotMatch(css, /\[data-theme="light"\] #modeler/);
  assert.doesNotMatch(css, /\[data-theme="dark"\] #modeler #mdPrev/);
  assert.doesNotMatch(css, /\[data-theme="light"\] #cabdes/);
  assert.doesNotMatch(css, /\[data-theme="light"\] #nestplan/);
});

test("theme switching dispatches a change event and covers all four palettes", () => {
  assert.match(ui, /const themes = \["light", "soft", "mid", "dark"\]/);
  assert.match(ui, /function applyTheme\(theme, persist\)/);
  assert.match(ui, /new CustomEvent\("themechange"/);
  assert.match(ui, /t\("theme_" \+ theme\)/);
  for (const key of ["theme_light", "theme_soft", "theme_mid", "theme_dark", "theme_click"]) {
    assert.equal((i18n.match(new RegExp(`${key}:`, "g")) || []).length, 2, `${key} in he and en`);
  }
});

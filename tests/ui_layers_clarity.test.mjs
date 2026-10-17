import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";

const src = await readFile(new URL("../js/ui_layers.js", import.meta.url), "utf8");
const css = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("the eye is a plain show/hide switch; Faded lives in the layer menu", () => {
  assert.doesNotMatch(src, /VIS_NEXT/, "no three-state click cycle");
  assert.match(src, /L\.vis = L\.vis === "show" \? "hide" : "show";/);
  assert.match(src, /function visibilityRow\(/);
  assert.match(src, /pop\.appendChild\(visibilityRow\(L\)\)/);
});

test("the Layers tab says which layer is being edited and what that means", () => {
  assert.match(src, /status\.className = "lchip-status"/);
  assert.match(src, /function syncStatus\(\)/);
  // the tag sits beside the name button, never inside it: pro_compact reads
  // the work layer's name from that button's text
  assert.match(src, /row\.append\(name, tag, eye, lock, more\)/);
  assert.match(css, /\.lchip-status,\s*\.lchip-tag \{ display: none; \}/);
  assert.match(css, /\.ps-left-layers > #layer-chips \.lchip-status \{/);
});

test("an automatic lock reads differently from one set by hand", () => {
  assert.match(src, /r\.row\.classList\.toggle\("autolocked", auto\)/);
  assert.match(src, /t\("lay_autolocked"\)/);
  assert.match(css, /\.lchip\.autolocked \.lchip-lock \{ color: var\(--text-muted\); \}/);
});

test("solo is a button in the menu, not only a hidden Shift-click", () => {
  assert.match(src, /only\.className = "lp-solo"/);
  assert.match(src, /function soloed\(/);
});

test("every new layer string exists in both locales", () => {
  for (const k of [
    "lay_vis", "lay_eye_hide", "lay_eye_show", "lay_solo_btn", "lay_unsolo_btn", "lay_autolocked",
    "lay_ov_auto_t", "lay_status", "lay_status_all", "lay_status_follow", "lay_status_pinned",
    "lay_status_h", "lay_tag_edit",
  ]) {
    assert.equal(typeof en[k], "string", "en " + k);
    assert.equal(typeof he[k], "string", "he " + k);
  }
  assert.equal(en.lay_vis_ghost, "Faded");
});

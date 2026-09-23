import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { S } from "../js/state.js";
import { PLAN_STYLES, normalizePlanStyle, planStyle, isPresentation, PLAN_THEME } from "../js/plan_style.js";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";

const src = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");

test("plan style: unknown or missing values fall back to the technical plan", () => {
  assert.deepEqual(PLAN_STYLES, ["technical", "presentation"]);
  assert.equal(normalizePlanStyle(undefined), "technical");
  assert.equal(normalizePlanStyle("glossy"), "technical");
  assert.equal(normalizePlanStyle("presentation"), "presentation");
  assert.equal(S.planStyle, "technical");
  const prev = S.planStyle;
  S.planStyle = "presentation";
  assert.equal(planStyle(), "presentation");
  assert.equal(isPresentation(), true);
  S.planStyle = "nonsense";
  assert.equal(isPresentation(), false);
  S.planStyle = prev;
  for (const k of PLAN_STYLES) assert.ok(PLAN_THEME[k].wallFill, k);
});

test("plan style: saved with the scene and restored through the normalizer", async () => {
  const ui = await src("js/ui.js");
  assert.match(ui, /\n\s+planStyle: S\.planStyle,/);
  assert.match(ui, /S\.planStyle = normalizePlanStyle\(d\.planStyle\);/);
  assert.match(ui, /act === "togglePlanStyle"/);
});

test("plan style: every new string exists in both locales", () => {
  for (const k of ["plan_style", "plan_style_technical", "plan_style_presentation", "plan_style_toggle",
    "plan_stairs_up", "floor_pavers"]) {
    assert.equal(typeof en[k], "string", "en " + k);
    assert.equal(typeof he[k], "string", "he " + k);
  }
});

test("presentation plan: room layer keyed on style, knockout replaced, sprites repaint", async () => {
  const p = await src("js/plan2d.js");
  assert.match(p, /"\|" \+ planStyle\(\) \+ "\|"/);
  assert.match(p, /if \(isPresentation\(\)\) \{\n\s+\/\*[^]*?\*\/\n\s+var pth = planTheme\(\)/);
  assert.match(p, /addEventListener\("planSpritesReady"/);
  assert.match(p, /clipOutsideOpenings\(list\)/);
});

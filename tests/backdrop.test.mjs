import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backdropLook, backdropMode, softLightOn } from "../js/view3d/backdrop.js";

test("the default site backdrop leaves the time-of-day rig untouched", () => {
  for (const day of [true, false]) {
    const look = backdropLook("site", false, day);
    assert.equal(look.sky, true);
    assert.equal(look.grass, true);
    assert.equal(look.studioFloor, false);
    assert.equal(look.background, null);
    assert.equal(look.zenith, null);
    assert.equal(look.envGround, null);
    assert.equal(look.sunScale, 1);
    assert.equal(look.envScale, 1);
    assert.equal(look.exposureScale, 1);
    assert.equal(look.shadowSoften, 0);
  }
});

test("studio swaps grass and sky for a neutral grey cyclorama with a softer key", () => {
  const look = backdropLook("studio", false, true);
  assert.equal(look.sky, false);
  assert.equal(look.grass, false);
  assert.equal(look.studioFloor, true);
  // neutral: no channel of the backdrop or the IBL ground far from the others
  const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  for (const h of [look.background, look.zenith, look.horizon, parseInt(look.envGround, 16)]) {
    const c = rgb(h);
    assert.ok(Math.max(...c) - Math.min(...c) <= 12, "neutral grey " + h.toString(16));
  }
  assert.ok(look.sunScale < 1 && look.envScale > 1, "key down, fill up");
  const night = backdropLook("studio", false, false);
  assert.ok(night.background < look.background, "darker at night");
});

test("soft light lowers the sun key and exposure and widens the shadow edge, in either backdrop", () => {
  for (const mode of ["site", "studio"]) {
    const hard = backdropLook(mode, false, true), soft = backdropLook(mode, true, true);
    assert.ok(soft.sunScale < hard.sunScale);
    assert.ok(soft.exposureScale < 1);
    assert.ok(soft.envScale > hard.envScale);
    assert.ok(soft.shadowSoften > hard.shadowSoften);
  }
});

test("backdrop settings read from the workspace, defaulting to studio and soft light", () => {
  assert.equal(backdropMode(undefined), "studio");
  assert.equal(backdropMode({}), "studio", "a project saved before the setting opens on studio");
  assert.equal(backdropMode({ backdrop: "bogus" }), "studio");
  assert.equal(backdropMode({ backdrop: "site" }), "site", "an explicit Site choice is kept");
  assert.equal(softLightOn(undefined), true);
  assert.equal(softLightOn({}), true);
  assert.equal(softLightOn({ softLight: false }), false, "unticking is kept");
});

test("a new plan opens at golden hour: sun up, low and warm", async () => {
  const { DEFAULT_HOUR } = await import("../js/state.js");
  // the rig in gizmo_env.js: sunrise 6, sunset 18, elevation sin(t*PI)*1.02
  assert.ok(DEFAULT_HOUR > 6 && DEFAULT_HOUR < 18, "the sun is up");
  const elev = Math.sin(((DEFAULT_HOUR - 6) / 12) * Math.PI) * 1.02;
  assert.ok(elev > 0.1 && elev < 0.45, "low sun: " + ((elev * 180) / Math.PI).toFixed(1) + " degrees");
  assert.ok(1 - elev / 0.7 > 0.4, "warm enough that the rig tints the sun toward orange");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, new RegExp('id="hour"[\\s\\S]*?value="' + DEFAULT_HOUR + '"'));
  assert.match(html, /<option value="studio" data-i18n="backdrop_studio" selected>/);
  assert.match(html, /<input type="checkbox" id="cb_softlight" checked \/>/);
  for (const f of ["planner_chrome.js", "ui/file_actions.js", "demo_house.js"])
    assert.doesNotMatch(readFileSync(new URL("../js/" + f, import.meta.url), "utf8"), /hour\s*[:=]\s*1[35]\b/, f + " resets to DEFAULT_HOUR");
});

test("applyEnv and applySite apply the backdrop look", () => {
  const src = readFileSync(new URL("../js/view3d/gizmo_env.js", import.meta.url), "utf8");
  assert.ok(src.includes("backdropLook(mode, soft, true)"));
  assert.ok(src.includes("sun.intensity = photometry.direct"));
  assert.ok(src.includes("renderer.toneMappingExposure = photometry.exposure"));
  assert.ok(src.includes("scene.environmentIntensity = photometry.envStrength"));
  assert.match(src, /skyDome\.visible = !showSV && !studio/);
  assert.match(src, /groundPlaneRef\.visible = !studio && /);
  assert.match(src, /studioFloor\(THREE, scene, studio/);
});

test("the planner renderer selects the ACES and sRGB output measured by the exposure probes", () => {
  const setup = readFileSync(new URL("../js/view3d/renderer_setup.js", import.meta.url), "utf8");
  assert.match(setup, /configurePlannerOutput\(renderer, THREE\)/);
});

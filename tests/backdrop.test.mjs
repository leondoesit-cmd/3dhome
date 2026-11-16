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

test("backdrop settings read from the workspace, defaulting to site and hard light", () => {
  assert.equal(backdropMode(undefined), "site");
  assert.equal(backdropMode({ backdrop: "bogus" }), "site");
  assert.equal(backdropMode({ backdrop: "studio" }), "studio");
  assert.equal(softLightOn({}), false);
  assert.equal(softLightOn({ softLight: true }), true);
});

test("applyEnv and applySite apply the backdrop look", () => {
  const src = readFileSync(new URL("../js/view3d/gizmo_env.js", import.meta.url), "utf8");
  assert.match(src, /var look = backdropLook\(backdropMode\(S\.workspace\), softLightOn\(S\.workspace\), on\)/);
  assert.match(src, /sun\.intensity = LUX \* \(on \? 0\.45 \+ 1\.4 \* dk : 0\) \* look\.sunScale/);
  assert.match(src, /renderer\.toneMappingExposure = \(on \? 1\.28 : 0\.95\) \* look\.exposureScale/);
  assert.match(src, /skyDome\.visible = !showSV && !studio/);
  assert.match(src, /groundPlaneRef\.visible = !studio && /);
  assert.match(src, /studioFloor\(THREE, scene, studio/);
});

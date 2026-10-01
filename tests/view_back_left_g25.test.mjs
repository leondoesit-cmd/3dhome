import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { VIEW_PRESETS } from "../js/modeler_chrome.js";

// G25, LENSCAP ThreadPlane (book steps 189–195): "Click the narrow back face of
// the Base Extrude feature." The view panel offered Top, Front and Right only,
// so the back of a part could be reached only by hand orbit, which does not
// land on a repeatable angle. Back and Left turn the camera like Isometric does:
// they change the camera, not the sketch plane, so the active sketch stays.

const preset = (id) => VIEW_PRESETS.find((item) => item.id === id);

test("Back, Left and Bottom are opposite standard view presets", () => {
  const front = preset("front"), right = preset("right"), top = preset("top");
  const back = preset("back"), left = preset("left"), bottom = preset("bottom");
  assert.ok(back && left && bottom, "all opposite presets exist");
  assert.ok(Math.abs(Math.abs(back.az - front.az) - Math.PI) < 1e-12, "Back looks from the opposite side of Front");
  assert.equal(back.el, front.el);
  assert.ok(Math.abs(Math.abs(left.az - right.az) - Math.PI) < 1e-12, "Left looks from the opposite side of Right");
  assert.equal(left.el, right.el);
  assert.equal(bottom.az, top.az);
  assert.equal(bottom.el, -top.el);
  assert.equal(VIEW_PRESETS.filter((item) => item.id === "bottom").length, 1);
  assert.equal(VIEW_PRESETS[0].id, "front", "Front stays first");
});

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
const strings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("the view panel has Back, Left and Bottom buttons", () => {
  assert.match(modeler, /<button data-view="back" data-tip="' \+ t\("view_back"\) \+ '">/);
  assert.match(modeler, /<button data-view="left" data-tip="' \+ t\("view_left"\) \+ '">/);
  assert.match(modeler, /<button data-view="bottom" data-tip="' \+ t\("view_bottom"\) \+ '">/);
  assert.match(strings, /view_back: \[/);
  assert.match(strings, /view_left: \[/);
  assert.match(strings, /view_bottom: \[/);
});

test("opposite views turn the camera only and never swap the sketch plane", () => {
  const body = modeler.slice(modeler.indexOf("function setView(id) {"), modeler.indexOf("function zoomBy(dir) {"));
  const cameraBranch = body.slice(0, body.indexOf("E.view = id;"));
  assert.match(cameraBranch, /CAMERA_ONLY_VIEWS\.indexOf\(id\) >= 0/, "back and left are handled before E.view is touched");
  assert.match(modeler, /var CAMERA_ONLY_VIEWS = \["iso", "back", "left", "bottom"\];/);
  assert.match(cameraBranch, /E\.pv\.orbitTo\(cameraPreset\.az, cameraPreset\.el\)/);
  assert.match(modeler, /minEl: -1\.5, maxEl: 1\.5/);
  assert.match(modeler, /E\.pv\.el = clamp\(E\.pv\.el \+ \(e\.clientY - E\.drag\.py\) \* 0\.006, -1\.5, 1\.5\)/);
});

test("the view selector labels the new presets", () => {
  assert.match(modeler, /back: t\("view_back"\), left: t\("view_left"\)/);
  assert.match(modeler, /bottom: t\("view_bottom"\)/);
});

test("mobile view sheet offers Bottom for underside face selection", () => {
  const mobile = readFileSync(new URL("../js/modeler_mobile.js", import.meta.url), "utf8");
  assert.match(mobile, /\["bottom", "view_top", "view_bottom_short"\]/);
  assert.match(strings, /view_bottom_short: \[/);
});

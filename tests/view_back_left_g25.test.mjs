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

test("Back and Left are standard view presets opposite Front and Right", () => {
  const front = preset("front"), right = preset("right"), back = preset("back"), left = preset("left");
  assert.ok(back && left, "both presets exist");
  assert.ok(Math.abs(Math.abs(back.az - front.az) - Math.PI) < 1e-12, "Back looks from the opposite side of Front");
  assert.equal(back.el, front.el);
  assert.ok(Math.abs(Math.abs(left.az - right.az) - Math.PI) < 1e-12, "Left looks from the opposite side of Right");
  assert.equal(left.el, right.el);
  assert.equal(VIEW_PRESETS[0].id, "front", "Front stays first");
});

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
const strings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("the view panel has Back and Left buttons next to Front and Right", () => {
  assert.match(modeler, /<button data-view="back" data-tip="' \+ t\("view_back"\) \+ '">/);
  assert.match(modeler, /<button data-view="left" data-tip="' \+ t\("view_left"\) \+ '">/);
  assert.match(strings, /view_back: \[/);
  assert.match(strings, /view_left: \[/);
});

test("Back and Left turn the camera only, like Isometric, and never swap the sketch plane", () => {
  const body = modeler.slice(modeler.indexOf("function setView(id) {"), modeler.indexOf("function zoomBy(dir) {"));
  const cameraBranch = body.slice(0, body.indexOf("E.view = id;"));
  assert.match(cameraBranch, /CAMERA_ONLY_VIEWS\.indexOf\(id\) >= 0/, "back and left are handled before E.view is touched");
  assert.match(modeler, /var CAMERA_ONLY_VIEWS = \["iso", "back", "left"\];/);
  assert.match(cameraBranch, /E\.pv\.orbitTo\(cameraPreset\.az, cameraPreset\.el\)/);
});

test("the view selector labels the new presets", () => {
  assert.match(modeler, /back: t\("view_back"\), left: t\("view_left"\)/);
});

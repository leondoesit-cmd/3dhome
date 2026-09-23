import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
const strings = readFileSync(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

test("consumed sketches can be explicitly shown in the 3D viewport", () => {
  assert.match(source, /consumed\.has\(sketch\.id\) && sketch\.show3d !== true/);
  assert.match(source, /sketch\.show3d = !shown/);
  assert.match(source, /t\(shown \? "sketchHide3d" : "sketchShow3d"\)/);
  assert.match(strings, /sketchShow3d:[^\n]+Show in 3D/);
  assert.match(strings, /sketchHide3d:[^\n]+Hide in 3D/);
});

test("visible sketch overlays are not lost behind their supporting face", () => {
  assert.match(source, /addOverlayPolyline\(parent, points, 0x8fa6c4, 22, null, false\)/);
  assert.match(source, /depthTest: depthTest !== false/);
});

test("the aligned 2D sketch repaints with the live 3D camera", () => {
  assert.match(source, /if \(E\.mode === "3d" && E\.modelPlaneActive && E\.cv\) drawSketch\(\)/);
  assert.match(source, /var planeCorners = \[toPx\(-reach,-reach\),toPx\(reach,-reach\),toPx\(reach,reach\),toPx\(-reach,reach\)\]/);
  assert.match(source, /c\.shadowBlur = 3/);
});

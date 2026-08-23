import test from "node:test";
import assert from "node:assert/strict";

import {
  blueprintBounds,
  calibrationScale,
  makeBlueprintReference,
  normalizeBlueprintReference,
  pixelToWorld,
} from "../js/blueprint_trace.js";

const raster = {
  dataUrl: "data:image/jpeg;base64,AA==",
  width: 1000,
  height: 700,
  sourceType: "image",
};

test("two-point calibration converts pixels to centimeters", () => {
  assert.equal(calibrationScale({ x: 20, y: 10 }, { x: 220, y: 10 }, 400), 2);
  assert.equal(calibrationScale({ x: 0, y: 0 }, { x: 0, y: 0 }, 400), null);
  assert.equal(calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, -1), null);
});

test("straightening rotates the picked calibration segment to world X", () => {
  const ref = makeBlueprintReference(
    raster,
    { x: 200, y: 100 },
    { x: 200, y: 300 },
    400,
    true,
    "plan.pdf",
  );
  const a = pixelToWorld(ref, ref.calibration.p1);
  const b = pixelToWorld(ref, ref.calibration.p2);
  assert.ok(Math.abs(a.z - b.z) < 1e-9);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 400) < 1e-9);
  assert.deepEqual(ref.guidePoints, [a, b]);
});

test("blueprint bounds include all corners after calibration rotation", () => {
  const ref = makeBlueprintReference(
    raster,
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    Math.SQRT2 * 100,
    true,
  );
  const bounds = blueprintBounds(ref);
  assert.ok(bounds.w > 1199 && bounds.w < 1203);
  assert.ok(bounds.d > 1199 && bounds.d < 1203);
  assert.equal(bounds.cx, 0);
  assert.equal(bounds.cz, 0);
});

test("saved references are sanitized before use", () => {
  assert.equal(normalizeBlueprintReference({}), null);
  const ref = normalizeBlueprintReference({
    dataUrl: raster.dataUrl,
    width: 100,
    height: 80,
    cmPerPx: 2,
    opacity: 9,
    visible: false,
  });
  assert.equal(ref.opacity, 1);
  assert.equal(ref.visible, false);
});

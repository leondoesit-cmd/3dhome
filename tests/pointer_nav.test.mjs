import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyViewportWheel,
  isMouseWheelZoom,
  isPinchWheel,
  orbitFromWheel,
  panFromWheel,
  wheelDeltaPixels,
  zoomFactorFromWheel,
} from "../js/pointer_nav.js";

function wheel(parts) {
  return Object.assign({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false }, parts);
}

test("pinch-to-zoom is Ctrl or ⌘ plus wheel", () => {
  assert.equal(isPinchWheel(wheel({ ctrlKey: true, deltaY: 8 })), true);
  assert.equal(isPinchWheel(wheel({ metaKey: true, deltaY: 8 })), true);
  assert.equal(classifyViewportWheel(wheel({ ctrlKey: true, deltaY: 8 }), "3d"), "zoom");
  var pinch = zoomFactorFromWheel(wheel({ ctrlKey: true, deltaY: 10 }));
  assert.ok(pinch > 1 && pinch < 1.05);
});

test("a mouse wheel notch still zooms, without a 12 percent jump", () => {
  var mouse = wheel({ deltaY: 1, deltaMode: 1 });
  assert.equal(isMouseWheelZoom(mouse), true);
  assert.equal(classifyViewportWheel(mouse, "3d"), "zoom");
  assert.equal(zoomFactorFromWheel(mouse), 1.08);
  var pixelMouse = wheel({ deltaY: 120, deltaX: 0 });
  assert.equal(classifyViewportWheel(pixelMouse, "2d"), "zoom");
});

test("two-finger trackpad motion orbits in 3D and pans in 2D", () => {
  var twoFinger = wheel({ deltaX: 6, deltaY: 4, deltaMode: 0 });
  assert.equal(classifyViewportWheel(twoFinger, "3d"), "orbit");
  assert.equal(classifyViewportWheel(twoFinger, "2d"), "pan");
  assert.equal(classifyViewportWheel(wheel({ ...twoFinger, shiftKey: true }), "3d"), "pan");
  var orbit = orbitFromWheel(twoFinger);
  assert.ok(orbit.daz < 0);
  assert.ok(orbit.del < 0);
  var pan = panFromWheel(twoFinger);
  assert.deepEqual(pan, { dx: -6, dy: -4 });
});

test("line-mode deltas convert to pixels before mapping", () => {
  assert.deepEqual(wheelDeltaPixels(wheel({ deltaX: 2, deltaY: -1, deltaMode: 1 })), { x: 32, y: -16 });
});

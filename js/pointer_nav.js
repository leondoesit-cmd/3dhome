// Pointer and wheel mapping for the CAD editor viewports.
//
// A MacBook trackpad does not have a mouse wheel. Two-finger motion arrives as
// a stream of pixel `wheel` events (often with inertia), and pinch-to-zoom is
// Ctrl/⌘+wheel. Treating every tick as a ±12% zoom step is what made the
// modeler feel like it was lurching away from the part.

export function wheelDeltaPixels(event) {
  var scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  return { x: Number(event.deltaX || 0) * scale, y: Number(event.deltaY || 0) * scale };
}

export function isPinchWheel(event) {
  return !!(event.ctrlKey || event.metaKey);
}

export function isMouseWheelZoom(event) {
  if (isPinchWheel(event) || event.shiftKey) return false;
  if (event.deltaMode === 1 || event.deltaMode === 2) return true;
  var pixels = wheelDeltaPixels(event);
  return Math.abs(pixels.x) < 1 && Math.abs(pixels.y) >= 40;
}

export function classifyViewportWheel(event, surface) {
  if (isPinchWheel(event)) return "zoom";
  if (event.shiftKey) return "pan";
  if (isMouseWheelZoom(event)) return "zoom";
  return surface === "2d" ? "pan" : "orbit";
}

export function zoomFactorFromWheel(event) {
  var pixels = wheelDeltaPixels(event);
  if (isMouseWheelZoom(event)) return pixels.y > 0 ? 1.08 : 1 / 1.08;
  var factor = Math.exp(pixels.y * 0.0016);
  if (!(factor > 0) || !isFinite(factor)) return 1;
  return Math.min(1.2, Math.max(1 / 1.2, factor));
}

export function orbitFromWheel(event) {
  var pixels = wheelDeltaPixels(event);
  return { daz: -pixels.x * 0.009, del: -pixels.y * 0.006 };
}

export function panFromWheel(event) {
  var pixels = wheelDeltaPixels(event);
  return { dx: -pixels.x, dy: -pixels.y };
}

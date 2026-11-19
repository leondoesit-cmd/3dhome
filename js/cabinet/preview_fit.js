/* The cabinet designer's 3D pane: framing and reset.

   In Split and 3D the model takes the middle pane, and it is framed to the
   cabinet's box and the pane's shape so the piece fills about three quarters
   of whichever pane dimension limits it — a tall, narrow Split half included.
   It is re-fitted when the mode changes, the pane resizes or the cabinet's
   size changes, until the user orbits, pans or zooms: from then on their view
   stands until a double-click on the pane (or a mode change) puts the fitted
   default back. The side-panel thumbnail (2D mode) keeps its old framing.
   js/ui_cabinet_view.js calls in; the camera is js/editor_view.js's, whose
   orbit puts the eye at (sin az cos el, sin el, cos az cos el) from the
   target. */

export var PREVIEW_FILL = 0.75;

/* Distance from the box centre at which a w × h × d box (cm; x wide, y high,
   z deep), seen from (az, el), fills `fill` of the limiting pane dimension of
   a perspective camera with vertical `fovDeg` and `aspect` (width / height):
   the eight corners are projected the way the camera sees them and the
   distance is bisected until the wider of their two screen spans is `fill`. */
export function cabinetFitDistance(size, fovDeg, aspect, fill, az, el) {
  var hx = Math.max(1, Number(size && size.w) || 0) / 2,
    hy = Math.max(1, Number(size && size.h) || 0) / 2,
    hz = Math.max(1, Number(size && size.d) || 0) / 2;
  fill = fill > 0 && fill <= 1 ? fill : PREVIEW_FILL;
  aspect = aspect > 0 ? aspect : 1;
  az = Number(az) || 0;
  el = Number(el) || 0;
  var sa = Math.sin(az), ca = Math.cos(az), se = Math.sin(el), ce = Math.cos(el);
  // camera axes: f towards the eye, r right, u up (three's lookAt basis)
  var f = [sa * ce, se, ca * ce], r = [ca, 0, -sa], u = [-se * sa, ce, -se * ca];
  var tanV = Math.tan(((Number(fovDeg) || 42) * Math.PI) / 360), tanH = tanV * aspect;
  var pts = [];
  for (var i = 0; i < 8; i++) {
    var x = i & 1 ? hx : -hx, y = i & 2 ? hy : -hy, z = i & 4 ? hz : -hz;
    pts.push([x * r[0] + z * r[2], x * u[0] + y * u[1] + z * u[2], x * f[0] + y * f[1] + z * f[2]]);
  }
  var reach = Math.hypot(hx, hy, hz);
  function span(d) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (var k = 0; k < 8; k++) {
      var depth = d - pts[k][2], px = pts[k][0] / (depth * tanH), py = pts[k][1] / (depth * tanV);
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    return Math.max(x1 - x0, y1 - y0) / 2;
  }
  var lo = reach * 1.01, hi = reach * 1.01 + reach / (Math.min(tanV, tanH) * fill) * 2;
  for (var n = 0; n < 40; n++) {
    var mid = (lo + hi) / 2;
    if (span(mid) > fill) lo = mid; else hi = mid;
  }
  return hi;
}

var user = false, home = null, lastPane = "";
function sizeOf(it) {
  return { w: it.w, h: it.h, d: it.d };
}
function fit(view, it) {
  view.resize(true);
  view.target.set(0, 0, 0);
  var d = cabinetFitDistance(sizeOf(it), view.cam.fov, view.cam.aspect, PREVIEW_FILL, view.az, view.el);
  view.dist = Math.min(2500, Math.max(60, d));
}

/* Frame the preview for `it`. `modeChanged`: the pane just changed hands, so
   the user's own view goes and the current orbit becomes the default. */
export function frameCabinetPreview(view, it, modeChanged) {
  if (!view || !it) return;
  if (modeChanged) user = false;
  if (modeChanged || !home) home = { az: view.az, el: view.el };
  if (!view.big) {
    view.frame(Math.hypot(it.w, it.h, it.d) * 1.5); // the thumbnail, as before
    return;
  }
  if (!user) fit(view, it);
}

// Double-click on the pane: back to the fitted default view.
export function resetCabinetPreview(view, it) {
  if (!view || !it || !view.big) return;
  user = false;
  view.clearFixedFrame(false);
  if (home) { view.az = home.az; view.el = home.el; }
  fit(view, it);
  view.render();
}

/* Watch the canvas for the user taking the camera, and the big pane for a
   new size. `item` answers the cabinet being edited (or null). */
export function watchCabinetPreview(view, canvas, bigHost, item) {
  if (!view || !canvas) return;
  var took = function () { if (view.big) user = true; };
  canvas.addEventListener("wheel", took, { passive: true });
  canvas.addEventListener("touchmove", took, { passive: true });
  canvas.addEventListener("pointermove", function (e) { if (e.buttons && (e.movementX || e.movementY)) took(); });
  if (!bigHost || typeof ResizeObserver === "undefined") return;
  new ResizeObserver(function (entries) {
    var r = entries[0] && entries[0].contentRect, key = r ? Math.round(r.width) + "x" + Math.round(r.height) : "";
    if (key === lastPane) return;
    lastPane = key;
    var it = item();
    if (!view.big || user || !it) return;
    view.invalidateSize();
    fit(view, it);
    view.render();
  }).observe(bigHost);
}

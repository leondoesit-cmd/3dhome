// The editor 3D viewport — one orbiting preview shared by the CAD modeler and
// the cabinet designer, both of which had grown their own near-identical copy
// of it (renderer setup, transparent clear, the async-backend first paint,
// drag-to-orbit, wheel-to-zoom, resize-on-render).
//
// It also owns the trick the cabinet designer worked out and the modeler never
// had: ONE RENDERER, TWO HOMES. The preview lives as a thumbnail in the side
// panel and is physically moved into the middle pane when you switch to 3D,
// rather than a second WebGL context being stood up for the big view. Contexts
// are scarce and a second one costs a full duplicate of every texture and
// geometry, so moving the canvas is not a shortcut — it is the correct design.
//
//   var view = createEditorView({ canvas: cv, grid: true, center: () => cy });
//   view.rebuild(function (grp) { buildWhatever(grp); });
//   view.setBig(true);   // fill the middle pane
//   view.render();
//
// The renderer prefers WebGL2 (see gpu.js): an editor preview gains nothing
// from WebGPU and the WebGL2 backend comes up faster.

import { THREE } from "./three_lazy.js";
import { createRenderer, render as gpuRender, ready as gpuReady, LUX } from "./gpu.js";
import { clearGroup } from "./primitives.js";

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/* Three-finger pan for trackpads and touch screens. Mouse / two-finger
   (right-click) gestures stay with the caller; this only engages at 3+
   contacts, using the centroid so the view slides instead of orbiting. */
export function threeFingerCentroid(touchList) {
  if (!touchList || touchList.length < 3) return null;
  var x = 0, y = 0, n = touchList.length;
  for (var i = 0; i < n; i++) {
    x += touchList[i].clientX;
    y += touchList[i].clientY;
  }
  return { x: x / n, y: y / n };
}

export function bindThreeFingerPan(el, onPan) {
  var last = null, pts = {}, viaTouch = 0;

  function pointCount() {
    var n = 0;
    for (var id in pts) n++;
    return n;
  }
  function pointerCentroid() {
    if (pointCount() < 3) return null;
    var x = 0, y = 0, n = 0;
    for (var id in pts) { x += pts[id].x; y += pts[id].y; n++; }
    return { x: x / n, y: y / n };
  }
  function isPanning() { return !!last || pointCount() >= 3; }

  function apply(c, e) {
    if (!c) { last = null; return; }
    if (e && e.preventDefault) e.preventDefault();
    if (last) onPan(c.x - last.x, c.y - last.y, e);
    last = c;
  }

  el.addEventListener("touchstart", function (e) {
    var c = threeFingerCentroid(e.touches);
    last = c;
    if (c) { viaTouch = performance.now(); e.preventDefault(); }
  }, { passive: false });
  el.addEventListener("touchmove", function (e) {
    var c = threeFingerCentroid(e.touches);
    if (!c) { last = null; return; }
    viaTouch = performance.now();
    apply(c, e);
  }, { passive: false });
  function touchEnd(e) {
    last = threeFingerCentroid(e.touches);
  }
  el.addEventListener("touchend", touchEnd);
  el.addEventListener("touchcancel", touchEnd);

  el.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var c = pointerCentroid();
    if (c) last = c;
  }, true);
  el.addEventListener("pointermove", function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (performance.now() - viaTouch < 50) return;
    var c = pointerCentroid();
    if (c) apply(c, e);
  }, true);
  function pointerEnd(e) {
    delete pts[e.pointerId];
    if (pointCount() < 3) last = null;
  }
  el.addEventListener("pointerup", pointerEnd, true);
  el.addEventListener("pointercancel", pointerEnd, true);

  return isPanning;
}

export function createEditorView(opts) {
  opts = opts || {};
  var cv = opts.canvas;
  if (!cv) return null;

  var view = null;
  try {
    var rr = createRenderer({ canvas: cv, antialias: true, alpha: true, preferWebGL: true });
    /* alpha:true alone no longer clears transparent — WebGPURenderer defaults
       to an opaque clear, so the preview came out on a black slab instead of
       the panel behind it. Ask for a fully transparent clear explicitly. */
    rr.setClearColor(0x000000, 0);
    rr.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    rr.outputColorSpace = THREE.SRGBColorSpace;
    rr.toneMapping = THREE.ACESFilmicToneMapping;
    rr.toneMappingExposure = 1.1;
    if (opts.shadows) rr.shadowMap.enabled = true;

    var sc = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(opts.fov || 45, 1, opts.near || 1, opts.far || 6000);
    var ambient = new THREE.AmbientLight(0xffffff, LUX * (opts.ambient || 0.6));
    sc.add(ambient);
    var key = new THREE.DirectionalLight(0xfff2dd, LUX * (opts.keyLight || 0.95));
    key.position.set(180, 340, 260);
    if (opts.shadows) {
      /* A directional light ships with a ten-unit shadow frustum. The editor
         works in centimetres, so that is a 10 cm window onto the model — which
         is exactly the grey rectangle that used to sit on the side of a part:
         inside the window the surface shadowed itself at the default zero bias,
         and outside it there was no shadow at all. Cover what the camera can
         see instead, and bias along the surface normal so a curved wall stops
         casting onto itself. `place` keeps the box sized to the current zoom. */
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 4000;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 1.2;   // cm
    }
    sc.add(key);
    sc.add(key.target);
    var fill = null;
    if (opts.fill !== 0) {
      fill = new THREE.DirectionalLight(0xdfe8ff, LUX * (opts.fill || 0.35));
      fill.position.set(-200, 120, -160);
      sc.add(fill);
    }
    var grid = null;
    if (opts.grid) {
      grid = new THREE.GridHelper(400, 20, opts.gridMajor || 0x73869a, opts.gridMinor || 0xb7c0ca);
      /* A construction grid is depth information, not the subject. Keep it
         readable at the horizon without letting it compete with model edges. */
      var gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
      gridMaterials.forEach(function (material) {
        material.transparent = true;
        material.opacity = opts.gridOpacity == null ? 0.32 : opts.gridOpacity;
        material.depthWrite = false;
      });
      sc.add(grid);
    }
    // The node renderer reads section planes from the scene graph, not materials.
    var grp = new THREE.ClippingGroup();
    grp.enabled = false;
    sc.add(grp);

    view = {
      rr: rr, sc: sc, cam: cam, grp: grp, grid: grid,
      keyLight: key, ambientLight: ambient, fillLight: fill,
      az: opts.az != null ? opts.az : 0.55,
      el: opts.el != null ? opts.el : 0.28,
      dist: opts.dist || 420,
      target: new THREE.Vector3(),
      big: false,
      fixedFrame: null,
      pickBounds: null,
    };

    var initialLightOffset = key.position.clone();
    view.lighting = {
      azimuth: Math.atan2(initialLightOffset.x, initialLightOffset.z) * 180 / Math.PI,
      elevation: Math.asin(initialLightOffset.y / initialLightOffset.length()) * 180 / Math.PI,
      distance: initialLightOffset.length(),
      keyColor: "#" + key.color.getHexString(),
      keyIntensity: key.intensity,
      ambientColor: "#" + ambient.color.getHexString(),
      ambientIntensity: ambient.intensity,
      fillColor: fill ? "#" + fill.color.getHexString() : "#dfe8ff",
      fillIntensity: fill ? fill.intensity : 0,
    };
    function applyLighting(settings) {
      if (!settings) return;
      Object.keys(view.lighting).forEach(function (name) {
        if (settings[name] != null) view.lighting[name] = settings[name];
      });
      if (view.lighting.keyColor) key.color.set(view.lighting.keyColor);
      if (Number.isFinite(Number(view.lighting.keyIntensity))) key.intensity = Number(view.lighting.keyIntensity);
      if (view.lighting.ambientColor) ambient.color.set(view.lighting.ambientColor);
      if (Number.isFinite(Number(view.lighting.ambientIntensity))) ambient.intensity = Number(view.lighting.ambientIntensity);
      if (fill) {
        if (view.lighting.fillColor) fill.color.set(view.lighting.fillColor);
        if (Number.isFinite(Number(view.lighting.fillIntensity))) fill.intensity = Number(view.lighting.fillIntensity);
      }
    }
    view.setLighting = function (settings, render) {
      applyLighting(settings);
      if (render !== false) view.render();
    };

    var minEl = opts.minEl != null ? opts.minEl : -0.2,
      maxEl = opts.maxEl != null ? opts.maxEl : 1.4,
      minDist = opts.minDist != null ? opts.minDist : 50,
      maxDist = opts.maxDist != null ? opts.maxDist : 2500;

    /* The backend is async, so the very first paint is a no-op and the panel
       would sit blank until the user's next edit. Repaint on ready. */
    gpuReady(rr).then(function () { view.render(); });

    var drag = null;
    var threeFinger = bindThreeFingerPan(cv, function (dx, dy) {
      drag = { mode: "pan", threeFinger: true, moved: true, x: 0, y: 0, sx: 0, sy: 0 };
      view._skipContext = true;
      view.panBy(dx, dy, true);
    });
    var longPressTimer = 0;
    function cancelLongPress() {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = 0;
    }
    cv.addEventListener("pointerdown", function (e) {
      // CAD navigation: middle-drag (or Shift + primary-drag on mice without
      // a middle button) pans. Primary-drag keeps the existing orbit gesture.
      // Selection is still a stationary primary click. SolidWorks-style RMB
      // is a context click until it travels, then a mouse gesture. On a
      // trackpad or touch screen, three-finger drag pans instead of orbiting.
      if (threeFinger()) return;
      var primary = e.button === 0 || e.pointerType === "touch";
      if (opts.beginDrag && primary && !e.shiftKey && opts.beginDrag(e, view)) {
        drag = { mode: "custom", x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
        return;
      }
      var mode = e.button === 1 ? "pan"
        : (opts.cadNav && e.button === 2) ? "gesture"
        : (e.button === 0 && e.shiftKey) ? "maybePan"
        : "orbit";
      if (mode === "pan" || mode === "gesture") e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, mode: mode };
      if (e.pointerType === "touch" && e.button === 0 && opts.longPress) {
        var press = { clientX: e.clientX, clientY: e.clientY, pointerType: "touch", button: 0 };
        longPressTimer = setTimeout(function () {
          longPressTimer = 0;
          if (!drag || drag.moved) return;
          drag.moved = true;
          drag.longPressed = true;
          opts.longPress(press, view);
        }, 520);
      }
    });
    cv.addEventListener("pointermove", function (e) {
      if (threeFinger()) return;
      if (!drag || drag.mode === "custom") return;
      var travel = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      var moveThreshold = e.pointerType === "touch" ? 10 : 4;
      if (e.pointerType === "touch" && !drag.moved && travel <= moveThreshold) return;
      if (travel > moveThreshold) {
        drag.moved = true;
        cancelLongPress();
        if (view.fixedFrame && drag.mode === "orbit") view.clearFixedFrame(false);
      }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.mode === "gesture") {
        drag.x = e.clientX; drag.y = e.clientY;
        if (opts.gesturePreview) opts.gesturePreview(e, view, e.clientX - drag.sx, e.clientY - drag.sy);
        return;
      }
      if (drag.mode === "pan" || (drag.mode === "maybePan" && drag.moved)) view.panBy(dx, dy, false);
      else if (drag.mode === "orbit") {
        view.az += dx * 0.009;
        view.el = clamp(view.el + dy * 0.006, minEl, maxEl);
      }
      drag.x = e.clientX; drag.y = e.clientY;
      view.render();
    });
    cv.addEventListener("pointerup", function (e) {
      cancelLongPress();
      if (threeFinger()) return;
      var current = drag;
      drag = null;
      if (!current) return;
      if (current.mode === "custom" || current.threeFinger) return;
      if (current.mode === "gesture") {
        var gdx = e.clientX - current.sx, gdy = e.clientY - current.sy;
        if (current.moved) {
          view._skipContext = true;
          if (opts.gesture) opts.gesture(e, view, gdx, gdy);
        }
        return;
      }
      // Some touch stacks report button=-1 when the contact is released. The
      // pointer type is authoritative there; a stationary finger is a primary
      // pick just like a stationary left click.
      var primary = e.button === 0 || e.pointerType === "touch";
      var wasClick = primary && !current.moved && (current.mode === "orbit" || current.mode === "maybePan");
      if (wasClick && opts.pick) opts.pick(e, view);
    });
    cv.addEventListener("pointercancel", function () { cancelLongPress(); drag = null; });
    /* A double-click is the CAD shorthand for "grow this pick" — loop from an
       edge, tangent run from a face. The two clicks underneath still land as
       ordinary picks, which is what leaves the right entity selected for the
       grow to start from. Mouse only: a double tap is a zoom gesture on touch,
       and long-press already owns the touch equivalent. */
    cv.addEventListener("dblclick", function (e) {
      if (threeFinger() || e.pointerType === "touch") return;
      if (opts.doubleClick) { e.preventDefault(); opts.doubleClick(e, view); }
    });
    cv.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      if (threeFinger() || view._skipContext) { view._skipContext = false; return; }
      if (opts.cadNav && opts.contextMenu && (!drag || !drag.moved)) opts.contextMenu(e, view);
    });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault();
      view.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    /* Two-finger pinch-to-zoom (and simultaneous pan) — the touch equivalent
       of the mouse wheel above. Three-finger pan is handled by
       bindThreeFingerPan; this covers the gap for two-finger gestures. */
    (function () {
      var pinch = null;
      function d2(e) {
        var a = e.touches[0], b = e.touches[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      }
      function cen(e) {
        var a = e.touches[0], b = e.touches[1];
        return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      }
      cv.addEventListener("touchstart", function (e) {
        if (e.touches.length === 2) {
          pinch = { dist: d2(e), cx: cen(e).x, cy: cen(e).y };
        }
      }, { passive: true });
      cv.addEventListener("touchmove", function (e) {
        if (!pinch || e.touches.length !== 2) { pinch = null; return; }
        e.preventDefault();
        var dist = d2(e), c = cen(e);
        var f = pinch.dist / Math.max(dist, 1);
        var mx = c.x - pinch.cx, my = c.y - pinch.cy;
        pinch.dist = dist;
        pinch.cx = c.x;
        pinch.cy = c.y;
        if (Math.abs(1 - f) > 0.002) view.zoomBy(f);
        if (Math.hypot(mx, my) > 0.5) view.panBy(mx, my, false);
        view.render();
      }, { passive: false });
      function end(e) {
        if (e.touches.length < 2) pinch = null;
      }
      cv.addEventListener("touchend", end);
      cv.addEventListener("touchcancel", end);
    })();

    /* Sizing follows the box the canvas has been put in. As a panel thumbnail
       that is a fixed aspect ratio; promoted into the middle pane it is the
       view, so it takes the whole room it is given. */
    // a number, or a function for a caller whose big pane changes shape
    function bigZoom() {
      return (typeof opts.bigZoom === "function" ? opts.bigZoom() : opts.bigZoom) || 1.3;
    }
    var lastW = 0, lastH = 0, settling = 0, sizeDirty = true;
    view.invalidateSize = function () { sizeDirty = true; };
    if (typeof window !== "undefined") window.addEventListener("resize", function () { sizeDirty = true; });
    view.resize = function (force) {
      if (!force && !sizeDirty) return false;
      var box = cv.parentElement;
      if (!box) return false;
      var r = box.getBoundingClientRect();
      /* The overlay is laid out the same frame it is shown, so the first
         render can land while the panel still measures a few pixels wide.
         Sizing to that bakes in a postage stamp until something else forces a
         redraw — skip instead and come back next frame. Bounded, so a genuinely
         collapsed panel does not spin a repaint loop. */
      if (r.width < 40 || r.height < 20) {
        if (settling++ < 10) requestAnimationFrame(function () { view.render(); });
        return false;
      }
      settling = 0;
      sizeDirty = false;
      var pad = view.big ? 0 : opts.pad || 16,
        w = Math.max(50, Math.round(r.width - pad)),
        h = Math.max(50, Math.round((view.big || (typeof opts.fitContainerHeight === "function" ? opts.fitContainerHeight() : opts.fitContainerHeight)) ? r.height - pad : w * (opts.ratio || 0.78)));
      // compare against what we asked for, not canvas.width — that is the
      // backing-store size and never equals w on a 2x display, so the old
      // check re-sized the renderer on literally every frame
      if (w === lastW && h === lastH) return false;
      lastW = w;
      lastH = h;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      // update the CSS size too, so the canvas has no dead letterbox
      rr.setSize(w, h, true);
      return true;
    };

    // put the camera on its orbit around `center`, then draw
    view.place = function () {
      if (opts.lighting) applyLighting(opts.lighting(view));
      var d = view.dist * (view.big ? bigZoom() : 1),
        az = view.az,
        el = view.el,
        cy = opts.center ? opts.center() : 0,
        tx = view.target.x,
        ty = cy + view.target.y,
        tz = view.target.z;
      key.target.position.set(tx, ty, tz);
      key.target.updateMatrixWorld();
      if (key.castShadow) {
        var reach = Math.max(60, d), shadowCam = key.shadow.camera;
        if (shadowCam.right !== reach) {
          shadowCam.left = -reach; shadowCam.right = reach;
          shadowCam.top = reach; shadowCam.bottom = -reach;
          shadowCam.updateProjectionMatrix();
        }
        var neededLightFar = Math.max(4000, (Number(view.lighting.distance) || 1) * 2);
        if (shadowCam.far !== neededLightFar) {
          shadowCam.far = neededLightFar;
          shadowCam.updateProjectionMatrix();
        }
      }
      /* Keep the source relative to its target so panning cannot change the
         illumination direction and callers can reproduce a room light rig. */
      var lightAz = THREE.MathUtils.degToRad(Number(view.lighting.azimuth) || 0),
        lightEl = THREE.MathUtils.degToRad(Number(view.lighting.elevation) || 0),
        lightDistance = Math.max(1, Number(view.lighting.distance) || 1),
        lightHorizontal = Math.cos(lightEl) * lightDistance;
      key.position.set(
        tx + Math.sin(lightAz) * lightHorizontal,
        ty + Math.sin(lightEl) * lightDistance,
        tz + Math.cos(lightAz) * lightHorizontal
      );
      if (view.fixedFrame) {
        var frame = view.fixedFrame,
          origin = {
            x: frame.origin.x + view.target.x,
            y: frame.origin.y + view.target.y,
            z: frame.origin.z + view.target.z,
          },
          normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z).normalize(),
          up = new THREE.Vector3(frame.yAxis.x, frame.yAxis.y, frame.yAxis.z).normalize();
        cam.up.copy(up);
        cam.position.set(origin.x + normal.x * d, origin.y + normal.y * d, origin.z + normal.z * d);
        cam.lookAt(origin.x, origin.y, origin.z);
        return;
      }
      cam.up.set(0, 1, 0);
      cam.position.set(
        tx + Math.sin(az) * Math.cos(el) * d,
        ty + Math.sin(el) * d,
        tz + Math.cos(az) * Math.cos(el) * d
      );
      cam.lookAt(tx, ty, tz);
    };

    view.render = function () {
      if (opts.active && !opts.active()) return;
      view.resize();
      // an editor with a second destination for the same parts (the modeler's
      // context room) takes over here and draws it its own way
      if (opts.draw && opts.draw(view)) { if (opts.afterRender) opts.afterRender(view); return; }
      view.place();
      gpuRender(rr, sc, cam);
      // DOM overlays that track a point in the scene (handle readouts) are
      // placed here, so they follow an orbit rather than the last rebuild
      if (opts.afterRender) opts.afterRender(view);
    };

    // swap the contents of the view's group; the callback does the building
    view.rebuild = function (fn) {
      clearGroup(grp);
      if (fn) fn(grp);
      /* Cache model bounds once per rebuild. Pointer hover may raycast every
         animation frame; recomputing a Box3 there makes dense assemblies feel
         sticky. The farthest bound supplies a safe perspective broad phase. */
      var box = new THREE.Box3().setFromObject(grp);
      view.pickBounds = box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere());
      view.render();
    };

    view.setBig = function (b) {
      view.big = !!b;
      view.render();
    };
    // point the camera at a standard direction (used by the axis buttons)
    view.orbitTo = function (az, el) {
      view.clearFixedFrame(false);
      view.az = az;
      view.el = clamp(el, minEl, maxEl);
      view.render();
    };
    // Lock the camera square to an arbitrary planar sketch. GridHelper starts
    // in XZ (normal +Y), so the same frame also orients the construction grid.
    view.lookAtFrame = function (frame) {
      if (!frame || !frame.origin || !frame.normal || !frame.yAxis) return;
      view.fixedFrame = JSON.parse(JSON.stringify(frame));
      if (grid) {
        var n = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z).normalize();
        var x = new THREE.Vector3(frame.xAxis.x, frame.xAxis.y, frame.xAxis.z).normalize();
        var z = new THREE.Vector3(frame.yAxis.x, frame.yAxis.y, frame.yAxis.z).normalize().multiplyScalar(-1);
        grid.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, n, z));
        grid.position.set(frame.origin.x, frame.origin.y, frame.origin.z);
      }
      view.render();
    };
    view.clearFixedFrame = function (render) {
      view.fixedFrame = null;
      cam.up.set(0, 1, 0);
      if (grid) {
        grid.quaternion.identity();
        grid.position.set(0, 0, 0);
      }
      if (render !== false) view.render();
    };
    // Keep every zoom entry point on the same distance limits. Editors use
    // this for their toolbar and for the sketch canvas layered over the model;
    // the preview canvas wheel uses it too.
    view.zoomBy = function (factor) {
      if (!(factor > 0)) return;
      view.dist = clamp(view.dist * factor, minDist, maxDist);
      view.render();
    };
    // Translate the orbit target in the camera plane. Scaling by distance and
    // viewport height keeps a drag feeling the same at every zoom level.
    /* World units per screen pixel at the orbit target — what a handle needs to
       stay a constant size on screen, and what a drag needs to track the
       cursor one-to-one instead of racing ahead of it. */
    view.worldPerPixelAtDistance = function (distance) {
      var d = Number(distance);
      if (!(d > 0)) d = view.dist * (view.big ? bigZoom() : 1);
      var height = Math.max(1, cv.clientHeight || 1);
      return 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) / height;
    };
    view.worldPerPixel = function () {
      return view.worldPerPixelAtDistance(view.dist * (view.big ? bigZoom() : 1));
    };
    view.farthestWorldPerPixel = function () {
      if (!view.pickBounds) return view.worldPerPixel();
      var distance = cam.position.distanceTo(view.pickBounds.center) + view.pickBounds.radius;
      return view.worldPerPixelAtDistance(distance);
    };

    view.panBy = function (dx, dy, render) {
      view.place();
      cam.updateMatrixWorld();
      var height = Math.max(1, cv.clientHeight || 1);
      var scale = 2 * view.dist * Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5)) / height;
      var right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      var up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      view.target.addScaledVector(right, -dx * scale);
      view.target.addScaledVector(up, dy * scale);
      if (render !== false) view.render();
    };
    view.resetPan = function (render) {
      view.target.set(0, 0, 0);
      if (render !== false) view.render();
    };
    view.frame = function (radius) {
      view.dist = clamp(radius, minDist, maxDist);
      view.target.set(0, 0, 0);
    };
  } catch (e) {
    // no WebGL at all — the editors treat a null view as "no preview" and
    // carry on in 2D rather than failing to open
    return null;
  }
  return view;
}

/* One renderer, two homes. `wrap` is the element the canvas sits in; it is
   moved between the side panel and the big pane instead of a second context
   being created. Returns a setter that both editors call from their mode
   switch. */
export function createViewportSwap(o) {
  /* Where the thumbnail sits when it comes home. Remembered from where it
     started rather than assumed to be the first child — the modeler's panel
     opens with a drag-resizer that has to stay above it. */
  var anchor = o.wrap.nextSibling,
    home = o.panelHost || o.wrap.parentElement;
  return function setBig(big, view) {
    if (!home && o.wrap.parentElement !== o.bigHost) {
      home = o.wrap.parentElement;
      anchor = o.wrap.nextSibling;
    }
    if (big) o.bigHost.appendChild(o.wrap);
    else if (home) home.insertBefore(o.wrap, anchor && anchor.parentElement === home ? anchor : null);
    else o.wrap.remove();
    if (view) {
      // a new home is a new size; the window never resized, so say so
      if (view.invalidateSize) view.invalidateSize();
      view.setBig(big);
    }
  };
}

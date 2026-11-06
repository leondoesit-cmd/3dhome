/* The CAD editor's preview setup, display modes and section view, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { framePoint } from "../core/frame.js";
import { sketchGeometryBounds } from "../core/sketch_view_fit.js";
import { fmtLen } from "../display_units.js";
import { createEditorView } from "../editor_view.js";
import { applyMouseGesture, previewMouseGesture } from "../modeler/command_manager.js";
import { activeSketchFrame, invalidateSketchProjection, sameSketchContext, standardPlaneFrame } from "../modeler/document_history.js";
import { syncViewButtons } from "../modeler/document_save.js";
import { drawSketch } from "../modeler/drawing_sheet.js";
import { growSelectionFromDoubleClick } from "../modeler/finish_preview.js";
import { setMode } from "../modeler/library_io.js";
import { drawInRoom, renderPreview, updatePreview } from "../modeler/library_panel.js";
import { assemblyBounds, defBounds, renderedParts } from "../modeler/library_store.js";
import { hoverAssemblyTopology, syncNotesAndMarkups } from "../modeler/notes_markups.js";
import { sizeSketch, syncHint } from "../modeler/sketch_entities.js";
import { refreshDecorationScale } from "../modeler/viewport_decorations.js";
import { beginInstant3dDrag, hitInstant3d, instant3dAuthoringState, pickAssemblyComponent, showSelectThrough, syncInstant3dValue } from "../modeler/viewport_input.js";
import { refreshDecorations } from "../modeler/viewport_state.js";
import { ensureSketch, ensureSketchDoc } from "../sketch_solver.js";
import { THREE, loadThree, threeLoaded } from "../three_lazy.js";
import { getRigLights } from "../view3d.js";
import { E, root, swapView } from "../modeler.js";

function initPreview() {
  /* three is late-bound (js/three_lazy.js), and openModeler() must stay
     SYNCHRONOUS — callers click #mdSave in the same tick that they open the
     editor. So the editor's DOM is built either way and only the 3D viewport
     waits: E.pv stays null until three lands, exactly the state every call
     site already handles for a machine with no GPU (createEditorView returns
     null there), and then the viewport appears. */
  if (!threeLoaded()) {
    loadThree().then(function () {
      if (root && !E.pv) {
        initPreview();
        if (E.open) { layout3DHost(); updatePreview(); renderPreview(); }
      }
    }, function () {});
    return;
  }
  var orbitProjection='perspective';try{if(localStorage.getItem('modelforge:orbitProjection')==='orthographic')orbitProjection='orthographic';}catch(error){}
  E.pv = createEditorView({
    projection:orbitProjection,
    canvas: root.querySelector("#mdPrev"),
    fov: 45, near: 0.1, far: 5000,
    grid: true, gridOpacity: 0.26, shadows: true,
    ambient: 0.62, keyLight: 1.05, fill: 0.22,
    az: 0.8, el: 0.5, dist: 260,
    minEl: -1.5, maxEl: 1.5, minDist: 1, maxDist: 2000,
    pad: 16, ratio: 0.75,
    fitContainerHeight: function () { return E.mode === "3d"; },
    center: function () {
      if (E.docType === "assembly") return 0;
      var b = defBounds(E.def);
      return (b.y0 + b.y1) / 2;
    },
    active: function () { return E.open; },
    draw: drawInRoom,
    pick: pickAssemblyComponent,
    cadNav: true,
    normalToOrthographic: true,
    beginDrag: beginInstant3dDrag,
    contextMenu: function (event) { showSelectThrough(event, E.pv); },
    longPress: showSelectThrough,
    doubleClick: function () { growSelectionFromDoubleClick(); },
    afterRender: function (view) {
      syncViewButtons();
      syncInstant3dValue(view);
      syncNotesAndMarkups(view);
      refreshDecorationScale();
      /* The sketch is a 2D canvas projected through this camera. Repaint after
         every orbit/zoom render or the solid moves while its drawing stays in
         the old screen position. Both layers remain visible and aligned. */
      if (E.mode === "3d" && E.modelPlaneActive && E.cv) drawSketch();
    },
    lighting: editorLightingSettings,
    gesturePreview: previewMouseGesture,
    gesture: function (event, view, dx, dy) { applyMouseGesture(dx, dy); },
  });
  // second copy of the parts, placed into the real scene for context rendering
  if (E.pv) {
    E.pv.roomGrp = new THREE.ClippingGroup(); E.pv.roomGrp.enabled = false;
    // The mode can relocate the canvas while Three is still loading. Apply
    // that current home to the new renderer before its first sized render.
    if (swapView) swapView(E.mode === "3d" || !!E.split, E.pv, { render: false });
  }
  // same debugging handle the preview rebuild already exposes
  if (typeof window !== "undefined") window.cadPreviewView = E.pv;
  /* Pre-highlight whatever the cursor is over. Throttled to one resolve per
     frame — a raycast per pointermove event on a dense model is a stutter, and
     the highlight only ever needs to be right at paint time. */
  var canvas = root.querySelector("#mdPrev");
  if (canvas && E.pv) {
    /* The navigation sentence is first-run help. Once the viewport has been
       operated, leave only the small ? affordance; live tool and selection
       messages still take precedence and remain visible. */
    var dismissIdleHint = function () {
      if (E.mode !== "3d" || E.modelPlaneActive || E.facePick || (E.topologySelection || []).length) return;
      E.hintDismissed = true;
      syncHint();
    };
    canvas.addEventListener("pointerdown", dismissIdleHint, { passive: true });
    canvas.addEventListener("wheel", dismissIdleHint, { passive: true });
    var queued = null, latestHoverEvent = null;
    function cancelQueuedHover() {
      latestHoverEvent = null;
      if (queued) cancelAnimationFrame(queued);
      queued = null;
    }
    canvas.addEventListener("pointermove", function (event) {
      if (event.buttons) { cancelQueuedHover(); return; }   // mid-orbit: no picking
      /* Pointer events can outnumber paints by an order of magnitude. Keep a
         small value snapshot of the newest coordinates; retaining the first
         event in the frame makes the highlight trail a fast cursor. */
      latestHoverEvent = {
        clientX: event.clientX, clientY: event.clientY,
        pointerType: event.pointerType, currentTarget: canvas,
      };
      if (queued) return;
      queued = requestAnimationFrame(function () {
        queued = null;
        var event = latestHoverEvent;
        latestHoverEvent = null;
        if (!event) return;
        /* Show where the arrow's grab zone is. Missing it starts an orbit
           instead, and an orbit is exactly what "the handle does nothing"
           looks like from the outside. */
        var instantHit = !E.facePick && instant3dAuthoringState() ? hitInstant3d(event, E.pv) : null;
        var overHandle = !!instantHit;
        canvas.style.cursor = E.facePick ? "crosshair" : overHandle ? "grab" : "";
        if (overHandle) return;
        hoverAssemblyTopology(event, E.pv, instantHit);
      });
    });
    canvas.addEventListener("pointerleave", function () {
      cancelQueuedHover();
      canvas.style.cursor = "";
      if (!E.hoverTopology) return;
      E.hoverTopology = null;
      refreshDecorations();
    });
  }
}

/* The isolated editor normally owns a compact studio rig. When room matching
   is enabled, copy the live sun vector rather than merely copying its angle:
   the source distance, color, and intensity then remain identical as the room
   time-of-day or north bearing changes. The target is remapped to the model's
   centre by editor_view, which preserves that vector without moving the part. */
function editorLightingSettings(view) {
  if (!view) return null;
  if (!E._manualLightBase && view.lighting) {
    E._manualLightBase = {
      keyColor: view.lighting.keyColor,
      keyIntensity: view.lighting.keyIntensity,
      ambientColor: view.lighting.ambientColor,
      ambientIntensity: view.lighting.ambientIntensity,
      fillColor: view.lighting.fillColor,
      fillIntensity: view.lighting.fillIntensity,
    };
  }
  if (!E.lightMatchRoom) return Object.assign({}, E._manualLightBase || {}, {
    azimuth: E.lightAzimuth,
    elevation: E.lightElevation,
    distance: E.lightDistance,
  });
  var rig = getRigLights(), sun = rig && rig.sun;
  if (!sun || !sun.target) return null;
  var offset = new THREE.Vector3().subVectors(sun.position, sun.target.position);
  if (E.srcItem && E.srcItem.rot) {
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Number(E.srcItem.rot) * Math.PI / 180);
  }
  var distance = Math.max(1, offset.length()), horizontal = Math.hypot(offset.x, offset.z);
  return {
    azimuth: Math.atan2(offset.x, offset.z) * 180 / Math.PI,
    elevation: Math.atan2(offset.y, horizontal) * 180 / Math.PI,
    distance: distance,
    keyColor: "#" + sun.color.getHexString(),
    keyIntensity: sun.intensity,
    ambientColor: rig.hemi ? "#" + rig.hemi.color.getHexString() : undefined,
    ambientIntensity: rig.hemi ? rig.hemi.intensity : undefined,
    fillColor: rig.fill ? "#" + rig.fill.color.getHexString() : undefined,
    fillIntensity: rig.fill ? rig.fill.intensity : undefined,
  };
}

function setModelDisplay(style, refresh) {
  E.displayStyle = style === "transparent" ? "transparent" : "solid";
  if (root) root.querySelectorAll("[data-display]").forEach(function (button) {
    var active = button.getAttribute("data-display") === E.displayStyle;
    button.classList.toggle("on", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (refresh !== false) updatePreview();
}

function setShowModelEdges(on, refresh) {
  E.showModelEdges = on !== false;
  if (root) {
    var button = root.querySelector("#mdShowEdges");
    if (button) {
      button.classList.toggle("on", E.showModelEdges);
      button.setAttribute("aria-pressed", E.showModelEdges ? "true" : "false");
    }
  }
  if (refresh !== false) updatePreview();
}

function setPanelCollapsed(side, collapsed) {
  if (!root) return;
  var left = side === "left";
  if (left) E.leftCollapsed = !!collapsed;
  else {
    E.rightCollapsed = !!collapsed;
    if (E.mode === "drawing") {
      root.classList.toggle("md-sheet-collapsed", !!collapsed);
    }
  }
  root.classList.toggle(left ? "md-left-collapsed" : "md-right-collapsed", !!collapsed);
  var button = root.querySelector(left ? "#mdToggleLeft" : "#mdToggleRight");
  if (button) button.setAttribute("aria-pressed", collapsed ? "false" : "true");
  sizeSketch();
  drawSketch();
  requestAnimationFrame(layout3DHost);
}

function sectionPlane() {
  var axis = E.section && E.section.axis || "x";
  var sign = E.section && E.section.flip ? -1 : 1;
  var normal = axis === "y" ? new THREE.Vector3(0, sign, 0)
    : axis === "z" ? new THREE.Vector3(0, 0, sign)
    : new THREE.Vector3(sign, 0, 0);
  return new THREE.Plane(normal, -(Number(E.section && E.section.offset) || 0) * sign);
}

function applySectionClipping(group) {
  if (!group || !E.pv) return;
  var enabled = !!(E.section && E.section.enabled), plane = enabled ? sectionPlane() : null;
  // Live previews are ordinary child groups and inherit these planes. Keeping
  // clipping on the root also covers edges and meshes added asynchronously.
  if (!group.isClippingGroup) return;
  group.enabled = enabled;
  group.clippingPlanes = plane ? [plane] : [];
  group.clipShadows = enabled;
}

function syncSectionHelper() {
  if (!E.pv) return;
  if (E.pv.sectionHelper) {
    E.pv.sc.remove(E.pv.sectionHelper);
    if (E.pv.sectionHelper.geometry) E.pv.sectionHelper.geometry.dispose();
    if (E.pv.sectionHelper.material) E.pv.sectionHelper.material.dispose();
    E.pv.sectionHelper = null;
  }
  if (!(E.section && E.section.enabled)) return;
  var bounds = E.def ? defBounds(E.def) : null;
  var span = bounds ? Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, bounds.z1 - bounds.z0, 80) : 160;
  E.pv.sectionHelper = new THREE.PlaneHelper(sectionPlane(), span * 1.3, 0x2dd4bf);
  E.pv.sectionHelper.name = "Section plane";
  E.pv.sc.add(E.pv.sectionHelper);
}

function setSectionState(next) {
  E.section = Object.assign({ enabled:false, axis:"x", offset:0, flip:false }, E.section || {}, next || {});
  if (!root) return;
  var controls = root.querySelector("#mdSectionControls");
  if (controls) controls.hidden = !E.section.enabled;
  root.querySelectorAll("[data-section-axis]").forEach(function (button) {
    button.classList.toggle("on", button.getAttribute("data-section-axis") === E.section.axis);
  });
  var slider = root.querySelector("#mdSectionOffset"), output = root.querySelector("#mdSectionValue");
  if (slider) slider.value = String(E.section.offset);
  if (output) output.textContent = fmtLen(E.section.offset);
  var flip = root.querySelector("#mdSectionFlip");
  if (flip) flip.classList.toggle("on", !!E.section.flip);
  if (E.pv) {
    applySectionClipping(E.pv.grp);
    applySectionClipping(E.pv.roomGrp);
    syncSectionHelper();
    E.pv.render();
  }
}

function toggleSectionView() {
  if (E.mode !== "3d") setMode("3d");
  setSectionState({ enabled:!(E.section && E.section.enabled) });
}

/* The panels are columns in the body's flex row now, not cards floating over a
   full-bleed middle pane, so the middle pane IS the free space — the big model
   view fills it with plain `inset: 0` and the old measure-the-gaps pass (which
   also had to mirror itself in RTL) is gone. */
function layout3DHost() {
  if (E.pv) {
    if (E.pv.invalidateSize) E.pv.invalidateSize();
    // The sheet is a 2D canvas. Compiling the hidden preview's shader here can
    // throw before the mode buttons update, leaving a partial drawing switch.
    if (E.mode !== "drawing") E.pv.render();
  }
}

/* Frame whatever is modelled so it fills the view it has just been given —
   the thumbnail's distance is wrong for a pane ten times the size. */
/* The extent of the sketch being drawn right now, in world space. fitPreview()
   needs it because a part is all sketch and no solid right up until the first
   extrude: with nothing rendered, defBounds() falls back to a fixed 60-unit box
   and framed that instead, which left a 6.9cm profile as a speck in the middle
   of the screen — and Zoom to fit, the one control meant to rescue it, a no-op.
   Only the sketch the user is actually on counts; other sketches on the plane
   are dimmed references and should not drag the frame out to meet them. */
function activeSketchWorldBounds() {
  if (!E.def) return null;
  var current = ensureSketch(E.def);
  var u0, u1, v0, v1, frame = null;
  ensureSketchDoc(E.def).forEach(function (sketch) {
    if (!sameSketchContext(sketch, current)) return;
    if (!frame) frame = activeSketchFrame() || standardPlaneFrame(E.view, sketch.offset);
    var geometry=sketchGeometryBounds(sketch);if(!geometry)return;
    u0=u0===undefined?geometry.u0:Math.min(u0,geometry.u0);u1=u1===undefined?geometry.u1:Math.max(u1,geometry.u1);
    v0=v0===undefined?geometry.v0:Math.min(v0,geometry.v0);v1=v1===undefined?geometry.v1:Math.max(v1,geometry.v1);
  });
  if (u0 === undefined || !frame) return null;
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  [[u0, v0], [u0, v1], [u1, v0], [u1, v1]].forEach(function (uv) {
    var w = framePoint(frame, uv[0], uv[1], 0);
    b.x0 = Math.min(b.x0, w.x); b.x1 = Math.max(b.x1, w.x);
    b.y0 = Math.min(b.y0, w.y); b.y1 = Math.max(b.y1, w.y);
    b.z0 = Math.min(b.z0, w.z); b.z1 = Math.max(b.z1, w.z);
  });
  return b;
}

function fitPreview() {
  if (!E.pv || !E.def) return;
  if (E.docType === "assembly") {
    /* Framing off the component count showed two small parts as specks and cut
       widely mated ones off at the edges. Measure what is actually there. */
    var box = assemblyBounds();
    var span = box
      ? Math.max(1, Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0))
      : 180;
    E.pv.frame(span * 1.5,box);
    if(box){
      var origin=E.pv.fixedFrame?.origin || {x:0,y:0,z:0};
      E.pv.target.set((box.x0+box.x1)/2-origin.x,(box.y0+box.y1)/2-origin.y,(box.z0+box.z1)/2-origin.z);
    }
    E.pv.render();
    return;
  }
  /* Frame the solids and the live sketch together, the way Zoom to Fit does:
     either one alone can be the larger of the two. */
  var sketchBox = activeSketchWorldBounds();
  var b = renderedParts(E.def).length ? defBounds(E.def) : sketchBox;
  if(E.contextEdit){
    var ghost=E.pv.grp?.children.find(function(object){return object.userData.cadAssemblyContext;});
    if(ghost){var ghostBox=new THREE.Box3().setFromObject(ghost);if(!ghostBox.isEmpty()){
      var gb={x0:ghostBox.min.x,x1:ghostBox.max.x,y0:ghostBox.min.y,y1:ghostBox.max.y,z0:ghostBox.min.z,z1:ghostBox.max.z};
      b=b?{x0:Math.min(b.x0,gb.x0),x1:Math.max(b.x1,gb.x1),y0:Math.min(b.y0,gb.y0),y1:Math.max(b.y1,gb.y1),z0:Math.min(b.z0,gb.z0),z1:Math.max(b.z1,gb.z1)}:gb;
    }}
  }
  if (b && sketchBox && b !== sketchBox) b = {
    x0: Math.min(b.x0, sketchBox.x0), x1: Math.max(b.x1, sketchBox.x1),
    y0: Math.min(b.y0, sketchBox.y0), y1: Math.max(b.y1, sketchBox.y1),
    z0: Math.min(b.z0, sketchBox.z0), z1: Math.max(b.z1, sketchBox.z1),
  };
  if (!b) b = defBounds(E.def);
  if(E.modelPlaneActive && E.pv.fixedFrame && E.pv.framePlane){
    E.pv.framePlane(b);invalidateSketchProjection();E.pv.render();return;
  }
  var dx = b.x1 - b.x0, dy = b.y1 - b.y0, dz = b.z1 - b.z0,
    r = Math.max(1, Math.hypot(dx, dy, dz));
  E.pv.frame(r * 1.5,b);
  // Plane-aligned sketch cameras use the frame origin plus the pan target.
  // Fitting the size alone leaves off-origin geometry behind the view controls.
  if (E.pv.fixedFrame) {
    var origin = E.pv.fixedFrame.origin;
    E.pv.target.set((b.x0+b.x1)/2-origin.x,(b.y0+b.y1)/2-origin.y,(b.z0+b.z1)/2-origin.z);
  } else {
    // The orbit view adds the solid's Y center in createEditorView.place().
    // X/Z have no automatic baseline; fit their offset as well as the size.
    var modelBox=defBounds(E.def),centerY=(modelBox.y0+modelBox.y1)/2;
    E.pv.target.set((b.x0+b.x1)/2,(b.y0+b.y1)/2-centerY,(b.z0+b.z1)/2);
  }
  E.pv.render();
}

export {
  applySectionClipping, fitPreview, initPreview, layout3DHost, sectionPlane,
  setModelDisplay, setPanelCollapsed, setSectionState, setShowModelEdges,
  syncSectionHelper, toggleSectionView,
};

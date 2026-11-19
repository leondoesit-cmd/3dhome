/* The CAD editor's drawing sheet panel sync, hints, drawing document and sheet
   rendering, split out of drawing_sheet.js, split out of
   js/modeler/drawing_sheet.js. It shares the editor's state through live
   imports from ./drawing_sheet.js. */
import { drawingMaterialName } from "../cad_appearances.js";
import { assemblyHasExplodedOffsets } from "../cad_exploded_view.js";
import { ensureSheetDoc, scaleLabel } from "../cad_sheet.js";
import { ensureAssemblyDrawingDoc } from "../core/assembly_drawing_settings.js";
import { sheetTitleMeta } from "../core/custom_properties.js";
import { documentDefaults } from "../core/document_presets.js";
import { drawingViewScaleControl } from "../core/drawing_scale_control.js";
import { framePoint } from "../core/frame.js";
import { calloutText, calloutTextById, holeCallouts } from "../core/hole_callout.js";
import { modelLibraryRevision } from "../core/model_library_store.js";
import { configuredViewId } from "../core/native_configured_drawing.js";
import { surfaceSketchWorldPolyline } from "../core/surface_uv.js";
import { boxSelectMode } from "../modeler_chrome.js";
import { createDrawingController } from "../modeler_drawing.js";
import { entityStatuses, sketchStatusColor } from "../modeler_inference.js";
import { holeLoop } from "../modeler_mesh_geometry.js";
import { syncModelerMobile } from "../modeler_mobile.js";
import { t } from "../modeler_strings.js";
import { E, H, pathSketchSpline, root } from "../modeler.js";
import { clearGroup } from "../primitives.js";
import { drawConstraintGlyphs, drawSketchDimensions } from "../sketch_dimensions.js";
import { drawNameTags, relationTargets, sketchInstanceNames } from "../sketch_names.js";
import { circleData, ellipseData, ensureSketch, ensureSketchDoc, solveSketch } from "../sketch_solver.js";
import { bezierPoint, splineControls } from "../sketch_spline.js";
import { tangentArc } from "../sketch_tangent_arc.js";
import { threePointArc } from "../sketch_three_point_arc.js";
import { fin } from "../state.js";
import { THREE } from "../three_lazy.js";
import { syncContextActions } from "./command_manager.js";
import { dynDrawHud, pointToLineDistance } from "./dimension_entry.js";
import { activeSketchFrame, currentHistoryNode, invalidateSketchProjection, partUV, pathUvCircleArc, pathUvEllipse, positiveArcSweep, pushUndo, sameSketchContext, scheduleModelerDraft, sketchProjection, standardPlaneFrame, strokeUvCircle, strokeUvRect, toPx } from "./document_history.js";
import { assemblyDrawingBOMRows, assemblyDrawingBalloonTargets } from "./document_io.js";
import { sketchOpenPathReadiness } from "./document_save.js";
import { buildSheetPanel, chooseDrawingImage, chooseDrawingProjectImage, sheetForm, sheetPrompt, syncDanglingDims } from "./drawing_sheet_forms.js";
import { drawFeatureAreaHatch, sketchProfileAnalysis } from "./drawing_sheet_profiles.js";
import { drawModelerTouchPrecision, flash, strokeSlotOutline } from "./drawing_sheet_touch.js";
import { assemblyExplodeLines } from "./library_panel.js";
import { defBounds, renderedParts } from "./library_store.js";
import { instanceLabels, refusalHint } from "./sketch_dimension_editor.js";
import { sizeSketch, syncStatus } from "./sketch_entities.js";
import { modelLengthUnit } from "./sketch_workflow.js";
import { fitPreview } from "./view_modes.js";
import { addOverlayPolyline } from "./viewport_decorations.js";
import {
  configuredDrawingStatus, drawingBodies, drawingPresetAction,
  drawingTopology, drawingTopologyAllowed, drawingViewBodies,
  drawingViewSourceIssue, drawingViewSourceToken, explicitDrawingPose,
  resolveDrawingViewSource,
} from "./drawing_sheet.js";

function syncSheetPanel() {
  if (!root) return;
  var host = root.querySelector("#mdSheetPanel");
  if (!host) return;
  var on = E.mode === "drawing";
  host.hidden = !on;
  if (!on) return;
  var doc = drawingDocument(), sheet = drawingSheet();
  var selection = sheet.selection();
  var signature = doc.views.map(function (view) {
    return view.id + ":" + view.label + ":" + JSON.stringify(view.section) + ":" + drawingViewScaleControl(view.scale).value + ":" + (view.scaleMode||'auto') + ":" + view.hidden + ":" + view.hatchPattern + ":" + view.displayStyle + ":" + (view.assemblyState || "") + ":" + drawingViewSourceToken(view) + ":" + (view.configurationId||"")+":"+JSON.stringify(configuredDrawingStatus(view)&&{status:configuredDrawingStatus(view).status,reason:configuredDrawingStatus(view).reason});
  }).join(",") + "#" + JSON.stringify(E.assembly?.explodedViews?.map(v => [v.id,v.name])) + "#" + modelLibraryRevision() + "#" + (selection && selection.kind === "view" ? selection.id : "") + "#" + JSON.stringify(doc.title.sources || {});
  if (host.getAttribute("data-signature") !== signature) {
    buildSheetPanel(host);
    host.setAttribute("data-signature", signature);
    return;
  }
  var set = function (id, value) {
    var node = host.querySelector(id);
    if (node && node !== document.activeElement) node.value = value;
  };
  set("#mdSheetSize", doc.size);
  set("#mdSheetOrientation", doc.orientation);
  set("#mdSheetScale", doc.scale === "fit" ? "fit" : scaleLabel(doc.scale));
  set("#mdSheetUnits", doc.units);
  set("#mdSheetStandard",doc.draftingStandard||"custom");
  set("#mdSheetSecondaryUnits",doc.secondaryUnits||"");
  set("#mdSheetSecondaryPrecision",String(doc.secondaryPrecision??2));
  set("#mdSheetPrecision", Number.isInteger(doc.precision)?String(doc.precision):"auto");
  var trailingZeros=root.querySelector("#mdSheetTrailingZeros");if(trailingZeros)trailingZeros.checked=doc.trailingZeros??Number.isInteger(doc.precision);
  set("#mdSheetProjection", doc.projection);
  var boxes = { "#mdSheetHiddenBox": doc.showHidden !== false, "#mdSheetCentersBox": doc.showCenters !== false, "#mdSheetZonesBox": doc.showZones !== false };
  Object.keys(boxes).forEach(function (id) {
    var node = host.querySelector(id);
    if (node) node.checked = boxes[id];
  });
  host.querySelectorAll("[data-title-field]").forEach(function (input) {
    var key = input.getAttribute("data-title-field"), source = doc.title.sources?.[key];
    input.disabled = !!source && source !== "manual";
    if (input !== document.activeElement) input.value = input.disabled
      ? sheetTitleMeta(doc, E.docType === "assembly" ? E.assembly : E.def)[key] : doc.title[key] || "";
  });
  syncDanglingDims(host);
}

/* What the hint bar says on a sheet: the armed tool's own instruction, because
   "pan the page" is not why anyone opened a drawing. */
function drawingHintText() {
  var tool = E.sheet ? E.sheet.getTool() : "select";
  if(tool==='insertimage')return 'Click the paper, choose a local PNG/JPEG, then set position and size in paper mm';
  if(tool==='insertprojectimage')return 'Click the paper, enter an app-served PNG/JPEG URL, then set position and size in paper mm';
  if(tool==='editimage')return 'Click an inserted image to edit its paper position and size';
  if(tool==='removeimage')return 'Click an inserted image to remove it; Undo restores it';
  if (tool === "dim") return t("drawDimHint");
  if (tool === "angle") return t("drawAngleHint");
  if (tool === "baseline") return t("drawBaselineHint");
  if (tool === "chain") return t("drawChainHint");
  if (tool === "diam") return t("drawDiamHint");
  if (tool === "section") return t("drawSectionHint");
  if (tool === "detail") return t("drawDetailHint");
  if (tool === "auxiliary") return "Choose a named inclined edge in a principal view, then select its native planar face";
  if (tool === "crop") return "Tap a drawing view and boundary points, then Finish boundary; Cancel discards (Enter/Escape also work)";
  if (tool === "uncrop") return "Click a cropped drawing view to restore its full projection";
  if (tool === "brokenout") return "Tap an orthographic view and boundary points, then Finish boundary to set depth in mm; Cancel discards";
  if (tool === "unbrokenout") return "Click a broken-out drawing view to restore its original projection";
  if (tool === "break") return "Choose a single orthographic view; set original boundary coordinates and printed gap. Dimensions retain actual model values";
  if (tool === "unbreak") return "Click a Break view to restore its complete original projection";
  if (tool === "alternateposition") return "Choose a drawing view, then set an illustrative rigid native-body pose for its phantom overlay";
  if (tool === "alignedsection") return "Pick endpoint A, hinge, endpoint B on a principal parent; Enter unfolds real cut faces; Escape cancels";
  if (tool === "removealternateposition") return "Click a drawing view to remove its Alternate Position overlay";
  if (tool === "note") return t("drawNoteHint");
  if (tool === "sheetarc") return t("drawPaperArcHint");
  if (tool === "sheetellipse") return t("drawPaperEllipseHint");
  if (["sheetline","sheetpolyline","sheetrect","sheetcircle"].includes(tool)) return t("drawPaperHint");
  return t("drawingHint");
}

function drawingDocument() {
  var owner=E.docType==='assembly'&&E.assembly?E.assembly:E.def;
  if (!owner) return null;
  var isNew=!owner.drawing;
  var doc=E.docType==='assembly'?ensureAssemblyDrawingDoc(owner):ensureSheetDoc(owner);
  if(isNew&&owner.documentProperties){var defaults=documentDefaults(owner);doc.units=defaults.lengthUnit;doc.draftingStandard=defaults.draftingStandard;doc.projection=defaults.projection;doc.precision=defaults.lengthPrecision;doc.anglePrecision=defaults.anglePrecision;doc.secondaryUnits=defaults.dualDimensions?(defaults.lengthUnit==='in'?'mm':'in'):null;}
  doc.assemblyLayout=E.docType==='assembly';
  return doc;
}

function drawingSheet() {
  if (!E.sheet) {
    E.sheet = createDrawingController({
      canvas: function () { return E.cv; },
      width: function () { return E.cw; },
      height: function () { return E.ch; },
      viewportInsets: function () {
        var canvas=E.cv?.getBoundingClientRect(),status=root.querySelector("#mdStatus")?.getBoundingClientRect();
        return {bottom:canvas && status && status.right>canvas.left && status.left<canvas.right
          ? Math.max(0,canvas.bottom-Math.max(canvas.top,status.top)) : 0};
      },
      doc: drawingDocument,
      model: function () { return E.docType==='assembly'?E.assembly:E.def; },
      isExplodedView: function (view) {
        const pose = explicitDrawingPose(view);
        if (pose) return assemblyHasExplodedOffsets(pose.assembly);
        return resolveDrawingViewSource(view).status==='host' && E.docType==='assembly' && assemblyHasExplodedOffsets(E.assembly);
      },
      bodies: drawingBodies,
      bodiesForView: drawingViewBodies,
      canUseTopologyForView: drawingTopologyAllowed,
      viewSourceToken: drawingViewSourceToken,
      viewSourceForeign: function (view) { return resolveDrawingViewSource(view).status !== 'host'; },
      viewSourceIssue: drawingViewSourceIssue,
      topologyRefusal: function (view) {
        var resolved = resolveDrawingViewSource(view);
        return resolved.status === 'host' ? null : 'Auxiliary views need a named edge. Select one in the drawing for ' + resolved.name + '.';
      },
      topology: function(){return E.docType==='part'&&E.def?.drawing?.views.some(function(v){return configuredViewId(E.def,v);})?null:drawingTopology();},
      /* The live spelling of every hole, re-read on each build so a callout
         cannot outlive the parameters it was placed from. */
      callouts: function () { return calloutTextById(E.def); },
      holeCallouts: function () {
        return holeCallouts(E.def).map(function (row) { return { ...row, text: calloutText(row) }; });
      },
      bodiesToken: function () { return E.sheetToken; },
      meta: function () {
        var doc = drawingDocument(),owner=E.docType==='assembly'?E.assembly:E.def;
        return { ...sheetTitleMeta(doc, owner), material: doc.title.material || (E.docType==='assembly'?'':drawingMaterialName(E.def)) };
      },
      bom: function () {
        if (E.docType !== "assembly" || !E.assembly) return null;
        return assemblyDrawingBOMRows().map(function (row, index) {
          return { item: row.item ?? index + 1, qty: row.quantity, name: row.name, description: row.description, partNumber: row.partNumber, material: row.material || "" };
        });
      },
      componentBalloons:function(){return E.docType==='assembly'?assemblyDrawingBalloonTargets():[];},
      componentBalloonsForView(view) {
        const pose = explicitDrawingPose(view);
        if (pose) return assemblyDrawingBalloonTargets(pose.assembly);
      },
      explodeLinesForView(view) {
        const pose = explicitDrawingPose(view);
        if (pose) return pose.assembly ? (pose.lines ??= assemblyExplodeLines(pose.assembly)) : [];
      },
      explodeLines:function(){return E.docType==='assembly'?assemblyExplodeLines():[];},
      pushUndo: pushUndo,
      /* The drag triad: the step is opened on pointerdown while the sheet is
         still untouched, named on pointerup, and dropped when the gesture put
         everything back (a plain click, or Escape). scheduleModelerDraft runs
         on commit only, because an abandoned gesture changed nothing to save. */
      beginUndo: function (label) { H.begin(label || ""); },
      commitUndo: function (label) { if (H.commit(label)) scheduleModelerDraft(); },
      cancelUndo: function () { H.cancel(); },
      markDirty: function () { E.sheet.invalidateLayout(); drawSketch(); syncSheetPanel(); syncStatus(); },
      flash: flash,
      t: t,
      prompt: sheetPrompt,
      promptFields: sheetForm,
      historyToken: currentHistoryNode,
      chooseImage: chooseDrawingImage,
      chooseProjectImage: chooseDrawingProjectImage,
      presetAction: drawingPresetAction,
      refresh: function () { drawSketch(); syncSheetPanel(); syncModelerMobile(); },
      editTitleBlock: function () {
        var field = root && root.querySelector("#mdSheetTitleField");
        if (field) { field.focus(); field.select(); }
      },
    });
    /* The same debugging door cadPreviewView and cadUpdatePreview open: the
       browser tests drive the sheet through it, since a canvas drawing has no
       DOM to assert against. */
    if (typeof window !== "undefined") window.cadDrawingSheet = E.sheet;
  }
  return E.sheet;
}

/* Every rebuild invalidates the projections: the sheet caches them per body
   token because hidden-line removal is far too expensive to redo on a paint. */
function invalidateDrawing() {
  E.sheetToken++;
  if (E.sheet) E.sheet.invalidate();
}

function pathEllipse(c, o) {
  return pathUvEllipse(c, o, 0, Math.PI * 2, true);
}

function sampleSplinePoints(entity, points, segments) {
  var controls = splineControls(entity, points);
  if (!controls) return [];
  var out = [];
  for (var i = 0; i <= segments; i++) out.push(bezierPoint(controls, i / segments));
  return out;
}

function splineLength(entity, points) {
  var samples = sampleSplinePoints(entity, points, 24);
  return samples.reduce(function (length, point, i) {
    return length + (i ? Math.hypot(point.x - samples[i - 1].x, point.y - samples[i - 1].y) : 0);
  }, 0);
}

/* Split view: the sketches, drawn in the model half as well. The 3D view
   never draws a sketch itself — in Model mode the sketch canvas is laid over
   it — so beside the sketch pane it would show nothing until the first
   extrude. Each sketch is sampled on its own plane (framePoint) into a group
   of its own, rebuilt from drawSketch() only when the geometry changed, and
   gone the moment Split is left. The sketch being edited is bright, the rest
   dim. */
function sketchUvPolylines(sketch) {
  var pts = new Map((sketch.points || []).map(function (q) { return [q.id, q]; })), out = [];
  function ring(center, rx, ry, rot, start, sweep) {
    var n = Math.max(8, Math.ceil(64 * Math.abs(sweep) / (Math.PI * 2))), cr = Math.cos(rot || 0), sr = Math.sin(rot || 0), line = [];
    for (var i = 0; i <= n; i++) {
      var a = start + sweep * i / n, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      line.push({ u: center.x + x * cr - y * sr, v: center.y + x * sr + y * cr });
    }
    return line;
  }
  (sketch.entities || []).forEach(function (e) {
    try {
      if (e.projectedCurve && e.projectedCurve.samples) out.push(e.projectedCurve.samples.map(function (q) { return { u: q.u, v: q.v }; }));
      else if (e.type === "line") {
        var a = pts.get(e.a), b = pts.get(e.b);
        if (a && b) out.push([{ u: a.x, v: a.y }, { u: b.x, v: b.y }]);
      } else if (e.type === "spline") {
        var line = sampleSplinePoints(e, pts, 24);
        if (line.length) out.push(line.map(function (p) { return { u: p.x, v: p.y }; }));
      } else if (e.type === "point") {
        var point = pts.get(e.p), tick = 0.5;
        if (point) {
          out.push([{ u: point.x - tick, v: point.y }, { u: point.x + tick, v: point.y }]);
          out.push([{ u: point.x, v: point.y - tick }, { u: point.x, v: point.y + tick }]);
        }
      } else if (e.type === "ellipse") {
        var el = ellipseData(e, pts);
        if (el) out.push(ring(el.center, el.rx, el.ry, el.rot, 0, Math.PI * 2));
      } else if (e.type === "circle" || e.type === "arc") {
        var o = circleData(e, pts);
        if (o) out.push(e.type === "arc" ? ring(o.center, o.radius, o.radius, 0, o.start, positiveArcSweep(o.start, o.end)) : ring(o.center, o.radius, o.radius, 0, 0, Math.PI * 2));
      }
    } catch (error) { /* a half-built entity draws nothing this frame */ }
  });
  return out;
}
function sketchWorldFrame(sketch) {
  return sketch.frameSpace === "local" && sketch.frame ? sketch.frame : standardPlaneFrame(sketch.plane || E.view, sketch.offset);
}
function syncSplitSketch3D() {
  var host = E.pv && E.pv.liveGrp && E.pv.liveGrp.parent;
  var sketches = E.split && E.def && E.docType === "part" ? ensureSketchDoc(E.def) : [];
  var current = sketches.length ? ensureSketch(E.def) : null;
  var lines = sketches.map(function (sketch) { return { sketch: sketch, uv: sketchUvPolylines(sketch) }; });
  var key = host ? JSON.stringify(lines.map(function (l) { return [l.sketch === current, sketchWorldFrame(l.sketch), l.sketch.frameSpace, l.sketch.surface, l.sketch.seamOffset, l.uv]; })) : "";
  var old = E._splitSketchGrp;
  if (old && old.parent === host && key === E._splitSketchKey) return;
  if (old) { if (old.parent) old.parent.remove(old); clearGroup(old); }
  E._splitSketchGrp = null;
  E._splitSketchKey = key;
  if (host && lines.length) {
    var grp = new THREE.Group();
    grp.userData.cadSplitSketch = true;
    lines.forEach(function (l) {
      var frame = sketchWorldFrame(l.sketch), on = l.sketch === current;
      l.uv.forEach(function (uv) {
        addOverlayPolyline(grp, l.sketch.frameSpace === "surface-uv" ? surfaceSketchWorldPolyline(l.sketch, uv) : uv.map(function (q) { return framePoint(frame, q.u, q.v, 0); }), on ? 0x3aa0ff : 0x7d8b99, on ? 27 : 23, null, false);
      });
    });
    host.add(grp);
    E._splitSketchGrp = grp;
    // the first sketch geometry in an empty part is worth framing once
    if (!E._splitFitted && !renderedParts(E.def).length) { fitSplitPreview(); return; }
  }
  if (E.pv && (old || E._splitSketchGrp)) E.pv.render();
}
/* fitPreview() frames the solids, or the sketch being edited — but a part with
   no solid yet is framed as a stock 60-unit box whose middle floats above the
   sketch plane. In Split, with nothing solid, frame the sketches themselves. */
function fitSplitPreview() {
  fitPreview();
  var g = E._splitSketchGrp;
  if (!E.pv || !E.pv.target || !g || renderedParts(E.def).length) return;
  var box = new THREE.Box3().setFromObject(g);
  if (box.isEmpty()) return;
  E._splitFitted = true;
  var c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), db = defBounds(E.def);
  E.pv.frame(Math.max(1, size.length()) * 1.5);
  // the camera orbits center() plus target; center() is that stock box's middle
  E.pv.target.set(c.x, c.y - (db.y0 + db.y1) / 2, c.z);
  E.pv.render();
}

/* The right column's sketch thumbnail (Round-6): in Model view the thumbnail
   slot is empty — the 3D moved to the middle — so it shows the sketch you are
   on (or the last one drawn), fitted, with its name and how defined it is.
   Clicking it edits that sketch. Redrawn only when the sketch, its state or
   the slot's size changed. */
function syncSketchThumb() {
  var box = root && root.querySelector("#mdSketchThumb");
  if (!box) return;
  var sketches = E.def && E.docType === "part" ? ensureSketchDoc(E.def) : [];
  var current = sketches.length ? ensureSketch(E.def) : null;
  var sketch = current && (current.entities || []).length ? current
    : sketches.slice().reverse().find(function (sk) { return (sk.entities || []).length; }) || null;
  var show = !!sketch && E.mode === "3d" && !E.modelPlaneActive && !E.split && !document.body.classList.contains("compact-nav");
  box.hidden = !show;
  if (!show) { E._sketchThumbKey = ""; return; }
  var r = box.getBoundingClientRect();
  if (r.width < 20 || r.height < 20) return;
  var lines = sketchUvPolylines(sketch);
  var key = JSON.stringify([sketch.id, (sketch.constraints || []).length, Math.round(r.width), Math.round(r.height), lines]);
  if (key === E._sketchThumbKey) return;
  E._sketchThumbKey = key;
  var info = solveSketch(sketch);
  box._sketch = sketch;
  var n = sketches.indexOf(sketch) + 1;
  box.querySelector(".md-view-chip").textContent = t("sketchThumbChip").replace("{n}", n) + " · " +
    (info.status === "fully-constrained" ? t("wfFullyDefined") : info.status === "conflicting" ? t("dofConflict")
      : info.status === "over-constrained" ? t("dofOver") : (sketch.constraints || []).length ? t("wfPartialDefined") : t("wfUnderDefined"));
  var cv = box.querySelector("canvas"), dpr = Math.min(2, window.devicePixelRatio || 1), c = cv.getContext("2d");
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, r.width, r.height);
  var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  lines.forEach(function (l) { l.forEach(function (q) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v); }); });
  if (!isFinite(u0)) return;
  var padT = 34, pad = 26, k = Math.min((r.width - pad * 2) / Math.max(1e-6, u1 - u0), (r.height - padT - pad) / Math.max(1e-6, v1 - v0));
  var ox = r.width / 2 - (u0 + u1) / 2 * k, oy = padT + (r.height - padT - pad) / 2 + (v0 + v1) / 2 * k;
  c.lineWidth = 1.6;
  c.lineJoin = "round";
  c.strokeStyle = info.status === "fully-constrained" ? getComputedStyle(document.documentElement).getPropertyValue("--text-main").trim() || "#e5e7eb"
    : info.status === "conflicting" ? "#e5484d" : "#3aa0ff";
  lines.forEach(function (l) {
    c.beginPath();
    l.forEach(function (q, i) { var x = ox + q.u * k, y = oy - q.v * k; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke();
  });
}
function drawSketch() {
  // openModeler builds the phone chrome (which can fire a resize) before the
  // document is loaded; there is nothing to draw until it is
  if (!E.open || !E.def) return;
  syncSplitSketch3D();
  syncSketchThumb();
  invalidateSketchProjection();   // the camera or the pane may have moved since
  syncContextActions();
  if (!E.cw || !E.ch) sizeSketch();
  var c = E.cx, W = E.cw, H = E.ch;
  var isDark = E.mode === "3d" || (typeof document !== "undefined" && !["light", "classic", "soft"].includes(document.documentElement.getAttribute("data-theme")));
  c.clearRect(0, 0, W, H);
  /* Drawing mode is a drafting table, not the sketch canvas with a border
     drawn round it: modeler_drawing.js owns the paper, the projected views and
     every annotation on them, so nothing below this line runs there. */
  if (E.mode === "drawing") { drawingSheet().render(c, W, H); return; }
  /* Grid and axes. Over the model they belong to the sketch PLANE, so they are
     drawn in u/v and projected like everything else — a grid that recedes with
     the face is what tells you which plane you are drawing on when the camera
     is not square to it. On the flat sheet they stay screen-aligned. */
  var step = E.grid * E.scl;
  while (step < 8) step *= 2;
  c.strokeStyle = "rgba(120,130,140,.15)";
  c.lineWidth = 1;
  var projected = sketchProjection();
  if (projected) {
    var reach = E.grid * 20, spacing = E.grid * (E.scl < 1.2 ? 4 : 1);
    /* A quiet sheet tint separates the aligned sketch plane from the shaded
       solid without hiding either one. It is projected through the same camera
       as the geometry, so orbiting reads as a real drawing plane rather than a
       screen-space HUD. */
    var planeCorners = [toPx(-reach,-reach),toPx(reach,-reach),toPx(reach,reach),toPx(-reach,reach)];
    c.save();
    c.fillStyle = isDark ? "rgba(15,35,62,.12)" : "rgba(226,241,255,.13)";
    c.strokeStyle = isDark ? "rgba(125,211,252,.34)" : "rgba(38,132,199,.28)";
    c.lineWidth = 1; c.setLineDash([7,5]); c.beginPath();
    planeCorners.forEach(function(point,index){if(index)c.lineTo(point.x,point.y);else c.moveTo(point.x,point.y);});
    c.closePath(); c.fill(); c.stroke(); c.restore();
    c.beginPath();
    for (var g = -reach; g <= reach + 1e-6; g += spacing) {
      var lineStart = toPx(-reach, g), lineEnd = toPx(reach, g);
      c.moveTo(lineStart.x, lineStart.y); c.lineTo(lineEnd.x, lineEnd.y);
      var colStart = toPx(g, -reach), colEnd = toPx(g, reach);
      c.moveTo(colStart.x, colStart.y); c.lineTo(colEnd.x, colEnd.y);
    }
    c.stroke();
    c.strokeStyle = "rgba(90,140,220,.55)";
    c.beginPath();
    var uA = toPx(-reach, 0), uB = toPx(reach, 0), vA = toPx(0, -reach), vB = toPx(0, reach);
    c.moveTo(uA.x, uA.y); c.lineTo(uB.x, uB.y); c.moveTo(vA.x, vA.y); c.lineTo(vB.x, vB.y);
    c.stroke();
    c.fillStyle = "rgba(90,110,130,.85)";
    c.font = "11px sans-serif";
    c.fillText("U", uB.x + 4, uB.y - 4);
    c.fillText("V", vB.x + 4, vB.y - 4);
  } else {
    c.beginPath();
    for (var gx = E.ox % step; gx < W; gx += step) { c.moveTo(gx, 0); c.lineTo(gx, H); }
    for (var gy = E.oy % step; gy < H; gy += step) { c.moveTo(0, gy); c.lineTo(W, gy); }
    c.stroke();
    // axes through origin
    c.strokeStyle = "rgba(90,140,220,.5)";
    c.beginPath(); c.moveTo(0, E.oy); c.lineTo(W, E.oy); c.moveTo(E.ox, 0); c.lineTo(E.ox, H); c.stroke();
    c.fillStyle = "rgba(90,110,130,.8)";
    c.font = "11px sans-serif";
    var lbl = activeSketchFrame() ? ["U", "V"] : E.view === "top" ? ["X", "Z"] : E.view === "front" ? ["X", "Y"] : ["Z", "Y"];
    c.fillText(lbl[0], W - 14, E.oy - 6);
    c.fillText(lbl[1], E.ox + 6, 14);
  }

  // parts — a step that is suppressed or below the rollback bar is drawn as a
  // dashed ghost, so the canvas never shows something the model does not have
  var built = renderedParts(E.def);
  (E.def.parts || []).forEach(function (p) {
    // Over the model the shaded solid IS the part. Its flattened u/v outline on
    // top of itself was only ever a stand-in for a model you could not see.
    if (projected) return;
    var f = partUV(p), on = p === E.sel, inactive = built.indexOf(p) < 0;
    c.save();
    if (inactive) { c.globalAlpha = 0.4; c.setLineDash([6, 4]); }
    c.strokeStyle = on ? "#e08030" : "#5a7a9a";
    c.fillStyle = on ? "rgba(224,128,48,.18)" : "rgba(90,122,154,.10)";
    c.lineWidth = on ? 2 : 1.2;
    c.beginPath();
    if (f.type === "rect") {
      var a = toPx(f.u0, f.v0), b = toPx(f.u1, f.v1);
      c.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (f.type === "circle") {
      var q = toPx(f.u, f.v);
      c.arc(q.x, q.y, f.r * E.scl, 0, 7);
    } else if(f.type === "segments") {
      f.segments.forEach(function(segment){var a=toPx(segment.a.u,segment.a.v),b=toPx(segment.b.u,segment.b.v);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);});
    } else {
      f.pts.forEach(function (q, i) {
        var s = toPx(q.u, q.v);
        if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
      });
      c.closePath();
      // hole loops as sub-paths; evenodd fill leaves them empty
      (f.holes || p.holes || []).forEach(function (hl) {
        var loop = holeLoop(hl);
        if (!loop.length) return;
        loop.forEach(function (q, i) {
          var s = toPx(q.u, q.v);
          if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
        });
        c.closePath();
      });
    }
    if(f.type!=="segments")c.fill("evenodd"); c.stroke();
    // vertex handles + edge lengths for a selected sketched polygon
    if (on && f.type === "poly") {
      c.fillStyle = isDark ? "#fb923c" : "#e08030";
      f.pts.forEach(function (q, i) {
        var s = toPx(q.u, q.v);
        c.fillRect(s.x - 3, s.y - 3, 6, 6);
        var q2 = f.pts[(i + 1) % f.pts.length], s2 = toPx(q2.u, q2.v);
        var L = Math.hypot(q2.u - q.u, q2.v - q.v);
        c.fillStyle = isDark ? "#fed7aa" : "#7a5a30";
        c.fillText(Math.round(L) + "", (s.x + s2.x) / 2 + 3, (s.y + s2.y) / 2 - 3);
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
      });
    }
    // dimensions for selected rect
    if (on && f.type === "rect") {
      var a2 = toPx(f.u0, f.v0), b2 = toPx(f.u1, f.v1);
      c.fillStyle = isDark ? "#fed7aa" : "#7a5a30";
      c.fillText(Math.round(Math.abs(f.u1 - f.u0)) + "", (a2.x + b2.x) / 2 - 8, Math.min(a2.y, b2.y) - 5);
      c.fillText(Math.round(Math.abs(f.v1 - f.v0)) + "", Math.max(a2.x, b2.x) + 5, (a2.y + b2.y) / 2);
    }
    c.restore();
  });

  // True sketch entities are independent from solid parts. Lines carry
  // constraints and metadata but create no 3D body until a feature consumes a
  // closed profile.
  var sketch = ensureSketch(E.def);
  drawFeatureAreaHatch(c);

  /* Other sketches sharing this plane are drawn first, dimmed and unpickable —
     they are context you constrain against, not geometry you are editing. A
     sketch on another plane is not drawn at all: it is not in this projection,
     and pretending otherwise is what let a top-plane profile extrude as if it
     had been drawn on the front. */
  ensureSketchDoc(E.def).forEach(function (other) {
    if (other === sketch || !sameSketchContext(other,sketch)) return;
    var opts = new Map((other.points || []).map(function (q) { return [q.id, q]; }));
    c.save();
    c.globalAlpha = 0.32;
    c.strokeStyle = "#5a7a9a";
    c.lineWidth = 1.1;
    (other.entities || []).forEach(function (e) {
      c.beginPath();
      if(e.projectedCurve?.samples){e.projectedCurve.samples.forEach(function(p,i){var q=toPx(p.u,p.v);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});
      } else if (e.type === "line") {
        var a = opts.get(e.a), b = opts.get(e.b);
        if (!a || !b) return;
        var sa = toPx(a.x, a.y), sb = toPx(b.x, b.y);
        c.moveTo(sa.x, sa.y); c.lineTo(sb.x, sb.y);
      } else if(e.type==="spline"){pathSketchSpline(c,e,opts);
      } else if (e.type === "ellipse") {
        if (!pathEllipse(c, ellipseData(e, opts))) return;
      } else {
        var o = circleData(e, opts);
        if (!o) return;
        if (e.type === "arc") pathUvCircleArc(c, o.center, o.radius, o.start, positiveArcSweep(o.start, o.end), false);
        else pathUvCircleArc(c, o.center, o.radius, 0, Math.PI * 2, true);
      }
      c.stroke();
    });
    c.restore();
  });

  var spts = new Map((sketch.points || []).map(function (q) { return [q.id, q]; }));
  // a refused dimension or relation paints what it fought
  var refused = refusalHint(sketch);
  var conflicts = refused || (E.solveInfo && E.solveInfo.conflicts) || [];
  var statuses = entityStatuses(sketch, refused ? Object.assign({}, E.solveInfo, { conflicts: refused, status: "conflicting" }) : E.solveInfo);
  var fully = E.solveInfo && E.solveInfo.status === "fully-constrained";
  // Under-defined entities stay blue, fully defined black, conflicts red.
  var live = sketch.frameSpace==="local" ? !!(E.modelPlaneActive || E.mode==="2d") : sketch.plane === E.view;

  (live ? sketch.entities || [] : []).forEach(function (entity) {
    var selected = E.ssel.indexOf(entity) >= 0;
    var status = statuses.entityStatus[entity.id] || (fully ? "fully-defined" : "under-defined");
    c.save();
    if (projected) {
      c.shadowColor = isDark ? "rgba(2,8,23,.95)" : "rgba(255,255,255,.92)";
      c.shadowBlur = 3;
    }
    c.strokeStyle = sketchStatusColor(status, { selected: selected, construction: entity.construction, isDark: isDark });
    c.lineWidth = selected ? 2.3 : Math.max(1.2, entity.weight || 1.2);
    if (entity.construction) c.setLineDash([7, 4]);
    c.beginPath();
    if(entity.projectedCurve?.samples){entity.projectedCurve.samples.forEach(function(p,i){var q=toPx(p.u,p.v);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.stroke();
    } else if (entity.type === "line") {
      // read through the map built above, not by re-scanning the point array:
      // that scan is per line per frame, which is the whole sketch squared
      var a = spts.get(entity.a), b = spts.get(entity.b);
      if (!a || !b) { c.restore(); return; }
      var sa = toPx(a.x, a.y), sb = toPx(b.x, b.y);
      c.moveTo(sa.x, sa.y); c.lineTo(sb.x, sb.y); c.stroke();
      c.setLineDash([]);
      // Only the selected line states its own size. Labelling every segment
      // duplicates whatever dimensions the sketch already carries and buries
      // the constraint glyphs underneath the text.
      if (selected) {
        var len = Math.hypot(b.x - a.x, b.y - a.y);
        var ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        var infoText = Math.round(len * 10) / 10 + " cm · " + Math.round(ang * 10) / 10 + "°";
        var tx = (sa.x + sb.x) / 2 + 5, ty = (sa.y + sb.y) / 2 - 7;
        if (c.fillRect) {
          c.save();
          c.fillStyle = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)";
          var tw = (c.measureText ? c.measureText(infoText).width : infoText.length * 6.5) + 6;
          c.fillRect(tx - 3, ty - 10, tw, 13);
          c.restore();
        }
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
        c.font = "11px sans-serif";
        c.fillText(infoText, tx, ty);
      }
    } else if (entity.type === "point") {
      var standalone = spts.get(entity.p);
      if (standalone) { var marker = toPx(standalone.x, standalone.y); c.strokeRect(marker.x - 6, marker.y - 6, 12, 12); }
    } else if(entity.type==="spline"){pathSketchSpline(c,entity,spts);c.stroke();
    } else if (entity.type === "ellipse") {
      var el2 = ellipseData(entity, spts);
      if (!pathEllipse(c, el2)) { c.restore(); return; }
      c.stroke();
      c.setLineDash([]);
      if (selected) {
        var ec = toPx(el2.center.x, el2.center.y);
        var infoText = Math.round(el2.rx * 10) / 10 + " × " + Math.round(el2.ry * 10) / 10;
        if (c.fillRect) {
          c.save();
          c.fillStyle = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)";
          var tw = (c.measureText ? c.measureText(infoText).width : infoText.length * 6.5) + 6;
          c.fillRect(ec.x + 1, ec.y - 12, tw, 13);
          c.restore();
        }
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
        c.font = "11px sans-serif";
        c.fillText(infoText, ec.x + 4, ec.y - 4);
      }
    } else {
      var o = circleData(entity, spts);
      if (!o) { c.restore(); return; }
      var sc = toPx(o.center.x, o.center.y);
      if (entity.type === "arc") pathUvCircleArc(c, o.center, o.radius, o.start, positiveArcSweep(o.start, o.end), false);
      else pathUvCircleArc(c, o.center, o.radius, 0, Math.PI * 2, true);
      c.stroke();
      c.setLineDash([]);
      if (selected) {
        var infoText = "R " + Number(Number(o.radius).toFixed(3));
        if (c.fillRect) {
          c.save();
          c.fillStyle = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)";
          var tw = (c.measureText ? c.measureText(infoText).width : infoText.length * 6.5) + 6;
          c.fillRect(sc.x + 1, sc.y - 12, tw, 13);
          c.restore();
        }
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
        c.font = "11px sans-serif";
        c.fillText(infoText, sc.x + 4, sc.y - 4);
      }
    }
    c.restore();
  });

  // sketch points, drawn over the entities so they stay grabbable
  (live ? sketch.points || [] : []).forEach(function (q) {
    var s = toPx(q.x, q.y), on = E.ssel.indexOf(q) >= 0;
    c.save();
    if (projected) { c.shadowColor = "rgba(2,8,23,.9)"; c.shadowBlur = 3; }
    c.fillStyle = on ? (isDark ? "#fb923c" : "#e08030") : q.fixed ? (isDark ? "#34d399" : "#0f8a6a") : sketchStatusColor(statuses.pointStatus[q.id] || (fully ? "fully-defined" : "under-defined"), { isDark: isDark });
    c.fillRect(s.x - 3, s.y - 3, 6, 6);
    if (q.fixed) { c.strokeStyle = isDark ? "#34d399" : "#0f8a6a"; c.lineWidth = 1; c.strokeRect(s.x - 5, s.y - 5, 10, 10); }
    c.restore();
  });

  if (live) {
    var profileInfo = sketchProfileAnalysis();
    // A faint region fill makes the exact profiles the feature engine sees
    // visible. Open and branched endpoints are called out directly on-canvas.
    profileInfo.profiles.forEach(function (profile) {
      if (!profile.points.length) return;
      c.save(); c.globalAlpha = profile.selected ? 0.14 : 0.065;
      c.fillStyle = profile.selected ? (isDark ? "#fb923c" : "#e08030") : (isDark ? "#38bdf8" : "#2684c7");
      c.beginPath();
      profile.points.forEach(function (p, index) { var sp = toPx(p.u, p.v); if (!index) c.moveTo(sp.x, sp.y); else c.lineTo(sp.x, sp.y); });
      c.closePath(); c.fill(); c.restore();
    });
    var openPathReady=profileInfo.openEnds.length && sketchOpenPathReadiness(sketch);
    profileInfo.openEnds.forEach(function (p) {
      var sp = toPx(p.x, p.y);
      c.save(); c.strokeStyle = openPathReady ? (isDark ? "#38bdf8" : "#2684c7") : (isDark ? "#fca5a5" : "#d0342c"); c.lineWidth = 2; c.beginPath(); c.arc(sp.x, sp.y, 7, 0, Math.PI * 2); c.stroke(); c.restore();
    });
    profileInfo.branchPoints.forEach(function (p) {
      var sp = toPx(p.x, p.y);
      c.save(); c.fillStyle = isDark ? "#fca5a5" : "#d0342c"; c.translate(sp.x, sp.y); c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.restore();
    });
    c.save();
    if (projected) { c.shadowColor = "rgba(2,8,23,.9)"; c.shadowBlur = 3; }
    drawSketchDimensions(c, sketch, E.scl, toPx, conflicts, { selectedId: E.dimSel, isDark: isDark, unit:modelLengthUnit() });
    drawConstraintGlyphs(c, sketch, toPx, conflicts, { isDark: isDark });
    c.restore();
    if (refused) {
      var tagged = [];
      (sketch.constraints || []).forEach(function (constraint) {
        if (refused.indexOf(constraint.id) >= 0) tagged.push.apply(tagged, relationTargets(sketch, constraint));
      });
      drawNameTags(c, sketch, toPx, tagged, sketchInstanceNames(sketch, instanceLabels()));
    }
  }

  // in-progress arc: centre→start fixes the radius; the third point selects
  // the same positive UV sweep that addSketchArc commits.
  if (E.arcTangent && E.arcPts && E.arcPts.length === 1 && E._mouse) {
    c.save(); c.strokeStyle="#2684c7"; c.setLineDash([5,4]); c.beginPath();
    var tangentPreview=tangentArc(E.arcPts[0], E.arcPts[0].tangent, E._mouse);
    if(tangentPreview) {
      var taStart=Math.atan2(tangentPreview.start.v-tangentPreview.centre.v,tangentPreview.start.u-tangentPreview.centre.u);
      var taEnd=Math.atan2(tangentPreview.end.v-tangentPreview.centre.v,tangentPreview.end.u-tangentPreview.centre.u);
      pathUvCircleArc(c,{x:tangentPreview.centre.u,y:tangentPreview.centre.v},tangentPreview.radius,taStart,positiveArcSweep(taStart,taEnd),false);
    } else {
      var taA=toPx(E.arcPts[0].u,E.arcPts[0].v),taB=toPx(E._mouse.u,E._mouse.v);
      c.moveTo(taA.x,taA.y);c.lineTo(taB.x,taB.y);
    }
    c.stroke();c.restore();
  } else if (E.arcThreePoint && E.arcPts && E.arcPts.length && E._mouse) {
    c.save(); c.strokeStyle="#2684c7"; c.setLineDash([5,4]); c.beginPath();
    var previewArc=E.arcPts.length===2 ? threePointArc(E.arcPts[0],E.arcPts[1],E._mouse) : null;
    if(previewArc) {
      var paStart=Math.atan2(previewArc.start.v-previewArc.centre.v,previewArc.start.u-previewArc.centre.u);
      var paEnd=Math.atan2(previewArc.end.v-previewArc.centre.v,previewArc.end.u-previewArc.centre.u);
      pathUvCircleArc(c,{x:previewArc.centre.u,y:previewArc.centre.v},previewArc.radius,paStart,positiveArcSweep(paStart,paEnd),false);
    } else {
      var paA=toPx(E.arcPts[0].u,E.arcPts[0].v),paB=toPx(E._mouse.u,E._mouse.v);
      c.moveTo(paA.x,paA.y);c.lineTo(paB.x,paB.y);
    }
    c.stroke();c.restore();
  } else if (E.arcPts && E.arcPts.length && E._mouse) {
    var arcCentre = E.arcPts[0], ac = toPx(arcCentre.u, arcCentre.v);
    var ar = E.arcPts.length > 1
      ? Math.hypot(E.arcPts[1].u - arcCentre.u, E.arcPts[1].v - arcCentre.v)
      : Math.hypot(E._mouse.u - arcCentre.u, E._mouse.v - arcCentre.v);
    c.save(); c.strokeStyle = "#2684c7"; c.setLineDash([5, 4]);
    c.beginPath();
    if (E.arcPts.length > 1) {
      var arcStart = Math.atan2(E.arcPts[1].v - arcCentre.v, E.arcPts[1].u - arcCentre.u);
      var arcEnd = Math.atan2(E._mouse.v - arcCentre.v, E._mouse.u - arcCentre.u);
      pathUvCircleArc(c, { x:arcCentre.u, y:arcCentre.v }, ar, arcStart, positiveArcSweep(arcStart, arcEnd), false);
    } else {
      pathUvCircleArc(c, { x:arcCentre.u, y:arcCentre.v }, ar, 0, Math.PI * 2, true);
    }
    c.stroke();
    c.fillStyle = "#2684c7"; c.fillRect(ac.x - 3, ac.y - 3, 6, 6);
    c.restore();
  }

  // Connected sketch-line preview. Each committed span is a separate sketch
  // entity; construction spans are dashed and excluded from solid profiles.
  if (E.wallPts && E.wallPts.length && E._mouse) {
    var w0 = E.wallPts[E.wallPts.length - 1], w1 = E._mouse;
    var ws0 = toPx(w0.u, w0.v), ws1 = toPx(w1.u, w1.v);
    c.save();
    c.strokeStyle = E.tool === "constr" ? "#2684c7" : "#18a36b";
    c.lineWidth = 2;
    c.setLineDash([8, 5]);
    c.beginPath(); c.moveTo(ws0.x, ws0.y); c.lineTo(ws1.x, ws1.y); c.stroke();
    c.setLineDash([]);
    c.fillStyle = E.tool === "constr" ? "#2684c7" : "#18a36b";
    c.fillRect(ws0.x - 4, ws0.y - 4, 8, 8);
    var liveL = Math.hypot(w1.u - w0.u, w1.v - w0.v);
    var liveA = (Math.atan2(w1.v - w0.v, w1.u - w0.u) * 180) / Math.PI;
    if (!E.dynInput) c.fillText(Math.round(liveL * 10) / 10 + " cm · " + Math.round(liveA * 10) / 10 + "°", ws1.x + 10, ws1.y - 10);
    c.restore();
  }

  // in-progress slot: centreline, then the full outline once the width is live
  if (E.slotPts && E.slotPts.length && E._mouse) {
    var s0 = E.slotPts[0], s1 = E.slotPts[1] || E._mouse;
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    var sp0 = toPx(s0.u, s0.v), sp1 = toPx(s1.u, s1.v);
    c.beginPath(); c.moveTo(sp0.x, sp0.y); c.lineTo(sp1.x, sp1.y); c.stroke();
    if (E.slotPts.length > 1) {
      var halfW = pointToLineDistance(E._mouse, s0, s1);
      c.setLineDash([]);
      strokeSlotOutline(c, s0, s1, halfW);
    }
    c.fillStyle = "#2684c7"; c.fillRect(sp0.x - 3, sp0.y - 3, 6, 6);
    c.restore();
  }

  if(E.splinePts?.length){
    c.save();c.strokeStyle="#2684c7";c.fillStyle="#2684c7";c.setLineDash([5,4]);c.beginPath();
    var cp=E.splinePts.map(p=>toPx(p.x,p.y));cp.forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);c.fillRect(p.x-3,p.y-3,6,6);});
    if(E._mouse){var end=toPx(E._mouse.u,E._mouse.v);c.lineTo(end.x,end.y);if(cp.length===3){c.stroke();c.setLineDash([]);c.beginPath();c.moveTo(cp[0].x,cp[0].y);c.bezierCurveTo(cp[1].x,cp[1].y,cp[2].x,cp[2].y,end.x,end.y);}}
    c.stroke();c.restore();
  }
  // in-progress ellipse: major axis, then the curve once the minor is live
  if (E.ellPts && E.ellPts.length && E._mouse) {
    var e0 = E.ellPts[0], e1 = E.ellPts[1] || E._mouse;
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    var ep0 = toPx(e0.u, e0.v), ep1 = toPx(e1.u, e1.v);
    c.beginPath(); c.moveTo(ep0.x, ep0.y); c.lineTo(ep1.x, ep1.y); c.stroke();
    if (E.ellPts.length > 1) {
      c.setLineDash([]);
      c.beginPath();
      pathEllipse(c, {
        center: { x: e0.u, y: e0.v },
        rx: Math.hypot(e1.u - e0.u, e1.v - e0.v),
        ry: Math.max(0.01, pointToLineDistance(E._mouse, e0, e1)),
        rot: Math.atan2(e1.v - e0.v, e1.u - e0.u),
      });
      c.stroke();
    }
    c.fillStyle = "#2684c7"; c.fillRect(ep0.x - 3, ep0.y - 3, 6, 6);
    c.restore();
  }

  if(E.quickAction==="modeledgeoffset" && E.offsetPreview){
    c.save();c.strokeStyle="#2684c7";c.lineWidth=2;c.setLineDash([6,4]);
    E.offsetPreview.radii.forEach(function(radius){if(fin(radius)&&radius>1e-6){c.beginPath();strokeUvCircle(c,E.offsetPreview.x,E.offsetPreview.y,radius);c.stroke();}});
    c.restore();
  }

  // in-progress polygon: the n-gon the release will actually build
  if (E.tool === "spoly" && E.drag && E.drag.mode === "spoly" && E._mouse) {
    var pc = { u: E.drag.u, v: E.drag.v };
    var pr = Math.hypot(E._mouse.u - pc.u, E._mouse.v - pc.v);
    var pa = Math.atan2(E._mouse.v - pc.v, E._mouse.u - pc.u);
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5;
    c.beginPath();
    for (var pk = 0; pk <= E.polySides; pk++) {
      var pang = pa + (pk * Math.PI * 2) / E.polySides;
      var pp = toPx(pc.u + Math.cos(pang) * pr, pc.v + Math.sin(pang) * pr);
      if (!pk) c.moveTo(pp.x, pp.y); else c.lineTo(pp.x, pp.y);
    }
    c.stroke();
    c.setLineDash([4, 4]); c.strokeStyle = "rgba(38,132,199,.5)";
    c.beginPath();
    strokeUvCircle(c, pc.u, pc.v, pr);
    c.stroke();
    c.restore();
  }

  // in-progress polygon (green = add material, red dashed = cut)
  var cutting = E.tool === "cut" || E.tool === "cutc";
  if (E.poly && E.poly.length) {
    c.strokeStyle = cutting ? "#c03030" : "#30a060";
    c.lineWidth = 2;
    if (cutting) c.setLineDash([5, 4]);
    c.beginPath();
    E.poly.forEach(function (q, i) {
      var s = toPx(q.u, q.v);
      if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
    });
    if (E._mouse) { var m = toPx(E._mouse.u, E._mouse.v); c.lineTo(m.x, m.y); }
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = cutting ? "#c03030" : "#30a060";
    E.poly.forEach(function (q) { var s = toPx(q.u, q.v); c.fillRect(s.x - 3, s.y - 3, 6, 6); });
  }
  // rubber band for rect/circle/bore — UV corners/circle, then toPx, so the
  // preview is the shape that will land even from an isometric camera
  if (E.drag && (E.drag.mode === "draw" || E.drag.mode === "srect" || E.drag.mode === "scirc") && E._mouse) {
    c.strokeStyle = cutting ? "#c03030" : "#30a060";
    c.lineWidth = 1.5;
    if (cutting) c.setLineDash([5, 4]);
    c.beginPath();
    if (E.tool === "rect" || E.tool === "srect") strokeUvRect(c, E.drag.u, E.drag.v, E._mouse.u, E._mouse.v);
    else strokeUvCircle(c, E.drag.u, E.drag.v, Math.hypot(E._mouse.u - E.drag.u, E._mouse.v - E.drag.v));
    c.stroke();
    c.setLineDash([]);
  }
  // OSNAP marker: □ endpoint, △ midpoint, ○ center, ◇ quadrant, ✛ origin
  if (E._osnap) {
    var sp = toPx(E._osnap.u, E._osnap.v), k = E._osnap.k;
    c.strokeStyle = "#c8a018";
    c.lineWidth = 2;
    c.beginPath();
    if (k === "e") c.rect(sp.x - 5, sp.y - 5, 10, 10);
    else if (k === "m") { c.moveTo(sp.x, sp.y - 6); c.lineTo(sp.x + 6, sp.y + 5); c.lineTo(sp.x - 6, sp.y + 5); c.closePath(); }
    else if (k === "c") c.arc(sp.x, sp.y, 6, 0, 7);
    else if (k === "q") { c.moveTo(sp.x, sp.y - 6); c.lineTo(sp.x + 6, sp.y); c.lineTo(sp.x, sp.y + 6); c.lineTo(sp.x - 6, sp.y); c.closePath(); }
    else { c.moveTo(sp.x - 7, sp.y); c.lineTo(sp.x + 7, sp.y); c.moveTo(sp.x, sp.y - 7); c.lineTo(sp.x, sp.y + 7); }
    c.stroke();
    if (k === "h" || k === "v") {
      c.fillStyle = "#c8a018"; c.font = "700 11px sans-serif";
      c.fillText(k === "h" ? "H" : "V", sp.x + 8, sp.y - 8);
    }
  }
  if (E.drag && E.drag.mode === "box") {
    var bx = Math.min(E.drag.x0, E.drag.x1), by = Math.min(E.drag.y0, E.drag.y1);
    var bw = Math.abs(E.drag.x1 - E.drag.x0), bh = Math.abs(E.drag.y1 - E.drag.y0);
    c.save();
    c.strokeStyle = boxSelectMode(E.drag.x0, E.drag.x1) === "enclosed" ? "#2684c7" : "#c07020";
    c.fillStyle = c.strokeStyle;
    c.globalAlpha = 0.12;
    c.fillRect(bx, by, bw, bh);
    c.globalAlpha = 1;
    c.setLineDash(boxSelectMode(E.drag.x0, E.drag.x1) === "enclosed" ? [] : [5, 4]);
    c.strokeRect(bx, by, bw, bh);
    c.restore();
  }

  drawModelerTouchPrecision(c);
  // typed length/angle/size, last so nothing is drawn over the numbers
  if (E._mouse) {
    var hud = toPx(E._mouse.u, E._mouse.v);
    dynDrawHud(c, hud.x, hud.y);
  }
}

export {
  drawSketch, drawingDocument, drawingHintText, drawingSheet, fitSplitPreview,
  invalidateDrawing, sampleSplinePoints, sketchUvPolylines, splineLength,
  syncSheetPanel,
};

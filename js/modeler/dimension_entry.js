/* The CAD editor's typed dimension entry while drawing, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { lengthToDocument } from "../core/document_length_units.js";
import { framePoint } from "../core/frame.js";
import { parseSketchDimensionEntry } from "../core/sketch_dimension_entry.js";
import { ensureSketchOriginPoint, pickIsOrigin, sketchOriginPoint, smartDimensionOriginWins } from "../core/sketch_origin.js";
import { bindThreeFingerPan } from "../editor_view.js";
import { KEY_TOOL, KEY_VIEW } from "../modeler_commands.js";
import { modelerDecisionOpen } from "../modeler_decision.js";
import { nextInferenceIndex } from "../modeler_inference.js";
import { dimensionValueFromDrag } from "../modeler_instant3d.js";
import { edgePoints } from "../modeler_mesh_geometry.js";
import { cloneData } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t } from "../modeler_strings.js";
import { closeTour } from "../modeler/sketch_guide.js";
import { addSmartDimension, dimensionHitYieldsToPoint } from "../sketch_dimensions.js";
import { hitProjectedModelEdge, hitProjectedModelVertex, hitScreenModelEdge, hitScreenModelVertex } from "../sketch_intersection.js";
import { ensureSketch, explainSketchConflict, lineData, removeSketchEntity, sketchEntity, sketchPoint } from "../sketch_solver.js";
import { addCubicSpline } from "../sketch_spline.js";
import { entityOutgoingTangent, tangentArc } from "../sketch_tangent_arc.js";
import { threePointArc } from "../sketch_three_point_arc.js";
import { extendEntity, toggleConstruction, trimEntity } from "../sketch_trim.js";
import { clamp, fin, uid } from "../state.js";
import { dispatchPrecisionCommit, dispatchPrecisionDown, dispatchPrecisionMove, dispatchPrecisionUp, getTouchPrecisionMode, precisionModelPoint, releaseTouchPrecisionTrial, startTouchPrecisionTrial, touchPrecisionTrialOwns, updateTouchPrecisionTrial } from "../touch_precision_ui.js";
import { beginTouchPrecision, modelerPrecisionTrialAllowed, modelerTouchPrecisionKind, touchPrecisionPoint, updateTouchPrecision } from "../touch_precision.js";
import { getDomainUnit } from "../unit_settings.js";
import {
  E, H, SKETCH_MAX_SCALE, SKETCH_MIN_SCALE, activeSketchFrame, addPart,
  addSketchArc, addSketchCircle, addSketchEllipse, addSketchPolygon,
  addSketchRectangle, addSketchSlot, applyCut, applyDimensionEditor,
  applyMouseGesture, applySketchFilletFromSelection, cancelFacePick,
  cancelReferenceSelection, closeChromeOverlays, closeCommandSearch,
  closeEvalCard, closeNoteEditor, closeReport, closeWelcome, commandCatalog,
  constraintCaption, copySketchToClipboard, cornerRoundForm, cutSkipNote,
  cutTargetFeatureId, dimensionTarget, dismissProfileOffer, doRedo, doUndo,
  drawSketch, drawingSheet, dropSketchModelPicks, editPlacedDimension,
  fillInspector, finishBoxSelect, finishDimensionDrag, finishModelPlane,
  finishPoly, finishWallChain, fitPreview, fitSketch, flash, hidePickCycle,
  hitPart, hitSketch, invalidateSketchProjection, isCanonicalAuthoring,
  isSketchObject, liveSketchFilletValues, makeWallSegment, markDrawnSelection,
  modelLengthUnit, modelerTouchDistances, moveInView, newSketchPoint,
  openCommandSearch, openModelEdgeOffsetForm, openParametricFeature,
  openSketchOffsetForm, openSketchPointCoordinates, orientModelToView,
  partEditableInSketch, pasteReferenceTarget, pasteSketchOntoReference,
  placeDimensionAtPointer, placedDimensionAt, placedDimensionHit, pushUndo,
  readClipboardSketch, refreshAll, regenerateExactModel, removeTreeNode,
  reportOpen, resolveSketch, resolveTopologyPick, root, runCommand,
  saveCurrentDocument, scheduleModelerDraft, segmentLengthForm, selEntities,
  selFilletCurves, selPoints, selectAllTopology, selectSketch,
  selectionFilterAvailable, setCommandTab, setEntityDimension, setMode,
  setModelDisplay, setSelectionFilter, setTool, setView, showContextMenu,
  showShortcutBar, showSketchRefusal, showViewSelector,
  sketchFilletSelectionReady, sketchProjection, sketchVisibleModelEdges,
  smartDimension, snapPt, snapV, solveAssembly, syncContextActions, syncHint,
  syncStatus, syncTools, toPx, toUV, treeSelectedSketch, updatePreview,
  worldToSketchPx,
} from "../modeler.js";

/* ================= typed dimension entry while drawing =================
   Every drawing tool with numbers worth typing accepts them: start typing, Tab
   between fields, Enter to place. The rule throughout is that a TYPED value
   becomes a driving dimension and a dragged one does not — typing "40" means
   forty and the sketch should carry that as an editable dimension afterwards,
   while a shape you eyeballed stays free to be dragged. */
var DYN_TOOLS = {
  wall:  [{ k:"length", unit:"length" }, { k:"angle", u:"°", signed:true }],
  constr:[{ k:"length", unit:"length" }, { k:"angle", u:"°", signed:true }],
  srect: [{ k:"width", unit:"length" }, { k:"height", unit:"length" }],
  scirc: [{ k:"diameter", unit:"length" }],
  sell:  [{ k:"major", unit:"length" }, { k:"minor", unit:"length" }],
  sslot: [{ k:"length", unit:"length" }, { k:"width", unit:"length" }],
  spoly: [{ k:"diameter", unit:"length" }, { k:"sides", u:"", whole:true }],
};

// A typed number only means something once the tool has an anchor on the sheet.
function dynAnchor() {
  if (E.mode === "drawing") return null;
  if (E.tool === "wall" || E.tool === "constr") return E.wallPts && E.wallPts.length ? E.wallPts[E.wallPts.length - 1] : null;
  if (E.tool === "sslot") return E.slotPts && E.slotPts.length ? E.slotPts[0] : null;
  if (E.tool === "sell") return E.ellPts && E.ellPts.length ? E.ellPts[0] : null;
  if (E.tool === "srect" || E.tool === "scirc" || E.tool === "spoly") return E.drag && (E.drag.mode === "srect" || E.drag.mode === "scirc" || E.drag.mode === "spoly") ? { u:E.drag.u, v:E.drag.v } : null;
  return null;
}
function dynFields() { return DYN_TOOLS[E.tool] && dynAnchor() ? DYN_TOOLS[E.tool] : null; }

/* What the pointer is currently saying, per field. The HUD shows these greyed
   where nothing has been typed, and commit falls back to them — so Enter always
   produces the shape on screen, only sharper where a number was given. */
function dynLive() {
  var anchor = dynAnchor(), m = E._mouse;
  if (!anchor) return {};
  var to = m || anchor;
  var du = to.u - anchor.u, dv = to.v - anchor.v, reach = Math.hypot(du, dv);
  if (E.tool === "wall" || E.tool === "constr") return { length: reach, angle: (Math.atan2(dv, du) * 180) / Math.PI };
  if (E.tool === "srect") return { width: Math.abs(du), height: Math.abs(dv) };
  if (E.tool === "scirc") return { diameter: reach * 2 };
  if (E.tool === "spoly") return { diameter: reach * 2, sides: E.polySides };
  if (E.tool === "sslot") {
    var end = E.slotPts[1];
    if (!end) return { length: reach, width: 0 };
    return { length: Math.hypot(end.u - anchor.u, end.v - anchor.v), width: pointToLineDistance(to, anchor, end) };
  }
  if (E.tool === "sell") {
    var major = E.ellPts[1];
    if (!major) return { major: reach, minor: 0 };
    return {
      major: Math.hypot(major.u - anchor.u, major.v - anchor.v),
      minor: pointToLineDistance(to, anchor, major),
    };
  }
  return {};
}

function pointToLineDistance(p, a, b) {
  var dx = b.u - a.u, dy = b.v - a.v, len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(p.u - a.u, p.v - a.v);
  return Math.abs((p.u - a.u) * dy - (p.v - a.v) * dx) / len;
}

function dynTyped(key) {
  var raw = E.dynInput && E.dynInput.values ? E.dynInput.values[key] : "";
  var field = (DYN_TOOLS[E.tool] || []).find(function (item) { return item.k === key; });
  if (!String(raw).trim()) return null;
  var value;
  try {
    value = field && field.unit === "length"
      ? parseSketchDimensionEntry(raw, {type:"distance"}, modelLengthUnit()).value
      : Number(raw);
  } catch (_) { return null; }
  return fin(value) ? value : null;
}
// typed if given, measured otherwise
function dynValue(key, live) { var typed = dynTyped(key); return typed == null ? live[key] : typed; }
function dynHasEntry() {
  return !!(E.dynInput && Object.keys(E.dynInput.values).some(function (k) { return E.dynInput.values[k] !== ""; }));
}

// Keystrokes while a drawing tool is anchored. Returns true when consumed.
function dynKey(e) {
  var fields = dynFields();
  if (!fields) return false;
  var start = function () {
    if (!E.dynInput || E.dynInput.tool !== E.tool) E.dynInput = { tool:E.tool, field:fields[0].k, values:{} };
    fields.forEach(function (f) { if (E.dynInput.values[f.k] == null) E.dynInput.values[f.k] = ""; });
    return E.dynInput;
  };
  var current = function () { return fields.filter(function (f) { return f.k === E.dynInput.field; })[0] || fields[0]; };

  // A length already being typed owns its unit suffix, so "100mm" cannot
  // silently become 100 document units or launch a tool on the letter key.
  if (E.dynInput && current().unit === "length" && /^[a-z ]$/i.test(e.key)) {
    var candidate=String(E.dynInput.values[E.dynInput.field] || "")+e.key;
    var suffix=candidate.match(/^[+-]?(?:\d+\.?\d*|\.\d+)\s*([a-z]*)$/i);
    if (suffix && ["mm","cm","m","in","ft"].some(function(unit){return unit.indexOf(suffix[1].toLowerCase())===0;})) {
      e.preventDefault(); E.dynInput.values[E.dynInput.field]=candidate; drawSketch(); return true;
    }
  }

  if (/^[0-9.]$/.test(e.key) || (e.key === "-" && E.dynInput && current().signed)) {
    e.preventDefault();
    var input = start(), field = input.field;
    if (e.key === "." && (input.values[field].indexOf(".") >= 0 || current().whole)) return true;
    if (e.key === "-" && input.values[field]) return true;      // sign leads, or not at all
    input.values[field] += e.key;
    drawSketch();
    return true;
  }
  if (e.key === "Tab" && fields.length > 1) {
    e.preventDefault();
    var t2 = start();
    var at = fields.findIndex(function (f) { return f.k === t2.field; });
    t2.field = fields[(at + (e.shiftKey ? fields.length - 1 : 1)) % fields.length].k;
    drawSketch();
    return true;
  }
  if (e.key === "Backspace" && E.dynInput) {
    e.preventDefault();
    E.dynInput.values[E.dynInput.field] = String(E.dynInput.values[E.dynInput.field] || "").slice(0, -1);
    drawSketch();
    return true;
  }
  if (e.key === "Enter" && dynHasEntry()) {
    e.preventDefault();
    dynCommit();
    return true;
  }
  return false;
}

/* Whether a number typed while drawing should also be recorded as a driving
   dimension. This is on by default: an exact number is design intent, so it
   remains editable after placement instead of becoming throwaway geometry. */
function autoDimTyped() { return !!E.autoDimTyped; }

/* Place the shape from the numbers on screen. Each branch ends by handing the
   typed values to the same builders the pointer uses, then attaching driving
   dimensions for whatever was actually typed. */
function dynCommit() {
  var fields = dynFields();
  if (!fields) return false;
  var live = dynLive(), anchor = dynAnchor();
  var typedKeys = fields.map(function (f) { return f.k; }).filter(function (k) { return dynTyped(k) != null; });
  var made = null;

  if (E.tool === "wall" || E.tool === "constr") {
    var length = Math.max(1e-6, Math.abs(dynValue("length", live) || E.grid));
    var rad = ((dynValue("angle", live) || 0) * Math.PI) / 180;
    var end = { u: anchor.u + Math.cos(rad) * length, v: anchor.v + Math.sin(rad) * length };
    pushUndo(t("opDraw"));
    var line = makeWallSegment(anchor, end, {typed:true, construction:E.tool === "constr"});
    if (!line) { H.discard(); return false; }
    if (autoDimTyped() && typedKeys.indexOf("length") >= 0) {
      addSmartDimension(ensureSketch(E.def), { type:"line", id:line.id }, length);
      resolveSketch(false);
    }
    anchor.pointId = line.a;
    E.wallPts.push({ u:end.u, v:end.v, pointId:line.b });
    E._mouse = { u:end.u, v:end.v };
    E.dynInput = null;
    refreshAll();
    return true;
  }

  pushUndo(t("opSketch"));
  var sketch = null;
  if (E.tool === "srect") {
    var w = Math.abs(dynValue("width", live)), h = Math.abs(dynValue("height", live));
    var m = E._mouse || { u: anchor.u + w, v: anchor.v + h };
    var sx = m.u < anchor.u ? -1 : 1, sy = m.v < anchor.v ? -1 : 1;
    var rect = addSketchRectangle(anchor, { u: anchor.u + sx * w, v: anchor.v + sy * h });
    if (rect) {
      sketch = ensureSketch(E.def);
      if (autoDimTyped() && typedKeys.indexOf("width") >= 0) addSmartDimension(sketch, { type:"line", id:rect[0].id }, w);
      if (autoDimTyped() && typedKeys.indexOf("height") >= 0) addSmartDimension(sketch, { type:"line", id:rect[1].id }, h);
    }
    made = rect;
  } else if (E.tool === "scirc") {
    var r = Math.abs(dynValue("diameter", live)) / 2;
    var circle = addSketchCircle(anchor, { u: anchor.u + r, v: anchor.v });
    if (autoDimTyped() && circle && typedKeys.indexOf("diameter") >= 0) {
      setEntityDimension(circle, "diameter", r * 2);
    }
    made = circle;
  } else if (E.tool === "spoly") {
    var pr = Math.abs(dynValue("diameter", live)) / 2;
    var sides = Math.round(dynValue("sides", live) || E.polySides);
    E.polySides = Math.max(3, Math.min(24, sides));
    var poly = addSketchPolygon(anchor, { u: anchor.u + pr, v: anchor.v }, E.polySides);
    if (poly && dynTyped("diameter") != null) {
      var guide = ensureSketch(E.def).entities.filter(function (x) { return x.construction && x.type === "circle"; }).pop();
      if (autoDimTyped() && guide) setEntityDimension(guide, "diameter", pr * 2);
    }
    made = poly;
  } else if (E.tool === "sslot") {
    var slot = dynSlot(live);
    made = slot;
  } else if (E.tool === "sell") {
    made = dynEllipse(live, typedKeys);
  }

  if (!made) { H.discard(); return false; }
  E.drag = null; E.slotPts = null; E.ellPts = null;
  E.dynInput = null;
  // the builders solve before the typed dimensions are attached, so one more
  // pass here is what makes the DOF count describe the shape that was placed
  resolveSketch(false);
  markDrawnSelection(made);
  E.sel = E.ssel[E.ssel.length - 1];
  refreshAll();
  return true;
}

function dynSlot(live) {
  var a = E.slotPts[0];
  var end = E.slotPts[1] || E._mouse || { u: a.u + E.grid, v: a.v };
  var dir = Math.atan2(end.v - a.v, end.u - a.u);
  var length = Math.abs(dynValue("length", live) || E.grid);
  var width = Math.abs(dynValue("width", live)) || E.grid;
  var b = { u: a.u + Math.cos(dir) * length, v: a.v + Math.sin(dir) * length };
  var slot = addSketchSlot(a, b, width / 2);
  if (!slot) return null;
  var sketch = ensureSketch(E.def);
  // the slot's own two numbers: centreline length, and the cap radius that is
  // half its width
  if (autoDimTyped() && dynTyped("length") != null) addSmartDimension(sketch, { type:"line", id:slot[4].id }, length);
  if (autoDimTyped() && dynTyped("width") != null) addSmartDimension(sketch, { type:"arc", id:slot[3].id }, width / 2);
  return slot;
}

function dynEllipse(live, typedKeys) {
  var c = E.ellPts[0];
  var major = E.ellPts[1] || E._mouse || { u: c.u + E.grid, v: c.v };
  var dir = Math.atan2(major.v - c.v, major.u - c.u);
  var rx = Math.abs(dynValue("major", live) || E.grid);
  var ry = Math.abs(dynValue("minor", live)) || rx / 2;
  var ellipse = addSketchEllipse(c, { u: c.u + Math.cos(dir) * rx, v: c.v + Math.sin(dir) * rx }, ry);
  if (!ellipse) return null;
  var sketch = ensureSketch(E.def);
  if (autoDimTyped() && typedKeys.indexOf("major") >= 0) sketch.constraints.push({ id:uid(), type:"radius", entity:ellipse.id, value:rx, driven:false });
  if (autoDimTyped() && typedKeys.indexOf("minor") >= 0) sketch.constraints.push({ id:uid(), type:"radius", entity:ellipse.id, axis:"minor", value:ry, driven:false });
  return ellipse;
}

/* The HUD itself: one boxed field per number, the active one highlighted, typed
   values in white and the measured fallback dimmed. */
function dynDrawHud(c, px, py) {
  var fields = dynFields();
  if (!fields) return;
  /* Measured first, typed second. This used to require E.dynInput — which the
     first keystroke creates — so a rubber-band carried no numbers at all until
     you had already committed to typing one, and there was no way to see the
     size you were dragging out. The measured value was ALREADY the fallback
     below and already drawn dimmer than a typed one; only its arrival was
     behind a keystroke. dynFields() is null unless a drag is live, so this
     still says nothing when there is nothing to say.

     Grey is what the pointer is saying, white is what you told it. */
  var input = E.dynInput && E.dynInput.tool === E.tool ? E.dynInput : null;
  var live = dynLive();
  c.save();
  c.font = "600 11px sans-serif";
  var boxes = fields.map(function (f) {
    var typed = input ? input.values[f.k] : null;
    var hasTyped = typed !== "" && typed != null;
    var measured = f.unit === "length" ? lengthToDocument(live[f.k] || 0, modelLengthUnit()) : (live[f.k] || 0);
    var shown = hasTyped ? typed
      : (f.whole ? String(Math.round(measured)) : String(Math.round(measured * 1000) / 1000));
    var explicitUnit=hasTyped && /\d\s*(?:mm|cm|m|in|ft)\s*$/i.test(typed);
    var label = t("dyn_" + f.k) + " " + shown + (f.unit === "length" ? (explicitUnit ? "" : " " + modelLengthUnit()) : f.u);
    return { on: !!input && f.k === input.field, typed: hasTyped, text: label, w: c.measureText(label).width + 16 };
  });
  var total = boxes.reduce(function (s, b) { return s + b.w + 4; }, 0);
  var x = Math.min(E.cw - total - 8, px + 14), y = Math.max(8, Math.min(E.ch - 30, py + 14));
  boxes.forEach(function (b) {
    c.fillStyle = b.on ? "#2684c7" : "rgba(15,23,42,.92)";
    c.fillRect(x, y, b.w, 22);
    c.fillStyle = b.typed || b.on ? "#fff" : "rgba(255,255,255,.62)";
    c.fillText(b.text, x + 8, y + 15);
    x += b.w + 4;
  });
  c.restore();
}

function constrainWallPoint(point, origin, hardOrtho) {
  if (!origin || !hardOrtho) return point;
  var du = point.u - origin.u, dv = point.v - origin.v;
  var length = Math.hypot(du, dv);
  if (length < 0.001) return point;
  var angle = Math.atan2(dv, du), step = Math.PI / 2;
  var snapped = Math.round(angle / step) * step;
  return { u: origin.u + Math.cos(snapped) * length, v: origin.v + Math.sin(snapped) * length };
}

var cancel2DPointerMoveGlobal = null;

function wireSketch() {
  var cv = E.cv;
  var sketchContacts=new Set();
  function takeOverSketchNavigation() {
    if(E.mode==='drawing')return;
    E._sketchPinching=true;
    cancel2DPointerMove();
    if(E.drag?.touchTransaction)H.abort();
    E.drag=null;E.touchPrecision=null;
  }
  cv.addEventListener('pointerdown',function(e){
    if(e.pointerType!=='touch')return;
    sketchContacts.add(e.pointerId);
    if(sketchContacts.size>=2)takeOverSketchNavigation();
  },true);
  function releaseSketchContact(e){sketchContacts.delete(e.pointerId);}
  cv.addEventListener('pointerup',releaseSketchContact,true);
  cv.addEventListener('pointercancel',releaseSketchContact,true);
  function getCanvasRect() {
    if (!E._cvRect) {
      E._cvRect = cv.getBoundingClientRect();
      requestAnimationFrame(function () { E._cvRect = null; });
    }
    return E._cvRect;
  }
  var threeFinger = bindThreeFingerPan(cv, function (dx, dy) {
    if (E.drag && E.drag.mode !== "pan") E.drag = null;
    if (sketchProjection() && E.pv) {
      E.pv.panBy(dx, dy, true);
      drawSketch();
      return;
    }
    E.ox += dx;
    E.oy += dy;
    drawSketch();
  });
  function beginModelerPrecisionTrial(e, x, y, mode) {
    var previousDisplay = E.displayStyle;
    var directDragTool = E.tool === "rect" || E.tool === "circle" || E.tool === "sph" || E.tool === "cutc";
    var finishingDirectDrag = directDragTool && E.drag && E.drag.mode === "draw";
    startTouchPrecisionTrial({
      mode:mode, pointerId:e.pointerId, canvas:cv, x:x, y:y, axes:["U","V"], unitLabel:getDomainUnit("details"),
      sourceCanvases:function(){
        var sources=[];
        if(E.pv&&E.pv.rr&&E.pv.rr.domElement)sources.push(E.pv.rr.domElement);
        sources.push(cv);return sources;
      },
      screenToModel:function(point){var uv=toUV(point.x,point.y);return{x:uv.u,y:uv.v};},
      modelToScreen:function(point){return toPx(point.x,point.y);},
      describe:function(point){
        var uv=toUV(point.x,point.y),origin=null;
        if(E.wallPts&&E.wallPts.length)origin=E.wallPts[E.wallPts.length-1];
        else if(E.poly&&E.poly.length)origin=E.poly[E.poly.length-1];
        else if(E.drag&&fin(E.drag.u)&&fin(E.drag.v))origin={u:E.drag.u,v:E.drag.v};
        var secondary="";
        if(origin){var length=Math.hypot(uv.u-origin.u,uv.v-origin.v),angle=Math.atan2(uv.v-origin.v,uv.u-origin.u)*180/Math.PI;secondary="L "+Math.round(length*10)/10+" cm · ∠ "+Math.round(angle*10)/10+"°";}
        return{primary:"U "+Math.round(uv.u*10)/10+" · V "+Math.round(uv.v*10)/10,secondary:secondary};
      },
      getDistances:function(point){return modelerTouchDistances({ox:point.x,oy:point.y});},
      onMove:function(point){dispatchPrecisionMove(cv,point);},
      onSnap:function(direction,point){
        var count=Math.max(1,(E.inferenceCandidates||[]).length);
        E.inferenceIndex=((Number(E.inferenceIndex)||0)+direction+count)%count;
        var origin=E.wallPts&&E.wallPts.length?E.wallPts[E.wallPts.length-1]:null;
        var snapped=snapPt(toUV(point.x,point.y),null,origin);return toPx(snapped.u,snapped.v);
      },
      onXray:function(on){setModelDisplay(on?"transparent":previousDisplay);},
      onConfirm:function(point){
        // Direct primitives were originally press-drag-release tools.  Keep
        // their first refined point armed, then finish them with the second
        // refined point; a zero-length synthetic click would otherwise erase
        // the primitive before the user ever got a chance to size it.
        if(directDragTool){
          if(finishingDirectDrag){dispatchPrecisionMove(cv,point);dispatchPrecisionUp(cv,point);}
          else dispatchPrecisionDown(cv,point);
        }else dispatchPrecisionCommit(cv,point);
      },
      onCancel:function(){
        E.touchPrecision=null;
        if(finishingDirectDrag)E.drag=null;
        setModelDisplay(previousDisplay);drawSketch();
      },
    });
    return true;
  }
  cv.addEventListener("pointerdown", function (e) {
    if (threeFinger() || (E.mode !== "drawing" && E._sketchPinching)) return;
    if (E.dimEditor && !applyDimensionEditor()) return;
    if(e.isTrusted)cv.setPointerCapture(e.pointerId);
    var r = getCanvasRect();
    var localX = e.clientX - r.left, localY = e.clientY - r.top;
    /* A sheet is not a sketch: the drafting table takes the whole gesture —
       pan, pick, drag a view along its projection line, place a dimension — and
       none of the sketching below applies to it. */
    if (E.mode === "drawing") {
      if (e.button === 2) e.preventDefault();
      drawingSheet().pointerDown(e, localX, localY);
      return;
    }
    /* Sketching on the model: middle-drag, right-drag or Alt-drag orbits the
       camera without leaving the tool. Being able to look around a solid while
       drawing on one of its faces is the point of sketching in 3D — the sheet
       is projected through the camera, so the profile stays welded to the face
       while the model turns underneath it. */
    if (sketchProjection() && (e.button === 1 || e.button === 2 || e.altKey)) {
      e.preventDefault();
      E.touchPrecision = null;
      E.drag = { mode: "orbit", px: e.clientX, py: e.clientY };
      return;
    }
    /* A sketch plane is live when the editor is not in the free 3D view, or
       when a sketch is projected onto a face inside it. That is the condition
       under which a one-finger drag is not an orbit, so a pick can carry the
       loupe without fighting navigation. */
    var precisionKind = modelerTouchPrecisionKind(E.tool, E.mode, E.mode !== "3d" || !!E.modelPlaneActive);
    var trialMode = getTouchPrecisionMode();
    /* Creation only: rough/portal replace a tap with place-lift-refine, which
       a plain selection must not inherit just because picking now carries the
       loupe. A pick keeps the loupe, which never moves the point. */
    if (e.pointerType === "touch" && precisionKind && modelerPrecisionTrialAllowed(E.tool)
      && trialMode !== "lens" && beginModelerPrecisionTrial(e, localX, localY, trialMode))
      return;
    E.touchPrecision = beginTouchPrecision(e, localX, localY, r, precisionKind);
    var downPoint = touchPrecisionPoint(E.touchPrecision, localX, localY);
    var exactPrecision=precisionModelPoint(e);
    var uv = exactPrecision ? {u:exactPrecision.x,v:exactPrecision.y} : toUV(downPoint.x, downPoint.y);
    if (e.button === 2) {
      e.preventDefault();
      E.drag = { mode: "gesture", px: e.clientX, py: e.clientY, moved: false };
      return;
    }
    if (e.button === 1 || e.shiftKey && E.tool === "select" && !hitPart(uv, e.pointerType)) {
      E.drag = { mode: "pan", px: e.clientX, py: e.clientY, ox: E.ox, oy: E.oy };
      return;
    }
    if (E.tool === "select" || E.tool === "dim") {
      var dimLocalX = e.clientX - r.left, dimLocalY = e.clientY - r.top;
      var underPointer = hitSketch(uv, e.pointerType);
      var sketchDim = smartDimensionOriginWins(E.tool, uv, (e.pointerType === "touch" ? 14 : 7) / E.scl, underPointer)
        ? null : dimensionHitYieldsToPoint(placedDimensionHit(ensureSketch(E.def), dimLocalX, dimLocalY), underPointer);
      if (sketchDim) {
        pushUndo(t("opMoveDim"));
        E.dimPick = [];
        E.ssel = [];
        E.sel = null;
        E.dimSel = sketchDim.constraint.id;
        E.drag = { mode:"dimension", sketch:ensureSketch(E.def), constraint:sketchDim.constraint, editOnRelease:false, moved:false, px:e.clientX, py:e.clientY, instant2d: sketchDim.kind === "label", startValue: Number(sketchDim.constraint.value) || 0 };
        drawSketch();
        return;
      }
    }
    if(exactPrecision)E._osnap=null;
    var sp = exactPrecision ? uv : snapPt(uv, null, E.tool === "wall" && E.wallPts && E.wallPts.length ? E.wallPts[E.wallPts.length - 1] : null), su = sp.u, sv = sp.v;
    E._suppressInference = !!exactPrecision || e.ctrlKey || e.metaKey;
    if (E.tool === "sketchpoint") {
      var active = ensureSketch(E.def);
      pushUndo("Sketch point");
      var pointId = newSketchPoint(active, { u: su, v: sv });
      active.entities.push({ id: uid(), type: "point", p: pointId, name: "Point" });
      selectSketch(sketchPoint(active, pointId), false);
      resolveSketch(false); refreshAll();
      if(e.pointerType==='touch')openSketchPointCoordinates(active,sketchPoint(active,pointId));
      return;
    }
    if (E.tool === "wall" || E.tool === "constr") {
      // An idle Construction click on a curve keeps the existing toggle action;
      // a click on blank space or a point starts a new construction line.
      if (E.tool === "constr" && (!E.wallPts || !E.wallPts.length)) {
        var existingCurve = hitSketch(uv, e.pointerType);
        if (existingCurve && existingCurve.type && existingCurve.type !== "point") {
          var currentSketch = ensureSketch(E.def);
          pushUndo(t("tool_constr"));
          if (!toggleConstruction(currentSketch, existingCurve.id)) H.discard();
          else { E.ssel = []; E.sel = null; resolveSketch(false); }
          refreshAll();
          return;
        }
      }
      if (!E.wallPts || !E.wallPts.length) {
        E.wallPts = [{ u: su, v: sv, pointId: sp.pointId || null }];
        E.dynInput = null;
        E._mouse = { u: su, v: sv };
      } else {
        var last = E.wallPts[E.wallPts.length - 1];
        var cp = E._osnap ? { u: su, v: sv, pointId: sp.pointId || null } : constrainWallPoint({ u: su, v: sv }, last, e.shiftKey);
        if (Math.hypot(cp.u - last.u, cp.v - last.v) >= 1e-6) {
          pushUndo(t("opDraw"));
          var madeLine = makeWallSegment(last, cp, {construction:E.tool === "constr"});
          if (madeLine) {
            last.pointId = madeLine.a;
            E.wallPts.push({ u: cp.u, v: cp.v, pointId: madeLine.b });
          }
          E._mouse = { u: cp.u, v: cp.v };
          refreshAll();
        }
      }
      drawSketch();
      return;
    }
    if (E.tool === "poly" || E.tool === "cut" || E.tool === "rev") {
      if (!E.poly) E.poly = [];
      // ortho lock against previous point (object snap wins when one is hit)
      if (e.shiftKey && E.poly.length && !E._osnap) {
        var pr = E.poly[E.poly.length - 1];
        if (Math.abs(su - pr.u) > Math.abs(sv - pr.v)) sv = pr.v; else su = pr.u;
      }
      E.poly.push({ u: su, v: sv });
      drawSketch();
      return;
    }
    if (E.tool === "rect" || E.tool === "circle" || E.tool === "sph" || E.tool === "cutc") {
      E.drag = { mode: "draw", u: su, v: sv };
      return;
    }
    /* Rectangle, circle and polygon all take two points. A press-drag-release
       places one, and so does click-move-click: releasing without having moved
       leaves the tool armed (`sticky`) so the next click finishes it. Without
       that, typing a size was impossible — Enter needs a hand on the keyboard,
       not on a held mouse button — and click-click is how CAD tools behave. */
    if (E.tool === "srect" || E.tool === "scirc" || E.tool === "spoly") {
      var mode = E.tool;
      if (E.drag && E.drag.mode === mode && E.drag.sticky) { finishTwoPointTool({ u: su, v: sv }); return; }
      // what the press landed on decides the first point's relation (origin, existing point)
      E.drag = { mode: mode, u: su, v: sv, px: e.clientX, py: e.clientY, snap: E._osnap ? { k: E._osnap.k, pointId: E._osnap.pointId || null } : null };
      E._mouse = { u: su, v: sv };
      drawSketch();
      return;
    }
    if (E.tool === "sslot") {           // slot: centreline start, end, then width
      if (!E.slotPts) E.slotPts = [];
      E.slotPts.push({ u: su, v: sv });
      E._mouse = { u: su, v: sv };
      if (E.slotPts.length === 3) {
        var slotWidth = pointToLineDistance(E.slotPts[2], E.slotPts[0], E.slotPts[1]);
        pushUndo(t("opSketch"));
        var slot = addSketchSlot(E.slotPts[0], E.slotPts[1], slotWidth);
        E.slotPts = null; E.dynInput = null;
        if (slot) { markDrawnSelection(slot); E.sel = slot[0]; } else H.discard();
        refreshAll();
      }
      drawSketch();
      return;
    }
    if(E.tool==="sspline"){
      E.splinePts=E.splinePts||[];E.splinePts.push({x:su,y:sv});
      if(E.splinePts.length===4){pushUndo(t("opSketch"));try{selectSketch(addCubicSpline(ensureSketch(E.def),E.splinePts),false);}catch(error){H.discard();flash(error.message);}E.splinePts=null;refreshAll();}
      else flash(t("splineHint")+" · "+E.splinePts.length+"/4");drawSketch();return;
    }
    if (E.tool === "sell") {            // ellipse: centre, major axis end, minor
      if (!E.ellPts) E.ellPts = [];
      E.ellPts.push({ u: su, v: sv });
      E._mouse = { u: su, v: sv };
      if (E.ellPts.length === 3) {
        var minor = pointToLineDistance(E.ellPts[2], E.ellPts[0], E.ellPts[1]);
        pushUndo(t("opSketch"));
        var ell = addSketchEllipse(E.ellPts[0], E.ellPts[1], minor);
        E.ellPts = null; E.dynInput = null;
        if (ell) selectSketch(ell, false); else H.discard();
        refreshAll();
      }
      drawSketch();
      return;
    }
    if (E.tool === "sarc") {            // sketch arc: centre, start, end — or tangent / 3-point variants
      if (E.arcTangent) {
        var tangentHit = hitSketch(uv, e.pointerType);
        if (!E.arcPts || !E.arcPts.length) {
          var startPoint = tangentHit && !tangentHit.type ? tangentHit : (sp.pointId ? sketchPoint(ensureSketch(E.def), sp.pointId) : null);
          var source = startPoint && entityOutgoingTangent(ensureSketch(E.def), startPoint.id);
          if (!source) { flash(t("tangentArcNeedEnd")); drawSketch(); return; }
          E.arcPts = [{ u: source.point.x, v: source.point.y, pointId: source.point.id, tangent: source.tangent, entityId: source.entity.id }];
          drawSketch();
          return;
        }
        pushUndo(t("opSketch"));
        var tangentDef = tangentArc(E.arcPts[0], E.arcPts[0].tangent, { u: su, v: sv, pointId: sp.pointId });
        var tangentMade = tangentDef && addSketchArc(tangentDef.centre, tangentDef.start, tangentDef.end, true);
        if (tangentMade) {
          var liveSketch = ensureSketch(E.def);
          var tangentRule = { id: uid(), type: "tangent", a: E.arcPts[0].entityId, b: tangentMade.id };
          liveSketch.constraints.push(tangentRule);
          if (!resolveSketch(true)) {
            // the arc stays; only its tangency is refused, and now says why
            var tangentWhy = explainSketchConflict(liveSketch, { keep: [tangentRule.id] });
            var tangentSubject = constraintCaption(tangentRule, liveSketch);
            liveSketch.constraints = liveSketch.constraints.filter(function (constraint) { return constraint !== tangentRule; });
            resolveSketch(false);
            showSketchRefusal(liveSketch, tangentSubject, [tangentRule.id], tangentWhy);
          }
          selectSketch(tangentMade, false);
        } else { H.discard(); flash(t("tangentArcNeedEnd")); }
        E.arcPts = null;
        refreshAll();
        return;
      }
      if (!E.arcPts) E.arcPts = [];
      E.arcPts.push({ u: su, v: sv, pointId:sp.pointId, k:sp.k });
      if (E.arcPts.length === 3) {
        pushUndo(t("opSketch"));
        var definition=E.arcThreePoint ? threePointArc(E.arcPts[0],E.arcPts[1],E.arcPts[2]) : null;
        var arc = E.arcThreePoint
          ? definition && addSketchArc(definition.centre,definition.start,definition.end,true)
          : addSketchArc(E.arcPts[0], E.arcPts[1], E.arcPts[2]);
        E.arcPts = null;
        if (arc) selectSketch(arc, false); else H.discard();
        refreshAll();
      }
      drawSketch();
      return;
    }
    if (E.tool === "sketchfillet") {
      var filletHit = hitSketch(uv, e.pointerType);
      if (!filletHit) { drawSketch(); return; }
      if (!filletHit.type) selectSketch(filletHit, false);
      // a line meeting an arc fillets too (HOUSING's lower corners), so an arc is a valid second pick
      else if (filletHit.type === "line" || filletHit.type === "arc") selectSketch(filletHit, selFilletCurves().length === 1);
      else { flash(t("sketchFilletTwoLines")); refreshAll(); return; }
      if (sketchFilletSelectionReady()) applySketchFilletFromSelection(liveSketchFilletValues());
      refreshAll();
      return;
    }
    if (E.tool === "trim" || E.tool === "extend" || E.tool === "offset") {
      var target = hitSketch(uv, e.pointerType);
      if (!target || !target.type) {
        if(E.tool==="offset"){
          var edgePick=E.pv && resolveTopologyPick(e,E.pv,{prefer:"edge"});
          if(edgePick && edgePick.reference && edgePick.reference.kind==="edge")openModelEdgeOffsetForm(edgePick.reference);
          else flash("Select a sketch curve or a complete circular model edge");
        }
        drawSketch();return;
      }
      /* Offset asks for a distance, and the panel that asks is asynchronous —
         so unlike Trim and Extend it cannot push an undo entry here. The
         apply handler pushes it, and cancelling leaves the history alone. */
      if (E.tool === "offset") { openSketchOffsetForm(target.id); drawSketch(); return; }
      var sketch = ensureSketch(E.def), ok = false, why = "";
      /* A refused trim or extend used to discard its undo and say nothing at
         all, so clicking Trim on a circle read as a broken build. Both tools
         are line-only (sketch_trim.js), and extend additionally needs geometry
         beyond the end you picked. */
      if (E.tool === "trim") {
        pushUndo(t("opTrim"));
        ok = trimEntity(sketch, target.id, { x: uv.u, y: uv.v });
        if (!ok) why = ["line","arc","circle","spline"].includes(target.type) ? t("trimHint") : t("trimLineOnly");
      } else if (E.tool === "extend") {
        pushUndo(t("tool_extend"));
        ok = extendEntity(sketch, target.id, { x: uv.u, y: uv.v });
        if (!ok) why = ["line","arc"].includes(target.type) ? t("extendNoTarget") : t("extendLineOnly");
      }
      if (!ok) H.discard();
      else { E.ssel = []; E.sel = null; resolveSketch(false);if(sketch.lastEdit?.repairCount)why=t("sketchRepairNeeded")+" · "+sketch.lastEdit.repairCount; }
      if (why) flash(why);
      refreshAll();
      return;
    }
    if (E.tool === "dim") {
      var dhit = hitSketch(uv, e.pointerType);
      /* The sketch Origin is always pickable (G21): HOUSING HandlePath dimensions
         the Origin to its horizontal line and has no point of its own there. A
         fixed point at (0, 0) is found or made once, then flows on as a point. */
      if (!dhit && pickIsOrigin(uv, (e.pointerType === "touch" ? 14 : 7) / E.scl)) {
        if (!sketchOriginPoint(ensureSketch(E.def))) pushUndo(t("opDim"));
        dhit = ensureSketchOriginPoint(ensureSketch(E.def), uid).point;
      }
      /* SOLIDWORKS Smart Dimension: a line is not dimensioned on the first
         click. A second line gives the distance between them when parallel
         (HOUSING step 326: 3.100 in between the two side lines) or the angle
         when not; clicking empty space places the first line's own length.
         The old single click dimensioned the length at once and swallowed
         the second pick. */
      var pendingLine = E.dimPick.length === 1 && E.dimPick[0].kind === "line" ? E.dimPick[0] : null;
      if (pendingLine) {
        E.dimPick = [];
        var pts0 = new Map((ensureSketch(E.def).points || []).map(function (q) { return [q.id, q]; }));
        if (dhit && dhit.type === "line" && dhit.id !== pendingLine.id) {
          var la = lineData(sketchEntity(ensureSketch(E.def), pendingLine.id), pts0), lb = lineData(dhit, pts0);
          var parallel = la && lb && la.length > 1e-9 && lb.length > 1e-9
            && Math.abs((la.dx * lb.dy - la.dy * lb.dx) / (la.length * lb.length)) < 1e-3;
          smartDimension(parallel ? { type: "lines", a: pendingLine.id, b: dhit.id } : { type: "angle", a: pendingLine.id, b: dhit.id }, e.clientX, e.clientY);
          E.ssel = []; E.sel = null;
          return;
        }
        if (!dhit) {
          smartDimension({ type: "line", id: pendingLine.id }, e.clientX, e.clientY);
          E.ssel = []; E.sel = null;
          return;
        }
        if (dhit.type === undefined && "x" in dhit) {
          smartDimension({ type: "pointLine", point: dhit.id, line: pendingLine.id }, e.clientX, e.clientY);
          E.ssel = []; E.sel = null;
          return;
        }
      }
      // a point picked first, then a line: perpendicular distance (step 330: Origin → top line)
      var pickedPoint = selPoints().length === 1 ? selPoints()[0] : null;
      if (dhit && dhit.type === "line" && pickedPoint && dhit.a !== pickedPoint.id && dhit.b !== pickedPoint.id) {
        smartDimension({ type: "pointLine", point: pickedPoint.id, line: dhit.id }, e.clientX, e.clientY);
        E.ssel = []; E.sel = null;
        return;
      }
      if (dhit && dhit.type === "line") {
        E.dimPick = [{ kind: "line", id: dhit.id }];
        selectSketch(dhit, false);
        flash(t("dimSecondPick"));
        refreshAll();
        return;
      }
      var dtarget = dimensionTarget(dhit, uv);
      if (!dtarget) { selectSketch(dhit, false); refreshAll(); return; }
      smartDimension(dtarget, e.clientX, e.clientY);
      E.ssel = []; E.sel = null;
      return;
    }
    // select tool
    var p = hitPart(uv, e.pointerType);
    // sketch geometry: Ctrl/Cmd extends the selection, points drag and re-solve
    if (isSketchObject(p)) {
      selectSketch(p, e.ctrlKey || e.metaKey || E.mobileAddSelection);
      if (!p.type && !(e.ctrlKey || e.metaKey)) {
        if(e.pointerType==='touch')H.begin(t("opDragPt"));else pushUndo(t("opDragPt"));
        // The point under the cursor is authoritative while you hold it: pin it
        // so the solver moves everything else to suit, instead of being free to
        // slide it back and undo the drag.
        E.drag = { mode: "spoint", pt: p, moved: false, wasFixed: !!p.fixed, touchTransaction:e.pointerType==='touch' };
        p.fixed = true;
      }
      refreshAll();
      return;
    }
    // In canonical sketch mode solids are context geometry only. Their design
    // parameters are edited through history, never by dragging the projection.
    if (isCanonicalAuthoring() && E.authoring && E.authoring.phase === "sketch") {
      /* A corner beats the edge it ends: the point of a Coincident. */
      var visibleModelEdges = sketchVisibleModelEdges(), pickTolerance = (e.pointerType === "touch" ? 14 : 7) / E.scl;
      /* Drawn over the model through a perspective camera, an edge off the sketch
         plane is not where its plane projection is: compare the click with where
         the edge is drawn. The flat sheet has no camera, so it keeps the plane hit. */
      var pickProjection = sketchProjection(), screenTolerance = e.pointerType === "touch" ? 14 : 8;
      var pickScreen = pickProjection ? function (world) { return worldToSketchPx(pickProjection, world); } : null;
      var modelVertex = pickScreen ? hitScreenModelVertex(downPoint, visibleModelEdges, screenTolerance, pickScreen)
        : hitProjectedModelVertex(ensureSketch(E.def), { x: uv.u, y: uv.v }, visibleModelEdges, pickTolerance);
      var modelEdge = modelVertex || (pickScreen ? hitScreenModelEdge(downPoint, visibleModelEdges, screenTolerance, pickScreen, edgePoints)
        : hitProjectedModelEdge(ensureSketch(E.def), { x: uv.u, y: uv.v }, visibleModelEdges, pickTolerance));
      if (modelEdge) {
        var reference = modelVertex ? cloneData(modelVertex) : topologyReferenceFromEntry(modelEdge) || cloneData(modelEdge);
        var additive = e.ctrlKey || e.metaKey || E.mobileAddSelection || selPoints().length > 0;
        if (!additive) E.topologySelection = [];
        var already = (E.topologySelection || []).findIndex(function (item) { return item.persistentId === reference.persistentId; });
        if (already >= 0) E.topologySelection.splice(already, 1);
        else { E.topologySelection = E.topologySelection || []; E.topologySelection.push(reference); }
        refreshAll();
        return;
      }
      // Ctrl/Cmd-click that misses keeps the selection, as in SOLIDWORKS: one
      // slightly-off pick must not throw away a Mirror selection built up of
      // several entities.
      if (!(e.ctrlKey || e.metaKey || E.mobileAddSelection)) {
        E.ssel = [];
        E.sel = null;
        dropSketchModelPicks();
      }
      refreshAll();
      return;
    }
    E.ssel = [];
    if (p && !p.sketch && partEditableInSketch(p)) {
      for (var i = 0; i < (p.pts || []).length; i++) {
        var s = toPx(p.pts[i].u, p.pts[i].v);
        if (Math.hypot(s.x - (e.clientX - r.left), s.y - (e.clientY - r.top)) < (e.pointerType === "touch" ? 14 : 7)) {
          E.sel = p;
          pushUndo(t("opVertex"));
          E.drag = { mode: "vertex", idx: i };
          return;
        }
      }
    }
    E.sel = p;
    if (!p && E.tool === "select") {
      E.drag = { mode: "box", x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top };
      drawSketch();
      return;
    }
    if (p) { pushUndo(t("opMove")); E.drag = { mode: "move", u: uv.u, v: uv.v }; }
    refreshAll();
  });
  var pointerMoveRaf = 0;
  var latest2DMove = null;

  function flush2DPointerMove() {
    if (pointerMoveRaf) {
      cancelAnimationFrame(pointerMoveRaf);
      pointerMoveRaf = 0;
    }
    if (latest2DMove) {
      var ev = latest2DMove;
      latest2DMove = null;
      process2DPointerMove(ev);
    }
  }

  function cancel2DPointerMove() {
    if (pointerMoveRaf) {
      cancelAnimationFrame(pointerMoveRaf);
      pointerMoveRaf = 0;
    }
    latest2DMove = null;
  }
  cancel2DPointerMoveGlobal = cancel2DPointerMove;

  function process2DPointerMove(e) {
    if (threeFinger() || (E.mode !== "drawing" && E._sketchPinching)) return;
    var r = getCanvasRect();
    var localX = e.clientX - r.left, localY = e.clientY - r.top;
    if (E.mode === "drawing") { drawingSheet().pointerMove(e, localX, localY); syncStatus(); return; }
    if(e.pointerType==="touch"&&touchPrecisionTrialOwns(e.pointerId)){
      updateTouchPrecisionTrial(e.pointerId,localX,localY);return;
    }
    if (E.touchPrecision && E.touchPrecision.pointerId === e.pointerId)
      updateTouchPrecision(E.touchPrecision, localX, localY);
    var movePoint = touchPrecisionPoint(E.touchPrecision && E.touchPrecision.pointerId === e.pointerId ? E.touchPrecision : null, localX, localY);
    var uv = toUV(movePoint.x, movePoint.y);
    E._mouse = uv;
    syncStatus();
    if (E.drag) {
      if (E.drag.mode === "orbit") {
        if (E.pv) {
          E.pv.az += (e.clientX - E.drag.px) * 0.009;
          E.pv.el = clamp(E.pv.el + (e.clientY - E.drag.py) * 0.006, -1.5, 1.5);
          if (E.pv.clearFixedFrame) E.pv.clearFixedFrame(false);
          E.pv.render();
        }
        E.drag.px = e.clientX; E.drag.py = e.clientY;
        drawSketch();   // the sheet is the camera's projection, so it moves too
        return;
      }
      if (E.drag.mode === "pan") {
        E.ox = E.drag.ox + (e.clientX - E.drag.px);
        E.oy = E.drag.oy + (e.clientY - E.drag.py);
      } else if (E.drag.mode === "dimension") {
        var dimensionRect = r;
        if (E.drag.instant2d) {
          var delta = (e.clientX - E.drag.px) + (e.clientY - E.drag.py) * 0.25;
          E.drag.constraint.value = dimensionValueFromDrag(E.drag.startValue, delta, E.scl);
          E.drag.moved = true;
          resolveSketch(false, true);
        } else if (placeDimensionAtPointer(E.drag.sketch, E.drag.constraint, e.clientX - dimensionRect.left, e.clientY - dimensionRect.top)) {
          if (E.drag.px == null || Math.hypot(e.clientX - E.drag.px, e.clientY - E.drag.py) > 2) E.drag.moved = true;
        }
        E.drag.lastClientX = e.clientX;
        E.drag.lastClientY = e.clientY;
      } else if (E.drag.mode === "box") {
        E.drag.x1 = e.clientX - r.left; E.drag.y1 = e.clientY - r.top;
      } else if (E.drag.mode === "gesture") {
        if (Math.hypot(e.clientX - E.drag.px, e.clientY - E.drag.py) > 12) E.drag.moved = true;
      } else if (E.drag.mode === "move" && E.sel) {
        var du = snapV(uv.u - E.drag.u), dv = snapV(uv.v - E.drag.v);
        if (e.shiftKey) { if (Math.abs(du) > Math.abs(dv)) dv = 0; else du = 0; } // ortho move
        if (du || dv) {
          moveInView(E.sel, du, dv);
          E.drag.u += du; E.drag.v += dv;
          updatePreview(); fillInspector();
        }
      } else if (E.drag.mode === "spoint") {
        // dragging a sketch point solves the whole sketch every frame, so the
        // rest of the geometry follows its constraints live
        var pp = snapPt(uv);
        E.drag.pt.x = pp.u; E.drag.pt.y = pp.v;
        E.drag.moved = true;
        resolveSketch(false, true);   // geometry now, DOF count on release
        fillInspector();
      } else if (E.drag.mode === "scirc" || E.drag.mode === "srect" || E.drag.mode === "spoly") {
        E._mouse = snapPt(uv);
      } else if (E.drag.mode === "vertex" && E.sel) {
        var vp = snapPt(uv, E.sel); // snap dragged vertex to other parts' geometry
        E.sel.pts[E.drag.idx].u = vp.u;
        E.sel.pts[E.drag.idx].v = vp.v;
        updatePreview();
      }
      drawSketch();
      return;
    }
    // live snap feedback while sketching: cursor magnetizes to the target
    if (E.wallPts && E.wallPts.length) {
      var wp = snapPt(uv, null, E.wallPts[E.wallPts.length - 1]);
      var wl = E.wallPts[E.wallPts.length - 1];
      E._mouse = E._osnap ? wp : constrainWallPoint(wp, wl, e.shiftKey);
      drawSketch();
    } else if (E.poly || (E.tool !== "select" && !E.drag)) {
      var mp = snapPt(uv);
      if (E._osnap) E._mouse = mp;
      drawSketch();
    }
  }

  cv.addEventListener("pointermove", function (e) {
    latest2DMove = {
      clientX: e.clientX,
      clientY: e.clientY,
      shiftKey: e.shiftKey,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
    };
    if (!pointerMoveRaf) {
      pointerMoveRaf = requestAnimationFrame(function () {
        pointerMoveRaf = 0;
        if (latest2DMove) {
          var ev = latest2DMove;
          latest2DMove = null;
          process2DPointerMove(ev);
        }
      });
    }
  });
  cv.addEventListener("pointerup", async function (e) {
    flush2DPointerMove();
    if (threeFinger() || (E.mode !== "drawing" && E._sketchPinching)) return;
    if (E.mode === "drawing") {
      var sheetRect = getCanvasRect();
      drawingSheet().pointerUp(e, e.clientX - sheetRect.left, e.clientY - sheetRect.top);
      syncStatus();
      return;
    }
    if(touchPrecisionTrialOwns(e.pointerId)){
      releaseTouchPrecisionTrial(e.pointerId,false);E.touchPrecision=null;drawSketch();return;
    }
    var releaseRect = getCanvasRect();
    var releaseX = e.clientX - releaseRect.left, releaseY = e.clientY - releaseRect.top;
    var activePrecision = E.touchPrecision && E.touchPrecision.pointerId === e.pointerId ? E.touchPrecision : null;
    var releasePoint = touchPrecisionPoint(activePrecision, releaseX, releaseY);
    if (activePrecision) E.touchPrecision = null;
    if (E.drag && E.drag.mode === "gesture") {
      var gdx = e.clientX - E.drag.px, gdy = e.clientY - E.drag.py;
      var moved = E.drag.moved;
      E.drag = null;
      if (moved) applyMouseGesture(gdx, gdy);
      else showContextMenu(e.clientX, e.clientY);
      return;
    }
    if (E.drag && E.drag.mode === "box") {
      finishBoxSelect(E.drag);
      E.drag = null;
      refreshAll();
      return;
    }
    if (E.drag && E.drag.mode === "dimension") {
      finishDimensionDrag(e.clientX, e.clientY);
      return;
    }
    if (E.drag && (E.drag.mode === "srect" || E.drag.mode === "scirc" || E.drag.mode === "spoly")) {
      var travelled = Math.hypot(e.clientX - E.drag.px, e.clientY - E.drag.py) > 4;
      // a click that did not drag arms the tool instead of drawing a zero-sized
      // shape, so the second point can be clicked — or typed
      if (!travelled && !E.drag.sticky) { E.drag.sticky = true; drawSketch(); syncHint(); return; }
      var exactRelease=precisionModelPoint(e);
      finishTwoPointTool(exactRelease ? {u:exactRelease.x,v:exactRelease.y} : snapPt(toUV(releasePoint.x, releasePoint.y)));
      return;
    }
    if (E.drag && E.drag.mode === "spoint") {
      E.drag.pt.fixed = E.drag.wasFixed;   // the pin lasts only for the drag
      if(E.drag.touchTransaction){if(E.drag.moved){H.commit(t("opDragPt"));scheduleModelerDraft();}else H.cancel();}
      else if (!E.drag.moved) H.discard();
      E.drag = null;
      resolveSketch(false);
      refreshAll();
      return;
    }
    if (E.drag && E.drag.mode === "draw") {
      var r = cv.getBoundingClientRect(), uv = toUV(releasePoint.x, releasePoint.y);
      var exactEnd=precisionModelPoint(e);
      var sp = exactEnd ? {u:exactEnd.x,v:exactEnd.y} : snapPt(uv), u1 = sp.u, v1 = sp.v, u0 = E.drag.u, v0 = E.drag.v;
      if (Math.abs(u1 - u0) > 1 || Math.abs(v1 - v0) > 1) {
        pushUndo(t("opDraw"));
        if (E.tool === "cutc") {
          // circular bore: punch a 24-gon hole centered at the drag start
          var cr = Math.hypot(u1 - u0, v1 - v0), loop = [];
          for (var k = 0; k < 24; k++) loop.push({ u: u0 + Math.cos((k * Math.PI) / 12) * cr, v: v0 + Math.sin((k * Math.PI) / 12) * cr });
          flash(((await applyCut(loop)) ? t("cutDone") : t("cutNone")) + cutSkipNote());
        } else {
          var part = makeDrawnPart(u0, v0, u1, v1);
          if (part) { addPart(part); E.sel = part; }
        }
        refreshAll();
      }
    }
    E.drag = null;
    drawSketch();
  });
  cv.addEventListener("pointercancel", function (e) {
    cancel2DPointerMove();
    if (E.mode === "drawing") { drawingSheet().pointerCancel(e); return; }
    if(E.drag?.touchTransaction){H.abort();E.drag=null;E.touchPrecision=null;return;}
    if(touchPrecisionTrialOwns(e.pointerId)){
      releaseTouchPrecisionTrial(e.pointerId,true);E.touchPrecision=null;drawSketch();return;
    }
    if (E.touchPrecision && E.touchPrecision.pointerId === e.pointerId) {
      E.touchPrecision = null;
      E.drag = null;
      drawSketch();
    }
  });
  cv.addEventListener("dblclick", function (e) {
    if (E.mode === "drawing") {
      var sheetRect = cv.getBoundingClientRect();
      drawingSheet().doubleClick(e, e.clientX - sheetRect.left, e.clientY - sheetRect.top);
      return;
    }
    if ((E.tool === "wall" || E.tool === "constr") && E.wallPts) { finishWallChain(false); return; }
    if (E.tool === "select" || E.tool === "dim") {
      var sketchRect = cv.getBoundingClientRect(), sketch = ensureSketch(E.def);
      var dimension = placedDimensionAt(sketch, e.clientX - sketchRect.left, e.clientY - sketchRect.top);
      if (dimension) {
        E.dimSel = dimension.id;
        editPlacedDimension(sketch, dimension, false, e.clientX, e.clientY);
        return;
      }
    }
    if (E.tool === "poly" || E.tool === "cut" || E.tool === "rev") { finishPoly(); return; }
    if (E.sel && !E.sel.sketch && partEditableInSketch(E.sel)) {
      var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var pts = E.sel.pts;
      // fillet: dbl-click a corner (checked before edges — corners win)
      for (var vi = 0; vi < pts.length; vi++) {
        var vs = toPx(pts[vi].u, pts[vi].v);
        if (Math.hypot(vs.x - mx, vs.y - my) < 7) {
          /* A window.prompt() freezes the canvas the corner is on, so the one
             thing you want to look at while typing a radius — the corner — is
             behind a modal. The quick form is the same two questions with the
             drawing still visible, and it makes the fillet/chamfer choice a
             control rather than a "c" prefix nobody could discover. */
          cornerRoundForm(pts, vi);
          return;
        }
      }
      // dimension constraint: set edge length of selected polygon
      for (var i = 0; i < pts.length; i++) {
        var a = toPx(pts[i].u, pts[i].v), b = toPx(pts[(i + 1) % pts.length].u, pts[(i + 1) % pts.length].v);
        var L2 = Math.hypot(b.x - a.x, b.y - a.y);
        if (!L2) continue;
        var tt = clamp(((mx - a.x) * (b.x - a.x) + (my - a.y) * (b.y - a.y)) / (L2 * L2), 0, 1);
        if (Math.hypot(a.x + (b.x - a.x) * tt - mx, a.y + (b.y - a.y) * tt - my) < 6) {
          var q0 = pts[i], q1 = pts[(i + 1) % pts.length];
          segmentLengthForm(q0, q1);
          return;
        }
      }
    }
  });
  cv.addEventListener("wheel", function (e) {
    e.preventDefault();
    if (E.mode === "drawing") {
      var sheetRect = cv.getBoundingClientRect();
      drawingSheet().wheel(e, e.clientX - sheetRect.left, e.clientY - sheetRect.top);
      syncStatus();
      return;
    }
    // over the model the wheel dollies the camera; there is no separate sheet
    // zoom to change
    if (sketchProjection() && E.pv) {
      E.pv.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      drawSketch();
      syncStatus();
      return;
    }
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var k = e.deltaY < 0 ? 1.12 : 1 / 1.12, ns = clamp(E.scl * k, SKETCH_MIN_SCALE, SKETCH_MAX_SCALE);
    E.ox = mx - ((mx - E.ox) / E.scl) * ns;
    E.oy = my - ((my - E.oy) / E.scl) * ns;
    E.scl = ns;
    drawSketch();
    syncStatus();
  }, { passive: false });
  /* Two-finger pinch zoom on the sketch canvas — the touch equivalent of the
     wheel handler above. When sketching over the 3D model, the pinch dollies
     the camera instead of scaling the 2D sheet. */
  (function () {
    var pinch = null;
    function d2(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    cv.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        E.touchPrecision = null;
        if(E.mode !== "drawing")takeOverSketchNavigation();
        pinch = { dist: d2(e), x:(e.touches[0].clientX+e.touches[1].clientX)/2, y:(e.touches[0].clientY+e.touches[1].clientY)/2 };
        if (E.mode === "drawing") drawingSheet().beginPinch();
      }
    }, { passive: true });
    cv.addEventListener("touchmove", function (e) {
      if (!pinch || e.touches.length !== 2) { pinch = null; return; }
      e.preventDefault();
      var dist = d2(e);
      var f = pinch.dist / Math.max(dist, 1);
      pinch.dist = dist;
      var r = cv.getBoundingClientRect();
      var a = e.touches[0], b = e.touches[1];
      var mx = (a.clientX + b.clientX) / 2 - r.left;
      var my = (a.clientY + b.clientY) / 2 - r.top;
      var projection=sketchProjection();
      if (projection && E.pv) {
        var uv=toUV(pinch.x-r.left,pinch.y-r.top);
        var anchor=framePoint(projection.frame,uv.u,uv.v,0);
        var previewRect=E.pv.rr.domElement.getBoundingClientRect();
        E.pv.pinchAt(f,anchor,mx+r.left-previewRect.left,my+r.top-previewRect.top);
        pinch.x=mx+r.left;pinch.y=my+r.top;
        invalidateSketchProjection();drawSketch();syncStatus();return;
      }
      // a sheet zooms the paper, not the sketch it is not showing
      if (E.mode === "drawing") {
        drawingSheet().pinchBy(1/f,pinch.x-r.left,pinch.y-r.top,mx,my);
        pinch.x=mx+r.left;pinch.y=my+r.top;
        syncStatus();
        return;
      }
      var ns = clamp(E.scl / f, SKETCH_MIN_SCALE, SKETCH_MAX_SCALE);
      E.ox = mx - ((pinch.x-r.left - E.ox) / E.scl) * ns;
      E.oy = my - ((pinch.y-r.top - E.oy) / E.scl) * ns;
      pinch.x=mx+r.left;pinch.y=my+r.top;
      E.scl = ns;
      drawSketch();
      syncStatus();
    }, { passive: false });
    function end(e) {
      if (e.touches.length < 2) pinch = null;
      if(e.touches.length===0)E._sketchPinching=false;
      if (E.mode === "drawing" && e.touches.length === 0) drawingSheet().endPinch();
    }
    cv.addEventListener("touchend", end);
    cv.addEventListener("touchcancel", end);
  })();
  cv.addEventListener("pointerleave", function () {
    cancel2DPointerMove();
    if (!E.drag) E.touchPrecision = null;
    E._mouse = null; syncStatus();
  });
  cv.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (threeFinger() || (E.mode !== "drawing" && E._sketchPinching)) return;
    if (E.drag && E.drag.mode === "gesture" && E.drag.moved) return;
    showContextMenu(e.clientX, e.clientY);
  });

  /* Edge auto-pan for long sketches. This is the same interaction contract as
     the plan wall tool: entering a 44px edge band eases the canvas underneath
     the stationary pointer, then recalculates the live snapped endpoint in the
     newly exposed model space. */
  var AP_BAND = 44, AP_MAX = 11, AP_RAMP = 550;
  var apRAF = 0, apPtr = null, apT0 = 0, apLast = 0;
  function apAxis(v, size) {
    var d = 0;
    if (v < AP_BAND) d = (v - AP_BAND) / AP_BAND;
    else if (v > size - AP_BAND) d = (v - (size - AP_BAND)) / AP_BAND;
    d = clamp(d, -1, 1);
    return Math.sign(d) * d * d * AP_MAX;
  }
  function apActive() {
    return E.docType === "part" && !E.drag && ((E.wallPts && E.wallPts.length) || (E.poly && E.poly.length));
  }
  function apStep(now) {
    apRAF = 0;
    if (!apPtr || !apActive() || !(E.cw > 0 && E.ch > 0)) return;
    var dx = apAxis(apPtr.x, E.cw), dy = apAxis(apPtr.y, E.ch);
    if (!dx && !dy) return;
    var ramp = 0.25 + 0.75 * clamp((now - apT0) / AP_RAMP, 0, 1);
    var dt = clamp((now - apLast) / 16.7, 0.5, 2);
    apLast = now;
    E.ox -= dx * ramp * dt;
    E.oy -= dy * ramp * dt;
    var uv = toUV(apPtr.x, apPtr.y), sp = snapPt(uv);
    if (E.wallPts && E.wallPts.length) {
      var origin = E.wallPts[E.wallPts.length - 1];
      E._mouse = E._osnap ? sp : constrainWallPoint(sp, origin, apPtr.shiftKey);
    } else {
      E._mouse = E._osnap ? sp : uv;
    }
    drawSketch();
    syncStatus();
    apRAF = requestAnimationFrame(apStep);
  }
  function autoPanFrom(e) {
    var rect = getCanvasRect();
    apPtr = { x: e.clientX - rect.left, y: e.clientY - rect.top, shiftKey: e.shiftKey };
    if (!apRAF && apActive() && (apAxis(apPtr.x, E.cw) || apAxis(apPtr.y, E.ch))) {
      apT0 = apLast = performance.now();
      apRAF = requestAnimationFrame(apStep);
    }
  }
  function stopAutoPan() {
    if (apRAF) cancelAnimationFrame(apRAF);
    apRAF = 0;
    apPtr = null;
  }
  cv.addEventListener("pointermove", autoPanFrom);
  cv.addEventListener("pointerleave", stopAutoPan);
  window.addEventListener("blur", stopAutoPan);
}

/* Place a rectangle, circle or polygon from its two defining points, whether
   they arrived by drag or by two clicks. */
function finishTwoPointTool(to) {
  var drag = E.drag;
  if (!drag) return;
  var from = { u: drag.u, v: drag.v };
  // a side count typed mid-drag is a setting, not a dimension: honour it even
  // when the shape itself is finished with the mouse
  var typedSides = dynTyped("sides");
  if (typedSides != null) E.polySides = Math.max(3, Math.min(24, Math.round(typedSides)));
  E.drag = null;
  E.dynInput = null;
  pushUndo(t("opSketch"));
  var made = drag.mode === "srect" ? addSketchRectangle(from, to, drag.snap)
    : drag.mode === "scirc" ? addSketchCircle(from, to, drag.snap)
    : addSketchPolygon(from, to, E.polySides, drag.snap);
  if (!made) { H.discard(); refreshAll(); return; }
  markDrawnSelection(made);
  E.sel = E.ssel[E.ssel.length - 1];
  refreshAll();
}

function makeDrawnPart(u0, v0, u1, v1) {
  var lo = E.baseOff, hi = E.baseOff + E.depth;
  var mat = { color: "#c9bfae", metal: 0.08, rough: 0.7 };
  var uu0 = Math.min(u0, u1), uu1 = Math.max(u0, u1), vv0 = Math.min(v0, v1), vv1 = Math.max(v0, v1);
  var frame=activeSketchFrame();
  if (E.tool === "rect") {
    if (frame) return Object.assign({id:uid(),kind:"ext",axis:"frame",frame:cloneData(frame),name:"box",pts:[{u:uu0,v:vv0},{u:uu1,v:vv0},{u:uu1,v:vv1},{u:uu0,v:vv1}],from:lo,to:hi,holes:[]},mat);
    if (E.view === "top") return Object.assign({ id: uid(), kind: "box", name: "box", x0: uu0, x1: uu1, z0: vv0, z1: vv1, y0: lo, y1: hi }, mat);
    if (E.view === "front") return Object.assign({ id: uid(), kind: "box", name: "box", x0: uu0, x1: uu1, y0: vv0, y1: vv1, z0: lo, z1: hi }, mat);
    return Object.assign({ id: uid(), kind: "box", name: "box", z0: uu0, z1: uu1, y0: vv0, y1: vv1, x0: lo, x1: hi }, mat);
  }
  var r = snapV(Math.hypot(u1 - u0, v1 - v0)) || E.grid;
  if (E.tool === "sph") {
    if (frame) {
      var center=framePoint(frame,u0,v0,lo+r);
      return Object.assign({id:uid(),kind:"sph",name:"sphere",x:center.x,y:center.y,z:center.z,r:r},mat);
    }
    if (E.view === "top") return Object.assign({ id: uid(), kind: "sph", name: "sphere", x: u0, z: v0, y: E.baseOff + r, r: r }, mat);
    if (E.view === "front") return Object.assign({ id: uid(), kind: "sph", name: "sphere", x: u0, y: v0, z: 0, r: r }, mat);
    return Object.assign({ id: uid(), kind: "sph", name: "sphere", z: u0, y: v0, x: 0, r: r }, mat);
  }
  // circle -> vertical cylinder (base at baseOff, height=depth); in front/side views centers on the other axis
  if (frame) {
    var pts=[];
    for (var i=0;i<48;i++) pts.push({u:u0+Math.cos(i*Math.PI/24)*r,v:v0+Math.sin(i*Math.PI/24)*r});
    return Object.assign({id:uid(),kind:"ext",axis:"frame",frame:cloneData(frame),name:"cylinder",pts:pts,from:lo,to:hi,holes:[]},mat);
  }
  if (E.view === "top") return Object.assign({ id: uid(), kind: "cyl", name: "cylinder", x: u0, z: v0, y: lo, r: r, h: E.depth }, mat);
  if (E.view === "front") return Object.assign({ id: uid(), kind: "cyl", name: "cylinder", x: u0, z: 0, y: v0, r: r, h: E.depth }, mat);
  return Object.assign({ id: uid(), kind: "cyl", name: "cylinder", z: u0, x: 0, y: v0, r: r, h: E.depth }, mat);
}

// Letter keys pick a sketch or direct tool. R is reserved for parametric
// Revolve (FEATURE_COMMAND / KEY_TOOL in modeler_commands.js).

/* Shift + a digit picks the selection filter. NOT the letters SolidWorks uses
   for this — v, b, e and x are all sketch tools here, and taking them would
   cost four tools to save four keystrokes. Keyed on e.code rather than e.key
   because Shift+2 arrives as "@" on a US layout and something else again
   elsewhere; the physical key is what the user is reaching for. */
var SELECTION_FILTER_KEYS = {
  Digit1: "all", Digit2: "face", Digit3: "edge", Digit4: "vertex", Digit5: "body",
};

/* Tap to switch, hold to borrow. A filter held down for longer than a tap
   snaps back on release, which is how a fillet set gets swept without leaving
   the session's own filter changed underneath the user. */
function handleSelectionFilterChord(e, editingField) {
  var wanted = SELECTION_FILTER_KEYS[e.code];
  if (!wanted || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || editingField) return false;
  e.preventDefault();
  if (e.repeat) return true;
  if (!E.filterChord) E.filterChord = { code: e.code, previous: E.selectionFilter, at: Date.now() };
  setSelectionFilter(wanted);
  return true;
}

function releaseSelectionFilterChord(e) {
  var chord = E.filterChord;
  if (!chord || e.code !== chord.code) return;
  E.filterChord = null;
  // Under a third of a second reads as a tap, and a tap is meant to stick.
  if (Date.now() - chord.at < 300) return;
  if (selectionFilterAvailable(chord.previous)) setSelectionFilter(chord.previous);
}

function onKey(e) {
  // Extension and legacy event producers can dispatch keydown without a key.
  // Such events identify no shortcut and must not reach tool or field handlers.
  if (!e || typeof e.key !== "string" || !e.key) return;
  if(E.cutPending){e.preventDefault();return;}
  if (!E.open || modelerDecisionOpen()) return;
  var commandSearch = root && root.querySelector("#mdCommandSearch");
  var focusedField = document.activeElement;
  var editingField = focusedField && (focusedField.tagName === "INPUT" || focusedField.tagName === "TEXTAREA" || focusedField.isContentEditable);
  // The start screen is modal-ish: only Escape (dismiss) gets through.
  if (E.welcomeOpen) {
    if (e.key === "Escape") { e.preventDefault(); closeWelcome(); }
    return;
  }
  if (handleSelectionFilterChord(e, editingField)) return;
  if (e.ctrlKey || e.metaKey) {
    var chord = e.key.toLowerCase();
    if (chord === "s") { e.preventDefault(); saveCurrentDocument(); return; }
    /* Edit ▸ Copy / Paste for sketches: a sketch chosen in the tree copies; a
       plane chosen in the tree (or a planar face in the model) takes the paste. */
    if (!editingField && chord === "c" && E.docType === "part" && treeSelectedSketch()) { e.preventDefault(); copySketchToClipboard(treeSelectedSketch()); return; }
    if (!editingField && chord === "v" && E.docType === "part" && readClipboardSketch() && pasteReferenceTarget()) { e.preventDefault(); pasteSketchOntoReference(pasteReferenceTarget()); return; }
    if (editingField && (chord === "z" || chord === "y" || chord === "a")) return;
    if (chord === "z" && e.shiftKey) { e.preventDefault(); doRedo(); return; }
    if (chord === "z") { e.preventDefault(); doUndo(); return; }
    if (chord === "y") { e.preventDefault(); doRedo(); return; }
    if (chord === "k") { e.preventDefault(); openCommandSearch(); return; }
    if (chord === "b") { e.preventDefault(); regenerateExactModel("force"); return; }
    // Normal To, on request only — SolidWorks' Ctrl+8, same job. This chord
    // used to sit after a `ctrlKey` early-return, so the shortcut never fired.
    if (e.key === "8" && !editingField) { e.preventDefault(); orientModelToView(true); drawSketch(); return; }
  }
  if (commandSearch && !commandSearch.hidden) {
    if (e.key === "Escape") { e.preventDefault(); closeCommandSearch(); return; }
    if (e.key === "Enter") {
      var first = root.querySelector("#mdCommandResults .md-command-result.selected") || root.querySelector("#mdCommandResults .md-command-result");
      if (first) { e.preventDefault(); first.click(); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      var rows = [].slice.call(root.querySelectorAll("#mdCommandResults .md-command-result"));
      if (!rows.length) return;
      var at = rows.findIndex(function (r) { return r.classList.contains("selected"); });
      rows.forEach(function (r) { r.classList.remove("selected"); });
      at = e.key === "ArrowDown" ? (at + 1) % rows.length : (at - 1 + rows.length) % rows.length;
      E.commandHighlight = at;
      rows[at].classList.add("selected"); rows[at].scrollIntoView({block:"nearest"});
      if (rows[at].id) {
        var searchInput = root.querySelector("#mdCommandSearchInput");
        if (searchInput) searchInput.setAttribute("aria-activedescendant", rows[at].id);
      }
      return;
    }
  }
  /* A drawing tool waiting on numbers owns the number keys. This has to come
     before the mode and view shortcuts below, or typing a 40 cm side length
     jumps the editor into 2D and drops the digit. */
  if (!editingField && !e.ctrlKey && !e.metaKey && !e.altKey && dynKey(e)) return;
  if (!editingField && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === "2") { setMode("2d"); return; }
    if (e.key === "3") { setMode("3d"); return; }
    if (e.key === "7") { setMode("drawing"); return; }
  }
  /* On a sheet the drafting table takes the keyboard: its own tool letters, fit,
     hidden lines, and Delete on whatever is selected. Only the editor-wide keys
     above (mode switches, undo, save) get there first. */
  if (E.mode === "drawing" && !editingField) {
    if (drawingSheet().keyDown(e)) { e.preventDefault(); syncTools(); syncHint(); syncStatus(); return; }
    if (e.key !== "Escape") return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !editingField) {
    e.preventDefault();
    if (E.docType === "assembly") {
      E.componentSel = (E.assembly && E.assembly.components || []).slice();
      E.sel = E.componentSel[E.componentSel.length - 1] || null;
    } else if (E.mode === "3d" && !E.modelPlaneActive) {
      selectAllTopology();
    } else {
      E.ssel = ensureSketch(E.def).entities.slice();
      E.sel = E.ssel[E.ssel.length - 1] || null;
    }
    refreshAll();
    return;
  }
  /* The profile offer is a real choice waiting on the model, so it owns Enter
     while it is up — the common case (Extrude) stays one keystroke, without
     the editor having picked it on the user's behalf. */
  if (e.key === "Enter" && E.profileOffer && E.profileOffer.length && !editingField) {
    e.preventDefault();
    var leading = E.profileOffer[0];
    dismissProfileOffer();
    setCommandTab("features");
    openParametricFeature(leading);
    return;
  }
  if (e.key === "Escape") {
    /* Before any of the branches that return: the chip and the profile offer
       are things floating over the model, and Escape is what a CAD user presses
       to dismiss an offer. Neither may survive whichever branch takes the key. */
    hidePickCycle();
    dismissProfileOffer();
    if (E.noteEditorOpen) { e.preventDefault(); closeNoteEditor(); return; }
    if (E.tool === "paint" || E.tool === "note") { setTool("select"); return; }
    if (E.overlays && (E.overlays.shortcut || E.overlays.views || E.overlays.menu || E.overlays.gesture)) {
      e.preventDefault(); closeChromeOverlays(); return;
    }
    if (reportOpen()) { e.preventDefault(); closeReport(); return; }
    if (E.facePick) { e.preventDefault(); cancelFacePick(false); return; }
    var referencePicker = root && root.querySelector("#mdReferencePicker");
    if (referencePicker && !referencePicker.hidden) { e.preventDefault(); cancelReferenceSelection(); return; }
    if (E.tour.active) { e.preventDefault(); closeTour(); return; }
    if (E.measure) { e.preventDefault(); closeEvalCard(); return; }
    if (dynHasEntry()) { E.dynInput = null; drawSketch(); return; }
    if (E.wallPts) { finishWallChain(true); return; }
    if (E.poly) { E.poly = null; drawSketch(); return; }
    if (E.arcPts) { E.arcPts = null; drawSketch(); return; }
    if (E.slotPts) { E.slotPts = null; drawSketch(); syncContextActions(); return; }
    if (E.ellPts) { E.ellPts = null; drawSketch(); syncContextActions(); return; }
    // a half-picked spline: Escape abandons its picks, as for every other multi-click tool
    if (E.splinePts && E.splinePts.length) { E.splinePts = null; drawSketch(); syncContextActions(); return; }
    if (E.drag && E.drag.sticky) { E.drag = null; drawSketch(); syncContextActions(); return; }
    if (E.dimPick.length || E.dimSel) {
      E.dimPick = []; E.dimSel = null; E.ssel = []; E.sel = null; drawSketch(); syncStatus(); return;
    }
    /* While a sketch is being edited, Escape never leaves its surface — as in
       SOLIDWORKS it drops the tool, then the selection. Leaving the surface on
       a second Escape kept the sketch open behind the 3D view, so the next
       click picked a model face and every drawing click attached yet another
       face sketch (11 of them), which is how the render stack overflowed.
       Finish plane editing / Finish sketch are the explicit ways out. */
    if (E.mode === "3d" && E.modelPlaneActive && E.authoring && E.authoring.phase === "sketch") {
      e.preventDefault();
      if (E.tool !== "select") { setTool("select", true); syncTools(); syncHint(); return; }
      if (E.sel || (E.ssel && E.ssel.length) || (E.topologySelection && E.topologySelection.length)) {
        E.sel = null; E.ssel = []; E.topologySelection = []; refreshAll();
      }
      return;
    }
    if (E.mode === "3d" && E.modelPlaneActive) { finishModelPlane(); return; }
    if (E.docType === "assembly" && E.componentSel.length) { E.componentSel = []; E.sel = null; refreshAll(); return; }
    if (E.sel || (E.ssel && E.ssel.length) || (E.topologySelection && E.topologySelection.length) || (E.authoring && E.authoring.featureSelection?.length)) {
      E.sel = null; E.ssel = []; E.topologySelection = [];
      if (E.authoring) E.authoring.featureSelection = [];
      refreshAll(); return;
    }
    // Esc cancels tools and clears selection. It does not close the document —
    // that is what the Close button is for, and it asks when work is unsaved.
    return;
  }
  if (e.key === "Enter" && E.wallPts) { finishWallChain(false); return; }
  if (e.key === "Enter" && E.poly) { finishPoly(); return; }
  // everything below is a bare key, so it must not fire while a field has focus
  var ae = document.activeElement;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
  if (e.key === "/") { e.preventDefault(); openCommandSearch(); return; }
  if (e.key === " " && !editingField) { e.preventDefault(); showViewSelector(); return; }
  if (!editingField && e.key.toLowerCase() === "s" && !dynHasEntry()) { e.preventDefault(); showShortcutBar(); return; }
  if (e.key === "Tab" && E.inferenceCandidates && E.inferenceCandidates.length > 1 && !editingField) {
    e.preventDefault();
    E.inferenceIndex = nextInferenceIndex(E.inferenceCandidates, E.inferenceIndex);
    drawSketch();
    return;
  }
  if (E.docType === "assembly") {
    if ((e.key === "Delete" || e.key === "Backspace") && E.componentSel.length) {
      e.preventDefault();
      var removed = E.componentSel.map(function (c) { return c.id; });
      pushUndo(t("del"));
      E.assembly.components = E.assembly.components.filter(function (c) { return removed.indexOf(c.id) === -1; });
      E.componentSel = []; E.sel = null; E.topologySelection = [];
      solveAssembly(); refreshAll();
    }
    return;
  }
  var k = e.key.toLowerCase();
  if(!e.shiftKey){
    var custom=Object.entries(E.commandShortcuts || {}).find(function(entry){return entry[1]===k;});
    if(custom && commandCatalog().some(function(command){return command.id===custom[0];})){e.preventDefault();runCommand(custom[0]);return;}
  }
  if (KEY_VIEW[e.key]) setView(KEY_VIEW[e.key]);
  else if (k === "r") runCommand("revolvefeature");
  else if (k === "s") showShortcutBar();
  else if (k === "p" && E.mode === "3d" && !E.modelPlaneActive) setTool("paint");
  else if (k === "n" && E.mode === "3d" && !E.modelPlaneActive) setTool("note");
  else if (KEY_TOOL[k]) setTool(KEY_TOOL[k]);
  else if (k === "f") E.mode === "3d" && !E.modelPlaneActive ? fitPreview() : fitSketch();
  else if ((e.key === "Delete" || e.key === "Backspace") && E.sel) {
    if (!isSketchObject(E.sel) && E.def.parts.indexOf(E.sel) < 0) return;
    e.preventDefault();
    if (!isSketchObject(E.sel) && isCanonicalAuthoring()) {
      var featureId = E.sel.featureId || cutTargetFeatureId(E.sel);
      if (featureId) {
        var entry = (E.def.history || []).find(function (item) { return item.kind === "feature" && item.targetId === featureId; });
        removeTreeNode({kind:"feature", targetId:featureId, historyId:entry?.id || "history:feature:" + featureId}, {mode:"canonical"});
        return;
      }
    }
    pushUndo(t("del"));
    if (isSketchObject(E.sel)) {
      var sketch = ensureSketch(E.def);
      selEntities().forEach(function (q) { removeSketchEntity(sketch, q.id); });
      // deleting a lone point only removes the rules that referenced it —
      // the point itself belongs to whichever entity still draws it
      selPoints().forEach(function (q) {
        sketch.entities.filter(function (entity) { return entity.type === "point" && entity.p === q.id; }).forEach(function (entity) { removeSketchEntity(sketch, entity.id); });
        sketch.constraints = sketch.constraints.filter(function (c) {
          return c.point !== q.id && c.a !== q.id && c.b !== q.id;
        });
      });
      E.ssel = [];
      resolveSketch(false);
    } else E.def.parts.splice(E.def.parts.indexOf(E.sel), 1);
    E.sel = null;
    refreshAll();
  }
}

export {
  cancel2DPointerMoveGlobal, dynCommit, dynDrawHud, dynHasEntry, onKey,
  pointToLineDistance, releaseSelectionFilterChord, wireSketch,
};

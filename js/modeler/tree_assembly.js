/* The CAD editor's feature filter, assembly tree, in-context parts, live
   downstream edits and dependency highlights, split out of js/modeler.js. It
   shares the editor's state through live imports from ../modeler.js. */
import { hasSingleToolboxKernelRecipe } from "../cad_assembly_toolbox.js";
import { explodedOccurrenceOffset } from "../cad_exploded_view.js";
import { holeCallout } from "../cad_hole_wizard.js";
import { planarMateFaceChoices } from "../cad_mate_reference_choices.js";
import { solveTopologyMates } from "../cad_mates.js";
import { createHelix } from "../cad_reference_geometry.js";
import { toolboxFastener } from "../cad_toolbox.js";
import { componentPatternPlan, removeComponentPattern, setComponentPattern } from "../core/assembly_component_pattern.js";
import { analyticPartTopology, contextDocumentTopology } from "../core/assembly_context.js";
import { ASSEMBLY_ORIGIN_ID, containsAssembly, flattenAssembly, isSubassembly, standardPlaneEntries, subassemblyComponent } from "../core/assembly_structure.js";
import { surfaceSectionsInCadWorker } from "../core/cad_worker_client.js";
import { detachDrivenSketchDimension } from "../core/cone_silhouette.js";
import { assemblyPartNumber, documentDescription, setDocumentProperty } from "../core/custom_properties.js";
import { mateDependencyId, occurrenceDependencyId } from "../core/dependency_visualization.js";
import { dimensionEditorPosition } from "../core/dimension_editor_position.js";
import { makeDimensionTolerance, toleranceFields } from "../core/dimension_tolerance.js";
import { nextDocumentNumericId } from "../core/document_ids.js";
import { transitionExtrudeProjection } from "../core/extrude_projection_transition.js";
import { extrusionPreviewDirection, synchronizeSketchExtrusionFrames } from "../core/extrusion_projection.js";
import { syncHoleCutPlacement } from "../core/hole_geometry.js";
import { editedHoleWizardSketch } from "../core/hole_wizard_sketch_edit.js";
import { isHoleWizardSketch, resolveHoleWizardInputs } from "../core/hole_wizard_sketches.js";
import { featureBuildsKernelBody, isKernelBody, kernelBodySpec } from "../core/kernel_body.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { trackLibraryOccurrence } from "../core/library_occurrence.js";
import { resolvedLibraryAssembly } from "../core/model_library_store.js";
import { nativeSolidSummary } from "../core/native_solid_summary.js";
import { assemblyWithoutNestedOccurrence, commitNestedComponentEdit, createNestedComponentEdit, nestedComponentOccurrence, nestedEditStillCurrent } from "../core/nested_component_edit.js";
import { circularPatternStepDegrees } from "../core/pattern_geometry.js";
import { compactAssemblyTopologySnapshots, compactDocumentTopologySnapshots } from "../core/project_topology_budget.js";
import { dimensionTargetFromSelection } from "../core/sketch_dimension_selection.js";
import { helixFromSketch } from "../core/sketch_helix.js";
import { restoreToolboxProjections } from "../core/toolbox_projection_restore.js";
import { boundsHitBox, boxSelectMode } from "../modeler_chrome.js";
import { evaluateFeatureNumber } from "../modeler_feature_form.js";
import { constraintAlreadyPresent, inferLineRelations, inferTangentCircle } from "../modeler_inference.js";
import { cloneData, mirrorProjectionPart, resetClonedPartIdentity } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { renderTreeModel } from "../modeler_tree.js";
import { leavingQuickForm, openQuickForm, toggleIsolate } from "../modeler/command_manager.js";
import { componentLabel, planeMateReference, refreshParts, syncDiagnosticJump } from "../modeler/component_mates.js";
import { setDocumentType } from "../modeler/document_save.js";
import { drawSketch, featureAreaAt, flash, invalidateDrawing, newSketchPoint, sampleSplinePoints, sheetForm, sketchUvPolylines, toggleFeatureArea } from "../modeler/drawing_sheet.js";
import { btn, el } from "../modeler/editor_dom.js";
import { regenerateExactModel } from "../modeler/export_measure.js";
import { cutTargetFeatureId, resolvedRevolve } from "../modeler/feature_create.js";
import { applyDependencyTreeClasses, closeTreeMenu, dependencySets, openTreeMenu, setDependencyHighlight, treeCollapseState, treeDeps, updateDependencyPresentation } from "../modeler/feature_tree.js";
import { patternMergePreviewBadge } from "../modeler/finish_preview.js";
import { buildComponentGroup, markLiveDirtyPart, partBelongsToFeature, updatePreview } from "../modeler/library_panel.js";
import { activeParts, componentDef, componentFreedom, countLabel, freedomLabel, mateIssueLabel, mateIssuesFor, newAssembly } from "../modeler/library_store.js";
import { clearPatternMerges, layPatternCopies, selectedPatternBody } from "../modeler/part_commands.js";
import { activateDrawingSketch, addedConstraintIds, clearDimensionRefusal, constraintCaption, dimensionEditorUnit, hideDimensionEditor, showDimensionRefusal, showSketchRefusal } from "../modeler/sketch_dimension_editor.js";
import { constraintMeasure, openConvertEntities, resolveIntersectionEdge, resolveSketch, selPoints, selectedModelEdges, selectedModelVertices, sketchForView, syncHint, syncSketchDrivenParts } from "../modeler/sketch_entities.js";
import { selectTourTrack, startTour } from "../modeler/sketch_guide.js";
import { captureSketchCameraPose, fitSketch, isCanonicalAuthoring, modelLengthText, modelLengthUnit, orientModelToView, referencePlaneView, setCommandTab, setTab, setTool, syncModelPlane } from "../modeler/sketch_workflow.js";
import { fitPreview } from "../modeler/view_modes.js";
import { stampComponentRef } from "../modeler/viewport_input.js";
import { addSmartDimension, currentMeasure } from "../sketch_dimensions.js";
import { dimensionUnit, nameAvailable } from "../sketch_equations.js";
import { mirrorEntities } from "../sketch_pattern.js";
import { ellipseData, ensureSketch, entityPoints, explainSketchConflict, pruneImpliedRelations, sketchById, sketchPoint, solveSketch } from "../sketch_solver.js";
import { projectLoop } from "../sketch_trim.js";
import { S, fin, uid } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, FINISH_AMOUNT_KEY, FINISH_FEATURES, H, PLANE_NAME_KEYS,
  applyAssemblyMates, assemblyComponentById, assemblyLibraryCache,
  currentHistoryNode, exactDisplayBody, invalidateInterference,
  invalidatePartMeshAfterEdit, modelLibraryCache, newDef, partUV,
  patternPlacements, pushUndo, queueExactMesh, refreshAll, refreshSelection,
  root, scheduleExactMesh, scheduleKernelBody, scheduleModelerDraft, setMode,
  solveAssembly, toPx, toUV,
} from "../modeler.js";

function positionDimensionEditor(clientX, clientY) {
  var editor = root && root.querySelector("#mdDimEditor"), mid = root && root.querySelector(".md-mid");
  if (!editor || !mid) return;
  if (fin(clientX) && fin(clientY)) editor._dimensionAnchor = {x:clientX,y:clientY};
  else if (editor._dimensionAnchor) { clientX = editor._dimensionAnchor.x; clientY = editor._dimensionAnchor.y; }
  var box = mid.getBoundingClientRect();
  editor.hidden = false;
  editor.style.maxHeight = "";
  var width = editor.offsetWidth || 278, height = editor.offsetHeight || 184;
  var obstacles = document.body.classList.contains("compact-nav")
    ? Array.from(document.querySelectorAll('#md-selection-bar, #md-nav, #md-ctx, #modeler .md-entity-nav, #modeler .md-feature-nav')).filter(function (el) { return !el.hidden; }).map(function (el) { return el.getBoundingClientRect(); }) : [];
  var position = dimensionEditorPosition(box, width, height, clientX, clientY, obstacles);
  editor.style.left = position.x + "px";
  editor.style.top = position.y + "px";
  editor.style.maxHeight = position.maxHeight + "px";
}

function showDimensionEditor(sketch, constraint, options) {
  if (!root || !sketch || !constraint) return false;
  options = options || {};
  hideDimensionEditor();
  E.dimEditor = {
    sketch:sketch, constraint:constraint, created:!!options.created,
    historyAlreadyOpen:!!options.historyAlreadyOpen,
    discardOnCancel:!!options.discardOnCancel,
    before:{ value:Number(constraint.value) || 0, driven:!!constraint.driven, name:constraint.name || "", tolerance:cloneData(constraint.tolerance || null) },
  };
  E.dimSel = constraint.id;
  var value = root.querySelector("#mdDimValue");
  var unit = dimensionEditorUnit(constraint);
  root.querySelector("#mdDimUnit").textContent = unit;
  var dispVal = Number(constraint.value) || 0;
  if (unit === "mm") dispVal *= 10;
  else if (unit === "in") dispVal /= 2.54;
  else if (unit === "m") dispVal /= 100;
  else if (unit === "ft") dispVal /= 30.48;
  /* Twelve significant digits hide solver noise (22.29999999999997) without
     rounding a real value; accepting the shown text keeps the stored float. */
  value.value = String(Number(dispVal.toPrecision(12)));
  E.dimEditor.before.text = value.value;
  root.querySelector("#mdDimMode").value = constraint.driven ? "reference" : "driving";
  root.querySelector("#mdDimName").value = constraint.name || "";
  var tolFields = toleranceFields(constraint.tolerance,unit === "°" ? "deg" : unit);
  root.querySelector("#mdDimTolerance").value = constraint.tolerance ? "deviation" : "none";
  root.querySelector("#mdDimTolUpper").value = tolFields.upper;
  root.querySelector("#mdDimTolLower").value = tolFields.lower;
  positionDimensionEditor(options.clientX, options.clientY);
  requestAnimationFrame(function () { value.focus({ preventScroll:true }); value.select(); });
  return true;
}

function applyDimensionEditor() {
  var state = E.dimEditor;
  if (!state) return false;
  /* Typed like a feature field: 4.375in, 111.13mm, 2*3.1 — a bare number is
     the editor unit. parseFloat read "111.13mm" as 111.13 cm. */
  var raw = String(root.querySelector("#mdDimValue").value).trim(), value;
  var refusalBox = root.querySelector("#mdDimError");
  if (refusalBox && refusalBox.hidden === false) clearDimensionRefusal();
  if (raw === state.before.text) value = state.before.value;
  else {
    try {
      value = evaluateFeatureNumber(raw, { key:"dimension", unit:dimensionUnit(state.constraint) });
      if (dimensionUnit(state.constraint) !== "angle" && !/(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|in|ft|m)\b/i.test(raw)) {
        var u = dimensionEditorUnit(state.constraint);
        if (u === "mm") value /= 10;
        else if (u === "in") value *= 2.54;
        else if (u === "m") value *= 100;
        else if (u === "ft") value *= 30.48;
      }
    }
    catch (error) { value = NaN; }
  }
  /* Directed sketch angles may be negative (or zero for parallel lines).
     Length dimensions still require a positive value. */
  if (!fin(value) || (dimensionUnit(state.constraint) !== "angle" && value <= 0)) {
    root.querySelector("#mdDimValue").focus({ preventScroll:true });
    return false;
  }
  var constraint = state.constraint;
  var driven = root.querySelector("#mdDimMode").value === "reference";
  var name = root.querySelector("#mdDimName").value.trim();
  if (name && !nameAvailable(E.def, name, constraint)) { flash(t("badName")); return false; }
  var tolerance = null;
  try {
    if (!driven && root.querySelector("#mdDimTolerance").value === "deviation") tolerance = makeDimensionTolerance(root.querySelector("#mdDimTolUpper").value,root.querySelector("#mdDimTolLower").value,dimensionEditorUnit(constraint)==="°"?"deg":dimensionEditorUnit(constraint));
  } catch (error) { flash(error.message); return false; }
  var changed = value !== state.before.value || driven !== state.before.driven || name !== state.before.name || JSON.stringify(tolerance)!==JSON.stringify(state.before.tolerance);

  if (changed && !state.historyAlreadyOpen) pushUndo(t("opDim"));
  constraint.driven = driven;
  if(tolerance)constraint.tolerance=tolerance;else delete constraint.tolerance;
  constraint.value = driven ? constraintMeasure(state.sketch, constraint) : value;
  if (name) constraint.name = name; else delete constraint.name;
  activateDrawingSketch(state.sketch);
  if (!resolveSketch(true)) {
    // explained against the geometry the rollback just restored, with the new
    // value still in force and always named
    var why = explainSketchConflict(state.sketch, { keep: [constraint.id] });
    constraint.value = state.before.value;
    if(state.before.tolerance)constraint.tolerance=state.before.tolerance;else delete constraint.tolerance;
    constraint.driven = state.before.driven;
    if (state.before.name) constraint.name = state.before.name; else delete constraint.name;
    resolveSketch(false);
    if (changed && !state.historyAlreadyOpen) H.discard();
    showDimensionRefusal(state, raw, why);
    return false;
  }
  if (typeof detachDrivenSketchDimension !== "undefined") detachDrivenSketchDimension(state.sketch,constraint);
  hideDimensionEditor();
  refreshAll();
  return true;
}

function deleteDimensionEditor() {
  var state = E.dimEditor;
  if (!state) return;
  if (!state.historyAlreadyOpen) pushUndo(t("dimDelete"));
  state.sketch.constraints = (state.sketch.constraints || []).filter(function (candidate) { return candidate !== state.constraint; });
  resolveSketch(false);
  if (state.created) H.discard();
  E.dimSel = null;
  hideDimensionEditor();
  refreshAll();
}

function editPlacedDimension(sketch, constraint, historyAlreadyOpen, clientX, clientY, discardOnCancel, created) {
  return showDimensionEditor(sketch, constraint, {
    historyAlreadyOpen:historyAlreadyOpen, clientX:clientX, clientY:clientY,
    discardOnCancel:discardOnCancel, created:!!created,
  });
}

function finishDimensionDrag(clientX, clientY) {
  var drag = E.drag;
  if (!drag || drag.mode !== "dimension") return false;
  E.drag = null;
  if (!drag.editOnRelease && !drag.moved) H.discard();
  if (drag.instant2d && drag.moved && resolveSketch(true)) detachDrivenSketchDimension(drag.sketch,drag.constraint);
  if (drag.editOnRelease) {
    /* A dimension this pick just made is removed again by Cancel; the editor
       only knew that when told, so Cancel used to keep it. */
    editPlacedDimension(drag.sketch, drag.constraint, true, clientX, clientY, !drag.created && !drag.moved, drag.created);
  }
  refreshAll();
  return true;
}

function sketchEntityScreenBounds(entity, sketch) {
  // Curves are bounded by their rendered path, never their centre or handles.
  var points;
  if (entity.type === "spline") {
    points = sampleSplinePoints(entity, new Map((sketch.points || []).map(function (p) { return [p.id, p]; })), 64);
  } else if (entity.projectedCurve || ["circle", "ellipse", "arc"].includes(entity.type)) {
    points = sketchUvPolylines({ points: sketch.points, entities: [entity] }).flat().map(function (p) { return { x: p.u, y: p.v }; });
  } else points = entityPoints(sketch, entity);
  var pts = points.map(function (p) { return toPx(p.x, p.y); });
  if (!pts.length) return null;
  var x0 = pts[0].x, y0 = pts[0].y, x1 = x0, y1 = y0;
  pts.forEach(function (p) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  });
  return { x0: x0, y0: y0, x1: x1, y1: y1 };
}

function finishBoxSelect(box) {
  var sketch = ensureSketch(E.def);
  var mode = boxSelectMode(box.x0, box.x1);
  var area = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
  /* A click that never became a drag, inside one of the hatched areas, means
     "not this one" — or "this one after all". The box drag starts on any empty
     click, so this is where a stationary one is still recoverable as a region
     pick rather than as a zero-sized marquee. */
  if (Math.hypot(box.x1 - box.x0, box.y1 - box.y0) < 4) {
    var at = toUV(box.x0, box.y0);
    if (toggleFeatureArea(featureAreaAt(at.u, at.v))) return;
    return;
  }
  E.sselAuto = false;
  E.ssel = (sketch.entities || []).filter(function (entity) {
    return boundsHitBox(sketchEntityScreenBounds(entity, sketch), area, mode);
  });
  E.sel = E.ssel[E.ssel.length - 1] || null;
}

function matchingSmartDimension(sketch, target) {
  return (sketch.constraints || []).find(function (constraint) {
    if (constraint.suppressed) return false;
    if (target.type === "line") return constraint.type === "distance" && constraint.entity === target.id;
    if (target.type === "circle") return (constraint.type === "diameter" || constraint.type === "radius") && constraint.entity === target.id;
    if (target.type === "arc") return constraint.type === "radius" && constraint.entity === target.id;
    if (target.type === "ellipse") return constraint.type === "radius" && constraint.entity === target.id && (constraint.axis || "major") === (target.axis || "major");
    if (target.type === "pointLine") return constraint.type === "pointLineDistance" && constraint.point === target.point && constraint.a === target.line;
    if (target.type === "lines") return constraint.type === "offset"
      && (constraint.a === target.a && constraint.b === target.b || constraint.a === target.b && constraint.b === target.a);
    if (target.type === "points") return constraint.type === "distance" && !constraint.entity
      && (constraint.a === target.a && constraint.b === target.b || constraint.a === target.b && constraint.b === target.a);
    if (target.type === "angle") return constraint.type === "angle"
      && (constraint.a === target.a && constraint.b === target.b || constraint.a === target.b && constraint.b === target.a);
    return false;
  }) || null;
}

function smartDimension(target, clientX, clientY) {
  var sketch = ensureSketch(E.def), existing = matchingSmartDimension(sketch, target);
  var measured = currentMeasure(sketch, target);
  pushUndo(existing ? t("opMoveDim") : t("opDim"));
  var constraint = existing;
  if (!constraint) {
    var id = addSmartDimension(sketch, target, measured);
    constraint = (sketch.constraints || []).find(function (candidate) { return candidate.id === id; });
  }
  if (!constraint || !resolveSketch(true)) {
    var dimWhy = constraint ? explainSketchConflict(sketch, { keep: [constraint.id] }) : { kind: null, ids: [] };
    var dimSubject = constraint ? constraintCaption(constraint, sketch) : t("opDim");
    if (constraint && !existing) sketch.constraints = sketch.constraints.filter(function (c) { return c !== constraint; });
    resolveSketch(false);
    H.discard();
    showSketchRefusal(sketch, dimSubject, constraint ? [constraint.id] : [], dimWhy);
    refreshAll();
    return false;
  }
  E.dimSel = constraint.id;
  E.drag = {
    mode:"dimension", sketch:sketch, constraint:constraint, editOnRelease:true,
    created:!existing, moved:false, px:clientX, py:clientY,
  };
  drawSketch();
  return true;
}

function openSelectedSmartDimension() {
  var sketch=ensureSketch(E.def),target=dimensionTargetFromSelection(sketch,E.ssel);
  if(!target)return false;
  var started=smartDimension(target);
  E.ssel=[];E.sel=null;
  if(started)finishDimensionDrag();
  return true;
}

// What the smart-dimension tool measures for a given pick, given what was
// already selected: two picked points measure the gap between them.
function dimensionTarget(hit, uv) {
  if (!hit) return null;
  if (hit.type === "line" || hit.type === "circle" || hit.type === "arc") return { type: hit.type, id: hit.id };
  // An ellipse has two numbers, so the pick decides which one: clicking nearer
  // the flat of the curve dimensions the minor axis, nearer the ends the major.
  if (hit.type === "ellipse") {
    var el = ellipseData(hit, new Map((ensureSketch(E.def).points || []).map(function (p) { return [p.id, p]; })));
    var axis = "major";
    if (el && uv) {
      var du = uv.u - el.center.x, dv = uv.v - el.center.y;
      var along = Math.abs(du * Math.cos(el.rot) + dv * Math.sin(el.rot));
      var across = Math.abs(-du * Math.sin(el.rot) + dv * Math.cos(el.rot));
      if (across * el.rx > along * el.ry) axis = "minor";
    }
    return { type: "ellipse", id: hit.id, axis: axis };
  }
  var pts = selPoints();
  if (pts.length === 1 && pts[0] !== hit) return { type: "points", a: pts[0].id, b: hit.id };
  return null;
}

/* Silhouette of every solid part in this view, dropped into the sketch as
   construction geometry. With model edges picked in a sketch, Project works on
   those edges alone. Converted edges default to usable sketch geometry. */
function projectPartEdges() {
  if (E.authoring?.phase === "sketch" && (selectedModelEdges().length || selectedModelVertices().length)) {
    openConvertEntities();
    return;
  }
  var loops = [],segments=[];
  (E.def.parts || []).forEach(function (p) {
    var f = partUV(p);
    if (f.type === "rect") {
      loops.push([{ u: f.u0, v: f.v0 }, { u: f.u1, v: f.v0 }, { u: f.u1, v: f.v1 }, { u: f.u0, v: f.v1 }]);
    } else if (f.type === "circle") {
      var loop = [];
      for (var k = 0; k < 24; k++) loop.push({ u: f.u + Math.cos((k * Math.PI) / 12) * f.r, v: f.v + Math.sin((k * Math.PI) / 12) * f.r });
      loops.push(loop);
    } else if(f.type==="segments")segments.push.apply(segments,f.segments);
    else if (f.pts && f.pts.length > 2) loops.push(f.pts.map(function (q) { return { u: q.u, v: q.v }; }));
  });
  if (!loops.length && !segments.length) { flash(t("needParts")); return; }
  pushUndo(t("projectEdges"));
  var sketch = sketchForView();
  loops.forEach(function (lp) { projectLoop(sketch, lp, true); });
  segments.forEach(function(segment){projectLoop(sketch,[segment.a,segment.b],true,false);});
  resolveSketch(false);
  flash(t("projected"));
  refreshAll();
}

function setLineConstraint(line, type, value) {
  if (!line || line.type !== "line") return;
  var sketch = ensureSketch(E.def);
  var constraint = sketch.constraints.find(function (c) { return c.entity === line.id && c.type === type; });
  if (!constraint) {
    constraint = { id: uid(), entity: line.id, type: type, value: value };
    sketch.constraints.push(constraint);
  } else constraint.value = value;
  resolveSketch(false);
}

/* Set (or retarget) a driving dimension on any sketch entity. One constraint of
   a given type per entity — typing a new radius edits the radius you already
   have instead of stacking a second one the solver has to fight. */
function setEntityDimension(entity, type, value, axis) {
  if (!entity || !entity.id) return;
  var sketch = ensureSketch(E.def);
  var radial=type === "radius" || type === "diameter";
  var ellipseAxis = entity.type === "ellipse" && radial ? (axis || "major") : null;
  var c = sketch.constraints.find(function (q) { return !q.driven && q.entity === entity.id && (!ellipseAxis || (q.axis || "major") === ellipseAxis) && (q.type === type || radial && (q.type === "radius" || q.type === "diameter")); });
  if(c && radial && c.type!==type)value=c.type==="diameter"?value*2:value/2;
  if (!c) { c = { id: uid(), entity: entity.id, type: type, value: value, ...(ellipseAxis ? {axis:ellipseAxis} : {}) }; sketch.constraints.push(c); }
  else c.value = value;
  if(resolveSketch(false))detachDrivenSketchDimension(sketch,c);
}

function makeWallSegment(a, b, options) {
  // Despite the legacy function name, this creates only parametric sketch
  // geometry. It has no depth, material or BREP body until an explicit feature
  // (Extrude/Revolve/etc.) consumes a closed profile.
  if (!a || !b || Math.hypot(b.u - a.u, b.v - a.v) < 1e-6) return null;
  var sketch = sketchForView();
  var existingPointIds = new Set(sketch.points.map(function (p) { return p.id; }));
  var aid = newSketchPoint(sketch, a), bid = newSketchPoint(sketch, b);
  var line = {
    id: uid(), type: "line", name: options?.construction ? "Centreline" : "Line", a: aid, b: bid,
    construction: !!options?.construction, weight: Math.max(1, E.wallWidth / 5),
  };
  sketch.entities.push(line);
  var snap = options?.typed ? null : E._osnap;
  if (options?.typed && Math.hypot(a.u, a.v) < 1e-8 && !sketch.constraints.some(function(c){return c.type === "fixed" && c.point === aid;})) sketch.constraints.push({id:uid(),type:"fixed",point:aid,x:0,y:0});
  var circles = (sketch.entities || []).filter(function (e) { return e.type === "circle" || e.type === "arc"; }).map(function (e) {
    var c = sketchPoint(sketch, e.c); if (!c) return null;
    var r = e.type === "circle" ? Number(e.r) : Math.hypot((sketchPoint(sketch, e.a) || c).x - c.x, (sketchPoint(sketch, e.a) || c).y - c.y);
    var startPoint=sketchPoint(sketch,e.a),endPoint=sketchPoint(sketch,e.b);
    return { id: e.id, type:e.type, r: r, center: { u: c.x, v: c.y },startAngle:startPoint?Math.atan2(startPoint.y-c.y,startPoint.x-c.x):undefined,endAngle:endPoint?Math.atan2(endPoint.y-c.y,endPoint.x-c.x):undefined };
  }).filter(Boolean);
  var tangent = inferTangentCircle({ a: a, b: b }, circles,{scale:E.scl,pixelTolerance:4}), inferred = [];
  inferLineRelations(line, a, { u: b.u, v: b.v }, snap, {
    // Closing an already determined chain needs no extra orientation relation.
    suppress: E._suppressInference || (existingPointIds.has(aid) && existingPointIds.has(bid) && solveSketch(sketch).status === "fully-constrained"), tangentCircleId: tangent && tangent.id,
  }).forEach(function (constraint) {
    if (constraintAlreadyPresent(sketch, constraint)) return;
    constraint.id = uid();
    sketch.constraints.push(constraint);
    inferred.push(constraint.id);
  });
  // only what the sketch does not already say (G27): a line drawn between two
  // vertical centerlines is vertical already, and a second Vertical is a repeat
  pruneImpliedRelations(sketch, inferred);
  if(E.dynamicMirror && E.dynamicMirror.sketchId===sketch.id && sketch.entities.some(function(e){return e.id===E.dynamicMirror.axisId;})){var unmirrored=sketch.constraints.slice();mirrorEntities(sketch,[line.id],E.dynamicMirror.axisId);pruneImpliedRelations(sketch,addedConstraintIds(sketch,unmirrored));}
  resolveSketch(false);
  E.sel = line;
  return line;
}

function finishWallChain(cancel) {
  if (cancel && E.wallPts && E.wallPts.length === 1) E.wallPts = null;
  else E.wallPts = null;
  E.dynInput = null;
  E._osnap = null;
  drawSketch();
  syncHint();
}

function emptyState(host, icon, title, note) {
  var node = el("div", "md-empty",
    '<i class="ph ' + icon + '"></i><b>' + title + "</b>" + (note ? "<span>" + note + "</span>" : ""));
  host.appendChild(node);
  return node;
}

/* The FeatureManager stays useful on real parts by filtering in place instead
   of rebuilding the model or losing the current selection. */
function addFeatureFilter(host) {
  var wrap = el("label", "md-feature-filter");
  wrap.appendChild(el("i", "ph ph-funnel-simple"));
  var input = el("input");
  input.type = "search";
  input.placeholder = t("featureFilter");
  input.setAttribute("aria-label", t("featureFilter"));
  input.value = E.treeQuery || "";
  input.addEventListener("input", function () { E.treeQuery = input.value; applyFeatureFilter(host); });
  wrap.appendChild(input);
  if (E.treeQuery) {
    var clear = btn('<i class="ph ph-x"></i>', function () { E.treeQuery = ""; input.value = ""; applyFeatureFilter(host); }, "md-feature-filter-clear");
    clear.setAttribute("aria-label", t("cancelCommand"));
    wrap.appendChild(clear);
  }
  host.appendChild(wrap);
}

function applyFeatureFilter(host) {
  var query = String(E.treeQuery || "").trim().toLowerCase();
  host.querySelectorAll(".md-part").forEach(function (row) {
    if (row.classList.contains("md-core-diagnostic")) return;
    row.hidden = !!query && row.textContent.toLowerCase().indexOf(query) < 0;
  });
}

async function openComponentPatternForm(mode) {
  if(E.docType!=="assembly" || !E.assembly)return;
  var assembly=E.assembly,history=currentHistoryNode(),existing=null;
  if(mode!=="create"){
    var patterns=assembly.componentPatterns || [];
    if(!patterns.length){flash("No Component Patterns");return;}
    var choose=await sheetForm("Choose Component Pattern",[{key:"pattern",label:"Pattern",type:"select",choices:patterns.map(function(p){return {value:String(p.id),label:p.name || "Pattern "+p.id};}),value:String(patterns[0].id)}],"Generated occurrences follow their seed and source hole pattern.");
    if(!choose || E.assembly!==assembly || currentHistoryNode()!==history)return;
    existing=patterns.find(function(p){return String(p.id)===choose.pattern;});
    if(!existing)return;
    if(mode==="remove"){
      pushUndo("Remove Component Pattern");removeComponentPattern(E.assembly,existing.id);
      E.componentSel=[];E.sel=null;invalidateInterference();refreshAll();return;
    }
  }
  var components=assembly.components.filter(function(c){return !c.componentPattern && !c.asm && !c.suppressed;});
  var sources=[];
  components.forEach(function(c){(c.def && c.def.features || []).forEach(function(f){
    if(f.type!=="pattern" || f.suppressed)return;
    try{componentPatternPlan(assembly,{id:"preview",seedId:(components.find(function(seed){return seed!==c;}) || {}).id,carrierId:c.id,featureId:f.id});sources.push({carrier:c,feature:f});}catch(error){}
  });});
  if(!sources.length){flash("Insert a carrier with an active feature-scope Linear Pattern of holes or extruded cuts first");return;}
  var selected=E.componentSel && E.componentSel[0],seed=existing && existing.seedId || selected && !selected.componentPattern && selected.id || components[0].id;
  var sourceIndex=existing?sources.findIndex(function(item){return String(item.carrier.id)===String(existing.carrierId) && String(item.feature.id)===String(existing.featureId);}):0;
  var answer=await sheetForm(mode==="create"?"Component Pattern":"Edit Component Pattern",[
    {key:"name",label:"Pattern name",value:existing && existing.name || "Hole-driven component pattern"},
    {key:"seed",label:"Mated seed component",type:"select",choices:components.map(function(c){return {value:String(c.id),label:c.name || String(c.id)};}),value:String(seed)},
    {key:"source",label:"Carrier / source Linear Pattern",type:"select",choices:sources.map(function(item,index){return {value:String(index),label:(item.carrier.name || item.carrier.id)+" / "+(item.feature.name || item.feature.id)};}),value:String(Math.max(0,sourceIndex))}
  ],"Mate the seed to the first hole. Copies follow source count, spacing and carrier orientation. Edit source pattern or seed configuration to drive them; independent copy mates are unsupported.");
  if(!answer || E.assembly!==assembly || currentHistoryNode()!==history)return;
  var source=sources[Number(answer.source)];if(!source)return;
  var pattern={id:existing?existing.id:uid(),name:answer.name,seedId:answer.seed,carrierId:source.carrier.id,featureId:source.feature.id};
  try{componentPatternPlan(assembly,pattern);}catch(error){flash(error.message);return;}
  pushUndo(mode==="create"?"Component Pattern":"Edit Component Pattern");
  var issues=setComponentPattern(E.assembly,pattern);
  if(issues.length)flash(issues[0].message);
  E.componentSel=[];E.sel=null;invalidateInterference();refreshAll();fitPreview();
}

function insertAssemblyComponent(modelKey) {
  if (!E.assembly) E.assembly = newAssembly();
  // Saved assemblies can contain numeric IDs newer than the scene allocator.
  // Reserve the whole tree before assigning a new occurrence ID; otherwise a
  // duplicate top-level ID redirects existing mates to the inserted assembly.
  S.idc = nextDocumentNumericId(E.assembly, S.idc);
  var i = E.assembly.components.length, component;
  /* A saved assembly goes in as ONE component that carries its own document
     (book p.387–402: LENSANDBULB into CAPANDLENS into FLASHLIGHT). Its mates are
     settled once here; the parent then moves it as a rigid body. */
  if (String(modelKey).indexOf("asm:") === 0) {
    var stored = assemblyLibraryCache.find(function (a) { return a.key === modelKey.slice(4); });
    var record = stored && resolvedLibraryAssembly(stored);
    if (!record) return;
    if (containsAssembly(record, E.assembly.key)) { flash(t("subassemblyContainsThis")); return; }
    pushUndo(t("addComponent"));
    component = subassemblyComponent(compactAssemblyTopologySnapshots(record), { id: uid(), grounded: i === 0, transform: { x: i * 25, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } });
    solveTopologyMates(component.asm);
    trackLibraryOccurrence(component,record);
  } else {
    var def = modelLibraryCache.find(function (m) { return m.key === modelKey; });
    if (!def) return;
    pushUndo(t("addComponent"));
    component = {
      id: uid(), modelKey: def.key, name: def.name || def.key,
      def: cloneData(compactDocumentTopologySnapshots(def)), visible: true, grounded: i === 0,
      transform: { x: i * 25, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
    };
    trackLibraryOccurrence(component,def);
  }
  E.assembly.components.push(component);
  invalidateInterference();
  E.componentSel = [component];
  E.sel = component;
  refreshAll();
  fitPreview();
}

/* The assembly used to draw its own flat list of rows while every part
   document got the FeatureManager — so components had no nesting, no keyboard
   navigation, no rename, no context menu and no way to reach a mate. The tree
   renderer is document-shape agnostic: hand it the same node shape and all of
   that arrives at once. Mates get their own section, the way SolidWorks files
   them, rather than being duplicated under both components they hold. */
function assemblyCollapsed(id, fallback) {
  var state = treeCollapseState();
  return Object.prototype.hasOwnProperty.call(state, id) ? !!state[id] : !!fallback;
}

function assemblyTreeNode(fields) {
  return {
    id: fields.id, kind: fields.kind, targetId: fields.targetId || null, dependencyId:fields.dependencyId || null, historyId: null, componentPath:fields.componentPath || null,
    index: Number.isInteger(fields.index) ? fields.index : null,
    name: fields.name || "", detail: fields.detail || "", icon: fields.icon || "",
    state: "", suppressed: !!fields.suppressed, rolled: false, error: fields.error || null,
    selected: !!fields.selected, collapsed: !!fields.collapsed, shared: false,
    can: Object.assign({
      rename: false, suppress: false, rollback: false, remove: false,
      reorder: false, edit: false, select: false,
    }, fields.can || {}),
    children: fields.children || [],
    swatch: fields.swatch || null,
  };
}

function topologyMateLabel(type,mate) {
  if(type==='coincident' && (mate?.a?.descriptor?.surface==='axis' || mate?.b?.descriptor?.surface==='axis'))return 'Coincident plane and axis';
  var key = {
    lock:"lockMate",
    coincident: "coincidentMate", concentric: "concentricMate",
    screw: "screwMate", tangent: "tangentMate", limit: "limitMate",
    angle: "angleMate", distance: "topologyDistanceMate",
    symmetric: "symmetricMate", gear: "gearMate", belt: "beltMate", rackpinion:"rackPinionMate",rotationlimit:"rotationLimitMate",
  }[type];
  return key ? t(key) : t("mate");
}

/* The three standard planes of a component or of the assembly, as tree rows a
   mate can be built from. */
function planeTreeRows(holderId, parentId) {
  return standardPlaneEntries().map(function (entry) {
    var selected = (E.topologySelection || []).some(function (reference) { return reference.componentId === holderId && reference.persistentId === entry.persistentId; });
    return assemblyTreeNode({
      id: parentId + "|plane|" + holderId + "|" + entry.persistentId, kind: "plane", targetId: holderId,
      name: t(PLANE_NAME_KEYS[entry.persistentId]), icon: "ph-square", selected: selected, can: { select: true },
    });
  });
}

function subassemblyTreeRows(top, components, parentId, path) {
  path=path || [top.id];
  return components.map(function (child) {
    var childPath=path.concat(child.id);
    var nested = isSubassembly(child) ? subassemblyTreeRows(top, child.asm.components, parentId + "/" + child.id,childPath) : [];
    return assemblyTreeNode({
      id: parentId + "/" + child.id, kind: "subcomponent", targetId: top.id,componentPath:childPath,dependencyId:occurrenceDependencyId(childPath),
      name: child.name || child.modelKey || t("component"),
      icon: isSubassembly(child) ? "ph-stack" : "components",
      error: child.contextIssue ? childPath.join(" / ")+" · "+child.contextIssue : null,
      detail: child.contextIssue || "",
      suppressed: child.visible === false, collapsed: assemblyCollapsed(parentId + "/" + child.id, true),
      can: { select: true,edit:!!child.def&&!isSubassembly(child) }, children: nested,
    });
  });
}

function assemblyTreeModel() {
  var components = (E.assembly && E.assembly.components) || [];
  var legacy = Array.isArray(E.assembly && E.assembly.mates) ? E.assembly.mates : [];
  var topology = Array.isArray(E.assembly && E.assembly.topologyMates) ? E.assembly.topologyMates : [];

  /* Two components off the same library model arrive with the same name, and
     the row label is all the user has to tell them apart in the tree. Number
     the ones that repeat — only those, so a component that has been renamed
     keeps exactly the name it was given. */
  var componentLabelOf = function (component) { return component.name || component.modelKey || component.assemblyKey || t("component"); };
  var labelCounts = new Map(), labelSeen = new Map();
  components.forEach(function (component) {
    var label = componentLabelOf(component);
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
  });

  var componentRows = components.map(function (component, index) {
    var def = componentDef(component), sub = isSubassembly(component);
    var bodyParts = def ? activeParts(def) : [];
    var singleToolboxBody = hasSingleToolboxKernelRecipe(def,bodyParts);
    var solidSummary=nativeSolidSummary(bodyParts,{singleRecipe:singleToolboxBody});
    var solids = solidSummary.count;
    var label = componentLabelOf(component);
    if (labelCounts.get(label) > 1) {
      labelSeen.set(label, (labelSeen.get(label) || 0) + 1);
      label += " " + labelSeen.get(label);
    }
    /* The component's own solids, so the tree answers "what is inside this"
       without leaving the assembly. They select the component — an assembly
       does not edit a component's geometry in place. */
    var treeBodyParts = singleToolboxBody ? [bodyParts.find(function (part) { return !part.previewOnly; }) || bodyParts[0]] : bodyParts;
    var children = treeBodyParts.map(function (part) {
      return assemblyTreeNode({
        id: "compbody:" + component.id + ":" + part.id, kind: "body",
        targetId: component.id, name: singleToolboxBody ? (def.features.find(function (feature) { return !feature.suppressed; }).name || t("part")) : (part.name || part.kind || t("part")),
        icon: "components", can: { select: true },
      });
    });
    /* A sub-assembly lists what it contains; its components are part of one
       rigid body here, so a row selects the sub-assembly itself. */
    if (isSubassembly(component)) children = subassemblyTreeRows(component, component.asm.components, "sub:" + component.id);
    children = planeTreeRows(component.id, "comp:" + component.id).concat(children);
    return assemblyTreeNode({
      id: "comp:" + component.id, kind: "component", targetId: component.id, dependencyId:occurrenceDependencyId([component.id]), index: index,
      name: label,
      detail: [component.grounded ? t("treeGrounded") : "",
        component.inContext ? "→ In context"+(component.contextIssue?" · "+component.contextIssue:"") : "",
        sub ? tf("subassemblyParts", { n: component.asm.components.length }) : "",
        solidSummary.known ? countLabel(solids, "treeComponentPartOne", "treeComponentParts") : solidSummary.projections+" body projection"+(solidSummary.projections===1?"":"s")+" · solid count not yet measured",
        solidSummary.disconnected ? "Disconnected solids" : "",
        /* What its mates have left free. Only for components a mate actually
           moves: an ungrounded component nothing is mated to is not "six
           degrees free", it is simply not being solved for. */
        freedomLabel(componentFreedom(component.id))]
        .filter(Boolean).join(" · "),
      icon: sub ? "ph-stack" : component.grounded ? "stdscrew" : "components",
      // the eye on a component row hides it, the way it does on a body row
      suppressed: component.visible === false,
      selected: E.componentSel.indexOf(component) !== -1,
      collapsed: assemblyCollapsed("comp:" + component.id, true),
      error: component.contextIssue || (sub ? (E.mateIssues || []).filter(issue =>
        issue.code==="context-reference" && issue.componentPath?.[0]===component.id)
        .map(issue=>issue.componentPath.join(" / ")+" · "+issue.message).join("\n") : null) ||
        (def || sub ? null : t("mateIssueMissingComponent")),
      can: { select: true, rename: true, remove: true, suppress: true },
      children: children,
    });
  });

  var mateRows = legacy.map(function (mate, index) {
    return assemblyTreeNode({
      id: "mate:" + mate.id, kind: "mate", targetId: mate.a, dependencyId:mateDependencyId([],'legacy',mate.id), index: index,
      name: t(mate.type === "alignX" ? "mateX" : mate.type === "alignY" ? "mateY" : mate.type === "alignZ" ? "mateZ" : "mateDistance"),
      detail: componentLabel(mate.a) + " ↔ " + componentLabel(mate.b),
      icon: "ph-link", can: { select: true, remove: true },
    });
  }).concat(topology.map(function (mate, index) {
    var issues = mateIssuesFor(mate.id);
    return assemblyTreeNode({
      id: "tmate:" + mate.id, kind: "mate", targetId: mate.a && mate.a.componentId, dependencyId:mateDependencyId([],'topology',mate.id),
      index: legacy.length + index,
      name: topologyMateLabel(mate.type,mate),
      detail: componentLabel(mate.a && mate.a.componentId) + " ↔ " + componentLabel(mate.b && mate.b.componentId),
      icon: mate.type === "screw" ? "threadfeature" : "ph-link",
      // the solver already honours mate.suppressed; this is the first way to set it
      suppressed: !!mate.suppressed,
      error: issues.length ? mateIssueLabel(issues[0]) : null,
      /* Mates are solved in list order and the last one wins, so dragging one
         down the list is a real edit, not a cosmetic sort. */
      can: { select: true, remove: true, suppress: true, reorder: true },
    });
  }));

  // the assembly's own Front, Top and Right planes come first, as in SOLIDWORKS
  var sections = [assemblyTreeNode({
    id: "section:planes", kind: "section", name: t("assemblyPlanes"), icon: "ph-square",
    collapsed: assemblyCollapsed("section:planes", true),
    children: planeTreeRows(ASSEMBLY_ORIGIN_ID, "section:planes"),
  }), assemblyTreeNode({
    id: "section:components", kind: "section", name: t("treeComponents"),
    icon: "components", detail: String(components.length),
    collapsed: assemblyCollapsed("section:components", false),
    children: componentRows,
  })];
  sections.push(assemblyTreeNode({
    id: "section:mates", kind: "section", name: t("treeMates"),
    icon: "ph-link", detail: String(mateRows.length),
    collapsed: assemblyCollapsed("section:mates", false),
    children: mateRows,
  }));
  return { mode: "assembly", nodes: sections, rollbackAt: -1, historyCount: 0 };
}

function assemblyComponentForNode(node) {
  var id = node.targetId != null ? node.targetId : null;
  return id == null ? null : assemblyComponentById(id);
}

/* showTreeMenu's entries all run the part-document handlers, so an assembly
   needs its own list — same chrome, actions that mean something here. */
function showAssemblyTreeMenu(node, event, api, handlers) {
  closeTreeMenu();
  var items = [];
  if (node.can.rename) items.push({ label: t("treeRename") + " · F2", icon: "ph-textbox", run: function () { api.rename(); } });
  if (node.can.suppress) items.push({
    label: node.kind === "component"
      ? t(node.suppressed ? "treeShowComponent" : "treeHideComponent")
      : t(node.suppressed ? "unsuppress" : "suppress"),
    icon: node.suppressed ? "ph-eye" : "ph-eye-slash",
    run: function () { handlers.onSuppress(node); },
  });
  if(node.kind==='subcomponent'&&node.componentPath){
    var nested=nestedComponentOccurrence(E.assembly,node.componentPath);
    if(nested?.component.def&&!isSubassembly(nested.component)){
      items.push({label:'Edit nested component',icon:'ph-cube-focus',run:function(){beginContextPart(nested.component,false,node.componentPath);}});
      items.push({label:'Nested component properties',icon:'ph-tag',run:function(){editNestedComponentProperties(node.componentPath);}});
    }
  }
  if (node.kind === "component") {
    var component = assemblyComponentForNode(node);
    if(component?.def && !isSubassembly(component))items.push({label:"Edit component",icon:"ph-cube-focus",run:function(){beginContextPart(component);}});
    if (component) items.push({
      label: (component.grounded ? "✓ " : "") + t("grounded"),
      icon: component.grounded ? "ph-lock-open" : "ph-anchor",
      run: function () {
        pushUndo(t("grounded"));
        component.grounded = !component.grounded;
        solveAssembly({ quiet: true });
        refreshAll();
      },
    });
    items.push({ label: t("isolate"), icon: "ph-eye", run: function () {
      E.componentSel = [component]; E.sel = component; toggleIsolate();
    } });
  }
  items.push({ label: t("treeExpandAll"), icon: "ph-arrows-out-simple", run: function () { setAllAssemblyCollapsed(false); } });
  items.push({ label: t("treeCollapseAll"), icon: "ph-arrows-in-simple", run: function () { setAllAssemblyCollapsed(true); } });
  if (node.can.remove) items.push({ label: t("del"), icon: "ph-trash", run: function () { handlers.onRemove(node); } });
  if (!items.length) return;
  openTreeMenu(items, event);
}

function setAllAssemblyCollapsed(collapsed) {
  var state = treeCollapseState();
  var walk = function (nodes) {
    nodes.forEach(function (node) {
      if (node.children.length) state[node.id] = collapsed;
      walk(node.children);
    });
  };
  walk(assemblyTreeModel().nodes);
  refreshParts();
}

function assemblyTreeHandlers(model) {
  var handlers;
  handlers = {
    onSelect: function (node, event) {
      if (node.kind === "plane") {
        var parts = String(node.id).split("|"), reference = planeMateReference(parts[2], parts[3]);
        if (!reference) return;
        var additive = event && (event.ctrlKey || event.metaKey || E.mobileAddSelection);
        E.topologySelection = additive ? (E.topologySelection || []).concat(reference) : [reference];
        var holder = assemblyComponentById(parts[2]);
        if (holder) { E.componentSel = additive ? E.componentSel.filter(function (c) { return c !== holder; }).concat(holder) : [holder]; E.sel = holder; }
        refreshSelection();
        return;
      }
      if (node.kind === "mate") {
        // selecting a mate selects what it holds, which is what you want to see
        var pair = assemblyMatePair(node.id);
        E.componentSel = pair.filter(Boolean);
        E.sel = E.componentSel[E.componentSel.length - 1] || null;
        refreshSelection();
        return;
      }
      var component = assemblyComponentForNode(node);
      if (!component) return;
      if (event && (event.ctrlKey || event.metaKey || E.mobileAddSelection)) {
        var at = E.componentSel.indexOf(component);
        if (at === -1) E.componentSel.push(component); else E.componentSel.splice(at, 1);
      } else E.componentSel = [component];
      E.sel = E.componentSel[E.componentSel.length - 1] || null;
      refreshSelection();
    },
    onEdit: function (node) {if(node.kind==='subcomponent'&&node.componentPath){var found=nestedComponentOccurrence(E.assembly,node.componentPath);if(found)beginContextPart(found.component,false,node.componentPath);}},
    onRename: function (node, name) {
      var component = assemblyComponentForNode(node);
      if (!component || node.kind !== "component") return;
      pushUndo(t("partName"));
      component.name = String(name || "").slice(0, 80) || component.modelKey || component.assemblyKey || t("component");
      refreshAll();
    },
    onSuppress: function (node) {
      if (node.kind === "component") {
        var component = assemblyComponentForNode(node);
        if (!component) return;
        pushUndo(t("visible"));
        component.visible = component.visible === false;
        invalidateInterference();
        refreshAll();
        return;
      }
      var mate = assemblyMateById(node.id);
      if (!mate) return;
      pushUndo(t("suppress"));
      mate.suppressed = !mate.suppressed;
      solveAssembly();
      refreshAll();
    },
    onRollback: function () {},
    onRemove: function (node) {
      if (node.kind === "component") { removeAssemblyComponent(assemblyComponentForNode(node)); return; }
      var mate = assemblyMateById(node.id);
      if (!mate) return;
      pushUndo(t("del"));
      E.assembly.mates = (E.assembly.mates || []).filter(function (m) { return m !== mate; });
      E.assembly.topologyMates = (E.assembly.topologyMates || []).filter(function (m) { return m !== mate; });
      solveAssembly();
      refreshAll();
    },
    onReorder: function (dragId, target, after) {
      if (!target.can.reorder) return;
      var list = E.assembly.topologyMates || [];
      var drag = assemblyMateById(dragId), onto = assemblyMateById(target.id);
      var from = list.indexOf(drag), at = list.indexOf(onto);
      if (from < 0 || at < 0) return;
      var to = at + (after ? 1 : 0);
      if (from < to) to -= 1;
      if (to === from) return;
      pushUndo(t("reorder"));
      list.splice(to, 0, list.splice(from, 1)[0]);
      solveAssembly();
      refreshAll();
    },
    onToggleCollapse: function (node) {
      treeCollapseState()[node.id] = !node.collapsed;
      refreshParts();
    },
    onContextMenu: function (node, event, api) { showAssemblyTreeMenu(node, event, api, handlers); },
    onHover: function (targetId,node) { setDependencyHighlight(node?.dependencyId || null); },
    onRollbackRelease: function () {},
  };
  return handlers;
}

function assemblyMateById(nodeId) {
  var key = String(nodeId).slice(String(nodeId).indexOf(":") + 1);
  var found = (E.assembly && E.assembly.mates || []).find(function (m) { return String(m.id) === key; });
  if (found) return found;
  return (E.assembly && E.assembly.topologyMates || []).find(function (m) { return String(m.id) === key; }) || null;
}

function assemblyMatePair(nodeId) {
  var mate = assemblyMateById(nodeId);
  if (!mate) return [];
  var a = mate.a && mate.a.componentId != null ? mate.a.componentId : mate.a;
  var b = mate.b && mate.b.componentId != null ? mate.b.componentId : mate.b;
  return [assemblyComponentById(a), assemblyComponentById(b)];
}

function removeAssemblyComponent(component) {
  if (!component) return;
  if(component.componentPattern){flash("Generated occurrence: edit or remove its Component Pattern instead");return;}
  pushUndo(t("del"));
  E.assembly.components = E.assembly.components.filter(function (c) { return c !== component; });
  E.componentSel = E.componentSel.filter(function (c) { return c !== component; });
  E.topologySelection = (E.topologySelection || []).filter(function (reference) { return reference.componentId !== component.id; });
  E.sel = E.componentSel[E.componentSel.length - 1] || null;
  solveAssembly();
  refreshAll();
}

function contextBodyTopology(doc) {
  return activeParts(doc).flatMap(function(part){
    if (part.meshData) return part.meshData.topology || [];
    return analyticPartTopology(part,part.featureId || "feature:part:"+part.id);
  });
}

function contextPartTopology(component) {
  return contextDocumentTopology(component,componentDef(component),contextBodyTopology);
}

function contextPathLabel(chain) {
  return chain.map(function(item){return (item.name || "Component")+" ["+item.id+"]";}).join(" / ");
}

function openNewContextPart() {
  if (!E.assembly) return;
  var choices = [];
  for (var occurrence of flattenAssembly(E.assembly)) {
    var component = occurrence.component, path = occurrence.path;
    if (component.componentPattern || occurrence.parents.some(item=>item.componentPattern)) continue;
    var prefix = contextPathLabel(occurrence.parents.concat(component));
    var entries = contextPartTopology(component).concat(standardPlaneEntries());
    var faces = planarMateFaceChoices(entries,componentDef(component)?.features || [],modelLengthUnit());
    for (var face of faces) {
      if (face.entry.descriptor.surface !== "plane") continue;
      var id = face.entry.persistentId;
      var label = face.entry.reference ? face.entry.name : face.label+(face.label.includes(id) ? "" : " ["+id+"]");
      choices.push({value:JSON.stringify([path,id]),label:prefix+" · "+label,path:path,component:component,entry:face.entry});
    }
  }
  if(!choices.length){flash("Select a component with a planar face");return;}
  var selected=(E.topologySelection || []).at(-1), initial=choices.find(function(choice){
    return choice.path[0]===selected?.componentId && choice.path.slice(1).concat(choice.entry.persistentId).join("/")===selected.persistentId;
  }) || choices[0];
  openQuickForm({action:"newcontextpart",title:"New part in context",hint:"The new part's Right plane attaches to this face. Sketch and add features, then Finish component. Parent geometry is shown transparent.",fields:[
    {key:"name",label:"Component name",type:"text",value:"New in-context part"},
    {key:"support",label:"Parent planar face",type:"select",value:initial.value,choices:choices},
  ],onApply:function(values){
    var choice=choices.find(function(item){return item.value===values.support;});if(!choice)return false;
    pushUndo("New part in context");
    var def=newDef();def.name=String(values.name || "New in-context part");
    var component={id:uid(),name:def.name,def:def,visible:true,grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0},inContext:{parentId:choice.path[0],occurrencePath:choice.path,reference:stampComponentRef(topologyReferenceFromEntry(choice.entry),choice.component,null)}};
    E.assembly.components.push(component);
    applyAssemblyMates(E.assembly);
    if(component.contextIssue){E.assembly.components.pop();applyAssemblyMates(E.assembly);flash(component.contextIssue);return false;}
    E.quickFormInstance?.dismiss(true);
    beginContextPart(component,true);return true;
  }});
}

function openSurfaceSectionIntersection(sketch,anchor,edgeReference) {
  var compiled=compileKernelFeatureTree(E.def);
  if(!compiled.ok){flash("The upstream feature history is unavailable");return;}
  var consumer=compiled.features.findIndex(function(feature){return feature.params?.sketchId===sketch.id || (feature.references?.sketches || []).includes(sketch.id);});
  var features=consumer<0?compiled.features:compiled.features.slice(0,consumer);
  openQuickForm({action:"surfaceintersectionsource",title:"Choose surface feature",hint:"Choose the feature containing the original curved face. Only history through that feature is calculated.",fields:[
    {key:"owner",label:"Surface feature",type:"select",value:"all",choices:[{value:"all",label:"All upstream features"}].concat(features.map(function(feature){return {value:feature.id,label:feature.name || feature.type};}))}
  ],onApply:function(values){computeSurfaceSectionIntersection(sketch,anchor,edgeReference,values.owner);return true;}});
}

async function computeSurfaceSectionIntersection(sketch,anchor,edgeReference,ownerId) {
  var edge=resolveIntersectionEdge(edgeReference),candidates=[];
  if(!edge){flash("Select a model edge for the section intersection");return;}
  // Worker restore materializes the final head only. A surface relation must
  // query the original trimmed upstream face with its original persistent name.
  var compiled=compileKernelFeatureTree(E.def),sectionDocument=E.def;
  if(!compiled.ok){flash("The upstream feature history is unavailable");return;}
  var consumer=compiled.features.findIndex(function(feature){return feature.params?.sketchId===sketch.id || (feature.references?.sketches || []).includes(sketch.id);});
  var sectionFeatures=consumer<0?compiled.features:compiled.features.slice(0,consumer);
  if(ownerId!=="all"){
    var ownerIndex=sectionFeatures.findIndex(function(feature){return feature.id===ownerId;});
    if(ownerIndex<0){flash("The surface feature is no longer available");return;}
    sectionFeatures=sectionFeatures.slice(0,ownerIndex+1);
  }
  try {
    flash("Computing upstream surface sections");
    candidates=await surfaceSectionsInCadWorker({...compiled.document,features:sectionFeatures,nativeSectionOwnerId:ownerId==="all"?null:ownerId},cloneData(sketch),cloneData(edge),{onProgress:function(progress){flash("Computing upstream surface sections · "+(progress.name || progress.stage));}});
  }catch(error){flash(error.message);return;}
  if(E.def!==sectionDocument)return;
  if(!candidates.length){flash("No curved native surface meets this model edge on the sketch plane");return;}
  openQuickForm({action:"surfaceintersection",title:"Intersect model surface",hint:"Bind this point to the exact surface section and the selected edge projection. It follows upstream edits.",fields:[
    {key:"source",label:"Source surface",type:"select",value:"0",choices:candidates.map(function(item,index){return {value:String(index),label:item.name+" · "+item.surface+" · "+item.reference.semantic+" · lower Y "+modelLengthText(item.lower.y,5)+" "+modelLengthUnit()};})},
    {key:"branch",label:"Intersection branch",type:"select",value:"lower",choices:[{value:"lower",label:"Lower"},{value:"upper",label:"Upper"}]}
  ],onApply:function(values){
    try {
      var chosen=candidates[Number(values.source)],target=chosen[values.branch];
      pushUndo("Intersect model surface");anchor.fixed=false;
      sketch.constraints=(sketch.constraints || []).filter(function(c){return !(c.point===anchor.id && (c.type==="fixed" || c.type==="intersection"));});
      sketch.constraints.push({id:uid(),type:"intersection",point:anchor.id,edgeA:cloneData(edgeReference),sectionFace:cloneData(chosen.reference),sectionBranch:values.branch,x:target.x,y:target.y});
      if(!resolveSketch(true)){flash("The surface intersection conflicts with the sketch relations");return false;}
      refreshAll();return true;
    }catch(error){flash(error.message);return false;}
  }});
}

async function editNestedComponentProperties(path) {
  var owner=E.assembly,found=nestedComponentOccurrence(owner,path);if(!found?.component.def)return;
  var edit=createNestedComponentEdit(owner,path),history=currentHistoryNode(),component=found.component;
  var answer=await sheetForm('Nested component properties',[
    {key:'partNumber',label:'Component part number',value:assemblyPartNumber(component,component.def)},
    {key:'description',label:'Component description',value:documentDescription(component)||documentDescription(component.def)}
  ],'Occurrence metadata only. Preserves source part library, native geometry, mates and placement.');
  if(!answer)return;
  if(E.docType!=='assembly'||currentHistoryNode()!==history||!nestedEditStillCurrent(E.assembly,edit)){flash('The nested occurrence changed; reopen its properties');return;}
  pushUndo('Nested component properties');
  var live=nestedComponentOccurrence(E.assembly,path);if(!live)return;
  setDocumentProperty(live.component,'PartNo',answer.partNumber);setDocumentProperty(live.component,'Description',answer.description);
  invalidateDrawing();refreshAll();scheduleModelerDraft();
}

function clearContextPartInteraction() {
  // A completed or cancelled leaf edit must not seed assembly Undo with its
  // previous feature command. This discards presentation state, never CAD.
  E.quickFormInstance?.dismiss(true);
  E.quickAction=null;E.collectingFeature=false;E.tool="select";
  E.authoring={phase:"model",referenceId:null,sketchId:null,featureType:null,sketchSelection:[],featureSelection:[],workflowFocus:"context"};
  var host=root && root.querySelector("#mdQuickSettings");
  if(host){host.innerHTML="";host.hidden=true;}
}

function beginContextPart(component,isNew,path) {
  if(!component?.def || isSubassembly(component) || E.contextEdit)return;
  if(E.quickFormInstance?.applying || E.quickFormInstance?.hasPendingEdits())return leavingQuickForm(()=>beginContextPart(component,isNew,path));
  var edit=createNestedComponentEdit(E.assembly,path || [component.id]);
  if(edit.source!==component)return;
  E.contextEdit=edit;edit.previousDef=E.def;edit.isNew=!!isNew;
  E.def=edit.working;delete edit.working;
  E.def.metadata=E.def.metadata || {};E.def.metadata.contextEditor={componentId:component.id,componentPath:edit.path,assemblyKey:E.assembly.key,isNew:!!isNew};
  setDocumentType("part");
  H.clear().seed();
  E.authoring={phase:"model",referenceId:null,sketchId:null,featureType:null,sketchSelection:[],featureSelection:[],workflowFocus:"context"};
  setTab("parts");refreshAll();fitPreview();
}

async function finishContextPart() {
  var edit=E.contextEdit;if(!edit)return;
  if(edit.finishing)return false;
  if(E.quickFormInstance?.applying || E.quickFormInstance?.hasPendingEdits())return leavingQuickForm(finishContextPart);
  if(!nestedEditStillCurrent(E.assembly,edit)){flash('The nested occurrence changed; cancel and reopen component edit');return false;}
  edit.finishing=true;
  try {
    var working=E.def,history=currentHistoryNode();
    if(isCanonicalAuthoring() && activeParts(working).length){
      var exact=await regenerateExactModel(false,{restoreMode:'mesh'});
      if(!exact?.ok || E.contextEdit!==edit || E.def!==working)return false;
    }
    if(E.quickFormInstance?.hasPendingEdits() || currentHistoryNode()!==history||!nestedEditStillCurrent(E.assembly,edit)){flash('The component changed while finishing; retry after the current edit');return false;}
    var occurrence=nestedComponentOccurrence(E.assembly,edit.path),top=E.assembly.components.find(function(c){return String(c.id)===String(edit.path[0]);});
    E.def=edit.previousDef;E.contextEdit=null;clearContextPartInteraction();
    H.clear().seed();pushUndo('Edit component',undefined,'assembly');commitNestedComponentEdit(E.assembly,edit,working);
    setDocumentType('assembly');E.sel=top;E.componentSel=top?[top]:[];
    solveAssembly({quiet:true});refreshAll();fitPreview();return true;
  } finally {edit.finishing=false;}
}

function cancelContextPart() {
  var edit=E.contextEdit;if(!edit)return;
  if(E.quickFormInstance?.applying || E.quickFormInstance?.hasPendingEdits())return leavingQuickForm(cancelContextPart);
  if(edit.isNew && E.assembly===edit.owner && edit.path.length===1)E.assembly.components=E.assembly.components.filter(function(component){return component!==edit.source;});
  E.def=edit.previousDef;E.contextEdit=null;clearContextPartInteraction();
  setDocumentType("assembly");H.clear().seed();refreshAll();fitPreview();scheduleModelerDraft();
}

function syncAssemblyContextBar() {
  var existing=root?.querySelector("#mdAssemblyContextBar");if(existing)existing.remove();
  if(!E.contextEdit)return;
  var bar=el("div","md-note");bar.id="mdAssemblyContextBar";
  bar.appendChild(el("span","","Editing component · "+(E.def?.name || "")));
  bar.appendChild(btn("Finish component",finishContextPart,"btn-accent"));
  bar.appendChild(btn("Cancel component edit",cancelContextPart));
  root.querySelector("#mdRailRow")?.appendChild(bar);
}

function addAssemblyContextGhosts(parent) {
  if(!E.contextEdit)return;
  var occurrence=nestedComponentOccurrence(E.assembly,E.contextEdit.path || [E.contextEdit.componentId]);if(!occurrence)return;
  var current=occurrence.component,frame=occurrence.placement,blown=explodedOccurrenceOffset(occurrence);
  var placement=new THREE.Group();placement.matrix.makeBasis(new THREE.Vector3(frame.x.x,frame.x.y,frame.x.z),new THREE.Vector3(frame.y.x,frame.y.y,frame.y.z),new THREE.Vector3(frame.z.x,frame.z.y,frame.z.z));
  placement.matrix.setPosition(frame.origin.x+blown.x,frame.origin.y+blown.y,frame.origin.z+blown.z);
  var context=new THREE.Group();context.userData.cadAssemblyContext=true;context.matrix.copy(placement.matrix).invert();context.matrixAutoUpdate=false;
  assemblyWithoutNestedOccurrence(E.assembly,occurrence.path).components.forEach(function(component){
    if(component.visible===false)return;
    var ghost=buildComponentGroup(component,null,"",true);if(!ghost)return;
    ghost.traverse(function(object){
      delete object.userData.cadComponent;delete object.userData.cadPart;object.userData.cadOverlay=true;
      if(object.material){var materials=Array.isArray(object.material)?object.material:[object.material];materials=materials.map(function(material){var copy=material.clone();copy.transparent=true;copy.opacity=.18;copy.depthWrite=false;return copy;});object.material=Array.isArray(object.material)?materials:materials[0];}
    });context.add(ghost);
  });parent.add(context);
}

function refreshComponents() {
  var host = root.querySelector("#mdParts");
  var previousInsertModel=host.querySelector(".md-insert-component select")?.value;
  host.innerHTML = "";
  addFeatureFilter(host);
  // This panel reads names and keys only. Deep-copying every saved mesh and
  // native topology on every selection/refresh blocks the main thread.
  var models = modelLibraryCache;
  var insert = el("div", "md-insert-component");
  var select = el("select");
  select.setAttribute("aria-label","Component model");
  models.forEach(function (m) {
    var o = document.createElement("option");
    o.value = m.key; o.textContent = m.name || m.key;
    select.appendChild(o);
  });
  /* Saved assemblies insert as sub-assemblies — every one but this assembly
     and any that already contain it, which would nest it inside itself. */
  var currentKey = E.assembly && E.assembly.key;
  var subassemblies = assemblyLibraryCache.filter(function (a) { return a.key !== currentKey && !containsAssembly(a, currentKey); });
  if (subassemblies.length) {
    var group = document.createElement("optgroup");
    group.label = t("subassembliesGroup");
    subassemblies.forEach(function (a) {
      var o = document.createElement("option");
      o.value = "asm:" + a.key; o.textContent = a.name || a.key;
      group.appendChild(o);
    });
    select.appendChild(group);
  }
  if(previousInsertModel && Array.from(select.options).some(function(option){return option.value===previousInsertModel;}))select.value=previousInsertModel;
  var add = btn('<i class="ph ph-plus"></i> ' + t("addComponent"), function () {
    if (select.value) insertAssemblyComponent(select.value);
  }, "btn-accent");
  add.disabled = !models.length && !subassemblies.length;
  insert.appendChild(select); insert.appendChild(add); host.appendChild(insert);
  host.appendChild(btn("New part in context", openNewContextPart, "md-wide"));
  /* An empty library used to leave Assembly as a dead end: an empty dropdown, a
     disabled Insert button, and no hint that the tutorial can seed components.
     Say so, and offer the one action that actually gets the user moving. */
  if (!models.length) {
    host.appendChild(btn('<i class="ph ph-graduation-cap"></i> ' + t("runAssemblyGuide"), function () {
      startTour(); selectTourTrack("assembly", "interactive");
    }, "btn-accent"));
  }

  var count = E.assembly && E.assembly.components ? E.assembly.components.length : 0;
  var badge = root.querySelector("#mdPartBadge");
  if (badge) { badge.textContent = count || ""; badge.classList.toggle("on", !!count); }
  var sizeEl = root.querySelector("#mdSize");
  if (sizeEl) sizeEl.textContent = count ? countLabel(count, "assemblyComponentOne", "assemblyComponents") : "";
  syncDiagnosticJump();
  if (!count) {
    emptyState(host, "ph-stack", models.length ? t("noComponents") : t("emptyLibTitle"),
      models.length ? t("noComponentsHint") : t("emptyLibHint")).classList.add("md-empty-brief");
    return;
  }

  var model = assemblyTreeModel();
  E.treeModel = model;
  var mount = el("div", "md-tree-mount");
  host.appendChild(mount);
  E.treeState = renderTreeModel(mount, model, treeDeps(), assemblyTreeHandlers(model), E.treeState || {});
  applyDependencyTreeClasses();
  updateDependencyPresentation();
  applyFeatureFilter(host);
}

/* Editing a sketch enters it exactly the way creating one does — see
   chooseSketchReference(), whose comment explains the rule this now shares.
   Edit used to end with setMode("2d") unconditionally, so a sketch drawn on a
   face of the solid was reopened as a flat drawing with the model gone: the
   one thing it was dimensioned against was no longer on screen. The camera
   pose is captured here so Finish and Escape can put it back; both already
   call restoreSketchCameraPose(), which had nothing to restore because this
   path never captured. */
function editHoleWizardSketch(sketch) {
  if(E.mode!=='3d')setMode('3d');
  var documentAtStart=E.def,inputs,note,errorText='',editingPosition=sketch.kind==='cylindrical-position-3d';
  E._holeSketchEditId=sketch.id;E._holeSketchPreview=cloneData(sketch);
  function relation(type){var r=sketch.constraints.find(function(c){return c.type===type;});return r?.enabled!==false && !r?.suppressed;}
  var fields=editingPosition?[
    {key:'topDistance',label:'Distance below cylinder top',type:'number',unit:'length',value:sketch.topDistance,min:.000001},
    {key:'branch',label:'Cylindrical side',type:'select',value:sketch.branch,choices:[{value:'positive-z',label:'+Z side'},{value:'negative-z',label:'−Z side'}]},
    {key:'OnSurface',label:'OnSurface · hole point P',type:'boolean',value:relation('OnSurface')},
    {key:'AlongZ',label:'AlongZ · construction A–B',type:'boolean',value:relation('AlongZ')},
    {key:'AlongY',label:'AlongY · endpoint B to P',type:'boolean',value:relation('AlongY')},
    {key:'selection',label:'Inspect geometry and relation',type:'select',value:'all',choices:[{value:'all',label:'All XYZ geometry'},{value:'P',label:'Point P · OnSurface'},{value:'AB',label:'Construction A–B · AlongZ'},{value:'BP',label:'Points B/P · AlongY'}]},
  ]:['diameter','cboreDiameter','cboreDepth'].map(function(name){return {key:name,label:{diameter:'Bore diameter',cboreDiameter:'Counterbore diameter',cboreDepth:'Total recess depth'}[name],type:'number',unit:'length',value:sketch.dimensions.find(function(d){return d.name===name;}).value,min:.000001};});
  function clear(){E._holeSketchPreview=null;E._holeSketchEditId=null;E._holeSketchInspect=null;updatePreview();}
  function preview(values){
    try{
      var edited=editedHoleWizardSketch(documentAtStart,sketch.id,values);E._holeSketchPreview=edited.sketch;
      E._holeSketchInspect=values.selection || 'all';
      if(note){note.textContent=edited.result.status+' · '+edited.result.degreesOfFreedom+' DOF · residual '+edited.result.maxResidual+(edited.result.error?' · '+edited.result.error:'');
        if(editingPosition)note.textContent+=' · '+edited.sketch.points.map(function(p){return p.role+' ('+[p.x,p.y,p.z].map(function(v){return modelLengthText(v,5);}).join(', ')+')';}).join(' · ');}
      E.topologySelection=editingPosition && values.selection==='P' && sketch.source.faceReference?[cloneData(sketch.source.faceReference)]:[];
      updatePreview();
      return edited;
    }catch(error){errorText=String(error.message || error);if(note)note.textContent=errorText;return null;}
  }
  inputs=openQuickForm({action:'hole-sketch-edit',title:editingPosition?'Edit 3D hole position':'Edit counterbore profile',
    hint:'Bounded cylindrical Hole Wizard sketch. Edit dimensions, relations and side; inspect its actual 3D geometry. Generic planar commands are unavailable here.',
    fields:fields,onLive:preview,onCancel:clear,failureMessage:function(){return errorText;},
    onApply:async function(values){
      if(E.def!==documentAtStart){errorText='The document changed; reopen this sketch';return false;}
      var edited=preview(values);if(!edited)return false;
      if(edited.result.status==='inconsistent'){errorText=edited.result.error || 'Sketch is inconsistent';return false;}
      var consumers=(edited.document.features || []).filter(function(feature){return feature.type==='hole' && (feature.params.positionSketchId===sketch.id || feature.params.holeProfileSketchId===sketch.id);});
      var revision=E.massEditRevision,historyNodeAtStart=currentHistoryNode(),verified=[];
      try{
        if(edited.result.ok){
          consumers.forEach(function(feature){var resolved=resolveHoleWizardInputs(feature,edited.document);feature.params={...feature.params,...resolved.params,callout:holeCallout(resolved.params)};});
          (edited.document.parts || []).forEach(function(part){consumers.forEach(function(feature){syncHoleCutPlacement(part,feature,null,edited.document);});});
          for(var part of edited.document.parts || [])if((part.cuts3d || []).some(function(cut){return consumers.some(function(feature){return feature.id===cut.featureId;});}))verified.push(await exactDisplayBody(part,edited.document));
        }
        if(E.def!==documentAtStart || E.massEditRevision!==revision || currentHistoryNode()!==historyNodeAtStart)throw new Error('The document changed while checking the sketch; apply again');
        pushUndo('Edit '+sketch.name);
        Object.keys(E.def).forEach(function(key){delete E.def[key];});Object.assign(E.def,edited.document);
        (E.def.parts || []).forEach(function(part){invalidatePartMeshAfterEdit(part);});
        clear();syncSketchDrivenParts();scheduleModelerDraft();return true;
      }catch(error){errorText=String(error.message || error);return false;}
      finally{verified.forEach(function(body){body.release();});}
    }});
  var host=root.querySelector('#mdQuickSettings');note=el('output','md-note');note.setAttribute('data-hole-sketch-solver','');note.setAttribute('aria-live','polite');host.appendChild(note);
  if(inputs){var values={};fields.forEach(function(f){values[f.key]=f.value;});preview(values);}
}

function editSketchFromHistory(sketch) {
  if(isHoleWizardSketch(sketch)){editHoleWizardSketch(sketch);return;}
  var stayIn3D = E.mode === "3d";
  var onFace = !!sketch.support;
  E.def.activeSketch=sketch.id;E.authoring.phase="sketch";E.authoring.sketchId=sketch.id;E.authoring.referenceId=sketch.referenceId;
  E.authoring.sketchSelection=[sketch.id];E.authoring.workflowFocus="sketch";E.authoring.resumePhase=null;
  E.ssel=[];E.sel=null;E.view=sketch.plane || referencePlaneView((E.def.references || []).find(function(reference){return reference.id===sketch.referenceId;}));
  E.solveInfo=solveSketch(sketch);E._solveSketchId=sketch.id;
  if(stayIn3D){E.modelPlaneActive=true;syncModelPlane();}else setMode("2d");
  setCommandTab("sketch");setTab("sketch");
  setTool("select",true);
  /* A sketch on a face snaps square whatever the preference says — the same
     rule the face-pick path uses, and for the same reason: you are editing
     geometry that was drawn flat on that face. */
  if(stayIn3D && (E.sketchNormalTo || onFace)){
    captureSketchCameraPose();
    orientModelToView(true);
  }
  refreshAll();
  if(!stayIn3D || E.sketchNormalTo || onFace)requestAnimationFrame(fitSketch);else drawSketch();
}

/* Where a merged feature's geometry ended up: on its host's merge list, not on
   a part of its own. */
function mergeRecordFor(featureId) {
  var found=null;
  (E.def && E.def.parts || []).forEach(function(part){
    (part.merges3d || []).forEach(function(merge){ if(merge.featureId===featureId) found={part:part,merge:merge}; });
  });
  return found;
}

function syncProjectionFromFeature(feature) {
  if((feature.type==="extrude" || feature.type==="extrudeCut") && feature.params?.sketchId)
    synchronizeSketchExtrusionFrames(E.def,feature.params.sketchId);
  var changedProjections=transitionExtrudeProjection(E.def,feature);
  if(changedProjections.length){
    if(E.sel && !E.def.parts.includes(E.sel))E.sel=changedProjections[0];
    changedProjections.forEach(function(item){invalidatePartMeshAfterEdit(item);markLiveDirtyPart(item);scheduleExactMesh(item);});
  }
  if(feature.type==="helix"){
    var reference=(E.def.referenceGeometry || []).find(function(r){return r.featureId===feature.id;});
    if(reference){Object.assign(reference,createHelix({...helixFromSketch(E.def,feature.params),id:reference.id,name:feature.name}));return true;}
  }
  if(feature.type==="loft"){
    (E.def.parts || []).forEach(function(body){(body.merges3d || []).concat(body.cuts3d || []).forEach(function(entry){if(entry.featureId===feature.id){Object.assign(entry,cloneData(feature.params),{kind:"loft",featureId:feature.id});invalidatePartMeshAfterEdit(body);scheduleExactMesh(body);}});});
  }
  var part=(E.def.parts || []).find(function(item){return item.featureId===feature.id;});
  if(feature.type==="toolbox"){
    var generated=toolboxFastener(cloneData(feature.params || {}));
    if(!generated || generated.ok===false)return false;
    if(!feature.toolboxAutoName || feature.name===feature.toolboxAutoName){
      feature.name=generated.callout;feature.toolboxAutoName=generated.callout;
      var historyEntry=(E.def.history || []).find(function(item){return item.targetId===feature.id;});
      if(historyEntry)historyEntry.name=feature.name;
    }
    var selectedWasToolbox=E.sel && E.sel.toolboxFeatureId===feature.id;
    restoreToolboxProjections(E.def,feature,generated);
    if(selectedWasToolbox)E.sel=E.def.parts.filter(function(item){return item.toolboxFeatureId===feature.id&&!item.previewOnly;}).slice(-1)[0] || null;
    (E.def.parts || []).forEach(function(item){if(item.toolboxFeatureId===feature.id)markLiveDirtyPart(item);});
    return true;
  } else if(part && feature.type==="extrude"){
    // A refreshed contour changes its associative IDs as well as its points.
    if(feature.params.profileEntityIds)part.profileEntityIds=cloneData(feature.params.profileEntityIds);
    else delete part.profileEntityIds;
    if(feature.params.holeProfileEntityIds)part.holeProfileEntityIds=cloneData(feature.params.holeProfileEntityIds);
    else delete part.holeProfileEntityIds;
    var depth=Math.max(1e-6,Number(feature.params.depth)||1e-6),offset=Number(feature.params.offset)||0,sketchId=feature.references.sketches[0],sketch=(E.def.sketches || []).find(function(item){return item.id===(sketchId && sketchId.id || sketchId);});
    var direction=extrusionPreviewDirection(sketch,part.axis,feature.params.direction),symmetric=!!feature.params.symmetric||feature.params.endCondition==="mid-plane",center=(part.frame?0:(sketch&&Number(sketch.offset)||0))+direction*offset;
    part.from=symmetric?center-direction*depth/2:center;part.to=symmetric?center+direction*depth/2:center+direction*depth;part.supportDepth=depth;part.supportBaseOffset=offset;
    part.direction=feature.params.direction;part.symmetric=symmetric;part.draftAngle=Number(feature.params.draftAngle)||0;part.draftOutward=!!feature.params.draftOutward;delete part.meshData;part.exactPending=false;markLiveDirtyPart(part);scheduleExactMesh(part);
  } else if(!part && feature.type==="extrude" && mergeRecordFor(feature.id)){
    /* A merged boss is not a part, so the branch above finds nothing. Its run
       still has to follow the depth the form is showing. */
    var record=mergeRecordFor(feature.id),host=record.part,merge=record.merge;
    var mergedDepth=Math.max(1e-6,Number(feature.params.depth)||1e-6),mergedOffset=Number(feature.params.offset)||0;
    var mergedSketchId=feature.references.sketches[0],mergedSketch=(E.def.sketches || []).find(function(item){return item.id===(mergedSketchId && mergedSketchId.id || mergedSketchId);});
    var mergedDirection=extrusionPreviewDirection(mergedSketch,merge.axis,feature.params.direction),mergedSymmetric=!!feature.params.symmetric||feature.params.endCondition==="mid-plane";
    var mergedCentre=(merge.frame?0:(mergedSketch&&Number(mergedSketch.offset)||0))+mergedDirection*mergedOffset;
    merge.from=mergedSymmetric?mergedCentre-mergedDirection*mergedDepth/2:mergedCentre;
    merge.to=mergedSymmetric?mergedCentre+mergedDirection*mergedDepth/2:mergedCentre+mergedDirection*mergedDepth;
    merge.draftBase=merge.from;
    merge.draftAngle=Number(feature.params.draftAngle)||0;merge.draftOutward=!!feature.params.draftOutward;
    invalidatePartMeshAfterEdit(host);markLiveDirtyPart(host);scheduleExactMesh(host);
  } else if(feature.type==="revolve" || feature.type==="revolveCut"){
    var sourceSketch=sketchById(E.def,feature.params.sketchId);
    if(sourceSketch && feature.params.profileEntityIds?.length){
      var geometry;
      try{geometry=resolvedRevolve(sourceSketch,feature.params);}catch(error){return false;}
      if(part)Object.assign(part,geometry.projection);
      (E.def.parts || []).forEach(function(body){
        var record=[...(body.cuts3d || []),...(body.merges3d || [])].find(row=>row.featureId===feature.id);
        if(record){Object.assign(record,geometry.tool);invalidatePartMeshAfterEdit(body);markLiveDirtyPart(body);scheduleExactMesh(body);}
      });
    }
    if(part){part.angle=Math.max(.001,Math.min(360,Number(feature.params.angle)||360));part.direction=feature.params.direction;part.symmetric=!!feature.params.symmetric;delete part.meshData;part.exactPending=false;markLiveDirtyPart(part);}
  } else if(part && isKernelBody(part) && featureBuildsKernelBody(feature.type)){
    /* A kernel body is rebuilt, not adjusted: the recipe is replaced with the
       feature's current parameters and the kernel runs again — the same
       contract as retyping an extrude's depth, just asynchronous. */
    try{part.kernel=kernelBodySpec(feature.type,feature.params);}
    catch(error){part.exactPending=false;part.exactError=String(error && error.message||error);return;}
    markLiveDirtyPart(part);scheduleKernelBody(part);
  }
  if(feature.type==="pattern" && feature.params?.scope==="feature"){
    var patternHost=selectedPatternBody(feature.params.seedFeatureId);if(patternHost){markLiveDirtyPart(patternHost);queueExactMesh(patternHost);}
  }
  if(feature.type==="pattern" && feature.params?.scope!=="feature"){
    // the input names the body's head, which on a merged body is not its featureId
    var seed=(E.def.parts || []).find(function(item){return item.featureId===feature.inputs[0] || cutTargetFeatureId(item)===feature.inputs[0];});
    E.def.parts=(E.def.parts || []).filter(function(item){return item.derivedFeatureId!==feature.id;});
    /* A rebuild starts from the un-merged run: the fusions the previous run
       left on their hosts describe placements that no longer exist. */
    clearPatternMerges(feature.id);
    if(seed){markLiveDirtyPart(seed);var count=Math.max(2,Math.min(100,Math.round(Number(feature.params.count)||2))),circularStep=circularPatternStepDegrees(feature.params,count)*Math.PI/180,placements=patternPlacements(feature.params);layPatternCopies(seed,feature.params,feature,placements,circularStep,function(copy){markLiveDirtyPart(copy);E.def.parts.push(copy);});}
  } else if(feature.type==="mirror" && feature.params?.scope==="feature"){
    var featureMirrorHost=selectedPatternBody(feature.params.seedFeatureId);if(featureMirrorHost){markLiveDirtyPart(featureMirrorHost);queueExactMesh(featureMirrorHost);}
  } else if(feature.type==="mirror"){
    var mirrorSeed=(E.def.parts || []).find(function(item){return item.featureId===feature.inputs[0] || cutTargetFeatureId(item)===feature.inputs[0];}),planeReference=(feature.references.references || ["plane:right"])[0];
    E.def.parts=(E.def.parts || []).filter(function(item){return item.derivedFeatureId!==feature.id;});
    if(mirrorSeed){var mirrored=mirrorProjectionPart(resetClonedPartIdentity(cloneData(mirrorSeed)),typeof planeReference==="string"?planeReference:planeReference.id);if(mirrored){mirrored.derivedFeatureId=feature.id;mirrored.sourceFeatureId=mirrorSeed.featureId;markLiveDirtyPart(mirrored);E.def.parts.push(mirrored);}}
  }
  (E.def.parts || []).forEach(function(item){
    (item.exactOperations || []).forEach(function(operation){if(operation.id!==feature.id)return;if(FINISH_AMOUNT_KEY[feature.type]!==undefined)operation.amount=Number(feature.params[FINISH_AMOUNT_KEY[feature.type]]);operation.params=cloneData(feature.params);markLiveDirtyPart(item);scheduleExactMesh(item);});
  });
}

function liveFeatureEditBadge() {
  return root && root.querySelector("#mdQuickSettings .md-feature-live");
}

function partsForFeature(featureId) {
  return (E.def && E.def.parts || []).filter(function(part){return partBelongsToFeature(part,featureId);});
}

/* Cheap means "rebuilds without OpenCascade". A kernel recipe, a finish
   operation, a 3D cut or merge, or a pattern asked to fuse its instances all
   reach the kernel; a plain pattern, a mirror and a toolbox row do not. */
function featureRebuildNeedsKernel(feature) {
  if(!feature)return false;
  if(featureBuildsKernelBody(feature.type) || FINISH_FEATURES.includes(feature.type))return true;
  if(feature.type==="pattern" && feature.params && (feature.params.mergeResult || feature.params.scope==="feature"))return true;
  if(feature.type==="mirror" && feature.params?.scope==="feature")return true;
  return partsForFeature(feature.id).some(function(part){
    return isKernelBody(part) || (part.exactOperations || []).length>0
      || (part.cuts3d || []).length>0 || (part.merges3d || []).length>0;
  });
}

/* Document order is build order, so a downstream chain is re-laid in it: a
   mirror of a pattern has to see the pattern's copies before it runs. */
function downstreamFeaturesOf(featureId) {
  var downstream=dependencySets(featureId).downstream;
  return (E.def && E.def.features || []).filter(function(item){return downstream.has(item.id);});
}

function liveDownstreamIsLive(token) {
  var pending=E._liveDownstream;
  return !!(pending && pending.token===token && E.authoring && E.authoring.featureEdit && E._featurePreviewToken===token);
}

function clearLiveDownstream(liveBadge) {
  E._liveDownstream=null;
  if(E._liveDownstreamTimer){clearTimeout(E._liveDownstreamTimer);E._liveDownstreamTimer=0;}
  if(liveBadge){liveBadge.classList.remove("approx");liveBadge.removeAttribute("data-preview-state");}
}

/* What the badge may claim about the kernel tier, read off the bodies rather
   than assumed: the debounced run only STARTS the rebuild, and the meshes land
   later through queueExactMesh. */
function syncLiveDownstreamBadge() {
  var pending=E._liveDownstream;if(!pending)return;
  var liveBadge=liveFeatureEditBadge();if(!liveBadge)return;
  var parts=pending.features.reduce(function(all,id){return all.concat(partsForFeature(id));},[]);
  var failed=parts.find(function(part){return part.exactError;});
  if(failed){
    pending.state="error";
    patternMergePreviewBadge(liveBadge,"error","ph-warning",tf("liveDownstreamFailed",{error:failed.exactError}));
    return;
  }
  if(pending.state==="calculating" || parts.some(function(part){return part.exactPending;}))return;
  pending.state="exact";
  patternMergePreviewBadge(liveBadge,"exact","ph-broadcast",t("liveDownstreamReady"));
}

export {
  addAssemblyContextGhosts, addFeatureFilter, applyDimensionEditor,
  applyFeatureFilter, beginContextPart, clearLiveDownstream,
  contextPartTopology, contextPathLabel, deleteDimensionEditor,
  dimensionTarget, downstreamFeaturesOf, editHoleWizardSketch,
  editPlacedDimension, editSketchFromHistory, emptyState,
  featureRebuildNeedsKernel, finishBoxSelect, finishContextPart,
  finishDimensionDrag, finishWallChain, insertAssemblyComponent,
  liveDownstreamIsLive, liveFeatureEditBadge, makeWallSegment,
  openComponentPatternForm, openSelectedSmartDimension,
  openSurfaceSectionIntersection, partsForFeature, positionDimensionEditor,
  projectPartEdges, refreshComponents, setEntityDimension, setLineConstraint,
  smartDimension, syncAssemblyContextBar, syncLiveDownstreamBadge,
  syncProjectionFromFeature, topologyMateLabel,
};

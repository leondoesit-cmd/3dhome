/* The CAD editor's inspector panes: feature, sketch, look and operations, split
   out of js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { STOCK_MATERIALS, createAppearanceOverride, faceAppearanceOverrides, partMaterialDensity, stockMaterialForPart, upsertAppearanceOverride } from "../cad_appearances.js";
import { planarMateFaceChoices } from "../cad_mate_reference_choices.js";
import { CABINET_MANUFACTURING_ROLES, assignCabinetManufacturing } from "../core/cabinet_advanced.js";
import { detachDrivenSketchDimension } from "../core/cone_silhouette.js";
import { synchronizeSketchExtrusionFrames } from "../core/extrusion_projection.js";
import { featureSpec } from "../core/feature_catalog.js";
import { faceFrameOrigin, realignFrame } from "../core/frame.js";
import { parseSketchDimensionEntry } from "../core/sketch_dimension_entry.js";
import { pierceSketchToHelix } from "../core/sketch_pierce.js";
import { sketchPlaneDisplay } from "../core/sketch_plane_display.js";
import { reassignSketchPlane } from "../core/sketch_plane_edit.js";
import { reattachSketchSupport } from "../core/sketch_support_edit.js";
import { cylinderUVDomain } from "../core/surface_uv.js";
import { sketchWorldPoint } from "../core/swept_sources.js";
import { synchronizeToolboxMaterial } from "../core/toolbox_assigned_material.js";
import { createTopologyRegistry, resolveTopologyReference } from "../core/topology.js";
import { getLang } from "../i18n.js";
import { MANUFACTURING_TABLES, validateManufacturingTables } from "../manufacturing_tables.js";
import { cloneData } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t } from "../modeler_strings.js";
import { openQuickForm, openSketchPointCoordinates } from "../modeler/command_manager.js";
import { addSketchOffsetControl, assemblyFlagsInspector, assemblyMateInspector, assemblyTransformInspector, highlightFeatureIssueBanner, highlightSketchIssueBanner, numLengthRow, refreshParts } from "../modeler/component_mates.js";
import { invalidateSketchProjection, pushUndo, scheduleModelerDraft } from "../modeler/document_history.js";
import { syncTools } from "../modeler/document_save.js";
import { flash, sketchLinePoints, sketchProfileAnalysis, sketchRegionAnalysis } from "../modeler/drawing_sheet.js";
import { btn, el } from "../modeler/editor_dom.js";
import { fillCabinetParameters, fillOps, numRow, openFeatureEditor } from "../modeler/editor_forms.js";
import { regenerateExactModel } from "../modeler/export_measure.js";
import { setMode } from "../modeler/library_io.js";
import { renderPreview, updatePreview } from "../modeler/library_panel.js";
import { topologyEntriesForPart } from "../modeler/library_store.js";
import { saveModelerPrefs } from "../modeler/prefs_snap.js";
import { applyConstraint, constraintCaption, constraintFits, dismissCommittedDimensionEditor, instanceLabels, refusalHint, showSketchRefusal } from "../modeler/sketch_dimension_editor.js";
import { constraintMeasure, isSketchObject, resolveSketch, selEntities, selPoints, selectSketch, selectedModelEdges, sketchProfilePresentation, sketchSelectionSummary } from "../modeler/sketch_entities.js";
import { activeTab, faceSketchAttachment, isCanonicalAuthoring, modelLengthText, modelLengthUnit, orientModelToView, referenceLabel, referencePlaneView, setTool, syncModelPlane } from "../modeler/sketch_workflow.js";
import { emptyState, openSurfaceSectionIntersection, setEntityDimension, setLineConstraint } from "../modeler/tree_assembly.js";
import { refreshDecorations } from "../modeler/viewport_state.js";
import { addVariable, collectSymbols, dimensionUnit, nameAvailable, removeVariable, resolveEquations } from "../sketch_equations.js";
import { bindPierceTargets } from "../sketch_intersection.js";
import { relationSubjects, sketchInstanceNames } from "../sketch_names.js";
import { healSketchEndpoints } from "../sketch_profiles.js";
import { circleData, ellipseData, ensureSketch, entityPoints, explainSketchConflict, planeLabel, sketchPoint, solveSketch, translateSketchGeometry } from "../sketch_solver.js";
import { clamp, fin, uid } from "../state.js";
import {
  CONSTRAINT_DEFS, DIMENSION_SYMBOLS, E, H, decoGroups, inspectorDirty,
  materialValidationTools, openParametricFeature, openSketchRepairs,
  refreshAll, refreshSelection, root,
} from "../modeler.js";

function fillInspectorTab(id) {
  if (E.docType === "assembly") {
    if (id === "shape") assemblyTransformInspector();
    else if (id === "look") assemblyFlagsInspector();
    else if (id === "ops") assemblyMateInspector();
    return;
  }
  if (id === "shape") fillShape();
  else if (id === "look") fillLook();
  else if (id === "ops") fillOps();
  else if (id === "sketch") fillSketchPane();
}

/* The feature a face or edge selection belongs to. A pick on a merged body
   selects the body's part, which carries the FIRST feature's id — so a Boss-Loft1
   face read "Base Extrude" in the selection name and the Shape panel while the
   face reference itself named Boss-Loft1 correctly. When every picked reference
   has one owner, that owner is the feature the selection is about. */
function topologySelectionFeature() {
  var owners = (E.topologySelection || []).map(function (ref) { return ref && ref.ownerFeatureId; });
  if (!owners.length || owners.some(function (id) { return !id || id !== owners[0]; })) return null;
  var id = String(owners[0]);
  return (E.def && E.def.features || []).find(function (feature) {
    return feature.id === id || id.indexOf(feature.id + ":") === 0;
  }) || null;
}

function inspectorHistoryFeature() {
  var ids = E.authoring && E.authoring.featureSelection || [];
  if (ids.length !== 1) return null;
  return (E.def.features || []).find(function (feature) { return feature.id === ids[0]; }) || null;
}

function fillInspector() {
  if (E.docType === "assembly") {
    assemblyTransformInspector();
    assemblyFlagsInspector();
    assemblyMateInspector();
    var hist = root.querySelector("#mdHist");
    if (hist && !hist.children.length) emptyState(hist, "ph-clock-counter-clockwise", t("tabHist"), t("mateHint"));
    var anm = root.querySelector("#mdSelName");
    if (anm) anm.textContent = E.sel ? (E.sel.name || E.sel.modelKey || E.sel.assemblyKey) : "";
    return;
  }
  var nm = root.querySelector("#mdSelName"), topologyCount = (E.topologySelection || []).length;
  var ownerFeature = inspectorHistoryFeature() || (topologyCount ? topologySelectionFeature() : null);
  if (nm) nm.textContent = (E.sel || ownerFeature) ? ((ownerFeature && (ownerFeature.name || ownerFeature.type)) || E.sel.name || E.sel.kind || E.sel.type || t("sketch")) + (topologyCount ? " · " + topologyCount + " " + (E.topologySelection[0].kind || "reference") + (topologyCount === 1 ? "" : "s") + " selected" : "") : "";

  inspectorDirty.sketch = true;
  inspectorDirty.shape = true;
  inspectorDirty.look = true;
  inspectorDirty.ops = true;

  var current = activeTab("R") || "shape";
  if (inspectorDirty[current]) {
    fillInspectorTab(current);
    inspectorDirty[current] = false;
  }
}

function modelParameterOverrides() {
  if (E.def && E.def.metadata && E.def.metadata.adapter === "cabinet") return {};
  var source = E.srcItem && E.srcItem.parameterOverrides || {};
  return Object.fromEntries(Object.entries(source).filter(function (entry) {
    return E.def && Object.prototype.hasOwnProperty.call(E.def.parameters || {}, entry[0]);
  }));
}

/* Coordinate cells are edits to the sketch, including its fixed anchor,
   rather than solver starting guesses. Preserve other relations and reject an
   edit they prevent, instead of silently snapping the displayed value back. */
function setSketchCenterCoordinate(point, axis, value, coordinateName) {
  var sketch=ensureSketch(E.def);
  if(!point || !["x","y"].includes(axis) || !fin(value))return false;
  var oldPoints=sketch.points.map(function(p){return {point:p,x:p.x,y:p.y};});
  var oldEntities=sketch.entities.map(function(entity){return {entity:entity,values:cloneData(entity)};});
  var anchors=(sketch.constraints || []).filter(function(rule){return rule.type==="fixed" && rule.point===point.id;});
  var oldAnchors=anchors.map(function(rule){return {rule:rule,had:Object.prototype.hasOwnProperty.call(rule,axis),value:rule[axis]};});
  anchors.forEach(function(rule){rule[axis]=value;});
  point[axis]=value;
  if(resolveSketch(true) && Math.abs(point[axis]-value)<=1e-7)return true;
  oldAnchors.forEach(function(old){if(old.had)old.rule[axis]=old.value;else delete old.rule[axis];});
  oldPoints.forEach(function(old){old.point.x=old.x;old.point.y=old.y;});
  oldEntities.forEach(function(old){Object.assign(old.entity,old.values);});
  resolveSketch(false);
  H.discard();
  var name=coordinateName || "center";
  flash("The "+name+" coordinate is controlled by another sketch relation. Edit that relation to move the "+name+".");
  return false;
}

function fillShape() {
  var host = root.querySelector("#mdInsp");
  host.innerHTML = "";
  fillCabinetParameters(host);
  var p = E.sel;
  var historyFeature = isCanonicalAuthoring() ? inspectorHistoryFeature() : null;
  if (!p && !historyFeature) { if (!E.def.metadata || E.def.metadata.adapter !== "cabinet") emptyState(host, "ph-cursor-click", t("noSel"), t("noSelHint")); return; }

  // Generated solids are read-only projections in a canonical document. The
  // editable source of truth is the feature definition in design history.
  if (isCanonicalAuthoring() && (historyFeature || (p.kind && !p.type))) {
    var pickedFeature=historyFeature || topologySelectionFeature();
    var featureId=pickedFeature ? pickedFeature.id : (p.derivedFeatureId || p.featureId);
    var feature=(E.def.features || []).find(function(item){return item.id===featureId;});
    if(feature){
      var spec=featureSpec(feature.type);
      host.appendChild(el("div","md-feature-form-title",'<i class="ph '+(spec && spec.icon || "ph-cube")+'"></i><span><b>'+(feature.name || feature.type)+'</b><small>Generated by design history</small></span>'));
      highlightFeatureIssueBanner(host, feature);
      host.appendChild(el("div","md-note","This solid is a derived preview. Edit the feature, its sketch, constraints, or dimensions to change it."));
      var primaryKeys=(feature.type==="thread"?["designation","mode","length","side","pitchMm","handedness"]:["endCondition","depth","radius","thickness","distance","angle","count","direction","operation"]).filter(function(key){var value=feature.params?.[key];return value!==undefined&&value!==null&&value!=="";});
      if(primaryKeys.length){var facts=el("div","md-feature-keyfacts");primaryKeys.slice(0,feature.type==="thread"?6:5).forEach(function(key){var fact=el("span","");var label=feature.type==="thread"?({designation:"Designation",mode:"Display",length:"Length (mm)",side:"Side",pitchMm:"Pitch (mm)",handedness:"Hand"}[key]):key.replace(/([a-z0-9])([A-Z])/g,"$1 $2"),value=feature.params[key];if(feature.type==="thread"&&key==="length")value=Number(value)*10;fact.appendChild(el("small","",label));fact.appendChild(el("b","",String(value)));facts.appendChild(fact);});host.appendChild(facts);}
      var advanced=el("details","md-feature-advanced");advanced.appendChild(el("summary","",t("advancedDiagnostics")));
      var summary=el("div","md-topology-selection");
      Object.keys(feature.params || {}).forEach(function(key){
        if(feature.params[key]===undefined)return;
        var row=el("div","md-topology-ref");
        var labelKey=key.replace(/([a-z0-9])([A-Z])/g,"$1 $2");
        row.appendChild(el("span","md-topology-kind",labelKey));
        var value=feature.params[key];
        var valStr=typeof value==="object"?JSON.stringify(value):String(value);
        var valEl=el("code","md-topology-id",valStr);
        valEl.title=valStr;
        row.appendChild(valEl);
        summary.appendChild(row);
      });
      (feature.references && feature.references.sketches || []).forEach(function(id){
        var row=el("div","md-topology-ref");
        row.appendChild(el("span","md-topology-kind","sketch"));
        var refVal=id.id || id;
        var valEl=el("code","md-topology-id",refVal);
        valEl.title=refVal;
        row.appendChild(valEl);
        summary.appendChild(row);
      });
      advanced.appendChild(summary);host.appendChild(advanced);
      host.appendChild(btn('<i class="ph ph-pencil-simple"></i> Edit feature in history',function(){openFeatureEditor(feature);},"md-wide btn-accent"));
      if ((E.topologySelection || []).length) {
        host.appendChild(el("div","md-note",E.topologySelection.length+" "+t("topologyRefs")+" "+t("selectedLabel")));
      }
      return;
    }
  }

  // a part you can name is a part you can find again in a twenty-part model
  // (a bare sketch point is identified by where it is, so it gets no name row)
  var isPoint = p.type === undefined && p.kind === undefined && "x" in p && "y" in p;
  if (!isPoint) {
  var nameRow = el("label", "md-row md-row-wide");
  nameRow.appendChild(el("span", "t", t("partName")));
  var nameInp = el("input");
  nameInp.type = "text";
  nameInp.value = p.name || p.kind || p.type;
  nameInp.addEventListener("change", function () {
    pushUndo(t("partName"));
    p.name = nameInp.value.slice(0, 80) || p.kind || p.type;
    refreshParts();
    var nm = root.querySelector("#mdSelName");
    if (nm) nm.textContent = p.name;
  });
  nameRow.appendChild(nameInp);
  host.appendChild(nameRow);
  if (p.exactPending) host.appendChild(el("div", "md-note", "⏳ " + t("exactBuilding")));
  else if (p.exactError) host.appendChild(el("div", "md-note md-note-error", "⚠ " + t("exactFailed") + " · " + p.exactError));
  else if (p.meshData) host.appendChild(el("div", "md-note", "✓ " + t("exactReady")));
  if ((E.topologySelection || []).length) {
    host.appendChild(el("h5", "md-h5", t("topologySelection")));
    var topologyCard = el("div", "md-topology-selection");
    E.topologySelection.forEach(function (reference) {
      var row = el("div", "md-topology-ref");
      row.appendChild(el("span", "md-topology-kind", reference.kind));
      var label = el("code", "md-topology-id", reference.semantic || reference.persistentId);
      label.title = reference.persistentId;
      row.appendChild(label);
      topologyCard.appendChild(row);
    });
    topologyCard.appendChild(btn(t("clearTopologySelection"), function () { E.topologySelection = []; refreshSelection(); }, "md-wide"));
    host.appendChild(topologyCard);
  }
  }

  var grid = el("div", "md-prop-grid");
  var importRecognition=E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition;
  if(importRecognition && importRecognition!=="none" && E.def.parameters){host.appendChild(el("h5","md-h5","Recognized feature parameters"));Object.values(E.def.parameters).filter(function(parameter){return parameter && parameter.adjustable!==false && parameter.exposure!=="internal" && typeof parameter.value==="number";}).forEach(function(parameter){numRow(grid,parameter.label || parameter.name,function(){return parameter.value;},function(value){parameter.value=parameter.step===1?Math.round(value):value;regenerateExactModel(false);},parameter.step || .1);});}
  if (p.type === "line") {
    var linePts = sketchLinePoints(p), pa = linePts.a, pb = linePts.b;
    numLengthRow(grid, "U1", function () { return pa.x; }, function (v) { setSketchCenterCoordinate(pa,"x",v,"point"); }, 0.1);
    numLengthRow(grid, "V1", function () { return pa.y; }, function (v) { setSketchCenterCoordinate(pa,"y",v,"point"); }, 0.1);
    numLengthRow(grid, "U2", function () { return pb.x; }, function (v) { setSketchCenterCoordinate(pb,"x",v,"point"); }, 0.1);
    numLengthRow(grid, "V2", function () { return pb.y; }, function (v) { setSketchCenterCoordinate(pb,"y",v,"point"); }, 0.1);
    numLengthRow(grid, t("constraintLength"), function () { return Math.hypot(pb.x - pa.x, pb.y - pa.y); }, function (v) { setLineConstraint(p, "distance", Math.max(1e-6, v)); }, 0.1, "length");
    numRow(grid, t("constraintAngle"), function () { return (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI; }, function (v) { setLineConstraint(p, "angle", v); }, 0.1);
    numRow(grid, t("wallWidth"), function () { return p.weight || 1; }, function (v) { p.weight = clamp(v, 1, 6); }, 0.1);
  } else if (p.type === "circle" || p.type === "arc") {
    var oc = circleData(p, new Map((ensureSketch(E.def).points || []).map(function (q) { return [q.id, q]; })));
    if (oc) {
      numLengthRow(grid, "Center U", function () { return oc.center.x; }, function (v) { setSketchCenterCoordinate(oc.center,"x",v); }, 0.1);
      numLengthRow(grid, "Center V", function () { return oc.center.y; }, function (v) { setSketchCenterCoordinate(oc.center,"y",v); }, 0.1);
      // an arc's radius is carried by its rim points, so the driver is the
      // radius dimension rather than a stored scalar
      if (p.type === "circle") numLengthRow(grid, "R", function () { return p.r; }, function (v) { setEntityDimension(p,"radius",Math.max(1e-6,v)); }, 0.1);
      else numLengthRow(grid, "R", function () { return oc.radius; }, function (v) { setEntityDimension(p, "radius", Math.max(1e-6, v)); }, 0.1);
    }
  } else if (p.type === "ellipse") {
    var oe = ellipseData(p, new Map((ensureSketch(E.def).points || []).map(function (q) { return [q.id, q]; })));
    if (oe) {
      numLengthRow(grid, "Center U", function () { return oe.center.x; }, function (v) { setSketchCenterCoordinate(oe.center,"x",v); }, 0.1);
      numLengthRow(grid, "Center V", function () { return oe.center.y; }, function (v) { setSketchCenterCoordinate(oe.center,"y",v); }, 0.1);
      // Retarget the matching driving radius, including legacy major dimensions without axis.
      numLengthRow(grid, t("dyn_major"), function () { return p.rx; }, function (v) { setEntityDimension(p,"radius",Math.max(1e-6, v),"major"); }, 0.1);
      numLengthRow(grid, t("dyn_minor"), function () { return p.ry; }, function (v) { setEntityDimension(p,"radius",Math.max(1e-6, v),"minor"); }, 0.1);
      numRow(grid, t("constraintAngle"), function () { return ((Number(p.rot) || 0) * 180) / Math.PI; },
        function (v) { p.rot = (v * Math.PI) / 180; resolveSketch(false); }, 0.5);
    }
  } else if (p.type === "point" || p.type === "spline") {
    var sketch = ensureSketch(E.def);
    var pointIds = p.type === "point" ? [p.p] : [p.a, p.h1, p.h2, p.b].concat(p.pts || []);
    Array.from(new Set(pointIds)).forEach(function (id, index) {
      var point = sketchPoint(sketch, id);
      if (!point) return;
      var prefix = p.type === "point" ? "" : (index + 1) + " ";
      numLengthRow(grid, prefix + "U", function () { return point.x; }, function (v) { setSketchCenterCoordinate(point,"x",v,"point"); }, 0.1);
      numLengthRow(grid, prefix + "V", function () { return point.y; }, function (v) { setSketchCenterCoordinate(point,"y",v,"point"); }, 0.1);
    });
  } else if (p.type === undefined && "x" in p && "y" in p && p.id) {
    numLengthRow(grid, "U", function () { return p.x; }, function (v) { setSketchCenterCoordinate(p,"x",v,"point"); }, 0.1);
    numLengthRow(grid, "V", function () { return p.y; }, function (v) { setSketchCenterCoordinate(p,"y",v,"point"); }, 0.1);
  } else if (p.kind === "box") {
    numLengthRow(grid, "X", function () { return (p.x0 + p.x1) / 2; }, function (v) { var w = p.x1 - p.x0; p.x0 = v - w / 2; p.x1 = v + w / 2; });
    numLengthRow(grid, "Y", function () { return p.y0; }, function (v) { var h = p.y1 - p.y0; p.y0 = v; p.y1 = v + h; });
    numLengthRow(grid, "Z", function () { return (p.z0 + p.z1) / 2; }, function (v) { var d = p.z1 - p.z0; p.z0 = v - d / 2; p.z1 = v + d / 2; });
    numLengthRow(grid, "W", function () { return p.x1 - p.x0; }, function (v) { var c = (p.x0 + p.x1) / 2; p.x0 = c - v / 2; p.x1 = c + v / 2; });
    numLengthRow(grid, "H", function () { return p.y1 - p.y0; }, function (v) { p.y1 = p.y0 + v; });
    numLengthRow(grid, "D", function () { return p.z1 - p.z0; }, function (v) { var c = (p.z0 + p.z1) / 2; p.z0 = c - v / 2; p.z1 = c + v / 2; });
  } else if (p.kind === "cyl") {
    numLengthRow(grid, "X", function () { return p.x; }, function (v) { p.x = v; });
    numLengthRow(grid, "Y", function () { return p.y; }, function (v) { p.y = v; });
    numLengthRow(grid, "Z", function () { return p.z; }, function (v) { p.z = v; });
    numLengthRow(grid, "R", function () { return p.r; }, function (v) { p.r = Math.max(0.5, v); });
    numLengthRow(grid, "R2", function () { return p.r2 != null ? p.r2 : p.r; }, function (v) { p.r2 = Math.max(0, v); });
    numLengthRow(grid, "H", function () { return p.h; }, function (v) { p.h = Math.max(0.5, v); });
  } else if (p.kind === "sph") {
    numLengthRow(grid, "X", function () { return p.x; }, function (v) { p.x = v; });
    numLengthRow(grid, "Y", function () { return p.y; }, function (v) { p.y = v; });
    numLengthRow(grid, "Z", function () { return p.z; }, function (v) { p.z = v; });
    numLengthRow(grid, "R", function () { return p.r; }, function (v) { p.r = Math.max(0.5, v); });
  } else if (p.kind === "rev") {
    numLengthRow(grid, "X", function () { return p.x; }, function (v) { p.x = v; });
    numLengthRow(grid, "Z", function () { return p.z; }, function (v) { p.z = v; });
    numRow(grid, "Seg", function () { return p.seg || 32; }, function (v) { p.seg = clamp(Math.round(v), 6, 96); });
  } else if (p.kind === "ext" || p.kind === "loft") {
    numLengthRow(grid, t("base"), function () { return Math.min(p.from, p.to); }, function (v) { var d = Math.abs(p.to - p.from); p.from = v; p.to = v + d; });
    numLengthRow(grid, t("depth"), function () { return Math.abs(p.to - p.from); }, function (v) { p.to = p.from + Math.max(0.5, v); });
  }
  host.appendChild(grid);
  if (isSketchObject(p)) {
    var si = E.solveInfo || solveSketch(ensureSketch(E.def));
    host.appendChild(el("div", "md-note", t("constraintDriven") + " · " + si.status + " · DOF " + si.degreesOfFreedom));
  }
  if (p.kind === "ext" || p.kind === "loft" || p.kind === "rev")
    host.appendChild(el("div", "md-note", t("dimHint") + " · " + t("vertexHint")));
}

/* The sketch pane is the sketcher's cockpit: how defined the sketch is, the
   constraints you can apply to what is selected right now, and the list of
   rules already on it — every one of them editable and removable, because a
   constraint you cannot delete is a constraint you will redraw around. */
function appendSketchGeometryList(host, sketch) {
  var details=el("details", "md-sketch-geometry");
  details.open=!!E.sketchGeometryOpen;
  details.addEventListener("toggle",function(){E.sketchGeometryOpen=details.open;});
  var summary=el("summary");summary.textContent=t("sketchGeometry");details.appendChild(summary);
  var hint=el("div","md-note");hint.textContent=t("sketchGeometryHint");details.appendChild(hint);
  function pick(object,label) {
    var button=el("button","md-wide md-geometry-pick");button.type="button";button.textContent=label;
    button.dataset.sketchObjectId=String(object.id);
    button.dataset.sketchObjectKind=object.type || "point";
    button.setAttribute("aria-pressed",String(E.ssel.includes(object)));
    button.addEventListener("click",function(event){
      event.preventDefault();
      event.stopPropagation();
      var pane=button.closest(".md-pane"),scrollTop=pane ? pane.scrollTop : 0;
      selectSketch(object,event.ctrlKey||event.metaKey||event.shiftKey||E.mobileAddSelection);
      // This is selection-only: keep the exact solver run and keep the
      // inspector at the row the user is working through while its enabled
      // relation buttons are rebuilt around the new selection.
      refreshSelection();
      var nextPane=root && root.querySelector('#mdRightPanel .md-pane[data-pane="sketch"]');
      if(nextPane)nextPane.scrollTop=scrollTop;
    });
    details.appendChild(button);
  }
  var coord=function(point){return "("+modelLengthText(point.x,9)+", "+modelLengthText(point.y,9)+") "+modelLengthUnit();};
  var listedPoints=new Set();
  sketch.entities.forEach(function(entity,index){
    pick(entity,(entity.name||entity.type)+" "+(index+1)+(entity.construction?" · "+t("tool_constr"):""));
    entityPoints(sketch,entity).forEach(function(point,pointIndex){
      listedPoints.add(point.id);
      pick(point,t("sketchPointLabel")+" "+(index+1)+"."+(pointIndex+1)+" · "+coord(point));
    });
  });
  sketch.points.filter(function(point){return !listedPoints.has(point.id);}).forEach(function(point,index){
    pick(point,t("sketchPointLabel")+" "+(index+1)+" · "+coord(point));
  });
  host.appendChild(details);
}

function syncCommittedSketchPlane(sketch) {
  E.def.activeSketch=sketch.id;E.view=sketch.plane;
  (E.def.history || []).forEach(function(entry){if(entry.kind==="sketch" && entry.targetId===sketch.id)entry.name=sketch.name;});
  E.poly=null;E.arcPts=null;E.wallPts=null;E.drag=null;E.dimPick=[];E.dimSel=null;
  if(E.authoring?.phase==="sketch"){E.authoring.referenceId=sketch.referenceId;E.authoring.sketchId=sketch.id;}
  E.lastSketchReferenceId=sketch.referenceId;
  invalidateSketchProjection();syncModelPlane();
  if(E.mode==="3d" && E.modelPlaneActive)orientModelToView(true);
  syncTools();
}

function surfaceUVGuide(sketch) {
  if(sketch.frameSpace!=="surface-uv")return "";
  var domain=cylinderUVDomain(sketch.surface?.descriptor);if(!domain)return "";
  var guide="U wraps every "+modelLengthText(domain.uPeriod,6)+" "+modelLengthUnit()+".";
  if(domain.vRange)guide+=" V on this face: "+modelLengthText(domain.vRange[0],6)+" to "+modelLengthText(domain.vRange[1],6)+" "+modelLengthUnit()+" from the surface origin. Values outside this range leave the selected face.";
  return guide;
}

function fillSketchPane() {
  var host = root && root.querySelector("#mdSketch");
  if (!host) return;
  host.innerHTML = "";
  var sketch = ensureSketch(E.def);
  var si = E.solveInfo || (E.solveInfo = solveSketch(sketch));
  var pending=(sketch.repairs||[]).filter(r=>r.status==="pending").length;if(pending)host.appendChild(btn(t("sketchRepair")+" · "+pending,openSketchRepairs,"md-settings-btn"));
  var profileInfo = sketchProfileAnalysis();
  var uvGuide=surfaceUVGuide(sketch);
  if(uvGuide){var guide=el("p", "md-feature-hint");guide.textContent=uvGuide;host.appendChild(guide);}

  if (!sketch.entities.length && !sketch.points.length) {
    emptyState(host, "ph-compass-tool", t("noSketch"), t("noSketchHint"));
    // variables belong to the document, not to any one sketch, so they stay
    // reachable before the first line is drawn
    buildEquationList(host);
    syncDofBadge();
    return;
  }

  // status: the headline every CAD sketcher puts in the status bar
  var statusText =
    si.status === "fully-constrained" ? t("dofFull") :
    si.status === "conflicting" ? t("dofConflict") :
    si.status === "over-constrained" ? t("dofOver") :
    t("dofUnder") + " " + si.degreesOfFreedom;
  var badge = el("div", "md-dof md-dof-" + si.status, '<i class="ph ' +
    (si.status === "fully-constrained" ? "ph-lock-simple" : si.status === "under-constrained" ? "ph-arrows-out-cardinal" : "ph-warning") +
    '"></i> ' + statusText);
  host.appendChild(badge);
  highlightSketchIssueBanner(host, sketch);
  var sketchMetrics = el("div", "md-sketch-metrics");
  sketchMetrics.appendChild(el("span", "", '<b>' + sketch.entities.length + '</b><small>' + t("entitiesLabel") + '</small>'));
  sketchMetrics.appendChild(el("span", "", '<b>' + sketch.constraints.filter(function (c) { return !c.suppressed; }).length + '</b><small>' + t("constraints") + '</small>'));
  sketchMetrics.appendChild(el("span", "", '<b>' + sketch.constraints.filter(function (c) { return c.value != null && !c.suppressed; }).length + '</b><small>' + t("dimensionsLabel") + '</small>'));
  host.appendChild(sketchMetrics);
  if (si.conflicts.length) {
    /* The list is a minimal failing set, so removing any one member lets the
       rest solve. Remove the newest — usually the relation just added — rather
       than deleting every relation that happened to be carrying error. */
    var conflicted = sketch.constraints.filter(function (constraint) { return si.conflicts.indexOf(constraint.id) >= 0; });
    var newest = conflicted[conflicted.length - 1];
    if (newest) {
      var removeNewest = btn('<i class="ph ph-warning"></i> ' + t("removeNewestConflict") + ": " + constraintCaption(newest, sketch), function () {
        pushUndo(t("removeConflicts"));
        sketch.constraints = sketch.constraints.filter(function (constraint) { return constraint !== newest; });
        resolveSketch(false); refreshAll();
      }, "md-wide btn-danger");
      removeNewest.title = t("conflictSet") + ": " + conflicted.map(function (c) { return constraintCaption(c, sketch); }).join(", ");
      host.appendChild(removeNewest);
    }
  }

  // Crossing geometry encloses area without ever closing a chain; the pane
  // reports that as usable rather than as a branch the user has to repair.
  var regionRun = sketchRegionAnalysis(), regionCount = (regionRun.regions || []).length;
  var presentation=sketchProfilePresentation(sketch,profileInfo,regionCount);
  var profileStatus=presentation.status,profileText=t(presentation.textKey);
  var profileCard = el("div", "md-profile-state md-profile-" + profileStatus);
  profileCard.appendChild(el("div", "md-profile-head", '<i class="ph ' +
    presentation.icon + '"></i><b>' + profileText + "</b>"));
  var profileStats = el("div", "md-profile-stats");
  profileStats.appendChild(el("span", "", profileInfo.profiles.length + " " + t("profileLoops")));
  if (regionCount) profileStats.appendChild(el("span", "", regionCount + " " + t("profileRegions")));
  if (profileInfo.openEnds.length) {
    var endsStat=el("span", "", profileInfo.openEnds.length + " " + t(presentation.pathEnds ? "profilePathEnds" : "profileEnds"));
    endsStat.setAttribute("data-profile-ends","");profileStats.appendChild(endsStat);
  }
  if (profileInfo.branchPoints.length) profileStats.appendChild(el("span", "", profileInfo.branchPoints.length + " × " + t("profileBranched")));
  profileCard.appendChild(profileStats);
  if (profileInfo.nearMergeCount) {
    profileCard.appendChild(btn('<i class="ph ph-arrows-in"></i> ' + t("profileHeal"), function () {
      pushUndo(t("profileHeal"));
      var ids = sketch.entities.filter(function (e) { return !e.construction && (e.type === "line" || e.type === "arc" || (e.type === "spline" && e.degree === 3)); }).map(function (e) { return e.id; });
      var count = healSketchEndpoints(sketch, ids, profileInfo.tolerance);
      if (!count) { H.discard(); return; }
      E.ssel = []; E.sel = null;
      resolveSketch(false);
      flash("✓ " + count + " · " + t("profileHealed"));
      refreshAll();
    }, "md-profile-heal"));
  }
  if(sketch.entities.length)host.appendChild(profileCard);
  else host.appendChild(el("p","md-field-hint","Positioning points define feature locations. Select a point in Sketch geometry to edit its coordinates; a closed solid profile is not required for Hole positions."));
  if (sketch.points.length) host.appendChild(btn("Translate sketch geometry", function () {
    openQuickForm({action:"translatesketch",title:"Translate sketch geometry",hint:"Move every sketch point and its fixed anchors together. Dimensions and shape stay the same.",fields:[
      {key:"dx",label:"Horizontal shift",type:"number",value:0,unit:"length"},
      {key:"dy",label:"Vertical shift",type:"number",value:0,unit:"length"}
    ],onApply:function(values){
      var dx=Number(values.dx),dy=Number(values.dy);
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||(!dx&&!dy))return false;
      if(sketch.constraints.some(function(c){return !c.suppressed&&["onModelEdge","pierce","intersection"].includes(c.type);})){
        flash("Detach external sketch relations before translating the sketch.");return false;
      }
      pushUndo("Translate sketch geometry");
      var previousPoints=cloneData(sketch.points),previousConstraints=cloneData(sketch.constraints);
      translateSketchGeometry(sketch,dx,dy);
      if(!resolveSketch(true)){
        sketch.points=previousPoints;sketch.constraints=previousConstraints;
        E.ssel=[];resolveSketch(false);H.discard();
        flash("Sketch translation conflicts with its constraints.");refreshAll();return false;
      }
      E.ssel=[];refreshAll();return true;
    }});
  },"md-wide"));
  appendSketchGeometryList(host, sketch);
  if (E.ssel.length) {
    var selectionCard = el("div", "md-selection-info");
    selectionCard.appendChild(el("i", "ph ph-selection"));
    selectionCard.appendChild(el("span", "", sketchSelectionSummary()));
    selectionCard.appendChild(el("kbd", "", "Ctrl+A"));
    host.appendChild(selectionCard);
    if(selPoints().length===1 && selectedModelEdges().length===1) {
      host.appendChild(btn("Intersect model surface",function(){openSurfaceSectionIntersection(sketch,selPoints()[0],selectedModelEdges()[0]);},"md-wide"));
    }
    if (selEntities().length === 1 && selEntities()[0].type === "arc" && !selPoints().length) {
      host.appendChild(btn("Reverse arc", function () {
        var arc = selEntities()[0];
        if (!arc || arc.type !== "arc") return;
        pushUndo("Reverse arc");
        var start = arc.a;
        arc.a = arc.b;
        arc.b = start;
        // Point identities and all endpoint relations stay attached. Swapping
        // the rim endpoints selects the complementary counter-clockwise sweep.
        resolveSketch(false);
        refreshAll();
      }, "md-wide"));
    }
    if (selPoints().length === 1 && !selEntities().length) {
      host.appendChild(btn("Set point coordinates", function () {
        var point=selPoints()[0];if(!point)return;
        openSketchPointCoordinates(sketch,point);
      },"md-wide"));
      host.appendChild(btn("Pierce curve",function(){
        /* Pierce to a helix snaps the sketch onto its start or end; pierce to a
           line or arc of another sketch is a relation (HOUSING HandleProfile on
           HandlePath), re-found where that curve crosses this plane. */
        var anchor=selPoints()[0],curves=(E.def.referenceGeometry || []).filter(function(r){return r.type==="reference_helix";});
        var sketchCurves=[];(E.def.sketches || []).forEach(function(other){if(other.id===sketch.id)return;(other.entities || []).forEach(function(entity){if(entity.construction||!["line","arc","circle"].includes(entity.type))return;try{bindPierceTargets({...sketch,constraints:[{type:"pierce",sketchId:other.id,entityId:entity.id}]},E.def.sketches,sketchWorldPoint);sketchCurves.push({value:"sketch:"+other.id+":"+entity.id,label:(other.name || other.id)+" · "+entity.type+" "+entity.id,sketchId:other.id,entityId:entity.id});}catch(error){/* only curves that cross this plane */}});});
        if(!anchor || (!curves.length && !sketchCurves.length)){flash(t("pierceNeed"));return;}
        var choices=sketchCurves.concat(curves.map(function(r){return {value:r.id,label:r.name};}));
        openQuickForm({action:"piercecurve",title:t("cPierce"),hint:"Attach the selected point to where a curve crosses this sketch plane.",fields:[
          {key:"curve",label:"Curve",type:"select",value:choices[0].value,choices:choices.map(function(c){return {value:c.value,label:c.label};})},
          {key:"position",label:"Helix position",type:"select",value:"0",choices:[{value:"0",label:"Start"},{value:"1",label:"End"}]}
        ],onApply:function(values){try{
          var sketchCurve=sketchCurves.find(function(c){return c.value===values.curve;});
          if(sketchCurve){
            pushUndo(t("cPierce"));
            sketch.constraints=(sketch.constraints || []).filter(function(c){return !(c.type==="pierce"&&c.point===anchor.id);});
            sketch.constraints.push({id:uid(),type:"pierce",point:anchor.id,sketchId:sketchCurve.sketchId,entityId:sketchCurve.entityId});
            if(!resolveSketch(true)){flash(t("pierceConflict"));return false;}
            refreshAll();return true;
          }
          var curve=curves.find(function(r){return r.id===values.curve;}),next=pierceSketchToHelix(sketch,anchor.id,curve,Number(values.position));
          next.pierce={anchorId:anchor.id,helixId:curve.id,featureId:curve.featureId,position:Number(values.position)};
          if(!next.constraints.some(function(c){return c.type==="fixed"&&c.point===anchor.id;})){var point=next.points.find(function(p){return p.id===anchor.id;});next.constraints.push({id:uid(),type:"fixed",point:anchor.id,x:point.x,y:point.y});}
          pushUndo("Pierce curve");Object.assign(sketch,next);resolveSketch(false);refreshAll();return true;
        }catch(error){flash(error.message);return false;}}});
      },"md-wide"));
      host.appendChild(btn("Place at sketch origin", function () {
        var point = selPoints()[0];
        if (!point) return;
        pushUndo("Place at sketch origin");
        var previous = sketch.constraints.slice();
        sketch.constraints = sketch.constraints.filter(function (c) {
          return !(c.type === "fixed" && c.point === point.id);
        });
        var originRule = { id:uid(), type:"fixed", point:point.id, x:0, y:0 };
        sketch.constraints.push(originRule);
        if (!resolveSketch(true)) {
          var originWhy = explainSketchConflict(sketch, { keep: [originRule.id] });
          var originSubject = constraintCaption(originRule, sketch);
          sketch.constraints = previous;
          resolveSketch(false);
          H.discard();
          showSketchRefusal(sketch, originSubject, [originRule.id], originWhy);
        }
        refreshAll();
      }, "md-wide"));
    }
  }

  /* Which plane this sketch lives on, and how far off it. Moving a sketch to
     another plane is a real edit — every solid it drives extrudes along the new
     normal — so it sits here with the rest of the sketch's own properties. */
  var planeRow = el("label", "md-row md-row-wide");
  planeRow.appendChild(el("span", "t", t("sketchPlane")));
  var planeSel = el("select");
  var planeDisplay=sketchPlaneDisplay(sketch,E.def.references || [],{face:t("facePrefix"),reference:referenceLabel});
  if(planeDisplay.kind==="face" || planeDisplay.kind==="frame"){
    var frameOption=el("option","",planeDisplay.label);
    frameOption.value=planeDisplay.value;frameOption.selected=true;frameOption.disabled=true;
    planeSel.appendChild(frameOption);
  }
  var attachedPlane = sketch.referenceId && !/^plane:(top|front|right)$/.test(sketch.referenceId)
    ? (E.def.references || []).find(function (reference) { return reference.id === sketch.referenceId; })
    : null;
  (E.def.references || []).filter(function(reference){return reference.type==="plane" && !["plane:top","plane:front","plane:right"].includes(reference.id);}).forEach(function(reference){
    var attachedOption = el("option", "", referenceLabel(reference));
    attachedOption.value = reference.id;
    attachedOption.selected = planeDisplay.kind==="reference" && reference.id===attachedPlane?.id;
    planeSel.appendChild(attachedOption);
  });
  [["top", t("view_top")], ["front", t("view_front")], ["side", t("view_side")]].forEach(function (o) {
    var opt = el("option", "", o[1]);
    opt.value = o[0];
    if (planeDisplay.kind==="principal" && sketch.plane === o[0]) opt.selected = true;
    planeSel.appendChild(opt);
  });
  planeSel.addEventListener("change", function () {
    pushUndo(t("sketchPlane"));
    var chosenReference=(E.def.references || []).find(function(reference){return reference.id===planeSel.value;});
    if(chosenReference){
      reassignSketchPlane(sketch,chosenReference,referencePlaneView(chosenReference));
      sketch.name=referenceLabel(chosenReference)+" sketch";
    }else{
      var principalId=planeSel.value==="side" ? "plane:right" : "plane:"+planeSel.value;
      reassignSketchPlane(sketch,{id:principalId,type:"plane"},planeSel.value);
      sketch.name=planeLabel(sketch.plane)+" sketch";
    }
    synchronizeSketchExtrusionFrames(E.def,sketch.id);
    syncCommittedSketchPlane(sketch);
    refreshAll();
  });
  planeRow.appendChild(planeSel);
  host.appendChild(planeRow);

  if (sketch.support) {
    var supportCard=el("div","md-topology-selection");
    var supportRow=el("div","md-topology-ref");
    supportRow.appendChild(el("span","md-topology-kind","support face"));
    var supportLabel=el("code","md-topology-id",sketch.support.semantic || sketch.support.persistentId);
    supportLabel.title=sketch.support.persistentId;
    supportRow.appendChild(supportLabel); supportCard.appendChild(supportRow);
    supportCard.appendChild(btn("Detach to principal plane",function(){
      pushUndo(t("sketchPlane"));
      sketch.referenceId=sketch.plane==="side" ? "plane:right" : "plane:"+sketch.plane;
      delete sketch.support; delete sketch.frame; delete sketch.frameSpace; delete sketch.frameAnchor; delete sketch.supportOffset;
      refreshAll();
    },"md-wide"));
    if(sketch.frameSpace==="local" && sketch.frameAnchor!=="bounds-center" && sketch.support.descriptor?.bounds){
      supportCard.appendChild(btn("Anchor sketch origin to face bounds",function(){
        pushUndo("Anchor face sketch origin");
        sketch.frameAnchor="bounds-center";
        sketch.frame=realignFrame(sketch.frame,faceFrameOrigin(sketch.support.descriptor,"bounds-center"),sketch.support.descriptor.normal);
        refreshAll();flash("✓ Sketch origin anchored to face bounds");
      },"md-wide"));
    }
    host.appendChild(supportCard);
  }

  (sketch.boundaryCopies || []).forEach(function(copy){
    var linked=btn(copy.associative ? "Boundary linked to source face" : "Link boundary to source face",async function(){
      if(copy.associative)return;
      if(!E.brepRun)await regenerateExactModel();
      var features=E.def.features || [],consumer=features.findIndex(function(feature){return feature.params?.sketchId===sketch.id;});
      var sourceId=consumer>0?features[consumer-1].id:copy.source.ownerFeatureId;
      var result=E.brepRun?.results.get(sourceId);
      var resolution=result && resolveTopologyReference(copy.source,createTopologyRegistry(result.topology || []));
      if(!resolution?.topology){flash("The boundary source face could not be resolved");return;}
      pushUndo("Link face boundary");
      copy.source=topologyReferenceFromEntry(resolution.topology);copy.source.ownerFeatureId=sourceId;copy.associative=true;
      sketch.support=cloneData(copy.source);sketch.referenceId=copy.source.persistentId;
      sketch.frame=realignFrame(sketch.frame,copy.source.descriptor.origin,copy.source.descriptor.normal);
      refreshAll();await regenerateExactModel();refreshAll();
    },"md-wide");
    linked.disabled=!!copy.associative;host.appendChild(linked);
  });

  var attachSupport=async function(attachment){
    if(!attachment || attachment.surface){flash("Select a planar face first");return;}
    var features=E.def.features || [],ownerIndex=features.findIndex(function(feature){return feature.id===attachment.support.ownerFeatureId;});
    var consumerIndex=features.findIndex(function(feature){return feature.params?.sketchId===sketch.id || (feature.references?.sketches || []).includes(sketch.id);});
    if(consumerIndex>=0 && ownerIndex>=consumerIndex){flash("Select a face from before this sketch in the history");return;}
    pushUndo("Attach sketch to face");
    reattachSketchSupport(sketch,attachment);
    refreshAll();
    if(isCanonicalAuthoring()){await regenerateExactModel();refreshAll();}
    flash("✓ Sketch attached to selected face");
  };
  var attachFace=btn("Attach to selected face",function(){attachSupport(faceSketchAttachment());},"md-wide");
  host.appendChild(attachFace);

  /* The face at the bottom of a narrow shell may be hidden behind its neck.
     Offer the same exact topology IDs the viewport can pick, limited to
     features before this sketch, so reattachment remains a history edit. */
  var history=E.def.features || [];
  var consumerAt=history.findIndex(function(feature){return feature.params?.sketchId===sketch.id || (feature.references?.sketches || []).includes(sketch.id);});
  var before=consumerAt<0 ? history : history.slice(0,consumerAt);
  var allowed=new Set(before.map(function(feature){return feature.id;}));
  var supportChoices=planarMateFaceChoices((E.def.parts || []).flatMap(topologyEntriesForPart).filter(function(entry){
    return allowed.has(entry.ownerFeatureId) || allowed.has(String(entry.ownerFeatureId).replace(/:tool$/, ""));
  }),before,modelLengthUnit());
  if(supportChoices.length){
    var supportSelect=document.createElement("select");
    supportSelect.setAttribute("aria-label",t("sketchSupportFace"));
    var placeholder=document.createElement("option");placeholder.value="";placeholder.textContent=t("sketchSupportFace");supportSelect.appendChild(placeholder);
    supportChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;supportSelect.appendChild(option);});
    supportSelect.value=sketch.support?.persistentId || "";
    var supportPicker=el("label","md-row md-row-wide");
    supportPicker.appendChild(el("span","t",t("sketchSupportFace")));
    supportPicker.appendChild(supportSelect);host.appendChild(supportPicker);
    host.appendChild(btn(t("attachChosenFace"),function(){
      var choice=supportChoices.find(function(item){return item.entry.persistentId===supportSelect.value;});
      if(!choice){flash(t("sketchSupportFace"));return;}
      attachSupport(faceSketchAttachment(topologyReferenceFromEntry(choice.entry),true));
    },"md-wide"));
  }

  var grid = el("div", "md-prop-grid");
  addSketchOffsetControl(grid,sketch.id);
  host.appendChild(grid);

  host.appendChild(el("h5", "md-h5", t("constraints")));
  var pal = el("div", "md-ops md-cons-pal");
  CONSTRAINT_DEFS.forEach(function (d) {
    var fits = constraintFits(d.id);
    var b = btn('<i class="ph ' + d.icon + '"></i> ' + t(d.label), function () { applyConstraint(d.id); });
    b.setAttribute("data-constraint", d.id);
    b.disabled = !fits;
    b.title = t(d.label) + " — " + d.need;
    pal.appendChild(b);
  });
  host.appendChild(pal);
  host.appendChild(el("div", "md-note", t("selHint")));

  if (profileInfo.profiles.length) {
    host.appendChild(btn('<i class="ph ph-cube"></i> ' + t("opExtrude"), function(){openParametricFeature("extrude");}, "md-wide btn-accent"));
  }

  host.appendChild(el("h5", "md-h5", t("constraintList")));
  var list = el("div", "md-cons-list");
  (sketch.constraints || []).forEach(function (con) {
    var refusedHint = refusalHint(sketch);
    var row = el("div", "md-cons-row" + (si.conflicts.indexOf(con.id) >= 0 || (refusedHint && refusedHint.indexOf(con.id) >= 0) ? " bad" : "") + (con.suppressed ? " off" : ""));
    if (con.exprError) { row.classList.add("bad"); row.title = con.exprError; }
    // The value field holds the expression once a dimension is driven by one,
    // so the resolved number gets its own readout at the end of the row rather
    // than being crammed into a label that then truncates.
    // "Tangent (Line2, Arc1)", the way SOLIDWORKS lists relations; the raw type stays in the tooltip
    var rowLabel = el("span", "n", "");
    rowLabel.textContent = con.value != null
      ? [DIMENSION_SYMBOLS[con.type] || "↔"].concat(relationSubjects(sketch, con, sketchInstanceNames(sketch, instanceLabels()))).join(" · ")
      : constraintCaption(con, sketch);
    rowLabel.title = con.type;
    row.appendChild(rowLabel);

    // A driving dimension is editable in place; geometric rules have no value.
    // The field takes a number or an expression — typing `Width / 2` here is
    // what links one dimension to another.
    if (con.value != null) {
      var nameInp = el("input", "md-dim-name");
      nameInp.type = "text";
      nameInp.value = con.name || "";
      nameInp.placeholder = t("dimName");
      nameInp.title = t("dimName");
      nameInp.addEventListener("change", function () {
        var next = nameInp.value.trim();
        if (next && !nameAvailable(E.def, next, con)) { flash(t("badName")); nameInp.value = con.name || ""; return; }
        pushUndo(t("dimName"));
        if (next) con.name = next; else delete con.name;
        resolveSketch(false);
        refreshAll();
      });
      row.appendChild(nameInp);

      var inp = el("input", "md-dim-value");
      inp.type = "text";
      inp.disabled = !!con.driven;
      inp.value = con.expr != null && String(con.expr).trim() ? String(con.expr)
        : dimensionUnit(con) === 'angle' ? String(con.value) : modelLengthText(Number(con.value),12);
      inp.title = t("eqHelp");
      inp.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      });
      inp.addEventListener("change", function () {
        var text = inp.value.trim();
        var entered;
        try {
          entered = parseSketchDimensionEntry(text, con, modelLengthUnit(), function (ref) {
            var entry = collectSymbols(E.def).get(ref);
            return entry ? Number(entry.node.value) : undefined;
          });
        } catch (error) { flash(String(error.message || error)); inp.value = con.expr || (dimensionUnit(con)==='angle' ? String(con.value) : modelLengthText(Number(con.value),12)); return; }
        pushUndo(t("opDim"));
        var oldValue = con.value, oldExpr = con.expr;
        con.value = entered.value;
        if (entered.expr == null) delete con.expr; else con.expr = entered.expr;
        if (!resolveSketch(true)) {
          var valueWhy = explainSketchConflict(sketch, { keep: [con.id] });
          con.value = oldValue;
          if (oldExpr == null) delete con.expr; else con.expr = oldExpr;
          resolveSketch(false); H.discard();
          showSketchRefusal(sketch, text + " (" + relationSubjects(sketch, con, sketchInstanceNames(sketch, instanceLabels())).join(", ") + ")", [con.id], valueWhy);
        } else {
          detachDrivenSketchDimension(sketch,con);
          dismissCommittedDimensionEditor(sketch,con);
        }
        refreshAll();
      });
      row.appendChild(inp);
      var drive = btn('<i class="ph ' + (con.driven ? "ph-eye" : "ph-lock-key") + '"></i>', function () {
        pushUndo(con.driven ? t("drivingDimension") : t("drivenDimension"));
        var wasDriven = !!con.driven;
        con.driven = !wasDriven;
        if (con.driven) {
          delete con.expr;
          con.value = constraintMeasure(sketch,con);
          resolveSketch(false);
        } else if (!resolveSketch(true)) {
          var drivingWhy = explainSketchConflict(sketch, { keep: [con.id] });
          var drivingSubject = constraintCaption(con, sketch);
          con.driven = true;
          con.value = constraintMeasure(sketch,con);
          resolveSketch(false); H.discard();
          showSketchRefusal(sketch, drivingSubject, [con.id], drivingWhy); return;
        } else detachDrivenSketchDimension(sketch,con);
        refreshAll();
      }, "md-mini" + (con.driven ? " on" : ""));
      drive.title = con.driven ? t("drivenDimension") : t("drivingDimension");
      row.appendChild(drive);
    }
    var sup = btn('<i class="ph ' + (con.suppressed ? "ph-eye-slash" : "ph-eye") + '"></i>', function () {
      pushUndo(t("suppress"));
      con.suppressed = !con.suppressed;
      resolveSketch(false);
      if(!con.suppressed)detachDrivenSketchDimension(sketch,con);
      refreshAll();
    }, "md-mini");
    sup.title = t("suppress");
    row.appendChild(sup);
    var del = btn('<i class="ph ph-trash"></i>', function () {
      pushUndo(t("del"));
      sketch.constraints = sketch.constraints.filter(function (q) { return q !== con; });
      resolveSketch(false);
      refreshAll();
    }, "md-mini btn-danger");
    del.title = t("del");
    row.appendChild(del);
    if (con.value != null) {
      row.appendChild(el("span", "md-var-val",
        con.exprError ? "—" : dimensionUnit(con) === "angle"
          ? String(Number(Number(con.value).toPrecision(8))) + "°"
          : modelLengthText(Number(con.value),10) + " " + modelLengthUnit()));
    }
    list.appendChild(row);
  });
  if (!sketch.constraints.length) list.appendChild(el("div", "md-note", t("constraintDriven")));
  host.appendChild(list);
  buildEquationList(host);
  syncDofBadge();
}

/* Global variables: named numbers, or expressions over other names, that any
   dimension in any sketch can be written in terms of. They are what let one
   edit resize a whole design instead of one edge. */
function buildEquationList(host) {
  host.appendChild(el("h5", "md-h5", t("equations")));
  var vars = E.def.variables || [];
  var list = el("div", "md-cons-list");

  vars.forEach(function (v) {
    var row = el("div", "md-cons-row" + (v.exprError ? " bad" : ""));
    if (v.exprError) row.title = v.exprError;

    var nameInp = el("input", "md-dim-name");
    nameInp.type = "text";
    nameInp.value = v.name;
    nameInp.title = t("varName");
    nameInp.addEventListener("change", function () {
      var next = nameInp.value.trim();
      if (!nameAvailable(E.def, next, v)) { flash(t("badName")); nameInp.value = v.name; return; }
      pushUndo(t("varName"));
      v.name = next;
      resolveSketch(false);
      refreshAll();
    });
    row.appendChild(nameInp);

    var exprInp = el("input", "md-dim-value");
    exprInp.type = "text";
    exprInp.value = v.expr;
    exprInp.title = t("varExpr");
    exprInp.addEventListener("change", function () {
      pushUndo(t("varExpr"));
      var old = v.expr;
      v.expr = exprInp.value.trim();
      resolveEquations(E.def);
      if (v.exprError) { flash(v.exprError); v.expr = old; resolveEquations(E.def); }
      resolveSketch(false);
      refreshAll();
    });
    row.appendChild(exprInp);

    // a variable something depends on cannot just disappear
    var del = btn('<i class="ph ph-trash"></i>', function () {
      pushUndo(t("del"));
      removeVariable(E.def, v.id);
      resolveSketch(false);
      refreshAll();
    }, "md-mini btn-danger");
    del.title = t("del");
    row.appendChild(del);

    var val = el("span", "md-var-val", v.exprError ? "—" : String(Math.round((v.value || 0) * 100) / 100));
    row.appendChild(val);
    list.appendChild(row);
  });

  host.appendChild(list);
  host.appendChild(btn('<i class="ph ph-plus"></i> ' + t("addVariable"), function () {
    var base = "Var", n = 1;
    while (!nameAvailable(E.def, base + n)) n++;
    pushUndo(t("addVariable"));
    addVariable(E.def, base + n, "100");
    resolveSketch(false);
    refreshAll();
  }, "md-wide md-dashed"));
  host.appendChild(el("div", "md-note", t("eqHelp")));
}

// The tab icon carries the DOF count, so the sketch's health is visible even
// while you are working in another pane.
function syncDofBadge() {
  var b = root && root.querySelector("#mdDofBadge");
  if (!b) return;
  var si = E.solveInfo;
  // an empty sketch is not "fully defined", it is simply not a sketch yet
  if (!si || E.docType !== "part" || !ensureSketch(E.def).entities.length) {
    b.textContent = ""; b.className = "md-badge"; return;
  }
  b.textContent = si.status === "fully-constrained" ? "✓" : si.status === "under-constrained" ? String(si.degreesOfFreedom) : "!";
  b.className = "md-badge md-badge-" + si.status;
}

function appendViewportColor(host, label, key) {
  var row = el("label", "md-row");
  row.appendChild(el("span", "t", label));
  var input = el("input", "color-inp");
  input.type = "color";
  input.value = E[key];
  input.addEventListener("input", function () { E[key] = input.value; decoGroups.forEach(function (entry) { entry.dirty = true; }); refreshDecorations(); });
  input.addEventListener("change", saveModelerPrefs);
  row.appendChild(input);
  host.appendChild(row);
}

function appendLightRange(host, label, key, min, max, step, unit) {
  var row = el("label", "md-row");
  row.appendChild(el("span", "t", label));
  var input = el("input");
  input.type = "range"; input.min = min; input.max = max; input.step = step;
  input.value = E[key]; input.disabled = !!E.lightMatchRoom;
  var out = el("span", "md-val", Math.round(E[key]) + unit);
  input.addEventListener("input", function () {
    E[key] = +input.value;
    out.textContent = Math.round(E[key]) + unit;
    renderPreview();
  });
  input.addEventListener("change", saveModelerPrefs);
  row.appendChild(input); row.appendChild(out); host.appendChild(row);
}

function fillLook() {
  var host = root.querySelector("#mdLook");
  host.innerHTML = "";

  host.appendChild(el("h5", "md-h5", t("viewportAppearance")));
  var roomLight = el("label", "md-check");
  var roomCheck = el("input"); roomCheck.type = "checkbox"; roomCheck.checked = !!E.lightMatchRoom;
  roomCheck.title = t("matchRoomLightHint");
  roomCheck.addEventListener("change", function () {
    E.lightMatchRoom = roomCheck.checked;
    saveModelerPrefs(); fillLook(); renderPreview();
  });
  roomLight.appendChild(roomCheck); roomLight.appendChild(el("span", "", t("matchRoomLight")));
  host.appendChild(roomLight);
  appendLightRange(host, t("lightAzimuth"), "lightAzimuth", -180, 180, 1, "°");
  appendLightRange(host, t("lightElevation"), "lightElevation", -10, 90, 1, "°");
  appendLightRange(host, t("lightDistance"), "lightDistance", 50, 5000, 1, " cm");
  appendViewportColor(host, t("edgeColor"), "edgeColor");
  appendViewportColor(host, t("selectedEdgeColor"), "selectedEdgeColor");
  appendViewportColor(host, t("selectionFaceColor"), "selectedFaceColor");
  appendViewportColor(host, t("hoverColor"), "hoverColor");

  var paintBanner = el("div", "md-paint-launch-banner");
  var paintBtn = btn('<i class="ph ph-paint-brush"></i> ' + t("startPainting"), function () {
    setMode("3d");
    setTool("paint");
  }, "btn-accent");
  paintBanner.appendChild(paintBtn);
  host.appendChild(paintBanner);

    var tableSources=el("details","md-table-sources");
    tableSources.appendChild(el("summary","","Manufacturing table sources and coverage"));
    var tableCheck=validateManufacturingTables();
    tableSources.appendChild(el("p","",tableCheck.ok ? "Nominal geometry tables checked. Standards editions without a verified source are explicitly unverified." : "Manufacturing table validation needs attention."));
    Object.values(MANUFACTURING_TABLES).forEach(function(table){
      var row=el("p","",table.id.replace(/_/g," ")+" · "+(table.edition || "Edition unverified")+" · Supported entries: "+table.supportedKeys.join(", "));
      row.dataset.manufacturingTable=table.id;
      var clearance=table.fieldSources && table.fieldSources.clearance;
      if(clearance){var source=el("a",""," Clearance dimensions source (2025)");source.href=clearance.source;source.target="_blank";source.rel="noopener noreferrer";row.appendChild(source);}
      tableSources.appendChild(row);
    });
    host.appendChild(tableSources);
  var p = E.sel;
  if (!p) { emptyState(host, "ph-paint-brush", t("noSel"), t("noSelHint")); return; }
  if (isSketchObject(p) && p.type) {
    var construction = el("label", "md-check");
    var check = el("input"); check.type = "checkbox"; check.checked = !!p.construction;
    check.addEventListener("change", function () { pushUndo(t("tool_constr")); p.construction = check.checked; resolveSketch(false); refreshAll(); });
    construction.appendChild(check); construction.appendChild(el("span", "", "Construction geometry")); host.appendChild(construction);
    host.appendChild(el("div", "md-note", "Sketch entities carry rules and metadata only. They do not create a solid until consumed by a feature."));
    return;
  }
  // A selected sketch vertex has no `type`, and viewport appearance overlays
  // may return a copy of a body. Only the document's actual solid may receive
  // density and material edits; resolve copies by their stable body ID.
  p=(E.def.parts || []).find(function(part){return part.id===p.id;}) || null;
  if(!p){emptyState(host,"ph-paint-brush",t("noSel"),t("noSelHint"));return;}

  host.appendChild(el("h5", "md-h5", t("material")));

  if (E.def.metadata && E.def.metadata.adapter === "cabinet") {
    var manufacturingTitle=el("h5","md-h5","Manufacturing classification"); host.appendChild(manufacturingTitle);


    var roleRow=el("label","md-row"), roleLabel=el("span","t","Role"), roleSelect=el("select");
    Object.entries(CABINET_MANUFACTURING_ROLES).forEach(function(entry){var option=el("option");option.value=entry[0];option.textContent=entry[1].label;roleSelect.appendChild(option);});
    roleSelect.value=CABINET_MANUFACTURING_ROLES[p.role]?p.role:"panel";
    var materialSelect=el("select"); ["board","front","back","metal","glass","solidWood","stone"].forEach(function(value){var option=el("option");option.value=value;option.textContent=value;materialSelect.appendChild(option);});
    materialSelect.value=p.materialRole || CABINET_MANUFACTURING_ROLES[roleSelect.value].defaultMaterial;
    function commitManufacturing(){pushUndo("Manufacturing classification");assignCabinetManufacturing(p,{role:roleSelect.value,materialRole:materialSelect.value});refreshParts();}
    roleSelect.addEventListener("change",function(){materialSelect.value=CABINET_MANUFACTURING_ROLES[roleSelect.value].defaultMaterial;commitManufacturing();}); materialSelect.addEventListener("change",commitManufacturing);
    roleRow.appendChild(roleLabel);roleRow.appendChild(roleSelect);host.appendChild(roleRow);
    var materialRoleRow=el("label","md-row");materialRoleRow.appendChild(el("span","t","BOM material"));materialRoleRow.appendChild(materialSelect);host.appendChild(materialRoleRow);
  }
  var mrow = el("label", "md-row");
  var colInp = el("input", "color-inp");
  colInp.type = "color";
  colInp.value = p.color || "#999999";
  var colorFrame = 0, colorEditing = false;
  colInp.addEventListener("input", function () {
    // History snapshots precede mutation; one undo owns the whole picker drag.
    if (!colorEditing) { pushUndo(t("color")); colorEditing = true; }
    p.color = colInp.value;
    if (!colorFrame) colorFrame = requestAnimationFrame(function () {
      colorFrame = 0;
      if (E.open && E.def.parts.includes(p)) { updatePreview(); refreshParts(); }
    });
  });
  colInp.addEventListener("change", function () { colorEditing = false; scheduleModelerDraft(); });
  var colLbl = el("span", "t");
  colLbl.textContent = t("modelColor");
  mrow.appendChild(colLbl);
  mrow.appendChild(colInp);
  host.appendChild(mrow);
  var selectedFace = (E.topologySelection || []).find(function (item) { return item.kind === "face"; });
  var selectedAppearance = selectedFace && faceAppearanceOverrides(E.def && E.def.appearances).find(function (item) {
    return item.persistentId === selectedFace.persistentId;
  });
  var faceRow = el("label", "md-row");
  faceRow.appendChild(el("span", "t", t("faceColor")));
  var faceColor = el("input", "color-inp");
  faceColor.type = "color"; faceColor.disabled = !selectedFace;
  faceColor.value = selectedAppearance && selectedAppearance.color || p.color || "#999999";
  faceColor.title = selectedFace ? t("faceColor") : t("selectFaceForColor");
  faceColor.addEventListener("change", function () {
    if (!selectedFace) return;
    pushUndo(t("appearanceFace"));
    E.def.appearances = E.def.appearances || [];
    E.def.appearances = upsertAppearanceOverride(E.def.appearances, createAppearanceOverride({
      persistentId: selectedFace.persistentId, kind: "face", material: "custom",
      color: faceColor.value, metal: p.metal, rough: p.rough, name: t("faceColor"),
    }));
    updatePreview(); refreshParts();
  });
  faceRow.appendChild(faceColor); host.appendChild(faceRow);
  if (!selectedFace) host.appendChild(el("div", "md-note", t("selectFaceForColor")));
  host.appendChild(el("div", "md-note", selectedFace
    ? (getLang() === "he" ? "מראה לפנים שנבחרו · צפיפות הגוף לא משתנה" : "Selected face appearance · body density stays unchanged")
    : (getLang() === "he" ? "חומר הגוף · קובע את המראה והצפיפות" : "Body material · sets appearance and density")));
  var stock=el("div","md-ops md-material-options");
  Object.keys(STOCK_MATERIALS).forEach(function(key){
    var mat=STOCK_MATERIALS[key];
    stock.appendChild(btn(mat.name, function(){
      pushUndo(t("appearanceFace"));
      var face=(E.topologySelection||[]).find(function(item){return item.kind==="face";});
      E.def.appearances=E.def.appearances||[];
      if(face){
        E.def.appearances=upsertAppearanceOverride(E.def.appearances, createAppearanceOverride({persistentId:face.persistentId,kind:"face",material:key,color:mat.color,metal:mat.metal,rough:mat.rough,name:mat.name}));
      } else {
        p.color=mat.color; p.metal=mat.metal; p.rough=mat.rough; p.materialName=mat.name; p.density=mat.density; p.densitySource=mat.densitySource||"";
        if(p.materialCatalogId!=="stock:"+key){delete p.materialQualificationId;delete p.gearVerificationReport;delete E.def.lastStandardsAudit;}p.materialCatalogId="stock:"+key;
        if(p.toolboxFeatureId)synchronizeToolboxMaterial(E.def,p.toolboxFeatureId,p);
        E.def.appearances=upsertAppearanceOverride(E.def.appearances, createAppearanceOverride({persistentId:p.id,kind:"body",material:key,color:mat.color,metal:mat.metal,rough:mat.rough,name:mat.name}));
      }
      updatePreview(); refreshParts(); fillLook();
    }));
  });
  host.appendChild(stock);
  var densityNote=el("div","md-note");
  var assigned=stockMaterialForPart(p);
  densityNote.textContent=t("massDensity")+": "+partMaterialDensity(p).toFixed(2)+" g/cm³"+(assigned?" · "+assigned.name:"");
  host.appendChild(densityNote);
  if(p.densitySource||assigned?.densitySource)host.appendChild(el("div","md-note",p.densitySource||assigned.densitySource));
  if(assigned?.densitySourceUrl){const sourceLink=el("a","md-note",getLang()==="he"?"מקור צפיפות":"Density source");sourceLink.href=assigned.densitySourceUrl;sourceLink.target="_blank";sourceLink.rel="noopener noreferrer";host.appendChild(sourceLink);}
  var materialTools=materialValidationTools(),engineering=el("div","md-ops md-material-options");
  const engineeringButton=(key,action)=>{const button=btn(materialTools.label(key),action);button.dataset.engineeringAction=key;engineering.appendChild(button);};
  engineeringButton("title",()=>materialTools.profile(p));
  if((p.standardCompliance||p.standardPart)?.family==="involute-gear"){
    engineeringButton("mate",()=>materialTools.profile(p,true));engineeringButton("service",()=>materialTools.service(p));engineeringButton("rating",()=>materialTools.rating(p));
  }
  engineeringButton("check",()=>materialTools.check(p));host.appendChild(engineering);
  [["metal", t("metal")], ["rough", t("rough")], ["opacity", t("opacity")]].forEach(function (mm) {
    var row = el("label", "md-row");
    var lab = el("span", "t");
    lab.textContent = mm[1];
    row.appendChild(lab);
    var sl = el("input");
    sl.type = "range"; sl.min = 0; sl.max = 1; sl.step = 0.05;
    sl.value = fin(p[mm[0]]) ? p[mm[0]] : mm[0] === "rough" ? 0.7 : mm[0] === "opacity" ? 1 : 0.08;
    // a bare slider gives no way to reproduce a finish on a second part
    var out = el("span", "md-val", Math.round(sl.value * 100) + "%");
    var finishEditing = false;
    sl.addEventListener("input", function () {
      if (!finishEditing) { pushUndo(mm[1]); finishEditing = true; }
      p[mm[0]] = +sl.value;
      out.textContent = Math.round(sl.value * 100) + "%";
      updatePreview();
    });
    sl.addEventListener("change", function () { finishEditing = false; scheduleModelerDraft(); });
    row.appendChild(sl);
    row.appendChild(out);
    host.appendChild(row);
  });
  // texture
  host.appendChild(el("h5", "md-h5", t("texture")));
  if (p.kind === "loft") {
    host.appendChild(el("div", "md-note", t("loftNoTex")));
    return;
  }
  if (p.tex) {
    var prev = el("div", "md-tex-prev");
    prev.style.backgroundImage = "url(" + p.tex + ")";
    host.appendChild(prev);
  }
  var texB = btn('<i class="ph ph-upload-simple"></i> ' + t("texture"), function () {
    var fi = document.createElement("input");
    fi.type = "file"; fi.accept = "image/*";
    fi.onchange = function () {
      var f = fi.files && fi.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function (ev) { pushUndo(t("opTexture")); p.tex = ev.target.result; updatePreview(); };
      rd.readAsDataURL(f);
    };
    fi.click();
  });

  var texGalleryB = btn('<i class="ph ph-image"></i> ' + t("textureGallery"), async function () {
    try {
      var { openTextureGallery } = await import("../ui_textures.js");
      openTextureGallery("cad_part", function(url, scale) {
        pushUndo(t("opTexture"));
        if (url) {
          p.tex = url; 
        } else {
          delete p.tex;
        }
        updatePreview();
        fillInspector();
      });
    } catch(e) {
      console.error("Failed to load texture gallery", e);
    }
  });

  var texRow = el("div", "md-btnrow");
  texRow.appendChild(texGalleryB);
  texRow.appendChild(texB);
  host.appendChild(texRow);

  if (p.tex) host.appendChild(btn('<i class="ph ph-x"></i> ' + t("clearTex"), function () { pushUndo(t("clearTex")); delete p.tex; updatePreview(); fillInspector(); }, "md-wide"));
}

export {
  fillInspector, fillInspectorTab, fillSketchPane, modelParameterOverrides,
  surfaceUVGuide,
};

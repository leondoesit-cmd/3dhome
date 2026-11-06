/* The CAD editor's sketch selection, conversions, sketch shapes, relations and
   sketch patterns, split out of js/modeler.js. It shares the editor's state
   through live imports from ../modeler.js. */
import { hasSingleToolboxKernelRecipe } from "../cad_assembly_toolbox.js";
import { measureDistance } from "../cad_evaluate.js";
import { appendBoundarySketch, offsetFaceBoundary } from "../cad_face_offset.js";
import { currentAssemblyMobility } from "../core/assembly_mobility_status.js";
import { inferAuthoringMode } from "../core/authoring_mode.js";
import { coneSilhouette, projectCircularEdge, retargetConvertedCircle, retargetSilhouetteLine } from "../core/cone_silhouette.js";
import { appendConvertedEdges, exactEdgeForSegment, previewConvertedEdge } from "../core/convert_entities.js";
import { formatDocumentScreenScale } from "../core/document_length_units.js";
import { faceFrameOrigin, realignFrame } from "../core/frame.js";
import { syncHoleCutPlacement } from "../core/hole_geometry.js";
import { isKernelBody, kernelBodySpec } from "../core/kernel_body.js";
import { nativeSolidSummary } from "../core/native_solid_summary.js";
import { isSketchAxis } from "../core/revolve_geometry.js";
import { ribSketchReady } from "../core/rib_profile.js";
import { synchronizeSketchHelices } from "../core/sketch_helix.js";
import { sketchPlaneDisplay } from "../core/sketch_plane_display.js";
import { resolveSketchSources as resolveSweptSources, savedLoftSources, sketchWorldPoint } from "../core/swept_sources.js";
import { thinSketchProfile } from "../core/thin_profile.js";
import { createTopologyReference } from "../core/topology.js";
import { holeLoop } from "../modeler_mesh_geometry.js";
import { cloneData, migrateBoundaryChangingProfileCuts } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { openQuickForm } from "../modeler/command_manager.js";
import { activeSketchFrame, currentHistoryNode, documentDirty, planeAxis, pushUndo } from "../modeler/document_history.js";
import { measureCoordinates } from "../modeler/document_outputs.js";
import { sketchOpenPathReadiness, syncExtrudeButton } from "../modeler/document_save.js";
import { newSketchPoint, sketchProfileAnalysis, sketchRegionAnalysis, snappedSketchPoint } from "./drawing_sheet_profiles.js";
import { drawSketch, drawingHintText, drawingSheet, splineLength } from "./drawing_sheet_render.js";
import { flash, flashHolding } from "./drawing_sheet_touch.js";
import { el } from "../modeler/editor_dom.js";
import { syncExactWorkerActivity } from "../modeler/editor_forms.js";
import { cutTargetFeatureId, resolvedRevolve } from "../modeler/feature_create.js";
import { finishSelectionMessage } from "../modeler/finish_preview.js";
import { setMode } from "../modeler/library_io.js";
import { retainingExactPreview } from "../modeler/library_panel.js";
import { activeParts, assemblyMateCount, brokenMateCount, countLabel, topologyEntriesForPart } from "../modeler/library_store.js";
import { selectedSolid } from "../modeler/part_commands.js";
import { exactDisplayBody, queueKernelBody, scheduleExactMesh } from "../modeler/prefs_snap.js";
import { addedConstraintIds, appendToSketch, showSketchRefusal } from "../modeler/sketch_dimension_editor.js";
import { chooseSketchReference, closeFeaturePanel, fitSketch, isCanonicalAuthoring, modelAreaText, modelLengthText, modelLengthUnit, referenceLabel, selectedSketchableFace, setTool } from "../modeler/sketch_workflow.js";
import { layout3DHost } from "../modeler/view_modes.js";
import { startSketchOnDefaultPlane } from "../modeler/welcome_coach.js";
import { aiStatusHTML } from "../pro_shell.js";
import { addCenterRectangle } from "../sketch_center_rectangle.js";
import { addCenterSlot } from "../sketch_center_slot.js";
import { addDimensionedCircle } from "../sketch_dimensioned_circle.js";
import { addDimensionedPolygon } from "../sketch_dimensioned_polygon.js";
import { currentMeasure } from "../sketch_dimensions.js";
import { resolveEquations } from "../sketch_equations.js";
import { filletSketchCorner } from "../sketch_fillet.js";
import { bindIntersectionTargets, bindModelEdgeTargets, bindPierceTargets, vertexEdgeBinding } from "../sketch_intersection.js";
import { analyzeSketchChains } from "../sketch_profiles.js";
import { addSketch, circleData, collapsedEntityIds, ellipseData, ensureSketch, ensureSketchDoc, explainSketchConflict, lineData, planeLabel, refusesAsRepeat, resolveProfilePoints, sketchById, sketchEntity, sketchEntitySizes, sketchPoint, solveSketch } from "../sketch_solver.js";
import { sampleBezier, splineControls } from "../sketch_spline.js";
import { clamp, fin, uid } from "../state.js";
import {
  E, FINISH_FEATURES, H, SKETCH_ENTITY_TYPES, refreshAll, root,
} from "../modeler.js";

function sketchProfilePresentation(sketch,profileInfo,regionCount) {
  var status=profileInfo.profiles.length || !regionCount ? profileInfo.status : "ready";
  var ribReady=status === "open" && !["extrude","extrudeCut"].includes(E.authoring && E.authoring.featureType)
    && ribSketchReady(sketch,E.def.features,analyzeSketchChains(sketch).chains);
  var pathReady=status === "open" ? sketchOpenPathReadiness(sketch) : null;
  if(ribReady || pathReady)status=pathReady && pathReady.kind === "path" && !ribReady ? "path" : "ready";
  var textKey=ribReady ? "profileRibReady" : pathReady ? pathReady.kind === "thin" ? "profileThinReady" : "profileOpenPath"
    : status === "ready" ? "profileReady" : status === "multiple" ? "profileMultiple"
    : status === "partial" ? "profilePartial" : status === "branched" ? "profileBranched"
    : status === "open" ? "profileOpen" : "profileEmpty";
  return {status:status,textKey:textKey,pathEnds:!!(ribReady || pathReady),
    icon:ribReady || pathReady || profileInfo.profiles.length || regionCount ? "ph-check-circle" : profileInfo.branchPoints.length ? "ph-warning" : "ph-path"};
}

function syncSketchOpenPathFeedback() {
  if(!root || !["extrude","extrudeCut"].includes(E.authoring && E.authoring.featureType))return;
  var info=sketchProfileAnalysis(),presentation=sketchProfilePresentation(ensureSketch(E.def),info,(sketchRegionAnalysis().regions || []).length);
  var card=root.querySelector(".md-profile-state");
  if(card){
    card.className="md-profile-state md-profile-"+presentation.status;
    card.querySelector(".md-profile-head b").textContent=t(presentation.textKey);
    card.querySelector(".md-profile-head i").className="ph "+presentation.icon;
    var ends=card.querySelector("[data-profile-ends]");
    if(ends)ends.textContent=info.openEnds.length+" "+t(presentation.pathEnds ? "profilePathEnds" : "profileEnds");
  }
  syncExtrudeButton();
}

/* The hint used to pulse forever at the bottom of the canvas. It only earns
   that much attention while a multi-step tool is mid-sketch; the rest of the
   time it states the two double-click gestures quietly, and the readouts that
   change as you work moved to the status bar. */
function sketchPlaneCaption() {
  var sketch=ensureSketch(E.def);
  return sketchPlaneDisplay(sketch,E.def.references || [],{face:t("facePrefix"),reference:referenceLabel,
    principal:function(plane){return t(plane==="top"?"view_top":plane==="front"?"view_front":"view_right");}}).label;
}
/* "Face", "Edge 42 cm", "Vertex" — the kind, and the one number that makes an
   edge identifiable when several run parallel a few pixels apart. */
function hoverReadout(reference) {
  var kind = reference.kind === "face" ? t("selFilterFace")
    : reference.kind === "edge" ? t("selFilterEdge")
    : reference.kind === "vertex" ? t("selFilterVertex")
    : t("selKindMixed");
  var measure = Number(reference.descriptor && reference.descriptor.measure);
  if (reference.kind !== "edge" || !fin(measure) || measure <= 0) return kind;
  return kind + " · " + modelLengthText(measure,7) + " " + modelLengthUnit();
}

/* The distance an armed Measure would report if you clicked here. Nothing when
   Measure is not running, when the pointer is off the model, or in Faces mode
   — an angle needs two normals, and one of them is not picked yet. */
function liveMeasureReadout() {
  if (!E.measure || E.measure.mode !== "points" || !E.hoverPoint) return null;
  var first = E.measure.picks[0];
  if (E.measure.picks.length >= 2) return null;
  if (!first) return measureCoordinates(E.hoverPoint);
  var span = measureDistance(first, E.hoverPoint);
  return t("measureLength") + " " + modelLengthText(span.distance,8) + " " + modelLengthUnit();
}

function bindPolygonSideControl(input) {
  input.addEventListener("change", function () {
    var sides=Number(input.value);
    if(!Number.isInteger(sides)||sides<3||sides>24){input.value=String(E.polySides);return;}
    E.polySides=sides;
    // The visible selector owns side count over an earlier keyboard draft.
    if(E.dynInput && E.dynInput.tool==="spoly")delete E.dynInput.values.sides;
    drawSketch();syncHint();
  });
}

function syncHint() {
  var polygonControls=root && root.querySelector("#mdPolygonControls");
  if(polygonControls){
    polygonControls.hidden=E.tool!=="spoly" || E.mode==="drawing" || (E.mode==="3d"&&!E.modelPlaneActive);
    root.querySelector("#mdPolygonSides").value=String(E.polySides);
  }
  var hint = root && root.querySelector("#mdHint");
  if (!hint) return;
  var instructionTool = E.mode === "drawing" ? drawingSheet().state.tool : E.tool;
  hint.dataset.activeInstruction = instructionTool && instructionTool !== "select" ? "true" : "false";
  if (hint.dataset.activeInstruction === "true") hint.classList.remove("ps-quiet");
  // A flash still on screen keeps the element; see flash() above.
  if (flashHolding()) return;
  if (E.tool === "paint") {
    hint.textContent = t("paintHint");
    hint.classList.remove("on");
    return;
  }
  if (E.tool === "note" && E.mode !== "drawing") {
    hint.textContent = E.noteMode === "markup" ? t("markupHint") : t("noteHint");
    hint.classList.remove("on");
    return;
  }
  var live = (E.mode !== "3d" || E.modelPlaneActive) && (E.tool === "wall" || E.tool === "constr" || E.tool === "poly" || E.tool === "rev" || E.tool === "cut" || E.tool === "cutc" || E.tool === "sarc" || E.tool === "sslot" || E.tool === "sell");
  var topology=(E.topologySelection || []),finishType=E.authoring && FINISH_FEATURES.includes(E.authoring.featureType) ? E.authoring.featureType : null;
  var sameKind=topology.length && topology.every(function(reference){return reference.kind===topology[0].kind;});
  var kindLabel=!sameKind?t("selKindMixed"):topology[0].kind==="edge"?t("selKindEdge"):topology[0].kind==="face"?t("selKindFace"):t("selKindMixed");
  var compact = document.body.classList.contains("compact-nav");
  var topologyCaption=topology.length ? topology.length+" "+kindLabel+" "+t(compact ? "selCountTipTouch" : "selCountTip") : finishType ? finishSelectionMessage(finishType) : null;
  /* With nothing selected the line is a first-run message nobody reads twice.
     What IS worth saying there is what the cursor is over — a face and the edge
     bounding it sit within a few pixels of each other, and knowing which one
     the click will take is the difference between one pick and three. */
  if (!topologyCaption && E.hoverTopology) topologyCaption = hoverReadout(E.hoverTopology);
  /* Measure answers while the pointer moves, not only on the second click.
     The card still records the committed picks; this is the number under the
     cursor on the way there. */
  var live = liveMeasureReadout();
  if (live) topologyCaption = live;
  /* The 3D hint is written for a mouse and a keyboard ("Shift-drag", "wheel").
     On the phone shell it is the one line of text left over the model, so it
     had better describe the device it is on. */
  var touchHint = compact ? "hint3dTouch" : "hint3d";
  hint.textContent =
    E.mode === "3d" && !E.modelPlaneActive ? (topologyCaption || t(touchHint)) :
    E.mode === "drawing" ? drawingHintText() :
    E.tool === "sslot" ? t("slotHint") :
    E.tool === "sspline" ? t("splineHint") :
    E.tool === "sell" ? t("ellipseHint") :
    E.tool === "spoly" ? t("polygonHint") + " (" + E.polySides + ")" :
    E.tool === "srect" || E.tool === "scirc" ? t("twoPointHint") :
    E.tool === "wall" || E.tool === "constr" ? t("wallHint") :
    E.tool === "poly" ? t("polyHint") :
    E.tool === "rev" ? t("revHint") :
    E.tool === "cut" ? t("cutHint") :
    E.tool === "cutc" ? t("cutcHint") :
    E.tool === "sarc" ? (E.arcTangent ? t("tangentArcHint") : E.arcThreePoint ? t("arcThreePointHint") : t("arcHint")) :
    E.tool === "trim" ? t("trimHint") :
    E.tool === "extend" ? t("extendHint") :
    E.tool === "sketchfillet" ? t("sketchFilletHint") :
    E.tool === "offset" ? t("offsetHint") :
    E.tool === "dim" ? t("dimHint2") :
    t("dimHint") + " · " + t("vertexHint");
  if(compact && E.tool === "select" && E.mode !== "drawing" && (E.mode !== "3d" || E.modelPlaneActive))hint.textContent=t("sketchTouchNavigation")+" · "+hint.textContent;
  if (E.mode === "3d" && E.modelPlaneActive) {
    hint.textContent = t("modelPlaneHint") + ": " + sketchPlaneCaption() + " · " + hint.textContent;
  }
  /* The idle gesture line is a permanent 25px band across the top of a 664px
     viewport, and on 375px it ellipsises mid-word. It is a first-run message:
     tap it once and it stays gone for the session, coming back the moment the
     hint has something live to say. */
  var idle = E.mode === "3d" && !E.modelPlaneActive && !topologyCaption;
  if (compact && !hint.dataset.dismissBound) {
    hint.dataset.dismissBound = "1";
    hint.addEventListener("click", function () { E.hintDismissed = true; syncHint(); });
  }
  hint.classList.toggle("md-hint-dismissable", !!idle);
  hint.classList.toggle("idle-dismissed", !!(idle && E.hintDismissed));
  hint.classList.toggle("live", live);
  hint.classList.toggle("selection",E.mode==="3d" && !E.modelPlaneActive && !!topologyCaption);
  var help = root && root.querySelector("#mdHintHelp");
  if (help) help.classList.toggle("on", !!(idle && E.hintDismissed));
  var sketchAction = root && root.querySelector("#mdSketchOnFace");
  if (sketchAction) {
    var canSketchFace = E.docType === "part" && E.mode === "3d" && !E.modelPlaneActive && !E.facePick && !!selectedSketchableFace();
    sketchAction.hidden = !canSketchFace;
  }
  // the rebuild banner parks itself under the hint; tell it how tall that is
  if (compact && root) root.style.setProperty("--md-hint-h", (hint.textContent ? Math.round(hint.getBoundingClientRect().height) : 0) + "px");
}

/* A CAD status line: which plane you are drawing on, where the cursor is in
   centimetres, the grid it will land on, and the zoom. */
function displayedCoreIssues() {
  return ((E.coreRun && E.coreRun.issues) || []).filter(function (issue) {
    return !E.exactRestoring || (issue.code !== "missing-topology-reference" && issue.code !== "ambiguous-topology-reference");
  });
}

function modelRebuildPending() {
  return E.docType === "part" && !!(E.exactRestoring || E.kernelBusy ||
    (E.def && activeParts(E.def).some(function (part) { return part.exactPending; })));
}
function rebuildStatusCaption() {
  if (modelRebuildPending()) return '<span class="md-st-dirty">' + t("rebuildPending") + "</span>";
  var issues = displayedCoreIssues();
  var errors = issues.filter(function (issue) { return issue.severity === "error"; }).length;
  var warnings = issues.filter(function (issue) { return issue.severity === "warning"; }).length;
  if (!errors && E.def) errors = activeParts(E.def).filter(function (part) { return !!part.exactError; }).length;
  if (errors) return '<button type="button" class="md-st-rebuild md-st-dof md-dof-conflicting">' + t("rebuildFail") + " · " + errors + "</button>";
  if (warnings) return '<button type="button" class="md-st-rebuild md-st-dof md-dof-over-constrained">' + t("rebuildWarn") + " · " + warnings + "</button>";
  if (!E.coreRun) return '<span class="md-st-dirty">' + t("rebuildUnchecked") + "</span>";
  return '<span class="md-st-dof md-dof-fully-constrained">' + t("rebuildOk") + "</span>";
}

function topologyStatusCaption() {
  var refs = E.topologySelection || [];
  if (!refs.length) return "";
  var kinds = {};
  refs.forEach(function (reference) { kinds[reference.kind || "ref"] = (kinds[reference.kind || "ref"] || 0) + 1; });
  return Object.keys(kinds).map(function (kind) { return kinds[kind] + " " + kind; }).join(" · ");
}

/* The status line is rewritten whole on every sync, so the shell's AI chip
   (js/pro_shell.js) is added back at its end each time — inside the line, not
   floated over it, so the two can never overlap. */
function syncStatus() {
  syncStatusLine();
  var st = root && root.querySelector("#mdStatus");
  if (st && !st.querySelector(".ps-ai-status")) st.insertAdjacentHTML("beforeend", aiStatusHTML());
  syncRetainedExactPreviewStatus();
  syncExactWorkerActivity();
}
function syncRetainedExactPreviewStatus() {
  var st=root && root.querySelector("#mdStatus");
  if(!st)return;
  var chip=st.querySelector(".md-retained-exact-preview");
  if(!retainingExactPreview()){if(chip)chip.remove();return;}
  if(!chip){chip=el("span","md-retained-exact-preview md-st-dirty");chip.setAttribute("aria-live","polite");st.appendChild(chip);}
  var caption="Showing previous geometry while rebuilding · geometry picking paused";
  if(chip.textContent!==caption)chip.textContent=caption;
}

function syncStatusLine() {
  var st = root && root.querySelector("#mdStatus");
  if (!st) return;
  if (E.docType === "assembly") {
    var components = E.assembly && E.assembly.components || [];
    /* Both mate lists count. Reading only the legacy one said "0 mates" on an
       assembly held together entirely by SmartMates. */
    var mates = assemblyMateCount(E.assembly);
    var selected = E.componentSel && E.componentSel.length || 0;
    var picked = (E.topologySelection || []).filter(function (reference) { return reference.componentId; }).length;
    var broken = brokenMateCount();
    var mobility=currentAssemblyMobility(E.assembly,E.mateMobilityReport);
    st.innerHTML = '<b>' + t("docAssembly") + '</b>' +
      '<span class="md-st-sep"></span>' + countLabel(components.length, "assemblyComponentOne", "assemblyComponents") +
      '<span class="md-st-sep"></span>' + countLabel(mates, "matesCountOne", "matesCount") +
      (broken ? '<span class="md-st-sep"></span><b class="md-st-dirty">' + countLabel(broken, "assemblyIssueOne", "assemblyIssues") + "</b>" : "") +
      '<span class="md-st-sep"></span>' + (mobility===null?t('mateMobilityUnchecked'):countLabel(mobility, "mateDofOne", "mateDof")) +
      (selected ? '<span class="md-st-sep"></span><b class="md-st-selection">' + selected + " " + t("assemblySelected") + "</b>" : "") +
      (picked ? '<span class="md-st-sep"></span><b class="md-st-selection">' + countLabel(picked, "matePickedOne", "matePicked") + "</b>" : "") +
      (documentDirty() ? '<span class="md-st-sep"></span><b class="md-st-dirty">' + t("dirtySave") + "</b>" : "");
    return;
  }
  if (E.mode === "3d" && !E.modelPlaneActive) {
    var mode=inferAuthoringMode(Object.assign({}, E.def, {authoringMode:null}));
    var recognition=E.def && E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition;
    var rebuildPending=modelRebuildPending();
    var solids = E.coreRun && Array.isArray(E.coreRun.bodies) ? E.coreRun.bodies.length : E.def ? activeParts(E.def).length : 0;
    var nativeSummary=nativeSolidSummary(E.def?activeParts(E.def):[],{singleRecipe:hasSingleToolboxKernelRecipe(E.def,E.def?activeParts(E.def):[])});
    st.innerHTML='<b>'+mode.replace(/-/g," ")+'</b>'+
      (recognition && recognition!=="none" ? '<span class="md-st-sep"></span>'+recognition+' '+t("reconstruction") : "")+
      '<span class="md-st-sep"></span>'+rebuildStatusCaption()+
      (!rebuildPending && solids ? '<span class="md-st-sep"></span>'+solids+" "+t("parts").toLowerCase() : "")+
      (!rebuildPending && nativeSummary.known ? '<span class="md-st-sep"></span>Native solids: '+nativeSummary.count : "")+
      (!rebuildPending && nativeSummary.disconnected ? '<span class="md-st-sep"></span><b class="md-st-dirty">Disconnected solids</b>' : "")+
      (topologyStatusCaption() ? '<span class="md-st-sep"></span><b class="md-st-selection">'+topologyStatusCaption()+"</b>" : "")+
      (documentDirty() ? '<span class="md-st-sep"></span><b class="md-st-dirty">'+t("dirtySave")+"</b>" : "");
    return;
  }
  /* A drawing's status line is the drawing's: paper, scale, projection angle
     and what is selected — none of which a sketch plane caption can say. */
  if (E.mode === "drawing") {
    var sheetStatus = drawingSheet().status();
    st.innerHTML = '<b>' + sheetStatus.size + "</b>" +
      '<span class="md-st-sep"></span><i class="ph ph-arrows-out-line-horizontal"></i> ' + sheetStatus.scale +
      '<span class="md-st-sep"></span>' + sheetStatus.units +
      '<span class="md-st-sep"></span>' + t(sheetStatus.projection === "first" ? "sheetFirstAngle" : "sheetThirdAngle") +
      '<span class="md-st-sep"></span>' + sheetStatus.views + " " + t("sheetViews").toLowerCase() +
      '<span class="md-st-sep"></span>' + Math.round(sheetStatus.zoom * 100) + "%" +
      (sheetStatus.selection ? '<span class="md-st-sep"></span><b class="md-st-selection">' + sheetStatus.selection + "</b>" : "") +
      (documentDirty() ? '<span class="md-st-sep"></span><b class="md-st-dirty">' + t("dirtySave") + "</b>" : "");
    return;
  }
  var lbl = activeSketchFrame() ? ["U", "V"] : E.view === "top" ? ["X", "Z"] : E.view === "front" ? ["X", "Y"] : ["Z", "Y"];
  var m = E._mouse;
  st.innerHTML =
    '<b>' + sketchPlaneCaption() + "</b>" +
    '<span class="md-st-sep"></span>' +
    (m ? lbl[0] + " " + modelLengthText(m.u,6) + " · " + lbl[1] + " " + modelLengthText(m.v,6) + " " + modelLengthUnit() : "—") +
    '<span class="md-st-sep"></span>' +
    '<i class="ph ph-grid-four"></i> ' + modelLengthText(E.grid,6) + " " + modelLengthUnit() +
    (E.osnap ? '<span class="md-st-sep"></span><i class="ph ph-magnet"></i>' : "") +
    '<span class="md-st-sep"></span>'+formatDocumentScreenScale(E.scl,modelLengthUnit()) +
    (E.docType === "part" && E.solveInfo && ensureSketch(E.def).entities.length
      ? '<span class="md-st-sep"></span><span class="md-st-dof md-dof-' + E.solveInfo.status + '">' +
        (E.solveInfo.status === "fully-constrained" ? t("dofFull")
          : E.solveInfo.status === "conflicting" ? t("dofConflict")
          : E.solveInfo.status === "over-constrained" ? t("dofOver")
          : t("dofUnder") + " " + E.solveInfo.degreesOfFreedom) + "</span>"
      : "") +
    (sketchSelectionSummary() ? '<span class="md-st-sep"></span><b class="md-st-selection">' + sketchSelectionSummary() + "</b>" : "");
}

/* ================= sketch canvas ================= */
/* Backing store at device resolution, drawing in CSS pixels. Without the scale
   every line of the sketch is resampled on a retina screen, which on a drawing
   made of one-pixel strokes is the difference between a CAD view and a smear.
   E.cw/E.ch are the CSS size — the pan/zoom maths is all in those units. */
function sizeSketch() {
  /* The canvas, not the pane: in Drawing mode the sheet panel takes a column
     out of the middle and the canvas is inset to match, so measuring the parent
     would scale the page to a width it does not have. */
  var r = E.cv.getBoundingClientRect();
  /* The editor is measured the moment it is shown, which on the first open can
     be before layout has run — the pane reports 0×0. Every bit of pan/zoom
     maths is in these units, so a zero here does not fail loudly: it silently
     clamps zoom-to-fit to its floor and puts the drawing in a corner. Keep the
     last good size until a real one arrives (the observer below re-measures). */
  if (r.width < 1 || r.height < 1) return false;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  E.cw = r.width; E.ch = r.height;
  E.cv.width = Math.round(r.width * dpr);
  E.cv.height = Math.round(r.height * dpr);
  if (E.cx) E.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!E._centered) { E.ox = r.width / 2; E.oy = r.height / 2; E._centered = true; }
  return true;
}

/* One observer covers every way the drawing area can change size: the editor
   opening, the right panel being dragged, the window resizing, the browser
   zooming. Before this, only window resize was handled. */
function watchSketchSize() {
  if (E._sizeObserver || typeof ResizeObserver === "undefined") return;
  E._sizeObserver = new ResizeObserver(function () {
    if (!E.open) return;
    // the window became a phone: no room for Split, the sketch keeps the pane
    if (E.split && document.body.classList.contains("compact-nav")) { setMode("2d"); return; }
    var was = E.cw;
    if (!sizeSketch()) {
      // The sketch canvas is hidden in Model view, but the preview still resizes.
      if (E.mode === "3d") layout3DHost();
      return;
    }
    // the first real measurement is also the first chance to frame the model
    if (!was && E.mode !== "3d") fitSketch(); else drawSketch();
    layout3DHost();
  });
  // The canvas can resize independently of its pane (coach/ribbon layout,
  // drawing-sheet insets). Observing only the parent leaves the backing store
  // stretched, so the displayed origin and pointer coordinates disagree.
  E._sizeObserver.observe(E.cv);
  E._sizeObserver.observe(root.querySelector("#md3dHost"));
}

/* ---- which sketch you are drawing in ----
   A sketch belongs to a plane, so the view you are looking through decides
   which one is editable. Switching to a plane adopts the sketch already on it;
   the first mark you make on an empty plane opens a new one. */
function activeSketch() { return ensureSketch(E.def); }
function sketchesOnPlane(plane) {
  return ensureSketchDoc(E.def).filter(function (s) { return s.plane === plane && s.frameSpace!=="local"; });
}
// Call this from every path that CREATES sketch geometry.
function sketchForView() {
  var current = ensureSketch(E.def);
  if (current.plane === E.view) return current;
  /* An open sketch session owns its sketch. A face or datum sketch is
     local-frame, so with its surface off its plane never matched E.view and
     every line segment used to add a new principal sketch — 11 stray sketches
     after a few clicks, and a render stack overflow. */
  if (isCanonicalAuthoring() && E.authoring && E.authoring.phase === "sketch") return current;
  var existing = sketchesOnPlane(E.view);
  var target = existing.length ? existing[existing.length - 1] : addSketch(E.def, E.view, 0);
  E.def.activeSketch = target.id;
  E.ssel = [];
  return target;
}
// Called when the view changes: adopt a sketch on the new plane if there is
// one. A view is only a camera choice until the user starts drawing, so it
// must not add an invisible empty sketch to the saved feature history.
function adoptSketchForView() {
  var current = ensureSketch(E.def);
  if (current.plane === E.view && current.frameSpace!=="local") return false;
  var existing = sketchesOnPlane(E.view);
  if (existing.length) {
    E.def.activeSketch = existing[existing.length - 1].id;
    E.ssel = [];
    if (isSketchObject(E.sel)) E.sel = null;
    E.solveInfo = solveSketch(ensureSketch(E.def));
    return true;
  }
  if (current.frameSpace==="local") return false;
  if (!current.entities.length) {
    // an untouched sketch just follows you rather than littering the document
    current.plane = E.view;
    current.name = planeLabel(E.view) + " sketch";
    return true;
  }
  return false;
}

function constraintMeasure(sketch, constraint) {
  var target = null;
  if(constraint.patternTranslation){var a=sketchPoint(sketch,constraint.a),b=sketchPoint(sketch,constraint.b);return a&&b?(constraint.direction==="v"?b.y-a.y:b.x-a.x):constraint.value;}
  if (constraint.type === "distance") target = constraint.entity
    ? {type:"line",id:constraint.entity} : {type:"points",a:constraint.a,b:constraint.b};
  else if (constraint.type === "radius" || constraint.type === "diameter") {
    var dimensioned = sketchEntity(sketch, constraint.entity);
    target = dimensioned && dimensioned.type === "ellipse"
      ? {type:"ellipse",id:constraint.entity,axis:constraint.axis}
      : {type:"circle",id:constraint.entity};
  }
  else if (constraint.type === "angle" && constraint.entity) {
    var entity = sketchEntity(sketch,constraint.entity);
    var line = lineData(entity,new Map((sketch.points || []).map(function (p) { return [p.id,p]; })));
    return line ? line.angle*180/Math.PI : constraint.value;
  } else if (constraint.type === "angle") target = {type:"angle",a:constraint.a,b:constraint.b};
  else if (constraint.type === "offset" && sketchEntity(sketch, constraint.a) && sketchEntity(sketch, constraint.a).type === "line") target = {type:"lines",a:constraint.a,b:constraint.b};
  else if (constraint.type === "pointLineDistance") target = {type:"pointLine",point:constraint.point,line:constraint.a};
  if (!target) return constraint.value;
  var measured = currentMeasure(sketch,target);
  return constraint.type === "diameter" ? measured*2 : measured;
}

// Run the solver. A constraint that cannot be satisfied is not left in the
// document half-applied — the geometry and the constraint list both go back.
function resolveSketch(rollbackOnConflict, fast) {
  var sketch = ensureSketch(E.def);
  // `fast` skips the solver's rank analysis: it is for frames inside a drag,
  // where the geometry has to follow the cursor and the DOF badge can wait for
  // the pointer to come up. Never combined with rollback, which reads status.
  var quick = !!fast && !rollbackOnConflict;
  // Snapshot values in place, keyed by id: the selection and the inspector hold
  // references to these very objects, and swapping in fresh ones on a rollback
  // would leave both pointing at geometry that is no longer in the document.
  var before = null;
  if (rollbackOnConflict) {
    before = { pts: {}, r: {} };
    sketch.points.forEach(function (p) { before.pts[p.id] = { x: p.x, y: p.y }; });
    sketch.entities.forEach(function (e) { if (e.type === "circle") before.r[e.id] = e.r; });
    before.sizes = sketchEntitySizes(sketch);
  }
  // Equations decide what the dimensions are, so they resolve first — solving
  // against last cycle's numbers would show geometry one edit behind.
  E.eqErrors = resolveEquations(E.def).errors;
  try { bindIntersectionTargets(sketch, resolveIntersectionEdge); } catch (error) { /* Keep last intersection targets if a source body is mid-rebuild. */ }
  try { bindModelEdgeTargets(sketch, resolveIntersectionEdge); } catch (error) { /* Same: keep the last bound edge line. */ }
  try { bindPierceTargets(sketch, E.def.sketches || [], sketchWorldPoint); } catch (error) { /* Same: keep the last pierce point while the path sketch is being edited. */ }
  // the last full report for this sketch, so a rollback can tell an edit that
  // repeats a relation from one that meets redundancy already in the sketch
  var previousReport = E._solveSketchId === sketch.id && E.solveInfo && E.solveInfo.degreesOfFreedom != null ? E.solveInfo : null;
  var report = solveSketch(sketch, quick ? { diagnostics: false } : {});
  /* A failing sketch leaves error on every relation near the failure; narrow
     that to a minimal set before painting it red. A rollback caller undoes the
     edit instead, and explains its own refusal against what it just added. */
  if (!quick && !rollbackOnConflict && (report.status === "conflicting" || report.status === "over-constrained")) {
    var why = explainSketchConflict(sketch);
    if (why.kind && why.ids.length) { report.residualConflicts = report.conflicts; report.conflicts = why.ids; }
  }
  // a quick pass keeps the previous status and conflict list on screen rather
  // than blanking the badge for the duration of a drag
  E.solveInfo = report.diagnostics === false
    ? Object.assign({}, E.solveInfo || {}, { converged: report.converged, error: report.error, stale: true })
    : report;
  E._solveSketchId = sketch.id;
  sketch.constraints.forEach(function (constraint) {
    if (constraint.driven && constraint.value != null) constraint.value = constraintMeasure(sketch,constraint);
  });
  // an edit that "solves" by crushing a drawn entity to nothing fought it (G30)
  if (before && (E.solveInfo.status === "conflicting" || refusesAsRepeat(E.solveInfo, previousReport) || collapsedEntityIds(sketch, before.sizes).length)) {
    sketch.points.forEach(function (p) {
      var q = before.pts[p.id];
      if (q) { p.x = q.x; p.y = q.y; }
    });
    sketch.entities.forEach(function (e) { if (e.id in before.r) e.r = before.r[e.id]; });
    // re-drive from the restored geometry, not from the state that failed
    syncSketchDrivenParts();
    return false;
  }
  syncSketchDrivenParts();
  return true;
}

/* Re-derive the profile of every solid that was extruded from a sketch. This is
   what makes the model parametric rather than a pile of frozen meshes: change a
   sketch dimension and the solid it drives changes with it.
   A profile that no longer resolves — an entity deleted, a loop opened — keeps
   its last good shape and is flagged, because silently deleting the user's
   solid is a far worse answer than showing a stale one with a warning. */
function syncSketchDrivenParts() {
  if (!E.def) return false;
  var changed = false;
  if (synchronizeSketchHelices(E.def).length) changed = true;
  var holes=(E.def.features || []).filter(function(feature){return feature.type==="hole" && !feature.suppressed;});
  (E.def.parts || []).forEach(function (p) {
    holes.forEach(function(feature){
      var sketch=feature.params?.sketchId && sketchById(E.def,feature.params.sketchId);
      if(!sketch && !feature.params?.cylindricalSource)return;
      try{if(syncHoleCutPlacement(p,feature,sketch,E.def)){changed=true;delete p.meshData;}}
      catch(error){/* A broken placement is diagnosed by the feature rebuild. */}
    });
    for (var record of [...(p.merges3d || []),...(p.cuts3d || [])]){
      if(record.kind!=="revolve" || !record.featureId)continue;
      var owner=(E.def.features || []).find(f=>f.id===record.featureId);
      if(!owner || (!isSketchAxis(owner.params.axis) && !record.axisBasis))continue;
      try{
        var source=sketchById(E.def,owner.params.sketchId);
        var tool=resolvedRevolve(source,owner.params).tool;
        if(Object.keys(tool).some(key=>JSON.stringify(tool[key])!==JSON.stringify(record[key]))){
          Object.assign(record,tool);delete p.meshData;changed=true;
        }
      }catch(error){/* The exact history reports an invalid driving reference. */}
    }
    if (!p.sketchDriven || !p.profileEntityIds || !p.profileEntityIds.length) return;
    var sketch = p.sketchId ? sketchById(E.def, p.sketchId) : ensureSketch(E.def);
    var revolveFeature=p.kind==='rev' && (E.def.features || []).find(function(feature){return feature.id===p.featureId;});
    var revolveParams=revolveFeature?.params;
    var extrusionParams=p.kind==='ext' && (E.def.features || []).find(function(feature){return feature.id===p.featureId;})?.params;
    var pts,revolveProjection;
    try{
      if(sketch && revolveParams){
        revolveProjection=resolvedRevolve(sketch,{...revolveParams,profileEntityIds:p.profileEntityIds,sketchId:sketch.id}).projection;
        pts=revolveProjection.pts;
      }else if(sketch)pts=extrusionParams?.thinFeature ? thinSketchProfile(sketch,p.profileEntityIds,extrusionParams.thickness,extrusionParams.thinMode).points : resolveProfilePoints(sketch,p.profileEntityIds);
    }catch(error){pts=null;}
    var holePts = sketch && Array.isArray(p.holeProfileEntityIds)
      ? p.holeProfileEntityIds.map(function (ids) { return resolveProfilePoints(sketch, ids); }) : [];
    if (!pts || holePts.some(function (loop) { return !loop; })) {
      if (!p.profileError) { p.profileError = true; changed = true; }
      return;
    }
    if (p.profileError) { p.profileError = false; changed = true; }
    // the plane can move under a feature too
    var axis = revolveParams ? revolveParams.axis || "y" : sketch.frameSpace==="local" && sketch.frame ? "frame" : planeAxis(sketch.plane);
    if (p.axis !== axis) { p.axis = axis; changed = true; }
    var geometryChanged=false;
    if(revolveProjection && JSON.stringify(p.axisBasis || null)!==JSON.stringify(revolveProjection.axisBasis)){
      p.axisBasis=revolveProjection.axisBasis;geometryChanged=true;changed=true;
    }
    if(revolveProjection && JSON.stringify(p.revolveProfile || null)!==JSON.stringify(revolveProjection.revolveProfile)){
      p.revolveProfile=revolveProjection.revolveProfile;geometryChanged=true;changed=true;
    }
    if (axis==="frame" && JSON.stringify(p.frame)!==JSON.stringify(sketch.frame)) { p.frame=cloneData(sketch.frame); changed=true; geometryChanged=true; }
    if (axis==="frame" && p.support) {
      var supportBase=(Number(sketch.supportOffset)||0)+(Number(p.from)||0);
      if (p.supportBaseOffset!==supportBase) {p.supportBaseOffset=supportBase;changed=true;}
    }
    if (pts.length !== p.pts.length || pts.some(function (q, i) {
      return Math.abs(q.u - p.pts[i].u) > 1e-6 || Math.abs(q.v - p.pts[i].v) > 1e-6;
    })) {
      p.pts = pts;
      geometryChanged=true;
      changed = true;
    }
    if (holePts.length && (holePts.length !== (p.holes || []).length || holePts.some(function (loop, h) {
      var old = holeLoop((p.holes || [])[h], true);
      return loop.length !== old.length || loop.some(function (q, i) { return !old[i] || Math.abs(q.u-old[i].u)>1e-6 || Math.abs(q.v-old[i].v)>1e-6; });
    }))) {
      p.holes = holePts;
      geometryChanged=true;
      changed = true;
    }
    if (geometryChanged) {
      migrateBoundaryChangingProfileCuts(p);
      delete p.meshData;
      if ((p.cuts3d && p.cuts3d.length) || p.exactFillet || (p.exactOperations && p.exactOperations.length)) scheduleExactMesh(p);
    }
  });
  if (syncSweptSourceParts()) changed = true;
  return changed;
}

/* The same parametric promise, for the bodies that only recently started
   drawing: a sweep or a loft re-reads its sketches too. A snapshot with no
   `sketchSources` is a body from before this existed and is left frozen —
   re-deriving it would move geometry the user never asked to move. */
function syncSweptSourceParts() {
  var changed = false;
  var same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
  (E.def.parts || []).forEach(function (p) {
    if (isKernelBody(p) && p.kernel && p.sketchSources) {
      var resolved;
      try { resolved = resolveSweptSources(E.def, savedLoftSources(p.sketchSources, p.kernel.params?.sectionSegments), resolveProfilePoints); }
      catch (error) { resolved = null; } // An edited path may temporarily have open or disconnected joints.
      if (!resolved) { if (!p.profileError) { p.profileError = true; changed = true; } return; }
      if (p.profileError) { p.profileError = false; changed = true; }
      var next = kernelBodySpec(p.kernel.type, {...p.kernel.params, ...resolved});
      if (!same(next, p.kernel)) { p.kernel = next; delete p.meshData; queueKernelBody(p); changed = true; }
    }
    var entries = (p.merges3d || []).concat(p.cuts3d || []).filter(function (entry) { return entry && entry.sketchSources; });
    var touched = false;
    entries.forEach(function (entry) {
      var resolved;
      try { resolved = resolveSweptSources(E.def, savedLoftSources(entry.sketchSources, entry.sectionSegments), resolveProfilePoints); }
      catch (error) { resolved = null; }
      if (!resolved) return;
      if (resolved.sections) { for(var loftKey of ["sections","sectionSegments"])if(!same(resolved[loftKey],entry[loftKey])){entry[loftKey]=resolved[loftKey];touched=true;} return; }
      if (!same(resolved.profile, entry.profile)) { entry.profile = resolved.profile; touched = true; }
      if (!same(resolved.path, entry.path)) { entry.path = resolved.path; touched = true; }
      for(var key of ["pathSegments","profileSegments"])if(!same(resolved[key],entry[key])){entry[key]=resolved[key];touched=true;}
    });
    if (touched) { delete p.meshData; scheduleExactMesh(p); changed = true; }
  });
  return changed;
}

function syncFaceSupportedSketchFrames() {
  // Canonical supports refer to the body at their history step. The final
  // viewport may retain the same face name after a pocket or fillet changes it.
  // Exact regeneration resolves each support in its owning result.
  if(isCanonicalAuthoring())return false;
  var changed=false, topology=[];
  (E.def.parts || []).forEach(function(part){topology=topology.concat(topologyEntriesForPart(part));});
  ensureSketchDoc(E.def).forEach(function(sketch){
    if (!sketch.support || sketch.frameSpace!=="local") return;
    var match=topology.find(function(entry){return entry.persistentId===sketch.support.persistentId;});
    if (!match && sketch.support.semantic) match=topology.find(function(entry){return entry.kind==="face" && entry.ownerFeatureId===sketch.support.ownerFeatureId && entry.semantic===sketch.support.semantic;});
    if (!match || !match.descriptor || !match.descriptor.origin || !match.descriptor.normal) return;
    var offset=Number(sketch.supportOffset)||0, base=faceFrameOrigin(match.descriptor,sketch.frameAnchor), origin={
      x:base.x+match.descriptor.normal.x*offset,
      y:base.y+match.descriptor.normal.y*offset,
      z:base.z+match.descriptor.normal.z*offset,
    };
    var aligned=realignFrame(sketch.frame,origin,match.descriptor.normal);
    if (JSON.stringify(aligned)!==JSON.stringify(sketch.frame)) {sketch.frame=aligned;changed=true;}
  });
  if (changed) syncSketchDrivenParts();
  return changed;
}

function sketchDrivingConstraints(sketch, id) {
  return (sketch.constraints || []).filter(function (c) {
    return c.entity === id || c.a === id || c.b === id || c.point === id;
  });
}

/* The gate between sketch geometry and solid parts. Everything downstream keys
   off it — picking, the inspector, deletion — so a kind missing from this list
   gets handed to the solid-part code and reads a `pts` array that is not there. */
function isSketchObject(o) {
  return !!o && (SKETCH_ENTITY_TYPES.indexOf(o.type) >= 0 || (o.id && "x" in o && "y" in o));
}
/* Drawing a shape leaves it selected, so the next constraint or dimension
   lands on it without a second click. That convenience must not decide what a
   feature acts on: a cut asked for right after drawing would quietly take only
   the last rectangle. So a selection remembers whether a person made it. */
function markDrawnSelection(list) { E.ssel = [].concat(list); E.sselAuto = true; }

/* Model edges and corners picked for a relation live in E.topologySelection.
   A fresh (non-additive) pick or a miss in the sketch must drop them too, or
   the next Coincident quietly reuses an edge picked minutes ago. */
function dropSketchModelPicks() {
  if (E.authoring && E.authoring.phase === "sketch" && (E.topologySelection || []).some(function (item) { return item.kind === "edge" || item.kind === "vertex"; })) E.topologySelection = [];
}

function selectSketch(obj, additive) {
  E.sselAuto = false;
  if (!additive) dropSketchModelPicks();
  if (!obj) { if (!additive) { E.ssel = []; E.sel = null; } return; }
  var i = E.ssel.indexOf(obj);
  if (additive) {
    if (i >= 0) E.ssel.splice(i, 1); else E.ssel.push(obj);
  } else E.ssel = [obj];
  E.sel = E.ssel.length ? E.ssel[E.ssel.length - 1] : null;
}
function selectedModelEdges() {
  return (E.topologySelection || []).filter(function (reference) { return reference.kind === "edge"; });
}

/* A model corner picked for a relation. It is a derived, position-keyed
   reference, so the relation is recorded against the edge that ends there
   (see vertexEdgeBinding) and follows the rebuilt edge. */
function selectedModelVertices() {
  return (E.topologySelection || []).filter(function (reference) { return reference.kind === "vertex"; });
}

/* The edge reference a relation stores, and where on it (undefined = anywhere
   along it). Null when a picked vertex has no visible edge ending at it. */
function modelEdgeRelationTarget(reference) {
  if (reference.kind === "vertex") {
    var bound = vertexEdgeBinding(reference, sketchVisibleModelEdges());
    return bound ? { edge: topologyReferenceFromEntry(bound.edge), at: bound.at } : null;
  }
  return { edge: topologyReferenceFromEntry(reference) || createTopologyReference(reference.ownerFeatureId, "edge", reference.persistentId, reference.descriptor || {}), at: undefined };
}

function sketchVisibleModelEdges() {
  var out = [];
  var sketch = ensureSketch(E.def);
  (E.def.parts || []).forEach(function (part) {
    var edges = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "edge"; });
    // Tessellation vertices along a single exact rim aren't selectable model
    // corners. Otherwise the vertex pick tolerance can cover the entire oval.
    var curves = edges.filter(function (entry) { return ["ellipse","circle"].includes(entry.descriptor?.curve); });
    edges.forEach(function (entry) {
      if (exactEdgeForSegment(sketch, entry, curves) === entry) out.push(entry);
    });
  });
  return out;
}

function resolveIntersectionEdge(reference) {
  if (!reference) return null;
  var parts = E.def.parts || [];
  for (var i = 0; i < parts.length; i++) {
    var hit = topologyEntriesForPart(parts[i]).find(function (entry) { return entry.persistentId === reference.persistentId; });
    if (hit) return hit;
  }
  return null;
}

function selEntities() { return E.ssel.filter(function (o) { return SKETCH_ENTITY_TYPES.indexOf(o.type) >= 0; }); }
function selPoints() { return E.ssel.filter(function (o) { return o.type === undefined && "x" in o; }); }
function selLines() { return E.ssel.filter(function (o) { return o.type === "line"; }); }
function selCircles() { return E.ssel.filter(function (o) { return o.type === "circle" || o.type === "arc"; }); }
// Anything with a centre. Equal and concentric read this; tangent does not,
// because the solver's tangent residual is a circle's centre-to-line distance
// and has no meaning against an ellipse.
function selConics() { return E.ssel.filter(function (o) { return o.type === "circle" || o.type === "arc" || o.type === "ellipse"; }); }

function sketchSelectionSummary() {
  if (!E.def || !E.ssel.length) return "";
  var sketch = ensureSketch(E.def), points = new Map((sketch.points || []).map(function (p) { return [p.id, p]; }));
  var entities = selEntities(), pickedPoints = selPoints();
  if (entities.length > 1) {
    var total = entities.reduce(function (sum, entity) {
      if (entity.type === "line") { var line = lineData(entity, points); return sum + (line ? line.length : 0); }
      if (entity.type === "spline") return sum + splineLength(entity, points);
      if (entity.type === "ellipse") {
        var el = ellipseData(entity, points);
        // Ramanujan's approximation — good to better than a part in 10^5, and
        // the alternative is an elliptic integral for a status-bar readout
        if (!el) return sum;
        var h = Math.pow(el.rx - el.ry, 2) / Math.pow(el.rx + el.ry, 2);
        return sum + Math.PI * (el.rx + el.ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
      }
      var circle = circleData(entity, points);
      if (!circle) return sum;
      if (entity.type === "circle") return sum + Math.PI * 2 * circle.radius;
      var span = (circle.end - circle.start + Math.PI * 2) % (Math.PI * 2);
      return sum + span * circle.radius;
    }, 0);
    return entities.length + " " + t("selectedLabel") + " · Σ " + modelLengthText(total,8) + " " + modelLengthUnit();
  }
  if (entities.length === 1) {
    var entity = entities[0];
    if (entity.type === "spline") return "L " + modelLengthText(splineLength(entity, points),8) + " " + modelLengthUnit();
    if (entity.type === "point") {
      var point = sketchPoint(sketch, entity.p);
      return point ? "X " + modelLengthText(point.x,8) + " · Y " + modelLengthText(point.y,8) + " " + modelLengthUnit() : "";
    }
    if (entity.type === "line") {
      var line = lineData(entity, points);
      return line ? "L " + modelLengthText(line.length,8) + " " + modelLengthUnit() + " · " + Math.round(line.angle * 1800 / Math.PI) / 10 + "°" : "";
    }
    if (entity.type === "ellipse") {
      var one = ellipseData(entity, points);
      return one ? "Ø " + modelLengthText(one.rx * 2,8) + " × " + modelLengthText(one.ry * 2,8) + " " + modelLengthUnit() + " · "
        + Math.round((one.rot * 1800) / Math.PI) / 10 + "° · A "
        + modelAreaText(Math.PI * one.rx * one.ry) : "";
    }
    var circle = circleData(entity, points);
    return circle ? "R " + modelLengthText(circle.radius,8) + " " + modelLengthUnit() + (entity.type === "circle" ? " · A " + modelAreaText(Math.PI * circle.radius * circle.radius) : "") : "";
  }
  if (pickedPoints.length === 1) return "X " + modelLengthText(pickedPoints[0].x,8) + " · Y " + modelLengthText(pickedPoints[0].y,8) + " " + modelLengthUnit();
  return E.ssel.length + " " + t("selectedLabel");
}

/* Sketch hit test in model units. Points beat entities: a shared endpoint is
   the thing you almost always mean when you click where two lines meet. */
function hitSketch(uv, pointerType) {
  // A fingertip hides more of the line than a cursor does. Match the generous
  // acquisition band used by the 3D topology picker so a tap near thin sketch
  // geometry selects it reliably without changing mouse precision.
  var sketch = ensureSketch(E.def), tol = (pointerType === "touch" ? 14 : 7) / E.scl;
  // Points are only six pixels wide but carry the relations users most often
  // need at crowded intersections. Give them a slightly larger acquisition
  // band than curves; the nearest point still wins when two bands overlap.
  var pointTol = (pointerType === "touch" ? 18 : 10) / E.scl;
  if (sketch.frameSpace!=="local" && sketch.plane !== E.view) return null;
  var best = null, bd = pointTol;
  (sketch.points || []).forEach(function (p) {
    var d = Math.hypot(uv.u - p.x, uv.v - p.y);
    if (d < bd) { bd = d; best = p; }
  });
  if (best) return best;
  var points = new Map((sketch.points || []).map(function (p) { return [p.id, p]; }));
  bd = tol;
  (sketch.entities || []).forEach(function (e) {
    var d = Infinity;
    if (e.type === "line") {
      var l = lineData(e, points);
      if (!l) return;
      var ll = l.dx * l.dx + l.dy * l.dy;
      var t0 = ll ? clamp(((uv.u - l.a.x) * l.dx + (uv.v - l.a.y) * l.dy) / ll, 0, 1) : 0;
      d = Math.hypot(l.a.x + l.dx * t0 - uv.u, l.a.y + l.dy * t0 - uv.v);
    } else if(e.type==="spline"){
      var controls=splineControls(e,points);if(controls){var samples=sampleBezier(controls,.1/E.scl);for(var si=1;si<samples.length;si++){var pa=samples[si-1],pb=samples[si],dx=pb.x-pa.x,dy=pb.y-pa.y,den=dx*dx+dy*dy,st=den?clamp(((uv.u-pa.x)*dx+(uv.v-pa.y)*dy)/den,0,1):0;d=Math.min(d,Math.hypot(uv.u-pa.x-st*dx,uv.v-pa.y-st*dy));}}
    } else if (e.type === "ellipse") {
      var el = ellipseData(e, points);
      if (!el || el.rx < 1e-4 || el.ry < 1e-4) return;
      // distance to the rim via the point's parametric angle in the ellipse's
      // own frame — close enough to pick with, and never wrong by more than the
      // curvature between two samples
      var cos = Math.cos(el.rot), sin = Math.sin(el.rot);
      var ru = uv.u - el.center.x, rv = uv.v - el.center.y;
      var lx = ru * cos + rv * sin, ly = -ru * sin + rv * cos;
      var th = Math.atan2(ly / el.ry, lx / el.rx);
      d = Math.hypot(lx - Math.cos(th) * el.rx, ly - Math.sin(th) * el.ry);
    } else {
      var o = circleData(e, points);
      if (!o) return;
      d = Math.abs(Math.hypot(uv.u - o.center.x, uv.v - o.center.y) - o.radius);
      if (e.type === "arc") {
        // only the drawn sweep is pickable, not the rest of the circle
        var ang = Math.atan2(uv.v - o.center.y, uv.u - o.center.x);
        if (!angleInArc(ang, o.start, o.end)) d = Infinity;
      }
    }
    if (d < bd) { bd = d; best = e; }
  });
  return best;
}
// Arcs sweep counter-clockwise from start to end, matching how they are drawn.
function angleInArc(a, s, e) {
  var TAU = Math.PI * 2;
  var span = (e - s + TAU) % TAU, rel = (a - s + TAU) % TAU;
  return rel <= span + 1e-6;
}

/* ---- sketch entity creation ---- */
function addSketchCircle(centre, rim, snap) {
  var sketch = sketchForView();
  var r = Math.hypot(rim.u - centre.u, rim.v - centre.v);
  if (r < 1e-6) return null;
  var circle = {
    id: uid(), type: "circle", name: "Circle",
    c: snappedSketchPoint(sketch, centre, snap), r: r, construction: false,
  };
  sketch.entities.push(circle);
  resolveSketch(false);
  return circle;
}
function openCircularConversion(sketch, selectedEdge) {
  var convertedSelection=selCircles().find(function(entity){return entity.type==="circle" && (sketch.circleCopies || []).some(function(copy){return copy.entityId===entity.id;});});
  var candidates=[];
  (E.def.parts || []).forEach(function(part){topologyEntriesForPart(part).forEach(function(edge){if(edge.kind!=="edge")return;try{projectCircularEdge(sketch,edge);candidates.push(edge);}catch(error){/* Parallel complete circles only. */}});});
  // A picked edge expresses the user's intent more precisely than the order
  // in which topology enumeration happens to return the body's circles.
  var partialSelection=false;
  if(selectedEdge){
    try{projectCircularEdge(sketch,selectedEdge);if(!candidates.some(function(edge){return edge.persistentId===selectedEdge.persistentId;}))candidates.unshift(selectedEdge);
      else candidates.sort(function(a,b){return Number(b.persistentId===selectedEdge.persistentId)-Number(a.persistentId===selectedEdge.persistentId);});
    }catch(error){
      // A seam or a split arc can win the viewport pick even when the user
      // clicks the nearby full rim. Keep the command open so they can choose
      // an unambiguous complete edge by its radius and axial position.
      partialSelection=true;
      var radius=selectedEdge.descriptor?.radius, z=selectedEdge.descriptor?.origin?.z;
      if(Number.isFinite(radius))candidates.sort(function(a,b){
        var da=Math.abs(a.descriptor.radius-radius)+(!Number.isFinite(z)?0:Math.abs(a.descriptor.origin.z-z));
        var db=Math.abs(b.descriptor.radius-radius)+(!Number.isFinite(z)?0:Math.abs(b.descriptor.origin.z-z));
        return da-db || a.persistentId.localeCompare(b.persistentId);
      });
    }
  }
  if(!candidates.length){flash("No parallel circular edges are available");return;}
  openQuickForm({action:"faceboundary",icon:"ph-copy-simple",title:"Convert circular edge",hint:partialSelection?"The picked edge is a partial arc. Choose a complete circular edge by radius and Z position.":"Project an exact circle onto this sketch plane. It follows changes to the source edge.",fields:[
    {key:"source",label:"Source edge",type:"select",value:candidates[0].persistentId,choices:candidates.map(function(edge,index){return {value:edge.persistentId,label:(index+1)+" · radius "+edge.descriptor.radius.toFixed(4)+" cm · Z "+edge.descriptor.origin.z.toFixed(4)+" cm"};})},
    ...(convertedSelection?[{key:"replace",label:"Update selected circle",type:"checkbox",value:true}]:[])
  ],onApply:function(values){
    var source=candidates.find(function(edge){return edge.persistentId===values.source;});
    try{var projected=projectCircularEdge(sketch,source),made=appendToSketch("Convert circular edge",function(target){
      if(convertedSelection && values.replace)return [retargetConvertedCircle(target,convertedSelection.id,source)];
      var center=newSketchPoint(target,{u:projected.x,v:projected.y}),circle={id:uid(),type:"circle",c:center,r:projected.radius,construction:false};target.entities.push(circle);
      target.constraints.push({id:uid(),type:"fixed",point:center,x:projected.x,y:projected.y});
      target.constraints.push({id:uid(),type:"diameter",entity:circle.id,value:2*projected.radius});
      target.circleCopies=target.circleCopies || [];target.circleCopies.push({source:cloneData(source),entityId:circle.id});return [circle];
    });if(!made)return false;markDrawnSelection(made);E.sel=E.ssel[E.ssel.length-1];return true;}catch(error){flash(error.message);return false;}
  }});
}
function openSilhouetteConversion(sketch) {
  var candidates=[],selectedLine=selEntities().find(function(entity){return entity.type==="line" && !entity.construction && (sketch.entities || []).some(function(candidate){return candidate.id===entity.id;});});
  (E.def.parts || []).forEach(function(part){topologyEntriesForPart(part).forEach(function(face){
    if(face.kind!=="face")return;
    try{coneSilhouette(sketch,face);candidates.push(face);}catch(error){/* Only axial silhouettes belong to this sketch plane. */}
  });});
  if(!candidates.length){openCircularConversion(sketch);return;}
  openQuickForm({action:"faceboundary",icon:"ph-copy-simple",title:"Convert silhouette",hint:"Create a linked outline from a cylindrical or conical face. Zero length uses the whole edge.",fields:[
    {key:"source",label:"Source face",type:"select",value:candidates[0].persistentId,choices:candidates.map(function(face,index){return {value:face.persistentId,label:(index+1)+" · "+face.descriptor.surface+" · radius "+face.descriptor.radius.toFixed(4)+" cm"};})},
    ...(selectedLine?[{key:"replace",label:"Update selected line",type:"boolean",value:true}]:[]),
    {key:"side",label:"Side",type:"select",value:"normal",choices:[{value:"normal",label:"Upper"},{value:"opposite",label:"Lower"}]},
    {key:"fromEnd",label:"Keep end",type:"select",value:"lower",choices:[{value:"lower",label:"Axis start"},{value:"upper",label:"Axis end"}]},
    {key:"length",label:"Line length",type:"number",value:0,min:0,unit:"length"}
  ],onApply:function(values){
    var source=candidates.find(function(face){return face.persistentId===values.source;});
    try{
      var converted=coneSilhouette(sketch,source,values);
      var made=appendToSketch("Convert silhouette",function(target){
        if(selectedLine && values.replace)return [retargetSilhouetteLine(target,selectedLine.id,source,values,uid)];
        var a=newSketchPoint(target,{u:converted.a.x,v:converted.a.y}),b=newSketchPoint(target,{u:converted.b.x,v:converted.b.y});
        var line={id:uid(),type:"line",a:a,b:b,construction:false};target.entities.push(line);
        [[a,converted.a],[b,converted.b]].forEach(function(pair){target.constraints.push({id:uid(),type:"fixed",point:pair[0],x:pair[1].x,y:pair[1].y});});
        target.silhouetteCopies=target.silhouetteCopies || [];target.silhouetteCopies.push({source:cloneData(source),entityId:line.id,side:values.side,fromEnd:values.fromEnd,length:values.length});
        return [line];
      });
      if(!made)return false;markDrawnSelection(made);E.sel=E.ssel[E.ssel.length-1];return true;
    }catch(error){flash(error.message);return false;}
  }});
}
/* The model edges picked for Convert Entities, as the rebuilt topology knows
   them. A picked chord of a tessellated rim (an analytic cut names an ellipse's
   rim as dozens of short lines) stands for the exact curve it lies on. */
function convertEntitiesSource(sketch) {
  var source = [];
  selectedModelEdges().forEach(function (reference) {
    var entry;
    for (var part of E.def.parts || []) {
      var candidates = topologyEntriesForPart(part);
      var picked = candidates.find(function (item) { return item.persistentId === reference.persistentId; });
      if (picked) { entry = exactEdgeForSegment(sketch, picked, candidates); break; }
    }
    if (!entry) return;
    if (!source.some(function (item) { return item.persistentId === entry.persistentId; })) source.push(entry);
  });
  return source;
}

/* Convert Entities (SOLIDWORKS pp. 38-40: the countertop's backsplash takes two
   neighbouring top edges; the sink loft takes the cut's elliptical rim). Only
   the SELECTED model edges are converted, each into a sketch line, arc, circle
   or ellipse of its own kind, fully defined by onModelEdge relations that hold
   a topology reference, so the geometry follows the rebuilt body and survives
   save and reload (js/core/convert_entities.js). `construction` makes
   reference geometry instead. */
function convertModelEdgesToSketch(options) {
  var construction = !!(options && options.construction);
  var sketch = ensureSketch(E.def), source = convertEntitiesSource(sketch), skipped = [];
  if (!source.length) { flash(t("convertEdgesNone")); return false; }
  var made = appendToSketch(t(construction ? "opProjectSelectedEdges" : "opConvertEdges"), function (target) {
    var result = appendConvertedEdges(target, source, { construction: construction, makeId: uid, referenceOf: topologyReferenceFromEntry, resolveEdge: resolveIntersectionEdge });
    skipped = result.skipped;
    return result.entities.length ? result.entities : null;
  });
  if (!made) {
    // a refused solve explains itself; an edge that cannot convert says why
    if (skipped.length) flash(tf("convertEdgesSkipped", { reason: skipped[0].reason }));
    return false;
  }
  E.topologySelection = [];
  markDrawnSelection(made); E.sel = E.ssel[E.ssel.length - 1];
  refreshAll();
  flash(tf(construction ? "projectedSelectedDone" : "convertEdgesDone", { count: made.length })
    + (skipped.length ? " · " + tf("convertEdgesSkipped", { reason: skipped[0].reason }) : ""));
  return true;
}

/* The Convert Entities form: what is picked, what each pick becomes, and the
   construction choice. It stays open while the user picks edges in the sketch
   (Ctrl adds), so an empty selection is a prompt, not a dead end. Project opens
   the same form for selected edges. */
function openConvertEntities() {
  if (E.docType !== "part" || !E.authoring || E.authoring.phase !== "sketch") { flash(t("needSketchForTool")); return; }
  setTool("select");
  openQuickForm({
    action: "convertentities", icon: "ph-arrow-square-in", title: t("convertEntities"), hint: t("convertEntitiesHint"),
    fields: [{ key: "construction", label: t("convertForConstruction"), type: "boolean", value: false }],
    onApply: function (values) { return convertModelEdgesToSketch({ construction: values.construction === true }); },
  });
  refreshConvertEntitiesHint();
}

function refreshConvertEntitiesHint() {
  var hint = root && root.querySelector("#mdQuickSettings .md-feature-form-title small");
  if (!hint) return;
  var sketch = ensureSketch(E.def), source = convertEntitiesSource(sketch);
  var kinds = source.map(function (edge) {
    var preview = previewConvertedEdge(sketch, edge);
    return preview.ok ? t("convertKind_" + preview.curve.kind) : preview.reason;
  });
  hint.textContent = source.length ? tf("convertEntitiesPicked", { count: source.length }) + ": " + kinds.join(", ") : t("convertEntitiesHint");
}
function openFaceBoundary() {
  var sketch=ensureSketch(E.def),reference=E.authoring?.phase==="sketch" ? sketch.support || selectedSketchableFace() : selectedSketchableFace() || sketch.support;
  var selectedEdge=(E.topologySelection || []).find(function(item){return item.kind==="edge" && item.descriptor?.curve==="circle";});
  if(E.authoring?.phase==="sketch" && selectedEdge && selectedModelEdges().length===1){openCircularConversion(sketch,selectedEdge);return;}
  // picked model edges are a Convert Entities request, never a whole-face copy
  if(E.authoring?.phase==="sketch" && selectedModelEdges().length){convertModelEdgesToSketch();return;}
  if (!reference || reference.descriptor?.surface!=="plane") { if(E.authoring?.phase==="sketch")openSilhouetteConversion(sketch);else flash(t("faceBoundaryNeed")); return; }
  var part=selectedSolid() || (E.def.parts || []).find(function(p){return topologyEntriesForPart(p).some(function(e){return e.persistentId===reference.persistentId;});});
  if(!part){flash(t("faceBoundaryNeed"));return;}
  if(E.authoring?.phase!=="sketch"){chooseSketchReference(reference);sketch=ensureSketch(E.def);}
  reference=sketch.support || reference;
  var frame=cloneData(sketch.frame),doc=E.def,busy=false;
  openQuickForm({action:"faceboundary",icon:"ph-copy-simple",title:t("faceBoundary"),hint:t("faceBoundaryHint"),
    fields:[{key:"distance",label:t("faceBoundaryDistance"),type:"number",value:0,unit:"length"}],
    onApply:function(values,ownsForm){
      if(busy)return false;
      busy=true;flash(t("faceBoundaryBuilding"));
      var history=currentHistoryNode();
      exactDisplayBody(part).then(function(display){
        var brep=display.brep;
        try{
          // A form reopened under the same action name is not this request,
          // and an edit made while the body built moved the sketch it targets.
          if(!ownsForm())return;
          if(E.def!==doc || activeSketch()!==sketch || currentHistoryNode()!==history){flash(t("faceBoundaryStale"));return;}
          var loops=offsetFaceBoundary(brep,reference,frame,values.distance);
          var made=appendToSketch(t("faceBoundary"),function(target){return appendBoundarySketch(target,loops,uid);});
          if(!made)return;
          sketch.boundaryCopies=sketch.boundaryCopies || [];
          var sourceReference=cloneData(reference),bodyHead=cutTargetFeatureId(part);
          if(bodyHead)sourceReference.ownerFeatureId=bodyHead;
          sketch.boundaryCopies.push({source:sourceReference,distance:values.distance,entityIds:made.map(function(e){return e.id;}),associative:true});
          markDrawnSelection(made);E.sel=E.ssel[E.ssel.length-1];
          E.quickAction=null;closeFeaturePanel();refreshAll();flash(t("faceBoundaryDone"));
        }finally{display.release();busy=false;}
      }).catch(function(error){busy=false;if(ownsForm())flash(String(error.message||error));});
      return false;
    },
  });
}
function liveSketchFilletValues() {
  return {
    radius: E.sketchFilletRadius,
    dimension: E.sketchFilletDimension !== false,
    keepCorners: E.sketchFilletKeepCorners !== false,
  };
}

function selFilletCurves() { return E.ssel.filter(function (o) { return o.type === "line" || o.type === "arc"; }); }
function sketchFilletSelectionReady() {
  if (selPoints().length) return true;
  var curves = selFilletCurves();
  return selLines().length >= 2 || (curves.length === 2 && curves.some(function (o) { return o.type === "line"; }));
}

function applySketchFilletFromSelection(values) {
  var sketch = ensureSketch(E.def);
  var spec = {
    radius: Number(values && values.radius),
    dimension: !values || values.dimension !== false,
    keepConstrainedCorners: !values || values.keepCorners !== false,
    vertexId: selPoints().length ? selPoints()[selPoints().length - 1].id : null,
    entityIds: selFilletCurves().map(function (curve) { return curve.id; }),
  };
  if (!Number.isFinite(spec.radius) || spec.radius <= 0) { flash(t("sketchFilletNeedRadius")); return false; }
  if (!spec.vertexId && spec.entityIds.length < 2) { flash(t("sketchFilletNeed")); return false; }
  var before = cloneData(sketch);
  pushUndo(t("sketchFillet"));
  try {
    var made = filletSketchCorner(sketch, spec, uid);
    if (!resolveSketch(true)) {
      var filletIds = addedConstraintIds(sketch, before.constraints);
      var filletWhy = explainSketchConflict(sketch, { keep: filletIds });
      Object.assign(sketch, before);
      resolveSketch(false);
      H.discard();
      showSketchRefusal(sketch, t("sketchFillet") + " R " + Number(spec.radius.toFixed(3)) + " cm", filletIds, filletWhy);
      return false;
    }
    E.ssel = made.arc ? [made.arc] : [];
    E.sel = made.arc || null;
    return true;
  } catch (error) {
    Object.assign(sketch, before);
    H.discard();
    flash(String(error.message || error));
    return false;
  }
}

function openSketchFillet() {
  if (E.docType !== "part") { flash(t("needSketchForTool")); return; }
  if (isCanonicalAuthoring() && (!E.authoring || E.authoring.phase !== "sketch")) { flash(t("needSketchForTool")); return; }
  if (E.sketchFilletRadius == null) E.sketchFilletRadius = 1.27;
  if (E.sketchFilletDimension == null) E.sketchFilletDimension = true;
  if (E.sketchFilletKeepCorners == null) E.sketchFilletKeepCorners = true;
  setTool("sketchfillet");
  openQuickForm({
    action: "sketchfillet", icon: "ph-corners-out", title: t("sketchFillet"), hint: t("sketchFilletHint"),
    fields: [
      { key: "radius", label: t("sketchFilletRadius"), type: "number", value: E.sketchFilletRadius, min: 0.000001, unit: "length" },
      { key: "dimension", label: t("sketchFilletDimension"), type: "boolean", value: E.sketchFilletDimension !== false },
      { key: "keepCorners", label: t("sketchFilletKeepCorners"), type: "boolean", value: E.sketchFilletKeepCorners !== false },
    ],
    onLive: function (values) {
      if (fin(values.radius)) E.sketchFilletRadius = values.radius;
      E.sketchFilletDimension = values.dimension !== false;
      E.sketchFilletKeepCorners = values.keepCorners !== false;
    },
    onApply: function (values) {
      if (fin(values.radius)) E.sketchFilletRadius = values.radius;
      E.sketchFilletDimension = values.dimension !== false;
      E.sketchFilletKeepCorners = values.keepCorners !== false;
      if (sketchFilletSelectionReady()) return applySketchFilletFromSelection(values);
      return true;
    },
    onCancel: function () { if (E.tool === "sketchfillet") setTool("select"); },
  });
}

function openDimensionedCircle() {
  if (!E.authoring || E.authoring.phase !== "sketch") startSketchOnDefaultPlane("scirc");
  setTool("select");
  openQuickForm({
    action:"dimensionedcircle", icon:"ph-circle", title:"Dimensioned circle",
    hint:"Enter the center in the active sketch plane and a driving diameter. Fix center makes the circle fully defined.",
    fields:[
      {key:"x",label:"Center U",type:"number",value:0,unit:"length"},
      {key:"y",label:"Center V",type:"number",value:0,unit:"length"},
      {key:"diameter",label:"Diameter",type:"number",value:1,min:0.000001,unit:"length"},
      {key:"fixCenter",label:"Fix center",type:"boolean",value:true},
    ],
    onApply:function(values) {
      if (![values.x,values.y,values.diameter].every(fin) || values.diameter <= 0) {
        flash("Enter a positive diameter and finite center coordinates"); return false;
      }
      var made = appendToSketch("Dimensioned circle", function(sketch) { return addDimensionedCircle(sketch,values,uid); });
      if (!made) return false;
      markDrawnSelection(made); E.sel=E.ssel[E.ssel.length-1];
      return true;
    },
  });
}

function openDimensionedPolygon() {
  if (!E.authoring || E.authoring.phase !== "sketch") startSketchOnDefaultPlane("spoly");
  setTool("select");
  openQuickForm({
    action:"dimensionedpolygon", icon:"ph-hexagon", title:"Dimensioned polygon",
    hint:"Diameter is the circumscribed circle. Rotation sets the first vertex from +U. Fix center and rotation makes the polygon fully defined.",
    fields:[
      {key:"sides",label:"Sides",type:"number",value:6,min:3,max:24,step:1},
      {key:"x",label:"Center U",type:"number",value:0,unit:"length"},
      {key:"y",label:"Center V",type:"number",value:0,unit:"length"},
      {key:"diameter",label:"Circumscribed diameter",type:"number",value:1,min:0.000001,unit:"length"},
      {key:"rotation",label:"Rotation (degrees)",type:"number",value:0},
      {key:"fixCenter",label:"Fix center",type:"boolean",value:true},
      {key:"fixRotation",label:"Fix rotation",type:"boolean",value:true},
    ],
    onApply:function(values) {
      if (!Number.isInteger(values.sides) || values.sides < 3 || values.sides > 24 ||
          ![values.x,values.y,values.diameter,values.rotation].every(fin) || values.diameter <= 0) {
        flash("Enter 3–24 integer sides, a positive diameter, and finite center and rotation"); return false;
      }
      var made = appendToSketch("Dimensioned polygon", function(sketch) {
        try { return addDimensionedPolygon(sketch,values,uid); }
        catch (error) { flash(error.message); return null; }
      });
      if (!made) return false;
      markDrawnSelection(made); E.sel=E.ssel[E.ssel.length-1];
      return true;
    },
  });
}

function openCenterRectangle() {
  if (!E.authoring || E.authoring.phase !== "sketch") startSketchOnDefaultPlane("srect");
  setTool("select");
  openQuickForm({
    action:"centerrectangle", icon:"ph-rectangle", title:t("centerRectangle"), hint:t("centerRectangleHint"),
    fields:[
      {key:"width",label:t("fcFldWidth"),type:"number",value:10,min:0.000001,unit:"length"},
      {key:"height",label:t("fcFldHeight"),type:"number",value:10,min:0.000001,unit:"length"},
      {key:"x",label:t("rectangleCenterX"),type:"number",value:0,unit:"length"},
      {key:"y",label:t("rectangleCenterY"),type:"number",value:0,unit:"length"},
      {key:"fixCenter",label:t("rectangleFixCenter"),type:"boolean",value:false},
    ],
    onApply:function(values) {
      var made = appendToSketch(t("centerRectangle"), function(sketch) { return addCenterRectangle(sketch,values,uid); });
      if (!made) return false;
      markDrawnSelection(made); E.sel=E.ssel[E.ssel.length-1];
      return true;
    },
  });
}
function openCenterSlot() {
  if (!E.authoring || E.authoring.phase !== "sketch") startSketchOnDefaultPlane("sslot");
  setTool("select");
  openQuickForm({
    action:"centerslot", icon:"ph-selection", title:t("centerSlot"), hint:t("centerSlotHint"),
    fields:[
      {key:"length",label:t("slotCenterSpacing"),type:"number",value:2.54,min:0.000001,unit:"length"},
      {key:"width",label:t("fcFldWidth"),type:"number",value:1.27,min:0.000001,unit:"length"},
      {key:"x",label:t("rectangleCenterX"),type:"number",value:0,unit:"length"},
      {key:"y",label:t("rectangleCenterY"),type:"number",value:0,unit:"length"},
      {key:"fixCenter",label:t("rectangleFixCenter"),type:"boolean",value:false},
    ],
    onApply:function(values) {
      var made = appendToSketch(t("centerSlot"), function(sketch) { return addCenterSlot(sketch,values,uid); });
      if (!made) return false;
      markDrawnSelection(made); E.sel=E.ssel[E.ssel.length-1];
      return true;
    },
  });
}
function addSketchRectangle(a, b, snap) {
  if (Math.abs(b.u-a.u) < 0.1 || Math.abs(b.v-a.v) < 0.1) return null;
  var sketch = sketchForView();
  var ids = [
    snappedSketchPoint(sketch, {u:a.u,v:a.v}, snap), newSketchPoint(sketch, {u:b.u,v:a.v}),
    newSketchPoint(sketch, {u:b.u,v:b.v}), newSketchPoint(sketch, {u:a.u,v:b.v}),
  ];
  var lines = ids.map(function (id, i) {
    return {id:uid(),type:"line",name:"Line",a:id,b:ids[(i+1)%ids.length],construction:false,weight:Math.max(1,E.wallWidth/5)};
  });
  sketch.entities.push.apply(sketch.entities, lines);
  lines.forEach(function (line, i) { sketch.constraints.push({id:uid(),type:i%2 ? "vertical" : "horizontal",entity:line.id}); });
  resolveSketch(false);
  return lines;
}

/* An ellipse is a real solver entity: centre, both semi-axes and a tilt, each
   one a variable the solver drives. Drawn centre → major axis end → minor
   radius, which is the order every CAD package asks for. */
function addSketchEllipse(centre, major, minorDistance) {
  var rx = Math.hypot(major.u - centre.u, major.v - centre.v);
  var ry = Math.abs(minorDistance);
  if (rx < 1e-6 || ry < 1e-6) return null;
  var sketch = sketchForView();
  var ellipse = {
    id: uid(), type: "ellipse", name: "Ellipse",
    c: newSketchPoint(sketch, centre),
    rx: rx, ry: ry, rot: Math.atan2(major.v - centre.v, major.u - centre.u),
    construction: false,
  };
  sketch.entities.push(ellipse);
  resolveSketch(false);
  return ellipse;
}

export {
  addSketchCircle, addSketchEllipse, addSketchRectangle, adoptSketchForView,
  applySketchFilletFromSelection, bindPolygonSideControl, constraintMeasure,
  displayedCoreIssues, dropSketchModelPicks, hitSketch, isSketchObject,
  liveSketchFilletValues, markDrawnSelection, modelEdgeRelationTarget,
  modelRebuildPending, openCenterRectangle, openCenterSlot,
  openConvertEntities, openDimensionedCircle, openDimensionedPolygon,
  openFaceBoundary, openSketchFillet, refreshConvertEntitiesHint,
  resolveIntersectionEdge, resolveSketch, selCircles, selConics, selEntities,
  selFilletCurves, selLines, selPoints, selectSketch, selectedModelEdges,
  selectedModelVertices, sizeSketch, sketchFilletSelectionReady,
  sketchForView, sketchPlaneCaption, sketchProfilePresentation,
  sketchSelectionSummary, sketchVisibleModelEdges,
  syncFaceSupportedSketchFrames, syncHint, syncRetainedExactPreviewStatus,
  syncSketchDrivenParts, syncSketchOpenPathFeedback, syncStatus,
  watchSketchSize,
};

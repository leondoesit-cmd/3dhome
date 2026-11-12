/* The CAD editor's sketch workflow: camera, planes, references, face picking,
   workflow steps and views, split out of js/modeler.js. It shares the editor's
   state through live imports from ../modeler.js. */
import { documentLengthUnit, formatDocumentLength, lengthToDocument } from "../core/document_length_units.js";
import { faceFrameOrigin, frameFromPlane } from "../core/frame.js";
import { recordSketchInHistory } from "../core/parametric_document.js";
import { sketchFitViewport } from "../core/sketch_fit_viewport.js";
import { rebindReplacedSketchProfiles } from "../core/sketch_profile_rebind.js";
import { sketchGeometryBounds } from "../core/sketch_view_fit.js";
import { createSurfaceSketch, supportsSurfaceUV } from "../core/surface_uv.js";
import { createTopologyRegistry, resolveTopologyReference } from "../core/topology.js";
import { VIEW_PRESETS } from "../modeler_chrome.js";
import { syncModelerMobile } from "../modeler_mobile.js";
import { cloneData } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t } from "../modeler_strings.js";
import { resolveAssemblyWorkflow, resolveWorkflowStep, shouldResumeSketchSession, shouldSkipReferencePicker, sketchStartMode } from "../modeler_workflow.js";
import { offerProfileFeatures, syncCommandManager, syncSelectionFilters } from "../modeler/command_manager.js";
import { activeSketchFrame, documentDirty, invalidateSketchProjection, partUV, pushUndo, sameSketchContext, sketchProjection, standardPlaneFrame, toPx } from "../modeler/document_history.js";
import { syncTools } from "../modeler/document_save.js";
import { closedSketchProfile } from "./drawing_sheet_profiles.js";
import { drawSketch, drawingSheet, syncSheetPanel } from "./drawing_sheet_render.js";
import { flash } from "./drawing_sheet_touch.js";
import { el } from "../modeler/editor_dom.js";
import { regenerateExactModel } from "../modeler/export_measure.js";
import { clearFeaturePreview, cutTargetFeatureId } from "../modeler/feature_create.js";
import { fillInspectorTab } from "../modeler/inspector.js";
import { scheduleLibThumbs, setMode, syncHead } from "../modeler/library_io.js";
import { updatePreview } from "../modeler/library_panel.js";
import { activeParts, assemblyMateCount, brokenMateCount, countLabel, defBounds, featureTypeLabel, renderedParts } from "../modeler/library_store.js";
import { syncNotesAndMarkups } from "../modeler/notes_markups.js";
import { saveModelerPrefs } from "../modeler/prefs_snap.js";
import { adoptSketchForView, sizeSketch, sketchPlaneCaption, syncHint, syncStatus } from "../modeler/sketch_entities.js";
import { applyDimensionEditor, clearLiveDownstream, finishWallChain, openSelectedSmartDimension } from "../modeler/tree_assembly.js";
import { fitPreview } from "../modeler/view_modes.js";
import { consumedSketchIds, refreshViewportSelection } from "../modeler/viewport_decorations.js";
import { startSketchOnDefaultPlane, syncCoach, updateTourProgress } from "../modeler/welcome_coach.js";
import { addSketch, ensureSketch, ensureSketchDoc, pruneAbandonedSketches, solveSketch } from "../sketch_solver.js";
import { clamp, uid } from "../state.js";
import { getDomainUnit } from "../unit_settings.js";
import {
  ASSEMBLY_TAB_LABELS, ASSEMBLY_WORKFLOW, ASSEMBLY_WORKFLOW_ACTION,
  CAMERA_ONLY_VIEWS, E, H, MODEL_PLANE_TOOLS, PART_TAB_LABELS, PART_WORKFLOW,
  SKETCH_DRAW_TOOLS, SKETCH_MAX_SCALE, SKETCH_MIN_SCALE, SKETCH_TOOLS,
  histPanel, inspectorDirty, modelLibraryCache, motionPlaybackCancel,
  refreshAll, refreshAssemblyPosePreview, root,
} from "../modeler.js";

/* The plane the camera should look along for Normal To. Datum Top/Front/Right
   sketches have no sketch.frame, so fall back to the standard triad — orbitTo
   for Top is nearly degenerate (el≈86° with world-Y up). */
function sketchCameraFrame() {
  var frame = activeSketchFrame();
  if (frame) return frame;
  var sketch = E.def && ensureSketch(E.def);
  return standardPlaneFrame(E.view, sketch && sketch.offset);
}
/* Snap the camera square to the sketch plane (SolidWorks Normal To). Mid-sketch
   we do not steal the view unless asked — tool changes and chrome sync must
   not fight an orbit. Opening a sketch (when the preference is on), picking a
   face, Ctrl+8 and the toolbar command pass force=true. */
function orientModelToView(force) {
  if (!E.pv || E.mode !== "3d") return;
  if (!force && E.modelPlaneActive) return;
  var faceFrame = force && E.authoring?.phase !== "sketch" ? faceSketchAttachment() : null;
  var frame = faceFrame?.frame || sketchCameraFrame();
  // With no selected plane/face, Normal To uses the current principal datum;
  // an arbitrary orbit has no drafting plane, so use the Front datum explicitly.
  if(!frame && force)frame=standardPlaneFrame(['top','front','side'].includes(E.view)?E.view:'front',0);
  if (frame && E.pv.lookAtFrame) { E.pv.lookAtFrame(frame); return; }
  if (E.view === "top") E.pv.orbitTo(0, 1.5);
  else if (E.view === "front") E.pv.orbitTo(0, 0.05);
  else E.pv.orbitTo(Math.PI / 2, 0.05);
}
/* Top / Front / Right are world views, never aliases for Normal To.  The
   latter deliberately follows a selected planar face; sharing that path made
   Front keep looking down at a selected pocket floor while its button and
   measurement axes said X/Y. */
function orientStandardView(view) {
  if (!E.pv || E.mode !== "3d") return;
  var presetId=view==="side" ? "right" : view;
  var preset=VIEW_PRESETS.find(function(item){return item.id===presetId;});
  if (!preset || preset.az==null) return;
  E.pv.orbitTo(preset.az,preset.el);
}
function captureSketchCameraPose() {
  if (!E.pv || E.sketchCameraReturnPose) return;
  if (E.pv.place) E.pv.place();
  E.sketchCameraReturnPose = {
    az: E.pv.az, el: E.pv.el, dist: E.pv.dist,
    target: { x:E.pv.target.x, y:E.pv.target.y, z:E.pv.target.z },
  };
}
function restoreSketchCameraPose() {
  var pose = E.sketchCameraReturnPose;
  E.sketchCameraReturnPose = null;
  if (!pose || !E.pv) return false;
  E.pv.clearFixedFrame(false);
  E.pv.az = pose.az; E.pv.el = pose.el; E.pv.dist = pose.dist;
  E.pv.target.set(pose.target.x, pose.target.y, pose.target.z);
  E.pv.render();
  return true;
}
function cadSketchSnapshot() {
  var sketch = E.def && ensureSketch(E.def);
  var pts = (sketch && sketch.points) || [];
  var xs = pts.map(function (p) { return Number(p.x) || 0; });
  var ys = pts.map(function (p) { return Number(p.y) || 0; });
  var cam = E.pv && E.pv.cam && E.pv.cam.position;
  var previewRect = null;
  if (E.drag && E._mouse && (E.drag.mode === "draw" || E.drag.mode === "srect") && (E.tool === "rect" || E.tool === "srect")) {
    previewRect = [
      [E.drag.u,E.drag.v], [E._mouse.u,E.drag.v],
      [E._mouse.u,E._mouse.v], [E.drag.u,E._mouse.v],
    ].map(function (q) { var p=toPx(q[0],q[1]);return {x:p.x,y:p.y}; });
  }
  return {
    plane: sketch && sketch.plane,
    tool: E.tool,
    arcMode: E.arcTangent ? "tangent" : E.arcThreePoint ? "three" : (E.tool === "sarc" ? "center" : null),
    phase: E.authoring && E.authoring.phase,
    autoOrient: !!E.sketchNormalTo,
    hasFixedFrame: !!(E.pv && E.pv.fixedFrame),
    cam: cam ? { x: cam.x, y: cam.y, z: cam.z } : null,
    viewPose: E.pv ? {
      az:E.pv.az, el:E.pv.el, dist:E.pv.dist,
      target:{x:E.pv.target.x,y:E.pv.target.y,z:E.pv.target.z},
    } : null,
    pointCount: pts.length,
    screenPoints: pts.map(function (q) { var p=toPx(q.x,q.y);return {x:p.x,y:p.y}; }),
    entityTypes: ((sketch && sketch.entities) || []).map(function (entity) { return entity.type; }),
    constructionFlags: ((sketch && sketch.entities) || []).map(function (entity) { return !!entity.construction; }),
    constraintTypes: ((sketch && sketch.constraints) || []).map(function (constraint) { return constraint.type; }),
    points: pts.map(function (q) { return { id: q.id, x: q.x, y: q.y }; }),
    status: E.solveInfo && E.solveInfo.status,
    degreesOfFreedom: E.solveInfo ? E.solveInfo.degreesOfFreedom : null,
    previewRect: previewRect,
    width: xs.length ? Math.max.apply(null, xs) - Math.min.apply(null, xs) : 0,
    height: ys.length ? Math.max.apply(null, ys) - Math.min.apply(null, ys) : 0,
  };
}

function syncNormalToControls() {
  if (!root) return;
  var box = root.querySelector("#mdNormalTo");
  if (box) box.checked = !!E.sketchNormalTo;
}
function setSketchNormalTo(on) {
  E.sketchNormalTo = !!on;
  saveModelerPrefs();
  syncNormalToControls();
  syncModelerMobile();
}
function syncModelPlane() {
  if (!root) return;
  var active = E.mode === "3d" && E.modelPlaneActive;
  root.classList.toggle("md-model-sketching", active);
  /* A sketch laid over the model puts sketch geometry in front of the pointer
     without changing E.mode, so this — not setMode() — is where the Sketch
     filter becomes reachable and unreachable again. */
  syncSelectionFilters();
  var finish = root.querySelector("#mdFinishPlane");
  if (finish) finish.hidden = !active;
  var chip = root.querySelector("#mdSketchPlaneChip");
  if (chip) {
    chip.hidden = !active || E.docType !== "part";
    var label = root.querySelector("#mdSketchPlaneLabel");
    if (label && active) label.textContent = t("sketchingOn") + " " + sketchPlaneCaption();
  }
}
function finishModelPlane() {
  E.modelPlaneActive = false;
  E.wallPts = null; E.poly = null; E.arcPts = null; E.drag = null;
  setTool("select", true);
  if (!restoreSketchCameraPose() && E.pv) E.pv.clearFixedFrame(false);
  syncModelPlane();
  updatePreview();
}

function isCanonicalAuthoring() {
  return E.docType === "part" && E.def && E.def.metadata && E.def.metadata.authoringSystem === "parametric-v1";
}

function referencePlaneView(reference) {
  if (!reference) return "top";
  if (reference.id === "plane:front") return "front";
  if (reference.id === "plane:right") return "side";
  if (reference.id === "plane:top") return "top";
  var normal=reference.normal || reference.descriptor && reference.descriptor.normal || {x:0,y:1,z:0};
  var ax=Math.abs(normal.x||0),ay=Math.abs(normal.y||0),az=Math.abs(normal.z||0);
  return ay>=ax&&ay>=az ? "top" : az>=ax ? "front" : "side";
}

function referenceLabel(reference) {
  return reference && (reference.name || reference.semantic || reference.id || reference.persistentId) || "Reference";
}

function cancelReferenceSelection() {
  var picker=root && root.querySelector("#mdReferencePicker");
  if(picker)picker.hidden=true;
  E.facePick=null;syncFacePrompt();
  if(E.authoring && E.authoring.resumePhase==="sketch"){
    E.authoring.phase="sketch";E.authoring.resumePhase=null;E.authoring.workflowFocus="sketch";
    syncAuthoringWorkflow();
    return;
  }
  E.authoring.phase="model";E.authoring.featureType=null;E.authoring.workflowFocus="context";
  syncAuthoringWorkflow();
}

function chooseSketchReference(reference, preferredTool) {
  if(!reference)return;
  var stayIn3D = E.mode === "3d";
  var picker=root.querySelector("#mdReferencePicker");if(picker)picker.hidden=true;
  E.facePick=null;syncFacePrompt();
  pushUndo(t("newSketch"));
  var sketch=ensureSketch(E.def), isEmpty=!(sketch.entities || []).length && !(E.def.history || []).some(function(entry){return entry.kind==="sketch"&&entry.targetId===sketch.id;});
  var topology=reference.type==="topology-reference" || !!reference.persistentId;
  if(topology) {
    E.topologySelection=[cloneData(reference)];
    if(!attachSketchToSelectedFace(true,false)){H.discard();flash(t("needPlanarOrAnalytic"));cancelReferenceSelection();return;}
    sketch=ensureSketch(E.def);
  } else {
    var view=referencePlaneView(reference);
    if(!isEmpty)sketch=addSketch(E.def,view,0,referenceLabel(reference)+" sketch");
    sketch.plane=view;sketch.offset=0;sketch.referenceId=reference.id;sketch.name=referenceLabel(reference)+" sketch";
    delete sketch.support;delete sketch.supportOffset;
    if(!["plane:top","plane:front","plane:right"].includes(reference.id)){
      sketch.frame=frameFromPlane(reference.origin || {x:0,y:0,z:0},reference.normal || {x:0,y:1,z:0});
      sketch.frameSpace="local";
    } else {delete sketch.frame;delete sketch.frameSpace;}
    E.def.activeSketch=sketch.id;E.view=view;
  }
  recordSketchInHistory(E.def,sketch);
  E.def.metadata ||= {};E.def.metadata.authoringSystem="parametric-v1";
  E.lastSketchReferenceId=topology ? (reference.persistentId || sketch.referenceId) : reference.id;
  E.authoring={phase:"sketch",referenceId:sketch.referenceId,sketchId:sketch.id,featureType:null,sketchSelection:[sketch.id],preferredTool:preferredTool || null,workflowFocus:"sketch",resumePhase:null};
  /* Opening a sketch from the 3D model keeps you IN the 3D model: the sheet is
     laid over the solid rather than dropping you into a flat 2D view. Coming
     from 2D, stay in 2D. The automatic-orientation preference then looks square
     at the plane so a screen square is a plane square — same as SolidWorks. A
     face pick always snaps once, even if that preference is off: you asked to
     draw on that face, and it does not write the preference. Orbit afterwards
     is still allowed; the sheet follows the camera. */
  E.ssel=[];E.sel=null;
  if(stayIn3D){E.modelPlaneActive=true;syncModelPlane();}else setMode("2d");
  setCommandTab("sketch");setTab("sketch");
  if(preferredTool)setTool(preferredTool,true);else setTool("select",true);
  if(stayIn3D && (E.sketchNormalTo || topology)){
    captureSketchCameraPose();
    orientModelToView(true);
  }
  refreshAll();
  if(!stayIn3D || E.sketchNormalTo || topology)requestAnimationFrame(fitSketch);else drawSketch();
}

function selectedSketchableFace() {
  var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  return face && faceSketchAttachment() ? face : null;
}

function resumeSketchSession(preferredTool) {
  var picker=root && root.querySelector("#mdReferencePicker");
  if(picker)picker.hidden=true;
  E.authoring.phase="sketch";
  E.authoring.workflowFocus="sketch";
  E.authoring.resumePhase=null;
  setCommandTab("sketch");
  setTab("sketch");
  if(E.mode==="3d"){
    E.modelPlaneActive=true;
    syncModelPlane();
    if(E.sketchNormalTo){captureSketchCameraPose();orientModelToView(true);}
  }
  else if(E.mode!=="2d")setMode("2d");
  if(preferredTool)setTool(preferredTool,true);
  syncAuthoringWorkflow();
}

function showReferencePicker(preferredTool) {
  var picker=root && root.querySelector("#mdReferencePicker"),host=root && root.querySelector("#mdReferenceOptions");
  if(!picker||!host)return;
  E.facePick=null;syncFacePrompt();
  if(E.authoring.phase==="sketch")E.authoring.resumePhase="sketch";
  E.authoring.phase="reference";E.authoring.workflowFocus="reference";
  E.authoring.preferredTool=typeof preferredTool==="string" ? preferredTool : null;
  host.innerHTML="";
  var lastId=E.lastSketchReferenceId;
  var suggestedId=lastId || "plane:top";
  (E.def.references || []).filter(function(reference){return reference.type==="plane";}).forEach(function(reference){
    var suggested=reference.id===suggestedId;
    var hint=suggested ? (lastId===reference.id ? t("wfLastUsed") : t("wfSuggested"))+" · "+reference.id : reference.id;
    var button=el("button","md-reference-option"+(suggested?" selected":""),'<i class="ph ph-square-half"></i><span><b>'+referenceLabel(reference)+'</b><small>'+hint+'</small></span>');
    button.addEventListener("click",function(){chooseSketchReference(reference,E.authoring.preferredTool);});host.appendChild(button);
  });
  var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  if(face){var faceButton=el("button","md-reference-option selected",'<i class="ph ph-selection"></i><span><b>'+t("selectedFace")+'</b><small>'+(face.semantic || face.persistentId)+'</small></span>');faceButton.addEventListener("click",function(){chooseSketchReference(face,E.authoring.preferredTool);});host.prepend(faceButton);}
  picker.hidden=false;syncAuthoringWorkflow();
}

/* ---- "click the face you mean" ------------------------------------------
   A new sketch on a part that already has a solid does not open a dialog: the
   viewport becomes the picker. The model stays live under the prompt bar, the
   hover highlight already shows which face is under the cursor, and the click
   that selects the face is the same click that opens the sketch on it. An
   drawing-tool shortcut on an empty document sketches on the default plane;
   explicit New sketch opens the datum-plane picker before creating a sketch. */
function beginFacePick(preferredTool) {
  if(E.authoring.phase==="sketch")E.authoring.resumePhase="sketch";
  E.authoring.phase="reference";E.authoring.workflowFocus="reference";
  E.authoring.preferredTool=typeof preferredTool==="string" ? preferredTool : null;
  E.facePick={tool:E.authoring.preferredTool};
  E.topologySelection=[];
  // commandSelectionPrefer() forces "face" while E.facePick is set; the user's
  // own filter is left alone so it is still theirs when the pick is over.
  if(E.mode!=="3d")setMode("3d");
  /* The sketch sheet is a canvas laid over the model — leave it up and it eats
     the very click we are asking for. */
  if(E.modelPlaneActive){E.modelPlaneActive=false;syncModelPlane();}
  syncFacePrompt();
  flash(t("pickFaceTitle"));
  syncAuthoringWorkflow();
  refreshAll();
}
function syncFacePrompt() {
  var prompt=root && root.querySelector("#mdFacePrompt");
  if(prompt)prompt.hidden=!E.facePick;
  var canvas=root && root.querySelector("#mdPrev");
  if(canvas)canvas.style.cursor=E.facePick ? "crosshair" : "";
}
function cancelFacePick(openPicker) {
  var tool=E.facePick && E.facePick.tool || null;
  E.facePick=null;
  syncFacePrompt();
  if(openPicker){showReferencePicker(tool);return;}
  cancelReferenceSelection();
  refreshAll();
}
/* The click that lands on a face while the prompt is up. Returns true when it
   consumed the pick, so the normal selection path stops there. */
function facePickFromViewport(reference) {
  if(!E.facePick)return false;
  if(!reference || reference.kind!=="face"){refreshAll();return true;}
  E.topologySelection=[cloneData(reference)];
  if(!faceSketchAttachment()){flash(t("needPlanarOrAnalytic"));refreshAll();return true;}
  var tool=E.facePick.tool;
  E.facePick=null;
  syncFacePrompt();
  chooseSketchReference(E.topologySelection[0], tool);
  return true;
}
function beginSketchWorkflow(preferredTool, options) {
  if(E.docType!=="part")return;
  options=options || {};
  var forceNew=!!options.forceNew;
  if(shouldResumeSketchSession(E.authoring && E.authoring.phase, forceNew)){
    resumeSketchSession(typeof preferredTool==="string" ? preferredTool : null);
    return;
  }
  var face=selectedSketchableFace();
  var hasSolids=activeParts(E.def).length>0;
  var start=sketchStartMode({
    hasSketchableFace:!!face,
    hasSolids:hasSolids,
    wantsPlanePicker:!!options.planePicker || (forceNew&&!hasSolids),
  });
  if(start==="selected-face"&&shouldSkipReferencePicker(face)){
    chooseSketchReference(face, typeof preferredTool==="string" ? preferredTool : null);
    return;
  }
  if(start==="pick-face"){beginFacePick(preferredTool);return;}
  if(start==="default-plane"){
    startSketchOnDefaultPlane(typeof preferredTool==="string" ? preferredTool : "srect");
    return;
  }
  showReferencePicker(preferredTool);
}

function finishSketchWorkflow() {
  if(E.docType!=="part")return;
  if(!E.authoring || E.authoring.phase!=="sketch"){
    beginSketchWorkflow(null,{forceNew:true});
    flash(t("chooseReferenceFirst"));
    return;
  }
  var sketch=ensureSketch(E.def),run=solveSketch(sketch);
  /* Finishing is no longer refused. Blocking it taught people to delete
     dimensions until the message stopped, which REDUCES how well defined the
     sketch is — the opposite of what the block was protecting.
   *
     The two states it used to lump together are not the same thing. A sketch
     is "over-constrained" when it solved perfectly and merely carries a
     redundant dimension (see solveSketch: converged, zero DOF, rank short of
     the residual count) — that geometry is correct and there was never a
     reason to hold the solid hostage to it. "Conflicting" means the solver did
     not converge, so the points are wherever it gave up; that one finishes too,
     but it is stated plainly and the rebuild raises an error against the sketch
     node, which opens the diagnostics panel and fails the features downstream.
     Nothing here claims the geometry is right — it says what happened and lets
     the rest of the pipeline report on it. */
  if(run.status==="conflicting"){
    setTab("sketch");
    flash(t("sketchConflictWarn"));
  } else if(run.status==="over-constrained"){
    flash(t("sketchRedundantWarn"));
  }
  var consumed=consumedSketchIds(E.def).has(sketch.id);
  recordSketchInHistory(E.def,sketch);
  if(consumed && run.status!=="conflicting")rebindReplacedSketchProfiles(E.def,sketch.id);
  E.authoring.phase="model";E.authoring.sketchId=sketch.id;E.authoring.referenceId=sketch.referenceId;E.authoring.sketchSelection=[sketch.id];
  E.authoring.featureType=null;E.authoring.workflowFocus=consumed ? null : "feature";E.authoring.resumePhase=null;
  E.modelPlaneActive=false;setMode("3d");restoreSketchCameraPose();setCommandTab("features");setTab("parts");
  if(run.status!=="conflicting" && run.status!=="over-constrained"){
    flash(run.degreesOfFreedom ? t("sketchSavedDof") + " · " + run.degreesOfFreedom + " " + t("wfDof") : "✓ " + t("sketchFullySaved"));
  }
  refreshAll();
  if(consumed && isCanonicalAuthoring()){
    // Exact generated face names cannot be checked by the preliminary rebuild.
    // Publish the full dependent history when an existing sketch is finished.
    void regenerateExactModel("force");
  } else if(!consumed) offerProfileFeatures();
  syncAuthoringWorkflow();
}

function currentWorkflowStep() {
  var history=(E.def && E.def.history) || [];
  var last=history.length ? history[history.length-1] : null;
  return resolveWorkflowStep({
    phase:E.authoring && E.authoring.phase,
    featureType:E.authoring && E.authoring.featureType,
    workflowFocus:history.length ? E.authoring && E.authoring.workflowFocus : "context",
    lastHistoryKind:last && last.kind,
    hasClosedProfile:!!closedSketchProfile(),
    hasFeatureHistory:history.some(function(entry){return entry.kind==="feature";}),
    hasSketchHistory:history.some(function(entry){return entry.kind==="sketch";}),
  });
}

function activateWorkflowStep(step) {
  if(E.docType==="assembly"){
    var action=ASSEMBLY_WORKFLOW_ACTION[step];
    if(action){action();refreshAll();}
    return;
  }
  if(E.docType!=="part")return;
  if(step==="context"){
    E.authoring.workflowFocus="context";
    if(E.authoring.phase==="reference")cancelReferenceSelection();
    setTab("parts");
    syncAuthoringWorkflow();
    return;
  }
  if(step==="reference"){beginSketchWorkflow(null,{forceNew:true,planePicker:true});return;}
  if(step==="sketch"){
    if(E.authoring && E.authoring.phase==="sketch")resumeSketchSession();
    else beginSketchWorkflow();
    return;
  }
  if(step==="feature"){
    E.authoring.workflowFocus="feature";
    if(E.authoring.featureType){setCommandTab("features");syncAuthoringWorkflow();return;}
    if(closedSketchProfile()){
      if(E.authoring.phase==="sketch")finishSketchWorkflow();
      else{setCommandTab("features");offerProfileFeatures();}
      return;
    }
    setCommandTab("features");
    if(E.authoring.phase==="sketch")flash(t("profileEmpty"));
    syncAuthoringWorkflow();
    return;
  }
  if(step==="history"){
    E.authoring.workflowFocus="history";
    setTab("parts");
    setTab("hist");
    syncAuthoringWorkflow();
  }
}

function assemblyWorkflowState() {
  var components = (E.assembly && E.assembly.components) || [];
  var grounded = components.filter(function (component) { return component.grounded; }).length;
  var mates = assemblyMateCount(E.assembly);
  var broken = brokenMateCount();
  var clashes = (E.interferenceHits || []).length;
  var dirty = documentDirty();
  var workflow = resolveAssemblyWorkflow({
    components: components.length,
    hasLibrary: modelLibraryCache.length > 0,
    grounded: grounded,
    mates: mates,
    broken: broken,
    checked: !!E.interferenceChecked,
    dirty: dirty,
  });
  return {
    components: components.length, grounded: grounded, mates: mates, broken: broken,
    clashes: clashes, checked: !!E.interferenceChecked,
    phase: workflow.phase, stage: workflow.stage, active: workflow.active, complete: workflow.complete,
    details: [
      components.length ? countLabel(components.length, "assemblyComponentOne", "assemblyComponents") : t("wfNoComponents"),
      grounded ? grounded + " " + t("wfAnchored") : t("wfNoAnchor"),
      mates ? countLabel(mates, "matesCountOne", "matesCount") : t("wfNoMates"),
      broken ? countLabel(broken, "assemblyIssueOne", "assemblyIssues")
        : clashes ? clashes + " " + t("wfCheckClash")
        : E.interferenceChecked ? t("wfNoInterference") : t("wfCheckUnrun"),
      dirty ? t("dirtySave") : t("savedAssembly"),
    ],
  };
}

function syncInspectorTabLabels() {
  if (!root) return;
  var assembly = E.docType === "assembly";
  var labels = assembly ? ASSEMBLY_TAB_LABELS : PART_TAB_LABELS;
  Object.keys(labels).forEach(function (id) {
    var button = root.querySelector('[data-tab="' + id + '"]');
    if (!button) return;
    var caption = button.querySelector("span");
    if (caption) caption.textContent = t(labels[id]);
    var full = assembly ? t(labels[id]) : t(id === "shape" ? "tabShape" : id === "look" ? "tabLook" : "tabOps");
    button.title = full;
    button.setAttribute("aria-label", full);
  });
}

function syncAssemblyWorkflow() {
  var state = assemblyWorkflowState();
  root.querySelectorAll("[data-workflow-step]").forEach(function (button, index) {
    var heading = button.querySelector("b"), detail = button.querySelector("small");
    if (heading) heading.textContent = t(ASSEMBLY_WORKFLOW[index] || PART_WORKFLOW[index]);
    if (detail) detail.textContent = state.details[index] || "";
    button.setAttribute("aria-label", [heading && heading.textContent, detail && detail.textContent].filter(Boolean).join(" · "));
    button.classList.toggle("active", index === state.active);
    button.classList.toggle("complete", index < state.active || (index === state.active && state.complete));
    if (index === state.active) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  root.classList.remove("md-authoring-sketch");
  syncCoach();
}

function syncAuthoringWorkflow() {
  if(!root)return;
  if(E.docType==="assembly"){syncAssemblyWorkflow();return;}
  if(!E.def)return;
  root.querySelectorAll("[data-workflow-step]").forEach(function(button,index){
    var heading=button.querySelector("b");
    if(heading)heading.textContent=t(PART_WORKFLOW[index]);
  });
  var phase=E.authoring && E.authoring.phase || "model",steps=["context","reference","sketch","feature","history"];
  var active=steps.indexOf(currentWorkflowStep());
  if(active<0)active=0;
  root.querySelectorAll("[data-workflow-step]").forEach(function(button,index){
    button.classList.toggle("active",index===active);
    button.classList.toggle("complete",index<active);
    if(index===active)button.setAttribute("aria-current","step");
    else button.removeAttribute("aria-current");
  });
  var units=E.def.context && E.def.context.units || {length:getDomainUnit("details")};
  var context=root.querySelector("#mdWorkflowContext");if(context)context.textContent=units.length+" · "+(E.def.context && E.def.context.activeCoordinateSystemId || "origin");
  var sketch=ensureSketch(E.def),hasRecordedSketch=(E.def.history || []).some(function(entry){return entry.kind==="sketch"&&entry.targetId===sketch.id;}),reference=root.querySelector("#mdWorkflowReference");
  if(reference)reference.textContent=(hasRecordedSketch || sketch.referenceId || sketch.support) && phase!=="reference" ? sketchPlaneCaption() : t("wfChoosePlane");
  var sketchText=root.querySelector("#mdWorkflowSketch");if(sketchText){var info=E._solveSketchId===sketch.id&&E.solveInfo ? E.solveInfo : solveSketch(sketch);if(E._solveSketchId!==sketch.id){E.solveInfo=info;E._solveSketchId=sketch.id;}sketchText.textContent=(sketch.entities || []).length ? (info.status==="fully-constrained"?t("wfFullyDefined"):info.status==="conflicting"?t("dofConflict"):info.status==="over-constrained"?t("dofOver"):((sketch.constraints || []).length?t("wfPartialDefined")+" · ":t("wfUnderDefined")+" · ")+info.degreesOfFreedom+" "+t("wfDof")) : t("wfCreateProfile");}
  var feature=root.querySelector("#mdWorkflowFeature");if(feature)feature.textContent=E.authoring && E.authoring.featureType ? featureTypeLabel(E.authoring.featureType) : (closedSketchProfile() ? t("wfReadyExtrude") : t("wfTurnIntent"));
  var history=root.querySelector("#mdWorkflowHistory");if(history)history.textContent=(E.def.history || []).length+" "+t("wfEditableSteps");
  root.querySelectorAll("[data-workflow-step]").forEach(function(button){
    button.setAttribute("aria-label", Array.from(button.querySelectorAll("b,small")).map(function(label){return label.textContent;}).filter(Boolean).join(" · "));
  });
  root.classList.toggle("md-authoring-sketch",phase==="sketch");
  syncCoach();
}
function modelLengthUnit() {
  var document=E.docType==="assembly"?E.assembly:E.def;
  return documentLengthUnit(document?.context?.units?.length);
}
function setModelLengthUnit(value) {
  var document=E.docType==="assembly"?E.assembly:E.def;
  if(!document)return false;
  var unit=documentLengthUnit(value);if(unit===modelLengthUnit())return false;
  pushUndo(t("partUnits"));
  document.context ||= {};document.context.units ||= {};document.context.units.length=unit;
  if(document.documentProperties)document.documentProperties.lengthUnit=unit;
  syncHead();refreshAll();return true;
}
function modelLengthText(cm, digits=10) {
  return formatDocumentLength(cm, modelLengthUnit(), digits);
}
function modelAreaText(cm2) {
  var value=cm2*Math.pow(lengthToDocument(1,modelLengthUnit()),2);
  return String(Number(value.toPrecision(10)))+' '+modelLengthUnit()+'²';
}
function faceSketchAttachment(reference, exact) {
  var support=reference || (E.topologySelection || []).find(function(item){return item.kind==="face";});
  if (!support) return null;
  if(!exact && isCanonicalAuthoring() && E.brepRun){
    var supportPart=(E.def?.parts || []).find(function(part){return part.featureId===support.ownerFeatureId || part.id===support.partId;});
    var supportHead=cutTargetFeatureId(supportPart),supportResult=E.brepRun.results.get(supportHead);
    if(supportResult && supportResult.topology){
      var supportDescriptor=cloneData(support.descriptor || {});delete supportDescriptor.semantic;
      var supportResolution=resolveTopologyReference({kind:"face",descriptor:supportDescriptor},createTopologyRegistry(supportResult.topology),{threshold:.05});
      if(supportResolution.topology){
        support=topologyReferenceFromEntry(supportResolution.topology);
        // A surviving face can retain its original name while a pocket changes
        // its position. Depend on the displayed body, not that original feature.
        support.ownerFeatureId=supportHead;
      }
    }
  }
  if(support.descriptor && support.descriptor.surface!=="plane")return supportsSurfaceUV(support.descriptor)?{support:cloneData(support),surface:true}:null;
  var descriptor=support.descriptor || {}, normal=descriptor.normal || {};
  var ax=Math.abs(normal.x || 0), ay=Math.abs(normal.y || 0), az=Math.abs(normal.z || 0), dominant=Math.max(ax,ay,az);
  if (dominant<.5) return null;
  var plane=ay>=ax && ay>=az ? "top" : az>=ax ? "front" : "side";
  var origin=faceFrameOrigin(descriptor,"bounds-center");
  return {support:cloneData(support),plane:plane,offset:0,frame:frameFromPlane(origin,normal),frameAnchor:"bounds-center"};
}
function attachSketchToSelectedFace(forceNew, recordUndo) {
  if (!E.def) return false;
  var attachment=faceSketchAttachment();
  if (!attachment) return false;
  var sketch=ensureSketch(E.def);
  if(attachment.surface){if(recordUndo!==false)pushUndo(t("newSketch"));var surfaceSketch=createSurfaceSketch(attachment.support,{id:"sketch:surface:"+uid(),name:(attachment.support.semantic || "Surface")+" UV sketch"});E.def.sketches=(E.def.sketches || []).concat([surfaceSketch]);E.def.activeSketch=surfaceSketch.id;E.view="front";E.ssel=[];flash("✓ "+t("surfaceUnwrapped"));return true;}
  var same=sketch.support && sketch.support.persistentId===attachment.support.persistentId;
  if (same && !forceNew) return true;
  // Explicit reference selection already owns the outer sketch transaction.
  if (recordUndo!==false) pushUndo(t("newSketch"));
  if ((sketch.entities || []).length || sketch.support) sketch=addSketch(E.def,attachment.plane,attachment.offset,(attachment.support.semantic || "Face")+" sketch",attachment.support);
  else {
    sketch.plane=attachment.plane;
    sketch.offset=attachment.offset;
    sketch.name=(attachment.support.semantic || "Face")+" sketch";
    sketch.referenceId=attachment.support.persistentId;
    sketch.support=attachment.support;
  }
  sketch.frame=attachment.frame;
  sketch.frameSpace="local";
  sketch.frameAnchor=attachment.frameAnchor;
  sketch.supportOffset=0;
  E.def.activeSketch=sketch.id;
  E.view=attachment.plane;
  E.ssel=[];
  return true;
}
function setTool(id, keepPlaneState) {
  if (E.dimEditor && !applyDimensionEditor()) return;
  E.touchPrecision = null;
  if (E.mode === "drawing") {
    drawingSheet().setTool(id);
    E.tool = drawingSheet().getTool ? drawingSheet().getTool() : id;
    syncTools();
    syncHint();
    return;
  }
  if (id === "paint" || id === "note") {
    E.tool = id;
    if (E.mode !== "3d") setMode("3d");
    E.modelPlaneActive = false;
    if (id === "note" && !E.noteMode) E.noteMode = "callout";
    syncModelPlane();
    syncTools();
    syncHint();
    if (E.pv) {
      syncNotesAndMarkups(E.pv);
      E.pv.render();
    }
    return;
  }
  if(E.mode !== "drawing" && isCanonicalAuthoring()) {
    if(SKETCH_TOOLS.includes(id) && E.authoring.phase!=="sketch") {
      // Trim, Dimension, Extend, Offset and the constraint tool edit geometry;
      // handing them a brand-new empty sketch is a dead end that looks like a
      // mode change. Say what is missing instead.
      if(!SKETCH_DRAW_TOOLS.includes(id)) { flash(t("needSketchForTool")); return; }
      beginSketchWorkflow(id); return;
    }
    if(["rect","circle","sph","poly","rev","cut","cutc"].includes(id)) {
      var replacement=id==="rect"?"srect":id==="circle"?"scirc":null;
      if(replacement)beginSketchWorkflow(replacement);else flash(t("needSketchThenFeature"));
      return;
    }
  }
  var opensSketchPlane = MODEL_PLANE_TOOLS.includes(id);
  var openingModelPlane = E.mode === "3d" && !E.modelPlaneActive && !keepPlaneState && opensSketchPlane;
  /* With a sketch session already open, re-arming the surface resumes THAT
     sketch. Attaching to whatever face was still picked started a stray face
     sketch every time a drawing tool was chosen after leaving the surface. */
  var sessionOpen = E.authoring && E.authoring.phase === "sketch";
  var attachedToFace = openingModelPlane && !sessionOpen ? attachSketchToSelectedFace() : false;
  if (E.wallPts && id !== E.tool) finishWallChain(false);
  if (id !== E.tool) E.dynInput = null;
  if (id !== E.tool) { E.dimPick = []; E.dimSel = null; }
  E.tool = id;
  /* Arms the sheet, never disarms it: picking Select inside a sketch you are
     already drawing means "select in this sketch", not "leave it". */
  if (E.mode === "3d" && !keepPlaneState && opensSketchPlane) E.modelPlaneActive = true;
  E.poly = null;
  if (id !== "sarc") E.arcPts = null;
  if (id !== "sslot") E.slotPts = null;
  if (id !== "sell") E.ellPts = null;
  if(id!=="sspline")E.splinePts=null;

  // a tool that acts on a picked entity keeps the selection; a drawing tool
  // starts clean so the constraint palette is not offering stale pairs
  if (["wall", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "sspline", "rect", "circle", "sph", "poly", "rev", "cut", "cutc"].indexOf(id) >= 0) { E.ssel = []; E.sel = null; }
  // The line tool used to snap the view back to top, from when it drew
  // floor-plan walls. It is the generic sketch-line tool now and has to work on
  // whichever plane you are sketching on — forcing the view silently moved your
  // geometry into the top sketch.
  // Revolve is different: its profile is a height profile revolved about the
  // vertical axis, so it genuinely needs an elevation view.
  if (id === "rev" && E.view === "top") setView("front");
  syncModelPlane();
  syncTools();
  // Picking a face is an explicit statement about where you want to draw, so
  // the camera swings square onto that face even when automatic orientation is
  // off. A new sketch overlay with the preference on does the same for datum
  // planes. Neither path writes the preference.
  if (attachedToFace || (openingModelPlane && E.sketchNormalTo)) {
    captureSketchCameraPose();
    orientModelToView(true);
  }
  /* Professional selection-first workflow: geometry picked precisely in the
     tree or inspector is already a complete Smart Dimension request. Do not
     make the user find and pick the same entity again on a crowded canvas. */
  if (id === "dim" && openSelectedSmartDimension()) { updateTourProgress(); return; }
  if (attachedToFace) refreshAll(); else drawSketch();
  if (openingModelPlane) requestAnimationFrame(fitSketch);
  updateTourProgress();
}

function setView(id) {
  // A feature owns its profile while the user turns the model to pick limits.
  // Adopting another plane's sketch here changes both preview and commit inputs.
  if (CAMERA_ONLY_VIEWS.indexOf(id) >= 0 || (E.authoring && E.authoring.featureType)
      || (E.mode === "3d" && E.modelPlaneActive && E.authoring?.phase === "sketch")) {
    var cameraId = id === "side" ? "right" : id;
    var cameraPreset = VIEW_PRESETS.find(function (preset) { return preset.id === cameraId; });
    if (E.pv && cameraPreset) {
      if (E.pv.clearFixedFrame) E.pv.clearFixedFrame(false);
      E.pv.orbitTo(cameraPreset.az, cameraPreset.el);
    }
    drawSketch();
    return;
  }
  E.view = id;
  E.poly = null;
  E.arcPts = null;
  E.dimPick = [];
  E.dimSel = null;
  // Changing plane changes which sketch is editable, which every panel shows —
  // redrawing the canvas alone would leave the lists describing the old plane.
  var swapped = E.mode === "drawing" ? false : adoptSketchForView();
  if (swapped) pruneAbandonedSketches(E.def);
  if (E.mode === "3d") orientStandardView(id);
  syncTools();
  if (swapped) refreshAll(); else drawSketch();
  if (E.mode === "3d" && E.modelPlaneActive) fitSketch();
}
function zoomBy(dir) {
  if(E.modelPlaneActive && sketchProjection() && E.pv){
    if(dir==='fit')fitSketch();else{E.pv.zoomBy(dir==='in'?1/1.25:1.25);invalidateSketchProjection();drawSketch();}
    syncStatus();return;
  }
  if (E.mode === "3d" && !E.modelPlaneActive) {
    if (dir === "fit") fitPreview();
    else if (E.pv) E.pv.zoomBy(dir === "in" ? 1/1.25 : 1.25);
    return;
  }
  if (dir === "fit") { fitSketch(); return; }
  var k = dir === "in" ? 1.25 : 1 / 1.25;
  var W = E.cw / 2, Hh = E.ch / 2;
  var ns = clamp(E.scl * k, SKETCH_MIN_SCALE, SKETCH_MAX_SCALE);
  E.ox = W - ((W - E.ox) / E.scl) * ns;
  E.oy = Hh - ((Hh - E.oy) / E.scl) * ns;
  E.scl = ns;
  drawSketch();
  syncStatus();
}
/* Frame the whole model in the sketch the way the 3D view frames it — without
   this the only way back from a stray scroll was to close and reopen. */
function fitSketch() {
  // the observer re-measures a frame later, which is too late for anything
  // that fits immediately after opening
  sizeSketch();
  /* Sketching over the model, the sheet has no pan/zoom of its own — it is the
     camera's projection of the plane. Fitting means framing the model. */
  if (sketchProjection()) { fitPreview(); drawSketch(); syncStatus(); return; }
  var W = E.cw, Hh = E.ch;
  var canvasRect=E.cv?.getBoundingClientRect();
  if(!canvasRect || canvasRect.width<1 || canvasRect.height<1)canvasRect={left:0,top:0,width:W,height:Hh};
  var overlayRect=function(id){var node=root && root.querySelector(id);return node && !node.hidden ? node.getBoundingClientRect() : null;};
  var fitArea=sketchFitViewport(canvasRect,
    [overlayRect("#mdCoach"),overlayRect("#mdWorkflow"),overlayRect("#mdContextToolbar")],
    [overlayRect("#mdRailBottom"),overlayRect("#mdRailRow"),overlayRect("#mdStatus"),overlayRect("#mdEntityNav")]);
  var u0, u1, v0, v1;
  var hasParts = renderedParts(E.def).length > 0;
  if (hasParts) {
    if (activeSketchFrame()) renderedParts(E.def).forEach(function(part){
      var projected=partUV(part), us=[], vs=[];
      if(projected.type==="rect"){us=[projected.u0,projected.u1];vs=[projected.v0,projected.v1];}
      else if(projected.type==="circle"){us=[projected.u-projected.r,projected.u+projected.r];vs=[projected.v-projected.r,projected.v+projected.r];}
      else if(projected.type==="segments"){var segmentPoints=projected.segments.flatMap(function(segment){return [segment.a,segment.b];});us=segmentPoints.map(function(q){return q.u;});vs=segmentPoints.map(function(q){return q.v;});}
      else{us=projected.pts.map(function(q){return q.u;});vs=projected.pts.map(function(q){return q.v;});}
      u0=u0===undefined?Math.min.apply(null,us):Math.min(u0,Math.min.apply(null,us));u1=u1===undefined?Math.max.apply(null,us):Math.max(u1,Math.max.apply(null,us));
      v0=v0===undefined?Math.min.apply(null,vs):Math.min(v0,Math.min.apply(null,vs));v1=v1===undefined?Math.max.apply(null,vs):Math.max(v1,Math.max.apply(null,vs));
    });
    else {
      var b = defBounds(E.def);
      if (E.view === "top") { u0 = b.x0; u1 = b.x1; v0 = b.z0; v1 = b.z1; }
      else if (E.view === "front") { u0 = b.x0; u1 = b.x1; v0 = b.y0; v1 = b.y1; }
      else { u0 = b.z0; u1 = b.z1; v0 = b.y0; v1 = b.y1; }
    }
  }
  /* Sketch geometry counts too. Framing only the solids meant that a document
     which is all sketch — every document, right up until the first extrude —
     zoomed to nothing. Sketch points are already in this plane's u/v. */
  ensureSketchDoc(E.def).forEach(function (sketch) {
    if (!sameSketchContext(sketch,ensureSketch(E.def))) return;
    var geometry=sketchGeometryBounds(sketch);if(!geometry)return;
    u0=u0===undefined?geometry.u0:Math.min(u0,geometry.u0);u1=u1===undefined?geometry.u1:Math.max(u1,geometry.u1);
    v0=v0===undefined?geometry.v0:Math.min(v0,geometry.v0);v1=v1===undefined?geometry.v1:Math.max(v1,geometry.v1);
  });
  /* An empty part sketch is usually a small component, not a room. The old
     60 cm opening span made a 4 mm slot only a few pixels wide before the
     first entity existed, precisely when the user has no geometry to fit. */
  if (u0 === undefined) { u0 = -5; u1 = 5; v0 = -5; v1 = 5; }
  var du = Math.max(0.01, u1 - u0), dv = Math.max(0.01, v1 - v0);
  E.scl = clamp(Math.min(Math.max(1,fitArea.w - 80) / du, Math.max(1,fitArea.h - 80) / dv), SKETCH_MIN_SCALE, SKETCH_MAX_SCALE);
  var cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  E.ox = fitArea.x + fitArea.w / 2 - cu * E.scl;
  E.oy = fitArea.y + fitArea.h / 2 - (!activeSketchFrame() && E.view === "top" ? cv : -cv) * E.scl;
  drawSketch();
  syncStatus();
}

/* One pane visible per panel. The old editor stacked all five sections down the
   left panel, which overflowed the screen and left the parts list, history and
   library unreachable — the tabs are what make the panel fit at any height. */
function setTab(id) {
  if (!root) return;
  var b = root.querySelector('[data-tab="' + id + '"]');
  if (!b) return;
  var panel = b.closest(".md-panel");
  panel.querySelectorAll("[data-tab]").forEach(function (o) {
    var active = o === b;
    o.classList.toggle("on", active);
    o.setAttribute("aria-selected", active ? "true" : "false");
  });
  panel.querySelectorAll(".md-pane").forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-pane") === id); });
  if (id === "lib") scheduleLibThumbs();
  if (id === "hist" && histPanel) histPanel.refresh();
  if (typeof inspectorDirty !== "undefined" && inspectorDirty[id]) {
    fillInspectorTab(id);
    inspectorDirty[id] = false;
  }
}
function activeTab(side) {
  var p = root && root.querySelector('.md-tabs[data-side="' + side + '"] .md-pane.on');
  return p ? p.getAttribute("data-pane") : null;
}

function setCommandTab(id) {
  if (!root) return;
  /* Sketch and Features are both hidden in an assembly document, the way the
     inspector's sketch pane is (setDocumentType): every command on either one
     is part-only and greys out there, so the pair is pure dead chrome. Guarding
     on the pane merely existing let a caller — or a user already sitting on one
     — select a pane whose tab is not on screen, which reads as a ribbon that
     has gone blank. */
  if ((id === "sketch" || id === "features") && E.docType === "assembly") id = "assembly";
  if (!root.querySelector('[data-command-pane="' + id + '"]')) return;
  E.commandTab = id;
  root.querySelectorAll("[data-cmdtab]").forEach(function (b) {
    var on = b.getAttribute("data-cmdtab") === id;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  root.querySelectorAll("[data-command-pane]").forEach(function (p) {
    p.classList.toggle("on", p.getAttribute("data-command-pane") === id);
  });
  if (document.body.classList.contains("compact-nav")) {
    const sheet = root.querySelector("#md-sheet");
    if (sheet) sheet.querySelectorAll(".md-commandmanager, .md-command-panes, .md-command-pane, #md-sheet-body").forEach(function (panel) {
      panel.scrollTop = 0;
    });
  }
}

function closeFeaturePanel(options = {}) {
  E.quickFormInstance?.dismiss();
  if(motionPlaybackCancel)motionPlaybackCancel();
  E.collectingFeature = false;
  if (!root) return;
  var host = root.querySelector("#mdQuickSettings");
  if (host) host.hidden = true;
  if(E.authoring)E.authoring.repairMarker=null;
  /* Dismissing the form dismisses its ghost body. Several callers used to close
     the panel without clearing the preview, which left an approximate (or a
     half-built exact) finish body in the scene until the next full rebuild. */
  clearFeaturePreview(false);
  /* The badge goes with the form it lives on, and a debounced downstream run
     left armed would re-lay the document after the edit was dismissed. */
  clearLiveDownstream(null);
  if(options.drawingOnly && E.mode==='drawing'){drawSketch();syncSheetPanel();}
  else if(options.assemblyPoseOnly && E.docType==="assembly" && refreshAssemblyPosePreview())refreshViewportSelection();
  else updatePreview();
  syncCommandManager(); // puts the ribbon button that opened the form back out
}

export {
  activateWorkflowStep, activeTab, assemblyWorkflowState,
  attachSketchToSelectedFace, beginSketchWorkflow, cadSketchSnapshot,
  cancelFacePick, cancelReferenceSelection, captureSketchCameraPose,
  chooseSketchReference, closeFeaturePanel, currentWorkflowStep,
  facePickFromViewport, faceSketchAttachment, finishModelPlane,
  finishSketchWorkflow, fitSketch, isCanonicalAuthoring, modelAreaText,
  modelLengthText, modelLengthUnit, orientModelToView, referenceLabel,
  referencePlaneView, restoreSketchCameraPose, selectedSketchableFace,
  setCommandTab, setModelLengthUnit, setSketchNormalTo, setTab, setTool,
  setView, showReferencePicker, syncAssemblyWorkflow, syncAuthoringWorkflow,
  syncFacePrompt, syncInspectorTabLabels, syncModelPlane,
  syncNormalToControls, zoomBy,
};

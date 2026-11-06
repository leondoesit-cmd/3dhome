/* The CAD editor's new model and document type, assembly save, worker activity,
   feature editor, mate inspector and cabinet/ops panes, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { beltDiameterValue } from "../cad_belt_mate.js";
import { setGearMatePhase } from "../cad_gear_motion.js";
import { validLimitMateBounds } from "../cad_mate_model.js";
import { exactMateReferenceChoices, planarMateFaceChoices } from "../cad_mate_reference_choices.js";
import { setTopologyMateValue } from "../cad_mate_value_controls.js";
import { setRackPinionMateDrive, setRackPinionMateReferences, setRackPinionMateSettings } from "../cad_rack_pinion_controls.js";
import { setRotationLimitMateDrive, setRotationLimitMateReferences, setRotationLimitMateSettings } from "../cad_rotation_limit_controls.js";
import { setScrewMateCoupledMotion, setScrewMateDrive, setScrewMateHandedness } from "../cad_screw_controls.js";
import { sheetPlate } from "../cad_sheet_hinge.js";
import { addEdgeFlange, createSheetMetalPart, flatPattern, flatPatternSvg } from "../cad_sheet_metal.js";
import { validateThreadFit } from "../cad_thread.js";
import { assemblyMobilityReport } from "../core/assembly_mobility_status.js";
import { componentTopology } from "../core/assembly_structure.js";
import { cadWorkerActivity, cadWorkerAvailable, subscribeCadWorkerActivity, topologyInCadWorker } from "../core/cad_worker_client.js";
import { setDocumentDescription } from "../core/custom_properties.js";
import { lengthFromDocument, lengthToDocument } from "../core/document_length_units.js";
import { documentFromPreset } from "../core/document_presets.js";
import { draftFaceChoices } from "../core/draft_face_choices.js";
import { drawingFromTemplate } from "../core/drawing_presets.js";
import { verifiedExactTopology } from "../core/exact_topology_cache.js";
import { setExtrudeFeatureOperation } from "../core/extrude_operation_edit.js";
import { featureSpec } from "../core/feature_catalog.js";
import { canonicalFeatureTopologyReferences, featureInputStage } from "../core/feature_input_stage.js";
import { refreshedExtrudeProfile } from "../core/feature_profile_refresh.js";
import { holeSupportChoiceReference, holeSupportChoices } from "../core/hole_support_choices.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { updateFeatureDefinition } from "../core/parametric_document.js";
import { publishRebuildStatus, rebuildParametricDocument } from "../core/parametric_rebuild.js";
import { assertStandaloneRevolve, isSketchAxis, isStandaloneSketchAxisRevolve, revolvePreviewAxis } from "../core/revolve_geometry.js";
import { reattachFeatureSketchSupport, sketchSupportNeedsUpdate } from "../core/sketch_support_edit.js";
import { rebindTopologyMate } from "../core/topology_mate_rebind.js";
import { getLang } from "../i18n.js";
import { readFeatureParameterForm, validateFeatureInputs } from "../modeler_feature_form.js";
import { cadIcon } from "../modeler_icons.js";
import { bindMateNumericCommit } from "../modeler_mate_numeric_commit.js";
import { revealModelerFeatureForm } from "../modeler_mobile.js";
import { cloneData, loopCentroid, mirrorProjectionPart, movePart, partBounds, resetClonedPartIdentity, rotPartY } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { openQuickForm, syncCommandManager } from "../modeler/command_manager.js";
import { addInspectorTopologyMate, addMate, clampMateAngle, componentLabel, concentricAxisDirectionControl, finalMateTopology, highlightFeatureIssueBanner, mateHolderById, mateRow, openMateAngleForm, openMateBeltForm, openMateDistanceForm, openMateGearForm, openMateRackPinionForm, openMateRotationLimitForm, refreshComponentMateReferences, refreshParts, rejectFlexibleSpringPreview } from "../modeler/component_mates.js";
import { assemblySaveSession, confirmDiscardDocument, currentHistoryNode, markDocumentClean, pushUndo, reconcileModelerDraft, syncDirty } from "../modeler/document_history.js";
import { closeEvalCard } from "../modeler/document_outputs.js";
import { closedSketchProfile } from "./drawing_sheet_profiles.js";
import { flash, report } from "./drawing_sheet_touch.js";
import { btn, el, markUnavailable, namedButton } from "../modeler/editor_dom.js";
import { downloadBytes, scheduleExactRestore } from "../modeler/export_measure.js";
import { clearFeaturePreview, cutTargetFeatureId, featureField, resolvedRevolve, retargetSweepHelix, setFeatureReferencesFromForm } from "../modeler/feature_create.js";
import { cancelFeatureParameterEdit, dependencyReferenceId, syncLiveFeatureEdit } from "../modeler/feature_tree.js";
import { addShellFaceThicknessControls, registerFeatureForm, renderFinishEdgeList } from "../modeler/finish_preview.js";
import { fillInspector } from "../modeler/inspector.js";
import { applyAssemblyMates, invalidateInterference, redrawTrackedUpdates, saveAssemblies, solveAssembly } from "../modeler/library_assembly_state.js";
import { cancelExactModelRebuild, refreshLib, setMode, syncHead } from "../modeler/library_io.js";
import { activeParts, addPart, applyTrackedUpdates, componentDef, mateIssuesFor, mateReboundFor, newAssembly, topologyEntriesForPart } from "../modeler/library_store.js";
import { quickShellPart, renderFeatureParameterForm, selectedSolid } from "../modeler/part_commands.js";
import { invalidatePartMeshAfterEdit, newDef } from "../modeler/prefs_snap.js";
import { hingeForm } from "../modeler/sheet_hinge_form.js";
import { constraintCaption, showSketchRefusal } from "../modeler/sketch_dimension_editor.js";
import { isSketchObject, resolveSketch } from "../modeler/sketch_entities.js";
import { closeFeaturePanel, faceSketchAttachment, isCanonicalAuthoring, modelLengthText, modelLengthUnit, setTab, syncAuthoringWorkflow } from "../modeler/sketch_workflow.js";
import { pickPartsFor } from "../modeler/topology_pick.js";
import { editHoleWizardSketch, emptyState, syncProjectionFromFeature, topologyMateLabel } from "../modeler/tree_assembly.js";
import { assemblyPickedRefs, mateReferenceFromPick, mateTypeFits, stampComponentRef, ungroundedComponentPair } from "../modeler/viewport_input.js";
import { updateTourProgress } from "../modeler/welcome_coach.js";
import { ensureSketch, entityPoints, explainSketchConflict, removeSketchEntity, sketchById } from "../sketch_solver.js";
import { toggleConstruction } from "../sketch_trim.js";
import { fin, uid } from "../state.js";
import {
  E, H, MATE_PALETTE, assemblyOpenBaseline, exactWorkerActivitySubscribed,
  exactWorkerActivityTimer, lastAssemblySaveConflict, mateReferenceRefreshes,
  openParametricFeature, propGen, refreshAll, refreshSelection, root,
  set_assemblyOpenBaseline, set_assemblySolveFresh, set_coreRunFresh,
  set_exactWorkerActivitySubscribed, set_exactWorkerActivityTimer,
  set_libraryOpenBaseline, set_partHistoryMarker, set_propGen,
} from "../modeler.js";

async function newModel(template) {
  if (!await confirmDiscardDocument("unsavedNew")) return;
  E.quickFormInstance?.dismiss(true);
  closeEvalCard();
  E.contextEdit=null;
  E.lastOperation = null;
  E.sketchCameraReturnPose = null;
  /* Selection outlives the document unless it is cleared here. Every topology
     reference names the feature it came from, so a face left selected from the
     discarded model pointed at a feature id the new document has never heard
     of — and the "Create sketch on reference" button went on offering it.
     Taking that offer attached a sketch to a missing feature, so a brand-new
     part opened already carrying rebuild errors, with the broken reference
     naming a feature that no longer appeared anywhere in its tree. */
  E.topologySelection = [];
  E.hoverTopology = null;
  E.ssel = [];
  E.facePick = null;
  E.collectingFeature = false;
  E.selectedReferenceId = null;
  E.mobileAddSelection = false;
  if (E.docType === "assembly") {
    E.assembly = template?.kind==='assembly-template'?documentFromPreset(newAssembly(),template,'assembly-template'):newAssembly();
    if(template?.kind==='assembly-template')E.assembly.name='Assembly from '+template.name;
    set_assemblyOpenBaseline(null);
    invalidateInterference();
    E.componentSel = [];
    E.sel = null;
    H.clear().seed();
    markDocumentClean();
    reconcileModelerDraft();
    syncHead();
    refreshLib();
    refreshAll();
    setTab("parts");
    return;
  }
  E.def = newDef();
  set_partHistoryMarker({savedEdit:0});
  E.sheet?.resetSession();
  if(template?.kind==='part-template'){E.def=documentFromPreset(E.def,template,'part-template');E.def.name='Part from '+template.name;}
  if(template?.kind==='drawing-template'){E.def.drawing=drawingFromTemplate(template);E.def.name='Drawing from '+template.name;}
  set_libraryOpenBaseline(null);
  E.srcItem = null;
  E.sel = null;
  E.authoring={phase:"model",referenceId:null,sketchId:null,featureType:null,sketchSelection:[],featureSelection:[],workflowFocus:"context"};
  H.clear().seed();
  markDocumentClean();
  reconcileModelerDraft();
  syncHead();
  refreshAll();
  setTab("parts");
  if(template?.kind==='drawing-template')setMode('drawing');
}

async function saveAssemblyDocument() {
  if(rejectFlexibleSpringPreview())return;
  if (!E.assembly) E.assembly = newAssembly();
  E.assembly.name = root.querySelector("#mdName").value || E.assembly.name;
  setDocumentDescription(E.assembly, root.querySelector("#mdDescription").value);
  var owner=E.assembly, session=assemblySaveSession(owner), history=currentHistoryNode();
  var generation=H.generation;
  var edit=H.editRevision("assembly");
  var resolved=applyTrackedUpdates(owner);
  applyAssemblyMates(owner);
  if(resolved)redrawTrackedUpdates();
  var saved = cloneData(owner);
  if (!await saveAssemblies(saved,{expected:assemblyOpenBaseline})) {
    report(t("reportKickerSave"), t("saveAssemblyFailed"), t(lastAssemblySaveConflict ? "saveAssemblyConflict" : "saveStorageFull"));
    return;
  }
  if(assemblySaveSession(E.assembly)!==session)return;
  set_assemblyOpenBaseline(cloneData(saved));
  // A tab switch changes which marker the UI reads. This write belongs to
  // the captured assembly session and history tree, even while Part is active.
  session.savedEdit=edit;
  if(E.docType!=="assembly"){
    reconcileModelerDraft();
    return;
  }
  refreshLib();
  if(E.assembly!==owner || H.generation!==generation || currentHistoryNode()!==history || H.editRevision("assembly")!==edit){
    // Context editing may already have started a new tree with reused node IDs.
    syncDirty();reconcileModelerDraft();return;
  }
  flash("✓ " + t("savedAssembly"));
  markDocumentClean();
  reconcileModelerDraft();
  updateTourProgress();
}

function syncExactWorkerActivity(){
  if(!exactWorkerActivitySubscribed && cadWorkerAvailable()){
    set_exactWorkerActivitySubscribed(true);
    subscribeCadWorkerActivity(function(){syncExactWorkerActivity();});
  }
  var st=root && root.querySelector("#mdStatus");
  if(!st)return;
  var jobs=cadWorkerActivity().filter(function(job){return job.scope!=="interference";});
  var chip=st.querySelector(".md-exact-activity");
  if(!jobs.length){if(chip)chip.remove();if(exactWorkerActivityTimer){clearInterval(exactWorkerActivityTimer);set_exactWorkerActivityTimer(0);}return;}
  if(!chip){
    chip=el("span","md-exact-activity");chip.setAttribute("aria-live","polite");
    chip.appendChild(el("span","md-exact-activity-text"));
    var cancel=btn("Cancel",function(event){event.stopPropagation();cancelExactModelRebuild();flash("Exact computation cancelled");},"md-cancel-exact");
    cancel.title="Cancel this tab's pending exact computations";cancel.setAttribute("aria-label","Cancel exact computation");chip.appendChild(cancel);
    st.appendChild(chip);
  }
  var job=jobs.find(function(item){return item.progress;}) || jobs[0];
  var seconds=Math.floor((Date.now()-job.startedAt)/1000);
  chip.querySelector(".md-exact-activity-text").textContent=(job.progress?.stage==="loading-runtime"?"Loading CAD runtime · ":job.progress?.stage==="restore"?"Restoring exact geometry · ":job.progress && job.progress.stage!=="queued"?"Computing exact geometry · ":"Queued exact geometry · ")+(job.progress?.name || job.name)+" · "+seconds+"s"+(jobs.length>1?" · "+(jobs.length-1)+" queued":"")+" ";
  if(!exactWorkerActivityTimer)set_exactWorkerActivityTimer(setInterval(syncExactWorkerActivity,1000));
}

function openFeatureEditor(feature) {
  if (!E.def || !E.authoring || !feature) return;
  if(feature.type==='hole' && feature.params?.holeProfileSketchId){
    var profileSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===feature.params.holeProfileSketchId;});
    if(profileSketch){editHoleWizardSketch(profileSketch);return;}
    flash('Hole profile sketch is missing; repair its history reference');return;
  }
  var host=root && root.querySelector("#mdQuickSettings"),spec=featureSpec(feature.type);if(!host||!spec)return;
  E.quickFormInstance?.dismiss();
  if(E.authoring.featureEdit)cancelFeatureParameterEdit(true);
  if(E.authoring.featurePreviewState){
    E.quickAction=null;E.collectingFeature=false;
    clearFeaturePreview(false);
  }
  pushUndo("Edit "+feature.name);E.authoring.featureEdit={featureId:feature.id,snapshot:cloneData(feature),history:currentHistoryNode(),historyName:E.def.history?.find(item=>item.targetId===feature.id)?.name};
  var scope=registerFeatureForm(host,feature.type);host=scope.content;
  E.authoring.featureType=feature.type;E.authoring.editFeatureId=feature.id;
  if(["fillet","chamfer"].includes(feature.type)){
    E.authoring.featurePreviewState=feature;
    E.topologySelection=canonicalFeatureTopologyReferences(E.def,cloneData(feature.references?.topology || []));
    feature.references.topology=cloneData(E.topologySelection);
    var finishCompiled=compileKernelFeatureTree(E.def),finishInput=feature.inputs?.[0];
    E.authoring.finishEditTopology=finishCompiled.ok ? verifiedExactTopology(E.def,finishCompiled.features).get(finishInput) || null : null;
  }
  host.appendChild(el("div","md-feature-form-title",cadIcon(feature.type)+'<span><b>'+tf("featureEditTitle",{name:feature.name})+'</b><small>'+tf("featureEditStep",{id:feature.id})+'</small></span>'));
  highlightFeatureIssueBanner(host, feature);
  if(E.authoring.repairMarker)host.appendChild(el("div","md-note",t("repairLastLocation")));
  var name=featureField(host,{key:"$name",label:t("fldFeatureName"),type:"text"},feature.name),liveBadge=el("div","md-feature-live on",'<i class="ph ph-broadcast"></i> '+t("featureLiveAllViews"));host.appendChild(liveBadge);
  var supportSketch=feature.type==="hole" ? (E.def.sketches || []).find(function(sketch){return sketch.id===feature.params?.sketchId;}) : null;
  var supportSelect=null,supportChoices=[];
  var finishTargetSelect=null,finishTargetChoices=[],draftNeutralSelect=null,draftNeutralChoices=[];
  // A single Shell opening can be repaired from the same verified planar
  // face picker as a Dome, without collapsing a multi-opening Shell.
  if(feature.type==="dome" || feature.type==="draft" && (feature.references?.topology || []).length<=1){
    var targetStageId=(feature.inputs || []).map(dependencyReferenceId)[0];
    var targetCompiled=compileKernelFeatureTree(E.def);
    var targetStageEntries=(targetCompiled.ok && verifiedExactTopology(E.def,targetCompiled.features).get(targetStageId))
      || E.brepRun?.results?.get(targetStageId)?.topology || [];
    finishTargetChoices=feature.type==="draft" ? draftFaceChoices(targetStageEntries,(E.def.features || []),modelLengthUnit()) : planarMateFaceChoices(targetStageEntries,(E.def.features || []),modelLengthUnit());
    if(finishTargetChoices.length){
      var finishTargetRow=el("label","md-row md-row-wide");finishTargetRow.appendChild(el("span","t",t("featureTargetFace")));
      finishTargetSelect=document.createElement("select");finishTargetSelect.setAttribute("aria-label",t("featureTargetFace"));
      finishTargetChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;finishTargetSelect.appendChild(option);});
      finishTargetSelect.value=feature.references?.topology?.[0]?.persistentId || "";
      finishTargetRow.appendChild(finishTargetSelect);host.appendChild(finishTargetRow);
    }
    if(feature.type==="draft"){
      draftNeutralChoices=planarMateFaceChoices(targetStageEntries,(E.def.features || []),modelLengthUnit());
      var draftNeutralRow=el("label","md-row md-row-wide");draftNeutralRow.appendChild(el("span","t",t("fcFldNeutralPlane")));
      draftNeutralSelect=document.createElement("select");draftNeutralSelect.setAttribute("aria-label",t("fcFldNeutralPlane"));
      var noNeutral=document.createElement("option");noNeutral.value="";noNeutral.textContent="Use axis and start/end settings";draftNeutralSelect.appendChild(noNeutral);
      draftNeutralChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;draftNeutralSelect.appendChild(option);});
      draftNeutralSelect.value=feature.params?.neutralFace?.persistentId || "";
      draftNeutralRow.appendChild(draftNeutralSelect);host.appendChild(draftNeutralRow);
      var refreshDraftStatus=el("p","md-field-hint","Face choices are from the saved model. Refresh to inspect native upstream geometry.");
      refreshDraftStatus.setAttribute("role","status");
      var refreshDraftFaces=btn("Refresh exact faces",async function(){
        refreshDraftFaces.disabled=true;
        refreshDraftStatus.textContent="Computing exact upstream faces…";
        try{
          var compiledFaces=compileKernelFeatureTree(E.def);
          if(!compiledFaces.ok)throw new Error(compiledFaces.issues[0]?.message || "Invalid feature history");
          var draftIndex=compiledFaces.features.findIndex(function(item){return item.id===feature.id;});
          if(draftIndex<0)throw new Error("Draft is missing from the feature history");
          var refreshed=await topologyInCadWorker({...compiledFaces.document,features:compiledFaces.features.slice(0,draftIndex)},targetStageId,{onProgress:function(progress){refreshDraftStatus.textContent="Refreshing exact faces · "+(progress.name || progress.stage);flash(refreshDraftStatus.textContent);}});
          if(!scope.form.isCurrent())return;
          finishTargetChoices=draftFaceChoices(refreshed.topology,E.def.features || [],modelLengthUnit());
          draftNeutralChoices=planarMateFaceChoices(refreshed.topology,E.def.features || [],modelLengthUnit());
          if(!finishTargetSelect)throw new Error("No target face selector is available");
          var selectedTarget=finishTargetSelect.value,selectedNeutral=draftNeutralSelect.value;
          finishTargetSelect.innerHTML="";draftNeutralSelect.innerHTML="";
          finishTargetChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;finishTargetSelect.appendChild(option);});
          var blankNeutral=document.createElement("option");blankNeutral.value="";blankNeutral.textContent="Use axis and start/end settings";draftNeutralSelect.appendChild(blankNeutral);
          draftNeutralChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.entry.persistentId;option.textContent=choice.label;draftNeutralSelect.appendChild(option);});
          finishTargetSelect.value=selectedTarget;draftNeutralSelect.value=selectedNeutral;
          refreshDraftStatus.textContent="Native faces refreshed: "+finishTargetChoices.length+" draftable faces and "+draftNeutralChoices.length+" neutral planes. Choose the target and neutral plane before updating.";
          flash("Exact upstream faces refreshed. Choose the drafted face and neutral plane.");
        }catch(error){refreshDraftStatus.textContent="Exact face refresh failed: "+(error.message || "Unknown error")+". Previous face choices remain unchanged.";console.warn("Draft exact face refresh failed",error);flash(refreshDraftStatus.textContent);}
        finally{refreshDraftFaces.disabled=false;}
      });host.appendChild(refreshDraftFaces);host.appendChild(refreshDraftStatus);
    }
  }
  if(supportSketch){
    var featureIndex=(E.def.features || []).indexOf(feature);
    var earlier=(E.def.features || []).slice(0,featureIndex);
    var allowedOwners=new Set(earlier.map(function(item){return item.id;}));
    var supportStageId=(feature.inputs || []).map(dependencyReferenceId).find(function(id){return allowedOwners.has(id);}) || earlier.at(-1)?.id;
    var supportCompiled=compileKernelFeatureTree(E.def);
    var supportTopology=supportCompiled.ok ? verifiedExactTopology(E.def,supportCompiled.features) : new Map();
    supportChoices=holeSupportChoices(earlier,supportTopology,supportSketch.support,supportStageId,modelLengthUnit());
    if(supportChoices.length || !supportSketch.support){
      var supportRow=el("label","md-row md-row-wide");supportRow.appendChild(el("span","t",t("sketchSupportFace")));
      supportSelect=document.createElement("select");supportSelect.setAttribute("aria-label",t("sketchSupportFace"));
      if(!supportSketch.support){var datumOption=document.createElement("option");datumOption.value="";datumOption.textContent="Datum sketch (unattached) · "+(supportSketch.plane || "top");supportSelect.appendChild(datumOption);}
      supportChoices.forEach(function(choice){var option=document.createElement("option");option.value=choice.key;option.textContent=choice.label;supportSelect.appendChild(option);});
      supportSelect.value=supportSketch.support ? "current" : "";
      supportRow.appendChild(supportSelect);host.appendChild(supportRow);
      host.appendChild(el("p","md-field-hint","Choose the feature stage whose face defines the hole position. Changing support preserves local point coordinates; adjust Positions afterward to preserve the intended model location. Earlier stages use verified native faces, before later trimming."));
    }
  }
  function validateRevolveEdit(values){
    values.params.axis=revolvePreviewAxis(values.params,values.references);
    if(isStandaloneSketchAxisRevolve(values.params))assertStandaloneRevolve(values.params);
    else if(isSketchAxis(values.params.axis))resolvedRevolve(sketchById(E.def,values.params.sketchId),values.params);
  }
  var editingRevolve=feature.type==="revolve" || feature.type==="revolveCut";
  var pendingFrame=0,controls=renderFeatureParameterForm(host,feature.type,feature,function(next){
    if(editingRevolve){
      try{validateRevolveEdit(next);liveBadge.textContent=t("featureLiveAllViews");}
      catch(error){liveBadge.textContent=String(error.message || error);return;}
    }
    // A changed Boolean is committed by Update, not by the parameter ghost.
    if(feature.type==="extrude" && next.params.operation==="subtract")next.params.operation=feature.params.operation || "add";
    if(feature.type==="loft")next.params.operation=feature.params.operation || "add";
    feature.params={...feature.params,...next.params};setFeatureReferencesFromForm(feature,next.references);retargetSweepHelix(feature);feature.name=name.value || feature.name;
    if(shellEditor)shellEditor.sync();
    if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=requestAnimationFrame(function(){pendingFrame=0;if(!scope.form.isCurrent())return;syncLiveFeatureEdit(feature);if(["fillet","chamfer"].includes(feature.type))renderFinishEdgeList();if(feature.type==="toolbox"&&name.value!==feature.name)name.value=feature.name;liveBadge.classList.add("pulse");setTimeout(function(){liveBadge.classList.remove("pulse");},180);});
  });
  if(feature.type==="loft"){
    var loftOperationControl=controls.find(function(control){return control.field.key==="operation";});
    if(loftOperationControl)loftOperationControl.input.disabled=true;
    host.appendChild(el("p","md-field-hint",t("loftEditOperation")));
  }
  var shellEditor=addShellFaceThicknessControls(host,feature,function(){syncLiveFeatureEdit(feature);},feature,function(){return finishTargetSelect?.value ? [finishTargetSelect.value] : (feature.references?.topology || []).map(function(ref){return ref.persistentId;});});
  var editOperationSelect=null;
  if(feature.type==="extrude" || feature.type==="extrudeCut"){
    var existingOperation=controls.find(function(control){return control.field.key==="operation";});
    if(existingOperation){
      editOperationSelect=existingOperation.input;
      var subtractOption=document.createElement("option");subtractOption.value="subtract";subtractOption.textContent=t("fcOptSubtract");editOperationSelect.appendChild(subtractOption);
    }else editOperationSelect=featureField(host,{key:"$editOperation",label:t("fcFldOperation"),type:"select",choices:[{value:"subtract",label:t("fcOptSubtract")},{value:"add",label:t("fcOptAdd")}]},"subtract");
    host.appendChild(el("p","md-field-hint",t("extrudeOperationEditHint")));
  }
  name.addEventListener("input",function(){feature.name=name.value || feature.name;var entry=(E.def.history || []).find(function(item){return item.targetId===feature.id;});if(entry)entry.name=feature.name;refreshParts();fillInspector();});
  var dependencies=[];(feature.references.sketches || []).forEach(function(id){dependencies.push(t("depSketch")+": "+(id.id||id));});(feature.inputs || []).forEach(function(id){dependencies.push(t("depFeature")+": "+id);});
  host.appendChild(el("div","md-feature-selection-note",dependencies.length?t("upstreamDependencies")+": "+dependencies.join(" · "):t("noUpstreamDeps")));
  if(["extrude","extrudeCut"].includes(feature.type) && !feature.params?.thinFeature){
    var contourStatus=el("p","md-field-hint","Refresh after editing this solid extrusion's sketch to update its profile and inner holes.");
    var contourRefresh=btn("Refresh sketch contour",function(){
      try{
        var sourceSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===feature.params?.sketchId;});
        var refreshed=refreshedExtrudeProfile(feature,sourceSketch);
        feature.params=refreshed.params;feature.references=refreshed.references;
        contourStatus.textContent="Sketch contour refreshed · "+refreshed.holeCount+" inner "+(refreshed.holeCount===1?"hole":"holes")+". Click Update feature to rebuild.";
        contourStatus.removeAttribute("data-error");
      }catch(error){contourStatus.textContent=String(error.message || error);contourStatus.setAttribute("data-error","true");}
    },"md-wide");
    host.appendChild(contourRefresh);host.appendChild(contourStatus);
  }
  if(["fillet","chamfer"].includes(feature.type)){
    var edgeBox=el("div","md-finish-edges");edgeBox.setAttribute("data-finish-edges",feature.type);
    host.appendChild(edgeBox);renderFinishEdgeList();
    var refreshFinishEdges=btn("Refresh exact upstream edges",async function(){
      refreshFinishEdges.disabled=true;
      try{
        var stage=featureInputStage(compileKernelFeatureTree(E.def),feature);
        var result=await topologyInCadWorker(stage.document,stage.head,{onProgress:function(progress){flash("Refreshing upstream edges · "+(progress.name || progress.stage));}});
        if(!scope.form.isCurrent())return;
        E.authoring.finishEditTopology=result.topology;delete edgeBox.dataset.edgeSignature;renderFinishEdgeList();
        flash("Exact upstream edges refreshed");
      }catch(error){report(t("reportKickerSave"),"Upstream edges",String(error.message || error));}
      finally{refreshFinishEdges.disabled=false;}
    },"md-wide");host.appendChild(refreshFinishEdges);
  }
  var actions=el("div","md-feature-actions");actions.appendChild(namedButton(btn('<i class="ph ph-arrow-counter-clockwise"></i> '+t("m_cancel"),function(){cancelFeatureParameterEdit(false);},"md-quick-cancel"), t("cancelCommand")));
  actions.appendChild(btn('<i class="ph ph-check"></i> '+t("updateFeature"),function(){
    if (!scope.form.isCurrent() || !validateFeatureInputs(host)) return;
    if(shellEditor)try{feature.params.faceThicknesses=shellEditor.read();}catch(error){flash(String(error.message || error));return;}
    var values=readFeatureParameterForm(controls,feature.params);
    try{
      var before=E.authoring.featureEdit.snapshot;
      if(editingRevolve)validateRevolveEdit(values);
      var chosenSupport=supportSelect && supportChoices.find(function(choice){return choice.key===supportSelect.value;});
      var attachment=chosenSupport && faceSketchAttachment(holeSupportChoiceReference(chosenSupport),true);
      var supportChanged=!!(supportSketch && (sketchSupportNeedsUpdate(supportSketch,attachment)
        || attachment && (feature.references.topology || []).some(function(reference){return reference.kind==="face" && reference.persistentId!==attachment.support.persistentId;})));
      if(supportChanged){
        if(!attachment || attachment.surface)throw new Error(t("sketchSupportFace"));
        var reattached=reattachFeatureSketchSupport(E.def,feature,attachment,"sk_hole_"+uid());
        supportSketch=reattached.sketch;
        values.params.sketchId=supportSketch.id;
        values.params.holePositionPointIds=cloneData(feature.params.holePositionPointIds);
        values.params.profileEntityIds=cloneData(feature.params.profileEntityIds);
        values.references.sketches=cloneData(feature.references.sketches);
      }
      var editOperation=editOperationSelect && editOperationSelect.value;
      if((feature.type==="extrudeCut" && editOperation==="add") || (feature.type==="extrude" && editOperation==="subtract"))
        setExtrudeFeatureOperation(E.def,feature.id,editOperation,{name:name.value || feature.name,params:values.params});
      else updateFeatureDefinition(E.def,feature.id,{name:name.value || feature.name,params:values.params});
      setFeatureReferencesFromForm(feature,values.references);retargetSweepHelix(feature);syncProjectionFromFeature(feature);
      if(finishTargetSelect){
        var chosenFinishTarget=finishTargetChoices.find(function(choice){return choice.entry.persistentId===finishTargetSelect.value;});
        if(!chosenFinishTarget)throw new Error(t("featureTargetFace"));
        feature.references.topology=[topologyReferenceFromEntry(chosenFinishTarget.entry)];
        (E.def.parts || []).forEach(function(part){(part.exactOperations || []).forEach(function(operation){if(operation.id===feature.id)operation.targets=cloneData(feature.references.topology);});});
      }
      if(draftNeutralSelect){
        var chosenNeutral=draftNeutralChoices.find(function(choice){return choice.entry.persistentId===draftNeutralSelect.value;});
        if(draftNeutralSelect.value && !chosenNeutral)throw new Error(t("fcFldNeutralPlane"));
        if(chosenNeutral)feature.params.neutralFace=topologyReferenceFromEntry(chosenNeutral.entry);
        else delete feature.params.neutralFace;
        if(feature.references.topology.some(function(reference){return reference.persistentId===feature.params.neutralFace?.persistentId;}))throw new Error("The neutral plane must be different from the drafted face");
        (E.def.parts || []).forEach(function(part){(part.exactOperations || []).forEach(function(operation){if(operation.id===feature.id)operation.params=cloneData(feature.params);});});
      }
      var geometryChanged=before.type!==feature.type || JSON.stringify(before.params)!==JSON.stringify(feature.params)
        || JSON.stringify(before.references)!==JSON.stringify(feature.references);
      var restoreExact=(geometryChanged || supportChanged) && isCanonicalAuthoring() && !!activeParts(E.def).length;
      E.authoring.featureEdit=null;E.authoring.editFeatureId=null;E.authoring.featureType=null;E.authoring.workflowFocus="history";
      closeFeaturePanel();
      // A depth edit invalidates verified generated edge names until the
      // kernel rebuilds them. Keep the last valid status during that rebuild;
      // the lightweight pass cannot reconstruct fillet-generated topology.
      if(restoreExact){E.exactRestoring=true;set_coreRunFresh(true);}
      refreshAll();
      if(restoreExact)scheduleExactRestore();
      else flash("✓ "+t("featureRebuiltFromHistory"));
    }
    catch(error){flash(String(error.message||error));}
  },"md-quick-apply"));actions.querySelector(".md-quick-apply").setAttribute("aria-label",t("updateFeature"));host.appendChild(actions);syncAuthoringWorkflow();syncCommandManager();
  scope.form.rememberInputs(()=>[feature.name,feature.params,feature.references]);
  if (document.body.classList.contains("compact-nav")) revealModelerFeatureForm();
}

function numRow(host, label, get, set, step, tourKey, deferUntilApply, canCommit) {
  var w = el("label", "md-grid-cell");
  if (tourKey) w.setAttribute("data-tour-prop", tourKey);
  var span = el("span", "t");
  span.textContent = label;
  w.appendChild(span);
  var inp = el("input");
  inp.type = "number";
  inp.step = step || 1;
  inp.value = String(get());
  var commit = function () {
    if (deferUntilApply) return;
    if(canCommit && !canCommit()){inp.value=String(get());return;}
    var v = parseFloat(inp.value);
    if (!fin(v)) { inp.value=String(get()); return; }
    if (Math.abs(v-Number(get()))<1e-12) return;
    /* One history step per visit to a field, not one per keystroke: the tag
       coalesces while the field stays focused, and blurring it ends the run so
       coming back later is a step of its own. */
    if (fin(v)) {
      pushUndo((label || t("opProp")) + " → " + Math.round(v * 10) / 10, "prop:" + label + ":" + propGen);
      set(v);
      refreshAll();
    }
  };
  inp.addEventListener("change", commit);
  inp.addEventListener("keydown",function(event){if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commit();}});
  inp.addEventListener("blur", function () { set_propGen(propGen + 1); });
  w.appendChild(inp);
  host.appendChild(w);
  return inp;
}

function acceptRackPinionSolve(result) {
  invalidateInterference();
  E.mateIssues=result.issues || [];
  E.mateRebindings=result.rebindings || [];E.mateUnsatisfied=result.unsatisfied || [];
  E.mateFreedom=result.clusters || [];E.mateDegreesOfFreedom=result.degreesOfFreedom || 0;
  E.mateMobilityReport=assemblyMobilityReport(E.assembly,result,E.mateIssues);
  set_assemblySolveFresh(true);refreshAll({assemblyPoseOnly:true});
}

function assemblyMateInspectorBody() {
  var host = root.querySelector("#mdOps"); host.innerHTML = "";
  host.appendChild(el("h5", "md-h5", t("mate")));
  var picked = assemblyPickedRefs();
  host.appendChild(el("div", "md-note", picked ? t("matePickHint") : t("mateHint")));
  /* A counterbore shoulder can be narrower than a few screen pixels, and a
     hidden back flange cannot be ray-picked at all. The two component rows in
     the tree still identify the intended pair; offer their exact planar faces
     here so a mate can use topology without inventing a bounding-box face. */
  var faceHolders = picked
    ? [mateHolderById(picked.a.componentId), mateHolderById(picked.b.componentId)]
    : (E.componentSel || []).slice(-2);
  if (faceHolders.length === 2 && faceHolders[0] && faceHolders[1] && faceHolders[0].id !== faceHolders[1].id) {
    var chooser = el("div", "md-mate-face-chooser");
    faceHolders.forEach(function (holder, index) {
      var doc = componentDef(holder);
      var missingExactLeaves=[];
      var entries = componentTopology(holder, function (leaf) {
        var leafDoc = componentDef(leaf);
        if (leafDoc?.metadata?.authoringSystem==="parametric-v1") {
          var finalEntries=finalMateTopology(leafDoc);
          if(finalEntries?.length)return finalEntries;
          missingExactLeaves.push(leaf);
          // An expired exact cache is not proof that a saved mesh still names
          // the current faces. Expose an explicit native refresh, not stale IDs.
          return [];
        }
        return pickPartsFor(leaf).flatMap(topologyEntriesForPart);
      });
      var choices = exactMateReferenceChoices(entries, (doc && (doc.features || doc.featureHistory)) || [], modelLengthUnit());
      var row = el("label", "md-mate-face-row");
      row.appendChild(el("span", "", t(index ? "matePmRefB" : "matePmRefA") + " · " + componentLabel(holder.id)));
      var select = document.createElement("select");
      select.setAttribute("aria-label", t(index ? "matePmRefB" : "matePmRefA") + " · " + componentLabel(holder.id));
      select.dataset.mateFaceComponent = holder.id;
      var blank = document.createElement("option"); blank.value = ""; blank.textContent = t("matePmPickFace"); select.appendChild(blank);
      choices.forEach(function (choice) {
        var option = document.createElement("option");
        option.value = choice.entry.persistentId; option.textContent = choice.label;
        select.appendChild(option);
      });
      var selected = (E.topologySelection || []).filter(function (ref) { return ref.componentId === holder.id; }).at(-1);
      if (selected && choices.some(function (choice) { return choice.entry.persistentId === selected.persistentId; })) select.value = selected.persistentId;
      select.addEventListener("change", function () {
        var choice = choices.find(function (candidate) { return candidate.entry.persistentId === select.value; });
        var retained = (E.topologySelection || []).filter(function (ref) { return ref.componentId !== holder.id; });
        if (choice) retained.push(stampComponentRef(topologyReferenceFromEntry(choice.entry), holder, null));
        E.topologySelection = retained;
        E.componentSel = faceHolders;
        E.sel = holder;
        // Let the native dropdown finish committing before its inspector is
        // replaced. Rebuilding hundreds of options inside the change event
        // also keeps the browser input handler blocked for the entire redraw.
        requestAnimationFrame(function () { refreshSelection(); });
      });
      row.appendChild(select);
      var refreshing=mateReferenceRefreshes.has(holder);
      var refreshButton=btn(refreshing?"Refreshing exact mate references…":"Refresh exact mate references",function(){refreshComponentMateReferences(holder);});
      refreshButton.disabled=refreshing;
      refreshButton.setAttribute('aria-label',"Refresh exact mate references · "+componentLabel(holder.id));
      row.appendChild(refreshButton);
      if(missingExactLeaves.length)row.appendChild(el("small","md-note","Native face references need refresh for "+missingExactLeaves.map(function(leaf){return leaf.name || leaf.modelKey || leaf.id;}).join(", ")));
      chooser.appendChild(row);
    });
    host.appendChild(chooser);
  }
  if (picked) {
    var chips = el("div", "md-mate-picks");
    [picked.a, picked.b].forEach(function (reference, index) {
      var chip = el("span", "md-mate-pick" + (index ? " b" : " a"));
      chip.textContent = componentLabel(reference.componentId) + " · " + (reference.kind || "face");
      chips.appendChild(chip);
    });
    host.appendChild(chips);
  }
  var ops = el("div", "md-ops");
  var pair = ungroundedComponentPair();
  [["alignX", "mateX"], ["alignY", "mateY"], ["alignZ", "mateZ"], ["distanceX", "mateDistance"]].forEach(function (entry) {
    var mateButton=btn('<i class="ph ph-link"></i> ' + t(entry[1]), function () {
      if (!pair) { flash(t("mateHint")); return; }
      addMate(entry[0]);
    });
    mateButton.setAttribute("data-mate",entry[0]);
    markUnavailable(mateButton, pair ? "" : t("mateHint"), t(entry[1]));
    ops.appendChild(mateButton);
  });
  host.appendChild(el("div", "md-note", t("mateAxisHint")));
  var source = picked ? t("mateUsingPicked") : t("mateNeedTwoFaces");
  MATE_PALETTE.forEach(function (entry) {
    /* A mate the picked references cannot support is greyed and says what it
       wanted, rather than accepting the pair and placing the component
       somewhere meaningless. */
    var fits = mateTypeFits(entry[0]), label = t(entry[2]);
    if(entry[0]==='coincident' && picked && (picked.a.descriptor?.surface==='axis' || picked.b.descriptor?.surface==='axis'))label='Coincident plane and axis';
    var mateButton = btn((entry[1] === "threadfeature" ? '<i class="ph ph-spiral"></i>' : '<i class="ph ' + entry[1] + '"></i>') + " " + label, function () {
      if (!fits.ok) { flash(label + " — " + fits.reason); return; }
      // Numbered mates ask for their value before creating the constraint.
      if (entry[0] === "angle") openMateAngleForm();
      else if (entry[0] === "distance") openMateDistanceForm();
      else if (entry[0] === "gear") openMateGearForm();
      else if (entry[0] === "belt") openMateBeltForm();
      else if (entry[0] === "rackpinion") openMateRackPinionForm();
      else if (entry[0] === "rotationlimit") openMateRotationLimitForm();
      else addInspectorTopologyMate(entry[0]);
    });
    mateButton.setAttribute("data-topology-mate", entry[0]);
    markUnavailable(mateButton, fits.ok ? "" : label + " — " + fits.reason, label + " — " + (entry[0]==="lock"?t("lockMatePreservesPose"):source));
    ops.appendChild(mateButton);
  });
  host.appendChild(ops);
  var legacy = Array.isArray(E.assembly && E.assembly.mates) ? E.assembly.mates : [];
  var topology = Array.isArray(E.assembly && E.assembly.topologyMates) ? E.assembly.topologyMates : [];
  if (legacy.length || topology.length) {
    host.appendChild(el("h5", "md-h5", t("matesCount")));
    legacy.forEach(function (mate) {
      mateRow(host,
        t(mate.type === "alignX" ? "mateX" : mate.type === "alignY" ? "mateY" : mate.type === "alignZ" ? "mateZ" : "mateDistance"),
        componentLabel(mate.a) + " ↔ " + componentLabel(mate.b), null,
        function () {
          pushUndo(t("del"));
          E.assembly.mates = legacy.filter(function (m) { return m !== mate; });
          solveAssembly(); refreshAll();
        });
    });
    topology.forEach(function (mate) {
      var mateUiRow = mateRow(host, topologyMateLabel(mate.type,mate),
        componentLabel(mate.a && mate.a.componentId) + " ↔ " + componentLabel(mate.b && mate.b.componentId),
        mateIssuesFor(mate.id),
        function () {
          pushUndo(t("del"));
          E.assembly.topologyMates = topology.filter(function (m) { return m !== mate; });
          solveAssembly(); refreshAll();
        },
        mateReboundFor(mate.id),
        mate.type === "angle" ? {
          label: t("mateAngleValue"), value: clampMateAngle(mate.value), suffix: "°",min:0,max:180,
          getValue:function(){return clampMateAngle(mate.value);},
          onChange: function (next) {
            var degrees=String(next).trim()===""?NaN:Number(next);
            if(!fin(degrees)||degrees<0||degrees>180){flash(t("mateAngleRangeInvalid"));return;}
            if (degrees === clampMateAngle(mate.value)) return;
            var changed=setTopologyMateValue(E.assembly,mate.id,degrees,function(){pushUndo(t("angleMate"));});
            if(!changed.ok){flash(t("mateValueUnsatisfied"));return;}
            acceptRackPinionSolve(changed);
          },
        } : mate.type === "distance" ? {
          label: t("topologyDistanceMate") + " (" + modelLengthUnit() + ")",
          value: Number(lengthToDocument(Number(mate.value) || 0, modelLengthUnit()).toPrecision(10)),
          step: 0.001, suffix: modelLengthUnit(),
          getValue:function(){return Number(lengthToDocument(Number(mate.value)||0,modelLengthUnit()).toPrecision(10));},
          onChange: function (next) {
            var cm = String(next).trim()===""?NaN:lengthFromDocument(Number(next), modelLengthUnit());
            if(!fin(cm)){flash(t("mateValueInvalid"));return;}
            if (Math.abs(cm - Number(mate.value || 0)) < 1e-9) return;
            var changed=setTopologyMateValue(E.assembly,mate.id,cm,function(){pushUndo(t("topologyDistanceMate"));});
            if(!changed.ok){flash(t("mateValueUnsatisfied"));return;}
            acceptRackPinionSolve(changed);
          },
        } : null,
        ["coincident", "distance", "limit", "tangent"].includes(mate.type) ? {
          aligned: !!mate.aligned,
          onToggle: function () {
            pushUndo(t("mateAlignment"));
            mate.aligned = !mate.aligned;
            solveAssembly(); refreshAll({assemblyPoseOnly:true});
          },
        } : null,
        mate.type==="tangent" && [mate.a?.frame?.surface,mate.b?.frame?.surface].includes("torus") ? {
          finite:mate.contactMode==="finite-bore",
          onToggle:function(){
            pushUndo(t("mateContactMode"));
            mate.contactMode=mate.contactMode==="finite-bore"?"surface":"finite-bore";
            if(mate.contactMode==="finite-bore")mate.aligned=true;
            solveAssembly();refreshAll();
          },
        } : null);
      if(picked && [picked.a.componentId,picked.b.componentId].includes(mate.a?.componentId) && [picked.a.componentId,picked.b.componentId].includes(mate.b?.componentId) && mateTypeFits(mate.type).ok){
        mateUiRow.appendChild(btn("Replace references with selection",function(){
          if(mate.type==='rotationlimit'){
            var rotationRepair=setRotationLimitMateReferences(E.assembly,mate.id,mateReferenceFromPick(picked.a),mateReferenceFromPick(picked.b),function(){pushUndo('Replace mate references');});
            if(!rotationRepair.ok){flash(t('rotationLimitUnsatisfied'));return;}
            acceptRackPinionSolve(rotationRepair);return;
          }
          if(mate.type==='rackpinion'){
            var repaired=setRackPinionMateReferences(E.assembly,mate.id,mateReferenceFromPick(picked.a),mateReferenceFromPick(picked.b),function(){pushUndo("Replace mate references");});
            if(!repaired.ok){flash(t('rackPinionUnsatisfied'));return;}
            acceptRackPinionSolve(repaired);return;
          }
          pushUndo("Replace mate references");
          rebindTopologyMate(mate,mateReferenceFromPick(picked.a),mateReferenceFromPick(picked.b));
          solveAssembly();refreshAll();
        },"md-mate-align"));
      }
      /* Screw, gear and angle-range mates carry numbers of their own. Each is
         edited where the mate is listed, one undo step per change, and the
         assembly is solved again so the motion is visible immediately. */
      var extraField = function (title, current, step, commit) {
        var wrap = el("label", "md-mate-value"), input = el("input");
        wrap.appendChild(el("span", "", title));
        input.type = "number"; input.step = String(step);
        input.value = current == null || !fin(Number(current)) ? "" : String(Number(Number(current).toPrecision(10)));
        input.setAttribute("aria-label", title);
        bindMateNumericCommit(input,function(){commit(input.value.trim()===''?null:Number(input.value),input);});
        wrap.appendChild(input); mateUiRow.appendChild(wrap);
      };
      if(mate.type==='concentric')mateUiRow.appendChild(concentricAxisDirectionControl(mate));
      var acceptScrewSolve = function(result){
        invalidateInterference();
        E.mateIssues=result.issues || [];
        E.mateRebindings=result.rebindings || [];E.mateUnsatisfied=result.unsatisfied || [];
        E.mateFreedom=result.clusters || [];E.mateDegreesOfFreedom=result.degreesOfFreedom || 0;
        E.mateMobilityReport=assemblyMobilityReport(E.assembly,result,E.mateIssues);
        set_assemblySolveFresh(true);
        refreshAll();
      };
      if (mate.type === "screw") {
        var screwHand = el("label", "md-mate-value"), screwHandInput = el("select");
        screwHand.appendChild(el("span", "", "Thread handedness"));
        screwHandInput.setAttribute("aria-label", "Thread handedness");
        [["rh", "Right hand"], ["lh", "Left hand"]].forEach(function (choice) {
          var option = el("option"); option.value = choice[0]; option.textContent = choice[1];
          screwHandInput.appendChild(option);
        });
        screwHandInput.value = mate.handedness === "lh" || mate.handedness === "left" ? "lh" : "rh";
        screwHandInput.title = "Choose at the home pose before driving. The saved screw zero is preserved.";
        screwHandInput.addEventListener("change", function () {
          if (!["rh", "lh"].includes(screwHandInput.value)) return;
          pushUndo("Screw thread handedness");
          setScrewMateHandedness(mate, screwHandInput.value);
          solveAssembly(); refreshAll();
        });
        screwHand.appendChild(screwHandInput); mateUiRow.appendChild(screwHand);
        var screwMode = el("label", "md-mate-value"), screwModeInput = el("input");
        screwModeInput.type = "checkbox";
        screwModeInput.checked = !!mate.coupledMotion;
        screwModeInput.setAttribute("aria-label", "Couple screw rotation and travel");
        screwMode.appendChild(screwModeInput);
        screwMode.appendChild(el("span", "", "Couple rotation and travel (free screw joint)"));
        screwModeInput.addEventListener("change", function () {
          var changed=setScrewMateCoupledMotion(E.assembly,mate.id,screwModeInput.checked,function(){pushUndo(t("screwMate"));});
          if(!changed.ok){screwModeInput.checked=!!mate.coupledMotion;flash("Screw mode could not satisfy the assembly mates");return;}
          acceptScrewSolve(changed);
        });
        mateUiRow.appendChild(screwMode);
        mateUiRow.appendChild(btn(mate.axisOpposed ? "Screw axes: Opposed" : "Screw axes: Aligned", function () {
          pushUndo(t("screwMate")); mate.axisOpposed = !mate.axisOpposed;
          delete mate.coupledAxial0; delete mate.coupledPhase0; delete mate.coupledAxialBasis;
          solveAssembly(); refreshAll();
        }, "md-mate-align"));
        var lengthUnit = modelLengthUnit();
        extraField(t("mateScrewPitch") + " (" + lengthUnit + "/" + t("mateScrewTurn") + ")",
          lengthToDocument(Number(mate.pitch) || 0, lengthUnit), 0.001, function (next, input) {
            var cm = fin(next) && next > 0 ? lengthFromDocument(next, lengthUnit) : NaN;
            if (!fin(cm)) { flash(t("mateScrewInvalid")); input.value = String(lengthToDocument(Number(mate.pitch) || 0, lengthUnit)); return; }
            if (Math.abs(cm - Number(mate.pitch || 0)) < 1e-12) return;
            pushUndo(t("screwMate")); mate.pitch = cm; solveAssembly(); refreshAll();
          });
        if (mate.coupledMotion) extraField("Drive turns (blank = free)", mate.driveTurns, 0.25, function (next, input) {
          if (next !== null && !fin(next)) { flash(t("mateScrewInvalid")); input.value = mate.driveTurns == null ? "" : String(mate.driveTurns); return; }
          if (next === mate.driveTurns || (next === null && mate.driveTurns == null)) return;
          var driven = setScrewMateDrive(E.assembly,mate.id,next,function(){pushUndo(t("screwMate"));});
          if(!driven.ok){
            input.value=mate.driveTurns==null?"":String(mate.driveTurns);
            flash("Screw drive could not satisfy the assembly mates");return;
          }
          acceptScrewSolve(driven);
        });
        else extraField(t("mateScrewTurns"), mate.turns, 0.25, function (next, input) {
          if (!fin(next)) { flash(t("mateScrewInvalid")); input.value = String(Number(mate.turns) || 0); return; }
          if (Math.abs(next - Number(mate.turns || 0)) < 1e-12) return;
          pushUndo(t("screwMate")); mate.turns = next; solveAssembly(); refreshAll();
        });
      }
      if (mate.type === "gear") {
        extraField("Follower phase (°)",mate.followerPhaseDeg||0,.1,function(next,input){
          if(next===null||!fin(next)){flash("Enter a finite gear phase");input.value=String(mate.followerPhaseDeg||0);return;}
          if(next===Number(mate.followerPhaseDeg||0))return;
          var phased=setGearMatePhase(E.assembly,mate.id,next);
          if(!phased.ok){flash("Gear phase could not satisfy the assembly mates");input.value=String(mate.followerPhaseDeg||0);return;}
          pushUndo("Gear phase");E.assembly=phased.assembly;invalidateInterference();refreshAll();
          flash("Gear phase updated · motion studies restart at the new zero pose");
        });
        [["ratioA", "gearTeethA"], ["ratioB", "gearTeethB"]].forEach(function (pair) {
          extraField(t(pair[1]), mate[pair[0]], 1, function (next, input) {
            if (!fin(next) || !(next > 0)) { flash(t("gearRatioInvalid")); input.value = String(mate[pair[0]]); return; }
            if (next === Number(mate[pair[0]])) return;
            pushUndo(t("gearMate")); mate[pair[0]] = next; solveAssembly(); refreshAll();
          });
        });
        var flip = btn(mate.reverse ? t("gearSame") : t("gearOpposite"), function () {
          pushUndo(t("gearMate")); mate.reverse = !mate.reverse; solveAssembly(); refreshAll();
        }, "md-mate-align");
        mateUiRow.appendChild(flip);
      }
      if(mate.type==='belt'){
        mateUiRow.appendChild(el('div','md-note',t('beltHint')));
        [['diameterA','beltDiameterA','a'],['diameterB','beltDiameterB','b']].forEach(function(pair){
          extraField(t(pair[1])+' ('+modelLengthUnit()+')',beltDiameterValue(mate,pair[2],modelLengthUnit()),.1,function(next,input){
            var cm=lengthFromDocument(next,modelLengthUnit());
            if(next===null||!fin(cm)||!(cm>0)){flash(t('beltInvalid'));input.value=modelLengthText(mate[pair[0]]);return;}
            if(cm===mate[pair[0]])return;
            pushUndo(t('beltMate'));mate[pair[0]]=cm;solveAssembly();refreshAll();
          });
        });
        mateUiRow.appendChild(btn(t(mate.beltDirection==='open'?'beltOpen':'beltCrossed'),function(){
          pushUndo(t('beltMate'));mate.beltDirection=mate.beltDirection==='open'?'crossed':'open';solveAssembly();refreshAll();
        },'md-mate-align'));
      }
      if(mate.type==='rackpinion'){
        mateUiRow.appendChild(el('div','md-note',t('rackPinionHint')));
        extraField(t('rackPinionRadius')+' ('+modelLengthUnit()+')',lengthToDocument(mate.pitchRadius,modelLengthUnit()),.1,function(next,input){
          var radius=next===null?NaN:lengthFromDocument(next,modelLengthUnit());
          if(!fin(radius)||!(radius>0)){flash(t('rackPinionInvalid'));input.value=modelLengthText(mate.pitchRadius);return;}
          if(Math.abs(radius-mate.pitchRadius)<1e-12)return;
          var changed=setRackPinionMateSettings(E.assembly,mate.id,{pitchRadius:radius},function(){pushUndo(t('rackPinionMate'));});
          if(!changed.ok){flash(t('rackPinionUnsatisfied'));input.value=modelLengthText(mate.pitchRadius);return;}
          acceptRackPinionSolve(changed);
        });
        extraField(t('rackPinionDrive'),mate.driveTurns,.05,function(next,input){
          if(next!==null&&!fin(next)){flash(t('rackPinionInvalid'));input.value=mate.driveTurns==null?'':String(mate.driveTurns);return;}
          if(next===mate.driveTurns || (next===null&&mate.driveTurns==null))return;
          var driven=setRackPinionMateDrive(E.assembly,mate.id,next,function(){pushUndo(t('rackPinionMate'));});
          if(!driven.ok){flash(t('rackPinionUnsatisfied'));input.value=mate.driveTurns==null?'':String(mate.driveTurns);return;}
          acceptRackPinionSolve(driven);
        });
        mateUiRow.appendChild(btn(t(mate.reverse?'rackPinionReversed':'rackPinionForward'),function(){
          var changed=setRackPinionMateSettings(E.assembly,mate.id,{reverse:!mate.reverse},function(){pushUndo(t('rackPinionMate'));});
          if(!changed.ok){flash(t('rackPinionUnsatisfied'));return;}
          acceptRackPinionSolve(changed);
        },'md-mate-align'));
      }
      if(mate.type==='rotationlimit'){
        mateUiRow.appendChild(el('div','md-note',t('rotationLimitHint')));
        [['angleMin','mateAngleMinimum'],['angleMax','mateAngleMaximum'],['driveAngle','rotationLimitDrive']].forEach(function(pair){
          extraField(t(pair[1])+' (°)',mate[pair[0]],1,function(next,input){
            if(next===mate[pair[0]] || (pair[0]==='driveAngle'&&next===null&&mate.driveAngle==null))return;
            var result=pair[0]==='driveAngle'?setRotationLimitMateDrive(E.assembly,mate.id,next,function(){pushUndo(t('rotationLimitMate'));}):setRotationLimitMateSettings(E.assembly,mate.id,{[pair[0]]:next},function(){pushUndo(t('rotationLimitMate'));});
            if(!result.ok){flash(t('rotationLimitInvalid'));input.value=mate[pair[0]]==null?'':String(mate[pair[0]]);return;}
            acceptRackPinionSolve(result);
          });
        });
        mateUiRow.appendChild(btn(t(mate.reverse?'rotationLimitReversed':'rotationLimitForward'),function(){
          var result=setRotationLimitMateSettings(E.assembly,mate.id,{reverse:!mate.reverse},function(){pushUndo(t('rotationLimitMate'));});
          if(!result.ok){flash(t('rotationLimitUnsatisfied'));return;}
          acceptRackPinionSolve(result);
        },'md-mate-align'));
      }
      if (mate.type === "angle") {
        [["angleMin", "mateAngleMinimum"], ["angleMax", "mateAngleMaximum"]].forEach(function (pair) {
          extraField(t(pair[1]) + " (°)", mate[pair[0]], 1, function (next, input) {
            if(next===mate[pair[0]] || (next===null&&mate[pair[0]]==null))return;
            if (next !== null && (!fin(next) || next < 0 || next > 180)) { flash(t("mateAngleRangeInvalid")); input.value = mate[pair[0]] == null ? "" : String(mate[pair[0]]); return; }
            var lo = pair[0] === "angleMin" ? next : (mate.angleMin == null ? null : Number(mate.angleMin));
            var hi = pair[0] === "angleMax" ? next : (mate.angleMax == null ? null : Number(mate.angleMax));
            if (lo !== null && hi !== null && lo > hi) { flash(t("mateAngleRangeInvalid")); input.value = mate[pair[0]] == null ? "" : String(mate[pair[0]]); return; }
            pushUndo(t("angleMate"));
            if (next === null) delete mate[pair[0]]; else mate[pair[0]] = next;
            solveAssembly(); refreshAll();
          });
        });
      }
      if (mate.type === "limit") {
        ["min", "max"].forEach(function (key) {
          var wrap = el("label", "md-mate-value"), input = el("input");
          var unit = modelLengthUnit(), title = t(key === "min" ? "mateLimitMinimum" : "mateLimitMaximum") + " (" + unit + ")";
          wrap.appendChild(el("span", "", title));
          input.type = "number"; input.step = "0.001";
          input.value = String(Number(lengthToDocument(Number(mate[key]), unit).toPrecision(10)));
          input.setAttribute("aria-label", title);
          var commitLimit = function () {
            var next = input.value.trim() === "" ? NaN : lengthFromDocument(Number(input.value), unit);
            var bounds = validLimitMateBounds(key === "min" ? next : mate.min, key === "max" ? next : mate.max);
            if (!bounds) { flash(t("mateLimitInvalidRange")); input.value = String(lengthToDocument(Number(mate[key]), unit)); return; }
            if (Math.abs(bounds[key] - Number(mate[key])) < 1e-9) return;
            pushUndo(t("mate")); mate.min = bounds.min; mate.max = bounds.max;
            solveAssembly(); refreshAll();
          };
          bindMateNumericCommit(input,commitLimit);
          wrap.appendChild(input); mateUiRow.appendChild(wrap);
        });
      }
    });
  }
}

function fillCabinetParameters(host) {
  if (!E.def.metadata || E.def.metadata.adapter !== "cabinet") return;
  host.appendChild(el("h5", "md-h5", getLang() === "en" ? "Cabinet parameters (cm)" : "פרמטרי ארון (ס״מ)"));
  var grid = el("div", "md-prop-grid md-cab-parameters");
  Object.entries(E.def.parameters || {}).forEach(function (entry) {
    var key = entry[0], parameter = entry[1];
    if (typeof parameter.value !== "number") return;
    numRow(grid, parameter.label || key, function () { return parameter.value; }, function (value) {
      if (value < parameter.min || value > parameter.max) return;
      var previousValue = parameter.value;
      parameter.value = value;
      var run = rebuildParametricDocument(E.def, {});
      if (!run.ok) { parameter.value = previousValue; flash(run.issues.filter(function (issue) { return issue.severity === "error"; }).map(function (issue) { return issue.message; }).join(" · ")); return; }
      publishRebuildStatus(E.def, run);
      E.sel = null; set_coreRunFresh(false);
    }, 0.1);
  });
  host.appendChild(grid);
}

function fillOps() {
  var host = root.querySelector("#mdOps");
  host.innerHTML = "";
  var p = E.sel;
  if (!p) { emptyState(host, "ph-magic-wand", t("noSel"), t("noSelHint")); return; }
  if (isSketchObject(p)) {
    var sketch = ensureSketch(E.def);
    var owned = p.type ? entityPoints(sketch, p) : [p];
    host.appendChild(el("h5", "md-h5", t("constraints")));
    var lineOps = el("div", "md-ops");
    if (p.type === "line") {
      // horizontal/vertical replace each other and any angle dimension: all
      // three drive the same freedom, so keeping two guarantees a conflict
      function addLineRule(type) {
        pushUndo(t("opConstraint"));
        sketch.constraints = sketch.constraints.filter(function (c) {
          return !(c.entity === p.id && (c.type === "angle" || c.type === "horizontal" || c.type === "vertical"));
        });
        var added = { id: uid(), type: type, entity: p.id };
        sketch.constraints.push(added);
        if (!resolveSketch(true)) {
          var ruleWhy = explainSketchConflict(sketch, { keep: [added.id] });
          var ruleSubject = constraintCaption(added, sketch);
          sketch.constraints = sketch.constraints.filter(function (c) { return c !== added; });
          resolveSketch(false);
          H.discard();
          showSketchRefusal(sketch, ruleSubject, [added.id], ruleWhy);
        }
        refreshAll();
      }
      lineOps.appendChild(btn('<i class="ph ph-arrows-out-line-horizontal"></i> ' + t("cHorizontal"), function () { addLineRule("horizontal"); }));
      lineOps.appendChild(btn('<i class="ph ph-arrows-out-line-vertical"></i> ' + t("cVertical"), function () { addLineRule("vertical"); }));
    }
    if (p.type) {
      lineOps.appendChild(btn('<i class="ph ph-line-segments"></i> ' + t("tool_constr"), function () {
        pushUndo(t("tool_constr")); toggleConstruction(sketch, p.id); refreshAll();
      }));
    }
    lineOps.appendChild(btn('<i class="ph ph-lock"></i> ' + t("cFixed"), function () {
      pushUndo(t("cFixed"));
      owned.forEach(function (q) { q.fixed = true; });
      resolveSketch(false); refreshAll();
    }));
    lineOps.appendChild(btn('<i class="ph ph-lock-key-open"></i> ' + t("cFixed") + " ✕", function () {
      pushUndo(t("cFixed"));
      owned.forEach(function (q) { q.fixed = false; });
      resolveSketch(false); refreshAll();
    }));
    host.appendChild(lineOps);
    if (closedSketchProfile()) {
      host.appendChild(btn('<i class="ph ph-cube"></i> ' + t("opExtrude"), function(){openParametricFeature("extrude");}, "md-wide"));
    }
    if (p.type) {
      host.appendChild(btn('<i class="ph ph-trash"></i> ' + t("del"), function () {
        pushUndo(t("del"));
        removeSketchEntity(sketch, p.id);
        E.ssel = []; E.sel = null;
        resolveSketch(false);
        refreshAll();
      }, "md-wide btn-danger"));
    }
    return;
  }
  var b = partBounds(p);

  host.appendChild(el("h5", "md-h5", t("opAlign")));
  var ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-align-center-horizontal-simple"></i> ' + t("centerX"), function () { pushUndo(t("centerX")); movePart(p, -(b.x0 + b.x1) / 2, 0, 0); refreshAll(); }));
  ops.appendChild(btn('<i class="ph ph-align-center-vertical-simple"></i> ' + t("centerZ"), function () { pushUndo(t("centerZ")); movePart(p, 0, 0, -(b.z0 + b.z1) / 2); refreshAll(); }));
  ops.appendChild(btn('<i class="ph ph-align-bottom-simple"></i> ' + t("floor"), function () { pushUndo(t("floor")); movePart(p, 0, -b.y0, 0); refreshAll(); }));
  host.appendChild(ops);

  host.appendChild(el("h5", "md-h5", t("opCopy")));
  ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-flip-horizontal"></i> ' + t("mirrorX"), function () {
    var q = mirrorProjectionPart(resetClonedPartIdentity(cloneData(p)), "plane:right");
    if (!q) { flash(t("kernelBodyNoMirror")); return; }
    pushUndo(t("mirrorX"));
    addPart(q);
    E.sel = q;
    refreshAll();
  }));
  ops.appendChild(btn('<i class="ph ph-copy"></i> ' + t("dup"), function () {
    pushUndo(t("dup"));
    var q = resetClonedPartIdentity(JSON.parse(JSON.stringify(p)));
    movePart(q, 10, 0, 10);
    addPart(q);
    E.sel = q;
    refreshAll();
  }));
  /* One form, not a chain of window.prompt()s. Each of these used to ask two or
     three questions in a row, every one of them freezing the model behind a
     modal — and answering the last one wrong meant starting the chain again.
     A step typed as "20,0,0" into a text box is also not an input, it is a
     parsing puzzle; three numbers are three fields. */
  ops.appendChild(btn('<i class="ph ph-dots-three-outline"></i> ' + t("patLin"), function () {
    openQuickForm({
      action: "patlin", icon: "ph-dots-three-outline", title: t("patLin"), hint: t("patLinHint"),
      fields: [
        { key: "count", label: t("patCount"), type: "number", integer: true, min: 2, max: 64, step: 1, value: 3 },
        { key: "stepX", label: "X", type: "number", unit: "length", step: 1, value: 20 },
        { key: "stepY", label: "Y", type: "number", unit: "length", step: 1, value: 0 },
        { key: "stepZ", label: "Z", type: "number", unit: "length", step: 1, value: 0 },
      ],
      onApply: function (values) {
        var n = Math.round(Number(values.count));
        var step = [Number(values.stepX), Number(values.stepY), Number(values.stepZ)];
        if (!fin(n) || n < 2 || !step.every(fin)) return false;
        if (!step.some(function (axis) { return axis !== 0; })) { flash(t("patStepZero")); return false; }
        pushUndo(t("patLin"));
        for (var k = 1; k < n; k++) {
          var q = resetClonedPartIdentity(JSON.parse(JSON.stringify(p)));
          movePart(q, step[0] * k, step[1] * k, step[2] * k);
          addPart(q);
        }
        return true;
      },
    });
  }));
  ops.appendChild(btn('<i class="ph ph-circles-three"></i> ' + t("patCirc"), function () {
    openQuickForm({
      action: "patcirc", icon: "ph-circles-three", title: t("patCirc"), hint: t("patCircHint"),
      fields: [
        { key: "count", label: t("patCount"), type: "number", integer: true, min: 2, max: 64, step: 1, value: 4 },
        { key: "angle", label: t("patAngle"), type: "number", unit: "angle", min: -360, max: 360, step: 5, value: 360 },
      ],
      onApply: function (values) {
        var n = Math.round(Number(values.count)), total = Number(values.angle);
        if (!fin(n) || n < 2 || !fin(total) || !total) return false;
        // full circle: don't duplicate the original at 360°
        var step = (Math.abs(total) === 360 ? total / n : total / (n - 1)) * Math.PI / 180;
        pushUndo(t("patCirc"));
        var made = 0;
        for (var k = 1; k < n; k++) {
          var q = rotPartY(JSON.parse(JSON.stringify(p)), step * k);
          if (!q) break;
          resetClonedPartIdentity(q);
          addPart(q);
          made++;
        }
        if (!made) { H.discard(); flash(t("patSkip")); return false; }
        return true;
      },
    });
  }));
  host.appendChild(ops);

  host.appendChild(el("h5", "md-h5", t("opShape")));
  ops = el("div", "md-ops");
  ops.appendChild(btn('<i class="ph ph-bowl-food"></i> ' + t("shellOp"), function () {
    openQuickForm({
      action: "quickshell", icon: "ph-bowl-food", title: t("shellOp"), hint: t("shellHint"),
      fields: [{ key: "thickness", label: t("shellT"), type: "number", unit: "length", min: 1e-6, step: 0.1, value: 2 }],
      onApply: async function (values) {
        var thickness = Number(values.thickness);
        if (!fin(thickness) || thickness <= 0) return false;
        return await quickShellPart(thickness);
      },
    });
  }));
  ops.appendChild(btn('<i class="ph ph-trapezoid"></i> ' + t("loftOp"), function () {
    if (p.kind !== "ext" || (p.holes && p.holes.length)) { flash(t("loftFail")); return; }
    openQuickForm({
      action: "quickloft", icon: "ph-trapezoid", title: t("loftOp"), hint: t("loftHint"),
      fields: [
        { key: "scale", label: t("loftScale"), type: "number", min: 1e-6, step: 0.05, value: 0.6 },
        { key: "offsetU", label: "U", type: "number", unit: "length", step: 1, value: 0 },
        { key: "offsetV", label: "V", type: "number", unit: "length", step: 1, value: 0 },
      ],
      onApply: function (values) {
        var scale = Number(values.scale);
        if (!fin(scale) || scale <= 0) return false;
        var offU = fin(Number(values.offsetU)) ? Number(values.offsetU) : 0;
        var offV = fin(Number(values.offsetV)) ? Number(values.offsetV) : 0;
        pushUndo(t("loftOp"));
        var c = loopCentroid(p.pts);
        p.kind = "loft";
        p.name = p.name === "extrude" ? "loft" : p.name;
        p.pts0 = p.pts;
        p.pts1 = p.pts.map(function (q2) { return { u: c.u + (q2.u - c.u) * scale + offU, v: c.v + (q2.v - c.v) * scale + offV }; });
        delete p.pts;
        delete p.holes;
        delete p.tex; // lofted geometry has no UVs
        E.sel = p;
        return true;
      },
    });
  }));
  host.appendChild(ops);

  if(p.cosmeticThread?.spec){
    host.appendChild(btn(t("mfgCheckFit"),function(){
      var others=E.def.parts.filter(function(part){return part!==p&&part.cosmeticThread?.spec;});
      if(!others.length){flash(t("mfgNeedPair"));return;}
      openQuickForm({action:"threadfit",title:t("mfgCheckFit"),fields:[{key:"mate",label:t("mfgMatingThread"),type:"select",value:others[0].id,choices:others.map(function(part){return {value:part.id,label:part.name||part.id};})}],onApply:function(values){
        var other=others.find(function(part){return part.id===values.mate;});if(!other)return false;
        var a=p.cosmeticThread.spec,b=other.cosmeticThread.spec,report=validateThreadFit(a.side==="external"?a:b,a.side==="internal"?a:b);
        if(!report.ok){flash(report.issues.map(function(issue){return issue.message;}).join("; "));return false;}
        flash(t("mfgFitClearance")+": "+report.clearances.pitchDiameter.min.toFixed(4)+"–"+report.clearances.pitchDiameter.max.toFixed(4)+" mm");return true;
      }});
    }));
  }
  var plate = sheetPlate(p), sheetOwner = E.def.sheetMetal?.sourcePartId;
  if (E.def.sheetMetal ? sheetOwner === p.id : plate) {
    var heading = el("h5", "md-h5", t("sheetMetal"));
    heading.id = "mdSheetMetal";
    host.appendChild(heading);
    var smOps = el("div", "md-ops");
    if (!E.def.sheetMetal) {
      var convert = btn('<i class="ph ph-fold"></i> ' + t("sheetMetalConvert"), function () {
        var inputs = openQuickForm({
          action: "sheetmetal", icon: "ph-fold", title: t("sheetMetalConvert"), hint: t("sheetMetalHint"),
          fields: [{ key: "thickness", label: t("sheetMetalThickness"), type: "number", unit: "length", min: 1e-6, step: 0.01,
            value: plate.thickness }],
          onApply: function () {
            if (selectedSolid() !== p || E.def.sheetMetal) return false;
            var thickness = plate.thickness;
            pushUndo(t("sheetMetalConvert"));
            E.def.sheetMetal = createSheetMetalPart({thickness,insideRadius:thickness,base:{width:plate.width,height:plate.height}});
            E.def.sheetMetal.sourcePartId = p.id;
            refreshAll();return true;
          },
        });
        if (inputs) inputs.thickness.readOnly = true;
      });
      convert.id = "mdSheetConvert";
      smOps.appendChild(convert);
    }
    if (E.def.sheetMetal) {
      if (plate && !E.def.sheetMetal.hinge && !E.def.sheetMetal.flanges?.length) smOps.appendChild(btn(t("sheetHinge"), function () {
        hingeForm({p,plate,document:E.def,t,openQuickForm,selectedSolid,pushUndo,invalidatePartMeshAfterEdit,
          targetId:isCanonicalAuthoring()?cutTargetFeatureId(p):null,uid});
      }));
      if (!E.def.sheetMetal.hinge) {
        smOps.appendChild(btn(t("mfgBendRules"), function () {
          var sheet=E.def.sheetMetal;if(!sheet){flash(t("sheetMetalNeedPlate"));return;}
          openQuickForm({action:"sheetrules",title:t("mfgBendRules"),fields:[
            {key:"radius",label:t("mfgRadius"),type:"number",unit:"length",min:0,value:sheet.insideRadius},
            {key:"k",label:"K factor",type:"number",min:0,max:.5,step:.01,value:sheet.kFactor},
            {key:"material",label:t("material"),type:"text",value:sheet.material||""},
            {key:"rule",label:t("mfgBendRules"),type:"select",value:sheet.bendRule?.type||"k-factor",choices:[{value:"k-factor",label:"K factor"},{value:"table",label:t("mfgMeasuredTable")}]},
            {key:"relief",label:t("mfgRelief"),type:"number",unit:"length",min:0,value:sheet.cornerRelief?.width||0},
          ],onApply:function(values){
            var candidate=cloneData(sheet);candidate.insideRadius=Number(values.radius);candidate.kFactor=Number(values.k);candidate.material=values.material;
            if(values.rule==="table"&&sheet.bendRule?.type!=="table"){flash(t("mfgImportFirst"));return false;}
            candidate.bendRule=values.rule==="table"?sheet.bendRule:{type:"k-factor"};candidate.cornerRelief=Number(values.relief)>0?{type:"rectangular",width:Number(values.relief)}:null;
            try{flatPattern(candidate);}catch(error){flash(String(error.message||error));return false;}
            pushUndo(t("mfgBendRules"));E.def.sheetMetal=candidate;refreshAll();return true;
          }});
        }));
        smOps.appendChild(btn(t("mfgImportTable"), function () {
          if(!E.def.sheetMetal){flash(t("sheetMetalNeedPlate"));return;}
          var definition=E.def,sheet=E.def.sheetMetal,input=document.createElement("input");input.type="file";input.accept=".json,application/json";
          input.onchange=async function(){
            try{
              if(!input.files?.[0])return;
              var table=JSON.parse(await input.files[0].text());
              if(E.def!==definition||E.def.sheetMetal!==sheet)return;
              if(table.type!=="table"||!table.name||!table.source||!["mm","cm","in"].includes(table.units)||!Array.isArray(table.rows)||!table.rows.length)throw new Error(t("mfgInvalidTable"));
              var candidate=cloneData(sheet);candidate.bendRule=table;flatPattern(candidate);
              pushUndo(t("mfgImportTable"));E.def.sheetMetal=candidate;refreshAll();flash("✓ "+table.name);
            }catch(error){flash(String(error.message||error));}
          };input.click();
        }));
        smOps.appendChild(btn('<i class="ph ph-angle"></i> ' + t("sheetMetalFlange"), function () {
          if (!E.def.sheetMetal) { flash(t("sheetMetalNeedPlate")); return; }
          openQuickForm({
            action: "sheetflange", icon: "ph-angle", title: t("sheetMetalFlange"), hint: t("sheetMetalFlangeHint"),
            fields: [
              {key:"edge",label:t("mfgEdge"),type:"select",value:"right",choices:[{value:"right",label:t("right")},{value:"left",label:t("left")},{value:"top",label:t("top")},{value:"bottom",label:t("bottom")}]},
              { key: "length", label: t("sheetMetalFlangeLen"), type: "number", unit: "length", min: 1e-6, step: 0.1, value: 3 },
              { key: "angle", label: t("sheetMetalBendAngle"), type: "number", unit: "angle", min: -180, max: 180, step: 5, value: 90 },
            ],
            onApply: function (values) {
              var length = Number(values.length), angle = Number(values.angle);
              if (!fin(length) || length <= 0 || !fin(angle)) return false;
              var candidate=cloneData(E.def.sheetMetal);
              try{addEdgeFlange(candidate,values.edge,length,angle);}catch(error){flash(String(error.message||error));return false;}
              pushUndo(t("sheetMetalFlange"));
              E.def.sheetMetal=candidate;refreshAll();
              return true;
            },
          });
        }));
      }
      smOps.appendChild(btn(t("mfgBendReport"),function(){
        if(!E.def.sheetMetal)return;
        // Resolve the current history before downloading either manufacturing file.
        try{downloadBytes(JSON.stringify(flatPattern(E.def),null,2),(E.def.name||"sheet")+"-bend-report.json","application/json");}catch(error){flash(String(error.message||error));}
      }));
      smOps.appendChild(btn('<i class="ph ph-file-svg"></i> ' + t("sheetMetalFlat"), function () {
        if (!E.def.sheetMetal) return;
        var pattern;
        try{pattern=flatPatternSvg(E.def);}catch(error){flash(String(error.message || error));return;}
        var blob = new Blob([pattern], {type:"image/svg+xml"}), a = document.createElement("a");
        a.href=URL.createObjectURL(blob); a.download=(E.def.name||"sheet")+"-flat-pattern.svg"; a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
      }));
    }
    host.appendChild(smOps);
  }

  host.appendChild(btn('<i class="ph ph-trash"></i> ' + t("del"), function () {
    var partIndex = E.def.parts.indexOf(p);
    if (partIndex < 0) return;
    pushUndo(t("del"));
    E.def.parts.splice(partIndex, 1);
    E.sel = null;
    refreshAll();
  }, "md-wide btn-danger"));
}

export {
  acceptRackPinionSolve, assemblyMateInspectorBody, fillCabinetParameters,
  fillOps, newModel, numRow, openFeatureEditor, saveAssemblyDocument,
  syncExactWorkerActivity,
};

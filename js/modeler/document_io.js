/* The CAD editor's forced rebuild, mass properties, imported bundles,
   exploded/motion playback, assembly drawings, BOM, 3MF/SVG/print output and
   STEP import, split out of js/modeler.js. It shares the editor's state through
   live imports from ../modeler.js. */
import { exportThreeMf } from "../cad_3mf.js";
import { exportAmf } from "../cad_amf.js";
import { pruneSketchMaterialFields, pruneSketchTargetedBodyAppearances } from "../cad_appearances.js";
import { evaluateAssemblyMassProperties } from "../cad_assembly_mass_properties.js";
import { buildDrawingScene } from "../cad_drawings.js";
import { applyExplodedProgress, assemblyHasExplodedOffsets, explodedOccurrenceOffset } from "../cad_exploded_view.js";
import { releaseRegeneration } from "../cad_feature_tree.js";
import { generateBOM } from "../cad_interference.js";
import { disposeBrep, extractBrepTopology, importStep, placedBrepBounds, serializeBrep, shapeToMeshData, transformBrep } from "../cad_kernel.js";
import { centerOfMassInSystem, evaluateMassProperties } from "../cad_mass_properties.js";
import { activeProjectDocument } from "../cad_project_bundle.js";
import { SHEET_SIZES, sceneToSvg } from "../cad_sheet.js";
import { nativeOccurrenceBalloonTarget } from "../core/assembly_balloon.js";
import { assemblyDrawingBOM, occurrenceBOMKey } from "../core/assembly_drawing_bom.js";
import { flattenAssembly } from "../core/assembly_structure.js";
import { externalizeAttachments } from "../core/attachment_store.js";
import { inferAuthoringMode } from "../core/authoring_mode.js";
import { encodeBinaryPayload } from "../core/binary_payload.js";
import { regenerateInCadWorker as regenerateFeatures } from "../core/cad_worker_client.js";
import { setDocumentDescription, setDocumentProperty } from "../core/custom_properties.js";
import { documentDefaults } from "../core/document_presets.js";
import { captureExactTopology } from "../core/exact_topology_cache.js";
import { createImportedDefinition, detectStepLengthUnit, stepUnitCorrection } from "../core/import_normalization.js";
import { isKernelBody, meshDataBounds } from "../core/kernel_body.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { resolvedLibraryAssembly } from "../core/model_library_store.js";
import { forkConflictingModel } from "../core/model_save_conflict.js";
import { hasSaveableModelContent } from "../core/model_save_policy.js";
import { createMotionPlaybackExecutor } from "../core/motion_playback_executor.js";
import { createMotionPlayback, motionPreviewDuration } from "../core/motion_playback.js";
import { publishRebuildStatus, rebuildParametricDocument } from "../core/parametric_rebuild.js";
import { compactAssemblyTopologySnapshots } from "../core/project_topology_budget.js";
import { commitDefinition } from "../core/project.js";
import { rebuildDefinition } from "../core/rebuild.js";
import { cloneDomain, migrateDefinition } from "../core/schema.js";
import { rebindReplacedSketchProfiles } from "../core/sketch_profile_rebind.js";
import { applyDocumentTopologyRebindings, applyTopologyRebindings } from "../core/topology.js";
import { massDisplaySystem } from "../mass_display_units.js";
import { refreshCatalogSelect } from "../model_catalog.js";
import { bomCsv, bomTableRows } from "../modeler_commands.js";
import { askModelerDecision } from "../modeler_decision.js";
import { clearTopologyCache } from "../modeler_mesh_geometry.js";
import { cloneData, normalizeTransform } from "../modeler_part_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { openQuickForm, syncExplodeCommandState } from "../modeler/command_manager.js";
import { refreshParts, rejectFlexibleSpringPreview } from "../modeler/component_mates.js";
import { assemblySaveSession, confirmDiscardDocument, currentHistoryNode, markDocumentClean, pushUndo, reconcileModelerDraft, scheduleModelerDraft, syncDirty } from "../modeler/document_history.js";
import { closeEvalCard, createEmptyExplodedView, documentOwnership, documentStillOwned, evalRow, massEvaluationChanged, occurrenceWorldBounds, standardsGate, syncMassPropertiesEvaluation } from "../modeler/document_outputs.js";
import { saveCurrentDocument, saveProgress, setDocumentType } from "../modeler/document_save.js";
import { drawingSheet, flash, prepareConfiguredDrawingExport, report, sheetForm, sheetRow, sheetSelect } from "../modeler/drawing_sheet.js";
import { btn, el } from "../modeler/editor_dom.js";
import { abandonDocumentExactWork, downloadBytes, evalCardActions, exactRunIsCurrent, exactRunStamp, openEvalCard, rebuildFailureMessage, rebuildFeatureTreeFromDocument, regenerateExactModel, releaseExactRun } from "../modeler/export_measure.js";
import { cutTargetFeatureId, publishExactBodies } from "../modeler/feature_create.js";
import { refreshModelHistoryPane } from "../modeler/feature_tree.js";
import { modelParameterOverrides } from "../modeler/inspector.js";
import { invalidateInterference, saveAssemblies, saveLib } from "../modeler/library_assembly_state.js";
import { cancelExactModelRebuild, refreshLib, setMode, syncHead } from "../modeler/library_io.js";
import { assemblyExplodeLines, refreshChangedParts, renderPreview, updatePreview } from "../modeler/library_panel.js";
import { activeParts, componentDef, normalizeDef } from "../modeler/library_store.js";
import { exactDisplayBody } from "../modeler/prefs_snap.js";
import { syncSketchDrivenParts } from "../modeler/sketch_entities.js";
import { closeFeaturePanel, isCanonicalAuthoring } from "../modeler/sketch_workflow.js";
import { finishContextPart } from "../modeler/tree_assembly.js";
import { fitPreview } from "../modeler/view_modes.js";
import { registerCustomModel } from "../modeler/viewport_decorations.js";
import { syncCoach } from "../modeler/welcome_coach.js";
import { finalizeCabinetAdvancedDefinition } from "../parametric_cabinet.js";
import { markDirty as markPlannerDirty } from "../persist.js";
import { render2D } from "../plan2d.js";
import { ensureSketchDoc, pruneAbandonedSketches } from "../sketch_solver.js";
import { S, fin, uid } from "../state.js";
import {
  E, H, assemblyBalloonCache, documentSaveTasks, exactBuildTimers,
  exactSaveCache, explodedPlaybackStop, lastLibrarySaveConflict,
  lastLibrarySaveError, libraryOpenBaseline, massCoordinateSystemId,
  massDisplayUnits, motionPlaybackCancel, partHistoryMarker, refreshAll,
  refreshAssemblyPosePreview, root, set_assemblyOpenBaseline,
  set_cancelledExactPreview, set_coreRunFresh, set_explodedPlaybackStop,
  set_libraryOpenBaseline, set_massCoordinateSystemId, set_massDisplayUnits,
  set_motionPlaybackCancel, set_partHistoryMarker,
} from "../modeler.js";

/* Ctrl+B is an authoring command, not merely an export-kernel warm-up.  A
   sketch edit can leave the lightweight body projection (especially Sweep
   and Loft) holding geometry sampled by an earlier commit even though the
   feature tree itself already points at the edited sketch.  Re-resolve every
   sketch-backed recipe, cancel builds that could publish the old recipe, and
   discard derived display caches before compiling the complete history.

   regenerateExactModel() deliberately remains the narrower primitive used by
   STEP/IGES export and automatic exact restore; those callers must not blank
   the viewport or turn a read operation into a document-wide refresh. */
async function forceRebuildDocument() {
  if (E.docType !== "part" || !E.def) { flash(t("cmdNeedPartDoc")); return null; }
  if (!activeParts(E.def).length) { flash(t("needParts")); return null; }
  set_cancelledExactPreview(null);

  syncSketchDrivenParts();
  var changedParts = [];
  (E.def.parts || []).forEach(function (part) {
    var scheduled=exactBuildTimers.get(part);
    if(scheduled){clearTimeout(scheduled);exactBuildTimers.delete(part);}
    part.exactBuildToken=(part.exactBuildToken || 0)+1;
    part.exactPending=false;
    part.exactError=null;
    /* Imported/frozen mesh bodies are source data, not derived output. */
    if (isCanonicalAuthoring() || part.sketchDriven || isKernelBody(part)) {
      delete part.meshData;
      if (isKernelBody(part)) delete part.bounds;
      clearTopologyCache(part);
      changedParts.push(part);
    }
  });
  refreshChangedParts(changedParts);
  releaseExactRun();
  E.coreRun=null;
  set_coreRunFresh(false);
  refreshAll();
  var run=await regenerateExactModel(true,{restoreMode:'mesh'});
  if(run){refreshAll();flash("✓ "+t("forceRebuildReady"));}
  return run;
}

async function showMassProperties() {
  if (E.docType !== "part" && E.docType !== "assembly") return;
  var documentAtStart=E.docType==="assembly"?E.assembly:E.def;
  if(!documentAtStart)return;
  if(documentAtStart.documentProperties)set_massDisplayUnits(documentDefaults(documentAtStart).massUnit==='lb'?'ips':documentDefaults(documentAtStart).massUnit==='g'?'mmg':'si');
  var snapshot=E.docType==="assembly"?cloneData(E.assembly):cloneData({...E.def,parts:activeParts(E.def)});
  var body = openEvalCard("mass", t("cmdEvaluate"), t("massProps"));
  if (!body) return;
  var evaluation={type:E.docType,document:documentAtStart,node:currentHistoryNode(),editRevision:E.massEditRevision || 0};
  E.massEvaluation=evaluation;
  body.textContent=t("liveExactCalc");
  var releases=new Map();
  var mass = E.docType==="assembly" ? await evaluateAssemblyMassProperties(snapshot,{
    resolveDefinition:function(component){return component.def || componentDef(component);},
    evaluateDefinition:async function(def){
      var source=cloneData({...def,parts:activeParts(def)});
      var measuredSolids=new Map(),sourceReleases=new Map();
      var measured;
      try{measured=await evaluateMassProperties(source,{
        bodyKey:function(part){return source.metadata?.authoringSystem==="parametric-v1" && (source.features || []).some(function(feature){return feature.id===part.featureId;}) ? cutTargetFeatureId(part,source) : part;},
        buildSolid:async function(part){var display=await exactDisplayBody(part,source,null,{massProperties:true});measuredSolids.set(part.id,display.brep);sourceReleases.set(display.brep,display.release);return display.brep;},
        releaseSolid:function(){},
      });}catch(error){sourceReleases.forEach(function(release){release();});throw error;}
      return {...measured,
        boundsAtPlacement:async function(row,placement){
          var solid=measuredSolids.get(row.partId);
          if(row.accuracy!=="exact" || !solid)return null;
          return placedBrepBounds(solid,{matrix:[placement.x.x,placement.y.x,placement.z.x,placement.x.y,placement.y.y,placement.z.y,placement.x.z,placement.y.z,placement.z.z],translation:placement.origin});
        },
        release:function(){sourceReleases.forEach(function(release){release();});sourceReleases.clear();},
      };
    },
  }) : await evaluateMassProperties(snapshot,{
    bodyKey:function(part){return snapshot.metadata?.authoringSystem==="parametric-v1" && (snapshot.features || []).some(function(feature){return feature.id===part.featureId;}) ? cutTargetFeatureId(part,snapshot) : part;},
    // Part mass uses the worker's native integral/bounds proof and does not
    // need to deserialize a second BREP on the UI thread. Assembly placement
    // queries above still require the native shape for transformed bounds.
    buildSolid:async function(part){var display=await exactDisplayBody(part,snapshot,null,{massProperties:true,restoreMode:'mesh'});releases.set(display.brep,display.release);return display.brep;},
    releaseSolid:function(solid){releases.get(solid)?.();releases.delete(solid);},
  });
  if(E.evalCard!=="mass" || E.massEvaluation!==evaluation || !body.isConnected)return;
  if(massEvaluationChanged(evaluation)){syncMassPropertiesEvaluation();return;}
  function paintMass() {
    if(E.massEvaluation!==evaluation || E.evalCard!=="mass")return;
    if(massEvaluationChanged(evaluation)){syncMassPropertiesEvaluation();return;}
    body.textContent="";
    var system=massDisplaySystem(massDisplayUnits);
    var quantity=function(value,kind,precision){return (value*system[kind]).toPrecision(precision||7)+" "+system[kind+"Unit"];};
    var units=el("div","md-ops");
    [["si",t("massUnitsSi")],["mmg",t("massUnitsMmG")],["ips",t("massUnitsIps")]].forEach(function(pair){
      var button=btn(pair[1], function(){ set_massDisplayUnits(pair[0]); paintMass(); });
      if(pair[0]===massDisplayUnits) button.setAttribute("aria-pressed","true");
      units.appendChild(button);
    });
    body.appendChild(units);
    evalRow(body,t("massAccuracy"),t("massAccuracy_"+mass.accuracy));
    if (mass.bounds) evalRow(body,t("massOverallSize"),["x","y","z"].map(function(axis){return axis.toUpperCase()+" "+Number(((mass.bounds.max[axis]-mass.bounds.min[axis])*system.length).toFixed(4));}).join(" · ")+" "+system.lengthUnit);
    evalRow(body, t("massVolume"), quantity(mass.volumeCm3,"volume"));
    evalRow(body, t("massMass"), quantity(mass.massKg,"mass"));
    evalRow(body, t("massDensity"), mass.density == null ? t("massMixedDensity") : quantity(mass.density,"density",6));
    // Suppress quadrature noise at a symmetric body's zero coordinate.
    var massCoord=function(value){var v=value*system.length;return String(Math.abs(v)<1e-9?0:Number(v.toPrecision(7)));};
    /* "Report coordinate values relative to": the centre of mass expressed in a
       user coordinate system (origin plus possibly reversed axes). */
    var coordinateSystems=((evaluation.type==="assembly"?E.assembly:E.def).referenceGeometry || []).filter(function(r){return r.type==="coordinate_system";});
    var chosen=coordinateSystems.find(function(r){return r.id===massCoordinateSystemId;}) || null;
    if(coordinateSystems.length){
      var pick=el("select","md-input");
      pick.setAttribute("aria-label",t("massReportRelative"));
      var none=document.createElement("option");none.value="";none.textContent=t("massDefaultSystem");pick.appendChild(none);
      coordinateSystems.forEach(function(r){var o=document.createElement("option");o.value=r.id;o.textContent=r.name;if(chosen&&chosen.id===r.id)o.selected=true;pick.appendChild(o);});
      pick.addEventListener("change",function(){set_massCoordinateSystemId(pick.value);paintMass();});
      var pickRow=el("div","md-eval-row");pickRow.appendChild(el("span","",t("massReportRelative")));pickRow.appendChild(pick);body.appendChild(pickRow);
    }
    var com=mass.centerOfMass;
    if(chosen){
      com=centerOfMassInSystem(com,chosen);
    }
    evalRow(body, t("massCentre")+(chosen?" · "+chosen.name:""), "X "+massCoord(com.x)+"   Y "+massCoord(com.y)+"   Z "+massCoord(com.z)+" "+system.lengthUnit);
    (mass.bodies || []).forEach(function(row,index){
      var label=(row.componentName?row.componentName+" · ":"")+(row.materialName || t("massNoMaterial"));
      evalRow(body, t("massBodyRow")+" "+(index+1)+" · "+label, quantity(row.volume,"volume",6)+" · "+quantity(row.massKg||0,"mass",6)+" · "+quantity(row.density,"density",6));
      if(row.error) body.appendChild(el("div", "md-note", t("massBodyRow")+" "+(index+1)+": "+row.error));
      if(Number.isInteger(row.solidCount))evalRow(body,"Native solids · "+(row.componentName || t("massBodyRow")+" "+(index+1)),String(row.solidCount));
      if(row.solidCount>1)body.appendChild(el("div","md-note","Disconnected solids · "+row.solidCount+" in "+(row.componentName || t("massBodyRow")+" "+(index+1))));
    });
    if(mass.inertiaKgM2){
      evalRow(body,t("massInertia"),system.inertiaUnit);
      var inertiaScale=Math.max.apply(null,mass.inertiaKgM2.map(function(row){return Math.max.apply(null,row.map(Math.abs));}));
      mass.inertiaKgM2.forEach(function(row,i){evalRow(body,"XYZ"[i],row.map(function(v){return Math.abs(v)<=inertiaScale*1e-9?"0":(v*system.inertia).toPrecision(6);}).join("   "));});
    }
    if (mass.unmeasured) body.appendChild(el("div", "md-note", mass.unmeasured + " " + t("massUnmeasured")));
  }
  paintMass();
}

async function openImportedBundle(bundle) {
      if (!bundle || !bundle.mainModel || !Array.isArray(bundle.mainModel.parts)) throw new Error("Bundle has no main model");
      if (!await confirmDiscardDocument("unsavedOpen")) return;
      var approved=documentOwnership();
      closeEvalCard();
      if (Array.isArray(bundle.assemblies) && bundle.assemblies.length) {
        if (!await saveAssemblies(bundle.assemblies,{mode:"merge"})) throw new Error(t("saveStorageFull"));
        // The library write yields. A form opened or typed into, or an edit made,
        // meanwhile was not part of the discard the user approved: ask again.
        if (!documentStillOwned(approved) && (!E.open || !await confirmDiscardDocument("unsavedOpen"))) return;
      }
      abandonDocumentExactWork();
      var active=activeProjectDocument(bundle);
      if(E.contextEdit){E.def=E.contextEdit.previousDef;E.contextEdit=null;}
      E.srcItem=null; E.sel=null; E.ssel=[]; E.topologySelection=[]; E.componentSel=[];
      if(active.type==="assembly") {
        set_assemblyOpenBaseline(cloneData(active.assembly));
        E.assembly=cloneData(compactAssemblyTopologySnapshots(resolvedLibraryAssembly(active.assembly)));
        setDocumentType("assembly");
      } else {
        E.def=migrateDefinition(bundle.mainModel);
        set_partHistoryMarker({savedEdit:0});
        set_libraryOpenBaseline(null);
        setDocumentType("part");
      }
      H.clear().seed(); markDocumentClean(); reconcileModelerDraft();
      syncHead(); refreshAll(); refreshLib(); setMode("3d"); fitPreview();
      flash("✓ " + t("bundleImported"));
}

function openExplodedPlayback() {
  if(E.docType!=="assembly")return;
  if(explodedPlaybackStop)explodedPlaybackStop();
  const assembly=E.assembly;
  let view=assembly?.explodedViews?.find(item=>item.id===assembly.activeExplodedView) || assembly?.explodedViews?.[0];
  if(!view)return;
  assembly.activeExplodedView=view.id;
  let frame=0,progress=0,lastTime=0;
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;lastTime=0;};
  const update=()=>{
    if(!isCurrent()){stop();return;}
    applyExplodedProgress(assembly,view.id,progress);
    E.pv?.grp?.traverse(object=>{
      const component=object._cadExplodeComponent;
      if(component){const tr=normalizeTransform(component),off=component.explodedOffset;object.position.set(tr.x+(off?.x||0),tr.y+(off?.y||0),tr.z+(off?.z||0));}
      if(object.userData.cadExplodeLine || object.userData.cadInterference !== undefined)object.visible=false;
    });
    E.pv?.render();
    syncExplodeCommandState();
    status.textContent=t(assemblyHasExplodedOffsets(assembly)?'assemblyExploded':'assemblyAssembled')+" · "+Math.round(progress*100)+"% · "+view.steps.length+" steps";
  };
  const inputs=openQuickForm({action:"explodeplay",presentationOnly:true,title:"Exploded animation",hint:"Play the saved steps in order. Stop pauses; Reset returns to the assembled position.",fields:[{key:"view",label:"Exploded view",type:"select",value:view.id,choices:assembly.explodedViews.map(item=>({value:item.id,label:item.name || item.id}))},{key:"duration",label:"Duration (seconds)",type:"number",value:view.animationDurationSeconds || Math.max(4,view.steps.length),step:1}],onApply:()=>true,onCancel:stop,onDismiss:()=>{stop();set_explodedPlaybackStop(null);}});
  const host=root.querySelector("#mdQuickSettings");
  if(!inputs || !host)return;
  set_explodedPlaybackStop(stop);
  const instance=E.quickFormInstance;
  const isCurrent=()=>E.quickFormInstance===instance && E.docType==="assembly" && E.assembly===assembly && !host.hidden;
  const duration=inputs.duration,actions=host.querySelector('.md-feature-actions');
  actions.innerHTML="";
  duration.addEventListener("change",()=>{if(!isCurrent())return;const seconds=Number(duration.value);if(Number.isFinite(seconds) && seconds>0 && seconds<=3600){pushUndo("Animation duration");view.animationDurationSeconds=seconds;instance?.rememberInputs();syncHead();}});
  const status=el("div","md-note",t(assemblyHasExplodedOffsets(assembly)?'assemblyExploded':'assemblyAssembled')+" · "+view.steps.length+" steps");host.appendChild(status);
  if(inputs.view)inputs.view.addEventListener("change",()=>{
    const selected=assembly.explodedViews.find(item=>item.id===inputs.view.value);
    if(!isCurrent() || !selected || selected===view)return;
    stop();pushUndo("Select exploded view");view=selected;assembly.activeExplodedView=view.id;
    duration.value=String(view.animationDurationSeconds || Math.max(4,view.steps.length));
    instance?.rememberInputs();progress=1;update();refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});fitPreview();syncHead();
  });
  const tick=time=>{
    if(!host.isConnected || !isCurrent()){stop();return;}
    if(lastTime)progress=Math.min(1,progress+(time-lastTime)/(Math.max(.1,Number(duration.value)||7)*1000));
    lastTime=time;update();
    if(progress<1)frame=requestAnimationFrame(tick);else{stop();status.textContent="Complete · "+view.steps.length+" steps";}
  };
  actions.appendChild(btn("Play",()=>{if(!isCurrent())return;stop();if(progress>=1)progress=0;update();frame=requestAnimationFrame(tick);},"md-quick-apply"));
  actions.appendChild(btn("Stop",()=>{if(!isCurrent())return;stop();status.textContent="Paused · "+Math.round(progress*100)+"%";}));
  actions.appendChild(btn("Reset",()=>{if(!isCurrent())return;stop();progress=0;update();}));
  actions.appendChild(btn("Close",()=>{if(!isCurrent())return;closeFeaturePanel({assemblyPoseOnly:true});refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});}));
  actions.appendChild(btn("New exploded view",()=>{if(isCurrent())createEmptyExplodedView();}));
}

function openMotionPlayback(studyId) {
  const assembly=E.assembly,study=assembly?.motionStudies?.find(item=>item.id===studyId);
  if(E.docType!=="assembly" || !study)return;
  let playback,executor;const controls={};
  const cancel=()=>{playback?.cancel();if(motionPlaybackCancel===cancel)set_motionPlaybackCancel(null);};
  const inputs=openQuickForm({action:"motionplay",presentationOnly:true,title:"Motion playback · "+study.name,
    hint:"Preview the assembled mechanism using the saved motor and mates. Reset seeks time zero. Cancel restores the opening pose; Keep current pose commits it. The opening exploded view returns when this preview closes.",
    fields:[{key:"duration",label:"Preview duration (seconds)",type:"number",value:motionPreviewDuration(study),min:.1,step:.1}],onApply:()=>false,onCancel:cancel,onDismiss:cancel});
  const host=root.querySelector("#mdQuickSettings");if(!inputs || !host)return;
  const instance=E.quickFormInstance;
  const isCurrent=()=>E.quickFormInstance===instance && E.docType==="assembly" && E.assembly===assembly && !host.hidden;
  const status=el("div","md-note","Ready"),timeRow=el("label","md-row md-row-wide"),scrub=el("input");
  scrub.type="range";scrub.min="0";scrub.step=".01";scrub.setAttribute("aria-label","Motion time (seconds)");
  timeRow.appendChild(el("span","t","Time (seconds)"));timeRow.appendChild(scrub);host.append(timeRow,status);
  const showPose=()=>{
    if(!isCurrent())return;
    invalidateInterference();if(!refreshAssemblyPosePreview())updatePreview();
    renderPreview();syncDirty();
  };
  try {executor=createMotionPlaybackExecutor(assembly);}catch(error){flash(String(error.message||error));return;}
  playback=createMotionPlayback(assembly,studyId,{evaluate:executor.evaluate,requestFrame:callback=>requestAnimationFrame(callback),cancelFrame:id=>cancelAnimationFrame(id),
    isCurrent,
    onClose:()=>{executor.dispose();if(motionPlaybackCancel===cancel)set_motionPlaybackCancel(null);},
    beforeCommit:()=>pushUndo("Keep motion preview pose"),onPose:showPose,
    onState:state=>{scrub.max=String(state.duration);scrub.value=String(state.time);scrub.disabled=state.busy;inputs.duration.disabled=state.busy;
      if(controls.play)controls.play.disabled=state.busy || state.running;
      if(controls.reset)controls.reset.disabled=state.busy;
      if(controls.keep)controls.keep.disabled=state.busy || state.running;
      status.textContent=state.message+" · "+state.time.toFixed(2)+" / "+state.duration.toFixed(2)+" s";}
  });
  set_motionPlaybackCancel(cancel);
  showPose();
  const commitDuration=()=>{
    if(!isCurrent())return false;
    if(Number(inputs.duration.value)===playback.state.duration)return true;
    if(playback.setDuration(inputs.duration.value))return true;
    inputs.duration.value=String(playback.state.duration);return false;
  };
  inputs.duration.addEventListener("change",commitDuration);
  inputs.duration.addEventListener("keydown",event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();commitDuration();}});
  scrub.addEventListener("input",()=>{if(!isCurrent())return;const time=Number(scrub.value);playback.pause();scrub.value=String(time);status.textContent="Time "+time.toFixed(2)+" s · release to solve";});
  scrub.addEventListener("change",()=>{if(!isCurrent())return;const time=Number(scrub.value);playback.pause();playback.seek(time);});
  const actions=host.querySelector('.md-feature-actions');actions.innerHTML="";
  controls.play=btn("Play",()=>{if(commitDuration())return playback.play();},"md-quick-apply");actions.appendChild(controls.play);actions.appendChild(btn("Pause",()=>playback.pause()));
  controls.reset=btn("Reset",()=>{if(commitDuration())return playback.reset();});actions.appendChild(controls.reset);
  controls.keep=btn("Keep current pose",()=>{if(!commitDuration() || !playback.keep())return;closeFeaturePanel({assemblyPoseOnly:true});refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});});actions.appendChild(controls.keep);
  actions.appendChild(btn("Cancel preview",()=>{if(!isCurrent())return;closeFeaturePanel({assemblyPoseOnly:true});refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});}));
}

/* A general-arrangement sheet: one outline per component where the mates put
   it, numbered against the bill of materials. The drawing module already draws
   any part it has no mesh for as its view rectangle, so an envelope per
   component is the fidelity a part sheet gets too, not a shortcut past it. */
function assemblyDrawingBOMRows() {
  return assemblyDrawingBOM(E.assembly,E.assembly?.drawingSettings?.bomScope).rows;
}

function assemblyDrawingBalloonTargets(owner = E.assembly) {
  if(!owner)return [];
  var bom=assemblyDrawingBOM(owner,owner.drawingSettings?.bomScope);
  var stamp=JSON.stringify(bom.rows),cached=assemblyBalloonCache.get(owner);
  if(cached?.token===E.sheetToken&&cached.stamp===stamp)return cached.targets;
  var targets=flattenAssembly(owner,{visibleOnly:true}).map(function(occurrence){
    var key=occurrenceBOMKey(occurrence.path),item=bom.itemByPath.get(key),def=componentDef(occurrence.component);
    return nativeOccurrenceBalloonTarget(occurrence,def?activeParts(def):[],item,explodedOccurrenceOffset(occurrence))
      || {key,path:occurrence.path.map(String),item,missing:true};
  });
  assemblyBalloonCache.set(owner,{token:E.sheetToken,stamp,targets});return targets;
}
function assemblyDrawingDocument() {
  var occurrences = flattenAssembly(E.assembly, { visibleOnly: true });
  /* One chosen numbering scope supplies both the table and leaf balloons. */
  var bom = assemblyDrawingBOM(E.assembly,E.assembly?.drawingSettings?.bomScope),rows=bom.rows;
  var parts = [], targets = [];
  /* The sheet shows the real bodies where the mates put them, moved by the
     active exploded view, not an envelope per component. */
  occurrences.forEach(function (occurrence) {
    var component = occurrence.component, placement = occurrence.placement;
    var blown = explodedOccurrenceOffset(occurrence);
    var def = componentDef(component);
    var bodies = def ? activeParts(def).filter(function (part) { return part.meshData && part.meshData.positions && part.meshData.positions.length >= 9; }) : [];
    var item = bom.itemByPath.get(occurrenceBOMKey(occurrence.path));
    if(item===undefined)return;
    var low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    if (!placement || !bodies.length) {
      var bounds = occurrenceWorldBounds(component,placement);
      if (!bounds) return;
      bounds={x0:bounds.x0+blown.x,x1:bounds.x1+blown.x,y0:bounds.y0+blown.y,y1:bounds.y1+blown.y,z0:bounds.z0+blown.z,z1:bounds.z1+blown.z};
      parts.push({ id: occurrence.path.join('/'), kind: "box", name: component.name || component.modelKey || component.assemblyKey, x0: bounds.x0, x1: bounds.x1, y0: bounds.y0, y1: bounds.y1, z0: bounds.z0, z1: bounds.z1 });
      targets.push({ item: item, point: { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2, z: (bounds.z0 + bounds.z1) / 2 } });
      return;
    }
    bodies.forEach(function (part) {
      var source = part.meshData.positions, baked = new Array(source.length);
      for (var i = 0; i + 2 < source.length; i += 3) {
        var px = Number(source[i]), py = Number(source[i + 1]), pz = Number(source[i + 2]);
        var point = [
          placement.origin.x + blown.x + placement.x.x * px + placement.y.x * py + placement.z.x * pz,
          placement.origin.y + blown.y + placement.x.y * px + placement.y.y * py + placement.z.y * pz,
          placement.origin.z + blown.z + placement.x.z * px + placement.y.z * py + placement.z.z * pz,
        ];
        for (var a = 0; a < 3; a++) { baked[i + a] = point[a]; if (point[a] < low[a]) low[a] = point[a]; if (point[a] > high[a]) high[a] = point[a]; }
      }
      parts.push({ id: occurrence.path.join('/') + ":" + part.id, name: component.name || component.modelKey || component.assemblyKey, meshData: { positions: baked, faceRanges: cloneData(part.meshData.faceRanges || []) } });
    });
    targets.push({ item: item, point: { x: (low[0] + high[0]) / 2, y: (low[1] + high[1]) / 2, z: (low[2] + high[2]) / 2 } });
  });
  return {
    def: { kind: "assembly", name: E.assembly.name || t("docAssembly"), parts: parts },
    targets: targets,
    balloons: rows.map(function (row) {
      return { item: row.item, name: row.name, description: row.description, partNumber: row.partNumber, material: row.material || "", qty: row.quantity };
    }),
  };
}

/* Export what Drawing mode shows. An unopened document has no sheet yet, so it
   gets the standard three-view one the exporter builds — the same engine, so
   the file and the screen can never drift apart. */
function showAssemblyDrawingSettings(focusNotes) {
  if (!E.assembly) return;
  root.querySelector("#mdAssemblySheetDialog")?.remove();
  var dialog = document.createElement("dialog");
  dialog.id = "mdAssemblySheetDialog";
  dialog.style.cssText = "max-width:min(34rem,90vw);max-height:85vh;overflow:auto;border-radius:12px;padding:1.2rem";
  dialog.appendChild(el("h2", "", "Assembly drawing"));
  var settings = E.assembly.drawingSettings || {};
  var fields = {};
  function textField(label, value) {
    var field = document.createElement("input");
    field.value = value || "";
    field.setAttribute("aria-label", label);
    fields[label] = sheetRow(dialog, label, field);
  }
  fields.size = sheetRow(dialog, "Sheet size", sheetSelect(Object.keys(SHEET_SIZES).map(function(key) {
    return { value: key, label: key === "Letter" ? "A (ANSI) Landscape / Letter" : key === "ANSI_C" ? "C (ANSI) / 22 × 17 in" : key };
  }), settings.size || "A3", function() {}));
  fields.size.setAttribute("aria-label", "Sheet size");
  fields.units = sheetRow(dialog, "Drawing units", sheetSelect(["mm", "cm", "in"].map(function(unit) {
    return { value: unit, label: unit };
  }), settings.units || "in", function() {}));
  fields.units.setAttribute("aria-label", "Drawing units");
  fields.scale = sheetRow(dialog, "Sheet scale", sheetSelect([
    { value:"fit", label:"Fit to sheet" }, { value:"1:1", label:"1:1" },
    { value:"2:1", label:"2:1" }, { value:"1:2", label:"1:2" }, { value:"1:4", label:"1:4" }
  ], Array.isArray(settings.scale) ? settings.scale.join(":") : "fit", function() {}));
  fields.scale.setAttribute("aria-label", "Sheet scale");
  fields.projection = sheetRow(dialog, "Projection", sheetSelect([
    { value:"third", label:"Third angle" }, { value:"first", label:"First angle" }
  ], settings.projection || "third", function() {}));
  fields.projection.setAttribute("aria-label", "Projection");
  fields.bomScope=sheetRow(dialog,t('drawingBOMScope'),sheetSelect([{value:'partsOnly',label:t('drawingBOMPartsOnly')},{value:'indented',label:t('drawingBOMIndented')}],settings.bomScope==='indented'?'indented':'partsOnly',function(){}));
  fields.bomScope.setAttribute('aria-label',t('drawingBOMScope'));
  ["Title", "Number", "Revision", "Drawn by", "Company", "Date", "Material", "Finish", "Mass"].forEach(function(label, index) {
    var key = ["title", "number", "revision", "author", "company", "date", "material", "finish", "mass"][index];
    textField(label, settings[key] || (key === "title" ? E.assembly.name : key === "revision" ? "A" : ""));
  });
  var notes=document.createElement("textarea");
  notes.value=settings.notes || "";notes.rows=5;notes.setAttribute("aria-label","Drawing notes");
  notes.style.cssText="width:100%;min-height:6rem;resize:vertical";
  fields.notes=sheetRow(dialog,"Drawing notes",notes);
  function apply() {
    var next = { size: fields.size.value, units: fields.units.value, scale: fields.scale.value === "fit" ? "fit" : fields.scale.value.split(":").map(Number), projection: fields.projection.value, bomScope:fields.bomScope.value==='indented'?'indented':'partsOnly', orientation:"landscape", draftingStandard:"ANSI", notes:fields.notes.value.trim() };
    ["Title", "Number", "Revision", "Drawn by", "Company", "Date", "Material", "Finish", "Mass"].forEach(function(label, index) {
      next[["title", "number", "revision", "author", "company", "date", "material", "finish", "mass"][index]] = fields[label].value.trim();
    });
    var properties = {customProperties: {...(E.assembly.customProperties || {})}};
    ["Number", "Revision", "DrawnBy", "CompanyName", "DrawnDate", "Description"].forEach(function(key, index) {
      setDocumentProperty(properties, key, next[["number", "revision", "author", "company", "date", "title"][index]]);
    });
    if (JSON.stringify(E.assembly.drawingSettings || {}) === JSON.stringify(next)
      && JSON.stringify(E.assembly.customProperties || {}) === JSON.stringify(properties.customProperties || {})) return;
    pushUndo("Assembly drawing settings");
    E.assembly.drawingSettings = next;
    if (properties.customProperties) E.assembly.customProperties = properties.customProperties;
    else delete E.assembly.customProperties;
    syncHead();refreshAll();
  }
  var save = el("button", "", "Apply drawing settings");
  save.type = "button";
  save.onclick = function() { apply(); dialog.close(); };
  var output = el("button", "", "Export drawing SVG");
  output.type = "button";
  output.onclick = function() { apply(); exportDrawingSvg(); dialog.close(); };
  var preview = el("button", "", "Preview drawing");
  preview.type = "button";
  preview.onclick = async function() { apply(); if(await showDrawingPreview())dialog.close(); };
  var edit = el("button", "", "Open native Drawing");
  edit.type = "button";
  edit.onclick = function() { apply(); dialog.close(); setMode("drawing"); };
  var cancel = el("button", "", "Cancel");
  cancel.type = "button";
  cancel.onclick = function() { dialog.close(); };
  dialog.append(save, edit, preview, output, cancel);
  dialog.addEventListener("close", function() { dialog.remove(); }, { once:true });
  root.appendChild(dialog);
  dialog.showModal();
  if(focusNotes)notes.focus();
}

async function exportThreeMfDocument(settings,format,unqualifiedDraft) {
  format=format==="amf" ? "amf" : "3mf";
  if(E.docType!=="part" || !standardsGate(format.toUpperCase()+" export",{unqualifiedDraft:unqualifiedDraft===true,onDraft:function(){exportThreeMfDocument(settings,format,true);}}))return;
  try {
    var run=exactRunIsCurrent() ? E.brepRun : await regenerateExactModel();
    if(!run || !run.ok || !run.finalShape)throw new Error("The exact model must rebuild successfully before export");
    var name=(E.def?.name || "model")+(unqualifiedDraft===true?"__UNQUALIFIED_DRAFT":"");
    var bytes=format==="amf" ? await exportAmf(run.finalShape,name,settings) : await exportThreeMf(run.finalShape,name,settings);
    downloadBytes(bytes,name+"."+format,format==="amf" ? "application/xml" : "model/3mf");
    flash("✓ "+format.toUpperCase()+" exported · millimeters · Z-up");
  } catch(error) {flash(format.toUpperCase()+" export failed: "+String(error.message || error),6000);}
}

function drawingSvgContent() {
  var svg;
  if(E.docType==='assembly' && E.assembly?.drawing) svg=drawingSheet().svg();
  else if (E.docType === "assembly" && E.assembly) {
    var sheet = assemblyDrawingDocument();
    if (!sheet.def.parts.length) throw new Error(t("noComponents"));
    sheet.def.customProperties = E.assembly.customProperties || {};
    svg = sceneToSvg(buildDrawingScene(sheet.def, { requireFit:true, ...(E.assembly.drawingSettings || {}), balloons: sheet.balloons, balloonTargets: sheet.targets, explodeLines: assemblyExplodeLines(), overallDimensions: false, views: ["iso"], title: E.assembly.drawingSettings?.title || E.assembly.name, useStored: false }));
  } else if (E.mode === "drawing" || (E.def && E.def.drawing)) svg = drawingSheet().svg();
  else svg = sceneToSvg(buildDrawingScene(E.def, { section: true, holeCallouts: true, useStored: false }));
  return svg;
}

function drawingSvgFilename() {
  return ((E.docType === "assembly" && E.assembly ? E.assembly.name : E.def && E.def.name) || "drawing").replace(/[^a-z0-9_-]+/gi, "_") + ".svg";
}

async function showDrawingPreview() {
  if(rejectFlexibleSpringPreview())return false;
  var svg;
  try { await prepareConfiguredDrawingExport();svg = drawingSvgContent(); } catch(error) { flash(String(error.message || error),6000);return false; }
  root.querySelector("#mdDrawingPreviewDialog")?.remove();
  var dialog=document.createElement("dialog");
  dialog.id="mdDrawingPreviewDialog";
  dialog.setAttribute("aria-label","Drawing preview");
  dialog.style.cssText="width:min(94vw,110rem);max-width:94vw;max-height:92vh;overflow:auto;border-radius:12px;padding:1rem";
  dialog.appendChild(el("h2","","Drawing preview"));
  var sheet=el("div","md-drawing-preview");
  // Only the app's SVG writer supplies this markup. This is the exact exported
  // sheet, including its paper dimensions, title block, BOM and notes.
  sheet.innerHTML=svg;
  var rendered=sheet.querySelector("svg");
  if(rendered){rendered.style.width="100%";rendered.style.height="auto";rendered.setAttribute("aria-label","Drawing sheet");}
  var url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
  var download=el("a","btn","Download SVG");
  download.href=url;download.download=drawingSvgFilename();
  var close=el("button","","Close preview");close.type="button";close.onclick=function(){dialog.close();};
  dialog.append(download,close,sheet);
  dialog.addEventListener("close",function(){URL.revokeObjectURL(url);dialog.remove();},{once:true});
  root.appendChild(dialog);dialog.showModal();
  return true;
}

async function exportDrawingSvg() {
  if(rejectFlexibleSpringPreview())return;
  var svg;
  try { await prepareConfiguredDrawingExport();svg = drawingSvgContent(); } catch(error) { flash(String(error.message || error),6000);return; }
  var blob = new Blob([svg], { type: "image/svg+xml" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = drawingSvgFilename();
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  flash(t("drawExported"));
}

/* Print the sheet at its true paper size: the SVG is metric millimetres, so a
   browser print with no margins puts an A3 drawing on A3 paper. */
async function printDrawingSheet() {
  if(rejectFlexibleSpringPreview())return;
  var svg;try{await prepareConfiguredDrawingExport();svg=drawingSheet().svg();}catch(error){flash(String(error.message||error),6000);return;}
  var frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
  document.body.appendChild(frame);
  var doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { flash(t("drawPrintFailed")); frame.remove(); return; }
  doc.open();
  doc.write("<!doctype html><meta charset='utf-8'><style>@page{margin:0}html,body{margin:0;padding:0}svg{display:block}</style>" + svg);
  doc.close();
  var done = function () {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (error) { flash(t("drawPrintFailed")); }
    setTimeout(function () { frame.remove(); }, 1000);
  };
  if (doc.readyState === "complete") done(); else frame.addEventListener("load", done);
}

/* A bill of materials is a table, and it was a column of space-padded text in
   a modal <pre>. Same counts — generateBOM still does the counting — rendered
   as rows you can read, copy and export. */
function showAssemblyBOM() {
  if (E.docType !== "assembly" || !E.assembly) return;
  var rows = bomTableRows(generateBOM(E.assembly), E.assembly.components || []);
  var body = openEvalCard("bom", t("cmdAssembly"), t("billOfMaterials"));
  if (!body) return;
  if (!rows.length) { body.appendChild(el("div", "md-note", t("bomEmpty"))); return; }
  var withMaterial = rows.some(function (row) { return !!row.material; });
  var headers = [t("bomItem"), t("bomQty"), t("bomName"), t("material")];
  var table = el("table", "md-bom");
  var head = el("tr", "");
  headers.slice(0, withMaterial ? 4 : 3).forEach(function (caption) { head.appendChild(el("th", "", caption)); });
  var thead = el("thead", "");
  thead.appendChild(head);
  table.appendChild(thead);
  var tbody = el("tbody", "");
  rows.forEach(function (row) {
    var tr = el("tr", "");
    tr.appendChild(el("td", "md-bom-item", String(row.item)));
    tr.appendChild(el("td", "md-bom-qty", String(row.quantity)));
    var name = el("td", "");
    name.textContent = row.name;
    tr.appendChild(name);
    if (withMaterial) {
      var material = el("td", "");
      material.textContent = row.material;
      tr.appendChild(material);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
  var actions = evalCardActions();
  if (!actions) return;
  var csv = function () { return bomCsv(rows, headers, withMaterial); };
  actions.appendChild(btn('<i class="ph ph-copy"></i> ' + t("bomCopy"), function () {
    if (!navigator.clipboard || !navigator.clipboard.writeText) { flash(t("bomCopyFailed")); return; }
    navigator.clipboard.writeText(csv()).then(
      function () { flash(t("bomCopied")); },
      function () { flash(t("bomCopyFailed")); }
    );
  }));
  actions.appendChild(btn('<i class="ph ph-file-csv"></i> ' + t("bomCsvExport"), function () {
    downloadBytes(csv(), (E.assembly.name || "assembly") + "-bom.csv", "text/csv");
  }));
}

function importStepDocument() {
  if (E.docType !== "part") return;
  var input = document.createElement("input"); input.type = "file"; input.accept = ".step,.stp,model/step";
  input.addEventListener("change", async function () {
    var file = input.files && input.files[0]; if (!file) return;
    flash(t("kernelBusy"));
    try {
      var bytes=new Uint8Array(await file.arrayBuffer());
      var declaredUnit=detectStepLengthUnit(bytes);
      var unitOverride=(root.querySelector("#mdStepUnit") || {}).value || "auto";
      var unitScale=stepUnitCorrection(declaredUnit,unitOverride);
      var shape = await importStep(bytes, file.name);
      extractBrepTopology(shape, {ownerFeatureId:"feature:import:" + file.name.replace(/[^a-z0-9_-]+/gi,"_")});
      var meshData=await shapeToMeshData(shape,{deflection:.22,angle:.16});
      meshData.topology=cloneData(shape.topology || []);
      var imported=createImportedDefinition({
        name:file.name.replace(/\.(step|stp)$/i,""),sourceName:file.name,format:"step",size:file.size,importedAt:Date.now(),sourceUnit:unitOverride === "auto" ? declaredUnit : unitOverride,declaredUnit:declaredUnit,unitOverride:unitOverride,unitScale:unitScale,meshData:meshData,topology:shape.topology || [],
      });
      var canonicalShape=await transformBrep(shape,imported.metadata.import.sourceTransform);
      disposeBrep(shape); shape=null;
      extractBrepTopology(canonicalShape,{ownerFeatureId:imported.features[imported.features.length-1].id,expectedTopology:imported.parts[0].meshData && imported.parts[0].meshData.topology || []});
      if (imported.authoringMode === "direct-only") {
        var exactPayload=encodeBinaryPayload(await serializeBrep(canonicalShape,file.name.replace(/\.(step|stp)$/i,".brep")),{format:"brep",mediaType:"model/vnd.opencascade.brep"});
        imported.parts[0].sourcePayload=exactPayload;
        imported.parts[0].importSource=cloneData(imported.metadata.import);
        imported.features[0].params.sourcePayload=cloneData(exactPayload);
        imported.metadata.import.exactSource={format:"brep",byteLength:exactPayload.byteLength,checksum:exactPayload.checksum};
      }
      releaseExactRun();
      if (!activeParts(E.def).length) {
        imported.key=E.def.key; imported.id=E.def.id || E.def.definitionId || E.def.key; imported.definitionId=imported.id;
        imported.price=E.def.price || 0; E.def=imported;
      } else {
        var suffix=uid(),importedParts=cloneData(imported.parts || []);
        importedParts.forEach(function(importedPart){importedPart.id+="-"+suffix;importedPart.featureId+="-"+suffix;delete importedPart.parametricEnvelope;if(importedPart.meshData&&Array.isArray(importedPart.meshData.topology))importedPart.meshData.topology.forEach(function(entry){entry.ownerFeatureId=importedPart.featureId;entry.persistentId=importedPart.featureId+":"+entry.kind+":"+uid();});E.def.parts.push(importedPart);});
        E.def.sketches=(E.def.sketches || []).concat(cloneData(imported.sketches || []));
        E.def.metadata=E.def.metadata || {}; E.def.metadata.imports=(E.def.metadata.imports || []).concat([imported.metadata.import]);
        E.def.authoringMode=inferAuthoringMode(Object.assign({},E.def,{authoringMode:null}));
        normalizeDef(E.def); rebuildFeatureTreeFromDocument();
      }
      disposeBrep(canonicalShape); canonicalShape=null;
      E.brepRun=await regenerateFeatures(E.def);
      if (!E.brepRun.ok || !E.brepRun.finalShape) throw new Error(rebuildFailureMessage(E.brepRun.issues, "Imported exact body could not rebuild"));
      E.def.importedStep = cloneData(imported.metadata.import);
      E.sel=E.def.parts[E.def.parts.length-1]; E.ssel=[]; E.topologySelection=[];
      H.clear().seed(); partHistoryMarker.savedEdit=null; scheduleModelerDraft();
      syncHead(); refreshAll(); setMode("3d"); fitPreview();
      // Stamped after the history is reseeded, so the run matches the revision
      // the freshly imported document actually starts on.
      E.brepStamp = exactRunStamp();
      flash("✓ " + tf("stepImported", {
        file: file.name,
        recognition: imported.metadata.import.recognition === "none" ? t("stepDirectOnly") : tf("stepRecognized", {mode: imported.metadata.import.recognition}),
        units: unitOverride === "auto" ? tf("stepUnitsDeclared", {unit: declaredUnit}) : tf("stepUnitsOverride", {unit: unitOverride}),
      }));
    } catch (error) {
      if (shape) disposeBrep(shape);
      if (canonicalShape) disposeBrep(canonicalShape);
      flash(t("errStep") + ": " + String(error.message || error));
    }
  });
  input.click();
}

function refreshSavedPartMeshes(def) {
  var savedParts = [];
  (def.parts || []).forEach(function(savedPart){
    var livePart=(E.def.parts || []).find(function(part){return part.id===savedPart.id;});
    if(!livePart || !savedPart.meshData)return;
    var scheduled=exactBuildTimers.get(livePart);
    if(scheduled){clearTimeout(scheduled);exactBuildTimers.delete(livePart);}
    livePart.exactBuildToken=(livePart.exactBuildToken || 0)+1;
    livePart.meshData=cloneData(savedPart.meshData);
    if(isKernelBody(livePart))livePart.bounds=cloneData(savedPart.meshData.bounds);
    livePart.exactPending=false;livePart.exactError=null;
    clearTopologyCache(livePart);
    savedParts.push(livePart);
  });
  refreshChangedParts(savedParts);
}

async function saveModel() {
  if(E.contextEdit){
    const session=assemblySaveSession(E.assembly);
    if(!await finishContextPart())return;
    // The user's Save includes the finished edit. An earlier assembly write
    // must advance the baseline before this newer snapshot is submitted.
    const pending=documentSaveTasks.get(session);
    if(pending)await pending;
    if(E.docType==="assembly" && assemblySaveSession(E.assembly)===session)return saveCurrentDocument();
    reconcileModelerDraft();
    return;
  }
  /* Save validates its own snapshot with an authoritative exact rebuild below.
     A display restoration can remain pending after its worker has finished;
     waiting on that unrelated publication barrier prevented any library write,
     even though independent exact evaluation rebuilt the current history.
     Derived display caches are not authored inputs to this save. */
  ensureSketchDoc(E.def);
  if (!hasSaveableModelContent(E.def)) { flash(t("needParts")); return; }
  if (!standardsGate("Save")) return;
  /* Which document this save is FOR. Attachment externalization and the
     library write below are both awaited, and openModeler() is synchronous —
     a library card clicked in that window swaps E.def out from under the tail
     of this function. See the guard before markDocumentClean(). */
  var savingDoc = E.def, savingItem = E.srcItem, savingNode = currentHistoryNode();
  var savingGeneration = H.generation;
  var savingEdit = H.editRevision("part"), savingSession=partHistoryMarker;
  var expectedRecord=cloneData(libraryOpenBaseline);
  E.def.name = root.querySelector("#mdName").value || E.def.name;
  setDocumentDescription(E.def, root.querySelector("#mdDescription").value);
  E.def.price = +root.querySelector("#mdPrice").value || 0;
  // Canonical documents already own their feature history.  Reconstructing it
  // from render parts here would discard design intent; only legacy-adapter
  // documents pass through the compatibility projection.
  var recognizedHistory=E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition && E.def.metadata.import.recognition!=="none";
  var canonical=isCanonicalAuthoring();
  if (!canonical && !(E.def.metadata && E.def.metadata.adapter === "cabinet") && !recognizedHistory) rebuildFeatureTreeFromDocument();
  pruneAbandonedSketches(E.def);
  if(canonical)rebindReplacedSketchProfiles(E.def);
  var def = JSON.parse(JSON.stringify(E.def));
  pruneSketchTargetedBodyAppearances(def);
  pruneSketchMaterialFields(def);
  // Canonical sketches and face references own their coordinate system.
  // Recentring a rendered bounding box on save invalidates those references.
  if (!canonical) normalizeDef(def);
  if (def.metadata && def.metadata.adapter === "cabinet" && E.srcItem && E.srcItem.cab) def=finalizeCabinetAdvancedDefinition(def,E.srcItem);
  else if(!canonical && !recognizedHistory) rebuildFeatureTreeFromDocument(def);
  def.authoringMode=inferAuthoringMode(Object.assign({},def,{authoringMode:null}));
  def.definitionId = E.def.definitionId || E.def.id || def.key;
  def.id = def.definitionId;
  if(canonical){
    var saveCompiled=compileKernelFeatureTree(def),saveRun,saveGeometryReused=false;
    saveProgress("saveRebuilding",savingDoc);
    try{
      if(!saveCompiled.ok)throw new Error(saveCompiled.issues[0]?.message || "Invalid feature history");
      saveRun=exactSaveCache.get(savingDoc,saveCompiled);
      saveGeometryReused=!!saveRun;
      if(saveGeometryReused)saveProgress("saveReusingGeometry",savingDoc);
      saveRun=saveRun || await regenerateFeatures({...saveCompiled.document,features:saveCompiled.features},{restoreMode:'mesh',onProgress:function(progress){if(E.def===savingDoc)flash(t("saveRebuilding")+" · "+(progress.name || progress.stage));}});
      if(!saveRun.ok)throw new Error(saveRun.issues.find(function(issue){return issue.code==='regeneration-failed' || issue.severity==='error';})?.message || "The model could not rebuild");
      def.exactTopologyCache=captureExactTopology(def,saveCompiled.features,saveRun);
      var savedReferenceRepairs=applyDocumentTopologyRebindings(def,saveRun.topologyBindings);
      if(savedReferenceRepairs.length){
        saveGeometryReused=false;
        def.topologyBindings=(def.topologyBindings || []).concat(savedReferenceRepairs.map(function(entry){return Object.assign({savedAt:Date.now()},entry);}));
        releaseRegeneration(saveRun); saveRun=null;
        saveCompiled=compileKernelFeatureTree(def);
        if(!saveCompiled.ok)throw new Error(saveCompiled.issues[0]?.message || "Invalid repaired feature history");
        saveRun=await regenerateFeatures({...saveCompiled.document,features:saveCompiled.features},{restoreMode:'mesh'});
        if(!saveRun.ok)throw new Error(saveRun.issues.find(function(issue){return issue.severity==='error';})?.message || "Repaired model could not rebuild");
        def.exactTopologyCache=captureExactTopology(def,saveCompiled.features,saveRun);
      }
      // Save already owns a validated exact run. Preserve its display result
      // with the record instead of depending on a separate background restore,
      // which may have been cancelled while the user continued authoring.
      await publishExactBodies(activeParts(def),saveRun,def,async function(body){
        var mesh=body.verifiedSerializedExact===true ? cloneData(body.workerMeshData) : await shapeToMeshData(body,{deflection:.28,angle:.18});
        mesh.topology=cloneData(body.topology || []);
        mesh.bounds=meshDataBounds(mesh.positions);
        delete mesh.normals;delete mesh.colors;
        return mesh;
      });
      exactSaveCache.put(savingDoc,saveCompiled,saveRun);
    }catch(error){report(t("reportKickerSave"),t("saveRebuildFailed"),String(error.message || error));return;}
    finally{if(saveRun)releaseRegeneration(saveRun);}
  }
  var validation = canonical ? rebuildParametricDocument(def,modelParameterOverrides()) : rebuildDefinition(def, modelParameterOverrides());
  E.coreRun = validation;
  if (!validation.ok) {
    var failures = validation.issues.filter(function (issue) { return issue.severity === "error"; });
    report(t("reportKickerSave"), t("saveRebuildFailed"), failures.slice(0, 6).map(function (issue) { return "• " + (issue.message || issue.code); }));
    refreshParts();
    return;
  }
  var reboundAudit = canonical ? [] : applyTopologyRebindings(validation.topologyBindings);
  if (reboundAudit.length) {
    def.topologyBindings = (def.topologyBindings || []).concat(reboundAudit.map(function (entry) { return Object.assign({ savedAt: Date.now() }, entry); }));
    validation = canonical ? rebuildParametricDocument(def,modelParameterOverrides()) : rebuildDefinition(def, modelParameterOverrides());
    E.coreRun = validation;
  }
  saveProgress("saveAttachments",savingDoc);
  try { def=await externalizeAttachments(def); }
  catch (error) {
    report(t("reportKickerSave"), t("saveAttachmentFailed"), String(error.message || error));
    return;
  }
  var savedAsCopy=false;
  saveProgress("saveWritingLibrary",savingDoc);
  if (!await saveLib(def,{expected:expectedRecord})) {
    if (!lastLibrarySaveConflict) {
      report(t("reportKickerSave"), t("saveLibraryFailed"), lastLibrarySaveError ? String(lastLibrarySaveError.message || lastLibrarySaveError) : t("saveStorageFull"));
      return;
    }
    // A restored legacy draft may have no saved-record baseline. An edit in
    // another tab also leaves our baseline stale. In either case, preserve the
    // record already in the library and offer to save this live document under
    // a fresh key. The new-key write is itself optimistic (expected:null).
    if (E.def !== savingDoc || currentHistoryNode() !== savingNode) return;
    if (!await askModelerDecision(root, {
      title:t("saveLibraryConflictTitle"), message:t("saveLibraryConflictOffer"),
      accept:t("saveConflictCopyAction"), cancel:t("keepEditingAction"),
    })) return;
    var defaultCopyName=(def.name || t("newModel"))+" copy";
    var copyAnswer=await sheetForm(t("saveConflictCopyAction"),[{key:"name",label:t("name"),value:defaultCopyName}],t("saveCopyHint"));
    if (!copyAnswer || !copyAnswer.name) return;
    if (E.def !== savingDoc || currentHistoryNode() !== savingNode) return;
    var copy=forkConflictingModel(def,"cm_"+Date.now().toString(36)+"_"+uid(),copyAnswer.name);
    if (!await saveLib(copy,{expected:null})) {
      report(t("reportKickerSave"),t("saveLibraryFailed"),lastLibrarySaveError ? String(lastLibrarySaveError.message || lastLibrarySaveError) : t(lastLibrarySaveConflict ? "saveCopyKeyConflict" : "saveStorageFull"));
      return;
    }
    def=copy;
    savedAsCopy=true;
    // A placed instance still belongs to the original definition. This save
    // creates an independent library model and opens that copy in the editor.
    savingItem=null;
  }
  const sameSession=partHistoryMarker===savingSession;
  const residentPart=E.contextEdit?.previousDef || E.def;
  if(sameSession){
    if(savedAsCopy && residentPart===savingDoc && H.generation===savingGeneration && H.editRevision("part")===savingEdit){
      // A new library identity invalidates any restore queued for the original
      // record, even though this live object and its history node are unchanged.
      cancelExactModelRebuild();releaseExactRun();E.exactRestoring=false;
      residentPart.key=def.key;
      residentPart.id=def.id;
      residentPart.definitionId=def.definitionId;
      residentPart.name=def.name;
      E.srcItem=null;
      if(E.docType==="part" && !E.contextEdit)root.querySelector("#mdName").value=def.name;
    }
    if(residentPart?.key===def.key){
      set_libraryOpenBaseline(cloneData(def));
      savingSession.savedEdit=savingEdit;
    }
  }
  registerCustomModel(def);
  if (def.metadata && def.metadata.adapter === "cabinet" && savingItem) {
    savingItem.w = def.w; savingItem.d = def.d; savingItem.h = def.h;
    savingItem.cab = cloneDomain(def.metadata.cabSpec);
    savingItem.parameterOverrides = Object.assign({}, savingItem.parameterOverrides, { width: def.w, depth: def.d, height: def.h });
  }
  var committed = commitDefinition(S, def);
  if (savingItem || committed.affected.length) markPlannerDirty();
  refreshCatalogSelect();
  refreshLib();
  var sel = document.getElementById("furnsel");
  if (sel) sel.value = def.key;
  // Every linked instance sees the new shared definition. Cabinet instances
  // keep their semantic spec, interactions and dynamic BOM/pricing adapter.
  committed.affected.forEach(function (item) {
    if (def.metadata && def.metadata.adapter === "cabinet") {
      var open = item.cab && item.cab.open || 0;
      item.cab = cloneDomain(def.metadata.cabSpec); item.cab.open = open;
    }
    item.type = def.key;
    item.w = item.parameterOverrides && fin(item.parameterOverrides.width) ? item.parameterOverrides.width : def.w;
    item.d = item.parameterOverrides && fin(item.parameterOverrides.depth) ? item.parameterOverrides.depth : def.d;
    item.h = item.parameterOverrides && fin(item.parameterOverrides.height) ? item.parameterOverrides.height : def.h;
  });
  if (savingItem && committed.affected.indexOf(savingItem) === -1 && S.items.indexOf(savingItem) !== -1) {
    savingItem.definitionId = def.id;
    savingItem.type = def.key;
  }
  render2D();
  S.dirty3D = true; // placed instances of an edited model rebuild with new geometry
  import("../ui_props.js").then(function (ui) { ui.fillProps(); });
  /* Everything above is about the document that was written and holds however
     long the awaits took. Everything below is editor state, and the editor may
     have moved on: marking clean and discarding the recovery draft would then
     be done to a document nobody saved, throwing away its only backup. The
     history node is part of the check because an edit made DURING the save is
     genuinely not in the bytes that were written. */
  if (E.def !== savingDoc || E.srcItem !== savingItem || currentHistoryNode() !== savingNode ||
      H.generation !== savingGeneration || H.editRevision("part") !== savingEdit || E.docType !== "part") {
    if(sameSession)reconcileModelerDraft();
    flash("✓ " + tf("savedNamed", { name: def.name || def.key }));
    return;
  }
  /* Save runs its own authoritative rebuild. Publish that same result back to
     the open document before declaring it clean, otherwise the status footer
     can say success while the tree keeps red diagnostics from an earlier
     failed Force Rebuild. */
  if(canonical){
    E.exactDiagnosticRun=null;
    // The first pass repaired references on the saved clone; mirror those
    // accepted references into the still-open document after the write.
    if(savedReferenceRepairs?.length){
      E.def.features=cloneDomain(def.features);
      E.def.sketches=cloneDomain(def.sketches);
      E.def.topologyBindings=cloneDomain(def.topologyBindings);
    }
    E.def.exactTopologyCache=cloneDomain(def.exactTopologyCache);
    // This guard above also covers edits made during Save. Cancel stale mesh
    // publications before showing the exact geometry that was actually saved.
    refreshSavedPartMeshes(def);
  }
  publishRebuildStatus(E.def,E.coreRun);
  refreshModelHistoryPane();
  refreshParts();
  syncCoach();
  var savedButton=root && root.querySelector("#mdSave");
  if(savedButton && canonical)savedButton.dataset.exactSaveValidation=saveGeometryReused?"reused":"rebuilt";
  flash("✓ " + t("saved") + (canonical ? " · " + t(saveGeometryReused ? "saveGeometryReused" : "saveGeometryValidated") : ""));
  markDocumentClean();
  reconcileModelerDraft();
  if (savingDoc.lastStandardsAudit && !savingDoc.lastStandardsAudit.ok) {
    report(t("reportKickerStandards"), "Draft saved · qualification incomplete",
      ["The editable draft is saved. Its standards audit has not passed; qualified manufacturing exports remain blocked."]
        .concat(savingDoc.lastStandardsAudit.blocking.map(function (i) { return "• " + (i.partName || i.partId) + ": " + i.message; })));
  }
}

export {
  assemblyDrawingBOMRows, assemblyDrawingBalloonTargets, exportDrawingSvg,
  exportThreeMfDocument, forceRebuildDocument, importStepDocument,
  openExplodedPlayback, openImportedBundle, openMotionPlayback,
  printDrawingSheet, saveModel, showAssemblyBOM, showAssemblyDrawingSettings,
  showMassProperties,
};

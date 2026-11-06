/* The CAD editor's feature creation: holes, helices, threads, knurls, toolbox
   fasteners, revolves and cut/merge targets, split out of js/modeler.js. It
   shares the editor's state through live imports from ../modeler.js. */
import { insertBody } from "../cad_appearances.js";
import { captureConfiguration, circularSweepTableRows, ensureConfigurations, setActiveConfiguration, setCircularSweepDesignTable, updateConfiguration } from "../cad_configurations.js";
import { resolveSketchProfile } from "../cad_feature_tree.js";
import { circularHelixSweepProfile, helixSweepPath, sweepUsesHelixPath } from "../cad_helix.js";
import { holeCallout, holeWizardSolids, holeWizardThread } from "../cad_hole_wizard.js";
import { knurlBandMesh, knurlCallout, normalizeKnurlSpec, validateKnurl } from "../cad_knurl.js";
import { createHelix } from "../cad_reference_geometry.js";
import { cosmeticThread, modeledThreadSolid, normalizeThreadSpec, threadCallout, validateThreadFeature } from "../cad_thread.js";
import { PVC_D1785, TOOLBOX_CATEGORY_LABELS, lengthOptionsForSize, listToolboxLibrary, reducingBranchRows, searchToolbox, toolboxFamily } from "../cad_toolbox.js";
import { cancelCadWorkerWork } from "../core/cad_worker_client.js";
import { cylindricalHolePlacement, cylindricalHoleSource } from "../core/cylindrical_hole_placement.js";
import { aabbFromBox, isUpToFace, resolveExtrudeExtent } from "../core/extrude_extent.js";
import { featureDefaults } from "../core/feature_catalog.js";
import { canonicalFeatureTopologyReferences } from "../core/feature_input_stage.js";
import { holeCutRecords, holePositionPointIds, holeToolPlacements } from "../core/hole_geometry.js";
import { createHoleWizardSketchPair } from "../core/hole_wizard_sketches.js";
import { isKernelBody, meshDataBounds } from "../core/kernel_body.js";
import { createFeatureDefinition, historyEntryRolled, reconnectLaterBodyConsumers, recordSketchInHistory, removeHistoryNode } from "../core/parametric_document.js";
import { leavesInputStanding } from "../core/rebuild.js";
import { assertSketchAxisProfile, axisMeridian, isSketchAxis, revolvePreviewAxis, sketchAxisReference } from "../core/revolve_geometry.js";
import { helixFromSketch } from "../core/sketch_helix.js";
import { circularSweepProfile, loftSectionSourceRecord, loftSourceRecord, resolveSketchSources as resolveSweptSources, sampleSketchPath, sketchPathSegments, sketchWorldPoint, sweepSourceRecord } from "../core/swept_sources.js";
import { threadPlacementFromCircularEdge } from "../core/thread_circular_start.js";
import { threadPlacementFromFace } from "../core/thread_placement.js";
import { featureField as featureFieldCore } from "../modeler_feature_form.js";
import { cloneData, kernelRecipeBounds, partBounds, partSupportsExactMesh } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { refreshParts } from "../modeler/component_mates.js";
import { openDesignTable } from "../modeler/design_table.js";
import { closedSketchProfile, extrusionSketchAreas, flash, sheetForm, showPickList } from "../modeler/drawing_sheet.js";
import { el } from "../modeler/editor_dom.js";
import { scheduleExactRestore } from "../modeler/export_measure.js";
import { refreshModelHistoryPane } from "../modeler/feature_tree.js";
import { authoritativeFinishTopology } from "../modeler/finish_preview.js";
import { activeParts, addPart, featureTypeLabel, topologyEntriesForPart } from "../modeler/library_store.js";
import { featureReferenceOptions, selectedSolid } from "../modeler/part_commands.js";
import { addSketchCircle, resolveSketch, selEntities, syncSketchDrivenParts } from "../modeler/sketch_entities.js";
import { attachSketchToSelectedFace, isCanonicalAuthoring, modelLengthUnit } from "../modeler/sketch_workflow.js";
import { analyzeSketchChains, analyzeSketchProfiles } from "../sketch_profiles.js";
import { ensureSketch, resolveProfilePoints, sketchPoint } from "../sketch_solver.js";
import { uid } from "../state.js";
import {
  E, H, addKernelBodyPart, exactDisplayBody, insertToolboxFastener,
  invalidatePartMeshAfterEdit, lastToolboxPick, planeAxis, pushUndo,
  queueExactMesh, refreshAll, scheduleKernelBody, scheduleModelerDraft,
  solveAssembly,
} from "../modeler.js";

function featureField(host,field,value) {
  return featureFieldCore(host,field,value,{
    el:el,
    units:{length:modelLengthUnit(),angle:E.def?.context?.units?.angle || "deg"},
    referenceOptions:featureReferenceOptions,
  });
}

function setFeatureReferencesFromForm(feature,referenceValues) {
  if(referenceValues.axis && ["revolve","revolveCut"].includes(feature.type))
    feature.params.axis=revolvePreviewAxis(feature.params,referenceValues);
  feature.references ||= {};feature.references.references ||= [];
  var retained=feature.references.references.filter(function(reference){var id=typeof reference==="string"?reference:reference && reference.id;return !(String(id||"").indexOf("axis:")===0&&referenceValues.axis)&&!(String(id||"").indexOf("plane:")===0&&referenceValues.plane);});
  if(referenceValues.axis)retained.push(referenceValues.axis);if(referenceValues.plane)retained.push(referenceValues.plane);feature.references.references=retained;
}

function selectedFeatureIds() {
  var selected=(E.authoring.featureSelection || []).slice();
  // Explicit history nodes are the complete requested inputs. Adding a
  // selected body's original boss duplicated it after its finished head.
  var part=selectedSolid();
  if(!selected.length && part){var head=cutTargetFeatureId(part) || part.featureId;if(head)selected.push(head);}
  return selected;
}

function selectedSketchIds() {
  var loftSections=activeLoftCreation()?.loftSectionIds;
  if(loftSections)return loftSections.slice();
  var selected=(E.authoring.sketchSelection || []).filter(function(id){return (E.def.sketches || []).some(function(sketch){return sketch.id===id;});});
  var active=ensureSketch(E.def);if(active&&!selected.includes(active.id))selected.push(active.id);return selected;
}

function activeLoftCreation() {
  const authoring=E.authoring, state=authoring?.featurePreviewState;
  return authoring?.phase==="model" && authoring.featureType==="loft" && !authoring.featureEdit &&
    state?.type==="loft" && state.setLoftSections ? state : null;
}

// every helix a sweep can follow, once each
function documentHelixRecords() {
  var all=(E.def.referenceGeometry || []).concat(E.def.references || []),seen=new Set(),records=[];
  all.forEach(function(item){
    if(!item || seen.has(item.id))return;
    var helical=item.type==="reference_helix" || item.type==="helix" || /helix/i.test(String(item.id || ""));
    if(helical){seen.add(item.id);records.push(item);}
  });
  return records;
}

/* A sweep edited to follow another helix: its rebuild reads sketchSources, its
   ordering reads references, and the part's merge carries its own copy — all
   three move to the chosen helix, or the Path row would change nothing. */
function retargetSweepHelix(feature) {
  var params=feature && (feature.type==="sweep" || feature.type==="sweepCut") ? feature.params || {} : null,sources=params && params.sketchSources;
  if(!params || !params.helixId || !sources || !sources.helixId || sources.helixId===params.helixId)return;
  var helix=documentHelixRecords().find(function(record){return record.id===params.helixId;});
  if(!helix)return;
  var previous=sources.helixId,moved=function(value){return {...value,helixId:helix.id,helixFeatureId:helix.featureId};};
  params.sketchSources=moved(sources);
  feature.references ||= {};
  if(feature.type==="sweepCut" && helix.featureId){
    feature.references.features=(feature.references.features || []).filter(function(id){return id!==sources.helixFeatureId;});
    if(!feature.references.features.includes(helix.featureId))feature.references.features.push(helix.featureId);
  }
  feature.references.references=(feature.references.references || []).map(function(reference){var id=typeof reference==="string"?reference:reference && reference.id;return id===previous?helix.id:reference;});
  (E.def.parts || []).forEach(function(part){(part.merges3d || []).concat(part.cuts3d || []).forEach(function(entry){if(entry.featureId===feature.id && entry.sketchSources)entry.sketchSources=moved(entry.sketchSources);});});
}

function sweepHelixRecord(inputParams) {
  inputParams=inputParams || {};
  var id=inputParams.helixId,records=documentHelixRecords();
  if(id){var selected=records.find(function(item){return item.id===id;});if(selected)return selected;}
  if(records.length===1)return records[0];
  var feature=(E.def.features || []).find(function(item){return item && (item.type==="helix" || /helix|threadpath/i.test(String(item.name || ""))) && (!id || item.id===id);});
  if(feature){
    try{return {...helixFromSketch(E.def,feature.params || {}),id:feature.id,type:"reference_helix",featureId:feature.id};}
    catch(error){var raw=feature.params || {};if(Number(raw.radius)>0 && (Number(raw.pitch)>0 || Number(raw.height)>0))return {...raw,id:feature.id,type:"reference_helix",featureId:feature.id};}
  }
  return null;
}

function createMultiSketchFeature(type, values, ids=selectedSketchIds()) {
  var inputParams=(values && values.params) || values || {};
  // the form's Path row said "second selected sketch": no helix, whatever exists
  var sketchPath=type==="sweep" && inputParams.helixId==="";
  if(type==="sweepCut")sketchPath=inputParams.helixId==="";
  var helix=sketchPath?null:type==="sweep"?sweepHelixRecord(inputParams):selectedHelixRecord();
  if(type==="sweepCut" && !sketchPath)helix=sweepHelixRecord(inputParams);
  if(type==="sweepCut" && inputParams.helixId && helix?.id!==inputParams.helixId)helix=null;
  if(type==="sweepCut" && !sketchPath && inputParams.helixId && !helix){flash(t("sweepNeed"));return false;}
  if(type==="sweepCut" && !sketchPath && helix && ids.length===1)return createHelixSweepCut(helix,inputParams,ids[0]);
  /* The confirmation corner can clear the transient datum focus while it
     reads the form. Keep the SolidWorks-style one-sketch sweep bound to the
     helix captured when the command opened, then resolve that stable id from
     the document at commit time. */
  if(type==="sweep" && !sketchPath && !helix && inputParams.helixId){
    helix=(E.def.referenceGeometry || []).concat(E.def.references || []).find(function(item){return item && item.id===inputParams.helixId;}) || null;
    if(!helix){
      var helixFeature=(E.def.features || []).find(function(item){return item && item.id===inputParams.helixId && item.type==="helix";});
      if(helixFeature){var hparams=helixFeature.params || {};try{helix={...helixFromSketch(E.def,hparams),id:helixFeature.id,type:"reference_helix",featureId:helixFeature.id};}catch(error){helix={...hparams,id:helixFeature.id,type:"reference_helix",featureId:helixFeature.id};}}
    }
  }
  if(type==="sweep" && !sketchPath && ids.length===1 && !helix){
    var fallbackFeature=(E.def.features || []).find(function(item){return item && (item.type==="helix" || /helix|threadpath/i.test(String(item.name||"")));});
    if(fallbackFeature){var fp=fallbackFeature.params || {};helix={...fp,id:fallbackFeature.id,type:"reference_helix",featureId:fallbackFeature.id};}
  }
  if(type==="sweep" && !sketchPath && inputParams.sweepPathMode==="helix" && !helix){flash(t("sweepNeed"));return false;}
  if(type==='sweep' && !sketchPath && helix && inputParams.profileMode==='circular'){
    var circularParams={...featureDefaults(type),...inputParams},circularSources={kind:'circular-helix-sweep',diameter:circularParams.profileDiameter,helixId:helix.id,helixFeatureId:helix.featureId};
    var circularUndoPushed=false;
    try{
      Object.assign(circularParams,circularHelixSweepProfile(helix,circularParams.profileDiameter));circularParams.sketchSources=circularSources;
      pushUndo('Circular helix sweep');
      circularUndoPushed=true;
      var circularFeature=createFeatureDefinition(E.def,type,{inputs:[],references:{sketches:[],features:helix.featureId?[helix.featureId]:[],topology:[],references:[helix.id]},params:circularParams});
      var circularHost=mergeTargetBody(kernelRecipeBounds(type,circularParams),circularParams);
      if(circularHost){
        var circularParentId=cutTargetFeatureId(circularHost);
        circularFeature.inputs=[circularParentId];
        circularFeature.references.features=[circularParentId,...(helix.featureId?[helix.featureId]:[])];
        reconnectLaterBodyConsumers(E.def,circularFeature);
        circularHost.merges3d=circularHost.merges3d || [];
        circularHost.merges3d.push({kind:"sweep",profile:cloneData(circularParams.profile),path:cloneData(circularParams.path),pathSegments:cloneData(circularParams.pathSegments),profileSegments:cloneData(circularParams.profileSegments),orientation:circularParams.orientation,twistAngle:circularParams.twistAngle,scale:circularParams.scale,sketchSources:circularSources,featureId:circularFeature.id});
        invalidatePartMeshAfterEdit(circularHost);
        E.sel=circularHost;queueExactMesh(circularHost);
      }else E.sel=addKernelBodyPart(circularFeature,type,circularParams,circularSources) || E.sel;
      refreshAll();return true;
    }catch(error){if(circularUndoPushed)H.discard();flash(String(error.message || error));return false;}
  }
  if(type==="sweep" && !sketchPath && (inputParams.sweepPathMode==="helix" || sweepUsesHelixPath(ids.length, helix))){
    var profileSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===ids[0];});
    var profileRun=analyzeSketchProfiles(profileSketch),profileLoop=profileRun.profiles[0];
    if(!profileLoop){flash(t("sweepNeed"));return false;}
    var params={...featureDefaults(type),...((values && values.params) || values || {})};
    params.profile=profileLoop.points.map(function(point){return sketchWorldPoint(profileSketch,point.u,point.v);});
    Object.assign(params,helixSweepPath(helix));
    var helixSources={kind:"sweep",profile:{sketchId:profileSketch.id,entityIds:(profileLoop.entityIds || []).slice()},helixId:helix.id,helixFeatureId:helix.featureId};
    params.sketchSources=cloneData(helixSources);
    params.helix={origin:helix.origin,axis:helix.axis,radius:helix.radius,radiusEnd:helix.radiusEnd,pitch:helix.pitch,turns:helix.turns,height:helix.height,handedness:helix.handedness,startAngle:helix.startAngle,...(helix.pitchMode==='variable'?{pitchMode:helix.pitchMode,pitchRegions:cloneData(helix.pitchRegions)}:{})};
    pushUndo(t("createFeature")+" "+featureTypeLabel(type));
    var helixFeature=null;
    try{helixFeature=createFeatureDefinition(E.def,type,{references:{sketches:[profileSketch.id],features:[],topology:[],references:[helix.id]},params:params});}
    catch(error){H.discard();flash(String(error.message||error));return false;}
    var helixHost=mergeTargetBody(kernelRecipeBounds(type,params),params);
    if(helixHost){
      var parentId=cutTargetFeatureId(helixHost);helixFeature.inputs=[parentId];helixFeature.references.features=[parentId];reconnectLaterBodyConsumers(E.def,helixFeature);
      helixHost.merges3d=helixHost.merges3d || [];
      helixHost.merges3d.push({kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:helixSources,featureId:helixFeature && helixFeature.id || undefined});
      invalidatePartMeshAfterEdit(helixHost);
      E.sel=helixHost;queueExactMesh(helixHost);
    } else E.sel=addKernelBodyPart(helixFeature,type,params,helixSources) || E.sel;
    refreshAll();return true;
  }
  if(type==="sweep" && inputParams.profileMode==="circular"){
    var params={...featureDefaults(type),...(values?.params || values)},pathSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===ids[0];});
    if(!pathSketch){flash("Select a path sketch");return false;}
    var sources={kind:"circular-sweep",diameter:params.profileDiameter,path:{sketchId:pathSketch.id,entityIds:pathSketch.entities.filter(function(e){return !e.construction;}).map(function(e){return e.id;})}};
    try{Object.assign(params,circularSweepProfile(pathSketch,params.profileDiameter,sources.path.entityIds));}catch(error){flash(String(error.message || error));return false;}
    params.sketchSources=sources;pushUndo("Circular sweep");
    try{var feature=createFeatureDefinition(E.def,type,{inputs:[],references:{sketches:[pathSketch.id],features:[],topology:[],references:[]},params:params});E.sel=addKernelBodyPart(feature,type,params,sources) || E.sel;refreshAll();return true;}
    catch(error){H.discard();flash(String(error.message || error));return false;}
  }
  var required=type==="loft"?2:2;
  if(ids.length<required){flash(featureTypeLabel(type)+" "+t("featureNeedsSketches"));return false;}
  var refs=ids.slice(0,type==="sweep"||type==="sweepCut"?2:ids.length),params={...featureDefaults(type),...((values && values.params) || values || {})},sources=null;
  if(type==="sweep"||type==="sweepCut"){
    var profile=(E.def.sketches || []).find(function(sketch){return sketch.id===refs[0];}),path=(E.def.sketches || []).find(function(sketch){return sketch.id===refs[1];});
    var profileRun=analyzeSketchProfiles(profile),profileLoop=profileRun.profiles[0];
    var sampledPath=sampleSketchPath(path);
    if(!profileLoop||!sampledPath){flash(t("sweepNeed"));return false;}
    params.profile=profileLoop.points.map(function(point){return sketchWorldPoint(profile,point.u,point.v);});params.path=sampledPath;params.pathSegments=sketchPathSegments(path);params.profileSegments=sketchPathSegments(profile,profileLoop.entityIds);
    sources=sweepSourceRecord(profile,profileLoop.entityIds,path);params.sketchSources=cloneData(sources);
  } else {
    var sectionSketches=refs.map(function(id){return (E.def.sketches || []).find(function(item){return item.id===id;});});
    var sectionSources=sectionSketches.map(function(sketch,index){var loop=sketch?analyzeSketchProfiles(sketch).profiles[0]:null;return loftSectionSourceRecord(sketch,loop && loop.entityIds || [],index===0 || index===sectionSketches.length-1);});
    if(sectionSources.some(function(section){return !section;})){flash(t("loftNeed"));return false;}
    sources=loftSourceRecord(sectionSketches,sectionSources);
    var resolvedLoft=resolveSweptSources(E.def,sources,resolveProfilePoints);
    if(!resolvedLoft){flash(t("loftNeed"));return false;}
    Object.assign(params,resolvedLoft);params.sketchSources=cloneData(sources);
  }
  /* Sweep Cut removes the very solid Sweep would have added: same two sketches,
     same params record, and the tool lands on the target's cut list instead of
     on the document as a body. */
  var cutTarget=null,cutTargetId=null;
  if(type==="sweepCut" || type==="loft" && params.operation==="subtract"){
    if(type==="loft" && params.solid===false){flash(t("loftCutSolid"));return false;}
    cutTarget=type==="loft" ? (selectedSolid() || (activeParts(E.def).length===1 ? activeParts(E.def)[0] : null)) : cutTargetBody();
    if(!cutTarget){flash(t("extrudeCutNeed"));return false;}
    if(!partSupportsExactMesh(cutTarget)){flash(t("cutNeedExactBody"));return false;}
    cutTargetId=cutTargetFeatureId(cutTarget);
    if(!cutTargetId){flash(t("extrudeCutNeed"));return false;}
  }
  pushUndo(t("createFeature")+" "+featureTypeLabel(type));
  var created=null;
  try{created=createFeatureDefinition(E.def,type,{inputs:cutTargetId?[cutTargetId]:[],references:{sketches:refs,features:cutTargetId?[cutTargetId]:[],topology:[],references:[]},params:params});}
  catch(error){H.discard();flash(String(error.message||error));return false;}
  /* The whole point of the kernel-body kind. Before it, this branch created a
     feature row, an exact BREP run that only STEP export could see, and NO
     visible geometry — sweep and loft added a step and drew nothing. */
  var mergeHost=cutTarget?null:mergeTargetBody(kernelRecipeBounds(type,params),params);
  if(mergeHost){
    var mergeParent=cutTargetFeatureId(mergeHost);created.inputs=[mergeParent];created.references.features=[mergeParent];reconnectLaterBodyConsumers(E.def,created);
    mergeHost.merges3d=mergeHost.merges3d || [];
    mergeHost.merges3d.push(type==="loft"
      ? {kind:"loft",sections:cloneData(params.sections),sectionSegments:cloneData(params.sectionSegments),solid:params.solid!==false,ruled:!!params.ruled,matchProfiles:params.matchProfiles!==false,continuity:params.continuity,tolerance:params.tolerance,sketchSources:sources,featureId:created && created.id || undefined}
      : {kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:sources,featureId:created && created.id || undefined});
    invalidatePartMeshAfterEdit(mergeHost);
    E.sel=mergeHost;queueExactMesh(mergeHost);refreshAll();return true;
  }
  if(!cutTarget)E.sel=addKernelBodyPart(created,type,params,sources) || E.sel;
  if(cutTarget){
    cutTarget.cuts3d=cutTarget.cuts3d || [];
    cutTarget.cuts3d.push(type==="loft" ? {kind:"loft",sections:cloneData(params.sections),sectionSegments:cloneData(params.sectionSegments),solid:true,ruled:!!params.ruled,matchProfiles:params.matchProfiles!==false,continuity:params.continuity,tolerance:params.tolerance,sketchSources:sources,featureId:created.id} : {kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:sources,featureId:created && created.id || undefined});
    invalidatePartMeshAfterEdit(cutTarget);
    E.sel=cutTarget;queueExactMesh(cutTarget);
  }
  refreshAll();return true;
}

function createHelixSweepCut(helix,inputParams,sketchId) {
  var target=cutTargetBody(),targetId=target && cutTargetFeatureId(target);
  if(!target || !targetId){flash(t("extrudeCutNeed"));return false;}
  if(!partSupportsExactMesh(target)){flash(t("cutNeedExactBody"));return false;}
  var profileSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===sketchId;});
  var profileRun=analyzeSketchProfiles(profileSketch),profileLoop=profileRun.profiles[0];
  if(!profileLoop){flash(t("sweepNeed"));return false;}
  var params={...featureDefaults("sweepCut"),...inputParams},sources={kind:"sweep",profile:{sketchId:sketchId,entityIds:(profileLoop.entityIds || []).slice()},helixId:helix.id,helixFeatureId:helix.featureId};
  params.profile=profileLoop.points.map(function(point){return sketchWorldPoint(profileSketch,point.u,point.v);});
  Object.assign(params,helixSweepPath(helix));
  params.sketchSources=sources;params.helixId=helix.id;params.sweepPathMode="helix";
  params.helix={origin:helix.origin,axis:helix.axis,radius:helix.radius,radiusEnd:helix.radiusEnd,pitch:helix.pitch,turns:helix.turns,height:helix.height,handedness:helix.handedness,startAngle:helix.startAngle,...(helix.pitchMode==='variable'?{pitchMode:helix.pitchMode,pitchRegions:cloneData(helix.pitchRegions)}:{})};
  pushUndo(t("createFeature")+" "+featureTypeLabel("sweepCut"));
  try{
    var feature=createFeatureDefinition(E.def,"sweepCut",{inputs:[targetId],references:{sketches:[sketchId],features:[targetId,...(helix.featureId?[helix.featureId]:[])],topology:[],references:[helix.id]},params:params});
    target.cuts3d=target.cuts3d || [];
    target.cuts3d.push({kind:"sweep",profile:cloneData(params.profile),path:cloneData(params.path),pathSegments:cloneData(params.pathSegments),profileSegments:cloneData(params.profileSegments),orientation:params.orientation,twistAngle:params.twistAngle,scale:params.scale,sketchSources:sources,featureId:feature.id});
    invalidatePartMeshAfterEdit(target);E.sel=target;queueExactMesh(target);refreshAll();return true;
  }catch(error){H.discard();flash(String(error.message || error));return false;}
}

function selectedHelixRecord() {
  var id=E.selectedReferenceId;
  var records=[];var seen=new Set();
  (E.def && E.def.referenceGeometry || []).concat(E.def && E.def.references || []).forEach(function(item){
    var looksHelical=item && ((item.type==="reference_helix" || item.type==="helix") || /helix/i.test(String(item.id||"")) || (item.pitch!=null && item.turns!=null && item.radius!=null && item.axis));
    if(looksHelical && !seen.has(item.id)){seen.add(item.id);records.push(item);}
  });
  if(id){var selected=records.find(function(item){return item.id===id;});if(selected)return selected;}
  /* A single helix is an unambiguous path for the SolidWorks-style
     one-sketch sweep. The tree can clear datum focus when the profile is
     added with a modifier key, so retain the workflow instead of falling
     back to the two-sketch requirement. */
  if(records.length===1)return records[0];
  if(!records.length){
    var feature=(E.def && E.def.features || []).find(function(item){return item && item.type==="helix";});
    if(feature){
      try{return {...helixFromSketch(E.def,feature.params || {}),id:feature.id,type:"reference_helix",featureId:feature.id};}
      catch(error){
        var raw=feature.params || {};
        if(Number(raw.radius)>0 && (Number(raw.pitch)>0 || Number(raw.height)>0))return {...raw,id:feature.id,type:"reference_helix",featureId:feature.id};
      }
    }
  }
  return null;
}

async function createHoleFeature(options) {
  if(E._holeBuildPending)return false;
  var params={...featureDefaults("hole"),...(options || {}),displayUnit:modelLengthUnit()};
  var target=selectedSolid() || (E.def && activeParts(E.def)[activeParts(E.def).length-1]);
  if(!target){flash(t("cmdNeedSolid"));return false;}
  var face=(E.topologySelection || []).find(function(reference){return reference.kind==="face";});
  var radialSource=params.cylindricalSource || cylindricalHoleSource(E.def,face);
  if(radialSource){
    params.cylindricalSource=radialSource;params.layout='sketch';
    try{cylindricalHolePlacement(params,E.def);}catch(error){flash(String(error.message || error));return false;}
  }
  if(face && face.descriptor && face.descriptor.surface && face.descriptor.surface!=="plane" && !radialSource){flash(t("needPlanarFace"));return false;}
  var holeSketchPair=null;
  if(params.separateHoleSketches){
    if(!isCanonicalAuthoring() || !radialSource || params.cylinderPlacementMethod!=='constraints' || params.holeType!=='counterbore'){
      flash('Separate hole sketches require a constrained cylindrical counterbore in a parametric part');return false;
    }
    try{holeSketchPair=createHoleWizardSketchPair(params,E.def,{positionId:uid('sk'),profileId:uid('sk')});params=holeSketchPair.params;}
    catch(error){flash(String(error.message || error));return false;}
  }
  var holeCreationSnapshot=holeSketchPair?cloneData(E.def):null;
  function restoreHoleSketchCreation(){
    if(!holeCreationSnapshot)return;
    Object.keys(E.def).forEach(function(key){delete E.def[key];});Object.assign(E.def,cloneData(holeCreationSnapshot));
  }
  var profile=closedSketchProfile();
  if(!profile && !face && !holePositionPointIds(ensureSketch(E.def)).length){flash(t("holeNeed"));return false;}
  if(face && !radialSource && !attachSketchToSelectedFace()){flash(t("needPlanarFace"));return false;}
  var wizard=holeWizardSolids(params);
  var diameter=Math.max(.1, Number(wizard.hole.diameter)||Number(params.diameter)||1);
  profile=closedSketchProfile();
  if(!params.layout || params.layout==="sketch"){
    var positionIds=holePositionPointIds(ensureSketch(E.def));
    if(positionIds.length){params.holePositionPointIds=positionIds;profile={entityIds:[]};}
  }
  if(radialSource){profile={entityIds:[]};}
  if(!profile){
    pushUndo(t("holeWizard"));
    var placementCircle=addSketchCircle({u:0,v:0},{u:Math.max(.25,diameter/2),v:0});
    if(!placementCircle){H.discard();flash(t("holeNeed"));return false;}
    placementCircle.fixed=true;
    sketchPoint(ensureSketch(E.def),placementCircle.c).fixed=true;
    resolveSketch(false);
    profile=closedSketchProfile();
    if(!profile){H.discard();flash(t("holeNeed"));return false;}
  } else {
    pushUndo(t("holeWizard"));
  }
  var sketch=ensureSketch(E.def);
  if(holeSketchPair){
    E.def.sketches.push(holeSketchPair.position,holeSketchPair.profile);
    recordSketchInHistory(E.def,holeSketchPair.position);
    recordSketchInHistory(E.def,holeSketchPair.profile);
    sketch=holeSketchPair.profile;
  }
  var targetFeatureId=cutTargetFeatureId(target);
  var topology=face ? [cloneData(face)] : [];
  recordSketchInHistory(E.def,sketch);
  var feature=null;
  var callout=holeCallout(params);
  if(isCanonicalAuthoring()){
    try{
      feature=createFeatureDefinition(E.def,"hole",{
        inputs:targetFeatureId ? [targetFeatureId] : [],
        references:{sketches:holeSketchPair?[holeSketchPair.position.id,holeSketchPair.profile.id]:radialSource?[]:[sketch.id],features:targetFeatureId ? [targetFeatureId] : [],topology:topology,references:[],profileEntityIds:profile.entityIds},
        params:{...params,depth:wizard.hole.depth,diameter:diameter,profileEntityIds:profile.entityIds,sketchId:sketch.id,operation:"subtract",callout:callout},
      });
    }catch(error){restoreHoleSketchCreation();H.discard();flash(String(error.message||error));return false;}
  }
  var candidate=cloneData(target),records,verified=null,thread=null,documentAtStart=E.def;
  var historyAtStart=H.tree().find(function(node){return node.current;})?.i;
  E._holeBuildPending=true;
  try {
    records=holeCutRecords(params,sketch,profile.entityIds,E.def);
    records.forEach(function(record){record.featureId=feature && feature.id;});
    if(wizard.hole.holeType.startsWith("tap")){
      var bounds=partBounds(target),threadPlacement=holeToolPlacements(records[0].params,{min:{x:bounds.x0,y:bounds.y0,z:bounds.z0},max:{x:bounds.x1,y:bounds.y1,z:bounds.z1}})[0];
      thread=holeWizardThread(params,{origin:threadPlacement.origin,axis:threadPlacement.axis,bounds});
    }
    candidate.cuts3d=(candidate.cuts3d || []).concat(records);
    verified=await exactDisplayBody(candidate);
    if(E.def!==documentAtStart || !E.def.parts.includes(target) || H.tree().find(function(node){return node.current;})?.i!==historyAtStart)throw new Error("The document changed while the hole was being checked; apply it again");
    target.cuts3d=candidate.cuts3d;
    invalidatePartMeshAfterEdit(target);
    scheduleModelerDraft();
  } catch(error) {
    if(E.def===documentAtStart && H.tree().find(function(node){return node.current;})?.i===historyAtStart){if(holeSketchPair)restoreHoleSketchCreation();else if(feature)removeHistoryNode(E.def,"history:feature:"+feature.id);H.discard();}
    flash(String(error.message || error));return false;
  } finally {E._holeBuildPending=false;if(verified)verified.release();}
  if(thread){
    target.cosmeticThread=thread;
    target.threadGeometry=thread.threadGeometry;
  }
  E.authoring.featureType=null;E.authoring.phase="model";refreshAll();flash("✓ "+callout);return true;
}

function circleLoopAt(u, v, r, segments) {
  var n=segments||24, loop=[], i;
  for(i=0;i<n;i++){var a=i*Math.PI*2/n;loop.push({u:u+Math.cos(a)*r,v:v+Math.sin(a)*r});}
  return loop;
}

function selectedCylindricalFace() {
  return (E.topologySelection || []).find(function(reference){
    return reference.kind==="face" && reference.descriptor && (reference.descriptor.surface==="cylinder" || !reference.descriptor.surface && Number(reference.descriptor.radius)>0);
  }) || null;
}

function selectedThreadStart() {
  var face=selectedCylindricalFace();
  if(face)return {face:face,placement:threadPlacementFromFace(face.descriptor)};
  var edges=(E.topologySelection || []).filter(function(reference){return reference.kind==='edge';}),target=selectedSolid();
  if(edges.length!==1 || !target)return null;
  var topology=topologyEntriesForPart(target),picked=edges[0];
  var current=topology.find(function(entry){return entry.kind==='edge' && entry.persistentId===picked.persistentId && entry.ownerFeatureId===picked.ownerFeatureId;});
  if(!current)return null;
  try{
    var start=threadPlacementFromCircularEdge(current,topology);
    var captured=threadPlacementFromCircularEdge(picked,topology),tolerance=Math.max(1e-6,current.descriptor.radius*1e-5);
    if(Math.hypot(start.origin.x-captured.origin.x,start.origin.y-captured.origin.y,start.origin.z-captured.origin.z)>tolerance)return null;
    return {face:topologyReferenceFromEntry(start.face),edge:topologyReferenceFromEntry(current),placement:{origin:start.origin,axis:start.axis}};
  }catch(error){return null;}
}

function createHelixFeature(options) {
  var params={...featureDefaults("helix"),...(options || {})};
  var face=selectedCylindricalFace();
  if(face && face.descriptor){
    params.radius=Number(face.descriptor.radius)||params.radius;
    params.origin=cloneData(face.descriptor.origin);
    params.axis=cloneData(face.descriptor.axis||face.descriptor.normal);
  }
  var sketch=ensureSketch(E.def),circles=(sketch.entities || []).filter(function(e){return e.type==="circle"&&!e.construction;});
  if(!face&&circles.length===1){params.sketchId=sketch.id;params.circleId=circles[0].id;}
  var helixSpec;try{helixSpec=helixFromSketch(E.def,params);}catch(error){flash(error.message);return false;}
  pushUndo(t("opHelix"));
  var feature;
  try{
    if(isCanonicalAuthoring())feature=createFeatureDefinition(E.def,"helix",{references:{sketches:params.sketchId?[params.sketchId]:[],features:[],topology:face?[cloneData(face)]:[],references:[]},params:params});
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  E.def.referenceGeometry=E.def.referenceGeometry||[];
  E.def.referenceGeometry.push({...createHelix({name:t("opHelix"),...helixSpec}),featureId:feature?.id});
  refreshAll();flash("✓ "+t("helixAdded"));return true;
}

function createThreadFeature(options) {
  var params={...featureDefaults("thread"),...(options || {})};
  var start=selectedThreadStart(),pickedFace=start?.face;
  var target=selectedSolid();
  if(!pickedFace){flash(t("threadNeed"));return false;}
  var face=canonicalFeatureTopologyReferences(E.def,[cloneData(pickedFace)])[0];
  var placement=start.placement;
  var origin=placement.origin,axis=placement.axis;
  var targetFeatureId=target&&cutTargetFeatureId(target);
  var diameterMm=Number(params.diameterMm)||((face&&face.descriptor&&face.descriptor.radius||0)*20)||8;
  var spec=normalizeThreadSpec({...params,diameterMm:diameterMm,origin:origin,axis:axis,length:Number(params.length)||1.5});
  var check=validateThreadFeature(spec);
  if(!check.ok){flash(check.issues[0]&&check.issues[0].message||t("opThread"));return false;}
  var modeled=null;
  try{if(spec.mode==="modeled")modeled=modeledThreadSolid(spec);}catch(error){flash(String(error.message||error));return false;}
  pushUndo(t("opThread"));
  try{
    if(isCanonicalAuthoring())createFeatureDefinition(E.def,"thread",{
      inputs:targetFeatureId?[targetFeatureId]:[],
      references:{sketches:[],features:targetFeatureId?[targetFeatureId]:[],topology:canonicalFeatureTopologyReferences(E.def,start.edge?[cloneData(face),cloneData(start.edge)]:[cloneData(face)]),references:[]},
      params:{...params,...spec},
    });
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  if(target){
    target.cosmeticThread=cosmeticThread(spec);
    target.threadGeometry=target.cosmeticThread.threadGeometry;
    if(spec.mode==="modeled")target.modeledThread=modeled;
  }
  refreshAll();flash("✓ "+threadCallout(spec));return true;
}

function createKnurlFeature(options) {
  var params={...featureDefaults("knurl"),...(options || {})};
  var face=selectedCylindricalFace();
  var target=selectedSolid();
  if(!face && !target){flash(t("knurlNeed"));return false;}
  if(face&&face.descriptor){
    params.diameterMm=Number(params.diameterMm)||((Number(face.descriptor.radius)||0)*20)||30;
    params.origin=cloneData(face.descriptor.origin);
    params.axis=cloneData(face.descriptor.axis||face.descriptor.normal);
  }
  var check=validateKnurl(params);
  if(!check.ok){flash(check.issues[0]&&check.issues[0].message||t("opKnurl"));return false;}
  pushUndo(t("opKnurl"));
  try{
    if(isCanonicalAuthoring())createFeatureDefinition(E.def,"knurl",{
      inputs:target&&target.featureId?[target.featureId]:[],
      references:{sketches:[],features:target&&target.featureId?[target.featureId]:[],topology:face?[cloneData(face)]:[],references:[]},
      params:params,
    });
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  if(target){target.knurl=normalizeKnurlSpec(params);target.knurlMesh=knurlBandMesh(target.knurl);}
  refreshAll();flash("✓ "+knurlCallout(params));return true;
}

function createInsertFeature(options) {
  var params={...featureDefaults("insert"),...(options || {})};
  var face=selectedCylindricalFace();
  if(face&&face.descriptor){
    params.innerMm=Number(params.innerMm)||((Number(face.descriptor.radius)||0)*20)||8;
    params.origin=cloneData(face.descriptor.origin);
    params.axis=cloneData(face.descriptor.axis||face.descriptor.normal);
  }
  pushUndo(t("opInsert"));
  try{
    if(isCanonicalAuthoring())createFeatureDefinition(E.def,"insert",{
      references:{sketches:[],features:[],topology:face?[cloneData(face)]:[],references:[]},
      params:params,
    });
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  addPart(Object.assign({id:uid()}, insertBody(params)));
  refreshAll();flash("✓ "+t("opInsert"));return true;
}

function toolboxOptionLabel(key) {
  var labels={ overlay:t("toolboxOverlay"), angle:t("toolboxAngle"), radius:t("toolboxRadius"), thread:t("toolboxThread"), drawerSideMm:t("toolboxDrawerSide") };
  return labels[key] || key;
}

function pickToolboxOptions(fam, keys, index, acc, done, onBack) {
  if(!keys || index>=keys.length){ done(acc); return; }
  var key=keys[index], values=fam.options[key];
  if(key==="overlay" && acc.overlay){ pickToolboxOptions(fam, keys, index+1, acc, done, onBack); return; }
  showPickList(t("toolboxFastener"), tf("toolboxOptionNamed", { name: toolboxOptionLabel(key) }), values.map(function(value){
    return {value:value,label:String(value)};
  }), function(item){
    acc[key]=item.value;
    pickToolboxOptions(fam, keys, index+1, acc, done, function(){
      pickToolboxOptions(fam, keys, index, acc, done, onBack);
    });
  }, { onBack: onBack });
}

function showToolboxPicker() {
  function chooseFamily() {
    var library=listToolboxLibrary();
    var items=[];
    if(lastToolboxPick){
      items.push({kind:lastToolboxPick.kind,label:lastToolboxPick.label,hint:t("toolboxRecent")});
    }
    library.forEach(function(cat){
      cat.families.forEach(function(fam){
        if(lastToolboxPick && fam.kind===lastToolboxPick.kind) return;
        items.push({kind:fam.kind,label:fam.label,hint:(TOOLBOX_CATEGORY_LABELS[cat.id] || cat.label)+" · "+fam.standard});
      });
    });
    showPickList(t("toolboxFastener"), t("toolboxKind"), items, function(famItem){
      var fam=toolboxFamily(famItem.kind);
      if(!fam) return;
      continueToolboxFamily(fam, chooseFamily);
    }, {
      searchable:true,
      filter:function(query, rows){
        if(!query) return rows;
        var kinds=new Set(searchToolbox(query).map(function(row){ return row.kind; }));
        return rows.filter(function(row){ return kinds.has(row.kind); });
      }
    });
  }
  chooseFamily();
}

function continueToolboxFamily(fam, onBackToFamilies) {
  pickToolboxSize(fam, function(sizeItem, seed){
    var acc=Object.assign({}, seed||{});
    if(fam.kind==="euro-hinge") acc.overlay=sizeItem.size || sizeItem.key;

    function afterOptions() {
      var payload=Object.assign({
        sizeKey:sizeItem.key || sizeItem.size,
        series:sizeItem.series || acc.series,
        key:sizeItem.key
      }, acc);
      var lengthChoices=lengthOptionsForSize(fam, sizeItem.size || sizeItem.key);
      if(fam.hasLength && lengthChoices.length){
        showPickList(t("toolboxFastener"), t("toolboxLength"), lengthChoices.map(function(mm){
          return {lengthMm:mm,label:(sizeItem.label||sizeItem.size||"")+" × "+mm,hint:mm===sizeItem.lengthMm?t("wfSuggested"):""};
        }), function(lenItem){ insertToolboxFastener(fam.kind, sizeItem.key || sizeItem.size, lenItem.lengthMm, payload); }, { onBack: function(){ continueToolboxFamily(fam, onBackToFamilies); } });
        return;
      }
      insertToolboxFastener(fam.kind, sizeItem.key || sizeItem.size, sizeItem.lengthMm, payload);
    }

    function pickOptions() {
      var optionKeys=fam.options?Object.keys(fam.options):[];
      if(optionKeys.length) pickToolboxOptions(fam, optionKeys, 0, acc, afterOptions, afterSize);
      else afterOptions();
    }

    function afterSize() {
      if(fam.kind==="tee-reducing"){
        var runKey=sizeItem.key || sizeItem.size;
        var run = PVC_D1785[runKey] || null;
        var branches=reducingBranchRows(run, PVC_D1785);
        if(!branches.length){ flash(t("toolboxNoBranch")); return; }
        showPickList(t("toolboxFastener"), tf("toolboxOptionNamed", { name: t("toolboxBranch") }), branches.map(function(item){
          return {key:item.key,size:item.row.size,label:item.row.size+" · Sch "+item.row.schedule,hint:"Ø "+item.row.odMm};
        }), function(branchItem){
          acc.branchKey=branchItem.key;
          acc.branchSize=branchItem.size;
          pickOptions();
        }, { onBack: function(){ continueToolboxFamily(fam, onBackToFamilies); } });
        return;
      }
      pickOptions();
    }

    afterSize();
  }, { onBack: onBackToFamilies, searchable: (fam.sizes || []).length > 12 });
}

function pickToolboxSize(fam, done, extra) {
  extra = extra || {};
  if(fam.sizesBySeries){
    var seriesKeys=Object.keys(fam.sizesBySeries);
    showPickList(t("toolboxFastener"), tf("toolboxOptionNamed", { name: t("toolboxSeries") }), seriesKeys.map(function(value){
      return {value:value,label:value};
    }), function(seriesItem){
      var sizes=fam.sizesBySeries[seriesItem.value] || [];
      showPickList(t("toolboxFastener"), t("toolboxSize"), sizes.map(function(row){
        return {kind:fam.kind,size:row.size,key:row.key,lengthMm:row.lengthMm,label:row.label||row.size,series:seriesItem.value};
      }), function(sizeItem){ done(sizeItem, {series:seriesItem.value}); }, {
        onBack: function(){ pickToolboxSize(fam, done, extra); },
        searchable: sizes.length > 12
      });
    }, { onBack: extra.onBack });
    return;
  }
  showPickList(t("toolboxFastener"), t("toolboxSize"), fam.sizes.map(function(row){
    return {kind:fam.kind,size:row.size,key:row.key,lengthMm:row.lengthMm,label:row.label||row.size,series:row.series};
  }), function(sizeItem){ done(sizeItem, {}); }, { onBack: extra.onBack, searchable: extra.searchable });
}

function showConfigurations() {
  var assemblyConfiguration=E.docType==="assembly";
  var configurationDocument=assemblyConfiguration?E.assembly:E.def;
  if(!configurationDocument)return;
  function documentIsCurrent(){return configurationDocument===(E.docType==="assembly"?E.assembly:E.def);}
  function refreshConfigurationGeometry(){
    if(assemblyConfiguration){solveAssembly({quiet:true});refreshAll();return;}
    refreshAll();
    // A circular sweep has no analytic stand-in. Switching a design-table row
    // clears its old mesh, so the exact kernel body must be queued explicitly.
    (configurationDocument.parts||[]).filter(function(part){return isKernelBody(part)&&part.sketchSources?.kind==="circular-sweep"&&!part.meshData;}).forEach(scheduleKernelBody);
    if(isCanonicalAuthoring())scheduleExactRestore();
  }
  ensureConfigurations(configurationDocument);
  var items=configurationDocument.configurations.map(function(cfg){
    var active=cfg.id===configurationDocument.activeConfiguration;
    var size=cfg.designTableValues;
    return {id:cfg.id,label:cfg.name+(active?" ●":""),hint:size?"Path Ø "+size.pathDiameterMm+" mm · profile Ø "+size.profileDiameterMm+" mm":active?t("configSaved"):Object.keys(cfg.parameterOverrides||{}).length+" overrides"};
  });
  if(isCanonicalAuthoring() && configurationDocument.designTable?.kind!=="circular-sweep")items.unshift({id:"__design_table__",label:"Edit design table",hint:"Configuration rows, driving dimensions and feature suppression"});
  if(circularSweepTableRows(configurationDocument))items.push({id:"__sweep_table__",label:"Edit circular-sweep design table",hint:"Default, Small, Medium and Large · path and profile diameters"});
  items.push({id:"__edit__",label:"Rename active configuration",hint:"Name and description"});
  items.push({id:"__capture__",label:"Update active configuration from model",hint:assemblyConfiguration?"Capture component poses, grounding, mate settings and suppression":"Capture current dimensions, feature settings, suppression, material and properties"});
  items.push({id:"__new__",label:"+ "+t("configNew")});
  showPickList(t("configurations"), t("configurations"), items, function(item){
    if(!documentIsCurrent())return;
    if(item.id==="__design_table__"){
      openDesignTable(configurationDocument,{
        isCurrent:documentIsCurrent,
        beforeCommit:function(){pushUndo("Design table");},
        afterCommit:function(activeChanged){
          if(activeChanged){syncSketchDrivenParts();refreshConfigurationGeometry();}
          else refreshAll();
        }
      });
      return;
    }
    if(item.id==="__capture__"){
      pushUndo(t("configurations"));
      updateConfiguration(configurationDocument,configurationDocument.activeConfiguration,{capture:true});
      refreshAll();flash("✓ Active configuration updated");return;
    }
    if(item.id==="__edit__"){
      var current=configurationDocument.configurations.find(function(cfg){return cfg.id===configurationDocument.activeConfiguration;});
      sheetForm("Configuration",[{key:"name",label:"Configuration name",value:current.name},{key:"description",label:"Description",value:current.description||""}],"Names identify configurations in parts, assemblies and drawings.").then(function(values){
        if(!values||!documentIsCurrent())return;
        pushUndo(t("configurations"));
        try{updateConfiguration(configurationDocument,current.id,values);refreshAll();flash("✓ Configuration renamed");}
        catch(error){H.discard();flash(String(error.message||error),4000);}
      });return;
    }
    if(item.id==="__sweep_table__"){
      var rows=circularSweepTableRows(configurationDocument);
      var fields=rows.flatMap(function(row,index){return [
        {key:"path"+index,label:row.name+" path Ø (mm)",value:String(row.pathDiameterMm)},
        {key:"profile"+index,label:row.name+" profile Ø (mm)",value:String(row.profileDiameterMm)}
      ];});
      sheetForm("Circular-sweep design table",fields,"Large profile: the book screenshot shows 5 mm; its written step 254 says 10 mm. Enter the value you intend.").then(function(values){
        if(!values||!documentIsCurrent())return;
        var edited=rows.map(function(row,index){return {name:row.name,pathDiameterMm:Number(values["path"+index]),profileDiameterMm:Number(values["profile"+index])};});
        pushUndo("Design table");
        try{setCircularSweepDesignTable(configurationDocument,edited);refreshConfigurationGeometry();flash("✓ Design table · 4 configurations");}
        catch(error){H.discard();flash(String(error.message||error),4000);}
      });
      return;
    }
    if(item.id==="__new__"){
      var name="Config "+(configurationDocument.configurations.length+1);
      sheetForm("New configuration",[{key:"name",label:"Configuration name",value:name},{key:"description",label:"Description",value:""}],assemblyConfiguration?"Captures component poses, grounding and mate settings. Add or edit mates, then update the active configuration to retain the edits.":"Captures the current model. Edit dimensions and feature settings normally, then update the active configuration to retain the edits.").then(function(values){
        if(!values||!documentIsCurrent())return;
        pushUndo(t("configurations"));
        try{var saved=captureConfiguration(configurationDocument,values);flash("✓ "+t("configSaved")+" · "+saved.name);refreshAll();}
        catch(error){H.discard();flash(String(error.message||error),4000);}
      });return;
    }
    pushUndo(t("configurations"));
    setActiveConfiguration(configurationDocument,item.id);
    refreshConfigurationGeometry();flash("✓ "+item.label.replace(" ●",""));
  });
}

// Keep the feature associative. The mesh projection and recorded boolean tool
// are derived from the very same profile/axis that the exact history resolves.
function resolvedRevolve(sketch,params) {
  if(!sketch)throw new Error("Feature profile is missing its sketch");
  var spec=resolveSketchProfile({sketches:[sketch]},params),basis=spec.axisBasis;
  var pts=spec.points;
  if(basis){
    assertSketchAxisProfile(spec);
    pts=pts.map(q=>axisMeridian(basis,q));
  }else if(params.useSketchPlane){
    var axis=params.axis || "y";
    pts=pts.map(function(q){var p=sketchWorldPoint(sketch,q.u,q.v);return {u:axis==='x'?Math.hypot(p.y,p.z):axis==='z'?Math.hypot(p.x,p.y):Math.hypot(p.x,p.z),v:p[axis]};});
  }
  var extent={axis:params.axis,angle:params.angle,direction:params.direction,symmetric:params.symmetric};
  return {
    projection:{...extent,axisBasis:basis || null,pts,
      revolveProfile:basis && spec.segments?.some(s=>s.type!=="line")?{points:spec.points,segments:spec.segments}:null},
    tool:{...extent,kind:"revolve",axisBasis:basis || null,profileFrame:spec.profileFrame || null,
      radialProfile:!!spec.radialProfile,segments:spec.segments,loop:spec.points}
  };
}

function preselectedRevolveAxis(){
  var selected=E.sselAuto?[]:selEntities(),line=selected.length===1 && selected[0];
  return line?.type==="line" && !line.projectedCurve && ensureSketch(E.def).entities.some(e=>e.id===line.id)
    ? sketchAxisReference(line.id):"axis:y";
}

function revolveContour(axis,thin=false){
  var sketch=ensureSketch(E.def),closed=thin?null:closedSketchProfile();
  if(closed && (!isSketchAxis(axis) || closed.entityIds.some(id=>sketchAxisReference(id)===axis)))return closed;
  var geometry=sketch;
  if(isSketchAxis(axis))geometry={...sketch,entities:sketch.entities.filter(e=>sketchAxisReference(e.id)!==axis)};
  var options={selectedIds:selEntities().map(e=>e.id)};
  if(thin)return analyzeSketchChains(geometry,options).chains[0];
  return geometry===sketch?closed:analyzeSketchProfiles(geometry,options).profiles[0];
}

function selectedRevolve(params) {
  var sketch=ensureSketch(E.def),axis=revolvePreviewAxis(params,{axis:params.axisReference});
  var profile=revolveContour(axis,params.thinFeature);
  if(!profile)throw new Error(t("quickNeedSketch"));
  var featureParams={...params,axis,sketchId:sketch.id,profileEntityIds:profile.entityIds};
  if(params.operation!=="subtract")featureParams.radialProfile=true;
  if(isSketchAxis(axis))featureParams.useSketchPlane=true;
  delete featureParams.axisReference;
  return {sketch,params:featureParams,...resolvedRevolve(sketch,featureParams)};
}

function createRevolveFeature(options) {
  var optionsWithDefaults={...featureDefaults("revolve"),useSketchPlane:true,...(typeof options==="number"?{angle:options}:options || {})};
  var result;try{result=selectedRevolve(optionsWithDefaults);}catch(error){flash(String(error.message || error));return false;}
  var {params,sketch,projection,tool}=result;
  pushUndo(t("opRevolve"));recordSketchInHistory(E.def,sketch);var feature;
  var axisReference=optionsWithDefaults.axisReference || "axis:y";
  try{feature=createFeatureDefinition(E.def,"revolve",{references:{sketches:[sketch.id],features:[],topology:[],references:[axisReference],profileEntityIds:params.profileEntityIds},params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  var revolved={...projection,id:uid(),featureId:feature.id,kind:"rev",name:feature.name,x:0,z:0,seg:48,color:"#b89a6e",metal:.08,rough:.7,sketchDriven:true,sketchId:sketch.id,profileEntityIds:params.profileEntityIds};
  var revolveHost=mergeTargetBody(partBounds(revolved),params);
  if(revolveHost){
    var revolveTarget=cutTargetFeatureId(revolveHost);
    feature.inputs=[revolveTarget];feature.references.features=[revolveTarget];reconnectLaterBodyConsumers(E.def,feature);
    revolveHost.merges3d=revolveHost.merges3d || [];
    revolveHost.merges3d.push({...tool,featureId:feature.id});
    invalidatePartMeshAfterEdit(revolveHost);
    E.sel=revolveHost;queueExactMesh(revolveHost);refreshAll();return true;
  }
  E.sel=addPart(revolved);refreshAll();return true;
}

/* The body a cut is aimed at. Extrude Cut picks the selected solid and falls
   back to the last one built; the revolved and swept cuts want exactly the same
   rule, so it is stated once instead of three times. */
function cutTargetBody() {
  var parts=activeParts(E.def);
  return selectedSolid() || parts[parts.length-1] || null;
}

/* The body a MERGED feature fuses into.
 *
 * "Merge result" was declared by extrude, revolve, sweep and loft and wired by
 * none of them: every additive feature made a body of its own whatever the box
 * said. It is a choice between one body and two, so it only means anything when
 * there IS a second body to be — a solid the new one actually reaches. A boss
 * standing alone in space has nothing to fuse with and stays its own body
 * however the box is ticked, which is what a CAD modeller does with the option
 * greyed out; saying otherwise would be a different kind of lie.
 *
 * Touching counts: a boss grown off the top face of a plate meets it on a plane
 * and nowhere else, and that is the commonest merge there is. */
function mergeTargetBody(box, params) {
  if (!box || !params || params.mergeResult === false || params.operation === "new-body") return null;
  var touches = function (part) {
    var other = partBounds(part);
    if (!other) return false;
    return box.x0 <= other.x1 + 1e-6 && box.x1 >= other.x0 - 1e-6
      && box.y0 <= other.y1 + 1e-6 && box.y1 >= other.y0 - 1e-6
      && box.z0 <= other.z1 + 1e-6 && box.z1 >= other.z0 - 1e-6;
  };
  var candidates = activeParts(E.def).filter(function (part) { return partSupportsExactMesh(part) && touches(part); });
  if (!candidates.length) return null;
  var selected = selectedSolid();
  return candidates.includes(selected) ? selected : candidates[candidates.length - 1];
}

function cutTargetFeatureId(target, document = E.def, built = null) {
  if (!target) return null;
  /* `built(id)`, when given, also stops the chain at a step the run did not
     build, so a failed last step leaves the body at the step before it. */
  var head = target.derivedFeatureId || target.featureId;
  // Reactivating suppressed steps can leave a later sibling branch reading an
  // earlier body stage. Native history still evaluates that later branch;
  // publication must follow the latest active descendant, not an older fork.
  var lineage = new Set([head]);
  var modifiers = new Set(["fillet", "chamfer", "shell", "dome", "draft", "thicken", "rib", "extrudeCut", "revolveCut", "sweepCut", "hole", "moveBody", "boolean"]);
  /* A step below the rollback bar (or suppressed in history) is not built, so it
     cannot be the body's head. Walking past it made the displayed body ask the
     regeneration for Shell1 after rolling HOUSING back to Boss-Battery; the run
     had no Shell1, the exact rebuild failed, and the viewport fell back to the
     bare Base Extrude cylinder — Boss-Loft1, above the bar, vanished with it. */
  var inactive = new Set();
  (document.history || []).forEach(function (entry, index) {
    if (entry && entry.targetId && (entry.suppressed || historyEntryRolled(document, index))) inactive.add(entry.targetId);
  });
  var featureOrder=new Map((document.features || []).map(function(feature){return [feature.id,feature];}));
  var orderedFeatures=(document.history || []).filter(function(entry){return entry.kind==='feature' && featureOrder.has(entry.targetId);}).map(function(entry){var feature=featureOrder.get(entry.targetId);featureOrder.delete(entry.targetId);return feature;});
  orderedFeatures.push(...featureOrder.values());
  orderedFeatures.forEach(function (feature) {
    if (!feature.suppressed && !inactive.has(feature.id) && (modifiers.has(feature.type) || (feature.type==="thread" && feature.params?.mode==="modeled") || (["pattern","mirror"].includes(feature.type) && feature.params?.scope==="feature") || (["extrude","revolve","sweep","loft"].includes(feature.type) && feature.params?.mergeResult !== false && feature.params?.operation !== "new-body")) && (feature.inputs || []).some(function(id){return lineage.has(id);})
      // a Move with Copy made a second body; the original does not move with it
      && (feature.type !== "moveBody" || !leavesInputStanding(document, feature))
      && (feature.type !== "boolean" || !feature.params?.keepTools || feature.inputs[0]===head)
      && (!built || built(feature.id))) { head = feature.id; lineage.add(head); }
  });
  return head && (!built || built(head)) ? head : null;
}

/* Bodies come only from steps that built. A failed run used to throw before
   any part was given its mesh, so the saved meshData stayed on screen — on
   HOUSING a stale ring from an old broken union, under a green status. Each
   part now shows the last step of its chain that did build, flagged with the
   failure; a part none of whose steps built loses its mesh. Returns the parts
   whose display changed. */
async function publishExactBodies(parts, run, document, meshOf, isCurrent=function(){return true;}) {
  var failed = (run.issues || []).find(function (issue) { return issue.code === "regeneration-failed"; });
  var failure = run.ok ? null : failed ? failed.message : "The body could not be rebuilt";
  var built = function (id) { var result = run.results.get(id); return !!(result && (result.shape || (result.verifiedSerializedExact===true && result.workerMeshData && !result.invalid && !result.approximate))); };
  var publications = [];
  for (var part of parts) {
    if(!isCurrent())return [];
    var head = cutTargetFeatureId(part, document);
    if (!head) continue;
    var shown = run.ok ? head : cutTargetFeatureId(part, document, built);
    var body = shown ? run.results.get(shown) : null;
    if (body && built(shown)) {
      var mesh=await meshOf(body);
      if(!isCurrent())return [];
      publications.push({part, mesh, bounds:meshDataBounds(mesh.positions), error:shown === head ? null : failure});
    } else if (!run.ok) publications.push({part, mesh:null, error:failure});
  }
  // Commit together after the last await. A stale or rejected transfer
  // cannot leave the live drawing half on the new generation.
  return publications.map(function ({part, mesh, bounds, error}) {
    if (mesh) { part.meshData = mesh; part.bounds = bounds; }
    else { delete part.meshData; delete part.bounds; }
    part.exactError = error;
    part.exactPending = false;
    return part;
  });
}

/* Revolve Cut. The profile, the axis and the extent are the ones Revolve would
   have used — createRevolveFeature above builds an identical params record —
   and the difference is only where the resulting solid goes: onto the document
   as a body, or onto the target's cut list as a tool. */
function createRevolveCutFeature(options) {
  var optionsWithDefaults={...featureDefaults("revolveCut"),useSketchPlane:true,...(typeof options==="number"?{angle:options}:options || {})};
  var result;try{result=selectedRevolve(optionsWithDefaults);}catch(error){flash(String(error.message || error));return false;}
  var {params,sketch,tool}=result;
  var target=cutTargetBody();
  if(!target){flash(t("extrudeCutNeed"));return false;}
  if(!partSupportsExactMesh(target)){flash(t("cutNeedExactBody"));return false;}
  var axisReference=optionsWithDefaults.axisReference || "axis:y";
  pushUndo(t("opRevolveCut"));recordSketchInHistory(E.def,sketch);
  var targetFeatureId=cutTargetFeatureId(target),feature=null;
  try{feature=createFeatureDefinition(E.def,"revolveCut",{
    inputs:targetFeatureId?[targetFeatureId]:[],
    references:{sketches:[sketch.id],features:targetFeatureId?[targetFeatureId]:[],topology:[],references:[axisReference],profileEntityIds:params.profileEntityIds},
    params,
  });}catch(error){H.discard();flash(String(error.message||error));return false;}
  target.cuts3d=target.cuts3d || [];
  target.cuts3d.push({...tool,featureId:feature.id});
  invalidatePartMeshAfterEdit(target);
  E.sel=target;queueExactMesh(target);refreshAll();return true;
}

function clearFeaturePreview(refresh) {
  cancelCadWorkerWork('finish');
  E._instant3dPose = null;
  if(E.authoring){E.authoring.patternOverlap=false;E.authoring.finishPreviewStatus=null;}
  if(!E.authoring)return;E.authoring.previewParts=[];E.authoring.previewReplacesPartId=null;
  E.authoring.approxFinishPreview=null;E.authoring.pendingExactPreview=null;
  /* A merged pattern's fuse is in flight for as long as the kernel takes; the
     token bump below is what stops it landing a mesh in a scene the form has
     already been dismissed from. */
  var hadLoftSelection=!!E.authoring.featurePreviewState?.loftSectionIds;
  E.authoring.mergedPatternPreview=null;
  E.authoring.featurePreviewState=null;E.authoring.featurePreviewBadge=null;
  E._featurePreviewToken=(E._featurePreviewToken || 0)+1;
  if(E._featureExactPreviewTimer){clearTimeout(E._featureExactPreviewTimer);E._featureExactPreviewTimer=0;}
  if(E._featurePreviewFrame){cancelAnimationFrame(E._featurePreviewFrame);E._featurePreviewFrame=0;}
  if(refresh)refreshAll();
  else if(hadLoftSelection){refreshParts();refreshModelHistoryPane();}
}

/* The live preview shows what the feature will do — so it shows every area the
   feature will act on, one ghost body each. */
function extrudePreviewParts(type,params) {
  var areas;try{areas=extrusionSketchAreas(params);}catch(error){return [];}if(!areas.length)return [];
  var sketch=ensureSketch(E.def);
  // Local distances already follow the frame normal. Multiplying by its world
  // sign again reverses previews on back-facing supports.
  var axis=planeAxis(sketch.plane),normal=sketch.frame && sketch.frame.normal,principalDirection=sketch.frameSpace==="local"?1:normal?(axis==="x"?Math.sign(normal.x||1):axis==="y"?Math.sign(normal.y||1):Math.sign(normal.z||1)):1;
  var direction=(params.direction==="reverse"?-1:1)*(principalDirection || 1),depth=Math.max(1e-6,Number(params.depth)||1e-6),offset=Number(params.offset)||0,symmetric=!!params.symmetric||params.endCondition==="mid-plane";
  var center=(sketch.frameSpace==="local"?0:Number(sketch.offset)||0)+direction*offset,from=symmetric?center-direction*depth/2:center,to=symmetric?center+direction*depth/2:center+direction*depth;
  var extent={...params,axis:sketch.frameSpace==="local"?"frame":axis,frame:sketch.frameSpace==="local"?cloneData(sketch.frame):undefined,from:from,to:to,points:areas[0]&&areas[0].points};
  try {
    var host=type==="extrudeCut"?(selectedSolid()||activeParts(E.def)[activeParts(E.def).length-1]):null;
    var hostFaces=host?(authoritativeFinishTopology(host)||[]).filter(function(entry){return entry.kind==="face";}):[];
    extent=resolveExtrudeExtent(extent,{
      endFace:isUpToFace(params.endCondition)?(E.topologySelection||[]).find(function(item){return item.kind==="face";}):null,
      hostFaces:hostFaces,
      hostBounds:host?aabbFromBox(partBounds(host)):null,
    });
    from=extent.from;to=extent.to;
  } catch (error) {}
  return areas.map(function(area,index){
    return {id:"preview:"+type+":"+index,featureId:"preview:"+type,previewOnly:true,kind:"ext",axis:sketch.frameSpace==="local"?"frame":axis,frame:sketch.frameSpace==="local"?cloneData(sketch.frame):undefined,from:from,to:to,pts:area.points,holes:area.holes.slice(),color:type==="extrudeCut"?"#d75a4a":"#6f8de8",opacity:type==="extrudeCut"?.42:.62,metal:.04,rough:.68,name:"Live "+featureTypeLabel(type)};
  });
}

export {
  activeLoftCreation, clearFeaturePreview, createHelixFeature,
  createHoleFeature, createInsertFeature, createKnurlFeature,
  createMultiSketchFeature, createRevolveCutFeature, createRevolveFeature,
  createThreadFeature, cutTargetFeatureId, documentHelixRecords,
  extrudePreviewParts, featureField, mergeTargetBody, preselectedRevolveAxis,
  publishExactBodies, resolvedRevolve, retargetSweepHelix, revolveContour,
  selectedFeatureIds, selectedHelixRecord, selectedRevolve, selectedSketchIds,
  selectedThreadStart, setFeatureReferencesFromForm, showConfigurations,
  showToolboxPicker,
};

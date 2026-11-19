/* The CAD editor's STEP/IGES/print/STL exports, reference geometry forms,
   evaluation card and measure tool, split out of js/modeler.js. It shares the
   editor's state through live imports from ../modeler.js. */
import { printMeshFromPositions } from "../cad_3mf.js";
import { hasSingleToolboxKernelRecipe } from "../cad_assembly_toolbox.js";
import { addFeature, ensureFeatureTree, releaseRegeneration } from "../cad_feature_tree.js";
import { exportIges, exportStep, shapeToMeshData, validateBrepForExport } from "../cad_kernel.js";
import { rotationOf } from "../cad_mate_model.js";
import { createCoordinateSystem, createHelix, createReferenceAxis, createReferencePlane, createReferencePoint } from "../cad_reference_geometry.js";
import { exportBinaryStl, stlMeshOptions } from "../cad_stl.js";
import { flattenAssembly } from "../core/assembly_structure.js";
import { assemblyPrintInCadWorker, assemblyStepInCadWorker, cadWorkerAvailable, cancelCadWorkerWork, partStepInCadWorker, regenerateInCadWorker as regenerateFeatures } from "../core/cad_worker_client.js";
import { captureExactDiagnostics } from "../core/exact_diagnostics.js";
import { createExactPublicationDraft } from "../core/exact_publication_draft.js";
import { captureExactTopology } from "../core/exact_topology_cache.js";
import { synchronizeExtrusionProjections } from "../core/extrusion_projection.js";
import { holeSpan } from "../core/hole_span.js";
import { isKernelBody } from "../core/kernel_body.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { referencePlaneOffset, resolveOffsetPlanes, throughVertexBinding } from "../core/offset_planes.js";
import { publishRebuildStatus, rebuildParametricDocument, withKernelFailures } from "../core/parametric_rebuild.js";
import { analyzePrintLayers, printLayerSourceStamp, printLayerSvg } from "../core/print_layer_analysis.js";
import { prepareNativePrintPositions, printSetupExtents } from "../core/print_setup.js";
import { toolpathSvg, toolpathsGcode } from "../core/print_toolpath_export.js";
import { FFF_DEFAULTS, slicePrintMeshes, validateFffSettings } from "../core/print_toolpaths.js";
import { rebuildDefinition } from "../core/rebuild.js";
import { retainedSketchRevolve, revolveRecipe } from "../core/revolve_geometry.js";
import { cloneDomain, createParameter } from "../core/schema.js";
import { toolFeatureRecipe } from "../core/tool_recipe.js";
import { interferenceDocument } from "../core/worker_interference.js";
import { clearTopologyCache, holeLoop } from "../modeler_mesh_geometry.js";
import { cloneData, partBounds } from "../modeler_part_geometry.js";
import { t } from "../modeler_strings.js";
import { openQuickForm, syncCommandManager } from "../modeler/command_manager.js";
import { refreshParts, rejectFlexibleSpringPreview } from "../modeler/component_mates.js";
import { currentHistoryNode, pushUndo } from "../modeler/document_history.js";
import { exportThreeMfDocument, forceRebuildDocument } from "../modeler/document_io.js";
import { assemblyPrintRequests, exportAssemblyPrintDocument, standardsGate } from "../modeler/document_outputs.js";
import { drawSketch, invalidateDrawing, syncSheetPanel } from "./drawing_sheet_render.js";
import { flash, report } from "./drawing_sheet_touch.js";
import { btn, el } from "../modeler/editor_dom.js";
import { publishExactBodies } from "../modeler/feature_create.js";
import { modelParameterOverrides } from "../modeler/inspector.js";
import { emitPartMerges, emitPartPatternTurn } from "../modeler/library_io.js";
import { refreshChangedPartPreviews } from "../modeler/library_panel.js";
import { activeParts, componentDef, topologyEntriesForPart } from "../modeler/library_store.js";
import { selectedSolid } from "../modeler/part_commands.js";
import { invalidatePartMeshAfterEdit, scheduleExactMesh } from "../modeler/prefs_snap.js";
import { syncSketchDrivenParts, syncStatus } from "../modeler/sketch_entities.js";
import { isCanonicalAuthoring, syncAuthoringWorkflow } from "../modeler/sketch_workflow.js";
import { fin, uid } from "../state.js";
import {
  BODY_OPERATIONS, E, FINISH_AMOUNT_KEY, THREE_POINT_KEYS, exactBuildTimers,
  exactRebuildQueue, exactSaveCache, pendingCutController, refreshAll, root,
} from "../modeler.js";

function rebuildFeatureTreeFromDocument(target) {
  target=target || E.def;
  /* Canonical documents already own their feature history. Re-emitting from
     preview parts drops references.sketches and turns a valid extrude into
     "requires 1 sketches selection". Same predicate as saveModel(). */
  if (target.metadata && target.metadata.authoringSystem === "parametric-v1" && Array.isArray(target.features) && target.features.length) {
    return target.features;
  }
  var previousFeatures=new Map((target.features || []).map(function(feature){return [feature.id,feature];}));
  target.features = [];
  var combined = null, emittedToolbox=new Set();
  activeParts(target).forEach(function (part, index) {
    part.id = part.id || uid();
    part.featureId = part.featureId || "feature:part:" + part.id;
    var feature = null;
    var toolbox=part.toolboxFeatureId && previousFeatures.get(part.toolboxFeatureId);
    if(toolbox && toolbox.type==="toolbox"){
      if(emittedToolbox.has(toolbox.id))return;
      emittedToolbox.add(toolbox.id);
      feature=cloneData(toolbox);target.features.push(feature);
    } else if (part.kind === "box") {
      if (part.parametricEnvelope === "box" && target.parameters) {
        target.parameters.xMin ??= createParameter("xMin", 0, {expression:"-width/2",exposure:"internal",adjustable:false});
        target.parameters.zMin ??= createParameter("zMin", 0, {expression:"-depth/2",exposure:"internal",adjustable:false});
      }
      var boxParams=part.parametricEnvelope === "box" && target.parameters
        ? {x:"$xMin",y:0,z:"$zMin",w:"$width",h:"$height",d:"$depth"}
        : {x:Math.min(part.x0,part.x1),y:Math.min(part.y0,part.y1),z:Math.min(part.z0,part.z1),w:Math.abs(part.x1-part.x0),h:Math.abs(part.y1-part.y0),d:Math.abs(part.z1-part.z0)};
      feature = addFeature(target, { id:part.featureId, type:"box", name:part.name || "Box", params:boxParams });
    } else if (part.kind === "cyl" && (part.r2 == null || Math.abs(part.r2-part.r)<1e-6)) {
      if (part.parametricEnvelope === "cylinder" && target.parameters)
        target.parameters.radius ??= createParameter("radius", 0, {expression:"width/2",exposure:"internal",adjustable:false});
      var cylinderParams=part.parametricEnvelope === "cylinder" && target.parameters
        ? {x:0,y:0,z:0,r:"$radius",h:"$height"} : {x:part.x,y:part.y,z:part.z,r:part.r,h:part.h};
      feature = addFeature(target, { id:part.featureId, type:"cylinder", name:part.name || "Cylinder", params:cylinderParams });
    } else if (part.kind === "cyl") {
      /* A tapered leg is a cone, not a cylinder. Without this branch the
         projection emitted nothing for it, so the legacy engine measured a
         document the canonical one had converted — and migration_check's
         two-engine comparison refused a document it could see nothing wrong
         with. Same for the sphere below. `r1` is the name makeBrepCone reads. */
      feature = addFeature(target, { id:part.featureId, type:"cone", name:part.name || "Cone", params:{x:part.x,y:part.y,z:part.z,r1:part.r,r2:part.r2,h:part.h} });
    } else if (part.kind === "sph") {
      feature = addFeature(target, { id:part.featureId, type:"sphere", name:part.name || "Sphere", params:{x:part.x,y:part.y,z:part.z,r:part.r} });
    } else if (part.kind === "ext") {
      var previousExtrude=previousFeatures.get(part.featureId);
      var extrudeRefs=previousExtrude && previousExtrude.references && !Array.isArray(previousExtrude.references)
        ? cloneData(previousExtrude.references)
        : { sketches: part.sketchId ? [part.sketchId] : [], features: [], topology: [], references: [] };
      var extrudeDepth=Number(part.supportDepth)||Math.abs(Number(part.to)-Number(part.from));
      feature = addFeature(target, { id:part.featureId, type:"extrude", name:part.name || "Extrude", params:{axis:part.axis,...(part.frame ? {frame:cloneData(part.frame)} : {}),from:part.from,to:part.to,depth:extrudeDepth,points:cloneData(part.pts),...(part.profileEntityIds ? {profileEntityIds:cloneData(part.profileEntityIds), sketchId:part.sketchId} : {}),...(part.sketchId ? {sketchId:part.sketchId} : {}),...(part.support ? {support:cloneData(part.support),baseOffset:Number(part.supportBaseOffset)||0,depth:extrudeDepth} : {})}, inputs:part.support ? [part.support.ownerFeatureId] : [], references: extrudeRefs });
      (part.holes || []).forEach(function (hole, holeIndex) {
        var loop = holeLoop(hole, true);
        if (hole && hole.suppressed) return;
        var span = holeSpan(part, hole);
        if (span.from >= span.to) return;
        var cutter = addFeature(target, { id:part.featureId + ":hole:" + holeIndex, type:"extrude", name:"Hole " + (holeIndex+1), params:{axis:part.axis,...(part.frame ? {frame:cloneData(part.frame)} : {}),from:span.from,to:span.to,points:cloneData(loop)} });
        feature = addFeature(target, { id:part.featureId + ":cut:" + holeIndex, type:"subtract", name:"Cut " + (holeIndex+1), inputs:[feature.id,cutter.id] });
      });

    } else if (part.kind === "loft") {
      var loftSection=function(points,w){return points.map(function(q){
        if(part.axis==="y")return {x:q.u,y:w,z:q.v};
        if(part.axis==="z")return {x:q.u,y:q.v,z:w};
        return {x:w,y:q.v,z:q.u};
      });};
      feature=addFeature(target,{id:part.featureId,type:"loft",name:part.name || "Loft",params:{sections:[loftSection(part.pts0,part.from),loftSection(part.pts1,part.to)],solid:true,ruled:true}});
    } else if (part.kind === "rev") {
      var retained=retainedSketchRevolve(part,previousFeatures.get(part.featureId));
      feature=addFeature(target,retained || {id:part.featureId,type:"revolve",name:part.name || "Revolve",params:revolveRecipe(part)});
    } else if (isKernelBody(part) && part.kernel) {
      /* The recipe IS the feature. Re-emitting it keeps a kernel body in the
         exact BREP tree — STEP/IGES export, mass, interference — instead of
         dropping it silently, which is what an unrecognised kind does here. */
      feature=addFeature(target,{id:part.featureId,type:part.kernel.type,name:part.name || "Body",params:cloneData(part.kernel.params)});
    } else if ((part.kind === "direct" || part.kind === "mesh") && part.meshData) {
      var directBounds=part.mirrorImportSeed ? part.mirrorImportSeed.bounds : partBounds(part);
      var previousImport=previousFeatures.get(part.featureId), directPayload=part.sourcePayload || previousImport && previousImport.params && previousImport.params.sourcePayload;
      feature=addFeature(target,{id:part.featureId,type:"import",name:part.name || "Imported direct body",params:{
        bounds:{min:{x:directBounds.x0,y:directBounds.y0,z:directBounds.z0},max:{x:directBounds.x1,y:directBounds.y1,z:directBounds.z1}},
        topology:cloneData(part.mirrorImportSeed ? part.mirrorImportSeed.topology : part.meshData.topology || []),source:cloneData(part.importSource || previousImport && previousImport.params && previousImport.params.source || target.metadata && target.metadata.import || {}),
        ...(directPayload ? {sourcePayload:cloneData(directPayload)} : {}),
      }});
      (part.mirrorImportAxes || []).forEach(function(axis,mirrorIndex){
        var normal={x:0,y:0,z:0};normal[axis]=1;
        feature=addFeature(target,{id:part.featureId+":mirror:"+mirrorIndex,type:"mirror",name:"Mirror",inputs:[feature.id],params:{plane:{origin:{x:0,y:0,z:0},normal:normal},keepOriginal:false}});
      });
    }
    if (feature) {
      (part.cuts3d || []).forEach(function (cut, cutIndex) {
        if (cut.suppressed) return;
        var recipe=toolFeatureRecipe(cut,partBounds(part));
        if(!recipe)throw new Error("Unsupported cut kind: " + cut.kind);
        var cutter = addFeature(target, { id:part.featureId + ":cross-hole:" + cutIndex, type:recipe.type, name:"Cross cut " + (cutIndex+1), inputs:recipe.type==="holeTool"?[feature.id]:[], params:recipe.params });
        feature = addFeature(target, { id:part.featureId + ":cross-cut:" + cutIndex, type:"subtract", name:"Cross cut " + (cutIndex+1), inputs:[feature.id,cutter.id] });
      });
      // Merges land before the finish operations, the order the viewport
      // rebuild uses: a fillet is taken on the fused body, not on the host
      // before the boss existed.
      feature = emitPartMerges(target, part, feature);
      var exactOperations=Array.isArray(part.exactOperations) && part.exactOperations.length ? part.exactOperations.filter(function(operation){return !operation.suppressed;}) : [];
      if (!exactOperations.length && fin(part.exactFillet) && part.exactFillet>0) exactOperations=[{id:part.featureId+":fillet",type:"fillet",amount:part.exactFillet,targets:part.exactFilletTargets || []}];
      exactOperations.forEach(function(operation,operationIndex){
        var params={targets:cloneData(operation.targets || [])};
        if (FINISH_AMOUNT_KEY[operation.type]===undefined && !BODY_OPERATIONS.has(operation.type)) return;
        // The recorded params carry the operation's other settings (draft's
        // pull axis and neutral plane, a fillet's section); the amount is
        // authoritative and therefore written last. A split or a move has no
        // such number, and dropping it here left the exact tree — STEP export,
        // mass, interference — rebuilding a body that was never split.
        Object.assign(params, cloneData(operation.params || {}));
        if (FINISH_AMOUNT_KEY[operation.type]!==undefined) params[FINISH_AMOUNT_KEY[operation.type]]=operation.amount;
        feature=addFeature(target,{
          id:operation.id || part.featureId+":"+operation.type+":"+(operationIndex+1),
          type:operation.type,name:operation.type[0].toUpperCase()+operation.type.slice(1),params:params,inputs:[feature.id],
        });
      });
      feature = emitPartPatternTurn(target, part, feature);
    }
    if (!feature) return;
    if (!combined) combined = feature;
    else combined = addFeature(target, { id:"feature:union:through:" + part.id, type:"union", name:"Union " + (index+1), inputs:[combined.id,feature.id] });
  });
  return combined;
}

/* The exact (kernel) run owns native OpenCascade handles, so dropping the
   reference is not enough — every path that stops using a run has to release
   it. Document open and close used to do neither: the shape leaked, and
   E.brepRun stayed pointing at the previous model's solid, which the STEP and
   IGES exports below then happily wrote out under the new model's name. */
function releaseExactRun() {
  if (E.brepRun) releaseRegeneration(E.brepRun);
  E.brepRun = null;
  E.brepStamp = null;
}

function abandonDocumentExactWork() {
  if(E.pv)E.pv.committedDocument=null;
  if(pendingCutController)pendingCutController.abort();
  (E.def?.parts || []).forEach(function(part){
    var timer=exactBuildTimers.get(part);
    if(timer){clearTimeout(timer);exactBuildTimers.delete(part);}
    part.exactBuildToken=(part.exactBuildToken || 0)+1;
    part.exactPending=false;
  });
  exactRebuildQueue.reset();cancelCadWorkerWork();releaseExactRun();E.kernelBusy=false;
}

function exactRunStamp() {
  return { doc: (E.def && (E.def.definitionId || E.def.key)) || null, node: currentHistoryNode() };
}

/* A cached run may be exported only while it still describes THIS document at
   THIS revision. Anything else regenerates: a stale export is silently wrong,
   a redundant regeneration is merely slow. */
function exactRunIsCurrent(requireNative=true) {
  if (!E.brepRun || !E.brepRun.finalShape || !E.brepStamp) return false;
  if(requireNative && !E.brepRun.finalShape.shape)return false;
  var now = exactRunStamp();
  return E.brepStamp.doc === now.doc && E.brepStamp.node === now.node;
}

/* A failed run names its failure, not its first issue: a warning on an
   earlier step (a loose shell) used to be reported as the reason a later step
   failed. */
function rebuildFailureMessage(issues, fallback) {
  var list = issues || [];
  var failure = list.find(function (issue) { return issue.code === "regeneration-failed"; }) || list.find(function (issue) { return issue.severity === "error"; }) || list[0];
  return failure ? failure.message : fallback;
}

function scheduleExactRestore() {
  if (!(isCanonicalAuthoring() && E.def && activeParts(E.def).length)) {
    E.exactRestoring = false;
    return;
  }
  var restoringDocument=E.def;
  Promise.resolve(regenerateExactModel(undefined,{restoreMode:'mesh'})).catch(function(error){console.warn("Exact restore failed:",error);}).finally(function () {
    if(E.def!==restoringDocument)return;
    if (!E.exactRestoring) return;
    E.exactRestoring = false;
    refreshAll();
  });
}
async function regenerateExactModel(rebuild,options={}) {
  if(rebuild==="force")return forceRebuildDocument();
  var requestedDocument=E.def;
  return exactRebuildQueue.run(function(isCurrent){
    if(E.def!==requestedDocument)return null;
    return regenerateExactModelNow(rebuild,isCurrent,options);
  });
}

async function regenerateExactModelNow(rebuild,queueIsCurrent=function(){return true;},options={}) {
  if (E.docType !== "part" || !activeParts(E.def).length) { flash(t("needParts")); return null; }
  /* The busy state is a flag, not a button handle. This used to reach for
     `#mdRegen`, an element the ribbon consolidation deleted — the throw landed
     *before* the try below, so Regenerate, Ctrl+B and both STEP/IGES exports
     failed silently with nothing in the hint bar. syncCommandManager owns
     every disabled state; see its comment. */
  E.kernelBusy = true; syncCommandManager(); syncStatus(); flash(t("kernelBusy"));
  var rebuildingDocument=E.def;
  var rebuildingNode=currentHistoryNode();
  var rebuildingEditRevision=E.massEditRevision;
  var buildIsCurrent=function(){return queueIsCurrent() && E.def===rebuildingDocument && currentHistoryNode()===rebuildingNode && E.massEditRevision===rebuildingEditRevision;};
  try {
    var preserveRecognized=E.def.metadata && E.def.metadata.import && E.def.metadata.import.recognition && E.def.metadata.import.recognition!=="none",executionDocument=E.def;
    if(isCanonicalAuthoring()){
      var compiled=compileKernelFeatureTree(E.def);if(!compiled.ok)throw new Error(compiled.issues[0] && compiled.issues[0].message || "Invalid parametric history");
      executionDocument=compiled.document;executionDocument.features=compiled.features;
    } else {
      if ((!preserveRecognized && rebuild !== false) || !ensureFeatureTree(E.def).length) rebuildFeatureTreeFromDocument();
      E.coreRun = rebuildDefinition(E.def, modelParameterOverrides());
    }
    var regenerated=await regenerateFeatures(executionDocument,{restoreMode:options.restoreMode,onProgress:function(progress){if(buildIsCurrent())flash("Computing exact geometry · "+(progress.name || progress.stage));}});
    if(!buildIsCurrent())return null;
    if(compiled){
      // Transfer onto shallow body copies. Keep the live recipes, exact meshes
      // and topology together until the last transfer and ownership check.
      var liveParts = new Map(activeParts(E.def).map(part => [part.id, part]));
      var staged = Array.from(liveParts.values(), part => ({...part}));
      var publishedParts = await publishExactBodies(staged,regenerated,E.def,async function(body){
        var mesh=body.verifiedSerializedExact===true ? cloneData(body.workerMeshData) : await shapeToMeshData(body,{deflection:.28,angle:.18});
        mesh.topology=cloneData(body.topology || []);
        delete mesh.normals;delete mesh.colors;
        return mesh;
      },buildIsCurrent);
      if (!buildIsCurrent()) return null;
    }
    var transaction=compiled && createExactPublicationDraft(rebuildingDocument,publishedParts.map(part=>part.meshData));
    var draft=transaction ? transaction.draft : rebuildingDocument;
    var diagnostics=captureExactDiagnostics(draft,rebuildingNode,rebuildingEditRevision,regenerated);
    if(diagnostics) diagnostics={...diagnostics,document:rebuildingDocument};
    if(compiled){
      var changedIds = new Set(), publishing = new Set(publishedParts.map(part => part.id));
      var projectionDirty=synchronizeExtrusionProjections(draft,executionDocument.features,regenerated);
      for (const id of projectionDirty) {
        const part=draft.parts.find(item=>item.id===id);
        if (part) {
          invalidatePartMeshAfterEdit(part,false); // schedule only after publication
          changedIds.add(id);
        }
      }
      draft.exactTopologyCache=captureExactTopology(draft,executionDocument.features,regenerated);
      var core=withKernelFailures(rebuildParametricDocument(draft,modelParameterOverrides()),regenerated);
      publishRebuildStatus(draft,core);
      var draftParts = new Map(draft.parts.map(part => [part.id, part]));
      for (const result of publishedParts) {
        const part = draftParts.get(result.id);
        if (!part) continue;
        if (result.meshData) { part.meshData=result.meshData; part.bounds=result.bounds; }
        else { delete part.meshData; delete part.bounds; }
        part.exactError=result.exactError;
        part.exactPending=false;
        part.exactBuildToken=(part.exactBuildToken || 0)+1;
        changedIds.add(part.id);
      }
      var commitDocument = transaction.prepareCommit();
    }
    if (!buildIsCurrent()) return null;
    var previousRun=E.brepRun;
    var previousBodies=compiled && rebuildingDocument.parts.slice();
    if(compiled){commitDocument(); E.coreRun=core;}
    E.brepRun=regenerated;
    E.brepStamp=null;
    E.exactDiagnosticRun=diagnostics;
    var adopted=true;
    if(compiled) invalidateDrawing();
    if(previousRun && previousRun!==regenerated)releaseRegeneration(previousRun);
    if(compiled){
      const currentBodies=new Set(rebuildingDocument.parts);
      // Timers belong to objects. Status publication may have replaced the
      // body while preserving its id, or removed it from the document.
      const changedParts=rebuildingDocument.parts.filter(part=>changedIds.has(part.id));
      const retiredOwners=new Set(previousBodies.filter(part=>!currentBodies.has(part)));
      for(const part of changedParts) if(publishing.has(part.id)) retiredOwners.add(part);
      for(const part of retiredOwners){
        if(!exactBuildTimers.has(part))continue;
        clearTimeout(exactBuildTimers.get(part));
        exactBuildTimers.delete(part);
      }
      for(const part of changedParts){
        if (!publishing.has(part.id)) scheduleExactMesh(part);
        clearTopologyCache(part);
      }
      refreshChangedPartPreviews(changedParts);
      if(E.mode==="drawing"){drawSketch();syncSheetPanel();}
    }
    refreshParts(); // Publish healthy branches even when another branch needs repair.
    if (!E.brepRun.ok || !E.brepRun.finalShape) throw new Error(rebuildFailureMessage(E.brepRun.issues, "No supported solid features"));
    /* Stamped after refreshParts(), so the run is only ever marked current
       once the document it belongs to has settled. */
    E.brepStamp = exactRunStamp();
    // A current worker-proven restore can also validate a subsequent Save.
    // The cache clones proof and rejects native handles or unverified results.
    if(compiled && buildIsCurrent())exactSaveCache.put(rebuildingDocument,compiled,regenerated);
    syncAuthoringWorkflow();
    flash("✓ " + t("kernelReady")); return E.brepRun;
  } catch (error) {
    if(!buildIsCurrent())return null;
    if (adopted) E.brepStamp = null;
    flash(t("errBrep") + ": " + String(error.message || error)); console.error(error); return null;
  } finally {
    if (regenerated && !adopted && regenerated!==E.brepRun) releaseRegeneration(regenerated);
    if(queueIsCurrent()){E.kernelBusy = false; syncCommandManager(); syncStatus();} }
}

/* An assembly is exported as one compound of its exact leaf bodies, placed where
   the mates put them (the same occurrences the interference check measures). */
async function exportAssemblyStep() {
  if(rejectFlexibleSpringPreview())return;
  if (!E.assembly) return;
  if (!cadWorkerAvailable()) { flash(t("errStep") + ": needs the browser CAD worker"); return; }
  var requests = flattenAssembly(E.assembly, { visibleOnly:true }).map(function (occurrence) {
    var component = occurrence.component, def = componentDef(component), placement = occurrence.placement, transform = component.transform || {};
    return { id:component.id, label:occurrence.parents.concat(component).map(function (item) { return item.name || item.modelKey || item.assemblyKey || String(item.id); }).join(" / "),
      document:def?.metadata?.authoringSystem === "parametric-v1" && (activeParts(def).length === 1 || hasSingleToolboxKernelRecipe(def,activeParts(def))) ? interferenceDocument(def) : null,
      placement:{ matrix:placement ? [placement.x.x, placement.y.x, placement.z.x, placement.x.y, placement.y.y, placement.z.y, placement.x.z, placement.y.z, placement.z.z] : rotationOf(transform).flat(),
        translation:placement ? placement.origin : { x:Number(transform.x) || 0, y:Number(transform.y) || 0, z:Number(transform.z) || 0 } } };
  });
  if (!requests.length) { flash(t("noComponents")); return; }
  flash("STEP…");
  try {
    var result = await assemblyStepInCadWorker(requests, { onProgress:function (progress) { flash((progress.name || progress.stage || "STEP") + "…"); } });
    downloadBytes(result.bytes, (E.assembly.name || "assembly") + ".step", "model/step");
    flash("✓ " + t("stepExported") + " · " + result.bodies);
  } catch (error) { report(t("reportKickerSave"), t("errStep"), String(error.message || error)); }
}

async function exportStepDocument(unqualifiedDraft) {
  if (E.docType === "assembly") { await exportAssemblyStep(); return; }
  if (E.docType !== "part") return;
  if (!standardsGate("STEP export",{unqualifiedDraft:unqualifiedDraft===true,onDraft:function(){exportStepDocument(true);}})) return;
  try {
    var name=(E.def.name || "model")+(unqualifiedDraft===true?"__UNQUALIFIED_DRAFT":"");
    var bytes;
    if(cadWorkerAvailable()){
      flash("STEP…");
      bytes=(await partStepInCadWorker(E.def,name+".step",{parameterOverrides:modelParameterOverrides(),onProgress:function(progress){flash((progress.name || progress.stage || "STEP")+"…");}})).bytes;
    }else{
      var run=exactRunIsCurrent()?E.brepRun:await regenerateExactModel();
      if(!run?.ok || !run.finalShape)throw new Error("No supported solid features");
      bytes=await exportStep(run.finalShape,name+".step");
    }
    var blob = new Blob([bytes], {type:"model/step"}), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name.replace(/[^a-z0-9_-]+/gi,"_") + ".step";
    a.hidden = true; document.body.appendChild(a); a.click(); a.remove();
    flash("✓ " + t("stepExported"));
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  } catch (error) { report(t("reportKickerSave"),t("errStep"),String(error.message || error)); }
}

async function exportIgesDocument(unqualifiedDraft) {
  if (E.docType !== "part") return;
  if (!standardsGate("IGES export",{unqualifiedDraft:unqualifiedDraft===true,onDraft:function(){exportIgesDocument(true);}})) return;
  var run = exactRunIsCurrent() ? E.brepRun : await regenerateExactModel();
  if (!run || !run.ok || !run.finalShape) return;
  try {
    var name=(E.def.name || "model")+(unqualifiedDraft===true?"__UNQUALIFIED_DRAFT":"");
    var bytes = await exportIges(run.finalShape, name + ".igs");
    downloadBytes(bytes, name + ".igs", "model/iges");
    flash("✓ " + t("igesExported"));
  } catch (error) { flash(t("errIges") + ": " + String(error.message || error)); }
}

async function openPrintLayerAnalysis() {
  if(E.docType!=="part" && E.docType!=="assembly")return;
  var type=E.docType,printDocument=type==="assembly"?E.assembly:E.def;
  if(!printDocument || !printDocument.printSetup){flash("Save Print setup before analyzing oriented layers",5000);return;}
  if(type==="assembly" && rejectFlexibleSpringPreview())return;
  function stamp(){return type==="assembly"?JSON.stringify({source:assemblyPrintRequests(),printSetup:printDocument.printSetup}):printLayerSourceStamp(E.def,printDocument.printSetup);}
  var sourceStamp=stamp(),meshes,analysis=null,busy=false,inputs;
  function assertCurrent(requireForm){
    if(E.docType!==type || (type==="assembly"?E.assembly:E.def)!==printDocument || sourceStamp!==stamp() || (requireForm && E.quickAction!=="layeranalysis"))throw new Error("Print source, orientation or dialog changed; reopen Layer analysis");
  }
  try{
    var settings={quality:"custom",deviationMm:0.01,angleDegrees:5,printSetup:cloneData(printDocument.printSetup)};
    if(type==="assembly"){
      var result=await assemblyPrintInCadWorker(assemblyPrintRequests(),{...settings,layerAnalysisOnly:true},{onProgress:function(p){flash((p.name || p.stage)+"…");}});
      meshes=result.meshes;
    }else{
      var run=exactRunIsCurrent()?E.brepRun:await regenerateExactModel();
      if(!run?.ok || !run.finalShape)throw new Error("Layer analysis needs a closed native solid");
      await validateBrepForExport(run.finalShape);
      var mesh=await shapeToMeshData(run.finalShape,stlMeshOptions(settings));
      meshes=[{...printMeshFromPositions(prepareNativePrintPositions(mesh.positions,settings.printSetup)),name:printDocument.name}];
    }
    assertCurrent(false);
  }catch(error){flash(String(error.message || error),6000);return;}
  var preview=el("div","md-print-bed-preview"),exports=el("div","md-feature-actions");
  function show(values){
    if(!analysis){preview.textContent="Apply to calculate actual geometric layer contours.";return;}
    if(Number(values.layerHeightMm)!==analysis.layerHeightMm){preview.textContent="Layer height changed. Apply to calculate this comparison before exporting.";return;}
    try{
      assertCurrent(true);var number=Number(values.layer),layer=analysis.layers[number-1];
      var svg=printLayerSvg(analysis,number),loops=layer.objects.reduce((n,o)=>n+o.contours.length,0),holes=layer.objects.reduce((n,o)=>n+o.contours.filter(c=>c.hole).length,0);
      preview.innerHTML=svg+'<p>'+analysis.layerCount+' geometric layers · Layer '+number+' · section Z '+layer.sectionZMm.toFixed(3)+' mm · '+loops+' closed contours / '+holes+' holes · area '+layer.areaMm2.toFixed(3)+' mm²</p><small>'+analysis.qualification+'</small>';
      preview.querySelector("svg").style.maxHeight="260px";
    }catch(error){preview.textContent=String(error.message || error);}
  }
  function exportAnalysis(format){
    try{
      assertCurrent(true);
      if(!analysis || busy || Number(inputs.layerHeightMm.value)!==analysis.layerHeightMm)throw new Error("Apply the current layer height before exporting");
      var name=(printDocument.name || "model")+"-layer-analysis";
      if(format==="svg")downloadBytes(printLayerSvg(analysis,Number(inputs.layer.value)),name+"-"+inputs.layer.value+".svg","image/svg+xml");
      else downloadBytes(JSON.stringify({...analysis,sourceName:printDocument.name,printSetup:settings.printSetup,tessellation:{deviationMm:0.01,angleDegrees:5}},null,2),name+".json","application/json");
    }catch(error){flash(String(error.message || error),5000);}
  }
  inputs=openQuickForm({action:"layeranalysis",icon:"ph-printer",title:"Layer analysis",presentationOnly:true,hint:"Read-only mid-slab contours of the actual native print mesh in the saved orientation. This is geometric layer analysis; no infill, supports, toolpaths or G-code.",fields:[
    {key:"layerHeightMm",label:"Layer height (mm)",type:"number",value:0.2,min:0.01,max:100,step:0.01},
    {key:"layer",label:"Selected layer",type:"number",value:1,min:1,max:2000,step:1}
  ],onLive:show,onApply:async function(values){
    if(busy)return false;busy=true;preview.textContent="Calculating geometric layers…";
    try{
      assertCurrent(true);
      var calculated=await analyzePrintLayers(meshes,{layerHeightMm:Number(values.layerHeightMm),assertCurrent:function(){assertCurrent(true);},yieldControl:function(){return new Promise(resolve=>setTimeout(resolve,0));}});
      assertCurrent(true);analysis=calculated;inputs.layer.max=String(analysis.layerCount);inputs.layer.value=String(Math.min(Math.max(1,Number(values.layer)||1),analysis.layerCount));show({layerHeightMm:analysis.layerHeightMm,layer:Number(inputs.layer.value)});
    }catch(error){analysis=null;preview.textContent=String(error.message || error);}
    finally{busy=false;}
    return false;
  }});
  if(inputs){
    exports.appendChild(btn("Export layer analysis JSON",function(){exportAnalysis("json");}));
    exports.appendChild(btn("Export selected layer SVG",function(){exportAnalysis("svg");}));
    var actions=root.querySelector("#mdQuickSettings .md-feature-actions");actions?.before(preview,exports);show({});
  }
}

async function openFffSlicePreview() {
  if(E.docType!=="part" && E.docType!=="assembly")return;
  var type=E.docType,document=type==="assembly"?E.assembly:E.def;
  if(!document || !document.printSetup){flash("Save Print setup before generating FFF paths",5000);return;}
  if(type==="assembly" && rejectFlexibleSpringPreview())return;
  function stamp(){return type==="assembly"?JSON.stringify({source:assemblyPrintRequests(),printSetup:document.printSetup}):printLayerSourceStamp(E.def,document.printSetup);}
  var sourceStamp=stamp(),meshes,slice=null,busy=false,inputs,applied=null;
  var meshSettings={quality:"custom",deviationMm:.01,angleDegrees:5,printSetup:cloneData(document.printSetup)};
  function assertCurrent(form){if(E.docType!==type || (type==="assembly"?E.assembly:E.def)!==document || sourceStamp!==stamp() || (form && E.quickAction!=="fffslice"))throw new Error("Print source or dialog changed; reopen FFF slice preview");}
  try {
    if(type==="assembly")meshes=(await assemblyPrintInCadWorker(assemblyPrintRequests(),{...meshSettings,layerAnalysisOnly:true})).meshes;
    else {
      var run=exactRunIsCurrent()?E.brepRun:await regenerateExactModel();
      if(!run?.ok || !run.finalShape)throw new Error("FFF slicing needs a closed native solid");
      await validateBrepForExport(run.finalShape);
      var mesh=await shapeToMeshData(run.finalShape,stlMeshOptions(meshSettings));
      meshes=[{...printMeshFromPositions(prepareNativePrintPositions(mesh.positions,meshSettings.printSetup)),name:document.name}];
    }
    assertCurrent(false);
  }catch(error){flash(String(error.message || error),6000);return;}
  var saved={...FFF_DEFAULTS,...document.fffSliceSettings},preview=el("div","md-print-bed-preview"),exports=el("div","md-feature-actions");
  function valuesSettings(values){
    var settings={...saved};
    for(var key of Object.keys(FFF_DEFAULTS))if(values[key]!==undefined)settings[key]=typeof FFF_DEFAULTS[key]==="number"?Number(values[key]):values[key];
    return validateFffSettings(settings);
  }
  function currentValues(){var values={};for(var key of Object.keys(inputs || {}))if(inputs[key]?.value!==undefined)values[key]=inputs[key].value;return values;}
  function show(values){
    try {
      if(!slice){preview.textContent="Apply to generate actual wall, skin, infill, support and adhesion paths.";return;}
      assertCurrent(true);
      if(JSON.stringify(valuesSettings(values))!==applied){preview.textContent="Settings changed. Apply before exporting this comparison.";return;}
      var number=Math.min(slice.layerCount,Math.max(1,Number(values.layer)||1)),layer=slice.layers[number-1];
      preview.innerHTML=toolpathSvg(slice,number)+'<p>'+slice.layerCount+' deposition layers · '+number+' · Z '+layer.zMm.toFixed(3)+' mm · '+layer.paths.length+' paths · estimated filament '+slice.estimates.filamentLengthMm.toFixed(1)+' mm · support '+slice.estimates.supportVolumeMm3.toFixed(1)+' mm³</p><small>Walls cyan; infill purple; skin green; support orange; adhesion pink. '+slice.qualification+'</small>';
      preview.querySelector("svg").style.maxHeight="260px";
    }catch(error){preview.textContent=String(error.message || error);}
  }
  function exportSlice(format){
    try {
      assertCurrent(true);var values=currentValues();
      if(!slice || busy || JSON.stringify(valuesSettings(values))!==applied)throw new Error("Apply current settings before exporting FFF paths");
      var name=(document.name || "model")+"-fff-study";
      if(format==="svg")downloadBytes(toolpathSvg(slice,Number(values.layer)||1),name+"-layer-"+values.layer+".svg","image/svg+xml");
      else if(format==="gcode")downloadBytes(toolpathsGcode(slice,{bedWidthMm:document.printSetup.bedWidthMm,bedDepthMm:document.printSetup.bedDepthMm}),name+".gcode","text/plain");
      else downloadBytes(JSON.stringify({...slice,sourceName:document.name,printSetup:meshSettings.printSetup,tessellation:{deviationMm:.01,angleDegrees:5},gcodeProfile:'illustrative-generic-absolute-e'},null,2),name+".json","application/json");
    }catch(error){flash(String(error.message || error),5000);}
  }
  var numeric=[['layerHeightMm','Layer height (mm)'],['gridMm','Raster grid spacing (mm)'],['lineWidthMm','Line width (mm)'],['wallCount','Wall line count'],['skinLayers','Top/bottom skin layers'],['infillPercent','Rectilinear infill (%)'],['supportPercent','Support density (%)'],['supportGapMm','Support Z gap (mm)'],['supportXYGapMm','Support XY gap (mm)'],['adhesionWidthMm','Skirt offset / brim / raft width (mm)'],['wallSpeed','Wall/skin speed (mm/s)'],['infillSpeed','Infill/support speed (mm/s)'],['travelSpeed','Travel speed (mm/s)']];
  inputs=openQuickForm({action:"fffslice",icon:"ph-printer",title:"FFF slice preview",presentationOnly:true,hint:"Actual bounded raster paths from native print geometry. Profile: illustrative generic absolute-E, 1.75 mm filament; no printer homing/heating/retraction or physical-print claim. Apply saves study settings separately from CAD features.",fields:[
    ...numeric.map(function(item){return {key:item[0],label:item[1],type:"number",value:saved[item[0]],step:.1};}),
    {key:"support",label:"Support placement",type:"select",value:saved.support,choices:[{value:"off",label:"Off"},{value:"buildplate",label:"Touching buildplate"},{value:"everywhere",label:"Everywhere"}]},
    {key:"adhesion",label:"Bed adhesion",type:"select",value:saved.adhesion,choices:[{value:"none",label:"None"},{value:"skirt",label:"Skirt"},{value:"brim",label:"Brim"},{value:"raft",label:"Raft"}]},
    {key:"layer",label:"Selected deposition layer",type:"number",value:1,min:1,max:500,step:1}
  ],onLive:show,onApply:async function(values){
    if(busy)return false;busy=true;preview.textContent="Generating actual FFF paths…";
    try {
      assertCurrent(true);var selected=valuesSettings(values);
      var calculated=await slicePrintMeshes(meshes,selected,{printSetup:meshSettings.printSetup,contourMarginMm:meshSettings.deviationMm,assertCurrent:function(){assertCurrent(true);},yieldControl:function(){return new Promise(resolve=>setTimeout(resolve,0));}});
      assertCurrent(true);
      pushUndo("FFF slice study settings");document.fffSliceSettings=cloneData(selected);saved=selected;sourceStamp=stamp();
      slice=calculated;applied=JSON.stringify(selected);inputs.layer.max=String(slice.layerCount);inputs.layer.value=String(Math.min(Math.max(1,Number(values.layer)||1),slice.layerCount));show({...selected,layer:Number(inputs.layer.value)});
    }catch(error){slice=null;preview.textContent=String(error.message || error);}
    finally{busy=false;}return false;
  }});
  if(inputs){
    exports.appendChild(btn("Export FFF path JSON",function(){exportSlice("json");}));
    exports.appendChild(btn("Export deposition layer SVG",function(){exportSlice("svg");}));
    exports.appendChild(btn("Export illustrative G-code",function(){exportSlice("gcode");}));
    root.querySelector("#mdQuickSettings .md-feature-actions")?.before(preview,exports);show({});
  }
}

async function openPrintSetupForm() {
  if(E.docType!=="part" && E.docType!=="assembly")return;
  var printDocument=E.docType==="assembly"?E.assembly:E.def,assemblyPreview=null,mesh,sourceStamp;
  if(!printDocument)return;
  if(E.docType==="assembly"){
    if(rejectFlexibleSpringPreview())return;
    try{
      var requests=assemblyPrintRequests();sourceStamp=JSON.stringify(requests);
      assemblyPreview=await assemblyPrintInCadWorker(requests,{previewOnly:true,quality:"fine"},{onProgress:function(p){flash((p.name || p.stage)+"…");}});
      if(E.docType!=="assembly" || E.assembly!==printDocument || sourceStamp!==JSON.stringify(assemblyPrintRequests()))throw new Error("Assembly changed during print preparation; reopen Print setup");
    }catch(error){flash(String(error.message || error),6000);return;}
  }else{
    var run=exactRunIsCurrent()?E.brepRun:await regenerateExactModel();
    if(!run?.ok || !run.finalShape){flash("Print setup needs a closed native solid",4000);return;}
    try{mesh=await shapeToMeshData(run.finalShape,{deflection:0.002,angle:0.08});}
    catch(error){flash(String(error.message || error),4000);return;}
  }
  var saved=printDocument.printSetup || {},preview=el("div","md-print-bed-preview"),inputs;
  function show(values){
    try{
      var ext=assemblyPreview?assemblyPreview.orientations[values.basePlane]:printSetupExtents(mesh.positions,values.basePlane),w=Number(values.bedWidthMm),d=Number(values.bedDepthMm),h=Number(values.bedHeightMm);
      var fits=w>0 && d>0 && h>0 && ext.widthMm<=w+0.001 && ext.depthMm<=d+0.001 && ext.heightMm<=h+0.001;
      var scale=180/Math.max(w || 1,d || 1,ext.widthMm,ext.depthMm),color=fits?"#55d9e5":"#ff7070";
      var footprints=ext.footprints?ext.footprints.map(function(item){return '<rect x="'+(110+item.xMm*scale)+'" y="'+(110+item.yMm*scale)+'" width="'+item.widthMm*scale+'" height="'+item.depthMm*scale+'" fill="'+color+'" fill-opacity="0.25" stroke="'+color+'"/>';}).join(""):'<rect x="'+(110-ext.widthMm*scale/2)+'" y="'+(110-ext.depthMm*scale/2)+'" width="'+(ext.widthMm*scale)+'" height="'+(ext.depthMm*scale)+'" fill="'+color+'" fill-opacity="0.25" stroke="'+color+'"/>';
      preview.innerHTML='<svg viewBox="0 0 220 220" role="img" aria-label="Centered component bounding footprints on print bed"><rect x="'+(110-w*scale/2)+'" y="'+(110-d*scale/2)+'" width="'+(w*scale)+'" height="'+(d*scale)+'" fill="none" stroke="currentColor"/>'+footprints+'</svg><p>'+ext.widthMm.toFixed(2)+' × '+ext.depthMm.toFixed(2)+' × '+ext.heightMm.toFixed(2)+' mm · '+(fits?'Fits print bed':'Exceeds print bed')+'</p><small>Export is centered in X/Y with lowest Z at 0 mm.'+(ext.footprints?.some(function(item){return item.lowestZMm>.001;})?' Some components are above the bed; inspect support needs.':'')+(ext.footprintOverlaps?.length?' '+ext.footprintOverlaps.length+' bounding-footprint overlap(s). This is a conservative tray warning; use Interference check for exact geometry.':'')+'</small>';
    }catch(error){preview.textContent=String(error.message || error);}
  }
  inputs=openQuickForm({action:"printsetup",icon:"ph-printer",title:"Print setup",hint:assemblyPreview?"Print snapshot of "+assemblyPreview.bodies+" exact visible components. Their current spacing is preserved; one orientation applies to the complete layout. Check interference, bed contact and support needs. CAD histories and mates remain in the source assembly.":"Choose the base plane and printer volume. STL, 3MF and AMF exports use this orientation and placement.",fields:[
    {key:"basePlane",label:"Base plane",type:"select",value:saved.basePlane || "top",choices:[{value:"top",label:"Top (X · Z)"},{value:"front",label:"Front (X · Y)"},{value:"right",label:"Right (Z · Y)"}]},
    {key:"bedWidthMm",label:"Bed width (mm)",type:"number",value:saved.bedWidthMm || 220,min:1,max:100000},
    {key:"bedDepthMm",label:"Bed depth (mm)",type:"number",value:saved.bedDepthMm || 220,min:1,max:100000},
    {key:"bedHeightMm",label:"Build height (mm)",type:"number",value:saved.bedHeightMm || 250,min:1,max:100000}
  ],onLive:show,onApply:function(values){
    try{
      if(assemblyPreview){
        if(E.docType!=="assembly" || E.assembly!==printDocument || sourceStamp!==JSON.stringify(assemblyPrintRequests()))throw new Error("Assembly changed; reopen Print setup");
        var ext=assemblyPreview.orientations[values.basePlane],limits=[values.bedWidthMm,values.bedDepthMm,values.bedHeightMm].map(Number);
        if(!ext || limits.some(v=>!Number.isFinite(v)||v<=0||v>100000))throw new Error("Enter positive print-bed dimensions in millimeters");
        if([ext.widthMm,ext.depthMm,ext.heightMm].some((v,i)=>v>limits[i]+.001))throw new Error("Part exceeds the selected print-bed size in this orientation");
      }else prepareNativePrintPositions(mesh.positions,values);
    }catch(error){flash(error.message,4000);return false;}
    pushUndo("Print setup");printDocument.printSetup=cloneData(values);flash("Print setup saved for STL, 3MF and AMF");return true;
  }});
  if(inputs){var actions=root.querySelector("#mdQuickSettings .md-feature-actions");actions?.before(preview);show(Object.fromEntries(Object.entries(inputs).map(function(pair){return [pair[0],pair[1].value];})));}
}

function applyPrintMeshExportSettings(settings) {
  // Tessellation preferences change the output mesh, not the native solid.
  // Retain only a run that was already current before this metadata edit.
  var currentNative=exactRunIsCurrent();
  pushUndo("Print mesh export settings");E.def.stlExportSettings=settings;
  if(currentNative)E.brepStamp=exactRunStamp();
}

function openStlExportForm(format) {
  if(E.docType!=="part" && E.docType!=="assembly")return;
  format=format==="3mf" || format==="amf" ? format : "stl";
  var printDocument=E.docType==="assembly"?E.assembly:E.def,saved=printDocument.stlExportSettings || {},inputs;
  inputs=openQuickForm({action:"stlexport",icon:"ph-printer",title:format.toUpperCase()+" export",hint:format!=="stl" ? format.toUpperCase()+" includes millimeter units and a closed mesh in Z-up print coordinates. Smaller deviation and angle preserve curved surfaces with more triangles." : "STL coordinates are millimeters. Smaller deviation and angle preserve curved surfaces with more triangles. Export requires a closed native solid.",fields:[
    {key:"quality",label:"Resolution",type:"select",value:saved.quality || "fine",choices:[{value:"coarse",label:"Coarse"},{value:"fine",label:"Fine"},{value:"custom",label:"Custom"}]},
    {key:"deviationMm",label:"Deviation (mm)",type:"number",value:saved.deviationMm ?? 0.01,min:0.0001,max:100,step:0.001},
    {key:"angleDegrees",label:"Angle (degrees)",type:"number",value:saved.angleDegrees ?? 5,min:0.1,max:45,step:0.1}
  ],onLive:function(values){
    ["deviationMm","angleDegrees"].forEach(function(key){var wrap=inputs?.[key]?.closest(".md-quick-field");if(wrap)wrap.classList.toggle("parameter-hidden",values.quality!=="custom");});
  },onApply:function(values){
    if((E.docType==="assembly"?E.assembly:E.def)!==printDocument)return false;
    var settings={quality:values.quality,deviationMm:Number(values.deviationMm),angleDegrees:Number(values.angleDegrees)};
    if(printDocument.printSetup)settings.printSetup=cloneData(printDocument.printSetup);
    try{stlMeshOptions(settings);}catch(error){flash(error.message,4000);return false;}
    if(E.docType==="assembly")return exportAssemblyPrintDocument(settings,format,printDocument);
    applyPrintMeshExportSettings(settings);
    if(format!=="stl")exportThreeMfDocument(settings,format);else exportStlDocument(settings);return true;
  }});
  if(inputs?.quality)inputs.quality.dispatchEvent(new Event("input",{bubbles:true}));
}

async function exportStlDocument(settings,unqualifiedDraft) {
  if (E.docType !== "part") return;
  if (!standardsGate("STL export",{unqualifiedDraft:unqualifiedDraft===true,onDraft:function(){exportStlDocument(settings,true);}})) return;
  var run = exactRunIsCurrent() ? E.brepRun : await regenerateExactModel();
  if (!run || !run.ok || !run.finalShape) return;
  try {
    var name = (E.def.name || "model")+(unqualifiedDraft===true?"__UNQUALIFIED_DRAFT":"");
    var bytes = await exportBinaryStl(run.finalShape, name, settings);
    downloadBytes(bytes, name + ".stl", "model/stl");
    flash("✓ " + t("stlExported"));
  } catch (error) { flash(t("errStl") + ": " + String(error.message || error)); }
}

function downloadBytes(bytes, name, type) {
  var blob = new Blob([bytes], {type:type}), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = String(name).replace(/[^a-z0-9_.-]+/gi, "_");
  a.hidden = true; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

function openOffsetPlaneForm(existing) {
  var selectedFace=(E.topologySelection || []).find(function(face){return face.kind==="face" && face.descriptor?.surface==="plane";});
  var selectedVertex=(E.topologySelection || []).find(function(item){return item.kind==="vertex";});
  // A retained viewport selection is a suggestion for a new plane only. When
  // editing, keep the plane's own parent instead of silently reattaching it to
  // whichever face happens to be selected (and moving all dependent sketches).
  var support=existing ? existing.support : selectedFace;
  var replacementFace=existing && selectedFace && selectedFace.persistentId!==support?.persistentId ? selectedFace : null;
  var throughVertex=existing ? existing.throughVertex : selectedVertex;
  var throughEdges=existing?.throughEdges;
  var angleAxis=existing?.angleAxis || (E.topologySelection || []).find(function(item){return item.kind==="edge" && (item.descriptor?.curve==="line" || item.descriptor?.endpoints?.length===2);});
  var angleOrigin=existing?.angleOrigin || {x:0,y:0,z:0};
  var angleDirection=existing?.angleDirection || {x:1,y:0,z:0};
  var selectedVertices=(E.topologySelection || []).filter(function(item){return item.kind==="vertex";});
  var threePoints=existing?.threePoints || (selectedVertices.length>=3 ? selectedVertices.slice(0,3) : null);
  var planes=(E.def.references || []).filter(function(r){return r.type==="plane" && r.id!==existing?.id;});
  var initialMode=existing?.refType==="angle" ? "angle" : existing?.refType==="three-points" || (!existing && threePoints) ? "three-points" : existing?.refType==="through-vertex-parallel" || throughVertex ? "through-vertex" : "offset";
  var inputs=openQuickForm({action:"offsetplane",icon:"ph-square",title:existing?"Edit reference plane":t("refPlane"),hint:"Define a plane by an offset, vertex, three points, or a rotation around an axis in its parent plane. Dependent sketches follow edits.",fields:[
    {key:"name",label:"Plane name",type:"text",value:existing?.name || "Plane "+((E.def.referenceGeometry || []).length+1)},
    {key:"mode",label:t("refPlaneMode"),type:"select",value:initialMode,choices:[
      {value:"offset",label:t("refPlaneOffset")},
      {value:"through-vertex",label:t("refPlaneThroughVertex")},
      {value:"three-points",label:"Through three points"},
      {value:"angle",label:"Angle around axis"}
    ]},
    {key:"parent",label:"Parent plane",type:"select",value:support?"selected-face":existing?.baseReferenceId || E.selectedReferenceId || "plane:top",choices:[...(support?[{value:"selected-face",label:"Selected planar face"}]:[]),...(replacementFace?[{value:"replacement-face",label:"Selected planar face (change support)"}]:[]),...planes.map(function(r){return {value:r.id,label:r.name || r.id};})]},
    /* SOLIDWORKS states an offset plane as a positive distance plus Flip offset
       (HOUSING's ThreadPlane: .125 in, flipped into the part). The stored offset
       stays signed along the parent's normal, so an existing plane shows its
       size here and Flip carries the sign. */
    {key:"offset",label:"Offset distance",type:"number",unit:"length",value:Math.abs(existing?.offset ?? 1.27),step:.01},
    {key:"flip",label:t("refPlaneFlipOffset"),type:"boolean",value:Number(existing?.offset)<0},
    {key:"count",label:"Planes to create",type:"number",value:1,min:1,max:20,step:1},
    {key:"angle",label:"Rotation angle",type:"number",unit:"angle",value:existing?.angle ?? 48,step:1},
    {key:"angleAxis",label:"Rotation axis",type:"select",value:angleAxis?"selected-edge":angleDirection.y?"y":angleDirection.z?"z":"x",choices:[...(angleAxis?[{value:"selected-edge",label:"Selected straight edge"}]:[]),{value:"x",label:"X axis"},{value:"y",label:"Y axis"},{value:"z",label:"Z axis"}]},
    {key:"axisx",label:"Axis origin X",type:"number",unit:"length",value:angleOrigin.x,step:.01},
    {key:"axisy",label:"Axis origin Y",type:"number",unit:"length",value:angleOrigin.y,step:.01},
    {key:"axisz",label:"Axis origin Z",type:"number",unit:"length",value:angleOrigin.z,step:.01}
  ].concat(threePointCoordinateFields(threePoints || selectedVertices)),onLive:function(values){
    var offsetWrap=inputs && inputs.offset && inputs.offset.closest(".md-quick-field");
    var countWrap=inputs && inputs.count && inputs.count.closest(".md-quick-field");
    var noOffset=values.mode==="through-vertex" || values.mode==="three-points" || values.mode==="angle";
    if(offsetWrap)offsetWrap.classList.toggle("parameter-hidden",noOffset);
    if(countWrap)countWrap.classList.toggle("parameter-hidden",noOffset);
    THREE_POINT_KEYS.forEach(function(key){var wrap=inputs && inputs[key] && inputs[key].closest(".md-quick-field");if(wrap)wrap.classList.toggle("parameter-hidden",values.mode!=="three-points");});
    ["angle","angleAxis","axisx","axisy","axisz"].forEach(function(key){var wrap=inputs && inputs[key] && inputs[key].closest(".md-quick-field");if(wrap)wrap.classList.toggle("parameter-hidden",values.mode!=="angle" || (key.startsWith("axis") && values.angleAxis==="selected-edge"));});
  },onApply:function(values){
    var trial=cloneData(E.def),parent=values.parent,through=values.mode==="through-vertex",three=values.mode==="three-points",angled=values.mode==="angle",count=existing || through || three || angled?1:Math.max(1,Math.min(20,Math.round(values.count))),last;
    var binding=through?throughVertexBinding(throughVertex, topologyEntriesForPart(selectedSolid())):null;
    if(through && !binding && !throughEdges){flash(t("needVertex"));return false;}
    var typedPoints=three?threePointsFromFields(values,threePoints || selectedVertices):null;
    if(three && !typedPoints){flash("Give three points: pick model vertices or type their X, Y and Z");return false;}
    trial.references ||= [];trial.referenceGeometry ||= [];
    for(var i=0;i<count;i++){
      var plane=existing?trial.references.find(function(r){return r.id===existing.id;}):{...createReferencePlane(),id:"plane_"+uid(),type:"plane"};
      plane.name=values.name+(count>1?" "+(i+1):"");delete plane.support;delete plane.baseReferenceId;delete plane.throughVertex;delete plane.throughEdges;delete plane.threePoints;delete plane.angle;delete plane.angleAxis;delete plane.angleOrigin;delete plane.angleDirection;
      if(parent==="selected-face")plane.support=cloneData(support);
      else if(parent==="replacement-face")plane.support=cloneData(replacementFace);
      else plane.baseReferenceId=parent;
      if(angled){
        plane.refType="angle";plane.angle=Number(values.angle);plane.offset=0;
        if(values.angleAxis==="selected-edge")plane.angleAxis=cloneData(angleAxis);
        else {plane.angleDirection={x:values.angleAxis==="x"?1:0,y:values.angleAxis==="y"?1:0,z:values.angleAxis==="z"?1:0};plane.angleOrigin={x:Number(values.axisx),y:Number(values.axisy),z:Number(values.axisz)};}
      }else if(three){
        plane.refType="three-points";plane.offset=0;
        plane.threePoints=typedPoints;
      }else if(through){
        plane.refType="through-vertex-parallel";
        if(binding){plane.throughVertex=cloneData(binding.throughVertex);if(binding.throughEdges.length>=2)plane.throughEdges=cloneData(binding.throughEdges);}
        else {plane.throughVertex=cloneData(throughVertex);if(throughEdges)plane.throughEdges=cloneData(throughEdges);}
      }else{
        var flipped=values.flip===true||values.flip==="true"||values.flip==="on";
        plane.offset=referencePlaneOffset(values.offset,flipped);plane.refType="offset";
      }
      if(!existing){trial.references.push(plane);trial.referenceGeometry.push({...cloneData(plane),type:"reference_plane"});}
      parent=plane.id;last=plane;
    }
    var run=resolveOffsetPlanes(trial, function(ref){
      if(!ref)return null;
      return (topologyEntriesForPart(selectedSolid()) || []).find(function(item){
        return item.persistentId===ref.persistentId || (ref.semantic && item.semantic===ref.semantic && item.kind===(ref.kind||item.kind));
      });
    });if(!run.ok){flash(run.issues[0].message);return false;}
    pushUndo(existing?"Edit reference plane":"Reference planes");E.def.references=trial.references;E.def.referenceGeometry=trial.referenceGeometry;E.def.sketches=trial.sketches;E.selectedReferenceId=last.id;
    syncSketchDrivenParts();if(activeParts(E.def).length)regenerateExactModel();refreshAll();return true;
  }});
  if(inputs && inputs.mode)inputs.mode.dispatchEvent(new Event("input",{bubbles:true}));
}

function threePointCoordinateFields(picked) {
  var fields=[];
  [1,2,3].forEach(function(n){
    var seed=picked && picked[n-1] ? vertexPointOf(picked[n-1]) : {x:0,y:0,z:0};
    ["x","y","z"].forEach(function(axis){
      fields.push({key:"p"+n+axis,label:"Point "+n+" "+axis.toUpperCase(),type:"number",unit:"length",value:seed[axis],step:.01});
    });
  });
  return fields;
}
function threePointsFromFields(values, picked) {
  var out=[];
  for(var i=0;i<3;i++){
    var n=i+1,point={x:Number(values["p"+n+"x"]),y:Number(values["p"+n+"y"]),z:Number(values["p"+n+"z"])};
    if(![point.x,point.y,point.z].every(Number.isFinite))return null;
    var vertex=picked && picked[i];
    var seed=vertex?vertexPointOf(vertex):null;
    if(vertex && Math.hypot(point.x-seed.x,point.y-seed.y,point.z-seed.z)<1e-6){
      out.push(cloneData({ownerFeatureId:vertex.ownerFeatureId,persistentId:vertex.persistentId,kind:"vertex",semantic:vertex.semantic,descriptor:{...(vertex.descriptor||{}),point:seed}}));
    }else out.push({kind:"vertex",descriptor:{point:point}});
  }
  return out;
}

function vertexPointOf(vertex) {
  var d = vertex && (vertex.descriptor || vertex) || {};
  var p = d.point || d.origin || vertex;
  return {x:Number(p.x) || 0, y:Number(p.y) || 0, z:Number(p.z) || 0};
}

/* Coordinate system: an origin (a picked model vertex, or typed) and three axes
   that may each be reversed - what SOLIDWORKS asks for in Reference Geometry >
   Coordinate System. Mass properties can then be reported relative to it. */
function openCoordinateSystemForm() {
  if (E.docType !== "part") return;
  var vertex=(E.topologySelection || []).find(function(item){return item.kind==="vertex";});
  var seed=vertex?vertexPointOf(vertex):{x:0,y:0,z:0};
  var n=(E.def.referenceGeometry || []).filter(function(r){return r.type==="coordinate_system";}).length+1;
  openQuickForm({action:"coordsys",icon:"ph-arrows-out-cardinal",title:t("refCoord"),hint:vertex?"Origin taken from the selected vertex":"Type the origin, or select a vertex first",fields:[
    {key:"name",label:"Name",type:"text",value:"Coordinate System"+n},
    {key:"ox",label:"Origin X",type:"number",unit:"length",value:seed.x,step:.01},
    {key:"oy",label:"Origin Y",type:"number",unit:"length",value:seed.y,step:.01},
    {key:"oz",label:"Origin Z",type:"number",unit:"length",value:seed.z,step:.01},
    {key:"rx",label:"Reverse X axis",type:"boolean",value:false},
    {key:"ry",label:"Reverse Y axis",type:"boolean",value:false},
    {key:"rz",label:"Reverse Z axis",type:"boolean",value:false}
  ],onApply:function(values){
    var sign=function(flag){return (flag===true||flag==="true"||flag==="on")?-1:1;};
    pushUndo(t("addRefGeom"));
    var item=createCoordinateSystem({name:values.name,origin:{x:Number(values.ox),y:Number(values.oy),z:Number(values.oz)},
      xAxis:{x:sign(values.rx),y:0,z:0},yAxis:{x:0,y:sign(values.ry),z:0},zAxis:{x:0,y:0,z:sign(values.rz)}});
    E.def.referenceGeometry ||= [];E.def.references ||= [];
    E.def.referenceGeometry.push(item);
    E.def.references.push(Object.assign({},cloneDomain(item),{type:"coordinate-system"}));
    refreshAll();flash("✓ "+item.name);
    return true;
  }});
}

function addReferenceGeometry(kind) {
  if (E.docType !== "part") return;
  E.def.referenceGeometry ||= [];
  var face = kind === "plane" ? (E.topologySelection || []).find(function (reference) { return reference.kind === "face"; }) : null;
  var descriptor = face && face.descriptor || {};
  if (kind === "plane" && face && descriptor.surface && descriptor.surface !== "plane") {
    flash(t("needPlanarFace"));
    return;
  }
  pushUndo(t("addRefGeom"));
  var n = E.def.referenceGeometry.length + 1;
  var item;
  if (kind === "plane" && face && (!descriptor.surface || descriptor.surface === "plane")) {
    item = createReferencePlane({
      name: t("refPlane") + " " + n,
      origin: descriptor.origin || { x: 0, y: 0, z: 0 },
      normal: descriptor.normal || { x: 0, y: 1, z: 0 },
      refType: "on-face",
    });
    item.support = cloneData(face);
  } else if (kind === "plane") {
    item = createReferencePlane({ name: t("refPlane") + " " + n, origin: { x: 0, y: E.baseOff, z: 0 } });
  } else if (kind === "helix") {
    item = createHelix({ name: t("opHelix") + " " + n, radius: 1, pitch: 0.125, turns: 4, height: 0.5 });
  } else if (kind === "axis") {
    item = createReferenceAxis({ name: t("refAxis") + " " + n });
  } else if (kind === "point") {
    var picked = (E.topologySelection || []).find(function (reference) { return reference.kind === "vertex"; });
    item = createReferencePoint({ name: "Ref point " + n, origin: cloneData(picked?.descriptor?.point || picked?.descriptor?.origin || { x: 0, y: 0, z: 0 }) });
  } else {
    item = createCoordinateSystem({ name: t("refCoord") + " " + n });
  }
  E.def.referenceGeometry.push(item);
  E.def.references ||= [];
  if(kind==="plane")E.def.references.push(Object.assign({},cloneDomain(item),{type:"plane"}));
  else if(kind==="axis")E.def.references.push({id:item.id,type:"axis",name:item.name,origin:cloneData(item.p1),direction:{x:item.p2.x-item.p1.x,y:item.p2.y-item.p1.y,z:item.p2.z-item.p1.z},refType:item.refType});
  else if(kind==="point")E.def.references.push({id:item.id,type:"point",name:item.name,origin:cloneData(item.origin)});
  else if(kind==="helix")E.def.references.push(Object.assign({},cloneDomain(item),{type:"helix"}));
  else E.def.references.push(Object.assign({},cloneDomain(item),{type:"coordinate-system"}));
  refreshAll(); flash("✓ " + item.name);
}

/* ---- the non-modal evaluate card ----
   One floating card over the viewport, claimed by one owner at a time. It is
   deliberately NOT #mdReport: an answer you asked the model for has to be
   readable while you keep turning the model. */
function openEvalCard(owner, kicker, title) {
  var host = root && root.querySelector("#mdEvalCard");
  if (!host) return null;
  E.evalCard = owner;
  var kickerEl = root.querySelector("#mdEvalKicker"); if (kickerEl) kickerEl.textContent = kicker;
  var titleEl = root.querySelector("#mdEvalTitle"); if (titleEl) titleEl.textContent = title;
  var body = root.querySelector("#mdEvalBody"), actions = root.querySelector("#mdEvalActions");
  if (body) body.innerHTML = "";
  if (actions) { actions.innerHTML = ""; actions.hidden = true; }
  host.hidden = false;
  return body;
}

function evalCardActions() {
  var actions = root && root.querySelector("#mdEvalActions");
  if (actions) actions.hidden = false;
  return actions;
}

export {
  abandonDocumentExactWork, addReferenceGeometry, downloadBytes,
  evalCardActions, exactRunIsCurrent, exactRunStamp, exportIgesDocument,
  exportStepDocument, openCoordinateSystemForm, openEvalCard,
  openFffSlicePreview, openOffsetPlaneForm, openPrintLayerAnalysis,
  openPrintSetupForm, openStlExportForm, rebuildFailureMessage,
  rebuildFeatureTreeFromDocument, regenerateExactModel, releaseExactRun,
  scheduleExactRestore,
};

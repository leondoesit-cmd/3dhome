/* The CAD editor's document type switching and saving, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { releaseRegeneration } from "../cad_feature_tree.js";
import { shapeToMeshData } from "../cad_kernel.js";
import { flattenAssembly } from "../core/assembly_structure.js";
import { regenerateInCadWorker as regenerateFeatures } from "../core/cad_worker_client.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { tessellateParts } from "../core/part_tessellate.js";
import { commitDefinition } from "../core/project.js";
import { getLang } from "../i18n.js";
import { refreshCatalogSelect } from "../model_catalog.js";
import { VIEW_PRESETS } from "../modeler_chrome.js";
import { cloneData } from "../modeler_part_geometry.js";
import { t } from "../modeler_strings.js";
import { thinExtrudeSketchReadiness } from "../modeler_thin_extrude_profiles.js";
import { syncCommandManager, syncContextActions } from "../modeler/command_manager.js";
import { rejectFlexibleSpringPreview } from "../modeler/component_mates.js";
import { assemblySaveSession, documentDirty, markDocumentClean, syncDirty, syncDraftStatus } from "../modeler/document_history.js";
import { saveModel } from "../modeler/document_io.js";
import { closeEvalCard } from "../modeler/document_outputs.js";
import { drawingDocument, flash, report, sketchProfileAnalysis, sketchRegionAnalysis } from "../modeler/drawing_sheet.js";
import { saveAssemblyDocument } from "../modeler/editor_forms.js";
import { abandonDocumentExactWork } from "../modeler/export_measure.js";
import { cutTargetFeatureId } from "../modeler/feature_create.js";
import { applyAssemblyMates, invalidateInterference, saveLib } from "../modeler/library_assembly_state.js";
import { refreshLib, setMode, syncHead } from "../modeler/library_io.js";
import { activeParts, componentDef, loadLib, newAssembly, normalizeDef } from "../modeler/library_store.js";
import { syncNotesToolbar, syncPaintToolbar } from "../modeler/notes_markups.js";
import { selEntities, syncHint, syncStatus } from "../modeler/sketch_entities.js";
import { activeTab, setCommandTab, setTab, syncInspectorTabLabels, syncNormalToControls } from "../modeler/sketch_workflow.js";
import { finishContextPart } from "../modeler/tree_assembly.js";
import { fitPreview } from "../modeler/view_modes.js";
import { registerCustomModel } from "../modeler/viewport_decorations.js";
import { markDirty as markPlannerDirty } from "../persist.js";
import { render2D } from "../plan2d.js";
import { ensureSketch } from "../sketch_solver.js";
import { S, uid } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, documentSaveTasks, motionPlaybackCancel, partHistoryMarker, refreshAll,
  root,
} from "../modeler.js";

function setDocumentType(type) {
  type = type === "assembly" ? "assembly" : "part";
  if(type==="assembly" && E.contextEdit){finishContextPart();return;}
  if (type === E.docType) return;
  E.quickFormInstance?.dismiss(true);
  abandonDocumentExactWork();
  closeEvalCard();
  E.docType = type;
  E.poly = null;
  E.wallPts = null;
  E.drag = null;
  E.sel = null;
  E.ssel = [];
  E.topologySelection = [];
  E.facePick = null;
  E.sketchCameraReturnPose = null;
  E.arcPts = null;
  E.componentSel = [];
  invalidateInterference();
  E.dependencyHighlight = null;
  if (type === "assembly" && !E.assembly) {
    E.assembly = newAssembly();
    markDocumentClean();
  }
  root.classList.toggle("md-assembly", type === "assembly");
  // the two document shapes draw different trees; a row id from one of them
  // means nothing in the other
  E.treeState = {};
  E.treeModel = null;
  syncInspectorTabLabels();
  /* The sketch pane has nothing to show for an assembly and is hidden there, so
     do not leave the strip pointing at a tab that is no longer in it. */
  if (type === "assembly" && activeTab("R") === "sketch") setTab("shape");
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-doc") === type);
  });
  if (type === "assembly") { setMode("3d"); setCommandTab("assembly"); setTab("parts"); }
  else { setMode("3d"); setCommandTab("features"); }
  syncHead();
  refreshLib();
  refreshAll();
  syncDirty();
  fitPreview();
}

// A room object is a reusable snapshot; the complete editable assembly is kept
// alongside it so publication never discards the component feature histories.
async function publishAssemblyModel() {
  if(rejectFlexibleSpringPreview())return;
  if (!E.assembly?.components?.length) { flash(t("needParts")); return; }
  applyAssemblyMates(E.assembly);
  var source=cloneData(E.assembly), parts=[];
  try {
    // every part occurrence, sub-assemblies included, at its composed pose
    for (var occurrence of flattenAssembly(source,{visibleOnly:true})) {
      var component=occurrence.component;
      var def=componentDef(component), run=null;
      if(!def)throw new Error("A component is missing from the library");
      try {
        if(def.metadata?.authoringSystem==="parametric-v1") {
          var compiled=compileKernelFeatureTree(def);
          if(!compiled.ok)throw new Error("A component feature history needs repair");
          run=await regenerateFeatures({...compiled.document,features:compiled.features});
          if(!run.ok)throw new Error("A component could not rebuild");
        }
        var place=occurrence.placement, matrix=new THREE.Matrix4().makeBasis(
          new THREE.Vector3(place.x.x,place.x.y,place.x.z),new THREE.Vector3(place.y.x,place.y.y,place.y.z),new THREE.Vector3(place.z.x,place.z.y,place.z.z))
          .setPosition(place.origin.x,place.origin.y,place.origin.z);
        for(var part of activeParts(def)) {
          var body=run?.results.get(cutTargetFeatureId(part,def));
          var mesh=body?.shape ? await shapeToMeshData(body,{deflection:.28,angle:.18}) :
            {positions:tessellateParts([part])[0]?.positions};
          if(!mesh.positions?.length)throw new Error("A component has no usable solid geometry");
          var positions=Array.from(mesh.positions), point=new THREE.Vector3();
          for(var at=0;at<positions.length;at+=3){point.fromArray(positions,at).applyMatrix4(matrix);point.toArray(positions,at);}
          parts.push({id:uid(),kind:"mesh",name:(component.name || def.name)+" · "+(part.name || "body"),
            color:part.color || "#999999",metal:part.metal,rough:part.rough,
            meshData:{positions,indices:mesh.indices ? Array.from(mesh.indices):undefined}});
        }
      } finally {if(run)releaseRegeneration(run);}
    }
    // Rebuildable preview caches can dwarf the authored history and would be
    // copied into every room undo entry. Preserve inputs, not derived caches.
    flattenAssembly(source).forEach(function(occurrence){
      var definition=occurrence.component.def;
      if(definition?.metadata?.authoringSystem!=="parametric-v1")return;
      function stripDerived(value) {
        if(!value || typeof value!=="object")return;
        delete value.exactTopologyCache;delete value.meshData;delete value.exactBuildToken;
        Object.values(value).forEach(stripDerived);
      }
      stripDerived(definition);
    });
    var model={key:"cm_"+source.key,name:source.components.map(c=>c.name || componentDef(c)?.name || "Component").join(" + "),
      parts,metadata:{sourceAssembly:source},col:"#999999"};
    normalizeDef(model);
    if(!await saveLib(model,{expected:loadLib().find(m=>m.key===model.key) || null}))throw new Error(t("saveStorageFull"));
    registerCustomModel(model);refreshCatalogSelect();
    var committed=commitDefinition(S,model);
    if(committed.affected.length){markPlannerDirty();S.dirty3D=true;render2D();}
    flash(getLang()==="en"?"✓ Combined model saved to room library":"✓ המודל המשולב נשמר בספרייה");
  } catch(error) {report(t("reportKickerSave"),t("saveRebuildFailed"),String(error.message || error));}
}

function saveProgress(key, document) {
  if(document !== (E.docType === "assembly" ? E.assembly : E.def))return;
  var save=root && root.querySelector("#mdSave");
  if(save){save.setAttribute("aria-busy","true");save.dataset.savePhase=key;}
  syncDraftStatus(key);flash(t(key));
}
function saveCurrentDocument() {
  if(motionPlaybackCancel){flash("Keep current pose or cancel the motion preview before saving.");return Promise.resolve();}
  var document=E.docType === "assembly" ? E.assembly : E.def;
  if(!document)return Promise.resolve();
  var activeOwner=function(){return E.docType==="assembly" ? assemblySaveSession(E.assembly) : E.contextEdit ? E.def : partHistoryMarker;};
  var taskOwner=activeOwner();
  var pending=documentSaveTasks.get(taskOwner);
  if(pending)return pending;
  saveProgress("savePreparing",document);
  var task=Promise.resolve(E.docType === "assembly" ? saveAssemblyDocument() : saveModel()).catch(function(error){
    if(taskOwner === activeOwner())
      report(t("reportKickerSave"),t("saveLibraryFailed"),String(error.message || error));
  }).finally(function(){
    documentSaveTasks.delete(taskOwner);
    var active=activeOwner();
    if(documentSaveTasks.has(active))return;
    var save=root && root.querySelector("#mdSave");
    if(save){save.removeAttribute("aria-busy");delete save.dataset.savePhase;}
    if(taskOwner===active && documentDirty())syncDraftStatus("saveStillUnsaved");
  });
  documentSaveTasks.set(taskOwner,task);
  return task;
}

function syncViewButtons() {
  var projectionButton=root.querySelector('#mdPerspectiveView');
  if(projectionButton){var perspective=!E.pv||(!E.pv.fixedFrame&&E.pv.getProjection()==='perspective');projectionButton.classList.toggle('on',perspective);projectionButton.setAttribute('aria-pressed',String(perspective));projectionButton.disabled=!!E.pv?.fixedFrame;projectionButton.title=E.pv?.fixedFrame?'Normal To uses orthographic projection; orbit preference is retained':'Toggle perspective / orthographic orbit projection';}
  var active = E.view;
  if (E.mode === "3d" && E.pv) {
    var preset = !E.pv.fixedFrame && VIEW_PRESETS.find(function (item) {
      return item.az != null && Math.abs(Math.atan2(Math.sin(E.pv.az-item.az), Math.cos(E.pv.az-item.az))) < 0.001 && Math.abs(E.pv.el-item.el) < 0.001;
    });
    active = preset ? (preset.id === "right" ? "side" : preset.id) : null;
  }
  root.querySelectorAll("[data-view]").forEach(function (button) {
    var selected = button.getAttribute("data-view") === active;
    button.classList.toggle("on", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function syncTools() {
  root.querySelectorAll("[data-tool]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-tool") === E.tool);
  });
  syncViewButtons();
  syncNormalToControls();
  var sheetTool = E.mode === "drawing" && E.sheet ? E.sheet.getTool() : null;
  var hiddenButton = root.querySelector("#mdSheetHidden");
  if (hiddenButton && E.mode === "drawing") {
    var showsHidden = drawingDocument().showHidden !== false;
    hiddenButton.classList.toggle("on", showsHidden);
    hiddenButton.setAttribute("aria-pressed", showsHidden ? "true" : "false");
  }
  root.querySelectorAll("[data-drawing-tool]").forEach(function (b) {
    b.classList.toggle("on", b.getAttribute("data-drawing-tool") === sheetTool);
    b.setAttribute("aria-pressed", b.getAttribute("data-drawing-tool") === sheetTool ? "true" : "false");
  });
  root.classList.toggle("md-tool-dim", E.mode === "drawing" && sheetTool !== "select");
  var paintBar = root.querySelector("#mdPaintToolbar");
  if (paintBar) {
    var showPaint = E.tool === "paint";
    paintBar.hidden = !showPaint;
    if (showPaint) syncPaintToolbar();
  }
  var notesBar = root.querySelector("#mdNotesToolbar");
  if (notesBar) {
    var showNotes = E.tool === "note" && E.mode !== "drawing";
    notesBar.hidden = !showNotes;
    if (showNotes) syncNotesToolbar();
  }
  syncHint();
  syncStatus();
  syncExtrudeButton();
  syncCommandManager();
  syncContextActions();
}

/* Whether the sketch currently offers a profile changes with almost every edit,
   not just with the active tool — so this is its own sync, called from
   refreshAll as well as from the toolbar. */
function syncExtrudeButton() {
  if (!root) return;
  var profileInfo = E.docType === "part" ? sketchProfileAnalysis() : {profiles:[],openEnds:[],branchPoints:[]};
  // A sketch whose shapes only close by crossing each other has no chain
  // profile and still encloses area, so the button follows the areas.
  var regionCount = E.docType === "part" ? (sketchRegionAnalysis().regions || []).length : 0;
  var available = E.docType === "part" && (!!profileInfo.profiles.length || regionCount > 0);
  var pathReady=E.docType === "part" && !available ? sketchOpenPathReadiness(ensureSketch(E.def)) : null;
  var why = available ? t("profileReady") + (regionCount > 1 ? " · " + regionCount + " " + t("profileRegions") : "")
    : pathReady ? t(pathReady.kind === "thin" ? "profileThinReady" : "profileOpenPath")
    : profileInfo.branchPoints.length ? t("profileBranched")
    : profileInfo.openEnds.length ? t("profileOpen") + " · " + profileInfo.openEnds.length + " " + t("profileEnds")
    : t("profileEmpty");
  // the ribbon's Extrude is now the only one, so it carries the readiness state
  root.querySelectorAll('[data-command="extrude"]').forEach(function (button) { button.title = why; });
  syncCommandManager();
}

function sketchOpenPathReadiness(sketch) {
  var authoring=E.authoring || {},type=authoring.featureType;
  var state=authoring.featureEdit
    ? (E.def.features || []).find(function(feature){return feature.id===authoring.editFeatureId;})
    : authoring.featurePreviewState;
  return thinExtrudeSketchReadiness(sketch,{type:type,params:state && state.params,
    selectedIds:(state && state.thinChainKeys || E.sselAuto) ? [] : selEntities().map(function(entity){return entity.id;}),
    chainKeys:state && state.thinChainKeys || [],features:E.def.features || []});
}

export {
  publishAssemblyModel, saveCurrentDocument, saveProgress, setDocumentType,
  sketchOpenPathReadiness, syncExtrudeButton, syncTools, syncViewButtons,
};

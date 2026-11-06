/* The CAD editor's FeatureManager tree, rollback bar and diagnostics, split out
   of js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { createAppearanceOverride, upsertAppearanceOverride } from "../cad_appearances.js";
import { reorderFinishFeature } from "../cad_finish_reorder.js";
import { assemblyDependencyGraph, dependencyVisualization, partDependencyGraph } from "../core/dependency_visualization.js";
import { verifiedExactTopology } from "../core/exact_topology_cache.js";
import { featureTreeContext } from "../core/feature_browse.js";
import { isKernelBody } from "../core/kernel_body.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { analyzeLegacyMigration, convertLegacyDocument, evaluateMigration, migrationGeometrySummary, restoreLegacyDocument, retainLegacySource } from "../core/migration_check.js";
import { ensureParametricDocument, removeHistoryNode, reorderHistoryNode, setHistoryRollback, suppressHistoryNode, updateFeatureDefinition } from "../core/parametric_document.js";
import { rebuildParametricDocument } from "../core/parametric_rebuild.js";
import { rebuildDefinition } from "../core/rebuild.js";
import { copySketchForClipboard, pasteSketchGeometry, readSketchClipboard, writeSketchClipboard } from "../core/sketch_clipboard.js";
import { buildTreeModel, findTreeNode, folderMemberIds } from "../core/tree_model.js";
import { renderDependencyPresentation } from "../modeler_dependency_ui.js";
import { cadIcon } from "../modeler_icons.js";
import { cloneData, partNeedsExactMesh } from "../modeler_part_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { renderTreeModel } from "../modeler_tree.js";
import { parametricRollbackBar, refreshParts, rollbackBar, runDiagnosticAction } from "../modeler/component_mates.js";
import { flash } from "../modeler/drawing_sheet.js";
import { btn, el, namedButton } from "../modeler/editor_dom.js";
import { openOffsetPlaneForm } from "../modeler/export_measure.js";
import { activeLoftCreation, cutTargetFeatureId } from "../modeler/feature_create.js";
import { patternMergePreviewBadge } from "../modeler/finish_preview.js";
import { modelParameterOverrides } from "../modeler/inspector.js";
import { markLiveDirtyPart, refreshLivePreview } from "../modeler/library_panel.js";
import { featureTypeLabel, livePreviewParts } from "../modeler/library_store.js";
import { resolveSketch } from "../modeler/sketch_entities.js";
import { chooseSketchReference, closeFeaturePanel, isCanonicalAuthoring, modelLengthText, modelLengthUnit, orientModelToView, referencePlaneView, syncModelPlane } from "../modeler/sketch_workflow.js";
import { clearLiveDownstream, downstreamFeaturesOf, editSketchFromHistory, featureRebuildNeedsKernel, liveDownstreamIsLive, liveFeatureEditBadge, partsForFeature, syncLiveDownstreamBadge, syncProjectionFromFeature } from "../modeler/tree_assembly.js";
import { consumedSketchIds, refreshViewportSelection } from "../modeler/viewport_decorations.js";
import { ensureSketch, ensureSketchDoc, removeSketch, solveSketch } from "../sketch_solver.js";
import { uid } from "../state.js";
import {
  E, H, PATTERN_MERGE_PREVIEW_DELAY, currentHistoryNode, openFeatureEditor,
  pushUndo, queueExactMesh, refreshAll, root, scheduleExactMesh,
  scheduleModelerDraft,
} from "../modeler.js";

function runLiveDownstream(features,token) {
  // superseded by a newer tick: drop it before it touches the scene
  if(!liveDownstreamIsLive(token))return;
  features.forEach(function(feature){syncProjectionFromFeature(feature);});
  if(!liveDownstreamIsLive(token))return;
  E._liveDownstream.state="pending";
  syncLiveDownstreamBadge();
  refreshLivePreview();
}

function syncLiveDownstream(feature) {
  var liveBadge=liveFeatureEditBadge();
  var features=downstreamFeaturesOf(feature.id);
  if(!features.length){clearLiveDownstream(liveBadge);return;}
  var cheap=[],heavy=[];
  features.forEach(function(item){(featureRebuildNeedsKernel(item)?heavy:cheap).push(item);});
  cheap.forEach(function(item){syncProjectionFromFeature(item);});
  /* A re-laid pattern copy is a NEW part object, so a selection still pointing
     at the one that was just dropped would keep a body alive that the document
     no longer has. Follow it by id, or let it go. */
  if(E.sel && E.sel.id && !(E.def.parts || []).includes(E.sel) && !livePreviewParts().includes(E.sel)){
    E.sel=(E.def.parts || []).find(function(part){return part.id===E.sel.id;}) || null;
  }
  if(!heavy.length){clearLiveDownstream(liveBadge);return;}
  /* The stale exact mesh goes NOW. Leaving it up would draw a fillet that
     still hugs the depth the extrude no longer has — the analytic fallback is
     approximate, but it is not a lie. */
  heavy.forEach(function(item){partsForFeature(item.id).forEach(function(part){delete part.meshData;if(isKernelBody(part))delete part.bounds;markLiveDirtyPart(part);});});
  var token=(E._featurePreviewToken || 0)+1;E._featurePreviewToken=token;
  E._liveDownstream={token:token,state:"calculating",features:heavy.map(function(item){return item.id;})};
  if(liveBadge)patternMergePreviewBadge(liveBadge,"calculating","ph-scribble-loop",tf("liveDownstreamCalc",{count:heavy.length}));
  if(E._liveDownstreamTimer)clearTimeout(E._liveDownstreamTimer);
  E._liveDownstreamTimer=setTimeout(function(){
    E._liveDownstreamTimer=0;
    runLiveDownstream(heavy,token);
  },PATTERN_MERGE_PREVIEW_DELAY);
}

/* The one live entry point for a feature EDIT. Apply and Cancel still go
   through refreshAll(); this is what a dragged or retyped value reaches. */
function syncLiveFeatureEdit(feature) {
  syncProjectionFromFeature(feature);
  syncLiveDownstream(feature);
  // Keep document geometry synchronous, but paint only once per display frame.
  // A burst of field/handle updates must not rebuild every GPU object per tick.
  if(E._liveEditPreviewFrame)cancelAnimationFrame(E._liveEditPreviewFrame);
  var document=E.def,edit=E.authoring && E.authoring.featureEdit;
  E._liveEditPreviewFrame=requestAnimationFrame(function(){
    E._liveEditPreviewFrame=0;
    if(E.def===document && E.authoring?.featureEdit===edit)refreshLivePreview();
  });
}

function cancelFeatureParameterEdit(silent) {
  if (!E.def) return;
  var edit=E.authoring && E.authoring.featureEdit;if(!edit)return;
  if(E._liveEditPreviewFrame){cancelAnimationFrame(E._liveEditPreviewFrame);E._liveEditPreviewFrame=0;}
  var feature=(E.def.features || []).find(function(item){return item.id===edit.featureId;});
  if(feature){
    Object.keys(feature).forEach(function(key){delete feature[key];});Object.assign(feature,cloneData(edit.snapshot));
    var entry=(E.def.history || []).find(item=>item.targetId===feature.id);if(entry)entry.name=edit.historyName;
    (E.def.parts || []).forEach(function(item){(item.exactOperations || []).forEach(function(operation){if(operation.id===feature.id)operation.targets=cloneData(feature.references?.topology || []);});});
    syncProjectionFromFeature(feature);
  }
  E.authoring.featureEdit=null;E.authoring.editFeatureId=null;E.authoring.featureType=null;
  if(edit.history!==undefined && currentHistoryNode()===edit.history)H.discard();
  closeFeaturePanel();
  refreshAll();if(!silent)flash(t("featureEditCancelled"));
}

function dependencyReferenceId(reference) {
  return reference && typeof reference === "object" ? reference.id || reference.targetId : reference;
}

function directFeatureDependencies(feature) {
  var ids=new Set((feature && feature.inputs || []).map(dependencyReferenceId).filter(Boolean));
  (feature && feature.references && feature.references.features || []).map(dependencyReferenceId).filter(Boolean).forEach(function(id){ids.add(id);});
  (feature && feature.references && feature.references.sketches || []).map(dependencyReferenceId).filter(Boolean).forEach(function(id){ids.add(id);});
  (feature && feature.references && feature.references.topology || []).forEach(function(reference){if(reference && reference.ownerFeatureId)ids.add(reference.ownerFeatureId);});
  return ids;
}

function dependencySets(targetId) {
  var features=E.def && E.def.features || [],byId=new Map(features.map(function(feature){return [feature.id,feature];}));
  var upstream=new Set(),downstream=new Set(),walkUp=function(id){var feature=byId.get(id);if(!feature)return;directFeatureDependencies(feature).forEach(function(dep){if(dep===targetId||upstream.has(dep))return;upstream.add(dep);walkUp(dep);});};
  walkUp(targetId);
  var changed=true;while(changed){changed=false;features.forEach(function(feature){if(feature.id===targetId||downstream.has(feature.id))return;var deps=directFeatureDependencies(feature);if(deps.has(targetId)||Array.from(downstream).some(function(id){return deps.has(id);})){downstream.add(feature.id);changed=true;}});}
  return {focus:targetId,upstream:upstream,downstream:downstream};
}

function dependencyRole(targetId) {
  var highlight=E.dependencyHighlight;if(!highlight||!targetId)return "";
  if(targetId===highlight.focus)return "focus";
  if(highlight.upstream.has(targetId))return "upstream";
  if(highlight.downstream.has(targetId))return "downstream";
  return "";
}

function applyDependencyTreeClasses() {
  if(!root)return;
  root.querySelectorAll("[data-history-target]").forEach(function(row){
    var role=dependencyRole(row.dataset.dependencyTarget || (E.docType==='assembly'?null:row.dataset.historyTarget));
    row.classList.toggle("md-dependency-focus",role==="focus");
    row.classList.toggle("md-dependency-upstream",role==="upstream");
    row.classList.toggle("md-dependency-downstream",role==="downstream");
    row.classList.toggle("md-dependency-dim",!!E.dependencyHighlight&&!role);
  });
}

function setDependencyHighlight(targetId) {
  var graph=E.docType==='assembly'?assemblyDependencyGraph(E.assembly):partDependencyGraph(E.def);
  var next=targetId ? dependencyVisualization(graph,String(targetId),E.dependencyOptions || {}) : null;
  if((E.dependencyHighlight&&E.dependencyHighlight.focus||null)===(next&&next.focus||null))return;
  E.dependencyHighlight=next;
  E.dependencyOwner=E.docType==='assembly'?E.assembly:E.def;
  applyDependencyTreeClasses();
  updateDependencyPresentation();
  refreshViewportSelection();
}

function updateDependencyPresentation() {
  if(!root)return;
  E.dependencyOptions ||= {parents:true,children:true};
  if(E.dependencyOwner!==(E.docType==='assembly'?E.assembly:E.def))E.dependencyHighlight=null;
  if(E.dependencyHighlight){var graph=E.docType==='assembly'?assemblyDependencyGraph(E.assembly):partDependencyGraph(E.def);E.dependencyHighlight=dependencyVisualization(graph,E.dependencyHighlight.focus,E.dependencyOptions);applyDependencyTreeClasses();}
  renderDependencyPresentation(root,E.treeModel,E.dependencyHighlight,E.dependencyOptions,function(key,value){
    E.dependencyOptions[key]=value;
    var target=E.dependencyHighlight?.focus;E.dependencyHighlight=null;
    setDependencyHighlight(target || null);
  });
}

function treeCollapseState() {
  E.treeCollapsed ||= {};
  return E.treeCollapsed;
}

function currentRollbackBar() {
  return isCanonicalAuthoring() ? parametricRollbackBar() : rollbackBar();
}

function treeDeps() {
  return { el: el, btn: btn, cadIcon: cadIcon, namedButton: namedButton, t: t, rollbackBar: currentRollbackBar };
}

function treeLabels() {
  return {
    metadata: t("treeDocument"), references: "Reference geometry", bodies: t("treeBodies"),
    sketches: t("sketches"), history: t("featureTree"), noMaterial: t("treeNoMaterial"),
    equations: t("treeEquations"), sharedSketch: t("treeSharedSketch"),
    derivedBody: t("treeDerivedBody"), folder: t("treeFolder"),
    sketchDriven: t("treeSketchDriven"), profileBroken: t("profileBroken"),
  };
}

/* Bodies come from the rebuild when it published them, and are predicted from
   the feature graph when it has not run yet — the section answers "what exists
   right now", so it must not be empty merely because nothing has regenerated. */
function treeBodySet() {
  var run = E.coreRun;
  var bodies = run && (run.bodies || (run.core && run.core.bodies));
  return Array.isArray(bodies) && bodies.length ? bodies : null;
}

function treeStatusMap() {
  var map = new Map(), status = E.coreRun && E.coreRun.status;
  if (Array.isArray(status)) status.forEach(function (entry) { map.set(entry.targetId, entry.state); });
  return map;
}

function currentTreeModel() {
  var canonical = isCanonicalAuthoring();
  return buildTreeModel(E.def, {
    authoringSystem: canonical ? "parametric-v1" : "legacy-adapter",
    rollbackIndex: canonical
      ? (E.def.rollbackIndex == null ? (E.def.history || []).length : E.def.rollbackIndex)
      : undefined,
    status: treeStatusMap(),
    bodies: treeBodySet(),
    hiddenBodies: E.hiddenBodies || [],
    selection: {
      features: (E.authoring && E.authoring.featureSelection) || [],
      sketches: activeLoftCreation()?.loftSectionIds || E.authoring?.sketchSelection || [],
    },
    selectedPartId: (E.sel && E.sel.id) || null,
    selectedReferenceId: E.selectedReferenceId || null,
    collapsed: treeCollapseState(),
    folders: E.def.treeFolders || [],
    labels: treeLabels(),
    featureDetail:function(feature){return featureTreeContext(feature,E.def,function(value){return modelLengthText(value,5)+' '+modelLengthUnit();},featureTypeLabel);},
    definition: E.def,
  });
}

function treeTargetFeature(node) {
  return (E.def.features || []).find(function (item) { return item.id === node.targetId; }) || null;
}
/* ---- Copy / Paste a sketch between parts (G18) ----------------------------
   The clipboard lives in localStorage so it survives closing one part and
   opening another; see js/core/sketch_clipboard.js for what travels. */
function clipboardStorage() {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (error) { return null; }
}
function readClipboardSketch() { return readSketchClipboard(clipboardStorage()); }
function treeSelectedSketch() {
  var ids = (E.authoring && E.authoring.sketchSelection) || [];
  return (E.def.sketches || []).find(function (sketch) { return ids.indexOf(sketch.id) >= 0 && (sketch.entities || []).length; }) || null;
}
function pasteReferenceTarget() {
  var plane = (E.def.references || []).find(function (item) { return item.id === E.selectedReferenceId && item.type === "plane"; });
  if (plane) return plane;
  return (E.topologySelection || []).find(function (item) { return item.kind === "face" && item.descriptor && item.descriptor.surface === "plane"; }) || null;
}
function copySketchToClipboard(sketch) {
  try {
    var clip = copySketchForClipboard(sketch, { documentName: E.def && E.def.name, copiedAt: new Date().toISOString() });
    if (!clipboardStorage()) { flash(t("sketchClipboardUnavailable")); return false; }
    writeSketchClipboard(clipboardStorage(), clip);
    flash("✓ " + tf("sketchCopied", { name: clip.name }) + (clip.droppedRelations.length || clip.droppedLinks.length ? " · " + t("sketchCopyDroppedLinks") : ""));
    return true;
  } catch (error) { flash(String(error.message || error)); return false; }
}
function pasteSketchOntoReference(reference) {
  var clip = readClipboardSketch();
  if (!clip) { flash(t("sketchClipboardEmpty")); return false; }
  if (!reference) { flash(t("sketchPasteNeedPlane")); return false; }
  chooseSketchReference(reference);
  var sketch = ensureSketch(E.def);
  var pasted = pasteSketchGeometry(clip, uid);
  pushUndo(t("sketchPaste"));
  sketch.points = (sketch.points || []).concat(pasted.points);
  sketch.entities = (sketch.entities || []).concat(pasted.entities);
  sketch.constraints = (sketch.constraints || []).concat(pasted.constraints);
  if (pasted.dimensions.length) sketch.dimensions = (sketch.dimensions || []).concat(pasted.dimensions);
  sketch.name = pasted.name;
  var entry = (E.def.history || []).find(function (item) { return item.targetId === sketch.id; });
  if (entry) entry.name = pasted.name;
  resolveSketch(false);
  refreshAll();
  flash("✓ " + tf("sketchPasted", { name: pasted.name }));
  return true;
}

function treeTargetSketch(node) {
  return (E.def.sketches || []).find(function (item) { return item.id === node.targetId; }) || null;
}
function treeTargetPart(node) {
  return (E.def.parts || []).find(function (item) { return item.id === node.targetId; }) || null;
}
function toggleTreeSelection(list, id) {
  var at = list.indexOf(id);
  if (at < 0) list.push(id); else list.splice(at, 1);
}

function selectTreeNode(node, model, event) {
  var additive = !!(event && (event.ctrlKey || event.metaKey)) || E.mobileAddSelection;
  if (!additive && node.kind !== "feature" && E.authoring) E.authoring.featureSelection = [];
  if (node.kind === "sketch") {
    var loft=activeLoftCreation();
    if(loft){
      var ids=additive?loft.loftSectionIds.slice():[node.targetId];
      if(additive)toggleTreeSelection(ids,node.targetId);
      loft.setLoftSections(ids);
      return;
    }
    E.authoring.sketchSelection ||= [];
    if (additive) toggleTreeSelection(E.authoring.sketchSelection, node.targetId);
    else {
      var sketch = treeTargetSketch(node);
      if (sketch) { editSketchFromHistory(sketch); return; }
    }
    refreshAll(); return;
  }
  if (node.kind === "feature") {
    if (model.mode === "legacy") { E.sel = treeTargetPart(node); refreshAll(); return; }
    E.authoring.featureSelection ||= [];
    if (additive) toggleTreeSelection(E.authoring.featureSelection, node.targetId);
    else {
      E.authoring.featureSelection = [node.targetId];
      E.authoring.sketchSelection = [];
      E.ssel = [];
      E.topologySelection = [];
      E.sel = partsForFeature(node.targetId)[0] || null;
    }
    refreshAll(); return;
  }
  if (node.kind === "body") {
    E.sel = (E.def.parts || []).find(function (item) {
      return item.featureId === node.targetId || item.id === node.targetId
        || cutTargetFeatureId(item) === node.targetId;
    }) || null;
    refreshAll(); return;
  }
  if (node.kind === "reference") {
    if(!additive){E.topologySelection=[];E.sel=null;E.ssel=[];}
    E.selectedReferenceId = E.selectedReferenceId === node.targetId ? null : node.targetId;
    refreshAll(); return;
  }
  if (node.kind === "operation") { refreshAll(); return; }
  refreshAll();
}

function editTreeNode(node, model) {
  if (node.kind === "sketch") {
    var sketch = treeTargetSketch(node);
    if (sketch) editSketchFromHistory(sketch);
    return;
  }
  if (node.kind === "feature") {
    if (model.mode === "legacy") {
      var part = treeTargetPart(node);
      if (part) { E.sel = part; refreshAll(); }
      return;
    }
    var feature = treeTargetFeature(node);
    if (feature) openFeatureEditor(feature);
    return;
  }
  if (node.kind === "reference") {
    var reference = (E.def.references || []).find(function (item) { return item.id === node.targetId; });
    if (reference && reference.type === "plane") {if(reference.id.startsWith("plane:"))chooseSketchReference(reference);else openOffsetPlaneForm(reference);}
    return;
  }
  if (node.kind === "body") selectTreeNode(node, model, null);
}

/* Rename where the name is read. The canonical path goes through
   updateFeatureDefinition so the history entry and the feature cannot drift
   apart; every other kind owns its own name field. */
function renameTreeNode(node, model, name) {
  pushUndo(t("treeRename"));
  if (node.kind === "feature" && model.mode === "canonical") {
    var renamedFeature = (E.def.features || []).find(function (item) { return item.id === node.targetId; });
    var previousName = renamedFeature && renamedFeature.name;
    try { updateFeatureDefinition(E.def, node.targetId, { name: name }); }
    catch (error) { H.discard(); flash(String(error.message || error)); return; }
    var entry = (E.def.history || []).find(function (item) { return item.targetId === node.targetId; });
    if (entry) entry.name = name;
    // A standalone solid initially inherits its creating feature's name.
    // Keep that default body label and the selected-body breadcrumb in sync,
    // while preserving an intentionally custom body name.
    (E.def.parts || []).filter(function (part) { return part.featureId === node.targetId && (!part.name || part.name === previousName); })
      .forEach(function (part) { part.name = name; });
    (E.def.referenceGeometry || []).filter(function(r){return r.featureId===node.targetId;}).forEach(function(r){r.name=name;});
  } else if (node.kind === "feature") {
    var part = treeTargetPart(node);
    if (!part) { H.discard(); return; }
    part.name = name;
  } else if (node.kind === "sketch") {
    var sketch = treeTargetSketch(node);
    if (!sketch) { H.discard(); return; }
    sketch.name = name;
    var sketchEntry = (E.def.history || []).find(function (item) { return item.targetId === node.targetId; });
    if (sketchEntry) sketchEntry.name = name;
  } else if (node.kind === "reference") {
    var reference = (E.def.references || []).concat(E.def.referenceGeometry || [])
      .find(function (item) { return item.id === node.targetId; });
    if (!reference) { H.discard(); return; }
    reference.name = name;
  } else if (node.kind === "folder") {
    var folder = (E.def.treeFolders || []).find(function (item) { return item.id === node.targetId; });
    if (!folder) { H.discard(); return; }
    folder.name = name;
  } else { H.discard(); return; }
  refreshAll();
}

function suppressTreeNode(node, model) {
  if (node.kind === "body") {
    E.hiddenBodies ||= [];
    toggleTreeSelection(E.hiddenBodies, node.id);
    refreshAll(); return;
  }
  if (node.kind === "operation") {
    var owner = (E.def.parts || []).find(function (part) {
      return (part.exactOperations || []).some(function (op) { return op.id === node.targetId; });
    });
    var operation = owner && (owner.exactOperations || []).find(function (op) { return op.id === node.targetId; });
    if (!operation) return;
    pushUndo(operation.suppressed ? t("unsuppress") : t("suppress"));
    operation.suppressed = !operation.suppressed;
    if (typeof scheduleExactMesh === "function") scheduleExactMesh(owner);
    refreshAll(); return;
  }
  var next = !node.suppressed;
  pushUndo(next ? t("suppress") : t("unsuppress"));
  if (model.mode === "canonical") {
    /* Whatever this step feeds goes with it — and comes back with it. Say which
       steps those were: a cascade the user cannot see is a tree that changed
       more than the row they clicked. */
    var entry = suppressHistoryNode(E.def, node.historyId, next);
    var names = (entry.cascaded || []).map(function (id) {
      var child = (E.def.features || []).find(function (item) { return item.id === id; });
      return (child && child.name) || id;
    });
    if (names.length) flash(t(next ? "suppressedWith" : "unsuppressedWith") + " " + names.join(", "));
    var projected = (E.def.parts || []).find(function (item) { return item.featureId === node.targetId; });
    if (projected) projected.suppressed = next;
  } else {
    var part = treeTargetPart(node);
    if (!part) { H.discard(); return; }
    part.suppressed = next;
  }
  refreshAll();
}

function rollbackToTreeNode(node, model) {
  if (node.index == null) return;
  pushUndo(t("ctxRollbackHere"));
  if (model.mode === "canonical") setHistoryRollback(E.def, node.index);
  else E.def.rollback = node.index;
  refreshAll();
}

function syncSketchAfterRemoval(previousSketchId) {
  var sketch = ensureSketch(E.def);
  if (sketch.id === previousSketchId) return;
  E.view = sketch.plane || referencePlaneView((E.def.references || []).find(function (reference) { return reference.id === sketch.referenceId; }));
  E.ssel = []; E.sel = null; E.poly = null; E.arcPts = null; E.drag = null; E.dimPick = []; E.dimSel = null;
  E.solveInfo = solveSketch(sketch); E._solveSketchId = sketch.id;
  if (E.authoring) {
    E.authoring.sketchId = sketch.id; E.authoring.referenceId = sketch.referenceId;
    E.authoring.sketchSelection = [sketch.id];
  }
  syncModelPlane();
  if (E.mode === "3d" && E.modelPlaneActive && E.sketchNormalTo) orientModelToView(true);
}
function removeTreeNode(node, model) {
  if (node.kind === "folder") { ungroupFolder(node); return; }
  if (node.kind === "reference") {
    pushUndo(t("del"));
    E.def.referenceGeometry = (E.def.referenceGeometry || []).filter(function (item) { return item.id !== node.targetId; });
    if (E.selectedReferenceId === node.targetId) E.selectedReferenceId = null;
    refreshAll(); return;
  }
  if (model.mode === "canonical" && node.historyId) {
    pushUndo(t("del"));
    var previousSketchId = E.def.activeSketch;
    var result = removeHistoryNode(E.def, node.historyId, {verifiedTopology:verifiedExactTopology(E.def,compileKernelFeatureTree(E.def).features)});
    if (!result.ok) { H.discard(); flash(result.issues[0].message); return; }
    E.def.parts = (E.def.parts || []).filter(function (item) {
      return item.featureId !== node.targetId && item.derivedFeatureId !== node.targetId;
    });
    E.def.toolboxParts = (E.def.toolboxParts || []).filter(function (item) { return item.featureId !== node.targetId; });
    (result.dirtyPartIds || []).forEach(function(id) {
      var part = E.def.parts.find(function(item) { return item.id === id; });
      if (!part) return;
      markLiveDirtyPart(part);
      if (partNeedsExactMesh(part)) queueExactMesh(part);
    });
    E.topologySelection = []; E.sel = null;
    syncSketchAfterRemoval(previousSketchId);
    refreshAll(); return;
  }
  if (node.kind === "sketch") {
    var sketches = ensureSketchDoc(E.def);
    if (sketches.length < 2) { flash(t("del")); return; }
    pushUndo(t("del"));
    var priorSketchId = E.def.activeSketch;
    if (!removeSketch(E.def, node.targetId)) {
      H.discard(); flash("Sketch is used by another history step"); return;
    }
    E.ssel = []; E.sel = null;
    syncSketchAfterRemoval(priorSketchId);
    refreshAll(); return;
  }
  if (node.kind === "feature" && node.index != null) {
    pushUndo(t("del"));
    var removed = E.def.parts.splice(node.index, 1)[0];
    if (E.sel === removed) E.sel = null;
    refreshAll();
  }
}

/* Drag-reorder is validated by the same rule the arrow buttons use, so an
   illegal drop is refused with the reason rather than silently reverted. */
async function reorderTreeNode(dragId, target, after, model) {
  var drag = findTreeNode(model.nodes, dragId);
  if (!drag || drag.index == null || target.index == null) return;
  if (!drag.can.reorder || !target.can.reorder) return;
  var to = target.index + (after ? 1 : 0);
  if (drag.index < to) to -= 1;
  if (to === drag.index) return;
  if(model.mode === "canonical" && ['fillet','chamfer'].includes((E.def.features || []).find(function(feature){return feature.id===drag.targetId;})?.type) && to>drag.index){
    var prior=E.def,signature=JSON.stringify(prior);
    flash('Validating reordered finish…');
    try{
      var reordered=await reorderFinishFeature(prior,drag.historyId,to);
      if(E.def!==prior || JSON.stringify(E.def)!==signature){flash('The model changed during validation. Try the move again.');return;}
      pushUndo(t("reorder"));Object.assign(E.def,reordered);E.sel=null;E.topologySelection=[];refreshAll();flash('Finish moved · exact rebuild succeeded');
    }catch(error){flash(String(error.message || error));}
    return;
  }
  pushUndo(t("reorder"));
  if (model.mode === "canonical") {
    var result = reorderHistoryNode(E.def, drag.historyId, to);
    if (!result.ok) { H.discard(); flash(result.issues[0].message); return; }
  } else {
    var parts = E.def.parts, moved = parts.splice(drag.index, 1)[0];
    parts.splice(Math.max(0, Math.min(to, parts.length)), 0, moved);
    if (E.def.rollback != null) E.def.rollback = Math.max(0, Math.min(E.def.rollback, parts.length));
  }
  refreshAll();
}

/* Folders group history rows for reading; they never reorder the build, so a
   folder gathers only the members that are already contiguous with its anchor
   and reports how many it actually took. */
function groupIntoFolder(node, model) {
  var selected = [];
  if (model.mode === "canonical") {
    selected = ((E.authoring && E.authoring.featureSelection) || [])
      .concat((E.authoring && E.authoring.sketchSelection) || []);
  } else if (E.sel && E.sel.id) selected = [E.sel.id];
  var members = folderMemberIds(model, selected, node.targetId);
  if (!members.length) return;
  pushUndo(t("treeNewFolder"));
  E.def.treeFolders ||= [];
  var id = "folder_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  E.def.treeFolders.push({
    id: id,
    name: t("treeFolder") + " " + (E.def.treeFolders.length + 1),
    memberIds: members,
  });
  // Folders open collapsed on a document you are re-reading, but one you just
  // made should show what went into it — otherwise grouping looks like deleting.
  treeCollapseState()["folder:" + id] = false;
  refreshAll();
}

function ungroupFolder(node) {
  pushUndo(t("treeUngroup"));
  E.def.treeFolders = (E.def.treeFolders || []).filter(function (item) { return item.id !== node.targetId; });
  refreshAll();
}

function walkTreeNodes(nodes, visit) {
  (nodes || []).forEach(function (item) { visit(item); walkTreeNodes(item.children, visit); });
}

function setAllTreeCollapsed(model, collapsed) {
  var state = treeCollapseState();
  walkTreeNodes(model.nodes, function (item) { if (item.children.length) state[item.id] = collapsed; });
  refreshParts();
}

function closeTreeMenu() {
  if (E.treeMenu && E.treeMenu.parentNode) E.treeMenu.parentNode.removeChild(E.treeMenu);
  E.treeMenu = null;
  document.removeEventListener("pointerdown", closeTreeMenuOnPointer, true);
  document.removeEventListener("keydown", closeTreeMenuOnEscape, true);
}
function closeTreeMenuOnPointer(event) {
  if (E.treeMenu && E.treeMenu.contains(event.target)) return;
  closeTreeMenu();
}
function closeTreeMenuOnEscape(event) {
  if (event.key === "Escape") { event.stopPropagation(); closeTreeMenu(); }
}

function showTreeMenu(node, model, event, api) {
  closeTreeMenu();
  var items = [];
  if (node.can.edit) items.push({ label: t("ctxEditFeature"), icon: "ph-pencil-simple", run: function () { editTreeNode(node, model); } });
  if (node.kind === "feature") items.push({ label: "Change transparency", icon: "ph-eye", run: function () {
    var prior = (E.def.appearances || []).find(function (item) { return item.kind === "feature" && item.persistentId === node.targetId; });
    pushUndo("Change transparency");
    E.def.appearances = upsertAppearanceOverride(E.def.appearances, createAppearanceOverride({
      persistentId: node.targetId, kind: "feature", opacity: prior && prior.opacity < 1 ? 1 : .25,
    }));
    refreshAll(); scheduleModelerDraft();
  } });
  if (node.can.rename) items.push({ label: t("treeRename") + " · F2", icon: "ph-textbox", run: function () { api.rename(); } });
  if (node.kind === "sketch") items.push({ label: t("sketchCopy") + " · Ctrl+C", icon: "ph-copy", run: function () { copySketchToClipboard(treeTargetSketch(node)); } });
  if (node.kind === "sketch") {
    var visibilitySketch = treeTargetSketch(node);
    var consumed = consumedSketchIds(E.def).has(node.targetId);
    var shown = visibilitySketch && visibilitySketch.show3d !== false && (!consumed || visibilitySketch.show3d === true);
    items.push({
      label: t(shown ? "sketchHide3d" : "sketchShow3d"),
      icon: shown ? "ph-eye-slash" : "ph-eye",
      run: function () {
        var sketch = treeTargetSketch(node);
        if (!sketch) return;
        pushUndo(t(shown ? "sketchHide3d" : "sketchShow3d"));
        sketch.show3d = !shown;
        refreshAll();
      },
    });
  }
  if (node.kind === "reference" && readClipboardSketch()) {
    var pasteTarget = (E.def.references || []).find(function (item) { return item.id === node.targetId && item.type === "plane"; });
    if (pasteTarget) items.push({ label: t("sketchPaste") + " · Ctrl+V", icon: "ph-clipboard-text", run: function () { pasteSketchOntoReference(pasteTarget); } });
  }
  if (node.can.suppress) items.push({
    label: node.suppressed ? t("unsuppress") : t("suppress"),
    icon: node.suppressed ? "ph-eye" : "ph-eye-slash",
    run: function () { suppressTreeNode(node, model); },
  });
  if(model.mode==='canonical' && node.can.reorder && ['fillet','chamfer'].includes((E.def.features || []).find(function(feature){return feature.id===node.targetId;})?.type))items.push({label:'Move before…',icon:'ph-arrows-down-up',run:function(){
    var destinations=[];walkTreeNodes(model.nodes,function(candidate){if(candidate.kind==='feature'&&candidate.can.reorder&&candidate.index>node.index+1)destinations.push({label:'Move before '+candidate.name,icon:'ph-arrow-down',run:function(){reorderTreeNode(node.id,candidate,false,model);}});});
    if(destinations.length)openTreeMenu(destinations,event);else flash('No later feature to move before');
  }});
  if (node.can.rollback) items.push({ label: t("ctxRollbackHere"), icon: "ph-arrow-line-down", run: function () { rollbackToTreeNode(node, model); } });
  if (node.kind === "feature" || node.kind === "sketch") items.push({ label: t("treeNewFolder"), icon: "ph-folder-plus", run: function () { groupIntoFolder(node, model); } });
  if (node.kind === "folder") items.push({ label: t("treeUngroup"), icon: "ph-folder-minus", run: function () { ungroupFolder(node); } });
  items.push({ label: t("treeExpandAll"), icon: "ph-arrows-out-simple", run: function () { setAllTreeCollapsed(model, false); } });
  items.push({ label: t("treeCollapseAll"), icon: "ph-arrows-in-simple", run: function () { setAllTreeCollapsed(model, true); } });
  if (node.can.remove) items.push({ label: t("del"), icon: "ph-trash", run: function () { removeTreeNode(node, model); } });
  if (!items.length) return;

  openTreeMenu(items, event);
}

function openTreeMenu(items, event) {
  var menu = el("div", "md-tree-menu");
  menu.setAttribute("role", "menu");
  items.forEach(function (item) {
    var button = btn('<i class="ph ' + item.icon + '"></i><span>' + item.label + "</span>", function (clickEvent) {
      clickEvent.stopPropagation();
      closeTreeMenu();
      item.run();
    });
    button.type = "button";
    button.setAttribute("role", "menuitem");
    menu.appendChild(button);
  });
  root.appendChild(menu);
  var box = root.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(event.clientX - box.left, box.width - menu.offsetWidth - 8)) + "px";
  menu.style.top = Math.max(4, Math.min(event.clientY - box.top, box.height - menu.offsetHeight - 8)) + "px";
  E.treeMenu = menu;
  setTimeout(function () {
    document.addEventListener("pointerdown", closeTreeMenuOnPointer, true);
    document.addEventListener("keydown", closeTreeMenuOnEscape, true);
  }, 0);
  var first = menu.querySelector("button");
  if (first) first.focus();
}

function treeHandlers(model) {
  return {
    onSelect: function (node, event) { selectTreeNode(node, model, event); },
    onEdit: function (node) { editTreeNode(node, model); },
    onRepair: function (node) {
      var issue=(E.coreRun && E.coreRun.issues || []).find(function(item){return item.featureId===node.targetId || item.sketchId===node.targetId;});
      if(issue)runDiagnosticAction(issue);else editTreeNode(node,model);
    },
    onRename: function (node, name) { renameTreeNode(node, model, name); },
    onSuppress: function (node) { suppressTreeNode(node, model); },
    onRollback: function (node) { rollbackToTreeNode(node, model); },
    onRemove: function (node) { removeTreeNode(node, model); },
    onReorder: function (dragId, target, after) { reorderTreeNode(dragId, target, after, model); },
    onToggleCollapse: function (node) {
      treeCollapseState()[node.id] = !node.collapsed;
      refreshParts();
      refreshModelHistoryPane();
    },
    onContextMenu: function (node, event, api) { showTreeMenu(node, model, event, api); },
    onHover: function (targetId) { setDependencyHighlight(targetId); },
    onRollbackRelease: function () {
      pushUndo(t("rollbackRelease"));
      if (isCanonicalAuthoring()) setHistoryRollback(E.def, null); else E.def.rollback = null;
      refreshAll();
    },
  };
}

function renderFeatureManagerTree(host) {
  var model = currentTreeModel();
  E.treeModel = model;
  var mount = el("div", "md-tree-mount");
  host.appendChild(mount);
  E.treeState = renderTreeModel(mount, model, treeDeps(), treeHandlers(model), E.treeState || {});
  applyDependencyTreeClasses();
  updateDependencyPresentation();
}

/* A reopened model starts a fresh undo timeline, but its parametric feature
   history is persisted in def.history. The right-side History tab shows both:
   the saved design/build order first, then this session's undo branches. */
function refreshModelHistoryPane() {
  if (!root) return;
  var host = root.querySelector("#mdHistDesign");
  var session = root.querySelector("#mdHistSession");
  if (!host || !session) return;
  host.innerHTML = "";
  var assembly = E.docType === "assembly";
  host.hidden = assembly;
  session.hidden = false;
  if (assembly || !E.def) return;

  var title = el("div", "md-model-history-head");
  title.appendChild(el("span", "", t("designHistory")));
  title.appendChild(el("b", "", String((E.def.history || []).length)));
  host.appendChild(title);

  var model = currentTreeModel();
  var history = findTreeNode(model.nodes, "section:history");
  if (!history || !history.children.length) {
    host.appendChild(el("div", "hist-empty", t("noDesignHistory")));
    return;
  }
  var historyModel = Object.assign({}, model, {
    nodes: [Object.assign({}, history, { collapsed: false })],
  });
  var mount = el("div", "md-tree-mount md-history-tree-mount");
  host.appendChild(mount);
  E.historyTreeState = renderTreeModel(mount, historyModel, treeDeps(), treeHandlers(historyModel), E.historyTreeState || {});
}

/* Offer, never impose. The conversion is analysed for coverage, rebuilt on a
   clone by the engine it would move to, and measured against the original
   before it is adopted — and the original is kept beside the result, because a
   verified conversion is still a conversion. */
function renderMigrationOffer(host) {
  var analysis = analyzeLegacyMigration(E.def);
  var row = el("div", "md-part md-tree-migrate" + (analysis.ok ? "" : " md-tree-migrate-blocked"));
  row.appendChild(el("i", "ph " + (analysis.ok ? "ph-arrow-circle-up" : "ph-info")));
  var copy = el("span", "nm");
  copy.appendChild(el("b", "", analysis.ok ? t("treeMigrate") : t("treeMigrateBlocked")));
  copy.appendChild(el("small", "", analysis.ok
    ? t("treeMigrateHint")
    : ((analysis.blockers[0] && analysis.blockers[0].message) || "")));
  row.appendChild(copy);
  if (analysis.ok) {
    var migrateButton = btn(t("treeMigrateRun"), function (event) {
      event.stopPropagation();
      runVerifiedMigration();
    }, "btn-accent");
    migrateButton.dataset.treeMigrate = "run";
    row.appendChild(migrateButton);
  }
  row.dataset.treeMigrationOffer = analysis.ok ? "ready" : "blocked";
  host.appendChild(row);
}

function runVerifiedMigration() {
  var conversion = convertLegacyDocument(E.def);
  if (!conversion.ok) { flash(conversion.analysis.blockers[0].message); return; }
  var legacyRun, canonicalRun;
  try {
    var overrides = modelParameterOverrides();
    legacyRun = rebuildDefinition(cloneData(E.def), overrides);
    // The legacy renderer reads direct parts; the history rebuild has no
    // features for those parts and reports an empty parameter envelope.
    // Compare their measured geometry, which the migration gate also checks
    // independently for body count, volume and shape equivalence.
    if (E.def.parts && E.def.parts.length && !(E.def.features || []).length) {
      legacyRun.bounds = migrationGeometrySummary(E.def, "legacy").bounds;
    }
    canonicalRun = rebuildParametricDocument(conversion.document, overrides);
  } catch (error) { flash(String(error.message || error)); return; }
  var verdict = evaluateMigration({
    analysis: conversion.analysis,
    legacyDocument: E.def,
    legacyRun: legacyRun,
    canonicalRun: canonicalRun,
  });
  if (!verdict.ok) { flash(verdict.reasons[0].message); return; }
  pushUndo(t("treeMigrate"));
  E.def = retainLegacySource(conversion.document, E.def, {
    version: verdict.geometry && verdict.geometry.canonical.version,
    verification: verdict.geometry,
  });
  E.treeState = {};
  E.treeCollapsed = {};
  E.hiddenBodies = [];
  E.sel = null;
  E.ssel = [];
  flash(t("treeMigrateDone"));
  refreshAll();
}

function restoreLegacySource() {
  if (!E.def || !E.def.legacySource) return;
  pushUndo(t("treeRestoreLegacy"));
  var restored = restoreLegacyDocument(E.def);
  if (!restored) { H.discard(); return; }
  restored = ensureParametricDocument(restored);
  E.def = restored;
  E.treeState = {};
  E.treeCollapsed = {};
  E.hiddenBodies = [];
  E.sel = null;
  E.ssel = [];
  E.topologySelection = [];
  E.coreRun = rebuildDefinition(E.def, modelParameterOverrides());
  flash(t("treeRestoreLegacyDone"));
  refreshAll();
}

function renderLegacyRestore(host) {
  if (!E.def || !E.def.legacySource) return;
  var row = el("div", "md-part md-tree-migrate md-tree-restore");
  row.dataset.treeLegacyRestore = "available";
  row.appendChild(el("i", "ph ph-arrow-u-up-left"));
  var copy = el("span", "nm");
  copy.appendChild(el("b", "", t("treeRestoreLegacy")));
  copy.appendChild(el("small", "", t("treeRestoreLegacyHint")));
  row.appendChild(copy);
  var restoreButton = btn(t("treeRestoreLegacyRun"), function (event) {
    event.stopPropagation();
    restoreLegacySource();
  }, "btn-accent");
  restoreButton.dataset.treeRestoreLegacy = "run";
  row.appendChild(restoreButton);
  host.appendChild(row);
}

export {
  applyDependencyTreeClasses, cancelFeatureParameterEdit, closeTreeMenu,
  copySketchToClipboard, currentTreeModel, dependencyReferenceId,
  dependencyRole, dependencySets, openTreeMenu, pasteReferenceTarget,
  pasteSketchOntoReference, readClipboardSketch, refreshModelHistoryPane,
  removeTreeNode, renderFeatureManagerTree, renderLegacyRestore,
  renderMigrationOffer, selectTreeNode, setDependencyHighlight,
  syncLiveFeatureEdit, treeCollapseState, treeDeps, treeSelectedSketch,
  treeTargetFeature, treeTargetSketch, updateDependencyPresentation,
};

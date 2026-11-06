/* The CAD editor's component properties, configured components, flexible
   springs and mate forms, split out of js/modeler.js. It shares the editor's
   state through live imports from ../modeler.js. */
import { beltMateSpec } from "../cad_belt_mate.js";
import { releaseRegeneration } from "../cad_feature_tree.js";
import { shapeToMeshData } from "../cad_kernel.js";
import { validLimitMateBounds } from "../cad_mate_model.js";
import { defaultTopologyMateAlignment, mateAlignmentForLockedOrientation } from "../cad_mate_reference_choices.js";
import { captureLockPose, solveTopologyMates, topologyReference } from "../cad_mates.js";
import { addRackPinionMate } from "../cad_rack_pinion_controls.js";
import { rackPinionMateSpec } from "../cad_rack_pinion_mate.js";
import { addRotationLimitMate } from "../cad_rotation_limit_controls.js";
import { rotationLimitMateSpec } from "../cad_rotation_limit_mate.js";
import { setConcentricAxisDirection } from "../cad_screw_controls.js";
import { formSubassembly } from "../core/assembly_form_subassembly.js";
import { applyDrivenAssemblyPlacement } from "../core/assembly_placement.js";
import { ASSEMBLY_ORIGIN_ID, componentTopology, containsAssembly, isSubassembly, refreshSubassemblyFromRecord, standardPlaneEntries } from "../core/assembly_structure.js";
import { regenerateInCadWorker as regenerateFeatures } from "../core/cad_worker_client.js";
import { replaceComponentDefinition, setComponentConfiguration } from "../core/component_configuration.js";
import { assemblyPartNumber, documentDescription, setDocumentProperty } from "../core/custom_properties.js";
import { diagnosticHelp, groupDiagnostics, recommendedDiagnostic } from "../core/diagnostic_help.js";
import { lengthFromDocument, lengthToDocument } from "../core/document_length_units.js";
import { captureExactTopology, verifiedFinalTopology } from "../core/exact_topology_cache.js";
import { synchronizeExtrusionProjections, synchronizeSketchExtrusionFrames } from "../core/extrusion_projection.js";
import { createSpringBinding, hasUnverifiedSprings, restoreSpringEndpoint, springMotionState, springPreviewMesh, springSource } from "../core/flexible_spring.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { trackLibraryOccurrence } from "../core/library_occurrence.js";
import { libraryOccurrenceUpdate, resolvedLibraryAssembly } from "../core/model_library_store.js";
import { nestedComponentOccurrence } from "../core/nested_component_edit.js";
import { analyzeParametricHistory, setHistoryRollback, suppressHistoryNode } from "../core/parametric_document.js";
import { compactAssemblyTopologySnapshots, compactDocumentTopologySnapshots } from "../core/project_topology_budget.js";
import { setSketchOffset, sketchOffsetValue } from "../core/sketch_offset.js";
import { interferenceDocument } from "../core/worker_interference.js";
import { askModelerDecision } from "../modeler_decision.js";
import { bindMateNumericCommit } from "../modeler_mate_numeric_commit.js";
import { showModelerSheet } from "../modeler_mobile.js";
import { cloneData, normalizeTransform } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t } from "../modeler_strings.js";
import { openQuickForm, syncContextActions } from "../modeler/command_manager.js";
import { saveCurrentDocument, setDocumentType } from "../modeler/document_save.js";
import { drawSketch, flash, invalidateDrawing, showPickList } from "../modeler/drawing_sheet.js";
import { btn, el } from "../modeler/editor_dom.js";
import { rebuildFailureMessage, scheduleExactRestore } from "../modeler/export_measure.js";
import { publishExactBodies } from "../modeler/feature_create.js";
import { renderFeatureManagerTree, renderLegacyRestore, renderMigrationOffer, treeCollapseState, treeTargetFeature, treeTargetSketch } from "../modeler/feature_tree.js";
import { fillSketchPane } from "../modeler/inspector.js";
import { updatePreview } from "../modeler/library_panel.js";
import { activeParts, componentDef, componentFreedom, defBounds, loadAssemblies, loadLib, mateIssueLabel, renderedParts, topologyEntriesForPart } from "../modeler/library_store.js";
import { displayedCoreIssues, syncSketchDrivenParts } from "../modeler/sketch_entities.js";
import { beginSketchWorkflow, chooseSketchReference, closeFeaturePanel, isCanonicalAuthoring, modelLengthText, modelLengthUnit, referenceLabel, selectedSketchableFace, setTab } from "../modeler/sketch_workflow.js";
import { addFeatureFilter, applyFeatureFilter, beginContextPart, contextPathLabel, editSketchFromHistory, emptyState, openComponentPatternForm, refreshComponents } from "../modeler/tree_assembly.js";
import { fitPreview, setPanelCollapsed } from "../modeler/view_modes.js";
import { assemblyPickedRefs, assemblySymmetricPicks, lockMateComponentPair, mateReferenceFromPick, mateTypeFits, renderTreeAnnotations, ungroundedComponentPair } from "../modeler/viewport_input.js";
import { startSketchOnDefaultPlane } from "../modeler/welcome_coach.js";
import { ensureSketchDoc } from "../sketch_solver.js";
import { fin, uid } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, H, MATE_PALETTE, PLANE_NAME_KEYS, acceptRackPinionSolve,
  assemblyComponentById, assemblyMateInspectorBody, configuredComponentBuilds,
  currentHistoryNode, invalidateInterference, invalidateSketchProjection,
  mateReferenceRefreshes, mateTopologyMemo, numRow, openFeatureEditor,
  pushUndo, redrawTrackedUpdates, refreshAll, refreshSelection,
  requestDocumentType, root, solveAssembly, syncDirty,
} from "../modeler.js";

/* Canonical documents: def.history is the tree. */
function buildParametricHistoryTree(host) {
  var analysis = analyzeParametricHistory(E.def, { normalize: false });
  renderCoreDiagnostics(host);
  host.appendChild(el("div", "md-history-summary",
    '<span><b>' + (E.def.history || []).length + '</b> steps</span>' +
    '<span class="' + (analysis.ok ? "ok" : "bad") + '">' +
    (analysis.ok ? "Rebuild order valid" : analysis.issues.length + " dependency issues") + "</span>"));
  renderCreateSketchAction(host);
  renderFeatureManagerTree(host);
  renderLegacyRestore(host);
}

/* Legacy documents: def.parts is the tree, read through the same adapter and
   drawn by the same renderer. */
function buildLegacyTree(host) {
  renderCoreDiagnostics(host);
  renderCreateSketchAction(host, true);
  renderFeatureManagerTree(host);
  renderMigrationOffer(host);
}

/* Keep the next authoring action next to the tree heading. An empty part
   starts a sketch on Top with the rectangle tool in one tap; a selected
   datum or face still skips the picker. */
function renderCreateSketchAction(host, legacy) {
  var face = selectedSketchableFace();
  var reference = face || (E.def.references || []).concat(E.def.referenceGeometry || [])
    .find(function (item) { return item.id === E.selectedReferenceId; });
  var emptyDoc = !((E.def.history || []).length) && !activeParts(E.def).length;
  var label = reference ? t("createSketch") + " · " + referenceLabel(reference)
    : emptyDoc ? t("createSketchOnTop")
    : t(legacy ? "newSketch" : "createSketchOnRef");
  var action = btn('<i class="ph ph-plus"></i><span>' + label + "</span>", function () {
    if (reference) chooseSketchReference(reference, emptyDoc ? "srect" : null);
    else if (emptyDoc) startSketchOnDefaultPlane("srect", "plane:top");
    else beginSketchWorkflow(null, { forceNew: true });
  }, "md-tree-create-sketch md-dashed" + (emptyDoc ? " md-tree-start" : ""));
  action.title = label;
  host.appendChild(action);
}

/* The model size above the tree. A merged or finished body's real size only
   exists once its exact mesh lands, which happens after refreshParts() has
   run: rolling HOUSING back and forward left "11×3×11 cm", the size of the
   analytic Base Extrude stand-in, above a 7 cm and then an 18 cm body. So the
   readout is also refreshed where each exact mesh lands. */
function syncSizeReadout(sketchCount) {
  var sizeEl = root && root.querySelector("#mdSize");
  if (!sizeEl || E.docType === "assembly") return;
  if (sketchCount == null) sketchCount = ensureSketchDoc(E.def).reduce(function (a, s2) { return a + s2.entities.length; }, 0);
  var b = defBounds(E.def);
  sizeEl.textContent = renderedParts(E.def).length
    ? ["x","y","z"].map(axis=>axis.toUpperCase()+" "+modelLengthText(Math.round((b[axis+"1"]-b[axis+"0"])*1e6)/1e6,7)).join(" · ") + " " + modelLengthUnit()
    : sketchCount ? sketchCount + " sketch" : "";
}

function refreshParts() {
  if (E.docType === "assembly") { refreshComponents(); return; }
  var host = root.querySelector("#mdParts");
  host.innerHTML = "";
  var canonical = isCanonicalAuthoring();
  var sketches = ensureSketchDoc(E.def);
  var sketchCount = sketches.reduce(function (a, s2) { return a + s2.entities.length; }, 0);
  var n = canonical
    ? (E.def.history || []).length
    : E.def.parts.length + sketchCount + (E.def.referenceGeometry || []).length;
  var badge = root.querySelector("#mdPartBadge");
  if (badge) {
    badge.textContent = n || "";
    badge.classList.toggle("on", !!n);
    var issueList = displayedCoreIssues();
    var hasErrors = issueList.some(function (issue) { return issue.severity === "error"; });
    badge.classList.toggle("md-badge-error", hasErrors);
    badge.classList.toggle("md-badge-warn", !!(issueList.length && !hasErrors));
  }
  syncSizeReadout(sketchCount);
  syncDiagnosticJump();
  if (!n) {
    emptyState(host, "ph-pencil-line", t("noParts"), t("noPartsHint")).classList.add("md-empty-brief");
    renderCreateSketchAction(host);
    return;
  }
  addFeatureFilter(host);
  if (canonical) buildParametricHistoryTree(host); else buildLegacyTree(host);
  renderTreeAnnotations(host);
  applyFeatureFilter(host);
}



function syncDiagnosticJump() {
  var jump = root && root.querySelector("#mdDiagJump");
  if (!jump) return;
  var issues = E.docType === "assembly" ? [] : displayedCoreIssues();
  var errors = issues.filter(function (issue) { return issue.severity === "error"; }).length;
  if (!issues.length) {
    jump.hidden = true;
    jump.textContent = "";
    jump.removeAttribute("title");
    jump.removeAttribute("aria-label");
    return;
  }
  jump.hidden = false;
  jump.classList.toggle("error", !!errors);
  var count = errors || issues.length;
  var label = t(errors ? "rebuildFail" : "rebuildWarn") + " · " + count;
  var fullHint = label + " · " + t("issueStartHere");
  jump.title = fullHint;
  jump.setAttribute("aria-label", fullHint);
  jump.innerHTML = '<i class="ph ' + (errors ? "ph-warning-octagon" : "ph-warning") + '"></i> <span>' + label + '</span>';
}

function focusTreeDiagnostics() {
  setPanelCollapsed("left", false);
  setTab("parts");
  if (document.body.classList.contains("compact-nav")) showModelerSheet("tree");
  requestAnimationFrame(function () {
    var panel = root && root.querySelector("#mdDiagnostics");
    if (panel) panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    var primary = root && root.querySelector(".md-diagnostic-primary .md-diagnostic-actions button");
    if (primary) primary.focus({ preventScroll: true });
  });
}

function diagnosticActionLabel(action, issue) {
  if (action === "edit-sketch") return "editSketchIssue";
  if (action === "unsuppress") return "unsuppress";
  if (action === "repair-upstream") return "issueFixUpstream";
  if (action === "edit-parameters") return "issueEditParams";
  if (action === "show") return "showIssue";
  if (action === "save") return "coachActSave";
  if (action === "edit-feature") return "ctxEditFeature";
  if (issue && issue.sketchId) return "editSketchIssue";
  if (issue && issue.featureId) return "ctxEditFeature";
  return "showIssue";
}

function unsuppressDiagnosticTarget(issue) {
  var targetId = issue.reference || issue.sketchId || issue.featureId;
  var entry = (E.def.history || []).find(function (item) { return item.targetId === targetId; });
  if (!entry || !entry.suppressed) { revealCoreIssue(issue); return; }
  pushUndo(t("unsuppress"));
  try { suppressHistoryNode(E.def, entry.id, false); }
  catch (error) { H.discard(); flash(String(error.message || error)); return; }
  refreshAll();
}

function runDiagnosticAction(issue) {
  if(issue.code==="missing-topology-reference" || issue.code==="ambiguous-topology-reference") {
    var feature=(E.def.features || []).find(function(item){return item.id===issue.featureId;});
    var refs=feature && feature.references && feature.references.topology || [];
    E.topologySelection=refs.filter(function(ref){return ref.persistentId===issue.reference;});
    var failed=E.topologySelection[0], origin=failed && failed.descriptor && (failed.descriptor.origin || failed.descriptor.point);
    E.authoring.repairMarker=origin && [origin.x,origin.y,origin.z].every(Number.isFinite)?{origin:cloneData(origin),reference:issue.reference}:null;
    E.authoring.featureSelection=issue.featureId?[issue.featureId]:[];
    // Keep the failed reference visible in the form; highlight surviving candidates.
    var candidates=issue.candidates || [];
    (E.def.parts || []).forEach(function(part){topologyEntriesForPart(part).forEach(function(entry){if(candidates.includes(entry.persistentId))E.topologySelection.push(topologyReferenceFromEntry(entry));});});
    updatePreview();
  }
  var action = diagnosticHelp(issue, E.lang).action;
  if (action === "repair-upstream") {
    var earlier = recommendedDiagnostic((E.coreRun && E.coreRun.issues || []).filter(function (item) {
      return item !== issue && item.code !== "unavailable-feature-input";
    }));
    if (earlier) { runDiagnosticAction(earlier); return; }
    revealCoreIssue(issue);
    return;
  }
  if (action === "unsuppress") { unsuppressDiagnosticTarget(issue); return; }
  if (action === "edit-parameters") {
    setTab("sketch");
    fillSketchPane();
    var equations = root && Array.prototype.find.call(root.querySelectorAll("#mdSketch .md-h5"), function (heading) {
      return heading.textContent.trim() === t("equations");
    });
    if (equations) equations.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  if (action === "save") { saveCurrentDocument(); return; }
  if (action === "show") { revealCoreIssue(issue); return; }
  editCoreIssue(issue);
}

function revealCoreIssue(issue) {
  setPanelCollapsed("left", false);
  setTab("parts");
  if (document.body.classList.contains("compact-nav")) showModelerSheet("tree");
  treeCollapseState()["section:history"] = false;
  Object.keys(treeCollapseState()).forEach(function (key) {
    if (key.indexOf("feature:") === 0 || key.indexOf("folder:") === 0) treeCollapseState()[key] = false;
  });
  E.authoring.featureSelection = issue.featureId ? [issue.featureId] : [];
  E.authoring.sketchSelection = issue.sketchId ? [issue.sketchId] : [];
  refreshParts();
  requestAnimationFrame(function () {
    var id = issue.sketchId ? "sketch:" + issue.sketchId : issue.featureId ? "feature:" + issue.featureId : "";
    var row = id && root.querySelector('[data-node-id="' + id.replace(/["\\]/g, "\\$&") + '"]');
    if (!row) return;
    row.classList.add("md-tree-issue-focus");
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    row.focus({ preventScroll: true });
  });
}

function editCoreIssue(issue) {
  var sketch = issue.sketchId && treeTargetSketch({ targetId: issue.sketchId });
  if (sketch) { editSketchFromHistory(sketch); return; }
  var feature = issue.featureId && treeTargetFeature({ targetId: issue.featureId });
  if (feature) openFeatureEditor(feature);
}

function diagnosticMessage(issue, count) {
  var message = issue.message || issue.code || "Rebuild issue";
  if (issue.code === "under-constrained-sketch" && Number.isFinite(Number(issue.dof))) {
    var dof = Number(issue.dof);
    var sketch = treeTargetSketch({ targetId: issue.sketchId });
    message = ((sketch && sketch.name) || "Sketch") + " has " + dof + " " + (dof === 1 ? "degree" : "degrees") + " of freedom";
  }
  /* Persistent ids are useful to the resolver, not to a person scanning a
     narrow tree. Keep the raw id in the card tooltip and make the visible
     failure name the action that needs attention. */
  if (issue.code === "missing-topology-reference" || issue.code === "ambiguous-topology-reference") {
    var owner = String(message).split(/\s+has an?\s+/i)[0] || "Feature";
    message = owner + (issue.code === "missing-topology-reference"
      ? " lost a selected face or edge"
      : " has more than one matching face or edge");
  }
  if (count > 1) message += " · ×" + count;
  return message;
}

function renderCoreDiagnostics(host) {
  const issues = displayedCoreIssues();
  if (!issues.length) return;
  var groups = groupDiagnostics(issues);
  var errors = issues.filter(function (issue) { return issue.severity === "error"; }).length;
  /* A rebuild that FAILED is a reason to stop and look; a sketch that merely
     has degrees of freedom left is refinement the user may never want. Giving
     both the same open panel, the same "start here" and the same accent button
     is what teaches people to read past the panel entirely — so when there is
     nothing but warnings the whole block collapses to its own summary line and
     no row is promoted. The severities themselves already say which is which;
     only the presentation was treating them alike. */
  var advisory = !errors;
  var wrap = el(advisory ? "details" : "section", "md-diagnostics" + (advisory ? " md-diagnostics-advisory" : ""));
  wrap.id = "mdDiagnostics";
  var title = el(advisory ? "summary" : "h5", "md-h5 md-feature-title md-diagnostics-title",
    "<span>" + t("rebuildDiagnostics") + "</span>");
  title.appendChild(el("span", "md-diagnostics-counts",
    t(errors ? "rebuildFail" : "rebuildWarn") + " · " + (errors || issues.length)));
  wrap.appendChild(title);
  // Inside a <details> this is part of the collapsed body, not the summary.
  wrap.appendChild(el("p", "md-diagnostics-hint", t(advisory ? "rebuildWarnHint" : "rebuildDiagnosticsHint")));
  groups.forEach(function (group, index) {
    var issue = group.issue;
    var help = diagnosticHelp(issue, E.lang);
    var primary = index === 0 && !advisory;
    var row = el("div", "md-part md-core-diagnostic " + (issue.severity === "error" ? "error" : "warning") +
      (primary ? " md-diagnostic-primary" : ""));
    row.appendChild(el("i", "ph " + (issue.severity === "error" ? "ph-warning-octagon" : "ph-warning")));
    var content = el("span", "nm");
    var headline = el("span", "md-diagnostic-headline");
    headline.appendChild(el("span", "md-diagnostic-message", diagnosticMessage(issue, group.count)));
    if (primary) headline.appendChild(el("em", "md-diagnostic-start", t("issueStartHere")));
    content.appendChild(headline);
    content.appendChild(el("small", "md-diagnostic-next", "<b>" + t("issueNext") + "</b> " + help.next));
    /* Even the recommended first issue stays compact. "Start here" and Next
       make the immediate action obvious; the longer explanation is opt-in. */
    var disclosure = el("details", "md-diagnostic-help");
    disclosure.appendChild(el("summary", "", '<i class="ph ph-caret-right"></i> ' + t("issueHelp")));
    disclosure.appendChild(el("small", "md-diagnostic-explanation", "<b>" + t("issueWhy") + "</b> " + help.meaning));
    disclosure.appendChild(el("small", "md-diagnostic-fix", "<b>" + t("issueFix") + "</b> " + help.fix));
    (group.relatedFailures || []).forEach(function(failure){
      var nativeFailure=el("small", "md-diagnostic-native-failure");
      nativeFailure.textContent=(failure.code || "")+": "+(failure.message || "");
      disclosure.appendChild(nativeFailure);
    });
    disclosure.addEventListener("click", function (event) { event.stopPropagation(); });
    content.appendChild(disclosure);
    var actions = el("span", "md-diagnostic-actions");
    var primaryBtn = btn('<i class="ph ' +
      (help.action === "show" ? "ph-crosshair" : help.action === "unsuppress" ? "ph-eye" : "ph-pencil-simple") +
      '"></i> ' + t(diagnosticActionLabel(help.action, issue)), function (event) {
      event.stopPropagation();
      runDiagnosticAction(issue);
    }, primary ? "btn-accent" : "");
    actions.appendChild(primaryBtn);
    if (help.action !== "show" && (issue.sketchId || issue.featureId)) {
      actions.appendChild(btn('<i class="ph ph-crosshair"></i> ' + t("showIssue"), function (event) {
        event.stopPropagation();
        revealCoreIssue(issue);
      }));
    }
    content.appendChild(actions);
    row.appendChild(content);
    row.title = (issue.code || "") + (issue.reference ? " · " + issue.reference : "") +
      (group.count > 1 ? " · " + t("issueSameCount") : "");
    wrap.appendChild(row);
  });
  host.appendChild(wrap);
}

function issuesForTarget(targetId) {
  return displayedCoreIssues().filter(function (issue) {
    return issue.featureId === targetId || issue.sketchId === targetId;
  });
}

function highlightFeatureIssueBanner(host, feature) {
  if (!host || !feature) return;
  var issues = (feature.diagnostics && feature.diagnostics.length)
    ? feature.diagnostics
    : issuesForTarget(feature.id);
  if (!issues.length) return;
  var issue = recommendedDiagnostic(issues) || issues[0];
  var help = diagnosticHelp(issue, E.lang);
  var banner = el("div", "md-issue-banner " + (issue.severity === "error" ? "error" : "warning"));
  banner.appendChild(el("b", "", diagnosticMessage(issue)));
  banner.appendChild(el("small", "", help.next));
  host.appendChild(banner);
  issues.forEach(function (item) {
    if (!item.parameter) return;
    var field = host.querySelector('[data-parameter="' + String(item.parameter).replace(/["\\]/g, "\\$&") + '"]');
    if (field) field.classList.add("md-field-issue");
  });
}

function highlightSketchIssueBanner(host, sketch) {
  if (!host || !sketch) return;
  var issues = (sketch.diagnostics && sketch.diagnostics.length)
    ? sketch.diagnostics
    : issuesForTarget(sketch.id);
  if (!issues.length) return;
  var issue = recommendedDiagnostic(issues) || issues[0];
  var help = diagnosticHelp(issue, E.lang);
  var banner = el("div", "md-issue-banner " + (issue.severity === "error" ? "error" : "warning"));
  banner.appendChild(el("b", "", diagnosticMessage(issue)));
  banner.appendChild(el("small", "", help.next));
  host.appendChild(banner);
}


function parametricRollbackBar() {
  return rollbackBar(true);
}
function rollbackBar(parametric) {
  var bar = el("div", "md-rollbar", '<span></span><b>' + t("rollbackBar") + "</b><span></span>");
  bar.title = t("rollbackRelease");
  // double-click releases it to the end, the fastest way back to the whole model
  bar.addEventListener("dblclick", function () {
    pushUndo(t("rollbackRelease"));
    if (parametric) setHistoryRollback(E.def, null);
    else E.def.rollback = null;
    refreshAll();
  });
  return bar;
}

function numLengthRow(host, label, get, set, step, tourKey, deferUntilApply, canCommit) {
  var unit=modelLengthUnit();
  return numRow(host, label+" ("+unit+")", function () {
    var value=lengthToDocument(get(),unit);
    return Math.abs(value)<1e-9 ? 0 : Number(value.toPrecision(12));
  }, function (value) {
    set(lengthFromDocument(value,unit));
  }, lengthToDocument(step || 0.1,unit), tourKey, deferUntilApply, canCommit);
}

function addSketchOffsetControl(host,sketchId) {
  // A retained inspector event must never edit the sketch selected previously.
  var currentContext=function(){return E.def.activeSketch===sketchId && (E.def.sketches || []).some(function(item){return item.id===sketchId;});};
  var currentOffset=function(){return sketchOffsetValue((E.def.sketches || []).find(function(item){return item.id===sketchId;}));};
  var input=numLengthRow(host,t("sketchOffset"),currentOffset,function(value){
    if(!setSketchOffset(E.def,sketchId,value))return;
    synchronizeSketchExtrusionFrames(E.def,sketchId);
    invalidateSketchProjection();syncSketchDrivenParts();
    if(isCanonicalAuthoring() && (E.def.features || []).some(function(feature){return feature.params?.sketchId===sketchId || (feature.references?.sketches || []).some(function(ref){return (typeof ref==="string"?ref:ref.id)===sketchId;});}))scheduleExactRestore();
  },0.5,null,false,currentContext);
  var commit=function(){
    if(!currentContext())return;
    var typed=parseFloat(input.value),value=lengthFromDocument(typed,modelLengthUnit());
    if(fin(value) && Math.abs(value-currentOffset())>1e-10)input.dispatchEvent(new Event("change",{bubbles:true}));
  };
  // Numeric editors do not always send change when automation or a retained
  // inspector field loses focus. Explicit commit paths share the same undo
  // and canonical-frame setter as a native change event.
  input.addEventListener("blur",commit);
  input.addEventListener("keydown",function(event){if(event.key==="Enter"){event.preventDefault();event.stopPropagation();commit();}});
  host.appendChild(btn(t("applySketchOffset"),commit,"md-wide"));
  return input;
}

/* The inspector was one long column: six dimension cells, four material rows, a
   texture picker and ten operation buttons, all competing for the same scroll.
   It is three panes now — the size of the thing, how it looks, and what you can
   do to it — behind the icon row at the top of the panel. */
function assemblyBomProperties(host,component) {
  [["Description","Description"],["Part number","PartNo"]].forEach(function(pair){
    var row=el("label","md-row md-row-wide"),input=el("input");
    row.appendChild(el("span","t",pair[0]));input.type="text";input.setAttribute("aria-label","Component "+pair[0].toLowerCase());
    var source=component.def || component.asm;
    input.value=pair[1]==="Description" ? documentDescription(component) || documentDescription(source) : assemblyPartNumber(component,source);
    input.placeholder=pair[1]==="PartNo" ? "Source part number unless overridden" : "BOM description";
    var committedValue=input.value;
    function commitProperty(){
      var next=input.value.trim();
      if(next===committedValue)return;
      committedValue=next;
      pushUndo("Component "+pair[0].toLowerCase());setDocumentProperty(component,pair[1],next);
      // Metadata changes neither body projections nor the current inspector.
      // Keep staged placement fields and their focus intact on blur/Tab.
      if(E.sheet)E.sheet.invalidateLayout();
      if(E.mode==='drawing')drawSketch();
      syncDirty();
    }
    input.addEventListener("change",commitProperty);
    input.addEventListener("blur",commitProperty);
    input.addEventListener("keydown",function(event){
      if(event.key!=="Enter")return;
      event.preventDefault();event.stopPropagation();commitProperty();
    });
    row.appendChild(input);host.appendChild(row);
  });
}
function fillLibraryLinkStatus(host,component) {
  host.replaceChildren();
  var update=libraryOccurrenceUpdate(component,E.assembly.key,true);
  var reasons={
    untracked:"An occurrence has no source baseline. Its embedded copy stays in use.",
    missing:"A referenced library record is missing. Its embedded copy stays in use.",
    cycle:"A circular assembly reference was blocked.",
    diverged:"The source and the embedded copy have both changed. Local edits stay in use.",
    configured:"The source changed. This occurrence uses its own configuration, context, spring, or pattern geometry."
  };
  if(update.issue)host.appendChild(el("p","md-note",reasons[update.issue]+" Review before using Update from library. For a nested reference, open its owning assembly."));
  if(update.available)host.appendChild(btn("Apply tracked update",function(){
    var current=libraryOccurrenceUpdate(component,E.assembly.key);
    if(!current.component)return;
    pushUndo("Apply tracked update");Object.assign(component,current.component);
    redrawTrackedUpdates();
  },"md-wide"));
}
/* The saved record Update from library would write into an occurrence, or
   null once it has said why the update cannot run. */
function libraryUpdateSource(component) {
  var record = isSubassembly(component)
    ? loadAssemblies().find(function (model) { return model.key === component.assemblyKey; })
    : loadLib().find(function (model) { return model.key === component.modelKey; });
  if (!record) { flash(t("modelNotInLibrary")); return null; }
  var latest = isSubassembly(component) ? resolvedLibraryAssembly(record) : record;
  if(component.configurationId && !isSubassembly(component) && !(latest.configurations || []).some(cfg=>cfg.id===component.configurationId)){
    flash("The selected configuration is missing from the saved part.");return null;
  }
  if (isSubassembly(component) && containsAssembly(latest, E.assembly.key)) { flash(t("subassemblyContainsThis")); return null; }
  return { record:record, latest:latest };
}
function assemblyHoldsComponent(assembly, component) {
  return (assembly?.components || []).some(function (child) {
    return child === component || (isSubassembly(child) && assemblyHoldsComponent(child.asm, component));
  });
}
/* Replacing an embedded document asks through the editor's own dialog; a
   blocking confirm froze rendering and any automation driving the page. The
   answer covers this occurrence, this assembly state and this saved copy: if
   any of them moved while the dialog was up, nothing is written. */
async function updateComponentFromLibrary(component) {
  var source = libraryUpdateSource(component);
  if (!source) return false;
  var assembly=E.assembly, generation=H.generation, history=currentHistoryNode(), edit=H.editRevision("assembly"), saved=JSON.stringify(source.record);
  if (!await askModelerDecision(root, { title:t("updateFromLibrary"), message:t("updateFromLibraryAsk"), accept:t("updateFromLibrary"), cancel:t("m_cancel") })) return false;
  if (!E.open || E.docType!=="assembly" || E.contextEdit || E.assembly!==assembly || H.generation!==generation || currentHistoryNode()!==history ||
      H.editRevision("assembly")!==edit || !assemblyHoldsComponent(assembly, component)) { flash(t("updateFromLibraryStale")); return false; }
  var current = libraryUpdateSource(component);
  if (!current) return false;
  if (JSON.stringify(current.record) !== saved) { flash(t("updateFromLibraryStale")); return false; }
  var latest = current.latest;
  pushUndo(t("updateFromLibrary"));
  if (isSubassembly(component)) {
    refreshSubassemblyFromRecord(component, compactAssemblyTopologySnapshots(latest));
    solveTopologyMates(component.asm);
  } else {
    var selectedConfiguration=component.configurationId;
    component.def = cloneData(compactDocumentTopologySnapshots(latest));
    if(selectedConfiguration && (component.def.configurations||[]).some(function(cfg){return cfg.id===selectedConfiguration;}))setComponentConfiguration(component,selectedConfiguration);
  }
  trackLibraryOccurrence(component,latest);
  invalidateInterference();
  solveAssembly();
  refreshAll();
  fitPreview();
  if(!isSubassembly(component) && component.configurationId)refreshConfiguredComponent(component);
  return true;
}
function assemblyTransformInspector() {
  var host = root.querySelector("#mdInsp"); host.innerHTML = "";
  var component = E.sel;
  if (!component) { emptyState(host, "ph-cursor-click", t("noSel"), t("mateHint")); return; }
  if(component.componentPattern){
    host.appendChild(el("h5","md-h5",component.name || "Pattern occurrence"));
    host.appendChild(el("p","md-note","Driven by Component Pattern "+component.componentPattern.patternId+". Edit the seed for part/configuration/pose changes, or edit/remove the Component Pattern. Independent occurrence constraints are unsupported."));
    host.appendChild(btn("Edit Component Pattern",function(){openComponentPatternForm("edit");},"md-wide"));
    return;
  }
  var nameRow = el("label", "md-row md-row-wide");
  nameRow.appendChild(el("span", "t", t("partName")));
  var name = el("input"); name.type = "text"; name.value = component.name || component.modelKey || component.assemblyKey;
  var committedName = name.value;
  function commitComponentName() {
    var nextName = name.value.slice(0, 80) || component.modelKey || component.assemblyKey || t("component");
    if (nextName === committedName) return;
    committedName = nextName;
    pushUndo(t("partName")); component.name = nextName;
    /* Renaming is metadata-only. Replacing the inspector here discards the
       six staged placement fields when clicking Apply first blurs the name. */
    refreshParts(); invalidateDrawing(); syncDirty();
  }
  name.addEventListener("change", commitComponentName);
  name.addEventListener("blur", commitComponentName);
  name.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault(); event.stopPropagation(); commitComponentName();
  });
  nameRow.appendChild(name); host.appendChild(nameRow);
  assemblyBomProperties(host,component);
  if (component.modelKey || isSubassembly(component)) {
    if(!isSubassembly(component))host.appendChild(btn("Replace part from library",function(){
      var models=loadLib().filter(function(model){return (model.parts||[]).length;});
      showPickList("Replace part","Choose the saved part for this occurrence",models.map(function(model){return {id:model.key,label:model.name||model.key};}),function(item){
        var latest=models.find(function(model){return model.key===item.id;});
        pushUndo("Replace component part");replaceComponentDefinition(component,latest);trackLibraryOccurrence(component,latest);
        invalidateInterference();refreshAll();refreshConfiguredComponent(component);
      });
    },"md-wide"));
    var linkStatus=el("div");linkStatus.id="mdLibraryLinkStatus";host.appendChild(linkStatus);
    fillLibraryLinkStatus(linkStatus,component);
    host.appendChild(btn('<i class="ph ph-arrow-clockwise"></i> ' + t("updateFromLibrary"), function () {
      updateComponentFromLibrary(component);
    }, "md-wide"));
  }
  host.appendChild(el("h5", "md-h5", t("transform")));
  var grid = el("div", "md-prop-grid"), committedPose=cloneData(normalizeTransform(component)),placementDraft=cloneData(committedPose),placementInputs={};
  [["X", "x"], ["Y", "y"], ["Z", "z"], ["RX°", "rx"], ["RY°", "ry"], ["RZ°", "rz"]].forEach(function (pair) {
    var turns = pair[1] !== "x" && pair[1] !== "y" && pair[1] !== "z";
    placementInputs[pair[1]]=(turns?numRow:numLengthRow)(grid, pair[0], function () { return placementDraft[pair[1]]; }, function (v) {
      placementDraft[pair[1]] = v;
    }, 0.1, null, true);
  });
  host.appendChild(grid);
  var applyPlacement=btn("Apply placement",function(){
    if(component.grounded)return;
    var values={};Object.keys(placementInputs).forEach(function(key){var value=Number(placementInputs[key].value);values[key]=["x","y","z"].includes(key)?lengthFromDocument(value,modelLengthUnit()):value;});
    if(Object.values(values).some(function(value){return !Number.isFinite(value);})){flash("Enter finite placement values.");return;}
    var nextName=name.value.slice(0,80) || component.modelKey || component.assemblyKey || t("component");
    if(nextName===component.name && Object.keys(values).every(function(key){return values[key]===committedPose[key];}))return;
    pushUndo("Apply component placement");
    var beforeName=component.name;
    var physicalFreedom=E.mateFreedom,physicalDegreesOfFreedom=E.mateDegreesOfFreedom;
    var beforeMateStatus={issues:E.mateIssues,rebindings:E.mateRebindings,unsatisfied:E.mateUnsatisfied,mobility:E.mateMobilityReport};
    component.name=nextName;
    /* A component the user typed is the temporary driver of this solve. It
       must not be one of the least-squares variables, or a free linkage can
       compromise its exact entered pose while moving the other members. */
    var placement=applyDrivenAssemblyPlacement(E.assembly,component,values,function(opts){return solveAssembly({...opts,quiet:true});});
    if(!placement.ok){
      component.name=beforeName;
      E.mateIssues=beforeMateStatus.issues;E.mateRebindings=beforeMateStatus.rebindings;E.mateUnsatisfied=beforeMateStatus.unsatisfied;
      E.mateFreedom=physicalFreedom;E.mateDegreesOfFreedom=physicalDegreesOfFreedom;
      E.mateMobilityReport=beforeMateStatus.mobility;
      refreshAll({assemblyPoseOnly:true});
      flash("Placement conflicts with assembly mates; previous pose restored.");
      return;
    }
    /* The anchor was only a placement driver, not a saved mate. Keep the
       physical mobility count from the unchanged mate graph after it leaves. */
    E.mateFreedom=physicalFreedom;E.mateDegreesOfFreedom=physicalDegreesOfFreedom;
    E.mateMobilityReport=beforeMateStatus.mobility;
    refreshAll({assemblyPoseOnly:true});fitPreview();
  },"md-wide");
  applyPlacement.disabled=!!component.grounded;host.appendChild(applyPlacement);
  if (component.grounded) host.appendChild(el("div", "md-note", t("grounded") + " · " + t("constraintDriven")));
}

async function refreshConfiguredComponent(component) {
  var document=component.def,assembly=E.assembly,run=null;
  var revision=(configuredComponentBuilds.get(component)||0)+1;configuredComponentBuilds.set(component,revision);
  var current=function(){return E.assembly===assembly && component.def===document && configuredComponentBuilds.get(component)===revision;};
  try {
    var compiled=compileKernelFeatureTree(document);
    if(!compiled.ok)throw new Error(compiled.issues?.[0]?.message || "Invalid component history");
    flash("Computing component configuration…");
    run=await regenerateFeatures({...compiled.document,features:compiled.features},{restoreMode:"mesh",onProgress:function(progress){if(current())flash("Computing component · "+(progress.name||progress.stage));}});
    if(!current())return;
    synchronizeExtrusionProjections(document,compiled.features,run);
    document.exactTopologyCache=captureExactTopology(document,compiled.features,run);
    await publishExactBodies(activeParts(document),run,document,async function(body){
      var mesh=body.verifiedSerializedExact===true?cloneData(body.workerMeshData):await shapeToMeshData(body,{deflection:.28,angle:.18});
      mesh.topology=cloneData(body.topology||[]);delete mesh.normals;delete mesh.colors;return mesh;
    },current);
    if(!current())return;
    invalidateInterference();solveAssembly();refreshAll();fitPreview();
    if(!run.ok)throw new Error(rebuildFailureMessage(run.issues,"Component configuration failed"));
    flash("✓ Component configuration rebuilt");return true;
  } catch(error) {if(current())flash(String(error.message||error),5000);return false;}
  finally {if(run)releaseRegeneration(run);}
}

function rejectFlexibleSpringPreview() {
  if(E.docType!=="assembly" || !hasUnverifiedSprings(E.assembly))return false;
  flash("Flexible spring is a visual preview. Move to an exact endpoint or restore the exact spring before saving, export or interference checks.",6000);return true;
}
async function syncFlexibleSpringsAtMotionState(assembly) {
  for(var component of assembly.components || []){
    if(!component.flexibleSpring)continue;
    var state;
    try {state=springMotionState(component,assembly);}catch(error){component.flexibleSpringState={exact:false,error:error.message};flash(error.message,6000);continue;}
    component.flexibleSpringState=state;
    if(state.configurationId){
      restoreSpringEndpoint(component,state.configurationId);
      if(await refreshConfiguredComponent(component) && E.assembly===assembly)component.flexibleSpringState.exact=true;
    }
  }
  if(hasUnverifiedSprings(assembly))flash("Flexible spring · visual preview only; exact checks and Save require an endpoint.",6000);
}
function openFlexibleSpringForm(component) {
  var assembly=E.assembly,previous=null,cancelled=false;
  try{springSource(component.def);}catch(error){flash(error.message,6000);return;}
  var drivers=(E.assembly.components || []).filter(function(c){return c!==component && !c.grounded;});
  if(!drivers.length){flash("Choose a moving rod component first.");return;}
  openQuickForm({action:"flexiblespring",title:"Flexible spring",hint:"Connect the spring height to a rod's axial travel. Intermediate geometry is a visual preview with unchanged circular wire diameter. Exact Save/export requires a configured endpoint.",fields:[
    {key:"driver",label:"Moving rod",type:"select",value:component.flexibleSpring?.driverId || drivers[0].id,choices:drivers.map(function(c){return {value:c.id,label:c.name || c.id};})},
    {key:"response",label:"Height response",type:"select",value:component.flexibleSpring?.response || 1,choices:[{value:1,label:"Positive travel extends"},{value:-1,label:"Positive travel compresses"}]}
  ],onCancel:function(){
    cancelled=true;if(!previous)return;
    configuredComponentBuilds.set(component,(configuredComponentBuilds.get(component)||0)+1);
    component.def=previous.def;component.flexibleSpring=previous.binding;component.flexibleSpringState=previous.state;
  },onApply:async function(values){
    if(cancelled || previous || E.assembly!==assembly)return false;
    var driver=drivers.find(function(c){return String(c.id)===String(values.driver);}),binding;
    try{binding=createSpringBinding(component,driver,Number(values.response));}catch(error){flash(error.message,6000);return false;}
    pushUndo("Flexible spring binding");previous={def:component.def,binding:component.flexibleSpring,state:component.flexibleSpringState};
    component.def=cloneData(component.def);component.flexibleSpring=binding;component.flexibleSpringState={height:binding.baseHeight,configurationId:component.configurationId || component.def.activeConfiguration,exact:false};
    if(!await refreshConfiguredComponent(component) || cancelled || E.assembly!==assembly)return false;
    component.flexibleSpringState.exact=true;flash("Flexible spring connected · native endpoint");return true;
  }});
}
async function restoreExactFlexibleSpring(component) {
  var binding=component.flexibleSpring;if(!binding)return;
  pushUndo("Restore exact spring");
  var endpoint=Math.abs(binding.baseHeight-binding.min.height)<1e-7?binding.min:binding.max;
  restoreSpringEndpoint(component,endpoint.configurationId);
  if(await refreshConfiguredComponent(component)){delete component.flexibleSpring;delete component.flexibleSpringState;refreshAll();}
}
function addFlexibleSpringPreview(group,component) {
  var state=component.flexibleSpringState;
  if(!state || state.exact!==false || !Number.isFinite(state.height))return false;
  var data;try{data=springPreviewMesh(component.def,state.height);}catch(error){flash(error.message,6000);return false;}
  var geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute("normal",new THREE.Float32BufferAttribute(data.normals,3));geometry.setIndex(data.indices);
  var mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xf5aa42,metalness:.45,roughness:.3,side:THREE.DoubleSide}));
  mesh.userData.cadFlexibleSpringPreview=true;group.add(mesh);return true;
}
function assemblyFlagsInspector() {
  var host = root.querySelector("#mdLook"); host.innerHTML = "";
  var component = E.sel;
  if (!component) { emptyState(host, "ph-eye", t("noSel"), t("mateHint")); return; }
  if (component.inContext) {
    var context = component.inContext, path = context.occurrencePath ?? [context.parentId];
    var occurrence = nestedComponentOccurrence(E.assembly,path);
    var note = el("div","md-note");
    note.textContent = "→ In context · "+(occurrence ? contextPathLabel(occurrence.chain) : JSON.stringify(path))+
      " · "+(context.reference?.persistentId || "Unknown face")+(component.contextIssue ? " · "+component.contextIssue : "");
    host.appendChild(note);
  }
  if(component.def && !isSubassembly(component))host.appendChild(btn("Edit component",function(){beginContextPart(component);},"md-wide"));
  [["visible", t("visible")], ["grounded", t("grounded")], ["transparent", "Transparent component"]].forEach(function (entry) {
    var row = el("label", "md-check");
    var input = el("input"); input.type = "checkbox";
    input.checked = entry[0] === "visible" ? component.visible !== false : !!component[entry[0]];
    input.addEventListener("change", function () { pushUndo(entry[1]); component[entry[0]] = input.checked; solveAssembly({quiet:true}); refreshAll(); });
    row.appendChild(input); row.appendChild(el("span", "", entry[1])); host.appendChild(row);
  });
  var def = componentDef(component);
  if(component.def && !isSubassembly(component)){
    var springEligible=false;try{springSource(component.def);springEligible=true;}catch(_){ }
    if(springEligible)host.appendChild(btn("Flexible spring…",function(){openFlexibleSpringForm(component);},"md-wide"));
    if(component.flexibleSpring){host.appendChild(el("div","md-note",component.flexibleSpringState?.exact===false?"Flexible spring · VISUAL PREVIEW · exact Save/export blocked":"Flexible spring · native endpoint"));host.appendChild(btn("Restore exact spring and remove binding",function(){restoreExactFlexibleSpring(component);},"md-wide"));}
  }
  if (def) {
    var shown=activeParts(def), bounds=shown.length?defBounds(def):null;
    if(!isSubassembly(component) && (def.configurations||[]).length>1){
      var configurationRow=el("label","md-row md-row-wide"),configurationSelect=el("select");
      configurationRow.appendChild(el("span","t","Configuration"));configurationSelect.setAttribute("aria-label","Component configuration");
      (def.configurations||[]).forEach(function(cfg){var option=el("option","",cfg.name);option.value=cfg.id;configurationSelect.appendChild(option);});
      configurationSelect.value=component.configurationId||def.activeConfiguration||def.configurations[0].id;
      configurationSelect.addEventListener("change",function(){
        pushUndo("Component configuration");if(!component.def)component.def=cloneData(def);
        setComponentConfiguration(component,configurationSelect.value);invalidateInterference();refreshAll();refreshConfiguredComponent(component);
      });configurationRow.appendChild(configurationSelect);host.appendChild(configurationRow);
    }
    host.appendChild(el("div", "md-note", shown.length + " " + t("partCount") + " · " + (bounds?[bounds.x1-bounds.x0,bounds.y1-bounds.y0,bounds.z1-bounds.z0].map(function(size){return modelLengthText(size,6);}).join("×"):"—×—×—") + " "+modelLengthUnit()));
  }
}

function addMate(type) {
  if (!E.assembly) { flash(t("mateHint")); return; }
  var pair = ungroundedComponentPair();
  if (!pair) { flash(t("mateHint")); return; }
  var a = pair.a, b = pair.b;
  /* Only the distance mate carries a value, and it used to read that value from
     a blocking prompt seeded with the pair's current X gap. Same seed, in a
     panel — and the undo entry moves with it, into apply. */
  if (type === "distanceX") {
    openQuickForm({
      action: "mate", icon: "ph-arrows-left-right", title: t("mateDistance"), hint: t("mateDistanceHint"),
      fields: [{ key: "value", label: t("mateDistance"), type: "number",
        value: Math.round((normalizeTransform(b).x - normalizeTransform(a).x) * 10) / 10, step: .5, unit: "length" }],
      onApply: function (values) {
        if (!fin(values.value)) { flash(t("needSel")); return false; }
        commitMate(type, a, b, values.value);
        return true;
      },
    });
    return;
  }
  commitMate(type, a, b, 0);
}

function commitMate(type, a, b, value) {
  pushUndo(t("mate"));
  E.assembly.mates = Array.isArray(E.assembly.mates) ? E.assembly.mates : [];
  E.assembly.mates.push({ id: uid(), type: type, a: a.id, b: b.id, value: value });
  solveAssembly(); refreshAll();
}

function componentTopologyRef(component, kind, side) {
  var def = componentDef(component), b = def ? defBounds(def) : {x0:-5,x1:5,y0:0,y1:10,z0:-5,z1:5};
  var frame;
  if (kind === "axis") frame = {
    surface:"cylinder", origin:{x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2,z:(b.z0+b.z1)/2},
    normal:{x:0,y:1,z:0}, axis:{x:0,y:1,z:0},
  };
  else {
    var positive = side !== "min";
    frame = {
      surface:"plane",
      origin:{x:positive?b.x1:b.x0,y:(b.y0+b.y1)/2,z:(b.z0+b.z1)/2},
      normal:{x:positive?1:-1,y:0,z:0},
    };
  }
  return topologyReference(component.id, kind, (component.modelKey||component.id)+":"+kind+":"+(side||"center"), frame);
}

/* `value` is the one number a mate can carry. Angles use degrees and planar
   distances use the model's internal centimeters. Keep those distinct from
   the legacy X-position mate so the picked face normal drives the offset.
   Returns whether a mate was actually stored, so a PropertyManager can stay
   open on the refusal instead of closing over it. */
function addTopologyMate(type, value) {
  if(type==='lock'){
    var pair=lockMateComponentPair();
    if(!pair){flash(t("lockMateNeedTwoComponents"));return false;}
    if((E.assembly.topologyMates||[]).some(function(mate){
      var a=String(mate.a?.componentId),b=String(mate.b?.componentId),first=String(pair[0].id),second=String(pair[1].id);
      return mate.type==='lock'&&!mate.suppressed&&((a===first&&b===second)||(a===second&&b===first));
    })){
      flash(t('lockMateAlreadyExists'));return false;
    }
    pushUndo(t("lockMate"));
    var mate={id:uid(),type:"lock",a:{componentId:pair[0].id,kind:"body"},b:{componentId:pair[1].id,kind:"body"}};
    captureLockPose(mate,pair[0],pair[1]);
    (E.assembly.topologyMates ||= []).push(mate);
    E.topologySelection=[];solveAssembly();refreshAll({assemblyPoseOnly:true});return true;
  }
  if (!E.assembly) { flash(t("mateHint")); return false; }
  if(type==='belt' && !beltMateSpec(value?.diameterA,value?.diameterB,value?.beltDirection)){flash(t('beltInvalid'));return false;}
  var rackSpec=type==='rackpinion' ? rackPinionMateSpec(value?.pitchRadius,value?.reverse ?? false,value?.driveTurns ?? null) : null;
  if(type==='rackpinion' && !rackSpec){flash(t('rackPinionInvalid'));return false;}
  var rotationSpec=type==='rotationlimit'?rotationLimitMateSpec(value?.angleMin,value?.angleMax,value?.reverse ?? false,value?.driveAngle ?? null):null;
  if(type==='rotationlimit'&&!rotationSpec){flash(t('rotationLimitInvalid'));return false;}
  var limitSpec=type==='limit' ? validLimitMateBounds(value && typeof value==='object' ? value.min : 0,value && typeof value==='object' ? value.max : 2) : null;
  if(type==='limit' && !limitSpec){flash(t('mateLimitInvalidRange'));return false;}
  var fits = mateTypeFits(type);
  if (!fits.ok) { flash(fits.reason); return false; }
  /* Two picked faces beat two synthesized ones. The buttons used to mate the
     component's +X bounding face to the other's -X face whatever the user had
     clicked, which is not what "Coincident faces" says it does. */
  /* No picks, no mate. A bounding box is not geometry the user chose: mating
     one component's +X box face to another's -X box face produced a real
     constraint, moved the model, and wrote a history node — all of it derived
     from an envelope rather than from anything on the part. The panel said
     "using bounding boxes" and then acted as though that were an answer, which
     made this the one place the editor stated a guess and committed it. Two
     picked faces, or nothing. */
  var triple = type === "symmetric" ? assemblySymmetricPicks() : null;
  var picked = triple ? { a: triple.a, b: triple.b } : assemblyPickedRefs();
  if (!picked) { flash(t(type === "symmetric" ? "mateNeedThreePicks" : "mateNeedTwoFaces")); return false; }
  var a = mateReferenceFromPick(picked.a);
  var b = mateReferenceFromPick(picked.b);
  /* The solver only ever moves B. Pick order is not a promise about which
     part is grounded — people click the moving hole, then the grounded one
     they want it on. Swap rather than refuse, or the button does nothing. */
  var componentA = mateHolderById(a.componentId);
  var componentB = mateHolderById(b.componentId);
  if (!['rackpinion','rotationlimit'].includes(type) && componentB && componentB.grounded && componentA && !componentA.grounded) {
    var swap = a; a = b; b = swap;
    if(type==='belt' && value)value={...value,diameterA:value.diameterB,diameterB:value.diameterA};
    var swapComponent = componentA; componentA = componentB; componentB = swapComponent;
  }
  if (componentB && componentB.grounded) { flash(t("mateIssueGroundedTarget")); return false; }
  // Rack coupling is directional: A is always the pinion, B the rack. Its
  // transactional helper captures the authored home zero before any drive.
  if(type==='rackpinion'){
    var rackResult=addRackPinionMate(E.assembly,{id:uid(),type,a,b,...rackSpec},function(){pushUndo(t('rackPinionMate'));});
    if(!rackResult.ok){flash(t('rackPinionUnsatisfied'));return false;}
    E.topologySelection=[];acceptRackPinionSolve(rackResult);return true;
  }
  if(type==='rotationlimit'){
    var rotationResult=addRotationLimitMate(E.assembly,{id:uid(),type,a,b,...rotationSpec},function(){pushUndo(t('rotationLimitMate'));});
    if(!rotationResult.ok){flash(t('rotationLimitUnsatisfied'));return false;}
    E.topologySelection=[];acceptRackPinionSolve(rotationResult);return true;
  }
  var lockedAlignment = ["coincident", "distance", "limit"].includes(type)
    ? mateAlignmentForLockedOrientation(a.frame, b.frame, componentA && componentA.transform,
      componentB && componentB.transform, componentB && componentFreedom(componentB.id)) : null;
  pushUndo(t("mate"));
  E.assembly.topologyMates ||= [];
  var gearSpec = type === "gear" && value && typeof value === "object" ? value : {};
  var beltSpec = type === "belt" && value && typeof value === "object" ? value : {};
  E.assembly.topologyMates.push({
    id:uid(), type:type, a:a, b:b,
    c: triple ? mateReferenceFromPick(triple.c) : undefined,
    // Datum planes default Aligned until existing mates fix an opposed orientation.
    aligned: defaultTopologyMateAlignment(picked.a, picked.b, lockedAlignment),
    value: type === "angle" ? clampMateAngle(value) : type === "distance" ? Number(value) : 0,
    pitch: type === "screw" ? 0.125 : undefined,
    turns: type === "screw" ? 0 : undefined,
    coupledMotion: type === "screw" ? true : undefined,
    min: limitSpec ? limitSpec.min : undefined,
    max: limitSpec ? limitSpec.max : undefined,
    ratioA: type === "gear" ? (fin(Number(gearSpec.ratioA)) && Number(gearSpec.ratioA) > 0 ? Number(gearSpec.ratioA) : 1) : undefined,
    ratioB: type === "gear" ? (fin(Number(gearSpec.ratioB)) && Number(gearSpec.ratioB) > 0 ? Number(gearSpec.ratioB) : 1) : undefined,
    reverse: type === "gear" ? !!gearSpec.reverse : undefined,
    diameterA:type==='belt'?beltSpec.diameterA:undefined,
    diameterB:type==='belt'?beltSpec.diameterB:undefined,
    beltDirection:type==='belt'?beltSpec.beltDirection:undefined,
  });
  E.topologySelection = [];
  solveAssembly(); refreshAll({assemblyPoseOnly:true});
  return true;
}

function clampMateAngle(value) {
  var degrees = Number(value);
  if (!fin(degrees)) return 0;
  return Math.max(0, Math.min(180, degrees));
}

function openFormSubassembly() {
  var assembly=E.assembly;
  var selected=(E.componentSel||[]).filter(function(component){return assembly?.components?.includes(component);});
  if(E.docType!=='assembly'||selected.length<2){flash(t('formSubassemblySelection'));return;}
  var selectedIds=selected.map(function(component){return component.id;});
  openQuickForm({action:'formsubassembly',icon:'formsubassembly',title:t('formSubassembly'),hint:t('formSubassemblyHint')+' '+selected.map(function(component){return component.name||component.modelKey||String(component.id);}).join(', '),fields:[
    {key:'name',label:t('name'),type:'text',value:t('formSubassemblyDefaultName')},
  ],onApply:function(values){
    if(E.docType!=='assembly'||E.assembly!==assembly)return false;
    var name=String(values.name||'').trim();if(!name){flash(t('formSubassemblyNameRequired'));return false;}
    var id=uid(),result=formSubassembly(assembly,selectedIds,{id,key:'subassembly_'+id,name},function(){pushUndo(t('formSubassembly'));});
    if(!result.ok){
      var code=result.issues?.[0]?.code;
      if (code==="unsupported-subassembly-context-reference") {flash(result.issues[0].message);return false;}
      flash(t(code==='subassembly-selection-not-rigid'?'formSubassemblyNeedRigid':code==='unsupported-subassembly-mechanical-reference'||code==='unsupported-subassembly-legacy-reference'?'formSubassemblyCrossingMate':'formSubassemblyFailed'));
      return false;
    }
    E.componentSel=[result.component];E.sel=result.component;E.topologySelection=[];
    acceptRackPinionSolve(result);refreshAll({skipAssemblySolve:true});
    return true;
  }});
}
function addInspectorTopologyMate(type) {
  if(!addTopologyMate(type))return false;
  // An inspector commit completes the pending mate command too. Otherwise
  // its selection collector keeps routing later tree clicks to stale picks.
  if(['mate','anglemate','distancemate','gearmate','beltmate','rackpinionmate','rotationlimitmate'].includes(E.quickAction)){
    var host=root&&root.querySelector('#mdQuickSettings');if(host)host.innerHTML='';
    E.quickAction=null;
    closeFeaturePanel({assemblyPoseOnly:true});
    syncContextActions();
  }
  return true;
}
/* Angle asks for its degrees before it is built. 45° rather than 0° as the
   seed, because a zero-degree angle mate IS a parallel mate — the cusp
   cad_mate_model handles specially — and a button that silently makes one
   looks like a button that did nothing. */
function openMateAngleForm() {
  openQuickForm({
    action: "anglemate", icon: "ph-angle", title: t("angleMate"),
    hint: assemblyPickedRefs() ? t("mateUsingPicked") : t("mateNeedTwoFaces"),
    fields: [{ key: "angle", label: t("mateAngleValue"), type: "number", value: 45, step: 1, min: 0, max: 180, unit: "angle" }],
    onApply: function (values) { return addTopologyMate("angle", values.angle); },
  });
}

/* A gear mate asks for the two tooth counts (the ratio) before it is built.
   The gears do not have to mesh: the mate only ties the two rotations. */
function openMateGearForm() {
  openQuickForm({
    action: "gearmate", icon: "ph-gear", title: t("gearMate"),
    hint: assemblyPickedRefs() ? t("mateUsingPicked") : t("mateNeedTwoFaces"),
    fields: [
      { key: "ratioA", label: t("gearTeethA"), type: "number", value: 24, step: 1, min: 1 },
      { key: "ratioB", label: t("gearTeethB"), type: "number", value: 12, step: 1, min: 1 },
      { key: "direction", label: t("gearDirection"), type: "select", value: "opposite",
        choices: [{ value: "opposite", label: t("gearOpposite") }, { value: "same", label: t("gearSame") }] },
    ],
    onApply: function (values) {
      if (!(Number(values.ratioA) > 0) || !(Number(values.ratioB) > 0)) { flash(t("gearRatioInvalid")); return false; }
      return addTopologyMate("gear", { ratioA: Number(values.ratioA), ratioB: Number(values.ratioB), reverse: values.direction === "same" });
    },
  });
}

function openMateRotationLimitForm() {
  openQuickForm({action:'rotationlimitmate',icon:'ph-angle',title:t('rotationLimitMate'),hint:t('rotationLimitHint'),fields:[
    {key:'angleMin',label:t('mateAngleMinimum'),type:'number',unit:'angle',value:-20,step:1},
    {key:'angleMax',label:t('mateAngleMaximum'),type:'number',unit:'angle',value:0,step:1},
    {key:'reverse',label:t('rotationLimitReverse'),type:'boolean',value:false},
    {key:'driveAngle',label:t('rotationLimitDrive'),type:'text',value:''},
  ],onApply:function(values){
    var drive=String(values.driveAngle ?? '').trim();
    var spec=rotationLimitMateSpec(values.angleMin,values.angleMax,!!values.reverse,drive===''?null:Number(drive));
    if(!spec){flash(t('rotationLimitInvalid'));return false;}
    return addTopologyMate('rotationlimit',spec);
  }});
}
function openMateRackPinionForm() {
  openQuickForm({action:'rackpinionmate',icon:'ph-gear',title:t('rackPinionMate'),hint:t('rackPinionHint'),fields:[
    {key:'pitchRadius',label:t('rackPinionRadius'),type:'number',unit:'length',value:1,min:1e-6,step:.1},
    {key:'reverse',label:t('rackPinionReverse'),type:'boolean',value:false},
    {key:'driveTurns',label:t('rackPinionDrive'),type:'text',value:''},
  ],onApply:function(values){
    var drive=String(values.driveTurns ?? '').trim();
    var spec=rackPinionMateSpec(values.pitchRadius,!!values.reverse,drive===''?null:Number(drive));
    if(!spec){flash(t('rackPinionInvalid'));return false;}
    return addTopologyMate('rackpinion',spec);
  }});
}

function openMateBeltForm() {
  openQuickForm({action:'beltmate',icon:'ph-circles-three-plus',title:t('beltMate'),
    hint:t('beltHint'),fields:[
      {key:'diameterA',label:t('beltDiameterA'),type:'number',unit:'length',value:6,min:1e-6,step:.1},
      {key:'diameterB',label:t('beltDiameterB'),type:'number',unit:'length',value:6,min:1e-6,step:.1},
      {key:'direction',label:t('gearDirection'),type:'select',value:'open',choices:[
        {value:'open',label:t('beltOpen')},{value:'crossed',label:t('beltCrossed')}]}
    ],onApply:function(values){
      // featureControlValue already converts document lengths to canonical cm.
      var spec=beltMateSpec(values.diameterA,values.diameterB,values.direction);
      if(!spec){flash(t('beltInvalid'));return false;}
      return addTopologyMate('belt',spec);
    }});
}

function openMateDistanceForm() {
  openQuickForm({
    action: "distancemate", icon: "ph-ruler", title: t("topologyDistanceMate"),
    hint: t("mateUsingPicked"),
    fields: [{ key: "distance", label: t("topologyDistanceMate"), type: "number", unit: "length", value: 0.15875, step: 0.01 }],
    onApply: function (values) { return fin(values.distance) && addTopologyMate("distance", values.distance); },
  });
}

/* The ribbon's Mate button used to do nothing but switch tabs, which is why
   mating looked like an inspector-only feature. This is the PropertyManager
   half of the same command: the two references the viewport has picked, the
   mate types those picks can actually support, and the value for the one that
   needs one. The Ops palette is untouched — this is a second door to the same
   addTopologyMate(), not a replacement for the first. */
function openMatePropertyManager() {
  if(E.docType==="part" && (E.quickFormInstance?.applying || E.quickFormInstance?.hasPendingEdits()))return requestDocumentType("assembly",openMatePropertyManager);
  setDocumentType("assembly");
  setTab("ops");
  if (!E.assembly) { flash(t("mateHint")); return; }
  var offered = MATE_PALETTE.filter(function (entry) { return mateTypeFits(entry[0]).ok; });
  // This is an orientation-only shortcut to the native zero-angle mate. It
  // intentionally does not add a distance or capture either plane's origin.
  if(offered.some(function(entry){return entry[0]==='angle';}))offered.push(['parallel','','parallelPlanesMate']);
  if (!offered.length) { flash(t("mate") + " — " + mateTypeFits("coincident").reason); return; }
  var picked = assemblyPickedRefs();
  var referenceLabel = function (reference) {
    return componentLabel(reference.componentId) + " · " +
      String(reference.semantic || reference.kind || "face").replace(/[:_-]+/g, " ");
  };
  var inputs = openQuickForm({
    action: "mate", icon: "ph-link", title: t("matePmTitle"),
    hint: picked ? t("mateUsingPicked") : t("matePmNoPicks"),
    fields: [
      { key: "refA", label: t("matePmRefA"), type: "text", value: picked ? referenceLabel(picked.a) : t("matePmPickFace") },
      { key: "refB", label: t("matePmRefB"), type: "text", value: picked ? referenceLabel(picked.b) : t("matePmPickFace") },
      { key: "type", label: t("matePmType"), type: "select", value: offered[0][0],
        choices: offered.map(function (entry) { return { value: entry[0], label: t(entry[2]) }; }) },
      { key: "angle", label: t("mateAngleValue"), type: "number", value: 45, step: 1, min: 0, max: 180, unit: "angle" },
      { key: "distance", label: t("topologyDistanceMate"), type: "number", value: 0.15875, step: 0.01, unit: "length" },
      { key: "limitMin", label: t("mateLimitMinimum"), type: "number", value: 0, step: 0.01, unit: "length" },
      { key: "limitMax", label: t("mateLimitMaximum"), type: "number", value: 2, step: 0.01, unit: "length" },
      {key:'diameterA',label:t('beltDiameterA'),type:'number',value:6,step:.1,min:1e-6,unit:'length'},
      {key:'diameterB',label:t('beltDiameterB'),type:'number',value:6,step:.1,min:1e-6,unit:'length'},
      {key:'pitchRadius',label:t('rackPinionRadius'),type:'number',unit:'length',value:1,min:1e-6,step:.1},
      {key:'rackReverse',label:t('rackPinionReverse'),type:'boolean',value:false},
      {key:'rackDriveTurns',label:t('rackPinionDrive'),type:'text',value:''},
      {key:'rotationMin',label:t('mateAngleMinimum'),type:'number',unit:'angle',value:-20,step:1},
      {key:'rotationMax',label:t('mateAngleMaximum'),type:'number',unit:'angle',value:0,step:1},
      {key:'rotationReverse',label:t('rotationLimitReverse'),type:'boolean',value:false},
      {key:'rotationDrive',label:t('rotationLimitDrive'),type:'text',value:''},
      {key:'beltDirection',label:t('gearDirection'),type:'select',value:'open',choices:[{value:'open',label:t('beltOpen')},{value:'crossed',label:t('beltCrossed')}]},
    ],
    onApply: function (values) {
      if(values.type==='parallel')return addTopologyMate('angle',0);
      if(values.type==='rotationlimit'){
        var rotationDrive=String(values.rotationDrive ?? '').trim();
        var rotationSpec=rotationLimitMateSpec(values.rotationMin,values.rotationMax,!!values.rotationReverse,rotationDrive===''?null:Number(rotationDrive));
        if(!rotationSpec){flash(t('rotationLimitInvalid'));return false;}
        return addTopologyMate('rotationlimit',rotationSpec);
      }
      if(values.type==='limit')return addTopologyMate('limit',{min:values.limitMin,max:values.limitMax});
      if(values.type==='belt'){
        var spec=beltMateSpec(values.diameterA,values.diameterB,values.beltDirection);
        if(!spec){flash(t('beltInvalid'));return false;}
        return addTopologyMate('belt',spec);
      }
      if(values.type==='rackpinion'){
        var rackDrive=String(values.rackDriveTurns ?? '').trim();
        var rackSpec=rackPinionMateSpec(values.pitchRadius,!!values.rackReverse,rackDrive===''?null:Number(rackDrive));
        if(!rackSpec){flash(t('rackPinionInvalid'));return false;}
        return addTopologyMate('rackpinion',rackSpec);
      }
      return addTopologyMate(values.type, values.type === "distance" ? values.distance : values.angle);
    },
  });
  if (!inputs) return;
  // The two reference rows report the picks; they are not somewhere to type.
  ["refA", "refB"].forEach(function (key) { if (inputs[key]) inputs[key].readOnly = true; });
  /* Apply is disabled rather than left live over an empty pair. The panel used
     to print "using bounding boxes" in these two rows and then commit a mate
     built from exactly that. Saying what is missing and refusing is the honest
     version of the same screen. */
  var applyButton = root && root.querySelector("#mdQuickSettings .md-quick-apply");
  if (applyButton && !picked) {
    applyButton.disabled = true;
    applyButton.dataset.tip = t("mateNeedTwoFaces");
  }
  var angleField = inputs.angle && inputs.angle.closest(".md-quick-field");
  var distanceField = inputs.distance && inputs.distance.closest(".md-quick-field");
  /* `parameter-hidden`, not the hidden attribute: .md-quick-field sets its own
     display, which a bare [hidden] does not beat. */
  var syncAngleField = function () {
    if (angleField) angleField.classList.toggle("parameter-hidden", inputs.type.value !== "angle");
    if (distanceField) distanceField.classList.toggle("parameter-hidden", inputs.type.value !== "distance");
    ['limitMin','limitMax'].forEach(function(key){var field=inputs[key]?.closest('.md-quick-field');if(field)field.classList.toggle('parameter-hidden',inputs.type.value!=='limit');});
    ['diameterA','diameterB','beltDirection'].forEach(function(key){var field=inputs[key]?.closest('.md-quick-field');if(field)field.classList.toggle('parameter-hidden',inputs.type.value!=='belt');});
    ['pitchRadius','rackReverse','rackDriveTurns'].forEach(function(key){var field=inputs[key]?.closest('.md-quick-field');if(field)field.classList.toggle('parameter-hidden',inputs.type.value!=='rackpinion');});
    ['rotationMin','rotationMax','rotationReverse','rotationDrive'].forEach(function(key){var field=inputs[key]?.closest('.md-quick-field');if(field)field.classList.toggle('parameter-hidden',inputs.type.value!=='rotationlimit');});
  };
  inputs.type.addEventListener("change", syncAngleField);
  syncAngleField();
}

function componentLabel(id) {
  if (id === ASSEMBLY_ORIGIN_ID) return (E.assembly && E.assembly.name) || t("assemblyPlanes");
  var component = assemblyComponentById(id);
  return component ? (component.name || component.modelKey || component.assemblyKey || t("component")) : "—";
}

/* What a mate reference sits on: a component, or the assembly's own grounded
   planes. The origin answers as grounded, so the mate command's swap puts it on
   the side the solver reads and never on the side it moves. */
function mateHolderById(id) {
  if (id === ASSEMBLY_ORIGIN_ID) return { id: ASSEMBLY_ORIGIN_ID, grounded: true, virtual: true };
  return assemblyComponentById(id);
}

/* A Front, Top or Right plane as a mate reference — a component's own, or the
   assembly's (book steps 148–166 pick them from the fly-out tree). */
function planeMateReference(holderId, planeId) {
  var entry = standardPlaneEntries().find(function (item) { return item.persistentId === planeId; });
  if (!entry) return null;
  var holder = mateHolderById(holderId);
  if (!holder) return null;
  var reference = topologyReference(holder.id, "face", planeId, entry.descriptor);
  reference.semantic = t(PLANE_NAME_KEYS[planeId]);
  reference.referencePlane = true;
  return reference;
}

/* One row per mate: what it is, which two components it holds, and — when the
   solver could not honour it — why. */
function concentricAxisDirectionControl(mate) {
  var control=el('select','md-input');
  [['automatic','Automatic'],['aligned','Aligned'],['opposed','Opposed']].forEach(function(choice){var option=el('option','',choice[1]);option.value=choice[0];control.appendChild(option);});
  var current=function(){return typeof mate.axisOpposed==='boolean'?(mate.axisOpposed?'opposed':'aligned'):'automatic';};
  control.value=current();control.setAttribute('aria-label',"Concentric axis direction");
  control.addEventListener('change',function(){
    var next=control.value==='automatic'?null:control.value==='opposed';
    var changed=setConcentricAxisDirection(E.assembly,mate.id,next,function(){pushUndo("Concentric axis direction");});
    if(!changed.ok){control.value=current();flash("Concentric axis direction could not satisfy the assembly mates");return;}
    solveAssembly({quiet:true});refreshAll({assemblyPoseOnly:true});
  });
  var row=el('label','md-mate-value');row.appendChild(el('span','',"Concentric axis direction"));row.appendChild(control);return row;
}

function mateRow(host, label, detail, issues, remove, rebound, valueEdit, alignmentEdit, contactEdit) {
  var row = el("div", "md-mate-row" + (issues && issues.length ? " md-mate-broken" : ""));
  var text = el("span", "");
  text.textContent = label + (detail ? " · " + detail : "");
  row.appendChild(text);
  /* A mate that carries a number is edited where it is listed. */
  if (valueEdit) {
    var field = el("label", "md-mate-value");
    var input = el("input");
    input.type = "number";
    input.step = String(valueEdit.step || 1);
    if (valueEdit.min != null) input.min = String(valueEdit.min);
    if (valueEdit.max != null) input.max = String(valueEdit.max);
    input.value = String(valueEdit.value);
    input.setAttribute("aria-label", valueEdit.label);
    input.title = valueEdit.label;
    bindMateNumericCommit(input,function(){
      try{valueEdit.onChange(input.value,input);}
      finally{if(valueEdit.getValue)input.value=String(valueEdit.getValue());}
    });
    field.appendChild(input);
    field.appendChild(el("b", "", valueEdit.suffix || ""));
    row.appendChild(field);
  }
  if (alignmentEdit) {
    var align = btn(alignmentEdit.aligned ? t("mateAligned") : t("mateOpposed"), alignmentEdit.onToggle, "md-mate-align");
    align.setAttribute("aria-label", t("mateAlignment") + ": " + (alignmentEdit.aligned ? t("mateAligned") : t("mateOpposed")));
    row.appendChild(align);
  }
  if(contactEdit){
    var contact=btn(contactEdit.finite?t("mateFiniteBoreContact"):t("mateSurfaceContact"),contactEdit.onToggle,"md-mate-align");
    contact.setAttribute("aria-label",t("mateContactMode")+": "+(contactEdit.finite?t("mateFiniteBoreContact"):t("mateSurfaceContact")));
    row.appendChild(contact);
  }
  if (issues && issues.length) {
    var warn = el("span", "md-mate-issue");
    warn.textContent = mateIssueLabel(issues[0]);
    warn.title = issues.map(mateIssueLabel).join(" · ");
    row.appendChild(warn);
  } else if (rebound) {
    var note = el("span", "md-mate-rebound");
    note.textContent = t("mateRebound");
    note.title = t("mateRebound");
    row.appendChild(note);
  }
  var removeButton = btn('<i class="ph ph-x"></i>', remove, "md-part-x");
  var removeLabel = t("del") + " · " + text.textContent;
  removeButton.setAttribute("aria-label", removeLabel);
  removeButton.title = removeLabel;
  row.appendChild(removeButton);
  host.appendChild(row);
  return row;
}

function finalMateTopology(document) {
  var previous=mateTopologyMemo.get(document),cache=document.exactTopologyCache;
  var node=document.history?.at(-1),features=document.features,sketches=document.sketches;
  if(previous && previous.cache===cache && previous.node===node && previous.features===features && previous.sketches===sketches)return previous.entries;
  var compiled=compileKernelFeatureTree(interferenceDocument(document));
  var entries=compiled.ok?verifiedFinalTopology(document,compiled.features):null;
  mateTopologyMemo.set(document,{cache:cache,node:node,features:features,sketches:sketches,entries:entries});
  return entries;
}

async function refreshComponentMateReferences(holder) {
  if(mateReferenceRefreshes.has(holder))return;
  var assembly=E.assembly,leaves=[];
  componentTopology(holder,function(leaf){if(!leaves.includes(leaf))leaves.push(leaf);return [];});
  mateReferenceRefreshes.set(holder,true);
  refreshSelection();
  try {
    for(var leaf of leaves){
      var document=componentDef(leaf),intent=JSON.stringify(interferenceDocument(document)),run=null;
      if(document?.metadata?.authoringSystem!=="parametric-v1")continue;
      var current=function(){return E.assembly===assembly && componentDef(leaf)===document && JSON.stringify(interferenceDocument(document))===intent;};
      try {
        var compiled=compileKernelFeatureTree(interferenceDocument(document));
        if(!compiled.ok)throw new Error(compiled.issues[0]?.message || "Invalid component feature history");
        run=await regenerateFeatures({...compiled.document,features:compiled.features},{restoreMode:'mesh',scope:'mate-references:'+holder.id,onProgress:function(progress){if(E.assembly===assembly)flash("Refreshing exact mate references · "+(progress.name || progress.stage));}});
        if(!current())return;
        if(!run.ok)throw new Error(rebuildFailureMessage(run.issues,"Exact mate references could not rebuild"));
        document.exactTopologyCache=captureExactTopology(document,compiled.features,run);
        mateTopologyMemo.delete(document);
        await publishExactBodies(activeParts(document),run,document,async function(body){
          var mesh=body.verifiedSerializedExact===true?cloneData(body.workerMeshData):await shapeToMeshData(body,{deflection:.28,angle:.18});
          mesh.topology=cloneData(body.topology || []);delete mesh.normals;delete mesh.colors;return mesh;
        },current);
        if(!current())return;
      } finally {if(run)releaseRegeneration(run);}
    }
    if(E.assembly===assembly){
      // Newly verified faces must reach the solver before displaying the mate
      // rows. Otherwise a successful refresh leaves old unresolved diagnostics
      // on screen until an unrelated assembly edit triggers a solve.
      solveAssembly({quiet:true});refreshAll();
      flash("Exact mate references refreshed");
    }
  } catch(error) {if(E.assembly===assembly)flash(String(error.message || error),5000);}
  finally {mateReferenceRefreshes.delete(holder);if(E.assembly===assembly)refreshSelection();}
}
function assemblyMateInspector() {
  try {
    assemblyMateInspectorBody();
  } catch (error) {
    var host = root.querySelector("#mdOps");
    if (host) host.appendChild(el("div", "md-note", "Mate references could not be displayed: " + (error?.message || String(error))));
    console.error("Assembly mate inspector failed", error);
  }
}

export {
  addFlexibleSpringPreview, addInspectorTopologyMate, addMate,
  addSketchOffsetControl, addTopologyMate, assemblyFlagsInspector,
  assemblyMateInspector, assemblyTransformInspector, clampMateAngle,
  componentLabel, concentricAxisDirectionControl, diagnosticActionLabel,
  diagnosticMessage, fillLibraryLinkStatus, finalMateTopology,
  focusTreeDiagnostics, highlightFeatureIssueBanner,
  highlightSketchIssueBanner, mateHolderById, mateRow, numLengthRow,
  openFormSubassembly, openMateAngleForm, openMateBeltForm,
  openMateDistanceForm, openMateGearForm, openMatePropertyManager,
  openMateRackPinionForm, openMateRotationLimitForm, parametricRollbackBar,
  planeMateReference, refreshComponentMateReferences, refreshParts,
  rejectFlexibleSpringPreview, rollbackBar, runDiagnosticAction,
  syncDiagnosticJump, syncFlexibleSpringsAtMotionState, syncSizeReadout,
};

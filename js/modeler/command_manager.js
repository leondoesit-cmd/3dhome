/* The CAD editor's command catalog and search, selection filters, navigators
   and active-command handling, split out of js/modeler.js. It shares the
   editor's state through live imports from ../modeler.js. */
import { assemblyHasExplodedOffsets } from "../cad_exploded_view.js";
import { cancelCadWorkerWork } from "../core/cad_worker_client.js";
import { isUpToFace } from "../core/extrude_extent.js";
import { featureBrowseNodes } from "../core/feature_browse.js";
import { addNamedCameraView, captureNamedCameraPose, namedCameraViews, removeNamedCameraView, restoreNamedCameraPose } from "../core/named_camera_views.js";
import { setHistoryRollback } from "../core/parametric_document.js";
import { isSketchAxis } from "../core/revolve_geometry.js";
import { selectedSketchNavigationEntity, sketchEntityStep, sketchEntitySwipe, sketchNavigationTarget } from "../core/sketch_entity_navigation.js";
import { getLang } from "../i18n.js";
import { VIEW_PRESETS, confirmationCornerState, contextMenuItems, contextToolbarItems, featureHistoryIndex, gestureFromSwipe, selectionBreadcrumb, shortcutBarItems } from "../modeler_chrome.js";
import { FEATURE_COMMAND, buildCommandCatalog, commandUnavailableReason as catalogUnavailableReason } from "../modeler_commands.js";
import { featureControlValue, validateFeatureInputs } from "../modeler_feature_form.js";
import { cadIcon } from "../modeler_icons.js";
import { revealModelerFeatureForm, showModelerSheet, syncModelerMobile } from "../modeler_mobile.js";
import { FACE_DRIVEN_OPERATIONS, cloneData } from "../modeler_part_geometry.js";
import { registerQuickForm } from "../modeler_quick_form.js";
import { isolateVisibility } from "../modeler_smartmates.js";
import { t } from "../modeler_strings.js";
import { featuresForClosedProfile } from "../modeler_workflow.js";
import { dynCommit, dynHasEntry } from "../modeler/dimension_entry.js";
import { confirmDiscardDocument, currentHistoryNode, pushUndo, scheduleModelerDraft, syncDirty, syncUndoButtons } from "../modeler/document_history.js";
import { syncViewButtons } from "../modeler/document_save.js";
import { closedSketchProfile } from "./drawing_sheet_profiles.js";
import { drawSketch } from "./drawing_sheet_render.js";
import { finishPoly, flash } from "./drawing_sheet_touch.js";
import { btn, el, markUnavailable, namedButton } from "../modeler/editor_dom.js";
import { openFeatureEditor } from "../modeler/editor_forms.js";
import { activeLoftCreation, clearFeaturePreview, featureField, preselectedRevolveAxis, revolveContour } from "../modeler/feature_create.js";
import { cancelFeatureParameterEdit, currentTreeModel, selectTreeNode } from "../modeler/feature_tree.js";
import { finishFeatureTargets, fullRoundActive, runSelectionOperation, saveNamedSelection, showNamedSelections } from "../modeler/finish_preview.js";
import { surfaceUVGuide } from "../modeler/inspector.js";
import { invalidateInterference } from "../modeler/library_assembly_state.js";
import { setMode } from "../modeler/library_io.js";
import { activeParts, defBounds, featureTypeLabel } from "../modeler/library_store.js";
import { runCommand, selectedSolid } from "../modeler/part_commands.js";
import { addedConstraintIds, constraintCaption, constraintFits, refusalMessage, showSketchRefusal } from "../modeler/sketch_dimension_editor.js";
import { resolveSketch, selectSketch, syncHint } from "../modeler/sketch_entities.js";
import { closeFeaturePanel, finishSketchWorkflow, isCanonicalAuthoring, modelLengthUnit, orientModelToView, restoreSketchCameraPose, setCommandTab, setTab, setView, syncAuthoringWorkflow } from "../modeler/sketch_workflow.js";
import { finishWallChain, partsForFeature } from "../modeler/tree_assembly.js";
import { setPanelCollapsed } from "../modeler/view_modes.js";
import { hidePickCycle } from "../modeler/viewport_input.js";
import { analyzeSketchChains } from "../sketch_profiles.js";
import { ensureSketch, explainSketchConflict } from "../sketch_solver.js";
import { uid } from "../state.js";
import {
  COMMAND_TOOLTIP, CONSTRAINT_DEFS, E, H, motionPlaybackCancel,
  openParametricFeature, refreshAll, refreshSelection, root,
} from "../modeler.js";

function openQuickForm(spec) {
  E.quickFormInstance?.dismiss();
  if(motionPlaybackCancel)motionPlaybackCancel();
  var host = root && root.querySelector("#mdQuickSettings");
  if (!host) return null;
  if (E.leftCollapsed) setPanelCollapsed("left", false);
  if (E.authoring && E.authoring.featureEdit) cancelFeatureParameterEdit(true);
  if (E.authoring && E.authoring.featureType) { clearFeaturePreview(false); E.authoring.featureType = null; }
  var action = spec.action || "quickform";
  var instance = registerQuickForm(E, host, action, function (leavingDocument) {
    if (spec.onDismiss) spec.onDismiss();
    else if (leavingDocument && spec.onCancel) spec.onCancel();
  });
  var ownsForm = () => instance.isCurrent() && E.quickAction === action;
  host.appendChild(el("div", "md-feature-form-title",
    '<i class="ph ' + (spec.icon || "ph-sliders-horizontal") + '"></i><span><b>' + spec.title +
    "</b><small>" + (spec.hint || t("featureFormHint")) + "</small></span>"));
  var section = el("details", "md-feature-group");
  section.open = true;
  section.appendChild(el("summary", "", '<i class="ph ph-sliders-horizontal"></i><span>' + spec.title + "</span><small>" + spec.fields.length + "</small>"));
  var body = el("div", "md-feature-group-body");
  var inputs = {};
  var fields=spec.fields.map(function(field){return field.unit==='length' ? {...field,inputUnit:modelLengthUnit()} : field;});
  fields.forEach(function (field) { inputs[field.key] = featureField(body, field, field.value); });
  section.appendChild(body);
  host.appendChild(section);

  var read = function () {
    var values = {};
    fields.forEach(function (field) {
      var raw = inputs[field.key].value;
      values[field.key] = field.type === "boolean" ? inputs[field.key].checked : (field.type === "number" || field.type === "feature-seeds") ? featureControlValue({field:field,input:inputs[field.key]}) : String(raw);
    });
    return values;
  };
  if (spec.onLive) Object.keys(inputs).forEach(function (key) {
    inputs[key].addEventListener("input", function () { if(ownsForm())spec.onLive(read()); });
  });

  var failure = el("p", "md-feature-error");
  if(failure){failure.setAttribute("role", "alert"); failure.hidden = true; host.appendChild(failure);}
  var close = function () { if(!ownsForm())return; host.innerHTML = ""; E.quickFormInstance = null; E.quickAction = null; closeFeaturePanel({assemblyPoseOnly:!!spec.presentationOnly,drawingOnly:!!spec.drawingOnly}); };
  var actions = el("div", "md-feature-actions");
  var cancelButton = namedButton(btn('<i class="ph ph-x"></i> ' + t("m_cancel"), function () {
    if(!ownsForm() || instance.applying)return;
    close();
    if (spec.onCancel) spec.onCancel();
    if(!spec.presentationOnly&&!spec.drawingOnly)refreshAll();
  }, "md-quick-cancel"), t("cancelCommand"));
  actions.appendChild(cancelButton);
  var applyButton = btn('<i class="ph ph-check"></i> ' + t("quickApply"), async function () {
    if (!ownsForm()) return;
    if (instance.applying) return instance.applying;
    if (!validateFeatureInputs(host)) return;
    // Publish before invoking user code, including synchronous/reentrant callbacks.
    // This promise is a settlement barrier for navigation, never a rejection.
    var releaseApply;
    instance.applying = new Promise(resolve => { releaseApply = resolve; });
    applyButton.disabled = cancelButton.disabled = true;
    failure.hidden = true;
    try {
      var submitted = read();
      var submittedDraft = JSON.stringify(submitted);
      var applied = await spec.onApply(submitted, ownsForm);
      // A resolved prompt may already have opened a replacement with the same action.
      if (!ownsForm()) return;
      if (applied === false) {
        if (spec.failureMessage) { failure.textContent = spec.failureMessage(); failure.hidden = false; }
        return;
      }
      if (JSON.stringify(read()) !== submittedDraft) {
        // Keep edits made during the operation, with the submitted values as baseline.
        instance.rememberInputs(read, JSON.parse(submittedDraft));
      } else close();
      if(!spec.presentationOnly&&!spec.drawingOnly)refreshAll();
    } catch (error) {
      if (ownsForm()) {
        failure.textContent = error?.message || String(error);
        failure.hidden = false;
      }
    } finally {
      instance.applying = null;
      if (ownsForm()) applyButton.disabled = cancelButton.disabled = false;
      releaseApply();
    }
  }, "md-quick-apply");
  actions.appendChild(applyButton);
  host.appendChild(actions);

  var first = inputs[spec.fields[0] && spec.fields[0].key];
  var openingFocus=document.activeElement,fieldInteracted=false;
  Object.keys(inputs).forEach(function(key){
    ["pointerdown","focus","input"].forEach(function(event){inputs[key].addEventListener?.(event,function(){fieldInteracted=true;});});
  });
  if (first) requestAnimationFrame(function () {
    // A busy frame may arrive after the user chose or typed another field.
    // Default focus must never steal that established caret/selection.
    if(!ownsForm() || fieldInteracted || document.activeElement!==openingFocus)return;
    try { first.focus(); if (first.select) first.select(); } catch (error) {}
  });
  syncCommandManager();
  if (document.body.classList.contains("compact-nav")) revealModelerFeatureForm();
  instance.rememberInputs(read);
  return inputs;
}

function commandCatalog() {
  var catalog=buildCommandCatalog({ t: t, editor: E, closedSketchProfile: closedSketchProfile, selectedAxisProfile:function(){var axis=preselectedRevolveAxis();return isSketchAxis(axis) && (revolveContour(axis) || revolveContour(axis,true));}, openSketchChain: function(){return analyzeSketchChains(ensureSketch(E.def)).chains.length>0;}, activeParts: activeParts, canonicalAuthoring: isCanonicalAuthoring });
  catalog.push({id:"temporaryaxes",label:"Temporary axes",group:"View",terms:"axis cylindrical conical centerline"});
  return catalog.map(function(command){var key=(E.commandShortcuts || {})[command.id];return key ? {...command,shortcut:key.toUpperCase()} : command;});
}

function commandUnavailableReason(id) {
  return catalogUnavailableReason(id, commandCatalog(), t("cmdUnavailable"));
}

/* The ribbon relations grey themselves from constraintFits, exactly as the
   inspector palette does. They carry `data-relation`, so the [data-command]
   sweep below never touches them. */
function syncRelationCommands() {
  if (!root) return;
  root.querySelectorAll("[data-relation]").forEach(function (b) {
    var id = b.getAttribute("data-relation");
    var d = CONSTRAINT_DEFS.filter(function (x) { return x.id === id; })[0];
    var name = d ? t(d.label) : id;
    var fits = constraintFits(id);
    markUnavailable(b, fits ? "" : name + " — " + t("selHint"), name + (d ? " — " + d.need : ""));
  });
}

function syncExplodeCommandState() {
  var assemblyMode=E.docType==='assembly',exploded=assemblyMode&&assemblyHasExplodedOffsets(E.assembly),label=t(exploded?"collapseExplodeView":"explodeAssembly");
  var buttons=Array.from(root.querySelectorAll('[data-command="explode"]'));
  if(root.ownerDocument)buttons.push(...root.ownerDocument.querySelectorAll('[data-pro-bind="mcmd:explode"]'));
  buttons.forEach(function(button){
    var text=button.querySelector('span');if(text)text.textContent=label;
    button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(exploded));
    if(!assemblyMode)button.setAttribute('aria-disabled','true');
    button.title=label+' · '+t(exploded?'assemblyExploded':'assemblyAssembled');
  });
}
function syncCommandManager() {
  if (!root) return;
  syncRelationCommands();
  var catalog = commandCatalog();
  /* Two of Direct's five buttons quietly become sketch tools in a parametric-v1
     document and the other three refuse outright, so the whole group goes away
     there. It is part-only besides — leaving it on in an assembly put five dead
     buttons back on the pane and pushed Features 340px past the fold, which is
     the overflow this ribbon was rebuilt to remove. Hidden, not removed:
     command search and legacy part documents still reach every one of them. */
  var directSeed = root.querySelector('[data-command="directbox"]');
  var direct = directSeed && directSeed.closest(".md-command-group");
  if (direct) direct.hidden = E.docType !== "part" || isCanonicalAuthoring();
  root.querySelectorAll("[data-command]").forEach(function (b) {
    var id = b.getAttribute("data-command"), def = catalog.find(function (c) { return c.id === id; });
    // a ribbon button is lit while its tool is picked *or* its feature form is open
    var feature = E.authoring && E.authoring.featureType;
    var why = (def && def.available && !def.available()) ? ((def.reason && def.reason()) || t("cmdUnavailable")) : "";
    b.classList.toggle("on", (id === "sarc" ? (E.tool === "sarc" && !E.arcThreePoint && !E.arcTangent) : id === E.tool) ||
      (id === "arc3point" && E.tool === "sarc" && !!E.arcThreePoint) ||
      (id === "tangentarc" && E.tool === "sarc" && !!E.arcTangent) ||
      (feature && id === FEATURE_COMMAND[feature]) || (id === "measure" && !!E.measure) || (id === "model3d" && E.mode === "3d"));
    b.classList.toggle("unavailable", !!why);
    b.setAttribute("aria-disabled", why ? "true" : "false");
    if (why) b.title = why;
    else if (COMMAND_TOOLTIP[id]) b.title = COMMAND_TOOLTIP[id]();
    else if (def) b.title = def.label + (def.shortcut ? " · " + def.shortcut : "");
  });
  syncExplodeCommandState();
}

function openCommandSearch(seed) {
  if (!root) return;
  var overlay = root.querySelector("#mdCommandSearch"), input = root.querySelector("#mdCommandSearchInput");
  E.commandSearchRestore = document.activeElement;
  E.commandHighlight = 0;
  overlay.hidden = false;
  input.value = seed || "";
  renderCommandResults();
  requestAnimationFrame(function () { input.focus(); input.select(); });
}

function closeCommandSearch() {
  var overlay = root && root.querySelector("#mdCommandSearch");
  var input = root && root.querySelector("#mdCommandSearchInput");
  if (overlay) overlay.hidden = true;
  if (input) input.setAttribute("aria-activedescendant", "");
  var restore = E.commandSearchRestore;
  E.commandSearchRestore = null;
  if (restore && restore !== input && typeof restore.focus === "function") {
    try { restore.focus(); } catch (error) {}
  }
}

function commandSearchOptionId(id) {
  return "mdCommandOption-" + String(id || "").replace(/[^a-z0-9_-]/gi, "");
}

function syncCommandSearchAria(commands) {
  var input = root && root.querySelector("#mdCommandSearchInput");
  if (!input) return;
  var list = commands || [];
  var active = list[E.commandHighlight] || list[0];
  input.setAttribute("aria-activedescendant", active ? commandSearchOptionId(active.id) : "");
}

function renderCommandResults() {
  if (!root) return;
  var input = root.querySelector("#mdCommandSearchInput"), host = root.querySelector("#mdCommandResults");
  var query = String(input.value || "").trim().toLowerCase();
  var list = commandCatalog().filter(function (c) {
    return !query || (c.label + " " + c.group + " " + (c.terms || "") + " " + (c.shortcut || "")).toLowerCase().indexOf(query) >= 0;
  }).slice(0, 12);
  host.innerHTML = "";
  if (!list.length) { E.commandHighlight = 0; input.setAttribute("aria-activedescendant", ""); host.appendChild(el("div", "md-command-empty", t("noCommands"))); return; }
  if (E.commandHighlight >= list.length) E.commandHighlight = 0;
  list.forEach(function (c, index) {
    var why = c.available && !c.available() ? ((c.reason && c.reason()) || t("cmdUnavailable")) : "";
    var row = el("button", "md-command-result" + (index === E.commandHighlight ? " selected" : "") + (why ? " unavailable" : ""));
    row.type = "button";
    row.id = commandSearchOptionId(c.id);
    row.setAttribute("role", "option");
    row.setAttribute("aria-disabled", why ? "true" : "false");
    row.dataset.command = c.id;
    row.appendChild(el("span", "md-search-icon", cadIcon(c.id || c.icon)));
    var copy = el("span", "copy");
    copy.appendChild(el("b", "", c.label));
    copy.appendChild(el("small", "", why || c.group));
    row.appendChild(copy);
    if (c.shortcut) row.appendChild(el("kbd", "", c.shortcut));
    row.addEventListener("click", function () {
      if (why) { flash(why); return; }
      runCommand(c.id);
    });
    host.appendChild(row);
  });
  syncCommandSearchAria(list);
}

function chromeSelectionInput() {
  var face = (E.topologySelection || []).some(function (r) { return r.kind === "face"; });
  var edge = (E.topologySelection || []).some(function (r) { return r.kind === "edge"; });
  var closed = !!closedSketchProfile();
  var sketchEntity = (E.ssel || []).some(function (item) { return item && item.type; });
  var featureSelected = !!(E.authoring && (E.authoring.featureSelection || []).length);
  return {
    face: face, edge: edge, closedSketch: closed, sketchEntity: sketchEntity,
    featureSelected: featureSelected,
    assembly: E.docType === "assembly",
    oneComponent: E.docType === "assembly" && E.componentSel.length >= 1,
    twoComponents: E.docType === "assembly" && E.componentSel.length === 2,
    topologyCount: (E.topologySelection || []).length,
    namedSelections: (E.def && E.def.namedSelections || []).length,
    hideable: !!(E.sel || (E.componentSel && E.componentSel.length)),
    hidden: !!(E.assembly && E.assembly.isolated),
    sketchPhase: E.authoring && E.authoring.phase === "sketch",
  };
}

/* Sketch geometry is not in the 3D viewport's pick set, so the Sketch filter
   has nothing to acquire there. It used to be selectable anyway and every
   click became a silent no-op — the filter said it was on, the model refused
   to select, and nothing explained why. The button is disabled instead. */
function selectionFilterAvailable(id) {
  if (id !== "sketch") return true;
  return E.mode !== "3d" || E.modelPlaneActive;
}

function setSelectionFilter(id) {
  id = id || "all";
  if (!selectionFilterAvailable(id)) { flash(t("selFilterSketch3d")); return; }
  E.selectionFilter = id;
  syncSelectionFilters();
}

/* Painted whenever the filter OR the mode changes: leaving the sketch view
   with the Sketch filter on has to both demote the filter and repaint. */
function syncSelectionFilters() {
  if (!root) return;
  if (!selectionFilterAvailable(E.selectionFilter)) E.selectionFilter = "all";
  root.querySelectorAll("[data-selfilter]").forEach(function (button) {
    var id = button.getAttribute("data-selfilter"), available = selectionFilterAvailable(id);
    button.classList.toggle("on", id === E.selectionFilter);
    button.disabled = !available;
    button.dataset.tip = available ? "" : t("selFilterSketch3d");
  });
}

function selectionFilterLabel(id) {
  var key = { face: "selFilterFace", edge: "selFilterEdge", vertex: "selFilterVertex", sketch: "selFilterSketch", body: "selFilterBody" }[id];
  return key ? t(key) : t("selFilterAll");
}

/* The filter the ACTIVE COMMAND needs, layered over the user's sticky filter
   rather than overwriting it. beginFacePick() used to assign E.selectionFilter
   directly and never put it back, so asking for a sketch plane silently reset
   a filter the user had chosen for the whole session.

   Fillet and chamfer are deliberately NOT forced to "edge": under All a face
   pick expands to its bounding edges, which is the fast way to fillet a boss,
   and prefer:"edge" would additionally make edges hidden behind the solid
   pickable. Their widened pick band is handled by the `finish` flag in
   topologyPickPixelRadius() instead. */
function collectingEndFace() {
  var type = E.authoring && !E.authoring.featureEdit ? E.authoring.featureType : null;
  var params = E.authoring && E.authoring.featurePreviewState && E.authoring.featurePreviewState.params;
  return (type === "extrude" || type === "extrudeCut") && isUpToFace(params && params.endCondition);
}

function commandSelectionPrefer() {
  if (E.facePick) return "face";
  if (fullRoundActive()) return "face";
  var type = E.authoring && !E.authoring.featureEdit ? E.authoring.featureType : null;
  // Shell and draft consume faces only; an edge picked here lands in the
  // selection and is then silently dropped by finishFeatureTargets().
  if (FACE_DRIVEN_OPERATIONS.has(type)) return "face";
  if (collectingEndFace()) return "face";
  if (E.collectingFeature && ["fillet", "chamfer"].includes(type)) return "all";
  return E.selectionFilter;
}

function setAssemblyMoveMode(mode) {
  E.assemblyMoveMode = ["x", "y", "z"].includes(mode) ? mode : "free";
  if (!root) return;
  root.querySelectorAll("[data-assembly-move]").forEach(function (button) {
    var active = button.getAttribute("data-assembly-move") === E.assemblyMoveMode;
    button.classList.toggle("on", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setMobileAddSelection(on) {
  E.mobileAddSelection = !!on;
  syncModelerMobile(true);
}

function clearMobileSelection() {
  E.sel = null;
  E.ssel = [];
  E.componentSel = [];
  E.topologySelection = [];
  if (E.authoring) E.authoring.featureSelection = [];
  E.mobileAddSelection = false;
  refreshAll();
}

function hideOverlay(id) {
  var node = root && root.querySelector(id);
  if (node) node.hidden = true;
}

function chromeCommandLabel(id) {
  var keys = {
    newsketch: "createSketch", extrude: "opExtrude", extrudecut: "extrudeCut", revolvefeature: "opRevolve",
    /* The cut/sweep/loft verbs reach the phone's docked action row, which asks
       for a label by command id. Without these the row printed the raw id
       ("sweepfeature") — t() returns its argument when the key is unknown. */
    revolvecutfeature: "opRevolveCut", sweepfeature: "opSweep", sweepcutfeature: "opSweepCut",
    loftfeature: "cap_loft", draftfeature: "draftOp",
    holefeature: "holeWizard", helixfeature: "opHelix", threadfeature: "opThread",
    knurlfeature: "opKnurl", insertfeature: "opInsert", shellfeature: "shellOp", filletfeature: "quickFillet",
    chamferfeature: "quickChamfer", patternfeature: "quickPattern", finishsketch: "finishSketch",
    dim: "tool_dim", trim: "tool_trim", sketchfillet: "sketchFillet", select: "tool_select", wall: "cap_wall",
    srect: "cap_srect", scirc: "cap_scirc", editfeature: "ctxEditFeature",
    rollbackhere: "ctxRollbackHere", mates: "mate", isolate: "isolate",
    components: "components", explode: "explodeView", interference: "interferenceCheck",
    fit: "zoomFit", regen: "regenerate", normalTo: "normalTo", hide: "ctxHide",
    showall: "ctxShowAll", selectloop: "selectLoopCmd", selecttangency: "selectTangencyCmd",
    selectconnected: "selectConnectedCmd", selectinvert: "selectInvertCmd",
    selectgrow: "selectGrowCmd", selectshrink: "selectShrinkCmd",
    selectsave: "nameSelection", selectrecall: "selectionSets",
  };
  return t(keys[id] || id);
}

function fillActionHost(host, items, close) {
  if (!host) return;
  host.innerHTML = "";
  var showLabels = host.id === "mdContextToolbar" || (host.classList && host.classList.contains("md-context-toolbar"));
  items.forEach(function (item) {
    var label = chromeCommandLabel(item.id);
    var content = cadIcon(item.id || item.icon);
    if (showLabels && label) {
      content += "<span class=\"md-action-label\">" + label + "</span>";
    }
    if (item.shortcut) {
      content += "<kbd>" + item.shortcut + "</kbd>";
    }
    var button = el("button", "", content);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      if (close) close();
      runChromeCommand(item.id);
    });
    host.appendChild(button);
  });
}

function runChromeCommand(id) {
  if (["selectloop", "selecttangency", "selectconnected", "selectinvert", "selectgrow", "selectshrink"].includes(id)) {
    runSelectionOperation(id);
    return;
  }
  if (id === "selectsave") { saveNamedSelection(); return; }
  if (id === "selectrecall") { showNamedSelections(false); return; }
  if (id === "editfeature") {
    var featureId = E.authoring && (E.authoring.featureSelection || [])[0];
    var feature = featureId && (E.def.features || []).find(function (item) { return item.id === featureId; });
    if (feature) openFeatureEditor(feature);
    return;
  }
  if (id === "rollbackhere") {
    var featureId = E.authoring && (E.authoring.featureSelection || [])[0];
    var index = featureHistoryIndex(E.def.history, featureId);
    if (index >= 0) { pushUndo(t("ctxRollbackHere")); setHistoryRollback(E.def, index); refreshAll(); }
    return;
  }
  if (id === "normalTo") { orientModelToView(true); drawSketch(); return; }
  if (id === "hide") { hideSelected(); return; }
  if (id === "showall" || id === "isolate") { toggleIsolate(); return; }
  runCommand(id);
}

function hideSelected() {
  if (E.docType === "assembly" && E.componentSel.length) {
    E.componentSel.forEach(function (c) { c.visible = false; });
    invalidateInterference();
    refreshAll();
    return;
  }
  if (E.sel && E.sel.id) { E.sel.suppressed = true; refreshAll(); }
}

function toggleIsolate() {
  if (E.docType !== "assembly" || !E.assembly) return;
  if (E.assembly.isolated) {
    (E.assembly.components || []).forEach(function (c) { c.visible = true; });
    E.assembly.isolated = false;
    invalidateInterference();
    flash(t("isolateOff"));
    refreshAll();
    return;
  }
  var selected = (E.componentSel || []).map(function (c) { return c.id; });
  if (!selected.length) { flash(t("cmdNeedOneComponent")); return; }
  isolateVisibility(E.assembly.components, selected).forEach(function (row) {
    var component = E.assembly.components.find(function (c) { return c.id === row.id; });
    if (component) component.visible = row.visible;
  });
  E.assembly.isolated = true;
  invalidateInterference();
  flash(t("isolate"));
  refreshAll();
}

function syncSelectionChrome() {
  if (!root) return;
  syncSketchEntityNavigator();
  syncFeatureNavigator();
  var input = chromeSelectionInput();
  var toolbar = root.querySelector("#mdContextToolbar");
  var items = contextToolbarItems(input);
  var picked = input.face || input.edge || input.sketchEntity || input.featureSelected || input.oneComponent;
  if (toolbar) {
    // Floating context toolbar disabled for now per user request
    toolbar.hidden = true;
  }
  var crumbs = selectionBreadcrumb({
    reference: (E.topologySelection || [])[0],
    part: E.sel && E.sel.kind ? E.sel : null,
    component: E.docType === "assembly" ? E.componentSel[E.componentSel.length - 1] : null,
  });
  var bar = root.querySelector("#mdBreadcrumb");
  if (bar) {
    bar.hidden = !crumbs.length;
    /* Face › Feature › Body walks the selection. selectionBreadcrumb() has
       always returned the id beside each label; joining them into a string
       threw that away and left a line that looked interactive and was not.
       Clicking Body drops to the solid, Feature opens the step that made it. */
    bar.innerHTML = "";
    crumbs.forEach(function (crumb, index) {
      if (index) bar.appendChild(el("span", "md-breadcrumb-sep", "›"));
      var button = el("button", "md-breadcrumb-step");
      button.type = "button";
      // textContent, not innerHTML: a crumb label can be a model or body name,
      // which is whatever the user typed into it.
      button.textContent = crumb.label;
      button.dataset.crumbKind = crumb.kind;
      button.addEventListener("click", function () { pickBreadcrumb(crumb); });
      bar.appendChild(button);
    });
  }
  syncModelerMobile();
}

function openSketchPointCoordinates(sketch,point) {
  if(!point)return;
        var coordinateError="",surfaceUV=sketch.frameSpace==="surface-uv";
        openQuickForm({action:"pointcoordinates",title:"Point coordinates",hint:surfaceUVGuide(sketch)||"Locate and constrain this point on its sketch plane.",failureMessage:function(){return coordinateError;},fields:[
          {key:"x",label:surfaceUV?"U coordinate":"Horizontal coordinate",type:"number",value:point.x,unit:"length"},
          {key:"y",label:surfaceUV?"V coordinate":"Vertical coordinate",type:"number",value:point.y,unit:"length"}
        ],onApply:function(values){
          var x=Number(values.x),y=Number(values.y);if(!Number.isFinite(x)||!Number.isFinite(y))return false;
          pushUndo("Point coordinates");var previous=cloneData(sketch.constraints),oldPoint={x:point.x,y:point.y,fixed:point.fixed};
          sketch.constraints=sketch.constraints.filter(function(c){return !(c.type==='fixed'&&c.point===point.id);});
          point.fixed=false;sketch.constraints.push({id:uid(),type:"fixed",point:point.id,x:x,y:y});
          if(!resolveSketch(true)){var fixIds=addedConstraintIds(sketch,previous),fixWhy=explainSketchConflict(sketch,{keep:fixIds}),fixSubject=constraintCaption(sketch.constraints[sketch.constraints.length-1],sketch);sketch.constraints=previous;Object.assign(point,oldPoint);resolveSketch(false);H.discard();coordinateError=refusalMessage(sketch,fixSubject,fixIds,fixWhy)+" For linked endpoints, use Translate sketch geometry to move them together, or edit the conflicting relation.";showSketchRefusal(sketch,fixSubject,fixIds,fixWhy);return false;}
          refreshAll();return true;
        }});
}

function syncSketchEntityNavigator() {
  var strip=root.querySelector("#mdEntityNav");if(!strip)return;
  var sketch=(E.def.sketches || []).find(function(item){return item.id===E.def.activeSketch;});
  var entities=sketch && sketch.entities || [];
  var formOpen=!!root.querySelector("#mdQuickSettings:not([hidden])");
  var visible=E.docType!=="assembly" && E.mode!=="drawing" && !formOpen && E.tool==="select" && (E.mode==="2d" || E.authoring?.phase==="sketch") && entities.length>0;
  strip.hidden=!visible;strip.innerHTML="";if(!visible)return;
  var hebrew=getLang()!=="en",selected=selectedSketchNavigationEntity(sketch,E.ssel || []);
  if(!entities.includes(selected))selected=null;
  function step(direction){
    var currentSketch=(E.def.sketches || []).find(function(item){return item.id===E.def.activeSketch;});
    var chosen=sketchEntityStep(currentSketch?.entities || [],selectedSketchNavigationEntity(currentSketch,E.ssel || []),direction);
    var target=sketchNavigationTarget(currentSketch,chosen);
    if(target){selectSketch(target,false);refreshSelection();}
  }
  var gesture=null;
  strip.onpointerdown=function(event){if(event.pointerType!=="touch" || !event.isPrimary)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY};};
  strip.onpointerup=function(event){
    if(!gesture || gesture.id!==event.pointerId)return;
    var direction=sketchEntitySwipe(event.clientX-gesture.x,event.clientY-gesture.y,getComputedStyle(strip).direction==="rtl");gesture=null;
    if(direction){event.preventDefault();strip.dataset.suppressSwipeClick=String(Date.now()+500);step(direction);}
  };
  strip.onpointercancel=function(){gesture=null;};
  if(!strip.dataset.swipeClickBound){strip.dataset.swipeClickBound="true";strip.addEventListener("click",function(event){if(Number(strip.dataset.suppressSwipeClick)>Date.now()){delete strip.dataset.suppressSwipeClick;event.preventDefault();event.stopImmediatePropagation();}},true);}
  var previous=btn("‹",function(){step(-1);});previous.setAttribute("aria-label",hebrew?"הישות הקודמת בסקיצה":"Previous sketch entity");strip.appendChild(previous);
  var caption=el("span","md-entity-nav-caption");caption.setAttribute("aria-live","polite");
  caption.textContent=selected?(selected.name || selected.type)+" · "+(entities.indexOf(selected)+1)+" / "+entities.length:(hebrew?"בחר ישות בסקיצה":"Browse sketch entities")+" · "+entities.length;
  caption.title=hebrew?"החלק ימינה או שמאלה לבחירת ישות":"Swipe left or right to select an entity";
  strip.appendChild(caption);
  var next=btn("›",function(){step(1);});next.setAttribute("aria-label",hebrew?"הישות הבאה בסקיצה":"Next sketch entity");strip.appendChild(next);
  var parameters=btn(hebrew?"פרמטרים":"Parameters",function(){
    var currentSketch=ensureSketch(E.def),entity=selectedSketchNavigationEntity(currentSketch,E.ssel || []);
    if(entity?.type==='point'){openSketchPointCoordinates(currentSketch,sketchNavigationTarget(currentSketch,entity));return;}
    setTab("shape");showModelerSheet("props");
  });
  parameters.disabled=!selected;parameters.setAttribute("aria-label",hebrew?"פרמטרים של הישות שנבחרה":"Selected entity parameters");strip.appendChild(parameters);
}

function syncFeatureNavigator() {
  var strip=root.querySelector('#mdFeatureNav');if(!strip)return;
  var model=currentTreeModel(),nodes=featureBrowseNodes(model);
  var formOpen=!!root.querySelector('#mdQuickSettings:not([hidden])');
  strip.hidden=E.docType!=='part'||E.mode!=='3d'||E.authoring?.phase==='sketch'||formOpen||!nodes.length;
  strip.innerHTML='';if(strip.hidden)return;
  var owner=E.def,hebrew=getLang()!=='en';
  var chosen=nodes.find(function(node){return node.kind==='feature'?(E.authoring.featureSelection || []).includes(node.targetId):(E.authoring.sketchSelection || []).includes(node.targetId);});
  function pick(id){
    if(E.def!==owner)return;
    var fresh=currentTreeModel(),node=featureBrowseNodes(fresh).find(function(item){return item.id===id;});
    if(!node||node.suppressed||node.rolled)return;
    if(node.kind==='sketch'){
      E.authoring.featureSelection=[];E.authoring.sketchSelection=[node.targetId];E.topologySelection=[];E.ssel=[];
      var consuming=(E.def.features || []).find(function(feature){return feature.references?.sketches?.some(function(ref){return (ref.id || ref)===node.targetId;})||feature.params?.sketchId===node.targetId;});
      E.sel=consuming?partsForFeature(consuming.id)[0] || null:null;
      refreshAll();
    }else selectTreeNode(node,fresh,null);
  }
  function step(direction){var index=chosen?nodes.indexOf(chosen):(direction>0?-1:0);for(var i=0;i<nodes.length;i++){index=(index+direction+nodes.length)%nodes.length;if(!nodes[index].suppressed&&!nodes[index].rolled){pick(nodes[index].id);return;}}}
  var previous=btn('‹',function(){step(-1);});previous.setAttribute('aria-label',hebrew?'השלב הקודם':'Previous feature');strip.appendChild(previous);
  strip.appendChild(el('span','md-feature-nav-icon',cadIcon(chosen?.icon || 'feature')));
  var select=el('select','md-feature-nav-select');select.setAttribute('aria-label',hebrew?'עיון בשלבי המודל':'Browse model features');
  var placeholder=el('option');placeholder.value='';placeholder.textContent=hebrew?'בחר שלב במודל':'Choose a model feature';select.appendChild(placeholder);
  nodes.forEach(function(node,index){var option=el('option');option.value=node.id;option.textContent=(index+1)+'. '+node.name+' · '+node.detail;option.disabled=!!(node.suppressed||node.rolled);select.appendChild(option);});
  select.value=chosen?.id || '';select.title=chosen?chosen.name+' · '+chosen.detail:placeholder.textContent;
  select.addEventListener('change',function(){pick(select.value);});strip.appendChild(select);
  var next=btn('›',function(){step(1);});next.setAttribute('aria-label',hebrew?'השלב הבא':'Next feature');strip.appendChild(next);
  var tree=btn(hebrew?'עץ':'Tree',function(){showModelerSheet('tree');});tree.setAttribute('aria-label',hebrew?'פתח עץ מודל מלא':'Expand feature tree');strip.appendChild(tree);
}

/* Each crumb names something already in the document, so selecting it is a
   lookup rather than a pick. A crumb whose target has gone (a feature rolled
   back, a body suppressed) selects nothing rather than throwing. */
function pickBreadcrumb(crumb) {
  if (!crumb) return;
  if (crumb.kind === "feature") {
    var feature = (E.def.features || []).find(function (item) { return item.id === crumb.id; });
    if (feature) { openFeatureEditor(feature); return; }
  }
  if (crumb.kind === "body" || crumb.kind === "feature") {
    var part = (E.def.parts || []).find(function (item) { return String(item.id) === String(crumb.id) || item.featureId === crumb.id; });
    if (!part) return;
    E.sel = part;
    E.topologySelection = [];
    E.ssel = [];
    refreshSelection();
    return;
  }
  if (crumb.kind === "component" && E.assembly) {
    var component = (E.assembly.components || []).find(function (item) { return item.id === crumb.id; });
    if (!component) return;
    E.componentSel = [component];
    E.sel = component;
    refreshSelection();
    return;
  }
  // A face or edge crumb is the pick itself: keep it, and clear the rest.
  var reference = (E.topologySelection || []).find(function (item) { return item.persistentId === crumb.id; });
  if (!reference) return;
  E.topologySelection = [reference];
  refreshSelection();
}

function closeChromeOverlays() {
  hidePickCycle();
  E.overlays.shortcut = false;
  E.overlays.views = false;
  E.overlays.menu = false;
  E.overlays.gesture = false;
  hideOverlay("#mdShortcutBar");
  hideOverlay("#mdViewSelector");
  hideOverlay("#mdContextMenu");
  hideOverlay("#mdGestureWheel");
}

function showShortcutBar() {
  var host = root && root.querySelector("#mdShortcutBar");
  if (!host) return;
  closeChromeOverlays();
  E.overlays.shortcut = true;
  host.hidden = false;
  host.innerHTML = "";
  host.appendChild(el("div", "md-overlay-caption", t("shortcutBar")));
  var row = el("div", "md-shortcut-row");
  fillActionHost(row, shortcutBarItems({
    sketchPhase: E.authoring && E.authoring.phase === "sketch",
    assembly: E.docType === "assembly",
  }), closeChromeOverlays);
  host.appendChild(row);
}

function showViewSelector() {
  var host = root && root.querySelector("#mdViewSelector");
  if (!host) return;
  closeChromeOverlays();
  E.overlays.views = true;
  host.hidden = false;
  host.innerHTML = "";
  host.appendChild(el("div", "md-overlay-caption", t("viewSelector")));
  var labels = { front: t("view_front"), top: t("view_top"), bottom: t("view_bottom"), right: t("view_right"), back: t("view_back"), left: t("view_left"), iso: t("isoView"), normalTo: t("normalTo") };
  VIEW_PRESETS.forEach(function (preset) {
    var button = el("button", "", (labels[preset.id] || preset.id) + (preset.shortcut ? " · " + preset.shortcut : ""));
    button.type = "button";
    button.addEventListener("click", function () {
      closeChromeOverlays();
      if (preset.id === "normalTo") orientModelToView(true);
      else if (preset.id === "top" || preset.id === "front") setView(preset.id);
      else if (preset.id === "right") setView("side");
      if (E.pv && preset.az != null) E.pv.orbitTo(preset.az, preset.el);
      drawSketch();
    });
    host.appendChild(button);
  });
  host.appendChild(btn('Save current view…',openNamedCameraViewForm));
  var owner=E.docType==='assembly'?E.assembly:E.def;
  try{namedCameraViews(owner).forEach(function(saved){
    var row=el('div','md-feature-actions');
    row.appendChild(btn(saved.name,function(){
      if(owner!==(E.docType==='assembly'?E.assembly:E.def)){flash('The view owner changed');return;}
      try{var current=namedCameraViews(owner).find(function(record){return record.id===saved.id;});if(!current)throw new Error('The named view no longer exists');restoreNamedCameraPose(E.pv,current.pose,namedCameraCenterY());closeChromeOverlays();syncViewButtons();drawSketch();}catch(error){flash(error.message);}
    }));
    row.appendChild(btn('Delete '+saved.name,function(){
      if(owner!==(E.docType==='assembly'?E.assembly:E.def)){flash('The view owner changed');return;}
      if(!namedCameraViews(owner).some(function(record){return record.id===saved.id;})){flash('The named view no longer exists');return;}
      pushUndo('Delete named view');var live=E.docType==='assembly'?E.assembly:E.def;
      if(removeNamedCameraView(live,saved.id)){scheduleModelerDraft();syncDirty();syncUndoButtons();showViewSelector();}
    }));host.appendChild(row);
  });}catch(error){host.appendChild(el('small','',error.message));}
}

function namedCameraCenterY(){if(E.docType==='assembly')return 0;var bounds=defBounds(E.def);return (bounds.y0+bounds.y1)/2;}
function openNamedCameraViewForm(){
  var owner=E.docType==='assembly'?E.assembly:E.def,type=E.docType,history=currentHistoryNode(),pose;
  try{pose=captureNamedCameraPose(E.pv,namedCameraCenterY());}catch(error){flash(error.message);return;}
  closeChromeOverlays();
  openQuickForm({action:'namedcameraview',title:'Save current view',hint:'Save this camera orientation, framing and projection on the current document. Model geometry is unchanged.',fields:[{key:'name',label:'View name',type:'text',value:''}],onApply:function(values){
    if(type!==E.docType||owner!==(E.docType==='assembly'?E.assembly:E.def)||currentHistoryNode()!==history){flash('The document changed while naming the view');return false;}
    var recordId=String(uid());
    try{var preview=cloneData(owner);addNamedCameraView(preview,{id:recordId,name:values.name,pose:pose});}catch(error){flash(error.message);return false;}
    pushUndo('Save named view');var live=E.docType==='assembly'?E.assembly:E.def;
    addNamedCameraView(live,{id:recordId,name:values.name,pose:pose});scheduleModelerDraft();syncDirty();syncUndoButtons();return true;
  }});
}

function showContextMenu(clientX, clientY, view) {
  var host = root && root.querySelector("#mdContextMenu");
  if (!host) return;
  closeChromeOverlays();
  E.overlays.menu = true;
  host.hidden = false;
  host.innerHTML = "";
  /* Grouped, because the menu now carries two kinds of thing: what to select
     next, and what to build from it. Run together they read as one undivided
     list and the selection operations get lost among the features. */
  var lastGroup = null;
  contextMenuItems(chromeSelectionInput()).forEach(function (item) {
    if (lastGroup !== null && item.group !== lastGroup) host.appendChild(el("div", "md-context-sep"));
    lastGroup = item.group;
    var button = el("button", "", cadIcon(item.id || item.icon) + "<span>" + chromeCommandLabel(item.id) + "</span>");
    button.type = "button";
    button.addEventListener("click", function () { closeChromeOverlays(); runChromeCommand(item.id); });
    host.appendChild(button);
  });
  var mid = root.querySelector(".md-mid").getBoundingClientRect();
  host.style.left = Math.max(8, clientX - mid.left) + "px";
  host.style.top = Math.max(8, clientY - mid.top) + "px";
}

function previewMouseGesture(event, view, dx, dy) {
  var wheel = root && root.querySelector("#mdGestureWheel");
  if (!wheel) return;
  var dist = Math.hypot(dx || 0, dy || 0);
  var active = dist >= 24;
  wheel.hidden = !active;
  E.overlays.gesture = active;
  var id = gestureFromSwipe(dx, dy, 24);
  wheel.querySelectorAll("[data-cmd]").forEach(function (span) {
    span.classList.toggle("on", span.getAttribute("data-cmd") === id);
  });
}

function applyMouseGesture(dx, dy) {
  var id = gestureFromSwipe(dx, dy);
  hideOverlay("#mdGestureWheel");
  E.overlays.gesture = false;
  if (!id) return;
  if (id === "normalTo") { orientModelToView(true); drawSketch(); return; }
  runCommand(id);
}

function finishActiveCommand() {
  var corner = confirmationCornerState(currentCornerInput());
  if (dynHasEntry() && dynCommit()) { syncContextActions(); return; }
  if (corner.mode === "feature") {
    var apply = root.querySelector("#mdQuickSettings .md-quick-apply");
    if (apply) {
      if (apply.modelerApply) return apply.modelerApply();
      apply.click();
    }
    return;
  }
  if (corner.mode === "sketch") { finishSketchWorkflow(); return; }
  if (E.wallPts) finishWallChain(false);
  else if (E.poly) {
    if (E.poly.length < 3) { flash(t("polyHint")); return; }
    finishPoly();
  }
  syncContextActions();
}

function cancelActiveCommand() {
  if(E.quickAction){
    var quickCancel=root && root.querySelector('.md-quick-cancel');
    if(quickCancel){
      var quickActions=quickCancel.closest('.md-feature-actions');
      if(quickActions && quickActions.hidden)quickActions.hidden=false;
      quickCancel.click();return;
    }
  }
  cancelCadWorkerWork();
  var corner = confirmationCornerState(currentCornerInput());
  if (corner.mode === "feature") {
    if (E.authoring && E.authoring.featureEdit) cancelFeatureParameterEdit(false);
    else { E.authoring.featureType = null; clearFeaturePreview(true); closeFeaturePanel(); }
    syncAuthoringWorkflow();
    syncContextActions();
    return;
  }
  if (corner.mode === "sketch") {
    E.authoring.phase = "model";
    E.authoring.workflowFocus = "context";
    E.modelPlaneActive = false;
    setMode("3d");
    restoreSketchCameraPose();
    syncAuthoringWorkflow();
    syncContextActions();
    return;
  }
  if (E.wallPts) finishWallChain(true);
  E.poly = null;
  E.arcPts = null;
  E.slotPts = null;
  E.ellPts = null;
  E.splinePts = null;
  E.dynInput = null;
  E.drag = null;
  E._osnap = null;
  drawSketch();
  syncHint();
  syncContextActions();
}

function featureSelectionReady() {
  var type = E.authoring && E.authoring.featureType;
  if (E.authoring && E.authoring.featureEdit) return true;
  if (type==="loft") return (activeLoftCreation()?.loftSectionIds.length || 0)>=2;
  return !["fillet","chamfer","shell","dome","draft","thicken"].includes(type) || !!(selectedSolid() && finishFeatureTargets(type).length && E.authoring.finishPreviewStatus === "ready");
}

function returnToFeatureParameters() {
  E.collectingFeature = false;
  if (document.body.classList.contains("compact-nav")) revealModelerFeatureForm();
  syncContextActions();
}

function currentCornerInput() {
  var drawing = !!(E.wallPts || E.poly || E.arcPts || E.slotPts || E.ellPts || (E.drag && E.drag.sticky));
  return {
    drawing: drawing,
    canAccept: !E.arcPts && !(E.poly && E.poly.length < 3) && !((E.slotPts || E.ellPts || (E.drag && E.drag.sticky)) && !dynHasEntry()),
    toolLabel: ({ wall:t("tool_wall"), constr:t("cap_constr"), poly:t("tool_poly"), cut:t("tool_cut"), rev:t("tool_rev"), sarc:t("tool_sarc"),
      sslot:t("tool_sslot"), sell:t("tool_sell"), spoly:t("tool_spoly"), srect:t("tool_srect"), scirc:t("tool_scirc") })[E.tool],
    featureReady: featureSelectionReady(),
    featureType: E.authoring && E.authoring.featureType,
    featureLabel: E.authoring && E.authoring.featureType && featureTypeLabel(E.authoring.featureType),
    sketchPhase: E.authoring && E.authoring.phase === "sketch" && !drawing,
    finishSketchLabel: t("finishSketch"),
  };
}

/* The offer that replaces the auto-extrude. A closed profile lights the four
   features that can consume it, in the confirmation corner where the sketch's
   own accept button just was — so the next click is one click away without the
   editor having decided which. Enter takes the first, which is Extrude: the
   common case still costs one keystroke, it just is not silently assumed. */
function offerProfileFeatures() {
  var host = root && root.querySelector("#mdProfileOffer");
  var choices = featuresForClosedProfile(!!closedSketchProfile());
  if (!host) return;
  E.profileOffer = choices.length ? choices : null;
  host.hidden = !choices.length;
  host.innerHTML = "";
  if (!choices.length) return;
  host.appendChild(el("span", "md-profile-offer-label", t("profileOfferLabel")));
  choices.forEach(function (type, index) {
    var command = FEATURE_COMMAND[type];
    var label = chromeCommandLabel(command);
    var button = el("button", index ? "" : "btn-accent", cadIcon(command) + "<span>" + label + "</span>");
    button.type = "button";
    button.title = label + (index ? "" : " · Enter");
    button.addEventListener("click", function () {
      dismissProfileOffer();
      setCommandTab("features");
      openParametricFeature(type);
    });
    host.appendChild(button);
  });
}

function dismissProfileOffer() {
  E.profileOffer = null;
  var host = root && root.querySelector("#mdProfileOffer");
  if (host) { host.hidden = true; host.innerHTML = ""; }
}

function syncContextActions() {
  var bar = root && root.querySelector("#mdContextActions");
  if (!bar) return;
  var state = confirmationCornerState(currentCornerInput());
  bar.hidden = !state.visible;
  if (state.visible) {
    root.querySelector("#mdActiveCommand").textContent = state.label || t("cmdSketch");
    root.querySelector("#mdAcceptCommand").disabled = !state.canAccept;
  }
  var parameters = root.querySelector("#mdReturnParameters");
  if (!parameters) {
    parameters = btn(t("returnToParameters"), returnToFeatureParameters);
    parameters.id = "mdReturnParameters"; bar.appendChild(parameters);
  }
  parameters.hidden = !E.collectingFeature;
  syncDuplicateCommit(state);
  syncSelectionChrome();
}

/* Two commit buttons is one too many. While the corner is up it already owns
   the beat — green check, red X, Enter, Esc — and the feature form's own
   apply/cancel pair repeats it a panel-width away from the geometry the user
   is looking at, which is the one place they are not. The row is hidden rather
   than removed: finishActiveCommand invokes its native Apply handler, so
   both routes commit through exactly one code path and cannot drift apart.
   On compact screens the labelled thumb row owns these same actions and stays
   above the sheet and software keyboard, so the form can give its space back. */
function syncDuplicateCommit(state) {
  var actions = root && root.querySelector("#mdQuickSettings .md-feature-actions");
  if (!actions) return;
  var cornerOwnsCommit = state.visible && state.mode === "feature";
  actions.hidden = cornerOwnsCommit;
}

async function leavingQuickForm(leave) {
  var form = E.quickFormInstance;
  if (form?.applying) {
    await form.applying;
    if (!E.open || !form.ownsDocument() || (E.quickFormInstance && E.quickFormInstance !== form)) return false;
  }
  if (!E.quickFormInstance?.hasPendingEdits()) return leave();
  if (!await confirmDiscardDocument("unappliedCommand")) return false;
  E.quickFormInstance.dismiss(true);
  return leave();
}

export {
  applyMouseGesture, cancelActiveCommand, chromeCommandLabel,
  chromeSelectionInput, clearMobileSelection, closeChromeOverlays,
  closeCommandSearch, collectingEndFace, commandCatalog,
  commandSelectionPrefer, commandUnavailableReason, currentCornerInput,
  dismissProfileOffer, featureSelectionReady, finishActiveCommand,
  leavingQuickForm, offerProfileFeatures, openCommandSearch, openQuickForm,
  openSketchPointCoordinates, previewMouseGesture, renderCommandResults,
  returnToFeatureParameters, runChromeCommand, selectionFilterAvailable,
  selectionFilterLabel, setAssemblyMoveMode, setMobileAddSelection,
  setSelectionFilter, showContextMenu, showShortcutBar, showViewSelector,
  syncCommandManager, syncContextActions, syncExplodeCommandState,
  syncSelectionFilters, toggleIsolate,
};

/* The CAD editor's cut notes, pattern curves, document snapshots, save
   sessions, history markers, drafts, undo and UV path helpers, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { nextDocumentNumericId } from "../core/document_ids.js";
import { pointerCameraRay } from "../core/editor_projection.js";
import { framePoint, frameProjectPoint } from "../core/frame.js";
import { isKernelBody } from "../core/kernel_body.js";
import { projectMeshEdges } from "../core/mesh_projection.js";
import { clearModelerDraftRecord } from "../core/model_library_store.js";
import { restoreNestedComponentEdit } from "../core/nested_component_edit.js";
import { ensureParametricDocument } from "../core/parametric_document.js";
import { curvePatternPath, curvePatternPlacements, linearPatternOffsets, parseSkippedPatternInstances } from "../core/pattern_geometry.js";
import { sketchWorldPoint } from "../core/swept_sources.js";
import { askModelerDecision } from "../modeler_decision.js";
import { clearModelerDraft, freshModelerDraftOwner, readModelerDraft } from "../modeler_draft.js";
import { holeLoop } from "../modeler_mesh_geometry.js";
import { movePart, partBounds, revMaxR } from "../modeler_part_geometry.js";
import { syncSaveButtonAccessibility } from "../modeler_save_button.js";
import { t } from "../modeler_strings.js";
import { closeEvalCard } from "../modeler/document_outputs.js";
import { setDocumentType } from "../modeler/document_save.js";
import { sketchLinePoints } from "./drawing_sheet_profiles.js";
import { flash } from "./drawing_sheet_touch.js";
import { el } from "../modeler/editor_dom.js";
import { scheduleExactRestore } from "../modeler/export_measure.js";
import { selectedSketchIds } from "../modeler/feature_create.js";
import { invalidateInterference } from "../modeler/library_assembly_state.js";
import { syncHead } from "../modeler/library_io.js";
import { activeParts, migrateDefinitionProfileCuts } from "../modeler/library_store.js";
import { newDef, restoreKernelBodies } from "../modeler/prefs_snap.js";
import { resolveSketch, syncStatus } from "../modeler/sketch_entities.js";
import { isCanonicalAuthoring, syncAssemblyWorkflow } from "../modeler/sketch_workflow.js";
import { partsForFeature } from "../modeler/tree_assembly.js";
import { fitPreview } from "../modeler/view_modes.js";
import { ensureSketch, ensureSketchDoc, solveSketch } from "../sketch_solver.js";
import { S, fin, uid } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  CONSTRAINT_DEFS, E, H, _scratchSketchDir, _scratchSketchNdc,
  _scratchSketchRayOrigin, assemblySaveSessions, closeModeler, draftRevision,
  draftSaveTimer, flushModelerDraft, histPanel, historySnapshots,
  modelerBackgroundState, modelerDraftCache, modelerDraftOwnerId,
  partHistoryMarker, refreshAll, root, set__scratchSketchDir,
  set__scratchSketchNdc, set__scratchSketchRayOrigin,
  set_assemblyOpenBaseline, set_draftRevision, set_draftSaveTimer,
  set_libraryOpenBaseline, set_modelerBackgroundState, set_modelerDraftCache,
  set_modelerDraftOwnerId, set_partHistoryMarker,
} from "../modeler.js";

/* What to add to the "cut applied" message when some body under the loop could
   not take it. Empty when every body was cut. */
function cutSkipNote() {
  var skipped = E.lastCutSkipped || [];
  if (!skipped.length) return "";
  return " · " + t("cutSkipped") + ": " + skipped.join(", ");
}



/* The curve a curve pattern runs along is authored as a sketch and stored as
   the world polyline every consumer reads — the same trade sweep makes, and
   the reason pattern_geometry.js never has to know what a sketch is. Only an
   Pattern command being AUTHORED may reach for the selection: a document being
   rebuilt already carries its own path, and an edit of an existing pattern must
   not be re-aimed at whatever sketch happens to be active. */
function resolvePatternCurvePath(params) {
  if(!params || params.mode!=="curve" || curvePatternPath(params).length>=2)return params;
  if(!E.authoring || E.authoring.featureType!=="pattern" || E.authoring.featureEdit)return params;
  var sketch=patternCurveSketch();
  if(!sketch)return params;
  var points=(sketch.points || []).map(function(point){return sketchWorldPoint(sketch,point.x,point.y);});
  return points.length>=2 ? {...params,path:points} : params;
}

function patternCurveSketch() {
  var ids=selectedSketchIds();
  for(var index=0;index<ids.length;index++){
    var sketch=(E.def.sketches || []).find(function(item){return item.id===ids[index];});
    if(sketch && (sketch.points || []).length>=2)return sketch;
  }
  return null;
}

function patternPlacements(params) {
  var count=Math.max(2,Math.min(100,Math.round(Number(params && params.count)||2)));
  // The curve layout carries its own count and its own turn per copy.
  if(params && params.mode==="curve")return curvePatternPlacements(resolvePatternCurvePath(params));
  if(params && params.mode==="circular"){
    var skipped=parseSkippedPatternInstances(params.skipInstances);
    return Array.from({length:count-1},function(_,index){return {circularIndex:index+1,instance:index+1};}).filter(function(placement){return !skipped.has(placement.instance);});
  }
  return linearPatternOffsets(params || {},count);
}

function snapDoc() {
  // Component authoring has an isolated working definition. Its unchanged
  // parent assembly is not part of these local sketch edits: serializing it
  // into sixty Undo entries duplicated every other native body many times.
  if (E.contextEdit) return historySnapshots.stringify({d:E.def,contextComponentId:E.contextEdit.componentId,contextComponentPath:E.contextEdit.path});
  return historySnapshots.stringify({ d: E.def, a: E.assembly });
}

function assemblySaveSession(assembly) {
  if (!assembly) return null;
  if (!assemblySaveSessions.has(assembly)) assemblySaveSessions.set(assembly,{savedEdit:0});
  return assemblySaveSessions.get(assembly);
}
function activeHistoryMarker() {
  return E.docType === "assembly" && E.assembly ? assemblySaveSession(E.assembly) : partHistoryMarker;
}

// The history tree is shared, but editing one resident does not dirty the other.
// Component-local history belongs to the working copy until Finish edits the parent.
function residentDirtyState() {
  return {
    part: !!E.def && H.editRevision("part") !== partHistoryMarker.savedEdit,
    assembly: !!E.assembly && H.editRevision("assembly") !== assemblySaveSession(E.assembly).savedEdit,
  };
}

function hasResidentEdits() {
  const dirty = residentDirtyState();
  return dirty.part || dirty.assembly || !!E.contextEdit;
}

/* ---- what is inside a document ------------------------------------------
   Read off a snapshot, so the history tree can say which step touched which
   part — and, scoped to one of them, show only its own thread. The nesting is
   the one the editor already works in: a sketch owns its entities and the
   constraints over them, a sketch-driven solid hangs off the sketch that
   drives it, a boolean hangs off its first input, and a mate hangs off the
   component it moves.

   Point coordinates fold into the entity that uses them (as wall corners fold
   into the wall, in the plan): dragging a line is an edit of the line, not of
   two anonymous points. */
function scanDoc(str) {
  var o;
  try {
    o = JSON.parse(str);
  } catch (err) {
    return [];
  }
  var def = (o && o.d) || {},
    asm = (o && o.a) || null,
    out = [];
  (def.sketches || []).forEach(function (s) {
    var pt = {};
    (s.points || []).forEach(function (p) { pt[p.id] = p.x + "," + p.y; });
    out.push({ id: "sketch:" + s.id, kind: "sketch", label: s.name || t("sketch"), sig: s.name + "|" + s.plane + "|" + s.offset });
    (s.entities || []).forEach(function (e) {
      var geo = [e.a, e.b, e.c, e.center, e.p, e.h1, e.h2].concat(e.pts || []).map(function (k) { return pt[k] || ""; }).join(";");
      out.push({
        id: "ent:" + e.id, parent: "sketch:" + s.id, kind: "entity",
        label: (e.name || e.type || "line"), sig: JSON.stringify(e) + "|" + geo,
      });
    });
    (s.constraints || []).forEach(function (c) {
      out.push({
        id: "con:" + c.id, parent: c.entity != null ? "ent:" + c.entity : "sketch:" + s.id,
        kind: c.value != null ? "dim" : "entity",
        label: conLabel(c), sig: JSON.stringify(c),
      });
    });
  });
  (def.parts || []).forEach(function (p, i) {
    out.push({
      id: "part:" + (p.id != null ? p.id : "i" + i),
      parent: p.sketchDriven && p.sketchId ? "sketch:" + p.sketchId : null,
      kind: "part", label: (p.name || p.kind) + " " + (i + 1), sig: JSON.stringify(p),
    });
  });
  (def.features || []).forEach(function (f) {
    out.push({
      id: "feat:" + f.id, parent: f.inputs && f.inputs.length ? "feat:" + f.inputs[0] : null,
      kind: "feature", label: f.name || f.type, sig: JSON.stringify(f),
    });
  });
  (def.variables || []).forEach(function (v) {
    out.push({ id: "var:" + v.id, kind: "dim", label: v.name, sig: JSON.stringify(v) });
  });
  if (asm) {
    (asm.components || []).forEach(function (c) {
      out.push({ id: "comp:" + c.id, kind: "component", label: c.name || c.modelKey || c.assemblyKey || t("component"), sig: JSON.stringify(c) });
    });
    (asm.mates || []).forEach(function (m) {
      out.push({ id: "mate:" + m.id, parent: m.a != null ? "comp:" + m.a : null, kind: "mate", label: m.type, sig: JSON.stringify(m) });
    });
    /* Topology mates are mates too. Scanning only the older list left every
       SmartMate and every face mate out of History — undo moved them, but the
       panel could neither show them nor scope an edit to the component they
       hold. */
    (asm.topologyMates || []).forEach(function (m) {
      var owner = m.a && m.a.componentId;
      out.push({
        id: "tmate:" + m.id, parent: owner != null ? "comp:" + owner : null,
        kind: "mate", label: m.type, sig: JSON.stringify(m),
      });
    });
  }
  return out;
}
function conLabel(c) {
  var d = CONSTRAINT_DEFS.filter(function (x) { return x.id === c.type; })[0];
  return (d ? t(d.label) : c.type) + (c.value != null ? " " + Math.round(c.value * 10) / 10 : "");
}
/* Children the ids alone do not spell out: which solids a sketch drives, and
   which mates move a component. Everything else is already a parent link. */
function docSubtree(id) {
  var at = id.indexOf(":"), kind = id.slice(0, at), key = id.slice(at + 1), out = [];
  if (kind === "sketch") {
    (E.def.parts || []).forEach(function (p) {
      if (p.sketchDriven && String(p.sketchId) === key) out.push("part:" + p.id);
    });
  } else if (kind === "comp" && E.assembly) {
    (E.assembly.mates || []).forEach(function (m) {
      if (String(m.a) === key || String(m.b) === key) out.push("mate:" + m.id);
    });
    (E.assembly.topologyMates || []).forEach(function (m) {
      var a = m.a && m.a.componentId, b = m.b && m.b.componentId;
      if (String(a) === key || String(b) === key) out.push("tmate:" + m.id);
    });
  } else if (kind === "part") {
    // a solid the sketch drives is where its profile edits show up
    var part = (E.def.parts || []).filter(function (p) { return String(p.id) === key; })[0];
    if (part && part.sketchDriven && part.profileEntityIds) {
      part.profileEntityIds.forEach(function (e) { out.push("ent:" + e); });
      (part.holeProfileEntityIds || []).forEach(function (loop) { loop.forEach(function (e) { out.push("ent:" + e); }); });
    }
  }
  return out;
}
/* Whatever the editor currently has picked, named the way the scan names it —
   and the way back, so a chip in the panel selects the object it names. */
function docScope() {
  if (E.docType === "assembly") {
    var c = E.componentSel && E.componentSel.length ? E.componentSel[E.componentSel.length - 1] : null;
    return c ? "comp:" + c.id : null;
  }
  var s = E.sel;
  if (!s) return null;
  if (s.kind) return "part:" + s.id;              // a solid
  if (s.type) return "ent:" + s.id;               // a sketch line / circle / arc
  return null;                                     // a bare sketch point
}
function docPick(id) {
  var at = id.indexOf(":"), kind = id.slice(0, at), key = id.slice(at + 1);
  if (kind === "part") {
    var p = (E.def.parts || []).filter(function (q) { return String(q.id) === key; })[0];
    if (!p) return;
    E.sel = p;
    E.topologySelection = [];
    E.ssel = [];
  } else if (kind === "ent" || kind === "con") {
    // Select the constraint's referenced entities in its owning sketch.
    var sk = null, picked = [];
    (E.def.sketches || []).some(function (s) {
      var constraint = kind === "con" && (s.constraints || []).find(function (c) { return String(c.id) === key; });
      var refs = kind === "con" ? (constraint ? [constraint.entity, constraint.a, constraint.b] : []) : [key];
      picked = Array.from(new Set(refs.filter(function (ref) { return ref != null; }).map(String)))
        .map(function (ref) { return (s.entities || []).find(function (e) { return String(e.id) === ref; }); }).filter(Boolean);
      if (!picked.length) return false;
      sk = s;
      return true;
    });
    if (!sk) return;
    E.def.activeSketch = sk.id;
    E.ssel = picked;
    E.sel = picked[0];
  } else if (kind === "sketch") {
    if (!(E.def.sketches || []).some(function (s) { return String(s.id) === key; })) return;
    E.def.activeSketch = key;
    E.sel = null;
    E.ssel = [];
  } else if (kind === "comp" && E.assembly) {
    var c = (E.assembly.components || []).filter(function (q) { return String(q.id) === key; })[0];
    if (!c) return;
    E.componentSel = [c];
    E.sel = c;
    E.ssel = [];
    E.topologySelection = [];
  } else if (kind === "feat") {
    var feature = (E.def.features || []).find(function (f) { return String(f.id) === key; });
    if (!feature) return;
    E.authoring = E.authoring || {};
    E.authoring.featureSelection = [feature.id];
    E.authoring.sketchSelection = [];
    E.ssel = [];
    E.topologySelection = [];
    E.sel = partsForFeature(feature.id)[0] || null;
  } else return;
  refreshAll();
  if (histPanel) histPanel.refreshNow();
}
function pushUndo(label, tag, scope) { H.push(label, tag, scope); E.massEditRevision=(E.massEditRevision || 0)+1; scheduleModelerDraft(); }
function doUndo() { H.undo(); scheduleModelerDraft(); }
function doRedo() { H.redo(); scheduleModelerDraft(); }

function modelerSessionStorage() {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; }
  catch (error) { return null; }
}

function modelerDraftStorage() {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch (error) { return null; }
}

function scheduleModelerDraft() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  set_draftSaveTimer(setTimeout(flushModelerDraft, 1500));
  syncDraftStatus("draftPending");
}

function discardModelerDraft() {
  set_draftRevision(draftRevision + 1);
  if (draftSaveTimer) { clearTimeout(draftSaveTimer); set_draftSaveTimer(0); }
  set_modelerDraftCache(null);
  clearModelerDraft(modelerDraftStorage(),modelerDraftOwnerId);
  return clearModelerDraftRecord(modelerDraftOwnerId).catch(function () {});
}

// Save and single-document replacement share a recovery slot with the other
// resident document. Refresh its contents and baselines before leaving it.
function reconcileModelerDraft() {
  if (!E.open) return;
  if (!hasResidentEdits()) return discardModelerDraft();
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  flushModelerDraft();
}

function tryRestoreModelerDraft() {
  var draft = modelerDraftCache && (modelerDraftCache.def || modelerDraftCache.assembly) ? modelerDraftCache : readModelerDraft(modelerDraftStorage(),modelerDraftOwnerId);
  if (!draft) return false;
  var documentAtRequest = E.def;
  askModelerDecision(root, {
    title:t("recoverDraftTitle"),
    message:t("unsavedDraft") + "\n" + ((draft.docType === "assembly" ? draft.assembly : draft.def).name || t("title")) + "\n" + new Date(draft.at).toLocaleString(),
    accept:t("restoreDraftAction"), cancel:t("startWithoutDraft"), dismiss:t("recoverLater"), focusAccept:true,
    alternate:t("startFreshKeepDraft"),
  }).then(function (accepted) {
    if (!E.open || E.def !== documentAtRequest) return;
    if (accepted === 'alternate') {
      set_draftRevision(draftRevision + 1);
      if (draftSaveTimer) { clearTimeout(draftSaveTimer); set_draftSaveTimer(0); }
      set_modelerDraftOwnerId(freshModelerDraftOwner(modelerSessionStorage()));
      set_modelerDraftCache(null);
      syncDraftStatus("draftPending");
    }
    else if (accepted) restoreModelerDraft(draft);
    else if (accepted === false) discardModelerDraft();
    else closeModeler();
  });
  return true;
}

function restoreModelerDraft(draft) {
  closeEvalCard();
  S.idc=nextDocumentNumericId(draft,S.idc);
  const context = draft.docType === "part" && draft.def?.metadata?.contextEditor;
  let restoredContext = null;
  if (context) {
    try { restoredContext = restoreNestedComponentEdit(draft.assembly,context); }
    catch (error) { flash('Component draft could not reopen: '+error.message); return false; }
  }
  // A recovered edit still belongs to the saved library revision it started
  // from. Older single-slot drafts have no baseline; leave it unknown so the
  // save conflict path can ask before replacing a same-key saved record.
  try { set_libraryOpenBaseline(draft.libraryBaselineJson ? JSON.parse(draft.libraryBaselineJson) : null); }
  catch (error) { set_libraryOpenBaseline(null); }
  try { set_assemblyOpenBaseline(draft.assemblyBaselineJson ? JSON.parse(draft.assemblyBaselineJson) : null); }
  catch (error) { set_assemblyOpenBaseline(null); }
  E.contextEdit=null;
  set_partHistoryMarker({savedEdit:0});
  E.assembly=draft.assembly || null;
  if (draft.docType === "assembly" && draft.assembly) {
    if (draft.def) E.def = ensureParametricDocument(draft.def);
    setDocumentType("assembly");
    /* setDocumentType is intentionally a no-op when the requested type is
       already active. A restored draft still replaces the whole assembly, so
       an interference result from the previous document cannot survive it. */
    invalidateInterference();
  } else if (draft.def) {
    E.def = ensureParametricDocument(draft.def);
    if (restoredContext) {
      E.contextEdit = restoredContext;
      delete restoredContext.working;
      restoredContext.isNew = !!context.isNew;
      restoredContext.previousDef = draft.previousDef || newDef();
    }
    E.docType = "part";
    if (root) root.classList.remove("md-assembly");
  } else return false;
  ensureSketchDoc(E.def);
  (E.def.parts || []).forEach(function (part) {
    part.id = part.id || uid();
    part.featureId = part.featureId || "feature:part:" + part.id;
  });
  migrateDefinitionProfileCuts(E.def, true);
  restoreKernelBodies(E.def);
  var restoredSketch = ensureSketch(E.def), restoredHistory = E.def.history || [];
  E.solveInfo = solveSketch(restoredSketch);
  E._solveSketchId = restoredSketch.id;
  E.authoring = {
    phase:"model", referenceId:restoredSketch.referenceId || null, sketchId:restoredSketch.id,
    featureType:null, sketchSelection:[restoredSketch.id], featureSelection:[],
    workflowFocus:restoredHistory.some(function (entry) { return entry.kind === "feature"; }) ? "history"
      : restoredHistory.some(function (entry) { return entry.kind === "sketch"; }) ? "feature" : "context",
  };
  H.clear().seed();
  // Older drafts predate per-document dirty flags. Protect both residents
  // until saved when there is no evidence that one of them was clean.
  for (const [type,marker] of [["part",partHistoryMarker],["assembly",assemblySaveSession(E.assembly)]]) {
    if (!marker) continue;
    const clean=draft.dirty?.[type] === false;
    marker.savedEdit=clean ? H.editRevision(type) : null;
  }
  syncDirty();
  syncDraftStatus("draftSaved");
  syncHead();
  E.exactRestoring = isCanonicalAuthoring() && activeParts(E.def).length && !(E.def && E.def.exactTopologyCache);
  refreshAll();
  fitPreview();
  scheduleExactRestore();
  return true;
}
function syncUndoButtons() {
  if (!root) return;
  var u = root.querySelector("#mdUndo"), r = root.querySelector("#mdRedo");
  if (u) {
    u.disabled = !H.canUndo();
    u.title = "Ctrl+Z" + (H.undoLabel() ? " · " + H.undoLabel() : "");
  }
  if (r) {
    r.disabled = !H.canRedo();
    r.title = "Ctrl+Y · Shift+Z" + (H.redoLabel() ? " · " + H.redoLabel() : "");
  }
  syncDirty();
  if (histPanel) histPanel.refresh();
}

/* The editor's revision number. Every edit that can change geometry goes
   through pushUndo(), so the id of the current history node is what "the
   document as it stands now" means here — for the dirty flag, and for deciding
   whether a cached kernel solve still describes this document. */
function currentHistoryNode() {
  var tree = H.tree(), i;
  for (i = 0; i < tree.length; i++) if (tree[i].current) return tree[i].i;
  return null;
}

function documentDirty() {
  return !!E.contextEdit || residentDirtyState()[E.docType];
}

function syncDraftStatus(key) {
  if (!root) return;
  var status = root.querySelector("#mdDraftStatus");
  if (!status) {
    status = el("small", "md-draft-status"); status.id = "mdDraftStatus";
    status.setAttribute("role", "status");
    root.querySelector("#mdName").parentElement.appendChild(status);
  }
  status.textContent = t(key);
  status.classList.toggle("is-error", key === "draftSaveFailed");
  var save = root.querySelector("#mdSave");
  if (save) save.setAttribute("aria-describedby", status.id);
}

function markDocumentClean() {
  var marker = activeHistoryMarker();
  marker.savedEdit = H.editRevision(E.docType);
  syncDirty();
  syncDraftStatus("documentSaved");
  if (E.docType === "assembly") syncAssemblyWorkflow();
}

function syncDirty() {
  if (!root) return;
  var save = root.querySelector("#mdSave");
  if (!save) return;
  var dirty = documentDirty();
  save.classList.toggle("is-dirty", dirty);
  syncSaveButtonAccessibility(save,{
    label:t(E.docType === "assembly" ? "saveAssembly" : "save"),
    dirty:dirty,dirtyText:t("dirtySave")
  });
  syncStatus();
}

/* The one place that asks before unsaved work is thrown away. Every path that
   replaces or abandons the open document goes through here — New, Close, and
   both panes of the library. The library cards used to replace the document
   with no question at all, so a click on a card was an unrecoverable way to
   lose an unsaved model. */
async function confirmDiscardDocument(promptKey) {
  var form = E.quickFormInstance, type = E.docType;
  var documentAtRequest = E.def, assemblyAtRequest = E.assembly;
  if (form?.applying) {
    await form.applying;
    if (!E.open || E.docType !== type || E.def !== documentAtRequest || E.assembly !== assemblyAtRequest ||
        (E.quickFormInstance && E.quickFormInstance !== form)) return false;
    form = E.quickFormInstance;
  }
  if (!form?.hasPendingEdits() && !hasResidentEdits()) return true;
  var generation=H.generation, history=currentHistoryNode(), edit=H.editRevision(E.contextEdit ? "component" : type), formEdits=form?.editSnapshot();
  var accepted = await askModelerDecision(root, { title:t("unsavedChangesTitle"), message:t(promptKey || "unsavedClose"), accept:t("discardChangesAction"), cancel:t("keepEditingAction") });
  return accepted && E.open && E.docType === type && E.quickFormInstance === form && E.def === documentAtRequest && E.assembly === assemblyAtRequest &&
    H.generation === generation && currentHistoryNode() === history && H.editRevision(E.contextEdit ? "component" : type) === edit && form?.editSnapshot() === formEdits && !form?.applying;
}

async function requestCloseModeler() {
  if (!await confirmDiscardDocument("unsavedClose")) return false;
  discardModelerDraft();
  closeModeler();
  E.contextEdit=null;
  E.assembly=null;
  set_assemblyOpenBaseline(null);
  return true;
}

/* ---- view plane mapping: (u,v) sketch coords <-> model (x,y,z) ---- */
// top:   u=x, v=z, normal axis y (v axis points +z = down on canvas)
// front: u=x, v=y, normal axis z (v up on canvas)
// side:  u=z, v=y, normal axis x
function axisOfView() { return planeAxis(E.view); }
// The extrude direction a sketch plane implies. Read from the sketch's own
// plane, never from the current view — that is what made the same profile
// extrude differently depending on where the camera happened to be.
function planeAxis(plane) { return plane === "top" ? "y" : plane === "front" ? "z" : "x"; }
function activeSketchFrame() {
  if (!E.def) return null;
  var sketch=ensureSketch(E.def);
  return sketch && sketch.frameSpace==="local" && (E.modelPlaneActive || E.mode==="2d") ? sketch.frame : null;
}
function sameFrameOrientation(a,b) {
  if (!a || !b || !a.normal || !b.normal || !a.xAxis || !b.xAxis) return false;
  var nd=a.normal.x*b.normal.x+a.normal.y*b.normal.y+a.normal.z*b.normal.z;
  var xd=a.xAxis.x*b.xAxis.x+a.xAxis.y*b.xAxis.y+a.xAxis.z*b.xAxis.z;
  return nd>.99999 && xd>.99999;
}
function partEditableInSketch(part) {
  var frame=activeSketchFrame();
  return !!part && part.kind==="ext" && (frame ? part.axis==="frame" && sameFrameOrientation(part.frame,frame) : part.axis===axisOfView());
}
function frameRangeForBounds(bounds,frame) {
  var values=[];
  [bounds.x0,bounds.x1].forEach(function(x){[bounds.y0,bounds.y1].forEach(function(y){[bounds.z0,bounds.z1].forEach(function(z){values.push(frameProjectPoint(frame,{x:x,y:y,z:z}).w);});});});
  var lo=Math.min.apply(null,values),hi=Math.max.apply(null,values),pad=Math.max(2,(hi-lo)*.08);
  return {from:lo-pad,to:hi+pad};
}
function sameSketchContext(a,b) {
  if (!a || !b) return false;
  if (a.frameSpace==="local" || b.frameSpace==="local") return a.frameSpace==="local" && b.frameSpace==="local" && a.support && b.support && a.support.persistentId===b.support.persistentId;
  return a.plane===b.plane;
}
function partUV(p) {
  // returns projected 2D footprint for the current view: {type:'rect',u0,u1,v0,v1} | {type:'circle',u,v,r} | {type:'poly',pts}
  var b = partBounds(p);
  function rect(u0, u1, v0, v1) { return { type: "rect", u0: u0, u1: u1, v0: v0, v1: v1 }; }
  var frame=activeSketchFrame();
  if (frame) {
    if (p.kind==="ext" && p.frame && sameFrameOrientation(p.frame,frame)) {
      var projectLoop=function(loop){return (loop || []).map(function(q){var world=framePoint(p.frame,q.u,q.v,p.from);var local=frameProjectPoint(frame,world);return {u:local.u,v:local.v};});};
      return {type:"poly",pts:projectLoop(p.pts),holes:(p.holes || []).map(function (hl) { return projectLoop(holeLoop(hl)); }).filter(function (loop) { return loop.length; })};
    }
    var projected=[];
    [b.x0,b.x1].forEach(function(x){[b.y0,b.y1].forEach(function(y){[b.z0,b.z1].forEach(function(z){projected.push(frameProjectPoint(frame,{x:x,y:y,z:z}));});});});
    return rect(Math.min.apply(null,projected.map(function(q){return q.u;})),Math.max.apply(null,projected.map(function(q){return q.u;})),Math.min.apply(null,projected.map(function(q){return q.v;})),Math.max.apply(null,projected.map(function(q){return q.v;})));
  }
  if ((isKernelBody(p) || p.kind === "direct" || p.kind === "mesh" || p.axisBasis) && p.meshData) {
    var meshProjection=projectMeshEdges(p.meshData,E.view);
    if(meshProjection.segments.length)return meshProjection;
  }
  if (p.kind === "ext" && p.axis === axisOfView()) return { type: "poly", pts: p.pts };
  if (p.kind === "loft" && p.axis === axisOfView()) return { type: "poly", pts: p.pts0 };
  if (p.kind === "rev" && !p.axisBasis && E.view === "top") return { type: "circle", u: p.x, v: p.z, r: revMaxR(p) };
  if (p.kind === "cyl" && E.view === "top") return { type: "circle", u: p.x, v: p.z, r: Math.max(p.r, p.r2 != null ? p.r2 : p.r) };
  if (p.kind === "sph") {
    if (E.view === "top") return { type: "circle", u: p.x, v: p.z, r: p.r };
    if (E.view === "front") return { type: "circle", u: p.x, v: p.y, r: p.r };
    return { type: "circle", u: p.z, v: p.y, r: p.r };
  }
  if (E.view === "top") return rect(b.x0, b.x1, b.z0, b.z1);
  if (E.view === "front") return rect(b.x0, b.x1, b.y0, b.y1);
  return rect(b.z0, b.z1, b.y0, b.y1);
}
function moveInView(p, du, dv) {
  if (p && p.type === "line") {
    var sketch = ensureSketch(E.def), pts = sketchLinePoints(p);
    if (pts.a) { pts.a.x += du; pts.a.y += dv; }
    if (pts.b && pts.b !== pts.a) { pts.b.x += du; pts.b.y += dv; }
    resolveSketch(false);
    return;
  }
  var frame=activeSketchFrame();
  if (frame) movePart(p,frame.xAxis.x*du+frame.yAxis.x*dv,frame.xAxis.y*du+frame.yAxis.y*dv,frame.xAxis.z*du+frame.yAxis.z*dv);
  else if (E.view === "top") movePart(p, du, 0, dv);
  else if (E.view === "front") movePart(p, du, dv, 0);
  else movePart(p, 0, dv, du);
}
/* ============ where the sketch sheet lives on screen ============
   Two mappings, one interface. In 2D (and in the read-only drawing) the sheet
   is a plain pan/zoom transform: E.ox/E.oy/E.scl. Over the model the sheet is
   the live camera's projection of the sketch plane (toPx/toUV), so orbiting
   mid-sketch does not slide the geometry off the face. Opening a sketch still
   looks square at the plane when Normal To is on — that is the SolidWorks
   default, and a screen square is then a plane square. Turn the toggle off
   (or orbit) and the same projection keeps drawing on the plane from any
   angle; the rubber-band is in UV so the preview is the shape that will land. */
function standardPlaneFrame(view, offset) {
  var w = fin(offset) ? offset : 0;
  if (view === "top") return {origin:{x:0,y:w,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:1},normal:{x:0,y:1,z:0}};
  if (view === "front") return {origin:{x:0,y:0,z:w},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}};
  return {origin:{x:w,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0},normal:{x:1,y:0,z:0}};
}
/* The plane the sketch canvas is currently drawing on, in world space. Null
   whenever the plain 2D transform is the right one. */
/* toPx runs hundreds of times per repaint, and the projection costs two layout
   reads and a matrix update. It cannot change within a single frame unless we
   change it ourselves, so it is computed once and dropped at the frame
   boundary; anything that moves the camera or the canvas drops it by hand. */
function invalidateSketchProjection() { E._proj = undefined; }
function sketchProjection() {
  if (E._proj !== undefined) return E._proj;
  E._proj = computeSketchProjection();
  requestAnimationFrame(invalidateSketchProjection);
  return E._proj;
}
function computeSketchProjection() {
  if (E.mode !== "3d" || !E.modelPlaneActive) return null;
  if (!E.pv || !E.pv.cam || !E.cv || !E.pv.rr || !E.pv.rr.domElement) return null;
  var sketch = ensureSketch(E.def);
  var frame = activeSketchFrame() || standardPlaneFrame(E.view, sketch && sketch.offset);
  var host = E.pv.rr.domElement.getBoundingClientRect(), self = E.cv.getBoundingClientRect();
  if (host.width < 4 || host.height < 4) return null;
  // The camera is only where `place()` puts it once it has been placed, and its
  // world matrix has to be current or every projection is a frame stale.
  if (E.pv.place) E.pv.place();
  E.pv.cam.updateMatrixWorld(true);
  var proj = {
    frame: frame, cam: E.pv.cam,
    w: host.width, h: host.height,
    dx: host.left - self.left, dy: host.top - self.top,
  };
  // Screen scale at the plane origin. Hit tolerances, glyph sizes and dimension
  // offsets are all quoted in E.scl, so it has to stay meaningful here.
  var a = projectSketchPoint(proj, 0, 0), b = projectSketchPoint(proj, 1, 0), c = projectSketchPoint(proj, 0, 1);
  var scale = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y));
  if (fin(scale) && scale > 0.01) E.scl = scale;
  return proj;
}

function getScratchSketchNdc() {
  if (!_scratchSketchNdc) set__scratchSketchNdc(new THREE.Vector3());
  return _scratchSketchNdc;
}
function getScratchSketchDir() {
  if (!_scratchSketchDir) set__scratchSketchDir(new THREE.Vector3());
  return _scratchSketchDir;
}

function getScratchSketchRayOrigin() {
  if (!_scratchSketchRayOrigin) set__scratchSketchRayOrigin(new THREE.Vector3());
  return _scratchSketchRayOrigin;
}
function projectSketchPoint(proj, u, v) {
  var world = framePoint(proj.frame, u, v, 0);
  var ndc = getScratchSketchNdc().set(world.x, world.y, world.z).project(proj.cam);
  return { x: proj.dx + (ndc.x * .5 + .5) * proj.w, y: proj.dy + (-ndc.y * .5 + .5) * proj.h };
}
/* Where a world point lands on the sketch canvas, or null behind the camera. */
function worldToSketchPx(proj, world) {
  var ndc = getScratchSketchNdc().set(world.x, world.y, world.z).project(proj.cam);
  if (!(ndc.z > -1 && ndc.z < 1)) return null;
  return { x: proj.dx + (ndc.x * .5 + .5) * proj.w, y: proj.dy + (-ndc.y * .5 + .5) * proj.h };
}
function toPx(u, v) {
  var proj = sketchProjection();
  if (proj) return projectSketchPoint(proj, u, v);
  var vv = !activeSketchFrame() && E.view === "top" ? v : -v; // framed and elevation sketches use v-up
  return { x: E.ox + u * E.scl, y: E.oy + vv * E.scl };
}
function toUV(px, py) {
  var proj = sketchProjection();
  if (proj) {
    // Cast the pointer ray and land it on the sketch plane. Behind the camera,
    // or parallel to the plane, there is no answer — hold the last one rather
    // than throwing geometry to infinity.
    // Orthographic rays start at the pointer, perspective rays at the eye.
    var ray = pointerCameraRay(proj.cam, ((px - proj.dx) / proj.w) * 2 - 1,
      -(((py - proj.dy) / proj.h) * 2 - 1), getScratchSketchRayOrigin(), getScratchSketchDir());
    var eye = ray.origin, dir = ray.direction;
    var n = proj.frame.normal, o = proj.frame.origin;
    var denom = dir.x * n.x + dir.y * n.y + dir.z * n.z;
    if (Math.abs(denom) < 1e-6) return E._lastUV || { u: 0, v: 0 };
    var travel = ((o.x - eye.x) * n.x + (o.y - eye.y) * n.y + (o.z - eye.z) * n.z) / denom;
    if (travel <= 0) return E._lastUV || { u: 0, v: 0 };
    var hit = frameProjectPoint(proj.frame, { x: eye.x + dir.x * travel, y: eye.y + dir.y * travel, z: eye.z + dir.z * travel });
    E._lastUV = { u: hit.u, v: hit.v };
    return E._lastUV;
  }
  var u = (px - E.ox) / E.scl, v = (py - E.oy) / E.scl;
  if (activeSketchFrame() || E.view !== "top") v = -v;
  return { u: u, v: v };
}
/* Live sketch previews must be the UV shape that will be committed, projected
   through toPx — a screen-axis rectangle looks square in isometric and lands
   as a stretched plane rectangle. */
function strokeUvRect(c, u0, v0, u1, v1) {
  var p0 = toPx(u0, v0), p1 = toPx(u1, v0), p2 = toPx(u1, v1), p3 = toPx(u0, v1);
  c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p3.x, p3.y); c.closePath();
}
function strokeUvCircle(c, u, v, r) {
  pathUvEllipse(c, { center:{ x:u, y:v }, rx:r, ry:r, rot:0 }, 0, Math.PI * 2, true);
}
/* Curves belong to the sketch plane, not the screen. Sampling their UV form
   before projection keeps circles, arcs and rotated ellipses faithful under an
   oblique/perspective camera and gives previews the exact path commit draws. */
function pathUvEllipse(c, o, start, sweep, closed) {
  if (!o || o.rx < 1e-4 || o.ry < 1e-4) return false;
  start = fin(start) ? start : 0;
  sweep = fin(sweep) ? sweep : Math.PI * 2;
  var steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * 64));
  var cr = Math.cos(o.rot || 0), sr = Math.sin(o.rot || 0);
  for (var i = 0; i <= steps; i++) {
    var angle = start + sweep * i / steps;
    var x = Math.cos(angle) * o.rx, y = Math.sin(angle) * o.ry;
    var p = toPx(o.center.x + x * cr - y * sr, o.center.y + x * sr + y * cr);
    if (!i) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
  }
  if (closed) c.closePath();
  return true;
}
function positiveArcSweep(start, end) {
  return ((end - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
}
function pathUvCircleArc(c, center, radius, start, sweep, closed) {
  return pathUvEllipse(c, { center:center, rx:Math.abs(radius), ry:Math.abs(radius), rot:0 }, start, sweep, closed);
}

function setModelerBackgroundIsolation(on) {
  if (on) {
    if (modelerBackgroundState.length) return;
    /* Isolate only product-owned planner roots. A blanket walk over every
       <body> child also caught browser/assistive-tech integration nodes and
       could make the page's control surface disappear as the launch click
       finished. The main planner lives in #app; the remaining selectors are
       its body-level sheets and static overlays. Editor chrome deliberately
       stays outside this list. */
    document.querySelectorAll(
      "#app, #start-screen, #drawer-backdrop, #crosshair, #m-ctx, #m-sheet, #m-sheet-backdrop"
    ).forEach(function (node) {
      if (node === root) return;
      modelerBackgroundState.push({ node:node, inert:!!node.inert, ariaHidden:node.getAttribute("aria-hidden") });
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
    return;
  }
  modelerBackgroundState.forEach(function (state) {
    if (!state.node || !state.node.isConnected) return;
    state.node.inert = state.inert;
    if (state.ariaHidden == null) state.node.removeAttribute("aria-hidden");
    else state.node.setAttribute("aria-hidden", state.ariaHidden);
  });
  set_modelerBackgroundState([]);
}

export {
  activeSketchFrame, assemblySaveSession, axisOfView, confirmDiscardDocument,
  currentHistoryNode, cutSkipNote, discardModelerDraft, doRedo, doUndo,
  docPick, docScope, docSubtree, documentDirty, frameRangeForBounds,
  hasResidentEdits, invalidateSketchProjection, markDocumentClean,
  modelerDraftStorage, modelerSessionStorage, moveInView,
  partEditableInSketch, partUV, pathUvCircleArc, pathUvEllipse,
  patternCurveSketch, patternPlacements, planeAxis, positiveArcSweep,
  pushUndo, reconcileModelerDraft, requestCloseModeler, residentDirtyState,
  resolvePatternCurvePath, restoreModelerDraft, sameSketchContext, scanDoc,
  scheduleModelerDraft, setModelerBackgroundIsolation, sketchProjection,
  snapDoc, standardPlaneFrame, strokeUvCircle, strokeUvRect, syncDirty,
  syncDraftStatus, syncUndoButtons, toPx, toUV, tryRestoreModelerDraft,
  worldToSketchPx,
};

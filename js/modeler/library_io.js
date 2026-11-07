/* The CAD editor's library JSON import/export, disk backups, draft recovery and
   library thumbnails, split out of js/modeler.js. It shares the editor's state
   through live imports from ../modeler.js. */
import { addFeature } from "../cad_feature_tree.js";
import { projectedHingeTool } from "../cad_sheet_hinge.js";
import { garbageCollectAttachments } from "../core/attachment_gc.js";
import { installAttachmentRecords } from "../core/attachment_store.js";
import { cancelCadWorkerWork } from "../core/cad_worker_client.js";
import { documentDescription } from "../core/custom_properties.js";
import { nextDocumentNumericId } from "../core/document_ids.js";
import { fetchDiskBackup, listDiskBackups, missingFromLibrary, modelBackupStatus } from "../core/model_backup_client.js";
import { formatModelLength } from "../core/model_dimensions.js";
import { claimLegacyModelerDraftRecord, collidingLibraryKeys, importKeptLibraryBundle, libraryBundle, listModelerDraftRecords, loadAssemblyLibrary, loadModelLibrary, loadModelerDraftRecord, parseLibraryBundle, resolvedLibraryAssembly } from "../core/model_library_store.js";
import { drawingOnlyContentSummary } from "../core/model_save_policy.js";
import { rigidTransformIsIdentity } from "../core/pattern_geometry.js";
import { compactAssemblyTopologySnapshots } from "../core/project_topology_budget.js";
import { toolFeatureRecipe } from "../core/tool_recipe.js";
import { vertexEntriesFrom } from "../core/topology_selection.js";
import { createTopologyRegistry, edgesBoundingFace } from "../core/topology.js";
import { createViewportSwap } from "../editor_view.js";
import { FURN, PRICE, flabel } from "../furniture.js";
import { getLang } from "../i18n.js";
import { refreshCatalogSelect } from "../model_catalog.js";
import { boundsHitBox, boxSelectMode, selectionFilterAllows } from "../modeler_chrome.js";
import { askModelerDecision } from "../modeler_decision.js";
import { claimLegacyModelerDraft, readModelerDraft } from "../modeler_draft.js";
import { appendSavedLibrarySearch } from "../modeler_library_search.js";
import { cloneData, partPatternTransform } from "../modeler_part_geometry.js";
import { dedupeFinishRefs, entryScreenBounds, topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { inferSmartMate } from "../modeler_smartmates.js";
import { t, tf } from "../modeler_strings.js";
import { commandSelectionPrefer, dismissProfileOffer, syncSelectionFilters } from "../modeler/command_manager.js";
import { confirmDiscardDocument, currentHistoryNode, discardModelerDraft, markDocumentClean, modelerDraftStorage, pushUndo, reconcileModelerDraft, restoreModelerDraft, scheduleModelerDraft } from "../modeler/document_history.js";
import { closeEvalCard } from "../modeler/document_outputs.js";
import { publishAssemblyModel, syncTools } from "../modeler/document_save.js";
import { sheetForm } from "./drawing_sheet_forms.js";
import { drawSketch, drawingDocument, drawingSheet, fitSplitPreview, invalidateDrawing, syncSheetPanel } from "./drawing_sheet_render.js";
import { flash, report } from "./drawing_sheet_touch.js";
import { documentPresetAction } from "../modeler/drawing_sheet.js";
import { btn, el } from "../modeler/editor_dom.js";
import { newModel } from "../modeler/editor_forms.js";
import { abandonDocumentExactWork, downloadBytes } from "../modeler/export_measure.js";
import { currentFinishEdges, edgeRefsForFaces, finishCommandActive, fullRoundActive, setFinishEdges, toggleFinishEdges, toggleFullRoundFace } from "../modeler/finish_preview.js";
import { invalidateInterference, saveAssemblies, saveLib, solveAssembly } from "../modeler/library_assembly_state.js";
import { retainingExactPreview, updatePreview } from "../modeler/library_panel.js";
import { applyTrackedUpdates, assemblyMateCount, countLabel, loadAssemblies, loadLib, mirrorLibraryToDisk, signalLibraryChange, topologyEntriesForPart, writeAssemblyIndex, writeLibraryIndex } from "../modeler/library_store.js";
import { sizeSketch, syncStatus } from "../modeler/sketch_entities.js";
import { fitSketch, modelLengthUnit, syncModelPlane } from "../modeler/sketch_workflow.js";
import { resolveTopologyPick } from "../modeler/topology_pick.js";
import { applyDimensionEditor, emptyState } from "../modeler/tree_assembly.js";
import { fitPreview, layout3DHost } from "../modeler/view_modes.js";
import { registerCustomModel } from "../modeler/viewport_decorations.js";
import { componentTopologyFromHit, hidePickCycle, mateFramesFit, mateReferenceFromPick, stampComponentRef } from "../modeler/viewport_input.js";
import { syncCoach } from "../modeler/welcome_coach.js";
import { S, fin, uid } from "../state.js";
import { hasThumb, loadThumbCache, modelThumb, thumbAsync } from "../thumbs.js";
import {
  E, H, assemblyLibraryCache, exactBuildTimers, exactRebuildQueue,
  lastAssemblySaveConflict, libThumbQueue, libThumbTimer,
  librarySearchQueries, modelLibraryCache, modelerDraftOwnerId, openModeler,
  pendingCutController, refreshAll, refreshSelection, requestDocumentType,
  root, set_assemblyLibraryCache, set_assemblyOpenBaseline,
  set_cancelledExactPreview, set_libThumbQueue, set_libThumbTimer,
  set_modelLibraryCache, set_modelerDraftCache, set_swapView, swapView,
} from "../modeler.js";

/* Sweep to accumulate: everything the pointer passes over joins the selection,
   and nothing leaves it. Additive only, like the Shift-click it is the dragged
   form of — a sweep that could also deselect would undo its own work as the
   pointer re-crossed an edge it had just taken. */
function beginPaintSelectDrag(event, view, part, firstReference) {
  var added = new Set();
  var take = function (reference) {
    if (!reference || added.has(reference.persistentId)) return;
    added.add(reference.persistentId);
    if (finishCommandActive()) {
      if (fullRoundActive() && reference.kind === "face") toggleFullRoundFace(reference);
      else if (reference.kind === "face") toggleFinishEdges(edgeRefsForFaces([reference], part));
      else if (reference.kind === "edge") toggleFinishEdges([reference]);
      return;
    }
    if ((E.topologySelection || []).some(function (item) { return item.persistentId === reference.persistentId; })) return;
    E.topologySelection = (E.topologySelection || []).concat([reference]);
  };
  E.sel = part;
  take(firstReference);
  refreshSelection();
  event.preventDefault();
  function move(ev) {
    var found = resolveTopologyPick(ev, view, { prefer: commandSelectionPrefer() });
    if (!found || !found.reference) return;
    var before = added.size;
    take(found.reference);
    if (added.size !== before) refreshSelection();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (added.size > 1) flash(tf("selectOpResult", { count: (E.topologySelection || []).length }));
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return true;
}

function applyBoxSelection(part, box, view, rect) {
  var filter = commandSelectionPrefer();
  var entries = topologyEntriesForPart(part);
  var mode = boxSelectMode(box.x0, box.x1);
  /* A planar face has no outline in its descriptor, so it is taken when the
     edges that bound it are taken — enclosed needs all of them inside,
     crossing needs one. That keeps faces honest rather than approximating a
     surface from a centre point and an area. */
  var wantsFaces = filter === "face" || filter === "all";
  var picked = [];
  var edgeHit = new Map();
  entries.forEach(function (entry) {
    if (entry.kind !== "edge" && entry.kind !== "vertex") return;
    var bounds = entryScreenBounds(entry, view, rect);
    if (!bounds) return;
    var hit = boundsHitBox(bounds, box, mode);
    if (entry.kind === "edge") edgeHit.set(entry.persistentId, hit);
    if (!hit || !selectionFilterAllows(entry.kind, filter)) return;
    picked.push(entry);
  });
  if (filter === "vertex" || filter === "edge" || filter === "all") {
    vertexEntriesFrom(entries).forEach(function (entry) {
      if (!selectionFilterAllows("vertex", filter)) return;
      var bounds = entryScreenBounds(entry, view, rect);
      if (bounds && boundsHitBox(bounds, box, mode)) picked.push(entry);
    });
  }
  if (wantsFaces) {
    var registry = createTopologyRegistry(entries);
    entries.filter(function (entry) { return entry.kind === "face"; }).forEach(function (face) {
      var bounding = edgesBoundingFace(face, registry);
      if (!bounding.length) return;
      var taken = bounding.map(function (edge) { return edgeHit.get(edge.persistentId) === true; });
      var include = mode === "enclosed" ? taken.every(Boolean) : taken.some(Boolean);
      if (include) picked.push(face);
    });
  }
  var refs = dedupeFinishRefs(picked.map(topologyReferenceFromEntry).filter(Boolean));
  if (!refs.length) { flash(t("selectOpEmpty")); return; }
  E.sel = part;
  // Ctrl/Cmd is add, here as on a click.
  if (finishCommandActive()) setFinishEdges(currentFinishEdges().concat(refs), { pool: true });
  else {
    var have = new Set((E.topologySelection || []).map(function (reference) { return reference.persistentId; }));
    E.topologySelection = (E.topologySelection || []).concat(refs.filter(function (reference) { return !have.has(reference.persistentId); }));
    refreshSelection();
  }
  hidePickCycle();
  flash(tf("selectOpResult", { count: (E.topologySelection || []).length }));
}

function beginSmartMateDrag(event, view) {
  var pick = function (source) {
    return resolveTopologyPick({ clientX: source.clientX, clientY: source.clientY, pointerType: source.pointerType }, view, { prefer: E.selectionFilter }) || {};
  };
  var from = pick(event);
  var movingComponent = from.component;
  if (!movingComponent) return false;
  var movingRef = stampComponentRef(from.reference, movingComponent, from) || componentTopologyFromHit(movingComponent, (from.hits || [])[0]);
  E.componentSel = [movingComponent];
  E.sel = movingComponent;
  /* A cancelled pointer (a touch gesture taken by the OS) ends the drag with
     no mate. Without this the pointerup listener stayed armed and the next
     release anywhere mated whatever happened to be under it. */
  function cancel() {
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    refreshAll();
  }
  function up(ev) {
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    var onto = pick(ev);
    var targetComponent = onto.component;
    var targetRef = null;
    if (targetComponent && targetComponent !== movingComponent) {
      targetRef = stampComponentRef(onto.reference, targetComponent, onto) || componentTopologyFromHit(targetComponent, (onto.hits || [])[0]);
    } else if (Math.hypot(ev.clientX - event.clientX, ev.clientY - event.clientY) <= 4) {
      /* A click, not a drag: pair this reference with the last one picked on
         another component, or remember it as the first of the pair. */
      var earlier = (E.topologySelection || []).filter(function (candidate) {
        return candidate.componentId && candidate.componentId !== movingComponent.id;
      });
      targetRef = earlier[earlier.length - 1] || null;
      if (!targetRef) {
        E.topologySelection = [movingRef];
        flash(t("smartMateHint"));
        refreshAll();
        return;
      }
    }
    if (!targetRef) { refreshAll(); return; }
    if (movingComponent.grounded) { flash(t("smartMateGrounded")); refreshAll(); return; }
    var mate = inferSmartMate(mateReferenceFromPick(targetRef), mateReferenceFromPick(movingRef));
    if (!mate) { refreshAll(); return; }
    var fits = mateFramesFit(mate.type, mate.a.frame, mate.b.frame);
    if (!fits.ok) { flash(fits.reason); refreshAll(); return; }
    pushUndo(t("smartMate"));
    E.assembly.topologyMates ||= [];
    E.assembly.topologyMates.push({ id: uid(), type: mate.type, a: mate.a, b: mate.b, aligned: !!mate.aligned, value: 0, pitch: mate.pitch });
    solveAssembly();
    E.topologySelection = [];
    flash("\u2713 " + t("smartMate") + " \u00b7 " + mate.type);
    refreshAll();
  }
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  flash(t("smartMateHint"));
  return true;
}

/* Sketch or model, in the same middle pane. The preview canvas is MOVED there
   rather than a second WebGL context being created — see editor_view.js. The
   thumbnail in the right panel and the big view are one renderer.
   Split is the sketch with the model beside it: E.mode stays "2d" — every
   sketch tool, relation and dimension works as in Sketch — and the renderer
   sits in the right half, where it orbits and zooms and shows each rebuild.
   Anything that needs the full model (finishing the sketch, picking a face,
   the drawing sheet) leaves Split; a workflow that asks for "2d" keeps it.
   Parts only, and not on phones: there is no room for two views. */
function setMode(m) {
  if (E.dimEditor && !applyDimensionEditor()) return;
  var askedSplit = m === "split";
  m = m === "3d" ? "3d" : m === "drawing" ? "drawing" : "2d";
  var previousMode = E.mode;
  E.mode = m;
  E.modelPlaneActive = false;
  E.touchPrecision = null;
  /* The chip names candidates from one viewport ray; a mode change invalidates
     it. syncSelectionFilters() also demotes the Sketch filter, which has
     nothing to acquire once the sketch view is gone. */
  hidePickCycle();
  dismissProfileOffer();
  syncSelectionFilters();
  if (askedSplit) E.split = true;
  if (m !== "2d" || E.docType !== "part" || document.body.classList.contains("compact-nav")) E.split = false;
  var split = !!E.split, wasSplit = root.classList.contains("md-split");
  if (E.pv) E.pv.clearFixedFrame(false);
  if (m === "3d" || m === "drawing") E.tool = "select";
  E.dimPick = [];
  E.dimSel = null;
  if (!swapView) {
    set_swapView(createViewportSwap({
      wrap: root.querySelector(".md-prev-wrap"),
      bigHost: root.querySelector("#md3dHost"),
      panelHost: root.querySelector("#mdRightPanel"),
    }));
  }
  root.classList.toggle("md-split", split);
  // Relocating the preview must not compile its hidden shader on a 2D sheet.
  swapView(m === "3d" || split, E.pv, { render: m !== "drawing" });
  // In the large viewport the checkbox shares a row with the selection filters.
  var roomToggle = root.querySelector(".md-context-toggle");
  var roomHost = root.querySelector(m === "3d" || split ? "#mdRailRow" : ".md-prev-wrap");
  if (roomToggle.parentNode !== roomHost) roomHost.appendChild(roomToggle);
  root.classList.toggle("md-is3d", m === "3d");
  root.classList.toggle("md-isdrawing", m === "drawing");
  syncModelPlane();
  layout3DHost();
  if (m === "3d") fitPreview();
  else if (split !== wasSplit) {
    /* The sketch pane changes width under the user's zoom: keep the zoom and
       the point in the middle, frame the model half for what it now shows. */
    var oldW = E.cw;
    E._splitFitted = false;
    requestAnimationFrame(function () {
      if (sizeSketch() && oldW) { E.ox += (E.cw - oldW) / 2; drawSketch(); }
      layout3DHost();
      if (split) fitSplitPreview();
    });
  }
  if (m === "drawing") {
    E.ssel=[]; E.sel=null; E.poly=null; E.arcPts=null; E.wallPts=null;
    /* Entering the sheet re-projects: the model may have changed since the last
       visit, and a stale projection is a drawing that lies. */
    invalidateDrawing();
    var sheetDoc = drawingDocument();
    /* A phone has no room for a 244px properties column beside an A3 page, so
       the sheet gets the screen and the panel is one tap away on the same
       toggle the inspector uses. */
    root.classList.toggle("md-sheet-collapsed", document.body.classList.contains("compact-nav"));
    drawingSheet().setTool("select");
    drawingSheet().fit();
    /* A sheet nobody has drafted on still states the two overall sizes — the
       first thing anyone reads off a drawing — and seeding them is not an edit
       the user made, so it opens no undo step. */
    if (!sheetDoc.dims.length && !sheetDoc.seeded) {
      sheetDoc.seeded = true;
      drawingSheet().autoDimension(true);
    }
  }
  root.querySelectorAll("#mdModes button").forEach(function (b) {
    var active = b.getAttribute("data-mode") === (split ? "split" : m);
    b.classList.toggle("on", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  syncTools();
  syncCoach();
  syncSheetPanel();
  drawSketch();
  /* A sketch opened over the 3D model inherits the model camera. Switching to
     the dedicated 2D editor must frame its plane rather than keep that camera's
     room-scale projection, which makes millimetre work nearly impossible. */
  if (m === "2d" && previousMode === "3d" && E.authoring?.phase === "sketch")
    requestAnimationFrame(fitSketch);
}

/* ================= saved-model library panel ================= */
async function exportLibraryJson() {
  // IndexedDB is the shared source of truth; another tab may have saved since
  // this editor last rendered its Library panel.
  try { set_modelLibraryCache(await loadModelLibrary()); set_assemblyLibraryCache(await loadAssemblyLibrary()); }
  catch (e) { flash(t("saveStorageFull")); return; }
  writeLibraryIndex(modelLibraryCache); writeAssemblyIndex(assemblyLibraryCache);
  var text = JSON.stringify(libraryBundle(loadLib(), loadAssemblies()), null, 2);
  downloadBytes(text, "modelforge-library.json", "application/json");
  flash("✓ " + t("libraryExported"));
}

function importLibraryJson() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async function () {
    var file = input.files && input.files[0];
    if (!file) return;
    try {
      var bundle = parseLibraryBundle(await file.text());
      // Collision choices must describe the current shared library, not the
      // snapshot this tab had when it opened the editor.
      set_modelLibraryCache(await loadModelLibrary());
      set_assemblyLibraryCache(await loadAssemblyLibrary());
      var collisions = collidingLibraryKeys(loadLib(), bundle.models).concat(collidingLibraryKeys(loadAssemblies(), bundle.assemblies));
      var conflict = "replace";
      if (collisions.length) {
        var unique = collisions.filter(function (key, index) { return collisions.indexOf(key) === index; });
        var choice = await askModelerDecision(root, {
          title: t("importLibrary"),
          message: tf("libraryImportReplace", { keys: unique.join(", ") }),
          accept: t("libraryImportOverwrite"),
          cancel: t("libraryImportKeepBoth"),
        });
        if (choice == null) return;
        conflict = choice ? "replace" : "keep-both";
      }
      if (conflict === "keep-both") {
        const imported = await importKeptLibraryBundle(bundle);
        set_modelLibraryCache(imported.models);
        set_assemblyLibraryCache(imported.assemblies);
        writeLibraryIndex(modelLibraryCache);
        writeAssemblyIndex(assemblyLibraryCache);
        mirrorLibraryToDisk(imported.importedModels);
        signalLibraryChange();
      } else {
        if (!await saveLib(bundle.models,{mode:"merge",conflict})) { report(t("reportKickerSave"), t("saveLibraryFailed"), t("saveStorageFull")); return; }
        if (!await saveAssemblies(bundle.assemblies,{mode:"merge",conflict})) { flash(t("saveStorageFull")); return; }
      }
      loadLib().forEach(registerCustomModel);
      refreshLib();
      flash("✓ " + t(conflict === "keep-both" && collisions.length ? "libraryImportedKept" : "libraryImported"));
    } catch (error) { flash(t("libraryImportFailed")); }
  });
  input.click();
}

/* What a cleared browser lost, offered back from the disk mirror. Restoring
   only adds models whose key is missing, so it can never overwrite live work. */
async function restoreDiskBackups(missing) {
  var names = missing.map(function (backup) { return backup.name || backup.key; }).join(", ");
  if (!await askModelerDecision(root, { title:t("diskBackupRestore"), message:tf("diskBackupRestoreAsk", { names:names }), accept:t("diskBackupRestore"), cancel:t("m_cancel") })) return;
  var records = [];
  for (var i = 0; i < missing.length; i++) {
    var backup = await fetchDiskBackup(missing[i].key);
    if (!backup) continue;
    // Payloads first: a record whose exact-CAD attachment is missing will not rebuild.
    try { if (backup.attachments.length) await installAttachmentRecords(backup.attachments); }
    catch (e) { continue; }
    records.push(backup.model);
  }
  if (!records.length) { flash(t("diskBackupRestoreFailed")); return; }
  if (!await saveLib(records,{mode:"merge",conflict:"skip"})) { report(t("reportKickerSave"), t("saveLibraryFailed"), t("saveStorageFull")); return; }
  loadLib().forEach(registerCustomModel);
  refreshCatalogSelect();
  refreshLib();
  flash("✓ " + tf("diskBackupRestored", { n:records.length }));
}

function appendDiskBackupNote(host) {
  var note = el("div", "md-backup-note");
  note.hidden = true;
  host.appendChild(note);
  listDiskBackups().then(function (backups) {
    if (!note.isConnected) return; // the panel re-rendered meanwhile
    var missing = missingFromLibrary(backups, loadLib());
    if (missing.length) {
      note.appendChild(el("div", "md-card-note", tf("diskBackupMissing", { n:missing.length })));
      note.appendChild(btn('<i class="ph ph-clock-counter-clockwise"></i> ' + t("diskBackupRestore"), function () { restoreDiskBackups(missing); }, "md-wide"));
      note.hidden = false;
    } else if (modelBackupStatus() === "off") {
      note.appendChild(el("div", "md-card-note", t("diskBackupOff")));
      note.hidden = false;
    }
  });
}

function libraryTransferButtons(host) {
  host.appendChild(btn('<i class="ph ph-export"></i> ' + t("exportLibrary"), exportLibraryJson, "md-wide"));
  host.appendChild(btn('<i class="ph ph-download-simple"></i> ' + t("importLibrary"), importLibraryJson, "md-wide"));
}

/* The old shared draft cannot be attributed to a tab. Do not offer it as an
   automatic restore on a fresh tab: an older tab may still be editing it.
   Keep it available through a deliberate action in the Library pane. */
function appendLegacyDraftRecovery(host) {
  host.appendChild(btn('<i class="ph ph-clock-counter-clockwise"></i> ' +
    (getLang() === "en" ? "Saved drafts" : "טיוטות שמורות"), recoverSavedModelerDraft, "md-wide"));
  var action = btn('<i class="ph ph-clock-counter-clockwise"></i> ' +
    (getLang() === "en" ? "Recover earlier draft" : "שחזור טיוטה קודמת"), recoverLegacyModelerDraft, "md-wide");
  action.hidden = true;
  host.appendChild(action);
  loadModelerDraftRecord().then(function (legacy) {
    if (action.isConnected) action.hidden = !legacy && !readModelerDraft(modelerDraftStorage());
  }).catch(function () {
    if (action.isConnected) action.hidden = !readModelerDraft(modelerDraftStorage());
  });
}

async function recoverSavedModelerDraft() {
  var records;
  try { records=await listModelerDraftRecords(); }
  catch(error) { flash(String(error.message || error)); return; }
  var dialog=document.createElement("dialog");
  dialog.className="md-properties-dialog";
  dialog.appendChild(el("h3","",getLang()==="en" ? "Saved drafts" : "טיוטות שמורות"));
  dialog.appendChild(el("p","",getLang()==="en"
    ? "Recover work from this browser, including an unresponsive tab. The original draft stays available."
    : "שחזור עבודה מהדפדפן, כולל לשונית שאינה מגיבה. הטיוטה המקורית נשמרת."));
  records.forEach(function(record){
    var doc=record.docType==="assembly" ? record.assembly : record.def;
    var row=el("div","md-card");
    row.appendChild(el("strong","",doc && doc.name || t("title")));
    row.appendChild(el("p","",new Date(record.at || 0).toLocaleString()+" · "+((doc && doc.history || []).length)+" "+t("steps")));
    var recover=btn(getLang()==="en" ? "Recover here" : "שחזור כאן",async function(){
      dialog.close();dialog.remove();
      if(!await confirmDiscardDocument("unsavedOpen"))return;
      var draft=cloneData(record);delete draft.id;
      if(restoreModelerDraft(draft))scheduleModelerDraft();
    },"md-wide");
    row.appendChild(recover);dialog.appendChild(row);
  });
  if(!records.length)dialog.appendChild(el("p","",getLang()==="en" ? "No saved drafts." : "אין טיוטות שמורות."));
  dialog.appendChild(btn(t("close"),function(){dialog.close();dialog.remove();},"md-wide"));
  dialog.addEventListener("cancel",function(){dialog.remove();});
  root.appendChild(dialog);dialog.showModal();
}

async function recoverLegacyModelerDraft() {
  if (!await confirmDiscardDocument("unsavedOpen")) return;
  var accepted = await askModelerDecision(root, {
    title:t("recoverDraftTitle"),
    message:getLang() === "en"
      ? "Recover the earlier shared draft? It may still be open in another browser tab."
      : "לשחזר את הטיוטה המשותפת הקודמת? ייתכן שהיא עדיין פתוחה בלשונית דפדפן אחרת.",
    accept:t("restoreDraftAction"), cancel:t("keepEditingAction"),
  });
  if (!accepted) return;
  await discardModelerDraft();
  var recovered = null;
  try { recovered = await claimLegacyModelerDraftRecord(modelerDraftOwnerId); }
  catch (error) {}
  var local = claimLegacyModelerDraft(modelerDraftStorage(),modelerDraftOwnerId);
  recovered = recovered || local;
  if (!recovered) {reconcileModelerDraft();return;}
  set_modelerDraftCache(recovered);
  restoreModelerDraft(recovered);
  reconcileModelerDraft();
  refreshLib();
}

function libraryThumbnailsVisible() {
  var host = root && root.querySelector("#mdLib"), pane = host && host.closest('.md-pane[data-pane="lib"]');
  return !!(E.open && !document.hidden && pane && pane.classList.contains("on"));
}
function scheduleLibThumbs() {
  if (libraryThumbnailsVisible() && libThumbQueue.length && !libThumbTimer) set_libThumbTimer(setTimeout(fillLibThumbs, 0));
}
function libThumb(type, icon) {
  if (libraryThumbnailsVisible() && type && FURN[type] && hasThumb(type)) {
    var url = modelThumb(type);
    if (url) { var img = el("img", "md-card-thumb"); img.src = url; img.alt = ""; return img; }
  }
  var box = el("span", "md-card-thumb md-card-thumb-empty");
  box.appendChild(el("i", "ph " + icon));
  if (type && FURN[type]) {
    libThumbQueue.push({ box: box, type: type });
    scheduleLibThumbs();
  }
  return box;
}
function fillLibThumbs() {
  set_libThumbTimer(0);
  if (!libraryThumbnailsVisible()) return;
  loadThumbCache().then(function () {
    if (!libraryThumbnailsVisible()) return;
    // thumbAsync draws the missing ones in short steps (and waits for the
    // renderer if it is still starting); a stored one resolves at once
    libThumbQueue.splice(0).forEach(function (job) {
      if (!job.box.isConnected) return;
      thumbAsync(job.type).then(function (url) {
        if (!url || !job.box.isConnected) return;
        var img = el("img", "md-card-thumb"); img.src = url; img.alt = ""; job.box.replaceWith(img);
      });
    });
  });
}

async function saveAssemblyCopyAndOpen(assembly) {
  if (!await confirmDiscardDocument("unsavedOpen")) return false;
  var owner=E.assembly,history=currentHistoryNode(),type=E.docType;
  var sourceKey=assembly.key,sourceSignature=JSON.stringify(assembly);
  var isCurrent=function(){return E.docType===type&&E.assembly===owner&&currentHistoryNode()===history;};
  var sourceCurrent=function(){var stored=loadAssemblies().find(function(a){return a.key===sourceKey;});return stored&&JSON.stringify(stored)===sourceSignature;};
  if(!sourceCurrent()){flash('The saved assembly changed; refresh the library and retry');return false;}
  var answer=await sheetForm(t("saveCopyOpen"),[{key:"name",label:t("name"),value:(assembly.name||t("newAssembly"))+" copy"}],t("saveCopyHint"));
  var name=String(answer?.name||'').trim();if(!name)return false;
  if(!isCurrent()||!sourceCurrent()){flash('The document or saved assembly changed; retry Save copy and open');return false;}
  var copy=cloneData(assembly);copy.key="asm_"+Date.now().toString(36)+"_"+uid();copy.name=name;
  if(copy.id!==undefined)copy.id=copy.key;if(copy.definitionId!==undefined)copy.definitionId=copy.key;
  if(!await saveAssemblies(copy,{expected:null})){
    report(t("reportKickerSave"),t("saveAssemblyFailed"),t(lastAssemblySaveConflict?"saveAssemblyConflict":"saveStorageFull"));return false;
  }
  if(!isCurrent() || E.quickFormInstance?.hasPendingEdits()){refreshLib();flash("✓ "+tf("savedNamed",{name:name}));return true;}
  abandonDocumentExactWork();closeEvalCard();
  E.assembly=cloneData(compactAssemblyTopologySnapshots(resolvedLibraryAssembly(copy)));set_assemblyOpenBaseline(cloneData(copy));E.componentSel=[];E.sel=null;
  S.idc=nextDocumentNumericId(E.assembly,S.idc);invalidateInterference();H.clear().seed();markDocumentClean();reconcileModelerDraft();
  syncHead();refreshAll();refreshLib();fitPreview();flash("✓ "+tf("savedNamed",{name:name}));return true;
}

function refreshLib() {
  var host = root.querySelector("#mdLib");
  set_libThumbQueue([]);
  host.innerHTML = "";
  var libraryKind=E.docType==='assembly'?'assembly':'part';
  var librarySearch=appendSavedLibrarySearch(host,{query:librarySearchQueries[libraryKind],label:getLang()==='en'?(libraryKind==='assembly'?'Search saved assemblies':'Search saved models'):(libraryKind==='assembly'?'חיפוש הרכבות שמורות':'חיפוש מודלים שמורים'),noMatches:getLang()==='en'?'No matching saved models':'לא נמצאו מודלים מתאימים',onQuery:function(value){librarySearchQueries[libraryKind]=value;}});
  host.appendChild(btn('New from '+(E.docType==='assembly'?'assembly':'part')+' template',function(){void documentPresetAction('new');},'md-wide md-dashed'));
  if (E.docType === "assembly") {
    host.appendChild(btn('<i class="ph ph-file-plus"></i> ' + t("newAssembly"), newModel, "md-wide md-dashed"));
    host.appendChild(btn(getLang()==="en" ? "Save combined model to room library" : "שמירת מודל משולב לספריית החדר", publishAssemblyModel, "md-wide"));
    libraryTransferButtons(host);
    var assemblies = loadAssemblies();
    if (!assemblies.length) { emptyState(host, "ph-stack", t("assemblies"), t("noComponentsHint")); return; }
    var assemblySearch=librarySearch;
    assemblies.forEach(function (assembly) {
      var card = el("div", "md-card" + (E.assembly && assembly.key === E.assembly.key ? " on" : ""));
      var top = el("div", "md-card-top");
      // the combined model once published to the room library, else its first part
      var first = (assembly.components || [])[0];
      var pic = FURN["cm_" + assembly.key] ? "cm_" + assembly.key : first && first.modelKey;
      top.appendChild(libThumb(pic, "ph-stack"));
      top.appendChild(el("span", "nm", assembly.name || assembly.key)); card.appendChild(top);
      card.appendChild(el("div", "md-card-note",
        countLabel((assembly.components || []).length, "assemblyComponentOne", "assemblyComponents") + " · " +
        countLabel(assemblyMateCount(assembly), "matesCountOne", "matesCount")));
      card.addEventListener("click", async function () {
        if (!await confirmDiscardDocument("unsavedOpen")) return;
        abandonDocumentExactWork();closeEvalCard();
        var occurrenceSnapshot=compactAssemblyTopologySnapshots(assembly);
        E.assembly = cloneData(occurrenceSnapshot); set_assemblyOpenBaseline(cloneData(assembly)); E.componentSel = []; E.sel = null;
        if(E.assembly.components?.some(c=>c.libraryLink))applyTrackedUpdates(E.assembly);
        S.idc = nextDocumentNumericId(E.assembly, S.idc);
        invalidateInterference();
        /* Opening an assembly is a document open, the same as the part cards
           below. Without these two lines the new assembly inherited the
           previous document's undo stack and its saved baseline, so Undo
           reached back into a document that was no longer open and the dirty
           flag was reporting on one that no longer existed. */
        H.clear().seed();
        markDocumentClean();
        reconcileModelerDraft();
        syncHead(); refreshAll(); refreshLib(); fitPreview();
      });
      card.appendChild(btn(t("saveCopyOpen"),function(e){e.stopPropagation();return saveAssemblyCopyAndOpen(assembly);},"md-wide"));
      var del = btn('<i class="ph ph-trash"></i>', function (e) {
        e.stopPropagation();
        saveAssemblies(assembly.key,{mode:"delete"}).then(function (ok) {
          if (!ok) flash(t("saveStorageFull"));
          refreshLib();
        });
      }, "md-card-x");
      del.title = t("del"); card.appendChild(del); host.appendChild(card); assemblySearch.add(assembly,card);
    });
    assemblySearch.apply();
    return;
  }
  host.appendChild(btn('<i class="ph ph-file-plus"></i> ' + t("newModel"), newModel, "md-wide md-dashed"));
  /* Models and assemblies use separate stores and separate cards. On reload
     the editor opens in Part mode, so a saved assembly otherwise looks lost
     while this pane shows only parts. Give its library a direct route here. */
  var savedAssemblies=loadAssemblies().length;
  if(savedAssemblies) host.appendChild(btn('<i class="ph ph-stack"></i> ' + t("assemblies") + " · " + savedAssemblies,
    function () { requestDocumentType("assembly"); }, "md-wide"));
  libraryTransferButtons(host);
  appendLegacyDraftRecovery(host);
  appendDiskBackupNote(host);
  var lib = loadLib();
  if (!lib.length) { emptyState(host, "ph-folder-open", t("noLib"), t("noLibHint")); return; }
  var partSearch=librarySearch;
  lib.forEach(function (m) {
    /* Clicking the card loads it — the row used to be inert with a "Load"
       button riding on it, which read as a list you could select from. */
    var card = el("div", "md-card" + (m.key === E.def.key ? " on" : ""));
    card.title = t("load");
    var top = el("div", "md-card-top");
    top.appendChild(libThumb(m.key, (m.parts || []).length ? "ph-cube" : "ph-pencil-ruler"));
    top.appendChild(el("span", "nm", m.name || m.key));
    card.appendChild(top);
    card.appendChild(el("div", "md-card-note", (m.parts || []).length
      ? m.parts.length + " " + t("partCount") +
        (fin(m.w) ? " · " + [m.w,m.d,m.h].map(formatModelLength).join("×") + " cm" : "")
      : (function(){
          var drawing=drawingOnlyContentSummary(m);
          if(drawing)return t("drawingOnly")+" · "+drawing.annotations+" "+t(drawing.annotations===1?"paperAnnotation":"paperAnnotations")+" · "+drawing.notes+" "+t(drawing.notes===1?"drawingNote":"drawingNotes");
          var count=(m.sketches || []).filter(function(sketch){return (sketch.entities || []).length || (m.history || []).some(function(entry){return entry.kind === "sketch" && entry.targetId === sketch.id;});}).length;
          return t("sketchOnly") + " · " + count + " " + t(count === 1 ? "sketch" : "sketches");
        })()));
    card.addEventListener("click", async function () {
      /* A library choice is a document open, not an in-place geometry swap.
         Replacing E.def directly skipped the initialization below in
         openModeler(): canonical history/authoring state, active sketch,
         rebuild state, document-scoped tree state and selection arrays all
         continued to describe the previously open model.  It also left the
         Library pane selected, making a correctly persisted feature history
         look as though it had not loaded.  Use the one document-open path so
         selecting a saved model behaves exactly like opening it from a placed
         instance and lands on its design tree. */
      if (!await confirmDiscardDocument("unsavedOpen")) return;
      E.quickFormInstance?.dismiss(true);
      openModeler(null, m, null, true);
    });
    card.appendChild(btn(t("saveCopyOpen"), async function(e) {
      e.stopPropagation();
      if (!await confirmDiscardDocument("unsavedOpen")) return;
      const previousPart=E.def, previousAssembly=E.assembly, generation=H.generation, history=currentHistoryNode();
      var answer=await sheetForm(t("saveCopyOpen"),[{key:"name",label:t("name"),value:(m.name || t("newModel"))+" copy"}],t("saveCopyHint"));
      var name=answer && answer.name;
      if (!name) return;
      var copy=cloneData(m);
      copy.key="cm_"+Date.now().toString(36)+"_"+uid();
      copy.id=copy.definitionId=copy.key;
      copy.name=name;
      if (!await saveLib(copy,{expected:null})) {
        report(t("reportKickerSave"),t("saveLibraryFailed"),t("saveStorageFull"));return;
      }
      registerCustomModel(copy);
      const stillConfirmed=E.def===previousPart && E.assembly===previousAssembly && H.generation===generation && currentHistoryNode()===history;
      await openModeler(null,copy,null,stillConfirmed);
      refreshLib();
      flash("✓ "+tf("savedNamed",{name:name}));
    },"md-wide"));
    var x = btn('<i class="ph ph-trash"></i>', async function (e) {
      e.stopPropagation();
      if (!await askModelerDecision(root, { title:t("delModel"), message:t("askDel") + "\n" + (m.name || m.key), accept:t("del"), cancel:t("m_cancel") })) return;
      if (!await saveLib(m.key,{mode:"delete"})) { flash(t("saveStorageFull")); return; }
      delete FURN[m.key];
      delete PRICE[m.key];
      refreshCatalogSelect();
      refreshLib();
      garbageCollectAttachments([S,E.def,loadLib(),loadAssemblies()]).catch(function(){});
    }, "md-card-x");
    x.title = t("delModel");
    card.appendChild(x);
    host.appendChild(card); partSearch.add(m,card);
  });
  partSearch.apply();
}

function syncHead() {
  var name = root.querySelector("#mdName"), price = root.querySelector("#mdPrice");
  var description = root.querySelector("#mdDescription");
  var unitControl=root.querySelector("#mdDocumentLengthUnit");
  if(unitControl)unitControl.value=modelLengthUnit();
  if (description) description.value = documentDescription(E.docType === "assembly" ? E.assembly : E.def);
  if (E.docType === "assembly") {
    name.value = E.assembly ? E.assembly.name || "" : "";
    price.closest(".md-field").style.display = "none";
    root.querySelector("#mdSave").innerHTML = '<i class="ph ph-floppy-disk"></i> ' + t("saveAssembly");
  } else {
    name.value = E.def.name || "";
    price.value = fin(E.def.price) ? E.def.price : 0;
    price.closest(".md-field").style.display = "";
    root.querySelector("#mdSave").innerHTML = '<i class="ph ph-floppy-disk"></i> ' + t("save");
  }
  // says whether saving replaces a library entry or re-points a placed piece
  var sub = root.querySelector("#mdSub");
  if (sub) sub.textContent = E.docType === "assembly" ? "· " + t("docAssembly") : E.srcItem ? "· " + (flabel ? flabel(E.srcItem.type) : E.srcItem.type) : "";
}

/* The exact-tree twin of the `merges3d` fusion the viewport performs.
   Every merge kind gets emitted, not just the analytic extrusion: a merged
   sweep that only the viewport knew about was a body STEP export, mass and
   interference all silently built without. The params are the kernel-facing
   ones, which is exactly what regenerateFeatures hands to makeBrep*. */
function mergeFeatureRecipe(merge) {
  return toolFeatureRecipe(merge);
}

function emitPartMerges(target, part, feature) {
  (part.merges3d || []).forEach(function (merge, mergeIndex) {
    if (merge.suppressed) return;
    var recipe = mergeFeatureRecipe(merge.hingeSpec ? projectedHingeTool(part,merge) : merge);
    if (!recipe) return;
    var addition = addFeature(target, { id:part.featureId + ":merge-body:" + mergeIndex, type:recipe.type, name:"Merged body " + (mergeIndex+1), params:recipe.params });
    feature = addFeature(target, { id:part.featureId + ":merge:" + mergeIndex, type:"union", name:"Merge " + (mergeIndex+1), inputs:[feature.id,addition.id] });
  });
  return feature;
}

/* A part's OWN pattern turn, as the last row of its chain.
 *
 * rotatePatternPart records a circular or curve copy's turn on the part as
 * `patternRotations`, and buildPart nests it as groups around the whole
 * rendered body — outside the profile holes, outside the merges, outside the
 * finish operations. Nothing emitted it here, so STEP/IGES, mass properties and
 * interference rebuilt every such copy at the SEED's angle: translated but
 * never turned. Emitting it last is what makes the exact tree describe the body
 * the viewport draws.
 *
 * It also has to be last for the merges below it: fusePatternInstances stores a
 * cluster's placements in the HOST's frame, which is only correct if the host's
 * turn is applied outside them, which is exactly where this row sits. */
function emitPartPatternTurn(target, part, feature) {
  var turn = partPatternTransform(part);
  if (rigidTransformIsIdentity(turn)) return feature;
  return addFeature(target, {
    id:part.featureId + ":pattern-turn", type:"transformBody", name:"Pattern turn",
    params:{matrix:turn.matrix.slice(), translation:{...turn.translation}}, inputs:[feature.id],
  });
}

function cancelExactModelRebuild() {
  var hadRetainedPreview=retainingExactPreview();
  if(pendingCutController)pendingCutController.abort();
  set_cancelledExactPreview({document:E.def,node:currentHistoryNode()});
  (E.def?.parts || []).forEach(function(part){
    var scheduled=exactBuildTimers.get(part);
    if(scheduled){clearTimeout(scheduled);exactBuildTimers.delete(part);}
    part.exactBuildToken=(part.exactBuildToken || 0)+1;
    part.exactPending=false;
    part.exactError="Exact CAD computation cancelled";
  });
  exactRebuildQueue.reset();
  cancelCadWorkerWork();
  E.kernelBusy=false;
  E.exactRestoring=false;
  if(hadRetainedPreview){updatePreview();syncStatus();}
}

export {
  applyBoxSelection, beginPaintSelectDrag, beginSmartMateDrag,
  cancelExactModelRebuild, emitPartMerges, emitPartPatternTurn, refreshLib,
  scheduleLibThumbs, setMode, syncHead,
};

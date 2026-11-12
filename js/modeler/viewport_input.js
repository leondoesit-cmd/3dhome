/* The CAD editor's viewport picking and drags: pick cycle, context menu, mate
   picks, Instant3D handles, box and paint selection, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { worldFrame } from "../cad_mate_model.js";
import { mateFrameSupports, mateFramesSupport, mateRequirementFor, topologyReference } from "../cad_mates.js";
import { getLang } from "../i18n.js";
import { contextToolbarItems, cycleOverlappingHits, selectionFilterAllows, selectionMenuItems } from "../modeler_chrome.js";
import { cadIcon } from "../modeler_icons.js";
import { applyHandleDrag, distancePointToSegment2d, extrudeHandlePose, filletGrowDirection, filletHandlePose, instant3dDisplayValue, instant3dModelValue, instant3dValueLabel, patternHandlePose } from "../modeler_instant3d.js";
import { NOTE_CATEGORIES, addMarkupToDef, addNoteToDef, applyBodyPaint, applyFacePaint, deleteNoteFromDef, sampleFaceAppearance, updateNoteInDef } from "../modeler_notes_paint.js";
import { cloneData, normalizeTransform, partBounds } from "../modeler_part_geometry.js";
import { dedupeFinishRefs, dedupeTopologyCandidates, pickPointer, pickScratch } from "../modeler_pick_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { chromeCommandLabel, chromeSelectionInput, closeChromeOverlays, commandSelectionPrefer, runChromeCommand, selectionFilterLabel, showContextMenu } from "../modeler/command_manager.js";
import { componentLabel, mateHolderById, refreshParts } from "../modeler/component_mates.js";
import { pushUndo, scheduleModelerDraft } from "../modeler/document_history.js";
import { measureFromPick } from "../modeler/document_outputs.js";
import { flash } from "./drawing_sheet_touch.js";
import { btn, el } from "../modeler/editor_dom.js";
import { syncLiveFeatureEdit } from "../modeler/feature_tree.js";
import { activeFilletParams, currentFinishEdges, edgeRefsForFaces, filletReferenceEndpoints, finishCommandActive, fullRoundActive, queueNewFeaturePreview, syncNewFeaturePreview, toggleFinishEdges, toggleFullRoundFace } from "../modeler/finish_preview.js";
import { beginSmartMateDrag, setMode } from "../modeler/library_io.js";
import { retainingExactPreview, updatePreview } from "../modeler/library_panel.js";
import { featureTypeLabel } from "../modeler/library_store.js";
import { syncNotesAndMarkups, syncPaintToolbar } from "../modeler/notes_markups.js";
import { selectedSolid } from "../modeler/part_commands.js";
import { activeTab, chooseSketchReference, facePickFromViewport, modelLengthUnit, setTab } from "../modeler/sketch_workflow.js";
import { assemblyComponentById, pickOwnerChain, rawTopologyPickCandidate, resolveTopologyPick } from "../modeler/topology_pick.js";
import { beginAssemblyComponentDrag, beginBoxSelectDrag, instantScratch } from "../modeler/viewport_drags.js";
import { THREE } from "../three_lazy.js";
import { E, refreshAll, refreshSelection, root } from "../modeler.js";

function openNoteEditor(note) {
  if (!root || !note) return;
  var dlg = root.querySelector("#mdNoteEditor");
  if (!dlg) return;
  E.activeNoteId = note.id;
  E.noteEditorOpen = true;
  var titleEl = dlg.querySelector("#mdNoteEditorTitle");
  if (titleEl) {
    var idx = (E.def && Array.isArray(E.def.notes) ? E.def.notes.findIndex(function (n) { return n.id === note.id; }) : -1);
    titleEl.textContent = t("noteEditorTitle") + (idx >= 0 ? " #" + (idx + 1) : "");
  }
  var textarea = dlg.querySelector("#mdNoteEditorText");
  if (textarea) {
    textarea.value = note.text || "";
    setTimeout(function () { textarea.focus(); textarea.select(); }, 50);
  }
  var catsHost = dlg.querySelector("#mdNoteEditorCats");
  if (catsHost) {
    catsHost.innerHTML = "";
    Object.keys(NOTE_CATEGORIES).forEach(function (key) {
      var cat = NOTE_CATEGORIES[key];
      var label = getLang() === "he" && cat.labelHe ? cat.labelHe : cat.label;
      var chip = el("button", "md-note-cat-chip" + (note.category === key ? " on" : ""), label);
      chip.type = "button";
      if (note.category === key) chip.style.background = cat.color;
      chip.addEventListener("click", function () {
        pushUndo(t("editNote"));
        updateNoteInDef(E.def, note.id, { category: key, color: cat.color });
        openNoteEditor(E.def.notes.find(function (n) { return n.id === note.id; }));
        if (E.pv) syncNotesAndMarkups(E.pv);
      });
      catsHost.appendChild(chip);
    });
  }
  dlg.hidden = false;
}

function closeNoteEditor() {
  if (!root) return;
  var dlg = root.querySelector("#mdNoteEditor");
  if (dlg) dlg.hidden = true;
  E.noteEditorOpen = false;
}

function beginPaintDrag(event, view) {
  if (!view || !view.grp) return false;
  var hit = resolveTopologyPick(event, view, { prefer: "face" }) || {};
  if (!hit.part && (!hit.reference || hit.reference.kind !== "face")) return false;

  event.preventDefault();
  var canvas = view.rr && view.rr.domElement;
  if (canvas) {
    try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  }

  if (event.altKey || E.paintEyedropper) {
    var appearance = sampleFaceAppearance(E.def, hit.reference, hit.part);
    E.paintColor = appearance.color || "#3b82f6";
    E.paintMetal = appearance.metal != null ? appearance.metal : 0.1;
    E.paintRough = appearance.rough != null ? appearance.rough : 0.5;
    E.paintEyedropper = false;
    syncPaintToolbar();
    flash((t("paintEyedropper") || "Sampled") + ": " + E.paintColor);
    return true;
  }

  var paintedCount = 0;
  var paintedKeys = new Set();
  /* Dragging across a model paints each new face once — paintedKeys already
     stops a face being repainted — but every one of those still forced a
     synchronous updatePreview() and refreshParts() from a pointermove
     handler. Sweeping thirty faces meant thirty full rebuilds, which is the
     uncoalesced-work-on-pointermove that docs/plans/MODEL_EDITOR_PERF_PLAN.md exists to
     forbid. Mark dirty, rebuild once on the next frame. */
  var rebuildFrame = 0;
  function scheduleRebuild() {
    if (rebuildFrame) return;
    rebuildFrame = requestAnimationFrame(function () {
      rebuildFrame = 0;
      updatePreview();
      refreshParts();
    });
  }
  function cancelRebuild() {
    if (!rebuildFrame) return;
    cancelAnimationFrame(rebuildFrame);
    rebuildFrame = 0;
  }
  function paintTarget(h) {
    if (E.paintMode === "face" && h.reference && h.reference.kind === "face") {
      if (paintedKeys.has(h.reference.persistentId)) return;
      if (!paintedCount) pushUndo(E.paintMode === "face" ? t("paintFace") : t("paintBody"));
      paintedKeys.add(h.reference.persistentId);
      applyFacePaint(E.def, h.reference, { color: E.paintColor, metal: E.paintMetal, rough: E.paintRough });
      paintedCount++;
      scheduleRebuild();
    } else if (E.paintMode === "body" && h.part) {
      if (paintedKeys.has(h.part.id)) return;
      if (!paintedCount) pushUndo(E.paintMode === "face" ? t("paintFace") : t("paintBody"));
      paintedKeys.add(h.part.id);
      applyBodyPaint(h.part, { color: E.paintColor, metal: E.paintMetal, rough: E.paintRough });
      paintedCount++;
      scheduleRebuild();
    }
  }

  paintTarget(hit);

  function onMove(ev) {
    var moveHit = resolveTopologyPick(ev, view, { prefer: "face" }) || {};
    paintTarget(moveHit);
  }

  function onUp(ev) {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (canvas) {
      try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
    }
    /* The gesture is over, so the coalesced frame has nothing left to do —
       this rebuild supersedes it, and letting both run would rebuild twice. */
    cancelRebuild();
    if (paintedCount > 0) {
      scheduleModelerDraft();
      updatePreview();
      refreshParts();
    }
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  return true;
}

function pickPaintAction(event, view) {
  var hit = resolveTopologyPick(event, view, { prefer: "face" }) || {};
  if (event.altKey || E.paintEyedropper) {
    var appearance = sampleFaceAppearance(E.def, hit.reference, hit.part);
    E.paintColor = appearance.color || "#3b82f6";
    E.paintMetal = appearance.metal != null ? appearance.metal : 0.1;
    E.paintRough = appearance.rough != null ? appearance.rough : 0.5;
    E.paintEyedropper = false;
    syncPaintToolbar();
    flash((t("paintEyedropper") || "Sampled") + ": " + E.paintColor);
    return;
  }
  if (E.paintMode === "face" && hit.reference && hit.reference.kind === "face") {
    pushUndo(t("paintFace"));
    applyFacePaint(E.def, hit.reference, { color: E.paintColor, metal: E.paintMetal, rough: E.paintRough });
    updatePreview();
    refreshParts();
  } else if (E.paintMode === "body" && hit.part) {
    pushUndo(t("paintBody"));
    applyBodyPaint(hit.part, { color: E.paintColor, metal: E.paintMetal, rough: E.paintRough });
    updatePreview();
    refreshParts();
  }
}

function beginMarkupDrag(event, view) {
  if (!view || !view.rr) return false;
  event.preventDefault();
  var canvas = view.rr.domElement;
  var rect = canvas.getBoundingClientRect();
  var startX = event.clientX - rect.left;
  var startY = event.clientY - rect.top;

  if (E.noteMode === "eraser") {
    // One history step starts before the swipe removes its first stroke.
    var erased = 0;
    function eraseAt(x, y) {
      if (eraseMarkupAt(x, y, function () { if (!erased) pushUndo(t("eraseMarkup")); })) erased++;
    }
    eraseAt(startX, startY);
    function onEraseMove(ev) {
      eraseAt(ev.clientX - rect.left, ev.clientY - rect.top);
    }
    function onEraseUp() {
      window.removeEventListener("pointermove", onEraseMove);
      window.removeEventListener("pointerup", onEraseUp);
      if (erased) scheduleModelerDraft();
    }
    window.addEventListener("pointermove", onEraseMove);
    window.addEventListener("pointerup", onEraseUp);
    return true;
  }

  var pts = [{ x: startX, y: startY }];
  E.activeMarkupStroke = {
    color: E.markupColor || "#ef4444",
    width: E.markupWidth || 3,
    points: pts,
  };
  syncNotesAndMarkups(view);

  function onMove(ev) {
    var px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    var last = pts[pts.length - 1];
    if (!last || Math.hypot(px - last.x, py - last.y) >= 2) {
      pts.push({ x: px, y: py });
      syncNotesAndMarkups(view);
    }
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (pts.length >= 2) {
      pushUndo(t("addMarkup"));
      addMarkupToDef(E.def, {
        color: E.markupColor || "#ef4444",
        width: E.markupWidth || 3,
        points: pts,
      });
    }
    E.activeMarkupStroke = null;
    syncNotesAndMarkups(view);
    refreshParts();
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  return true;
}

/* Capture the first removal before mutation; empty eraser swipes create no history. */
function eraseMarkupAt(x, y, beforeErase) {
  if (!E.def || !Array.isArray(E.def.markups)) return false;
  var markups = E.def.markups;
  var hitIndex = -1;
  var radius = 14;
  for (var i = markups.length - 1; i >= 0; i--) {
    var stroke = markups[i];
    if (!stroke || !Array.isArray(stroke.points)) continue;
    for (var j = 0; j < stroke.points.length; j++) {
      var p = stroke.points[j];
      if (Math.hypot(p.x - x, p.y - y) <= radius) {
        hitIndex = i;
        break;
      }
    }
    if (hitIndex >= 0) break;
  }
  if (hitIndex < 0) return false;
  if (beforeErase) beforeErase();
  E.def.markups.splice(hitIndex, 1);
  /* The overlay follows immediately so the stroke disappears under the
     pointer; beforeErase captures history before the first removal. */
  if (E.pv) syncNotesAndMarkups(E.pv);
  refreshParts();
  return true;
}

function pickNoteAction(event, view) {
  if(retainingExactPreview())return;
  var canvas = view.rr && view.rr.domElement;
  if (!canvas) return;
  var rect = canvas.getBoundingClientRect();
  /* The file's existing lazy-scratch pattern: THREE is late-bound, so these
     cannot be module-level constants, and a click should not mint a raycaster. */
  var raycaster = pickScratch();
  var mouse = pickPointer.set(
    ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1,
    -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, view.cam);
  var hits = raycaster.intersectObjects(view.grp.children, true);
  var hit = hits.find(function (h) {
    return h.object && h.object.isMesh && h.object.userData && (h.object.userData.cadPart || h.object.userData.cadFeatureId);
  }) || hits.find(function (h) { return h.object && h.object.isMesh; });

  if (hit && hit.point) {
    var noteNormal = { x: 0, y: 1, z: 0 };
    if (hit.face && hit.face.normal) {
      var nVec = hit.face.normal.clone();
      if (hit.object.matrixWorld) nVec.transformDirection(hit.object.matrixWorld);
      noteNormal = { x: nVec.x, y: nVec.y, z: nVec.z };
    }
    var num = ((E.def && E.def.notes && E.def.notes.length) || 0) + 1;
    pushUndo(t("addNote"));
    var note = addNoteToDef(E.def, {
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      normal: noteNormal,
      text: "Note " + num,
      category: "general",
    });
    E.activeNoteId = note.id;
    openNoteEditor(note);
    syncNotesAndMarkups(view);
    refreshParts();
  }
}

function renderTreeAnnotations(host) {
  var notes = E.def && Array.isArray(E.def.notes) ? E.def.notes : [];
  var markups = E.def && Array.isArray(E.def.markups) ? E.def.markups : [];
  if (!notes.length && !markups.length) return;

  var details = el("details", "md-tree-group md-tree-notes");
  details.open = true;
  var summary = el("summary", "", '<i class="ph ph-chat-circle-text"></i> ' + t("notesAnnotations") + " (" + (notes.length + (markups.length ? " · " + markups.length + " " + (t("noteModeMarkup") || "pen") : "")) + ")");
  details.appendChild(summary);

  for (var i = 0; i < notes.length; i++) {
    (function (n, index) {
      var item = el("div", "md-tree-note-item");
      item.innerHTML =
        '<span class="md-tree-note-badge" style="background:' + (n.color || "#2563eb") + '">' + (index + 1) + '</span>' +
        '<span class="md-tree-note-text"></span>' +
        '<button type="button" class="md-tree-note-del" title="' + t("deleteNote") + '"><i class="ph ph-trash"></i></button>';

      var textEl = item.querySelector(".md-tree-note-text");
      if (textEl) textEl.textContent = n.text || "Note";

      item.addEventListener("click", function (e) {
        if (e.target.closest(".md-tree-note-del")) return;
        E.activeNoteId = n.id;
        if (E.mode !== "3d") setMode("3d");
        if (E.pv) {
          E.pv.target.set(n.point.x, n.point.y, n.point.z);
          E.pv.render();
        }
        openNoteEditor(n);
      });

      var delBtn = item.querySelector(".md-tree-note-del");
      if (delBtn) {
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          pushUndo(t("deleteNote"));
          deleteNoteFromDef(E.def, n.id);
          if (E.activeNoteId === n.id) closeNoteEditor();
          refreshAll();
        });
      }
      details.appendChild(item);
    })(notes[i], i);
  }

  host.appendChild(details);
}

function pickAssemblyComponent(event, view) {
  if (!view || !view.grp) return;
  /* Measure takes the click whole: it is asking a question about the model,
     not changing what is selected in it. */
  if (E.measure) { measureFromPick(event, view); return; }
  if (E.tool === "paint") { pickPaintAction(event, view); return; }
  if (E.tool === "note" && (!E.noteMode || E.noteMode === "callout")) { pickNoteAction(event, view); return; }
  if (E.docType === "part") {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !E.mobileAddSelection && E.authoring) E.authoring.featureSelection = [];
    var found = resolveTopologyPick(event, view, { prefer: commandSelectionPrefer() }) || {};
    if (found.helixId && !E.facePick) {
      if(found.helixId.indexOf("plane:")===0){
        var originPlane=(E.def.references || []).find(function(ref){return ref.id===found.helixId;});
        if(originPlane){chooseSketchReference(originPlane);return;}
      }
      E.selectedReferenceId = found.helixId;
      if (!event.ctrlKey && !event.metaKey) E.topologySelection = [];
      refreshSelection();
      return;
    }
    var part = found.part || null, topologyReferencePicked = found.reference || null;
    /* A sketch waiting for its face takes the click whole: no edge promotion,
       no multi-select, no filter — the pick IS the answer to "where?". */
    if (E.facePick) {
      E.sel = part; E.ssel = [];
      if (part && found.pickedView) E.selectedFaceView = found.pickedView;
      facePickFromViewport(topologyReferencePicked);
      return;
    }
    var activeFilter = commandSelectionPrefer();
    if (activeFilter === "body") topologyReferencePicked = null;
    else if (topologyReferencePicked && !selectionFilterAllows(topologyReferencePicked.kind, activeFilter)) {
      /* The pointer is over geometry the active filter refuses. Dropping both
         the reference and the part without a word is what makes picking feel
         broken — the click looks identical to a click on nothing. Name the
         filter that rejected it instead. */
      flash(tf("selFilterBlocked", { kind: selectionFilterLabel(activeFilter) }));
      topologyReferencePicked = null;
      if (activeFilter !== "all") part = null;
    }
    var overlappingCandidates = (found.hits || []).map(function (hit) {
      return rawTopologyPickCandidate(hit, view);
    }).filter(function (candidate) {
      return candidate && selectionFilterAllows(candidate.reference.kind, activeFilter);
    });
    if (topologyReferencePicked) overlappingCandidates.unshift({ part: part, reference: topologyReferencePicked });
    overlappingCandidates = dedupeTopologyCandidates(overlappingCandidates);
    var overlapping = overlappingCandidates.map(function (candidate) { return candidate.reference; });
    /* One ray can hit the same edge several times, and promotePickedEdge maps
       several tessellated hits onto one merged edge. Cycling a list with
       repeats lands back on the current pick and looks like a dead click. */
    overlapping = dedupeFinishRefs(overlapping);
    /* Shift used to cycle these. It cannot: Shift is what CAD users press to
       GROW a selection, and here it was also the pan modifier (editor_view.js)
       — three jobs on one key, none of them "add". Cycling moved to the chip
       offered next to the cursor, which also makes it discoverable; Select
       Through on right-click remains the exhaustive list. The old cycle keyed
       off E.topologySelection[0] rather than what is under the pointer, so a
       second Shift-click somewhere else cycled the previous pick. */
    offerPickCycle(overlappingCandidates, topologyReferencePicked, event);
    E.sel = part;
    E.ssel = [];
    var draftState = E.authoring && E.authoring.featureType === "draft" && !E.authoring.featureEdit ? E.authoring.featurePreviewState : null;
    if (draftState && draftState.neutralPick && topologyReferencePicked) {
      if (topologyReferencePicked.kind !== "face" || (topologyReferencePicked.descriptor && topologyReferencePicked.descriptor.surface !== "plane")) { flash(t("draftNeutralNeedPlane")); return; }
      draftState.params = { ...(draftState.params || {}), neutralFace: cloneData(topologyReferencePicked) };
      draftState.neutralPick = false;
      E.topologySelection = (E.topologySelection || []).filter(function (reference) { return reference.persistentId !== topologyReferencePicked.persistentId; });
      if (draftState.syncNeutral) draftState.syncNeutral();
      syncNewFeaturePreview("draft", draftState, E.authoring.featurePreviewBadge);
      refreshSelection();
      return;
    }
    if (finishCommandActive() && topologyReferencePicked) {
      if (fullRoundActive() && topologyReferencePicked.kind === "face") toggleFullRoundFace(topologyReferencePicked);
      else if (topologyReferencePicked.kind === "face") toggleFinishEdges(edgeRefsForFaces([topologyReferencePicked], part || selectedSolid()));
      else if (topologyReferencePicked.kind === "edge") toggleFinishEdges([topologyReferencePicked]);
      return;
    }
    if (finishCommandActive() && !topologyReferencePicked) { refreshSelection(); return; }
    if (!part || !topologyReferencePicked) E.topologySelection = topologyReferencePicked ? [topologyReferencePicked] : [];
    else if (event.ctrlKey || event.metaKey || E.mobileAddSelection || (E.collectingFeature && ["shell","thicken","draft"].includes(E.authoring?.featureType))) {
      var selectedAt = E.topologySelection.findIndex(function (reference) { return reference.persistentId === topologyReferencePicked.persistentId; });
      if (selectedAt === -1) E.topologySelection.push(topologyReferencePicked); else E.topologySelection.splice(selectedAt,1);
    } else if (event.shiftKey) {
      // Add, never remove: that asymmetry with Ctrl is what makes Shift safe to
      // hold down while sweeping a fillet set.
      if (!E.topologySelection.some(function (reference) { return reference.persistentId === topologyReferencePicked.persistentId; })) {
        E.topologySelection.push(topologyReferencePicked);
      }
    } else E.topologySelection = [topologyReferencePicked];
    if (topologyReferencePicked && !event.ctrlKey && !event.metaKey && !event.shiftKey) E.selectedReferenceId = null;
    if(part && activeTab("R")==="sketch")setTab("shape");
    if(E.authoring && E.authoring.featureType && E.authoring.featurePreviewState && !E.authoring.featureEdit){
      syncNewFeaturePreview(E.authoring.featureType,E.authoring.featurePreviewState,E.authoring.featurePreviewBadge);
    }
    /* Picking a face records which standard plane it lies closest to — that is
       what a later "sketch on this face" needs. It does NOT move the camera:
       clicking a face to select it and having the model spin flat is the
       single most disorienting thing this editor did. Use the view cube, or
       Normal To, when you actually want to be square to it. */
    if (part && found.pickedView) E.selectedFaceView = found.pickedView;
    refreshSelection();
    return;
  }
  /* One pick resolves both halves of an assembly selection: which component
     was hit, and which face or edge of it. The reference is what a mate is
     built from, so it is kept rather than thrown away — the old code cleared
     it on every click, which left the Alt-click SmartMate unreachable and the
     mate buttons with nothing to work from but bounding boxes. */
  var found = resolveTopologyPick(event, view, { prefer: E.selectionFilter }) || {};
  var component = found.component || null;
  var reference = stampComponentRef(found.reference || null, component, found);
  /* Imported and smoothly tessellated bodies do not always resolve a persistent
     face entry even though the ray plainly landed on one. SmartMate already
     falls back to the geometric hit in that case; ordinary Cmd/Ctrl face
     selection needs the same fallback or it selects two components but hands
     the Mate command no faces. Keep the hit on this component — a ray may pass
     through several instances. */
  if (!reference && component && (E.selectionFilter === "all" || E.selectionFilter === "face")) {
    var componentHit = (found.hits || []).find(function (hit) {
      return hit.face && hit.face.normal && pickOwnerChain(hit.object, view.grp).component === component;
    });
    if (componentHit) reference = componentTopologyFromHit(component, componentHit);
  }
  var additive = event.ctrlKey || event.metaKey || E.mobileAddSelection;
  if (!component) { E.componentSel = []; E.topologySelection = []; }
  else if (additive) {
    var at = E.componentSel.indexOf(component);
    if (at === -1) E.componentSel.push(component); else E.componentSel.splice(at, 1);
  } else E.componentSel = [component];
  E.sel = E.componentSel[E.componentSel.length - 1] || null;
  if (component) {
    var picked = (E.topologySelection || []).filter(function (candidate) { return candidate.componentId; });
    if (additive) {
      /* Ctrl/Cmd builds the selection up, and picking the same reference twice
         takes it back off. The set is NOT capped at two: that cap was right for
         SmartMate and wrong for everything else an assembly selection feeds —
         measuring, appearances, hiding several faces at once — all of which
         silently lost the earlier picks. assemblyPickedRefs() takes the pair it
         needs out of the full set instead. */
      var kept = picked.filter(function (candidate) {
        return !(reference && candidate.componentId === reference.componentId && candidate.persistentId === reference.persistentId);
      });
      var removed = kept.length !== picked.length;
      E.topologySelection = reference && !removed ? kept.concat([reference]) : kept;
    } else {
      E.topologySelection = reference ? [reference] : [];
    }
  }
  refreshSelection();
}

/* "3 of 5 here" beside the cursor whenever a click resolved one of several
   overlapping references. Clicking it steps to the next one, which is the job
   Shift used to do invisibly — nothing in the editor said a second candidate
   existed, so the feature was only ever found by accident. Right-click still
   opens the full Select Through list; this is the one-handed version.

   The candidate list is captured at pick time. Re-raycasting on each step
   would let a hand that drifted two pixels renumber the list mid-cycle. */
function offerPickCycle(candidates, picked, event) {
  var list = (candidates || []).filter(function (candidate) { return candidate && candidate.reference; });
  if (!picked || list.length < 2 || !event || event.pointerType === "touch") { hidePickCycle(); return; }
  var at = list.findIndex(function (candidate) { return candidate.reference.persistentId === picked.persistentId; });
  E.pickCycle = { candidates: list, index: at < 0 ? 0 : at, x: event.clientX, y: event.clientY };
  renderPickCycle();
}

function hidePickCycle() {
  E.pickCycle = null;
  var host = root && root.querySelector("#mdPickCycle");
  if (host) { host.hidden = true; host.innerHTML = ""; }
}

function renderPickCycle() {
  var host = root && root.querySelector("#mdPickCycle"), cycle = E.pickCycle;
  if (!host) return;
  if (!cycle) { hidePickCycle(); return; }
  host.innerHTML = "";
  var button = el("button", "", '<i class="ph ph-stack-simple"></i> ' +
    tf("pickCycle", { index: cycle.index + 1, count: cycle.candidates.length }));
  button.type = "button";
  button.dataset.tip = t("pickCycleTip");
  button.addEventListener("click", function (clickEvent) {
    clickEvent.stopPropagation();
    stepPickCycle();
  });
  host.appendChild(button);
  host.hidden = false;
  var width = host.offsetWidth || 120, height = host.offsetHeight || 26;
  host.style.left = Math.max(8, Math.min(cycle.x + 14, window.innerWidth - width - 8)) + "px";
  host.style.top = Math.max(8, Math.min(cycle.y + 14, window.innerHeight - height - 8)) + "px";
}

function stepPickCycle() {
  if(retainingExactPreview())return;
  var cycle = E.pickCycle;
  if (!cycle || !cycle.candidates.length) return;
  var current = cycle.candidates[cycle.index];
  /* One implementation of "the next one under here", shared with the tests
     that cover it. The index is kept alongside only so the chip can count. */
  var next = cycleOverlappingHits(cycle.candidates.map(function (candidate) { return candidate.reference; }),
    current && current.reference.persistentId);
  if (!next) return;
  var at = cycle.candidates.findIndex(function (candidate) { return candidate.reference.persistentId === next.persistentId; });
  cycle.index = at < 0 ? 0 : at;
  var candidate = cycle.candidates[cycle.index];
  if (candidate.part) E.sel = candidate.part;
  if (finishCommandActive()) {
    if (fullRoundActive() && candidate.reference.kind === "face") toggleFullRoundFace(candidate.reference);
      else if (candidate.reference.kind === "face") toggleFinishEdges(edgeRefsForFaces([candidate.reference], candidate.part || selectedSolid()));
    else if (candidate.reference.kind === "edge") toggleFinishEdges([candidate.reference]);
  } else E.topologySelection = [candidate.reference];
  renderPickCycle();
  refreshSelection();
}

function showSelectThrough(event, view) {
  if (!root || !view) return;
  if (E.docType === "assembly") {
    var rect = view.rr.domElement.getBoundingClientRect();
    var pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    var ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, view.cam);
    var components = [], seen = new Set(), references = [], referenceSeen = new Set();
    ray.intersectObjects(view.grp.children, true).forEach(function (hit) {
      var candidate=rawTopologyPickCandidate(hit,view), owner=pickOwnerChain(hit.object,view.grp), reference=stampComponentRef(candidate?.reference,owner.component,null);
      if(reference?.componentId && selectionFilterAllows(reference.kind,E.selectionFilter)){
        var referenceKey=reference.componentId+"|"+reference.persistentId;
        if(!referenceSeen.has(referenceKey)){referenceSeen.add(referenceKey);references.push(reference);}
      }
      var object = hit.object;
      while (object && object !== view.grp) {
        var id = object.userData && object.userData.cadComponent;
        if (id) {
          var component = E.assembly.components.find(function (candidate) { return candidate.id === id; });
          if (component && !seen.has(id)) { seen.add(id); components.push(component); }
          break;
        }
        object = object.parent;
      }
    });
    if (!components.length) { showContextMenu(event.clientX, event.clientY, view); return; }
    var assemblyHost = root.querySelector("#mdContextMenu");
    if (!assemblyHost) return;
    closeChromeOverlays();
    assemblyHost.innerHTML = "";
    assemblyHost.appendChild(el("strong", "md-context-title", t("touchSelectThrough")));
    components.forEach(function (component, index) {
      var button = el("button", "", "<span>" + (index + 1) + ". " + (component.name || t("component")) + "</span>");
      button.type = "button";
      button.addEventListener("click", function () {
        var at = E.componentSel.indexOf(component);
        if (E.mobileAddSelection) {
          if (at < 0) E.componentSel.push(component); else E.componentSel.splice(at, 1);
        } else E.componentSel = [component];
        E.sel = E.componentSel[E.componentSel.length - 1] || null;
        closeChromeOverlays();
        refreshAll();
      });
      assemblyHost.appendChild(button);
    });
    if(references.length)assemblyHost.appendChild(el("strong","md-context-title","Select other face or edge"));
    references.forEach(function(reference,index){
      var button=btn((index+1)+". "+componentLabel(reference.componentId)+" · "+reference.kind+" · "+reference.persistentId,function(){
        var component=assemblyComponentById(reference.componentId);
        E.topologySelection=E.mobileAddSelection?(E.topologySelection || []).concat([reference]):[reference];
        E.componentSel=E.mobileAddSelection?Array.from(new Set((E.componentSel || []).concat([component]))):[component];
        E.sel=component;closeChromeOverlays();refreshSelection();
      });assemblyHost.appendChild(button);
    });
    positionContextMenu(assemblyHost, event.clientX, event.clientY);
    return;
  }
  var found = resolveTopologyPick(event, view, { prefer: E.selectionFilter }) || {};
  var part = found.part || null;
  var candidates = (found.hits || []).map(function (hit) {
    return rawTopologyPickCandidate(hit, view);
  }).filter(function (candidate) {
    return candidate && selectionFilterAllows(candidate.reference.kind, E.selectionFilter);
  });
  if (found.reference) candidates.unshift({ part: part, reference: found.reference });
  candidates = dedupeTopologyCandidates(candidates);
  if (!candidates.length) { showContextMenu(event.clientX, event.clientY, view); return; }
  var host = root.querySelector("#mdContextMenu");
  if (!host) return;
  closeChromeOverlays();
  host.innerHTML = "";
  /* Select Through is one section of this menu, not the whole of it. Growing a
     selection is the far more common reason to right-click, so it comes first
     and the ambiguity list sits under its own heading below. */
  var selectionOps = selectionMenuItems(chromeSelectionInput());
  if (selectionOps.length) {
    selectionOps.forEach(function (item) {
      var opButton = el("button", "md-context-op", cadIcon(item.id) + "<span>" + chromeCommandLabel(item.id) + "</span>");
      opButton.type = "button";
      opButton.addEventListener("click", function () { closeChromeOverlays(); runChromeCommand(item.id); });
      host.appendChild(opButton);
    });
    host.appendChild(el("div", "md-context-sep"));
  }
  host.appendChild(el("strong", "md-context-title", t("touchSelectThrough")));
  candidates.forEach(function (candidate, index) {
    var reference = candidate.reference;
    var label = (reference.semantic || reference.kind || "reference").replace(/[:_-]+/g, " ");
    var button = el("button", "", "<span>" + (index + 1) + ". " + label + "</span>");
    button.type = "button";
    button.addEventListener("click", function () {
      E.sel = candidate.part || part;
      var at = E.topologySelection.findIndex(function (item) { return item.persistentId === reference.persistentId; });
      if (E.mobileAddSelection) {
        if (at < 0) E.topologySelection.push(reference); else E.topologySelection.splice(at, 1);
      } else E.topologySelection = [reference];
      closeChromeOverlays();
      refreshAll();
    });
    host.appendChild(button);
  });
  host.appendChild(el("div", "md-context-sep"));
  contextToolbarItems(chromeSelectionInput()).slice(0, 4).forEach(function (item) {
    var button = el("button", "md-context-op", "<span>" + chromeCommandLabel(item.id) + "</span>");
    button.type = "button";
    button.addEventListener("click", function () { closeChromeOverlays(); runChromeCommand(item.id); });
    host.appendChild(button);
  });
  positionContextMenu(host, event.clientX, event.clientY);
}

function positionContextMenu(host, clientX, clientY) {
  host.hidden = false;
  var width = host.offsetWidth || 260, height = host.offsetHeight || 120;
  host.style.left = Math.max(8, Math.min(clientX, window.innerWidth - width - 8)) + "px";
  host.style.top = Math.max(8, Math.min(clientY, window.innerHeight - height - 8)) + "px";
  E.overlays.menu = true;
}

/* A reference picked inside an assembly has to remember which component it
   came off, both so the highlight lands on the right instance and so a mate
   knows which body it is holding. */
function stampComponentRef(reference, component, found) {
  if (!reference || !component) return reference || null;
  var stamped = Object.assign({}, reference, { componentId: component.id });
  if (found && found.pickPoint && found.pickNormal) {
    stamped.pickFrame = { surface: "plane", origin: found.pickPoint, normal: found.pickNormal };
  }
  return stamped;
}

function frameIsUsable(frame) {
  return !!(frame && frame.origin && (frame.normal || frame.axis));
}

/* The mate pair: the newest pick, and the most recent one before it that sits
   on a DIFFERENT component. Reading the last two literally meant a third pick
   on the same component — or any unrelated face gathered for measuring — broke
   the pair and left the mate buttons falling back to bounding-box frames. */
function assemblyPickedRefs() {
  var refs = (E.topologySelection || []).filter(function (reference) { return reference && reference.componentId; });
  if (refs.length < 2) return null;
  var b = refs[refs.length - 1], a = null;
  for (var i = refs.length - 2; i >= 0; i--) {
    if (refs[i].componentId !== b.componentId) { a = refs[i]; break; }
  }
  if (!a) return null;
  if (!mateHolderById(a.componentId) || !mateHolderById(b.componentId)) return null;
  return { a: a, b: b };
}

/* A symmetric mate takes three picks in order: the two entities that mirror
   each other, then the plane they mirror across. The plane may belong to a
   third component or to one of the two (a component's own Front plane is the
   usual choice), but the two mirrored entities must be on different components. */
function assemblySymmetricPicks() {
  var refs = (E.topologySelection || []).filter(function (reference) { return reference && reference.componentId; });
  if (refs.length < 3) return null;
  var a = refs[refs.length - 3], b = refs[refs.length - 2], c = refs[refs.length - 1];
  if (a.componentId === b.componentId) return null;
  if (!mateHolderById(a.componentId) || !mateHolderById(b.componentId) || !mateHolderById(c.componentId)) return null;
  return { a: a, b: b, c: c };
}

/* Align X/Y/Z still mate two components, not two faces. Prefer the pair the
   topology picks already named; otherwise the Ctrl-selected components. The
   solver only moves B, so a grounded second pick is swapped rather than
   refused — that refusal used to make every mate button look dead. */
function ungroundedComponentPair() {
  var picked = assemblyPickedRefs();
  var a = picked ? assemblyComponentById(picked.a.componentId) : E.componentSel[0];
  var b = picked ? assemblyComponentById(picked.b.componentId) : E.componentSel[1];
  if (!a || !b || a === b) return null;
  if (b.grounded && !a.grounded) return { a: b, b: a };
  if (b.grounded) return null;
  return { a: a, b: b };
}

/* What each kind of mate needs from the two references it is given. The solver
   used to fall back to a face normal when a mate asked for an axis, which is
   why two flat faces could be handed to Concentric and come back placed like
   nonsense rather than refused. The requirement now lives beside the solver in
   cad_mates.js and both ask it, so the button gate cannot promise something
   the solver will not honour, or refuse something it would. */
function mateRequirementLabel(requirement) {
  if(requirement==='distance')return 'Choose two planar references, or a plane and an exact vertex';
  if(requirement==='coincident')return 'Choose two planar references, or a plane and an exact axis';
  return t(requirement === "axis" ? "mateNeedsAxis" : requirement === "round" ? "mateNeedsRound" : requirement === "mirror" ? "mateNeedsMirror" : "mateNeedsPlanar");
}

/* The one gate every mate goes through, whichever way it was asked for. The
   inspector buttons are not the only door: SmartMate infers a type from two
   references and used to push it straight into the list, so an Alt-drag could
   still build the concentric-from-a-flat-face mate this check exists to refuse.
   Frames are the two the mate will actually be stored with. */
function mateFramesFit(type, frameA, frameB) {
  var requirement = mateRequirementFor(type);
  if (!mateFramesSupport(type, frameA, frameB)) {
    if(type==='rotationlimit'&&mateFrameSupports('axis',frameA)&&mateFrameSupports('axis',frameB))return {ok:false,reason:t('rotationLimitNeedsParallelAxes')};
    return { ok: false, reason: mateRequirementLabel(requirement) };
  }
  return { ok: true, reason: "" };
}

/* Whether this mate can be built from what is picked right now, and if not,
   what it wanted. */
function lockMateComponentPair() {
  var picked=assemblyPickedRefs(),pair=picked?[mateHolderById(picked.a.componentId),mateHolderById(picked.b.componentId)]:(E.componentSel || []).slice(-2);
  if(pair.length!==2 || !pair[0] || !pair[1] || pair[0].id===pair[1].id)return null;
  if(pair[1].grounded)pair.reverse();
  return pair[1].grounded?null:pair;
}
function mateTypeFits(type) {
  if(type==='lock')return {ok:!!lockMateComponentPair(),reason:t("lockMateNeedTwoComponents")};
  if (type === "symmetric") {
    var triple = assemblySymmetricPicks();
    if (!triple) return { ok: false, reason: t("mateNeedThreePicks") };
    var mirror = mateReferenceFromPick(triple.c).frame;
    if (!mateFrameSupports("planar", mirror) || mirror.surface !== "plane") return { ok: false, reason: t("mateNeedsMirrorPlane") };
    var tripleFrame = function (reference) { return mateReferenceFromPick(reference).frame; };
    var kindA = tripleFrame(triple.a).surface === "plane", kindB = tripleFrame(triple.b).surface === "plane";
    if (kindA !== kindB) return { ok: false, reason: t("mateNeedsMatchingKinds") };
    return mateFramesFit(type, tripleFrame(triple.a), tripleFrame(triple.b));
  }
  var picked = assemblyPickedRefs();
  /* Every mate type is unavailable until two faces on two components are
     picked. This used to fall back to the bounding-box frames and answer from
     those, so the palette offered mates whose geometry did not exist. */
  if (!picked) return { ok: false, reason: t("mateNeedTwoFaces") };
  var frameOf = function (reference) {
    var stored=mateReferenceFromPick(reference);
    return ['rotationlimit','rackpinion','belt'].includes(type)?worldFrame(stored.frame,mateHolderById(stored.componentId),stored.frameSpace):stored.frame;
  };
  return mateFramesFit(type, frameOf(picked.a), frameOf(picked.b));
}

/* Picked references carry the descriptor in the component's own space, which
   is exactly the frame a mate stores. */
function mateReferenceFromPick(reference) {
  var descriptor = reference.descriptor || reference.frame;
  /* Fall back to the plane the ray landed on when the named face cannot supply
     a frame — better a mate on the surface the user clicked than one the
     solver has to refuse. */
  var frame = frameIsUsable(descriptor) ? descriptor : reference.pickFrame || descriptor || {};
  return topologyReference(reference.componentId, reference.kind, reference.persistentId, frame);
}

/* Last-resort reference when nothing in the component's topology resolves:
   name the plane the ray landed on. The hit is in world coordinates and a mate
   frame is stored in the component's own space, so it has to be brought back
   through the component transform — labelling a world frame as component-space
   put every such mate off by exactly that transform. */
function componentTopologyFromHit(component, hit) {
  if (!component || !hit) return topologyReference(component.id, "face", component.id + ":face", { surface: "plane" });
  var object = hit.object, topology = object && object.userData && object.userData.cadTopology;
  if (topology) return topologyReference(component.id, topology.kind, topology.persistentId, topology.descriptor);
  var tr = normalizeTransform(component);
  var toComponent = new THREE.Matrix4()
    .compose(
      new THREE.Vector3(tr.x, tr.y, tr.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((tr.rx * Math.PI) / 180, (tr.ry * Math.PI) / 180, (tr.rz * Math.PI) / 180)),
      new THREE.Vector3(1, 1, 1)
    )
    .invert();
  var point = new THREE.Vector3(hit.point ? hit.point.x : 0, hit.point ? hit.point.y : 0, hit.point ? hit.point.z : 0).applyMatrix4(toComponent);
  var normal = (hit.face && hit.face.normal
    ? hit.face.normal.clone().transformDirection(object.matrixWorld)
    : new THREE.Vector3(0, 1, 0)).transformDirection(toComponent);
  return topologyReference(component.id, "face", component.id + ":face", {
    surface: "plane", origin: { x: point.x, y: point.y, z: point.z },
    normal: { x: normal.x, y: normal.y, z: normal.z },
  });
}

/* One screen pixel in world units. Handles are drawn and hit-tested in these,
   so an arrow is the same size whatever the zoom or the size of the part, and
   a drag moves the value exactly as far as the cursor travels. */
function instant3dScale(view) {
  view = view || E.pv;
  if (view && typeof view.worldPerPixel === "function") {
    var perPixel = view.worldPerPixel();
    if (Number.isFinite(perPixel) && perPixel > 0) return perPixel;
  }
  return ((view && view.dist) || 200) * 0.0024;
}

function screenDeltaToWorld(view, start, event) {
  if (!view || !view.cam) return { x: 0, y: 0, z: 0 };
  view.place();
  var right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  view.cam.matrixWorld.extractBasis(right, up, back);
  var scale = instant3dScale(view);
  var dx = (event.clientX - start.x) * scale, dy = -(event.clientY - start.y) * scale;
  return { x: right.x * dx + up.x * dy, y: right.y * dx + up.y * dy, z: right.z * dx + up.z * dy };
}

/* Match the pointer's travel to the screen projection of one world axis. The
   denominator matters: simply throwing away the other two coordinates makes an
   axis feel slower as it points toward the camera and almost immovable near an
   end-on view. */
function screenDeltaAlongAxis(view, start, event, axisName) {
  if (!view || !view.cam) return { x: 0, y: 0, z: 0 };
  view.place();
  var right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  view.cam.matrixWorld.extractBasis(right, up, back);
  var axis = axisName === "x" ? { x: 1, y: 0, z: 0 }
    : axisName === "y" ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  var screenX = axis.x * right.x + axis.y * right.y + axis.z * right.z;
  var screenY = -(axis.x * up.x + axis.y * up.y + axis.z * up.z);
  var projected = screenX * screenX + screenY * screenY;
  if (projected < 1e-4) return { x: 0, y: 0, z: 0 };
  var pixels = (event.clientX - start.x) * screenX + (event.clientY - start.y) * screenY;
  var amount = instant3dScale(view) * pixels / projected;
  return { x: axis.x * amount, y: axis.y * amount, z: axis.z * amount };
}

function hitInstant3d(event, view) {
  if(retainingExactPreview())return null;
  if (!view || !view.grp || !view.cam) return null;
  if (view.place) view.place();
  var rect = view.rr.domElement.getBoundingClientRect();
  var ray = pickScratch();
  var pointer = pickPointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  ray.params.Line.threshold = 12;
  ray.setFromCamera(pointer, view.cam);
  var handles = [];
  view.grp.traverse(function (obj) {
    if (obj.userData && obj.userData.instant3d && obj.isMesh) handles.push(obj);
  });
  var hits = ray.intersectObjects(handles, false);
  if (hits.length) return hits[0].object.userData.instant3d;
  var cam = view.cam;
  cam.updateMatrixWorld();
  var best = null, bestDist = 26;   // screen px of slack around a thin arrow
  var seen = new Set();
  handles.forEach(function (mesh) {
    var pose = mesh.userData.instant3d;
    if (!pose || !pose.origin || seen.has(pose)) return;
    seen.add(pose);
    var origin = new THREE.Vector3(pose.origin.x, pose.origin.y, pose.origin.z);
    var dir = new THREE.Vector3(pose.direction.x, pose.direction.y, pose.direction.z);
    if (!dir.length()) dir.set(0, 1, 0);
    dir.normalize();
    var tip = origin.clone().add(dir.multiplyScalar(pose.hitLength || (pose.length || 8) + 6));
    var a = origin.clone().project(cam), b = tip.project(cam);
    if (a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1) return;
    var ax = (a.x * 0.5 + 0.5) * rect.width, ay = (-a.y * 0.5 + 0.5) * rect.height;
    var bx = (b.x * 0.5 + 0.5) * rect.width, by = (-b.y * 0.5 + 0.5) * rect.height;
    var dist = distancePointToSegment2d(event.clientX - rect.left, event.clientY - rect.top, ax, ay, bx, by);
    if (dist < bestDist) { bestDist = dist; best = pose; }
  });
  return best;
}

/* The value that reads out beside the arrow, as a DOM chip rather than a
   sprite: a canvas sprite is at the mercy of the renderer's transparent pass
   (they came out blank often enough that the readout could not be trusted),
   and text drawn by the browser stays crisp at any zoom. It rides in the
   preview wrap, which is the element that moves between the side panel and the
   big pane, so it follows the canvas to both homes. */
function instant3dValueChip(view) {
  var canvas = view && view.rr && view.rr.domElement, wrap = canvas && canvas.parentElement;
  if (!wrap) return null;
  var chip = wrap.querySelector(".md-instant3d-value");
  if (!chip) {
    chip = el("input", "md-instant3d-value");
    chip.type="number"; chip.step="any"; chip.inputMode="decimal";
    chip.addEventListener("pointerdown",function(event){event.stopPropagation();});
    chip.addEventListener("input",function(){
      var pose=E._instant3dPose, value=chip.valueAsNumber;
      if(pose && Number.isFinite(value) && chip.validity.valid)syncFeatureFormValue(pose.key,instant3dModelValue(value,pose.key,modelLengthUnit()));
    });
    chip.addEventListener("keydown",function(event){
      event.stopPropagation();
      if(event.key==="Enter"){event.preventDefault();chip.blur();}
      if(event.key==="Escape"){event.preventDefault();chip.blur();syncInstant3dValue(view);}
    });
    wrap.appendChild(chip);
  }
  return chip;
}

function syncFilletEndpoints(view) {
  var canvas = view && view.rr && view.rr.domElement, wrap = canvas && canvas.parentElement;
  if (!wrap) return;
  var params = activeFilletParams(), edges = params && params.variableRadius ? currentFinishEdges() : [];
  var chips = Array.from(wrap.querySelectorAll(".md-fillet-endpoint")), at = 0;
  edges.forEach(function(reference, index) {
    var ends = filletReferenceEndpoints(reference);
    var entry = (params.edgeRadii || []).find(function(item){return item.id===reference.persistentId;});
    if (!ends || ends.length!==2 || !entry || !entry.startPoint || !view.cam) return;
    var distance = function(p){return Math.hypot(p.x-entry.startPoint.x,p.y-entry.startPoint.y,p.z-entry.startPoint.z);};
    var ordered = distance(ends[0])<=distance(ends[1]) ? ends : [ends[1],ends[0]];
    ordered.forEach(function(point,end) {
      var chip=chips[at++];
      if(!chip){chip=el("span","md-fillet-endpoint");wrap.appendChild(chip);}
      chip.textContent=(index+1)+" · "+t(end ? "edgeRadiusEnd" : "edgeRadiusStart");
      chip.dataset.edgeId=reference.persistentId;chip.dataset.endpoint=end ? "end" : "start";
      var p=new THREE.Vector3(point.x,point.y,point.z).project(view.cam);
      chip.hidden=p.z>1 || p.z< -1;
      chip.style.left=(canvas.offsetLeft+(p.x*.5+.5)*canvas.clientWidth)+"px";
      chip.style.top=(canvas.offsetTop+(-p.y*.5+.5)*canvas.clientHeight)+"px";
    });
  });
  chips.slice(at).forEach(function(chip){chip.remove();});
}

function syncInstant3dValue(view) {
  syncFilletEndpoints(view);
  var chip = instant3dValueChip(view), pose = E._instant3dPose, authoring = instant3dAuthoringState();
  if (!chip) return;
  if (!pose || !view.cam || !authoring) { chip.hidden = true; return; }
  var canvas = view.rr.domElement;
  view.cam.updateMatrixWorld();
  /* Scratch, not fresh: this runs from afterRender alongside syncNotesCards,
     so two allocations here are two per frame for the whole time a drag
     handle is live. */
  var s = instantScratch();
  var dir = s.dir.set(pose.direction.x, pose.direction.y, pose.direction.z);
  if (!dir.length()) dir.set(0, 1, 0);
  var anchor = s.anchor.set(pose.origin.x, pose.origin.y, pose.origin.z)
    .addScaledVector(dir.normalize(), (pose.hitLength || pose.length || 0) * 0.6)
    .project(view.cam);
  if (anchor.z > 1) { chip.hidden = true; return; }
  var units = modelLengthUnit();
  var control=instant3dFormControl(pose.key);
  /* Display rounding must not become model rounding. This chip is rewritten
     from pose.value on every repaint, so a typed 10.414 was replaced by 10.41
     a frame later and the shorter number is what got committed — an engineering
     drawing's 4.100in quietly became 4.098in. Two decimals of a centimetre is
     a tenth of a millimetre, which is coarser than the drawings this editor is
     meant to reproduce. Keep full document precision, and leave the field alone while it
     already shows the same number so an exact entry is never churned. */
  if (document.activeElement !== chip) {
    var displayValue = instant3dDisplayValue(pose.value || 0,pose.key,units), shownValue = Number(chip.value);
    if (!Number.isFinite(shownValue) || Math.abs(shownValue - displayValue) > 1e-9)
      chip.value = String(Number(displayValue.toPrecision(12)));
  }
  chip.min=control && control.min || ""; chip.max=control && control.max || "";
  chip.setAttribute("aria-label",instant3dValueLabel(featureTypeLabel(authoring.type),control?.dataset?.parameterLabel || pose.key,pose.key,units));
  chip.title=chip.getAttribute("aria-label");
  chip.style.left = (canvas.offsetLeft + (anchor.x * 0.5 + 0.5) * canvas.clientWidth) + "px";
  chip.style.top = (canvas.offsetTop + (-anchor.y * 0.5 + 0.5) * canvas.clientHeight) + "px";
  chip.hidden = false;
}

function addInstant3dHandles(grp) {
  var authoring = instant3dAuthoringState();
  E._instant3dPose = null;
  if (!authoring || !grp) return;
  var type = authoring.type, params = authoring.params || {};
  var pose = null;
  if (type === "extrude" || type === "extrudeCut" || type === "hole") {
    /* Only ever hang the arrow on something real: the live preview body, or —
       when an existing feature is being edited — the solid it built. Falling
       back to whatever solid happened to be selected put the handle on an
       unrelated body. */
    var part = (E.authoring.previewParts || [])[0] || (E.authoring.featureEdit ? selectedSolid() : null);
    if (part) pose = extrudeHandlePose(partBounds(part), part.axis === "frame" ? "y" : (part.axis || "y"), params);
  } else if (type === "fillet" || type === "chamfer" || type === "shell" || type === "draft") {
    /* A finish handle belongs on the edge or face it rounds. With nothing
       picked there is no such anchor, and the old fallback dropped an arrow at
       the world origin — an arrow in the middle of the view that could not do
       anything, because the feature had nothing to work on either. Show it
       only once there is a reference to hang it on. */
    var wantKind = type === "shell" || type === "draft" ? "face" : "edge";
    var references = (E.topologySelection || []).filter(function (item) {
      return item && item.descriptor && item.descriptor.origin;
    });
    var reference = references.find(function (item) { return item.kind === wantKind; }) || references[0];
    if (reference && selectedSolid()) {
      pose = filletHandlePose(reference.descriptor.origin, params.radius || params.distance || params.thickness || params.angle, filletGrowDirection(reference.descriptor));
      pose.type = type;
      pose.key = type === "chamfer" ? "distance" : type === "shell" ? "thickness" : type === "draft" ? "angle" : "radius";
      pose.value=Number(params[pose.key]) || 0;
    }
  } else if (type === "pattern") {
    var seed = selectedSolid();
    if (seed) pose = patternHandlePose(partBounds(seed), params);
  } else if (type === "revolve") {
    var rev = (E.authoring.previewParts || [])[0];
    if (rev) pose = { type: "revolve", key: "angle", origin: partBounds(rev) && { x: 0, y: partBounds(rev).y1, z: 0 } || { x: 0, y: 10, z: 0 }, direction: { x: 0, y: 1, z: 0 }, length: 12, value: params.angle };
  }
  if (!pose) return;
  var dir = new THREE.Vector3(pose.direction.x, pose.direction.y, pose.direction.z);
  if (!dir.length()) dir.set(0, 1, 0);
  dir.normalize();
  /* Sized in pixels, not in model units. The old arrow took its length from the
     parameter and its thickness from the camera distance, so a deep extrude or
     a small part turned it into a hairline nobody could hit — miss it and the
     view orbited instead, which is what "the arrow does nothing" looked like. */
  var perPixel = instant3dScale(E.pv);
  var shaftRadius = 2.4 * perPixel;
  var headRadius = 7 * perPixel;
  var headLength = 18 * perPixel;
  var pickRadius = 15 * perPixel;
  pose.length = 82 * perPixel;
  pose.hitLength = pose.length + headLength;
  var material = new THREE.MeshBasicMaterial({ color: 0x3d8bfd, depthTest: false, transparent: true, opacity: 0.94 });
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, pose.length, 12), material);
  var head = new THREE.Mesh(new THREE.ConeGeometry(headRadius, headLength, 16), material.clone());
  var pick = new THREE.Mesh(
    new THREE.CylinderGeometry(pickRadius, pickRadius, pose.hitLength, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  var group = new THREE.Group();
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  head.quaternion.copy(shaft.quaternion);
  pick.quaternion.copy(shaft.quaternion);
  shaft.position.copy(dir.clone().multiplyScalar(pose.length / 2));
  head.position.copy(dir.clone().multiplyScalar(pose.length + headLength / 2));
  pick.position.copy(dir.clone().multiplyScalar(pose.hitLength / 2));
  group.add(shaft); group.add(head); group.add(pick);
  E._instant3dPose = pose;
  group.position.set(pose.origin.x, pose.origin.y, pose.origin.z);
  group.userData.instant3d = pose;
  shaft.userData.instant3d = pose;
  head.userData.instant3d = pose;
  pick.userData.instant3d = pose;
  shaft.renderOrder = 32;
  head.renderOrder = 33;
  grp.add(group);
}

function instant3dAuthoringState() {
  if (fullRoundActive() || activeFilletParams()?.multipleRadius) return null;
  if (!E.authoring || !E.authoring.featureType) return null;
  var edit = E.authoring.featureEdit;
  if (edit) {
    var feature = (E.def.features || []).find(function (item) { return item.id === edit.featureId; });
    if (feature && feature.params) return { type: E.authoring.featureType, params: feature.params, preview: false, feature: feature };
  }
  if (E.authoring.featurePreviewState && E.authoring.featurePreviewState.params)
    return { type: E.authoring.featureType, params: E.authoring.featurePreviewState.params, preview: true };
  return null;
}

function instant3dFormControl(key) {
  return root && root.querySelector('#mdQuickSettings input[data-parameter="' + key + '"],#mdQuickSettings select[data-parameter="' + key + '"]');
}

function syncFeatureFormValue(key, value) {
  var input = instant3dFormControl(key);
  if (input) {
    var next = String(Number(instant3dDisplayValue(value,key,modelLengthUnit()).toPrecision(12)));
    if (input.type === "checkbox") input.checked = !!value;
    else input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  var authoring = instant3dAuthoringState();
  if (!authoring) return;
  authoring.params[key] = value;
  if (authoring.preview) queueNewFeaturePreview(E.authoring.featureType, E.authoring.featurePreviewState, E.authoring.featurePreviewBadge);
  else if (authoring.feature) { syncLiveFeatureEdit(authoring.feature); }
}

function beginInstant3dDrag(event, view) {
  if (E.docType === "assembly" && (event.altKey || E.smartMateMode)) return beginSmartMateDrag(event, view);
  /* Ctrl/Cmd-drag is a window select. Plain primary-drag is this editor's
     orbit — the documented CAD navigation — so taking it for a marquee the way
     SolidWorks does would cost the gesture people use most. Ctrl/Cmd has no
     drag meaning today (the click handler requires a stationary pointer) and
     already means "add to the selection" on click, which is exactly what the
     window does. On macOS a Ctrl-drag cannot open the context menu either:
     that handler ignores a pointer that moved. */
  if ((event.ctrlKey || event.metaKey) && beginBoxSelectDrag(event, view)) return true;
  if (E.docType === "assembly" && beginAssemblyComponentDrag(event, view)) return true;
  if (E.tool === "paint") return beginPaintDrag(event, view);
  if (E.tool === "note" && (E.noteMode === "markup" || E.noteMode === "eraser")) return beginMarkupDrag(event, view);
  var pose = hitInstant3d(event, view);
  var authoring = instant3dAuthoringState();
  if (!pose || !authoring) return false;
  event.preventDefault();
  if (view && view.rr && view.rr.domElement) view.rr.domElement.style.cursor = "grabbing";
  var start = { x: event.clientX, y: event.clientY, params: Object.assign({}, authoring.params), pose: pose };
  function typeValue(ev) {
    var chip=instant3dValueChip(view);
    if(!chip || document.activeElement===chip || ev.ctrlKey || ev.metaKey || ev.altKey || !/^[0-9.\-]$/.test(ev.key))return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    chip.focus({preventScroll:true}); chip.value=ev.key;
    chip.dispatchEvent(new Event("input",{bubbles:true}));
  }
  function move(ev) {
    if(document.activeElement===instant3dValueChip(view))return;
    var world = screenDeltaToWorld(view, start, ev);
    var next = applyHandleDrag(authoring.type, start.params, world, start.pose.direction);
    syncFeatureFormValue(start.pose.key, next[start.pose.key]);
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("keydown", typeValue, true);
    if (view && view.rr && view.rr.domElement) view.rr.domElement.style.cursor = "";
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("keydown", typeValue, true);
  return true;
}

export {
  addInstant3dHandles, assemblyPickedRefs, assemblySymmetricPicks,
  beginInstant3dDrag, closeNoteEditor, componentTopologyFromHit,
  hidePickCycle, hitInstant3d, instant3dAuthoringState, lockMateComponentPair,
  mateFramesFit, mateReferenceFromPick, mateTypeFits, openNoteEditor,
  pickAssemblyComponent, renderTreeAnnotations, screenDeltaAlongAxis,
  screenDeltaToWorld, showSelectThrough, stampComponentRef,
  syncFilletEndpoints, syncInstant3dValue, ungroundedComponentPair,
};

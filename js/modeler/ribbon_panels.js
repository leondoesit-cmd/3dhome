/* The CAD editor's ribbon command panes, tools, paint/notes toolbars, note
   editor, pane tabs, guidance prefs, properties and panel resizing, lifted out
   of buildDOM, split out of js/modeler/build_dom.js. It shares the editor's
   state through live imports from ./build_dom.js. */
import { shortcutConflict } from "../core/command_shortcuts.js";
import { documentDescription, setDocumentDescription } from "../core/custom_properties.js";
import { temporaryAxes } from "../core/temporary_axes.js";
import { fromDisp, toDisp } from "../display_units.js";
import { CURATED_SWATCHES, clearFacePaint, clearMarkupsFromDef, deleteNoteFromDef, updateNoteInDef } from "../modeler_notes_paint.js";
import { t } from "../modeler_strings.js";
import { E, H, decoGroups, histPanel, refreshAll, requestDocumentType, root, setHistPanel } from "../modeler.js";
import { doRedo, doUndo, docPick, docScope, pushUndo, requestCloseModeler, syncUndoButtons } from "../modeler/document_history.js";
import { exportDrawingSvg, printDrawingSheet } from "../modeler/document_io.js";
import { newModel } from "../modeler/editor_forms.js";
import { cancelExactModelRebuild, setMode } from "../modeler/library_io.js";
import { saveModelerPrefs, syncDensity } from "../modeler/prefs_snap.js";
import { wireEditorSwitch, wireShell } from "../pro_shell.js";
import { buildTouchPrecisionSettings } from "../touch_precision_ui.js";
import { createHistoryPanel } from "../ui_history.js";
import * as ribbon from "../uikit_host/ribbon.js";
import { getDomainUnit } from "../unit_settings.js";
import { cancelActiveCommand, closeCommandSearch, commandCatalog, finishActiveCommand, openCommandSearch, renderCommandResults, setAssemblyMoveMode, setSelectionFilter, showViewSelector } from "./command_manager.js";
import { focusTreeDiagnostics, refreshParts } from "./component_mates.js";
import { wireSketch } from "./dimension_entry.js";
import { closeEvalCard } from "./document_outputs.js";
import { saveCurrentDocument, syncTools, syncViewButtons } from "./document_save.js";
import { documentPresetAction } from "./drawing_sheet.js";
import { drawSketch, drawingDocument, drawingSheet } from "./drawing_sheet_render.js";
import { closeReport, flash } from "./drawing_sheet_touch.js";
import { bindDocumentTextField, btn, el, toolKeyRows } from "./editor_dom.js";
import { updatePreview } from "./library_panel.js";
import { topologyEntriesForPart } from "./library_store.js";
import { syncNotesAndMarkups, syncNotesToolbar, syncPaintToolbar, syncViewsToolbarNotes } from "./notes_markups.js";
import { runCommand } from "./part_commands.js";
import { applyConstraint, cancelDimensionEditor } from "./sketch_dimension_editor.js";
import { bindPolygonSideControl, sizeSketch, syncHint, syncStatus, watchSketchSize } from "./sketch_entities.js";
import { closeTour, installTourDragging, prepareTourStep, seekAutomaticTour, startTour, tourSteps } from "./sketch_guide.js";
import { activateWorkflowStep, beginSketchWorkflow, cancelFacePick, cancelReferenceSelection, chooseSketchReference, finishSketchWorkflow, isCanonicalAuthoring, orientModelToView, setCommandTab, setModelLengthUnit, setSketchNormalTo, setTab, setTool, setView, showReferencePicker, syncNormalToControls, zoomBy } from "./sketch_workflow.js";
import { applyDimensionEditor, deleteDimensionEditor, editSketchFromHistory } from "./tree_assembly.js";
import { initPreview, layout3DHost, setModelDisplay, setPanelCollapsed, setSectionState, setShowModelEdges } from "./view_modes.js";
import { closeNoteEditor } from "./viewport_input.js";
import { closeWelcome, goTourStep, syncCoach } from "./welcome_coach.js";

// lifted out of buildDOM()
function wireRibbonToolsAndPanes() {
  document.body.appendChild(root);
  /* The ribbon's four command panes become uikit slots, so a saved layout can
     rearrange the groups in them. A no-op unless uikit is running. */
  ribbon.attach(root);

  // tools: mutually exclusive, one drawing mode at a time
  root.querySelectorAll("[data-tool]").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.getAttribute("data-tool")); });
  });
  root.querySelectorAll("[data-drawing-tool]").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.getAttribute("data-drawing-tool")); });
  });
  root.querySelectorAll("#mdDrawingTools button").forEach(function (b) {
    var label = b.querySelector("span"), shortcut = b.querySelector("kbd");
    if (!label) return;
    b.setAttribute("aria-label", label.textContent);
    b.title = label.textContent + (shortcut ? " · " + shortcut.textContent : "");
  });
  root.querySelectorAll("[data-cmdtab]").forEach(function (b) {
    b.addEventListener("click", function () { setCommandTab(b.getAttribute("data-cmdtab")); });
  });
  root.querySelectorAll("[data-relation]").forEach(function (b) {
    // greyed relations stay clickable so applyConstraint can say why (see markUnavailable)
    b.addEventListener("click", function () { applyConstraint(b.getAttribute("data-relation")); refreshAll(); });
  });
  root.querySelectorAll("[data-command]").forEach(function (b) {
    b.addEventListener("click", function () { runCommand(b.getAttribute("data-command")); });
  });
  root.querySelectorAll("[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
  });
  root.querySelector("#mdNormalToView").addEventListener("click", function () {
    orientModelToView(true);
    drawSketch();
  });
  wireViewFlyout();
  root.querySelector("#mdPerspectiveView").addEventListener("click", function () {
    if(!E.pv)return;
    var mode=E.pv.getProjection()==='perspective'?'orthographic':'perspective';
    E.pv.setProjection(mode);
    try{localStorage.setItem('modelforge:orbitProjection',mode);}catch(error){}
    syncViewButtons();
  });
  root.querySelector('#mdNamedViews').addEventListener('click',showViewSelector);
  root.querySelector("#mdSketchPlaneChip").addEventListener("click", function () {
    showReferencePicker(E.tool);
  });
  root.querySelectorAll("[data-zoom]").forEach(function (b) {
    b.addEventListener("click", function () { zoomBy(b.getAttribute("data-zoom")); });
  });
  root.querySelectorAll("[data-display]").forEach(function (b) {
    b.addEventListener("click", function () { setModelDisplay(b.getAttribute("data-display")); });
  });
  root.querySelector("#mdShowEdges").addEventListener("click", function () { setShowModelEdges(!(E.showModelEdges !== false)); });
  root.querySelector("#mdTemporaryAxes").addEventListener("click",function(){
    E.showTemporaryAxes=!E.showTemporaryAxes;
    this.setAttribute("aria-pressed",String(E.showTemporaryAxes));this.classList.toggle("on",E.showTemporaryAxes);
    updatePreview();
    var axisCount=decoGroups.reduce(function(total,entry){return total+temporaryAxes(entry.part.meshData?.topology || topologyEntriesForPart(entry.part)).length;},0);
    flash(E.showTemporaryAxes ? "Temporary axes shown: "+axisCount : "Temporary axes hidden");
  });
  var toggleNotesView = root.querySelector("#mdToggleNotesView");
  if (toggleNotesView) {
    toggleNotesView.addEventListener("click", function () {
      E.notesVisible = !(E.notesVisible !== false);
      syncNotesToolbar();
      syncViewsToolbarNotes();
      if (E.pv) syncNotesAndMarkups(E.pv);
    });
  }

  // Paint toolbar swatches and controls
  var swatchesHost = root.querySelector("#mdPaintSwatches");
  if (swatchesHost) {
    swatchesHost.innerHTML = "";
    CURATED_SWATCHES.forEach(function (sw) {
      var sBtn = el("button", "md-paint-swatch" + (sw.color === E.paintColor ? " on" : ""));
      sBtn.type = "button";
      sBtn.style.background = sw.color;
      sBtn.title = sw.name;
      sBtn.setAttribute("data-swatch-color", sw.color);
      sBtn.addEventListener("click", function () {
        E.paintColor = sw.color;
        E.paintMetal = sw.metal;
        E.paintRough = sw.rough;
        E.paintEyedropper = false;
        syncPaintToolbar();
      });
      swatchesHost.appendChild(sBtn);
    });
  }
  root.querySelectorAll("[data-paint-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      E.paintMode = b.getAttribute("data-paint-mode");
      syncPaintToolbar();
    });
  });
  var paintColorInput = root.querySelector("#mdPaintColorInput");
  if (paintColorInput) {
    paintColorInput.addEventListener("input", function () {
      E.paintColor = this.value;
      syncPaintToolbar();
    });
  }
  var eyedropperBtn = root.querySelector("#mdPaintEyedropper");
  if (eyedropperBtn) {
    eyedropperBtn.addEventListener("click", function () {
      E.paintEyedropper = !E.paintEyedropper;
      syncPaintToolbar();
      flash(E.paintEyedropper ? (t("paintEyedropper") + " — " + t("paintHint")) : t("paintFace"));
    });
  }
  var clearPaintBtn = root.querySelector("#mdPaintClear");
  if (clearPaintBtn) {
    clearPaintBtn.addEventListener("click", function () {
      var face = (E.topologySelection || []).find(function (item) { return item.kind === "face"; });
      if (face) {
        pushUndo(t("clearPaint"));
        clearFacePaint(E.def, face);
        updatePreview();
        refreshParts();
      } else {
        flash(t("selectFaceForColor"));
      }
    });
  }

  // Notes toolbar controls
  root.querySelectorAll("[data-note-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      E.noteMode = b.getAttribute("data-note-mode");
      syncNotesToolbar();
      syncHint();
    });
  });
  root.querySelectorAll("[data-markup-color]").forEach(function (b) {
    b.addEventListener("click", function () {
      E.markupColor = b.getAttribute("data-markup-color");
      syncNotesToolbar();
    });
  });
  var toggleNotesVisBtn = root.querySelector("#mdToggleNotesVisibility");
  if (toggleNotesVisBtn) {
    toggleNotesVisBtn.addEventListener("click", function () {
      E.notesVisible = !(E.notesVisible !== false);
      syncNotesToolbar();
      syncViewsToolbarNotes();
      if (E.pv) syncNotesAndMarkups(E.pv);
    });
  }
  var clearMarkupsBtn = root.querySelector("#mdClearMarkupsBtn");
  if (clearMarkupsBtn) {
    clearMarkupsBtn.addEventListener("click", function () {
      if (E.def && E.def.markups && E.def.markups.length) {
        pushUndo(t("clearMarkups"));
        clearMarkupsFromDef(E.def);
        if (E.pv) syncNotesAndMarkups(E.pv);
        refreshParts();
      }
    });
  }

  // Note editor dialog
  var noteEditorClose = root.querySelector("#mdNoteEditorClose");
  if (noteEditorClose) noteEditorClose.addEventListener("click", closeNoteEditor);
  var noteEditorDone = root.querySelector("#mdNoteEditorDone");
  if (noteEditorDone) {
    noteEditorDone.addEventListener("click", function () {
      if (E.activeNoteId && E.def) {
        var textarea = root.querySelector("#mdNoteEditorText");
        var text = textarea ? textarea.value.trim() : "";
        pushUndo(t("editNote"));
        updateNoteInDef(E.def, E.activeNoteId, { text: text || "Note" });
        if (E.pv) syncNotesAndMarkups(E.pv);
        refreshParts();
      }
      closeNoteEditor();
    });
  }
  var noteEditorDelete = root.querySelector("#mdNoteEditorDelete");
  if (noteEditorDelete) {
    noteEditorDelete.addEventListener("click", function () {
      if (E.activeNoteId && E.def) {
        pushUndo(t("deleteNote"));
        deleteNoteFromDef(E.def, E.activeNoteId);
        if (E.pv) syncNotesAndMarkups(E.pv);
        refreshParts();
      }
      closeNoteEditor();
    });
  }
  root.querySelector("#mdSketchOnFace").addEventListener("click", function () { beginSketchWorkflow(null, { forceNew: true }); });
  root.querySelector("#mdHintHelp").addEventListener("click", function () { E.hintDismissed = false; syncHint(); });
  bindPolygonSideControl(root.querySelector("#mdPolygonSides"));
  root.querySelector("#mdToggleLeft").addEventListener("click", function () { setPanelCollapsed("left", !E.leftCollapsed); });
  root.querySelector("#mdToggleRight").addEventListener("click", function () {
    /* Same button, the panel that is actually on screen: in Drawing mode the
       inspector is not there to collapse — the sheet's properties are. */
    if (E.mode === "drawing") {
      root.classList.toggle("md-sheet-collapsed");
      sizeSketch();
      drawSketch();
      return;
    }
    setPanelCollapsed("right", !E.rightCollapsed);
    E.rightCollapsedPreference = E.rightCollapsed; saveModelerPrefs();
  });
  root.querySelectorAll("[data-section-axis]").forEach(function (button) {
    button.addEventListener("click", function () { setSectionState({ enabled:true, axis:button.getAttribute("data-section-axis") }); });
  });
  root.querySelector("#mdSectionOffset").addEventListener("input", function () { setSectionState({ enabled:true, offset:Number(this.value) || 0 }); });
  root.querySelector("#mdSectionFlip").addEventListener("click", function () { setSectionState({ enabled:true, flip:!E.section.flip }); });
  root.querySelector("#mdSectionClose").addEventListener("click", function () { setSectionState({ enabled:false }); });
  root.querySelector("#mdEvalClose").addEventListener("click", function () { closeEvalCard(); });
  root.querySelector("#mdFinishPlane").addEventListener("click", finishSketchWorkflow);
  // tabs swap the pane inside their own panel; the two panels are independent
  root.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
  });
  root.querySelector('[data-act="new"]').addEventListener("click", newModel);
  root.querySelectorAll("[data-workflow-step]").forEach(function(button){
    button.addEventListener("click",function(){
      activateWorkflowStep(button.getAttribute("data-workflow-step"));
    });
  });
  root.querySelector("[data-reference-cancel]").addEventListener("click",cancelReferenceSelection);
  root.querySelector("#mdFacePromptPlanes").addEventListener("click",function(){cancelFacePick(true);});
  root.querySelector("#mdFacePromptCancel").addEventListener("click",function(){cancelFacePick(false);});
  root.querySelector("[data-report-close]").addEventListener("click",closeReport);
  root.querySelector("#mdReport").addEventListener("click",function(event){ if(event.target===this) closeReport(); });
  root.querySelectorAll("#mdDocModes [data-doc]").forEach(function (b) {
    b.addEventListener("click", function () { requestDocumentType(b.getAttribute("data-doc")); });
  });

  // sketch settings live in their own pane now, so they never crowd the tools
  var cons = root.querySelector("#mdCons");
  var dUnit = getDomainUnit("details");
  cons.innerHTML =
    '<label class="md-row"><span class="t">' + t("partUnits") + '</span><select id="mdDocumentLengthUnit" aria-label="' + t("partUnits") + '"><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="ft">ft</option></select></label>' +
    '<button type="button" id="mdDocumentProperties" class="md-settings-btn">Document properties</button>' +
    '<button type="button" id="mdSaveDocumentTemplate" class="md-settings-btn">Save document template</button>' +
    '<button type="button" id="mdNewDocumentTemplate" class="md-settings-btn">New from document template</button>' +
    '<label class="md-row"><span class="t">' + t("gridSize") + '</span><input id="mdGrid" type="number" value="' + toDisp(5, "details") + '" min="1"><span class="u">' + dUnit + '</span></label>' +
    '<label class="md-check"><input type="checkbox" id="mdOsnap" checked><span>' + t("osnap") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdNormalTo"><span>' + t("prefNormalTo") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdAutoDim"><span>' + t("prefAutoDim") + "</span></label>" +
    '<div class="md-sep"></div>' +
    '<h5 class="md-h5">' + t("guidanceTitle") + "</h5>" +
    '<label class="md-check"><input type="checkbox" id="mdPrefWelcome"><span>' + t("prefWelcome") + "</span></label>" +
    '<label class="md-check"><input type="checkbox" id="mdPrefCoach"><span>' + t("prefCoach") + "</span></label>" +
    '<button type="button" id="mdGuideReplay" class="md-settings-btn"><i class="ph ph-graduation-cap"></i>' + t("guideRelaunch") + "</button>" +
    '<div class="md-sep"></div>' +
    '<label class="md-row"><span class="t">' + t("depth") + '</span><input id="mdDepth" type="number" value="' + toDisp(60, "details") + '" min="1"><span class="u">' + dUnit + '</span></label>' +
    '<label class="md-row"><span class="t">' + t("base") + '</span><input id="mdBase" type="number" value="' + toDisp(0, "details") + '"><span class="u">' + dUnit + '</span></label>' +
    '<label class="md-row"><span class="t">' + t("wallWidth") + '</span><input id="mdWallWidth" type="number" value="' + toDisp(10, "details") + '" min="0.5"><span class="u">' + dUnit + '</span></label>' +
    '<div class="md-note">' + t("ortho") + "</div>" +
    '<h5 class="md-h5">' + t("keysTitle") + "</h5>" +
    '<div class="md-keys">' +
    /* The tool rows are read out of KEY_TOOL, not restated: a hand-written copy
       drifted until it advertised Sphere on S (S opens the shortcut bar) and
       left out slot, ellipse and polygon entirely. Only the keys the handler
       spends on something other than a tool are spelled out below. */
    toolKeyRows().concat([
      [t("opRevolve"), "R"], [t("shortcutBar"), "S"],
      [t("mode3d") + " / " + t("mode2d") + " / " + t("modeDrawing"), "3 / 2 / 7"],
      [t("view_top") + " / " + t("view_front") + " / " + t("view_right"), "4 / 5 / 6"],
      [t("zoomFit"), "F"], [t("ortho"), "Shift"], [t("normalTo"), "Ctrl+8"],
      [t("cmdSearch"), "Ctrl+K · /"], [t("regenerate"), "Ctrl+B"], [t("save"), "Ctrl+S"],
      [t("undo") + " / " + t("redo"), "Ctrl+Z / Y · Shift+Z"], [t("del"), "Del"], [t("cancelCommand"), "Esc"],
    ]).map(function (k) { return '<div class="md-key"><span>' + k[0] + "</span><kbd>" + k[1] + "</kbd></div>"; }).join("") +
    "</div>";
  var shortcuts=el("details","md-feature-group"),shortcutBody=el("div","md-feature-group-body");
  shortcuts.appendChild(el("summary","","Custom command shortcuts"));
  var commandSelect=el("select"),keyInput=el("input"),message=el("div","md-note");
  commandSelect.setAttribute("aria-label","Shortcut command");keyInput.setAttribute("aria-label","Shortcut key");keyInput.placeholder="Unused letter, e.g. U";keyInput.maxLength=1;
  commandCatalog().forEach(function(command){var option=el("option","",command.label);option.value=command.id;commandSelect.appendChild(option);});
  var syncShortcut=function(){keyInput.value=(E.commandShortcuts || {})[commandSelect.value] || "";message.textContent="Single-letter shortcuts apply in model and sketch views. Built-in keys are reserved.";};
  commandSelect.addEventListener("change",syncShortcut);
  shortcutBody.append(commandSelect,keyInput,message);
  shortcutBody.appendChild(btn("Assign shortcut",function(){
    var key=keyInput.value.trim().toLowerCase(),id=commandSelect.value,error=shortcutConflict(key,id,E.commandShortcuts);
    if(error){message.textContent=error;return;}
    E.commandShortcuts=E.commandShortcuts || {};
    if(key)E.commandShortcuts[id]=key;else delete E.commandShortcuts[id];
    saveModelerPrefs();message.textContent=key ? "Shortcut saved: "+key.toUpperCase() : "Custom shortcut removed";
  }));
  shortcutBody.appendChild(btn("Remove shortcut",function(){keyInput.value="";if(E.commandShortcuts)delete E.commandShortcuts[commandSelect.value];saveModelerPrefs();message.textContent="Custom shortcut removed";}));
  shortcuts.appendChild(shortcutBody);cons.appendChild(shortcuts);syncShortcut();
  cons.prepend(root.querySelector(".md-head-inputs"));
  var statusRow=el("div", "md-status-row");
  var workflow=root.querySelector("#mdWorkflow");
  workflow.before(statusRow); statusRow.append(workflow,root.querySelector("#mdCoach"));
  var densityRow=el("label","md-row"), density=el("select");
  density.id="mdDensity";
  densityRow.appendChild(el("span","t",t("density")));
  ["guided","standard","expert"].forEach(function(value){var option=el("option","",t("density_"+value));option.value=value;density.appendChild(option);});
  densityRow.appendChild(density); cons.querySelector("#mdPrefWelcome").closest("label").before(densityRow);
  density.addEventListener("change",function(){
    E.expertDensity=this.value==="expert";
    E.workflowVisible=this.value==="guided"; E.coachEnabled=E.workflowVisible;
    E.welcomeOnOpen=E.workflowVisible; E.coachDismissed=false;
    saveModelerPrefs(); syncDensity(); syncCoach(); sizeSketch(); requestAnimationFrame(layout3DHost);
  });
  syncDensity();
  cons.querySelector("#mdOsnap").checked = !!E.osnap;
  cons.querySelector("#mdOsnap").addEventListener("change", function () { E.osnap = this.checked; saveModelerPrefs(); });
  var normalToBox = cons.querySelector("#mdNormalTo");
  normalToBox.checked = !!E.sketchNormalTo;
  normalToBox.addEventListener("change", function () { setSketchNormalTo(this.checked); });
  syncNormalToControls();
  var autoDimBox = cons.querySelector("#mdAutoDim");
  autoDimBox.checked = !!E.autoDimTyped;
  autoDimBox.addEventListener("change", function () { E.autoDimTyped = this.checked; saveModelerPrefs(); });
  return { cons, autoDimBox };
}

// lifted out of buildDOM()
function wireGuidancePropsAndPanels(autoDimBox, cons) {
  /* Precise editing on a touch screen — the same lens / rough / portal chooser
     the planner offers, built by touch_precision_ui and reading the one shared
     preference, so switching here switches there too. It sits beside Object
     snap because they answer the same question: how the app helps a fingertip
     land on the entity it was aimed at rather than the one next to it. The
     editor already obeyed these prefs; it just never offered the switch. */
  var touchPrecisionGap = el("div", "md-sep");
  autoDimBox.closest("label").after(touchPrecisionGap);
  touchPrecisionGap.after(buildTouchPrecisionSettings());
  /* Guidance prefs — the "don't show again" on the welcome screen and the
     coach bar's eye-slash both land here, so nothing the user hides is gone
     for good. */
  var welcomeBox = cons.querySelector("#mdPrefWelcome");
  welcomeBox.checked = !!E.welcomeOnOpen;
  welcomeBox.addEventListener("change", function () { E.welcomeOnOpen = this.checked; saveModelerPrefs(); });
  var coachBox = cons.querySelector("#mdPrefCoach");
  coachBox.checked = !!E.coachEnabled;
  coachBox.addEventListener("change", function () { E.coachEnabled = this.checked; E.coachDismissed = false; saveModelerPrefs(); syncCoach(); });
  cons.querySelector("#mdGuideReplay").addEventListener("click", function () { setTab("parts"); startTour(); });
  cons.querySelector("#mdDocumentLengthUnit").addEventListener("change", function () {
    setModelLengthUnit(this.value);
  });
  cons.querySelector('#mdDocumentProperties').addEventListener('click',function(){void documentPresetAction('properties');});
  cons.querySelector('#mdSaveDocumentTemplate').addEventListener('click',function(){void documentPresetAction('capture');});
  cons.querySelector('#mdNewDocumentTemplate').addEventListener('click',function(){void documentPresetAction('new');});
  cons.querySelector("#mdGrid").addEventListener("change", function () { E.grid = Math.max(0.1, fromDisp(+this.value || 5, "details")); drawSketch(); syncStatus(); });
  cons.querySelector("#mdDepth").addEventListener("change", function () { E.depth = Math.max(0.1, fromDisp(+this.value || 60, "details")); });
  cons.querySelector("#mdBase").addEventListener("change", function () { E.baseOff = fromDisp(+this.value || 0, "details"); });
  cons.querySelector("#mdWallWidth").addEventListener("change", function () { E.wallWidth = Math.max(0.05, fromDisp(+this.value || 10, "details")); });

  root.querySelector("#mdSave").addEventListener("click", saveCurrentDocument);
  root.querySelector("#mdSheetAutoDim").addEventListener("click", function () { drawingSheet().autoDimension(); drawSketch(); syncStatus(); });
  root.querySelector("#mdSheetModelItems").addEventListener("click", function () { drawingSheet().insertModelItems(); drawSketch(); syncStatus(); });
  root.querySelector("#mdSheetHidden").addEventListener("click", function () {
    drawingSheet().setSheetOption("showHidden", !drawingDocument().showHidden);
    drawSketch(); syncTools();
  });
  root.querySelector("#mdSheetFit").addEventListener("click", function () { drawingSheet().fit(); drawSketch(); syncStatus(); });
  root.querySelector("#mdSheetPrint").addEventListener("click", printDrawingSheet);
  root.querySelector("#mdSheetExport").addEventListener("click", exportDrawingSvg);
  root.querySelector("#mdGuide").addEventListener("click", startTour);
  root.querySelector("#mdClose").addEventListener("click", requestCloseModeler);
  wireEditorSwitch(root);
  wireShell(root, "model");
  root.querySelector("#mdUndo").addEventListener("click", doUndo);
  root.querySelector("#mdRedo").addEventListener("click", doRedo);
  root.querySelector("#mdCommandSearchBtn").addEventListener("click", function () { openCommandSearch(); });
  root.querySelector("#mdCommandSearchInput").addEventListener("input", renderCommandResults);
  root.querySelector("#mdCommandSearchClose").addEventListener("click", closeCommandSearch);
  root.querySelector("#mdCommandSearch").addEventListener("pointerdown", function (e) {
    if (e.target === this) closeCommandSearch();
  });
  root.querySelector("#mdAcceptCommand").addEventListener("click", finishActiveCommand);
  root.querySelector("#mdCancelCommand").addEventListener("click", cancelActiveCommand);
  root.querySelectorAll("[data-selfilter]").forEach(function (button) {
    button.addEventListener("click", function () { setSelectionFilter(button.getAttribute("data-selfilter")); });
  });
  root.querySelectorAll("[data-assembly-move]").forEach(function (button) {
    button.addEventListener("click", function () { setAssemblyMoveMode(button.getAttribute("data-assembly-move")); });
  });
  setAssemblyMoveMode(E.assemblyMoveMode);
  root.querySelector("#mdTourClose").addEventListener("click", closeTour);
  root.querySelector("#mdTourMin").addEventListener("click", function () {
    var card = root.querySelector(".md-tour-card");
    var min = card.classList.toggle("md-tour-min");
    E.tour.userCollapsed = min;
    this.querySelector("i").className = min ? "ph ph-caret-up" : "ph ph-caret-down";
    this.setAttribute("aria-label", t(min ? "guideExpand" : "guideCollapse"));
    this.title = this.getAttribute("aria-label");
  });
  installTourDragging();
  root.querySelector("#mdTourBack").addEventListener("click", function () { goTourStep(-1); });
  root.querySelector("#mdTourRestart").addEventListener("click", function () {
    if (!E.tour.active || !E.tour.track) return;
    E.tour.completed[E.tour.step] = false;
    prepareTourStep();
  });
  root.querySelector("#mdTourSkip").addEventListener("click", function () { goTourStep(1, true); });
  // `change`, not `input`: every seek replays the demo, and re-running it for
  // each pixel of a slider drag locked the editor up for seconds at a time.
  root.querySelector("#mdTourRange").addEventListener("change", function () { seekAutomaticTour(+this.value); });
  root.querySelector("#mdTourRange").addEventListener("input", function () {
    var value = +this.value, steps = tourSteps();
    root.querySelector("#mdTourSliderValue").textContent = (value + 1) + " / " + steps.length;
  });
  root.querySelector("#mdTourKeep").addEventListener("click", function () { E.tour.keepResult = true; closeTour(); });
  root.querySelector("#mdTourNext").addEventListener("click", function () {
    if (E.tour.mode === "auto") { if(E.tour.step>=tourSteps().length-1)closeTour();else seekAutomaticTour(E.tour.step+1, true); return; }
    if (E.tour.step >= tourSteps().length - 1) closeTour();
    else goTourStep(1);
  });
  root.querySelector("#mdWelcomeClose").addEventListener("click", closeWelcome);
  root.querySelector("#mdWelcome").addEventListener("pointerdown", function (e) { if (e.target === this) closeWelcome(); });
  root.querySelector("#mdWelcomeNever").addEventListener("change", function () {
    E.welcomeOnOpen = !this.checked;
    saveModelerPrefs();
    var pref = root.querySelector("#mdPrefWelcome");
    if (pref) pref.checked = E.welcomeOnOpen;
  });
  root.querySelector("#mdCoachGo").addEventListener("click", function () {
    var sug = E._coachSug;
    if (sug && sug.run) sug.run();
    syncCoach();
  });
  root.querySelector("#mdCoachHide").addEventListener("click", function () { E.coachDismissed = true; syncCoach(); });
  root.querySelector("#mdCoachNever").addEventListener("click", function () {
    E.coachEnabled = false;
    saveModelerPrefs();
    var pref = root.querySelector("#mdPrefCoach");
    if (pref) pref.checked = false;
    syncCoach();
    flash(t("coachDontShow"));
  });
  root.querySelector("#mdCoachDots").title = t("coachStages");
  root.querySelector("#mdEmptyStart").addEventListener("click", function(event){
    var button=event.target.closest("[data-origin-plane]");
    if(button){var reference=(E.def.references || []).find(function(ref){return ref.id==="plane:"+button.dataset.originPlane;});if(reference)chooseSketchReference(reference);}
  });
  var diagJump = root.querySelector("#mdDiagJump");
  if (diagJump) diagJump.addEventListener("click", function () { focusTreeDiagnostics(); });
  var statusEl = root.querySelector("#mdStatus");
  if (statusEl) statusEl.addEventListener("click", function (event) {
    if(event.target.closest(".md-cancel-exact")){cancelExactModelRebuild();flash("Exact computation cancelled");return;}
    if (event.target.closest(".md-st-rebuild")) focusTreeDiagnostics();
  });
  root.querySelector("#mdSketchThumb").addEventListener("click", function () {
    if (this._sketch) editSketchFromHistory(this._sketch);
  });
  root.querySelectorAll("#mdModes button").forEach(function (b) {
    b.addEventListener("click", function () {
      var mode=b.getAttribute("data-mode");
      // Sketch is a choice against Split, not a sketch that happens to be split
      if(mode==="2d")E.split=false;
      if(mode==="split"){if(isCanonicalAuthoring()&&E.authoring.phase!=="sketch")beginSketchWorkflow();setMode("split");}
      else if(mode==="2d"&&isCanonicalAuthoring()&&E.authoring.phase!=="sketch")beginSketchWorkflow();
      else if(mode==="3d"&&E.authoring.phase==="sketch")finishSketchWorkflow();
      else setMode(mode);
    });
  });
  setHistPanel(createHistoryPanel(H, {
    title: t("sessionHistory"),
    showBaseline: true,
    compactTargets: true,
    scope: docScope,
    onPick: docPick,
  }));
  root.querySelector("#mdHistSession").appendChild(histPanel.el);
  /* Renaming or repricing is a document edit like any other. These handlers
     used to assign straight into E.def, which put them outside the only thing
     that defines dirtiness here: documentDirty() compares the current undo-tree
     document's edit revision against its saved revision, so an edit outside history is
     invisible by construction. A renamed model stayed "clean", closed without
     the unsaved-work prompt, and never reached a draft. `change` fires on blur
     or Enter, not per keystroke, so this is one undo step per rename. */
  bindDocumentTextField("#mdName",function(){return (E.docType === "assembly" && E.assembly ? E.assembly : E.def).name;},
    function(value){(E.docType === "assembly" && E.assembly ? E.assembly : E.def).name=value;},t("renameDocument"));
  /* Description is a named custom property (SOLIDWORKS $PRP:"Description"),
     not a second name: drawings put it in the title block and the BOM's
     Description column, while the name stays the file / part number. */
  bindDocumentTextField("#mdDescription",function(){return documentDescription(E.docType === "assembly" ? E.assembly : E.def);},
    function(value){setDocumentDescription(E.docType === "assembly" ? E.assembly : E.def,value);},t("editDescription"),true);
  root.querySelector("#mdPrice").addEventListener("change", function () {
    if (E.docType !== "part") return;
    var price = +this.value || 0;
    if (E.def.price === price) return;
    pushUndo(t("setPrice"));
    E.def.price = price;
    syncUndoButtons();
  });

  E.cv = root.querySelector("#mdCanvas");
  E.cx = E.cv.getContext("2d");
  var dimensionEditor = root.querySelector("#mdDimEditor");
  dimensionEditor.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
  dimensionEditor.addEventListener("submit", function (event) {
    event.preventDefault();
    applyDimensionEditor();
  });
  dimensionEditor.querySelectorAll("[data-dim-cancel]").forEach(function (button) {
    button.addEventListener("click", cancelDimensionEditor);
  });
  dimensionEditor.querySelector("[data-dim-delete]").addEventListener("click", deleteDimensionEditor);
  dimensionEditor.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelDimensionEditor();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      applyDimensionEditor();
    }
  });
  wireSketch();
  watchSketchSize();
  initPreview();

  // Both persistent desktop panels can give space back to the viewport. The
  // handles remain outside their panel contents so scrolling the tree/history
  // never makes the resize target disappear.
  var leftResizer = root.querySelector("#mdLeftResizer");
  var leftPanel = root.querySelector("#mdLeftPanel");
  return { leftResizer, leftPanel };
}

export { wireGuidancePropsAndPanels, wireRibbonToolsAndPanes };

/* The view-orientation button and its flyout (js/modeler/editor_markup.js):
   opens beside the rail, closes on a pick, Escape, or a press elsewhere, and
   moves focus in and back out for the keyboard. */
function wireViewFlyout() {
  var toggle = root.querySelector("#mdViewOrient"), fly = root.querySelector("#mdViewFlyout");
  if (!toggle || !fly) return;
  fly.querySelectorAll("button").forEach(function (b) { b.setAttribute("role", "menuitem"); });
  function setOpen(open, refocus) {
    fly.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.classList.toggle("open", open);
    if (open) {
      /* fixed, beside the button: the rail scrolls on a short screen and
         would clip a flyout positioned inside it */
      // The classic rail blurs its backdrop, which makes it the box `fixed`
      // measures from (and clips to); the editor root holds the flyout instead.
      if (fly.parentElement !== root) root.appendChild(fly);
      var r = toggle.getBoundingClientRect(), w = fly.offsetWidth, h = fly.offsetHeight;
      var toLeft = r.left > window.innerWidth / 2;
      var x = Math.round(toLeft ? r.left - 8 - w : r.right + 8);
      var y = Math.round(Math.max(8, Math.min(r.top, window.innerHeight - h - 8)));
      fly.style.left = x + "px";
      fly.style.top = y + "px";
      // and if the root itself is such a box, take its offset back out
      var at = fly.getBoundingClientRect();
      if (Math.abs(at.left - x) > 0.5) fly.style.left = Math.round(2 * x - at.left) + "px";
      if (Math.abs(at.top - y) > 0.5) fly.style.top = Math.round(2 * y - at.top) + "px";
      var current = fly.querySelector("button.on") || fly.querySelector("button");
      if (current) current.focus({ preventScroll: true });
    } else if (refocus) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener("click", function () { setOpen(fly.hidden, false); });
  fly.addEventListener("click", function (e) { if (e.target.closest("button")) setOpen(false, true); });
  fly.addEventListener("keydown", function (e) {
    var items = Array.prototype.slice.call(fly.querySelectorAll("button"));
    var i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false, true); }
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener("pointerdown", function (e) {
    if (!fly.hidden && !fly.contains(e.target) && !toggle.contains(e.target)) setOpen(false, false);
  }, true);
}

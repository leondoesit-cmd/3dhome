/* The CAD editor's buildDOM: the editor shell, ribbon, panes and their event
   wiring, split out of js/modeler.js. It shares the editor's state through live
   imports from ../modeler.js. */
import { shortcutConflict } from "../core/command_shortcuts.js";
import { documentDescription, setDocumentDescription } from "../core/custom_properties.js";
import { temporaryAxes } from "../core/temporary_axes.js";
import { fromDisp, toDisp } from "../display_units.js";
import { getLang } from "../i18n.js";
import { cadIcon } from "../modeler_icons.js";
import { CURATED_SWATCHES, clearFacePaint, clearMarkupsFromDef, deleteNoteFromDef, updateNoteInDef } from "../modeler_notes_paint.js";
import { t } from "../modeler_strings.js";
import { cancelActiveCommand, closeCommandSearch, commandCatalog, finishActiveCommand, openCommandSearch, renderCommandResults, setAssemblyMoveMode, setSelectionFilter, showViewSelector } from "../modeler/command_manager.js";
import { focusTreeDiagnostics, refreshParts } from "../modeler/component_mates.js";
import { onKey, releaseSelectionFilterChord, wireSketch } from "../modeler/dimension_entry.js";
import { closeEvalCard } from "../modeler/document_outputs.js";
import { saveCurrentDocument, syncTools, syncViewButtons } from "../modeler/document_save.js";
import { closeReport, documentPresetAction, drawSketch, drawingDocument, drawingSheet, flash } from "../modeler/drawing_sheet.js";
import { bindDocumentTextField, btn, commandButton, commandGroup, el, kt, relationButton, tab, tabstrip, toolKeyRows } from "../modeler/editor_dom.js";
import { renderPreview, updatePreview } from "../modeler/library_panel.js";
import { topologyEntriesForPart } from "../modeler/library_store.js";
import { syncNotesAndMarkups, syncNotesToolbar, syncPaintToolbar, syncViewsToolbarNotes } from "../modeler/notes_markups.js";
import { runCommand } from "../modeler/part_commands.js";
import { applyConstraint, cancelDimensionEditor } from "../modeler/sketch_dimension_editor.js";
import { bindPolygonSideControl, sizeSketch, syncHint, syncStatus, watchSketchSize } from "../modeler/sketch_entities.js";
import { closeTour, installTourDragging, prepareTourStep, seekAutomaticTour, startTour, tourSteps } from "../modeler/sketch_guide.js";
import { activateWorkflowStep, beginSketchWorkflow, cancelFacePick, cancelReferenceSelection, chooseSketchReference, finishSketchWorkflow, isCanonicalAuthoring, orientModelToView, setCommandTab, setModelLengthUnit, setSketchNormalTo, setTab, setTool, setView, showReferencePicker, syncNormalToControls, zoomBy } from "../modeler/sketch_workflow.js";
import { applyDimensionEditor, deleteDimensionEditor, editSketchFromHistory } from "../modeler/tree_assembly.js";
import { initPreview, layout3DHost, setModelDisplay, setPanelCollapsed, setSectionState, setShowModelEdges } from "../modeler/view_modes.js";
import { closeNoteEditor } from "../modeler/viewport_input.js";
import { closeWelcome, goTourStep, syncCoach } from "../modeler/welcome_coach.js";
import { commandBarHTML, editorSwitchHTML, projectChipHTML, shellActionsHTML, wireEditorSwitch, wireShell } from "../pro_shell.js";
import { buildTouchPrecisionSettings } from "../touch_precision_ui.js";
import { createHistoryPanel } from "../ui_history.js";
import * as ribbon from "../uikit_host/ribbon.js";
import { getDomainUnit } from "../unit_settings.js";
import {
  E, H, RIBBON_RELATIONS, cancelExactModelRebuild, decoGroups, doRedo, doUndo,
  docPick, docScope, exportDrawingSvg, histPanel, newModel, printDrawingSheet,
  pushUndo, refreshAll, requestCloseModeler, requestDocumentType, root,
  saveModelerPrefs, setEditorRoot, setHistPanel, setMode, syncDensity,
  syncUndoButtons,
} from "../modeler.js";
import { buildEditorShellMarkup } from "./editor_markup.js";
import {
  wireGuidancePropsAndPanels, wireRibbonToolsAndPanes,
} from "./ribbon_panels.js";

function buildDOM() {
  E.lang = getLang();
  setEditorRoot(el("div", "", ""));
  root.id = "modeler";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", t("title"));
  buildEditorShellMarkup();
  var { cons, autoDimBox } = wireRibbonToolsAndPanes();
  var { leftResizer, leftPanel } = wireGuidancePropsAndPanels(autoDimBox, cons);
  var lDrag = null;
  leftResizer.addEventListener("pointerdown", function (e) {
    leftResizer.setPointerCapture(e.pointerId);
    lDrag = { startX: e.clientX, startW: leftPanel.offsetWidth };
  });
  leftResizer.addEventListener("pointermove", function (e) {
    if (!lDrag) return;
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var dx = (e.clientX - lDrag.startX) * direction;
    var newW = Math.max(210, Math.min(lDrag.startW + dx, window.innerWidth - 420));
    leftPanel.style.width = newW + "px";
    sizeSketch();
    drawSketch();
    requestAnimationFrame(layout3DHost);
  });
  leftResizer.addEventListener("pointerup", function () { lDrag = null; });
  leftResizer.addEventListener("pointercancel", function () { lDrag = null; });
  leftResizer.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var delta = (e.key === "ArrowRight" ? 16 : -16) * direction;
    leftPanel.style.width = Math.max(210, Math.min(leftPanel.offsetWidth + delta, window.innerWidth - 420)) + "px";
    sizeSketch(); drawSketch(); requestAnimationFrame(layout3DHost);
  });

  // Resize logic for right panel
  var resizer = root.querySelector("#mdRightResizer");
  var rightPanel = root.querySelector("#mdRightPanel");
  var rDrag = null;
  resizer.addEventListener("pointerdown", function (e) {
    resizer.setPointerCapture(e.pointerId);
    rDrag = { startX: e.clientX, startW: rightPanel.offsetWidth };
  });
  resizer.addEventListener("pointermove", function (e) {
    if (!rDrag) return;
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var dx = (rDrag.startX - e.clientX) * direction;
    var newW = Math.max(240, Math.min(rDrag.startW + dx, window.innerWidth - 420));
    rightPanel.style.width = newW + "px";
    sizeSketch();
    drawSketch();
    requestAnimationFrame(layout3DHost);
  });
  resizer.addEventListener("pointerup", function () { rDrag = null; });
  resizer.addEventListener("pointercancel", function () { rDrag = null; });
  resizer.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    var direction = document.documentElement.dir === "rtl" ? -1 : 1;
    var delta = (e.key === "ArrowLeft" ? 16 : -16) * direction;
    rightPanel.style.width = Math.max(260, Math.min(rightPanel.offsetWidth + delta, window.innerWidth - 420)) + "px";
    sizeSketch(); drawSketch(); requestAnimationFrame(layout3DHost);
  });

  root.querySelector("#mdContextBtn").addEventListener("change", function(e) {
    if (E.pv) E.pv.inRoom = e.target.checked;
    updatePreview();
    renderPreview();
  });

  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", function (e) { if (E.open) releaseSelectionFilterChord(e); });
}

export { buildDOM };

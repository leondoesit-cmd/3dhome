/* The CAD editor's buildDOM: the editor shell, ribbon, panes and their event
   wiring, split out of js/modeler.js. It shares the editor's state through live
   imports from ../modeler.js. */
import "../core/command_shortcuts.js";
import "../core/custom_properties.js";
import "../core/temporary_axes.js";
import "../display_units.js";
import { getLang } from "../i18n.js";
import "../modeler_icons.js";
import "../modeler_notes_paint.js";
import { t } from "../modeler_strings.js";
import "../modeler/command_manager.js";
import "../modeler/component_mates.js";
import { onKey, releaseSelectionFilterChord } from "../modeler/dimension_entry.js";
import "../modeler/document_history.js";
import "../modeler/document_io.js";
import "../modeler/document_outputs.js";
import "../modeler/document_save.js";
import { drawSketch } from "../modeler/drawing_sheet.js";
import { el } from "../modeler/editor_dom.js";
import "../modeler/editor_forms.js";
import "../modeler/library_io.js";
import { renderPreview, updatePreview } from "../modeler/library_panel.js";
import "../modeler/library_store.js";
import "../modeler/notes_markups.js";
import "../modeler/part_commands.js";
import "../modeler/prefs_snap.js";
import "../modeler/sketch_dimension_editor.js";
import { sizeSketch } from "../modeler/sketch_entities.js";
import "../modeler/sketch_guide.js";
import "../modeler/sketch_workflow.js";
import "../modeler/tree_assembly.js";
import { layout3DHost } from "../modeler/view_modes.js";
import "../modeler/viewport_input.js";
import "../modeler/welcome_coach.js";
import "../pro_shell.js";
import "../touch_precision_ui.js";
import "../ui_history.js";
import "../uikit_host/ribbon.js";
import "../unit_settings.js";
import { E, root, setEditorRoot } from "../modeler.js";
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

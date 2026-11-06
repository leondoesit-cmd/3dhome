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

function buildDOM() {
  E.lang = getLang();
  setEditorRoot(el("div", "", ""));
  root.id = "modeler";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", t("title"));
  root.innerHTML =
    '<div class="md-head">' +
    '<div class="md-head-logo">' + cadIcon("mode3d") + ' <b>' + t("title") + "</b>" +
    '<span class="md-sub" id="mdSub"></span></div>' +
    projectChipHTML() +
    editorSwitchHTML("model", "md-editors") +
    '<div class="md-docmodes" id="mdDocModes">' +
    '<button data-doc="part" class="on">' + cadIcon("mode3d") + " " + t("docPart") + '</button>' +
    '<button data-doc="assembly">' + cadIcon("assembly") + " " + t("docAssembly") + '</button>' +
    '</div>' +
    '<div class="md-head-inputs">' +
    '<label class="md-field"><span>' + t("name") + '</span><input id="mdName" type="text" aria-label="' + t("name") + '" autocomplete="off"></label>' +
    '<label class="md-field"><span>' + t("description") + '</span><input id="mdDescription" type="text" aria-label="' + t("description") + '" autocomplete="off" title="' + t("descriptionHint") + '"></label>' +
    '<label class="md-field md-field-sm"><span>' + t("price") + '</span><input id="mdPrice" type="number" min="0"></label>' +
    "</div>" +
    /* Regenerate / STEP / drawing all have a labelled home in the Evaluate tab
       of the command manager. Repeating them here as unlabelled glyphs gave the
       same command two appearances and taught neither of them. */
    '<div class="md-head-actions">' +
    shellActionsHTML() +
    '<button id="mdUndo" data-tip="' + kt(t("undo"), "Ctrl+Z") + '"><i class="ph ph-arrow-u-up-left"></i></button>' +
    '<button id="mdRedo" data-tip="' + kt(t("redo"), "Ctrl+Y") + '"><i class="ph ph-arrow-u-up-right"></i></button>' +
    '<div class="md-separator"></div>' +
    '<button id="mdGuide" class="md-guide-launch" data-tip="' + t("guideTitle") + '"><i class="ph ph-graduation-cap"></i><span>' + t("guide") + '</span></button>' +
    '<button id="mdSave" class="btn-accent" data-tip="Ctrl+S"><i class="ph ph-floppy-disk"></i> ' + t("save") + "</button>" +
    '<button id="mdClose" data-tip="' + t("closeTip") + '"><i class="ph ph-x"></i> ' + t("close") + "</button>" +
    "</div>" +
    "</div>" +
    /* One line, not five cards. The five phases still read left to right and
       still carry their live readout, but as a breadcrumb they cost 26px
       instead of 60 and stop competing with the ribbon for attention. */
    '<nav class="md-workflow" id="mdWorkflow" aria-label="' + t("wfAria") + '">' +
      '<button type="button" data-workflow-step="context"><b>' + t("wfPart") + '</b><small id="mdWorkflowContext">cm · origin</small></button>' +
      '<button type="button" data-workflow-step="reference"><b>' + t("wfReference") + '</b><small id="mdWorkflowReference">' + t("wfNone") + '</small></button>' +
      '<button type="button" data-workflow-step="sketch"><b>' + t("wfSketch") + '</b><small id="mdWorkflowSketch">' + t("wfEmpty") + '</small></button>' +
      '<button type="button" data-workflow-step="feature"><b>' + t("wfFeature") + '</b><small id="mdWorkflowFeature">' + t("wfNone") + '</small></button>' +
      '<button type="button" data-workflow-step="history"><b>' + t("wfHistory") + '</b><small id="mdWorkflowHistory">0 ' + t("wfEditableSteps") + '</small></button>' +
    '</nav>' +
    /* The coach is the semi-guided layer: it reads the workflow state and
       names one concrete next action, with a button that performs it. It never
       blocks — dismissing it (or the workflow outgrowing it) just hides it. */
    '<div class="md-coach" id="mdCoach" hidden>' +
      '<span class="md-coach-pulse" aria-hidden="true"></span>' +
      '<i class="ph md-coach-icon" id="mdCoachIcon" aria-hidden="true"></i>' +
      '<div class="md-coach-text"><small id="mdCoachLabel">' + t("coachNext") + '</small><span id="mdCoachText"></span></div>' +
      '<button type="button" id="mdCoachGo" class="btn-accent"></button>' +
      '<div class="md-coach-dots" id="mdCoachDots" aria-hidden="true"></div>' +
      '<button type="button" id="mdCoachNever" class="md-coach-x" title="' + t("coachDontShow") + '"><i class="ph ph-eye-slash"></i></button>' +
      '<button type="button" id="mdCoachHide" class="md-coach-x" title="' + t("coachDismiss") + '" aria-label="' + t("coachDismiss") + '"><i class="ph ph-x"></i></button>' +
    '</div>' +
    '<div class="md-commandmanager" aria-label="' + t("cmdManager") + '">' +
    '<div class="md-command-tabs" role="tablist">' +
    '<button type="button" class="on" data-cmdtab="features" role="tab">' + t("cmdFeatures") + '</button>' +
    '<button type="button" data-cmdtab="sketch" role="tab">' + t("cmdSketch") + '</button>' +
    '<button type="button" data-cmdtab="evaluate" role="tab">' + t("cmdEvaluate") + '</button>' +
    '<button type="button" data-cmdtab="assembly" role="tab">' + t("cmdAssembly") + '</button>' +
    '<button type="button" id="mdCommandSearchBtn" class="md-command-search-btn" aria-label="' + t("cmdSearch") + '" title="' + kt(t("cmdSearch"), "Ctrl+K") + '"><i class="ph ph-magnifying-glass"></i><span>' + t("cmdSearch") + '</span><kbd>Ctrl K</kbd></button>' +
    '</div>' +
    '<div class="md-command-panes">' +
    '<div class="md-command-pane on" data-command-pane="features">' +
      /* Start is the everyday path: open a sketch, then the six verbs that turn
         a profile into a body. The specialty features moved to Standards so the
         default tab stops being a third wider than the window. */
      commandGroup("grpStart", [
        commandButton("newsketch", t("createSketch"), null, "primary"),
        commandButton("extrude", t("opExtrude"), null, "primary"),
        commandButton("extrudecut", t("extrudeCut"), null, "primary"),
        commandButton("revolvefeature", t("opRevolve"), "R"),
        commandButton("revolvecutfeature", t("opRevolveCut")),
        commandButton("sweepfeature", t("opSweep")),
        commandButton("sweepcutfeature", t("opSweepCut")),
        commandButton("loftfeature", t("cap_loft"), null, "", t("loftOp")),
        commandButton("holefeature", t("cap_hole"), null, "primary", t("holeWizard")),
      ]) +
      commandGroup("grpFinish", [
        commandButton("filletfeature", t("quickFillet"), null, "primary"),
        commandButton("chamferfeature", t("quickChamfer"), null, "primary"),
        commandButton("shellfeature", t("shellOp")),
        commandButton("draftfeature", t("draftOp")),
        commandButton("domefeature", t("domeOp")),
        commandButton("thickenfeature", t("thickenOp")),
        commandButton("ribfeature", t("ribOp")),
        commandButton("splitbodyfeature", t("splitBodyOp")),
        commandButton("movebodyfeature", t("moveBodyOp")),
        commandButton("patternfeature", t("quickPattern")),
        commandButton("mirrorfeature", t("quickMirror")),
        commandButton("booleanfeature", t("opBoolean")),
      ]) +
      /* Direct modelling rewrites two of these five into sketch tools and
         refuses the other three in a parametric-v1 document, so the group is
         hidden there (syncCommandManager) rather than removed — command search
         and legacy documents still reach every one of them. */
      commandGroup("grpDirect", [
        commandButton("directbox", t("tool_rect"), "B"),
        commandButton("directcyl", t("tool_circle"), "C"),
        commandButton("directsph", t("tool_sph"), "S"),
        commandButton("directpoly", t("tool_poly"), "P"),
        commandButton("directrev", t("tool_rev")),
      ], "secondary") +
      commandGroup("grpReferences", [
        commandButton("refplane", t("cap_refplane"), null, "", t("refPlane")),
        commandButton("refaxis", t("cap_refaxis"), null, "", t("refAxis")),
        commandButton("coordsys", t("cap_refcoord"), null, "", t("refCoord")),
      ], "secondary") +
      /* Helix, thread, knurl and insert are all standards-driven detail work
         (ISO threads, DIN 82 knurls, threaded inserts, the helix that sweeps
         them), so they sit with the toolbox parts rather than in Start. */
      commandGroup("grpStandards", [
        commandButton("stdscrew", t("cap_stdscrew"), null, "", t("stdScrewCommand")),
        commandButton("toolboxfastener", t("cap_fastener"), null, "", t("toolboxFastener")),
        commandButton("stdgear", t("stdGearCommand"), null, "", t("stdGearCommand")),
        commandButton("helixfeature", t("cap_helix"), null, "", t("opHelix")),
        commandButton("threadfeature", t("opThread"), null, "", t("opThread")),
        commandButton("knurlfeature", t("cap_knurl"), null, "", t("opKnurl")),
        commandButton("insertfeature", t("cap_insert"), null, "", t("opInsert")),
      ], "secondary") +
    '</div>' +
    '<div class="md-command-pane" data-command-pane="sketch">' +
      commandGroup("grpSketch", [
        commandButton("select", t("cap_select"), "V", "", t("tool_select")),
        commandButton("wall", t("cap_wall"), "L", "primary", t("tool_wall")),
        commandButton("srect", t("cap_srect"), "Q", "primary", t("tool_srect")),
        commandButton("centerrectangle", t("centerRectangle"), ""),
        commandButton("faceboundary", t("faceBoundary"), ""),
        commandButton("convertentities", t("convertEntities"), null, "", t("convertEntitiesTip")),
        commandButton("scirc", t("cap_scirc"), "G", "primary", t("tool_scirc")),
        commandButton("dimensionedcircle", "Dimensioned circle", ""),
        commandButton("dimensionedpolygon", "Dimensioned polygon", ""),
        commandButton("sarc", t("centerpointArc"), "A", "", t("centerpointArc")),
        commandButton("arc3point", t("arcThreePoint"), ""),
        commandButton("tangentarc", t("tangentArc"), ""),
        commandButton("sslot", t("tool_sslot"), "J"),
        commandButton("centerslot", t("centerSlot"), ""),
        commandButton("spoly", t("cap_spoly"), "N", "", t("tool_spoly")),
        commandButton("sell", t("tool_sell"), "Y"),
        commandButton("sspline",t("tool_sspline"),""),
        commandButton("sketchrepair",t("sketchRepair"),""),
        commandButton("dim", t("cap_dim"), "D", "primary", t("tool_dim")),
        commandButton("trim", t("tool_trim"), "T", "primary"),
        commandButton("extend", t("tool_extend"), "E"),
        commandButton("sketchfillet", t("sketchFillet"), ""),
      ]) +
      /* Relations belong to the tab that owns sketching. They used to live only
         in the right-hand inspector, which on a phone is a bottom sheet — so
         the verbs of parametric sketching read as a separate product from the
         Sketch tab. Same palette plumbing, one tab closer. */
      commandGroup("grpRelations", RIBBON_RELATIONS.map(relationButton)) +
      commandGroup("grpSketchEdit", [
        commandButton("offset", t("tool_offset")),
        commandButton("constr", t("cap_constr"), null, "", t("tool_constr")),
        commandButton("mirror", t("sketchMirror")),
        commandButton("dynamicmirror", t("dynamicMirror")),
        commandButton("pattern", t("cap_pattern"), null, "", t("sketchPattern")),
        commandButton("circpattern", t("cap_circpattern"), null, "", t("sketchCircPattern")),
        // "Project" is a silhouette projection unless model edges are picked;
        // Convert Entities (in the Sketch group) is the selective conversion
        commandButton("project", t("cap_project"), null, "", t("projectEdgesTip")),
      ], "secondary") +
      /* Opening and committing a sketch are the two ends of this tab's job, so
         they get their own primary group at its end instead of leaving Finish
         sketch to sit as a peer of the construction-geometry toggle. */
      commandGroup("grpSketchOpenClose", [
        commandButton("newsketch", t("createSketch"), null, "primary"),
        commandButton("finishsketch", t("finishSketch"), null, "primary", t("finishSketch")),
      ]) +
    '</div>' +
    '<div class="md-command-pane" data-command-pane="evaluate">' +
      /* What the model tells you about itself, versus what leaves the document.
         Zoom-to-fit is viewport control, not evaluation — the viewport chrome
         carries it, and F and command search still reach it. */
      commandGroup("grpAnalyze", [
        commandButton("regen", t("regenerate"), "Ctrl+B", "primary", t("regenerate")),
        commandButton("mass", t("massProps"), null, "", t("massProps")),
        commandButton("measure", t("measureTool"), null, "", t("measureTool")),
        commandButton("section", t("sectionView"), null, "", t("sectionView")),
        commandButton("paint", t("tool_paint"), "P", "", t("tool_paint_tip")),
        commandButton("note", t("tool_note"), "N", "", t("tool_note_tip")),
        commandButton("standards", t("standardsAudit"), null, "", t("standardsAudit")),
        commandButton("fitcheck", t("fitCheck"), null, "", t("fitCheck")),
      ]) +
      /* Configurations is neither analysis nor interop — it is saved document
         state, which is what the rest of this group is about. */
      commandGroup("grpFile", [
        commandButton("drawing", t("drawingExport")),
        commandButton("config", t("configurations")),
        commandButton("bundle", t("projectBundle"), null, "", t("projectBundle")),
        commandButton("bundlein", t("importBundle"), null, "", t("importBundle")),
        commandButton("stepin", t("stepImport"), null, "", t("stepImport")),
        commandButton("stepout", t("stepExport"), null, "", t("stepExport")),
        commandButton("igesout", t("exportIges"), null, "", t("exportIges")),
        commandButton("stlout", t("exportStl"), null, "", t("exportStlTip")),
        commandButton("layeranalysis", "Layer analysis"),
        commandButton("fffslice", "FFF slice preview"),
        // the unit override belongs next to the import it modifies, not in the header
        '<label class="md-command-field"><span>' + t("sourceUnits") + '</span>' +
        '<select id="mdStepUnit" aria-label="' + t("sourceUnits") + '"><option value="auto">' + t("stepAuto") + '</option>' +
        '<option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>' +
        '<option value="in">inch</option><option value="ft">feet</option></select></label>',
      ]) +
    '</div>' +
    /* Switching document shape is #mdDocModes' job in the header; repeating it
       here as two more ribbon buttons gave that command two homes. */
    '<div class="md-command-pane" data-command-pane="assembly">' +
      commandGroup("grpInsert", [
        commandButton("components", t("insertComponent"), null, "primary", t("insertComponent")),
        commandButton("formsubassembly",t("formSubassembly")),
        commandButton("componentpattern","Component Pattern"),
        commandButton("editcomponentpattern","Edit Component Pattern"),
        commandButton("removecomponentpattern","Remove Component Pattern"),
      ]) +
      commandGroup("grpMates", [
        commandButton("mates", t("mate"), null, "primary"),
        commandButton("screwmate", t("screwMate")),
      ]) +
      commandGroup("grpReview", [
        commandButton("explode", t("explodeView"), null, "", t("explodeView")),
        commandButton("isolate", t("isolate"), null, "", t("isolate")),
        commandButton("interference", t("interferenceCheck")),
        commandButton("bom", t("billOfMaterials"), null, "", t("billOfMaterials")),
        commandButton("motion", t("motionStudy"), null, "", t("motionStudy")),
      ]) +
      commandGroup("grpFile", [
        commandButton("printsetup", "Print setup"),
        commandButton("layeranalysis", "Layer analysis"),
        commandButton("fffslice", "FFF slice preview"),
        commandButton("stlout", t("exportStl")),
        commandButton("3mfout", "Export 3MF"),
        commandButton("amfout", "Export AMF"),
      ]) +
    '</div></div></div>' +
    '<div class="md-body">' +

    /* ---- left: design intent and ordered model history ----
       Every sketch tool and every feature op used to be repeated here as an
       unlabelled glyph while also living in the command manager above. One
       home per command: the ribbon owns the verbs, this panel owns the model
       tree. What's left is a plain text tab strip. */
    '<div class="md-panel md-left" id="mdLeftPanel">' +
    tabstrip("L", [
      tab("parts", "treeTab", t("tabTreeShort"), t("tabTreeLong"), '<span class="md-badge" id="mdPartBadge"></span>'),
      tab("lib", "libTab", t("tabLibShort"), t("tabLib")),
      tab("set", "paramsTab", t("tabSetShort"), t("tabSet")),
    ], '<button type="button" class="md-strip-act" data-act="new" title="' + t("newModel") + '"><i class="ph ph-file-plus"></i></button>') +
    '<div class="md-strip-meta"><span class="md-hsize" id="mdSize"></span><button type="button" class="md-diag-jump" id="mdDiagJump" hidden></button></div>' +
    '<div class="md-tabs" data-side="L">' +
    '<div class="md-pane on" data-pane="parts"><div id="mdParts"></div></div>' +
    '<div class="md-pane" data-pane="lib"><div id="mdLib"></div></div>' +
    '<div class="md-pane" data-pane="set"><div id="mdCons"></div></div>' +
    "</div>" +
    /* A property manager, not a launcher. The nine buttons that used to sit in
       this panel were the same nine commands as the Features ribbon tab,
       permanently parked over the model; now the panel only exists while a
       feature is being defined, it titles itself after that feature, and it
       covers the tree rather than the live preview it is there to show. */
    '<aside class="md-quick-tools" id="mdQuickTools" aria-label="' + t("quickTools") + '">' +
    '<div class="md-quick-settings" id="mdQuickSettings" hidden></div>' +
    '</aside>' +
    '<div id="mdLeftResizer" class="md-resizer md-resizer-left" role="separator" aria-orientation="vertical" aria-label="Resize feature tree" tabindex="0"></div>' +
    "</div>" +

    /* ---- middle: the drawing, full-bleed, with its controls floating on it ---- */
    '<div class="md-mid">' +
    '<canvas id="mdCanvas"></canvas>' +
    '<form id="mdDimEditor" class="md-dimension-editor" hidden autocomplete="off">' +
      '<div class="md-dimension-editor-head"><span><i class="ph ph-ruler"></i> ' + t("dimEditorTitle") + '</span><button type="button" data-dim-cancel aria-label="' + t("m_cancel") + '"><i class="ph ph-x"></i></button></div>' +
      '<label class="md-dimension-value"><span>' + t("dimValue") + '</span><span class="md-dimension-input"><input id="mdDimValue" type="text" spellcheck="false" autocapitalize="off" required><b id="mdDimUnit">mm</b></span></label>' +
      '<div class="md-dimension-quick"><label><span>' + t("dimMode") + '</span><select id="mdDimMode"><option value="driving">' + t("dimDriving") + '</option><option value="reference">' + t("dimReference") + '</option></select></label><label><span>' + t("dimNameOptional") + '</span><input id="mdDimName" type="text" spellcheck="false"></label></div>' +
      '<div class="md-dimension-quick"><label><span>Part tolerance</span><select id="mdDimTolerance"><option value="none">None</option><option value="deviation">Signed deviations</option></select></label><label><span>Upper / lower (dimension unit)</span><input id="mdDimTolUpper" type="text" aria-label="Upper tolerance deviation"><input id="mdDimTolLower" type="text" aria-label="Lower tolerance deviation"></label></div>' +
      '<div id="mdDimError" class="md-dimension-error" role="alert" hidden></div>' +
      '<div class="md-dimension-actions"><button type="button" class="danger" data-dim-delete title="' + t("dimDelete") + '"><i class="ph ph-trash"></i></button><span></span><button type="button" data-dim-cancel>' + t("m_cancel") + '</button><button type="submit" class="accept" title="' + t("dimApply") + '"><i class="ph ph-check"></i><span>' + t("dimApply") + '</span></button></div>' +
    '</form>' +
    '<div id="md3dHost" class="md-3dhost"></div>' +
    '<button type="button" id="mdToggleLeft" class="md-panel-toggle md-panel-toggle-left" aria-label="' + t("toggleTree") + '" title="' + t("toggleTree") + '" aria-pressed="true"><i class="ph ph-tree-structure"></i><span>' + t("tabTreeShort") + '</span></button>' +
    '<button type="button" id="mdToggleRight" class="md-panel-toggle md-panel-toggle-right" aria-label="' + t("toggleInspector") + '" title="' + t("toggleInspector") + '" aria-pressed="true"><i class="ph ph-sidebar-simple"></i><span>' + t("tabShapeShort") + '</span></button>' +
    '<div class="md-modes" id="mdModes" role="tablist" aria-label="Editor modes">' +
    '<button data-mode="3d" class="on" role="tab" aria-selected="true" data-tip="3">' + cadIcon("mode3d") + ' ' + t("mode3d") + "</button>" +
    '<button data-mode="2d" role="tab" aria-selected="false" data-tip="2">' + cadIcon("mode2d") + ' ' + t("mode2d") + "</button>" +
    '<button data-mode="drawing" role="tab" aria-selected="false" data-tip="7">' + cadIcon("drawing") + ' ' + t("modeDrawing") + "</button>" +
    '<button data-mode="split" id="mdModeSplit" role="tab" aria-selected="false" title="' + t("modeSplitTip") + '"><i class="ph ph-columns"></i> ' + t("modeSplit") + "</button>" +
    "</div>" +
    '<div class="md-drawing-tools" id="mdDrawingTools" role="toolbar" aria-label="Drawing tools">' +
    '<button type="button" data-drawing-tool="select" class="on">' + cadIcon("select") + '<span>' + t("drawToolSelect") + '</span><kbd>V</kbd></button>' +
    '<button type="button" data-drawing-tool="dim">' + cadIcon("dim") + '<span>' + t("drawToolDim") + '</span><kbd>D</kbd></button>' +
    '<button type="button" data-drawing-tool="angle"><i class="ph ph-angle"></i><span>' + t("drawToolAngle") + '</span><kbd>A</kbd></button>' +
    '<button type="button" data-drawing-tool="diam"><i class="ph ph-circle-dashed"></i><span>' + t("drawToolDiam") + '</span></button>' +
    '<button type="button" data-drawing-tool="baseline"><i class="ph ph-rows"></i><span>' + t("drawToolBaseline") + '</span><kbd>B</kbd></button>' +
    '<button type="button" data-drawing-tool="chain"><i class="ph ph-link-simple-horizontal"></i><span>' + t("drawToolChain") + '</span><kbd>C</kbd></button>' +
    '<button type="button" data-drawing-tool="sheetline">' + cadIcon("sheetline") + '<span>' + t("drawPaperLine") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetpolyline">' + cadIcon("sheetpolyline") + '<span>' + t("drawPaperPolyline") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetrect">' + cadIcon("sheetrect") + '<span>' + t("drawPaperRectangle") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetcircle">' + cadIcon("sheetcircle") + '<span>' + t("drawPaperCircle") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetarc">' + cadIcon("sheetarc") + '<span>' + t("drawPaperArc") + '</span></button>' +
    '<button type="button" data-drawing-tool="sheetellipse">' + cadIcon("sheetellipse") + '<span>' + t("drawPaperEllipse") + '</span></button>' +
    '<button type="button" data-drawing-tool="note"><i class="ph ph-note-pencil"></i><span>' + t("drawToolNote") + '</span><kbd>N</kbd></button>' +
    '<button type="button" data-drawing-tool="insertimage">' + cadIcon("insertimage") + '<span>Insert image</span></button>' +
    '<button type="button" data-drawing-tool="insertprojectimage">' + cadIcon("insertprojectimage") + '<span>Insert project image</span></button>' +
    '<button type="button" data-drawing-tool="editimage">' + cadIcon("editimage") + '<span>Edit image</span></button>' +
    '<button type="button" data-drawing-tool="removeimage"><i class="ph ph-trash"></i><span>Remove image</span></button>' +
    '<button type="button" data-drawing-tool="saveformat">' + cadIcon("saveformat") + '<span>Save sheet format</span></button>' +
    '<button type="button" data-drawing-tool="applyformat">' + cadIcon("applyformat") + '<span>Apply sheet format</span></button>' +
    '<button type="button" data-drawing-tool="savetemplate">' + cadIcon("savetemplate") + '<span>Save drawing template</span></button>' +
    '<button type="button" data-drawing-tool="newtemplate">' + cadIcon("newtemplate") + '<span>New from drawing template</span></button>' +
    '<button type="button" data-drawing-tool="section">' + cadIcon("drawingsection") + '<span>' + t("drawToolSection") + '</span><kbd>S</kbd></button>' +
    '<button type="button" data-drawing-tool="alignedsection">' + cadIcon("alignedsection") + '<span>Aligned cut-face section</span></button>' +
    '<button type="button" data-drawing-tool="detail"><i class="ph ph-magnifying-glass-plus"></i><span>' + t("drawToolDetail") + '</span></button>' +
    '<button type="button" data-drawing-tool="auxiliary"><i class="ph ph-cube"></i><span>Auxiliary</span></button>' +
    '<button type="button" data-drawing-tool="crop"><i class="ph ph-crop"></i><span>Crop</span></button>' +
    '<button type="button" data-drawing-tool="uncrop"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove crop</span></button>' +
    '<button type="button" data-drawing-tool="brokenout">' + cadIcon("brokenout") + '<span>Broken-out section</span></button>' +
    '<button type="button" data-drawing-tool="unbrokenout"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove broken-out</span></button>' +
    '<button type="button" data-drawing-tool="break">' + cadIcon("breakview") + '<span>Break view / edit</span></button>' +
    '<button type="button" data-drawing-tool="unbreak"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove Break</span></button>' +
    '<button type="button" data-drawing-tool="alternateposition"><i class="ph ph-copy"></i><span>Alternate Position / edit</span></button>' +
    '<button type="button" data-drawing-tool="removealternateposition"><i class="ph ph-arrow-counter-clockwise"></i><span>Remove Alternate Position</span></button>' +
    '<span class="md-drawing-tools-sep"></span>' +
    '<button type="button" id="mdSheetAutoDim"><i class="ph ph-ruler"></i><span>' + t("drawAutoDim") + '</span></button>' +
    '<button type="button" id="mdSheetModelItems"><i class="ph ph-ruler"></i><span>' + t("drawModelItems") + '</span></button>' +
    '<button type="button" id="mdSheetHidden" aria-pressed="true"><i class="ph ph-eye-closed"></i><span>' + t("drawHiddenLines") + '</span><kbd>H</kbd></button>' +
    '<button type="button" id="mdSheetFit">' + cadIcon("fit") + '<span>' + t("zoomFit") + '</span><kbd>F</kbd></button>' +
    '<span class="md-drawing-tools-sep"></span>' +
    '<button type="button" id="mdSheetPrint"><i class="ph ph-printer"></i><span>' + t("drawPrint") + '</span></button>' +
    '<button type="button" id="mdSheetExport"><i class="ph ph-file-svg"></i><span>' + t("drawExportSvg") + '</span></button>' +
    '</div>' +
    '<aside class="md-sheet-panel" id="mdSheetPanel" hidden aria-label="' + t("sheetSetup") + '"></aside>' +
    '<div class="md-views" id="mdViews" role="toolbar" aria-label="' + t("displayStyle") + '">' +
    '<div class="md-vgroup">' +
    '<button data-view="top" data-tip="' + kt(t("view_top"), "4") + '">' + cadIcon("view_top") + '<span>' + (getLang()==="en"?"Top":"על") + ' · X·Z</span></button>' +
    '<button data-view="bottom" data-tip="' + t("view_bottom") + '">' + cadIcon("view_top") + '<span>' + (getLang()==="en"?"Bottom":"תחתון") + ' · X·Z</span></button>' +
    '<button data-view="front" data-tip="' + kt(t("view_front"), "5") + '">' + cadIcon("view_front") + '<span>' + (getLang()==="en"?"Front":"חזית") + ' · X·Y</span></button>' +
    '<button data-view="side" data-tip="' + kt(t("view_right"), "6") + '">' + cadIcon("view_right") + '<span>' + (getLang()==="en"?"Right":"ימין") + ' · Z·Y</span></button>' +
    '<button data-view="back" data-tip="' + t("view_back") + '">' + cadIcon("view_front") + '<span>' + (getLang()==="en"?"Back":"אחור") + ' · X·Y</span></button>' +
    '<button data-view="left" data-tip="' + t("view_left") + '">' + cadIcon("view_right") + '<span>' + (getLang()==="en"?"Left":"שמאל") + ' · Z·Y</span></button>' +
    '<button type="button" id="mdNormalToView" data-tip="' + kt(t("normalTo"), "Ctrl+8") + '">' + cadIcon("normalTo") + "<span>" + t("normalTo") + "</span></button>" +
    "</div>" +
    '<div class="md-vgroup md-projection"><button type="button" id="mdPerspectiveView" aria-label="Perspective" aria-pressed="true" title="Toggle perspective / orthographic orbit projection"><span>Perspective</span></button><button type="button" id="mdNamedViews" aria-label="Named views"><span>Named views</span></button></div>' +
    '<div class="md-vgroup md-zoom">' +
    '<button data-zoom="in" data-tip="' + t("zoomIn") + '" aria-label="' + t("zoomIn") + '" title="' + t("zoomIn") + '">' + cadIcon("zoomIn") + '</button>' +
    '<button data-zoom="out" data-tip="' + t("zoomOut") + '" aria-label="' + t("zoomOut") + '" title="' + t("zoomOut") + '">' + cadIcon("zoomOut") + '</button>' +
    '<button data-zoom="fit" data-tip="' + kt(t("zoomFit"), "F") + '" aria-label="' + t("zoomFit") + '" title="' + kt(t("zoomFit"), "F") + '">' + cadIcon("fit") + '</button>' +
    '</div>' +
    '<div class="md-vgroup md-display" role="group" aria-label="' + t("displayStyle") + '">' +
    '<button type="button" data-display="solid" class="on" aria-pressed="true">' + cadIcon("solidView") + '<span>' + t("solidView") + '</span></button>' +
    '<button type="button" data-display="transparent" aria-pressed="false">' + cadIcon("transparentView") + '<span>' + t("transparentView") + '</span></button>' +
    '<button type="button" id="mdShowEdges" class="on" aria-pressed="true" title="' + t("modelEdgesTip") + '">' + cadIcon("modelEdges") + '<span>' + t("modelEdges") + '</span></button>' +
    '<button type="button" id="mdTemporaryAxes" aria-pressed="false" title="Temporary axes"><i class="ph ph-crosshair-simple"></i><span>Temporary axes</span></button>' +
    '<button type="button" id="mdToggleNotesView" class="on" aria-pressed="true" title="' + t("toggleNotes") + '"><i class="ph ph-chat-circle-text"></i><span>' + t("notesAnnotations") + '</span></button>' +
    '</div><button type="button" id="mdFinishPlane" class="md-finish-plane">' + cadIcon("check") + '<span>' + t("exitPlane") + '</span></button></div>' +
    '<button type="button" id="mdSketchOnFace" class="md-sketch-on-face" hidden><i class="ph ph-pencil-line"></i><span>' + t("createSketchOnRef") + '</span></button>' +
    /* One shelf, not four things all claiming the same corner. The chip, the
       confirmation corner, the section panel and the evaluate card each used to
       pin themselves to top/inset-inline-end on their own, so any two of them
       open at once landed on top of each other — the plane chip covered the
       green check completely, and the eval card needed a hand-tuned 232px to
       dodge the section panel. A flex column stacks whatever is open and needs
       to know nothing about the heights of the rest. */
    '<div class="md-rail md-rail-end" id="mdRailEnd">' +
    '<button type="button" id="mdSketchPlaneChip" class="md-sketch-plane-chip" hidden>' +
      '<i class="ph ph-square-half" aria-hidden="true"></i><span id="mdSketchPlaneLabel"></span><b>' + t("changePlane") + '</b></button>' +
    '<div class="md-context-actions" id="mdContextActions" hidden>' +
    '<button type="button" id="mdAcceptCommand" class="accept" aria-label="' + t("finishCommand") + '" title="' + t("finishCommand") + '">' + cadIcon("check") + '</button>' +
    '<button type="button" id="mdCancelCommand" class="cancel" aria-label="' + t("cancelCommand") + '" title="' + t("cancelCommand") + '">' + cadIcon("cross") + '</button>' +
    '<span id="mdActiveCommand"></span></div>' +
    '<section class="md-section-controls" id="mdSectionControls" aria-label="' + t("sectionView") + '" hidden>' +
      '<div class="md-section-head"><b>' + t("sectionView") + '</b><button type="button" id="mdSectionClose" aria-label="' + t("sectionClose") + '" title="' + t("sectionClose") + '"><i class="ph ph-x"></i></button></div>' +
      '<div class="md-section-axis" role="group" aria-label="' + t("sectionAxis") + '"><button type="button" data-section-axis="x" class="on">X</button><button type="button" data-section-axis="y">Y</button><button type="button" data-section-axis="z">Z</button></div>' +
      '<label><span>' + t("sectionOffset") + '</span><input id="mdSectionOffset" type="range" min="-200" max="200" step="1" value="0"><output id="mdSectionValue">0 cm</output></label>' +
      '<button type="button" id="mdSectionFlip"><i class="ph ph-arrows-left-right"></i><span>' + t("sectionFlip") + '</span></button>' +
    '</section>' +
    /* Evaluate results that are ANSWERS rather than reports — a measurement,
       a mass, a BOM — live here rather than in #mdReport. #mdReport is
       aria-modal, so reading the number it just produced meant giving up the
       viewport that produced it; you could not orbit the model while reading
       its centre of mass. This card floats over the viewport instead and
       nothing under it stops responding. */
    '<section class="md-eval-card" id="mdEvalCard" aria-live="polite" hidden>' +
      '<div class="md-eval-head"><small id="mdEvalKicker"></small><b id="mdEvalTitle"></b>' +
      '<button type="button" id="mdEvalClose" aria-label="' + t("close") + '" title="' + t("close") + '"><i class="ph ph-x"></i></button></div>' +
      '<div class="md-eval-body" id="mdEvalBody"></div>' +
      '<div class="md-eval-actions" id="mdEvalActions"></div>' +
    '</section>' +
    '</div>' +
    /* The bottom-centre shelf, same reason: the hint, the face prompt and the
       profile offer are all "a sentence under the model", and all three used to
       be centred at their own `bottom`, so the offer sat squarely on the hint. */
    '<div class="md-rail md-rail-bottom" id="mdRailBottom">' +
    '<div class="md-profile-offer" id="mdProfileOffer" hidden></div>' +
    /* Non-modal on purpose: the viewport underneath it is the control. A modal
       plane dialog is what this bar replaces. */
    '<div class="md-face-prompt" id="mdFacePrompt" hidden>' +
    '<i class="ph ph-cursor-click"></i>' +
    '<span><b>' + t("pickFaceTitle") + '</b><small>' + t("pickFaceBody") + '</small></span>' +
    '<button type="button" id="mdFacePromptPlanes">' + t("pickFacePlanes") + '</button>' +
    '<button type="button" id="mdFacePromptCancel" class="cancel" aria-label="' + t("pickFaceCancel") + '" title="' + t("pickFaceCancel") + '"><i class="ph ph-x"></i></button>' +
    '</div>' +
    '<div class="md-hint" id="mdHint"></div>' +
    '</div>' +
    '<label id="mdPolygonControls" class="md-polygon-controls" hidden>' + t("dyn_sides") +
    ' <select id="mdPolygonSides" aria-label="' + t("dyn_sides") + '">' +
    Array.from({length:22},function(_,i){return '<option value="'+(i+3)+'">'+(i+3)+'</option>';}).join('') + '</select></label>' +
    '<button type="button" id="mdHintHelp" class="md-hint-help" aria-label="' + t("hint3d") + '" title="' + t("hint3d") + '"><i class="ph ph-question"></i></button>' +
    '<div id="mdEmptyStart" class="md-empty-start" role="group" aria-label="' + t("wfChoosePlane") + '" hidden>' +
      ["top","front","right"].map(function(plane){return '<button type="button" data-origin-plane="'+plane+'">'+t("view_"+plane)+'</button>';}).join("") + '</div>' +
    '<div class="md-context-toolbar" id="mdContextToolbar" hidden></div>' +
    '<div class="md-entity-nav" id="mdEntityNav" hidden></div>' +
    '<div class="md-feature-nav" id="mdFeatureNav" hidden></div>' +
    /* The selection row: filters at the start, breadcrumb at the end, one flex
       row so they compete for width instead of overlapping at narrow sizes —
       and so the breadcrumb stops printing itself over the status line. */
    '<div class="md-rail md-rail-row" id="mdRailRow">' +
    '<div class="md-sel-filters" id="mdSelFilters" role="toolbar" aria-label="' + t("selFilter") + '">' +
      '<button type="button" data-selfilter="all" class="on">' + t("selFilterAll") + '</button>' +
      '<button type="button" data-selfilter="face">' + t("selFilterFace") + '</button>' +
      '<button type="button" data-selfilter="edge">' + t("selFilterEdge") + '</button>' +
      '<button type="button" data-selfilter="vertex">' + t("selFilterVertex") + '</button>' +
      '<button type="button" data-selfilter="sketch">' + t("selFilterSketch") + '</button>' +
      '<button type="button" data-selfilter="body">' + t("selFilterBody") + '</button>' +
    '</div>' +
    '<div class="md-breadcrumb" id="mdBreadcrumb"></div>' +
    '</div>' +
    '<div class="md-assembly-move-mode" id="mdAssemblyMoveMode" role="toolbar" aria-label="' + t("assemblyMoveMode") + '">' +
      '<span>' + t("assemblyMoveMode") + '</span>' +
      '<button type="button" data-assembly-move="free" class="on" aria-pressed="true" title="' + t("assemblyMoveFree") + '"><i class="ph ph-arrows-out-cardinal"></i><b>' + t("assemblyMoveFree") + '</b></button>' +
      '<button type="button" data-assembly-move="x" aria-pressed="false" title="' + t("assemblyMoveX") + '">X</button>' +
      '<button type="button" data-assembly-move="y" aria-pressed="false" title="' + t("assemblyMoveY") + '">Y</button>' +
      '<button type="button" data-assembly-move="z" aria-pressed="false" title="' + t("assemblyMoveZ") + '">Z</button>' +
    '</div>' +
    '<div class="md-shortcut-bar" id="mdShortcutBar" hidden></div>' +
    '<div class="md-view-selector" id="mdViewSelector" hidden></div>' +
    '<div class="md-context-menu" id="mdContextMenu" hidden></div>' +
    '<div class="md-pick-cycle" id="mdPickCycle" hidden></div>' +
    '<div class="md-marquee" id="mdMarquee" hidden></div>' +
    '<div class="md-paint-toolbar" id="mdPaintToolbar" hidden role="toolbar" aria-label="' + t("tool_paint") + '">' +
      '<div class="md-paint-mode-toggle" role="group" aria-label="Paint mode">' +
        '<button type="button" data-paint-mode="face" class="on" title="' + t("paintModeFace") + '">' + t("paintModeFace") + '</button>' +
        '<button type="button" data-paint-mode="body" title="' + t("paintModeBody") + '">' + t("paintModeBody") + '</button>' +
      '</div>' +
      '<span class="md-paint-sep"></span>' +
      '<div class="md-paint-swatches" id="mdPaintSwatches"></div>' +
      '<label class="md-paint-custom" title="' + t("color") + '">' +
        '<input type="color" id="mdPaintColorInput" value="#3b82f6">' +
      '</label>' +
      '<span class="md-paint-sep"></span>' +
      '<button type="button" id="mdPaintEyedropper" class="md-paint-tool-btn" title="' + t("paintEyedropper") + '">' +
        '<i class="ph ph-eyedropper"></i>' +
      '</button>' +
      '<button type="button" id="mdPaintClear" class="md-paint-tool-btn" title="' + t("clearPaint") + '">' +
        '<i class="ph ph-arrow-counter-clockwise"></i>' +
      '</button>' +
    '</div>' +
    '<div class="md-notes-toolbar" id="mdNotesToolbar" hidden role="toolbar" aria-label="' + t("tool_note") + '">' +
      '<div class="md-notes-mode-toggle" role="group" aria-label="Note mode">' +
        '<button type="button" data-note-mode="callout" class="on" title="' + t("noteModeCallout") + '"><i class="ph ph-chat-circle-text"></i><span>' + t("noteModeCallout") + '</span></button>' +
        '<button type="button" data-note-mode="markup" title="' + t("noteModeMarkup") + '"><i class="ph ph-pencil-simple-line"></i><span>' + t("noteModeMarkup") + '</span></button>' +
        '<button type="button" data-note-mode="eraser" title="' + t("noteModeEraser") + '"><i class="ph ph-eraser"></i><span>' + t("noteModeEraser") + '</span></button>' +
      '</div>' +
      '<span class="md-paint-sep"></span>' +
      '<div class="md-markup-colors" id="mdMarkupColors">' +
        '<button type="button" data-markup-color="#ef4444" class="on" style="background:#ef4444" title="Red"></button>' +
        '<button type="button" data-markup-color="#eab308" style="background:#eab308" title="Yellow"></button>' +
        '<button type="button" data-markup-color="#22c55e" style="background:#22c55e" title="Green"></button>' +
        '<button type="button" data-markup-color="#3b82f6" style="background:#3b82f6" title="Blue"></button>' +
        '<button type="button" data-markup-color="#ffffff" style="background:#ffffff" title="White"></button>' +
      '</div>' +
      '<span class="md-paint-sep"></span>' +
      '<button type="button" id="mdToggleNotesVisibility" class="md-paint-tool-btn on" title="' + t("toggleNotes") + '">' +
        '<i class="ph ph-eye"></i>' +
      '</button>' +
      '<button type="button" id="mdClearMarkupsBtn" class="md-paint-tool-btn" title="' + t("clearMarkups") + '">' +
        '<i class="ph ph-trash"></i>' +
      '</button>' +
    '</div>' +
    '<div class="md-note-editor" id="mdNoteEditor" hidden role="dialog" aria-modal="true" aria-label="' + t("noteEditorTitle") + '">' +
      '<div class="md-note-editor-head">' +
        '<i class="ph ph-chat-circle-text"></i>' +
        '<b id="mdNoteEditorTitle">' + t("noteEditorTitle") + '</b>' +
        '<button type="button" id="mdNoteEditorClose" aria-label="' + t("close") + '"><i class="ph ph-x"></i></button>' +
      '</div>' +
      '<div class="md-note-editor-cats" id="mdNoteEditorCats"></div>' +
      '<textarea id="mdNoteEditorText" rows="3" placeholder="' + t("notePlaceholder") + '"></textarea>' +
      '<div class="md-note-editor-actions">' +
        '<button type="button" id="mdNoteEditorDelete" class="danger" title="' + t("noteDelete") + '"><i class="ph ph-trash"></i></button>' +
        '<button type="button" id="mdNoteEditorDone" class="accept"><i class="ph ph-check"></i><span>' + t("noteDone") + '</span></button>' +
      '</div>' +
    '</div>' +
    '<div class="md-gesture-wheel" id="mdGestureWheel" hidden>' +
      '<span data-dir="up" data-cmd="extrude">' + cadIcon("extrude") + '<span>' + t("opExtrude") + '</span></span>' +
      '<span data-dir="right" data-cmd="normalTo">' + cadIcon("normalTo") + '<span>' + t("normalTo") + '</span></span>' +
      '<span data-dir="down" data-cmd="dim">' + cadIcon("dim") + '<span>' + t("tool_dim") + '</span></span>' +
      '<span data-dir="left" data-cmd="wall">' + cadIcon("wall") + '<span>' + t("cap_wall") + '</span></span>' +
    '</div>' +
    commandBarHTML("model") +
    '<div class="md-status" id="mdStatus" role="status"></div>' +
    "</div>" +

    /* ---- right: the model as it will look, and the selected part ---- */
    '<div class="md-panel md-right" id="mdRightPanel">' +
    '<div id="mdRightResizer" class="md-resizer" role="separator" aria-orientation="vertical" aria-label="Resize inspector" tabindex="0"></div>' +
    '<div class="md-prev-wrap">' +
    '<canvas id="mdPrev"></canvas>' +
    '<svg id="mdNotesSvg" class="md-notes-svg"></svg>' +
    '<canvas id="mdMarkupCanvas" class="md-markup-canvas"></canvas>' +
    '<div id="mdNotesHost" class="md-notes-host"></div>' +
    '<label class="md-context-toggle"><input type="checkbox" id="mdContextBtn"><span>' + t("contextRoom") + "</span></label>" +
    "</div>" +
    // Round-6: while the middle shows the model, the column shows the sketch
    '<button type="button" class="md-sketch-thumb" id="mdSketchThumb" hidden title="' + t("sketchThumbTip") + '"><canvas></canvas><span class="md-view-chip"></span></button>' +
    tabstrip("R", [
      tab("sketch", "ph-compass-tool", t("tabSketchShort"), t("tabSketch"), '<span class="md-badge" id="mdDofBadge"></span>'),
      tab("shape", "ph-ruler", t("tabShapeShort"), t("tabShape")),
      tab("look", "ph-paint-brush", t("tabLookShort"), t("tabLook")),
      tab("ops", "ph-magic-wand", t("tabOpsShort"), t("tabOps")),
      tab("hist", "ph-clock-counter-clockwise", t("tabHistShort"), t("tabHist")),
    ]) +
    '<div class="md-strip-meta"><span class="md-hsel" id="mdSelName"></span></div>' +
    '<div class="md-tabs" data-side="R">' +
    '<div class="md-pane" data-pane="sketch"><div id="mdSketch"></div></div>' +
    '<div class="md-pane on" data-pane="shape"><div id="mdInsp"></div></div>' +
    '<div class="md-pane" data-pane="look"><div id="mdLook"></div></div>' +
    '<div class="md-pane" data-pane="ops"><div id="mdOps"></div></div>' +
    '<div class="md-pane" data-pane="hist"><div id="mdHist"><section id="mdHistDesign"></section><section id="mdHistSession"></section></div></div>' +
    "</div></div></div>" +
    '<div class="md-command-search" id="mdCommandSearch" hidden role="dialog" aria-modal="true" aria-label="' + t("cmdSearch") + '">' +
    '<div class="md-command-search-card"><div class="md-command-search-input"><i class="ph ph-magnifying-glass"></i>' +
    '<input id="mdCommandSearchInput" type="search" autocomplete="off" placeholder="' + t("cmdSearchHint") + '" aria-autocomplete="list" aria-controls="mdCommandResults" role="combobox" aria-expanded="true"><button type="button" id="mdCommandSearchClose" aria-label="' + t("close") + '"><i class="ph ph-x"></i></button></div>' +
    '<div id="mdCommandResults" class="md-command-results" role="listbox"></div></div></div>' +
    '<div class="md-reference-picker" id="mdReferencePicker" hidden>' +
      '<section role="dialog" aria-modal="true" aria-labelledby="mdReferenceTitle">' +
        '<header><div><small>' + t("newSketchKicker") + '</small><h3 id="mdReferenceTitle">' + t("referencePickerTitle") + '</h3></div><button type="button" data-reference-cancel aria-label="' + t("cancelCommand") + '"><i class="ph ph-x"></i></button></header>' +
        '<p>' + t("referencePickerBody") + '</p>' +
        '<div class="md-reference-options" id="mdReferenceOptions"></div>' +
      '</section></div>' +
    '<div class="md-reference-picker md-report" id="mdReport" hidden>' +
      '<section role="dialog" aria-modal="true" aria-labelledby="mdReportTitle">' +
        '<header><div><small id="mdReportKicker"></small><h3 id="mdReportTitle"></h3></div><button type="button" data-report-close aria-label="' + t("close") + '"><i class="ph ph-x"></i></button></header>' +
        '<div class="md-pick-toolbar" id="mdPickToolbar" hidden><button type="button" id="mdPickBack"></button><input id="mdPickSearch" type="search" autocomplete="off"></div>' +
        '<pre id="mdReportBody" tabindex="0"></pre>' +
        '<div class="md-reference-options" id="mdPickList" hidden></div>' +
      '</section></div>' +
    /* ---- visual start screen: a gallery of starting points, not a blank
       canvas and a ribbon of strangers. Rendered by renderWelcomeCards(). */
    '<div class="md-welcome" id="mdWelcome" hidden>' +
      '<section class="md-welcome-card" role="dialog" aria-modal="true" aria-labelledby="mdWelcomeTitle">' +
        '<button type="button" id="mdWelcomeClose" class="md-welcome-close" aria-label="' + t("close") + '" title="' + t("close") + '"><i class="ph ph-x"></i></button>' +
        '<header class="md-welcome-head"><small>' + t("welcomeKicker") + '</small><h2 id="mdWelcomeTitle">' + t("welcomeTitle") + '</h2><p>' + t("welcomeSub") + '</p></header>' +
        '<div class="md-welcome-scroll">' +
          '<h4 class="md-welcome-group"><i class="ph ph-rocket-launch"></i>' + t("welcomeStartGroup") + '</h4>' +
          '<div class="md-welcome-grid" id="mdWelcomeStart"></div>' +
          '<h4 class="md-welcome-group"><i class="ph ph-graduation-cap"></i>' + t("welcomeGuidesGroup") + '</h4>' +
          '<div class="md-welcome-grid" id="mdWelcomeGuides"></div>' +
        '</div>' +
        '<footer class="md-welcome-foot">' +
          '<label class="md-welcome-dontshow"><input type="checkbox" id="mdWelcomeNever"><span>' + t("welcomeDontShow") + '</span></label>' +
          '<span class="md-welcome-hint"><i class="ph ph-sliders-horizontal"></i>' + t("welcomeSettingsHint") + '</span>' +
        '</footer>' +
      '</section>' +
    '</div>' +
    '<div class="md-tour-layer" id="mdTour" hidden>' +
      '<section class="md-tour-card" role="dialog" aria-modal="false" aria-labelledby="mdTourTitle">' +
        '<div class="md-tour-head" id="mdTourHead" title="' + t("guideMoveCard") + '"><div><span id="mdTourCount"></span><h3 id="mdTourTitle"></h3></div>' +
        '<div class="md-tour-head-actions">' +
          '<button type="button" id="mdTourSpeak" aria-label="' + t("speakReadAloud") + '" title="' + t("speakReadAloud") + '"><i class="ph ph-speaker-high"></i></button>' +
          /* A phone card is 8px from both edges: there is nowhere to drag it to
             when a step asks you to draw on the canvas underneath it. Collapse
             leaves the step title and the actions, and nothing else. */
          '<button type="button" id="mdTourMin" aria-label="' + t("guideCollapse") + '" title="' + t("guideCollapse") + '"><i class="ph ph-caret-down"></i></button>' +
          '<button type="button" id="mdTourClose" aria-label="' + t("guideClose") + '" title="' + t("guideClose") + '"><i class="ph ph-x"></i></button>' +
        '</div></div>' +
        '<div class="md-tour-progress" aria-hidden="true"><span id="mdTourProgress"></span></div>' +
        '<p id="mdTourBody"></p><div class="md-tour-demo" id="mdTourDemo" hidden aria-hidden="true"></div><div class="md-tour-tracks" id="mdTourTracks" hidden></div>' +
        '<label class="md-tour-slider" id="mdTourSlider" hidden><span>' + t("guideAutoSlider") + '</span><output id="mdTourSliderValue"></output><input id="mdTourRange" type="range" min="0" value="0"></label>' +
        '<div class="md-tour-tip"><i class="ph ph-lightbulb"></i><span id="mdTourTip"></span></div>' +
        '<div class="md-tour-status" id="mdTourStatus" role="status"></div>' +
        '<div class="md-tour-actions"><button type="button" id="mdTourBack"><i class="ph ph-arrow-right"></i>' + t("guideBack") + '</button>' +
        '<button type="button" id="mdTourRestart" class="md-tour-restart" aria-label="' + t("guideRestart") + '" title="' + t("guideRestart") + '"><i class="ph ph-arrow-counter-clockwise"></i><span>' + t("guideRestart") + '</span></button>' +
        '<button type="button" id="mdTourSkip" class="md-tour-skip">' + t("guideSkip") + '</button>' +
        '<button type="button" id="mdTourKeep" class="md-tour-skip" title="' + t("guideKeepResultTip") + '" hidden>' + t("guideKeepResult") + '</button>' +
        '<button type="button" id="mdTourNext" class="btn-accent">' + t("guideNext") + '<i class="ph ph-arrow-left"></i></button></div>' +
      '</section></div>';
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

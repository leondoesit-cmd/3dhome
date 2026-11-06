/* The CAD editor's welcome screen, next-step coach and guided tour, split out
   of js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { diagnosticHelp, recommendedDiagnostic } from "../core/diagnostic_help.js";
import { closeModelerSheet, showModelerSheet, syncModelerMobile } from "../modeler_mobile.js";
import { t, tf } from "../modeler_strings.js";
import { welcomeGlyph } from "../modeler_welcome_glyphs.js";
import { defaultSketchPlane } from "../modeler_workflow.js";
import { diagnosticActionLabel, diagnosticMessage, runDiagnosticAction } from "../modeler/component_mates.js";
import { documentDirty, pushUndo } from "../modeler/document_history.js";
import { runInterferenceCheck } from "../modeler/document_outputs.js";
import { saveCurrentDocument, sketchOpenPathReadiness } from "../modeler/document_save.js";
import { closedSketchProfile, flash } from "../modeler/drawing_sheet.js";
import { activeParts, loadLib } from "../modeler/library_store.js";
import { runCommand } from "../modeler/part_commands.js";
import { displayedCoreIssues, modelRebuildPending } from "../modeler/sketch_entities.js";
import { assemblyTourSteps, dreidelTourSteps, flowerTourSteps, gearTourSteps, mobileTourSteps, patternTourSteps, prepareTourStep, renderTour, renderTourMode, restoreAutomaticTourOrigin, screwTourSteps, seekAutomaticTour, selectTourTrack, sketchTourSteps, solidworksCubeTourSteps, startTour, studBallTourSteps, tourStepDone, tourSteps } from "../modeler/sketch_guide.js";
import { assemblyWorkflowState, beginSketchWorkflow, chooseSketchReference, currentWorkflowStep, finishSketchWorkflow, isCanonicalAuthoring, referenceLabel, setCommandTab, setTab, setTool, showReferencePicker } from "../modeler/sketch_workflow.js";
import { insertAssemblyComponent } from "../modeler/tree_assembly.js";
import { ensureSketch } from "../sketch_solver.js";
import { stopSpeaking } from "../speech.js";
import {
  E, WELCOME_STARTS, openParametricFeature, refreshAll, requestDocumentType,
  root,
} from "../modeler.js";

/* ================= visual start screen =================
   Opening the editor on a fresh model used to drop you onto an empty canvas
   facing a full ribbon. The start screen makes the first move a visual
   choice: a blank document, a ready shape, or one of the guided projects
   (which are the interactive tour tracks under a friendlier roof). The
   "don't show again" checkbox and the Settings toggle write the same pref. */
function welcomeGuideCards() {
  var mobile = { track:"mobile", art:"sketch", title:"guideMobileTrack", desc:"guideMobileTrackDesc", steps:mobileTourSteps, phonePrimary:true };
  var sketch = { track:"sketch", art:"sketch", title:"guideSketchTrack", desc:"guideSketchTrackDesc", steps:sketchTourSteps, phonePrimary:true };
  var rest = [
    { track:"solidworks", art:"cube", title:"guideSolidworksTrack", desc:"guideSolidworksTrackDesc", steps:solidworksCubeTourSteps },
    { track:"flower", art:"flower", title:"guideFlowerTrack", desc:"guideFlowerTrackDesc", steps:flowerTourSteps },
    { track:"assembly", art:"mates", title:"guideAssemblyTrack", desc:"guideAssemblyTrackDesc", steps:assemblyTourSteps },
    { track:"screw", art:"screw", title:"guideScrewTrack", desc:"guideScrewTrackDesc", steps:screwTourSteps },
    { track:"gear", art:"gear", title:"guideGearTrack", desc:"guideGearTrackDesc", steps:gearTourSteps },
    { track:"studball", art:"studball", title:"guideStudBallTrack", desc:"guideStudBallTrackDesc", steps:studBallTourSteps },
    { track:"dreidel", art:"dreidel", title:"guideDreidelTrack", desc:"guideDreidelTrackDesc", steps:dreidelTourSteps },
    { track:"pattern", art:"pattern", title:"guidePatternTrack", desc:"guidePatternTrackDesc", steps:patternTourSteps },
  ];
  if (document.body.classList.contains("compact-nav")) return [mobile, sketch].concat(rest);
  return [sketch].concat(rest).concat([mobile]);
}

function renderWelcomeCards() {
  if (!root) return;
  var start = root.querySelector("#mdWelcomeStart"), guides = root.querySelector("#mdWelcomeGuides");
  // Whatever survives still renders: half a start screen beats a thrown error
  // on the way into the editor.
  if (!start && !guides) return;
  if (start) start.innerHTML = WELCOME_STARTS.map(function (card) {
    return '<button type="button" data-welcome-start="' + card.id + '" class="md-welcome-tile">' +
      '<span class="md-welcome-art art-' + card.art + '" aria-hidden="true">' + welcomeGlyph(card.art) + '</span>' +
      '<span class="md-welcome-meta"><b>' + t(card.title) + '</b><small>' + t(card.desc) + '</small></span>' +
    '</button>';
  }).join("");
  if (guides) guides.innerHTML = welcomeGuideCards().map(function (card) {
    return '<button type="button" data-welcome-guide="' + card.track + '" class="md-welcome-tile">' +
      '<span class="md-welcome-art art-' + card.art + '" aria-hidden="true">' + welcomeGlyph(card.art) + '<em>' + t("welcomeGuided") + '</em></span>' +
      '<span class="md-welcome-meta"><span class="md-welcome-titlerow"><b>' + t(card.title) + '</b>' +
      '<span class="md-welcome-badge">' + card.steps().length + ' ' + t("welcomeSteps") + '</span></span>' +
      '<small>' + t(card.desc) + '</small></span>' +
    '</button>';
  }).join("");
  if (start) start.querySelectorAll("[data-welcome-start]").forEach(function (tile) {
    tile.addEventListener("click", function () {
      var card = WELCOME_STARTS.find(function (c) { return c.id === tile.getAttribute("data-welcome-start"); });
      closeWelcome();
      if (!card || card.id === "blank") { startBlankPart(); return; }
      if (card.id === "assembly") { startBlankAssembly(); return; }
      if (card.command) runCommand(card.command);
    });
  });
  if (guides) guides.querySelectorAll("[data-welcome-guide]").forEach(function (tile) {
    tile.addEventListener("click", function () {
      var track = tile.getAttribute("data-welcome-guide");
      closeWelcome();
      startTour();
      selectTourTrack(track, "interactive");
    });
  });
  layoutWelcomeCompact();
}
function layoutWelcomeCompact() {
  var start = root.querySelector("#mdWelcomeStart"),
    guides = root.querySelector("#mdWelcomeGuides"),
    scroll = root.querySelector(".md-welcome-scroll");
  if (!start || !guides || !scroll) return;
  var extra = scroll.querySelector(".md-welcome-extra");
  if (extra) {
    /* The compact layout borrows two nodes that belong to the dialog itself —
       the guides heading and the guides grid — into a <details> it builds. It
       used to drop that wrapper with them still inside, which deleted them from
       the document: the next open in a wider window then rendered a start grid
       and nothing else, and the one after that threw on a grid that was no
       longer there, taking the editor down with it. Hand them back first; the
       wrapper then only takes what this function made. */
    var borrowedHeading = extra.querySelector(".md-welcome-group");
    if (borrowedHeading) scroll.appendChild(borrowedHeading);
    var borrowedGuides = extra.querySelector("#mdWelcomeGuides");
    if (borrowedGuides) scroll.appendChild(borrowedGuides);
    extra.remove();
  }
  if (!document.body.classList.contains("compact-nav")) return;
  /* Touch CAD, Blank part, and Blank assembly stay on the primary list so
     creating a document is one tap. Ready shapes and "Open editor" sit in
     More — they are optional, not the first move. */
  var guideTile = document.createElement("button");
  guideTile.type = "button";
  guideTile.className = "md-welcome-tile md-welcome-guidetile";
  guideTile.innerHTML =
    '<span class="md-welcome-art art-sketch" aria-hidden="true"><i class="ph ph-graduation-cap"></i></span>' +
    '<span class="md-welcome-meta"><b>' + t("guideMobileTrack") + "</b><small>" + t("guideMobileTrackDesc") + "</small></span>";
  guideTile.addEventListener("click", function () {
    closeWelcome();
    startTour();
    selectTourTrack("mobile", "interactive");
  });
  start.insertBefore(guideTile, start.firstChild);
  var details = document.createElement("details");
  details.className = "md-welcome-extra";
  var sum = document.createElement("summary");
  sum.textContent = t("welcomeMoreStarts");
  details.appendChild(sum);
  var wrap = document.createElement("div");
  wrap.className = "md-welcome-grid";
  Array.prototype.slice.call(start.querySelectorAll("[data-welcome-start]")).forEach(function (el) {
    var id = el.getAttribute("data-welcome-start");
    if (id === "blank" || id === "assembly") return;
    wrap.appendChild(el);
  });
  var continueTile = document.createElement("button");
  continueTile.type = "button";
  continueTile.className = "md-welcome-tile md-welcome-continue";
  continueTile.setAttribute("data-welcome-start", "continue");
  continueTile.innerHTML =
    '<span class="md-welcome-art art-blank" aria-hidden="true"><i class="ph ph-arrow-right"></i></span>' +
    '<span class="md-welcome-meta"><b>' + t("welcomeContinue") + "</b><small>" + t("welcomeContinueDesc") + "</small></span>";
  continueTile.addEventListener("click", closeWelcome);
  wrap.appendChild(continueTile);
  var groups = scroll.querySelectorAll(".md-welcome-group");
  var guideHead = groups.length > 1 ? groups[1] : null;
  if (guideHead) wrap.appendChild(guideHead);
  wrap.appendChild(guides);
  details.appendChild(wrap);
  scroll.appendChild(details);
}
function openWelcome() {
  var layer = root && root.querySelector("#mdWelcome");
  if (!layer || E.welcomeOpen) return;
  E.welcomeOpen = true;
  renderWelcomeCards();
  var never = root.querySelector("#mdWelcomeNever");
  if (never) never.checked = !E.welcomeOnOpen;
  layer.hidden = false;
  root.classList.add("md-welcome-open");
  syncCoach();
  // keyboard users land on the default starting point; Enter/Space activates it
  var first = layer.querySelector("#mdWelcomeStart .md-welcome-tile");
  if (first) first.focus({ preventScroll: true });
}
function closeWelcome() {
  var layer = root && root.querySelector("#mdWelcome");
  E.welcomeOpen = false;
  if (layer) layer.hidden = true;
  if (root) root.classList.remove("md-welcome-open");
  syncCoach();
}

/* ================= next-step coach =================
   Semi-guided means the editor keeps suggesting the single next action that
   fits the document state — and offers to do it — without ever blocking a
   user who already knows where they are going. */
function coachRebuildSuggestion(rebuildIssue) {
  // Exact computation may still recover persistent selections by descriptor.
  // Do not offer a repair action against provisional topology diagnostics.
  if (modelRebuildPending()) return null;
  var help = diagnosticHelp(rebuildIssue, E.lang);
  return {
    icon: rebuildIssue.severity === "error" ? "ph-warning-octagon" : "ph-warning",
    phrase: diagnosticMessage(rebuildIssue) + " — " + help.next,
    act: diagnosticActionLabel(help.action, rebuildIssue),
    target: "#mdDiagnostics .md-diagnostic-primary, #mdDiagnostics",
    rebuild: true,
    run: function () { runDiagnosticAction(rebuildIssue); },
  };
}
function startBlankPart() {
  if (E.docType !== "part") return requestDocumentType("part",startBlankPart);
  setTab("parts");
  startSketchOnDefaultPlane("srect", "plane:top");
}
function startBlankAssembly() {
  requestDocumentType("assembly",revealAssemblyTree);
}
function startSketchOnDefaultPlane(preferredTool, explicitReferenceId) {
  var plane = defaultSketchPlane(E.def && E.def.references, explicitReferenceId || E.lastSketchReferenceId);
  if (!plane) { showReferencePicker(preferredTool); return; }
  chooseSketchReference(plane, preferredTool || "srect");
  if (document.body.classList.contains("compact-nav")) closeModelerSheet();
}
function revealAssemblyTree() {
  setTab("parts");
  if (document.body.classList.contains("compact-nav")) showModelerSheet("tree");
}
function insertSuggestedComponent() {
  revealAssemblyTree();
  var models = loadLib();
  if (!models.length) {
    startTour();
    selectTourTrack("assembly", "interactive");
    return;
  }
  var select = root && root.querySelector("#mdParts .md-insert-component select");
  insertAssemblyComponent((select && select.value) || models[0].key);
}
function groundSuggestedComponent() {
  var first = ((E.assembly && E.assembly.components) || [])[0];
  if (!first) { revealAssemblyTree(); return; }
  E.componentSel = [first];
  E.sel = first;
  if (!first.grounded) {
    pushUndo(t("grounded"));
    first.grounded = true;
    refreshAll();
    return;
  }
  setTab("look");
}
function coachOpenMates() {
  setCommandTab("assembly");
  setTab("ops");
  if (document.body.classList.contains("compact-nav")) showModelerSheet("props");
  flash(t("smartMateHint"));
}
function coachAssemblySuggestion() {
  var state = assemblyWorkflowState();
  var phase = state.phase;
  if (phase === "empty-library")
    return { icon:"ph-graduation-cap", text:"coachStepAssemblyGuide", act:"runAssemblyGuide",
      target:'[data-tab="parts"]',
      run:function(){ revealAssemblyTree(); startTour(); selectTourTrack("assembly", "interactive"); } };
  if (phase === "insert-first")
    return { icon:"ph-cube", text:"coachStepComponent", act:"coachActComponent",
      target:".md-insert-component, [data-tab=\"parts\"]", run:insertSuggestedComponent };
  if (phase === "insert-second")
    return { icon:"ph-plus", text:"coachStepComponentSecond", act:"coachActComponentSecond",
      target:".md-insert-component, [data-tab=\"parts\"]", run:insertSuggestedComponent };
  if (phase === "ground")
    return { icon:"ph-anchor", text:"coachStepGround", act:"coachActGround",
      target:'[data-tab="look"]', run:groundSuggestedComponent };
  if (phase === "mate")
    return { icon:"ph-link", text:"coachStepMate", act:"coachActMate",
      target:'[data-tab="ops"], [data-mate="alignX"]', run:coachOpenMates };
  if (phase === "check")
    return { icon:"ph-intersect", text:"coachStepCheck", act:"coachActCheck",
      target:'[data-command="interference"]',
      run:function(){ setCommandTab("evaluate"); runInterferenceCheck(); } };
  if (phase === "save")
    return { icon:"ph-floppy-disk", text:"coachStepSave", act:"coachActSave", command:"save", target:"#mdSave",
      run:function(){ saveCurrentDocument(); } };
  return null;
}
function coachSuggestion() {
  if (E.docType === "assembly") return coachAssemblySuggestion();
  if (!isCanonicalAuthoring()) return null;
  var step = currentWorkflowStep(), sketch = ensureSketch(E.def);
  var rebuildIssue = recommendedDiagnostic(displayedCoreIssues());
  var liveAuthoring = step === "reference" || step === "sketch" || step === "feature";
  if (rebuildIssue && !liveAuthoring) return coachRebuildSuggestion(rebuildIssue);
  if (step === "context" || step === "reference") {
    var compact = document.body.classList.contains("compact-nav");
    var coachPlane=defaultSketchPlane(E.def && E.def.references,E.lastSketchReferenceId);
    return { icon:"ph-rectangle", text: compact ? "coachStepSketchMobile" : "coachStepSketch",
      phrase:coachPlane ? tf("coachStepSketchPlane",{plane:referenceLabel(coachPlane)}) : t("coachStepPlane"),
      act: compact ? "coachActSketchMobile" : "coachActSketch", command:"srect",
      target: compact ? '[data-mdnav="cmd"]' : '[data-command="newsketch"], .md-tree-create-sketch',
      run:function(){ startSketchOnDefaultPlane("srect",coachPlane && coachPlane.id); } };
  }
  if (step === "sketch") {
    if (!(sketch.entities || []).length)
      return { icon:"ph-rectangle", text:"coachStepDraw", act:"coachActDraw", command:"srect", target:'[data-command="srect"]',
        run:function(){ setCommandTab("sketch"); setTool("srect"); } };
    if (!closedSketchProfile() && sketchOpenPathReadiness(sketch))
      return { icon:"ph-path", text:"coachStepOpenPath", act:"coachActFinishSketch", target:'[data-command="finishsketch"]',
        run:function(){ finishSketchWorkflow(); } };
    if (!closedSketchProfile())
      return { icon:"ph-line-segment", text:"coachStepClose", act:"coachActClose", target:null,
        run:function(){ setCommandTab("sketch"); setTool("wall"); } };
    return { icon:"ph-check-circle", text:"coachStepFinishSketch", act:"coachActFinishSketch", target:'[data-command="finishsketch"]',
      run:function(){ finishSketchWorkflow(); } };
  }
  if (step === "feature") {
    if (E.authoring && E.authoring.featureType) return null;
    return { icon:"ph-cube", text:"coachStepExtrude", act:"coachActExtrude", command:"extrude", target:'[data-command="extrude"]',
      run:function(){ setCommandTab("features"); openParametricFeature("extrude"); } };
  }
  if (rebuildIssue) return coachRebuildSuggestion(rebuildIssue);
  if (documentDirty())
    return { icon:"ph-floppy-disk", text:"coachStepSave", act:"coachActSave", command:"save", target:"#mdSave",
      run:function(){ saveCurrentDocument(); } };
  if (activeParts(E.def).length)
    return { icon:"ph-pencil-line", text:"coachStepAddSketch", act:"coachActAddSketch",
      target:'[data-command="newsketch"]',
      run:function(){ beginSketchWorkflow(null, { forceNew:true }); } };
  return null;
}
function clearCoachTarget() {
  if (!root) return;
  root.querySelectorAll(".md-coach-target").forEach(function (node) { node.classList.remove("md-coach-target"); });
}
/* Ribbon commands are duplicated across desktop and compact layouts. DOM order
   is therefore not enough: the first match can belong to a hidden pane while a
   later copy is the control the user can actually act on. */
export function findVisibleEnabledCoachTarget(scope, selector) {
  if (!scope || !selector) return null;
  var matches = scope.querySelectorAll(selector);
  for (var i = 0; i < matches.length; i++) {
    var node = matches[i];
    if (!node.isConnected || node.matches(":disabled")) continue;
    if (node.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')) continue;
    var style = window.getComputedStyle(node), rect = node.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") continue;
    if (style.pointerEvents === "none" || Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0) continue;
    return node;
  }
  return null;
}
function syncCoach() {
  var bar = root && root.querySelector("#mdCoach");
  if (!bar) return;
  clearCoachTarget();
  E._coachSug = null;
  var show = E.open && E.coachEnabled && !E.coachDismissed && !E.tour.active && !E.welcomeOpen && E.mode !== "drawing";
  var sug = show ? coachSuggestion() : null;
  bar.hidden = !sug;
  bar.classList.toggle("md-coach-fix", !!(sug && sug.rebuild));
  /* The tail below is not the coach's business alone. Returning early when
     there was no tip meant syncEmptyStart() never ran — so the "Start screen"
     chip sat over a fully populated assembly for the rest of the session,
     because the moment it should have stood aside was exactly the moment the
     coach had nothing left to say. */
  if (sug) {
    E._coachSug = sug;
    root.querySelector("#mdCoachIcon").className = "ph md-coach-icon " + sug.icon;
    root.querySelector("#mdCoachLabel").textContent = t(sug.rebuild ? "coachActRebuild" : "coachNext");
    root.querySelector("#mdCoachText").textContent = sug.phrase || t(sug.text);
    var go = root.querySelector("#mdCoachGo");
    go.innerHTML = t(sug.act) + '<i class="ph ph-arrow-right"></i>';
    go.setAttribute("aria-label", t(sug.act));
    var dots = root.querySelector("#mdCoachDots");
    if (E.docType === "assembly") {
      var assemblyState = assemblyWorkflowState();
      var assemblyActive = assemblyState.active;
      dots.hidden = false;
      dots.title = t("coachAssemblyStages");
      dots.innerHTML = [0, 1, 2, 3, 4].map(function (i) {
        return '<span class="' + (i < assemblyActive ? "done" : i === assemblyActive ? "now" : "") + '"></span>';
      }).join("");
    } else if (E.docType === "part" && isCanonicalAuthoring() && !sug.rebuild) {
      var steps = ["context", "reference", "sketch", "feature", "history"], active = steps.indexOf(currentWorkflowStep());
      dots.hidden = false;
      dots.title = t("coachStages");
      dots.innerHTML = steps.map(function (s, i) {
        return '<span class="' + (i < active ? "done" : i === active ? "now" : "") + '"></span>';
      }).join("");
    } else dots.hidden = true;
    if (sug.target) {
      var target = findVisibleEnabledCoachTarget(root, sug.target);
      if (target) target.classList.add("md-coach-target");
    }
  }
  syncEmptyStart();
  syncModelerMobile();
}

/* The start screen is not one-shot: while the document is still empty, a chip
   over the canvas reopens it. Once real geometry exists the chip steps aside. */
function syncEmptyStart() {
  var chip = root && root.querySelector("#mdEmptyStart");
  if (!chip) return;
  var empty = E.def
    && !(E.def.parts || []).some(function (p) { return !p.suppressed; })
    && !((ensureSketch(E.def).entities || []).length)
    && !(E.docType === "assembly" && E.assembly && (E.assembly.components || []).length);
  /* phase!=="model": once a sketch session is open the canvas belongs to the
     drawing — the chip is only for the "empty editor, where do I start" beat */
  var idle = !E.authoring || E.authoring.phase === "model";
  chip.hidden = !(E.open && empty && idle && !E.welcomeOpen && !E.tour.active && E.mode !== "drawing");
}

function goTourStep(delta, skipped) {
  stopSpeaking();
  if (!E.tour.active) return;
  if (!E.tour.track) return;
  if (E.tour.mode==="auto") { if(delta<0&&E.tour.step===0){restoreAutomaticTourOrigin();E.tour.autoOrigin=null;E.tour.mode=null;renderTourMode(E.tour.track);return;}seekAutomaticTour(E.tour.step+delta,delta===1);return; }
  if (delta < 0 && E.tour.step === 0) { renderTourMode(E.tour.track);return; }
  var steps = tourSteps(), step = steps[E.tour.step];
  if (delta > 0 && !skipped && !tourStepDone(step, E.tour.step)) return;
  if (skipped) E.tour.completed[E.tour.step] = true;
  E.tour.step = Math.max(0, Math.min(steps.length - 1, E.tour.step + delta));
  prepareTourStep();
}

function updateTourProgress() {
  if (!E.tour.active || E.tour.preparing) return;
  renderTour();
}

export {
  closeWelcome, coachSuggestion, goTourStep, openWelcome,
  startSketchOnDefaultPlane, syncCoach, updateTourProgress, welcomeGuideCards,
};

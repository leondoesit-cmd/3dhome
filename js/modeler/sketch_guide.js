/* The CAD editor's tutorials: a coach layered over the real editor.
 *
 * Interactive mode: each step says what to do, rings the control on the
 * ribbon (switching to its tab), and watches the document — Next unlocks only
 * once the work is really there. "Show me" performs the step (and any earlier
 * one left undone) for someone who is stuck, so a skipped step never leaves
 * the next one pointing at a model that does not exist.
 *
 * Demo mode: Next performs the step through the editor's own commands and
 * waits for the CAD kernel before the following one may start. Closing a demo
 * puts the original document back unless "Keep this model" was chosen.
 *
 * Tracks live in guide_tracks.js / guide_tracks_more.js; the operations they
 * share in guide_ops.js. */
import { getLang } from "../i18n.js";
import { closeModelerSheet, showModelerSheet } from "../modeler_mobile.js";
import { cloneData } from "../modeler_part_geometry.js";
import { t } from "../modeler_strings.js";
import { welcomeGlyph } from "../modeler_welcome_glyphs.js";
import { setDocumentType } from "../modeler/document_save.js";
import { invalidateInterference, saveAssemblies } from "../modeler/library_assembly_state.js";
import { setMode } from "../modeler/library_io.js";
import { setCommandTab, setTab, setTool, setView } from "../modeler/sketch_workflow.js";
import { closeWelcome, syncCoach } from "../modeler/welcome_coach.js";
import { PRO_CATALOG } from "../pro_catalog.js";
import { bindSpeakButton, stopSpeaking } from "../speech.js";
import { E, H, flash, refreshAll, root } from "../modeler.js";
import { ensurePracticeAssembly, freshDocument, waitForModel } from "./guide_ops.js";
import { firstPartSteps, knobSteps, plateSteps, screwSteps } from "./guide_tracks.js";
import { assemblySteps, mobileTourSteps } from "./guide_tracks_more.js";

/* ---- text ---------------------------------------------------------------- */
function txt(value) {
  if (!value) return "";
  if (typeof value === "string") return t(value);
  return (getLang() === "en" ? value.en : value.he) || value.en || "";
}
var UI = {
  showMe:{ en:"Show me", he:"הראה לי" },
  showMeTip:{ en:"Do this step for me", he:"בצעו את השלב בשבילי" },
  working:{ en:"Working… waiting for the model to rebuild", he:"עובד… ממתין לבניית המודל" },
  demoReady:{ en:"Next performs this step in the editor", he:"\"הבא\" יבצע את השלב בעורך" },
  demoDone:{ en:"Done — the editor did this step", he:"בוצע — העורך ביצע את השלב" },
  play:{ en:"Do it", he:"בצעו" },
  failed:{ en:"That step did not complete. Try it by hand, or Show me again.", he:"השלב לא הושלם. נסו בעצמכם, או \"הראה לי\" שוב." },
  minutes:{ en:"min", he:"דק׳" },
  steps:{ en:"steps", he:"שלבים" },
  cancelled:{ en:"The tutorial needs a new document — kept your current model open.", he:"המדריך צריך מסמך חדש — המודל הנוכחי נשאר פתוח." },
};

/* ---- tracks -------------------------------------------------------------- */
var TRACKS = [
  { track:"first", art:"sketch", doc:"part", minutes:4, steps:firstPartSteps, phonePrimary:true,
    title:{ en:"Your first part", he:"החלק הראשון שלכם" },
    desc:{ en:"Sketch, dimension, fully define and extrude a block.", he:"סקיצה, מידות, הגדרה מלאה ושליפה של בלוק." } },
  { track:"plate", art:"pattern", doc:"part", minutes:5, steps:plateSteps,
    title:{ en:"Plate with holes", he:"פלטה עם חורים" },
    desc:{ en:"Sketch on a face, cut through all, circular pattern.", he:"סקיצה על פאה, חיתוך לכל העובי, תבנית מעגלית." } },
  { track:"knob", art:"dreidel", doc:"part", minutes:4, steps:knobSteps,
    title:{ en:"Revolve a knob", he:"ידית בסיבוב" },
    desc:{ en:"Draw a half profile and revolve it 360°.", he:"ציירו חצי פרופיל וסובבו אותו 360°." } },
  { track:"assembly", art:"mates", doc:"assembly", minutes:4, steps:assemblySteps,
    title:{ en:"Assembly and mates", he:"הרכבה ואילוצים" },
    desc:{ en:"Select, move, mate two components and save.", he:"בחירה, הזזה ואילוץ של שני רכיבים, ושמירה." } },
  { track:"screw", art:"screw", doc:"part", minutes:2, steps:screwSteps,
    title:{ en:"Standard screw", he:"בורג תקני" },
    desc:{ en:"Insert ISO hardware from the Toolbox and check it.", he:"הוספת חומרה לפי ISO מה-Toolbox ובדיקתה." } },
  { track:"mobile", art:"sketch", doc:"part", minutes:3, steps:mobileTourSteps, phonePrimary:true, phoneOnly:true,
    title:"guideMobileTrack", desc:"guideMobileTrackDesc" },
];
function compactNav() { return document.body.classList.contains("compact-nav"); }
/* The welcome screen and the hub list the same tracks. The phone track is
   about the touch layout, so it is offered (first) only there. */
function guideTracks() {
  if (compactNav()) {
    return TRACKS.filter(function (track) { return track.track === "mobile"; })
      .concat(TRACKS.filter(function (track) { return track.track !== "mobile"; }));
  }
  return TRACKS.filter(function (track) { return !track.phoneOnly; });
}
function trackInfo(id) { return TRACKS.find(function (track) { return track.track === id; }) || null; }
function tourSteps() {
  if (!E.tour.track) return [];
  if (!E.tour.steps || E.tour.stepsFor !== E.tour.track) {
    var info = trackInfo(E.tour.track);
    E.tour.steps = info ? info.steps() : [];
    E.tour.stepsFor = E.tour.track;
  }
  return E.tour.steps;
}
function currentStep() { var steps = tourSteps(); return steps[Math.max(0, Math.min(E.tour.step, steps.length - 1))]; }

/* ---- targets --------------------------------------------------------------- */
function shown(node) {
  if (!node || node.closest("[hidden]")) return false;
  var r = node.getBoundingClientRect();
  return r.width > 1 && r.height > 1 && getComputedStyle(node).visibility !== "hidden";
}
function ribbonTabFor(bind) {
  var tabs = PRO_CATALOG.model.tabs;
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i][1].some(function (group) { return group[1].some(function (tool) { return tool.bind === bind; }); })) return i;
  }
  return -1;
}
/* The editor's tools live on the pro ribbon, one tab at a time. A step that
   names a tool by its ribbon binding gets that tab opened and the tool ringed;
   a tool folded into its group's menu rings the fold button instead. On the
   phone (no ribbon) the bottom sheet's command button is the target. */
function resolveTarget(target) {
  if (!target || !root) return null;
  if (target === "canvas") return root.querySelector(".md-mid");
  if (typeof target === "string") return root.querySelector(target) || document.querySelector(target);
  /* Alternatives, for chrome that differs by layout (the phone dock vs the
     older bottom nav): the first one on screen wins. */
  if (Array.isArray(target)) {
    var found = target.map(resolveTarget).filter(Boolean);
    return found.find(shown) || found[0] || null;
  }
  var bind = target.bind, host = root.querySelector('.pr-editor-ribbon[data-pro-editor="model"]');
  var menuItem = document.querySelector('.pr-fold-menu [data-pro-bind="' + bind + '"]');
  if (shown(menuItem)) return menuItem;
  if (host && shown(host)) {
    var tool = host.querySelector('[data-pro-bind="' + bind + '"]');
    if (!shown(tool)) {
      var index = ribbonTabFor(bind), tab = host.querySelector('.pr-tab[data-pro-tab="' + index + '"]');
      if (tab && !tab.classList.contains("on")) tab.click();
      tool = host.querySelector('[data-pro-bind="' + bind + '"]');
    }
    if (shown(tool)) return tool;
    var group = tool && tool.closest(".pr-group"), fold = group && group.querySelector(".pr-fold");
    if (shown(fold)) {
      // once the fold opens, ring the tool inside its menu instead
      if (!fold._guideFollows) {
        fold._guideFollows = true;
        fold.addEventListener("click", function () { setTimeout(function () { if (E.tour.active && !E.tour.busy) renderTour(); }, 0); });
      }
      return fold;
    }
  }
  var kind = bind.slice(0, bind.indexOf(":")), value = bind.slice(bind.indexOf(":") + 1);
  if (kind === "mcmd") return root.querySelector('[data-command="' + value + '"]');
  if (kind === "mcon" || kind === "mrel") return root.querySelector('[data-constraint="' + value + '"]');
  return null;
}
/* On a phone the tools live in bottom sheets: open the one holding the
   step's control, on the right command tab, once per step. */
function revealOnPhone(target) {
  if (target && target.bind) {
    var kind = target.bind.slice(0, target.bind.indexOf(":")), value = target.bind.slice(target.bind.indexOf(":") + 1);
    if (kind === "mcon" || kind === "mrel") { setTab("sketch"); showModelerSheet("props"); return; }
    var selector = '[data-command="' + value + '"]', node = root.querySelector(selector);
    var pane = node && node.closest("[data-command-pane]");
    if (pane) setCommandTab(pane.getAttribute("data-command-pane"));
    showModelerSheet("cmd", selector);
    return;
  }
  var text = target === "canvas" ? ".md-mid" : [].concat(target || []).join(",");
  if (text.indexOf("md-mid") >= 0) closeModelerSheet();
  else if (text.indexOf("Parts") >= 0) showModelerSheet("tree");
}
/* document-wide: the phone nav and selection bar live outside #modeler. */
function clearTourTarget() {
  document.querySelectorAll(".md-tour-target").forEach(function (node) { node.classList.remove("md-tour-target"); });
  if (root) root.querySelectorAll(".md-tour-click-marker").forEach(function (node) { node.remove(); });
  E.tour.target = null;
}
function showTourClickMarker(target) {
  if (!root || !target || E.tour.mode !== "auto" || target.classList.contains("md-mid")) return;
  var tr = target.getBoundingClientRect(), rr = root.getBoundingClientRect(), marker = document.createElement("span");
  marker.className = "md-tour-click-marker"; marker.innerHTML = '<i class="ph ph-cursor-click"></i>';
  marker.style.left = (tr.left - rr.left + tr.width / 2) + "px"; marker.style.top = (tr.top - rr.top + tr.height / 2) + "px";
  root.appendChild(marker);
}

/* ---- card placement ------------------------------------------------------- */
function clampTourPosition(position) {
  var card = root && root.querySelector(".md-tour-card");
  if (!card) return position;
  var rr = root.getBoundingClientRect(), margin = 12;
  var maxX = Math.max(margin, rr.width - card.offsetWidth - margin), maxY = Math.max(margin, rr.height - card.offsetHeight - margin);
  return { x:Math.min(maxX, Math.max(margin, position.x)), y:Math.min(maxY, Math.max(margin, position.y)) };
}
function applyTourPosition() {
  var card = root && root.querySelector(".md-tour-card");
  if (!card) return;
  if (document.body.classList.contains("compact-nav") && !E.tour.moved) { card.style.left = ""; card.style.top = ""; return; }
  if (!E.tour.position) {
    // Parked against the trailing edge: the canvas is what most steps ask you to look at.
    var rr = root.getBoundingClientRect();
    E.tour.position = { x:Math.max(12, rr.width - card.offsetWidth - 24), y:Math.max(12, rr.height - card.offsetHeight - 32) };
  }
  E.tour.position = clampTourPosition(E.tour.position);
  card.style.left = E.tour.position.x + "px"; card.style.top = E.tour.position.y + "px";
}
/* Keep the card off a small target; for the canvas there is nowhere to go. */
function avoidTourTargetOverlap(target) {
  if (!root || !target || E.tour.moved || compactNav()) return;
  var card = root.querySelector(".md-tour-card");
  if (!card) return;
  var rr = root.getBoundingClientRect(), tr = target.getBoundingClientRect(), cr = card.getBoundingClientRect();
  if (tr.width > rr.width * 0.5 && tr.height > rr.height * 0.5) return;
  if (cr.right < tr.left || cr.left > tr.right || cr.bottom < tr.top || cr.top > tr.bottom) return;
  var margin = 16, w = card.offsetWidth, h = card.offsetHeight;
  var options = [
    { x:tr.right - rr.left + margin, y:E.tour.position.y }, { x:tr.left - rr.left - w - margin, y:E.tour.position.y },
    { x:E.tour.position.x, y:tr.bottom - rr.top + margin }, { x:E.tour.position.x, y:tr.top - rr.top - h - margin },
  ];
  for (var i = 0; i < options.length; i++) {
    var o = options[i];
    if (o.x < margin || o.y < margin || o.x + w > rr.width - margin || o.y + h > rr.height - margin) continue;
    var left = rr.left + o.x, top = rr.top + o.y;
    if (left + w < tr.left || left > tr.right || top + h < tr.top || top > tr.bottom) { E.tour.position = o; applyTourPosition(); return; }
  }
}
function installTourDragging() {
  var card = root && root.querySelector(".md-tour-card"), handle = root && root.querySelector(".md-tour-head");
  if (!card || !handle) return;
  handle.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 || event.target.closest("button")) return;
    applyTourPosition();
    E.tour.drag = { pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, originX:E.tour.position.x, originY:E.tour.position.y };
    E.tour.moved = true;   // placed by hand: stop repositioning it
    handle.setPointerCapture(event.pointerId); card.classList.add("is-dragging"); event.preventDefault();
  });
  handle.addEventListener("pointermove", function (event) {
    var drag = E.tour.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    E.tour.position = clampTourPosition({ x:drag.originX + event.clientX - drag.startX, y:drag.originY + event.clientY - drag.startY });
    applyTourPosition();
  });
  function finish(event) { if (!E.tour.drag || E.tour.drag.pointerId !== event.pointerId) return; E.tour.drag = null; card.classList.remove("is-dragging"); }
  handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish);
}

/* ---- step state ------------------------------------------------------------ */
function tourStepDone(step, index) {
  if (!step || step.manual) return true;
  if (E.tour.completed[index]) return true;
  if (!step.check) return false;
  try {
    var done = !!step.check();
    if (done) E.tour.completed[index] = true;
    return done;
  } catch (error) { return false; }
}
function stepText(step, field) {
  var mobile = compactNav() && step[field + "Mobile"];
  if (mobile) return txt(mobile);
  var value = step[field];
  if (compactNav() && typeof value === "string" && txt(value + "Mobile") !== value + "Mobile") return txt(value + "Mobile");
  return txt(value);
}

/* ---- rendering -------------------------------------------------------------- */
function q(selector) { return root.querySelector(selector); }
function setSpeech(parts) {
  var button = q("#mdTourSpeak");
  if (button) bindSpeakButton(button, function () { return parts(); }, getLang, { labelPlay:t("speakReadAloud"), labelStop:t("speakStop") });
}
function showParts(names) {
  ["#mdTourTracks", ".md-tour-progress", ".md-tour-tip", "#mdTourDemo", "#mdTourStatus", ".md-tour-actions"].forEach(function (selector) {
    var node = q(selector);
    if (node) node.hidden = names.indexOf(selector) < 0;
  });
}
function trackButton(card) {
  var steps = card.steps().length;
  return '<button type="button" data-tour-track="' + card.track + '">' +
    '<span class="md-tour-glyph art-' + card.art + '">' + welcomeGlyph(card.art) + '</span>' +
    '<span><b>' + txt(card.title) + '</b><small>' + txt(card.desc) + '</small>' +
    '<em class="md-tour-meta">' + steps + " " + txt(UI.steps) + " · " + card.minutes + " " + txt(UI.minutes) + '</em></span>' +
    '<i class="ph ph-arrow-right"></i></button>';
}
function renderTourHub() {
  if (!root) return;
  stopSpeaking(); clearTourTarget();
  q("#mdTour").hidden = false; root.classList.add("md-tour-open");
  q("#mdTourCount").textContent = t("guideTitle");
  q("#mdTourTitle").textContent = t("guideHubTitle");
  q("#mdTourBody").textContent = t("guideHubBody");
  showParts(["#mdTourTracks"]);
  var card = q(".md-tour-card");
  card.classList.remove("md-tour-min"); card.classList.add("md-tour-hub");
  /* Five tracks in a floating card is a scroller inside a scroller on a
     phone, so there the extra ones fold away. */
  var cards = guideTracks(), compactHub = compactNav();
  var primary = compactHub ? cards.filter(function (c) { return c.phonePrimary; }) : cards;
  var extra = compactHub ? cards.filter(function (c) { return !c.phonePrimary; }) : [];
  var tracks = q("#mdTourTracks");
  tracks.innerHTML = primary.map(trackButton).join("") + (extra.length
    ? '<details class="md-tour-more"><summary>' + t("guideMoreProjects") + "</summary>" +
      '<p class="md-tour-more-note">' + t("guideMoreProjectsNote") + "</p>" + extra.map(trackButton).join("") + "</details>"
    : "");
  tracks.querySelectorAll("[data-tour-track]").forEach(function (button) {
    button.addEventListener("click", function () { renderTourMode(button.getAttribute("data-tour-track")); });
  });
  setSpeech(function () {
    return [t("guideTitle"), t("guideHubTitle"), t("guideHubBody")].concat(cards.map(function (c) { return txt(c.title) + ": " + txt(c.desc); }));
  });
  requestAnimationFrame(applyTourPosition);
}
function renderTourMode(track) {
  if (!root) return;
  stopSpeaking(); clearTourTarget();
  E.tour.track = track; E.tour.mode = null;
  var info = trackInfo(track);
  q("#mdTourCount").textContent = info ? txt(info.title) : t("guideTitle");
  q("#mdTourTitle").textContent = t("guideModeTitle");
  q("#mdTourBody").textContent = t("guideModeBody");
  showParts(["#mdTourTracks", ".md-tour-actions"]);
  q(".md-tour-card").classList.remove("md-tour-hub");
  var tracks = q("#mdTourTracks");
  tracks.innerHTML = '<button type="button" data-tour-mode="interactive"><i class="ph ph-hand-tap"></i><span><b>' + t("guideInteractiveMode") + '</b><small>' + t("guideInteractiveModeDesc") + '</small></span><i class="ph ph-arrow-right"></i></button>' +
    '<button type="button" data-tour-mode="auto"><i class="ph ph-play-circle"></i><span><b>' + t("guideAutoMode") + '</b><small>' + t("guideAutoModeDesc") + '</small></span><i class="ph ph-arrow-right"></i></button>';
  tracks.querySelectorAll("[data-tour-mode]").forEach(function (button) {
    button.addEventListener("click", function () { selectTourTrack(track, button.getAttribute("data-tour-mode")); });
  });
  var back = q("#mdTourBack"); back.disabled = false;
  back.innerHTML = '<i class="ph ph-arrow-left"></i>' + t("guideTracksBack");
  ["#mdTourSkip", "#mdTourNext", "#mdTourKeep"].forEach(function (s) { q(s).hidden = true; });
  setSpeech(function () {
    return [t("guideModeTitle"), t("guideModeBody"), t("guideInteractiveMode") + ": " + t("guideInteractiveModeDesc"), t("guideAutoMode") + ": " + t("guideAutoModeDesc")];
  });
}
/* The step list doubles as a map of the track: done, current, still to come. */
function renderStepDots(steps, index) {
  var host = q("#mdTourDemo");
  var step = steps[index];
  if (step && step.gestures) {
    var en = getLang() === "en";
    host.innerHTML = '<div class="md-tour-gestures">' +
      '<span><i class="ph ph-hand-swipe-left"></i><b>' + (en ? "1 finger" : "אצבע אחת") + '</b><small>' + (en ? "Orbit" : "סיבוב") + '</small></span>' +
      '<span><i class="ph ph-hand-swipe-right md-two-finger"></i><b>' + (en ? "2 fingers" : "שתי אצבעות") + '</b><small>' + (en ? "Pan" : "הזזה") + '</small></span>' +
      '<span><i class="ph ph-arrows-in-line-horizontal"></i><b>' + (en ? "Pinch" : "צביטה") + '</b><small>' + (en ? "Zoom" : "זום") + '</small></span>' +
      '<span><i class="ph ph-hand-tap"></i><b>' + (en ? "Long press" : "לחיצה ארוכה") + '</b><small>' + (en ? "Select through" : "בחירה דרך") + '</small></span></div>';
    return;
  }
  host.innerHTML = '<ol class="md-tour-steps">' + steps.map(function (s, i) {
    var state = i === index ? "now" : (i < index || E.tour.completed[i]) ? "done" : "";
    return '<li class="' + state + '" title="' + txt(s.title).replace(/"/g, "&quot;") + '"><span>' + (state === "done" ? '<i class="ph ph-check"></i>' : i + 1) + "</span></li>";
  }).join("") + "</ol>";
}
function renderTour() {
  if (!root || !E.tour.active) return;
  if (!E.tour.track) { renderTourHub(); return; }
  if (!E.tour.mode) { renderTourMode(E.tour.track); return; }
  var steps = tourSteps(), index = Math.max(0, Math.min(E.tour.step, steps.length - 1)), step = steps[index];
  if (!step) return;
  var auto = E.tour.mode === "auto", busy = !!E.tour.busy, last = index === steps.length - 1;
  var done = auto ? !!E.tour.completed[index] || !!step.manual : tourStepDone(step, index);
  q("#mdTour").hidden = false; root.classList.add("md-tour-open");
  q(".md-tour-card").classList.remove("md-tour-hub");
  showParts([".md-tour-progress", ".md-tour-tip", "#mdTourDemo", "#mdTourStatus", ".md-tour-actions"]);
  var head = q("#mdTourHead") || q(".md-tour-head");
  if (head) head.title = compactNav() ? "" : t("guideMoveCard");
  var info = trackInfo(E.tour.track);
  q("#mdTourCount").textContent = (info ? txt(info.title) + " · " : "") + t("guideStep") + " " + (index + 1) + " " + t("guideOf") + " " + steps.length;
  q("#mdTourTitle").textContent = stepText(step, "title");
  q("#mdTourBody").textContent = stepText(step, "body");
  var tip = stepText(step, "tip");
  q(".md-tour-tip").hidden = !tip;
  q("#mdTourTip").textContent = tip;
  q("#mdTourProgress").style.width = Math.round(((index + (done ? 1 : 0)) / steps.length) * 100) + "%";
  renderStepDots(steps, index);
  var status = q("#mdTourStatus"), statusText;
  if (busy) statusText = '<i class="ph ph-spinner-gap md-tour-spin"></i> ' + txt(UI.working);
  else if (E.tour.failed) statusText = '<i class="ph ph-warning"></i> ' + txt(UI.failed);
  else if (auto) statusText = done ? '<i class="ph ph-check-circle"></i> ' + txt(UI.demoDone) : '<i class="ph ph-play"></i> ' + txt(UI.demoReady);
  else statusText = done ? '<i class="ph ph-check-circle"></i> ' + t("guideDone") : '<i class="ph ph-hand-tap"></i> ' + t("guideWaiting");
  status.hidden = !!step.manual && !busy && !E.tour.failed;
  status.classList.toggle("done", done && !busy);
  status.classList.toggle("failed", !!E.tour.failed && !busy);
  status.innerHTML = statusText;
  var back = q("#mdTourBack"), next = q("#mdTourNext"), showMe = q("#mdTourSkip"), keep = q("#mdTourKeep");
  back.disabled = busy;
  back.innerHTML = '<i class="ph ph-arrow-left"></i>' + (index === 0 ? t("guideTracksBack") : t("guideBack"));
  showMe.hidden = auto || !!step.manual || done || !step.demo;
  showMe.disabled = busy;
  showMe.innerHTML = '<i class="ph ph-magic-wand"></i>' + txt(UI.showMe);
  showMe.title = txt(UI.showMeTip);
  keep.hidden = !auto;
  next.hidden = false;
  /* Demo: Next performs the step that is on screen when it has not run yet,
     otherwise moves on. Interactive: Next waits for the work. */
  next.disabled = busy || (!auto && !done);
  next.innerHTML = auto && !done
    ? '<i class="ph ph-play"></i>' + txt(UI.play)
    : last ? '<i class="ph ph-check"></i>' + t(E.tour.track === "mobile" ? "guideContinueEditing" : "guideFinishTutorial")
    : t("guideNext") + '<i class="ph ph-arrow-right"></i>';
  setSpeech(function () { return [q("#mdTourCount").textContent + ". " + stepText(step, "title"), stepText(step, "body"), stepText(step, "tip")]; });
  clearTourTarget();
  var target = resolveTarget(step.target);
  /* With the step's feature form open, the next click is its ✓. */
  var accept = root.querySelector("#mdAcceptCommand");
  if (!done && !auto && E.quickFormInstance && step.target && step.target.bind && shown(accept)) target = accept;
  /* A phone shows a tool only inside its sheet; when that sheet is shut (or
     the tool is only in the All-tools list) the Tools button is where to go. */
  if (compactNav() && step.target && step.target !== "canvas" && !shown(target)) {
    var tools = root.querySelector("#modeler .ps-dock-grid");
    if (shown(tools)) target = tools;
  }
  if (target) {
    target.classList.add("md-tour-target");
    E.tour.target = target;
    if (!done) showTourClickMarker(target);
    // a tool ringed 400px down a phone sheet is still a tool you cannot see
    var scroller = target.closest && target.closest("#md-sheet, .md-command-pane, .md-panel");
    if (scroller) {
      try { target.scrollIntoView({ block:"center", inline:"nearest" }); } catch (error) { target.scrollIntoView(); }
      root.scrollTop = 0; root.scrollLeft = 0;   // scrollIntoView also scrolls #modeler itself
    }
  }
  requestAnimationFrame(function () { applyTourPosition(); avoidTourTargetOverlap(target); });
}

/* ---- running steps ------------------------------------------------------------ */
function prepareTourStep() {
  var step = currentStep();
  if (!step) return;
  E.tour.preparing = true;
  E.tour.failed = false;
  E.tour.baseline = step.baseline ? step.baseline() : null;
  if (compactNav() && !step.noAutoReveal) revealOnPhone(step.target);
  try { if (step.prepare) step.prepare(); } catch (error) { console.warn("tutorial step setup failed", error); }
  if (compactNav()) {
    var card = q(".md-tour-card"), canvasStep = step.target === "canvas";
    if (card) card.classList.toggle("md-tour-min", !!step.autoCollapseMobile || !!E.tour.userCollapsed || (window.innerHeight <= 500 && canvasStep));
  }
  E.tour.preparing = false;
  renderTour();
}
/* Runs one or more demonstrations in order, then settles. Anything that throws
   or leaves its check unmet is reported on the card, not swallowed. */
async function runDemos(indices) {
  var steps = tourSteps(), track = E.tour.track, ok = true;
  E.tour.busy = true; E.tour.failed = false; renderTour();
  try {
    for (var k = 0; k < indices.length; k++) {
      var i = indices[k], step = steps[i];
      if (!step || step.manual || !step.demo) { E.tour.completed[i] = true; continue; }
      E.tour.step = i;
      if (E.tour.mode !== "auto") E.tour.baseline = step.baseline ? step.baseline() : null;
      await step.demo();
      /* A rebuild that never settles is a failure, not a step done: the next
         demonstration would edit a model the kernel is still working on. */
      var settled = await waitForModel();
      if (!E.tour.active || E.tour.track !== track) return false;
      refreshAll();
      var passed = settled && (!step.check || !!step.check());
      E.tour.completed[i] = passed;
      if (!passed) { ok = false; break; }
    }
  } catch (error) {
    console.warn("tutorial demonstration failed", error);
    ok = false;
  } finally {
    E.tour.busy = false;
  }
  if (E.tour.closeRequested) { closeTour(); return false; }
  E.tour.failed = !ok;
  if (E.tour.active) renderTour();
  return ok;
}
/* Show me: do every step up to this one that is not done yet. */
function showMe() {
  if (!E.tour.active || E.tour.busy || E.tour.mode === "auto") return;
  var steps = tourSteps(), here = E.tour.step, todo = [];
  for (var i = 0; i <= here; i++) if (!tourStepDone(steps[i], i)) todo.push(i);
  if (!todo.length) return;
  runDemos(todo).then(function () { E.tour.step = here; if (E.tour.active) renderTour(); });
}
function goTourStep(delta) {
  if (!E.tour.active || E.tour.busy) return;
  // Back from the mode chooser is back to the list of tracks.
  if (!E.tour.mode) { if (delta < 0) { E.tour.track = null; renderTourHub(); } return; }
  if (!E.tour.track) return;
  var steps = tourSteps(), index = E.tour.step;
  if (delta < 0) {
    if (index === 0) {
      if (E.tour.mode === "auto") restoreAutomaticTourOrigin();
      E.tour.autoOrigin = null;
      renderTourMode(E.tour.track);
      return;
    }
    if (E.tour.mode === "auto") { seekAutomaticTour(index - 1); return; }
    E.tour.step = index - 1; prepareTourStep(); return;
  }
  var step = steps[index];
  if (E.tour.mode === "auto") {
    if (!E.tour.completed[index] && !step.manual) { runDemos([index]); return; }
    if (index >= steps.length - 1) { closeTour(); return; }
    E.tour.step = index + 1; prepareTourStep(); return;
  }
  if (!tourStepDone(step, index)) return;
  if (index >= steps.length - 1) { closeTour(); return; }
  E.tour.step = index + 1; prepareTourStep();
}

/* A demo's starting point is replayed from the original document: the only
   honest way to land on an earlier step. */
async function seekAutomaticTour(index) {
  if (!E.tour.active || E.tour.mode !== "auto" || E.tour.busy) return;
  var steps = tourSteps();
  index = Math.max(0, Math.min(steps.length - 1, index));
  restoreAutomaticTourOrigin();
  E.tour.completed = {};
  E.tour.steps = null; steps = tourSteps();   // fresh closures for the replay
  await startTrackDocument(false);
  var replay = [];
  for (var i = 0; i < index; i++) replay.push(i);
  if (replay.length && !(await runDemos(replay))) return;
  if (!E.tour.active) return;
  E.tour.step = index; prepareTourStep();
}
function restoreAutomaticTourOrigin() {
  var origin = E.tour.autoOrigin;
  if (!origin) return;
  setDocumentType(origin.docType); E.def = cloneData(origin.def); E.assembly = cloneData(origin.assembly);
  invalidateInterference();
  H.clear().seed();
  E.sel = null; E.ssel = []; E.componentSel = []; E.topologySelection = [];
  E.authoring = cloneData(origin.authoring);
  setCommandTab(origin.commandTab || "features"); setView(origin.view || "top"); setTool(origin.tool || "select"); setMode(origin.mode || "3d");
  refreshAll();
}
async function startTrackDocument(ask) {
  var info = trackInfo(E.tour.track);
  var ok = await freshDocument(info ? info.doc : "part", ask);
  if (ok && info && info.doc === "assembly") ensurePracticeAssembly();
  return ok;
}
async function selectTourTrack(track, mode) {
  if (!root || !E.open) return;
  stopSpeaking();
  if (!E.tour.active) { E.tour.active = true; closeWelcome(); }
  E.tour.track = track; E.tour.mode = mode || "interactive"; E.tour.step = 0;
  E.tour.completed = {}; E.tour.steps = null; E.tour.failed = false; E.tour.userCollapsed = false;
  E.tour.autoOrigin = null; E.tour.demoAssemblyKey = null;
  if (E.tour.mode === "auto") {
    E.tour.autoOrigin = { docType:E.docType, def:cloneData(E.def), assembly:cloneData(E.assembly), authoring:cloneData(E.authoring),
      mode:E.mode, view:E.view, tool:E.tool, commandTab:E.commandTab };
  }
  E.tour.busy = true; renderTour();
  var ok = await startTrackDocument(E.tour.mode !== "auto");
  E.tour.busy = false;
  if (E.tour.closeRequested) { closeTour(); return; }
  if (!E.tour.active) return;
  if (!ok) { flash(txt(UI.cancelled)); E.tour.mode = null; renderTourMode(track); return; }
  prepareTourStep();
  syncCoach();
}

/* ---- open / close --------------------------------------------------------------- */
/* Interactive checks read the document; most changes re-render through
   refreshAll(), but the exact kernel finishing a rebuild does not, so a light
   poll keeps the Next button honest. */
function pollTour() {
  if (!E.tour.active) { clearInterval(E.tour.poll); E.tour.poll = null; return; }
  if (E.tour.busy || E.tour.mode !== "interactive" || !E.tour.track) return;
  var step = currentStep();
  if (step && !step.manual && !E.tour.completed[E.tour.step] && tourStepDone(step, E.tour.step)) renderTour();
}
function updateTourProgress() {
  if (!E.tour.active || E.tour.preparing || E.tour.busy) return;
  renderTour();
}
function startTour() {
  if (!root || !E.open) return;
  closeWelcome();
  E.tour.active = true; E.tour.track = null; E.tour.mode = null; E.tour.step = 0; E.tour.completed = {}; E.tour.steps = null;
  if (!E.tour.poll) E.tour.poll = setInterval(pollTour, 500);
  renderTourHub();
  syncCoach();
}
function closeTour() {
  stopSpeaking();
  if (!E.tour) return;
  /* A step half-way through its demonstration would land on whatever document
     the close restores; let it finish, then close. */
  if (E.tour.busy) { E.tour.closeRequested = true; return; }
  E.tour.closeRequested = false;
  if (E.tour.mode === "auto" && E.tour.autoOrigin) {
    if (E.tour.keepResult) flash(t("guideDemoKept"));
    else {
      // The assembly demo saves to the library; drop that entry with the demo.
      if (E.tour.demoAssemblyKey) saveAssemblies(E.tour.demoAssemblyKey, { mode:"delete" }).catch(function () {});
      E.tour.preparing = true; restoreAutomaticTourOrigin(); E.tour.preparing = false; flash(t("guideDemoRestored"));
    }
  }
  Object.assign(E.tour, { keepResult:false, demoAssemblyKey:null, active:false, autoOrigin:null, baseline:null,
    preparing:false, busy:false, failed:false, steps:null });
  clearInterval(E.tour.poll); E.tour.poll = null;
  clearTourTarget();
  if (!root) return;
  root.classList.remove("md-tour-open");
  var layer = q("#mdTour");
  if (layer) layer.hidden = true;
  syncCoach();
}

export {
  closeTour, goTourStep, guideTracks, installTourDragging, prepareTourStep, renderTour,
  renderTourMode, restoreAutomaticTourOrigin, seekAutomaticTour, selectTourTrack, showMe,
  startTour, tourStepDone, tourSteps, txt, updateTourProgress,
};

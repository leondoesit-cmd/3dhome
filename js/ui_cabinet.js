// Cabinet designer overlay chrome: open/close, size, history, keyboard and wiring.
// Elevation drawing lives in ui_cabinet_view.js; inspector panes in ui_cabinet_inspect.js.

import { S, clamp, fin } from "./state.js";
import { clearVSpanCache } from "./furniture.js";
import { getLang, onLangChange } from "./i18n.js";
import { render2D } from "./plan2d.js";
import { pushHistory } from "./history.js";
import { createHistory } from "./edit_history.js";
import { createHistoryPanel } from "./ui_history.js";
import { updateCost } from "./ui_tree.js";
import {
  FAM, makeSpec, specOf, famOf, defaultPreset, makeBlankSpec, layoutCab,
  secLabel, doorLabel, famLabel, presetLabel, cabSummary,
} from "./cabinet.js";
import { ceilingHeight } from "./elevation.js";
import { openNest, isNestOpen } from "./ui_nest.js";
import {
  CAB_LIMITS, syncCabinetDefinition, requestCabinetDimension, applyCabinetDimension,
} from "./parametric_cabinet.js";
import { api, E, T, el, btn, sp, ico, grp, formatCm, AXES } from "./ui_cabinet_ctx.js";
import {
  sizeCanvas, setMode, setAxis, syncHint, syncViewPreferences, draw, wireCanvas,
  setTool, exportPNG, initPreview, updatePreview, renderPreview,
} from "./ui_cabinet_view.js";
import {
  fillHits, applySearch, fillFamilies, fillPresets, startBlank, fillInspector,
  splitSection, delSection, splitColumn, dupColumn, delColumn, fillLook, fillTechnical,
  fillChecks, saveUserPreset, fillMine, fillHardware, fillBOM, exportBOM,
} from "./ui_cabinet_inspect.js";

function destroyDOM() {
  if (E.pv && E.pv.rr) E.pv.rr.dispose();
  E.pv = null;
  E.swapView = null; // it closes over elements that are about to be removed
  E.cv = null;
  E.cx = null;
  if (E.host) E.host.remove();
  E.host = null;
}

function buildDOM() {
  E.lang = getLang();
  E.host = el("div", "", "");
  E.host.id = "cabdes";
  E.host.innerHTML =
    '<div class="cb-head">' +
    '<div class="cb-head-main">' +
    '<div class="cb-logo"><i class="ph ph-lockers"></i> <b>' + T("title") + "</b>" +
    '<span class="cb-sub" id="cbSub"></span><span class="cb-session" id="cbSession" role="status" aria-live="polite"></span></div>' +
    '<div class="cb-levels" role="tablist" aria-label="' + T("levelsAria") + '">' +
    '<button type="button" data-level="composition" class="on"><i class="ph ph-layout"></i> ' + T("levelCompose") + '</button>' +
    '<button type="button" data-level="technical"><i class="ph ph-sliders-horizontal"></i> ' + T("levelTechnical") + '</button>' +
    '<button type="button" data-level="advanced"><i class="ph ph-cube-focus"></i> ' + T("levelAdvanced") + '</button>' +
    '</div>' +
    '<div class="cb-actions">' +
    '<div class="cb-history-actions" aria-label="' + T("historyAria") + '">' +
    '<button id="cbUndo" title="Ctrl+Z" aria-label="' + T("undo") + '"><i class="ph ph-arrow-u-up-left"></i></button>' +
    '<button id="cbRedo" title="Ctrl+Y" aria-label="' + T("redo") + '"><i class="ph ph-arrow-u-up-right"></i></button></div>' +
    '<button id="cbRevert" title="' + T("cancelTip") + '"><i class="ph ph-arrow-counter-clockwise"></i> ' + T("revert") + "</button>" +
    '<button id="cbClose" class="btn-accent"><i class="ph ph-check"></i> ' + T("close") + "</button>" +
    "</div></div>" +
    '<div class="cb-context-bar">' +
    '<div class="cb-control-group cb-size-group"><span class="cb-group-title">' + T("cabinetSize") + '</span>' +
    '<div class="cb-dims">' +
    '<label><span>' + T("width") + '</span><span class="cb-number"><input id="cbW" type="number" inputmode="decimal"><em>cm</em></span></label>' +
    '<label><span>' + T("depth") + '</span><span class="cb-number"><input id="cbD" type="number" inputmode="decimal"><em>cm</em></span></label>' +
    '<label><span>' + T("height") + '</span><span class="cb-number"><input id="cbH" type="number" inputmode="decimal"><em>cm</em></span></label>' +
    '</div></div>' +
    '<div class="cb-context-sep"></div>' +
    '<div class="cb-control-group cb-preview-group"><span class="cb-group-title">' + T("preview") + '</span><div class="cb-preview-controls">' +
    '<div class="cb-slider-wrap">' +
    '<div class="cb-slider-hdr"><span id="cbOpenLabel">🔒 ' + T("closed") + '</span><span id="cbOpenVal">0%</span></div>' +
    '<input id="cbOpen" type="range" min="0" max="100" value="0" list="cbOpenStages" aria-label="' + T("openDoors") + '">' +
    '<datalist id="cbOpenStages"><option value="0"><option value="40"><option value="80"><option value="100"></datalist>' +
    '<div class="cb-stage-chips">' +
    '<button type="button" class="cb-chip-stage" data-v="0" title="' + T("closed") + '" aria-label="' + T("closed") + '">🔒 0%</button>' +
    '<button type="button" class="cb-chip-stage" data-v="40" title="' + T("openDoors") + '" aria-label="' + T("openDoors") + '">🚪 ' + T("doorsStage") + '</button>' +
    '<button type="button" class="cb-chip-stage" data-v="80" title="' + T("drawersStage") + '" aria-label="' + T("drawersStage") + '">🗄️ ' + T("drawersStage") + '</button>' +
    '<button type="button" class="cb-chip-stage" data-v="100" title="' + T("fullStage") + '" aria-label="' + T("fullStage") + '">🔓 ' + T("fullStage") + '</button>' +
    '</div></div>' +
    '<label class="cb-cb"><input id="cbShowDoors" type="checkbox" checked><span><i class="ph ph-door-open"></i> ' + T("showDoors") + "</span></label>" +
    "</div></div></div></div>" +
    '<div class="cb-body">' +
    '<div class="cb-panel cb-left">' +
    '<div class="cb-search"><i class="ph ph-magnifying-glass"></i>' +
    '<input id="cbSearch" type="text" autocomplete="off" placeholder="' + T("searchPh") + '">' +
    '<button id="cbSearchX" title="' + T("clear") + '"><i class="ph ph-x"></i></button></div>' +
    /* Everything the panel can show is an icon in a group, four to a row, and
       the group below shows whichever one is pressed. Hovering any of them
       says what it is — nothing here relies on a caption. */
    grp("design", [
      ico("tab", "fams", "ph-squares-four", "family"),
      ico("tab", "presets", "ph-cards-three", "presets"),
      ico("act", "blank", "ph-selection-plus", "blank"),
    ]) +
    grp("mine", [
      ico("act", "save", "ph-floppy-disk", "savePreset"),
      ico("tab", "mine", "ph-folder-open", "loadPreset"),
    ], "cb-pair") +
    '<div class="cb-tabs cb-fill" data-side="L">' +
    '<div class="cb-pane" data-pane="fams"><h4 id="cbFamsTitle">' + T("family") + '</h4>' +
    '<div id="cbFams" class="cb-chips"></div><div class="cb-note">' + T("applyFam") + "</div></div>" +
    '<div class="cb-pane" data-pane="presets"><div id="cbActs" class="cb-hits"></div>' +
    '<div id="cbPresets" class="cb-presets"></div>' +
    '<div id="cbNoHits" class="cb-note" style="display:none">' + T("noHits") + "</div></div>" +
    '<div class="cb-pane" data-pane="mine"><div id="cbMine" class="cb-presets"></div></div>' +
    "</div></div>" +
    '<div class="cb-mid">' +
    '<div class="cb-tools" id="cbTools">' +
    '<button data-tool="" class="on" aria-keyshortcuts="Escape"><i class="ph ph-cursor"></i> ' + T("toolSel") + "</button>" +
    '<button data-tool="vwall" aria-keyshortcuts="V"><i class="ph ph-columns-plus-right"></i> ' + T("toolV") + "</button>" +
    '<button data-tool="hwall" aria-keyshortcuts="H"><i class="ph ph-rows-plus-bottom"></i> ' + T("toolH") + "</button>" +
    '<button data-tool="erase" aria-keyshortcuts="X"><i class="ph ph-eraser"></i> ' + T("toolErase") + "</button>" +
    "</div>" +
    '<div class="cb-views" id="cbViews">' +
    '<div class="cb-vgroup">' +
    '<button data-mode="2d" class="on">2D</button><button data-mode="3d">3D</button>' +
    "</div>" +
    '<div class="cb-vgroup cb-vaxes" id="cbAxes">' +
    '<button data-ax="front" class="on"><i class="ph ph-square"></i>' + T("vFront") + "</button>" +
    '<button data-ax="back"><i class="ph ph-square-half"></i>' + T("vBack") + "</button>" +
    '<button data-ax="left"><i class="ph ph-arrow-line-left"></i>' + T("vLeft") + "</button>" +
    '<button data-ax="right"><i class="ph ph-arrow-line-right"></i>' + T("vRight") + "</button>" +
    '<button data-ax="top"><i class="ph ph-arrow-line-up"></i>' + T("vTop") + "</button>" +
    '<button data-ax="bottom"><i class="ph ph-arrow-line-down"></i>' + T("vBottom") + "</button>" +
    '<div class="cb-v45">' +
    '<button data-ax="fl" title="45°">◤</button><button data-ax="fr" title="45°">◥</button>' +
    '<button data-ax="bl" title="45°">◣</button><button data-ax="br" title="45°">◢</button>' +
    "</div></div>" +
    // a preference rather than a tool, so it sits apart from the four of them
    '<div class="cb-vgroup cb-vdraw"><button id="cbSnap" class="on" title="' + T("snapTip") +
    '"><i class="ph ph-magnet"></i> <span>' + T("snapOn") + "</span></button>" +
    // likewise a preference, and one that only the projected views answer to
    '<button id="cbHid" class="on" title="' + T("hidTip") +
    '"><i class="ph ph-square-split-horizontal"></i> <span>' + T("hidOn") + "</span></button></div>" +
    "</div>" +
    '<canvas id="cbCanvas"></canvas><div id="cb3dHost" class="cb-3dhost"></div>' +
    '<div class="cb-hint">' + T("hint") + "</div></div>" +
    '<div class="cb-panel cb-right">' +
    '<div class="cb-sec cb-prev-wrap"><canvas id="cbPrev"></canvas></div>' +
    grp("edit", [
      ico("tab", "insp", "ph-cursor-click", "inspTab"),
      ico("tab", "look", "ph-paint-brush", "front"),
      ico("tab", "hw", "ph-nut", "hardware"),
      ico("tab", "hist", "ph-clock-counter-clockwise", "history"),
    ]) +
    grp("review", [
      ico("tab", "checks", "ph-seal-check", "checks", '<span id="cbChkBadge" class="cb-badge"></span>'),
      ico("tab", "bom", "ph-list-numbers", "summary"),
      ico("act", "nest", "ph-scissors", "cutPlan"),
      ico("act", "png", "ph-image", "pngExport"),
    ], "", '<span id="cbBomBadge" class="cb-hprice"></span>') +
    '<div class="cb-tabs cb-fill" data-side="R">' +
    '<div class="cb-pane" data-pane="insp"><h4 id="cbInspTitle">' + T("section") + '</h4><div id="cbInsp"></div></div>' +
    '<div class="cb-pane" data-pane="technical"><h4>' + T("technicalTitle") + '</h4><div id="cbTechnical"></div></div>' +
    '<div class="cb-pane" data-pane="look"><div id="cbLook"></div></div>' +
    '<div class="cb-pane" data-pane="hw"><div id="cbHw"></div></div>' +
    '<div class="cb-pane" data-pane="hist"><div id="cbHist"></div></div>' +
    '<div class="cb-pane" data-pane="checks"><div id="cbChecks"></div></div>' +
    '<div class="cb-pane" data-pane="bom"><div id="cbBom"></div>' +
    '<button id="cbCsv" class="cb-wide"><i class="ph ph-file-csv"></i> ' + T("csv") + "</button></div>" +
    "</div></div>" +
    '<div id="cbSizeDlg" class="cb-size-dlg" hidden role="dialog" aria-modal="true" aria-labelledby="cbSizeDlgTitle">' +
    '<div class="cb-size-dlg-card">' +
    '<h3 id="cbSizeDlgTitle"></h3>' +
    '<p id="cbSizeDlgMsg"></p>' +
    '<div id="cbSizeDlgIssues"></div>' +
    '<div id="cbSizeDlgChoices"></div>' +
    '<button type="button" id="cbSizeDlgKeep"></button>' +
    "</div></div>";
  document.body.appendChild(E.host);

  E.host.querySelector("#cbClose").addEventListener("click", closeCabinet);
  E.host.querySelector("#cbRevert").addEventListener("click", revert);
  // the cut plan and the PNG hang off the review icons now (see wireTabs);
  // only the CSV still sits inside the bill itself, next to the table it dumps
  E.host.querySelector("#cbCsv").addEventListener("click", exportBOM);
  E.host.querySelector("#cbUndo").addEventListener("click", undo);
  E.host.querySelector("#cbRedo").addEventListener("click", redo);
  E.host.querySelectorAll(".cb-levels [data-level]").forEach(function (button) {
    button.addEventListener("click", function () {
      setLevel(button.getAttribute("data-level"));
    });
  });
  E.histPanel = createHistoryPanel(H, {
    title: T("history"),
    showBaseline: true,
    scope: specScope,
    onPick: specPick,
  });
  E.host.querySelector("#cbHist").appendChild(E.histPanel.el);
  ["W", "D", "H"].forEach(function (k) {
    var dim = E.host.querySelector("#cb" + k);
    var limit = CAB_LIMITS[k === "W" ? "width" : k === "D" ? "depth" : "height"];
    dim.min = limit.min;
    dim.max = limit.max;
    dim.step = 0.1;
    dim.title = T(k === "W" ? "width" : k === "D" ? "depth" : "height") + " (cm)";
    dim.addEventListener("change", function () {
      applyOverallSize(k === "W" ? "width" : k === "D" ? "depth" : "height", this);
    });
    dim.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        this.blur();
      }
    });
  });
  E.host.querySelector("#cbSizeDlgKeep").addEventListener("click", dismissSizeDlg);
  E.host.querySelector("#cbOpen").addEventListener("input", function () {
    var val = +this.value / 100;
    E.it.runtimeState = E.it.runtimeState || {};
    E.it.runtimeState.cabinetOpen = val;
    sp().open = val;
    syncOpenUI(val);
    runtimeChanged();
  });
  E.host.querySelectorAll(".cb-chip-stage").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = +this.getAttribute("data-v") / 100;
      E.it.runtimeState = E.it.runtimeState || {};
      E.it.runtimeState.cabinetOpen = val;
      sp().open = val;
      syncOpenUI(val);
      runtimeChanged();
    });
  });
  E.host.querySelector("#cbShowDoors").addEventListener("change", function () {
    E.showDoors = this.checked;
    draw();
  });

  E.host.querySelectorAll("#cbTools button[data-tool]").forEach(function (b) {
    b.addEventListener("click", function () {
      setTool(b.getAttribute("data-tool") || null);
    });
  });
  wireTabs();
  var sIn = E.host.querySelector("#cbSearch");
  sIn.addEventListener("input", function () {
    E.q = this.value.trim().toLowerCase();
    applySearch();
  });
  sIn.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && this.value) {
      e.stopPropagation(); // the first Escape clears the search, not the overlay
      this.value = "";
      E.q = "";
      applySearch();
    }
  });
  E.host.querySelector("#cbSearchX").addEventListener("click", function () {
    sIn.value = "";
    E.q = "";
    applySearch();
    sIn.focus();
  });

  E.host.querySelector("#cbSnap").addEventListener("click", function () {
    // the size discipline is a preference, not a mode: it stays where it was
    // put and applies to whichever tool is in hand
    E.snap = !E.snap;
    this.classList.toggle("on", E.snap);
    this.setAttribute("aria-pressed", E.snap ? "true" : "false");
    this.querySelector("span").textContent = T(E.snap ? "snapOn" : "snapOff");
    E.ghost = null;
    draw();
  });
  E.host.querySelector("#cbHid").addEventListener("click", function () {
    /* Off is not just "stop dashing": a part that is wholly behind another is
       dropped from the drawing altogether, so what is left is exactly what the
       eye would see standing at this angle. */
    E.hid = !E.hid;
    this.classList.toggle("on", E.hid);
    this.setAttribute("aria-pressed", E.hid ? "true" : "false");
    this.querySelector("span").textContent = T(E.hid ? "hidOn" : "hidOff");
    draw();
  });
  E.host.querySelectorAll("#cbViews button[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () {
      setMode(b.getAttribute("data-mode"));
    });
  });
  E.host.querySelectorAll("#cbViews button[data-ax]").forEach(function (b) {
    b.addEventListener("click", function () {
      setAxis(b.getAttribute("data-ax"));
    });
  });

  E.cv = E.host.querySelector("#cbCanvas");
  E.cx = E.cv.getContext("2d");
  wireCanvas();
  initPreview();
  window.addEventListener("resize", function () {
    if (E.open) {
      sizeCanvas();
      draw();
      renderPreview();
    }
  });
  /* The cut plan opens on top of the designer and edits the same spec: when it
     closes, whatever it changed (material, board thickness) has to show up
     here. */
  window.addEventListener("cabStockChanged", function () {
    if (E.open) changed(true);
  });
  document.addEventListener("keydown", function (e) {
    // the cut plan sits on top of us and has its own Escape
    if (!E.open || isNestOpen()) return;
    if (isSizeDlgOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissSizeDlg();
      }
      return;
    }
    var typing = /input|textarea|select/i.test((document.activeElement || {}).tagName || "");
    // a drawing tool owns Escape first — it exits the tool, not the designer
    if (e.key === "Escape" && E.tool) return setTool(null);
    if (e.key === "Escape") return cancelCabinet();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return redo();
    }
    if (typing) return;
    if (e.key === "/") {
      e.preventDefault();
      return E.host.querySelector("#cbSearch").focus();
    }
    if (e.key === "2") return setMode("2d");
    if (e.key === "3") return setMode("3d");
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") return copyColumn();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") return pasteColumn();
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      var toolKey = e.key.toLowerCase();
      if (toolKey === "v") {
        e.preventDefault();
        if (E.mode === "3d" || E.axis !== "front") setAxis("front");
        return setTool(E.tool === "vwall" ? null : "vwall");
      }
      if (toolKey === "h") {
        e.preventDefault();
        if (E.mode === "3d" || E.axis !== "front") setAxis("front");
        return setTool(E.tool === "hwall" ? null : "hwall");
      }
      if (toolKey === "x") {
        e.preventDefault();
        if (E.mode === "3d" || E.axis !== "front") setAxis("front");
        return setTool(E.tool === "erase" ? null : "erase");
      }
    }
    if (!sp()) return;
    if (!E.sel) E.sel = { col: 0, sec: 0 };
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (E.sel.sec != null) delSection();
      else delColumn();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // walk the columns; in a mirrored (RTL) reading the arrows still follow
      // the drawing, which is always left-to-right
      var d = e.key === "ArrowRight" ? 1 : -1;
      E.sel = { col: clamp((E.sel.col || 0) + d, 0, sp().cols.length - 1), sec: 0 };
      draw();
      fillInspector();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      var c = sp().cols[E.sel.col];
      if (!c) return;
      var j = (E.sel.sec == null ? 0 : E.sel.sec) + (e.key === "ArrowUp" ? 1 : -1);
      E.sel = { col: E.sel.col, sec: clamp(j, 0, c.secs.length - 1) };
      draw();
      fillInspector();
    }
  });
}
function syncDimInputs() {
  if (!E.host || !E.it) return;
  E.host.querySelector("#cbW").value = formatCm(E.it.w);
  E.host.querySelector("#cbD").value = formatCm(E.it.d);
  E.host.querySelector("#cbH").value = formatCm(E.it.h);
}

function setLevel(level) {
  if (!E.host) return;
  if (level === "advanced") {
    var item = E.it;
    syncCabinetDefinition(S, item, { propagate: true });
    closeCabinet();
    import("./modeler.js").then(function (modeler) { modeler.openModelerForItem(item); });
    return;
  }
  E.level = level;
  E.host.classList.toggle("cb-level-technical", level === "technical");
  E.host.querySelectorAll(".cb-levels [data-level]").forEach(function (candidate) {
    var on = candidate.getAttribute("data-level") === level;
    candidate.classList.toggle("on", on);
    candidate.setAttribute("aria-selected", on ? "true" : "false");
  });
  if (level === "technical") {
    fillTechnical();
    setTab("technical", false);
  } else setTab("insp", false);
}

function isSizeDlgOpen() {
  var dlg = E.host && E.host.querySelector("#cbSizeDlg");
  return !!(dlg && !dlg.hidden);
}

function dismissSizeDlg() {
  var dlg = E.host && E.host.querySelector("#cbSizeDlg");
  if (dlg) dlg.hidden = true;
  E.sizeDlg = null;
  syncDimInputs();
}

function showSizeProposal(dimension, result, input) {
  var dlg = E.host.querySelector("#cbSizeDlg");
  if (!dlg) return;
  E.sizeDlg = { dimension: dimension, result: result, input: input };
  dlg.querySelector("#cbSizeDlgTitle").textContent = T("sizeProposal");
  dlg.querySelector("#cbSizeDlgMsg").textContent = result.message || T("sizeProposal");
  var issues = dlg.querySelector("#cbSizeDlgIssues");
  issues.innerHTML = "";
  (result.issues || []).slice(0, 4).forEach(function (issue) {
    var note = el("div", "cb-check cb-" + (issue.level || "warn"));
    note.textContent = issue.msg || issue.message || "";
    issues.appendChild(note);
  });
  var choices = dlg.querySelector("#cbSizeDlgChoices");
  choices.innerHTML = "";
  (result.alternatives || []).forEach(function (choice, index) {
    var button = el("button", index === 0 ? "btn-accent cb-size-choice" : "cb-size-choice");
    var title = document.createElement("strong");
    title.textContent = choice.label;
    button.appendChild(title);
    if (choice.reason) {
      var reason = document.createElement("small");
      reason.textContent = choice.reason;
      button.appendChild(reason);
    }
    button.addEventListener("click", function () {
      commitSizeChoice(result, choice.id);
    });
    choices.appendChild(button);
  });
  dlg.querySelector("#cbSizeDlgKeep").textContent = T("keepSize");
  dlg.hidden = false;
}

function commitSizeChoice(result, alternativeId) {
  if (!E.it) return;
  var applied = applyCabinetDimension(S, E.it, result, alternativeId);
  dismissSizeDlg();
  if (!applied) {
    flashHint(T("sizeRejected"));
    return;
  }
  act(T("opSize") + " · " + formatCm(E.it.w) + "×" + formatCm(E.it.d) + "×" + formatCm(E.it.h));
  syncDimInputs();
  changed(true);
}

function applyOverallSize(dimension, input) {
  if (!E.it) return;
  var limit = CAB_LIMITS[dimension];
  var value = Number(input.value);
  if (!limit || !Number.isFinite(value) || Math.abs(value - E.it[limit.field]) < 0.0001) {
    syncDimInputs();
    return;
  }
  var result = requestCabinetDimension(E.it, dimension, value, ceilingHeight());
  if (result.status === "applied") commitSizeChoice(result, null);
  else if (result.status === "proposal") showSizeProposal(dimension, result, input);
  else {
    syncDimInputs();
    flashHint(result.message || T("sizeRejected"));
  }
}

function syncOpenUI(rawVal) {
  if (!E.host) return;
  var v = Math.round((rawVal || 0) * 100);
  var openInput = E.host.querySelector("#cbOpen");
  if (openInput) openInput.value = v;

  var lbl = E.host.querySelector("#cbOpenLabel");
  var valTag = E.host.querySelector("#cbOpenVal");
  if (valTag) valTag.textContent = v + "%";

  if (lbl) {
    var lang = E.lang || getLang();
    if (v === 0) {
      lbl.textContent = lang === "he" ? "🔒 סגור" : "🔒 Closed";
    } else if (v <= 40) {
      var p1 = Math.round((v / 40) * 100);
      lbl.textContent = lang === "he" ? "🚪 דלתות (" + p1 + "%)" : "🚪 Doors (" + p1 + "%)";
    } else if (v <= 80) {
      var p2 = Math.round(((v - 40) / 40) * 100);
      lbl.textContent = lang === "he" ? "🗄️ מגירות ונשלפים (" + p2 + "%)" : "🗄️ Drawers & pull-outs (" + p2 + "%)";
    } else {
      var p3 = Math.round(((v - 80) / 20) * 100);
      lbl.textContent = lang === "he" ? "🔓 פתוח מלא / כספת (" + p3 + "%)" : "🔓 Fully open & safe (" + p3 + "%)";
    }
  }

  var chips = E.host.querySelectorAll(".cb-chip-stage");
  chips.forEach(function (chip) {
    var cv = +chip.getAttribute("data-v");
    if ((cv === 0 && v === 0) || (cv === 40 && v > 0 && v <= 40) ||
        (cv === 80 && v > 40 && v <= 80) || (cv === 100 && v > 80)) {
      chip.classList.add("active");
      chip.setAttribute("aria-pressed", "true");
    } else {
      chip.classList.remove("active");
      chip.setAttribute("aria-pressed", "false");
    }
  });
}

/* ================= open / close ================= */

export function openCabinet(it) {
  if (E.host && E.lang !== getLang()) destroyDOM();
  if (!E.host) buildDOM();
  if (!it) return;
  // Any cabinet-ish piece can be converted; anything else gets a fresh unit.
  if (!it.cab) {
    pushHistory();
    it.cab = makeSpec(defaultPreset(famOf(it)), it.w, it.h, it.d);
    if (it.type !== "cabsys") it.type = "cabsys";
  } else pushHistory();
  E.it = it;
  /* A Done/open round trip is only a change of workspace visibility. Preserve
     the CAD timeline when it is the same item and the model still matches the
     timeline marker. If the inspector, an import, or another editor changed
     the item while we were closed, stale undo states are deliberately dropped. */
  specOf(E.it);
  var sameItem = E.histIt === it ||
    (E.histId != null && it.id != null && String(E.histId) === String(it.id));
  var resumeHistory = sameItem && H.matchesCurrent();
  E.open = true;
  if (!resumeHistory || !E.sel) E.sel = { col: 0, sec: 0 };
  // Use the exact same serializer as history/isEdited; JSON key order is part
  // of the compare key, so hand-building this with d/h swapped reports a false
  // modification even when every value is identical.
  E.base = stateOf();
  E.host.style.display = "flex";
  syncDimInputs();
  syncOpenUI(it.runtimeState && fin(it.runtimeState.cabinetOpen) ? it.runtimeState.cabinetOpen : it.cab.open || 0);
  if (resumeHistory) syncUndoButtons();
  else {
    H.clear();
  }
  E.histIt = it;
  E.histId = it.id != null ? it.id : null;
  setTool(null);
  E.q = "";
  E.host.querySelector("#cbSearch").value = "";
  var reopenAxis = resumeHistory && AXES[E.axis] ? E.axis : "front",
    reopenMode = resumeHistory && E.mode === "3d" ? "3d" : "2d";
  E.modeApplied = false;
  // Axis first because setAxis intentionally returns to the drawing; restore a
  // remembered 3D workspace only after the projected view has been selected.
  setAxis(reopenAxis);
  setMode(reopenMode);
  syncViewPreferences();
  fillFamilies();
  fillPresets();
  fillMine();
  sizeCanvas();
  syncSessionStatus();
  changed();
  E.base = stateOf();
  syncSessionStatus();
  if (!resumeHistory) {
    /* Rendering touches every derived cabinet rule once. Treat that normalized
       result—not the half-initialized input—as the honest opening checkpoint. */
    H.clear();
    H.seed();
  }
}

export function closeCabinet() {
  if (!E.open) return;
  dismissSizeDlg();
  E.open = false;
  E.host.style.display = "none";
  E.it = null;
  S.dirty3D = true;
  updateCost();
  render2D();
}

/* The way out of a whole editing session. In-designer undo deliberately stops
   at the boundary, so this — not Ctrl+Z held down — is what puts the cabinet
   back the way it was found. Escape lands here; the accent ✓ button closes and
   keeps. Anything worth losing gets a confirm first, since Escape is easy to
   hit by accident. */
export function cancelCabinet() {
  if (!E.open) return;
  if (isEdited() && !confirm(T("dropQ"))) return;
  revert();
  closeCabinet();
}
function isEdited() {
  return !!(E.base && E.it) && stateKey(stateOf()) !== stateKey(E.base);
}

function revert() {
  if (!E.base || !E.it) return;
  var s = JSON.parse(E.base);
  E.it.cab = s.cab;
  E.it.w = s.w;
  E.it.d = s.d;
  E.it.h = s.h;
  syncDimInputs();
  syncOpenUI(s.cab.open || 0);
  E.sel = { col: 0, sec: 0 };
  changed(true);
}

/* The model updates live, but Revert is scoped to this editor session. Keeping
   that boundary visible makes it clear when Escape would discard this session's
   work. */
function syncSessionStatus() {
  var tag = E.host && E.host.querySelector("#cbSession"), changed = isEdited();
  if (!tag) return;
  tag.textContent = changed ? T("modified") : T("original");
  tag.classList.toggle("is-modified", changed);
}

/* Mark the layout as hand-edited, so a later resize re-fits it instead of
   re-planning it from the preset and throwing the edit away. Structural edits
   call this; finishes and hardware do not. */
function touch() {
  if (sp()) sp().auto = false;
}

/* ================= undo inside the designer =================
   The app's own history takes one snapshot when the overlay opens; in here a
   design goes through dozens of small moves, so the designer keeps its own
   stack of spec snapshots and never touches the global one.

   That stack STOPS AT THE BOUNDARY: when it runs out, Ctrl+Z does nothing
   rather than falling through to the plan's history and silently discarding
   the whole session. Getting out of the session is Esc (or Revert), which puts
   back the spec as it was when the overlay opened. */
/* Rather than sprinkling snapshot calls over three dozen handlers, every pass
   through changed() compares the spec with the one it saw last and banks the
   previous state when it really differs. Door-opening is excluded so dragging
   the preview slider does not bury the stack. */
function stateOf() {
  return E.it ? JSON.stringify({ cab: E.it.cab, w: E.it.w, h: E.it.h, d: E.it.d }) : "";
}
function stateKey(json) {
  if (!json) return "";
  var o = JSON.parse(json);
  delete o.cab.open;
  return JSON.stringify(o);
}
/* ---- what is inside a design -------------------------------------------
   The history tree's second axis: which part of the cabinet a step touched.
   The nesting is the one the elevation already draws — cabinet, then its
   columns, then the compartments and the door in each — so scoping the panel
   to the compartment you have selected shows that compartment's own thread,
   and scoping to its column shows everything that happened inside it.
   `hid` (cabinet.js) is what keeps a column the same column after one is
   inserted in front of it. */
function scanSpec(str) {
  var o;
  try {
    o = JSON.parse(str);
  } catch (err) {
    return [];
  }
  var sp = o && o.cab;
  if (!sp) return [];
  var shell = Object.assign({}, sp);
  // the cabinet itself is its carcass and its styling; the things it CONTAINS
  // are objects of their own and must not mark it as changed too
  delete shell.cols;
  delete shell.hw;
  delete shell.dim;
  delete shell.open;
  var out = [
    { id: "cab", kind: "cabinet", label: presetLabel(sp.preset) || famLabel(sp.fam), sig: JSON.stringify(shell) },
    { id: "dim", parent: "cab", kind: "dim", label: T("size"), sig: [o.w, o.h, o.d].join("×") },
    { id: "hw", parent: "cab", kind: "hardware", label: T("hardware"), sig: JSON.stringify(sp.hw || {}) },
  ];
  (sp.cols || []).forEach(function (c, i) {
    var cid = "col:" + (c.hid || i);
    var body = Object.assign({}, c);
    delete body.secs;
    delete body.door;
    out.push({ id: cid, parent: "cab", kind: "column", label: T("column") + " " + (i + 1), sig: JSON.stringify(body) });
    out.push({
      id: "door:" + (c.hid || i), parent: cid, kind: "door",
      label: doorLabel((c.door && c.door.t) || "none"), sig: JSON.stringify(c.door || {}),
    });
    (c.secs || []).forEach(function (s, j) {
      out.push({
        id: "sec:" + (s.hid || i + "." + j), parent: cid, kind: "section",
        label: secLabel(s.t), sig: JSON.stringify(s),
      });
    });
  });
  return out;
}
/* The selection, named the way the scan names it, and the way back from a chip
   in the panel to the same selection. E.sel is a pair of INDEXES, so both
   directions go through the live spec. */
function specScope() {
  var s = sp();
  if (!s || !E.sel) return null;
  var col = s.cols[E.sel.col];
  if (!col) return null;
  if (E.sel.sec == null) return "col:" + (col.hid || E.sel.col);
  var sec = col.secs[E.sel.sec];
  return sec ? "sec:" + (sec.hid || E.sel.col + "." + E.sel.sec) : "col:" + (col.hid || E.sel.col);
}
function specPick(id) {
  var s = sp();
  if (!s) return;
  var at = id.indexOf(":"),
    kind = id.slice(0, at),
    key = id.slice(at + 1),
    found = null;
  s.cols.forEach(function (c, i) {
    if ((kind === "col" || kind === "door") && String(c.hid || i) === key) found = { col: i };
    (c.secs || []).forEach(function (sc, j) {
      if (kind === "sec" && String(sc.hid || i + "." + j) === key) found = { col: i, sec: j };
    });
  });
  if (!found) return;
  E.sel = found;
  draw();
  fillInspector();
  if (E.histPanel) E.histPanel.refreshNow();
}

const H = createHistory({
  get: stateOf,
  key: stateKey,
  scan: scanSpec,
  onChange: syncUndoButtons,
  set: function (json) {
    var s = JSON.parse(json);
    E.it.cab = s.cab;
    E.it.w = s.w;
    E.it.h = s.h;
    E.it.d = s.d;
    syncDimInputs();
    syncOpenUI(s.cab.open || 0);
    if (E.sel && E.sel.col >= s.cab.cols.length) E.sel = { col: 0, sec: 0 };
    changed(true);
  },
});
/* What the next recorded step is called. Handlers set it just before they
   mutate the spec; changed() consumes it. An edit that never names itself
   still gets a step — it just shows up as a generic one. */
function act(label) {
  E.act = label;
}
function commit() {
  if (!E.it) return;
  H.observe(E.act || T("opEdit"));
  E.act = null;
}
function undo() {
  H.undo();
}
function redo() {
  H.redo();
}
function syncUndoButtons() {
  if (!E.host) return;
  var u = E.host.querySelector("#cbUndo"), r = E.host.querySelector("#cbRedo");
  u.disabled = !H.canUndo();
  u.title = "Ctrl+Z · " + (H.undoLabel() || T("noUndo"));
  r.disabled = !H.canRedo();
  r.title = "Ctrl+Y · " + (H.redoLabel() || T("noRedo"));
  if (E.histPanel) E.histPanel.refresh();
}

/* --- a column on the clipboard, so a good one can be repeated --- */
/* One clipboard, two kinds of thing. Ctrl+C on a compartment copies the
   compartment; on a column header it copies the whole column — which is what
   you meant either way, since the selection already says which you are looking
   at. Paste puts the copy after whatever is selected, of the matching kind. */
function copyColumn() {
  if (!E.sel || !sp()) return;
  if (E.sel.sec != null) {
    var col = sp().cols[E.sel.col],
      s = col && col.secs[E.sel.sec];
    if (!s) return;
    E.clip = { kind: "sec", json: JSON.stringify(s) };
    flashHint(T("copySec") + " ✓");
    return;
  }
  E.clip = { kind: "col", json: JSON.stringify(sp().cols[E.sel.col]) };
  flashHint(T("copyCol") + " ✓");
}
function pasteColumn() {
  if (!E.clip || !sp()) return;
  var v = JSON.parse(E.clip.json);
  act(T("pasteCol"));
  touch();
  if (E.clip.kind === "sec") {
    var col = sp().cols[E.sel.col];
    if (!col) return;
    // the new compartment takes its share out of the one it lands next to,
    // so the column still adds up to the height it has
    var at = E.sel.sec == null ? col.secs.length - 1 : E.sel.sec,
      host = col.secs[at];
    if (host) {
      var half = host.h / 2;
      host.h = half;
      v.h = Math.min(v.h || half, half);
    }
    col.secs.splice(at + 1, 0, v);
    E.sel = { col: E.sel.col, sec: at + 1 };
  } else {
    delete v.fixed;
    sp().cols.splice(E.sel.col + 1, 0, v);
    E.sel = { col: E.sel.col + 1, sec: 0 };
  }
  changed();
}
function flashHint(msg) {
  var el2 = E.host.querySelector(".cb-hint");
  if (!el2) return;
  var old = el2.textContent;
  el2.textContent = msg;
  clearTimeout(E.hintT);
  E.hintT = setTimeout(function () {
    el2.textContent = old;
  }, 1400);
}

/* Everything that has to happen after any edit: re-fit the spec to the size
   (or re-plan it, while it is still the preset's own layout — see specOf),
   repaint the elevation and the preview, and let the app know. */
function changed(refit) {
  if (!E.it) return;
  specOf(E.it);
  syncCabinetDefinition(S, E.it, { propagate:true });
  clearVSpanCache();
  S.dirty3D = true;
  draw();
  updatePreview();
  fillInspector();
  if (E.q) fillHits(); // the search results act on the selection, so they follow it
  fillLook();
  fillTechnical();
  fillHardware();
  fillChecks();
  fillBOM();
  var sub = E.host.querySelector("#cbSub");
  if (sub) sub.textContent = cabSummary(E.it);
  syncSessionStatus();
  // the cost panel prices a modular cabinet from its actual board area and
  // ironmongery, so every edit in here moves the number
  updateCost();
  commit();
  if (refit) render2D();
}

// Doors/drawers are simulation state, not an authoring change. This path only
// regenerates the affected preview/runtime mesh and never solves the cabinet
// definition or adds a design-history step.
function runtimeChanged() {
  if (!E.it) return;
  clearVSpanCache();
  S.dirty3D = true;
  updatePreview();
  render2D();
}

/* ================= panels: collapse & search =================
   Eleven blocks open at once is a wall, not a panel. Every section folds to
   its title, the state is remembered between sessions, and the ones you rarely
   touch (finishes, ironmongery, checks, the bill) start folded — with what
   matters kept on the title itself, so a folded section still tells you the
   price and whether anything is wrong. */
var UIKEY = "home3d_cab_panels";

function panelState() {
  try {
    return JSON.parse(localStorage.getItem(UIKEY) || "{}");
  } catch (e) {
    return {};
  }
}
function paneOf(k) {
  return E.host && E.host.querySelector('[data-pane="' + k + '"]');
}
// which side owns a pane, so pressing an icon only re-lights its own bar
function sideOf(k) {
  var p = paneOf(k),
    box = p && p.closest(".cb-tabs");
  return box ? box.getAttribute("data-side") : "L";
}
function setTab(k, remember) {
  var side = sideOf(k);
  E.host.querySelectorAll('.cb-tabs[data-side="' + side + '"] .cb-pane').forEach(function (p) {
    p.classList.toggle("on", p.getAttribute("data-pane") === k);
  });
  E.host.querySelectorAll(".cb-icons button[data-tab]").forEach(function (b) {
    var t = b.getAttribute("data-tab");
    if (sideOf(t) === side) {
      var selected = t === k;
      b.classList.toggle("on", selected);
      b.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  });
  E["tab" + side] = k;
  if (remember !== false) {
    var st = panelState();
    st[side] = k;
    try {
      localStorage.setItem(UIKEY, JSON.stringify(st));
    } catch (e) {}
  }
}
function wireTabs() {
  E.host.querySelectorAll(".cb-icons button[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      setTab(b.getAttribute("data-tab"));
    });
  });
  var acts = {
    blank: startBlank,
    save: saveUserPreset,
    nest: function () {
      openNest(E.it);
    },
    png: exportPNG,
  };
  E.host.querySelectorAll(".cb-icons button[data-act]").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = acts[b.getAttribute("data-act")];
      if (f) f();
    });
  });
  var st = panelState();
  setTab(st.L || "presets", false);
  setTab(st.R || "insp", false);
}
export function initCabinetUI() {
  // "design this cabinet" on the item inspector — enabled for any piece, since
  // converting a plain wardrobe into a modular one is the usual way in
  var host = document.getElementById("itemProps");
  if (host) {
    var rowEl = el("div", "btn-row");
    var b = btn('<i class="ph ph-lockers"></i> <span>' + T("title") + "</span>", function () {
      if (S.sel && S.sel.kind === "item" && S.sel.ref) openCabinet(S.sel.ref);
    }, "btn-accent");
    b.id = "cabDesignBtn";
    b.style.width = "100%";
    rowEl.appendChild(b);
    onLangChange(function () {
      b.querySelector("span").textContent = T("title");
    });
    // sit right under the size fields rather than at the very bottom
    var anchor = document.getElementById("i_variant_box");
    if (anchor && anchor.parentNode === host) host.insertBefore(rowEl, anchor.nextSibling);
    else host.appendChild(rowEl);
  }

  /* And the other way in: a cabinet that starts as nothing. The library panel
     is where a new piece comes from, so the button lives beside the model
     editor's — it drops a fresh unit in the plan and opens it free-form and
     empty, with no type and nothing inside. */
  var lib = document.querySelector(".furn-panel") || document.querySelector(".furn-wrap");
  if (lib) {
    var nb = btn('<i class="ph ph-selection-plus"></i> <span>' + T("newCab") + "</span>", newCabinet, "");
    nb.id = "cabNewBtn";
    nb.style.width = "100%";
    nb.style.marginTop = "5px";
    lib.appendChild(nb);
    onLangChange(function () {
      nb.querySelector("span").textContent = T("newCab");
    });
  }
}

/* A cabinet from absolute zero: a new item in the plan, free-form, one empty
   bay, straight into the drawing tools. */
function newCabinet() {
  import("./ui.js").then(function (m) {
    m.addFurnItem("cabsys");
    var it = S.sel && S.sel.kind === "item" ? S.sel.ref : null;
    if (!it) return;
    var f = FAM.free;
    it.w = f.w;
    it.h = f.h;
    it.d = f.d;
    it.cab = makeBlankSpec("free", it.w, it.h, it.d);
    openCabinet(it);
    setTool("vwall");
  });
}

// Used by the action dispatcher (data-act="cabDesign") and the library panel.
export function openCabinetForSelection() {
  if (S.sel && S.sel.kind === "item" && S.sel.ref) openCabinet(S.sel.ref);
}
export function isCabinetOpen() {
  return E.open;
}

api.changed = changed;
api.act = act;
api.touch = touch;
api.flashHint = flashHint;
api.setTab = setTab;
api.setLevel = setLevel;
api.syncDimInputs = syncDimInputs;

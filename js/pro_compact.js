/* The Round-6 phone and fold chrome, second pass: every pixel it does not need
 * goes to the plan, the model or the cabinet.
 *
 *   header   ONE row in every editor: the editor knob, then what you are
 *            working on (the selection and its part code, the tool in hand,
 *            else the project), the view switch (2D · 3D, and Split on a fold),
 *            Undo, Redo and More. The strip row under it is gone.
 *   knob     Plan · Model · Cabinet as a small vertical drum: the editor in
 *            front, its neighbours curving away above and below. Swipe or tap
 *            a neighbour to turn it; tap the front (or press and hold) for the
 *            list. It runs pro_shell's switchEditor, so leaving an editor with
 *            unsaved work still asks first.
 *   dock     ONE slim bottom toolbar: the tools grid and the editor's browser
 *            (library, feature tree, cabinet families) at the start, the
 *            actions that fit what you are doing in the middle — the editors'
 *            own context rows (#m-ctx, #md-ctx, .cb-m-ctx), moved in whole — and
 *            the ask button at the end. No Undo or Redo: those are on top.
 *   ask      The command bar is no longer a permanent row. The ask button (one
 *            glyph for AI, command and voice) slides it up from the bottom in a
 *            panel, with the AI | Cmd switch and whatever the editor's AI says;
 *            press and hold the button to talk straight away.
 *
 * Everything moved keeps its node — ids, listeners — and goes home when the
 * layout is left (relocate). The old five-slot navigations stay in the page
 * as the buttons the dock and the header press. css/pro_compact.css lays it
 * out; the pure parts (knob order, title choice, recent tools) are in
 * js/compact_head.js. */
import { activeEditor, switchEditor } from "./pro_shell.js";
import { proTools, proLabel } from "./pro_catalog.js";
import { getLang } from "./i18n.js";
import { KNOB_ORDER, knobStep, knobOffset, pickTitle } from "./compact_head.js";
import { S } from "./state.js";
import { wallGeom, wallPointAt } from "./geometry.js";
import { sx, sz, rotatePx, planRotRad } from "./plan_view.js";
import { render2D } from "./plan2d.js";

var MSG = {
  plan: ["Plan", "תוכנית"],
  model: ["Model", "מודל"],
  cab: ["Cabinet", "ארון"],
  editor: ["Editor · swipe to switch", "עורך · החליקו כדי להחליף"],
  undo: ["Undo", "ביטול"],
  redo: ["Redo", "חזרה"],
  more: ["More", "עוד"],
  tools: ["All tools", "כל הכלים"],
  library: ["Library", "ספרייה"],
  tree: ["Feature tree", "עץ מאפיינים"],
  design: ["Designs", "עיצובים"],
  ask: ["Ask, type a tool or speak", "שאלו, הקלידו כלי או דברו"],
  askHead: ["Ask or run a tool", "שאלו או הפעילו כלי"],
  close: ["Close", "סגירה"],
  views: ["View · press and hold for more views", "תצוגה · לחיצה ארוכה לתצוגות נוספות"],
  edit: ["Edit properties", "עריכת מאפיינים"],
  part: ["Part", "חלק"],
  model3d: ["3D model", "מודל תלת־ממדי"],
  drawing: ["Drawing", "שרטוט"],
  done: ["Done", "סיום"],
  layers: ["Layers", "שכבות"],
  wallsLive: ["Walls can be moved: Structure is unlocked", "אפשר להזיז קירות: שכבת המבנה פתוחה"],
  sheetMore: ["Show all properties", "הצגת כל המאפיינים"],
  sheetLess: ["Show more of the plan", "הצגת יותר מהתוכנית"],
};
function he() { return getLang() === "he"; }
function M(key) { return MSG[key][he() ? 1 : 0]; }
var ICON = { plan: "ph-house-line", model: "ph-cube", cab: "ph-lockers" };

function $(id) { return document.getElementById(id); }
function q(sel) { return document.querySelector(sel); }
function body() { return document.body.classList; }

/* Move a node somewhere and remember where it came from (a comment left in its
   place); relocate(node, null) puts it back. */
export function relocate(node, target) {
  if (!node) return;
  if (!node._psHome && node.parentNode) {
    node._psHome = document.createComment("ps-home");
    node.parentNode.insertBefore(node._psHome, node);
  }
  if (target) { if (node.parentNode !== target) target.appendChild(node); }
  else if (node._psHome && node._psHome.parentNode && node.previousSibling !== node._psHome)
    node._psHome.parentNode.insertBefore(node, node._psHome.nextSibling);
}

/* ---- the three editors, as the compact chrome sees them ------------------ */
function pressPlan(key) {
  if ((key === "props" || key === "view") && window.__mobileShowSheet) { window.__mobileShowSheet(key); return; }
  var b = q('#mobile-nav [data-mnav="' + key + '"]');
  if (b) b.click();
}
function pressIn(nav, attr) {
  return function (key) {
    var b = q(nav + " [data-" + attr + '="' + key + '"]');
    if (b) b.click();
  };
}
var EDITORS = {
  plan: {
    root: function () { return document.body; },
    head: function () { return $("psPhoneHead"); },
    host: function () { return $("center-canvas"); },
    row: function () { return $("m-ctx"); },
    bar: function () { return q('.ps-cmdbar[data-ps-bar="plan"]'); },
    press: pressPlan,
    keys: { grid: "tools", browse: "add", more: "more", props: "props", view: "view" },
    browse: ["library", "ph-books"],
  },
  model: {
    root: function () { return $("modeler"); },
    head: function () { return q("#modeler .md-head"); },
    host: function () { return q("#modeler .md-mid"); },
    row: function () { return $("md-ctx"); },
    bar: function () { return q('.ps-cmdbar[data-ps-bar="model"]'); },
    press: pressIn("#md-nav", "mdnav"),
    keys: { grid: "cmd", browse: "tree", more: "more", props: "props", view: "view" },
    browse: ["tree", "ph-tree-structure"],
    view: "#mdModes",
    undo: "#mdUndo",
    redo: "#mdRedo",
  },
  cab: {
    root: function () { return $("cabdes"); },
    head: function () { return q("#cabdes .cb-head-main"); },
    host: function () { return q("#cabdes .cb-mid"); },
    row: function () { return q("#cabdes .cb-m-ctx"); },
    bar: function () { return q('.ps-cmdbar[data-ps-bar="cab"]'); },
    press: pressIn("#cabdes .cb-m-nav", "cbnav"),
    keys: { grid: "tools", browse: "design", more: "more", props: "props", view: "view" },
    browse: ["design", "ph-cards"],
    view: ".cb-vmodes",
    undo: "#cbUndo",
    redo: "#cbRedo",
    done: "#cbClose",
  },
};

/* ---- the knob ------------------------------------------------------------ */
var lastKnob = null; // the editor the last knob showed, so a new one turns from there
var knobMenu = null;

function buildKnob() {
  var k = document.createElement("div");
  k.className = "ps-edknob";
  k.tabIndex = 0;
  k.setAttribute("role", "listbox");
  k.innerHTML = '<div class="ps-edknob-drum">' + KNOB_ORDER.map(function (e) {
    return '<span class="ps-edknob-face" role="option" data-editor="' + e + '"><b></b></span>';
  }).join("") + "</div>";
  var start = null, held = 0, moved = false;
  k.addEventListener("pointerdown", function (e) {
    start = { y: e.clientY, t: Date.now() };
    moved = false;
    clearTimeout(held);
    held = setTimeout(function () { held = 0; if (start && !moved) { start = null; openKnobMenu(k); } }, 520);
    try { k.setPointerCapture(e.pointerId); } catch (_) {}
  });
  k.addEventListener("pointermove", function (e) {
    if (start && Math.abs(e.clientY - start.y) > 8) moved = true;
  });
  k.addEventListener("pointerup", function (e) {
    clearTimeout(held);
    if (!start) return;
    var dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dy) > 12) { turn(k, dy < 0 ? 1 : -1); return; }
    // a tap: on the neighbour peeking above or below turns to it, the front opens the list
    var r = k.getBoundingClientRect(), y = e.clientY - r.top;
    if (y < r.height * 0.28) turn(k, -1);
    else if (y > r.height * 0.72) turn(k, 1);
    else openKnobMenu(k);
  });
  k.addEventListener("pointercancel", function () { clearTimeout(held); start = null; });
  k.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp") { e.preventDefault(); turn(k, -1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); turn(k, 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openKnobMenu(k); }
  });
  return k;
}
function paintKnob(k, current, still) {
  var was = k.dataset.editor;
  k.dataset.editor = current;
  k.dataset.lang = getLang();
  k.setAttribute("aria-label", M("editor"));
  k.querySelectorAll(".ps-edknob-face").forEach(function (f) {
    var ed = f.dataset.editor, off = knobOffset(ed, current);
    // the face that wraps round the back of the drum jumps; the others turn
    var jump = still || (was && Math.abs(knobOffset(ed, was) - off) > 1);
    f.classList.toggle("ps-jump", !!jump);
    f.style.setProperty("--off", off);
    f.setAttribute("aria-selected", off === 0 ? "true" : "false");
    f.querySelector("b").textContent = M(ed);
  });
}
function setKnob(k, current) {
  if (!k.dataset.editor && lastKnob && lastKnob !== current) {
    // a knob that just appeared (the other editor's header) turns in from the last one
    paintKnob(k, lastKnob, true);
    requestAnimationFrame(function () { requestAnimationFrame(function () { paintKnob(k, current); }); });
  } else if (k.dataset.editor !== current || k.dataset.lang !== getLang()) paintKnob(k, current, !k.dataset.editor || k.dataset.editor === current);
  lastKnob = current;
}
function turn(k, step) {
  closeKnobMenu();
  var from = activeEditor(), to = knobStep(k.dataset.editor || from, step);
  go(k, to);
}
function go(k, to) {
  var from = activeEditor();
  if (to === from) { setKnob(k, from); return; }
  paintKnob(k, to);
  switchEditor(to).then(function (ok) {
    // refused (nothing to open, unsaved work kept): turn back
    if (!ok) setTimeout(function () { paintKnob(k, activeEditor()); lastKnob = activeEditor(); }, 120);
    else layoutCompact();
  });
}
function closeKnobMenu() {
  if (knobMenu) knobMenu.remove();
  knobMenu = null;
  document.removeEventListener("pointerdown", knobMenuOutside, true);
}
function knobMenuOutside(e) { if (knobMenu && !knobMenu.contains(e.target)) closeKnobMenu(); }
function openKnobMenu(k) {
  closeKnobMenu();
  var menu = document.createElement("div");
  menu.className = "ps-edknob-menu";
  menu.setAttribute("role", "menu");
  var cur = activeEditor();
  KNOB_ORDER.forEach(function (ed) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitemradio");
    b.setAttribute("aria-checked", ed === cur ? "true" : "false");
    b.innerHTML = '<i class="ph ' + ICON[ed] + '" aria-hidden="true"></i><span></span>';
    b.querySelector("span").textContent = M(ed);
    b.addEventListener("click", function () { closeKnobMenu(); go(k, ed); });
    menu.appendChild(b);
  });
  var r = k.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 6) + "px";
  menu.style.insetInlineStart = Math.round(he() ? window.innerWidth - r.right : r.left) + "px";
  document.body.appendChild(menu);
  knobMenu = menu;
  setTimeout(function () { document.addEventListener("pointerdown", knobMenuOutside, true); }, 0);
  var on = menu.querySelector('[aria-checked="true"]');
  if (on) on.focus();
}

/* ---- the one-row header -------------------------------------------------- */
function iconButton(cls, icon, label, run) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.innerHTML = '<i class="ph ' + icon + '" aria-hidden="true"></i>';
  b.dataset.label = label;
  // sheets these open must not meet this same tap as a "tap outside"
  b.addEventListener("click", function (e) { e.stopPropagation(); setTimeout(run, 0); });
  return b;
}
function labelIcons(root) {
  root.querySelectorAll("[data-label]").forEach(function (b) {
    var text = M(b.dataset.label);
    if (b.getAttribute("aria-label") !== text) { b.setAttribute("aria-label", text); b.title = text; }
  });
}
function pressUndo(which) {
  var b = q('#topbar [data-act="' + which + '"]');
  if (b) b.click();
}
function holdToView(el, ed) {
  var t = 0;
  el.addEventListener("pointerdown", function () {
    clearTimeout(t);
    t = setTimeout(function () { t = 0; EDITORS[ed].press(EDITORS[ed].keys.view); }, 560);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) { el.addEventListener(type, function () { clearTimeout(t); }); });
  el.addEventListener("contextmenu", function (e) { e.preventDefault(); EDITORS[ed].press(EDITORS[ed].keys.view); });
}
function buildTitle(ed) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "ps-title";
  b.innerHTML = '<span class="ps-title-main"><span class="ps-ph-name"></span><em class="ps-title-code"></em></span><span class="ps-title-sub"></span>';
  b.addEventListener("click", function (e) {
    // the title names the selection: tapping it opens its properties (after
    // this tap is over, or the drawers' "tap outside" rule shuts it again)
    e.stopPropagation();
    if (b.dataset.kind === "sel" || ed !== "plan") setTimeout(function () { EDITORS[ed].press(EDITORS[ed].keys.props); }, 0);
  });
  return b;
}
function fillTitle(b, title) {
  if (!b || !title) return;
  var main = b.querySelector(".ps-ph-name"), code = b.querySelector(".ps-title-code"), sub = b.querySelector(".ps-title-sub");
  if (main.textContent !== title.main) main.textContent = title.main;
  if (code.textContent !== (title.code || "")) code.textContent = title.code || "";
  code.hidden = !title.code;
  if (sub.textContent !== (title.sub || "")) sub.textContent = title.sub || "";
  sub.hidden = !title.sub;
  b.dataset.kind = title.kind;
  var label = [title.main, title.code, title.sub].filter(Boolean).join(" · ");
  if (b.getAttribute("aria-label") !== label) b.setAttribute("aria-label", label);
}
function toolLabel(editor, prefix, id) {
  var tool = id && proTools(editor).filter(function (x) { return x.bind === prefix + id; })[0];
  return tool ? proLabel(tool.label, he() ? "he" : "en") : "";
}
function titleOf(ed) {
  if (ed === "plan") return window.__plannerHeadTitle ? window.__plannerHeadTitle() : pickTitle({ project: "Home project" });
  if (ed === "model") {
    var m = window.__modelerHeadState ? window.__modelerHeadState() : null;
    if (!m) return pickTitle({});
    var tool = m.tool && m.tool !== "select" ? toolLabel("model", "mcmd:", m.tool) : "";
    if (m.sketch) return pickTitle({ toolName: m.sketch, toolSub: tool });
    if (m.part) return pickTitle({ selName: m.part, selSub: M("part") });
    return pickTitle({ project: m.model, place: m.mode === "drawing" ? M("drawing") : M("model3d") });
  }
  var c = window.__cabinetHeadState ? window.__cabinetHeadState() : null;
  if (!c) return pickTitle({});
  if (c.part) return pickTitle({ selName: c.part, selSub: c.partSize });
  return pickTitle({ selName: c.name, selCode: c.code, selSub: c.size });
}

/* The planner's view switch mirrors the strip's (mobile_shell.js), which stays
   in the page, hidden, and still does the switching. */
var VIEWS = [["plan", "2D"], ["3d", "3D"], ["split", null, "ph-rows"]];
function buildPlanView() {
  var g = document.createElement("div");
  g.className = "ps-view";
  g.setAttribute("role", "group");
  VIEWS.forEach(function (v) {
    var b = document.createElement("button");
    b.type = "button";
    b.dataset.view = v[0];
    b.innerHTML = v[2] ? '<i class="ph ' + v[2] + '" aria-hidden="true"></i>' : v[1];
    b.addEventListener("click", function () {
      var src = q('#m-editor-strip [data-m-pane="' + v[0] + '"]');
      if (src) src.click();
      syncPlanView(g);
    });
    g.appendChild(b);
  });
  holdToView(g, "plan");
  return g;
}
function syncPlanView(g) {
  if (!g) return;
  g.setAttribute("aria-label", M("views"));
  g.title = M("views");
  g.querySelectorAll("[data-view]").forEach(function (b) {
    var src = q('#m-editor-strip [data-m-pane="' + b.dataset.view + '"]');
    var on = !!(src && src.classList.contains("on"));
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    if (src) { var label = src.getAttribute("aria-label"); if (label && b.getAttribute("aria-label") !== label) b.setAttribute("aria-label", label); }
  });
}

function planHead() {
  var top = $("topbar");
  if (!top) return null;
  var head = $("psPhoneHead");
  if (head && !head.querySelector(".ps-edknob")) { head.remove(); head = null; } // an older layout's header
  if (!head) {
    head = document.createElement("div");
    head.id = "psPhoneHead";
    head.className = "ps-phone-head ps-head";
    head.appendChild(buildKnob());
    head.appendChild(buildTitle("plan"));
    head.appendChild(buildPlanView());
    var undo = iconButton("ps-hbtn", "ph-arrow-counter-clockwise", "undo", function () { pressUndo("undo"); });
    undo.dataset.ph = "undo";
    var redo = iconButton("ps-hbtn", "ph-arrow-clockwise", "redo", function () { pressUndo("redo"); });
    redo.dataset.ph = "redo";
    var more = iconButton("ps-hbtn", "ph-dots-three", "more", function () { pressPlan("more"); });
    more.dataset.ph = "more";
    head.append(undo, redo, more);
    top.appendChild(head);
  }
  return head;
}
function editorHead(ed) {
  var spec = EDITORS[ed], hostHead = spec.head();
  if (!hostHead) return null;
  var head = hostHead.querySelector(":scope > .ps-head");
  if (!head) {
    head = document.createElement("div");
    head.className = "ps-head";
    head.appendChild(buildKnob());
    head.appendChild(buildTitle(ed));
    head.appendChild(document.createElement("span")).className = "ps-head-view";
    head.appendChild(document.createElement("span")).className = "ps-head-hist";
    if (spec.done) head.appendChild(document.createElement("span")).className = "ps-head-done";
    var more = iconButton("ps-hbtn", "ph-dots-three", "more", function () { spec.press(spec.keys.more); });
    head.appendChild(more);
    hostHead.appendChild(head);
    holdToView(head.querySelector(".ps-head-view"), ed);
  }
  relocate(q(spec.view), head.querySelector(".ps-head-view"));
  relocate(q(spec.undo), head.querySelector(".ps-head-hist"));
  relocate(q(spec.redo), head.querySelector(".ps-head-hist"));
  if (spec.done) {
    var done = q(spec.done);
    relocate(done, head.querySelector(".ps-head-done"));
    if (done) { done.setAttribute("aria-label", M("done")); done.title = M("done"); }
  }
  return head;
}
function releaseEditorHead(ed) {
  var spec = EDITORS[ed];
  [spec.view, spec.undo, spec.redo, spec.done].forEach(function (sel) {
    var n = sel && q(sel);
    if (n && n.closest(".ps-head")) relocate(n, null);
  });
}

/* ---- the dock ------------------------------------------------------------ */
var ASK_ICON = '<svg class="ps-ask-glyph" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M8 3.2l1.5 3.8 3.8 1.5-3.8 1.5L8 13.8 6.5 10 2.7 8.5 6.5 7z" fill="currentColor"/>' +
  '<path d="M3.5 18.6h6.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
  '<path d="M15.2 9.6v5M18.2 7v10.2M21.2 10.6v3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

function buildDock(ed) {
  var spec = EDITORS[ed];
  var dock = document.createElement("div");
  dock.className = "ps-dock";
  dock.dataset.editor = ed;
  dock.setAttribute("role", "toolbar");
  var grid = iconButton("ps-dock-grid", "ph-squares-four", "tools", function () { spec.press(spec.keys.grid); });
  var browse = iconButton("ps-dock-browse", spec.browse[1], spec.browse[0], function () { spec.press(spec.keys.browse); });
  var slot = document.createElement("div");
  slot.className = "ps-dock-slot";
  var ask = document.createElement("button");
  ask.type = "button";
  ask.className = "ps-dock-ask";
  ask.dataset.label = "ask";
  ask.innerHTML = ASK_ICON;
  var held = 0, voice = false;
  ask.addEventListener("pointerdown", function () {
    voice = false;
    clearTimeout(held);
    held = setTimeout(function () { held = 0; voice = true; openAsk(ed, true); }, 480);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) { ask.addEventListener(type, function () { clearTimeout(held); }); });
  ask.addEventListener("click", function () {
    if (voice) { voice = false; return; }
    if (askPanel && askPanel.dataset.editor === ed) closeAsk(); else openAsk(ed, false);
  });
  ask.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  dock.append(grid, browse, slot, ask);
  return dock;
}
function placeDock(ed) {
  var spec = EDITORS[ed], host = spec.host();
  if (!host) return;
  var dock = host.querySelector(":scope > .ps-dock");
  if (!dock) { dock = buildDock(ed); host.appendChild(dock); }
  labelIcons(dock);
  relocate(spec.row(), dock.querySelector(".ps-dock-slot"));
}
function releaseDock(ed) {
  var row = EDITORS[ed].row();
  if (row && row.closest(".ps-dock")) relocate(row, null);
}

/* ---- the ask panel ------------------------------------------------------- */
var askPanel = null, askBar = null;
function openAsk(ed, voice) {
  closeAsk();
  var spec = EDITORS[ed], host = spec.host(), bar = spec.bar();
  if (!host || !bar) return;
  var panel = document.createElement("div");
  panel.className = "ps-ask";
  panel.dataset.editor = ed;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", M("askHead"));
  panel.innerHTML = '<div class="ps-ask-grip" aria-hidden="true"></div><div class="ps-ask-head"><b></b><button type="button" class="ps-ask-x"><i class="ph ph-x" aria-hidden="true"></i></button></div><div class="ps-ask-slot"></div>';
  panel.querySelector("b").textContent = M("askHead");
  var x = panel.querySelector(".ps-ask-x");
  x.setAttribute("aria-label", M("close"));
  x.addEventListener("click", closeAsk);
  // swipe the grip (or the head) down to put it away
  var y0 = null;
  panel.addEventListener("pointerdown", function (e) { if (e.target.closest(".ps-ask-grip, .ps-ask-head")) y0 = e.clientY; });
  panel.addEventListener("pointerup", function (e) { if (y0 != null && e.clientY - y0 > 40) closeAsk(); y0 = null; });
  host.appendChild(panel);
  ["left", "width", "transform", "bottom"].forEach(function (p) { bar.style[p] = ""; });
  relocate(bar, panel.querySelector(".ps-ask-slot"));
  askPanel = panel;
  askBar = bar;
  body().add("ps-ask-open");
  var input = bar.querySelector(".ps-cmd-input");
  if (voice) { var mic = bar.querySelector(".ps-mic"); if (mic) mic.click(); }
  else if (input) input.focus();
  if (input && !input._psAskWired) {
    input._psAskWired = true;
    // a tool that ran (the field cleared, no AI card waiting) is done with the panel
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && askPanel) { e.preventDefault(); closeAsk(); return; }
      if (e.key !== "Enter") return;
      setTimeout(function () {
        if (askPanel && !input.value && !askPanel.querySelector(".ea-card")) closeAsk();
      }, 80);
    });
  }
  var list = bar.querySelector(".ps-suggest");
  if (list && !list._psAskWired) {
    list._psAskWired = true;
    list.addEventListener("click", function () { setTimeout(function () { if (askPanel && !askPanel.querySelector(".ea-card")) closeAsk(); }, 80); });
  }
  setTimeout(function () { document.addEventListener("pointerdown", askOutside, true); }, 0);
}
function askOutside(e) {
  if (!askPanel || askPanel.contains(e.target)) return;
  if (e.target.closest(".ps-dock-ask, .ps-suggest, .agent-dock")) return;
  closeAsk();
}
export function closeAsk() {
  document.removeEventListener("pointerdown", askOutside, true);
  if (askBar) relocate(askBar, null);
  if (askPanel) askPanel.remove();
  askPanel = null;
  askBar = null;
  // (only when set: a no-op class change still wakes the body's class observers)
  if (body().contains("ps-ask-open")) body().remove("ps-ask-open");
}
// the planner's AI answers in its own dock: the panel steps aside for it
if (typeof window !== "undefined") {
  window.addEventListener("keydown", function (e) { if (e.key === "Escape" && askPanel) closeAsk(); });
}

/* ---- layers: one chip, not a panel over the plan ---------------------------
   The planner's layer chips (ui_layers.js) ran as a strip over the top of the
   plan on a phone, wider than the screen, and as a card over the plan's corner
   on a desktop. In the Round-6 layouts they fold into one chip in the corner
   that names the layer you are working on; tapping it drops the list down
   (every layer's name, eye, lock and menu), tapping the plan puts it away.
   The chip also carries the "walls can be moved" warning (Structure is the
   work set and unlocked), which used to be an orange frame round the whole
   drawing. */
function workLayer() {
  var on = q('#layer-chips .lchip-name[aria-checked="true"]') || q("#layer-chips .lchip.on .lchip-name");
  return on ? { icon: (on.querySelector("i") || {}).className || "ph ph-stack", name: on.textContent.trim() } : null;
}
export function placeLayersChip() {
  var host = $("view-2d");
  if (!host) return;
  var chip = $("psLayersChip");
  if (!chip) {
    chip = document.createElement("button");
    chip.type = "button";
    chip.id = "psLayersChip";
    chip.className = "ps-layers-chip";
    chip.innerHTML = '<i class="ph ph-stack" aria-hidden="true"></i><span></span><i class="ph ph-caret-down ps-layers-caret" aria-hidden="true"></i>';
    chip.addEventListener("click", function () { body().toggle("ps-layers-open"); chip.setAttribute("aria-expanded", body().contains("ps-layers-open") ? "true" : "false"); });
    host.appendChild(chip);
    // the warning follows the layer state at once, not on the next pass
    if (typeof MutationObserver !== "undefined") new MutationObserver(function () { placeLayersChip(); }).observe(host, { attributes: true, attributeFilter: ["class"] });
    var plan = $("plan");
    if (plan) plan.addEventListener("pointerdown", function () { if (body().contains("ps-layers-open")) { body().remove("ps-layers-open"); chip.setAttribute("aria-expanded", "false"); } }, true);
  }
  var w = workLayer();
  var live = host.classList.contains("structure-live");
  if (chip.classList.contains("ps-warn") !== live) chip.classList.toggle("ps-warn", live);
  var label = M("layers") + (w ? " · " + w.name : "") + (live ? " · " + M("wallsLive") : "");
  var span = chip.querySelector("span");
  if (w && span.textContent !== w.name) span.textContent = w.name;
  if (w) { var ic = chip.querySelector("i"); if (ic.className !== w.icon) ic.className = w.icon; }
  if (chip.getAttribute("aria-label") !== label) { chip.setAttribute("aria-label", label); chip.title = label; }
}

/* ---- the phone inspector: half a screen, the selection kept in view -------
   It opens at about half the height (a handle on top takes it to full and
   back), and the plan pans so what it edits sits in the part still showing
   instead of under the sheet. */
var inspWasOpen = false;
function selectionPoint() {
  var sel = S.sel, ref = sel && sel.ref;
  if (!ref) return null;
  if (sel.kind === "item" && isFinite(ref.x) && isFinite(ref.z)) return { x: ref.x, z: ref.z };
  if (sel.kind === "wall") { var g = wallGeom(ref); return g && g.L > 0 ? wallPointAt(ref, g.L / 2) : null; }
  if (sel.kind === "opening") {
    var w = (S.walls || []).filter(function (x) { return x.id === ref.wall; })[0];
    return w ? wallPointAt(w, Number(ref.s) || 0) : null;
  }
  return null;
}
function keepSelectionInView() {
  var insp = $("right-inspector"), plan = $("plan"), p = selectionPoint();
  if (!insp || !plan || !p || !body().contains("show-right")) return;
  var pr = plan.getBoundingClientRect(), top = insp.getBoundingClientRect().top - pr.top;
  var at = rotatePx(sx(p.x), sz(p.z));
  if (!(top > 80) || (at.y > 24 && at.y < top - 24)) return;
  // move the view by the screen distance, turned back into the unrotated frame
  var dy = top / 2 - at.y, a = -planRotRad();
  S.OX += -dy * Math.sin(a);
  S.OY += dy * Math.cos(a);
  render2D();
}
function placeInspectorGrip() {
  var insp = $("right-inspector");
  if (!insp) return;
  var open = body().contains("show-right") && body().contains("sheet-drawers");
  if (open && !inspWasOpen) setTimeout(keepSelectionInView, 260);
  if (!open && body().contains("ps-insp-full")) body().remove("ps-insp-full");
  inspWasOpen = open;
  var grip = insp.querySelector(":scope > .ps-sheet-grip");
  if (!grip) {
    grip = document.createElement("button");
    grip.type = "button";
    grip.className = "ps-sheet-grip";
    grip.innerHTML = "<span></span>";
    var y0 = null;
    grip.addEventListener("pointerdown", function (e) { y0 = e.clientY; });
    grip.addEventListener("pointerup", function (e) {
      var dy = y0 == null ? 0 : e.clientY - y0;
      y0 = null;
      if (dy < -16) body().add("ps-insp-full");
      else if (dy > 16) body().remove("ps-insp-full");
      else body().toggle("ps-insp-full");
      setTimeout(keepSelectionInView, 260);
    });
    insp.insertBefore(grip, insp.firstChild);
  }
  var label = M(body().contains("ps-insp-full") ? "sheetLess" : "sheetMore");
  if (grip.getAttribute("aria-label") !== label) { grip.setAttribute("aria-label", label); grip.title = label; }
}

/* ---- the model editor's hint ---------------------------------------------
   One line at the top of the model that says what the tool wants, then gets
   out of the way: a few seconds after it last changed it fades, and it comes
   back the moment it says something new. A selection hint or a flash (the
   editor's own warnings) stays until the editor clears it. */
function watchHint(hint) {
  if (!hint || hint._psWatched || typeof MutationObserver === "undefined") return;
  hint._psWatched = true;
  var timer = 0;
  var wake = function () {
    if (hint.classList.contains("ps-quiet")) hint.classList.remove("ps-quiet");
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!hint.classList.contains("selection") && !hint.classList.contains("flash")) hint.classList.add("ps-quiet");
    }, 4500);
  };
  /* The words, not the attributes: touching the class list (even to remove a
     class that is not there) queues a mutation, so watching it would wake the
     hint forever. */
  new MutationObserver(wake).observe(hint, { childList: true, characterData: true, subtree: true });
  wake();
}

/* ---- one pass ------------------------------------------------------------ */
function phoneSplitGuard() {
  // Split needs the width of a fold: a phone keeps 2D or 3D
  if (!body().contains("pro-compact") || body().contains("dock-rail")) return;
  var cc = $("center-canvas");
  if (cc && !cc.classList.contains("max-view-2d") && !cc.classList.contains("max-view-3d") && window.__setViewMode) window.__setViewMode("plan");
}
export function layoutCompact() {
  var on = body().contains("pro-compact");
  var active = on ? activeEditor() : null;
  Object.keys(EDITORS).forEach(function (ed) {
    var open = on && (ed === "plan" || ed === active);
    if (!open) {
      if (ed !== "plan") releaseEditorHead(ed);
      releaseDock(ed);
      if (askPanel && askPanel.dataset.editor === ed) closeAsk();
      return;
    }
    var head = ed === "plan" ? planHead() : editorHead(ed);
    if (head) {
      labelIcons(head);
      var knob = head.querySelector(".ps-edknob");
      if (knob && (ed === active || ed === "plan")) setKnob(knob, ed);
      fillTitle(head.querySelector(".ps-title"), titleOf(ed));
      if (ed === "plan") syncPlanView(head.querySelector(".ps-view"));
    }
    placeDock(ed);
    if (ed === "model") watchHint(q("#modeler #mdHint"));
    if (ed === "plan") { placeLayersChip(); placeInspectorGrip(); }
  });
  if (on) phoneSplitGuard();
}
/* The title follows the selection and the tool at once, not on the next pass. */
var titleFrame = 0;
export function refreshTitles() {
  if (titleFrame || !document.body.classList.contains("pro-compact")) return;
  titleFrame = requestAnimationFrame(function () {
    titleFrame = 0;
    var ed = activeEditor();
    var head = ed === "plan" ? $("psPhoneHead") : EDITORS[ed].head() && EDITORS[ed].head().querySelector(":scope > .ps-head");
    if (head) fillTitle(head.querySelector(".ps-title"), titleOf(ed));
    if (ed === "plan" && head) syncPlanView(head.querySelector(".ps-view"));
  });
}
if (typeof window !== "undefined") {
  // and once more a moment later: the selection's name is written on the next frame
  ["planner-selection", "planner-tool", "planner-place"].forEach(function (type) {
    window.addEventListener(type, function () { refreshTitles(); setTimeout(refreshTitles, 90); });
  });
  document.addEventListener("pointerup", refreshTitles, true);
  document.addEventListener("keyup", refreshTitles, true);
  /* An editor's overlay being added (the cabinet designer is rebuilt per
     open) or shown (the model editor's is reused) gets its header and
     toolbar in the next frame, not on the shell's next 1.5s pass. */
  var layoutFrame = 0;
  var soon = function () {
    if (layoutFrame || !document.body.classList.contains("pro-compact")) return;
    layoutFrame = requestAnimationFrame(function () { layoutFrame = 0; layoutCompact(); });
  };
  var watchOverlay = function () {
    var md = $("modeler");
    if (md && !md._psWatched) { md._psWatched = true; new MutationObserver(soon).observe(md, { attributes: true, attributeFilter: ["style", "class"] }); }
  };
  var startWatch = function () {
    new MutationObserver(function () { watchOverlay(); soon(); }).observe(document.body, { childList: true });
    watchOverlay();
  };
  if (document.body) startWatch(); else document.addEventListener("DOMContentLoaded", startWatch);
  // the length of the segment being drawn is in the title while it is drawn
  document.addEventListener("pointermove", function () { if (document.body.classList.contains("pro-compact")) refreshTitles(); }, { capture: true, passive: true });
}

/* The planner's left panel in the Round-6 desktop layout (screen v6-plan-work):
 * four tabs on one segmented track — Parts · Layers · Library · History — over
 * one pane at a time.
 *
 *   Parts    the rooms & items tree (#treeBody), with a "Find a part…" field
 *   Layers   the work-set layer rows (#layer-chips, js/ui_layers.js), moved in
 *            from the plan's corner; the tab carries the "walls can be moved"
 *            dot the corner chip carried
 *   Library  the furniture library, as before
 *   History  the edit history (#planHist, js/history.js), which otherwise
 *            lives in a header dropdown
 *
 * The planner's other panes (the project guide, smart home, and the structure
 * checks: MEP, parameters, constraint warnings) are not in the mockup; the ⋯
 * button at the end of the track lists them, so nothing becomes unreachable.
 *
 * The planner owns #leftTabs and #left-sidebar[data-left] (js/planner_chrome.js,
 * which accepts only its own five ids). The two new panes are shown by this
 * module's own attribute, data-ps-left, which wins over data-left while set;
 * any press on the planner's own tabs clears it. Everything moved keeps its
 * node and goes home on a phone, a fold, or the classic layout. */
import { getLang, onLangChange } from "./i18n.js";
import { relocate } from "./pro_compact.js";

var MSG = {
  parts: ["Parts", "חלקים"],
  layers: ["Layers", "שכבות"],
  library: ["Library", "ספרייה"],
  history: ["History", "היסטוריה"],
  more: ["More panels", "חלוניות נוספות"],
  project: ["Project guide", "מדריך הפרויקט"],
  home: ["Smart home", "בית חכם"],
  structure: ["Structure checks", "בדיקות מבנה"],
  find: ["Find a part…", "חיפוש חלק…"],
  none: ["No part matches", "אין חלק מתאים"],
  wallsLive: ["Walls can be moved: Structure is unlocked", "אפשר להזיז קירות: שכבת המבנה פתוחה"],
};
function M(key) { return MSG[key][getLang() === "he" ? 1 : 0]; }
function $(id) { return document.getElementById(id); }

var TABS = [
  { id: "parts", pane: "tree" },
  { id: "layers", own: true },
  { id: "library", pane: "library" },
  { id: "history", own: true },
];
var MORE = [
  { id: "project", icon: "ph-clipboard-text" },
  { id: "home", icon: "ph-house" },
  { id: "structure", icon: "ph-building-office" },
];
var LS = "mf.proLeft";
var track = null, menu = null, built = false;

function store(v) {
  try { if (v == null) return localStorage.getItem(LS); localStorage.setItem(LS, v); } catch (_) {}
  return null;
}
function left() { return $("left-sidebar"); }
function plannerTab(id) {
  // the planner's own tab switch (setLeftTab persists and marks its buttons)
  if (window.__plannerChrome && window.__plannerChrome.setLeftTab) window.__plannerChrome.setLeftTab(id);
  else { var b = document.querySelector('#leftTabs [data-left-tab="' + id + '"]'); if (b) b.click(); }
}

function build() {
  var side = left(), tabs = $("leftTabs");
  if (!side || !tabs) return false;
  track = document.createElement("div");
  track.className = "ps-left-tabs";
  track.setAttribute("role", "tablist");
  TABS.forEach(function (tab) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.dataset.psTab = tab.id;
    b.addEventListener("click", function () { show(tab.id); });
    track.appendChild(b);
  });
  var more = document.createElement("button");
  more.type = "button";
  more.className = "ps-left-more";
  more.innerHTML = '<i class="ph ph-dots-three" aria-hidden="true"></i>';
  more.setAttribute("aria-haspopup", "menu");
  more.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(more); });
  track.appendChild(more);
  tabs.before(track);

  // the two panes this layout adds
  [["layers", "ps-left-layers"], ["history", "ps-left-history"]].forEach(function (p) {
    var pane = document.createElement("div");
    pane.className = "panel-section ps-left-pane " + p[1];
    pane.dataset.psPane = p[0];
    side.appendChild(pane);
  });
  // Parts: a field that narrows the tree
  var treePane = side.querySelector('[data-left-pane="tree"]');
  if (treePane && !treePane.querySelector(".ps-part-find")) {
    var find = document.createElement("label");
    find.className = "ps-part-find";
    find.innerHTML = '<i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="search" autocomplete="off" spellcheck="false"><span class="ps-part-none" hidden></span>';
    var tree = treePane.querySelector("#tree");
    treePane.insertBefore(find, tree || null);
    var input = find.querySelector("input");
    input.addEventListener("input", filterTree);
    input.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Escape") { input.value = ""; filterTree(); } });
    var body = $("treeBody");
    // the tree is rebuilt on every change: narrow it again each time
    if (body && typeof MutationObserver !== "undefined") new MutationObserver(filterTree).observe(body, { childList: true });
  }
  // a press on the planner's own tabs (the classic set, or a search result
  // that opens one) leaves this layout's panes
  tabs.addEventListener("click", function () { clearOwn(); }, true);
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(sync).observe(side, { attributes: true, attributeFilter: ["data-left", "data-ps-left"] });
    var v2 = $("view-2d");
    if (v2) new MutationObserver(syncWarn).observe(v2, { attributes: true, attributeFilter: ["class"] });
  }
  document.addEventListener("pointerdown", function (e) { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  onLangChange(label);
  built = true;
  return true;
}

function filterTree() {
  var find = document.querySelector("#left-sidebar .ps-part-find");
  var body = $("treeBody");
  if (!find || !body) return;
  var q = find.querySelector("input").value.trim().toLowerCase();
  var shown = 0, rows = body.querySelectorAll(".trRoom, .trItem");
  var room = null, roomHit = false, roomKids = [];
  function closeRoom() {
    if (room) room.hidden = !!q && !roomHit && !roomKids.some(function (r) { return !r.hidden; });
  }
  rows.forEach(function (row) {
    var hit = !q || row.textContent.toLowerCase().indexOf(q) >= 0;
    if (row.classList.contains("trRoom")) {
      closeRoom();
      room = row; roomHit = hit; roomKids = [];
      if (hit) shown++;
      return;
    }
    // a room that matches keeps all its parts
    row.hidden = !!q && !hit && !roomHit;
    if (!row.hidden) shown++;
    roomKids.push(row);
  });
  closeRoom();
  var none = find.querySelector(".ps-part-none");
  none.hidden = !q || shown > 0;
  none.textContent = M("none");
}

function show(id) {
  var tab = TABS.filter(function (t) { return t.id === id; })[0];
  if (!tab) return;
  closeMenu();
  store(id);
  var side = left();
  if (tab.own) side.setAttribute("data-ps-left", id);
  else { side.removeAttribute("data-ps-left"); plannerTab(tab.pane); }
  sync();
}
function clearOwn() {
  var side = left();
  if (side && side.hasAttribute("data-ps-left")) side.removeAttribute("data-ps-left");
}

function current() {
  var side = left();
  if (!side) return "";
  var own = side.getAttribute("data-ps-left");
  if (own) return own;
  var pane = side.getAttribute("data-left");
  var hit = TABS.filter(function (t) { return t.pane === pane; })[0];
  return hit ? hit.id : "more:" + pane;
}
function sync() {
  if (!track) return;
  var cur = current();
  track.querySelectorAll("[data-ps-tab]").forEach(function (b) {
    var on = b.dataset.psTab === cur;
    if (b.classList.contains("on") !== on) b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  var more = track.querySelector(".ps-left-more");
  var inMore = cur.indexOf("more:") === 0;
  if (more.classList.contains("on") !== inMore) more.classList.toggle("on", inMore);
}
function syncWarn() {
  if (!track) return;
  var v2 = $("view-2d"), live = !!(v2 && v2.classList.contains("structure-live"));
  var b = track.querySelector('[data-ps-tab="layers"]');
  if (!b || b.classList.contains("ps-warn") === live) return;
  b.classList.toggle("ps-warn", live);
  b.title = live ? M("wallsLive") : "";
}
function label() {
  if (!track) return;
  track.querySelectorAll("[data-ps-tab]").forEach(function (b) { b.textContent = M(b.dataset.psTab); });
  var more = track.querySelector(".ps-left-more");
  more.setAttribute("aria-label", M("more"));
  more.title = M("more");
  var input = document.querySelector("#left-sidebar .ps-part-find input");
  if (input) { input.placeholder = M("find"); input.setAttribute("aria-label", M("find")); }
  closeMenu();
}

function toggleMenu(anchor) {
  if (menu) { closeMenu(); return; }
  menu = document.createElement("div");
  menu.className = "ps-left-menu";
  menu.setAttribute("role", "menu");
  MORE.forEach(function (m) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.innerHTML = '<i class="ph ' + m.icon + '" aria-hidden="true"></i><span></span>';
    b.querySelector("span").textContent = M(m.id);
    b.addEventListener("click", function () { clearOwn(); plannerTab(m.id); closeMenu(); sync(); });
    menu.appendChild(b);
  });
  var r = anchor.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 6) + "px";
  menu.style.left = Math.round(Math.max(8, r.right - 200)) + "px";
  document.body.appendChild(menu);
  anchor.setAttribute("aria-expanded", "true");
}
function closeMenu() {
  if (!menu) return;
  menu.remove();
  menu = null;
  var more = track && track.querySelector(".ps-left-more");
  if (more) more.setAttribute("aria-expanded", "false");
}

/** Show one of this layout's tabs ("history", "layers"…); false when the
    layout is not up (the caller then falls back to its own way). */
export function showLeftTab(id) {
  if (!built || !document.body.classList.contains("pro-skin")) return false;
  show(id);
  return true;
}

if (typeof window !== "undefined") window.__proShowLeftTab = showLeftTab;

/** One pass: `on` is the Round-6 desktop layout. */
export function placeLeft(on) {
  var side = left();
  if (!side) return;
  if (!on) {
    relocate($("layer-chips"), null);
    relocate($("planHist"), null);
    closeMenu();
    return;
  }
  if (!built && !build()) return;
  relocate($("layer-chips"), side.querySelector(".ps-left-layers"));
  var hist = $("planHist");
  // the History popover borrows the node while it is open (js/history_pop.js)
  if (hist && !hist.closest(".pr-hist-pop")) relocate(hist, side.querySelector(".ps-left-history"));
  if (!side.dataset.psLeftInit) {
    side.dataset.psLeftInit = "1";
    var saved = store();
    if (saved === "layers" || saved === "history") side.setAttribute("data-ps-left", saved);
    label();
  }
  sync();
  syncWarn();
}

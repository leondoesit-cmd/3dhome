/* Mobile shell — the phone/foldable chrome that sits on top of the desktop UI.

   The desktop editor spends its screen on four stacked horizontal bars (topbar,
   floor strip, floating tool rail, CAD status) and a five-slot nav that mixes
   two different meanings. On a 375px phone that is ~27% of the display, all of
   it inside the thumb arc, with Undo two taps deep inside a menu and Delete
   scrolled off the end of a rail.

   This module replaces that with exactly two rows, both thumb-height:

     #m-ctx    a CONTEXTUAL row: Undo/Redo are pinned to its leading edge in
               every state, and the rest changes with the active tool, the
               selection, and which pane is showing. It never scrolls — if a
               state has more than three contextual actions, the surplus belongs
               in a sheet, not in a rail the user has to swipe.
     #mobile-nav   five FIXED slots (View / Tools / Add / Properties / More).
               Each opens a bottom sheet instead of a side drawer, so the plan
               stays visible behind it and a piece can be dragged straight from
               the library onto the canvas.

   Everything here is inert unless <body> carries .compact-nav — the desktop
   layout is untouched, and the same DOM/state classes (show-left, show-right,
   max-view-*) still drive it, so no other module has to know this exists. */

import { S } from "./state.js";
import { t, onLangChange } from "./i18n.js";
import { setTool } from "./interaction.js";
import { undo, redo, canUndo, canRedo } from "./history.js";
import { toggleAid } from "./cad_hud.js";
import { onAfterRender } from "./plan2d.js";

var ctxBar = null,
  sheet = null,
  sheetBody = null,
  sheetTitle = null,
  backdrop = null;
var openSheet = null; // key of the sheet currently up, or null
var lastSig = ""; // context-bar signature; a rebuild only happens when it changes

function $(id) {
  return document.getElementById(id);
}
function compact() {
  return document.body.classList.contains("compact-nav");
}
function run(act) {
  if (window.__runAction) window.__runAction(act);
}

/* ---- view mode ---------------------------------------------------------- */

function viewMode() {
  var cc = $("center-canvas");
  if (!cc) return "split";
  return cc.classList.contains("max-view-2d")
    ? "plan"
    : cc.classList.contains("max-view-3d")
      ? "3d"
      : "split";
}
var VIEW_ICONS = { plan: "ph-blueprint", "3d": "ph-cube", split: "ph-rows" };
var VIEW_LABELS = { plan: "nav_plan", "3d": "nav_3d", split: "nav_split" };

/* ---- selection ---------------------------------------------------------- */

function selKind() {
  return S.sel ? S.sel.kind : null;
}
// Stable-enough identity for the current selection, so the context row is only
// rebuilt when the selection actually changes rather than once per frame.
function selId() {
  var s = S.sel;
  if (!s) return "";
  if (s.kind === "items") return "items:" + (s.refs || []).length;
  var r = s.ref;
  return s.kind + ":" + (r && (r.id != null ? r.id : r) );
}
/* ---- the contextual row ------------------------------------------------- */

var DRAW_TOOLS = ["wall", "arcwall", "rect", "door", "window", "passage", "slabvoid", "point", "erase"];
function drawing() {
  return DRAW_TOOLS.indexOf(S.tool) >= 0;
}

function aidChip(key, label) {
  return {
    kind: "chip",
    label: t(label),
    on: !!S[key],
    run: function () {
      toggleAid(key);
    },
  };
}

/* Up to three contextual actions, chosen by what the user is actually doing.
   Undo/Redo are added by render() and are deliberately NOT part of this list:
   they must never move or disappear, whatever the state. */
function ctxActions() {
  if (viewMode() === "3d") {
    return [
      { icon: "ph-cursor-click", label: t("m_edit3d"), on: !!S.edit3D, run: function () { run("edit3d"); } },
      { icon: "ph-crosshair-simple", label: t("frame"), run: function () { run("frame"); } },
      { icon: "ph-camera", label: t("photo"), run: function () { run("photo"); } },
    ];
  }
  if (drawing()) {
    // Mid-draw the aids ARE the controls: they decide what the next click
    // produces. Escape doubles as "put the tool down".
    return [
      aidChip("ortho", "cad_ortho"),
      aidChip("gsnap", "cad_grid"),
      { icon: "ph-x", label: t("m_endtool"), run: function () { setTool("select"); } },
    ];
  }
  if (selKind()) {
    return [
      /* Short verbs on purpose: five labelled controls share ~360px here, and
         a label that ellipses ("Dupl…") is worse than a shorter true word. */
      { icon: "ph-copy", label: t("m_a_dup"), run: function () { run("dupSel"); } },
      { icon: "ph-sliders-horizontal", label: t("m_a_props"), run: function () { showSheet("props"); } },
      { icon: "ph-trash", label: t("m_a_del"), danger: true, run: function () { run("deleteSel"); } },
    ];
  }
  return [aidChip("osnap", "cad_osnap"), aidChip("ortho", "cad_ortho"), aidChip("gsnap", "cad_grid")];
}

function btn(spec) {
  var b = document.createElement("button");
  b.type = "button";
  b.className =
    "mctx-btn" +
    (spec.danger ? " danger" : "") +
    (spec.on ? " on" : "") +
    (spec.iconOnly ? " mctx-icon-only" : "");
  if (spec.kind === "chip") {
    b.classList.add("mctx-chip");
    b.textContent = spec.label;
    b.setAttribute("aria-pressed", spec.on ? "true" : "false");
  } else {
    b.innerHTML =
      '<i class="ph ' + spec.icon + '"></i>' +
      (spec.iconOnly ? "" : "<span>" + spec.label + "</span>");
  }
  if (spec.disabled) b.disabled = true;
  b.setAttribute("aria-label", spec.label);
  b.addEventListener("click", function (e) {
    e.preventDefault();
    spec.run();
    sync(true);
  });
  return b;
}

function renderCtx() {
  if (!ctxBar) return;
  ctxBar.innerHTML = "";
  var u = document.createElement("div");
  u.className = "mctx-undo";
  /* Icon-only on purpose: these two are the least contextual thing in a
     contextual row and the two glyphs nobody has to read. Dropping their words
     is what buys the three real actions room to keep theirs on a 360px phone. */
  u.appendChild(
    btn({ icon: "ph-arrow-u-up-left", label: t("undo"), iconOnly: true, disabled: !canUndo(), run: undo }),
  );
  u.appendChild(
    btn({ icon: "ph-arrow-u-up-right", label: t("redo"), iconOnly: true, disabled: !canRedo(), run: redo }),
  );
  ctxBar.appendChild(u);
  ctxActions().forEach(function (a) {
    ctxBar.appendChild(btn(a));
  });
}

/* ---- bottom sheets ------------------------------------------------------ */

function ensureSheet() {
  if (sheet) return;
  backdrop = document.createElement("div");
  backdrop.id = "m-sheet-backdrop";
  backdrop.addEventListener("click", closeSheet);
  document.body.appendChild(backdrop);

  sheet = document.createElement("div");
  sheet.id = "m-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.innerHTML =
    '<div class="m-sheet-grip" aria-hidden="true"></div>' +
    '<div class="m-sheet-head"><h4 id="m-sheet-title"></h4>' +
    '<button type="button" class="m-sheet-x" aria-label="Close"><i class="ph ph-x"></i></button></div>' +
    '<div class="m-sheet-body" id="m-sheet-body"></div>';
  document.body.appendChild(sheet);
  sheetBody = sheet.querySelector("#m-sheet-body");
  sheetTitle = sheet.querySelector("#m-sheet-title");
  sheet.querySelector(".m-sheet-x").addEventListener("click", closeSheet);

  /* Drag the grip down to dismiss, up to go full height. A sheet that can only
     be closed by a small X is a sheet the user fights; the half-height default
     is the point of the pattern (the plan stays visible behind it), so the
     gesture has to be able to give that height back. */
  var y0 = 0,
    live = false;
  sheet.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length !== 1) return;
      var onGrip = e.target.closest(".m-sheet-grip, .m-sheet-head");
      live = !!onGrip;
      y0 = e.touches[0].clientY;
    },
    { passive: true },
  );
  sheet.addEventListener(
    "touchmove",
    function (e) {
      if (!live || e.touches.length !== 1) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 70) {
        live = false;
        closeSheet();
      } else if (dy < -50) {
        live = false;
        sheet.classList.add("tall");
      }
    },
    { passive: true },
  );
  sheet.addEventListener("touchend", function () {
    live = false;
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openSheet) closeSheet();
  });
}

function closeSheet() {
  openSheet = null;
  if (sheet) {
    sheet.classList.remove("on", "tall");
    sheet.setAttribute("aria-modal", "false");
  }
  if (backdrop) backdrop.classList.remove("on");
  document.body.classList.remove("m-sheet-open");
  // The library and inspector are real panels, not sheet content: they are
  // shown in place (see showSheet) and have to be put back too.
  document.body.classList.remove("show-left", "show-right");
  syncNav();
}

function showSheet(key) {
  ensureSheet();
  if (window.__hideCtxMenu) window.__hideCtxMenu();
  if (openSheet === key) return closeSheet();
  // The two panel keys reuse the existing drawers, restyled as sheets by CSS.
  if (key === "add" || key === "props") {
    sheet.classList.remove("on", "tall");
    backdrop.classList.add("on");
    document.body.classList.add("m-sheet-open");
    document.body.classList.toggle("show-left", key === "add");
    document.body.classList.toggle("show-right", key === "props");
    if (key === "add") {
      var libTab = document.querySelector('#leftTabs [data-left-tab="library"]');
      if (libTab) libTab.click();
      var libraryPanel = document.querySelector("#left-sidebar");
      if (libraryPanel) {
        libraryPanel.scrollTop = 0;
        libraryPanel.querySelectorAll(".left-content, .panel-content, [data-left-panel]").forEach(function (node) {
          node.scrollTop = 0;
        });
      }
    }
    openSheet = key;
    syncNav();
    return;
  }
  document.body.classList.remove("show-left", "show-right");
  sheetBody.innerHTML = "";
  if (key === "tools") buildToolsSheet();
  else if (key === "view") buildViewSheet();
  else if (key === "more") buildMoreSheet();
  sheetTitle.textContent = t(
    key === "tools" ? "msheet_tools" : key === "view" ? "msheet_view" : "msheet_more",
  );
  openSheet = key;
  sheet.classList.add("on");
  sheet.setAttribute("aria-modal", "true");
  backdrop.classList.add("on");
  document.body.classList.add("m-sheet-open");
  syncNav();
}

/* Tools: the same commands as the desktop rail, but as a labelled grid. The
   rail's failure on a phone was not its size, it was that it scrolled — three
   of eleven commands (erase, lock, delete) lived past the right edge, so the
   only way to find them was to swipe a toolbar nobody knew was swipeable. */
function buildToolsSheet() {
  var grid = document.createElement("div");
  grid.className = "m-grid";
  var rail = $("plan-toolbar");
  if (!rail) return;
  rail.querySelectorAll("button").forEach(function (src) {
    var tool = src.getAttribute("data-tool");
    var act = src.getAttribute("data-act");
    if (!tool && !act) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "m-grid-btn";
    if (src.classList.contains("tool-delete")) b.classList.add("danger");
    if (tool && S.tool === tool) b.classList.add("on");
    if (src.disabled) b.disabled = true;
    var ico = src.querySelector("i");
    /* Deliberately NOT the rail's tooltip: those are sentences written to be
       hovered ("Lock walls/rooms (L) — blocks accidental dragging"), and a
       grid of sentences is unreadable. Short names, one per command. */
    var shortKey = "m_t_" + (tool || act);
    var label = t(shortKey);
    if (label === shortKey) {
      var key = src.getAttribute("data-i18n-title");
      label = key ? t(key) : src.title || tool || act;
    }
    b.innerHTML =
      '<i class="' + (ico ? ico.className : "ph ph-square") + '"></i><span>' + label + "</span>";
    b.addEventListener("click", function () {
      if (tool) {
        setTool(tool);
        // Drawing needs the whole plan: a tool picked from a sheet while 3D or
        // the split is showing would otherwise land on a pane you can't draw in.
        if (tool !== "select" && window.__setViewMode) window.__setViewMode("plan");
      } else run(act);
      closeSheet();
    });
    grid.appendChild(b);
  });
  sheetBody.appendChild(grid);
}

function buildViewSheet() {
  var grid = document.createElement("div");
  grid.className = "m-grid m-grid-3";
  ["plan", "3d", "split"].forEach(function (k) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "m-grid-btn" + (viewMode() === k ? " on" : "");
    b.innerHTML = '<i class="ph ' + VIEW_ICONS[k] + '"></i><span>' + t(VIEW_LABELS[k]) + "</span>";
    b.addEventListener("click", function () {
      if (window.__setViewMode) window.__setViewMode(k);
      closeSheet();
      sync(true);
    });
    grid.appendChild(b);
  });
  sheetBody.appendChild(grid);
}

/* More: mirrors the topbar rather than restating it. Cloning the live menus
   means a command added to File/Edit/Export shows up here without a second
   edit — the usual way a phone menu drifts out of date. */
function buildMoreSheet() {
  /* A quick row of the global buttons, named explicitly rather than swept out
     of .tb-end: half of that row is hidden on a phone on purpose (the legacy
     chrome, the drawer toggles), and theme/language are hidden BY this shell —
     a sweep would either lose the ones that belong here or resurrect the ones
     that don't. */
  var quick = document.createElement("div");
  quick.className = "m-grid m-grid-4";
  ["btn_settings", "themeToggle", "langBtn", "shortcutsBtn", "friendsBtn"].forEach(function (id) {
    var src = document.getElementById(id);
    if (!src) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "m-grid-btn";
    var ico = src.querySelector("i");
    var key = src.getAttribute("data-i18n-title") || src.getAttribute("data-i18n-aria");
    b.innerHTML =
      '<i class="' + (ico ? ico.className : "ph ph-gear") + '"></i><span>' +
      (key ? t(key) : src.getAttribute("aria-label") || src.title || "") +
      "</span>";
    b.addEventListener("click", function () {
      closeSheet();
      src.click();
    });
    quick.appendChild(b);
  });
  if (quick.children.length) sheetBody.appendChild(quick);

  document.querySelectorAll("#topbar .dropdown").forEach(function (dd) {
    var trigger = dd.querySelector(".dropdown-trigger");
    var menu = dd.querySelector(".dropdown-menu") || (menuOf(dd));
    if (!trigger || !menu) return;
    var h = document.createElement("h5");
    h.className = "m-sheet-sec";
    var tk = trigger.querySelector("span[data-i18n]");
    h.textContent = tk ? tk.textContent : trigger.getAttribute("aria-label") || "";
    sheetBody.appendChild(h);
    var list = document.createElement("div");
    list.className = "m-list";
    menu.querySelectorAll("button[data-act]").forEach(function (src) {
      var act = src.getAttribute("data-act");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "m-list-btn" + (src.classList.contains("menu-danger") ? " danger" : "");
      if (src.disabled) b.disabled = true;
      var ico = src.querySelector("i");
      var lab = src.querySelector("span");
      b.innerHTML =
        '<i class="' + (ico ? ico.className : "ph ph-dot") + '"></i><span>' +
        (lab ? lab.textContent : act) +
        "</span>";
      b.addEventListener("click", function () {
        closeSheet();
        run(act);
      });
      list.appendChild(b);
    });
    if (list.children.length) sheetBody.appendChild(list);
  });
}
// Topbar menus are portaled to <body> when first opened (the glass topbar
// clips fixed children), so a dropdown may no longer hold its own menu.
function menuOf(dd) {
  var found = null;
  document.querySelectorAll("body > .dropdown-menu").forEach(function (m) {
    if (m._dd === dd) found = m;
  });
  return found;
}

/* ---- nav ---------------------------------------------------------------- */

function syncNav() {
  var nav = $("mobile-nav");
  if (!nav) return;
  var mode = viewMode();
  nav.querySelectorAll("[data-mnav]").forEach(function (b) {
    var k = b.dataset.mnav;
    var on = openSheet === k;
    b.classList.toggle("active", on);
    b.setAttribute("aria-expanded", on ? "true" : "false");
    if (k === "view") {
      // The view slot is a switcher, not a menu: it has to say which view you
      // are in, or it costs a tap just to find out.
      var i = b.querySelector("i"),
        s = b.querySelector("span");
      if (i) i.className = "ph " + VIEW_ICONS[mode];
      if (s) s.textContent = t(VIEW_LABELS[mode]);
    } else if (k === "tools") {
      var ti = b.querySelector("i"),
        ts = b.querySelector("span");
      var src = document.querySelector('#plan-toolbar [data-tool="' + (S.tool || "select") + '"] i');
      if (ti) ti.className = src ? src.className : "ph ph-cursor";
      if (ts) ts.textContent = t("mnav_tools");
      b.classList.toggle("armed", (S.tool || "select") !== "select");
    } else if (k === "props") {
      b.disabled = !selKind() && openSheet !== "props";
    }
  });
}

function initNav() {
  var nav = $("mobile-nav");
  if (!nav) return;
  nav.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mnav]");
    if (!b || b.disabled) return;
    showSheet(b.dataset.mnav);
  });
}

/* ---- pulse -------------------------------------------------------------- */

/* One signature covers everything the two rows read. Rebuilding on a change of
   signature (rather than every painted frame) keeps a drag at 60fps: the plan
   repaints continuously while a wall is being dragged, and rebuilding a row of
   buttons inside that loop is a layout per frame for no visible difference. */
function sig() {
  return [
    viewMode(),
    S.tool || "select",
    selId(),
    canUndo() ? 1 : 0,
    canRedo() ? 1 : 0,
    S.osnap ? 1 : 0,
    S.ortho ? 1 : 0,
    S.gsnap ? 1 : 0,
    S.edit3D ? 1 : 0,
  ].join("|");
}

var lastSel = "";
function sync(force) {
  if (!compact()) return;
  var s = sig();
  if (!force && s === lastSig) return;
  lastSig = s;
  /* A tap that lands on a piece changes a row of buttons the finger is
     covering. The buzz is the confirmation the user can actually perceive. */
  var cur = selId();
  if (cur && cur !== lastSel && navigator.vibrate) navigator.vibrate(8);
  lastSel = cur;
  renderCtx();
  syncNav();
}

export function initMobileShell() {
  if (!$("mobile-nav")) return;
  ctxBar = document.createElement("div");
  ctxBar.id = "m-ctx";
  ctxBar.setAttribute("role", "toolbar");
  ctxBar.setAttribute("aria-label", "Context actions");
  document.body.appendChild(ctxBar);

  initNav();
  ensureSheet();
  applyTouchHints();
  window.addEventListener("resize", applyTouchHints);
  onAfterRender(function () {
    sync(false);
  });
  window.addEventListener("planner-tool", function () {
    sync(true);
  });
  /* Picking a library item arms placement; keeping the borrowed library panel
     over the plan makes the next required tap impossible on a phone. */
  window.addEventListener("planner-place", function () {
    if (openSheet === "add" && S.placeType) closeSheet();
  });
  /* visualViewport reacts to the software keyboard where window.resize is
     inconsistent. --kb lifts sheets and inspectors so a focused field stays
     in the visible half (iOS ignores interactive-widget=resizes-content). */
  function syncKeyboard() {
    var kb = 0;
    var vv = window.visualViewport;
    if (compact() && vv) {
      kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    }
    document.documentElement.style.setProperty("--kb", kb + "px");
  }
  document.addEventListener("focusin", function (e) {
    if (!compact() || !e.target.matches("input, select, textarea")) return;
    setTimeout(function () {
      syncKeyboard();
      e.target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  });
  document.addEventListener("focusout", function () {
    setTimeout(syncKeyboard, 80);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncKeyboard);
    window.visualViewport.addEventListener("scroll", syncKeyboard);
  }
  window.addEventListener("resize", function () {
    syncKeyboard();
    sync(true);
  });
  syncKeyboard();
  onLangChange(function () {
    sync(true);
    if (openSheet && openSheet !== "add" && openSheet !== "props") showSheet(openSheet);
  });
  /* Selection can change from the 3D pane and from the tree, neither of which
     repaints the plan. A quarter-second poll on the signature is cheaper than
     threading a selection event through five modules, and the signature test
     means it does nothing at all when nothing changed. */
  setInterval(function () {
    sync(false);
  }, 250);
  /* One-time touch gesture coach mark for first-time mobile users. */
  if (!localStorage.getItem("mf_touch_onboarded")) {
    setTimeout(function () {
      if (!compact()) return;
      var tip = document.createElement("div");
      tip.className = "touch-coach";
      tip.setAttribute("role", "status");
      tip.textContent = t("touch_coach");
      tip.style.cssText = "position:fixed;bottom:calc(var(--mobile-nav-block) + var(--m-ctx-block) + 8px);"
        + "left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:12px;"
        + "background:rgba(0,0,0,.82);color:#fff;font-size:12px;font-weight:600;"
        + "z-index:200;white-space:normal;text-align:center;max-width:min(92vw, 360px);"
        + "pointer-events:auto;backdrop-filter:blur(8px);"
        + "-webkit-backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,0,0,.3);animation:sheetUp .28s ease;";
      document.body.appendChild(tip);
      var dismiss = function () {
        if (tip.parentElement) tip.parentElement.removeChild(tip);
        localStorage.setItem("mf_touch_onboarded", "1");
      };
      tip.addEventListener("click", dismiss);
      setTimeout(dismiss, 6000);
    }, 2000);
  }
  sync(true);
}

// Let other modules (main.js's view switcher) close a sheet that no longer
// matches what is on screen.
/* The pane hints are written for a mouse and a keyboard ("Shift/right-drag",
   "WASD"). Swapping the i18n KEY rather than the text keeps them correct after
   a language change, which re-applies every data-i18n attribute from scratch. */
function applyTouchHints() {
  /* Keyed off the POINTER, not off the compact layout: under .compact-nav the
     hint is hidden outright (css), so the swap earns its keep on the devices in
     between — touch laptops and big tablets that keep the desktop chrome and
     still have no Shift key under a finger. */
  var touch = false;
  try {
    touch = window.matchMedia("(pointer: coarse)").matches;
  } catch (_) {}
  touch = touch || (navigator.maxTouchPoints || 0) > 0;
  [
    ["#view-3d .hint", "hint_3d", "hint_touch_3d"],
    ["#view-2d .hint", "hint_2d", "hint_touch_2d"],
  ].forEach(function (row) {
    var el = document.querySelector(row[0]);
    if (!el) return;
    var key = touch ? row[2] : row[1];
    if (el.getAttribute("data-i18n") === key) return;
    el.setAttribute("data-i18n", key);
    el.textContent = t(key);
  });
}

export function refreshMobileShell() {
  sync(true);
}

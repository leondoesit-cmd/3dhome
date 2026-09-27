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
               state has more than four contextual actions, the surplus belongs
               in a sheet, not in a rail the user has to swipe. The verbs are
               the ones that KIND answers to, not one row reused everywhere:
               Rotate on a piece, Flip swing on a door, Add door on a wall.
     #mobile-nav   five FIXED slots (View / Build / Add / Edit / More).
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
import { onAfterRender, render2D, updatePlanGizmo } from "./plan2d.js";
import { mountPagedMenu, releasePagedMenu } from "./mobile_pages.js";
import { editorSwitchHTML, wireEditorSwitch } from "./pro_shell.js";
import { detectRooms, roomName } from "./geometry.js";
import { partCode } from "./part_codes.js";
import { flabel } from "./furniture_meta.js";
import { inside } from "./layout_analysis.js";

var ctxBar = null,
  sheet = null,
  sheetBody = null,
  sheetTitle = null,
  backdrop = null,
  coach = null,
  coachCopy = null,
  coachAction = null;
var openSheet = null; // key of the sheet currently up, or null
var sheetReturnFocus = null;
var lastSig = ""; // context-bar signature; a rebuild only happens when it changes
var libraryPageHost = null;
var transientPageHosts = [];
var onboardingActive = false;
var onboardingStage = "";
var coachTimer = 0;
var coachCopyKey = "";
var coachActionKey = "";
var MOBILE_FLOW_KEY = "mf_mobile_first_project_done";

function pageInspector() {
  var active = document.querySelector("#right-inspector .grp.props.on");
  if (!active) return;
  document.querySelectorAll("#right-inspector .grp.props.mobile-paged-menu").forEach(function (panel) {
    if (panel !== active) releasePagedMenu(panel);
  });
  /* Walls already own semantic tabs. Room, opening and furniture dimensions need one
     predictable scrolling form, without another pager hiding essential fields. */
  if (active.id === "wallProps" || active.id === "roomProps" || active.id === "itemProps" || active.id === "openingProps") {
    releasePagedMenu(active);
    return;
  }
  mountPagedMenu(active, {
    pinSelector: "#selname2, #selname_items, #selname3, #selname4, #selname_sv, #selname_mk, #selname_con, #selname_nd, #selname_walls",
    namedTabs: true,
  });
}

function pageLibrary() {
  if (libraryPageHost) releasePagedMenu(libraryPageHost);
  libraryPageHost = null;
  /* Libraries are browsed and searched, not completed like a form. Keep their
     named categories in one natural scrolling surface instead of splitting
     them behind page dots. */
}

function pageTransientMenus() {
  if (!compact()) return;
  var open = Array.from(document.querySelectorAll(".dropdown-menu.open, #ctx-menu.as-sheet"));
  transientPageHosts.forEach(function (host) {
    if (open.indexOf(host) < 0) releasePagedMenu(host);
  });
  transientPageHosts = open;
  open.forEach(function (host) {
    if (!host.classList.contains("mobile-paged-menu")) mountPagedMenu(host);
  });
}

function releasePages() {
  if (sheetBody) releasePagedMenu(sheetBody);
  if (libraryPageHost) releasePagedMenu(libraryPageHost);
  libraryPageHost = null;
  document.querySelectorAll("#right-inspector .grp.props.mobile-paged-menu").forEach(releasePagedMenu);
}

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
  if (S.viewAxis && S.viewAxis !== "top") return S.viewAxis;
  return cc.classList.contains("max-view-2d")
    ? "plan"
    : cc.classList.contains("max-view-3d")
      ? "3d"
      : "split";
}
var VIEW_ICONS = {
  plan: "ph-blueprint",
  "3d": "ph-cube",
  split: "ph-rows",
  front: "ph-arrow-up",
  back: "ph-arrow-down",
  left: "ph-arrow-left",
  right: "ph-arrow-right",
};
var VIEW_LABELS = {
  plan: "nav_plan",
  "3d": "nav_3d",
  split: "nav_split",
  front: "elev_front",
  back: "elev_back",
  left: "elev_left",
  right: "elev_right",
};

/* Plan means the top-down plan. An elevation can remain selected while the 3D
   pane is showing, so merely switching panes would otherwise bring the user
   back to a side view under a control labelled Plan. */
function setView(k) {
  /* A drawing gesture cannot remain half-armed behind the 3D pane. Returning
     to Plan and tapping once must start a fresh gesture, not finish an
     invisible wall/rectangle from before the inspection detour. */
  if (k !== "plan" && drawing()) setTool("select");
  if (k === "plan") {
    S.viewAxis = "top";
    render2D();
    updatePlanGizmo();
  }
  if (window.__setViewMode) window.__setViewMode(k);
}

/* ---- editor strip ------------------------------------------------------- */

/* The row under the top bar (Round 6 phone mockups): the shared editor
   switcher — Plan · Model · Cabinet, the same control the desktop ribbon and
   both editor headers carry — and the three panes one tap each. The nav's View
   slot stays a Plan <-> 3D flip; Split no longer needs its long press.

   The strip is static in #app's column, so the workspace shrinks under it, and
   css adds its height to --mobile-topbar-block for everything fixed below. */
var strip = null;
var STRIP_VIEWS = [
  ["plan", "2D"],
  ["3d", "3D"],
  ["split", null, VIEW_ICONS.split],
];
function buildStrip() {
  var top = $("topbar");
  if (!top) return;
  if (!strip) {
    strip = document.createElement("div");
    strip.id = "m-editor-strip";
    strip.className = "m-editor-strip";
    top.parentNode.insertBefore(strip, top.nextSibling);
    strip.addEventListener("click", function (e) {
      var b = e.target.closest("[data-m-pane]");
      if (!b) return;
      if (openSheet) closeSheet();
      setView(b.dataset.mPane);
      sync(true);
    });
  }
  strip.setAttribute("role", "toolbar");
  strip.setAttribute("aria-label", t("m_strip_aria"));
  strip.innerHTML =
    editorSwitchHTML("plan", "m-editors") +
    '<div class="pr-editors m-panes" role="group" aria-label="' + t("m_panes_aria") + '">' +
    STRIP_VIEWS.map(function (v) {
      var label = t(VIEW_LABELS[v[0]]);
      return '<button type="button" data-m-pane="' + v[0] + '" aria-label="' + label + '" title="' + label + '">' +
        (v[2] ? '<i class="ph ' + v[2] + '" aria-hidden="true"></i>' : v[1]) + "</button>";
    }).join("") +
    "</div>";
  wireEditorSwitch(strip);
  syncStrip();
}
/* The pane actually showing, not viewMode(): an elevation is still the 2D
   pane, and 2D here returns it to the top-down plan like the nav's Plan. */
function syncStrip() {
  if (!strip) return;
  var cc = $("center-canvas");
  var pane = !cc ? "split" : cc.classList.contains("max-view-2d") ? "plan" : cc.classList.contains("max-view-3d") ? "3d" : "split";
  strip.querySelectorAll("[data-m-pane]").forEach(function (b) {
    var on = b.dataset.mPane === pane;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

/* ---- fold rail ---------------------------------------------------------- */

/* Unfolded foldables (the dock-rail posture) get the Round-6 fold layout: a
   rail of the catalog's tabs beside the plan, and the picked tab's tools
   docked above the inspector in the end column — tools and properties side by
   side with the drawing, where a phone has to stack them in sheets. The rail
   is a column of #workspace, so the plan narrows rather than being covered;
   css shows it only under body.dock-rail. The grid comes from the pro catalog
   (js/pro_ribbon.js, window.__proToolTabs), so every tool here is the same
   binding the desktop ribbon runs. */
var foldRail = null, foldPanel = null, foldTab = null;
function foldTabs() { return window.__proToolTabs ? window.__proToolTabs.tabs("plan") : []; }
function buildFoldRail() {
  var ws = $("workspace"), canvas = $("center-canvas");
  if (!ws || !canvas || !window.__proToolTabs) return;
  if (!foldRail) {
    foldRail = document.createElement("nav");
    foldRail.id = "m-fold-rail";
    foldRail.className = "m-fold-rail";
    ws.insertBefore(foldRail, canvas);
    foldRail.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fold-tab]");
      if (!b) return;
      var index = Number(b.dataset.foldTab);
      if (foldTab === index) closeFoldTools();
      else openFoldTab(index);
    });
  }
  foldRail.setAttribute("aria-label", t("m_fold_rail"));
  foldRail.innerHTML = foldTabs().map(function (tab) {
    return '<button type="button" data-fold-tab="' + tab.index + '" aria-pressed="false" title="' + escapeAttr(tab.full) + '">' +
      '<i class="ph ' + tab.icon + '" aria-hidden="true"></i><span>' + escapeAttr(tab.label) + "</span></button>";
  }).join("");
  syncFoldRail();
  if (foldTab != null) renderFoldPanel();
}
function escapeAttr(v) {
  return String(v).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}
function syncFoldRail() {
  if (!foldRail) return;
  foldRail.querySelectorAll("[data-fold-tab]").forEach(function (b) {
    var on = Number(b.dataset.foldTab) === foldTab;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
function renderFoldPanel() {
  var host = $("right-inspector");
  if (!host) return;
  if (!foldPanel) {
    foldPanel = document.createElement("section");
    foldPanel.id = "m-fold-tools";
    foldPanel.className = "m-fold-tools";
    foldPanel.innerHTML = '<header><strong></strong><button type="button" class="m-fold-x"><i class="ph ph-x" aria-hidden="true"></i></button></header><div class="m-fold-body"></div>';
    foldPanel.querySelector(".m-fold-x").addEventListener("click", closeFoldTools);
  }
  if (foldPanel.parentNode !== host) host.insertBefore(foldPanel, host.firstChild);
  var tab = foldTabs()[foldTab];
  if (!tab) return;
  foldPanel.querySelector("strong").textContent = t("m_fold_all", { tab: tab.full, n: tab.count });
  foldPanel.querySelector(".m-fold-x").setAttribute("aria-label", t("close"));
  foldPanel.setAttribute("aria-label", tab.full);
  // A tool that arms a drawing tool keeps the panel: the plan is beside it.
  window.__proToolTabs.render(foldPanel.querySelector(".m-fold-body"), "plan", foldTab, function () { sync(true); });
}
function openFoldTab(index) {
  foldTab = index;
  document.body.classList.add("m-fold-open");
  renderFoldPanel();
  syncFoldRail();
  // The panel lives at the head of the docked inspector column.
  if (openSheet !== "props") showSheet("props");
  foldPanel.scrollTop = 0;
  window.dispatchEvent(new Event("resize"));
}
function closeFoldTools() {
  if (foldTab == null) return;
  var hadSelection = !!selKind();
  foldTab = null;
  document.body.classList.remove("m-fold-open");
  syncFoldRail();
  // Opened only to hold the tools: close the column with them.
  if (openSheet === "props" && !hadSelection) closeSheet();
  window.dispatchEvent(new Event("resize"));
}

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

/* The compact top bar is the stable identity line for every inspector. Mirror
   the live inspector heading instead of rebuilding its naming rules here: it
   keeps custom item/room names and translations identical to Properties. */
function syncTopSelection() {
  var identity = $("m-top-selection");
  var nameOut = $("m-top-selection-name");
  var phaseOut = $("m-top-selection-phase");
  if (!identity || !nameOut || !phaseOut) return;

  var active = document.querySelector("#right-inspector .grp.props.on");
  var source = active && active.querySelector('[id^="selname"]');
  var name = source ? source.textContent.trim() : "";
  if (!name && S.sel) {
    var cadName = $("cadName");
    name = cadName ? cadName.textContent.trim() : "";
  }
  var phase = "";
  var phaseTone = "";
  if (S.sel && S.sel.kind === "wall") {
    var wallPhase = $("w_phasePill");
    phase = wallPhase && !wallPhase.hidden ? wallPhase.textContent.trim() : "";
    if (wallPhase) {
      if (wallPhase.classList.contains("ph-demolition")) phaseTone = "is-demolition";
      else if (wallPhase.classList.contains("ph-existing")) phaseTone = "is-existing";
      else if (wallPhase.classList.contains("ph-new")) phaseTone = "is-new";
    }
  }

  var visible = !!(S.sel && name);
  identity.hidden = !visible;
  nameOut.textContent = visible ? name : "";
  phaseOut.textContent = visible ? phase : "";
  phaseOut.hidden = !phase;
  phaseOut.className = "m-top-selection-phase" + (phaseTone ? " " + phaseTone : "");
  identity.setAttribute("aria-label", visible ? (phase ? phase + " · " + name : name) : "");
}
/* ---- inspector identity card -------------------------------------------- */

/* The head of the phone / fold inspector (Round-6 "pro inspector"): what is
   selected, where it is, and its part code — the same W12 / F13 the AI's
   tags and the plan's code labels use, so a part reads the same everywhere. The top bar still carries
   the name alone; this card adds the kind, the room and the id. */
var KIND_ICON = { wall: "ph-wall", item: "ph-armchair", room: "ph-square", opening: "ph-door" };
function roomsOfWall(id) {
  return detectRooms().filter(function (r) { return String(r.key || "").split(",").indexOf(String(id)) >= 0; });
}
function roomLabelOf(room) { return room ? roomName(room.key) : ""; }
function cardFacts(sel) {
  var ref = sel.ref, sub = [], icon = KIND_ICON[sel.kind], id = ref && ref.id != null ? partCode(sel.kind, ref.id, ref) : "";
  if (sel.kind === "wall") {
    sub.push(t("m_card_wall"));
    var names = roomsOfWall(ref.id).map(roomLabelOf).filter(Boolean);
    if (names.length) sub.push(names.join(" | "));
    var pill = $("w_phasePill");
    if (pill && !pill.hidden && pill.textContent.trim()) sub.push(pill.textContent.trim());
  } else if (sel.kind === "item") {
    var label = flabel(ref.type);
    if (ref.name && ref.name !== label) sub.push(label);
    var at = detectRooms().find(function (r) { return r.pts && r.pts.length > 2 && inside({ x: ref.x, z: ref.z }, r.pts); });
    if (roomLabelOf(at)) sub.push(roomLabelOf(at));
  } else if (sel.kind === "opening") {
    icon = ref.type === "window" ? "ph-frame-corners" : "ph-door";
    sub.push(t(ref.type === "window" ? "m_card_window" : ref.type === "door" ? "m_card_door" : "m_card_opening"));
    sub.push(t("m_card_on_wall", { id: partCode("wall", ref.wall) }));
  } else if (sel.kind === "room") {
    id = ""; // a room's key is its wall list, not a name anyone would read
    var room = detectRooms().find(function (r) { return String(r.key) === String(ref); });
    if (room && room.area > 0) sub.push((room.area / 10000).toFixed(1) + " m²");
  }
  return { icon: icon, sub: sub, id: id };
}
function syncInspectorCard() {
  var host = document.querySelector("#right-inspector > .panel-section");
  if (!host) return;
  var card = $("m-insp-card");
  var sel = S.sel, name = $("m-top-selection-name") ? $("m-top-selection-name").textContent.trim() : "";
  if (!compact() || !sel || !KIND_ICON[sel.kind] || !name) {
    if (card) card.hidden = true;
    return;
  }
  if (!card) {
    card = document.createElement("div");
    card.id = "m-insp-card";
    card.className = "m-insp-card";
    card.innerHTML = '<span class="m-insp-icon"><i class="ph" aria-hidden="true"></i></span><span class="m-insp-text"><b></b><small></small></span><span class="m-insp-id"></span>';
    var heading = host.querySelector(":scope > h3");
    host.insertBefore(card, heading ? heading.nextSibling : host.firstChild);
  }
  var facts = cardFacts(sel);
  // "Door · Door · on wall #4" says it twice: the kind word goes when the name has it.
  if (facts.sub.length && name.toLowerCase().indexOf(String(facts.sub[0]).toLowerCase()) === 0 && sel.kind !== "item") facts.sub.shift();
  card.hidden = false;
  card.querySelector("i").className = "ph " + facts.icon;
  card.querySelector("b").textContent = name;
  card.querySelector("small").textContent = facts.sub.join(" · ");
  var badge = card.querySelector(".m-insp-id");
  badge.textContent = facts.id;
  badge.hidden = !facts.id;
  badge.title = facts.id ? t("m_card_id_tip") : "";
}

/* ---- the contextual row ------------------------------------------------- */

var DRAW_TOOLS = ["wall", "arcwall", "rect", "roomstamp", "door", "window", "passage", "slabvoid", "point", "erase"];
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

function cancelPlacement() {
  S.placeType = null;
  S.previewPt = null;
  setTool("select");
  window.dispatchEvent(new CustomEvent("planner-place"));
}

/* The verbs the CURRENT selection actually answers to.

   Every kind used to get the same Copy / Edit / Delete row, which was wrong in
   both directions. dupSel() only implements item and items (js/interaction.js),
   so on a wall, an opening, a room, a corner or a reference point the Copy
   button was a dead control that consumed a third of the row and did nothing
   when pressed. And the verb each of those kinds really wants — flip this
   door's swing, put a door in this wall, turn this chair — was three taps away
   behind the Edit sheet.

   The row stays at most four controls: under .compact-nav they are 44px
   icon squares (css/styles.css), so four plus the pinned Undo/Redo still fits
   a 320px screen without the row having to scroll. */
function selActions() {
  var kind = selKind();
  var propsBtn = { icon: "ph-sliders-horizontal", label: t("m_a_props"), run: function () { showSheet("props"); } };
  var delBtn = { icon: "ph-trash", label: t("m_a_del"), danger: true, run: function () { run("deleteSel"); } };
  var dupBtn = { icon: "ph-copy", label: t("m_a_dup"), run: function () { run("dupSel"); } };

  if (kind === "item" || kind === "items") {
    /* Orienting a piece is the most repeated edit in a furnished plan and it
       had no control at all outside the inspector's rotation row. */
    return [
      { icon: "ph-arrow-clockwise", label: t("m_a_rot90"), run: function () { run("rotSel90"); } },
      dupBtn,
      propsBtn,
      delBtn,
    ];
  }
  if (kind === "opening") {
    var op = S.sel.ref;
    var hinged = op && op.type === "door" && !op.isSliding && !op.isPocket;
    return hinged
      ? [{ icon: "ph-flip-horizontal", label: t("m_a_swing"), run: function () { run("flipSwing"); } }, propsBtn, delBtn]
      : [propsBtn, delBtn];
  }
  if (kind === "wall") {
    return [
      { icon: "ph-door", label: t("m_a_adddoor"), run: function () { run("addWallDoor"); } },
      { icon: "ph-frame-corners", label: t("m_a_addwindow"), run: function () { run("addWallWindow"); } },
      { icon: "ph-flip-horizontal", label: t("m_a_flipwall"), run: function () { run("reverseWallLayers"); } },
      propsBtn,
      delBtn,
    ];
  }
  if (kind === "node") {
    return [
      { icon: "ph-angle", label: t("m_a_square"), run: function () { run("ndSquare"); } },
      propsBtn,
      delBtn,
    ];
  }
  if (kind === "marker") {
    return [
      { icon: "ph-armchair", label: t("m_a_place"), run: function () { run("mkPlace"); } },
      propsBtn,
      delBtn,
    ];
  }
  if (kind === "room") {
    /* The floor material is the one room property nobody can name from memory
       and everybody recognises on sight, and it was four taps and an OS wheel
       of 23 words away. Deliberately NOT joined by Auto-arrange: that action
       tidies EVERY room (autoArrangeAll), and a verb on this room's row that
       rearranges the whole plan is the same lie as a Copy button that copies
       nothing. */
    return [
      { icon: "ph-paint-roller", label: t("m_a_floor"), run: function () { run("roomFloor"); } },
      propsBtn,
      delBtn,
    ];
  }
  return [propsBtn, delBtn];
}

/* Up to four contextual actions, chosen by what the user is actually doing.
   Undo/Redo are added by render() and are deliberately NOT part of this list:
   they must never move or disappear, whatever the state. */
function ctxActions() {
  /* Library placement is its own mode even though the select tool remains
     active underneath it. Do not leave the previously selected object's
     Copy/Edit/Delete verbs on screen while the next tap will place a piece. */
  if (S.placeType) {
    return [
      { icon: "ph-x", label: t("cancel"), run: cancelPlacement },
    ];
  }
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
    // OSNAP rides here rather than in the idle row: the chips in #cadToggles
    // are hidden on a phone, so this is the only place object snapping can be
    // turned off — and mid-draw is exactly when it grabs the wrong corner.
    return [
      aidChip("osnap", "cad_osnap"),
      aidChip("ortho", "cad_ortho"),
      aidChip("gsnap", "cad_grid"),
      { icon: "ph-x", label: t("m_endtool"), run: function () { setTool("select"); } },
    ];
  }
  if (selKind()) return selActions();
  return [
    { icon: "ph-corners-out", label: t("frame"), run: function () { run("frame"); } },
    aidChip("osnap", "cad_osnap"),
    aidChip("ortho", "cad_ortho"),
    aidChip("gsnap", "cad_grid"),
  ];
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

/* ---- milestone coach ---------------------------------------------------- */

function mobileFlowDone() {
  try { return localStorage.getItem(MOBILE_FLOW_KEY) === "1"; } catch (_) { return false; }
}

function ensureCoach() {
  if (coach) return;
  coach = document.createElement("div");
  coach.id = "m-coach";
  coach.setAttribute("role", "status");
  coach.setAttribute("aria-live", "polite");
  coach.innerHTML =
    '<div class="m-coach-copy"></div>' +
    '<button type="button" class="m-coach-action"></button>' +
    '<button type="button" class="m-coach-close"><i class="ph ph-x"></i></button>';
  document.body.appendChild(coach);
  coachCopy = coach.querySelector(".m-coach-copy");
  coachAction = coach.querySelector(".m-coach-action");
  var close = coach.querySelector(".m-coach-close");
  close.setAttribute("aria-label", t("close"));
  close.addEventListener("click", dismissCoach);
}

function hideCoach() {
  if (coachTimer) clearTimeout(coachTimer);
  coachTimer = 0;
  if (coach) coach.classList.remove("on");
}

function showCoach(copyKey, actionKey, action, timeout) {
  if (!compact()) return;
  ensureCoach();
  if (coachTimer) clearTimeout(coachTimer);
  coachCopyKey = copyKey || "";
  coachActionKey = actionKey || "";
  coachCopy.textContent = t(coachCopyKey);
  coachAction.hidden = !actionKey || !action;
  coachAction.textContent = coachActionKey ? t(coachActionKey) : "";
  coachAction.onclick = action ? function () {
    hideCoach();
    action();
  } : null;
  coach.classList.add("on");
  if (timeout) coachTimer = setTimeout(hideCoach, timeout);
}

/* Finishing the walkthrough and dismissing it are the same decision as far as
   later sessions are concerned: the user is done being coached. Recording only
   the completion replayed every milestone forever for anyone who tapped X. */
function markFlowDone() {
  onboardingActive = false;
  onboardingStage = "done";
  try { localStorage.setItem(MOBILE_FLOW_KEY, "1"); } catch (_) {}
}

function dismissCoach() {
  markFlowDone();
  hideCoach();
}

function finishOnboarding() {
  markFlowDone();
  showCoach("mcoach_complete", null, null, 3600);
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
  // The sheet lives in the DOM for its slide animation. Keep the dismissed
  // surface out of focus navigation and the accessibility tree; merely moving
  // it off-screen leaves every stale command reachable to switch controls.
  sheet.setAttribute("aria-modal", "false");
  sheet.setAttribute("aria-hidden", "true");
  sheet.inert = true;
  sheet.innerHTML =
    '<div class="m-sheet-grip" aria-hidden="true"></div>' +
    '<div class="m-sheet-head"><h4 id="m-sheet-title"></h4>' +
    '<button type="button" class="m-sheet-x" aria-label="' + t("close") + '"><i class="ph ph-x"></i></button></div>' +
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
  var closingKey = openSheet;
  if (closingKey === "props" && foldTab != null) {
    foldTab = null;
    document.body.classList.remove("m-fold-open");
    syncFoldRail();
  }
  releasePages();
  openSheet = null;
  // Move focus before making the dialog inert so Chrome never has to retain a
  // focused descendant inside an aria-hidden subtree.
  if (sheetReturnFocus && sheetReturnFocus.isConnected) sheetReturnFocus.focus({ preventScroll: true });
  sheetReturnFocus = null;
  if (sheet) {
    sheet.classList.remove("on", "tall");
    sheet.setAttribute("aria-modal", "false");
    sheet.setAttribute("aria-hidden", "true");
    sheet.inert = true;
  }
  if (backdrop) backdrop.classList.remove("on");
  document.body.classList.remove("m-sheet-open");
  // The library and inspector are real panels, not sheet content: they are
  // shown in place (see showSheet) and have to be put back too.
  document.body.classList.remove("show-left", "show-right");
  syncNav();
  if (closingKey === "props" && onboardingActive && onboardingStage === "edit") {
    onboardingStage = "preview";
    showCoach("mcoach_preview", "mcoach_preview_action", function () {
      if (window.__setViewMode) window.__setViewMode("3d");
      finishOnboarding();
    });
  }
}

function borrowedDrawerVisible(key) {
  return document.body.classList.contains(key === "add" ? "show-left" : "show-right");
}

function reconcileDrawerState() {
  if ((openSheet === "add" || openSheet === "props") && !borrowedDrawerVisible(openSheet)) closeSheet();
}

function showSheet(key) {
  ensureSheet();
  if (window.__hideCtxMenu) window.__hideCtxMenu();
  // Swipes and other chrome can dismiss a borrowed panel before the observer
  // runs. A stale key must not consume the next tap as another close.
  if (openSheet === key && (!(key === "add" || key === "props") || borrowedDrawerVisible(key))) return closeSheet();
  // The two panel keys reuse the existing drawers, restyled as sheets by CSS.
  if (key === "add" || key === "props") {
    sheet.classList.remove("on", "tall");
    sheet.setAttribute("aria-modal", "false");
    sheet.setAttribute("aria-hidden", "true");
    sheet.inert = true;
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
    if (key === "props") {
      requestAnimationFrame(pageInspector);
      if (onboardingActive && onboardingStage === "item") onboardingStage = "edit";
    }
    if (key === "add") requestAnimationFrame(pageLibrary);
    return;
  }
  document.body.classList.remove("show-left", "show-right");
  sheetReturnFocus = document.activeElement;
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
  sheet.setAttribute("aria-hidden", "false");
  sheet.inert = false;
  backdrop.classList.add("on");
  document.body.classList.add("m-sheet-open");
  syncNav();
  /* Tools, View and More are short named sections that scroll naturally.
     Inspector forms still use labelled page tabs via pageInspector(). */
}

/* Tools: the same commands as the desktop rail, but as a labelled grid. The
   rail's failure on a phone was not its size, it was that it scrolled — three
   of eleven commands (erase, lock, delete) lived past the right edge, so the
   only way to find them was to swipe a toolbar nobody knew was swipeable. */
function buildToolsSheet() {
  var grid = document.createElement("div");
  grid.className = "m-grid m-icon-grid";
  var rail = $("plan-toolbar");
  if (!rail) return;
  rail.querySelectorAll("button").forEach(function (src) {
    var tool = src.getAttribute("data-tool");
    var act = src.getAttribute("data-act");
    if (!tool && !act) return;
    if (act === "toggleToolNames") return;
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
    b.setAttribute("aria-label", label);
    b.title = label;
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

  var palette = $("plan-wall-palette");
  if (palette) {
    var wallSecTitle = document.createElement("h5");
    wallSecTitle.className = "m-sheet-sec";
    wallSecTitle.textContent = t("wd_types");
    sheetBody.appendChild(wallSecTitle);
    var wallPresets = document.createElement("div");
    wallPresets.className = "m-grid m-icon-grid";
    palette.querySelectorAll(".wd-types button[data-wall-preset]").forEach(function (src) {
      var preset = src.getAttribute("data-wall-preset");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "m-grid-btn" + (src.classList.contains("on") ? " on" : "");
      var ico = src.querySelector("i");
      var titleKey = src.getAttribute("data-i18n-title");
      var label = titleKey ? t(titleKey) : src.title || preset;
      b.setAttribute("aria-label", label);
      b.title = label;
      b.innerHTML = '<i class="' + (ico ? ico.className : "ph ph-wall") + '"></i><span>' + label + "</span>";
      b.addEventListener("click", function () {
        src.click();
        setTool("wall");
        if (window.__setViewMode) window.__setViewMode("plan");
        closeSheet();
      });
      wallPresets.appendChild(b);
    });
    sheetBody.appendChild(wallPresets);
  }
  // Every planner, model-editor and cabinet tool, from the pro catalog.
  if (typeof window.__proAppendToolsSheet === "function") window.__proAppendToolsSheet(sheetBody, closeSheet);
}

function buildViewSheet() {
  var grid = document.createElement("div");
  grid.className = "m-grid m-grid-3 m-icon-grid";
  ["plan", "3d", "split"].forEach(function (k) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "m-grid-btn" + (viewMode() === k ? " on" : "");
    var label = t(VIEW_LABELS[k]);
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = '<i class="ph ' + VIEW_ICONS[k] + '"></i><span>' + label + "</span>";
    b.addEventListener("click", function () {
      setView(k);
      closeSheet();
      sync(true);
    });
    grid.appendChild(b);
  });
  sheetBody.appendChild(grid);

  /* The canvas gizmo is deliberately hidden on a phone, but it also carried
     the only four elevation commands. Keep the uncluttered sheet and move the
     commands here instead of silently deleting that drafting capability. */
  var title = document.createElement("h5");
  title.className = "m-sheet-sec";
  title.textContent = t("elev_elevation");
  sheetBody.appendChild(title);
  var elevations = document.createElement("div");
  elevations.className = "m-grid m-grid-4 m-icon-grid m-elevation-grid";
  [
    ["front", "ph-arrow-up"],
    ["right", "ph-arrow-right"],
    ["back", "ph-arrow-down"],
    ["left", "ph-arrow-left"],
  ].forEach(function (entry) {
    var axis = entry[0];
    var label = t("elev_" + axis);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "m-grid-btn" + (S.viewAxis === axis && viewMode() === "plan" ? " on" : "");
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = '<i class="ph ' + entry[1] + '"></i><span>' + label + "</span>";
    b.addEventListener("click", function () {
      S.viewAxis = axis;
      render2D();
      updatePlanGizmo();
      if (window.__setViewMode) window.__setViewMode("plan");
      closeSheet();
      sync(true);
    });
    elevations.appendChild(b);
  });
  sheetBody.appendChild(elevations);
}

/* More keeps the live desktop commands, but gives them a phone-sized
   information architecture: learn first, common project work next, optional
   experiences last and collapsed. */
function menuByKey(key) {
  var trigger = document.querySelector('#topbar .dropdown-trigger[data-i18n-aria="' + key + '"]');
  var dd = trigger && trigger.closest(".dropdown");
  return dd && (dd.querySelector(".dropdown-menu") || menuOf(dd));
}

function actionLabel(src) {
  var copy = src.cloneNode(true);
  copy.querySelectorAll("i,kbd").forEach(function (node) { node.remove(); });
  return copy.textContent.replace(/\s+/g, " ").trim() || src.getAttribute("data-act") || "";
}

function clonedAction(src) {
  var act = src.getAttribute("data-act");
  var b = document.createElement("button");
  b.type = "button";
  b.className = "m-list-btn" + (src.classList.contains("menu-danger") ? " danger" : "");
  if (src.disabled) b.disabled = true;
  var ico = src.querySelector("i");
  var label = actionLabel(src);
  b.innerHTML = '<i class="' + (ico ? ico.className : "ph ph-dot") + '"></i><span></span>';
  b.querySelector("span").textContent = label;
  b.addEventListener("click", function () {
    closeSheet();
    run(act);
  });
  return b;
}

function appendMenuGroup(title, menu, options) {
  if (!menu) return;
  options = options || {};
  var host;
  if (options.collapsed) {
    host = document.createElement("details");
    host.className = "m-more-group";
    var summary = document.createElement("summary");
    summary.textContent = title;
    host.appendChild(summary);
  } else {
    var h = document.createElement("h5");
    h.className = "m-sheet-sec";
    h.textContent = title;
    sheetBody.appendChild(h);
    host = document.createElement("div");
  }
  var list = document.createElement("div");
  list.className = "m-list";
  menu.querySelectorAll("button[data-act]").forEach(function (src) {
    var act = src.getAttribute("data-act");
    if ((options.exclude || []).indexOf(act) >= 0) return;
    list.appendChild(clonedAction(src));
  });
  if (options.append) options.append.forEach(function (src) {
    if (src) list.appendChild(clonedAction(src));
  });
  if (!list.children.length) return;
  host.appendChild(list);
  sheetBody.appendChild(host);
}

function quickAction(id) {
  var src = document.getElementById(id);
  if (!src) return null;
  var b = document.createElement("button");
  b.type = "button";
  b.className = "m-grid-btn";
  var ico = src.querySelector("i");
  var key = src.getAttribute("data-i18n-title") || src.getAttribute("data-i18n-aria");
  var label = key ? t(key) : src.getAttribute("aria-label") || src.title || "";
  b.setAttribute("aria-label", label);
  b.innerHTML = '<i class="' + (ico ? ico.className : "ph ph-gear") + '"></i><span></span>';
  b.querySelector("span").textContent = label;
  b.addEventListener("click", function () {
    closeSheet();
    src.click();
  });
  return b;
}

function buildMoreSheet() {
  var designTitle = document.createElement("h5");
  designTitle.className = "m-sheet-sec";
  designTitle.textContent = t("m_more_design");
  sheetBody.appendChild(designTitle);
  var design = document.createElement("div");
  design.className = "m-grid m-grid-2 m-design-shortcuts";
  // UI Customize is switched off for now (js/uikit_host/index.js CUSTOMIZE_DISABLED)
  [["openModeler", "modeler_launch", "ph-cube"],
    ["save", "save", "ph-floppy-disk"]].forEach(function (entry) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "m-grid-btn";
    b.innerHTML = '<i class="ph ' + entry[2] + '"></i><span></span>';
    b.querySelector("span").textContent = t(entry[1]);
    b.addEventListener("click", function () { closeSheet(); run(entry[0]); });
    design.appendChild(b);
  });
  var cabinet = quickAction("cabNewBtn");
  if (cabinet) {
    cabinet.setAttribute("aria-label", t("m_more_cabinet"));
    cabinet.querySelector("span").textContent = t("m_more_cabinet");
    design.appendChild(cabinet);
  }
  sheetBody.appendChild(design);
  var guide = document.createElement("button");
  guide.type = "button";
  guide.className = "m-guide-card";
  guide.innerHTML =
    '<i class="ph ph-graduation-cap"></i>' +
    '<span class="m-guide-card-copy"><strong></strong><small></small></span>' +
    '<i class="ph ph-caret-right"></i>';
  guide.querySelector("strong").textContent = t("m_more_guide");
  guide.querySelector("small").textContent = t("m_more_guide_desc");
  guide.addEventListener("click", function () {
    closeSheet();
    run("plannerTutorial");
  });
  sheetBody.appendChild(guide);

  /* Ctrl+K lives in the topbar, which on a 6.7" phone is the one strip a thumb
     cannot reach. The palette itself is already phone-shaped (it re-hosts on
     body under .compact-nav), so all it needed was a door down here. */
  var find = document.createElement("button");
  find.type = "button";
  find.className = "m-guide-card";
  find.innerHTML =
    '<i class="ph ph-magnifying-glass"></i>' +
    '<span class="m-guide-card-copy"><strong></strong><small></small></span>' +
    '<i class="ph ph-caret-right"></i>';
  find.querySelector("strong").textContent = t("m_more_find");
  find.querySelector("small").textContent = t("m_more_find_desc");
  find.addEventListener("click", function () {
    closeSheet();
    setTimeout(function () {
      var root = $("toolSearch");
      if (root) {
        var field = root.querySelector(".tool-search-field");
        if (field) field.click();
      }
      var input = $("toolSearchInput");
      if (input) {
        input.focus();
        input.select();
      }
    }, 80);
  });
  sheetBody.appendChild(find);

  var quickTitle = document.createElement("h5");
  quickTitle.className = "m-sheet-sec";
  quickTitle.textContent = t("m_more_settings");
  sheetBody.appendChild(quickTitle);
  var quick = document.createElement("div");
  quick.className = "m-grid m-grid-5 m-icon-grid";
  ["btn_settings", "themeToggle", "langBtn", "friendsBtn", "agentBtn"].forEach(function (id) {
    var b = quickAction(id);
    if (b) quick.appendChild(b);
  });
  if (quick.children.length) sheetBody.appendChild(quick);

  var fileMenu = menuByKey("menu_file");
  var reset = fileMenu && fileMenu.querySelector('[data-act="reset"]');
  // Save is already promoted in the two-column shortcut group. Listing the
  // same action again a few rows later makes the project section look like it
  // has two save scopes when both buttons run the identical command.
  appendMenuGroup(t("m_more_project"), fileMenu, { exclude: ["reset", "save"], append: [reset] });
  appendMenuGroup(t("menu_edit"), menuByKey("menu_edit"));
  appendMenuGroup(t("menu_export"), menuByKey("menu_export"));
  /* RC / Night Shift / lava are games. The planner More sheet keeps Walk
     (first-person tour), Photo, Model Editor and textures — the extras that
     still belong to designing the house. */
  appendMenuGroup(t("m_more_extras"), menuByKey("menu_more"), {
    collapsed: true,
    exclude: ["rc", "zombies", "lava", "openModeler", "uikitCustomize", "friends", "agent"],
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
      b.title = t("m_view_hold");
    } else if (k === "tools") {
      var ti = b.querySelector("i"),
        ts = b.querySelector("span");
      var src = document.querySelector('#plan-toolbar [data-tool="' + (S.tool || "select") + '"] i');
      if (ti) ti.className = src ? src.className : "ph ph-cursor";
      if (ts) ts.textContent = t("mnav_tools");
      b.classList.toggle("armed", (S.tool || "select") !== "select");
    } else if (k === "props") {
      var unavailable = !selKind() && openSheet !== "props";
      b.disabled = false;
      b.classList.toggle("is-disabled", unavailable);
      b.setAttribute("aria-disabled", unavailable ? "true" : "false");
    }
    var labelNode = b.querySelector("span");
    if (labelNode) b.setAttribute("aria-label", labelNode.textContent.trim());
  });
}

/* The View slot is the only nav slot that is a SWITCH rather than a menu: it
   already shows the pane you are in, so a tap that merely opens a list of
   three panes charges two taps to do the one thing it is asked for 95% of the
   time. Tap flips Plan <-> 3D; press and hold opens the full sheet, which is
   where Split and the four elevations live. A hold that has fired swallows its
   own click so the pane does not also change behind the sheet.

   The first few taps announce the hold, because a gesture nobody is told about
   is the same as a feature that does not exist. */
var VIEW_HOLD_MS = 420;
var VIEW_HINT_KEY = "mf_mobile_view_hold_seen";
var viewHold = 0,
  viewHeld = false;

function viewHintSeen() {
  try { return localStorage.getItem(VIEW_HINT_KEY) === "1"; } catch (_) { return false; }
}
function markViewHintSeen() {
  try { localStorage.setItem(VIEW_HINT_KEY, "1"); } catch (_) {}
}

function cancelViewHold() {
  if (viewHold) clearTimeout(viewHold);
  viewHold = 0;
}

function toggleView() {
  /* Split is a two-pane compromise; the tap means "show me the other one", and
     from Split the thing the user cannot currently see whole is the 3D. */
  setView(viewMode() === "3d" ? "plan" : "3d");
  if (!viewHintSeen()) {
    markViewHintSeen();
    showCoach("m_view_hold", null, null, 3200);
  }
  sync(true);
}

function initNav() {
  var nav = $("mobile-nav");
  if (!nav) return;
  var viewBtn = nav.querySelector('[data-mnav="view"]');
  if (viewBtn) {
    viewBtn.addEventListener("pointerdown", function () {
      viewHeld = false;
      cancelViewHold();
      viewHold = setTimeout(function () {
        viewHold = 0;
        viewHeld = true;
        markViewHintSeen();
        if (navigator.vibrate) navigator.vibrate(10);
        showSheet("view");
      }, VIEW_HOLD_MS);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      viewBtn.addEventListener(ev, cancelViewHold);
    });
    /* The hold is a pointer gesture, so on its own it puts the full View menu
       out of reach of a keyboard or switch: Enter on this button only ever
       toggles the pane. These two are the keyboard equivalents of a long
       press — the context-menu key (also Shift+F10) and Up, the usual way of
       opening a menu that sits above its button. */
    viewBtn.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      cancelViewHold();
      markViewHintSeen();
      showSheet("view");
    });
    viewBtn.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowUp") return;
      e.preventDefault();
      cancelViewHold();
      markViewHintSeen();
      showSheet("view");
    });
  }
  nav.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mnav]");
    if (!b || b.disabled) return;
    if (b.dataset.mnav === "view") {
      cancelViewHold();
      if (viewHeld) {
        viewHeld = false;
        return; // the hold already opened the sheet
      }
      /* Any sheet still up is dismissed first. Every other slot swaps one
         sheet for another, so a View tap that switched the pane and left the
         More list covering it would be the one nav slot whose result you
         cannot see. */
      if (openSheet) closeSheet();
      toggleView();
      return;
    }
    if (b.dataset.mnav === "props" && !selKind()) {
      showCoach("m_props_empty", null, null, 2600);
      return;
    }
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
    S.placeType || "",
  ].join("|");
}

var lastSel = "";
function sync(force) {
  if (!compact()) return;
  /* Names can be edited without changing the selection signature. Keeping
     this outside the early return makes the title follow those edits. */
  syncTopSelection();
  syncInspectorCard();
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
  syncStrip();
}

export function initMobileShell() {
  if (!$("mobile-nav")) return;
  ctxBar = document.createElement("div");
  ctxBar.id = "m-ctx";
  ctxBar.setAttribute("role", "toolbar");
  ctxBar.setAttribute("aria-label", "Context actions");
  document.body.appendChild(ctxBar);

  initNav();
  buildStrip();
  buildFoldRail();
  ensureSheet();
  // ui.js owns the legacy swipe/backdrop handlers. Observe the shared drawer
  // classes so their dismissals also retire our backdrop and expanded state.
  new MutationObserver(reconcileDrawerState).observe(document.body, { attributes:true, attributeFilter:["class"] });
  applyTouchHints();
  window.addEventListener("resize", applyTouchHints);
  onAfterRender(function () {
    sync(false);
  });
  window.addEventListener("planner-tool", function () {
    sync(true);
  });
  window.addEventListener("planner-selection", function () {
    requestAnimationFrame(function () {
      syncTopSelection();
      syncInspectorCard();
      if (openSheet === "props") pageInspector();
    });
  });
  document.addEventListener("click", function () { setTimeout(pageTransientMenus, 0); });
  var left = $("left-sidebar");
  if (left) left.addEventListener("click", function () {
    if (openSheet === "add") setTimeout(pageLibrary, 0);
  });
  var canvas = $("center-canvas");
  if (canvas) canvas.addEventListener("click", function (e) {
    /* ui.js closes borrowed drawers on a canvas tap. Keep this module's sheet
       state in lockstep so Add/Edit cannot remain falsely highlighted. A tool
       run through the hidden rail (fold rail, pro catalog) is not a tap. */
    if (e.target && e.target.closest && e.target.closest("#plan-toolbar")) return;
    if (openSheet === "add" || openSheet === "props") closeSheet();
  });
  /* Picking a library item arms placement; keeping the borrowed library panel
     over the plan makes the next required tap impossible on a phone. */
  window.addEventListener("planner-place", function () {
    if (openSheet === "add" && S.placeType) closeSheet();
    sync(true);
  });
  window.addEventListener("planner-guide-open", function () {
    if (openSheet !== "add") showSheet("add");
  });
  window.addEventListener("planner-guide-place", function () {
    if (openSheet === "add") closeSheet();
  });
  window.addEventListener("planner-mobile-onboarding-start", function () {
    if (mobileFlowDone()) return;
    onboardingActive = true;
    onboardingStage = "room";
    hideCoach();
  });
  window.addEventListener("planner-room-created", function () {
    if (S.workspace?.guidance?.enabled) return;
    if (mobileFlowDone()) return;
    /* Only the FIRST room opens the walkthrough. Re-arming on every room sent
       someone who had already reached openings or furniture back to step one. */
    if (onboardingActive && onboardingStage !== "room") return;
    onboardingActive = true;
    onboardingStage = "door";
    showCoach("mcoach_room_done", "mcoach_add_door", function () {
      if (window.__setViewMode) window.__setViewMode("plan");
      setTool("door");
    });
  });
  window.addEventListener("planner-opening-created", function () {
    if (!onboardingActive || onboardingStage !== "door") return;
    onboardingStage = "furnish";
    showCoach("mcoach_opening_done", "mcoach_add_furniture", function () {
      showSheet("add");
    });
  });
  window.addEventListener("planner-item-created", function () {
    if (!onboardingActive || (onboardingStage !== "furnish" && onboardingStage !== "door")) return;
    onboardingStage = "item";
    showCoach("mcoach_item_done", "mcoach_edit_item", function () {
      showSheet("props");
    });
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
    buildStrip();
    buildFoldRail();
    sync(true);
    var closeLabel = t("close");
    if (sheet) {
      var sheetClose = sheet.querySelector(".m-sheet-x");
      if (sheetClose) sheetClose.setAttribute("aria-label", closeLabel);
    }
    if (coach) {
      var coachClose = coach.querySelector(".m-coach-close");
      if (coachClose) coachClose.setAttribute("aria-label", closeLabel);
      if (coachCopyKey) coachCopy.textContent = t(coachCopyKey);
      if (coachActionKey) coachAction.textContent = t(coachActionKey);
    }
    if (openSheet && openSheet !== "add" && openSheet !== "props") {
      var key = openSheet;
      openSheet = null;
      showSheet(key);
    }
  });
  /* Selection can change from the 3D pane and from the tree, neither of which
     repaints the plan. A quarter-second poll on the signature is cheaper than
     threading a selection event through five modules, and the signature test
     means it does nothing at all when nothing changed. */
  setInterval(function () {
    sync(false);
  }, 250);
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

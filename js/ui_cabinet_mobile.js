/* Cabinet designer — compact (phone / foldable) chrome.

   The designer is a three-column desktop tool: a header with a title row, a
   level switcher and a context bar (W/D/H, the open-doors slider, four stage
   chips, a checkbox), then design sources on the left, the elevation in the
   middle and six inspector tabs on the right. Stacked on a 375px screen that
   is ~640px of chrome ABOVE the drawing, both side panels become long scrolls
   the canvas is buried under, and the floating tool/view rails land on top of
   the little canvas that is left.

   Same answer as the planner's mobile shell (js/mobile_shell.js), same shape,
   so the two feel like one product:

     .cb-m-ctx   contextual row — Undo/Redo pinned to the leading edge in every
                 state, then ≤3 actions that follow the tool and the selection.
     .cb-m-nav   five fixed slots — View / Tools / Design / Properties / More.

   Nothing here duplicates behaviour. The two side panels stay exactly where
   they are in the DOM and CSS restyles them as bottom sheets (the 3D preview
   swaps itself into .cb-right by query, so moving that panel would break it);
   the View and Tools sheets press the real rail buttons; the More sheet holds
   the REAL context bar and level switcher, relocated once. */

import { S } from "./state.js";
import {
  currentHistoryId, beginHistoryTransaction, commitHistoryTransaction, abortHistoryTransaction,
} from "./history.js";
import { render2D } from "./plan2d.js";
import { refreshTree } from "./ui_tree.js";
import { itemDuplicateCommand, executeCommand } from "./commands/index.js";
import { E, T } from "./ui_cabinet_ctx.js";
import { setTool, syncHint, draw, sizeCanvas } from "./ui_cabinet_view.js";
import {
  splitSection, delSection, splitColumn, delColumn,
} from "./ui_cabinet_inspect.js";
import { mountPagedMenu, releasePagedMenu } from "./mobile_pages.js";

var host = null, // #cabdes for this session (the overlay is rebuilt per open)
  ctxBar = null,
  nav = null,
  sheet = null,
  sheetBody = null,
  sheetTitle = null,
  backdrop = null,
  moreBody = null,
  timer = null;
var openSheet = null;
var lastSig = "";
var pageHost = null;
// where the relocated nodes came from, so leaving compact can put them back
var homes = [];
const CABINET_COMMAND_HISTORY = Object.freeze({
  current: currentHistoryId,
  begin: beginHistoryTransaction,
  commit: commitHistoryTransaction,
  abort: abortHistoryTransaction,
});

function q(sel) {
  return host && host.querySelector(sel);
}
function compact() {
  return document.body.classList.contains("compact-nav");
}

function releasePages() {
  if (pageHost) releasePagedMenu(pageHost);
  pageHost = null;
}

function pageOpenMenu(key) {
  releasePages();
  if (key === "design") pageHost = q(".cb-left");
  else if (key === "props") {
    var groups = Array.from(host.querySelectorAll(".cb-right > .cb-grp"));
    pageHost = groups.find(function (node) { return getComputedStyle(node).display !== "none"; }) || q(".cb-right");
  } else pageHost = sheetBody;
  if (pageHost) mountPagedMenu(pageHost, { pinSelector: ".cb-tabs, .cb-strip, .cb-icons" });
}
function roomy() {
  return document.body.classList.contains("dock-rail");
}

/* ---- state read off the real chrome -------------------------------------- */

/* Undo/redo are proxied through the header's own buttons rather than through
   the history object: syncUndoButtons() already keeps those two disabled flags
   correct, and reading them means this row can never disagree with it. */
function undoBtn() {
  return q("#cbUndo");
}
function redoBtn() {
  return q("#cbRedo");
}
function press(sel) {
  var b = q(sel);
  if (b && !b.disabled) b.click();
}
function axisLabel() {
  var on = q("#cbAxes button[data-ax].on");
  return on ? on.textContent.trim() : "";
}
function selKey() {
  var s = E.sel;
  return s ? s.col + "/" + (s.sec == null ? "-" : s.sec) : "";
}

/* ---- the contextual row -------------------------------------------------- */

function toggleSpec(sel, label) {
  var b = q(sel);
  if (!b) return null;
  return {
    kind: "chip",
    label: label,
    on: b.classList.contains("on"),
    disabled: b.disabled,
    run: function () {
      b.click();
    },
  };
}

function stageSpec(v) {
  var b = q('.cb-chip-stage[data-v="' + v + '"]');
  if (!b) return null;
  return {
    kind: "chip",
    label: b.textContent.trim(),
    on: b.classList.contains("on"),
    run: function () {
      b.click();
    },
  };
}

function dimChip(id, letter) {
  var inp = q(id);
  if (!inp) return null;
  return {
    kind: "chip",
    label: letter + " " + (inp.value || ""),
    run: function () {
      showSheet("more");
      requestAnimationFrame(function () {
        inp.focus();
        if (typeof inp.select === "function") inp.select();
      });
    },
  };
}

/* Three contextual actions at most. Undo/Redo are added by renderCtx and are
   deliberately not in here: they must never move, whatever the state. */
function ctxActions() {
  if (E.tool) {
    // Mid-draw the two preferences ARE the controls — they decide where the
    // next partition lands and what the projection shows.
    return [
      toggleSpec("#cbSnap", T("snapOn")),
      toggleSpec("#cbHid", T("hidOn")),
      { icon: "ph-x", label: T("mEndTool"), run: function () { setTool(null); } },
    ];
  }
  if (E.sel) {
    /* A compartment and a column header are both "the selection" but they split
       and delete along different axes — the desktop inspector shows one set or
       the other, so this row has to as well. */
    var onSec = E.sel.sec != null;
    return [
      { icon: "ph-sliders-horizontal", label: T("mEdit"), run: function () { showSheet("props"); } },
      {
        icon: onSec ? "ph-rows-plus-bottom" : "ph-columns-plus-right",
        label: T("mSplit"),
        run: onSec ? splitSection : splitColumn,
      },
      {
        icon: "ph-trash",
        label: T("mDel"),
        danger: true,
        run: onSec ? delSection : delColumn,
      },
    ];
  }
  /* Roomy: W/D/H sit on the size bar above the elevation, so the idle row
     keeps the preview stages. Phone: pin the three dimensions here — they
     used to live only inside More. */
  if (roomy()) return [stageSpec(0), stageSpec(40), stageSpec(100)];
  return [dimChip("#cbW", "W"), dimChip("#cbD", "D"), dimChip("#cbH", "H")];
}

function mkBtn(spec) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "cbm-btn" + (spec.danger ? " danger" : "") + (spec.on ? " on" : "");
  if (spec.kind === "chip") {
    b.classList.add("cbm-chip");
    b.textContent = spec.label;
    b.setAttribute("aria-pressed", spec.on ? "true" : "false");
  } else {
    b.innerHTML = '<i class="ph ' + spec.icon + '"></i><span>' + spec.label + "</span>";
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
  var pair = document.createElement("div");
  pair.className = "cbm-undo";
  var u = undoBtn(),
    r = redoBtn();
  pair.appendChild(
    mkBtn({
      icon: "ph-arrow-u-up-left",
      label: T("undo"),
      disabled: !u || u.disabled,
      run: function () { press("#cbUndo"); },
    }),
  );
  pair.appendChild(
    mkBtn({
      icon: "ph-arrow-u-up-right",
      label: T("redo"),
      disabled: !r || r.disabled,
      run: function () { press("#cbRedo"); },
    }),
  );
  ctxBar.appendChild(pair);
  ctxActions().forEach(function (a) {
    if (a) ctxBar.appendChild(mkBtn(a));
  });
}

/* ---- sheets -------------------------------------------------------------- */

/* A proxy grid over an existing rail: every button here presses the real one,
   so the rail keeps owning its state and this stays a view of it. */
function proxyGrid(sel, cols) {
  var grid = document.createElement("div");
  grid.className = "cbm-grid cbm-icon-grid" + (cols ? " cbm-grid-" + cols : "");
  (host.querySelectorAll(sel) || []).forEach(function (src) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cbm-grid-btn" + (src.classList.contains("on") ? " on" : "");
    if (src.disabled) b.disabled = true;
    var ico = src.querySelector("i");
    /* The rail labels its buttons with their own text — except the four 45°
       corners, which are a bare ◤◥◣◢ glyph and a shared "45°" tooltip. A grid
       of four unlabelled triangles is a guessing game, so name them. */
    var ax = src.getAttribute("data-ax");
    // T() answers "" for a key it does not have, so a plain || chain is enough.
    var label = (ax && T("mAx" + ax)) || (src.textContent || "").trim() || src.title || "";
    var fallbackGlyph = (src.textContent || "").trim();
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML =
      (ico ? '<i class="' + ico.className + '"></i>' : '<b class="cbm-glyph" aria-hidden="true">' + fallbackGlyph + "</b>") +
      "<span>" + label + "</span>";
    b.addEventListener("click", function () {
      src.click();
      closeSheet();
      sync(true);
    });
    grid.appendChild(b);
  });
  return grid;
}

function section(titleKey) {
  var h = document.createElement("h5");
  h.className = "cbm-sec";
  h.textContent = T(titleKey);
  return h;
}

function axisBtn(ax, slot) {
  var src = q('#cbAxes button[data-ax="' + ax + '"]');
  if (!src) return null;
  var b = document.createElement("button");
  b.type = "button";
  b.className = "cbm-grid-btn" + (src.classList.contains("on") ? " on" : "");
  if (slot) b.dataset.slot = slot;
  var ico = src.querySelector("i");
  var key = "v" + ax.charAt(0).toUpperCase() + ax.slice(1);
  var label = T(key) || T("mAx" + ax) || (src.textContent || "").trim() || ax;
  b.setAttribute("aria-label", label);
  b.title = label;
  b.innerHTML =
    (ico ? '<i class="' + ico.className + '"></i>' : "") + "<span>" + label + "</span>";
  b.addEventListener("click", function () {
    src.click();
    closeSheet();
    sync(true);
  });
  return b;
}

function buildViewSheet() {
  sheetBody.appendChild(proxyGrid("#cbViews .cb-vgroup:first-child button[data-mode]", 2));
  sheetBody.appendChild(section("mAxis"));
  var pad = document.createElement("div");
  pad.className = "cbm-view-pad cbm-icon-grid";
  ["front", "back", "left", "right", "top"].forEach(function (ax) {
    var b = axisBtn(ax, ax);
    if (b) pad.appendChild(b);
  });
  sheetBody.appendChild(pad);

  var extra = document.createElement("details");
  extra.className = "cbm-iso";
  var sum = document.createElement("summary");
  sum.textContent = T("mIsoMore");
  extra.appendChild(sum);
  var bottom = axisBtn("bottom");
  if (bottom) extra.appendChild(bottom);
  extra.appendChild(proxyGrid("#cbAxes .cb-v45 button[data-ax]", 2));
  sheetBody.appendChild(extra);
}

function buildToolsSheet() {
  sheetBody.appendChild(proxyGrid("#cbTools button[data-tool]", 2));
}

/* More holds the REAL context bar and level switcher — relocated, not copied,
   so the size fields and the open-doors slider keep every listener they were
   built with. The trailing actions are proxies of buttons that live elsewhere
   in the overlay. */
function duplicateCabinet() {
  var src = E.it;
  if (!src) return;
  var result = executeCommand(itemDuplicateCommand, {
    sourceId: src.id, offsetX: 30, offsetZ: 30, regroup: false,
  }, {
    domain: "planner",
    state: S,
    history: CABINET_COMMAND_HISTORY,
    version: { current: currentHistoryId },
  }, { label: "Duplicate cabinet" });
  if (!result.ok) return;
  S.dirty3D = true;
  render2D();
  refreshTree();
}

function buildMoreSheet() {
  if (moreBody) sheetBody.appendChild(moreBody);
  var acts = document.createElement("div");
  acts.className = "cbm-grid cbm-icon-grid";
  if (E.it) {
    var dup = document.createElement("button");
    dup.type = "button";
    dup.className = "cbm-grid-btn";
    dup.setAttribute("aria-label", T("dupCab"));
    dup.title = T("dupCab");
    dup.innerHTML = '<i class="ph ph-copy"></i><span>' + T("dupCab") + "</span>";
    dup.addEventListener("click", function () {
      closeSheet();
      duplicateCabinet();
    });
    acts.appendChild(dup);
  }
  [
    ["#cbRevert", "ph-arrow-counter-clockwise", "revert", true],
    ['.cb-icons button[data-act="nest"]', "ph-scissors", "cutPlan", false],
    ['.cb-icons button[data-act="png"]', "ph-image", "pngExport", false],
    ["#cbCsv", "ph-file-csv", "csv", false],
  ].forEach(function (row) {
    var src = q(row[0]);
    if (!src) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "cbm-grid-btn" + (row[3] ? " danger" : "");
    b.setAttribute("aria-label", T(row[2]));
    b.title = T(row[2]);
    b.innerHTML = '<i class="ph ' + row[1] + '"></i><span>' + T(row[2]) + "</span>";
    b.addEventListener("click", function () {
      closeSheet();
      src.click();
    });
    acts.appendChild(b);
  });
  if (acts.children.length) {
    sheetBody.appendChild(section("mExtras"));
    sheetBody.appendChild(acts);
  }
}

function closeSheet() {
  releasePages();
  openSheet = null;
  if (sheet) {
    sheet.classList.remove("on", "tall");
    sheet.setAttribute("aria-modal", "false");
  }
  if (backdrop) backdrop.classList.remove("on");
  if (host) host.classList.remove("cb-show-left", "cb-show-right");
  // The More sheet borrows real nodes; park them where they cannot be seen
  // rather than leaving them inside a hidden sheet the next open will reuse.
  if (moreBody && moreBody.parentNode === sheetBody) parkMoreBody();
  syncNav();
}

function parkMoreBody() {
  if (!moreBody || !host) return;
  var park = q(".cb-m-park");
  if (park) park.appendChild(moreBody);
}

function showSheet(key) {
  if (!sheet) return;
  if (openSheet === key) return closeSheet();
  closeSheet();
  // The two panels are the real .cb-left / .cb-right, restyled as sheets.
  if (key === "design" || key === "props") {
    backdrop.classList.add("on");
    host.classList.toggle("cb-show-left", key === "design");
    host.classList.toggle("cb-show-right", key === "props");
    openSheet = key;
    syncNav();
    requestAnimationFrame(function () { pageOpenMenu(key); });
    return;
  }
  sheetBody.innerHTML = "";
  if (key === "view") buildViewSheet();
  else if (key === "tools") buildToolsSheet();
  else if (key === "more") buildMoreSheet();
  sheetTitle.textContent = T(
    key === "view" ? "mSheetView" : key === "tools" ? "mSheetTools" : "mSheetMore",
  );
  openSheet = key;
  sheet.classList.add("on");
  sheet.setAttribute("aria-modal", "true");
  backdrop.classList.add("on");
  syncNav();
  requestAnimationFrame(function () { pageOpenMenu(key); });
}

/* ---- nav ----------------------------------------------------------------- */

var NAV = [
  { key: "view", icon: "ph-square", label: "mView" },
  { key: "tools", icon: "ph-cursor", label: "mTools" },
  { key: "design", icon: "ph-squares-four", label: "mDesign", primary: true },
  { key: "props", icon: "ph-sliders-horizontal", label: "mProps" },
  { key: "more", icon: "ph-dots-three-outline", label: "mMore" },
];

function syncNav() {
  if (!nav) return;
  nav.querySelectorAll("[data-cbnav]").forEach(function (b) {
    var k = b.dataset.cbnav;
    var on = openSheet === k;
    b.classList.toggle("active", on);
    b.setAttribute("aria-expanded", on ? "true" : "false");
    var i = b.querySelector("i"),
      s = b.querySelector("span");
    if (k === "view") {
      // The slot has to say which view you are in, or it costs a tap to find out.
      if (i) i.className = "ph " + (E.mode === "3d" ? "ph-cube" : "ph-square");
      if (s) s.textContent = E.mode === "3d" ? "3D" : axisLabel() || T("mView");
    } else if (k === "tools") {
      var src = q('#cbTools button[data-tool="' + (E.tool || "") + '"] i');
      if (i) i.className = src ? src.className : "ph ph-cursor";
      b.classList.toggle("armed", !!E.tool);
    } else if (k === "props") {
      // The right panel is only about a selection while the inspector tab is up,
      // but it also carries finishes, hardware and the bill — always useful.
      b.disabled = false;
    }
    var label = s ? s.textContent.trim() : T((NAV.filter(function (n) { return n.key === k; })[0] || {}).label || "");
    if (label) b.setAttribute("aria-label", label);
  });
}

/* ---- relocation ---------------------------------------------------------- */

/* Remember where a node lived before it was borrowed, so leaving the compact
   layout (a rotation, an unfold) restores the desktop chrome exactly. */
function borrow(node, into) {
  if (!node || !into) return;
  homes.push({ node: node, parent: node.parentNode, next: node.nextSibling });
  into.appendChild(node);
}
function giveBack() {
  homes.forEach(function (h) {
    if (h.parent) h.parent.insertBefore(h.node, h.next);
  });
  homes = [];
}

function placeSizeChrome() {
  var bar = q(".cb-context-bar");
  if (!bar || !moreBody) return;
  var sizebar = q(".cb-m-sizebar");
  if (roomy() && sizebar) {
    sizebar.appendChild(bar);
    sizebar.hidden = false;
  } else {
    moreBody.appendChild(bar);
    if (sizebar) sizebar.hidden = true;
  }
}

/* ---- pulse --------------------------------------------------------------- */

function sig() {
  var u = undoBtn(),
    r = redoBtn();
  return [
    E.mode,
    E.axis,
    E.tool || "",
    selKey(),
    u && u.disabled ? 0 : 1,
    r && r.disabled ? 0 : 1,
    E.snap ? 1 : 0,
    E.hid ? 1 : 0,
    (q("#cbOpenVal") || {}).textContent || "",
    (q("#cbW") || {}).value || "",
    (q("#cbD") || {}).value || "",
    (q("#cbH") || {}).value || "",
  ].join("|");
}

function sync(force) {
  if (!host || !host.isConnected) return;
  var s = sig();
  if (!force && s === lastSig) return;
  lastSig = s;
  renderCtx();
  syncNav();
}

/* ---- build / teardown ---------------------------------------------------- */

function build() {
  backdrop = document.createElement("div");
  backdrop.className = "cb-m-backdrop";
  backdrop.addEventListener("click", closeSheet);
  host.appendChild(backdrop);

  sheet = document.createElement("div");
  sheet.className = "cb-m-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.innerHTML =
    '<div class="cbm-grip" aria-hidden="true"></div>' +
    '<div class="cbm-head"><h4></h4>' +
    '<button type="button" class="cbm-x" aria-label="' + T("close") + '"><i class="ph ph-x"></i></button></div>' +
    '<div class="cbm-body"></div>';
  host.appendChild(sheet);
  sheetBody = sheet.querySelector(".cbm-body");
  sheetTitle = sheet.querySelector("h4");
  sheet.querySelector(".cbm-x").addEventListener("click", closeSheet);

  // Drag the head down to dismiss, up for full height — same gesture as the
  // planner's sheets, because they are the same thing.
  var y0 = 0,
    live = false;
  sheet.addEventListener("touchstart", function (e) {
    live = e.touches.length === 1 && !!e.target.closest(".cbm-grip, .cbm-head");
    if (live) y0 = e.touches[0].clientY;
  }, { passive: true });
  sheet.addEventListener("touchmove", function (e) {
    if (!live || e.touches.length !== 1) return;
    var dy = e.touches[0].clientY - y0;
    if (dy > 70) { live = false; closeSheet(); }
    else if (dy < -50) { live = false; sheet.classList.add("tall"); }
  }, { passive: true });
  sheet.addEventListener("touchend", function () { live = false; });

  ctxBar = document.createElement("div");
  ctxBar.className = "cb-m-ctx";
  ctxBar.setAttribute("role", "toolbar");
  host.appendChild(ctxBar);

  nav = document.createElement("nav");
  nav.className = "cb-m-nav";
  nav.innerHTML = NAV.map(function (n) {
    return (
      '<button type="button" data-cbnav="' + n.key + '"' +
      (n.primary ? ' class="cbm-primary"' : "") + ' aria-label="' + T(n.label) + '">' +
      '<i class="ph ' + n.icon + '"></i><span>' + T(n.label) + "</span></button>"
    );
  }).join("");
  nav.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cbnav]");
    if (b && !b.disabled) showSheet(b.dataset.cbnav);
  });
  host.appendChild(nav);

  // A parking spot for the nodes the More sheet borrows, so they are out of the
  // header the moment the compact layout takes over — not only while it is open.
  var park = document.createElement("div");
  park.className = "cb-m-park";
  host.appendChild(park);

  moreBody = document.createElement("div");
  moreBody.className = "cb-m-more";
  park.appendChild(moreBody);
  borrow(q(".cb-levels"), moreBody);
  borrow(q(".cb-context-bar"), moreBody);

  var sizebar = document.createElement("div");
  sizebar.className = "cb-m-sizebar";
  sizebar.hidden = true;
  var bodyEl = q(".cb-body");
  if (bodyEl) host.insertBefore(sizebar, bodyEl);
  else host.appendChild(sizebar);
  placeSizeChrome();
}

function applyCompact() {
  if (!host || !host.isConnected) return;
  var on = compact();
  host.classList.toggle("cb-compact", on);
  if (on && !ctxBar) {
    build();
    /* Enable the sheet slide only from the next frame: the panels have just
       changed from three-column layout to parked-off-screen, and a transition
       on that first change plays the parking as an animation. */
    host.classList.remove("cb-m-ready");
    requestAnimationFrame(function () {
      if (host && host.isConnected) host.classList.add("cb-m-ready");
    });
  }
  if (!on && ctxBar) {
    // Back to the desktop layout: hand the borrowed chrome back and drop ours.
    closeSheet();
    giveBack();
    [backdrop, sheet, ctxBar, nav, q(".cb-m-park"), q(".cb-m-sizebar")].forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    host.classList.remove("cb-m-ready");
    backdrop = sheet = sheetBody = sheetTitle = ctxBar = nav = moreBody = null;
    return;
  }
  if (on) placeSizeChrome();
  /* All three read the layout the compact class just changed: openCabinet
     measured the canvas against the three-column body, so without re-measuring
     here the elevation is drawn into a canvas the size of the OLD .cb-mid and
     ends up half the height it should be. */
  sizeCanvas();
  syncHint();
  draw();
  sync(true);
}

/* The overlay can remain mounted while closed. Release session resources
   explicitly so a hidden designer does not keep polling or handling resize. */
export function disposeCabinetMobile() {
  window.removeEventListener("resize", applyCompact);
  window.removeEventListener("mf-posture", applyCompact);
  if (timer) clearInterval(timer);
  timer = null;
  closeSheet();
  host = null;
}

export function initCabinetMobile() {
  disposeCabinetMobile();
  host = E.host;
  if (!host) return;
  applyCompact();
  window.addEventListener("resize", applyCompact);
  window.addEventListener("mf-posture", applyCompact);
  /* The designer has no selection event and repaints through draw(); a quarter
     second poll on a signature is cheaper than threading one through four
     modules, and does nothing at all while nothing changes. */
  if (timer) clearInterval(timer);
  timer = setInterval(function () {
    if (!host || !host.isConnected) {
      clearInterval(timer);
      timer = null;
      return;
    }
    sync(false);
  }, 250);
}

export function refreshCabinetMobile() {
  sync(true);
}

export function showCabinetPropertiesMobile() {
  if (host && host.classList.contains("cb-compact")) {
    closeSheet();
    showSheet("props");
  }
}

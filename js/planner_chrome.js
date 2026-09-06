// Planner main-page chrome: modern layout by default, classic layout from the
// same More menu as games / modeler / textures. Also owns the start screen,
// floor tabs, left-sidebar panes, tool hints, and library drag-to-place.
import { S } from "./state.js";
import { t, tTouch, onLangChange } from "./i18n.js";
import {
  applyData,
  fillProps,
  flash,
  refreshTree,
  placeFurnAt,
  sceneObject,
} from "./ui.js";
import { defaultScene, emptyScene, FURN } from "./furniture.js";
import { rebuildProject } from "./core/project.js";
import { setTool } from "./interaction.js";
import { render2D, fitView, wx, wz, dropPoint } from "./plan2d.js";
import { loadMEP } from "./mep.js";
import { renderPanel as refreshMEPPanel } from "./ui_mep.js";
import { withoutRoomPrompts } from "./ui_tree.js";
import { pushHistory, onAfterRestore } from "./history.js";
import {
  configureFloorIO,
  ensureFloors,
  addFloor,
  switchFloor,
} from "./floors.js";

configureFloorIO({ sceneObject: sceneObject, applyData: applyData });

var UI_KEY = "home3d_ui";
var START_KEY = "home3d_start_done";
var LEFT_KEY = "home3d_left_tab";
var VIEW_KEY = "home3d_viewmode";

function $(id) {
  return document.getElementById(id);
}

function currentUi() {
  return document.documentElement.getAttribute("data-ui") === "legacy" ? "legacy" : "modern";
}

export function applyPlannerChrome() {
  var legacy = currentUi() === "legacy";
  document.body.classList.toggle("legacy-ui", legacy);
  var btn = $("legacyUiBtn");
  if (btn) {
    btn.classList.toggle("active-legacy", legacy);
    var label = btn.querySelector("span");
    if (label) label.textContent = t(legacy ? "ui_modern" : "ui_classic");
  }
  document.querySelectorAll(".insp-more").forEach(function (d) {
    if (legacy) d.setAttribute("open", "");
    else d.removeAttribute("open");
  });
  var left = $("left-sidebar");
  if (left && !legacy) {
    var tab = left.getAttribute("data-left") || localStorage.getItem(LEFT_KEY) || "library";
    setLeftTab(tab, false);
  } else if (left) {
    left.removeAttribute("data-left");
  }
  renderFloorTabs();
  syncViewPills();
  updateToolHint();
}

function persistUi(mode) {
  try {
    localStorage.setItem(UI_KEY, mode);
  } catch (_) {}
  document.documentElement.setAttribute("data-ui", mode);
  applyPlannerChrome();
  if (typeof window.__setViewMode === "function") {
    if (mode === "legacy") window.__setViewMode("split");
    else window.__setViewMode(localStorage.getItem(VIEW_KEY) || "plan");
  }
}

export function toggleLegacyUI() {
  persistUi(currentUi() === "legacy" ? "modern" : "legacy");
  flash(t(currentUi() === "legacy" ? "ui_classic" : "ui_modern"));
}

function setLeftTab(id, persist) {
  var left = $("left-sidebar");
  if (!left) return;
  if (id !== "library" && id !== "structure" && id !== "tree" && id !== "home") id = "library";
  left.setAttribute("data-left", id);
  document.querySelectorAll("#leftTabs [data-left-tab]").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-left-tab") === id);
  });
  if (persist !== false) {
    try {
      localStorage.setItem(LEFT_KEY, id);
    } catch (_) {}
  }
}

function syncViewPills() {
  var cc = $("center-canvas");
  if (!cc) return;
  var mode = cc.classList.contains("max-view-2d")
    ? "plan"
    : cc.classList.contains("max-view-3d")
      ? "3d"
      : "split";
  var map = { plan: "viewPlanBtn", "3d": "view3dBtn", split: "viewSplitBtn" };
  Object.keys(map).forEach(function (k) {
    var b = $(map[k]);
    if (b) b.classList.toggle("active", k === mode);
  });
}

export function renderFloorTabs() {
  var host = $("floor-tabs");
  if (!host) return;
  if (currentUi() === "legacy") {
    host.hidden = true;
    return;
  }
  ensureFloors();
  var floors = S.workspace && S.workspace.floors ? S.workspace.floors : [];
  /* A whole row of a phone screen for one pill and a plus is a bad trade: on
     the compact layout the strip earns its 32px only once there is a second
     floor to switch to. Adding one lives in the More sheet's File section. */
  if (floors.length < 2 && document.body.classList.contains("compact-nav")) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.innerHTML = "";
  floors.forEach(function (floor, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = floor.name || t("floor_ground") + " " + (i + 1);
    b.classList.toggle("active", floor.id === S.workspace.activeFloor);
    b.addEventListener("click", function () {
      switchFloor(floor.id);
      S.dirty3D = true;
      render2D();
      refreshTree();
      fillProps();
      fitView();
      renderFloorTabs();
    });
    host.appendChild(b);
  });
  var add = document.createElement("button");
  add.type = "button";
  add.className = "floor-add";
  add.innerHTML = '<i class="ph ph-plus"></i>';
  add.title = t("floor_add");
  add.addEventListener("click", addFloorFromUI);
  host.appendChild(add);
}

// Also reachable as the "addFloor" action (File menu / the phone's More sheet),
// because the strip that used to be the only way in is hidden on a compact
// layout until a second floor exists.
export function addFloorFromUI() {
  ensureFloors();
  var floors = (S.workspace && S.workspace.floors) || [];
  pushHistory();
  addFloor(t("floor_add"), floors.length * 300, false);
  S.dirty3D = true;
  render2D();
  refreshTree();
  fillProps();
  fitView();
  renderFloorTabs();
}

function updateToolHint() {
  var el = $("plan-hint");
  if (!el) return;
  var msg = "";
  if (S.placeType) msg = tTouch("hint_tool_place");
  else if (S.tool === "wall") msg = tTouch("hint_tool_wall");
  else if (S.tool === "rect") msg = tTouch("hint_tool_rect");
  else if (S.tool === "walloffset") msg = tTouch("hint_tool_offset");
  else if (S.tool === "wallbreak") msg = tTouch("hint_tool_break");
  else if (S.tool === "wallbite") msg = tTouch("hint_tool_wallbite");
  else if (S.tool === "walljoin") msg = tTouch("hint_tool_join");
  else if (S.tool === "wallreverse") msg = tTouch("hint_tool_reverse");
  else if (S.tool === "wallpaint") msg = tTouch("hint_tool_paint");
  else if (S.tool === "erase") msg = tTouch("hint_tool_erase");
  else if (S.tool === "door" || S.tool === "window" || S.tool === "passage")
    msg = tTouch("hint_tool_opening");
  el.textContent = msg;
  el.hidden = !msg || currentUi() === "legacy";
}

function refreshAfterScene() {
  /* The start screen swaps the whole model out. Without re-deriving the
     parametric project, `S.parametric.runtime` keeps a record — including a
     COLLISION BOX — for every item of the plan that was just replaced, and
     rebuildProject's own garbage collection is what removes them. The three
     in-home game modes build their courses from that map, so a skipped rebuild
     left them climbing furniture that is no longer in the plan. main.js
     already does this after its own defaultScene() call at boot. */
  rebuildProject(S, FURN);
  loadMEP(S.mep || null);
  refreshMEPPanel();
  S.dirty3D = true;
  fitView();
  render2D();
  fillProps();
  withoutRoomPrompts(refreshTree);
  renderFloorTabs();
}

export function openStartScreen() {
  var el = $("start-screen");
  if (!el) return;
  el.hidden = false;
}

function closeStartScreen(remember) {
  var el = $("start-screen");
  if (el) el.hidden = true;
  if (remember) {
    try {
      localStorage.setItem(START_KEY, "1");
    } catch (_) {}
  }
}

function applyStart(kind) {
  var startsMobileFlow = kind === "blank";
  if (kind === "blank") {
    emptyScene();
    S.roomMeta = {};
    S.hour = 13;
    S.northAngle = 0;
    loadMEP(null);
    setTool("rect");
  } else if (kind === "demo") {
    defaultScene();
    loadMEP(null);
    setTool("select");
  } else if (kind === "generate") {
    closeStartScreen(true);
    var btn = $("autoGenerateBtn") || document.querySelector("[data-act='autoGenerate']");
    if (btn) btn.click();
    return;
  } else if (kind === "import") {
    closeStartScreen(true);
    var inp = $("importfile");
    if (inp) inp.click();
    return;
  } else if (kind === "saved") {
    closeStartScreen(true);
    var loadBtn = document.querySelector("[data-act='load']");
    if (loadBtn) loadBtn.click();
    return;
  }
  closeStartScreen(true);
  refreshAfterScene();
  if (startsMobileFlow)
    window.dispatchEvent(new CustomEvent("planner-mobile-onboarding-start"));
}

function maybeShowStart() {
  if (currentUi() === "legacy") return;
  try {
    if (localStorage.getItem(START_KEY)) return;
  } catch (_) {}
  openStartScreen();
}

function bindLibraryDrag() {
  var ui = $("furnUI");
  var plan = $("plan");
  var view2 = $("view-2d");
  var view3 = $("view-3d");
  var dragType = null, dropGhostEl = null;
  if (!ui) return;
  function hideDropGhost() {
    if (dropGhostEl) dropGhostEl.hidden = true;
  }
  function showDropGhost(e) {
    var f = dragType && FURN[dragType];
    if (!f || !view2 || !(S.SC > 0)) return;
    if (!dropGhostEl) {
      dropGhostEl = document.createElement("div");
      dropGhostEl.className = "furn-drop-ghost";
      dropGhostEl.setAttribute("aria-hidden", "true");
      view2.appendChild(dropGhostEl);
    }
    var rect = view2.getBoundingClientRect();
    dropGhostEl.style.left = e.clientX - rect.left + "px";
    dropGhostEl.style.top = e.clientY - rect.top + "px";
    dropGhostEl.style.width = Math.min(Math.max(16, rect.width - 8), Math.max(16, Number(f.w || 40) * S.SC)) + "px";
    dropGhostEl.style.height = Math.min(Math.max(16, rect.height - 8), Math.max(16, Number(f.d || 40) * S.SC)) + "px";
    dropGhostEl.hidden = false;
  }
  ui.addEventListener("dragstart", function (e) {
    var item = e.target.closest(".furn-item[data-type]");
    if (!item || !e.dataTransfer) return;
    dragType = item.dataset.type;
    e.dataTransfer.setData("text/furn-type", item.dataset.type);
    e.dataTransfer.effectAllowed = "copy";
  });
  ui.addEventListener("dragend", function () {
    dragType = null;
    hideDropGhost();
  });
  function onDragOver(e) {
    if (!e.dataTransfer) return;
    if (Array.prototype.indexOf.call(e.dataTransfer.types, "text/furn-type") < 0 &&
        Array.prototype.indexOf.call(e.dataTransfer.types, "text/plain") < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (view2 && (e.currentTarget === plan || e.currentTarget === view2)) showDropGhost(e);
  }
  function dropOnPlan(e) {
    var type = e.dataTransfer && (e.dataTransfer.getData("text/furn-type") || e.dataTransfer.getData("text/plain"));
    if (!type || !FURN[type]) return;
    e.preventDefault();
    e.stopPropagation();
    var rect = plan.getBoundingClientRect();
    var x = wx(e.clientX - rect.left, e.clientY - rect.top);
    var z = wz(e.clientX - rect.left, e.clientY - rect.top);
    placeFurnAt(type, x, z);
    dragType = null;
    hideDropGhost();
  }
  function dropOn3d(e) {
    var type = e.dataTransfer && (e.dataTransfer.getData("text/furn-type") || e.dataTransfer.getData("text/plain"));
    if (!type || !FURN[type]) return;
    e.preventDefault();
    e.stopPropagation();
    var p = dropPoint();
    placeFurnAt(type, p.x, p.z);
    dragType = null;
    hideDropGhost();
  }
  [plan, view2].forEach(function (el) {
    if (!el) return;
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", dropOnPlan);
  });
  if (view3) {
    view3.addEventListener("dragover", onDragOver);
    view3.addEventListener("drop", dropOn3d);
  }
  if (view2) view2.addEventListener("dragleave", function (e) {
    if (!e.relatedTarget || !view2.contains(e.relatedTarget)) hideDropGhost();
  });
}

function updateCostChip() {
  var chip = $("costChip");
  var tot = $("costTotal");
  if (!chip || !tot) return;
  var text = tot.textContent || "";
  chip.textContent = text;
  chip.hidden = !text || text === "₪0" || currentUi() === "legacy";
}

function initPlannerChrome() {
  applyPlannerChrome();
  /* Undo/redo can add or remove a storey, so the tab strip has to be redrawn
     from the restored workspace. Registered rather than called from history.js:
     this module is its own entry point in index.html, outside main.js's graph,
     so nothing there can import it. */
  onAfterRestore(renderFloorTabs);
  document.body.classList.toggle("legacy-ui", currentUi() === "legacy");

  document.querySelectorAll("#leftTabs [data-left-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      setLeftTab(b.getAttribute("data-left-tab"));
    });
  });

  var start = $("start-screen");
  if (start) {
    start.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-start]");
      if (!btn) return;
      applyStart(btn.getAttribute("data-start"));
    });
  }

  var costChip = $("costChip");
  if (costChip) {
    costChip.addEventListener("click", function (e) {
      e.stopPropagation();
      var sec = document.querySelector(".cost-section");
      if (sec) sec.classList.remove("collapsed");
      sec && sec.scrollIntoView({ block: "nearest" });
    });
  }

  bindLibraryDrag();
  onLangChange(function () {
    applyPlannerChrome();
    updateToolHint();
  });
  window.addEventListener("planner-tool", updateToolHint);
  window.addEventListener("planner-place", updateToolHint);
  var cc = $("center-canvas");
  if (cc && window.MutationObserver) {
    new MutationObserver(syncViewPills).observe(cc, { attributes: true, attributeFilter: ["class"] });
  }
  var tot = $("costTotal");
  if (tot && window.MutationObserver) {
    new MutationObserver(updateCostChip).observe(tot, { childList: true, characterData: true, subtree: true });
  }
  updateCostChip();

  if (currentUi() !== "legacy" && typeof window.__setViewMode === "function") {
    var saved = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch (_) {}
    if (window.innerWidth > 768) window.__setViewMode(saved || "plan");
  }

  maybeShowStart();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlannerChrome);
} else {
  initPlannerChrome();
}

// used by ui.js runAction without a circular init race: these are live bindings
window.__plannerChrome = {
  toggleLegacyUI: toggleLegacyUI,
  openStartScreen: openStartScreen,
  applyPlannerChrome: applyPlannerChrome,
  renderFloorTabs: renderFloorTabs,
  addFloorFromUI: addFloorFromUI,
  setLeftTab: setLeftTab,
  updateToolHint: updateToolHint,
};

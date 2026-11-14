import { newDocumentKey } from "./redesign.js";
import { showcaseHouse, defaultApartment } from "./demo_house.js";
import { initPlannerWorkflow } from "./planner_workflow.js";
import { normalizePlanningGuide } from "./planning_guide.js";
import { initPlanningGuide, openPlanningGuide } from "./ui_planning_guide.js";
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
  syncPlanStyleUI,
  syncCutawayUI,
} from "./ui.js";
import { emptyScene, FURN } from "./furniture.js";
import { rebuildProject } from "./core/project.js";
import { setTool } from "./interaction.js";
import { resetLayers, saveLayers } from "./layers.js";
import { render2D, fitView, wx, wz, dropPoint, onAfterRender } from "./plan2d.js";
import { loadMEP } from "./mep.js";
import { renderPanel as refreshMEPPanel } from "./ui_mep.js";
import { withoutRoomPrompts } from "./ui_tree.js";
import { pushHistory, onAfterRestore } from "./history.js";
import {
  configureFloorIO,
  ensureFloors,
  addFloor,
  switchFloor,
  floorBelow,
  floorAbove,
  floorById,
  floorsByElevation,
  setReferenceFloor,
  nextFloorElevation,
  nextFloorName,
  cutStairwellVoids,
  referenceShown,
  referenceTarget,
  toggleReferenceFloor,
  followReferenceFloor,
} from "./floors.js";
import { floorText, floorDisplayName } from "./floor_strings.js";
import { fmtLen } from "./display_units.js";
import { viewModeSelect, fillViewModeSelect, labelViewButtons, syncViewModeGroup } from "./view_modes.js";
import { slabOpenings, stairVoidFields } from "./slab_openings.js";
import { planFrameOnScreen } from "./plan2d/reference_floor.js";
import { markDirty } from "./persist.js";
import { initCoach, coachEvaluate } from "./coach.js";

configureFloorIO({ sceneObject: sceneObject, applyData: applyData });

var UI_KEY = "home3d_ui";
var START_KEY = "home3d_start_done";
var LEFT_KEY = "home3d_left_tab";
var VIEW_KEY = "home3d_viewmode";

function $(id) {
  return document.getElementById(id);
}

function savedPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
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
    var tab = left.getAttribute("data-left") || savedPreference(LEFT_KEY) || "library";
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
    else window.__setViewMode(savedPreference(VIEW_KEY) || "plan");
  }
}

export function toggleLegacyUI() {
  persistUi(currentUi() === "legacy" ? "modern" : "legacy");
  flash(t(currentUi() === "legacy" ? "ui_classic" : "ui_modern"));
}

function setLeftTab(id, persist) {
  var left = $("left-sidebar");
  if (!left) return;
  if (id !== "library" && id !== "structure" && id !== "tree" && id !== "home" && id !== "project") id = "library";
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
  var pill = $("viewModePill");
  // the dropdown form of the same group, shown by css where the buttons do not fit
  if (pill && !pill.querySelector("select.view-mode-select")) pill.appendChild(viewModeSelect());
  syncViewModeGroup(pill);
  var mode = cc.classList.contains("max-view-2d") ? "plan" : cc.classList.contains("max-view-3d") ? "3d" : "split";
  // The strip belongs to a visible pane; keeping it under 3D hides floor
  // navigation whenever the user maximizes the plan.
  var host = $("floor-tabs");
  var pane = $(mode === "plan" ? "view-2d" : "view-3d");
  if (host && pane && host.parentElement !== pane) pane.appendChild(host);
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
  // lowest storey first, each tooltip carrying its level
  floorsByElevation(S.workspace).forEach(function (floor) {
    var i = floors.indexOf(floor);
    var b = document.createElement("button");
    b.type = "button";
    var name = floorDisplayName(floor, i);
    var elev = Number(floor.elevation) || 0;
    b.textContent = name;
    b.title = floorText("elevTip", { elev: (elev > 0 ? "+" : "") + fmtLen(elev) }) + " · " + t("floor_rename_tip");
    b.classList.toggle("active", floor.id === S.workspace.activeFloor);
    var hold = 0;
    var held = false;
    b.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse") return;
      held = false;
      clearTimeout(hold);
      hold = setTimeout(function () { held = true; renameFloorInline(b, floor, name); }, 550);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) { b.addEventListener(type, function () { clearTimeout(hold); }); });
    b.addEventListener("contextmenu", function (e) { if (held) e.preventDefault(); });
    /* A double-click is read off the click itself (detail 2) rather than a
       dblclick listener: the first click of the pair switches floor, which
       rebuilds this strip, so a dblclick would land on a button that is no
       longer in the page and the field would open where nobody can see it. */
    b.addEventListener("click", function (e) {
      if (held) { held = false; return; } // the release of a press-and-hold
      if (e.detail >= 2) { renameFloorInline(b, floor, name); return; }
      // Re-clicking the current floor must not rebuild the strip or refit the view.
      if (floor.id === S.workspace.activeFloor) return;
      // two storeys with content stay registered on screen: keep the view
      var hadContent = S.walls.length > 0 || S.items.length > 0;
      switchFloor(floor.id);
      followReferenceFloor(S.workspace);
      S.dirty3D = true;
      if (!hadContent || !planFrameOnScreen()) fitView();
      render2D();
      refreshTree();
      fillProps();
      renderFloorTabs();
      coachEvaluate();
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
  if (floors.length > 1) {
    var ref = document.createElement("button");
    ref.type = "button";
    ref.className = "floor-ref";
    ref.innerHTML = '<i class="ph ph-stack" aria-hidden="true"></i>';
    ref.addEventListener("click", toggleReferenceFromStrip);
    host.appendChild(ref);
    var note = document.createElement("span");
    note.className = "floor-ref-note";
    host.appendChild(note);
  }
  syncFloorRefToggle();
}

/* The strip's "show the floor below" button: the same state as the Layers
   row (js/floors.js toggleReferenceFloor), so the two cannot disagree. */
function toggleReferenceFromStrip() {
  if (!toggleReferenceFloor(S.workspace)) return;
  markDirty();
  render2D();
  syncFloorRefToggle();
}

function syncFloorRefToggle() {
  var host = $("floor-tabs");
  var btn = host && host.querySelector(".floor-ref");
  if (!btn) return;
  var ws = S.workspace;
  var on = referenceShown(ws);
  var ref = on ? floorById(ws.referenceFloor, ws) : referenceTarget(ws);
  var below = floorBelow(ws), above = floorAbove(ws);
  var isAbove = !!(ref && above && ref.id === above.id && !(below && below.id === ref.id));
  var label = floorText(isAbove ? (on ? "hideAbove" : "showAbove") : (on ? "hideBelow" : "showBelow"));
  if (btn.title !== label) {
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }
  var pressed = on ? "true" : "false";
  if (btn.getAttribute("aria-pressed") !== pressed) btn.setAttribute("aria-pressed", pressed);
  btn.classList.toggle("active", on);
  var note = host.querySelector(".floor-ref-note");
  if (note) {
    var text = on && ref ? floorText(isAbove ? "under" : "over", { name: floorDisplayName(ref, (ws.floors || []).indexOf(ref)) }) : "";
    if (note.textContent !== text) note.textContent = text;
    if (note.hidden !== !text) note.hidden = !text;
  }
}

/* A floor's name edits in place: the pill becomes a field, Enter keeps the new
   name (one undo step), Escape or an empty field keeps the old one. */
function renameFloorInline(button, floor, shown) {
  if (!button.isConnected) return;
  var input = document.createElement("input");
  input.type = "text";
  input.className = "floor-rename";
  input.maxLength = 60;
  input.value = shown;
  input.setAttribute("aria-label", t("floor_rename_tip"));
  // The field takes the pill's place instead of sitting inside it: a text
  // field inside a <button> is invalid and Firefox never delivers it the clicks.
  button.replaceWith(input);
  input.focus();
  input.select();
  var done = false;
  var finish = function (keep) {
    if (done) return;
    done = true;
    var next = input.value.trim().slice(0, 60);
    if (keep && next && next !== shown) {
      pushHistory();
      floor.name = next;
    }
    renderFloorTabs();
    refreshTree();
  };
  input.addEventListener("keydown", function (e) {
    e.stopPropagation(); // typing a name must not reach the plan's shortcuts
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", function () { finish(true); });
}

// Also reachable as the "addFloor" action (File menu / the phone's More sheet),
// because the strip that used to be the only way in is hidden on a compact
// layout until a second floor exists.
export function addFloorFromUI() {
  ensureFloors();
  // on top of the highest storey, named "Floor 1", "Floor 2"…
  var elevation = nextFloorElevation(S.workspace, S);
  var name = nextFloorName(S.workspace, function (n) { return floorText("floorN", { n: n }); });
  pushHistory();
  addFloor(name, elevation, false);
  // same undo step: show the storey below under it, and cut the stairwells
  // of any stairs that come up from it
  var below = floorBelow(S.workspace);
  if (below) {
    setReferenceFloor(below.id, true);
    S.workspace.referenceFollows = true;
    var rise = elevation - (Number(below.elevation) || 0);
    var cut = cutStairwellVoids(below.scene, rise, slabOpenings(), stairVoidFields);
    if (cut) flash(floorText("stairwellCut", { name: floorDisplayName(below, S.workspace.floors.indexOf(below)) }), "success");
  }
  S.dirty3D = true;
  render2D();
  refreshTree();
  fillProps();
  fitView();
  renderFloorTabs();
  coachEvaluate();
}

function updateToolHint() {
  var el = $("plan-hint");
  if (!el) return;
  var msg = "";
  if (S.placeType) msg = tTouch("hint_tool_place");
  else if (S.tool === "wall") msg = tTouch("hint_tool_wall");
  else if (S.tool === "rect") msg = tTouch(S.rectDraft ? "hint_tool_rect_next" : "hint_tool_rect");
  else if (S.tool === "walloffset") msg = tTouch("hint_tool_offset");
  else if (S.tool === "wallbreak") msg = tTouch("hint_tool_break");
  else if (S.tool === "wallbite") msg = tTouch("hint_tool_wallbite");
  else if (S.tool === "walljoin") msg = tTouch("hint_tool_join");
  else if (S.tool === "wallreverse") msg = tTouch("hint_tool_reverse");
  else if (S.tool === "wallpaint") msg = tTouch("hint_tool_paint");
  else if (S.tool === "erase") msg = tTouch("hint_tool_erase");
  else if (S.tool === "door" || S.tool === "window" || S.tool === "passage")
    msg = tTouch("hint_tool_opening");
  if (el.textContent !== msg) el.textContent = msg;
  var hide = !msg || currentUi() === "legacy";
  if (el.hidden !== hide) el.hidden = hide;
}

function refreshAfterScene() {
  /* The start screen swaps the whole model out. Without re-deriving the
     parametric project, `S.parametric.runtime` keeps a record — including a
     COLLISION BOX — for every item of the plan that was just replaced, and
     rebuildProject's own garbage collection is what removes them. The three
     in-home game modes build their courses from that map, so a skipped rebuild
     left them climbing furniture that is no longer in the plan. main.js
     already does this after its own defaultApartment() call at boot. */
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
  var intention = kind === "blank" ? "design" : ["recreate", "design", "explore"].includes(kind) ? kind : null;
  if (intention) kind = "blank";
  // Reopening the start screen must not discard the current edit without an
  // undo snapshot. Save before either scene helper replaces the model.
  var fresh = kind === "blank" || kind === "demo" || kind === "showcase";
  if (fresh) pushHistory();
  if (fresh) S.workspace = { ...S.workspace, documentKey: newDocumentKey(), baselines: Object.freeze([]), redesign: {} };
  if (fresh) {
    resetLayers();
    /* A drawing start arms the rectangle tool below; starting on its layer
       spares a "Now editing Structure · Stay on Furniture" toast about a
       plan that has no furniture yet. */
    if (intention && intention !== "explore") S.workSet = "structure";
    saveLayers();
    window.dispatchEvent(new CustomEvent("layers:changed"));
  }
  if (kind === "blank") {
    emptyScene();
    S.roomMeta = {};
    var guidedStart = !!intention && intention !== "explore";
    S.workspace.guidance = normalizePlanningGuide({ enabled: guidedStart, intention: intention || "explore" });
    S.hour = 13;
    S.northAngle = 0;
    loadMEP(null);
    setTool(intention === "explore" ? "select" : "rect");
  } else if (kind === "demo") {
    defaultApartment();
    S.workspace.guidance = normalizePlanningGuide(null);
    loadMEP(null);
    setTool("select");
  } else if (kind === "showcase") {
    loadMEP(null);
    showcaseHouse();
    S.workspace.guidance = normalizePlanningGuide(null);
    setTool("select");
    syncPlanStyleUI();
    syncCutawayUI();
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
  if (intention && intention !== "explore") {
    if (typeof window.__setViewMode === "function") window.__setViewMode("plan");
    openPlanningGuide();
  }
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

  /* Touch has no HTML5 drag-and-drop, so on a phone a library piece could only
     be tap-armed and then tapped onto the plan. Holding one now lifts it
     (~0.35 s, a short buzz) and it drags onto the plan with the same drop
     ghost and the same placement as a mouse drop. A quick tap still arms
     placement (mobile_shell.js); moving before the hold completes is a list
     scroll, exactly as before. */
  var touchLift = null, swallowClickUntil = 0;
  ui.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") return;
    var item = e.target.closest(".furn-item[data-type]");
    if (!item || !FURN[item.dataset.type]) return;
    var d = { id: e.pointerId, x: e.clientX, y: e.clientY, type: item.dataset.type, item: item, live: false };
    d.timer = setTimeout(function () {
      d.live = true;
      dragType = d.type;
      item.classList.add("touch-lifted");
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) {}
    }, 350);
    touchLift = d;
  });
  // once lifted, the finger drags the piece, not the list
  ui.addEventListener("touchmove", function (e) {
    if (touchLift && touchLift.live) e.preventDefault();
  }, { passive: false });
  function overPlan(x, y) {
    var el = document.elementFromPoint(x, y);
    return !!el && !!plan && (el === plan || (!!view2 && view2.contains(el)));
  }
  window.addEventListener("pointermove", function (e) {
    var d = touchLift;
    if (!d || e.pointerId !== d.id) return;
    if (!d.live) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) { clearTimeout(d.timer); touchLift = null; }
      return;
    }
    if (overPlan(e.clientX, e.clientY)) showDropGhost(e);
    else hideDropGhost();
  });
  function endLift(e, drop) {
    var d = touchLift;
    if (!d || e.pointerId !== d.id) return;
    clearTimeout(d.timer);
    touchLift = null;
    d.item.classList.remove("touch-lifted");
    if (!d.live) return;
    swallowClickUntil = Date.now() + 500; // the lift is not also a tap-to-arm
    hideDropGhost();
    dragType = null;
    if (drop && overPlan(e.clientX, e.clientY)) {
      var rect = plan.getBoundingClientRect();
      placeFurnAt(d.type, wx(e.clientX - rect.left, e.clientY - rect.top), wz(e.clientX - rect.left, e.clientY - rect.top));
    }
  }
  window.addEventListener("pointerup", function (e) { endLift(e, true); });
  window.addEventListener("pointercancel", function (e) { endLift(e, false); });
  ui.addEventListener("click", function (e) {
    if (Date.now() < swallowClickUntil && e.target.closest(".furn-item[data-type]")) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
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
  // the Layers row can flip the same overlay; keep the strip's button in step
  onAfterRender(syncFloorRefToggle);
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
  initPlannerWorkflow();
  initPlanningGuide();
  onLangChange(function () {
    applyPlannerChrome();
    updateToolHint();
  });
  window.addEventListener("planner-tool", updateToolHint);
  window.addEventListener("planner-place", updateToolHint);
  // the rectangle hint changes with its first corner, which fires no tool event
  onAfterRender(updateToolHint);
  var cc = $("center-canvas");
  if (cc && window.MutationObserver) {
    new MutationObserver(syncViewPills).observe(cc, { attributes: true, attributeFilter: ["class"] });
  }
  // Dollhouse is 3D with the cutaway on: its chip in the 3D pane moves the highlight too
  window.addEventListener("walls3d:changed", syncViewPills);
  labelViewButtons($("viewModePill"));
  onLangChange(function () {
    labelViewButtons($("viewModePill"));
    var sel = $("viewModePill") && $("viewModePill").querySelector("select.view-mode-select");
    if (sel) fillViewModeSelect(sel);
  });
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
  initCoach();
  window.dispatchEvent(new CustomEvent("planner-boot-ready", { detail: "chrome" }));
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

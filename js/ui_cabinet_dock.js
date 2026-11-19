/* The cabinet designer beside the room.

   Docked, the designer takes one side of the window (the right on a landscape
   screen, the bottom on a portrait one) and the planner's 3D view fills the
   rest, its camera turned square to the cabinet's front. Every edit already
   marks the plan dirty (ui_cabinet.js changed()), so the unit in the room
   follows the drawing live. A "Room" switch in the designer's header docks and
   undocks; the choice is remembered. The Fit cabinet tool always opens docked.

   Docking only moves the designer's box and the camera: the 3D pane keeps its
   size, and the framing aims the cabinet at the middle of the part of the pane
   the designer leaves uncovered. */
import { S } from "./state.js";
import { t, onLangChange } from "./i18n.js";
import { E } from "./ui_cabinet_ctx.js";
import { getMainCamera, setOrbitCamera, requestRender, isWalk, toggleWalk } from "./view3d.js";
import { dockSide, frameCabinetOrbit } from "./fit_cabinet.js";

var PREF_KEY = "home3d_cab_docked";
var docked = false, restoreView = null, forceNext = false;

function pref() {
  try { return localStorage.getItem(PREF_KEY) === "1"; } catch (_) { return false; }
}
function savePref(on) {
  try { localStorage.setItem(PREF_KEY, on ? "1" : "0"); } catch (_) {}
}
function currentView() {
  var c = document.getElementById("center-canvas") || document.querySelector(".center-canvas");
  if (!c) return null;
  return c.classList.contains("max-view-3d") ? "3d" : c.classList.contains("max-view-2d") ? "plan" : "split";
}
function setView(mode) {
  if (mode && typeof window.__setViewMode === "function") window.__setViewMode(mode);
}
/* ---- camera ------------------------------------------------------------ */

function rectOf(el) {
  var r = el && el.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
}
function visibleRect(pane) {
  var cab = rectOf(E.host);
  if (!cab || !docked) return pane;
  var side = E.host.dataset.dock;
  if (side === "right") return { left: pane.left, top: pane.top, width: Math.max(1, Math.min(pane.left + pane.width, cab.left) - pane.left), height: pane.height };
  return { left: pane.left, top: pane.top, width: pane.width, height: Math.max(1, Math.min(pane.top + pane.height, cab.top) - pane.top) };
}
export function frameCabinetInRoom(it) {
  it = it || E.it;
  var pane = rectOf(document.getElementById("view-3d"));
  if (!it || !pane) return;
  // walking drives the camera every frame; the framing needs the orbit camera
  if (isWalk()) toggleWalk(false);
  var cam = getMainCamera();
  setOrbitCamera(frameCabinetOrbit(it, pane, visibleRect(pane), cam && cam.fov));
  requestRender();
}

/* ---- layout ------------------------------------------------------------ */

function applyLayout() {
  if (!E.host) return;
  var side = dockSide(window.innerWidth, window.innerHeight);
  E.host.classList.toggle("cb-docked", docked);
  if (docked) E.host.dataset.dock = side;
  else delete E.host.dataset.dock;
  document.body.classList.toggle("cab-docked", docked);
  syncButton();
}
function settleThenFrame(it) {
  // the view switch and the designer's new box both settle over a frame or two
  window.dispatchEvent(new Event("resize"));
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
      frameCabinetInRoom(it);
    });
  });
}
function dock(on, it) {
  if (on === docked) { if (on) settleThenFrame(it); return; }
  docked = on;
  if (on) {
    restoreView = currentView();
    setView("3d");
    // the room is the 3D view now: the designer shows its drawing
    import("./ui_cabinet_view.js").then(function (m) { if (docked && E.mode === "3d") m.setMode("2d"); });
  } else if (restoreView) {
    setView(restoreView);
    restoreView = null;
  }
  if (!on) setDrawer(false);
  applyLayout();
  settleThenFrame(it);
  S.dirty3D = true;
}

function syncButton() {
  var lib = E.host && E.host.querySelector("#cbDockLib");
  if (lib) lib.innerHTML = '<i class="ph ph-cards-three"></i> <span>' + t("cabdock_presets") + "</span>";
  var b = E.host && E.host.querySelector("#cbDock");
  if (!b) return;
  b.classList.toggle("on", docked);
  b.setAttribute("aria-pressed", docked ? "true" : "false");
  b.title = t("cabdock_room_tip");
  b.innerHTML = docked
    ? '<i class="ph ph-arrows-out"></i> <span>' + t("cabdock_full") + "</span>"
    : '<i class="ph ph-house-line"></i> <span>' + t("cabdock_room") + "</span>";
}
/* Docked, the families / presets panel is a drawer over the drawing: its own
   button opens it, so does any control that selects one of its tabs (the
   ribbon's Families and Presets press those), and drawing closes it. */
function setDrawer(on) {
  // the compact (phone) layout has its own sheets for this panel
  if (E.host) E.host.classList.toggle("cb-left-open", !!on && docked && !E.host.classList.contains("cb-compact"));
}
function ensureDrawer() {
  var mid = E.host && E.host.querySelector(".cb-mid");
  if (!mid || mid.querySelector("#cbDockLib")) return;
  var b = document.createElement("button");
  b.id = "cbDockLib";
  b.type = "button";
  b.addEventListener("click", function () { setDrawer(!E.host.classList.contains("cb-left-open")); });
  mid.appendChild(b);
  E.host.addEventListener("click", function (e) {
    if (!docked || !e.target || !e.target.closest) return;
    var tab = e.target.closest("[data-tab]");
    if (tab && E.host.querySelector('.cb-tabs[data-side="L"] [data-pane="' + tab.getAttribute("data-tab") + '"]')) setDrawer(true);
  }, true);
  E.host.addEventListener("pointerdown", function (e) {
    if (docked && e.target && e.target.id === "cbCanvas") setDrawer(false);
  }, true);
}
function ensureButton() {
  ensureDrawer();
  var acts = E.host && E.host.querySelector(".cb-actions");
  if (!acts || acts.querySelector("#cbDock")) return;
  var b = document.createElement("button");
  b.id = "cbDock";
  b.type = "button";
  b.addEventListener("click", function () {
    var on = !docked;
    savePref(on);
    dock(on, E.it);
  });
  var before = acts.querySelector("#cbRevert") || acts.firstChild;
  acts.insertBefore(b, before);
}

/* ---- hooks for ui_cabinet.js ------------------------------------------- */

export function dockOnOpen(it) {
  ensureButton();
  var on = forceNext || pref();
  forceNext = false;
  dock(on, it);
  syncButton();
}
export function dockOnClose() {
  if (!docked) return;
  dock(false);
}
export function isCabinetDocked() {
  return docked;
}

if (typeof window !== "undefined") {
  // the Fit cabinet tool: straight into the designer, beside the room
  window.addEventListener("planner-fit-cabinet", function (e) {
    var it = e && e.detail && e.detail.item;
    if (!it) return;
    requestAnimationFrame(function () {
      import("./ui_cabinet.js").then(function (m) {
        forceNext = true;
        m.openCabinet(it, { historyPushed: true });
      });
    });
  });
  window.addEventListener("resize", function () {
    if (!docked || !E.host) return;
    var was = E.host.dataset.dock;
    applyLayout();
    // turning a tablet or phone moves the dock to the other edge: aim at the new free area
    if (E.host.dataset.dock !== was) settleThenFrame(E.it);
  });
  onLangChange(syncButton);
}

/* Launcher for the CAD model editor — everything needed to OFFER the editor,
 * without loading it.
 *
 * js/modeler.js is 830 KB, roughly a sixth of what still boots, for a workspace
 * most sessions never open. Worse than its size, its module body ends with a
 * top-level `await initializeModelLibrary()`, so an IndexedDB round-trip sat on
 * the critical path of every boot — including boots that never touch a model.
 *
 * This module wires the same entry points initModeler() used to (top-bar
 * button, "m" shortcut, the two furniture-panel buttons) and fetches the editor
 * on first use. The editor registers its own posture/resize listeners when it
 * loads; they only ever did work while E.open, which cannot be true until it
 * has loaded.
 *
 * THE ONE THING THAT CANNOT WAIT: saved models register into FURN at module
 * evaluation, and a plan can already contain items of those custom types. If we
 * deferred unconditionally, a project full of custom furniture would boot with
 * unbuildable items. ensureModelLibrary() below decides that at boot from two
 * cheap signals, and pulls the editor in only when one of them fires.
 */
import { S } from "./state.js";
import { FURN } from "./furniture.js";
import { getLang, onLangChange } from "./i18n.js";
import { refreshCatalogSelect } from "./model_catalog.js";
import { registerEditor } from "./pro_shell.js";

/* These two labels moved here with the buttons they title.

   The editor keeps its OWN string table and its own t() — not the global one in
   js/i18n.js — so importing the app-wide t() here silently returned the raw key
   ("openModeler" instead of "Model editor"): different function, different
   table. Same [he, en] shape and the same lookup the editor uses, so a language
   toggle behaves identically. modeler.js no longer references either key. */
var TXT = {
  editModel: ["ערוך מודל נבחר", "Edit selected model"],
  openModeler: ["עורך מודלים", "Model editor"],
};
function t(k) {
  return TXT[k] ? TXT[k][getLang() === "en" ? 1 : 0] : k;
}

var LS_MODELS = "home3d_models";
// projects this session can restore without a file picker (ui save + autosave)
var PROJECT_KEYS = ["home3d", "home3d_auto"]; // compact index; the library itself lives in IDB
var pending = null, resident = null;

/** Fetch the editor (idempotent). Resolves with the modeler module. */
export function loadModeler() {
  return (pending ||= import("./modeler.js").then(function (m) { resident = m; return m; }));
}

/** True once the editor has been fetched AND evaluated. */
export function modelerLoaded() {
  return !!resident;
}

/* The editor module itself, or null if it is not resident yet.

   Callers that must stay synchronous need this. applyData() is the case that
   forced it: it drops any item whose type FURN does not know, so a project's
   custom furniture is silently discarded unless the definitions register in the
   SAME tick. Awaiting a promise that is already resolved is still a tick too
   late, so "is it here right now" has to be answerable without one. */
export function modelerNow() {
  return resident;
}

/* Does this project need the part->geometry builder?

   Deep, not shallow. A saved project carries customModels at the top level for
   the ACTIVE floor, but every other storey keeps its own copy nested under
   workspace.floors[].scene.customModels (floors.js clones sceneObject(false)
   per floor, and sceneObject always embeds the definitions its items use).

   switchFloor() is synchronous and cannot await, so a storey whose customs were
   never registered would apply into a scene that filters its own items out.
   Answering this for the WHOLE project up front — at boot, and again for any
   payload applyData receives — is what lets every later floor switch stay
   synchronous and still be correct. */
export function projectNeedsBuilder(d) {
  if (!d || typeof d !== "object") return false;
  if (Array.isArray(d.customModels) && d.customModels.length) return true;
  var floors = d.workspace && d.workspace.floors;
  if (!Array.isArray(floors)) return false;
  return floors.some(function (f) {
    var defs = f && f.scene && f.scene.customModels;
    return Array.isArray(defs) && defs.length;
  });
}

/* Does this session have custom models that must register into FURN before the
   scene builds?

   (a) the localStorage index is non-empty — the normal signal; and
   (b) an item in the plan has a type FURN does not know, which is what a custom
       model looks like before its definition has registered. (b) exists because
       (a) can lie: the index is a cache written after the IDB load, so a cleared
       localStorage with an intact IDB library would otherwise boot with items
       that can never build. */
function libraryLooksNonEmpty() {
  try {
    var idx = JSON.parse(localStorage.getItem(LS_MODELS));
    if (Array.isArray(idx) && idx.length) return true;
  } catch (_) {}
  /* A stored project can carry its own definitions even when this browser has
     no library of its own — a shared file, or a save made on another machine.
     Loading one calls ui.applyData(), which MUST register those definitions in
     the same tick or the items referencing them are filtered out. Deciding it
     here, at boot, keeps that path synchronous for every project this session
     can actually reach on its own. */
  for (var i = 0; i < PROJECT_KEYS.length; i++) {
    try {
      var saved = JSON.parse(localStorage.getItem(PROJECT_KEYS[i]));
      if (!saved) continue;
      // the autosave wraps the project as {json: "<serialized>"}
      if (typeof saved.json === "string") saved = JSON.parse(saved.json);
      if (projectNeedsBuilder(saved)) return true;
    } catch (_) {}
  }
  return (S.items || []).some(function (it) { return it && it.type && !FURN[it.type]; });
}

/** Load the editor at boot ONLY if custom definitions are waiting to register. */
export function ensureModelLibrary() {
  if (!libraryLooksNonEmpty()) return Promise.resolve(false);
  return loadModeler().then(function () {
    refreshCatalogSelect(); // ★ prefix for whatever just registered
    return true;
  }, function () { return false; });
}

function openEditor(arg) {
  return loadModeler().then(function (m) { m.openModeler(arg); });
}

export function initModeler() {
  var topLaunch = document.getElementById("openModelerTop");
  if (topLaunch) topLaunch.addEventListener("click", function () { openEditor(); });

  window.addEventListener("keydown", function (e) {
    // Guard on the editor being closed exactly as before. While it has not
    // loaded it cannot be open, so "m" is always a launch.
    var active = document.activeElement;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey ||
        typeof e.key !== "string" || e.key.toLowerCase() !== "m") return;
    if (modelerLoaded() && pendingIsOpen()) return;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;
    e.preventDefault();
    openEditor();
  });

  // library-panel buttons under the furniture catalog (grid or legacy select)
  var wrap = document.querySelector(".furn-panel") || document.querySelector(".furn-wrap");
  if (wrap) {
    var open = document.createElement("button");
    open.className = "btn-accent";
    open.id = "openModelerBtn";
    open.innerHTML = '<i class="ph ph-cube"></i> ' + t("openModeler");
    open.style.width = "100%";
    open.style.marginTop = "5px";
    open.addEventListener("click", function () { openEditor(); });
    wrap.appendChild(open);

    var edit = document.createElement("button");
    edit.id = "editModelBtn";
    edit.innerHTML = '<i class="ph ph-pencil-simple"></i> ' + t("editModel");
    edit.style.width = "100%";
    edit.style.marginTop = "5px";
    edit.addEventListener("click", function () {
      // priority: the item selected in the plan, then a custom type in the legacy select
      if (S.sel && S.sel.kind === "item" && S.sel.ref) {
        loadModeler().then(function (m) { m.openModelerForItem(S.sel.ref); });
        return;
      }
      var sel = document.getElementById("furnsel");
      if (sel && FURN[sel.value] && FURN[sel.value].custom) openEditor(sel.value);
      else openEditor();
    });
    wrap.appendChild(edit);

    /* These labels come from the editor's own table, not from a data-i18n
       attribute, so applyStatic() cannot reach them: toggling the language left
       them in the previous one until the page was reloaded. */
    onLangChange(function () {
      open.innerHTML = '<i class="ph ph-cube"></i> ' + t("openModeler");
      edit.innerHTML = '<i class="ph ph-pencil-simple"></i> ' + t("editModel");
    });
  }

  refreshCatalogSelect(); // show ★ prefix on customs registered at load
}

/* The editor's own `E.open`, reachable only once it has loaded. Kept behind a
   function so this module never touches the editor's module scope eagerly. */
var isOpen = function () { return false; };
export function reportEditorOpenState(fn) { isOpen = fn; }
function pendingIsOpen() { return isOpen(); }

/* The shared editor switcher (js/pro_shell.js) opens the editor from here, so
   pressing "Model" is the same lazy launch as the top-bar button. The editor
   adds its own leave() once it has loaded. */
registerEditor("model", {
  open: function () { return openEditor(); },
  // Not modelerLoaded(): ui.js and rc_game.js import modeler.js directly.
  isOpen: pendingIsOpen,
});

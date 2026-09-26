/* The pro shell: one editor switcher — Planner · Model · Cabinet — shared by
 * the planner ribbon, the model editor header and the cabinet designer header,
 * so every editor can reach the other two the same way (Round 6 mockups).
 *
 * This module imports no editor. Each editor registers how it opens and how it
 * is left, which keeps the lazily-loaded model editor off the boot graph and
 * avoids an import cycle with ui_cabinet.js (which mounts the switcher too).
 *
 *   open()   — show the editor; for the cabinet designer this opens the item
 *              selected in the plan, so canOpen()/why() say when there is none.
 *   isOpen() — true while its overlay is showing.
 *   leave()  — close it; may ask about unsaved work and resolve false to stay.
 */
import { getLang } from "./i18n.js";
import { proLabel } from "./pro_catalog.js";

var EDITORS = [
  // id, full name (desktop), short name (phone, fold) — both in PRO_HE
  ["plan", "Planner", "Plan"],
  ["model", "Model editor", "Model"],
  ["cab", "Cabinet designer", "Cabinet"],
];
var MSG = {
  editor: ["Editor", "עורך"],
};
function he() { return getLang() === "he"; }
function L(text) { return proLabel(text, he() ? "he" : "en"); }
function M(key) { return MSG[key][he() ? 1 : 0]; }

var editors = {};

/** Register (or extend) an editor's open/isOpen/leave/canOpen/why hooks. */
export function registerEditor(id, hooks) {
  editors[id] = Object.assign(editors[id] || {}, hooks);
}

/** The editor whose overlay is showing, else the planner underneath them. */
export function activeEditor() {
  if (editors.model && editors.model.isOpen && editors.model.isOpen()) return "model";
  if (editors.cab && editors.cab.isOpen && editors.cab.isOpen()) return "cab";
  return "plan";
}

export function proToast(msg) {
  var el = document.getElementById("proToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "proToast";
    el.className = "pro-toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("on");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("on"); }, 2600);
}

/* Leaving goes first and may be refused (unsaved model work), and the target is
   checked before anything closes: a Cabinet press with nothing selected must
   not throw the user out of the editor they were in. */
export async function switchEditor(target) {
  var from = activeEditor();
  if (target === from) return true;
  var to = editors[target] || {};
  if (to.canOpen && !to.canOpen()) {
    if (to.why) proToast(to.why());
    return false;
  }
  var cur = editors[from];
  if (cur && cur.leave && (await cur.leave()) === false) return false;
  // The model editor may still be fetching three.js when open() resolves, so
  // this does not check isOpen() afterwards; the editor reports its own failure.
  if (to.open) await to.open();
  return true;
}

/** Markup for the switcher; `active` is "plan" | "model" | "cab". */
export function editorSwitchHTML(active, extraClass) {
  return (
    '<div class="pr-editors' + (extraClass ? " " + extraClass : "") + '" role="group" aria-label="' + M("editor") + '">' +
    EDITORS.map(function (e) {
      var on = e[0] === active;
      return (
        '<button type="button" data-pro-editor="' + e[0] + '"' + (on ? ' class="on" aria-current="page"' : "") +
        ' aria-pressed="' + on + '" title="' + L(e[1]) + '">' +
        '<span class="pr-ed-full">' + L(e[1]) + '</span><span class="pr-ed-short" aria-hidden="true">' + L(e[2]) + "</span></button>"
      );
    }).join("") +
    "</div>"
  );
}

/** Wire every switcher button inside `root` (idempotent per element). */
export function wireEditorSwitch(root) {
  root.querySelectorAll(".pr-editors [data-pro-editor]").forEach(function (b) {
    if (b._proSwitch) return;
    b._proSwitch = true;
    b.addEventListener("click", function () { switchEditor(b.getAttribute("data-pro-editor")); });
  });
}

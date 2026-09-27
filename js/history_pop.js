/* A panel as a popover.
 *
 * Some panels live where the Round-6 layouts do not show them: the edit
 * history (#planHist) in the classic header's dropdown, the friends list
 * (.friends-section) in the inspector, which phones hide. openPanelPop moves
 * such a node into a popover while it is open and puts it back where it came
 * from when it closes — the node keeps its listeners, and history.js follows
 * its panel with an IntersectionObserver, so a refresh skipped while it was
 * hidden is paid back the moment it shows. A card under the header on a
 * desktop, a bottom sheet on a phone or a fold. */
import { t } from "./i18n.js";

var pop = null, home = null, moved = null, onClose = null;

function outside(e) {
  if (pop && !pop.contains(e.target)) closeHistoryPop();
}
function onKey(e) {
  if (e.key === "Escape" && pop) { e.stopPropagation(); closeHistoryPop(); }
}

export function historyPopOpen() { return !!pop; }

export function closeHistoryPop() {
  if (!pop) return;
  if (moved && home && home.parentNode) home.parentNode.insertBefore(moved, home.nextSibling);
  if (home) home.remove();
  if (onClose) onClose(moved);
  home = null;
  moved = null;
  onClose = null;
  pop.remove();
  pop = null;
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", onKey, true);
}

/** Show `node` in the popover under `title`; `hooks.open(node)` / `hooks.close(node)`
    run after it moves in and before it goes home. Opening the same node again closes it. */
export function openPanelPop(node, title, hooks) {
  if (pop) { var same = moved === node; closeHistoryPop(); if (same) return true; }
  if (!node || !node.parentNode) return false;
  hooks = hooks || {};
  pop = document.createElement("div");
  pop.className = "pr-hist-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", title);
  pop.innerHTML = '<div class="pr-hist-head"><b></b><button type="button" class="pr-hist-x"><i class="ph ph-x" aria-hidden="true"></i></button></div><div class="pr-hist-body"></div>';
  pop.querySelector("b").textContent = title;
  var x = pop.querySelector(".pr-hist-x");
  x.setAttribute("aria-label", t("close"));
  x.addEventListener("click", closeHistoryPop);
  home = document.createComment("pop-home");
  node.parentNode.insertBefore(home, node);
  moved = node;
  onClose = hooks.close || null;
  pop.querySelector(".pr-hist-body").appendChild(node);
  document.body.appendChild(pop);
  if (hooks.open) hooks.open(node);
  // the press that opened it must not count as a press outside it
  setTimeout(function () {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  return true;
}

export function openHistoryPop() {
  return openPanelPop(document.getElementById("planHist"), t("hist_title"));
}

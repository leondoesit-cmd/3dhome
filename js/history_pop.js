/* The planner's edit history as a popover.
 *
 * history.js mounts its panel into #planHist, inside the classic header's
 * history dropdown. The Round-6 layouts do not show that dropdown, so the
 * ribbon's File › History and the phone's More sheet open the same panel here
 * instead: the node moves into the popover while it is open and back home when
 * it closes (history.js follows it with an IntersectionObserver, so a refresh
 * skipped while it was hidden is paid back the moment it shows). A card under
 * the header on a desktop, a bottom sheet on a phone or a fold. */
import { t } from "./i18n.js";

var pop = null, home = null;

function outside(e) {
  if (pop && !pop.contains(e.target)) closeHistoryPop();
}
function onKey(e) {
  if (e.key === "Escape" && pop) { e.stopPropagation(); closeHistoryPop(); }
}

export function historyPopOpen() { return !!pop; }

export function closeHistoryPop() {
  if (!pop) return;
  var hist = document.getElementById("planHist");
  if (hist && home && home.parentNode) home.parentNode.insertBefore(hist, home.nextSibling);
  if (home) home.remove();
  home = null;
  pop.remove();
  pop = null;
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", onKey, true);
}

export function openHistoryPop() {
  if (pop) { closeHistoryPop(); return true; }
  var hist = document.getElementById("planHist");
  if (!hist) return false;
  pop = document.createElement("div");
  pop.className = "pr-hist-pop";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", t("hist_title"));
  pop.innerHTML = '<div class="pr-hist-head"><b></b><button type="button" class="pr-hist-x"><i class="ph ph-x" aria-hidden="true"></i></button></div><div class="pr-hist-body"></div>';
  pop.querySelector("b").textContent = t("hist_title");
  var x = pop.querySelector(".pr-hist-x");
  x.setAttribute("aria-label", t("close"));
  x.addEventListener("click", closeHistoryPop);
  home = document.createComment("planHist-home");
  hist.parentNode.insertBefore(home, hist);
  pop.querySelector(".pr-hist-body").appendChild(hist);
  document.body.appendChild(pop);
  // the press that opened it must not count as a press outside it
  setTimeout(function () {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  return true;
}

/* The planner's views as ONE group: Plan · 3D · Dollhouse · Split · Drawing.
   The top bar's #viewModePill (js/planner_chrome.js) and the phone's pane
   strip (js/mobile_shell.js) both read this list and currentViewMode(); where
   the row of buttons does not fit, the same group shows as a dropdown
   (viewModeSelect) instead, so no view hides in an unrelated menu.

   Dollhouse is the 3D pane with the cutaway on (S.cutaway.on); Drawing is the
   professional drawing sheet over the maximized plan (.sheet-view on
   #center-canvas, js/ui_pro_drawing.js). */
import { S } from "./state.js";
import { t } from "./i18n.js";
import { draftText } from "./drafting_strings.js";

export const VIEW_MODES = Object.freeze([
  { id: "plan", act: "viewPlan", icon: "ph-blueprint", label: () => t("view_plan") },
  { id: "3d", act: "view3d", icon: "ph-cube", label: () => t("view_3d") },
  { id: "dollhouse", act: "viewDollhouse", icon: "ph-house-line", label: () => t("view_dollhouse") },
  { id: "split", act: "viewSplit", icon: "ph-rows", label: () => t("view_split") },
  { id: "drawing", act: "viewDrawing", icon: "ph-certificate", label: () => draftText("view_drawing") },
]);

/* Which view a #center-canvas class list and cutaway flag mean. */
export function viewModeOf(classList, cutawayOn) {
  if (!classList) return "split";
  if (classList.contains("sheet-view")) return "drawing";
  if (classList.contains("max-view-2d")) return "plan";
  if (classList.contains("max-view-3d")) return cutawayOn ? "dollhouse" : "3d";
  return "split";
}

export function currentViewMode() {
  const cc = document.getElementById("center-canvas");
  return viewModeOf(cc && cc.classList, !!(S.cutaway && S.cutaway.on));
}

/* The tab title names the view: "<brand> · <view>"; the brand alone when no
   view label is known. A named project leads: "<project> — <view> · <brand>",
   so tabs of several projects tell apart. */
export function pageTitle(brand, viewLabel, projectName) {
  const project = String(projectName || "").trim();
  if (project) return (viewLabel ? project + " — " + viewLabel : project) + " · " + brand;
  return viewLabel ? brand + " · " + viewLabel : brand;
}

export function syncPageTitle() {
  const mode = VIEW_MODES.find((m) => m.id === currentViewMode());
  const project = S.workspace && S.workspace.name;
  const next = pageTitle(t("brand"), mode ? mode.label() : "", project);
  if (document.title !== next) document.title = next;
}

function runView(act) {
  if (typeof window.__runAction === "function") window.__runAction(act);
}

/* The dropdown form of the group. Picking an entry runs the same action as
   its button. */
export function viewModeSelect(cls) {
  const sel = document.createElement("select");
  sel.className = "view-mode-select" + (cls ? " " + cls : "");
  sel.setAttribute("aria-label", draftText("view_mode_aria"));
  sel.addEventListener("change", () => {
    const mode = VIEW_MODES.find((m) => m.id === sel.value);
    if (mode) runView(mode.act);
  });
  fillViewModeSelect(sel);
  return sel;
}

export function fillViewModeSelect(sel) {
  sel.setAttribute("aria-label", draftText("view_mode_aria"));
  sel.textContent = "";
  VIEW_MODES.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = m.label();
    sel.appendChild(o);
  });
  sel.value = currentViewMode();
}

/* Button labels written by JS: Drawing's text is not an i18n key. */
export function labelViewButtons(root) {
  if (!root) return;
  VIEW_MODES.forEach((m) => {
    root.querySelectorAll(`[data-view-mode="${m.id}"]`).forEach((b) => {
      const label = m.label();
      b.title = label;
      b.setAttribute("aria-label", label);
      const span = b.querySelector("span");
      if (span) span.textContent = label;
    });
  });
}

/* Highlight the current view in a group of [data-view-mode] buttons and the
   dropdown beside them. */
export function syncViewModeGroup(root, onClass) {
  if (!root) return;
  const mode = currentViewMode();
  root.querySelectorAll("[data-view-mode]").forEach((b) => {
    const on = b.dataset.viewMode === mode;
    b.classList.toggle(onClass || "active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  root.querySelectorAll("select.view-mode-select").forEach((s) => { s.value = mode; });
}

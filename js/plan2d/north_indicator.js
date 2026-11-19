/* The 2D Plan view's flat north indicator, drawn inside the plan gizmo's own
   element (.plan-gizmo) so the plan tools dock keeps placing, dragging and
   sizing it as before. In the Plan view (js/plan_north.js showFlatNorth) the
   gizmo shows this arrow and hides its axis sphere; Split and elevations
   keep the sphere. Clicking the arrow turns the plan north-up, as the
   sphere's compass ring does. */
import { S } from "../state.js";
import { getLang, onLangChange } from "../i18n.js";
import { currentViewMode } from "../view_modes.js";
import { northIndicatorDeg, northText, showFlatNorth } from "../plan_north.js";
import { render2D, updatePlanGizmo } from "../plan2d.js";
import { onAfterRender } from "./overlays.js";

var northSvg = null, northTurn = null, northLastDeg = null;

function svgNode(tag, attrs) {
  var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
  return n;
}

function labelNorth() {
  if (!northSvg) return;
  var tip = northText("northTip", getLang());
  northSvg.setAttribute("aria-label", tip);
  var title = northSvg.querySelector("title");
  if (title) title.textContent = tip;
}

/* Cheap: runs after every plan render, touches the DOM only on a change. */
function syncNorthIndicator() {
  if (!northSvg) return;
  var host = northSvg.parentNode;
  if (!host) return;
  var flat = showFlatNorth(currentViewMode(), S.viewAxis);
  if (host.classList.contains("north-only") !== flat) host.classList.toggle("north-only", flat);
  var deg = northIndicatorDeg(S);
  if (deg !== northLastDeg) {
    northLastDeg = deg;
    northTurn.setAttribute("transform", "rotate(" + deg + " 42 42)");
  }
}

export function initNorthIndicator() {
  var host = document.querySelector("#view-2d .plan-gizmo") || document.querySelector(".plan-gizmo");
  if (!host || host.querySelector(".plan-north")) return;
  northSvg = svgNode("svg", { viewBox: "0 0 84 84", class: "plan-north", role: "button", tabindex: "0" });
  northSvg.appendChild(svgNode("title"));
  northTurn = svgNode("g", { class: "pn-north-turn" });
  northTurn.appendChild(svgNode("polygon", { points: "42,22 42,58 31,66", class: "pn-north-a" }));
  northTurn.appendChild(svgNode("polygon", { points: "42,22 53,66 42,58", class: "pn-north-b" }));
  var n = svgNode("text", { x: 42, y: 16, "text-anchor": "middle", class: "pn-north-n" });
  n.textContent = "N";
  northTurn.appendChild(n);
  northSvg.appendChild(northTurn);
  var faceNorth = function (e) {
    e.stopPropagation();
    S.planRot = 0;
    S.viewAxis = "top";
    render2D();
    updatePlanGizmo();
  };
  northSvg.addEventListener("click", faceNorth);
  northSvg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); faceNorth(e); }
  });
  host.appendChild(northSvg);
  labelNorth();
  onLangChange(labelNorth);
  onAfterRender(syncNorthIndicator);
  window.addEventListener("plan:view-axis", syncNorthIndicator);
  var cc = document.getElementById("center-canvas");
  if (cc && typeof MutationObserver !== "undefined")
    new MutationObserver(syncNorthIndicator).observe(cc, { attributes: true, attributeFilter: ["class"] });
  syncNorthIndicator();
}

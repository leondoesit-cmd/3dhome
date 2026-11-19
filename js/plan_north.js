/* The 2D Plan view's flat north indicator: pure parts (no DOM, no three), so
   Node tests can run them. js/plan2d/north_indicator.js draws it.

   In the Plan view the orbit-style axis gizmo (N ring + X/Y/Z nubs, js/plan2d.js
   initPlanGizmo) says nothing a flat plan needs; a north arrow does. The
   sphere stays in Split (the plan pane's elevation switch) and whenever an
   elevation is showing, so the way back to the plan is never hidden. */

/** Degrees the arrow turns, clockwise on screen: the site's north angle plus
    the plan's own rotation, the same sum the axis gizmo's compass uses. */
export function northIndicatorDeg(state) {
  var n = Number(state && state.northAngle) || 0;
  var r = Number(state && state.planRot) || 0;
  var d = (n + r) % 360;
  return d < 0 ? d + 360 : d;
}

/** Show the flat arrow instead of the sphere? Only in the Plan view, looking
    straight down. */
export function showFlatNorth(viewMode, viewAxis) {
  return viewMode === "plan" && (viewAxis || "top") === "top";
}

var TEXT = {
  north: ["North", "צפון"],
  northTip: ["North · click to turn the plan north-up", "צפון · לחיצה מסובבת את התוכנית כך שהצפון למעלה"],
};
export function northText(key, lang) {
  var pair = TEXT[key];
  return pair ? (lang === "he" ? pair[1] : pair[0]) : key;
}

/* Where the planner's Split puts its 3D view (js/pro_ribbon.js placeSplit3D
   applies it). The desktop layout docks the 3D at the top of the right column,
   over the inspector — but only while that column is on screen as a column.
   At 1024px and below the inspector is a slide-in drawer (off-screen until
   opened, an overlay when open), and a 3D docked there vanished with it; the
   plan and the 3D then share the canvas, the split every other layout uses.
   Pure, so it is unit-tested without a DOM (tests/split_dock.test.mjs). */

// facts: { desk, max2d, max3d, inspectorShown, inspectorOverlay }
//   desk             — the desktop (pro-skin) layout is on
//   max2d / max3d    — the canvas shows one view alone (not Split)
//   inspectorShown   — the right column is displayed at all
//   inspectorOverlay — it is a drawer / sheet over the canvas, not a column
export function dockSplit3D(facts) {
  var f = facts || {};
  if (!f.desk || f.max2d || f.max3d) return false;
  return !!f.inspectorShown && !f.inspectorOverlay;
}

// The inspector's facts from its computed style (a positioned inspector is
// the drawer or sheet of the narrow and compact layouts).
export function inspectorFacts(insp, getStyle) {
  var cs = insp && getStyle ? getStyle(insp) : null;
  if (!cs) return { inspectorShown: false, inspectorOverlay: false };
  return {
    inspectorShown: cs.display !== "none" && cs.visibility !== "hidden",
    inspectorOverlay: cs.position === "absolute" || cs.position === "fixed",
  };
}

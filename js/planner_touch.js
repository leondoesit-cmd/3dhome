/* Who owns a finger in the planner's 3D pane (planner_3d.js) — pure, so the
   rule is testable without a GPU.

   A finger is navigation unless it plainly means an edit: a drawing / placing
   tool is in hand, or it lands on the piece that is ALREADY selected. Empty
   space orbits, and so does an unselected sofa filling half the screen (a
   short still tap on it selects it instead) — the same "select first, then
   drag" rule the 2D plan uses for rooms on touch (interaction.js). */

/**
 * @param {string} tool    S.tool
 * @param {{ref:*}|null} hit  what the ray hit (plannerPointer3D().hit)
 * @param {{ref:*}|null} sel  S.sel
 * @returns {boolean} true → the planner edits with this finger; false → orbit
 */
export function touchClaims3D(tool, hit, sel) {
  if (tool && tool !== "select") return true;
  if (!hit) return false;
  return !!sel && sel.ref === hit.ref;
}

/** A touch that stayed within `slop` px and `ms` ms is a tap, not an orbit. */
export function isTouchTap(start, end, now, slop, ms) {
  if (!start || !end) return false;
  return now - start.t < ms && Math.hypot(end.x - start.x, end.y - start.y) <= slop;
}

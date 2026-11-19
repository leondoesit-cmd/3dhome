/* When the 3D view's loop may run a pending rebuild (js/view3d/render_loop.js).
   Pure: tested in Node (tests/rebuild_hold.test.mjs).

   Hidden pane (the Plan view, or a phone on the plan): it is rebuilt so it
   is ready the next time it is opened, but nobody is looking at it, and the
   rebuild is one synchronous task: on a mid-range laptop (4x CPU throttle,
   a generated apartment) 160-220 ms after a wall move, 60-80 ms after an
   infrastructure edit, ~110 ms after a resized piece. Started 300 ms after
   the last input it landed in the middle of the next action. So a hidden
   pane waits for a real pause: no button held and no input (pointer press or
   drag, key, wheel) for HIDDEN_QUIET_MS. Opening the pane makes it visible,
   and a visible pane does not wait for quiet, so whatever is still pending
   is built on the first frame it is shown: nothing is ever shown stale.

   Visible pane, unchanged: rebuilds wait while a gesture is in progress on
   the 2D plan, then follow it at ~8 Hz (stretched for slow rebuilds); a
   gesture in the 3D view itself is never held. */
export const HIDDEN_QUIET_MS = 1500;
export const VISIBLE_EDIT_IDLE_MS = 300;
export const VISIBLE_PLAN_DRAG_REBUILD_MS = 120;

// The maximise rule hides this entire subtree. Matching the actual ancestry
// also handles Split moving the pane into the inspector, or a game reparenting
// the canvas. Other ways of hiding the pane still use its rendered bounds.
export function plannerCanvasHidden(canvas) {
  return !!canvas && (!!canvas.closest("#center-canvas.max-view-2d #view-3d") || canvas.getClientRects().length === 0);
}

/**
 * @param {object} s
 * @param {boolean} s.pending        a rebuild of any kind is waiting
 * @param {boolean} s.hidden         the 3D canvas is not laid out (display:none up the tree)
 * @param {boolean} s.pressed        a pointer button is held
 * @param {number}  s.sinceInput     ms since the last input
 * @param {boolean} s.onPlan         the held gesture started on the 2D plan
 * @param {number}  s.sinceRebuild   ms since the last rebuild ran
 * @param {number}  s.gestureRebuildMs  how long this gesture's last rebuild took
 * @returns {boolean} true: wait
 */
export function holdRebuild(s) {
  if (!s.pending) return false;
  if (s.hidden) return !!s.waitingPictures || s.pressed || s.sinceInput < HIDDEN_QUIET_MS ||
    (!!s.waitingTextures && s.sinceRebuild < HIDDEN_QUIET_MS);
  if (!s.pressed && s.sinceInput >= VISIBLE_EDIT_IDLE_MS) return false;
  /* A slow rebuild stretches the interval: on a ~200-wall plan one takes
     ~600 ms, and at a fixed 120 ms nearly every move paid it. Only this
     gesture's rebuilds count, and only slow ones, so a small plan keeps
     the 120 ms pace. */
  const interval = s.gestureRebuildMs > 100 ? 3 * s.gestureRebuildMs : VISIBLE_PLAN_DRAG_REBUILD_MS;
  return !!s.onPlan && s.pressed && s.sinceRebuild < interval;
}

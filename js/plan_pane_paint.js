/* The plan repaint that layout changes ask for (js/main.js resizeAll and
   syncSurfaces: a window resize, the split divider, maximizing a pane).

   While the plan pane is not displayed (3D maximized, Dollhouse, the 3D tab on
   a phone) sizeCanvas() keeps the last live size, so render2D() would draw the
   whole plan into a canvas nobody sees. Neither is asked for then. Nothing is
   lost: showing the pane again is itself a layout change (setMaximized runs
   syncSurfaces, and the pane's ResizeObserver sees it leave 0×0), which comes
   back here and sizes and paints it before that frame. Readers of the plan's
   pixels (planImageCanvas: PNG export, video frames) paint on demand. */
export function paintPlanForLayout(pane, sizeCanvas, render2D) {
  if (pane && typeof pane.getClientRects === "function" && !pane.getClientRects().length) return false;
  sizeCanvas();
  render2D();
  return true;
}

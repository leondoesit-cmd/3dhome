/* A panel that repaints after every plan paint (js/ui_planning_guide.js runs
   from onAfterRender) need not rebuild while it is hidden: a left-sidebar
   tab not chosen is display:none, its host still in the DOM. hiddenRefreshGate
   answers "skip this refresh?" and, after a skipped one, watches the host
   with a ResizeObserver: the first notification that finds it on screen
   (delivered after layout, before paint) runs `render` once, so the frame
   that shows the panel already shows it current. The observer is dropped
   then, so the render's own size change cannot loop it. Without a
   ResizeObserver nothing is skipped (the old behaviour). */
export function hiddenRefreshGate(render, Observer = globalThis.ResizeObserver) {
  let stale = false, observer = null, watched = null;
  function drop() {
    if (observer) observer.disconnect();
    observer = null; watched = null;
  }
  return function skipWhileHidden(host) {
    if (typeof Observer !== "function" || host.getClientRects().length) {
      stale = false;
      return false;
    }
    stale = true;
    if (watched !== host) {
      drop();
      watched = host;
      observer = new Observer(() => {
        if (!stale || !host.getClientRects().length) return;
        stale = false;
        drop();
        render();
      });
      observer.observe(host);
    }
    return true;
  };
}

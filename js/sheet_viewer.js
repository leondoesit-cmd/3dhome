/* Document-viewer maths for the Drawing view (js/ui_pro_drawing.js): the
   view state is { zoom: px per paper mm, x, y: the page's top-left in the
   viewport, px }. Pure, so Node tests run it. */
export const PX_PER_MM = 96 / 25.4;
export const MIN_ZOOM = 0.05, MAX_ZOOM = 12, FIT_MARGIN = 24;

/* Zoom by `factor` about the point (cx, cy) of the viewport, so the spot under
   the pointer stays put. Pure: the view state in, the new one out. */
export function zoomAbout(view, factor, cx, cy) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const k = zoom / view.zoom;
  return { zoom, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k };
}

/* The whole page centred in a viewport of vw × vh px; zoom is px per paper mm. */
export function fitPage(pageMm, vw, vh) {
  const zoom = Math.max(MIN_ZOOM, Math.min((vw - 2 * FIT_MARGIN) / pageMm.w, (vh - 2 * FIT_MARGIN) / pageMm.h));
  return { zoom, x: (vw - pageMm.w * zoom) / 2, y: (vh - pageMm.h * zoom) / 2 };
}

/* Paper size of a sheet SVG from its width="…mm" height="…mm". */
export function sheetPageMm(svg) {
  const w = /\swidth="([\d.]+)mm"/.exec(svg), h = /\sheight="([\d.]+)mm"/.exec(svg);
  return w && h ? { w: Number(w[1]), h: Number(h[1]) } : { w: 420, h: 297 };
}

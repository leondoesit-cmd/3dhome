// Canvas glue for straightening phone photos of floor plans (tilt, skew and
// keystone) before automatic import or manual tracing. The measuring and
// warping math lives in core/blueprint_rectify.js and runs in Node tests.
import { planRectification, scaleRectification, warpImage } from './core/blueprint_rectify.js';

export const STRAIGHTENED_WARNING = 'The photo was straightened (tilt and perspective corrected) before tracing; check overall proportions against a printed dimension.';

// Measured on a ≤1000 px copy, applied to the full canvas. Returns the input
// canvas when it is already straight; otherwise a new canvas marked with
// `straightened`.
export function straightenCanvas(canvas) {
  const f = Math.min(1, 1000 / Math.max(canvas.width, canvas.height));
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * f); small.height = Math.round(canvas.height * f);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  const measured = planRectification(sctx.getImageData(0, 0, small.width, small.height));
  if (!measured) return canvas;
  const rect = scaleRectification(measured, canvas.width / small.width);
  const source = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  const warped = warpImage(source, rect);
  const out = document.createElement('canvas');
  out.width = warped.width; out.height = warped.height;
  out.getContext('2d', { willReadFrequently: true }).putImageData(new ImageData(warped.data, warped.width, warped.height), 0, 0);
  out.straightened = { maxMove: rect.maxMove };
  return out;
}

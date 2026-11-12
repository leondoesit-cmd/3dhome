import { pocheInk } from './blueprint_raster.js';
/* Straightens phone photos of floor plans before recognition. A plan's walls,
 * grid and dimension lines come in two orthogonal families; in a photo taken
 * at an angle each family converges on a vanishing point. We measure both
 * families from ink edges, then warp the image with the homography that makes
 * them vertical and horizontal again (rotation, skew and keystone at once).
 * Pure functions on {width,height,data}: no DOM, testable in Node. */

const SLOPE_LIMIT = 0.14;   // about ±8°: beyond that the photo needs re-taking
const SLOPE_STEP = 0.001;

function inkMask({ width, height, data }) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (data[i * 4 + 3] > 127 && (Math.max(r, g, b) < 150 || pocheInk(r, g, b))) mask[i] = 1;
  }
  return mask;
}

// Lines of one family as {x0, k}: x = x0 + k*y for the near-vertical family
// (coordinates swapped for the near-horizontal one). Hough over ink edges, so
// a thick filled wall gives two sharp lines instead of one wide plateau.
function familyLines(mask, width, height, vertical) {
  const across = vertical ? width : height, along = vertical ? height : width;
  const at = (u, v) => mask[vertical ? v * width + u : u * width + v];
  const edges = [];
  for (let v = 0; v < along; v++) for (let u = 1; u < across; u++)
    if (at(u, v) !== at(u - 1, v)) edges.push(u, v);
  const steps = Math.round(SLOPE_LIMIT / SLOPE_STEP), bins = across + 2 * Math.ceil(SLOPE_LIMIT * along) + 2;
  const offset = Math.ceil(SLOPE_LIMIT * along) + 1, minSupport = Math.max(40, along * 0.12);
  // A line's count is flat over a small slope range; take the middle of that
  // plateau, not its first slope (which would bias straight lines).
  const best = new Float32Array(bins), kSum = new Float32Array(bins), kCount = new Uint16Array(bins), hist = new Uint16Array(bins);
  for (let s = -steps; s <= steps; s++) {
    const k = s * SLOPE_STEP;
    hist.fill(0);
    for (let i = 0; i < edges.length; i += 2) hist[Math.round(edges[i] - k * edges[i + 1]) + offset]++;
    for (let b = 0; b < bins; b++) {
      if (hist[b] > best[b]) { best[b] = hist[b]; kSum[b] = k; kCount[b] = 1; }
      else if (hist[b] && hist[b] === best[b]) { kSum[b] += k; kCount[b]++; }
    }
  }
  const bestK = b => kSum[b] / kCount[b];
  const lines = [];
  for (let b = 0; b < bins; b++) {
    if (best[b] < minSupport) continue;
    let peak = true;
    for (let d = -3; d <= 3 && peak; d++) if (d && best[b + d] > best[b] || d > 0 && best[b + d] === best[b]) peak = false;
    if (peak) lines.push({ x0: b - offset, k: bestK(b), support: best[b] });
  }
  return lines;
}

// Fit k = a + c*x0 (all lines through one vanishing point; c = 0 when the
// family is parallel). Iteratively reweighted, dropping text/furniture strays.
function fitFamily(lines) {
  if (lines.length < 3) return null;
  let use = lines, a = 0, c = 0;
  for (let pass = 0; pass < 4; pass++) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const l of use) { const w = l.support; sw += w; sx += w * l.x0; sy += w * l.k; sxx += w * l.x0 * l.x0; sxy += w * l.x0 * l.k; }
    const mx = sx / sw, my = sy / sw, vx = sxx / sw - mx * mx;
    c = vx > 1 ? (sxy / sw - mx * my) / vx : 0;
    a = my - c * mx;
    const kept = lines.filter(l => Math.abs(l.k - a - c * l.x0) <= 0.006);
    if (kept.length < 3) return null;
    use = kept;
  }
  const spread = Math.max(...use.map(l => l.x0)) - Math.min(...use.map(l => l.x0));
  // A slope trend measured over a narrow band is noise, not perspective.
  if (spread < 100) { c = 0; a = use.reduce((n, l) => n + l.k * l.support, 0) / use.reduce((n, l) => n + l.support, 0); }
  return { a, c, lines: use.length };
}

function mul(A, B) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) for (let i = 0; i < 3; i++) out[r * 3 + col] += A[r * 3 + i] * B[i * 3 + col];
  return out;
}
function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(v => v / det);
}
export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/* Measures the two line families. Returns null when the image is already
 * straight (all corners move < 1.5 px) or the evidence is too thin to trust. */
export function planRectification(image) {
  const { width, height } = image, mask = inkMask(image);
  const v = fitFamily(familyLines(mask, width, height, true));
  const h = fitFamily(familyLines(mask, width, height, false));
  if (!v || !h) return null;
  // Vertical family: x = x0 + (a + c*x0)*y meets at the homogeneous point
  // (a, 1, -c); horizontal family: y = y0 + (a + c*y0)*x at (1, a, -c).
  const v1 = [v.a, 1, -v.c], v2 = [1, h.a, -h.c];
  const l = [v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]];
  if (Math.abs(l[2]) < 1e-9) return null;
  const P = [1, 0, 0, 0, 1, 0, l[0] / l[2], l[1] / l[2], 1];
  // After P both vanishing points are at infinity in directions (a_v, 1) and
  // (1, a_h); A maps those directions back onto the axes.
  const det = 1 - v.a * h.a;
  if (Math.abs(det) < 0.5) return null;
  let H = mul([1 / det, -v.a / det, 0, -h.a / det, 1 / det, 0, 0, 0, 1], P);
  // Keep the photo's own scale at its centre along each axis (the true aspect
  // is not recoverable from two vanishing points; the printed dimensions and
  // plan width calibrate it afterwards).
  const cx = width / 2, cy = height / 2, o = applyHomography(H, cx, cy);
  const ex = applyHomography(H, cx + 1, cy), ey = applyHomography(H, cx, cy + 1);
  const sx = 1 / Math.hypot(ex.x - o.x, ex.y - o.y), sy = 1 / Math.hypot(ey.x - o.x, ey.y - o.y);
  H = mul([sx, 0, 0, 0, sy, 0, 0, 0, 1], H);
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => applyHomography(H, x, y));
  const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y));
  H = mul([1, 0, -minX, 0, 1, -minY, 0, 0, 1], H);
  let moved = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => applyHomography(H, x, y));
  let outW = Math.max(...moved.map(p => p.x)), outH = Math.max(...moved.map(p => p.y));
  if (!(outW > 0 && outH > 0) || outW > width * 1.3 || outH > height * 1.3) return null;
  // Compare against the straight image: translation alone is no correction,
  // and sub-2.5 px corner moves are measurement noise.
  const original = [[0, 0], [width, 0], [0, height], [width, height]];
  const shift = moved.map((p, i) => [p.x - original[i][0], p.y - original[i][1]]);
  const maxMove = Math.max(...shift.map(([dx, dy]) => Math.hypot(dx - shift[0][0], dy - shift[0][1])));
  if (maxMove < 2.5) return null;
  // Never grow the image past its own longest side (pixel budgets downstream).
  const fit = Math.min(1, Math.max(width, height) / Math.max(outW, outH));
  if (fit < 1) {
    H = mul([fit, 0, 0, 0, fit, 0, 0, 0, 1], H);
    moved = moved.map(p => ({ x: p.x * fit, y: p.y * fit }));
  }
  outW = Math.ceil(outW * fit); outH = Math.ceil(outH * fit);
  return { H, width: outW, height: outH, maxMove, families: { vertical: v, horizontal: h } };
}

// The same correction for the image at `k` times the measured size.
export function scaleRectification(rect, k) {
  const H = mul(mul([k, 0, 0, 0, k, 0, 0, 0, 1], rect.H), [1 / k, 0, 0, 0, 1 / k, 0, 0, 0, 1]);
  return { ...rect, H, width: Math.max(1, Math.round(rect.width * k)), height: Math.max(1, Math.round(rect.height * k)), maxMove: rect.maxMove * k };
}

// Inverse-maps every output pixel into the source with bilinear sampling;
// outside the photo is white paper.
export function warpImage(image, rect) {
  const { width, height, data } = image, Hi = invert(rect.H);
  const out = new Uint8ClampedArray(rect.width * rect.height * 4).fill(255);
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
    const p = applyHomography(Hi, x + 0.5, y + 0.5), sx = p.x - 0.5, sy = p.y - 0.5;
    if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0, o = (y * rect.width + x) * 4;
    for (let ch = 0; ch < 3; ch++) {
      const a = data[(y0 * width + x0) * 4 + ch], b = data[(y0 * width + x1) * 4 + ch];
      const c = data[(y1 * width + x0) * 4 + ch], d = data[(y1 * width + x1) * 4 + ch];
      out[o + ch] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return { width: rect.width, height: rect.height, data: out };
}

export function rectifyPlanImage(image) {
  const rect = planRectification(image);
  return rect ? { image: warpImage(image, rect), rect } : null;
}

// Tiny software rasterizer for the synthetic floor-plan generator. Works on
// RGBA images ({ width, height, data }) and 1-byte masks ({ width, height,
// data: Uint8Array }) in pixel units. No anti-aliasing of its own: the
// generator draws at 2x and box-downsamples, which antialiases everything in
// one place and keeps every primitive here a plain coverage test.

export function createImage(width, height, color = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

export function createMask(width, height) {
  return { width, height, data: new Uint8Array(width * height) };
}

function blend(img, i, color, alpha) {
  const d = img.data;
  if (alpha >= 1) {
    d[i] = color[0];
    d[i + 1] = color[1];
    d[i + 2] = color[2];
    return;
  }
  d[i] += (color[0] - d[i]) * alpha;
  d[i + 1] += (color[1] - d[i + 1]) * alpha;
  d[i + 2] += (color[2] - d[i + 2]) * alpha;
}

// Even-odd scanline fill sampled at pixel centres. `plot(x, y)` is called for
// every covered pixel, so the same walk fills images and masks.
function scanPolygon(width, height, pts, plot) {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const y0 = Math.max(0, Math.ceil(minY - 0.5));
  const y1 = Math.min(height - 1, Math.floor(maxY - 0.5));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > sy) !== (b.y > sy)) xs.push(a.x + ((sy - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) plot(x, y);
    }
  }
}

export function fillPolygon(img, pts, color, alpha = 1) {
  scanPolygon(img.width, img.height, pts, (x, y) => blend(img, (y * img.width + x) * 4, color, alpha));
}

export function fillPolygonMask(mask, pts, value = 255) {
  scanPolygon(mask.width, mask.height, pts, (x, y) => { mask.data[y * mask.width + x] = value; });
}

// A segment as a rectangle `width` wide; `cap` extends both ends by that many
// pixels (square caps), which is how wall ends close their corners.
export function segmentQuad(a, b, width, cap = 0) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy * width / 2, ny = ux * width / 2;
  const ax = a.x - ux * cap, ay = a.y - uy * cap, bx = b.x + ux * cap, by = b.y + uy * cap;
  return [
    { x: ax + nx, y: ay + ny }, { x: bx + nx, y: by + ny },
    { x: bx - nx, y: by - ny }, { x: ax - nx, y: ay - ny },
  ];
}

export function strokeSegment(img, a, b, width, color, cap = 0) {
  fillPolygon(img, segmentQuad(a, b, Math.max(1, width), cap), color);
}

export function strokePolyline(img, pts, width, color) {
  for (let i = 1; i < pts.length; i++) strokeSegment(img, pts[i - 1], pts[i], width, color, width / 2);
}

export function arcPoints(c, r, a0, a1, step = 0.08) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}

export function strokeArc(img, c, r, a0, a1, width, color) {
  strokePolyline(img, arcPoints(c, r, a0, a1, Math.min(0.08, 3 / Math.max(r, 1))), width, color);
}

export function fillCircle(img, c, r, color) {
  fillPolygon(img, arcPoints(c, r, 0, Math.PI * 2, Math.min(0.2, 2 / Math.max(r, 1))), color);
}

export function strokeRect(img, x0, y0, x1, y1, width, color) {
  strokePolyline(img, [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
  ], width, color);
}

// Paint `color(x, y)` (an [r,g,b] or null to skip) wherever the mask is set.
export function paintMask(img, mask, color) {
  const fixed = Array.isArray(color) ? color : null;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!mask.data[y * mask.width + x]) continue;
      const c = fixed || color(x, y);
      if (c) blend(img, (y * img.width + x) * 4, c, 1);
    }
  }
}

// Pixels of the mask within `radius` of an unset pixel: the drawn outline of
// a filled region (how CAD exports show walls as two thin lines).
export function maskEdge(mask, radius = 1) {
  const { width, height, data } = mask;
  const out = createMask(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[y * width + x]) continue;
      let edge = false;
      for (let dy = -radius; dy <= radius && !edge; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height || !data[yy * width + xx]) {
            edge = true;
            break;
          }
        }
      }
      if (edge) out.data[y * width + x] = 255;
    }
  }
  return out;
}

export function downsample(img, factor) {
  const w = Math.floor(img.width / factor), h = Math.floor(img.height / factor);
  const out = createImage(w, h);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy++) {
        let i = ((y * factor + dy) * img.width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx++, i += 4) {
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
    }
  }
  return out;
}

// Rotate about the image centre into a same-size image (bilinear, white fill).
// Positive angles turn clockwise on screen, matching y-down pixel space.
export function rotateImage(img, angle) {
  const { width: w, height: h } = img;
  const out = createImage(w, h);
  const cx = w / 2, cy = h / 2, c = Math.cos(angle), s = Math.sin(angle);
  const src = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const sx = c * dx + s * dy + cx - 0.5, sy = -s * dx + c * dy + cy - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 255 : src[(yy * w + xx) * 4 + k]);
        out.data[o + k] =
          at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) +
          at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      }
    }
  }
  return out;
}

export function boxBlur(img, radius = 1) {
  if (radius < 1) return img;
  const { width: w, height: h } = img;
  const pass = (src, horizontal) => {
    const out = createImage(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const i = (yy * w + xx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
        const o = (y * w + x) * 4;
        out.data[o] = r / n;
        out.data[o + 1] = g / n;
        out.data[o + 2] = b / n;
      }
    }
    return out;
  };
  return pass(pass(img, true), false);
}

// Gaussian-ish noise (sum of uniforms) from the caller's seeded rng, plus an
// optional paper tint — scans and phone photos are never pure white.
export function addNoise(img, sigma, rng, tint = null) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() + rng() + rng() - 1.5) * 2 * sigma;
    for (let k = 0; k < 3; k++) {
      let v = d[i + k];
      if (tint) v = v * (tint[k] / 255);
      d[i + k] = v + n;
    }
  }
}

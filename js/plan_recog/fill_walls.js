// Walls drawn as filled shapes: marketing and sales sheets often paint the
// walls as solid grey/green/blue regions with no outline, which the face-
// pairing recognizer in vector_plan.js cannot see. This reads them as a
// raster mask instead: every fill colour is rasterised on its own, each
// connected piece is measured (thickness ≈ 2·area / perimeter), pieces as
// thick as a wall are kept, and the colour with the most wall length wins,
// together with other wall-thick colours touching it (concrete + block).
//
// The result is a cell mask in centimetres: exactly the label a segmentation
// model needs, and the barrier for footprint and room checks. Pure: input is
// readPagePrimitives output plus a scale (cm per sheet unit).

const WALL_MIN_CM = 6;
const WALL_MAX_CM = 70;
const PIECE_MIN_M2 = 0.05;
const MAX_CELLS = 2.5e6;

const quantKey = (rgb) => rgb.map((c) => Math.round(c / 6) * 6).join(",");
const isPaper = (rgb) => Math.min(...rgb) >= 244;

// Even-odd scanline fill of one path's subpaths into `mask` (value 1).
function fillPath(mask, w, h, subpaths, toCell) {
  const edges = [];
  for (const sp of subpaths) {
    const pts = sp.points.map(toCell);
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (pts[i].y !== pts[j].y) edges.push([pts[j], pts[i]]);
    }
  }
  if (!edges.length) return;
  const ys = edges.flatMap(([a, b]) => [a.y, b.y]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    const xs = [];
    for (const [a, b] of edges) {
      if ((a.y > sy) !== (b.y > sy)) xs.push(a.x + ((sy - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.round(xs[i])), xb = Math.min(w, Math.round(xs[i + 1]));
      for (let x = xa; x < xb; x++) mask[y * w + x] ^= 1;
    }
  }
}

// Connected pieces of a 0/1 mask: [{ cells: [indices], area, perimeter }]
// with area in cells and perimeter in cell edges.
function pieces(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    const cells = [s];
    seen[s] = 1;
    let perimeter = 0;
    for (let n = 0; n < cells.length; n++) {
      const i = cells[n], x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1];
      for (const j of nb) {
        if (j < 0 || !mask[j]) { perimeter++; continue; }
        if (!seen[j]) { seen[j] = 1; cells.push(j); }
      }
    }
    out.push({ cells, area: cells.length, perimeter });
  }
  return out;
}

/**
 * prims: readPagePrimitives output; cmPerUnit: scale. Options: region
 * ({x0,y0,x1,y1} sheet units, default the page), cell (cm).
 * Returns null when no fill reads as walls, else { mask, w, h, cell, x0, y0
 * (sheet units of the grid origin), cmPerUnit, colours: [{ rgb, lengthM,
 * thicknessCm }], lengthM, areaM2 }.
 */
export function fillWalls(prims, cmPerUnit, options = {}) {
  const k = cmPerUnit;
  const region = options.region || { x0: 0, y0: 0, x1: prims.width, y1: prims.height };
  const spanCm = Math.max(region.x1 - region.x0, region.y1 - region.y0) * k;
  const cell = Math.max(options.cell || 4, Math.ceil(spanCm / Math.sqrt(MAX_CELLS)));
  const w = Math.ceil(((region.x1 - region.x0) * k) / cell) + 1;
  const h = Math.ceil(((region.y1 - region.y0) * k) / cell) + 1;
  const toCell = (p) => ({ x: ((p.x - region.x0) * k) / cell, y: ((p.y - region.y0) * k) / cell });
  const byColour = new Map();
  for (const p of prims.paths) {
    if (!Array.isArray(p.fill) || isPaper(p.fill)) continue;
    // walls have straight edges; a small fill outlined mostly by curves is a
    // cushion, a toilet seat or a plant in the wall colour (a large wall
    // path may still carry a few arcs at door jambs)
    let segs = 0, curved = 0, px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
    for (const sp of p.subpaths) {
      const c = sp.curvedSeg || [];
      for (let i = 1; i < c.length; i++) { segs++; if (c[i]) curved++; }
      for (const q of sp.points) {
        if (q.x < px0) px0 = q.x;
        if (q.x > px1) px1 = q.x;
        if (q.y < py0) py0 = q.y;
        if (q.y > py1) py1 = q.y;
      }
    }
    if (segs >= 4 && curved / segs > 0.3 && Math.max(px1 - px0, py1 - py0) * k < 250) continue;
    const key = quantKey(p.fill);
    if (!byColour.has(key)) byColour.set(key, { rgb: p.fill, paths: [] });
    byColour.get(key).paths.push(p);
  }
  const groups = [];
  for (const [key, g] of byColour) {
    const mask = new Uint8Array(w * h);
    for (const p of g.paths) {
      // each path fills on its own (even-odd within it), paths union
      const one = new Uint8Array(w * h);
      fillPath(one, w, h, p.subpaths.filter((sp) => sp.points.length >= 3), toCell);
      for (let i = 0; i < one.length; i++) if (one[i]) mask[i] = 1;
    }
    const kept = new Uint8Array(w * h);
    let length = 0, area = 0;
    const thick = [];
    for (const piece of pieces(mask, w, h)) {
      const t = (2 * piece.area * cell) / piece.perimeter; // cm
      const m2 = (piece.area * cell * cell) / 1e4;
      if (t < WALL_MIN_CM || t > WALL_MAX_CM || m2 < PIECE_MIN_M2) continue;
      for (const i of piece.cells) kept[i] = 1;
      length += (piece.area * cell * cell) / t / 100; // m (area in cm² / thickness)
      area += m2;
      thick.push([t, m2]);
    }
    if (length > 0) groups.push({ key, rgb: g.rgb, kept, length, area, thick });
  }
  if (!groups.length) return null;
  groups.sort((a, b) => b.length - a.length);
  const best = groups[0];
  if (best.length < 8) return null;
  const mask = best.kept.slice();
  const chosen = [best];
  // other wall-thick colours that touch the winner (a second wall material)
  for (const g of groups.slice(1)) {
    if (g.length < 0.1 * best.length) continue;
    let touches = false;
    for (let i = 0; i < w * h && !touches; i++) {
      if (!g.kept[i]) continue;
      const x = i % w;
      touches = (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (i >= w && mask[i - w]) || (i < w * (h - 1) && mask[i + w]);
    }
    if (!touches) continue;
    for (let i = 0; i < w * h; i++) if (g.kept[i]) mask[i] = 1;
    chosen.push(g);
  }
  const median = (pairs) => {
    const s = pairs.slice().sort((a, b) => a[0] - b[0]);
    const total = s.reduce((n, [, m2]) => n + m2, 0);
    let acc = 0;
    for (const [t, m2] of s) { acc += m2; if (acc >= total / 2) return t; }
    return 0;
  };
  return {
    mask, w, h, cell, x0: region.x0, y0: region.y0, cmPerUnit: k,
    colours: chosen.map((g) => ({ rgb: g.rgb, lengthM: +g.length.toFixed(1), thicknessCm: +median(g.thick).toFixed(1) })),
    lengthM: +chosen.reduce((n, g) => n + g.length, 0).toFixed(1),
    areaM2: +chosen.reduce((n, g) => n + g.area, 0).toFixed(2),
  };
}

// Chamfer (3-4) distance, in cells, from every cell to the nearest set cell.
function distanceTo(set, W, H) {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = set[i] ? 0 : INF;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 1);
        if (x > 0) v = Math.min(v, d[i - W - 1] + 1.4142);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + 1.4142);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 1);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + 1.4142);
        if (x > 0) v = Math.min(v, d[i + W - 1] + 1.4142);
      }
      d[i] = v;
    }
  }
  return d;
}

/**
 * Footprint of a fill-wall plan, m², by morphological closing: the walls are
 * grown by `gapCm / 2` so door and window gaps up to `gapCm` close, the
 * outside is flooded, and the outside is grown back by the same amount so
 * the outline returns to the outer wall faces. Balconies and laundry nooks
 * bounded only by railings stay outside. Also returns `locate(xCm, yCm)` →
 * true when inside the footprint.
 */
const FOOTPRINT_GAP_CM = 260;

export function fillFootprint(walls, gapCm = FOOTPRINT_GAP_CM) {
  const g = closedWalls(walls, gapCm);
  if (!g) return { footprint: 0, locate: () => false };
  const outside = outsideOf(g, gapCm / 2 / walls.cell);
  const { W, H } = g;
  let inside = 0;
  for (let i = 0; i < W * H; i++) if (!outside[i]) inside++;
  const locate = (xCm, yCm) => {
    const i = g.index(xCm, yCm);
    return i >= 0 && !outside[i];
  };
  return { footprint: +((inside * walls.cell * walls.cell) / 1e4).toFixed(2), locate };
}

/**
 * Rooms of a fill-wall plan: the walls closed over door-sized gaps (gapCm),
 * each enclosed free region one room. Returns { rooms: [{ areaM2 }] (the
 * region inside the closing band, so a little smaller than the room),
 * locate(xCm, yCm) → room index or -1 }. A point in the closing band next to
 * a wall belongs to the nearest room within the band.
 */
export function fillRooms(walls, gapCm = 110) {
  // one grid for both closings, sized for the wider (footprint) one
  const g = closedWalls(walls, Math.max(gapCm, FOOTPRINT_GAP_CM));
  if (!g) return { rooms: [], locate: () => -1 };
  const { W, H } = g;
  const r = gapCm / 2 / walls.cell;
  // rooms close over door gaps; window gaps (wider) are closed by the
  // footprint, so a room with a big window does not leak outside
  const outside = outsideOf(g, FOOTPRINT_GAP_CM / 2 / walls.cell);
  const closed = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) closed[i] = g.fromWall[i] <= r || outside[i] ? 1 : 0;
  const label = new Int32Array(W * H).fill(-1);
  const tag = new Uint8Array(W * H);
  const rooms = [];
  for (let s = 0; s < W * H; s++) {
    if (closed[s] || tag[s]) continue;
    const cells = floodFrom([s], closed, tag, 2, W, H);
    const areaM2 = (cells.length * walls.cell * walls.cell) / 1e4;
    if (areaM2 < 0.5) continue;
    for (const i of cells) label[i] = rooms.length;
    rooms.push({ areaM2: +areaM2.toFixed(2) });
  }
  const reach = Math.ceil(r) + 1;
  const locate = (xCm, yCm) => {
    const i = g.index(xCm, yCm);
    if (i < 0) return -1;
    if (label[i] >= 0) return label[i];
    const cx = i % W, cy = (i / W) | 0;
    let best = -1, bd = Infinity;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const l = label[y * W + x], d = dx * dx + dy * dy;
        if (l >= 0 && d < bd) { bd = d; best = l; }
      }
    }
    return best;
  };
  return { rooms, locate };
}

// The wall mask cropped to its bounds plus a margin, with a copy grown by
// half the gap (so gaps up to gapCm close). index(xCm, yCm) maps a point in
// page centimetres to a cell, or -1.
function closedWalls(walls, gapCm) {
  const { w, h, cell, x0, y0, cmPerUnit: k } = walls;
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (let i = 0; i < w * h; i++) {
    if (!walls.mask[i]) continue;
    const x = i % w, y = (i / w) | 0;
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;
  }
  if (bx1 < 0) return null;
  const r = gapCm / 2 / cell;
  const m = Math.ceil(r) + 2;
  bx0 -= m; by0 -= m; bx1 += m; by1 += m;
  const W = bx1 - bx0 + 1, H = by1 - by0 + 1;
  const wall = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x + bx0, sy = y + by0;
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) wall[y * W + x] = walls.mask[sy * w + sx];
    }
  }
  const fromWall = distanceTo(wall, W, H);
  const index = (xCm, yCm) => {
    const x = Math.floor((xCm - x0 * k) / cell) - bx0, y = Math.floor((yCm - y0 * k) / cell) - by0;
    return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1;
  };
  return { W, H, wall, fromWall, index };
}

// Outside cells after closing the walls by radius r (cells): flood from the
// border over cells farther than r from a wall, then grow the flooded region
// back by r so it ends at the outer wall faces (never inside a wall).
function outsideOf(g, r) {
  const { W, H, wall, fromWall } = g;
  const closed = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) closed[i] = fromWall[i] <= r ? 1 : 0;
  const reach = new Uint8Array(W * H);
  const border = [];
  for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
  floodFrom(border, closed, reach, 1, W, H);
  const fromOutside = distanceTo(reach, W, H);
  const outside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) outside[i] = !wall[i] && fromOutside[i] <= r + 0.5 ? 1 : 0;
  return outside;
}

// 4-connected flood over cells where blocked[i] is 0, marking mark[i] = value.
function floodFrom(seeds, blocked, mark, value, W, H) {
  const cells = [];
  const stack = [];
  const push = (i) => { if (!blocked[i] && !mark[i]) { mark[i] = value; stack.push(i); cells.push(i); } };
  for (const s of seeds) push(s);
  while (stack.length) {
    const i = stack.pop(), x = i % W;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (i >= W) push(i - W);
    if (i < W * (H - 1)) push(i + W);
  }
  return cells;
}

/**
 * How well wall centrelines (cm, { a:{x,y}, b:{x,y} }) and a fill-wall mask
 * agree: `onMask` = share of centreline length on (or within 1 cell of) the
 * mask, `covered` = share of mask cells within 35 cm of a centreline.
 */
export function wallAgreement(walls, lines) {
  const { mask, w, h, cell, x0, y0, cmPerUnit: k } = walls;
  if (!lines.length) return { onMask: 0, covered: 0 };
  const near = distanceTo(mask, w, h);
  const linesGrid = new Uint8Array(w * h);
  let on = 0, total = 0;
  for (const l of lines) {
    const ax = (l.a.x - x0 * k) / cell, ay = (l.a.y - y0 * k) / cell, bx = (l.b.x - x0 * k) / cell, by = (l.b.y - y0 * k) / cell;
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay)) + 1;
    for (let s = 0; s <= steps; s++) {
      const x = Math.floor(ax + ((bx - ax) * s) / steps), y = Math.floor(ay + ((by - ay) * s) / steps);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      total++;
      if (near[y * w + x] <= 1.5) on++;
      linesGrid[y * w + x] = 1;
    }
  }
  const fromLines = distanceTo(linesGrid, w, h);
  let maskCells = 0, coveredCells = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    maskCells++;
    if (fromLines[i] * cell <= 35) coveredCells++;
  }
  return { onMask: total ? +(on / total).toFixed(2) : 0, covered: maskCells ? +(coveredCells / maskCells).toFixed(2) : 0 };
}

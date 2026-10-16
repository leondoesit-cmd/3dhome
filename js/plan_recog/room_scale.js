// Drawing scale from room labels, for sheets without dimension chains. Plans
// print each room's floor area ("12.4 m²", "12.4 מ"ר", "134 sq ft") or its
// size ("3.40 x 4.20", "12'6\" x 10'0\""). Once walls are known in sheet units
// (at a provisional scale — wall pairing tolerates ±20%), flooding the room
// around each label gives its area / extent in sheet units, and the label
// gives it in cm: the ratio is the scale. Labels state net (inside-face)
// areas; the flood is bounded by wall faces, so it measures the same thing.
import { parseLength } from "./dimensions.js";

const SQFT = 929.0304; // cm² per square foot

/** cm² for an area label, or null. */
export function parseArea(str) {
  const s = String(str).trim().replace(/\s+/g, " ");
  const m = s.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(m²|m2|sq\.? ?ft\.?|ft²|sf|מ"ר|מ״ר|מ'ר|מר)/i);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  if (!(v > 0.5)) return null;
  return /ft|sf/i.test(m[2]) ? v * SQFT : v * 1e4;
}

/** [[a cm candidates], [b cm candidates]] for a "W x L" label, or null. */
export function parseRoomSize(str) {
  const parts = String(str).trim().split(/\s*[x×X*]\s*/);
  if (parts.length !== 2) return null;
  const a = parseLength(parts[0]), b = parseLength(parts[1]);
  return a.length && b.length ? [a, b] : null;
}

// Rasterize walls (sheet units; each { a, b, thickness } with thickness in
// sheet units) into a blocked-cell grid covering `bounds`.
function wallGrid(walls, bounds, cell) {
  const w = Math.ceil((bounds.x1 - bounds.x0) / cell) + 3, h = Math.ceil((bounds.y1 - bounds.y0) / cell) + 3;
  const grid = new Uint8Array(w * h);
  const gx = (x) => (x - bounds.x0) / cell + 1, gy = (y) => (y - bounds.y0) / cell + 1;
  for (const wall of walls) {
    const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, half = wall.thickness / 2;
    // ends pushed out by half a thickness so corners close
    const ax = wall.a.x - ux * half, ay = wall.a.y - uy * half, bx = wall.b.x + ux * half, by = wall.b.y + uy * half;
    const pts = [
      { x: ax - uy * half, y: ay + ux * half }, { x: bx - uy * half, y: by + ux * half },
      { x: bx + uy * half, y: by - ux * half }, { x: ax + uy * half, y: ay - ux * half },
    ].map((p) => ({ x: gx(p.x), y: gy(p.y) }));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)))), y1 = Math.min(h - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5, xs = [];
      for (let i = 0, j = 3; i < 4; j = i++) {
        const p = pts[i], q = pts[j];
        if ((p.y > sy) !== (q.y > sy)) xs.push(p.x + ((sy - p.y) * (q.x - p.x)) / (q.y - p.y));
      }
      if (xs.length < 2) continue;
      // thin walls must still block: widen each span to at least one cell
      const lo = Math.min(...xs), hi = Math.max(...xs);
      const x0 = Math.max(0, Math.floor(lo)), x1 = Math.min(w - 1, Math.max(x0, Math.ceil(hi) - 1));
      for (let x = x0; x <= x1; x++) grid[y * w + x] = 1;
    }
  }
  return { grid, w, h, gx, gy };
}

// Flood the free region around a point: { cells, minU, maxU, minV, maxV } in
// cell units projected on the axis (u) and its normal (v), or null when the
// region leaks to the border (not an enclosed room).
function flood(g, p, axis, maxCells) {
  const sx = Math.floor(g.gx(p.x)), sy = Math.floor(g.gy(p.y));
  if (sx < 0 || sy < 0 || sx >= g.w || sy >= g.h || g.grid[sy * g.w + sx]) return null;
  const seen = new Uint8Array(g.w * g.h);
  const stack = [sy * g.w + sx];
  seen[stack[0]] = 1;
  const cu = Math.cos(axis), su = Math.sin(axis);
  let cells = 0, minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  while (stack.length) {
    const i = stack.pop();
    const x = i % g.w, y = (i / g.w) | 0;
    if (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) return null;
    if (++cells > maxCells) return null;
    const u = (x + 0.5) * cu + (y + 0.5) * su, v = -(x + 0.5) * su + (y + 0.5) * cu;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    for (const j of [i - 1, i + 1, i - g.w, i + g.w]) {
      if (!seen[j] && !g.grid[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return { cells, minU, maxU, minV, maxV };
}

function labelPoint(t) {
  const c = Math.cos(t.angle), s = Math.sin(t.angle);
  return { x: t.x + c * t.width / 2 + s * t.size * 0.35, y: t.y + s * t.width / 2 - c * t.size * 0.35 };
}

/**
 * Scale from room labels. walls: [{ a, b, thickness }] in sheet units;
 * axis: the plan's principal direction (radians). Returns { cmPerUnit,
 * support, source } or null.
 */
export function roomLabelScale(texts, walls, axis = 0) {
  if (!walls.length || !texts.length) return null;
  const bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      bounds.x0 = Math.min(bounds.x0, p.x);
      bounds.x1 = Math.max(bounds.x1, p.x);
      bounds.y0 = Math.min(bounds.y0, p.y);
      bounds.y1 = Math.max(bounds.y1, p.y);
    }
  }
  const extent = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
  const thin = walls.reduce((m, w) => Math.min(m, w.thickness), Infinity);
  // cells a third of the thinnest wall: fine enough that areas come out
  // within a percent, capped so a huge sheet stays a few million cells
  const cell = Math.max(thin / 3, extent / 2500);
  const g = wallGrid(walls, bounds, cell);
  // a room may fill most of the grid (a one-room plan); leaking to the
  // border is what marks the outside, not size
  const maxCells = g.w * g.h;
  const readings = [];
  texts.forEach((t, i) => {
    const area = parseArea(t.str);
    const size = area ? null : parseRoomSize(t.str);
    if (!area && !size) return;
    const room = flood(g, labelPoint(t), axis, maxCells);
    if (!room || room.cells < 20) return;
    if (area) {
      readings.push({ k: Math.sqrt(area / (room.cells * cell * cell)), i, kind: "area" });
    } else {
      const ext = [(room.maxU - room.minU + 1) * cell, (room.maxV - room.minV + 1) * cell].sort((p, q) => p - q);
      for (const ca of size[0]) {
        for (const cb of size[1]) {
          const cm = [ca.cm, cb.cm].sort((p, q) => p - q);
          const k0 = cm[0] / ext[0], k1 = cm[1] / ext[1];
          if (Math.abs(k0 / k1 - 1) < 0.06) readings.push({ k: (k0 + k1) / 2, i, kind: "size" });
        }
      }
    }
  });
  if (!readings.length) return null;
  let best = null;
  for (const r of readings) {
    const agree = readings.filter((q) => Math.abs(q.k / r.k - 1) <= 0.03);
    const labels = new Set(agree.map((q) => q.i)).size;
    if (!best || labels > best.labels) best = { labels, agree };
  }
  const ks = best.agree.map((q) => q.k).sort((p, q) => p - q);
  return { cmPerUnit: ks[Math.floor(ks.length / 2)], support: best.labels, source: "room-labels" };
}

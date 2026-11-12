// Vector floor-plan recognition: the primitives of a PDF page
// (pdf_primitives.js) → walls with thickness, plus doors, windows and
// passages, in sheet units with a drawing scale.
//
// Walls are found the way a drafter draws them — as two parallel faces a wall
// thickness apart — whatever the export style: filled poché polygons, plain
// line pairs, outlines with hatching; or as one stroke as wide as the wall.
// Pipeline:
//   1. segments   every straight edge of every painted path; curved spans
//                 become arcs (door swings); dashed strokes and white work are
//                 dropped
//   2. lines      near-parallel lines are snapped onto shared directions, so
//                 every later comparison of offsets happens in one frame, and
//                 collinear pieces of one pen merge
//   3. scale      dimension labels (dimensions.js); else door-swing radii;
//                 else an assumed sheet size — the weak ones are re-checked
//                 against room labels (room_scale.js) once walls exist.
//                 Ambiguous label units (mm vs cm) are decided by which
//                 reading gives plausible walls
//   4. hatching   families of close parallels in one pen are removed
//   5. pairing    parallel faces 4–65 cm apart become wall centrelines; a face
//                 bounds one wall only, nothing parallel may lie between the
//                 faces, and pairs over dark fill go first. Unpaired strokes as
//                 wide as a wall are walls themselves
//   6. openings   gaps along a wall line: an arc hinged at the gap is a door,
//                 glazing lines across it a window, otherwise a passage; the
//                 wall is rejoined across the opening
//   7. junctions  wall ends snap onto the centreline they butt into
//   8. pruning    walls not connected to the main wall network (furniture,
//                 title blocks, dimension pairs) are dropped
// Steps 4–8 run twice: the pens the first pass's walls are drawn in are the
// wall pens, and the second pass only lets those be faces.

import { dimensionScale, scaleNotes } from "./dimensions.js";
import { roomLabelScale } from "./room_scale.js";
import { convertCadToWalls } from "../cad_to_walls.js";

const DEG = Math.PI / 180;
const ANGLE_TOL = 0.6 * DEG;
const WALL_MIN_CM = 4, WALL_MAX_CM = 65;
const STROKE_WALL_MIN_CM = 6;
// …and a pen that wide on paper (sheet units are PDF points): a hairline at a
// coarse scale is still a hairline, not a wall
const STROKE_WALL_MIN_PEN = 1.5;
const OPENING_MIN_CM = 45, OPENING_MAX_CM = 320;
// the commonest interior door leaf: 80 cm in Israel and most of Europe, 32" (81 cm) in the US
const DOOR_PRIOR_CM = 80;
const HATCH_PITCH_MAX_CM = 15;
const CAVITY_MIN_CM = 1, CAVITY_MAX_CM = 12;
// with nothing to measure, assume the drawing spans about this much
const ASSUMED_PLAN_CM = 1000;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
// bounds of many points without spreading them into Math.min/max (a large
// sheet overflows the argument limit)
function boundsOf(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);

function luminance(c) {
  return Array.isArray(c) ? 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] : 128;
}

// Union–find with path compression and union by size; iterative, so a long
// chain (20 000 hatch lines) cannot overflow the stack.
function unionFind(n) {
  const parent = new Int32Array(n), size = new Int32Array(n).fill(1);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a === b) return;
    if (size[a] < size[b]) [a, b] = [b, a];
    parent[b] = a;
    size[a] += size[b];
  };
  return { find, union, size: (i) => size[find(i)] };
}

// ------------------------------------------------------------ 1. segments

function fitCircle(points) {
  // algebraic (Kåsa) least-squares circle
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = points.length;
  for (const p of points) {
    const z = p.x * p.x + p.y * p.y;
    sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
    sxz += p.x * z; syz += p.y * z; sz += z;
  }
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [-sxz, -syz, -sz];
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(A);
  if (!(Math.abs(D) > 1e-9)) return null;
  const col = (k) => A.map((row, i) => row.map((v, j) => (j === k ? B[i] : v)));
  const a = det3(col(0)) / D, b = det3(col(1)) / D, c = det3(col(2)) / D;
  const cx = -a / 2, cy = -b / 2, r = Math.sqrt(Math.max(0, cx * cx + cy * cy - c));
  return r > 0 && Number.isFinite(r) ? { x: cx, y: cy, r } : null;
}

function arcOf(points) {
  if (points.length < 3) return null;
  const c = fitCircle(points);
  if (!c) return null;
  const err = points.reduce((m, p) => Math.max(m, Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - c.r)), 0);
  if (err > Math.max(0.5, c.r * 0.04)) return null;
  let sweep = 0;
  for (let i = 1; i < points.length; i++) {
    let d = Math.atan2(points[i].y - c.y, points[i].x - c.x) - Math.atan2(points[i - 1].y - c.y, points[i - 1].x - c.x);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
  }
  return {
    center: { x: c.x, y: c.y }, r: c.r, sweep: Math.abs(sweep),
    start: points[0], end: points[points.length - 1], mid: points[Math.floor(points.length / 2)],
  };
}

// Many CAD exports flatten arcs into polylines before writing the PDF, so a
// door swing arrives as a run of short straight segments. A run of at least
// four segments of similar length, each turning the same way by a small
// angle, that sits on a circle, is marked curved — as if it had been drawn
// with Bézier curves.
function markTessellatedArcs(pts, kinds) {
  const n = pts.length - 1; // segments 1..n (segment i = pts[i-1] → pts[i])
  if (n < 4) return kinds;
  const dir = [], len = [];
  for (let i = 1; i <= n; i++) {
    dir[i] = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    len[i] = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const turn = (i) => {
    let d = dir[i + 1] - dir[i];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };
  const out = kinds.slice();
  let s = 1;
  while (s < n) {
    let e = s;
    const sign = Math.sign(turn(s));
    while (e < n) {
      const d = turn(e);
      if (Math.sign(d) !== sign || Math.abs(d) < 0.5 * DEG || Math.abs(d) > 25 * DEG) break;
      if (len[e + 1] > 2.5 * len[s] || len[e + 1] < len[s] / 2.5) break;
      e++;
    }
    if (e - s + 1 >= 4) {
      const arc = arcOf(pts.slice(s - 1, e + 1));
      if (arc && arc.sweep > 20 * DEG) for (let i = s; i <= e; i++) out[i] = true;
    }
    s = e > s ? e + 1 : s + 1;
  }
  return out;
}

export function collectSegments(prims) {
  const segments = [], arcs = [];
  for (const path of prims.paths) {
    // a dash pattern only affects the stroke: dashed strokes (hidden or
    // overhead lines) are dropped, the fill of the same path is not
    const strokeInk = path.stroke && !path.dashed && luminance(path.stroke) < 235;
    const fillInk = path.fill && luminance(path.fill) < 235;
    if (!strokeInk && !fillInk) continue;
    for (const sp of path.subpaths) {
      const pts = sp.points;
      const kinds = sp.curvedSeg || pts.map((_, i) => i > 0 && !!sp.curved);
      const closed = sp.closed || (fillInk && pts.length >= 3);
      const all = closed ? pts.concat([pts[0]]) : pts;
      let allKinds = closed ? kinds.concat([false]) : kinds;
      if (strokeInk) allKinds = markTessellatedArcs(all, allKinds);
      // straight edges stay segments even when the subpath also has curves
      // (a wall polygon with one rounded corner); each run of curve pieces is
      // offered as an arc when stroked
      let run = null;
      const endRun = () => {
        if (run && strokeInk) {
          const arc = arcOf(run);
          if (arc) arcs.push(arc);
        }
        run = null;
      };
      for (let i = 1; i < all.length; i++) {
        const a = all[i - 1], b = all[i];
        if (allKinds[i]) {
          if (!run) run = [a];
          run.push(b);
          continue;
        }
        endRun();
        if (!(Math.hypot(b.x - a.x, b.y - a.y) >= 0.2)) continue;
        segments.push({
          a, b,
          fill: fillInk ? path.fill : null,
          lineWidth: strokeInk ? path.lineWidth : 0,
          strokeInk: strokeInk ? luminance(path.stroke) : 255,
        });
      }
      endRun();
    }
  }
  return { segments: chainArcs(segments, arcs), arcs };
}

// Some exporters go further and write every piece of a flattened arc as its
// own two-point path. Chain stroked segments of one pen that meet end to end
// (where exactly two meet) into polylines, and turn the arc-like runs of
// those into arcs; everything else stays a segment.
function chainArcs(segments, arcs) {
  const key = (p) => Math.round(p.x * 20) + "," + Math.round(p.y * 20);
  const ends = new Map();
  segments.forEach((s, i) => {
    if (!s.lineWidth || s.fill) return;
    const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (L > 40) return; // arc pieces are short
    for (const p of [s.a, s.b]) {
      const k = key(p);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(i);
    }
  });
  const consumed = new Set(), seen = new Set();
  const pen = (s) => s.lineWidth.toFixed(2) + "/" + Math.round(s.strokeInk);
  const next = (i, p) => {
    const list = ends.get(key(p)) || [];
    if (list.length !== 2) return -1;
    const j = list[0] === i ? list[1] : list[0];
    return j !== i && !seen.has(j) && pen(segments[j]) === pen(segments[i]) ? j : -1;
  };
  for (const [, list] of ends) {
    for (const start of list) {
      if (seen.has(start)) continue;
      // grow a chain both ways from `start`
      seen.add(start);
      const s0 = segments[start];
      let pts = [s0.a, s0.b], ids = [start];
      for (const forward of [true, false]) {
        let cur = start, tip = forward ? s0.b : s0.a;
        for (let guard = 0; guard < 10000; guard++) {
          const j = next(cur, tip);
          if (j < 0) break;
          seen.add(j);
          const sj = segments[j];
          const far = key(sj.a) === key(tip) ? sj.b : sj.a;
          if (forward) {
            pts.push(far);
            ids.push(j);
          } else {
            pts.unshift(far);
            ids.unshift(j);
          }
          cur = j;
          tip = far;
        }
      }
      if (ids.length < 4) continue;
      const kinds = markTessellatedArcs(pts, pts.map(() => false));
      let run = null;
      const flush = () => {
        if (run && run.ids.length >= 4) {
          const arc = arcOf(run.pts);
          if (arc) {
            arcs.push(arc);
            run.ids.forEach((id) => consumed.add(id));
          }
        }
        run = null;
      };
      for (let i = 1; i < pts.length; i++) {
        if (kinds[i]) {
          if (!run) run = { pts: [pts[i - 1]], ids: [] };
          run.pts.push(pts[i]);
          run.ids.push(ids[i - 1]);
        } else flush();
      }
      flush();
    }
  }
  return consumed.size ? segments.filter((_, i) => !consumed.has(i)) : segments;
}

// Dark fills (poché, or a hatch pattern): a pair of faces with fill between
// them is almost certainly a wall. Each path is tested as a whole with its
// own fill rule, so a wall ring around a room hole leaves the room empty.
function fillIndex(prims) {
  const fills = [];
  for (const path of prims.paths) {
    if (!path.fill || !(luminance(path.fill) < 200)) continue;
    const rings = path.subpaths.filter((sp) => sp.points.length >= 3).map((sp) => sp.points);
    if (!rings.length) continue;
    fills.push({ rings, evenOdd: !!path.evenOdd, ...boundsOf(rings.flat()) });
  }
  const insideFill = (p, f) => {
    let winding = 0, crossings = 0;
    for (const pts of f.rings) {
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a.y > p.y) === (b.y > p.y)) continue;
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (x <= p.x) continue;
        crossings++;
        winding += b.y > a.y ? 1 : -1;
      }
    }
    return f.evenOdd ? crossings % 2 === 1 : winding !== 0;
  };
  // a coarse grid of fill boxes, so a query tests only the fills near it
  const CELL = 32, grid = new Map(), wide = [];
  for (const f of fills) {
    const cx0 = Math.floor(f.x0 / CELL), cx1 = Math.floor(f.x1 / CELL), cy0 = Math.floor(f.y0 / CELL), cy1 = Math.floor(f.y1 / CELL);
    if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 256) { wide.push(f); continue; }
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const key = cx + "," + cy;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(f);
    }
  }
  const hit = (p, f) => p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1 && insideFill(p, f);
  return (p) => wide.some((f) => hit(p, f)) || (grid.get(Math.floor(p.x / CELL) + "," + Math.floor(p.y / CELL)) || []).some((f) => hit(p, f));
}

// A line along the edge of a fill: on most samples one side is filled and
// the other not.
function bordersFill(l, inFill) {
  let edge = 0;
  const L = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) || 1;
  const nx = -(l.b.y - l.a.y) / L, ny = (l.b.x - l.a.x) / L;
  for (const f of [0.25, 0.5, 0.75]) {
    const x = l.a.x + (l.b.x - l.a.x) * f, y = l.a.y + (l.b.y - l.a.y) * f;
    if (inFill({ x: x + nx * 0.6, y: y + ny * 0.6 }) !== inFill({ x: x - nx * 0.6, y: y - ny * 0.6 })) edge++;
  }
  return edge >= 2;
}

// ------------------------------------------------------------- line model

// A line in normal form: direction angle θ, unit u, normal n, offset
// c = n·p, and extent [t0, t1] along u.
export function lineOf(seg) {
  const d = sub(seg.b, seg.a), L = len(d);
  let th = Math.atan2(d.y, d.x);
  if (th < 0) th += Math.PI;
  // fold the wrap-around: 179.9° and 0.1° are the same direction
  if (th >= Math.PI - 0.5 * DEG) th -= Math.PI;
  const out = { ...seg, L };
  reframe(out, th);
  return out;
}

function reframe(l, th) {
  const u = { x: Math.cos(th), y: Math.sin(th) }, n = { x: -u.y, y: u.x };
  const mid = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
  const ta = dot(l.a, u), tb = dot(l.b, u);
  l.th = th;
  l.u = u;
  l.n = n;
  l.c = dot(mid, n);
  l.t0 = Math.min(ta, tb);
  l.t1 = Math.max(ta, tb);
  return l;
}

// Snap every line onto a shared direction. Directions live on a circle
// (mod 180°), so the list is cut open at its widest gap — a cluster
// straddling 0°/180° stays whole — then split wherever neighbours are more
// than ANGLE_TOL apart, and any cluster still wider than 2·ANGLE_TOL is split
// at its widest inner gap, so no line turns by more than about ANGLE_TOL.
// Each cluster takes its length-weighted mean angle; offsets and extents of
// nearly parallel lines are then comparable — two faces 0.4° apart far from
// the page origin pair like any others.
function snapAngles(lines) {
  if (!lines.length) return lines;
  const sorted = lines.slice().sort((a, b) => a.th - b.th);
  let cut = 0, widest = sorted[0].th + Math.PI - sorted[sorted.length - 1].th;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i].th - sorted[i - 1].th;
    if (g > widest) {
      widest = g;
      cut = i;
    }
  }
  const seq = sorted.slice(cut).map((l) => ({ l, v: l.th }))
    .concat(sorted.slice(0, cut).map((l) => ({ l, v: l.th + Math.PI })));
  const split = (arr) => {
    if (arr.length < 2 || arr[arr.length - 1].v - arr[0].v <= 2 * ANGLE_TOL) return [arr];
    let at = 1;
    for (let i = 2; i < arr.length; i++) if (arr[i].v - arr[i - 1].v > arr[at].v - arr[at - 1].v) at = i;
    return split(arr.slice(0, at)).concat(split(arr.slice(at)));
  };
  let start = 0;
  for (let i = 1; i <= seq.length; i++) {
    if (i < seq.length && seq[i].v - seq[i - 1].v <= ANGLE_TOL) continue;
    for (const cluster of split(seq.slice(start, i))) {
      let sw = 0, sv = 0;
      for (const { l, v } of cluster) {
        sw += l.L;
        sv += v * l.L;
      }
      let th = sw > 0 ? sv / sw : cluster[0].v;
      while (th >= Math.PI - 0.5 * DEG) th -= Math.PI;
      while (th < -0.5 * DEG) th += Math.PI;
      for (const { l } of cluster) reframe(l, th);
    }
    start = i;
  }
  return lines;
}

// Lines grouped by (snapped) direction, each group sorted by offset.
function byDirection(items) {
  const groups = new Map();
  items.forEach((l, i) => {
    if (!groups.has(l.th)) groups.set(l.th, []);
    groups.get(l.th).push(i);
  });
  for (const idx of groups.values()) idx.sort((p, q) => items[p].c - items[q].c);
  return groups;
}

// Items of one direction bucketed into offset levels (offsets within `tol`
// of the level's first item), each level sorted by t0 — so "items at offsets
// in [cLo, cHi] overlapping [t0, t1]" is a binary search per level instead of
// a scan of every collinear piece (50 000 pieces on one line stay linear).
function levelIndex(items, ids, tol = 0.3) {
  const levels = [];
  for (const i of ids) {
    const it = items[i];
    let lv = levels[levels.length - 1];
    if (!lv || it.c - lv.c0 > tol) {
      lv = { c0: it.c, ids: [], maxLen: 0 };
      levels.push(lv);
    }
    lv.ids.push(i);
    lv.maxLen = Math.max(lv.maxLen, it.t1 - it.t0);
  }
  for (const lv of levels) {
    lv.ids.sort((p, q) => items[p].t0 - items[q].t0);
    lv.t0s = lv.ids.map((i) => items[i].t0);
  }
  const firstLevel = (c) => {
    let lo = 0, hi = levels.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (levels[m].c0 < c) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  return {
    each(cLo, cHi, t0, t1, fn) {
      for (let L = firstLevel(cLo - tol); L < levels.length && levels[L].c0 <= cHi; L++) {
        const lv = levels[L];
        let lo = 0, hi = lv.t0s.length;
        while (lo < hi) {
          const m = (lo + hi) >> 1;
          if (lv.t0s[m] <= t1) lo = m + 1;
          else hi = m;
        }
        for (let m = lo - 1; m >= 0 && lv.t0s[m] >= t0 - lv.maxLen; m--) {
          const it = items[lv.ids[m]];
          if (it.c < cLo || it.c > cHi || it.t1 < t0) continue;
          if (fn(lv.ids[m]) === false) return;
        }
      }
    },
  };
}

const angleDiff = (a, b) => {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
};

// Principal axis: the length-weighted dominant direction (mod 90°).
function principalAxis(lines) {
  const bins = new Float64Array(180);
  for (const l of lines) bins[Math.round((((l.th / DEG) % 90) + 90) % 90 * 2) % 180] += l.L;
  let best = 0;
  for (let i = 1; i < 180; i++) if (bins[i] > bins[best]) best = i;
  return (best / 2) * DEG;
}

// Drawing style of a line: fill tone and/or pen weight + tone. CAD exports
// draw each layer in its own style, so walls share a few styles and
// furniture, dimensions and glazing use others.
export function styleKey(l) {
  const fill = l.fill ? "F" + Math.round(luminance(l.fill) / 40) : "";
  const pen = l.lineWidth > 0 ? Math.round(l.lineWidth * 5) / 5 + ":" + Math.round(l.strokeInk / 40) : "";
  return fill + "|" + pen;
}

// Merge collinear overlapping/touching lines of one style (polylines chopped
// into pieces, clipped outlines) into single faces. Styles are separated
// first, and a run of offsets never spreads beyond offTol, so a dense family
// of lighter lines cannot drag two real faces together. Linear after sorting.
export function mergeCollinear(lines, offTol = 0.3, gapTol = 0.6) {
  const out = [];
  const groups = new Map();
  lines.forEach((l) => {
    const key = l.th + "/" + styleKey(l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  });
  for (const group of groups.values()) {
    group.sort((p, q) => p.c - q.c);
    let k = 0;
    while (k < group.length) {
      let e = k + 1;
      while (e < group.length && group[e].c - group[k].c <= offTol) e++;
      const run = group.slice(k, e).sort((p, q) => p.t0 - q.t0);
      k = e;
      const c = run.reduce((s, l) => s + l.c * l.L, 0) / (run.reduce((s, l) => s + l.L, 0) || 1);
      let cur = null;
      for (const l of run) {
        if (cur && l.t0 <= cur.t1 + gapTol) cur.t1 = Math.max(cur.t1, l.t1);
        else {
          if (cur) out.push(cur);
          cur = { th: l.th, u: l.u, n: l.n, c, t0: l.t0, t1: l.t1, fill: l.fill, lineWidth: l.lineWidth, strokeInk: l.strokeInk };
        }
      }
      if (cur) out.push(cur);
    }
  }
  for (const l of out) {
    l.L = l.t1 - l.t0;
    l.a = { x: l.u.x * l.t0 + l.n.x * l.c, y: l.u.y * l.t0 + l.n.y * l.c };
    l.b = { x: l.u.x * l.t1 + l.n.x * l.c, y: l.u.y * l.t1 + l.n.y * l.c };
  }
  return out;
}

// ------------------------------------------------------------ 4. hatching

// Hatching (and stair treads) are families of close parallels drawn in one
// pen: lines are linked when they overlap, have similar lengths and lie
// within `maxSpacing` of each other (hatch pitch is a few cm on any sheet; a
// wall's two faces are one link, glazing makes four). A family of five or
// more is removed whole. Families interleave freely — two hatch directions
// that happen to be parallel near a 45° wall still form one family.
export function removeHatching(lines, maxSpacing = Infinity) {
  const uf = unionFind(lines.length);
  const groups = new Map();
  lines.forEach((l, i) => {
    const key = l.th + "/" + styleKey(l);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  for (const idx of groups.values()) {
    if (idx.length < 5) continue;
    idx.sort((p, q) => lines[p].c - lines[q].c);
    const index = levelIndex(lines, idx);
    for (const i of idx) {
      const a = lines[i];
      index.each(a.c + 0.3, a.c + Math.min(maxSpacing, 1.5 * a.L), a.t0, a.t1, (j) => {
        const b = lines[j], gap = b.c - a.c;
        if (Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0) <= 0.3 * Math.min(a.L, b.L)) return;
        if (Math.max(a.L, b.L) > 3 * Math.min(a.L, b.L) || gap > 1.5 * Math.min(a.L, b.L)) return;
        uf.union(i, j);
      });
    }
  }
  // a family is hatching when it has 5+ distinct strokes: lines under 1 unit
  // (a point of paper) apart are one stroke drawn more than once — a wall
  // face doubled by its fill's edge or drawn as a hairline strip — and a
  // stack of those is a layered wall, not a hatch. 8+ lines inside one such
  // stroke is shading drawn as lines, which goes too. A hatch is also drawn
  // at one pitch: most gaps between its strokes are near their median, where
  // the faces of a layered wall (lining, leaf, cavity, cladding) are not
  const offsets = new Map();
  lines.forEach((l, i) => {
    if (uf.size(i) < 5) return;
    const r = uf.find(i);
    if (!offsets.has(r)) offsets.set(r, []);
    offsets.get(r).push(l.c);
  });
  const hatch = new Set();
  for (const [r, cs] of offsets) {
    cs.sort((p, q) => p - q);
    let run = 1, dense = false;
    const at = [cs[0]];
    for (let i = 1; i < cs.length; i++) {
      if (cs[i] - cs[i - 1] > 1) { at.push(cs[i]); run = 1; } else if (++run >= 8) dense = true;
    }
    const gaps = at.slice(1).map((c, i) => c - at[i]).sort((p, q) => p - q);
    const median = gaps[gaps.length >> 1];
    const even = gaps.filter((g) => Math.abs(g - median) <= 0.25 * median).length >= 0.6 * gaps.length;
    if ((at.length >= 5 && even) || dense) hatch.add(r);
  }
  return lines.filter((_, i) => uf.size(i) < 5 || !hatch.has(uf.find(i)));
}

// --------------------------------------------------------------- 3. scale

function arcScale(arcs) {
  const radii = arcs.filter((a) => a.sweep > 70 * DEG && a.sweep < 110 * DEG).map((a) => a.r).sort((p, q) => p - q);
  if (radii.length < 2) return null;
  return { cmPerUnit: DOOR_PRIOR_CM / radii[Math.floor(radii.length / 2)], support: radii.length, source: "door-swings", confidence: 0.4 };
}

// ------------------------------------------------------------- intervals

function subtract(intervals, cuts) {
  let out = intervals;
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) next.push([a, b]);
      else {
        if (c0 > a) next.push([a, c0]);
        if (c1 < b) next.push([c1, b]);
      }
    }
    out = next;
    if (!out.length) break;
  }
  return out;
}

const endpoint = (w, t) => ({ x: w.u.x * t + w.n.x * w.c, y: w.u.y * t + w.n.y * w.c });

// -------------------------------------------------------------- 5. pairing

// Returns { walls, used } — used[i]: stretches of line i that bound a wall.
// `faceOk(line)` limits which lines may be faces (all lines still block pairs
// across them).
function pairFaces(lines, groups, k, inFill, faceOk, strong = () => true) {
  const tMin = WALL_MIN_CM / k, tMax = WALL_MAX_CM / k, minLen = Math.max(1, 8 / k);
  // A drawn face separates wall from air, so it bounds at most one wall —
  // this is what stops a door leaf or a counter edge pairing with a wall's
  // open side.
  // Lines lying on top of each other (a fill edge, its outline, a hairline)
  // are one drawn face: they share one record of where they bound a wall.
  const faceOf = new Int32Array(lines.length);
  let faces = 0;
  for (const idx of groups.values()) {
    let prev = null;
    for (const i of idx) {
      if (prev == null || lines[i].c - lines[prev].c > 0.3) faces++;
      faceOf[i] = faces - 1;
      prev = i;
    }
  }
  const usedFace = Array.from({ length: faces }, () => []);
  const eligible = lines.map((l) => !l.annotation && faceOk(l));
  const candidates = [];
  const indexes = new Map();
  for (const [th, idx] of groups) {
    const index = levelIndex(lines, idx);
    indexes.set(th, index);
    for (const i of idx) {
      const li = lines[i];
      if (!eligible[i]) continue;
      index.each(li.c + tMin, li.c + tMax, li.t0 + minLen, li.t1 - minLen, (j) => {
        if (!eligible[j]) return;
        const lj = lines[j];
        // at least one face drawn as a wall is drawn: a fill edge or a cut pen
        if (!strong(li) && !strong(lj)) return;
        const o0 = Math.max(li.t0, lj.t0), o1 = Math.min(li.t1, lj.t1);
        if (o1 - o0 < minLen) return;
        const mid = (li.c + lj.c) / 2, tm = (o0 + o1) / 2;
        const filled = inFill({ x: li.u.x * tm + li.n.x * mid, y: li.u.y * tm + li.n.y * mid });
        candidates.push({ lo: i, hi: j, d: lj.c - li.c, o0, o1, filled });
      });
    }
  }
  // dark fill first, then thinnest: a face belongs to its nearest partner
  candidates.sort((p, q) => (q.filled - p.filled) || p.d - q.d);
  const walls = [];
  for (const cnd of candidates) {
    const L = lines[cnd.lo], H = lines[cnd.hi];
    let spans = subtract(subtract([[cnd.o0, cnd.o1]], usedFace[faceOf[cnd.lo]]), usedFace[faceOf[cnd.hi]]);
    if (!spans.length) continue;
    // nothing parallel strictly between the faces
    indexes.get(L.th).each(L.c + 0.25, H.c - 0.25, cnd.o0, cnd.o1, (m) => {
      const lm = lines[m];
      spans = subtract(spans, [[lm.t0, lm.t1]]);
      if (!spans.length) return false;
    });
    for (const [s0, s1] of spans) {
      if (s1 - s0 < Math.max(1, Math.min(0.5 * cnd.d, 10 / k))) continue;
      usedFace[faceOf[cnd.lo]].push([s0, s1]);
      usedFace[faceOf[cnd.hi]].push([s0, s1]);
      walls.push({ th: L.th, u: L.u, n: L.n, c: (L.c + H.c) / 2, t0: s0, t1: s1, thickness: cnd.d, filled: cnd.filled, styles: [styleKey(L), styleKey(H)] });
    }
  }
  return { walls, used: lines.map((_, i) => usedFace[faceOf[i]]) };
}

// A line with dark fill on both sides is a seam inside the poché (between a
// structure layer and an insulation layer, or two fill shapes meeting), not a
// face: it neither bounds a wall nor blocks the pair of outer faces across it.
function removeSeams(lines, inFill) {
  return lines.filter((l) => {
    // fill on both sides along (nearly) the whole line — a face that runs
    // into a neighbouring wall's fill at a corner, for part of its length, is
    // still a face. Probed close by as well, so a seam a hair inside the
    // wall's outer face (a thin strip) is still a seam
    const seamAt = (d) => {
      let both = 0;
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const t = l.t0 + (l.t1 - l.t0) * f;
        const side = (s) => inFill({ x: l.u.x * t + l.n.x * (l.c + s), y: l.u.y * t + l.n.y * (l.c + s) });
        if (side(d) && side(-d)) both++;
      }
      return both >= 4;
    };
    return !(seamAt(0.6) || seamAt(0.15));
  });
}

// A stroke as wide as a wall, with no face partner, is a wall drawn as its
// centreline at its true thickness. Pens of at least STROKE_WALL_MIN_PEN
// always qualify; thinner ones only when the sheet has no face pairs at all
// (a single-line drawing at a small scale) — otherwise a hairline read at a
// coarse scale would pass for a wall.
function strokeWalls(lines, used, k, faceOk, thinPens) {
  const walls = [];
  lines.forEach((l, i) => {
    if (l.annotation || l.fill || !faceOk(l)) return;
    const w = l.lineWidth * k;
    if (!((thinPens || l.lineWidth >= STROKE_WALL_MIN_PEN) && w >= STROKE_WALL_MIN_CM && w <= WALL_MAX_CM)) return;
    for (const [s0, s1] of subtract([[l.t0, l.t1]], used[i])) {
      if ((s1 - s0) * k < 30) continue;
      walls.push({ th: l.th, u: l.u, n: l.n, c: l.c, t0: s0, t1: s1, thickness: l.lineWidth, filled: false, stroke: true, styles: [styleKey(l)] });
    }
  });
  return walls;
}

// Collinear walls of one thickness, touching or within `gap`, become one.
function mergeWalls(walls, gap) {
  const uf = unionFind(walls.length);
  for (const idx of byDirection(walls).values()) {
    const index = levelIndex(walls, idx);
    for (const i of idx) {
      const w = walls[i];
      index.each(w.c, w.c + 0.25 * w.thickness, w.t0 - gap, w.t1 + gap, (j) => {
        const o = walls[j];
        if (j === i || o.c - w.c > 0.25 * Math.min(o.thickness, w.thickness)) return;
        if (Math.abs(o.thickness - w.thickness) > 0.25 * Math.max(o.thickness, w.thickness)) return;
        uf.union(i, j);
      });
    }
  }
  const comps = new Map();
  walls.forEach((w, i) => {
    const r = uf.find(i);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(w);
  });
  return [...comps.values()].map((ws) => {
    if (ws.length === 1) return ws[0];
    const L = ws.map((w) => w.t1 - w.t0), sum = L.reduce((s, v) => s + v, 0) || 1;
    return {
      ...ws[0],
      c: ws.reduce((s, w, i) => s + w.c * L[i], 0) / sum,
      thickness: ws.reduce((s, w, i) => s + w.thickness * L[i], 0) / sum,
      t0: ws.reduce((m, w) => Math.min(m, w.t0), Infinity),
      t1: ws.reduce((m, w) => Math.max(m, w.t1), -Infinity),
      filled: ws.some((w) => w.filled),
      stroke: ws.every((w) => w.stroke),
      styles: [...new Set(ws.flatMap((w) => w.styles || []))],
    };
  });
}

// A cavity wall is drawn as two filled leaves with a narrow empty gap (the
// cavity) between them; the planner wants it as one wall through all its
// layers. Two filled walls side by side across a cavity
// (CAVITY_MIN_CM–CAVITY_MAX_CM; touching pieces are seams or junction caps),
// narrow next to the leaves (a cupboard set off a wall is not), and mostly
// overlapping, become one wall where they overlap; what either leaf has
// beyond that stays a wall of its own (a leaf running on past a window,
// a corner return). Repeats, so a long inner leaf takes each outer piece.
function mergeLeaves(walls, k) {
  const lo = (w) => w.c - w.thickness / 2, hi = (w) => w.c + w.thickness / 2;
  const reach = (WALL_MAX_CM + CAVITY_MAX_CM) / k;
  const out = walls.filter((w) => !w.filled);
  for (const idx of byDirection(walls).values()) {
    let pool = idx.map((i) => walls[i]).filter((w) => w.filled);
    for (let merged = true, round = 0; merged && round < 64; round++) {
      merged = false;
      pool.sort((p, q) => p.c - q.c);
      const used = new Set(), next = [];
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (used.has(w)) continue;
        // walls sorted by offset: only those within a wall + cavity of w
        for (let j = i + 1; j < pool.length && pool[j].c - w.c <= reach; j++) {
          const o = pool[j];
          if (used.has(o)) continue;
          const gap = Math.max(lo(o) - hi(w), lo(w) - hi(o));
          if (gap * k < CAVITY_MIN_CM || gap * k > CAVITY_MAX_CM || gap >= 0.5 * Math.min(w.thickness, o.thickness)) continue;
          const s0 = Math.max(w.t0, o.t0), s1 = Math.min(w.t1, o.t1);
          if (s1 - s0 < 0.8 * Math.min(w.t1 - w.t0, o.t1 - o.t0)) continue;
          const a = Math.min(lo(w), lo(o)), b = Math.max(hi(w), hi(o));
          if ((b - a) * k > WALL_MAX_CM) continue;
          used.add(w).add(o);
          next.push({ ...w, c: (a + b) / 2, thickness: b - a, t0: s0, t1: s1, styles: [...new Set([...(w.styles || []), ...(o.styles || [])])] });
          // the rest of each leaf, where it is long enough to be wall
          for (const x of [w, o]) {
            if (s0 - x.t0 >= x.thickness) next.push({ ...x, t1: s0 });
            if (x.t1 - s1 >= x.thickness) next.push({ ...x, t0: s1 });
          }
          merged = true;
          break;
        }
        if (!used.has(w)) next.push(w);
      }
      pool = next;
    }
    out.push(...pool);
  }
  return out;
}

// Drop walls lying mostly inside a thicker wall (cap edges of overlapping
// poché pieces, duplicate fill + outline pairs).
function pruneContained(walls) {
  const box = walls.map((w) => {
    const a = endpoint(w, w.t0), b = endpoint(w, w.t1), h = w.thickness / 2;
    return { x0: Math.min(a.x, b.x) - h, x1: Math.max(a.x, b.x) + h, y0: Math.min(a.y, b.y) - h, y1: Math.max(a.y, b.y) + h };
  });
  const inside = (wi, oi) => {
    const w = walls[wi], o = walls[oi];
    if (o.thickness < w.thickness * 0.999) return false;
    const bw = box[wi], bo = box[oi];
    if (bw.x0 > bo.x1 + 1 || bw.x1 < bo.x0 - 1 || bw.y0 > bo.y1 + 1 || bw.y1 < bo.y0 - 1) return false;
    if (angleDiff(o.th, w.th) > 1 * DEG) {
      // crossing wall: inside if the whole short wall sits in o's band
      const pts = [endpoint(w, w.t0), endpoint(w, w.t1)];
      return pts.every((p) => Math.abs(dot(p, o.n) - o.c) <= o.thickness / 2 + 0.5 && dot(p, o.u) >= o.t0 - 0.5 && dot(p, o.u) <= o.t1 + 0.5);
    }
    if (Math.abs(w.c - o.c) + w.thickness / 2 > o.thickness / 2 + 0.5) return false;
    const ov = Math.min(w.t1, o.t1) - Math.max(w.t0, o.t0);
    return ov >= 0.8 * (w.t1 - w.t0);
  };
  return walls.filter((_, i) => !walls.some((__, j) => j !== i && inside(i, j)));
}

// Wall lines: walls sharing one centreline and roughly one thickness.
// Only pieces within `reach` of each other along the line are linked: further
// apart, nothing between them is an opening anyway.
function wallLines(walls, reach = Infinity) {
  const uf = unionFind(walls.length);
  for (const idx of byDirection(walls).values()) {
    const index = levelIndex(walls, idx);
    for (const i of idx) {
      const p = walls[i];
      index.each(p.c, p.c + 0.3 * p.thickness, p.t0 - reach, p.t1 + reach, (j) => {
        const q = walls[j];
        if (j === i || q.c - p.c > 0.3 * Math.min(p.thickness, q.thickness)) return;
        if (Math.abs(p.thickness - q.thickness) > 0.35 * Math.max(p.thickness, q.thickness)) return;
        uf.union(i, j);
      });
    }
  }
  const out = new Map();
  walls.forEach((w, i) => {
    const r = uf.find(i);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(w);
  });
  return [...out.values()].map((ws) => ws.sort((p, q) => p.t0 - q.t0));
}

// Glazing drawn as several parallel lines pairs up into thin "walls" stacked
// inside a window opening (and may chain from one window to the next along a
// facade). Anything clearly thinner than a wall line, inside its band, with a
// piece of that wall line before and after it, and no longer than an opening
// can be, is that — not a wall.
function dropGlazingStacks(walls, k) {
  const drop = new Set();
  const groups = byDirection(walls);
  for (const line of wallLines(walls)) {
    if (line.length < 2) continue;
    const T = line.reduce((m, w) => Math.min(m, w.thickness), Infinity);
    const c = line.reduce((s, w) => s + w.c, 0) / line.length;
    for (const i of groups.get(line[0].th) || []) {
      const w = walls[i];
      if (w.thickness * 1.5 > T || Math.abs(w.c - c) > T / 2 || (w.t1 - w.t0) * k > OPENING_MAX_CM) continue;
      let before = -Infinity, after = Infinity;
      for (const p of line) {
        if (p.t1 <= w.t0 + 0.5) before = Math.max(before, p.t1);
        if (p.t0 >= w.t1 - 0.5) after = Math.min(after, p.t0);
      }
      // flanked on both sides; a thin wall that only continues the line past
      // its end (an exterior wall turning into a partition) stays
      if (before > -Infinity && after < Infinity) drop.add(w);
    }
  }
  return walls.filter((w) => !drop.has(w));
}

// ------------------------------------------------------------- 6. openings

function classifyGap(th, c, T, g0, g1, groupLines, arcs, k) {
  const width = g1 - g0;
  const u = { x: Math.cos(th), y: Math.sin(th) }, n = { x: -u.y, y: u.x };
  const at = (t) => ({ x: u.x * t + n.x * c, y: u.y * t + n.y * c });
  // glazing: lines parallel to the wall inside its band spanning the gap
  let glazing = 0;
  for (const l of groupLines) {
    if (Math.abs(l.c - c) > T / 2 + 0.5) continue;
    if (Math.min(l.t1, g1) - Math.max(l.t0, g0) > 0.7 * width) glazing++;
  }
  // door: a swing arc hinged at either jamb, radius ≈ the gap; the side it
  // sweeps is where the arc itself lies, not where its centre sits
  let door = null;
  const hingedAt = (a, t, leaf) => {
    const hinge = at(t);
    const dn = dot(sub(a.center, hinge), n), du = dot(sub(a.center, hinge), u);
    return Math.abs(du) <= Math.max(2, 0.15 * leaf) && Math.abs(dn) <= T / 2 + Math.max(2, 10 / k);
  };
  for (const a of arcs) {
    if (Math.abs(a.r - width) > 0.3 * width) continue;
    for (const [t, side] of [[g0, "start"], [g1, "end"]]) {
      if (hingedAt(a, t, width)) door = { hinge: side, swing: dot(a.mid, n) - c >= 0 ? 1 : -1 };
    }
  }
  // a double door: two leaves of half the gap, one hinged at each jamb,
  // each closing to the middle of the gap (one end of its arc there) and
  // both opening to the same side
  if (!door) {
    const M = at((g0 + g1) / 2), leaf = width / 2;
    const closes = (a) => [a.start, a.end].some((p) => Math.hypot(p.x - M.x, p.y - M.y) <= T / 2 + Math.max(2, 0.25 * leaf));
    const side = (a) => (dot(a.mid, n) - c >= 0 ? 1 : -1);
    const half = (t) => arcs.filter((a) => Math.abs(a.r - leaf) <= 0.3 * leaf && hingedAt(a, t, leaf) && closes(a));
    const lefts = half(g0), rights = half(g1);
    const left = lefts.find((a) => rights.some((b) => side(b) === side(a)));
    if (left) door = { hinge: "both", swing: side(left), double: true };
  }
  return { type: door ? "door" : glazing >= 1 ? "window" : "passage", door };
}

// Walk each wall line in order; a gap of opening size between consecutive
// pieces is classified and, if it is an opening, the pieces are joined with
// the opening on the joined wall.
function joinOpenings(walls, lines, lineGroups, arcs, k) {
  const minGap = OPENING_MIN_CM / k, maxGap = OPENING_MAX_CM / k;
  const out = [], openings = [], gaps = [];
  for (const line of wallLines(walls, maxGap)) {
    const groupLines = (lineGroups.get(line[0].th) || []).map((i) => lines[i]);
    let cur = { ...line[0] };
    for (let m = 1; m < line.length; m++) {
      const q = line[m];
      const gap = q.t0 - cur.t1;
      let joined = false;
      // pieces are grouped transitively; only join neighbours that really
      // share a centreline, so offsets cannot drift along a chain
      if (Math.abs(q.c - cur.c) > 0.3 * Math.min(q.thickness, cur.thickness)) joined = false;
      else if (gap <= 0) joined = true; // overlapping pieces of one wall
      else if (gap >= minGap && gap <= maxGap) {
        const T = (cur.thickness + q.thickness) / 2, c = (cur.c + q.c) / 2;
        const info = classifyGap(cur.th, c, T, cur.t1, q.t0, groupLines, arcs, k);
        // a bare gap is only a passage when it is wall-like on both sides
        // (long enough to be wall, not a stub of something else)
        const bare = info.type === "passage" && (gap > 250 / k || cur.t1 - cur.t0 < cur.thickness || q.t1 - q.t0 < q.thickness);
        if (!bare) {
          openings.push({ type: info.type, th: cur.th, c, t: (cur.t1 + q.t0) / 2, width: gap, door: info.door });
          gaps.push({ th: cur.th, c, band: T, g0: cur.t1, g1: q.t0 });
          joined = true;
        }
      }
      if (joined) {
        const L0 = cur.t1 - cur.t0, L1 = q.t1 - q.t0;
        cur = {
          ...cur,
          t1: Math.max(cur.t1, q.t1),
          c: (cur.c * L0 + q.c * L1) / (L0 + L1),
          thickness: (cur.thickness * L0 + q.thickness * L1) / (L0 + L1),
          filled: cur.filled || q.filled,
          styles: [...new Set([...(cur.styles || []), ...(q.styles || [])])],
        };
      } else {
        out.push(cur);
        cur = { ...q };
      }
    }
    out.push(cur);
  }
  // thin pieces glazing produced inside an opening are not walls
  const kept = out.filter((w) => !gaps.some((g) => g.th === w.th && Math.abs(w.c - g.c) < g.band / 2 + 0.5 &&
    w.t0 >= g.g0 - 0.5 && w.t1 <= g.g1 + 0.5 && w.thickness < 0.8 * g.band));
  return { walls: kept, openings };
}

// ------------------------------------------------------------- 7. junctions

function healJunctions(walls, k) {
  const tol = 3 / k;
  const ends = [];
  walls.forEach((w) => {
    w.A = endpoint(w, w.t0);
    w.B = endpoint(w, w.t1);
    ends.push({ w, key: "A", out: { x: -w.u.x, y: -w.u.y } }, { w, key: "B", out: w.u });
  });
  for (const e of ends) {
    const w = e.w, p = w[e.key];
    let best = null;
    for (const o of walls) {
      if (o === w || angleDiff(o.th, w.th) < 10 * DEG) continue;
      // intersection of w's centreline with o's
      const denom = dot(e.out, o.n);
      if (Math.abs(denom) < 1e-6) continue;
      const s = (o.c - dot(p, o.n)) / denom; // distance along e.out
      const reach = o.thickness / 2 + w.thickness / 2 + tol;
      if (s > reach || s < -reach) continue;
      const X = { x: p.x + e.out.x * s, y: p.y + e.out.y * s };
      const along = dot(X, o.u);
      if (along < o.t0 - w.thickness / 2 - o.thickness - tol || along > o.t1 + w.thickness / 2 + o.thickness + tol) continue;
      if (!best || Math.abs(s) < Math.abs(best.s)) best = { s, X };
    }
    if (best) e.snap = best.X;
  }
  for (const e of ends) if (e.snap) e.w[e.key] = e.snap;
  return walls.map((w) => ({ a: w.A, b: w.B, thickness: w.thickness, filled: w.filled, line: w }));
}

// ------------------------------------------------------------- 8. pruning

// p (an end of wall w) lies on another wall's band
function anchored(p, w, walls, k) {
  const tol = 4 / k;
  return walls.some((o) => {
    if (o === w) return false;
    const d = sub(o.b, o.a), L = len(d) || 1;
    const t = Math.max(0, Math.min(1, dot(sub(p, o.a), d) / (L * L)));
    return Math.hypot(p.x - (o.a.x + d.x * t), p.y - (o.a.y + d.y * t)) <= o.thickness / 2 + tol;
  });
}

function segmentsCross(p1, p2, q1, q2) {
  const o = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = o(q1, q2, p1), d2 = o(q1, q2, p2), d3 = o(p1, p2, q1), d4 = o(p1, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function keepMainNetwork(walls, k) {
  const tol = 4 / k;
  const uf = unionFind(walls.length);
  const touches = (p, w) => {
    const d = sub(w.b, w.a), L = len(d) || 1;
    const t = Math.max(0, Math.min(1, dot(sub(p, w.a), d) / (L * L)));
    return Math.hypot(p.x - (w.a.x + d.x * t), p.y - (w.a.y + d.y * t)) <= w.thickness / 2 + tol;
  };
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i], b = walls[j];
      // joined at an end, or crossing mid-span (a partition through a wall)
      if (touches(a.a, b) || touches(a.b, b) || touches(b.a, a) || touches(b.b, a) || segmentsCross(a.a, a.b, b.a, b.b)) uf.union(i, j);
    }
  }
  const size = new Map();
  walls.forEach((w, i) => {
    const r = uf.find(i);
    size.set(r, (size.get(r) || 0) + len(sub(w.b, w.a)));
  });
  const biggest = Math.max(0, ...size.values());
  // one building is one connected wall network; a detached cluster has to be
  // substantial (an annex, a separate unit) to be kept
  return walls.filter((w, i) => size.get(uf.find(i)) >= 0.35 * biggest);
}

// ------------------------------------------------------------------ main

// How believable a recognition is at its scale: share of wall length with a
// buildable thickness, of openings with a doorway / window width, and how much
// of the drawing the walls cover (in sheet units, so scale-independent) — a
// lone pair of furniture lines read as a wall covers almost nothing. Walls
// that are only wide strokes count half: at a wrong, coarse scale hairlines
// turn into "walls" too. Used to choose between readings of ambiguous
// dimension units.
function plausibility(result, extent) {
  const length = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const total = result.walls.reduce((s, w) => s + length(w), 0);
  if (!total) return 0;
  const good = result.walls.reduce((s, w) => s + (w.thickness >= 6 && w.thickness <= 45 ? length(w) : 0), 0);
  const ops = result.openings;
  const okOps = ops.length ? ops.filter((o) => o.width >= 55 && o.width <= 250).length / ops.length : 0.5;
  const coverage = Math.min(1, total / (2 * extent));
  const strokeOnly = result.diagnostics && result.diagnostics.strokeOnly ? 0.5 : 1;
  return strokeOnly * (good / total + 0.5 * okOps + coverage);
}

/**
 * prims: { width, height, paths, texts, images } from readPagePrimitives.
 * options.cmPerUnit forces the scale (e.g. from a manual calibration).
 * Returns { cmPerUnit, scale: { source, support, confidence }, walls:
 * [{ a, b, thickness(cm), filled }], openings: [{ type, center, width(cm),
 * wall (index), hinge? ("start" | "end" | "both"), swing?, double? }],
 * rasterOnly, diagnostics } — coordinates in
 * sheet units. rasterOnly: no vector walls but embedded images (a scan).
 * scale.source "none" means nothing on the sheet gave a scale: geometry is
 * right up to an assumed size and the caller should ask for a calibration.
 */
export function recognizeVectorPlan(prims, options = {}) {
  const { segments, arcs } = collectSegments(prims);
  let lines = snapAngles(segments.map(lineOf));
  const axis = principalAxis(lines);
  lines = mergeCollinear(lines);
  const linesAll = lines;
  const box = boundsOf(linesAll.flatMap((l) => [l.a, l.b]));
  const extent = linesAll.length ? Math.max(box.x1 - box.x0, box.y1 - box.y0) || 1 : 1;

  // Annotation that must never become a wall face: validated dimension lines
  // with their bounding ticks / extension lines (found while reading the
  // scale), and the sheet border / title-block frame hugging the page edge.
  const annotation = new Set();
  const inFill = fillIndex(prims);
  const W = prims.width || 0, H = prims.height || 0;
  if (W && H) {
    const nearEdge = (v, size) => v < 0.05 * size || v > 0.95 * size;
    for (const l of linesAll) {
      const horizontal = Math.abs(l.a.y - l.b.y) < 0.5, vertical = Math.abs(l.a.x - l.b.x) < 0.5;
      if (horizontal && l.L > 0.5 * W && nearEdge(l.a.y, H)) annotation.add(l);
      if (vertical && l.L > 0.5 * H && nearEdge(l.a.x, W)) annotation.add(l);
    }
  }

  // ---- scale candidates
  let candidates = [];
  if (options.cmPerUnit > 0) candidates = [{ cmPerUnit: options.cmPerUnit, source: "given", support: 0, confidence: 1 }];
  else {
    // the sheet's line work spans roughly 3–100 m
    const plausible = (k) => extent * k >= 300 && extent * k <= 10000;
    const dims = dimensionScale(prims.texts || [], linesAll, plausible);
    // printed scales ("1:50", 1/4" = 1'-0") are exact when the PDF is at
    // paper size; a note the dimensions agree with (within 4%) replaces their
    // reading, otherwise every reading competes on how believable it makes
    // the plan
    const notes = scaleNotes(prims.texts || []).filter((n) => plausible(n.cmPerUnit));
    if (dims && dims.support >= 2) {
      // a line with fill on one side is a wall face, even when a dimension
      // measures to it in the dimension's own pen
      dims.annotation.forEach((l) => { if (!bordersFill(l, inFill)) annotation.add(l); });
      const agree = notes.find((n) => Math.abs(n.cmPerUnit / dims.cmPerUnit - 1) <= 0.04);
      candidates = agree
        ? [{ cmPerUnit: agree.cmPerUnit, source: "scale-note", support: dims.support, confidence: 1, unit: dims.unit, note: agree.text, preferred: true }]
        : [dims, ...(dims.alternatives || [])].map((d) => ({
            cmPerUnit: d.cmPerUnit, source: "dimensions", support: d.support, confidence: d.confidence, unit: d.unit, preferred: d === dims,
          })).concat(notes.map((n) => ({ cmPerUnit: n.cmPerUnit, source: "scale-note", support: 0, confidence: 0.6, note: n.text, at: n.at })));
    } else {
      candidates = notes.map((n) => ({ cmPerUnit: n.cmPerUnit, source: "scale-note", support: 0, confidence: 0.7, note: n.text, at: n.at }));
    }
  }
  if (!candidates.length) {
    const fromArcs = arcScale(arcs);
    candidates = [fromArcs || { cmPerUnit: ASSUMED_PLAN_CM / extent, source: "none", support: 0, confidence: 0 }];
  }
  // door swings as a check between competing readings: a believable scale
  // makes them 55–110 cm leaves (some sheets draw them half open, at 45°)
  const swings = arcs.filter((a) => a.sweep > 40 * DEG && a.sweep < 110 * DEG);
  const doorFit = (k) => (swings.length < 2 ? 0 : swings.filter((a) => a.r * k >= 55 && a.r * k <= 110).length / swings.length);

  lines = lines.map((l) => (annotation.has(l) ? { ...l, annotation: true } : l));
  const run = (scale) => recognizeAtScale(lines, arcs, scale, inFill, options);

  // ambiguous units (mm vs cm labels): keep the reading with believable walls
  const runs = candidates.map((scale) => ({ scale, r: run(scale) }));
  // printed scales captioning different drawings: the caption nearest the
  // plan is the plan's own (the others label elevations, details). "The
  // plan" is what every reading finds — a wrong scale adds walls elsewhere
  let nearest = null;
  const positioned = runs.filter((x) => x.scale.at && x.scale.at.length);
  if (positioned.length > 1) {
    // walls every reading found, matched by midpoint on a 2-unit grid
    const mid = (w) => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });
    const cellOf = (x, y) => Math.floor(x / 2) + "," + Math.floor(y / 2);
    const grids = runs.slice(1).map((x) => {
      const g = new Map();
      for (const w of x.r.walls) {
        const m = mid(w), key = cellOf(m.x, m.y);
        if (!g.has(key)) g.set(key, []);
        g.get(key).push(m);
      }
      return g;
    });
    const found = (g, m) => {
      const cx = Math.floor(m.x / 2), cy = Math.floor(m.y / 2);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const o of g.get(cx + dx + "," + (cy + dy)) || []) if (Math.hypot(o.x - m.x, o.y - m.y) < 2) return true;
      }
      return false;
    };
    const common = runs[0].r.walls.filter((w) => grids.every((g) => found(g, mid(w))));
    if (common.length) {
      const core = boundsOf(common.flatMap((w) => [w.a, w.b]));
      const gapOf = (x) => Math.min(...x.scale.at.map((p) => Math.hypot(Math.max(core.x0 - p.x, 0, p.x - core.x1), Math.max(core.y0 - p.y, 0, p.y - core.y1))));
      const ranked = positioned.map((x) => ({ x, gap: gapOf(x) })).sort((p, q) => p.gap - q.gap);
      // only a clear winner: captions tied (both inside the plan, or as far)
      // say nothing about which drawing is which
      if (ranked[1].gap - ranked[0].gap > 10) nearest = ranked[0].x;
    }
  }
  let result = null, bestScore = -Infinity;
  for (const x of runs) {
    const { scale, r } = x;
    const score = plausibility(r, extent) + 0.5 * doorFit(scale.cmPerUnit) + (scale.preferred ? 0.05 : 0) + (x === nearest ? 0.3 : 0);
    if (score > bestScore) {
      bestScore = score;
      result = r;
    }
  }
  if (candidates.length > 1) result.scale = { ...result.scale, alternatives: candidates.length - 1 };

  // weak scales get a second opinion from the room labels
  if (!options.cmPerUnit && (result.scale.source === "door-swings" || result.scale.source === "none")) {
    const k0 = result.cmPerUnit;
    const unitWalls = result.walls.map((w) => ({ a: w.a, b: w.b, thickness: w.thickness / k0 }));
    const rooms = roomLabelScale(prims.texts || [], unitWalls, axis);
    if (rooms && rooms.support >= 2) result = run({ ...rooms, confidence: Math.min(1, rooms.support / 4) });
  }
  result.diagnostics = { ...result.diagnostics, segments: segments.length, lines: linesAll.length, arcs: arcs.length, axisDeg: axis / DEG, images: prims.images || 0 };
  // a scanned sheet: the plan is a picture inside the PDF, so the caller
  // should rasterize the page and use the image recognizer instead
  result.rasterOnly = !result.walls.length && (prims.images || 0) > 0;
  return result;
}

// Which faces can bound a wall on this sheet. Section cuts — walls — are
// drawn with the heaviest pen in real use, or as a fill; things below the cut
// plane (balcony parapets, counters), tiles, fixtures, furniture and hatching
// use lighter pens. The heaviest pen is judged on long lines only (1.2 m and
// more), so short heavy strokes like door leaves don't set it; a pen counts
// as heavy from 0.75× that width. On a sheet drawn in one pen that is every
// pen, and nothing changes.
export function strongFaces(lines, k = 1) {
  const byWidth = new Map();
  let total = 0;
  for (const l of lines) {
    if (!(l.lineWidth > 0) || l.annotation || l.L * k < 120) continue;
    const w = Math.round(l.lineWidth * 20) / 20;
    byWidth.set(w, (byWidth.get(w) || 0) + l.L);
    total += l.L;
  }
  let heaviest = 0;
  for (const [w, L] of byWidth) if (L >= 0.02 * total && w > heaviest) heaviest = w;
  const minPen = 0.75 * heaviest;
  return (l) => !!l.fill || (l.lineWidth > 0 && l.lineWidth >= minPen);
}

function recognizeAtScale(allLines, arcs, scale, inFill, options) {
  const k = scale.cmPerUnit;
  // seams first: a wall drawn as several adjacent fill strips must lose its
  // inner edges before the hatch test counts lines
  const lines = removeHatching(removeSeams(allLines, inFill), HATCH_PITCH_MAX_CM / k);
  const groups = byDirection(lines);
  const strong = options.allFaces ? () => true : strongFaces(lines, k);
  const trace = options.debug ? [] : null;
  const snap = (stage, walls) => {
    if (trace) trace.push({ stage, walls: walls.map((w) => (w.a && w.b ? { a: w.a, b: w.b, thickness: w.thickness } : { a: endpoint(w, w.t0), b: endpoint(w, w.t1), thickness: w.thickness, styles: w.styles })) });
    return walls;
  };
  let strokeOnly = false;
  const build = (faceOk, poche = false) => {
    const paired = pairFaces(lines, groups, k, inFill, faceOk, strong);
    const strokes = strokeWalls(lines, paired.used, k, faceOk, paired.walls.length === 0);
    strokeOnly = paired.walls.length === 0 && strokes.length > 0;
    let walls = snap("pairs", paired.walls.concat(strokes));
    walls = snap("merged", mergeWalls(walls, Math.max(1, 30 / k)));
    // shorter than thick: the gap between a wall end and a jamb, not a wall
    // (and it must go before containment, or it swallows the real wall)
    walls = snap("long-enough", walls.filter((w) => w.t1 - w.t0 >= Math.max(0.6 * w.thickness, 8 / k)));
    walls = snap("uncontained", pruneContained(walls));
    walls = snap("leaves", mergeLeaves(walls, k));
    walls = snap("no-glazing", dropGlazingStacks(walls, k));
    const joined = joinOpenings(walls, lines, groups, arcs, k);
    walls = snap("joined", mergeWalls(joined.walls, Math.max(1, 30 / k)));
    // openings sit on the wall line they were found on
    for (const op of joined.openings) {
      op.wall = walls.find((w) => w.th === op.th && Math.abs(w.c - op.c) < 0.3 * w.thickness && op.t >= w.t0 && op.t <= w.t1) || null;
    }
    let healed = snap("healed", healJunctions(walls, k));
    // a sheet that draws its walls as poché draws (nearly) all of them that
    // way: an unfilled wall there has to span between other walls, as a real
    // outline partition does; a sofa or a glazing pair touches at most one
    if (poche) healed = snap("anchored", healed.filter((w) => w.filled || (anchored(w.a, w, healed, k) && anchored(w.b, w, healed, k))));
    return { healed: snap("network", keepMainNetwork(healed, k)), openings: joined.openings };
  };
  const any = () => true;
  const first = build(any);
  const styleLength = new Map();
  let total = 0, filledLength = 0;
  for (const w of first.healed) {
    const L = len(sub(w.b, w.a));
    total += L;
    if (w.filled) filledLength += L;
    for (const key of new Set(w.line.styles || [])) styleLength.set(key, (styleLength.get(key) || 0) + L);
  }
  const top = Math.max(0, ...styleLength.values());
  const wallStyles = new Set([...styleLength].filter(([, v]) => v >= 0.15 * top).map(([key]) => key));
  // a sheet that draws its walls as poché draws all of them that way: an
  // empty pair of lines there is furniture or glazing, not a wall
  const poche = total > 0 && filledLength >= 0.7 * total;
  const second = wallStyles.size ? build((l) => wallStyles.has(styleKey(l)), poche) : first;
  const { healed } = second;
  const lineIndex = new Map(healed.map((w, i) => [w.line, i]));
  const openings = second.openings.filter((op) => op.wall && lineIndex.has(op.wall)).map((op) => ({
    type: op.type,
    center: endpoint(op.wall, op.t),
    width: op.width * k,
    wall: lineIndex.get(op.wall),
    hinge: op.door ? op.door.hinge : undefined,
    double: op.door && op.door.double ? true : undefined,
    swing: op.door ? op.door.swing : undefined,
  }));
  return {
    cmPerUnit: k,
    scale,
    walls: healed.map((w) => ({ a: w.a, b: w.b, thickness: w.thickness * k, filled: w.filled, styles: w.line.styles || [] })),
    openings,
    trace,
    diagnostics: { wallStyles: [...wallStyles], poche, strokeOnly, hatchRemoved: allLines.length - lines.length },
  };
}

// ------------------------------------------------- annotation-tool helpers

/**
 * Every face pair (and wide stroke) the first pass would consider at a given
 * scale, merged but before any pruning — the menu ground-truth annotation
 * (tools/plan_gt.mjs) picks real walls from. Sheet units; thickness in units.
 */
export function wallCandidates(prims, cmPerUnit) {
  const k = cmPerUnit;
  const { segments, arcs } = collectSegments(prims);
  const lines = removeHatching(mergeCollinear(snapAngles(segments.map(lineOf))), HATCH_PITCH_MAX_CM / k);
  const groups = byDirection(lines);
  const paired = pairFaces(lines, groups, k, fillIndex(prims), () => true);
  const walls = mergeWalls(paired.walls.concat(strokeWalls(lines, paired.used, k, () => true, paired.walls.length === 0)), Math.max(1, 30 / k));
  return {
    walls: walls.map((w) => ({ a: endpoint(w, w.t0), b: endpoint(w, w.t1), thickness: w.thickness, filled: w.filled })),
    lines: lines.map((l) => ({ a: l.a, b: l.b, th: l.th, c: l.c, t0: l.t0, t1: l.t1, styleKey: styleKey(l) })),
    arcs,
  };
}

/** Snap wall ends onto the centrelines they butt into (sheet units). */
export function healWalls(walls, cmPerUnit) {
  const internal = walls.map((w) => {
    const l = lineOf({ a: w.a, b: w.b });
    return { th: l.th, u: l.u, n: l.n, c: l.c, t0: l.t0, t1: l.t1, thickness: w.thickness };
  });
  return healJunctions(internal, cmPerUnit).map((w) => ({ a: w.a, b: w.b, thickness: w.thickness }));
}

/** Sheet units → centimetres about `origin` (sheet units), x right, z down. */
export function planToCentimetres(plan, origin = { x: 0, y: 0 }) {
  const k = plan.cmPerUnit;
  const P = (p) => ({ x: (p.x - origin.x) * k, z: (p.y - origin.y) * k });
  return {
    cmPerPx: k,
    walls: plan.walls.map((w) => ({ a: P(w.a), b: P(w.b), thickness: w.thickness })),
    openings: plan.openings.map((o) => ({ type: o.type, center: P(o.center), width: o.width, wall: o.wall, hinge: o.hinge, swing: o.swing, double: o.double })),
  };
}

/**
 * A recognized plan as the planner's own wall graph ({ nodes, walls,
 * openings, nextId }), through js/cad_to_walls.js so junction splitting and
 * opening placement are the same as every other CAD import. Centred on the
 * walls' bounding box; doors keep their hinge side and swing (plan2d's
 * swingDir: L/R = hinge at the wall's a/b end, OUT = towards the wall's left
 * normal). Walls arrive already paired, so pairing is switched off.
 */
export function vectorPlanToPlanner(plan, options = {}) {
  const wb = boundsOf(plan.walls.flatMap((w) => [w.a, w.b]));
  const origin = plan.walls.length ? { x: (wb.x0 + wb.x1) / 2, y: (wb.y0 + wb.y1) / 2 } : { x: 0, y: 0 };
  const rec = planToCentimetres(plan, origin);
  const records = rec.openings.map((o, i) => ({ id: i, type: o.type, center: o.center, width: o.width,
    height: o.type === "window" ? 120 : 205, sill: o.type === "window" ? 90 : 0 }));
  const graph = convertCadToWalls(
    { lines: rec.walls.map((w) => ({ a: w.a, b: w.b, thickness: Math.round(w.thickness * 10) / 10, layer: "walls" })), doors: records },
    { singleLineWalls: true, minWidth: Infinity, nodeTolerance: 2, firstId: options.firstId, height: options.height, phase: options.phase || "existing" },
  );
  // convertCadToWalls keeps record order (minus rejects); re-attach swing by
  // nearest centre, which is unambiguous since openings never overlap
  const byId = new Map(graph.walls.map((w) => [w.id, w]));
  for (const op of graph.openings) {
    const w = byId.get(op.wall), a = graph.nodes[w.a], b = graph.nodes[w.b];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const c = { x: a.x + ((b.x - a.x) * op.s) / L, z: a.z + ((b.z - a.z) * op.s) / L };
    let best = null, bd = Infinity;
    rec.openings.forEach((o) => {
      const d = Math.hypot(o.center.x - c.x, o.center.z - c.z);
      if (d < bd) { bd = d; best = o; }
    });
    if (!best || best.type !== "door" || !best.hinge) continue;
    // the recognizer's frame runs along its own wall line; flip both senses
    // when the converted wall points the other way
    const src = plan.walls[best.wall];
    const su = { x: src.b.x - src.a.x, z: src.b.y - src.a.y };
    const same = su.x * (b.x - a.x) + su.z * (b.z - a.z) >= 0;
    const atStart = (best.hinge === "start") === same;
    const out = (best.swing > 0) === same;
    // a pair of leaves: the planner's double door, opening to the same side
    if (best.double) op.isDouble = true;
    op.swingDir = (atStart ? "L" : "R") + "_" + (out ? "OUT" : "IN");
  }
  return { ...graph, origin, cmPerUnit: plan.cmPerUnit };
}

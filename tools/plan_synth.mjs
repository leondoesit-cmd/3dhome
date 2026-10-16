// Synthetic floor plans with exact ground truth, for benchmarking floor-plan
// recognition (tools/plan_bench.mjs) and for its unit tests.
//
// A plan is a guillotine (BSP) split of a rectangular footprint into rooms,
// optionally made L-shaped by dropping a corner room and given a 45° chamfer
// so diagonal walls are exercised too. Walls fall out of a cell grid: every
// grid edge whose two sides belong to different rooms is a wall (exterior when
// one side is outside), and collinear runs are merged. Doors, windows and
// passages are then placed clear of wall junctions.
//
// Rendering mimics the styles real plans come in: solid black poché ("bw"),
// Israeli developer sheets with coloured / hatched concrete ("il") and CAD
// exports that draw walls as two thin lines ("outline"); with furniture
// symbols, fake text, dimension chains, rotation, blur and noise layered on.
//
// Ground truth is expressed in the frame the recognizer reports in — origin at
// the image centre, x right, z down, centimetres — the same convention as
// pixelToWorld() in js/blueprint_trace.js with zero rotation.
import { pathToFileURL } from "node:url";
import {
  createImage, createMask, fillPolygonMask, segmentQuad, strokeSegment, strokeArc,
  strokeRect, fillCircle, paintMask, maskEdge, downsample, rotateImage, boxBlur, addNoise,
} from "./plan_draw.mjs";

export const SYNTH_STYLES = ["bw", "il", "outline"];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const snap10 = (v) => Math.round(v / 10) * 10;
export const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
export const range = (rng, lo, hi) => lo + rng() * (hi - lo);

const MIN_SIDE = 220;
const ROOM_NAMES = ["living", "bedroom", "bedroom", "kitchen", "bath", "safe room", "hall", "study", "wc"];

// ---------------------------------------------------------------- topology

function splitRooms(rng, W, D) {
  const leaves = [{ x0: 0, z0: 0, x1: W, z1: D }];
  const targetArea = range(rng, 9, 16) * 1e4;
  for (let guard = 0; guard < 40 && leaves.length < 9; guard++) {
    leaves.sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
    const r = leaves[0];
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (w * d < targetArea * 1.4) break;
    const canX = w >= 2 * MIN_SIDE, canZ = d >= 2 * MIN_SIDE;
    if (!canX && !canZ) break;
    const alongX = canX && (!canZ || (w > d ? rng() < 0.8 : rng() < 0.2));
    leaves.shift();
    if (alongX) {
      const cut = snap10(range(rng, r.x0 + MIN_SIDE, r.x1 - MIN_SIDE));
      leaves.push({ ...r, x1: cut }, { ...r, x0: cut });
    } else {
      const cut = snap10(range(rng, r.z0 + MIN_SIDE, r.z1 - MIN_SIDE));
      leaves.push({ ...r, z1: cut }, { ...r, z0: cut });
    }
  }
  return leaves;
}

function cornerLeaf(leaves, W, D, cx, cz) {
  return leaves.findIndex((r) =>
    (cx === 0 ? r.x0 === 0 : r.x1 === W) && (cz === 0 ? r.z0 === 0 : r.z1 === D));
}

// Grid of the distinct x / z coordinates; each cell belongs to one leaf or to
// the outside (-1). Walls are grid edges between differing owners.
function wallsFromLeaves(leaves, outside, tExt, tInt) {
  const xs = [...new Set(leaves.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(leaves.flatMap((r) => [r.z0, r.z1]))].sort((a, b) => a - b);
  const owner = (i, j) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= zs.length - 1) return -1;
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    const k = leaves.findIndex((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1);
    return k < 0 || outside.has(k) ? -1 : k;
  };
  const kindOf = (p, q) => (p === q ? null : p < 0 || q < 0 ? "exterior" : "interior");
  const walls = [];
  const merge = (vertical, fixed, edges) => {
    let run = null;
    const flush = () => {
      if (!run) return;
      const a = vertical ? { x: fixed, z: run.lo } : { x: run.lo, z: fixed };
      const b = vertical ? { x: fixed, z: run.hi } : { x: run.hi, z: fixed };
      walls.push({ a, b, kind: run.kind, thickness: run.kind === "exterior" ? tExt : tInt });
      run = null;
    };
    for (const e of edges) {
      if (run && e.kind === run.kind && Math.abs(e.lo - run.hi) < 1e-9) run.hi = e.hi;
      else {
        flush();
        if (e.kind) run = { ...e };
      }
    }
    flush();
  };
  for (let i = 0; i < xs.length; i++) {
    const edges = [];
    for (let j = 0; j < zs.length - 1; j++)
      edges.push({ lo: zs[j], hi: zs[j + 1], kind: kindOf(owner(i - 1, j), owner(i, j)) });
    merge(true, xs[i], edges);
  }
  for (let j = 0; j < zs.length; j++) {
    const edges = [];
    for (let i = 0; i < xs.length - 1; i++)
      edges.push({ lo: xs[i], hi: xs[i + 1], kind: kindOf(owner(i, j - 1), owner(i, j)) });
    merge(false, zs[j], edges);
  }
  return { walls, xs, zs };
}

export const wallLength = (w) => Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
export const wallDir = (w) => {
  const L = wallLength(w) || 1;
  return { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
};
const at = (w, s) => {
  const u = wallDir(w);
  return { x: w.a.x + u.x * s, z: w.a.z + u.z * s };
};

// Where along each wall another wall touches it (parameter s), plus the
// half-thickness of the toucher: openings keep clear of those points.
function wallBreaks(walls) {
  return walls.map((w, i) => {
    const L = wallLength(w), u = wallDir(w);
    const breaks = [{ s: 0, half: w.thickness / 2 }, { s: L, half: w.thickness / 2 }];
    walls.forEach((o, j) => {
      if (i === j) return;
      // T-junctions: the other wall ends on this one
      for (const p of [o.a, o.b]) {
        const dx = p.x - w.a.x, dz = p.z - w.a.z;
        const s = dx * u.x + dz * u.z, off = Math.abs(dx * -u.z + dz * u.x);
        if (off < 1 && s > 1 && s < L - 1) breaks.push({ s, half: o.thickness / 2 });
      }
      // crossings: the other wall runs straight through this one
      const v = wallDir(o), den = u.x * v.z - u.z * v.x;
      if (Math.abs(den) < 1e-9) return;
      const wx = o.a.x - w.a.x, wz = o.a.z - w.a.z;
      const s = (wx * v.z - wz * v.x) / den, r = (wx * u.z - wz * u.x) / den;
      if (s > 1 && s < L - 1 && r > 1 && r < wallLength(o) - 1) breaks.push({ s, half: o.thickness / 2 });
    });
    return breaks.sort((p, q) => p.s - q.s);
  });
}

function chamferCorner(rng, walls, leaves, outside, W, D, tExt) {
  const corners = [[0, 0], [W, 0], [W, D], [0, D]].filter(([cx, cz]) => {
    const k = cornerLeaf(leaves, W, D, cx, cz);
    return k >= 0 && !outside.has(k);
  });
  if (!corners.length) return null;
  const [cx, cz] = pick(rng, corners);
  const leaf = leaves[cornerLeaf(leaves, W, D, cx, cz)];
  const room = Math.min(leaf.x1 - leaf.x0, leaf.z1 - leaf.z0);
  const c = snap10(Math.min(180, range(rng, 100, room - 60)));
  if (c < 80) return null;
  const corner = { x: cx, z: cz };
  const same = (p, q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6;
  const ends = [];
  for (const w of walls) {
    if (w.kind !== "exterior") continue;
    for (const end of ["a", "b"]) {
      if (!same(w[end], corner)) continue;
      const other = end === "a" ? w.b : w.a;
      const L = wallLength(w);
      const t = c / L;
      w[end] = { x: corner.x + (other.x - corner.x) * t, z: corner.z + (other.z - corner.z) * t };
      ends.push(w[end]);
    }
  }
  if (ends.length !== 2) return null;
  walls.push({ a: ends[0], b: ends[1], kind: "exterior", thickness: tExt });
  return { corner, size: c };
}

function placeOpenings(rng, walls) {
  const breaks = wallBreaks(walls);
  const openings = [];
  const spans = [];
  walls.forEach((w, i) => {
    const br = breaks[i];
    for (let k = 0; k + 1 < br.length; k++) {
      const lo = br[k].s + br[k].half + 20, hi = br[k + 1].s - br[k + 1].half - 20;
      if (hi - lo >= 70) spans.push({ wall: i, lo, hi });
    }
  });
  const add = (span, type, width) => {
    const w = walls[span.wall];
    const s = range(rng, span.lo + width / 2, span.hi - width / 2);
    span.used = true;
    openings.push({
      type, wall: span.wall, s, width,
      hingeAtStart: rng() < 0.5, swing: rng() < 0.5 ? 1 : -1,
      center: at(w, s),
    });
  };
  const ext = spans.filter((p) => walls[p.wall].kind === "exterior" && p.hi - p.lo >= 100);
  if (ext.length) add(pick(rng, ext), "door", 90);
  for (const span of spans) {
    if (span.used) continue;
    const room = span.hi - span.lo;
    if (walls[span.wall].kind === "interior") {
      if (rng() < 0.75) add(span, "door", Math.min(pick(rng, [70, 80, 90]), snap10(room - 5)));
      else if (rng() < 0.3 && room >= 110) add(span, "passage", snap10(range(rng, 100, Math.min(160, room))));
    } else if (room >= 90 && rng() < 0.8) {
      add(span, "window", snap10(range(rng, 80, Math.min(220, room))));
    }
  }
  return openings.filter((o) => o.width >= 60);
}

function roomPolygons(leaves, outside, chamfer) {
  return leaves.map((r, i) => ({ r, i })).filter(({ i }) => !outside.has(i)).map(({ r, i }) => {
    let pts = [{ x: r.x0, z: r.z0 }, { x: r.x1, z: r.z0 }, { x: r.x1, z: r.z1 }, { x: r.x0, z: r.z1 }];
    if (chamfer) {
      const k = pts.findIndex((p) => p.x === chamfer.corner.x && p.z === chamfer.corner.z);
      if (k >= 0) {
        const prev = pts[(k + 3) % 4], next = pts[(k + 1) % 4], p = pts[k], c = chamfer.size;
        const toward = (q) => {
          const L = Math.hypot(q.x - p.x, q.z - p.z);
          return { x: p.x + ((q.x - p.x) * c) / L, z: p.z + ((q.z - p.z) * c) / L };
        };
        pts.splice(k, 1, toward(prev), toward(next));
      }
    }
    return { index: i, name: ROOM_NAMES[i % ROOM_NAMES.length], points: pts };
  });
}

// ---------------------------------------------------------------- rendering

function fakeText(img, rng, x, y, height, chars, color, ss) {
  const w = height * 0.62, gap = height * 0.18;
  let cx = x - (chars * (w + gap)) / 2;
  const top = y - height / 2;
  for (let c = 0; c < chars; c++, cx += w + gap) {
    const strokes = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < strokes; k++) {
      const p = { x: cx + rng() * w, y: top + rng() * height };
      const q = { x: cx + rng() * w, y: top + rng() * height };
      strokeSegment(img, p, q, 1.3 * ss, color, 0.6 * ss);
    }
  }
}

function drawFurniture(img, rng, leaf, P, cmPx, ss) {
  const color = [110, 110, 110], lw = 1 * ss;
  const w = leaf.x1 - leaf.x0, d = leaf.z1 - leaf.z0, pad = 45;
  const kind = pick(rng, ["bed", "sofa", "table", "none"]);
  const fit = (fw, fd) => fw + 2 * pad <= w && fd + 2 * pad <= d;
  const place = (fw, fd) => {
    const x = range(rng, leaf.x0 + pad, leaf.x1 - pad - fw);
    const z = range(rng, leaf.z0 + pad, leaf.z1 - pad - fd);
    return { x, z, a: P({ x, z }), b: P({ x: x + fw, z: z + fd }) };
  };
  if (kind === "bed" && fit(160, 200)) {
    const r = place(160, 200);
    strokeRect(img, r.a.x, r.a.y, r.b.x, r.b.y, lw, color);
    const pillow = P({ x: r.x + 160, z: r.z + 40 });
    strokeRect(img, r.a.x + 10 * ss / cmPx, r.a.y + 10 * ss / cmPx, pillow.x - 10 * ss / cmPx, pillow.y, lw, color);
  } else if (kind === "sofa" && fit(220, 90)) {
    const r = place(220, 90);
    strokeRect(img, r.a.x, r.a.y, r.b.x, r.b.y, lw, color);
    const back = P({ x: r.x + 220, z: r.z + 25 });
    strokeRect(img, r.a.x, r.a.y, back.x, back.y, lw, color);
  } else if (kind === "table" && fit(120, 120)) {
    const r = place(120, 120);
    const c = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 }, rad = (r.b.x - r.a.x) / 2;
    fillCircle(img, c, rad, color);
    fillCircle(img, c, Math.max(1, rad - lw), [255, 255, 255]);
  }
}

function drawOpening(img, o, walls, P, cmPx, ss) {
  const w = walls[o.wall];
  const u = wallDir(w), n = { x: -u.z, z: u.x };
  const ink = [40, 40, 40], lw = 1.1 * ss;
  const p = (s, off) => P({ x: w.a.x + u.x * s + n.x * off, z: w.a.z + u.z * s + n.z * off });
  const s0 = o.s - o.width / 2, s1 = o.s + o.width / 2, half = w.thickness / 2;
  if (o.type === "window") {
    for (const s of [s0, s1]) strokeSegment(img, p(s, -half), p(s, half), lw, ink);
    for (const off of [-half, -half / 3, half / 3, half])
      strokeSegment(img, p(s0, off), p(s1, off), lw * (off === -half || off === half ? 1 : 0.8), ink);
  } else if (o.type === "door") {
    const hingeS = o.hingeAtStart ? s0 : s1, freeS = o.hingeAtStart ? s1 : s0;
    const face = o.swing * half;
    const hinge = p(hingeS, face), leafEnd = p(hingeS, face + o.swing * o.width), free = p(freeS, face);
    strokeSegment(img, hinge, leafEnd, 1.6 * ss, ink);
    const a0 = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);
    let a1 = Math.atan2(free.y - hinge.y, free.x - hinge.x);
    while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
    while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
    strokeArc(img, hinge, o.width / cmPx * ss, a0, a1, 0.9 * ss, ink);
  }
}

function drawDimensions(img, rng, W, D, xs, zs, P, cmPx, ss, textPx) {
  const ink = [70, 70, 70], lw = 0.9 * ss, off = 60 + textPx * cmPx * 1.2;
  const chain = (fixed, coords, vertical, sign) => {
    const pt = (v, o) => (vertical ? P({ x: fixed + sign * o, z: v }) : P({ x: v, z: fixed + sign * o }));
    strokeSegment(img, pt(coords[0], off), pt(coords[coords.length - 1], off), lw, ink);
    coords.forEach((v) => {
      const c = pt(v, off), t = 5 * ss;
      strokeSegment(img, { x: c.x - t, y: c.y + t }, { x: c.x + t, y: c.y - t }, lw * 1.3, ink);
      strokeSegment(img, pt(v, off - 25), pt(v, off + 15), lw, ink);
    });
    for (let k = 0; k + 1 < coords.length; k++) {
      const span = coords[k + 1] - coords[k];
      if (span / cmPx < textPx * 3.5) continue;
      const m = pt((coords[k] + coords[k + 1]) / 2, off + textPx * cmPx * 0.75);
      fakeText(img, rng, m.x, m.y, textPx * ss, 3, ink, ss);
    }
  };
  chain(0, xs, false, -1);
  chain(D, xs, false, 1);
  chain(0, zs, true, -1);
  chain(W, zs, true, 1);
}

// Each wall cut at its openings into solid pieces, in plan cm. Square caps
// (half the thickness) only at true wall ends: they close corners and T-joints.
export function wallPieces(walls, openings) {
  const pieces = [];
  walls.forEach((w, i) => {
    const L = wallLength(w), u = wallDir(w);
    const cuts = openings.filter((o) => o.wall === i)
      .map((o) => [o.s - o.width / 2, o.s + o.width / 2]).sort((p, q) => p[0] - q[0]);
    let s = 0;
    const spans = [];
    for (const [c0, c1] of cuts) {
      spans.push([s, c0]);
      s = c1;
    }
    spans.push([s, L]);
    for (const [p0, p1] of spans) {
      if (p1 - p0 < 1) continue;
      const capA = p0 < 1e-6 ? w.thickness / 2 : 0, capB = L - p1 < 1e-6 ? w.thickness / 2 : 0;
      pieces.push({
        wall: i, kind: w.kind, thickness: w.thickness,
        a: { x: w.a.x + u.x * (p0 - capA), z: w.a.z + u.z * (p0 - capA) },
        b: { x: w.a.x + u.x * (p1 + capB), z: w.a.z + u.z * (p1 + capB) },
      });
    }
  });
  return pieces;
}

function renderWalls(img, walls, openings, P, style, rng, ss, cmPx) {
  const extMask = createMask(img.width, img.height), intMask = createMask(img.width, img.height);
  for (const piece of wallPieces(walls, openings))
    fillPolygonMask(piece.kind === "exterior" ? extMask : intMask, segmentQuad(P(piece.a), P(piece.b), (piece.thickness / cmPx) * ss));
  const union = createMask(img.width, img.height);
  for (let i = 0; i < union.data.length; i++) union.data[i] = extMask.data[i] | intMask.data[i];
  if (style === "bw") {
    paintMask(img, extMask, [25, 25, 25]);
    paintMask(img, intMask, rng() < 0.5 ? [25, 25, 25] : [80, 80, 80]);
  } else if (style === "outline") {
    if (rng() < 0.5) paintMask(img, union, [205, 205, 205]);
    paintMask(img, maskEdge(union, Math.max(1, Math.round(ss * 0.8))), [20, 20, 20]);
  } else {
    // Israeli developer sheet: hatched or tinted concrete, grey block walls
    const period = Math.max(4, Math.round(ss * range(rng, 4, 7)));
    const tint = pick(rng, [[60, 90, 175], [190, 60, 60], [70, 70, 70]]);
    const hatched = rng() < 0.6;
    paintMask(img, extMask, (x, y) => (hatched ? ((x + y) % period < ss * 1.2 ? tint : [235, 238, 245]) : tint));
    paintMask(img, intMask, [150, 150, 150]);
    paintMask(img, maskEdge(union, Math.max(1, Math.round(ss * 0.7))), [30, 30, 30]);
  }
}

// ---------------------------------------------------------------- public API

/**
 * The geometry of one synthetic plan, before any drawing: topology, openings,
 * rooms and the sheet layout (scale, margins, text size). Both renderers
 * (raster: synthPlan, vector PDF: tools/plan_synth_pdf.mjs) start from this,
 * and `rng` is left positioned for the renderer's own random choices.
 */
export function buildPlan(seed, options = {}) {
  const rng = mulberry32(seed * 2654435761 + 17);
  const opt = (key, fallback) => (options[key] !== undefined ? options[key] : fallback);
  const style = opt("style", pick(rng, SYNTH_STYLES));
  const W = snap10(range(rng, 700, 1300)), D = snap10(range(rng, 600, 1100));
  const tExt = pick(rng, [20, 25, 30]), tInt = pick(rng, [10, 12, 15]);

  const leaves = splitRooms(rng, W, D);
  const outside = new Set();
  if (opt("lshape", rng() < 0.4) && leaves.length >= 4) {
    const area = W * D;
    const corners = [[0, 0], [W, 0], [W, D], [0, D]]
      .map(([cx, cz]) => cornerLeaf(leaves, W, D, cx, cz))
      // a strip spanning a whole side would just leave a smaller rectangle
      .filter((k) => k >= 0 && leaves[k].x1 - leaves[k].x0 < W && leaves[k].z1 - leaves[k].z0 < D &&
        (leaves[k].x1 - leaves[k].x0) * (leaves[k].z1 - leaves[k].z0) <= area * 0.3);
    if (corners.length) outside.add(pick(rng, corners));
  }
  const { walls, xs, zs } = wallsFromLeaves(leaves, outside, tExt, tInt);
  const chamfer = opt("chamfer", rng() < 0.35) ? chamferCorner(rng, walls, leaves, outside, W, D, tExt) : null;
  const openings = placeOpenings(rng, walls);
  const rooms = roomPolygons(leaves, outside, chamfer);

  const longPx = range(rng, 500, 1000);
  const cmPerPx = opt("cmPerPx", Math.max(W, D) / longPx);
  const textPx = range(rng, 9, 13);
  const marginPx = Math.round(40 + (60 / cmPerPx) + textPx * 2.5);
  const width = Math.round(W / cmPerPx + 2 * marginPx), height = Math.round(D / cmPerPx + 2 * marginPx);
  return {
    seed, rng, opt, style, W, D, tExt, tInt, leaves, outside, walls, xs, zs, chamfer, openings, rooms,
    cmPerPx, textPx, marginPx, width, height,
  };
}

// plan cm → sheet-centred cm (the recognizer's frame), through the rotation
// the sheet took
export function planTruth(plan, rotation = 0) {
  const { cmPerPx, marginPx, width, height } = plan;
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const T = (p) => {
    const dx = p.x / cmPerPx + marginPx - width / 2, dy = p.z / cmPerPx + marginPx - height / 2;
    return { x: (c * dx - s * dy) * cmPerPx, z: (s * dx + c * dy) * cmPerPx };
  };
  return {
    cmPerPx,
    rotation,
    walls: plan.walls.map((w) => ({ a: T(w.a), b: T(w.b), thickness: w.thickness, kind: w.kind })),
    // doors: hinge at the wall's a end or b end, leaf on the side of the
    // wall's left normal (+1) or right (−1) — plan2d's L/R and OUT/IN
    openings: plan.openings.map((o) => ({
      type: o.type, center: T(o.center), width: o.width, wall: o.wall,
      ...(o.type === "door" ? { hingeAtStart: o.hingeAtStart, swing: o.swing } : {}),
    })),
    rooms: plan.rooms.map((r) => ({ name: r.name, points: r.points.map(T) })),
  };
}

export function planMeta(plan, extra = {}) {
  const { seed, style, W, D, tExt, tInt, outside, chamfer, width, height } = plan;
  return { seed, style, W, D, tExt, tInt, lshape: outside.size > 0, chamfer: !!chamfer, width, height, ...extra };
}

/**
 * One synthetic plan as a raster image. Options (all optional; unset ones are
 * drawn from the seed): style, cmPerPx, rotationDeg, furniture, text,
 * dimensions, lshape, chamfer, blur, noise.
 * Returns { image, truth, meta }:
 *   truth.walls     [{ a:{x,z}, b:{x,z}, thickness, kind }] centrelines, cm
 *   truth.openings  [{ type:"door"|"window"|"passage", center:{x,z}, width, wall }]
 *   truth.rooms     [{ name, points:[{x,z}] }]
 *   truth.cmPerPx, truth.rotation (radians, clockwise on screen)
 */
export function synthPlan(seed, options = {}) {
  const plan = buildPlan(seed, options);
  const { rng, opt, style, W, D, xs, zs, leaves, outside, walls, openings, rooms, cmPerPx, textPx, marginPx, width, height } = plan;
  const ss = 2;
  const P = (p) => ({ x: (p.x / cmPerPx + marginPx) * ss, y: (p.z / cmPerPx + marginPx) * ss });

  let img = createImage(width * ss, height * ss);
  if (opt("dimensions", rng() < 0.7)) drawDimensions(img, rng, W, D, xs, zs, P, cmPerPx, ss, textPx);
  if (opt("furniture", rng() < 0.7))
    leaves.forEach((leaf, i) => { if (!outside.has(i) && rng() < 0.7) drawFurniture(img, rng, leaf, P, cmPerPx, ss); });
  renderWalls(img, walls, openings, P, style, rng, ss, cmPerPx);
  openings.forEach((o) => drawOpening(img, o, walls, P, cmPerPx, ss));
  if (opt("text", rng() < 0.8)) {
    rooms.forEach((r) => {
      const leaf = leaves[r.index];
      const c = P({ x: (leaf.x0 + leaf.x1) / 2, z: (leaf.z0 + leaf.z1) / 2 });
      fakeText(img, rng, c.x, c.y - textPx * ss * 0.7, textPx * ss, 3 + Math.floor(rng() * 5), [30, 30, 30], ss);
      fakeText(img, rng, c.x, c.y + textPx * ss * 0.7, textPx * ss * 0.8, 4, [60, 60, 60], ss);
    });
  }
  img = downsample(img, ss);

  const rotation = (opt("rotationDeg", rng() < 0.4 ? range(rng, -4, 4) : 0) * Math.PI) / 180;
  if (rotation) img = rotateImage(img, rotation);
  const blur = opt("blur", rng() < 0.25 ? 1 : 0);
  if (blur) img = boxBlur(img, blur);
  const noise = opt("noise", rng() < 0.4 ? range(rng, 3, 12) : 0);
  if (noise) addNoise(img, noise, rng, rng() < 0.5 ? [250, 246, 236] : null);

  return { image: img, truth: planTruth(plan, rotation), meta: planMeta(plan, { rotation, blur, noise }) };
}

// CLI: node tools/plan_synth.mjs [count] [outDir] — write PNG + truth JSON
// pairs for eyeballing the generator.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { encodePNG } = await import("./png.mjs");
  const count = Number(process.argv[2]) || 6;
  const out = process.argv[3] || "bench/out/synth";
  mkdirSync(out, { recursive: true });
  for (let seed = 1; seed <= count; seed++) {
    const { image, truth, meta } = synthPlan(seed);
    writeFileSync(join(out, `synth_${seed}.png`), encodePNG(image));
    writeFileSync(join(out, `synth_${seed}.json`), JSON.stringify({ meta, truth }, null, 1));
    console.log(`synth_${seed}: ${meta.style} ${meta.width}x${meta.height}px, ${truth.walls.length} walls, ${truth.openings.length} openings`);
  }
}

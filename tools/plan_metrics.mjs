// Scores a recognized floor plan against ground truth (tools/plan_synth.mjs,
// or a hand-traced real plan). Both sides are plain records in centimetres in
// the same frame:
//   { cmPerPx?, walls: [{ a:{x,z}, b:{x,z}, thickness? }],
//     openings: [{ type, center:{x,z}, width }], rooms?: [{ points:[{x,z}] }] }
//
// Walls are compared as centrelines, length-weighted: a truth sample counts as
// recalled when a predicted wall runs within `tolerance` of it in roughly the
// same direction, and vice versa for precision — so how a recognizer splits a
// wall into segments never matters, only where the walls are.
//
// `align` separates geometry quality from registration: "similarity" fits the
// prediction onto the truth (ICP with rotation, translation and scale) before
// scoring, so a plan that is perfect but 3% off in scale still shows perfect
// walls and a 3% scale error, rather than mediocre everything.

const dirOf = (w) => {
  const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L, L };
};

function samples(walls, step) {
  const out = [];
  walls.forEach((w, index) => {
    const d = dirOf(w);
    const n = Math.max(1, Math.round(d.L / step));
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * d.L;
      out.push({ x: w.a.x + d.x * t, z: w.a.z + d.z * t, ux: d.x, uz: d.z, w: d.L / n, index });
    }
  });
  return out;
}

function closestOnSegment(p, w) {
  const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, ll = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / ll));
  return { x: w.a.x + dx * t, z: w.a.z + dz * t };
}

function pointSegment(p, w) {
  const q = closestOnSegment(p, w);
  return Math.hypot(p.x - q.x, p.z - q.z);
}

// Fraction (by length) of `from` samples lying near a parallel wall in `to`,
// plus the matched wall per sample for thickness comparison.
function coverage(from, to, tolerance, cosTol) {
  let hit = 0, total = 0;
  const matches = [];
  for (const p of from) {
    total += p.w;
    let best = null, bestD = Infinity;
    for (let j = 0; j < to.length; j++) {
      const d = dirOf(to[j]);
      if (Math.abs(d.x * p.ux + d.z * p.uz) < cosTol) continue;
      const dist = pointSegment(p, to[j]);
      if (dist < bestD) { bestD = dist; best = j; }
    }
    if (bestD <= tolerance) {
      hit += p.w;
      matches.push({ sample: p, other: best });
    }
  }
  return { ratio: total ? hit / total : 1, matches };
}

// --------------------------------------------------------------- alignment

// Least-squares similarity (Umeyama) mapping src points onto dst points.
function fitSimilarity(src, dst, allowScale) {
  const n = src.length;
  let sx = 0, sz = 0, dx = 0, dz = 0;
  for (let i = 0; i < n; i++) { sx += src[i].x; sz += src[i].z; dx += dst[i].x; dz += dst[i].z; }
  sx /= n; sz /= n; dx /= n; dz /= n;
  let a = 0, b = 0, varS = 0;
  for (let i = 0; i < n; i++) {
    const px = src[i].x - sx, pz = src[i].z - sz, qx = dst[i].x - dx, qz = dst[i].z - dz;
    a += px * qx + pz * qz;
    b += px * qz - pz * qx;
    varS += px * px + pz * pz;
  }
  const theta = Math.atan2(b, a);
  const scale = allowScale && varS > 0 ? Math.hypot(a, b) / varS : 1;
  const c = Math.cos(theta) * scale, s = Math.sin(theta) * scale;
  return { c, s, tx: dx - (c * sx - s * sz), tz: dz - (s * sx + c * sz), scale, theta };
}

const apply = (T, p) => ({ x: T.c * p.x - T.s * p.z + T.tx, z: T.s * p.x + T.c * p.z + T.tz });

function compose(T2, T1) {
  // T2 ∘ T1
  return {
    c: T2.c * T1.c - T2.s * T1.s,
    s: T2.s * T1.c + T2.c * T1.s,
    tx: T2.c * T1.tx - T2.s * T1.tz + T2.tx,
    tz: T2.s * T1.tx + T2.c * T1.tz + T2.tz,
  };
}

export function alignPrediction(truth, pred, mode = "similarity", iterations = 30) {
  const allowScale = mode === "similarity";
  // Point-to-segment ICP: predicted samples pair with the closest point on a
  // truth wall, not the closest truth sample — sample spacing would otherwise
  // quantize the fit and bias the recovered scale by a few tenths of a percent.
  const dst = samples(truth.walls, 10), srcBase = samples(pred.walls, 10);
  if (!dst.length || !srcBase.length) return { pred, transform: null };
  // start from matching centroids (and spread, when scale is free)
  const mean = (pts) => pts.reduce((m, p) => ({ x: m.x + p.x / pts.length, z: m.z + p.z / pts.length }), { x: 0, z: 0 });
  const spread = (pts, m) => Math.sqrt(pts.reduce((s, p) => s + (p.x - m.x) ** 2 + (p.z - m.z) ** 2, 0) / pts.length);
  const md = mean(dst), ms = mean(srcBase);
  const k = allowScale ? spread(dst, md) / (spread(srcBase, ms) || 1) : 1;
  let T = { c: k, s: 0, tx: md.x - k * ms.x, tz: md.z - k * ms.z };
  let gate = Infinity;
  for (let it = 0; it < iterations; it++) {
    const src = srcBase.map((p) => apply(T, p));
    const pairs = [];
    for (const p of src) {
      let best = null, bd = Infinity;
      for (const w of truth.walls) {
        const q = closestOnSegment(p, w);
        const d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
        if (d < bd) { bd = d; best = q; }
      }
      pairs.push({ p, q: best, d: Math.sqrt(bd) });
    }
    // trimmed ICP: ignore the worst matches (spurious walls, missed walls)
    const ds = pairs.map((x) => x.d).sort((m, n) => m - n);
    gate = Math.max(15, ds[Math.floor(ds.length * 0.8)] || 0);
    const kept = pairs.filter((x) => x.d <= gate);
    if (kept.length < 3) break;
    const step = fitSimilarity(kept.map((x) => x.p), kept.map((x) => x.q), allowScale);
    T = compose(step, T);
    if (Math.abs(step.theta) < 1e-5 && Math.abs(step.scale - 1) < 1e-5 && Math.hypot(step.tx, step.tz) < 0.01) break;
  }
  const scale = Math.hypot(T.c, T.s);
  const map = (p) => apply(T, p);
  const aligned = {
    ...pred,
    cmPerPx: pred.cmPerPx != null ? pred.cmPerPx * scale : pred.cmPerPx,
    walls: pred.walls.map((w) => ({ ...w, a: map(w.a), b: map(w.b), thickness: w.thickness != null ? w.thickness * scale : w.thickness })),
    openings: (pred.openings || []).map((o) => ({ ...o, center: map(o.center), width: o.width * scale })),
    rooms: pred.rooms ? pred.rooms.map((r) => ({ ...r, points: r.points.map(map) })) : pred.rooms,
  };
  return { pred: aligned, transform: { scale, rotation: Math.atan2(T.s, T.c), tx: T.tx, tz: T.tz } };
}

// ---------------------------------------------------------------- openings

function matchOpenings(truth, pred, maxDist, typed) {
  const pairs = [];
  truth.forEach((t, i) => pred.forEach((p, j) => {
    if (typed && t.type !== p.type) return;
    const d = Math.hypot(t.center.x - p.center.x, t.center.z - p.center.z);
    if (d <= maxDist) pairs.push({ i, j, d });
  }));
  pairs.sort((m, n) => m.d - n.d);
  const ti = new Set(), pj = new Set(), matched = [];
  for (const p of pairs) {
    if (ti.has(p.i) || pj.has(p.j)) continue;
    ti.add(p.i);
    pj.add(p.j);
    matched.push(p);
  }
  return matched;
}

const f1 = (tp, nTruth, nPred) => {
  const precision = nPred ? tp / nPred : nTruth ? 0 : 1;
  const recall = nTruth ? tp / nTruth : 1;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
};

// ------------------------------------------------------------------- rooms

function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function polygonIoU(A, B, step = 5) {
  const xs = [...A, ...B].map((p) => p.x), zs = [...A, ...B].map((p) => p.z);
  let inter = 0, union = 0;
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
    for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
      const a = pointInPolygon({ x, z }, A), b = pointInPolygon({ x, z }, B);
      if (a && b) inter++;
      if (a || b) union++;
    }
  }
  return union ? inter / union : 0;
}

// ------------------------------------------------------------------- score

/**
 * options: tolerance (cm, default 10), angleToleranceDeg (10),
 * openingDistance (cm, 30), align ("none" | "rigid" | "similarity").
 */
export function scorePlan(truth, pred, options = {}) {
  const tolerance = options.tolerance ?? 10;
  const cosTol = Math.cos(((options.angleToleranceDeg ?? 10) * Math.PI) / 180);
  let transform = null;
  if (options.align && options.align !== "none") {
    ({ pred, transform } = alignPrediction(truth, pred, options.align));
  }
  const tSamples = samples(truth.walls, 5), pSamples = samples(pred.walls, 5);
  const rec = coverage(tSamples, pred.walls, tolerance, cosTol);
  const prec = coverage(pSamples, truth.walls, tolerance, cosTol);
  const wallF1 = rec.ratio + prec.ratio ? (2 * rec.ratio * prec.ratio) / (rec.ratio + prec.ratio) : 0;

  let thickErr = 0, thickN = 0;
  for (const m of rec.matches) {
    const t = truth.walls[m.sample.index].thickness, p = pred.walls[m.other].thickness;
    if (t == null || p == null) continue;
    thickErr += Math.abs(t - p) * m.sample.w;
    thickN += m.sample.w;
  }

  const tOpen = truth.openings || [], pOpen = pred.openings || [];
  const maxDist = options.openingDistance ?? 30;
  const any = matchOpenings(tOpen, pOpen, maxDist, false);
  const typed = matchOpenings(tOpen, pOpen, maxDist, true);
  const byType = {};
  for (const type of ["door", "window", "passage"]) {
    const tt = tOpen.filter((o) => o.type === type), pt = pOpen.filter((o) => o.type === type);
    const tp = matchOpenings(tt, pt, maxDist, true).length;
    byType[type] = { truth: tt.length, predicted: pt.length, ...f1(tp, tt.length, pt.length) };
  }
  const widthErr = any.length
    ? any.reduce((s, m) => s + Math.abs(tOpen[m.i].width - pOpen[m.j].width), 0) / any.length
    : null;

  let rooms = null;
  if (truth.rooms && pred.rooms) {
    const ious = truth.rooms.map((t) => Math.max(0, ...pred.rooms.map((p) => polygonIoU(t.points, p.points))));
    rooms = {
      truth: truth.rooms.length,
      predicted: pred.rooms.length,
      meanIoU: ious.length ? ious.reduce((s, v) => s + v, 0) / ious.length : 1,
      matched50: ious.filter((v) => v >= 0.5).length,
    };
  }

  return {
    walls: {
      precision: prec.ratio, recall: rec.ratio, f1: wallF1,
      thicknessMAE: thickN ? thickErr / thickN : null,
      truthLength: tSamples.reduce((s, p) => s + p.w, 0),
      predictedLength: pSamples.reduce((s, p) => s + p.w, 0),
    },
    openings: { any: f1(any.length, tOpen.length, pOpen.length), typed: f1(typed.length, tOpen.length, pOpen.length), byType, widthMAE: widthErr },
    rooms,
    scaleError: pred.cmPerPx && truth.cmPerPx ? Math.abs(pred.cmPerPx / truth.cmPerPx - 1) : null,
    alignment: transform,
  };
}

// The planner's own wall graph ({ nodes, walls, openings } with openings at
// distance `s` along their wall) as a scoring record.
export function plannerToRecord(plan) {
  const nodes = plan.nodes || [];
  const byId = new Map((plan.walls || []).map((w) => [w.id, w]));
  const walls = (plan.walls || []).filter((w) => nodes[w.a] && nodes[w.b]).map((w) => ({
    a: { x: nodes[w.a].x, z: nodes[w.a].z }, b: { x: nodes[w.b].x, z: nodes[w.b].z }, thickness: w.thickness,
  }));
  const openings = (plan.openings || []).map((o) => {
    const w = byId.get(o.wall);
    if (!w || !nodes[w.a] || !nodes[w.b]) return null;
    const a = nodes[w.a], b = nodes[w.b], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return {
      type: o.type === "window" ? "window" : o.type === "door" ? "door" : "passage",
      center: { x: a.x + ((b.x - a.x) * o.s) / L, z: a.z + ((b.z - a.z) * o.s) / L },
      width: o.width,
    };
  }).filter(Boolean);
  return { cmPerPx: plan.cmPerPx, walls, openings, rooms: plan.rooms };
}

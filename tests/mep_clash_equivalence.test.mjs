/* computeMEPClashes() skips run pairs and segment pairs whose bounding boxes
   are farther apart than their clearance (docs/perf_plan.md, package D). The
   skip must never change the answer: this compares it with the previous
   exhaustive algorithm, kept here verbatim, on random networks of every
   system, layer, slope and duct shape. */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { addRun, computeMEPClashes, ensureMEP, runKindDef, runPointY } from "../js/mep.js";

const fin = (v) => typeof v === "number" && isFinite(v);

// ---- the exhaustive reference (the pre-change implementation) ----
function segSegApproach3D(a0, a1, b0, b1) {
  var u = [a1.x - a0.x, a1.y - a0.y, a1.z - a0.z];
  var v = [b1.x - b0.x, b1.y - b0.y, b1.z - b0.z];
  var w = [a0.x - b0.x, a0.y - b0.y, a0.z - b0.z];
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  var aa = dot(u, u), bb = dot(u, v), cc = dot(v, v), dd = dot(u, w), ee = dot(v, w);
  if (aa < 1e-9 || cc < 1e-9) return null;
  var D = aa * cc - bb * bb, sn, sd = D, tn, td = D;
  if (D < 1e-9) { sn = 0; sd = 1; tn = ee; td = cc; }
  else {
    sn = bb * ee - cc * dd; tn = aa * ee - bb * dd;
    if (sn < 0) { sn = 0; tn = ee; td = cc; }
    else if (sn > sd) { sn = sd; tn = ee + bb; td = cc; }
  }
  if (tn < 0) {
    tn = 0;
    if (-dd < 0) sn = 0;
    else if (-dd > aa) sn = sd;
    else { sn = -dd; sd = aa; }
  } else if (tn > td) {
    tn = td;
    if (-dd + bb < 0) sn = 0;
    else if (-dd + bb > aa) sn = sd;
    else { sn = -dd + bb; sd = aa; }
  }
  var s = Math.abs(sn) < 1e-9 ? 0 : sn / sd;
  var t = Math.abs(tn) < 1e-9 ? 0 : tn / td;
  var p = { x: a0.x + s * u[0], y: a0.y + s * u[1], z: a0.z + s * u[2] };
  var q = { x: b0.x + t * v[0], y: b0.y + t * v[1], z: b0.z + t * v[2] };
  return { d: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2, yA: p.y, yB: q.y, z: (p.z + q.z) / 2 };
}
function referenceClashes() {
  var m = ensureMEP(), out = [];
  function clearance(a, b) {
    return Math.max(4, ((fin(a.dia) ? a.dia : 2) + (fin(b.dia) ? b.dia : 2)) / 2);
  }
  function halfHeight(r) {
    var kind = runKindDef(r.sys, r.k);
    return kind && kind.rect ? r.dia * (kind.hRatio || 0.6) / 2 : r.dia / 2;
  }
  for (var i = 0; i < m.runs.length; i++) {
    var A = m.runs[i];
    if (!A.pts || A.pts.length < 2) continue;
    for (var j = i + 1; j < m.runs.length; j++) {
      var B = m.runs[j];
      if (A.sys === B.sys || !B.pts || B.pts.length < 2) continue;
      var gap = clearance(A, B), best = null;
      var ay = runPointY(A), by = runPointY(B);
      for (var ia = 1; ia < A.pts.length; ia++) {
        for (var ib = 1; ib < B.pts.length; ib++) {
          var a0 = { x: A.pts[ia - 1].x, y: ay[ia - 1], z: A.pts[ia - 1].z };
          var a1 = { x: A.pts[ia].x, y: ay[ia], z: A.pts[ia].z };
          var b0 = { x: B.pts[ib - 1].x, y: by[ib - 1], z: B.pts[ib - 1].z };
          var b1 = { x: B.pts[ib].x, y: by[ib], z: B.pts[ib].z };
          var hit = segSegApproach3D(a0, a1, b0, b1);
          var kindA = runKindDef(A.sys, A.k), kindB = runKindDef(B.sys, B.k);
          var verticalGap = Math.max(0,
            Math.min(a0.y, a1.y) - Math.max(b0.y, b1.y),
            Math.min(b0.y, b1.y) - Math.max(a0.y, a1.y));
          if (hit && ((kindA && kindA.rect) || (kindB && kindB.rect)) &&
            verticalGap >= halfHeight(A) + halfHeight(B) + 2) continue;
          if (hit && hit.d < gap && (!best || hit.d < best.d)) best = hit;
        }
      }
      if (!best) continue;
      out.push({
        a: A.id, b: B.id, sysA: A.sys, kA: A.k, sysB: B.sys, kB: B.k,
        layerA: A.layer, layerB: B.layer, x: best.x, y: best.y, z: best.z,
        separationCm: best.d, clearanceCm: gap,
      });
    }
  }
  return out;
}

// small deterministic PRNG
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return s / 4294967296; };
}

const KINDS = [["power", "circuit"], ["water", "cold"], ["water", "hot"], ["drain", "waste"], ["drain", "vent"],
  ["comms", "cat6"], ["comms", "coax"], ["hvac", "duct"], ["hvac", "branch"], ["hvac", "flex"]];
const LAYERS = ["wall", "ceiling", "floor"];

function network(seed, runs, spread) {
  const r = rng(seed);
  S.nodes = [{ x: 0, z: 0 }, { x: spread, z: 0 }, { x: spread, z: spread }, { x: 0, z: spread }];
  S.walls = [0, 1, 2, 3].map((i) => ({ id: i + 1, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
  S.openings = [];
  S.mep = null;
  for (let i = 0; i < runs; i++) {
    const [sys, k] = KINDS[Math.floor(r() * KINDS.length)];
    const n = 2 + Math.floor(r() * 5), pts = [];
    let x = r() * spread, z = r() * spread;
    for (let v = 0; v < n; v++) {
      pts.push({ x: Math.round(x), z: Math.round(z) });
      if (r() < 0.5) x += (r() - 0.5) * spread * 0.6; else z += (r() - 0.5) * spread * 0.6;
    }
    addRun(sys, k, pts, null, null, LAYERS[Math.floor(r() * LAYERS.length)]);
    const run = S.mep.runs[S.mep.runs.length - 1];
    if (run && r() < 0.2) run.elev = Math.round(r() * 260);
    if (run && r() < 0.15) run.pts.push({ x: run.pts[run.pts.length - 1].x, z: run.pts[run.pts.length - 1].z }); // zero-length tail
  }
}

test("bounding-box rejection finds exactly the clashes the exhaustive search finds", () => {
  let total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    network(seed, 6 + (seed % 25), seed % 3 === 0 ? 300 : 900);
    const want = referenceClashes(), got = computeMEPClashes();
    assert.deepEqual(got, want, "seed " + seed);
    total += want.length;
  }
  assert.ok(total > 20, "the random networks must actually clash (" + total + ")");
});

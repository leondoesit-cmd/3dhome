// Floor-plan recognition benchmark harness: the synthetic generator must
// draw exactly what its ground truth says, and the metrics must reward and
// punish the right things — otherwise every number the bench prints about a
// real recognizer is meaningless.
import test from "node:test";
import assert from "node:assert/strict";

import { encodePNG, decodePNG } from "../tools/png.mjs";
import { synthPlan } from "../tools/plan_synth.mjs";
import { scorePlan, plannerToRecord } from "../tools/plan_metrics.mjs";
import { runBench } from "../tools/plan_bench.mjs";

const lum = (img, x, y) => {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
};

// fraction of wall-centreline samples (clear of openings and wall ends) that
// land on dark pixels
function inkOnWalls(plan) {
  const { image, truth } = plan;
  const toPx = (p) => ({ x: p.x / truth.cmPerPx + image.width / 2 - 0.5, y: p.z / truth.cmPerPx + image.height / 2 - 0.5 });
  let dark = 0, total = 0;
  truth.walls.forEach((w, i) => {
    const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const gaps = truth.openings.filter((o) => o.wall === i).map((o) => {
      const s = Math.hypot(o.center.x - w.a.x, o.center.z - w.a.z);
      return [s - o.width / 2 - 8, s + o.width / 2 + 8];
    });
    for (let s = 15; s < L - 15; s += 7) {
      if (gaps.some(([g0, g1]) => s > g0 && s < g1)) continue;
      const p = toPx({ x: w.a.x + ((w.b.x - w.a.x) * s) / L, z: w.a.z + ((w.b.z - w.a.z) * s) / L });
      total++;
      if (lum(image, p.x, p.y) < 128) dark++;
    }
  });
  return dark / total;
}

test("PNG codec round-trips RGBA pixels", () => {
  const img = { width: 5, height: 3, data: new Uint8ClampedArray(5 * 3 * 4) };
  for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37) & 255;
  const back = decodePNG(encodePNG(img));
  assert.equal(back.width, 5);
  assert.equal(back.height, 3);
  assert.deepEqual([...back.data], [...img.data]);
});

test("synthetic plans are deterministic per seed", () => {
  const a = synthPlan(11), b = synthPlan(11);
  assert.deepEqual(a.truth, b.truth);
  assert.deepEqual(a.meta, b.meta);
  assert.ok(Buffer.from(a.image.data.buffer).equals(Buffer.from(b.image.data.buffer)));
  assert.notDeepEqual(synthPlan(12).truth, a.truth);
});

test("ground truth sits on the drawn walls, straight or rotated", () => {
  for (const rotationDeg of [0, 3.5]) {
    for (const seed of [2, 6, 7]) {
      const plan = synthPlan(seed, { style: "bw", rotationDeg, noise: 0, blur: 0 });
      assert.ok(inkOnWalls(plan) > 0.97, `seed ${seed} rot ${rotationDeg}: ${inkOnWalls(plan)}`);
    }
  }
});

test("openings sit on their wall, clear of its ends", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { truth } = synthPlan(seed);
    for (const o of truth.openings) {
      const w = truth.walls[o.wall];
      const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
      const s = Math.hypot(o.center.x - w.a.x, o.center.z - w.a.z);
      const off = Math.abs((o.center.x - w.a.x) * (w.b.z - w.a.z) - (o.center.z - w.a.z) * (w.b.x - w.a.x)) / L;
      assert.ok(off < 1e-6, `seed ${seed}: opening off its wall by ${off}`);
      assert.ok(s - o.width / 2 > 0 && s + o.width / 2 < L, `seed ${seed}: opening overruns its wall`);
    }
  }
});

test("generator covers L-shapes, chamfers and every style", () => {
  const metas = Array.from({ length: 30 }, (_, i) => synthPlan(i + 1).meta);
  assert.ok(metas.some((m) => m.lshape));
  assert.ok(metas.some((m) => m.chamfer));
  for (const style of ["bw", "il", "outline"]) assert.ok(metas.some((m) => m.style === style));
  const diagonal = synthPlan(metas.findIndex((m) => m.chamfer) + 1, { rotationDeg: 0 }).truth.walls
    .some((w) => Math.abs(w.b.x - w.a.x) > 1 && Math.abs(w.b.z - w.a.z) > 1);
  assert.ok(diagonal, "a chamfered plan has a diagonal wall");
});

const square = {
  cmPerPx: 2,
  walls: [
    { a: { x: 0, z: 0 }, b: { x: 400, z: 0 }, thickness: 20 },
    { a: { x: 400, z: 0 }, b: { x: 400, z: 300 }, thickness: 20 },
    { a: { x: 400, z: 300 }, b: { x: 0, z: 300 }, thickness: 20 },
    { a: { x: 0, z: 300 }, b: { x: 0, z: 0 }, thickness: 20 },
    { a: { x: 200, z: 0 }, b: { x: 200, z: 300 }, thickness: 10 },
  ],
  openings: [
    { type: "door", center: { x: 200, z: 150 }, width: 80 },
    { type: "window", center: { x: 100, z: 0 }, width: 120 },
  ],
};
const mapRecord = (r, f, k = 1) => ({
  ...r,
  cmPerPx: r.cmPerPx * k,
  walls: r.walls.map((w) => ({ ...w, a: f(w.a), b: f(w.b), thickness: w.thickness * k })),
  openings: r.openings.map((o) => ({ ...o, center: f(o.center), width: o.width * k })),
});

test("metrics: perfect prediction scores 1 and segmentation does not matter", () => {
  const s = scorePlan(square, square);
  assert.equal(s.walls.f1, 1);
  assert.equal(s.openings.typed.f1, 1);
  assert.equal(s.scaleError, 0);
  // the same walls cut into pieces score the same
  const split = { ...square, walls: square.walls.flatMap((w) => {
    const m = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
    return [{ ...w, b: m }, { ...w, a: m }];
  }) };
  assert.ok(scorePlan(square, split).walls.f1 > 0.999);
});

test("metrics: missing and spurious walls cost recall and precision", () => {
  const missing = { ...square, walls: square.walls.slice(0, 4) };
  const m = scorePlan(square, missing);
  assert.equal(m.walls.precision, 1);
  assert.ok(Math.abs(m.walls.recall - 1400 / 1700) < 0.01);
  const extra = { ...square, walls: [...square.walls, { a: { x: 0, z: 150 }, b: { x: 200, z: 150 } }] };
  const e = scorePlan(square, extra);
  assert.equal(e.walls.recall, 1);
  assert.ok(Math.abs(e.walls.precision - 1700 / 1900) < 0.01);
  // a wall in the right place but the wrong direction is not a match
  const crossed = { ...square, walls: [{ a: { x: 190, z: 150 }, b: { x: 210, z: 150 } }] };
  assert.equal(scorePlan(square, crossed).walls.precision, 0);
});

test("metrics: alignment separates registration and scale from geometry", () => {
  const a = 0.05, c = Math.cos(a), s = Math.sin(a);
  const moved = mapRecord(square, (p) => ({ x: 1.04 * (c * p.x - s * p.z) + 37, z: 1.04 * (s * p.x + c * p.z) - 12 }), 1.04);
  assert.ok(scorePlan(square, moved).walls.f1 < 0.5);
  const aligned = scorePlan(square, moved, { align: "similarity" });
  assert.ok(aligned.walls.f1 > 0.999, String(aligned.walls.f1));
  assert.ok(aligned.openings.typed.f1 === 1);
  assert.ok(Math.abs(aligned.alignment.scale - 1 / 1.04) < 1e-3);
  assert.ok(aligned.scaleError < 1e-3, "scale error measured after the fit cancels it out");
  // rigid alignment keeps scale, so a size error beyond the tolerance stays
  // visible as geometry (4% of a 4 m room is still inside 10 cm; 15% is not)
  const big = mapRecord(square, (p) => ({ x: 1.15 * p.x, z: 1.15 * p.z }), 1.15);
  assert.ok(scorePlan(square, big, { align: "rigid" }).walls.f1 < 0.9);
  assert.ok(scorePlan(square, big, { align: "similarity" }).walls.f1 > 0.999);
});

test("metrics: openings need the right type for the typed score", () => {
  const swapped = { ...square, openings: square.openings.map((o) => ({ ...o, type: o.type === "door" ? "window" : "door" })) };
  const s = scorePlan(square, swapped);
  assert.equal(s.openings.any.f1, 1);
  assert.equal(s.openings.typed.f1, 0);
  assert.equal(s.openings.byType.door.recall, 0);
});

test("planner wall graphs convert to scoring records", () => {
  const rec = plannerToRecord({
    nodes: [{ x: 0, z: 0 }, { x: 400, z: 0 }],
    walls: [{ id: 7, a: 0, b: 1, thickness: 20 }],
    openings: [{ id: 8, type: "door", wall: 7, s: 100, width: 80 }],
  });
  assert.deepEqual(rec.walls, [{ a: { x: 0, z: 0 }, b: { x: 400, z: 0 }, thickness: 20 }]);
  assert.deepEqual(rec.openings, [{ type: "door", center: { x: 100, z: 0 }, width: 80 }]);
});

test("bench: oracle is perfect, rect-only representation finds no openings", async () => {
  const { rows } = await runBench({ n: 2, recognizer: "oracle,rect-ceiling", corpus: "bench/does-not-exist" });
  const oracle = rows.find((r) => r.recognizer === "oracle" && r.group === "all");
  assert.equal(oracle.cases, 12, "2 seeds × 3 raster styles + 2 seeds × 3 PDF styles");
  assert.equal(oracle.wallF1, 1);
  assert.equal(oracle.openF1, 1);
  const rect = rows.find((r) => r.recognizer === "rect-ceiling" && r.group === "all");
  assert.equal(rect.openF1, 0);
});

test("bench: recognizers only see the inputs they read", async () => {
  const { rows } = await runBench({ n: 1, recognizer: "pdf-vector", corpus: "bench/does-not-exist" });
  const groups = rows.filter((r) => r.group !== "all").map((r) => r.group).sort();
  assert.deepEqual(groups, ["pdf-hatch", "pdf-outline", "pdf-poche"]);
  assert.ok(rows.find((r) => r.group === "all").wallF1 > 0.98);
});

// Regression tests for the vector-PDF importer's review findings: each case
// is a small hand-built sheet reproducing a way real CAD / developer PDFs
// differ from the synthetic bench (clipped viewports, ExtGState, thick
// strokes, compound fills, mm dimensions, interrupted dimension lines…).
import test from "node:test";
import assert from "node:assert/strict";

import { primitivesFromOperatorList } from "../js/plan_recog/pdf_primitives.js";
import { recognizeVectorPlan, collectSegments, removeHatching, lineOf, vectorPlanToPlanner } from "../js/plan_recog/vector_plan.js";
import { dimensionScale, measureDimensionLabels, parseLength } from "../js/plan_recog/dimensions.js";
import { roomLabelScale } from "../js/plan_recog/room_scale.js";
import { readPdfPrimitives } from "../tools/plan_pdf_view.mjs";
import { PdfCanvas, writePdf } from "../tools/pdf_write.mjs";

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// --- tiny sheet builders (sheet units, y down) -----------------------------

const stroke = (pts, extra = {}) => ({
  subpaths: [{ points: pts, curvedSeg: pts.map(() => false), closed: !!extra.closed, curved: false }],
  stroke: [20, 20, 20], fill: null, lineWidth: 0.5, dashed: false, evenOdd: false, ...extra,
});
const line = (x1, y1, x2, y2, extra) => stroke([{ x: x1, y: y1 }, { x: x2, y: y2 }], extra);
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const sheet = (paths, texts = [], size = 2000) => ({ width: size, height: size, paths, texts, images: 0 });

// a wall drawn as its two faces: centreline (x1,y1)→(x2,y2), thickness t
function wallFaces(x1, y1, x2, y2, t, extra) {
  const L = Math.hypot(x2 - x1, y2 - y1), nx = (-(y2 - y1) / L) * t / 2, ny = ((x2 - x1) / L) * t / 2;
  return [line(x1 + nx, y1 + ny, x2 + nx, y2 + ny, extra), line(x1 - nx, y1 - ny, x2 - nx, y2 - ny, extra)];
}
// a rectangular building of double-line walls (centreline box), faces clipped
// at the corners the way CAD cleans them
function building(x0, y0, x1, y1, t) {
  const h = t / 2;
  return [
    stroke(rect(x0 - h, y0 - h, x1 + h, y1 + h), { closed: true }),
    stroke(rect(x0 + h, y0 + h, x1 - h, y1 - h), { closed: true }),
  ];
}

const OPS = {
  save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18,
  rectangle: 19, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25,
  closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, clip: 29, eoClip: 30, setLineWidth: 2, setDash: 6,
  setGState: 9, setStrokeRGBColor: 58, setFillRGBColor: 59, constructPath: 91,
  paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, paintImageXObject: 85,
};
const packed = (paint, data) => [OPS.constructPath, [paint, [new Float32Array(data)], null]];
const list = (...entries) => ({ fnArray: entries.map((e) => e[0]), argsArray: entries.map((e) => e[1] ?? null) });

// --- extraction ------------------------------------------------------------

test("clip paths limit what is extracted (CAD viewports)", () => {
  const { paths } = primitivesFromOperatorList(list(
    [OPS.save], [OPS.clip], packed(OPS.endPath, [0, 10, 10, 1, 60, 10, 1, 60, 60, 1, 10, 60, 4]),
    packed(OPS.stroke, [0, 0, 30, 1, 200, 30]), // runs far outside the viewport
    packed(OPS.fill, [0, 0, 0, 1, 100, 0, 1, 100, 40, 1, 0, 40, 4]),
    [OPS.restore],
    packed(OPS.stroke, [0, 0, 100, 1, 50, 100]), // after restore: unclipped
  ), OPS);
  assert.deepEqual(paths[0].subpaths[0].points, [{ x: 10, y: 30 }, { x: 60, y: 30 }]);
  const xs = paths[1].subpaths[0].points.map((p) => p.x), ys = paths[1].subpaths[0].points.map((p) => p.y);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [10, 60, 10, 40]);
  assert.deepEqual(paths[2].subpaths[0].points, [{ x: 0, y: 100 }, { x: 50, y: 100 }]);
});

test("form XObjects paint nothing outside their /BBox", () => {
  const { paths } = primitivesFromOperatorList(list(
    [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 100, 0], [0, 0, 20, 20]]],
    packed(OPS.stroke, [0, -50, 10, 1, 50, 10]),
    [OPS.paintFormXObjectEnd],
  ), OPS);
  assert.deepEqual(paths[0].subpaths[0].points, [{ x: 100, y: 10 }, { x: 120, y: 10 }]);
});

test("ExtGState line width, dash and zero opacity are honoured", () => {
  const { paths } = primitivesFromOperatorList(list(
    [OPS.save], [OPS.setGState, [[["LW", 20]]]], packed(OPS.stroke, [0, 0, 0, 1, 10, 0]), [OPS.restore],
    [OPS.save], [OPS.setGState, [[["D", [[5, 5], 0]]]]], packed(OPS.stroke, [0, 0, 5, 1, 10, 5]), [OPS.restore],
    [OPS.save], [OPS.setGState, [[["CA", 0]]]], packed(OPS.stroke, [0, 0, 9, 1, 10, 9]), [OPS.restore],
  ), OPS);
  assert.equal(paths.length, 2, "an invisible (CA 0) stroke is not geometry");
  assert.equal(paths[0].lineWidth, 20);
  assert.equal(paths[1].dashed, true);
});

test("legacy close-paint closes only the current subpath", () => {
  const { paths } = primitivesFromOperatorList(list(
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo, OPS.moveTo, OPS.lineTo, OPS.lineTo], [0, 0, 10, 0, 20, 0, 30, 0, 30, 10], null]],
    [OPS.closeStroke],
  ), OPS);
  assert.equal(paths[0].subpaths[0].closed, false);
  assert.equal(paths[0].subpaths[1].closed, true);
});

test("legacy `v` curve after closePath starts its control at the subpath start", () => {
  const { paths } = primitivesFromOperatorList(list(
    [OPS.constructPath, [[OPS.moveTo, OPS.lineTo, OPS.closePath, OPS.curveTo2], [0, 0, 10, 0, 10, 10, 20, 0], null]],
    [OPS.stroke],
  ), OPS);
  const curve = paths[0].subpaths[1].points;
  // cubic (0,0) (0,0) (10,10) (20,0) at t = 1/8
  const t = 1 / 8, u = 1 - t;
  const want = { x: 3 * u * t * t * 10 + t * t * t * 20, y: 3 * u * t * t * 10 };
  assert.ok(near(curve[1].x, want.x, 1e-6) && near(curve[1].y, want.y, 1e-6), JSON.stringify(curve[1]));
});

test("a curved corner keeps the polygon's straight edges", () => {
  const { paths } = primitivesFromOperatorList(list(
    // a filled wall slab whose last corner is rounded
    packed(OPS.fill, [0, 0, 0, 1, 100, 0, 1, 100, 10, 2, 100, 15, 95, 20, 90, 20, 1, 0, 20, 4]),
  ), OPS);
  const { segments } = collectSegments({ paths });
  const horizontal = segments.filter((s) => Math.abs(s.a.y - s.b.y) < 1e-9 && Math.abs(s.a.x - s.b.x) > 50);
  assert.equal(horizontal.length, 2, "both long faces survive");
});

test("a dash pattern drops strokes, not fills", () => {
  const { paths } = primitivesFromOperatorList(list(
    [OPS.setDash, [[5, 5], 0]],
    packed(OPS.fill, [0, 0, 0, 1, 10, 0, 1, 10, 10, 1, 0, 10, 4]),
    packed(OPS.stroke, [0, 0, 20, 1, 10, 20]),
  ), OPS);
  const { segments } = collectSegments({ paths });
  assert.equal(segments.length, 4, "the filled square's four edges, no dashed line");
});

// --- recognition -----------------------------------------------------------

test("walls drawn as one wide stroke are walls", () => {
  const prims = sheet([stroke(rect(100, 100, 700, 500), { closed: true, lineWidth: 20 })]);
  const plan = recognizeVectorPlan(prims, { cmPerUnit: 1 });
  assert.equal(plan.walls.length, 4);
  for (const w of plan.walls) assert.ok(near(w.thickness, 20, 0.01));
});

test("nearly parallel faces pair anywhere on the sheet", () => {
  for (const [ox, oy] of [[0, 0], [1000, 1000]]) {
    const a = 0.4 * Math.PI / 180, L = 300;
    const faces = [
      line(ox, oy, ox + L, oy),
      line(ox, oy + 10, ox + L * Math.cos(a), oy + 10 + L * Math.sin(a)),
    ];
    const plan = recognizeVectorPlan(sheet(faces, [], 2500), { cmPerUnit: 2 });
    assert.equal(plan.walls.length, 1, `at (${ox},${oy})`);
    assert.ok(near(plan.walls[0].thickness, 21, 1.2), `thickness ${plan.walls[0].thickness}`);
  }
});

test("a partition crossing a wall mid-span stays connected", () => {
  const paths = [...wallFaces(100, 500, 1100, 500, 20), ...wallFaces(600, 400, 600, 600, 10)];
  const plan = recognizeVectorPlan(sheet(paths), { cmPerUnit: 1 });
  assert.ok(plan.walls.some((w) => near(w.a.x, 600, 1) && near(w.b.x, 600, 1)), "the crossing partition survives");
});

test("compound fills honour their fill rule (a room hole is not wall)", () => {
  const ring = {
    subpaths: [
      { points: rect(100, 100, 600, 500), curvedSeg: [false, false, false, false], closed: true, curved: false },
      { points: rect(120, 120, 580, 480), curvedSeg: [false, false, false, false], closed: true, curved: false },
    ],
    stroke: null, fill: [40, 40, 40], lineWidth: 0, dashed: false, evenOdd: true,
  };
  // a dark cabinet 10 units inside the inner face
  const cabinet = { ...ring, subpaths: [{ points: rect(130, 200, 160, 400), curvedSeg: [false, false, false, false], closed: true, curved: false }], evenOdd: false };
  const plan = recognizeVectorPlan(sheet([ring, cabinet]), { cmPerUnit: 1 });
  const left = plan.walls.find((w) => near(w.a.x, w.b.x, 0.5) && w.a.x < 200);
  assert.ok(left, "left wall found");
  assert.ok(near(left.a.x, 110, 0.5), `centreline at ${left.a.x}`);
  assert.ok(near(left.thickness, 20, 0.5), `thickness ${left.thickness}`);
});

test("door swing follows the arc, not where its centre sits", () => {
  const base = [...wallFaces(0, 0, 100, 0, 10), ...wallFaces(180, 0, 400, 0, 10), ...wallFaces(0, -200, 0, 200, 10)];
  const arc = (cy, sign) => {
    // quarter arc hinged on the wall centreline at x = 100, radius 80
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2);
      pts.push({ x: 100 + 80 * Math.sin(a), y: cy + sign * 80 * Math.cos(a) });
    }
    return { subpaths: [{ points: pts, curvedSeg: pts.map((_, i) => i > 0), closed: false, curved: true }], stroke: [0, 0, 0], fill: null, lineWidth: 0.3, dashed: false };
  };
  const offset = (paths) => paths.map((p) => ({ ...p, subpaths: p.subpaths.map((s) => ({ ...s, points: s.points.map((q) => ({ x: q.x + 500, y: q.y + 500 })) })) }));
  const swings = [];
  for (const sign of [1, -1]) {
    const plan = recognizeVectorPlan(sheet(offset([...base, arc(0, sign)])), { cmPerUnit: 1 });
    const door = plan.openings.find((o) => o.type === "door");
    assert.ok(door, `door found (arc on ${sign > 0 ? "+" : "-"}y side)`);
    swings.push(door.swing);
  }
  assert.deepEqual(swings, [1, -1]);
});

// --- scale ----------------------------------------------------------------

// A single room drawn at 1 unit = `k` cm, dimensioned with `labels`
// (strings for the 100-unit and 75-unit centreline spans).
async function dimensionedRoom(labels, { split = false } = {}) {
  const pdf = new PdfCanvas(400, 300);
  const o = { x: 100, y: 100 }, t = 5;
  pdf.lineWidth(0.6).stroke([0, 0, 0]);
  pdf.polygon(rect(o.x - t / 2, o.y - t / 2, o.x + 100 + t / 2, o.y + 75 + t / 2)).doStroke();
  pdf.polygon(rect(o.x + t / 2, o.y + t / 2, o.x + 100 - t / 2, o.y + 75 - t / 2)).doStroke();
  pdf.lineWidth(0.25).stroke([80, 80, 80]);
  // horizontal dimension 30 units above, ticks at both ends
  const y = o.y - 30;
  if (split) {
    pdf.line({ x: o.x, y }, { x: o.x + 40, y }).doStroke();
    pdf.line({ x: o.x + 60, y }, { x: o.x + 100, y }).doStroke();
  } else pdf.line({ x: o.x, y }, { x: o.x + 100, y }).doStroke();
  for (const x of [o.x, o.x + 100]) pdf.line({ x: x - 2, y: y + 2 }, { x: x + 2, y: y - 2 }).doStroke();
  const x = o.x - 30;
  pdf.line({ x, y: o.y }, { x, y: o.y + 75 }).doStroke();
  for (const yy of [o.y, o.y + 75]) pdf.line({ x: x - 2, y: yy + 2 }, { x: x + 2, y: yy - 2 }).doStroke();
  const size = 6, w0 = labels[0].length * size * 0.556, w1 = labels[1].length * size * 0.556;
  pdf.text(labels[0], o.x + 50 - w0 / 2, split ? y + size * 0.35 : y - 1.5, size);
  pdf.text(labels[1], x - 1.5, o.y + 37.5 + w1 / 2, size, [0, 0, 0], Math.PI / 2);
  return readPdfPrimitives(writePdf(pdf));
}

test("bare millimetre dimensions: the geometry decides mm over cm", async () => {
  const plan = recognizeVectorPlan(await dimensionedRoom(["4000", "3000"]));
  assert.equal(plan.scale.source, "dimensions");
  assert.ok(near(plan.cmPerUnit, 4, 0.05), `cm/unit ${plan.cmPerUnit}`);
  assert.ok(plan.walls.length >= 4 && plan.walls.every((w) => near(w.thickness, 20, 1)));
  // and plain cm labels still read as cm
  const cm = recognizeVectorPlan(await dimensionedRoom(["400", "300"]));
  assert.ok(near(cm.cmPerUnit, 4, 0.05));
});

test("a dimension line broken around its label still measures", async () => {
  const prims = await dimensionedRoom(["4.00", "3.00"], { split: true });
  const labels = measureDimensionLabels(prims.texts, collectSegments(prims).segments);
  const top = labels.find((e) => e.text === "4.00");
  assert.ok(top, "the split horizontal dimension is read");
  assert.ok(near(top.spanUnits, 100, 0.5), `span ${top.spanUnits}`);
});

test("only dimensions behind the chosen scale become annotation", () => {
  const seg = (x1, y1, x2, y2) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
  const goodLine = seg(0, 0, 200, 0), goodTicks = [seg(-3, 3, 3, -3), seg(197, 3, 203, -3)];
  const good2 = seg(0, 100, 100, 100), good2Ticks = [seg(-3, 103, 3, 97), seg(97, 103, 103, 97)];
  // an odd label elsewhere, disagreeing with the others
  const oddLine = seg(0, 300, 50, 300), oddTicks = [seg(-3, 303, 3, 297), seg(47, 303, 53, 297)];
  const label = (str, cx, y) => ({ str, x: cx - str.length * 2.2, y: y - 2, angle: 0, size: 8, width: str.length * 4.4 });
  const s = dimensionScale(
    [label("400", 100, 0), label("200", 50, 100), label("777", 25, 300)],
    [goodLine, ...goodTicks, good2, ...good2Ticks, oddLine, ...oddTicks],
  );
  assert.ok(near(s.cmPerUnit, 2, 1e-9));
  const ann = new Set(s.annotation);
  for (const x of [goodLine, ...goodTicks, good2, ...good2Ticks]) assert.ok(ann.has(x));
  for (const x of [oddLine, ...oddTicks]) assert.ok(!ann.has(x), "rejected evidence stays geometry");
});

test("without any scale, ordinary parallel walls are not taken for hatching", () => {
  // a 600×400 building with three parallel partitions, nothing to measure
  const paths = [...building(200, 200, 800, 600, 10)];
  for (const x of [350, 500, 650]) paths.push(...wallFaces(x, 205, x, 595, 8));
  const unscaled = recognizeVectorPlan(sheet(paths, [], 1000));
  const scaled = recognizeVectorPlan(sheet(paths, [], 1000), { cmPerUnit: 2 });
  assert.equal(unscaled.scale.source, "none");
  assert.equal(unscaled.walls.length, scaled.walls.length);
  assert.ok(scaled.walls.length >= 7);
});

test("a single enclosed room can provide the scale", () => {
  const walls = [
    { a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, thickness: 10 },
    { a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, thickness: 10 },
    { a: { x: 400, y: 300 }, b: { x: 0, y: 300 }, thickness: 10 },
    { a: { x: 0, y: 300 }, b: { x: 0, y: 0 }, thickness: 10 },
  ];
  // net 390 × 290 units; at 2 cm/unit that is 45.24 m²
  const s = roomLabelScale([{ str: "45.24 m²", x: 180, y: 150, angle: 0, size: 8, width: 30 }, { str: "45.24 m²", x: 180, y: 160, angle: 0, size: 8, width: 30 }], walls);
  assert.ok(s, "a room filling most of the grid still floods");
  assert.ok(near(s.cmPerUnit, 2, 0.03), `cm/unit ${s && s.cmPerUnit}`);
});

// --- robustness / performance ------------------------------------------------

test("20 000 hatch lines: no stack overflow, removed as hatching", () => {
  const paths = [];
  for (let i = 0; i < 20000; i++) paths.push(line(0, i * 0.5, 4, i * 0.5, { lineWidth: 0.2 }));
  const t0 = performance.now();
  const plan = recognizeVectorPlan(sheet(paths, [], 12000), { cmPerUnit: 1 });
  assert.equal(plan.walls.length, 0);
  assert.ok(performance.now() - t0 < 15000, "finishes in seconds");
});

test("50 000 segments recognize in seconds, not minutes", () => {
  // a 25 × 25 grid of rooms with double-line walls plus diagonal hatching
  const paths = [];
  const N = 25, S = 100, T = 6, M = 250; // M: margin off the sheet edge
  for (let i = 0; i <= N; i++) {
    paths.push(...wallFaces(M + i * S, M, M + i * S, M + N * S, T));
    paths.push(...wallFaces(M, M + i * S, M + N * S, M + i * S, T));
  }
  let n = paths.length * 1;
  for (let i = 0; n < 50000; i++, n++) {
    const x = (i * 7) % (N * S), y = Math.floor((i * 7) / (N * S)) * 3;
    paths.push(line(M + x, M + (y % (N * S)), M + x + 2, M + (y % (N * S)) + 2, { lineWidth: 0.1 }));
  }
  const t0 = performance.now();
  const plan = recognizeVectorPlan(sheet(paths, [], 3000 + 2 * M), { cmPerUnit: 1 });
  const ms = performance.now() - t0;
  assert.ok(plan.walls.length >= 2 * (N + 1), `walls ${plan.walls.length}`);
  assert.ok(ms < 30000, `took ${Math.round(ms)} ms`);
});

// --- second review: partial fixes and rewrite regressions --------------------

test("50 000 collinear pieces on one offset stay fast", () => {
  const paths = [];
  for (let i = 0; i < 50000; i++) paths.push(line(100 + i * 5, 500, 104 + i * 5, 500));
  const t0 = performance.now();
  recognizeVectorPlan(sheet(paths, [], 300000), { cmPerUnit: 1 });
  assert.ok(performance.now() - t0 < 5000, `took ${Math.round(performance.now() - t0)} ms`);
});

test("a triangular clip hides what lies outside the triangle; an empty clip hides all", () => {
  const { paths } = primitivesFromOperatorList(list(
    [OPS.save], [OPS.clip], packed(OPS.endPath, [0, 0, 0, 1, 100, 0, 1, 0, 100, 4]),
    packed(OPS.stroke, [0, 10, 80, 1, 90, 80]), // inside the bbox, outside the triangle beyond x = 20
    [OPS.restore],
    [OPS.save], [OPS.clip], packed(OPS.endPath, []),
    packed(OPS.stroke, [0, 0, 0, 1, 50, 50]),
    [OPS.restore],
  ), OPS);
  assert.equal(paths.length, 1);
  const xs = paths[0].subpaths[0].points.map((p) => p.x);
  assert.ok(near(Math.max(...xs), 20, 1e-6), `visible to x = ${Math.max(...xs)}`);
});

test("a single-line drawing at a small scale: thin strokes are its walls", () => {
  // 1 pt pens at 20 cm per unit: every line is a 20 cm wall
  const prims = sheet([stroke(rect(100, 100, 400, 300), { closed: true, lineWidth: 1 })]);
  const plan = recognizeVectorPlan(prims, { cmPerUnit: 20 });
  assert.equal(plan.walls.length, 4);
  for (const w of plan.walls) assert.ok(near(w.thickness, 20, 0.01));
});

test("mm dimensions stay mm with furniture lines on the sheet", async () => {
  const prims = await dimensionedRoom(["4000", "3000"]);
  // two thin parallel lines 0.5 units apart inside the room (a shelf)
  prims.paths.push(line(130, 150, 160, 150, { lineWidth: 0.2, stroke: [120, 120, 120] }));
  prims.paths.push(line(130, 150.5, 160, 150.5, { lineWidth: 0.2, stroke: [120, 120, 120] }));
  const plan = recognizeVectorPlan(prims);
  assert.ok(near(plan.cmPerUnit, 4, 0.05), `cm/unit ${plan.cmPerUnit}`);
});

test("poché sheets keep unfilled partitions that span between walls", () => {
  const dark = [40, 40, 40];
  const slab = (x0, y0, x1, y1) => ({ subpaths: [{ points: rect(x0, y0, x1, y1), curvedSeg: [false, false, false, false], closed: true, curved: false }], stroke: null, fill: dark, lineWidth: 0, dashed: false, evenOdd: false });
  // filled 700×600 perimeter (20 thick)
  const perimeter = [slab(100, 100, 800, 120), slab(100, 680, 800, 700), slab(100, 100, 120, 700), slab(780, 100, 800, 700)];
  const outline = [...perimeter, ...wallFaces(450, 120, 450, 680, 10)];
  const plan = recognizeVectorPlan(sheet(outline), { cmPerUnit: 1 });
  assert.ok(plan.walls.some((w) => near(w.a.x, 450, 1) && near(w.b.x, 450, 1)), "outline partition kept");
  const stroked = [...perimeter, line(450, 120, 450, 680, { lineWidth: 10 })];
  const plan2 = recognizeVectorPlan(sheet(stroked), { cmPerUnit: 1 });
  assert.ok(plan2.walls.some((w) => near(w.a.x, 450, 1) && near(w.b.x, 450, 1)), "wide-stroke partition kept");
  // …while a free-standing pair of lines (a sofa back) is not
  const sofa = [...perimeter, line(300, 300, 500, 300), line(300, 325, 500, 325)];
  const plan3 = recognizeVectorPlan(sheet(sofa), { cmPerUnit: 1 });
  assert.ok(!plan3.walls.some((w) => w.a.y > 290 && w.a.y < 335 && w.b.y > 290 && w.b.y < 335), "sofa is not a wall");
});

test("angle clusters do not split a pair (other directions, the 0°/180° wrap)", () => {
  const tilted = (ox, oy, deg, len = 300) => {
    const a = (deg * Math.PI) / 180;
    return line(ox, oy, ox + len * Math.cos(a), oy + len * Math.sin(a));
  };
  // faces at 0° and +0.4°, with an unrelated −0.4° line far away
  const plan = recognizeVectorPlan(sheet([tilted(500, 500, 0), tilted(500, 510, 0.4), tilted(500, 1500, -0.4)]), { cmPerUnit: 2 });
  assert.equal(plan.walls.length, 1);
  // faces at −0.51° and −0.49° (either side of the fold)
  const plan2 = recognizeVectorPlan(sheet([tilted(500, 500, -0.51), tilted(500, 510, -0.49)]), { cmPerUnit: 2 });
  assert.equal(plan2.walls.length, 1);
});

test("dense lighter lines between two faces do not merge the faces", () => {
  const paths = [line(100, 490, 400, 490), line(100, 510, 400, 510)];
  for (let i = 1; i < 80; i++) paths.push(line(100, 490 + i * 0.25, 400, 490 + i * 0.25, { lineWidth: 0.1, stroke: [170, 170, 170] }));
  const plan = recognizeVectorPlan(sheet(paths), { cmPerUnit: 1 });
  assert.equal(plan.walls.length, 1);
  assert.ok(near(plan.walls[0].thickness, 20, 0.5), `thickness ${plan.walls[0].thickness}`);
});

test("a staggered run of wall pieces never spans a gap without an opening", () => {
  // six 100-unit wall strokes, 20 thick, 80-unit gaps, each 5 units lower
  const paths = [];
  for (let i = 0; i < 6; i++) paths.push(line(100 + i * 180, 500 + i * 5, 200 + i * 180, 500 + i * 5, { lineWidth: 20 }));
  const plan = recognizeVectorPlan(sheet(paths), { cmPerUnit: 1 });
  for (let i = 0; i < 5; i++) {
    const gx = 240 + i * 180, gy = 502.5 + i * 5;
    const spanned = plan.walls.some((w) => Math.min(w.a.x, w.b.x) < gx - 30 && Math.max(w.a.x, w.b.x) > gx + 30 &&
      Math.abs((w.a.y + w.b.y) / 2 - gy) < 15);
    const opening = plan.openings.some((o) => Math.abs(o.center.x - gx) < 30);
    assert.ok(!spanned || opening, `gap ${i} is covered by a wall with no opening`);
  }
});

// --- real sheets ----------------------------------------------------------------

test("door swings flattened to polylines are still doors", () => {
  const base = [...wallFaces(500, 500, 600, 500, 10), ...wallFaces(680, 500, 900, 500, 10), ...wallFaces(500, 300, 500, 700, 10)];
  // a quarter circle hinged at (600, 505), radius 80, as 12 straight pieces
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    pts.push({ x: 600 + 80 * Math.sin(a), y: 505 + 80 * Math.cos(a) });
  }
  const plan = recognizeVectorPlan(sheet([...base, stroke(pts, { lineWidth: 0.3 })]), { cmPerUnit: 1 });
  const door = plan.openings.find((o) => o.type === "door");
  assert.ok(door, "the polyline swing makes the gap a door");
  assert.equal(door.swing, 1);
  // a plain rectangle (90° turns) is never taken for an arc
  const { arcs } = collectSegments({ paths: [stroke(rect(0, 0, 50, 30), { closed: true })] });
  assert.equal(arcs.length, 0);
});

test("door swings exploded into separate two-point lines are still doors", () => {
  const base = [...wallFaces(500, 500, 600, 500, 10), ...wallFaces(680, 500, 900, 500, 10), ...wallFaces(500, 300, 500, 700, 10)];
  const pieces = [];
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * (Math.PI / 2), a1 = ((i + 1) / 12) * (Math.PI / 2);
    pieces.push(line(600 + 80 * Math.sin(a0), 495 - 80 * Math.cos(a0), 600 + 80 * Math.sin(a1), 495 - 80 * Math.cos(a1), { lineWidth: 0.36 }));
  }
  const plan = recognizeVectorPlan(sheet([...base, ...pieces]), { cmPerUnit: 1 });
  const door = plan.openings.find((o) => o.type === "door");
  assert.ok(door, "the exploded swing makes the gap a door");
  assert.equal(door.swing, -1);
});

// --- tuned against real sheets (bench/plans ground truth) ----------------------

test("a pair of thin-pen lines is not a wall when the sheet cuts walls in a heavy pen", () => {
  // heavy-pen (2pt) walls of a room, plus a bathtub drawn in a 0.3pt pen whose
  // two long edges are a wall-like 70 cm apart
  const heavy = { lineWidth: 2 };
  const room = [
    ...wallFaces(100, 100, 700, 100, 10).map((p) => ({ ...p, ...heavy })),
    ...wallFaces(100, 500, 700, 500, 10).map((p) => ({ ...p, ...heavy })),
    ...wallFaces(100, 100, 100, 500, 10).map((p) => ({ ...p, ...heavy })),
    ...wallFaces(700, 100, 700, 500, 10).map((p) => ({ ...p, ...heavy })),
  ];
  const tub = [line(300, 300, 470, 300, { lineWidth: 0.3 }), line(300, 322, 470, 322, { lineWidth: 0.3 })];
  const plan = recognizeVectorPlan(sheet([...room, ...tub]), { cmPerUnit: 1 });
  assert.equal(plan.walls.length, 4, "only the room's four walls");
  assert.ok(!plan.walls.some((w) => w.a.y > 290 && w.a.y < 330), "the bathtub is not a wall");
  // drawn all in one pen, the same lines still pair (nothing to tell apart)
  const flat = recognizeVectorPlan(sheet([...room.map((p) => ({ ...p, lineWidth: 0.5 })), ...tub.map((p) => ({ ...p, lineWidth: 0.5 }))]), { cmPerUnit: 1 });
  assert.ok(flat.walls.length >= 4);
});

test("printed scales: 1:50, 1:100 @ A1, schaal 1 : 50, and 1/4\" = 1'-0\"", async () => {
  const { scaleNotes } = await import("../js/plan_recog/dimensions.js");
  const notes = scaleNotes([{ str: "1:50" }, { str: "Scale 1:100 @ A1" }, { str: "schaal 1 : 50" }, { str: `1/4" = 1'-0"` }, { str: "20/11/2025" }, { str: "Plan 1101" }]);
  assert.deepEqual(notes.map((n) => n.ratio).sort((a, b) => a - b), [48, 50, 100]);
  assert.ok(near(notes.find((n) => n.ratio === 50).cmPerUnit, 1.763889, 1e-5));
});

test("a printed scale the dimensions agree with replaces their reading", async () => {
  // the dimensions read 18.0 cm/unit, 2% off a 1:500 sheet (17.64); the
  // printed 1:500 wins, exactly
  const prims = await dimensionedRoom(["1800", "1350"]);
  prims.texts.push({ str: "1:500", x: 10, y: 10, angle: 0, size: 8, width: 16 });
  const withNote = recognizeVectorPlan(prims);
  assert.equal(withNote.scale.source, "scale-note");
  assert.ok(near(withNote.cmPerUnit, 500 * 2.54 / 72, 1e-6));
});

test("Israeli and Dutch dimension decorations are read", () => {
  const cm = (s) => parseLength(s).map((c) => Math.round(c.cm * 100) / 100);
  assert.deepEqual(cm("-283-"), [283, 28.3]);
  assert.deepEqual(cm("◀3558 ▶"), [3558, 355.8]);
  assert.deepEqual(cm("-3.45-"), [345]);
});

test("a seam between two filled layers (concrete + insulation) is one wall, not two", () => {
  const dark = [40, 40, 40];
  const slab = (x0, y0, x1, y1) => ({ subpaths: [{ points: rect(x0, y0, x1, y1), curvedSeg: [false, false, false, false], closed: true, curved: false }], stroke: null, fill: dark, lineWidth: 0, dashed: false, evenOdd: false });
  // the top wall is 20 of concrete plus 10 of insulation, drawn as two fills
  // that meet at y = 120, with the seam also stroked
  const layered = [slab(100, 100, 800, 120), slab(100, 120, 800, 130), line(100, 120, 800, 120, { lineWidth: 0.3 }),
    slab(100, 680, 800, 710), slab(100, 100, 130, 710), slab(770, 100, 800, 710)];
  const plan = recognizeVectorPlan(sheet(layered), { cmPerUnit: 1 });
  const top = plan.walls.filter((w) => w.a.y < 140 && w.b.y < 140 && Math.abs(w.a.x - w.b.x) > 300);
  assert.equal(top.length, 1, "one top wall");
  assert.ok(near(top[0].thickness, 30, 2), `full thickness, got ${top[0].thickness}`);
});

test("a balcony parapet drawn in a lighter pen than the cut walls is not a wall", () => {
  // 2pt cut walls; the balcony edge below the cut is a 1.4pt pair of lines,
  // and short 2pt door leaves must not raise the bar above the walls' pen
  const heavy = { lineWidth: 2 };
  const room = [
    ...wallFaces(100, 100, 700, 100, 20).map((p) => ({ ...p, ...heavy })),
    ...wallFaces(100, 500, 700, 500, 20).map((p) => ({ ...p, ...heavy })),
    ...wallFaces(100, 100, 100, 500, 20).map((p) => ({ ...p, ...heavy })),
    ...wallFaces(700, 100, 700, 500, 20).map((p) => ({ ...p, ...heavy })),
  ];
  const parapet = [...wallFaces(100, 650, 700, 650, 15, { lineWidth: 1.4 }), ...wallFaces(100, 500, 100, 650, 15, { lineWidth: 1.4 }), ...wallFaces(700, 500, 700, 650, 15, { lineWidth: 1.4 })];
  const plan = recognizeVectorPlan(sheet([...room, ...parapet]), { cmPerUnit: 1 });
  assert.equal(plan.walls.length, 4, "only the room's four walls");
  assert.ok(!plan.walls.some((w) => w.a.y > 520 || w.b.y > 520), "nothing on the balcony");
});

test("an interior dimension measured face to face does not make the faces annotation", () => {
  // a 0.25pt dimension line spanning between two 2pt wall faces, no ticks
  // of its own: the faces bound its span but are walls, not ticks
  const seg = (x1, y1, x2, y2, lineWidth) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, lineWidth });
  const faces = [seg(100, 60, 100, 140, 2), seg(300, 60, 300, 140, 2)];
  // extension lines: from the object, ending just past the dimension line
  const ext = [seg(100, 40, 100, 103, 0.25), seg(300, 40, 300, 103, 0.25)];
  // outline wall faces in the dimension's own pen, running on both ways
  const sameFaces = [seg(100, 60, 100, 140, 0.25), seg(300, 60, 300, 140, 0.25)];
  const dim = seg(100, 100, 300, 100, 0.25);
  const label = { str: "350", x: 193.4, y: 98, angle: 0, size: 8, width: 13.2 };
  const heavy = measureDimensionLabels([label], [dim, ...faces]).find((e) => e.text === "350");
  assert.ok(heavy && near(heavy.spanUnits, 200, 0.5), "the span still reads face to face");
  assert.equal(heavy.ticks.length, 0, "heavy-pen faces are not ticks");
  const own = measureDimensionLabels([label], [dim, ...ext]).find((e) => e.text === "350");
  assert.equal(own.ticks.length, 2, "extension lines are");
  const same = measureDimensionLabels([label], [dim, ...sameFaces]).find((e) => e.text === "350");
  assert.ok(same && near(same.spanUnits, 200, 0.5));
  assert.equal(same.ticks.length, 0, "faces in the dimension's own pen are not ticks either");
});

test("a layered wall face stack is not hatching; an evenly pitched hatch is", () => {
  const hair = (c) => lineOf({ a: { x: 0, y: c }, b: { x: 200, y: c }, lineWidth: 0.2 });
  // two wall faces each drawn as three hairlines 0.7 apart, plus lining and
  // cladding lines at uneven spacing (Vinci, Waterjuffers)
  const layered = [577.4, 578.2, 578.9, 581.6, 582.4, 583.1, 593.2, 593.9, 596.2, 597.3].map(hair);
  assert.equal(removeHatching(layered, 8.5).length, layered.length);
  const hatch = [0, 3, 6, 9, 12, 15, 18].map((c) => hair(400 + c));
  assert.equal(removeHatching(hatch, 8.5).length, 0);
});

test("a cavity wall's two filled leaves become one wall", () => {
  const dark = [40, 40, 40];
  const slab = (x0, y0, x1, y1) => ({ subpaths: [{ points: rect(x0, y0, x1, y1), curvedSeg: [false, false, false, false], closed: true, curved: false }], stroke: null, fill: dark, lineWidth: 0, dashed: false, evenOdd: false });
  // top wall: 20 inner leaf, 5 cavity, 11 outer leaf
  const cavity = [slab(100, 100, 800, 120), slab(100, 84, 800, 95), slab(100, 680, 800, 700), slab(100, 100, 120, 700), slab(780, 100, 800, 700)];
  const plan = recognizeVectorPlan(sheet(cavity), { cmPerUnit: 1 });
  const top = plan.walls.filter((w) => w.a.y < 130 && w.b.y < 130 && Math.abs(w.a.x - w.b.x) > 300);
  assert.equal(top.length, 1, "one top wall");
  assert.ok(near(top[0].thickness, 36, 1.5), `through all layers, got ${top[0].thickness}`);
});

test("a double door (two half-width leaves) joins its wall", () => {
  const base = [...wallFaces(0, 0, 100, 0, 10), ...wallFaces(260, 0, 500, 0, 10), ...wallFaces(0, -200, 0, 200, 10), ...wallFaces(500, -200, 500, 200, 10)];
  const leaf = (hx, dir) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2);
      pts.push({ x: hx + dir * 80 * Math.sin(a), y: 80 * Math.cos(a) });
    }
    return { subpaths: [{ points: pts, curvedSeg: pts.map((_, i) => i > 0), closed: false, curved: true }], stroke: [0, 0, 0], fill: null, lineWidth: 0.3, dashed: false };
  };
  const shift = (paths) => paths.map((p) => ({ ...p, subpaths: p.subpaths.map((s) => ({ ...s, points: s.points.map((q) => ({ x: q.x + 500, y: q.y + 500 })) })) }));
  const plan = recognizeVectorPlan(sheet(shift([...base, leaf(100, 1), leaf(260, -1)])), { cmPerUnit: 1 });
  const door = plan.openings.find((o) => o.type === "door");
  assert.ok(door && near(door.width, 160, 1), "a 160 door");
  assert.ok(plan.walls.some((w) => Math.min(w.a.x, w.b.x) <= 505 && Math.max(w.a.x, w.b.x) >= 755 && near(w.a.y, 500, 1)), "the wall runs through it");
});

test("typographic scale notes are read, with where each is printed", async () => {
  const { scaleNotes } = await import("../js/plan_recog/dimensions.js");
  const notes = scaleNotes([{ str: "1/4” = 1’-0”", x: 600, y: 880 }, { str: "1/8” = 1’-0”", x: 250, y: 1270 }, { str: "1/8” = 1’-0”", x: 770, y: 1140 }]);
  assert.deepEqual(notes.map((n) => n.ratio).sort((a, b) => a - b), [48, 96]);
  assert.equal(notes.find((n) => n.ratio === 96).at.length, 2);
});

// --- review round 3 (Codex) --------------------------------------------------

const darkSlab = (x0, y0, x1, y1) => ({ subpaths: [{ points: rect(x0, y0, x1, y1), curvedSeg: [false, false, false, false], closed: true, curved: false }], stroke: null, fill: [40, 40, 40], lineWidth: 0, dashed: false, evenOdd: false });

test("a wall drawn as many thin adjacent fill strips is still a wall, not shading", () => {
  // at 8.5 cm/unit: seven strips 0.4–0.95 units wide make one 4.35-unit wall
  const widths = [0.4, 0.45, 0.5, 0.55, 0.6, 0.9, 0.95];
  const strips = [];
  let y = 50;
  for (const w of widths) { strips.push(darkSlab(10, y, 110, y + w)); y += w; }
  const whole = recognizeVectorPlan(sheet([darkSlab(10, 50, 110, y)], [], 400), { cmPerUnit: 8.5 });
  const split = recognizeVectorPlan(sheet(strips, [], 400), { cmPerUnit: 8.5 });
  assert.equal(whole.walls.length, 1);
  assert.equal(split.walls.length, 1, "the strips read as the same wall");
  assert.ok(near(split.walls[0].thickness, whole.walls[0].thickness, 0.5));
});

test("cavity leaves merge only where they overlap; each leaf's own run stays", () => {
  // inner leaf x 100–800 (20 thick), outer leaf x 200–900 (11 thick), 5 cavity
  const plan = recognizeVectorPlan(sheet([darkSlab(100, 100, 800, 120), darkSlab(200, 84, 900, 95)]), { cmPerUnit: 1 });
  const at = (x) => plan.walls.filter((w) => Math.min(w.a.x, w.b.x) <= x && Math.max(w.a.x, w.b.x) >= x);
  assert.ok(at(500).some((w) => near(w.thickness, 36, 1.5)), "one wall through all layers in the overlap");
  assert.ok(at(150).every((w) => w.thickness < 25), "no invented thickness where only the inner leaf runs");
  assert.ok(at(150).length >= 1, "the inner leaf's own run is kept");
  assert.ok(at(850).every((w) => w.thickness < 25), "nor where only the outer leaf runs");
});

test("a double door needs both leaves closing into the gap, swinging one way", () => {
  const base = [...wallFaces(0, 0, 100, 0, 10), ...wallFaces(260, 0, 500, 0, 10), ...wallFaces(0, -200, 0, 200, 10), ...wallFaces(500, -200, 500, 200, 10)];
  // quarter arc of radius 80 about (hx, 0) from angle a0 to a1 (radians)
  const arc = (hx, a0, a1) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = a0 + ((a1 - a0) * i) / 16; pts.push({ x: hx + 80 * Math.cos(a), y: 80 * Math.sin(a) }); }
    return { subpaths: [{ points: pts, curvedSeg: pts.map((_, i) => i > 0), closed: false, curved: true }], stroke: [0, 0, 0], fill: null, lineWidth: 0.3, dashed: false };
  };
  const shift = (paths) => paths.map((p) => ({ ...p, subpaths: p.subpaths.map((s) => ({ ...s, points: s.points.map((q) => ({ x: q.x + 500, y: q.y + 500 })) })) }));
  const doors = (paths) => recognizeVectorPlan(sheet(shift([...base, ...paths])), { cmPerUnit: 1 }).openings.filter((o) => o.type === "door");
  const H = Math.PI / 2;
  // closing into the gap (from the leaf at 90° down to 0° / 180°), same side
  const good = doors([arc(100, H, 0), arc(260, H, 2 * H)]);
  assert.ok(good.some((o) => o.double), "a real double door");
  // swinging away from the gap: each arc closes outward, over the wall
  assert.ok(!doors([arc(100, H, 2 * H), arc(260, H, 0)]).some((o) => o.double), "leaves swinging away are not a door");
  // opposite sides
  assert.ok(!doors([arc(100, H, 0), arc(260, -H, -2 * H)]).some((o) => o.double), "leaves on opposite sides are not one double door");
  // and the planner gets a double door
  const planner = vectorPlanToPlanner(recognizeVectorPlan(sheet(shift([...base, arc(100, H, 0), arc(260, H, 2 * H)])), { cmPerUnit: 1 }));
  assert.ok(planner.openings.some((o) => o.isDouble), "planner opening is a double door");
});

test("captions tied for distance to the plan give no scale bonus", () => {
  // a room with only printed scales to go on; door swings of 50 units say
  // 1:50 (88 cm leaves), not 1:100 (176 cm)
  const swing = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * (Math.PI / 2); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    return { subpaths: [{ points: pts, curvedSeg: pts.map((_, i) => i > 0), closed: false, curved: true }], stroke: [0, 0, 0], fill: null, lineWidth: 0.3, dashed: false };
  };
  const paths = [...building(100, 100, 500, 400, 10), swing(150, 150, 50), swing(300, 150, 50), swing(400, 300, 25)];
  const note = (str, x, y) => ({ str, x, y, angle: 0, size: 8, width: 20 });
  const unplaced = recognizeVectorPlan(sheet(paths, [note("1:100", NaN, NaN), note("1:50", NaN, NaN)]));
  assert.ok(near(unplaced.cmPerUnit, 50 * 2.54 / 72, 1e-6), "door swings pick 1:50");
  // both captions inside the plan's box: placement cannot tell them apart
  const tied = recognizeVectorPlan(sheet(paths, [note("1:100", 200, 200), note("1:50", 300, 250)]));
  assert.ok(near(tied.cmPerUnit, unplaced.cmPerUnit, 1e-9), `tied captions changed the scale to ${tied.cmPerUnit}`);
});

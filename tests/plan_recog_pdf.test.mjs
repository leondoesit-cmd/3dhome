// Vector-PDF floor-plan import (js/plan_recog/): label parsing, operator-list
// geometry, and end-to-end recognition of synthetic PDFs drawn the way CAD
// packages export them — measured against exact ground truth, then converted
// into the planner's own wall graph.
import test from "node:test";
import assert from "node:assert/strict";

import { parseLength, dimensionScale } from "../js/plan_recog/dimensions.js";
import { parseArea, parseRoomSize } from "../js/plan_recog/room_scale.js";
import { primitivesFromOperatorList, textFromContent } from "../js/plan_recog/pdf_primitives.js";
import { recognizeVectorPlan, planToCentimetres, vectorPlanToPlanner } from "../js/plan_recog/vector_plan.js";
import { synthPdf } from "../tools/plan_synth_pdf.mjs";
import { readPdfPrimitives } from "../tools/plan_pdf_view.mjs";
import { loadPdfjs } from "../tools/pdfjs_node.mjs";
import { PdfCanvas, writePdf } from "../tools/pdf_write.mjs";
import { scorePlan, plannerToRecord } from "../tools/plan_metrics.mjs";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test("length labels: every unit a drafter writes, ambiguity kept", () => {
  const cms = (s) => parseLength(s).map((c) => Math.round(c.cm * 100) / 100);
  assert.deepEqual(cms("345"), [345, 34.5]); // cm, or mm
  assert.deepEqual(cms("3.45"), [345, 3.45].filter((v) => v >= 20)); // m (cm reading is too small)
  assert.deepEqual(cms("3,45"), [345]);
  assert.deepEqual(cms("2400 mm"), [240]);
  assert.deepEqual(cms("4.2m"), [420]);
  assert.deepEqual(cms(`12'6"`), [381]);
  assert.deepEqual(cms("12' - 6\""), [381]);
  assert.deepEqual(cms(`9'`), [274.32]);
  assert.equal(parseLength("3.45")[0].preferred, true);
  assert.deepEqual(parseLength("12.4 m²"), []);
  assert.deepEqual(parseLength("Bedroom"), []);
  assert.deepEqual(parseLength("+3.20"), []);
});

test("room labels: areas in m², sq ft and Hebrew, sizes as W x L", () => {
  assert.equal(parseArea("12.4 m²"), 124000);
  assert.equal(parseArea("12,4 m2"), 124000);
  assert.equal(parseArea('12.4 מ"ר'), 124000);
  assert.ok(near(parseArea("134 sq ft"), 134 * 929.0304));
  assert.equal(parseArea("345"), null);
  const size = parseRoomSize("3.40 x 4.20");
  assert.equal(size[0][0].cm, 340);
  assert.equal(size[1][0].cm, 420);
  assert.ok(parseRoomSize(`12'6" × 10'`));
  assert.equal(parseRoomSize("Kitchen"), null);
});

test("dimension scale: label over its span between ticks", () => {
  // a 200-unit dimension line, ticks at 0 / 80 / 200, labels "160" and "240" (cm)
  const segs = [
    { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } },
    ...[0, 80, 200].map((x) => ({ a: { x: x - 3, y: 3 }, b: { x: x + 3, y: -3 } })),
  ];
  const label = (str, x0) => ({ str, x: x0, y: -2, angle: 0, size: 8, width: str.length * 4.4 });
  const s = dimensionScale([label("160", 33), label("240", 133)], segs);
  assert.ok(near(s.cmPerUnit, 2, 1e-9));
  assert.equal(s.support, 2);
  assert.equal(s.unit, "cm");
});

test("operator lists: transforms, form XObjects and both path encodings", () => {
  const OPS = { save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, closePath: 18, rectangle: 19,
    stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27,
    endPath: 28, setLineWidth: 2, setDash: 6, setStrokeRGBColor: 58, setFillRGBColor: 59, constructPath: 91,
    paintFormXObjectBegin: 74, paintFormXObjectEnd: 75, paintImageXObject: 85 };
  const view = [1, 0, 0, -1, 0, 100]; // y-up page of height 100 → y-down sheet
  const list = {
    fnArray: [OPS.setLineWidth, OPS.save, OPS.transform, OPS.setStrokeRGBColor, OPS.constructPath, OPS.restore,
      OPS.paintFormXObjectBegin, OPS.constructPath, OPS.paintFormXObjectEnd,
      OPS.constructPath, OPS.fill, OPS.paintImageXObject],
    argsArray: [[0.5], null, [2, 0, 0, 2, 10, 10], ["#ff0000"], [OPS.stroke, [new Float32Array([0, 0, 0, 1, 5, 0])], null], null,
      [[1, 0, 0, 1, 50, 0], null], [OPS.fill, [new Float32Array([0, 0, 0, 1, 1, 0, 1, 1, 1, 4])], null], null,
      [[OPS.rectangle], [1, 2, 3, 4], null], null, ["img"]],
  };
  const { paths, images } = primitivesFromOperatorList(list, OPS, view);
  assert.equal(images, 1);
  assert.equal(paths.length, 3);
  // transformed stroke: (0,0)→(10,10)→sheet (10,90); (5,0)→(20,10)→(20,90)
  assert.deepEqual(paths[0].subpaths[0].points, [{ x: 10, y: 90 }, { x: 20, y: 90 }]);
  assert.deepEqual(paths[0].stroke, [255, 0, 0]);
  assert.equal(paths[0].lineWidth, 1); // 0.5 under a 2× transform
  // form XObject matrix applies inside the form only
  assert.deepEqual(paths[1].subpaths[0].points[1], { x: 51, y: 100 });
  assert.equal(paths[1].fill !== null, true);
  // legacy (pdf.js < 5) path: separate paint op, `re` expanded, closed
  assert.equal(paths[2].subpaths[0].closed, true);
  assert.deepEqual(paths[2].subpaths[0].points[2], { x: 4, y: 94 });

  const texts = textFromContent({ items: [{ str: "345", transform: [0, 9, -9, 0, 30, 40], width: 15 }] }, view);
  assert.ok(near(texts[0].angle, -Math.PI / 2), "text reading bottom-to-top runs up the sheet");
  assert.ok(near(texts[0].size, 9));
  assert.deepEqual([texts[0].x, texts[0].y], [30, 60]);
});

test("pdf.js extraction keeps arcs as curves and resolves `cm`", async () => {
  const pdf = new PdfCanvas(200, 200);
  pdf.lineWidth(1).stroke([0, 0, 0]).line({ x: 10, y: 10 }, { x: 110, y: 10 }).doStroke();
  pdf.save();
  pdf.ops.push("1 0 0 1 50 -20 cm"); // PDF space: shift right 50, down 20
  pdf.line({ x: 0, y: 100 }, { x: 10, y: 100 }).doStroke();
  pdf.restore();
  pdf.arc({ x: 100, y: 100 }, 40, 0, Math.PI / 2).doStroke();
  const prims = await readPdfPrimitives(writePdf(pdf));
  const pts = prims.paths.map((p) => p.subpaths[0]);
  assert.deepEqual(pts[0].points.map((p) => [p.x, p.y]), [[10, 10], [110, 10]]);
  assert.deepEqual(pts[1].points.map((p) => [Math.round(p.x), Math.round(p.y)]), [[50, 120], [60, 120]]);
  assert.equal(pts[2].curved, true);
  for (const p of pts[2].points) assert.ok(near(Math.hypot(p.x - 100, p.y - 100), 40, 0.05));
  assert.ok((await loadPdfjs()).OPS.constructPath > 0);
});

// Doors keep their hinge side and swing: compare in each converted wall's own
// direction (convertCadToWalls may run a wall either way). The graph is
// centred on its walls, the truth on the page: `shift` (cm) maps one to the other.
function swingMatches(graph, truth, shift) {
  const byId = new Map(graph.walls.map((w) => [w.id, w]));
  let checked = 0, right = 0;
  for (const op of graph.openings) {
    if (op.type !== "door" || !op.swingDir) continue;
    const w = byId.get(op.wall), a = graph.nodes[w.a], b = graph.nodes[w.b];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const c = { x: a.x + ((b.x - a.x) * op.s) / L + shift.x, z: a.z + ((b.z - a.z) * op.s) / L + shift.z };
    const t = truth.openings.filter((o) => o.type === "door")
      .sort((p, q) => Math.hypot(p.center.x - c.x, p.center.z - c.z) - Math.hypot(q.center.x - c.x, q.center.z - c.z))[0];
    const tw = truth.walls[t.wall];
    const same = (tw.b.x - tw.a.x) * (b.x - a.x) + (tw.b.z - tw.a.z) * (b.z - a.z) >= 0;
    const want = ((t.hingeAtStart === same) ? "L" : "R") + "_" + ((t.swing > 0) === same ? "OUT" : "IN");
    checked++;
    if (want === op.swingDir) right++;
  }
  return { checked, right };
}

for (const style of ["poche", "outline", "hatch"]) {
  test(`vector PDF (${style}): walls, openings and scale match ground truth`, async () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { pdf, truth } = synthPdf(seed, { style, dimensions: true, furniture: true, border: true });
      const prims = await readPdfPrimitives(pdf);
      const plan = recognizeVectorPlan(prims);
      assert.equal(plan.scale.source, "dimensions");
      assert.ok(Math.abs(plan.cmPerUnit / truth.cmPerPx - 1) < 0.002, `seed ${seed}: scale ${plan.cmPerUnit} vs ${truth.cmPerPx}`);
      const rec = planToCentimetres(plan, { x: prims.width / 2, y: prims.height / 2 });
      const s = scorePlan(truth, rec);
      assert.ok(s.walls.precision > 0.98 && s.walls.recall > 0.97, `seed ${seed}: walls P ${s.walls.precision} R ${s.walls.recall}`);
      assert.ok(s.walls.thicknessMAE < 1, `seed ${seed}: thickness off by ${s.walls.thicknessMAE} cm`);
      assert.ok(s.openings.typed.f1 > 0.95, `seed ${seed}: openings F1 ${s.openings.typed.f1}`);
      assert.ok(s.openings.widthMAE < 3, `seed ${seed}: opening widths off by ${s.openings.widthMAE} cm`);

      // …and the same plan as an editable planner wall graph
      const graph = vectorPlanToPlanner(plan);
      assert.equal(graph.diagnostics.rejectedOpenings.length, 0);
      const back = plannerToRecord(graph);
      const g = scorePlan(truth, back, { align: "rigid" });
      assert.ok(g.walls.f1 > 0.98 && g.openings.typed.f1 > 0.95, `seed ${seed}: planner graph walls ${g.walls.f1} openings ${g.openings.typed.f1}`);
      const k = graph.cmPerUnit;
      const sw = swingMatches(graph, truth, { x: (graph.origin.x - prims.width / 2) * k, z: (graph.origin.y - prims.height / 2) * k });
      assert.ok(sw.checked > 0 && sw.right === sw.checked, `seed ${seed}: ${sw.right}/${sw.checked} door swings right`);
    }
  });
}

test("vector PDF without dimensions: scale from room-area labels", async () => {
  for (const seed of [2, 7, 11]) {
    const { pdf, truth } = synthPdf(seed, { dimensions: false, labels: true });
    const plan = recognizeVectorPlan(await readPdfPrimitives(pdf));
    assert.equal(plan.scale.source, "room-labels", `seed ${seed}`);
    assert.ok(Math.abs(plan.cmPerUnit / truth.cmPerPx - 1) < 0.02, `seed ${seed}: scale off by ${plan.cmPerUnit / truth.cmPerPx - 1}`);
  }
});

test("vector PDF with nothing to measure falls back to door swings, flagged weak", async () => {
  const { pdf, truth } = synthPdf(3, { dimensions: false, labels: false });
  const plan = recognizeVectorPlan(await readPdfPrimitives(pdf));
  assert.equal(plan.scale.source, "door-swings");
  assert.ok(plan.scale.confidence < 0.5);
  assert.ok(Math.abs(plan.cmPerUnit / truth.cmPerPx - 1) < 0.2);
  // geometry is right up to that scale
  const rec = planToCentimetres(plan, { x: 0, y: 0 });
  assert.ok(scorePlan(truth, rec, { align: "similarity" }).walls.f1 > 0.97);
});

test("a calibrated scale overrides what the sheet says", async () => {
  const { pdf, truth } = synthPdf(4, { style: "poche" });
  const plan = recognizeVectorPlan(await readPdfPrimitives(pdf), { cmPerUnit: truth.cmPerPx * 1.1 });
  assert.equal(plan.scale.source, "given");
  assert.ok(near(plan.cmPerUnit, truth.cmPerPx * 1.1));
});

test("an empty or text-only page yields no walls, not an exception", async () => {
  const blank = new PdfCanvas(300, 200);
  blank.text("Floor plan", 20, 40, 12);
  const plan = recognizeVectorPlan(await readPdfPrimitives(writePdf(blank)));
  assert.deepEqual(plan.walls, []);
  assert.deepEqual(plan.openings, []);
  assert.equal(plan.scale.source, "none");
  assert.deepEqual(vectorPlanToPlanner(plan).walls, []);
});

test("a scanned PDF (picture, no line work) is flagged for the raster path", async () => {
  const scan = new PdfCanvas(300, 200);
  // a 2x2 grey inline image stretched over the page: what a scanner writes
  scan.ops.push("q 280 0 0 180 10 10 cm BI /W 2 /H 2 /CS /G /BPC 8 ID @@ EI Q");
  const prims = await readPdfPrimitives(writePdf(scan));
  assert.equal(prims.images, 1);
  const plan = recognizeVectorPlan(prims);
  assert.equal(plan.rasterOnly, true);
  // a vector sheet is not
  const { pdf } = synthPdf(1);
  assert.equal(recognizeVectorPlan(await readPdfPrimitives(pdf)).rasterOnly, false);
});

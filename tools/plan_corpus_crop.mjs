// Close-up of one region of a corpus page with the recognition drawn thin on
// top: walls as their two faces (red), centrelines (dark red), doors blue,
// windows magenta, passages orange. For diagnosing real-sheet failures.
//
//   node tools/plan_corpus_crop.mjs <pdf> <page> <x0> <y0> <x1> <y1> <out.png> [zoom]
// (x0..y1 in sheet units — PDF points, y down)
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadPdfjs } from "./pdfjs_node.mjs";
import { readPagePrimitives } from "../js/plan_recog/pdf_primitives.js";
import { recognizeVectorPlan } from "../js/plan_recog/vector_plan.js";
import { createImage, fillPolygon, strokeSegment, fillCircle } from "./plan_draw.mjs";
import { encodePNG } from "./png.mjs";

export async function cropPage(file, page, box, zoom = 3) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
  const doc = await task.promise;
  const prims = await readPagePrimitives(await doc.getPage(page), pdfjs.OPS);
  const plan = recognizeVectorPlan(prims);
  await task.destroy();
  const [x0, y0, x1, y1] = box;
  const img = createImage(Math.round((x1 - x0) * zoom), Math.round((y1 - y0) * zoom));
  const P = (p) => ({ x: (p.x - x0) * zoom, y: (p.y - y0) * zoom });
  for (const path of prims.paths) {
    for (const sp of path.subpaths) {
      if (path.fill && sp.points.length >= 3) fillPolygon(img, sp.points.map(P), path.fill === "pattern" ? [200, 200, 230] : path.fill.map((c) => 255 - (255 - c) * 0.35));
    }
    if (!path.stroke) continue;
    for (const sp of path.subpaths) {
      const pts = sp.closed ? sp.points.concat([sp.points[0]]) : sp.points;
      for (let i = 1; i < pts.length; i++) {
        const curved = sp.curvedSeg && sp.curvedSeg[i];
        strokeSegment(img, P(pts[i - 1]), P(pts[i]), 1, path.dashed ? [170, 170, 240] : curved ? [0, 150, 0] : [90, 90, 90]);
      }
    }
  }
  const k = plan.cmPerUnit;
  for (const w of plan.walls) {
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1;
    const h = w.thickness / k / 2, nx = (-dy / L) * h, ny = (dx / L) * h;
    strokeSegment(img, P({ x: w.a.x + nx, y: w.a.y + ny }), P({ x: w.b.x + nx, y: w.b.y + ny }), 1.5, [230, 30, 30]);
    strokeSegment(img, P({ x: w.a.x - nx, y: w.a.y - ny }), P({ x: w.b.x - nx, y: w.b.y - ny }), 1.5, [230, 30, 30]);
    strokeSegment(img, P(w.a), P(w.b), 1, [140, 0, 0]);
  }
  for (const o of plan.openings)
    fillCircle(img, P(o.center), 4, o.type === "door" ? [30, 60, 230] : o.type === "window" ? [220, 0, 220] : [240, 150, 0]);
  return { image: img, plan, prims };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, page, x0, y0, x1, y1, out, zoom] = process.argv.slice(2);
  const { image, plan } = await cropPage(file, Number(page), [x0, y0, x1, y1].map(Number), Number(zoom) || 3);
  writeFileSync(out, encodePNG(image));
  console.log(`scale ${plan.scale.source} ${plan.cmPerUnit.toFixed(3)} cm/unit, ${plan.walls.length} walls → ${out}`);
}

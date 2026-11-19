// Debug view of a PDF page as the vector recognizer sees it: the extracted
// primitives (js/plan_recog/pdf_primitives.js) redrawn into a PNG, with text
// runs as boxes and, when given a recognized plan, its walls and openings on
// top. Usage: node tools/plan_pdf_view.mjs plan.pdf out.png [page]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadPdfjs } from "./pdfjs_node.mjs";
import { readPagePrimitives } from "../js/plan_recog/pdf_primitives.js";
import { createImage, fillPolygon, strokeSegment, fillCircle, downsample } from "./plan_draw.mjs";
import { encodePNG } from "./png.mjs";

export async function readPdfPrimitives(bytes, pageNumber = 1) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(Math.max(1, Math.min(doc.numPages, pageNumber)));
    return await readPagePrimitives(page, pdfjs.OPS);
  } finally {
    await task.destroy();
  }
}

/** Raster of primitives (+ optional overlay record in sheet units). */
export function renderPrimitives(prims, overlay = null, ss = 2) {
  const img = createImage(Math.ceil(prims.width * ss), Math.ceil(prims.height * ss));
  const S = (p) => ({ x: p.x * ss, y: p.y * ss });
  for (const path of prims.paths) {
    for (const sp of path.subpaths) {
      if (path.fill && sp.points.length >= 3) fillPolygon(img, sp.points.map(S), path.fill === "pattern" ? [180, 180, 220] : path.fill);
    }
    if (!path.stroke) continue;
    for (const sp of path.subpaths) {
      const pts = sp.closed ? sp.points.concat([sp.points[0]]) : sp.points;
      for (let i = 1; i < pts.length; i++)
        strokeSegment(img, S(pts[i - 1]), S(pts[i]), Math.max(1, path.lineWidth * ss), path.stroke === "pattern" ? [180, 180, 220] : path.stroke);
    }
  }
  for (const t of prims.texts) {
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    const pts = [[0, 0], [t.width, 0], [t.width, -t.size * 0.7], [0, -t.size * 0.7]]
      .map(([u, v]) => S({ x: t.x + c * u - s * v, y: t.y + s * u + c * v }));
    fillPolygon(img, pts, [255, 200, 120]);
  }
  if (overlay) {
    for (const w of overlay.walls || []) strokeSegment(img, S(w.a), S(w.b), 2.5 * ss, [230, 30, 30]);
    for (const o of overlay.openings || [])
      fillCircle(img, S(o.center), 4 * ss, o.type === "door" ? [30, 60, 230] : o.type === "window" ? [220, 0, 220] : [240, 150, 0]);
  }
  return downsample(img, ss);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, out, page] = process.argv.slice(2);
  const prims = await readPdfPrimitives(readFileSync(file), Number(page) || 1);
  writeFileSync(out, encodePNG(renderPrimitives(prims)));
  console.log(`${prims.paths.length} paths, ${prims.texts.length} text runs, ${prims.images} images → ${out}`);
}

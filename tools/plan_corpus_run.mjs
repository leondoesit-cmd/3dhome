// Run the vector-PDF recognizer over the real plan corpus (bench/plans) and
// write an overlay per page — recognized walls in red, doors blue, windows
// magenta, passages orange over the extracted line work — plus a summary.
// No ground truth needed: this is the eyeballing pass that finds what real
// sheets do that the synthetic bench does not.
//
//   node tools/plan_corpus_run.mjs [--sources bench/plans/sources.tsv]
//                                  [--out bench/out/corpus] [--pages 4] [--only id,id]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPdfjs } from "./pdfjs_node.mjs";
import { readPagePrimitives } from "../js/plan_recog/pdf_primitives.js";
import { recognizeVectorPlan } from "../js/plan_recog/vector_plan.js";
import { renderPrimitives } from "./plan_pdf_view.mjs";
import { encodePNG } from "./png.mjs";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

export function readSources(file) {
  return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((row) => {
    const [region, id, url, name] = row.split("\t");
    return { region, id, url, path: join("bench/plans", region, id, name) };
  });
}

export async function runCorpus(options = {}) {
  const sources = readSources(options.sources || "bench/plans/sources.tsv")
    .filter((s) => /\.pdf$/i.test(s.path) && existsSync(s.path))
    .filter((s) => !options.only || String(options.only).split(",").includes(s.id));
  const out = options.out || "bench/out/corpus";
  const maxPages = Number(options.pages) || 4;
  mkdirSync(out, { recursive: true });
  const pdfjs = await loadPdfjs();
  const rows = [];
  for (const src of sources) {
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(src.path)), verbosity: 0 });
    let doc;
    try {
      doc = await task.promise;
    } catch (e) {
      rows.push({ id: src.id, page: 0, error: e.message });
      continue;
    }
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const t0 = performance.now();
      let row = { id: src.id, region: src.region, page: p, pages: doc.numPages };
      try {
        const prims = await readPagePrimitives(await doc.getPage(p), pdfjs.OPS);
        const plan = recognizeVectorPlan(prims);
        const count = (type) => plan.openings.filter((o) => o.type === type).length;
        row = {
          ...row,
          ms: Math.round(performance.now() - t0),
          size: `${Math.round(prims.width)}x${Math.round(prims.height)}`,
          paths: prims.paths.length, texts: prims.texts.length, images: prims.images,
          scale: plan.scale.source, cmPerUnit: +plan.cmPerUnit.toFixed(4), unit: plan.scale.unit || "",
          support: plan.scale.support || 0,
          walls: plan.walls.length,
          wallM: +(plan.walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0) * plan.cmPerUnit / 100).toFixed(1),
          doors: count("door"), windows: count("window"), passages: count("passage"),
          rasterOnly: plan.rasterOnly,
          styles: (plan.diagnostics.wallStyles || []).join(" "),
        };
        // render at ~1800 px on the long side
        const ss = Math.min(2, 1800 / Math.max(prims.width, prims.height));
        const scaled = ss === 1 ? prims : scalePrims(prims, ss);
        const overlay = { walls: plan.walls.map((w) => ({ a: mul(w.a, ss), b: mul(w.b, ss) })), openings: plan.openings.map((o) => ({ ...o, center: mul(o.center, ss) })) };
        writeFileSync(join(out, `${src.region}-${src.id}-p${p}.png`), encodePNG(renderPrimitives(scaled, overlay, 1)));
      } catch (e) {
        row.error = e.message;
      }
      rows.push(row);
      console.log(fmt(row));
    }
    await task.destroy();
  }
  writeFileSync(join(out, "summary.json"), JSON.stringify(rows, null, 1));
  return rows;
}

const mul = (p, s) => ({ x: p.x * s, y: p.y * s });
export function scalePrims(prims, s) {
  return {
    ...prims,
    width: prims.width * s, height: prims.height * s,
    paths: prims.paths.map((p) => ({ ...p, lineWidth: p.lineWidth * s, subpaths: p.subpaths.map((sp) => ({ ...sp, points: sp.points.map((q) => mul(q, s)) })) })),
    texts: prims.texts.map((t) => ({ ...t, x: t.x * s, y: t.y * s, size: t.size * s, width: t.width * s })),
  };
}

function fmt(r) {
  if (r.error) return `${r.id} p${r.page}: ERROR ${r.error}`;
  return `${(r.region + "/" + r.id).padEnd(26)} p${r.page}/${r.pages} ${String(r.ms).padStart(5)}ms ${r.size.padEnd(9)} paths ${String(r.paths).padStart(5)} text ${String(r.texts).padStart(4)} img ${r.images}` +
    ` | scale ${r.scale}${r.unit ? "(" + r.unit + ")" : ""} x${r.support} ${r.cmPerUnit} | walls ${r.walls} (${r.wallM} m) D${r.doors} W${r.windows} P${r.passages}${r.rasterOnly ? " RASTER" : ""}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCorpus(args(process.argv.slice(2)));
}

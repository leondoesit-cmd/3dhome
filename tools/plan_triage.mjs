// Sort harvested sales-plan PDFs (tools/plan_harvest.mjs output) into
// training-ready, review, reject and raster pages. Each page runs through the
// vector recognizer (js/plan_recog); the checks in plan_triage_lib.mjs
// compare it with what the sheet states (apartment area, room count). One
// JSON line per page, with the plan's crop box in sheet units for the later
// training-sample export. Optional overlays (recognized walls over the line
// work) for a sample of each verdict, to eyeball the sorting.
//
//   node tools/plan_triage.mjs --dir bench/harvest/il [--pages 6] [--shard 0/4]
//        [--overlays 15] [--limit N]
//   node tools/plan_triage.mjs --dir bench/harvest/il --summary
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPdfjs } from "./pdfjs_node.mjs";
import { readPagePrimitives } from "../js/plan_recog/pdf_primitives.js";
import { recognizeVectorPlan } from "../js/plan_recog/vector_plan.js";
import { renderPrimitives } from "./plan_pdf_view.mjs";
import { encodePNG } from "./png.mjs";
import { scalePrims } from "./plan_corpus_run.mjs";
import { fillWalls, fillFootprint, fillRooms, wallAgreement } from "../js/plan_recog/fill_walls.js";
import {
  spacesFromWalls, statedAreas, roomCountHint, countedRooms, judgePage, judgeFill, betterVerdict, roomLabelCheck, textStream,
} from "./plan_triage_lib.mjs";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

const MAX_PATHS = 80000; // pages beyond this are site plans or rasterised art, not one apartment

function readManifest(dir) {
  const bySha = new Map();
  const file = join(dir, "manifest.jsonl");
  if (!existsSync(file)) return bySha;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    try {
      const r = JSON.parse(line);
      if (r.kind === "pdf" && !bySha.has(r.sha256)) bySha.set(r.sha256, r);
    } catch { /* blank or torn line */ }
  }
  return bySha;
}

export async function analysePage(page, OPS, meta) {
  const t0 = performance.now();
  const prims = await readPagePrimitives(page, OPS);
  const base = { paths: prims.paths.length, texts: prims.texts.length, images: prims.images };
  // an embedded picture with little line work is a raster plan (text and a
  // frame may still be vector)
  if (prims.paths.length < 300 && prims.images > 0) {
    return { prims, row: { ...base, ...judgePage({ raster: true }) } };
  }
  if (prims.paths.length > MAX_PATHS) return { prims, row: { ...base, status: "reject", reasons: ["too many paths"] } };
  const plan = recognizeVectorPlan(prims);
  const k = plan.cmPerUnit;
  const cm = (p) => ({ x: p.x * k, y: p.y * k });
  const walls = plan.walls.map((w) => ({ a: cm(w.a), b: cm(w.b), thickness: w.thickness }));
  const wallMeters = walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0) / 100;
  const { spaces, footprint, locate } = spacesFromWalls(walls);
  const stated = statedAreas(prims.texts);
  const fileName = (meta?.url || "").split("/").pop();
  const roomHint = roomCountHint(meta?.label, fileName, textStream(prims.texts));
  const labels = roomLabelCheck(prims.texts, k, locate);
  const rec = { walls: walls.length, wallMeters, scale: plan.scale.source, spaces, footprint, stated, roomHint, labels };
  const graphVerdict = judgePage(rec);
  // walls painted as filled shapes: a second reader, whichever is confirmed wins
  const fillResult = fillWalls(prims, k);
  const fill = fillResult ? { lengthM: fillResult.lengthM, footprint: fillFootprint(fillResult).footprint, colours: fillResult.colours } : null;
  const fillLabels = fillResult ? roomLabelCheck(prims.texts, k, fillRooms(fillResult).locate) : null;
  const agreement = fillResult && walls.length ? wallAgreement(fillResult, walls) : null;
  const fillVerdict = judgeFill({ fill, scale: plan.scale.source, stated, labels: fillLabels, agreement });
  const best = betterVerdict(graphVerdict, fillVerdict);
  const verdict = { ...best, method: best === fillVerdict ? "fill" : "graph", graph: graphVerdict.status, fill: fill ? { ...fill, status: fillVerdict.status, reasons: fillVerdict.reasons, checks: fillVerdict.checks } : undefined };
  // crop: the walls plus a margin for the dimension chains (60 cm), sheet units
  const xs = plan.walls.flatMap((w) => [w.a.x, w.b.x]), ys = plan.walls.flatMap((w) => [w.a.y, w.b.y]);
  const m = 60 / k;
  const crop = xs.length ? [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m].map((v) => +v.toFixed(1)) : null;
  const count = (type) => plan.openings.filter((o) => o.type === type).length;
  return {
    prims, plan, fillMask: verdict.method === "fill" ? fillResult : null,
    row: {
      ...base, ...verdict,
      scale: plan.scale.source, scaleSupport: plan.scale.support || 0, cmPerUnit: +k.toFixed(4),
      walls: walls.length, wallMeters: +wallMeters.toFixed(1), doors: count("door"), windows: count("window"),
      footprint, rooms: countedRooms(spaces), spaces: spaces.length, stated: stated.apartment, otherAreas: stated.others.length ? stated.others : undefined,
      roomHint, crop, ms: Math.round(performance.now() - t0),
    },
  };
}

// The page with the recognized walls on top: wall lines (graph reader) in
// red, or the fill-wall mask (fill reader) tinted blue.
function writeOverlay(dir, status, name, prims, plan, fillMask) {
  const out = join(dir, "overlays", status);
  mkdirSync(out, { recursive: true });
  const ss = Math.min(2, 1600 / Math.max(prims.width, prims.height));
  const mul = (p) => ({ x: p.x * ss, y: p.y * ss });
  const overlay = plan && !fillMask ? { walls: plan.walls.map((w) => ({ a: mul(w.a), b: mul(w.b) })), openings: plan.openings.map((o) => ({ ...o, center: mul(o.center) })) } : null;
  const img = renderPrimitives(scalePrims(prims, ss), overlay, 1);
  if (fillMask) {
    const { mask, w, h, cell, x0, y0, cmPerUnit: k } = fillMask;
    for (let py = 0; py < img.height; py++) {
      for (let px = 0; px < img.width; px++) {
        const cx = Math.floor(((px / ss - x0) * k) / cell), cy = Math.floor(((py / ss - y0) * k) / cell);
        if (cx < 0 || cy < 0 || cx >= w || cy >= h || !mask[cy * w + cx]) continue;
        const i = (py * img.width + px) * 4;
        img.data[i] = img.data[i] * 0.3;
        img.data[i + 1] = img.data[i + 1] * 0.45 + 60;
        img.data[i + 2] = img.data[i + 2] * 0.3 + 170;
      }
    }
  }
  writeFileSync(join(out, name + ".png"), encodePNG(img));
}

export async function runTriage(options) {
  const dir = options.dir;
  const outDir = join(dir, "triage");
  mkdirSync(outDir, { recursive: true });
  const [shard, shards] = String(options.shard || "0/1").split("/").map(Number);
  const outFile = join(outDir, `triage-${shard}.jsonl`);
  const done = new Set();
  if (existsSync(outFile)) for (const l of readFileSync(outFile, "utf8").split("\n")) { try { done.add(JSON.parse(l).sha); } catch { /* blank */ } }
  const meta = readManifest(dir);
  const maxPages = Number(options.pages) || 6;
  const overlays = Number(options.overlays) || 0;
  const shown = {};
  let files = readdirSync(join(dir, "files")).filter((f) => f.endsWith(".pdf")).sort().filter((_, i) => i % shards === shard);
  if (options.limit) files = files.slice(0, Number(options.limit));
  const pdfjs = await loadPdfjs();
  let n = 0;
  for (const f of files) {
    const sha = f.slice(0, -4);
    n++;
    if (done.has(sha)) continue;
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(dir, "files", f))), verbosity: 0 }).promise;
    } catch (e) {
      appendFileSync(outFile, JSON.stringify({ sha, page: 0, status: "reject", reasons: ["unreadable: " + e.message] }) + "\n");
      continue;
    }
    const rows = [];
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      let row;
      try {
        const { prims, plan, fillMask, row: r } = await analysePage(await doc.getPage(p), pdfjs.OPS, meta.get(sha));
        row = r;
        if (overlays && (shown[r.status] || 0) < overlays && (r.status !== "reject" || plan)) {
          shown[r.status] = (shown[r.status] || 0) + 1;
          writeOverlay(outDir, r.status, `${sha.slice(0, 10)}-p${p}-${r.method || "x"}`, prims, plan, fillMask);
        }
      } catch (e) {
        row = { status: "reject", reasons: ["error: " + e.message] };
      }
      rows.push({ sha, page: p, pages: doc.numPages, ...row });
    }
    appendFileSync(outFile, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const tally = rows.map((r) => r.status[0]).join("");
    if (n % 25 === 0 || n === files.length) console.log(`${n}/${files.length} ${sha.slice(0, 10)} ${tally}`);
    await doc.cleanup?.();
  }
}

export function summarise(dir) {
  const outDir = join(dir, "triage");
  const rows = readdirSync(outDir).filter((f) => /^triage-\d+\.jsonl$/.test(f))
    .flatMap((f) => readFileSync(join(outDir, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  const by = (key) => rows.reduce((m, r) => ((m[key(r)] = (m[key(r)] || 0) + 1), m), {});
  const reasons = {};
  for (const r of rows.filter((x) => x.status === "review" || x.status === "reject")) {
    for (const reason of r.reasons || []) {
      const k = reason.replace(/[\d.]+/g, "#");
      reasons[k] = (reasons[k] || 0) + 1;
    }
  }
  const pdfs = new Set(rows.map((r) => r.sha)).size;
  const trainPdfs = new Set(rows.filter((r) => r.status === "train").map((r) => r.sha)).size;
  const method = by((r) => (r.status === "train" ? r.method : "-"));
  return { pdfs, pages: rows.length, status: by((r) => r.status), trainPdfs, trainBy: method, scale: by((r) => r.scale || "-"), reasons };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = args(process.argv.slice(2));
  if (!options.dir) { console.error("usage: --dir <harvest dir>"); process.exit(1); }
  if (options.summary) console.log(JSON.stringify(summarise(options.dir), null, 1));
  else await runTriage(options);
}

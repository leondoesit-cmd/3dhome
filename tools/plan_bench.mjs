// Floor-plan recognition benchmark.
//
//   node tools/plan_bench.mjs [--n 24] [--seed 1] [--style bw,il,outline]
//                             [--pdf-style poche,outline,hatch] [--kinds raster,pdf]
//                             [--recognizer oracle,perturbed,rect-ceiling,pdf-vector]
//                             [--corpus bench/plans] [--write bench/out/bench]
//                             [--json bench/out/report.json]
//
// Runs every recognizer over N seeded synthetic plans per style — raster
// sheets (tools/plan_synth.mjs) and vector PDFs (tools/plan_synth_pdf.mjs),
// both with exact ground truth — plus any hand-traced real plans listed in
// <corpus>/manifest.json, and prints wall / opening / scale metrics per
// recognizer and style. A recognizer is only scored on the inputs it reads.
// The real corpus is gitignored; a manifest entry is
//   { "file": "il/plan01.png" | "il/plan01.pdf", "page": 1,
//     "truth": "il/plan01.json", "region": "il", "source": "<url>", "units": "cm" }
// where the truth JSON holds a scoring record (see tools/plan_metrics.mjs) or
// a planner export with nodes/walls/openings.
//
// Recognizers take ({ image, pdf, page, truth }) and return a scoring record.
// `oracle`, `perturbed` and `rect-ceiling` exist to keep the harness honest:
// the oracle must score 1.0, the perturbed copy must lose exactly what was
// perturbed, and rect-ceiling is the best the old rectangle-room importer
// could ever do.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { SYNTH_STYLES, synthPlan, mulberry32 } from "./plan_synth.mjs";
import { PDF_STYLES, synthPdf } from "./plan_synth_pdf.mjs";
import { readPdfPrimitives } from "./plan_pdf_view.mjs";
import { recognizeVectorPlan, planToCentimetres } from "../js/plan_recog/vector_plan.js";
import { scorePlan, plannerToRecord } from "./plan_metrics.mjs";
import { encodePNG, decodePNG } from "./png.mjs";

export const RECOGNIZERS = {
  oracle: ({ truth }) => truth,

  perturbed: ({ truth }) => {
    const rng = mulberry32(99);
    const jitter = (p) => ({ x: p.x + (rng() - 0.5) * 6, z: p.z + (rng() - 0.5) * 6 });
    return {
      cmPerPx: truth.cmPerPx * 1.03,
      walls: truth.walls.filter(() => rng() > 0.1).map((w) => ({ ...w, a: jitter(w.a), b: jitter(w.b) })),
      openings: truth.openings.filter(() => rng() > 0.2).map((o) => ({ ...o, center: jitter(o.center) })),
      rooms: truth.rooms,
    };
  },

  // The old importer's representation: every room an axis-aligned box,
  // walls on the box edges, no openings of its own. Fed perfect room
  // extents this is its upper bound.
  "rect-ceiling": ({ truth }) => {
    const walls = [], rooms = [];
    for (const r of truth.rooms) {
      // boxes in the plan's own axes: undo the sheet rotation, box, redo it
      const c = Math.cos(-truth.rotation), s = Math.sin(-truth.rotation);
      const un = (p) => ({ x: c * p.x - s * p.z, z: s * p.x + c * p.z });
      const re = (p) => ({ x: c * p.x + s * p.z, z: -s * p.x + c * p.z });
      const pts = r.points.map(un);
      const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
      const z0 = Math.min(...pts.map((p) => p.z)), z1 = Math.max(...pts.map((p) => p.z));
      const box = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }].map(re);
      rooms.push({ points: box });
      for (let i = 0; i < 4; i++) walls.push({ a: box[i], b: box[(i + 1) % 4] });
    }
    return { cmPerPx: truth.cmPerPx, walls, openings: [], rooms };
  },

  // the vector-PDF importer (js/plan_recog/vector_plan.js); reads PDFs only
  "pdf-vector": Object.assign(async ({ pdf, page }) => {
    const prims = await readPdfPrimitives(pdf, page || 1);
    const plan = recognizeVectorPlan(prims);
    return { ...planToCentimetres(plan, { x: prims.width / 2, y: prims.height / 2 }), sheetPlan: plan, page: { width: prims.width, height: prims.height } };
  }, { inputs: ["pdf"] }),
};

const inputsOf = (recognize) => recognize.inputs || ["raster", "pdf"];

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

function loadCorpus(dir) {
  const manifest = join(dir, "manifest.json");
  if (!existsSync(manifest)) return [];
  const entries = JSON.parse(readFileSync(manifest, "utf8"));
  const cases = [];
  for (const e of entries) {
    const raw = JSON.parse(readFileSync(join(dir, e.truth), "utf8"));
    let truth = raw.nodes ? plannerToRecord(raw) : raw;
    let sheet = null;
    if (raw.units === "sheet") {
      // tools/plan_gt.mjs truth: sheet units → page-centred cm at the true
      // scale; predictions are mapped the same way (see runBench)
      const k = raw.cmPerUnit, cx = raw.width / 2, cy = raw.height / 2;
      const P = (p) => ({ x: (p.x - cx) * k, z: (p.y - cy) * k });
      sheet = { k, cx, cy, region: raw.region ? { x0: (raw.region[0] - cx) * k, z0: (raw.region[1] - cy) * k, x1: (raw.region[2] - cx) * k, z1: (raw.region[3] - cy) * k } : null };
      truth = {
        cmPerPx: k,
        walls: raw.walls.map((w) => ({ a: P(w.a), b: P(w.b), thickness: w.thickness })),
        openings: raw.openings.map((o) => ({ type: o.type, center: P(o.center), width: o.width })),
        openingsAnnotated: raw.openingsAnnotated !== false,
      };
    }
    const group = e.region || "real";
    if (/\.pdf$/i.test(e.file)) {
      cases.push({ id: e.id || e.file, group: group + "-pdf", kind: "pdf", pdf: readFileSync(join(dir, e.file)), page: e.page || 1, truth, sheet });
    } else if (/\.png$/i.test(e.file)) {
      cases.push({ id: e.file, group, kind: "raster", image: decodePNG(readFileSync(join(dir, e.file))), truth });
    } else {
      console.warn(`skip ${e.file}: the Node bench reads PNG and PDF (JPEG runs in the browser)`);
    }
  }
  return cases;
}

const mean = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);
const pct = (v) => (v == null ? "   -  " : (100 * v).toFixed(1).padStart(5) + "%");

export async function runBench(options = {}) {
  const n = Number(options.n) || 24;
  const seed0 = Number(options.seed) || 1;
  const kinds = options.kinds ? String(options.kinds).split(",") : ["raster", "pdf"];
  const styles = !kinds.includes("raster") ? [] : options.style ? String(options.style).split(",") : SYNTH_STYLES;
  const pdfStyles = !kinds.includes("pdf") ? [] : options["pdf-style"] ? String(options["pdf-style"]).split(",") : PDF_STYLES;
  const names = options.recognizer ? String(options.recognizer).split(",") : Object.keys(RECOGNIZERS);
  const cases = [];
  for (const style of styles) {
    for (let k = 0; k < n; k++) {
      const seed = seed0 + k;
      const plan = synthPlan(seed, { style });
      cases.push({ id: `synth-${style}-${seed}`, group: style, kind: "raster", image: plan.image, truth: plan.truth, meta: plan.meta });
    }
  }
  for (const style of pdfStyles) {
    for (let k = 0; k < n; k++) {
      const seed = seed0 + k;
      const plan = synthPdf(seed, { style });
      cases.push({ id: `synth-pdf-${style}-${seed}`, group: "pdf-" + style, kind: "pdf", pdf: plan.pdf, truth: plan.truth, meta: plan.meta });
    }
  }
  cases.push(...loadCorpus(options.corpus || "bench/plans").filter((c) => kinds.includes(c.kind)));
  if (options.write) {
    mkdirSync(options.write, { recursive: true });
    for (const c of cases) {
      if (!c.meta) continue;
      if (c.kind === "pdf") writeFileSync(join(options.write, c.id + ".pdf"), c.pdf);
      else writeFileSync(join(options.write, c.id + ".png"), encodePNG(c.image));
      writeFileSync(join(options.write, c.id + ".json"), JSON.stringify({ meta: c.meta, truth: c.truth }));
    }
  }

  const results = [];
  for (const name of names) {
    const recognize = RECOGNIZERS[name];
    if (!recognize) throw new Error(`unknown recognizer "${name}" (have: ${Object.keys(RECOGNIZERS).join(", ")})`);
    for (const c of cases) {
      if (!inputsOf(recognize).includes(c.kind)) continue;
      const t0 = performance.now();
      let pred, error = null;
      try {
        pred = await recognize({ image: c.image, pdf: c.pdf, page: c.page, truth: c.truth });
      } catch (e) {
        error = e.message;
        pred = { walls: [], openings: [] };
      }
      const ms = performance.now() - t0;
      let score;
      if (c.sheet && pred.sheetPlan) {
        // real sheet: place the prediction at the true scale so wall geometry
        // is judged on its own, keep only what falls inside the plan region,
        // and report the scale error separately
        const plan = pred.sheetPlan, s = c.sheet, ratio = s.k / plan.cmPerUnit;
        const P = (p) => ({ x: (p.x - s.cx) * s.k, z: (p.y - s.cy) * s.k });
        const inside = (p) => !s.region || (p.x >= s.region.x0 && p.x <= s.region.x1 && p.z >= s.region.z0 && p.z <= s.region.z1);
        const walls = plan.walls.map((w) => ({ a: P(w.a), b: P(w.b), thickness: w.thickness * ratio }))
          .filter((w) => inside({ x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 }));
        const openings = plan.openings.map((o) => ({ type: o.type, center: P(o.center), width: o.width * ratio })).filter((o) => inside(o.center));
        score = scorePlan(c.truth, { cmPerPx: plan.cmPerUnit, walls, openings }, { align: "none" });
      } else {
        score = scorePlan(c.truth, pred, { align: "similarity" });
      }
      if (c.truth.openingsAnnotated === false) score.openings = null;
      results.push({ recognizer: name, id: c.id, group: c.group, ms, error, score });
    }
  }

  const rows = [];
  for (const name of names) {
    const groups = [...new Set(results.filter((r) => r.recognizer === name).map((r) => r.group)), "all"];
    for (const g of groups) {
      const rs = results.filter((r) => r.recognizer === name && (g === "all" || r.group === g));
      if (!rs.length) continue;
      rows.push({
        recognizer: name, group: g, cases: rs.length,
        wallP: mean(rs.map((r) => r.score.walls.precision)),
        wallR: mean(rs.map((r) => r.score.walls.recall)),
        wallF1: mean(rs.map((r) => r.score.walls.f1)),
        openF1: mean(rs.filter((r) => r.score.openings).map((r) => r.score.openings.typed.f1)),
        roomIoU: mean(rs.filter((r) => r.score.rooms).map((r) => r.score.rooms.meanIoU)),
        scaleErr: mean(rs.filter((r) => r.score.scaleError != null).map((r) => r.score.scaleError)),
        errors: rs.filter((r) => r.error).length,
        ms: mean(rs.map((r) => r.ms)),
      });
    }
  }
  return { rows, results };
}

export function formatRows(rows) {
  const head = "recognizer     group        cases  wall P  wall R  wall F1  open F1  room IoU  scale err  ms/plan";
  const lines = [head, "-".repeat(head.length)];
  for (const r of rows) {
    lines.push([
      r.recognizer.padEnd(14), r.group.padEnd(12), String(r.cases).padStart(5),
      pct(r.wallP).padStart(7), pct(r.wallR).padStart(7), pct(r.wallF1).padStart(8),
      pct(r.openF1).padStart(8), pct(r.roomIoU).padStart(9), pct(r.scaleErr).padStart(10),
      (r.ms == null ? "-" : r.ms.toFixed(0)).padStart(8),
    ].join(" ") + (r.errors ? `  (${r.errors} errors)` : ""));
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = args(process.argv.slice(2));
  const { rows, results } = await runBench(opts);
  console.log(formatRows(rows));
  if (opts.json) {
    mkdirSync(dirname(opts.json), { recursive: true });
    writeFileSync(opts.json, JSON.stringify({ rows, results }, null, 1));
    console.log(`\nwrote ${opts.json}`);
  }
}

// Build a furniture/fixture symbol library from the sorted sales plans
// (tools/plan_triage.mjs output). For every vector page with a reliable
// scale it clusters the non-wall line work inside the apartment, hashes each
// cluster's shape (rotation/mirror invariant), and groups equal shapes across
// all sheets. Each instance is a training box for symbol detection; each
// library entry gets a name from its size and room when that is clear.
//
//   node tools/plan_symbols.mjs --dir bench/harvest/il [--limit N] [--examples 6]
//
// Writes <dir>/symbols/instances.jsonl (one box per found item),
// library.json (entries by frequency) and examples/<entry>.png.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPdfjs } from "./pdfjs_node.mjs";
import { readPagePrimitives } from "../js/plan_recog/pdf_primitives.js";
import { recognizeVectorPlan } from "../js/plan_recog/vector_plan.js";
import { fillWalls, fillRooms } from "../js/plan_recog/fill_walls.js";
import { encodePNG } from "./png.mjs";
import { spacesFromWalls } from "./plan_triage_lib.mjs";
import { clusterItems, drawingItems, shapeSignature, hashDistance, nameSymbol, roomKind, distinctive, bboxOf } from "./plan_symbols_lib.mjs";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

const ROOM_LABEL = /שינה|ממ["״]?ד|סלון|דיור|מגורים|מטבח|אוכל|רחצה|אמבט|שירותים|שרות|כביסה|מרפס|מקלחת/;

function labelPoint(t) {
  const c = Math.cos(t.angle || 0), s = Math.sin(t.angle || 0), size = t.size || 10;
  return { x: t.x + (c * (t.width || 0)) / 2 + s * size * 0.35, y: t.y + (s * (t.width || 0)) / 2 - c * size * 0.35 };
}

// Usable pages: sorted as train, or review with a reliable scale.
function usablePages(dir) {
  const rows = readdirSync(join(dir, "triage")).filter((f) => /^triage-\d+\.jsonl$/.test(f))
    .flatMap((f) => readFileSync(join(dir, "triage", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  return rows.filter((r) => (r.status === "train" || r.status === "review") && (r.scale === "dimensions" || r.scale === "scale-note"));
}

/** Symbol instances on one page: [{ box (cm), w, h, hash, room }]. */
export function pageSymbols(prims, plan, method) {
  const k = plan.cmPerUnit;
  let locate, wallFill = null;
  if (method === "fill") {
    const fw = fillWalls(prims, k);
    if (!fw) return [];
    wallFill = fw.colours.map((c) => c.rgb);
    locate = fillRooms(fw).locate;
  } else {
    const walls = plan.walls.map((w) => ({ a: { x: w.a.x * k, y: w.a.y * k }, b: { x: w.b.x * k, y: w.b.y * k }, thickness: w.thickness }));
    locate = spacesFromWalls(walls).locate;
  }
  if (!locate) return [];
  const items = drawingItems(prims, k, { onWall: (x, y) => locate(x, y) < 0, wallFill });
  const labels = prims.texts.filter((t) => t.str && ROOM_LABEL.test(t.str)).map((t) => {
    const p = labelPoint(t);
    return { room: locate(p.x * k, p.y * k), kind: roomKind(t.str) };
  }).filter((l) => l.room >= 0 && l.kind);
  const out = [];
  for (const group of clusterItems(items, 2)) {
    const parts = group.map((i) => items[i]);
    if (!distinctive(parts)) continue;
    const box = bboxOf(parts.flatMap((it) => it.pts));
    const long = Math.max(box.x1 - box.x0, box.y1 - box.y0), short = Math.min(box.x1 - box.x0, box.y1 - box.y0);
    if (long < 25 || long > 320 || short < 20) continue;
    const sig = shapeSignature(parts);
    const room = locate((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
    const kind = room >= 0 ? labels.find((l) => l.room === room)?.kind || null : null;
    out.push({ box: Object.fromEntries(Object.entries(box).map(([a, v]) => [a, Math.round(v)])), w: sig.w, h: sig.h, hash: sig.hash, room: kind, parts });
  }
  return out;
}

// Small line drawing of one instance (for the library's example sheet).
function drawInstance(parts, size = 96) {
  const b = bboxOf(parts.flatMap((it) => it.pts));
  const x0 = b.x0, y0 = b.y0, span = Math.max(b.x1 - x0, b.y1 - y0) || 1;
  const s = (size - 4) / span;
  const data = new Uint8Array(size * size * 4).fill(255);
  for (const it of parts) {
    const n = it.closed ? it.pts.length : it.pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = it.pts[i], b = it.pts[(i + 1) % it.pts.length];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * s) + 1;
      for (let t = 0; t <= steps; t++) {
        const x = Math.round(2 + (a.x - x0 + ((b.x - a.x) * t) / steps) * s), y = Math.round(2 + (a.y - y0 + ((b.y - a.y) * t) / steps) * s);
        if (x >= 0 && y >= 0 && x < size && y < size) data.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
      }
    }
  }
  return { width: size, height: size, data };
}

// A row of example drawings side by side.
function sheet(images) {
  const size = images[0].width, width = size * images.length;
  const data = new Uint8Array(width * size * 4).fill(255);
  images.forEach((img, i) => {
    for (let y = 0; y < size; y++) data.set(img.data.subarray(y * size * 4, (y + 1) * size * 4), (y * width + i * size) * 4);
  });
  return { width, height: size, data };
}

export async function runSymbols(options) {
  const dir = options.dir;
  const outDir = join(dir, "symbols");
  mkdirSync(join(outDir, "examples"), { recursive: true });
  const instancesFile = join(outDir, "instances.jsonl");
  if (existsSync(instancesFile)) writeFileSync(instancesFile, "");
  let pages = usablePages(dir);
  if (options.limit) pages = pages.slice(0, Number(options.limit));
  const bySha = new Map();
  for (const p of pages) {
    if (!bySha.has(p.sha)) bySha.set(p.sha, []);
    bySha.get(p.sha).push(p);
  }
  const pdfjs = await loadPdfjs();
  const library = new Map();
  const buckets = new Map();
  const examplesWanted = Number(options.examples) || 6;
  let done = 0, found = 0;
  for (const [sha, rows] of bySha) {
    let doc;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(join(dir, "files", sha + ".pdf"))), verbosity: 0 }).promise;
    } catch { continue; }
    for (const row of rows) {
      try {
        const prims = await readPagePrimitives(await doc.getPage(row.page), pdfjs.OPS);
        const plan = recognizeVectorPlan(prims);
        const symbols = pageSymbols(prims, plan, row.method);
        const lines = [];
        for (const s of symbols) {
          let entry = library.get(s.hash);
          if (!entry) {
            // near-identical shapes of about the same size join an existing
            // entry; only entries in neighbouring size buckets are compared
            const bx = Math.round(s.w / 8), by = Math.round(s.h / 8);
            for (let dx = -1; dx <= 1 && !entry; dx++) {
              for (let dy = -1; dy <= 1 && !entry; dy++) {
                for (const e of buckets.get(`${bx + dx},${by + dy}`) || []) {
                  if (Math.abs(e.w - s.w) <= Math.max(6, e.w * 0.08) && Math.abs(e.h - s.h) <= Math.max(6, e.h * 0.08) && hashDistance(e.hash, s.hash) <= 14) { entry = e; break; }
                }
              }
            }
          }
          if (!entry) {
            entry = { id: "s" + library.size, hash: s.hash, w: s.w, h: s.h, count: 0, sheets: new Set(), rooms: {}, examples: [] };
            library.set(s.hash, entry);
            const key = `${Math.round(s.w / 8)},${Math.round(s.h / 8)}`;
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(entry);
          }
          entry.count++;
          entry.sheets.add(sha);
          if (s.room) entry.rooms[s.room] = (entry.rooms[s.room] || 0) + 1;
          if (entry.examples.length < examplesWanted && !entry.examples.some((e) => e.sha === sha)) entry.examples.push({ sha, page: row.page, img: drawInstance(s.parts) });
          lines.push(JSON.stringify({ sha, page: row.page, entry: entry.id, box: s.box, w: s.w, h: s.h, room: s.room }));
          found++;
        }
        if (lines.length) appendFileSync(instancesFile, lines.join("\n") + "\n");
      } catch (e) {
        console.log(`! ${sha.slice(0, 10)} p${row.page}: ${e.message}`);
      }
    }
    await doc.cleanup?.();
    if (++done % 25 === 0) console.log(`${done}/${bySha.size} sheets, ${found} items, ${library.size} shapes`);
  }
  const entries = [...library.values()].filter((e) => e.sheets.size >= 2).sort((a, b) => b.sheets.size - a.sheets.size);
  for (const e of entries.slice(0, 300)) if (e.examples.length) writeFileSync(join(outDir, "examples", e.id + ".png"), encodePNG(sheet(e.examples.map((x) => x.img))));
  const out = entries.map((e) => ({ id: e.id, name: nameSymbol(e.w, e.h, e.rooms), w: e.w, h: e.h, count: e.count, sheets: e.sheets.size, rooms: e.rooms, hash: e.hash }));
  writeFileSync(join(outDir, "library.json"), JSON.stringify(out, null, 1));
  console.log(`done: ${done} sheets, ${found} items, ${library.size} shapes, ${entries.length} recurring (on 2+ sheets), ${out.filter((e) => e.name).length} named`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = args(process.argv.slice(2));
  if (!options.dir) { console.error("usage: --dir <harvest dir>"); process.exit(1); }
  await runSymbols(options);
}

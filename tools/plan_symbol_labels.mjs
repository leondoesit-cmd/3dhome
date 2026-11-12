// Label the furniture/fixture symbol library (tools/plan_symbols.mjs output)
// with the local vision model behind llama-server (the Import Blueprint
// engine, .local/blueprint-vision). One request per library entry: its
// example strip (up to six drawings of the same block, enlarged 2x), its size
// in cm and the rooms it was found in; the answer is constrained to a fixed
// label set by a JSON schema. Then every instance inherits its entry's label.
//
//   node tools/plan_symbol_labels.mjs --dir bench/harvest/il [--limit N] [--again]
//   node tools/plan_symbol_labels.mjs --dir bench/harvest/il --apply
//
// Writes <dir>/symbols/labels.json ({ id: { label, confidence } }), adds
// `label` to library.json and writes instances_labelled.jsonl. --apply skips
// the model and only carries an existing labels.json (for example one written
// by hand from contact sheets) onto the library and its instances.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { decodePNG, encodePNG } from "./png.mjs";

export const SYMBOL_LABELS = [
  "toilet", "bidet", "washbasin", "bathtub", "shower", "kitchen_sink", "hob", "oven", "fridge", "dishwasher",
  "washing_machine", "dryer", "kitchen_counter", "double_bed", "single_bed", "crib", "wardrobe", "desk", "chair",
  "dining_table", "sofa", "armchair", "coffee_table", "tv_unit", "door", "window", "stairs", "plant",
  "outdoor_furniture", "car", "shaft", "water_heater", "annotation", "unknown",
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "confidence"],
  properties: { label: { type: "string", enum: SYMBOL_LABELS }, confidence: { type: "number", minimum: 0, maximum: 1 } },
};

const SYSTEM = "You identify furniture and fixture symbols in architectural floor plans (top view, black line drawings). " +
  "The image shows up to six drawings of the SAME symbol taken from different sheets, possibly rotated or mirrored. " +
  "Choose exactly one label. Use 'annotation' for drafting marks (grid bubbles, section marks, north arrows, dimension ends) " +
  "and 'unknown' when the drawing is not clearly one item. Real sizes help: a toilet is about 40x65 cm, a washbasin 45-60 x 35-50, " +
  "a bathtub 170x70, a shower tray 80-100 square, a double bed 160-180x200, a single bed 90x190, a hob or sink cabinet 60x60.";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

// Nearest-neighbour 2x enlargement with lines thickened by one pixel, so thin
// 96 px drawings survive the vision encoder's resampling.
export function enlarge(img, factor = 2) {
  const w = img.width * factor, h = img.height * factor;
  const data = new Uint8Array(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / factor), sy = Math.floor(y / factor);
      let dark = false;
      for (let dy = -1; dy <= 1 && !dark; dy++) {
        for (let dx = -1; dx <= 1 && !dark; dx++) {
          const ux = sx + dx, uy = sy + dy;
          if (ux >= 0 && uy >= 0 && ux < img.width && uy < img.height && img.data[(uy * img.width + ux) * 4] < 128 && (dx === 0 || dy === 0)) dark = true;
        }
      }
      const i = (y * w + x) * 4;
      if (dark) { data[i] = data[i + 1] = data[i + 2] = 0; }
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

export function describe(entry) {
  const rooms = Object.entries(entry.rooms || {}).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} x${n}`).join(", ") || "not known";
  return `Symbol size: ${entry.w} x ${entry.h} cm (long side first). Found ${entry.count} times on ${entry.sheets} sheets. Rooms it stood in: ${rooms}. Which item is it?`;
}

async function ask(base, key, entry, png) {
  const res = await fetch(base + "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model: "blueprint-vision", temperature: 0, top_p: 1, max_tokens: 200, stream: false, chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_schema", json_schema: { name: "symbol_label", strict: true, schema: SCHEMA } },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: describe(entry) }, { type: "image_url", image_url: { url: "data:image/png;base64," + png.toString("base64") } }] },
      ],
    }),
  });
  if (!res.ok) throw new Error("llama-server " + res.status);
  const body = await res.json();
  return JSON.parse(body.choices?.[0]?.message?.content || "{}");
}

/** Carry labels.json onto library.json and every instance (instances_labelled.jsonl). */
export function applyLabels(dir) {
  const labels = JSON.parse(readFileSync(join(dir, "labels.json"), "utf8"));
  const library = JSON.parse(readFileSync(join(dir, "library.json"), "utf8"));
  for (const e of library) if (labels[e.id]) e.label = labels[e.id].label;
  writeFileSync(join(dir, "library.json"), JSON.stringify(library, null, 1));
  const byId = new Map(library.map((e) => [e.id, e.label]));
  const lines = readFileSync(join(dir, "instances.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => {
    const r = JSON.parse(l);
    return JSON.stringify({ ...r, label: byId.get(r.entry) || null });
  });
  writeFileSync(join(dir, "instances_labelled.jsonl"), lines.join("\n") + "\n");
  return { entries: library.filter((e) => e.label).length, instances: lines.length };
}

export async function runLabels(options) {
  const dir = join(options.dir, "symbols");
  if (options.apply) return applyLabels(dir);
  const base = options.base || "http://127.0.0.1:8078";
  const key = readFileSync(options.key || ".local/blueprint-vision/api-key", "utf8").trim();
  const library = JSON.parse(readFileSync(join(dir, "library.json"), "utf8"));
  const labelsFile = join(dir, "labels.json");
  const labels = existsSync(labelsFile) && !options.again ? JSON.parse(readFileSync(labelsFile, "utf8")) : {};
  let todo = library.filter((e) => existsSync(join(dir, "examples", e.id + ".png")) && !labels[e.id]);
  if (options.limit) todo = todo.slice(0, Number(options.limit));
  let n = 0;
  for (const entry of todo) {
    const png = encodePNG(enlarge(decodePNG(readFileSync(join(dir, "examples", entry.id + ".png")))));
    try {
      const t0 = Date.now();
      const answer = await ask(base, key, entry, png);
      labels[entry.id] = { label: answer.label, confidence: answer.confidence, w: entry.w, h: entry.h, rule: entry.name || null };
      console.log(`${++n}/${todo.length} ${entry.id} ${entry.w}x${entry.h} -> ${answer.label} (${answer.confidence}) ${entry.name ? "[rule: " + entry.name + "]" : ""} ${Date.now() - t0}ms`);
    } catch (e) {
      console.log(`! ${entry.id}: ${e.message}`);
    }
    writeFileSync(labelsFile, JSON.stringify(labels, null, 1));
  }
  return applyLabels(dir);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = args(process.argv.slice(2));
  if (!options.dir) { console.error("usage: --dir <harvest dir>"); process.exit(1); }
  console.log(await runLabels(options));
}

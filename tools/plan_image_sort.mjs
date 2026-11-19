// Sort the harvested project images (tools/plan_harvest.mjs --images) with
// the local vision model behind llama-server (.local/blueprint-vision): what
// each image shows (floor plan, interior render, exterior, site, ...), and for
// interiors the room, the design style, the floor finish and the furniture
// and fixtures in view. The answers feed furniture and design import; floor
// plans found among the images join the raster plan set.
//
//   node tools/plan_image_sort.mjs --dir bench/harvest/il [--thumbs thumbs] [--limit N] [--base http://127.0.0.1:8078]
//
// Reads <dir>/images.jsonl and the downscaled JPEG copies in <dir>/<thumbs>
// (one <sha>.jpg per image); appends one row per image to
// <dir>/images_sorted.jsonl and skips images already sorted, so a stopped
// run resumes.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const IMAGE_KINDS = ["floor_plan", "interior", "exterior", "aerial_or_site", "lobby_or_amenity", "people_lifestyle", "map", "logo_or_graphic", "other"];
export const ROOMS = ["living", "kitchen", "dining", "bedroom", "kids_room", "bathroom", "study", "hallway", "balcony", "lobby", "gym", "pool", "none"];
export const STYLES = ["modern", "minimal", "scandinavian", "industrial", "classic", "mediterranean", "luxury", "rustic", "none"];
export const FLOORS = ["wood", "tile", "stone", "concrete", "carpet", "none"];
export const ITEMS = [
  "sofa", "armchair", "coffee_table", "side_table", "dining_table", "dining_chair", "bar_stool", "kitchen_island", "kitchen_cabinets",
  "hob", "oven", "fridge", "range_hood", "bed", "bunk_bed", "crib", "nightstand", "wardrobe", "dresser", "desk", "office_chair",
  "bookshelf", "tv_unit", "tv", "rug", "curtains", "pendant_lamp", "floor_lamp", "table_lamp", "ceiling_light", "plant", "artwork",
  "mirror", "bathtub", "shower", "washbasin", "vanity", "toilet", "outdoor_furniture", "fireplace", "stairs", "window", "door",
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "room", "style", "floor", "items"],
  properties: {
    kind: { type: "string", enum: IMAGE_KINDS },
    room: { type: "string", enum: ROOMS },
    style: { type: "string", enum: STYLES },
    floor: { type: "string", enum: FLOORS },
    items: { type: "array", maxItems: 14, items: { type: "string", enum: ITEMS } },
  },
};

const SYSTEM = "You sort images from Israeli residential real-estate project websites. " +
  "kind: floor_plan = a 2D apartment or floor drawing seen from above (coloured marketing plans included); interior = a photo or 3D render inside a home; " +
  "exterior = a building facade or street view; aerial_or_site = a bird's-eye view, site plan or neighbourhood render; lobby_or_amenity = an entrance lobby, gym, pool or shared space; " +
  "people_lifestyle = people are the subject; map = a location map; logo_or_graphic = logos, icons, text banners. " +
  "For interiors give the room, the design style, the main floor finish and every furniture item or fixture clearly visible. " +
  "For anything that is not an interior use room 'none', style 'none', floor 'none' and an empty item list.";

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

/** A short hint from the image's own name and alt text (often "Bedroom_01"). */
export function nameHint(row) {
  let file = "";
  try { file = decodeURIComponent(new URL(row.url).pathname.split("/").pop() || ""); } catch { /* keep empty */ }
  file = file.replace(/\.[a-z0-9]+$/i, "").replace(/^[0-9a-f]{20,}_/i, "").replace(/[-_]+/g, " ").trim();
  const parts = [file && `file name "${file.slice(0, 80)}"`, row.label && `alt text "${String(row.label).slice(0, 80)}"`].filter(Boolean);
  return parts.length ? `Hints (may be wrong): ${parts.join(", ")}.` : "";
}

/** Keep a model answer only when every field is in its enum; drop unknown or repeated items. */
export function cleanAnswer(a) {
  if (!a || !IMAGE_KINDS.includes(a.kind)) return null;
  const interior = a.kind === "interior" || a.kind === "lobby_or_amenity";
  return {
    kind: a.kind,
    room: interior && ROOMS.includes(a.room) ? a.room : "none",
    style: interior && STYLES.includes(a.style) ? a.style : "none",
    floor: interior && FLOORS.includes(a.floor) ? a.floor : "none",
    items: interior ? [...new Set((a.items || []).filter((x) => ITEMS.includes(x)))] : [],
  };
}

async function ask(base, key, jpg, hint) {
  const res = await fetch(base + "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model: "blueprint-vision", temperature: 0, top_p: 1, max_tokens: 220, stream: false, chat_template_kwargs: { enable_thinking: false },
      response_format: { type: "json_schema", json_schema: { name: "image_sort", strict: true, schema: SCHEMA } },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: ("What does this image show? " + hint).trim() }, { type: "image_url", image_url: { url: "data:image/jpeg;base64," + jpg.toString("base64") } }] },
      ],
    }),
  });
  if (!res.ok) throw new Error("llama-server " + res.status);
  const body = await res.json();
  return JSON.parse(body.choices?.[0]?.message?.content || "{}");
}

export async function runSort(options) {
  const dir = options.dir;
  const thumbs = join(dir, options.thumbs || "thumbs");
  const base = options.base || "http://127.0.0.1:8078";
  const key = readFileSync(options.key || ".local/blueprint-vision/api-key", "utf8").trim();
  const outFile = join(dir, "images_sorted.jsonl");
  const done = new Set(existsSync(outFile) ? readFileSync(outFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).sha) : []);
  const seen = new Set();
  let todo = readFileSync(join(dir, "images.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.kind === "image" && r.sha256 && !r.dup && !done.has(r.sha256) && !seen.has(r.sha256) && seen.add(r.sha256))
    .filter((r) => existsSync(join(thumbs, r.sha256 + ".jpg")));
  if (options.only) todo = todo.filter((r) => r.site === options.only);
  if (options.limit) todo = todo.slice(0, Number(options.limit));
  const t0 = Date.now();
  let n = 0, failed = 0;
  for (const row of todo) {
    try {
      const answer = cleanAnswer(await ask(base, key, readFileSync(join(thumbs, row.sha256 + ".jpg")), nameHint(row)));
      if (!answer) throw new Error("answer outside the schema");
      appendFileSync(outFile, JSON.stringify({ sha: row.sha256, site: row.site, page: row.page, ...answer }) + "\n");
    } catch (e) {
      failed++;
      console.log(`! ${row.sha256.slice(0, 10)}: ${e.message}`);
    }
    if (++n % 50 === 0) console.log(`${n}/${todo.length} sorted, ${failed} failed, ${((Date.now() - t0) / n / 1000).toFixed(1)} s each`);
  }
  console.log(`done: ${n - failed} sorted, ${failed} failed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = args(process.argv.slice(2));
  if (!options.dir) { console.error("usage: --dir <harvest dir>"); process.exit(1); }
  await runSort(options);
}

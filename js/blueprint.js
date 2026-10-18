// Blueprint-to-draft parsers. Automatic analysis combines browser geometry/OCR
// with the local vision service; the walls-only parser runs in the browser.
import { blueprintSymbols } from './core/blueprint_symbols.js';
import { recognizeRaster } from './core/blueprint_raster.js';
import { readBlueprintText } from './blueprint_ocr.js';
import { refineBlueprintFurniture } from './core/blueprint_furniture.js';
import { refineBlueprintOpenings } from './core/blueprint_openings.js';

export const BP_ENDPOINT = "http://localhost:11434";
// blueprint_cv.py --serve (tools/): classic-CV parser, no model inference
export const CV_ENDPOINT = "http://localhost:8077";

export const BP_MODELS = [
  { id: "qwen3.8-27b", label: "Qwen 3.8 27B" },
  { id: "gemma4:12b-instruct-q8_0", label: "Gemma 4 12B (8-bit)" },
  { id: "qwen3.6-vl:27b-q4_K_M", label: "Qwen 3.6 27B (4-bit)" },
  { id: "gemma4:e4b", label: "Gemma 4 E4B (light)" },
];

// Engine choices for the import modal. "browser" needs no service.
// "cv" runs tools/blueprint_cv.py
// (geometry via OpenCV, heuristic room names); "cv+<model>" is the hybrid —
// CV geometry plus the VLM reading only the printed room labels; a bare
// model id is the original full-VLM parse.
export const BP_ENGINES = [
  { id: "auto", label: "Automatic · full image analysis" },
  { id: "browser", label: "Walls only (offline)" },
  { id: "cv", label: "OpenCV (fast, no AI)" },
].concat(
  BP_MODELS.map(function (m) {
    return { id: "cv+" + m.id, label: "OpenCV + " + m.label + " labels" };
  }),
  BP_MODELS.map(function (m) {
    return { id: m.id, label: m.label + " (full VLM)" };
  })
);

async function decodeBlueprint(file) {
  if (!file || file.size > 20 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('This image could not be decoded. Choose a JPG, PNG or WebP.'));
      image.src = url;
    });
    const factor = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * factor);
    canvas.height = Math.round(image.naturalHeight * factor);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

export async function parseBlueprintLocal(file, opts = {}) {
  const canvas=await decodeBlueprint(file);
  opts.onProgress?.('vision');
  let wallCandidates=null,openingCandidates=[],geometryWarning=null;
  // Prefer actual measured strokes to asking a small vision model to invent a
  // coordinate grid. Complex/non-orthogonal images can use the full vision path.
  try{
    const factor=Math.min(1,1000/Math.max(canvas.width,canvas.height));
    const small=document.createElement('canvas');small.width=Math.round(canvas.width*factor);small.height=Math.round(canvas.height*factor);
    const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,small.width,small.height);
    const raster=recognizeRaster(ctx.getImageData(0,0,small.width,small.height),{widthCm:opts.widthCm||1000});
    wallCandidates=raster.segments.map(s=>s.vertical?[s.c/factor,s.a/factor,s.c/factor,s.b/factor,s.thickness/factor]:[s.a/factor,s.c/factor,s.b/factor,s.c/factor,s.thickness/factor]);
    const px=raster.layout.w/(raster.bounds.x1-raster.bounds.x0);
    for(const type of ['door','window'])for(const o of raster.cad[type+'s']){
      const x=(o.center.x/px+raster.bounds.x0)/factor,y=(o.center.z/px+raster.bounds.y0)/factor;
      openingCandidates.push({type,x,y,width:o.width/px/factor});
    }
  }catch{geometryWarning='Measured wall extraction failed; image-estimated geometry needs manual review.';}
  let ocr=null;
  try{ocr=await readBlueprintText(canvas,wallCandidates||[],opts);}
  catch(error){if(error.name==='AbortError')throw error;ocr={rooms:[],dimensions:[],warnings:['Local text recognition failed; labels and dimensions need extra review.']};}
  if(geometryWarning)ocr.warnings=[...(ocr.warnings||[]),geometryWarning];
  const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
  // Raster candidates already passed colour, continuity and junction tests.
  // A semantic model must not erase a measured bathroom partition.
  const protectedWalls=(wallCandidates||[]).map((_,i)=>i);
  const symbols=blueprintSymbols(pixels,wallCandidates||[],ocr?.textBoxes||[]);
  const symbolBatches=[];
  function cropFor(s){
    const size=512,padding=Math.max(12,Math.max(s.w,s.d)*.25);
    const sx=Math.max(0,s.x-s.w/2-padding),sy=Math.max(0,s.y-s.d/2-padding);
    const sw=Math.min(canvas.width-sx,s.w+padding*2),sh=Math.min(canvas.height-sy,s.d+padding*2),factor=Math.min((size-12)/sw,(size-12)/sh);
    const crop=document.createElement('canvas');crop.width=crop.height=size;const mc=crop.getContext('2d');
    mc.fillStyle='#fff';mc.fillRect(0,0,size,size);const x=(size-sw*factor)/2,y=(size-sh*factor)/2;
    mc.drawImage(canvas,sx,sy,sw,sh,x,y,sw*factor,sh*factor);
    const bx=x+(s.x-s.w/2-sx)*factor,by=y+(s.y-s.d/2-sy)*factor,bw=s.w*factor,bh=s.d*factor;
    mc.fillStyle='rgba(255,255,255,.5)';mc.fillRect(0,0,size,by);mc.fillRect(0,by+bh,size,size-by-bh);
    mc.fillRect(0,by,bx,bh);mc.fillRect(bx+bw,by,size-bx-bw,bh);
    mc.strokeStyle='#e000b5';mc.lineWidth=2;mc.strokeRect(bx,by,bw,bh);
    return crop.toDataURL('image/jpeg',.92);
  }
  for(let i=0;i<symbols.length;i+=6){const list=symbols.slice(i,i+6);symbolBatches.push({ids:list.map(s=>s.id),images:list.map(cropFor)});}
  opts.onProgress?.('vision');
  const sourceDataUrl=canvas.toDataURL('image/jpeg',.9);
  const response=await fetch('/api/blueprint',{method:'POST',headers:{'Content-Type':'application/json'},signal:opts.signal,
    body:JSON.stringify({image:sourceDataUrl,width:canvas.width,height:canvas.height,wallCandidates,protectedWalls,symbols,symbolImage:symbolBatches[0]?.images[0]||canvas.toDataURL('image/jpeg',.9),symbolBatches,openingCandidates,ocr,widthCm:opts.widthCm||1000,usePrintedScale:opts.usePrintedScale!==false})});
  let result;
  try{result=await response.json();}catch{throw new Error('The app server does not support image analysis yet. Restart npm start, then retry.');}
  if(!response.ok)throw new Error(result.error||'Image analysis failed.');
  result.sourceDataUrl=sourceDataUrl;
  if(result.recognition&&symbols.length)result.recognition.symbolGeometry='measured';
  refineBlueprintOpenings(result,pixels);
  return refineBlueprintFurniture(result,pixels);
}

export async function parseBlueprintRaster(file, opts = {}) {
  const source=await decodeBlueprint(file);
  const factor=Math.min(1,1000/Math.max(source.width,source.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(source.width*factor);canvas.height=Math.round(source.height*factor);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
  opts.onProgress?.('cv');
  await new Promise(resolve=>setTimeout(resolve,0));
  const result=recognizeRaster(ctx.getImageData(0,0,canvas.width,canvas.height),opts);
  result.sourceDataUrl=canvas.toDataURL('image/jpeg',.88);
  return result;
}

// Hard-coded "light training" module: system prompt + few-shot example.
// Injected verbatim into every request.
export const BP_SYSTEM_PROMPT =
  'You are an expert architectural parser. Analyze the provided 2D floor plan image. ' +
  'Translate Hebrew labels to English (e.g., \'ממ"ד\' = \'Safe Room\', \'מרפסת\' = \'Balcony\'). ' +
  'Extract room dimensions and wall lines. Return ONLY valid JSON matching the provided schema, ' +
  'with no conversational filler.';

export const BP_FEWSHOT = {
  floorplan: {
    rooms: [
      {
        id: "room_1",
        original_label: 'ממ"ד',
        translated_label: "Safe Room",
        dimensions: { width: 300, length: 315 },
        features: ["reinforced_window"],
      },
    ],
    walls: [
      { id: "w1", type: "exterior", thickness: 20, length: 700 },
    ],
  },
};

// Structured error so the UI can pick the right fallback state.
// kind: "offline" | "no-model" | "oom" | "bad-json" | "empty"
export class BlueprintError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.kind = kind;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- image prep

// Downscale to keep prefill cheap and avoid unified-memory blowups on the M2
// Pro, then return the raw base64 payload (no data: prefix — Ollama wants it
// bare). JPEG at 0.85 unless the source is a PNG small enough to keep as-is.
export function imageToBase64(file, maxDim = 1568) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; // flatten alpha: blueprints scan white
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = cv.toDataURL("image/jpeg", 0.85);
      resolve({ b64: dataUrl.split(",")[1], width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new BlueprintError("bad-json", "Could not decode image file"));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------- VLM call

function buildChatPayload(model, b64) {
  return {
    model,
    stream: false,
    format: "json",
    options: { temperature: 0 },
    messages: [
      { role: "system", content: BP_SYSTEM_PROMPT },
      { role: "user", content: "Example output format:" },
      { role: "assistant", content: JSON.stringify(BP_FEWSHOT, null, 2) },
      {
        role: "user",
        content:
          "Parse this floor plan image into the same JSON schema. All dimensions in centimeters.",
        images: [b64],
      },
    ],
  };
}

// Older Ollama builds only expose /api/generate; fold the few-shot into the prompt.
function buildGeneratePayload(model, b64) {
  return {
    model,
    stream: false,
    format: "json",
    options: { temperature: 0 },
    system: BP_SYSTEM_PROMPT,
    prompt:
      "Example output format:\n" +
      JSON.stringify(BP_FEWSHOT, null, 2) +
      "\n\nParse this floor plan image into the same JSON schema. All dimensions in centimeters.",
    images: [b64],
  };
}

function buildOpenAIPayload(model, b64) {
  return {
    model,
    stream: false,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: BP_SYSTEM_PROMPT },
      { role: "user", content: "Example output format:\n" + JSON.stringify(BP_FEWSHOT, null, 2) },
      {
        role: "user",
        content: [
          { type: "text", text: "Parse this floor plan image into the same JSON schema. All dimensions in centimeters." },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + b64 } }
        ],
      },
    ],
  };
}

async function post(endpoint, path, payload, signal) {
  let res;
  try {
    res = await fetch(endpoint + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError")
      throw new BlueprintError("oom", "Model timed out — likely out of memory");
    // fetch rejects on connection-refused and on CORS; both mean "fix Ollama setup"
    throw new BlueprintError("offline", "Local model server unreachable", e.message);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404 && /model/i.test(body))
      throw new BlueprintError("no-model", "Model not pulled", body);
    if (res.status === 404) return null; // endpoint missing → caller falls back
    throw new BlueprintError("offline", "Model server error " + res.status, body);
  }
  return res.json();
}

export async function callVLM(model, b64, timeoutMs = 180000, endpoint = BP_ENDPOINT) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    if (endpoint.includes("/v1")) {
      let data = await post(endpoint, "/chat/completions", buildOpenAIPayload(model, b64), ctl.signal);
      if (data && data.choices && data.choices[0] && data.choices[0].message) 
        return data.choices[0].message.content;
    }

    let data = await post(endpoint, "/api/chat", buildChatPayload(model, b64), ctl.signal);
    if (data) return data.message ? data.message.content : data.response;
    data = await post(endpoint, "/api/generate", buildGeneratePayload(model, b64), ctl.signal);
    if (!data) throw new BlueprintError("offline", "No compatible API endpoint found");
    return data.response;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- parsing

// Strip filler/fences, take the outermost {...}. If braces don't balance the
// model was likely killed mid-generation (OOM) — try a truncation repair by
// closing open strings/brackets, and tag the result so the UI can warn.
export function extractJSON(text) {
  if (!text || typeof text !== "string")
    throw new BlueprintError("empty", "Model returned no content");
  const start = text.indexOf("{");
  if (start < 0) throw new BlueprintError("bad-json", "No JSON object in response", text);
  let raw = text.slice(start);
  const lastBrace = raw.lastIndexOf("}");
  if (lastBrace >= 0) {
    try {
      return { data: JSON.parse(raw.slice(0, lastBrace + 1)), repaired: false };
    } catch (e) {
      /* fall through to repair */
    }
  }
  // Truncation repair: walk the string tracking nesting, then close everything.
  let stack = [], inStr = false, esc = false, end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  // drop a trailing partial token (e.g. `"widt`) back to the last safe comma/bracket
  let cut = raw.slice(0, end).replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "");
  if (inStr) cut += '"';
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) suffix += stack[i] === "{" ? "}" : "]";
  try {
    return { data: JSON.parse(cut + suffix), repaired: true };
  } catch (e) {
    throw new BlueprintError("oom", "Response JSON is truncated beyond repair", text.slice(-200));
  }
}

// ---------------------------------------------------------------- validation

const DIM_MIN = 100, DIM_MAX = 1500; // sane room side lengths, cm

export function validateFloorplan(data) {
  const fp = data && data.floorplan ? data.floorplan : data;
  if (!fp || !Array.isArray(fp.rooms) || fp.rooms.length === 0)
    throw new BlueprintError("empty", "No rooms found in the parsed plan");
  const warnings = [];
  const rooms = fp.rooms.map((r, i) => {
    const d = r.dimensions || {};
    let w = Number(d.width), l = Number(d.length);
    if (!isFinite(w) || w <= 0) { w = 300; warnings.push((r.translated_label || "room " + (i + 1)) + ": missing width, assumed 300"); }
    if (!isFinite(l) || l <= 0) { l = 300; warnings.push((r.translated_label || "room " + (i + 1)) + ": missing length, assumed 300"); }
    const cw = Math.max(DIM_MIN, Math.min(DIM_MAX, w));
    const cl = Math.max(DIM_MIN, Math.min(DIM_MAX, l));
    if (cw !== w || cl !== l)
      warnings.push((r.translated_label || "room " + (i + 1)) + `: dimensions clamped (${w}×${l} → ${cw}×${cl})`);
    return {
      id: r.id || "room_" + (i + 1),
      original_label: r.original_label || "",
      translated_label: r.translated_label || r.original_label || "Room " + (i + 1),
      width: cw,
      length: cl,
      x: isFinite(Number(r.x)) ? Number(r.x) : null,
      y: isFinite(Number(r.y)) ? Number(r.y) : null,
      features: Array.isArray(r.features) ? r.features : [],
      clamped: cw !== w || cl !== l,
    };
  });
  const walls = (Array.isArray(fp.walls) ? fp.walls : []).map((w, i) => ({
    id: w.id || "w" + (i + 1),
    type: w.type === "exterior" ? "exterior" : "interior",
    thickness: isFinite(Number(w.thickness)) ? Number(w.thickness) : 20,
    length: isFinite(Number(w.length)) ? Number(w.length) : 0,
  }));
  return { rooms, walls, warnings };
}

// ---------------------------------------------------------------- adapter

const WET = /bath|toilet|shower|wc|laundry/i;
const OUTDOOR = /balcony|terrace|porch/i;

function floorFor(room) {
  if (OUTDOOR.test(room.translated_label)) return "balcony";
  if (WET.test(room.translated_label) || /kitchen/i.test(room.translated_label)) return "tiles";
  return "wood";
}

// Convert the validated floorplan into the rooms/doors/windows layout schema
// of generator.js. When the VLM supplies x/y positions we trust them; otherwise
// we shelf-pack rooms (largest first) into rows targeting a roughly square
// apartment footprint. Adjacent rooms then share walls via buildLayout's
// node-merge pass, and every interior room gets a door to its largest neighbor.
export function toLayout(fp) {
  const rooms = fp.rooms.slice();
  const positioned = rooms.every((r) => r.x !== null && r.y !== null);
  let placed;
  if (positioned) {
    placed = rooms.map((r) => ({ ...r, x0: r.x, z0: r.y, x1: r.x + r.width, z1: r.y + r.length }));
  } else {
    const totalArea = rooms.reduce((a, r) => a + r.width * r.length, 0);
    const targetW = Math.max(400, Math.round(Math.sqrt(totalArea) / 10) * 10);
    placed = [];
    let cx = 0, cz = 0, rowH = 0;
    rooms
      .slice()
      .sort((a, b) => b.width * b.length - a.width * a.length)
      .forEach((r) => {
        if (cx > 0 && cx + r.width > targetW) { cz += rowH; cx = 0; rowH = 0; }
        placed.push({ ...r, x0: cx, z0: cz, x1: cx + r.width, z1: cz + r.length });
        cx += r.width;
        rowH = Math.max(rowH, r.length);
      });
    // stretch each row's rooms to a common depth so walls actually meet
    const rows = {};
    placed.forEach((p) => { (rows[p.z0] = rows[p.z0] || []).push(p); });
    Object.values(rows).forEach((row) => {
      const depth = Math.max(...row.map((p) => p.z1 - p.z0));
      row.forEach((p) => { p.z1 = p.z0 + depth; });
    });
  }

  const w = Math.max(...placed.map((p) => p.x1));
  const d = Math.max(...placed.map((p) => p.z1));

  const layoutRooms = placed.map((p) => ({
    name: p.translated_label,
    x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1,
    floor: floorFor(p),
    // carried through for the preview canvas (buildLayout ignores extras);
    // placed[] is sorted by area, so index-pairing with fp.rooms would mislabel
    original_label: p.original_label,
    clamped: p.clamped,
  }));

  // Doors: connect each room to its most-adjacent neighbor (longest shared edge).
  const doors = [];
  const connected = new Set([layoutRooms[0] && layoutRooms[0].name]);
  const shared = (a, b) => {
    const eps = 1;
    let len = 0;
    if (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps)
      len = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    else if (Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps)
      len = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    return Math.max(0, len);
  };
  layoutRooms.slice(1).forEach((r) => {
    let best = null, bestLen = 0;
    layoutRooms.forEach((o) => {
      if (o === r || !connected.has(o.name)) return;
      const s = shared(r, o);
      if (s > bestLen) { bestLen = s; best = o; }
    });
    if (best && bestLen >= 90) {
      doors.push({ from: best.name, to: r.name, width: WET.test(r.name) ? 70 : 80, s: Math.min(100, bestLen / 2) });
      connected.add(r.name);
    }
  });
  // entrance on the biggest non-wet room's bottom wall
  const main = layoutRooms.slice().sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))
    .find((r) => !WET.test(r.name)) || layoutRooms[0];
  doors.push({ from: "Outside", to: main.name, width: 90, s: 80, wall: "bottom" });

  // Windows: every room gets one; reinforced_window and wet rooms get small ones.
  const windows = placed.map((p) => {
    const reinforced = p.features.includes("reinforced_window");
    const wet = WET.test(p.translated_label);
    return {
      room: p.translated_label,
      width: reinforced ? 100 : wet ? 60 : 120,
      height: wet ? 60 : 120,
      sill: wet ? 140 : 90,
    };
  });

  return { w, d, rooms: layoutRooms, doors, windows };
}

// ---------------------------------------------------------------- CV pipeline

// Parse via the local OpenCV service (tools/blueprint_cv.py --serve).
// opts: { widthCm, ollamaModel (hybrid labels; null = heuristic names),
// onProgress }. Returns the same result shape as parseBlueprint so the
// modal's preview/apply path is shared; the CV service already emits the
// buildLayout schema, so no toLayout adaptation is needed.
export async function parseBlueprintCV(file, opts = {}) {
  const progress = opts.onProgress || (() => {});
  progress(opts.ollamaModel ? "infer" : "cv");
  const q = new URLSearchParams({ width_cm: opts.widthCm || 1000 });
  if (opts.ollamaModel) q.set("ollama", opts.ollamaModel);
  let res;
  try {
    res = await fetch(CV_ENDPOINT + "/parse?" + q.toString(), {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: await file.arrayBuffer(),
    });
  } catch (e) {
    throw new BlueprintError("cv-offline", "CV parser service unreachable", e.message);
  }
  progress("parse");
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new BlueprintError("bad-json", "CV parser returned invalid JSON");
  }
  if (!res.ok)
    throw new BlueprintError("bad-json", data.error || "CV parser error " + res.status);
  if (!data.rooms || !data.rooms.length)
    throw new BlueprintError("empty", "No rooms detected in the plan");
  const warnings = (data.meta && data.meta.warnings) || [];
  // synthetic floorplan so the shared preview canvas has what it expects
  const floorplan = { rooms: data.rooms, walls: [], warnings };
  return { floorplan, layout: data, repaired: false, warnings };
}

// ---------------------------------------------------------------- pipeline

// Full pipeline. onProgress(stageKey) with: "encode" | "infer" | "parse".
// Returns { floorplan, layout, repaired, warnings, imageSize }.
export async function parseBlueprint(file, opts = {}) {
  const model = opts.model || BP_MODELS[0].id;
  const endpoint = opts.endpoint || BP_ENDPOINT;
  const maxDim = opts.maxDim || 1568;
  const progress = opts.onProgress || (() => {});

  progress("encode");
  const { b64, width, height } = await imageToBase64(file, maxDim);

  progress("infer");
  const text = await callVLM(model, b64, opts.timeoutMs, endpoint);

  progress("parse");
  const { data, repaired } = extractJSON(text);
  const floorplan = validateFloorplan(data);
  const layout = toLayout(floorplan);
  return { floorplan, layout, repaired, warnings: floorplan.warnings, imageSize: { width, height } };
}

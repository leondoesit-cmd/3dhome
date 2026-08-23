// Calibrated blueprint underlay shared by the import UI, 2D renderer and wall
// snapping. The stored reference is deliberately plain JSON (including the
// raster data URL), so Save/Export keeps the sheet with the plan and reopening
// a project does not depend on the original local file still existing.
import { S, fin } from "./state.js";
import { t } from "./i18n.js";

const PDF_MODULE = "../vendor/pdfjs/pdf.min.mjs";
const PDF_WORKER = "../vendor/pdfjs/pdf.worker.min.mjs";
/* The raster is stored inside the project JSON so a reopened plan does not
   depend on the original file — which means it lands in localStorage, against
   a ~5 MB quota shared with the whole scene. 2400 px at q0.92 is 1–2 MB, ~1.4–
   2.8 MB once base64'd, so a scanned plan plus a furnished project blew the
   quota routinely. Trace legibility needs resolution, not fidelity: encode
   smaller and step down until the payload fits a sane share of the budget. */
const MAX_RASTER = 1600;
const TARGET_BYTES = 900 * 1024;
const QUALITY_STEPS = [0.82, 0.7, 0.58];
const MIN_RASTER = 900;

let cachedUrl = "";
let cachedImage = null;

function event(name, detail) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
}

function loadImage(url) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error(t("bp_trace_decode"))); };
    img.src = url;
  });
}

function rasterCanvas(width, height) {
  var canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function downscale(canvas, factor) {
  var next = rasterCanvas(canvas.width * factor, canvas.height * factor);
  var ctx = next.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, next.width, next.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, next.width, next.height);
  return next;
}

/* Encode down to a payload the project JSON can actually carry. Quality goes
   first (a blueprint is line art, so ringing costs less than pixels), then
   resolution, and never below MIN_RASTER — an unreadable underlay is worse
   than a large one. */
function jpegResult(canvas, meta) {
  var current = canvas, url = "", q;
  for (var pass = 0; pass < 4; pass++) {
    for (q = 0; q < QUALITY_STEPS.length; q++) {
      url = current.toDataURL("image/jpeg", QUALITY_STEPS[q]);
      if (url.length <= TARGET_BYTES) break;
    }
    if (url.length <= TARGET_BYTES) break;
    if (Math.max(current.width, current.height) * 0.75 < MIN_RASTER) break;
    current = downscale(current, 0.75);
  }
  return Object.assign({
    dataUrl: url,
    width: current.width,
    height: current.height,
    bytes: url.length,
  }, meta || {});
}

async function rasterizeImage(file, maxDimension) {
  var url = URL.createObjectURL(file);
  try {
    var img = await loadImage(url);
    var scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    var canvas = rasterCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return jpegResult(canvas, { page: 1, pageCount: 1, sourceType: "image" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function rasterizePdf(file, pageNumber, maxDimension) {
  // Keep the import indirect so the 1.7 MB renderer/worker remain off the
  // critical boot graph; PDF.js is fetched only after a PDF is actually chosen.
  var pdfjs = await import(PDF_MODULE);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(PDF_WORKER, import.meta.url).href;
  var bytes = new Uint8Array(await file.arrayBuffer());
  var doc = await pdfjs.getDocument({ data: bytes }).promise;
  var pageNo = Math.max(1, Math.min(doc.numPages, pageNumber || 1));
  var page = await doc.getPage(pageNo);
  var base = page.getViewport({ scale: 1 });
  var scale = Math.min(3, maxDimension / Math.max(base.width, base.height));
  var viewport = page.getViewport({ scale: scale });
  var canvas = rasterCanvas(viewport.width, viewport.height);
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: viewport }).promise;
  var result = jpegResult(canvas, {
    page: pageNo,
    pageCount: doc.numPages,
    sourceType: "pdf",
  });
  if (doc.destroy) await doc.destroy();
  return result;
}

export async function rasterizeBlueprint(file, options) {
  if (!file) throw new Error(t("bp_trace_badfile"));
  options = options || {};
  var maxDimension = Math.max(800, Math.min(3600, options.maxDimension || MAX_RASTER));
  var isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  var isImage = /^image\/(png|jpeg|jpg|webp)$/i.test(file.type || "");
  if (isPdf) return rasterizePdf(file, options.page || 1, maxDimension);
  if (isImage) return rasterizeImage(file, maxDimension);
  throw new Error(t("bp_trace_badfile"));
}

export function calibrationScale(p1, p2, distanceCm) {
  var px = p1 && p2 ? Math.hypot(p2.x - p1.x, p2.y - p1.y) : 0;
  if (!fin(px) || px < 4 || !fin(distanceCm) || distanceCm <= 0) return null;
  return distanceCm / px;
}

export function pixelToWorld(ref, point) {
  if (!ref || !point) return null;
  var scale = ref.cmPerPx;
  if (!fin(scale) || scale <= 0) return null;
  var x = (point.x - ref.width / 2) * scale;
  var z = (point.y - ref.height / 2) * scale;
  var a = fin(ref.rotation) ? ref.rotation : 0;
  var ca = Math.cos(a), sa = Math.sin(a);
  return {
    x: (ref.originX || 0) + x * ca - z * sa,
    z: (ref.originZ || 0) + x * sa + z * ca,
  };
}

export function makeBlueprintReference(raster, p1, p2, distanceCm, straighten, name) {
  var cmPerPx = calibrationScale(p1, p2, distanceCm);
  if (!cmPerPx) throw new Error(t("bp_trace_cal_error"));
  var rotation = straighten
    ? -Math.atan2(p2.y - p1.y, p2.x - p1.x)
    : 0;
  var ref = {
    version: 1,
    name: name || t("bp_trace_sheet"),
    dataUrl: raster.dataUrl,
    width: raster.width,
    height: raster.height,
    cmPerPx: cmPerPx,
    rotation: rotation,
    originX: 0,
    originZ: 0,
    opacity: 0.55,
    visible: true,
    sourceType: raster.sourceType || "image",
    page: raster.page || 1,
    calibration: {
      p1: { x: p1.x, y: p1.y },
      p2: { x: p2.x, y: p2.y },
      distanceCm: distanceCm,
    },
  };
  ref.guidePoints = [pixelToWorld(ref, p1), pixelToWorld(ref, p2)];
  return ref;
}

export function blueprintBounds(ref) {
  ref = ref || S.blueprintTrace;
  if (!ref || !fin(ref.width) || !fin(ref.height) || !fin(ref.cmPerPx)) return null;
  var pts = [
    pixelToWorld(ref, { x: 0, y: 0 }),
    pixelToWorld(ref, { x: ref.width, y: 0 }),
    pixelToWorld(ref, { x: ref.width, y: ref.height }),
    pixelToWorld(ref, { x: 0, y: ref.height }),
  ];
  var xs = pts.map(function (p) { return p.x; });
  var zs = pts.map(function (p) { return p.z; });
  var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
  var minz = Math.min.apply(null, zs), maxz = Math.max.apply(null, zs);
  return {
    minx: minx, maxx: maxx, minz: minz, maxz: maxz,
    w: maxx - minx, d: maxz - minz,
    cx: (minx + maxx) / 2, cz: (minz + maxz) / 2,
  };
}

// only the raster types this module actually produces — an SVG data URL can
// pull in outside resources, and nothing here ever writes one
const RASTER_URL = /^data:image\/(png|jpeg|jpg|webp);/i;

export function normalizeBlueprintReference(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.dataUrl !== "string" || !RASTER_URL.test(value.dataUrl))
    return null;
  if (!fin(value.width) || value.width <= 0 || !fin(value.height) || value.height <= 0)
    return null;
  if (!fin(value.cmPerPx) || value.cmPerPx <= 0) return null;
  var out = Object.assign({}, value);
  out.opacity = fin(value.opacity) ? Math.max(0.05, Math.min(1, value.opacity)) : 0.55;
  out.rotation = fin(value.rotation) ? value.rotation : 0;
  out.originX = fin(value.originX) ? value.originX : 0;
  out.originZ = fin(value.originZ) ? value.originZ : 0;
  out.visible = value.visible !== false;
  if (value.calibration && value.calibration.p1 && value.calibration.p2) {
    out.guidePoints = [
      pixelToWorld(out, value.calibration.p1),
      pixelToWorld(out, value.calibration.p2),
    ];
  }
  return out;
}

function imageFor(ref) {
  if (!ref || !ref.dataUrl) return null;
  if (cachedUrl === ref.dataUrl && cachedImage) return cachedImage;
  cachedUrl = ref.dataUrl;
  cachedImage = new Image();
  cachedImage.onload = function () { event("blueprint:render"); };
  cachedImage.src = ref.dataUrl;
  return cachedImage;
}

export function drawBlueprintUnderlay(ctx, sx, sz) {
  var ref = S.blueprintTrace;
  // this runs on every 2D repaint, i.e. every pointermove — only touch the DOM
  // when something the control bar shows has actually changed
  syncBlueprintTraceControls();
  if (!ref || ref.visible === false || !(S.SC > 0)) return;
  var img = imageFor(ref);
  if (!img || !img.complete || !img.naturalWidth) return;
  ctx.save();
  ctx.translate(sx(ref.originX || 0), sz(ref.originZ || 0));
  ctx.rotate(ref.rotation || 0);
  ctx.scale(S.SC * ref.cmPerPx, S.SC * ref.cmPerPx);
  ctx.globalAlpha = fin(ref.opacity) ? ref.opacity : 0.55;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, -ref.width / 2, -ref.height / 2, ref.width, ref.height);
  ctx.restore();
}

export function setBlueprintReference(ref) {
  S.blueprintTrace = normalizeBlueprintReference(ref);
  cachedUrl = "";
  cachedImage = null;
  syncBlueprintTraceControls();
  event("blueprint:render", { fit: true });
}

export function clearBlueprintReference() {
  S.blueprintTrace = null;
  cachedUrl = "";
  cachedImage = null;
  syncBlueprintTraceControls();
  event("blueprint:render");
}

let controlsWired = false;
let controlsSig = null;
export function syncBlueprintTraceControls() {
  if (typeof document === "undefined") return;
  var cur = S.blueprintTrace;
  var sig = cur
    ? (cur.name || "") + "|" + cur.opacity + "|" + (cur.visible !== false) + "|" + cur.cmPerPx
    : "";
  // cheap early-out: nothing the bar renders has moved since the last repaint
  if (sig === controlsSig && document.getElementById("bp-trace-controls")) return;
  controlsSig = sig;
  var host = document.getElementById("view-2d");
  if (!host) return;
  var bar = document.getElementById("bp-trace-controls");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bp-trace-controls";
    bar.className = "bp-trace-controls";
    bar.innerHTML =
      '<span class="bp-trace-name"></span>' +
      '<button type="button" data-bptrace="walls"><i class="ph ph-wall"></i><span></span></button>' +
      '<label><i class="ph ph-circle-half"></i><input type="range" min="0.1" max="1" step="0.05"></label>' +
      '<button type="button" data-bptrace="visible"><i class="ph ph-eye"></i></button>' +
      '<button type="button" data-act="importBlueprintTrace"><i class="ph ph-ruler"></i></button>' +
      '<button type="button" data-bptrace="remove"><i class="ph ph-x"></i></button>';
    host.appendChild(bar);
  }
  var ref = S.blueprintTrace;
  bar.hidden = !ref;
  if (!ref) return;
  bar.querySelector(".bp-trace-name").textContent = ref.name || t("bp_trace_sheet");
  bar.querySelector('[data-bptrace="walls"] span').textContent = t("bp_trace_walls");
  var range = bar.querySelector('input[type="range"]');
  range.value = String(fin(ref.opacity) ? ref.opacity : 0.55);
  var vis = bar.querySelector('[data-bptrace="visible"]');
  vis.title = t(ref.visible === false ? "bp_trace_show" : "bp_trace_hide");
  vis.querySelector("i").className = ref.visible === false ? "ph ph-eye-slash" : "ph ph-eye";
  bar.querySelector('[data-act="importBlueprintTrace"]').title = t("bp_trace_recalibrate");
  bar.querySelector('[data-bptrace="remove"]').title = t("bp_trace_remove");
  if (controlsWired) return;
  controlsWired = true;
  range.addEventListener("input", function () {
    if (!S.blueprintTrace) return;
    S.blueprintTrace.opacity = Number(range.value);
    event("blueprint:render");
  });
  bar.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-bptrace]");
    if (!btn || !S.blueprintTrace) return;
    var action = btn.getAttribute("data-bptrace");
    if (action === "walls") event("blueprint:trace-walls");
    else if (action === "visible") {
      S.blueprintTrace.visible = S.blueprintTrace.visible === false;
      syncBlueprintTraceControls();
      event("blueprint:render");
    } else if (action === "remove") clearBlueprintReference();
  });
}

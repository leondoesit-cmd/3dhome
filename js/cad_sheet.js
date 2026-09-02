/* The drawing sheet: a real drafting document, not a picture of the model.
 *
 * One builder, two backends. Everything a sheet contains — border and zone
 * marks, the title block, each view's projected lines, centre marks, section
 * hatching, dimensions, notes, the BOM table — is emitted here as a flat list
 * of primitives in SHEET MILLIMETRES (x right, y down, origin at the paper's
 * top-left corner). The canvas painter in modeler_drawing.js and the SVG/PDF
 * exporter both consume that list, which is why what you drag on screen is
 * exactly what prints. Anything drawn by only one of them is a bug waiting to
 * be reported as "the export looks different".
 *
 * Geometry arrives through a provider (see buildSheetScene) so this module
 * never imports a mesh, a kernel or the DOM, and the tests can drive it with
 * three numbers.
 */

import {
  ORTHO_VIEWS, cropProjection, isOrthoView, projectSolid, projectionBounds, sectionBodies, viewBasis,
} from "./core/hidden_line.js";

/* ISO 216 in millimetres, landscape. A sheet is described by the paper it is
   printed on, so the same document prints right on any of them. */
export const SHEET_SIZES = Object.freeze({
  A4: { w: 297, h: 210, label: "A4" },
  A3: { w: 420, h: 297, label: "A3" },
  A2: { w: 594, h: 420, label: "A2" },
  A1: { w: 841, h: 594, label: "A1" },
  A0: { w: 1189, h: 841, label: "A0" },
  Letter: { w: 279.4, h: 215.9, label: "Letter" },
  Tabloid: { w: 431.8, h: 279.4, label: "Tabloid" },
});

/* The scales a drawing is allowed to be at. "Fit" picks from this list rather
   than inventing 1:3.7, because a scale a reader cannot reason about is worse
   than a view that leaves a little air on the sheet. */
export const STANDARD_SCALES = Object.freeze([
  [50, 1], [20, 1], [10, 1], [5, 1], [4, 1], [2, 1], [1, 1],
  [1, 2], [1, 2.5], [1, 4], [1, 5], [1, 10], [1, 20], [1, 25], [1, 50], [1, 100], [1, 200], [1, 500],
]);

/* Model units are centimetres everywhere in this app; the sheet is metric
   millimetres unless the title block says otherwise. */
export const UNIT_FACTORS = Object.freeze({ mm: 10, cm: 1, m: 0.01, in: 1 / 2.54 });
export const UNIT_DECIMALS = Object.freeze({ mm: 1, cm: 2, m: 3, in: 3 });

export const LINE_STYLES = Object.freeze({
  outline:  { width: 0.5,  color: "#101418" },
  hidden:   { width: 0.25, color: "#3a4450", dash: [2.4, 1.2] },
  center:   { width: 0.25, color: "#2b3138", dash: [7, 1.6, 1.6, 1.6] },
  section:  { width: 0.7,  color: "#101418" },
  cutline:  { width: 0.6,  color: "#101418", dash: [10, 2, 2.5, 2] },
  hatch:    { width: 0.18, color: "#5c646d" },
  dim:      { width: 0.25, color: "#101418" },
  dimRef:   { width: 0.25, color: "#6b7280", dash: [3, 1.5] },
  border:   { width: 0.7,  color: "#101418" },
  frame:    { width: 0.35, color: "#101418" },
  thin:     { width: 0.18, color: "#6b7280" },
  detail:   { width: 0.35, color: "#8a2f2f", dash: [6, 2] },
  highlight:{ width: 0.9,  color: "#e08030" },
});

/* ISO 3098 text heights. Titles read at arm's length, dimensions at reading
   distance — the same size for both is what made the old sheet look like a
   screenshot rather than a drawing. */
export const TEXT_SIZES = Object.freeze({ title: 5, view: 3.5, dim: 2.8, meta: 2.5, small: 2 });

const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 9);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
/* null means "not set" — a view that has never been dragged has no x, and
   Number(null) is 0, which is a real position on the sheet. */
const num = (value, fallback = 0) =>
  (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? fallback : Number(value));

export const scaleValue = (scale) => {
  if (!scale) return 1;
  if (Number.isFinite(scale)) return Number(scale);
  const n = num(scale[0] ?? scale.n, 1), d = num(scale[1] ?? scale.d, 1);
  return d ? n / d : 1;
};

export function scaleLabel(scale) {
  if (Array.isArray(scale)) return trimNumber(scale[0]) + ":" + trimNumber(scale[1]);
  if (scale && scale.n != null) return trimNumber(scale.n) + ":" + trimNumber(scale.d);
  const value = scaleValue(scale);
  return value >= 1 ? trimNumber(value) + ":1" : "1:" + trimNumber(1 / value);
}

function trimNumber(value) {
  const rounded = Math.round(num(value, 1) * 1000) / 1000;
  return String(rounded);
}

/* ---- the document ------------------------------------------------------- */

export function defaultViewLabel(dir) {
  const labels = {
    front: "FRONT", back: "REAR", left: "LEFT", right: "RIGHT", top: "TOP", bottom: "BOTTOM",
    iso: "ISOMETRIC", isoleft: "ISOMETRIC", isorear: "ISOMETRIC", dimetric: "PICTORIAL",
  };
  return labels[dir] || String(dir || "").toUpperCase();
}

/* A new sheet is the drawing a draughtsman would start: three principal views
   in third-angle projection plus a pictorial, all at one scale, on paper big
   enough for the model. */
export function createSheetDoc(options = {}) {
  const doc = {
    version: 1,
    size: SHEET_SIZES[options.size] ? options.size : "A3",
    orientation: options.orientation === "portrait" ? "portrait" : "landscape",
    projection: options.projection === "first" ? "first" : "third",
    units: UNIT_FACTORS[options.units] ? options.units : "mm",
    scale: options.scale || "fit",
    showHidden: options.showHidden !== false,
    showCenters: options.showCenters !== false,
    showZones: options.showZones !== false,
    views: [],
    dims: [],
    notes: [],
    title: Object.assign({
      title: "", number: "", revision: "A", author: "", company: "", material: "",
      finish: "", mass: "", date: "", sheet: 1, sheets: 1,
      tolerance: "ISO 2768-m",
    }, options.title || {}),
  };
  const set = Array.isArray(options.views) && options.views.length ? options.views : ["front", "top", "right", "iso"];
  set.forEach((dir, index) => doc.views.push(createView(dir, { primary: index === 0 })));
  return doc;
}

export function createView(dir, options = {}) {
  return {
    id: options.id || uid("v"),
    dir: dir || "front",
    label: options.label || defaultViewLabel(dir),
    x: Number.isFinite(options.x) ? options.x : null,      // null = let the layout place it
    y: Number.isFinite(options.y) ? options.y : null,
    scale: options.scale || null,                          // null = inherit the sheet scale
    primary: !!options.primary,
    parent: options.parent || null,
    hidden: options.hidden !== undefined ? !!options.hidden : null,
    centers: options.centers !== undefined ? !!options.centers : null,
    labelled: options.labelled !== false,
    section: options.section || null,                      // {axis, at, from, arrows, tag}
    detail: options.detail || null,                        // {from, u, v, radius, tag}
  };
}

/* Migrate whatever the document already carries into a sheet we can draw, so
   opening an older model never lands on a blank page. */
export function ensureSheetDoc(def, options = {}) {
  if (!def) return createSheetDoc(options);
  if (!def.drawing || typeof def.drawing !== "object" || !Array.isArray(def.drawing.views) || !def.drawing.views.length) {
    def.drawing = createSheetDoc(Object.assign({ title: { title: def.name || "" } }, options));
  }
  const doc = def.drawing;
  doc.views = doc.views.filter(Boolean).map((view) => Object.assign(createView(view.dir, view), view));
  if (!doc.views.some((view) => view.primary)) doc.views[0].primary = true;
  doc.dims = Array.isArray(doc.dims) ? doc.dims : [];
  doc.notes = Array.isArray(doc.notes) ? doc.notes : [];
  doc.title = Object.assign({ revision: "A", sheet: 1, sheets: 1 }, doc.title || {});
  if (!doc.title.title) doc.title.title = def.name || "";
  return doc;
}

export const sheetPaper = (doc) => {
  const size = SHEET_SIZES[doc?.size] || SHEET_SIZES.A3;
  return doc?.orientation === "portrait" ? { w: size.h, h: size.w, label: size.label } : { w: size.w, h: size.h, label: size.label };
};

/* The drawing frame: ISO leaves a wide left margin for filing and a narrower
   one elsewhere, and the title block sits in the bottom-right corner of it. */
export function sheetFrame(doc) {
  const paper = sheetPaper(doc);
  const margin = paper.w > 500 ? 12 : 8;
  const bind = paper.w > 500 ? 20 : 16;
  return {
    paper,
    x0: bind, y0: margin, x1: paper.w - margin, y1: paper.h - margin,
    get w() { return this.x1 - this.x0; },
    get h() { return this.y1 - this.y0; },
  };
}

export function titleBlockBox(doc) {
  const frame = sheetFrame(doc);
  const w = clamp(frame.w * 0.42, 120, 180), h = 42;
  return { x: frame.x1 - w, y: frame.y1 - h, w, h };
}

/* ---- layout ------------------------------------------------------------- */

/* A pictorial is context, not a measured view: left at the sheet scale an
   isometric of a cube is 1.7× the area of the front view and dominates the
   page, so an undirected one steps down to the next standard scale. */
function defaultViewScale(view, sheetScale) {
  if (!view || isOrthoView(view.dir) || view.section || view.detail) return sheetScale;
  const value = scaleValue(sheetScale);
  const index = STANDARD_SCALES.findIndex((scale) => scaleValue(scale) <= value + 1e-9);
  return STANDARD_SCALES[Math.min(STANDARD_SCALES.length - 1, (index < 0 ? 0 : index) + 1)];
}

const viewScaleOf = (doc, view, sheetScale) =>
  scaleValue(view?.scale || defaultViewScale(view, sheetScale || doc?.scale || 1));

/* Millimetres of paper per model unit (centimetre) at a given scale. */
const paperPerModel = (scale) => scaleValue(scale) * 10;

/* The scale at which every view still fits the drawing area with room for
   dimensions. Picked from STANDARD_SCALES, largest first. */
/* How the principal views cluster around the primary one, in MODEL units, plus
   the paper gaps between them. Both the scale chooser and the placer read this,
   so "will it fit" and "where does it go" can never disagree. */
function clusterMetrics(doc, extents) {
  const primary = doc.views.find((view) => view.primary) || doc.views[0];
  const sizeOf = (view) => extents.get(view.id) || { w: 10, h: 10 };
  const primarySize = sizeOf(primary);
  const metrics = {
    primary, primarySize,
    left: 0, right: 0, above: 0, below: 0,
    floating: [],
  };
  const first = doc.projection === "first";
  for (const view of doc.views) {
    if (view === primary) continue;
    const size = sizeOf(view);
    if (view.section || view.detail || !isOrthoView(view.dir)) { metrics.floating.push(view); continue; }
    if (view.dir === "top" || view.dir === "bottom") {
      const above = (view.dir === "top") !== first;
      if (above) metrics.above = Math.max(metrics.above, size.h);
      else metrics.below = Math.max(metrics.below, size.h);
    } else if (view.dir === "right" || view.dir === "left" || view.dir === "back") {
      const right = view.dir === "back" ? true : (view.dir === "right") !== first;
      if (right) metrics.right = Math.max(metrics.right, size.w);
      else metrics.left = Math.max(metrics.left, size.w);
    } else metrics.floating.push(view);
  }
  return metrics;
}

const VIEW_GAP = 20;      // millimetres of paper between neighbouring views

/* The largest standard scale at which the principal views still fit the drawing
   area with room for their dimensions. A scale a reader cannot reason about is
   worse than a view with air around it, so this only ever picks from the list. */
export function fitScale(doc, extents) {
  const metrics = clusterMetrics(doc, extents);
  const area = drawingArea(doc, metrics);
  const modelW = metrics.left + metrics.primarySize.w + metrics.right;
  const modelH = metrics.above + metrics.primarySize.h + metrics.below;
  const gapsW = VIEW_GAP * ((metrics.left ? 1 : 0) + (metrics.right ? 1 : 0)) + 24;
  const gapsH = VIEW_GAP * ((metrics.above ? 1 : 0) + (metrics.below ? 1 : 0)) + 24;
  for (const scale of STANDARD_SCALES) {
    const k = paperPerModel(scale);
    if (modelW * k + gapsW <= area.w && modelH * k + gapsH <= area.h) return scale;
  }
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

/* The room the principal views get: the frame, less the column reserved for
   pictorials and sections, less the title block's own corner. */
function drawingArea(doc, metrics) {
  const frame = sheetFrame(doc), title = titleBlockBox(doc);
  const column = metrics.floating.length ? Math.min(frame.w * 0.3, 110) : 0;
  return {
    x0: frame.x0 + 6, y0: frame.y0 + 6,
    x1: frame.x1 - 6 - column, y1: frame.y1 - 6 - (column ? 0 : title.h + 4),
    get w() { return this.x1 - this.x0; },
    get h() { return this.y1 - this.y0; },
    column,
  };
}

/* Where each view sits, in millimetres. Principal views hold the projection
   convention — in third angle the top view is above the front and the right
   view is to its right; first angle puts each one on the opposite side — so a
   reader can tell which way the object is facing without reading a label. */
export function layoutViews(doc, extents) {
  const frame = sheetFrame(doc), title = titleBlockBox(doc);
  const sheetScale = doc.scale === "fit" ? fitScale(doc, extents) : doc.scale;
  const metrics = clusterMetrics(doc, extents);
  const area = drawingArea(doc, metrics);
  const primary = metrics.primary;
  const placed = new Map();
  const paperSize = (view) => {
    const box = extents.get(view.id) || { w: 10, h: 10 };
    const k = paperPerModel(viewScaleOf(doc, view, sheetScale));
    return { w: Math.max(box.w * k, 6), h: Math.max(box.h * k, 6) };
  };
  const k = paperPerModel(sheetScale);
  const primarySize = paperSize(primary);
  /* Centre the whole cluster, not the front view: with a top view above and a
     right view beside it, centring the front alone pushes the group into the
     title block. */
  const spread = {
    left: metrics.left * k + (metrics.left ? VIEW_GAP : 0),
    right: metrics.right * k + (metrics.right ? VIEW_GAP : 0),
    above: metrics.above * k + (metrics.above ? VIEW_GAP : 0),
    below: metrics.below * k + (metrics.below ? VIEW_GAP : 0),
  };
  const anchor = {
    x: num(primary.x, area.x0 + (area.w - (spread.left + primarySize.w + spread.right)) / 2 + spread.left + primarySize.w / 2),
    y: num(primary.y, area.y0 + (area.h - (spread.above + primarySize.h + spread.below)) / 2 + spread.above + primarySize.h / 2),
  };
  placed.set(primary.id, { x: anchor.x, y: anchor.y, w: primarySize.w, h: primarySize.h, align: null, scale: viewScaleOf(doc, primary, sheetScale) });

  const first = doc.projection === "first";
  let floatY = frame.y0 + 8;
  const floatX = frame.x1 - 8 - (area.column ? area.column / 2 : 0);
  for (const view of doc.views) {
    if (view === primary) continue;
    const size = paperSize(view);
    let x = anchor.x, y = anchor.y, align = null;
    const floating = metrics.floating.includes(view);
    if (floating) {
      /* Pictorials, sections and details carry no projection relationship, so
         they stack down the reserved column — clear of the title block. */
      x = area.column ? floatX - size.w / 2 + Math.min(size.w / 2, area.column / 2) : frame.x1 - size.w / 2 - 8;
      y = floatY + size.h / 2;
      floatY += size.h + 14;
      if (y + size.h / 2 > title.y - 6) { y = title.y - 6 - size.h / 2; floatY = y + size.h / 2 + 14; }
    } else if (view.dir === "top" || view.dir === "bottom") {
      const above = (view.dir === "top") !== first;
      y = anchor.y + (above ? -1 : 1) * (primarySize.h / 2 + size.h / 2 + VIEW_GAP);
      align = "vertical";
    } else if (view.dir === "right" || view.dir === "left") {
      const right = (view.dir === "right") !== first;
      x = anchor.x + (right ? 1 : -1) * (primarySize.w / 2 + size.w / 2 + VIEW_GAP);
      align = "horizontal";
    } else if (view.dir === "back") {
      x = anchor.x + primarySize.w / 2 + metrics.right * k + size.w / 2 + VIEW_GAP * 2;
      align = "horizontal";
    }
    /* A dragged view keeps the projection line it is entitled to: an aligned
       view may only slide along its own axis, which is what "aligned" means on
       a real sheet and what a reader relies on comparing two views. */
    const wantX = num(view.x, x), wantY = num(view.y, y);
    placed.set(view.id, {
      x: align === "vertical" ? anchor.x : wantX,
      y: align === "horizontal" ? anchor.y : wantY,
      w: size.w, h: size.h, align,
      scale: viewScaleOf(doc, view, sheetScale),
    });
  }
  return { placements: placed, sheetScale, primaryId: primary.id, anchor };
}

/* ---- projecting a view -------------------------------------------------- */

/* How every view on a sheet is turned into lines, in one place: a plain view is
   projected, a section is cut on its parent's plane and viewed along its
   arrows, a detail is its parent cropped to the callout bubble. The interactive
   sheet and the exporter share this so the printed page cannot disagree with
   the screen. */
export function createProjector(doc, bodies, options = {}) {
  const cache = new Map();
  const project = (view) => {
    if (!view) return null;
    const key = view.id + "#" + [view.dir, JSON.stringify(view.section || 0), JSON.stringify(view.detail || 0)].join("|");
    if (cache.has(key)) return cache.get(key);
    let projection = null;
    if (view.section) projection = projectSection(doc, view, bodies, options);
    else if (view.detail) {
      const parent = (doc.views || []).find((entry) => entry.id === view.detail.from);
      const base = parent ? project(parent) : projectSolid(bodies, view.dir, options);
      projection = cropProjection(base, view.detail);
    } else projection = projectSolid(bodies, view.dir, options);
    cache.set(key, projection);
    return projection;
  };
  return project;
}

function projectSection(doc, view, bodies, options) {
  const parent = (doc.views || []).find((entry) => entry.id === view.section.from) || doc.views[0];
  const basis = viewBasis(parent ? parent.dir : "front");
  const along = view.section.axis === "vertical" ? basis.right : basis.up;
  const sight = view.section.flip ? { x: -along.x, y: -along.y, z: -along.z } : along;
  const at = num(view.section.at);
  const origin = { x: along.x * at, y: along.y * at, z: along.z * at };
  /* Everything between the reader and the plane goes: the clip normal is the
     direction the section is viewed FROM, which is the opposite of the arrows. */
  const cut = sectionBodies(bodies, { normal: { x: -sight.x, y: -sight.y, z: -sight.z }, origin });
  return projectSolid(cut.bodies, view.dir, Object.assign({}, options, { cuts: cut.cuts }));
}

/* ---- scene primitives --------------------------------------------------- */

const line = (x1, y1, x2, y2, style, meta) => Object.assign({ type: "line", x1, y1, x2, y2, style }, meta);
const rect = (x, y, w, h, style, meta) => Object.assign({ type: "rect", x, y, w, h, style }, meta);
const circle = (cx, cy, r, style, meta) => Object.assign({ type: "circle", cx, cy, r, style }, meta);
const poly = (pts, style, meta) => Object.assign({ type: "poly", pts, style }, meta);
const text = (x, y, value, options) => Object.assign({
  type: "text", x, y, text: String(value ?? ""), size: TEXT_SIZES.meta,
  anchor: "start", baseline: "alphabetic", style: "text", color: "#101418",
}, options || {});

const ARROW_LENGTH = 3.2, ARROW_WIDTH = 1.1;

function arrowHead(x, y, dx, dy, scale = 1) {
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length, uy = dy / length, px = -uy, py = ux;
  const tail = { x: x - ux * ARROW_LENGTH * scale, y: y - uy * ARROW_LENGTH * scale };
  return poly([
    { x, y },
    { x: tail.x + px * ARROW_WIDTH * scale, y: tail.y + py * ARROW_WIDTH * scale },
    { x: tail.x - px * ARROW_WIDTH * scale, y: tail.y - py * ARROW_WIDTH * scale },
  ], "fill", { fill: LINE_STYLES.dim.color, closed: true });
}

/* ---- hatching ----------------------------------------------------------- */

/* Scanline hatch of the loops a section plane carved, at 45° and even-odd so
   an inner boss inside a cut wall stays unhatched the way it must. */
export function hatchLoops(loops, options = {}) {
  const spacing = options.spacing || 2.5, angle = (options.angle ?? 45) * Math.PI / 180;
  const segments = [];
  const edges = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      edges.push({ a, b });
      x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x);
      y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y);
    }
  }
  if (!edges.length || !Number.isFinite(x0)) return segments;
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -dir.y, y: dir.x };
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }];
  const offsets = corners.map((point) => point.x * normal.x + point.y * normal.y);
  const start = Math.ceil(Math.min(...offsets) / spacing) * spacing;
  const end = Math.max(...offsets);
  const along = corners.map((point) => point.x * dir.x + point.y * dir.y);
  const tMin = Math.min(...along) - spacing, tMax = Math.max(...along) + spacing;
  for (let offset = start; offset <= end; offset += spacing) {
    const base = { x: normal.x * offset, y: normal.y * offset };
    const hits = [];
    for (const edge of edges) {
      const da = (edge.a.x * normal.x + edge.a.y * normal.y) - offset;
      const db = (edge.b.x * normal.x + edge.b.y * normal.y) - offset;
      if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
      if (Math.abs(da - db) < 1e-9) continue;
      const t = da / (da - db);
      const point = { x: edge.a.x + (edge.b.x - edge.a.x) * t, y: edge.a.y + (edge.b.y - edge.a.y) * t };
      hits.push(point.x * dir.x + point.y * dir.y);
    }
    if (hits.length < 2) continue;
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const a = clamp(hits[i], tMin, tMax), b = clamp(hits[i + 1], tMin, tMax);
      if (b - a < 0.2) continue;
      segments.push({
        x1: base.x + dir.x * a, y1: base.y + dir.y * a,
        x2: base.x + dir.x * b, y2: base.y + dir.y * b,
      });
    }
  }
  return segments;
}

/* Chain the loose segments a section plane produced into closed loops. The cut
   arrives as unordered chords — one per triangle it sliced — and a hatch needs
   boundaries. */
export function chainLoops(segments, tolerance) {
  const tol = tolerance > 0 ? tolerance : 1e-3;
  const key = (point) => Math.round(point.u / tol) + ":" + Math.round(point.v / tol);
  const ends = new Map();
  segments.forEach((segment, index) => {
    for (const end of [segment.a, segment.b]) {
      const id = key(end);
      if (!ends.has(id)) ends.set(id, []);
      ends.get(id).push(index);
    }
  });
  const used = new Set(), loops = [];
  segments.forEach((segment, index) => {
    if (used.has(index)) return;
    used.add(index);
    const points = [segment.a, segment.b];
    let grew = true;
    while (grew) {
      grew = false;
      const tail = points[points.length - 1];
      for (const candidate of ends.get(key(tail)) || []) {
        if (used.has(candidate)) continue;
        const next = segments[candidate];
        const far = key(next.a) === key(tail) ? next.b : next.a;
        used.add(candidate);
        points.push(far);
        grew = true;
        break;
      }
    }
    if (points.length >= 3) loops.push(points);
  });
  return loops;
}

/* ---- dimensions --------------------------------------------------------- */

export function formatLength(modelValue, doc) {
  const units = doc?.units || "mm";
  const factor = UNIT_FACTORS[units] || 10;
  const decimals = UNIT_DECIMALS[units] ?? 1;
  const value = Math.abs(num(modelValue)) * factor;
  const fixed = value.toFixed(decimals).replace(/\.?0+$/, "");
  return fixed || "0";
}

export function dimensionText(dim, doc) {
  if (dim.text) return dim.text;
  const value = formatLength(dim.measure, doc);
  const prefix = dim.type === "diameter" ? "⌀" : dim.type === "radius" ? "R" : "";
  const suffix = dim.tolerance ? " " + dim.tolerance : "";
  if (dim.type === "angle") return trimNumber(Math.round(num(dim.measure) * 10) / 10) + "°" + suffix;
  return prefix + value + suffix;
}

/* The measured value of a dimension, from the points it was placed on. Stored
   references are in the view's own model coordinates, so a view that moves or
   rescales carries its dimensions with it and they still read true. */
export function measureDim(dim) {
  const [a, b] = dim.refs || [];
  if (dim.type === "radius" || dim.type === "diameter") {
    const radius = num(dim.radius);
    return dim.type === "diameter" ? radius * 2 : radius;
  }
  if (!a || !b) return 0;
  if (dim.type === "horizontal") return Math.abs(b.u - a.u);
  if (dim.type === "vertical") return Math.abs(b.v - a.v);
  if (dim.type === "angle") {
    const c = dim.refs[2];
    if (!c) return 0;
    const angle = (p, q) => Math.atan2(q.v - p.v, q.u - p.u);
    let delta = (angle(b, c) - angle(b, a)) * 180 / Math.PI;
    while (delta <= -180) delta += 360;
    while (delta > 180) delta -= 360;
    return Math.abs(delta);
  }
  return Math.hypot(b.u - a.u, b.v - a.v);
}

/* One dimension, in sheet millimetres, as the items that draw it: extension
   lines, the dimension line, two arrowheads and the value. */
function dimensionItems(dim, place, doc, options = {}) {
  const items = [];
  const style = options.selected ? "highlight" : dim.reference ? "dimRef" : "dim";
  const toSheet = place.toSheet;
  const offset = num(dim.offset, 10);
  const label = dimensionText(Object.assign({}, dim, { measure: measureDim(dim) }), doc);
  const size = TEXT_SIZES.dim;
  if (dim.type === "radius" || dim.type === "diameter") {
    const centre = toSheet(dim.refs?.[0] || { u: 0, v: 0 });
    const radius = num(dim.radius) * paperPerModel(place.scale);
    const angle = num(dim.angle, -Math.PI / 4);
    const edge = { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
    const tip = { x: centre.x + Math.cos(angle) * (radius + offset), y: centre.y + Math.sin(angle) * (radius + offset) };
    items.push(line(edge.x, edge.y, tip.x, tip.y, style));
    items.push(arrowHead(edge.x, edge.y, edge.x - tip.x, edge.y - tip.y));
    const flip = Math.cos(angle) < 0;
    items.push(line(tip.x, tip.y, tip.x + (flip ? -6 : 6), tip.y, style));
    items.push(text(tip.x + (flip ? -7 : 7), tip.y - 0.8, label, {
      size, anchor: flip ? "end" : "start", color: LINE_STYLES[style].color, box: true,
    }));
    return items;
  }
  const a = toSheet(dim.refs?.[0] || { u: 0, v: 0 });
  const b = toSheet(dim.refs?.[1] || { u: 0, v: 0 });
  if (dim.type === "angle") {
    const vertex = toSheet(dim.refs?.[1] || { u: 0, v: 0 });
    const arm = (point) => Math.atan2(point.y - vertex.y, point.x - vertex.x);
    const first = arm(toSheet(dim.refs[0])), second = arm(toSheet(dim.refs[2]));
    const radius = Math.max(offset, 8);
    items.push({ type: "arc", cx: vertex.x, cy: vertex.y, r: radius, a0: Math.min(first, second), a1: Math.max(first, second), style });
    const mid = (first + second) / 2;
    items.push(text(vertex.x + Math.cos(mid) * (radius + 3), vertex.y + Math.sin(mid) * (radius + 3), label, {
      size, anchor: "middle", color: LINE_STYLES[style].color, box: true,
    }));
    return items;
  }
  let p1 = a, p2 = b, normal;
  /* The offset is signed from the midpoint of the two references, so dragging a
     dimension through the geometry puts it on the other side instead of
     stopping dead at the model — the same rule for all three placements. */
  if (dim.type === "horizontal") {
    const y = (a.y + b.y) / 2 - offset;
    p1 = { x: a.x, y }; p2 = { x: b.x, y };
    normal = { x: 0, y: Math.sign(-offset) || -1 };
  } else if (dim.type === "vertical") {
    const x = (a.x + b.x) / 2 + offset;
    p1 = { x, y: a.y }; p2 = { x, y: b.y };
    normal = { x: Math.sign(offset) || 1, y: 0 };
  } else {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    normal = { x: -dy / length, y: dx / length };
    p1 = { x: a.x + normal.x * offset, y: a.y + normal.y * offset };
    p2 = { x: b.x + normal.x * offset, y: b.y + normal.y * offset };
  }
  const gap = 1.2, overshoot = 2;
  const extend = (from, to) => {
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    if (length < gap * 2) return null;
    const ux = dx / length, uy = dy / length;
    return line(from.x + ux * gap, from.y + uy * gap, to.x + ux * overshoot, to.y + uy * overshoot, style);
  };
  const e1 = extend(a, p1), e2 = extend(b, p2);
  if (e1) items.push(e1);
  if (e2) items.push(e2);
  items.push(line(p1.x, p1.y, p2.x, p2.y, style));
  const span = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (span > ARROW_LENGTH * 2.4) {
    items.push(arrowHead(p1.x, p1.y, p1.x - p2.x, p1.y - p2.y));
    items.push(arrowHead(p2.x, p2.y, p2.x - p1.x, p2.y - p1.y));
  } else {
    /* Too tight for arrows inside: draw them outside pointing in, the way a
       narrow slot is dimensioned. */
    const ux = (p2.x - p1.x) / (span || 1), uy = (p2.y - p1.y) / (span || 1);
    items.push(arrowHead(p1.x, p1.y, ux, uy));
    items.push(arrowHead(p2.x, p2.y, -ux, -uy));
    items.push(line(p1.x - ux * 5, p1.y - uy * 5, p1.x, p1.y, style));
    items.push(line(p2.x + ux * 5, p2.y + uy * 5, p2.x, p2.y, style));
  }
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const along = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const upright = Math.abs(along) > Math.PI / 2 ? along + Math.PI : along;
  items.push(text(mid.x + normal.x * 1.6, mid.y + normal.y * 1.6, label, {
    size, anchor: "middle", rotate: upright * 180 / Math.PI, color: LINE_STYLES[style].color, box: true,
    baseline: "bottom",
  }));
  return items;
}

/* ---- the scene ---------------------------------------------------------- */

/* @param doc       the sheet document (see createSheetDoc)
 * @param provider  { projection(view) -> hidden_line projection,
 *                    meta, bom }
 * @returns { paper, items, views, scale } — millimetres, ready to paint.
 */
export function buildSheetScene(doc, provider, options = {}) {
  const items = [];
  const frame = sheetFrame(doc), paper = frame.paper;
  const projections = new Map();
  const extents = new Map();
  for (const view of doc.views) {
    const projection = provider?.projection ? provider.projection(view) : null;
    projections.set(view.id, projection);
    const bounds = projection ? projectionBounds(projection) : null;
    extents.set(view.id, bounds
      ? { w: Math.max(bounds.u1 - bounds.u0, 0.1), h: Math.max(bounds.v1 - bounds.v0, 0.1), bounds }
      : { w: 10, h: 10, bounds: null });
  }
  const layout = layoutViews(doc, extents);
  const placements = [], labels = [];

  if (options.paper !== false) {
    items.push(rect(0, 0, paper.w, paper.h, "paper", { fill: "#ffffff" }));
    items.push(rect(frame.x0, frame.y0, frame.w, frame.h, "border"));
    if (doc.showZones !== false) items.push(...zoneMarks(frame));
  }

  for (const view of doc.views) {
    const place = layout.placements.get(view.id);
    const projection = projections.get(view.id);
    const extent = extents.get(view.id);
    const scale = place.scale;
    const k = paperPerModel(scale);
    const centre = extent.bounds
      ? { u: (extent.bounds.u0 + extent.bounds.u1) / 2, v: (extent.bounds.v0 + extent.bounds.v1) / 2 }
      : { u: 0, v: 0 };
    const toSheet = (point) => ({ x: place.x + (point.u - centre.u) * k, y: place.y - (point.v - centre.v) * k });
    const frameBox = {
      x: place.x - place.w / 2, y: place.y - place.h / 2, w: place.w, h: place.h,
    };
    const record = {
      id: view.id, view, x: place.x, y: place.y, w: place.w, h: place.h, scale, k,
      centre, align: place.align, toSheet, box: frameBox, projection,
      toModel: (point) => ({ u: centre.u + (point.x - place.x) / k, v: centre.v - (point.y - place.y) / k }),
    };
    placements.push(record);
    if (!projection) continue;

    /* A pictorial is there to be recognised, not measured: dashed lines behind
       an isometric read as noise, so one is only ever shown on request. */
    const showHidden = view.hidden !== null && view.hidden !== undefined ? !!view.hidden
      : (isOrthoView(view.dir) || view.section) && doc.showHidden !== false;
    const showCenters = view.centers === null ? doc.showCenters !== false : !!view.centers;

    if (projection.cuts?.length) {
      const loops = chainLoops(projection.cuts, Math.max(1e-4, (extent.w + extent.h) * 1e-3))
        .map((loop) => loop.map((point) => toSheet(point)));
      for (const segment of hatchLoops(loops, { spacing: 2.2, angle: 45 })) {
        items.push(line(segment.x1, segment.y1, segment.x2, segment.y2, "hatch", { viewId: view.id }));
      }
      for (const loop of loops) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i], b = loop[(i + 1) % loop.length];
          items.push(line(a.x, a.y, b.x, b.y, "section", { viewId: view.id }));
        }
      }
    }
    for (const segment of projection.visible || []) {
      const a = toSheet(segment.a), b = toSheet(segment.b);
      items.push(line(a.x, a.y, b.x, b.y, "outline", { viewId: view.id }));
    }
    if (showHidden) {
      for (const segment of projection.hidden || []) {
        const a = toSheet(segment.a), b = toSheet(segment.b);
        items.push(line(a.x, a.y, b.x, b.y, "hidden", { viewId: view.id }));
      }
    }
    for (const round of projection.circles || []) {
      if (round.drawn === "visible" || (round.drawn === "hidden" && showHidden)) {
        const centrePoint = toSheet(round);
        items.push(circle(centrePoint.x, centrePoint.y, round.radius * k, round.drawn === "hidden" ? "hidden" : "outline", { viewId: view.id }));
      }
      if (showCenters && round.visible && round.kind === "round") items.push(...centreMark(round, toSheet, k, view.id));
    }
    if (showCenters) items.push(...axisCentrelines(projection.circles || [], toSheet, k, view.id));
    /* A detail is bounded by the bubble it was called out with — the reader has
       to see that the geometry stops because the callout does. */
    if (projection.crop) {
      const centrePoint = toSheet(projection.crop);
      items.push(circle(centrePoint.x, centrePoint.y, projection.crop.radius * k, "detail", { viewId: view.id }));
    }
    if (view.labelled !== false) {
      const suffix = scaleValue(record.scale) !== scaleValue(layout.sheetScale)
        ? "  (" + scaleLabel(view.scale || record.scale) + ")" : "";
      labels.push({ record, caption: (view.label || defaultViewLabel(view.dir)) + suffix });
    }
  }

  /* Section and detail markers live on the PARENT view — the reader has to be
     told where the cut was taken, not just shown the result. */
  for (const view of doc.views) {
    if (view.section && view.parent) items.push(...sectionMarker(view, placements, doc));
    if (view.detail && view.parent) items.push(...detailMarker(view, placements));
  }

  const byId = new Map(placements.map((place) => [place.id, place]));
  for (const dim of doc.dims || []) {
    const place = byId.get(dim.viewId);
    if (!place) continue;
    const measured = Object.assign({}, dim, { measure: measureDim(dim) });
    for (const item of dimensionItems(measured, place, doc, { selected: options.selectedDim === dim.id })) {
      items.push(Object.assign(item, { dimId: dim.id, viewId: dim.viewId }));
    }
  }
  for (const note of doc.notes || []) items.push(...noteItems(note, byId, doc));

  /* View captions go on LAST, below whatever that view ended up carrying: a
     label parked at the outline's edge lands inside the overall dimension the
     same view is dimensioned with. */
  for (const label of labels) {
    let bottom = label.record.box.y + label.record.box.h;
    for (const item of items) {
      if (item.viewId !== label.record.id) continue;
      const low = item.type === "line" ? Math.max(item.y1, item.y2)
        : item.type === "text" ? item.y + item.size
          : item.type === "circle" || item.type === "arc" ? item.cy + item.r
            : item.type === "poly" ? Math.max(...item.pts.map((point) => point.y)) : -Infinity;
      if (Number.isFinite(low) && low > bottom && low < label.record.box.y + label.record.box.h + 60) bottom = low;
    }
    items.push(text(label.record.x, bottom + 7, label.caption, {
      size: TEXT_SIZES.view, anchor: "middle", weight: "bold", viewLabel: label.record.id,
    }));
  }

  if (options.paper !== false) {
    items.push(...titleBlockItems(doc, provider, layout.sheetScale));
    if (provider?.bom?.length) items.push(...bomTableItems(doc, provider.bom));
  }
  return {
    paper, frame, items, views: placements, scale: layout.sheetScale,
    projections, primaryId: layout.primaryId,
  };
}

function centreMark(round, toSheet, k, viewId) {
  const centre = toSheet(round);
  const radius = round.radius * k, reach = Math.min(Math.max(radius + 2.5, 3), radius + 5);
  return [
    line(centre.x - reach, centre.y, centre.x + reach, centre.y, "center", { viewId }),
    line(centre.x, centre.y - reach, centre.x, centre.y + reach, "center", { viewId }),
  ];
}

/* A cylinder seen from the side is two rims sharing one axis. Drawing a stub
   through each rim leaves two chain lines sticking out of the body at both
   ends; a machinist expects ONE axis, running the length of the feature and a
   few millimetres past it. So co-axial rims are merged before anything is
   inked. */
function axisCentrelines(circles, toSheet, k, viewId) {
  const groups = new Map();
  for (const round of circles) {
    if (round.kind !== "edge" || !round.visible) continue;
    let du = round.axis.u, dv = -round.axis.v;
    const length = Math.hypot(du, dv);
    if (!(length > 1e-6)) continue;
    du /= length; dv /= length;
    if (du < -1e-9 || (Math.abs(du) < 1e-9 && dv < 0)) { du = -du; dv = -dv; }
    const centre = toSheet(round);
    const offset = du * centre.y - dv * centre.x;             // distance to the axis line
    const key = Math.round(Math.atan2(dv, du) / 0.02) + ":" + Math.round(offset / 0.5);
    const along = centre.x * du + centre.y * dv;
    const group = groups.get(key);
    const reach = round.radius * k;
    if (group) {
      group.min = Math.min(group.min, along);
      group.max = Math.max(group.max, along);
      group.reach = Math.max(group.reach, reach);
    } else groups.set(key, { du, dv, centre, min: along, max: along, reach });
  }
  const items = [];
  groups.forEach((group) => {
    const base = group.centre;
    const anchor = base.x * group.du + base.y * group.dv;
    const overshoot = Math.min(group.reach + 3, 12);
    const at = (t) => ({
      x: base.x + group.du * (t - anchor),
      y: base.y + group.dv * (t - anchor),
    });
    const a = at(group.min - overshoot), b = at(group.max + overshoot);
    items.push(line(a.x, a.y, b.x, b.y, "center", { viewId }));
  });
  return items;
}

function sectionMarker(view, placements, doc) {
  const parent = placements.find((place) => place.id === view.parent);
  if (!parent) return [];
  const tag = view.section.tag || "A";
  const items = [];
  const box = parent.box;
  const vertical = view.section.axis === "vertical";
  const at = num(view.section.at, 0);
  const point = parent.toSheet(vertical ? { u: at, v: parent.centre.v } : { u: parent.centre.u, v: at });
  const reach = 6;
  if (vertical) {
    items.push(line(point.x, box.y - reach, point.x, box.y + box.h + reach, "cutline", { viewId: parent.id }));
    for (const y of [box.y - reach, box.y + box.h + reach]) {
      const towards = view.section.flip ? -1 : 1;
      items.push(arrowHead(point.x + towards * 7, y, towards, 0));
      items.push(line(point.x, y, point.x + towards * 7, y, "cutline"));
      items.push(text(point.x - towards * 3, y - 1, tag, { size: TEXT_SIZES.view, anchor: "middle", weight: "bold" }));
    }
  } else {
    items.push(line(box.x - reach, point.y, box.x + box.w + reach, point.y, "cutline", { viewId: parent.id }));
    for (const x of [box.x - reach, box.x + box.w + reach]) {
      const towards = view.section.flip ? -1 : 1;
      items.push(arrowHead(x, point.y + towards * 7, 0, towards));
      items.push(line(x, point.y, x, point.y + towards * 7, "cutline"));
      items.push(text(x, point.y - towards * 3, tag, { size: TEXT_SIZES.view, anchor: "middle", weight: "bold" }));
    }
  }
  void doc;
  return items;
}

function detailMarker(view, placements) {
  const parent = placements.find((place) => place.id === view.parent);
  if (!parent) return [];
  const centre = parent.toSheet({ u: num(view.detail.u), v: num(view.detail.v) });
  const radius = num(view.detail.radius, 5) * parent.k;
  return [
    circle(centre.x, centre.y, radius, "detail", { viewId: parent.id }),
    text(centre.x, centre.y - radius - 2, view.detail.tag || "A", { size: TEXT_SIZES.view, anchor: "middle", weight: "bold" }),
  ];
}

function noteItems(note, byId, doc) {
  const items = [];
  const x = num(note.x), y = num(note.y);
  const lines = String(note.text || "").split("\n");
  lines.forEach((row, index) => {
    items.push(text(x, y + index * (TEXT_SIZES.dim * 1.35), row, {
      size: note.size || TEXT_SIZES.dim, anchor: "start", noteId: note.id,
    }));
  });
  if (note.leader) {
    const place = byId.get(note.leader.viewId);
    if (place) {
      const target = place.toSheet(note.leader);
      const elbow = { x: x - 3, y: y + 1 };
      items.push(line(elbow.x, elbow.y, x + 1, elbow.y, "dim", { noteId: note.id }));
      items.push(line(target.x, target.y, elbow.x, elbow.y, "dim", { noteId: note.id }));
      items.push(arrowHead(target.x, target.y, target.x - elbow.x, target.y - elbow.y));
    }
  }
  void doc;
  return items;
}

/* ---- frame furniture ---------------------------------------------------- */

/* Zone letters and numbers around the border: how a reader says "the boss in
   C3" over the phone. */
function zoneMarks(frame) {
  const items = [];
  const columns = Math.max(4, Math.round(frame.w / 105) * 2);
  const rows = Math.max(3, Math.round(frame.h / 105) * 2);
  const stepX = frame.w / columns, stepY = frame.h / rows;
  const letters = "ABCDEFGH";
  for (let i = 0; i < columns; i++) {
    const x = frame.x0 + stepX * i;
    if (i) {
      items.push(line(x, frame.y0, x, frame.y0 + 4, "thin"));
      items.push(line(x, frame.y1 - 4, x, frame.y1, "thin"));
    }
    const label = String(columns - i);
    items.push(text(x + stepX / 2, frame.y0 + 3.4, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
    items.push(text(x + stepX / 2, frame.y1 - 1.2, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
  }
  for (let i = 0; i < rows; i++) {
    const y = frame.y0 + stepY * i;
    if (i) {
      items.push(line(frame.x0, y, frame.x0 + 4, y, "thin"));
      items.push(line(frame.x1 - 4, y, frame.x1, y, "thin"));
    }
    const label = letters[rows - 1 - i] || "";
    items.push(text(frame.x0 + 2, y + stepY / 2 + 1, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
    items.push(text(frame.x1 - 2, y + stepY / 2 + 1, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
  }
  return items;
}

/* The first/third-angle symbol: a truncated cone, drawn twice. Which side the
   circles sit on IS the convention, so it is generated from doc.projection
   rather than picked as a picture. */
function projectionSymbol(x, y, height, first) {
  const items = [];
  const r1 = height * 0.42, r2 = height * 0.24, length = height * 1.25;
  const coneX = first ? x + length * 0.55 : x + length * 0.05;
  const circleX = first ? x + length * 0.05 : x + length * 0.62;
  items.push(circle(circleX + r1, y, r1, "frame"));
  items.push(circle(circleX + r1, y, r2, "frame"));
  const big = first ? -1 : 1;
  const tipX = coneX + (big > 0 ? length * 0.42 : 0);
  const baseX = coneX + (big > 0 ? 0 : length * 0.42);
  items.push(poly([
    { x: baseX, y: y - r1 }, { x: tipX, y: y - r2 }, { x: tipX, y: y + r2 }, { x: baseX, y: y + r1 },
  ], "frame", { closed: true }));
  items.push(line(baseX, y - r1, baseX, y + r1, "frame"));
  items.push(line(tipX, y - r2, tipX, y + r2, "frame"));
  items.push(line(x - 1, y, x + length + 1, y, "center"));
  return items;
}

function titleBlockItems(doc, provider, sheetScale) {
  const box = titleBlockBox(doc);
  const meta = Object.assign({}, doc.title, provider?.meta || {});
  const items = [rect(box.x, box.y, box.w, box.h, "frame", { fill: "#ffffff" })];
  const rowY = [box.y + box.h * 0.42, box.y + box.h * 0.68];
  items.push(line(box.x, rowY[0], box.x + box.w, rowY[0], "frame"));
  items.push(line(box.x, rowY[1], box.x + box.w, rowY[1], "frame"));
  const colX = box.x + box.w * 0.58;
  items.push(line(colX, rowY[0], colX, box.y + box.h, "frame"));
  const midX = box.x + box.w * 0.29, thirdX = box.x + box.w * 0.79;
  items.push(line(midX, rowY[1], midX, box.y + box.h, "frame"));
  items.push(line(thirdX, rowY[1], thirdX, box.y + box.h, "frame"));

  const field = (x, y, caption, value, options = {}) => {
    items.push(text(x, y, caption, { size: TEXT_SIZES.small, color: "#6b7280" }));
    items.push(text(x, y + 4.6, value || "—", Object.assign({ size: TEXT_SIZES.meta, weight: "600" }, options)));
  };
  items.push(text(box.x + 3, box.y + 6.4, meta.company || meta.author || "", { size: TEXT_SIZES.meta, weight: "600", color: "#334155" }));
  items.push(text(box.x + box.w - 3, box.y + 6.4, meta.date || "", { size: TEXT_SIZES.small, anchor: "end", color: "#6b7280" }));
  items.push(text(box.x + 3, rowY[0] - 2.4, meta.title || "", { size: TEXT_SIZES.title, weight: "bold" }));

  field(box.x + 3, rowY[0] + 3.4, "MATERIAL", meta.material);
  field(box.x + box.w * 0.3, rowY[0] + 3.4, "FINISH", meta.finish);
  field(colX + 3, rowY[0] + 3.4, "MASS", meta.mass);
  field(box.x + 3, rowY[1] + 3.4, "DRAWN", meta.author);
  field(midX + 3, rowY[1] + 3.4, "DWG NO.", meta.number);
  field(colX + 3, rowY[1] + 3.4, "SCALE", scaleLabel(sheetScale) + " · " + (doc.units || "mm"));
  field(thirdX + 3, rowY[1] + 3.4, "SHEET", (meta.sheet || 1) + " / " + (meta.sheets || 1));
  items.push(text(box.x + box.w - 3, rowY[0] - 2.4, "REV " + (meta.revision || "A"), { size: TEXT_SIZES.view, anchor: "end", weight: "bold" }));

  /* The angle symbol and the general tolerance note sit above the block, where
     ISO 7200 puts the data that applies to the whole sheet. */
  const symbolY = box.y - 7;
  items.push(...projectionSymbol(box.x + 3, symbolY, 5, doc.projection === "first"));
  items.push(text(box.x + 22, symbolY + 1.6, (doc.projection === "first" ? "FIRST" : "THIRD") + " ANGLE", { size: TEXT_SIZES.small, color: "#6b7280" }));
  if (meta.tolerance) {
    items.push(text(box.x + box.w - 3, symbolY + 1.6, "GENERAL TOL " + meta.tolerance, { size: TEXT_SIZES.small, anchor: "end", color: "#6b7280" }));
  }
  return items;
}

/* A parts list, numbered top-down from the sheet's bottom-right the way an
   assembly drawing carries it. */
function bomTableItems(doc, rows) {
  const box = titleBlockBox(doc);
  const width = box.w, rowHeight = 6, header = 6;
  const height = header + rows.length * rowHeight;
  const x = box.x, y = box.y - height - 12;
  const items = [rect(x, y, width, height, "frame", { fill: "#ffffff" })];
  const columns = [0.12, 0.12, 0.52, 0.24];
  let cursor = x;
  const edges = columns.map((fraction) => { cursor += fraction * width; return cursor; });
  edges.slice(0, -1).forEach((edge) => items.push(line(edge, y, edge, y + height, "frame")));
  items.push(line(x, y + header, x + width, y + header, "frame"));
  const captions = ["ITEM", "QTY", "DESCRIPTION", "MATERIAL"];
  let left = x;
  captions.forEach((caption, index) => {
    items.push(text(left + 1.5, y + header - 1.6, caption, { size: TEXT_SIZES.small, weight: "600", color: "#6b7280" }));
    left = edges[index];
  });
  rows.forEach((row, index) => {
    const rowY = y + header + (index + 1) * rowHeight - 1.6;
    let cell = x;
    [String(row.item ?? index + 1), String(row.qty ?? 1), row.name || "", row.material || ""].forEach((value, column) => {
      items.push(text(cell + 1.5, rowY, value, { size: TEXT_SIZES.small }));
      cell = edges[column];
    });
    items.push(line(x, y + header + (index + 1) * rowHeight, x + width, y + header + (index + 1) * rowHeight, "thin"));
  });
  return items;
}

/* ---- SVG ---------------------------------------------------------------- */

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const round3 = (value) => Math.round(num(value) * 1000) / 1000;

function strokeAttrs(styleName) {
  const style = LINE_STYLES[styleName];
  if (!style) return 'fill="none" stroke="#101418" stroke-width="0.3"';
  return 'fill="none" stroke="' + style.color + '" stroke-width="' + style.width + '"' +
    (style.dash ? ' stroke-dasharray="' + style.dash.join(" ") + '"' : "");
}

const ANCHORS = { start: "start", middle: "middle", end: "end" };

/* The same item list the canvas paints, as an SVG page in real millimetres —
   so an exported sheet prints at the size the title block claims. */
export function sceneToSvg(scene, options = {}) {
  const { paper } = scene;
  const parts = [];
  for (const item of scene.items) {
    if (item.type === "rect") {
      parts.push('<rect x="' + round3(item.x) + '" y="' + round3(item.y) + '" width="' + round3(item.w) +
        '" height="' + round3(item.h) + '" ' + (item.fill ? 'fill="' + item.fill + '" ' : 'fill="none" ') +
        (item.style === "paper" ? 'stroke="none"' : strokeAttrs(item.style).replace(/fill="none" /, "")) + "/>");
    } else if (item.type === "line") {
      parts.push('<line x1="' + round3(item.x1) + '" y1="' + round3(item.y1) + '" x2="' + round3(item.x2) +
        '" y2="' + round3(item.y2) + '" ' + strokeAttrs(item.style) + "/>");
    } else if (item.type === "circle") {
      parts.push('<circle cx="' + round3(item.cx) + '" cy="' + round3(item.cy) + '" r="' + round3(item.r) +
        '" ' + strokeAttrs(item.style) + "/>");
    } else if (item.type === "arc") {
      const x1 = item.cx + Math.cos(item.a0) * item.r, y1 = item.cy + Math.sin(item.a0) * item.r;
      const x2 = item.cx + Math.cos(item.a1) * item.r, y2 = item.cy + Math.sin(item.a1) * item.r;
      const large = Math.abs(item.a1 - item.a0) > Math.PI ? 1 : 0;
      parts.push('<path d="M' + round3(x1) + "," + round3(y1) + "A" + round3(item.r) + "," + round3(item.r) +
        " 0 " + large + ' 1 ' + round3(x2) + "," + round3(y2) + '" ' + strokeAttrs(item.style) + "/>");
    } else if (item.type === "poly") {
      const points = item.pts.map((point) => round3(point.x) + "," + round3(point.y)).join(" ");
      parts.push("<" + (item.closed ? "polygon" : "polyline") + ' points="' + points + '" ' +
        (item.fill ? 'fill="' + item.fill + '" stroke="none"' : strokeAttrs(item.style)) + "/>");
    } else if (item.type === "text") {
      const transform = item.rotate ? ' transform="rotate(' + round3(item.rotate) + " " + round3(item.x) + " " + round3(item.y) + ')"' : "";
      parts.push('<text x="' + round3(item.x) + '" y="' + round3(item.y) + '" font-size="' + round3(item.size) +
        '" text-anchor="' + (ANCHORS[item.anchor] || "start") + '" fill="' + (item.color || "#101418") + '"' +
        (item.weight ? ' font-weight="' + item.weight + '"' : "") + transform + ">" + esc(item.text) + "</text>");
    }
  }
  const pixelScale = options.pixelsPerMm || 1;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + round3(paper.w * pixelScale) + 'mm" height="' +
    round3(paper.h * pixelScale) + 'mm" viewBox="0 0 ' + round3(paper.w) + " " + round3(paper.h) + '">' +
    '<style>text{font-family:"ISOCPEUR","Helvetica Neue",Arial,sans-serif;letter-spacing:.02em}</style>' +
    '<rect width="' + round3(paper.w) + '" height="' + round3(paper.h) + '" fill="#ffffff"/>' +
    parts.join("") + "</svg>";
}

/* ---- editing helpers ---------------------------------------------------- */

export function addViewToSheet(doc, dir, options = {}) {
  const view = createView(dir, options);
  if (!doc.views.length) view.primary = true;
  doc.views.push(view);
  return view;
}

export function removeViewFromSheet(doc, id) {
  const index = doc.views.findIndex((view) => view.id === id);
  if (index < 0) return false;
  const [removed] = doc.views.splice(index, 1);
  doc.dims = (doc.dims || []).filter((dim) => dim.viewId !== id);
  doc.notes = (doc.notes || []).filter((note) => !note.leader || note.leader.viewId !== id);
  doc.views = doc.views.filter((view) => view.parent !== id || !(view.section || view.detail));
  if (removed.primary && doc.views.length) doc.views[0].primary = true;
  return true;
}

export function nextSectionTag(doc) {
  const used = new Set((doc.views || []).map((view) => view.section?.tag || view.detail?.tag).filter(Boolean));
  for (const letter of "ABCDEFGHJKLMNPQRSTUV") if (!used.has(letter)) return letter;
  return "A";
}

/* Which views may be added: the six principal directions plus pictorials, minus
   the ones already on the sheet. */
export function availableViewDirs(doc) {
  const taken = new Set((doc.views || []).filter((view) => !view.section && !view.detail).map((view) => view.dir));
  return [...ORTHO_VIEWS, "iso", "isoleft"].filter((dir) => !taken.has(dir));
}

import { analyzeSectionBoundaries } from "./core/section_boundaries.js";
import { balloonRadius, layoutBalloonCenters } from "./core/balloon_layout.js";
import {drawingPrimitiveItems} from './core/drawing_primitives.js';
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

/* ISO and ANSI paper sizes in millimetres, landscape. A sheet is described by the paper it is
   printed on, so the same document prints right on any of them. */
export const SHEET_SIZES = Object.freeze({
  A4: { w: 297, h: 210, label: "A4" },
  A3: { w: 420, h: 297, label: "A3" },
  A2: { w: 594, h: 420, label: "A2" },
  A1: { w: 841, h: 594, label: "A1" },
  A0: { w: 1189, h: 841, label: "A0" },
  Letter: { w: 279.4, h: 215.9, label: "Letter" },
  Tabloid: { w: 431.8, h: 279.4, label: "Tabloid" },
  ANSI_C: { w: 558.8, h: 431.8, label: "C (ANSI)" },
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
  /* A dimension that lost its reference. Loud on purpose: the alternative is a
     stale number that reads as measured. */
  dimLost:  { width: 0.35, color: "#c0392b", dash: [1.8, 1.4] },
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
    draftingStandard: ["ANSI", "ISO"].includes(options.draftingStandard) ? options.draftingStandard : "custom",
    secondaryUnits: UNIT_FACTORS[options.secondaryUnits] ? options.secondaryUnits : "",
    secondaryPrecision: Number.isInteger(options.secondaryPrecision) ? clamp(options.secondaryPrecision,0,8) : 2,
    size: SHEET_SIZES[options.size] ? options.size : "A3",
    orientation: options.orientation === "portrait" ? "portrait" : "landscape",
    projection: options.projection === "first" ? "first" : "third",
    units: UNIT_FACTORS[options.units] ? options.units : "mm",
    ...(Number.isInteger(options.precision)?{precision:clamp(options.precision,0,8)}:{}),
    ...(typeof options.trailingZeros==="boolean"?{trailingZeros:options.trailingZeros}:{}),
    scale: options.scale || "fit",
    showHidden: options.showHidden !== false,
    showCenters: options.showCenters !== false,
    showZones: options.showZones !== false,
    views: [],
    dims: [],
    notes: [],
    primitives: [],
    title: Object.assign({
      title: "", number: "", revision: "A", author: "", company: "", material: "",
      finish: "", mass: "", date: "", sheet: 1, sheets: 1,
      tolerance: "",
    }, options.title || {}),
  };
  const set = Array.isArray(options.views) ? options.views : ["front", "top", "right", "iso"];
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
    configurationId: options.configurationId || null,      // null = active model configuration
    configurationName: options.configurationName || null,
    primary: !!options.primary,
    parent: options.parent || null,
    hidden: options.hidden !== undefined ? !!options.hidden : null,
    displayStyle: ["shaded","shadedEdges"].includes(options.displayStyle) ? options.displayStyle : "edges",
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
  if (!def.drawing || typeof def.drawing !== "object" || !Array.isArray(def.drawing.views)) {
    // the stored name is the link to Description (see sheetTitleText)
    const empty = !(def.parts || []).length && !(def.features || []).length;
    def.drawing = createSheetDoc(Object.assign({ title: { title: def.name || "" }, ...(empty ? {views:[]} : {}) }, options));
  }
  const doc = def.drawing;
  doc.views = doc.views.filter(Boolean).map((view) => Object.assign(createView(view.dir, view), view));
  doc.views.forEach(view => {
    view.configurationName = view.configurationId
      ? (def.configurations || []).find(cfg => cfg.id === view.configurationId)?.name || null
      : null;
  });
  if (doc.views.length && !doc.views.some((view) => view.primary)) doc.views[0].primary = true;
  doc.dims = Array.isArray(doc.dims) ? doc.dims : [];
  doc.notes = Array.isArray(doc.notes) ? doc.notes : [];
  doc.primitives = Array.isArray(doc.primitives) ? doc.primitives : [];
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
  if (!view || view.primary || isOrthoView(view.dir) || view.section || view.detail) return sheetScale;
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

const VIEW_GAP = 20;      // millimetres of paper between neighbouring principal views
const FLOAT_GAP = 14;     // between pictorials, sections and details
const LABEL_PAD = TEXT_SIZES.view + 8;  // caption parked under a view

function paperSizeOf(view, extents, doc, sheetScale) {
  const box = extents.get(view.id) || { w: 10, h: 10 };
  const k = paperPerModel(viewScaleOf(doc, view, sheetScale));
  return { w: Math.max(box.w * k, 6), h: Math.max(box.h * k, 6) };
}

function occupancyBox(cx, cy, w, h, labelled) {
  return { x: cx - w / 2, y: cy - h / 2, w, h: h + (labelled !== false ? LABEL_PAD : 0) };
}

function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/* The room the principal views get: the frame, less a column sized for the
   pictorials and sections at this scale, less the title block when that column
   is not there to keep them off it. */
function drawingArea(doc, columnW) {
  const frame = sheetFrame(doc), title = titleBlockBox(doc);
  const column = Math.max(0, columnW || 0);
  const x1 = frame.x1 - 6 - column;
  const extendsOverTitle = x1 > title.x - 4;
  const notesBottom = Number(doc.notesBandHeight) > 0
    ? frame.y1 - Math.max(title.h, Number(doc.notesBandHeight)) - 6 : frame.y1 - 6;
  return {
    x0: frame.x0 + 6, y0: frame.y0 + 6 + (doc.bomRowCount ? (doc.bomHeight ?? 6 + doc.bomRowCount * 6) + 12 : 0),
    x1, y1: Math.min(extendsOverTitle ? title.y - 6 : frame.y1 - 6, notesBottom),
    get w() { return this.x1 - this.x0; },
    get h() { return this.y1 - this.y0; },
    column, frame, title,
  };
}

function placePrincipalCluster(doc, extents, sheetScale, area, mustFit = true) {
  const metrics = clusterMetrics(doc, extents);
  const primary = metrics.primary;
  const sizeOf = (view) => paperSizeOf(view, extents, doc, sheetScale);
  const k = paperPerModel(sheetScale);
  const primarySize = sizeOf(primary);
  let gap = VIEW_GAP;
  if (!mustFit) {
    const rawW = (metrics.left + metrics.right) * k + primarySize.w;
    const rawH = (metrics.above + metrics.below) * k + primarySize.h;
    const gapsW = (metrics.left ? 1 : 0) + (metrics.right ? 1 : 0);
    const gapsH = (metrics.above ? 1 : 0) + (metrics.below ? 1 : 0);
    const availW = area.w - rawW;
    const availH = area.h - rawH;
    const maxGapW = gapsW > 0 ? availW / gapsW : VIEW_GAP;
    const maxGapH = gapsH > 0 ? availH / gapsH : VIEW_GAP;
    gap = Math.max(4, Math.min(VIEW_GAP, maxGapW, maxGapH));
  }
  const spread = {
    left: metrics.left * k + (metrics.left ? gap : 0),
    right: metrics.right * k + (metrics.right ? gap : 0),
    above: metrics.above * k + (metrics.above ? gap : 0),
    below: metrics.below * k + (metrics.below ? gap : 0),
  };
  const clusterW = spread.left + primarySize.w + spread.right;
  const clusterH = spread.above + primarySize.h + spread.below;
  if (mustFit && (clusterW > area.w + 0.5 || clusterH > area.h + 0.5)) return null;
  const placed = new Map();
  const first = doc.projection === "first";
  /* Centre the whole cluster, not the front view: with a top view above and a
     right view beside it, centring the front alone pushes the group into the
     title block. */
  const anchor = {
    x: num(primary.x, area.x0 + Math.max(0, (area.w - clusterW) / 2) + spread.left + primarySize.w / 2),
    y: num(primary.y, area.y0 + Math.max(0, (area.h - clusterH) / 2) + spread.above + primarySize.h / 2),
  };
  placed.set(primary.id, {
    x: anchor.x, y: anchor.y, w: primarySize.w, h: primarySize.h, align: null,
    scale: viewScaleOf(doc, primary, sheetScale),
  });
  for (const view of doc.views) {
    if (view === primary || metrics.floating.includes(view)) continue;
    const size = sizeOf(view);
    let x = anchor.x, y = anchor.y, align = null;
    if (view.dir === "top" || view.dir === "bottom") {
      const above = (view.dir === "top") !== first;
      y = anchor.y + (above ? -1 : 1) * (primarySize.h / 2 + size.h / 2 + gap);
      align = "vertical";
    } else if (view.dir === "right" || view.dir === "left") {
      const right = (view.dir === "right") !== first;
      x = anchor.x + (right ? 1 : -1) * (primarySize.w / 2 + size.w / 2 + gap);
      align = "horizontal";
    } else if (view.dir === "back") {
      x = anchor.x + primarySize.w / 2 + metrics.right * k + size.w / 2 + gap * 2;
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
  const title = area.title || titleBlockBox(doc);
  const titleOcc = { x: title.x - 4, y: title.y - 4, w: title.w + 8, h: title.h + 8 };
  if (mustFit) {
    for (const place of placed.values()) {
      if (rectsOverlap(occupancyBox(place.x, place.y, place.w, place.h, true), titleOcc, 2)) return null;
    }
  }
  return { placed, anchor, primary, metrics };
}

/* Fill a rectangle left-to-right, top-to-bottom. Views that cannot sit in this
   rectangle are returned as leftover so a later pass can look elsewhere —
   stacking them on the title block is how the sheet used to become unreadable. */
function shelfPack(items, rect, gap) {
  const placed = [], leftover = [];
  if (!rect || rect.w < 1 || rect.h < 1) return { placed, leftover: items.slice() };
  let x = rect.x, y = rect.y, rowH = 0;
  for (const item of items) {
    if (item.w > rect.w + 0.5 || item.h > rect.h + 0.5) { leftover.push(item); continue; }
    if (x > rect.x && x + item.w > rect.x + rect.w + 0.5) {
      x = rect.x;
      y += rowH + gap;
      rowH = 0;
    }
    if (y + item.h > rect.y + rect.h + 0.5) { leftover.push(item); continue; }
    placed.push({ id: item.id, x: x + item.geomW / 2, y: y + item.geomH / 2, w: item.geomW, h: item.geomH });
    rowH = Math.max(rowH, item.h);
    x += item.w + gap;
  }
  return { placed, leftover };
}

function findSlot(w, h, occupied, bounds, gap) {
  const step = 4;
  for (let y = bounds.y0; y + h <= bounds.y1 + 0.51; y += step) {
    for (let x = bounds.x0; x + w <= bounds.x1 + 0.51; x += step) {
      const box = { x, y, w, h };
      if (occupied.every((other) => !rectsOverlap(box, other, gap))) return box;
    }
  }
  return null;
}

function findBestPlacement(w, h, occupied, bounds, titleOcc) {
  for (const gap of [FLOAT_GAP, 8, 4, 2, 0]) {
    const slot = findSlot(w, h, occupied, bounds, gap);
    if (slot) return slot;
  }
  const step = 4;
  let bestBox = null, minOverlap = Infinity;
  for (let y = bounds.y0; y + h <= bounds.y1 + 0.51; y += step) {
    for (let x = bounds.x0; x + w <= bounds.x1 + 0.51; x += step) {
      const box = { x, y, w, h };
      if (rectsOverlap(box, titleOcc, 2)) continue;
      let overlapArea = 0;
      for (const other of occupied) {
        if (rectsOverlap(box, other, 0)) {
          const ox = Math.max(0, Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x));
          const oy = Math.max(0, Math.min(box.y + box.h, other.y + other.h) - Math.max(box.y, other.y));
          overlapArea += ox * oy;
        }
      }
      if (overlapArea < minOverlap) {
        minOverlap = overlapArea;
        bestBox = box;
        if (overlapArea === 0) return box;
      }
    }
  }
  if (bestBox) return bestBox;
  return {
    x: Math.max(bounds.x0, bounds.x1 - w - (occupied.length % 4) * 24),
    y: Math.max(bounds.y0, bounds.y0 + (occupied.length % 4) * 24),
    w, h,
  };
}

function uniquePositive(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = Math.round(value * 10);
    if (!(value > 0) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* Place every view at one scale. mustFit rejects a scale that would pile
   pictorials or sections on top of each other or the principal cluster. */
function placeAtScale(doc, extents, sheetScale, mustFit) {
  const frame = sheetFrame(doc), title = titleBlockBox(doc);
  if(doc.assemblyLayout && doc.views.length===1 && /^iso/.test(doc.views[0].dir || "") && doc.views[0].x==null && doc.views[0].y==null) {
    var view=doc.views[0],size=paperSizeOf(view,extents,doc,sheetScale),area=drawingArea(doc,0);
    var regions=[area];
    if(doc.bomRowCount)regions.push({x0:frame.x0+6+title.w+12,y0:frame.y0+6,x1:frame.x1-6,y1:area.y1});
    var labelHeight=view.labelled!==false ? LABEL_PAD : 0;
    var region=regions.find(function(box){return size.w<=box.x1-box.x0+.5 && size.h+labelHeight<=box.y1-box.y0+.5;});
    if(region){
      var x=(region.x0+region.x1)/2,y=(region.y0+region.y1-labelHeight)/2;
      return {placements:new Map([[view.id,{x,y,w:size.w,h:size.h,align:null,scale:viewScaleOf(doc,view,sheetScale)}]]),sheetScale,primaryId:view.id,anchor:{x,y}};
    }
    if(mustFit || doc.enforceFit)return null;
  }
  const metrics = clusterMetrics(doc, extents);
  const sizeOf = (view) => paperSizeOf(view, extents, doc, sheetScale);
  const floats = metrics.floating.map((view) => {
    const size = sizeOf(view);
    return {
      view, id: view.id, geomW: size.w, geomH: size.h,
      w: size.w, h: size.h + (view.labelled !== false ? LABEL_PAD : 0),
      scale: viewScaleOf(doc, view, sheetScale),
      pinned: view.x != null || view.y != null,
    };
  });
  const maxFloatW = floats.reduce((widest, item) => Math.max(widest, item.w), 0);
  const columnCandidates = !floats.length ? [0] : uniquePositive([
    maxFloatW + 12,
    maxFloatW * 1.5 + 12,
    Math.min(frame.w * 0.42, maxFloatW * 2 + FLOAT_GAP + 12),
    Math.min(frame.w * 0.5, maxFloatW * 3 + FLOAT_GAP * 2 + 12),
    Math.max(0, frame.w * 0.35),
    0,
  ]);

  let fallback = null;
  const titleOcc = { x: title.x - 4, y: title.y - 4, w: title.w + 8, h: title.h + 8 };
  const bounds = { x0: frame.x0 + 6, y0: frame.y0 + 6, x1: frame.x1 - 6,
    y1: frame.y1 - (Number(doc.notesBandHeight) > 0 ? Math.max(title.h, Number(doc.notesBandHeight)) : 0) - 6 };

  for (const columnW of columnCandidates) {
    const area = drawingArea(doc, columnW);
    const principal = placePrincipalCluster(doc, extents, sheetScale, area, mustFit);
    if (!principal) continue;
    const placements = new Map(principal.placed);
    const occupied = [titleOcc];
    for (const place of principal.placed.values()) {
      occupied.push(occupancyBox(place.x, place.y, place.w, place.h, true));
    }

    const autoFloats = floats.filter((item) => !item.pinned);
    for (const item of floats.filter((entry) => entry.pinned)) {
      const x = num(item.view.x, 0), y = num(item.view.y, 0);
      placements.set(item.id, { x, y, w: item.geomW, h: item.geomH, align: null, scale: item.scale });
      occupied.push(occupancyBox(x, y, item.geomW, item.geomH, item.view.labelled));
    }

    const floatRect = columnW ? {
      x: area.x1 + 8,
      y: area.y0,
      w: frame.x1 - 8 - (area.x1 + 8),
      h: title.y - 8 - area.y0,
    } : null;
    const packed = floatRect ? shelfPack(autoFloats, floatRect, FLOAT_GAP) : { placed: [], leftover: autoFloats.slice() };
    for (const place of packed.placed) {
      const item = floats.find((entry) => entry.id === place.id);
      placements.set(place.id, { x: place.x, y: place.y, w: place.w, h: place.h, align: null, scale: item.scale });
      occupied.push(occupancyBox(place.x, place.y, place.w, place.h, true));
    }

    let failed = false;
    for (const item of packed.leftover) {
      const slot = findSlot(item.w, item.h, occupied, bounds, FLOAT_GAP)
        || findSlot(item.w, item.h, occupied, bounds, 4)
        || findSlot(item.w, item.h, occupied, bounds, 1);
      if (!slot) {
        failed = true;
        if (mustFit) break;
        const best = findBestPlacement(item.w, item.h, occupied, bounds, titleOcc);
        placements.set(item.id, {
          x: best.x + item.geomW / 2, y: best.y + item.geomH / 2,
          w: item.geomW, h: item.geomH, align: null, scale: item.scale,
        });
        occupied.push(best);
        continue;
      }
      placements.set(item.id, {
        x: slot.x + item.geomW / 2, y: slot.y + item.geomH / 2,
        w: item.geomW, h: item.geomH, align: null, scale: item.scale,
      });
      occupied.push(slot);
    }
    const result = { placements, sheetScale, primaryId: principal.primary.id, anchor: principal.anchor };
    if (!failed) return result;
    if (!mustFit && !fallback) fallback = result;
  }
  return fallback;
}

/* The largest standard scale at which every view still fits the paper without
   overlapping. A scale a reader cannot reason about is worse than a view with
   air around it, so this only ever picks from the list. */
export function fitScale(doc, extents) {
  for (const scale of STANDARD_SCALES) {
    if (placeAtScale(doc, extents, scale, true)) return scale;
  }
  return STANDARD_SCALES[STANDARD_SCALES.length - 1];
}

/* Where each view sits, in millimetres. Principal views hold the projection
   convention — in third angle the top view is above the front and the right
   view is to its right; first angle puts each one on the opposite side — so a
   reader can tell which way the object is facing without reading a label.
   Pictorials, sections and details pack into the leftover paper instead of
   stacking on the same point once the reserved column runs out. */
export function layoutViews(doc, extents) {
  if (!doc.views.length) return {placements:new Map(),sheetScale:doc.scale === "fit" ? "1:1" : doc.scale,primaryId:null,anchor:null};
  const sheetScale = doc.scale === "fit" ? fitScale(doc, extents) : doc.scale;
  const placed = placeAtScale(doc, extents, sheetScale, doc.enforceFit===true);
  if(!placed && doc.enforceFit)throw new Error("Drawing scale does not fit the available sheet. Choose Fit to sheet or a larger sheet size.");
  if (placed) return placed;
  const frame = sheetFrame(doc);
  const primary = doc.views[0];
  const placements = new Map();
  doc.views.forEach((view, index) => {
    const size = paperSizeOf(view, extents, doc, sheetScale);
    const col = index % 3, row = Math.floor(index / 3);
    const x = frame.x0 + 40 + col * 100, y = frame.y0 + 40 + row * 80;
    placements.set(view.id, { x, y, w: size.w, h: size.h, align: null, scale: viewScaleOf(doc, view, sheetScale) });
  });
  return { placements, sheetScale, primaryId: primary?.id, anchor: { x: frame.x0 + 60, y: frame.y0 + 60 } };
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
    const key = view.id + "#" + [view.dir, view.displayStyle, view.configurationId || "", JSON.stringify(view.section || 0), JSON.stringify(view.detail || 0)].join("|");
    if (cache.has(key)) return cache.get(key);
    const viewBodies = options.bodiesForView ? options.bodiesForView(view) || bodies : bodies;
    const viewOptions={...options,shaded:["shaded","shadedEdges"].includes(view.displayStyle)};
    let projection = null;
    if (view.section) projection = projectSection(doc, view, viewBodies, viewOptions);
    else if (view.detail) {
      const parent = (doc.views || []).find((entry) => entry.id === view.detail.from);
      const base = parent ? project({...parent,displayStyle:view.displayStyle}) : projectSolid(viewBodies, view.dir, viewOptions);
      projection = cropProjection(base, view.detail);
    } else projection = projectSolid(viewBodies, view.dir, viewOptions);
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
      // Half-open crossings count a shared vertex once; tangencies cancel.
      if ((da > 0) === (db > 0)) continue;
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
  return analyzeSectionBoundaries(segments, tolerance).loops;
}

/* ---- dimensions --------------------------------------------------------- */

export function formatLength(modelValue, doc) {
  const units = doc?.units || "mm";
  const factor = UNIT_FACTORS[units] || 10;
  const decimals = Number.isInteger(doc?.precision) ? clamp(doc.precision,0,8) : UNIT_DECIMALS[units] ?? 1;
  const value = num(modelValue) * factor;
  const rounded = Math.abs(value) < .5 * 10 ** -decimals ? 0 : value;
  const digits=rounded.toFixed(decimals);
  const fixed = (doc?.trailingZeros ?? Number.isInteger(doc?.precision)) || !digits.includes(".") ? digits : digits.replace(/\.?0+$/, "");
  return fixed || "0";
}

/* A dimension's own tolerance is SPECIFIC: it overrides the title block's
   general note (meta.tolerance, printed once above the block) for this one
   dimension, which is why it prints on the dimension itself and the general
   one never is. It also survives an overridden value — a draughtsman who
   writes "2×⌀5" over the measured number has not withdrawn the fit beside
   it. */
export function dimensionText(dim, doc) {
  if(dim.reference)return "("+dimensionText({...dim,reference:false},doc)+")";
  if(Number.isInteger(dim.quantity) && dim.quantity>1)return dim.quantity+"X "+dimensionText({...dim,quantity:1},doc);
  const suffix = dim.tolerance ? " " + dim.tolerance : "";
  // <> keeps the measured value live inside custom text, e.g. Ø<> for a
  // bolt-circle span. Literal overrides remain literal for existing sheets.
  if (dim.text) {
    const text = String(dim.text);
    const measured = text.includes("<>") ? dimensionText({...dim,text:"",tolerance:""},doc) : "";
    return text.replaceAll("<>", measured) + suffix;
  }
  const value = formatLength(dim.measure, doc);
  const prefix = dim.type === "diameter" ? "⌀" : dim.type === "radius" ? "R" : "";
  if (dim.type === "angle") return trimNumber(Math.round(num(dim.measure) * 10) / 10) + "°" + suffix;
  const secondary = UNIT_FACTORS[doc?.secondaryUnits] && doc.secondaryUnits !== doc.units
    ? " [" + formatLength(dim.measure, {units:doc.secondaryUnits,precision:doc.secondaryPrecision ?? 2,trailingZeros:true}) + "]" : "";
  return prefix + value + secondary + suffix;
}

/* The measured value of a dimension, from the points it holds. Stored
   references are in the view's own model coordinates, so a view that moves or
   rescales carries its dimensions with it and they still read true.
   Call it on the copy resolveDim returns, not on the stored record: the stored
   points are where the dimension WAS placed, which after a rebuild is history. */
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

/* ---- associative references ---------------------------------------------

   A dimension is anchored to NAMED geometry, not to a frozen pair of view
   coordinates. A ref carries the persistent topology id it was placed on plus
   the (u, v) it projected to at the time; the stored point is the LAST KNOWN
   position, never the measurement, because a number that used to be right and
   silently stays is exactly the defect this replaces.

   Resolution is EXACT ID ONLY — the same contract resolveBrepSubshape and the
   variable-radius fillet's per-edge overrides keep. An id that no longer exists
   is DROPPED; it is never slid onto the nearest neighbouring edge, because a
   dimension that quietly re-aims at different geometry is worse than one that
   admits it lost its reference. See resolveTopologyReference for the ranked
   fallback this deliberately does NOT use.

   A ref names one entry and one anchor on it: "a"/"b" (an edge's ends, ordered
   by coordinate), "mid" (its centre of mass), "centre" and "qu+"/"qu-"/"qv+"/
   "qv-" (a circular edge's centre and quadrants, in the view's own frame). */

/* Endpoints are ordered by coordinate, matching how extractBrepTopology sorts
   the ones it stores, so "a" means the same end whichever source named it. */
const byCoordinate = (p, q) => p.x - q.x || p.y - q.y || p.z - q.z;

export function createTopologyIndex(source) {
  const index = new Map();
  const walk = (item) => {
    if (!item) return;
    if (Array.isArray(item)) { item.forEach(walk); return; }
    if (Array.isArray(item.topology)) { item.topology.forEach(walk); return; }
    if (item.persistentId && !index.has(item.persistentId)) index.set(item.persistentId, item);
  };
  walk(source);
  return index;
}

/* Kernel edges carry their endpoints; analytic ones (a box rib, an extrusion
   side) carry a centre, a tangent and a length, which is the same two points. */
function edgeEndpoints(descriptor) {
  const stored = descriptor?.endpoints;
  if (Array.isArray(stored) && stored.length >= 2) return stored.slice(0, 2).sort(byCoordinate);
  const origin = descriptor?.origin, axis = descriptor?.axis, measure = num(descriptor?.measure);
  if (!origin || !axis || !(measure > 0) || descriptor.curve === "circle") return null;
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (!(length > 1e-9)) return null;
  const half = measure / (2 * length);
  return [
    { x: origin.x - axis.x * half, y: origin.y - axis.y * half, z: origin.z - axis.z * half },
    { x: origin.x + axis.x * half, y: origin.y + axis.y * half, z: origin.z + axis.z * half },
  ].sort(byCoordinate);
}

export const projectToView = (point, basis) => (point && basis ? {
  u: point.x * basis.right.x + point.y * basis.right.y + point.z * basis.right.z,
  v: point.x * basis.up.x + point.y * basis.up.y + point.z * basis.up.z,
} : null);

/* One named straight edge as a segment in the view's own frame, or null when
   it is a circle, unnamed, or projects to a point (an edge seen end-on). */
function edgeSegmentInView(entry, basis) {
  if (!entry || entry.kind !== "edge") return null;
  const ends = edgeEndpoints(entry.descriptor || {});
  if (!ends) return null;
  const p = projectToView(ends[0], basis), q = projectToView(ends[1], basis);
  if (!p || !q) return null;
  return Math.hypot(q.u - p.u, q.v - p.v) > 1e-9 ? { p, q } : null;
}

/* Where two segments cross, or null when they are parallel or when the meeting
   point is off the end of either. Off-the-end is deliberately NOT returned: the
   point the user snapped to was two lines crossing, and lines that no longer
   cross have not moved that point, they have destroyed it. */
export function segmentIntersection(a, b, slack = 1e-9) {
  const rx = a.q.u - a.p.u, ry = a.q.v - a.p.v;
  const sx = b.q.u - b.p.u, sy = b.q.v - b.p.v;
  const denominator = rx * sy - ry * sx;
  const scale = Math.hypot(rx, ry) * Math.hypot(sx, sy);
  if (!(Math.abs(denominator) > 1e-12 * Math.max(scale, 1e-6))) return null;
  const t = ((b.p.u - a.p.u) * sy - (b.p.v - a.p.v) * sx) / denominator;
  const u = ((b.p.u - a.p.u) * ry - (b.p.v - a.p.v) * rx) / denominator;
  if (t < -slack || t > 1 + slack || u < -slack || u > 1 + slack) return null;
  return { u: a.p.u + rx * t, v: a.p.v + ry * t };
}

/* An intersection is a DERIVED anchor: two parents, not one. The ref names both
   ids and the point is recomputed by crossing the two named edges in the view's
   own frame on every build, so it follows the model exactly as a single-parent
   ref does — and it dangles the moment EITHER parent is gone, because half a
   parentage is not a reference. */
function crossAnchor(ref, index, basis) {
  const a = edgeSegmentInView(index.get(ref.pid), basis);
  const b = edgeSegmentInView(index.get(ref.pid2), basis);
  if (!a || !b) return null;
  return segmentIntersection(a, b, 1e-6);
}

/* Every crossing of two named edges in one view. A crossing that no topology
   names is deliberately absent: it would have to bind to the triangles, which
   carry no identity at all. Quadratic, so it is capped — beyond that many named
   edges the crossings are unreadable on paper anyway. */
export const MAX_CROSS_EDGES = 240;

export function topologyCrossings(index, basis) {
  const out = [];
  if (!index || !basis) return out;
  const ids = Array.from(index.keys()).sort();
  const segments = [];
  for (const pid of ids) {
    const segment = edgeSegmentInView(index.get(pid), basis);
    if (segment) segments.push({ pid, segment });
    if (segments.length >= MAX_CROSS_EDGES) break;
  }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const point = segmentIntersection(segments[i].segment, segments[j].segment);
      if (!point) continue;
      /* Two edges that merely meet at a shared corner are not an intersection:
         that point already has a one-parent name of its own ("a" or "b"), and
         offering it twice would let the same corner bind two different ways. */
      const ends = [segments[i].segment.p, segments[i].segment.q, segments[j].segment.p, segments[j].segment.q];
      if (ends.some((end) => Math.hypot(end.u - point.u, end.v - point.v) < 1e-7)) continue;
      out.push({ pid: segments[i].pid, pid2: segments[j].pid, kind: "cross", at: "x", u: point.u, v: point.v });
    }
  }
  return out;
}

/* Where one ref sits in the view NOW, or null if its id is gone. */
export function resolveDimAnchor(ref, index, basis) {
  if (!ref?.pid || !index || !basis) return null;
  if (ref.kind === "cross") return ref.pid2 ? crossAnchor(ref, index, basis) : null;
  const entry = index.get(ref.pid);
  if (!entry || (ref.kind && entry.kind !== ref.kind)) return null;
  const descriptor = entry.descriptor || {};
  const at = ref.at || "mid";
  /* Model Items may dimension the distance between a feature's persistent
     start/end faces. Their plane origins move with the feature depth. Keep
     face picks out of the interactive snap set, but resolve explicit refs. */
  if (entry.kind === "face") return at === "centre" ? projectToView(descriptor.origin || descriptor.center, basis) : null;
  if (at === "a" || at === "b") {
    const ends = edgeEndpoints(descriptor);
    return ends ? projectToView(ends[at === "a" ? 0 : 1], basis) : null;
  }
  const centre = projectToView(descriptor.origin || descriptor.center, basis);
  if (!centre) return null;
  if (at === "mid" || at === "centre") return centre;
  const radius = num(descriptor.radius);
  if (!(radius > 0)) return null;
  if (at === "qu+") return { u: centre.u + radius, v: centre.v };
  if (at === "qu-") return { u: centre.u - radius, v: centre.v };
  if (at === "qv+") return { u: centre.u, v: centre.v + radius };
  if (at === "qv-") return { u: centre.u, v: centre.v - radius };
  return null;
}

const boundsRefs = (type, bounds) => (type === "vertical"
  ? [{ u: bounds.u1, v: bounds.v0 }, { u: bounds.u1, v: bounds.v1 }]
  : [{ u: bounds.u0, v: bounds.v0 }, { u: bounds.u1, v: bounds.v0 }]);

/* One dimension as the sheet should read it right now.
 *
 * @returns {dim, dangling, missing} — `dim` is a COPY with reprojected refs;
 *          the document is never rewritten, so a legacy sheet stays legacy.
 *
 * A ref with no `pid` is a legacy point: it measures exactly as it always has,
 * frozen, with no complaint. Only a ref that names an id and cannot find it is
 * dangling. With no topology source at all (an exporter handed only triangles)
 * nothing is flagged — absent information is not a lost reference. */
export function edgeAngleRefs(points) {
  if (!points || points.length !== 4) return null;
  const [a,b,c,d]=points, x=b.u-a.u,y=b.v-a.v,p=d.u-c.u,q=d.v-c.v;
  const det=x*q-y*p;
  if (Math.abs(det)<1e-10*Math.max(1,Math.hypot(x,y)*Math.hypot(p,q))) return null;
  const t=((c.u-a.u)*q-(c.v-a.v)*p)/det;
  const vertex={u:a.u+t*x,v:a.v+t*y};
  const far=(m,n)=>Math.hypot(m.u-vertex.u,m.v-vertex.v)>Math.hypot(n.u-vertex.u,n.v-vertex.v)?m:n;
  return [far(a,b),vertex,far(c,d)];
}

export function resolveDim(dim, index, basis, projection) {
  const result = { dim, dangling: false, missing: [] };
  if (!dim) return result;
  if (dim.type === "angle" && dim.edgeRefs?.length === 4) {
    const points=dim.edgeRefs.map(ref=>resolveDimAnchor(ref,index,basis));
    const refs=points.every(Boolean)?edgeAngleRefs(points):null;
    if(refs) result.dim={...dim,refs};
    else {result.dangling=!!index;result.missing=dim.edgeRefs.filter((ref,i)=>!points[i]).map(ref=>ref.pid);}
    return result;
  }
  if (dim.auto === "extent") {
    const bounds = projection ? projectionBounds(projection) : null;
    if (!bounds) { result.dangling = true; return result; }
    result.dim = Object.assign({}, dim, { refs: boundsRefs(dim.type, bounds) });
    return result;
  }
  const refs = dim.refs || [];
  if (!refs.some((ref) => ref?.pid)) return result;
  const next = refs.map((ref) => {
    if (!ref?.pid) return ref;
    const at = resolveDimAnchor(ref, index, basis);
    if (at) return Object.assign({}, ref, at);
    if (index) {
      result.dangling = true;
      /* An intersection reports the parent that is actually gone, not just the
         first of the two it names — the panel lists these ids verbatim. */
      const parents = ref.kind === "cross" ? [ref.pid, ref.pid2] : [ref.pid];
      const lost = parents.filter((pid) => pid && !index.has(pid));
      result.missing.push(...(lost.length ? lost : [ref.pid]));
    }
    return ref;                                     // drawn where it last was
  });
  const patch = { refs: next };
  if (dim.type === "radius" || dim.type === "diameter") {
    const entry = refs[0]?.pid ? index?.get(refs[0].pid) : null;
    const radius = num(entry?.descriptor?.radius);
    if (radius > 0) patch.radius = radius;
  }
  result.dim = Object.assign({}, dim, patch);
  return result;
}

/* Every named point of the model, in one view's coordinates — what a pick is
   matched against so a new dimension is BOUND rather than merely placed.
   Ordered by id so two anchors that coincide always bind the same way. */
export function topologyAnchors(index, basis) {
  const out = [];
  if (!index || !basis) return out;
  const ids = Array.from(index.keys()).sort();
  for (const pid of ids) {
    const entry = index.get(pid);
    if (entry?.kind !== "edge") continue;             // faces have no drawable snap
    const descriptor = entry.descriptor || {};
    const circle = descriptor.curve === "circle" && num(descriptor.radius) > 0;
    const wanted = circle ? ["centre", "qu+", "qu-", "qv+", "qv-"] : ["a", "b", "mid"];
    for (const at of wanted) {
      const point = resolveDimAnchor({ pid, kind: "edge", at }, index, basis);
      if (point) out.push({ pid, kind: "edge", at, u: point.u, v: point.v, radius: num(descriptor.radius) });
    }
  }
  return out;
}

/* A callout note names a FEATURE, not a sentence. Its text is re-read from
   that feature on every build — a leader that still says M6 after the wizard
   was changed to M8 is the same lie as a dimension frozen at its placed value
   — and its leader binds to topology like any dimension reference, so it
   follows the hole rather than pointing at where the hole used to be.
   A plain typed note carries neither and is never touched. */
export function resolveNote(note, callouts, index, basis, doc, properties) {
  const result = { note, dangling: false, missing: [] };
  if (!note) return result;
  const patch = {};
  if(note.modelLink?.kind === "property") {
    const key=note.modelLink.key,value=properties?.[key];
    if(value!==undefined && value!==null && String(value)!=="")patch.text=(note.text ? note.text+" " : "")+String(value);
    else {result.dangling=true;result.missing.push("property:"+key);}
  }
  if (note.modelLink?.kind === "extrudeDepth") {
    const id=note.modelLink.featureId;
    const startFace=index?.get(id+":face:start")?.descriptor;
    const start=startFace?.origin;
    const end=index?.get(id+":face:end")?.descriptor?.origin;
    if(start && end) {
      const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z,normal=startFace.normal;
      const normalLength=normal && Math.hypot(normal.x,normal.y,normal.z);
      const depth=normalLength>0 ? Math.abs((dx*normal.x+dy*normal.y+dz*normal.z)/normalLength) : Math.hypot(dx,dy,dz);
      patch.text=String(note.text || "MATERIAL THICKNESS")+" "+dimensionText({measure:depth},doc);
    } else {result.dangling=true;result.missing.push(id);}
  }
  if (note.feature && callouts) {
    const text = typeof callouts.get === "function" ? callouts.get(note.feature) : callouts[note.feature];
    if (text) patch.text = text;
    else { result.dangling = true; result.missing.push(note.feature); }
  }
  const leader = note.leader;
  if (leader?.pid) {
    const at = resolveDimAnchor(leader, index, basis);
    if (at) {
      patch.leader = Object.assign({}, leader, at);
      const descriptor = index?.get(leader.pid)?.descriptor;
      const axis = descriptor?.axis, forward = basis?.forward;
      const alignment = axis && forward ? Math.abs(axis.x * forward.x + axis.y * forward.y + axis.z * forward.z) / Math.hypot(axis.x, axis.y, axis.z) : 0;
      if (note.feature && leader.at === "centre" && descriptor?.radius > 0 && alignment > 1 - 1e-6) {
        patch.leader.rimRadius = descriptor.radius;
      }
    }
    else if (index) { result.dangling = true; result.missing.push(leader.pid); }
  }
  if (Object.keys(patch).length) result.note = Object.assign({}, note, patch);
  return result;
}

/* Everything on the sheet that lost its reference, for the UI to list: a
   dimension that can no longer measure, and a callout whose hole is gone. */
export function sheetDimIssues(scene) {
  const out = [];
  for (const [id, entry] of scene?.dims || []) {
    if (entry.dangling) out.push({ kind: "dim", id, viewId: entry.dim.viewId, missing: entry.missing.slice() });
  }
  for (const [id, entry] of scene?.notes || []) {
    if (entry.dangling) out.push({ kind: "note", id, viewId: entry.note.leader?.viewId || null, missing: entry.missing.slice() });
  }
  return out;
}

/* One dimension, in sheet millimetres, as the items that draw it: extension
   lines, the dimension line, two arrowheads and the value. */
function dimensionItems(dim, place, doc, options = {}) {
  const items = [];
  const style = options.selected ? "highlight"
    : options.dangling ? "dimLost" : dim.reference ? "dimRef" : "dim";
  const toSheet = place.toSheet;
  const offset = num(dim.offset, 10);
  /* A dangling value is the LAST one that was true, and it is bracketed and
     flagged so nobody reads it as a measurement of what is on the paper. */
  const label = options.dangling
    ? "⚠ (" + dimensionText(Object.assign({}, dim, { measure: measureDim(dim), text: "" }), doc) + ")"
    : dimensionText(Object.assign({}, dim, { measure: measureDim(dim) }), doc);
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
    let a0=Math.min(first,second), a1=Math.max(first,second);
    if(a1-a0>Math.PI){a0=Math.max(first,second);a1=Math.min(first,second)+2*Math.PI;}
    items.push({ type: "arc", cx: vertex.x, cy: vertex.y, r: radius, a0, a1, style });
    items.push(arrowHead(vertex.x+Math.cos(a0)*radius,vertex.y+Math.sin(a0)*radius,Math.sin(a0),-Math.cos(a0)));
    items.push(arrowHead(vertex.x+Math.cos(a1)*radius,vertex.y+Math.sin(a1)*radius,-Math.sin(a1),Math.cos(a1)));
    const mid = (a0 + a1) / 2;
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
    baseline: -Math.sin(upright)*normal.x+Math.cos(upright)*normal.y>0 ? "top" : "bottom",
  }));
  return items;
}

/* ---- the scene ---------------------------------------------------------- */

/* @param doc       the sheet document (see createSheetDoc)
 * @param provider  { projection(view) -> hidden_line projection,
 *                    topology, callouts (featureId -> live callout text),
 *                    meta, bom }
 * @returns { paper, items, views, scale } — millimetres, ready to paint.
 */
function exactArcStroke(segment, topologyIndex, basis, toSheet, k, style, viewId) {
  if (!topologyIndex || !basis) return null;
  const project = p => ({u:p.x*basis.right.x+p.y*basis.right.y+p.z*basis.right.z,v:p.x*basis.up.x+p.y*basis.up.y+p.z*basis.up.z});
  const turn = a => (a + Math.PI * 4) % (Math.PI * 2);
  for (const entry of topologyIndex.values()) {
    const d = entry.descriptor || {}, r = Number(d.radius);
    if (entry.kind !== "edge" || d.curve !== "circle" || !d.arcMidpoint || !d.origin || !d.axis || d.endpoints?.length !== 2 || !(r > 0)) continue;
    if (Math.abs(d.axis.x*basis.forward.x+d.axis.y*basis.forward.y+d.axis.z*basis.forward.z) < .999999) continue;
    const centre = project(d.origin), tolerance = Math.max(1e-7, r * 1e-5);
    if ([segment.a,segment.b].some(p => Math.abs(Math.hypot(p.u-centre.u,p.v-centre.v)-r) > tolerance)) continue;
    const angle = p => Math.atan2(p.v-centre.v,p.u-centre.u);
    let a0 = angle(segment.a), sweep = turn(angle(segment.b)-a0);
    if (sweep > Math.PI) { a0 = angle(segment.b); sweep = Math.PI*2-sweep; }
    if (!(sweep > 1e-9 && sweep < Math.PI/2)) continue;
    const start = angle(project(d.endpoints[0])), span = turn(angle(project(d.endpoints[1]))-start);
    const positive = turn(angle(project(d.arcMidpoint))-start) <= span;
    const middle = turn(a0+sweep/2-start);
    if (positive ? middle > span+1e-6 : middle < span-1e-6) continue;
    const screen = toSheet(centre);
    return {type:"arc",cx:screen.x,cy:screen.y,r:r*k,a0:-(a0+sweep),a1:-a0,style,viewId};
  }
  return null;
}

/* Actual assembled/exploded world endpoints share the view's geometry mapper.
   Presentation lines carry no geometry or mate changes. */
export function explodeLeaderItems(place, leaders) {
  const basis = place.projection?.basis || viewBasis(place.view.dir);
  const valid = point => point && [point.x,point.y,point.z].every(Number.isFinite);
  const items=[];
  for (const leader of leaders || []) {
    if (!valid(leader.from) || !valid(leader.to)) continue;
    const from=place.toSheet(projectToView(leader.from,basis));
    const to=place.toSheet(projectToView(leader.to,basis));
    if (Math.hypot(to.x-from.x,to.y-from.y)<1e-7) continue;
    items.push(line(from.x,from.y,to.x,to.y,"center",{
      viewId:place.id,explodeLeader:true,componentId:leader.id,
    }));
  }
  return items;
}

export function buildSheetScene(doc, provider, options = {}) {
  const bomLayout = provider?.bom?.length ? layoutBomTable(doc, provider.bom) : null;
  if (bomLayout) doc = { ...doc, bomRowCount: provider.bom.length, bomHeight: bomLayout.height };
  const items = [], diagnostics = [];
  const frame = sheetFrame(doc), paper = frame.paper;
  /* null, not an empty index: "no topology was offered" and "this id is gone"
     must not look the same to a bound dimension. */
  const rawTopology = typeof provider?.topology === "function" ? provider.topology() : provider?.topology;
  const topologyIndex = rawTopology ? createTopologyIndex(rawTopology) : null;
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
    const shaded=["shaded","shadedEdges"].includes(view.displayStyle);
    const drawEdges=view.displayStyle!=="shaded";
    const showHidden = !shaded && (view.hidden !== null && view.hidden !== undefined ? !!view.hidden
      : (isOrthoView(view.dir) || view.section) && doc.showHidden !== false);
    const showCenters = view.centers === null ? doc.showCenters !== false : !!view.centers;

    if(shaded)for(const surface of projection.surfaces || []) {
      const pts=surface.points.map(toSheet),previous=items[items.length-1];
      // Fill adjacent same-tone facets as one path. Its shared internal edges
      // are not antialiased against paper (which otherwise creates white seams).
      if(previous?.shaded && previous.viewId===view.id && previous.fill===surface.fill) {
        previous.paths.push(pts);previous.pts.push(...pts);
      } else items.push({type:"poly",closed:true,pts:pts.slice(),paths:[pts],fill:surface.fill,viewId:view.id,shaded:true});
    }

    if (projection.cuts?.length) {
      const boundary = analyzeSectionBoundaries(projection.cuts, Math.max(1e-4, (extent.w + extent.h) * 1e-3));
      diagnostics.push(...boundary.issues.map(issue => ({...issue,viewId:view.id})));
      if (!boundary.ok) items.push(text(record.box.x, record.box.y - 3, "Section boundary needs repair — hatching omitted", {size:2.5,anchor:"start",viewId:view.id}));
      const loops = boundary.loops.map((loop) => loop.map((point) => toSheet(point)));
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
    for (const segment of drawEdges ? projection.visible || [] : []) {
      const a = toSheet(segment.a), b = toSheet(segment.b);
      items.push(exactArcStroke(segment, topologyIndex, projection.basis, toSheet, k, "outline", view.id) || line(a.x, a.y, b.x, b.y, "outline", { viewId: view.id }));
    }
    if (showHidden) {
      for (const segment of projection.hidden || []) {
        const a = toSheet(segment.a), b = toSheet(segment.b);
        items.push(exactArcStroke(segment, topologyIndex, projection.basis, toSheet, k, "hidden", view.id) || line(a.x, a.y, b.x, b.y, "hidden", { viewId: view.id }));
      }
    }
    for (const round of projection.circles || []) {
      if (drawEdges && (round.drawn === "visible" || (round.drawn === "hidden" && showHidden))) {
        const centrePoint = toSheet(round);
        items.push(circle(centrePoint.x, centrePoint.y, round.radius * k, round.drawn === "hidden" ? "hidden" : "outline", { viewId: view.id }));
      }
      if (showCenters && round.visible && round.kind === "round") items.push(...centreMark(round, toSheet, k, view.id));
    }
    if (showCenters) items.push(...axisCentrelines(projection.circles || [], toSheet, k, view.id, showHidden));
    const explodedView = doc.views.find(item => /^iso/.test(item.dir || ""));
    const explodeLeaders = (provider?.explodeLines || []).filter(leader =>
      leader.viewId ? leader.viewId === view.id : view.id === explodedView?.id);
    items.push(...explodeLeaderItems(record,explodeLeaders));
    /* A detail is bounded by the bubble it was called out with — the reader has
       to see that the geometry stops because the callout does. */
    if (projection.crop) {
      const centrePoint = toSheet(projection.crop);
      items.push(circle(centrePoint.x, centrePoint.y, projection.crop.radius * k, "detail", { viewId: view.id }));
    }
    if (view.labelled !== false) {
      const suffix = scaleValue(record.scale) !== scaleValue(layout.sheetScale)
        ? "  (" + scaleLabel(view.scale || record.scale) + ")" : "";
      const label = view.label || defaultViewLabel(view.dir);
      labels.push({ record, caption: (view.configurationName ? label.replace(/(?: copy)+$/, "") : label) + (view.configurationName ? " · " + view.configurationName : "") + suffix });
    }
  }

  /* Section and detail markers live on the PARENT view — the reader has to be
     told where the cut was taken, not just shown the result. */
  for (const view of doc.views) {
    if (view.section && view.parent) items.push(...sectionMarker(view, placements, doc));
    if (view.detail && (view.parent || view.detail.from)) items.push(...detailMarker({...view,parent:view.parent || view.detail.from}, placements));
  }

  const byId = new Map(placements.map((place) => [place.id, place]));
  const dims = new Map();
  for (const dim of doc.dims || []) {
    const place = byId.get(dim.viewId);
    if (!place) continue;
    const basis = place.projection?.basis || viewBasis(place.view.dir);
    const resolved = resolveDim(dim, topologyIndex, basis, place.projection);
    dims.set(dim.id, resolved);
    const measured = Object.assign({}, resolved.dim, { measure: measureDim(resolved.dim) });
    for (const item of dimensionItems(measured, place, doc, {
      selected: options.selectedDim === dim.id, dangling: resolved.dangling,
    })) {
      items.push(Object.assign(item, { dimId: dim.id, viewId: dim.viewId }));
    }
  }
  const notes = new Map();
  const automaticBalloonPositions = new Map();
  for (const place of placements) {
    const targets = (doc.notes || []).filter(note => note.balloon && note.autoBalloon && note.leader?.viewId === place.id)
      .map(note => ({ id: note.id, text:note.text, point: place.toSheet(note.leader) }));
    if (!targets.length) continue;
    const title = titleBlockBox(doc);
    const obstacles = [{ x0: title.x-4, y0: title.y-4, x1: title.x+title.w+4, y1: title.y+title.h+4 }];
    if (bomLayout) obstacles.push({ x0: bomLayout.x, y0: bomLayout.y, x1: bomLayout.x+bomLayout.width, y1: bomLayout.y+bomLayout.height });
    const model = { x0: place.box.x, y0: place.box.y, x1: place.box.x+place.box.w, y1: place.box.y+place.box.h };
    // Leave room for the view caption that follows the lowest annotation.
    const paperBounds = { x0: frame.x0+6, y0: frame.y0+6, x1: frame.x1-6, y1: frame.y1-18-Math.max(title.h,Number(doc.notesBandHeight)||0) };
    for (const [id, point] of layoutBalloonCenters(targets, model, paperBounds, obstacles)) automaticBalloonPositions.set(id, point);
  }
  for (const note of doc.notes || []) {
    const place = note.leader ? byId.get(note.leader.viewId) : null;
    const basis = place ? (place.projection?.basis || viewBasis(place.view.dir)) : null;
    const resolved = resolveNote(note, provider?.callouts, topologyIndex, basis, doc, provider?.properties);
    const automaticPosition = automaticBalloonPositions.get(note.id);
    if (automaticPosition && place) {
      const target = place.toSheet(resolved.note.leader);
      resolved.note = { ...resolved.note, dx: automaticPosition.x-target.x, dy: automaticPosition.y-target.y };
    }
    notes.set(note.id, resolved);
    items.push(...noteItems(resolved.note, byId, doc, { dangling: resolved.dangling }));
  }
  for (const primitive of doc.primitives || []) {
    // A malformed imported annotation cannot break otherwise healthy CAD views.
    try { items.push(...drawingPrimitiveItems(primitive)); }
    catch { diagnostics.push({code:'invalid-drawing-annotation',primitiveId:primitive?.id}); }
  }

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
      if (Number.isFinite(low) && low > bottom && (item.balloon || low < label.record.box.y + label.record.box.h + 60)) bottom = low;
    }
    items.push(text(label.record.x, bottom + 7, label.caption, {
      size: TEXT_SIZES.view, anchor: "middle", weight: "bold", viewLabel: label.record.id,
    }));
  }

  if (options.paper !== false) {
    items.push(...titleBlockItems(doc, provider, layout.sheetScale));
    if (bomLayout) items.push(...bomTableItems(bomLayout));
  }
  return {
    diagnostics,
    paper, frame, items, views: placements, scale: layout.sheetScale,
    projections, primaryId: layout.primaryId, dims, notes, topologyIndex,
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
function axisCentrelines(circles, toSheet, k, viewId, showHidden = false) {
  const groups = new Map();
  for (const round of circles) {
    // Hidden hole rims still define the side-view axis when hidden geometry
    // is displayed. Hide their axis together with that geometry otherwise.
    if (round.kind !== "edge" || (!round.visible && !showHidden)) continue;
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
      const towards = view.section.flip ? 1 : -1;
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

/* A balloon is a circled BOM item number, with a leader dot on its component.
   Automatic offsets are distributed by the shared scene layout above; manually
   placed balloons retain the offsets authored in the sheet. */
function balloonItems(note, byId) {
  const place = note.leader ? byId.get(note.leader.viewId) : null;
  if (!place) return [];
  const target = place.toSheet(note.leader);
  const cx = target.x + num(note.dx, 14), cy = target.y + num(note.dy, -12), radius = balloonRadius(note.text,TEXT_SIZES.dim);
  const dx = target.x - cx, dy = target.y - cy, distance = Math.hypot(dx, dy) || 1;
  const edge = { x: cx + dx / distance * radius, y: cy + dy / distance * radius };
  const dot = [];
  const metadata = { noteId: note.id, viewId: place.id, balloon: true };
  for (let i = 0; i < 8; i++) dot.push({ x: target.x + Math.cos(i * Math.PI / 4) * 0.9, y: target.y + Math.sin(i * Math.PI / 4) * 0.9 });
  return [
    line(edge.x, edge.y, target.x, target.y, "dim", metadata),
    poly(dot, "fill", { fill: LINE_STYLES.dim.color, closed: true, ...metadata }),
    circle(cx, cy, radius, "dim", metadata),
    text(cx, cy + 1.3, note.text, { size: TEXT_SIZES.dim, anchor: "middle", ...metadata, weight: "bold", color: LINE_STYLES.dim.color }),
  ];
}

function noteItems(note, byId, doc, options = {}) {
  if (note.balloon) return balloonItems(note, byId);
  const items = [];
  const x = num(note.x), y = num(note.y);
  /* A callout whose hole is gone reads as the LAST thing that hole was called,
     bracketed and flagged — the same contract a dangling dimension keeps. */
  const style = options.dangling ? "dimLost" : "dim";
  const body = options.dangling ? "⚠ (" + String(note.text || "") + ")" : String(note.text || "");
  const lines = body.split(/\r\n?|\n/);
  const size = Number(note.size)>0 ? Number(note.size) : TEXT_SIZES.dim;
  lines.forEach((row, index) => {
    items.push(text(x, y + index * (size * 1.35), row, {
      size, anchor: "start", noteId: note.id,
      color: LINE_STYLES[style].color,
    }));
  });
  if (note.leader) {
    const place = byId.get(note.leader.viewId);
    if (place) {
      const target = place.toSheet(note.leader);
      const elbow = { x: x - 3, y: y + 1 };
      if (note.leader.rimRadius > 0) {
        const rim = place.toSheet({ u: note.leader.u + note.leader.rimRadius, v: note.leader.v });
        const radius = Math.hypot(rim.x - target.x, rim.y - target.y);
        const dx = elbow.x - target.x, dy = elbow.y - target.y, distance = Math.hypot(dx, dy);
        if (distance > radius) {
          target.x += dx * radius / distance;
          target.y += dy * radius / distance;
        }
      }
      items.push(line(elbow.x, elbow.y, x + 1, elbow.y, style, { noteId: note.id }));
      items.push(line(target.x, target.y, elbow.x, elbow.y, style, { noteId: note.id }));
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

function sheetTextWidth(value, size) {
  return [...String(value || "")].reduce((width, char) => width + (/[MW@]/.test(char) ? .9 : /[ilI1.,:;!|]/.test(char) ? .3 : .58) * size, 0);
}

function sheetTitleLines(value, maxWidth, size) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = ["", ""];
  for (const word of words) {
    const index = lines[0] && sheetTextWidth(lines[0] + " " + word, size) > maxWidth ? 1 : 0;
    const candidate = lines[index] ? lines[index] + " " + word : word;
    if (sheetTextWidth(candidate, size) <= maxWidth) { lines[index] = candidate; continue; }
    let clipped = candidate;
    while (clipped && sheetTextWidth(clipped + "…", size) > maxWidth) clipped = clipped.slice(0, -1);
    lines[index] = clipped + "…";
    break;
  }
  return lines.filter(Boolean);
}

function sheetFieldText(value, maxWidth) {
  let label = String(value || "—");
  for (let size = TEXT_SIZES.meta; size >= 1.8; size -= .1) {
    if (sheetTextWidth(label, size) <= maxWidth) return { label, size };
  }
  while (label && sheetTextWidth(label + "…", 1.8) > maxWidth) label = label.slice(0, -1);
  return { label: label + "…", size: 1.8 };
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

  const field = (x, y, caption, value, maxWidth, options = {}) => {
    const fitted = sheetFieldText(value, maxWidth);
    items.push(text(x, y, caption, { size: TEXT_SIZES.small, color: "#6b7280" }));
    items.push(text(x, y + 4.6, fitted.label, Object.assign({ size: fitted.size, weight: "600" }, options)));
  };
  items.push(text(box.x + 3, box.y + 6.4, meta.company || meta.author || "", { size: TEXT_SIZES.meta, weight: "600", color: "#334155" }));
  items.push(text(box.x + box.w - 3, box.y + 6.4, meta.date || "", { size: TEXT_SIZES.small, anchor: "end", color: "#6b7280" }));
  const title = String(meta.title || "");
  const titleWidth = box.w - 31; // leave the revision and frame clear
  const single = sheetTitleLines(title, titleWidth, TEXT_SIZES.title);
  if (single.length === 1 && !single[0].endsWith("…")) {
    items.push(text(box.x + 3, rowY[0] - 2.4, single[0], { size: TEXT_SIZES.title, weight: "bold" }));
  } else {
    const lines = sheetTitleLines(title, titleWidth, 3.2);
    lines.forEach((line, index) => items.push(text(box.x + 3, box.y + 11.2 + index * 4.2, line, { size: 3.2, weight: "bold" })));
  }

  field(box.x + 3, rowY[0] + 3.4, "MATERIAL", meta.material, box.w * .3 - 6);
  field(box.x + box.w * 0.3, rowY[0] + 3.4, "FINISH", meta.finish, box.w * .28 - 6);
  field(colX + 3, rowY[0] + 3.4, "MASS", meta.mass, box.w * .42 - 6);
  field(box.x + 3, rowY[1] + 3.4, "DRAWN", meta.author, box.w * .29 - 6);
  field(midX + 3, rowY[1] + 3.4, "DWG NO.", meta.number, box.w * .29 - 6);
  field(colX + 3, rowY[1] + 3.4, "SCALE", scaleLabel(sheetScale) + " · " + (doc.units || "mm") + (doc.secondaryUnits ? " ["+doc.secondaryUnits+"]" : ""), box.w * .21 - 6);
  field(thirdX + 3, rowY[1] + 3.4, "SHEET", (meta.sheet || 1) + " / " + (meta.sheets || 1), box.w * .21 - 6);
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

/* Wrap at word boundaries, including long unbroken part numbers. Only unusually
   long cells truncate; their complete document property remains in the tooltip. */
function bomCellLines(value, width, size, maxLines) {
  let remaining = String(value || "—").trim().replace(/\s+/g, " ");
  const lines = [];
  while (remaining && lines.length < maxLines) {
    if (sheetTextWidth(remaining, size) <= width) { lines.push(remaining); remaining = ""; break; }
    let count = remaining.length;
    while (count > 1 && sheetTextWidth(remaining.slice(0, count), size) > width) count--;
    if (lines.length === maxLines - 1) {
      while (count > 0 && sheetTextWidth(remaining.slice(0, count) + "…", size) > width) count--;
      lines.push(remaining.slice(0, count).trimEnd() + "…");
      break;
    }
    const space = remaining.lastIndexOf(" ", count);
    if (space > 0) count = space;
    lines.push(remaining.slice(0, count).trimEnd());
    remaining = remaining.slice(count).trimStart();
  }
  return lines.length ? lines : ["—"];
}

/* One measurement drives view clearance, balloon obstacles and the table itself.
   A maximum of three lines keeps the parts list inside the drawing area. */
function layoutBomTable(doc, rows) {
  const box = titleBlockBox(doc);
  const width = box.w, header = 6, lineHeight = 3.2;
  const frame = sheetFrame(doc);
  const x = frame.x0 + 6, y = frame.y0 + 6;
  const available = Math.max(6, box.y - y - header - 12);
  const maxLines = clamp(Math.floor((available / rows.length - 2) / lineHeight), 1, 3);
  const columns = [0.1, 0.25, 0.3, 0.25, 0.1];
  const measured = rows.map((row, index) => {
    const values = [String(row.item ?? index + 1), row.partNumber || "", row.description || row.name || "", row.material || "", String(row.qty ?? row.quantity ?? 1)];
    const cells = values.map((value, column) => {
      const cellWidth = columns[column] * width - 3;
      let size = TEXT_SIZES.meta, lines = bomCellLines(value, cellWidth, size, maxLines);
      if (lines.at(-1).endsWith("…")) {
        size = TEXT_SIZES.small;
        lines = bomCellLines(value, cellWidth, size, maxLines);
      }
      return {value, size, lines};
    });
    return {cells, height: Math.max(6, 2 + Math.max(...cells.map(cell => cell.lines.length)) * lineHeight)};
  });
  return {x, y, width, header, lineHeight, columns, rows: measured, height: header + measured.reduce((sum, row) => sum + row.height, 0)};
}

/* Reserve a top band for the parts list so it cannot cover a view or caption. */
function bomTableItems(layout) {
  const {x, y, width, height, header, columns, rows, lineHeight} = layout;
  const items = [rect(x, y, width, height, "frame", { fill: "#ffffff" })];
  let cursor = x;
  const edges = columns.map((fraction) => { cursor += fraction * width; return cursor; });
  edges.slice(0, -1).forEach((edge) => items.push(line(edge, y, edge, y + height, "frame")));
  items.push(line(x, y + header, x + width, y + header, "frame"));
  const captions = ["ITEM", "PART NUMBER", "DESCRIPTION", "MATERIAL", "QTY"];
  let left = x;
  captions.forEach((caption, index) => {
    items.push(text(left + 1.5, y + header - 1.6, caption, { size: TEXT_SIZES.small, weight: "600", color: "#6b7280" }));
    left = edges[index];
  });
  let rowTop = y + header;
  rows.forEach((row) => {
    let cell = x;
    row.cells.forEach((fitted, column) => {
      const firstBaseline = rowTop + (row.height - fitted.lines.length * lineHeight) / 2 + 2.8;
      fitted.lines.forEach((label, index) => items.push(text(cell + 1.5, firstBaseline + index * lineHeight, label, { size: fitted.size, fullText: fitted.value })));
      cell = edges[column];
    });
    rowTop += row.height;
    items.push(line(x, rowTop, x + width, rowTop, "thin"));
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
        " 0 " + large + (item.anticlockwise ? ' 0 ' : ' 1 ') + round3(x2) + "," + round3(y2) + '" ' + strokeAttrs(item.style) + "/>");
    } else if (item.type === "poly") {
      if(item.paths) {
        const path=item.paths.map(points=>"M"+points.map(point=>round3(point.x)+","+round3(point.y)).join("L")+"Z").join("");
        parts.push('<path d="'+path+'" fill="'+item.fill+'" stroke="'+item.fill+'" stroke-width="0.035" stroke-linejoin="round"/>');
        continue;
      }
      const points = item.pts.map((point) => round3(point.x) + "," + round3(point.y)).join(" ");
      parts.push("<" + (item.closed ? "polygon" : "polyline") + ' points="' + points + '" ' +
        (item.fill ? 'fill="' + item.fill + '"'+(item.shaded ? ' stroke="'+item.fill+'" stroke-width="0.035" stroke-linejoin="round"' : ' stroke="none"') : strokeAttrs(item.style)) + "/>");
    } else if (item.type === "text") {
      const transform = item.rotate ? ' transform="rotate(' + round3(item.rotate) + " " + round3(item.x) + " " + round3(item.y) + ')"' : "";
      parts.push('<text x="' + round3(item.x) + '" y="' + round3(item.y) + '" font-size="' + round3(item.size) +
        '" text-anchor="' + (ANCHORS[item.anchor] || "start") + '" fill="' + (item.color || "#101418") + '"' +
        (item.baseline==="top"?' dominant-baseline="text-before-edge"':item.baseline==="bottom"?' dominant-baseline="text-after-edge"':"") +
        (item.weight ? ' font-weight="' + item.weight + '"' : "") + transform + ">" +
        (item.fullText && item.fullText !== item.text ? "<title>" + esc(item.fullText) + "</title>" : "") + esc(item.text) + "</text>");
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

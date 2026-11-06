import {normalizeSectionHatch,sectionHatchSegments,sectionHatchCaption} from "./core/section_hatch.js";
import {resolveDimensionTolerance} from "./core/dimension_tolerance.js";
import {sectionRibMasks,excludeRibHatch} from './core/section_rib_hatch.js';
import {coneDraftAngle} from './core/drawing_cone_angle.js';
import { analyzeSectionBoundaries } from "./core/section_boundaries.js";
import { balloonRadius, layoutBalloonCenters } from "./core/balloon_layout.js";
import {drawingPrimitiveItems} from './core/drawing_primitives.js';
import { canCropView, cropDrawingProjection, clipCropEdges } from './core/drawing_crop.js';
import { projectBrokenOutView } from './core/drawing_broken_out.js';
import {resolveAuxiliaryBasis} from './core/drawing_auxiliary.js';
import { derivedParentId, normalizeViewSource, effectiveViewSource, viewSourceOwner, sameDrawingSource } from "./core/drawing_view_source.js";
import {breakSourceViews,canBreakView,breakProjection,breakBoundaryItems,clipBreakEdges,validateAlignedBreak} from './core/drawing_break.js';
import {alternatePositionProjection,alternatePositionItems} from './core/drawing_alternate_position.js';
import {projectAlignedSection,alignedSectionMarkerItems} from './core/drawing_aligned_section.js';
import {drawingImageItem} from './core/drawing_image.js';
import {sheetTitleMeta} from './core/custom_properties.js';
import {resolveComponentBalloon} from './core/assembly_balloon.js';
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
  ORTHO_VIEWS, cropProjection, circleCropArcs, isOrthoView, projectSolid, projectionBounds, sectionBodies, viewBasis,
} from "./core/hidden_line.js";
import {
  addViewToSheet, availableViewDirs, bomTableItems, canRemoveViewFromSheet,
  layoutBomTable, nextSectionTag, removeViewFromSheet, sceneToSvg,
  titleBlockItems, zoneMarks,
} from "./cad_sheet/title.js";
import {
  axisCentrelines, centreMark, detailMarker, noteItems, sectionMarker,
} from "./cad_sheet/markers.js";
import {
  buildSheetScene, chainLoops, createTopologyIndex, dimensionText,
  edgeAngleRefs, explodeLeaderItems, formatLength, hatchLoops, measureDim,
  projectedDimensionBinding, resolveDim, resolveDimAnchor, resolveNote,
  segmentIntersection, sheetDimIssues, topologyAnchors, topologyCrossings,
} from "./cad_sheet/dims.js";
import { createProjector, fitScale, layoutViews } from "./cad_sheet/layout.js";
export { createProjector, fitScale, layoutViews };
export { buildSheetScene, chainLoops, createTopologyIndex, dimensionText, edgeAngleRefs, explodeLeaderItems, formatLength, hatchLoops, measureDim, projectedDimensionBinding, resolveDim, resolveDimAnchor, resolveNote, segmentIntersection, sheetDimIssues, topologyAnchors, topologyCrossings };
export { addViewToSheet, availableViewDirs, canRemoveViewFromSheet, nextSectionTag, removeViewFromSheet, sceneToSvg };
// for js/cad_sheet/title.js (live bindings: it sees every reassignment)
export { ANCHORS, circle, clamp, esc, line, poly, rect, round3, text };
// for js/cad_sheet/markers.js (live bindings: it sees every reassignment)
export { num };
// for js/cad_sheet/dims.js (live bindings: it sees every reassignment)
export {
  ARROW_LENGTH, ARROW_WIDTH, boundsRefs, byCoordinate, nearProjected,
  paperPerModel, trimNumber,
};
// for js/cad_sheet/layout.js (live bindings: it sees every reassignment)
export {
  FLOAT_GAP, LABEL_PAD, clusterMetrics, drawingArea, occupancyBox,
  paperSizeOf, placePrincipalCluster, rectsOverlap, viewScaleOf,
};

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
  [50, 1], [20, 1], [10, 1], [5, 1], [4, 1], [2, 1], [3, 2], [1, 1],
  [1, 2], [1, 2.5], [1, 3], [1, 4], [1, 5], [1, 10], [1, 20], [1, 25], [1, 50], [1, 100], [1, 200], [1, 500],
]);

/* Model units are centimetres everywhere in this app; the sheet is metric
   millimetres unless the title block says otherwise. */
export const UNIT_FACTORS = Object.freeze({ mm: 10, cm: 1, m: 0.01, in: 1 / 2.54 });
export const UNIT_DECIMALS = Object.freeze({ mm: 1, cm: 2, m: 3, in: 3 });

export const LINE_STYLES = Object.freeze({
  outline:  { width: 0.5,  color: "#101418" },
  hidden:   { width: 0.25, color: "#3a4450", dash: [2.4, 1.2] },
  center:   { width: 0.25, color: "#2b3138", dash: [7, 1.6, 1.6, 1.6] },
  phantom:  { width: 0.25, color: "#2b3138", dash: [10, 2, 2, 2, 2, 2] },
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
    ...(Number.isInteger(options.anglePrecision)?{anglePrecision:clamp(options.anglePrecision,0,8)}:{}),
    ...(typeof options.trailingZeros==="boolean"?{trailingZeros:options.trailingZeros}:{}),
    scale: options.scale || "fit",
    showHidden: options.showHidden !== false,
    showCenters: options.showCenters !== false,
    showZones: options.showZones !== false,
    views: [],
    dims: [],
    notes: [],
    primitives: [],
    images: [],
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
    scale: options.scale || null,                          // null = automatic unless explicit sheet mode
    ...(options.scaleMode==='sheet'?{scaleMode:'sheet'}:{}),
    configurationId: options.configurationId || null,      // null = active model configuration
    configurationName: options.configurationName || null,
    assemblyState: typeof options.assemblyState === "string" ? options.assemblyState : null,
    source: normalizeViewSource(options.source),           // null = the document that owns the sheet
    primary: !!options.primary,
    parent: options.parent || null,
    hidden: options.hidden !== undefined ? !!options.hidden : null,
    displayStyle: ["shaded","shadedEdges"].includes(options.displayStyle) ? options.displayStyle : "edges",
    centers: options.centers !== undefined ? !!options.centers : null,
    labelled: options.labelled !== false,
    hatchPattern: normalizeSectionHatch(options.hatchPattern),
    section: options.section || null,                      // {axis, at, from, arrows, tag}
    alignedSection: options.alignedSection || null,         // two radial cut faces unfolded about a common hinge
    detail: options.detail || null,                        // {from, u, v, radius, tag}
    cropSketch: options.cropSketch || null,                // closed spline in projected model coordinates
    brokenOut: options.brokenOut || null,                  // closed spline + depth from projected front envelope
    auxiliary: options.auxiliary || null,                 // persistent principal parent / native edge / planar face
    breakView: options.breakView || null,                  // source interval + printable paper gap
    alternatePosition: options.alternatePosition || null, // associative rigid presentation pose
  };
}

export { normalizeViewSource, effectiveViewSource, viewSourceOwner } from "./core/drawing_view_source.js";

// Persistent topology IDs and model items belong to the sheet's owner.
export function hasHostDimensionReference(dim) {
  return !!(dim?.coneAngle || dim?.modelItem || dim?.edgeRefs?.some(ref => ref?.pid)
    || dim?.refs?.some(ref => ref?.pid || ref?.pid2));
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
    view.hatchPattern = normalizeSectionHatch(view.hatchPattern);
    view.source = normalizeViewSource(view.source);
    view.assemblyState = typeof view.assemblyState === "string" ? view.assemblyState || null : null;
    view.configurationName = view.configurationId
      ? (def.configurations || []).find(cfg => cfg.id === view.configurationId)?.name || null
      : null;
  });
  if (doc.views.length && !doc.views.some((view) => view.primary)) doc.views[0].primary = true;
  doc.dims = Array.isArray(doc.dims) ? doc.dims : [];
  // Earlier source switches marked host topology picks as unverified foreign
  // coordinates. The original persistent IDs still identify the host geometry.
  for (const dim of doc.dims) {
    if (dim?.sourceBinding?.anchors?.length === 0 && hasHostDimensionReference(dim)) delete dim.sourceBinding;
  }
  doc.notes = Array.isArray(doc.notes) ? doc.notes : [];
  doc.primitives = Array.isArray(doc.primitives) ? doc.primitives : [];
  doc.images = Array.isArray(doc.images) ? doc.images : [];
  doc.title = Object.assign({ revision: "A", sheet: 1, sheets: 1 }, doc.title || {});
  if (!doc.title.title && !doc.title.sources?.title) doc.title.title = def.name || "";
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
  if (!view || view.scaleMode==='sheet' || view.primary || isOrthoView(view.dir) || view.section || view.detail) return sheetScale;
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
    left: 0, right: 0, rear: 0, above: 0, below: 0,
    primaryClearance: verticalAnnotationClearance(doc, primary),
    aboveClearance: { top: 0, bottom: 0 }, belowClearance: { top: 0, bottom: 0 },
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
      const band = above ? metrics.aboveClearance : metrics.belowClearance;
      const clearance = verticalAnnotationClearance(doc, view);
      band.top = Math.max(band.top, clearance.top);
      band.bottom = Math.max(band.bottom, clearance.bottom);
    } else if (view.dir === "back") {
      // Rear unfolds beyond the adjacent side; it occupies another column,
      // not the same maximum-width slot as Right/Left.
      metrics.rear = Math.max(metrics.rear,size.w);
    } else if (view.dir === "right" || view.dir === "left") {
      const right = (view.dir === "right") !== first;
      if (right) metrics.right = Math.max(metrics.right, size.w);
      else metrics.left = Math.max(metrics.left, size.w);
    } else metrics.floating.push(view);
  }
  return metrics;
}

const VIEW_GAP = 20;      // millimetres of paper between neighbouring principal views
const FLOAT_GAP = 14;     // between pictorials, sections and details
const LABEL_PAD = TEXT_SIZES.view + 8;  // caption parked under a view

/* Horizontal dimensions use signed paper offsets. Reserve their outward band
   before placing the next aligned view; its caption follows that band. */
function verticalAnnotationClearance(doc, view) {
  let top = 0, bottom = 0;
  for (const dim of doc.dims || []) {
    if (dim.viewId !== view.id || dim.type !== "horizontal" || dim.auto !== "extent") continue;
    const offset = num(dim.offset, 10);
    if (offset < 0) bottom = Math.max(bottom, -offset + 3);
    else top = Math.max(top, offset + 3);
  }
  return { top, bottom: bottom + (view.labelled !== false ? LABEL_PAD : 0) };
}

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
    const rawW = (metrics.left + metrics.right + metrics.rear) * k + primarySize.w;
    const rawH = (metrics.above + metrics.below) * k + primarySize.h;
    const gapsW = (metrics.left ? 1 : 0) + (metrics.right ? 1 : 0) + (metrics.rear ? 1 : 0);
    const gapsH = (metrics.above ? 1 : 0) + (metrics.below ? 1 : 0);
    const availW = area.w - rawW;
    const availH = area.h - rawH;
    const maxGapW = gapsW > 0 ? availW / gapsW : VIEW_GAP;
    const maxGapH = gapsH > 0 ? availH / gapsH : VIEW_GAP;
    gap = Math.max(4, Math.min(VIEW_GAP, maxGapW, maxGapH));
  }
  // Retain legacy best-effort placement for oversized explicitly forced scales
  // without automatic dimensions. Fit and annotated layouts must reserve ink.
  const reserveBands = mustFit || doc.scale === "fit" || (doc.dims || []).some(dim=>dim.auto==="extent");
  const gapAbove = reserveBands ? Math.max(gap, metrics.aboveClearance.bottom + metrics.primaryClearance.top + 4) : gap;
  const gapBelow = reserveBands ? Math.max(gap, metrics.primaryClearance.bottom + metrics.belowClearance.top + 4) : gap;
  const outerTop = reserveBands ? (metrics.above ? metrics.aboveClearance.top : metrics.primaryClearance.top) : 0;
  const outerBottom = reserveBands ? (metrics.below ? metrics.belowClearance.bottom : metrics.primaryClearance.bottom) : 0;
  const spread = {
    left: metrics.left * k + (metrics.left ? gap : 0),
    right: (metrics.right + metrics.rear) * k + (metrics.right ? gap : 0) + (metrics.rear ? gap : 0),
    above: metrics.above * k + (metrics.above ? gapAbove : 0) + outerTop,
    below: metrics.below * k + (metrics.below ? gapBelow : 0) + outerBottom,
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
      y = anchor.y + (above ? -1 : 1) * (primarySize.h / 2 + size.h / 2 + (above ? gapAbove : gapBelow));
      align = "vertical";
    } else if (view.dir === "right" || view.dir === "left") {
      const right = (view.dir === "right") !== first;
      x = anchor.x + (right ? 1 : -1) * (primarySize.w / 2 + size.w / 2 + gap);
      align = "horizontal";
    } else if (view.dir === "back") {
      x = anchor.x + primarySize.w / 2 + (metrics.right ? metrics.right * k + gap : 0) + size.w / 2 + gap;
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

/* ---- projecting a view -------------------------------------------------- */

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

/* ---- hatching ----------------------------------------------------------- */

/* ---- dimensions --------------------------------------------------------- */

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

export const projectToView = (point, basis) => (point && basis ? {
  u: point.x * basis.right.x + point.y * basis.right.y + point.z * basis.right.z,
  v: point.x * basis.up.x + point.y * basis.up.y + point.z * basis.up.z,
} : null);

/* Every crossing of two named edges in one view. A crossing that no topology
   names is deliberately absent: it would have to bind to the triangles, which
   carry no identity at all. Quadratic, so it is capped — beyond that many named
   edges the crossings are unreadable on paper anyway. */
export const MAX_CROSS_EDGES = 240;

const boundsRefs = (type, bounds) => (type === "vertical"
  ? [{ u: bounds.u1, v: bounds.v0 }, { u: bounds.u1, v: bounds.v1 }]
  : [{ u: bounds.u0, v: bounds.v0 }, { u: bounds.u1, v: bounds.v0 }]);

// Foreign views have projected geometry but no host topology. Retain a small
// witness of each picked edge/circle. Only an unchanged geometric snap on the
// same model can justify the stored measurement after a rebuild or reopen.
// Live mesh positions can pass through Float32 while standalone projection uses
// doubles. Allow one float's relative precision and a small absolute floor (cm).
const nearProjected = (a,b) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a-b) <= Math.max(1e-7, Math.max(Math.abs(a),Math.abs(b)) * 2**-23);

/* ---- the scene ---------------------------------------------------------- */

/* ---- frame furniture ---------------------------------------------------- */

/* ---- SVG ---------------------------------------------------------------- */

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));
const round3 = (value) => Math.round(num(value) * 1000) / 1000;

const ANCHORS = { start: "start", middle: "middle", end: "end" };

/* ---- editing helpers ---------------------------------------------------- */


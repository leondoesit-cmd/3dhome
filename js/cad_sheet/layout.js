/* Drawing sheet view packing, placement and scale fitting, split out of
   js/cad_sheet.js. It shares the editor's state through live imports from
   ../cad_sheet.js. */
import { createTopologyIndex } from "../cad_sheet/dims.js";
import { projectAlignedSection } from "../core/drawing_aligned_section.js";
import { alternatePositionProjection } from "../core/drawing_alternate_position.js";
import { resolveAuxiliaryBasis } from "../core/drawing_auxiliary.js";
import { breakProjection, breakSourceViews, canBreakView, validateAlignedBreak } from "../core/drawing_break.js";
import { projectBrokenOutView } from "../core/drawing_broken_out.js";
import { canCropView, cropDrawingProjection } from "../core/drawing_crop.js";
import { derivedParentId, effectiveViewSource, viewSourceOwner } from "../core/drawing_view_source.js";
import { cropProjection, projectSolid, projectionBounds, sectionBodies, viewBasis } from "../core/hidden_line.js";
import { sectionRibMasks } from "../core/section_rib_hatch.js";
import {
  FLOAT_GAP, LABEL_PAD, STANDARD_SCALES, clusterMetrics, drawingArea, num,
  occupancyBox, paperPerModel, paperSizeOf, placePrincipalCluster,
  rectsOverlap, sheetFrame, titleBlockBox, viewScaleOf,
} from "../cad_sheet.js";

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

/* How every view on a sheet is turned into lines, in one place: a plain view is
   projected, a section is cut on its parent's plane and viewed along its
   arrows, a detail is its parent cropped to the callout bubble. The interactive
   sheet and the exporter share this so the printed page cannot disagree with
   the screen. */
export function createProjector(doc, bodies, options = {}) {
  const cache = new Map();
  const resolving = new Set();
  /* A section bakes its hatch pattern into its projection and a Detail of it
     inherits that, so the pattern of the section a view is cut from belongs in
     the key; otherwise a pattern change keeps painting the old hatch. */
  const sectionPatternOf = (view) => {
    const seen = new Set();
    while (view && view.detail && !seen.has(view.id)) { seen.add(view.id); view = (doc.views || []).find((entry) => entry.id === view.detail.from); }
    return view && view.section ? view.hatchPattern || "uniform" : "";
  };
  const project = (view) => {
    if (!view) return null;
    /* A view drawn from another saved model reprojects when that model is
       saved again, which the editor's own rebuild token cannot see. */
    if (!viewSourceOwner(doc, view)) {
      const parentError = "Derived view parent missing or cyclic";
      return { visible: [], hidden: [], bounds: null, parentError, ...(view.alignedSection ? { alignedSectionError: parentError } : {}) };
    }
    const source = effectiveViewSource(doc, view);
    const sectionParent = view.section && doc.views.find(entry => entry.id === derivedParentId(view));
    const sourceKey = source ? source.kind + ':' + source.key : '';
    // A Detail can ask for the same parent in a different display style.
    // Keep those variants together, and drop all of them on a source revision.
    const revision = options.sourceToken?.(view);
    let entry = cache.get(view.id);
    if (!entry || entry.revision !== revision || entry.sourceKey !== sourceKey) {
      entry = {revision, sourceKey, variants:new Map()};
      cache.set(view.id, entry);
    }
    const style = ['shaded','shadedEdges'].includes(view.displayStyle) ? view.displayStyle : 'edges';
    const slot = style + (view.alternatePosition ? ':alternate' : '');
    // Cluster validation is cheap. Its outcome, the effective scale and the
    // Break modifier determine the projection; positions on paper do not.
    let breakError = '';
    if (view.breakView) {
      try {
        if(!canBreakView(view,doc) || (!view.scale && doc.scale==='fit'))throw new Error('Break needs an ordinary orthographic view and a fixed view scale');
        if(breakSourceViews(doc,view).length>1 && !view.breakView.group)throw new Error('This Break predates the projected cluster; reapply it on the principal view');
        validateAlignedBreak(view,doc);
      } catch (error) { breakError = error.message; }
    }
    const key = view.id + "#" + [sectionPatternOf(view), viewSourceOwner(doc, view)?.assemblyState, sectionParent?.id, sectionParent?.dir, view.dir, view.displayStyle, view.configurationId || "", sourceKey, revision, JSON.stringify(view.section || 0), JSON.stringify(view.alignedSection || 0),view.alignedSection?JSON.stringify(doc.views.find(v=>v.id===view.alignedSection.from)||null):'', JSON.stringify(view.detail || 0), JSON.stringify(view.cropSketch || 0),JSON.stringify(view.brokenOut || 0),JSON.stringify(view.breakView || 0),JSON.stringify(view.auxiliary || 0),JSON.stringify(view.alternatePosition || 0),view.breakView ? paperPerModel(view.scale || doc.scale) : '',breakError].join("|");
    const cached = entry.variants.get(slot);
    if (cached?.key === key) return cached.projection;
    // Malformed saved parent graphs must not recurse forever or show unrelated geometry.
    if (resolving.has(view.id)) return null;
    resolving.add(view.id);
    try {
      const projection = buildProjection(view, source, sectionParent, breakError);
      entry.variants.set(slot, {key, projection});
      return projection;
    } finally {
      resolving.delete(view.id);
    }
  };
  function buildProjection(view, source, sectionParent, breakError) {
    const viewBodies = options.bodiesForView?.(view) ?? (source ? [] : bodies);
    const viewOptions={...options,shaded:["shaded","shadedEdges"].includes(view.displayStyle)};
    let projection = null;
    if(view.alignedSection) {
      try {projection=projectAlignedSection(viewBodies,view,doc);}
      catch(error) {projection={visible:[],hidden:[],circles:[],bounds:null,alignedSectionError:error.message};}
    }
    else if(view.auxiliary) {
      try {
        const topology = typeof options.topology === 'function' ? options.topology(view) : options.topology;
        const basis = resolveAuxiliaryBasis(view, doc, createTopologyIndex(source ? [] : topology));
        projection = projectSolid(viewBodies, basis, viewOptions);
      }
      catch {projection=null;}
    }
    else if(view.brokenOut) {
      try { projection=projectBrokenOutView(viewBodies,view,viewOptions); }
      catch { projection=null; }
    }
    else if (view.section) projection = projectSection(sectionParent, view, viewBodies, viewOptions);
    else if (view.detail) {
      const parent = (doc.views || []).find((entry) => entry.id === view.detail.from);
      const base = parent ? project({...parent,displayStyle:view.displayStyle,alternatePosition:null}) : null;
      projection = cropProjection(base, view.detail);
    } else projection = projectSolid(viewBodies, view.dir, viewOptions);
    if(view.cropSketch) {
      // A Detail may subsequently derive from an already cropped parent. The
      // Detail-parent restriction applies to new Crop authoring, not rendering.
      try { projection = canCropView(view,{views:[]}) ? cropDrawingProjection(projection,view.cropSketch) : null; }
      catch { projection = null; } // Invalid persisted boundaries never display uncropped geometry.
    }
    if(view.breakView && projection) {
      try {
        if (breakError) throw new Error(breakError);
        projection=breakProjection({...projection,bounds:projectionBounds(projection)},view.breakView,paperPerModel(view.scale || doc.scale));
      } catch(error) {projection={visible:[],hidden:[],circles:[],bounds:null,breakError:error.message};}
    }
    if(view.alternatePosition && projection) {
      try {
        if (options.isExplodedView?.(view)) throw new Error('Alternate Position requires an assembled view');
        projection=alternatePositionProjection(projection,viewBodies,view);
      }
      catch(error){projection={...projection,alternatePositionError:error.message};}
    }
    return projection;
  }
  return project;
}

function projectSection(parent, view, bodies, options) {
  const basis = viewBasis(parent.dir);
  const along = view.section.axis === "vertical" ? basis.right : basis.up;
  const sight = view.section.flip ? { x: -along.x, y: -along.y, z: -along.z } : along;
  const at = num(view.section.at);
  const origin = { x: along.x * at, y: along.y * at, z: along.z * at };
  /* Everything between the reader and the plane goes: the clip normal is the
     direction the section is viewed FROM, which is the opposite of the arrows. */
  const cut = sectionBodies(bodies, { normal: { x: -sight.x, y: -sight.y, z: -sight.z }, origin });
  const projection=projectSolid(cut.bodies, view.dir, Object.assign({}, options, { cuts: cut.cuts }));
  projection.sectionHatchPattern=view.hatchPattern || 'uniform';
  if(view.section.excludeLongitudinalRibs!==false) {
    const masks=sectionRibMasks(bodies,cut.plane,projection.basis);
    projection.ribHatchMasks=masks.groups;
    projection.ribHatchIssues=masks.issues;
  }
  return projection;
}

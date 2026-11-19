/* The drawing controller's screen mapping, painting and snapping, lifted out of
   createDrawingController, split out of js/modeler_drawing.js. It shares the
   editor's state through live imports from ../modeler_drawing.js. */
import { LINE_STYLES, buildSheetScene, sheetPaper, topologyAnchors, topologyCrossings } from "../cad_sheet.js";
import { modelItemTolerance } from "../core/dimension_tolerance.js";
import { drawingPrimitiveItems } from "../core/drawing_primitives.js";
import { clamp, drawingSnapSegments } from "../modeler_drawing.js";

// lifted out of createDrawingController()
function drawingScreenAndPainting(host, state, useDocument, projectionFor, paintDraft) {
  /* The paint loop asks for the scene on every pointer move, so this runs at
     mouse rate. It used to be JSON.stringify of the whole drawing document —
     affordable only while a dimension was two small numbers. A bound dimension
     carries a persistent id per reference, which are long strings, so the key
     folds the fields the scene actually depends on into one 32-bit digest
     instead of building a document-sized string every frame. */
  function fold(hash, value) {
    if (value === null || value === undefined) return Math.imul(hash ^ 1, 16777619) >>> 0;
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    let out = hash;
    for (let i = 0; i < text.length; i++) out = Math.imul(out ^ text.charCodeAt(i), 16777619) >>> 0;
    return Math.imul(out ^ 0x5f, 16777619) >>> 0;
  }

  function sceneKey(doc) {
    let hash = 2166136261;
    for (const value of [doc.size, doc.orientation, doc.projection, doc.units, doc.draftingStandard, doc.secondaryUnits, doc.secondaryPrecision, doc.precision, doc.trailingZeros, doc.scale,
      doc.showHidden, doc.showCenters, doc.showZones, doc.title,
      host.bodiesToken(), host.model?.()?.name, host.model?.()?.customProperties, host.bom?.(), host.componentBalloons?.(), host.explodeLines?.(), state.selection?.kind, state.selection?.id]) hash = fold(hash, value);
    for (const view of doc.views || []) {
      for (const value of [view.id, view.dir, view.label, view.x, view.y, view.scale, view.primary,
        view.parent, view.hatchPattern, view.scaleMode, view.hidden, view.displayStyle, view.centers, view.labelled, view.exploded, view.section,view.alignedSection, view.detail, view.cropSketch,view.brokenOut,view.breakView,view.auxiliary,view.alternatePosition, view.configurationId, view.configurationName, view.assemblyState, view.source, host.viewSourceToken?.(view)]) hash = fold(hash, value);
    }
    for (const dim of doc.dims || []) {
      if(dim.coneAngle) {
        const source=(host.model?.()?.features || []).find(f=>f.id===dim.coneAngle.featureId);
        hash=fold(hash,[source?.id,source?.suppressed,source?.params?.draftAngle]);
      }
      for (const value of [dim.id, dim.type, dim.viewId, dim.offset, dim.angle, dim.radius,
        dim.text, dim.precision, dim.tolerance, dim.toleranceOverride, dim.coneAngle, modelItemTolerance(host.model?.(),dim.modelItem), dim.reference, dim.auto, dim.sourceBinding]) hash = fold(hash, value);
      for (const ref of dim.refs || []) {
        for (const value of [ref.u, ref.v, ref.pid, ref.pid2, ref.kind, ref.at]) hash = fold(hash, value);
      }
    }
    for (const note of doc.notes || []) {
      for (const value of [note.id, note.text, note.x, note.y, note.size, note.dx, note.dy, note.balloon, note.autoBalloon, note.componentBalloon, note.leader, note.feature, note.modelLink]) hash = fold(hash, value);
    }
    for (const primitive of doc.primitives || []) hash=fold(hash,primitive);
    for (const image of doc.images || []) hash=fold(hash,image);
    return String(hash);
  }

  function scene() {
    const doc = host.doc();
    useDocument(doc);
    const key = sceneKey(doc);
    if (state.scene && state.sceneKey === key) return state.scene;
    state.scene = buildSheetScene(doc, {
      projection: view => projectionFor(view, doc),
      model: host.model?.(),
      topology: host.topology ? host.topology() : null,
      foreignSource: host.viewSourceForeign,
      sourceIssue: host.viewSourceIssue,
      callouts: host.callouts ? host.callouts() : null,
      meta: host.meta ? host.meta() : null,
      properties: host.model?.()?.customProperties || {},
      bom: host.bom ? host.bom() : null,
      componentBalloons:host.componentBalloons?.(),
      explodeLines:host.explodeLines?.(),
      explodeLinesForView:host.explodeLinesForView,
      componentBalloonsForView:host.componentBalloonsForView,
    }, { selectedDim: state.selection?.kind === "dim" ? state.selection.id : null });
    state.sceneKey = key;
    return state.scene;
  }

  /* ---- screen mapping ---------------------------------------------------- */

  const toScreen = (point) => ({ x: point.x * state.zoom + state.ox, y: point.y * state.zoom + state.oy });
  const toSheetMm = (x, y) => ({ x: (x - state.ox) / state.zoom, y: (y - state.oy) / state.zoom });

  function fit() {
    const canvas = host.canvas();
    if (!canvas) return;
    const width = host.width(), height = host.height();
    const paper = sheetPaper(host.doc());
    if (!width || !height) return;
    const bottom = Math.max(0, Math.min(height - 1, Number(host.viewportInsets?.()?.bottom) || 0));
    const usableHeight = height - bottom;
    state.zoom = Math.min(Math.max(1,width - 48) / paper.w, Math.max(1,usableHeight - 48) / paper.h);
    state.ox = (width - paper.w * state.zoom) / 2;
    state.oy = (usableHeight - paper.h * state.zoom) / 2;
    state.fitted = true;
  }

  function zoomBy(factor, cx, cy) {
    const before = toSheetMm(cx, cy);
    state.zoom = clamp(state.zoom * factor, 0.05, 40);
    state.ox = cx - before.x * state.zoom;
    state.oy = cy - before.y * state.zoom;
  }

  /* ---- painting ---------------------------------------------------------- */

  const FONT = '"ISOCPEUR","Helvetica Neue",Arial,sans-serif';

  function strokeStyleFor(c, styleName, extra) {
    const style = LINE_STYLES[styleName] || LINE_STYLES.thin;
    c.strokeStyle = extra?.color || style.color;
    c.lineWidth = Math.max(0.55, style.width * state.zoom * (extra?.boost || 1));
    c.setLineDash((style.dash || []).map((value) => value * state.zoom));
  }

  const imageCache=new Map();
  function paintItem(c, item) {
    if(item.type==='image') {
      let bitmap=imageCache.get(item.dataUrl);
      if(!bitmap){bitmap=new Image();if(imageCache.size>=32)imageCache.delete(imageCache.keys().next().value);imageCache.set(item.dataUrl,bitmap);bitmap.onload=()=>host.refresh();bitmap.src=item.dataUrl;}
      const at=toScreen(item);
      if(bitmap.complete&&bitmap.naturalWidth)c.drawImage(bitmap,at.x,at.y,item.w*state.zoom,item.h*state.zoom);
      return;
    }
    if (item.type === "rect") {
      const a = toScreen({ x: item.x, y: item.y });
      const w = item.w * state.zoom, h = item.h * state.zoom;
      if (item.fill) { c.fillStyle = item.fill; c.fillRect(a.x, a.y, w, h); }
      if (item.style !== "paper") { strokeStyleFor(c, item.style); c.strokeRect(a.x, a.y, w, h); }
      return;
    }
    if (item.type === "line") {
      const a = toScreen({ x: item.x1, y: item.y1 }), b = toScreen({ x: item.x2, y: item.y2 });
      strokeStyleFor(c, item.style);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      return;
    }
    if (item.type === "circle") {
      const centre = toScreen({ x: item.cx, y: item.cy });
      strokeStyleFor(c, item.style);
      c.beginPath(); c.arc(centre.x, centre.y, Math.max(0.4, item.r * state.zoom), 0, Math.PI * 2); c.stroke();
      return;
    }
    if (item.type === "ellipse") {
      const centre=toScreen({x:item.cx,y:item.cy});strokeStyleFor(c,item.style);
      c.beginPath();c.ellipse(centre.x,centre.y,item.rx*state.zoom,item.ry*state.zoom,item.rotation,item.a0,item.a1,!!item.anticlockwise);c.stroke();return;
    }
    if (item.type === "arc") {
      const centre = toScreen({ x: item.cx, y: item.cy });
      strokeStyleFor(c, item.style);
      c.beginPath(); c.arc(centre.x, centre.y, Math.max(0.4, item.r * state.zoom), item.a0, item.a1,!!item.anticlockwise); c.stroke();
      return;
    }
    if (item.type === "poly") {
      c.beginPath();
      for(const points of item.paths || [item.pts]) {
        points.forEach((point, index) => {
          const screen = toScreen(point);
          if (index) c.lineTo(screen.x, screen.y); else c.moveTo(screen.x, screen.y);
        });
        if (item.closed) c.closePath();
      }
      if (item.fill) {
        c.fillStyle = item.fill; c.fill();
        // Cover subpixel antialias seams between adjacent tessellation facets.
        if(item.shaded){c.strokeStyle=item.fill;c.lineWidth=.035*state.zoom;c.setLineDash([]);c.stroke();}
      }
      else { strokeStyleFor(c, item.style); c.stroke(); }
      return;
    }
    if (item.type === "text") {
      const at = toScreen({ x: item.x, y: item.y });
      // Scale text with its paper cell and line spacing, including mobile fit.
      // A screen-pixel minimum makes titles and multiline notes overlap.
      const size = item.size * state.zoom;
      c.save();
      c.translate(at.x, at.y);
      if (item.rotate) c.rotate(item.rotate * Math.PI / 180);
      c.font = (item.weight ? item.weight + " " : "") + size.toFixed(1) + "px " + FONT;
      c.textAlign = item.anchor === "middle" ? "center" : item.anchor === "end" ? "right" : "left";
      c.textBaseline = item.baseline === "top" ? "top" : item.baseline === "bottom" ? "bottom" : "alphabetic";
      if (item.box) {
        /* A dimension value has to stay readable where it crosses the model,
           so it is set on a chip of paper the way a plotter would mask it. */
        const width = c.measureText(item.text).width;
        const left = c.textAlign === "center" ? -width / 2 : c.textAlign === "right" ? -width : 0;
        c.fillStyle = "rgba(255,255,255,.92)";
        c.fillRect(left - size * 0.18, -size * (c.textBaseline === "top" ? 0 : c.textBaseline === "bottom" ? 1 : 0.82), width + size * 0.36, size * 1.02);
      }
      c.fillStyle = item.color || "#101418";
      c.fillText(item.text, 0, 0);
      c.restore();
      return;
    }
  }

  function render(c, width, height) {
    if (!state.fitted) fit();
    const doc = host.doc();
    const built = scene();
    const paper = built.paper;
    c.save();
    c.fillStyle = "#e6e9ee";
    c.fillRect(0, 0, width, height);
    const origin = toScreen({ x: 0, y: 0 });
    const pw = paper.w * state.zoom, ph = paper.h * state.zoom;
    c.fillStyle = "rgba(20,26,33,.18)";
    c.fillRect(origin.x + 5, origin.y + 6, pw, ph);
    c.fillStyle = "#ffffff";
    c.fillRect(origin.x, origin.y, pw, ph);
    c.save();
    c.beginPath(); c.rect(origin.x, origin.y, pw, ph); c.clip();
    c.lineCap = "butt";
    for (const item of built.items) paintItem(c, item);
    c.setLineDash([]);
    paintOverlays(c, built, doc);
    c.restore();
    c.setLineDash([]);
    c.strokeStyle = "rgba(16,20,24,.35)";
    c.lineWidth = 1;
    c.strokeRect(origin.x - .5, origin.y - .5, pw + 1, ph + 1);
    c.restore();
  }

  /* Everything that belongs to the drafting table rather than the drawing:
     selection, the view a tool is about to act on, snap markers, previews. */
  function paintOverlays(c, built, doc) {
    c.setLineDash([]);
    const selectedPrimitive = doc.primitives.find(p => state.selection?.kind === "primitive" && p.id === state.selection.id);
    if (selectedPrimitive) {
      try { for (const item of drawingPrimitiveItems(selectedPrimitive)) paintItem(c, {...item,style:'highlight'}); } catch { /* Renderer reports malformed annotations. */ }
    }
    for (const place of built.views) {
      const selected = state.selection?.kind === "view" && state.selection.id === place.id;
      const hovered = state.hover?.kind === "view" && state.hover.id === place.id;
      if (!selected && !hovered) continue;
      const a = toScreen({ x: place.box.x - 3, y: place.box.y - 3 });
      const w = (place.box.w + 6) * state.zoom, h = (place.box.h + 6) * state.zoom;
      c.strokeStyle = selected ? "#e08030" : "rgba(90,122,154,.55)";
      c.lineWidth = selected ? 1.6 : 1;
      c.setLineDash(selected ? [] : [5, 4]);
      c.strokeRect(a.x, a.y, w, h);
      if (selected) {
        c.fillStyle = "#e08030";
        for (const corner of [[a.x, a.y], [a.x + w, a.y], [a.x, a.y + h], [a.x + w, a.y + h]]) {
          c.fillRect(corner[0] - 3, corner[1] - 3, 6, 6);
        }
        /* The projection line a dragged view is locked to, so it is obvious
           WHY the view refuses to move the other way. */
        if (place.align) {
          c.strokeStyle = "rgba(224,128,48,.45)";
          c.setLineDash([9, 5]);
          c.beginPath();
          if (place.align === "vertical") {
            const x = toScreen({ x: place.x, y: 0 }).x;
            c.moveTo(x, toScreen({ x: 0, y: built.frame.y0 }).y);
            c.lineTo(x, toScreen({ x: 0, y: built.frame.y1 }).y);
          } else {
            const y = toScreen({ x: 0, y: place.y }).y;
            c.moveTo(toScreen({ x: built.frame.x0, y: 0 }).x, y);
            c.lineTo(toScreen({ x: built.frame.x1, y: 0 }).x, y);
          }
          c.stroke();
        }
      }
      c.setLineDash([]);
    }
    if (state.selection?.kind === "dim") {
      const dim = (doc.dims || []).find((entry) => entry.id === state.selection.id);
      if (dim) {
        for (const item of built.items) {
          if (item.dimId !== dim.id || item.type !== "line") continue;
          const a = toScreen({ x: item.x1, y: item.y1 }), b = toScreen({ x: item.x2, y: item.y2 });
          c.strokeStyle = "rgba(224,128,48,.85)";
          c.lineWidth = 3;
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        }
      }
    }
    paintDraft(c, built);
    if (state.snap) {
      const at = toScreen(state.snap.sheet);
      c.strokeStyle = "#0f8a6a"; c.lineWidth = 1.6;
      c.beginPath(); c.arc(at.x, at.y, 6, 0, Math.PI * 2); c.stroke();
      if (state.snap.kind === "end") { c.strokeRect(at.x - 4, at.y - 4, 8, 8); }
      else if (state.snap.kind === "mid") {
        c.beginPath(); c.moveTo(at.x - 5, at.y + 4); c.lineTo(at.x, at.y - 5); c.lineTo(at.x + 5, at.y + 4); c.closePath(); c.stroke();
      } else if (state.snap.kind === "cross") {
        c.beginPath();
        c.moveTo(at.x - 5, at.y - 5); c.lineTo(at.x + 5, at.y + 5);
        c.moveTo(at.x + 5, at.y - 5); c.lineTo(at.x - 5, at.y + 5);
        c.stroke();
      } else if (state.snap.kind === "centre") {
        c.beginPath(); c.moveTo(at.x - 7, at.y); c.lineTo(at.x + 7, at.y); c.moveTo(at.x, at.y - 7); c.lineTo(at.x, at.y + 7); c.stroke();
      }
    }
  }
  return { scene, toScreen, toSheetMm, fit, zoomBy, FONT, paintItem, render };
}

// lifted out of createDrawingController()
function drawingSnapping(host, scene) {
  /* Every point a dimension is allowed to start from: line ends, line middles,
     circle centres and quadrants. A drawing dimension that lands "near" an edge
     is not a dimension, it is a guess. */
  function snapPoints(place) {
    if (place._snaps) return place._snaps;
    const points = [];
    const projection = place.projection;
    const push = (u, v, kind) => points.push({ u, v, kind });
    for (const segment of drawingSnapSegments(place, host.doc())) {
      push(segment.a.u, segment.a.v, "end");
      push(segment.b.u, segment.b.v, "end");
      push((segment.a.u + segment.b.u) / 2, (segment.a.v + segment.b.v) / 2, "mid");
    }
    for (const round of projection?.circles || []) {
      if (round.kind !== "round") continue;
      push(round.u, round.v, "centre");
      push(round.u + round.radius, round.v, "quad");
      push(round.u - round.radius, round.v, "quad");
      push(round.u, round.v + round.radius, "quad");
      push(round.u, round.v - round.radius, "quad");
    }
    /* Intersections come from the NAMED edges rather than from these projected
       segments: a crossing has two parents, and only the topology can say which
       two. A crossing of lines nobody named is therefore not offered — see
       topologyCrossings. Its identity travels on the snap point itself, because
       unlike every other snap it cannot be recovered by looking up one id. */
    const index = host.canUseTopologyForView?.(place.view) === false ? null : scene().topologyIndex, basis = projection?.basis;
    if (index && basis && !projection?.nonlinearProjection) {
      for (const cross of topologyCrossings(index, basis)) {
        points.push({ u: cross.u, v: cross.v, kind: "cross", pid: cross.pid, pid2: cross.pid2, at: cross.at });
      }
    }
    place._snaps = points.filter(p=>!projection?.breakMap || projection.breakMap.retained(p));
    return place._snaps;
  }

  /* What a picked point IS, in the model. The snap set comes from the projected
     triangles, which carry no identity; the named anchors come from topology.
     A pick binds only when it lands on a named anchor to within a fraction of a
     pen width — this is identifying what was clicked, not guessing later. An
     unnamed pick still places a dimension, it just places a frozen one. */
  function bindAnchor(place, point) {
    if(host.canUseTopologyForView?.(place.view)===false)return null;
    const index = scene().topologyIndex;
    const basis = place.projection?.basis;
    if (!index || !basis || place.projection?.nonlinearProjection) return null;
    if (!place._anchors) place._anchors = topologyAnchors(index, basis);
    /* Coincidence, not proximity: a fraction of a percent of the view. Wide
       enough that a tessellated rim's fitted centre still counts as the rim it
       came from, far too tight to reach a different feature. */
    const tolerance = Math.max(1e-6, (place.box.w + place.box.h) / place.k * 2e-3);
    let best = null, distance = Infinity;
    for (const anchor of place._anchors) {
      // Concentric rims share a centre but are different features. A circular
      // pick must retain its radius when resolving an associative reference.
      if (point.radius > 0 && (anchor.at !== "centre" || Math.abs(anchor.radius - point.radius) > tolerance)) continue;
      const gap = Math.hypot(anchor.u - point.u, anchor.v - point.v);
      if (gap < distance && gap <= tolerance) { best = anchor; distance = gap; }
    }
    return best ? { u: best.u, v: best.v, pid: best.pid, kind: best.kind, at: best.at } : null;
  }

  /* An intersection already knows what it is: it carried both parent ids from
     the snap set, because no single-id lookup could recover them. */
  const dimRef = (place, point) => (point.kind === "cross"
    ? { u: point.u, v: point.v, pid: point.pid, pid2: point.pid2, kind: "cross", at: "x" }
    : bindAnchor(place, point) || { u: point.u, v: point.v });
  return { snapPoints, bindAnchor, dimRef };
}

export { drawingScreenAndPainting, drawingSnapping };

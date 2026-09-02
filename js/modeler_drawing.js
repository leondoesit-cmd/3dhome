/* Drawing mode: the sheet you can work on.
 *
 * cad_sheet.js decides what a sheet contains and core/hidden_line.js decides
 * what each view looks like; this file is the drafting table — paper on screen,
 * pan and zoom, views you drag (on their projection lines, never off them),
 * dimensions you place by picking two points and dropping the line, section and
 * detail views taken by swiping across a parent, notes with leaders, and the
 * printable page that comes out the other end.
 *
 * It owns no editor state of its own beyond the drafting table (what is
 * selected, where the paper sits, which tool is armed). The drawing itself
 * lives in def.drawing, so it saves and undoes with the model.
 */

import {
  LINE_STYLES, SHEET_SIZES, STANDARD_SCALES,
  addViewToSheet, availableViewDirs, buildSheetScene, createProjector, defaultViewLabel,
  dimensionText, measureDim, nextSectionTag, removeViewFromSheet,
  scaleLabel, scaleValue, sceneToSvg, sheetPaper,
} from "./cad_sheet.js";
import { isOrthoView, viewBasis, viewForSight } from "./core/hidden_line.js";

export const DRAWING_TOOLS = ["select", "dim", "diam", "note", "section", "detail"];

/* null is "the layout has not placed this yet", and Number(null) is 0 — which is
   a real coordinate on the sheet, and the reason a dragged view used to jump to
   the paper's top-left corner on the first pixel of movement. */
const num = (value, fallback = 0) =>
  (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? fallback : Number(value));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/* One drafting table per editor. `host` is the only way this module reaches the
   document, the model's triangles or the UI — nothing here imports the editor. */
export function createDrawingController(host) {
  const state = {
    zoom: 1, ox: 0, oy: 0, fitted: false,
    tool: "select",
    selection: null,          // {kind:"view"|"dim"|"note", id}
    hover: null,
    drag: null,
    draft: null,              // an in-progress dimension / section / detail
    cursor: null,             // {x, y} in sheet mm
    snap: null,
    scene: null,
    sceneKey: "",
  };
  let projector = null;
  let projectionToken = -1;

  /* ---- geometry ---------------------------------------------------------- */

  /* Projections are expensive and the sheet is repainted on every pointer move,
     so they are cached until the model itself rebuilds — the token is the
     editor's promise that the triangles have not changed underneath us. */
  function projectionFor(view) {
    const token = host.bodiesToken();
    if (token !== projectionToken || !projector) {
      projectionToken = token;
      projector = createProjector(host.doc(), host.bodies() || []);
    }
    return projector(view);
  }

  function invalidate() { projector = null; projectionToken = -1; state.scene = null; }

  /* ---- the scene --------------------------------------------------------- */

  function scene() {
    const doc = host.doc();
    const key = JSON.stringify({
      d: doc, token: host.bodiesToken(), sel: state.selection,
    });
    if (state.scene && state.sceneKey === key) return state.scene;
    state.scene = buildSheetScene(doc, {
      projection: projectionFor,
      meta: host.meta ? host.meta() : null,
      bom: host.bom ? host.bom() : null,
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
    state.zoom = Math.min((width - 48) / paper.w, (height - 48) / paper.h);
    state.ox = (width - paper.w * state.zoom) / 2;
    state.oy = (height - paper.h * state.zoom) / 2;
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

  function paintItem(c, item) {
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
    if (item.type === "arc") {
      const centre = toScreen({ x: item.cx, y: item.cy });
      strokeStyleFor(c, item.style);
      c.beginPath(); c.arc(centre.x, centre.y, Math.max(0.4, item.r * state.zoom), item.a0, item.a1); c.stroke();
      return;
    }
    if (item.type === "poly") {
      c.beginPath();
      item.pts.forEach((point, index) => {
        const screen = toScreen(point);
        if (index) c.lineTo(screen.x, screen.y); else c.moveTo(screen.x, screen.y);
      });
      if (item.closed) c.closePath();
      if (item.fill) { c.fillStyle = item.fill; c.fill(); }
      else { strokeStyleFor(c, item.style); c.stroke(); }
      return;
    }
    if (item.type === "text") {
      const at = toScreen({ x: item.x, y: item.y });
      const size = Math.max(4, item.size * state.zoom);
      c.save();
      c.translate(at.x, at.y);
      if (item.rotate) c.rotate(item.rotate * Math.PI / 180);
      c.font = (item.weight ? item.weight + " " : "") + size.toFixed(1) + "px " + FONT;
      c.textAlign = item.anchor === "middle" ? "center" : item.anchor === "end" ? "right" : "left";
      c.textBaseline = item.baseline === "bottom" ? "bottom" : "alphabetic";
      if (item.box) {
        /* A dimension value has to stay readable where it crosses the model,
           so it is set on a chip of paper the way a plotter would mask it. */
        const width = c.measureText(item.text).width;
        const left = c.textAlign === "center" ? -width / 2 : c.textAlign === "right" ? -width : 0;
        c.fillStyle = "rgba(255,255,255,.92)";
        c.fillRect(left - size * 0.18, -size * (c.textBaseline === "bottom" ? 1 : 0.82), width + size * 0.36, size * 1.02);
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
      } else if (state.snap.kind === "centre") {
        c.beginPath(); c.moveTo(at.x - 7, at.y); c.lineTo(at.x + 7, at.y); c.moveTo(at.x, at.y - 7); c.lineTo(at.x, at.y + 7); c.stroke();
      }
    }
  }

  function paintDraft(c, built) {
    const draft = state.draft;
    if (!draft || !state.cursor) return;
    const place = built.views.find((entry) => entry.id === draft.viewId);
    c.setLineDash([5, 4]);
    c.strokeStyle = "#e08030";
    c.lineWidth = 1.4;
    if (draft.kind === "dim" && place) {
      const points = draft.refs.map((ref) => toScreen(place.toSheet(ref)));
      c.beginPath();
      points.forEach((point, index) => { if (index) c.lineTo(point.x, point.y); else c.moveTo(point.x, point.y); });
      if (draft.refs.length === 1 && state.cursor) {
        const cursor = toScreen(state.cursor);
        c.lineTo(cursor.x, cursor.y);
      }
      c.stroke();
      points.forEach((point) => { c.fillStyle = "#e08030"; c.fillRect(point.x - 3, point.y - 3, 6, 6); });
      if (draft.refs.length === 2) {
        const preview = previewDim(draft, place);
        if (preview) {
          const text = dimensionText(Object.assign({}, preview, { measure: measureDim(preview) }), host.doc());
          const at = toScreen(state.cursor);
          c.font = "600 12px " + FONT;
          c.fillStyle = "#e08030";
          c.fillText(text, at.x + 10, at.y - 8);
        }
      }
    } else if (draft.kind === "section" && place) {
      const start = toScreen(draft.start), cursor = toScreen(state.cursor);
      c.strokeStyle = "#8a2f2f";
      c.beginPath();
      if (Math.abs(cursor.x - start.x) > Math.abs(cursor.y - start.y)) {
        c.moveTo(toScreen({ x: place.box.x - 6, y: 0 }).x, start.y);
        c.lineTo(toScreen({ x: place.box.x + place.box.w + 6, y: 0 }).x, start.y);
      } else {
        c.moveTo(start.x, toScreen({ x: 0, y: place.box.y - 6 }).y);
        c.lineTo(start.x, toScreen({ x: 0, y: place.box.y + place.box.h + 6 }).y);
      }
      c.stroke();
    } else if (draft.kind === "detail" && place) {
      const centre = toScreen(draft.centre), cursor = toScreen(state.cursor);
      c.strokeStyle = "#8a2f2f";
      c.beginPath();
      c.arc(centre.x, centre.y, Math.hypot(cursor.x - centre.x, cursor.y - centre.y), 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash([]);
  }

  /* ---- snapping ---------------------------------------------------------- */

  /* Every point a dimension is allowed to start from: line ends, line middles,
     circle centres and quadrants. A drawing dimension that lands "near" an edge
     is not a dimension, it is a guess. */
  function snapPoints(place) {
    if (place._snaps) return place._snaps;
    const points = [];
    const projection = place.projection;
    const push = (u, v, kind) => points.push({ u, v, kind });
    for (const segment of projection?.visible || []) {
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
    place._snaps = points;
    return points;
  }

  function snapAt(sheetPoint) {
    const built = scene();
    const reach = 9 / state.zoom;              // millimetres of paper under 9px
    let best = null;
    for (const place of built.views) {
      if (!pointNearBox(sheetPoint, place.box, 8)) continue;
      for (const point of snapPoints(place)) {
        const at = place.toSheet(point);
        const distance = Math.hypot(at.x - sheetPoint.x, at.y - sheetPoint.y);
        if (distance > reach) continue;
        const rank = point.kind === "end" ? 0 : point.kind === "centre" ? 1 : point.kind === "quad" ? 2 : 3;
        if (!best || distance + rank * 0.3 < best.distance + best.rank * 0.3) {
          best = { distance, rank, kind: point.kind, model: point, sheet: at, viewId: place.id, place };
        }
      }
    }
    return best;
  }

  const pointNearBox = (point, box, pad = 0) =>
    point.x >= box.x - pad && point.x <= box.x + box.w + pad &&
    point.y >= box.y - pad && point.y <= box.y + box.h + pad;

  /* ---- hit testing ------------------------------------------------------- */

  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, length = dx * dx + dy * dy;
    const t = length ? clamp(((px - x1) * dx + (py - y1) * dy) / length, 0, 1) : 0;
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  function hitTest(sheetPoint) {
    const built = scene();
    const reach = 4 / state.zoom;
    for (const item of built.items) {
      if (!item.dimId && !item.noteId) continue;
      let hit = false;
      if (item.type === "line") hit = distanceToSegment(sheetPoint.x, sheetPoint.y, item.x1, item.y1, item.x2, item.y2) < reach;
      else if (item.type === "text") {
        const width = item.text.length * item.size * 0.62, height = item.size * 1.2;
        const left = item.anchor === "middle" ? item.x - width / 2 : item.anchor === "end" ? item.x - width : item.x;
        hit = sheetPoint.x >= left - 1 && sheetPoint.x <= left + width + 1 &&
          sheetPoint.y >= item.y - height && sheetPoint.y <= item.y + height * 0.35;
      } else if (item.type === "circle" || item.type === "arc") {
        hit = Math.abs(Math.hypot(sheetPoint.x - item.cx, sheetPoint.y - item.cy) - item.r) < reach;
      }
      if (hit) return item.dimId ? { kind: "dim", id: item.dimId } : { kind: "note", id: item.noteId };
    }
    /* Views are picked last: a dimension drawn across one must stay reachable. */
    for (let index = built.views.length - 1; index >= 0; index--) {
      const place = built.views[index];
      if (pointNearBox(sheetPoint, place.box, 3)) return { kind: "view", id: place.id };
    }
    return null;
  }

  /* ---- tools ------------------------------------------------------------- */

  function setTool(id) {
    state.tool = DRAWING_TOOLS.includes(id) ? id : "select";
    state.draft = null;
    state.snap = null;
    host.refresh();
  }

  function previewDim(draft, place) {
    const cursor = state.cursor;
    if (!cursor || draft.refs.length < 2) return null;
    const a = place.toSheet(draft.refs[0]), b = place.toSheet(draft.refs[1]);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = Math.abs(cursor.x - mid.x), dy = Math.abs(cursor.y - mid.y);
    const type = draft.aligned ? "aligned" : dy >= dx ? "horizontal" : "vertical";
    const offset = type === "horizontal" ? mid.y - cursor.y
      : type === "vertical" ? cursor.x - mid.x
        : signedOffset(a, b, cursor);
    return { type, refs: draft.refs.slice(), viewId: draft.viewId, offset };
  }

  function signedOffset(a, b, cursor) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    return (cursor.x - a.x) * normal.x + (cursor.y - a.y) * normal.y;
  }

  function commitDim(dim) {
    const doc = host.doc();
    host.pushUndo(host.t("opAddDim"));
    doc.dims.push(Object.assign({ id: "d" + Math.random().toString(36).slice(2, 9) }, dim));
    state.draft = null;
    state.selection = { kind: "dim", id: doc.dims[doc.dims.length - 1].id };
    host.markDirty();
  }

  /* ---- pointer ----------------------------------------------------------- */

  function pointerDown(event, x, y) {
    const sheetPoint = toSheetMm(x, y);
    state.cursor = sheetPoint;
    const panning = event.button === 1 || event.button === 2 || event.altKey || event.spaceKey;
    if (panning) {
      state.drag = { mode: "pan", x, y, ox: state.ox, oy: state.oy };
      return true;
    }
    if (state.tool === "dim" || state.tool === "diam") {
      const snap = snapAt(sheetPoint);
      if (state.tool === "diam") {
        const round = circleAt(sheetPoint);
        if (round) {
          commitDim({
            type: round.circle.kind === "round" ? "diameter" : "radius",
            viewId: round.viewId, refs: [{ u: round.circle.u, v: round.circle.v }],
            radius: round.circle.radius, offset: 9, angle: -Math.PI / 4,
          });
          return true;
        }
        host.flash(host.t("drawPickCircle"));
        return true;
      }
      /* Pick, pick, place — the third click is where the dimension line lands,
         so a value never has to be dragged out of the geometry afterwards. */
      if (state.draft?.kind === "dim" && state.draft.refs.length === 2) {
        const built = scene();
        const place = built.views.find((entry) => entry.id === state.draft.viewId);
        const preview = place ? previewDim(state.draft, place) : null;
        if (preview) commitDim(preview);
        else state.draft = null;
        host.refresh();
        return true;
      }
      if (!snap) { host.flash(host.t("drawSnapNone")); return true; }
      if (!state.draft || state.draft.kind !== "dim" || state.draft.viewId !== snap.viewId) {
        state.draft = { kind: "dim", viewId: snap.viewId, refs: [{ u: snap.model.u, v: snap.model.v }], aligned: event.shiftKey };
      } else {
        state.draft.refs.push({ u: snap.model.u, v: snap.model.v });
        state.draft.aligned = event.shiftKey;
      }
      host.refresh();
      return true;
    }
    if (state.tool === "note") {
      const snap = snapAt(sheetPoint);
      state.draft = { kind: "note", viewId: snap?.viewId || null, anchor: snap ? { u: snap.model.u, v: snap.model.v } : null, at: sheetPoint };
      placeNote(state.draft);
      return true;
    }
    if (state.tool === "section" || state.tool === "detail") {
      const hit = hitTest(sheetPoint);
      const built = scene();
      const place = built.views.find((entry) => entry.id === (hit?.kind === "view" ? hit.id : null));
      if (!place || !isOrthoView(place.view.dir) || place.view.detail) {
        host.flash(host.t("drawPickParent"));
        return true;
      }
      state.draft = state.tool === "section"
        ? { kind: "section", viewId: place.id, start: sheetPoint, flip: event.shiftKey }
        : { kind: "detail", viewId: place.id, centre: sheetPoint };
      state.drag = { mode: "draft", x, y };
      return true;
    }
    // select
    const hit = hitTest(sheetPoint);
    state.selection = hit;
    if (hit?.kind === "view") {
      const doc = host.doc();
      const view = doc.views.find((entry) => entry.id === hit.id);
      const built = scene();
      const place = built.views.find((entry) => entry.id === hit.id);
      state.drag = {
        mode: "view", id: hit.id, x, y,
        startX: num(view.x, place.x), startY: num(view.y, place.y), align: place.align,
      };
    } else if (hit?.kind === "dim") {
      const dim = host.doc().dims.find((entry) => entry.id === hit.id);
      state.drag = { mode: "dim", id: hit.id, x, y, offset: num(dim.offset, 10), angle: num(dim.angle, -Math.PI / 4) };
    } else if (hit?.kind === "note") {
      const note = host.doc().notes.find((entry) => entry.id === hit.id);
      state.drag = { mode: "note", id: hit.id, x, y, startX: num(note.x), startY: num(note.y) };
    } else {
      state.drag = { mode: "pan", x, y, ox: state.ox, oy: state.oy };
    }
    host.refresh();
    return true;
  }

  function circleAt(sheetPoint) {
    const built = scene();
    const reach = 6 / state.zoom;
    for (const place of built.views) {
      if (!pointNearBox(sheetPoint, place.box, 6)) continue;
      for (const round of place.projection?.circles || []) {
        if (round.kind !== "round") continue;
        const centre = place.toSheet(round);
        const distance = Math.hypot(sheetPoint.x - centre.x, sheetPoint.y - centre.y);
        const radius = round.radius * place.k;
        if (Math.abs(distance - radius) < reach || distance < Math.min(radius, reach * 2)) {
          return { viewId: place.id, circle: round, place };
        }
      }
    }
    return null;
  }

  function pointerMove(event, x, y) {
    const sheetPoint = toSheetMm(x, y);
    state.cursor = sheetPoint;
    if (state.drag?.mode === "pan") {
      state.ox = state.drag.ox + (x - state.drag.x);
      state.oy = state.drag.oy + (y - state.drag.y);
      host.refresh();
      return true;
    }
    if (state.drag?.mode === "view") {
      const doc = host.doc();
      const view = doc.views.find((entry) => entry.id === state.drag.id);
      if (view) {
        const dx = (x - state.drag.x) / state.zoom, dy = (y - state.drag.y) / state.zoom;
        if (state.drag.align !== "vertical") view.x = state.drag.startX + dx;
        if (state.drag.align !== "horizontal") view.y = state.drag.startY + dy;
        state.scene = null;
        host.refresh();
      }
      return true;
    }
    if (state.drag?.mode === "dim") {
      const dim = host.doc().dims.find((entry) => entry.id === state.drag.id);
      const built = scene();
      const place = built.views.find((entry) => entry.id === dim?.viewId);
      if (dim && place) {
        if (dim.type === "radius" || dim.type === "diameter") {
          const centre = place.toSheet(dim.refs[0]);
          dim.angle = Math.atan2(sheetPoint.y - centre.y, sheetPoint.x - centre.x);
          dim.offset = Math.max(3, Math.hypot(sheetPoint.x - centre.x, sheetPoint.y - centre.y) - dim.radius * place.k);
        } else {
          const a = place.toSheet(dim.refs[0]), b = place.toSheet(dim.refs[1]);
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          dim.offset = dim.type === "horizontal" ? mid.y - sheetPoint.y
            : dim.type === "vertical" ? sheetPoint.x - mid.x
              : signedOffset(a, b, sheetPoint);
        }
        state.scene = null;
        host.refresh();
      }
      return true;
    }
    if (state.drag?.mode === "note") {
      const note = host.doc().notes.find((entry) => entry.id === state.drag.id);
      if (note) {
        note.x = state.drag.startX + (x - state.drag.x) / state.zoom;
        note.y = state.drag.startY + (y - state.drag.y) / state.zoom;
        state.scene = null;
        host.refresh();
      }
      return true;
    }
    if (state.tool === "dim") state.snap = snapAt(sheetPoint);
    else if (state.tool !== "select") state.snap = null;
    else state.hover = hitTest(sheetPoint);
    host.refresh();
    return true;
  }

  function pointerUp(event, x, y) {
    const drag = state.drag;
    state.drag = null;
    if (drag?.mode === "draft" && state.draft) {
      const sheetPoint = toSheetMm(x, y);
      if (state.draft.kind === "section") finishSection(state.draft, sheetPoint);
      else if (state.draft.kind === "detail") finishDetail(state.draft, sheetPoint);
      state.draft = null;
      host.refresh();
      return true;
    }
    if (drag?.mode === "view" || drag?.mode === "dim" || drag?.mode === "note") {
      if (Math.hypot(x - drag.x, y - drag.y) > 2) host.markDirty();
      return true;
    }
    host.refresh();
    return true;
  }

  function doubleClick(event, x, y) {
    const sheetPoint = toSheetMm(x, y);
    const hit = hitTest(sheetPoint);
    if (hit?.kind === "dim") { editDim(hit.id); return true; }
    if (hit?.kind === "note") { editNote(hit.id); return true; }
    const built = scene();
    const title = built.items.find((item) => item.type === "rect" && item.style === "frame");
    if (title && sheetPoint.x >= title.x && sheetPoint.x <= title.x + title.w &&
        sheetPoint.y >= title.y && sheetPoint.y <= title.y + title.h) {
      host.editTitleBlock();
      return true;
    }
    return false;
  }

  function wheel(event, x, y) {
    const factor = Math.pow(1.0016, -event.deltaY);
    zoomBy(factor, x, y);
    host.refresh();
  }

  /* ---- commands ---------------------------------------------------------- */

  function finishSection(draft, endPoint) {
    const built = scene();
    const place = built.views.find((entry) => entry.id === draft.viewId);
    if (!place) return;
    const doc = host.doc();
    const horizontal = Math.abs(endPoint.x - draft.start.x) > Math.abs(endPoint.y - draft.start.y);
    const model = place.toModel(draft.start);
    const axis = horizontal ? "horizontal" : "vertical";
    const at = horizontal ? model.v : model.u;
    const basis = viewBasis(place.view.dir);
    const along = axis === "vertical" ? basis.right : basis.up;
    /* The arrows point the way the reader looks, and the drag says nothing
       about that — it only draws the line. So the convention picks: a vertical
       cut is looked at from the left (arrows point right), a horizontal one
       from above (arrows point down), and Shift while cutting reverses it. */
    const flip = axis === "vertical" ? !!draft.flip : !draft.flip;
    const sight = flip ? { x: -along.x, y: -along.y, z: -along.z } : along;
    const tag = nextSectionTag(doc);
    host.pushUndo(host.t("opAddView"));
    const view = addViewToSheet(doc, viewForSight(sight), {
      label: "SECTION " + tag + "-" + tag,
      parent: place.id,
      section: { axis, at, from: place.id, flip, tag },
    });
    view.x = null; view.y = null;
    state.selection = { kind: "view", id: view.id };
    invalidate();
    host.markDirty();
    host.flash(host.t("drawSectionAdded"));
  }

  function finishDetail(draft, endPoint) {
    const built = scene();
    const place = built.views.find((entry) => entry.id === draft.viewId);
    if (!place) return;
    const doc = host.doc();
    const centre = place.toModel(draft.centre);
    const radius = Math.hypot(endPoint.x - draft.centre.x, endPoint.y - draft.centre.y) / place.k;
    if (!(radius > 0.2)) { host.flash(host.t("drawDetailSmall")); return; }
    const tag = nextSectionTag(doc);
    host.pushUndo(host.t("opAddView"));
    const view = addViewToSheet(doc, place.view.dir, {
      label: "DETAIL " + tag,
      parent: place.id,
      detail: { from: place.id, u: centre.u, v: centre.v, radius, tag },
      scale: pickDetailScale(place.scale),
    });
    state.selection = { kind: "view", id: view.id };
    invalidate();
    host.markDirty();
    host.flash(host.t("drawDetailAdded"));
  }

  /* A detail is only useful bigger than its parent — two standard steps up. */
  function pickDetailScale(parentScale) {
    const value = scaleValue(parentScale);
    const index = STANDARD_SCALES.findIndex((scale) => scaleValue(scale) <= value);
    return STANDARD_SCALES[Math.max(0, (index < 0 ? STANDARD_SCALES.length - 1 : index) - 2)];
  }

  async function placeNote(draft) {
    const text = await host.prompt(host.t("drawNoteTitle"), "");
    state.draft = null;
    if (!text) { host.refresh(); return; }
    const doc = host.doc();
    host.pushUndo(host.t("opAddNote"));
    const note = {
      id: "n" + Math.random().toString(36).slice(2, 9),
      x: draft.at.x + 6, y: draft.at.y - 6, text,
      leader: draft.anchor ? { viewId: draft.viewId, u: draft.anchor.u, v: draft.anchor.v } : null,
    };
    doc.notes.push(note);
    state.selection = { kind: "note", id: note.id };
    host.markDirty();
  }

  async function editDim(id) {
    const doc = host.doc();
    const dim = (doc.dims || []).find((entry) => entry.id === id);
    if (!dim) return;
    const current = dim.text || dimensionText(Object.assign({}, dim, { measure: measureDim(dim) }), doc);
    const next = await host.prompt(host.t("drawDimTextTitle"), current);
    if (next === null) return;
    host.pushUndo(host.t("opEditDim"));
    const measured = dimensionText(Object.assign({}, dim, { measure: measureDim(dim), text: "" }), doc);
    dim.text = next.trim() && next.trim() !== measured ? next.trim() : "";
    host.markDirty();
  }

  async function editNote(id) {
    const doc = host.doc();
    const note = (doc.notes || []).find((entry) => entry.id === id);
    if (!note) return;
    const next = await host.prompt(host.t("drawNoteTitle"), note.text || "");
    if (next === null) return;
    host.pushUndo(host.t("opEditNote"));
    note.text = next;
    host.markDirty();
  }

  function deleteSelection() {
    const doc = host.doc();
    const selection = state.selection;
    if (!selection) return false;
    if (selection.kind === "view") {
      const view = doc.views.find((entry) => entry.id === selection.id);
      if (!view) return false;
      if (view.primary && doc.views.filter((entry) => isOrthoView(entry.dir) && !entry.section && !entry.detail).length <= 1) {
        host.flash(host.t("drawKeepOneView"));
        return true;
      }
      host.pushUndo(host.t("opDeleteView"));
      removeViewFromSheet(doc, selection.id);
    } else if (selection.kind === "dim") {
      host.pushUndo(host.t("opDeleteDim"));
      doc.dims = doc.dims.filter((entry) => entry.id !== selection.id);
    } else if (selection.kind === "note") {
      host.pushUndo(host.t("opDeleteNote"));
      doc.notes = doc.notes.filter((entry) => entry.id !== selection.id);
    }
    state.selection = null;
    invalidate();
    host.markDirty();
    return true;
  }

  function addView(dir) {
    const doc = host.doc();
    host.pushUndo(host.t("opAddView"));
    const view = addViewToSheet(doc, dir, { label: defaultViewLabel(dir) });
    state.selection = { kind: "view", id: view.id };
    invalidate();
    host.markDirty();
  }

  /* Automatic overall dimensions: the two sizes every drawing carries, placed
     on the primary view so a sheet is useful the moment it is opened. */
  function autoDimension(seeding) {
    const doc = host.doc();
    const built = scene();
    const place = built.views.find((entry) => entry.id === built.primaryId);
    if (!place?.projection?.bounds) {
      if (!seeding) host.flash(host.t("drawNoGeometry"));
      return;
    }
    const bounds = place.projection.bounds;
    if (!seeding) host.pushUndo(host.t("opAddDim"));
    doc.dims = (doc.dims || []).filter((dim) => !dim.auto || dim.viewId !== place.id);
    doc.dims.push({
      id: "d" + Math.random().toString(36).slice(2, 9), auto: true, viewId: place.id, type: "horizontal",
      refs: [{ u: bounds.u0, v: bounds.v0 }, { u: bounds.u1, v: bounds.v0 }], offset: -12,
    });
    doc.dims.push({
      id: "d" + Math.random().toString(36).slice(2, 9), auto: true, viewId: place.id, type: "vertical",
      refs: [{ u: bounds.u1, v: bounds.v0 }, { u: bounds.u1, v: bounds.v1 }], offset: 12,
    });
    host.markDirty();
  }

  function setSheetOption(key, value) {
    const doc = host.doc();
    host.pushUndo(host.t("opSheetSetup"));
    if (key === "size" && SHEET_SIZES[value]) doc.size = value;
    else if (key === "orientation") doc.orientation = value === "portrait" ? "portrait" : "landscape";
    else if (key === "projection") doc.projection = value === "first" ? "first" : "third";
    else if (key === "units") doc.units = value;
    else if (key === "scale") doc.scale = value;
    else if (key === "showHidden") doc.showHidden = !!value;
    else if (key === "showCenters") doc.showCenters = !!value;
    else if (key === "showZones") doc.showZones = !!value;
    else if (key === "viewScale" && state.selection?.kind === "view") {
      const view = doc.views.find((entry) => entry.id === state.selection.id);
      if (view) view.scale = value === "sheet" ? null : value;
    } else if (key === "viewHidden" && state.selection?.kind === "view") {
      const view = doc.views.find((entry) => entry.id === state.selection.id);
      if (view) view.hidden = value === "sheet" ? null : !!value;
    }
    state.scene = null;
    if (key === "size" || key === "orientation") fit();
    host.markDirty();
  }

  function relayout() {
    const doc = host.doc();
    host.pushUndo(host.t("opSheetSetup"));
    doc.views.forEach((view) => { view.x = null; view.y = null; });
    state.scene = null;
    host.markDirty();
  }

  function keyDown(event) {
    const key = event.key;
    if (key === "Escape") {
      if (state.draft) { state.draft = null; host.refresh(); return true; }
      if (state.tool !== "select") { setTool("select"); return true; }
      if (state.selection) { state.selection = null; host.refresh(); return true; }
      return false;
    }
    if (key === "Delete" || key === "Backspace") return deleteSelection() ? (host.refresh(), true) : false;
    const lower = String(key).toLowerCase();
    if (lower === "f") { fit(); host.refresh(); return true; }
    if (lower === "d") { setTool("dim"); return true; }
    if (lower === "v") { setTool("select"); return true; }
    if (lower === "n") { setTool("note"); return true; }
    if (lower === "s" && !event.ctrlKey && !event.metaKey) { setTool("section"); return true; }
    if (lower === "h") { setSheetOption("showHidden", !host.doc().showHidden); host.refresh(); return true; }
    return false;
  }

  /* ---- output ------------------------------------------------------------ */

  function svg() { return sceneToSvg(scene()); }

  function status() {
    const doc = host.doc();
    const built = scene();
    const selected = state.selection?.kind === "view"
      ? doc.views.find((view) => view.id === state.selection.id)
      : null;
    return {
      size: doc.size + (doc.orientation === "portrait" ? " ↕" : " ↔"),
      scale: scaleLabel(built.scale),
      units: doc.units,
      projection: doc.projection,
      views: doc.views.length,
      dims: (doc.dims || []).length,
      selection: selected ? selected.label || defaultViewLabel(selected.dir) : null,
      cursor: state.cursor,
      zoom: state.zoom,
    };
  }

  return {
    state, render, fit, invalidate, setTool, scene, svg, status,
    getTool: () => state.tool,
    selection: () => state.selection,
    select: (value) => { state.selection = value; state.scene = null; host.refresh(); },
    pointerDown, pointerMove, pointerUp, doubleClick, wheel, keyDown,
    deleteSelection, addView, autoDimension, setSheetOption, relayout,
    availableViews: () => availableViewDirs(host.doc()),
    zoomBy: (factor) => { zoomBy(factor, host.width() / 2, host.height() / 2); host.refresh(); },
  };
}

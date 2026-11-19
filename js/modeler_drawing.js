import {lengthFromDocument} from './core/document_length_units.js';
import {normalizeSectionHatch} from "./core/section_hatch.js";
import {modelItemTolerance} from "./core/dimension_tolerance.js";
import {resolveComponentBalloon} from './core/assembly_balloon.js';
import { holeLeaderForViews, holeTopologyAnchor } from "./core/hole_callout.js";

// Commit explicitly on mobile: dismissing a software keyboard does not
// consistently dispatch change. Read the live field only when applying.
export function bindDetailTagControls(input, button, sheet, viewId, redraw, optionKey='viewDetailTag') {
  const apply=()=>{
    const tag=String(input.value || '').trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9]{0,7}$/.test(tag)) {
      input.setCustomValidity('Use 1–8 letters or digits, starting with a letter.');
      input.reportValidity();return;
    }
    input.setCustomValidity('');
    sheet.select({kind:'view',id:viewId});
    sheet.setSheetOption(optionKey,tag);
    input.value=tag;redraw();
  };
  button.addEventListener('click',apply);
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();apply();}});
  input.addEventListener('input',()=>input.setCustomValidity(''));
}
export function bindSectionTagControls(input, button, sheet, viewId, redraw) {
  bindDetailTagControls(input,button,sheet,viewId,redraw,'viewSectionTag');
}
export function bindSectionPositionControls(input,button,sheet,viewId,unit,redraw) {
  const apply=()=>{
    const raw=String(input.value).trim(),value=Number(raw);
    if(!raw || !Number.isFinite(value)){input.setCustomValidity('Enter a finite parent-view coordinate.');input.reportValidity();return;}
    input.setCustomValidity('');sheet.select({kind:'view',id:viewId});
    sheet.setSheetOption('viewSectionAt',lengthFromDocument(value,unit));redraw();
  };
  button.addEventListener('click',apply);
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();apply();}});
  input.addEventListener('input',()=>input.setCustomValidity(''));
}
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
  dimensionText, edgeAngleRefs, effectiveViewSource, hasHostDimensionReference, measureDim, nextSectionTag, projectedDimensionBinding, normalizeViewSource, removeViewFromSheet, canRemoveViewFromSheet, resolveDimAnchor,
  scaleLabel, scaleValue, sceneToSvg, sheetDimIssues, sheetPaper, topologyAnchors, topologyCrossings, viewSourceOwner,
} from "./cad_sheet.js";
import { isOrthoView, projectionBounds, viewBasis, viewForSight } from "./core/hidden_line.js";
import { planModelItems } from "./core/model_items.js";
import {DRAWING_PRIMITIVE_TOOLS, drawingPrimitiveItems, drawingPrimitiveHit, snapDrawingPrimitivePoint, validateDrawingPrimitive, drawingEllipseGeometry, drawingEllipsePoints} from "./core/drawing_primitives.js";
import {canCropView,cropSplinePoints} from './core/drawing_crop.js';
import {canBreakOutView,projectBrokenOutView} from './core/drawing_broken_out.js';
import {auxiliaryFaceCandidates,resolveAuxiliaryBasis} from './core/drawing_auxiliary.js';
import {canBreakView,alignedBreakPlan} from './core/drawing_break.js';
import {canAlternatePosition,alternatePositionBodies} from './core/drawing_alternate_position.js';
import {canAlignedSectionParent,projectAlignedSection} from './core/drawing_aligned_section.js';
import {drawingImageAsset,drawingImageItem} from './core/drawing_image.js';
import {
  drawingScreenAndPainting, drawingSnapping,
} from "./modeler_drawing/scene_snapping.js";
import {
  drawingDimensionsAndDrags,
} from "./modeler_drawing/dimensions_drags.js";
import {
  drawingAutoDimensions, drawingZoomAndCommands,
} from "./modeler_drawing/zoom_commands.js";
// for js/modeler_drawing/scene_snapping.js (live bindings: it sees every reassignment)
export { clamp };
// for js/modeler_drawing/dimensions_drags.js (live bindings: it sees every reassignment)
export { num };

export const DRAWING_TOOLS = ["select", "dim", "angle", "diam", "baseline", "chain", "note", "insertimage", "insertprojectimage", "editimage", "removeimage", "saveformat", "applyformat", "savetemplate", "newtemplate", "section", "alignedsection", "detail", "crop", "uncrop", "brokenout", "unbrokenout", "break", "unbreak", "auxiliary", "alternateposition", "removealternateposition", ...Object.keys(DRAWING_PRIMITIVE_TOOLS)];

/** Axis-aligned picks have only one meaningful projected measurement.
 * Moving its label past an endpoint must not turn that measurement into zero. */
export function linearDimensionPreview(draft, place, cursor) {
  if (!cursor || draft.refs?.length !== 2) return null;
  const [first, second] = draft.refs;
  const du = Math.abs(second.u - first.u), dv = Math.abs(second.v - first.v);
  const tolerance = 1e-8 * Math.max(1, du, dv);
  if (Math.max(du, dv) <= tolerance) return null;
  const a = place.toSheet(first), b = place.toSheet(second);
  const mid = {x:(a.x+b.x)/2, y:(a.y+b.y)/2};
  const type = draft.aligned ? "aligned" : du <= tolerance ? "vertical"
    : dv <= tolerance ? "horizontal"
      : Math.abs(cursor.y-mid.y) >= Math.abs(cursor.x-mid.x) ? "horizontal" : "vertical";
  const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
  const offset = type === "horizontal" ? mid.y-cursor.y
    : type === "vertical" ? cursor.x-mid.x
      : ((cursor.x-a.x)*(-dy)+(cursor.y-a.y)*dx)/length;
  return {type, refs:draft.refs.slice(), viewId:draft.viewId, offset};
}

/** The book permits dimensions to hidden edges when a visible view cannot
 * express them. Offer their real segment endpoints only while those edges
 * are actually displayed on this view. */
export function drawingSnapSegments(place, doc) {
  const view=place.view || {};
  const shaded=["shaded","shadedEdges"].includes(view.displayStyle);
  const hidden=!shaded && (view.hidden != null ? !!view.hidden
    : (isOrthoView(view.dir) || view.section) && doc.showHidden !== false);
  return (place.projection?.visible || []).concat(hidden ? place.projection?.hidden || [] : []);
}

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
    pinching: false,
  };
  const touchPointers = new Set();
  function resetSession() {
    touchPointers.clear();
    state.pinching = false;
    state.drag = state.draft = state.snap = state.selection = state.hover = null;
    invalidate();
  }
  let projector = null;
  let projectionToken = -1;

  /* ---- geometry ---------------------------------------------------------- */

  /* Projections are expensive and the sheet is repainted on every pointer move,
     so they are cached until the model itself rebuilds — the token is the
     editor's promise that the triangles have not changed underneath us. */
  let drawingDoc = null;
  function useDocument(doc) {
    if (doc !== drawingDoc) {
      invalidate();
      drawingDoc = doc;
    }
  }
  function projectionFor(view, doc = host.doc()) {
    useDocument(doc);
    const token = host.bodiesToken();
    if (token !== projectionToken || !projector) {
      projectionToken = token;
      const bodies = host.bodies() || [];
      projector = createProjector(doc, bodies, { bodiesForView: host.bodiesForView ? view => host.bodiesForView(view, bodies) : undefined,topology:host.topology,sourceToken:host.viewSourceToken,
        isExplodedView:host.isExplodedView });
    }
    return projector(view);
  }

  function invalidateLayout() { state.scene = null; }
  function invalidate() {
    projector = drawingDoc = null;
    projectionToken = -1;
    invalidateLayout();
  }

  /* ---- the scene --------------------------------------------------------- */

  const { scene, toScreen, toSheetMm, fit, zoomBy, FONT, paintItem, render } = drawingScreenAndPainting(host, state, useDocument, projectionFor, paintDraft);

  function paintDraft(c, built) {
    const draft = state.draft;
    if (!draft || !state.cursor) return;
    const place = built.views.find((entry) => entry.id === draft.viewId);
    c.setLineDash([5, 4]);
    c.strokeStyle = "#e08030";
    c.lineWidth = 1.4;
    if (draft.kind==='primitive') {
      const points=['arc','ellipse'].includes(draft.type) && draft.points.length>=2 ? draft.points.slice(0,2).concat(state.cursor) : draft.points.concat(state.cursor);
      try { for(const item of drawingPrimitiveItems({type:draft.type,points,style:'outline'}))paintItem(c,{...item,style:'highlight'}); } catch { /* First pick may coincide with cursor. */ }
      return;
    }
    if(draft.kind==='alignedsection' && place) {
      const points=draft.points.concat(draft.points.length<3 && state.cursor ? [place.toModel(state.cursor)] : []);
      c.beginPath();points.map(p=>toScreen(place.toSheet(p))).forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();return;
    }
    if((draft.kind==='crop'||draft.kind==='brokenout') && place) {
      const points=draft.points.concat(state.cursor ? place.toModel(state.cursor) : []);
      let boundary=points;
      try { boundary=cropSplinePoints({type:'closed-spline',points}); } catch { /* Show incomplete controls until closure is valid. */ }
      c.beginPath();
      boundary.map(p=>toScreen(place.toSheet(p))).forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));
      if(points.length>=3)c.closePath();
      c.stroke();
      c.setLineDash([]);
      return;
    }
    if (draft.kind === "dim" && place) {
      const points = draft.refs.map((ref) => toScreen(place.toSheet(ref)));
      c.beginPath();
      points.forEach((point, index) => { if (index) c.lineTo(point.x, point.y); else c.moveTo(point.x, point.y); });
      if (draft.refs.length < draftPicks(draft) && state.cursor) {
        const cursor = toScreen(state.cursor);
        c.lineTo(cursor.x, cursor.y);
      }
      c.stroke();
      points.forEach((point) => { c.fillStyle = "#e08030"; c.fillRect(point.x - 3, point.y - 3, 6, 6); });
      /* The value is previewed from the pick still in the pointer, so an angle
         reads live off the second arm the way a linear reads off the drop. */
      const preview = previewDim(draft, place);
      if (preview) {
        const text = dimensionText(Object.assign({}, preview, { measure: measureDim(preview) }), host.doc());
        const at = toScreen(state.cursor);
        c.font = "600 12px " + FONT;
        c.fillStyle = "#e08030";
        c.fillText(text, at.x + 10, at.y - 8);
      }
    } else if (draft.kind === "run" && place) {
      /* Where the run has been, and where the next member would reach to. */
      const points = draft.refs.map((ref) => toScreen(place.toSheet(ref)));
      const from = points[draft.mode === "baseline" ? 0 : points.length - 1];
      const cursor = toScreen(state.cursor);
      c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(cursor.x, cursor.y); c.stroke();
      points.forEach((point) => { c.fillStyle = "#e08030"; c.fillRect(point.x - 3, point.y - 3, 6, 6); });
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

  const { snapPoints, bindAnchor, dimRef } = drawingSnapping(host, scene);

  function snapAt(sheetPoint) {
    const built = scene();
    const reach = 9 / state.zoom;              // millimetres of paper under 9px
    let best = null;
    for (const place of built.views) {
      if (!pointNearBox(sheetPoint, place.box, 8)) continue;
      for (const point of snapPoints(place)) {
        const at = place.toSheet(point);
        if(!at)continue;
        const distance = Math.hypot(at.x - sheetPoint.x, at.y - sheetPoint.y);
        if (distance > reach) continue;
        const rank = point.kind === "end" ? 0 : point.kind === "centre" ? 1
          : point.kind === "cross" ? 1.5 : point.kind === "quad" ? 2 : 3;
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
    for(const primitive of [...(host.doc().primitives || [])].reverse()) {
      try { if(drawingPrimitiveHit(primitive,sheetPoint,reach))return {kind:'primitive',id:primitive.id}; } catch { /* Invalid imported annotations are diagnosed by the renderer. */ }
    }
    for (const item of built.items) {
      if (!item.dimId && !item.noteId) continue;
      let hit = false;
      if (item.type === "line") hit = distanceToSegment(sheetPoint.x, sheetPoint.y, item.x1, item.y1, item.x2, item.y2) < reach;
      else if (item.type === "text") {
        const width = item.text.length * item.size * 0.62, height = item.size * 1.2;
        const left = item.anchor === "middle" ? item.x - width / 2 : item.anchor === "end" ? item.x - width : item.x;
        const angle=(item.rotate || 0)*Math.PI/180,dx=sheetPoint.x-item.x,dy=sheetPoint.y-item.y;
        const pickX=item.x+dx*Math.cos(angle)+dy*Math.sin(angle),pickY=item.y-dx*Math.sin(angle)+dy*Math.cos(angle);
        hit = pickX >= left - 1 && pickX <= left + width + 1 &&
          pickY >= item.y - height && pickY <= item.y + height * 0.35;
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
    if(['saveformat','applyformat','savetemplate','newtemplate'].includes(id)){host.presetAction?.(id);return;}
    state.tool = DRAWING_TOOLS.includes(id) ? id : "select";
    state.draft = null;
    state.snap = null;
    host.refresh();
  }

  /* How many picks a dimension of this kind is waiting for: an angle names two
     arms about a corner, everything else spans two points. */
  const draftPicks = (draft) => (draft?.dimType === "angle" ? 3 : 2);

  function previewDim(draft, place) {
    const cursor = state.cursor;
    if (!cursor) return null;
    if (draft.dimType === "angle") {
      if (draft.refs.length !== 2) return null;
      /* The arm still under the pointer is a plain view point — it is only a
         preview, and nothing is bound until the third pick lands on a snap. */
      const third = place.toModel(cursor);
      if(!third)return null;
      return { type: "angle", viewId: draft.viewId, offset: 12, refs: draft.refs.concat([{ u: third.u, v: third.v }]) };
    }
    if (draft.refs.length < 2) return null;
    return linearDimensionPreview(draft, place, cursor);
  }

  const { signedOffset, commitLayout, cancelLayout, beginPinch, endPinch, pointerDown } = drawingDimensionsAndDrags(
    host, projectionFor, state, dimRef, touchPointers, toSheetMm, editPaperImage, invalidateLayout,
    scene, pointNearBox, hitTest, createAuxiliary, commitPrimitive, snapAt, bindAnchor, previewDim,
    placeNote, invalidate, commitAlternatePosition, commitBreak,
  );

  const {
    pointerMove, pointerUp, pointerCancel, doubleClick, wheel, pinchBy, finishAlignedSection,
  } = drawingZoomAndCommands(
    state, toSheetMm, host, scene, signedOffset, snapAt, hitTest, touchPointers, commitLayout,
    cancelLayout, editPrimitive, editDim, editNote, zoomBy, invalidate,
  );

  async function placeNote(draft) {
    const properties=Object.keys(host.model?.()?.customProperties || {});
    const depths = (host.model?.()?.features || []).filter(feature => !feature.suppressed
      && feature.type === "extrude" && feature.params?.operation !== "subtract");
    const answer = host.promptFields
      ? await host.promptFields(host.t("drawNoteTitle"), [
        {key:"text",label:"Note text",type:"textarea",value:""},
        {key:"depth",label:"Link to model",type:"select",value:"",choices:[
          {value:"",label:"Plain text"},...depths.map(feature=>({value:feature.id,label:(feature.name || "Extrusion")+" · depth"})),
          ...properties.map(key=>({value:"property:"+key,label:key+" · custom property"})),
        ]},
      ]) : await host.prompt(host.t("drawNoteTitle"), "").then(text=>text===null?null:{text});
    state.draft = null;
    if (!answer || (!answer.text && !answer.depth)) { host.refresh(); return; }
    const property=answer.depth?.startsWith("property:") ? answer.depth.slice(9) : null;
    const text = answer.text || (property ? "" : "MATERIAL THICKNESS");
    host.pushUndo(host.t("opAddNote"));
    // History capture can normalize and replace the drawing document.
    const doc = host.doc();
    const note = {
      id: "n" + Math.random().toString(36).slice(2, 9),
      x: draft.at.x + 6, y: draft.at.y - 6, text,
      ...(answer.depth ? {modelLink:property ? {kind:"property",key:property} : {kind:"extrudeDepth",featureId:answer.depth}} : {}),
      leader: draft.anchor ? { viewId: draft.viewId, u: draft.anchor.u, v: draft.anchor.v } : null,
    };
    doc.notes.push(note);
    state.selection = { kind: "note", id: note.id };
    host.markDirty();
  }

  /* Editing a dimension is one form with two fields: what it SAYS, and the
     tolerance that applies to this dimension alone. The tolerance overrides the
     title block's general note for this one number (see dimensionText), so it
     belongs next to the value override rather than in sheet setup — and it is
     free text because "±0.1", "H7" and "+0.2/0" are all things a drawing says.
     host.promptFields is the editor's own promise-based form; the single-field
     fallback keeps a host that only offers prompt() working. */
  async function editDim(id) {
    const doc = host.doc();
    let dim = (doc.dims || []).find((entry) => entry.id === id);
    if (!dim) return;
    const shown = scene().dims.get(id)?.dim || dim;
    /* What the sheet would say with nothing overridden: the yardstick a typed
       value is compared against, so retyping the measured number clears the
       override instead of freezing it. */
    const measured = dimensionText(Object.assign({}, shown, { measure: measureDim(shown), text: "", tolerance: "", reference:false }), doc);
    const current = dim.text || measured;
    const answer = host.promptFields
      ? await host.promptFields(host.t("drawDimTextTitle"), [
        { key: "text", label: host.t("drawDimTextLabel"), value: current, hint: "Use <> for the live measured value, for example Ø<>. Plain numbers override it." },
        { key: "quantity", label: "Quantity", value: String(dim.quantity || 1) },
        { key: "reference", label: host.t("drawDimReference"), type:"boolean", value: !!dim.reference },
        ...(dim.type==='angle'?[]:[{key:'precision',label:'Nominal decimal places',type:'select',value:Number.isInteger(dim.precision)?String(dim.precision):'sheet',choices:[{value:'sheet',label:'As sheet'},...Array.from({length:9},(_,n)=>({value:String(n),label:String(n)}))]}]),
        { key: "tolerance", label: host.t("drawDimTolLabel"), value: dim.tolerance || "", hint: "Blank follows part tolerance unless override is checked." },
        { key: "toleranceOverride", label: "Override part tolerance (blank suppresses)", type:"boolean", value:!!dim.toleranceOverride },
      ])
      : await host.prompt(host.t("drawDimTextTitle"), current).then((text) => (text === null ? null : { text, tolerance: dim.tolerance || "" }));
    if (!answer) return;
    if(answer.precision!==undefined&&answer.precision!=='sheet'&&(!String(answer.precision).trim()||!Number.isInteger(Number(answer.precision))||Number(answer.precision)<0||Number(answer.precision)>8)) {
      host.flash('Nominal decimal places must be As sheet or an integer0–8');return;
    }
    host.pushUndo(host.t("opEditDim"));
    dim = (host.doc().dims || []).find(entry=>entry.id===id);
    if(!dim)return;
    const next = String(answer.text ?? "").trim();
    dim.text = next && next !== measured ? next : "";
    dim.tolerance = String(answer.tolerance ?? "").trim();
    dim.toleranceOverride = !!answer.toleranceOverride || !!dim.tolerance;
    if(answer.quantity !== undefined && Number.isInteger(Number(answer.quantity)) && Number(answer.quantity)>0)
      dim.quantity=Number(answer.quantity);
    if(answer.reference !== undefined)dim.reference=!!answer.reference;
    if(answer.precision==='sheet')delete dim.precision;
    else if(answer.precision!==undefined&&dim.type!=='angle')dim.precision=Number(answer.precision);
    host.markDirty();
  }

  async function editNote(id) {
    const doc = host.doc();
    const note = (doc.notes || []).find((entry) => entry.id === id);
    if (!note) return;
    if(note.componentBalloon) {
      const owner=host.model?.(),token=host.historyToken?.(),stamp=JSON.stringify(note);
      const answer=await host.promptFields?.('Component balloon position',[
        {key:'auto',label:'Automatic placement',type:'checkbox',value:note.autoBalloon!==false},
        {key:'dx',label:'Horizontal offset (paper mm)',type:'number',value:num(note.dx,14)},
        {key:'dy',label:'Vertical offset (paper mm)',type:'number',value:num(note.dy,-12)},
      ]);
      if(!answer)return;
      const current=host.doc().notes.find(n=>n.id===id);
      if(host.model?.()!==owner||host.historyToken?.()!==token||JSON.stringify(current)!==stamp){host.flash('Drawing changed while editing balloon; retry');return;}
      const dx=Number(answer.dx),dy=Number(answer.dy),auto=!!answer.auto;
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>1000||Math.abs(dy)>1000){host.flash('Balloon offsets must be finite paper millimetres');return;}
      if(note.dx===dx&&note.dy===dy&&note.autoBalloon===auto)return;
      host.pushUndo('Edit component balloon');const live=host.doc().notes.find(n=>n.id===id);
      if(!live)return;Object.assign(live,{dx,dy,autoBalloon:auto});invalidateLayout();host.markDirty();return;
    }
    const answer = host.promptFields
      ? await host.promptFields(host.t("drawNoteTitle"), [{key:"text",label:"Note text",type:"textarea",value:note.text || ""}])
      : {text:await host.prompt(host.t("drawNoteTitle"), note.text || "")};
    if (!answer || answer.text === null || host.doc() !== doc || !doc.notes.includes(note)) return;
    const next=answer.text;
    if(next===note.text)return;
    host.pushUndo(host.t("opEditNote"));
    const live = host.doc().notes.find(entry => entry.id === id);
    if (!live) return;
    live.text = next;
    host.markDirty();
  }

  function commitPrimitive(draft) {
    try {
      const primitive=validateDrawingPrimitive({id:'p'+Math.random().toString(36).slice(2,9),type:draft.type,points:draft.points,style:'outline'},sheetPaper(host.doc()));
      host.pushUndo('Add drawing annotation');
      (host.doc().primitives ||= []).push(primitive);state.selection={kind:'primitive',id:primitive.id};state.draft=null;
      invalidateLayout();host.markDirty();return true;
    } catch(error) {host.flash(error.message);return false;}
  }
  async function editPrimitive(id) {
    const doc=host.doc(),primitive=(doc.primitives || []).find(p=>p.id===id);
    if(!primitive || !host.promptFields)return;
    const owner=host.model?.(),history=host.historyToken?.(),stamp=JSON.stringify(primitive);
    const ellipse=primitive.type==='ellipse' ? drawingEllipseGeometry(primitive.points) : null;
    const geometryFields=ellipse ? [
      {key:'cx',label:'Center X (paper mm)',value:String(ellipse.cx)},
      {key:'cy',label:'Center Y (paper mm)',value:String(ellipse.cy)},
      {key:'rx',label:'Major semi-axis (paper mm)',value:String(ellipse.rx)},
      {key:'ry',label:'Minor semi-axis (paper mm)',value:String(ellipse.ry)},
      {key:'rotation',label:'Rotation (degrees)',value:String(ellipse.rotation*180/Math.PI)},
      {key:'startAngle',label:'Start angle (degrees)',value:String(primitive.startAngle ?? 0)},
      {key:'endAngle',label:'End angle (degrees)',value:String(primitive.endAngle ?? 360)},
    ] : primitive.points.flatMap((p,i)=>[{key:'x'+i,label:'Point '+(i+1)+' X (paper mm)',value:String(p.x)},{key:'y'+i,label:'Point '+(i+1)+' Y (paper mm)',value:String(p.y)}]);
    const answer=await host.promptFields('Edit drawing annotation',[
      ...geometryFields,
      {key:'style',label:'Line style',type:'select',value:primitive.style,choices:[{value:'outline',label:'Visible'},{value:'hidden',label:'Hidden'},{value:'center',label:'Centerline'}]},
    ],'Paper annotations are independent of CAD geometry and view scale. Origin: paper top-left, X right, Y down.');
    if(!answer)return;
    if(host.model?.()!==owner || host.historyToken?.()!==history || host.doc()!==doc || !doc.primitives.includes(primitive) || JSON.stringify(primitive)!==stamp) {host.flash('Drawing changed while editing annotation; retry');return;}
    try {
      if(geometryFields.some(field=>String(answer[field.key] ?? '').trim()===''))throw new Error('Enter every paper coordinate');
      if(ellipse && (!(Number(answer.rx)>0)||!(Number(answer.ry)>0)))throw new Error('An ellipse needs two positive semi-axes');
      const points=ellipse ? drawingEllipsePoints(Object.fromEntries(geometryFields.map(field=>[field.key,Number(answer[field.key])]))) : primitive.points.map((p,i)=>({x:Number(answer['x'+i]),y:Number(answer['y'+i])}));
      const next=validateDrawingPrimitive({...primitive,style:answer.style,points,...(ellipse?{startAngle:Number(answer.startAngle),endAngle:Number(answer.endAngle)}:{})},sheetPaper(doc));
      if(JSON.stringify(next)===JSON.stringify(primitive))return;
      host.pushUndo('Edit drawing annotation');
      // Undo capture can normalize and replace the drawing records. Commit to
      // the current annotation, rather than the detached pre-history object.
      const live=host.doc().primitives.find(p=>p.id===id);
      if(!live || host.model?.()!==owner)throw new Error('Drawing changed while editing annotation; retry');
      Object.assign(live,next);invalidateLayout();host.markDirty();
    } catch(error){host.flash(error.message);}
  }

  const {
    deleteSelection, autoComponentBalloons, addView, duplicateSelectedView, addHoleCallouts,
    insertModelItems, autoDimension, setSheetOption, relayout, keyDown, draftActions, finishDraft,
    cancelDraft,
  } = drawingAutoDimensions(
    host, state, invalidate, invalidateLayout, scene, projectionFor, fit, finishAlignedSection,
    commitBrokenOut, commitPrimitive, cancelLayout, setTool,
  );

  async function commitAlternatePosition(place) {
    const doc=host.doc(),view=doc.views.find(v=>v.id===place.id),token=host.bodiesToken(),fingerprint=JSON.stringify(doc.views);
    const sourceToken = host.viewSourceToken?.(view);
    try {
      if(!canAlternatePosition(view)||host.isExplodedView?.(view))throw new Error('Alternate Position needs an ordinary non-exploded edge view');
      if(!host.promptFields)throw new Error('Alternate Position needs the drawing parameter form');
      const active=host.bodies()||[],bodies=host.bodiesForView?host.bodiesForView(view,active):active;
      if(!bodies.length)throw new Error('Alternate Position needs source body geometry');
      const old=view.alternatePosition,fields=[
        {key:'label',label:'Alternate pose label',type:'text',value:old?.label||'Illustrative alternate pose'},
        {key:'body',label:'Source bodies',type:'select',value:old?.scope==='all'?'__all':old?.bodyIds?.[0]||'__all',choices:[{value:'__all',label:'All current bodies (rigid pose)'},...bodies.map(b=>({value:String(b.id),label:b.name||String(b.id)}))]},
      ];
      for(const [group,label,factor] of [['translation','Translation',10],['rotation','World rotation',1],['pivot','World pivot',10]])for(const axis of ['x','y','z'])fields.push({key:group+axis,label:label+' '+axis.toUpperCase()+(group==='rotation'?' (degrees)':' (mm)'),type:'number',value:(old?.[group]?.[axis]||0)*factor,step:.1});
      const answer=await host.promptFields('Alternate Position — associative phantom overlay',fields,'Illustrative rigid study pose of current geometry, not a solved mate configuration. Rotation applies about the world pivot in X, then Y, then Z order. Base geometry, dimensions and mates stay unchanged.');
      if(!answer)return;
      if(host.doc()!==doc||host.bodiesToken()!==token||host.viewSourceToken?.(view)!==sourceToken||JSON.stringify(doc.views)!==fingerprint)throw new Error('Drawing or source changed while choosing Alternate Position; retry');
      const modifier={version:1,...(view.source ? {source:view.source} : {}),label:String(answer.label||'').trim(),scope:answer.body==='__all'?'all':'selected',bodyIds:answer.body==='__all'?bodies.map(b=>String(b.id)):[String(answer.body)],sourceConfigurationId:view.configurationId||null};
      for(const [group,factor] of [['translation',10],['rotation',1],['pivot',10]])modifier[group]=Object.fromEntries(['x','y','z'].map(axis=>[axis,Number(answer[group+axis])/factor]));
      alternatePositionBodies(bodies,{...view,alternatePosition:modifier});
      host.pushUndo('Alternate Position');
      const live=host.doc().views.find(v=>v.id===place.id);if(!live)throw new Error('Alternate Position parent disappeared');
      live.alternatePosition=modifier;invalidate();host.markDirty();host.flash('Alternate Position applied; source model and base dimensions preserved');host.refresh();
    }catch(error){host.flash(error.message);host.refresh();}
  }

  async function commitBreak(place) {
    const doc=host.doc(),view=doc.views.find(v=>v.id===place.id),token=host.bodiesToken(),fingerprint=JSON.stringify(doc.views);
    const sourceToken = host.viewSourceToken?.(view);
    try {
      if(!canBreakView(view,doc) || host.isExplodedView?.(view))throw new Error('Break needs an ordinary orthographic edge view');
      if(!host.promptFields)throw new Error('Break needs the drawing parameter form');
      const bounds=place.projection.sourceBounds || projectionBounds(place.projection),old=view.breakView;
      const answer=await host.promptFields('Break view — existing view, true dimensions',[
        {key:'axis',label:'Shortening axis',type:'select',value:old?.axis || 'u',choices:[{value:'u',label:'Horizontal (vertical break lines)'},{value:'v',label:'Vertical (horizontal break lines)'}]},
        {key:'from',label:'First boundary, original view coordinate (mm)',type:'number',value:(old?.from ?? (bounds.u0+(bounds.u1-bounds.u0)/3))*10,step:.1},
        {key:'to',label:'Second boundary, original view coordinate (mm)',type:'number',value:(old?.to ?? (bounds.u0+2*(bounds.u1-bounds.u0)/3))*10,step:.1},
        {key:'gapMm',label:'Printed gap (mm)',type:'number',value:old?.gapMm || 6,min:.1,step:.1},
        {key:'style',label:'Break line style',type:'select',value:old?.style || 'zigzag',choices:[{value:'zigzag',label:'Zigzag'},{value:'wave',label:'Wavy'}]},
      ],`Original coordinate bounds: horizontal ${bounds.u0*10} to ${bounds.u1*10} mm; vertical ${bounds.v0*10} to ${bounds.v1*10} mm. Keep both boundaries inside the chosen axis bounds. In a Front principal cluster, matching projected views share the physical Break; end-on views stay full size.`);
      if(!answer)return;
      if(host.doc()!==doc || host.bodiesToken()!==token || host.viewSourceToken?.(view)!==sourceToken || JSON.stringify(doc.views)!==fingerprint)throw new Error('Drawing changed while choosing Break; retry');
      const modifier={version:1,axis:answer.axis,from:Number(answer.from)/10,to:Number(answer.to)/10,gapMm:Number(answer.gapMm),style:answer.style};
      const projections=new Map(scene().views.filter(p=>p.projection).map(p=>[p.id,{...p.projection,bounds:p.projection.sourceBounds||projectionBounds(p.projection)}]));
      const plan=alignedBreakPlan(doc,view,modifier,projections,place.k,place.scale);
      const oldGroup=view.breakView?.group;
      host.pushUndo('Break view');
      for(const live of host.doc().views) {
        if(oldGroup && live.breakView?.group?.id===oldGroup.id)live.breakView=null;
        if(plan.has(live.id)){live.breakView=plan.get(live.id);live.scale=place.scale;}
      }
      invalidate();host.markDirty();host.flash('Break applied; dimensions retain original model values');host.refresh();
    } catch(error) {host.flash(error.message);host.refresh();}
  }

  async function editPaperImage(existing,point,fromProject=false) {
    const doc=host.doc(),token=host.bodiesToken(),history=host.historyToken?.(),fingerprint=JSON.stringify([doc.images,doc.size,doc.orientation]);
    try {
      const chooser=fromProject?host.chooseProjectImage:host.chooseImage;
      if(!host.promptFields||!chooser)throw new Error('Drawing image importer is unavailable');
      if(!existing&&(doc.images||[]).length>=32)throw new Error('A drawing supports at most 32 images');
      const asset=existing||await chooser();if(!asset)return;
      const pixels=drawingImageAsset(asset.dataUrl),paper=sheetPaper(doc),w=Math.min(40,paper.w),h=Math.min(w*pixels.height/pixels.width,paper.h);
      const initial=existing||{x:Math.max(0,Math.min(point.x,paper.w-w)),y:Math.max(0,Math.min(point.y,paper.h-h)),w,h};
      const answer=await host.promptFields(existing?'Edit drawing image':'Insert drawing image',[
        {key:'x',label:'Left position (paper mm)',type:'number',value:initial.x},
        {key:'y',label:'Top position (paper mm)',type:'number',value:initial.y},
        {key:'w',label:'Image width (paper mm)',type:'number',value:initial.w},
        {key:'h',label:'Image height (paper mm)',type:'number',value:initial.h},
      ],'Local PNG/JPEG, embedded in the document. Width and height can be changed independently.',{drawingOnly:true});
      if(!answer)return;
      if(host.doc()!==doc||host.bodiesToken()!==token||host.historyToken?.()!==history||JSON.stringify([doc.images,doc.size,doc.orientation])!==fingerprint)throw new Error('Drawing changed while editing image; retry');
      const image={id:existing?.id||'image_'+Math.random().toString(36).slice(2),name:asset.name||'Drawing image',dataUrl:asset.dataUrl,x:Number(answer.x),y:Number(answer.y),w:Number(answer.w),h:Number(answer.h)};
      drawingImageItem(image,paper);
      host.pushUndo(existing?'Edit drawing image':'Insert drawing image');
      const live=host.doc();live.images=live.images||[];
      const index=live.images.findIndex(i=>i.id===image.id);if(index<0)live.images.push(image);else live.images[index]=image;
      invalidateLayout();host.markDirty();host.flash('Drawing image saved on paper');host.refresh();
    } catch(error){host.flash(error.message);host.refresh();}
  }

  async function commitBrokenOut(draft) {
    const doc=host.doc(),view=doc.views.find(v=>v.id===draft.viewId),token=host.bodiesToken();
    const fingerprint=JSON.stringify(view),sketch={type:'closed-spline',closed:true,points:draft.points.map(p=>({...p}))};
    try {
      cropSplinePoints(sketch);
      if(!canBreakOutView(view,{exploded:!!host.isExplodedView?.(view)}))throw new Error('Broken-out parent is no longer available');
      state.draft=null;host.refresh();
      const answer=host.promptFields
        ? await host.promptFields('Broken-out section',[{key:'depth',label:'Removal depth from front envelope (mm)',type:'number',value:10,min:0,step:.1}])
        : {depth:await host.prompt('Removal depth from front envelope (mm)','10')};
      if(!answer || answer.depth===null)return;
      const currentDoc=host.doc(),current=currentDoc.views.find(v=>v.id===view.id);
      if(currentDoc!==doc || host.bodiesToken()!==token || JSON.stringify(current)!==fingerprint)throw new Error('Drawing or model changed while choosing depth; retry Broken-out');
      const depth=Number(answer.depth);
      if(!Number.isFinite(depth) || depth<0)throw new Error('Invalid broken-out depth');
      const modifier={sketch,depth:depth/10,datum:'front-envelope'};
      const bodies=host.bodies() || [],configured=host.bodiesForView ? host.bodiesForView(current,bodies) : bodies;
      projectBrokenOutView(configured,{...current,brokenOut:modifier});
      if(!host.doc().views.some(v=>v.id===current.id))throw new Error('Broken-out parent is no longer available');
      host.pushUndo('Broken-out section');
      const live=host.doc().views.find(v=>v.id===current.id);
      if(!live)throw new Error('Broken-out parent is no longer available');
      live.brokenOut=modifier;invalidate();host.markDirty();host.flash('Broken-out section applied');host.refresh();
    } catch(error) {host.flash(error.message);host.refresh();}
  }

  async function createAuxiliary(edge) {
    const doc=host.doc(),parent=doc.views.find(v=>v.id===edge.viewId),token=host.bodiesToken(),fingerprint=JSON.stringify(parent);
    try {
      const index=scene().topologyIndex,candidates=auxiliaryFaceCandidates(parent,edge.refs[0].pid,index);
      if(!candidates.length)throw new Error('No edge-on native planar face qualifies for this edge');
      const answer=await host.promptFields('Auxiliary view',[
        {key:'face',label:'Native inclined planar face',type:'select',value:candidates[0].persistentId,choices:candidates.map((f,i)=>({value:f.persistentId,label:'Inclined face '+(i+1)+' · normal '+[f.descriptor.normal.x,f.descriptor.normal.y,f.descriptor.normal.z].map(n=>Number(n).toFixed(3)).join(', ')}))},
        {key:'flip',label:'Reverse sight direction',type:'checkbox',value:false}
      ]);
      if(!answer)return;
      const currentDoc=host.doc(),current=currentDoc.views.find(v=>v.id===parent.id);
      if(currentDoc!==doc||host.bodiesToken()!==token||JSON.stringify(current)!==fingerprint)throw new Error('Model or drawing changed; retry Auxiliary');
      const auxiliary={from:current.id,edgeReference:{pid:edge.refs[0].pid},faceReference:{pid:answer.face},flip:!!answer.flip};
      resolveAuxiliaryBasis({id:'new-auxiliary',auxiliary},currentDoc,scene().topologyIndex);
      const place=scene().views.find(p=>p.id===current.id);
      host.pushUndo('Auxiliary view');
      const view=addViewToSheet(host.doc(),'auxiliary',{label:'AUXILIARY',parent:current.id,auxiliary,scale:place?.scale,configurationId:current.configurationId});
      state.selection={kind:'view',id:view.id};invalidate();host.markDirty();host.refresh();
    } catch(error) {host.flash(error.message);}
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
      dangling: sheetDimIssues(built),
      selection: selected ? selected.label || defaultViewLabel(selected.dir) : null,
      cursor: state.cursor,
      zoom: state.zoom,
    };
  }

  return {
    state, render, fit, invalidate, invalidateLayout, setTool, scene, svg, status,
    getTool: () => state.tool,
    selection: () => state.selection,
    select: (value) => { state.selection = value; state.scene = null; host.refresh(); },
    pointerDown, pointerMove, pointerUp, pointerCancel, doubleClick, wheel, pinchBy, keyDown, beginPinch, endPinch, resetSession, draftActions, finishDraft, cancelDraft,
    deleteSelection, addView, duplicateSelectedView, autoDimension, autoComponentBalloons, insertModelItems, addHoleCallouts, setSheetOption, relayout, editDim, editPrimitive,
    danglingDims: () => sheetDimIssues(scene()),
    document: () => host.doc(),
    availableViews: () => availableViewDirs(host.doc()),
    zoomBy: (factor) => { zoomBy(factor, host.width() / 2, host.height() / 2); host.refresh(); },
  };
}


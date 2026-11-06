/* The drawing controller's zoom, commands, hole callouts and automatic
   dimensions, lifted out of createDrawingController, split out of
   js/modeler_drawing.js. It shares the editor's state through live imports from
   ../modeler_drawing.js. */
import { SHEET_SIZES, STANDARD_SCALES, addViewToSheet, canRemoveViewFromSheet, defaultViewLabel, effectiveViewSource, hasHostDimensionReference, nextSectionTag, normalizeViewSource, projectedDimensionBinding, removeViewFromSheet, scaleValue, viewSourceOwner } from "../cad_sheet.js";
import { resolveComponentBalloon } from "../core/assembly_balloon.js";
import { canAlignedSectionParent, projectAlignedSection } from "../core/drawing_aligned_section.js";
import { canCropView, cropSplinePoints } from "../core/drawing_crop.js";
import { DRAWING_PRIMITIVE_TOOLS, snapDrawingPrimitivePoint } from "../core/drawing_primitives.js";
import { projectionBounds, viewBasis, viewForSight } from "../core/hidden_line.js";
import { holeLeaderForViews, holeTopologyAnchor } from "../core/hole_callout.js";
import { planModelItems } from "../core/model_items.js";
import { normalizeSectionHatch } from "../core/section_hatch.js";
import { num } from "../modeler_drawing.js";

// lifted out of createDrawingController()
function drawingZoomAndCommands(
  state, toSheetMm, host, scene, signedOffset, snapAt, hitTest, touchPointers, commitLayout,
  cancelLayout, editPrimitive, editDim, editNote, zoomBy, invalidate,
) {
  function pointerMove(event, x, y) {
    if (state.pinching) return true;
    const sheetPoint = toSheetMm(x, y);
    state.cursor = sheetPoint;
    if(state.draft?.kind==='primitive')state.cursor=snapDrawingPrimitivePoint(sheetPoint,host.doc().primitives,4/state.zoom,state.draft.points.at(-1),event.shiftKey,event.ctrlKey||event.metaKey);
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
      /* Drag against where the dimension IS on the paper, which after a rebuild
         is the reprojected copy, not the points stored in the document. */
      const shown = built.dims.get(state.drag.id)?.dim || dim;
      if (dim && place) {
        if (dim.type === "radius" || dim.type === "diameter") {
          const centre = place.toSheet(shown.refs[0]);
          dim.angle = Math.atan2(sheetPoint.y - centre.y, sheetPoint.x - centre.x);
          dim.offset = Math.max(3, Math.hypot(sheetPoint.x - centre.x, sheetPoint.y - centre.y) - num(shown.radius) * place.k);
        } else if (dim.type === "angle") {
          /* An angle's offset is the arc's radius from the corner, which is
             what the arc is drawn at — the same one number, dragged. */
          const vertex = place.toSheet(shown.refs[1] || { u: 0, v: 0 });
          dim.offset = Math.max(4, Math.hypot(sheetPoint.x - vertex.x, sheetPoint.y - vertex.y));
        } else {
          const a = place.toSheet(shown.refs[0]), b = place.toSheet(shown.refs[1]);
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
        const nextX=state.drag.startX + (x - state.drag.x) / state.zoom,nextY=state.drag.startY + (y - state.drag.y) / state.zoom;
        if(state.drag.balloon){note.dx=nextX;note.dy=nextY;note.autoBalloon=false;}
        else {note.x=nextX;note.y=nextY;}
        state.scene = null;
        host.refresh();
      }
      return true;
    }
    if (state.tool === "dim" || state.tool === "angle" || state.tool === "baseline" || state.tool === "chain") state.snap = snapAt(sheetPoint);
    else if (state.tool !== "select") state.snap = null;
    else state.hover = hitTest(sheetPoint);
    host.refresh();
    return true;
  }

  function pointerUp(event, x, y) {
    if (event.pointerType === "touch" && event.pointerId != null) touchPointers.delete(event.pointerId);
    if (state.pinching) {
      return true;
    }
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
      if (Math.hypot(x - drag.x, y - drag.y) > 2) { commitLayout(drag); host.markDirty(); }
      else cancelLayout(drag);
      return true;
    }
    host.refresh();
    return true;
  }

  function pointerCancel(event) {
    if (event.pointerId != null) touchPointers.delete(event.pointerId);
    if (state.pinching) {
      return true;
    }
    const drag = state.drag;
    if (drag && ["view", "dim", "note"].includes(drag.mode)) cancelLayout(drag);
    state.drag = null;
    state.draft = null;
    host.refresh();
    return true;
  }

  function doubleClick(event, x, y) {
    // Rapid neighboring drafting picks can also produce a native dblclick.
    // Keep those picks with the active Paper tool; Select owns annotation editing.
    if (DRAWING_PRIMITIVE_TOOLS[state.tool] || ['dim','diam','angle'].includes(state.tool)) return true;
    const sheetPoint = toSheetMm(x, y);
    const hit = hitTest(sheetPoint);
    if (hit?.kind === 'primitive') { editPrimitive(hit.id); return true; }
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

  // Keep the paper point beneath the previous two-contact midpoint under the
  // new midpoint. Equal contact spacing is pure pan, not a no-op zoom.
  function pinchBy(factor, fromX, fromY, toX, toY) {
    if(factor!==1)zoomBy(factor, fromX, fromY);
    state.ox += toX-fromX;
    state.oy += toY-fromY;
    host.refresh();
  }

  /* ---- commands ---------------------------------------------------------- */

  function finishAlignedSection(draft) {
    try {
      const doc=host.doc(),parent=doc.views.find(v=>v.id===draft.viewId);
      if(draft.token!==host.bodiesToken() || JSON.stringify(parent)!==draft.fingerprint)throw new Error('Aligned Section source changed; cancel and pick the cutting path again');
      if(draft.points.length!==3 || !canAlignedSectionParent(parent) || host.isExplodedView?.(parent))throw new Error('Pick exactly two endpoints and their common hinge in an ordinary principal view');
      const tag=nextSectionTag(doc),modifier={version:1,from:parent.id,points:draft.points.map(p=>({...p})),tag};
      const candidate={id:'aligned-section-validation',dir:'alignedsection',configurationId:parent.configurationId,alignedSection:modifier};
      const active=host.bodies()||[],bodies=host.bodiesForView?host.bodiesForView(parent,active):active;
      projectAlignedSection(bodies,candidate,doc);
      let liveDoc=host.doc(),live=liveDoc.views.find(v=>v.id===parent.id);
      if(!live)throw new Error('Aligned Section parent disappeared');
      host.pushUndo('Aligned Section');
      liveDoc=host.doc();live=liveDoc.views.find(v=>v.id===parent.id);
      const view=addViewToSheet(liveDoc,'alignedsection',{parent:live.id,configurationId:live.configurationId,configurationName:live.configurationName,alignedSection:modifier,label:'ALIGNED CUT-FACE '+tag+'-'+tag+' (UNFOLDED)'});
      state.draft=null;state.selection={kind:'view',id:view.id};invalidate();host.markDirty();host.flash('Aligned cut faces unfolded; source solids unchanged. Unfolded coordinate dimensions are frozen references.');
    } catch(error) {host.flash(error.message);}
    host.refresh();
  }

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
    /* Sight is perpendicular to the directed cutting line: clockwise on
       paper (left-to-right points down; top-to-bottom points left). Reversing
       the touch drag reverses the arrows and view; Shift remains an override. */
    const forwardDrag = horizontal ? endPoint.x > draft.start.x : endPoint.y > draft.start.y;
    const flip = forwardDrag !== !!draft.flip;
    const sight = flip ? { x: -along.x, y: -along.y, z: -along.z } : along;
    const tag = nextSectionTag(doc);
    host.pushUndo(host.t("opAddView"));
    const view = addViewToSheet(host.doc(), viewForSight(sight), {
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
    const view = addViewToSheet(host.doc(), place.view.dir, {
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
  return {
    pointerMove, pointerUp, pointerCancel, doubleClick, wheel, pinchBy, finishAlignedSection,
  };
}

// lifted out of createDrawingController()
function drawingAutoDimensions(
  host, state, invalidate, invalidateLayout, scene, projectionFor, fit, finishAlignedSection,
  commitBrokenOut, commitPrimitive, cancelLayout, setTool,
) {
  function deleteSelection() {
    const doc = host.doc();
    const selection = state.selection;
    if (!selection) return false;
    if (selection.kind === "view") {
      const view = doc.views.find((entry) => entry.id === selection.id);
      if (!view) return false;
      if (!canRemoveViewFromSheet(doc, selection.id)) {
        host.flash(host.t("drawKeepOneView"));
        return true;
      }
      host.pushUndo(host.t("opDeleteView"));
      removeViewFromSheet(host.doc(), selection.id);
    } else if (selection.kind === "dim") {
      host.pushUndo(host.t("opDeleteDim"));
      const live = host.doc();
      live.dims = live.dims.filter((entry) => entry.id !== selection.id);
    } else if (selection.kind === "note") {
      host.pushUndo(host.t("opDeleteNote"));
      const live = host.doc();
      live.notes = live.notes.filter((entry) => entry.id !== selection.id);
    } else if (selection.kind === 'primitive') {
      host.pushUndo('Delete drawing annotation');
      const live=host.doc();live.primitives=live.primitives.filter(entry=>entry.id!==selection.id);
    }
    state.selection = null;
    if (selection.kind === "view") invalidate();
    else invalidateLayout();
    host.markDirty();
    return true;
  }

  function autoComponentBalloons() {
    const doc=host.doc(),built=scene();
    const selected=state.selection?.kind==='view'?built.views.find(v=>v.id===state.selection.id):null;
    const eligible=built.views.filter(v=>!host.viewSourceForeign?.(v.view));
    const place=selected || eligible.find(v=>v.view.dir==='iso') || eligible[0];
    if(place && host.viewSourceForeign?.(place.view)){host.flash('Select a view of this assembly for component balloons');return 0;}
    if(!place||place.view.section||place.view.detail||place.view.auxiliary||place.view.alignedSection||place.view.breakView||place.view.brokenOut||place.view.cropSketch) {host.flash('Select an ordinary assembly view for component balloons');return 0;}
    const targets = host.componentBalloonsForView?.(place.view) ?? host.componentBalloons?.() ?? [];
    if(!targets.length||targets.some(t=>!t.point||![t.point.x,t.point.y,t.point.z].every(Number.isFinite)||t.item===undefined)){host.flash('Component balloons need current native mesh geometry for every visible BOM occurrence');return 0;}
    const existing=new Set((doc.notes||[]).filter(n=>n.componentBalloon&&n.leader?.viewId===place.id).map(n=>JSON.stringify(n.componentBalloon.path)));
    const planned=targets.filter(t=>!existing.has(JSON.stringify(t.path))).map(target=>resolveComponentBalloon({id:'b'+Math.random().toString(36).slice(2,9),balloon:true,autoBalloon:true,text:String(target.item),componentBalloon:{path:target.path.slice()},leader:{viewId:place.id}},targets,place.projection?.basis).note);
    if(!planned.length)return 0;
    host.pushUndo('Auto component balloons');
    const live=host.doc();if(!live.views.some(v=>v.id===place.id))return 0;
    live.notes.push(...planned);state.selection=null;invalidateLayout();host.markDirty();host.refresh();return planned.length;
  }

  function addView(dir) {
    host.pushUndo(host.t("opAddView"));
    const doc = host.doc();
    /* Like a SOLIDWORKS projected view, a new view draws the model the
       primary view draws; the panel's Model source changes it afterwards. */
    const primary = doc.views.find((entry) => entry.primary);
    const view = addViewToSheet(doc, dir, { label: defaultViewLabel(dir), source: primary?.source || null, assemblyState: primary?.assemblyState });
    state.selection = { kind: "view", id: view.id };
    invalidate();
    host.markDirty();
  }

  function duplicateSelectedView() {
    let doc = host.doc();
    let source = state.selection?.kind === "view" ? doc.views.find(view => view.id === state.selection.id) : null;
    if (!source) return null;
    host.pushUndo(host.t("opAddView"));
    doc = host.doc();
    source = doc.views.find(view => view.id === source.id);
    if (!source) return null;
    const copy = addViewToSheet(doc, source.dir, {
      ...source, id: undefined, label: source.label, primary: false,
      x: Number.isFinite(source.x) ? source.x + 80 : null,
      y: Number.isFinite(source.y) ? source.y : null,
      configurationId: source.configurationId,
    });
    doc.dims ||= [];
    for (const dimension of doc.dims.filter(item => item.viewId === source.id)) {
      doc.dims.push({ ...structuredClone(dimension), id: "d" + Math.random().toString(36).slice(2, 9), viewId: copy.id });
    }
    state.selection = { kind: "view", id: copy.id };
    invalidate();
    host.markDirty();
    return copy;
  }

  /* Hole callouts, read off the FEATURE TREE rather than typed. Each note names
     the hole it came from, so its text is re-derived on every build (see
     resolveNote) — a leader that still says M6 after the wizard was changed to
     M8 is the same lie as a dimension frozen at its placed value.

     A hole whose topology this sheet cannot see (an assembly's components, a
     kernel body nobody named) still gets its callout, WITHOUT a leader: the
     text is bound and the position is not, and a note that points at nothing is
     honest about that where an arrow aimed at the nearest circle would not
     be. */
  function addHoleCallouts(options = {}) {
    let doc = host.doc();
    const rows = host.holeCallouts ? host.holeCallouts() || [] : [];
    if (!rows.length) { if (!options.quiet) host.flash(host.t("drawNoHoles")); return 0; }
    const allBuilt = scene();
    const built={...allBuilt,views:allBuilt.views.filter(v=>host.canUseTopologyForView?.(v.view)!==false)};
    const place = built.views.find((entry) => entry.id === built.primaryId) || built.views[0];
    if (!place) { if (!options.quiet) host.flash(host.t("drawNoGeometry")); return 0; }
    const basis = place.projection?.basis || null;
    const plans=rows.map((row,index)=>{
      const existing=(doc.notes || []).find(note=>note.feature===row.id);
      const projected=holeLeaderForViews(row,built.views.filter(v=>!v.projection?.nonlinearProjection));
      const chosen=projected ? built.views.find(v=>v.id===projected.viewId) : place;
      const anchor = holeTopologyAnchor(built.topologyIndex, chosen.projection?.basis || basis, row.id, projected);
      const from = anchor ? chosen.toSheet(anchor) : { x: chosen.box.x, y: chosen.box.y };
      const leader=anchor ? { viewId: chosen.id, u: anchor.u, v: anchor.v, pid: anchor.pid, kind: anchor.kind, at: anchor.at } : null;
      return {row,index,existing,chosen,from,leader,changed:!existing || JSON.stringify(existing.leader)!==JSON.stringify(leader)};
    });
    const pending=plans.filter(plan=>plan.changed);
    if (!pending.length) { if (!options.quiet) host.flash(host.t("drawCalloutsDone")); return 0; }
    if (!options.undoStarted) host.pushUndo(host.t("opAddCallout"));
    doc = host.doc();
    doc.notes ||= [];
    let unbound = 0;
    pending.forEach(({row,index,existing:plannedExisting,chosen,from,leader})=>{
      const existing = plannedExisting && doc.notes.find(note => note.id === plannedExisting.id);
      if (!leader) unbound++;
      if(existing){
        const old=existing.leader,oldView=built.views.find(view=>view.id===old?.viewId);
        const oldFrom=oldView && old ? oldView.toSheet(old) : null;
        const autoPlaced=oldFrom && Math.abs(existing.x-(oldFrom.x+14))<.1 && Math.abs(existing.y-(oldFrom.y-10-index*6))<.1;
        if(autoPlaced && leader && Math.hypot((old?.u||0)-leader.u,(old?.v||0)-leader.v)>.1){existing.x=from.x+14;existing.y=from.y-10-index*6;}
        existing.leader=leader;
        return;
      }
      doc.notes.push({
        id: "n" + Math.random().toString(36).slice(2, 9),
        x: from.x + 14, y: from.y - 10 - index * 6,
        feature: row.id,
        text: row.text,
        leader,
      });
    });
    state.selection = { kind: "note", id: doc.notes[doc.notes.length - 1].id };
    invalidateLayout();
    host.markDirty();
    if (unbound) host.flash(host.t("drawCalloutUnbound"));
    return pending.length;
  }

  function insertModelItems() {
    const doc = host.doc(),built=scene(),planned = planModelItems(host.model?.() || {}, doc, {...built,views:built.views.filter(v=>!v.projection?.nonlinearProjection&&host.canUseTopologyForView?.(v.view)!==false)});
    if (planned.length) {
      host.pushUndo(host.t("drawModelItems"));
      const live = host.doc();
      live.dims.push(...planned.map(dim => ({ ...dim, id:"d" + Math.random().toString(36).slice(2, 9) })));
      state.selection = { kind:"dim", id:live.dims[live.dims.length - 1].id };
      invalidateLayout();
      host.markDirty();
    }
    const callouts = addHoleCallouts({ quiet:true, undoStarted:planned.length>0 });
    if (!planned.length && !callouts) host.flash(host.t("drawModelItemsDone"));
    return planned.length + callouts;
  }

  /* Automatic overall dimensions: the two sizes every drawing carries, placed
     on the primary view so a sheet is useful the moment it is opened. */
  function autoDimension(seeding) {
    const built = scene();
    const targetId = !seeding && state.selection?.kind === "view" ? state.selection.id : built.primaryId;
    const place = built.views.find((entry) => entry.id === targetId);
    if (!place?.projection?.bounds) {
      if (!seeding) host.flash(host.t("drawNoGeometry"));
      return;
    }
    /* The same extents the sheet re-reads on rebuild (see resolveDim), so the
       dimension does not shift the instant it is placed. */
    const bounds = place.projection.sourceBounds || projectionBounds(place.projection);
    if (!bounds) { if (!seeding) host.flash(host.t("drawNoGeometry")); return; }
    if (!seeding) host.pushUndo(host.t("opAddDim"));
    const doc = host.doc();
    doc.dims = (doc.dims || []).filter((dim) => !dim.auto || dim.viewId !== place.id);
    /* auto:"extent" is a reference in its own right — "how wide this view is" —
       so the sheet re-reads the bounds on every rebuild. auto:true (what older
       sheets carry) is a one-shot placement and stays frozen. */
    doc.dims.push({
      id: "d" + Math.random().toString(36).slice(2, 9), auto: "extent", viewId: place.id, type: "horizontal",
      refs: [{ u: bounds.u0, v: bounds.v0 }, { u: bounds.u1, v: bounds.v0 }], offset: -12,
    });
    doc.dims.push({
      id: "d" + Math.random().toString(36).slice(2, 9), auto: "extent", viewId: place.id, type: "vertical",
      refs: [{ u: bounds.u1, v: bounds.v0 }, { u: bounds.u1, v: bounds.v1 }], offset: 12,
    });
    host.markDirty();
  }

  function setSheetOption(key, value) {
    if(key==='viewSectionTag' && !/^[A-Z][A-Z0-9]{0,7}$/.test(String(value || '').trim().toUpperCase()))return;
    if(key==='viewSectionAt' && (value===null || value==='' || !Number.isFinite(Number(value))))return;
    host.pushUndo(host.t("opSheetSetup"));
    const doc = host.doc();
    if (key === "size" && SHEET_SIZES[value]) doc.size = value;
    else if (key === "orientation") doc.orientation = value === "portrait" ? "portrait" : "landscape";
    else if (key === "projection") doc.projection = value === "first" ? "first" : "third";
    else if (key === "draftingStandard") {
      doc.draftingStandard=["ANSI","ISO"].includes(value)?value:"custom";
      if(value==="ANSI"){doc.units="in";doc.precision=3;doc.trailingZeros=true;doc.projection="third";}
      if(value==="ISO"){doc.units="mm";doc.precision=2;doc.trailingZeros=true;doc.projection="first";}
    }
    else if(key === "secondaryUnits")doc.secondaryUnits=["mm","cm","m","in"].includes(value)?value:"";
    else if(key === "secondaryPrecision" && Number.isInteger(Number(value)))doc.secondaryPrecision=Math.max(0,Math.min(8,Number(value)));
    else if (key === "units") doc.units = value;
    else if(key === "precision"){if(value==="auto")delete doc.precision;else if(Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=8)doc.precision=Number(value);}
    else if(key === "trailingZeros")doc.trailingZeros=!!value;
    else if (key === "scale") doc.scale = value;
    else if (key === "showHidden") doc.showHidden = !!value;
    else if (key === "showCenters") doc.showCenters = !!value;
    else if (key === "showZones") doc.showZones = !!value;
    else if (key === "viewScale" && state.selection?.kind === "view") {
      const view = doc.views.find((entry) => entry.id === state.selection.id);
      if (view) {
        view.scale = value === "sheet" || value === "auto" ? null : value;
        if(value === "sheet")view.scaleMode='sheet';else delete view.scaleMode;
      }
    } else if (key === "viewDetailTag" && state.selection?.kind === "view") {
      const view=doc.views.find(entry=>entry.id===state.selection.id);
      const tag=String(value || '').trim().toUpperCase();
      if(view?.detail && /^[A-Z][A-Z0-9]{0,7}$/.test(tag)) {
        view.detail.tag=tag;
        view.label='DETAIL '+tag;
      }
    } else if (key === "viewSectionTag" && state.selection?.kind === "view") {
      const view=doc.views.find(entry=>entry.id===state.selection.id);
      const tag=String(value || '').trim().toUpperCase();
      if(view?.section && /^[A-Z][A-Z0-9]{0,7}$/.test(tag)) {
        view.section.tag=tag;
        view.label='SECTION '+tag+'-'+tag;
      }
    } else if (key === "viewSectionAt" && state.selection?.kind === "view") {
      const view=doc.views.find(entry=>entry.id===state.selection.id);
      if(view?.section)view.section.at=Number(value);
    } else if (key === "viewAssemblyState" && state.selection?.kind === "view") {
      const view = doc.views.find(entry => entry.id === state.selection.id);
      if (view && viewSourceOwner(doc,view) === view && (view.assemblyState || null) !== (value || null)) {
        // Witness legacy coordinate picks against the old geometry, including
        // dimensions on sections and details that inherit this owner's pose.
        for (const dim of doc.dims) {
          if (dim.sourceBinding || dim.auto === 'extent' || hasHostDimensionReference(dim)) continue;
          const target = doc.views.find(entry => entry.id === dim.viewId);
          if (viewSourceOwner(doc,target)?.id === view.id) {
            dim.sourceBinding = projectedDimensionBinding(dim,effectiveViewSource(doc,target),projectionFor(target));
          }
        }
        state.draft = null;
        doc.views.find(entry => entry.id === view.id).assemblyState = value || null;
      }
      invalidate();
    } else if (key === "viewDisplayStyle" && state.selection?.kind === "view") {
      const view=doc.views.find(entry=>entry.id===state.selection.id);
      if(view)view.displayStyle=["shaded","shadedEdges"].includes(value)?value:"edges";
    } else if (key === "viewHatchPattern" && state.selection?.kind === "view") {
      const view=doc.views.find(entry=>entry.id===state.selection.id);
      if(view && (view.section || view.alignedSection || view.brokenOut))view.hatchPattern=normalizeSectionHatch(value);
    } else if (key === "viewExcludeRibs" && state.selection?.kind === "view") {
      const view=doc.views.find(entry=>entry.id===state.selection.id);
      if(view?.section)view.section.excludeLongitudinalRibs=!!value;
    } else if (key === "viewHidden" && state.selection?.kind === "view") {
      const view = doc.views.find((entry) => entry.id === state.selection.id);
      if (view) view.hidden = value === "sheet" ? null : !!value;
    } else if (key === "viewConfiguration" && state.selection?.kind === "view") {
      const view = doc.views.find((entry) => entry.id === state.selection.id);
      if (view) view.configurationId = value === "active" ? null : value;
      invalidate();
    } else if (key === "viewSource" && state.selection?.kind === "view") {
      const view = doc.views.find((entry) => entry.id === state.selection.id);
      if (view && viewSourceOwner(doc, view) === view) {
        const previous = effectiveViewSource(doc, view);
        const next = normalizeViewSource(value);
        if (previous?.kind !== next?.kind || previous?.key !== next?.key) {
          // Old coordinate-only dimensions on this source (including sections)
          // cannot acquire the new model's identity by switching the picker.
          for (const dim of doc.dims) {
            const target = doc.views.find(entry => entry.id === dim.viewId);
            if (previous && viewSourceOwner(doc,target) === view && !dim.sourceBinding && !hasHostDimensionReference(dim) && dim.auto !== "extent") {
              dim.sourceBinding = { source: previous, anchors: [] };
            }
          }
          state.draft = null;
          view.assemblyState = null;
          const group = view.breakView?.group;
          if (group) for (const member of doc.views) if (member.breakView?.group?.id === group.id) member.breakView = null;
          view.breakView = null;
          view.alternatePosition = null;
        }
        view.source = next;
        // A configuration names one of THIS document's configurations.
        if (view.source) { view.configurationId = null; view.configurationName = null; }
      }
      invalidate();
    }
    // Derived views can depend on a parent's cut, hatch or effective scale.
    const breakScaleChanged = (key === "scale" || key === "viewScale") && doc.views.some(view => view.breakView);
    if (breakScaleChanged || ["viewSectionAt", "viewHatchPattern", "viewExcludeRibs", "viewDisplayStyle"].includes(key)) invalidate();
    else invalidateLayout();
    if (key === "size" || key === "orientation") fit();
    host.markDirty();
  }

  function relayout() {
    host.pushUndo(host.t("opSheetSetup"));
    const doc = host.doc();
    doc.views.forEach((view) => { view.x = null; view.y = null; });
    state.scene = null;
    host.markDirty();
  }

  function keyDown(event) {
    const tag = (event.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return false;
    const key = event.key;
    if(key==='Enter' && state.draft?.kind==='alignedsection') {finishAlignedSection(state.draft);return true;}
    if(key==='Enter' && state.draft?.kind==='brokenout') {commitBrokenOut(state.draft);return true;}
    if(key==='Enter' && state.draft?.kind==='crop') {
      const doc=host.doc(),view=doc.views.find(v=>v.id===state.draft.viewId);
      try {
        if(!canCropView(view,doc,{exploded:!!host.isExplodedView?.(view)})) throw new Error('Crop parent is no longer available');
        const sketch={type:'closed-spline',closed:true,points:state.draft.points.map(p=>({...p}))};
        cropSplinePoints(sketch);
        if(!host.doc().views.some(v=>v.id===view.id))throw new Error('Crop parent is no longer available');
        host.pushUndo('Crop view');
        const live=host.doc().views.find(v=>v.id===view.id);
        if(!live)throw new Error('Crop parent is no longer available');
        live.cropSketch=sketch;state.draft=null;
        invalidate();host.markDirty();host.flash('Crop applied; Remove crop restores the full view');
      } catch(error) {host.flash(error.message);}
      host.refresh();return true;
    }
    if(key==='Enter' && state.draft?.kind==='primitive' && state.draft.type==='polyline') {commitPrimitive(state.draft);host.refresh();return true;}
    if (key === "Escape") {
      /* An in-flight layout drag outranks the draft/tool/selection ladder
         below: the gesture on screen is the one the user is escaping from. */
      if (state.drag && (state.drag.mode === "view" || state.drag.mode === "dim" || state.drag.mode === "note")) {
        const drag = state.drag;
        state.drag = null;
        cancelLayout(drag);
        host.refresh();
        return true;
      }
      if (state.draft) { state.draft = null; host.refresh(); return true; }
      if (state.tool !== "select") { setTool("select"); return true; }
      if (state.selection) { state.selection = null; host.refresh(); return true; }
      return false;
    }
    if (key === "Delete" || key === "Backspace") return deleteSelection() ? (host.refresh(), true) : false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const lower = String(key).toLowerCase();
    if (lower === "f") { fit(); host.refresh(); return true; }
    if (lower === "d") { setTool("dim"); return true; }
    if (lower === "a" && !event.ctrlKey && !event.metaKey) { setTool("angle"); return true; }
    if (lower === "b") { setTool("baseline"); return true; }
    if (lower === "c" && !event.ctrlKey && !event.metaKey) { setTool("chain"); return true; }
    if (lower === "v") { setTool("select"); return true; }
    if (lower === "n") { setTool("note"); return true; }
    if (lower === "s" && !event.ctrlKey && !event.metaKey) { setTool("section"); return true; }
    if (lower === "h") { setSheetOption("showHidden", !host.doc().showHidden); host.refresh(); return true; }
    return false;
  }

  function draftActions() {
    const draft=state.draft;
    if(!draft)return null;
    const points=draft.points || [];
    const boundary=['crop','brokenout'].includes(draft.kind);
    const coords=point=>boundary?[point.u,point.v]:[point.x,point.y];
    const distinct=points.filter((point,index)=>points.slice(0,index).every(p=>Math.hypot(coords(p)[0]-coords(point)[0],coords(p)[1]-coords(point)[1])>1e-8));
    const finishable=draft.kind==='primitive' && draft.type==='polyline';
    return {kind:draft.kind,type:draft.type || '',pointCount:points.length,canFinish:boundary?distinct.length>=3:finishable && distinct.length>=2};
  }
  function finishDraft() {
    const actions=draftActions();
    if(!actions?.canFinish)return false;
    return keyDown({key:'Enter'});
  }
  function cancelDraft() {
    if(!draftActions())return false;
    return keyDown({key:'Escape'});
  }
  return {
    deleteSelection, autoComponentBalloons, addView, duplicateSelectedView, addHoleCallouts,
    insertModelItems, autoDimension, setSheetOption, relayout, keyDown, draftActions, finishDraft,
    cancelDraft,
  };
}

export { drawingAutoDimensions, drawingZoomAndCommands };

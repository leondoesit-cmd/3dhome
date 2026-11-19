/* The drawing controller's dimension placement, layout drags and pointer
   handling, lifted out of createDrawingController, split out of
   js/modeler_drawing.js. It shares the editor's state through live imports from
   ../modeler_drawing.js. */
import { edgeAngleRefs, effectiveViewSource, hasHostDimensionReference, measureDim, projectedDimensionBinding, resolveDimAnchor, sheetPaper } from "../cad_sheet.js";
import { canAlignedSectionParent } from "../core/drawing_aligned_section.js";
import { canBreakOutView } from "../core/drawing_broken_out.js";
import { canCropView } from "../core/drawing_crop.js";
import { DRAWING_PRIMITIVE_TOOLS, snapDrawingPrimitivePoint } from "../core/drawing_primitives.js";
import { isOrthoView } from "../core/hidden_line.js";
import { num } from "../modeler_drawing.js";

// lifted out of createDrawingController()
function drawingDimensionsAndDrags(
  host, projectionFor, state, dimRef, touchPointers, toSheetMm, editPaperImage, invalidateLayout,
  scene, pointNearBox, hitTest, createAuxiliary, commitPrimitive, snapAt, bindAnchor, previewDim,
  placeNote, invalidate, commitAlternatePosition, commitBreak,
) {
  function signedOffset(a, b, cursor) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    return (cursor.x - a.x) * normal.x + (cursor.y - a.y) * normal.y;
  }

  /* One dimension onto the paper. No undo of its own: a run places several and
     the whole run is one step (see the run tools), so the step is opened by
     whoever owns the gesture. */
  function pushDim(dim) {
    const doc = host.doc();
    const view = doc.views.find(entry => entry.id === dim.viewId);
    const source = effectiveViewSource(doc, view);
    if (source || (doc.assemblyLayout && !hasHostDimensionReference(dim))) {
      // Without a persistent topology ID, only a matching projected snap can
      // vouch for the measurement after the live assembly or its view moves.
      dim.sourceBinding = projectedDimensionBinding(dim, source, projectionFor(view));
    }
    doc.dims.push(Object.assign({ id: "d" + Math.random().toString(36).slice(2, 9) }, dim));
    const placed = doc.dims[doc.dims.length - 1];
    state.selection = { kind: "dim", id: placed.id };
    host.markDirty();
    return placed;
  }

  function commitDim(dim) {
    host.pushUndo(host.t("opAddDim"));
    state.draft = null;
    return pushDim(dim);
  }

  /* Baseline and chain: a run of features dimensioned from one datum, or end to
     end. Each member is an ordinary dimension — bound on its own, dangling on
     its own, dragged on its own — and the only thing the run adds is WHERE the
     next line sits, which is the sheet's existing signed offset stepped
     outwards. A run holds ONE direction, taken from its first span: a baseline
     that changes axis halfway is not a baseline, it is two of them. */
  const RUN_BASE = { horizontal: -12, vertical: 12 };   // the sides autoDimension uses
  const RUN_STEP = 8;

  function runPick(mode, snap, place) {
    const ref = dimRef(place, snap.model);
    const run = state.draft?.kind === "run" && state.draft.mode === mode && state.draft.viewId === snap.viewId
      ? state.draft : null;
    if (!run) {
      state.draft = { kind: "run", mode, viewId: snap.viewId, refs: [ref], count: 0, type: null, pushed: false };
      return;
    }
    const from = mode === "baseline" ? run.refs[0] : run.refs[run.refs.length - 1];
    const type = run.type || (Math.abs(ref.u - from.u) >= Math.abs(ref.v - from.v) ? "horizontal" : "vertical");
    const span = type === "horizontal" ? Math.abs(ref.u - from.u) : Math.abs(ref.v - from.v);
    /* A pick that adds no distance would put a "0" on the paper. */
    if (!(span > 1e-9)) { host.flash(host.t("drawRunFlat")); return; }
    run.type = type;
    if (!run.pushed) { host.pushUndo(host.t("opAddDimRun")); run.pushed = true; }
    const base = RUN_BASE[type];
    const offset = base + Math.sign(base) * (mode === "baseline" ? run.count * RUN_STEP : 0);
    pushDim({ type, viewId: run.viewId, refs: [from, ref], offset });
    run.refs.push(ref);
    run.count += 1;
  }

  /* ---- layout drags ------------------------------------------------------ */

  /* Moving a view, a dimension or a note is one edit, however many pointermoves
     it took. So the step is opened while the document is still untouched and
     named on pointerup — the same begin/commit gesture the plan drags use (see
     beginHistory/commitPending in history.js) rather than a push per frame.

     A gesture that goes nowhere leaves no step: the pre-drag values are put
     back from state.drag and the provisional node is dropped. Restoring here
     rather than through the history's own rollback matters because EVERY click
     on a view opens a drag — a snapshot restore and a full document rebuild per
     click would be the cure being worse than the disease. */
  function beginLayout(label) { if (host.beginUndo) host.beginUndo(host.t(label)); state.drag.label = label; }

  /* @returns true if the document actually moved back, so a plain click — a
     drag that never had a pointermove — does not throw the scene away. */
  function restoreLayout(drag) {
    const doc = host.doc();
    const target = drag.mode === "view" ? doc.views.find((entry) => entry.id === drag.id)
      : drag.mode === "note" ? (doc.notes || []).find((entry) => entry.id === drag.id)
        : (doc.dims || []).find((entry) => entry.id === drag.id);
    if (!target) return false;
    const raw = drag.raw || {};
    if(drag.balloon){const changed=target.dx!==raw.dx||target.dy!==raw.dy||target.autoBalloon!==raw.autoBalloon;target.dx=raw.dx;target.dy=raw.dy;target.autoBalloon=raw.autoBalloon;if(changed)state.scene=null;return changed;}
    const was = drag.mode === "dim" ? [target.offset, target.angle] : [target.x, target.y];
    if (drag.mode === "dim") { target.offset = raw.offset; target.angle = raw.angle; }
    else { target.x = raw.x; target.y = raw.y; }
    const now = drag.mode === "dim" ? [target.offset, target.angle] : [target.x, target.y];
    if (was[0] === now[0] && was[1] === now[1]) return false;
    state.scene = null;
    return true;
  }

  function commitLayout(drag) { if (host.commitUndo) host.commitUndo(drag.label ? host.t(drag.label) : ""); }

  function cancelLayout(drag) {
    const moved = restoreLayout(drag);
    if (host.cancelUndo) host.cancelUndo();
    return moved;
  }

  /* ---- pointer ----------------------------------------------------------- */

  function beginPinch() {
    if (state.pinching) return;
    state.pinching = true;
    const drag = state.drag;
    if (drag && ["view", "dim", "note"].includes(drag.mode)) cancelLayout(drag);
    state.drag = null;
    state.draft = null;
    state.snap = null;
    host.refresh();
  }

  function endPinch() {
    state.pinching = false;
    touchPointers.clear();
    state.drag = null;
  }

  function pointerDown(event, x, y) {
    if (event.pointerType === "touch" && event.pointerId != null) {
      touchPointers.add(event.pointerId);
      if (touchPointers.size > 1) beginPinch();
    }
    if (state.pinching) return true;
    const sheetPoint = toSheetMm(x, y);
    state.cursor = sheetPoint;
    if(['insertimage','insertprojectimage','editimage','removeimage'].includes(state.tool)&&event.button===0&&!event.altKey&&!event.spaceKey) {
      const hit=[...(host.doc().images||[])].reverse().find(i=>sheetPoint.x>=i.x&&sheetPoint.x<=i.x+i.w&&sheetPoint.y>=i.y&&sheetPoint.y<=i.y+i.h);
      if(state.tool==='insertimage')editPaperImage(null,sheetPoint);
      else if(state.tool==='insertprojectimage')editPaperImage(null,sheetPoint,true);
      else if(!hit)host.flash('Click an inserted drawing image');
      else if(state.tool==='removeimage') {host.pushUndo('Remove drawing image');const doc=host.doc();doc.images=doc.images.filter(i=>i.id!==hit.id);invalidateLayout();host.markDirty();host.refresh();}
      else editPaperImage(hit,sheetPoint);
      return true;
    }
    const geometryOnly=['dim','diam','angle','baseline','chain','auxiliary'].includes(state.tool) && event.button===0
      && scene().views.find(place=>host.canUseTopologyForView?.(place.view)===false
        && (!host.viewSourceForeign?.(place.view) || state.tool==='auxiliary') && pointNearBox(sheetPoint,place.box,6));
    if(geometryOnly) {
      host.flash(host.topologyRefusal?.(geometryOnly.view) || 'Named configuration views support native geometry only; associative tools require per-view topology');return true;
    }
    if(state.tool==='alignedsection' && event.button===0 && !event.altKey && !event.spaceKey) {
      const doc=host.doc(),built=scene(),draft=state.draft;
      const hit=draft?.kind==='alignedsection'?{id:draft.viewId}:hitTest(sheetPoint);
      const place=built.views.find(p=>p.id===hit?.id),parent=doc.views.find(v=>v.id===place?.id);
      if(!place?.projection || !canAlignedSectionParent(parent) || host.isExplodedView?.(parent)) {host.flash('Aligned Section needs an ordinary principal edge view');return true;}
      if(draft?.kind==='alignedsection') {
        if(draft.points.length<3)draft.points.push(place.toModel(sheetPoint));
      } else state.draft={kind:'alignedsection',viewId:place.id,points:[place.toModel(sheetPoint)],token:host.bodiesToken(),fingerprint:JSON.stringify(parent)};
      host.flash('Pick endpoint A, common hinge, endpoint B; Enter unfolds the two cut faces; Escape cancels');host.refresh();return true;
    }
    if(state.tool==='auxiliary' && event.button===0 && !event.altKey) {
      const edge=straightEdgeAt(sheetPoint);
      if(edge)createAuxiliary(edge);
      else host.flash('Choose a named straight inclined edge in a principal view');
      return true;
    }
    const panning = event.button === 1 || event.button === 2 || event.altKey || event.spaceKey;
    if (panning) {
      state.drag = { mode: "pan", x, y, ox: state.ox, oy: state.oy };
      return true;
    }
    if(!DRAWING_PRIMITIVE_TOOLS[state.tool] && !['note','break','unbreak'].includes(state.tool)
      && scene().views.some(place=>place.projection?.breakMap && pointNearBox(sheetPoint,place.box,0) && !place.toModel(sheetPoint))) {
      host.flash('The Break gap contains no model geometry');return true;
    }
    if (DRAWING_PRIMITIVE_TOOLS[state.tool]) {
      const type=DRAWING_PRIMITIVE_TOOLS[state.tool];
      const previous=state.draft?.kind==='primitive'?state.draft.points.at(-1):null;
      const point=snapDrawingPrimitivePoint(sheetPoint,host.doc().primitives.concat(state.draft?.kind==='primitive'?[state.draft]:[]),4/state.zoom,previous,event.shiftKey,event.ctrlKey||event.metaKey);
      state.cursor=point;
      const paper=sheetPaper(host.doc());
      if(point.x<0||point.y<0||point.x>paper.w||point.y>paper.h){host.flash('Choose a point inside the paper');return true;}
      if(state.draft?.kind!=='primitive')state.draft={kind:'primitive',type,points:[point]};
      else {
        if(Math.hypot(point.x-previous.x,point.y-previous.y)<1e-8)return true;
        if(type==='arc' || type==='ellipse') {
          state.draft.points=state.draft.points.slice(0,2).concat(point);
          if(state.draft.points.length===3)commitPrimitive(state.draft);
        }
        else if(type==='polyline')state.draft.points.push(point);
        else state.draft.points=[state.draft.points[0],point];
        if(type!=='polyline' && type!=='arc' && type!=='ellipse')commitPrimitive(state.draft);
        else if(type==='polyline' && state.draft.points.length>3 && Math.hypot(point.x-state.draft.points[0].x,point.y-state.draft.points[0].y)<1e-8)commitPrimitive(state.draft);
      }
      host.refresh();return true;
    }
    if (state.tool === "dim" || state.tool === "diam" || state.tool === "angle") {
      const snap = snapAt(sheetPoint);
      if (state.tool === "angle") {
        const edge=straightEdgeAt(sheetPoint);
        if (edge && (!snap || snap.kind === "mid" || state.draft?.kind === "edge-angle")) {
          if(state.draft?.kind!=="edge-angle" || state.draft.viewId!==edge.viewId) {
            state.draft={kind:"edge-angle",viewId:edge.viewId,edgeRefs:edge.refs};
            host.flash("Select a second straight edge for the angle");
          } else {
            const edgeRefs=state.draft.edgeRefs.concat(edge.refs),refs=edgeAngleRefs(edgeRefs);
            if(!refs){host.flash("Choose two non-parallel straight edges");return true;}
            const nearest=Math.min(...edgeRefs.map(p=>Math.hypot(p.u-refs[1].u,p.v-refs[1].v)))*edge.k;
            commitDim({type:"angle",viewId:edge.viewId,refs,edgeRefs,offset:Math.max(12,nearest+8)});
          }
          host.refresh();return true;
        }
        if (!snap) { host.flash(host.t("drawSnapNone")); return true; }
        /* Arm, corner, arm — three picks, each bound on its own, in the order
           an angle is read (∠ABC). The corner is refs[1] because that is where
           measureDim and dimensionItems put the vertex. */
        if (!state.draft || state.draft.kind !== "dim" || state.draft.dimType !== "angle" || state.draft.viewId !== snap.viewId) {
          state.draft = { kind: "dim", dimType: "angle", viewId: snap.viewId, refs: [dimRef(snap.place, snap.model)] };
        } else {
          state.draft.refs.push(dimRef(snap.place, snap.model));
          if (state.draft.refs.length >= 3) {
            const refs = state.draft.refs.slice(0, 3);
            const measure = measureDim({ type: "angle", refs });
            /* Three points on one line, or a pick repeated, measure nothing —
               committing that would put a "0°" on the paper. */
            if (!(measure > 1e-6)) { state.draft = null; host.flash(host.t("drawAngleFlat")); host.refresh(); return true; }
            commitDim({ type: "angle", viewId: state.draft.viewId, refs, offset: 12 });
          }
        }
        host.refresh();
        return true;
      }
      if (state.tool === "diam") {
        const round = circleAt(sheetPoint);
        if (round) {
          /* A hole's size is the one number on a drawing most likely to be
             edited later, so it binds to the rim's own id when there is one. */
          const bound = round.anchor || bindAnchor(round.place, round.circle);
          commitDim({
            type: round.circle.kind === "round" ? "diameter" : "radius",
            viewId: round.viewId,
            refs: [bound && bound.at === "centre" ? bound : { u: round.circle.u, v: round.circle.v }],
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
        state.draft = { kind: "dim", viewId: snap.viewId, refs: [dimRef(snap.place, snap.model)], aligned: event.shiftKey };
      } else {
        state.draft.refs.push(dimRef(snap.place, snap.model));
        state.draft.aligned = event.shiftKey;
      }
      host.refresh();
      return true;
    }
    if (state.tool === "baseline" || state.tool === "chain") {
      const snap = snapAt(sheetPoint);
      if (!snap) { host.flash(host.t("drawSnapNone")); return true; }
      runPick(state.tool, snap, snap.place);
      host.refresh();
      return true;
    }
    if (state.tool === "note") {
      const snap = snapAt(sheetPoint);
      state.draft = { kind: "note", viewId: snap?.viewId || null, anchor: snap ? { u: snap.model.u, v: snap.model.v } : null, at: sheetPoint };
      placeNote(state.draft);
      return true;
    }
    if(state.tool==='alternateposition' || state.tool==='removealternateposition') {
      const hit=hitTest(sheetPoint),place=scene().views.find(p=>p.id===(hit?.kind==='view'?hit.id:null));
      if(!place){host.flash('Choose the drawing view');return true;}
      if(state.tool==='removealternateposition') {
        if(place.view.alternatePosition){host.pushUndo('Remove Alternate Position');const live=host.doc().views.find(v=>v.id===place.id);if(live)live.alternatePosition=null;invalidate();host.markDirty();host.refresh();}
      } else commitAlternatePosition(place);
      return true;
    }
    if(state.tool==='break' || state.tool==='unbreak') {
      const hit=hitTest(sheetPoint),place=scene().views.find(p=>p.id===(hit?.kind==='view'?hit.id:null));
      if(!place){host.flash('Choose the drawing view');return true;}
      if(state.tool==='unbreak') {
        if(place.view.breakView){host.pushUndo('Remove Break');const group=place.view.breakView.group;for(const v of host.doc().views)if(v.id===place.id || (group && v.breakView?.group?.id===group.id))v.breakView=null;invalidate();host.markDirty();host.refresh();}
      } else commitBreak(place);
      return true;
    }
    if(['crop','uncrop','brokenout','unbrokenout'].includes(state.tool)) {
      const doc=host.doc();
      if(['crop','brokenout'].includes(state.draft?.kind)) {
        const place=scene().views.find(p=>p.id===state.draft.viewId);
        if(place && state.draft.points.length<64) {
          const point=place.toModel(sheetPoint),last=state.draft.points.at(-1);
          if(!last || Math.hypot(point.u-last.u,point.v-last.v)>1e-8)state.draft.points.push(point);
        }
        host.refresh();return true;
      }
      const hit=hitTest(sheetPoint),place=scene().views.find(p=>p.id===(hit?.kind==='view'?hit.id:null));
      if(!place || (!['uncrop','unbrokenout'].includes(state.tool) && !place.projection)) {host.flash('Choose a projected drawing view');return true;}
      if(state.tool==='uncrop'||state.tool==='unbrokenout') {
        const view=doc.views.find(v=>v.id===place.id);
        const key=state.tool==='uncrop'?'cropSketch':'brokenOut';
        if(view?.[key]) {
          host.pushUndo(state.tool==='uncrop'?'Remove crop':'Remove broken-out');
          const live=host.doc().views.find(v=>v.id===place.id);
          if(live)live[key]=null;
          invalidate();host.markDirty();host.refresh();
        }
        return true;
      }
      if(state.tool==='brokenout') {
        if(!canBreakOutView(place.view,{exploded:!!host.isExplodedView?.(place.view)})) {host.flash('Broken-out needs an ordinary orthographic edge view without Crop, Section or Detail');return true;}
        state.draft={kind:'brokenout',viewId:place.id,points:[place.toModel(sheetPoint)]};
        host.flash('Tap boundary points, then Finish boundary to choose removal depth in mm (Enter also works)');host.refresh();return true;
      }
      if(!canCropView(place.view,doc,{exploded:!!host.isExplodedView?.(place.view)})) {host.flash('Crop cannot use a Detail, a Detail parent or an exploded view');return true;}
      state.draft={kind:'crop',viewId:place.id,points:[place.toModel(sheetPoint)]};
      host.flash('Tap at least three boundary points, then Finish boundary (Enter also works); Cancel discards');
      host.refresh();return true;
    }
    if (state.tool === "section" || state.tool === "detail") {
      const hit = hitTest(sheetPoint);
      const built = scene();
      const place = built.views.find((entry) => entry.id === (hit?.kind === "view" ? hit.id : null));
      if (!place?.projection || place.view.breakView || place.view.brokenOut || place.view.alignedSection || (state.tool === "section" && (!isOrthoView(place.view.dir) || place.view.detail))) {
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
        /* Cancel restores what the DOCUMENT held, which is not startX/startY: a
           view that has never been dragged carries null ("wherever the layout
           puts me"), and writing the laid-out number back would quietly pin
           it. */
        raw: { x: view.x, y: view.y },
      };
      beginLayout("opMoveView");
    } else if (hit?.kind === "dim") {
      const dim = host.doc().dims.find((entry) => entry.id === hit.id);
      state.drag = { mode: "dim", id: hit.id, x, y, offset: num(dim.offset, 10), angle: num(dim.angle, -Math.PI / 4),
        raw: { offset: dim.offset, angle: dim.angle } };
      beginLayout("opMoveDim");
    } else if (hit?.kind === "note") {
      const note = host.doc().notes.find((entry) => entry.id === hit.id);
      const live=scene().notes.get(note.id)?.note || note;
      state.drag = { mode: "note", id: hit.id, x, y, balloon:!!note.balloon,
        startX: note.balloon?num(live.dx,14):num(note.x), startY: note.balloon?num(live.dy,-12):num(note.y),
        raw: note.balloon?{dx:note.dx,dy:note.dy,autoBalloon:note.autoBalloon}:{ x: note.x, y: note.y } };
      beginLayout("opMoveNote");
    } else {
      state.drag = { mode: "pan", x, y, ox: state.ox, oy: state.oy };
    }
    host.refresh();
    return true;
  }

  function straightEdgeAt(sheetPoint) {
    const built=scene();let best=null;
    for(const place of built.views) {
      if(!pointNearBox(sheetPoint,place.box,6))continue;
      if(place.projection?.nonlinearProjection || host.canUseTopologyForView?.(place.view)===false)continue;
      for(const [pid,entry] of built.topologyIndex || []) {
        if(entry.kind!=="edge" || entry.descriptor?.curve!=="line")continue;
        const refs=["a","b"].map(at=>({pid,kind:"edge",at,...resolveDimAnchor({pid,kind:"edge",at},built.topologyIndex,place.projection?.basis)}));
        if(!refs.every(p=>Number.isFinite(p.u)&&Number.isFinite(p.v)))continue;
        const a=place.toSheet(refs[0]),b=place.toSheet(refs[1]),dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
        if(l<1e-10)continue;
        const t=Math.max(0,Math.min(1,((sheetPoint.x-a.x)*dx+(sheetPoint.y-a.y)*dy)/l));
        if(t<.04||t>.96)continue;
        const distance=Math.hypot(sheetPoint.x-a.x-t*dx,sheetPoint.y-a.y-t*dy);
        if(distance<6/state.zoom&&(!best||distance<best.distance))best={viewId:place.id,k:place.k,refs,distance};
      }
    }
    return best;
  }

  function circleAt(sheetPoint) {
    const built = scene();
    const reach = 6 / state.zoom;
    for (const place of built.views) {
      if (!pointNearBox(sheetPoint, place.box, 6)) continue;
      const basis=place.projection?.basis;
      // A mesh can fit a complete circle to a visible semicircular notch.
      // Prefer the exact trimmed edge so its callout is a bound radius.
      if (basis && built.topologyIndex && !place.projection?.nonlinearProjection && host.canUseTopologyForView?.(place.view)!==false) {
        const project=(p)=>({u:p.x*basis.right.x+p.y*basis.right.y+p.z*basis.right.z,v:p.x*basis.up.x+p.y*basis.up.y+p.z*basis.up.z});
        const turn=(a)=>(a+Math.PI*4)%(Math.PI*2);
        for(const [pid,entry] of built.topologyIndex) {
          const d=entry.descriptor || {},r=Number(d.radius),axis=d.axis;
          if(entry.kind!=="edge" || d.curve!=="circle" || !(r>0) || !d.origin || !d.arcMidpoint || d.endpoints?.length!==2) continue;
          if(!(d.measure>0 && d.measure<2*Math.PI*r-r*1e-5)) continue;
          if(!axis || Math.abs(axis.x*basis.forward.x+axis.y*basis.forward.y+axis.z*basis.forward.z)<.999) continue;
          const centre=project(d.origin),screen=place.toSheet(centre);
          const du=(sheetPoint.x-screen.x)/place.k,dv=-(sheetPoint.y-screen.y)/place.k;
          if(Math.abs(Math.hypot(du,dv)-r)*place.k>=reach) continue;
          const angle=(p)=>Math.atan2(p.v-centre.v,p.u-centre.u);
          const start=angle(project(d.endpoints[0])),end=angle(project(d.endpoints[1])),mid=angle(project(d.arcMidpoint));
          const span=turn(end-start),offset=turn(Math.atan2(dv,du)-start);
          const containsMid=turn(mid-start)<=span;
          if(containsMid ? offset>span+1e-6 : offset<span-1e-6) continue;
          return {viewId:place.id,place,circle:{...centre,radius:r,kind:"arc"},anchor:{pid,kind:"edge",at:"centre",...centre}};
        }
      }
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
  return { signedOffset, commitLayout, cancelLayout, beginPinch, endPinch, pointerDown };
}

export { drawingDimensionsAndDrags };

/* The plan view's pointerDown: what a press starts for every tool, lifted out
   of initInteraction, split out of js/interaction.js. It shares the editor's
   state through live imports from ../interaction.js. */
import { executeCommand, openingPlaceCommand } from "../commands/index.js";
import { hitWarning } from "../constraint_engine.js";
import { elevItemGrab, elevOpeningGrab, elevPick, elevWallAt, elevationHit } from "../elevation.js";
import { hiddenSets, itemsInRoom, roomByKey, wallById, wallGeom, wallProject } from "../geometry.js";
import { armHistoryGesture, beginHistory, captureHistorySession, prepareHistoryGesture, pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { hitItem, hitNode, hitOpening, hitRoom, hitWall, planPickSurface, tolCm } from "../interaction/hit_test.js";
import { beginMEPDrag, commitPaintWall, commitRectFromTo, commitRoute, finishDraw, handleBreakClick, handleJoinClick, handleOffsetClick, handleReverseClick, setTool, wallPoint } from "../interaction/mep_tools.js";
import { arcWallPoint, commitRoomStamp, commitSlabFromTo, disarmRoomStamp, pickRoomEdge, roomEdgeLimit, updateRoomGhost } from "../interaction/room_tools.js";
import { agentCommandEnvironment, blockedDrag, endConPick, finishConPick, pickErase, wallHalfAt } from "../interaction/wall_edit.js";
import { snapPoint, snapWallPoint } from "../interaction/wall_snap.js";
import { canDrag, layerRank } from "../layers.js";
import { addMarker, hitMarker } from "../markers.js";
import { addNode, ensureMEP, hitMEP, snapMEPPoint, wallPath } from "../mep.js";
import { openingDrawDefaults } from "../opening_draw_defaults.js";
import { dropPoint, plan, render2D } from "../plan2d.js";
import { inputBounds, inputIs3D, inputScale, wx, wz } from "../planner_input.js";
import { hitSlabOpening } from "../slab_openings.js";
import { S, WALL_H, clamp, fin, uid } from "../state.js";
import { planTouchPrecisionKind } from "../touch_precision.js";
import { syncWallEnd } from "../ui_props.js";
import { renderWarnPanel, syncWarnHighlight } from "../ui_warn.js";
import { flash, placeFurnAt, refreshTree, select } from "../ui.js";
import { itemUserUnpickable } from "../user_layers.js";
import {
  armDragProxy, beginSnapSession, interactionLocals, isElevation, pickCon,
  setPickSlop,
} from "../interaction.js";

// lifted out of initInteraction()
function pointerDown(e) {
  interactionLocals.gestureSession = null;
  armHistoryGesture(() => { interactionLocals.gestureSession = captureHistorySession(); });
  setPickSlop(e.pointerType);
  /* Open a snap session for the gesture. It pins which layers may contribute
     candidates (see beginSnapSession) so a panel toggled mid-drag cannot
     change what the drag snaps to, and it gives the index one build to serve
     the whole gesture's hit tests and pointermoves. endAction closes it. */
  beginSnapSession();
  if(e.isTrusted)plan.setPointerCapture(e.pointerId);
  var r = inputBounds(plan);
  var ox = e.clientX - r.left;
  var oy = e.clientY - r.top;

  // CAD-standard navigation temporarily wins over every editing tool. A
  // middle drag or Space+left drag pans without changing the active tool.
  if (e.button === 1 || (interactionLocals.spacePan && e.button === 0)) {
    e.preventDefault();
    S.action = "pan";
    S.panStart = { ox: S.OX, oy: S.OY, px: ox, py: oy };
    plan.classList.add("is-panning");
    return;
  }

  /* Elevation views: wall drawing stays in the plan, but items, openings and
     placeholder points are edited in the two axes the elevation can see
     (along the facade, and height). */
  if (isElevation()) {
    if (S.tool === "erase") {
      if (e.button === 2) { setTool("select"); return; }
      ;(0, interactionLocals.beginEraseStroke)();
      S.action = "erase";
      var eh = elevationHit(ox, oy);
      if (eh && eh.kind !== "room") (0, interactionLocals.strokeErase)(eh);
      return;
    }
    if (S.tool === "wall" || S.tool === "arcwall") {
      setTool("select");
    }
    if (S.tool === "point") {
      if (e.button === 2) { setTool("select"); render2D(); return; }
      var ep = elevPick(ox, oy);
      if (!ep) { flash(t("f_placeFail"), "error"); return; }
      pushHistory();
      var emk = addMarker(ep);
      if (!emk) { flash(t("f_placeFail"), "error"); return; }
      S.markerPreview = null;
      select({ kind: "marker", ref: emk });
      render2D();
      refreshTree();
      return;
    }
    if (S.tool === "door" || S.tool === "window" || S.tool === "passage") {
      var ewh = elevWallAt(ox, oy, true);
      if (!ewh) return;
      var elevationTool = S.tool, edd = openingDrawDefaults(elevationTool), sill = edd.sill;
      if (S.tool === "window" && isFinite(ewh.v))
        sill = Math.max(0, Math.round(ewh.v - edd.height / 2));
      sill = clamp(sill, 0, Math.max(0, (ewh.w.height || WALL_H) - edd.height));
      var elevationResult = executeCommand(openingPlaceCommand, {
        wallId: ewh.w.id, type: elevationTool, s: ewh.s,
        width: edd.width, height: edd.height, sill: sill,
      }, agentCommandEnvironment(), {
        label: t("f_openingPlaced", { name: t(elevationTool) }),
        presentation: { selectCreated: true, switchToolTo: "select" },
      });
      if (!elevationResult.ok) flash(t("opening_need_wall"), "error");
      return;
    }
    var eh = elevationHit(ox, oy);
    select(eh || null);
    /* Selection is unconditional; the GESTURE is not. An elevation obeys the
       same rule as the plan — a hit on a layer that is visible but off the
       work set, on a locked layer, or on a pinned object fills the inspector
       and stops there, so reading a wall's opening while furnishing can
       never slide it by accident. */
    if (eh && e.button !== 2) {
      if (!canDrag(eh)) {
        blockedDrag(eh);
      } else if (eh.kind === "marker") {
        S.action = "markerElev";
        beginHistory();
      } else if (eh.kind === "item") {
        S.action = "itemElev";
        S.elevGrab = elevItemGrab(eh.ref, ox, oy);
        beginHistory();
      } else if (eh.kind === "opening") {
        S.action = "openingElev";
        S.elevGrab = elevOpeningGrab(eh.ref, ox, oy);
        beginHistory();
      }
    }
    render2D();
    return;
  }

  if (e.pointerType === "touch") {
    S.touchDrag = true; // gates the snap haptic to actual finger drags
    if (!Object.keys(interactionLocals.pointers).length) interactionLocals.preTouchSel = S.sel;
    interactionLocals.pointers[e.pointerId] = { x: ox, y: oy };
    if (Object.keys(interactionLocals.pointers).length >= 2) {
      (0, interactionLocals.cancelLongPress)(); // a second finger is a pinch, never a menu
      (0, interactionLocals.armTwoTap)();
      (0, interactionLocals.beginPinch)();
      return;
    }
    // Only the select tool has a contextual menu; while a tool is drawing,
    // a long press is just a slow first click.
    if (!S.tool || S.tool === "select") (0, interactionLocals.armLongPress)(e);
  }
  if (e.pointerType === "touch" && planTouchPrecisionKind(S.tool, S.placeType) && (0, interactionLocals.beginPlanPrecisionTrial)(e, ox, oy))
    return;
  var precisionPoint = (0, interactionLocals.planPrecisionPoint)(e, ox, oy, r, true);
  var px = wx(precisionPoint.x, precisionPoint.y),
    pz = wz(precisionPoint.x, precisionPoint.y);

  /* Picking the OTHER side of a new dimension. Armed from the wall
     inspector, it swallows exactly one click and then disarms — a modal
     state that outlives its own gesture is how an editor starts feeling
     possessed. Right-click (or Escape, handled with the other keys) cancels. */
  if (S.conPick) {
    if (e.button === 2) {
      endConPick(null);
      return;
    }
    finishConPick(px, pz);
    return;
  }

  /* Host-based creation must hit the wall/item under the finger exactly, so
     it uses no offset. Touch waits for release, however: the held frame can
     show the magnified host and the user can slide to refine before commit. */
  if (e.pointerType === "touch" && S.touchContact && S.touchContact.kind === "lens" &&
      (S.placeType || S.tool === "door" || S.tool === "window" || S.tool === "passage")) {
    interactionLocals.touchHostPlacement = {
      pointerId: e.pointerId,
      tool: S.tool,
      placeType: S.placeType,
    };
    render2D();
    return;
  }

  if (S.tool === "wall") {
    if (e.button === 2) {
      if (S.drawing) prepareHistoryGesture();
      finishDraw();
      return;
    }
    if (S.drawing && S.measureTarget === "manual" && e.shiftKey) {
      var mw = hitWall(px, pz);
      if (mw) {
        var mi = S.measureWalls.indexOf(mw.id);
        if (mi === -1) S.measureWalls.push(mw.id);
        else S.measureWalls.splice(mi, 1);
        render2D();
      }
      return;
    }
    if (!S.drawing && (e.altKey || e.metaKey)) {
      var paintHost = hitWall(px, pz);
      if (paintHost) { commitPaintWall(paintHost); return; }
    }
    /* First segment supports Chief Architect's press-drag-release gesture.
       A stationary press remains the familiar first click of click-click
       placement; endAction commits only when the pointer actually travelled. */
    var wasDrawing = S.drawing;
    // A continued first segment can change topology without another push.
    prepareHistoryGesture();
    wallPoint(snapWallPoint(px, pz, S.drawFrom));
    if (!wasDrawing && S.drawing)
      S.wallPress = { pointerId: e.pointerId, x: ox, y: oy };
    return;
  }
  if (S.tool === "walloffset") {
    if (e.button === 2) { S.offsetDraft = null; S.previewPt = null; render2D(); return; }
    handleOffsetClick(px, pz);
    return;
  }
  if (S.tool === "wallbreak") {
    if (e.button === 2) { setTool("select"); return; }
    handleBreakClick(px, pz);
    return;
  }
  if (S.tool === "wallbite") {
    if (e.button === 2) { S.biteDraft = null; setTool("select"); render2D(); return; }
    var bw = hitWall(px, pz);
    var bp = bw && wallProject(bw, px, pz);
    if (!bw || !bp) { flash(t("wd_bite_need")); return; }
    S.biteDraft = { wall: bw.id, s0: bp.s, s1: bp.s };
    S.action = "wallbite";
    render2D();
    return;
  }
  if (S.tool === "walljoin") {
    if (e.button === 2) { S.joinPick = null; setTool("select"); return; }
    handleJoinClick(px, pz);
    return;
  }
  if (S.tool === "wallreverse") {
    if (e.button === 2) { setTool("select"); return; }
    handleReverseClick(px, pz);
    return;
  }
  if (S.tool === "wallpaint") {
    if (e.button === 2) { setTool("select"); return; }
    var pw = hitWall(px, pz);
    if (pw) commitPaintWall(pw);
    else flash(t("wd_paint_need"));
    return;
  }
  if (S.tool === "erase") {
    if (e.button === 2) { setTool("select"); return; }
    ;(0, interactionLocals.beginEraseStroke)();
    S.action = "erase";
    (0, interactionLocals.strokeErase)(pickErase(px, pz, ox, oy));
    return;
  }
  if (S.tool === "arcwall") {
    if (e.button === 2) {
      S.arcDraft = null; S.previewPt = null; render2D();
      return;
    }
    arcWallPoint(snapPoint(px, pz, null));
    return;
  }
  if (S.tool === "rect") {
    if (e.button === 2) {
      S.rectDraft = null; S.previewPt = null; setTool("select"); render2D();
      return;
    }
    var rp = snapPoint(px, pz, null);
    if (!S.rectDraft) {
      S.rectDraft = { x: rp.x, z: rp.z };
      S.previewPt = { x: rp.x, z: rp.z };
      render2D();
      return;
    }
    if (commitRectFromTo(S.rectDraft, rp)) setTool("select");
    S.rectDraft = null;
    S.previewPt = null;
    render2D();
    return;
  }
  if (S.tool === "roomstamp") {
    if (e.button === 2) { disarmRoomStamp(); setTool("select"); render2D(); return; }
    updateRoomGhost(px, pz);
    commitRoomStamp();
    // the preset stays armed; the ghost follows the pointer to the next room
    updateRoomGhost(px, pz);
    render2D();
    return;
  }
  if (S.tool === "slabvoid") {
    if (e.button === 2) {
      S.rectDraft = null; S.previewPt = null; setTool("select"); render2D();
      return;
    }
    var sp = snapPoint(px, pz, null);
    if (!S.rectDraft) {
      S.rectDraft = { x: sp.x, z: sp.z };
      S.previewPt = { x: sp.x, z: sp.z };
      render2D();
      return;
    }
    if (commitSlabFromTo(S.rectDraft, sp)) setTool("select");
    S.rectDraft = null;
    S.previewPt = null;
    render2D();
    return;
  }
  if (S.tool === "annotation" && S.annotationDraft) {
    if (e.button === 2) { S.annotationDraft = null; setTool("select"); render2D(); return; }
    var draft = S.annotationDraft;
    var point = snapPoint(px, pz, null);
    if (!fin(point.x) || !fin(point.z)) return;
    if ((draft.kind === "dimension" || draft.kind === "section") && !draft.from) {
      draft.from = { x: point.x, z: point.z }; render2D(); return;
    }
    var start = draft.from || point;
    if (draft.from && Math.hypot(point.x - start.x, point.z - start.z) < 1) return;
    pushHistory();
    var annotation = { id: uid(), kind: draft.kind, x: start.x, z: start.z,
      ...(draft.from ? { x2: point.x, z2: point.z } : {}),
      ...(draft.text ? { text: draft.text } : {}), ...(draft.symbol ? { symbol: draft.symbol } : {}) };
    S.annotations.push(annotation);
    S.annotationDraft = null;
    setTool("select"); render2D();
    window.dispatchEvent(new CustomEvent("planner-annotation-created", { detail: { annotation } }));
    return;
  }
  if (S.placeType && (!S.tool || S.tool === "select")) {
    if (e.button === 2) {
      S.placeType = null;
      window.dispatchEvent(new CustomEvent("planner-place"));
      render2D();
      return;
    }
    placeFurnAt(S.placeType, px, pz);
    return;
  }
  if (S.tool === "door" || S.tool === "window" || S.tool === "passage") {
    if (e.button === 2) { setTool("select"); render2D(); return; }
    ;(0, interactionLocals.placeOpeningAt)(S.tool, px, pz);
    return;
  }

  /* Placeholder point: drop a measured spot on the plan. It goes through the
     same snapPoint the wall tool uses, so a point can be pinned exactly to a
     corner, to a spot on a wall, or to the grid — a point that is only
     roughly where you meant is not worth measuring from. The tool stays armed
     for rapid placement (Esc or right-click to stop), matching mepNode. */
  if (S.tool === "point") {
    if (e.button === 2) { setTool("select"); render2D(); return; }
    /* With the plan pane hidden the transform is all zeros and wx/wz hand
       back NaN, so this has to be resolved and CHECKED before anything is
       committed: a NaN point is invisible, unmeasurable, and still saves
       (as null) — the same trap dropPoint() was written for. Validating
       before pushHistory also keeps a refusal from leaving a no-op undo
       entry that would swallow the next Ctrl+Z. */
    var mp = snapPoint(px, pz, null);
    if (!fin(mp.x) || !fin(mp.z)) mp = dropPoint();
    if (!fin(mp.x) || !fin(mp.z)) {
      flash(t("f_placeFail"), "error");
      return;
    }
    pushHistory();
    // Plan points start at floor height; 3D picks retain the measured
    // surface height. Wall points also retain their host and facing side.
    var nm = addMarker(planPickSurface(mp, px, pz));
    if (!nm) return;
    S.markerPreview = null;
    S.snapGuides = [];
    select({ kind: "marker", ref: nm });
    render2D();
    refreshTree();
    return;
  }

  // MEP: place a device
  if (S.tool === "mepNode") {
    var m0 = ensureMEP();
    if (!m0.place) return;
    if (e.button === 2) { setTool("select"); render2D(); return; }
    pushHistory();
    var sp = snapMEPPoint(px, pz);
    var nn = addNode(m0.place.sys, m0.place.kind, sp.x, sp.z,
      sp.wall != null ? sp.wall : null, sp.s != null ? sp.s : null, m0.layer);
    select({ kind: "mepNode", ref: nn });
    S.dirty3D = true;
    render2D();
    refreshTree();
    return; // tool stays armed for rapid placement (Esc / select to stop)
  }
  // MEP: route a pipe/cable (click to add vertices; dbl-click/Enter/right-click to finish)
  if (S.tool === "mepRoute") {
    var m1 = ensureMEP();
    if (!m1.place) return;
    if (e.button === 2) { commitRoute(); return; }
    var rp = snapMEPPoint(px, pz);
    if (!m1.route) {
      m1.route = { sys: m1.place.sys, k: m1.place.kind, layer: m1.layer, pts: [{ x: rp.x, z: rp.z }], preview: null };
      m1.route.pts[0].wall = rp.wall;
      m1.route.pts[0].s = rp.s;
    } else if (m1.wallRoute) {
      // follow the walls between the last vertex and this click, the way the
      // chase/pipe actually gets cut, instead of flying straight across
      var lastPt = m1.route.pts[m1.route.pts.length - 1];
      var routed = wallPath(lastPt, rp, m1.layer);
      if (!routed) {
        flash(t("mep_doorBlocked"), "error");
        return;
      }
      routed.forEach(function (p) { m1.route.pts.push(p); });
    } else {
      m1.route.pts.push({ x: rp.x, z: rp.z });
    }
    render2D();
    return;
  }

  // select tool
  if (e.button === 2) {
    S.action = "pan";
    S.panStart = { ox: S.OX, oy: S.OY, px: e.offsetX, py: e.offsetY };
    return;
  }
  // Clear old transient state from projects saved before connected placement.
  S.freshWall = null;
  /* ---- the select-tool pick chain, run twice ----

     The chain below is the old one, unchanged in order, wrapped in a
     function that only tests the layers at ONE rank. It is then run at rank
     0 and, if nothing focused answered, at rank 1.

     That is the whole fix for "I clicked the TV and got the wall". The plan
     draws the wall band after the items, and every test used to scan
     everything in one pass, so whichever band happened to be checked first
     won regardless of what the user was doing. Now the layer being edited is
     consulted first as a group, and everything else only gets the click when
     the focused layers all missed. Nothing becomes unclickable: a rank-1 hit
     still selects and still fills the inspector — it just never arms a drag
     (see canDrag in js/layers.js), so an off-work-set wall is readable
     without being movable.

     Each gate is `layerRank(id) === pass`, which also disposes of rank
     Infinity for free: a ghosted or hidden layer equals neither 0 nor 1, so
     it is never reached in either pass, and no band is ever tested twice.

     ORDER WITHIN A PASS IS LOAD-BEARING and every step of it is explained
     where it sits. In short: MEP before items so a socket standing on
     furniture is still grabbable; dimension labels before corners and walls
     because a label is a small box drawn on top of everything; placeholder
     points before items and openings because a point is a ~12px target that
     is usually standing INSIDE the footprint of the thing it holds. Rooms
     are not in the chain at all — the floor swallows every click inside it,
     so it answers after BOTH passes (see runRoomPass below). */
  function runSelectPass(pass) {
    // MEP entities are selectable/draggable with the select tool (before items,
    // so a device sitting on furniture is still grabbable)
    if (layerRank("mep") === pass) {
      var hm = hitMEP(px, pz, inputScale());
      if (hm) {
        var msel = hm.kind === "mepRun" ? { kind: "mepRun", ref: hm.ref } : hm;
        select(msel);
        if (canDrag(msel)) beginMEPDrag(hm, px, pz);
        else {
          S.action = null;
          blockedDrag(msel);
        }
        render2D();
        return true;
      }
    }
    /* A dimension's own label is selectable, so a constraint can be edited,
       flipped, suppressed or deleted from the drawing instead of only from a
       list that is filtered by whichever wall happens to be selected. Tested
       against SCREEN coordinates, because that is where the labels were laid
       out, and against the boxes the renderer actually drew (see pickCon) so
       the target can never drift from the glyph.

       Deliberately BEFORE corners and walls: a label is a small box the user
       aimed at, and it is drawn on top of everything, so it must pick first or
       the thing underneath swallows every click on it. The pin's ring is the
       exception and carries its own offset tag for exactly this reason. */
    if (layerRank("annotations") === pass) {
      var hc = pickCon(e.offsetX, e.offsetY);
      if (hc) {
        select({ kind: "con", ref: hc });
        renderWarnPanel(true);
        render2D();
        return true;
      }
    }
    if (layerRank("structure") === pass) {
      var hn = hitNode(px, pz);
      if (hn != null) {
        /* Ctrl/Cmd (and Shift for parity with item selection) selects structural
           features without starting a drag. Two selected corners unlock the
           contextual Join/Distance/Align/Equal-angle palette in the inspector. */
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          var pickedNodes = S.sel && S.sel.kind === "nodes"
            ? S.sel.refs.slice()
            : S.sel && S.sel.kind === "node" ? [S.sel.ref] : [];
          var existingNode = pickedNodes.indexOf(hn);
          if (existingNode === -1) pickedNodes.push(hn);
          else pickedNodes.splice(existingNode, 1);
          /* No cap. It used to drop the oldest corner past two, which made the
             pair relations easy to reach and made everything that needs three
             or more — pinning a run of corners, equal spacing, "all of these on
             one line" — impossible to even select for. The pair-only verbs
             disable themselves when the count is wrong, which is the honest way
             round: the selection says what you picked, the palette says what
             can be done with it. */
          select(pickedNodes.length > 1
            ? { kind: "nodes", refs: pickedNodes }
            : pickedNodes.length === 1 ? { kind: "node", ref: pickedNodes[0] } : null);
          S.action = null;
          render2D();
          return true;
        }
        /* Picking a glowing corner also picks its warning, so the message list
           scrolls to it and highlights the same thing the canvas does. */
        var hwarn = hitWarning(px, pz, tolCm(14));
        /* Grabbing the END of the wall that is already selected resizes THAT wall
           alone: its neighbours hold their locked dimensions and simply release
           the joint (see js/constraint_engine.js). Grabbing a bare corner still
           moves the whole joint — the user took hold of the junction itself, so
           every wall on it is being edited on purpose. */
        var endOf =
          S.sel && S.sel.kind === "wall" &&
          (S.sel.ref.a === hn || S.sel.ref.b === hn)
            ? S.sel.ref
            : null;
        // grabbing the end of the wall you had selected keeps that wall selected:
        // the gesture is an edit OF that wall, not a pick of the junction
        if (!endOf) select({ kind: "node", ref: hn });
        S.warnSel = hwarn ? hwarn.key : null; // after select(), which clears it
        if (hwarn) syncWarnHighlight();
        /* Pick it, read it, but don't let a stray drag move it. canDrag asks
           three questions at once — is structure the work set, is the layer's
           padlock open (that IS S.lockStruct), and is the corner itself
           pinned — so the same call covers the rank-1 case and the L key. */
        var nodeSel = { kind: "node", ref: hn };
        if (canDrag(nodeSel)) {
          S.action = "node";
          S.nodeDrag = { node: hn, wall: endOf ? endOf.id : null };
          S.jointsReleased = 0;
          beginHistory();
        } else {
          S.action = null;
          blockedDrag(nodeSel);
        }
        render2D();
        return true;
      }
    }
    /* Placeholder points are picked before items and openings: a point is a
       ~12px target that is very often standing INSIDE the footprint of the
       object it holds, so anything with a larger hit area would bury it. */
    if (layerRank("annotations") === pass) {
      var hmk = hitMarker(px, pz, inputScale());
      if (hmk) {
        var mkSel = { kind: "marker", ref: hmk };
        select(mkSel);
        if (canDrag(mkSel)) {
          S.action = "marker";
          beginHistory();
          S.dragOff = { x: px - hmk.x, z: pz - hmk.z };
        } else {
          S.action = null;
          blockedDrag(mkSel);
        }
        render2D();
        return true;
      }
    }
    if (layerRank("structure") === pass) {
      var ho = hitOpening(px, pz);
      if (ho) {
        var opSel = { kind: "opening", ref: ho };
        select(opSel);
        if (!canDrag(opSel)) {
          S.action = null;
          blockedDrag(opSel);
          render2D();
          return true;
        }
        S.action = "opening";
        beginHistory();
        var w2 = wallById(ho.wall),
          gm2 = wallGeom(w2);
        S.dragOff.s = (px - gm2.a.x) * gm2.ux + (pz - gm2.a.z) * gm2.uz - ho.s;
        render2D();
        return true;
      }
    }
    if (layerRank("furniture") === pass) {
      var hi = hitItem(px, pz);
      if (hi) {
        var toSelect = [hi];
        if (hi.groupId) {
          var hid = hiddenSets();
          toSelect = S.items.filter(function(it) {
            return it.groupId === hi.groupId && !hid.items[it.id] && !itemUserUnpickable(it);
          });
        }

        if (e.shiftKey) {
          var cur = (S.sel && S.sel.kind === "items") ? S.sel.refs : (S.sel && S.sel.kind === "item" ? [S.sel.ref] : []);
          toSelect.forEach(function(it) {
            if (cur.indexOf(it) === -1) cur.push(it);
          });
          if (cur.length > 1) {
            select({ kind: "items", refs: cur });
          } else {
            select({ kind: "item", ref: cur[0] });
          }
          S.action = "item";
        } else {
          var inCur = (S.sel && S.sel.kind === "items" && S.sel.refs.indexOf(hi) !== -1);
          if (!inCur) {
            if (toSelect.length > 1) select({ kind: "items", refs: toSelect });
            else select({ kind: "item", ref: hi });
          }
          S.action = "item";
        }

        if (S.sel.kind === "items") {
          var cx = 0, cz = 0;
          S.sel.refs.forEach(function(it) { cx += it.x; cz += it.z; });
          cx /= S.sel.refs.length; cz /= S.sel.refs.length;
          S.dragOff = { x: px - cx, z: pz - cz };
          S.dragOrig = S.sel.refs.map(function(it) { return { it: it, x: it.x, z: it.z }; });
        } else {
          S.dragOff = { x: px - hi.x, z: pz - hi.z };
        }
        /* The selection above is made either way — the inspector fills for a
           pinned sofa exactly as it does for a free one. Only the GESTURE is
           withdrawn, and canDrag reads the selection that was actually made,
           so a marquee is refused only when every piece in it is pinned. */
        if (!canDrag(S.sel)) {
          S.action = null;
          blockedDrag(S.sel);
        }
        if (S.action) beginHistory();
        render2D();
        return true;
      }
    }
    if (layerRank("structure") === pass) {
      var hv = hitSlabOpening(px, pz);
      if (hv) {
        var voidSel = { kind: "slabvoid", ref: hv };
        select(voidSel);
        if (canDrag(voidSel)) {
          S.action = "slabvoid";
          beginHistory();
          S.dragOff = { x: px - hv.x, z: pz - hv.z };
        } else {
          S.action = null;
          blockedDrag(voidSel);
        }
        render2D();
        return true;
      }
      var hw = hitWall(px, pz);
      if (hw) {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          var pickedWalls = S.sel && S.sel.kind === "walls"
            ? S.sel.refs.slice()
            : S.sel && S.sel.kind === "wall" ? [S.sel.ref] : [];
          var wallAt = pickedWalls.indexOf(hw);
          if (wallAt === -1) pickedWalls.push(hw); else pickedWalls.splice(wallAt, 1);
          select(pickedWalls.length > 1
            ? { kind: "walls", refs: pickedWalls }
            : pickedWalls.length === 1 ? { kind: "wall", ref: pickedWalls[0] } : null);
          S.action = null; render2D(); return true;
        }
        // clicking a half of the ALREADY selected wall picks which half a typed
        // length/angle edit grows or shrinks (first click just selects the wall)
        if (S.sel && S.sel.kind === "wall" && S.sel.ref === hw) {
          var half = wallHalfAt(hw, px, pz);
          S.wallEditEnd = S.wallEditEnd === half ? null : half;
          syncWallEnd();
        } else select({ kind: "wall", ref: hw });
        /* The body of a wall is a drag handle: the whole wall travels, both
           corners with it. It is a rigid move, so the wall keeps its own length
           and angle; anything else meeting those corners is stretched instead
           (and a locked neighbour lets go of the joint rather than deform) —
           the same rule a room drag follows. A pure click moves nothing: the
           delta is grid-quantised, so it stays 0 until the pointer really
           travels, which is what keeps the half-picking click above intact. */
        var wallSel = { kind: "wall", ref: hw };
        if (canDrag(wallSel)) {
          S.action = "wall";
          beginHistory();
          S.jointsReleased = 0;
          S.wallDrag = {
            wall: hw,
            sx: px,
            sz: pz,
            orig: [hw.a, hw.b].map(function (i) {
              return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
            }),
          };
          S.wallAngleGuide = null;
        } else {
          S.action = null;
          blockedDrag(wallSel);
        }
        render2D();
        return true;
      }
    }
    return false;
  }
  /* An edge handle of the ALREADY SELECTED room outranks everything, because
     it is a control the user can see and has deliberately aimed at. It is
     offered only for the current selection, so it can never intercept a
     click meant for a piece of furniture in a room nobody selected. */
  function runRoomEdgePass() {
    if (!S.sel || S.sel.kind !== "room") return false;
    var handle = pickRoomEdge(px, pz);
    if (!handle) return false;
    var edgeSel = { kind: "wall", ref: handle.wall };
    if (!canDrag(edgeSel)) {
      /* Clearing matters as much as refusing: an action left armed by the
         previous pointerdown would otherwise run against the side that was
         just refused. */
      S.action = null;
      blockedDrag(edgeSel);
      return true;
    }
    S.action = "wall";
    beginHistory();
    S.jointsReleased = 0;
    S.wallDrag = {
      wall: handle.wall,
      sx: px,
      sz: pz,
      orig: [handle.wall.a, handle.wall.b].map(function (i) {
        return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
      }),
      /* What makes this a RESIZE rather than a wall drag: the side may only
         travel along its own normal, so pulling the end wall of a room
         cannot also slide it sideways and turn the rectangle into a
         parallelogram. */
      edge: { axis: handle.axis, ux: handle.ux, uz: handle.uz, room: S.sel.ref },
      limit: roomEdgeLimit(S.sel.ref, handle),
    };
    S.wallAngleGuide = null;
    render2D();
    return true;
  }
  /* The room is the LAST resort, after both passes rather than at the end of
     the structure block inside each one.

     A room is not a thing you aim at — it is the whole floor area, and every
     click that lands inside it hits it. Ranking it with the rest of structure
     therefore broke the two-pass rule it was supposed to serve: with the work
     set on structure (which is where the wall tool leaves it), a rank-0 room
     answered the click before pass 1 ever ran, so a sofa, a sink or a TV
     standing on that floor could not be selected at all — the press grabbed
     the room and dragged the whole plan, carrying the furniture along inside
     it. Precise targets on every layer now get both passes first, and the
     floor only answers when none of them did. */
  function runRoomPass() {
    var rank = layerRank("structure");
    if (rank !== 0 && rank !== 1) return false;
    var hk = hitRoom(px, pz);
    if (!hk) return false;
    var rm = roomByKey(hk);
    var roomSel = { kind: "room", ref: hk };
    /* On touch the floor is also where you put your finger to pan, and on a
       zoomed-in plan there is little else to grab: a drag that starts in a
       room nobody had selected used to carry the room (and its furniture)
       off instead. Touch now follows "select first, then drag" — the press
       still selects the room, but only a drag on the ALREADY selected room
       moves it; otherwise the finger pans. Mouse is unchanged. */
    var priorSel = e.pointerType === "touch" ? interactionLocals.preTouchSel : S.sel;
    var wasSelected = !!priorSel && priorSel.kind === "room" && priorSel.ref === hk;
    select(roomSel);
    if (e.pointerType === "touch" && !wasSelected && !inputIs3D()) {
      S.action = "pan";
      S.panStart = { ox: S.OX, oy: S.OY, px: e.offsetX, py: e.offsetY };
      render2D();
      return true;
    }
    /* canDrag folds in all three of the old conditions — the work set,
       S.lockStruct, and the per-room padlock it reads out of S.roomMeta
       (a room selection's ref is a KEY, not an object). `rm` staying in
       the test is not redundant: a room key with no live polygon has no
       corners to move. */
    if (rm && canDrag(roomSel)) {
      S.action = "room";
      beginHistory();
      /* An attached room is broken off its neighbours first, so what travels
         is the room and nothing else. detachRoomSeam returns the corners the
         room now owns; a free-standing room has no seam and keeps its own. */
      // Selection alone must never detach shared walls. Wait for a real drag.
      var carry = rm.nidx;
      S.dragRoom = {
        key: hk,
        started: false,
        sx: px,
        sz: pz,
        orig: carry.map(function (i) {
          return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
        }),
        // items sitting inside the room travel with it (relative offset kept)
        items: itemsInRoom(rm).map(function (it) {
          return { it: it, x: it.x, z: it.z };
        }),
      };
    } else {
      S.action = null;
      if (rm) blockedDrag(roomSel);
    }
    render2D();
    return true;
  }
  /* One arming point for all three proxied gestures rather than one beside
     each `S.action = ` — the passes hand back true only after they have set
     S.action and filled the matching drag record, which is exactly when the
     proxy can read what it is lifting. */
  if (runRoomEdgePass()) return void armDragProxy();
  if (runSelectPass(0)) return void armDragProxy();
  if (runSelectPass(1)) return void armDragProxy();
  if (runRoomPass()) return void armDragProxy();
  // blank space: same "I'm done" gesture as Esc — drop the selection and
  // fall back to the select tool
  select(null);
  if (S.tool !== "select") setTool("select");
  S.action = inputIs3D() ? null : "pan";
  S.panStart = { ox: S.OX, oy: S.OY, px: e.offsetX, py: e.offsetY };
  render2D();
}

// lifted out of initInteraction()
// deflection into the edge band, eased: grazing the band barely moves, and
// the speed only builds as the cursor pushes further out
function apAxis(v, size) {
  var d = 0;
  if (v < interactionLocals.AP_BAND) d = (v - interactionLocals.AP_BAND) / interactionLocals.AP_BAND;
  else if (v > size - interactionLocals.AP_BAND) d = (v - (size - interactionLocals.AP_BAND)) / interactionLocals.AP_BAND;
  d = clamp(d, -1, 1);
  return Math.sign(d) * d * d * interactionLocals.AP_MAX;
}
// is the current gesture one that should drag the view along with it?
function apActive() {
  if (isElevation() || S.action === "pan" || S.action === "pinch") return false;
  if (S.tool === "wall" && S.drawing && S.drawFrom != null) return true;
  if (S.tool === "arcwall" && S.arcDraft) return true;
  if (S.tool === "mepRoute") {
    var mr = S.mep;
    if (mr && mr.route && mr.route.pts && mr.route.pts.length) return true;
  }
  return (
    S.action === "item" ||
    S.action === "node" ||
    S.action === "wall" ||
    S.action === "marker" ||
    S.action === "room" ||
    S.action === "mep"
  );
}

export { apActive, apAxis, pointerDown };

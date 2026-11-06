/* The plan view's long-press tracking, pointer up/cancel handling and the
   remaining plan listeners, lifted out of initInteraction, split out of
   js/interaction.js. It shares the editor's state through live imports from
   ../interaction.js. */
import { hudKeydown } from "../cad_hud.js";
import { executeCommand, openingPlaceCommand } from "../commands/index.js";
import { captureClear, captureLock } from "../constraint_engine.js";
import { elevNudge, elevNudgeItem, elevNudgeOpening } from "../elevation.js";
import { distSeg, wallById, wallGeom } from "../geometry.js";
import { cancelPending, disarmHistoryGesture, pushHistory, redo, restoreHistorySession, undo } from "../history.js";
import { t } from "../i18n.js";
import { hitItem, hitOpening, hitRoom } from "../interaction/hit_test.js";
import { finalizeItemPlacement, rotateRoom } from "../interaction/layout_drag.js";
import { commitRoute, commitWallBite, finishDraw, setTool, syncElevationTools, wallPoint } from "../interaction/mep_tools.js";
import { arcWallPoint, armRoomStamp, buildDragCorridor, connectFusedWalls, cycleRoomStampConnMode, disarmRoomStamp, flipRoomStampDoorWall, fuseDroppedRoom, rehomeDraggedRoom, resizeRoomStamp, rotateRoomStamp } from "../interaction/room_tools.js";
import { rotateItems } from "../interaction/view3d_edit.js";
import { agentCommandEnvironment, deleteSel, endConPick } from "../interaction/wall_edit.js";
import { snapWallPoint } from "../interaction/wall_snap.js";
import { reseatHeldItems } from "../item_align.js";
import { markManualRot, rotStep } from "../item_orient.js";
import { markerItem, moveMarker, releaseIfMoved } from "../markers.js";
import { cancelRoute, ensureMEP } from "../mep.js";
import { broadcastPlanOp, itemMovePlanOps } from "../plan_sync.js";
import { plan, render2D } from "../plan2d.js";
import { inputBounds, inputIs3D, inputScale, registerPlannerController, setPlannerInputView, toBasePx, wx, wz } from "../planner_input.js";
import { carryChildren, refreshSupport } from "../stack.js";
import { S, clamp, throttle } from "../state.js";
import { releaseTouchPrecisionTrial, touchPrecisionTrialOwns } from "../touch_precision_ui.js";
import { setConstraintHover, syncWarnHighlight } from "../ui_warn.js";
import { fillProps, flash, placeFurnAt, refreshTree, select, setLockStruct, syncStairVoids } from "../ui.js";
import { isWalk } from "../view3d.js";
import { solveWallCons } from "../wall_constraints.js";
import {
  dropDragProxy, endSnapSession, interactionLocals, isElevation,
} from "../interaction.js";

// lifted out of initInteraction()
function wireLongPressAndPointerUp() {
  const throttledPlanMove=throttle(function (e) {
    setPlannerInputView(null);
    (0, interactionLocals.autoPanFrom)(e);
    (0, interactionLocals.planMove)(e);
  });
  plan.addEventListener('pointermove',e=>{
    // offsetX/offsetY are target-relative only during event dispatch. Capture
    // the canvas coordinates before deferring work to the animation frame.
    const r=plan.getBoundingClientRect();
    throttledPlanMove({type:e.type,clientX:e.clientX,clientY:e.clientY,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,
      pointerId:e.pointerId,pointerType:e.pointerType,button:e.button,buttons:e.buttons,altKey:e.altKey,shiftKey:e.shiftKey,
      ctrlKey:e.ctrlKey,metaKey:e.metaKey,timeStamp:e.timeStamp,target:e.target,isTrusted:e.isTrusted,
      preventDefault:()=>{},stopPropagation:()=>{}});
  });

  function endAction(e) {
    try {
    if (e?.type === "pointercancel") {
      const active = S.action;
      (0, interactionLocals.cancelLongPress)(); (0, interactionLocals.stopAutoPan)(); dropDragProxy(); endSnapSession();
      S.wallPress = null;
      disarmHistoryGesture();
      if (active && active !== "pan" && interactionLocals.gestureSession) restoreHistorySession(interactionLocals.gestureSession);
      interactionLocals.gestureSession = null;
      S.action = null; S.drag = null; S.dragRoom = null; S.touchContact = null;
      render2D(); return;
    }
    ;(0, interactionLocals.cancelLongPress)();
    // Every pointerup and pointercancel lands here, so this is the one place a
    // gesture is guaranteed to be over. It has to run before the settle solve
    // below moves the rest of the drawing, and it forces the full model paint
    // that puts the dragged object back onto the document image.
    dropDragProxy();
    endSnapSession();
    (0, interactionLocals.stopAutoPan)();
    if (e && touchPrecisionTrialOwns(e.pointerId)) {
      releaseTouchPrecisionTrial(e.pointerId, e.type === "pointercancel");
      S.touchDrag = false;
      S.touchContact = null;
      delete interactionLocals.pointers[e.pointerId];
      render2D();
      return;
    }
    if (interactionLocals.touchHostPlacement && (!e || e.pointerId === interactionLocals.touchHostPlacement.pointerId)) {
      var pendingHost = interactionLocals.touchHostPlacement;
      interactionLocals.touchHostPlacement = null;
      if (e && e.type === "pointerup") {
        var hostRect = inputBounds(plan);
        var hostX = e.clientX - hostRect.left, hostY = e.clientY - hostRect.top;
        var hostPoint = (0, interactionLocals.planPrecisionPoint)(e, hostX, hostY, hostRect, false);
        var hostPx = wx(hostPoint.x, hostPoint.y), hostPz = wz(hostPoint.x, hostPoint.y);
        if (pendingHost.placeType && S.placeType === pendingHost.placeType)
          placeFurnAt(pendingHost.placeType, hostPx, hostPz);
        else if (S.tool === pendingHost.tool)
          (0, interactionLocals.placeOpeningAt)(pendingHost.tool, hostPx, hostPz);
      }
    }
    /* A first wall may be drawn in one press-drag-release gesture. Keep a
       click (or tiny hand jitter) as the first half of click-click placement;
       only a deliberate drag commits here. Do this before clearing the one-shot
       snap override so the release resolves exactly like a normal wall click. */
    if (S.wallPress && (!e || e.pointerId === S.wallPress.pointerId)) {
      var wp = S.wallPress;
      S.wallPress = null;
      if (e && e.type === "pointerup" && S.tool === "wall" && S.drawing) {
        var wr = inputBounds(plan),
          wox = e.clientX - wr.left,
          woy = e.clientY - wr.top;
        var releasePoint = (0, interactionLocals.planPrecisionPoint)(e, wox, woy, wr, false);
        if (Math.hypot(wox - wp.x, woy - wp.y) > 5)
          {
            wallPoint(snapWallPoint(wx(releasePoint.x, releasePoint.y), wz(releasePoint.x, releasePoint.y), S.drawFrom));
            /* A drag is Chief Architect's normal one-wall gesture: release
               commits that wall and ends its rubber band. The Wall tool stays
               armed, so the next wall starts with another independent drag.
               A stationary click deliberately keeps the precision click-click
               path available for typed length/angle entry. */
            finishDraw();
          }
      }
    }
    // the next drag starts with a clean slate, so re-snapping to the same wall
    // flashes again rather than staying silent
    S.snapFlashKey = null;
    /* Both snap overrides are per-gesture on purpose. A forced kind or a
       cycled alternative fixes THIS click; carrying either into the next one
       reproduces the problem it was invented to solve, where a momentary fix
       silently becomes a persistent setting. */
    S.snapOnly = null;
    S.snapCycle = 0;
    if (e && e.pointerType === "touch") {
      S.touchDrag = false;
      S.touchContact = null;
      delete interactionLocals.pointers[e.pointerId];
      // Both fingers gone, nothing zoomed: that was the undo gesture.
      if (!Object.keys(interactionLocals.pointers).length && (0, interactionLocals.tryTwoTap)()) return;
    }
    /* Settle the topology BEFORE anything reads it. A dropped room has walls
       to weld and duplicates to merge, and the corridor pass below works off
       "which walls does this room have" — asked too early, it answered with
       the pre-drop pair of overlapping walls and cut a passage through each of
       them. Re-homing runs here too, so the corridor pass looks the room up by
       a key that still exists. */
    if (S.action === "room" && S.dragRoom && !S.dragRoom.started) {
      cancelPending(); S.action = null; S.dragRoom = null;
      render2D(); return;
    }
    if (S.action === "room" && S.dragRoom) {
      S.dragRoom.items.forEach(function (o) { releaseIfMoved(o.it); });
      var draggedKey = S.sel && S.sel.kind === "room" ? S.sel.ref : null;
      var fusedWalls = fuseDroppedRoom(S.dragRoom);
      rehomeDraggedRoom(S.dragRoom, draggedKey);
      connectFusedWalls(fusedWalls);
      buildDragCorridor(S.dragRoom);
    }
    if (S.action === "room" && S.sel && S.sel.kind === "room") {
      var rKey = S.sel.ref;
      var rMeta = S.roomMeta[rKey];
      /* A room stamped from a preset brings its own answer to "how do these
         two spaces connect" (js/room_presets.js), and the drop has already
         acted on it. This pass is the older, geometric one — every collinear
         overlap becomes a full-width opening, paired through `overlapL` — and
         it is what a corridor drawn by hand still wants. Running both gave the
         stamped corridor an opening as wide as the whole wall AND pairing
         metadata nobody asked for. */
      if (rMeta && rMeta.isCorridor && !rMeta.preset) {
        var wids = rKey.split(",");
        var corridorWalls = S.walls.filter(function(w) { return wids.indexOf(String(w.id)) > -1; });
        var otherWalls = S.walls.filter(function(w) { return wids.indexOf(String(w.id)) === -1; });
        var newOpenings = [];

        corridorWalls.forEach(function(cw) {
          var cg = wallGeom(cw);
          otherWalls.forEach(function(ow) {
            var og = wallGeom(ow);
            var dot = cg.ux * og.ux + cg.uz * og.uz;
            if (Math.abs(dot) > 0.999) {
              if (distSeg(cg.a.x, cg.a.z, og.a.x, og.a.z, og.b.x, og.b.z) < (cw.thickness + ow.thickness) / 2 + 6) {
                var ta = (og.a.x - cg.a.x) * cg.ux + (og.a.z - cg.a.z) * cg.uz;
                var tb = (og.b.x - cg.a.x) * cg.ux + (og.b.z - cg.a.z) * cg.uz;
                var tmin = Math.max(0, Math.min(ta, tb));
                var tmax = Math.min(cg.L, Math.max(ta, tb));
                var overlap = tmax - tmin;
                if (overlap > 40) {
                  var s = tmin + overlap / 2;
                  var width = overlap;
                  var Px = cg.a.x + cg.ux * s, Pz = cg.a.z + cg.uz * s;
                  S.walls.forEach(function(x) {
                    var g = wallGeom(x);
                    if (distSeg(Px, Pz, g.a.x, g.a.z, g.b.x, g.b.z) < x.thickness / 2 + 6) {
                      var ss = (Px - g.a.x) * g.ux + (Pz - g.a.z) * g.uz;
                      /* Anything already occupying that stretch of wall — not
                         just an opening whose CENTRE is within 20 cm. A door
                         cut by the drop's own fuse pass a moment earlier sits
                         at whatever station the wall had room for, so the old
                         centre test happily added a second opening beside it. */
                      var exists = S.openings.some(function(op) {
                        return op.wall === x.id
                          && op.s + op.width / 2 > ss - width / 2
                          && op.s - op.width / 2 < ss + width / 2;
                      });
                      if (!exists) {
                        /* Corridor inference is still a model creation path.
                           Route it through the same validated command as the
                           pointer, elevation and agent entry points; the room
                           drag already owns the surrounding history gesture. */
                        var corridorResult = executeCommand(openingPlaceCommand, {
                          wallId: x.id,
                          type: "passage",
                          s: ss,
                          width: width,
                          height: x.height,
                          sill: 0,
                        }, agentCommandEnvironment(), { history: false });
                        if (corridorResult.ok && corridorResult.created.length) {
                          var createdId = corridorResult.created[0].id;
                          var o = S.openings.find(function(op) { return op.id === createdId; });
                          if (o) {
                            o.overlapL = overlap;
                            o.overlapCenter = o.s;
                            newOpenings.push(o);
                          }
                        }
                      }
                    }
                  });
                }
              }
            }
          });
        });

        if (newOpenings.length > 0) {
          var oids = newOpenings.map(function(o) { return o.id; });
          newOpenings.forEach(function(o) { o.paired = oids; });
          rMeta.autoOpenings = oids;
          flash(t("Auto-created opening. Check right panel to manage."));
          S.dirty3D = true;
          render2D();
          fillProps();
        }
      }
    }

    if (S.action === "wallbite") commitWallBite();
    if (S.action === "mep") {
      fillProps(); // refresh readouts (length, position) after a drag
      refreshTree(); // connectivity flags may have changed
    }
    // An object dragged clear of the point it was standing on frees that point.
    // Room drags carry their contents, so those count too.
    if (S.action === "item" && S.sel) {
      /* A piece dropped flush against a wall is held to it from now on. Only
         when the flush snap actually engaged during THIS drag — inferring it
         from the final position alone would grab pieces that merely happen to
         end up near a wall, which is most of them in a small room. */
      var heldWall = S.itemSnapWall != null && wallById(S.itemSnapWall);
      if (S.sel.kind === "item") finalizeItemPlacement(S.sel.ref, {
        releaseMarker: true, holdWallId: heldWall && heldWall.id,
      });
      else if (S.sel.kind === "items") S.sel.refs.forEach(function(item) {
        finalizeItemPlacement(item, { releaseMarker: true });
      });
      S.itemSnapWall = null;
      S.orientHold = false; // Alt was for that gesture, not for the session
      /* The drag may have turned the piece for you (js/item_orient.js), so the
         inspector's rotation has to be re-read — a number that disagrees with
         the plan is worse than no number. */
      fillProps();
    }
    /* A side pushed up against the neighbouring room has to JOIN it, exactly
       as a whole dragged room does — otherwise resizing a room until it
       touches its neighbour leaves two walls in the same place and a sliver of
       nothing between them. Same repair, same code. */
    if (S.action === "wall" && S.wallDrag && S.wallDrag.edge) {
      var edgeKey = S.wallDrag.edge.room;
      var edgeFused = fuseDroppedRoom(S.wallDrag);
      rehomeDraggedRoom(S.wallDrag, edgeKey);
      connectFusedWalls(edgeFused);
    }
    /* A corner drag is a deliberate re-dimensioning of the walls it moved, so
       those walls now HOLD what the user just drew — otherwise the very next
       edit elsewhere would snap them back to their pre-drag size. */
    if (S.action === "node" && S.nodeDrag) {
      // the corner was left resting on a wall: make that a real joint, once
      if (S.nodeDrag.landOn != null) {
        var host = wallById(S.nodeDrag.landOn),
          hn = S.nodeDrag.node,
          hostActive = [];
        S.walls.forEach(function (w) {
          if (w.a !== hn && w.b !== hn) return;
          if (!S.nodeDrag.wall || S.nodeDrag.wall === w.id) hostActive.push(w.id);
        });
        var landed = (0, interactionLocals.landNodeOnWall)(hn, host, hostActive);
        S.nodeDrag.node = landed;
        S.nodeDrag.landOn = null;
        if (!S.nodeDrag.wall) select({ kind: "node", ref: landed });
      }
      var dn = S.nodeDrag.node;
      S.walls.forEach(function (w) {
        if (w.a !== dn && w.b !== dn) return;
        if (!S.nodeDrag.wall || S.nodeDrag.wall === w.id) {
          captureLock(w);
          captureClear(w); // ...including the interior span it now reads
        }
      });
      fillProps(); // the inspector's "held at" readout is one of these numbers
    }
    /* Same rule one step out for a wall that was dragged bodily: the walls it
       stretched on the way now hold what the user just drew, and so does the
       wall itself (its own numbers did not change, but re-reading them costs
       nothing and keeps the pair in step). */
    if (S.action === "wall" && S.wallDrag) {
      var ends = {};
      S.wallDrag.orig.forEach(function (o) {
        ends[o.i] = 1;
      });
      S.walls.forEach(function (w) {
        if (!ends[w.a] && !ends[w.b]) return;
        captureLock(w);
        captureClear(w);
      });
      fillProps();
    }
    if (S.action === "item" && S.sel && (S.sel.kind === "item" || S.sel.kind === "items")) {
      var movedRoots = S.sel.kind === "item" ? [S.sel.ref] : S.sel.refs;
      // a dragged flight of stairs takes its stairwell void with it
      movedRoots.forEach(function(item) { if (syncStairVoids(item)) render2D(); });
      itemMovePlanOps(movedRoots, S.items).forEach(broadcastPlanOp);
    } else if (S.action === "opening" && S.sel && S.sel.kind === "opening") {
      broadcastPlanOp({ type: "openingSet", id: S.sel.ref.id, fields: { s: S.sel.ref.s } });
    } else if (S.action === "slabvoid" && S.sel && S.sel.kind === "slabvoid") {
      broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
      fillProps();
    } else if (S.action === "node" && S.nodeDrag && S.nodes[S.nodeDrag.node]) {
      var bn = S.nodes[S.nodeDrag.node];
      // `n` guards the index: no op syncs wall creation, so a peer whose node
      // array has grown must resync rather than move a different corner
      broadcastPlanOp({ type: "nodeMove", index: S.nodeDrag.node, n: S.nodes.length, x: bn.x, z: bn.z });
    }
    /* The gesture is over, so the sub-graph shortcut and the Alt override both
       expire here and the WHOLE dimension set gets the last word. A drag that
       suppressed the solver therefore ends with the plan obeying its
       dimensions again — the override buys a gesture, never a drawing that
       silently disagrees with what it says. */
    if (S.action === "node" || S.action === "wall" || S.action === "room") {
      S.conOverride = false;
      var settle = solveWallCons();
      /* Held pieces follow the walls they are held against, and they follow
         AFTER the dimensions have settled — re-seating against a wall that is
         still about to move would just have to be redone. */
      if (reseatHeldItems()) S.dirty3D = true;
      if (settle.unresolved) flash(t("wc_unresolved", { n: settle.unresolved }), "error");
    }
    S.conOverride = false;
    if (S.jointsReleased) {
      flash(t("f_jointReleased", { n: S.jointsReleased }));
      S.jointsReleased = 0;
    }
    if (S.action === "marker" || S.action === "markerElev" ||
        S.action === "itemElev" || S.action === "openingElev" || S.action === "slabvoid") fillProps();
    if (S.action === "item" || S.action === "room" || S.action === "node" ||
        S.action === "wall" || S.action === "marker" || S.action === "markerElev" ||
        S.action === "itemElev" || S.action === "openingElev" || S.action === "slabvoid")
      refreshTree();
    if (S.action === "item" || S.action === "marker" || S.action === "markerElev" ||
        S.action === "itemElev" || S.action === "openingElev" || S.action === "slabvoid")
      S.dirty3D = true;
    // drafting guides belong to the drag that produced them — corner and point
    // drags both go through snapPoint — so they end with it. Only those two:
    // the wall tool is mid-gesture on pointerup and still needs its guides.
    var dragUsedSnap = S.action === "marker" || S.action === "node";
    cancelPending();
    S.action = null;
    plan.classList.remove("is-panning");
    interactionLocals.eraseSeen = null;
    interactionLocals.erasePushed = false;
    S.dragRoom = null;
    S.nodeDrag = null;
    S.wallDrag = null;
    if (S.wallAngleGuide && S.wallAngleGuide.snapped)
      S.wallAngleGuide.until = Date.now() + 900;
    else S.wallAngleGuide = null;
    S.mepDrag = null;
    S.elevGrab = null;
    var hadGuides = dragUsedSnap && S.snapGuides && S.snapGuides.length;
    if (hadGuides) S.snapGuides = [];
    // the "you are dropping onto THIS" highlight belongs to the drag as well
    var hadHost = !!S.stackHost;
    S.stackHost = null;
    if (S.alignX != null || S.alignZ != null || hadGuides || hadHost) {
      S.alignX = S.alignZ = null;
      render2D();
    }
    } finally {
      disarmHistoryGesture();
      interactionLocals.gestureSession = null;
    }
  }
  registerPlannerController({down:interactionLocals.pointerDown, move:interactionLocals.planMove, up:endAction, cancel:endAction, double:doubleClick});
  window.addEventListener("planner-cancel-gesture", () => endAction({type:"pointercancel"}));
  plan.addEventListener("pointerup", e => { setPlannerInputView(null); endAction(e); });
  plan.addEventListener("pointercancel", endAction);
  if (typeof window !== "undefined")
    window.addEventListener("plan:view-axis", syncElevationTools);
  plan.addEventListener("pointerleave", function () {
    S.touchContact = null;
    // a captured drag keeps scrolling past the border; the wall/route tools are
    // between clicks with no capture, so losing the cursor must stop the scroll
    if (!S.action) (0, interactionLocals.stopAutoPan)();
    var draftHover =
      S.previewPt &&
      !S.drawing &&
      !S.arcDraft &&
      !S.rectDraft &&
      (S.tool === "wall" || S.tool === "arcwall" || S.tool === "rect" || S.tool === "slabvoid");
    if (S.hoverItem || S.hoverPt || S.markerPreview || S.wallHoverHalf ||
        S.warnHover || S.conHover || S.wallProbe || S.hoverMarker || S.hoverNode != null ||
        S.eraseHover || draftHover) {
      S.hoverItem = null;
      S.hoverPt = null;
      S.hoverMarker = null;
      S.hoverNode = null;
      S.wallHoverHalf = null;
      S.wallProbe = null;
      S.markerPreview = null;
      S.eraseHover = null;
      if (draftHover) {
        S.previewPt = null;
        S.snapGuides = [];
        S.snapInfo = null;
      }
      if (S.conHover) setConstraintHover(null);
      if (S.tool === "select") plan.style.cursor = "default";
      if (S.warnHover) {
        S.warnHover = null;
        syncWarnHighlight();
      }
      render2D();
    }
  });
  function doubleClick(e) {
    if (S.tool === "wall") return void finishDraw();
    if (S.tool === "arcwall" && S.arcDraft && S.arcDraft.through && S.previewPt)
      return void arcWallPoint(S.previewPt);
    if (S.tool === "mepRoute") return void commitRoute();
    if (S.tool && S.tool !== "select") return;
    if (S.workspace && S.workspace.role === "viewer") return;
    if (isElevation()) return; // the elevation pane draws a side view, not a plan
    /* Direct manipulation for the verb each object is asked for most. Both are
       the same edit the contextual row offers, one tap cheaper, and both are
       cyclic — a second double-click undoes the first — so there is nothing to
       learn and nothing to lose by trying it.

       The hit test is repeated here rather than trusting S.sel: the two clicks
       that make a double-click have already selected whatever the FIRST one
       landed on, so acting on the selection alone would rotate the chair you
       had selected a minute ago when you double-click empty floor next to it. */
    var r = inputBounds(plan),
      ox = e.clientX - r.left,
      oy = e.clientY - r.top,
      px = wx(ox, oy),
      pz = wz(ox, oy);
    var op = hitOpening(px, pz);
    if (op && op.type === "door" && !op.isSliding && !op.isPocket) {
      if (window.__runAction) {
        select({ kind: "opening", ref: op });
        window.__runAction("flipSwing");
      }
      return;
    }
    var it = hitItem(px, pz);
    if (it && !it.locked && window.__runAction) {
      select({ kind: "item", ref: it });
      window.__runAction("rotSel90");
      return;
    }
    /* The floor is tried LAST because it is the biggest target on the plan:
       tested first it would swallow every piece and every door standing on it.
       Bare ground is not a room, so a double-tap outside the walls still means
       nothing at all. */
    var rk = hitRoom(px, pz);
    if (rk != null && window.__runAction) {
      select({ kind: "room", ref: rk });
      window.__runAction("roomFloor");
    }
  }
  plan.addEventListener("dblclick", e => { setPlannerInputView(null); doubleClick(e); });
}

// lifted out of initInteraction()
function wirePlanListeners() {
  plan.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      if (isElevation()) return; // elevations auto-fit; no zoom/pan
      var f = Math.pow(1.0015, -e.deltaY);
      var r = inputBounds(plan);
      var ox = e.clientX - r.left, oy = e.clientY - r.top;
      var bx = wx(ox, oy),
        bz = wz(ox, oy);
      S.SC = clamp(inputScale() * f, 0.08, 6);
      // keep the world point under the cursor fixed (in the rotated base frame)
      var base = toBasePx(ox, oy);
      S.OX = base.x - bx * inputScale();
      S.OY = base.y - bz * inputScale();
      render2D();
    },
    { passive: false },
  );

  window.addEventListener("keydown", function (e) {
    // The modeler is a modal editor layered over the plan. Its shortcuts share
    // letters with planner commands (notably L: sketch Line vs structure
    // Lock), and the planner listener is registered first, so stopping the
    // event inside the modeler is already too late. Leave every key to the
    // visible modeler before the planner mutates hidden state behind it.
    if ((0, interactionLocals.modelerKeyboardOwnsInput)()) return;
    if (S.workspace && S.workspace.role === "viewer") return;
    // Browser extensions and other integrations can dispatch a keydown-like
    // event without KeyboardEvent.key. There is no planner shortcut to run.
    if (typeof e.key !== "string" || !e.key) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    // Walk/drive modes own the keyboard (WASD, V, G, T…). Without this, keys
    // like Delete or 1-5 kept editing the plan behind the first-person view.
    if (isWalk() && inputIs3D() && /^(Key[WASD]|Arrow)/.test(e.code)) return;
    /* A digit typed while the wall tool is rubber-banding means "this exact
       length", not "switch to the door tool" — the precision entry gets first
       refusal on the key before the 1-6 shortcuts below can claim it. */
    if (hudKeydown(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl-combos handled in ui.js
    if (e.key === "Escape") {
      // Esc during a live drag abandons the gesture's selection while the
      // pointer is still down; the proxy is keyed on objects rather than the
      // selection, so it would otherwise stay up with nothing driving it.
      dropDragProxy();
      var cancelledTutorDraft = !!(S.drawing || S.offsetDraft || S.joinPick || S.arcDraft || S.rectDraft);
      S.freshWall = null; // "I'm done" ends the just-drawn run too
      if (S.conPick) endConPick(null);
      else if (S.drawing) finishDraw();
      else if (S.offsetDraft) { S.offsetDraft = null; S.previewPt = null; render2D(); }
      else if (S.joinPick) { S.joinPick = null; render2D(); }
      else if (S.arcDraft) { S.arcDraft = null; S.previewPt = null; render2D(); }
      else if (S.rectDraft) { S.rectDraft = null; S.previewPt = null; setTool("select"); }
      else if (S.roomStamp) { disarmRoomStamp(); S.previewPt = null; setTool("select"); }
      else if (S.placeType) {
        S.placeType = null;
        S.previewPt = null;
        window.dispatchEvent(new CustomEvent("planner-place"));
      }
      else if (S.tool === "mepRoute" && ensureMEP().route) cancelRoute();
      else if (S.tool && S.tool.indexOf("mep") === 0) setTool("select");
      else if (S.tool === "point" || S.tool === "slabvoid") setTool("select");
      else {
        // Esc always lands you back on the select tool, not just deselected —
        // "I'm done with this" means done with the tool too.
        select(null);
        if (S.tool !== "select") setTool("select");
      }
      render2D();
      if (cancelledTutorDraft) window.dispatchEvent(new CustomEvent("planner-draft-cancel"));
    } else if (e.key === "Enter" && S.tool === "mepRoute") {
      commitRoute();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteSel();
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "m" || e.key === "M")) {
      cycleRoomStampConnMode();
      return;
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "d" || e.key === "D" || e.key === "Tab")) {
      e.preventDefault();
      flipRoomStampDoorWall();
      return;
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      resizeRoomStamp(e.key === "[" ? -10 : 10, 0);
      return;
    } else if (S.tool === "roomstamp" && S.roomStamp && (e.key === "{" || e.key === "}")) {
      e.preventDefault();
      resizeRoomStamp(0, e.key === "{" ? -10 : 10);
      return;
    } else if (e.key === "r" || e.key === "R") {
      // while a preset room is armed R turns the RECTANGLE, not the selection:
      // that is the only thing on screen the user is steering
      if (S.tool === "roomstamp" && S.roomStamp) { rotateRoomStamp(); return; }
      /* The step is whatever the inspector is set to (15/45/90), and Shift
         turns the other way — one key for both directions beats two. */
      var rStep = rotStep() * (e.shiftKey ? -1 : 1);
      if (S.sel && S.sel.kind === "item") {
        pushHistory();
        S.sel.ref.rot = (((S.sel.ref.rot + rStep) % 360) + 360) % 360;
        markManualRot(S.sel.ref);
        S.dirty3D = true;
        fillProps();
        render2D();
      } else if (S.sel && S.sel.kind === "items") rotateItems(rStep);
      else if (S.sel && S.sel.kind === "room") rotateRoom(rStep);
      else if (S.sel && S.sel.kind === "slabvoid") {
        pushHistory();
        S.sel.ref.rot = (((S.sel.ref.rot + rStep) % 360) + 360) % 360;
        S.dirty3D = true;
        fillProps();
        render2D();
        broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
      }
    }     else if (e.key === "1") setTool("select");
    else if (e.key === "2") setTool("wall");
    else if (e.key === "3") setTool("door");
    else if (e.key === "4") setTool("window");
    else if (e.key === "5") setTool("passage");
    else if (e.key === "6") setTool("point");
    else if (e.key === "7") setTool("arcwall");
    else if (e.key === "8") setTool("rect");
    else if (e.key === "9") setTool("slabvoid");
    else if (e.key === "0") armRoomStamp(S.roomStamp ? S.roomStamp.id : "bedroom");
    else if (e.key === "e" || e.key === "E") setTool("erase");
    // L toggles the structure lock — the same button the plan toolbar shows
    else if (e.key === "l" || e.key === "L") setLockStruct(!S.lockStruct);
    else if (e.key.indexOf("Arrow") === 0 && S.sel && S.sel.kind === "marker") {
      e.preventDefault();
      var nowM = Date.now();
      if (!interactionLocals.nudgeT || nowM - interactionLocals.nudgeT > 800) pushHistory();
      interactionLocals.nudgeT = nowM;
      var stM = e.shiftKey ? 10 : 2,
        mk = S.sel.ref;
      // Arrows always move the point along the two axes the CURRENT view can
      // see: x/z from above, and horizontal-plus-HEIGHT in an elevation.
      var dU = e.key === "ArrowLeft" ? -stM : e.key === "ArrowRight" ? stM : 0;
      var dV = e.key === "ArrowUp" ? stM : e.key === "ArrowDown" ? -stM : 0;
      if (isElevation()) {
        var np = elevNudge(mk, dU, dV);
        moveMarker(mk, np.x, np.y, np.z);
      } else {
        moveMarker(mk, mk.x + dU, mk.y, mk.z - dV);
      }
      if (markerItem(mk)) S.dirty3D = true;
      fillProps();
      render2D();
    } else if (
      e.key.indexOf("Arrow") === 0 &&
      S.sel &&
      (S.sel.kind === "item" || S.sel.kind === "items")
    ) {
      e.preventDefault();
      // group rapid keypresses into one undo step
      var now = Date.now();
      if (!interactionLocals.nudgeT || now - interactionLocals.nudgeT > 800) pushHistory();
      interactionLocals.nudgeT = now;
      var st = e.shiftKey ? 10 : 2,
        it = S.sel.kind === "item" ? S.sel.ref : null;
      if (it && it.locked) return;
      if (isElevation() && it) {
        var dUe = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0,
          dVe = e.key === "ArrowUp" ? st : e.key === "ArrowDown" ? -st : 0;
        elevNudgeItem(it, dUe, dVe);
        S.dirty3D = true;
        fillProps();
        render2D();
        return;
      }
      var ndx = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0,
        ndz = e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
      var nudged = it ? [it] : S.sel.refs;
      var nSet = new Set(nudged);
      nudged.forEach(function (r) { r.x += ndx; r.z += ndz; });
      // whatever stands on a nudged piece is nudged with it
      nudged.forEach(function (r) { carryChildren(r, ndx, ndz, nSet); });
      // a nudge is small, so a stacked piece normally stays on its host; it only
      // comes off once its centre has actually left the host's footprint
      nudged.forEach(refreshSupport);
      // nudged off its placeholder point -> that point is free again
      nudged.forEach(releaseIfMoved);
      S.dirty3D = true;
      fillProps();
      render2D();
    } else if (
      e.key.indexOf("Arrow") === 0 &&
      isElevation() &&
      S.sel &&
      S.sel.kind === "opening"
    ) {
      e.preventDefault();
      var nowO = Date.now();
      if (!interactionLocals.nudgeT || nowO - interactionLocals.nudgeT > 800) pushHistory();
      interactionLocals.nudgeT = nowO;
      var stO = e.shiftKey ? 10 : 2,
        dUo = e.key === "ArrowLeft" ? -stO : e.key === "ArrowRight" ? stO : 0,
        dVo = e.key === "ArrowUp" ? stO : e.key === "ArrowDown" ? -stO : 0;
      elevNudgeOpening(S.sel.ref, dUo, dVo);
      S.dirty3D = true;
      fillProps();
      render2D();
    }
  });
}

export { wireLongPressAndPointerUp, wirePlanListeners };

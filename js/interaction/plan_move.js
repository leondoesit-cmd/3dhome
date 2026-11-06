/* The plan view's pointer-move handling (hover, drags, previews), lifted out of
   initInteraction, split out of js/interaction.js. It shares the editor's state
   through live imports from ../interaction.js. */
import { entryOpen } from "../cad_hud.js";
import { canWeld, enforceLocks, hitWarning, snapshotNodes } from "../constraint_engine.js";
import { elevDragItemTo, elevDragOpeningTo, elevDragTo, elevPick, elevationHit } from "../elevation.js";
import { detectRooms, equalWallAngleTranslation, snapAdj, usedNodes, wallById, wallGeom, wallProject } from "../geometry.js";
import { commitPending } from "../history.js";
import { hitItem, hitNode, hitWall, planPickSurface, tolCm, updateWallProbe } from "../interaction/hit_test.js";
import { auditDragProxy, moveItemTo, weldNodes } from "../interaction/layout_drag.js";
import { dragMEP } from "../interaction/mep_tools.js";
import { roomOwnWalls, updateRoomGhost } from "../interaction/room_tools.js";
import { pickErase, resolveLanding, splitIntersectionWalls, wallHalfAt } from "../interaction/wall_edit.js";
import { snapPoint, snapWallPoint } from "../interaction/wall_snap.js";
import { layerRank } from "../layers.js";
import { hitMarker, markerItem, moveMarker } from "../markers.js";
import { ensureMEP, routeResolve, wallPath } from "../mep.js";
import { sendPlanCursor } from "../plan_sync.js";
import { plan, render2D } from "../plan2d.js";
import { inputBounds, inputScale, planRotRad, wx, wz } from "../planner_input.js";
import { corridorRect, solveDock, translateRect } from "../room_dock.js";
import { detachRoomSeam } from "../room_graph.js";
import { carryChildren, detach as stackDetach, refreshSupport } from "../stack.js";
import { S, SNAP_GRID, clamp, fin, touchItem3D } from "../state.js";
import { touchPrecisionTrialOwns, updateTouchPrecisionTrial } from "../touch_precision_ui.js";
import { setConstraintHover, syncWarnHighlight } from "../ui_warn.js";
import { fillProps, select } from "../ui.js";
import { solveWallCons } from "../wall_constraints.js";
import { offsetSideFromCursor } from "../wall_draw.js";
import {
  dropDragProxy, interactionLocals, isElevation, pickCon,
} from "../interaction.js";

// lifted out of initInteraction()
function wirePlanMove() {
  interactionLocals.planMove = function (e) {
    if (isElevation()) {
      // items, openings and points are live in the two elevation axes
      if (S.action === "markerElev" && S.sel && S.sel.kind === "marker") {
        commitPending();
        var dp = elevDragTo(S.sel.ref, e.offsetX, e.offsetY);
        if (dp) {
          moveMarker(S.sel.ref, dp.x, dp.y, dp.z);
          touchItem3D(markerItem(S.sel.ref), "move");
          render2D();
        }
        return;
      }
      if (S.action === "itemElev" && S.sel && S.sel.kind === "item") {
        commitPending();
        if (S.sel.ref.on != null) stackDetach(S.sel.ref);
        elevDragItemTo(S.sel.ref, e.offsetX, e.offsetY, S.elevGrab);
        touchItem3D(S.sel.ref, "move");
        S.dirty3D = true;
        render2D();
        return;
      }
      if (S.action === "openingElev" && S.sel && S.sel.kind === "opening") {
        commitPending();
        elevDragOpeningTo(S.sel.ref, e.offsetX, e.offsetY, S.elevGrab);
        S.dirty3D = true;
        render2D();
        return;
      }
      if (S.tool === "point") {
        S.markerPreview = elevPick(e.offsetX, e.offsetY);
        render2D();
      }
      if (S.tool === "erase") {
        var ee = elevationHit(e.offsetX, e.offsetY);
        S.eraseHover = ee && ee.kind !== "room" ? ee : null;
        if (S.action === "erase" && S.eraseHover) (0, interactionLocals.strokeErase)(S.eraseHover);
        render2D();
      }
      return;
    }
    if (e.pointerType === "touch" && touchPrecisionTrialOwns(e.pointerId)) {
      updateTouchPrecisionTrial(e.pointerId, e.offsetX, e.offsetY);
      return;
    }
    if (e.pointerType === "touch" && interactionLocals.pointers[e.pointerId])
      interactionLocals.pointers[e.pointerId] = { x: e.offsetX, y: e.offsetY };
    /* Hold Alt to drag WITHOUT the dimension solver pulling back. Every
       constraint system needs this escape hatch: when the drawing fights you,
       suppressing one gesture has to be cheaper than finding and suppressing
       the constraint, and far cheaper than deleting it and authoring it again.
       Read per move rather than latched at pointerdown, so the key can be
       taken and released mid-drag. */
    S.conOverride = !!(e && e.altKey);
    (0, interactionLocals.trackLongPress)(e);
    if (S.action === "pinch") {
      (0, interactionLocals.updatePinch)();
      return;
    }
    var moveRect = inputBounds(plan);
    var movePoint = (0, interactionLocals.planPrecisionPoint)(e, e.offsetX, e.offsetY, moveRect, false);
    var px = wx(movePoint.x, movePoint.y),
      pz = wz(movePoint.x, movePoint.y);
    sendPlanCursor(px, pz);
    /* "How far along this wall am I?" — answered for EVERY gesture, before any
       of the per-action branches return: hovering, dragging a piece, or drawing
       the next wall. It is the question you are asking whenever the cursor is
       over a wall, and it used to need a measure-tool detour. */
    updateWallProbe(px, pz);
    if (S.tool === "wall") {
      /* The four-way overlay and snap mark follow the cursor from the moment
         the tool is armed — not only after the first click — so you can read
         distances to walls and objects before placing the start corner. */
      if (S.drawing && S.drawFrom != null) {
        /* Once a dimension is being typed the keyboard owns the endpoint: a
           nudge of the mouse must not silently overwrite the number just
           entered. Same rule as every CAD's dynamic input. */
        if (entryOpen()) return;
        var p = snapWallPoint(px, pz, S.drawFrom);
        S.previewPt = { x: p.x, z: p.z };
        render2D();
        return;
      }
      var p0 = snapPoint(px, pz, null);
      S.previewPt = fin(p0.x) && fin(p0.z) ? { x: p0.x, z: p0.z } : null;
      render2D();
      return;
    }
    if (S.tool === "walloffset") {
      if (S.offsetDraft && S.offsetDraft.hostId != null) {
        var oh = wallById(S.offsetDraft.hostId);
        if (oh) {
          S.offsetDraft.side = offsetSideFromCursor(oh, px, pz);
          S.previewPt = { x: px, z: pz };
        }
      } else {
        S.previewPt = { x: px, z: pz };
      }
      render2D();
      return;
    }
    if (S.action === "wallbite" && S.biteDraft) {
      var bWall = wallById(S.biteDraft.wall);
      var bProj = bWall && wallProject(bWall, px, pz);
      if (bProj) S.biteDraft.s1 = clamp(bProj.s, 0, wallGeom(bWall).L);
      render2D();
      return;
    }
    if (S.tool === "wallbreak" || S.tool === "walljoin" || S.tool === "wallreverse" || S.tool === "wallpaint" || S.tool === "wallbite") {
      S.previewPt = { x: px, z: pz };
      render2D();
      return;
    }
    if (S.tool === "erase") {
      S.eraseHover = pickErase(px, pz, e.offsetX, e.offsetY);
      if (S.action === "erase" && S.eraseHover) (0, interactionLocals.strokeErase)(S.eraseHover);
      render2D();
      return;
    }
    if (S.tool === "arcwall") {
      var ap = snapPoint(px, pz, null);
      S.previewPt = fin(ap.x) && fin(ap.z) ? { x: ap.x, z: ap.z } : null;
      render2D();
      return;
    }
    if (S.tool === "rect" || S.tool === "slabvoid") {
      var rrp = snapPoint(px, pz, null);
      S.previewPt = fin(rrp.x) && fin(rrp.z) ? { x: rrp.x, z: rrp.z } : null;
      render2D();
      return;
    }
    if (S.tool === "roomstamp") {
      S.previewPt = fin(px) && fin(pz) ? { x: px, z: pz } : null;
      updateRoomGhost(px, pz);
      render2D();
      return;
    }
    if (S.placeType && (!S.tool || S.tool === "select")) {
      var plp = snapPoint(px, pz, null);
      S.previewPt = { x: plp.x, z: plp.z };
      render2D();
      return;
    }
    if (S.tool === "door" || S.tool === "window" || S.tool === "passage") {
      render2D(); // refresh the direct-touch lens while sliding along its host
      return;
    }
    // placeholder-point tool: ghost the snapped landing spot (snapPoint also
    // fills S.snapGuides, so the alignment run to a corner is visible too)
    if (S.tool === "point") {
      var pp = snapPoint(px, pz, null);
      S.markerPreview = fin(pp.x) && fin(pp.z) ? planPickSurface(pp, px, pz) : null;
      render2D();
      return;
    }
    // MEP route rubber-band + CAD angle readout
    if (S.tool === "mepRoute") {
      var mr = ensureMEP();
      if (mr.route && mr.route.pts.length) {
        var last = mr.route.pts[mr.route.pts.length - 1];
        var res = routeResolve(last, px, pz);
        // delta angle vs. the previous committed segment
        if (mr.route.pts.length >= 2) {
          var pv = mr.route.pts[mr.route.pts.length - 2];
          var pang = Math.atan2(last.z - pv.z, last.x - pv.x);
          var da = Math.abs(((res.ang - pang) * 180) / Math.PI);
          da = da % 360; if (da > 180) da = 360 - da;
          res.dAng = Math.round(da);
        }
        // in wall-follow mode show the path that will actually be committed,
        // recomputed only when the resolved end has really moved
        if (mr.wallRoute) {
          var pk = Math.round(res.x) + "," + Math.round(res.z);
          if (mr.route._pk !== pk) {
            mr.route._pk = pk;
            mr.route.previewPath = wallPath(last, res, mr.layer);
            mr.route.previewBlocked = !mr.route.previewPath;
          }
        } else { mr.route.previewPath = null; mr.route.previewBlocked = false; }
        mr.route.preview = res;
        render2D();
      }
      return;
    }
    // MEP drag (node / vertex / whole run)
    if (S.action === "mep" && S.mepDrag) {
      commitPending();
      dragMEP(px, pz);
      S.dirty3D = true;
      render2D();
      return;
    }
    // always-on distance overlay: track the cursor + the item under it while
    // idle on the select tool (over empty floor it measures from the point).
    if (!S.action && S.tool === "select") {
      /* Hover follows the FOCUSED layers only — rank 0, not merely "hittable".
         Rank 1 stays clickable on purpose, but hover is the readout that runs
         with no click at all, and a hover card that keeps inspecting the wall
         while you are aiming at the TV in front of it re-creates exactly the
         problem the two-pass pick chain removes. So each band below asks for
         rank 0 rather than reusing the hit test's Infinity gate. */
      var focus = {
        structure: layerRank("structure") === 0,
        furniture: layerRank("furniture") === 0,
        annotations: layerRank("annotations") === 0,
      };
      S.hoverItem = focus.furniture ? hitItem(px, pz) : null;
      S.hoverPt = { x: px, z: pz };
      // a point under the cursor reads itself out without being selected —
      // same precedence as the click path, where a point wins over the piece
      // standing on it
      S.hoverMarker = focus.annotations ? hitMarker(px, pz, inputScale()) : null;
      // ...and a corner under it reads out the same way, so "what meets here,
      // at what angle" is answerable without clicking anything
      S.hoverNode = focus.structure && S.hoverMarker == null ? hitNode(px, pz) : null;
      // Constraint labels are real pick targets, so hovering one must reveal
      // the same relation that a click would select (and the same row in the
      // side panel). Screen coordinates are used because pickCon records the
      // exact boxes rendered by the canvas.
      var hoverCon = focus.annotations ? pickCon(e.offsetX, e.offsetY) : null;
      setConstraintHover(hoverCon);
      plan.style.cursor = hoverCon ? "pointer" : "default";
      // hovering the selected wall highlights the half you'd be resizing
      S.wallHoverHalf =
        focus.structure && S.sel && S.sel.kind === "wall" && hitWall(px, pz) === S.sel.ref
          ? wallHalfAt(S.sel.ref, px, pz)
          : null;
      /* Passing over a glowing corner lights up its row in the warning list —
         and hovering that row lights up the corner. Same field, both ways
         round, so the plan and the list are never telling different stories. */
      var hoverWarn = focus.annotations ? hitWarning(px, pz, tolCm(14)) : null;
      var hk = hoverWarn ? hoverWarn.key : null;
      if (hk !== S.warnHover) {
        S.warnHover = hk;
        syncWarnHighlight();
      }
      render2D();
      return;
    }
    if (!S.action) return;
    if (S.action === "pan") {
      // a screen-space drag maps to a base-frame shift rotated by −planRot
      var pa = -planRotRad();
      var dpx = e.offsetX - S.panStart.px, dpy = e.offsetY - S.panStart.py;
      S.OX = S.panStart.ox + dpx * Math.cos(pa) - dpy * Math.sin(pa);
      S.OY = S.panStart.oy + dpx * Math.sin(pa) + dpy * Math.cos(pa);
      render2D();
      return;
    }
    // dragging a placeholder point: same drafting snap as placing it, and the
    // object standing on it comes along (moveMarker carries it)
    if (S.action === "marker" && S.sel && S.sel.kind === "marker") {
      commitPending();
      var mps = snapPoint(px - S.dragOff.x, pz - S.dragOff.z, null);
      // the plan edits x/z only — a point's height belongs to the elevations
      moveMarker(S.sel.ref, mps.x, S.sel.ref.y, mps.z);
      touchItem3D(markerItem(S.sel.ref), "move");
      render2D();
      return;
    }
    if (S.action === "slabvoid" && S.sel && S.sel.kind === "slabvoid") {
      commitPending();
      var snapped = snapPoint(px - S.dragOff.x, pz - S.dragOff.z, null);
      S.sel.ref.x = snapped.x;
      S.sel.ref.z = snapped.z;
      S.dirty3D = true;
      render2D();
      return;
    }
    if (S.action === "item" && S.sel && (S.sel.kind === "item" || S.sel.kind === "items")) {
      commitPending();
      /* Alt suspends the automatic facing for THIS drag only (endAction clears
         it). The angle a piece was given by hand is otherwise remembered for
         good, which is too big a commitment for "just this once". */
      S.orientHold = !!e.altKey;
      if (S.sel.kind === "items") {
        var tarX = Math.round((px - S.dragOff.x) / 2) * 2;
        var tarZ = Math.round((pz - S.dragOff.z) / 2) * 2;
        var cx = 0, cz = 0;
        S.dragOrig.forEach(function(o) { cx += o.x; cz += o.z; });
        cx /= S.dragOrig.length; cz /= S.dragOrig.length;
        var mdx = tarX - cx, mdz = tarZ - cz;
        // pieces standing on a dragged piece travel with it — but only once, so
        // a selection holding both a table and the lamp on it stays put
        var movedSet = new Set();
        S.dragOrig.forEach(function(o) { movedSet.add(o.it); });
        var frameMoves = S.dragOrig.map(function(o) {
          return { entry: o, dx: o.x + mdx - o.it.x, dz: o.z + mdz - o.it.z };
        });
        frameMoves.forEach(function(move) {
           var o = move.entry;
           o.it.x += move.dx;
           o.it.z += move.dz;
           touchItem3D(o.it, "move");
        });
        frameMoves.forEach(function (move) {
          carryChildren(move.entry.it, move.dx, move.dz, movedSet).forEach(function (c) {
            touchItem3D(c, "move");
          });
        });
        S.dragOrig.forEach(function (o) { refreshSupport(o.it); });
      } else {
        moveItemTo(S.sel.ref, px - S.dragOff.x, pz - S.dragOff.z);
      }
      // nothing but the piece's own transform moved — a whole-scene rebuild per
      // pointermove is what made dragging feel like it lagged a second behind
      render2D();
      return;
    }
    if (S.action === "node" && S.nodeDrag) {
      commitPending();
      var ni = S.nodeDrag.node;
      if (!S.nodes[ni]) return;
      /* Which walls this gesture is allowed to reshape. Grabbing the end of the
         wall you already had selected edits THAT wall — everything else meeting
         the corner keeps its locked length and angle and lets go of the joint.
         Grabbing a bare corner is a direct move of the joint itself, so all of
         its walls follow it (and re-record their measurements when it lands). */
      var active = [];
      S.walls.forEach(function (w) {
        if (w.a !== ni && w.b !== ni) return;
        if (!S.nodeDrag.wall || S.nodeDrag.wall === w.id) active.push(w.id);
      });
      // Every wall meeting this corner is a valid angle reference, plus the
      // corner itself so it can't snap onto its own position. Using only the
      // first neighbour (as this did) let one edge of a rectangle stay square
      // while the other drifted off-angle.
      var connected = [ni];
      S.walls.forEach(function (w) {
        if (w.a === ni) connected.push(w.b);
        if (w.b === ni) connected.push(w.a);
      });
      var before = snapshotNodes();
      // same rule as the wall tool: dropped near a wall's own corner, it IS
      // that corner — splitting there would leave a stub with no length
      var p = resolveLanding(snapPoint(px, pz, connected));
      if (p.walls && p.walls.length) {
        var crossing = splitIntersectionWalls(p);
        if (crossing != null) p = { x: p.x, z: p.z, node: crossing, wall: null };
      }
      if (p.node != null) {
        S.nodeDrag.landOn = null; // a corner-to-corner weld is not a wall landing
        S.nodes[ni].x = S.nodes[p.node].x;
        S.nodes[ni].z = S.nodes[p.node].z;
        S.jointsReleased += enforceLocks(before, active);
        (0, interactionLocals.dragSolve)([ni, p.node]);
        auditDragProxy(before);
        // coincident is not connected — merge, or the shape only LOOKS closed.
        // The walls being dragged may change shape to make the joint; anything
        // else at that corner may not, and enforceLocks has already given those
        // their own corner back, so this weld can only touch the dragged ones.
        if (canWeld(p.node, ni, active)) {
          weldNodes(p.node, ni);
          // a weld renumbers S.nodes, and the proxy's corner list is indices —
          // there is nothing to remap it to, so the gesture finishes unproxied
          dropDragProxy();
          ni = p.node;
          if (!S.nodeDrag.wall) select({ kind: "node", ref: ni });
          S.nodeDrag.node = ni;
        }
      } else if (p.wall) {
        /* Dropping a corner onto a wall joins it there — but that join is a
           topology commit (a split AND a weld), and doing it on every
           pointermove shredded the host. Each frame split what was left of it
           again: dragging one corner of a room along the wall next to it left a
           chain of stubs, a pile of coincident corners and a shape that no
           longer closed. Preview it as a plain move, remember the host, and
           commit once when the gesture ends. */
        S.nodes[ni].x = p.x;
        S.nodes[ni].z = p.z;
        S.nodeDrag.landOn = p.wall.id;
        S.jointsReleased += enforceLocks(before, active);
        (0, interactionLocals.dragSolve)([ni]);
        auditDragProxy(before);
      } else {
        S.nodes[ni].x = p.x;
        S.nodes[ni].z = p.z;
        S.nodeDrag.landOn = null;
        S.jointsReleased += enforceLocks(before, active);
        (0, interactionLocals.dragSolve)([ni]);
        auditDragProxy(before);
      }
      S.dirty3D = true;
      fillProps();
      render2D();
      return;
    }
    /* Whole-wall translation. Both corners move by the same vector, so the
       wall itself is not being re-dimensioned — only whatever else hangs off
       those corners is. Alignment works like the room drag: the pair of
       corners snaps to any other corner they line up with, so a wall slid
       across the plan still lands square with the rest of it. */
    if (S.action === "wall" && S.wallDrag) {
      commitPending();
      var wd = S.wallDrag;
      var wdx = Math.round((px - wd.sx) / SNAP_GRID) * SNAP_GRID,
        wdz = Math.round((pz - wd.sz) / SNAP_GRID) * SNAP_GRID,
        WTHR = 12 / inputScale();
      // A side handle has one degree of freedom. Remove off-axis pointer
      // motion before angle snapping, otherwise symmetry can turn it into an
      // unwanted change of the room's width or depth.
      if (wd.edge) { if (wd.edge.axis === "x") wdz = 0; else wdx = 0; }
      var mine = {};
      wd.orig.forEach(function (o) {
        mine[o.i] = 1;
      });
      var oxs = [],
        ozs = [],
        used = usedNodes();
      for (var uk in used) {
        if (mine[uk]) continue;
        oxs.push(S.nodes[uk].x);
        ozs.push(S.nodes[uk].z);
      }
      var wxs = wd.orig.map(function (o) {
          return o.x + wdx;
        }),
        wzs = wd.orig.map(function (o) {
          return o.z + wdz;
        });
      var wax = snapAdj(
        [Math.min.apply(null, wxs), Math.max.apply(null, wxs)],
        oxs,
        WTHR,
      );
      var waz = snapAdj(
        [Math.min.apply(null, wzs), Math.max.apply(null, wzs)],
        ozs,
        WTHR,
      );
      var moveX = wdx + wax,
        moveZ = wdz + waz,
        base = {
          a: { x: wd.orig[0].x, z: wd.orig[0].z },
          b: { x: wd.orig[1].x, z: wd.orig[1].z },
        },
        symmetryOn =
          S.osnap !== false &&
          (!S.snapKinds || S.snapKinds.symmetry !== false),
        equal = symmetryOn
          ? equalWallAngleTranslation(wd.wall, base, moveX, moveZ)
          : null,
        strength = fin(S.snapStrength) ? S.snapStrength : 1,
        catchDist = (8 * strength) / inputScale(),
        previewDist = (28 * strength) / inputScale();
      S.wallAngleGuide = null;
      if (equal && equal.correction <= previewDist) {
        var caught = equal.correction <= catchDist;
        S.wallAngleGuide = {
          wall: wd.wall,
          pair: equal.pair,
          angleA: caught ? equal.angle : equal.rawA,
          angleB: caught ? equal.angle : equal.rawB,
          correctionX: equal.correctionX,
          correctionZ: equal.correctionZ,
          snapped: caught,
        };
        if (caught) {
          moveX = equal.dx;
          moveZ = equal.dz;
        }
      }
      /* A room-edge drag is the same move with two rules on it: the side may
         only travel along its own normal, and it may not be pushed so far in
         that the room stops being one. Applied here rather than at the start
         so the grid quantisation and the equal-angle snap above still get
         their say about how far along that normal it lands. */
      if (wd.edge) {
        if (wd.edge.axis === "x") moveZ = 0; else moveX = 0;
        var lim = wd.limit;
        if (lim) {
          var from = wd.edge.axis === "x" ? wd.orig[0].x : wd.orig[0].z;
          var to = from + (wd.edge.axis === "x" ? moveX : moveZ);
          if (lim.sign * (to - lim.opposite) < lim.minSpan) {
            to = lim.opposite + lim.sign * lim.minSpan;
            if (wd.edge.axis === "x") moveX = to - from; else moveZ = to - from;
          }
        }
      }
      var beforeWall = snapshotNodes();
      wd.orig.forEach(function (o) {
        S.nodes[o.i].x = o.x + moveX;
        S.nodes[o.i].z = o.z + moveZ;
      });
      /* Every wall meeting either corner is part of this edit and may change
         shape — the same rule as grabbing a bare corner, applied to both of a
         wall's corners at once. Handing enforceLocks an empty active list (as
         a room drag does) would be wrong here: a room drag tears loose only
         the walls that BRIDGE it to something else, but every neighbour of a
         single wall is such a bridge, so the wall would leave the plan open
         behind it on every drag. */
      var wact = S.walls
        .filter(function (w) {
          return mine[w.a] || mine[w.b];
        })
        .map(function (w) {
          return w.id;
        });
      S.jointsReleased += enforceLocks(beforeWall, wact);
      (0, interactionLocals.dragSolve)(Object.keys(mine).map(Number));
      auditDragProxy(beforeWall);
      S.dirty3D = true;
      render2D();
      return;
    }
    if (S.action === "opening" && S.sel && S.sel.kind === "opening") {
      commitPending();
      var o = S.sel.ref,
        w = wallById(o.wall),
        gm = wallGeom(w);
      var s = (px - gm.a.x) * gm.ux + (pz - gm.a.z) * gm.uz - S.dragOff.s;
      o.s = clamp(s, o.width / 2, gm.L - o.width / 2);
      S.dirty3D = true;
      render2D();
      return;
    }
    if (S.action === "room" && S.dragRoom) {
      if (!S.dragRoom.started) {
        if (Math.hypot(px - S.dragRoom.sx, pz - S.dragRoom.sz) * inputScale() < 3) return;
        commitPending();
        var carry = detachRoomSeam(S, S.dragRoom.key, detectRooms());
        if (carry) S.dragRoom.orig = carry.map(function (i) {
          return { i: i, x: S.nodes[i].x, z: S.nodes[i].z };
        });
        S.dragRoom.started = true;
      }
      commitPending();
      var dx = Math.round((px - S.dragRoom.sx) / SNAP_GRID) * SNAP_GRID,
        dz = Math.round((pz - S.dragRoom.sz) / SNAP_GRID) * SNAP_GRID,
        THR = 12 / inputScale();
      var inR = {};
      S.dragRoom.orig.forEach(function (o) {
        inR[o.i] = 1;
      });
      var ox = [],
        oz = [],
        u = usedNodes();
      for (var k in u) {
        if (inR[k]) continue;
        ox.push(S.nodes[k].x);
        oz.push(S.nodes[k].z);
      }
      var xs = S.dragRoom.orig.map(function (o) {
          return o.x + dx;
        }),
        zs = S.dragRoom.orig.map(function (o) {
          return o.z + dz;
        });
      var ax = snapAdj(
        [Math.min.apply(null, xs), Math.max.apply(null, xs)],
        ox,
        THR,
      );
      var az = snapAdj(
        [Math.min.apply(null, zs), Math.max.apply(null, zs)],
        oz,
        THR,
      );
      /* The same magnet the preset tool places rooms with.
       *
         snapAdj above lines the room's bounding box up with other CORNERS, so
         it only helps when something already sits at that exact coordinate.
         Pushing a room against the side of a longer wall — the "drag them
         together until they share a wall" gesture this whole feature is for —
         matched nothing, and the room came to rest two or three centimetres
         off. Two or three centimetres is worse than either touching or being
         clearly apart: the drop's weld tolerance is 2 cm, so it looks joined
         and is not.

         So the dock solver gets first refusal, exactly as it does while
         stamping, and only falls back to the corner alignment. Its own walls
         are excluded, or the room would dock against itself.

         A corridor answer is allowed here too, and drawn while the drag is
         still live: hold a room roughly a corridor's width off a wall and the
         hallway that would be built appears in the gap, outlined, before
         anything is committed. That preview is the whole licence for the mode
         — a room springing into existence on release that the user was never
         shown would be the app inventing geometry. */
      var roomRect = {
        x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
        z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs),
      };
      var roomDock = solveDock(S, roomRect, {
        snap: 40 * (fin(S.snapStrength) ? S.snapStrength : 1),
        skipWalls: roomOwnWalls(S.dragRoom),
      });
      if (roomDock) { ax = roomDock.dx; az = roomDock.dz; }
      S.dragRoom.dock = roomDock;
      /* The gap is measured from where the room is ABOUT to be, not where the
         pointer left it — the snap above is part of the proposal. */
      S.dragRoom.corridor = roomDock && roomDock.mode === "corridor"
        ? corridorRect(translateRect(roomRect, roomDock.dx, roomDock.dz), roomDock)
        : null;
      var beforeRoom = snapshotNodes();
      S.dragRoom.orig.forEach(function (o) {
        S.nodes[o.i].x = o.x + dx + ax;
        S.nodes[o.i].z = o.z + dz + az;
      });
      /* The room's own walls travel rigidly, so none of their dimensions change
         and enforceLocks leaves them alone. A wall that BRIDGES this room and
         something else does get stretched — that one lets go instead, which is
         the whole rule: the room moves, the corridor wall keeps its length. */
      S.jointsReleased += enforceLocks(beforeRoom, []);
      solveWallCons();
      if (S.dragRoom.items)
        S.dragRoom.items.forEach(function (o) {
          o.it.x = o.x + dx + ax;
          o.it.z = o.z + dz + az;
        });
      S.dirty3D = true;
      render2D();
      return;
    }
  };
}

export { wirePlanMove };

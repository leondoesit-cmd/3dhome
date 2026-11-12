/* The planner's 3D-view editing hooks that js/view3d.js drives, split out of
   js/interaction.js. It shares the editor's state through live imports from
   ../interaction.js. */
import { wallById, wallGeom } from "../geometry.js";
import { beginHistory, cancelPending, commitPending, pushHistory } from "../history.js";
import { finalizeItemPlacement, moveItemTo } from "../interaction/layout_drag.js";
import { blockedDrag } from "../interaction/wall_edit.js";
import { markManualRot } from "../item_orient.js";
import { canDrag } from "../layers.js";
import { broadcastPlanOp, itemMovePlanOps } from "../plan_sync.js";
import { render2D } from "../plan2d.js";
import { descendantsOf, detach as stackDetach, reseat as stackReseat } from "../stack.js";
import { S, clamp, touchItem3D } from "../state.js";
import { fillProps, select, syncStairVoids } from "../ui.js";

/* ---- 3D-view editing (js/view3d.js drives these) ----
   The 3D view owns the picking and the ray→floor math; everything that touches
   the model itself lives here, next to the plan drag it mirrors — history,
   snapping and stacking must not fork per view. */
/* The 3D twin of a rank-1 pick in the plan. A click on something off the work
   set still answers "what is this" — it selects and fills the inspector — but
   it must not arm a gesture, so js/view3d.js calls this instead of a
   begin*Drag and then hands the press to the orbit.

   It lives here rather than in view3d.js because `select` comes from ui.js and
   ui.js already imports view3d.js; the reverse edge would be a cycle. view3d
   reaches it through the same lazily-imported `editMod` it uses for the drag
   verbs. Without it the 3D pane is a dead surface for anything structural
   under the boot work set, while the identical click in 2D fills the panel. */
export function select3DTarget(sel) {
  if (!sel || !sel.ref) return false;
  select(sel);
  S.action = "item";
  render2D();
  return true;
}
export function begin3DItemDrag(it) {
  if (!it) return false;
  /* One permission for both views. The 3D drag used to consult only the
     piece's own `locked` flag, so a work set or a layer padlock that stopped
     the plan drag did nothing here and the two views disagreed about whether
     the same piece could be moved. `canDrag` is the single answer; the refusal
     is announced so the pill appears at the cursor in 3D as well. */
  var sel = { kind: "item", ref: it };
  if (!canDrag(sel)) {
    blockedDrag(sel);
    return false;
  }
  select(sel);
  S.action = "item";
  S.itemSnapWall = null;
  S.orientHold = false;
  beginHistory();
  render2D();
  return true;
}
export function drag3DItemTo(it, nx, nz) {
  if (!it) return;
  commitPending();
  moveItemTo(it, nx, nz);
  render2D();
}
// raise/lower the piece off its floor (Alt-drag in 3D). Detaches from a host,
// because "hovering 40cm over the table" is a manual height, not a stack.
export function drag3DItemElev(it, elev) {
  if (!it) return;
  commitPending();
  if (it.on != null) stackDetach(it);
  it.elev = Math.max(0, Math.round(elev));
  touchItem3D(it, "move");
  stackReseat(it);
  descendantsOf(it, new Set([it]), []).forEach(function (c) {
    touchItem3D(c, "move");
  });
  render2D();
}
/* Openings drag in 3D too — the same slide along their host wall the plan drag
   does, so a door can be nudged while you are looking at the room it opens
   into. Walls themselves stay fixed: their geometry is the frame everything
   else is measured against, and the plan is the place to redraw it. */
export function begin3DOpeningDrag(o) {
  if (!o || !wallById(o.wall)) return false;
  select({ kind: "opening", ref: o });
  beginHistory();
  render2D();
  return true;
}
// where a world point falls along the opening's wall (cm from the wall start),
// or null when the wall is gone — the 3D view uses it to take a grab offset
export function opening3DPos(o, x, z) {
  var w = o && wallById(o.wall);
  if (!w) return null;
  var gm = wallGeom(w);
  if (!gm || gm.L < 1) return null;
  return (x - gm.a.x) * gm.ux + (z - gm.a.z) * gm.uz;
}
export function drag3DOpeningTo(o, x, z, offS) {
  var s = opening3DPos(o, x, z);
  if (s == null) return;
  commitPending();
  var gm = wallGeom(wallById(o.wall));
  o.s = clamp(s + (offS || 0), o.width / 2, gm.L - o.width / 2);
  S.dirty3D = true;
  render2D();
}
export function end3DOpeningDrag() {
  cancelPending();
  fillProps();
  render2D();
}

export function end3DItemDrag() {
  cancelPending();
  if (S.sel && S.sel.kind === "item") {
    finalizeItemPlacement(S.sel.ref, { releaseMarker: true, holdWallId: S.itemSnapWall });
    if (syncStairVoids(S.sel.ref)) render2D();
    itemMovePlanOps([S.sel.ref], S.items).forEach(broadcastPlanOp);
  }
  S.itemSnapWall = null;
  S.orientHold = false;
  if (S.stackHost || S.alignX != null || S.alignZ != null) {
    S.stackHost = null;
    S.alignX = S.alignZ = null;
  }
  S.action = null;
  fillProps();
  render2D();
}

export function rotateItems(deg) {
  if (!S.sel || S.sel.kind !== "items") return;
  pushHistory();
  var cx = 0, cz = 0;
  S.sel.refs.forEach(function(it) { cx += it.x; cz += it.z; });
  cx /= S.sel.refs.length; cz /= S.sel.refs.length;
  var a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  /* Pieces standing on a rotated piece turn with it, about the SAME centre as
     the selection — a stack has to arrive where its host arrives, so it takes
     the group's transform, not one about its own host. */
  var spun = new Set(S.sel.refs),
    riders = [];
  S.sel.refs.forEach(function (it) { descendantsOf(it, spun, riders); });
  S.sel.refs.concat(riders).forEach(function(it) {
      var dx = it.x - cx, dz = it.z - cz;
      it.x = cx + dx * ca - dz * sa;
      it.z = cz + dx * sa + dz * ca;
      it.rot = ((((it.rot || 0) + deg) % 360) + 360) % 360;
      // turned by hand -> the automatic facing leaves it alone from here
      markManualRot(it);
  });
  S.dirty3D = true;
  fillProps();
  render2D();
}

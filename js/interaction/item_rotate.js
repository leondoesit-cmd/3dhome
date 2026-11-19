/* The plan's rotate grip: a round handle beyond the middle of a selected
   item's back edge. Dragging it turns the item about its centre (15° snaps,
   Shift for whole degrees) through turnItem, as ONE undo step, with the
   inspector's angle following live and the angle shown by the handle.

   pointerDown / planMove / endAction (size-frozen) each call in with one
   line; the geometry is js/rotate_grip.js (pure, tested). */
import { canDrag } from "../layers.js";
import { isElevation } from "../elevation.js";
import { beginHistory, commitPending } from "../history.js";
import { onAfterRender, planHud, planViewReady, render2D, rotatePx, sx, sz } from "../plan2d.js";
import { inputIs3D } from "../planner_input.js";
import { broadcastPlanOp, itemMovePlanOps } from "../plan_sync.js";
import { settleKept } from "../item_keep_edit.js";
import { gripAngle, gripHitPx, rotateGrip } from "../rotate_grip.js";
import { S, touchItem3D } from "../state.js";
import { fillProps, refreshTree, turnItem } from "../ui.js";

var rotDrag = null;

// the single selected item that can show a grip, or null
function gripItem() {
  if (!S.sel || S.sel.kind !== "item" || !S.sel.ref || S.sel.ref.locked) return null;
  if ((S.tool && S.tool !== "select") || isElevation() || inputIs3D()) return null;
  if (S.items.indexOf(S.sel.ref) === -1 || !(S.SC > 0)) return null;
  return canDrag(S.sel) ? S.sel.ref : null;
}

/* pointerDown: a press on the grip starts the turn (it outranks the item's
   own drag, which only answers a press inside the footprint). */
export function itemRotateDown(e, px, pz) {
  var it = gripItem();
  if (!it || e.button === 2) return false;
  var g = rotateGrip(it, S.SC);
  if (Math.hypot(px - g.handle.x, pz - g.handle.z) * S.SC > gripHitPx(e.pointerType)) return false;
  S.action = "itemRotate";
  rotDrag = { it: it, start: it.rot || 0 };
  beginHistory();
  render2D();
  return true;
}

function syncRotFields(deg) {
  ["i_rot", "i_rot_range"].forEach(function (id) {
    var f = document.getElementById(id);
    if (f) f.value = Math.round(deg);
  });
}

export function itemRotateMove(e, px, pz) {
  if (!rotDrag) return;
  var it = rotDrag.it, deg = gripAngle(it, px, pz, !!(e && e.shiftKey));
  if (deg === (((it.rot || 0) % 360) + 360) % 360) return;
  commitPending(); // the first real turn makes the gesture's one undo step
  turnItem(it, deg);
  touchItem3D(it, "move");
  syncRotFields(deg);
  render2D();
}

export function itemRotateUp() {
  if (!rotDrag) return;
  var it = rotDrag.it, moved = (it.rot || 0) !== rotDrag.start;
  rotDrag = null;
  if (!moved) return;
  settleKept(it);
  itemMovePlanOps([it], S.items).forEach(broadcastPlanOp);
  fillProps();
  refreshTree();
  S.dirty3D = true;
}

// the grip, painted on the HUD after each frame, with the angle while turning
function paintGrip() {
  if (!planHud || !planViewReady()) return;
  var it = gripItem();
  if (!it) return;
  var c = planHud.getContext("2d");
  if (!c) return;
  var g = rotateGrip(it, S.SC), a = rotatePx(sx(g.stem.x), sz(g.stem.z)), h = rotatePx(sx(g.handle.x), sz(g.handle.z));
  var turning = S.action === "itemRotate" && rotDrag && rotDrag.it === it;
  c.save();
  c.strokeStyle = "#3f6b78";
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(h.x, h.y);
  c.stroke();
  c.beginPath();
  c.arc(h.x, h.y, 6, 0, Math.PI * 2);
  c.fillStyle = turning ? "#3f6b78" : "#ffffff";
  c.fill();
  c.stroke();
  // a little turning arrow inside the handle
  c.beginPath();
  c.arc(h.x, h.y, 3, -Math.PI * 0.9, Math.PI * 0.4);
  c.strokeStyle = turning ? "#ffffff" : "#3f6b78";
  c.lineWidth = 1.1;
  c.stroke();
  if (turning) {
    var txt = Math.round(it.rot || 0) + "°";
    c.font = "bold 12px Arial";
    var tw = c.measureText(txt).width;
    c.fillStyle = "rgba(255,255,255,.9)";
    c.fillRect(h.x + 10, h.y - 18, tw + 8, 16);
    c.fillStyle = "#26231f";
    c.textBaseline = "middle";
    c.fillText(txt, h.x + 14, h.y - 10);
  }
  c.restore();
}

onAfterRender(paintGrip);

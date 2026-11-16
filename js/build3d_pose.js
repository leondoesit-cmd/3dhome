/* Where a library piece would stand if the plan were clicked here, worked out
   the way the click does it (js/ui.js placeFurnAt → item.place): the point
   snapped to 2 cm (js/commands/item_place.js), then item_orient.js
   seatNewPiece with the piece it would stand on as context (facing, the
   flush-to-wall nudge, the wall resolver). Nothing is
   created: the piece is a throwaway object that never enters S.items.

   The height comes from the measured-span cache only (knownVSpan), so a
   pointermove never builds a model; an unmeasured piece is queued and stands
   on the floor until it has been measured. */
import { FURN, knownVSpan, measureVSpanSoon } from "./furniture.js";
import { seatNewPiece } from "./item_orient.js";
import { findSupport } from "./stack.js";

function snap2(v) { return Math.round(v / 2) * 2; }

/** { x, z, rot, w, d, y0, y1 } for `type` dropped at (x, z), or null. */
export function placementPose(type, x, z) {
  var f = FURN[type];
  if (!f || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  var px = snap2(x), pz = snap2(z);
  var it = { id: "__build3d_pose__", type: type, x: px, z: pz, w: f.w || 60, d: f.d || 60, h: f.h || 80, rot: 0 };
  var ctx = { host: findSupport(it, px, pz) };
  seatNewPiece(it, px, pz, ctx);
  var span = null;
  try { span = knownVSpan(it); } catch (_) { span = null; }
  if (!span) {
    try { measureVSpanSoon(it); } catch (_) { /* measured on a later move */ }
    span = { lo: 0, hi: it.h };
  }
  return { x: it.x, z: it.z, rot: Number(it.rot) || 0, w: it.w, d: it.d, y0: span.lo, y1: span.hi };
}

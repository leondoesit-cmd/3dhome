/* Kept distances in the planner, the editing half (the reading half, the
   plan as a scene, is js/item_keep_scene.js).

   - setDistance(it, src, cm, opts): "type a number" — moves the piece (one
     undo step) so the distance `src` measured becomes `cm`; with opts.keep it
     also keeps it. addKeep / removeKeep / setKeepValue edit `it.keep`.
   - reseatKeptItems(opts): pieces with kept distances re-solved after an
     edit, in keepOrder; settleKept(it) after a piece is dropped / turned.
     The drag rule: a piece with keeps drags freely; on drop its keeps apply
     again (only along the directions they fix), so a drop that broke one
     settles back, with a short message naming it. With Alt held (S.conOverride,
     as for the wall dimensions) the drop leaves its keeps alone and they
     show as not met. A locked piece is never moved by a keep.
   Every move goes through moveItemBy: the stack riding on the piece moves
   with it, a held piece's hold.gap follows (js/item_align.js reseatHeldItems
   would pull it back otherwise), the 3D view is told per piece. */
import { S, touchItem3D } from "./state.js";
import { flabel, itemVSpan } from "./furniture.js";
import { carryChildren, descendantsOf, detach as stackDetach, reseat as stackReseat } from "./stack.js";
import { pushHistory } from "./history.js";
import { broadcastPlanOp, itemMovePlanOps } from "./plan_sync.js";
import { render2D } from "./plan2d.js";
import { fillProps, flash } from "./ui.js";
import { fmtLen } from "./display_units.js";
import { reachName } from "./wall_plane_strings.js";
import { distanceText, num } from "./distance_strings.js";
import { normalizeKeeps } from "./item_keep.js";
import { checkAddKeep, holdGap, planDistance, pruneAll, reseatKept, toKeep } from "./item_keep_plan.js";
import { keepItem, keepScene } from "./item_keep_scene.js";

function n(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }

function allKeeps() {
  return (S.items || []).filter(function (o) { return o && Array.isArray(o.keep) && o.keep.length; })
    .map(function (o) { return { id: o.id, keep: o.keep }; });
}

/* Move a piece (and what stands on it) by a translation; dy re-hangs it. */
function moveItemBy(it, d) {
  var out = [], dx = n(d.dx, 0), dz = n(d.dz, 0), dy = n(d.dy, 0);
  if (dx || dz) {
    it.x = n(it.x, 0) + dx; it.z = n(it.z, 0) + dz;
    carryChildren(it, dx, dz, new Set([it]), out);
  }
  if (dy) {
    var sp = itemVSpan(it), lo = sp && Number.isFinite(sp.lo) ? sp.lo : n(it.elev, 0);
    if (it.on != null) stackDetach(it);
    it.elev = Math.max(0, Math.round((lo + dy) * 1000) / 1000);
    stackReseat(it);
    descendantsOf(it, new Set([it].concat(out)), out);
  }
  syncHoldGap(it);
  touchItem3D(it, "move");
  out.forEach(function (c) { touchItem3D(c, "move"); });
}
/* A held piece keeps the gap it now has, so the hold does not undo the move. */
function syncHoldGap(it) {
  if (!it.hold || it.hold.wall == null) return;
  var g = holdGap(it.hold, keepItem(it), keepScene());
  if (g != null) it.hold.gap = Math.round(g * 1000) / 1000;
}

function sync(list) {
  if (!list.length) return;
  try { itemMovePlanOps(list, S.items).forEach(broadcastPlanOp); } catch (_) { /* offline */ }
}
function repaint() {
  S.dirty3D = true;
  render2D();
  try { fillProps(); } catch (_) { /* inspector not built (tests) */ }
}

/** Re-solve pieces with kept distances (no history step: it runs inside the
 *  edit that called it). opts: { only: [id] the pieces that changed (others
 *  kept to them follow); skip(it) leaves a piece where it is }. Returns the
 *  pieces it moved (already broadcast). */
export function reseatKeptItems(opts) {
  opts = opts || {};
  var r = reseatKept(S.items, { scene: keepScene, me: keepItem, move: moveItemBy, skip: opts.skip }, opts.only ? { only: opts.only } : null);
  sync(r.moved);
  return r.moved;
}
/** After a piece was dropped / turned / resized: its keeps apply again
 *  (unless Alt is held), and the pieces kept to it follow. */
export function settleKept(it) {
  if (!it || it.id == null) return [];
  var alt = !!S.conOverride || altHeld, x = it.x, z = it.z, mine = Array.isArray(it.keep) && it.keep.length;
  var moved = reseatKeptItems({ only: [String(it.id)], skip: alt ? function (o) { return o === it; } : null });
  if (mine && !alt && Math.hypot(n(it.x, 0) - n(x, 0), n(it.z, 0) - n(z, 0)) > 0.5) {
    var k = normalizeKeeps(it.keep)[0];
    if (k) flash(distanceText("keptBack", { what: keepName(k), value: num(fmtLen(k.value, { domain: "furniture" })) }));
  }
  return moved;
}
/** Dropped pieces: the roots plus whatever their keeps moved, for broadcasting. */
export function keptAfterDrop(roots) {
  var list = (roots || []).slice();
  (roots || []).forEach(function (it) {
    settleKept(it).forEach(function (m) { if (list.indexOf(m) === -1) list.push(m); });
  });
  return list;
}
/** After a delete: keeps that name what is gone are dropped (nothing moves). */
export function pruneKeptRefs() {
  var changed = pruneAll(S.items, keepScene());
  sync(changed);
  return changed;
}

/** What a keep is kept to, in words. */
export function keepName(k) {
  var r = k && k.ref;
  if (!r) return "";
  if (r.kind === "item") {
    var o = (S.items || []).find(function (x) { return x && String(x.id) === String(r.id); });
    return distanceText("to-item", { name: o ? (o.name || flabel(o.type)) : distanceText("piece") });
  }
  if (r.kind === "opening") {
    var op = (S.openings || []).find(function (x) { return x && String(x.id) === String(r.id); });
    return op ? reachName(String(op.type || "opening")) : distanceText("to-opening");
  }
  return distanceText("to-" + r.kind);
}

/** Type a distance. src: a keep, a floor hit or a wall-plane { dim, frame,
 *  wall }; cm: the new distance. opts: { keep: also keep it }.
 *  -> { ok: true, keep } | { error } (js/item_keep.js codes, "locked",
 *  "cycle", canAddKeep's reasons). One undo step. */
export function setDistance(it, src, cm, opts) {
  opts = opts || {};
  if (!it) return { error: "invalid" };
  if (it.locked) return { error: "locked" };
  var scene = keepScene(), me = keepItem(it), keep = toKeep(src, me, scene);
  if (!keep) return { error: "invalid" };
  var keeps = normalizeKeeps(it.keep), plan = planDistance(keeps, keep, cm, me, scene);
  if (plan.error) return plan;
  if (opts.keep && plan.index < 0) {
    var chk = checkAddKeep(allKeeps(), it.id, keeps, plan.keep, plan.me, scene);
    if (!chk.ok) return { error: chk.reason };
  }
  pushHistory();
  moveItemBy(it, plan);
  if (plan.index >= 0) { keeps[plan.index].value = plan.keep.value; it.keep = keeps; }
  else if (opts.keep) { keeps.push(plan.keep); it.keep = keeps; }
  var moved = reseatKeptItems({ only: [String(it.id)], skip: function (o) { return o === it; } });
  sync([it].concat(moved));
  repaint();
  return { ok: true, keep: plan.keep };
}

/** Keep a distance as it is now (keep.value, else the current distance). */
export function addKeep(it, src) {
  if (!it) return { error: "invalid" };
  var scene = keepScene(), me = keepItem(it), keep = toKeep(src, me, scene);
  if (!keep) return { error: "invalid" };
  var keeps = normalizeKeeps(it.keep), chk = checkAddKeep(allKeeps(), it.id, keeps, keep, me, scene);
  if (!chk.ok) return { error: chk.reason };
  pushHistory();
  keeps.push(keep);
  it.keep = keeps;
  sync([it]);
  repaint();
  return { ok: true, keep: keep };
}
export function removeKeep(it, index) {
  var keeps = normalizeKeeps(it && it.keep);
  if (!keeps[index]) return { error: "invalid" };
  pushHistory();
  keeps.splice(index, 1);
  if (keeps.length) it.keep = keeps;
  else delete it.keep;
  sync([it]);
  repaint();
  return { ok: true };
}
/** Change a kept distance's value: the piece moves to it (one undo step). */
export function setKeepValue(it, index, cm) {
  var keeps = normalizeKeeps(it && it.keep);
  if (!keeps[index]) return { error: "invalid" };
  return setDistance(it, keeps[index], cm);
}

// Alt as the drop happens (the 3D pane's drag does not set S.conOverride)
var altHeld = false;
if (typeof window !== "undefined" && window.addEventListener) {
  var setAlt = function (e) { altHeld = !!(e && e.altKey); };
  window.addEventListener("pointerup", setAlt, true);
  window.addEventListener("keydown", setAlt, true);
  window.addEventListener("keyup", setAlt, true);
  window.addEventListener("blur", function () { altHeld = false; });
}

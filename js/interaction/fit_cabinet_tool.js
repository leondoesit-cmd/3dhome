/* The "Fit cabinet" planner tool: point at a wall and a cabinet fills the gap.

   Hover shows the run the click would fill, side wall to side wall (stopping
   at doors, windows below its height and open wall ends), in the plan and in
   3D. A click takes the whole run; pressing and dragging along the wall takes
   just that span. The unit is as tall as the wall and 60 deep, or exactly as
   deep as a shallower niche. Committing creates a modular cabinet and fires
   `planner-fit-cabinet`, which js/ui_cabinet_dock.js answers by opening the
   designer beside the room.

   The geometry is pure (js/fit_cabinet.js); this file adapts planner state to
   it and owns the transient draft. The plan's pointer handlers call the four
   entry points below for S.tool === "fitcab" / S.action === "fitcab". */
import { S, WALL_H, fin } from "../state.js";
import { wallGeom } from "../geometry.js";
import { ceilingHeight, wallElevationSpan } from "../elevation.js";
import { findWallGap, fitCabinetBox, fitFootprint, gapCoord, FIT_DEFAULTS } from "../fit_cabinet.js";
import { planPickSurface } from "./hit_test.js";
import { setTool } from "./mep_tools.js";
import { pushHistory } from "../history.js";
import { mkItem } from "../furniture_api.js";
import { CAB_LIMITS } from "../parametric_cabinet.js";
import { FURN } from "../furniture.js";
import { executeCommand, itemPlaceCommand } from "../commands/index.js";
import { makeSpec, defaultPreset, famOf } from "../cabinet.js";
import { render2D, onAfterRender, planHud, sx, sz, rotatePx } from "../plan2d.js";
import { requestRender } from "../view3d.js";
import { fmtLen } from "../display_units.js";
import { t } from "../i18n.js";
import { flash, refreshTree, select } from "../ui.js";
import { updateCost } from "../ui_tree.js";

var draft = null; // { gap, box, from, to, dragging }
var COL = "#26b99a";

function plainWalls() {
  var out = [];
  (S.walls || []).forEach(function (w) {
    var g = wallGeom(w);
    if (!g || g.kind !== "line" || !(g.L > 0)) return; // a unit backs onto a straight face only
    out.push({ id: w.id, a: g.a, b: g.b, t: Number(w.thickness) || 10, h: wallTop(w) });
  });
  return out;
}
function wallTop(w) {
  try { return wallElevationSpan(w).top || w.height || WALL_H; } catch (_) { return w.height || WALL_H; }
}

// the unit stands as tall as its wall, within what a cabinet may be
function unitHeight(wallHeight) {
  return Math.min(CAB_LIMITS.height.max, wallHeight || ceilingHeight());
}
function gapAt(px, pz) {
  if (!fin(px) || !fin(pz)) return null;
  var surf = planPickSurface({ x: px, z: pz }, px, pz), walls = plainWalls();
  var opts = { height: unitHeight(null) };
  if (surf && surf.wall != null) { opts.wallId = surf.wall; opts.side = { x: surf.nx, z: surf.nz }; }
  var gap = findWallGap({ x: px, z: pz }, walls, S.openings || [], opts);
  // a wall hit from the floor nearby, not exactly on the wall
  if (!gap.ok && gap.reason === "no-wall" && opts.wallId != null) {
    delete opts.wallId; delete opts.side;
    gap = findWallGap({ x: px, z: pz }, walls, S.openings || [], opts);
  }
  /* Whether a window stops the run depends on how tall the unit is, which
     depends on the wall it stands on: measure again once that wall is known. */
  if (gap.wall != null) {
    var wall = walls.find(function (w) { return String(w.id) === String(gap.wall); });
    var h = unitHeight(wall && wall.h);
    if (h !== opts.height) {
      opts.height = h; opts.wallId = gap.wall;
      if (gap.ok) opts.side = { x: gap.frame.nx, z: gap.frame.nz };
      gap = findWallGap({ x: px, z: pz }, walls, S.openings || [], opts);
    }
  }
  return gap;
}
function boxFor(gap, from, to) {
  if (!gap || !gap.ok) return null;
  return fitCabinetBox(gap, {
    from: from, to: to, height: unitHeight(gap.wallHeight), depth: FIT_DEFAULTS.depth,
    maxWidth: CAB_LIMITS.width.max, maxHeight: CAB_LIMITS.height.max,
  });
}
function repaint() {
  render2D();
  requestRender();
}

export function fitCabHover(px, pz) {
  if (draft && draft.dragging) return;
  var gap = gapAt(px, pz);
  draft = gap ? { gap: gap, box: boxFor(gap), dragging: false, at: { x: px, z: pz } } : null;
  repaint();
}

export function fitCabDown(e, px, pz) {
  if (e && e.button === 2) { cancelFitCab(); return true; }
  var gap = gapAt(px, pz);
  if (!gap || !gap.ok) {
    flash(t(gap && gap.reason === "opening" ? "f_fitcab_opening" : gap && gap.reason === "too-narrow" ? "f_fitcab_narrow" : "f_fitcab_nowall"), "error");
    return true;
  }
  var s = gapCoord(gap, { x: px, z: pz });
  draft = { gap: gap, from: s, to: s, box: boxFor(gap), dragging: true };
  S.action = "fitcab";
  repaint();
  return true;
}

export function fitCabMove(px, pz) {
  if (!draft || !draft.dragging || !fin(px) || !fin(pz)) return;
  var s = gapCoord(draft.gap, { x: px, z: pz });
  // whole centimetres of width: a cabinet maker's tape reads no finer
  draft.to = draft.from + Math.round(s - draft.from);
  draft.box = boxFor(draft.gap, draft.from, draft.to);
  repaint();
}

export function fitCabUp() {
  var d = draft;
  draft = null;
  if (!d || !d.dragging || !d.box) { repaint(); return; }
  commit(d.gap, d.box);
  setTool("select");
}

export function cancelFitCab() {
  draft = null;
  if (S.action === "fitcab") S.action = null;
  repaint();
}

function commit(gap, box) {
  pushHistory(t("f_fitcab_done", { w: fmtLen(box.w) }));
  // through item.place, like every other piece: the command owns the push into S.items
  var result = executeCommand(itemPlaceCommand, { type: "cabsys", x: box.x, z: box.z, rot: box.rot }, {
    domain: "planner",
    state: S,
    itemCatalog: FURN,
    services: {
      // the command snaps to 2 cm; a fitted unit keeps the exact wall-to-wall numbers
      createItem: function () {
        var made = mkItem("cabsys", box.x, box.z, box.rot);
        made.w = box.w; made.d = box.d; made.h = box.h;
        made.fit = { wall: gap.wall, nx: gap.frame.nx, nz: gap.frame.nz };
        made.cab = makeSpec(defaultPreset(famOf(made)), made.w, made.h, made.d);
        return made;
      },
    },
  }, { history: false });
  var madeId = result.ok && result.created.length ? result.created[0].id : null;
  var it = madeId == null ? null : S.items.find(function (item) { return item.id === madeId; });
  if (!it) { flash(t("f_placeFail"), "error"); return; }
  // rotation was given, so the command marked it rotUser: automatic facing leaves it on its wall
  S.dirty3D = true;
  select({ kind: "item", ref: it });
  refreshTree();
  updateCost();
  render2D();
  flash(t("f_fitcab_done", { w: fmtLen(box.w) }), "success");
  window.dispatchEvent(new CustomEvent("planner-item-created", { detail: { item: it } }));
  window.dispatchEvent(new CustomEvent("planner-fit-cabinet", { detail: { item: it } }));
}

/* ---- previews ---------------------------------------------------------- */

function active() { return S.tool === "fitcab" && draft && draft.gap; }
function widthText(box) { return fmtLen(box.w) + " × " + fmtLen(box.h); }

var HINT = { opening: "fitcab_hint_opening", "too-narrow": "fitcab_hint_narrow", "no-wall": "fitcab_hint_nowall" };
function paint2D() {
  if (!active() || !planHud) return;
  var c = planHud.getContext("2d"), gap = draft.gap, box = draft.box;
  if (!c) return;
  function P(p) { return rotatePx(sx(p.x), sz(p.z)); }
  if (!box) {
    // say why a click here would do nothing, right at the cursor
    if (draft.at && HINT[gap.reason]) {
      var q = P(draft.at);
      c.save();
      pill(c, q.x, q.y - 26, t(HINT[gap.reason]), gap.reason === "no-wall" ? "rgba(16,33,45,.78)" : "rgba(196,72,52,.92)");
      c.restore();
    }
    return;
  }
  c.save();
  var f = gap.frame, run = [
    { x: f.ox + f.ux * gap.left, z: f.oz + f.uz * gap.left },
    { x: f.ox + f.ux * gap.right, z: f.oz + f.uz * gap.right },
  ].map(P);
  // the whole free run along the face, thin
  c.strokeStyle = COL; c.lineWidth = 1.5; c.setLineDash([3, 4]);
  c.beginPath(); c.moveTo(run[0].x, run[0].y); c.lineTo(run[1].x, run[1].y); c.stroke();
  // the unit the click will make
  var pts = fitFootprint(gap, box).map(P);
  c.setLineDash(draft.dragging ? [] : [7, 5]);
  c.lineWidth = 2;
  c.beginPath();
  pts.forEach(function (p, i) { if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); });
  c.closePath();
  c.fillStyle = "rgba(38,185,154,.14)"; c.fill(); c.stroke();
  var mid = { x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2 };
  pill(c, mid.x, mid.y, fmtLen(box.w) + " · " + fmtLen(box.d));
  c.restore();
}
function pill(c, x, y, text, bg) {
  c.setLineDash([]);
  c.font = "600 12px system-ui, sans-serif";
  var tw = c.measureText(text).width;
  c.fillStyle = bg || "rgba(16,33,45,.88)";
  c.fillRect(x - tw / 2 - 6, y - 11, tw + 12, 22);
  c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(text, x, y);
}

function paint3D(e) {
  var o = e && e.detail;
  if (!o || !o.path || !active() || !draft.box) return;
  var gap = draft.gap, box = draft.box, foot = fitFootprint(gap, box);
  var lo = foot.map(function (p) { return { x: p.x, y: 1, z: p.z }; });
  var hi = foot.map(function (p) { return { x: p.x, y: box.h, z: p.z }; });
  var c = o.context;
  c.save();
  if (!draft.dragging) c.setLineDash([7, 5]);
  o.path(lo, COL, true);
  o.path(hi, COL, true);
  for (var i = 0; i < 4; i++) o.path([lo[i], hi[i]], COL);
  c.restore();
  o.label({ x: (foot[2].x + foot[3].x) / 2, y: box.h / 2, z: (foot[2].z + foot[3].z) / 2 }, widthText(box));
}

onAfterRender(paint2D);
if (typeof window !== "undefined") {
  window.addEventListener("planner-overlay-3d", paint3D);
  window.addEventListener("planner-tool", function () { if (S.tool !== "fitcab") draft = null; });
}

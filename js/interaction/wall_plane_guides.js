/* Guides and live distances for placing a piece (FURNITURE_PLACEMENT_PLAN.md
   Stage 3d), painted, never built: nothing here enters the scene.

   - A piece on a wall (js/interaction/wall_plane_drag.js wallPlaneView): in
     the 3D pane, on the wall's face, a line at each engaged snap, the
     distances left, right, down (to the piece under it, else the floor) and up
     (to the piece over it, else the wall top), and the engaged snap's name
     once. In the plan: a tick on the wall at the engaged along-wall snap and
     the left / right distances.
   - Any other selected piece, in the 3D pane: its live distances on the floor
     from its real outline (js/measure.js measureSides), during the drag and
     after it while it stays selected. The plan draws the same numbers itself
     (js/plan2d/overlays.js drawItemSides), so it gets no second set here.
   Painted from the 3D pane's own frame event and the plan's after-render
   hook, so an idle view requests no frames. Each distance pill of the
   selected piece is clickable (js/keep_paint.js registers it for
   js/distance_edit.js); a kept distance is drawn in the constraint colour. */
import { S } from "../state.js";
import { fmtLen } from "../display_units.js";
import { isOnWall } from "../item_orient.js";
import { labelSpots } from "../clearance.js";
import { liveClearances } from "../measure_cache.js";
import { itemOutline } from "../item_outline.js";
import { onAfterRender, planHud, rotatePx, sx, sz } from "../plan2d.js";
import { reachName, wallPlaneText } from "../wall_plane_strings.js";
import { wallPlaneView } from "./wall_plane_drag.js";
import { beginPaint, paintKeeps2D, paintKeeps3D, pill3D, startAfter2D, wallPill2D } from "../keep_paint.js";

var GUIDE = "#e0457b", DIM = "#2f80ed", FLOOR_DIM = "#b45309", OPEN_DIM = "#0d8060", END_DIM = "rgba(47,128,237,.55)";

/** Which wall distances to show: left, right, down, up (the nearest piece
 *  under / over the piece's width wins over the floor / the wall top), then
 *  the quieter left-end / right-end (an opening was the nearer stop). */
export function wallDims(dims) {
  var by = {};
  (dims || []).forEach(function (d) { by[d.kind] = d; });
  return [by.left, by.right, by.below || by.floor, by.above || by.ceiling, by["left-end"], by["right-end"]].filter(function (d) {
    return d && d.value >= 0.5 && Number.isFinite(d.value);
  });
}

function onFace(f, s, y) {
  var e = 0.6; // a hair off the face, so the face does not hide the line
  return { x: f.ox + f.ux * s + f.nx * e, y: y, z: f.oz + f.uz * s + f.nz * e };
}

function paintWall3D(o, v, it) {
  var f = v.frame, snap = v.snap, c = o.context;
  if (v.dragging) {
    c.save();
    c.setLineDash([6, 4]);
    snap.guides.forEach(function (g) {
      if (g.axis === "s") o.path([onFace(f, g.at, g.from), onFace(f, g.at, g.to)], GUIDE);
      else o.path([onFace(f, g.from, g.at), onFace(f, g.to, g.at)], GUIDE);
    });
    c.restore();
  }
  wallDims(snap.dims).forEach(function (d) {
    var a, b, quiet = isEndDim(d);
    if (d.axis === "y") { a = onFace(f, d.at, d.from); b = onFace(f, d.at, d.to); }
    else { a = onFace(f, d.from, d.at); b = onFace(f, d.to, d.at); }
    if (quiet) thinPath(o, a, b);
    else o.path([a, b], d.reach === "opening" ? OPEN_DIM : DIM);
    pill3D(o, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, dimText(d), it, { dim: d, frame: f, wall: v.wallId });
  });
  var kind = v.dragging && (snap.snapped.s || snap.snapped.y);
  if (kind) o.label(onFace(f, snap.s, snap.y + v.ext.h + 14), wallPlaneText(kind));
}

function isEndDim(d) { return d.kind === "left-end" || d.kind === "right-end"; }
// "34 cm", "34 cm · door" (what the distance reached, when it is an opening or the wall end beside one)
function dimText(d) {
  var name = d.reach === "opening" ? reachName(d.what) : isEndDim(d) ? reachName("end") : "";
  return gapText(d.value) + (name ? " · " + name : "");
}
// the quieter line: thin, dashed, dimmer (o.path draws 2 px solid)
function thinPath(o, a, b) {
  var c = o.context, p = o.project && o.project(a), q = o.project && o.project(b);
  if (!c || !p || !q) return;
  c.save();
  c.strokeStyle = END_DIM; c.lineWidth = 1; c.setLineDash([4, 3]);
  c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
  c.restore();
}

// the same cached answer the plan draws (js/measure_cache.js): a repaint with nothing moved measures nothing
function floorHits(it) { return liveClearances(it); }

// one rounding for every distance pill here: the furniture domain's unit and precision
function gapText(cm) { return fmtLen(cm, { domain: "furniture" }); }

function paintFloor3D(o, it) {
  var y = 1, got = floorHits(it), hits = got.hits; // just over the floor
  var proj = o.project ? function (p) { return o.project({ x: p.x, y: p.y == null ? y : p.y, z: p.z }); } : function () { return null; };
  var at = labelSpots(hits, proj), placed = [];
  hits.forEach(function (h, i) {
    var a = { x: h.from.x, y: y, z: h.from.z }, b = { x: h.to.x, y: y, z: h.to.z };
    o.path([a, b], h.kind === "wall" ? DIM : h.kind === "opening" ? OPEN_DIM : FLOOR_DIM);
    var what = h.kind === "opening" ? h.what : h.facing;
    pill3D(o, { x: at[i].x, y: y, z: at[i].z }, gapText(h.gap) + (what ? " · " + reachName(what) : ""), it, h);
    var q = proj(at[i]);
    if (q) placed.push(q);
  });
  paintVertical3D(o, it, got.up, proj, placed);
}

/* Up (and down, for a piece in the air): a vertical line from the centre of
   the piece's top (bottom); at the nearest top corner instead when its label
   would land within 18 px of another. */
function paintVertical3D(o, it, vhits, proj, placed) {
  if (!vhits || !vhits.length) return;
  var poly = itemOutline(it), xs = poly.map(function (p) { return p.x; }), zs = poly.map(function (p) { return p.z; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  vhits.forEach(function (h) {
    var my = (h.from.y + h.to.y) / 2, c0 = proj({ x: h.from.x, y: my, z: h.from.z });
    function clear(q) { return !q || placed.every(function (p) { return Math.hypot(p.x - q.x, p.y - q.y) >= 18; }); }
    var spot = { x: h.from.x, z: h.from.z }, q = c0;
    if (!clear(c0)) {
      var corners = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }].map(function (p) {
        var pq = proj({ x: p.x, y: my, z: p.z });
        return { p: p, q: pq, d: pq && c0 ? Math.hypot(pq.x - c0.x, pq.y - c0.y) : Infinity };
      }).sort(function (a, b) { return a.d - b.d; });
      var pick = corners.filter(function (k) { return clear(k.q); })[0] || corners[0];
      spot = pick.p; q = pick.q;
    }
    o.path([{ x: spot.x, y: h.from.y, z: spot.z }, { x: spot.x, y: h.to.y, z: spot.z }], h.kind === "item" ? FLOOR_DIM : h.kind === "opening" ? OPEN_DIM : DIM);
    pill3D(o, { x: spot.x, y: my, z: spot.z }, gapText(h.gap) + (h.kind === "opening" ? " · " + reachName(h.what) : ""), it, h);
    if (q) placed.push(q);
  });
}

function paintWallPlane3D(e) {
  var o = e && e.detail;
  if (!o || !o.path || !o.label) return;
  beginPaint("3d");
  paintLive3D(o);
  paintKeeps3D(o);
}
function paintLive3D(o) {
  var it = S.sel && S.sel.kind === "item" ? S.sel.ref : null;
  if (!it) return;
  var v = wallPlaneView();
  if (v) return void paintWall3D(o, v, it);
  if (isOnWall(it)) return; // a piece on a wall measures on the wall, once dragged
  if (S.action && S.action !== "item") return;
  paintFloor3D(o, it);
}

function wallPill(c, x, y, text) {
  c.setLineDash([]);
  c.font = "600 12px system-ui, sans-serif";
  var tw = c.measureText(text).width;
  c.fillStyle = "rgba(16,33,45,.88)";
  c.fillRect(x - tw / 2 - 6, y - 11, tw + 12, 22);
  c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(text, x, y);
}

function paintWallPlane2D() {
  if (!planHud) return;
  var v = wallPlaneView();
  if (!v) return;
  var c = planHud.getContext && planHud.getContext("2d");
  if (!c) return;
  var f = v.frame, snap = v.snap;
  function P(s, q) { return rotatePx(sx(f.ox + f.ux * s + f.nx * q), sz(f.oz + f.uz * s + f.nz * q)); }
  c.save();
  c.lineWidth = 1.5;
  if (v.dragging) snap.guides.forEach(function (g) {
    if (g.axis !== "s") return;
    var a = P(g.at, -6), b = P(g.at, 18);
    c.strokeStyle = GUIDE;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  });
  snap.dims.forEach(function (d) {
    var quiet = isEndDim(d);
    if ((d.kind !== "left" && d.kind !== "right" && !quiet) || !(d.value >= 0.5)) return;
    // the quieter wall-end line runs further out from the face, thinner
    var q = quiet ? 16 : 4, a = P(d.from, q), b = P(d.to, q);
    c.strokeStyle = quiet ? END_DIM : d.reach === "opening" ? OPEN_DIM : DIM;
    c.lineWidth = quiet ? 1 : 1.5;
    c.setLineDash(quiet ? [2, 3] : [4, 3]);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    wallPill2D(c, (a.x + b.x) / 2, (a.y + b.y) / 2 - 14, dimText(d), S.sel.ref, { dim: d, frame: f, wall: v.wallId }, wallPill);
  });
  c.restore();
}

// the wall-plane pills first, then the kept distances no live pill drew
function paintAfter2D() {
  startAfter2D();
  paintWallPlane2D();
  paintKeeps2D();
}
onAfterRender(paintAfter2D);
if (typeof window !== "undefined") window.addEventListener("planner-overlay-3d", paintWallPlane3D);

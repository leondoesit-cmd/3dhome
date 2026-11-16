/* Painting distance pills that can be clicked, and kept distances.

   - The live painters (js/interaction/wall_plane_guides.js for the 3D pane
     and the wall-plane pills, js/plan2d/overlays.js drawItemSides for the
     plan) draw their pills through pill3D / pillLabel2D / wallPill2D here:
     each registers its box (js/distance_pills.js), and a live distance that
     is also kept is drawn ONCE, in the constraint colour with a lock.
   - paintKeeps3D / paintKeeps2D then draw what the live ones did not: the
     selected piece's other kept distances, and, dimmer, the kept distances
     of pieces kept to the selected one. Colours as the wall constraints':
     #709fee holds, #f17c6b not met.
   Paint only: nothing here sets S.dirty3D or asks for a 3D frame. Kept
   distances are measured against keepScene() (cached on the scene
   signature); the live distances are never measured again here. */
import { S } from "./state.js";
import { fmtLen } from "./display_units.js";
import { addPill, beginPills, clearPills, takeBegan } from "./distance_pills.js";
import { keepItem, keepScene } from "./item_keep_scene.js";
import { keepItemOf, keepSegment, keepStates, matchKeep, toKeep } from "./item_keep_plan.js";
import { itemOutline } from "./item_outline.js";
import { knownVSpan } from "./furniture.js";
import { label as planLabel } from "./plan2d/constraints.js";
import { planHud, rotatePx, sx, sz } from "./plan2d.js";

export var KEEP_OK = "#709fee", KEEP_BAD = "#f17c6b";
var LOCK = "\u{1F512}", DIM_ALPHA = 0.55;

var drawn = { "2d": new Set(), "3d": new Set() };

function selItem() { return S.sel && S.sel.kind === "item" ? S.sel.ref : null; }
function hasKeeps(it) { return !!(it && Array.isArray(it.keep) && it.keep.length); }
function gapText(cm) { return fmtLen(cm, { domain: "furniture" }); }

/** A view's paint starts: no pills, nothing kept drawn yet. */
export function beginPaint(view) {
  beginPills(view);
  drawn[view].clear();
}

/* Is the live distance `src` of the selected piece one of its kept ones? */
function keptMatch(view, it, src) {
  if (!hasKeeps(it) || !src) return null;
  var scene = keepScene(), me = keepItem(it), k = toKeep(src, me, scene);
  if (!k) return null;
  var states = keepStates(it.keep, me, scene), idx = matchKeep(states.map(function (s) { return s.keep; }), k);
  if (idx < 0) return null;
  drawn[view].add(String(it.id) + "#" + idx);
  return states[idx];
}

function rounded(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
}
/* The 3D pane's pill (js/planner_3d.js label: 12 px, box from y-16, 22 tall), kept look */
function keptPill3D(c, q, text, ok, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.font = "12px system-ui";
  var tw = c.measureText(text).width;
  c.fillStyle = ok ? KEEP_OK : KEEP_BAD;
  rounded(c, q.x - tw / 2 - 5, q.y - 16, tw + 10, 22, 5);
  c.fill();
  c.fillStyle = "#fff"; c.textAlign = "center";
  c.fillText(text, q.x, q.y);
  c.restore();
  return tw;
}
function textWidth(c, font, text) {
  c.save(); c.font = font;
  var w = c.measureText(text).width;
  c.restore();
  return w;
}

/** A distance label in the 3D pane: drawn (kept look when it is kept) and
 *  registered for clicks when `it` is given. */
export function pill3D(o, pos, text, it, src) {
  var q = o.project ? o.project(pos) : null, k = it ? keptMatch("3d", it, src) : null;
  if (!k || !q) { o.label(pos, text); if (!q) return; }
  var shown = k ? LOCK + " " + text : text, tw = k ? keptPill3D(o.context, q, shown, k.ok, 1) : textWidth(o.context, "12px system-ui", shown);
  if (it) addPill("3d", { x: q.x, y: q.y - 5, w: tw + 10, h: 22, itemId: it.id, src: src, kept: k ? k.index : null });
}

/** A distance label on the plan (js/plan2d/constraints.js label): kept look
 *  when one of `srcs` is kept; registered when `it` is the selected piece. */
export function pillLabel2D(it, srcs, wx, wz, txt, color) {
  var sel = selItem() === it, list = (Array.isArray(srcs) ? srcs : [srcs]).filter(Boolean), k = null;
  if (sel) list.some(function (s) { k = keptMatch("2d", it, s); return !!k; });
  var box = planLabel(wx, wz, k ? LOCK + " " + txt : txt, k ? (k.ok ? KEEP_OK : KEEP_BAD) : color, false);
  if (!sel || !box) return;
  list.forEach(function (s) { addPill("2d", { x: box.x, y: box.y, w: box.w, h: box.h, itemId: it.id, src: s }); });
}

/** The wall-plane pill on the plan (js/interaction/wall_plane_guides.js):
 *  draw(c, x, y, text) is its usual look. */
export function wallPill2D(c, x, y, text, it, src, draw) {
  var k = it ? keptMatch("2d", it, src) : null, shown = k ? LOCK + " " + text : text;
  c.save();
  c.font = "600 12px system-ui, sans-serif";
  var tw = c.measureText(shown).width;
  c.restore();
  if (k) {
    c.save();
    c.setLineDash([]);
    c.font = "600 12px system-ui, sans-serif";
    c.fillStyle = k.ok ? KEEP_OK : KEEP_BAD;
    rounded(c, x - tw / 2 - 6, y - 11, tw + 12, 22, 6);
    c.fill();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(shown, x, y);
    c.restore();
  } else draw(c, x, y, text);
  if (it) addPill("2d", { x: x, y: y, w: tw + 12, h: 22, itemId: it.id, src: src, kept: k ? k.index : null });
}

/* Kept distances to draw on their own: the selected piece's (not drawn by a
   live pill this paint), then those of pieces kept to it (dimmer). */
function keptToDraw(view) {
  var it = selItem(), out = [];
  if (!it) return out;
  var scene = keepScene();
  if (hasKeeps(it)) {
    var me = keepItem(it);
    keepStates(it.keep, me, scene).forEach(function (s) {
      if (!drawn[view].has(String(it.id) + "#" + s.index)) out.push({ it: it, me: me, s: s, alpha: 1 });
    });
  }
  (S.items || []).forEach(function (o) {
    if (o === it || !hasKeeps(o)) return;
    var refs = o.keep.some(function (k) { return k && k.ref && k.ref.kind === "item" && String(k.ref.id) === String(it.id); });
    if (!refs) return;
    var om = keepItemOf(o, itemOutline(o), knownVSpan(o));
    keepStates(o.keep, om, scene).forEach(function (s) {
      if (s.keep.ref.kind === "item" && String(s.keep.ref.id) === String(it.id)) out.push({ it: o, me: om, s: s, alpha: DIM_ALPHA });
    });
  });
  return out;
}
function keptLabel(e) {
  var v = e.s.gap != null ? e.s.gap : e.s.keep.value;
  return LOCK + " " + gapText(Math.max(0, v));
}

/** The 3D pane's kept distances (the planner-overlay-3d detail `o`). */
export function paintKeeps3D(o) {
  if (!o || !o.project || !o.context) return;
  keptToDraw("3d").forEach(function (e) {
    var seg = keepSegment(e.s.keep, e.me, e.s.gap != null ? e.s.gap : e.s.keep.value);
    if (!seg) return;
    var y = Math.max(1, e.me.lo + 1), a = Object.assign({ y: y }, seg.a), b = Object.assign({ y: y }, seg.b);
    var pa = o.project(a), pb = o.project(b);
    if (!pa || !pb) return;
    var c = o.context, col = e.s.ok ? KEEP_OK : KEEP_BAD, text = keptLabel(e);
    c.save();
    c.globalAlpha = e.alpha; c.strokeStyle = col; c.lineWidth = 2; c.setLineDash([5, 3]);
    c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); c.stroke();
    c.restore();
    var q = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, tw = keptPill3D(c, q, text, e.s.ok, e.alpha);
    addPill("3d", { x: q.x, y: q.y - 5, w: tw + 10, h: 22, itemId: e.it.id, src: { keep: e.s.keep, index: e.s.index }, kept: e.s.index });
  });
}

/** The plan's kept distances, after its paint (planHud, true screen px). */
export function paintKeeps2D() {
  var c = planHud && planHud.getContext && planHud.getContext("2d");
  if (!c) return;
  keptToDraw("2d").forEach(function (e) {
    var seg = keepSegment(e.s.keep, e.me, e.s.gap != null ? e.s.gap : e.s.keep.value);
    if (!seg) return;
    var col = e.s.ok ? KEEP_OK : KEEP_BAD, text = keptLabel(e), pa, pb;
    if (e.s.keep.axis === "y") { pa = rotatePx(sx(seg.a.x), sz(seg.a.z)); pb = { x: pa.x, y: pa.y }; }
    else { pa = rotatePx(sx(seg.a.x), sz(seg.a.z)); pb = rotatePx(sx(seg.b.x), sz(seg.b.z)); }
    c.save();
    c.globalAlpha = e.alpha; c.strokeStyle = col; c.lineWidth = 1.5; c.setLineDash([4, 3]);
    c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(pb.x, pb.y); c.stroke();
    c.font = "600 12px system-ui, sans-serif";
    var tw = c.measureText(text).width, x = (pa.x + pb.x) / 2, y = (pa.y + pb.y) / 2 + (e.s.keep.axis === "y" ? 18 : -14);
    c.setLineDash([]);
    c.fillStyle = col;
    rounded(c, x - tw / 2 - 6, y - 11, tw + 12, 22, 6);
    c.fill();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, x, y);
    c.restore();
    addPill("2d", { x: x, y: y, w: tw + 12, h: 22, itemId: e.it.id, src: { keep: e.s.keep, index: e.s.index }, kept: e.s.index });
  });
}

/** The plan's after-render step: a paint that skipped the measuring overlay
 *  leaves no pills behind. Runs before the wall-plane pills. */
export function startAfter2D() {
  if (!takeBegan("2d")) { clearPills("2d"); drawn["2d"].clear(); }
}

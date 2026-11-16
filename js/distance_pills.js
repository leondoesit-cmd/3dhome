/* Clickable distance pills: where each painted live / kept distance of the
   selected piece sits on screen, so a click or tap on one can open the
   distance editor (js/distance_edit.js). Pure: plain boxes in, a box out; no
   DOM, no planner state.

   Each painter registers the boxes it drew during its own paint:
     "3d"  the 3D pane's overlay (js/interaction/wall_plane_guides.js and
           js/keep_paint.js), in pane-local CSS px;
     "2d"  the plan's HUD (js/plan2d/overlays.js drawItemSides, the wall-plane
           pills and js/keep_paint.js), in the plan canvas's CSS px (true
           screen, after the plan's rotation).
   A box: { x, y (centre), w, h, itemId, src, kept? }, where `src` is what
   was measured: a floor hit (js/measure_cache.js), { dim, frame, wall } for a
   wall-plane distance, or { keep, index } for a kept distance painted on its
   own. Registering stores references only: nothing is measured again. */

export var TOUCH_MIN = 44;

var lists = { "2d": [], "3d": [] }, began = { "2d": false, "3d": false }, hooks = [];

/** Start a view's paint: its old boxes are gone. */
export function beginPills(view) {
  lists[view] = [];
  began[view] = true;
  for (var i = 0; i < hooks.length; i++) hooks[i](view);
}
/** fn(view) on every paint start (the editor closes when its piece is gone). */
export function onPillsBegin(fn) {
  if (typeof fn === "function") hooks.push(fn);
}
/** Did the view begin a paint since the last call (and forget it)? */
export function takeBegan(view) {
  var b = !!began[view];
  began[view] = false;
  return b;
}
export function clearPills(view) { lists[view] = []; }
export function addPill(view, p) {
  if (!lists[view] || !p || !(p.w > 0) || !(p.h > 0) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  lists[view].push(p);
  return p;
}
export function pillsOf(view) { return lists[view] || []; }

/** The box a pointer may hit: the pill itself, grown to TOUCH_MIN on touch. */
export function padBox(p, touch) {
  var w = p.w + 4, h = p.h + 4;
  if (touch) { w = Math.max(w, TOUCH_MIN); h = Math.max(h, TOUCH_MIN); }
  return { x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 };
}
function inBox(b, x, y) { return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; }

/** hitPill(list, x, y, { touch }) -> the pill under the point, or null. The
 *  last drawn (the one on top) wins among pills the point is really on; on
 *  touch, when the finger is on no pill itself, the padded pill whose centre
 *  is nearest wins. */
export function hitPill(list, x, y, opts) {
  var touch = !!(opts && opts.touch);
  list = list || [];
  for (var i = list.length - 1; i >= 0; i--) if (inBox(padBox(list[i], false), x, y)) return list[i];
  if (!touch) return null;
  var best = null, bd = Infinity;
  for (var j = list.length - 1; j >= 0; j--) {
    var p = list[j];
    if (!inBox(padBox(p, true), x, y)) continue;
    var d = Math.hypot(p.x - x, p.y - y);
    if (d < bd - 1e-9) { bd = d; best = p; }
  }
  return best;
}

/** The pills of the same piece in drawing order, one per distinct box (a
 *  pill that carries several distances, the plan's up / down one, counts
 *  once), for Tab: nextPill(list, cur, +1 | -1) -> the next one, wrapping. */
export function piecePills(list, itemId) {
  var out = [];
  (list || []).forEach(function (p) {
    if (String(p.itemId) !== String(itemId)) return;
    if (out.some(function (q) { return Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5; })) return;
    out.push(p);
  });
  return out;
}
export function nextPill(list, cur, dir) {
  if (!cur) return null;
  var own = piecePills(list, cur.itemId);
  if (!own.length) return null;
  var at = -1;
  own.forEach(function (p, i) { if (at < 0 && Math.abs(p.x - cur.x) < 0.5 && Math.abs(p.y - cur.y) < 0.5) at = i; });
  if (at < 0) return own[0];
  return own[(at + (dir < 0 ? own.length - 1 : 1)) % own.length];
}

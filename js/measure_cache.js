/* The selected / hovered piece's live distances, computed once per pose and
   scene and shared by both painters: the plan's drawItemSides
   (js/plan2d/overlays.js, run on EVERY 2D paint: pointer moves, the 22 Hz
   warning glow, the 30 Hz MEP flow) and the 3D pane's
   (js/interaction/wall_plane_guides.js, run on every 3D frame and on every 2D
   paint through planner-overlay-3d). A repaint with nothing moved costs the
   scene signature and one lookup instead of measureSides + measureVertical
   (0.4 ms on the furnished demo, 1.5 ms with 200 pieces, per call, in Node).

   The key: the piece's own pose and size, the options, and a signature of
   everything the measurers read: every piece's pose / size / stack / type
   (a lean loop), the walls, nodes and openings (js/plan_sprite_batch.js
   fingerprint, the prewarm's signature), and how many "vspan:ready" rounds
   have landed (a piece measured since may now count as in the way). There is
   no document revision counter to key on: edits write S directly. */
import { S } from "./state.js";
import { ceilingHeight } from "./elevation.js";
import { measureSides, measureVertical } from "./measure.js";
import { fingerprint } from "./plan_sprite_batch.js";

var spanRounds = 0;
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("vspan:ready", function () { spanRounds++; });

/** How often the cache answered and how often it measured (tests, probes). */
export var liveClearanceStats = { hits: 0, computes: 0 };

var F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
function mixN(h, v) {
  v = Number(v);
  if (v !== v) v = -0.5; // NaN / undefined: one value of their own
  if (v === (v | 0)) return Math.imul(h ^ (v | 0), 16777619) >>> 0;
  F64[0] = v;
  return Math.imul(Math.imul(h ^ U32[0], 16777619) ^ U32[1], 16777619) >>> 0;
}
function mixS(h, s) {
  s = s == null ? "" : String(s);
  for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return Math.imul(h ^ 0x1f, 16777619) >>> 0;
}

/** A signature of what the live distances read from the plan (see above). */
export function clearanceSceneSig() {
  var h = 2166136261, items = S.items || [];
  h = mixN(h, items.length);
  for (var i = 0; i < items.length; i++) {
    var o = items[i];
    if (!o) { h = mixN(h, -1); continue; }
    h = mixS(h, o.id); h = mixS(h, o.type); h = mixS(h, o.variant);
    h = mixN(h, o.x); h = mixN(h, o.z); h = mixN(h, o.rot); h = mixN(h, o.w); h = mixN(h, o.d); h = mixN(h, o.h);
    h = mixN(h, o.elev); h = mixS(h, o.on); h = mixS(h, o.hold && o.hold.wall); h = mixN(h, o.cab && o.cab.elev);
  }
  h = mixN(h, fingerprint([S.walls, S.nodes, S.openings]));
  return mixN(h, spanRounds);
}

function poseKey(it, opt) {
  return [it.id, it.type, it.variant, it.x, it.z, it.rot, it.w, it.d, it.h, it.elev, it.on, it.hold && it.hold.wall,
    opt.target, opt.wallIds.join(",")].join("|");
}

// a few entries: the selected piece and the hovered one are measured in the same paint
var cache = [], CACHE_MAX = 4;

/** { hits: measureSides(it, opt), up: measureVertical(it, opt + ceiling) }
 *  with the plan's options (S.measureTarget, S.measureWalls), cached. Callers
 *  must not change the arrays they get. */
export function liveClearances(it) {
  if (!it) return { hits: [], up: [] };
  var opt = { target: S.measureTarget || "nearest", wallIds: S.measureWalls || [] };
  var key = poseKey(it, opt) + "#" + clearanceSceneSig();
  for (var i = 0; i < cache.length; i++) {
    if (cache[i].key === key) { liveClearanceStats.hits++; return cache[i].val; }
  }
  liveClearanceStats.computes++;
  var val = { hits: measureSides(it, opt), up: measureVertical(it, Object.assign({ ceiling: ceilingHeight() }, opt)) };
  cache.unshift({ key: key, val: val });
  if (cache.length > CACHE_MAX) cache.length = CACHE_MAX;
  return val;
}

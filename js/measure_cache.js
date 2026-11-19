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
   (a lean loop), the walls, nodes and openings (every field but image
   payloads: geometryPrint below), and how many "vspan:ready" rounds
   have landed (a piece measured since may now count as in the way). There is
   no document revision counter to key on: edits write S directly. */
import { S } from "./state.js";
import { ceilingHeight } from "./elevation.js";
import { measureSides, measureVertical } from "./measure.js";
import { flabel } from "./furniture_meta.js";
import { groupLead, groupOutline } from "./group_frame.js";
import { itemOutline } from "./item_outline.js";
import { reachName, wallPlaneText } from "./wall_plane_strings.js";

/** What an up / down distance reached, in words: "to ceiling", "off floor",
 *  "to Shelf" (the piece's own name, else its type's), a window / door for
 *  a sill hit. Both painters label the vertical with it. */
export function verticalReach(h) {
  if (!h) return "";
  if (h.kind === "opening") return reachName(h.what);
  if (h.kind === "ceiling" || h.kind === "floor") return wallPlaneText("reach-" + h.kind);
  var o = (S.items || []).filter(function (x) { return x && String(x.id) === String(h.id); })[0];
  return o ? wallPlaneText("reach-item", { name: o.name || flabel(o.type) }) : "";
}

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
  h = mixN(h, geometryPrint([S.walls, S.nodes, S.openings], 0));
  return mixN(h, spanRounds);
}

/* The walls / nodes / openings part of the signature: every field (the
   measurers read geometry, kinds, heights, sills...) except image payloads.
   A wall's texture is a data: URL string (js/ui_textures.js `w.tex`), often
   megabytes, and no distance depends on it: such a string mixes a constant
   instead of each of its characters. Otherwise the walk of
   js/plan_sprite_batch.js fingerprint (key order, nesting depth 8). */
export var sceneSigStats = { chars: 0 };
function isDataUrl(v) {
  return typeof v === "string" && v.length > 5 && v.charCodeAt(4) === 58 && v.startsWith("data:");
}
function geometryPrint(v, depth) {
  var h = 2166136261;
  if (v === null || v === undefined) return mixN(h, v === null ? 1 : 2);
  var t = typeof v;
  if (t === "number") return mixN(mixN(h, 3), v);
  if (t === "string") {
    if (isDataUrl(v)) return mixN(h, 12);
    sceneSigStats.chars += v.length;
    return mixS(mixN(h, 5), v);
  }
  if (t === "boolean") return mixN(h, v ? 6 : 7);
  if (t !== "object" || depth > 8) return mixN(h, 8);
  if (Array.isArray(v)) {
    h = mixN(mixN(h, 9), v.length);
    for (var i = 0; i < v.length; i++) h = mixN(h, geometryPrint(v[i], depth + 1));
    return h;
  }
  h = mixN(h, 10);
  for (var k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k) || isDataUrl(v[k])) continue; // a picture added or removed: no change either
    h = mixN(mixS(h, k), geometryPrint(v[k], depth + 1));
  }
  return mixN(h, 11);
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

/** A set moved as one (a kitchen run, a table with its chairs, a
 *  multi-selection): { hits, up: [] } measured from the members' convex cover
 *  in the largest member's orientation, the members not in each other's way
 *  (js/group_frame.js). Cached like liveClearances. */
export function liveGroupClearances(items) {
  items = (items || []).filter(Boolean);
  if (!items.length) return { hits: [], up: [] };
  if (items.length === 1) return liveClearances(items[0]);
  var lead = groupLead(items), opt = { target: S.measureTarget || "nearest", wallIds: S.measureWalls || [] };
  var key = "G:" + items.map(function (it) { return poseKey(it, opt); }).join(";") + "#" + clearanceSceneSig();
  for (var i = 0; i < cache.length; i++) {
    if (cache[i].key === key) { liveClearanceStats.hits++; return cache[i].val; }
  }
  liveClearanceStats.computes++;
  var outline = groupOutline(items, function (it) { return itemOutline(it); });
  var val = { hits: measureSides(lead, Object.assign({ outline: outline, skip: new Set(items) }, opt)), up: [] };
  cache.unshift({ key: key, val: val });
  if (cache.length > CACHE_MAX) cache.length = CACHE_MAX;
  return val;
}

/** The members of `it`'s group (its groupId; hidden pieces too, as the drag
 *  moves them), or null when it is in none. */
export function groupMembers(it) {
  if (!it || it.groupId == null) return null;
  var m = (S.items || []).filter(function (o) { return o && o.groupId === it.groupId; });
  return m.length > 1 ? m : null;
}

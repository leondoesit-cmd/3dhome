/* Work-set layers: the policy half. Nothing in here draws, hit-tests or
   snaps — it only answers "may I?" so that plan2d, interaction, view3d and the
   snap engine all answer it the same way.

   The vocabulary is deliberately small. Every selectable thing in the plan
   belongs to exactly one of five layers, and the user is always working on one
   of them (the WORK SET). From those two facts everything else follows:
   what draws solid, what draws ghosted, what a click may grab, what a drag may
   move, and which snap candidates are worth gathering.

   The central primitive is a RANK, not a boolean. An earlier draft of this
   feature made off-work-set layers simply unpickable, which cannot work: while
   furnishing you still want to click a wall to read it in the inspector, you
   just never want to drag it by accident. So:

     0   focused    — the work set (or every layer, when workSet === "all")
     1   visible but off the work set — selectable, inspectable, undraggable
     ∞   ghosted or hidden — genuinely not there as far as the pointer goes

   Hit tests run over ranks 0 and 1; the first rank-0 hit wins outright and
   rank 1 is only consulted when every focused layer missed. That is what fixes
   the long-standing "grabbed the wall instead of the TV" bug without making
   walls invisible to the mouse.

   IMPORT RULE: this module may import from `state.js` and nothing else in
   `js/`. Every hit-test and paint module imports THIS one, so any back-edge is
   an import cycle — `tools/module_check.mjs` and `tools/link_check.mjs` both
   run over the graph, but a cycle here would be felt first as a module that
   loads with half its bindings still in the temporal dead zone. */
import { S, LAYER_IDS, defaultLayers } from "./state.js";
/* The one exception to the import rule above: user_layers.js imports
   state.js and nothing else, so it cannot close a cycle through here. */
import { refLocked } from "./user_layers.js";

/* The layer TABLE and its defaults live in state.js, next to the rest of S, so
   that S is well-formed for a module that reads `S.layers` without importing
   this one. Re-exported here because this is where callers look for the
   vocabulary. */
export { LAYER_IDS };

/* Selection `kind` -> layer. The plural forms are the multi-select kinds that
   `S.sel` uses (`{kind:"items", refs:[...]}`), and they have to map the same
   way as their singulars or a marquee selection would land on another layer
   than the click that started it.

   Kinds NOT listed here map to no layer at all, and every predicate below
   treats that as "not layer-governed" rather than "denied". That matters for
   the snap kinds (`corner`, `midpoint`, `onwall`, `align`, …): they are
   geometry derived from walls rather than walls themselves, and centring a
   sofa on a wall's midpoint is a top-tier furnishing snap that must survive
   structure being off the work set. */
const KIND_LAYER = {
  wall: "structure",
  walls: "structure",
  node: "structure",
  nodes: "structure",
  room: "structure",
  opening: "structure",
  slabvoid: "structure",
  item: "furniture",
  items: "furniture",
  mepNode: "mep",
  mepRun: "mep",
  marker: "annotations",
  con: "annotations",
};

/* Put the layer table, the work set and the pin back at their defaults. The
   tests need a clean slate between cases, and initLayers() starts from one so
   that a stored preference file missing a field cannot leave a stale value
   from a previous session behind. */
export function resetLayers() {
  S.layers = defaultLayers();
  S.workSet = "furniture";
  S.workSetPinned = false;
  return S.layers;
}

/* ---- queries ---- */

// The layer a selection kind belongs to, or null when the kind names no layer.
export function layerOf(kind) {
  if (!kind) return null;
  return Object.prototype.hasOwnProperty.call(KIND_LAYER, kind) ? KIND_LAYER[kind] : null;
}

// The stored record for a layer id, or null for an id we do not know.
export function layerState(id) {
  if (!id || !S.layers) return null;
  return Object.prototype.hasOwnProperty.call(S.layers, id) ? S.layers[id] : null;
}

export function isLayerVisible(id) {
  var L = layerState(id);
  return !!L && L.vis === "show";
}
export function isLayerGhosted(id) {
  var L = layerState(id);
  return !!L && L.vis === "ghost";
}
export function isLayerHidden(id) {
  var L = layerState(id);
  return !!L && L.vis === "hide";
}
export function isLayerLocked(id) {
  var L = layerState(id);
  return !!L && !!L.locked;
}

/* 0 focused / 1 visible-but-not-focused / Infinity unreachable.

   `pickOverride` is checked before anything else, in both directions: it is
   the user saying "I mean it" about this layer, and an override that the work
   set or the visibility state could veto would be no override at all. An
   unknown layer id ranks Infinity so a caller that mistypes an id fails
   closed — nothing becomes draggable by accident. */
export function layerRank(id) {
  var L = layerState(id);
  if (!L) return Infinity;
  if (L.pickOverride === true) return 0;
  if (L.pickOverride === false) return Infinity;
  if (L.vis !== "show") return Infinity;
  return S.workSet === id || S.workSet === "all" ? 0 : 1;
}

/* Is the selected OBJECT itself locked (as opposed to its layer)?

   Mirrors interaction.js's `targetLocked`: a single object is locked when it
   carries `locked`, and a multi-selection counts as locked only when EVERY
   member is — a marquee that caught one pinned chair among ten should still
   drag the other nine. Rooms are the odd one out: `sel.ref` is a room key, and
   the flag lives in `S.roomMeta`. */
function selfLocked(sel) {
  if (!sel) return false;
  if (sel.kind === "room") {
    var meta = S.roomMeta && S.roomMeta[sel.ref];
    return !!(meta && meta.locked);
  }
  // refLocked: its own pin, or the padlock of the user layer it is on
  if (Array.isArray(sel.refs))
    return (
      sel.refs.length > 0 &&
      sel.refs.every(function (r) {
        return refLocked(r);
      })
    );
  return refLocked(sel.ref);
}

/* May the AI helper move this? The owner's call: the AI is exempt from the
   work-set rule — which layer is being edited, and the automatic lock that
   follows it (`autoLock`) — because every AI change is previewed, checked and
   confirmed by the user before it applies. What it still respects is what the
   user locked on purpose: a padlock set by hand (setting one clears autoLock,
   js/ui_layers.js) and a pinned object. */
export function aiCanMove(sel) {
  if (!sel) return false;
  var id = layerOf(sel.kind);
  if (!id) return false;
  var L = layerState(id);
  if (L && L.locked && !L.autoLock) return false;
  return !selfLocked(sel);
}

/* May this selection be DRAGGED? Three independent gates, all of which the UI
   reports differently: rank 0 (wrong work set — switch layers), layer unlocked
   (the layer's padlock), and the object not individually locked (its own pin).
   Selection and inspection are deliberately NOT gated here; a rank-1 hit still
   selects, it just never starts a gesture. */
export function canDrag(sel) {
  if (!sel) return false;
  var id = layerOf(sel.kind);
  if (!id) return false;
  if (layerRank(id) !== 0) return false;
  if (isLayerLocked(id)) return false;
  return !selfLocked(sel);
}

/* Deletion answers to the same three gates as dragging. It is a separate
   function rather than an alias because the two are conceptually distinct
   permissions and callers read better naming the one they mean — and if they
   ever need to diverge (a locked layer that still allows delete, say), this is
   the seam. */
export function canDelete(sel) {
  return canDrag(sel);
}

/* Does this snap kind contribute candidates right now?

   Deliberately MINIMAL. Only two rules ship:
     - a layer that is ghosted or hidden offers nothing to snap to, because
       snapping to geometry you cannot see is indistinguishable from a bug;
     - MEP offers nothing outside the MEP work set, because socket and pipe
       nodes are dense and sit exactly where furniture wants to go.

   Everything else returns true, including every wall-derived kind. A broader
   policy table was considered and rejected: dropping `midpoint`/`corner` while
   furnishing removes centring a sofa on a wall, which is one of the reasons
   people snap at all. `S.snapKinds` (js/cad_hud.js) remains the user's control
   over the rest. */
export function layerAllowsSnapKind(kind) {
  var id = layerOf(kind);
  if (!id) return true;
  var L = layerState(id);
  if (!L) return true;
  if (L.snapOverride === true) return true;
  if (L.snapOverride === false) return false;
  if (L.vis !== "show") return false;
  if (id === "mep") return S.workSet === "mep";
  return true;
}

/* ---- preferences ----

   Layer state is a preference about the VIEW, not part of the drawing: two
   people opening the same project should not inherit each other's ghosted
   walls, and Ctrl+Z must never un-hide a layer. So it lives in localStorage
   and stays out of `history.snap()` (which whitelists its fields explicitly —
   see the display-flag note there). Same shape as the drafting-aid prefs in
   js/cad_hud.js. */
var PREFS = "home3d_layers";
var VIS = { show: 1, ghost: 1, hide: 1 };

function triState(v) {
  return v === true || v === false ? v : null;
}

/* Restore from localStorage. Every field is validated on the way in rather
   than trusted: this JSON survives across versions and across hand-edits in
   devtools, and a bad `vis` string would leave a layer that neither draws nor
   picks with no way back through the UI. Absent storage (Node, where the test
   suite runs) and corrupt JSON both fall through to the defaults. */
export function initLayers() {
  resetLayers();
  var raw = null;
  try {
    if (typeof localStorage === "undefined") return S.layers;
    raw = localStorage.getItem(PREFS);
  } catch (err) {
    /* storage disabled (private mode, blocked third-party) — defaults stand */
    return S.layers;
  }
  try {
    var p = JSON.parse(raw || "null");
    if (!p || typeof p !== "object") return S.layers;
    if (p.layers && typeof p.layers === "object")
      LAYER_IDS.forEach(function (id) {
        var src = p.layers[id];
        if (!src || typeof src !== "object") return;
        var L = S.layers[id];
        if (typeof src.vis === "string" && VIS[src.vis] === 1) L.vis = src.vis;
        if (typeof src.locked === "boolean") L.locked = src.locked;
        if (typeof src.autoLock === "boolean") L.autoLock = src.autoLock;
        L.pickOverride = triState(src.pickOverride);
        L.snapOverride = triState(src.snapOverride);
      });
    if (typeof p.workSet === "string" && (p.workSet === "all" || LAYER_IDS.indexOf(p.workSet) !== -1))
      S.workSet = p.workSet;
    if (typeof p.workSetPinned === "boolean") S.workSetPinned = p.workSetPinned;
  } catch (err) {
    /* corrupt prefs are not worth a broken planner — defaults stand */
  }
  return S.layers;
}

// Counterpart of initLayers(); the layer UI calls it after every change.
export function saveLayers() {
  try {
    if (typeof localStorage === "undefined") return;
    var out = { layers: {}, workSet: S.workSet, workSetPinned: !!S.workSetPinned };
    LAYER_IDS.forEach(function (id) {
      var L = S.layers[id];
      out.layers[id] = {
        vis: L.vis,
        locked: !!L.locked,
        autoLock: !!L.autoLock,
        pickOverride: triState(L.pickOverride),
        snapOverride: triState(L.snapOverride),
      };
    });
    localStorage.setItem(PREFS, JSON.stringify(out));
  } catch (err) {
    /* a full or disabled quota must never break an edit */
  }
}

/* User layers: named groups of furniture the user makes ("Kitchen", "Phase 2",
   "Rented"), each with its own visibility and padlock, on top of the five
   built-in work-set layers (js/layers.js).

   Scope, deliberately: a user layer holds PIECES (S.items), never walls or
   services. A piece carries the id of at most one user layer in `ulayer`; it
   still belongs to the Furniture work-set layer, so every rule there applies
   first and a user layer can only take more away (hide, fade, lock), never
   give back what the Furniture layer withholds.

   The list lives on the project (S.workspace.userLayers), not on a floor, so
   the same groups exist on every storey; a piece's `ulayer` travels with the
   piece (saved, cloned into floor snapshots, undone). A piece pointing at a
   layer that no longer exists simply belongs to none.

     vis "show"  — as usual;
         "ghost" — drawn faint, not pickable (the Furniture layer's own rule);
         "hide"  — not drawn, not pickable, not snapped to.
     locked      — selectable, never dragged or deleted.

   IMPORT RULE: state.js only. geometry.js (hiddenSets), layers.js (canDrag),
   plan2d.js and view3d.js all read it. */
import { S } from "./state.js";

var VIS = { show: 1, ghost: 1, hide: 1 };

export function userLayers() {
  var ws = S.workspace;
  return ws && Array.isArray(ws.userLayers) ? ws.userLayers : [];
}
function list() {
  var ws = S.workspace;
  if (!ws) return [];
  if (!Array.isArray(ws.userLayers)) ws.userLayers = [];
  return ws.userLayers;
}

export function userLayerById(id) {
  if (!id) return null;
  var ls = userLayers();
  for (var i = 0; i < ls.length; i++) if (ls[i] && ls[i].id === id) return ls[i];
  return null;
}
export function userLayerOf(it) {
  return it && it.ulayer ? userLayerById(it.ulayer) : null;
}
export function itemUserVis(it) {
  var L = userLayerOf(it);
  return L && VIS[L.vis] === 1 ? L.vis : "show";
}
export function itemUserLocked(it) {
  var L = userLayerOf(it);
  return !!(L && L.locked);
}
// A piece that may not be picked because its user layer is faded or hidden.
export function itemUserUnpickable(it) {
  return itemUserVis(it) !== "show";
}
/* The object half of every "is this pinned?" test: its own pin, or the
   padlock of the user layer it is on. js/layers.js and js/interaction.js both
   ask this instead of reading `.locked` directly. */
export function refLocked(r) {
  return !!(r && (r.locked || itemUserLocked(r)));
}

export function itemsOnUserLayer(id) {
  return (S.items || []).filter(function (it) {
    return it && it.ulayer === id;
  });
}

// Names stay short and unique-ish: "Layer 1", "Layer 2", ...
export function nextUserLayerName(base) {
  base = base || "Layer";
  var used = {};
  userLayers().forEach(function (l) {
    used[l.name] = 1;
  });
  for (var n = 1; ; n++) if (!used[base + " " + n]) return base + " " + n;
}

export function addUserLayer(name) {
  var L = {
    id: "ul-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(name || nextUserLayerName()).slice(0, 40),
    vis: "show",
    locked: false,
  };
  list().push(L);
  return L;
}

export function renameUserLayer(id, name) {
  var L = userLayerById(id);
  name = String(name || "").trim().slice(0, 40);
  if (!L || !name) return false;
  L.name = name;
  return true;
}

// Remove the layer; its pieces on this floor go back to belonging to none.
export function removeUserLayer(id) {
  var ls = list(),
    i = ls.findIndex(function (l) {
      return l && l.id === id;
    });
  if (i < 0) return false;
  ls.splice(i, 1);
  (S.items || []).forEach(function (it) {
    if (it && it.ulayer === id) delete it.ulayer;
  });
  return true;
}

// Put pieces on a layer (null takes them off every layer).
export function assignUserLayer(items, id) {
  var n = 0;
  (items || []).forEach(function (it) {
    if (!it) return;
    if (id) it.ulayer = id;
    else delete it.ulayer;
    n++;
  });
  return n;
}

/* Add the pieces a hidden user layer takes out of the views to a hiddenSets()
   item table (js/geometry.js), so the plan, the 3D build, picking and snapping
   all drop them through the path they already share for hidden rooms. */
export function hideUserLayerItems(into) {
  var off = null;
  userLayers().forEach(function (l) {
    if (l && l.vis === "hide") (off = off || {})[l.id] = 1;
  });
  if (!off) return into;
  (S.items || []).forEach(function (it) {
    if (it && it.ulayer && off[it.ulayer]) into[it.id] = 1;
  });
  return into;
}

// What a cache keyed on visibility has to include (plan2d's room layer).
export function userLayerKey() {
  return userLayers()
    .map(function (l) {
      return l.id + ":" + l.vis;
    })
    .join(",");
}

/* MEP under the dollhouse cut (Walls: Down, S.cutaway.on).

   The walls are built to the cut height there, so ceiling runs, ceiling
   devices and the drops between them would float a metre above the wall tops.
   While the cut is on, MEP is cut at the same height as the walls: what lies
   wholly above it is left out and a piece that crosses it ends at the cut.
   With "mep" as the work set the user is working on the services, so they
   stay whole, as they always were. Pure: buildMEP3D (js/mep/drawing.js) asks,
   js/view3d/items_layers.js passes the wall cut height (Infinity when the
   walls are up) and rebuilds the conduits when the answer changes. */

// The height MEP is cut at: Infinity means whole.
export function mepCutHeight(wallCut, workSet) {
  if (workSet === "mep") return Infinity;
  var h = Number(wallCut);
  return h > 0 ? h : Infinity;
}

// A segment between two {x, y, z} points under the cut: null when it lies
// wholly above (dropped), the same two points when it lies below or on it,
// else the two points with the upper one moved down the segment to the cut.
export function clipSegmentAtCut(a, b, cut) {
  if (!(cut < Infinity)) return [a, b];
  var lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
  if (lo > cut) return null;
  if (hi <= cut) return [a, b];
  var t = (cut - a.y) / (b.y - a.y);
  var p = { x: a.x + (b.x - a.x) * t, y: cut, z: a.z + (b.z - a.z) * t };
  return a.y > cut ? [p, b] : [a, p];
}

// A device marker or joint at height y: shown unless it is above the cut.
export function keptUnderCut(y, cut) {
  return !(y > cut);
}

// The cut buildMEP3D last built with, so a work-set or walls switch can tell
// whether the conduits need rebuilding.
var builtCut = Infinity;
export function noteMepCut(cut) {
  builtCut = cut;
}
export function builtMepCut() {
  return builtCut;
}

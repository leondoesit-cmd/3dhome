/* The sketches a sweep or a loft is driven by, and the plane their points live
   on. A module of its own so both the editor and its tests can ask the same
   question without loading the browser. */
import { framePoint } from "./frame.js";
import { sampleHelix } from "../cad_helix.js";

function planeAxis(plane) { return plane === "top" ? "y" : plane === "front" ? "z" : "x"; }

function sketchById(def, id) { return ((def && def.sketches) || []).find(function (item) { return item && item.id === id; }) || null; }

/* WHERE A SWEEP PROFILE, A SWEEP PATH AND A LOFT SECTION LIVE.
 *
 * These are stored as 3D world points, unlike an extrude's 2D u/v, so somebody
 * has to say which plane a sketch's u/v sit on. Nobody did: every sweep and
 * loft mapped (u,v) -> (x,y) whatever plane its sketch was on. That is right
 * for a FRONT-plane sketch and silently wrong for the other two — and it is
 * why a sweep along a helix built a zero-volume sheet, the profile lying in
 * the plane its own path ran along.
 *
 * The rule is now the one every other sketch-driven feature already obeys: the
 * sketch's OWN plane, or its local frame — the same mapping cad_kernel applies
 * to an extrusion drawn on the same sketch. That is what makes re-derivation
 * mean anything: move the sketch's plane and the swept body moves with it. */
export function sketchWorldPoint(sketch, u, v) {
  if (sketch && sketch.frameSpace === "local" && sketch.frame) return framePoint(sketch.frame, u, v, 0);
  var axis = planeAxis(sketch && sketch.plane), w = Number(sketch && sketch.offset) || 0;
  if (axis === "x") return { x: w, y: v, z: u };
  if (axis === "z") return { x: u, y: v, z: w };
  return { x: u, y: w, z: v };
}

/* The sketches a sweep or a loft is DRIVEN by, re-read.
 *
 * The profile, path and sections used to be snapshotted into params at
 * creation and never looked at again, so editing the driving sketch left the
 * body behind — a staleness bug you could not see until these bodies started
 * drawing in the viewport. `sketchSources` records what to re-read; a source
 * that no longer resolves returns null and the last good shape is kept, the
 * same answer syncSketchDrivenParts gives an extrusion. */
export function sweepSourceRecord(profileSketch, profileEntityIds, pathSketch) {
  return { kind:"sweep", profile:{sketchId:profileSketch.id, entityIds:(profileEntityIds || []).slice()}, path:{sketchId:pathSketch.id} };
}

export function loftSourceRecord(sketches, entityIdSets) {
  return { kind:"loft", sections:sketches.map(function (sketch, index) { return {sketchId:sketch.id, entityIds:(entityIdSets[index] || []).slice()}; }) };
}

export function resolveSketchSources(def, sources, resolveProfilePoints) {
  if (!sources) return null;
  var loop = function (entry) {
    var sketch = sketchById(def, entry.sketchId);
    if (!sketch) return null;
    var points = (entry.entityIds || []).length ? resolveProfilePoints(sketch, entry.entityIds) : null;
    if (!points) return null;
    return points.map(function (q) { return sketchWorldPoint(sketch, q.u, q.v); });
  };
  if (sources.kind === "loft") {
    var sections = (sources.sections || []).map(loop);
    return sections.length >= 2 && sections.every(Boolean) ? { sections:sections } : null;
  }
  var profile = loop(sources.profile);
  if (!profile) return null;
  if (sources.helixId) {
    // A helix path is reference geometry, not a sketch, so it is re-sampled
    // from its own record rather than re-read from points.
    var helix = (def.referenceGeometry || []).find(function (item) { return item && item.id === sources.helixId; });
    if (!helix) return null;
    return { profile:profile, path:sampleHelix(helix).points };
  }
  var pathSketch = sketchById(def, sources.path && sources.path.sketchId);
  if (!pathSketch || !(pathSketch.points || []).length) return null;
  return { profile:profile, path:pathSketch.points.map(function (q) { return sketchWorldPoint(pathSketch, q.x, q.y); }) };
}

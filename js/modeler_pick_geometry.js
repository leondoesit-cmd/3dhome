/* Turning a 3D pick into a topology reference, and a topology entry into a
   screen box.

   Pure geometry and reference bookkeeping split out of js/modeler.js: nothing
   here reads or writes the editor state object E.  The raycaster, pointer and
   box below are reused scratch objects, not state — they are allocated on
   first use so that loading this module costs nothing before THREE is ready. */
import { THREE } from "./three_lazy.js";
import { fin } from "./state.js";
import { t } from "./modeler_strings.js";
import { createTopologyReference, resolveMergedTopology, topologyDescriptorSignature } from "./core/topology.js";
import { edgeEndpoints } from "./core/topology_selection.js";
import { distanceToCircularEdge, edgePoints } from "./modeler_mesh_geometry.js";

/* One physical edge can arrive under two ids — the kernel edge and the
   tessellated overlay line the user clicked. Selection state is deduped on
   geometry as well as on the id, or "Edges · 2" can mean one edge picked
   twice. The semantic tail is dropped: it is the one part of the signature
   that differs between those two routes to the same edge. */
export function finishEdgeKey(reference) {
  var signature = reference && reference.descriptor ? topologyDescriptorSignature(reference.descriptor) : "";
  if (!signature) return "id:" + (reference && reference.persistentId || "");
  return signature.slice(0, signature.lastIndexOf(":"));
}

export function dedupeFinishRefs(refs) {
  var ids = new Set(), keys = new Set(), out = [];
  (refs || []).forEach(function (reference) {
    if (!reference) return;
    var key = finishEdgeKey(reference);
    if (ids.has(reference.persistentId) || keys.has(key)) return;
    ids.add(reference.persistentId);
    keys.add(key);
    out.push(reference);
  });
  return out;
}

export function sameFinishEdge(a, b) {
  if (!a || !b) return false;
  return a.persistentId === b.persistentId || finishEdgeKey(a) === finishEdgeKey(b);
}

export function finishEdgeLabel(reference, index) {
  var semantic = reference.semantic || (reference.descriptor && reference.descriptor.semantic) || "";
  if (semantic) return String(semantic).replace(/:/g, " · ");
  var id = String(reference.persistentId || ""), tail = id.split(":edge:").pop();
  return t("finishEdges") + " " + (index + 1) + (tail && tail !== id ? " · " + tail : "");
}

/* ================= 3D preview =================
   Renderer, orbit and sizing come from editor_view.js — the same viewport the
   cabinet designer uses, so the two editors show a model the same way and there
   is one place to fix when they do not. What stays here is the modeler's own
   second destination: rendering the working parts INSIDE the real room, with
   the plan's lighting and everything around them, instead of on a blank
   backdrop. */
/* Resolve what is under the cursor into a part plus a face/edge reference.
   Split out of the click handler so hovering can run exactly the same
   resolution — the highlight you see before you click has to be the thing the
   click then selects, or picking is a guessing game. */
export function topologyReferenceFromEntry(entry) {
  if (!entry) return null;
  return createTopologyReference(entry.ownerFeatureId, entry.kind, entry.persistentId, entry.descriptor, { memberPersistentIds: entry.memberPersistentIds });
}

export function nearestCircularEdge(entries, point, options) {
  options = options || {};
  var maxDist = fin(options.maxDist) ? options.maxDist : 1.8;
  var cylinder = options.cylinder;
  var best = null, bestDist = Infinity;
  (entries || []).filter(function (entry) { return entry.kind === "edge" && entry.descriptor && entry.descriptor.curve === "circle"; }).forEach(function (entry) {
    var d = entry.descriptor, origin = d.origin;
    if (!origin) return;
    if (cylinder) {
      var sameRadius = !fin(Number(cylinder.radius)) || Math.abs(Number(d.radius) - Number(cylinder.radius)) <= Math.max(0.35, Number(cylinder.radius) * 0.06);
      var axis = d.axis || {}, caxis = cylinder.axis || {};
      var aligned = Math.abs((axis.x || 0) * (caxis.x || 0) + (axis.y || 0) * (caxis.y || 0) + (axis.z || 0) * (caxis.z || 0)) > 0.92;
      if (!sameRadius || (caxis.x || caxis.y || caxis.z) && !aligned) return;
    }
    var dist = distanceToCircularEdge(point, d);
    if (dist < bestDist) { bestDist = dist; best = entry; }
  });
  return best && bestDist <= maxDist ? best : null;
}

export function promotePickedEdge(entry, entries) {
  if (!entry) return null;
  var merged = resolveMergedTopology(entries.length ? entries : [entry], entry.persistentId) || entry;
  if (merged.descriptor && merged.descriptor.curve === "circle") return merged;
  var points = edgePoints(merged.descriptor);
  var mid = points.length >= 2
    ? points[points.length >> 1]
    : merged.descriptor && merged.descriptor.origin;
  if (!mid) return merged;
  return nearestCircularEdge(entries, mid, { maxDist: 2.4 }) || merged;
}

/* Resolve every raw ray hit far enough for Select Through. Ordinary picking
   performs richer analytic face matching below, but a kernel face range is
   already an exact persistent-topology answer and must not disappear merely
   because an edge overlay was the first object on the ray. */
/* Screen-space distance from the pointer to each corner of the body, nearest
   inside the band winning. Projecting a handful of points is cheaper than
   putting pickable objects in the scene for geometry that is only wanted while
   one filter is on. */
export var projectScratch = null;

/* World point to client pixels, or null when it is behind the camera. Client
   coordinates, not canvas-relative, because every caller here is comparing
   against a pointer event. */
export function projectToScreen(view, point, rect) {
  if (!view || !view.cam || !point) return null;
  if (!projectScratch) projectScratch = new THREE.Vector3();
  projectScratch.set(point.x || 0, point.y || 0, point.z || 0).project(view.cam);
  if (projectScratch.z > 1) return null;
  return {
    x: rect.left + (projectScratch.x + 1) / 2 * rect.width,
    y: rect.top + (1 - projectScratch.y) / 2 * rect.height,
  };
}

export function viewportRect(view) {
  if (!view || !view.rr || !view.rr.domElement) return null;
  var rect = view.rr.domElement.getBoundingClientRect();
  return rect.width && rect.height ? rect : null;
}

/* The screen rectangle a topology entry occupies, from points that actually
   lie on it: an edge's ends, a circle sampled around its rim, a corner's
   point. A planar face's descriptor carries an origin, a normal and an area —
   nothing that says where its outline is — so faces are answered through the
   edges that bound them rather than guessed at from a centre and a measure. */
export function entryScreenBounds(entry, view, rect) {
  var d = entry && entry.descriptor;
  if (!d) return null;
  var points = [];
  if (entry.kind === "vertex") points = [d.point || d.origin];
  else if (d.curve === "circle" && d.origin && d.axis && fin(d.radius)) {
    var axis = new THREE.Vector3(d.axis.x || 0, d.axis.y || 0, d.axis.z || 0).normalize();
    var side = new THREE.Vector3(1, 0, 0);
    if (Math.abs(axis.x) > 0.9) side.set(0, 1, 0);
    var u = new THREE.Vector3().crossVectors(axis, side).normalize();
    var v = new THREE.Vector3().crossVectors(axis, u).normalize();
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2;
      points.push({
        x: d.origin.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * d.radius,
        y: d.origin.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * d.radius,
        z: d.origin.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * d.radius,
      });
    }
  } else points = edgeEndpoints(entry);
  var box = null;
  points.forEach(function (point) {
    var at = projectToScreen(view, point, rect);
    if (!at) return;
    if (!box) box = { x0: at.x, y0: at.y, x1: at.x, y1: at.y };
    else {
      box.x0 = Math.min(box.x0, at.x); box.y0 = Math.min(box.y0, at.y);
      box.x1 = Math.max(box.x1, at.x); box.y1 = Math.max(box.y1, at.y);
    }
  });
  return box;
}

export function dedupeTopologyCandidates(candidates) {
  var seen = new Set(), out = [];
  (candidates || []).forEach(function (candidate) {
    if (!candidate || !candidate.reference) return;
    var partId = candidate.part && candidate.part.id || "";
    var reference = candidate.reference;
    var key = partId + "|" + (reference.persistentId || finishEdgeKey(reference));
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  });
  return out;
}

/* Scratch instances for the pick paths, which run per pointermove. These must
   be created lazily: THREE is late-bound (js/three_lazy.js) and is an EMPTY
   object at module-evaluation time, so constructing one here throws and takes
   the whole module down with it. Both call sites are downstream of the
   openModeler() loadThree() gate, so by the time either runs three is up. */
export var pickRaycaster = null;

export var pickPointer = null;

export var _scratchCandidateBox = null;

export function getScratchCandidateBox() {
  if (!_scratchCandidateBox) _scratchCandidateBox = new THREE.Box3();
  return _scratchCandidateBox;
}

export function pickScratch() {
  if (!pickRaycaster) { pickRaycaster = new THREE.Raycaster(); pickPointer = new THREE.Vector2(); }
  return pickRaycaster;
}

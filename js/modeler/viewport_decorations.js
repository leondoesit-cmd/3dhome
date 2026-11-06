/* The CAD editor's viewport decorations: topology picks, highlights, overlays
   and display styles, split out of js/modeler.js. It shares the editor's state
   through live imports from ../modeler.js. */
import { layoutCab } from "../cabinet.js";
import { faceAppearanceOverrides } from "../cad_appearances.js";
import { documentHelixOverlays } from "../cad_helix.js";
import { knurlBandMesh, knurlGroovePolylines } from "../cad_knurl.js";
import { documentThreadOverlays } from "../cad_thread.js";
import { appearanceGroups } from "../core/appearance_groups.js";
import { nextDocumentNumericId } from "../core/document_ids.js";
import { framePoint } from "../core/frame.js";
import { holeWizardSketchPolylines } from "../core/hole_wizard_sketch_edit.js";
import { isHoleWizardSketch } from "../core/hole_wizard_sketches.js";
import { meshFeatureEdges } from "../core/mesh_projection.js";
import { hasSaveableModelContent } from "../core/model_save_policy.js";
import { extrusionGeometry } from "../core/profile_mesh_geometry.js";
import { surfaceSketchWorldPolyline } from "../core/surface_uv.js";
import { edgeLiesOnFace, mergeSmoothTopology } from "../core/topology.js";
import { syncViewportSelectionMaterial } from "../core/viewport_selection.js";
import { FURN, PRICE, clearVSpanCache } from "../furniture.js";
import { buildExactMesh, circleDescriptorsMatch, edgePoints, edgesGeometricallyMatch, exactOverlayEntries, faceHighlightMesh, geometryToMeshData, hexNum, overlayEntryCache, smoothTessellationNormals } from "../modeler_mesh_geometry.js";
import { cloneData, movePart, partBounds, partNeedsExactMesh } from "../modeler_part_geometry.js";
import { rebuildFeatureTreeFromDocument } from "../modeler/export_measure.js";
import { dependencyRole } from "../modeler/feature_tree.js";
import { finishCommandActive } from "../modeler/finish_preview.js";
import { activeParts, defBounds, normalizeDef, savedExactTopologyForPart, topologyEntriesForPart } from "../modeler/library_store.js";
import { selectedSolid } from "../modeler/part_commands.js";
import { applySectionClipping } from "../modeler/view_modes.js";
import { addInstant3dHandles } from "../modeler/viewport_input.js";
import { cabinetDefinitionFromItem } from "../parametric_cabinet.js";
import { clearGroup } from "../primitives.js";
import { sanitizeDisplayName, validCustomModelKey } from "../safe.js";
import { analyzeSketchChains, analyzeSketchProfiles } from "../sketch_profiles.js";
import { ensureSketch, ensureSketchDoc } from "../sketch_solver.js";
import { S, fin } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, buildPart, decoGroups, decoratedWorldPerPixel, refreshDecorations,
  standardPlaneFrame, viewportPartByMesh,
} from "../modeler.js";

/* Two components cut from the same library model carry identical persistent
   ids, so a reference has to name its component or picking a face lights up
   the same face on every instance of that model. */
function topologyRefInBuiltComponent(reference) {
  var building = E.buildComponent;
  if (!building) return true;
  return !reference || !reference.componentId || reference.componentId === building.id;
}
/* A part built inside a sub-assembly answers under the path of child ids that
   leads to it, which is how its faces are named on the sub-assembly. */
function builtTopologyId(persistentId) {
  var prefix = E.buildComponent && E.buildComponent.prefix || "";
  return prefix ? prefix + persistentId : persistentId;
}
function builtMemberIds(entry) {
  var prefix = E.buildComponent && E.buildComponent.prefix || "";
  var ids = (entry && entry.memberPersistentIds) || [];
  return prefix ? ids.map(function (id) { return prefix + id; }) : ids;
}
function topologySelected(persistentId, entry) {
  var rawId = persistentId;
  persistentId = builtTopologyId(rawId);
  var sel = (E.topologySelection || []).filter(topologyRefInBuiltComponent);
  if (sel.some(function (ref) {
    if (ref.persistentId === persistentId) return true;
    if ((ref.memberPersistentIds || []).includes(persistentId)) return true;
    if (entry && builtMemberIds(entry).includes(ref.persistentId)) return true;
    return !!(entry && !E.buildComponent?.prefix && edgesGeometricallyMatch(ref, entry));
  })) return true;
  return finishImpliedEdge(rawId);
}
function topologyHovered(persistentId, entry) {
  if (!E.hoverTopology || !topologyRefInBuiltComponent(E.hoverTopology)) return false;
  persistentId = builtTopologyId(persistentId);
  if (E.hoverTopology.persistentId === persistentId) return true;
  if ((E.hoverTopology.memberPersistentIds || []).includes(persistentId)) return true;
  return !!(entry && !E.buildComponent?.prefix && edgesGeometricallyMatch(E.hoverTopology, entry));
}

function finishImpliedEdge(persistentId) {
  if (!E.authoring || !["fillet", "chamfer"].includes(E.authoring.featureType)) return false;
  var faces = (E.topologySelection || []).filter(function (reference) { return reference.kind === "face"; });
  if (!faces.length) return false;
  var part = selectedSolid();
  if (!part) return false;
  var entry = topologyEntriesForPart(part).find(function (item) { return item.persistentId === persistentId; });
  return !!(entry && entry.kind === "edge" && faces.some(function (face) { return edgeLiesOnFace(entry, face); }));
}





/* Overlay and pick targets are the crease edges of the solid that is on
   screen. Analytic box ribs that a cut already removed never get a line, and a
   tessellated hole rim is one circle — not one selectable chord per facet. */
function overlayEntriesForPart(part, mesh) {
  /* Never synthesize pick lines from the pre-cut primitive while its exact
     post-cut topology is rebuilding. Those lines may cross empty space and
     become selectable even though the corresponding material is gone. */
  if (partNeedsExactMesh(part) && !(part.meshData && Array.isArray(part.meshData.topology) && part.meshData.topology.length)) {
    var savedExact = savedExactTopologyForPart(part);
    return savedExact?.length ? mergeSmoothTopology(savedExact).filter(function (entry) { return entry.kind === "edge"; }) : [];
  }
  /* Cache key. An exact body keys on its meshData, which survives rebuilds;
     a primitive has none, so it keys on the tessellated geometry — and
     buildPart makes a NEW geometry every rebuild, so primitives never hit.
     That is deliberate, not an oversight. Measured cost of the pass this
     cache exists to avoid (meshFeatureEdges, this machine):

         box      12 tri   0.04 ms      cylinder  192 tri   0.40 ms
         kernel 2000 tri   3.76 ms      kernel   8000 tri  15.46 ms

     The expensive case is exactly the one that keys on meshData and does hit.
     Do NOT "fix" primitives by hashing their geometry fields into a value
     signature: it must enumerate every field the entries depend on, forever,
     and a miss is a silently stale edge overlay. 0.4 ms is not worth that. */
  var cacheKey = (part && part.meshData) || (mesh && mesh.geometry) || null;
  if (cacheKey) {
    var cached = overlayEntryCache.get(cacheKey);
    if (cached) return cached;
  }
  /* An exact body carries the kernel's own edge list.  Re-deriving edges from
     its tessellation drew every facet crease of a small fillet or chamfer as a
     separate black line, which is what made a filleted body look shredded. */
  var data = part.meshData && Array.isArray(part.meshData.positions) && part.meshData.positions.length >= 9
    ? part.meshData
    : geometryToMeshData(mesh && mesh.geometry);
  var features = data ? meshFeatureEdges(data) : { circles: [], polylines: [] };
  var exact = exactOverlayEntries(part, features);
  if (exact.length) {
    if (cacheKey) overlayEntryCache.set(cacheKey, exact);
    return exact;
  }
  var kernelEdges = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "edge"; });
  /* Both loops below used to scan every kernel edge per mesh feature, which is
     O(n^2) on a body with a few hundred edges. Bucket once instead.

     A circle only matches within max(0.25, r*0.05) of its radius, and a
     polyline only matches when BOTH endpoints land within
     max(0.45, measure*0.04) — which bounds the length difference at twice that.
     So a candidate can never sit outside a band of buckets around the query,
     and probing that band is exact, not approximate: the original predicate
     still decides every hit. Candidates are re-sorted into their original
     kernelEdges order before matching so "first match wins" resolves exactly as
     it did when the list was scanned end to end. */
  var kernelCircleBuckets = new Map(), kernelLineBuckets = new Map();
  var midpointKey = function (a, b) {
    return Math.round(((a.x + b.x) + (a.y + b.y) + (a.z + b.z)) / 2);
  };
  var bucketPush = function (map, key, value) {
    var list = map.get(key);
    if (!list) { list = []; map.set(key, list); }
    list.push(value);
  };
  kernelEdges.forEach(function (entry, index) {
    var record = { entry: entry, index: index };
    var descriptor = entry.descriptor;
    if (descriptor && descriptor.curve === "circle") {
      bucketPush(kernelCircleBuckets, Math.round(Number(descriptor.radius) || 0), record);
    } else {
      /* Bucket on the ENDPOINT MIDPOINT, not on path length. The predicate
         below only ever compares endpoints, so two polylines can share them
         and still differ in length — a straight kernel edge against a mesh
         chain that approximates a curve between the same two points. Length
         buckets would file those apart and lose the match. The midpoint is
         orientation-invariant (the predicate accepts either winding) and moves
         at most `tol` per axis when both endpoints do, so a one-dimensional
         key over its coordinate sum is a strict superset: never a missed
         candidate, and the original predicate still decides. */
      var ends = descriptor ? edgePoints(descriptor) : [];
      bucketPush(kernelLineBuckets, ends.length >= 2 ? midpointKey(ends[0], ends[ends.length - 1]) : 0, record);
    }
  });
  var bucketCandidates = function (map, centre, reach) {
    var found = [];
    var lo = Math.round(centre - reach), hi = Math.round(centre + reach);
    for (var key = lo; key <= hi; key++) {
      var list = map.get(key);
      if (list) found = found.concat(list);
    }
    found.sort(function (a, b) { return a.index - b.index; });
    return found.map(function (record) { return record.entry; });
  };
  var featureId = part.featureId || "feature:part:" + part.id;
  var used = new Set(), entries = [];
  features.circles.forEach(function (circle, index) {
    var descriptor = {
      curve: "circle", origin: circle.origin, axis: circle.axis, radius: circle.radius,
      measure: Number(circle.measure) || (2 * Math.PI * circle.radius),
    };
    if (!circle.closed && circle.points && circle.points.length >= 2) {
      descriptor.endpoints = [circle.points[0], circle.points[circle.points.length - 1]];
    }
    var radius = Number(descriptor.radius) || 0;
    var kernelHit = bucketCandidates(kernelCircleBuckets, radius, Math.max(0.25, radius * 0.05) + 1).find(function (entry) {
      return entry.descriptor && circleDescriptorsMatch(descriptor, entry.descriptor) && !used.has(entry.persistentId);
    });
    if (kernelHit) used.add(kernelHit.persistentId);
    entries.push({
      ownerFeatureId: kernelHit ? kernelHit.ownerFeatureId : featureId,
      kind: "edge",
      persistentId: kernelHit ? kernelHit.persistentId : featureId + ":edge:mesh-circle:" + index,
      semantic: kernelHit ? kernelHit.semantic : "mesh-circle:" + index,
      descriptor: descriptor,
      memberPersistentIds: kernelHit && kernelHit.memberPersistentIds,
    });
  });
  features.polylines.forEach(function (line, index) {
    var points = line.points || [];
    if (points.length < 2) return;
    var a = points[0], b = points[points.length - 1], measure = 0;
    for (var i = 1; i < points.length; i++) measure += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
    var descriptor = {
      curve: points.length === 2 ? "line" : "polyline",
      origin: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
      endpoints: points,
      measure: measure,
    };
    var lineTol = Math.max(0.45, measure * 0.04);
    var kernelHit = bucketCandidates(kernelLineBuckets, midpointKey(a, b), 3 * lineTol + 1).find(function (entry) {
      if (used.has(entry.persistentId) || !entry.descriptor || entry.descriptor.curve === "circle") return false;
      var ends = edgePoints(entry.descriptor);
      if (ends.length < 2) return false;
      var ea = ends[0], eb = ends[ends.length - 1], tol = Math.max(0.45, measure * 0.04);
      return (Math.hypot(a.x - ea.x, a.y - ea.y, a.z - ea.z) < tol && Math.hypot(b.x - eb.x, b.y - eb.y, b.z - eb.z) < tol)
        || (Math.hypot(a.x - eb.x, a.y - eb.y, a.z - eb.z) < tol && Math.hypot(b.x - ea.x, b.y - ea.y, b.z - ea.z) < tol);
    });
    if (kernelHit) used.add(kernelHit.persistentId);
    entries.push({
      ownerFeatureId: kernelHit ? kernelHit.ownerFeatureId : featureId,
      kind: "edge",
      persistentId: kernelHit ? kernelHit.persistentId : featureId + ":edge:mesh-line:" + index,
      semantic: kernelHit ? kernelHit.semantic : "mesh-line:" + index,
      descriptor: descriptor,
      memberPersistentIds: kernelHit && kernelHit.memberPersistentIds,
    });
  });
  if (cacheKey) overlayEntryCache.set(cacheKey, entries);
  return entries;
}

function addFaceHighlights(parent, part, mesh) {
  if (!part || !mesh || (E.docType !== "part" && E.docType !== "assembly")) return;
  var entries = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "face"; });
  var drawn = new Set();
  var featureId = part.featureId || "feature:part:" + part.id;
  var paint = function (reference, color, opacity) {
    if (!reference || drawn.has(reference.persistentId)) return;
    var entry = entries.find(function (candidate) { return candidate.persistentId === reference.persistentId; });
    /* Only the body that owns the face lights up. One cut runs through several
       bodies, and matching a cylinder by axis and radius alone lit the same
       bore in every one of them. */
    if (!entry && reference.ownerFeatureId && reference.ownerFeatureId !== featureId) return;
    var descriptor = (entry && entry.descriptor) || reference.descriptor;
    var highlight = faceHighlightMesh(mesh, descriptor, color, opacity, entry || reference, parent);
    if (!highlight) return;
    drawn.add(reference.persistentId);
    parent.add(highlight);
  };
  /* Same instance only. Two components off one library model share every
     persistent id, so without this filter selecting a face on one of them lit
     the matching face on all of them — the edge overlays already guard this
     way through topologySelected/topologyHovered. */
  (E.topologySelection || []).forEach(function (reference) {
    if (reference.kind !== "face" || !topologyRefInBuiltComponent(reference)) return;
    paint(reference, hexNum(E.selectedFaceColor), .62);
  });
  if (E.hoverTopology && E.hoverTopology.kind === "face" && topologyRefInBuiltComponent(E.hoverTopology)) {
    paint(E.hoverTopology, hexNum(E.hoverColor), .38);
  }
  addVertexHighlights(parent);
}

/* A picked corner has to be visible, and a corner is a point — there is no
   overlay geometry it can borrow the way a face borrows its surface. Drawn as
   a small screen-sized marker so it stays findable at any zoom, for the same
   reason the edge tubes are sized in pixels. */
function addVertexHighlights(parent) {
  var marks = (E.topologySelection || []).filter(function (reference) { return reference.kind === "vertex"; })
    .map(function (reference) { return { reference: reference, color: hexNum(E.selectedEdgeColor), opacity: .98 }; });
  if (E.hoverTopology && E.hoverTopology.kind === "vertex"
    && !marks.some(function (mark) { return mark.reference.persistentId === E.hoverTopology.persistentId; })) {
    marks.push({ reference: E.hoverTopology, color: hexNum(E.hoverColor), opacity: .85 });
  }
  if (!marks.length) return;
  var perPixel = decorationWorldPerPixel();
  var radius = perPixel > 0 ? perPixel * 4 : 0.35;
  marks.forEach(function (mark) {
    var point = mark.reference.descriptor && (mark.reference.descriptor.point || mark.reference.descriptor.origin);
    if (!point) return;
    var dot = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 8),
      new THREE.MeshBasicMaterial({ color: mark.color, transparent: true, opacity: mark.opacity, depthTest: false, depthWrite: false })
    );
    dot.position.set(point.x, point.y, point.z);
    dot.renderOrder = 26;
    dot.raycast = function () {};
    parent.add(dot);
  });
}

function addFaceAppearances(parent, part, mesh) {
  if (!part || !mesh || E.docType !== "part") return;
  var saved = E.def && E.def.appearances || [];
  var ranges = part.meshData && part.meshData.faceRanges;
  if (ranges && ranges.length) {
    var count = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute("position").count) / 3;
    var assignments = appearanceGroups(ranges, count, saved);

    if (!assignments.materials.length) return;
    var base = mesh.material;
    mesh.material = [base].concat(assignments.materials.map(function (appearance) {
      var material = base.clone();
      if (appearance.kind !== "feature") {
        material.color.set(appearance.color);
        material.metalness = appearance.metal;
        material.roughness = appearance.rough;
      }
      var opacity = Number.isFinite(appearance.opacity) ? appearance.opacity : 1;
      material.opacity = E.displayStyle === "transparent" ? Math.min(.3, opacity) : opacity;
      material.transparent = material.opacity < 1;
      material.depthWrite = !material.transparent;
      return material;
    }));
    // Separate draws also let transparent faces sort independently from the
    // opaque body. Keep the original tessellation for stable face picking.
    var paintedMaterials = mesh.material;
    var indicesByMaterial = paintedMaterials.map(function () { return []; });
    var originalIndex = mesh.geometry.index;
    assignments.groups.forEach(function (group) {
      var indices = indicesByMaterial[group.materialIndex];
      for (var index = group.start; index < group.start + group.count; index++) indices.push(originalIndex ? originalIndex.getX(index) : index);
    });
    mesh.material = base.clone();
    mesh.material.visible = false;
    indicesByMaterial.forEach(function (indices, index) {
      if (!indices.length) { paintedMaterials[index].dispose(); return; }
      var geometry = mesh.geometry.clone();
      geometry.clearGroups(); geometry.setIndex(indices);
      var surface = new THREE.Mesh(geometry, paintedMaterials[index]);
      viewportPartByMesh.set(surface, { part: part, component: E.buildComponent || null, appearanceSurface: true, preserveAppearanceOpacity: index > 0 });
      surface.raycast = function () {};
      surface.castShadow = !paintedMaterials[index].transparent;
      surface.receiveShadow = true;
      mesh.add(surface);
    });
    return;
  }
  var overlays = faceAppearanceOverrides(saved);
  if (!overlays.length) return;
  var entries = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "face"; });
  var featureId = part.featureId || "feature:part:" + part.id;
  overlays.forEach(function (appearance) {
    var entry = entries.find(function (candidate) { return candidate.persistentId === appearance.persistentId; });
    if (!entry) return;
    if (entry.ownerFeatureId && entry.ownerFeatureId !== featureId) return;
    var highlight = faceHighlightMesh(mesh, entry.descriptor, hexNum(appearance.color), 0.88, entry, parent);
    if (!highlight) return;
    var painted = highlight.material;
    highlight.material = new THREE.MeshStandardMaterial({
      color: hexNum(appearance.color),
      metalness: Number.isFinite(Number(appearance.metal)) ? appearance.metal : 0.2,
      roughness: Number.isFinite(Number(appearance.rough)) ? appearance.rough : 0.5,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    if (painted && painted.dispose) painted.dispose();
    highlight.raycast = function () {};
    highlight.userData.cadAppearance = appearance.id;
    parent.add(highlight);
  });
}

function buildExt(parent, p, opt) {
  if (p.meshData && !p.exactPending) return buildExactMesh(parent, p);
  var g = extrusionGeometry(p, smoothTessellationNormals);
  if (!g) return null;
  var m = new THREE.MeshStandardMaterial({
    color: hexNum(p.color),
    metalness: fin(p.metal) ? p.metal : 0.08,
    roughness: fin(p.rough) ? p.rough : 0.8,
    transparent: fin(p.opacity) && p.opacity < 1,
    opacity: fin(p.opacity) ? p.opacity : 1,
    side: THREE.DoubleSide,
  });
  var me = new THREE.Mesh(g, m);
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

function applyViewportDisplayStyle(mesh, style, previewOnly) {
  if (!mesh || !mesh.material || previewOnly || !style) return;
  var materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(function (material) {
    if (!material) return;
    var opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
    material.opacity = style === "transparent" ? Math.min(0.3, opacity) : opacity;
    material.transparent = material.opacity < 1;
    material.depthWrite = !material.transparent;
    material.needsUpdate = true;
  });
  mesh.castShadow = style !== "transparent";
  mesh.receiveShadow = style !== "transparent";
}

function decorationWorldPerPixel() {
  var view = E.pv;
  return view && typeof view.worldPerPixel === "function" ? Number(view.worldPerPixel()) || 0 : 0;
}

/* A third either way. Small enough that a highlight never visibly drifts from
   its intended width, coarse enough that a continuous zoom rebuilds a handful
   of times rather than once per frame. */
function decorationScaleStale() {
  var now = decorationWorldPerPixel();
  if (!(now > 0) || !(decoratedWorldPerPixel > 0)) return false;
  var ratio = now / decoratedWorldPerPixel;
  return ratio > 1.34 || ratio < 0.75;
}
function isEntryAffectedByHover(entry, hoverRef) {
  if (!hoverRef) return false;
  if (entry.component) {
    return hoverRef.componentId === entry.component.id;
  }
  if (hoverRef.ownerFeatureId && entry.part && entry.part.featureId) {
    return hoverRef.ownerFeatureId === entry.part.featureId;
  }
  return !!(entry.part && hoverRef.partId && hoverRef.partId === entry.part.id);
}

function syncViewportMeshSelection(mesh, component) {
  if (!mesh || !mesh.isMesh) return;
  var entry = viewportPartByMesh.get(mesh), part = entry && entry.part;
  if (!component) component = entry && entry.component;
  if (!component && E.docType === "assembly") {
    var parent = mesh.parent;
    while (parent) {
      if (parent.userData && parent.userData.cadComponent != null) {
        component = (E.assembly && E.assembly.components || []).find(function (item) { return item.id === parent.userData.cadComponent; });
        break;
      }
      parent = parent.parent;
    }
  }
  syncViewportSelectionMaterial(mesh, {
    partSelected: !!part && part === E.sel,
    componentSelected: !!component && E.componentSel.some(function (item) { return item.id === component.id; }),
    dependency: part ? dependencyRole(part.derivedFeatureId || part.featureId) : "",
    dependencyHighlight: !!part && !!E.dependencyHighlight,
    materialOwned: !!entry,
    preserveAppearanceOpacity: !!(entry && entry.preserveAppearanceOpacity),
  });
  if (entry && entry.appearanceSurface) mesh.castShadow = !mesh.material.transparent;
}

function refreshViewportSelection() {
  if (!E.pv) return;
  refreshDecorations(false);
  [E.pv.grp, E.pv.roomGrp].forEach(function (group) {
    if (group) group.traverse(function (object) { syncViewportMeshSelection(object); });
  });
  var live = E.pv.liveGrp;
  if (live) {
    live.children.slice().forEach(function (child) {
      if (!child.userData || !child.userData.instant3d) return;
      live.remove(child);
      clearGroup(child);
    });
    addInstant3dHandles(live);
    applySectionClipping(live);
  }
  E.pv.render();
}

/* Called after each frame: re-bakes highlight widths once a zoom has carried
   them far enough from the size they were built at. Nothing is highlighted
   most of the time, and then this costs one comparison. */
function refreshDecorationScale() {
  if (!E.pv) return;
  if (!(E.topologySelection || []).length && !E.hoverTopology && !finishCommandActive() && !E.showTemporaryAxes) return;
  if (!decorationScaleStale()) return;
  decoGroups.forEach(function (entry) { entry.dirty = true; });
  refreshDecorations();
}

function addOverlayPolyline(parent, points, color, renderOrder, userData, depthTest) {
  if (!points || points.length < 2) return;
  var geometry = new THREE.BufferGeometry().setFromPoints(points.map(function (p) { return new THREE.Vector3(p.x, p.y, p.z); }));
  var material = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95, depthTest: depthTest !== false, depthWrite: false });
  var line = new THREE.Line(geometry, material);
  line.renderOrder = renderOrder || 24;
  line.userData.cadOverlay = true;
  if (userData) Object.assign(line.userData, userData);
  parent.add(line);
}

function addPartFeatureOverlays(parent, part) {
  var thread = part.cosmeticThread;
  if (thread && thread.overlay && thread.overlay.length > 1) addOverlayPolyline(parent, thread.overlay, 0x3d6ea8, 25);
  if (part.modeledThread && part.modeledThread.path) addOverlayPolyline(parent, part.modeledThread.path, 0x2f6b4f, 25);
  var knurl = part.knurl || (part.knurlMesh && part.knurlMesh.spec);
  if (knurl) {
    var meshData = part.knurlMesh && part.knurlMesh.positions ? part.knurlMesh : knurlBandMesh(knurl);
    if (meshData && meshData.positions && meshData.positions.length >= 9) {
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(meshData.positions, 3));
      if (meshData.indices) geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
      geometry.computeVertexNormals();
      var mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 0x6a737d, metalness: 0.45, roughness: 0.55, transparent: true, opacity: 0.88, side: THREE.DoubleSide,
      }));
      mesh.renderOrder = 18;
      mesh.userData.cadOverlay = true;
      parent.add(mesh);
    }
    knurlGroovePolylines(knurl).forEach(function (points) { addOverlayPolyline(parent, points, 0x1f2933, 26); });
  }
}

/* User reference planes (BatteryLoftPlane, ThreadPlane…) were resolved and
   listed in the tree but never drawn, so an offset plane was invisible in the
   model it was placed against. Each gets a translucent square sized to the
   model at its resolved origin/normal, brighter while selected. Not pickable:
   a sheet in front of the body must not swallow face picks — select a plane
   from the tree or the datum picker. */
function documentPlaneOverlays(def) {
  if (!def || E.docType !== "part" || E.mode !== "3d") return [];
  var planes = (def.references || []).filter(function (ref) {
    return ref && ref.type === "plane" && ref.origin && ref.normal && !/^plane:(top|front|right)$/.test(ref.id || "") && !ref.hidden;
  });
  if (!planes.length) return [];
  var span = 40;
  (def.parts || []).forEach(function (part) {
    try {
      var b = partBounds(part);
      [(b.x1 - b.x0), (b.y1 - b.y0), (b.z1 - b.z0)].forEach(function (extent) { if (fin(extent)) span = Math.max(span, extent * 1.2); });
    } catch (error) { /* unsized part */ }
  });
  var out = [], zAxis = new THREE.Vector3(0, 0, 1);
  planes.forEach(function (ref) {
    var normal = new THREE.Vector3(ref.normal.x, ref.normal.y, ref.normal.z);
    if (normal.lengthSq() < 1e-12) return;
    normal.normalize();
    var selected = ref.id === E.selectedReferenceId, color = selected ? 0xffb020 : 0x7f8ea3;
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: selected ? 0.22 : 0.1, side: THREE.DoubleSide, depthWrite: false }));
    var edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: color }));
    [mesh, edge].forEach(function (object) {
      object.quaternion.setFromUnitVectors(zAxis, normal);
      object.position.set(ref.origin.x, ref.origin.y, ref.origin.z);
      object.userData.cadOverlay = true;
      object.userData.cadPlaneOverlay = ref.id;
      object.raycast = function () {};
      object.renderOrder = 17;
      out.push(object);
    });
  });
  return out;
}

/* Sketch ids a feature has already absorbed. SOLIDWORKS hides a sketch once a
   feature consumes it — it lives under that feature in the tree instead — and
   showing them all would bury the model in its own history. */
function consumedSketchIds(def) {
  var used = new Set();
  (def && def.features || []).forEach(function (feature) {
    if (!feature) return;
    var direct = feature.params && feature.params.sketchId;
    if (direct) used.add(direct);
    if (feature.params?.holeProfileSketchId) used.add(feature.params.holeProfileSketchId);
    if (feature.params?.profileSketchId) used.add(feature.params.profileSketchId);
    var refs = feature.references && feature.references.sketches;
    if (Array.isArray(refs)) refs.forEach(function (reference) {
      var id = typeof reference === "string" ? reference : reference && reference.id;
      if (id) used.add(id);
    });
  });
  return used;
}

/* Sketches drawn into the 3D scene, the way SOLIDWORKS shows an unconsumed one.
   The sketch canvas is a 2D overlay that CSS hides outside sketch mode
   (#modeler.md-is3d:not(.md-model-sketching) #mdCanvas { display:none }), so a
   finished-but-unused sketch simply vanished: the tree still listed it and the
   toolbar still offered Extrude, with nothing on screen to extrude. Drawing it
   as real scene geometry keeps it aligned through orbit for free and leaves
   picking alone, which an interactive canvas over the viewport would not. */
function documentSketchOverlays(def) {
  if (!def || E.docType !== "part" || E.mode !== "3d") return [];
  var editing = E.modelPlaneActive ? ensureSketch(def) : null;
  var consumed = consumedSketchIds(def);
  var out = [];
  ensureSketchDoc(def).forEach(function (sketch) {
    if(isHoleWizardSketch(sketch)){
      var shown=E._holeSketchPreview?.id===sketch.id?E._holeSketchPreview:sketch;
      var lines=holeWizardSketchPolylines(shown);
      if(shown.kind==='cylindrical-position-3d' && E._holeSketchEditId===sketch.id){
        var selected=E._holeSketchInspect || 'all',point=function(role){return shown.points.find(function(p){return p.role===role;});};
        if(selected==='P')lines=[[point('P')]];
        if(selected==='AB')lines=[[point('A'),point('B')]];
        if(selected==='BP')lines=[[point('B'),point('P')]];
      }
      if(sketch.show3d===true || E._holeSketchEditId===sketch.id)lines.forEach(function(line){
        if(line.length===1){var p=line[0],d=.035;out.push([{x:p.x-d,y:p.y,z:p.z},{x:p.x+d,y:p.y,z:p.z}],[{x:p.x,y:p.y-d,z:p.z},{x:p.x,y:p.y+d,z:p.z}]);}
        else out.push(line);
      });
      return;
    }
    if (!sketch || sketch === editing) return;   // the live one is on the canvas
    if (sketch.show3d === false) return;
    if (sketch.id && consumed.has(sketch.id) && sketch.show3d !== true) return;
    var frame = sketch.frameSpace === "local" && sketch.frame
      ? sketch.frame
      : standardPlaneFrame(sketch.plane, sketch.offset);
    if (!frame) return;
    function toWorld(q) { return framePoint(frame, q.u, q.v, 0); }
    try {
      analyzeSketchProfiles(sketch).profiles.forEach(function (profile) {
        var points = (profile.points || []).slice();
        if (points.length > 1) {
          points.push(points[0]);
          out.push(sketch.frameSpace === "surface-uv" ? surfaceSketchWorldPolyline(sketch, points) : points.map(toWorld));
        }
      });
      analyzeSketchChains(sketch).chains.forEach(function (chain) {
        var pts = sketch.frameSpace === "surface-uv" ? surfaceSketchWorldPolyline(sketch, chain.points || []) : (chain.points || []).map(toWorld);
        if (pts.length > 1) out.push(pts);
      });
    } catch (error) { /* a malformed sketch must not take the whole scene down */ }
  });
  return out;
}

function addDocumentOverlays(parent, def) {
  if (!def) return;
  if(E.docType==="part" && E.mode==="3d" && !(def.parts || []).length && !(ensureSketch(def).entities || []).length && E.authoring?.phase==="model") {
    ["top","front","right"].forEach(function(plane,index){
      var mesh=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial({color:[0x438dd8,0x59a879,0xd6a34b][index],transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));
      if(plane==="top")mesh.rotation.x=-Math.PI/2;
      if(plane==="right")mesh.rotation.y=Math.PI/2;
      mesh.userData.cadReferenceId="plane:"+plane;
      parent.add(mesh);
      var edge=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:[0x438dd8,0x59a879,0xd6a34b][index]}));
      edge.rotation.copy(mesh.rotation); edge.userData.cadReferenceId=mesh.userData.cadReferenceId; parent.add(edge);
    });
  }
  documentPlaneOverlays(def).forEach(function (overlay) { parent.add(overlay); });
  var repair=E.authoring && E.authoring.repairMarker;
  if(repair) {
    var radius=Math.max(1,decorationWorldPerPixel()*14), at=repair.origin;
    var marker=new THREE.Mesh(new THREE.SphereGeometry(radius,12,8),new THREE.MeshBasicMaterial({color:0xe8a23a,wireframe:true,depthTest:false,transparent:true,opacity:.9}));
    marker.position.set(at.x,at.y,at.z);marker.renderOrder=90;
    marker.userData.cadRepairReference=repair.reference;parent.add(marker);
  }
  documentSketchOverlays(def).forEach(function (points) {
    /* Sketches commonly lie exactly on a solid face. A depth-tested line then
       loses the z-buffer fight (or disappears behind the face altogether),
       defeating an explicit Show in 3D request. These are reference graphics,
       so draw them over the model like CAD sketch overlays. */
    addOverlayPolyline(parent, points, 0x8fa6c4, 22, null, false);
  });
  documentHelixOverlays(def).forEach(function (curve) {
    var selected = curve.id && curve.id === E.selectedReferenceId;
    addOverlayPolyline(parent, curve.points, selected ? 0xffd060 : 0xf0b429, selected ? 28 : 23, { cadReferenceId: curve.id });
  });
  documentThreadOverlays(def).forEach(function (curve) {
    if (def.parts && def.parts.some(function (part) { return part.id === curve.id && part.cosmeticThread && part.cosmeticThread.overlay; })) return;
    addOverlayPolyline(parent, curve.points, 0x3d6ea8, 25);
  });
}

export function registerCustomModel(def) {
  S.idc=nextDocumentNumericId(def,S.idc);
  // Sketch-only documents belong in the model library, but have no body to
  // place in a room. Clear a former solid's catalog entry if it was edited
  // down to sketches, while leaving its library record available to reopen.
  if (def && validCustomModelKey(def.key) && Array.isArray(def.parts) && !def.parts.length && hasSaveableModelContent(def)) {
    delete FURN[def.key];
    delete PRICE[def.key];
    return false;
  }
  if (
    !def ||
    !validCustomModelKey(def.key) ||
    !Array.isArray(def.parts) ||
    !def.parts.length ||
    def.parts.length > 500 ||
    // a model whose every step is suppressed or rolled back builds nothing,
    // and an empty catalogue entry is worse than a refused save
    !activeParts(def).length
  )
    return false;
  def.name = sanitizeDisplayName(def.name || def.key, 80) || def.key;
  def.parts.forEach(function (part) {
    if (part && typeof part === "object") {
      part.name = String(part.name || part.kind || "part").slice(0, 80);
      if (typeof part.color !== "string" || !/^#[0-9a-f]{6}$/i.test(part.color))
        part.color = "#999999";
    }
  });
  try {
    normalizeDef(def);
    /* Only project a feature tree for documents that do not own one.

       rebuildFeatureTreeFromDocument() regenerates `features` from the RENDER
       PARTS, so it can only ever describe steps that left geometry behind. A
       suppressed step, a step past the rollback bar, and the sketch->feature
       link of anything that built no body are all invisible to it. Running it
       over a canonical (parametric-v1) document therefore replaced an authored
       history with a flat one-feature-per-body projection — and because
       openModeler() loads FURN[key].custom, that projection is what came back
       every time a saved model was reopened. Three authored features, one body,
       reopen: one feature.

       saveModel() already guards this call for exactly this reason ("Canonical
       documents already own their feature history"); registering did not, so
       the save preserved design intent and the very next load destroyed it.
       Same predicate as saveModel(), expressed against the document rather
       than editor state, because registration happens with no editor open. */
    var canonicalDoc = def.metadata && def.metadata.authoringSystem === "parametric-v1";
    var cabinetDoc = def.metadata && def.metadata.adapter === "cabinet";
    var recognizedImport = def.metadata && def.metadata.import && def.metadata.import.recognition
      && def.metadata.import.recognition !== "none";
    /* "Canonical" is a claim about provenance, not a guarantee that a tree came
       with it — an import whose recognition failed can carry the flag and no
       features at all. Skipping the projection there protects nothing and hands
       the editor an empty FeatureManager, so the exemption only applies while
       there is an authored tree to lose. */
    var hasAuthoredTree = Array.isArray(def.features) && def.features.length > 0;
    if (!cabinetDoc && !recognizedImport && (!canonicalDoc || !hasAuthoredTree))
      rebuildFeatureTreeFromDocument(def);
  } catch (_) {
    return false;
  }
  // Canonical models keep their datum coordinates, but still need a measured
  // catalogue footprint before the planner can validate a placement.
  var catalogBounds=defBounds(def);
  def.w=catalogBounds.x1-catalogBounds.x0;
  def.d=catalogBounds.z1-catalogBounds.z0;
  def.h=catalogBounds.y1-catalogBounds.y0;
  FURN[def.key] = {
    label: def.name || def.key,
    w: def.w, d: def.d, h: def.h,
    col: def.col || "#c9bfae",
    custom: def,
    build: def.metadata && def.metadata.adapter === "cabinet"
      ? function (g, it) {
          /* Advanced cabinet parts remain grouped by their semantic motion
             unit, so the existing door/drawer opening slider still drives the
             authored geometry after a CAD edit. */
          var current = S.parametric && S.parametric.definitions[it.definitionId] || def;
          var cabinetDef = cabinetDefinitionFromItem(it, current);
          var L = layoutCab(it), groups = {}, yo = (it.cab && it.cab.elev) || 0;
          function groupFor(p) {
            var unitId = p.cabinetUnit;
            if (unitId == null || !L.units[unitId]) return { parent:g, off:null };
            if (!groups[unitId]) {
              var u = L.units[unitId], gr = new THREE.Group();
              gr.position.set((u.px || 0) + (u.tx || 0), yo + (u.py || 0) + (u.ty || 0), (u.pz || 0) + (u.tz || 0));
              if (u.rot) gr.rotation[u.rot] = u.ang || 0;
              g.add(gr); groups[unitId] = gr;
            }
            return { parent:groups[unitId], off:L.units[unitId] };
          }
          activeParts(cabinetDef).forEach(function (p) {
            var target = groupFor(p), q = cloneData(p);
            if (target.off) movePart(q, -(target.off.px || 0), -(target.off.py || 0), -(target.off.pz || 0));
            else if (yo) movePart(q, 0, yo, 0);
            buildPart(target.parent, q);
          });
        }
      : function (g, it) { activeParts(def).forEach(function (p) {
          var q=p;
          if (p.parametricEnvelope === "box" && it) q=Object.assign({},p,{x0:-it.w/2,x1:it.w/2,y0:0,y1:it.h,z0:-it.d/2,z1:it.d/2});
          else if (p.parametricEnvelope === "cylinder" && it) q=Object.assign({},p,{x:0,y:0,z:0,r:it.w/2,r2:it.w/2,h:it.h});
          buildPart(g, q);
        }); },
  };
  PRICE[def.key] = fin(def.price) ? def.price : 0;
  // re-registering replaces the builder, so any measured vertical span for the
  // old shape is now wrong (elevation views read it)
  clearVSpanCache();
  return true;
}

export {
  addDocumentOverlays, addFaceAppearances, addFaceHighlights,
  addOverlayPolyline, addPartFeatureOverlays, applyViewportDisplayStyle,
  buildExt, consumedSketchIds, decorationWorldPerPixel,
  isEntryAffectedByHover, overlayEntriesForPart, refreshDecorationScale,
  refreshViewportSelection, syncViewportMeshSelection, topologyHovered,
  topologySelected,
};

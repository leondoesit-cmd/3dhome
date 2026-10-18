/* Mesh, edge and face geometry for the model editor.

   Everything here is pure: it takes a part, a descriptor or a THREE mesh and
   answers geometry.  Nothing in this module reads or writes the editor state
   object E, and nothing touches the DOM — that is what makes it safe to lift
   out of js/modeler.js, which still owns every caller.

   The three WeakMaps are caches keyed by the mesh data they describe, so they
   are cleared through clearTopologyCache(part) rather than by whoever happens
   to notice a part changed. */
import { THREE } from "./three_lazy.js";
import { holeSpan } from "./core/hole_span.js";
import { fin } from "./state.js";
import { meshFeatureEdges, meshSmoothFaces } from "./core/mesh_projection.js";
import { framePoint } from "./core/frame.js";
import { cutWallTopology, fitProfileCircle, mergeSmoothTopology, pointWithinCylinderArc } from "./core/topology.js";
import { curveSegments } from "./sketch_profiles.js";
import { circularEdgeSweep } from "./modeler_topology_pick.js";
import { circularMeshBoundary } from "./core/circular_edge_display.js";

export function holeLoop(hl, includeSuppressed) {
  if (!hl) return [];
  if (Array.isArray(hl)) return hl;
  if (!includeSuppressed && hl.suppressed) return [];
  return hl.points || hl.loop || hl.pts || [];
}

export function hexNum(s) { return parseInt(String(s || "#999999").replace("#", ""), 16); }

/* Shade a tessellated curve as a curve.
   `computeVertexNormals` on unindexed triangles gives every facet its own flat
   normal, so a cylinder lights up as a ring of flat staves no matter how finely
   it is divided — subdividing further only makes narrower staves. Averaging the
   normals of neighbouring facets that meet within `limit` rounds the shading
   off, while anything sharper keeps its own normal, so a box still has crisp
   corners and the rim where a wall meets its cap stays a hard edge. */
export function smoothTessellationNormals(geometry, limit) {
  var position = geometry.getAttribute("position");
  if (!position || geometry.getIndex()) return geometry;
  var triangles = Math.floor(position.count / 3);
  if (triangles < 2) return geometry;
  var faces = new Float32Array(triangles * 3);
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (var f = 0; f < triangles; f++) {
    a.fromBufferAttribute(position, f * 3); b.fromBufferAttribute(position, f * 3 + 1); c.fromBufferAttribute(position, f * 3 + 2);
    n.crossVectors(b.sub(a), c.sub(a));
    if (n.lengthSq() > 1e-20) n.normalize();
    faces[f * 3] = n.x; faces[f * 3 + 1] = n.y; faces[f * 3 + 2] = n.z;
  }
  // Vertices that share a corner share a smoothing decision; quantising the key
  // is safe because the extruder emits the very same profile point each time.
  var shared = new Map();
  for (var v = 0; v < triangles * 3; v++) {
    var key = Math.round(position.getX(v) * 1e4) + "," + Math.round(position.getY(v) * 1e4) + "," + Math.round(position.getZ(v) * 1e4);
    if (!shared.has(key)) shared.set(key, []);
    shared.get(key).push(v);
  }
  var cutoff = Math.cos(limit == null ? Math.PI / 4.5 : limit), normals = new Float32Array(triangles * 3 * 3);
  shared.forEach(function (group) {
    group.forEach(function (vertex) {
      var own = Math.floor(vertex / 3) * 3, x = 0, y = 0, z = 0;
      group.forEach(function (other) {
        var face = Math.floor(other / 3) * 3;
        if (faces[own] * faces[face] + faces[own + 1] * faces[face + 1] + faces[own + 2] * faces[face + 2] < cutoff) return;
        x += faces[face]; y += faces[face + 1]; z += faces[face + 2];
      });
      var size = Math.hypot(x, y, z) || 1;
      normals[vertex * 3] = x / size; normals[vertex * 3 + 1] = y / size; normals[vertex * 3 + 2] = z / size;
    });
  });
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return geometry;
}

export function buildExactMesh(parent, p) {
  if (!p.meshData || (!Array.isArray(p.meshData.positions) && !ArrayBuffer.isView(p.meshData.positions)) || p.meshData.positions.length < 9) return null;
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(p.meshData.positions, 3));
  if (p.meshData.normals) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(p.meshData.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (p.meshData.colors) {
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(p.meshData.colors, 3));
  }
  smoothTessellationNormals(geometry);
  geometry.computeBoundingSphere();
  var material = new THREE.MeshStandardMaterial({
    color: hexNum(p.color),
    metalness: fin(p.metal) ? p.metal : 0.08,
    roughness: fin(p.rough) ? p.rough : 0.8,
    transparent: fin(p.opacity) && p.opacity < 1,
    opacity: fin(p.opacity) ? p.opacity : 1,
    side: THREE.DoubleSide,
  });
  var mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/* Merging a cut body's staves back into round faces is real arithmetic, and the
   hover path asks for it on every frame. The answer only changes when the mesh
   does, and a rebuilt mesh is a new object — so cache on that object, and let
   the one place that edits a mesh in place (movePart) clear the entry. */
export var topologyMergeCache = new WeakMap();

export var meshSmoothFaceCache = new WeakMap();

export var overlayEntryCache = new WeakMap();

export function clearTopologyCache(part) {
  if (part && part.meshData) {
    topologyMergeCache.delete(part.meshData);
    overlayEntryCache.delete(part.meshData);
  }
}

export function smoothFacesForMesh(mesh) {
  if (!mesh || !mesh.geometry) return { faces: [], faceOfTriangle: new Int32Array(0) };
  var cached = meshSmoothFaceCache.get(mesh.geometry);
  if (cached) return cached;
  var data = geometryToMeshData(mesh.geometry);
  var grouped = data ? meshSmoothFaces(data) : { faces: [], faceOfTriangle: new Int32Array(0) };
  meshSmoothFaceCache.set(mesh.geometry, grouped);
  return grouped;
}

export function profilePointToWorld(part, u, v, w, frame) {
  frame = frame || part.frame;
  if (frame) return framePoint(frame, u, v, w);
  var axis = part.axis || "y";
  if (axis === "x") return { x: w, y: v, z: u };
  if (axis === "z") return { x: u, y: v, z: w };
  return { x: u, y: w, z: v };
}

export function profileAxisToWorld(part, frame) {
  frame = frame || part.frame;
  if (frame && frame.normal) return { x: frame.normal.x, y: frame.normal.y, z: frame.normal.z };
  var axis = part.axis || "y";
  if (axis === "x") return { x: 1, y: 0, z: 0 };
  if (axis === "z") return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 1, z: 0 };
}

export function holeAndCutEdges(part, featureId) {
  var edges = [];
  var addLoop = function (loop, tag, from, to, frame, axisName) {
    if (!loop || loop.length < 3) return;
    var fit = fitProfileCircle(loop);
    /* A 3D cut carries its own extrusion direction: reading the part's would
       lay a hole rim across the wrong plane on a cut made from another view. */
    var profile = { axis: axisName || part.axis, frame: frame || part.frame };
    var axis = profileAxisToWorld(profile, frame);
    ["start", "end"].forEach(function (end, index) {
      var w = index ? to : from;
      var persistentId = featureId + ":edge:hole:" + tag + ":" + end;
      if (fit) {
        var origin = profilePointToWorld(profile, fit.u, fit.v, w, frame);
        edges.push({
          ownerFeatureId: featureId, kind: "edge", persistentId: persistentId, semantic: "hole:" + tag + ":" + end,
          descriptor: { curve: "circle", semantic: "hole:" + tag + ":" + end, origin: origin, axis: axis, radius: fit.radius, measure: 2 * Math.PI * fit.radius },
        });
        return;
      }
      loop.forEach(function (pt, i) {
        var nxt = loop[(i + 1) % loop.length];
        var a = profilePointToWorld(profile, pt.u, pt.v, w, frame);
        var b = profilePointToWorld(profile, nxt.u, nxt.v, w, frame);
        edges.push({
          ownerFeatureId: featureId, kind: "edge", persistentId: persistentId + ":" + i, semantic: "hole:" + tag + ":" + end,
          descriptor: { curve: "line", origin: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, endpoints: [a, b], measure: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) },
        });
      });
    });
  };
  forEachCutLoop(part, addLoop);
  return edges;
}

/* Every hole and cut loop of an extruded part, in the one place both the edge
   and the face pass read them from. */
export function forEachCutLoop(part, visit) {
  (part.holes || []).forEach(function (hl, index) {
    var span = holeSpan(part, hl);
    if (span.from < span.to) visit(holeLoop(hl), "profile:" + index, span.from, span.to, part.frame, part.axis);
  });
  (part.cuts3d || []).forEach(function (cut, index) {
    if (!cut || cut.suppressed) return;
    var from = fin(cut.from) ? cut.from : part.from;
    var to = fin(cut.to) ? cut.to : part.to;
    var frame = cut.frame || part.frame;
    var axisName = !frame && cut.axis && cut.axis !== "frame" ? cut.axis : part.axis;
    visit(cut.loop || holeLoop(cut), "cut:" + index, from, to, frame, axisName);
  });
}

/* A bore is a wall too: give every hole and cut loop of an extruded part the
   face topology the outer profile already has, so picking inside a hole selects
   the whole round wall instead of the one facet under the cursor. */
export function holeAndCutFaces(part, featureId) {
  if (part.kind !== "ext") return [];
  var faces = [];
  forEachCutLoop(part, function (loop, tag, from, to, frame, axisName) {
    if (!loop || loop.length < 3 || !fin(from) || !fin(to) || from === to) return;
    faces.push.apply(faces, cutWallTopology({ id: featureId }, {
      points: loop, axis: axisName || part.axis, frame: frame || part.frame, from: from, to: to, tag: tag,
    }));
  });
  return faces;
}

export function geometryToMeshData(geometry) {
  if (!geometry || !geometry.getAttribute) return null;
  var position = geometry.getAttribute("position");
  if (!position || !position.count) return null;
  var index = geometry.getIndex();
  var positions = [];
  var push = function (i) { positions.push(position.getX(i), position.getY(i), position.getZ(i)); };
  if (index) {
    for (var i = 0; i < index.count; i++) push(index.getX(i));
  } else {
    for (var i = 0; i < position.count; i++) push(i);
  }
  return positions.length >= 9 ? { positions: positions } : null;
}

export function meshCircleEntries(part, featureId) {
  var data = part && part.meshData && Array.isArray(part.meshData.positions) && part.meshData.positions.length >= 9 ? part.meshData : null;
  if (!data) return [];
  return meshFeatureEdges(data).circles.map(function (circle, index) {
    var descriptor = {
      curve: "circle",
      semantic: "mesh-circle:" + index,
      origin: circle.origin,
      axis: circle.axis,
      radius: circle.radius,
      measure: Number(circle.measure) || (2 * Math.PI * circle.radius),
    };
    if (!circle.closed && circle.points && circle.points.length >= 2) {
      descriptor.endpoints = [circle.points[0], circle.points[circle.points.length - 1]];
    }
    return {
      ownerFeatureId: featureId,
      kind: "edge",
      persistentId: featureId + ":edge:mesh-circle:" + index,
      semantic: descriptor.semantic,
      descriptor: descriptor,
    };
  });
}

export function meshFaceEntries(part, featureId) {
  var data = part && part.meshData && Array.isArray(part.meshData.positions) && part.meshData.positions.length >= 9 ? part.meshData : null;
  if (!data) return [];
  return meshSmoothFaces(data).faces.map(function (face, index) {
    var descriptor = Object.assign({ semantic: "mesh-face:" + index }, face.descriptor || {});
    return {
      ownerFeatureId: featureId,
      kind: "face",
      persistentId: featureId + ":face:mesh:" + index,
      semantic: descriptor.semantic,
      descriptor: descriptor,
    };
  });
}

export function edgePoints(descriptor) {
  if (!descriptor) return [];
  var origin = descriptor.origin, axis = descriptor.axis;
  if (descriptor.curve === "circle" && origin && axis && fin(Number(descriptor.radius))) {
    var radius = Number(descriptor.radius);
    var n = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
    var seed = Math.abs(n.y) < .9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    var u = new THREE.Vector3().crossVectors(n, seed).normalize(), v = new THREE.Vector3().crossVectors(n, u).normalize();
    var points = [], steps = curveSegments(radius, Math.PI * 2, 24, 128);
    var start = 0, sweep = Math.PI * 2;
    var ends = descriptor.endpoints;
    if (Array.isArray(ends) && ends.length >= 2 && Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y, ends[0].z - ends[1].z) > 1e-3) {
      var measure = Number(descriptor.measure);
      if (fin(measure) && measure > 0) {
        var toAngle = function (p) {
          var dx = p.x - origin.x, dy = p.y - origin.y, dz = p.z - origin.z;
          return Math.atan2(dx * v.x + dy * v.y + dz * v.z, dx * u.x + dy * u.y + dz * u.z);
        };
        var arc = circularEdgeSweep(radius, measure, toAngle(ends[0]), toAngle(ends[1]), true,
          descriptor.arcMidpoint ? toAngle(descriptor.arcMidpoint) : undefined);
        start = arc.start;
        sweep = arc.sweep;
        steps = curveSegments(radius, Math.abs(sweep), 12, 96);
      }
    }
    for (var i = 0; i <= steps; i++) {
      var angle = start + sweep * i / steps;
      points.push({
        x: origin.x + (u.x * Math.cos(angle) + v.x * Math.sin(angle)) * radius,
        y: origin.y + (u.y * Math.cos(angle) + v.y * Math.sin(angle)) * radius,
        z: origin.z + (u.z * Math.cos(angle) + v.z * Math.sin(angle)) * radius,
      });
    }
    return points;
  }
  if (Array.isArray(descriptor.endpoints) && descriptor.endpoints.length >= 2) return descriptor.endpoints;
  var length = Number(descriptor.measure);
  if (descriptor.curve === "line" && origin && axis && fin(length)) {
    var size = Math.hypot(axis.x, axis.y, axis.z) || 1, half = length / (2 * size);
    return [
      {x:origin.x-axis.x*half,y:origin.y-axis.y*half,z:origin.z-axis.z*half},
      {x:origin.x+axis.x*half,y:origin.y+axis.y*half,z:origin.z+axis.z*half},
    ];
  }
  return [];
}

export function edgesGeometricallyMatch(a, b) {
  if (!a || !b) return false;
  var da = a.descriptor || {}, db = b.descriptor || {};
  if (da.curve && db.curve && da.curve !== db.curve) return false;
  if (da.curve === "circle" && db.curve === "circle") {
    return circleDescriptorsMatch(da, db);
  }
  var pa = edgePoints(da), pb = edgePoints(db);
  if (pa.length < 2 || pb.length < 2) return false;
  var a0 = pa[0], a1 = pa[pa.length - 1], b0 = pb[0], b1 = pb[pb.length - 1];
  var tol = Math.max(0.55, Math.abs(Number(da.measure) || 0) * 0.04, Math.abs(Number(db.measure) || 0) * 0.04);
  var dist = function (p, q) { return Math.hypot((p.x || 0) - (q.x || 0), (p.y || 0) - (q.y || 0), (p.z || 0) - (q.z || 0)); };
  return (dist(a0, b0) < tol && dist(a1, b1) < tol) || (dist(a0, b1) < tol && dist(a1, b0) < tol);
}

export function addMeshSharpEdges(mesh) {
  if (!mesh || !mesh.material) return;
  var materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(function (material) {
    if (!material) return;
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  });
}

export function circleDescriptorsMatch(a, b) {
  if (!a || !b || a.curve !== "circle" || b.curve !== "circle") return false;
  var ra = Number(a.radius), rb = Number(b.radius);
  if (!fin(ra) || !fin(rb) || Math.abs(ra - rb) > Math.max(0.25, ra * 0.05)) return false;
  var ax = a.axis || {}, bx = b.axis || {};
  if (Math.abs((ax.x || 0) * (bx.x || 0) + (ax.y || 0) * (bx.y || 0) + (ax.z || 0) * (bx.z || 0)) < 0.92) return false;
  return distanceToCircularEdge(a.origin, b) <= Math.max(0.45, ra * 0.06);
}

export function exactOverlayEntries(part, features) {
  var topology = part && part.meshData && Array.isArray(part.meshData.topology) ? part.meshData.topology : null;
  if (!topology || !topology.length) return [];
  var chains = (features && features.polylines || []).filter(function (line) { return (line.points || []).length >= 2; });
  var entries = [];
  topology.forEach(function (entry) {
    if (!entry || entry.kind !== "edge" || !entry.descriptor) return;
    var descriptor = entry.descriptor;
    if (descriptor.curve !== "line" && descriptor.curve !== "circle") {
      /* The kernel reports a free curve as two endpoints only; drawing that as
         a chord cuts straight through the body.  Borrow the tessellated chain
         that runs between the same ends, and skip the edge when none does. */
      var chain = matchingMeshChain(descriptor, chains);
      if (!chain) return;
      descriptor = Object.assign({}, descriptor, { curve: "polyline", endpoints: chain.points });
    }
    if (edgePoints(descriptor).length < 2) return;
    entries.push(descriptor === entry.descriptor ? entry : Object.assign({}, entry, { descriptor: descriptor }));
  });
  if (!entries.length) return [];
  return mergeSmoothTopology(entries).filter(function (entry) { return entry.kind === "edge"; }).map(function (entry) {
    var displayPoints = circularMeshBoundary(entry.descriptor, features && features.circles);
    return displayPoints ? Object.assign({}, entry, { displayPoints: displayPoints }) : entry;
  });
}

export function matchingMeshChain(descriptor, chains) {
  var ends = Array.isArray(descriptor.endpoints) ? descriptor.endpoints : [];
  if (ends.length < 2) return null;
  var a = ends[0], b = ends[ends.length - 1];
  var tol = Math.max(0.45, Math.abs(Number(descriptor.measure) || 0) * 0.08);
  var dist = function (p, q) { return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); };
  return chains.find(function (line) {
    var p0 = line.points[0], p1 = line.points[line.points.length - 1];
    return (dist(a, p0) < tol && dist(b, p1) < tol) || (dist(a, p1) < tol && dist(b, p0) < tol);
  }) || null;
}

export function analyticCurvedFace(descriptor) {
  if (!descriptor) return false;
  var surface = descriptor.surface;
  if (surface === "cylinder") return !!(descriptor.axis && fin(Number(descriptor.radius)));
  if (surface === "sphere") return fin(Number(descriptor.radius));
  if (surface === "cone") return !!(descriptor.axis && fin(Number(descriptor.radius)));
  if (surface === "torus") return !!(descriptor.axis && fin(Number(descriptor.majorRadius)) && fin(Number(descriptor.minorRadius)));
  return false;
}

export function highlightIdsFor(reference) {
  var ids = [];
  if (!reference) return ids;
  if (reference.persistentId) ids.push(reference.persistentId);
  (reference.memberPersistentIds || []).forEach(function (id) { if (id && ids.indexOf(id) === -1) ids.push(id); });
  return ids;
}

export function triangleSetForFace(mesh, descriptor, reference) {
  var wanted = null, add = function (t) {
    if (!(t >= 0)) return;
    if (!wanted) wanted = {};
    wanted[t] = true;
  };
  var subshapeMap = mesh && mesh.userData && mesh.userData.cadSubshapeMap;
  var ids = highlightIdsFor(reference);
  if (subshapeMap && ids.length) {
    ids.forEach(function (id) {
      var list = subshapeMap[id];
      if (Array.isArray(list)) list.forEach(add);
    });
  }
  if (wanted) return wanted;
  var ranges = mesh && mesh.userData && mesh.userData.cadFaceRanges;
  if (Array.isArray(ranges) && ids.length) {
    ranges.forEach(function (range) {
      if (!range || ids.indexOf(range.persistentId) === -1) return;
      var start = range.triangleStart || 0, count = range.triangleCount || 0;
      for (var t = start; t < start + count; t++) add(t);
    });
  }
  if (wanted) {
    /* Kernel ranges are the face. A merged tessellated wall expands through
       member ids already in `ids`; throwing the ranges away would paint an
       infinite cylinder and light every coaxial land of the same radius. */
    return wanted;
  }
  var meshIndex = reference && reference.persistentId && /:face:mesh:(\d+)$/.exec(reference.persistentId);
  if (meshIndex) {
    var grouped = smoothFacesForMesh(mesh);
    var face = grouped.faces[Number(meshIndex[1])];
    if (face && Array.isArray(face.triangles)) face.triangles.forEach(add);
  }
  if (wanted) return wanted;
  if (descriptor && Array.isArray(descriptor.triangleIndices)) descriptor.triangleIndices.forEach(add);
  return wanted;
}

export var _faceVecA = null, _faceVecB = null, _faceVecC = null;

export var _faceVecAB = null, _faceVecAC = null, _faceVecTN = null, _faceVecRadial = null;

export function initFaceScratchVectors() {
  if (!_faceVecA) {
    _faceVecA = new THREE.Vector3();
    _faceVecB = new THREE.Vector3();
    _faceVecC = new THREE.Vector3();
    _faceVecAB = new THREE.Vector3();
    _faceVecAC = new THREE.Vector3();
    _faceVecTN = new THREE.Vector3();
    _faceVecRadial = new THREE.Vector3();
  }
}

export function faceHighlightMesh(mesh, descriptor, color, opacity, reference) {
  if (!mesh || !mesh.geometry || !descriptor) return null;
  var surface = descriptor.surface;
  var round = surface === "cylinder" && descriptor.axis && fin(Number(descriptor.radius));
  var ball = surface === "sphere" && fin(Number(descriptor.radius));
  var cone = surface === "cone" && descriptor.axis && fin(Number(descriptor.radius));
  var torus = surface === "torus" && descriptor.axis && fin(Number(descriptor.majorRadius)) && fin(Number(descriptor.minorRadius));
  var curved = round || ball || cone || torus || surface === "other" || surface === "revolution" || surface === "bspline";
  var normal = descriptor.normal, origin = descriptor.origin || descriptor.center;
  var listed = triangleSetForFace(mesh, descriptor, reference);
  if (!listed && (!origin || (!normal && !curved))) return null;
  var position = mesh.geometry.getAttribute("position");
  if (!position) return null;
  var index = mesh.geometry.getIndex();
  var triangleCount = Math.floor((index ? index.count : position.count) / 3);
  var n = normal ? new THREE.Vector3(normal.x, normal.y, normal.z).normalize() : new THREE.Vector3(0, 1, 0);
  var axis = (round || cone || torus) && descriptor.axis
    ? new THREE.Vector3(descriptor.axis.x, descriptor.axis.y, descriptor.axis.z).normalize() : null;
  var centre = origin ? new THREE.Vector3(origin.x, origin.y, origin.z) : new THREE.Vector3();
  var radius = Math.abs(Number(descriptor.radius)) || 0;
  var major = Math.abs(Number(descriptor.majorRadius)) || 0;
  var minor = Math.abs(Number(descriptor.minorRadius)) || 0;
  var slope = cone ? Math.tan(Number(descriptor.angle) || 0) : 0;
  var band = Math.max(.35, (torus ? minor : radius) * .05);
  /* A facet is not a point: the vertex tested below can sit half a facet
     outside the arc its face covers, and the radial band buys its own slack. */
  var arcSlack = round && radius > 1e-9
    ? Math.max(band / radius, Math.abs(Number(descriptor.arc && descriptor.arc.step) || 0) / 2) : 0;
  var alongSpan = null;
  if (round && descriptor.along && fin(Number(descriptor.along.min)) && fin(Number(descriptor.along.max))) {
    alongSpan = { min: Number(descriptor.along.min), max: Number(descriptor.along.max) };
  } else if (round && radius > 1e-9 && fin(Number(descriptor.measure)) && Number(descriptor.measure) > 0) {
    var half = Number(descriptor.measure) / (2 * Math.PI * radius) / 2;
    alongSpan = { min: -half, max: half };
  }
  mesh.updateMatrixWorld(true);   // built this frame; its matrix is not current yet
  initFaceScratchVectors();
  var a = _faceVecA, b = _faceVecB, c = _faceVecC;
  var ab = _faceVecAB, ac = _faceVecAC, tn = _faceVecTN, radial = _faceVecRadial;
  var kept = [];
  for (var t = 0; t < triangleCount; t++) {
    if (listed && !listed[t]) continue;
    var i = t * 3;
    var ia = index ? index.getX(i) : i, ib = index ? index.getX(i+1) : i+1, ic = index ? index.getX(i+2) : i+2;
    a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
    tn.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (tn.lengthSq() < 1e-12) continue;
    tn.normalize();   // already world space — the corners were transformed above
    if (!listed) {
      if (ball) {
        radial.subVectors(a, centre);
        if (Math.abs(radial.length() - radius) > band) continue;
        n.copy(radial.lengthSq() > 1e-12 ? radial.normalize() : tn);
      } else if (torus) {
        radial.subVectors(a, centre);
        radial.addScaledVector(axis, -radial.dot(axis));
        if (radial.lengthSq() < 1e-12) continue;
        radial.normalize().multiplyScalar(major).add(centre);
        if (a.distanceTo(radial) > minor + band) continue;
        n.copy(tn);
      } else if (cone) {
        radial.subVectors(a, centre);
        var along = radial.dot(axis);
        radial.addScaledVector(axis, -along);
        var expected = Math.abs(radius + along * slope);
        if (Math.abs(radial.length() - expected) > Math.max(band, expected * .05)) continue;
        n.copy(tn);
      } else if (round) {
        if (Math.abs(tn.dot(axis)) > .25) continue;               // caps face along the axis, walls across it
        radial.subVectors(a, centre);
        var along = radial.dot(axis);
        if (alongSpan && (along < alongSpan.min - band || along > alongSpan.max + band)) continue;
        radial.addScaledVector(axis, -along);           // drop the along-axis part
        if (Math.abs(radial.length() - radius) > band) continue;   // a bore inside the same body is not this wall
        /* And on the part of the wall this face is. A merged run fits a circle
           the face covers a few degrees of; without this the band swept every
           triangle at that radius right round the body, which is what lit five
           gear teeth and a swathe of thin air when one flank was hovered. */
        if (!pointWithinCylinderArc(a, descriptor, arcSlack)) continue;
        n.copy(tn);                                                // lift each facet along its own outward normal
      } else if (curved) {
        continue;
      } else {
        /* Geometry winding is not guaranteed to agree with the analytic face
           normal (especially on extrusions).  Plane distance already rejects
           the opposite side, so orientation must be compared unsigned. */
        if (Math.abs(tn.dot(n)) < .96) continue;
        // and in the same plane, not just parallel to it — the far side of a box
        // is parallel to the near one
        var offset = (a.x-origin.x)*n.x + (a.y-origin.y)*n.y + (a.z-origin.z)*n.z;
        if (Math.abs(offset) > .35) continue;
        /* Lift along the side the facet actually shows. A pocket wall's analytic
           normal points into the material it was cut from, and lifting that way
           buries the overlay inside the body. */
        if (tn.dot(n) < 0) n.multiplyScalar(-1);
      }
    } else {
      n.copy(tn);
    }
    /* Lift the overlay a hair off the surface it copies. Coincident triangles
       z-fight no matter what the render order says, and polygon offset alone is
       not reliable across backends — the highlight has to be visible or the
       selection is invisible again. */
    var lift = .06;
    kept.push(
      a.x+n.x*lift, a.y+n.y*lift, a.z+n.z*lift,
      b.x+n.x*lift, b.y+n.y*lift, b.z+n.z*lift,
      c.x+n.x*lift, c.y+n.y*lift, c.z+n.z*lift
    );
  }
  if (!kept.length) return null;
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  geometry.computeVertexNormals();
  var highlight = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: color, transparent: true, opacity: opacity, side: THREE.DoubleSide,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  highlight.renderOrder = 18;
  /* The overlay is feedback, never geometry.  Letting it participate in the
     raycast made the highlighted face become unclickable on the next click. */
  highlight.raycast=function(){};
  return highlight;
}

export function distanceToCircularEdge(point, descriptor) {
  if (!point || !descriptor || descriptor.curve !== "circle") return Infinity;
  var origin = descriptor.origin || {}, axis = descriptor.axis || { x: 0, y: 1, z: 0 };
  var radius = Number(descriptor.radius);
  if (!fin(radius) || radius <= 0) return Infinity;
  var nx = axis.x || 0, ny = axis.y || 0, nz = axis.z || 0, len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  var dx = point.x - (origin.x || 0), dy = point.y - (origin.y || 0), dz = point.z - (origin.z || 0);
  var along = dx * nx + dy * ny + dz * nz;
  var rx = dx - nx * along, ry = dy - ny * along, rz = dz - nz * along;
  return Math.hypot(along, Math.abs(Math.hypot(rx, ry, rz) - radius));
}

/* The CAD editor's component and topology picking, split out of js/modeler.js.
   It shares the editor's state through live imports from ../modeler.js. */
import { descriptorToParent, isSubassembly, lookupAssemblyComponent } from "../core/assembly_structure.js";
import { vertexEntriesFrom } from "../core/topology_selection.js";
import { createTopologyReference, isCylinderTessellationSeam, pointWithinCylinderArc, resolveMergedTopology } from "../core/topology.js";
import { analyticCurvedFace, smoothFacesForMesh } from "../modeler_mesh_geometry.js";
import { getScratchCandidateBox, nearestCircularEdge, pickPointer, pickScratch, projectToScreen, promotePickedEdge, topologyReferenceFromEntry, viewportRect } from "../modeler_pick_geometry.js";
import { chooseTopologyHit, filterTopologyHitsByClipPlane, topologyCandidateWorldThreshold, topologyLineWorldThreshold, topologyPickPixelRadius } from "../modeler_topology_pick.js";
import { finishCommandActive } from "../modeler/finish_preview.js";
import { retainingExactPreview } from "../modeler/library_panel.js";
import { componentDef, topologyEntriesForPart } from "../modeler/library_store.js";
import { sectionPlane } from "../modeler/view_modes.js";
import { fin } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, _scratchPickNormal, _scratchToComponent, set__scratchPickNormal,
  set__scratchToComponent,
} from "../modeler.js";

/* Assembly picking walks the same object tree as the part editor, but every
   component group carries its own document. Resolve which component owns a hit
   so the ray is scored against that component's topology, in that component's
   own coordinates — a mate reference only means anything in the space its
   component was authored in. */
function assemblyComponentById(id) {
  return lookupAssemblyComponent(E.assembly, id);
}

/* `component` is the top-level component a hit belongs to — what a mate
   names. Inside a sub-assembly the hit is scored against the part that was
   actually struck (`leaf`), in that part's own space (`group`), and `path`
   is the chain of child ids that leads to it. */
function pickOwnerChain(object, grp) {
  var partId = null, component = null, group = null, leafGroup = null, path = [];
  while (object && object !== grp) {
    var data = object.userData || {};
    if (!partId && data.cadPart) partId = data.cadPart;
    if (data.cadSubComponent) { path.unshift(data.cadSubComponent); if (!leafGroup) leafGroup = object; }
    if (!component && data.cadComponent) { component = assemblyComponentById(data.cadComponent); group = object; }
    object = object.parent;
  }
  var leaf = component;
  path.forEach(function (id) {
    leaf = leaf && isSubassembly(leaf) ? leaf.asm.components.find(function (child) { return child.id === id; }) || null : null;
  });
  return { partId: partId, component: component, group: leafGroup || group, leaf: leaf || component, path: path };
}

/* A reference picked on a part inside a sub-assembly, restated on the
   sub-assembly itself: its id prefixed with the path, its frames carried out
   through each child's pose. That is exactly the form the sub-assembly's
   composed topology (core/assembly_structure.js) resolves. */
function liftToTopComponent(reference, component, path) {
  if (!reference || !component || !path || !path.length) return reference;
  var chain = [], node = component;
  for (var i = 0; i < path.length; i++) {
    node = node && isSubassembly(node) ? node.asm.components.find(function (child) { return child.id === path[i]; }) : null;
    if (!node) return reference;
    chain.push(node);
  }
  var lift = function (frame) {
    if (!frame) return frame;
    for (var k = chain.length - 1; k >= 0; k--) frame = descriptorToParent(frame, chain[k]);
    return frame;
  };
  var prefix = path.join("/") + "/";
  var out = Object.assign({}, reference, {
    componentId: component.id, persistentId: prefix + reference.persistentId,
    descriptor: lift(reference.descriptor), frame: lift(reference.frame), pickFrame: lift(reference.pickFrame),
  });
  if (reference.memberPersistentIds) out.memberPersistentIds = reference.memberPersistentIds.map(function (id) { return prefix + id; });
  return out;
}

function pickPartsFor(component) {
  if (!component) return (E.def && E.def.parts) || [];
  var def = componentDef(component);
  return (def && def.parts) || [];
}



function nearestVertexReference(part, event, view, pixelRadius) {
  if (!part) return null;
  var rect = viewportRect(view);
  if (!rect) return null;
  var entries = vertexEntriesFrom(topologyEntriesForPart(part));
  if (!entries.length) return null;
  var best = null, bestDistance = Infinity;
  var band = Math.max(6, Number(pixelRadius) || 0);
  entries.forEach(function (entry) {
    var at = projectToScreen(view, entry.descriptor.point, rect);
    if (!at) return;
    var distance = Math.hypot(event.clientX - at.x, event.clientY - at.y);
    if (distance > band || distance >= bestDistance) return;
    bestDistance = distance;
    best = entry;
  });
  return best ? topologyReferenceFromEntry(best) : null;
}


function rawTopologyPickCandidate(hit, view) {
  if (!hit || !hit.object) return null;
  var chain = pickOwnerChain(hit.object, view.grp);
  var part = chain.partId
    ? pickPartsFor(chain.leaf).find(function (candidate) { return candidate.id === chain.partId; }) || null
    : null;
  var entries = part ? topologyEntriesForPart(part) : [];
  var edge = hit.object.userData && hit.object.userData.cadTopology;
  if (edge) {
    var promoted = promotePickedEdge(edge, entries.length ? entries : [edge]);
    return { part: part, reference: liftToTopComponent(topologyReferenceFromEntry(promoted), chain.component, chain.path) };
  }
  if (!(hit.face && hit.face.normal) || !part) return null;
  var ranges = hit.object.userData && hit.object.userData.cadFaceRanges;
  var range = Array.isArray(ranges) && fin(hit.faceIndex)
    ? ranges.find(function (candidate) {
      return hit.faceIndex >= candidate.triangleStart
        && hit.faceIndex < candidate.triangleStart + candidate.triangleCount;
    }) : null;
  var face = range && resolveMergedTopology(entries, range.persistentId);
  if (!face || face.kind !== "face") return null;
  return { part: part, reference: liftToTopComponent(topologyReferenceFromEntry(face), chain.component, chain.path) };
}

function resolveTopologyPick(event, view, options) {
  if(retainingExactPreview())return {hits:[],part:null,component:null,reference:null,pickPoint:null,pickNormal:null,pickedView:null,helixId:null};
  var prefer = options && options.prefer || E.selectionFilter || "all";
  /* A stationary component click is completed by the assembly drag recognizer's
     window-level pointerup listener. `currentTarget` is therefore Window there,
     not the canvas, and Window has no getBoundingClientRect(). Prefer the event
     target only when it is actually an element; otherwise use the view canvas. */
  var eventTarget = event.currentTarget;
  var pickSurface = eventTarget && typeof eventTarget.getBoundingClientRect === "function"
    ? eventTarget : view.rr.domElement;
  var rect = pickSurface.getBoundingClientRect();
  var ray = pickScratch();
  var pointer = pickPointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  var finishPick = finishCommandActive();
  var pickPixels = topologyPickPixelRadius(event.pointerType, prefer, finishPick);
  var worldPerPixel = view && typeof view.worldPerPixel === "function" ? view.worldPerPixel() : (view.dist || 120) * .0024;
  /* three.js asks for a world-unit Line threshold. Candidate collection is
     intentionally broader than the final screen-space band because a line
     beyond the orbit target has more world units per pixel than the target;
     final arbitration below uses each hit's exact depth and rejects anything
     outside the requested pixel radius. */
  ray.setFromCamera(pointer, view.cam);
  var farWorldPerPixel = view && typeof view.farthestWorldPerPixel === "function"
    ? view.farthestWorldPerPixel() : worldPerPixel * 2;
  ray.params.Line.threshold = topologyCandidateWorldThreshold(worldPerPixel, farWorldPerPixel, pickPixels);
  var candidates = view.grp.children;
  if (candidates.length > 2) {
    var candidateBox = getScratchCandidateBox();
    var filtered = [];
    var threshold = ray.params.Line.threshold || 1;
    for (var ci = 0; ci < candidates.length; ci++) {
      var child = candidates[ci];
      candidateBox.setFromObject(child);
      if (candidateBox.isEmpty()) {
        filtered.push(child);
        continue;
      }
      candidateBox.expandByScalar(threshold);
      if (ray.ray.intersectsBox(candidateBox)) {
        filtered.push(child);
      }
    }
    candidates = filtered;
  }
  var hits = candidates.length > 0 ? ray.intersectObjects(candidates, true) : [];
  if (E.section && E.section.enabled) hits = filterTopologyHitsByClipPlane(hits, sectionPlane());
  /* Line.raycast returns the closest point on the segment but, unlike Points,
     this vendored three.js does not include distanceToRay. Derive the actual
     cursor miss once here so topology policy receives the same metric for
     straight, polyline and circular overlay edges. */
  hits.forEach(function (hit) {
    hit.pickWorldPerPixel = view && typeof view.worldPerPixelAtDistance === "function"
      ? view.worldPerPixelAtDistance(hit.distance) : worldPerPixel;
    if (hit.object && hit.object.userData && hit.object.userData.cadTopology && hit.point) {
      hit.distanceToRay = ray.ray.distanceToPoint(hit.point);
    }
  });
  {
    var part = null;
    var pickedView = null;
    var pickPoint = null, pickNormalOut = null;
    var topologyReferencePicked = null;
    var helixHit = hits.find(function (hit) { return hit.object && hit.object.userData && hit.object.userData.cadReferenceId; });
    var helixId = helixHit && helixHit.object.userData.cadReferenceId || null;
    if (hits.length) {
      var pickChoice = chooseTopologyHit(hits, {
        prefer: prefer, finish: finishPick, worldPerPixel: worldPerPixel, pixelRadius: pickPixels,
        transparent: E.displayStyle === "transparent",
      });
      var edgeHit = pickChoice.edgeHit;
      var chosenHit = pickChoice.chosenHit;
      if (!chosenHit) {
        return {
          hits: hits, part: null, component: null, reference: null,
          pickPoint: null, pickNormal: null, pickedView: null, helixId: helixId,
        };
      }
      var partObject = chosenHit.object;
      var owner = partObject;
      var chosenChain = pickOwnerChain(partObject, view.grp);
      var pickComponent = chosenChain.component, pickLeaf = chosenChain.leaf, pickPath = chosenChain.path;
      if (chosenChain.partId) {
        part = pickPartsFor(pickLeaf).find(function (candidate) { return candidate.id === chosenChain.partId; }) || part;
      }
      var entries = part ? topologyEntriesForPart(part) : [];
      var edgeTopology = null;
      if (partObject.userData && partObject.userData.cadTopology) {
        edgeTopology = promotePickedEdge(partObject.userData.cadTopology, entries.length ? entries : [partObject.userData.cadTopology]);
        topologyReferencePicked = topologyReferenceFromEntry(edgeTopology);
      }
      var meshHit = pickChoice.meshHit || (chosenHit.face && chosenHit.face.normal ? chosenHit : null);
      if (meshHit && meshHit.face && meshHit.face.normal) {
        var worldNormal = meshHit.face.normal.clone().transformDirection(meshHit.object.matrixWorld);
        /* Which standard plane the face faces is a question about the room, so
           it is asked of the world normal before anything is converted. */
        var wx = Math.abs(worldNormal.x), wy = Math.abs(worldNormal.y), wz = Math.abs(worldNormal.z);
        pickedView = wy >= wx && wy >= wz ? "top" : wz >= wx ? "front" : "side";
        /* Everything below compares the hit against stored descriptors, and in
           an assembly those live in the component's own space. Bring the point
           and the normal into it, or a component that has been moved or turned
           scores every one of its faces against geometry that is no longer
           where the descriptor says it is. */
        var meshChain = pickOwnerChain(meshHit.object, view.grp);
        var pickNormal = worldNormal;
        if (meshChain.group) {
          meshChain.group.updateWorldMatrix(true, false);
          if (!_scratchToComponent) set__scratchToComponent(new THREE.Matrix4());
          var toComponent = _scratchToComponent.copy(meshChain.group.matrixWorld).invert();
          meshHit = Object.assign({}, meshHit, { point: meshHit.point.clone().applyMatrix4(toComponent) });
          if (!_scratchPickNormal) set__scratchPickNormal(new THREE.Vector3());
          pickNormal = _scratchPickNormal.copy(worldNormal).transformDirection(toComponent);
        }
        pickPoint = { x: meshHit.point.x, y: meshHit.point.y, z: meshHit.point.z };
        pickNormalOut = { x: pickNormal.x, y: pickNormal.y, z: pickNormal.z };
        var ax = Math.abs(pickNormal.x), ay = Math.abs(pickNormal.y), az = Math.abs(pickNormal.z);
        var topologyId = null;
        var faceRanges = meshHit.object.userData && meshHit.object.userData.cadFaceRanges;
        if (Array.isArray(faceRanges) && fin(meshHit.faceIndex)) {
          var range = faceRanges.find(function (candidate) { return meshHit.faceIndex >= candidate.triangleStart && meshHit.faceIndex < candidate.triangleStart + candidate.triangleCount; });
          topologyId = range && range.persistentId;
        }
        var featureId = meshHit.object.userData && meshHit.object.userData.cadFeatureId;
        owner = meshHit.object;
        while (owner && owner !== view.grp) {
          if (!featureId && owner.userData && owner.userData.cadFeatureId) featureId = owner.userData.cadFeatureId;
          owner = owner.parent;
        }
        if (!pickComponent) { pickComponent = meshChain.component; pickLeaf = meshChain.leaf; pickPath = meshChain.path; }
        if (!part && meshChain.partId) part = pickPartsFor(pickLeaf).find(function (candidate) { return candidate.id === meshChain.partId; }) || null;
        if (part) entries = topologyEntriesForPart(part);
        if (partObject.userData && partObject.userData.cadTopology) {
          edgeTopology = promotePickedEdge(partObject.userData.cadTopology, entries.length ? entries : [partObject.userData.cadTopology]);
          topologyReferencePicked = topologyReferenceFromEntry(edgeTopology);
        }
        var faceTopology = null, exactFace = false;
        if (topologyId) {
          faceTopology = resolveMergedTopology(entries, topologyId);
          // A triangle range from the kernel identifies its exact owning
          // face, including revolutions and splines. Replacing those faces
          // with smooth mesh patches destroys references used by features.
          if (faceTopology && part?.meshData?.topology?.length) exactFace = true;
        }
        if (!exactFace && entries.length) {
          /* Two scores per candidate. The first only counts faces the hit point
             actually lies ON, because the old alignment score let a distant
             parallel plane outrank the round wall the ray had really landed on:
             1000 for facing the same way beats 800 for being the right bore.
             The legacy score stays as the fallback so a face whose analytic
             origin drifted still resolves to something rather than nothing. */
          var bestScore = -Infinity, bestContained = -Infinity, containedFace = null;
          entries.filter(function (entry) { return entry.kind === "face"; }).forEach(function (entry) {
            var descriptor=entry.descriptor || {}, origin=descriptor.origin || descriptor.center;
            var score = -Infinity, contained = -Infinity;
            if (descriptor.surface === "cylinder" && descriptor.axis && fin(Number(descriptor.radius))) {
              var axis = descriptor.axis, radius = Math.abs(Number(descriptor.radius));
              var axisLength = Math.hypot(axis.x, axis.y, axis.z) || 1;
              /* Named for the axis, not ax/ay/az: those already mean the
                 magnitudes of the picked normal one scope out, and one pair of
                 names for two different vectors is how a reader ends up
                 debugging the wrong quantity. */
              var cylX = axis.x/axisLength, cylY = axis.y/axisLength, cylZ = axis.z/axisLength;
              var dx = meshHit.point.x - (origin && origin.x || 0), dy = meshHit.point.y - (origin && origin.y || 0), dz = meshHit.point.z - (origin && origin.z || 0);
              var along = dx*cylX + dy*cylY + dz*cylZ;
              var rx = dx - cylX*along, ry = dy - cylY*along, rz = dz - cylZ*along;
              var radial = Math.abs(Math.hypot(rx, ry, rz) - radius);
              var wall = Math.abs(pickNormal.x*cylX + pickNormal.y*cylY + pickNormal.z*cylZ);
              /* Radius and axis alone name a whole cylinder. A wall merged from
                 a run of chords only owns its own arc of one, and scoring the
                 rest of that circle let a tooth flank claim hits clear across
                 the body. */
              if (wall < 0.35 && pointWithinCylinderArc(meshHit.point, descriptor, Math.max(0.4, radius * 0.06) / Math.max(radius, 1e-9))) {
                score = 800 - radial * 20;
                // on this wall, not merely parallel to it — a bore and the boss
                // around it share an axis and differ only by radius
                if (radial <= Math.max(0.4, radius * 0.06)) contained = 1000 - radial*40 - wall*100;
              }
            } else if (descriptor.surface === "sphere" && fin(Number(descriptor.radius))) {
              var sphereCenter = descriptor.center || origin || {x:0,y:0,z:0};
              var sphereRadius = Math.abs(Number(descriptor.radius));
              var sdx = meshHit.point.x - (sphereCenter.x || 0), sdy = meshHit.point.y - (sphereCenter.y || 0), sdz = meshHit.point.z - (sphereCenter.z || 0);
              var sphereDist = Math.abs(Math.hypot(sdx, sdy, sdz) - sphereRadius);
              var sphereLen = Math.hypot(sdx, sdy, sdz) || 1;
              var sphereFacing = Math.abs((sdx*pickNormal.x + sdy*pickNormal.y + sdz*pickNormal.z) / sphereLen);
              score = 800 - sphereDist * 20;
              if (sphereDist <= Math.max(0.4, sphereRadius * 0.06) && sphereFacing >= 0.75) contained = 1100 - sphereDist*40;
            } else if (descriptor.surface === "cone" && descriptor.axis && fin(Number(descriptor.radius))) {
              var caxis = descriptor.axis, cLen = Math.hypot(caxis.x, caxis.y, caxis.z) || 1;
              var cax = caxis.x/cLen, cay = caxis.y/cLen, caz = caxis.z/cLen;
              var cdx = meshHit.point.x - (origin && origin.x || 0), cdy = meshHit.point.y - (origin && origin.y || 0), cdz = meshHit.point.z - (origin && origin.z || 0);
              var calong = cdx*cax + cdy*cay + cdz*caz;
              var crx = cdx - cax*calong, cry = cdy - cay*calong, crz = cdz - caz*calong;
              var expected = Math.abs(Number(descriptor.radius) + calong * Math.tan(Number(descriptor.angle) || 0));
              var coneRadial = Math.abs(Math.hypot(crx, cry, crz) - expected);
              score = 800 - coneRadial * 20;
              if (coneRadial <= Math.max(0.4, expected * 0.06)) contained = 1000 - coneRadial*40;
            } else if (descriptor.surface === "torus" && descriptor.axis && fin(Number(descriptor.majorRadius)) && fin(Number(descriptor.minorRadius))) {
              var taxis = descriptor.axis, tLen = Math.hypot(taxis.x, taxis.y, taxis.z) || 1;
              var tax = taxis.x/tLen, tay = taxis.y/tLen, taz = taxis.z/tLen;
              var tdx = meshHit.point.x - (origin && origin.x || 0), tdy = meshHit.point.y - (origin && origin.y || 0), tdz = meshHit.point.z - (origin && origin.z || 0);
              var talong = tdx*tax + tdy*tay + tdz*taz;
              var trx = tdx - tax*talong, try_ = tdy - tay*talong, trz = tdz - taz*talong;
              var major = Math.abs(Number(descriptor.majorRadius)), minor = Math.abs(Number(descriptor.minorRadius));
              var torusDist = Math.abs(Math.hypot(Math.hypot(trx, try_, trz) - major, talong) - minor);
              score = 800 - torusDist * 20;
              if (torusDist <= Math.max(0.4, minor * 0.08)) contained = 1000 - torusDist*40;
            } else if (descriptor.normal) {
              var normal = descriptor.normal;
              var normalLength = Math.hypot(normal.x, normal.y, normal.z) || 1;
              var nx = normal.x/normalLength, ny = normal.y/normalLength, nz = normal.z/normalLength;
              var alignment = nx*pickNormal.x + ny*pickNormal.y + nz*pickNormal.z;
              var planeDistance=0;
              if (origin) planeDistance=Math.abs((meshHit.point.x-origin.x)*nx+(meshHit.point.y-origin.y)*ny+(meshHit.point.z-origin.z)*nz);
              score = alignment*1000-planeDistance;
              /* Winding is not guaranteed to agree with the analytic normal, so
                 the facing test is unsigned — the plane distance already keeps
                 the far side of the body out. */
              if (Math.abs(alignment) >= 0.9 && planeDistance <= 0.4) contained = 900 + Math.abs(alignment)*90 - planeDistance*100;
            }
            if (contained > bestContained) { bestContained = contained; containedFace = entry; }
            if (score > bestScore) { bestScore = score; faceTopology = entry; }
          });
          if (containedFace) {
            faceTopology = containedFace;
            /* A 16-gon extrusion names each stave as its own plane. That hit is
               contained, but it is not the face the user meant — grouping still
               has to swallow the rest of the wall. */
            if (analyticCurvedFace(containedFace.descriptor) || (containedFace.descriptor?.surface === "plane" && part?.meshData?.topology?.length)) exactFace = true;
          }
        }
        if (!exactFace && fin(meshHit.faceIndex)) {
          /* Tessellated curves without a kernel face still have to pick as one
             wall: group triangles across edges that are not real creases. */
          var grouped = smoothFacesForMesh(meshHit.object);
          var groupedIndex = grouped.faceOfTriangle && grouped.faceOfTriangle.length > meshHit.faceIndex
            ? grouped.faceOfTriangle[meshHit.faceIndex] : -1;
          var groupedFace = groupedIndex >= 0 ? grouped.faces[groupedIndex] : null;
          if (groupedFace && groupedFace.descriptor && (groupedFace.descriptor.surface !== "plane" || !faceTopology)) {
            var groupedId = (featureId || "feature") + ":face:mesh:" + groupedIndex;
            faceTopology = resolveMergedTopology(entries, groupedId) || {
              ownerFeatureId: featureId, kind: "face", persistentId: groupedId,
              semantic: "mesh-face:" + groupedIndex, descriptor: groupedFace.descriptor,
            };
          }
        }
        /* Exact kernels normally provide a pick line for every circular rim.
           Keep an analytic fallback for Edge-only mode, but use the SAME
           screen-space band instead of applying a second, wider magnet after
           the face has already won. */
        if (prefer === "edge" && !topologyReferencePicked) {
          var rim = nearestCircularEdge(entries, meshHit.point, {
            maxDist: topologyLineWorldThreshold(meshHit.pickWorldPerPixel || worldPerPixel, pickPixels),
            cylinder: faceTopology && faceTopology.descriptor && faceTopology.descriptor.surface === "cylinder" ? faceTopology.descriptor : null,
          });
          if (rim) topologyReferencePicked = topologyReferenceFromEntry(rim);
        }
        /* Only a proven tessellation seam yields to the face in All. A straight
           generatrix on a partial cylinder, cone, or fillet is a real edge. */
        if (topologyReferencePicked && topologyReferencePicked.kind === "edge" && prefer !== "edge" && faceTopology) {
          var edgeEntry = edgeTopology || resolveMergedTopology(entries, topologyReferencePicked.persistentId);
          var roundWalls = entries.filter(function (entry) {
            return entry.kind === "face" && entry.descriptor && entry.descriptor.surface === "cylinder";
          });
          if (faceTopology.descriptor && faceTopology.descriptor.surface === "cylinder" && roundWalls.indexOf(faceTopology) === -1) {
            roundWalls = [faceTopology].concat(roundWalls);
          }
          if (edgeEntry && roundWalls.length && isCylinderTessellationSeam(edgeEntry, roundWalls)) topologyReferencePicked = null;
        }
        if (!topologyReferencePicked || prefer === "face") {
          if (faceTopology) topologyReferencePicked = topologyReferenceFromEntry(faceTopology);
          else if (featureId && prefer !== "edge") {
            var semantic = ay >= ax && ay >= az ? (pickNormal.y >= 0 ? "top" : "bottom") : ax >= az ? (pickNormal.x >= 0 ? "right" : "left") : (pickNormal.z >= 0 ? "front" : "back");
            topologyReferencePicked = createTopologyReference(featureId, "face", featureId + ":face:" + semantic, {surface:"plane",semantic:semantic,origin:{x:meshHit.point.x,y:meshHit.point.y,z:meshHit.point.z},normal:{x:pickNormal.x,y:pickNormal.y,z:pickNormal.z}});
          }
        }
      }
      while (partObject && partObject !== view.grp) {
        if (partObject.userData && partObject.userData.cadPart) {
          part = pickPartsFor(pickLeaf).find(function (candidate) { return candidate.id === partObject.userData.cadPart; }) || null;
          break;
        }
        partObject = partObject.parent;
      }
    }
    /* A corner beats whatever it sits on, but only while the Vertex filter is
       asking for one. Vertices are derived from edge endpoints rather than
       carried in the topology, so they cost nothing until something wants
       them — and leaving All-mode arbitration alone means the face-vs-edge
       rules the rest of the editor is built on do not shift underfoot. */
    if (prefer === "vertex") {
      topologyReferencePicked = nearestVertexReference(part, event, view, pickPixels) || null;
    }
    /* Everything above was measured in the struck part's own space. A part
       inside a sub-assembly is restated on the sub-assembly here, once. */
    if (pickPath && pickPath.length) {
      topologyReferencePicked = liftToTopComponent(topologyReferencePicked, pickComponent, pickPath);
      var liftedPick = pickPoint && pickNormalOut ? liftToTopComponent({ persistentId: "", descriptor: { origin: pickPoint, normal: pickNormalOut } }, pickComponent, pickPath).descriptor : null;
      if (liftedPick) { pickPoint = liftedPick.origin; pickNormalOut = liftedPick.normal; }
    }
    return {
      hits: hits, part: part, component: pickComponent || null, reference: topologyReferencePicked,
      /* Where the ray actually landed, in the same space as the descriptors.
         A mate needs a frame, and a resolved reference does not always carry
         one — the editor draws solids as RoundedBoxGeometry, whose filleted
         edges make the smooth-face grouping swallow the whole body into a
         single surface with no normal at all. */
      pickPoint: pickPoint || null, pickNormal: pickNormalOut || null,
      pickedView: pickedView, helixId: helixId,
    };
  }
}

export {
  assemblyComponentById, pickOwnerChain, pickPartsFor,
  rawTopologyPickCandidate, resolveTopologyPick,
};

// Screen-space topology acquisition for the model editor.
//
// A CAD cursor chooses the visible face under it unless an edge is genuinely
// within a small, stable pixel band.  Keeping this policy independent of
// three.js makes the priority rules testable without a WebGL context.

export function topologyPickPixelRadius(pointerType, prefer, finish) {
  if (prefer === "face") return 0;
  var touch = pointerType === "touch";
  /* A corner is a point, so its band is tighter than an edge's — but not so
     tight that a finger cannot land on one. */
  if (prefer === "vertex") return touch ? 16 : 9;
  if (prefer === "edge") return touch ? 14 : 8;
  if (finish) return touch ? 12 : 7;
  return touch ? 10 : 5;
}

export function topologyLineWorldThreshold(worldPerPixel, pixelRadius) {
  var scale = Number(worldPerPixel), pixels = Number(pixelRadius);
  if (!(scale > 0) || !(pixels > 0)) return 0.001;
  return Math.max(0.001, scale * pixels);
}

/* The raycaster needs one world-space broad-phase threshold before it knows
   which depth a line lives at. Use the larger screen scale across the scene;
   exact per-hit pixel rejection still happens in chooseTopologyHit(). */
export function topologyCandidateWorldThreshold(worldPerPixel, farWorldPerPixel, pixelRadius) {
  var nearScale = Number(worldPerPixel), farScale = Number(farWorldPerPixel);
  var scale = Math.max(nearScale > 0 ? nearScale : 0, farScale > 0 ? farScale : 0);
  return topologyLineWorldThreshold(scale, pixelRadius);
}

export function filterTopologyHitsByClipPlane(hits, plane, tolerance) {
  if (!Array.isArray(hits) || !plane || typeof plane.distanceToPoint !== "function") return Array.isArray(hits) ? hits : [];
  var slack = Number(tolerance);
  if (!(slack >= 0)) slack = 1e-4;
  return hits.filter(function (hit) {
    return !hit || !hit.point || Number(plane.distanceToPoint(hit.point)) >= -slack;
  });
}

/* Choose the represented arc, not the visually shorter one. A cut can leave
   95% of a circular rim; treating every >92% arc as closed draws and picks a
   phantom segment straight across the material that the cut removed. */
export function circularEdgeSweep(radius, measure, startAngle, endAngle, open) {
  var tau = Math.PI * 2;
  var start = Number(startAngle) || 0;
  if (!open) return { start: start, sweep: tau };
  var forward = (Number(endAngle) - start) % tau;
  if (forward <= 0) forward += tau;
  var backward = forward - tau;
  var r = Math.abs(Number(radius));
  var length = Math.abs(Number(measure));
  var sweep = forward;
  if (r > 0 && length > 0 && Math.abs(length - Math.abs(backward) * r) < Math.abs(length - forward * r)) {
    sweep = backward;
  }
  return { start: start, sweep: sweep };
}

function isFaceHit(hit) {
  return !!(hit && hit.face && hit.face.normal);
}

function isEdgeHit(hit) {
  return !!(hit && hit.object && hit.object.userData && hit.object.userData.cadTopology);
}

function edgeMiss(hit) {
  return Number.isFinite(Number(hit && hit.distanceToRay)) ? Number(hit.distanceToRay) : Infinity;
}

function hitWorldPerPixel(hit, fallback) {
  var value = Number(hit && hit.pickWorldPerPixel);
  return value > 0 ? value : fallback;
}

function edgeMissPixels(hit, fallback) {
  return edgeMiss(hit) / hitWorldPerPixel(hit, fallback);
}

function edgeStableKey(hit) {
  var data = hit && hit.object && hit.object.userData;
  var topology = data && data.cadTopology;
  return String(topology && (topology.persistentId || topology.semantic) || "");
}

/* Choose topology in the order professional CAD users expect:
   1. Explicit Face filter always takes the surface under the pointer.
   2. An edge must be inside the screen-space band and not hidden behind that
      surface.  Among candidates, the closest cursor-to-edge distance wins.
   3. Otherwise the directly hit face wins.

   `cadPickVisible === false` means the user turned model edges off. Explicit
   Edge filtering may still acquire them; All mode may not. */
export function chooseTopologyHit(hits, options) {
  hits = Array.isArray(hits) ? hits : [];
  options = options || {};
  var prefer = options.prefer || "all";
  var finish = !!options.finish;
  var worldPerPixel = Number(options.worldPerPixel) > 0 ? Number(options.worldPerPixel) : 1;
  var pixelRadius = Number(options.pixelRadius) >= 0 ? Number(options.pixelRadius) : 5;
  var faceHit = hits.find(isFaceHit) || null;
  var nonEdgeHit = hits.find(function (hit) { return !isEdgeHit(hit); }) || null;
  if (prefer === "face") return { chosenHit: faceHit || nonEdgeHit, edgeHit: null, meshHit: faceHit };

  var allowInvisible = prefer === "edge";
  var allowOccluded = prefer === "edge" || options.transparent === true;
  /* Overlay lines and their owning mesh can differ by tiny projection noise,
     but a full-pixel allowance reaches through thin sheet bodies at distant
     zoom levels. A quarter pixel preserves coincident front edges without
     treating the rear skin as visible in All mode. */
  var depthSlack = hitWorldPerPixel(faceHit, worldPerPixel) * 0.25;
  var edgeHits = hits.filter(function (hit) {
    if (!isEdgeHit(hit)) return false;
    if (!allowInvisible && !finish && hit.object.userData.cadPickVisible === false) return false;
    if (edgeMissPixels(hit, worldPerPixel) > pixelRadius) return false;
    return allowOccluded || !faceHit || !Number.isFinite(Number(hit.distance)) || !Number.isFinite(Number(faceHit.distance))
      || Number(hit.distance) <= Number(faceHit.distance) + depthSlack;
  }).sort(function (a, b) {
    return edgeMissPixels(a, worldPerPixel) - edgeMissPixels(b, worldPerPixel)
      || Number(a.distance || 0) - Number(b.distance || 0)
      || edgeStableKey(a).localeCompare(edgeStableKey(b));
  });
  var edgeHit = edgeHits[0] || null;
  return {
    chosenHit: edgeHit || faceHit || nonEdgeHit,
    edgeHit: edgeHit,
    meshHit: faceHit,
  };
}

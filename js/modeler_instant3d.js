// Instant3D handle math: drag arrows on a live feature instead of typing the
// PropertyManager. The viewport builds meshes from these poses; this module
// never touches Three.js.
import {endConditionHidesDepth} from './core/extrude_extent.js';
import {lengthToDocument,lengthFromDocument} from './core/document_length_units.js';

export function instant3dDisplayValue(value,key,unit){return key==='angle'?Number(value):lengthToDocument(Number(value),unit);}
export function instant3dModelValue(value,key,unit){return key==='angle'?Number(value):lengthFromDocument(Number(value),unit);}
export function instant3dValueLabel(feature,field,key,unit){return feature+' · '+field+' ('+(key==='angle'?'°':unit)+')';}

function num(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function axisVector(axis) {
  if (axis === "x") return { x: 1, y: 0, z: 0 };
  if (axis === "z") return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 1, z: 0 };
}

function centerOf(bounds) {
  bounds = bounds || {};
  return {
    x: (num(bounds.x0, 0) + num(bounds.x1, 0)) / 2,
    y: (num(bounds.y0, 0) + num(bounds.y1, 0)) / 2,
    z: (num(bounds.z0, 0) + num(bounds.z1, 0)) / 2,
  };
}

export function extrudeHandlePose(bounds, axis, params) {
  params = params || {};
  // Through-all and face-terminated extents do not use the numeric depth.
  // Showing a draggable depth here would suggest an edit that cannot persist.
  if(endConditionHidesDepth(params.endCondition))return null;
  var dir = axisVector(axis);
  var reverse = params.direction === "reverse" ? -1 : 1;
  var depth = Math.max(1e-6, num(params.depth, 10));
  var origin = centerOf(bounds);
  var end = axis === "x" ? (reverse > 0 ? bounds.x1 : bounds.x0)
    : axis === "z" ? (reverse > 0 ? bounds.z1 : bounds.z0)
    : (reverse > 0 ? bounds.y1 : bounds.y0);
  if (axis === "x") origin.x = num(end, origin.x);
  else if (axis === "z") origin.z = num(end, origin.z);
  else origin.y = num(end, origin.y);
  return {
    type: "extrude",
    key: "depth",
    origin: origin,
    direction: { x: dir.x * reverse, y: dir.y * reverse, z: dir.z * reverse },
    length: Math.max(8, Math.min(40, depth * 0.25)),
    value: depth,
  };
}

export function filletGrowDirection(descriptor) {
  var axis = descriptor && descriptor.axis || { x: 0, y: 1, z: 0 };
  var origin = descriptor && descriptor.origin || { x: 0, y: 0, z: 0 };
  var ax = Math.abs(num(axis.x, 0)), ay = Math.abs(num(axis.y, 1)), az = Math.abs(num(axis.z, 0));
  if (ay >= ax && ay >= az) return { x: num(origin.x, 0) >= 0 ? 1 : -1, y: 0, z: 0 };
  if (ax >= az) return { x: 0, y: num(origin.y, 0) >= 0 ? 1 : -1, z: 0 };
  return { x: origin.x >= 0 ? 1 : -1, y: 0, z: 0 };
}

export function filletHandlePose(point, radius, direction) {
  var r = Math.max(1e-6, num(radius, 1));
  var dir = direction || { x: 1, y: 0, z: 0 };
  if (!num(dir.x, 0) && !num(dir.y, 0) && !num(dir.z, 0)) dir = { x: 1, y: 0, z: 0 };
  return {
    type: "fillet",
    key: "radius",
    origin: { x: num(point && point.x, 0), y: num(point && point.y, 0), z: num(point && point.z, 0) },
    direction: dir,
    length: Math.max(10, r * 1.15),
    value: r,
  };
}

export function distancePointToSegment2d(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
  var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function maxFinishAmount(bounds, ratio) {
  bounds = bounds || {};
  var sizes = [
    Math.abs(num(bounds.x1, 0) - num(bounds.x0, 0)),
    Math.abs(num(bounds.y1, 0) - num(bounds.y0, 0)),
    Math.abs(num(bounds.z1, 0) - num(bounds.z0, 0)),
  ].filter(function (value) { return value > 1e-6; });
  if (!sizes.length) return 1;
  return Math.max(0.1, Math.min.apply(null, sizes) * (ratio || 0.45));
}

export function patternHandlePose(bounds, params) {
  params = params || {};
  var origin = centerOf(bounds);
  var spacing = Math.max(0.1, num(params.spacingX, params.offset || 20));
  return {
    type: "pattern",
    key: params.mode === "circular" ? "angle" : "spacingX",
    origin: origin,
    direction: params.mode === "circular" ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 },
    length: Math.max(8, spacing * 0.5),
    value: params.mode === "circular" ? num(params.angle, 90) : spacing,
  };
}

export function projectDeltaOnAxis(delta, direction) {
  delta = delta || {};
  direction = direction || { x: 0, y: 1, z: 0 };
  return num(delta.x, 0) * num(direction.x, 0)
    + num(delta.y, 0) * num(direction.y, 0)
    + num(delta.z, 0) * num(direction.z, 0);
}

/* Dragging a depth handle back through the plane FLIPS the feature and grows it
   the other way. It used to clamp at 1e-6, so pulling past zero pinned the
   ghost to nothing and the preview simply refused to follow the pointer — the
   single thing that reads as broken in a live drag.
 *
   Only the depth types get this. They are the ones with a `direction` to flip
   (see the extrude/cut/hole entries in core/feature_catalog.js); a negative
   fillet radius or shell thickness is not a direction, it is a value that does
   not exist, and there the clamp IS the honest answer. */
function flipDepth(params, depth) {
  if (depth >= 1e-6) { params.depth = depth; return params; }
  params.direction = params.direction === "reverse" ? "forward" : "reverse";
  params.depth = Math.max(1e-6, -depth);
  return params;
}

export function applyHandleDrag(type, params, worldDelta, direction) {
  params = Object.assign({}, params || {});
  var along = projectDeltaOnAxis(worldDelta, direction);
  if (type === "extrude" || type === "extrudeCut" || type === "hole") {
    return flipDepth(params, num(params.depth, 10) + along);
  } else if (type === "fillet") {
    params.radius = Math.max(1e-6, num(params.radius, 1) + along);
  } else if (type === "chamfer") {
    params.distance = Math.max(1e-6, num(params.distance, 1) + along);
  } else if (type === "shell") {
    params.thickness = Math.max(1e-6, num(params.thickness, 0.5) + along);
  } else if (type === "draft") {
    params.angle = Math.max(-89, Math.min(89, num(params.angle, 5) + along));
  } else if (type === "pattern") {
    if (params.mode === "circular") params.angle = Math.max(1, Math.min(360, num(params.angle, 90) + along));
    else params.spacingX = Math.max(0.1, num(params.spacingX, 20) + along);
  } else if (type === "revolve") {
    params.angle = Math.max(1e-6, Math.min(360, num(params.angle, 360) + along * 4));
  }
  return params;
}

export function dimensionValueFromDrag(startValue, pixelDelta, pxPerCm) {
  var scale = pxPerCm > 0 ? pxPerCm : 2;
  return Math.max(1e-6, num(startValue, 1) + pixelDelta / scale);
}

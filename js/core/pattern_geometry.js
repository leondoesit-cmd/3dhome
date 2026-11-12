// Shared pattern semantics for the authoring UI, lightweight model projection,
// and exact-kernel adapter. Keeping these calculations in one place prevents
// the live preview from disagreeing with the committed feature.

import { pathFrames } from "./profile_curves.js";

const AXES = ["x", "y", "z"];
export const LINEAR_PATTERN_INSTANCE_LIMIT = 128;

// A feature pattern cut from a revolved body normally turns about that body's
// axis. Follow the seed's history inputs instead of assuming Y: a sketch-plane
// revolve can place its actual shaft on X or Z even when the viewport is
// showing an end-on circular face.
export function circularPatternAxisFromHistory(features = [], seedFeatureId, fallback = "y") {
  const byId = new Map(features.map(feature => [feature.id, feature]));
  const pending = [seedFeatureId];
  const seen = new Set();
  while (pending.length) {
    const id = pending.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const feature = byId.get(id);
    if (!feature) continue;
    if ((feature.type === "revolve" || feature.type === "revolveCut") && AXES.includes(feature.params?.axis)) {
      return feature.params.axis;
    }
    pending.push(...(feature.inputs || []));
  }
  return AXES.includes(fallback) ? fallback : "y";
}

export function linearPatternDirection(params = {}) {
  const hasAxisToggles = AXES.some((axis) => Object.prototype.hasOwnProperty.call(params, "axis" + axis.toUpperCase()));
  if (hasAxisToggles) {
    const direction = {
      x: params.axisX ? 1 : 0,
      y: params.axisY ? 1 : 0,
      z: params.axisZ ? 1 : 0,
    };
    if (direction.x || direction.y || direction.z) return direction;
  }
  const explicit = params.direction;
  if (explicit && (Number(explicit.x) || Number(explicit.y) || Number(explicit.z))) {
    const vector={x:Number(explicit.x)||0,y:Number(explicit.y)||0,z:Number(explicit.z)||0},length=Math.hypot(vector.x,vector.y,vector.z);
    if(!Number.isFinite(length))throw new Error("Pattern direction must be finite");
    return {x:vector.x/length,y:vector.y/length,z:vector.z/length};
  }
  const axis = AXES.includes(params.directionAxis) ? params.directionAxis : "x";
  return { x:axis === "x" ? 1 : 0, y:axis === "y" ? 1 : 0, z:axis === "z" ? 1 : 0 };
}

export function patternAxisEnabled(params = {}, axis) {
  const key = "axis" + String(axis || "x").toUpperCase();
  if (Object.prototype.hasOwnProperty.call(params, key)) return !!params[key];
  const direction = linearPatternDirection(params);
  return !!direction[axis];
}

function patternDirectionVector(value) {
  if (!value) return null;
  const axis = value.descriptor?.axis || value.axis;
  const source = axis && Number.isFinite(Number(axis.x ?? axis.y ?? axis.z)) ? axis : value;
  const x = Number(source.x) || 0, y = Number(source.y) || 0, z = Number(source.z) || 0;
  const length = Math.hypot(x, y, z);
  if (!(length > 1e-12) || !Number.isFinite(length)) return null;
  const sign = source.reverse || value.reverse ? -1 : 1;
  return { x: sign * x / length, y: sign * y / length, z: sign * z / length };
}

export function linearPatternAxes(params = {}) {
  // Book HOUSING: Direction 1 and 2 are picked edges, not the XYZ toggles.
  const first = patternDirectionVector(params.direction1);
  const second = patternDirectionVector(params.direction2);
  if (first || second) {
    const axes = [];
    if (first) axes.push({
      axis: "vector", vector: first, component: 1,
      count: params.count1 ?? params.countX,
      spacing: params.spacing1 ?? params.spacingX ?? params.spacing,
      spacingIncrement: params.spacingIncrement1 ?? params.spacingIncrementX ?? 0,
    });
    if (second) axes.push({
      axis: "vector", vector: second, component: 1,
      count: params.count2 ?? params.countY ?? params.countZ,
      spacing: params.spacing2 ?? params.spacingY ?? params.spacingZ ?? params.spacing,
      spacingIncrement: params.spacingIncrement2 ?? params.spacingIncrementY ?? params.spacingIncrementZ ?? 0,
    });
    return axes;
  }
  const toggled = AXES.filter((axis) => Object.prototype.hasOwnProperty.call(params, "axis" + axis.toUpperCase()) && params["axis" + axis.toUpperCase()]);
  if (AXES.some((axis) => Object.prototype.hasOwnProperty.call(params, "axis" + axis.toUpperCase()))) {
    return (toggled.length ? toggled : ["x"]).map((axis) => ({ axis, component:1 }));
  }
  // Old documents used one free direction vector. Preserve that as one pattern
  // step instead of unexpectedly turning a legacy diagonal into a grid.
  const direction = linearPatternDirection(params);
  return [{ axis:"vector", vector:direction, component:1 }];
}

export function parseSkippedPatternInstances(value) {
  const skipped=new Set();
  const add=(number)=>{const instance=Math.round(Number(number));if(Number.isFinite(instance)&&instance>0)skipped.add(instance);};
  if(Array.isArray(value)){value.forEach(add);return skipped;}
  String(value || "").replace(/(\d)\s*-\s*(?=\d)/g,'$1-').split(/[\s,;]+/).filter(Boolean).forEach((token)=>{
    const range=token.match(/^(\d+)\s*-\s*(\d+)$/);
    if(!range){add(token);return;}
    const start=Math.min(Number(range[1]),Number(range[2])),end=Math.max(Number(range[1]),Number(range[2]));
    for(let instance=start;instance<=end&&instance-start<LINEAR_PATTERN_INSTANCE_LIMIT;instance++)add(instance);
  });
  return skipped;
}

export function linearPatternAxisDefinitions(params = {}, countValue, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const axes=linearPatternAxes(params),legacyCount=Math.max(2,Math.min(100,Math.round(Number(countValue ?? params.count) || 2)));
  const definitions=axes.map((entry)=>{
    if(entry.axis==="vector"){
      const count=Math.max(2,Math.min(100,Math.round(Number(entry.count ?? legacyCount) || 2)));
      return {...entry,count,spacing:Number(entry.spacing ?? params.spacing)||0,spacingIncrement:Number(entry.spacingIncrement ?? params.spacingIncrement)||0};
    }
    const suffix=entry.axis.toUpperCase(),count=Math.max(2,Math.min(100,Math.round(Number(params["count"+suffix] ?? legacyCount) || 2)));
    return {...entry,count,spacing:Number(params["spacing"+suffix] ?? params.spacing) || 0,spacingIncrement:Number(params["spacingIncrement"+suffix] ?? params.spacingIncrement) || 0};
  });
  const product=()=>definitions.reduce((total,definition)=>total*definition.count,1);
  while(product()>limit){
    const reducible=definitions.filter((definition)=>definition.count>2).sort((a,b)=>b.count-a.count)[0];
    if(!reducible)break;reducible.count--;
  }
  return definitions;
}

export function linearPatternCountPerAxis(params = {}, countValue, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const requested = Math.max(2, Math.round(Number(countValue ?? params.count) || 2));
  const dimensions = Math.max(1, linearPatternAxes(params).length);
  return Math.max(2, Math.min(requested, Math.floor(Math.pow(Math.max(2, limit), 1 / dimensions) + 1e-9)));
}

export function linearPatternOffsets(params = {}, countValue, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const definitions=linearPatternAxisDefinitions(params,countValue,limit),offsets=[{x:0,y:0,z:0,indices:[]}];
  definitions.forEach((entry) => {
    const prior = offsets.slice();offsets.length=0;
    prior.forEach((base) => {
      for (let index=0;index<entry.count;index++) {
        const next={x:base.x,y:base.y,z:base.z,indices:base.indices.concat(index)},distance=entry.spacing*index+entry.spacingIncrement*index*(index-1)/2;
        if(entry.axis === "vector") {
          next.x += Number(entry.vector.x || 0) * distance;
          next.y += Number(entry.vector.y || 0) * distance;
          next.z += Number(entry.vector.z || 0) * distance;
        } else next[entry.axis] += distance;
        offsets.push(next);
      }
    });
  });
  const skipped=parseSkippedPatternInstances(params.skipInstances);
  return offsets.slice(1).map((offset,index)=>({...offset,instance:index+1})).filter((offset)=>!skipped.has(offset.instance));
}

export function circularPatternStepDegrees(params = {}, countValue) {
  const count = Math.max(2, Math.round(Number(countValue ?? params.count) || 2));
  const angle = Number(params.angle) || 360;
  if (params.equalSpacing === false) return angle;
  // A closed ring must not put the last copy on top of the seed. Partial arcs,
  // however, include both ends of the requested extent.
  return Math.abs(Math.abs(angle) - 360) < 1e-9 ? angle / count : angle / (count - 1);
}

export function circularPatternPivot(params = {}) {
  const pivot=params.pivot??params.origin;
  if(pivot){if(!AXES.every(axis=>Number.isFinite(pivot[axis])))throw new Error("Pattern pivot requires three finite coordinates");return {x:pivot.x,y:pivot.y,z:pivot.z};}
  const axis=["x","y","z"].includes(params.axis)?params.axis:"y",distance=Number(params.radialDistance)||0;
  if(axis==="x")return {x:0,y:-distance,z:0};
  return {x:-distance,y:0,z:0};
}

export function rotatePointAroundAxis(point, axis, angle, pivot = {}) {
  const px=Number(pivot.x)||0,py=Number(pivot.y)||0,pz=Number(pivot.z)||0,x=(Number(point?.x)||0)-px,y=(Number(point?.y)||0)-py,z=(Number(point?.z)||0)-pz;
  const c = Math.cos(Number(angle) || 0), s = Math.sin(Number(angle) || 0);
  if (axis === "x") return { x:x+px, y:y*c-z*s+py, z:y*s+z*c+pz };
  if (axis === "z") return { x:x*c-y*s+px, y:x*s+y*c+py, z:z+pz };
  return { x:x*c+z*s+px, y:y+py, z:-x*s+z*c+pz };
}

/* ---- rigid transforms, v -> M.v + t --------------------------------------
 *
 * The one algebra a pattern needs: a placement is a rigid transform, and so is
 * the turn the editor draws a copy with. Composing and inverting them here
 * keeps every caller from writing its own 3x3 by hand — and a rigid inverse is
 * the rotation transposed with the rotated shift negated, which is exact and
 * costs nine multiplies, so nothing here ever wants a general matrix inverse. */
export const RIGID_IDENTITY = { matrix:[1, 0, 0, 0, 1, 0, 0, 0, 1], translation:{ x:0, y:0, z:0 } };

/* The matrices rotatePointAroundAxis applies, written out. */
export function axisRotationMatrix(axis, angle) {
  const c = Math.cos(Number(angle) || 0), s = Math.sin(Number(angle) || 0);
  if (axis === "x") return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === "z") return [c, -s, 0, s, c, 0, 0, 0, 1];
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/* "Turn by M about P" as the pair the kernel takes: v -> M.v + (P - M.P). */
export function rigidTransformAboutPivot(matrix, pivot = {}) {
  const px = Number(pivot.x) || 0, py = Number(pivot.y) || 0, pz = Number(pivot.z) || 0;
  return { matrix:matrix.slice(), translation:{
    x: px - (matrix[0] * px + matrix[1] * py + matrix[2] * pz),
    y: py - (matrix[3] * px + matrix[4] * py + matrix[5] * pz),
    z: pz - (matrix[6] * px + matrix[7] * py + matrix[8] * pz),
  } };
}

export function applyRigidMatrix(matrix, vector = {}) {
  const x = Number(vector.x) || 0, y = Number(vector.y) || 0, z = Number(vector.z) || 0;
  return {
    x: matrix[0] * x + matrix[1] * y + matrix[2] * z,
    y: matrix[3] * x + matrix[4] * y + matrix[5] * z,
    z: matrix[6] * x + matrix[7] * y + matrix[8] * z,
  };
}

/* outer . inner — inner applies first. */
export function composeRigidTransforms(outer, inner) {
  const a = (outer && outer.matrix) || RIGID_IDENTITY.matrix, b = (inner && inner.matrix) || RIGID_IDENTITY.matrix;
  const matrix = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    matrix.push(a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]);
  }
  const shifted = applyRigidMatrix(a, (inner && inner.translation) || {});
  const outerShift = (outer && outer.translation) || {};
  return { matrix, translation:{
    x: shifted.x + (Number(outerShift.x) || 0),
    y: shifted.y + (Number(outerShift.y) || 0),
    z: shifted.z + (Number(outerShift.z) || 0),
  } };
}

/* Nothing to do: lets a caller drop an identity row rather than emit one. */
export function rigidTransformIsIdentity(transform, tolerance = 1e-12) {
  const m = (transform && transform.matrix) || RIGID_IDENTITY.matrix, t = (transform && transform.translation) || RIGID_IDENTITY.translation;
  return RIGID_IDENTITY.matrix.every((value, index) => Math.abs(m[index] - value) <= tolerance)
    && ["x", "y", "z"].every((axis) => Math.abs(Number(t[axis]) || 0) <= tolerance);
}

export function invertRigidTransform(transform) {
  const m = (transform && transform.matrix) || RIGID_IDENTITY.matrix;
  const matrix = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];   // a rotation's inverse is its transpose
  const back = applyRigidMatrix(matrix, (transform && transform.translation) || {});
  return { matrix, translation:{ x:-back.x, y:-back.y, z:-back.z } };
}

// Saved bodies may carry both the current rotation list and an older single turn.
export function partPatternRotations(part) {
  const rotations = Array.isArray(part?.patternRotations) ? [...part.patternRotations] : [];
  if (part?.patternRotation) rotations.push(part.patternRotation);
  return rotations.filter(r => r && ["x","y","z"].includes(r.axis) && Number.isFinite(Number(r.angle)))
    .map(({axis, angle, pivot}) => ({
      axis, angle: Number(angle),
      pivot: pivot ? {x:Number(pivot.x)||0, y:Number(pivot.y)||0, z:Number(pivot.z)||0} : undefined,
    }));
}

/* The editor's list of axis turns as ONE rigid transform.
 *
 * A part carries its pattern turns as `patternRotations`, and buildPart nests
 * them newest-OUTERMOST — R[n-1] . ... . R[0] . body — so the composition has to
 * run in that order or the answer describes a body nobody drew. This is the
 * transform a copy gets at render time and that exactBrepForPart does NOT bake
 * into its BREP, which is exactly why anything fused INTO such a copy has to be
 * expressed relative to it. */
export function patternRotationTransform(rotations = []) {
  // a fresh object, never the shared constant: callers hand these to builders
  let composed = { matrix:RIGID_IDENTITY.matrix.slice(), translation:{ ...RIGID_IDENTITY.translation } };
  rotations.forEach((rotation) => {
    composed = composeRigidTransforms(rigidTransformAboutPivot(axisRotationMatrix(rotation.axis, rotation.angle), rotation.pivot), composed);
  });
  return composed;
}

/* One pattern placement as a single rigid transform, v -> M.v + t.
 *
 * The editor lays a copy by moving its definition and pushing axis rotations
 * onto it; the KERNEL has no notion of a pivot and needs the pair. Every mode
 * answers here so a merged pattern has one place to ask where a copy went — the
 * curve mode already computed exactly this pair for its own kernel path, and a
 * linear offset is the identity turn with the offset as the shift. The matrices
 * are the ones rotatePointAroundAxis applies, written out, so the fused solid
 * lands where the viewport drew the unfused copies. */
export function patternPlacementTransform(params = {}, placement = {}, circularStep = 0) {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (params.mode === "circular") {
    const axis = ["x", "y", "z"].includes(params.axis) ? params.axis : "y";
    const angle = Number(circularStep) * (Number(placement.circularIndex) || 0);
    const pivot = circularPatternPivot(params);
    return rigidTransformAboutPivot(axisRotationMatrix(axis, angle), pivot);
  }
  if (Array.isArray(placement.matrix) && placement.matrix.length === 9) {
    return { matrix: placement.matrix.slice(), translation: { ...(placement.translation || { x: 0, y: 0, z: 0 }) } };
  }
  return { matrix: identity, translation: { x: Number(placement.x) || 0, y: Number(placement.y) || 0, z: Number(placement.z) || 0 } };
}

export function rotatedPatternBounds(bounds, rotations = []) {
  if (!bounds || !rotations.length) return bounds;
  const points = [];
  for (const x of [bounds.x0, bounds.x1]) for (const y of [bounds.y0, bounds.y1]) for (const z of [bounds.z0, bounds.z1]) {
    let point = { x, y, z };
    rotations.forEach((rotation) => { point = rotatePointAroundAxis(point, rotation.axis, rotation.angle, rotation.pivot); });
    points.push(point);
  }
  return {
    x0:Math.min(...points.map((point) => point.x)), x1:Math.max(...points.map((point) => point.x)),
    y0:Math.min(...points.map((point) => point.y)), y1:Math.max(...points.map((point) => point.y)),
    z0:Math.min(...points.map((point) => point.z)), z1:Math.max(...points.map((point) => point.z)),
  };
}

/* ---- curve-driven pattern ------------------------------------------------
 *
 * Instances distributed along a sketched path instead of along an axis or
 * around one. The path arrives already sampled into world points, the way a
 * sweep's does — the sketch is the authoring input, the polyline is what every
 * consumer reads.
 *
 * HOW AN INSTANCE IS ORIENTED. Each station gets the frame pathFrames() carries
 * along the path, and the copy is turned by the rotation that takes the FIRST
 * station's frame onto that station's — so the seed's own orientation is the
 * datum and instance 1 of a straight run is not rotated at all. The frame is
 * the rotation-minimising (parallel-transport) one the sweep work already
 * settled on: raw Frenet flips its normal through an inflection, which would
 * turn one copy upside down halfway along an S-curve, and it is undefined on
 * the straight segments a sketched path is mostly made of. Reusing pathFrames()
 * also means a curve pattern and a sweep along the same sketch agree about
 * which way "up" is, rather than being two different answers.
 *
 * The turn is stored as the editor's existing three axis rotations rather than
 * as a matrix, because that is the only transform a part can carry
 * (partPatternRotations / rotatedPatternBounds / buildPart all speak it), and
 * three of them compose to any rotation. They share one pivot: the station
 * itself, which is what makes "translate to the station, then turn about it"
 * come out as R(s - P0) + Pi.
 *
 * `align: "none"` slides the copies along the path without turning them, which
 * is what a run of identical uprights following a curved rail wants. */

const CURVE_ALIGNMENTS = ["tangent", "none"];

function vec(p) {
  return { x: Number(p && p.x) || 0, y: Number(p && p.y) || 0, z: Number(p && p.z) || 0 };
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (v) => { const l = len(v); return l > 1e-12 ? scale(v, 1 / l) : { x: 0, y: 0, z: 0 }; };

/* The stored path, welded: repeated points make a zero-length step that
   pathFrames() would hand a null tangent. */
export function curvePatternPath(params = {}) {
  const raw = Array.isArray(params.path) ? params.path : [];
  const points = [];
  raw.forEach((entry) => {
    const point = vec(entry);
    const last = points[points.length - 1];
    if (!last || len(sub(point, last)) > 1e-9) points.push(point);
  });
  return points;
}

export function curvePatternLength(frames) {
  return frames && frames.length ? frames[frames.length - 1].distance : 0;
}

/* The frame at an arbitrary arc length, between the two samples that bracket
   it. The basis is interpolated and re-orthonormalised rather than snapped to
   the nearer sample, so an instance does not jump between stations when the
   spacing is changed by a millimetre. */
function frameAtDistance(frames, distance) {
  const total = curvePatternLength(frames);
  const target = Math.max(0, Math.min(total, distance));
  let index = 1;
  while (index < frames.length - 1 && frames[index].distance < target) index++;
  const before = frames[index - 1], after = frames[index];
  const span = after.distance - before.distance;
  const t = span > 1e-12 ? (target - before.distance) / span : 0;
  const origin = add(before.origin, scale(sub(after.origin, before.origin), t));
  let tangent = unit(add(before.tangent, scale(sub(after.tangent, before.tangent), t)));
  if (len(tangent) < 0.5) tangent = after.tangent;      // opposed tangents cancelled
  let normal = add(before.normal, scale(sub(after.normal, before.normal), t));
  normal = unit(sub(normal, scale(tangent, dot3(normal, tangent))));
  if (len(normal) < 0.5) normal = before.normal;
  return { origin, tangent, normal, binormal: unit(cross3(tangent, normal)), distance: target };
}

/* B(i) . B(0)^T, with the frame's three vectors as columns. */
function relativeRotation(frame, base) {
  const columns = [frame.tangent, frame.normal, frame.binormal];
  const rows = [base.tangent, base.normal, base.binormal];
  const m = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const axis = ["x", "y", "z"][r];
    m.push(columns[0][axis] * rows[0][["x", "y", "z"][c]] + columns[1][axis] * rows[1][["x", "y", "z"][c]] + columns[2][axis] * rows[2][["x", "y", "z"][c]]);
  }
  return m;   // row-major 3x3
}

/* M = Rz(c) . Ry(b) . Rx(a), which is the order the editor's rotation list
   composes in when the entries are pushed x, y, z. */
export function eulerFromMatrix(m) {
  const clamp = Math.max(-1, Math.min(1, -m[6]));
  const b = Math.asin(clamp);
  if (Math.abs(clamp) > 1 - 1e-9) {
    // gimbal lock: pitch is +/-90 and only the sum of roll and yaw is defined
    return { x: Math.atan2(-m[5], m[4]), y: b, z: 0 };
  }
  return { x: Math.atan2(m[7], m[8]), y: b, z: Math.atan2(m[3], m[0]) };
}

export function curvePatternInstanceCount(params = {}, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const requested = Math.round(Number(params.curveCount ?? params.count) || 2);
  return Math.max(2, Math.min(limit, requested));
}

/* One entry per copy, the seed excluded — the same shape linearPatternOffsets
   returns, plus the turn. `spacing` walks a fixed arc length from the start and
   stops at the end of the path; the default fits the whole run. */
export function curvePatternPlacements(params = {}, limit = LINEAR_PATTERN_INSTANCE_LIMIT) {
  const points = curvePatternPath(params);
  const frames = pathFrames(points);
  if (!frames) return [];
  const total = curvePatternLength(frames);
  if (!(total > 1e-9)) return [];
  const count = curvePatternInstanceCount(params, limit);
  const spacing = Number(params.curveSpacing) || 0;
  const fixed = params.curveSpacingMode === "spacing" && spacing > 1e-9;
  const step = fixed ? spacing : total / (count - 1);
  const align = CURVE_ALIGNMENTS.includes(params.curveAlign) ? params.curveAlign : "tangent";
  const base = frames[0];
  const skipped = parseSkippedPatternInstances(params.skipInstances);
  const placements = [];
  for (let index = 1; index < count; index++) {
    const distance = step * index;
    // A fixed spacing that runs off the end stops there rather than stacking
    // every remaining copy on the last point.
    if (fixed && distance > total + 1e-9) break;
    const frame = frameAtDistance(frames, distance);
    const offset = sub(frame.origin, base.origin);
    const placement = {
      x: offset.x, y: offset.y, z: offset.z,
      instance: index, indices: [index], distance: frame.distance,
      t: total > 0 ? frame.distance / total : 0,
      rotations: [],
    };
    const rotation = align === "tangent" ? relativeRotation(frame, base) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (align === "tangent") {
      const euler = eulerFromMatrix(rotation);
      const pivot = { x: frame.origin.x, y: frame.origin.y, z: frame.origin.z };
      // pushed x, y, z: the list applies last-outermost, so this is Rz.Ry.Rx
      AXES.forEach((axis) => { placement.rotations.push({ axis, angle: euler[axis], pivot: { ...pivot } }); });
    }
    /* The same placement as one rigid transform, for the exact kernel — which
       has no notion of a pivot and would otherwise be handed the offset alone
       and lose every turn. v -> R(v - P0) + Pi, so the shift is Pi - R.P0. */
    placement.matrix = rotation;
    placement.translation = {
      x: frame.origin.x - (rotation[0] * base.origin.x + rotation[1] * base.origin.y + rotation[2] * base.origin.z),
      y: frame.origin.y - (rotation[3] * base.origin.x + rotation[4] * base.origin.y + rotation[5] * base.origin.z),
      z: frame.origin.z - (rotation[6] * base.origin.x + rotation[7] * base.origin.y + rotation[8] * base.origin.z),
    };
    placements.push(placement);
  }
  return placements.filter((placement) => !skipped.has(placement.instance));
}

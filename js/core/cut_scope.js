import { cylinderAxis } from "./cylinder_axis.js";
// Which bodies a cut passes through — decided in the cut's own space.
//
// A cut loop is authored in the (u, v) of the plane or face it was drawn on.
// Deciding which bodies sit under it therefore has to measure those bodies in
// that same space. Reading the *active* sketch frame instead is what made a cut
// land on some bodies and not others: by the time a cut is applied, finishing
// the sketch has closed plane editing, so the frame is gone and the loop's
// (u, v) end up compared against world X and Z. A body under a sketch face near
// the origin matches by luck; a boss anywhere else is judged "not under the
// cut" and silently keeps its shape.

import { framePoint, frameProjectPoint, frameFromPlane } from "./frame.js";

const LOOP_EPSILON = 1e-8;

function loopPoint(point) {
  return point && Number.isFinite(point.u) && Number.isFinite(point.v);
}

function pointOnLoopSegment(point, a, b) {
  const du = b.u - a.u, dv = b.v - a.v;
  const cross = (point.u - a.u) * dv - (point.v - a.v) * du;
  const tolerance = LOOP_EPSILON * Math.max(1, Math.abs(du) + Math.abs(dv));
  if (Math.abs(cross) > tolerance) return false;
  const dot = (point.u - a.u) * du + (point.v - a.v) * dv;
  return dot >= -tolerance && dot <= du * du + dv * dv + tolerance;
}

function pointInLoop(point, loop, includeBoundary = true) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if (pointOnLoopSegment(point, a, b)) return includeBoundary;
    if ((a.v > point.v) !== (b.v > point.v)
      && point.u < ((b.u - a.u) * (point.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) {
  const value = (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
  const scale = Math.max(1, Math.abs(b.u - a.u) + Math.abs(b.v - a.v), Math.abs(c.u - a.u) + Math.abs(c.v - a.v));
  return Math.abs(value) <= LOOP_EPSILON * scale ? 0 : Math.sign(value);
}

function segmentsTouchOrCross(a, b, c, d) {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (abC === 0 && pointOnLoopSegment(c, a, b))
    || (abD === 0 && pointOnLoopSegment(d, a, b))
    || (cdA === 0 && pointOnLoopSegment(a, c, d))
    || (cdB === 0 && pointOnLoopSegment(b, c, d));
}

function loopBoundariesMeet(a, b) {
  for (let ai = 0; ai < a.length; ai++) {
    const a0 = a[ai], a1 = a[(ai + 1) % a.length];
    for (let bi = 0; bi < b.length; bi++) {
      if (segmentsTouchOrCross(a0, a1, b[bi], b[(bi + 1) % b.length])) return true;
    }
  }
  return false;
}

/* Lightweight profile holes are valid only for loops wholly surrounded by
   material. A slot that touches or crosses the outer boundary changes that
   boundary's topology and must be handled as an exact boolean cut. */
export function loopStrictlyInsideLoop(inner, outer) {
  if (!Array.isArray(inner) || !Array.isArray(outer) || inner.length < 3 || outer.length < 3
    || !inner.every(loopPoint) || !outer.every(loopPoint)) return false;
  if (loopBoundariesMeet(inner, outer)) return false;
  return inner.every((point) => pointInLoop(point, outer, false));
}

/* Two voids which meet or overlap are one topological opening, not two profile
   holes. Route that case through the boolean kernel as well. */
export function loopsOverlapOrTouch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3
    || !a.every(loopPoint) || !b.every(loopPoint)) return false;
  return loopBoundariesMeet(a, b) || pointInLoop(a[0], b, true) || pointInLoop(b[0], a, true);
}

export function profileLoopIsSeparateHole(loop, outer, existingHoles = []) {
  return loopStrictlyInsideLoop(loop, outer)
    && !(existingHoles || []).some((existing) => loopsOverlapOrTouch(loop, existing));
}

export function sameFrameOrientation(a, b) {
  if (!a || !b || !a.normal || !b.normal || !a.xAxis || !b.xAxis) return false;
  const normal = a.normal.x * b.normal.x + a.normal.y * b.normal.y + a.normal.z * b.normal.z;
  const xAxis = a.xAxis.x * b.xAxis.x + a.xAxis.y * b.xAxis.y + a.xAxis.z * b.xAxis.z;
  return normal > 0.99999 && xAxis > 0.99999;
}

/* The eight corners of a box, in the (u, v) of a frame. */
export function boundsInFrame(bounds, frame) {
  const us = [], vs = [];
  for (const x of [bounds.x0, bounds.x1]) {
    for (const y of [bounds.y0, bounds.y1]) {
      for (const z of [bounds.z0, bounds.z1]) {
        const local = frameProjectPoint(frame, { x, y, z });
        us.push(local.u); vs.push(local.v);
      }
    }
  }
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

/* A body's footprint in the space the cut loop is written in.
   `part` is a modeller body, `bounds` its world box, `frame` the cut's sketch
   frame (null for a cut on a principal plane) and `axisName` the extrusion axis
   that cut runs along. Returns either a polygon (when the body's own profile is
   readable in this space, which is exact) or a rectangle (its box, which is
   generous but never wrong about a body it fully misses). */
/* The world position of a profile point on a body that has no local frame. */
function axisPoint(axisName, u, v, w) {
  if (axisName === "x") return { x: w, y: v, z: u };
  if (axisName === "z") return { x: u, y: v, z: w };
  return { x: u, y: w, z: v };
}

/* The outline of a set of points, so a prism seen from an angle reports the
   shape it really covers instead of the box around it. Monotone chain; a convex
   profile comes back exactly, a concave one comes back as its convex cover —
   still far tighter than a bounding box. */
export function convexHull(points) {
  const pts = points.filter((p) => Number.isFinite(p?.u) && Number.isFinite(p?.v))
    .slice().sort((a, b) => a.u - b.u || a.v - b.v);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
  const half = (source) => {
    const out = [];
    for (const p of source) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return half(pts).concat(half(pts.slice().reverse()));
}

export function cutFootprint(part, bounds, frame, axisName, holeLoop = (hole) => hole) {
  // A merged boss extends the stock beyond the original part's profile. Use
  // the complete body's conservative envelope here; native intersection below
  // still decides whether the cutter actually removes material.
  const rotations=[...(Array.isArray(part?.patternRotations)?part.patternRotations:[]),part?.patternRotation];
  const rotated=rotations.some(r=>r && ['x','y','z'].includes(r.axis) && Number.isFinite(Number(r.angle)) && Number(r.angle)!==0);
  if (rotated || (part?.merges3d || []).some((merge) => !merge.suppressed)) {
    if (frame) return boundsInFrame(bounds, frame);
    if (axisName === "y") return { u0: bounds.x0, u1: bounds.x1, v0: bounds.z0, v1: bounds.z1 };
    if (axisName === "z") return { u0: bounds.x0, u1: bounds.x1, v0: bounds.y0, v1: bounds.y1 };
    return { u0: bounds.z0, u1: bounds.z1, v0: bounds.y0, v1: bounds.y1 };
  }
  if(part?.kind==="cyl"){
    const axis=cylinderAxis(part.axis),origin={x:Number(part.x)||0,y:Number(part.y)||0,z:Number(part.z)||0};
    const ownFrame=frameFromPlane(origin,axis),points=[],count=96;
    for(const [height,radius] of [[0,part.r],[Number(part.h)||0,part.r2 ?? part.r]])for(let i=0;i<count;i++){
      // Circumscribed rings conservatively contain the true circular caps.
      const angle=2*Math.PI*i/count,r=Math.abs(Number(radius)||0)/Math.cos(Math.PI/count);
      const p=framePoint(ownFrame,r*Math.cos(angle),r*Math.sin(angle),height);
      const q=frame?frameProjectPoint(frame,p):axisName==="z"?{u:p.x,v:p.y}:axisName==="x"?{u:p.z,v:p.y}:{u:p.x,v:p.z};points.push({u:q.u,v:q.v});
    }
    const hull=convexHull(points);if(hull.length>=3)return {type:"poly",pts:hull,holes:[]};
  }
  const profile = (project) => {
    const outline = project(part?.pts);
    if (!outline || outline.length < 3) return null;
    return {
      type: "poly",
      pts: outline,
      holes: (part.holes || []).map((hole) => project(holeLoop(hole))).filter((loop) => loop && loop.length >= 3),
    };
  };
  if (frame) {
    if (part?.kind === "ext" && part.frame && sameFrameOrientation(part.frame, frame)) {
      const projected = profile((loop) => (loop || []).map((q) => {
        const local = frameProjectPoint(frame, framePoint(part.frame, q.u, q.v, part.from));
        return { u: local.u, v: local.v };
      }));
      if (projected) return projected;
    }
    /* An extrusion the cut meets from another direction still covers only what
       its own profile sweeps. Reading its bounding box instead let a cut claim
       bodies it passes beside — a slot next to a round boss would put a
       (harmless but real) cut record on the boss. */
    if (part?.kind === "ext" && (part.pts || []).length >= 3) {
      const toWorld = part.frame
        ? (q, w) => framePoint(part.frame, q.u, q.v, w)
        : (q, w) => axisPoint(part.axis, q.u, q.v, w);
      const swept = [];
      for (const w of [part.from, part.to]) {
        for (const q of part.pts) {
          const local = frameProjectPoint(frame, toWorld(q, w));
          swept.push({ u: local.u, v: local.v });
        }
      }
      const hull = convexHull(swept);
      if (hull.length >= 3) return { type: "poly", pts: hull, holes: [] };
    }
    return boundsInFrame(bounds, frame);
  }
  // No frame: the loop lives in the plane its own axis names, and so must the body.
  if (part?.kind === "ext" && part.axis === axisName) {
    const own = profile((loop) => (loop || []).map((q) => ({ u: q.u, v: q.v })));
    if (own) return own;
  }
  if (axisName === "y") return { u0: bounds.x0, u1: bounds.x1, v0: bounds.z0, v1: bounds.z1 };
  if (axisName === "z") return { u0: bounds.x0, u1: bounds.x1, v0: bounds.y0, v1: bounds.y1 };
  return { u0: bounds.z0, u1: bounds.z1, v0: bounds.y0, v1: bounds.y1 };
}

/* How far a body reaches along the cut's own direction, so a blind cut is not
   recorded on a body it never reaches. */
export function bodyDepthRange(bounds, frame, axisName) {
  if (frame) {
    const ws = [];
    for (const x of [bounds.x0, bounds.x1]) {
      for (const y of [bounds.y0, bounds.y1]) {
        for (const z of [bounds.z0, bounds.z1]) ws.push(frameProjectPoint(frame, { x, y, z }).w);
      }
    }
    return { from: Math.min(...ws), to: Math.max(...ws) };
  }
  if (axisName === "x") return { from: bounds.x0, to: bounds.x1 };
  if (axisName === "z") return { from: bounds.z0, to: bounds.z1 };
  return { from: bounds.y0, to: bounds.y1 };
}

// Broad phase includes boundary crossings even if neither polygon contains a
// vertex of the other (two thin crossing strips are a common slot case).
export function cutFootprintsMayOverlap(loop,footprint){
  const outer=footprint?.type==='poly'?footprint.pts:footprint?[{u:footprint.u0,v:footprint.v0},{u:footprint.u1,v:footprint.v0},{u:footprint.u1,v:footprint.v1},{u:footprint.u0,v:footprint.v1}]:null;
  return !outer||loopsOverlapOrTouch(loop,outer);
}

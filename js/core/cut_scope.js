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

import { framePoint, frameProjectPoint } from "./frame.js";

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

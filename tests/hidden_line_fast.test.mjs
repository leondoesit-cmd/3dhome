import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { Session } from 'node:inspector';
import { meshFeatureEdges } from '../js/core/mesh_projection.js';
import { tessellateParts } from '../js/core/part_tessellate.js';

// Frozen pre-optimization implementation. Keep independent of production helpers:
// deep equality must catch changes in numerical results and insertion order too.
function originalImplementation() {
/* Orthographic projection with hidden-line removal — the geometry engine the
 * drawing sheet is drawn from.
 *
 * A drafting view is not "the silhouette of the mesh". It is three line types
 * that a reader relies on: continuous thick for edges you can see, dashed thin
 * for edges the body hides, and thin chain for axes. Deciding which is which
 * needs an occlusion test, not a facing test — core/mesh_projection.js answers
 * the facing question (is this edge on a front-facing face) and that is why a
 * sheet drawn from it showed the far side of a box straight through the near
 * side, with every line the same weight.
 *
 * The test here is the classic one: project every triangle once, drop them in a
 * uniform grid, then walk each candidate edge and ask, at samples along it,
 * whether any triangle covers that point nearer the viewer. Runs of samples
 * with the same answer become the visible and hidden spans of that edge.
 *
 * Deliberately plain data in, plain data out (no Three.js, no DOM), so the
 * canvas sheet, the SVG/PDF exporter and the tests all share one answer.
 */



const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const v3 = (x, y, z) => ({ x, y, z });

/* `forward` points from the model TOWARD the viewer, so a bigger w is nearer.
   `up` is the direction that ends up pointing up the page; `right` follows from
   right × up = forward, which is what keeps a right view showing -Z to the
   right the way third-angle projection requires. */
const VIEW_BASES = Object.freeze({
  front:   { forward: v3(0, 0, 1),  up: v3(0, 1, 0) },
  back:    { forward: v3(0, 0, -1), up: v3(0, 1, 0) },
  right:   { forward: v3(1, 0, 0),  up: v3(0, 1, 0) },
  left:    { forward: v3(-1, 0, 0), up: v3(0, 1, 0) },
  top:     { forward: v3(0, 1, 0),  up: v3(0, 0, -1) },
  bottom:  { forward: v3(0, -1, 0), up: v3(0, 0, 1) },
  iso:     { forward: unit(v3(1, 1, 1)),   up: unit(v3(-1, 2, -1)) },
  isoleft: { forward: unit(v3(-1, 1, 1)),  up: unit(v3(1, 2, -1)) },
  isorear: { forward: unit(v3(-1, 1, -1)), up: unit(v3(1, 2, 1)) },
  dimetric:{ forward: unit(v3(0.8, 0.5, 1)), up: unit(v3(-0.24, 1, -0.19)) },
});

const ORTHO_VIEWS = Object.freeze(["front", "back", "left", "right", "top", "bottom"]);
const isOrthoView = (name) => ORTHO_VIEWS.includes(name);

function viewBasis(name) {
  if(name && typeof name==='object') {
    const valid=p=>p&&[p.x,p.y,p.z].every(Number.isFinite)&&Math.hypot(p.x,p.y,p.z)>1e-9;
    if(!valid(name.forward)||!valid(name.up))throw new Error('Projection basis needs finite nonzero directions');
    const forward=unit(name.forward),up=unit(name.up);
    if(Math.abs(dot(forward,up))>1e-7)throw new Error('Projection basis must be orthogonal');
    return {forward,up,right:unit(cross(up,forward))};
  }
  const base = VIEW_BASES[name] || VIEW_BASES.front;
  const forward = unit(base.forward), up = unit(base.up);
  return { forward, up, right: unit(cross(up, forward)) };
}

/* The world axis a standard view measures across the page, and up it. Callers
   that must line a dimension up with a model axis (the sheet's automatic
   overall sizes) ask here rather than re-deriving the mapping. */
function viewAxes(name) {
  const { right, up } = viewBasis(name);
  const axisOf = (vector) => {
    const ax = Math.abs(vector.x), ay = Math.abs(vector.y), az = Math.abs(vector.z);
    if (ax > ay && ax > az) return { axis: "x", sign: Math.sign(vector.x) };
    if (ay > az) return { axis: "y", sign: Math.sign(vector.y) };
    return { axis: "z", sign: Math.sign(vector.z) };
  };
  return { horizontal: axisOf(right), vertical: axisOf(up) };
}

/* ---- triangle soup ------------------------------------------------------ */

/* One flat store for every body in the view. Bodies arrive as {positions} — an
   unindexed triangle soup, the shape both the exact kernel meshes and the
   viewport tessellation already produce. */
function collectTriangles(bodies) {
  const list = Array.isArray(bodies) ? bodies : [bodies];
  let total = 0;
  for (const body of list) {
    const positions = body?.positions;
    if (positions?.length) total += Math.floor(positions.length / 9);
  }
  const points = new Float64Array(total * 9), owner = new Int32Array(total), nativeFace = new Array(total);
  let tri = 0, bodyIndex = 0;
  const bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const body of list) {
    const positions = body?.positions;
    if (positions?.length) {
      const count = Math.floor(positions.length / 9);
      const faceOf = new Array(count);
      for (const range of body.faceRanges || []) {
        if (!range.persistentId || !Number.isInteger(range.triangleStart) || !Number.isInteger(range.triangleCount) || range.triangleStart < 0 || range.triangleCount <= 0 || range.triangleStart + range.triangleCount > count) continue;
        for (let i=range.triangleStart;i<range.triangleStart+range.triangleCount;i++) faceOf[i]=String(range.persistentId);
      }
      for (let i = 0; i < count; i++) {
        let ok = true;
        for (let k = 0; k < 9; k++) {
          const value = Number(positions[i * 9 + k]);
          if (!Number.isFinite(value)) { ok = false; break; }
          points[tri * 9 + k] = value;
        }
        if (!ok) continue;
        owner[tri] = bodyIndex; nativeFace[tri] = faceOf[i];
        for (let k = 0; k < 9; k += 3) {
          const x = points[tri * 9 + k], y = points[tri * 9 + k + 1], z = points[tri * 9 + k + 2];
          if (x < bounds.x0) bounds.x0 = x; if (x > bounds.x1) bounds.x1 = x;
          if (y < bounds.y0) bounds.y0 = y; if (y > bounds.y1) bounds.y1 = y;
          if (z < bounds.z0) bounds.z0 = z; if (z > bounds.z1) bounds.z1 = z;
        }
        tri++;
      }
    }
    bodyIndex++;
  }
  const span = Number.isFinite(bounds.x0)
    ? Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, bounds.z1 - bounds.z0, 1e-3)
    : 1;
  return { points, owner, nativeFace, count: tri, bounds: Number.isFinite(bounds.x0) ? bounds : null, span };
}

function triangleNormal(points, tri) {
  const i = tri * 9;
  const ax = points[i + 3] - points[i], ay = points[i + 4] - points[i + 1], az = points[i + 5] - points[i + 2];
  const bx = points[i + 6] - points[i], by = points[i + 7] - points[i + 1], bz = points[i + 8] - points[i + 2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz);
  return len > 1e-12 ? { x: nx / len, y: ny / len, z: nz / len } : null;
}

/* Edges welded across triangles, each remembering which triangles meet on it.
   The triangle list — not just the normals — is what lets the silhouette test
   below ask "do these two faces disagree about facing the viewer", which is the
   only way a tessellated cylinder gets an outline instead of 24 facet ribs. */
function buildEdges(store, weld) {
  const { points, count } = store;
  const key = (i) => Math.round(points[i] / weld) + ":" + Math.round(points[i + 1] / weld) + ":" + Math.round(points[i + 2] / weld);
  const edges = new Map();
  for (let tri = 0; tri < count; tri++) {
    const base = tri * 9;
    const keys = [key(base), key(base + 3), key(base + 6)];
    for (let e = 0; e < 3; e++) {
      const ka = keys[e], kb = keys[(e + 1) % 3];
      if (ka === kb) continue;
      const id = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      const found = edges.get(id);
      if (found) { found.tris.push(tri); continue; }
      const ai = base + e * 3, bi = base + ((e + 1) % 3) * 3;
      edges.set(id, {
        a: { x: points[ai], y: points[ai + 1], z: points[ai + 2] },
        b: { x: points[bi], y: points[bi + 1], z: points[bi + 2] },
        tris: [tri],
      });
    }
  }
  return Array.from(edges.values());
}

/* ---- the depth grid ----------------------------------------------------- */

/* Every triangle projected once, bucketed by the cells its 2D box touches. A
   visibility query then looks at a handful of triangles instead of all of them,
   which is what makes sampling along every edge affordable. */
function buildDepthGrid(store, basis) {
  const { points, count } = store;
  const u = new Float64Array(count * 3), v = new Float64Array(count * 3), w = new Float64Array(count * 3);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let tri = 0; tri < count; tri++) {
    for (let corner = 0; corner < 3; corner++) {
      const i = tri * 9 + corner * 3, out = tri * 3 + corner;
      const x = points[i], y = points[i + 1], z = points[i + 2];
      const pu = x * basis.right.x + y * basis.right.y + z * basis.right.z;
      const pv = x * basis.up.x + y * basis.up.y + z * basis.up.z;
      u[out] = pu; v[out] = pv;
      w[out] = x * basis.forward.x + y * basis.forward.y + z * basis.forward.z;
      if (pu < u0) u0 = pu; if (pu > u1) u1 = pu;
      if (pv < v0) v0 = pv; if (pv > v1) v1 = pv;
    }
  }
  if (!Number.isFinite(u0)) return null;
  const width = Math.max(u1 - u0, 1e-6), height = Math.max(v1 - v0, 1e-6);
  const cells = Math.max(4, Math.min(96, Math.round(Math.sqrt(Math.max(count, 1)))));
  const cw = width / cells, ch = height / cells;
  const buckets = new Array(cells * cells);
  const clamp = (value) => Math.max(0, Math.min(cells - 1, value));
  for (let tri = 0; tri < count; tri++) {
    const a = tri * 3, b = a + 1, c = a + 2;
    const minU = Math.min(u[a], u[b], u[c]), maxU = Math.max(u[a], u[b], u[c]);
    const minV = Math.min(v[a], v[b], v[c]), maxV = Math.max(v[a], v[b], v[c]);
    const cx0 = clamp(Math.floor((minU - u0) / cw)), cx1 = clamp(Math.floor((maxU - u0) / cw));
    const cy0 = clamp(Math.floor((minV - v0) / ch)), cy1 = clamp(Math.floor((maxV - v0) / ch));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const index = cy * cells + cx;
        if (buckets[index]) buckets[index].push(tri); else buckets[index] = [tri];
      }
    }
  }
  return { u, v, w, u0, v0, cw, ch, cells, buckets, bounds: { u0, u1, v0, v1 }, clamp };
}

/* Is (pu, pv) covered by a triangle standing NEARER the viewer than pw?
   The depth slack is what keeps an edge from hiding under the very faces it
   belongs to: those faces have exactly this depth at exactly this point, and
   floating point alone would make the answer a coin toss along every rib. */
function coveredNearer(grid, pu, pv, pw, slack) {
  const cx = grid.clamp(Math.floor((pu - grid.u0) / grid.cw));
  const cy = grid.clamp(Math.floor((pv - grid.v0) / grid.ch));
  const bucket = grid.buckets[cy * grid.cells + cx];
  if (!bucket) return false;
  const { u, v, w } = grid;
  for (let index = 0; index < bucket.length; index++) {
    const tri = bucket[index], a = tri * 3, b = a + 1, c = a + 2;
    const ux = u[b] - u[a], vy = v[b] - v[a], ux2 = u[c] - u[a], vy2 = v[c] - v[a];
    const denominator = ux * vy2 - ux2 * vy;
    if (Math.abs(denominator) < 1e-12) continue;      // edge-on sliver covers nothing
    const du = pu - u[a], dv = pv - v[a];
    const s = (du * vy2 - ux2 * dv) / denominator;
    const t = (ux * dv - du * vy) / denominator;
    if (s < -1e-9 || t < -1e-9 || s + t > 1 + 1e-9) continue;
    const depth = w[a] + s * (w[b] - w[a]) + t * (w[c] - w[a]);
    if (depth > pw + slack) return true;
  }
  return false;
}

/* One edge split into its visible and hidden spans. Sampling decides each
   interval; three bisection steps then walk the two boundary intervals in, so a
   line that disappears behind a rib breaks where the rib actually is instead of
   at the nearest sample. */
function splitEdge(grid, a, b, slack, samples) {
  const visibleAt = (t) => !coveredNearer(grid,
    a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t, a.w + (b.w - a.w) * t, slack);
  const runs = [];
  let state = visibleAt(0.5 / samples), start = 0;
  for (let i = 1; i < samples; i++) {
    const here = visibleAt((i + 0.5) / samples);
    if (here === state) continue;
    let lo = (i - 0.5) / samples, hi = (i + 0.5) / samples;
    for (let step = 0; step < 3; step++) {
      const mid = (lo + hi) / 2;
      if (visibleAt(mid) === state) lo = mid; else hi = mid;
    }
    runs.push({ visible: state, t0: start, t1: (lo + hi) / 2 });
    start = (lo + hi) / 2;
    state = here;
  }
  runs.push({ visible: state, t0: start, t1: 1 });
  return runs;
}

const lerpPoint = (a, b, t) => ({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });

/* ---- consolidation ------------------------------------------------------
 *
 * Sampling produces the truth one edge at a time, and the truth is repetitive:
 * a box's back rectangle projects exactly onto its front one, a tessellated rim
 * seen edge-on arrives as 32 collinear chords, and every hidden line under a
 * visible one is a line a draughtsman would never ink. Three rules fix all of
 * it — collect segments onto the infinite line they share, merge what overlaps,
 * and subtract the visible spans from the hidden ones. Without this the sheet
 * draws a dashed line under every solid one and a cylinder's rim as 32 strokes.
 */

const ANGLE_STEP = 0.01;   // ~0.57°, below which two segments are one line

function lineOf(segment, tolerance) {
  let du = segment.b.u - segment.a.u, dv = segment.b.v - segment.a.v;
  const length = Math.hypot(du, dv);
  if (!(length > 0)) return null;
  du /= length; dv /= length;
  if (du < -1e-12 || (Math.abs(du) <= 1e-12 && dv < 0)) { du = -du; dv = -dv; }
  const angle = Math.atan2(dv, du);                       // canonical, in [0, π)
  const offset = du * segment.a.v - dv * segment.a.u;
  return {
    dir: { u: du, v: dv },
    angleIndex: Math.round(angle / ANGLE_STEP),
    offsetIndex: Math.round(offset / tolerance),
  };
}

function findGroup(groups, line) {
  for (let da = -1; da <= 1; da++) {
    for (let db = -1; db <= 1; db++) {
      const found = groups.get((line.angleIndex + da) + ":" + (line.offsetIndex + db));
      if (found) return found;
    }
  }
  return null;
}

function groupSegments(segments, tolerance) {
  const groups = new Map();
  for (const segment of segments) {
    const line = lineOf(segment, tolerance);
    if (!line) continue;
    let group = findGroup(groups, line);
    if (!group) {
      group = { dir: line.dir, origin: segment.a, spans: [] };
      groups.set(line.angleIndex + ":" + line.offsetIndex, group);
    }
    const project = (point) => (point.u - group.origin.u) * group.dir.u + (point.v - group.origin.v) * group.dir.v;
    const ta = project(segment.a), tb = project(segment.b);
    group.spans.push(ta < tb ? [ta, tb] : [tb, ta]);
  }
  groups.forEach((group) => { group.spans = mergeSpans(group.spans, tolerance); });
  return groups;
}

function mergeSpans(spans, tolerance) {
  if (spans.length < 2) return spans;
  spans.sort((a, b) => a[0] - b[0]);
  const out = [spans[0].slice()];
  for (let i = 1; i < spans.length; i++) {
    const last = out[out.length - 1];
    if (spans[i][0] <= last[1] + tolerance) last[1] = Math.max(last[1], spans[i][1]);
    else out.push(spans[i].slice());
  }
  return out;
}

function subtractSpans(spans, cuts, tolerance) {
  let current = spans;
  for (const cut of cuts) {
    const next = [];
    for (const span of current) {
      if (cut[1] <= span[0] + tolerance || cut[0] >= span[1] - tolerance) { next.push(span); continue; }
      if (cut[0] > span[0] + tolerance) next.push([span[0], cut[0]]);
      if (cut[1] < span[1] - tolerance) next.push([cut[1], span[1]]);
    }
    current = next;
    if (!current.length) break;
  }
  return current;
}

function spansToSegments(group, spans, minimum) {
  const out = [];
  for (const [t0, t1] of spans) {
    if (t1 - t0 < minimum) continue;
    out.push({
      a: { u: group.origin.u + group.dir.u * t0, v: group.origin.v + group.dir.v * t0 },
      b: { u: group.origin.u + group.dir.u * t1, v: group.origin.v + group.dir.v * t1 },
    });
  }
  return out;
}

function consolidateSegments(visible, hidden, tolerance, minimumLength) {
  const tol = tolerance > 0 ? tolerance : 1e-4;
  const minimum = Number.isFinite(minimumLength) ? Math.max(0, minimumLength) : tol * 2;
  const visibleGroups = groupSegments(visible, tol);
  const hiddenGroups = groupSegments(hidden, tol);
  const outVisible = [], outHidden = [];
  visibleGroups.forEach((group) => outVisible.push(...spansToSegments(group, group.spans, minimum)));
  hiddenGroups.forEach((group, key) => {
    const parts = key.split(":");
    const overlay = findGroup(visibleGroups, { angleIndex: Number(parts[0]), offsetIndex: Number(parts[1]) });
    let spans = group.spans;
    if (overlay) {
      /* Re-project the visible spans onto THIS group's origin before cutting:
         two groups on one line may have been seeded from different segments. */
      const shift = (overlay.origin.u - group.origin.u) * group.dir.u + (overlay.origin.v - group.origin.v) * group.dir.v;
      const sign = overlay.dir.u * group.dir.u + overlay.dir.v * group.dir.v < 0 ? -1 : 1;
      const cuts = overlay.spans.map(([t0, t1]) => {
        const a = shift + sign * t0, b = shift + sign * t1;
        return a < b ? [a, b] : [b, a];
      });
      spans = subtractSpans(spans, mergeSpans(cuts, tol), tol);
    }
    outHidden.push(...spansToSegments(group, spans, minimum));
  });
  return { visible: outVisible, hidden: outHidden };
}

/* ---- circles ------------------------------------------------------------ */

const featureCache = new WeakMap();

function bodyCircles(body) {
  if (!body || typeof body !== "object" || !body.positions?.length) return [];
  const cached = featureCache.get(body);
  if (cached) return cached;
  let circles = [];
  try { circles = meshFeatureEdges(body).circles || []; } catch { circles = []; }
  featureCache.set(body, circles);
  return circles;
}

// Two closed coaxial rims of equal radius identify a cylindrical wall. Its
// long edges are tessellation seams, even when a coarse mesh exceeds the
// normal crease angle. Keep their silhouette, and keep every cap/rim crease.
function bodyCylinders(body, tolerance) {
  const circles = bodyCircles(body).filter(circle => circle.closed && circle.origin && circle.radius > 0);
  const cylinders = [];
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
    const a = circles[i], b = circles[j], axis = unit(a.axis || v3(0,1,0));
    if (Math.abs(dot(axis, unit(b.axis || v3(0,1,0)))) < 1 - 1e-6 || Math.abs(a.radius - b.radius) > tolerance) continue;
    const delta = {x:b.origin.x-a.origin.x,y:b.origin.y-a.origin.y,z:b.origin.z-a.origin.z};
    const height = dot(delta, axis);
    if (Math.abs(height) <= tolerance) continue;
    if (Math.hypot(delta.x-axis.x*height, delta.y-axis.y*height, delta.z-axis.z*height) > tolerance) continue;
    cylinders.push({origin:a.origin,axis,radius:a.radius,from:Math.min(0,height),to:Math.max(0,height)});
  }
  return cylinders;
}

function cylindricalSeam(edge, faces, cylinders, tolerance) {
  const direction = unit({x:edge.b.x-edge.a.x,y:edge.b.y-edge.a.y,z:edge.b.z-edge.a.z});
  for (const cylinder of cylinders) {
    if (Math.abs(dot(direction,cylinder.axis)) < 1-1e-6 || faces.some(normal=>Math.abs(dot(normal,cylinder.axis))>1e-5)) continue;
    let matches = true;
    for (const point of [edge.a,edge.b]) {
      const relative={x:point.x-cylinder.origin.x,y:point.y-cylinder.origin.y,z:point.z-cylinder.origin.z};
      const along=dot(relative,cylinder.axis);
      const radial=Math.hypot(relative.x-cylinder.axis.x*along,relative.y-cylinder.axis.y*along,relative.z-cylinder.axis.z*along);
      if (along<cylinder.from-tolerance || along>cylinder.to+tolerance || Math.abs(radial-cylinder.radius)>tolerance) {matches=false;break;}
    }
    if(matches) return cylinder;
  }
  return null;
}

function cylinderSilhouette(point, cylinder, forward) {
  const direction=unit(cross(cylinder.axis,forward));
  const relative={x:point.x-cylinder.origin.x,y:point.y-cylinder.origin.y,z:point.z-cylinder.origin.z};
  const along=dot(relative,cylinder.axis), sign=dot(relative,direction)<0?-1:1;
  return {x:cylinder.origin.x+cylinder.axis.x*along+direction.x*cylinder.radius*sign,
    y:cylinder.origin.y+cylinder.axis.y*along+direction.y*cylinder.radius*sign,
    z:cylinder.origin.z+cylinder.axis.z*along+direction.z*cylinder.radius*sign};
}

/* A hole rim is worth more to the reader than the ring it draws: seen down its
   axis it earns a centre mark and a diameter to dimension from, seen edge-on it
   earns the centreline that says "this is round". Both come from the same fitted
   3D circle, classified by how its axis lies to the view. */
function projectCircles(bodies, basis, grid, slack) {
  const list = Array.isArray(bodies) ? bodies : [bodies];
  const out = [];
  for (const body of list) {
    for (const circle of bodyCircles(body)) {
      const origin = circle.origin, axis = unit(circle.axis || v3(0, 1, 0)), radius = Number(circle.radius) || 0;
      if (!origin || !(radius > 1e-6)) continue;
      const facing = Math.abs(dot(axis, basis.forward));
      const centre = {
        u: dot(origin, basis.right),
        v: dot(origin, basis.up),
        w: dot(origin, basis.forward),
      };
      const entry = {
        u: centre.u, v: centre.v, radius,
        kind: facing > 0.985 ? "round" : facing < 0.08 ? "edge" : "oblique",
        axis: { u: dot(axis, basis.right), v: dot(axis, basis.up) },
        visible: true,
      };
      if (entry.kind === "oblique") continue;             // an ellipse earns no mark
      if (grid) {
        /* A rim behind the body must not leave its centre mark floating on the
           front face. Four points around the rim vote; the mark survives when
           the rim is mostly in front of whatever else is in the way. */
        let seen = 0;
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          const uOffset = Math.cos(angle) * radius, vOffset = Math.sin(angle) * radius;
          if (!coveredNearer(grid, centre.u + uOffset, centre.v + vOffset, centre.w, slack)) seen++;
        }
        entry.visible = seen >= 2;
      }
      out.push(entry);
    }
  }
  return out;
}

/* A hole seen down its axis reaches the sheet as 32 short chords. The fitted
   circle already describes it exactly, so when the chords cover the full turn
   they are withdrawn and the sheet inks one smooth curve instead — the
   difference between a CAD drawing and a polygon. A rim that is only partly
   behind something keeps its chords: the break is information. */
function absorbCircleChords(circles, segments, tolerance) {
  const keep = new Array(segments.length).fill(true);
  for (const circle of circles) {
    if (circle.kind !== "round") continue;
    const radius = circle.radius, tol = Math.max(tolerance, radius * 0.02);
    const matched = [];
    const angularSpans = [];
    segments.forEach((segment, index) => {
      if (!keep[index]) return;
      const da = Math.hypot(segment.a.u - circle.u, segment.a.v - circle.v);
      const db = Math.hypot(segment.b.u - circle.u, segment.b.v - circle.v);
      if (Math.abs(da - radius) > tol || Math.abs(db - radius) > tol) return;
      const length = Math.hypot(segment.b.u - segment.a.u, segment.b.v - segment.a.v);
      if (length > radius) return;                       // a chord, not a crossing rib
      const mid = { u: (segment.a.u + segment.b.u) / 2, v: (segment.a.v + segment.b.v) / 2 };
      if (Math.hypot(mid.u - circle.u, mid.v - circle.v) < radius * 0.7) return;
      matched.push(index);
      let start = Math.atan2(segment.a.v-circle.v, segment.a.u-circle.u);
      let end = Math.atan2(segment.b.v-circle.v, segment.b.u-circle.u);
      let delta = end-start;
      if(delta>Math.PI) delta-=2*Math.PI;
      if(delta<-Math.PI) delta+=2*Math.PI;
      if(delta<0) { start=end; delta=-delta; }
      start=(start+2*Math.PI)%(2*Math.PI);
      end=start+delta;
      angularSpans.push([start,Math.min(end,2*Math.PI)]);
      if(end>2*Math.PI) angularSpans.push([0,end-2*Math.PI]);
    });
    // Front/back rims and shared mesh edges can overlap in projection. Count
    // their union so duplicate partial rims cannot masquerade as a full circle.
    const sweep = mergeSpans(angularSpans, 1e-6).reduce((sum,span)=>sum+span[1]-span[0],0);
    if (sweep < Math.PI * 2 * 0.96) continue;
    circle.absorbed = true;
    matched.forEach((index) => { keep[index] = false; });
  }
  return segments.filter((segment, index) => keep[index]);
}

/* ---- section cutting ---------------------------------------------------- */

/* Keep the half of the solid BEHIND the cutting plane (signed distance <= 0)
   and report the loops the plane carved, which the sheet hatches. A section
   view that merely hides geometry is a lie: the cut face is the part of the
   drawing a machinist reads. */
function sectionBodies(bodies, plane) {
  const normal = unit(plane?.normal || v3(0, 0, 1));
  const origin = plane?.origin || v3(0, 0, 0);
  const offset = dot(normal, origin);
  const list = Array.isArray(bodies) ? bodies : [bodies];
  const kept = [], cuts = [];
  for (const body of list) {
    const positions = body?.positions;
    if (!positions?.length) continue;
    const out = [];
    const count = Math.floor(positions.length / 9);
    for (let tri = 0; tri < count; tri++) {
      const corners = [];
      for (let k = 0; k < 3; k++) {
        const i = tri * 9 + k * 3;
        corners.push({ x: Number(positions[i]), y: Number(positions[i + 1]), z: Number(positions[i + 2]) });
      }
      if (corners.some((point) => !Number.isFinite(point.x + point.y + point.z))) continue;
      const distance = corners.map((point) => dot(normal, point) - offset);
      // An edge on the plane belongs to the retained side once; coplanar
      // triangles do not contribute their internal triangulation as cuts.
      const onPlane = corners.filter((point, k) => Math.abs(distance[k]) <= 1e-9);
      if (onPlane.length === 2 && distance.some(d => d < -1e-9)) cuts.push({a:onPlane[0],b:onPlane[1]});
      if (distance.every((d) => d <= 1e-9)) { pushTriangle(out, corners); continue; }
      if (distance.every((d) => d >= -1e-9)) continue;
      const inside = [], crossings = [];
      for (let k = 0; k < 3; k++) {
        const a = corners[k], b = corners[(k + 1) % 3], da = distance[k], db = distance[(k + 1) % 3];
        if (da <= 1e-9) inside.push(a);
        if(Math.abs(da)<=1e-9 && !crossings.some(p=>Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z)<1e-9))crossings.push(a);
        if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
          const t = da / (da - db);
          const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
          inside.push(point);
          crossings.push(point);
        }
      }
      if (crossings.length === 2) cuts.push({ a: crossings[0], b: crossings[1] });
      for (let k = 2; k < inside.length; k++) pushTriangle(out, [inside[0], inside[k - 1], inside[k]]);
    }
    if (out.length) kept.push({ positions: out, id: body.id, sectioned: true });
  }
  return { bodies: kept, cuts, plane: { normal, origin } };
}

function pushTriangle(out, corners) {
  for (const point of corners) out.push(point.x, point.y, point.z);
}

/* ---- the projection ----------------------------------------------------- */

/* @param bodies  [{positions:[x,y,z ...]}] — unindexed triangles, model units
 * @param view    a key of VIEW_BASES ("front", "top", "iso", …)
 * @returns {visible, hidden, circles, cuts, bounds} in view (u, v) units,
 *          v pointing UP the page.
 */
function projectSolid(bodies, view = "front", options = {}) {
  const basis = viewBasis(view);
  const store = collectTriangles(bodies);
  const empty = { visible: [], hidden: [], circles: [], cuts: [], bounds: null, basis, view };
  if (!store.count) return empty;
  const weld = Number.isFinite(options.weld) && options.weld > 0 ? options.weld : Math.max(1e-5, store.span * 1e-4);
  const creaseCos = Number.isFinite(options.creaseCos) ? options.creaseCos : Math.cos(Math.PI / 9);
  const wantHidden = options.hidden !== false;
  const grid = buildDepthGrid(store, basis);
  if (!grid) return empty;
  const span2d = Math.max(grid.bounds.u1 - grid.bounds.u0, grid.bounds.v1 - grid.bounds.v0, 1e-6);
  const slack = Number.isFinite(options.slack) ? options.slack : Math.max(store.span * 2e-3, weld * 4);
  const visible = [], hidden = [];
  const normals = new Array(store.count);
  const normalOf = (tri) => (normals[tri] !== undefined ? normals[tri] : (normals[tri] = triangleNormal(store.points, tri)));
  const bodyList = Array.isArray(bodies) ? bodies : [bodies];
  const cylinders = bodyList.map(body=>bodyCylinders(body,weld*2));

  for (const edge of buildEdges(store, weld)) {
    const faces = edge.tris.map(normalOf).filter(Boolean);
    if (!faces.length) continue;
    let candidate = edge.tris.length === 1;                       // an open boundary
    const owner = store.owner[edge.tris[0]];
    const cylinder = edge.tris.length > 1 && edge.tris.every(tri=>store.owner[tri]===owner)
      ? cylindricalSeam(edge,faces,cylinders[owner],weld*2) : null;
    // Native face identity distinguishes smooth tessellation from authored edges.
    // Keep silhouettes below, even where both triangles belong to one face.
    const sameNativeFace = !!store.nativeFace[edge.tris[0]] && edge.tris.every(tri => store.owner[tri]===owner && store.nativeFace[tri]===store.nativeFace[edge.tris[0]]);
    if (!candidate && !cylinder && !sameNativeFace) {
      for (let a = 0; a < faces.length && !candidate; a++) {
        for (let b = a + 1; b < faces.length; b++) {
          if (dot(faces[a], faces[b]) < creaseCos) { candidate = true; break; }   // a real crease
        }
      }
    }
    if (!candidate) {
      /* Silhouette: the faces disagree about which way they face the viewer, so
         the body turns away from the reader here even though the surface is
         smooth. This is the outline of every cylinder and fillet on the sheet. */
      let front = false, back = false, tangent = false;
      for (const normal of faces) {
        const facing = dot(normal, basis.forward);
        if (facing > 1e-6) front = true;
        else if (facing < -1e-6) back = true;
        else tangent = true;
      }
      // A tessellation facet can lie exactly edge-on. Its neighbouring faces
      // need not share an edge with each other, but the facet's boundary still
      // forms the silhouette. Coplanar edge-on diagonals remain excluded.
      candidate = (front && back) || (tangent && (front || back));
    }
    if (!candidate) continue;
    // The fitted radius locates the true support line rather than a chord's
    // nearest vertex, keeping side-view diameters exact on odd facet counts.
    const start = cylinder ? cylinderSilhouette(edge.a,cylinder,basis.forward) : edge.a;
    const end = cylinder ? cylinderSilhouette(edge.b,cylinder,basis.forward) : edge.b;
    const a = {
      u: dot(start, basis.right), v: dot(start, basis.up), w: dot(start, basis.forward),
    };
    const b = {
      u: dot(end, basis.right), v: dot(end, basis.up), w: dot(end, basis.forward),
    };
    const length = Math.hypot(b.u - a.u, b.v - a.v);
    if (length < 1e-9) continue;
    const samples = Math.max(4, Math.min(48, Math.ceil(length / (span2d * 0.02))));
    for (const run of splitEdge(grid, a, b, slack, samples)) {
      if (!run.visible && !wantHidden) continue;
      if (run.t1 - run.t0 < 1e-3) continue;
      (run.visible ? visible : hidden).push({ a: lerpPoint(a, b, run.t0), b: lerpPoint(a, b, run.t1) });
    }
  }
  // Recognize complete rims before line simplification drops their short
  // tessellation chords. Small holes on long parts otherwise lose their ink
  // while retaining centre marks from the independently fitted circles.
  let inkVisible = visible, inkHidden = hidden;
  const circles = options.circles === false ? [] : projectCircles(bodies, basis, grid, slack);
  const round = circles.filter((circle) => circle.kind === "round");
  if (round.length) {
    const visibleRound = round.filter((circle) => circle.visible);
    const hiddenRound = round.filter((circle) => !circle.visible);
    inkVisible = absorbCircleChords(visibleRound, inkVisible, span2d * 2e-3);
    visibleRound.forEach((circle) => { if (circle.absorbed) circle.drawn = "visible"; });
    inkHidden = absorbCircleChords(hiddenRound, inkHidden, span2d * 2e-3);
    hiddenRound.forEach((circle) => { if (circle.absorbed) circle.drawn = "hidden"; });
    // A rear rim can coincide with the already visible front rim. Its hidden
    // chords must yield to the continuous circle, as straight segments do.
    const visibleInk = visibleRound.filter(circle=>circle.drawn === "visible");
    inkHidden = absorbCircleChords(visibleInk, inkHidden, span2d * 2e-3);
    hiddenRound.forEach(circle=>{
      if(visibleInk.some(front=>Math.hypot(front.u-circle.u,front.v-circle.v)<span2d*2e-3 && Math.abs(front.radius-circle.radius)<span2d*2e-3)) delete circle.drawn;
    });
  }
  // Small oblique rims remain tessellated ellipses. Removing each short chord
  // by pen width erases the entire hole, even though their complete loop is large.
  // Consolidation may merge coincident straight ink, but must not relocate
  // curved outline chords onto nearby lines at paper/pen-scale tolerance.
  const merged = consolidateSegments(inkVisible, inkHidden, Math.max(1e-8, store.span * 1e-7), 1e-9);
  const cuts = (options.cuts || []).map((cut) => ({
    a: { u: dot(cut.a, basis.right), v: dot(cut.a, basis.up) },
    b: { u: dot(cut.b, basis.right), v: dot(cut.b, basis.up) },
  }));
  const list = Array.isArray(bodies) ? bodies : [bodies];
  let exactBounds = null;
  if (isOrthoView(view) && list.length && list.every(body=>body.exactBounds?.min && body.exactBounds?.max)) {
    exactBounds={u0:Infinity,u1:-Infinity,v0:Infinity,v1:-Infinity};
    for(const body of list) for(const x of [body.exactBounds.min.x,body.exactBounds.max.x]) for(const y of [body.exactBounds.min.y,body.exactBounds.max.y]) for(const z of [body.exactBounds.min.z,body.exactBounds.max.z]) {
      const point={x,y,z},u=dot(point,basis.right),v=dot(point,basis.up);
      exactBounds.u0=Math.min(exactBounds.u0,u);exactBounds.u1=Math.max(exactBounds.u1,u);
      exactBounds.v0=Math.min(exactBounds.v0,v);exactBounds.v1=Math.max(exactBounds.v1,v);
    }
  }
  const surfaces = options.shaded ? shadedSurfaces(store, basis) : [];
  return { visible: merged.visible, hidden: merged.hidden, circles, cuts, surfaces, bounds: grid.bounds, exactBounds, basis, view };
}

/* Surface ink comes from the same rebuilt triangle soup as HLR, including
   holes and fillets. Orthographic depth ordering keeps the far facets behind
   near ones; back-facing facets never fill a through-hole. No viewport image
   is embedded in a sheet, so exported shaded views remain vector geometry. */
function shadedSurfaces(store, basis) {
  const light = unit({x:basis.forward.x + basis.up.x*.6 - basis.right.x*.4,
    y:basis.forward.y + basis.up.y*.6 - basis.right.y*.4,
    z:basis.forward.z + basis.up.z*.6 - basis.right.z*.4});
  const surfaces=[];
  for(let tri=0;tri<store.count;tri++) {
    const normal=triangleNormal(store.points,tri);
    if(!normal || dot(normal,basis.forward)<=1e-8) continue;
    const points=[];
    for(let vertex=0;vertex<3;vertex++) {
      const i=tri*9+vertex*3,p={x:store.points[i],y:store.points[i+1],z:store.points[i+2]};
      points.push({u:dot(p,basis.right),v:dot(p,basis.up),w:dot(p,basis.forward)});
    }
    const tone=Math.round(255*(.42+.5*Math.max(0,dot(normal,light))));
    const hex=tone.toString(16).padStart(2,"0");
    surfaces.push({points,fill:"#"+hex+hex+hex,depth:points.reduce((sum,p)=>sum+p.w,0)/3});
  }
  return surfaces.sort((a,b)=>a.depth-b.depth);
}


return { projectSolid, cylindricalSeam, bodyCylinders, collectTriangles, absorbCircleChords };
}
const original = originalImplementation();

// Also compare EVERY call made by the existing drawing tests, including calls
// through cad_sheet. Run with HLR_COMPARE_EXISTING=1 and --import this file.
if (process.env.HLR_COMPARE_EXISTING === '1') {
  let comparisons = 0;
  globalThis[Symbol.for('hidden-line-original')] = (...args) => {
    comparisons++;
    return original.projectSolid(...args);
  };
  const target = new URL('../js/core/hidden_line.js', import.meta.url).href;
  registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== target) return result;
    return { ...result, source: String(result.source).replace('export function projectSolid(', 'function optimizedProjectSolid(') + `
import assertProjectionEqual from 'node:assert/strict';
export function projectSolid(...args) {
  const result = optimizedProjectSolid(...args);
  assertProjectionEqual.deepEqual(result, globalThis[Symbol.for('hidden-line-original')](...args));
  return result;
}
` };
  } });
  process.on('exit', () => console.log('HLR existing-fixture comparisons:', comparisons));
} else {
  const current = await import('../js/core/hidden_line.js');
  const views = [...current.ORTHO_VIEWS, 'iso'];
  const ring = (r, n, u = 0, v = 0) => Array.from({ length: n }, (_, i) => ({
    u: u + r * Math.cos(i * 2 * Math.PI / n), v: v + r * Math.sin(i * 2 * Math.PI / n),
  }));
  // One owner body, 300 closed bosses, 56,412 triangles. Separate cylinders
  // must share an owner or the original per-owner scan would not be stressed.
  function bossPlate(columns = 20, rows = 15, facets = 48) {
    const parts = [{ kind: 'box', x0: -2, x1: columns * 4, y0: -2, y1: rows * 4, z0: -1, z1: 0 }];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      parts.push({ kind: 'ext', axis: 'z', from: 0, to: 2 + (x % 3) * .3, pts: ring(1, facets, x * 4, y * 4) });
    }
    return { positions: tessellateParts(parts).flatMap(body => Array.from(body.positions)) };
  }

  async function profile(label, fn) {
    const session = new Session(); session.connect();
    const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval', { interval: 500 });
    await post('Profiler.start');
    const start = performance.now(); fn(); const elapsed = performance.now() - start;
    const { profile: data } = await post('Profiler.stop'); session.disconnect();
    const nodes = new Map(data.nodes.map(node => [node.id, node]));
    const totals = new Map(), parents = new Map();
    for (const node of data.nodes) for (const child of node.children || []) parents.set(child, node.id);
    for (let i = 0; i < data.samples.length; i++) {
      let node = nodes.get(data.samples[i]);
      while (!node.callFrame.functionName && parents.has(node.id)) node = nodes.get(parents.get(node.id));
      const name = node.callFrame.functionName || '(anonymous)';
      totals.set(name, (totals.get(name) || 0) + data.timeDeltas[i] / 1000);
    }
    console.log(label, 'elapsed ms', elapsed.toFixed(1));
    console.table([...totals].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => ({ name, selfMs: +ms.toFixed(1) })));
  }

  test('many-cylinder plate: all orthographic and isometric outputs equal the original', async () => {
    const body = bossPlate();
    const store = original.collectTriangles(body);
    const coldStart = performance.now(), coldExpected = original.projectSolid(body, 'right'), coldMiddle = performance.now();
    const coldActual = current.projectSolid(body, 'right'), coldEnd = performance.now();
    assert.deepEqual(coldActual, coldExpected);
    console.log('HLR cold right ms:', { before: coldMiddle - coldStart, after: coldEnd - coldMiddle });
    assert.equal(original.bodyCylinders(body, store.span * 2e-4).length, 300);
    console.log('HLR synthetic triangles:', store.count);
    // Warm feature extraction and JIT for both implementations before timing.
    original.projectSolid(body, 'right'); current.projectSolid(body, 'right');
    if (process.env.HLR_PROFILE === '1') {
      await profile('original (warm, seven views)', () => { for (const view of views) original.projectSolid(body, view); });
      await profile('optimized (warm, seven views)', () => { for (const view of views) current.projectSolid(body, view); });
    }
    let before = 0, after = 0;
    const timings = [];
    for (const view of views) {
      const start = performance.now(), expected = original.projectSolid(body, view), middle = performance.now();
      const actual = current.projectSolid(body, view), end = performance.now();
      assert.deepEqual(actual, expected, view);
      before += middle - start; after += end - middle;
      timings.push({ view, beforeMs: +(middle - start).toFixed(1), afterMs: +(end - middle).toFixed(1), speedup: +((middle - start) / (end - middle)).toFixed(2) });
    }
    console.table(timings);
    console.log('HLR total ms:', { before, after, speedup: before / after });
    // Deliberately loose: CPU contention/GC may move any single view greatly.
    assert.ok(after < before * .95, `projection regression: ${after} ms vs ${before} ms`);
  });

  test('drawing fixtures, sections, native faces and options remain exactly equal', () => {
    const annulus = tessellateParts([{ kind: 'ext', axis: 'z', from: 0, to: 5.08, pts: ring(1.905, 26), holes: [ring(.79375, 17)] }]);
    const plate = tessellateParts([{ kind: 'ext', axis: 'z', from: 0, to: .1524,
      pts: [{ u: -6, v: -1 }, { u: 6, v: -1 }, { u: 6, v: 1 }, { u: -6, v: 1 }],
      holes: Array.from({ length: 9 }, (_, i) => ring(.24, 17, i - 4)),
    }]);
    const boxes = tessellateParts([{ kind: 'box', x0: -10, x1: 10, y0: 0, y1: 20, z0: -5, z1: 5 },
      { kind: 'box', x0: 5, x1: 15, y0: -5, y1: 10, z0: 2, z1: 15 }]);
    const native = [{ positions: [0,0,0,1,0,0,0,1,0,1,0,0,1,1,1,0,1,0],
      faceRanges: [{ persistentId: 'smooth-wall', triangleStart: 0, triangleCount: 2 }] }];
    const section = current.sectionBodies(annulus, { normal: { x: 1, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 } });
    const tilted = bossPlate(4, 3, 17);
    tilted.positions = tilted.positions.map((value, i, p) => i % 3 === 0 ? value * .8 - p[i + 2] * .6 : i % 3 === 2 ? p[i - 2] * .6 + value * .8 : value);
    const fixtures = [annulus, plate, boxes, native, section.bodies, tilted, [], { positions: [NaN, 0, 0, 0, 1, 0, 1, 0, 0] }];
    for (const bodies of fixtures) for (const view of views) for (const options of [{}, { hidden: false, circles: false },
      { shaded: true, weld: 1e-5, slack: 1e-6, creaseCos: .9, cuts: section.cuts }]) {
      assert.deepEqual(current.projectSolid(bodies, view, options), original.projectSolid(bodies, view, options));
    }
  });

  test('broad phases retain tolerance-boundary matches and original first-match order', async () => {
    // Expose private helpers only in a separate test-loaded module, with no
    // public/internal testing switches in the production projection API.
    const source = readFileSync(new URL('../js/core/hidden_line.js', import.meta.url), 'utf8')
      .replace('"./mesh_projection.js"', JSON.stringify(new URL('../js/core/mesh_projection.js', import.meta.url).href));
    const helpers = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { indexCylinders, cylindricalSeam, absorbCircleChords };').toString('base64'));
    let seed = 12345;
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 2 ** 32;
    const normalize = a => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l }; };
    for (const scale of [1e-6, 1, 1e6]) {
      const tolerance = scale * 1e-4, cylinders = [];
      for (let i = 0; i < 120; i++) {
        const axis = i % 4 === 0 ? { x: 1, y: 0, z: 0 } : i % 4 === 1 ? { x: 0, y: 1, z: 0 } :
          i % 4 === 2 ? { x: 0, y: 0, z: 1 } : normalize({ x: random() - .5, y: random() - .5, z: random() - .5 });
        const cylinder = { axis, origin: { x: (random() - .5) * scale * 20, y: (random() - .5) * scale * 20, z: (random() - .5) * scale * 20 },
          radius: scale * (.1 + random()), from: -scale * random(), to: scale * (1 + random()) };
        cylinders.push(cylinder, { ...cylinder }); // Identical overlap: first must win by identity.
      }
      const index = helpers.indexCylinders(cylinders, tolerance);
      assert.ok(index.buckets);
      let matches = 0;
      for (const cylinder of cylinders) {
        const { axis, origin } = cylinder;
        const radial = axis.z === 1 ? { x: 1, y: 0, z: 0 } : normalize({ x: -axis.y, y: axis.x, z: 0 });
        for (const radialSlack of [-1.001, -.999, 0, .999, 1.001]) for (const endSlack of [-1.001, 0, .999, 1.001]) {
          const point = along => ({ x: origin.x + axis.x * along + radial.x * (cylinder.radius + tolerance * radialSlack),
            y: origin.y + axis.y * along + radial.y * (cylinder.radius + tolerance * radialSlack),
            z: origin.z + axis.z * along + radial.z * (cylinder.radius + tolerance * radialSlack) });
          const edge = { a: point(cylinder.from - tolerance * endSlack), b: point(cylinder.to + tolerance * endSlack) };
          const expected = original.cylindricalSeam(edge, [radial, radial], cylinders, tolerance);
          if (expected) matches++;
          assert.equal(helpers.cylindricalSeam(edge, [radial, radial], index, tolerance), expected);
        }
      }
      assert.ok(matches > 500);
    }
    // Empty and non-finite bounds use the unchanged full scan.
    for (const cylinders of [[], [{ origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, radius: Infinity, from: 0, to: 1 }]]) {
      const edge = { a: { x: 1, y: 0, z: 0 }, b: { x: 1, y: 0, z: 1 } }, faces = [{ x: 1, y: 0, z: 0 }];
      assert.equal(helpers.cylindricalSeam(edge, faces, helpers.indexCylinders(cylinders, .01), .01), original.cylindricalSeam(edge, faces, cylinders, .01));
    }
    for (const radius of [1e-6, 1, 1e6]) for (const offset of [0, 1e9]) for (const delta of [-1.001, -1, -.999, 0, .999, 1, 1.001]) {
      const tolerance = radius * .02, r = radius + delta * tolerance;
      const circles = [{ kind: 'round', radius, u: offset, v: -offset }];
      const segments = Array.from({ length: 64 }, (_, i) => ({
        a: { u: offset + r * Math.cos(i * Math.PI / 32), v: -offset + r * Math.sin(i * Math.PI / 32) },
        b: { u: offset + r * Math.cos((i + 1) * Math.PI / 32), v: -offset + r * Math.sin((i + 1) * Math.PI / 32) },
      }));
      const expectedCircles = structuredClone(circles);
      const expected = original.absorbCircleChords(expectedCircles, segments, tolerance);
      assert.deepEqual(helpers.absorbCircleChords(circles, segments, tolerance), expected);
      assert.deepEqual(circles, expectedCircles);
    }
  });
}

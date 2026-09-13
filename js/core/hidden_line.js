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

import { meshFeatureEdges } from "./mesh_projection.js";

const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const v3 = (x, y, z) => ({ x, y, z });

/* `forward` points from the model TOWARD the viewer, so a bigger w is nearer.
   `up` is the direction that ends up pointing up the page; `right` follows from
   right × up = forward, which is what keeps a right view showing -Z to the
   right the way third-angle projection requires. */
export const VIEW_BASES = Object.freeze({
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

export const ORTHO_VIEWS = Object.freeze(["front", "back", "left", "right", "top", "bottom"]);
export const isOrthoView = (name) => ORTHO_VIEWS.includes(name);

export function viewBasis(name) {
  const base = VIEW_BASES[name] || VIEW_BASES.front;
  const forward = unit(base.forward), up = unit(base.up);
  return { forward, up, right: unit(cross(up, forward)) };
}

/* The world axis a standard view measures across the page, and up it. Callers
   that must line a dimension up with a model axis (the sheet's automatic
   overall sizes) ask here rather than re-deriving the mapping. */
export function viewAxes(name) {
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
  const points = new Float64Array(total * 9), owner = new Int32Array(total);
  let tri = 0, bodyIndex = 0;
  const bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const body of list) {
    const positions = body?.positions;
    if (positions?.length) {
      const count = Math.floor(positions.length / 9);
      for (let i = 0; i < count; i++) {
        let ok = true;
        for (let k = 0; k < 9; k++) {
          const value = Number(positions[i * 9 + k]);
          if (!Number.isFinite(value)) { ok = false; break; }
          points[tri * 9 + k] = value;
        }
        if (!ok) continue;
        owner[tri] = bodyIndex;
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
  return { points, owner, count: tri, bounds: Number.isFinite(bounds.x0) ? bounds : null, span };
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

export function consolidateSegments(visible, hidden, tolerance) {
  const tol = tolerance > 0 ? tolerance : 1e-4;
  const minimum = tol * 2;
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
    let sweep = 0;
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
      sweep += 2 * Math.asin(Math.min(1, length / (2 * radius)));
    });
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
export function sectionBodies(bodies, plane) {
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
export function projectSolid(bodies, view = "front", options = {}) {
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

  for (const edge of buildEdges(store, weld)) {
    const faces = edge.tris.map(normalOf).filter(Boolean);
    if (!faces.length) continue;
    let candidate = edge.tris.length === 1;                       // an open boundary
    if (!candidate) {
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
      let front = false, back = false;
      for (const normal of faces) {
        const facing = dot(normal, basis.forward);
        if (facing > 1e-6) front = true; else if (facing < -1e-6) back = true;
      }
      candidate = front && back;
    }
    if (!candidate) continue;
    const a = {
      u: dot(edge.a, basis.right), v: dot(edge.a, basis.up), w: dot(edge.a, basis.forward),
    };
    const b = {
      u: dot(edge.b, basis.right), v: dot(edge.b, basis.up), w: dot(edge.b, basis.forward),
    };
    const length = Math.hypot(b.u - a.u, b.v - a.v);
    if (length < span2d * 5e-4) continue;                         // shorter than a pen width
    const samples = Math.max(4, Math.min(48, Math.ceil(length / (span2d * 0.02))));
    for (const run of splitEdge(grid, a, b, slack, samples)) {
      if (!run.visible && !wantHidden) continue;
      if (run.t1 - run.t0 < 1e-3) continue;
      (run.visible ? visible : hidden).push({ a: lerpPoint(a, b, run.t0), b: lerpPoint(a, b, run.t1) });
    }
  }
  const merged = consolidateSegments(visible, hidden, span2d * 1.5e-3);
  const circles = options.circles === false ? [] : projectCircles(bodies, basis, grid, slack);
  const round = circles.filter((circle) => circle.kind === "round");
  if (round.length) {
    const visibleRound = round.filter((circle) => circle.visible);
    const hiddenRound = round.filter((circle) => !circle.visible);
    merged.visible = absorbCircleChords(visibleRound, merged.visible, span2d * 2e-3);
    visibleRound.forEach((circle) => { if (circle.absorbed) circle.drawn = "visible"; });
    merged.hidden = absorbCircleChords(hiddenRound, merged.hidden, span2d * 2e-3);
    hiddenRound.forEach((circle) => { if (circle.absorbed) circle.drawn = "hidden"; });
  }
  const cuts = (options.cuts || []).map((cut) => ({
    a: { u: dot(cut.a, basis.right), v: dot(cut.a, basis.up) },
    b: { u: dot(cut.b, basis.right), v: dot(cut.b, basis.up) },
  }));
  return { visible: merged.visible, hidden: merged.hidden, circles, cuts, bounds: grid.bounds, basis, view };
}

/* Which standard view looks along a given direction of sight. A section is
   named by the arrows drawn on its parent, so the cut the user swipes has to
   resolve to a real view rather than an arbitrary camera. */
export function viewForSight(sight) {
  const look = unit(sight);
  let best = "front", score = -Infinity;
  for (const name of ORTHO_VIEWS) {
    const value = -dot(VIEW_BASES[name].forward, look);   // forward points at the viewer
    if (value > score) { score = value; best = name; }
  }
  return best;
}

/* A detail view is its parent, magnified inside a circle. Clipping here keeps
   the callout honest: lines stop at the boundary instead of running out of the
   bubble, which is what makes a detail read as a detail. */
export function cropProjection(projection, circle) {
  if (!projection || !circle) return projection;
  const radius = Number(circle.radius) || 0;
  if (!(radius > 0)) return projection;
  const clip = (segments) => {
    const out = [];
    for (const segment of segments || []) {
      const parts = clipSegmentToCircle(segment.a, segment.b, circle.u, circle.v, radius);
      if (parts) out.push(parts);
    }
    return out;
  };
  return {
    ...projection,
    visible: clip(projection.visible),
    hidden: clip(projection.hidden),
    cuts: clip(projection.cuts),
    circles: (projection.circles || []).filter((entry) =>
      Math.hypot(entry.u - circle.u, entry.v - circle.v) <= radius + entry.radius),
    bounds: { u0: circle.u - radius, u1: circle.u + radius, v0: circle.v - radius, v1: circle.v + radius },
    crop: { u: circle.u, v: circle.v, radius },
  };
}

function clipSegmentToCircle(a, b, cu, cv, radius) {
  const dx = b.u - a.u, dy = b.v - a.v;
  const fx = a.u - cu, fy = a.v - cv;
  const A = dx * dx + dy * dy;
  if (A < 1e-12) return Math.hypot(fx, fy) <= radius ? { a, b } : null;
  const B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - radius * radius;
  const discriminant = B * B - 4 * A * C;
  let t0 = 0, t1 = 1;
  if (discriminant < 0) return C < 0 ? { a, b } : null;
  const root = Math.sqrt(discriminant);
  const s0 = (-B - root) / (2 * A), s1 = (-B + root) / (2 * A);
  t0 = Math.max(0, Math.min(1, Math.max(0, s0)));
  t1 = Math.min(1, Math.max(0, Math.min(1, s1)));
  if (!(t1 > t0)) return null;
  return {
    a: { u: a.u + dx * t0, v: a.v + dy * t0 },
    b: { u: a.u + dx * t1, v: a.v + dy * t1 },
  };
}

/* The extents a projection occupies, cut loops and all, so the sheet can place
   the view before it decides how to draw it. */
export function projectionBounds(projection) {
  if (!projection) return null;
  const bounds = projection.bounds ? { ...projection.bounds } : null;
  const grow = (u, v) => {
    if (!bounds) return;
    if (u < bounds.u0) bounds.u0 = u; if (u > bounds.u1) bounds.u1 = u;
    if (v < bounds.v0) bounds.v0 = v; if (v > bounds.v1) bounds.v1 = v;
  };
  for (const circle of projection.circles || []) {
    if (circle.kind !== "round") continue;
    grow(circle.u - circle.radius, circle.v - circle.radius);
    grow(circle.u + circle.radius, circle.v + circle.radius);
  }
  return bounds;
}

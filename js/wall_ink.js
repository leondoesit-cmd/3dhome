/* Which lines of a wall's cut outline are inked (WALL_JUNCTIONS_PLAN.md 3.3).

   The cut area of one material reads as one area: where two walls of the same
   INK CLASS (kind + phase + core material) meet at a node, the part of one
   wall's outline that lies inside or on the other's is not drawn — the wrap
   diagonal, the line across a wall stored as two, the line across a T mouth.

   - Both walls single-layer: drop what lies inside or on the neighbour.
   - Multi-layer: only with an identical assembly, and only where an END edge
     coincides with the neighbour's end edge (a wrap corner, a split wall). A
     multi-layer T keeps its line: the through wall's finish crosses the mouth.
   - Different ink class: nothing is dropped; the line left is the owner's face.
   - Demolition walls, room dividers, railings and curved walls never merge.

   Layer lines: only the band boundaries that run ALONG the wall; a band's end
   edges are never drawn (the outline covers an inked end).

   Method, with no polygon boolean: split each outline edge where it crosses
   the neighbour's edges, keep a piece when its midpoint is neither inside the
   neighbour nor within a small tolerance of its boundary. Pure: no DOM, no
   three. */
import { S } from "./state.js";
import { pointInPoly, wallBandOutline, wallNodeGeom, wallOutline, wallSolidAtNode } from "./geometry.js";
import { sameAssembly, wallAssemblyLayers, wallCoreClass } from "./wall_junctions.js";
import { wallLayerBands, wallPhase } from "./wall_types.js";
import { normalizeWallKind } from "./wall_curves.js";

const ON_TOL = 0.05; // cm: a piece this close to a neighbour's boundary is on it
const MIN_PIECE = 1e-4;

/* The ink class, or null for a wall that never merges. */
export function wallInkClass(w) {
  if (!w) return null;
  var kind = normalizeWallKind(w), phase = wallPhase(w);
  if (kind === "roomDivider" || kind === "railing" || phase === "demolition") return null;
  if (wallNodeGeom(w).kind === "arc") return null;
  return kind + "|" + phase + "|" + wallCoreClass(w);
}

/* The walls standing at a node of `w` it may merge with, and how:
   [{ wall, node, mode: "area" | "ends" }]. */
function mergeNeighbours(w, armsAt) {
  var cls = wallInkClass(w), out = [];
  if (!cls) return out;
  var single = wallAssemblyLayers(w).length <= 1;
  [w.a, w.b].forEach(function (node, i) {
    if (i === 1 && w.b === w.a) return;
    if (!wallSolidAtNode(w, node)) return;
    (armsAt(node) || []).forEach(function (ow) {
      if (ow === w || wallInkClass(ow) !== cls || !wallSolidAtNode(ow, node)) return;
      var otherSingle = wallAssemblyLayers(ow).length <= 1;
      if (single && otherSingle) out.push({ wall: ow, node: node, mode: "area" });
      else if (!single && !otherSingle && sameAssembly(w, ow, node)) out.push({ wall: ow, node: node, mode: "ends" });
    });
  });
  return out;
}

/* Outline edges as [p, q] pairs. */
function edgesOf(poly) {
  var out = [];
  for (var i = 0; i < poly.length; i++) out.push([poly[i], poly[(i + 1) % poly.length]]);
  return out;
}
/* An edge runs ALONG the wall when it is parallel to the wall's direction. */
function alongWall(e, g) {
  var dx = e[1].x - e[0].x, dz = e[1].z - e[0].z, L = Math.hypot(dx, dz);
  if (L < MIN_PIECE) return false;
  return Math.abs(dx * g.uz - dz * g.ux) / L < 1e-4;
}
function distToSeg(p, a, b) {
  var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz,
    t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
}
function onEdges(p, edges) {
  for (var i = 0; i < edges.length; i++) if (distToSeg(p, edges[i][0], edges[i][1]) < ON_TOL) return true;
  return false;
}
/* Parameters along e = [p, q] where the neighbour's edges cross it or touch it. */
function cutParams(e, others) {
  var p = e[0], dx = e[1].x - p.x, dz = e[1].z - p.z, L2 = dx * dx + dz * dz, ts = [0, 1];
  if (L2 < MIN_PIECE * MIN_PIECE) return ts;
  others.forEach(function (o) {
    [o[0], o[1]].forEach(function (v) {
      var t = ((v.x - p.x) * dx + (v.z - p.z) * dz) / L2;
      if (t > 0 && t < 1 && distToSeg(v, e[0], e[1]) < ON_TOL) ts.push(t);
    });
    var ex = o[1].x - o[0].x, ez = o[1].z - o[0].z, den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) return;
    var t = ((o[0].x - p.x) * ez - (o[0].z - p.z) * ex) / den,
      u = ((o[0].x - p.x) * dz - (o[0].z - p.z) * dx) / den;
    if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
  });
  ts.sort(function (a, b) { return a - b; });
  return ts.filter(function (t, i) { return !i || t - ts[i - 1] > 1e-9; });
}

/* The inked segments of `w`'s cut outline, and its along-wall layer lines:
   { outline, segments: [[p, q]], layers: [[p, q]], arc }. `armsAt(node)` lists
   the walls at a node (defaults to a scan of S.walls); `bands` are the wall's
   layer bands ({ start, end }) when the caller has them. */
export function wallInk(w, armsAt, bands) {
  armsAt = armsAt || function (node) {
    return S.walls.filter(function (ow) { return ow.a === node || ow.b === node; });
  };
  var outline = wallOutline(w);
  if (!outline || outline.length < 3) return { outline: outline, segments: [], paths: [], layers: [], arc: false };
  var g = wallNodeGeom(w), arc = g.kind === "arc", mine = edgesOf(outline);
  if (arc) return { outline: outline, segments: mine, paths: [{ pts: outline.slice(), closed: true }], layers: [], arc: true };
  var nbs = mergeNeighbours(w, armsAt).map(function (n) {
    var poly = wallOutline(n.wall) || [], edges = edgesOf(poly), ng = wallNodeGeom(n.wall);
    return { mode: n.mode, poly: poly, edges: edges,
      ends: edges.filter(function (e) { return !alongWall(e, ng); }) };
  }).filter(function (n) { return n.poly.length > 2; });
  var segments = [];
  mine.forEach(function (e) {
    var isEnd = !alongWall(e, g),
      relevant = nbs.filter(function (n) { return n.mode === "area" || isEnd; });
    if (!relevant.length) { segments.push(e); return; }
    var ts = cutParams(e, [].concat.apply([], relevant.map(function (n) { return n.edges; }))),
      dx = e[1].x - e[0].x, dz = e[1].z - e[0].z, run = null;
    for (var i = 0; i + 1 < ts.length; i++) {
      var t0 = ts[i], t1 = ts[i + 1];
      if ((t1 - t0) * Math.hypot(dx, dz) < MIN_PIECE) continue;
      var m = { x: e[0].x + dx * (t0 + t1) / 2, z: e[0].z + dz * (t0 + t1) / 2 },
        hidden = relevant.some(function (n) {
          return n.mode === "area"
            ? pointInPoly(m.x, m.z, n.poly) || onEdges(m, n.edges)
            : onEdges(m, n.ends);
        });
      if (hidden) { run = null; continue; }
      var a = { x: e[0].x + dx * t0, z: e[0].z + dz * t0 }, b = { x: e[0].x + dx * t1, z: e[0].z + dz * t1 };
      if (run) run[1] = b; // pieces of one edge kept back to back are one line
      else segments.push(run = [a, b]);
    }
  });
  return { outline: outline, segments: segments, paths: chainSegments(segments), layers: layerLines(w, bands), arc: false };
}

/* The kept segments joined end to end into polylines ({ pts, closed }), so a
   stroke turns each corner with a proper join instead of two loose ends. */
export function chainSegments(segs) {
  var left = segs.slice(), out = [];
  function same(p, q) { return Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6; }
  while (left.length) {
    var first = left.shift(), pts = [first[0], first[1]], grown = true;
    while (grown) {
      grown = false;
      for (var i = 0; i < left.length; i++) {
        var s = left[i], head = pts[0], tail = pts[pts.length - 1];
        if (same(s[0], tail)) pts.push(s[1]);
        else if (same(s[1], tail)) pts.push(s[0]);
        else if (same(s[1], head)) pts.unshift(s[0]);
        else if (same(s[0], head)) pts.unshift(s[1]);
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    var closed = pts.length > 3 && same(pts[0], pts[pts.length - 1]);
    if (closed) pts.pop();
    out.push({ pts: pts, closed: closed });
  }
  return out;
}

/* The boundaries between a wall's layer bands, each a segment along the wall
   between the same end cuts the band fills use. */
function layerLines(w, bands) {
  if (!bands) {
    try {
      bands = wallLayerBands(JSON.parse(JSON.stringify(w)), { wallTypes: JSON.parse(JSON.stringify(S.wallTypes || [])), walls: [] });
    } catch (e) { bands = []; }
  }
  var out = [];
  for (var i = 1; i < bands.length; i++) {
    var q = wallBandOutline(w, bands[i].start, bands[i].start);
    if (q) out.push([q.a0, q.b0]);
  }
  return out;
}

/* ---- memoised for a repaint ------------------------------------------------
   Every wall is inked on every repaint, so the result is kept per wall under a
   key that changes with anything it reads: the wall and every wall within two
   nodes of it (their ends, nodes, thickness, assembly, phase, kind, height,
   join, location line, curve) and the openings on them. */
var inkCache = new WeakMap();
const KEY_FIELDS = ["id", "a", "b", "thickness", "height", "kind", "phase", "renovationPhase", "wallTypeId",
  "layersReversed", "reverseLayers", "loc", "dimSide", "datum", "halfHeight", "capHeight", "curbHeight", "baseHeight"];
function wallKey(w) {
  var o = {};
  KEY_FIELDS.forEach(function (k) { if (w[k] !== undefined) o[k] = w[k]; });
  o.layers = wallAssemblyLayers(w).map(function (l) { return [l.material, l.thickness, !!l.main, !!l.structural]; });
  o.join = w.join || null;
  o.geometry = w.geometry || w.curve || w.bulge || null;
  o.na = S.nodes[w.a] ? [S.nodes[w.a].x, S.nodes[w.a].z] : null;
  o.nb = S.nodes[w.b] ? [S.nodes[w.b].x, S.nodes[w.b].z] : null;
  return JSON.stringify(o);
}
/* Ink for each of `walls`, as a Map wall -> wallInk(...). Options: `pool`,
   the walls that count as neighbours (default every wall; the plan passes the
   ones on screen), and `bandsOf(w)`, a wall's layer bands when the caller has
   them (that result is not memoised). */
export function wallInkAll(walls, opts) {
  var get = wallInkPass(opts), keys = new Map(), out = new Map();
  (walls || []).forEach(function (w) {
    if (w && S.nodes[w.a] && S.nodes[w.b]) out.set(w, get(w, keys));
  });
  return out;
}

/* A pass shares node adjacency and opening groups. The model draws from a
   stable wall list and can also share keys. The HUD normalizes a wall just
   before drawing it, so reads the current keys when that wall needs ink. */
export function wallInkPass(opts) {
  var bandsOf = opts && opts.bandsOf, at = new Map();
  ((opts && opts.pool) || S.walls || []).forEach(function (w) {
    [w.a, w.b].forEach(function (n, i) {
      if (i === 1 && w.b === w.a) return;
      if (!at.has(n)) at.set(n, []);
      at.get(n).push(w);
    });
  });
  var openingsOf = new Map();
  (S.openings || []).forEach(function (o) {
    if (!o) return;
    var k = String(o.wall);
    if (!openingsOf.has(k)) openingsOf.set(k, []);
    openingsOf.get(k).push([o.s, o.width, o.height, o.sill]);
  });
  function keyFor(w, keys) {
    if (keys && keys.has(w)) return keys.get(w);
    var key = wallKey(w) + JSON.stringify(openingsOf.get(String(w.id)) || null);
    if (keys) keys.set(w, key);
    return key;
  }
  function armsAt(n) { return at.get(n) || []; }
  return function (w, keys) {
    var near = new Set([w]);
    [w.a, w.b].forEach(function (n) {
      armsAt(n).forEach(function (ow) {
        near.add(ow);
        armsAt(ow.a).concat(armsAt(ow.b)).forEach(function (x) { near.add(x); });
      });
    });
    var key = Array.from(near, function (ow) { return keyFor(ow, keys); }).sort().join("\n"),
      hit = inkCache.get(w);
    if (!bandsOf && hit && hit.key === key) return hit.ink;
    var ink = wallInk(w, armsAt, bandsOf ? bandsOf(w) : undefined);
    if (!bandsOf) inkCache.set(w, { key: key, ink: ink });
    return ink;
  };
}

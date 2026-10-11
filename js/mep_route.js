// Wall-network router for MEP runs.
//
// Infrastructure never flies across a room in a straight line. Cables sit in
// chases cut into the walls, supply pipes run in the screed alongside them,
// ducts hang in the ceiling void over a corridor. A run therefore has to be
// routed *on the wall graph*, leaving it only for a short perpendicular spur
// where it has to reach something standing away from a wall (a ceiling light,
// a diffuser, a floor drain, the condenser outside the envelope).
//
// This module turns S.walls into a weighted graph — wall corners and every
// tapped device position are vertices, wall sub-spans are edges — and answers
// shortest-path queries on it. Cost is length in cm, so the path a tradesman
// would actually pull is the one that comes out; two knobs bend it:
//   SPUR_W  a metre off the wall costs more than a metre along it, so a run
//           hugs walls rather than cutting a corner off diagonally.
// Door openings are hard breaks in the wall graph. A wall chase may go around
// the opening on another wall, but it may never "win" by paying a small cost
// and passing through the door leaf/reveal.
//
// Usage is two-phase: tap() every endpoint you will need, build(), then path().
// Taps have to be known up front so several devices on one wall chain along it
// instead of each detouring via the wall's corners.

import { S } from "./state.js";
import { wallGeom } from "./geometry.js";

var SPUR_W = 1.7; // cost multiplier for a segment that leaves the wall
var TAP_EPS = 2; // taps within this distance on one wall are the same tap
var COLL_EPS = 0.35; // collinearity tolerance when simplifying a path

export function makeRouter(avoidOpenings) {
  return new Router(avoidOpenings);
}

function Router(avoidOpenings) {
  this.avoid = !!avoidOpenings; // wall-layer runs must dodge doorways
  this.V = []; // vertices [{x,z}]
  this.E = []; // adjacency [[{j,w}]]
  this.byKey = {};
  this.walls = {};
  this.wallIds = [];
  this.built = false;
  var self = this;
  S.walls.forEach(function (w) {
    var g = wallGeom(w);
    if (!(g.L > 1)) return;
    self.walls[w.id] = {
      w: w,
      g: g,
      ia: self._v(g.a.x, g.a.z, "n" + w.a), // shared corners merge by node id
      ib: self._v(g.b.x, g.b.z, "n" + w.b),
      taps: [],
      opens: (S.openings || [])
        .filter(function (o) {
          return o && String(o.wall) === String(w.id) && o.type !== "window" && isFinite(o.width) && o.width > 0 && isFinite(o.s);
        })
        .map(function (o) { return { a: o.s - o.width / 2, b: o.s + o.width / 2 }; }),
    };
    self.wallIds.push(w.id);
  });
}

Router.prototype._v = function (x, z, key) {
  if (key != null && this.byKey[key] != null) return this.byKey[key];
  var i = this.V.length;
  this.V.push({ x: x, z: z });
  this.E.push([]);
  if (key != null) this.byKey[key] = i;
  return i;
};
Router.prototype._link = function (i, j, w) {
  if (i === j || !isFinite(w)) return;
  this.E[i].push({ j: j, w: w });
  this.E[j].push({ j: i, w: w });
};

// A tap on a known wall at parametric distance `s`, reusing a coincident one.
Router.prototype._wallTap = function (W, s) {
  s = Math.max(0, Math.min(W.g.L, s));
  for (var i = 0; i < W.taps.length; i++)
    if (Math.abs(W.taps[i].s - s) < TAP_EPS) return W.taps[i].vi;
  var vi = this._v(W.g.a.x + W.g.ux * s, W.g.a.z + W.g.uz * s, null);
  W.taps.push({ s: s, vi: vi });
  return vi;
};

// Nearest point on a wall to p, as {W, s, d}.
Router.prototype._nearestWall = function (p) {
  var best = null;
  for (var i = 0; i < this.wallIds.length; i++) {
    var W = this.walls[this.wallIds[i]];
    var t = (p.x - W.g.a.x) * W.g.ux + (p.z - W.g.a.z) * W.g.uz;
    t = Math.max(0, Math.min(W.g.L, t));
    var qx = W.g.a.x + W.g.ux * t, qz = W.g.a.z + W.g.uz * t;
    var d = Math.hypot(p.x - qx, p.z - qz);
    if (!best || d < best.d) best = { W: W, s: t, d: d };
  }
  return best;
};

// Register an endpoint and get back a vertex handle. `wall`/`s` come straight
// off a wall-mounted device; anything else is projected onto the nearest wall
// and joined to it by a single perpendicular spur — the drop a fitter makes.
Router.prototype.tap = function (p, wall, s) {
  if (wall != null && this.walls[wall]) {
    var W = this.walls[wall];
    return this._wallTap(W, s != null ? s : (p.x - W.g.a.x) * W.g.ux + (p.z - W.g.a.z) * W.g.uz);
  }
  var near = this._nearestWall(p);
  if (!near) return this._v(p.x, p.z, null); // no walls at all
  if (near.d < 3) return this._wallTap(near.W, near.s); // already on the wall
  var vi = this._v(p.x, p.z, null);
  this._link(vi, this._wallTap(near.W, near.s), near.d * SPUR_W + 1);
  return vi;
};

// Chain each wall's taps between its corners. An edge intersecting a door is
// omitted completely: a wall-plane service cannot occupy the doorway.
Router.prototype.build = function () {
  if (this.built) return this;
  var self = this;
  this.wallIds.forEach(function (id) {
    var W = self.walls[id];
    var seq = W.taps.slice().sort(function (a, b) { return a.s - b.s; });
    var prevV = W.ia, prevS = 0;
    seq.forEach(function (t) {
      self._link(prevV, t.vi, self._cost(W, prevS, t.s));
      prevV = t.vi;
      prevS = t.s;
    });
    self._link(prevV, W.ib, self._cost(W, prevS, W.g.L));
  });
  this.built = true;
  return this;
};
Router.prototype._cost = function (W, s0, s1) {
  var len = Math.abs(s1 - s0), c = len;
  if (this.avoid) {
    var lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    for (var i = 0; i < W.opens.length; i++)
      if (W.opens[i].b > lo + 1 && W.opens[i].a < hi - 1) return Infinity;
  }
  return c + 0.5; // a hop is never free, so equal-length paths pick fewer nodes
};

// Dijkstra from a set of sources; returns the prev[] tree.
Router.prototype._dij = function (srcs) {
  var n = this.V.length, dist = new Float64Array(n).fill(Infinity);
  var prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  srcs.forEach(function (s) { dist[s] = 0; });
  for (var it = 0; it < n; it++) {
    var u = -1, bd = Infinity;
    for (var i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    var e = this.E[u];
    for (var k = 0; k < e.length; k++) {
      var nd = bd + e[k].w;
      if (nd < dist[e[k].j]) { dist[e[k].j] = nd; prev[e[k].j] = u; }
    }
  }
  return { dist: dist, prev: prev };
};

Router.prototype._walk = function (prev, to) {
  var vis = [], g = 0;
  while (to >= 0 && g++ < 5000) { vis.push(to); to = prev[to]; }
  return vis.reverse();
};

// Shortest wall-following path between two handles, as a simplified polyline.
// A disconnected graph returns a blocked result. Falling back to a straight
// segment would silently send the service through the very doorway we removed.
Router.prototype.path = function (a, b) {
  if (a === b) return { pts: [pt(this.V[a])], vis: [a] };
  this.build();
  var r = this._dij([a]);
  if (!isFinite(r.dist[b])) {
    // A wall chase must fail closed at a doorway. Ceiling/floor routing has no
    // opening conflict, so a disconnected wall graph may safely use a direct
    // service run between the two drops.
    return this.avoid
      ? { pts: [], vis: [], blocked: true }
      : { pts: [pt(this.V[a]), pt(this.V[b])], vis: [a, b] };
  }
  var vis = this._walk(r.prev, b);
  return { pts: simplify(vis.map(function (i) { return pt(this.V[i]); }, this)), vis: vis };
};

// Shortest path from `a` back to whichever of `srcs` is cheapest — the greedy
// step that grows a branching duct/waste tree instead of N radial legs.
Router.prototype.pathToSet = function (a, srcs) {
  this.build();
  if (!srcs || !srcs.length) return null;
  var r = this._dij(srcs);
  if (!isFinite(r.dist[a])) {
    // Same rule as path(): a wall chase fails closed, a ceiling or floor
    // route may bridge a disconnected graph with a direct drop.
    if (this.avoid) return null;
    var best = srcs[0], bd = Infinity, va = this.V[a];
    for (var i = 0; i < srcs.length; i++) {
      var s = this.V[srcs[i]];
      var d = Math.hypot(s.x - va.x, s.z - va.z);
      if (d < bd) { bd = d; best = srcs[i]; }
    }
    return { pts: [pt(this.V[best]), pt(va)], vis: [best, a] };
  }
  var vis = this._walk(r.prev, a); // source → a
  return { pts: simplify(vis.map(function (i) { return pt(this.V[i]); }, this)), vis: vis };
};

Router.prototype.vertex = function (i) { return pt(this.V[i]); };

function pt(v) { return { x: v.x, z: v.z }; }

// Drop duplicate and collinear vertices — a chase that runs straight through a
// wall corner shouldn't leave a kink in the polyline.
export function simplify(pts) {
  var out = [];
  pts.forEach(function (p) {
    var l = out[out.length - 1];
    if (l && Math.hypot(p.x - l.x, p.z - l.z) < 0.5) return;
    out.push({ x: p.x, z: p.z });
  });
  for (var i = 1; i < out.length - 1; ) {
    var a = out[i - 1], b = out[i], c = out[i + 1];
    var base = Math.hypot(c.x - a.x, c.z - a.z);
    // a→b→a is a spur run out to a device and back, not a redundant vertex:
    // dropping b would disconnect the device the run exists to feed
    if (base < 1) { i++; continue; }
    var cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) / base < COLL_EPS) out.splice(i, 1);
    else i++;
  }
  return out;
}

// Join path b onto path a, dropping the duplicated junction point.
export function concatPath(a, b) {
  if (!a.length) return b.slice();
  var out = a.slice(), first = b[0], last = out[out.length - 1];
  var skip = first && Math.hypot(first.x - last.x, first.z - last.z) < 0.5 ? 1 : 0;
  for (var i = skip; i < b.length; i++) out.push(b[i]);
  return simplify(out);
}

// Total length of a polyline (cm).
export function pathLength(pts) {
  var L = 0;
  for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return L;
}

// Split the tail of `len` cm off the end of a path — used to finish a duct run
// with a short length of flexible duct into the diffuser, the way it's built.
export function splitTail(pts, len) {
  var total = pathLength(pts);
  if (total <= len + 20 || pts.length < 2) return { head: pts, tail: null };
  var acc = 0, i;
  var cuts = [];
  for (i = pts.length - 1; i > 0; i--) {
    var seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (acc + seg >= len) {
      var t = (len - acc) / seg;
      cuts.push({ x: pts[i].x + (pts[i - 1].x - pts[i].x) * t, z: pts[i].z + (pts[i - 1].z - pts[i].z) * t });
      break;
    }
    acc += seg;
  }
  if (!cuts.length) return { head: pts, tail: null };
  var cut = cuts[0];
  var head = pts.slice(0, i).concat([cut]);
  var tail = [cut].concat(pts.slice(i));
  return { head: simplify(head), tail: simplify(tail) };
}

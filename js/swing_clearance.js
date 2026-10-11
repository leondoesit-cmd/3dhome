/* Door, appliance, and drawer swing / pull-out clearance.

   Room doors already draw a quarter-circle in plan2d; this module is the
   geometry those arcs were missing: a world-space sector (or pull rectangle)
   plus intersection against furniture footprints. Warnings never block an
   edit — they exist so a fridge does not discover the island after install.

   THE FRAME. js/plan_view.js maps world→screen with no Y flip (screen y = +z),
   and js/plan2d.js drawOpening rotates the canvas by atan2(t.z, t.x). So local
   canvas +Y lands on world (−t.z, t.x), and drawOpening's `sy = -1` for IN
   means an inward leaf sweeps toward world (t.z, −t.x). Every sector here is
   built from that identity — get it backwards and the warning fires on the
   opposite side of the wall from the arc the user is looking at.

   Sweeps carry a vertical band as well as a footprint. A door leaf occupies
   [undercut, head height]; a piece occupies [elev, elev + h] (js/stack.js owns
   `elev`). Without that test a wall-hung TV inside the arc reads as a blocked
   door, and a wall cabinet the leaf really does hit reads as clear. */

import { S, fin } from "./state.js";
import { wallById, wallGeom, wallPointAt, wallTangentAt, pointInPoly } from "./geometry.js";

const APPLIANCE = { fridge: 1, wineFridge: 1, dishwasher: 1, oven: 1, washer: 1 };
/* A leaf clears the floor by a threshold gap, so a rug passes under it and a
   25 cm step stool does not. The old 28 cm cut-off silently exempted real
   obstructions. */
const LEAF_UNDERCUT = 4;
const BAND_EPS = 1;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function itemCorners(it) {
  var A = ((it.rot || 0) * Math.PI) / 180,
    c = Math.cos(A),
    s = Math.sin(A),
    hw = it.w / 2,
    hd = it.d / 2;
  return [
    [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd],
  ].map(function (p) {
    return { x: it.x + p[0] * c - p[1] * s, z: it.z + p[0] * s + p[1] * c };
  });
}

export function itemBand(it) {
  var lo = fin(it && it.elev) ? it.elev : 0;
  return { lo: lo, hi: lo + (Number(it && it.h) || 0) };
}

function bandsClear(a, b) {
  if (!a || !b) return false;
  return Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) <= BAND_EPS;
}

function bbox(poly) {
  var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, i, p;
  for (i = 0; i < poly.length; i++) {
    p = poly[i];
    if (p.x < minx) minx = p.x;
    if (p.x > maxx) maxx = p.x;
    if (p.z < minz) minz = p.z;
    if (p.z > maxz) maxz = p.z;
  }
  return { minx: minx, maxx: maxx, minz: minz, maxz: maxz };
}

function boxesMiss(a, b) {
  return a.maxx < b.minx || b.maxx < a.minx || a.maxz < b.minz || b.maxz < a.minz;
}

function segHit(a, b, c, d) {
  function cross(p, q, r) {
    return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  }
  var d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function polyEdges(poly) {
  var out = [];
  for (var i = 0; i < poly.length; i++) out.push([poly[i], poly[(i + 1) % poly.length]]);
  return out;
}

export function polysIntersect(a, b) {
  if (!a || !b || a.length < 3 || b.length < 3) return false;
  if (boxesMiss(bbox(a), bbox(b))) return false;
  var i, j, e1 = polyEdges(a), e2 = polyEdges(b);
  for (i = 0; i < e1.length; i++)
    for (j = 0; j < e2.length; j++)
      if (segHit(e1[i][0], e1[i][1], e2[j][0], e2[j][1])) return true;
  if (pointInPoly(a[0].x, a[0].z, b) || pointInPoly(b[0].x, b[0].z, a)) return true;
  for (i = 1; i < a.length; i++) if (pointInPoly(a[i].x, a[i].z, b)) return true;
  for (i = 1; i < b.length; i++) if (pointInPoly(b[i].x, b[i].z, a)) return true;
  return false;
}

/* `band` is the sweep's vertical extent {lo, hi}; omit it to test the
   footprint alone. */
export function polyHitsItem(poly, it, band) {
  if (!it || !(it.w > 0) || !(it.d > 0)) return false;
  if (band && bandsClear(band, itemBand(it))) return false;
  return polysIntersect(poly, itemCorners(it));
}

/* Sampled quarter-circle sector in world cm: hinge, then arc, then back. */
export function sectorPoly(hinge, fromDir, toDir, radius, steps) {
  var n = Math.max(6, steps || 12);
  var a0 = Math.atan2(fromDir.z, fromDir.x);
  var a1 = Math.atan2(toDir.z, toDir.x);
  var delta = a1 - a0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  var pts = [hinge];
  for (var i = 0; i <= n; i++) {
    var a = a0 + (delta * i) / n;
    pts.push({ x: hinge.x + Math.cos(a) * radius, z: hinge.z + Math.sin(a) * radius });
  }
  return pts;
}

function doorSwingSectors(o, walls, nodes) {
  if (!o || o.type !== "door" || o.isSliding || o.isPocket) return null;
  var wall = wallById(o.wall);
  if (!wall && walls) wall = walls.find(function (w) { return String(w.id) === String(o.wall); });
  if (!wall) return null;
  var gm = wallGeom(wall);
  if (!gm || !(gm.L > 0)) return null;
  var s = clamp(o.s, o.width / 2, gm.L - o.width / 2);
  var centre = wallPointAt(wall, s);
  var tangent = wallTangentAt(wall, s);
  if (!centre || !tangent) return null;
  var hw = o.width / 2;
  if (o.isDouble) {
    var inward = String(o.swingDir || "R_IN").slice(-2) === "IN",
      side = inward ? -1 : 1,
      leftWidth = Math.max(1, Math.min(o.width - 1, Number(o.leafA) || hw)),
      rightWidth = o.width - leftWidth,
      leftHinge = { x: centre.x - tangent.x * hw, z: centre.z - tangent.z * hw },
      rightHinge = { x: centre.x + tangent.x * hw, z: centre.z + tangent.z * hw },
      normal = side < 0 ? { x: tangent.z, z: -tangent.x } : { x: -tangent.z, z: tangent.x };
    return [
      sectorPoly(leftHinge, tangent, normal, leftWidth, 8),
      sectorPoly(rightHinge, { x: -tangent.x, z: -tangent.z }, normal, rightWidth, 8),
    ];
  }
  var swingDir = o.swingDir || "R_IN";
  var isLeftHinge = swingDir.charAt(0) === "L";
  var isInward = swingDir.slice(-2) === "IN";
  var hx = isLeftHinge ? -hw : hw;
  var leafDir = isLeftHinge ? 1 : -1;
  var hinge = { x: centre.x + tangent.x * hx, z: centre.z + tangent.z * hx };
  var closed = { x: tangent.x * leafDir, z: tangent.z * leafDir };
  // See THE FRAME above: plan2d's IN (sy = -1) is world (t.z, −t.x).
  var open = isInward
    ? { x: tangent.z, z: -tangent.x }
    : { x: -tangent.z, z: tangent.x };
  return [sectorPoly(hinge, closed, open, o.width, 12)];
}

/* One polygon per leaf. A double door is two sectors; stitching them into a
   single ring adds a chord across the opening that collides with furniture
   the leaves never reach. */
export function doorSwingPolys(o, walls, nodes) {
  var polys = doorSwingSectors(o, walls, nodes);
  return polys || [];
}

export function doorSwingPoly(o, walls, nodes) {
  var polys = doorSwingSectors(o, walls, nodes);
  if (!polys || !polys.length) return null;
  return polys.length === 1 ? polys[0] : polys.flat();
}

export function doorSwingBand(o) {
  var head = Number(o && o.height) || 205;
  var sill = Number(o && o.sill) || 0;
  return { lo: sill + LEAF_UNDERCUT, hi: sill + head };
}

function applianceSwingPoly(it) {
  if (!it || !APPLIANCE[it.type]) return null;
  var cs = itemCorners(it);
  // itemCorners: 0 back-left, 1 back-right, 2 front-right, 3 front-left
  var hinge = cs[2];
  var closed = { x: cs[3].x - cs[2].x, z: cs[3].z - cs[2].z };
  var cl = Math.hypot(closed.x, closed.z) || 1;
  closed.x /= cl; closed.z /= cl;
  var front = { x: cs[2].x - cs[1].x, z: cs[2].z - cs[1].z };
  var fl = Math.hypot(front.x, front.z) || 1;
  front.x /= fl; front.z /= fl;
  return sectorPoly(hinge, closed, front, it.w, 10);
}

/* doorSweeps gives pivot + tip, where the tip is the leaf FULLY OPEN
   (perpendicular to the face). The closed leaf runs from the pivot to the
   column's other edge — which edge depends on the hinge side, and reading it
   off the layout is what keeps a left-hung leaf from being mirrored. */
function cabinetSwingPolys(it) {
  if (!it || !it.cab) return [];
  try {
    var cab = cabinetApi();
    if (!cab) return [];
    var L = cab.layoutCab(it);
    var A = ((it.rot || 0) * Math.PI) / 180, ca = Math.cos(A), sa = Math.sin(A);
    var base = fin(it.elev) ? it.elev : 0;
    return cab.doorSweeps(it, L).map(function (sw) {
      var col = (L.cols || [])[sw.col];
      var open = { x: sw.tip.x - sw.pivot.x, z: sw.tip.z - sw.pivot.z };
      var ol = Math.hypot(open.x, open.z) || 1;
      open.x /= ol; open.z /= ol;
      // local +X and −X in world; pick the one pointing back across the column
      var plusX = { x: ca, z: sa };
      var localX = (sw.pivot.x - it.x) * ca + (sw.pivot.z - it.z) * sa;
      var hingeLeft = col ? Math.abs(localX - col.x0) <= Math.abs(localX - col.x1) : true;
      var closed = hingeLeft ? plusX : { x: -plusX.x, z: -plusX.z };
      var reach = sw.reach || ol;
      return {
        poly: sectorPoly(sw.pivot, closed, open, reach, 10),
        lo: base + (fin(L.yb) ? L.yb : 0),
        hi: base + (fin(L.yt) ? L.yt : (Number(it.h) || 0)),
      };
    });
  } catch (e) {
    return [];
  }
}

/* One rectangle per column that actually holds drawers, spanning that
   column's width and that column's drawer band — not the whole carcass. */
function drawerPullPolys(it) {
  if (!it || !it.cab) return [];
  try {
    var cab = cabinetApi();
    if (!cab) return [];
    var L = cab.layoutCab(it);
    var base = fin(it.elev) ? it.elev : 0;
    var pull = Math.min(55, Math.max(28, (L.zc - L.zb) * 0.85));
    var A = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(A), s = Math.sin(A);
    function pt(lx, lz) {
      return { x: it.x + lx * c - lz * s, z: it.z + lx * s + lz * c };
    }
    var out = [];
    (L.cols || []).forEach(function (col) {
      var lo = Infinity, hi = -Infinity;
      (col.secs || []).forEach(function (cell) {
        var kind = cell && cell.ref && cell.ref.t;
        if (kind !== "drawers" && kind !== "pullout") return;
        if (fin(cell.y0)) lo = Math.min(lo, cell.y0);
        if (fin(cell.y1)) hi = Math.max(hi, cell.y1);
      });
      if (!(hi > lo)) {
        // no laid-out cell bands (older layouts) — fall back to the carcass
        var any = (col.ref && col.ref.secs || []).some(function (sec) {
          return sec && (sec.t === "drawers" || sec.t === "pullout");
        });
        if (!any) return;
        lo = fin(L.yb) ? L.yb : 0;
        hi = fin(L.yt) ? L.yt : (Number(it.h) || 0);
      }
      var z0 = L.zc, z1 = L.zc + pull;
      out.push({
        poly: [pt(col.x0, z0), pt(col.x1, z0), pt(col.x1, z1), pt(col.x0, z1)],
        lo: base + lo,
        hi: base + hi,
      });
    });
    return out;
  } catch (e) {
    return [];
  }
}

var _cab = null;
export function bindCabinetHelpers(helpers) {
  _cab = helpers;
  invalidateSwingCache();
}
function cabinetApi() {
  return _cab;
}

export function swingPolysForOpening(o) {
  var polys = doorSwingPolys(o);
  if (!polys.length) return [];
  var band = doorSwingBand(o);
  return polys.map(function (poly) {
    return { kind: "door", id: o.id, poly: poly, band: band, ref: o };
  });
}

export function swingPolysForItem(it) {
  var out = [];
  cabinetSwingPolys(it).forEach(function (sw, i) {
    out.push({
      kind: "cabinet-door", id: it.id + ":d" + i, poly: sw.poly,
      band: { lo: sw.lo, hi: sw.hi }, ref: it,
    });
  });
  var appl = applianceSwingPoly(it);
  if (appl) out.push({ kind: "appliance", id: it.id + ":a", poly: appl, band: itemBand(it), ref: it });
  drawerPullPolys(it).forEach(function (sw, i) {
    out.push({
      kind: "drawer", id: it.id + ":p" + i, poly: sw.poly,
      band: { lo: sw.lo, hi: sw.hi }, ref: it,
    });
  });
  return out;
}

function issueFor(sw, ownerId, otherId, kindLabel) {
  return {
    severity: "warning",
    kind: kindLabel,
    ref: ownerId,
    itemId: otherId,
    swing: sw.kind,
    code: sw.kind === "drawer" ? "swing_drawer"
      : sw.kind === "appliance" ? "swing_appliance"
      : sw.kind === "door" ? "swing_door" : "swing_cabinet",
    message: sw.kind === "drawer"
      ? "Drawer pull-out hits another piece."
      : "Door swing hits furniture.",
  };
}

function computeConflicts(st) {
  var issues = [];
  var openings = new Set();
  var items = st.items || [];
  var boxes = items.map(function (it) {
    return (it && it.w > 0 && it.d > 0) ? bbox(itemCorners(it)) : null;
  });
  var bands = items.map(itemBand);

  function sweep(sw, ownerId, kindLabel, skipIndex) {
    var sb = bbox(sw.poly), hit = false;
    for (var i = 0; i < items.length; i++) {
      if (i === skipIndex || !boxes[i]) continue;
      if (boxesMiss(sb, boxes[i])) continue;
      if (sw.band && bandsClear(sw.band, bands[i])) continue;
      if (!polysIntersect(sw.poly, itemCorners(items[i]))) continue;
      hit = true;
      issues.push(issueFor(sw, ownerId, items[i].id, kindLabel));
    }
    return hit;
  }

  (st.openings || []).forEach(function (o) {
    swingPolysForOpening(o).forEach(function (sw) {
      if (sweep(sw, o.id, "opening", -1)) openings.add(o.id);
    });
  });
  items.forEach(function (it, idx) {
    swingPolysForItem(it).forEach(function (sw) {
      sweep(sw, it.id, "item", idx);
    });
  });
  return { issues: issues, openings: openings };
}

/* ---- memo -----------------------------------------------------------------
   plan2d asks "does this door conflict?" once per door per repaint, and a
   repaint runs on every pointermove. Recomputing sectors and testing them
   against every item was 9 ms/frame on a 30-door, 400-item plan and 45 ms on a
   large one. Nothing in the answer depends on frame state, so hash the inputs
   (O(walls + openings + items)) and reuse the result until they move. */
var cache = null;

function hash(h, v) {
  // cheap deterministic mix; only needs to change when a value changes
  return (Math.imul(h ^ (v | 0), 2654435761) + (v * 1000 | 0)) | 0;
}

function signature(st) {
  var h = 17, i, n, w, o, it;
  var nodes = st.nodes || [];
  h = hash(h, nodes.length);
  for (i = 0; i < nodes.length; i++) {
    n = nodes[i];
    h = hash(h, n.x * 16); h = hash(h, n.z * 16);
  }
  var walls = st.walls || [];
  h = hash(h, walls.length);
  for (i = 0; i < walls.length; i++) {
    w = walls[i];
    h = hash(h, w.a); h = hash(h, w.b);
    h = hash(h, (w.thickness || 0) * 16); h = hash(h, w.id | 0);
  }
  var ops = st.openings || [];
  h = hash(h, ops.length);
  for (i = 0; i < ops.length; i++) {
    o = ops[i];
    h = hash(h, o.wall | 0); h = hash(h, (o.s || 0) * 16);
    h = hash(h, (o.width || 0) * 16); h = hash(h, (o.height || 0) * 16);
    h = hash(h, (o.sill || 0) * 16);
    h = hash(h, (o.swingDir || "R_IN").charCodeAt(0) + (o.swingDir || "R_IN").length * 7);
    h = hash(h, (o.isSliding ? 2 : 0) + (o.isPocket ? 1 : 0) + (o.type === "door" ? 4 : 0) + (o.isDouble ? 8 : 0));
    h = hash(h, (Number(o.leafA) || 0) * 16);
  }
  var items = st.items || [];
  h = hash(h, items.length);
  for (i = 0; i < items.length; i++) {
    it = items[i];
    h = hash(h, (it.x || 0) * 16); h = hash(h, (it.z || 0) * 16);
    h = hash(h, (it.rot || 0) * 16); h = hash(h, (it.w || 0) * 16);
    h = hash(h, (it.d || 0) * 16); h = hash(h, (it.h || 0) * 16);
    h = hash(h, (it.elev || 0) * 16);
    h = hash(h, it.cab ? (it.cabRev || 1) : 0);
  }
  return h;
}

export function invalidateSwingCache() {
  cache = null;
}

/* The whole conflict set for a state, memoized. Pass an explicit state to
   bypass the memo (tests, validation of a scratch scene). */
export function swingConflicts(state) {
  if (state && state !== S) return computeConflicts(state);
  var sig = signature(S);
  if (cache && cache.sig === sig) return cache.result;
  cache = { sig: sig, result: computeConflicts(S) };
  return cache.result;
}

export function checkSwingConflicts(state) {
  return swingConflicts(state || S).issues;
}

export function openingHasSwingConflict(o) {
  if (!o || o.id == null) return false;
  return swingConflicts(S).openings.has(o.id);
}

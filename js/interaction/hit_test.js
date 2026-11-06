/* The planner's hit testing, broad phase, rank gates and smart alignment, split
   out of js/interaction.js. It shares the editor's state through live imports
   from ../interaction.js. */
import { isLamp } from "../furniture.js";
import { detectRooms, hiddenSets, usedNodes, wallById, wallCuts, wallGeom, wallPointAt, wallProject, wallTangentAt } from "../geometry.js";
import { snapMul } from "../interaction/wall_snap.js";
import { isLayerHidden, layerRank } from "../layers.js";
import { inputIs3D, inputScale, plannerInputView } from "../planner_input.js";
import { planIndex } from "../spatial_index.js";
import { S, clamp, fin } from "../state.js";
import { itemUserUnpickable } from "../user_layers.js";
import {
  KIND_CACHE, PICK_SLOP, SNAP_FLASH_MS, WALL_SNAP_GAP, snapSession,
} from "../interaction.js";

// Screen px of tolerance -> world cm, slop applied. Guards the degenerate
// transform (SC 0/NaN) the same way the call sites used to do by hand.
function tolCm(px) {
  var v = (px * PICK_SLOP) / inputScale();
  return isFinite(v) && v > 0 ? v : px * PICK_SLOP;
}

function kindList(kind) {
  return KIND_CACHE[kind] || (KIND_CACHE[kind] = [kind]);
}
/* Candidates of one kind within `r` of the cursor, in the array order the
   linear scans used. Sorting a handful of records per query is far below the
   scan it replaces, and it is what keeps an exact-tie winner identical. */
function nearRecs(px, pz, r, kind) {
  var out = planIndex.query(px, pz, r, kindList(kind));
  if (out.length > 1) out.sort(function (a, b) { return a.ord - b.ord; });
  return out;
}

/* The axis-aligned box of a wall's centreline, padded by a whole thickness.

   For an arc the box is the exact one: the two endpoints, plus each of the four
   axis extremes of the circle that falls inside the swept angle. Sampling the
   curve would not do — a sampled hull can cut a bulge, and a wall the grid
   forgets is a snap the user loses. */
function wallBoxOf(w, g) {
  var x0, x1, z0, z1;
  if (g.kind === "arc" && g.curve && g.curve.center && fin(g.curve.radius)) {
    var c = g.curve;
    var pts = [g.a, g.b, c.a, c.b];
    x0 = z0 = Infinity;
    x1 = z1 = -Infinity;
    pts.forEach(function (p) {
      if (!p || !fin(p.x) || !fin(p.z)) return;
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.z < z0) z0 = p.z;
      if (p.z > z1) z1 = p.z;
    });
    for (var q = 0; q < 4; q++) {
      var base = (q * Math.PI) / 2;
      for (var turn = -2; turn <= 2; turn++) {
        var ang = base + turn * 2 * Math.PI;
        var t = c.sweep ? (ang - c.startAngle) / c.sweep : -1;
        if (!(t >= 0 && t <= 1)) continue;
        var ex = c.center.x + Math.cos(ang) * c.radius,
          ez = c.center.z + Math.sin(ang) * c.radius;
        if (ex < x0) x0 = ex;
        if (ex > x1) x1 = ex;
        if (ez < z0) z0 = ez;
        if (ez > z1) z1 = ez;
        break;
      }
    }
  } else {
    x0 = Math.min(g.a.x, g.b.x);
    x1 = Math.max(g.a.x, g.b.x);
    z0 = Math.min(g.a.z, g.b.z);
    z1 = Math.max(g.a.z, g.b.z);
  }
  if (!fin(x0) || !fin(z0) || !fin(x1) || !fin(z1)) return null;
  var pad = Math.max(0, w.thickness || 0);
  return { minx: x0 - pad, minz: z0 - pad, maxx: x1 + pad, maxz: z1 + pad };
}

function layerOpen(id) {
  if (snapSession) return snapSession.open[id] !== false;
  return !isLayerHidden(id);
}

/* Everything the pointer paths can land on, as index records. Called by the
   index itself on the first query after an invalidation, which is why it is
   handed over as a function rather than an array: a gesture that mutates the
   model twenty times pays for one rebuild, on the first query that needs it,
   instead of one per mutation.

   Node records carry the ids of the walls that use them because hitNode()
   refuses a corner left behind only by hidden walls, and that question cannot
   be answered from the corner alone. `usedNodes()` — the set snapPoint's corner
   pass reads — is the same set without the hidden filter, so both callers are
   served by one record list. */
function planIndexRecords() {
  var recs = [];
  if (layerOpen("structure")) {
    var byNode = {};
    S.walls.forEach(function (w, i) {
      var g = wallGeom(w);
      if (!g || !g.a || !g.b) return;
      var box = wallBoxOf(w, g);
      if (box) {
        box.kind = "wall";
        box.id = w.id;
        box.ref = w;
        box.ord = i;
        recs.push(box);
      }
      [w.a, w.b].forEach(function (k) {
        var n = S.nodes[k];
        if (!n || !fin(n.x) || !fin(n.z)) return;
        var rec = byNode[k];
        if (!rec) {
          rec = byNode[k] = {
            kind: "node", id: +k, ord: +k, walls: [],
            minx: n.x, minz: n.z, maxx: n.x, maxz: n.z,
          };
          recs.push(rec);
        }
        rec.walls.push(w.id);
      });
    });
    /* An opening takes its whole host wall's box. Its jambs and the cursor
       projection both callers measure from lie on that wall, so the wall's box
       is a superset of anything either could reach — and one that is already
       arc-correct, where a box spanning only the two jamb points would cut the
       bulge of a curved wall between them. Openings are few per wall, so the
       coarser box costs a handful of rejected candidates and no scan. */
    S.openings.forEach(function (o, i) {
      var w = wallById(o.wall);
      if (!w) return;
      var g = wallGeom(w);
      if (!g || !fin(g.L)) return;
      var box = wallBoxOf(w, g);
      if (!box) return;
      box.kind = "opening";
      box.id = o.id;
      box.ref = o;
      box.ord = i;
      recs.push(box);
    });
  }
  if (layerOpen("furniture"))
    S.items.forEach(function (it, i) {
      if (!it || !fin(it.x) || !fin(it.z)) return;
      var a = ((it.rot || 0) * Math.PI) / 180,
        ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
      // half-extents of the axis-aligned hull of the rotated footprint
      var hx = (Math.abs(it.w || 0) * ca + Math.abs(it.d || 0) * sa) / 2,
        hz = (Math.abs(it.w || 0) * sa + Math.abs(it.d || 0) * ca) / 2;
      recs.push({
        kind: "item", id: it.id, ref: it, ord: i,
        minx: it.x - hx, maxx: it.x + hx, minz: it.z - hz, maxz: it.z + hz,
      });
    });
  if (layerOpen("annotations"))
    (S.markers || []).forEach(function (m, i) {
      if (!m || !fin(m.x) || !fin(m.z)) return;
      recs.push({
        kind: "marker", id: m.id, ref: m, ord: i,
        minx: m.x, maxx: m.x, minz: m.z, maxz: m.z,
      });
    });
  return recs;
}

/* ---- rank gates on the hit tests ----
   Every hit function below opens by asking its layer's rank and answering null
   at Infinity — ghosted or hidden geometry is not there as far as the pointer
   is concerned. Ranks 0 and 1 both still answer; separating those two is the
   pointerdown chain's job (see runSelectPass), not the hit test's, because a
   rank-1 wall must still be selectable and readable in the inspector. */
function hitNode(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  // corners of the walls actually on the plan — a corner left only by hidden
  // walls isn't drawn, so it isn't grabbable either (mirrors plan2d drawNodes)
  var hid = hiddenSets(),
    thr = tolCm(10),
    best = null,
    bd = thr;
  /* Records arrive in ascending node index, which is the order the `for..in`
     over usedNodes() ran in — and `d < bd` is strict, so two coincident corners
     are still separated the same way round. */
  var near = nearRecs(px, pz, thr, "node");
  for (var i = 0; i < near.length; i++) {
    var rec = near[i], shown = false;
    for (var j = 0; j < rec.walls.length; j++)
      if (!hid.walls[rec.walls[j]]) { shown = true; break; }
    if (!shown) continue;
    var n = S.nodes[rec.id];
    if (!n) continue;
    var d = Math.hypot(px - n.x, pz - n.z);
    if (d < bd) {
      bd = d;
      best = rec.id;
    }
  }
  return best;
}
function hitOpening(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  var hid = hiddenSets();
  // backwards, as the linear scan was: the opening latest in the array wins an
  // overlap. nearRecs() hands them back in array order, so reversing it here is
  // the same traversal over a shorter list.
  var nearOp = nearRecs(px, pz, tolCm(10), "opening");
  for (var i = nearOp.length - 1; i >= 0; i--) {
    var o = nearOp[i].ref,
      w = wallById(o.wall);
    if (!w || hid.walls[o.wall]) continue;
    var gm = wallGeom(w), projected = wallProject(w, px, pz);
    if (!projected) continue;
    var s = clamp(o.s, o.width / 2, gm.L - o.width / 2);
    if (Math.abs(projected.s - s) < o.width / 2 && projected.distance < w.thickness / 2 + tolCm(10))
      return o;
  }
  return null;
}
function inItem(px, pz, it, pad) {
  var A = (it.rot * Math.PI) / 180,
    ca = Math.cos(A),
    sa = Math.sin(A);
  var lx = (px - it.x) * ca + (pz - it.z) * sa,
    lz = -(px - it.x) * sa + (pz - it.z) * ca;
  return Math.abs(lx) <= it.w / 2 + pad && Math.abs(lz) <= it.d / 2 + pad;
}
// What is drawn is what can be picked: anything a hidden room took off the
// plan is skipped here too (hiddenSets costs nothing when nothing is hidden).
function hitItem(px, pz) {
  if (layerRank("furniture") === Infinity) return null;
  var i,
    it,
    hid = hiddenSets();
  /* The lamp pass grows the footprint by up to tolCm(16) + tolCm(6) along the
     item's OWN axes, so a point it accepts can sit as far as that times root
     two from the axis-aligned box the grid stores. 1.5 is the smallest tidy
     number above root two, and querying wide costs a few rejected candidates
     where querying short would lose a lamp at 45 degrees. */
  var near = nearRecs(px, pz, tolCm(22) * 1.5, "item");
  // both passes still run newest-first, so the piece drawn on top wins
  for (i = near.length - 1; i >= 0; i--) {
    it = near[i].ref;
    // hidden pieces, and pieces on a faded user layer, are not there to grab
    if (hid.items[it.id] || itemUserUnpickable(it)) continue;
    if (
      isLamp(it) &&
      inItem(
        px,
        pz,
        it,
        Math.max(0, tolCm(16) - Math.min(it.w, it.d) / 2) + tolCm(6),
      )
    )
      return it;
  }
  for (i = near.length - 1; i >= 0; i--) {
    it = near[i].ref;
    if (hid.items[it.id] || itemUserUnpickable(it)) continue;
    if (!isLamp(it) && inItem(px, pz, it, 0)) return it;
  }
  return null;
}
function hitWall(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  var best = null,
    bd = 1e9,
    hid = hiddenSets();
  /* A wall record's box already carries a full thickness of padding, so a wall
     whose centreline is within thickness/2 + tolCm(8) of the cursor has its box
     within tolCm(8) of it. Records come back in S.walls order and the tie test
     stays strict, so an exact tie is still won by the earlier wall. */
  nearRecs(px, pz, tolCm(8), "wall").forEach(function (rec) {
    var w = rec.ref;
    if (hid.walls[w.id]) return;
    var projected = wallProject(w, px, pz);
    var d = projected ? projected.distance : Infinity;
    if (d < w.thickness / 2 + tolCm(8) && d < bd) {
      bd = d;
      best = w;
    }
  });
  return best;
}
/* The wall under the cursor plus where along it the cursor sits, as the two
   distances a tape measure would give: from the wall's start to here, and from
   here to its end. Both are INTERIOR distances (the corner cuts are taken off
   the ends), so the pair adds up to the number the wall is labelled with. */
export function updateWallProbe(px, pz) {
  // before the first render the scale is 0, which makes hitWall's screen-space
  // tolerance infinite — every wall would answer
  var w = inputScale() > 0 ? hitWall(px, pz) : null;
  if (!w) {
    if (S.wallProbe) S.wallProbe = null;
    return;
  }
  var gm = wallGeom(w),
    c = wallCuts(w),
    projected = wallProject(w, px, pz),
    s = projected ? projected.s : 0,
    point = wallPointAt(w, s);
  S.wallProbe = {
    wall: w,
    x: point.x,
    z: point.z,
    fromA: Math.max(0, s - c.a),
    toB: Math.max(0, gm.L - c.b - s),
  };
}
function hitRoom(px, pz) {
  if (layerRank("structure") === Infinity) return null;
  var rs = detectRooms(),
    best = null,
    ba = 1e18;
  for (var i = 0; i < rs.length; i++)
    if (pointInPolyR(px, pz, rs[i].pts) && rs[i].area < ba) {
      ba = rs[i].area;
      best = rs[i].key;
    }
  return best;
}
/* An entrance door opens into the home. The default swing ("R_IN") sweeps
   toward one face of the wall picked by the direction it was drawn in, so
   about half of all front doors came out opening onto the street. On a wall
   with a room on one side only, the leaf goes toward the room; between two
   rooms the default stands. Returns a swingDir, or null to keep the default. */
function exteriorDoorSwing(wall, s) {
  var g = wallGeom(wall);
  if (!g || g.kind === "arc" || !fin(g.L) || !(g.L > 0)) return null;
  var c = wallPointAt(wall, s), off = (Number(wall.thickness) || 10) / 2 + 20;
  // "IN" sweeps toward local -y of the plan's door drawing: world (uz, -ux)
  var nx = g.uz, nz = -g.ux;
  var rooms = detectRooms();
  function roomSide(sign) {
    var x = c.x + nx * off * sign, z = c.z + nz * off * sign;
    return rooms.some(function (r) { return pointInPolyR(x, z, r.pts); });
  }
  var inSide = roomSide(1), outSide = roomSide(-1);
  return outSide && !inSide ? "R_OUT" : null;
}
function pointInPolyR(x, z, pts) {
  var inside = false,
    i,
    j;
  for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var xi = pts[i].x,
      zi = pts[i].z,
      xj = pts[j].x,
      zj = pts[j].z;
    if (zi > z != zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi)
      inside = !inside;
  }
  return inside;
}

/* ---- smart alignment: snap a dragged item to other items' edges/centers and wall corners ---- */
// axis-aligned half-extents of an item's footprint (accounts for rotation)
function halfExtents(it) {
  var w = it.w || 0,
    d = it.d || 0,
    a = ((it.rot || 0) * Math.PI) / 180,
    c = Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a));
  return { hx: c * (w / 2) + s * (d / 2), hz: s * (w / 2) + c * (d / 2) };
}
// snap a dragged coordinate on one axis. `itemLines` are edge/center coords of
// other items (matched against the dragged item's near-edge/center/far-edge so
// items can sit flush, align sides, or share a center). `nodeLines` are wall
// corners (matched to the dragged center only). Returns {center, line} or null.
function snapAxis(v, half, itemLines, nodeLines, thr) {
  var best = null,
    bd = thr,
    handles = [0, -half, half],
    i,
    j;
  for (j = 0; j < itemLines.length; j++) {
    for (i = 0; i < handles.length; i++) {
      var center = itemLines[j] - handles[i],
        d = Math.abs(v - center);
      if (d < bd) {
        bd = d;
        best = { center: center, line: itemLines[j] };
      }
    }
  }
  for (i = 0; i < nodeLines.length; i++) {
    var dn = Math.abs(v - nodeLines[i]);
    if (dn < bd) {
      bd = dn;
      best = { center: nodeLines[i], line: nodeLines[i] };
    }
  }
  return best;
}

/* A snap that happens silently reads as the editor moving the piece on its own.
   The piece blinks for a moment when a snap ENGAGES (not on every frame it
   stays engaged, which would be a strobe) — `key` identifies what it snapped
   to, so sliding along one wall flashes once. */
function flashSnap(it, key) {
  if (!it) return;
  if (S.snapFlashKey === key) return;
  S.snapFlashKey = key;
  S.snapFlash = key ? { id: it.id, until: Date.now() + SNAP_FLASH_MS } : null;
  /* The same "it engaged" cue for a finger, which is covering the blink. Gated
     on the key change above, so sliding along one wall buzzes once rather than
     once per frame. */
  if (key && S.touchDrag && navigator.vibrate) navigator.vibrate(8);
}
function alignItem(nx, nz, it) {
  S.alignX = null;
  S.alignZ = null;
  if (S.snapObj === false) return { x: nx, z: nz };

  var mul = snapMul(),
    thr = (8 * mul) / inputScale(),
    he = it ? halfExtents(it) : { hx: 0, hz: 0 },
    itemsX = [],
    itemsZ = [],
    nodesX = [],
    nodesZ = [],
    u = usedNodes();
  for (var k in u) {
    nodesX.push(S.nodes[k].x);
    nodesZ.push(S.nodes[k].z);
  }
  S.items.forEach(function (o) {
    if (o === it) return;
    var oe = halfExtents(o);
    itemsX.push(o.x, o.x - oe.hx, o.x + oe.hx);
    itemsZ.push(o.z, o.z - oe.hz, o.z + oe.hz);
  });
  var bx = snapAxis(nx, he.hx, itemsX, nodesX, thr),
    bz = snapAxis(nz, he.hz, itemsZ, nodesZ, thr);

  if (bx == null && bz == null && it) {
    /* Snap flush to a wall — but only from CLOSE UP. The gate used to be
       `thr + max(w,d)`, i.e. the piece's own size, so a 2 m sofa was captured
       from two metres away and there was no way to stand one just off a wall.
       Now it is the GAP between the piece's face and the wall's face that has
       to be small, which is the distance the eye is judging anyway. */
    var snapP = null,
      bestGap = WALL_SNAP_GAP * mul,
      snapW = null;
    S.walls.forEach(function (w) {
      var gm = wallGeom(w);
      var dx = gm.b.x - gm.a.x, dz = gm.b.z - gm.a.z;
      var l2 = dx * dx + dz * dz;
      if (l2 < 1) return;
      var t = clamp(((nx - gm.a.x) * dx + (nz - gm.a.z) * dz) / l2, 0, 1);
      var px = gm.a.x + t * dx, pz = gm.a.z + t * dz;
      var dist = Math.hypot(nx - px, nz - pz);
      var nx_dir = nx - px, nz_dir = nz - pz;
      if (dist > 0.001) { nx_dir /= dist; nz_dir /= dist; }
      else { nx_dir = -gm.uz; nz_dir = gm.ux; }
      // Distance from wall to the item CENTER so its (possibly rotated) footprint
      // sits flush against the inner face: project the rotation-aware half-extents
      // onto the wall normal (nx_dir,nz_dir is that unit normal), then add half the
      // wall thickness (nodes lie on the centerline, not the inner face).
      var td =
        he.hx * Math.abs(nx_dir) +
        he.hz * Math.abs(nz_dir) +
        (w.thickness || 0) / 2;
      var gap = Math.abs(dist - td); // how far the piece's face is off the wall's
      if (gap < bestGap) {
        bestGap = gap;
        snapW = w;
        snapP = { x: px + nx_dir * td, z: pz + nz_dir * td };
      }
    });
    if (snapP) {
      flashSnap(it, "wall:" + snapW.id);
      /* Remember what it went flush against. endAction turns this into a
         standing hold, so a sofa pushed against a wall STAYS against it when
         the wall is later moved or the room resized — which is what the user
         meant by pushing it there, and what used to quietly come undone. */
      S.itemSnapWall = snapW.id;
      return snapP;
    }
    S.itemSnapWall = null;
  }
  flashSnap(it, bx || bz ? "align:" + (bx ? bx.line : "-") + "," + (bz ? bz.line : "-") : null);

  S.alignX = bx != null ? bx.line : null;
  S.alignZ = bz != null ? bz.line : null;
  return { x: bx != null ? bx.center : nx, z: bz != null ? bz.center : nz };
}

/* A plan click resolved to a point spec for addMarker.

   From above, a click is a floor point — unless snapPoint landed it ON a wall,
   in which case the point belongs to that wall: record the wall and the normal
   pointing back toward where the cursor actually was, which is the side of the
   wall the user is working on. That is what lets the point later be raised up
   the wall in an elevation, and what makes a piece seated on it face the room.
   `raw` may already carry a wall from snapPoint's edge snap. */
function planPickSurface(p, cx, cz) {
  var surfaceHit = inputIs3D() ? plannerInputView()?.hit : null;
  var spec = { x: p.x, y: fin(surfaceHit?.point?.y) ? surfaceHit.point.y : 0, z: p.z, surface: "floor", wall: null, nx: 0, nz: 0 };
  var best = null,
    bd = tolCm(10);
  S.walls.forEach(function (w) {
    if (surfaceHit && (surfaceHit.kind !== "wall" || surfaceHit.ref.id !== w.id)) return;
    var g = wallGeom(w), projected = wallProject(w, p.x, p.z);
    var d = projected ? projected.distance : Infinity;
    if (d < (w.thickness || 0) / 2 + bd && (best === null || d < best.d)) {
      best = { w: w, g: g, d: d, projected: projected };
    }
  });
  if (!best) return spec;
  var g2 = best.g, localTangent = wallTangentAt(best.w, best.projected.s) || { x: g2.ux, z: g2.uz },
    nx = -localTangent.z,
    nz = localTangent.x;
  // point the normal at the side the cursor is on — that is the face the user
  // is looking at, and the side a piece should end up on
  var side = (cx - g2.a.x) * nx + (cz - g2.a.z) * nz;
  if (side < 0) { nx = -nx; nz = -nz; }
  spec.surface = "wall";
  spec.wall = best.w.id;
  spec.nx = nx;
  spec.nz = nz;
  return spec;
}

export {
  alignItem, exteriorDoorSwing, hitItem, hitNode, hitOpening, hitRoom,
  hitWall, nearRecs, planIndexRecords, planPickSurface, pointInPolyR, tolCm,
};

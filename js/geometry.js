// Pure topology / geometry helpers over the wall graph (no DOM, no THREE).
import { S, WALL_H, fin, clamp, uid } from "./state.js";
import {
  wallCurveGeom,
  pointAtWall,
  tangentAtWall,
  projectToWall,
  curvedWallOutline,
} from "./wall_curves.js";

var roomCycleCache = { sig: "", rooms: [] };
var contentBoundsCache = { sig: "", value: null };

function topologySignature() {
  var out = S.nodes.length + "|" + S.walls.length;
  S.nodes.forEach(function (n) { out += ";" + n.x + "," + n.z; });
  S.walls.forEach(function (w) {
    /* The lateral offset belongs in the key: room polygons are sampled along
       each wall's OWN line, so re-hanging a wall on its face moves them without
       touching a single node. Leaving it out served a stale room. */
    out += ";" + w.id + "," + w.a + "," + w.b + "," + w.height + "," +
      JSON.stringify(w.geometry || w.curve || null) + "," + (w.kind || "normal") +
      "," + wallOffset(w);
  });
  return out;
}

function boundsSignature() {
  var out = topologySignature() + "|" + S.items.length;
  S.items.forEach(function (it) {
    out += ";" + it.id + "," + it.x + "," + it.z + "," + it.w + "," + it.d;
  });
  return out;
}

export function wallById(id) {
  for (var i = 0; i < S.walls.length; i++)
    if (S.walls[i].id === id) return S.walls[i];
  return null;
}
/* Return the opening whose empty span contains distance `s` along `w`.
   A new wall may terminate at either jamb, but not in the empty span: splitting
   a host there leaves the opening owned by only one half and creates an
   asymmetric cut in 3D. */
export function openingAtWallPosition(w, s, pad) {
  if (!w || !fin(s)) return null;
  var extra = fin(pad) ? Math.max(0, pad) : 0;
  for (var i = 0; i < S.openings.length; i++) {
    var o = S.openings[i];
    if (!o || o.wall !== w.id || !fin(o.s) || !fin(o.width)) continue;
    var half = Math.max(0, o.width) / 2;
    if (s > o.s - half - extra && s < o.s + half + extra) return o;
  }
  return null;
}
/* ---- location line -------------------------------------------------------

   `S.nodes` stores a wall's LOCATION LINE, and `w.loc` says which line of the
   wall that is:

     "center"  (default, and what every older file means by omitting it)
     "face"    the node line IS the face named by "Measured along" (w.dimSide)

   A wall drawn on its face is how architects actually work — and it is the only
   way two collinear walls of DIFFERENT thickness can join flush: they meet at
   one node, so a shared node line is the only thing they can share. On the
   centreline that forces the faces to step by (t1-t2)/2 on each side; on the
   face it puts the whole step on the far side, which is what a plan reads.

   The offset is DERIVED (thickness and dimSide already say everything), so it
   cannot drift out of sync with them and there is nothing extra to migrate.

   THE INVARIANT: S.nodes is the location line — topology, dragging, welding,
   corner snapping. wallGeom() is the wall's OWN centreline — drawing,
   measuring, mitres, openings, items, 3D. Never read one and write the other;
   go through setWallEnd()/wallNodeFromAxis() instead. */
export function wallLocFace(w) {
  return !!w && w.loc === "face" && (w.dimSide === 1 || w.dimSide === -1) &&
    !isCurvedWall(w);
}
function isCurvedWall(w) {
  var c = wallCurveGeom(w, S.nodes);
  // A wall whose ends are not in the live node array (a wall handed in from
  // another state, as the framing tests do) cannot be resolved here, so any arc
  // INTENT counts: erring toward "curved" only ever means "no offset".
  return c ? c.kind === "arc" : !!(w.geometry || w.curve || w.bulge);
}
/* Signed lateral distance from the node line to the wall's centreline, along
   the +1 normal (-uz, ux) of the a->b direction. */
export function wallOffset(w) {
  if (!wallLocFace(w)) return 0;
  return -w.dimSide * (w.thickness || 0) / 2;
}
/* ...and the same thing as a world vector, which is what every joint needs. */
export function wallOffsetVec(w) {
  var off = wallOffset(w);
  if (!off) return { x: 0, z: 0 };
  var g = wallNodeGeom(w);
  return { x: -g.uz * off, z: g.ux * off };
}
/* The wall exactly as the node graph stores it. Directions and lengths are the
   same on either line — an offset is a lateral translation — so everything that
   reasons about topology, bearings or which way an arm points may use this and
   never has to know the location line exists. It is also what breaks the
   recursion: wallOffset() needs dimSide, and Auto's dimSide needs a geometry. */
export function wallNodeGeom(w) {
  var curve = wallCurveGeom(w, S.nodes),
    a = curve ? curve.a : S.nodes[w.a],
    b = curve ? curve.b : S.nodes[w.b],
    dx = b.x - a.x,
    dz = b.z - a.z,
    chord = Math.hypot(dx, dz) || 0.0001,
    L = curve ? curve.L : chord;
  return {
    a: a,
    b: b,
    dx: dx,
    dz: dz,
    L: L,
    ux: dx / chord,
    uz: dz / chord,
    ang: Math.atan2(dz, dx),
    curve: curve && curve.kind === "arc" ? curve : null,
    kind: curve ? curve.kind : "line",
    chord: chord,
  };
}
export function wallGeom(w) {
  var g = wallNodeGeom(w),
    off = wallOffset(w);
  if (!off) return g; // the default line: not one extra object in the hot path
  var nx = -g.uz * off,
    nz = g.ux * off;
  g.a = { x: g.a.x + nx, z: g.a.z + nz };
  g.b = { x: g.b.x + nx, z: g.b.z + nz };
  return g;
}
/* Map a point on the wall's own line back onto the node line — the inverse of
   the offset above. Every writer goes through here. */
export function wallNodeFromAxis(w, pt) {
  var v = wallOffsetVec(w);
  return { x: pt.x - v.x, z: pt.z - v.z };
}
/* The ONE way to move a wall's end. `pt` is on the wall's own line (i.e. it
   came out of wallGeom), so an offset wall lands where the caller meant rather
   than half a thickness away — and shifted again on every following edit. */
export function setWallEnd(w, end, pt) {
  if (!w || !pt) return;
  var i = end === "a" ? w.a : w.b;
  if (i == null) return;
  S.nodes[i] = wallNodeFromAxis(w, pt);
}
/* wall_curves.js takes its nodes as an argument and only ever reads the wall's
   own two ends, so the offset is handed to it as a two-key stand-in rather than
   by teaching it about location lines. Curved walls never offset (an offset
   changes an arc's radius, it does not translate it), so the arc centre lookup
   inside wall_curves keeps working off the real node array.

   Takes the node array explicitly, so the modules written as pure functions over
   a passed-in state (wall_framing.js and friends) can place real timber on the
   wall's own line without reaching for the global. */
export function wallAxisNodes(w, nodes) {
  nodes = nodes || S.nodes;
  var off = wallOffset(w);
  if (!off) return nodes;
  var a = nodes[w.a],
    b = nodes[w.b];
  if (!a || !b) return nodes;
  var dx = b.x - a.x,
    dz = b.z - a.z,
    L = Math.hypot(dx, dz) || 1,
    nx = (-dz / L) * off, // the +1 normal (-uz, ux) of the a->b direction
    nz = (dx / L) * off,
    out = {};
  out[w.a] = { x: a.x + nx, z: a.z + nz };
  out[w.b] = { x: b.x + nx, z: b.z + nz };
  return out;
}
function axisNodes(w) {
  return wallAxisNodes(w, S.nodes);
}

export function wallPointAt(w, s) {
  return pointAtWall(w, s, axisNodes(w));
}
export function wallTangentAt(w, s) {
  return tangentAtWall(w, s, axisNodes(w));
}
export function wallProject(w, x, z) {
  return projectToWall(w, x, z, axisNodes(w));
}

/* Nearest point on an existing wall segment. Wall placement uses this as a
   commit-time safety net: at a low zoom level the visible wall face can sit
   outside the normal pointer snap radius even though the endpoint is plainly
   intended to join it. `excludeNodes` prevents a new segment from folding
   back onto a wall already leaving its active origin. */
export function nearestWallLanding(x, z, maxDist, excludeNodes) {
  if (!fin(x) || !fin(z) || !fin(maxDist) || maxDist < 0) return null;
  var skip = {};
  (excludeNodes || []).forEach(function (ni) { if (ni != null) skip[ni] = 1; });
  var best = null;
  S.walls.forEach(function (w) {
    if (!w || skip[w.a] || skip[w.b]) return;
    // wallProject, not projectToWall(..., S.nodes): a new wall must land on the
    // wall the user can see, which on a face location line is not the node line
    var g = wallGeom(w), hit = wallProject(w, x, z);
    if (!fin(g.L) || g.L <= 0.001 || !hit) return;
    var s = hit.s, px = hit.x, pz = hit.z, d = hit.distance;
    if (d <= maxDist && (!best || d < best.d))
      best = { wall: w, s: s, x: px, z: pz, d: d };
  });
  return best;
}

/* Classify a wall at a multi-arm node without relying on wall creation order.
   A T-junction contains one opposite (straight-through) pair and one branch.
   Both members of the opposite pair must end at the shared centre node in 3D;
   choosing only the lowest-id wall as "through" makes its continuation stop
   short and leaves the triangular tear that is especially visible in a
   corridor.  Crossings classify every arm as a continuation. */
export function wallJoinRole(w, nodeId) {
  if (!w || (w.a !== nodeId && w.b !== nodeId)) return null;
  var arms = [];
  S.walls.forEach(function (ow) {
    var other = ow.a === nodeId ? ow.b : ow.b === nodeId ? ow.a : null;
    if (other == null) return;
    var p = S.nodes[nodeId],
      q = S.nodes[other];
    if (!p || !q) return;
    var dx = q.x - p.x,
      dz = q.z - p.z,
      L = Math.hypot(dx, dz);
    if (L < 1) return;
    arms.push({ wall: ow, ux: dx / L, uz: dz / L });
  });
  if (arms.length < 3) return null;
  var hasThroughPair = false;
  for (var i = 0; i < arms.length; i++) {
    for (var j = i + 1; j < arms.length; j++) {
      var cross = arms[i].ux * arms[j].uz - arms[i].uz * arms[j].ux,
        dot = arms[i].ux * arms[j].ux + arms[i].uz * arms[j].uz;
      if (Math.abs(cross) >= 0.08 || dot >= -0.996) continue;
      hasThroughPair = true;
      if (arms[i].wall === w || arms[j].wall === w) return "continuation";
    }
  }
  return hasThroughPair ? "branch" : null;
}
/* ---- where a wall's stated length is measured -----------------------------

   A wall has three different lengths at once, and they differ by real
   centimetres at every corner: at a right-angle joint the face on the INSIDE
   of the corner stops half the neighbour's thickness early, the face on the
   OUTSIDE runs half a thickness past the node, and the centreline is exactly
   the node-to-node distance. So "the length of this wall" is meaningless until
   you say which face the tape is against — which is what `w.dimSide` records:

     +1 / -1  the face on that side of the wall (side +1 is the left-hand side
              of the a→b direction, i.e. the normal (-uz, ux))
      0       the centreline

   Unset means "decide from the drawing": the face turned toward the room this
   wall encloses, or failing that the concave side of its own corners — the
   inside of an L, which is where a person stands with the tape. */
export function wallSideNormal(g) {
  return { x: -g.uz, z: g.ux };
}
export function wallDimSide(w) {
  if (!w) return 0;
  if (S.interiorDims === false) return 0; // legacy: centreline dimensions
  if (w.dimSide === 1 || w.dimSide === -1 || w.dimSide === 0) return w.dimSide;
  return autoDimSide(w);
}
/* Reads the NODE line on purpose: the offset that a "face" location line adds
   is derived from the very answer this function produces, so asking wallGeom()
   here would be circular. Nothing below depends on the difference — directions,
   arm bearings and the room test are all offset-invariant to within half a
   thickness, and the room test has a 0.5 cm deadband of its own. */
function autoDimSide(w) {
  var g = wallNodeGeom(w),
    n = wallSideNormal(g),
    mx = (g.a.x + g.b.x) / 2,
    mz = (g.a.z + g.b.z) / 2;
  // a wall that encloses a room is measured on the face turned INTO that room
  var rooms = detectRooms(),
    wid = String(w.id);
  for (var i = 0; i < rooms.length; i++) {
    if (String(rooms[i].key).split(",").indexOf(wid) === -1) continue;
    var d = (rooms[i].cx - mx) * n.x + (rooms[i].cz - mz) * n.z;
    if (Math.abs(d) > 0.5) return d > 0 ? 1 : -1;
  }
  /* otherwise the concave side of its own corners: the inside of the L.

     A collinear neighbour is not a corner and contributes exactly 0 here — but
     when the real corners CANCEL (a Z, or a straight run with a stub on each
     side) the total is zero too, and the answer was then decided by the last
     bit of floating-point noise. Thickening a wall three joints away moved a
     node by a hair, the sum changed sign, this wall's whole reference face
     flipped, and preserveClear() slid it by a full wall thickness to keep the
     same number on the other face. So: skip the straight-through arms, and
     treat a balanced sum as a tie with one fixed answer instead of a coin
     flip. Auto shows the face it resolved to, and it can always be pinned. */
  var acc = 0;
  [w.a, w.b].forEach(function (nid) {
    var mine = w.a === nid ? { x: g.ux, z: g.uz } : { x: -g.ux, z: -g.uz };
    S.walls.forEach(function (ow) {
      if (ow === w) return;
      var o = ow.a === nid ? ow.b : ow.b === nid ? ow.a : null;
      if (o == null) return;
      var p = S.nodes[nid],
        q = S.nodes[o];
      if (!p || !q) return;
      var dx = q.x - p.x,
        dz = q.z - p.z,
        L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      if (Math.abs(mine.x * dz - mine.z * dx) < 0.08 &&
        mine.x * dx + mine.z * dz < -0.996) return; // straight run, not a corner
      acc += dx * n.x + dz * n.z;
    });
  });
  /* Each arm contributes up to 1, so a total this small means the arms cancel
     (a Z, a stub each side) and there IS no concave side. Answer the tie the
     same way every time rather than following the residual. */
  return acc < -AUTO_SIDE_TIE ? -1 : 1;
}
const AUTO_SIDE_TIE = 0.02; // ~1° of arm disagreement counts as balanced

/* Is `w` built out of anything where it meets `nodeId`?

   Opening a segment and then drawing off one of its jambs splits the host at
   both jambs, which leaves a middle wall whose whole length is the passage —
   a wall that draws nothing at all. That ghost still stood at the jamb node as
   a straight-through arm, so the stub beside it was told "not a corner, don't
   mitre" and the wall drawn out of the jamb butted into a face that was never
   built: half its end hung into the empty doorway as a tongue. A full-height
   opening reaching a joint is the same situation without the extra split.

   Only an opening that takes the wall's whole HEIGHT disconnects the joint — a
   window leaves wall above and below it to carry the corner. */
export function wallSolidAtNode(w, nodeId) {
  if (!w) return false;
  var atA = w.a === nodeId,
    atB = w.b === nodeId;
  if (!atA && !atB) return true;
  var L = wallGeom(w).L,
    H = w.height || 0,
    tol = 0.5;
  for (var i = 0; i < S.openings.length; i++) {
    var o = S.openings[i];
    if (!o || o.wall !== w.id || !fin(o.s) || !fin(o.width)) continue;
    var y0 = o.sill || 0;
    if (y0 > 0.01 || y0 + (o.height || 0) < H - 0.01) continue;
    var half = Math.max(0, o.width) / 2;
    if (atA ? o.s - half <= tol : o.s + half >= L - tol) return false;
  }
  return true;
}

/* WHICH wall leaves `nodeId` running straight BACK along (ux,uz)? Then this is
   not a corner at all — it is one physical straight run that happens to be
   stored as two walls — and nothing here should be mitred. The wall itself is
   returned because a thickness edit has to translate the whole run rather than
   pull on this one shared node (see moveWallSideways in constraint_engine.js);
   `straightThroughAt` is the boolean the mitre code and the 3D builder ask. */
export function straightThroughWallAt(nodeId, ux, uz, except) {
  var hit = null;
  S.walls.forEach(function (ow) {
    if (hit || ow === except || !wallSolidAtNode(ow, nodeId)) return;
    var o = ow.a === nodeId ? ow.b : ow.b === nodeId ? ow.a : null;
    if (o == null) return;
    var p = S.nodes[nodeId],
      q = S.nodes[o];
    if (!p || !q) return;
    var dx = q.x - p.x,
      dz = q.z - p.z,
      L = Math.hypot(dx, dz);
    if (L < 1) return;
    dx /= L;
    dz /= L;
    if (Math.abs(ux * dz - uz * dx) < 0.08 && ux * dx + uz * dz < -0.996)
      hit = ow;
  });
  return hit;
}
/* Exported because the 3D builder has to make exactly the same call: whatever
   this says is not a corner gets no mitre, so the plain end cut it falls back
   on must already be right on its own. */
export function straightThroughAt(nodeId, ux, uz, except) {
  return !!straightThroughWallAt(nodeId, ux, uz, except);
}
/* Every node of the maximal STRAIGHT RUN through `w`: this wall plus every
   wall reachable from either end through a straight-through joint. Two
   collinear walls share one node, so their centrelines cannot be offset from
   each other — moving that node sideways for one of them can only BEND the
   other. Anything that has to slide a wall laterally therefore slides the
   whole run, which keeps every member's length and bearing exactly. */
export function straightRunNodes(w) {
  var out = {};
  if (!w) return out;
  out[w.a] = 1;
  out[w.b] = 1;
  ["a", "b"].forEach(function (end) {
    var cur = w,
      node = w[end],
      seen = {};
    seen[w.id] = 1;
    for (var guard = 0; guard < S.walls.length; guard++) {
      var g = wallNodeGeom(cur),
        ux = cur.a === node ? g.ux : -g.ux,
        uz = cur.a === node ? g.uz : -g.uz,
        next = straightThroughWallAt(node, ux, uz, cur);
      if (!next || seen[next.id]) break;
      seen[next.id] = 1;
      node = next.a === node ? next.b : next.a;
      cur = next;
      out[node] = 1;
    }
  });
  return out;
}

/* How far the face on `side` of a segment leaving `nodeId` in direction
   (ux,uz) starts AFTER the node (positive) or BEFORE it (negative), given the
   other walls standing at that corner. Half the neighbour's thickness, divided
   by sin of the angle between them (a shallow joint eats more), signed by
   whether the neighbour leans toward that face or away from it. Walls running
   straight on (a split wall) are not corners and are skipped.
   Multiple neighbours: the one that eats most wins, as with the old rule. */
export function faceShiftAt(nodeId, ux, uz, side, except, myHalf) {
  if (!side) return 0;
  var nx = -uz * side,
    nz = ux * side,
    hm = myHalf || 0,
    best = null,
    /* Both walls' lines used to pass through the shared node, so the joint was
       decided by thicknesses and the angle alone. With location lines they no
       longer do, and every intersection below picks up ONE extra term: the
       lateral gap between the two lines, seen along the neighbour's direction.
       At `loc: "center"` this is 0 and the arithmetic is bit-identical. */
    vMe = wallOffsetVec(except);
  var endKey = except && except.a === nodeId ? "a" : except && except.b === nodeId ? "b" : null,
    manualJoin = endKey && except.join && except.join[endKey];
  if (manualJoin === "through") {
    var throughExtension = 0;
    S.walls.forEach(function (ow) {
      if (ow === except || !wallSolidAtNode(ow, nodeId)) return;
      var other = ow.a === nodeId ? ow.b : ow.b === nodeId ? ow.a : null;
      if (other == null || !S.nodes[nodeId] || !S.nodes[other]) return;
      var tp = S.nodes[nodeId], tq = S.nodes[other], tdx = tq.x - tp.x, tdz = tq.z - tp.z,
        tl = Math.hypot(tdx, tdz);
      if (tl < 1) return;
      tdx /= tl; tdz /= tl;
      var crossAbs = Math.abs(ux * tdz - uz * tdx);
      if (crossAbs < 0.08) return;
      throughExtension = Math.max(
        throughExtension,
        ((ow.thickness || 0) / 2 + Math.abs(lineGap(vMe, ow, tdx, tdz))) / crossAbs,
      );
    });
    return -throughExtension;
  }
  /* A manual butt join gives this wall a square end at the nearest face of
     the adjoining wall. Both of this wall's faces receive the same shift, so
     the cut stays perpendicular instead of becoming a mitre. */
  if (manualJoin === "butt") {
    var butt = null;
    S.walls.forEach(function (ow) {
      if (ow === except || !wallSolidAtNode(ow, nodeId)) return;
      var other = ow.a === nodeId ? ow.b : ow.b === nodeId ? ow.a : null;
      if (other == null || !S.nodes[nodeId] || !S.nodes[other]) return;
      var bp = S.nodes[nodeId], bq = S.nodes[other], bdx = bq.x - bp.x, bdz = bq.z - bp.z,
        bl = Math.hypot(bdx, bdz);
      if (bl < 1) return;
      bdx /= bl; bdz /= bl;
      var crossAbs = Math.abs(ux * bdz - uz * bdx);
      if (crossAbs < 0.08) return;
      var bgap = lineGap(vMe, ow, bdx, bdz),
        shift = Math.min(
          Math.abs(bgap - (ow.thickness || 0) / 2),
          Math.abs(bgap + (ow.thickness || 0) / 2),
        ) / crossAbs;
      if (butt == null || shift < butt) butt = shift;
    });
    return butt || 0;
  }
  /* A branch meeting a straight-through run is a T, not two separate mitred
     elbows.  Keep the through wall square at the shared centre node and let
     the branch butt into its outside face.  Without this ownership rule each
     half of the through wall chased a different face of the branch, producing
     the long triangular spike visible at the left side of a T-junction. */
  if (manualJoin !== "miter" && manualJoin !== "mitre" && straightThroughAt(nodeId, ux, uz, except)) return 0;
  S.walls.forEach(function (ow) {
    if (ow === except || !wallSolidAtNode(ow, nodeId)) return;
    var o = ow.a === nodeId ? ow.b : ow.b === nodeId ? ow.a : null;
    if (o == null) return;
    var p = S.nodes[nodeId],
      q = S.nodes[o];
    if (!p || !q) return;
    var dx = q.x - p.x,
      dz = q.z - p.z,
      L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    var cross = ux * dz - uz * dx;
    if (Math.abs(cross) < 0.08) return; // in line with us: a split wall, not a corner
    /* Where our face line meets the neighbour's. Both of the neighbour's face
       lines are candidates; the corner picks the far one on the convex side
       (the face runs PAST the node) and the near one on the concave side (it
       stops short). At a right angle the cos term drops out and this is the
       old +/- half-a-thickness; the difference is entirely the oblique case,
       where the shift also depends on OUR half-thickness. */
    var ho = (ow.thickness || 0) / 2,
      cos = ux * dx + uz * dz,
      gap = lineGap(vMe, ow, dx, dz),
      t1 = (gap - ho + hm * side * cos) / cross,
      t2 = (gap + ho + hm * side * cos) / cross,
      concave = dx * nx + dz * nz > 0,
      shift = concave ? Math.max(t1, t2) : Math.min(t1, t2);
    if (best === null || shift > best) best = shift;
  });
  return best || 0;
}
/* (neighbour's line - mine) x (neighbour's direction): how far apart the two
   walls' own lines run at the shared node, in the units the intersections
   above are solved in. Zero unless a location line is in play. */
function lineGap(vMe, ow, dx, dz) {
  var vo = wallOffsetVec(ow);
  if (!vo.x && !vo.z && !vMe.x && !vMe.z) return 0;
  return (vo.x - vMe.x) * dz - (vo.z - vMe.z) * dx;
}

/* ---- equal-angle snap for a translated cut-corner wall -----------------

   A chamfer/cut-corner wall has exactly one neighbouring wall at each end.
   Translating it keeps its own length and bearing, but changes both joint
   angles.  These helpers find the closest translation at which those angles
   match.  They are kept in geometry.js so the drag policy and its regression
   tests share the same calculation, with no DOM or canvas dependency. */
export function wallAnglePair(w) {
  if (!w) return null;
  function at(node, otherEnd) {
    var arms = [];
    S.walls.forEach(function (ow) {
      if (ow === w) return;
      var other = ow.a === node ? ow.b : ow.b === node ? ow.a : null;
      if (other != null && other !== otherEnd && S.nodes[other])
        arms.push({ wall: ow, other: other });
    });
    return arms.length === 1 ? arms[0] : null;
  }
  var a = at(w.a, w.b),
    b = at(w.b, w.a);
  return a && b ? { a: a, b: b } : null;
}

function jointAngle(ax, az, bx, bz) {
  var al = Math.hypot(ax, az),
    bl = Math.hypot(bx, bz);
  if (al < 1 || bl < 1) return null;
  return Math.acos(clamp((ax * bx + az * bz) / (al * bl), -1, 1));
}

function translatedEndAngles(w, pair, base, dx, dz) {
  var pa = S.nodes[pair.a.other],
    pb = S.nodes[pair.b.other];
  if (!pa || !pb) return null;
  var ax = base.a.x + dx,
    az = base.a.z + dz,
    bx = base.b.x + dx,
    bz = base.b.z + dz,
    wx = bx - ax,
    wz = bz - az,
    aa = jointAngle(wx, wz, pa.x - ax, pa.z - az),
    ab = jointAngle(-wx, -wz, pb.x - bx, pb.z - bz);
  if (aa == null || ab == null) return null;
  return { a: aa, b: ab, diff: aa - ab };
}

/* Orthogonally project the requested translation onto the local equal-angle
   locus.  Each Newton step follows the angle-error gradient, which is the
   smallest visible correction instead of arbitrarily forcing x or z. */
export function equalWallAngleTranslation(w, base, dx, dz) {
  var pair = wallAnglePair(w);
  if (!pair || !base || !base.a || !base.b) return null;
  var raw = translatedEndAngles(w, pair, base, dx, dz);
  if (!raw) return null;
  var x = dx,
    z = dz,
    h = 0.25;
  for (var i = 0; i < 12; i++) {
    var cur = translatedEndAngles(w, pair, base, x, z);
    if (!cur) return null;
    if (Math.abs(cur.diff) < 1e-5) break;
    var xp = translatedEndAngles(w, pair, base, x + h, z),
      xm = translatedEndAngles(w, pair, base, x - h, z),
      zp = translatedEndAngles(w, pair, base, x, z + h),
      zm = translatedEndAngles(w, pair, base, x, z - h);
    if (!xp || !xm || !zp || !zm) return null;
    var gx = (xp.diff - xm.diff) / (2 * h),
      gz = (zp.diff - zm.diff) / (2 * h),
      g2 = gx * gx + gz * gz;
    if (g2 < 1e-10) return null;
    var scale = -cur.diff / g2,
      sx = gx * scale,
      sz = gz * scale,
      sl = Math.hypot(sx, sz);
    // Keep a poor first estimate local; the interaction deliberately previews
    // only nearby solutions, but this guard also prevents numerical leaps.
    if (sl > 40) {
      sx *= 40 / sl;
      sz *= 40 / sl;
    }
    x += sx;
    z += sz;
    if (Math.hypot(x - dx, z - dz) > 250) return null;
  }
  var solved = translatedEndAngles(w, pair, base, x, z);
  if (!solved || Math.abs(solved.diff) > 0.001) return null;
  return {
    dx: x,
    dz: z,
    correctionX: x - dx,
    correctionZ: z - dz,
    correction: Math.hypot(x - dx, z - dz),
    rawA: (raw.a * 180) / Math.PI,
    rawB: (raw.b * 180) / Math.PI,
    angle: ((solved.a + solved.b) * 90) / Math.PI,
    pair: pair,
  };
}
/* The wall's four drawn corners, mitered against whatever stands at each end:
   [a-side+, b-side+, b-side-, a-side-] in world cm. This is the outline the
   plan fills and the 3D wall shears its end faces to, so a 60-degree corner
   closes the same way a square one does. */
export function wallOutline(w) {
  var g = wallGeom(w),
    h = (w.thickness || 0) / 2,
    lim = cutLimit(g);
  if (g.kind === "arc") return curvedWallOutline(w, w.thickness || 0, S.nodes);
  function corner(s) {
    var nx = -g.uz * s,
      nz = g.ux * s,
      ta = clampShift(faceShiftAt(w.a, g.ux, g.uz, s, w, h), lim),
      tb = clampShift(faceShiftAt(w.b, -g.ux, -g.uz, -s, w, h), lim);
    return [
      { x: g.a.x + g.ux * ta + nx * h, z: g.a.z + g.uz * ta + nz * h },
      { x: g.b.x - g.ux * tb + nx * h, z: g.b.z - g.uz * tb + nz * h },
    ];
  }
  var p = corner(1),
    m = corner(-1);
  return [p[0], p[1], m[1], m[0]];
}
/* A very shallow joint mitres to a spike; past the wall's own length the point
   is meaningless anyway, so the face is cut square there instead. */
function clampShift(t, lim) {
  return t > lim ? lim : t < -lim ? -lim : t;
}
function cutLimit(g) {
  return Math.max(0, (fin(g.L) ? g.L : 0) - 0.2);
}
/* The two end shifts of the wall's own measured face. The b end is entered
   from the opposite direction, and the same physical face is then on the
   opposite side of THAT direction — hence the two sign flips.

   Clamped by the SAME limit the outline uses, so the stated length always
   describes the wall that is actually drawn. Without it the two disagreed
   exactly where it hurts most: a joint a hair off straight divides half a
   thickness by sin(angle), and a 145 cm wall was handed a 145 cm end cut —
   drawn square, measured as if it had vanished. preserveClear() then believed
   the wall was a metre and a half short and physically stretched it. */
export function wallCuts(w) {
  var g = wallGeom(w),
    s = wallDimSide(w),
    h = (w.thickness || 0) / 2,
    lim = cutLimit(g),
    ta = g.kind === "arc" ? wallTangentAt(w, 0) : { x: g.ux, z: g.uz },
    tb = g.kind === "arc" ? wallTangentAt(w, g.L) : { x: g.ux, z: g.uz };
  return {
    a: clampShift(faceShiftAt(w.a, ta.x, ta.z, s, w, h), lim),
    b: clampShift(faceShiftAt(w.b, -tb.x, -tb.z, -s, w, h), lim),
  };
}
/* The wall's length as measured along its reference face — the number the plan
   labels, the inspector edits and the wall tool draws with. */
export function wallClearLength(w) {
  var gm = wallGeom(w),
    c = wallCuts(w);
  return Math.max(0, gm.L - c.a - c.b);
}
/* An opening's position along the wall, restated on the wall's REFERENCE FACE.

   `o.s` is a distance from the wall's start NODE, but every length the plan
   shows is measured along the face picked in "Measured along" — so a door
   dimensioned "80 from the corner" was not 80 from the finished face, and the
   number moved on its own whenever a neighbouring wall changed thickness. Both
   directions live here so the constraint solver and the labels agree. */
export function openFaceDist(w, s) {
  if (!w || !fin(s)) return s;
  return s - wallCuts(w).a;
}
export function openNodeDist(w, faceS) {
  if (!w || !fin(faceS)) return faceS;
  return faceS + wallCuts(w).a;
}

/* The same measurement for a wall that does not exist yet: the segment the
   wall tool is rubber-banding, from `fromNode` to `pt`. Its reference face is
   not chosen yet, so the concave side of the corner it grows out of is used —
   the same side autoDimSide() will pick the moment the wall is real. */
export function pendingCuts(fromNode, pt) {
  var a = S.nodes[fromNode];
  if (!a || !pt) return 0;
  var dx = pt.x - a.x,
    dz = pt.z - a.z,
    L = Math.hypot(dx, dz);
  if (L < 1) return 0;
  var ux = dx / L,
    uz = dz / L,
    side = pendingSide(fromNode, ux, uz);
  var cut = faceShiftAt(fromNode, ux, uz, side, null);
  var hit = nodeAtPoint(pt);
  if (hit != null && hit !== fromNode)
    cut += faceShiftAt(hit, -ux, -uz, -side, null);
  return cut;
}
function pendingSide(nodeId, ux, uz) {
  var nx = -uz,
    nz = ux,
    acc = 0;
  S.walls.forEach(function (ow) {
    var o = ow.a === nodeId ? ow.b : ow.b === nodeId ? ow.a : null;
    if (o == null) return;
    var p = S.nodes[nodeId],
      q = S.nodes[o];
    if (!p || !q) return;
    var dx = q.x - p.x,
      dz = q.z - p.z,
      L = Math.hypot(dx, dz) || 1;
    acc += (dx / L) * nx + (dz / L) * nz;
  });
  return acc < 0 ? -1 : 1;
}
// the corner standing on `pt`, if any — a click on top of an existing corner is
// that corner even before the plan has welded the two together
function nodeAtPoint(pt) {
  for (var i = 0; i < S.nodes.length; i++) {
    var n = S.nodes[i];
    if (n && Math.hypot(n.x - pt.x, n.z - pt.z) < 1 && nodeDegree(i) > 0)
      return i;
  }
  return null;
}
export function nodeDegree(i) {
  var n = 0;
  for (var k = 0; k < S.walls.length; k++)
    if (S.walls[k].a === i || S.walls[k].b === i) n++;
  return n;
}
/* Everything a corner knows about itself, for the inspector and the plan's
   hover card: which walls leave it, in which direction, and what the angles
   BETWEEN them are.

   Every arm angle is measured OUTGOING from this corner (the far end's
   bearing), which is the only convention under which the numbers between arms
   mean what they look like: 90° is a square corner, 180° a straight run
   through, and ~0° two walls lying on top of each other — the degenerate case
   the drafting snap refuses to aim at (see snapPoint) and the constraint
   engine flags after the fact. Arms come back sorted by angle so consecutive
   pairs are the gaps you actually see on the plan. */
export function jointInfo(ni) {
  var n = S.nodes[ni];
  if (!n) return null;
  var arms = [];
  S.walls.forEach(function (w) {
    var end = w.a === ni ? "a" : w.b === ni ? "b" : null;
    if (!end) return;
    var o = S.nodes[end === "a" ? w.b : w.a];
    if (!o) return;
    arms.push({
      wall: w,
      end: end,
      other: end === "a" ? w.b : w.a,
      ang: (Math.atan2(o.z - n.z, o.x - n.x) * 180) / Math.PI,
      len: wallClearLength(w),
    });
  });
  arms.sort(function (p, q) {
    return p.ang - q.ang;
  });
  var gaps = [];
  if (arms.length > 1)
    for (var i = 0; i < arms.length; i++) {
      var p = arms[i],
        q = arms[(i + 1) % arms.length];
      if (arms.length === 2 && i === 1) break; // a 2-arm corner has one gap
      var d = q.ang - p.ang;
      while (d < 0) d += 360;
      gaps.push({ a: p.wall, b: q.wall, deg: d });
    }
  return { node: ni, x: n.x, z: n.z, arms: arms, gaps: gaps, open: arms.length < 2 };
}

/* Outgoing directions (radians) of the walls already leaving this corner —
   what a new segment drawn from here must not be aimed straight along.

   `except` are node indices whose arms don't count, and it is what keeps this
   from blocking the very edit in progress: the corners taking part in the
   gesture (a dragged corner and its neighbours) are passed in, so dragging a
   corner ALONG its own wall — the ordinary way to lengthen one — stays legal,
   while folding that wall onto a different wall at the far corner does not. */
export function armAngles(ni, except) {
  var n = S.nodes[ni],
    out = [];
  if (!n) return out;
  S.walls.forEach(function (w) {
    var end = w.a === ni ? "a" : w.b === ni ? "b" : null;
    if (!end) return;
    var oi = end === "a" ? w.b : w.a;
    if (except && except.indexOf(oi) !== -1) return;
    var o = S.nodes[oi];
    if (!o) return;
    if (Math.hypot(o.x - n.x, o.z - n.z) < 1) return;
    out.push(Math.atan2(o.z - n.z, o.x - n.x));
  });
  return out;
}

export function usedNodes() {
  var s = {};
  S.walls.forEach(function (w) {
    s[w.a] = 1;
    s[w.b] = 1;
  });
  return s;
}

export function wallBounds() {
  var u = usedNodes(),
    minx = 1e9,
    minz = 1e9,
    maxx = -1e9,
    maxz = -1e9,
    any = false;
  for (var k in u) {
    var n = S.nodes[k];
    minx = Math.min(minx, n.x);
    maxx = Math.max(maxx, n.x);
    minz = Math.min(minz, n.z);
    maxz = Math.max(maxz, n.z);
    any = true;
  }
  S.walls.forEach(function (w) {
    wallOutline(w).forEach(function (n) {
      minx = Math.min(minx, n.x); maxx = Math.max(maxx, n.x);
      minz = Math.min(minz, n.z); maxz = Math.max(maxz, n.z); any = true;
    });
  });
  if (!any) return null;
  return {
    minx: minx,
    minz: minz,
    maxx: maxx,
    maxz: maxz,
    w: maxx - minx,
    d: maxz - minz,
  };
}
export function contentBounds() {
  var signature = boundsSignature();
  if (contentBoundsCache.sig === signature && contentBoundsCache.value)
    return contentBoundsCache.value;
  var u = usedNodes(),
    minx = 1e9,
    minz = 1e9,
    maxx = -1e9,
    maxz = -1e9,
    any = false;
  for (var k in u) {
    var n = S.nodes[k];
    if (!n || !fin(n.x) || !fin(n.z)) continue;
    minx = Math.min(minx, n.x);
    maxx = Math.max(maxx, n.x);
    minz = Math.min(minz, n.z);
    maxz = Math.max(maxz, n.z);
    any = true;
  }
  S.walls.forEach(function (w) {
    wallOutline(w).forEach(function (n) {
      if (!n || !fin(n.x) || !fin(n.z)) return;
      minx = Math.min(minx, n.x); maxx = Math.max(maxx, n.x);
      minz = Math.min(minz, n.z); maxz = Math.max(maxz, n.z); any = true;
    });
  });
  S.items.forEach(function (it) {
    if (!fin(it.x) || !fin(it.z) || !fin(it.w) || !fin(it.d)) return;
    var r = Math.max(it.w, it.d) / 2;
    minx = Math.min(minx, it.x - r);
    maxx = Math.max(maxx, it.x + r);
    minz = Math.min(minz, it.z - r);
    maxz = Math.max(maxz, it.z + r);
    any = true;
  });
  if (!any) {
    minx = 0;
    minz = 0;
    maxx = 400;
    maxz = 300;
  }
  var value = {
    minx: minx,
    minz: minz,
    maxx: maxx,
    maxz: maxz,
    cx: (minx + maxx) / 2,
    cz: (minz + maxz) / 2,
    w: maxx - minx,
    d: maxz - minz,
  };
  contentBoundsCache = { sig: signature, value: value };
  return value;
}

/* find closed loops / faces of the wall graph -> rooms */
/* Every closed cycle in the wall graph, whether or not the user wants it
   treated as a room. Walls carrying doors/windows still enclose — an opening
   is a hole in a wall, not a gap in the graph — so an enclosure counts either
   way, which is what makes auto-detection work.
   Use this only where you genuinely need the raw topology (metadata
   reconciliation, new-enclosure detection). Everything user-facing wants
   detectRooms() below. */
export function detectRoomCycles() {
  if (!S.walls.length) return [];
  var signature = topologySignature();
  if (roomCycleCache.sig === signature) return roomCycleCache.rooms;
  var he = [];
  S.walls.forEach(function (w) {
    he.push({ f: w.a, t: w.b, w: w });
    he.push({ f: w.b, t: w.a, w: w });
  });
  var idx = {};
  he.forEach(function (e, i) {
    idx[e.f + "_" + e.t] = i;
  });
  var out = {};
  he.forEach(function (e, i) {
    (out[e.f] = out[e.f] || []).push(i);
  });
  function ang(i) {
    var e = he[i],
      a = S.nodes[e.f],
      b = S.nodes[e.t];
    return Math.atan2(b.z - a.z, b.x - a.x);
  }
  for (var v in out)
    out[v].sort(function (p, q) {
      return ang(p) - ang(q);
    });
  function nxt(i) {
    var e = he[i],
      tw = idx[e.t + "_" + e.f];
    if (tw == null) return -1;
    var arr = out[e.t],
      k = arr.indexOf(tw);
    return arr[(k - 1 + arr.length) % arr.length];
  }
  var seen = new Array(he.length).fill(false),
    rooms = [];
  for (var s = 0; s < he.length; s++) {
    if (seen[s]) continue;
    var cyc = [],
      i = s,
      guard = 0;
    while (i >= 0 && !seen[i] && guard++ < 9999) {
      seen[i] = true;
      cyc.push(i);
      i = nxt(i);
      if (i === s) break;
    }
    if (cyc.length < 3) continue;
    var pts = [];
    cyc.forEach(function (k) {
      var edge = he[k], g = wallGeom(edge.w), steps = g.kind === "arc"
        ? Math.max(4, Math.ceil(Math.abs(g.curve.sweep) / (Math.PI / 18)))
        : 1;
      /* Both ends of every edge, not just the one it starts at: consecutive
         walls share a NODE, but a wall hung on its face has its own line half a
         thickness off that node, so the two lines meet in a small step rather
         than a point. Sampling only the start point cut every such corner off
         the room. On the centreline the two samples are the same corner twice,
         which the shoelace and the point-in-polygon test both ignore. */
      for (var si = 0; si <= steps; si++) {
        var t = si / steps,
          ss = edge.f === edge.w.a ? g.L * t : g.L * (1 - t),
          // the wall's OWN line, so a room bounded by face-located walls is the
          // room those walls actually enclose (area, floor, cost all follow)
          p = wallPointAt(edge.w, ss);
        if (!p) continue;
        // ...so the duplicate has to be dropped, or a plain rectangle would
        // report eight corners and everything counting them (roomRect, the
        // fillet tools) would stop recognising it
        var last = pts[pts.length - 1];
        if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.z - p.z) < 0.01)
          continue;
        pts.push({ x: p.x, z: p.z });
      }
    });
    // the cycle closes on itself, so the last sample repeats the first
    while (pts.length > 2) {
      var f = pts[0], l = pts[pts.length - 1];
      if (Math.abs(f.x - l.x) > 0.01 || Math.abs(f.z - l.z) > 0.01) break;
      pts.pop();
    }
    var A2 = 0,
      j;
    for (j = 0; j < pts.length; j++) {
      var p = pts[j],
        q = pts[(j + 1) % pts.length];
      A2 += p.x * q.z - q.x * p.z;
    }
    if (A2 > 50) {
      var A = A2 / 2,
        cx = 0,
        cz = 0,
        ch = 0,
        wids = [],
        nidx = cyc.map(function (k) {
          return he[k].f;
        });
      cyc.forEach(function (k) {
        ch = Math.max(ch, he[k].w.height);
        wids.push(he[k].w.id);
      });
      for (j = 0; j < pts.length; j++) {
        var p = pts[j],
          q = pts[(j + 1) % pts.length],
          cr = p.x * q.z - q.x * p.z;
        cx += (p.x + q.x) * cr;
        cz += (p.z + q.z) * cr;
      }
      cx /= 6 * A;
      cz /= 6 * A;
      var key = wids
        .slice()
        .sort(function (a, b) {
          return a - b;
        })
        .join(",");
      rooms.push({
        pts: pts,
        area: A,
        cx: cx,
        cz: cz,
        ceilH: ch || WALL_H,
        key: key,
        nidx: nidx,
      });
    }
  }
  roomCycleCache = { sig: signature, rooms: rooms };
  return rooms;
}

/* The rooms the app treats as rooms. An enclosure the user declined when it was
   auto-detected is marked `noRoom` and drops out here — which is the whole
   point of filtering at this single choke point: floors, the plan fill, name
   and area labels, the tree, the cost roll-up, MEP auto rough-in and
   auto-arrange all read through detectRooms(), so declining one place removes
   it everywhere without touching any of them. */
export function roomDeclined(key) {
  return !!(S.roomMeta[key] && S.roomMeta[key].noRoom);
}
export function detectRooms() {
  return detectRoomCycles().filter(function (r) {
    return !roomDeclined(r.key);
  });
}

/* Room metadata (name / floor / lock / hidden) is stored in `S.roomMeta` under a
   key made of the room's sorted bounding-wall ids. That key is not a stable
   identity: it changes whenever the SET of bounding walls changes, even if the
   room is geometrically identical. Deleting a wall and redrawing it in exactly
   the same place used to turn key "1,2,3,4" into "2,3,4,18" and silently drop
   the room's name, floor, lock and hidden state — with the old entry orphaned
   in state (and in every save) forever.

   Rather than re-key the whole model, each room with metadata carries its last
   known centroid (`cx`/`cz`). After a structural edit, an orphaned entry is
   handed to whichever current room still contains that point and has no
   metadata of its own. Geometry-preserving edits therefore keep their metadata,
   and genuine splits/merges fall through to defaults as before.

   Orphans that match nothing are deliberately KEPT: a delete-then-redraw passes
   through a transient state where the room does not exist, and pruning there
   would destroy exactly the data this is meant to save. Real deletions are
   cleaned up by deleteRoom(), which removes the entry outright. */
export function reconcileRoomMeta(rooms) {
  // raw cycles, so a DECLINED enclosure keeps its `noRoom` mark across wall
  // edits instead of resurfacing as a fresh prompt every time
  rooms = rooms || detectRoomCycles();
  var live = {};
  rooms.forEach(function (r) {
    live[r.key] = r;
  });
  var orphans = Object.keys(S.roomMeta).filter(function (k) {
    return !live[k];
  });
  if (orphans.length) {
    // only rooms that don't already carry metadata may adopt an orphan
    var free = rooms.filter(function (r) {
      return !S.roomMeta[r.key];
    });
    orphans.forEach(function (k) {
      var m = S.roomMeta[k];
      if (!m || !fin(m.cx) || !fin(m.cz)) return;
      for (var i = 0; i < free.length; i++) {
        if (free[i] && pointInPoly(m.cx, m.cz, free[i].pts)) {
          S.roomMeta[free[i].key] = m;
          delete S.roomMeta[k];
          free[i] = null; // one adopter per orphan
          break;
        }
      }
    });
  }
  // refresh every live room's centroid so the NEXT structural edit can match
  rooms.forEach(function (r) {
    var m = S.roomMeta[r.key];
    if (m) {
      m.cx = r.cx;
      m.cz = r.cz;
    }
  });
  /* An identity for the room that outlives its key. The key is a list of
     bounding walls, so it changes on every wall edit — fine for looking a room
     up right now, useless for saying "these two entries are the same room",
     which is exactly what the history tree has to say to keep a room's edits
     on one thread. The adoption above hands the whole metadata object over, so
     an id living inside it crosses re-keying for free. */
  Object.keys(S.roomMeta).forEach(function (k) {
    var m = S.roomMeta[k];
    if (m && !m.hid) m.hid = "r" + uid();
  });
  return rooms;
}

/* Repairs that keep the model self-consistent after a structural edit.
   Called from the same place as reconcileRoomMeta (refreshTree), i.e. after an
   edit settles rather than on every frame of a drag. */
export function normalizeStructure() {
  // An opening rides its wall by parametric distance `s`, which nothing used to
  // revisit when the wall changed. Dragging a corner so a 400cm wall became
  // 120cm left its door at s=360 — 280cm past the end, where the 3D builder
  // silently skipped it while the plan still claimed a door was there.
  // Clamp so the data matches what actually gets drawn.
  S.openings.forEach(function (o) {
    var w = wallById(o.wall);
    if (!w) return;
    var L = wallGeom(w).L;
    if (!fin(L) || L <= 0) return;
    if (o.width > L) o.width = L; // a door can't be wider than its wall
    o.s = clamp(o.s, o.width / 2, Math.max(o.width / 2, L - o.width / 2));
  });

  // Deleting group members down to one leaves a "group" of one, which behaves
  // like a lone item but keeps re-selecting itself as a group. Drop the marker.
  var count = {};
  S.items.forEach(function (it) {
    if (it.groupId) count[it.groupId] = (count[it.groupId] || 0) + 1;
  });
  S.items.forEach(function (it) {
    if (it.groupId && count[it.groupId] < 2) delete it.groupId;
  });
}

export function roomFloor(key) {
  return (S.roomMeta[key] && S.roomMeta[key].floor) || S.floorTex;
}
export function roomName(key) {
  return (S.roomMeta[key] && S.roomMeta[key].name) || "";
}
export function roomHidden(key) {
  return !!(S.roomMeta[key] && S.roomMeta[key].hidden);
}
// Cheap pre-check: hiding is rare, so every consumer can skip the work below
// when nothing is hidden. Reads roomMeta only — no room detection.
export function anyRoomHidden() {
  for (var k in S.roomMeta) if (S.roomMeta[k].hidden) return true;
  return false;
}
/* What a hidden room takes out of the views, computed from ONE detectRooms()
   pass: the items standing inside it, and the walls used *only* by hidden rooms
   — a wall shared with a visible room still bounds that room, so it stays.
   Returns { items:{id:1}, walls:{id:1} }; both empty when nothing is hidden. */
export function hiddenSets(rooms) {
  var res = { items: {}, walls: {} };
  if (!anyRoomHidden()) return res;
  rooms = rooms || detectRooms();
  var hid = rooms.filter(function (r) {
    return roomHidden(r.key);
  });
  if (!hid.length) return res;
  var vis = {};
  rooms.forEach(function (r) {
    if (roomHidden(r.key)) return;
    r.key.split(",").forEach(function (id) {
      vis[id] = 1;
    });
  });
  hid.forEach(function (r) {
    r.key.split(",").forEach(function (id) {
      if (!vis[id]) res.walls[id] = 1;
    });
  });
  S.items.forEach(function (it) {
    for (var i = 0; i < hid.length; i++)
      if (pointInPoly(it.x, it.z, hid[i].pts)) {
        res.items[it.id] = 1;
        return;
      }
  });
  return res;
}
export function roomByKey(key) {
  var rs = detectRooms();
  for (var i = 0; i < rs.length; i++) if (rs[i].key === key) return rs[i];
  return null;
}
export function pointInPoly(x, z, pts) {
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
export function itemsInRoom(r) {
  return S.items.filter(function (it) {
    return pointInPoly(it.x, it.z, r.pts);
  });
}

export function distSeg(px, pz, ax, az, bx, bz) {
  var dx = bx - ax,
    dz = bz - az,
    l2 = dx * dx + dz * dz;
  if (l2 < 1) return Math.hypot(px - ax, pz - az);
  var t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
export function snapAdj(edges, cands, thr) {
  var best = 0,
    bd = thr,
    i,
    j;
  for (i = 0; i < edges.length; i++)
    for (j = 0; j < cands.length; j++) {
      var dd = cands[j] - edges[i];
      if (Math.abs(dd) < bd) {
        bd = Math.abs(dd);
        best = dd;
      }
    }
  return best;
}

export function rayIntersect(px, pz, dx, dz, ax, az, bx, bz) {
  var denom = dx * (bz - az) - dz * (bx - ax);
  if (Math.abs(denom) < 1e-6) return null;
  var t = ((ax - px) * (bz - az) - (az - pz) * (bx - ax)) / denom;
  var u = ((ax - px) * dz - (az - pz) * dx) / denom;
  if (t > 0 && u >= 0 && u <= 1) return t;
  return null;
}

/* Wall junction rules (split out of js/geometry.js; it shares the editor's
   state through live imports from ./geometry.js).

   Three things are kept apart here:
   - the FACE MEETING POINT (faceMeetShift): where a wall's face line meets the
     neighbour's face line, the mitre arithmetic. Every measurement uses it, so
     no stated length depends on how a corner is built (the clear length
     reads it through faceClearShift, which also stops at an arm standing on
     the measured side of a straight-through joint);
   - the JUNCTION RULE (junctionRole): at a two-arm corner, the same assembly
     wraps (mitre, seam hidden on the plan), different assemblies give the
     stronger wall the corner ("owner") and square the other against it
     ("butt"); a manual `w.join[end]` sets the pair;
   - the face shifts the drawn/built outline uses (faceShiftAt).
   No three, no DOM. */
import { S } from "./state.js";
import {
  jointContext, straightThroughAt, wallNodeGeom, wallOffsetVec, wallSolidAtNode, wallSolidTop,
} from "./geometry.js";
import { BUILTIN_WALL_TYPES, wallPhase } from "./wall_types.js";
import { normalizeWallKind } from "./wall_curves.js";

/* The face meeting point, for MEASURING: how far the face on `side` of a
   segment leaving `nodeId` in direction (ux,uz) starts after the node, as the
   mitre of the two face lines. A manual join never moves it (it changes what
   is built, not where a visible face ends). */
export function faceMeetShift(nodeId, ux, uz, side, except, myHalf, atHeight, context) {
  if (!side) return 0;
  context ||= jointContext([nodeId]);
  if (straightThroughAt(nodeId, ux, uz, except, atHeight, context)) return 0;
  return meetLines(nodeId, ux, uz, side, except, myHalf || 0, atHeight, context, "wrap");
}

/* The face meeting point for the CLEAR LENGTH (wallCuts, pendingCuts): the
   tape stops where the visible face stops. That is faceMeetShift everywhere
   except at a straight-through joint, where the face runs on unless another
   arm stands on the MEASURED side: then the face stops at that arm's near face
   line (oblique arms included; of several, the one reaching furthest along the
   face wins). An arm on the far side, or none, leaves the cut at 0, so adding
   a wall beyond a node never changes the reading of a face it does not touch.
   The sheet's dimension chains keep faceMeetShift (context.measure), where a
   through-run must stay one continuous line. */
export function faceClearShift(nodeId, ux, uz, side, except, myHalf, atHeight, context) {
  if (!side) return 0;
  context ||= jointContext([nodeId]);
  var mode = straightThroughAt(nodeId, ux, uz, except, atHeight, context) ? "clear" : "wrap";
  return meetLines(nodeId, ux, uz, side, except, myHalf || 0, atHeight, context, mode);
}

/* How far the face on `side` of a segment leaving `nodeId` in direction
   (ux,uz) starts AFTER the node (positive) or BEFORE it (negative) in the
   OUTLINE, given the other walls standing at that corner. Half the
   neighbour's thickness, divided by sin of the angle between them (a shallow
   joint eats more), signed by whether the neighbour leans toward that face or
   away from it. Walls running straight on (a split wall) are not corners and
   are skipped. At a two-arm corner the junction rule picks the face line
   (junctionRole); with three or more arms the old rule stands, and of
   multiple neighbours the one that eats most wins. */
export function faceShiftAt(nodeId, ux, uz, side, except, myHalf, atHeight, context) {
  if (!side) return 0;
  context ||= jointContext([nodeId]);
  if (context.measure) return faceMeetShift(nodeId, ux, uz, side, except, myHalf, atHeight, context);
  var hm = myHalf || 0,
    role = except ? junctionRole(except, nodeId, atHeight, context) : null;
  if (role) return meetLines(nodeId, ux, uz, side, except, hm, atHeight, context, role);
  /* Both walls' lines used to pass through the shared node, so the joint was
     decided by thicknesses and the angle alone. With location lines they no
     longer do, and every intersection below picks up ONE extra term: the
     lateral gap between the two lines, seen along the neighbour's direction.
     At `loc: "center"` this is 0 and the arithmetic is bit-identical. */
  var vMe = wallOffsetVec(except),
    manualJoin = manualJoinAt(except, nodeId);
  if (manualJoin === "through") {
    var throughExtension = 0;
    (context.arms.get(nodeId) || []).forEach(function (ow) {
      if (ow === except || !wallSolidAtNode(ow, nodeId, atHeight, context)) return;
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
    (context.arms.get(nodeId) || []).forEach(function (ow) {
      if (ow === except || !wallSolidAtNode(ow, nodeId, atHeight, context)) return;
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
  if (manualJoin !== "miter" && manualJoin !== "mitre" && straightThroughAt(nodeId, ux, uz, except, atHeight, context)) return 0;
  return meetLines(nodeId, ux, uz, side, except, hm, atHeight, context, "wrap");
}
/* Where this face line meets the neighbours' face lines. `mode` picks which of
   each neighbour's two face lines: "wrap" is the mitre (the far line on the
   convex side, the near one on the concave side), "owner" runs both faces to
   the far line, "butt" stops both on the near line; "clear" (a straight-through
   joint, see faceClearShift) is "wrap" for the arms on the measured side only. */
function meetLines(nodeId, ux, uz, side, except, hm, atHeight, context, mode) {
  var nx = -uz * side,
    nz = ux * side,
    best = null,
    vMe = wallOffsetVec(except);
  (context.arms.get(nodeId) || []).forEach(function (ow) {
    if (ow === except || !wallSolidAtNode(ow, nodeId, atHeight, context)) return;
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
      concave = dx * nx + dz * nz > 0;
    if (mode === "clear" && !concave) return;
    var far = mode === "owner" || (mode === "wrap" && !concave),
      shift = far ? Math.min(t1, t2) : Math.max(t1, t2);
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

function manualJoinAt(w, nodeId) {
  var end = w && w.a === nodeId ? "a" : w && w.b === nodeId ? "b" : null;
  return end && w.join ? w.join[end] : null;
}
// a manual join value as the role it claims for its own wall
function manualRole(w, nodeId) {
  var m = manualJoinAt(w, nodeId);
  return m === "miter" || m === "mitre" ? "wrap" : m === "through" ? "owner" : m === "butt" ? "butt" : null;
}

/* The role of `w` at `nodeId`: "wrap" | "owner" | "butt" at a corner of
   exactly two solid straight arms at an angle; null everywhere else (a free
   end, a split wall, a T or crossing, a curved arm), where the old rule
   stands. Decided once per node for both arms, so the pair always agrees. */
export function junctionRole(w, nodeId, atHeight, context) {
  if (!w || (w.a !== nodeId && w.b !== nodeId)) return null;
  context ||= jointContext([nodeId]);
  var roles = cornerRoles(nodeId, atHeight, context);
  return roles ? roles.get(w) || null : null;
}
function cornerRoles(nodeId, atHeight, context) {
  var cache = context.roles || (context.roles = new Map()),
    key = nodeId + "|" + (atHeight == null ? "" : atHeight);
  if (!cache.has(key)) cache.set(key, resolveCorner(nodeId, atHeight, context));
  return cache.get(key);
}
function resolveCorner(nodeId, atHeight, context) {
  var arms = [];
  (context.arms.get(nodeId) || []).forEach(function (ow) {
    if (!wallSolidAtNode(ow, nodeId, atHeight, context)) return;
    var d = armDir(ow, nodeId);
    if (d) arms.push({ wall: ow, d: d });
  });
  if (arms.length !== 2) return null;
  var w0 = arms[0].wall, w1 = arms[1].wall;
  if (w0 === w1 || isArc(w0) || isArc(w1)) return null;
  if (Math.abs(arms[0].d.x * arms[1].d.z - arms[0].d.z * arms[1].d.x) < 0.08) return null; // in line: R1
  var pair = cornerPair(w0, w1, nodeId), out = new Map();
  out.set(w0, pair[0]);
  out.set(w1, pair[1]);
  return out;
}
/* [role of w0, role of w1]. A manual value on one wall sets the pair; two
   conflicting manual values: the wall the automatic rule would favour keeps
   its own. Otherwise the same assembly wraps and different ones are ranked. */
function cornerPair(w0, w1, nodeId) {
  var m0 = manualRole(w0, nodeId), m1 = manualRole(w1, nodeId);
  function claim(i, m) {
    if (m === "wrap") return ["wrap", "wrap"];
    var theirs = m === "owner" ? "butt" : "owner";
    return i === 0 ? [m, theirs] : [theirs, m];
  }
  if (m0 && m1) {
    var c0 = claim(0, m0), c1 = claim(1, m1);
    if (c0[0] === c1[0] && c0[1] === c1[1]) return c0;
    return ownerOrder(w0, w1) > 0 ? c0 : c1;
  }
  if (m0) return claim(0, m0);
  if (m1) return claim(1, m1);
  if (sameAssembly(w0, w1, nodeId)) return ["wrap", "wrap"];
  return ownerOrder(w0, w1) > 0 ? ["owner", "butt"] : ["butt", "owner"];
}
function armDir(w, nodeId) {
  var other = w.a === nodeId ? w.b : w.b === nodeId ? w.a : null;
  if (other == null) return null;
  var p = S.nodes[nodeId], q = S.nodes[other];
  if (!p || !q) return null;
  var dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
  return L < 1 ? null : { x: dx / L, z: dz / L };
}
function isArc(w) {
  return wallNodeGeom(w).kind === "arc";
}

/* ---- assemblies ---------------------------------------------------------- */

/* The wall's layers from side -1 to side +1 of its a->b direction, read
   without normalising (and so without writing to) the wall: its own layer
   override, else its type from the project catalogue or the built-ins, else
   one generic core as thick as the wall. A legacy wall with no type whose
   thickness is not the generic type's is that one core, as normalizeWall
   would make it. */
export function wallAssemblyLayers(w) {
  if (!w) return [];
  var layers = Array.isArray(w.layers) && w.layers.length ? w.layers : null;
  if (!layers) {
    var id = typeof w.wallTypeId === "string" ? w.wallTypeId : null,
      type = (id && findType(S.wallTypes, id)) || (id && findType(BUILTIN_WALL_TYPES, id)) || null;
    if (!type) {
      var generic = findType(S.wallTypes, "generic") || findType(BUILTIN_WALL_TYPES, "generic"),
        gl = (generic && generic.layers) || [],
        gt = gl.reduce(function (s, l) { return s + (+l.thickness || 0); }, 0),
        t = +w.thickness || 0;
      layers = t > 0 && Math.abs(t - gt) > 1e-9
        ? [{ thickness: t, material: "generic-masonry", role: "core", main: true, structural: true }]
        : gl;
    } else layers = type.layers || [];
  }
  var reversed = !!(w.layersReversed ?? w.reverseLayers);
  return reversed ? layers.slice().reverse() : layers.slice();
}
function findType(list, id) {
  return Array.isArray(list) ? list.find(function (t) { return t && t.id === id; }) || null : null;
}
export function wallAssemblyMain(w) {
  var layers = wallAssemblyLayers(w);
  return layers.find(function (l) { return l && l.main; }) ||
    layers.find(function (l) { return l && l.structural; }) ||
    layers.reduce(function (best, l) { return !best || (+l.thickness || 0) > (+best.thickness || 0) ? l : best; }, null);
}

/* What a layer is made of, for drawing and ranking: "concrete" | "masonry" |
   "insulation" | "membrane" | "finish". The sheet's hatch (bandKind in
   js/drawing_sheet/hatches.js) refines "masonry" into partition/masonry. */
export function layerMaterialKind(material, role) {
  var m = String(material || "").toLowerCase(), r = String(role || "");
  if (r === "glazing" || /glass/.test(m)) return "finish";
  if (r === "insulation" || /insulat|mineral-wool|wool|eps|xps|pir/.test(m)) return "insulation";
  if (/membrane|waterproof/.test(m)) return "membrane";
  if (r.indexOf("finish") === 0 || /plaster|render|gypsum|board|tile|paint|cladding/.test(m)) return "finish";
  if (/stud|cavity|air/.test(m)) return "finish";
  if (/concrete/.test(m) && !/block/.test(m)) return "concrete";
  return "masonry";
}
/* The core class of a wall's main layer: "concrete" > "masonry" > "light". */
export function wallCoreClass(w) {
  var main = wallAssemblyMain(w), k = main ? layerMaterialKind(main.material, main.role) : "masonry";
  return k === "concrete" || k === "masonry" ? k : "light";
}
const CORE_RANK = { concrete: 2, masonry: 1, light: 0 };
const PHASE_RANK = { existing: 2, new: 1, demolition: 0 };

/* The wall's layers read across the joint in one physical direction: from the
   left of the direction it leaves `nodeId` in, to its right. Layers are listed
   from side -1 to side +1 of a->b, and side +1 is the left of a->b. */
function layersLeftToRight(w, nodeId) {
  var layers = wallAssemblyLayers(w);
  return w.a === nodeId ? layers.reverse() : layers;
}
/* Same assembly at a joint: same kind, phase and solid top, and the same
   layers (material and thickness) read from the corner's outer side to its
   inner side. One arm is read left to right of the way it leaves the node;
   across the joint the same physical side is the other arm's right, so its
   list is compared reversed (this holds for an L and a split wall alike). */
export function sameAssembly(w0, w1, nodeId) {
  if (!w0 || !w1) return false;
  if (normalizeWallKind(w0) !== normalizeWallKind(w1)) return false;
  if (wallPhase(w0) !== wallPhase(w1)) return false;
  if (Math.abs(wallSolidTop(w0) - wallSolidTop(w1)) > 1e-6) return false;
  var l0 = layersLeftToRight(w0, nodeId), l1 = layersLeftToRight(w1, nodeId).reverse();
  if (l0.length !== l1.length) return false;
  for (var i = 0; i < l0.length; i++) {
    if (String(l0[i].material || "") !== String(l1[i].material || "")) return false;
    if (Math.abs((+l0[i].thickness || 0) - (+l1[i].thickness || 0)) > 1e-6) return false;
  }
  return true;
}
/* > 0 when `a` owns a corner shared with `b`, < 0 when `b` does. The first
   difference decides: phase (existing over new; a wall being demolished never
   owns), core material, structural main layer, thickness, length, and the
   lower id only so the answer is deterministic. */
export function ownerOrder(a, b) {
  var d = (PHASE_RANK[wallPhase(a)] ?? 1) - (PHASE_RANK[wallPhase(b)] ?? 1);
  if (d) return d;
  d = CORE_RANK[wallCoreClass(a)] - CORE_RANK[wallCoreClass(b)];
  if (d) return d;
  var ma = wallAssemblyMain(a), mb = wallAssemblyMain(b);
  d = (ma && ma.structural ? 1 : 0) - (mb && mb.structural ? 1 : 0);
  if (d) return d;
  d = (+a.thickness || 0) - (+b.thickness || 0);
  if (Math.abs(d) > 1e-6) return d;
  d = nodeLength(a) - nodeLength(b);
  if (Math.abs(d) > 1e-6) return d;
  return compareIds(b.id, a.id);
}
function nodeLength(w) {
  var p = S.nodes[w.a], q = S.nodes[w.b];
  return p && q ? Math.hypot(q.x - p.x, q.z - p.z) : 0;
}
function compareIds(x, y) {
  var nx = Number(x), ny = Number(y);
  if (isFinite(nx) && isFinite(ny) && nx !== ny) return nx - ny;
  var sx = String(x), sy = String(y);
  return sx < sy ? -1 : sx > sy ? 1 : 0;
}

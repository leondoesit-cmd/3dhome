/* Explicit wall constraints: distances and angles measured from OTHER points.
   ---------------------------------------------------------------------------
   constraint_engine.js already holds each wall's OWN length and angle. That is
   a self-measurement, and it cannot express the dimensions a real drawing is
   actually built from — "this corner is 240 from that one", "this joint opens
   at 135°", "this partition runs parallel to the facade at 120". Those relate
   two pieces of geometry, so they live here, in a list the user builds by hand.

   Three rules shape everything below.

   1. ANCHORS ARE NEVER NODE INDICES. S.nodes is an array whose slots welding
      reuses, so a constraint keyed on index 7 silently jumps to an unrelated
      corner the first time two corners merge. An anchor is (wall id + which
      end) or (marker id) — both survive welds, splits and reorders.
   2. THE SOLVER MOVES ONE SIDE ONLY. Every constraint names what it holds
      still; the other side is what gets driven. Without that, two constraints
      sharing a corner fight and the plan crawls across the screen.
   3. NOTHING IS AUTO-REPAIRED WHEN IT CANNOT BE SATISFIED. A constraint whose
      geometry is gone, or that the wall locks refuse to give way to, reports
      itself in the inspector and stays visibly out — same bargain the rest of
      the constraint engine strikes with the user. */
import { S, fin, uid } from "./state.js";
import { wallById, wallGeom, wallClearLength, wallCuts, openFaceDist, openNodeDist } from "./geometry.js";
import {
  snapshotNodes, enforceLocks, relaxLocks, wouldReleaseJoint, settleWallDim, syncClears, syncLocks,
} from "./constraint_engine.js";
import { getDomainUnit } from "./unit_settings.js";

/* Satisfied to within this and the constraint is green. Well under what anyone
   draws by hand, well over what rounding a corner through a rotation costs. */
export const CON_TOL_L = 0.3; // cm
export const CON_TOL_A = 0.15; // degrees
// how many relaxation sweeps before we accept whatever we have. Constraints
// interact through shared corners, so one pass is not enough; a plan that
// cannot converge (a contradictory pair) must still not hang the drag.
const PASSES = 12;

export function wallCons() {
  if (!Array.isArray(S.wallCons)) S.wallCons = [];
  prepareStableAnchors();
  return S.wallCons;
}

/* ---- anchors ------------------------------------------------------------ */

/* {k:"node", id:<persistent vertex id>, wall?, end?} -> a structural corner.
   {k:"wall", id, end:"a"|"b"} -> legacy wall-end anchor, upgraded on read.
   {k:"marker", id}            -> a placeholder reference point (markers.js).
   Markers are DATUMS: the solver reads them and never moves them, which is the
   whole reason to measure from one. */
export function anchorNode(an) {
  if (!an) return null;
  if (an.k === "marker") return null;
  if (an.k === "node") {
    ensureNodeIds();
    for (var i = 0; i < S.nodes.length; i++)
      if (S.nodes[i] && S.nodes[i].vid === an.id) return i;
    return null;
  }
  var w = wallById(an.id);
  if (!w) return null;
  var ni = an.end === "b" ? w.b : w.a;
  return S.nodes[ni] ? ni : null;
}
export function anchorPos(an) {
  if (!an) return null;
  if (an.k === "marker") {
    var m = (S.markers || []).find(function (q) {
      return q.id === an.id;
    });
    return m ? { x: m.x, z: m.z } : null;
  }
  var ni = anchorNode(an);
  return ni == null ? null : { x: S.nodes[ni].x, z: S.nodes[ni].z };
}
/* A marker is a datum and a pinned corner is a datum the user declared. Both
   answer "no" here, so addDistance and friends put their `hold` on the side
   that actually can move instead of quietly authoring a constraint the solver
   will never satisfy. */
export function anchorMovable(an) {
  var ni = anchorNode(an);
  return ni != null && !isPinned(ni);
}
/* Human name for an anchor, for the inspector rows. A marker's own name beats
   its id; a wall end is "W12·A", which matches how the plan labels walls. */
export function anchorLabel(an) {
  if (!an) return "?";
  if (an.k === "marker") {
    var m = (S.markers || []).find(function (q) {
      return q.id === an.id;
    });
    return (m && m.name) || "P" + an.id;
  }
  if (an.k === "node") {
    if (an.wall != null)
      return "W" + an.wall + "·" + (an.end === "b" ? "B" : "A");
    return "V" + String(an.id).replace(/^v/, "");
  }
  return "W" + an.id + "·" + (an.end === "b" ? "B" : "A");
}

/* Node array positions are implementation details and may change after welds,
   imports and cleanup. Every structural point therefore receives a persistent
   vertex id. Old projects are upgraded lazily without changing coordinates. */
export function ensureNodeIds() {
  S.nodes.forEach(function (n) {
    if (n && n.vid == null) n.vid = "v" + uid();
  });
}

export function nodeAnchor(ni, wall, end) {
  ensureNodeIds();
  var n = S.nodes[ni];
  if (!n) return null;
  var out = { k: "node", id: n.vid };
  if (wall != null) out.wall = typeof wall === "object" ? wall.id : wall;
  if (end === "a" || end === "b") out.end = end;
  return out;
}

function stableAnchor(an) {
  if (!an || an.k === "marker" || an.k === "node") return an;
  if (an.k !== "wall") return an;
  var w = wallById(an.id);
  if (!w) return an;
  return nodeAnchor(an.end === "b" ? w.b : w.a, w.id, an.end === "b" ? "b" : "a");
}

function stableSector(sec) {
  if (!sec) return sec;
  sec.joint = stableAnchor(sec.joint);
  return sec;
}

/* Upgrade every legacy wall-end reference before topology is edited. This is
   deliberately exported so split/weld operations can call it before changing
   wall endpoints; upgrading afterwards would preserve the wrong corner. */
export function prepareStableAnchors() {
  if (!Array.isArray(S.wallCons)) return;
  ensureNodeIds();
  S.wallCons.forEach(function (c) {
    if (c.a) c.a = stableAnchor(c.a);
    if (c.b) c.b = stableAnchor(c.b);
    if (c.point) c.point = stableAnchor(c.point);
    if (c.joint) c.joint = stableAnchor(c.joint);
    if (c.referenceAngle) c.referenceAngle = stableSector(c.referenceAngle);
    if (c.drivenAngle) c.drivenAngle = stableSector(c.drivenAngle);
  });
}

/* Repoint persistent constraints when two topology vertices are welded. */
export function mergeAnchorNodes(keepIndex, fromIndex) {
  prepareStableAnchors();
  var keep = S.nodes[keepIndex], from = S.nodes[fromIndex];
  if (!keep || !from || keep.vid === from.vid) return;
  function rep(an) {
    if (an && an.k === "node" && an.id === from.vid) an.id = keep.vid;
  }
  S.wallCons.forEach(function (c) {
    rep(c.a); rep(c.b); rep(c.point); rep(c.joint);
    if (c.referenceAngle) rep(c.referenceAngle.joint);
    if (c.drivenAngle) rep(c.drivenAngle.joint);
  });
}

export function rehomeAnchorOwner(nodeIndex, fromWallId, toWallId, toEnd) {
  prepareStableAnchors();
  var n = S.nodes[nodeIndex];
  if (!n) return;
  function fix(an) {
    if (an && an.k === "node" && an.id === n.vid && an.wall === fromWallId) {
      an.wall = toWallId;
      an.end = toEnd;
    }
  }
  S.wallCons.forEach(function (c) {
    fix(c.a); fix(c.b); fix(c.point); fix(c.joint);
    if (c.referenceAngle) fix(c.referenceAngle.joint);
    if (c.drivenAngle) fix(c.drivenAngle.joint);
  });
}

/* The anchor for the corner of `w` nearest (px,pz) — how a click in the plan
   becomes a constraint target. */
export function anchorAtWallEnd(w, px, pz) {
  if (!w) return null;
  var a = S.nodes[w.a],
    b = S.nodes[w.b];
  if (!a || !b) return null;
  var da = Math.hypot(px - a.x, pz - a.z),
    db = Math.hypot(px - b.x, pz - b.z);
  var end = da <= db ? "a" : "b";
  return nodeAnchor(end === "a" ? w.a : w.b, w.id, end);
}
// two anchors that resolve to the same corner are the same point, however
// differently they are spelled — a zero-length distance is not a constraint
function sameSpot(p, q) {
  return p && q && Math.hypot(p.x - q.x, p.z - q.z) < 0.001;
}
function anchorKey(an) {
  if (!an) return "?";
  return an.k === "marker" ? "m:" + an.id : an.k === "node" ? "n:" + an.id : "w:" + an.id + ":" + an.end;
}
function sectorKey(sec) {
  return sec ? anchorKey(sec.joint) + ":" + sec.w1 + ":" + sec.w2 : "?";
}
function relationKey(c) {
  if (["dist", "alignX", "alignZ", "axisDistX", "axisDistZ", "coincident"].indexOf(c.type) !== -1)
    return c.type + ":" + [anchorKey(c.a), anchorKey(c.b)].sort().join("|");
  if (c.type === "fixed") return c.type + ":" + anchorKey(c.a);
  if (c.type === "symmetric")
    return c.type + ":" + [anchorKey(c.a), anchorKey(c.b)].sort().join("|") +
      ":" + c.axis.k + c.axis.id;
  if (c.type === "angle") return c.type + ":" + anchorKey(c.joint) + ":" + c.w1 + ":" + c.w2;
  if (c.type === "equalAngle") return c.type + ":" + sectorKey(c.referenceAngle) + "|" + sectorKey(c.drivenAngle);
  if (c.type === "pointWallDist" || c.type === "midpoint" || c.type === "pointOnLine")
    return c.type + ":" + anchorKey(c.point) + ":" + c.ref;
  if (c.type === "equalSpacing" || c.type === "equalLengthSet")
    return c.type + ":" + c.walls.slice().sort().join(",");
  if (c.type === "openCentre") return c.type + ":" + c.opening;
  if (c.type === "openDist") return c.type + ":" + c.opening + ":" + c.end;
  if (c.type === "openAlign")
    return c.type + ":" + [c.a, c.b].sort().join("|") + ":" + c.axis;
  if (c.type === "openSpacing")
    return c.type + ":" + c.openings.slice().sort().join(",");
  return c.type + ":" + c.wall + ":" + (c.ref == null ? "" : c.ref);
}
function addUnique(c) {
  var key = relationKey(c);
  if (wallCons().some(function (old) { return relationKey(old) === key; })) return null;
  wallCons().push(c); return c;
}

/* ---- authoring ---------------------------------------------------------- */

/* Distance between two anchors. `hold` names the anchor that stays put; the
   other one's corner slides along the line between them. Defaults to holding
   `a`, and flips automatically when only one side CAN move. */
export function addDistance(a, b, value, hold) {
  a = stableAnchor(a);
  b = stableAnchor(b);
  var pa = anchorPos(a),
    pb = anchorPos(b);
  if (!pa || !pb || sameSpot(pa, pb)) return null;
  if (!anchorMovable(a) && !anchorMovable(b)) return null; // two datums
  var h = hold === "b" ? "b" : "a";
  if (h === "a" && !anchorMovable(b)) h = "b";
  if (h === "b" && !anchorMovable(a)) h = "a";
  var c = {
    id: uid(),
    type: "dist",
    a: a,
    b: b,
    hold: h,
    value: fin(value) && value > 0 ? value : Math.hypot(pb.x - pa.x, pb.z - pa.z),
  };
  return addUnique(c);
}

/* Angle at a joint, measured from `w1` to `w2` (both walls must touch the
   joint corner). `w1` is held; `w2` swings about the joint. Stored as the
   absolute opening in degrees, 0-360, so a reflex corner is expressible. */
export function addJointAngle(jointAnchor, w1Id, w2Id, value) {
  jointAnchor = stableAnchor(jointAnchor);
  var ni = anchorNode(jointAnchor);
  if (ni == null) return null;
  var w1 = wallById(w1Id),
    w2 = wallById(w2Id);
  if (!w1 || !w2 || w1 === w2) return null;
  if (!touchesNode(w1, ni) || !touchesNode(w2, ni)) return null;
  var cur = jointAngleNow(ni, w1, w2);
  var c = {
    id: uid(),
    type: "angle",
    joint: jointAnchor,
    w1: w1Id,
    w2: w2Id,
    value: fin(value) ? norm360(value) : cur,
  };
  return addUnique(c);
}

/* Author (or re-state) the numeric angle of one corner. The wall-pick tool
   uses addJointAngle(), where a duplicate correctly means "already exists";
   direct entry in the corner inspector is different — typing a new number is
   an edit of that existing dimension. `keepConnected` opts this constraint
   into the topology-preserving relaxation path below. */
export function setJointAngleTarget(sector, value, allowLengthChange) {
  sector = stableSector(sector);
  if (!sectorValid(sector) || !fin(value)) return null;
  var key = anchorKey(sector.joint), c = wallCons().find(function (q) {
    return q.type === "angle" && anchorKey(q.joint) === key &&
      q.w1 === sector.w1 && q.w2 === sector.w2;
  });
  if (!c) c = addJointAngle(sector.joint, sector.w1, sector.w2, value);
  if (!c) return null;
  c.value = norm360(value);
  c.report = false;
  c.keepConnected = true;
  c.allowLengthChange = !!allowLengthChange;
  return c;
}

/* Keep `wallId` parallel to `refId` at a fixed perpendicular distance, sign
   included — the sign is which SIDE of the reference it sits on, so a corridor
   does not flip to the other side of the wall it was measured from. */
export function addOffset(wallId, refId, value) {
  var w = wallById(wallId),
    r = wallById(refId);
  if (!w || !r || w === r) return null;
  var cur = offsetNow(w, r);
  if (cur == null) return null;
  var c = {
    id: uid(),
    type: "offset",
    wall: wallId,
    ref: refId,
    value: fin(value) ? value : cur,
    wallFace: 0,
    refFace: 0,
  };
  return addUnique(c);
}

export function angleSector(ni, w1Id, w2Id) {
  var w1 = wallById(w1Id), w2 = wallById(w2Id);
  if (!w1 || !w2 || w1 === w2 || !touchesNode(w1, ni) || !touchesNode(w2, ni))
    return null;
  return { joint: nodeAnchor(ni), w1: w1.id, w2: w2.id };
}

/* A corner with exactly two arms has one unambiguous architectural angle.
   Multi-arm joints must provide the selected wall pair explicitly. */
export function angleSectorAtNode(ni, wallA, wallB) {
  var arms = S.walls.filter(function (w) { return w.a === ni || w.b === ni; });
  if (wallA != null && wallB != null) return angleSector(ni, wallA, wallB);
  if (arms.length !== 2) return null;
  var sec = angleSector(ni, arms[0].id, arms[1].id);
  if (sec && sectorAngle(sec) > 180) {
    var id = sec.w1; sec.w1 = sec.w2; sec.w2 = id;
  }
  return sec;
}

export function addEqualAngle(referenceAngle, drivenAngle) {
  referenceAngle = stableSector(referenceAngle);
  drivenAngle = stableSector(drivenAngle);
  if (!sectorValid(referenceAngle) || !sectorValid(drivenAngle)) return null;
  var cur = sectorAngle(referenceAngle);
  var c = {
    id: uid(), type: "equalAngle",
    referenceAngle: referenceAngle,
    drivenAngle: drivenAngle,
    value: cur,
  };
  return addUnique(c);
}

/* Relations between two wall segments. The first wall is driven and the
   second is the held reference, matching the wall inspector's existing
   selected-wall-first convention. */
export function addWallRelation(type, wallId, refId) {
  if (["parallel", "perpendicular", "collinear", "equalLength", "horizontal", "vertical"].indexOf(type) < 0)
    return null;
  var w = wallById(wallId), r = refId == null ? null : wallById(refId);
  if (!w || ((type !== "horizontal" && type !== "vertical") && (!r || w === r))) return null;
  var c = { id: uid(), type: type, wall: w.id };
  if (r) c.ref = r.id;
  return addUnique(c);
}

export function addAxisAlignment(type, a, b) {
  if (type !== "alignX" && type !== "alignZ") return null;
  a = stableAnchor(a); b = stableAnchor(b);
  if (!anchorPos(a) || !anchorPos(b) || sameSpot(anchorPos(a), anchorPos(b))) return null;
  var c = { id: uid(), type: type, a: a, b: b, hold: "a" };
  return addUnique(c);
}

export function addAxisDistance(type, a, b, value) {
  if (type !== "axisDistX" && type !== "axisDistZ") return null;
  a = stableAnchor(a); b = stableAnchor(b);
  var pa = anchorPos(a), pb = anchorPos(b);
  if (!pa || !pb || sameSpot(pa, pb)) return null;
  var c = {
    id: uid(), type: type, a: a, b: b, hold: "a",
    value: fin(value) ? value : (type === "axisDistX" ? pb.x - pa.x : pb.z - pa.z),
  };
  return addUnique(c);
}

export function addPointWallDistance(point, refId, value, refFace) {
  point = stableAnchor(point);
  var p = anchorPos(point), r = wallById(refId);
  if (!p || !anchorMovable(point) || !r) return null;
  var cur = pointWallDistanceNow(point, r, refFace || 0);
  var c = {
    id: uid(), type: "pointWallDist", point: point, ref: r.id,
    refFace: refFace === 1 || refFace === -1 ? refFace : 0,
    value: fin(value) ? value : cur,
  };
  return addUnique(c);
}

export function addEqualSpacing(wallIds) {
  var ids = Array.from(new Set(wallIds || [])).filter(function (id) { return !!wallById(id); });
  if (ids.length < 3) return null;
  var c = { id: uid(), type: "equalSpacing", walls: ids };
  return addUnique(c);
}

/* Pin a corner where it stands. Everything else in this file answers the
   question "which of these two sides moves?" with a `hold` flag chosen at
   authoring time; a pin answers it once, globally, the way a real sketcher's
   ground does. `pinnedNodes()` is consulted by moveNode(), so a pinned corner
   is immovable to EVERY solver here, not just to the constraints that mention
   it — that is the whole point, and it is why the flag lives at the choke
   point rather than in each solveX(). */
export function addFixed(anchor) {
  anchor = stableAnchor(anchor);
  var ni = anchorNode(anchor),
    p = anchorPos(anchor);
  if (ni == null || !p) return null; // markers are already datums
  return addUnique({ id: uid(), type: "fixed", a: anchor, x: p.x, z: p.z });
}

/* Which node indices are pinned right now. Rebuilt per call rather than
   cached: a weld can change what index a vertex id resolves to between two
   sweeps of the same solve, and a stale set would pin the wrong corner. */
export function pinnedNodes() {
  var set = {};
  wallCons().forEach(function (c) {
    if (c.type !== "fixed" || c.off || c.report) return;
    var ni = anchorNode(c.a);
    if (ni != null) set[ni] = 1;
  });
  return set;
}
function isPinned(ni) {
  return ni != null && pinnedNodes()[ni] === 1;
}

/* Two corners that stay together WITHOUT being welded into one. `join` merges
   the vertices and the second one ceases to exist; this keeps both, so the
   relation can be deleted later and the corners come apart again. That is the
   difference between an edit and a constraint, and the reason both exist. */
export function addCoincident(a, b, hold) {
  a = stableAnchor(a);
  b = stableAnchor(b);
  if (!anchorPos(a) || !anchorPos(b)) return null;
  if (anchorKey(a) === anchorKey(b)) return null;
  if (!anchorMovable(a) && !anchorMovable(b)) return null; // two datums
  var h = hold === "b" ? "b" : "a";
  if (h === "a" && !anchorMovable(b)) h = "b";
  if (h === "b" && !anchorMovable(a)) h = "a";
  return addUnique({ id: uid(), type: "coincident", a: a, b: b, hold: h });
}

/* Mirror two corners about an axis. Two axis forms, because the mirror line a
   drawing is actually built on is only sometimes a wall:
     {k:"wall", id} - the wall's own centreline
     {k:"perp", id} - the PERPENDICULAR BISECTOR of that wall
   The second is what a bay window needs: the two splayed returns are mirrored
   about the centre of the front pane, and no wall runs along that line. */
export function addSymmetric(a, b, axis) {
  a = stableAnchor(a);
  b = stableAnchor(b);
  if (!axis || (axis.k !== "wall" && axis.k !== "perp") || !wallById(axis.id)) return null;
  if (!anchorPos(a) || !anchorPos(b) || anchorKey(a) === anchorKey(b)) return null;
  if (!anchorMovable(a) && !anchorMovable(b)) return null;
  var h = anchorMovable(b) ? "a" : "b";
  return addUnique({ id: uid(), type: "symmetric", a: a, b: b, axis: axis, hold: h });
}

/* A corner that stays at the middle of a wall. Midpoint exists as a drafting
   snap already, but a snap is a one-off aim: nothing kept the T-junction
   centred once the host wall grew. */
export function addMidpoint(point, refId) {
  point = stableAnchor(point);
  var r = wallById(refId);
  if (!r || !anchorMovable(point)) return null;
  return addUnique({ id: uid(), type: "midpoint", point: point, ref: r.id });
}

/* A corner that stays ON a wall's line but is free to slide along it. The
   distinction from pointWallDist(0) is the free degree of freedom: this one
   only ever corrects perpendicular error, so the corner can still be dragged
   along the line it belongs to. */
export function addPointOnLine(point, refId) {
  point = stableAnchor(point);
  var r = wallById(refId);
  if (!r || !anchorMovable(point)) return null;
  return addUnique({ id: uid(), type: "pointOnLine", point: point, ref: r.id });
}

/* Equal length across a SET of walls, not just a pair. The first id is the
   reference; the rest are driven to its length. */
export function addEqualLengthSet(wallIds) {
  var ids = Array.from(new Set(wallIds || [])).filter(function (id) { return !!wallById(id); });
  if (ids.length < 3) return null; // two walls are the existing pair relation
  return addUnique({ id: uid(), type: "equalLengthSet", walls: ids });
}

/* The angle between two walls that need NOT share a corner. addJointAngle
   requires both walls to touch the same vertex, which cannot express "the
   first and third segments of a bay open at 90 degrees to each other" — the
   two are separated by the front pane. Measured from `ref`'s direction to
   `wall`'s, so it reads the same way round as the parallel/perpendicular
   relations that are its 0 and 90 degree special cases. */
export function addWallAngle(wallId, refId, value) {
  var w = wallById(wallId),
    r = wallById(refId);
  if (!w || !r || w === r) return null;
  var cur = wallPairAngle(w, r);
  if (cur == null) return null;
  return addUnique({
    id: uid(), type: "wallAngle", wall: w.id, ref: r.id,
    value: fin(value) ? norm360(value) : cur,
  });
}

/* ---- openings ------------------------------------------------------------
   A door or a window is positioned by ONE number — `o.s`, how far along its
   wall it sits — and until now that number was a raw slider. Everything a real
   drawing says about an opening ("centred in the wall", "900 from the corner",
   "these three windows are equally spaced", "this window lines up with that
   one in the next room") was therefore impossible to state and impossible to
   preserve: move the wall's corner and every opening on it silently changed
   its relationship to the room.

   Openings get their own small family of constraints rather than reusing the
   corner anchors, because their variable is a scalar along a wall, not a
   point in the plan. The anchor rule still holds: they are keyed by opening
   id, never by index into S.openings. */
export function openingById(id) {
  return (S.openings || []).find(function (o) {
    return o && o.id === id;
  }) || null;
}
/* Where an opening's centre actually is, in plan coordinates. */
export function openingPos(o) {
  var w = o && wallById(o.wall);
  if (!w) return null;
  var g = wallGeom(w);
  if (!fin(g.L) || g.L <= 0) return null;
  return { x: g.a.x + g.ux * o.s, z: g.a.z + g.uz * o.s, g: g, wall: w };
}

/* Centred in its wall. */
export function addOpeningCentre(openingId) {
  var o = openingById(openingId);
  if (!o) return null;
  return addUnique({ id: uid(), type: "openCentre", opening: o.id });
}

/* A fixed distance from one END of the wall, measured to the opening's centre.
   `end` names WHICH corner, so the dimension survives the wall being redrawn
   in the opposite direction — "900 from the left" is not the same statement as
   "900 from wherever end a happens to be today". */
export function addOpeningFromCorner(openingId, end, value) {
  var o = openingById(openingId);
  if (!o) return null;
  var w = wallById(o.wall);
  if (!w) return null;
  var L = wallClearLength(w), e = end === "b" ? "b" : "a",
    s = openFaceDist(w, o.s);
  var cornerNode = e === "a" ? w.a : w.b,
    corner = S.nodes[cornerNode], pos = openingPos(o),
    centreDistance = corner && pos ? Math.hypot(pos.x - corner.x, pos.z - corner.z) : (e === "a" ? o.s : wallGeom(w).L - o.s),
    dir = corner && pos && centreDistance > 1e-9
      ? { x: (pos.x - corner.x) / centreDistance, z: (pos.z - corner.z) / centreDistance }
      : { x: e === "a" ? wallGeom(w).ux : -wallGeom(w).ux, z: e === "a" ? wallGeom(w).uz : -wallGeom(w).uz };
  return addUnique({
    id: uid(), type: "openDist", opening: o.id, end: e,
    value: fin(value) ? value : (e === "a" ? s : L - s),
    cornerNode: cornerNode, cornerDir: dir,
    cornerOffset: (e === "a" ? s : L - s) - centreDistance,
  });
}

export function stabilizeOpeningCornerRefs(wall) {
  if (!wall) return 0;
  var count = 0;
  wallCons().forEach(function (c) {
    if (c.type !== "openDist" || c.cornerNode != null) return;
    var o = openingById(c.opening);
    if (!o || o.wall !== wall.id) return;
    var cornerNode = c.end === "b" ? wall.b : wall.a,
      corner = S.nodes[cornerNode], pos = openingPos(o);
    if (!corner || !pos) return;
    var distance = Math.hypot(pos.x - corner.x, pos.z - corner.z);
    if (!(distance > 1e-9)) return;
    c.cornerNode = cornerNode;
    c.cornerDir = { x: (pos.x - corner.x) / distance, z: (pos.z - corner.z) / distance };
    c.cornerOffset = (fin(c.value) ? c.value : distance) - distance;
    count++;
  });
  return count;
}

/* The named corner's finished-face setback changes when a return is moved or
   its angle/thickness changes. Resolve that cut from the live segment leaving
   the named node toward the opening, even when the original host was split. */
function openingCornerCut(c) {
  if (!c || c.cornerNode == null || !c.cornerDir) return null;
  var best = null, bestDot = -Infinity;
  (S.walls || []).forEach(function (w) {
    var atA = w.a === c.cornerNode, atB = w.b === c.cornerNode;
    if (!atA && !atB) return;
    var g = wallGeom(w), dx = atA ? g.ux : -g.ux, dz = atA ? g.uz : -g.uz,
      dot = dx * c.cornerDir.x + dz * c.cornerDir.z;
    if (dot > bestDot) { bestDot = dot; best = { wall: w, end: atA ? "a" : "b" }; }
  });
  if (!best || bestDot < 0.5) return null;
  var cuts = wallCuts(best.wall);
  return cuts && fin(cuts[best.end]) ? cuts[best.end] : null;
}

/* Two openings lined up across DIFFERENT walls, on one world axis. The window
   in the bedroom and the window in the hall reading level with each other is a
   real drawing requirement and there was no way to say it. */
export function addOpeningAlign(aId, bId, axis) {
  var a = openingById(aId), b = openingById(bId);
  if (!a || !b || a === b || (axis !== "x" && axis !== "z")) return null;
  return addUnique({ id: uid(), type: "openAlign", a: a.id, b: b.id, axis: axis, hold: "a" });
}

/* A run of openings on one wall, evenly spaced. */
export function addOpeningSpacing(ids) {
  var list = Array.from(new Set(ids || [])).filter(function (id) { return !!openingById(id); });
  if (list.length < 3) return null;
  return addUnique({ id: uid(), type: "openSpacing", openings: list });
}

/* Slide an opening along its wall, keeping it inside the wall and clear of
   both corners by half its own width — an opening that runs off the end of its
   wall is not a position, it is a hole in the drawing. Returns how far it
   actually moved so the sweep can tell whether it converged. */
function moveOpening(o, s) {
  var w = wallById(o.wall);
  if (!w || !fin(s)) return 0;
  var L = wallGeom(w).L, half = (Number(o.width) || 0) / 2;
  var lo = Math.min(half, L / 2), hi = Math.max(L - half, L / 2);
  s = Math.max(lo, Math.min(hi, s));
  var d = Math.abs(s - o.s);
  if (d < 1e-6) return 0;
  o.s = s;
  return d;
}

function solveOpenCentre(c) {
  var o = openingById(c.opening), w = o && wallById(o.wall);
  if (!o || !w) return 0;
  // centred BETWEEN THE FACES, which is where a person sees the middle of the
  // wall; the centreline midpoint is off by half the difference of the two cuts
  return moveOpening(o, openNodeDist(w, wallClearLength(w) / 2));
}
function solveOpenDist(c) {
  var o = openingById(c.opening), w = o && wallById(o.wall);
  if (!o || !w || !fin(c.value)) return 0;
  if (c.cornerNode != null && c.cornerDir) {
    var corner = S.nodes[c.cornerNode], g = wallGeom(w), liveCut = openingCornerCut(c),
      d = c.value + (liveCut == null ? -(Number(c.cornerOffset) || 0) : liveCut);
    if (corner && g && fin(d)) {
      var tx = corner.x + c.cornerDir.x * d, tz = corner.z + c.cornerDir.z * d;
      return moveOpening(o, (tx - g.a.x) * g.ux + (tz - g.a.z) * g.uz);
    }
  }
  var L = wallClearLength(w);
  return moveOpening(o, openNodeDist(w, c.end === "b" ? L - c.value : c.value));
}
function solveOpenAlign(c) {
  var hold = openingById(c.hold === "b" ? c.b : c.a),
    drive = openingById(c.hold === "b" ? c.a : c.b);
  if (!hold || !drive) return 0;
  var hp = openingPos(hold), dp = openingPos(drive);
  if (!hp || !dp) return 0;
  /* Solve for the position along the driven opening's own wall at which its
     centre reaches the held one's coordinate. A wall running perpendicular to
     the axis cannot get there at any `s`, so the constraint reports itself
     unsatisfied instead of sliding the opening to an end and pretending. */
  var dir = c.axis === "x" ? dp.g.ux : dp.g.uz,
    base = c.axis === "x" ? dp.g.a.x : dp.g.a.z,
    want = c.axis === "x" ? hp.x : hp.z;
  if (Math.abs(dir) < 1e-6) return 0;
  return moveOpening(drive, (want - base) / dir);
}
function solveOpenSpacing(c) {
  var list = (c.openings || []).map(openingById).filter(Boolean);
  if (list.length < 3) return 0;
  var rows = list.slice().sort(function (a, b) { return a.s - b.s; });
  var first = rows[0].s, last = rows[rows.length - 1].s,
    step = (last - first) / (rows.length - 1), moved = 0;
  for (var i = 1; i < rows.length - 1; i++)
    moved += moveOpening(rows[i], first + step * i);
  return moved;
}

/* Reference (report-only) dimensions. A CAD drawing distinguishes a dimension
   that DRIVES geometry from one that merely states what the geometry
   currently measures; every constraint here was the former and there was no
   way to ask a question without also forcing an answer. Setting `report`
   makes the solver skip it and keeps `value` synced to the measurement, which
   is what turns "make these two angles equal" into "show me these two angles
   and the difference between them". */
export function setConReport(id, on) {
  var c = wallCons().find(function (q) { return q.id === id; });
  if (!c || c.type === "fixed") return false;
  c.report = !!on;
  if (c.report) refreshReports();
  return true;
}
export function isReport(c) {
  return !!(c && c.report);
}
/* Re-read every reference dimension from the drawing. Called at the end of a
   solve, so a report value is never one gesture stale. */
export function refreshReports() {
  wallCons().forEach(function (c) {
    /* equalAngle is refreshed whether or not it reports: its target is the
       LIVE reference sector, so `value` is a display cache either way. Every
       other type only has its value rewritten when it is a reference
       dimension — rewriting a driving target would silently erase what the
       user typed. */
    if (!c.report && c.type !== "equalAngle") return;
    var v = c.type === "equalAngle" ? sectorAngle(c.referenceAngle) : conCurrent(c);
    if (fin(v)) c.value = v;
  });
}

export function setConFaces(id, wallFace, refFace) {
  var c = wallCons().find(function (q) { return q.id === id; });
  if (!c || (c.type !== "offset" && c.type !== "pointWallDist")) return false;
  if (c.type === "pointWallDist") {
    c.refFace = refFace === 1 || refFace === -1 ? refFace : 0;
    return true;
  }
  c.wallFace = wallFace === 1 || wallFace === -1 ? wallFace : 0;
  c.refFace = refFace === 1 || refFace === -1 ? refFace : 0;
  return true;
}

export function removeCon(id) {
  S.wallCons = wallCons().filter(function (c) {
    return c.id !== id;
  });
  if (S.conHover === id) S.conHover = null;
}
export function setConValue(id, v) {
  var c = wallCons().find(function (q) {
    return q.id === id;
  });
  if (!c || !fin(v) || c.report) return false; // a reference dimension has no target to set
  c.value = c.type === "angle" || c.type === "wallAngle" ? norm360(v) : v;
  return true;
}
/* Move a pin to where its corner stands now — the "re-pin here" verb, so a
   pinned corner can be relocated deliberately instead of unpinned and redone. */
export function repin(id) {
  var c = wallCons().find(function (q) { return q.id === id; });
  if (!c || c.type !== "fixed") return false;
  var ni = anchorNode(c.a);
  if (ni == null) return false;
  c.x = S.nodes[ni].x;
  c.z = S.nodes[ni].z;
  return true;
}
// swap which side of a distance constraint is held — the one-click cure when
// the solver drives the corner you meant to keep
export function flipHold(id) {
  var c = wallCons().find(function (q) {
    return q.id === id;
  });
  if (!c || ["dist", "alignX", "alignZ", "axisDistX", "axisDistZ", "coincident", "symmetric"].indexOf(c.type) === -1) return false;
  var other = c.hold === "a" ? "b" : "a";
  if (!anchorMovable(c[c.hold])) return false; // the other side is a datum
  c.hold = other;
  if (c.type === "axisDistX" || c.type === "axisDistZ") c.value = -c.value;
  return true;
}

/* Swap reference and driven geometry for every asymmetric relation. */
export function flipConDirection(id) {
  var c = wallCons().find(function (q) { return q.id === id; });
  if (!c) return false;
  if (c.type === "dist" || c.type === "alignX" || c.type === "alignZ" ||
    c.type === "axisDistX" || c.type === "axisDistZ" ||
    c.type === "coincident" || c.type === "symmetric")
    return flipHold(id);
  if (c.type === "wallAngle") {
    var wid = c.wall; c.wall = c.ref; c.ref = wid;
    c.value = norm360(360 - c.value);
    return true;
  }
  if (c.type === "angle") {
    var w = c.w1; c.w1 = c.w2; c.w2 = w;
    c.value = norm360(360 - c.value);
    return true;
  }
  if (c.type === "equalAngle") {
    var a = c.referenceAngle; c.referenceAngle = c.drivenAngle; c.drivenAngle = a;
    c.value = sectorAngle(c.referenceAngle);
    return true;
  }
  if (c.wall != null && c.ref != null && c.type !== "pointWallDist") {
    var id0 = c.wall; c.wall = c.ref; c.ref = id0;
    if (c.type === "offset") {
      var f = c.wallFace; c.wallFace = c.refFace; c.refFace = f;
      c.value = offsetNow(wallById(c.wall), wallById(c.ref), c);
    }
    return true;
  }
  return false;
}

export function setConSuppressed(id, off) {
  var c = wallCons().find(function (q) { return q.id === id; });
  if (!c) return false;
  c.off = !!off;
  return true;
}

/* Every constraint that mentions this wall, either as a subject or as the
   reference something else is measured from. Drives the inspector list. */
export function consForWall(w) {
  if (!w) return [];
  return wallCons().filter(function (c) {
    if (c.type === "equalSpacing" || c.type === "equalLengthSet")
      return c.walls.indexOf(w.id) !== -1;
    if (c.type === "openCentre" || c.type === "openDist") {
      var oc = openingById(c.opening);
      return !!oc && oc.wall === w.id;
    }
    if (c.type === "openAlign") {
      var oa = openingById(c.a), ob = openingById(c.b);
      return (!!oa && oa.wall === w.id) || (!!ob && ob.wall === w.id);
    }
    if (c.type === "openSpacing")
      return (c.openings || []).some(function (id) {
        var oo = openingById(id);
        return !!oo && oo.wall === w.id;
      });
    if (c.type === "fixed") return anchorTouchesWall(c.a, w);
    if (c.type === "symmetric")
      return anchorTouchesWall(c.a, w) || anchorTouchesWall(c.b, w) || c.axis.id === w.id;
  if (c.type === "dist" || c.type === "alignX" || c.type === "alignZ" || c.type === "axisDistX" || c.type === "axisDistZ" || c.type === "coincident")
      return (
        anchorTouchesWall(c.a, w) || anchorTouchesWall(c.b, w)
      );
    if (c.type === "angle")
      return c.w1 === w.id || c.w2 === w.id || anchorTouchesWall(c.joint, w);
    if (c.type === "equalAngle")
      return sectorTouchesWall(c.referenceAngle, w) || sectorTouchesWall(c.drivenAngle, w);
    if (c.type === "pointWallDist" || c.type === "midpoint" || c.type === "pointOnLine")
      return c.ref === w.id || anchorTouchesWall(c.point, w);
    return c.wall === w.id || c.ref === w.id;
  });
}

function anchorTouchesWall(an, w) {
  if (!an || !w) return false;
  if (an.k === "wall") return an.id === w.id;
  if (an.wall === w.id) return true;
  var ni = anchorNode(an);
  return ni != null && (w.a === ni || w.b === ni);
}
function anchorLive(an) {
  if (!an) return false;
  if (an.k === "marker") return !!anchorPos(an);
  var ni = anchorNode(an);
  return ni != null && S.walls.some(function (w) { return w.a === ni || w.b === ni; });
}
function sectorTouchesWall(sec, w) {
  return !!sec && (sec.w1 === w.id || sec.w2 === w.id || anchorTouchesWall(sec.joint, w));
}

/* Drop constraints whose geometry no longer exists. Called after any edit that
   can delete a wall or marker — a stale constraint is worse than none, because
   it reports an error about something the user cannot see. */
export function pruneCons() {
  var before = wallCons().length;
  S.wallCons = wallCons().filter(function (c) {
    if (c.type === "equalSpacing" || c.type === "equalLengthSet")
      return c.walls.length >= 3 && c.walls.every(function (id) { return !!wallById(id); });
    if (c.type === "openCentre" || c.type === "openDist") {
      var po = openingById(c.opening);
      return !!po && !!wallById(po.wall);
    }
    if (c.type === "openAlign") return !!openingById(c.a) && !!openingById(c.b);
    if (c.type === "openSpacing")
      return (c.openings || []).length >= 3 &&
        c.openings.every(function (id) { return !!openingById(id); });
    if (c.type === "fixed") return anchorLive(c.a);
    if (c.type === "symmetric")
      return anchorLive(c.a) && anchorLive(c.b) && !!wallById(c.axis.id);
    if (c.type === "midpoint" || c.type === "pointOnLine")
      return anchorLive(c.point) && !!wallById(c.ref);
    if (c.type === "dist" || c.type === "alignX" || c.type === "alignZ" || c.type === "axisDistX" || c.type === "axisDistZ" || c.type === "coincident")
      return anchorLive(c.a) && anchorLive(c.b);
    if (c.type === "angle")
      return (
        sectorValid({ joint: c.joint, w1: c.w1, w2: c.w2 })
      );
    if (c.type === "equalAngle") return sectorValid(c.referenceAngle) && sectorValid(c.drivenAngle);
    if (c.type === "pointWallDist") return anchorLive(c.point) && !!wallById(c.ref);
    if (c.type === "horizontal" || c.type === "vertical") return !!wallById(c.wall);
    return !!wallById(c.wall) && !!wallById(c.ref);
  });
  if (S.conHover != null && !S.wallCons.some(function (c) { return c.id === S.conHover; }))
    S.conHover = null;
  return before - S.wallCons.length;
}

/* ---- measuring ---------------------------------------------------------- */

function touchesNode(w, ni) {
  return w.a === ni || w.b === ni;
}
function norm360(d) {
  d = d % 360;
  return d < 0 ? d + 360 : d;
}
// bearing of `w` leaving the corner `ni`, in radians
function bearingFrom(w, ni) {
  var far = w.a === ni ? w.b : w.a;
  var A = S.nodes[ni],
    B = S.nodes[far];
  if (!A || !B) return null;
  return Math.atan2(B.z - A.z, B.x - A.x);
}
function jointAngleNow(ni, w1, w2) {
  var b1 = bearingFrom(w1, ni),
    b2 = bearingFrom(w2, ni);
  if (b1 == null || b2 == null) return 0;
  return norm360(((b2 - b1) * 180) / Math.PI);
}
function sectorValid(sec) {
  if (!sec) return false;
  var ni = anchorNode(sec.joint), w1 = wallById(sec.w1), w2 = wallById(sec.w2);
  return ni != null && !!w1 && !!w2 && w1 !== w2 && touchesNode(w1, ni) && touchesNode(w2, ni);
}
export function sectorAngle(sec) {
  if (!sectorValid(sec)) return null;
  return jointAngleNow(anchorNode(sec.joint), wallById(sec.w1), wallById(sec.w2));
}

/* Would rotating the driven arm require deforming a closed/pinned part of the
   wall graph? Remove that arm and walk the geometry hanging from its far end:
   an open component can follow by rigid translation, preserving every length;
   reaching the joint again means a closed loop, while a pin prevents that
   rigid translation. The UI uses this read-only check before offering a
   potentially length-changing solve. */
export function jointAngleLengthImpact(sec, value) {
  sec = stableSector(sec);
  if (!sectorValid(sec) || !fin(value)) return { needsChange: false, walls: [] };
  var ni = anchorNode(sec.joint), driven = wallById(sec.w2);
  if (ni == null || !driven) return { needsChange: false, walls: [] };
  var far = driven.a === ni ? driven.b : driven.a,
    seen = {}, stack = [far], wallIds = {}, pins = pinnedNodes(), closesLoop = false,
    blockedByPin = !!pins[far];
  seen[far] = 1;
  while (stack.length) {
    var at = stack.pop();
    for (var i = 0; i < S.walls.length; i++) {
      var w = S.walls[i];
      if (!w || w.id === driven.id || (w.a !== at && w.b !== at)) continue;
      wallIds[w.id] = 1;
      var other = w.a === at ? w.b : w.a;
      if (other === ni) closesLoop = true;
      if (other !== ni && pins[other]) blockedByPin = true;
      if (!seen[other]) { seen[other] = 1; stack.push(other); }
    }
  }
  var cur = sectorAngle(sec), delta = cur == null ? 0 : Math.abs(norm360(value - cur));
  if (delta > 180) delta = 360 - delta;
  var changed = delta > CON_TOL_A && (closesLoop || blockedByPin);
  return { needsChange: changed, walls: changed ? Object.keys(wallIds).map(Number) : [] };
}
function lineAngleError(w, r, perpendicular) {
  if (!w || !r) return null;
  var a = Math.abs(norm360((wallGeom(w).ang - wallGeom(r).ang) * 180 / Math.PI));
  a = a > 180 ? 360 - a : a;
  if (a > 90) a = 180 - a;
  return perpendicular ? Math.abs(90 - a) : Math.abs(a);
}
// signed perpendicular distance from `r`'s centreline to `w`'s midpoint
function offsetNow(w, r, c) {
  var gw = wallGeom(w),
    gr = wallGeom(r);
  if (!fin(gr.L) || gr.L <= 0 || !fin(gw.L)) return null;
  var mx = (gw.a.x + gw.b.x) / 2,
    mz = (gw.a.z + gw.b.z) / 2;
  // left normal of the reference direction
  var nx = -gr.uz,
    nz = gr.ux;
  var wallFace = c && (c.wallFace === 1 || c.wallFace === -1) ? c.wallFace : 0,
    refFace = c && (c.refFace === 1 || c.refFace === -1) ? c.refFace : 0;
  return (mx - gr.a.x) * nx + (mz - gr.a.z) * nz +
    wallFace * (Number(w.thickness) || 0) / 2 - refFace * (Number(r.thickness) || 0) / 2;
}
function pointWallDistanceNow(point, r, refFace) {
  var p = anchorPos(point), gr = wallGeom(r);
  if (!p || !r || !fin(gr.L) || gr.L <= 0) return null;
  var nx = -gr.uz, nz = gr.ux,
    face = refFace === 1 || refFace === -1 ? refFace : 0;
  return (p.x - gr.a.x) * nx + (p.z - gr.a.z) * nz -
    face * (Number(r.thickness) || 0) / 2;
}
/* Signed opening from `r`'s direction to `w`'s, 0-360, for two walls that do
   not have to meet. Direction, not geometry: the walls may be anywhere. */
function wallPairAngle(w, r) {
  var gw = wallGeom(w), gr = wallGeom(r);
  if (!fin(gw.ang) || !fin(gr.ang)) return null;
  return norm360(((gw.ang - gr.ang) * 180) / Math.PI);
}

/* The mirror line of a symmetry constraint, as a point + unit direction. */
function axisLine(axis) {
  var w = axis && wallById(axis.id);
  if (!w) return null;
  var g = wallGeom(w);
  if (!fin(g.L) || g.L <= 0) return null;
  if (axis.k === "perp")
    return {
      px: (g.a.x + g.b.x) / 2, pz: (g.a.z + g.b.z) / 2,
      ux: -g.uz, uz: g.ux,
    };
  return { px: g.a.x, pz: g.a.z, ux: g.ux, uz: g.uz };
}
function mirrorAcross(p, ax) {
  if (!p || !ax) return null;
  var dx = p.x - ax.px, dz = p.z - ax.pz,
    along = dx * ax.ux + dz * ax.uz,
    perpX = dx - along * ax.ux, perpZ = dz - along * ax.uz;
  return {
    x: ax.px + along * ax.ux - perpX,
    z: ax.pz + along * ax.uz - perpZ,
  };
}

function spacingLayout(c) {
  var walls = (c.walls || []).map(wallById).filter(Boolean);
  if (walls.length < 3) return null;
  var ref = wallGeom(walls[0]), nx = -ref.uz, nz = ref.ux;
  var rows = walls.map(function (w) {
    var g = wallGeom(w), mx = (g.a.x + g.b.x) / 2, mz = (g.a.z + g.b.z) / 2;
    return { wall: w, g: g, pos: (mx - ref.a.x) * nx + (mz - ref.a.z) * nz, mx: mx, mz: mz };
  }).sort(function (a, b) { return a.pos - b.pos; });
  return { rows: rows, nx: nx, nz: nz, step: (rows[rows.length - 1].pos - rows[0].pos) / (rows.length - 1) };
}
function spacingError(c) {
  var l = spacingLayout(c); if (!l) return null;
  var worst = 0;
  for (var i = 1; i < l.rows.length; i++)
    worst = Math.max(worst, Math.abs((l.rows[i].pos - l.rows[i - 1].pos) - l.step),
      lineAngleError(l.rows[i].wall, l.rows[0].wall, false));
  return worst;
}

/* What the constraint currently measures, in its own unit. Read-only — the
   inspector, the plan labels and the error check all go through this. */
export function conCurrent(c) {
  if (!c) return null;
  if (c.type === "fixed") {
    var pf = anchorPos(c.a);
    return pf ? Math.hypot(pf.x - c.x, pf.z - c.z) : null;
  }
  /* Both of these read along the wall's reference face, exactly like the wall's
     own length does — "600 from the corner" means from the finished face the
     user is dimensioning against, not from the invisible centreline node. */
  if (c.type === "openCentre") {
    var oo = openingById(c.opening), ow = oo && wallById(oo.wall);
    return ow ? openFaceDist(ow, oo.s) - wallClearLength(ow) / 2 : null;
  }
  if (c.type === "openDist") {
    var od = openingById(c.opening), odw = od && wallById(od.wall);
    if (!odw) return null;
    if (c.cornerNode != null) {
      var corner = S.nodes[c.cornerNode], odp = openingPos(od);
      if (corner && odp) {
        var liveCut = openingCornerCut(c);
        return Math.hypot(odp.x - corner.x, odp.z - corner.z) -
          (liveCut == null ? -(Number(c.cornerOffset) || 0) : liveCut);
      }
    }
    var ods = openFaceDist(odw, od.s);
    return c.end === "b" ? wallClearLength(odw) - ods : ods;
  }
  if (c.type === "openAlign") {
    var pa1 = openingPos(openingById(c.a)), pb1 = openingPos(openingById(c.b));
    if (!pa1 || !pb1) return null;
    return c.axis === "x" ? pb1.x - pa1.x : pb1.z - pa1.z;
  }
  if (c.type === "openSpacing") {
    var os = (c.openings || []).map(openingById).filter(Boolean)
      .map(function (q) { return q.s; }).sort(function (m, n) { return m - n; });
    if (os.length < 3) return null;
    var want = (os[os.length - 1] - os[0]) / (os.length - 1), worst = 0;
    for (var oi = 1; oi < os.length; oi++)
      worst = Math.max(worst, Math.abs((os[oi] - os[oi - 1]) - want));
    return worst;
  }
  if (c.type === "coincident") {
    var ca = anchorPos(c.a), cb = anchorPos(c.b);
    return ca && cb ? Math.hypot(cb.x - ca.x, cb.z - ca.z) : null;
  }
  if (c.type === "symmetric") {
    var sa = anchorPos(c.a), sb = anchorPos(c.b), sax = axisLine(c.axis);
    if (!sa || !sb || !sax) return null;
    var want = mirrorAcross(c.hold === "b" ? sb : sa, sax),
      have = c.hold === "b" ? sa : sb;
    return Math.hypot(have.x - want.x, have.z - want.z);
  }
  if (c.type === "midpoint" || c.type === "pointOnLine") {
    var mr = wallById(c.ref), mp = anchorPos(c.point);
    if (!mr || !mp) return null;
    var mg = wallGeom(mr);
    if (c.type === "pointOnLine")
      return Math.abs((mp.x - mg.a.x) * -mg.uz + (mp.z - mg.a.z) * mg.ux);
    return Math.hypot(mp.x - (mg.a.x + mg.b.x) / 2, mp.z - (mg.a.z + mg.b.z) / 2);
  }
  if (c.type === "equalLengthSet") {
    var ls = c.walls.map(wallById).filter(Boolean).map(function (q) { return wallGeom(q).L; });
    if (ls.length < 2) return null;
    var worst = 0;
    for (var li = 1; li < ls.length; li++) worst = Math.max(worst, Math.abs(ls[li] - ls[0]));
    return worst;
  }
  if (c.type === "wallAngle") {
    var aw = wallById(c.wall), ar = wallById(c.ref);
    return aw && ar ? wallPairAngle(aw, ar) : null;
  }
  if (c.type === "dist") {
    var pa = anchorPos(c.a),
      pb = anchorPos(c.b);
    return pa && pb ? Math.hypot(pb.x - pa.x, pb.z - pa.z) : null;
  }
  if (c.type === "angle") {
    var ni = anchorNode(c.joint),
      w1 = wallById(c.w1),
      w2 = wallById(c.w2);
    if (ni == null || !w1 || !w2) return null;
    return jointAngleNow(ni, w1, w2);
  }
  if (c.type === "equalAngle") return sectorAngle(c.drivenAngle);
  if (c.type === "alignX" || c.type === "alignZ" || c.type === "axisDistX" || c.type === "axisDistZ") {
    var p1 = anchorPos(c.a), p2 = anchorPos(c.b);
    return p1 && p2 ? ((c.type === "alignX" || c.type === "axisDistX") ? p2.x - p1.x : p2.z - p1.z) : null;
  }
  if (c.type === "pointWallDist") {
    var pr = wallById(c.ref);
    return pr ? pointWallDistanceNow(c.point, pr, c.refFace) : null;
  }
  if (c.type === "equalSpacing") return spacingError(c);
  var w = wallById(c.wall),
    r = wallById(c.ref);
  if (c.type === "horizontal" || c.type === "vertical") {
    if (!w) return null;
    var deg = norm360(wallGeom(w).ang * 180 / Math.PI), target = c.type === "horizontal" ? 0 : 90;
    var absolute = Math.abs(norm360(deg - target));
    if (absolute > 180) absolute = 360 - absolute;
    if (absolute > 90) absolute = 180 - absolute;
    return Math.abs(absolute);
  }
  if (!w || !r) return null;
  if (c.type === "offset") return offsetNow(w, r, c);
  if (c.type === "equalLength") return wallGeom(w).L;
  if (c.type === "parallel" || c.type === "collinear") return lineAngleError(w, r, false);
  if (c.type === "perpendicular") return lineAngleError(w, r, true);
  return null;
}

/* How far out it is, always positive, in the constraint's unit. Angles wrap,
   so 359° against a target of 1° is 2° out, not 358°. */
export function conError(c) {
  if (c && (c.off || c.report)) return 0; // a reference dimension never fails
  var cur = conCurrent(c);
  if (cur == null) return null;
  /* Types whose measurement IS the error: they read zero when satisfied, so
     there is no stored target to subtract. */
  if (["fixed", "coincident", "symmetric", "midpoint", "pointOnLine",
    "equalLengthSet", "openCentre", "openAlign", "openSpacing"].indexOf(c.type) !== -1)
    return Math.abs(cur);
  if (c.type === "wallAngle") {
    var wd = Math.abs(norm360(cur - c.value));
    return wd > 180 ? 360 - wd : wd;
  }
  if (c.type === "equalAngle") {
    var target = sectorAngle(c.referenceAngle);
    if (target == null) return null;
    var eq = Math.abs(norm360(cur - target));
    return eq > 180 ? 360 - eq : eq;
  }
  if (c.type === "parallel" || c.type === "perpendicular" || c.type === "horizontal" || c.type === "vertical" || c.type === "equalSpacing") return cur;
  if (c.type === "collinear") {
    var w = wallById(c.wall), r = wallById(c.ref), gr = wallGeom(r), gw = wallGeom(w);
    if (!w || !r) return null;
    var perp = Math.abs((gw.a.x - gr.a.x) * -gr.uz + (gw.a.z - gr.a.z) * gr.ux);
    return Math.max(cur, perp);
  }
  if (c.type === "equalLength") {
    var rr = wallById(c.ref);
    return rr ? Math.abs(cur - wallGeom(rr).L) : null;
  }
  if (c.type === "alignX" || c.type === "alignZ") return Math.abs(cur);
  if (!fin(c.value)) return null;
  if (c.type !== "angle") return Math.abs(cur - c.value);
  var d = Math.abs(norm360(cur - c.value));
  return d > 180 ? 360 - d : d;
}
export function conSatisfied(c) {
  if (c && (c.off || c.report)) return true;
  var e = conError(c);
  if (e == null) return false;
  var angular = c.type === "angle" || c.type === "equalAngle" ||
    c.type === "parallel" || c.type === "perpendicular" ||
    c.type === "horizontal" || c.type === "vertical" || c.type === "wallAngle";
  return e <= (angular ? CON_TOL_A : CON_TOL_L);
}
/* Which unit a constraint's value is in, and whether it HAS a value the user
   can type. The inspector, the plan labels and the message list all ask this,
   and each was answering it with its own list of type names. */
export function conUnit(c) {
  if (!c) return null;
  if (["angle", "wallAngle", "equalAngle", "parallel", "perpendicular",
    "horizontal", "vertical"].indexOf(c.type) !== -1) return "deg";
  if (["dist", "offset", "axisDistX", "axisDistZ", "pointWallDist",
    "openDist"].indexOf(c.type) !== -1) return getDomainUnit("plan");
  return null; // a pure relation: satisfied or not, with nothing to type
}
export function conDrivable(c) {
  return !!c && !c.report && conUnit(c) !== null &&
    ["equalAngle", "parallel", "perpendicular", "horizontal", "vertical"].indexOf(c.type) === -1;
}

/* Short human name for a constraint, in the terms it was authored in. Kept
   here rather than in the UI so the inspector, the message list and any future
   readout cannot drift into calling the same relation three different things.
   `tr` is the translator, passed in so this module stays free of the i18n
   import (it is used by tests and by the solver's own diagnostics). */
export function conLabelText(c, tr) {
  if (!c) return "";
  var T = typeof tr === "function" ? tr : function (k) { return k; };
  switch (c.type) {
    case "fixed": return T("wc_t_fixed") + " " + anchorLabel(c.a);
    case "coincident": return anchorLabel(c.a) + " ⊙ " + anchorLabel(c.b);
    case "symmetric":
      return anchorLabel(c.a) + " ⇄ " + anchorLabel(c.b) +
        " · " + T(c.axis && c.axis.k === "perp" ? "wc_t_axisPerp" : "wc_t_axisWall") +
        " W" + (c.axis && c.axis.id);
    case "dist": return anchorLabel(c.a) + " → " + anchorLabel(c.b);
    case "alignX": case "alignZ":
      return anchorLabel(c.a) + " / " + anchorLabel(c.b) +
        " · " + (c.type === "alignX" ? "X" : "Z");
    case "axisDistX": case "axisDistZ":
      return (c.type === "axisDistX" ? "ΔX " : "ΔZ ") +
        anchorLabel(c.a) + " → " + anchorLabel(c.b);
    case "angle": return T("wc_addAngle") + " " + anchorLabel(c.joint) +
      " · W" + c.w1 + "→W" + c.w2;
    case "equalAngle": return T("nd_equal_angle");
    case "wallAngle": return T("wc_addWallAngle") + " · W" + c.wall + "→W" + c.ref;
    case "midpoint": return T("wc_addMidpoint") + " · W" + c.ref;
    case "pointOnLine": return T("wc_addOnLine") + " · W" + c.ref;
    case "pointWallDist": return T("wc_addPointWall") + " · W" + c.ref;
    case "offset": return T("wc_addOffset") + " · W" + c.wall + "/W" + c.ref;
    case "openCentre": return T("wc_openCentre");
    case "openDist":
      return T("wc_openDist") + " · " + (c.end === "b" ? "B" : "A");
    case "openAlign": return T("wc_openAlign") + " · " + c.axis.toUpperCase();
    case "openSpacing": return T("wc_openSpacing") + " · " + (c.openings || []).length;
    case "equalSpacing": return T("wm_equal_spacing") + " · " + (c.walls || []).length;
    case "equalLengthSet": return T("wc_addEqualLength") + " · " + (c.walls || []).length;
    default:
      return T("wc_add" + c.type.charAt(0).toUpperCase() + c.type.slice(1)) +
        (c.ref != null ? " · W" + c.wall + "/W" + c.ref : " · W" + c.wall);
  }
}

/* Every constraint that is currently out, for the warning list / a badge. */
export function conIssues() {
  return wallCons()
    .map(function (c) {
      if (c.off || c.report) return null;
      var e = conError(c);
      return e == null || conSatisfied(c) ? null : { con: c, error: e };
    })
    .filter(Boolean);
}

/* ---- the solver --------------------------------------------------------- */

/* Move a corner, taking every wall that shares it along — which is automatic,
   because a node IS the shared corner. Returns how far it actually travelled,
   so the sweep can tell whether it has converged. */
function moveNode(ni, x, z, force) {
  var n = S.nodes[ni];
  if (!n || !fin(x) || !fin(z)) return 0;
  /* A pinned corner is immovable to every solver in this file, not only to
     the constraints that name it. Without the check at this one choke point,
     an unrelated distance could drag a pinned corner and the pin would spend
     the next sweep dragging it back — the plan would shiver instead of
     reporting, honestly, that the two cannot both hold. `force` is for the
     pin's own solver, which is the one thing allowed to write the position. */
  if (!force && isPinned(ni)) return 0;
  var d = Math.hypot(x - n.x, z - n.z);
  if (d < 1e-6) return 0;
  n.x = x;
  n.z = z;
  return d;
}

function ownerWallOfAnchor(an) {
  if (an && an.wall != null && wallById(an.wall)) return an.wall;
  var ni = anchorNode(an);
  if (ni == null) return null;
  var w = S.walls.find(function (q) { return q.a === ni || q.b === ni; });
  return w ? w.id : null;
}

/* Putting a corner where a dimension says it goes is the same KIND of edit as
   typing a length into the wall inspector, so it settles the same way: the rest
   of the plan is relaxed back onto its own stated interior dimensions first, and
   only a wall still in contradiction afterwards is handed a private corner.

   Going straight to enforceLocks (which this used to do) tore closed rooms
   apart. Every other wall standing on a moved corner reads as deformed, so it
   got its old corner back and the room silently stopped being a room — floor,
   name and area rule gone — while the solve still reported "0 unresolved". The
   inspector never had that problem because settleWallDim() relaxes first, and
   on a rectangle the wall opposite the dimensioned one yields instead. */
/* While a solve is running this holds the union of the walls its constraints
   are editing; enforcement is then done ONCE at the end, by settleAfterSolve().
   Null outside a solve, where a solver called on its own still settles itself. */
var solveActive = null;

function protectLocks(before, active, moved) {
  var ids = (active || []).filter(function (id) { return id != null; });
  /* Nothing moved, so nothing can have been deformed — and both calls below
     are far too expensive to run on every converged sweep. */
  if (!moved) return 0;
  if (solveActive) {
    ids.forEach(function (id) {
      if (solveActive.indexOf(id) === -1) solveActive.push(id);
    });
    return 0; // the sweeps place the corners; settleAfterSolve() has the last word
  }
  return settleLocks(before, ids);
}

/* Put the plan back on its stated dimensions after an edit moved corners.

   The relaxation is the repair, not the normal path: it is only reached when a
   joint is genuinely about to come apart, so an ordinary settle still costs one
   enforceLocks() and geometry the caller placed by hand is left alone.

   Going straight to enforceLocks (which this used to do, after every single
   constraint) tore closed rooms apart. Every other wall standing on a moved
   corner reads as deformed, so it got its old corner back and the room silently
   stopped being a room — floor, name and area rule gone — while the solve still
   reported "0 unresolved". The inspector never had that problem because
   settleWallDim() relaxes first, and on a rectangle the wall opposite the
   dimensioned one yields instead. */
function settleLocks(before, ids, repair) {
  if (repair === false || !wouldReleaseJoint(before, ids)) return enforceLocks(before, ids);
  var relaxed = relaxLocks(ids, Object.keys(pinnedNodes()).map(Number));
  return enforceLocks(before, ids.concat(relaxed.yielded));
}

function solveDist(c) {
  var holdAn = c.hold === "b" ? c.b : c.a,
    moveAn = c.hold === "b" ? c.a : c.b;
  var P = anchorPos(holdAn),
    Q = anchorPos(moveAn),
    ni = anchorNode(moveAn);
  if (!P || !Q || ni == null || !fin(c.value)) return 0;
  var dx = Q.x - P.x,
    dz = Q.z - P.z,
    len = Math.hypot(dx, dz);
  /* Degenerate case: the two corners are on top of each other, so there is no
     direction to push along. Bail rather than inventing one — an arbitrary
     bearing here would fling the corner somewhere the user never drew. */
  if (len < 1e-4) return 0;
  var before = snapshotNodes();
  var moved = moveNode(ni, P.x + (dx / len) * c.value, P.z + (dz / len) * c.value);
  protectLocks(before, [ownerWallOfAnchor(moveAn)], moved);
  return moved;
}

function solveAngle(c) {
  var ni = anchorNode(c.joint),
    w1 = wallById(c.w1),
    w2 = wallById(c.w2);
  if (ni == null || !w1 || !w2 || !fin(c.value)) return 0;
  if (!touchesNode(w1, ni) || !touchesNode(w2, ni)) return 0;
  var b1 = bearingFrom(w1, ni);
  if (b1 == null) return 0;
  var far = w2.a === ni ? w2.b : w2.a;
  var J = S.nodes[ni],
    F = S.nodes[far];
  if (!J || !F) return 0;
  var L = Math.hypot(F.x - J.x, F.z - J.z);
  if (L < 1e-4) return 0;
  /* Swing w2's FAR end about the joint at constant length. Rotating rather
     than translating is what keeps the wall's own locked length intact, so an
     angle constraint and a length lock can hold at the same time instead of
     taking turns undoing each other. */
  /* Capture the dimensions BEFORE the swing. Otherwise a project whose legacy
     walls have not yet received clearL/lockAng would accidentally capture the
     already-deformed downstream chain as its new truth during relaxation. */
  if (c.keepConnected) { syncClears(); syncLocks(); }
  var want = b1 + (c.value * Math.PI) / 180;
  var before = snapshotNodes();
  var moved = moveNode(far, J.x + Math.cos(want) * L, J.z + Math.sin(want) * L);
  if (c.keepConnected && moved) {
    /* Direct numeric entry promises to keep the wall graph connected. Hold the
       driven arm exactly where the requested angle put it, then let the rest
       of its connected component follow. Without permission to change
       lengths, even derived walls remain hard dimensions; with permission the
       relaxation may yield them (including user-entered lengths) rather than
       opening a joint. */
    var heldLength = fin(w2.clearL) ? w2.clearL : wallClearLength(w2),
      movedEnd = w2.a === far ? "a" : "b";
    w2.lockAng = (wallGeom(w2).ang * 180) / Math.PI;
    var relaxed = settleWallDim(
      w2, heldLength, movedEnd, [w2.id], !!c.allowLengthChange,
      !c.allowLengthChange
    );
    enforceLocks(before, [w2.id].concat(relaxed.yielded));
    return moved;
  }
  protectLocks(before, [w2.id], moved);
  return moved;
}

function solveOffset(c) {
  var w = wallById(c.wall),
    r = wallById(c.ref);
  if (!w || !r || !fin(c.value)) return 0;
  var gr = wallGeom(r),
    gw = wallGeom(w);
  if (!fin(gr.L) || gr.L <= 0 || !fin(gw.L) || gw.L <= 0) return 0;
  var A = S.nodes[w.a],
    B = S.nodes[w.b];
  if (!A || !B) return 0;
  // 1. make it parallel — about its own midpoint, so it pivots in place
  var mx = (A.x + B.x) / 2,
    mz = (A.z + B.z) / 2,
    half = gw.L / 2;
  // whichever of the reference's two directions this wall already points more
  // nearly along, or a corridor would spin end-for-end the moment it is added
  var dir = gw.ux * gr.ux + gw.uz * gr.uz >= 0 ? 1 : -1;
  var ux = gr.ux * dir,
    uz = gr.uz * dir;
  var ax = mx - ux * half,
    az = mz - uz * half,
    bx = mx + ux * half,
    bz = mz + uz * half;
  // 2. then slide it perpendicular onto the requested offset
  var nx = -gr.uz,
    nz = gr.ux;
  var cur = offsetNow(w, r, c);
  var shift = c.value - cur;
  var before = snapshotNodes();
  var moved = moveNode(w.a, ax + nx * shift, az + nz * shift);
  moved += moveNode(w.b, bx + nx * shift, bz + nz * shift);
  protectLocks(before, [w.id], moved);
  return moved;
}

function solveAxis(c) {
  var holdAn = c.hold === "b" ? c.b : c.a,
    moveAn = c.hold === "b" ? c.a : c.b,
    P = anchorPos(holdAn), Q = anchorPos(moveAn), ni = anchorNode(moveAn);
  if (!P || !Q || ni == null) return 0;
  var before = snapshotNodes();
  var isX = c.type === "alignX" || c.type === "axisDistX",
    delta = c.type === "axisDistX" || c.type === "axisDistZ" ? c.value : 0;
  var moved = moveNode(ni, isX ? P.x + delta : Q.x,
    isX ? Q.z : P.z + delta);
  protectLocks(before, [ownerWallOfAnchor(moveAn)], moved);
  return moved;
}

function solveEqualAngle(c) {
  var want = sectorAngle(c.referenceAngle), sec = c.drivenAngle;
  if (want == null || !sectorValid(sec)) return 0;
  var ni = anchorNode(sec.joint), w1 = wallById(sec.w1), w2 = wallById(sec.w2),
    base = bearingFrom(w1, ni), far = w2.a === ni ? w2.b : w2.a,
    J = S.nodes[ni], F = S.nodes[far];
  if (base == null || !J || !F) return 0;
  var L = Math.hypot(F.x - J.x, F.z - J.z);
  if (L < 1e-4) return 0;
  var before = snapshotNodes(), ang = base + want * Math.PI / 180;
  var moved = moveNode(far, J.x + Math.cos(ang) * L, J.z + Math.sin(ang) * L);
  protectLocks(before, [w2.id], moved);
  return moved;
}

function solveWallRelation(c) {
  var w = wallById(c.wall), r = wallById(c.ref);
  if (!w) return 0;
  var gw = wallGeom(w), A = S.nodes[w.a], B = S.nodes[w.b];
  if (!A || !B || gw.L < 1e-4) return 0;
  if (c.type === "horizontal" || c.type === "vertical") {
    var beforeAxis = snapshotNodes(), axis = c.type === "horizontal" ? 0 : Math.PI / 2;
    if (Math.cos(gw.ang - axis) < 0) axis += Math.PI;
    var targetDeg = (axis * 180) / Math.PI;
    w.lockAng = targetDeg;
    var axisMoved = moveNode(w.b, A.x + Math.cos(axis) * gw.L, A.z + Math.sin(axis) * gw.L);
    var targetL = fin(w.clearL) ? w.clearL : wallClearLength(w);
    var relaxed = settleWallDim(w, targetL, "b", [w.id]);
    enforceLocks(beforeAxis, [w.id].concat(relaxed.yielded));
    return axisMoved;
  }
  if (!r) return 0;
  var gr = wallGeom(r);
  if (gr.L < 1e-4) return 0;
  var before = snapshotNodes(), moved = 0;
  if (c.type === "equalLength") {
    moved = moveNode(w.b, A.x + gw.ux * gr.L, A.z + gw.uz * gr.L);
  } else if (c.type === "wallAngle") {
    /* Swing the driven wall about its own `a` end to the requested opening
       from the reference direction. Same pivot as parallel/perpendicular
       below, of which this is the general case. */
    var wantAng = gr.ang + (c.value * Math.PI) / 180;
    moved = moveNode(w.b, A.x + Math.cos(wantAng) * gw.L, A.z + Math.sin(wantAng) * gw.L);
  } else {
    var target = gr.ang;
    if (c.type === "perpendicular") {
      var plus = gr.ang + Math.PI / 2, minus = gr.ang - Math.PI / 2;
      target = Math.abs(angleDeltaRad(gw.ang, plus)) <= Math.abs(angleDeltaRad(gw.ang, minus)) ? plus : minus;
    } else if (Math.cos(gw.ang - gr.ang) < 0) target += Math.PI;
    var ax = A.x, az = A.z;
    if (c.type === "collinear") {
      var along = (A.x - gr.a.x) * gr.ux + (A.z - gr.a.z) * gr.uz;
      ax = gr.a.x + gr.ux * along;
      az = gr.a.z + gr.uz * along;
      moved += moveNode(w.a, ax, az);
    }
    moved += moveNode(w.b, ax + Math.cos(target) * gw.L, az + Math.sin(target) * gw.L);
  }
  protectLocks(before, [w.id], moved);
  return moved;
}

function angleDeltaRad(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function solvePointWall(c) {
  var r = wallById(c.ref), p = anchorPos(c.point), ni = anchorNode(c.point);
  if (!r || !p || ni == null || !fin(c.value)) return 0;
  var gr = wallGeom(r), cur = pointWallDistanceNow(c.point, r, c.refFace);
  if (cur == null) return 0;
  var before = snapshotNodes(), shift = c.value - cur;
  var moved = moveNode(ni, p.x - gr.uz * shift, p.z + gr.ux * shift);
  protectLocks(before, [ownerWallOfAnchor(c.point)], moved);
  return moved;
}

/* A pin does not drive geometry so much as refuse to let go of it: if the
   corner has drifted, put it back exactly. It runs like any other constraint
   so that "pinned" is a statement in the same list as everything else, and so
   Ctrl+Z restores it with the rest. */
function solveFixed(c) {
  var ni = anchorNode(c.a);
  if (ni == null || !fin(c.x) || !fin(c.z)) return 0;
  var before = snapshotNodes();
  var moved = moveNode(ni, c.x, c.z, true);
  protectLocks(before, [ownerWallOfAnchor(c.a)], moved);
  return moved;
}

function solveCoincident(c) {
  var holdAn = c.hold === "b" ? c.b : c.a,
    moveAn = c.hold === "b" ? c.a : c.b,
    P = anchorPos(holdAn),
    ni = anchorNode(moveAn);
  if (!P || ni == null) return 0;
  var before = snapshotNodes();
  var moved = moveNode(ni, P.x, P.z);
  protectLocks(before, [ownerWallOfAnchor(moveAn)], moved);
  return moved;
}

function solveSymmetric(c) {
  var ax = axisLine(c.axis);
  if (!ax) return 0;
  var holdAn = c.hold === "b" ? c.b : c.a,
    moveAn = c.hold === "b" ? c.a : c.b,
    P = anchorPos(holdAn),
    ni = anchorNode(moveAn);
  if (!P || ni == null) return 0;
  var want = mirrorAcross(P, ax);
  if (!want) return 0;
  var before = snapshotNodes();
  var moved = moveNode(ni, want.x, want.z);
  protectLocks(before, [ownerWallOfAnchor(moveAn)], moved);
  return moved;
}

/* Midpoint drives both coordinates; point-on-line corrects ONLY the
   perpendicular error, which is what leaves the corner free to slide along
   the line it is constrained to. */
function solveOnWallLine(c) {
  var r = wallById(c.ref),
    p = anchorPos(c.point),
    ni = anchorNode(c.point);
  if (!r || !p || ni == null) return 0;
  var g = wallGeom(r);
  if (!fin(g.L) || g.L <= 0) return 0;
  var tx, tz;
  if (c.type === "midpoint") {
    tx = (g.a.x + g.b.x) / 2;
    tz = (g.a.z + g.b.z) / 2;
  } else {
    var along = (p.x - g.a.x) * g.ux + (p.z - g.a.z) * g.uz;
    tx = g.a.x + g.ux * along;
    tz = g.a.z + g.uz * along;
  }
  var before = snapshotNodes();
  var moved = moveNode(ni, tx, tz);
  protectLocks(before, [ownerWallOfAnchor(c.point)], moved);
  return moved;
}

/* Every wall in the set takes the first one's length, growing from its own
   `a` end along its own direction so its angle is untouched. */
function solveEqualLengthSet(c) {
  var walls = c.walls.map(wallById).filter(Boolean);
  if (walls.length < 2) return 0;
  var want = wallGeom(walls[0]).L, moved = 0;
  if (!fin(want) || want <= 0) return 0;
  for (var i = 1; i < walls.length; i++) {
    var w = walls[i], g = wallGeom(w), A = S.nodes[w.a];
    if (!A || g.L < 1e-4) continue;
    var before = snapshotNodes();
    moved += moveNode(w.b, A.x + g.ux * want, A.z + g.uz * want);
    protectLocks(before, [w.id], moved);
  }
  return moved;
}

function solveEqualSpacing(c) {
  var l = spacingLayout(c); if (!l) return 0;
  var moved = 0;
  for (var i = 1; i < l.rows.length - 1; i++) {
    var row = l.rows[i], want = l.rows[0].pos + l.step * i, shift = want - row.pos,
      before = snapshotNodes(), w = row.wall, g = wallGeom(w),
      dir = g.ux * l.rows[0].g.ux + g.uz * l.rows[0].g.uz >= 0 ? 1 : -1,
      ux = l.rows[0].g.ux * dir, uz = l.rows[0].g.uz * dir,
      mx = row.mx + l.nx * shift, mz = row.mz + l.nz * shift, half = g.L / 2;
    moved += moveNode(w.a, mx - ux * half, mz - uz * half);
    moved += moveNode(w.b, mx + ux * half, mz + uz * half);
    protectLocks(before, [w.id], moved);
  }
  return moved;
}

/* Relax every constraint until nothing moves, or PASSES sweeps have run.
   Call it after an edit has already settled (i.e. after enforceLocks), never
   during one — it is the last word on where the corners are.

   Returns {passes, moved, unresolved} — `unresolved` is how many constraints
   are still out afterwards, which is the honest answer when two of them
   contradict each other, and what the UI reports instead of looping forever. */
/* One entry per driving constraint type. A table rather than the ladder of
   ternaries this used to be: the list has grown past the point where adding a
   type meant reading a nested conditional to find where it belonged, and a
   missing branch failed silently by falling through to solveWallRelation. */
var SOLVERS = {
  dist: solveDist,
  angle: solveAngle,
  offset: solveOffset,
  equalAngle: solveEqualAngle,
  equalSpacing: solveEqualSpacing,
  equalLengthSet: solveEqualLengthSet,
  alignX: solveAxis,
  alignZ: solveAxis,
  axisDistX: solveAxis,
  axisDistZ: solveAxis,
  pointWallDist: solvePointWall,
  fixed: solveFixed,
  coincident: solveCoincident,
  symmetric: solveSymmetric,
  midpoint: solveOnWallLine,
  pointOnLine: solveOnWallLine,
  openCentre: solveOpenCentre,
  openDist: solveOpenDist,
  openAlign: solveOpenAlign,
  openSpacing: solveOpenSpacing,
  parallel: solveWallRelation,
  perpendicular: solveWallRelation,
  collinear: solveWallRelation,
  equalLength: solveWallRelation,
  horizontal: solveWallRelation,
  vertical: solveWallRelation,
  wallAngle: solveWallRelation,
};

/* Solve only the constraints that can reach `ids` (node indices), plus the
   pins — used by the live drag pass, where re-solving the whole drawing on
   every mouse move is both slow and startling. Returns null when the subset
   is everything, so the caller can just run the full solve. */
function subsetTouching(list, nodeIds) {
  if (!nodeIds || !nodeIds.length) return null;
  var want = {};
  nodeIds.forEach(function (n) { want[n] = 1; });
  /* Grow the set: a constraint that touches a wanted corner drives another
     one, which may itself be the subject of a third constraint. Two rounds of
     growth cover the chains a plan realistically has without walking the
     whole graph on every mouse move. */
  for (var round = 0; round < 2; round++)
    list.forEach(function (c) {
      conNodes(c).forEach(function (ni) {
        if (want[ni]) conNodes(c).forEach(function (nj) { want[nj] = 1; });
      });
    });
  return list.filter(function (c) {
    if (c.type === "fixed") return true; // pins always participate
    return conNodes(c).some(function (ni) { return want[ni]; });
  });
}

/* Every node index a constraint reads or writes. */
function conNodes(c) {
  var out = [];
  function push(an) {
    var ni = anchorNode(an);
    if (ni != null) out.push(ni);
  }
  function pushWall(id) {
    var w = wallById(id);
    if (w) out.push(w.a, w.b);
  }
  push(c.a); push(c.b); push(c.point); push(c.joint);
  if (c.referenceAngle) push(c.referenceAngle.joint);
  if (c.drivenAngle) push(c.drivenAngle.joint);
  if (c.w1 != null) pushWall(c.w1);
  if (c.w2 != null) pushWall(c.w2);
  if (c.wall != null) pushWall(c.wall);
  if (c.ref != null) pushWall(c.ref);
  if (c.axis && c.axis.id != null) pushWall(c.axis.id);
  (c.walls || []).forEach(pushWall);
  /* An opening is positioned along a wall, so dragging that wall's corners
     must re-solve it — otherwise a window stated as "centred" drifts off
     centre the moment the wall is resized. */
  [c.opening, c.a, c.b].concat(c.openings || []).forEach(function (id) {
    var o = typeof id === "string" || typeof id === "number" ? openingById(id) : null;
    if (o) pushWall(o.wall);
  });
  return out;
}

/* Relax every constraint until nothing moves, or PASSES sweeps have run.
   `opts.nodes` restricts the pass to the sub-graph around those corners. */
/* Hooks the plan-level layers that must run around every solve, registered by
   their own modules rather than imported here — plan_params.js and
   room_cons.js both read wallCons(), so importing them would be a cycle. */
var beforeSolve = [], afterSolve = [];
export function onBeforeSolve(fn) {
  if (typeof fn === "function") beforeSolve.push(fn);
}
export function onAfterSolve(fn) {
  if (typeof fn === "function") afterSolve.push(fn);
}

export function solveWallCons(opts) {
  /* Named parameters resolve FIRST: a dimension written as an expression has
     to know its number before the solver reads it, or the plan moves to last
     edit's value and corrects itself one gesture later. */
  beforeSolve.forEach(function (fn) { fn(opts); });
  var list = wallCons();
  if (!list.length) {
    afterSolve.forEach(function (fn) { fn(opts); });
    return { passes: 0, moved: 0, unresolved: 0 };
  }
  var subset = opts && opts.nodes ? subsetTouching(list, opts.nodes) : null;
  var run = subset || list;
  if (!run.length) return { passes: 0, moved: 0, unresolved: conIssues().length };
  /* Hold the lock rule until the sweeps have finished. Enforcing it after every
     individual constraint meant a dimension that moved a shared corner tore the
     room open before the next constraint had had its say — and the repair for
     that (relaxLocks) is far too expensive to run per constraint per sweep: a
     15-room terrace with eight dimensions took three minutes. One settle for
     the whole solve fixes both. Re-entrant solves (the room rules run one from
     the afterSolve hook) leave the outermost one in charge. */
  var outermost = !solveActive,
    entry = outermost ? snapshotNodes() : null;
  if (outermost) solveActive = [];
  var total = 0,
    p = 0;
  for (; p < PASSES; p++) {
    var moved = 0;
    run.forEach(function (c) {
      // `off` is the user's suppress; `report` is a reference dimension, which
      // measures the drawing and is never allowed to change it
      if (c.off || c.report) return;
      var fn = SOLVERS[c.type];
      if (fn) moved += fn(c);
    });
    total += moved;
    if (moved < 0.01) break; // converged
  }
  if (outermost) {
    var edited = solveActive;
    solveActive = null;
    /* The repair belongs to a settled edit, not to a frame of a drag. A drag
       passes opts.nodes, and while a corner is under the pointer the old rule
       is the right one: the walls the user is not dragging keep their length
       and let go of the joint, visibly. The gesture ends with a full solve
       (see the pointerup handler in interaction.js), which is where a plan that
       can still be reconciled gets reconciled. */
    if (total >= 0.01) settleLocks(entry, edited, !subset);
  }
  afterSolve.forEach(function (fn) { fn(opts); });
  refreshReports(); // reference dimensions must never read one gesture stale
  return { passes: p + 1, moved: total, unresolved: conIssues().length };
}

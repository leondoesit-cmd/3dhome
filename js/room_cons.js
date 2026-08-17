/* Room-level requirements: area, minimum dimension, and squaring up.
   ---------------------------------------------------------------------------
   Everything else in the constraint system dimensions a piece of GEOMETRY —
   this wall, that corner, this opening. A room is not geometry, it is a cycle
   of walls the app derives (detectRooms in geometry.js), and what a brief says
   about one is different in kind: "the bedroom must be at least 11 m²", "no
   habitable room narrower than 2.4 m". Those are REQUIREMENTS, and the honest
   way to model a requirement is as a check, not as a driver.

   So this module splits the two apart deliberately:

   - `roomArea` and `roomMinDim` are CHECKS. They never move anything. There is
     no defensible answer to "which corner should move to make this room 2 m²
     bigger?" — any choice would silently rearrange a plan the user was still
     drawing, and the four different answers a solver could pick are all
     equally wrong. They report, in red, and the user decides.
   - `roomRect` DRIVES, because for a four-corner room "make it rectangular"
     has exactly one sensible answer: the best-fitting oriented rectangle. It
     refuses anything that is not a four-corner loop rather than guessing.

   Rooms are keyed by `key` — the sorted list of their bounding wall ids, the
   same identity S.roomMeta uses. That key changes when the SET of bounding
   walls changes, which is a known weakness documented in geometry.js; a
   requirement whose room has genuinely been redrawn is dropped by pruning
   rather than silently re-attached to whatever now has that key. */
import { S, fin, uid } from "./state.js";
import { detectRooms } from "./geometry.js";

export function roomCons() {
  if (!Array.isArray(S.roomCons)) S.roomCons = [];
  return S.roomCons;
}

function roomByKeyLive(key) {
  return detectRooms().find(function (r) {
    return r.key === key;
  }) || null;
}

/* ---- authoring ---------------------------------------------------------- */

/* `mode` is "min" | "max" | "exact". A brief almost always states a minimum,
   so that is the default — and it is why area is not simply a number to match:
   "at least 11 m²" is satisfied by 14 and an exact-match check would call that
   a failure. Areas are held in SQUARE METRES because that is the unit a brief
   is written in, while everything else here is centimetres. */
export function addRoomArea(key, value, mode) {
  if (!roomByKeyLive(key)) return null;
  var m = mode === "max" || mode === "exact" ? mode : "min";
  var c = {
    id: uid(), type: "roomArea", room: key, mode: m,
    value: fin(value) ? value : Math.round(roomAreaM2(key) * 10) / 10,
  };
  return addUnique(c);
}

/* The narrowest the room gets, in centimetres — the width of the tightest
   place a person has to pass through, which is the number a habitability rule
   or a wheelchair turning circle is actually about. */
export function addRoomMinDim(key, value) {
  if (!roomByKeyLive(key)) return null;
  var c = {
    id: uid(), type: "roomMinDim", room: key,
    value: fin(value) ? value : Math.round(roomMinDim(key) || 0),
  };
  return addUnique(c);
}

export function addRoomRect(key) {
  var r = roomByKeyLive(key);
  if (!r || r.pts.length !== 4) return null;
  return addUnique({ id: uid(), type: "roomRect", room: key });
}

function addUnique(c) {
  var key = c.type + ":" + c.room;
  if (roomCons().some(function (old) { return old.type + ":" + old.room === key; }))
    return null;
  roomCons().push(c);
  return c;
}

export function removeRoomCon(id) {
  S.roomCons = roomCons().filter(function (c) {
    return c.id !== id;
  });
}
export function setRoomConValue(id, v) {
  var c = roomCons().find(function (q) { return q.id === id; });
  if (!c || !fin(v)) return false;
  c.value = v;
  return true;
}
export function setRoomConMode(id, mode) {
  var c = roomCons().find(function (q) { return q.id === id; });
  if (!c || c.type !== "roomArea") return false;
  c.mode = mode === "max" || mode === "exact" ? mode : "min";
  return true;
}

/* A requirement about a room that no longer exists is worse than none — it
   reports a failure about something the user cannot see or select. */
export function pruneRoomCons() {
  var live = {};
  detectRooms().forEach(function (r) { live[r.key] = 1; });
  var before = roomCons().length;
  S.roomCons = roomCons().filter(function (c) { return live[c.room]; });
  return before - S.roomCons.length;
}

export function consForRoom(key) {
  return roomCons().filter(function (c) { return c.room === key; });
}

/* ---- measuring ---------------------------------------------------------- */

export function roomAreaM2(key) {
  var r = roomByKeyLive(key);
  return r ? Math.abs(r.area) / 10000 : null; // cm² -> m²
}

/* The room's narrowest span. Measured as the smallest distance from any corner
   to any non-adjacent EDGE, which is what "how narrow does it get" means for
   an L-shaped room — a bounding box would report the overall width and miss
   the pinch entirely. */
export function roomMinDim(key) {
  var r = roomByKeyLive(key);
  if (!r || r.pts.length < 3) return null;
  var pts = r.pts, n = pts.length, best = Infinity;
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) {
      // skip the two edges this corner is an endpoint of
      if (j === i || (j + 1) % n === i) continue;
      var a = pts[j], b = pts[(j + 1) % n], p = pts[i];
      var dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      if (L2 < 1e-9) continue;
      var tt = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
      tt = Math.max(0, Math.min(1, tt));
      var d = Math.hypot(p.x - (a.x + dx * tt), p.z - (a.z + dz * tt));
      if (d > 0.5 && d < best) best = d; // ignore a corner touching its own edge
    }
  }
  return isFinite(best) ? best : null;
}

/* How far out, in the constraint's own unit, always positive. Zero when met —
   including when a minimum is comfortably exceeded, which is the whole point
   of the mode. */
export function roomConError(c) {
  if (!c || c.off) return 0;
  if (c.type === "roomArea") {
    var a = roomAreaM2(c.room);
    if (a == null) return null;
    if (c.mode === "min") return a >= c.value ? 0 : c.value - a;
    if (c.mode === "max") return a <= c.value ? 0 : a - c.value;
    return Math.abs(a - c.value);
  }
  if (c.type === "roomMinDim") {
    var d = roomMinDim(c.room);
    if (d == null) return null;
    return d >= c.value ? 0 : c.value - d;
  }
  if (c.type === "roomRect") {
    var r = roomByKeyLive(c.room);
    if (!r || r.pts.length !== 4) return null;
    // worst corner deviation from a right angle, in degrees
    var worst = 0;
    for (var i = 0; i < 4; i++) {
      var p = r.pts[(i + 3) % 4], q = r.pts[i], s = r.pts[(i + 1) % 4];
      var a1 = Math.atan2(p.z - q.z, p.x - q.x), a2 = Math.atan2(s.z - q.z, s.x - q.x);
      var deg = Math.abs(((a2 - a1) * 180) / Math.PI) % 360;
      if (deg > 180) deg = 360 - deg;
      worst = Math.max(worst, Math.abs(90 - deg));
    }
    return worst;
  }
  return null;
}

export function roomConSatisfied(c) {
  if (!c || c.off) return true;
  var e = roomConError(c);
  if (e == null) return false;
  // areas in m² to a tenth, spans in cm to half a centimetre, angles to a fifth
  // of a degree — each unit's own idea of "close enough"
  var tol = c.type === "roomArea" ? 0.05 : c.type === "roomMinDim" ? 0.5 : 0.2;
  return e <= tol;
}

export function roomIssues() {
  return roomCons()
    .map(function (c) {
      if (c.off) return null;
      var e = roomConError(c);
      return e == null || roomConSatisfied(c) ? null : { con: c, error: e };
    })
    .filter(Boolean);
}

/* ---- the one that drives ------------------------------------------------ */

/* Square up a four-corner room: fit the best oriented rectangle to its corners
   and move them onto it.

   The orientation comes from the room's LONGEST edge rather than from a
   least-squares fit of all four. A room being squared up is usually nearly
   rectangular already with one corner out, and the longest edge is the one the
   user is least likely to think of as the wrong one — fitting all four equally
   would rotate the whole room slightly to split the error, which reads as the
   editor having moved everything rather than having fixed the corner. */
export function solveRoomRect(c) {
  var r = roomByKeyLive(c.room);
  if (!r || r.pts.length !== 4 || !r.nidx || r.nidx.length !== 4) return 0;

  var pts = r.pts, nidx = r.nidx;
  var longest = 0, bestL = -1;
  for (var i = 0; i < 4; i++) {
    var q = pts[(i + 1) % 4], p = pts[i],
      L = Math.hypot(q.x - p.x, q.z - p.z);
    if (L > bestL) { bestL = L; longest = i; }
  }
  var ax = pts[(longest + 1) % 4].x - pts[longest].x,
    az = pts[(longest + 1) % 4].z - pts[longest].z,
    aL = Math.hypot(ax, az);
  if (aL < 1e-6) return 0;
  var ux = ax / aL, uz = az / aL, nx = -uz, nz = ux;

  // centre of the four corners, and their extent along the two axes
  var cx = 0, cz = 0;
  pts.forEach(function (p) { cx += p.x; cz += p.z; });
  cx /= 4; cz /= 4;
  var u = [], v = [];
  pts.forEach(function (p) {
    u.push((p.x - cx) * ux + (p.z - cz) * uz);
    v.push((p.x - cx) * nx + (p.z - cz) * nz);
  });
  var halfU = (Math.max.apply(null, u) - Math.min.apply(null, u)) / 2,
    halfV = (Math.max.apply(null, v) - Math.min.apply(null, v)) / 2;

  var moved = 0;
  for (var k = 0; k < 4; k++) {
    var su = u[k] >= 0 ? 1 : -1, sv = v[k] >= 0 ? 1 : -1;
    var wantX = cx + ux * su * halfU + nx * sv * halfV,
      wantZ = cz + uz * su * halfU + nz * sv * halfV;
    var node = S.nodes[nidx[k]];
    if (!node) continue;
    var d = Math.hypot(wantX - node.x, wantZ - node.z);
    if (d < 1e-6) continue;
    node.x = wantX;
    node.z = wantZ;
    moved += d;
  }
  return moved;
}

/* Run every driving room constraint. Checks are skipped here by construction:
   only roomRect has an entry. */
export function solveRoomCons() {
  var moved = 0;
  roomCons().forEach(function (c) {
    if (c.off || c.type !== "roomRect") return;
    moved += solveRoomRect(c);
  });
  return { moved: moved, unresolved: roomIssues().length };
}

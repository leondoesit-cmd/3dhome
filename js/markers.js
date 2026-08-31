// Placeholder points on the 2D plan and elevations.
//
// A point is a marked spot in the model — snapped to a corner, a wall or the
// grid like any other drafting click — that permanently shows its clearances so
// you can decide where something goes before you own the something. A point can
// hold one catalogue piece, chosen either when the point is placed or any time
// later; the piece is mounted on it.
//
// A point is FULLY 3D: {x, y, z}. y is height above the floor, so a point can
// sit on the floor, up a wall, or on the ceiling — which is the whole reason
// the elevation views can place them. `surface` records which of those it is,
// and for a wall point `wall`+`nx,nz` record which wall and which way is "into
// the room", so a piece dropped on it faces the right way and stands clear of
// the wall instead of inside it.
//
// The link to the held piece is deliberately one-way and lazy:
//   - moving the POINT carries its piece along, in all three axes;
//   - dragging the PIECE clear of the point releases the point (see
//     releaseIfMoved), so "the TV goes here" stops claiming a TV that now
//     lives across the room;
//   - the link is stored as an item id and resolved on demand, so deleting the
//     piece simply leaves the point free again — no dangling state to clean up.
import { S, uid, fin } from "./state.js";
import { FURN, mkItem, flabel, itemVSpan, isLamp } from "./furniture.js";
import { detectRooms, pointInPoly, roomName, wallGeom, wallById, distSeg } from "./geometry.js";
import { itemCorners, markerClearMap } from "./measure.js";
import { itemPlaceCommand, executeCommand } from "./commands/index.js";

export const SURFACES = ["floor", "wall", "ceiling"];

// S.markers is created lazily so older saves (and any code path that replaces
// the model wholesale) can never hand us undefined.
export function markers() {
  if (!S.markers) S.markers = [];
  return S.markers;
}

// Returns null rather than creating a point the views could never draw or
// measure from — a NaN position is invisible, and still saves (as null).
export function addMarker(p) {
  if (!p || !fin(p.x) || !fin(p.z)) return null;
  var m = {
    id: uid(),
    x: p.x,
    y: fin(p.y) ? p.y : 0,
    z: p.z,
    name: p.name || "",
    surface: SURFACES.indexOf(p.surface) === -1 ? "floor" : p.surface,
    wall: p.wall != null ? p.wall : null,
    nx: fin(p.nx) ? p.nx : 0,
    nz: fin(p.nz) ? p.nz : 0,
    // the clear space this spot is REQUIRED to keep on every side (cm). Purely
    // the designer's own intent — nothing enforces it, but every readout
    // flags the sides that fall short, which is what turns a point from a
    // measured dot into a brief.
    req: fin(p.req) ? p.req : null,
    note: typeof p.note === "string" ? p.note : "",
    itemId: null,
  };
  markers().push(m);
  return m;
}

// A copy of the point, its brief and its surface — but never its piece: two
// points cannot hold the same object, and a duplicate is made to reserve a
// SECOND spot, not to claim the first one's furniture.
export function duplicateMarker(m, dx, dz) {
  if (!m) return null;
  return addMarker({
    x: m.x + (fin(dx) ? dx : 0),
    y: m.y,
    z: m.z + (fin(dz) ? dz : 0),
    name: "",
    surface: m.surface,
    wall: m.wall,
    nx: m.nx,
    nz: m.nz,
    req: m.req,
    note: m.note,
  });
}

export function deleteMarker(m) {
  S.markers = markers().filter(function (o) {
    return o !== m;
  });
}

// The piece currently standing on this point, or null when it is free (also
// null once that piece has been deleted — the id simply stops resolving).
export function markerItem(m) {
  if (!m || m.itemId == null) return null;
  for (var i = 0; i < S.items.length; i++)
    if (S.items[i].id === m.itemId) return S.items[i];
  return null;
}

// reverse lookup: the point an item is standing on, if any
export function markerOf(it) {
  if (!it) return null;
  var ms = markers();
  for (var i = 0; i < ms.length; i++) if (ms[i].itemId === it.id) return ms[i];
  return null;
}

export function markerLabel(m) {
  if (m && m.name) return m.name;
  var i = markers().indexOf(m);
  return "P" + (i >= 0 ? i + 1 : "?");
}

// what the point is reserved for, for tree rows and toasts
export function markerDesc(m) {
  var it = markerItem(m);
  return markerLabel(m) + (it ? " · " + flabel(it.type) : "");
}

/* Seat a piece on a point.

   The point is the piece's CENTRE, not a corner and not the spot it stands on:
   a point is placed where you want the middle of the thing to be, and the piece
   is built around it in every axis. That is also what makes the point's own
   clearances readable — they are measured from the piece's outer edges (see
   measure.js), which only lines up if the piece is centred here.

   - Horizontally: centred on the point. A wall point additionally turns the
     piece to face along the stored normal; the convention is the one every
     other placer uses — front is local +Z, so world front is
     (-sin rot, cos rot), hence rot = atan2(-nx, nz).
   - Vertically: `elev` is the world Y of the piece's BOTTOM, so centring means
     dropping it by half its own height. A ceiling point is the one exception —
     it hangs the piece so its TOP meets the ceiling, which is what "on the
     ceiling" means. A point at floor level clears `elev` entirely, so ordinary
     furniture keeps standing on the floor instead of sinking half-way in. */
export function seatItem(m, it) {
  if (!m || !it) return;
  if (m.surface === "wall" && (m.nx || m.nz)) {
    var L = Math.hypot(m.nx, m.nz) || 1;
    var ux = m.nx / L,
      uz = m.nz / L;
    it.rot = (((Math.atan2(-ux, uz) * 180) / Math.PI) % 360 + 360) % 360;
  }
  it.x = m.x;
  it.z = m.z;
  // the piece's own height, measured WITHOUT its current offset — reading its
  // placed span instead would walk it down by half a height on every reseat
  var probe = { type: it.type, w: it.w, d: it.d, h: it.h, variant: it.variant };
  var sp = itemVSpan(probe),
    hgt = sp.hi - sp.lo;
  if (m.surface === "ceiling") {
    it.elev = m.y - hgt;
  } else if (m.y > 0.5) {
    it.elev = m.y - hgt / 2;
  } else {
    // a point at floor level does not override height at all, so a wall TV
    // dropped on a floor-level wall point still hangs where its model says
    delete it.elev;
  }
}

// Centre a piece on the point and record the pairing. A point holds at most one
// piece, and a piece stands on at most one point, so both sides of any previous
// pairing are cleared first.
export function attachToMarker(m, it) {
  if (!m || !it) return;
  markers().forEach(function (o) {
    if (o !== m && o.itemId === it.id) o.itemId = null;
  });
  m.itemId = it.id;
  seatItem(m, it);
}

export function detachMarker(m) {
  if (m) m.itemId = null;
}

// Create the chosen catalogue piece on the point. Returns the new item, or null
// if the type is unknown or the point somehow holds a non-finite position.
export function placeOnMarker(m, type) {
  if (!m || !FURN[type] || !fin(m.x) || !fin(m.z)) return null;
  var result = executeCommand(itemPlaceCommand, { type: type, x: m.x, z: m.z }, {
    domain: "planner",
    state: S,
    itemCatalog: FURN,
    services: { createItem: mkItem },
  }, { history: false });
  if (!result.ok || !result.created.length) return null;
  var madeId = result.created[0].id;
  var it = S.items.find(function(item) { return item.id === madeId; });
  if (!it) return null;
  attachToMarker(m, it);
  return it;
}

// Move the point in any axis, taking its piece with it.
export function moveMarker(m, x, y, z) {
  if (!m) return;
  if (fin(x)) m.x = x;
  if (fin(y)) m.y = y;
  if (fin(z)) m.z = z;
  var it = markerItem(m);
  if (it) seatItem(m, it);
}

// Change which surface the point mounts on (and, for a wall, which wall it
// belongs to) — reseating whatever stands on it.
export function setMarkerSurface(m, surface, wall, nx, nz) {
  if (!m || SURFACES.indexOf(surface) === -1) return;
  m.surface = surface;
  if (surface === "wall") {
    if (wall !== undefined) m.wall = wall;
    if (fin(nx)) m.nx = nx;
    if (fin(nz)) m.nz = nz;
  } else {
    m.wall = null;
  }
  var it = markerItem(m);
  if (it) seatItem(m, it);
}

/* A piece dragged (or nudged, or retyped) clear of its point releases it.
   Called after any edit that can move an item. The piece is seated centred on
   the point, so the comparison is against the point itself; the 1cm slack keeps
   rounding from breaking a pairing that never really moved. */
export function releaseIfMoved(it) {
  var m = markerOf(it);
  if (!m) return;
  if (Math.hypot(it.x - m.x, it.z - m.z) > 1) m.itemId = null;
}
export function releaseMovedItems(items) {
  (items || []).forEach(releaseIfMoved);
}

/* ---- what a point knows about where it sits ----

   One aggregate read, shared by the inspector panel and the plan's hover card,
   for the same reason measure.js exists: two readers of the same spot must not
   be able to print different stories about it. Everything here is derived — a
   point stores a position and an intent, never a cached answer, so a wall moved
   later cannot leave a stale room name behind.

   `ceil` is passed in rather than imported: elevation.js pulls in the whole 3D
   side, and this module is used by the plain 2D plan. */

// distance from a spot to the nearest INNER face of any wall (walls run along
// their centreline, so half the thickness comes off), with the wall itself.
function nearestWall(x, z) {
  var best = null;
  S.walls.forEach(function (w) {
    var g = wallGeom(w);
    var d = distSeg(x, z, g.a.x, g.a.z, g.b.x, g.b.z) - (w.thickness || 0) / 2;
    if (!fin(d)) return;
    if (!best || d < best.dist) best = { wall: w, dist: Math.max(0, d) };
  });
  return best;
}

// nearest piece measured to its FOOTPRINT edge, not its centre — "the sofa is
// 40 away" has to mean the sofa, not the dot inside it. Lamps are skipped for
// the same reason measure4 skips them.
function nearestPiece(x, z, skip) {
  var best = null;
  S.items.forEach(function (it) {
    if (it === skip || isLamp(it)) return;
    var cs = itemCorners(it),
      d = Infinity;
    for (var i = 0; i < 4; i++) {
      var a = cs[i],
        b = cs[(i + 1) % 4];
      d = Math.min(d, distSeg(x, z, a.x, a.z, b.x, b.z));
    }
    if (pointInPoly(x, z, cs)) d = 0;
    if (!fin(d)) return;
    if (!best || d < best.dist) best = { item: it, dist: d };
  });
  return best;
}

export function markerInfo(m, ceil) {
  var held = markerItem(m),
    dm = markerClearMap(m, held),
    y = m.y || 0;
  // the room is the one whose polygon contains the point; an unnamed room still
  // reads as "Room" so "outside the plan" stays distinguishable from "unnamed"
  var room = null;
  detectRooms().forEach(function (r) {
    if (!room && pointInPoly(m.x, m.z, r.pts)) room = r;
  });
  var mounted = m.surface === "wall" && m.wall != null ? wallById(m.wall) : null;
  var nw = nearestWall(m.x, m.z),
    np = nearestPiece(m.x, m.z, held);
  // the sides that fall short of the point's own brief. A direction with
  // nothing in it (open plan) is infinitely clear, not a violation.
  var tight = [];
  if (fin(m.req) && m.req > 0)
    ["n", "s", "e", "w"].forEach(function (k) {
      if (dm[k] != null && dm[k] < m.req - 0.5) tight.push(k);
    });
  return {
    m: m,
    label: markerLabel(m),
    held: held,
    dm: dm,
    room: room,
    roomName: room ? roomName(room.key) : "",
    wall: mounted,
    wallDist: nw ? nw.dist : null,
    wallIsMount: !!(mounted && nw && nw.wall === mounted),
    near: np,
    y: y,
    toCeil: fin(ceil) ? Math.max(0, ceil - y) : null,
    tight: tight,
  };
}

// hit-test in the top-down plan (world cm)
export function hitMarker(px, pz) {
  var thr = 12 / S.SC;
  if (!isFinite(thr) || thr <= 0) thr = 12;
  var best = null,
    bd = thr;
  markers().forEach(function (m) {
    var d = Math.hypot(px - m.x, pz - m.z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  });
  return best;
}

// Load-time sanitiser, mirroring how applyData filters walls and items: a point
// with a non-finite position could never be drawn or measured from, and a link
// to an id that is not in the file is simply a free point. Points saved before
// points had a height load as floor points, which is what they were.
export function normalizeMarkers(list, items) {
  var ids = {};
  (items || []).forEach(function (it) {
    ids[it.id] = 1;
  });
  return (list || [])
    .filter(function (m) {
      return m && fin(m.x) && fin(m.z);
    })
    .map(function (m) {
      return {
        id: m.id || uid(),
        x: m.x,
        y: fin(m.y) ? m.y : 0,
        z: m.z,
        name: typeof m.name === "string" ? m.name : "",
        surface: SURFACES.indexOf(m.surface) === -1 ? "floor" : m.surface,
        wall: m.wall != null ? m.wall : null,
        nx: fin(m.nx) ? m.nx : 0,
        nz: fin(m.nz) ? m.nz : 0,
        req: fin(m.req) ? m.req : null,
        note: typeof m.note === "string" ? m.note : "",
        itemId: m.itemId != null && ids[m.itemId] ? m.itemId : null,
      };
    });
}

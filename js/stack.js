// Piece-on-piece stacking: the vertical axis of object snapping.
//
// The plan already snaps a dragged piece in x/z — its edges go flush against
// other pieces' edges, so a run of different cabinets lines up as one worktop
// (see alignItem in interaction.js). What it could not do is the third axis: a
// dryer put on a washing machine landed on the FLOOR, inside the machine.
//
// The link is a parent id on the piece: `it.on` = the id of the piece it stands
// on, and `it.elev` = the world Y of its own bottom, which is exactly the top of
// the host. `elev` is the field the 3D view and the elevations already honour
// (furniture_api.elevOffset), so nothing downstream has to learn about stacking
// at all — a stacked piece is just a piece with a mount height, and one that
// re-derives itself whenever the host moves, turns, grows or disappears.
//
// Deliberately one parent, many children, arbitrary depth: a tray on a box on a
// table is three links. Cycles are impossible by construction (`wouldCycle`).
//
// Every mutation of a host goes through one of the four verbs here —
// carryChildren (translate), rotateWith (turn), reseat (re-derive heights),
// orphanChildren (host gone) — so there is no path that leaves a piece floating
// where its host used to be.
import { S, fin } from "./state.js";
import { itemVSpan } from "./furniture.js";
import { itemCorners } from "./measure.js";

/* A host has to be something you could actually put a thing ON: it needs a top
   that is off the floor and within reach. Below MIN_TOP a "host" is a rug or a
   floor mat and stacking on it is almost always a mis-drop; above MAX_TOP is
   the top of a wardrobe, which is a legitimate place to put a box — so the
   ceiling here is generous and only excludes things like a hung ceiling light
   whose "top" is at 250. */
const MIN_TOP = 8,
  MAX_TOP = 230;

export function itemById(id) {
  if (id == null) return null;
  for (var i = 0; i < S.items.length; i++)
    if (S.items[i].id === id) return S.items[i];
  return null;
}

// world Y of a piece's top, including any mount height it already carries
export function topOf(it) {
  return itemVSpan(it).hi;
}

// the piece this one stands on, or null (also null if the id dangles)
export function hostOf(it) {
  return it && it.on != null ? itemById(it.on) : null;
}

// direct children only
export function childrenOf(it) {
  if (!it) return [];
  return S.items.filter(function (o) {
    return o.on === it.id;
  });
}

/* References can be refreshed during an edit; ancestry follows stable IDs.
   Remember visited IDs so an already-corrupt pile cannot loop forever or
   accept another piece into its cycle. */
export function wouldCycle(it, host) {
  var p = host;
  const seen = new Set();
  while (p) {
    if (p === it || (it?.id != null && p.id === it.id)) return true;
    const key = p.id ?? p;
    if (seen.has(key)) return true;
    seen.add(key);
    p = hostOf(p);
  }
  return false;
}

// standard even-odd point-in-polygon against a piece's (rotated) footprint
function inFootprint(x, z, it) {
  var cs = itemCorners(it),
    inside = false;
  for (var i = 0, j = 3; i < 4; j = i++) {
    if (
      cs[i].z > z !== cs[j].z > z &&
      x <
        ((cs[j].x - cs[i].x) * (z - cs[i].z)) / (cs[j].z - cs[i].z) + cs[i].x
    )
      inside = !inside;
  }
  return inside;
}

/* What would `it` land on if it were dropped at (x, z)?

   The test is the dragged piece's CENTRE against the candidate's footprint,
   not an area overlap: it is the rule the user can predict from the cursor
   alone ("the middle of the dryer is over the machine"), and it refuses the
   accidental attach you get when two cabinets in a flush row merely touch.

   Of the candidates, the HIGHEST top wins, so dropping onto an existing pile
   lands on the pile rather than tunnelling into the bottom of it. */
export function findSupport(it, x, z) {
  if (!it || S.snapObj === false) return null;
  var best = null,
    bestTop = -Infinity;
  for (var i = 0; i < S.items.length; i++) {
    var o = S.items[i];
    if (o === it || o.locked) continue;
    // never stand a piece on something that (directly or not) stands on it
    if (wouldCycle(it, o)) continue;
    if (!inFootprint(x, z, o)) continue;
    var top = topOf(o);
    if (!fin(top) || top < MIN_TOP || top > MAX_TOP) continue;
    if (top > bestTop) {
      bestTop = top;
      best = o;
    }
  }
  return best;
}

// Put `it` on `host` (or take it off, host = null). Idempotent: re-attaching to
// the same host just re-derives the height, which is what a drag does on every
// pointermove.
export function attach(it, host) {
  if (!it) return;
  if (!host) {
    detach(it);
    return;
  }
  if (wouldCycle(it, host)) return;
  it.on = host.id;
  it.elev = topOf(host);
}
export function detach(it) {
  if (!it) return;
  delete it.on;
  delete it.elev;
}

/* Re-derive the mount height of everything standing on `it`, depth-first —
   raising a washing machine has to raise the dryer on it, and the shelf on the
   dryer. Called after any change to the host's own height or mount height:
   a size edit, a variant swap, or its own host moving. */
export function reseat(it, seen) {
  if (!it) return;
  seen = seen || new Set();
  if (seen.has(it.id)) return; // corrupt file with a cycle: stop, don't hang
  seen.add(it.id);
  var top = topOf(it);
  childrenOf(it).forEach(function (c) {
    if (fin(top)) c.elev = top;
    reseat(c, seen);
  });
}

/* Translate everything standing on `it` by the same delta, depth-first.
   `moved` is the set of pieces the caller has already moved itself — a
   multi-selection that contains both a table and the lamp on it must not move
   the lamp twice. Returns the pieces it actually moved so the caller can queue
   their 3D updates. */
export function carryChildren(it, dx, dz, moved, out) {
  out = out || [];
  if (!it || (!dx && !dz)) return out;
  childrenOf(it).forEach(function (c) {
    if (moved && moved.has(c)) return;
    c.x += dx;
    c.z += dz;
    out.push(c);
    if (moved) moved.add(c);
    carryChildren(c, dx, dz, moved, out);
  });
  return out;
}

// every piece standing on `it`, at any depth, excluding those in `seen`
export function descendantsOf(it, seen, out) {
  out = out || [];
  childrenOf(it).forEach(function (c) {
    if (seen && seen.has(c)) return;
    if (seen) seen.add(c);
    out.push(c);
    descendantsOf(c, seen, out);
  });
  return out;
}

/* Turn everything standing on `it` with it: each child orbits the host's centre
   by `deg` and turns by `deg` itself, so a stack of boxes on a rotated cabinet
   keeps its arrangement instead of sliding off the corner. */
export function rotateWith(it, deg, moved, out) {
  out = out || [];
  if (!it || !deg) return out;
  var a = (deg * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    ox = it.x,
    oz = it.z;
  (function spin(host) {
    childrenOf(host).forEach(function (ch) {
      if (moved && moved.has(ch)) return;
      var rx = ch.x - ox,
        rz = ch.z - oz;
      ch.x = ox + rx * c - rz * s;
      ch.z = oz + rx * s + rz * c;
      ch.rot = ((((ch.rot || 0) + deg) % 360) + 360) % 360;
      out.push(ch);
      if (moved) moved.add(ch);
      spin(ch);
    });
  })(it);
  return out;
}

/* The host is gone (deleted, or filtered out on load). Its children come down
   to the floor rather than hanging in mid-air, and they keep their x/z — where
   the user put them is still information. Returns the orphans. */
export function orphanChildren(hosts) {
  var live = new Set(S.items.map(function (o) { return o.id; }));
  var out = [];
  S.items.forEach(function (o) {
    if (o.on == null) return;
    if (!live.has(o.on) || (hosts && hosts.has(o.on))) {
      detach(o);
      out.push(o);
    }
  });
  return out;
}

/* Called after a piece is dragged or nudged under its own power: if its centre
   has left the host's footprint it is no longer standing on it. Keeping the
   link "sticky" until the centre actually leaves is what lets you shuffle a
   dryer 2 cm on the machine without it dropping to the floor. */
export function refreshSupport(it) {
  var h = hostOf(it);
  if (!h) {
    if (it && it.on != null) detach(it); // dangling id
    return false;
  }
  if (!inFootprint(it.x, it.z, h)) {
    detach(it);
    return true;
  }
  it.elev = topOf(h);
  return false;
}

// Load-time sanity: drop links to pieces that did not survive, and any cycle
// a hand-edited or older file might carry.
export function normalizeStacks() {
  orphanChildren(null);
  S.items.forEach(function (it) {
    if (it.on == null) return;
    var p = hostOf(it),
      n = 0;
    while (p && n++ < 64) {
      if (p === it) {
        detach(it);
        return;
      }
      p = hostOf(p);
    }
  });
  // heights are derived, never trusted from the file for a stacked piece
  S.items.forEach(function (it) {
    if (it.on == null) reseat(it);
  });
}

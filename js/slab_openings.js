/* Stairwell / slab openings.

   Storeys are separate scene snapshots (js/floors.js). A void lives on the
   floor whose SLAB it cuts — typically the storey above the stairs. Stairs
   stay ordinary furniture on the lower floor; this opening is the hole that
   lets the well exist in 2D and 3D.

   Shape is a rotated rectangle: {id, x, z, w, d, rot, stairsId?, name}. */

import { S, uid, fin } from "./state.js";
import { pointInPoly, detectRooms } from "./geometry.js";
import { layerRank } from "./layers.js";

export function slabOpenings() {
  if (!S.slabOpenings) S.slabOpenings = [];
  return S.slabOpenings;
}

export function openingCorners(o) {
  var A = ((o.rot || 0) * Math.PI) / 180,
    c = Math.cos(A),
    s = Math.sin(A),
    hw = (Number(o.w) || 0) / 2,
    hd = (Number(o.d) || 0) / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(function (p) {
    return { x: o.x + p[0] * c - p[1] * s, z: o.z + p[0] * s + p[1] * c };
  });
}

/* A void is a hole cut in the structure's slab, so it answers to the STRUCTURE
   layer: hide or ghost structure and the void stops being a pick target along
   with the walls it belongs to. */
export function hitSlabOpening(px, pz, pad) {
  if (layerRank("structure") === Infinity) return null;
  pad = pad || 0;
  var list = slabOpenings(), i, o, cs, minx, maxx, minz, maxz;
  for (i = list.length - 1; i >= 0; i--) {
    o = list[i];
    if (!fin(o.x) || !fin(o.z) || !(o.w > 0) || !(o.d > 0)) continue;
    cs = openingCorners(o);
    minx = Math.min(cs[0].x, cs[1].x, cs[2].x, cs[3].x) - pad;
    maxx = Math.max(cs[0].x, cs[1].x, cs[2].x, cs[3].x) + pad;
    minz = Math.min(cs[0].z, cs[1].z, cs[2].z, cs[3].z) - pad;
    maxz = Math.max(cs[0].z, cs[1].z, cs[2].z, cs[3].z) + pad;
    if (px < minx || px > maxx || pz < minz || pz > maxz) continue;
    if (pointInPoly(px, pz, cs)) return o;
  }
  return null;
}

export function addSlabOpening(fields) {
  var o = Object.assign({
    id: uid(),
    x: 0,
    z: 0,
    w: 100,
    d: 250,
    rot: 0,
    name: "",
  }, fields || {});
  o.w = Math.max(40, Number(o.w) || 100);
  o.d = Math.max(40, Number(o.d) || 250);
  o.rot = Number(o.rot) || 0;
  slabOpenings().push(o);
  return o;
}

export function removeSlabOpening(o) {
  S.slabOpenings = slabOpenings().filter(function (x) { return x !== o && x.id !== (o && o.id); });
}

export function openingFromRect(a, b) {
  var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
  var z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  var w = x1 - x0, d = z1 - z0;
  if (w < 40 || d < 40) return null;
  return addSlabOpening({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: w, d: d, rot: 0 });
}

/* The void a flight of stairs needs, as plain fields — the caller decides
   which storey it lands on (js/floors.js addSlabOpeningToFloor). */
export function stairVoidFields(it) {
  if (!it) return null;
  return {
    id: uid(),
    x: it.x,
    z: it.z,
    w: Math.max(40, it.w || 100),
    d: Math.max(40, it.d || 250),
    rot: it.rot || 0,
    stairsId: it.id,
    name: "Stairwell",
  };
}

/* `stairsId` used to be written and never read, so a void stayed behind when
   its flight moved. Re-seat any void in `list` that belongs to these stairs.
   Returns true when something actually changed. */
export function applyStairMoveTo(list, it) {
  if (!Array.isArray(list) || !it || it.id == null) return false;
  var changed = false;
  list.forEach(function (o) {
    if (!o || o.stairsId !== it.id) return;
    var w = Math.max(40, it.w || 100), d = Math.max(40, it.d || 250), rot = it.rot || 0;
    if (o.x === it.x && o.z === it.z && o.w === w && o.d === d && o.rot === rot) return;
    o.x = it.x;
    o.z = it.z;
    o.w = w;
    o.d = d;
    o.rot = rot;
    changed = true;
  });
  return changed;
}

/* Hole loops for a room polygon, in the same XZ point shape polyMesh wants.
   Only openings whose centre sits in the room are punched; a void that
   straddles two rooms is assigned to the room that owns its centre. */
export function holesForRoom(roomPts, openings) {
  if (!roomPts || roomPts.length < 3) return [];
  return (openings || slabOpenings()).filter(function (o) {
    return fin(o.x) && fin(o.z) && o.w >= 40 && o.d >= 40 && pointInPoly(o.x, o.z, roomPts);
  }).map(function (o) {
    var cs = openingCorners(o);
    // Earcut wants hole winding opposite the outer contour. Reverse if the
    // hole's signed area shares the room's sign.
    var roomArea = signedArea(roomPts), holeArea = signedArea(cs);
    if (roomArea && holeArea && (roomArea > 0) === (holeArea > 0)) cs = cs.slice().reverse();
    return cs;
  });
}

function signedArea(pts) {
  var a = 0, i, j;
  for (i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j].x * pts[i].z - pts[i].x * pts[j].z);
  return a / 2;
}

export function roomsWithOpenings() {
  return detectRooms().map(function (r) {
    return { room: r, holes: holesForRoom(r.pts) };
  });
}

export function normalizeSlabOpenings(list) {
  return (Array.isArray(list) ? list : []).filter(function (o) {
    return o && fin(o.x) && fin(o.z) && Number(o.w) >= 40 && Number(o.d) >= 40;
  }).map(function (o) {
    return {
      id: o.id != null ? o.id : uid(),
      x: o.x,
      z: o.z,
      w: Math.max(40, Number(o.w) || 100),
      d: Math.max(40, Number(o.d) || 250),
      rot: Number(o.rot) || 0,
      stairsId: o.stairsId,
      name: typeof o.name === "string" ? o.name : "",
    };
  });
}

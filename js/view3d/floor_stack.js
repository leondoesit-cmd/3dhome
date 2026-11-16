/* The 3D pane's whole-house view: every other storey drawn at its own level
   around the active one (js/floor_stack.js decides which and where).

   Kept off every path the model takes, like the build ghost: one Group
   ("floorStack") hung on the scene itself, not on `dyn`, so it is never
   picked, selected, exported, walked into, or disposed by rebuild3D. The
   active storey stays the only one you edit; the others are context.

   Each storey is drawn plainly but recognisably: walls as one merged mesh cut
   around doors and windows, floors with their room finish, and the furniture
   built by the catalogue (lights stripped). A storey's group is rebuilt only
   when its stored scene, level or the cut changes — switching storeys swaps
   which ones are stacked; editing the active one costs nothing here. */
import { THREE } from "../three_lazy.js";
import { getMainScene, groundPlaneRef, has3D, requestShadowUpdate, siteDressRef } from "../view3d.js";
import { S, TILE, WALLC } from "../state.js";
import { detectRooms, roomFloor, wallGeom, wallPointAt } from "../geometry.js";
import { wallElevationSpan } from "../elevation.js";
import { wallThickness } from "../wall_types.js";
import { normalizeWallKind } from "../wall_curves.js";
import { holesForRoom } from "../slab_openings.js";
import { floorTexture, polyMesh } from "../primitives.js";
import { FURN, buildItem as buildFurn, elevOffset } from "../furniture.js";
import { mergeItemMeshes } from "../view3d/item_merge.js";
import { cutH } from "../view3d/site_cutaway.js";
import { boxArrays, carriedTop, openingCut, riseAbove, slabDepth, stackedFloors, wallSolidPieces, withFloorScene } from "../floor_stack.js";

var fsGroup = null;
var fsEntries = new Map(); // floor id -> { scene, dy, key, group }
var fsMats = new Map(); // material key -> material, reused across rebuilds (never disposed)

function fsMat(key, make) {
  var m = fsMats.get(key);
  if (!m) { m = make(); fsMats.set(key, m); }
  return m;
}
function wallMat(color) {
  return fsMat("wall:" + color, function () {
    return new THREE.MeshStandardMaterial({ color: color, roughness: 0.9, metalness: 0 });
  });
}
function floorMat(type) {
  return fsMat("floor:" + type, function () {
    return new THREE.MeshStandardMaterial({ map: floorTexture(type), roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide });
  });
}
function slabMat() {
  return fsMat("slab", function () {
    return new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  });
}

/* Wall boxes for the live state (which withFloorScene may have pointed at a
   stored storey). rise: the floor-to-floor height to the storey shown above,
   which full walls run up to exactly (carriedTop). bandOnly: just the part of
   each wall above its own top — the live storey's walls are rebuild3D's, so
   for it only the band up to the storey above is drawn here. */
function storeyWallBoxes(rise, bandOnly) {
  var boxes = [];
  (S.walls || []).forEach(function (w) {
    try {
      var kind = normalizeWallKind(w);
      if (kind === "roomDivider") return;
      var gm = wallGeom(w);
      if (!gm || !(gm.L > 1)) return;
      var span = wallElevationSpan(w), T = wallThickness(w, S) || 12;
      var top = carriedTop(kind, span.top, rise);
      var pieces;
      if (bandOnly) pieces = top > span.top + 0.01 ? wallSolidPieces(gm.L, span.top, top, []) : [];
      else {
        var cuts = (S.openings || []).filter(function (o) { return String(o.wall) === String(w.id); }).map(function (o) { return openingCut(o, span.top); });
        pieces = wallSolidPieces(gm.L, span.bottom, top, cuts);
      }
      pieces.forEach(function (p) {
        // a curved wall is followed in short chords; a straight one is one box
        var n = gm.curve ? Math.max(1, Math.ceil((p.s1 - p.s0) / 40)) : 1;
        for (var i = 0; i < n; i++) {
          var s0 = p.s0 + ((p.s1 - p.s0) * i) / n, s1 = p.s0 + ((p.s1 - p.s0) * (i + 1)) / n;
          var a = gm.curve ? wallPointAt(w, s0) : { x: gm.a.x + gm.ux * s0, z: gm.a.z + gm.uz * s0 };
          var b = gm.curve ? wallPointAt(w, s1) : { x: gm.a.x + gm.ux * s1, z: gm.a.z + gm.uz * s1 };
          if (a && b) boxes.push({ a: a, b: b, y0: p.y0, y1: p.y1, t: T });
        }
      });
    } catch (e) { /* one odd wall must not cost the storey */ }
  });
  return boxes;
}

// The tallest full-height wall of the live state: the ceiling of that storey.
function storeyWallTop() {
  var top = 0;
  (S.walls || []).forEach(function (w) {
    try {
      if (normalizeWallKind(w) !== "normal") return;
      top = Math.max(top, wallElevationSpan(w).top);
    } catch (e) { /* skip */ }
  });
  return top;
}

function addWallMesh(g, boxes, color) {
  var arrays = boxArrays(boxes);
  if (!arrays.indices.length) return;
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arrays.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(arrays.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
  geo.computeBoundingSphere();
  var walls = new THREE.Mesh(geo, wallMat(color != null ? color : WALLC));
  walls.castShadow = walls.receiveShadow = true;
  walls.userData.ownGeometry = true;
  g.add(walls);
}

/* The slab under each room: its underside `depth` below the floor, down to
   the ceiling of the storey below. Its top is the room's floor itself. */
function addSlabUndersides(g, rooms, depth) {
  if (!(depth > 0.01)) return;
  rooms.forEach(function (r) {
    var under = polyMesh(r.pts, -depth, 240, slabMat(), holesForRoom(r.pts));
    if (under) { under.castShadow = true; under.userData.ownGeometry = true; g.add(under); }
  });
}

function liveRooms() {
  try { return detectRooms(); } catch (e) { return []; }
}

function buildStorey(floor, rise, depth) {
  var g = new THREE.Group();
  g.name = "floorStack:" + floor.id;
  var scene = floor.scene;
  withFloorScene(S, scene, function () {
    addWallMesh(g, storeyWallBoxes(rise, false), scene.wallColor);
    var rooms = liveRooms();
    rooms.forEach(function (r) {
      var holes = holesForRoom(r.pts), t = roomFloor(r.key);
      var top = polyMesh(r.pts, 0, TILE[t] || 240, floorMat(t), holes);
      if (top) { top.receiveShadow = true; top.userData.ownGeometry = true; g.add(top); }
    });
    addSlabUndersides(g, rooms, depth);
    (S.items || []).forEach(function (it) {
      if (!it || !FURN[it.type]) return;
      try {
        /* no id: the catalogue builder caches a piece's parameters on the live
           state under its id, and ids are only unique within one storey */
        var copy = Object.assign({}, it, { id: null });
        var ig = new THREE.Group();
        ig.position.set(it.x, elevOffset(copy), it.z);
        ig.rotation.y = (-(it.rot || 0) * Math.PI) / 180;
        buildFurn(ig, copy);
        mergeItemMeshes(ig, THREE);
        var lights = [];
        ig.traverse(function (o) {
          if (o.isLight) lights.push(o);
          else if (o.isMesh) o.castShadow = o.receiveShadow = true;
        });
        lights.forEach(function (l) { if (l.parent) l.parent.remove(l); });
        g.add(ig);
      } catch (e) { /* skip a piece that cannot build out of its own storey */ }
    });
  });
  return g;
}

/* Only the geometry made here is disposed: materials are the shared ones above
   or the catalogue's, which the live storey may be using too. */
function disposeStorey(g) {
  if (!g) return;
  if (g.parent) g.parent.remove(g);
  g.traverse(function (o) {
    if (o.isMesh && o.userData.ownGeometry && o.geometry) o.geometry.dispose();
  });
}

var fsActive = null; // the live storey's band and slab (rebuilt every sync)
var fsTops = new WeakMap(); // stored scene -> its tallest full wall

function storedWallTop(scene) {
  if (!fsTops.has(scene)) fsTops.set(scene, withFloorScene(S, scene, storeyWallTop));
  return fsTops.get(scene);
}

export function syncFloorStack() {
  if (!has3D() || !THREE || !THREE.Group) return;
  var main = getMainScene();
  if (!main) return;
  var cut = isFinite(cutH());
  var wanted = stackedFloors(S.workspace, { hideAbove: cut });
  if (!wanted.length && !fsEntries.size && !fsActive) return;
  if (!fsGroup) {
    fsGroup = new THREE.Group();
    fsGroup.name = "floorStack";
    fsGroup.userData.exportSkip = true;
    fsGroup.userData.physicsRole = "ignore";
  }
  if (fsGroup.parent !== main) main.add(fsGroup);
  var changed = false, keep = new Set();
  /* Each shown storey's ceiling (its tallest full wall), the live one's
     included: the slab over it is floor-to-floor height minus that. */
  var activeTop = storeyWallTop();
  var tops = wanted.map(function (e) { return storedWallTop(e.floor.scene); });
  function depthUnder(dy) {
    var belowDy = null, belowTop = 0;
    if (dy > 0) { belowDy = 0; belowTop = activeTop; }
    wanted.forEach(function (o, i) {
      if (o.dy < dy - 0.01 && (belowDy == null || o.dy > belowDy)) { belowDy = o.dy; belowTop = tops[i]; }
    });
    return belowDy == null ? 0 : slabDepth(dy - belowDy, belowTop);
  }
  wanted.forEach(function (e) {
    keep.add(e.floor.id);
    var depth = depthUnder(e.dy);
    var entry = fsEntries.get(e.floor.id);
    if (entry && entry.scene === e.floor.scene && entry.rise === e.rise && entry.depth === depth) {
      if (entry.group.position.y !== e.dy) { entry.group.position.y = e.dy; changed = true; }
      return;
    }
    if (entry) disposeStorey(entry.group);
    var group = buildStorey(e.floor, e.rise, depth);
    group.position.y = e.dy;
    fsGroup.add(group);
    fsEntries.set(e.floor.id, { scene: e.floor.scene, rise: e.rise, depth: depth, group: group });
    changed = true;
  });
  fsEntries.forEach(function (entry, id) {
    if (keep.has(id)) return;
    disposeStorey(entry.group);
    fsEntries.delete(id);
    changed = true;
  });
  /* The live storey's share, redone on every rebuild since it is the one
     being edited: its full walls run up to the storey shown above, and its
     floor gets the slab down to the ceiling of the storey shown below. */
  if (fsActive) { disposeStorey(fsActive); fsActive = null; changed = true; }
  var rise = wanted.length ? riseAbove(wanted.map(function (e) { return e.dy; }).concat(0), 0) : null;
  var activeDepth = wanted.length ? depthUnder(0) : 0;
  if (rise != null || activeDepth > 0) {
    fsActive = new THREE.Group();
    fsActive.name = "floorStack:active";
    if (rise != null) addWallMesh(fsActive, storeyWallBoxes(rise, true), S.wallColor);
    addSlabUndersides(fsActive, liveRooms(), activeDepth);
    fsGroup.add(fsActive);
    changed = true;
  }
  /* The lawn, the site dressing and the studio floor sit at the active
     storey's level; storeys below it would be buried. They step down to the
     lowest storey shown. */
  var lowest = wanted.reduce(function (m, e) { return Math.min(m, e.dy); }, 0);
  [groundPlaneRef, siteDressRef, main.getObjectByName("studioFloor")].forEach(function (o) {
    if (!o) return;
    if (o.userData.stackBaseY == null) o.userData.stackBaseY = o.position.y;
    var y = o.userData.stackBaseY + lowest;
    if (o.position.y !== y) { o.position.y = y; changed = true; }
  });
  if (changed) requestShadowUpdate();
}

if (typeof window !== "undefined") window.addEventListener("scene3d:rebuilt", syncFloorStack);

/* Micro-RC world: collision, cars, track, water, doors, audio. */
import * as THREE from "three";
import { S, clamp, fin } from "./state.js";
import {
  wallGeom,
  detectRooms,
  roomHidden,
  hiddenSets,
  pointInPoly,
} from "./geometry.js";
import { FURN } from "./furniture.js";
import { buildRoad, courseQuality, roomCircuit } from "./track.js";
import { courseFingerprint } from "./rc_driving.js";
import { surfaceHeightAt, surfaceHeightNear, surfaceSampleAt } from "./road_surface.js";
import { t } from "./i18n.js";
import {
  kartBuild,
  kartClear,
  kartOnWreck,
  kartIsOn,
} from "./kart.js";
import { editorSynced } from "./rc_editor.js";
import { getMainScene, getMainCamera } from "./view3d.js";
import * as Col2D from "./col2d.js";
import { runtimeCollisionRects, hasRuntimeRepresentation } from "./core/runtime.js";
import {
  AXLE_Z,
  BODY_L,
  CAR_CLEAR,
  COLL_R,
  FIG_SCALE,
  GRAV,
  MAXV,
  MAX_HP,
  PLAYER_COLOR,
  R,
  STEP_H,
  TRACK_X,
  WATER_R,
  WATER_SURF,
  WHEEL_R,
  applyPhysicsConfig,
  customAnchors,
  hooks,
  planSig,
} from "./rc_state.js";

// ---- collision model --------------------------------------------------------
// Walls become thick 2D segments with gaps cut at floor-reaching openings.
// Door openings keep a "blocker" segment tied to their 3D door pivot: it only
// collides while the door is closed. Furniture contributes the world AABB of
// EVERY mesh (with its y-range), so whether a box blocks, is driven under, or
// is a platform being driven ON depends on the car's current height.
export function floorOpenings(w) {
  return S.openings.filter(function (o) {
    return (
      o.wall === w.id &&
      (o.type === "door" || o.type === "passage") &&
      (o.sill || 0) <= 1 &&
      o.width > 40
    );
  });
}

export function buildColModel() {
  var scene = getMainScene();
  if (!scene) return;
  scene.updateMatrixWorld(true);
  var col = { segs: [], doorSegs: [], rects: [], road: [], surface: [], rails: [], gaps: [] };
  var hidden = hiddenSets();
  S.walls.forEach(function (w) {
    if (hidden.walls[w.id]) return;
    var gm = wallGeom(w);
    if (gm.L < 1) return;
    var half = Math.max(w.thickness / 2, 0.8);
    function seg(s0, s1, pivot) {
      if (s1 - s0 < 1) return;
      var e = {
        ax: gm.a.x + gm.ux * s0,
        az: gm.a.z + gm.uz * s0,
        bx: gm.a.x + gm.ux * s1,
        bz: gm.a.z + gm.uz * s1,
        half: half,
      };
      if (pivot) {
        e.pivot = pivot;
        col.doorSegs.push(e);
      } else col.segs.push(e);
    }
    var ops = floorOpenings(w).sort(function (a, b) {
      return a.s - b.s;
    });
    var pos = 0;
    ops.forEach(function (o) {
      var l = clamp(o.s - o.width / 2 + 3, 0, gm.L),
        r = clamp(o.s + o.width / 2 - 3, 0, gm.L);
      if (r <= pos) return;
      seg(pos, l);
      if (o.type === "door") {
        // find the door pivot for this opening by world-box proximity
        var cx = gm.a.x + gm.ux * o.s,
          cz = gm.a.z + gm.uz * o.s,
          best = null,
          bd = 1e9;
        (scene.doors || []).forEach(function (d) {
          var bb = new THREE.Box3().setFromObject(d);
          if (bb.isEmpty()) return;
          var c = bb.getCenter(new THREE.Vector3());
          var dd = Math.hypot(c.x - cx, c.z - cz);
          if (dd < o.width && dd < bd) {
            bd = dd;
            best = d;
          }
        });
        if (best) seg(l, r, best);
      }
      pos = r;
    });
    seg(pos, gm.L);
  });
  // furniture meshes → merge per item so mesh gaps don't leak cars through
  var box3 = new THREE.Box3();
  var raw = runtimeCollisionRects(S);
  scene.traverse(function (o) {
    if (!o.isMesh) return;
    var p = o,
      it = null;
    while (p && !it) {
      if (p.userData && p.userData.item) it = p.userData.item;
      if (p.userData && (p.userData.rc || p.userData.isHuman)) return;
      p = p.parent;
    }
    if (!it) return;
    if (hasRuntimeRepresentation(S, it)) return;
    box3.setFromObject(o);
    if (box3.isEmpty()) return;
    if (box3.max.x - box3.min.x < 0.5 || box3.max.z - box3.min.z < 0.5) return;
    if (box3.max.y - box3.min.y < 0.3) return;
    raw.push({
      x0: box3.min.x,
      z0: box3.min.z,
      x1: box3.max.x,
      z1: box3.max.z,
      y0: box3.min.y,
      y1: box3.max.y,
      item: it,
    });
  });
  // Per-MESH boxes, kept before the item merge. Collision needs the merged box
  // (mesh gaps let a circle slip inside a sofa), but "what could a truck stand
  // on here" needs the parts: a sofa's merged box tops out at its backrest,
  // while the thing you actually drive along is the seat.
  col.tops = raw.map(function (r) {
    return { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, y0: r.y0, y1: r.y1, item: r.item };
  });
  col.rects = Col2D.padRects(Col2D.mergeItemRects(raw), 0.35);
  // the road surface survives scene rebuilds — re-attach it from the track
  if (R.track && R.track.col) {
    col.road = R.track.col.road.slice();
    col.surface = (R.track.col.surface || []).slice();
    col.rails = R.track.col.rails.slice();
    col.gaps = (R.track.col.gaps || []).slice();
  }
  R.col = col;
  R.colDirty = false;
}

// A rect blocks a body at height y (with `clear` cm of body above the ground
// and a climbable ledge of `step`) when it overlaps the body's height band but
// its top is too tall to just drive up onto.
export function rectBlocks(rc, y, clear, step) {
  return Col2D.rectBlocks(rc, y, clear, step);
}

// the surface a truck at (x,z,y) drives on: the road deck it is riding, else the
// room floor (0) or any furniture top at/below y + step
export function groundAt(x, z, y, step) {
  var g = Col2D.groundAt(R.col, x, z, y, step);
  if (!R.col) return g;
  // The road uses the exact triangles of the visible top mesh, including bank,
  // slope and tiny overlap lifts. There is no second segmented approximation
  // for the truck to bounce across or fall through at a bend.
  var roadY = surfaceHeightAt(R.col.surface, x, z, y, step);
  if (roadY == null) return g;
  // The deck WINS over whatever it is laid across. A road crossing a 40cm
  // counter is a bridge, not a ramp onto the counter: taking the higher of the
  // two hopped the truck between deck and worktop and back, every lap, in the
  // middle of the spiral. Only a surface well clear of the deck (a table the
  // truck is genuinely standing on, with the road passing underneath) outranks
  // it.
  return g - roadY > step ? g : roadY;
}

// is (x,z) standing on the road deck at roughly height y? Same triangles
// groundAt uses, minus the reachability rule — the rails can't be perfect
// (they're suppressed wherever two passes run alongside each other), so a race
// also needs to notice a kart that got out through one of those openings.
export function onRoad(x, z, y) {
  var surface = R.col && R.col.surface;
  // No deck anywhere: classic mode means the track has not been built yet (be
  // permissive), home mode means there is genuinely no road on this circuit —
  // and answering "yes, on the road" there would, among other things, stop the
  // water pools from ever wetting a truck.
  if (!surface || !surface.length) return !R.homeMode;
  return surfaceHeightNear(surface, x, z, y, 3) != null;
}

// Apartment collision is subordinate to the racing deck while a kart is on
// it. This is deliberately stricter than onRoad(): only a surface at the kart's
// current layer owns collision, so a flyover never disables furniture on the
// floor beneath it.
function roadOwnsCollision(p, y) {
  var surface = R.col && R.col.surface;
  return !!(surface && surface.length && surfaceHeightNear(surface, p.x, p.z, y, 2.8) != null);
}

// The only place an elevated truck is deliberately allowed to lose road
// support is the ramp jump. Every other support loss is a seam/rail failure
// and should be rejected before the truck and camera fall beneath the mesh.
export function inTrackGap(x, z, y) {
  var gaps = R.col && R.col.gaps;
  if (!gaps) return false;
  for (var i = 0; i < gaps.length; i++) {
    var g = gaps[i], dx = x - g.x, dz = z - g.z;
    if (Math.abs(y - g.y) < 26 && dx * dx + dz * dz <= g.r * g.r) return true;
  }
  return false;
}

// Shared Col2D resolver (corner discs, multi-pass, item-merged furniture).
// colHardHit = solid penetration only (soft race rails don't count as damage).
export var colHardHit = 0;
export function collideCircle(p, r, y, clear, step) {
  if (!R.col) return 0;
  colHardHit = 0;
  var hard = { value: 0 };
  var walls = !!(R.walls || (R.race && R.race.state !== "done"));
  var hit = Col2D.collideCircle(R.col, p, r, y, clear, step, {
    passes: 4,
    walls: walls,
    hardOut: hard,
    ignoreWorldAt: roadOwnsCollision,
  });
  colHardHit = hard.value;
  return hit;
}
export function colPass(p, r, y, clear, step) {
  if (!R.col) return 0;
  var walls = !!(R.walls || (R.race && R.race.state !== "done"));
  return Col2D.colPass(
    R.col,
    p,
    r,
    y,
    clear,
    step,
    { walls: walls, ignoreWorldAt: roadOwnsCollision },
    { hit: 0, hard: 0 }
  );
}
export function moveCircle(p, dx, dz, r, y, clear, step) {
  if (!R.col) {
    p.x += dx;
    p.z += dz;
    return 0;
  }
  colHardHit = 0;
  var hard = { value: 0 };
  var walls = !!(R.walls || (R.race && R.race.state !== "done"));
  var hit = Col2D.moveCircle(R.col, p, dx, dz, r, y, clear, step, {
    passes: 3,
    walls: walls,
    hardOut: hard,
    ignoreWorldAt: roadOwnsCollision,
  });
  colHardHit = hard.value;
  return hit;
}
// probe: would a small circle at (x,z,y) collide? (AI feelers, spawn checks)
export function blockedAt(x, z, r, y, clear, step) {
  var p = { x: x, z: z };
  return Col2D.collideCircle(R.col, p, r, y, clear, step, {
    passes: 2,
    ignoreWorldAt: roadOwnsCollision,
  }) > 0.01;
}
// nearest collision-free floor spot to (x,z) — spiral search so cars/figures
// never spawn inside a sofa and get shoved through a wall by the resolver
export function findFreeSpot(x, z, r) {
  return Col2D.freeSpot(R.col, x, z, r, 0, CAR_CLEAR, STEP_H, 90, 8, 12);
}

// ---- car construction -------------------------------------------------------
export function stdMat(color, rough, metal) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: rough != null ? rough : 0.5,
    metalness: metal != null ? metal : 0.2,
  });
}
export function bx(parent, x0, x1, y0, y1, z0, z1, mat) {
  var m = new THREE.Mesh(
    new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0),
    mat,
  );
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Side-profile extrusion: a shape drawn in (length, height) is extruded across
// the truck's width, then rotated so the length runs along +Z (forward). Same
// trick the street cars use — it buys a real hood/roof line and cut wheel
// arches instead of a pile of boxes.
var DES_L = 32, // design-space body length; the group is shrunk to BODY_L
  DES_W = 17.2; // design-space body width (wheels sit at ±9.4)
export function extrudeSide(shape, width) {
  var g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.5,
    bevelSegments: 2,
    curveSegments: 8,
    steps: 1,
  });
  g.rotateY(-Math.PI / 2); // shape x → world +z, extrusion → world x
  g.translate(width / 2, 0, -DES_L / 2);
  return g;
}
export function profileShape(pts, sillY, arches) {
  var s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.lineTo(DES_L, sillY); // down the nose
  for (var k = arches.length - 1; k >= 0; k--) {
    // back along the sill, arcing up over each wheel
    var a = arches[k];
    s.lineTo(a[0] + a[1], sillY);
    s.absarc(a[0], 0, a[1], 0, Math.PI, false);
    s.lineTo(a[0] - a[1], sillY);
  }
  s.lineTo(0, sillY);
  s.closePath();
  return s;
}
export function meshAt(parent, geo, mat, x, y, z) {
  var m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Procedural default RC truck: a shaped tub with flared arches, a raked cab
// with glass, an open bed, roll bar + light pod, bull bar and a whip antenna.
// Built at design scale (~32 long) and shrunk to micro; local +Z is forward
// and y=0 is the axle plane. Materials are per-truck — tintDamage() scorches
// them as hit points drop, so they must never be shared between cars.
var ARCH_R = 7.4,
  AX_F = 27.1, // front wheel, in shape-x (world z = x − 16)
  AX_R = 4.9; // rear wheel
export function defaultTruckBody(color) {
  var g = new THREE.Group();
  var body = stdMat(color, 0.32, 0.3),
    dark = stdMat(0x2b2f35, 0.65, 0.45),
    rubber = stdMat(0x1a1c1f, 0.9, 0),
    chrome = stdMat(0xb9bec6, 0.25, 0.9),
    glass = stdMat(0x1d2a36, 0.06, 0.75),
    lamp = stdMat(0xfff2c0, 0.25, 0.1),
    tail = stdMat(0xd8352a, 0.3, 0.1);
  lamp.emissive = new THREE.Color(0x6a5a22);
  tail.emissive = new THREE.Color(0x3a0b06);

  // main tub: bed floor → cowl → hood → nose, with the wheel arches cut out
  var tub = profileShape(
    [[0, 7.6], [11.4, 7.6], [12.0, 10.8], [22.6, 10.8], [23.4, 10.3],
     [30, 9.9], [31.6, 8.4], [32, 7.0]],
    1.6,
    [[AX_R, ARCH_R], [AX_F, ARCH_R]],
  );
  meshAt(g, extrudeSide(tub, DES_W), body);

  // cab greenhouse: raked rear window, roof, raked windshield
  var cab = [[12.2, 10.8], [13.8, 16.0], [20.2, 16.2], [22.4, 10.8]];
  var gh = new THREE.Shape();
  gh.moveTo(cab[0][0], cab[0][1]);
  for (var i = 1; i < cab.length; i++) gh.lineTo(cab[i][0], cab[i][1]);
  gh.lineTo(cab[3][0], 10.4);
  gh.lineTo(cab[0][0], 10.4);
  gh.closePath();
  meshAt(g, extrudeSide(gh, DES_W - 2.4), glass);
  bx(g, -7.6, 7.6, 16.0, 16.9, 13.6 - 16, 20.4 - 16, body); // roof cap
  [-7.0, 7.0].forEach(function (x) {
    // A/C pillars, angled onto the window rakes
    strutRC(g, cab[0], cab[1], x, body);
    strutRC(g, cab[2], cab[3], x, body);
  });

  // open bed: side walls, tailgate, ribbed floor
  bx(g, -8.6, -7.0, 7.6, 11.8, -16, -4.8, body);
  bx(g, 7.0, 8.6, 7.6, 11.8, -16, -4.8, body);
  bx(g, -8.6, 8.6, 7.6, 11.8, -16, -14.6, body); // tailgate
  for (var r = -14; r <= -6; r += 2.6) bx(g, -7, 7, 7.6, 8.0, r - 0.35, r + 0.35, dark);

  // dark rocker rails, grille and hood scoop — the contrast that keeps the
  // truck from reading as one moulded lump of colour
  bx(g, -8.9, -8.1, 1.8, 4.6, -13, 13, dark);
  bx(g, 8.1, 8.9, 1.8, 4.6, -13, 13, dark);
  bx(g, -7.4, 7.4, 5.4, 8.6, 30.6 - 16, 31.9 - 16, dark); // grille
  bx(g, -4.2, 4.2, 10.2, 11.4, 24.5 - 16, 28.5 - 16, dark); // hood scoop

  // flared arches over each wheel
  var flare = new THREE.TorusGeometry(ARCH_R + 0.5, 1.1, 6, 12, Math.PI);
  flare.rotateY(Math.PI / 2);
  [[-9.4, AX_R], [9.4, AX_R], [-9.4, AX_F], [9.4, AX_F]].forEach(function (p) {
    meshAt(g, flare.clone(), dark, p[0], 0, p[1] - 16);
  });

  // coilover shocks: the detail that reads "RC" more than anything else
  var shock = new THREE.CylinderGeometry(0.85, 0.85, 7.2, 8);
  [[-7.4, AX_R], [7.4, AX_R], [-7.4, AX_F], [7.4, AX_F]].forEach(function (p) {
    var m = meshAt(g, shock.clone(), chrome, p[0], 3.4, p[1] - 16);
    m.rotation.z = p[0] < 0 ? -0.26 : 0.26;
  });

  // roll bar behind the cab + a four-lamp pod on top
  bx(g, -7.4, -6.2, 10.8, 18.6, -6.6, -5.4, dark);
  bx(g, 6.2, 7.4, 10.8, 18.6, -6.6, -5.4, dark);
  bx(g, -7.6, 7.6, 18.6, 19.8, -6.7, -5.3, dark);
  var pod = new THREE.CylinderGeometry(1.5, 1.5, 1.3, 10);
  pod.rotateX(Math.PI / 2);
  [-5.1, -1.7, 1.7, 5.1].forEach(function (x) {
    meshAt(g, pod.clone(), lamp, x, 20.6, -5.0);
    bx(g, x - 0.4, x + 0.4, 19.6, 20.4, -6.4, -5.6, dark);
  });

  // bull bar + head lights up front, bumper + tail lights at the back
  bx(g, -9.2, 9.2, 4.2, 5.6, 15.6, 17.0, chrome);
  bx(g, -9.2, -8.0, 5.6, 11.0, 16.0, 16.8, chrome);
  bx(g, 8.0, 9.2, 5.6, 11.0, 16.0, 16.8, chrome);
  bx(g, -6.6, -3.4, 7.4, 9.4, 15.7, 16.2, lamp);
  bx(g, 3.4, 6.6, 7.4, 9.4, 15.7, 16.2, lamp);
  bx(g, -9.0, 9.0, 3.4, 5.0, -17.0, -15.8, dark);
  bx(g, -8.2, -5.4, 8.4, 10.6, -16.5, -16.0, tail);
  bx(g, 5.4, 8.2, 8.4, 10.6, -16.5, -16.0, tail);

  // mirrors and the whip antenna with its flag ball
  bx(g, -9.4, -7.8, 12.4, 13.6, 20.6 - 16, 21.6 - 16, dark);
  bx(g, 7.8, 9.4, 12.4, 13.6, 20.6 - 16, 21.6 - 16, dark);
  var whip = new THREE.CylinderGeometry(0.28, 0.4, 12, 6);
  meshAt(g, whip, dark, -7.2, 16.4, -12.5).rotation.z = 0.14;
  meshAt(g, new THREE.SphereGeometry(1.1, 10, 8), stdMat(0xff8830, 0.4, 0.1),
    -8.1, 22.3, -12.5);

  var wrap = new THREE.Group();
  g.scale.setScalar(BODY_L / DES_L);
  wrap.add(g);
  return wrap;
}
// thin painted strut between two profile points (cab pillar)
export function strutRC(g, a, b, x, mat) {
  var dz = b[0] - a[0],
    dy = b[1] - a[1];
  var len = Math.hypot(dz, dy) || 0.01;
  var m = new THREE.Mesh(new THREE.BoxGeometry(1.1, len, 1.3), mat);
  m.rotation.x = Math.atan2(dz, dy); // box +Y rotates onto (0, dy, dz)
  m.position.set(x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2 - DES_L / 2);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
}

// body from a modeler custom-model def, scaled so its long axis = BODY_L and
// rotated so length runs along +Z (the car's forward)
export function customTruckBody(key) {
  var f = FURN[key];
  if (!f || !f.custom) return null;
  var g = new THREE.Group();
  try {
    f.build(g);
  } catch (e) {
    return null;
  }
  var def = f.custom;
  var long = Math.max(def.w || 1, def.d || 1);
  var s = BODY_L / Math.max(long, 1);
  var inner = new THREE.Group();
  while (g.children.length) inner.add(g.children[0]);
  if ((def.w || 0) > (def.d || 0)) inner.rotation.y = Math.PI / 2;
  inner.scale.setScalar(s);
  var wrap = new THREE.Group();
  wrap.add(inner);
  wrap.position.y = 0.5; // ride height above axle plane
  return wrap;
}

// Chunky RC tyre: a torus carcass (rounded shoulders, faceted enough to read
// as tread at micro scale) around a spoked rim.
export function buildWheel(parent, x, z, steer) {
  var pivot = new THREE.Group();
  pivot.position.set(x, WHEEL_R, z);
  var spin = new THREE.Group();
  var tube = WHEEL_R * 0.42;
  var tire = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R - tube, tube, 7, 14),
    stdMat(0x1a1c1f, 0.92, 0),
  );
  tire.rotation.y = Math.PI / 2; // torus axis Z → the wheel's X axis
  tire.castShadow = tire.receiveShadow = true;
  spin.add(tire);
  var rimMat = stdMat(0xc2c8d0, 0.28, 0.85);
  var rim = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_R * 0.6, WHEEL_R * 0.6, 0.85, 12),
    rimMat,
  );
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  for (var i = 0; i < 4; i++) {
    var sp = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, WHEEL_R * 1.15, WHEEL_R * 0.3),
      rimMat,
    );
    sp.rotation.x = (i / 4) * Math.PI;
    spin.add(sp);
  }
  var cap = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_R * 0.22, WHEEL_R * 0.22, 1.05, 8),
    stdMat(0x8b9099, 0.35, 0.8),
  );
  cap.rotation.z = Math.PI / 2;
  spin.add(cap);
  pivot.add(spin);
  parent.add(pivot);
  return { pivot: pivot, spin: spin, steer: !!steer };
}

// (re)builds the car's whole visual group — used at creation and on respawn
// after a wreck detached all the meshes as flying shards
export function assembleCar(car) {
  var grp = new THREE.Group();
  grp.userData.rc = true;
  var bodyKey = car.ai ? "" : R.truckKey;
  var body =
    (bodyKey && customTruckBody(bodyKey)) || defaultTruckBody(car.color);
  grp.add(body);
  car.wheels = [
    buildWheel(grp, -TRACK_X, AXLE_Z, true),
    buildWheel(grp, TRACK_X, AXLE_Z, true),
    buildWheel(grp, -TRACK_X, -AXLE_Z, false),
    buildWheel(grp, TRACK_X, -AXLE_Z, false),
  ];
  car.grp = grp;
  car.body = body;
  car.starFx = null; // the aura lives on the old group; rebuilt on demand
  getMainScene().add(grp);
  tintDamage(car);
}

// zero every kart-layer field on a car (grid placement, respawn, race restart)
export function kartResetCar(car) {
  car.item = null;
  car.itemN = 0;
  car.coins = 0;
  car.rollT = 0;
  car.boostT = 0;
  car.starT = 0;
  car.smallT = 0;
  car.spinT = 0;
  car.stallT = 0;
  car.padT = 0;
  car.driftDir = 0;
  car.driftT = 0;
  car.driftTier = 0;
  car.driftHeld = false;
  car.driftPend = false;
  car.hopT = 0;
  car.place = 1;
}

export function makeCar(opts) {
  var car = {
    x: opts.x || 0,
    z: opts.z || 0,
    y: 0,
    vy: 0,
    heading: opts.heading || 0,
    v: 0,
    steer: 0,
    throttle: 0,
    spin: 0,
    ai: !!opts.ai,
    aiSkill: opts.aiSkill || 1,
    name: opts.name || "",
    color: opts.color,
    hp: MAX_HP,
    dead: false,
    deadT: 0,
    next: 1,
    lap: 1,
    done: false,
    finT: 0,
    stuck: 0,
    revT: 0,
    hitCd: 0,
    surfaceUp: { x: 0, y: 1, z: 0 },
    grounded: true,
  };
  kartResetCar(car);
  assembleCar(car);
  return car;
}

export function swapPlayerBody(car) {
  car.grp.remove(car.body);
  disposeGrp(car.body);
  car.body =
    (R.truckKey && customTruckBody(R.truckKey)) ||
    defaultTruckBody(PLAYER_COLOR);
  car.grp.add(car.body);
  tintDamage(car);
}

export function disposeGrp(g) {
  if (!g) return;
  g.traverse(function (o) {
    // A Sprite's geometry is a module-level singleton inside three — disposing
    // it takes out every sprite in the app (see kart.js disposeObj).
    if (o.geometry && o.geometry.dispose && !o.isSprite) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(
        function (m) {
          if (m.map && m.map.dispose) m.map.dispose();
          m.dispose();
        },
      );
    }
  });
}

// ---- damage -----------------------------------------------------------------
export function tintDamage(car) {
  // scorch the paint toward charcoal as hp drops
  var f = (1 - car.hp / MAX_HP) * 0.6;
  car.body.traverse(function (o) {
    if (!o.isMesh || !o.material || !o.material.color) return;
    var m = o.material;
    if (m.userData.origCol == null) m.userData.origCol = m.color.getHex();
    m.color.setHex(m.userData.origCol).lerp(new THREE.Color(0x141414), f);
  });
}

export function applyDamage(car, dmg, now) {
  if (car.dead || dmg <= 0) return;
  if ((car.starT || 0) > now) return; // star power shrugs everything off
  car.hp = Math.max(0, car.hp - dmg);
  tintDamage(car);
  if (!car.ai) hooks.updateHpBar && hooks.updateHpBar();
  if (car.hp <= 0) wreckCar(car, now);
}

// blow the truck into its actual part meshes, tumbling with gravity — the
// fracture.js slicer needs ≥15cm meshes, far above micro-truck parts, so the
// wreck reuses the same fly-apart language with the car's own pieces
export function wreckCar(car, now) {
  var scene = getMainScene();
  car.dead = true;
  car.deadT = now;
  car.v = 0;
  car.vy = 0;
  car.starFx = null; // becomes one of the shards below
  kartOnWreck(car);
  var meshes = [];
  car.grp.updateMatrixWorld(true);
  car.grp.traverse(function (o) {
    if (o.isMesh) meshes.push(o);
  });
  meshes.forEach(function (m) {
    scene.attach(m); // keeps world transform (incl. inherited scale)
    var ang = Math.random() * Math.PI * 2,
      sp = 14 + Math.random() * 30;
    R.shards.push({
      m: m,
      vx: Math.sin(ang) * sp,
      vz: Math.cos(ang) * sp,
      vy: 34 + Math.random() * 60,
      rx: (Math.random() - 0.5) * 14,
      ry: (Math.random() - 0.5) * 14,
      rz: (Math.random() - 0.5) * 14,
      t0: now,
      gy: groundAt(car.x, car.z, car.y, STEP_H),
    });
  });
  scene.remove(car.grp);
  beep(60, 0.35, 0.9);
  beep(140, 0.2, 0.5);
  if (!car.ai) {
    hooks.showMsg && hooks.showMsg(t("rc_wrecked"), 1800);
    hooks.updateHpBar && hooks.updateHpBar();
  }
}

export function stepShards(dt, now) {
  if (!R.shards.length) return;
  var scene = getMainScene();
  R.shards = R.shards.filter(function (s) {
    var age = (now - s.t0) / 1000;
    s.vy -= GRAV * dt;
    s.m.position.x += s.vx * dt;
    s.m.position.y += s.vy * dt;
    s.m.position.z += s.vz * dt;
    s.m.rotation.x += s.rx * dt;
    s.m.rotation.y += s.ry * dt;
    s.m.rotation.z += s.rz * dt;
    if (s.m.position.y < s.gy + 0.25 && s.vy < 0) {
      s.m.position.y = s.gy + 0.25;
      s.vy *= -0.35;
      s.vx *= 0.6;
      s.vz *= 0.6;
      s.rx *= 0.5;
      s.rz *= 0.5;
    }
    if (age > 1.5) {
      var m = s.m.material;
      if (m) {
        m.transparent = true;
        m.opacity = Math.max(0, 1 - (age - 1.5) / 0.8);
      }
    }
    if (age > 2.3) {
      scene.remove(s.m);
      if (s.m.geometry) s.m.geometry.dispose();
      if (s.m.material && s.m.material.dispose) s.m.material.dispose();
      return false;
    }
    return true;
  });
}

export function respawnCar(car, now) {
  var wps = R.track && R.track.wps;
  var px = car.x,
    pz = car.z,
    py = car.y,
    heading = car.heading;
  if (wps && wps.length) {
    var at = wps[car.next % wps.length],
      nxt = wps[(car.next + 1) % wps.length];
    var spot = at.y > 6 ? { x: at.x, z: at.z } : findFreeSpot(at.x, at.z, COLL_R);
    px = spot.x;
    pz = spot.z;
    py = at.y > 6 ? at.y : groundAt(spot.x, spot.z, 0, STEP_H);
    heading = Math.atan2(nxt.x - at.x, nxt.z - at.z);
  }
  car.x = px;
  car.z = pz;
  car.y = py;
  car.vy = 0;
  car.surfaceUp = { x: 0, y: 1, z: 0 };
  car.grounded = true;
  car.heading = heading;
  car.v = 0;
  car.hp = MAX_HP;
  car.dead = false;
  car.spinT = 0;
  car.boostT = 0;
  car.starT = 0;
  car.smallT = 0;
  car.driftDir = 0;
  car.driftT = 0;
  car.hopT = 0;
  assembleCar(car);
  hooks.syncCarMesh && hooks.syncCarMesh(car);
  if (!car.ai) hooks.updateHpBar && hooks.updateHpBar();
}

// ---- micro on-foot figure ---------------------------------------------------
export function makeFig() {
  var g = new THREE.Group();
  g.userData.rc = true;
  var inner = new THREE.Group();
  var skin = stdMat(0xe8b48c, 0.7, 0),
    shirt = stdMat(0xd9463d, 0.8, 0),
    pants = stdMat(0x394a5a, 0.85, 0);
  function part(mat, geo, x, y, z) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    inner.add(m);
    return m;
  }
  part(pants, new THREE.CylinderGeometry(6, 6, 48, 10), -6, 24, 0);
  part(pants, new THREE.CylinderGeometry(6, 6, 48, 10), 6, 24, 0);
  part(shirt, new THREE.CylinderGeometry(17, 15, 60, 12), 0, 78, 0);
  part(shirt, new THREE.CylinderGeometry(4.5, 4.5, 54, 8), -19, 78, 0);
  part(shirt, new THREE.CylinderGeometry(4.5, 4.5, 54, 8), 19, 78, 0);
  part(skin, new THREE.SphereGeometry(12, 12, 10), 0, 122, 0);
  part(stdMat(0xf2f2f2, 0.4, 0.1), new THREE.SphereGeometry(13, 12, 10), 0, 124, -1); // helmet
  part(skin, new THREE.SphereGeometry(2.6, 8, 6), 0, 120, 12); // nose = facing
  inner.scale.setScalar(FIG_SCALE);
  g.add(inner);
  getMainScene().add(g);
  return { grp: g, x: 0, y: 0, vy: 0, z: 0, heading: 0, bob: 0 };
}

// ---- track ------------------------------------------------------------------
export function roomAt(rooms, x, z) {
  for (var i = 0; i < rooms.length; i++)
    if (pointInPoly(x, z, rooms[i].pts)) return i;
  return -1;
}

// Prefer a simple doorway circuit; a home with only branches uses a local loop.
function tourDoors(rooms) {
  if (!rooms.length) return [];
  var conns = [];
  S.walls.forEach(function (w) {
    var gm = wallGeom(w);
    if (gm.L < 1) return;
    floorOpenings(w).forEach(function (o) {
      var px = gm.a.x + gm.ux * o.s,
        pz = gm.a.z + gm.uz * o.s;
      var nx = gm.uz,
        nz = -gm.ux; // wall normal
      var ra = roomAt(rooms, px + nx * 30, pz + nz * 30),
        rb = roomAt(rooms, px - nx * 30, pz - nz * 30);
      if (ra >= 0 && rb >= 0 && ra !== rb)
        conns.push({ a: ra, b: rb, x: px, z: pz, ux: gm.ux, uz: gm.uz, nx: nx, nz: nz, width: o.width - 6, height: o.height || w.height });
    });
  });
  return conns;
}
export function routeAllRooms(rooms) {
  return roomCircuit(rooms, tourDoors(rooms));
}

// single-room home (or nothing connected): an oval inside the main room
export function ovalAnchors(rooms) {
  var b;
  if (rooms.length) {
    var r0 = rooms[0];
    rooms.forEach(function (r) {
      if (r.area > r0.area) r0 = r;
    });
    var minx = 1e9,
      minz = 1e9,
      maxx = -1e9,
      maxz = -1e9;
    r0.pts.forEach(function (p) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z);
      maxz = Math.max(maxz, p.z);
    });
    b = {
      cx: r0.cx,
      cz: r0.cz,
      rx: (maxx - minx) * 0.31,
      rz: (maxz - minz) * 0.31,
    };
  } else b = { cx: 200, cz: 150, rx: 160, rz: 120 };
  var out = [];
  for (var a = 0; a < 10; a++) {
    var ang = (a / 10) * Math.PI * 2;
    out.push({
      x: b.cx + Math.sin(ang) * Math.max(b.rx, 75),
      z: b.cz + Math.cos(ang) * Math.max(b.rz, 75),
    });
  }
  return out;
}

export function fig8Anchors(rooms) {
  var b;
  if (rooms.length) {
    var r0 = rooms[0];
    rooms.forEach(function (r) {
      if (r.area > r0.area) r0 = r;
    });
    var minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
    r0.pts.forEach(function (p) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z);
      maxz = Math.max(maxz, p.z);
    });
    b = { cx: r0.cx, cz: r0.cz, rx: Math.max((maxx - minx) * 0.38, 80), rz: Math.max((maxz - minz) * 0.38, 80) };
  } else b = { cx: 200, cz: 150, rx: 160, rz: 120 };
  var out = [];
  for (var i = 0; i < 16; i++) {
    var ang = (i / 16) * Math.PI * 2;
    out.push({
      x: b.cx + Math.sin(ang) * b.rx,
      z: b.cz + (Math.sin(2 * ang) * 0.5) * b.rz,
    });
  }
  return out;
}

// A checkpoint you drive THROUGH: two posts and a banner spanning the road,
// tilted with the deck so it still frames the lane on a banked or climbing
// section. The start gate wears a chequered flag.
export function makeGate(wp, first) {
  var g = new THREE.Group();
  g.userData.rc = true;
  var HW = 15;
  var post = new THREE.MeshBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  var curt = new THREE.MeshBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  [-1, 1].forEach(function (sd) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), post);
    m.position.set(sd * HW, 7, 0);
    g.add(m);
  });
  var bar = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 1.2, 2.8, 1), post);
  bar.position.y = 15.1;
  g.add(bar);
  var cur = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 13.4), curt);
  cur.position.y = 7;
  g.add(cur);
  if (first) {
    // chequered flag across the banner
    for (var i = 0; i < 14; i++)
      for (var j = 0; j < 2; j++) {
        var q = new THREE.Mesh(
          new THREE.BoxGeometry(HW * 2 / 14, 1.4, 1.2),
          new THREE.MeshBasicMaterial({
            color: (i + j) % 2 ? 0x14161a : 0xf2f4f8,
          }),
        );
        q.position.set(-HW + ((i + 0.5) * HW * 2) / 14, 14.4 + j * 1.4, 0);
        g.add(q);
      }
  }
  g.position.set(wp.x, wp.y, wp.z);
  g.rotation.y = Math.atan2(wp.ux || 0, wp.uz || 1);
  g.rotation.z = wp.bank || 0;
  wp.mats = [post, curt];
  return g;
}
export function makeDot(wp) {
  var g = new THREE.Group();
  g.userData.rc = true;
  var mat = new THREE.MeshBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  var dot = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16), mat);
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 0.4;
  g.add(dot);
  g.position.set(wp.x, wp.y, wp.z);
  wp.mats = [mat];
  return g;
}

// ---- see-through models where the road runs through them --------------------
// The deck owns collision wherever it supports the kart (roadOwnsCollision), so
// a wall or a tall cabinet the ribbon flies through stops blocking: you drive
// straight past something that still LOOKS solid. That mismatch is the bug —
// the picture has to agree with what the mechanics allow, so anything the
// corridor genuinely passes through drops to 20% opacity while RC mode is on.
//
// The test is a ray along the racing line, not a box overlap: a wall whose
// bounding box the road only clips because it enters through the DOORWAY is
// never hit by the ray, so ordinary walls keep their opacity.
var GHOST_OP = 0.2, // 80% transparent
  GHOST_HEAD = 10, // cm above the deck that still counts as "in the way"
  GHOST_STEP = 40; // max centreline step to ray-test (skips the jump gap)
var ghosted = [];

function ghostMesh(m) {
  if (m.userData.rcGhost) return;
  var arr = Array.isArray(m.material),
    mats = arr ? m.material : [m.material];
  var made = mats.map(function (mt) {
    var c = mt.clone(); // never touch the shared original
    c.transparent = true;
    c.opacity = Math.min(mt.opacity == null ? 1 : mt.opacity, GHOST_OP);
    c.depthWrite = false;
    return c;
  });
  ghosted.push({ m: m, orig: m.material, made: made, shadow: m.castShadow });
  m.material = arr ? made : made[0];
  m.castShadow = false; // a ghost casting a solid shadow reads as solid
  m.userData.rcGhost = true;
}

export function unghostRoadCrossings() {
  ghosted.forEach(function (g) {
    g.m.material = g.orig;
    g.m.castShadow = g.shadow;
    delete g.m.userData.rcGhost;
    g.made.forEach(function (c) {
      c.dispose();
    });
  });
  ghosted = [];
}

function ghostRoadCrossings(center) {
  var scene = getMainScene();
  if (!scene || !center || center.length < 2) return;
  scene.updateMatrixWorld(true);
  var half = (R.roadWidth || 26) / 2;
  var pts = center.map(function (p) {
    return new THREE.Vector3(p.x, p.y + (p.lift || 0), p.z);
  });
  var corridor = new THREE.Box3();
  pts.forEach(function (v) {
    corridor.expandByPoint(v);
  });
  corridor.expandByVector(new THREE.Vector3(half, GHOST_HEAD, half));
  var cands = [];
  scene.traverse(function (o) {
    if (!o.isMesh || !o.material || !o.geometry) return;
    for (var q = o; q; q = q.parent) if (q.userData && q.userData.rc) return;
    var bb = new THREE.Box3().setFromObject(o);
    if (bb.isEmpty() || !bb.intersectsBox(corridor)) return;
    cands.push({ m: o, bb: bb });
  });
  if (!cands.length) return;
  var ray = new THREE.Raycaster(),
    org = new THREE.Vector3(),
    dir = new THREE.Vector3();
  cands.forEach(function (c) {
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i],
        b = pts[(i + 1) % pts.length];
      dir.subVectors(b, a);
      var len = dir.length();
      if (len < 0.01 || len > GHOST_STEP) continue;
      if (
        Math.max(a.x, b.x) < c.bb.min.x - half ||
        Math.min(a.x, b.x) > c.bb.max.x + half ||
        Math.max(a.z, b.z) < c.bb.min.z - half ||
        Math.min(a.z, b.z) > c.bb.max.z + half ||
        a.y + GHOST_HEAD < c.bb.min.y ||
        a.y > c.bb.max.y
      )
        continue;
      dir.normalize();
      ray.far = len;
      // two heights: something the truck drives THROUGH, and something it
      // drives UNDER that still hangs in front of the camera
      for (var h = 0; h < 2; h++) {
        org.set(a.x, a.y + 1 + h * (GHOST_HEAD - 2), a.z);
        ray.set(org, dir);
        if (ray.intersectObject(c.m, false).length) {
          ghostMesh(c.m);
          return;
        }
      }
    }
  });
}

// Build the whole circuit: route through every room, hand the anchors to the
// road builder (js/track.js) for the 3D ribbon with its spiral, elevated leg
// and ramp-jump, then hang the gates and the item layer off the result.
export function buildTrack() {
  R.trackError = null;
  applyPhysicsConfig();
  var rooms = detectRooms().filter(function (r) {
    return !roomHidden(r.key) && r.area > 12000; // skip cupboards < 1.2m²
  });
  var anchors = customAnchors() || routeAllRooms(rooms);
  if (anchors.length < 3) anchors = ovalAnchors(rooms);
  anchors = anchors.map(function (a) {
    // A point the editor put ON a piece of furniture ("drive over the bed") is
    // deliberately inside a collision box: spiralling it out to free floor is
    // exactly what must NOT happen to it.
    if (a.ride || fin(a.y)) return Object.assign({}, a);
    var s = findFreeSpot(a.x, a.z, 12);
    var out = { x: s.x, z: s.z };
    if (a.surf) out.surf = a.surf;
    return out;
  });
  var environment = {
    groundAt: function (x, z, y, step) { return Col2D.groundAt(R.col, x, z, y, step); },
    blockedAt: blockedAt,
    homeMode: !!R.homeMode,
    homeFeatures: !!R.homeFeatures,
    tourDoors: tourDoors(rooms),
    reverseCourse: !!R.reverseCourse,
    followAnchors: !!R.followAnchors,
    roadWidth: R.roadWidth,
    highElevation: R.highElevation,
    theme: R.roadTheme,
    hasJump: R.hasJump !== false,
    rects: function () {
      return (R.col && R.col.rects) || [];
    },
    tops: function () {
      return (R.col && R.col.tops) || [];
    },
    segs: function () {
      return (R.col && R.col.segs) || [];
    },
  };
  var road = buildRoad(anchors, rooms, environment);
  var quality = road && R.homeMode ? courseQuality(road.center, environment, rooms, (R.roadWidth || 26) / 2) : null;
  if (!road || (quality && !quality.valid)) {
    if (road) disposeGrp(road.group);
    R.trackError = t("rc_course_failed");
    // Keep a previous course only if it still fits the current world.
    if (R.track && (R.trackSig !== planSig() || (R.homeMode && !courseQuality(R.track.center, environment, rooms, (R.roadWidth || 26) / 2).valid))) clearTrack();
    if (hooks.showMsg) hooks.showMsg(R.trackError, 5000);
    editorSynced();
    return false;
  }
  clearTrack();
  if (R.col) {
    R.col.road = road.col.road.slice();
    R.col.surface = (road.col.surface || []).slice();
    R.col.rails = road.col.rails.slice();
    R.col.gaps = (road.col.gaps || []).slice();
  }
  var scene = getMainScene();
  scene.add(road.group);
  var wps = road.wps;
  wps.forEach(function (wp, i) {
    var g = wp.minor ? makeDot(wp) : makeGate(wp, i === 0);
    scene.add(g);
    wp.grp = g;
  });
  R.track = {
    wps: wps,
    group: road.group,
    col: road.col,
    feats: road.feats,
    high: road.high,
    center: road.center, // dense centreline — the editor's 2D map draws it
    len: road.len,
    quality: quality,
    sig: courseFingerprint(road.center),
  };
  R.trackSig = planSig(); // what flat this circuit was built for
  // item boxes, coin trails and boost pads along the finished racing line
  kartBuild(wps, { pads: road.pads });
  if (!R.homeMode) ghostRoadCrossings(road.center);
  editorSynced(); // live editor: refresh handles, map and stats
  return true;
}

export function clearTrack() {
  kartClear();
  unghostRoadCrossings();
  if (R.col) {
    R.col.road = [];
    R.col.surface = [];
    R.col.rails = [];
    R.col.gaps = [];
  }
  if (!R.track) return;
  var scene = getMainScene();
  R.track.wps.forEach(function (wp) {
    if (wp.grp) {
      scene.remove(wp.grp);
      disposeGrp(wp.grp);
    }
  });
  if (R.track.group) {
    scene.remove(R.track.group);
    disposeGrp(R.track.group);
  }
  R.track = null;
}

export function bestTime() {
  if (!R.track) return 0;
  var v = parseInt(localStorage.getItem(R.track.sig + "_race_" + R.laps) || "0", 10);
  return v > 0 ? v : 0;
}
// Best single lap is a separate record from best total: a 5-lap race and a time
// trial on the same circuit should share the lap record but not the race time.
export function bestLapKey() {
  return R.track ? R.track.sig + "_lap" : "";
}
export function bestLap() {
  if (!R.track) return 0;
  var v = parseInt(localStorage.getItem(bestLapKey()) || "0", 10);
  return v > 0 ? v : 0;
}
export function saveBestLap(ms) {
  if (!R.track || !(ms > 0)) return false;
  var b = bestLap();
  if (b && ms >= b) return false;
  try {
    localStorage.setItem(bestLapKey(), String(Math.round(ms)));
  } catch (e) {}
  return true;
}
export function saveBestTime(ms) {
  if (!R.track || !(ms > 0)) return false;
  var b = bestTime();
  if (b && ms >= b) return false;
  try {
    localStorage.setItem(R.track.sig + "_race_" + R.laps, String(Math.round(ms)));
  } catch (e) {}
  return true;
}

// ---- water pools ------------------------------------------------------------
// Track-builder tool: shader-animated pools the trucks wade through. Purely a
// surface + drag hazard — pools never block, they slow, sink and splash.
var WATER_VERT =
  "uniform float uTime;\n" +
  "varying vec3 vLocal; varying float vWave; varying vec3 vView;\n" +
  "void main(){\n" +
  "  vec3 p = position;\n" +
  "  float t = uTime;\n" +
  "  float w = sin(p.x*0.55+t*2.0)*0.22 + sin(p.z*0.43-t*1.6)*0.18 + sin((p.x+p.z)*0.31+t*1.15)*0.13;\n" +
  "  p.y += w;\n" +
  "  vWave = w; vLocal = position;\n" +
  "  vec4 wp = modelMatrix * vec4(p,1.0);\n" +
  "  vView = normalize(cameraPosition - wp.xyz);\n" +
  "  gl_Position = projectionMatrix * viewMatrix * wp;\n" +
  "}";
var WATER_FRAG =
  "uniform float uTime; uniform float uR;\n" +
  "varying vec3 vLocal; varying float vWave; varying vec3 vView;\n" +
  "void main(){\n" +
  "  float d = length(vLocal.xz)/uR;\n" +
  "  float fr = pow(1.0 - clamp(abs(vView.y),0.0,1.0), 2.2);\n" + // fresnel: brighter at glancing angles
  "  vec3 deep = vec3(0.05,0.23,0.33); vec3 lit = vec3(0.25,0.62,0.78);\n" +
  "  vec3 col = mix(deep, lit, clamp(fr*0.75 + (vWave+0.5)*0.25, 0.0, 1.0));\n" +
  "  float sp = pow(max(0.0, sin(vLocal.x*1.3+uTime*3.1)*sin(vLocal.z*1.1-uTime*2.3)), 24.0);\n" +
  "  col += vec3(0.9,0.95,1.0)*sp*0.5;\n" + // drifting sun glints
  "  float foam = smoothstep(0.88, 0.985, d + vWave*0.06);\n" + // wobbling shoreline foam
  "  col = mix(col, vec3(0.92,0.97,1.0), foam*0.75);\n" +
  "  gl_FragColor = vec4(col, mix(0.82, 0.95, foam));\n" +
  "}";

export function makeWaterMesh(pool) {
  var g = new THREE.Group();
  g.userData.rc = true;
  var bed = new THREE.Mesh(
    new THREE.CircleGeometry(pool.r * 0.99, 48),
    new THREE.MeshStandardMaterial({ color: 0x0c2733, roughness: 0.9 }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 0.06;
  bed.receiveShadow = true;
  g.add(bed);
  var surfGeo = new THREE.CircleGeometry(pool.r, 64, 0, Math.PI * 2);
  surfGeo.rotateX(-Math.PI / 2);
  var mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uR: { value: pool.r } },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  var surf = new THREE.Mesh(surfGeo, mat);
  surf.position.y = WATER_SURF;
  g.add(surf);
  g.position.set(pool.x, 0, pool.z);
  getMainScene().add(g);
  pool.grp = g;
  pool.mat = mat;
}

export function watersSave() {
  try {
    localStorage.setItem(
      "home3d_rc_water",
      JSON.stringify(
        R.waters.map(function (w) {
          return { x: Math.round(w.x), z: Math.round(w.z), r: w.r };
        }),
      ),
    );
  } catch (e) {}
}
export function watersLoad() {
  watersClear();
  try {
    var arr = JSON.parse(localStorage.getItem("home3d_rc_water") || "[]");
    arr.forEach(function (w) {
      if (!fin(w.x) || !fin(w.z)) return;
      var pool = { x: w.x, z: w.z, r: clamp(w.r || WATER_R, 10, 80) };
      makeWaterMesh(pool);
      R.waters.push(pool);
    });
  } catch (e) {}
}
export function watersClear() {
  var scene = getMainScene();
  R.waters.forEach(function (w) {
    if (w.grp) {
      scene.remove(w.grp);
      disposeGrp(w.grp);
    }
  });
  R.waters = [];
}

export function waterAt(x, z) {
  for (var i = 0; i < R.waters.length; i++) {
    var w = R.waters[i];
    if (Math.hypot(x - w.x, z - w.z) < w.r - 2) return w;
  }
  return null;
}

// panel 💧 tool: a still click in the 3D view adds a pool (or removes the one
// clicked). Placement only — dragging still orbits the chase cam.
export function waterClickPlace(e) {
  var v3d = document.getElementById("v3d");
  var rect = v3d.getBoundingClientRect();
  var cam = getMainCamera();
  if (!cam || !rect.width) return;
  var ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  var rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, cam);
  var hit = new THREE.Vector3();
  if (
    !rc.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit,
    )
  )
    return;
  for (var i = 0; i < R.waters.length; i++) {
    var w = R.waters[i];
    if (Math.hypot(hit.x - w.x, hit.z - w.z) < w.r) {
      getMainScene().remove(w.grp);
      disposeGrp(w.grp);
      R.waters.splice(i, 1);
      watersSave();
      beep(300, 0.08, 0.3);
      return;
    }
  }
  var pool = { x: hit.x, z: hit.z, r: WATER_R };
  makeWaterMesh(pool);
  R.waters.push(pool);
  watersSave();
  beep(520, 0.1, 0.3);
}

// short-lived droplet burst (wading spray & entry splashes). Geometry and
// material are shared by every droplet — size variance lives on the mesh
// scale and the fade shrinks it — so a splash allocates no GPU resources.
var sprayGeo = null,
  sprayMat = null;
export function spraySpawn(x, y, z, n, sp) {
  var scene = getMainScene();
  var now = performance.now();
  if (R.spray.length > 90) return; // droplet budget
  if (!sprayGeo) {
    sprayGeo = new THREE.SphereGeometry(1, 6, 4);
    sprayMat = new THREE.MeshBasicMaterial({
      color: 0x9fd4ee,
      transparent: true,
      opacity: 0.9,
    });
  }
  for (var i = 0; i < n; i++) {
    var m = new THREE.Mesh(sprayGeo, sprayMat);
    var r = 0.16 + Math.random() * 0.18;
    m.scale.setScalar(r);
    m.userData.rc = true;
    m.position.set(x, y, z);
    scene.add(m);
    var ang = Math.random() * Math.PI * 2;
    R.spray.push({
      m: m,
      r: r,
      vx: Math.sin(ang) * sp * (0.3 + Math.random() * 0.7),
      vz: Math.cos(ang) * sp * (0.3 + Math.random() * 0.7),
      vy: 40 + Math.random() * sp,
      t0: now,
    });
  }
}
export function stepSpray(dt, now) {
  if (!R.spray.length) return;
  var scene = getMainScene();
  R.spray = R.spray.filter(function (s) {
    var age = (now - s.t0) / 1000;
    s.vy -= GRAV * dt;
    s.m.position.x += s.vx * dt;
    s.m.position.y += s.vy * dt;
    s.m.position.z += s.vz * dt;
    // fade by shrinking — the material is shared, so opacity is not per-droplet
    s.m.scale.setScalar(s.r * Math.max(0.05, 1 - age * 1.4));
    if (age > 0.7 || s.m.position.y < 0) {
      scene.remove(s.m); // geometry/material are shared — nothing to dispose
      return false;
    }
    return true;
  });
}

// ---- doors ------------------------------------------------------------------
export function openAllDoors() {
  var scene = getMainScene();
  (scene.doors || []).forEach(function (d) {
    if (!d.userData.open) {
      d.userData.open = true;
      R.openedDoors.push(d);
    }
  });
}
export function restoreDoors() {
  R.openedDoors.forEach(function (d) {
    if (d.userData) d.userData.open = false;
  });
  R.openedDoors = [];
}

// ---- audio ------------------------------------------------------------------
// Three permanently-running voices mixed under one master, plus one-shots:
//   engine  — two detuned oscillators, pitch stepped through four "gears"
//   skid    — bandpassed noise, opened by drift angle and lateral scrub
//   rumble  — lowpassed noise, opened by speed and darkened off the tarmac
// Everything is gated on R.volume, so the mute button is a single gain write.
var NOISE_BUF = null;
function noiseBuffer(ctx) {
  if (NOISE_BUF && NOISE_BUF.sampleRate === ctx.sampleRate) return NOISE_BUF;
  var len = Math.floor(ctx.sampleRate * 1.4);
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  NOISE_BUF = buf;
  return buf;
}
// a looping noise voice: source → filter → its own gain → master
function noiseVoice(ctx, dest, type, freq, q) {
  var src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  var flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.value = freq;
  if (q != null) flt.Q.value = q;
  var g = ctx.createGain();
  g.gain.value = 0;
  src.connect(flt);
  flt.connect(g);
  g.connect(dest);
  src.start();
  return { src: src, flt: flt, gain: g };
}
export function audio() {
  if (R.audio) return R.audio;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var master = ctx.createGain();
    master.gain.value = 0.14 * (R.volume == null ? 0.8 : R.volume);
    master.connect(ctx.destination);
    var osc = ctx.createOscillator();
    osc.type = "sawtooth";
    var osc2 = ctx.createOscillator();
    osc2.type = "square";
    var eg = ctx.createGain();
    eg.gain.value = 0;
    var flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = 1200;
    osc.connect(eg);
    osc2.connect(eg);
    eg.connect(flt);
    flt.connect(master);
    osc.start();
    osc2.start();
    R.audio = {
      ctx: ctx,
      master: master,
      osc: osc,
      osc2: osc2,
      eg: eg,
      skid: noiseVoice(ctx, master, "bandpass", 1900, 1.7),
      rumble: noiseVoice(ctx, master, "lowpass", 620),
      gear: 0,
    };
  } catch (e) {
    R.audio = null;
  }
  return R.audio;
}

// Master level, 0 = silent. Called by the panel's volume control.
export function setVolume(v) {
  R.volume = clamp(v, 0, 1);
  if (R.audio) R.audio.master.gain.setTargetAtTime(0.14 * R.volume, R.audio.ctx.currentTime, 0.02);
}

// Tyre scrub. `slip` is 0..1 — a drifting kart is 1, a hard-cornering one is
// somewhere below. Held open across frames so it reads as a continuous squeal
// rather than a machine-gun of one-shots.
export function skidTick(slip, speed) {
  var a = R.audio;
  if (!a) return;
  var amt = clamp(slip, 0, 1) * clamp(Math.abs(speed) / 40, 0, 1);
  a.skid.gain.gain.setTargetAtTime(amt * 0.5, a.ctx.currentTime, amt > 0.05 ? 0.03 : 0.12);
  a.skid.flt.frequency.setTargetAtTime(1500 + amt * 1400, a.ctx.currentTime, 0.08);
}

// Road noise under the wheels. `kind` darkens it: tarmac is bright, the bare
// floor beside the deck is duller and louder, water is a hiss.
export function rumbleTick(speed, kind) {
  var a = R.audio;
  if (!a) return;
  var pace = clamp(Math.abs(speed) / Math.max(1, MAXV), 0, 1.3);
  var lvl = kind === "off" ? 0.34 : kind === "water" ? 0.3 : 0.15;
  a.rumble.gain.gain.setTargetAtTime(pace * lvl, a.ctx.currentTime, 0.09);
  a.rumble.flt.frequency.setTargetAtTime(
    kind === "off" ? 380 : kind === "water" ? 2600 : 700 + pace * 700,
    a.ctx.currentTime,
    0.09,
  );
}

// A body blow: noise burst plus a pitch-dropping sine. `force` 0..1.
export function thud(force) {
  var a = audio();
  if (!a) return;
  var f = clamp(force, 0, 1);
  var t0 = a.ctx.currentTime;
  var src = a.ctx.createBufferSource();
  src.buffer = noiseBuffer(a.ctx);
  src.loop = true;
  var flt = a.ctx.createBiquadFilter();
  flt.type = "lowpass";
  flt.frequency.setValueAtTime(900 + f * 1500, t0);
  flt.frequency.exponentialRampToValueAtTime(160, t0 + 0.16);
  var g = a.ctx.createGain();
  g.gain.setValueAtTime(0.35 + f * 0.5, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
  src.connect(flt);
  flt.connect(g);
  g.connect(a.master);
  src.start();
  src.stop(t0 + 0.24);
  var o = a.ctx.createOscillator(),
    og = a.ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150 + f * 90, t0);
  o.frequency.exponentialRampToValueAtTime(42, t0 + 0.18);
  og.gain.setValueAtTime(0.5 + f * 0.4, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
  o.connect(og);
  og.connect(a.master);
  o.start();
  o.stop(t0 + 0.26);
}

// Short melodic cues. Each is a note list [freq, startOffset, length, vol].
var STINGS = {
  pickup: [[880, 0, 0.07, 0.3], [1320, 0.06, 0.1, 0.3]],
  fire: [[520, 0, 0.06, 0.32], [300, 0.05, 0.09, 0.28]],
  hit: [[300, 0, 0.09, 0.45], [180, 0.07, 0.16, 0.4]],
  coin: [[1180, 0, 0.05, 0.22], [1560, 0.045, 0.09, 0.2]],
  lap: [[760, 0, 0.09, 0.35], [1010, 0.08, 0.13, 0.3]],
  finish: [[660, 0, 0.12, 0.4], [880, 0.11, 0.12, 0.4], [1320, 0.22, 0.3, 0.45]],
  best: [[880, 0, 0.09, 0.35], [1180, 0.08, 0.09, 0.35], [1480, 0.16, 0.26, 0.4]],
  light: [[440, 0, 0.14, 0.45]],
  go: [[880, 0, 0.32, 0.6]],
  fail: [[220, 0, 0.16, 0.4], [150, 0.14, 0.26, 0.35]],
};
export function sting(name) {
  var notes = STINGS[name];
  if (!notes) return;
  var a = audio();
  if (!a) return;
  notes.forEach(function (n) {
    setTimeout(function () {
      beep(n[0], n[2], n[3]);
    }, n[1] * 1000);
  });
}
export function beep(freq, dur, vol) {
  var a = audio();
  if (!a) return;
  var o = a.ctx.createOscillator(),
    g = a.ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.5, a.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + (dur || 0.12));
  o.connect(g);
  g.connect(a.master);
  o.start();
  o.stop(a.ctx.currentTime + (dur || 0.12) + 0.02);
}
// Four faked gear steps. A pitch that rises linearly with speed all the way to
// the limiter sounds like a hairdryer; letting it climb inside a gear and drop
// on the change is what makes the same oscillator read as a drivetrain.
var GEARS = 4;
export function engineTick(throttle, v) {
  var a = R.audio;
  if (!a) return;
  var ratio = clamp(Math.abs(v) / Math.max(1, MAXV), 0, 1.25);
  var g = Math.min(GEARS - 1, Math.floor(ratio * GEARS));
  var rev = ratio * GEARS - g; // 0..1 within the gear
  if (g !== a.gear) {
    a.gear = g;
    // a short dip in level across the shift, in place of a real clutch
    a.eg.gain.setTargetAtTime(0.02, a.ctx.currentTime, 0.012);
  }
  var f = 118 + rev * 190 + g * 26 + (throttle ? 12 : 0);
  a.osc.frequency.setTargetAtTime(f, a.ctx.currentTime, 0.04);
  a.osc2.frequency.setTargetAtTime(f * 0.5, a.ctx.currentTime, 0.04);
  var tgtG =
    R.active && R.phase === "drive" && !R.paused
      ? 0.04 + (throttle ? 0.075 : 0) + ratio * 0.05
      : 0;
  a.eg.gain.setTargetAtTime(tgtG, a.ctx.currentTime, 0.08);
}
export function engineOff() {
  var a = R.audio;
  if (!a) return;
  a.eg.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
  a.skid.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
  a.rumble.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
}

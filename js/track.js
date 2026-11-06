// Kart-track road builder for the micro RC race (js/rc.js).
//
// Turns a flat loop of 2D anchor points (room centres + doorways) into an
// actual ROAD: a banked ribbon with kerbs, a helical spiral that climbs to
// rooftop-of-the-furniture height, an elevated return leg that flies over the
// whole apartment, a ramp-jump with a real gap in it, and pillars holding the
// lot up. Everything — mesh, collision, waypoints, rails — is derived from one
// dense 3D centreline, so features are added by editing the elevation profile
// and splicing points in, never by hand-building geometry twice.
//
// The collision output contains the exact two top triangles emitted for every
// rendered deck quad. Rails are height-banded blockers so an elevated deck has
// walls without also walling off the floor underneath it.
import * as THREE from "three";
import { clamp } from "./state.js";
import { pointInPoly } from "./geometry.js";
import { STEP_UP } from "./road_surface.js";
import {
  buildCollision, buildMesh, buildRoadCandidate, buildWps, repeatLift, turnAt,
} from "./track/road_mesh.js";
import {
  buildRoad, courseQuality, pathFree, roomCircuit,
} from "./track/course_plan.js";
import { canRide, rideSpot, seedHomeTour } from "./track/routes.js";
export { canRide, rideSpot, seedHomeTour };
export { buildRoad, courseQuality, roomCircuit };
// for js/track/road_mesh.js (live bindings: it sees every reassignment)
export {
  BANK_FADE, BANK_K, BANK_MAX, BANK_RATE, BANK_SMOOTH, COVER_DY, CURVE_ROUNDS,
  CURV_WIN, FLOOR_Y, GUIDE_LIFT, GUIDE_W, HALF, HIGH_FULL, HOME_ACTIVE,
  HUMP_H, HUMP_TURN, HUMP_W, KERB_H, KERB_W, KICK_RISE, KICK_Y, LAND_Y, MIN_R,
  PILLAR_GAP, RAIL_FROM, RAIL_H, REPEAT_LIFT, REPEAT_MAX, ROUTE_PAD, SAMP,
  SOFT_RAIL_H, SPIRAL_STEP, Strip, THICK, W, decked, halfAt, limitCurvature,
  relaxKinks, resampleClosed, respace, roundTurnarounds, set_HALF_ACTIVE,
  set_HOME_ACTIVE, solid, tangent,
};
// for js/track/course_plan.js (live bindings: it sees every reassignment)
export {
  BRIDGE_CLEAR, BRIDGE_MAX, CAR_BAND, CELL, EDGE_N, HALF_ACTIVE, HOME_ROUNDS,
  JUMP_H, JUMP_LAND, LEDGE, MIN_R_HOME, RAMP_GRADE, RAMP_STEEP, RAMP_TURN,
  RIDE_DROP, RIDE_HALF, RIDE_RUN, RUB, SPIRAL_R, TRUCK_PAD, angleAt,
};
// for js/track/routes.js (live bindings: it sees every reassignment)
export {
  ATTRACT_MAX, ATTRACT_R, CLEAR_CAP, DETOUR_MAX, DETOUR_SLOPE, HAIRPIN,
  HAIRPIN_MAX, HAIRPIN_MIN, HAIRPIN_WIN, LANE_GAP, LANE_MIN, LANE_OFF,
  LANE_SAME, RIDE_FOOT, RIDE_INSET, RIDE_MAX, RIDE_MIN, crossesWall,
};

// ---- tuning (cm) ------------------------------------------------------------
var SAMP = 6, // centreline sample spacing
  W = 26, // road width
  HALF = W / 2,
  THICK = 2.4, // deck slab thickness
  // Floor-level deck sits ALMOST flush. It used to stand 1.8cm proud, which on a
  // 2.9cm truck meant anything that slipped off the ribbon was half-buried by the
  // slab it should be driving on — reading as "the kart went under the road".
  // Coplanar z-fighting is handled by polygonOffset on the road materials now,
  // so the deck no longer needs height to separate it from the floor.
  FLOOR_Y = 0.7,
  KERB_W = 2.8,
  KERB_H = 1.2,
  RAIL_H = 5.5, // side wall on elevated sections
  SOFT_RAIL_H = 4.5, // invisible race-only kerb wall at floor level
  RAIL_FROM = 5, // deck height above which the road gets walls
  BANK_K = 10, // roll per unit curvature: 0.1rad (6°) on a 1m-radius bend
  BANK_MAX = 0.14, // 8° — a 26cm road rolled further stands its edge 4cm proud
  BANK_SMOOTH = 6, // averaging passes over the bank
  BANK_FADE = 10, // deck height (cm) at which the bank reaches full strength
  BANK_RATE = 0.012, // max change in roll per sample
  CURV_WIN = 3, // samples either side used to measure curvature
  HUMP_TURN = 0.09, // rad/sample the hump refuses to sit on (~70cm radius)
  REPEAT_LIFT = 0.3, // per-pass separation where the road overlaps itself
  REPEAT_MAX = 3,
  SPIRAL_R = 62, // helix radius — roomier is far easier to hold at speed
  SPIRAL_STEP = 7, // arc spacing along the helix
  PILLAR_GAP = 56,
  HIGH_FULL = 105, // elevated deck height on a roomy circuit
  HUMP_H = 13, // floor-section speed hump
  HUMP_W = 46, // ...spread over this much road
  KICK_Y = 30, // height the descent ramp bottoms out at
  KICK_RISE = 9, // the kicker that launches the jump — shallow enough that a
  // boosting truck still climbs it rather than hitting it like a step
  LAND_Y = 17; // top of the landing ramp

// ---- home mode --------------------------------------------------------------
// "Drive on the house and on the models, not on a road." With a ribbon under the
// kart the whole lap you see road, not home. In home mode the apartment IS the
// circuit: the floor and the furniture carry the truck, and a deck is built ONLY
// where the world cannot carry it — the access ramp up onto a table or a bed, a
// short bridge over something too tall to climb, and the ramp jump. Everything
// else is bare: no deck, no kerbs, no rails, just a painted line on whatever is
// really there. Every sample carries `deck`, and mesh + collision are both built
// from it, so what you see and what holds you up can never disagree.
var LEDGE = 3.4, // tops under this are simply climbed (STEP_H is 2.2)
  TRUCK_PAD = 3, // clearance a truck needs beside an item, not a road width
  RUB = 2.3, // ...and the width at which it actually rubs (rc.js COLL_R + slack)
  RIDE_MIN = 9, // shortest climb worth building a ramp for
  RIDE_MAX = 96, // tallest top an access ramp will reach (counter / dining table)
  CAR_BAND = 3.2, // ...and the body height that has to clear what it drives past
  RIDE_FOOT = 50, // smallest footprint side that can carry the driving line
  RIDE_RUN = 40, // shortest crossing worth a pair of ramps
  RIDE_DROP = 52, // ...and the tallest top you may drive off with no exit ramp
  RIDE_INSET = 8, // keep the line this far inside the item's own edge
  ATTRACT_R = 800, // visit models across the whole flat, not only those next to the line
  ATTRACT_MAX = 16, // as many rideable models as a lap can reasonably climb
  ATTRACT_FLAT = 8, // samples the detour holds level ON the item (~1m of ride)
  THROUGH_LEAD = 5, // deck samples laid before/after an unavoidable item
  ROUTE_PAD = 150, // grid margin so a route may detour outside the anchors' hull
  RIDE_HALF = 8, // the driven corridor on a ramp: a truck wide, not a road
  EDGE_N = 2, // ramp samples carried ON TOP of the item, closing the lip
  BRIDGE_MAX = 90, // tallest obstacle a local flyover will hop
  BRIDGE_CLEAR = 2.6, // how far that flyover floats over what it crosses
  RAMP_GRADE = 0.4, // average rise per cm of run (eased: ~1.5× in the middle)
  RAMP_STEEP = 0.85, // ...steepened this far before an item is written off
  // How much a ramp may bend, per sample. A 16cm-wide ramp folds over itself
  // geometrically at SAMP/RIDE_HALF = 0.75rad, so 0.62 keeps a margin while
  // still fitting the line an indoor route actually takes between furniture —
  // the approach to a bed usually comes through a doorway, and that corner does
  // not smooth out. Demanding a road's 0.17 rejected every ramp in a real flat
  // and the mode built nothing at all.
  RAMP_TURN = 0.62,
  JUMP_H = 16, // home-mode kicker height
  JUMP_LAND = 9, // top of its landing ramp
  GUIDE_W = 1.2, // painted racing line half-width
  GUIDE_LIFT = 0.35; // ...floated over whatever surface it is painted on

// The deck's half width for THIS build (the editor's width slider) and the
// per-sample override an access ramp uses to stay narrower than a road.
var HALF_ACTIVE = HALF;
function set_HALF_ACTIVE(value) { return HALF_ACTIVE = value; }
// Is THIS build a home-mode one? Read by the collision/mesh builders, which
// otherwise cannot tell an isolated ramp from one link of a continuous circuit.
var HOME_ACTIVE = false;
function set_HOME_ACTIVE(value) { return HOME_ACTIVE = value; }
function halfAt(p) {
  return (p && p.w) || HALF_ACTIVE;
}
// Two independent questions per sample, and home mode answers them separately.
// `decked` — is there a road here to LOOK at? Classic mode decks the whole loop
// (`deck` left undefined); home mode only ramps, bridges and the jump.
// `solid` — is there a surface here to DRIVE on? Also true along the top of the
// sofa or the table the route climbs onto: the physics needs a plane at the
// seat's own height (the item's collision box tops out at its backrest), but
// drawing one there would bury the thing you came to drive on.
function decked(p) {
  return !!p && !p.gap && p.deck !== false;
}
function solid(p) {
  return !!p && !p.gap && p.hold !== false && (p.deck !== false || p.hold === true);
}

// ---- small geometry builder -------------------------------------------------
// accumulates quads into one BufferGeometry — one draw call per road part
function Strip() {
  this.pos = [];
  this.col = [];
  this.idx = [];
  this.normals = [];
  this.n = 0;
}
Strip.prototype.quad = function (a, b, c, d, col, normals) {
  var p = this.pos,
    k = this.n;
  p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  if (col)
    for (var i = 0; i < 4; i++) this.col.push(col[0], col[1], col[2]);
  this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  if (normals) normals.forEach((normal, i) => this.normals.push({ index: k + i, normal }));
  this.n += 4;
};
Strip.prototype.mesh = function (mat) {
  if (!this.n) return null;
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
  if (this.col.length)
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
  g.setIndex(this.idx);
  g.computeVertexNormals();
  const normal = g.getAttribute("normal");
  this.normals.forEach(v => normal.setXYZ(v.index, v.normal.x, v.normal.y, v.normal.z));
  var m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  m.userData.rc = true;
  return m;
};

// ---- centreline helpers -----------------------------------------------------
function catmull(p0, p1, p2, p3, u) {
  function c(a, b, cc, d) {
    return (
      0.5 *
      (2 * b + (cc - a) * u + (2 * a - 5 * b + 4 * cc - d) * u * u +
        (3 * b - a - 3 * cc + d) * u * u * u)
    );
  }
  var out = { x: c(p0.x, p1.x, p2.x, p3.x), z: c(p0.z, p1.z, p2.z, p3.z) };
  if (typeof p1.y === "number" || typeof p2.y === "number") {
    var y1 = typeof p1.y === "number" ? p1.y : FLOOR_Y;
    var y2 = typeof p2.y === "number" ? p2.y : FLOOR_Y;
    var ease = u * u * (3 - 2 * u);
    out.y = y1 + (y2 - y1) * ease;
  }
  return out;
}

// closed Catmull-Rom through the anchors, resampled to even `step` spacing
function resampleClosed(anchors, step) {
  var N = anchors.length;
  if (N < 3) return [];
  var fine = [];
  for (var i = 0; i < N; i++) {
    var p0 = anchors[(i - 1 + N) % N],
      p1 = anchors[i],
      p2 = anchors[(i + 1) % N],
      p3 = anchors[(i + 2) % N];
    var seg = Math.max(2, Math.round(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 4));
    for (var k = 0; k < seg; k++) fine.push(catmull(p0, p1, p2, p3, k / seg));
  }
  return respace(fine, step);
}

// walk a closed polyline and re-emit it at even `step` spacing. Worth doing
// after ANY pass that moves samples around: nudging points off furniture and
// relaxing kinks both bunch samples up, and a 0.7cm segment next to a 6cm one
// is what makes the ribbon look badly stitched.
function respace(pts, step) {
  if (pts.length < 3) return pts.slice();
  var first = { x: pts[0].x, z: pts[0].z };
  if (typeof pts[0].y === "number") first.y = pts[0].y;
  var out = [first],
    acc = 0;
  for (var j = 1; j <= pts.length; j++) {
    var a = pts[j - 1],
      b = pts[j % pts.length];
    var d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 1e-6) continue;
    acc += d;
    while (acc >= step) {
      var back = (acc - step) / d;
      var q = { x: b.x - (b.x - a.x) * back, z: b.z - (b.z - a.z) * back };
      if (typeof a.y === "number" || typeof b.y === "number") {
        var ay = typeof a.y === "number" ? a.y : FLOOR_Y,
          by = typeof b.y === "number" ? b.y : FLOOR_Y;
        q.y = ay + (by - ay) * (1 - back);
      }
      out.push(q);
      acc -= step;
    }
  }
  // drop the tail sample if it landed on top of the first one
  if (
    out.length > 3 &&
    Math.hypot(out[out.length - 1].x - out[0].x, out[out.length - 1].z - out[0].z) <
      step * 0.5
  )
    out.pop();
  return out;
}

// A 26cm-wide road cannot fold back on itself. The room tour plus clearLine's
// sideways nudges used to leave 150° turns inside 5cm of centreline: at that
// angle the two segment rectangles fold over each other, so the ribbon looks
// torn and — worse — the outside of the fold has no surface under it at all,
// which is the hole a kart drops through to end up under the road.
// Pull every over-tight vertex toward the midpoint of its neighbours, hardest
// where the kink is worst, and never into furniture.
var MAX_TURN = 0.3, // rad per sample ≈ a 20cm turn radius at SAMP spacing
  HARD_KINK = 0.8; // ≈46°/sample — a fold, straighten it even through furniture
var COVER_DY = 2.5; // height gap below which a neighbouring lane replaces a wall
function relaxKinks(pts, occ, rounds, allowHard) {
  var n = pts.length,
    worst = 0;
  for (var r = 0; r < rounds; r++) {
    worst = 0;
    for (var i = 0; i < n; i++) {
      var a = pts[(i - 1 + n) % n],
        b = pts[i],
        c = pts[(i + 1) % n];
      // the jump's gap is a deliberate discontinuity, not a kink to iron out
      if (a.gap || b.gap || c.gap) continue;
      var ux = b.x - a.x,
        uz = b.z - a.z,
        ul = Math.hypot(ux, uz) || 1;
      var vx = c.x - b.x,
        vz = c.z - b.z,
        vl = Math.hypot(vx, vz) || 1;
      ux /= ul;
      uz /= ul;
      vx /= vl;
      vz /= vl;
      var ang = Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz));
      if (ang <= MAX_TURN) continue;
      if (ang > worst) worst = ang;
      var k = Math.min(0.85, ((ang - MAX_TURN) / Math.PI) * 2.2);
      var nx = b.x + ((a.x + c.x) / 2 - b.x) * k,
        nz = b.z + ((a.z + c.z) / 2 - b.z) * k;
      // Normally the line has to stay clear of furniture — but a fold this
      // sharp is worse than clipping the corner of a wardrobe, and where the
      // route is boxed in (a doorway, a gap between units) refusing to move is
      // what leaves the kink in. Past HARD_KINK, straighten it anyway.
      // NOT in home mode (allowHard false): there the truck drives the real
      // floor, so straightening a doorway corner through its jamb turns a sharp
      // but driveable turn into a wall the lap runs head-first into.
      if (occ && !occ.free(nx, nz) && (ang < HARD_KINK || allowHard === false))
        continue;
      b.x = nx;
      b.z = nz;
    }
    if (!worst) break;
  }
  return worst;
}

// The room tour walks into a dead-end room and back out, which as a driving
// line is a 180° reversal on the spot: on a 30cm road a kart simply cannot turn
// round, so it grinds the rails until it wrecks. Replace each reversal with a
// cul-de-sac bulb — exactly what a real dead-end street does — so the line
// always curves round at a radius a kart can actually hold.
var BULB_R = 46;
function roundTurnarounds(anchors) {
  var N = anchors.length;
  if (N < 4) return anchors;
  var out = [];
  for (var i = 0; i < N; i++) {
    var a = anchors[(i - 1 + N) % N],
      b = anchors[i],
      c = anchors[(i + 1) % N];
    var ux = b.x - a.x,
      uz = b.z - a.z,
      ul = Math.hypot(ux, uz) || 1;
    var vx = c.x - b.x,
      vz = c.z - b.z,
      vl = Math.hypot(vx, vz) || 1;
    ux /= ul;
    uz /= ul;
    vx /= vl;
    vz /= vl;
    if (ux * vx + uz * vz > -0.55 || ul < 30 || vl < 30) {
      out.push(b);
      continue;
    }
    var nx = -uz,
      nz = ux; // left of travel
    var r = Math.min(BULB_R, ul * 0.5, vl * 0.5);
    var extra = typeof b.y === "number" ? { y: b.y } : {};
    out.push(Object.assign({ x: b.x + nx * r - ux * r * 0.25, z: b.z + nz * r - uz * r * 0.25 }, extra));
    out.push(Object.assign({ x: b.x + ux * r, z: b.z + uz * r }, extra));
    out.push(Object.assign({ x: b.x - nx * r - ux * r * 0.25, z: b.z - nz * r - uz * r * 0.25 }, extra));
  }
  return out;
}

function tangent(pts, i) {
  var n = pts.length;
  var a = pts[(i - 1 + n) % n],
    b = pts[(i + 1) % n];
  var dx = b.x - a.x,
    dz = b.z - a.z,
    l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}

// ---- turn radius ------------------------------------------------------------
// relaxKinks pulls ONE over-tight vertex toward the midpoint of its neighbours.
// That converges on a wobble but not on a corner: at a real hairpin the
// neighbours are kinked too, so each round shaves a couple of degrees off an
// angle that needs sixty, and the pass gives up on its round limit with the fold
// still in. Measured on a generated flat: 32° inside one 6cm sample (an 8.9cm
// radius under a 26cm-wide road) and 114° of turn inside 30cm of centreline.
// That is what "impossible turns" means — no truck holds it, the AI cannot aim
// through it, and the deck quads fold over each other on the inside of the bend.
//
// Spread every correction over a WINDOW instead: move the offending sample AND
// its neighbours toward a binomially-weighted average of the run through them.
// That is a low-pass filter whose cut-off is the corner radius, so it converges
// on curvature rather than on sample noise, and a stubborn corner OPENS instead
// of getting sharper as its neighbours are pulled in around it.
var MIN_R = 34, // radius (cm) the classic road must be able to hold anywhere
  MIN_R_HOME = 22, // home mode drives real floors: a doorway turns tighter
  CURVE_ROUNDS = 120,
  HOME_ROUNDS = 40,
  CLIP_KINK = 1.6; // × the local limit: past this a corner may clip furniture
var WT = [1, 4, 6, 4, 1]; // window weights, ±2 samples
function angleAt(a, b, c) {
  var ux = b.x - a.x,
    uz = b.z - a.z,
    ul = Math.hypot(ux, uz) || 1;
  var vx = c.x - b.x,
    vz = c.z - b.z,
    vl = Math.hypot(vx, vz) || 1;
  ux /= ul;
  uz /= ul;
  vx /= vl;
  vz /= vl;
  return Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz));
}
// Did a move take the line THROUGH a wall? Only home mode cares: there the truck
// drives the real floor, so a sample that drifts into the next room forces the
// repair pass to route the whole lap back out through the doorway, splicing in
// an out-and-back spike whose tip is a 180° fold against that very wall.
// The classic road is a ROAD — it flies over walls and ghosts what it passes
// through — and applying this to it pinned every sample that sits on a wall line
// so the curvature pass could not converge at all (33.8° folds left on a real
// generated flat, against 10° on a synthetic one with fewer walls).
function crossesWall(occ, x0, z0, x1, z1) {
  if (!HOME_ACTIVE) return false;
  var segs = (occ && occ.segs) || [];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i],
      rx = x1 - x0,
      rz = z1 - z0,
      qx = s.bx - s.ax,
      qz = s.bz - s.az;
    var den = rx * qz - rz * qx;
    if (!den) continue;
    var t = ((s.ax - x0) * qz - (s.az - z0) * qx) / den,
      u = ((s.ax - x0) * rz - (s.az - z0) * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}
// Slide each sample ALONG the line toward the middle of its two neighbours. The
// motion is tangential, so the path barely moves — only the spacing does. This
// is what keeps the curvature pass from eating itself: opening a corner drags
// samples together, and once three of them are 2mm apart the angle between them
// is noise that no amount of smoothing can fix (and a 34° turn between two 2mm
// segments still folds two full-width deck quads over each other).
var SPACE_K = 0.45;
function evenSpacing(pts, occ) {
  var n = pts.length;
  for (var i = 0; i < n; i++) {
    var a = pts[(i - 1 + n) % n],
      b = pts[i],
      c = pts[(i + 1) % n];
    if (a.gap || b.gap || c.gap) continue;
    var la = Math.hypot(b.x - a.x, b.z - a.z),
      lc = Math.hypot(c.x - b.x, c.z - b.z);
    if (la < 1e-6 && lc < 1e-6) continue;
    var tx = c.x - a.x,
      tz = c.z - a.z,
      tl = Math.hypot(tx, tz);
    if (tl < 1e-6) continue;
    var d = ((lc - la) / 2) * SPACE_K;
    var nx = b.x + (tx / tl) * d,
      nz = b.z + (tz / tl) * d;
    if (occ && crossesWall(occ, b.x, b.z, nx, nz)) continue;
    b.x = nx;
    b.z = nz;
  }
}
function limitCurvature(pts, occ, minR, rounds, allowHard) {
  var n = pts.length;
  if (n < 8) return 0;
  var worst = 0;
  for (var r = 0; r < rounds; r++) {
    worst = 0;
    var moved = 0;
    for (var i = 0; i < n; i++) {
      var a = pts[(i - 1 + n) % n],
        b = pts[i],
        c = pts[(i + 1) % n];
      // the jump's gap is a deliberate discontinuity, not a corner to open out
      if (a.gap || b.gap || c.gap) continue;
      var ang = angleAt(a, b, c);
      // the turn THIS spacing is allowed at the wanted radius (arc = r·θ)
      var seg =
        (Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z)) / 2;
      var lim = Math.min(MAX_TURN, seg / minR);
      if (ang <= lim) continue;
      if (ang > worst) worst = ang;
      var k = clamp((ang - lim) / ang, 0, 1) * 0.55;
      for (var w = -2; w <= 2; w++) {
        var j = (i + w + n) % n,
          p = pts[j];
        if (p.gap) continue;
        var tx = 0,
          tz = 0,
          sum = 0,
          bad = false;
        for (var u = -2; u <= 2; u++) {
          var q = pts[(j + u + n) % n];
          if (q.gap) {
            bad = true;
            break;
          }
          tx += q.x * WT[u + 2];
          tz += q.z * WT[u + 2];
          sum += WT[u + 2];
        }
        if (bad || !sum) continue;
        var kk = k * (w === 0 ? 1 : Math.abs(w) === 1 ? 0.6 : 0.3);
        var nx = p.x + (tx / sum - p.x) * kk,
          nz = p.z + (tz / sum - p.z) * kk;
        // Same rule relaxKinks follows — keep off furniture, except past a fold
        // so sharp that clipping a wardrobe corner is the lesser evil. Home mode
        // never takes that licence: there the truck drives the real floor, and
        // straightening a doorway corner through its jamb turns a tight but
        // driveable turn into a wall the lap runs head-first into.
        // ...but only a sample that is CURRENTLY CLEAR has anything to protect.
        // The grid is blocked for a road width around every wall and unit, so a
        // line that runs down a corridor is mostly "blocked" already; refusing
        // to move those left half of each smoothing window pinned and the other
        // half free, which sharpened the very corners this pass exists to open.
        // The licence threshold is CLIP_KINK × the local limit, not the fixed
        // HARD_KINK relaxKinks uses. HARD_KINK is 46° per sample — a fold — and
        // on a real furnished flat the pass stalled well under it: every corner
        // in the 10–34° band sat between clear samples whose smoothed targets
        // landed in a sofa, so nothing moved and the finished circuit still had
        // fifty corners tighter than a 20cm radius. A road that ghosts what it
        // passes through can afford to clip; a corner no truck can hold cannot.
        if (occ && crossesWall(occ, p.x, p.z, nx, nz)) continue;
        if (
          occ &&
          !occ.free(nx, nz) &&
          occ.free(p.x, p.z) &&
          (ang < lim * CLIP_KINK || allowHard === false)
        )
          continue;
        p.x = nx;
        p.z = nz;
        moved++;
      }
    }
    if (!worst || !moved) break;
    evenSpacing(pts, occ);
  }
  return worst;
}

// ---- hairpins ---------------------------------------------------------------
// roundTurnarounds fixes the reversals it can SEE — the ones written into the
// anchor list. It cannot see the ones created later: A* routes into a dead-end
// room and back out of it, string-pulling collapses the bulb it was given, and a
// spliced repair detour arrives as an out-and-back spike. Those survive as 180°
// folds on the finished line — the line comes back along itself within 6cm — and
// no truck drives that, it just grinds round in circles at the end of the
// branch. Find them on the dense line, where they actually exist, and rebuild
// the tip as a cul-de-sac bulb wide enough to drive round.
var HAIRPIN = 2.2, // rad of turn across the window that counts as a reversal
  HAIRPIN_WIN = 4, // samples either side of the tip that form the U
  HAIRPIN_MIN = 11, // smallest turnaround worth opening (cm)
  HAIRPIN_MAX = 14; // tips opened per line — a branchy flat has one per room

// ---- two lanes --------------------------------------------------------------
// The room tour drives into a branch and back out along the SAME line, so on a
// tree-shaped flat (a corridor with rooms off it — most of them) every metre of
// the lap is laid on top of itself: 69% of one generated circuit had a second
// pass within a road width at the same height. That is the "overlapping roads"
// complaint, and it is also what forces the builder to delete kerbs and rails
// between the two passes and to lift one a hair above the other so they stop
// z-fighting. Every one of those is a symptom of the same thing.
//
// Real roads answer this with two lanes. Shift each pass to the RIGHT of travel
// wherever an ANTIPARALLEL pass runs alongside: both passes move, so they
// separate by twice the offset and the out-and-back becomes a dual carriageway
// with a real U-turn at the far end. Same-direction overlaps are left alone —
// they would both shift the same way and stay stacked.
// Do it on the ANCHORS, not on the finished line. Shoving a dense polyline
// sideways fights every other pass — respace redistributes it, clearLine pushes
// back, the curvature limiter averages the offset away — and leaves a 173° fold
// where the offset has to reverse. But the tour VISITS THE SAME ANCHOR TWICE:
// the doorway and the room centre appear once on the way in and once on the way
// out. Offset each occurrence to the right of ITS OWN travel and the two
// visits move to opposite sides of the corridor, a road width apart, and the
// Catmull-Rom through them draws two smooth lanes joined by the cul-de-sac bulb
// roundTurnarounds already puts at the tip of the branch.
var LANE_GAP = 4, // clear air left between the two lanes
  LANE_OFF = 1.6, // ...how far each pass moves over, in road half-widths
  LANE_MIN = 0.45, // ...and how far a lane may be narrowed to make the pair fit
  LANE_SAME = 14; // anchors closer than this are the same place, visited twice

// ---- spiral siting ----------------------------------------------------------
// Finding a clear circle means thousands of clearance probes, and rc.js's
// collision query walks every furniture box in the flat. Rasterise the
// low-height blockers into a coarse grid once instead — the search then costs
// 16 array lookups per candidate.
var CELL = 12;

// ---- routing on the occupancy grid ------------------------------------------
// Classic mode does not need this: its road flies over whatever is in the way
// and fades out anything it passes through. Home mode has no such licence — the
// truck drives the actual floor, so the LINE has to be a line a truck can drive:
// through the doorway, round the sofa, never through a wall. A* between
// consecutive anchors on the same grid the rest of the builder uses, then
// string-pulled back to as few corners as the room allows.
var CLEAR_CAP = 4; // cells of clearance worth preferring (48cm)

// Nudge the driving line off anything a kart would hit at floor level. The
// anchors (room centres, doorways) are picked clear, but a smooth curve between
// two clear points happily runs through the wardrobe in between — and unlike
// the old free-roaming waypoints, a ROAD commits the whole field to that line.
// Deciding sample by sample is what made this pass a kink factory: each blocked
// sample took the FIRST offset that cleared, trying left before right, so two
// neighbours 6cm apart routinely detoured around the same wardrobe on OPPOSITE
// sides — a zigzag with 50°+ folds in it, which no amount of relaxing then irons
// out. Measured on a generated flat, this pass alone took the worst turn on the
// line from 26° to 54°.
// A driver goes round an obstacle ONCE: find the whole run of blocked samples,
// pick a single side and a single distance that clears all of it, and ease the
// whole detour in and out with a cosine window. One bulge, no zigzag.
var DETOUR_MAX = 52, // furthest a detour will shove the line sideways
  DETOUR_SLOPE = 1.6; // ...over this many cm of road per cm of shove

export var ROAD_W = W;

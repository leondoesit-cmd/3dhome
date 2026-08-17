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
  STEP_UP = 2.2, // rc.js STEP_H: the ledge a truck climbs without a ramp
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
// Is THIS build a home-mode one? Read by the collision/mesh builders, which
// otherwise cannot tell an isolated ramp from one link of a continuous circuit.
var HOME_ACTIVE = false;
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
  this.n = 0;
}
Strip.prototype.quad = function (a, b, c, d, col) {
  var p = this.pos,
    k = this.n;
  p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  if (col)
    for (var i = 0; i < 4; i++) this.col.push(col[0], col[1], col[2]);
  this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
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

// The 2D line is respaced after every pass that moves samples. The ASSEMBLED
// one never was — respace() rebuilds plain {x,y,z} and would drop the `gap`
// flags that carve the jump — so relaxing and curvature-limiting it left clumps
// behind: measured on a generated flat, 5% of the finished circuit was spaced
// under 1.6cm, and the tightest clump ran four samples 0.22cm apart where a fold
// the pass could not open had collapsed to a point instead. Every one of that
// track's worst turns sat inside a clump, and a 34° turn between two 2mm
// segments folds two full-width deck quads over each other — the torn, lipped
// ribbon this pipeline exists to avoid.
// So: the same walk, carrying the flags. `gap` comes from the segment a sample
// is emitted on, so the jump stays a run of gap samples rather than a hole that
// heals itself, and `at` records where each sample came from so an index into
// the old line can be followed to the new one.
function respaceKeep(pts, step) {
  if (pts.length < 3) return pts.slice();
  var first = { x: pts[0].x, z: pts[0].z, y: pts[0].y, gap: !!pts[0].gap, at: 0 };
  var out = [first],
    acc = 0;
  for (var j = 1; j <= pts.length; j++) {
    var a = pts[j - 1],
      b = pts[j % pts.length];
    var d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < 1e-6) continue;
    acc += d;
    while (acc >= step) {
      var back = (acc - step) / d,
        f = 1 - back;
      out.push({
        x: b.x - (b.x - a.x) * back,
        z: b.z - (b.z - a.z) * back,
        y: a.y + (b.y - a.y) * f,
        // a sample sits ON this segment, so it is part of the jump only if the
        // segment it lies on is — taking either end would grow or shrink the gap
        gap: !!(a.gap && b.gap),
        at: j - 1,
      });
      acc -= step;
    }
  }
  while (
    out.length > 8 &&
    Math.hypot(out[out.length - 1].x - out[0].x, out[out.length - 1].z - out[0].z) <
      step * 0.5
  )
    out.pop();
  return out;
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
function signedTurn(pts, i) {
  var n = pts.length,
    a = pts[(i - 1 + n) % n],
    b = pts[i],
    c = pts[(i + 1) % n];
  var d = Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Don't splice a fitted arc in — SPREAD THE TWO LEGS APART. A dead end is a
// U-turn whose radius is half the distance between the leg that arrives and the
// leg that leaves, so the fix is to push those apart until that half-distance is
// a radius a truck can hold, easing the push out along both legs. The tip then
// rounds itself in the curvature pass, and because nothing is inserted or
// removed every other index into the line still means what it did.
// (A fitted arc was tried first and is a trap: its exit has no reason to line up
// with where the return leg actually runs, so each bulb bought its own radius by
// folding the line somewhere else — 8 splices, worst turn still 180 degrees.)
function spreadHairpins(pts, occ, minR) {
  var n = pts.length,
    fixed = 0,
    // Which tips have had their turn. Marked by INDEX, not by position: this
    // pass moves the samples it works on, so a tip recorded by where it used to
    // be is never recognised again and the same U gets opened over and over
    // until it is 60cm wide.
    handled = new Uint8Array(n);
  if (n < HAIRPIN_WIN * 6) return 0;
  for (var attempt = 0; attempt < HAIRPIN_MAX; attempt++) {
    var at = -1,
      worst = HAIRPIN;
    for (var i = 0; i < n; i++) {
      if (handled[i]) continue;
      var sum = 0;
      for (var k = -HAIRPIN_WIN; k <= HAIRPIN_WIN; k++)
        sum += signedTurn(pts, (i + k + n) % n);
      if (Math.abs(sum) <= worst) continue;
      worst = Math.abs(sum);
      at = i;
    }
    if (at < 0) break;
    function mark(r) {
      for (var m = -r; m <= r; m++) handled[(at + m + n) % n] = 1;
    }
    mark(HAIRPIN_WIN * 2);
    // the axis of the U: the tip, seen from back down the leg that arrives
    var back = pts[(at - HAIRPIN_WIN * 2 + n) % n],
      fwd = pts[(at + HAIRPIN_WIN * 2) % n];
    var ux = pts[at].x - back.x,
      uz = pts[at].z - back.z,
      ul = Math.hypot(ux, uz);
    if (ul < 1) continue;
    ux /= ul;
    uz /= ul;
    var nx = -uz,
      nz = ux;
    // how far apart the legs already are, measured clear of the tip itself
    var sep = (fwd.x - back.x) * nx + (fwd.z - back.z) * nz,
      side = sep >= 0 ? 1 : -1;
    for (var r = minR; r >= HAIRPIN_MIN; r *= 0.75) {
      var push = r - Math.abs(sep) / 2;
      if (push <= 0.5) break; // already wide enough to be driven round
      // spread over enough road that opening the U does not itself kink it
      var fade = Math.max(HAIRPIN_WIN, Math.ceil((r * 2.4) / SAMP)),
        off = [],
        worse = 0,
        ok = true;
      for (var k2 = -fade; k2 <= fade; k2++) {
        var w = 0.5 * (1 + Math.cos((Math.PI * k2) / (fade + 1))) * push,
          sg = (k2 >= 0 ? 1 : -1) * side,
          j = (at + k2 + n) % n;
        off.push({ i: j, x: nx * w * sg, z: nz * w * sg });
        var tx = pts[j].x + nx * w * sg,
          tz = pts[j].z + nz * w * sg;
        if (!occ) continue;
        if (crossesWall(occ, pts[j].x, pts[j].z, tx, tz)) ok = false;
        else if (!occ.free(tx, tz) && occ.free(pts[j].x, pts[j].z)) worse++;
      }
      // COUNT the samples this would put somewhere worse, never veto on the
      // first one. The offset fades out over a couple of dozen samples, so under
      // an all-or-nothing rule a single sample at the far tail of the fade —
      // usually one already brushing the wall the dead end is against — rejected
      // every radius on offer and the 180° tip stayed exactly as it was.
      if (!ok || worse > Math.max(2, Math.round(off.length * 0.12))) continue;
      off.forEach(function (o) {
        pts[o.i].x += o.x;
        pts[o.i].z += o.z;
      });
      mark(fade);
      fixed++;
      break;
    }
  }
  return fixed;
}

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
function dualLanes(anchors, half) {
  var N = anchors.length;
  if (N < 6) return anchors;
  var off = half * LANE_OFF;
  var out = anchors.map(function (a) {
    return Object.assign({}, a);
  });
  for (var i = 0; i < N; i++) {
    var twice = false;
    for (var j = 0; j < N && !twice; j++)
      if (
        j !== i &&
        Math.hypot(anchors[j].x - anchors[i].x, anchors[j].z - anchors[i].z) <
          LANE_SAME
      )
        twice = true;
    if (!twice) continue;
    // travel direction THROUGH this anchor, from the unshifted neighbours
    var p = anchors[(i - 1 + N) % N],
      q = anchors[(i + 1) % N];
    var dx = q.x - p.x,
      dz = q.z - p.z,
      l = Math.hypot(dx, dz);
    if (l < 1) continue;
    out[i].x += (dz / l) * off;
    out[i].z += (-dx / l) * off;
    out[i].lane = true;
  }
  return out;
}

// Where two passes still share a corridor, narrow BOTH decks so the pair fits
// between the walls instead of one being drawn over the other. Run on the
// assembled 3D line, so the test is "another pass at my height", not "another
// pass anywhere" — a flyover crossing 1m up is not sharing my tarmac.
function laneWidths(C, half) {
  var n = C.length,
    reach = half * 2 + LANE_GAP,
    want = new Float64Array(n);
  for (var a = 0; a < n; a++) {
    want[a] = half;
    if (C[a].w) {
      want[a] = C[a].w; // an explicit width (a home-mode ramp) wins
      continue;
    }
    var near = 1e9;
    for (var b = 0; b < n; b++) {
      if (Math.min(Math.abs(a - b), n - Math.abs(a - b)) < 14) continue;
      if (Math.abs((C[b].y || 0) - (C[a].y || 0)) > COVER_DY) continue;
      var dx = C[b].x - C[a].x,
        dz = C[b].z - C[a].z,
        d2 = dx * dx + dz * dz;
      if (d2 < near) near = d2;
    }
    near = Math.sqrt(near);
    if (near > reach) continue;
    // Exactly as narrow as the pair needs and no narrower: both decks plus
    // their kerbs have to fit inside the distance between the two lanes.
    want[a] = clamp(near / 2 - KERB_W, half * LANE_MIN, half);
  }
  // taper rather than step — a width that changes in one sample is a lip
  for (var s = 0; s < 4; s++) {
    var prev = Float64Array.from(want);
    for (var i = 0; i < n; i++)
      want[i] = Math.min(
        want[i],
        (prev[(i - 1 + n) % n] + prev[i] * 2 + prev[(i + 1) % n]) / 4,
      );
  }
  var count = 0;
  for (var k = 0; k < n; k++)
    if (want[k] < half - 0.05) {
      C[k].w = want[k];
      count++;
    }
  return count;
}

// ---- spiral siting ----------------------------------------------------------
// Finding a clear circle means thousands of clearance probes, and rc.js's
// collision query walks every furniture box in the flat. Rasterise the
// low-height blockers into a coarse grid once instead — the search then costs
// 16 array lookups per candidate.
var CELL = 12;
// `skip` holds the items home mode intends to DRIVE ON: they must not push the
// line away, or the route politely goes round the bed it is supposed to climb.
// A rejected item is handed back through block() and the line is cleared again.
function occupancy(env, x0, z0, x1, z1, high, skip, rooms) {
  var pad = HALF + 8;
  var gx0 = x0 - pad,
    gz0 = z0 - pad;
  var w = Math.ceil((x1 - x0 + pad * 2) / CELL),
    h = Math.ceil((z1 - z0 + pad * 2) / CELL);
  var g = new Uint8Array(Math.max(1, w * h));
  function mark(ax, az, bx, bz) {
    var i0 = clamp(Math.floor((ax - gx0) / CELL), 0, w - 1),
      i1 = clamp(Math.ceil((bx - gx0) / CELL), 0, w - 1),
      j0 = clamp(Math.floor((az - gz0) / CELL), 0, h - 1),
      j1 = clamp(Math.ceil((bz - gz0) / CELL), 0, h - 1);
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) g[j * w + i] = 1;
  }
  var clearance = null;
  function markRect(r) {
    mark(r.x0 - HALF, r.z0 - HALF, r.x1 + HALF, r.z1 + HALF);
    clearance = null;
  }
  (env.rects() || []).forEach(function (r) {
    if (skip && skip.indexOf(r) >= 0) return;
    // The SAME 2D line is driven twice — once on the floor and once on the
    // elevated deck — so it has to be clear at both heights. Checking only the
    // floor put gates inside wall cabinets and tall shelves a metre up, where
    // the collision resolver ejected trucks clean off the deck.
    var low = r.y0 < 7 && r.y1 > 2.5,
      highBlocked = r.y0 < (high || 0) + 7 && r.y1 > (high || 0) + 2.5;
    if (!low && !highBlocked) return;
    markRect(r);
  });
  (env.segs() || []).forEach(function (s) {
    var n = Math.max(1, Math.ceil(Math.hypot(s.bx - s.ax, s.bz - s.az) / (CELL * 0.5)));
    for (var k = 0; k <= n; k++) {
      var x = s.ax + ((s.bx - s.ax) * k) / n,
        z = s.az + ((s.bz - s.az) * k) / n,
        e = s.half + HALF;
      mark(x - e, z - e, x + e, z + e);
    }
  });
  // The garden is not part of the circuit. A router that only knows about walls
  // is delighted to find that the shortest way from the bedroom to the kitchen
  // goes out of the front door and round the outside of the flat, so mark
  // everything that is not floor as blocked — dilated by a few cells, because a
  // doorway's own centre lies inside the wall band and belongs to no room.
  if (rooms && rooms.length) {
    var insideCells = new Uint8Array(w * h);
    for (var cj = 0; cj < h; cj++)
      for (var ci = 0; ci < w; ci++) {
        var px = gx0 + (ci + 0.5) * CELL,
          pz = gz0 + (cj + 0.5) * CELL;
        for (var ri = 0; ri < rooms.length; ri++)
          if (pointInPoly(px, pz, rooms[ri].pts)) {
            insideCells[cj * w + ci] = 1;
            break;
          }
      }
    var grown = new Uint8Array(insideCells);
    for (var pass = 0; pass < 3; pass++) {
      var prev = new Uint8Array(grown);
      for (var dj = 0; dj < h; dj++)
        for (var di = 0; di < w; di++) {
          if (prev[dj * w + di]) continue;
          if (
            (di > 0 && prev[dj * w + di - 1]) ||
            (di < w - 1 && prev[dj * w + di + 1]) ||
            (dj > 0 && prev[(dj - 1) * w + di]) ||
            (dj < h - 1 && prev[(dj + 1) * w + di])
          )
            grown[dj * w + di] = 1;
        }
    }
    for (var gk = 0; gk < g.length; gk++) if (!grown[gk]) g[gk] = 1;
  }
  return {
    free: function (x, z) {
      var i = Math.floor((x - gx0) / CELL),
        j = Math.floor((z - gz0) / CELL);
      if (i < 0 || j < 0 || i >= w || j >= h) return false;
      return !g[j * w + i];
    },
    block: markRect,
    segs: env.segs() || [],
    grid: g,
    w: w,
    h: h,
    x0: gx0,
    z0: gz0,
    dirty: function () {
      clearance = null; // a newly blocked item invalidates the clearance field
    },
    // Cells to the nearest blocked one, capped — used to keep a route in the
    // middle of a doorway rather than scraping its jamb.
    room: function (i, j) {
      if (!clearance) {
        clearance = new Uint8Array(w * h);
        var queue = [],
          k;
        for (k = 0; k < g.length; k++)
          if (g[k]) {
            clearance[k] = 0;
            queue.push(k);
          } else clearance[k] = 255;
        for (var qi = 0; qi < queue.length; qi++) {
          var c = queue[qi],
            ci = c % w,
            cj = (c - ci) / w,
            nd = clearance[c] + 1;
          if (nd > CLEAR_CAP) continue;
          for (var d = 0; d < 4; d++) {
            var ni = ci + (d === 0 ? 1 : d === 1 ? -1 : 0),
              nj = cj + (d === 2 ? 1 : d === 3 ? -1 : 0);
            if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
            var nk = nj * w + ni;
            if (clearance[nk] <= nd) continue;
            clearance[nk] = nd;
            queue.push(nk);
          }
        }
      }
      return clearance[j * w + i];
    },
  };
}

// ---- routing on the occupancy grid ------------------------------------------
// Classic mode does not need this: its road flies over whatever is in the way
// and fades out anything it passes through. Home mode has no such licence — the
// truck drives the actual floor, so the LINE has to be a line a truck can drive:
// through the doorway, round the sofa, never through a wall. A* between
// consecutive anchors on the same grid the rest of the builder uses, then
// string-pulled back to as few corners as the room allows.
var CLEAR_CAP = 4; // cells of clearance worth preferring (48cm)

function nearestFreeCell(occ, i, j) {
  if (i >= 0 && j >= 0 && i < occ.w && j < occ.h && !occ.grid[j * occ.w + i]) return [i, j];
  for (var r = 1; r < 24; r++)
    for (var dj = -r; dj <= r; dj++)
      for (var di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        var ni = i + di,
          nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= occ.w || nj >= occ.h) continue;
        if (!occ.grid[nj * occ.w + ni]) return [ni, nj];
      }
  return null;
}

function snapFree(p, occ) {
  var c = nearestFreeCell(
    occ,
    Math.floor((p.x - occ.x0) / CELL),
    Math.floor((p.z - occ.z0) / CELL),
  );
  if (!c) return false;
  p.x = occ.x0 + (c[0] + 0.5) * CELL;
  p.z = occ.z0 + (c[1] + 0.5) * CELL;
  return true;
}

function astar(occ, ax, az, bx, bz) {
  var w = occ.w,
    h = occ.h,
    N = w * h;
  var s = nearestFreeCell(occ, Math.floor((ax - occ.x0) / CELL), Math.floor((az - occ.z0) / CELL)),
    e = nearestFreeCell(occ, Math.floor((bx - occ.x0) / CELL), Math.floor((bz - occ.z0) / CELL));
  if (!s || !e) return null;
  var si = s[1] * w + s[0],
    ei = e[1] * w + e[0];
  if (si === ei) return [];
  var g = new Float32Array(N).fill(Infinity),
    from = new Int32Array(N).fill(-1),
    done = new Uint8Array(N),
    open = [si];
  g[si] = 0;
  function hCost(k) {
    var i = k % w,
      j = (k - i) / w;
    return Math.hypot(i - e[0], j - e[1]);
  }
  var fs = new Float32Array(N);
  fs[si] = hCost(si);
  while (open.length) {
    // small maps, small frontiers: a linear scan beats a heap's bookkeeping
    var bi = 0;
    for (var q = 1; q < open.length; q++) if (fs[open[q]] < fs[open[bi]]) bi = q;
    var cur = open.splice(bi, 1)[0];
    if (cur === ei) break;
    done[cur] = 1;
    var ci = cur % w,
      cj = (cur - ci) / w;
    for (var d = 0; d < 8; d++) {
      var di = d < 4 ? [1, -1, 0, 0][d] : [1, 1, -1, -1][d - 4],
        dj = d < 4 ? [0, 0, 1, -1][d] : [1, -1, 1, -1][d - 4];
      var ni = ci + di,
        nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      var nk = nj * w + ni;
      if (occ.grid[nk] || done[nk]) continue;
      // corners: never cut across the diagonal between two blocked cells
      if (di && dj && (occ.grid[cj * w + ni] || occ.grid[nj * w + ci])) continue;
      var step = di && dj ? 1.4142 : 1;
      // hug the middle of the room, not the skirting board
      step += (CLEAR_CAP - Math.min(CLEAR_CAP, occ.room(ni, nj))) * 0.7;
      var ng = g[cur] + step;
      if (ng >= g[nk]) continue;
      g[nk] = ng;
      from[nk] = cur;
      fs[nk] = ng + hCost(nk);
      if (open.indexOf(nk) < 0) open.push(nk);
    }
  }
  if (from[ei] < 0 && si !== ei) return null;
  var out = [],
    k = ei;
  while (k >= 0 && k !== si) {
    var i2 = k % w,
      j2 = (k - i2) / w;
    out.push({ x: occ.x0 + (i2 + 0.5) * CELL, z: occ.z0 + (j2 + 0.5) * CELL });
    k = from[k];
  }
  out.reverse();
  return out;
}

// Drop every waypoint the previous one can already see: an 8-connected grid path
// is a staircase, and a staircase makes a track full of 45° kinks no ramp can
// sit on.
function stringPull(pts, occ) {
  if (pts.length < 3) return pts;
  var out = [pts[0]],
    i = 0;
  while (i < pts.length - 1) {
    var j = pts.length - 1;
    for (; j > i + 1; j--)
      if (pathFree(occ, pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// Distance from a point to a segment — which leg of the tour passes closest to
// the bed.
function distToSeg(p, a, b) {
  var dx = b.x - a.x,
    dz = b.z - a.z,
    l2 = dx * dx + dz * dz;
  var t = l2 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

// Make the furniture part of the ROUTE, not an afterthought. The tour's own
// anchors are room centres and doorways with everything cleared out from under
// them, so a line drawn through them sails politely past the bed. Adding the bed
// as an anchor means the router paths INTO it and out the far side — one long
// straight run over the top, which is exactly what an access ramp needs at each
// end. (Bending a finished line at the bed instead gives a curve that arrives
// across a corner, and no ramp fits on a corner.)
function seedRideAnchors(loop, plats, tops) {
  var out = loop.map(function (a) {
      var o = { x: a.x, z: a.z };
      if (a.ride) o.ride = a.ride;
      if (typeof a.y === "number") o.y = a.y;
      return o;
    }),
    added = [];
  // an item the user has already told the route to climb is not a candidate for
  // a second, automatic detour onto the same thing
  var claimed = [];
  out.forEach(function (a) {
    if (a.ride && typeof a.ride === "object") claimed.push(a.ride);
  });
  // A waypoint that already stands on a model IS that visit. Snap it to the
  // driveable top and do not invent a second detour that loops around the lip
  // (which is what turned tabletops into flyovers).
  out.forEach(function (a) {
    if (a.ride) return;
    var hit = null;
    for (var i = 0; i < plats.length; i++) {
      var r = plats[i];
      if (claimed.indexOf(r) >= 0) continue;
      if (a.x < r.x0 || a.x > r.x1 || a.z < r.z0 || a.z > r.z1) continue;
      if (!hit || (r.x1 - r.x0) * (r.z1 - r.z0) < (hit.x1 - hit.x0) * (hit.z1 - hit.z0))
        hit = r;
    }
    if (!hit) return;
    var snap = rideTarget(hit, tops);
    if (!snap) return;
    a.x = snap.x;
    a.z = snap.z;
    a.ride = hit;
    claimed.push(hit);
    added.push(a);
  });
  var left = plats
    .filter(function (r) {
      return claimed.indexOf(r) < 0;
    })
    .map(function (r) {
      var t = rideTarget(r, tops);
      if (t) t.rect = r;
      return t;
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return b.y - a.y; // the bed / table before the footstool
    });
  // Greedy insertion: each remaining model lands on the loop leg it is
  // closest to, so the tour walks the apartment and climbs what it passes
  // rather than teleporting between the four tallest things. No radius cap —
  // a sofa in the far bedroom is exactly the kind of model the lap is for.
  while (left.length && added.length < ATTRACT_MAX) {
    var bi = -1,
      bj = -1,
      bd = ATTRACT_R;
    for (var t = 0; t < left.length; t++) {
      for (var i = 0; i < out.length; i++) {
        var d = distToSeg(left[t], out[i], out[(i + 1) % out.length]);
        if (d < bd) {
          bd = d;
          bi = i;
          bj = t;
        }
      }
    }
    if (bj < 0) break;
    var hit = left[bj];
    var anchor = { x: hit.x, z: hit.z, ride: hit.rect };
    out.splice(bi + 1, 0, anchor);
    added.push(anchor);
    left.splice(bj, 1);
  }
  return { pts: out, added: added.length };
}

export function seedHomeTour(loop, plats, tops) {
  return seedRideAnchors(loop, plats, tops).pts;
}

// The tour's anchors, joined by routes a truck can actually drive.
function gridRoute(anchors, occ) {
  var out = [],
    routed = 0;
  for (var i = 0; i < anchors.length; i++) {
    var a = anchors[i],
      b = anchors[(i + 1) % anchors.length];
    out.push(a);
    if (pathFree(occ, a.x, a.z, b.x, b.z)) continue; // already a clear run
    var path = astar(occ, a.x, a.z, b.x, b.z);
    if (!path || !path.length) continue; // no way through: keep the straight leg
    stringPull(path, occ).forEach(function (p, k, all) {
      if (k < all.length - 1) out.push(p); // the last one IS the next anchor
    });
    routed++;
  }
  return { pts: out, routed: routed };
}

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
function pushRun(pts, occ, from, len, tans) {
  var n = pts.length;
  // The ease-in HAS TO scale with the shove. A fixed five-sample fade turns a
  // 52cm detour into a 30cm-long ramp across the lane — a 180° fold, worse than
  // the obstacle it avoids. Spread it over ~1.6cm of road per cm of offset.
  function fadeFor(d) {
    return Math.max(3, Math.ceil((d * DETOUR_SLOPE) / SAMP));
  }
  var pad = fadeFor(DETOUR_MAX); // scored window: the same samples for every candidate
  function offAt(d, fade, k) {
    // k counts from the first faded sample of the widest window
    var rel = k - pad;
    if (rel >= 0 && rel < len) return d;
    var t = rel < 0 ? (rel + fade + 1) / (fade + 1) : (fade + len - rel) / (fade + 1);
    return d * 0.5 * (1 - Math.cos(Math.PI * clamp(t, 0, 1)));
  }
  // Score every candidate rather than demanding a perfect one. In a furnished
  // flat the grid is blocked for a road width around every wall and every unit,
  // so "all of it clears" is often true nowhere — and an all-or-nothing test
  // then does NOTHING, which is how the line ends up laid through the wardrobe
  // it was supposed to go round.
  var span = len + pad * 2;
  function cost(d, sg) {
    var fade = fadeFor(d),
      bad = 0;
    for (var k = 0; k < span; k++) {
      var i = (from - pad + k + n * 2) % n,
        t = tans[i],
        w = offAt(d, fade, k) * sg,
        x = pts[i].x - t.z * w,
        z = pts[i].z + t.x * w;
      // A detour that steps THROUGH a wall lands the line in the next room —
      // the same trap pushOffRect fell into. Rule it out, don't merely score it.
      if (crossesWall(occ, pts[i].x, pts[i].z, x, z)) return 1e9;
      if (!occ.free(x, z)) bad++;
    }
    return bad + d * 0.02; // ...nearest side and shortest shove first
  }
  var bestD = 0,
    bestSg = 1,
    best = cost(0, 1);
  if (best < 1) return 0;
  for (var d = 7; d <= DETOUR_MAX; d += 7)
    for (var sg = 1; sg >= -1; sg -= 2) {
      var c = cost(d, sg);
      if (c >= best) continue;
      best = c;
      bestD = d;
      bestSg = sg;
    }
  if (!bestD) return 0;
  var bestFade = fadeFor(bestD);
  for (var m = 0; m < span; m++) {
    var j = (from - pad + m + n * 2) % n,
      tj = tans[j],
      wj = offAt(bestD, bestFade, m) * bestSg;
    pts[j].x -= tj.z * wj;
    pts[j].z += tj.x * wj;
  }
  return 1;
}
function clearLine(pts, occ) {
  var n = pts.length,
    moved = 0;
  for (var pass = 0; pass < 3; pass++) {
    moved = 0;
    var blocked = new Uint8Array(n),
      any = 0,
      clear = -1;
    for (var i = 0; i < n; i++)
      if (occ.free(pts[i].x, pts[i].z)) {
        if (clear < 0) clear = i;
      } else {
        blocked[i] = 1;
        any++;
      }
    // nothing to fix, or nothing clear to lean the detour against
    if (!any || clear < 0) break;
    // Normals are taken from the line BEFORE anything moves: a run that shifts
    // its own neighbours would otherwise spiral away from the route.
    var tans = [];
    for (var t = 0; t < n; t++) tans.push(tangent(pts, t));
    var at = 0;
    while (at < n) {
      var k0 = (clear + at) % n;
      if (!blocked[k0]) {
        at++;
        continue;
      }
      var len = 0;
      while (len < n && blocked[(clear + at + len) % n]) len++;
      moved += pushRun(pts, occ, k0, len, tans);
      at += len;
    }
    if (!moved) break;
  }
  return moved;
}

// Guarantee vertical clearance where a crowded plan leaves no sideways route.
// clearLine() remains the first choice because driving around furniture looks
// natural. If samples are still inside a sofa/cabinet, the entire loop becomes
// one level flyover. A uniform deck cannot create a ramp lip where the circuit
// crosses itself, and turns an impossible road-through-object into a coherent,
// continuous fallback track.
function liftOverFurniture(C, env, half) {
  var rects = (env && env.rects && env.rects()) || [];
  if (!rects.length || C.length < 3) return 0;
  var BODY = 3.2,
    STEP = 2.2,
    MARGIN = 1.8,
    M = C.length;
  function near(box, p) {
    var cx = clamp(p.x, box.x0, box.x1),
      cz = clamp(p.z, box.z0, box.z1);
    return Math.hypot(p.x - cx, p.z - cz) <= half + MARGIN;
  }
  // Only invoke the fallback when the shaped route truly remains blocked.
  var blocked = false;
  for (var i = 0; i < M && !blocked; i++) {
    var p = C[i];
    if (p.gap) continue;
    for (var r = 0; r < rects.length; r++) {
      var box = rects[r];
      if (near(box, p) && box.y0 < p.y + BODY && box.y1 > p.y + STEP) {
        blocked = true;
        break;
      }
    }
  }
  if (!blocked) return 0;

  // A local hump can cross another pass of the same closed road and create a
  // new ledge. For an actually impossible layout, use one level, fully guarded
  // flyover instead: deterministic, continuous, and impossible for furniture
  // to intersect. Climb height until every vertical band above this route is
  // clear (including stacked/floating cabinets).
  var safeY = FLOOR_Y;
  for (var c = 0; c < M; c++) if (!C[c].gap) safeY = Math.max(safeY, C[c].y);
  for (var pass = 0; pass < rects.length + 1; pass++) {
    var nextY = safeY;
    for (var b = 0; b < rects.length; b++) {
      var rb = rects[b], relevant = false;
      for (var q = 0; q < M; q++)
        if (!C[q].gap && near(rb, C[q])) {
          relevant = true;
          break;
        }
      // The fallback is also a visual guarantee: its slab must sit above the
      // object, not merely within STEP_H of the top where physics could climb.
      if (relevant && rb.y0 < safeY + BODY && rb.y1 + MARGIN > safeY + 0.01)
        nextY = Math.max(nextY, rb.y1 + MARGIN);
    }
    if (nextY <= safeY + 0.01) break;
    safeY = nextY;
  }
  var raised = 0;
  for (var k = 0; k < M; k++) {
    if (C[k].gap || C[k].y >= safeY - 0.01) continue;
    C[k].y = safeY;
    raised++;
  }
  return raised;
}

// ---- home mode planning -----------------------------------------------------
// The surface the world already offers at (x,z): the floor, or a rug/threshold
// low enough that STEP_H drives straight onto it.
function groundUnder(env, x, z) {
  return env && env.groundAt ? env.groundAt(x, z, 2.6, 2.2) : 0;
}

function insideRect(r, x, z, inset) {
  return (
    x >= r.x0 + inset && x <= r.x1 - inset && z >= r.z0 + inset && z <= r.z1 - inset
  );
}

// The surface a truck could actually STAND on at (x,z): the highest part top no
// higher than a ramp can reach, and far enough inside that part's own footprint
// to be driven along. Read from the per-mesh boxes, never the merged item box —
// a sofa merges to the top of its backrest, and the thing you drive along is the
// seat 40cm below it.
function topUnder(tops, x, z) {
  var best = 0;
  for (var i = 0; i < tops.length; i++) {
    var t = tops[i];
    if (t.y1 > RIDE_MAX || t.y1 < RIDE_MIN || t.y1 <= best) continue;
    // a part you can drive ALONG, not the lid of a small box
    if (Math.min(t.x1 - t.x0, t.z1 - t.z0) < RIDE_FOOT) continue;
    if (!insideRect(t, x, z, RIDE_INSET)) continue;
    best = t.y1;
  }
  return best;
}

// Is the corridor over that surface clear? The backrest of the sofa, the lamp on
// the sideboard and the pillow on the bed all live in the same item box as the
// bit worth driving on.
function blockedAbove(tops, x, z, y) {
  for (var i = 0; i < tops.length; i++) {
    var t = tops[i];
    if (t.y1 <= y + STEP_UP || t.y0 >= y + CAR_BAND) continue;
    if (x < t.x0 - RIDE_HALF || x > t.x1 + RIDE_HALF) continue;
    if (z < t.z0 - RIDE_HALF || z > t.z1 + RIDE_HALF) continue;
    return true;
  }
  return false;
}

// The biggest driveable part of an item, and where its middle is: what the route
// aims at when it detours onto the furniture. For a sofa that is the seat, for a
// bed the mattress, for a table the top.
function rideTarget(r, tops) {
  var best = null,
    bestA = RIDE_FOOT * RIDE_FOOT * 0.5;
  for (var i = 0; i < tops.length; i++) {
    var t = tops[i];
    // A tabletop is its own mesh sitting 70cm up — requiring y0 on the floor
    // is what skipped every counter, desk and coffee table and left the tour
    // driving around the thing you came to drive on.
    if (t.y1 < RIDE_MIN || t.y1 > RIDE_MAX) continue;
    // it has to belong to this item's footprint, and be worth aiming at
    if (t.x0 < r.x0 - 2 || t.x1 > r.x1 + 2 || t.z0 < r.z0 - 2 || t.z1 > r.z1 + 2) continue;
    var w = t.x1 - t.x0,
      d = t.z1 - t.z0;
    if (Math.min(w, d) < RIDE_FOOT || w * d <= bestA) continue;
    bestA = w * d;
    best = { x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, y: t.y1 };
  }
  return best;
}

// Furniture the route is ALLOWED to climb onto: a part big enough to drive
// along, reachable by a ramp from the floor (or a bridge from another top).
// Standing on the floor is NOT required — a floating shelf or a tabletop mesh
// that does not include the legs is still a model you came to drive on.
function rideable(r, tops) {
  return Math.min(r.x1 - r.x0, r.z1 - r.z0) >= RIDE_FOOT && !!rideTarget(r, tops);
}

// The track editor offers "drive over this one" as a click on an item's top
// face, and it must offer it for exactly the items the builder can actually
// ramp onto — so it asks the builder rather than keeping its own copy of the
// rule (which would drift the first time RIDE_MAX moved).
export function canRide(r, tops) {
  return rideable(r, tops || []);
}
export function rideSpot(r, tops) {
  return rideTarget(r, tops || []);
}

// A hand-placed ride anchor arrives flagged `ride: true` — it knows it wants to
// be ON something, but not which rect that is (the editor and the builder hold
// different snapshots). Bind it to the plat it stands on and aim it at that
// item's driveable part, so from here on it is indistinguishable from one the
// router seeded itself: the re-route pass can drop it with the item when the
// ramp turns out not to fit.
function attachRides(anchors, plats, tops) {
  return anchors.map(function (a) {
    if (a.ride !== true) return a;
    var hit = null;
    for (var i = 0; i < plats.length; i++) {
      var r = plats[i];
      if (a.x < r.x0 || a.x > r.x1 || a.z < r.z0 || a.z > r.z1) continue;
      if (!hit || (r.x1 - r.x0) * (r.z1 - r.z0) < (hit.x1 - hit.x0) * (hit.z1 - hit.z0)) hit = r;
    }
    if (!hit) return { x: a.x, z: a.z }; // not climbable any more: an ordinary point
    var t = rideTarget(hit, tops);
    return { x: t ? t.x : a.x, z: t ? t.z : a.z, ride: hit };
  });
}

// What stands at (x,z) that a truck cannot simply climb — the highest top, and
// whether this exact point sits safely INSIDE one item's top face (so the route
// can be laid on it) rather than clipping its edge or two items at once.
function obstacleAt(rects, tops, x, z) {
  var top = 0,
    hits = 0,
    rect = null;
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (r.y1 <= LEDGE) continue; // a rug: drive over it, it is not an obstacle
    if (x < r.x0 - TRUCK_PAD || x > r.x1 + TRUCK_PAD) continue;
    if (z < r.z0 - TRUCK_PAD || z > r.z1 + TRUCK_PAD) continue;
    hits++;
    if (r.y1 > top) {
      top = r.y1;
      rect = r;
    }
  }
  if (!hits) return null;
  // Can the truck be driven ALONG here? It needs a part to stand on and nothing
  // sticking up through the corridor over it — which is what rules out a chair
  // tucked under the table, or the arm of the sofa. Anything BELOW that surface
  // (the light fitting whose box sits on the floor under the bed) is irrelevant:
  // you are driving over it, not into it.
  var ride = topUnder(tops, x, z);
  if (ride && blockedAbove(tops, x, z, ride)) ride = 0;
  return { top: top, rect: rect, ride: ride };
}

// Is there room for a ramp deck at (x,z) sitting `h` off the floor, ignoring the
// item the ramp is being built against? Height matters: a ramp already 30cm up
// passes clean over the rug bar and the light fitting at the foot of the bed,
// and rejecting those cost the mode most of its ramps.
function clearAt(rects, x, z, h, skip) {
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    if (r === skip || r.y1 <= LEDGE) continue;
    if (x < r.x0 - TRUCK_PAD || x > r.x1 + TRUCK_PAD) continue;
    if (z < r.z0 - TRUCK_PAD || z > r.z1 + TRUCK_PAD) continue;
    if (r.y1 <= h + STEP_UP) continue; // the deck is over it
    if (r.y0 >= h + CAR_BAND) continue; // ...or under it
    return false;
  }
  return true;
}

// clearLine only searches 52cm sideways, which is not enough to get out of a
// wardrobe the line entered end-on — and in home mode there is no elevated deck
// to fly over it with. Shove every sample inside the item straight out of its
// footprint in one move; clearLine and relaxKinks then smooth the detour.
function pushOffRect(pts, rect, occ) {
  var n = pts.length,
    moved = 0;
  for (var i = 0; i < n; i++) {
    var p = pts[i];
    if (p.x < rect.x0 - HALF || p.x > rect.x1 + HALF) continue;
    if (p.z < rect.z0 - HALF || p.z > rect.z1 + HALF) continue;
    var t = tangent(pts, i),
      nx = -t.z,
      nz = t.x,
      done = false;
    for (var d = 8; d <= 240 && !done; d += 8)
      for (var sg = 1; sg >= -1 && !done; sg -= 2) {
        var x = p.x + nx * d * sg,
          z = p.z + nz * d * sg;
        // The WAY there has to be clear as well, not just the destination: a
        // two-metre sideways shove that only checks where it lands happily puts
        // the sample in the next room, and the lap then drives through a wall.
        if (!pathFree(occ, p.x, p.z, x, z)) continue;
        p.x = x;
        p.z = z;
        moved++;
        done = true;
      }
  }
  return moved;
}

// clearLine's smoothing rounds every corner, and a corner rounded at a doorway
// cuts through the jamb — which classic mode never noticed, because its deck
// flies through walls and fades them out. Home mode drives the actual floor, so
// prise the two ends of any segment that crosses something apart until it
// doesn't. A few rounds converge: each nudge is small and local.
// The grid is 12cm, so a step can clip the corner of a doorjamb between two
// probes and still read as free. Walls are the one thing that must never be
// approximated in home mode — test them exactly.
function wallClear(occ, x0, z0, x1, z1, margin) {
  var segs = occ.segs || [];
  if (!segs.length) return true;
  var steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3));
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i],
      dx = s.bx - s.ax,
      dz = s.bz - s.az,
      l2 = dx * dx + dz * dz || 1,
      r = s.half + (margin == null ? TRUCK_PAD : margin);
    for (var k = 0; k <= steps; k++) {
      var u = k / steps,
        px = x0 + (x1 - x0) * u,
        pz = z0 + (z1 - z0) * u;
      var t = clamp(((px - s.ax) * dx + (pz - s.az) * dz) / l2, 0, 1);
      if (Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t)) < r) return false;
    }
  }
  return true;
}

function repairPath(pts, occ) {
  var n = pts.length,
    out = [],
    fixed = 0;
  for (var i = 0; i < n; i++) {
    var a = pts[i],
      b = pts[(i + 1) % n];
    out.push(a);
    if (pathFree(occ, a.x, a.z, b.x, b.z) && wallClear(occ, a.x, a.z, b.x, b.z)) continue;
    // Route the offending step properly instead of shoving its ends apart: a
    // nudge big enough to clear a doorjamb drags the whole lap out of shape,
    // and the thing that knows the way round is the same A* that laid the line.
    var path = astar(occ, a.x, a.z, b.x, b.z);
    if (!path || !path.length) {
      // both ends sit in the same grid cell, so there is no route to lay: what
      // is wrong is the samples themselves, clipping the jamb they pass between.
      // Put them back in a cell a truck can actually be in.
      snapFree(a, occ);
      snapFree(b, occ);
      continue;
    }
    stringPull(path, occ).forEach(function (p, k, all) {
      if (k < all.length - 1) out.push({ x: p.x, z: p.z });
    });
    fixed++;
  }
  return { pts: out, fixed: fixed };
}

// Is the straight line between two points clear on the occupancy grid? Stepped
// at half a cell so nothing thinner than a wall can slip between the probes.
function pathFree(occ, x0, z0, x1, z1) {
  var steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.5)));
  for (var k = 0; k <= steps; k++) {
    var u = k / steps;
    if (!occ.free(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u)) return false;
  }
  return true;
}

// Group the samples the line cannot drive as-is into runs, each of which becomes
// one feature: a RIDE (the item's own top is the surface, so only the approach
// ramps are built) or a BRIDGE (a deck floating just over something too tall or
// too small to ride).
function homeRuns(pts, rects, tops) {
  var n = pts.length,
    hits = new Array(n),
    i;
  for (i = 0; i < n; i++) hits[i] = obstacleAt(rects, tops, pts[i].x, pts[i].z);
  var start = -1;
  for (i = 0; i < n; i++)
    if (!hits[i]) {
      start = i;
      break;
    }
  if (start < 0) return []; // the whole loop is blocked — nothing local to fix
  var runs = [],
    cur = null;
  for (var k = 0; k < n; k++) {
    var j = (start + k) % n,
      h = hits[j];
    if (!h) {
      if (cur) runs.push(cur);
      cur = null;
      continue;
    }
    if (cur && h.rect === cur.rect) {
      cur.e = start + k;
      cur.ride.push(h.ride);
      cur.top = Math.max(cur.top, h.top);
    } else {
      if (cur) runs.push(cur);
      cur = { s: start + k, e: start + k, rect: h.rect, top: h.top, ride: [h.ride] };
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

// Turn one run into a driveable feature, or report that it cannot be built here.
// The ramps are the expensive part: they need floor that is clear and a line
// that barely bends — a 40% grade laid round a corner folds over itself, which
// is the one thing that reliably drops a truck through the deck.
function planFeature(run, pts, rects, used, tops) {
  var n = pts.length,
    at = function (i) {
      return ((i % n) + n) % n;
    };
  var nRun = run.e - run.s + 1,
    runLen = nRun * SAMP;
  // The lip samples are where the ramp meets the item, so they often sit just
  // off the inset top. Requiring every inner sample to be on the surface is
  // what turned a tabletop tour into a flyover the moment the line clipped a
  // corner — drive ON a rideable model whenever the line spends a real stretch
  // through it.
  var lo = 1e9,
    hi = -1e9,
    rideHits = 0,
    k;
  for (k = 0; k < nRun; k++) {
    if (run.ride[k]) {
      rideHits++;
      lo = Math.min(lo, run.ride[k]);
      hi = Math.max(hi, run.ride[k]);
    }
  }
  var tgt = tops && run.rect ? rideTarget(run.rect, tops) : null;
  var innerRide =
    rideHits * SAMP >= RIDE_RUN && hi - lo <= 2.5 && rideHits >= nRun * 0.3;
  var ride = runLen >= RIDE_RUN && (!!tgt || innerRide);
  var top = ride ? (tgt ? tgt.y : hi) : run.top + BRIDGE_CLEAR;
  if (!ride && run.top > BRIDGE_MAX) return null; // go around it instead
  var edge = ride ? EDGE_N : 0;
  // Does a ramp of `rampN` samples fit, climbing to `top` from sample `foot`
  // towards `head`? The bend limit is weighted by how steep the ramp is THERE:
  // both ends ease out to level, and a corner on a level bit of plank is not a
  // fold. Insisting on straight the whole way rejected every ramp in a real
  // flat and the mode built nothing at all.
  function rampFits(foot, head, rampN) {
    var dir = head > foot ? 1 : -1;
    for (var k = 0; k <= rampN; k++) {
      var i = at(foot + dir * k),
        u = k / rampN,
        h = top * u * u * (3 - 2 * u),
        steep = 6 * u * (1 - u); // 0 at the ends, 1.5 through the middle
      if (used[i]) return false; // another feature owns it
      if (!clearAt(rects, pts[i].x, pts[i].z, h, run.rect)) return false;
      if (steep > 0.35 && turnAt(pts, i) > RAMP_TURN) return false;
    }
    return true;
  }
  // A gentle ramp is the nicer ramp, but a bedroom rarely has 130cm of clear
  // floor in front of the bed. Steepen until it fits rather than give up: a
  // short steep one is a kicker, which for a toy truck is a feature.
  for (var grade = RAMP_GRADE; grade <= RAMP_STEEP + 1e-6; grade += 0.15) {
    var rampN = clamp(Math.ceil(top / (grade * SAMP)), 4, 42),
      i,
      inOk = rampFits(run.s - rampN, run.s, rampN),
      outOk = rampFits(run.e + rampN, run.e, rampN);
    // The ENTRY ramp is not optional: you can always drive off something, but
    // without a way up the surface is simply a wall the lap runs into.
    if (!inOk) continue;
    for (i = run.s; i <= run.e; i++) if (used[at(i)]) return null;
    // One ramp is still a feature: drive up onto the coffee table and off the
    // far end. Only where the drop is small enough to land on, though — a truck
    // that falls off a dining table every lap arrives at the flag in pieces.
    if (!outOk && (top > RIDE_DROP || !ride)) continue;
    return {
      s: run.s,
      e: run.e,
      a0: inOk ? run.s - rampN : run.s,
      b1: outOk ? run.e + rampN : run.e,
      inRamp: inOk,
      outRamp: outOk,
      edge: edge,
      y: top,
      ride: ride,
      rect: run.rect,
      rampN: rampN,
    };
  }
  return null;
}

// Write a planned feature into the elevation profile. Ramp samples get a deck
// (nothing in the room holds them up); the middle of a ride does not, because
// the item's own top face is the road there.
function applyFeature(f, pts, prof, deck, hold, wide, used, env) {
  var n = pts.length,
    at = function (i) {
      return ((i % n) + n) % n;
    };
  function ramp(from, to) {
    // from = floor end, to = top end. The foot height is read ONCE: sampling it
    // per step would step the ramp wherever a rug ends under it.
    var steps = Math.abs(to - from) || 1,
      foot = pts[at(from)],
      g0 = groundUnder(env, foot.x, foot.z) + 0.25;
    for (var k = 0; k <= steps; k++) {
      var i = at(from + (to > from ? k : -k)),
        u = k / steps,
        ease = u * u * (3 - 2 * u);
      prof[i] = g0 + (f.y - g0) * ease;
      deck[i] = 1;
      hold[i] = 1;
      wide[i] = RIDE_HALF;
    }
  }
  if (f.inRamp !== false) ramp(f.a0, f.s + f.edge);
  if (f.outRamp !== false) ramp(f.b1, f.e - f.edge);
  // whatever the ramps did not already cover is the surface itself — and with
  // only one ramp, that runs all the way to the edge you drive off
  var from = f.s + (f.inRamp !== false ? f.edge + 1 : 0),
    to = f.e - (f.outRamp !== false ? f.edge + 1 : 0);
  for (var i = from; i <= to; i++) {
    var j = at(i);
    prof[j] = f.y;
    // A ride is driven ON the item: it needs a surface at the seat's height
    // (the item's own collision box tops out at its backrest) but no road drawn
    // over the thing you climbed up to drive on.
    deck[j] = f.ride ? 0 : 1;
    hold[j] = 1;
    wide[j] = RIDE_HALF;
  }
  for (var u2 = f.a0; u2 <= f.b1; u2++) used[at(u2)] = 1;
}

// Last resort. A crowded flat has stretches where the line cannot climb the
// item, cannot bridge it and cannot get round it — a sofa across the only route
// between two rooms. Leaving the samples there would park a waypoint inside a
// solid object and strand every truck that drives at it, so lay a flat deck
// through it at floor height: the deck owns collision (rc.js), and rc_world
// fades out anything a deck passes through, which is exactly what the full-road
// mode has always done. Rare, visible, and driveable.
function homeThrough(runs, pts, prof, deck, hold, wide, used, env, halfVal) {
  var n = pts.length,
    at = function (i) {
      return ((i % n) + n) % n;
    },
    made = 0;
  runs.forEach(function (run) {
    var any = false;
    // Full road width, and started well before the item: the deck is what makes
    // the sofa passable, so a truck aiming at the gate inside it has to be over
    // the deck BEFORE it reaches the upholstery. A narrow strip that begins at
    // the item's edge just moves the collision to the corner of the sofa, where
    // the bots ground themselves to a standstill lap after lap.
    for (var i = run.s - THROUGH_LEAD; i <= run.e + THROUGH_LEAD; i++) {
      var j = at(i);
      if (used[j]) continue;
      prof[j] = groundUnder(env, pts[j].x, pts[j].z) + 0.25;
      deck[j] = hold[j] = 1;
      wide[j] = halfVal;
      used[j] = 1;
      any = true;
    }
    if (any) made++;
  });
  return made;
}

// Runs of samples whose step still scrapes a wall once the router has done its
// best — a doorway too narrow for the line's turn, or a leg A* could find no way
// round at all.
function wallRuns(pts, occ) {
  var n = pts.length,
    runs = [],
    cur = null;
  for (var i = 0; i < n; i++) {
    var a = pts[i],
      b = pts[(i + 1) % n];
    // Only where a truck genuinely cannot fit, not merely where the line runs
    // close to the skirting: decking every stretch that grazes a wall paved
    // most of a lap that drove perfectly well.
    if (wallClear(occ, a.x, a.z, b.x, b.z, RUB)) {
      if (cur) runs.push(cur);
      cur = null;
      continue;
    }
    if (cur) cur.e = i + 1;
    else cur = { s: i, e: i + 1 };
  }
  if (cur) runs.push(cur);
  return runs;
}

// A jump needs a straight, clear, unused run of floor. Home mode's version is a
// small kicker and a landing ramp with a real hole between them — the one bit of
// "road" that is worth seeing indoors.
function homeJump(pts, prof, deck, hold, wide, used, gapFlag, rects, env) {
  var n = pts.length,
    kickN = 7,
    gapN = 3,
    landN = 7,
    total = kickN + gapN + landN;
  // never across the start/finish line: the grid is laid out on those samples
  for (var s = 12; s < n - total - 6; s++) {
    var ok = true;
    for (var k = 0; k <= total && ok; k++) {
      var j = (s + k) % n,
        p = pts[j];
      if (used[j] || turnAt(pts, j) > RAMP_TURN * 0.8) ok = false;
      else if (!clearAt(rects, p.x, p.z, 0, null)) ok = false;
      else if (groundUnder(env, p.x, p.z) > LEDGE) ok = false;
    }
    if (!ok) continue;
    for (var m = 0; m <= total; m++) {
      var i = (s + m) % n;
      used[i] = 1;
      wide[i] = RIDE_HALF;
      if (m <= kickN) {
        prof[i] = 0.25 + (JUMP_H - 0.25) * (m / kickN);
        deck[i] = hold[i] = 1;
      } else if (m < kickN + gapN) {
        prof[i] = JUMP_H;
        gapFlag[i] = 1;
      } else {
        var u = (m - kickN - gapN) / landN;
        prof[i] = 0.25 + (JUMP_LAND - 0.25) * (1 - u);
        deck[i] = hold[i] = 1;
      }
    }
    return true;
  }
  return false;
}

// Does a candidate helix fit? The check is all-or-nothing on purpose: the kart
// laps the SAME circle at two heights, so one point clipping a wall or a
// wardrobe stops it dead halfway up. A helix that only mostly fits is worse
// than no helix at all — the caller falls back to a straight climb.
function spiralFits(cx, cz, r, rooms, occ) {
  var room = null;
  for (var i = 0; i < rooms.length; i++)
    if (pointInPoly(cx, cz, rooms[i].pts)) room = rooms[i];
  if (!room) return false;
  for (var k = 0; k < 24; k++) {
    var a = (k / 24) * Math.PI * 2;
    var x = cx + Math.sin(a) * r,
      z = cz + Math.cos(a) * r;
    if (!pointInPoly(x, z, room.pts)) return false;
    if (!occ.free(x, z)) return false;
  }
  return true;
}
function pickSpiral(pts, lo, hi, rooms, occ) {
  // widest, roundest helix that fits — settle for a tighter one before giving up
  for (var r = SPIRAL_R; r >= 38; r -= 4) {
    for (var i = lo; i <= hi; i += 2) {
      var t = tangent(pts, i);
      for (var s = -1; s <= 1; s += 2) {
        // centre one radius out to the left (s=1) or right (s=-1) of travel
        var cx = pts[i].x + -t.z * r * s,
          cz = pts[i].z + t.x * r * s;
        if (spiralFits(cx, cz, r, rooms, occ))
          return { i: i, cx: cx, cz: cz, r: r, side: s };
      }
    }
  }
  return null;
}

// Splice detours around anything the line cannot drive through, then iron the
// corners that splicing leaves behind.
function smoothAfterRepair(base, occ) {
  var out = respace(repairPath(base, occ).pts, SAMP);
  relaxKinks(out, occ, 40, false);
  // A* returns cell-to-cell steps and repairPath splices detours in: both leave
  // corners far sharper than anything a truck aims through. Open them to a
  // radius the line can be driven at — gently (MIN_R_HOME), because here the
  // truck is on the real floor and a doorway genuinely does turn tighter than
  // any road. Fewer rounds than the road gets: this runs once per repair, up to
  // four times a build, and with `allowHard` off most of its work is pinned by
  // the jambs anyway — 120 rounds tripled the build for no further gain.
  limitCurvature(out, occ, MIN_R_HOME, HOME_ROUNDS, false);
  out = respace(out, SAMP);
  // FINISH with the repair, never with a smoothing pass: relaxing kinks moves
  // samples, and a sample moved into a doorjamb is the very thing being fixed.
  return respace(repairPath(out, occ).pts, SAMP);
}

// ---- build: home mode -------------------------------------------------------
// The apartment carries the truck. All this has to work out is where it CAN'T:
// every run of the line that meets something a truck cannot climb becomes either
// a ride (up a ramp, along the item's own top, down the other side) or a short
// bridge over it. Anything that can be neither is pushed out of the way and the
// line is cleared again. What is left — most of the lap — gets no geometry at
// all, just paint.
function buildHome(base, env, occ, plats, tops, L, halfVal, extra) {
  var rects = (env && env.rects && env.rects()) || [];
  var feats = { home: true, rides: 0, bridges: 0, jump: false };
  if (extra) {
    feats.routed = extra.routed;
    feats.detours = extra.detours;
  }
  // A spliced-in detour arrives as straight legs meeting at square corners, and
  // an unrelaxed 90° corner is a turn no ramp can be built on: smooth after
  // every repair, not just after the first routing pass.
  base = smoothAfterRepair(base, occ);
  var n = base.length,
    best = null;
  // Up to three attempts: each one drops the items that turned out to be
  // unrideable (no room for a ramp, too sharp a bend) back into the grid and
  // re-routes around them, which is exactly what a driver would do. KEEP THE
  // BEST ONE, don't just take the last: re-routing for a sofa in the living
  // room happily throws away a perfectly good ramp onto the bed next door.
  for (var attempt = 0; attempt < 3; attempt++) {
    var prof = new Float64Array(n),
      deck = new Uint8Array(n),
      hold = new Uint8Array(n),
      wide = new Float64Array(n),
      gapFlag = new Uint8Array(n),
      used = new Uint8Array(n);
    for (var i = 0; i < n; i++) prof[i] = groundUnder(env, base[i].x, base[i].z);
    var features = [],
      runs = homeRuns(base, rects, tops),
      rejected = [],
      leftover = [];
    for (var r = 0; r < runs.length; r++) {
      var f = planFeature(runs[r], base, rects, used, tops);
      if (!f) {
        if (rejected.indexOf(runs[r].rect) < 0) rejected.push(runs[r].rect);
        leftover.push(runs[r]);
        continue;
      }
      applyFeature(f, base, prof, deck, hold, wide, used, env);
      features.push(f);
    }
    // A step that still scrapes a wall after every repair is the same problem as
    // a sofa in the doorway: whatever the reason, a truck has to be able to get
    // past it. Deck it too — the wall fades out, exactly as the full-road mode
    // has always done, and the lap stays driveable.
    var through = homeThrough(
      leftover.concat(wallRuns(base, occ)),
      base,
      prof,
      deck,
      hold,
      wide,
      used,
      env,
      halfVal,
    );
    var rides = 0;
    features.forEach(function (ft) {
      if (ft.ride) rides++;
    });
    // a lap you drive ON the furniture beats one that drives through it
    var score = rides * 4 + (features.length - rides) - through * 1.5;
    if (!best || score > best.score)
      best = {
        score: score,
        base: base.map(function (p) {
          return { x: p.x, z: p.z };
        }),
        prof: prof,
        deck: deck,
        hold: hold,
        wide: wide,
        gapFlag: gapFlag,
        used: used,
        features: features,
        through: through,
      };
    if (!rejected.length || attempt === 2) break;
    rejected.forEach(function (rect) {
      occ.block(rect);
      var at = plats.indexOf(rect);
      if (at >= 0) plats.splice(at, 1);
    });
    // Re-route properly rather than shoving the old line sideways: the router
    // now knows those items are solid, so it takes the way round them the same
    // way it took the way round the wardrobe in the first place. (A local shove
    // is the fallback for a route the grid cannot re-plan.)
    // ...and the anchors that pointed at an item we have just written off go
    // with it, or the router walks straight back onto the thing it cannot climb
    if (extra && extra.anchors)
      extra.anchors = extra.anchors.filter(function (a) {
        return !a.ride || plats.indexOf(a.ride) >= 0;
      });
    var again = extra && extra.anchors ? gridRoute(extra.anchors, occ) : null;
    if (again && again.pts.length >= 3) {
      var re = resampleClosed(again.pts, SAMP);
      if (re.length >= 14) base = re;
    } else
      rejected.forEach(function (rect) {
        pushOffRect(base, rect, occ);
      });
    clearLine(base, occ);
    relaxKinks(base, occ, 30, false);
    base = smoothAfterRepair(base, occ);
    n = base.length;
  }
  base = best.base;
  n = base.length;
  var prof = best.prof,
    deck = best.deck,
    hold = best.hold,
    wide = best.wide,
    gapFlag = best.gapFlag,
    features = best.features;
  feats.through = best.through;
  if (env && env.hasJump !== false)
    feats.jump = homeJump(base, prof, deck, hold, wide, best.used, gapFlag, rects, env);
  features.forEach(function (f) {
    if (f.ride) feats.rides++;
    else feats.bridges++;
  });
  // what the lap actually drives ON, for the editor's stats and the tests
  feats.rideList = features
    .filter(function (f) {
      return f.ride;
    })
    .map(function (f) {
      return {
        y: Math.round(f.y),
        len: Math.round((f.e - f.s + 1) * SAMP),
        ramps: (f.inRamp ? 1 : 0) + (f.outRamp ? 1 : 0),
      };
    });

  var C = base.map(function (p, i) {
    return {
      x: p.x,
      z: p.z,
      y: prof[i],
      gap: !!gapFlag[i],
      deck: !!deck[i],
      hold: !!hold[i],
      w: wide[i] || halfVal,
    };
  });
  var M = C.length;
  for (var f2 = 0; f2 < M; f2++) {
    var a1 = C[(f2 - 1 + M) % M],
      b1 = C[(f2 + 1) % M];
    var dx = b1.x - a1.x,
      dz = b1.z - a1.z,
      l = Math.hypot(dx, dz) || 1;
    C[f2].ux = dx / l;
    C[f2].uz = dz / l;
  }
  repeatLift(C);
  // No banking indoors. A bare sample IS the floor or the top of a table and
  // cannot be rolled at all, and an access ramp is a 22cm plank a metre long —
  // rolling that while it also climbs and bends is how a deck folds over itself.
  for (var b = 0; b < M; b++) {
    C[b].bank = 0;
    if (!C[b].deck) C[b].lift = 0;
  }
  var col = buildCollision(C);
  var high = 0;
  C.forEach(function (p) {
    high = Math.max(high, p.y);
  });
  return {
    center: C,
    len: L,
    high: high,
    feats: feats,
    group: buildMesh(C, env, col),
    col: col,
    wps: buildWps(C),
    pads: homePads(C, features),
  };
}

// A boost strip at the foot of every access ramp: the run-up is what gets a
// small truck up onto a bed, and it makes the ramp read as something to aim at.
function homePads(C, features) {
  var out = [],
    M = C.length;
  (features || []).forEach(function (f) {
    if (f.inRamp === false || (!f.ride && f.y < 12)) return;
    var i = ((f.a0 - 2) % M + M) % M,
      c = C[i];
    if (c && !c.gap) out.push({ x: c.x, y: c.y, z: c.z, ux: c.ux, uz: c.uz });
  });
  return out;
}

// ---- build ------------------------------------------------------------------
// anchors: [{x,z}] closed loop · rooms: detectRooms() output · env: rc.js probes
export function buildRoad(anchors, rooms, env) {
  var W_VAL = (env && env.roadWidth) || W;
  var HALF_VAL = W_VAL / 2;
  HALF_ACTIVE = HALF_VAL;
  var homeMode = !!(env && env.homeMode);
  HOME_ACTIVE = homeMode;
  var manualHeight = anchors.some(function (a) {
    return typeof a.y === "number" && isFinite(a.y);
  });
  // The room tour drives every branch twice. Split those repeats into two lanes
  // before anything else touches the line — a hand-drawn route is left alone.
  var laneAnchors =
    homeMode || manualHeight ? anchors : dualLanes(anchors, (env && env.roadWidth ? env.roadWidth : W) / 2);
  var base = resampleClosed(roundTurnarounds(laneAnchors), SAMP);
  if (base.length < 14) return null;
  var bx0 = 1e9,
    bz0 = 1e9,
    bx1 = -1e9,
    bz1 = -1e9;
  base.forEach(function (p) {
    bx0 = Math.min(bx0, p.x);
    bx1 = Math.max(bx1, p.x);
    bz0 = Math.min(bz0, p.z);
    bz1 = Math.max(bz1, p.z);
  });
  var n = base.length,
    L = n * SAMP;

  // ---- feature plan, scaled to how much lap there is to play with ----
  var manualHigh = FLOOR_Y;
  if (manualHeight)
    anchors.forEach(function (a) {
      if (typeof a.y === "number" && isFinite(a.y)) manualHigh = Math.max(manualHigh, a.y);
    });
  var big = L >= 750,
    mid = L >= 430;
  var HIGH = manualHeight
    ? manualHigh
    : (env && env.highElevation != null) ? env.highElevation : (big ? HIGH_FULL : mid ? 62 : 34);
  // Home mode wants the line ON the coffee table and the bed, so the items it is
  // willing to climb are excluded from the grid that pushes the route away.
  var tops = (env && env.tops && env.tops()) || (env && env.rects && env.rects()) || [];
  var plats =
    homeMode && !manualHeight
      ? ((env && env.rects && env.rects()) || []).filter(function (r) {
          return rideable(r, tops);
        })
      : [];
  // home mode routes AROUND things rather than over them, so the grid has to
  // extend past the straight-line hull the anchors describe
  var pad = homeMode ? ROUTE_PAD : 0;
  var occ = occupancy(
    env,
    bx0 - pad,
    bz0 - pad,
    bx1 + pad,
    bz1 + pad,
    HIGH,
    plats,
    homeMode && !manualHeight ? rooms : null,
  );
  var homeFeats = null;
  if (homeMode && !manualHeight) {
    // A driveable line, not a draped one: A* through the doorways and round the
    // furniture, string-pulled back to long straight runs.
    // NOT two lanes: splitting the tour here was tried and it costs more than
    // the fold it fixes. A* re-merges the legs in the doorway anyway (the
    // shifted anchors move the ends, not the route between them), while the
    // offset ends themselves scrape the jambs — decked pass-throughs went 3 to
    // 6 and corners under a 20cm radius doubled. Dead-end tips are opened on the
    // finished line instead, by spreadHairpins in smoothAfterRepair.
    var seeded = seedRideAnchors(
      roundTurnarounds(attachRides(anchors, plats, tops)),
      plats,
      tops,
    );
    var routed = gridRoute(seeded.pts, occ);
    if (routed.pts.length >= 3) {
      var re = resampleClosed(routed.pts, SAMP);
      if (re.length >= 14) base = re;
    }
    homeFeats = { routed: routed.routed, detours: seeded.added, anchors: seeded.pts };
    n = base.length;
  }
  // clear furniture and relax kinks alternately: pushing a sample sideways off a
  // wardrobe creates a kink, and relaxing a kink can push a sample back into
  // one. Respace at the end so no segment is left bunched against its neighbour.
  for (var cp = 0; cp < 3; cp++) {
    clearLine(base, occ);
    if (!relaxKinks(base, occ, 40, !homeMode)) break;
  }
  base = respace(base, SAMP);
  n = base.length;
  L = n * SAMP;

  if (homeMode && !manualHeight)
    return buildHome(base, env, occ, plats, tops, L, HALF_VAL, homeFeats);

  // Open every corner the truck could not hold. The lanes were separated back
  // at the anchors, which puts a U-turn at the far end of each branch: this is
  // the pass that gives that U a radius.
  if (!manualHeight) {
    if (spreadHairpins(base, occ, MIN_R)) base = respace(base, SAMP);
    limitCurvature(base, occ, MIN_R, CURVE_ROUNDS, true);
    base = respace(base, SAMP);
    n = base.length;
    L = n * SAMP;
  }

  // A user-drawn height profile is the source of truth. Keep the automatic
  // spiral/jump planner out of the way and ease smoothly between anchor
  // heights so the visible 2D lift handles map directly to the driven surface.
  if (manualHeight) {
    var manualC = base.map(function (p) {
      return {
        x: p.x,
        z: p.z,
        y: clamp(typeof p.y === "number" ? p.y : FLOOR_Y, FLOOR_Y, 180),
        gap: false,
      };
    });
    relaxKinks(manualC, occ, 25);
    var manualM = manualC.length;
    for (var mf = 0; mf < manualM; mf++) {
      var ma = manualC[(mf - 1 + manualM) % manualM],
        mb = manualC[(mf + 1) % manualM];
      var mdx = mb.x - ma.x,
        mdz = mb.z - ma.z,
        ml = Math.hypot(mdx, mdz) || 1;
      manualC[mf].ux = mdx / ml;
      manualC[mf].uz = mdz / ml;
    }
    repeatLift(manualC);
    bankLine(manualC);
    var manualCol = buildCollision(manualC);
    return {
      center: manualC,
      len: L,
      high: manualHigh,
      feats: { manualHeight: true },
      group: buildMesh(manualC, env, manualCol),
      col: manualCol,
      wps: buildWps(manualC),
      pads: padSpots(manualC, -1),
    };
  }

  var landN = Math.max(6, Math.round(64 / SAMP)),
    // The editor's jump switch is a safety control, not just decoration. It
    // must remove the physical hole as well as the visible feature.
    gapN = env && env.hasJump === false ? 0 : big ? 5 : mid ? 4 : 0, // 30 / 24 / no gap
    kickN = gapN ? 4 : 0,
    dropN = Math.round(clamp(L * 0.15, 110, 260) / SAMP);
  var landEnd = n - 2,
    landStart = landEnd - landN,
    gapEnd = landStart,
    gapStart = gapEnd - gapN,
    kickEnd = gapStart,
    kickStart = kickEnd - kickN,
    dropEnd = kickStart,
    dropStart = dropEnd - dropN;
  var si = clamp(Math.round(n * 0.42), 10, dropStart - 14); // spiral entry
  var feats = { spiral: false, jump: gapN > 0 };
  if (dropStart <= si + 8) {
    // too little lap for the whole show — climb, cruise, come back down
    feats.jump = false;
    gapN = kickN = 0;
    landN = Math.max(4, Math.round(n * 0.18));
    landEnd = n - 2;
    landStart = gapEnd = gapStart = kickEnd = kickStart = dropEnd = landEnd - landN;
    dropStart = Math.max(si + 6, dropEnd - Math.round(n * 0.2));
    HIGH = Math.min(HIGH, 46);
  }
  var humpN = Math.round(HUMP_W / SAMP);

  var sp = pickSpiral(
    base,
    Math.max(6, Math.round(n * 0.14)),
    Math.max(8, Math.min(dropStart - 12, Math.round(n * 0.72))),
    rooms,
    occ,
  );
  var climbStart = 0,
    climbEnd = 0;
  if (sp) {
    si = sp.i;
    feats.spiral = true;
  } else {
    // no room in the flat for a helix — climb on a long straight ramp instead,
    // and only as high as that run can be made to gain without going vertical
    climbStart = si;
    climbEnd = Math.min(dropStart - 4, si + Math.round(460 / SAMP));
    var run = Math.max(1, (climbEnd - climbStart) * SAMP);
    HIGH = Math.min(HIGH, run * 0.2);
    feats.climbRun = run;
  }

  // The speed hump needs a straight the tour drives ONCE. On a doubled-back
  // stretch its flank stands proud of the flat pass beside it, and on a bend the
  // deck quads of the ramp overlap each other on the inside of the turn — both
  // leave a lip in the lane that every truck hits every lap. Slide it to the
  // nearest window that is clear on both counts, and if there is none, do
  // without: the hump is a garnish, the lip is a bug.
  var humpBad = doubledBack(base);
  for (var hb = 0; hb < n; hb++)
    if (turnAt(base, hb) > HUMP_TURN) humpBad[hb] = 1;
  // A winding flat may have no straight long enough for the full width: fit a
  // shorter, proportionally lower hump on a shorter straight rather than none.
  var humpFull = humpN,
    humpAt = -1;
  for (var hw = humpFull; hw >= Math.round(humpFull * 0.5); hw--) {
    humpAt = clearWindow(humpBad, Math.round(si * 0.55), hw, si);
    if (humpAt >= 0) {
      humpN = hw;
      break;
    }
  }
  var humpH = (HUMP_H * humpN) / humpFull; // same gradient at any width
  feats.hump = humpAt >= 0 ? Math.round(humpN * SAMP) : false;

  function floorY(i) {
    var d = Math.abs(i - humpAt);
    return (
      FLOOR_Y +
      (humpAt >= 0 && d < humpN
        ? humpH * 0.5 * (1 + Math.cos((Math.PI * d) / humpN))
        : 0)
    );
  }
  // elevation of the loop sample i (null = a gap in the road: the jump)
  function heightAt(i) {
    if (i < si) return floorY(i);
    if (!feats.spiral && i < climbEnd)
      return (
        FLOOR_Y +
        (HIGH - FLOOR_Y) * ((i - climbStart) / Math.max(1, climbEnd - climbStart))
      );
    if (i <= dropStart) return HIGH;
    if (i <= dropEnd)
      return HIGH + (KICK_Y - HIGH) * ((i - dropStart) / Math.max(1, dropEnd - dropStart));
    if (i <= kickEnd)
      return KICK_Y + KICK_RISE * ((i - dropEnd) / Math.max(1, kickEnd - dropEnd));
    if (i < gapEnd) return null; // airborne
    if (i <= landEnd) {
      // With no jump, join the descending deck directly to the landing ramp.
      // Starting that ramp at LAND_Y would otherwise create a 13cm cliff at
      // the exact point where the removed gap used to begin.
      var landTop = gapN ? LAND_Y : KICK_Y;
      return (
        FLOOR_Y +
        (landTop - FLOOR_Y) * (1 - (i - gapEnd) / Math.max(1, landEnd - gapEnd))
      );
    }
    return FLOOR_Y;
  }

  // ---- assemble the 3D centreline, splicing the helix in at `si` ----
  var C = [],
    dropAtC = -1; // where the descent starts, in C's own indices
  function push(x, z, y, gap) {
    C.push({ x: x, y: y, z: z, gap: !!gap });
  }
  for (var i = 0; i < n; i++) {
    // the helix adds a hundred-odd samples in the middle of the loop, so a base
    // index means nothing on the assembled line — the boost pads were being laid
    // that many samples short of the jump they belong to
    if (i === dropStart) dropAtC = C.length;
    // the helix's entry sample belongs to the BOTTOM of the climb — heightAt()
    // already reads as elevated from `si` on, which would leave a 1m cliff
    // between the approach road and the first turn
    var h = i === si && feats.spiral ? floorY(i) : heightAt(i);
    push(base[i].x, base[i].z, h == null ? KICK_Y : h, h == null);
    if (i === si && feats.spiral) {
      // helix: one full circle per turn, exiting on the same heading it entered
      var t = tangent(base, i);
      var vx = base[i].x - sp.cx,
        vz = base[i].z - sp.cz;
      var circ = 2 * Math.PI * sp.r;
      var y0 = floorY(i),
        rise = HIGH - y0;
      var turns = Math.max(1, Math.round(rise / (circ * 0.17)));
      var steps = Math.max(24, Math.round((circ * turns) / SPIRAL_STEP));
      var dir = sp.side; // +1 centre on the left → anticlockwise
      for (var k = 1; k <= steps; k++) {
        var a = dir * 2 * Math.PI * turns * (k / steps);
        var ca = Math.cos(a),
          sa = Math.sin(a);
        push(
          sp.cx + vx * ca - vz * sa,
          sp.cz + vx * sa + vz * ca,
          y0 + rise * (k / steps),
        );
      }
      feats.spiralTurns = turns;
      feats.spiralAt = { x: sp.cx, z: sp.cz, r: sp.r, top: HIGH };
    }
  }

  // The 2D pass above never sees the seams where the helix is spliced in, and
  // those are exactly where the sharpest folds were left. Relax the assembled
  // line too: the helix's own steps turn ~10° each, well under MAX_TURN, so the
  // circle itself is untouched and only the joins get straightened.
  relaxKinks(C, occ, 25);
  limitCurvature(C, occ, MIN_R, CURVE_ROUNDS, true);
  // Both of those move samples, and moved samples bunch — worst of all at a
  // corner too boxed in to open, where the pass pulls the tip in until the
  // samples pile up on it. Redistribute, open what is now openable, and END on a
  // redistribution so nothing the last pass bunched is left in the ribbon.
  function reflow() {
    var even = respaceKeep(C, SAMP);
    if (even.length < 14) return;
    if (dropAtC >= 0) {
      var moved = even.findIndex(function (p) {
        return p.at >= dropAtC;
      });
      dropAtC = moved < 0 ? -1 : moved;
    }
    C = even;
  }
  reflow();
  // A turnaround the 2D pass could not open is still here — and now that the
  // samples are evenly spread it shows up as one clean 170° vertex instead of a
  // clump that hid it. Spread its legs apart on the assembled line, where the
  // helix seams are visible too, then open what that made openable.
  spreadHairpins(C, occ, MIN_R);
  limitCurvature(C, occ, MIN_R, CURVE_ROUNDS, true);
  reflow();

  feats.bridged = liftOverFurniture(C, env, HALF_VAL);

  // ---- frames: tangent, lateral, bank ----
  var M = C.length;
  function frames() {
    for (var f = 0; f < M; f++) {
      var a1 = C[(f - 1 + M) % M],
        b1 = C[(f + 1) % M];
      var dx = b1.x - a1.x,
        dz = b1.z - a1.z,
        l = Math.hypot(dx, dz) || 1;
      C[f].ux = dx / l;
      C[f].uz = dz / l;
    }
  }
  frames();
  // narrow both decks wherever a pair still shares a corridor, then re-frame:
  // the width is read by the mesh, the collision prims and the rails alike
  if (!manualHeight) feats.lanes = laneWidths(C, HALF_VAL);
  repeatLift(C);
  bankLine(C);

  var col = buildCollision(C);
  return {
    center: C,
    len: L,
    high: HIGH,
    feats: feats,
    group: buildMesh(C, env, col),
    col: col,
    wps: buildWps(C),
    pads: padSpots(C, dropAtC),
  };
}

// Heading change (rad) at one sample of a closed 2D line.
function turnAt(pts, i) {
  var n = pts.length;
  var a = pts[(i - 1 + n) % n],
    b = pts[i],
    c = pts[(i + 1) % n];
  var d =
    Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// Which samples have another pass of the tour running within a road width? The
// route walks in and out of every room, so long stretches are driven twice, and
// any feature that changes the deck height has to keep off them.
function doubledBack(pts) {
  var M = pts.length,
    out = new Uint8Array(M);
  for (var i = 0; i < M; i++)
    for (var j = 0; j < M; j++) {
      if (Math.min(Math.abs(i - j), M - Math.abs(i - j)) < 14) continue;
      if (Math.abs(pts[j].x - pts[i].x) > HALF + 2) continue;
      if (Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z) > HALF + 2) continue;
      out[i] = 1;
      break;
    }
  return out;
}

// Nearest index to `want` whose ±`r` window is all clear in `flags`, searching
// outward and never past `limit` (the floor section ends there). -1 = nowhere.
function clearWindow(flags, want, r, limit) {
  var n = flags.length;
  function ok(c) {
    if (c - r < 1 || c + r >= limit) return false;
    for (var k = c - r; k <= c + r; k++) if (flags[(k + n) % n]) return false;
    return true;
  }
  for (var d = 0; d < limit; d++) {
    if (ok(want - d)) return want - d;
    if (ok(want + d)) return want + d;
  }
  return -1;
}

// Roll each sample into its corner. THE GAIN MATTERS: `dh / arc` is curvature
// (rad/cm) = 1/radius, so BANK_K is the roll wanted at a 1cm radius — 10 gives
// 0.1rad (6°) on a 1m bend. The original gain was 100× that, which pinned every
// single sample at ±BANK_MAX: the ribbon became a chain of maximally tilted
// plates, each with its edges 3.8cm above and below its own centreline, and the
// sign flipped 44 times a lap. That is what read as "the road is bumpers between
// the sections it is made from" — where two of those plates met or overlapped
// (the room tour drives many stretches twice) the join was a 2–4cm lip, big
// enough for `car.climb` to launch a truck off it.
function bankLine(C) {
  var M = C.length;
  // Curvature over a WINDOW of samples, never one 6cm segment: at that spacing a
  // single segment's turn is mostly resample noise, and noise here is a deck
  // that rolls left and right at random.
  for (var i = 0; i < M; i++) {
    var a = C[(i - CURV_WIN + M) % M],
      b = C[(i + CURV_WIN) % M];
    var dh = Math.atan2(b.ux, b.uz) - Math.atan2(a.ux, a.uz);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    var arc = 0;
    for (var w = -CURV_WIN; w < CURV_WIN; w++) {
      var s0 = C[(i + w + M) % M],
        s1 = C[(i + w + 1 + M) % M];
      arc += Math.hypot(s1.x - s0.x, s1.z - s0.z);
    }
    C[i].bank = clamp((dh / Math.max(arc, 1)) * BANK_K, -BANK_MAX, BANK_MAX);
  }
  for (var s = 0; s < BANK_SMOOTH; s++)
    for (var k = 0; k < M; k++)
      C[k].bank =
        (C[k].bank + C[(k + 1) % M].bank + C[(k - 1 + M) % M].bank) / 3;
  for (var f = 0; f < M; f++) {
    // A floor-level deck has to stay FLAT. It sits 0.7cm above the floor, so any
    // roll at all buries one edge and stands the other proud: 7.9% of the built
    // surface measured below y=0, half-sunk plates poking out of the floorboards.
    // Fade the bank in only once the deck is clear of the floor...
    C[f].bank *= clamp((C[f].y - FLOOR_Y) / BANK_FADE, 0, 1);
    // ...and flatten it where the road crosses or runs along ANOTHER pass of
    // itself at the same height. Two decks rolled opposite ways meet in a lip
    // the width of both rolls; level, they meet flush. Real interchanges flatten
    // at the crossing for the same reason.
    if (C[f].over) C[f].bank = 0;
  }
  // Blur the fades, so switching the roll off at a crossing is a transition
  // rather than a corner...
  for (var s2 = 0; s2 < 3; s2++)
    for (var k2 = 0; k2 < M; k2++)
      C[k2].bank =
        (C[k2].bank + C[(k2 + 1) % M].bank + C[(k2 - 1 + M) % M].bank) / 3;
  // ...and cap how fast the roll can change along the road, so no quad is left
  // twisted enough to put a ridge across the lane.
  for (var t = 0; t < 8; t++)
    for (var j = 0; j < M; j++) {
      var cur = C[j],
        nxt = C[(j + 1) % M];
      var d = nxt.bank - cur.bank;
      if (Math.abs(d) <= BANK_RATE) continue;
      var fix = (d > 0 ? d - BANK_RATE : d + BANK_RATE) / 2;
      nxt.bank -= fix;
      cur.bank += fix;
    }
}

// Where the tour drives the same stretch twice the two decks are coplanar and
// z-fight. Separate them by a hair — deterministic (same track, same look), and
// small enough that the step where a lifted pass crosses a flat one is far below
// anything a truck can feel. Read through edges()/widen(), so the collision
// triangles keep matching the rendered ones exactly.
function repeatLift(C) {
  var M = C.length;
  for (var i = 0; i < M; i++) {
    var p = C[i],
      depth = 0,
      prev = -99;
    for (var j = 0; j < i; j++) {
      var q = C[j];
      // consecutive samples always overlap; a flyover is not a repeat
      if (Math.min(i - j, M - (i - j)) < 14) continue;
      if (Math.abs(q.y - p.y) > 3) continue;
      if (Math.hypot(q.x - p.x, q.z - p.z) > HALF) continue;
      if (j - prev > 1) depth++; // one step per distinct pass, not per sample
      prev = j;
      // `over` is symmetric — the FIRST pass has to know it is overlapped too,
      // because bankLine levels both sides of a crossing, not just the later one.
      // Never break out of this scan early: an unvisited pair is an unmarked
      // sample, and the flag has to see every pass, not just the first few.
      q.over = p.over = true;
    }
    p.lift = Math.min(depth, REPEAT_MAX) * REPEAT_LIFT;
  }
}

// left / right deck edge of sample p, rolled by its bank angle
function edges(p) {
  var lx = -p.uz,
    lz = p.ux,
    h = halfAt(p);
  var dy = Math.sin(p.bank || 0) * h,
    y = p.y + (p.lift || 0);
  return [
    [p.x + lx * h, y + dy, p.z + lz * h],
    [p.x - lx * h, y - dy, p.z - lz * h],
  ];
}
function widen(p, w) {
  var lx = -p.uz,
    lz = p.ux;
  var dy = Math.sin(p.bank || 0) * w,
    y = p.y + (p.lift || 0);
  return [
    [p.x + lx * w, y + dy, p.z + lz * w],
    [p.x - lx * w, y - dy, p.z - lz * w],
  ];
}
function drop(v, d) {
  return [v[0], v[1] - d, v[2]];
}
function lift(v, d) {
  return [v[0], v[1] + d, v[2]];
}

// Is (x,z,y) already covered by a DIFFERENT pass of the road? Used to drop the
// rail between two overlapping passes — a wall down the middle of the road is a
// kart trap. `skip` ignores segments near this one in the centreline: on a tight
// bend a segment's own outer edge falls inside its neighbours a few steps along,
// and suppressing there would leave the outside of every hairpin unwalled.
function coveredAt(prims, x, z, y, skip) {
  for (var j = 0; j < prims.length; j++) {
    var r = prims[j];
    if (Math.abs(r.i - skip) < 16) continue;
    var qx = x - r.ax,
      qz = z - r.az;
    var tt = qx * r.ux + qz * r.uz;
    if (tt < 0 || tt > r.len) continue;
    if (Math.abs(qx * -r.uz + qz * r.ux) > r.half - 1) continue;
    // Only a lane the kart could STEP across counts as covering this edge.
    // At 9cm this suppressed the wall between a flat pass and one climbing the
    // hump beside it — and a kart that wandered over the missing wall fell off
    // the raised one onto the floor. That was the last repeatable way off the
    // road: same corner, every lap, both bots.
    if (Math.abs(r.y0 + ((r.y1 - r.y0) * tt) / r.len - y) < COVER_DY) return true;
  }
  return false;
}

function buildMesh(C, env, colInfo) {
  var M = C.length;
  var grp = new THREE.Group();
  grp.userData.rc = true;
  var deck = new Strip(),
    kerb = new Strip(),
    rail = new Strip(),
    dash = new Strip();
  var RED = [0.85, 0.16, 0.13],
    WHITE = [0.93, 0.93, 0.95],
    RAILA = [0.15, 0.75, 0.95],
    RAILB = [0.98, 0.98, 1.0];
  for (var i = 0; i < M; i++) {
    var p = C[i],
      q = C[(i + 1) % M];
    // the jump: no road across the void — and in home mode, no road at all
    // wherever the apartment itself is the running surface
    if (!decked(p) || !decked(q)) continue;
    var pe = edges(p),
      qe = edges(q);
    deck.quad(pe[0], qe[0], qe[1], pe[1]); // running surface
    var pb0 = drop(pe[0], THICK),
      pb1 = drop(pe[1], THICK),
      qb0 = drop(qe[0], THICK),
      qb1 = drop(qe[1], THICK);
    deck.quad(pb1, qb1, qb0, pb0); // underside
    deck.quad(pe[0], pb0, qb0, qe[0]); // skirts
    deck.quad(qe[1], qb1, pb1, pe[1]);
    // kerbs: alternating red/white blocks along both edges
    var col = (i >> 1) % 2 ? RED : WHITE;
    var po = widen(p, halfAt(p) + KERB_W),
      qo = widen(q, halfAt(q) + KERB_W);
    [0, 1].forEach(function (sd) {
      var a = lift(pe[sd], KERB_H),
        b = lift(qe[sd], KERB_H),
        c = lift(qo[sd], KERB_H * 0.6),
        d = lift(po[sd], KERB_H * 0.6);
      if (sd === 0) kerb.quad(a, b, c, d, col);
      else kerb.quad(d, c, b, a, col);
      kerb.quad(
        sd ? drop(d, KERB_H * 0.6 + THICK) : d,
        sd ? drop(c, KERB_H * 0.6 + THICK) : c,
        sd ? c : drop(c, KERB_H * 0.6 + THICK),
        sd ? d : drop(d, KERB_H * 0.6 + THICK),
        col,
      );
    });
    // centre dashes
    if ((i >> 1) % 3 === 0) {
      var pc = widen(p, 1.1),
        qc = widen(q, 1.1);
      dash.quad(lift(pc[0], 0.15), lift(qc[0], 0.15), lift(qc[1], 0.15), lift(pc[1], 0.15));
    }
    // side walls wherever the deck is off the floor — Rainbow-Road style.
    // This starts at the very bottom of the spiral on purpose: the tightest
    // radius on the circuit is its first turn, and without a wall there a kart
    // that understeers drops straight off and strands itself underneath.
    // Same `coveredAt` gate buildCollision uses: where a second pass of the
    // road runs alongside there is no collision rail, so drawing one there
    // paints a wall the kart drives straight through. Mesh and collision have
    // to agree or the road lies about where you can go.
    if (p.y > RAIL_FROM && q.y > RAIL_FROM) {
      var rc = (i >> 2) % 2 ? RAILA : RAILB;
      [0, 1].forEach(function (sd) {
        var a2 = lift(pe[sd], KERB_H),
          b2 = lift(qe[sd], KERB_H);
        if (
          colInfo &&
          coveredAt(colInfo.road, (a2[0] + b2[0]) / 2, (a2[2] + b2[2]) / 2, (p.y + (p.lift || 0) + q.y + (q.lift || 0)) / 2, i)
        )
          return;
        var a3 = lift(a2, RAIL_H),
          b3 = lift(b2, RAIL_H);
        if (sd === 0) rail.quad(a2, b2, b3, a3, rc);
        else rail.quad(a3, b3, b2, a2, rc);
      });
    }
  }
  var roadCol = 0x3c4149, roadRough = 0.92, roadMetal = 0.04, roadEmiss = 0x000000;
  if (env && env.theme === "wood") {
    roadCol = 0x7c4e29; roadRough = 0.75; roadMetal = 0.02;
  } else if (env && env.theme === "neon") {
    roadCol = 0x0d0926; roadRough = 0.2; roadMetal = 0.8; roadEmiss = 0x3b0a70;
  } else if (env && env.theme === "gold") {
    roadCol = 0xd4af37; roadRough = 0.25; roadMetal = 0.85; roadEmiss = 0x332500;
  }
  var roadMat = new THREE.MeshStandardMaterial({
    color: roadCol,
    roughness: roadRough,
    metalness: roadMetal,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -6,
  });
  if (roadEmiss) roadMat.emissive = new THREE.Color(roadEmiss);
  var road = deck.mesh(roadMat);
  if (road) grp.add(road);
  var km = kerb.mesh(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    }),
  );
  if (km) grp.add(km);
  var rm = rail.mesh(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.2,
      emissive: 0x0a2c38,
      transparent: true,
      // 80% see-through: the rail marks the edge without hiding the road,
      // the next corner or a kart running alongside behind it
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  if (rm) grp.add(rm);
  var dm = dash.mesh(
    new THREE.MeshBasicMaterial({
      color: 0xf0e9d8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -12,
    }),
  );
  if (dm) grp.add(dm);
  var guide = guideMesh(C, env);
  if (guide) grp.add(guide);
  // pillars under the elevated stretches
  var pillarGeo = new THREE.CylinderGeometry(2.6, 3.4, 1, 8);
  var pillarMat = new THREE.MeshStandardMaterial({
    color: 0x6b7280,
    roughness: 0.85,
  });
  var since = 1e9;
  for (var k = 0; k < M; k++) {
    var c = C[k];
    since += SAMP;
    if (!decked(c) || c.y < 18 || since < PILLAR_GAP) continue;
    var g = env ? env.groundAt(c.x, c.z, 0, 2.2) : 0;
    var h = c.y - THICK - g;
    if (h < 8) continue;
    var m = new THREE.Mesh(pillarGeo, pillarMat);
    m.scale.set(1, h, 1);
    m.position.set(c.x, g + h / 2, c.z);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
    since = 0;
  }
  return grp;
}

// The racing line, painted on the world instead of poured as a road. Home mode
// deletes the deck from every stretch the apartment can carry, so this is all
// that is left to show where the lap goes: a dashed line with an arrow every
// half metre, laid on whatever surface is actually under the sample — floor,
// rug or the top of the table the route climbs onto.
function guideMesh(C, env) {
  if (!env || !env.homeMode) return null;
  var M = C.length,
    line = new Strip(),
    AMBER = [1.0, 0.76, 0.2],
    CYAN = [0.35, 0.9, 1.0];
  function surf(p) {
    var g = env.groundAt ? env.groundAt(p.x, p.z, p.y + 1.5, 2.2) : 0;
    return Math.max(g, p.y) + GUIDE_LIFT;
  }
  for (var i = 0; i < M; i++) {
    var p = C[i],
      q = C[(i + 1) % M];
    if (decked(p) || p.gap || q.gap) continue; // the deck is its own signage
    var py = surf(p),
      qy = surf(q);
    // a break in the paint every third pair keeps it reading as a dashed line
    if ((i >> 1) % 3 !== 2) {
      var pl = -p.uz * GUIDE_W,
        pk = p.ux * GUIDE_W,
        ql = -q.uz * GUIDE_W,
        qk = q.ux * GUIDE_W;
      line.quad(
        [p.x + pl, py, p.z + pk],
        [q.x + ql, qy, q.z + qk],
        [q.x - ql, qy, q.z - qk],
        [p.x - pl, py, p.z - pk],
        AMBER,
      );
    }
    // arrowhead: which way round the lap you are meant to be going
    if (i % 12 === 0) {
      var nx = -p.uz,
        nz = p.ux,
        tipx = p.x + p.ux * 4.2,
        tipz = p.z + p.uz * 4.2;
      line.quad(
        [tipx, py, tipz],
        [p.x - p.ux * 1.2 + nx * 2.8, py, p.z - p.uz * 1.2 + nz * 2.8],
        [p.x - p.ux * 1.2 - nx * 2.8, py, p.z - p.uz * 1.2 - nz * 2.8],
        [tipx, py, tipz],
        CYAN,
      );
    }
  }
  var m = line.mesh(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -12,
    }),
  );
  // paint, not geometry: a line that casts a shadow reads as a kerb
  if (m) m.castShadow = m.receiveShadow = false;
  return m;
}

function surfaceTri(a, b, c) {
  return {
    ax: a[0], ay: a[1], az: a[2],
    bx: b[0], by: b[1], bz: b[2],
    cx: c[0], cy: c[1], cz: c[2],
    minx: Math.min(a[0], b[0], c[0]),
    maxx: Math.max(a[0], b[0], c[0]),
    minz: Math.min(a[2], b[2], c[2]),
    maxz: Math.max(a[2], b[2], c[2]),
  };
}

// Keep the broad centreline rectangles for rail-overlap tests, but use the
// exact rendered top triangles for vertical physics. Adjacent quads share the
// same vertices, so there are no synthetic discs, overlaps or height steps at
// their joins.
function buildCollision(C) {
  var M = C.length,
    road = [],
    surface = [],
    rails = [],
    gaps = [];
  function seg(k) {
    // does a road segment start at centreline sample k?
    return solid(C[(k + M) % M]) && solid(C[(k + 1 + M) % M]);
  }
  for (var i = 0; i < M; i++) {
    var p = C[i],
      q = C[(i + 1) % M];
    if (!solid(p) || !solid(q)) continue;
    var dx = q.x - p.x,
      dz = q.z - p.z,
      len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    var pe = edges(p),
      qe = edges(q);
    // Same split/order as Strip.quad(pe[0], qe[0], qe[1], pe[1]).
    surface.push(surfaceTri(pe[0], qe[0], qe[1]));
    surface.push(surfaceTri(pe[0], qe[1], pe[1]));
    road.push({
      i: i,
      ax: p.x,
      az: p.z,
      ux: dx / len,
      uz: dz / len,
      len: len,
      // a touch wider than the deck looks, so the very rim still holds a truck
      half: halfAt(p) + 0.8,
      // overlap into the neighbouring segments to close the wedge every bend
      // opens between two straight rectangles — but never across a jump
      e0: seg(i - 1) ? halfAt(p) : 0,
      e1: seg(i + 1) ? halfAt(p) : 0,
      y0: p.y + (p.lift || 0),
      y1: q.y + (q.lift || 0),
    });
  }
  // Record only the deliberate ramp-jump gap. Normal joins need no filler:
  // their collision triangles are the rendered triangles and share an edge.
  for (var m = 0; m < M; m++) {
    if (C[m].gap) {
      // Explicit jump corridor. rc.js uses this to distinguish the designed
      // airborne gap from an accidental hole at a bend or rail opening.
      gaps.push({ x: C[m].x, z: C[m].z, y: C[m].y, r: HALF + 6 });
      continue;
    }
  }
  // Walls go on every segment — but never where a second pass of the road runs
  // alongside, or the rail ends up standing in the middle of the other lane.
  // Elevated decks get a hard wall (falling off there is a long drop). Floor
  // level gets a `soft` one: collision-only, no mesh, and rc.js ignores it
  // outside a race, so free roam can still leave the ribbon and drive the rooms
  // while a race keeps you on the circuit instead of loose in the apartment.
  for (var k = 0; k < M; k++) {
    var a = C[k],
      b = C[(k + 1) % M];
    if (!solid(a) || !solid(b)) continue;
    // heights match the prims: the repeat lift is on the deck, so the rail band
    // and coveredAt's lane test have to read it too
    var ay = a.y + (a.lift || 0),
      by = b.y + (b.lift || 0);
    // A rail on a stretch with no visible deck has to be soft: there is no mesh
    // to explain it, so it may only pen a kart in during a race (and with the
    // guard-walls switch on), never while you are exploring the sofa.
    var soft = ay <= RAIL_FROM || by <= RAIL_FROM || !decked(a) || !decked(b);
    // ...and home mode drops those entirely. A continuous circuit can be lined
    // with invisible kerbs because you are always inside it; here the deck comes
    // in short isolated pieces, and fencing each one turns it into a box that
    // can only be entered end-on. Bots aiming at a gate inside a soft-railed
    // pass-through simply ground themselves against its side for the whole race.
    if (soft && HOME_ACTIVE) continue;
    var lx = -a.uz,
      lz = a.ux;
    for (var sd = 1; sd >= -1; sd -= 2) {
      var ax = a.x + lx * halfAt(a) * sd,
        az = a.z + lz * halfAt(a) * sd,
        bx = b.x + -b.uz * halfAt(b) * sd,
        bz = b.z + b.ux * halfAt(b) * sd;
      if (coveredAt(road, (ax + bx) / 2, (az + bz) / 2, (ay + by) / 2, k)) continue;
      rails.push({
        ax: ax,
        az: az,
        bx: bx,
        bz: bz,
        half: 0.8,
        soft: soft,
        y0: Math.min(ay, by) - 1,
        y1: Math.max(ay, by) + (soft ? SOFT_RAIL_H : RAIL_H),
      });
    }
  }
  return { road: road, surface: surface, rails: rails, gaps: gaps };
}

// Gates every ~110cm with smoothing points between them (rc.js and kart.js both
// read `minor`), never inside the jump gap. Spacing tightens with curvature:
// both the player's line and the AI's steering target run gate-to-gate in
// straight hops, and a 40cm helix sampled every 40cm chords clean off the deck.
function buildWps(C) {
  var M = C.length,
    wps = [],
    majorEvery = Math.max(9, Math.round(110 / SAMP)),
    minorEvery = Math.max(3, Math.round(34 / SAMP));
  var sinceMinor = 1e9,
    sinceMajor = 1e9,
    turn = 0;
  for (var i = 0; i < M; i++) {
    var c = C[i];
    sinceMinor++;
    sinceMajor++;
    if (i) {
      var d = Math.atan2(c.ux, c.uz) - Math.atan2(C[i - 1].ux, C[i - 1].uz);
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turn += Math.abs(d);
    }
    if (c.gap) continue;
    var major = sinceMajor >= majorEvery;
    if (!major && sinceMinor < minorEvery && turn < 0.34) continue;
    wps.push({
      x: c.x,
      y: c.y,
      z: c.z,
      ux: c.ux,
      uz: c.uz,
      bank: c.bank,
      minor: !major,
    });
    sinceMinor = 0;
    turn = 0;
    if (major) sinceMajor = 0;
  }
  if (wps.length) wps[0].minor = false;
  return wps;
}

// boost strips: on the run-in to the jump, and out of the landing
function padSpots(C, dropStart) {
  var out = [],
    M = C.length;
  function at(i) {
    var c = C[(i + M) % M];
    if (!c || c.gap) return;
    out.push({ x: c.x, y: c.y, z: c.z, ux: c.ux, uz: c.uz });
  }
  if (dropStart > 0) {
    at(dropStart + 4);
    at(dropStart + 10);
  }
  return out;
}

export var ROAD_W = W;

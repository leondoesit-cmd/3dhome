/* Which way a dropped piece faces — decided from what is around it.
   ---------------------------------------------------------------------------
   Dragging a piece only ever moved it. Every angle was the user's problem, so
   a sink landed on the counter with its bowl pointing sideways into the wall,
   a bed arrived across the room with its headboard in mid-air, and the fix was
   the same twelve taps on the 15° button every single time.

   The rules here are the ones a person applies without thinking, in the order
   they apply them:

     1. STANDING ON SOMETHING TAKES ITS ANGLE. A sink dropped on a base cabinet,
        a toaster on a worktop, a TV on its unit — the host already decided
        which way this face of the kitchen looks, and disagreeing with it is
        never what was meant.
     2. A RUN MATCHES ITS RUN. Cabinets, appliances and vanities dropped beside
        an existing one join that line rather than starting a new angle.
     3. A SEAT FACES WHAT IT IS PULLED UP TO. A chair near a table faces the
        table, from whichever side it was dropped on.
     4. EVERYTHING ELSE PUTS ITS BACK TO THE NEAREST WALL. Furniture's front is
        local +Z (see js/view3d.js buildItem), so this is one angle from the
        wall's normal — and it works on oblique and curved walls, because the
        normal is read at the point the piece is actually near.

   Two escapes, because a smart default that cannot be overruled is a bug:
   turning a piece by hand marks it `rotUser` and nothing here touches it
   again, and Alt held during a drag suspends the whole thing for that gesture.
   `S.autoFace = false` turns it off for good. */
import { S } from "./state.js";
import { wallProject, wallTangentAt, wallGeom } from "./geometry.js";

function norm(deg) {
  return ((deg % 360) + 360) % 360;
}
function num(v) {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/* Pieces whose angle carries no meaning (a rug, a round table, anything that
   hangs from the slab) or is a statement about the room rather than about the
   nearest wall (a person). Turning these on drop is pure noise. */
export var FREE_TYPES = {
  rug: 1, table: 1, roundTable: 1, coffee: 1, island: 1, sideTable: 1,
  pouf: 1, plant: 1, aquarium: 1, stairs: 1, laundryBasket: 1,
  ceilingLight: 1, pendant: 1, chandelier: 1, ceilingFan: 1,
  trackLight: 1, lightStrip: 1, floorLamp: 1, tableLamp: 1,
  acDiffuser: 1, acReturn: 1, acCassette: 1, acDucted: 1,
  man: 1, woman: 1, boy: 1, girl: 1, oldman: 1, oldwoman: 1,
  grow_tent: 1, shade_net: 1, water_reservoir_60l: 1, water_chiller: 1,
  dwc_bucket: 1, rdwc_header: 1, ebb_flow_tray: 1,
  tower_commercial: 1, tower_diy_pvc: 1,
};

// Seats: they face the thing they are pulled up to, and only fall back to a
// wall when there is nothing to sit at.
export var SEAT_TYPES = { chair: 1, officeChair: 1, barstool: 1, stool: 1 };
// ...and this is what counts as something to sit at.
export var SEAT_TARGETS = {
  table: 1, roundTable: 1, coffee: 1, island: 1, desk: 1,
  dressTable: 1, piano: 1, whiteboard: 1,
};

/* A "run": pieces that are installed in a line and must all look the same way.
   A dishwasher dropped next to a base cabinet belongs to that cabinet's run
   even when the wall behind them is not the nearest one to its centre. */
export var RUN_TYPES = {
  base: 1, tall: 1, upper: 1, pantry: 1, cabsys: 1, sink: 1, cooktop: 1,
  oven: 1, dishwasher: 1, hood: 1, microwave: 1, fridge: 1, wineFridge: 1,
  washer: 1, dryer: 1, vanity: 1, wardrobe: 1,
};

/* Things that live ON a wall. They get a much longer reach, because a piece
   that is nowhere near a wall is a mistake to be corrected, not a decision to
   be respected. */
export var HUNG_TYPES = {
  tvWall: 1, art: 1, mirror: 1, wallMirror: 1, clock: 1, curtain: 1,
  whiteboard: 1, wallShelf: 1, wallLamp: 1, ac: 1, towelRail: 1,
  waterHeater: 1, radiator: 1, soundbar: 1, monitor: 1,
};

/* How far a piece's back may be from a wall face and still be understood as
   "against that wall" (cm). Deliberately generous compared to the flush snap
   in interaction.js: this only turns the piece, it never moves it, so being
   wrong costs one press of the rotate button and being timid costs the whole
   feature. */
export var WALL_REACH = 65;
export var HUNG_REACH = 220;
// how far past a wall's ends a piece may sit and still belong to it
var SPAN_SLACK = 25;
// clear space allowed between two pieces of one run, along the run...
var RUN_GAP = 30;
// ...and how far off that run's line the new piece may still be
var RUN_LINE = 15;
// how far a seat may be from its table
var SEAT_REACH = 110;

export function orientMode(type) {
  if (!type) return "wall";
  if (FREE_TYPES[type]) return "free";
  if (SEAT_TYPES[type]) return "seat";
  if (RUN_TYPES[type]) return "run";
  if (HUNG_TYPES[type]) return "hung";
  return "wall";
}

export function autoFaceOn() {
  return S.autoFace !== false;
}

/* How far one press of a rotate button (or the R key) turns a piece. 15° is
   right for nudging a chair and absurd for the commonest edit there is —
   putting a cabinet on the next wall is 90°, i.e. six presses. The step is a
   setting rather than a second pair of buttons, so one choice drives the
   buttons, the R key and room rotation together. */
export var ROT_STEPS = [15, 45, 90];
export function rotStep() {
  var v = Number(S.rotStep);
  return ROT_STEPS.indexOf(v) === -1 ? 15 : v;
}
export function setRotStep(v) {
  S.rotStep = ROT_STEPS.indexOf(Number(v)) === -1 ? 15 : Number(v);
  return S.rotStep;
}

/* The user turned this piece by hand: from now on it keeps the angle it was
   given. Called from every manual rotation path (inspector, buttons, R key,
   "same rotation"), so there is no way to turn a piece and still have the
   editor argue with you about it. */
export function markManualRot(it) {
  if (it) it.rotUser = 1;
  return it;
}
export function clearManualRot(it) {
  if (it) delete it.rotUser;
  return it;
}

// world angle whose FRONT (local +Z) points along (dx,dz)
function rotFacing(dx, dz) {
  if (!dx && !dz) return null;
  var deg = (Math.atan2(-dx, dz) * 180) / Math.PI;
  var r = norm(deg);
  // walls are usually axis-aligned; kill the float dust so the inspector reads
  // 90 rather than 89.99999
  var snapped = Math.round(r / 90) * 90;
  if (Math.abs(norm(snapped - r + 180) - 180) < 0.75) r = norm(snapped);
  else r = Math.round(r * 10) / 10;
  return r;
}

/* The nearest wall's outward normal, at the point of it the piece is beside.
   Returns the angle that puts the piece's back on that wall, or null. */
export function backToWallRot(it, x, z, reach) {
  var best = null,
    bestGap = reach == null ? WALL_REACH : reach,
    depth = num(it && it.d) / 2;
  (S.walls || []).forEach(function (w) {
    var g = wallGeom(w),
      hit = wallProject(w, x, z);
    if (!g || !hit || !isFinite(g.L) || g.L <= 0) return;
    if (hit.s < -SPAN_SLACK || hit.s > g.L + SPAN_SLACK) return;
    var tan = wallTangentAt(w, hit.s) || { x: g.ux, z: g.uz },
      nx = -tan.z,
      nz = tan.x,
      side = (x - hit.x) * nx + (z - hit.z) * nz;
    // point the normal at the side the piece is on — that is the face it backs
    // onto, and on a curved wall it is read at the piece, not at the chord
    if (side < 0) {
      nx = -nx;
      nz = -nz;
    }
    // the gap between the piece's BACK and the wall's face; |…| so a piece
    // dropped straddling the wall still resolves rather than being ignored
    var gap = Math.abs(Math.abs(hit.distance) - num(w.thickness) / 2 - depth);
    if (gap < bestGap) {
      bestGap = gap;
      best = rotFacing(nx, nz);
    }
  });
  return best;
}

/* The neighbouring piece of the same run, if the drop lands BESIDE one — read
   in that neighbour's own frame, which is the only frame in which "beside"
   means anything. Along its width the two may be a cabinet's gap apart; across
   its depth they must be on the same line, or a fridge on the far wall of the
   kitchen counts as the neighbour of a sink and hands it the wrong angle. */
export function runNeighbour(it, x, z) {
  var best = null,
    bd = Infinity;
  (S.items || []).forEach(function (o) {
    if (!o || o === it || !RUN_TYPES[o.type]) return;
    var a = (num(o.rot) * Math.PI) / 180,
      ca = Math.cos(a),
      sa = Math.sin(a),
      dx = x - o.x,
      dz = z - o.z,
      // the neighbour's local axes: +X = (cos,sin) is its width, the run line
      along = Math.abs(dx * ca + dz * sa),
      across = Math.abs(-dx * sa + dz * ca);
    if (along > (num(o.w) + num(it.w)) / 2 + RUN_GAP) return;
    if (across > Math.max(num(o.d), num(it.d)) / 2 + RUN_LINE) return;
    if (along >= bd) return;
    bd = along;
    best = o;
  });
  return best;
}

// the table/desk a seat was pulled up to
export function seatTarget(it, x, z) {
  var best = null,
    bd = Infinity;
  (S.items || []).forEach(function (o) {
    if (!o || o === it || !SEAT_TARGETS[o.type]) return;
    var reach = Math.max(num(o.w), num(o.d)) / 2 + Math.max(num(it.w), num(it.d)) / 2 + SEAT_REACH;
    var d = Math.hypot(o.x - x, o.z - z);
    if (d > reach || d >= bd) return;
    bd = d;
    best = o;
  });
  return best;
}

/* Face `target` from wherever the seat is. A rectangular table is faced
   SQUARE ON from the side the seat is on — six chairs round a table should
   read as two tidy rows, not as a fan of slightly different bearings. Round
   tables have no sides, so those get the true bearing. */
export function faceTargetRot(it, x, z, target) {
  var dx = target.x - x,
    dz = target.z - z;
  if (!dx && !dz) return null;
  if (target.type === "roundTable") return rotFacing(dx, dz);
  var a = (num(target.rot) * Math.PI) / 180,
    ca = Math.cos(a),
    sa = Math.sin(a),
    // the seat's offset in the target's own frame (local +X = (cos,sin))
    lx = -dx * ca - dz * sa,
    lz = dx * sa - dz * ca,
    hw = Math.max(num(target.w), 1) / 2,
    hd = Math.max(num(target.d), 1) / 2;
  if (Math.abs(lx) / hw > Math.abs(lz) / hd)
    return norm(num(target.rot) + (lx > 0 ? 90 : -90));
  return norm(num(target.rot) + (lz > 0 ? 180 : 0));
}

/* The whole decision, in one call. `ctx.host` is the piece this one would be
   standing on at (x,z) — the caller knows it, and re-deriving it here would
   mean this module reaching into the stacking rules. Returns an angle in
   degrees, or null for "no opinion, leave it alone". */
export function autoFaceRot(it, x, z, ctx) {
  if (!it) return null;
  var mode = orientMode(it.type);
  if (mode === "free") return null;
  var host = ctx && ctx.host;
  if (host && host !== it) return norm(num(host.rot));
  if (mode === "run") {
    var nb = runNeighbour(it, x, z);
    if (nb) return norm(num(nb.rot));
  }
  if (mode === "seat") {
    var tgt = seatTarget(it, x, z);
    if (tgt) {
      var r = faceTargetRot(it, x, z, tgt);
      if (r != null) return r;
    }
  }
  return backToWallRot(it, x, z, mode === "hung" ? HUNG_REACH : WALL_REACH);
}

/* Apply the decision to a piece being placed or dragged at (x,z). Returns the
   angle it was turned BY (0 when nothing changed), so a caller holding a stack
   can spin the riders with stack.js rotateWith — this module deliberately does
   not import the stacking rules, because it is loaded by item_align.js, which
   has to stay free of anything that pulls in three.js. */
export function applyAutoFace(it, x, z, ctx) {
  if (!it || it.locked || it.rotUser || !autoFaceOn()) return 0;
  if (S.orientHold) return 0; // Alt held: this gesture is manual
  var want = autoFaceRot(it, x, z, ctx);
  if (want == null) return 0;
  var cur = norm(num(it.rot)),
    delta = norm(want - cur);
  if (delta < 0.25 || delta > 359.75) return 0;
  it.rot = norm(want);
  return delta;
}

/* "Face it by what is around it" as an explicit command: forget that the piece
   was turned by hand and re-run the decision where it stands. This is the way
   back from a manual angle, and the only place `rotUser` is cleared. */
export function refaceItem(it, ctx) {
  if (!it || it.locked) return 0;
  clearManualRot(it);
  var hold = S.orientHold;
  S.orientHold = false;
  var delta = applyAutoFace(it, it.x, it.z, ctx);
  S.orientHold = hold;
  return delta;
}

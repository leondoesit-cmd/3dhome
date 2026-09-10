/* The Floor is Lava — shared session state + parkour/lava math.
   Keep this file free of THREE/DOM so Node tests can import it. */
import { clamp } from "./state.js";
import { segCross } from "./col2d.js";

/* The runner is a quarter of a person — about 42cm from sole to scalp, which
   makes a kitchen a canyon and a sofa a cliff. Lengths scale with P_SCALE and
   speeds with its square root (Froude scaling: halving the stride while
   keeping real gravity is what stops a small body from moving like a balloon).
   Gravity itself is NOT scaled — it is the room's, not the runner's. A jump
   now clears about 21cm, which is why the spider kit in lava_spider.js is not
   a garnish: above knee height, climbing is the only way up. */
export const P_SCALE = 0.25;
var LEN = P_SCALE,
  VEL = Math.sqrt(P_SCALE);

export const EYE = 158 * LEN,
  EYE_CROUCH = 102 * LEN,
  P_RAD = 22 * LEN,
  P_CLEAR = 168 * LEN,
  P_CROUCH_CLEAR = 100 * LEN,
  STEP = 48 * LEN,
  SPD_WALK = 255 * VEL,
  SPD_SPRINT = 430 * VEL,
  SPD_CROUCH = 128 * VEL,
  ACCEL = 16,
  GRAV = 1400,
  JUMP_V = 490 * VEL,
  COYOTE = 0.14,
  JUMP_BUF = 0.12,
  MANTLE_MIN = 36 * LEN,
  MANTLE_MAX = 124 * LEN,
  MANTLE_REACH = 40 * LEN,
  MANTLE_DUR = 0.26,
  BURN_MARGIN = 5 * LEN,
  GEM_R = 34,
  EXTRACT_R = 52,
  EXTRACT_HOLD = 0.7,
  GEM_FREEZE = 1.65,
  COMBO_FREEZE = 0.9,
  COMBO_FREEZE_AT = 2,
  FREEZE_BAR = 4,
  DEATH_HOLD = 0.45,
  LAVA_START_Y = -10,
  GHOST_SAMPLE_MS = 55,
  HEAT_RANGE = 92 * LEN,
  JUMP_RANGE = 280 * LEN,     // horizontal cover on a sprint jump
  VAULT_GAP = 60 * LEN,       // mantle from the lip, not from across the room
  STEP_MIN = 25 * LEN,        // a first step has to actually get you off the floor
  STEP_AREA = 700 * LEN * LEN, // …and be big enough to land on at a sprint
  REACTION = 1.6,       // look up, find the ledge, commit
  ROUTE_SLACK = 1.35,   // nobody runs a straight line through a furnished room
  MAX_COUNTDOWN = 16;

/* `countdown` is a FLOOR, not the siren's length — countdownFor() below
   stretches it to cover the ground this particular spawn has to cross. The
   old fixed numbers were a different game in a studio than in an open-plan
   loft: 3.1s is a stroll to the sofa in one and an unwinnable sprint in the
   other, and the player never got to find out which until they burned. */
export const DIFFICULTY = {
  casual: { id: "casual", countdown: 6.5, rise: 5.6, crates: 8, gems: 8 },
  standard: { id: "standard", countdown: 4.6, rise: 9.0, crates: 6, gems: 6 },
  inferno: { id: "inferno", countdown: 3.2, rise: 14.2, crates: 4, gems: 4 },
};

export const L = {
  active: false,
  grp: null,
  col: null,
  keys: {},
  hud: null,
  t: 0,
  locked: false,
  paused: false,
  started: false,
  p: null,
  lavaY: LAVA_START_Y,
  freeze: 0,
  gems: [],
  extract: null,
  platforms: [],
  crates: [],
  ghostRec: null,
  ghostPlay: null,
  ghostLast: -1e9,
  combo: 0,
  lastLandId: null,
  bestMs: 0,
  runMs: 0,
  heat: 0,
  settings: null,
  prevMax: null,
  prevQuality: null,
  prevNear: null,
  prevGfx: null,
  unrelight: null, // un-registers the re-grade hook when the mode exits
  audio: null,
  doorsOpened: [],
  practicals: [],
  stepMesh: null,
  webMesh: null,
  spec: null, // the live run's clock: difficulty + a countdown sized to the spawn
  bounds: null,
  visT: 0,
  fovPunch: 0,
  endDelay: 0,
  endShown: false,
  ghostFade: 0,
  stick: null,
};

export function lavaActive() {
  return L.active;
}

export function jumpApex(v, g) {
  v = v == null ? JUMP_V : v;
  g = g == null ? GRAV : g;
  if (!(g > 0)) return 0;
  return (v * v) / (2 * g);
}

export function specFor(id) {
  return DIFFICULTY[id] || DIFFICULTY.standard;
}

/* Fast / Balanced / High — tessellation + gem lights, not the planner's IBL. */
export function lavaDetail(q) {
  q = Math.round(Number(q) || 0);
  if (q <= 0) return { seg: 12, gemLight: false, octaves: 2 };
  if (q === 1) return { seg: 28, gemLight: true, octaves: 3 };
  return { seg: 48, gemLight: true, octaves: 4 };
}

/* Volume lives on the master bus once. Voices pass their raw peak. */
export function busGains(peak, slider01) {
  return {
    voice: Number(peak) || 0,
    master: clamp(slider01 == null ? 1 : Number(slider01), 0, 1),
  };
}

export function pathOpen(ax, az, bx, bz, segs) {
  if (!segs || !segs.length) return true;
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (!s) continue;
    if (segCross(ax, az, bx, bz, s.ax, s.az, s.bx, s.bz)) return false;
  }
  return true;
}

export function rectHitsSegs(x0, z0, x1, z1, segs) {
  if (!segs || !segs.length) return false;
  var edges = [
    [x0, z0, x1, z0],
    [x1, z0, x1, z1],
    [x1, z1, x0, z1],
    [x0, z1, x0, z0],
  ];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    if (!s) continue;
    for (var e = 0; e < 4; e++) {
      if (segCross(edges[e][0], edges[e][1], edges[e][2], edges[e][3], s.ax, s.az, s.bx, s.bz))
        return true;
    }
  }
  return false;
}

export function rectGap(a, b) {
  var dx = 0;
  if (a.x1 < b.x0) dx = b.x0 - a.x1;
  else if (b.x1 < a.x0) dx = a.x0 - b.x1;
  var dz = 0;
  if (a.z1 < b.z0) dz = b.z0 - a.z1;
  else if (b.z1 < a.z0) dz = a.z0 - b.z1;
  return Math.hypot(dx, dz);
}

/* Can you get from the top of `from` onto `to` with a jump, a drop, or a mantle? */
export function canVault(from, to, segs) {
  if (!from || !to) return false;
  var lift = to.y1 - from.y1;
  var gap = rectGap(from, to);
  var acx = (from.x0 + from.x1) / 2,
    acz = (from.z0 + from.z1) / 2,
    bcx = (to.x0 + to.x1) / 2,
    bcz = (to.z0 + to.z1) / 2;
  if (gap > 8 && segs && !pathOpen(acx, acz, bcx, bcz, segs)) return false;
  if (lift <= 8) return gap <= JUMP_RANGE;
  if (lift >= MANTLE_MIN && lift <= MANTLE_MAX && gap <= VAULT_GAP) return true;
  if (lift <= jumpApex() + 12 && gap <= JUMP_RANGE) return true;
  return false;
}

export function reachableFromFloor(platforms, segs) {
  var list = platforms || [];
  var n = list.length,
    seen = new Array(n),
    q = [];
  var apex = jumpApex() + 12;
  for (var i = 0; i < n; i++) {
    var rc = list[i];
    if (!rc) continue;
    var lift = rc.y1;
    if (lift <= 8 || (lift >= STEP_MIN && lift <= MANTLE_MAX) || lift <= apex) {
      seen[i] = 1;
      q.push(i);
    }
  }
  while (q.length) {
    var a = q.pop();
    for (var j = 0; j < n; j++) {
      if (seen[j] || !list[j]) continue;
      if (!canVault(list[a], list[j], segs)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

/* Lava seeps up through the floorboards during the siren, then climbs. A
   freeze bank (gems / combo) holds the surface still without rewinding it. */
export function nextLavaY(y, dt, elapsed, spec, freezeLeft) {
  spec = spec || DIFFICULTY.standard;
  if (elapsed < spec.countdown) {
    var u = clamp(elapsed / spec.countdown, 0, 1);
    u = u * u;
    return LAVA_START_Y + (0 - LAVA_START_Y) * u;
  }
  if (freezeLeft > 0) return y;
  return y + spec.rise * dt;
}

/* The first thing worth standing on from where you are: low enough to climb
   without a run-up, big enough to land on. Used twice — to size the siren, and
   to point at it while the siren is running. */
export function firstStep(rects, x, z, fromY, segs) {
  var y = Number(fromY) || 0;
  var best = null,
    bestScore = -1e9;
  (rects || []).forEach(function (rc) {
    if (!rc) return;
    var lift = rc.y1 - y;
    if (lift < STEP_MIN || lift > MANTLE_MAX) return;
    var area = Math.max(0, rc.x1 - rc.x0) * Math.max(0, rc.z1 - rc.z0);
    if (area < STEP_AREA) return;
    var cx = clamp(x, rc.x0, rc.x1),
      cz = clamp(z, rc.z0, rc.z1);
    var d = Math.hypot(cx - x, cz - z);
    // a ledge in the next room through a wall is not the first step
    if (d > 8 && segs && !pathOpen(x, z, cx, cz, segs)) d += 500;
    // near beats far, roomy beats cramped, and a taller step buys more time
    var score = -d + area / 500 + lift * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = { rc: rc, dist: d };
    }
  });
  return best;
}

/* How long the siren has to last for this spawn to be survivable at all:
   sprint the distance to that first step, vault onto it, and leave a beat to
   read the room. Never shorter than the difficulty's own floor, so picking
   Inferno still means something in a cramped plan. */
export function countdownFor(spec, escapeCm, climbs) {
  spec = spec || DIFFICULTY.standard;
  var travel = (Math.max(0, Number(escapeCm) || 0) * ROUTE_SLACK) / SPD_SPRINT;
  var vaults = Math.max(0, Number(climbs) || 0) * (MANTLE_DUR + 0.4);
  return clamp(
    Math.max(spec.countdown, REACTION + travel + vaults),
    spec.countdown,
    MAX_COUNTDOWN,
  );
}

/* Where the drill starts. Dropping the player at the centre of the plan is how
   a run begins two rooms from anything climbable — with a siren running that
   is not a difficulty, it is a coin toss. Start beside a first step, and beside
   the one FURTHEST from extraction, so the course is still a course. */
export function pickSpawn(rects, bounds, extract) {
  var steps = (rects || []).filter(function (rc) {
    if (!rc || rc.y1 < STEP_MIN || rc.y1 > MANTLE_MAX) return false;
    return (rc.x1 - rc.x0) * (rc.z1 - rc.z0) >= STEP_AREA;
  });
  if (!steps.length) return null;
  var ex = extract ? extract.x : 0,
    ez = extract ? extract.z : 0;
  var best = null,
    bestScore = -1e9;
  steps.forEach(function (rc) {
    var cx = (rc.x0 + rc.x1) / 2,
      cz = (rc.z0 + rc.z1) / 2;
    var score = extract ? Math.hypot(cx - ex, cz - ez) : (rc.x1 - rc.x0) * (rc.z1 - rc.z0);
    if (score > bestScore) {
      bestScore = score;
      best = rc;
    }
  });
  var bx = (best.x0 + best.x1) / 2,
    bz = (best.z0 + best.z1) / 2;
  // stand off it on the side away from the goal, so the step is between the
  // player and the rest of the course rather than behind them
  var ax = bx - ex,
    az = bz - ez;
  var m = Math.hypot(ax, az);
  if (!(m > 0.001)) {
    ax = 1;
    az = 0;
    m = 1;
  }
  var reach = Math.max(best.x1 - best.x0, best.z1 - best.z0) / 2 + 55 * LEN;
  var x = bx + (ax / m) * reach,
    z = bz + (az / m) * reach;
  if (bounds) {
    x = clamp(x, bounds.minx + 40 * LEN, bounds.maxx - 40 * LEN);
    z = clamp(z, bounds.minz + 40 * LEN, bounds.maxz - 40 * LEN);
  }
  return { x: x, z: z, step: best };
}

export function heatFactor(playerY, lavaY, range) {
  range = range == null ? HEAT_RANGE : range;
  return clamp(1 - (playerY - lavaY) / range, 0, 1);
}

export function isBurned(playerY, lavaY, margin) {
  margin = margin == null ? BURN_MARGIN : margin;
  return playerY < lavaY + margin;
}

export function scorchAmount(platformY1, lavaY) {
  return clamp(1 - (platformY1 - lavaY) / 42, 0, 1);
}

export function platformSubmerged(platformY1, lavaY) {
  return lavaY >= platformY1 - 3;
}

export function formatTime(ms) {
  var s = Math.max(0, Number(ms) || 0) / 1000;
  var m = Math.floor(s / 60);
  var r = s - m * 60;
  return m + ":" + (r < 10 ? "0" : "") + r.toFixed(2);
}

export function ghostDelta(runMs, bestMs) {
  if (!(bestMs > 0) || !(runMs >= 0)) return null;
  return runMs - bestMs;
}

export function formatDelta(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  var sign = ms > 4 ? "+" : ms < -4 ? "−" : "";
  var abs = Math.abs(ms) / 1000;
  if (!sign) return "±0.00";
  return sign + abs.toFixed(2);
}

export function planSignature(nodes, walls, items) {
  var parts = ["v1", (nodes || []).length, (walls || []).length, (items || []).length];
  (walls || []).forEach(function (w) {
    parts.push(w && w.id, w && w.a, w && w.b, w && Math.round(w.height || 0));
  });
  (items || []).forEach(function (it) {
    if (!it) return;
    parts.push(
      it.type,
      Math.round(it.x || 0),
      Math.round(it.z || 0),
      Math.round(it.h || 0),
      Math.round(it.rot || 0)
    );
  });
  var str = parts.join(",");
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function ghostStoreKey(sig, diff) {
  return "home3d_lava_" + (sig || "none") + "_" + (diff || "standard");
}

export function rotateOffset(lx, lz, rotDeg) {
  var rad = -(rotDeg || 0) * Math.PI / 180;
  var c = Math.cos(rad),
    s = Math.sin(rad);
  return { x: lx * c - lz * s, z: lx * s + lz * c };
}

/* Stair flights in the furniture library are one solid AABB after merge.
   Expand them into treads so the player can actually scramble up. */
export function stairTreads(it, steps) {
  if (!it) return [];
  steps = steps || 10;
  var w = it.w || 100,
    d = it.d || 250,
    h = it.h || 260,
    elev = it.elev || 0,
    x = it.x || 0,
    z = it.z || 0;
  var rot = it.rot || 0;
  var r90 = ((rot % 90) + 90) % 90;
  var axis = r90 < 8 || r90 > 82;
  var out = [];
  for (var i = 0; i < steps; i++) {
    var lz0 = d / 2 - ((i + 1) * d) / steps;
    var lz1 = d / 2 - (i * d) / steps;
    var y1 = elev + ((i + 1) * h) / steps;
    var corners = [
      rotateOffset(-w / 2, lz0, rot),
      rotateOffset(w / 2, lz0, rot),
      rotateOffset(-w / 2, lz1, rot),
      rotateOffset(w / 2, lz1, rot),
    ];
    var xs = corners.map(function (p) { return x + p.x; });
    var zs = corners.map(function (p) { return z + p.z; });
    var x0 = Math.min.apply(null, xs),
      x1 = Math.max.apply(null, xs),
      z0 = Math.min.apply(null, zs),
      z1 = Math.max.apply(null, zs);
    /* A rotated AABB of the whole tread is a diamond you can stand beside
       the stairs in. Collapse to a center box on the actual tread. */
    if (!axis) {
      var cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      var half = Math.min(w, d / steps) * 0.42;
      x0 = cx - half;
      x1 = cx + half;
      z0 = cz - half;
      z1 = cz + half;
    }
    out.push({
      x0: x0,
      x1: x1,
      z0: z0,
      z1: z1,
      y0: y1 - 7,
      y1: y1,
      item: it,
      kind: "tread",
    });
  }
  return out;
}

/* Mid-shelf landings so a tall bookcase is a climb, not a single 180cm vault. */
export function shelfLandings(it, rows) {
  if (!it) return [];
  rows = rows || 4;
  var w = it.w || 80,
    d = Math.max(it.d || 30, 22),
    h = it.h || 180,
    elev = it.elev || 0,
    x = it.x || 0,
    z = it.z || 0;
  var out = [];
  for (var s = 1; s <= rows; s++) {
    var y1 = elev + (s * h) / rows;
    var corners = [
      rotateOffset(-w / 2, -d / 2, it.rot),
      rotateOffset(w / 2, -d / 2, it.rot),
      rotateOffset(-w / 2, d / 2, it.rot),
      rotateOffset(w / 2, d / 2, it.rot),
    ];
    var xs = corners.map(function (p) { return x + p.x; });
    var zs = corners.map(function (p) { return z + p.z; });
    out.push({
      x0: Math.min.apply(null, xs),
      x1: Math.max.apply(null, xs),
      z0: Math.min.apply(null, zs),
      z1: Math.max.apply(null, zs),
      y0: y1 - 5,
      y1: y1,
      item: it,
      kind: "shelf",
    });
  }
  return out;
}

export function expandParkourRects(rects) {
  var out = [];
  (rects || []).forEach(function (rc) {
    var it = rc && rc.item;
    var type = it && it.type;
    if (type === "stairs") {
      var treads = stairTreads(it, 10);
      if (treads.length) {
        treads.forEach(function (t) { out.push(t); });
        return;
      }
    }
    out.push(rc);
    if (type === "bookshelf" || type === "wardrobe" || type === "pantry" || type === "tall") {
      shelfLandings(it, type === "bookshelf" ? 4 : 3).forEach(function (s) {
        out.push(s);
      });
    }
  });
  return out;
}

export function mantleTarget(rects, x, z, y, yaw, opts) {
  opts = opts || {};
  var reach = opts.reach == null ? MANTLE_REACH : opts.reach;
  var minH = opts.minH == null ? MANTLE_MIN : opts.minH;
  var maxH = opts.maxH == null ? MANTLE_MAX : opts.maxH;
  var fx = Math.sin(yaw || 0),
    fz = Math.cos(yaw || 0);
  var px = x + fx * 20,
    pz = z + fz * 20;
  var best = null,
    bestScore = -1e9;
  (rects || []).forEach(function (rc) {
    if (!rc) return;
    var lift = rc.y1 - y;
    if (lift < minH || lift > maxH) return;
    if (platformSubmerged(rc.y1, opts.lavaY || -1e9)) return;
    var cx = clamp(px, rc.x0, rc.x1),
      cz = clamp(pz, rc.z0, rc.z1);
    var dx = cx - x,
      dz = cz - z,
      d = Math.hypot(dx, dz);
    if (d > reach + 10) return;
    var facing = d < 4 ? 1 : (dx * fx + dz * fz) / d;
    if (facing < -0.15) return;
    var score = lift + facing * 40 - d;
    if (score > bestScore) {
      bestScore = score;
      best = rc;
    }
  });
  return best;
}

export function pickExtraction(platforms, segs) {
  var list = platforms || [];
  var seen = reachableFromFloor(list, segs);
  var best = null,
    bestY = -1e9,
    bestArea = 0;
  function consider(rc, requireHigh) {
    if (!rc) return;
    var area = Math.max(0, rc.x1 - rc.x0) * Math.max(0, rc.z1 - rc.z0);
    if (area < 280) return;
    if (requireHigh && rc.y1 < 70) return;
    if (rc.y1 > bestY + 2 || (Math.abs(rc.y1 - bestY) <= 2 && area > bestArea)) {
      best = rc;
      bestY = rc.y1;
      bestArea = area;
    }
  }
  var i;
  for (i = 0; i < list.length; i++) if (seen[i]) consider(list[i], true);
  if (!best) for (i = 0; i < list.length; i++) if (seen[i]) consider(list[i], false);
  if (!best) for (i = 0; i < list.length; i++) consider(list[i], true);
  if (!best) return null;
  return {
    x: (best.x0 + best.x1) / 2,
    y: best.y1,
    z: (best.z0 + best.z1) / 2,
    rc: best,
  };
}

export function placeGems(platforms, extract, count, opts) {
  count = count || 6;
  opts = opts || {};
  var extractY = extract ? extract.y : 180;
  var cands = (platforms || []).filter(function (rc) {
    if (!rc) return false;
    var area = (rc.x1 - rc.x0) * (rc.z1 - rc.z0);
    if (area < 400) return false;
    if (rc.y1 < 28 || rc.y1 > extractY - 8) return false;
    return true;
  });
  cands.sort(function (a, b) { return a.y1 - b.y1; });
  var gems = [];
  if (!cands.length) return gems;
  var used = [];
  function farEnough(x, z) {
    for (var i = 0; i < used.length; i++) {
      if (Math.hypot(used[i].x - x, used[i].z - z) < 90) return false;
    }
    return true;
  }
  function slotOn(rc) {
    var inset = 16;
    var x0 = rc.x0 + inset,
      x1 = rc.x1 - inset,
      z0 = rc.z0 + inset,
      z1 = rc.z1 - inset;
    if (x1 < x0) { x0 = (rc.x0 + rc.x1) / 2; x1 = x0; }
    if (z1 < z0) { z0 = (rc.z0 + rc.z1) / 2; z1 = z0; }
    var tries = [
      [(x0 + x1) / 2, (z0 + z1) / 2],
      [x0, (z0 + z1) / 2],
      [x1, (z0 + z1) / 2],
      [(x0 + x1) / 2, z0],
      [(x0 + x1) / 2, z1],
    ];
    for (var t = 0; t < tries.length; t++) {
      var x = tries[t][0],
        z = tries[t][1];
      if (opts.isFree && !opts.isFree(x, z, rc.y1)) continue;
      if (!farEnough(x, z)) continue;
      return { x: x, z: z, y: rc.y1 + 28 };
    }
    return null;
  }
  for (var n = 0; n < count && n < cands.length * 2; n++) {
    var rc = cands[Math.min(cands.length - 1, Math.round((n / Math.max(1, count - 1)) * (cands.length - 1)))];
    var slot = slotOn(rc);
    if (!slot && cands.length > n + 1) slot = slotOn(cands[(n * 3 + 1) % cands.length]);
    if (!slot) continue;
    used.push({ x: slot.x, z: slot.z });
    gems.push({
      x: slot.x,
      y: slot.y,
      z: slot.z,
      taken: false,
      freeze: GEM_FREEZE,
    });
  }
  return gems;
}

/* Empty living rooms still need a course. Drop a rising crate spine across
   the plan so extraction is always reachable. */
export function emergencyCrates(bounds, existingHigh, want, segs) {
  want = want == null ? 6 : want;
  if (existingHigh >= 5) return [];
  if (!bounds) return [];
  var n = Math.max(3, want - existingHigh);
  var x0 = bounds.minx,
    z0 = bounds.minz,
    x1 = bounds.maxx,
    z1 = bounds.maxz;
  var crates = [];
  var half = 28;
  function nudge(x, z) {
    x = clamp(x, x0 + half + 20, x1 - half - 20);
    z = clamp(z, z0 + half + 20, z1 - half - 20);
    if (!rectHitsSegs(x - half, z - half, x + half, z + half, segs)) return { x: x, z: z };
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (var r = 40; r <= 220; r += 40) {
      for (var d = 0; d < dirs.length; d++) {
        var nx = clamp(x + dirs[d][0] * r, x0 + half + 20, x1 - half - 20),
          nz = clamp(z + dirs[d][1] * r, z0 + half + 20, z1 - half - 20);
        if (!rectHitsSegs(nx - half, nz - half, nx + half, nz + half, segs))
          return { x: nx, z: nz };
      }
    }
    return null;
  }
  for (var i = 0; i < n; i++) {
    var u = (i + 1) / (n + 1);
    var y1 = 42 + i * 28;
    var cx = x0 + (x1 - x0) * u,
      cz = z0 + (z1 - z0) * (0.22 + u * 0.56);
    var spot = nudge(cx, cz);
    if (!spot) continue;
    crates.push({
      x0: spot.x - half,
      x1: spot.x + half,
      z0: spot.z - half,
      z1: spot.z + half,
      y0: 0,
      y1: y1,
      kind: "crate",
      item: { id: "crate-" + i, type: "crate" },
    });
  }
  return crates;
}

export function collectGem(gems, x, y, z, radius) {
  radius = radius == null ? GEM_R : radius;
  for (var i = 0; i < (gems || []).length; i++) {
    var g = gems[i];
    if (!g || g.taken) continue;
    if (Math.abs((g.y || 0) - y) > 70) continue;
    if (Math.hypot((g.x || 0) - x, (g.z || 0) - z) <= radius) return g;
  }
  return null;
}

export function reachedExtract(extract, x, y, z, radius) {
  if (!extract) return false;
  radius = radius == null ? EXTRACT_R : radius;
  if (Math.abs(y - extract.y) > 28) return false;
  return Math.hypot(extract.x - x, extract.z - z) <= radius;
}

export function interpolateGhost(samples, tSec) {
  if (!samples || samples.length < 2) return null;
  if (tSec > samples[samples.length - 1][0]) return null;
  if (tSec < samples[0][0]) tSec = samples[0][0];
  var i = Math.min(samples.length - 2, Math.max(0, Math.floor((tSec / samples[samples.length - 1][0]) * (samples.length - 1))));
  while (i > 0 && samples[i][0] > tSec) i--;
  while (i < samples.length - 2 && samples[i + 1][0] < tSec) i++;
  var a = samples[i],
    b = samples[i + 1],
    span = b[0] - a[0],
    f = span > 0 ? (tSec - a[0]) / span : 0;
  var dh = b[4] - a[4];
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return {
    x: a[1] + (b[1] - a[1]) * f,
    y: a[2] + (b[2] - a[2]) * f,
    z: a[3] + (b[3] - a[3]) * f,
    yaw: a[4] + dh * f,
  };
}

export function ghostSample(now, recT, x, y, z, yaw) {
  return [
    Math.round((now - recT) / 10) / 100,
    Math.round(x * 10) / 10,
    Math.round(y * 10) / 10,
    Math.round(z * 10) / 10,
    Math.round(yaw * 100) / 100,
  ];
}

export function comboOnLand(prevId, newId, combo) {
  if (newId == null || newId === "floor") return { combo: 0, freeze: 0, id: newId };
  if (prevId != null && prevId !== "floor" && newId !== prevId) {
    var next = (combo || 0) + 1;
    return { combo: next, freeze: next >= COMBO_FREEZE_AT ? COMBO_FREEZE : 0, id: newId };
  }
  return { combo: prevId === "floor" ? 0 : (combo || 0), freeze: 0, id: newId };
}

export function highPlatformCount(rects) {
  var n = 0;
  (rects || []).forEach(function (rc) {
    if (rc && rc.y1 >= 40) n++;
  });
  return n;
}

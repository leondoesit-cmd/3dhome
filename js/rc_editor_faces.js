// RC track editor — the "pass by this face" tool.
//
// Every other tool in the editor edits POINTS. This one edits INTENT: click a
// piece of furniture (or a room floor) on the 2D map, say which of its sides
// the truck should run along and which way round, and the tool lays the anchors
// that make the lap do it — offset clear of the item, fitted clear of the
// walls, and spliced into the leg of the loop that already passes closest so
// the rest of the route is left alone.
//
// The RULE is what the user owns, not the points it produced. Each anchor it
// lays carries the rule's id in `a.f`, so flipping the direction or moving to
// another face re-lays exactly those points, and deleting the rule takes
// exactly those points away again. Rule objects are immutable — an edit builds
// a new one — because the undo stack keeps a reference to the list.
//
// What "smart" means here, concretely:
//   · the suggested face is scored from real clearance along it (the same
//     clearAt() the validator uses) plus how far the current lap already is
//     from it, so the tool never suggests a side the road cannot fit down;
//   · the direction is whichever way round costs the loop less detour, judged
//     against the two anchors the pass is being spliced between;
//   · the ends are fitted — pushed out and pulled back until the full road
//     width fits — instead of being dropped at a nominal offset;
//   · "drive OVER it" is offered only for items the road builder can actually
//     ramp onto: rc_editor_faces asks track.js rather than keeping its own copy
//     of that rule.
import { ST, L, fin, clamp, rooms } from "./rc_editor_state.js";
import { clearAt, halfRoad, insertSpot, nearOnSeg } from "./rc_editor_geom.js";
import { setAnchors, views } from "./rc_editor_actions.js";
import { canRide, rideSpot } from "./track.js";
import { flabel } from "./furniture_meta.js";
import { pointInPoly, roomName } from "./geometry.js";

// map-space faces, clockwise from the top of the map. `n` points OUT of the
// item, `t` runs along the face so that using the same t on all four walks
// once round the item.
var FACE_N = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
var FACE_T = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
];
export var FACE_GLYPH = ["▲", "▶", "▼", "◀"];
export function faceName(i) {
  return [L("צפון", "Top"), L("מזרח", "Right"), L("דרום", "Bottom"), L("מערב", "Left")][i] || "";
}

var GAP = 3, // air between the road edge and the item it is passing
  RUN_EXT = 0.9, // face length is extended by this × half a road, for the turn-in
  MIN_RUN = 26, // shorter than this and there is no "pass" to speak of
  FIT_STEP = 6, // ...how far each fitting probe moves
  FIT_N = 7, // ...and how many it tries in each direction
  RIDE_LEAD = 46, // run-up left in front of an access ramp
  PICK_PAD = 34; // how far outside an item a click still means "this item"

// ---- targets ---------------------------------------------------------------
//
// Everything on the plan the user can point at: furniture (the merged per-item
// collision boxes, which is exactly what the road has to get past) and the
// rooms themselves, whose four sides mean "run down this wall of this room".
export function facesInvalidate() {
  if (ST.D) ST.D.faceCache = null;
}

export function faceTargets() {
  if (!ST.D) return [];
  if (ST.D.faceCache) return ST.D.faceCache;
  var col = ST.E.col() || {},
    out = [];
  (col.rects || []).forEach(function (r, i) {
    if (!r.item) return;
    if (r.y1 <= 3.4) return; // a rug is driven over, not passed
    if (Math.min(r.x1 - r.x0, r.z1 - r.z0) < 12) return;
    out.push({
      kind: "item",
      key: "i:" + (r.item.id || r.item._id || i),
      rect: r,
      item: r.item,
      name: r.item.type ? flabel(r.item.type) : L("רהיט", "Item"),
      area: (r.x1 - r.x0) * (r.z1 - r.z0),
    });
  });
  rooms().forEach(function (rm) {
    if (!rm.pts || rm.pts.length < 3) return;
    var b = { x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9, y0: 0, y1: 0 };
    rm.pts.forEach(function (p) {
      b.x0 = Math.min(b.x0, p.x);
      b.x1 = Math.max(b.x1, p.x);
      b.z0 = Math.min(b.z0, p.z);
      b.z1 = Math.max(b.z1, p.z);
    });
    out.push({
      kind: "room",
      key: "r:" + (rm.key != null ? rm.key : rm.name),
      rect: b,
      room: rm,
      // an unnamed room still needs to be tellable from the other three
      name:
        roomName(rm.key) ||
        L("חדר ", "Room ") + (Math.round((rm.area / 10000) * 10) / 10 + "m²"),
      area: (b.x1 - b.x0) * (b.z1 - b.z0),
    });
  });
  ST.D.faceCache = out;
  return out;
}

export function findTarget(key) {
  var all = faceTargets();
  for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
  return null;
}

// Can the truck be driven along the TOP of this one? Ask the road builder — the
// editor offering a ride the builder then refuses is worse than not offering it.
export function targetRide(tg) {
  if (!tg || tg.kind !== "item") return null;
  var tops = (ST.E.col() && ST.E.col().tops) || [];
  if (!canRide(tg.rect, tops)) return null;
  return rideSpot(tg.rect, tops);
}

// ---- face geometry ----------------------------------------------------------

// The pass line for one face: where the anchors want to sit before fitting.
// An item is passed on the OUTSIDE of the face; a room is driven along the
// INSIDE of its wall, which is the same construction with the offset negated.
export function faceGeom(tg, face) {
  if (!tg || face < 0 || face > 3) return null;
  var r = tg.rect,
    n = FACE_N[face],
    t = FACE_T[face];
  var cx = (r.x0 + r.x1) / 2,
    cz = (r.z0 + r.z1) / 2;
  var hx = (r.x1 - r.x0) / 2,
    hz = (r.z1 - r.z0) / 2;
  var reach = Math.abs(n.x) * hx + Math.abs(n.z) * hz, // centre → the face
    span = Math.abs(t.x) * hx + Math.abs(t.z) * hz; // half its length
  var half = halfRoad(),
    inside = tg.kind === "room" ? -1 : 1;
  var off = reach + inside * (half + GAP);
  var ext = inside > 0 ? half * RUN_EXT : -(half + GAP);
  var len = (span + ext) * 2;
  if (len < MIN_RUN) return null;
  var px = cx + n.x * off,
    pz = cz + n.z * off;
  return {
    x: px,
    z: pz,
    ax: px - t.x * (span + ext),
    az: pz - t.z * (span + ext),
    bx: px + t.x * (span + ext),
    bz: pz + t.z * (span + ext),
    nx: n.x * inside,
    nz: n.z * inside,
    tx: t.x,
    tz: t.z,
    len: len,
    face: face,
  };
}

// Inside the flat at all? Clearance alone says yes to the garden: nothing out
// there is close enough to any wall or item to fail a distance test, so a bed
// against an exterior wall used to get a "pass" laid outside the building.
function indoors(x, z) {
  var rs = rooms();
  for (var i = 0; i < rs.length; i++)
    if (rs[i].pts && rs[i].pts.length > 2 && pointInPoly(x, z, rs[i].pts)) return true;
  return false;
}

// Fit one end of the pass line: push it out along the face normal and/or pull
// it back along the face until the whole road width has room. A nominal offset
// is a guess; this is the same clearance test the validator will judge the
// finished route with, so what the tool lays is what the route accepts.
function fitEnd(g, ex, ez, toward) {
  var need = halfRoad() + 1;
  var start = indoors(ex, ez) ? clearAt(ex, ez, 0.7) : -1e3;
  var best = { x: ex, z: ez, c: start };
  if (best.c >= need) return best;
  for (var a = 0; a <= FIT_N; a++) {
    for (var b = 0; b <= FIT_N; b++) {
      if (!a && !b) continue;
      var px = ex + g.nx * a * FIT_STEP + toward.x * b * FIT_STEP,
        pz = ez + g.nz * a * FIT_STEP + toward.z * b * FIT_STEP;
      if (!indoors(px, pz)) continue;
      var c = clearAt(px, pz, 0.7);
      if (c >= need) return { x: px, z: pz, c: c };
      if (c > best.c) best = { x: px, z: pz, c: c };
    }
  }
  return best;
}

// Where the pass line's two anchors actually land, after fitting.
export function faceEnds(tg, face) {
  var g = faceGeom(tg, face);
  if (!g) return null;
  var toA = { x: g.tx, z: g.tz }, // from end A back toward the middle
    toB = { x: -g.tx, z: -g.tz };
  var a = fitEnd(g, g.ax, g.az, toA),
    b = fitEnd(g, g.bx, g.bz, toB);
  if (Math.hypot(b.x - a.x, b.z - a.z) < MIN_RUN) return null;
  return { g: g, a: a, b: b };
}

// How far the lap as drawn already is from a point — a face the route sails
// past is worth suggesting; one on the far side of the flat means a detour.
function routeDist(x, z) {
  var pts = ST.D.anchors,
    n = pts.length;
  if (n < 2) return 0;
  var best = 1e9;
  for (var i = 0; i < n; i++) {
    var d = nearOnSeg(pts[i].x, pts[i].z, pts[(i + 1) % n].x, pts[(i + 1) % n].z, x, z).d;
    if (d < best) best = d;
  }
  return best;
}

// What this face is worth: real clearance along its whole length first, then
// how naturally the lap reaches it.
export function faceScore(tg, face) {
  var g = faceGeom(tg, face);
  if (!g) return null;
  var need = halfRoad() + 1,
    worst = 1e9,
    sum = 0,
    N = 7;
  for (var i = 0; i < N; i++) {
    var u = i / (N - 1);
    var x = g.ax + (g.bx - g.ax) * u,
      z = g.az + (g.bz - g.az) * u;
    // a sample outside every room is not "clear floor", it is the garden
    var c = indoors(x, z) ? clearAt(x, z, 0.7) : -60;
    if (c < worst) worst = c;
    sum += clamp(c / need, 0, 1.4);
  }
  var reach = clamp(1 - routeDist(g.x, g.z) / 260, 0, 1);
  return {
    face: face,
    g: g,
    worst: worst,
    fit: sum / N,
    ok: worst >= need * 0.6,
    score: sum / N + reach * 0.55 + (worst >= need ? 0.35 : 0),
  };
}

// The face this item should be passed on, if the user just wants it decided.
export function smartFace(tg) {
  var best = null;
  for (var f = 0; f < 4; f++) {
    var s = faceScore(tg, f);
    if (s && (!best || s.score > best.score)) best = s;
  }
  return best ? best.face : -1;
}

// ---- picking ----------------------------------------------------------------

// What the user is pointing at: the smallest target whose footprint (plus a
// grab margin) contains the point, and which of its faces that point is
// nearest. Inside a rideable item's middle the answer is its TOP — that is the
// "drive over it" pick, and hovering shows which one you would get.
export function pickTarget(x, z) {
  var all = faceTargets(),
    best = null;
  for (var i = 0; i < all.length; i++) {
    var tg = all[i],
      r = tg.rect;
    var on = x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    var dx = Math.max(r.x0 - x, 0, x - r.x1),
      dz = Math.max(r.z0 - z, 0, z - r.z1);
    var dist = Math.hypot(dx, dz);
    if (!on && dist > PICK_PAD) continue;
    // Tiers, and this ORDER matters: the item you are actually pointing at beats
    // one you are merely near, which beats the room they are both standing in.
    // Ranking on area alone let the fridge 20cm away steal a click aimed at the
    // middle of the bed.
    // Within the first tier the BIGGEST footprint wins, because boxes nest: the
    // pendant light's (floor-level) box sits inside the table's, the chair's
    // inside the desk's, and the thing being pointed at is the one you could
    // plan a lap around.
    var tier = (on ? 0 : 1) + (tg.kind === "room" ? 2 : 0);
    var rank = tier * 1e9 + (on ? -tg.area : dist * 1000);
    if (!best || rank < best.rank) best = { tg: tg, rank: rank };
  }
  if (!best) return null;
  var tg2 = best.tg,
    r2 = tg2.rect;
  var cx = (r2.x0 + r2.x1) / 2,
    cz = (r2.z0 + r2.z1) / 2;
  var hx = (r2.x1 - r2.x0) / 2 || 1,
    hz = (r2.z1 - r2.z0) / 2 || 1;
  var ux = (x - cx) / hx,
    uz = (z - cz) / hz;
  var ride = targetRide(tg2);
  if (ride && Math.abs(ux) < 0.45 && Math.abs(uz) < 0.45)
    return { tg: tg2, face: -1, ride: ride, top: true };
  var face =
    Math.abs(ux) > Math.abs(uz) ? (ux > 0 ? 1 : 3) : uz > 0 ? 2 : 0;
  return { tg: tg2, face: face, ride: ride, top: false };
}

// ---- rules ------------------------------------------------------------------

export function faceRules() {
  if (!ST.D) return [];
  // A rule only exists while its points do. Undo, a preset or "clear all" take
  // the points away, and the rule goes with them rather than lingering as a
  // badge on a route that no longer obeys it.
  var live = {};
  ST.D.anchors.forEach(function (a) {
    if (a.f) live[a.f] = true;
  });
  var kept = (ST.D.faces || []).filter(function (r) {
    return live[r.id];
  });
  if (kept.length !== (ST.D.faces || []).length) ST.D.faces = kept;
  return kept;
}

export function ruleFor(key) {
  var all = faceRules();
  for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
  return null;
}

function stripRule(pts, id) {
  return pts.filter(function (a) {
    return a.f !== id;
  });
}

// The run-up in front of an access ramp, on one side of the item: out along the
// face normal, longest usable stand-off first. A bed shoved against the outside
// wall has no run-up on that side at all — that is what `ok: false` says, and
// the ride is then driven in and back out the one side that does.
function approachOn(tg, t, f) {
  var n = FACE_N[f],
    base = reachOf(tg, f) + halfRoad() + 6,
    need = halfRoad() + 1,
    best = null;
  for (var k = 10; k >= 0; k--) {
    var d = base + (RIDE_LEAD * k) / 10,
      x = t.x + n.x * d,
      z = t.z + n.z * d;
    if (!indoors(x, z)) continue;
    var c = clearAt(x, z, 0.7);
    if (c >= need) return { x: x, z: z, ok: true, c: c, d: d };
    if (!best || c > best.c) best = { x: x, z: z, ok: false, c: c, d: d };
  }
  return best;
}

// Which way to drive ACROSS an item: the axis with a real run-up on both sides
// beats one with a run-up on only the entry side, and a longer stand-off beats a
// shorter one. This is the ride's version of smartFace().
export function smartRideFace(tg) {
  var t = targetRide(tg);
  if (!t) return -1;
  var best = -1,
    bestS = -1e9;
  for (var f = 0; f < 4; f++) {
    var inn = approachOn(tg, t, f),
      out = approachOn(tg, t, (f + 2) % 4);
    if (!inn) continue;
    var s =
      (inn.ok ? 3 : 0) +
      (out && out.ok ? 2 : 0) +
      clamp(inn.c / (halfRoad() + 1), 0, 1) +
      inn.d / 400;
    if (s > bestS) {
      bestS = s;
      best = f;
    }
  }
  return best;
}

// The points one rule contributes, in the order they are driven.
function rulePoints(tg, rule) {
  if (rule.ride) {
    var t = targetRide(tg);
    if (!t) return null;
    // in on the chosen face, straight across the top, off the far side: one
    // long run is exactly what an access ramp needs at each end, and it is why
    // this seeds the route instead of bending a finished one onto the bed
    var f = rule.face < 0 ? 0 : rule.face;
    var inn = approachOn(tg, t, f),
      out = approachOn(tg, t, (f + 2) % 4);
    if (!inn) {
      inn = out;
      out = null;
    }
    if (!inn) return null;
    var pts = [{ x: inn.x, z: inn.z }, { x: t.x, z: t.z, ride: true }];
    // no floor on the far side: drive up onto it and back off the way you came,
    // rather than laying an exit point inside the wall
    if (out && out.ok) pts.push({ x: out.x, z: out.z });
    return pts;
  }
  var ends = faceEnds(tg, rule.face);
  if (!ends) return null;
  return [
    { x: ends.a.x, z: ends.a.z },
    { x: ends.b.x, z: ends.b.z },
  ];
}

function reachOf(tg, face) {
  var r = tg.rect,
    n = FACE_N[face < 0 ? 0 : face];
  return Math.abs(n.x) * (r.x1 - r.x0) / 2 + Math.abs(n.z) * (r.z1 - r.z0) / 2;
}

// Splice a rule's points into the lap: nearest leg, then whichever way round
// costs less. `flip` is the user overruling that choice, and it is stored on
// the rule rather than baked into the points so it survives the route moving.
function layRule(rule, pts) {
  var tg = findTarget(rule.key);
  if (!tg) return null;
  var made = rulePoints(tg, rule);
  if (!made || made.length < 2) return null;
  var mid = { x: 0, z: 0 };
  made.forEach(function (p) {
    mid.x += p.x / made.length;
    mid.z += p.z / made.length;
  });
  var at = pts.length >= 2 ? insertSpot(pts, mid.x, mid.z).i : pts.length;
  // A ride's order is not up for negotiation: the face the user picked is the
  // face it drives IN on, because that is where the access ramp goes. Only an
  // explicit flip turns it round. A side pass has no such asymmetry, so there
  // the cheaper way round the loop wins.
  if (!rule.ride && pts.length >= 2) {
    var prev = pts[(at - 1 + pts.length) % pts.length],
      next = pts[at % pts.length];
    var head = made[0],
      tail = made[made.length - 1];
    var fwd = Math.hypot(prev.x - head.x, prev.z - head.z) + Math.hypot(tail.x - next.x, tail.z - next.z),
      rev = Math.hypot(prev.x - tail.x, prev.z - tail.z) + Math.hypot(head.x - next.x, head.z - next.z);
    if (rev < fwd) made.reverse();
  }
  if (rule.flip) made.reverse();
  made.forEach(function (p) {
    p.f = rule.id;
  });
  var out = pts.slice();
  out.splice.apply(out, [at, 0].concat(made));
  return { pts: out, line: { ax: made[0].x, az: made[0].z, bx: made[made.length - 1].x, bz: made[made.length - 1].z } };
}

// One target, one rule: picking another face MOVES the rule rather than
// stacking a second pass onto the same sofa.
export function faceApply(tg, face, opts) {
  if (!ST.D || !tg) return false;
  opts = opts || {};
  var prev = ruleFor(tg.key);
  var rule = {
    id: prev ? prev.id : "f" + (ST.D.faceSeq = (ST.D.faceSeq || 0) + 1),
    key: tg.key,
    kind: tg.kind,
    name: tg.name,
    face: face,
    ride: !!opts.ride,
    flip: opts.flip != null ? !!opts.flip : prev ? !!prev.flip : false,
  };
  if (rule.ride && !ST.E.cfg.homeMode) {
    // driving over the furniture IS home mode; asking for it is asking for it
    ST.E.cfg.homeMode = true;
    ST.E.msg(L("מצב בית הופעל 🏠", "Home mode on 🏠"), 1800);
  }
  var laid = layRule(rule, stripRule(ST.D.anchors, rule.id));
  if (!laid) {
    views.tip(L("אין מקום לעבור שם", "No room to pass there"));
    ST.E.beep(240, 0.08, 0.2);
    return false;
  }
  rule.line = laid.line;
  ST.D.faces = faceRules()
    .filter(function (r) {
      return r.id !== rule.id;
    })
    .concat([rule]);
  ST.D.sel = ST.D.seg = -1;
  ST.D.faceSel = rule.key;
  setAnchors(laid.pts, { delay: 0 });
  views.tip(
    (rule.ride ? "⬆ " : FACE_GLYPH[rule.face] + " ") + rule.name + (rule.flip ? " ⇄" : ""),
  );
  ST.E.beep(rule.ride ? 820 : 700, 0.06, 0.2);
  return true;
}

export function faceFlip(key) {
  var rule = ruleFor(key);
  if (!rule) return false;
  var tg = findTarget(key);
  if (!tg) return false;
  return faceApply(tg, rule.face, { ride: rule.ride, flip: !rule.flip });
}

export function faceRemove(key) {
  var rule = ruleFor(key);
  if (!rule) return false;
  ST.D.faces = faceRules().filter(function (r) {
    return r.id !== rule.id;
  });
  ST.D.sel = ST.D.seg = -1;
  setAnchors(stripRule(ST.D.anchors, rule.id), { delay: 0 });
  ST.E.beep(300, 0.07, 0.2);
  return true;
}

// Decide the whole thing: the best face of the best item, for the few biggest
// items near the lap that have no rule yet. This is the button for "you work it
// out" — same scoring, applied in bulk.
export function faceAutoAll(limit) {
  var want = limit || 3,
    made = 0;
  var cands = faceTargets()
    .filter(function (tg) {
      return tg.kind === "item" && !ruleFor(tg.key) && tg.area > 2600;
    })
    .map(function (tg) {
      var c = { x: (tg.rect.x0 + tg.rect.x1) / 2, z: (tg.rect.z0 + tg.rect.z1) / 2 };
      return { tg: tg, d: routeDist(c.x, c.z), area: tg.area };
    })
    .filter(function (c) {
      return c.d < 240;
    })
    .sort(function (a, b) {
      return b.area - a.area;
    });
  for (var i = 0; i < cands.length && made < want; i++) {
    var tg = cands[i].tg,
      // driving over it is the better lap when the mode allows it at all
      ride = !!targetRide(tg) && !!ST.E.cfg.homeMode;
    var face = ride ? smartRideFace(tg) : smartFace(tg);
    if (face < 0) continue;
    if (faceApply(tg, face, { ride: ride })) made++;
    else if (ride && faceApply(tg, Math.max(0, smartFace(tg)), { ride: false })) made++;
  }
  ST.E.msg(
    made
      ? L(made + " מעברים נוספו 🪄", made + " passes added 🪄")
      : L("לא נמצא מה להוסיף", "Nothing worth adding"),
    1800,
  );
  return made;
}

// ---- painting ---------------------------------------------------------------

function drawArrowLine(ctx, w2s, ax, az, bx, bz, col, width, glyph) {
  var a = w2s(ax, az),
    b = w2s(bx, bz);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = col;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  var ang = Math.atan2(b.y - a.y, b.x - a.x);
  // arrow heads along the run: direction has to read without clicking anything
  var len = Math.hypot(b.x - a.x, b.y - a.y),
    steps = clamp(Math.floor(len / 26), 1, 6);
  ctx.fillStyle = col;
  for (var i = 1; i <= steps; i++) {
    var u = i / (steps + 1),
      hx = a.x + (b.x - a.x) * u,
      hy = a.y + (b.y - a.y) * u;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(5.5, 0);
    ctx.lineTo(-3.5, 3.2);
    ctx.lineTo(-3.5, -3.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (glyph) {
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, b.x, b.y - 10);
  }
  ctx.restore();
}

function outline(ctx, w2s, r, col, dash) {
  var a = w2s(r.x0, r.z0),
    b = w2s(r.x1, r.z1);
  ctx.save();
  if (dash) ctx.setLineDash(dash);
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.restore();
}

// Committed rules are drawn in every mode — they are part of what the route
// means. The face picker's own preview only in faces mode.
export function paintFaces(ctx, w2s) {
  if (!ST.D) return;
  var rules = faceRules();
  rules.forEach(function (rule) {
    var tg = findTarget(rule.key);
    if (!tg || !rule.line) return;
    var on = ST.D.faceSel === rule.key;
    outline(ctx, w2s, tg.rect, on ? "rgba(56,245,208,0.85)" : "rgba(56,245,208,0.35)");
    drawArrowLine(
      ctx,
      w2s,
      rule.line.ax,
      rule.line.az,
      rule.line.bx,
      rule.line.bz,
      on ? "rgba(56,245,208,0.95)" : "rgba(45,212,191,0.6)",
      on ? 3 : 2,
      rule.ride ? "⬆" : "",
    );
  });
  if (ST.D.faceSel) {
    var sel = findTarget(ST.D.faceSel);
    var ruled = rules.some(function (r) {
      return r.key === ST.D.faceSel;
    });
    if (sel && !ruled) outline(ctx, w2s, sel.rect, "rgba(250,204,21,0.9)", [5, 4]);
  }
  if (ST.D.mode !== "faces") return;
  var hv = ST.D.faceHover;
  if (!hv) return;
  var tg = hv.tg;
  outline(ctx, w2s, tg.rect, "rgba(255,255,255,0.5)", [4, 4]);
  var smart = ST.D.faceSmart != null ? ST.D.faceSmart : -1;
  for (var f = 0; f < 4; f++) {
    var g = faceGeom(tg, f);
    if (!g) continue;
    var pick = !hv.top && f === hv.face;
    drawArrowLine(
      ctx,
      w2s,
      g.ax,
      g.az,
      g.bx,
      g.bz,
      pick ? "rgba(250,204,21,0.95)" : f === smart ? "rgba(56,189,248,0.5)" : "rgba(148,163,184,0.28)",
      pick ? 3.4 : 1.6,
      f === smart ? "★" : "",
    );
  }
  if (hv.ride) {
    var c = w2s(hv.ride.x, hv.ride.z);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, hv.top ? 13 : 9, 0, Math.PI * 2);
    ctx.fillStyle = hv.top ? "rgba(250,204,21,0.35)" : "rgba(56,189,248,0.18)";
    ctx.fill();
    ctx.strokeStyle = hv.top ? "#facc15" : "rgba(125,211,252,0.7)";
    ctx.lineWidth = hv.top ? 2.4 : 1.4;
    ctx.stroke();
    ctx.fillStyle = hv.top ? "#facc15" : "rgba(125,211,252,0.9)";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⬆", c.x, c.y + 0.5);
    ctx.restore();
  }
}

// ---- map hooks --------------------------------------------------------------

export function facesHover(x, z) {
  if (!ST.D) return;
  var hv = pickTarget(x, z);
  var changed =
    (!hv) !== (!ST.D.faceHover) ||
    (hv && ST.D.faceHover && (hv.tg.key !== ST.D.faceHover.tg.key || hv.face !== ST.D.faceHover.face || hv.top !== ST.D.faceHover.top));
  ST.D.faceHover = hv;
  if (changed) ST.D.faceSmart = hv ? smartFace(hv.tg) : -1;
  if (!hv) {
    views.tip(L("⇄ לחץ על רהיט או חדר", "⇄ click furniture or a room"));
    return;
  }
  var rule = ruleFor(hv.tg.key);
  views.tip(
    hv.tg.name +
      " · " +
      (hv.top ? L("נסיעה מעל ⬆", "drive over ⬆") : FACE_GLYPH[hv.face] + " " + faceName(hv.face)) +
      (rule && rule.face === hv.face && !!rule.ride === !!hv.top
        ? L(" · לחיצה = היפוך", " · click to flip")
        : ""),
  );
  return changed;
}

// A click in faces mode. Returns true when it consumed the press.
export function facesClick(x, z, e) {
  if (!ST.D) return false;
  var hv = pickTarget(x, z);
  if (!hv) {
    ST.D.faceSel = null;
    views.refreshFaces();
    return false;
  }
  var rule = ruleFor(hv.tg.key);
  if (e && e.button === 2) {
    if (rule) faceRemove(hv.tg.key);
    return true;
  }
  // clicking the face a rule already uses flips it — that is the direction
  // control, right where the direction is drawn
  if (rule && rule.face === hv.face && !!rule.ride === !!hv.top) faceFlip(hv.tg.key);
  else if (hv.top) faceApply(hv.tg, Math.max(0, smartRideFace(hv.tg)), { ride: true });
  else faceApply(hv.tg, hv.face, { ride: false });
  views.refreshFaces();
  return true;
}

// Rules restored from prefs describe points that are already in the anchor
// list (they were saved together) — adopt the ones whose points survived.
export function facesAdopt(saved) {
  if (!ST.D) return;
  var live = {};
  ST.D.anchors.forEach(function (a) {
    if (a.f) live[a.f] = true;
  });
  ST.D.faces = (saved || [])
    .filter(function (r) {
      return r && r.id && live[r.id];
    })
    .map(function (r) {
      var tg = findTarget(r.key);
      var pts = ST.D.anchors.filter(function (a) {
        return a.f === r.id;
      });
      return {
        id: r.id,
        key: r.key,
        kind: r.kind,
        name: (tg && tg.name) || r.name,
        face: r.face,
        ride: !!r.ride,
        flip: !!r.flip,
        line: pts.length >= 2
          ? { ax: pts[0].x, az: pts[0].z, bx: pts[pts.length - 1].x, bz: pts[pts.length - 1].z }
          : null,
      };
    });
  var seq = 0;
  ST.D.faces.forEach(function (r) {
    var n = parseInt(String(r.id).slice(1), 10);
    if (fin(n) && n > seq) seq = n;
  });
  ST.D.faceSeq = seq;
}

// Centre the map on a rule and select it — the list's rows are clickable.
export function faceGoto(key) {
  var rule = ruleFor(key);
  var tg = findTarget(key);
  if (!rule || !tg) return;
  ST.D.faceSel = key;
  ST.D.userView = true;
  ST.D.view.cx = (tg.rect.x0 + tg.rect.x1) / 2;
  ST.D.view.cz = (tg.rect.z0 + tg.rect.z1) / 2;
  views.refreshFaces();
  views.draw();
}

// Re-lay every rule against the world as it is now. The flat can change under
// an open editor (a sofa moved, a room edited) and a pass-by that still points
// at where the sofa used to be is worse than no pass-by at all.
export function facesRelay() {
  var rules = faceRules();
  if (!rules.length) return 0;
  var pts = ST.D.anchors,
    done = 0,
    out = [];
  rules.forEach(function (rule) {
    pts = stripRule(pts, rule.id);
  });
  rules.forEach(function (rule) {
    var laid = layRule(rule, pts);
    if (!laid) return;
    pts = laid.pts;
    out.push(Object.assign({}, rule, { line: laid.line }));
    done++;
  });
  ST.D.faces = out;
  setAnchors(pts, { delay: 0 });
  return done;
}

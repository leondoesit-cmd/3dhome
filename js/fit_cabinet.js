/* Fit cabinet: the free run along a wall face, and the cabinet that fills it.

   Pure geometry: no planner state, no DOM, no three. The planner tool
   (js/interaction/fit_cabinet_tool.js) hands in plain wall segments and
   openings and gets back numbers, so Node can test every case.

   Walls:    [{ id, a:{x,z}, b:{x,z}, t, h }]  centre line, thickness, height
   Openings: [{ wall, s, width, sill, height, type }]  s = distance from a

   The frame of a fit is the BACK face: origin on the face at the pick, u along
   the wall, n out of the face into the room. "s" is a distance along u from
   the pick, "q" a distance along n from the face. */

export const FIT_DEFAULTS = Object.freeze({
  depth: 60, // a wardrobe
  reach: 90, // a floor click this far off a wall face still means that wall
  minWidth: 20, // a span shorter than this is a click, not a drag
  maxWidth: 600, // CAB_LIMITS.width.max
  minNiche: 25, // a recess shallower than this is a skirting, not a niche
  maxHeight: 350, // CAB_LIMITS.height.max
});

var PARALLEL = 0.01; // |sin| below which two walls run the same way
var FACE_TOL = 1.5; // cm a neighbouring face may sit off this one and still continue it
var JOIN_TOL = 2; // cm of gap between two collinear walls that still reads as one face

function num(v, d) { v = Number(v); return Number.isFinite(v) ? v : d; }
function r1(v) { return Math.round(v * 10) / 10; }

function segOf(w) {
  if (!w || !w.a || !w.b) return null;
  var dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L = Math.hypot(dx, dz);
  if (!(L > 0.5)) return null;
  return { w: w, L: L, ux: dx / L, uz: dz / L, t: Math.max(0, num(w.t, 10)) };
}

/* The wall a pick belongs to, and which of its faces. `wallId` (from a 3D hit
   or a plan snap) wins outright; otherwise the nearest face within reach whose
   span the pick is beside. */
function backWall(pick, segs, opts) {
  var best = null;
  segs.forEach(function (g) {
    if (opts.wallId != null && String(g.w.id) !== String(opts.wallId)) return;
    var px = pick.x - g.w.a.x, pz = pick.z - g.w.a.z,
      s = px * g.ux + pz * g.uz, side = -px * g.uz + pz * g.ux;
    if (s < -1 || s > g.L + 1) return;
    var gap = Math.abs(side) - g.t / 2;
    if (opts.wallId == null && gap > opts.reach) return;
    if (!best || gap < best.gap) best = { g: g, s: s, side: side, gap: gap };
  });
  return best;
}

function toLocal(f, p) {
  var dx = p.x - f.ox, dz = p.z - f.oz;
  return { s: dx * f.ux + dz * f.uz, q: dx * f.nx + dz * f.nz };
}

function quadLocal(f, g) {
  var hx = -g.uz * g.t / 2, hz = g.ux * g.t / 2, a = g.w.a, b = g.w.b;
  return [
    { x: a.x + hx, z: a.z + hz }, { x: b.x + hx, z: b.z + hz },
    { x: b.x - hx, z: b.z - hz }, { x: a.x - hx, z: a.z - hz },
  ].map(function (p) { return toLocal(f, p); });
}

/* Keep the part of a convex polygon on one side of q = q0 (keep = +1: q >= q0). */
function clipQ(poly, q0, keep) {
  var out = [];
  for (var i = 0; i < poly.length; i++) {
    var p = poly[i], r = poly[(i + 1) % poly.length];
    var pin = (p.q - q0) * keep >= 0, rin = (r.q - q0) * keep >= 0;
    if (pin) out.push(p);
    if (pin !== rin) out.push({ s: p.s + (r.s - p.s) * (q0 - p.q) / (r.q - p.q), q: q0 });
  }
  return out;
}
/* The s-extent of a convex quad within the band qa..qb — the whole volume the
   unit's footprint sweeps, so a slanted return cannot slip between probes. */
function bandExtent(quad, qa, qb) {
  var poly = clipQ(clipQ(quad, qa, 1), qb, -1);
  if (!poly.length) return null;
  var lo = Infinity, hi = -Infinity;
  poly.forEach(function (p) { lo = Math.min(lo, p.s); hi = Math.max(hi, p.s); });
  return { lo: lo, hi: hi };
}

function blocks(o, height) {
  var type = String(o.type || "door");
  if (type === "window") return num(o.sill, 90) < height - 1;
  return true; // doors and passages: nothing stands in a doorway
}

/* The free run along a wall face at a pick.
   opts: { wallId, side:{x,z} (a normal hint), depth, height, reach }
   -> { ok:true, wall, frame, left, right, width, limits:{left,right}, nicheDepth }
   or { ok:false, reason: "no-wall" | "opening" | "too-narrow" } */
export function findWallGap(pick, walls, openings, opts) {
  opts = Object.assign({}, FIT_DEFAULTS, opts || {});
  if (!pick || !Number.isFinite(pick.x) || !Number.isFinite(pick.z)) return { ok: false, reason: "no-wall" };
  var segs = (walls || []).map(segOf).filter(Boolean);
  var hit = backWall(pick, segs, opts);
  if (!hit) return { ok: false, reason: "no-wall" };
  var g = hit.g, nx = -g.uz, nz = g.ux, sign = hit.side < 0 ? -1 : 1;
  if (Math.abs(hit.side) < 0.5 && opts.side) sign = opts.side.x * nx + opts.side.z * nz < 0 ? -1 : 1;
  nx *= sign; nz *= sign;
  var s0 = Math.max(0, Math.min(g.L, hit.s));
  var f = {
    ox: g.w.a.x + g.ux * s0 + nx * g.t / 2, oz: g.w.a.z + g.uz * s0 + nz * g.t / 2,
    ux: g.ux, uz: g.uz, nx: nx, nz: nz,
  };
  var depth = Math.max(1, num(opts.depth, FIT_DEFAULTS.depth));
  var height = num(opts.height, 240);

  /* The face behind the cabinet: this wall plus any collinear wall whose face
     lies in the same plane and continues it (a long wall split where a
     partition meets it on the far side is still one wall to stand against). */
  var face = [], others = [];
  segs.forEach(function (o) {
    var cross = o.ux * f.uz - o.uz * f.ux;
    if (Math.abs(cross) < PARALLEL) {
      var la = toLocal(f, o.w.a), lb = toLocal(f, o.w.b);
      if (Math.abs(la.q + o.t / 2) < FACE_TOL) {
        face.push({ g: o, lo: Math.min(la.s, lb.s), hi: Math.max(la.s, lb.s) });
        return;
      }
    }
    others.push(o);
  });
  face.sort(function (a, b) { return a.lo - b.lo; });
  var back = { lo: -s0, hi: g.L - s0 };
  for (var grew = true; grew;) {
    grew = false;
    face.forEach(function (seg) {
      if (seg.lo < back.lo && seg.hi >= back.lo - JOIN_TOL) { back.lo = seg.lo; grew = true; }
      if (seg.hi > back.hi && seg.lo <= back.hi + JOIN_TOL) { back.hi = seg.hi; grew = true; }
    });
  }
  var left = back.lo, right = back.hi, limits = { left: "end", right: "end" }, sideQ = {};

  // walls that stand anywhere in the band the unit's footprint will occupy
  others.forEach(function (o) {
    var quad = quadLocal(f, o), maxQ = -Infinity;
    quad.forEach(function (p) { maxQ = Math.max(maxQ, p.q); });
    var c = bandExtent(quad, 0.5, depth - 0.5);
    if (!c || (c.lo <= 0 && c.hi >= 0)) return; // the pick itself is inside: forgive it
    if (c.hi < 0 && c.hi > left) { left = c.hi; limits.left = "wall"; sideQ.left = maxQ; }
    if (c.lo > 0 && c.lo < right) { right = c.lo; limits.right = "wall"; sideQ.right = maxQ; }
  });

  // openings in the face: a doorway stops the run, a window does when the unit is taller than its sill
  var faceIds = {};
  face.forEach(function (seg) { faceIds[String(seg.g.w.id)] = seg.g; });
  for (var i = 0; i < (openings || []).length; i++) {
    var o = openings[i], og = o && faceIds[String(o.wall)];
    if (!og || !blocks(o, height)) continue;
    var c = toLocal(f, { x: og.w.a.x + og.ux * num(o.s, 0), z: og.w.a.z + og.uz * num(o.s, 0) }).s;
    var half = Math.max(0, num(o.width, 0)) / 2, lo = c - half, hi = c + half;
    if (lo < 0 && hi > 0) return { ok: false, reason: "opening", wall: g.w.id };
    if (hi <= 0 && hi > left) { left = hi; limits.left = "opening"; delete sideQ.left; }
    if (lo >= 0 && lo < right) { right = lo; limits.right = "opening"; delete sideQ.right; }
  }

  var width = right - left;
  if (!(width >= opts.minWidth)) return { ok: false, reason: "too-narrow", wall: g.w.id, width: Math.max(0, width) };
  var nicheDepth = limits.left === "wall" && limits.right === "wall" ? Math.min(sideQ.left, sideQ.right) : null;
  return {
    ok: true, wall: g.w.id, frame: f, left: left, right: right, width: width,
    limits: limits, nicheDepth: nicheDepth, wallHeight: num(g.w.h, null),
  };
}

/* World angle whose FRONT (local +Z) points along (dx,dz) — js/item_orient.js's
   convention. Exact, not snapped to the nearest 90°: the unit is positioned by
   the true wall normal, and a rounded angle would swing a corner of a 4 m unit
   into a wall that is half a degree off square. Only float dust is removed. */
export function rotFacing(dx, dz) {
  var r = ((Math.atan2(-dx, dz) * 180) / Math.PI % 360 + 360) % 360;
  r = Math.round(r * 1e4) / 1e4;
  return r >= 360 ? r - 360 : r;
}

/* The cabinet for a gap: { x, z, rot, w, d, h, s1, s2 } in plan units.
   opts: { from, to } a dragged span in gap s-units (omitted = fill the gap),
         depth, height, maxWidth, minWidth, minNiche */
export function fitCabinetBox(gap, opts) {
  opts = Object.assign({}, FIT_DEFAULTS, opts || {});
  if (!gap || !gap.ok) return null;
  var s1 = gap.left, s2 = gap.right, dragged = 0;
  if (Number.isFinite(opts.from) && Number.isFinite(opts.to)) {
    var a = Math.max(gap.left, Math.min(gap.right, Math.min(opts.from, opts.to)));
    var b = Math.max(gap.left, Math.min(gap.right, Math.max(opts.from, opts.to)));
    if (b - a >= opts.minWidth) { s1 = a; s2 = b; dragged = opts.to >= opts.from ? 1 : -1; }
  }
  if (s2 - s1 > opts.maxWidth) {
    if (dragged > 0) s2 = s1 + opts.maxWidth; // a long drag: one max-width unit from where it started
    else if (dragged < 0) s1 = s2 - opts.maxWidth;
    else {
      // a click on a run too long for one unit: the max-width unit centred on the pick, inside the run
      s1 = Math.max(gap.left, Math.min(gap.right - opts.maxWidth, -opts.maxWidth / 2));
      s2 = s1 + opts.maxWidth;
    }
  }
  var d = Math.max(1, num(opts.depth, FIT_DEFAULTS.depth));
  // a real niche shallower than the unit: be exactly as deep as the niche, flush with it
  if (gap.nicheDepth != null && gap.nicheDepth >= opts.minNiche && gap.nicheDepth < d) d = Math.round(gap.nicheDepth * 2) / 2;
  var h = Math.min(opts.maxHeight, Math.max(1, num(opts.height, 240)));
  var f = gap.frame, mid = (s1 + s2) / 2;
  return {
    x: r1(f.ox + f.ux * mid + f.nx * d / 2),
    z: r1(f.oz + f.uz * mid + f.nz * d / 2),
    rot: rotFacing(f.nx, f.nz),
    w: r1(s2 - s1), d: r1(d), h: r1(h), s1: s1, s2: s2,
  };
}

/* The box's footprint corners (for previews): back-left, back-right, front-right, front-left. */
export function fitFootprint(gap, box) {
  if (!gap || !box) return [];
  var f = gap.frame;
  function at(s, q) { return { x: f.ox + f.ux * s + f.nx * q, z: f.oz + f.uz * s + f.nz * q }; }
  return [at(box.s1, 0), at(box.s2, 0), at(box.s2, box.d), at(box.s1, box.d)];
}

/* Where a point lands along the gap's face, in its s-units. */
export function gapCoord(gap, p) {
  if (!gap || !p) return NaN;
  return toLocal(gap.frame, p).s;
}

/* ---- an area drawn by the user (floor marquee or a rectangle on a wall) --- */

export const AREA_DEFAULTS = Object.freeze({
  pull: 15, // cm: a floor box edge this close to a wall face is pulled flush to it
  floorTol: 10, // cm: a wall box this close to the floor / ceiling reaches it
  depth: 60, // a floor-standing unit on a wall
  hungDepth: 35, // a hung unit
  minWidth: 30, // CAB_LIMITS.width.min (STD.minCol)
  maxWidth: 600, // CAB_LIMITS.width.max
  minDepth: 20, maxDepth: 120, // CAB_LIMITS.depth
  minHeight: 30, maxHeight: 350, // CAB_LIMITS.height
  minNiche: 25,
  ceiling: 240, // height when no wall says otherwise
});

var EPS = 0.05;

function swapSQ(poly) { return poly.map(function (p) { return { s: p.q, q: p.s }; }); }

/* Floor box frame: U along `axis`, V = U turned +90° (same handedness as a wall
   frame's u -> n). Points as { s: U, q: V } so clipQ / bandExtent apply. */
function uvBasis(axis) {
  var ux = 1, uz = 0;
  if (axis && Number.isFinite(axis.x) && Number.isFinite(axis.z) && Math.hypot(axis.x, axis.z) > 1e-9) {
    var L = Math.hypot(axis.x, axis.z); ux = axis.x / L; uz = axis.z / L;
  }
  return {
    ux: ux, uz: uz, vx: -uz, vz: ux,
    uv: function (p) { return { s: p.x * ux + p.z * uz, q: p.x * -uz + p.z * ux }; },
    world: function (U, V) { return { x: U * ux - V * uz, z: U * uz + V * ux }; },
  };
}

// keep the box on the start's side of every wall that cuts into it
function clipAreaByWalls(box, segs, B, start) {
  for (var pass = 0; pass < 3; pass++) {
    var changed = false;
    segs.forEach(function (g) {
      var quad = [
        { x: g.w.a.x - g.uz * g.t / 2, z: g.w.a.z + g.ux * g.t / 2 }, { x: g.w.b.x - g.uz * g.t / 2, z: g.w.b.z + g.ux * g.t / 2 },
        { x: g.w.b.x + g.uz * g.t / 2, z: g.w.b.z - g.ux * g.t / 2 }, { x: g.w.a.x + g.uz * g.t / 2, z: g.w.a.z - g.ux * g.t / 2 },
      ].map(B.uv);
      var ext = bandExtent(quad, box.v0 + EPS, box.v1 - EPS);
      if (!ext || ext.hi <= box.u0 + EPS || ext.lo >= box.u1 - EPS) return;
      // which side of this wall the drag started on (the box centre when the start is inside it)
      var nU = -(g.ux * B.vx + g.uz * B.vz), nV = g.ux * B.ux + g.uz * B.uz; // wall normal in UV
      var a = B.uv(g.w.a), side = (start.s - a.s) * nU + (start.q - a.q) * nV;
      if (Math.abs(side) <= g.t / 2) side = ((box.u0 + box.u1) / 2 - a.s) * nU + ((box.v0 + box.v1) / 2 - a.q) * nV;
      var sg = side < 0 ? -1 : 1;
      if (Math.abs(nU) >= Math.abs(nV)) {
        if (nU * sg > 0) box.u0 = Math.max(box.u0, ext.hi); else box.u1 = Math.min(box.u1, ext.lo);
      } else {
        var ev = bandExtent(swapSQ(quad), box.u0 + EPS, box.u1 - EPS);
        if (!ev) return;
        if (nV * sg > 0) box.v0 = Math.max(box.v0, ev.hi); else box.v1 = Math.min(box.v1, ev.lo);
      }
      changed = true;
    });
    if (!changed || box.u1 <= box.u0 || box.v1 <= box.v0) break;
  }
  return box;
}

/* Pull the edges near a wall face flush to it, and list the faces the box
   then touches: [{ g, edge:"u0"|"u1"|"v0"|"v1", length }]. Only walls square
   to the box take part. */
function pullAreaToWalls(box, segs, B, pull) {
  var faces = [];
  segs.forEach(function (g) {
    var dU = g.ux * B.ux + g.uz * B.uz, dV = g.ux * B.vx + g.uz * B.vz;
    var a = B.uv(g.w.a), b = B.uv(g.w.b);
    if (Math.abs(dU) < PARALLEL) { // runs along V: a face at constant U
      var cu = (a.s + b.s) / 2, inside = (box.u0 + box.u1) / 2 > cu;
      faces.push({ g: g, edge: inside ? "u0" : "u1", at: cu + (inside ? 1 : -1) * g.t / 2, lo: Math.min(a.q, b.q), hi: Math.max(a.q, b.q), other: "v" });
    } else if (Math.abs(dV) < PARALLEL) { // runs along U: a face at constant V
      var cv = (a.q + b.q) / 2, above = (box.v0 + box.v1) / 2 > cv;
      faces.push({ g: g, edge: above ? "v0" : "v1", at: cv + (above ? 1 : -1) * g.t / 2, lo: Math.min(a.s, b.s), hi: Math.max(a.s, b.s), other: "u" });
    }
  });
  function overlap(f) {
    var lo = f.other === "v" ? box.v0 : box.u0, hi = f.other === "v" ? box.v1 : box.u1;
    return Math.min(hi, f.hi) - Math.max(lo, f.lo);
  }
  faces.forEach(function (f) {
    if (overlap(f) > EPS && Math.abs(box[f.edge] - f.at) <= pull) box[f.edge] = f.at;
  });
  return faces.filter(function (f) { return Math.abs(box[f.edge] - f.at) < 0.01 && overlap(f) > 0.5; })
    .map(function (f) { return { g: f.g, edge: f.edge, length: overlap(f) }; });
}

var EDGE_N = { u0: [1, 0], u1: [-1, 0], v0: [0, 1], v1: [0, -1] }; // into the box, in (U, V)

function fitFloorArea(rect, walls, o) {
  var p0 = rect && (rect.a || rect[0]), p1 = rect && (rect.b || rect[1]);
  if (!p0 || !p1 || ![p0.x, p0.z, p1.x, p1.z].every(Number.isFinite)) return { ok: false, reason: "no-area" };
  var B = uvBasis(o.axis), A = B.uv(p0), C = B.uv(p1), segs = (walls || []).map(segOf).filter(Boolean);
  var box = { u0: Math.min(A.s, C.s), u1: Math.max(A.s, C.s), v0: Math.min(A.q, C.q), v1: Math.max(A.q, C.q) };
  clipAreaByWalls(box, segs, B, A);
  if (box.u1 <= box.u0 || box.v1 <= box.v0) return { ok: false, reason: "too-narrow" };
  var contacts = pullAreaToWalls(box, segs, B, o.pull);
  var back = null;
  contacts.forEach(function (c) { if (!back || c.length > back.length + 1e-6) back = c; });
  var nUV;
  if (back) nUV = EDGE_N[back.edge];
  else {
    // no wall: the front faces `facing` (the camera, or the drag's start side)
    var fc = o.facing && Number.isFinite(o.facing.x) && Number.isFinite(o.facing.z) ? B.uv(o.facing)
      : { s: A.s - (box.u0 + box.u1) / 2, q: A.q - (box.v0 + box.v1) / 2 };
    /* The longer side is the width: the front is the long-side normal nearer
       the hint (a tie: the drag-start side). Only a near-square box lets the
       hint alone choose the axis. n = the way the front looks. */
    var du = box.u1 - box.u0, dv = box.v1 - box.v0, ms = (box.u0 + box.u1) / 2, mq = (box.v0 + box.v1) / 2;
    function sgn(h, start) { return Math.abs(h) > 1e-9 ? (h < 0 ? -1 : 1) : (start < 0 ? -1 : 1); }
    if (Math.abs(du - dv) <= 0.1 * Math.max(du, dv))
      nUV = Math.abs(fc.s) >= Math.abs(fc.q) ? [sgn(fc.s, A.s - ms), 0] : [0, sgn(fc.q, A.q - mq)];
    else nUV = du > dv ? [0, sgn(fc.q, A.q - mq)] : [sgn(fc.s, A.s - ms), 0];
  }
  var alongU = nUV[1] !== 0; // the back runs along U
  var w = alongU ? box.u1 - box.u0 : box.v1 - box.v0, d = alongU ? box.v1 - box.v0 : box.u1 - box.u0;
  // over the limits: keep the back, and the end the drag started from
  if (d > o.maxDepth) {
    if (nUV[0] > 0) box.u1 = box.u0 + o.maxDepth; else if (nUV[0] < 0) box.u0 = box.u1 - o.maxDepth;
    else if (nUV[1] > 0) box.v1 = box.v0 + o.maxDepth; else box.v0 = box.v1 - o.maxDepth;
    d = o.maxDepth;
  }
  if (w > o.maxWidth) {
    if (alongU) { if (A.s <= (box.u0 + box.u1) / 2) box.u1 = box.u0 + o.maxWidth; else box.u0 = box.u1 - o.maxWidth; }
    else if (A.q <= (box.v0 + box.v1) / 2) box.v1 = box.v0 + o.maxWidth; else box.v0 = box.v1 - o.maxWidth;
    w = o.maxWidth;
  }
  if (w < o.minWidth) return { ok: false, reason: "too-narrow", width: Math.max(0, w) };
  if (d < o.minDepth) return { ok: false, reason: "too-shallow", depth: Math.max(0, d) };
  var wallH = back ? num(back.g.w.h, null) : null;
  var h = Math.min(o.maxHeight, Math.max(1, num(o.height, wallH != null ? wallH : o.ceiling)));
  if (h < o.minHeight) return { ok: false, reason: "too-short" };
  var c = B.world((box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2);
  var nW = B.world(nUV[0], nUV[1]); // unit, into the room from the back
  var backMid = { x: c.x - nW.x * d / 2, z: c.z - nW.z * d / 2 };
  var frame = { ox: backMid.x, oz: backMid.z, ux: nW.z, uz: -nW.x, nx: nW.x, nz: nW.z };
  return {
    ok: true, mount: "floor", x: r1(c.x), z: r1(c.z), w: r1(w), d: r1(d), h: r1(h), rot: rotFacing(nW.x, nW.z), elev: 0,
    wall: back ? back.g.w.id : null, frame: frame, s1: -w / 2, s2: w / 2,
    flush: contacts.map(function (k) { return k.g.w.id; }),
  };
}

function openingHead(o) {
  var type = String(o.type || "door"), sill = num(o.sill, type === "window" ? 90 : 0);
  return Number.isFinite(Number(o.height)) ? sill + Number(o.height) : Infinity;
}

function fitWallArea(rect, walls, openings, o) {
  var segs = (walls || []).map(segOf).filter(Boolean);
  var g = rect && segs.find(function (k) { return String(k.w.id) === String(rect.wallId); });
  if (!g) return { ok: false, reason: "no-wall" };
  var nx = -g.uz, nz = g.ux, sign = 1;
  if (rect.side && rect.side.x * nx + rect.side.z * nz < 0) sign = -1;
  else if (!rect.side && rect.pick && (rect.pick.x - g.w.a.x) * nx + (rect.pick.z - g.w.a.z) * nz < 0) sign = -1;
  nx *= sign; nz *= sign;
  var sBase = rect.pick ? Math.max(0, Math.min(g.L, (rect.pick.x - g.w.a.x) * g.ux + (rect.pick.z - g.w.a.z) * g.uz)) : 0;
  var H = num(g.w.h, o.ceiling), y0 = num(rect.y0, 0), y1 = num(rect.y1, 0);
  var lo = Math.max(0, Math.min(y0, y1)), hi = Math.min(H, Math.max(y0, y1));
  var onFloor = lo <= o.floorTol, toTop = hi >= H - o.floorTol;
  var elev = onFloor ? 0 : lo, top = toTop ? H : hi;
  var mount = onFloor && toTop ? "full" : onFloor ? "floor" : "hung";
  var h = Math.min(o.maxHeight, top - elev);
  if (!(h >= o.minHeight)) return { ok: false, reason: "too-short", height: Math.max(0, h) };
  top = elev + h;
  var s0 = num(rect.s0, 0), s1 = num(rect.s1, 0);
  if (Math.abs(s1 - s0) < o.minWidth) return { ok: false, reason: "too-narrow", width: Math.abs(s1 - s0) };
  // measure the run from the middle of the rectangle, in wall s-units from a
  var mid = Math.max(0, Math.min(g.L, sBase + (s0 + s1) / 2)), shift = mid - sBase;
  var pick = { x: g.w.a.x + g.ux * mid + nx * (g.t / 2 + 1), z: g.w.a.z + g.uz * mid + nz * (g.t / 2 + 1) };
  // only openings level with the unit stop it (a hung unit clears a window below it)
  var level = (openings || []).filter(function (op) {
    if (!op) return false;
    var sill = num(op.sill, String(op.type || "door") === "window" ? 90 : 0);
    return sill < top - 1 && openingHead(op) > elev + 1;
  });
  var depth = mount === "hung" ? o.hungDepth : o.depth;
  var gap = findWallGap(pick, walls, level, {
    wallId: g.w.id, side: { x: nx, z: nz }, depth: depth, height: top, minWidth: o.minWidth,
  });
  if (!gap.ok) return { ok: false, reason: gap.reason, wall: g.w.id };
  var from = Math.max(gap.left, Math.min(gap.right, s0 - shift)), to = Math.max(gap.left, Math.min(gap.right, s1 - shift));
  if (Math.abs(to - from) < o.minWidth) return { ok: false, reason: "too-narrow", width: Math.abs(to - from) };
  var box = fitCabinetBox(gap, {
    from: from, to: to, depth: depth, height: h, maxWidth: o.maxWidth, minWidth: o.minWidth,
    minNiche: o.minNiche, maxHeight: o.maxHeight,
  });
  return {
    ok: true, mount: mount, x: box.x, z: box.z, w: box.w, d: box.d, h: box.h, rot: box.rot, elev: elev,
    wall: gap.wall, frame: gap.frame, s1: box.s1, s2: box.s2, gap: gap,
  };
}

/* A cabinet for an area the user drew.
   kind "floor": rect = { a:{x,z}, b:{x,z} } (or [a, b]) opposite plan corners, a = where
     the drag started; opts.axis {x,z} turns the box (default plan-axis aligned);
     opts.facing {x,z} = where the front looks when no wall is near (default: toward a).
     The box is clipped so it never crosses a wall (it stays on a's side), its edges
     within `pull` of a square wall face go flush, the back goes to the face with the
     longest contact. Height: opts.height, else the back wall's h, else opts.ceiling.
   kind "wall": rect = { wallId, side:{x,z} (face normal hint), pick?:{x,z}, s0, s1, y0, y1 };
     s0/s1 in gapCoord units of findWallGap(pick) (origin = pick projected on the wall;
     no pick: s measured from the wall's `a` end), y0/y1 heights above the floor.
     Bottom within floorTol of the floor stands on it, top within floorTol of the wall
     top reaches it; otherwise hung at elev = bottom. Depth: opts.depth (60), or
     opts.hungDepth (35) hung; a shallower niche wins (fitCabinetBox's rule).
   -> { ok:true, mount:"floor"|"full"|"hung", x, z, w, d, h, rot, elev, wall (id|null),
        frame, s1, s2, flush?:[ids], gap? }  — x,z the footprint centre, rot as fitCabinetBox;
        frame/s1/s2 make it a `gap` for fitFootprint(result, result).
   or  { ok:false, reason: "no-area"|"no-wall"|"opening"|"too-narrow"|"too-shallow"|"too-short" } */
export function fitAreaBox(kind, rect, walls, openings, opts) {
  var o = Object.assign({}, AREA_DEFAULTS, opts || {});
  if (kind === "floor") return fitFloorArea(rect, walls, o);
  if (kind === "wall") return fitWallArea(rect, walls, openings, o);
  return { ok: false, reason: "no-area" };
}

/* ---- the docked designer (js/ui_cabinet_dock.js) ------------------------ */

/* Landscape screens dock to the side; portrait ones (a phone, a tablet held
   upright) to the bottom, so the room keeps the full width above. */
export function dockSide(width, height) {
  return width >= 900 && width >= height * 1.15 ? "right" : "bottom";
}

/* Orbit parameters that put `it` square in front of the camera and fit it into
   the uncovered rectangle `vis` of a pane `pane` (both {left,top,width,height}
   in CSS px). Pure: exported for tests. */
export function frameCabinetOrbit(it, pane, vis, fovDeg) {
  var r = ((Number(it.rot) || 0) * Math.PI) / 180;
  var fx = -Math.sin(r), fz = Math.cos(r); // the front (local +Z)
  var theta = Math.atan2(fz, fx), phi = 1.36; // a touch above eye level, looking slightly down
  var w = Number(it.w) || 100, h = Number(it.h) || 200, d = Number(it.d) || 60;
  var elev = Number(it.elev) || 0;
  var tanH = Math.tan((((fovDeg || 50) * Math.PI) / 180) / 2);
  var Hp = Math.max(1, pane.height), margin = 1.3;
  var dw = (w * margin) / (2 * tanH * (Math.max(1, vis.width) / Hp));
  var dh = (h * margin) / (2 * tanH * (Math.max(1, vis.height) / Hp));
  var radius = Math.max(dw, dh) + d / 2;
  // shift the target so the unit sits in the middle of what the designer leaves visible
  var wpp = (2 * radius * tanH) / Hp; // world cm per pane pixel at the target
  var dx = vis.left + vis.width / 2 - (pane.left + pane.width / 2);
  var dy = vis.top + vis.height / 2 - (pane.top + pane.height / 2);
  var rx = Math.sin(theta), rz = -Math.cos(theta); // camera right, horizontal
  return {
    theta: theta, phi: phi, radius: radius,
    target: {
      x: it.x - rx * dx * wpp,
      y: elev + h / 2 + dy * wpp,
      z: it.z - rz * dx * wpp,
    },
  };
}

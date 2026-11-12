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

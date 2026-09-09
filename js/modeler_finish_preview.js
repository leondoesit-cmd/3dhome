/* Approximate live preview for the three finish features — Fillet, Chamfer and
   Shell.
 *
 * These are the only features whose parameter choice is purely visual (what
 * radius? which edges? how thick?) and, at the same time, the slowest to
 * regenerate exactly: the OpenCascade path can take a second or more per
 * keystroke.  The feature form therefore drives this module for an immediate,
 * cheap, mesh-space answer while the exact solid is still being built; the
 * badge over the form says the picture is approximate, and the exact result
 * replaces it the moment the kernel returns.
 *
 * Everything here is pure arithmetic on plain objects — no Three.js, no editor
 * state — so it can be unit tested under Node and can never block a frame.
 * The 2D corner operators (filletVertex / chamferVertex / insetLoop) live here
 * too: they used to sit in js/modeler.js, and the sketch corner tools still
 * call them from there through this module's exports.  There is one
 * implementation, not two.
 */

function num(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNum(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function vec(p) { return { x: num(p && p.x, 0), y: num(p && p.y, 0), z: num(p && p.z, 0) }; }

function vlen(v) { return Math.hypot(v.x, v.y, v.z); }

function vnorm(v) { var L = vlen(v) || 1; return { x: v.x / L, y: v.y / L, z: v.z / L }; }

function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

function clonePts(pts) { return (pts || []).map(function (q) { return { u: num(q.u, 0), v: num(q.v, 0) }; }); }

/* ---- 2D corner operators (moved out of js/modeler.js, behaviour unchanged) ---- */

export function pointInPoly(uv, pts) {
  var inside = false;
  for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
    if (pts[a].v > uv.v !== pts[b].v > uv.v &&
      uv.u < ((pts[b].u - pts[a].u) * (uv.v - pts[a].v)) / (pts[b].v - pts[a].v) + pts[a].u) inside = !inside;
  }
  return inside;
}

// Fillet: replace polygon corner i with an arc of radius r (SolidWorks-style corner round).
export function filletVertex(pts, i, r) {
  var n = pts.length;
  var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
  var a1u = p0.u - p1.u, a1v = p0.v - p1.v, a2u = p2.u - p1.u, a2v = p2.v - p1.v;
  var l1 = Math.hypot(a1u, a1v), l2 = Math.hypot(a2u, a2v);
  if (l1 < 0.01 || l2 < 0.01) return false;
  a1u /= l1; a1v /= l1; a2u /= l2; a2v /= l2;
  var ang = Math.acos(clampNum(a1u * a2u + a1v * a2v, -1, 1));
  if (ang < 0.05 || ang > Math.PI - 0.05) return false;
  var d = r / Math.tan(ang / 2);
  var dm = Math.min(l1, l2) * 0.49;
  if (d > dm) { d = dm; r = d * Math.tan(ang / 2); }
  var t1 = { u: p1.u + a1u * d, v: p1.v + a1v * d }, t2 = { u: p1.u + a2u * d, v: p1.v + a2v * d };
  var bu = a1u + a2u, bv = a1v + a2v, bl = Math.hypot(bu, bv);
  var cen = { u: p1.u + (bu / bl) * (r / Math.sin(ang / 2)), v: p1.v + (bv / bl) * (r / Math.sin(ang / 2)) };
  var s1 = Math.atan2(t1.v - cen.v, t1.u - cen.u), s2 = Math.atan2(t2.v - cen.v, t2.u - cen.u);
  var sweep = s2 - s1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  var steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  var arc = [];
  for (var k = 0; k <= steps; k++) {
    var aa = s1 + (sweep * k) / steps;
    arc.push({ u: cen.u + Math.cos(aa) * r, v: cen.v + Math.sin(aa) * r });
  }
  pts.splice.apply(pts, [i, 1].concat(arc));
  return true;
}

// Chamfer: replace polygon corner i with a straight cut `d` cm along both edges.
export function chamferVertex(pts, i, d) {
  var n = pts.length;
  var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
  var l1 = Math.hypot(p0.u - p1.u, p0.v - p1.v), l2 = Math.hypot(p2.u - p1.u, p2.v - p1.v);
  if (l1 < 0.01 || l2 < 0.01) return false;
  d = Math.min(d, l1 * 0.49, l2 * 0.49);
  var t1 = { u: p1.u + ((p0.u - p1.u) / l1) * d, v: p1.v + ((p0.v - p1.v) / l1) * d };
  var t2 = { u: p1.u + ((p2.u - p1.u) / l2) * d, v: p1.v + ((p2.v - p1.v) / l2) * d };
  pts.splice(i, 1, t1, t2);
  return true;
}

// Inset a polygon loop inward by t (miter offset). Interior side is detected per
// edge by point-in-polygon probing, so winding order doesn't matter.
export function insetLoop(pts, t) {
  var n = pts.length, offs = [];
  for (var i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    var du = b.u - a.u, dv = b.v - a.v, L = Math.hypot(du, dv);
    if (L < 0.01) return null;
    var nu = -dv / L, nv = du / L;
    var mid = { u: (a.u + b.u) / 2 + nu * 0.1, v: (a.v + b.v) / 2 + nv * 0.1 };
    if (!pointInPoly(mid, pts)) { nu = -nu; nv = -nv; }
    offs.push({ au: a.u + nu * t, av: a.v + nv * t, du: du, dv: dv });
  }
  var out = [];
  for (var k = 0; k < n; k++) {
    var e0 = offs[(k - 1 + n) % n], e1 = offs[k];
    // intersect offset lines e0 and e1
    var den = e0.du * e1.dv - e0.dv * e1.du;
    if (Math.abs(den) < 1e-6) { out.push({ u: e1.au, v: e1.av }); continue; }
    var s = ((e1.au - e0.au) * e1.dv - (e1.av - e0.av) * e1.du) / den;
    out.push({ u: e0.au + e0.du * s, v: e0.av + e0.dv * s });
  }
  // sanity: every inset vertex must land inside the original loop
  for (var m = 0; m < n; m++) if (!pointInPoly(out[m], pts)) return null;
  return out;
}

/* ---- the profile a finish preview is drawn in ---- */

function rectPts(u0, u1, v0, v1) {
  return [{ u: u0, v: v0 }, { u: u1, v: v0 }, { u: u1, v: v1 }, { u: u0, v: v1 }];
}

export function axisUnit(axis) {
  if (axis === "x") return { x: 1, y: 0, z: 0 };
  if (axis === "z") return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 1, z: 0 };
}

/* The sweep the body can be described by: an extrusion profile (box / ext) or
   an axial half-section revolved about Y (cyl).  A body this returns null for
   simply gets no approximate preview — the caller falls back to waiting for
   the exact result. */
export function finishProfileForPart(part) {
  if (!part) return null;
  if (part.kind === "box") {
    var x0 = Math.min(num(part.x0, 0), num(part.x1, 0)), x1 = Math.max(num(part.x0, 0), num(part.x1, 0));
    var y0 = Math.min(num(part.y0, 0), num(part.y1, 0)), y1 = Math.max(num(part.y0, 0), num(part.y1, 0));
    var z0 = Math.min(num(part.z0, 0), num(part.z1, 0)), z1 = Math.max(num(part.z0, 0), num(part.z1, 0));
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || z1 - z0 < 1e-6) return null;
    return { mode: "ext", axis: "y", frame: null, from: y0, to: y1, pts: rectPts(x0, x1, z0, z1), holes: [] };
  }
  if (part.kind === "ext") {
    if (!Array.isArray(part.pts) || part.pts.length < 3) return null;
    if (!Number.isFinite(Number(part.from)) || !Number.isFinite(Number(part.to))) return null;
    return {
      mode: "ext",
      axis: part.frame ? "frame" : (part.axis || "y"),
      frame: part.frame || null,
      from: Number(part.from),
      to: Number(part.to),
      pts: clonePts(part.pts),
      holes: (part.holes || []).slice(),
    };
  }
  if (part.kind === "cyl") {
    var r = num(part.r, 0), r2 = part.r2 == null ? r : num(part.r2, r), h = num(part.h, 0);
    // a cone has no straight section corner to round in this representation
    if (!(r > 0) || !(h > 0) || Math.abs(r2 - r) > 1e-6) return null;
    var base = num(part.y, 0);
    return {
      mode: "rev", x: num(part.x, 0), z: num(part.z, 0), r: r, y0: base, y1: base + h,
      pts: [{ u: 0, v: base }, { u: r, v: base }, { u: r, v: base + h }, { u: 0, v: base + h }],
    };
  }
  return null;
}

/* World endpoints of a straight topology edge, from whichever descriptor shape
   the pick produced.  Circular edges deliberately return null here — they are
   matched by their origin instead. */
export function edgeSegment(descriptor) {
  if (!descriptor) return null;
  var ends = descriptor.endpoints;
  if (descriptor.curve !== "circle" && Array.isArray(ends) && ends.length >= 2) {
    return { a: vec(ends[0]), b: vec(ends[1]) };
  }
  if (descriptor.curve === "line" && descriptor.origin && descriptor.axis && Number.isFinite(Number(descriptor.measure))) {
    var o = vec(descriptor.origin), ax = vnorm(vec(descriptor.axis)), half = Number(descriptor.measure) / 2;
    return {
      a: { x: o.x - ax.x * half, y: o.y - ax.y * half, z: o.z - ax.z * half },
      b: { x: o.x + ax.x * half, y: o.y + ax.y * half, z: o.z + ax.z * half },
    };
  }
  return null;
}

function profileAxisVector(profile) {
  return profile.frame ? vnorm(vec(profile.frame.normal)) : axisUnit(profile.axis);
}

/* World point -> (u,v) in the extrusion profile, the inverse of the mapping
   buildExt() applies when it lays the shape down. */
export function projectToProfile(profile, point) {
  var p = vec(point);
  if (profile.frame) {
    var o = vec(profile.frame.origin);
    var d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z };
    return { u: vdot(d, vec(profile.frame.xAxis)), v: vdot(d, vec(profile.frame.yAxis)) };
  }
  if (profile.axis === "z") return { u: p.x, v: p.y };
  if (profile.axis === "x") return { u: p.z, v: p.y };
  return { u: p.x, v: p.z };
}

function profileTolerance(pts) {
  var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  pts.forEach(function (q) {
    u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u);
    v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v);
  });
  var diagonal = Math.hypot(u1 - u0, v1 - v0);
  return Math.max(0.25, diagonal * 0.05);
}

/* Which profile corners the picked edges stand for.  An edge that does not run
   along the sweep direction (a top or bottom rim of an extrusion, say) has no
   corner in this representation and is skipped — the approximation shows the
   corners it can and says so. */
export function profileCornersForEdges(profile, targets) {
  var axis = profileAxisVector(profile), tol = profileTolerance(profile.pts), out = [];
  (targets || []).forEach(function (reference) {
    if (!reference || reference.kind !== "edge") return;
    var segment = edgeSegment(reference.descriptor);
    if (!segment) return;
    var dir = { x: segment.b.x - segment.a.x, y: segment.b.y - segment.a.y, z: segment.b.z - segment.a.z };
    if (vlen(dir) < 1e-6) return;
    if (Math.abs(vdot(vnorm(dir), axis)) < 0.985) return;
    var mid = projectToProfile(profile, { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2, z: (segment.a.z + segment.b.z) / 2 });
    var best = -1, bestDistance = Infinity;
    profile.pts.forEach(function (q, index) {
      var d = Math.hypot(q.u - mid.u, q.v - mid.v);
      if (d < bestDistance) { bestDistance = d; best = index; }
    });
    if (best < 0 || bestDistance > tol) return;
    if (out.indexOf(best) < 0) out.push(best);
  });
  return out;
}

/* Which end of the sweep a picked planar face closes off: "hi", "lo" or null
   for a side wall. */
export function capEndForFace(profile, reference) {
  if (!reference || reference.kind !== "face") return null;
  var descriptor = reference.descriptor || {};
  var normal = descriptor.normal;
  if (!normal) return null;
  var axis = profileAxisVector(profile), along = vdot(vnorm(vec(normal)), axis);
  if (Math.abs(along) < 0.9) return null;
  var reversed = Number(profile.to) < Number(profile.from);
  return (along > 0) !== reversed ? "hi" : "lo";
}

function roundPreviewShapes(part, profile, type, amount, targets) {
  if (profile.mode === "rev") {
    var corners = revRimCorners(profile, targets);
    if (!corners.length) return [];
    var pts = clonePts(profile.pts), applied = 0;
    corners.sort(function (a, b) { return b - a; }).forEach(function (index) {
      if (type === "fillet" ? filletVertex(pts, index, amount) : chamferVertex(pts, index, amount)) applied++;
    });
    if (!applied) return [];
    return [{ kind: "rev", x: profile.x, z: profile.z, seg: 48, angle: 360, pts: pts }];
  }
  var indices = profileCornersForEdges(profile, targets);
  if (!indices.length) return [];
  var points = clonePts(profile.pts), done = 0;
  // descending, so a splice never shifts a corner still to be cut
  indices.sort(function (a, b) { return b - a; }).forEach(function (index) {
    if (type === "fillet" ? filletVertex(points, index, amount) : chamferVertex(points, index, amount)) done++;
  });
  if (!done) return [];
  return [extShape(profile, points, profile.holes)];
}

/* A cylinder's rim: matched by the height its circle sits at, since a circular
   edge has no direction to compare against the sweep. */
function revRimCorners(profile, targets) {
  var tol = Math.max(0.25, (profile.y1 - profile.y0) * 0.05), out = [];
  (targets || []).forEach(function (reference) {
    if (!reference) return;
    var descriptor = reference.descriptor || {};
    var origin = descriptor.origin || descriptor.center;
    if (!origin) return;
    if (reference.kind === "face" && Math.abs(num(descriptor.normal && descriptor.normal.y, 0)) < 0.9) return;
    var y = num(origin.y, NaN);
    if (!Number.isFinite(y)) return;
    var index = Math.abs(y - profile.y0) <= tol ? 1 : Math.abs(y - profile.y1) <= tol ? 2 : -1;
    if (index > 0 && out.indexOf(index) < 0) out.push(index);
  });
  return out;
}

function extShape(profile, pts, holes) {
  var shape = { kind: "ext", axis: profile.axis, from: profile.from, to: profile.to, pts: pts, holes: (holes || []).slice() };
  if (profile.frame) shape.frame = profile.frame;
  return shape;
}

function shellPreviewShapes(part, profile, thickness, targets) {
  if (profile.mode === "rev") {
    var r = profile.r, y0 = profile.y0, y1 = profile.y1;
    if (!(thickness < r * 0.9) || !(thickness < (y1 - y0) * 0.9)) return [];
    var openTop = false, openBottom = false;
    (targets || []).forEach(function (reference) {
      if (!reference || reference.kind !== "face") return;
      var descriptor = reference.descriptor || {};
      var origin = descriptor.origin || descriptor.center;
      if (!origin || Math.abs(num(descriptor.normal && descriptor.normal.y, 0)) < 0.9) return;
      if (Math.abs(num(origin.y, NaN) - y1) <= Math.abs(num(origin.y, NaN) - y0)) openTop = true; else openBottom = true;
    });
    var section;
    if (openTop && !openBottom) {
      section = [{ u: 0, v: y0 }, { u: r, v: y0 }, { u: r, v: y1 }, { u: r - thickness, v: y1 }, { u: r - thickness, v: y0 + thickness }, { u: 0, v: y0 + thickness }];
    } else if (openBottom && !openTop) {
      section = [{ u: 0, v: y1 }, { u: r, v: y1 }, { u: r, v: y0 }, { u: r - thickness, v: y0 }, { u: r - thickness, v: y1 - thickness }, { u: 0, v: y1 - thickness }];
    } else {
      section = [{ u: r - thickness, v: y0 }, { u: r, v: y0 }, { u: r, v: y1 }, { u: r - thickness, v: y1 }];
    }
    return [{ kind: "rev", x: profile.x, z: profile.z, seg: 48, angle: 360, pts: section }];
  }
  var inner = insetLoop(clonePts(profile.pts), thickness);
  if (!inner) return [];
  var shapes = [extShape(profile, clonePts(profile.pts), (profile.holes || []).concat([inner]))];
  /* Shell removes the picked faces and keeps the rest.  When exactly one cap
     of the sweep is removed the other one survives as a floor, and drawing it
     is what makes the preview read as a box with an open top rather than as a
     tube. */
  var caps = {};
  (targets || []).forEach(function (reference) {
    var end = capEndForFace(profile, reference);
    if (end) caps[end] = true;
  });
  var lo = Math.min(profile.from, profile.to), hi = Math.max(profile.from, profile.to);
  if (hi - lo > thickness * 2) {
    if (caps.hi && !caps.lo) shapes.push(extShape({ ...profile, from: lo, to: lo + thickness }, clonePts(profile.pts), profile.holes));
    else if (caps.lo && !caps.hi) shapes.push(extShape({ ...profile, from: hi - thickness, to: hi }, clonePts(profile.pts), profile.holes));
  }
  return shapes;
}

/* The whole point of the module: mesh-path bodies that stand in for the exact
   finish result while it is being computed.  Returns [] whenever the selection
   or the body cannot be approximated cheaply — never throws, never loops long
   enough to matter on a frame. */
export function approximateFinishPreviewShapes(options) {
  options = options || {};
  var part = options.part, type = options.type, amount = Number(options.amount);
  if (!part || !Number.isFinite(amount) || amount <= 0) return [];
  if (!["fillet", "chamfer", "shell"].includes(type)) return [];
  var profile = finishProfileForPart(part);
  if (!profile) return [];
  var targets = options.targets || [];
  if (!targets.length) return [];
  if (type === "shell") return shellPreviewShapes(part, profile, amount, targets);
  return roundPreviewShapes(part, profile, type, amount, targets);
}

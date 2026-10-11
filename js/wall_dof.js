/* Degrees of freedom and conflict attribution for the plan's dimension set.
   ---------------------------------------------------------------------------
   wall_constraints.js solves by relaxation: sweep the list, move one named
   side per constraint, stop when nothing moves. That is the right ENGINE for a
   floor plan — it keeps the "locks win, joints break instead of walls
   deforming" bargain that constraint_engine.js strikes, which a global
   least-squares solve would quietly average away. What it cannot do is answer
   the two questions every real CAD sketcher answers:

     "is this drawing fully defined yet?"          -> degrees of freedom
     "WHICH of these dimensions are fighting?"     -> conflict attribution

   Relaxation returns `unresolved: 3` and leaves the user to guess. So the
   diagnosis is done here, separately from the solve, against the same maths a
   real solver would use: build the Jacobian of the constraint residuals with
   respect to the corner coordinates, and take its rank. Freedoms are
   variables minus rank. The rank routine itself is borrowed from
   sketch_solver.js rather than rewritten — it already learned that rows must
   be equilibrated before pivoting, or the same shape ranks differently at
   40 cm and at 150 cm.

   TWO THINGS THIS DELIBERATELY DOES NOT COUNT.
   1. Wall length/angle auto-locks (constraint_engine.js). They are not
      equations; they are a rule about which edit wins, and they release
      themselves rather than hold. Counting them would report a plan as fully
      defined when the user has stated almost nothing.
   2. Wall thickness and height. Nothing constrains them, so they are not
      freedoms this system can close.
   The number therefore means: how many ways the CORNERS can still move
   without violating a dimension the user actually wrote down — plus the
   position of any OPENING that carries a dimension of its own. Undimensioned
   doors and windows are excluded on purpose: counting the free slide of every
   one of them would put "fully defined" out of reach of any real drawing and
   bury the number that matters.

   COST. Rank is O(residuals · variables²) and the Jacobian is built by finite
   differences, so this is emphatically not a per-frame call. sketch_solver.js
   learned the same lesson the expensive way (74 ms of a 77 ms solve was its
   diagnostics block); the rule here is the same — diagnose when an edit has
   settled and the panel is open, never while a corner is being dragged. */
import { S, fin } from "./state.js";
import { wallById, wallGeom, usedNodes, openFaceDist, wallClearLength } from "./geometry.js";
import {
  wallCons, anchorPos, anchorNode, pinnedNodes, openingById, openingPos, openingCornerCut,
} from "./wall_constraints.js";
import { rankOf } from "./sketch_solver.js";

/* How far a coordinate is nudged to measure a derivative. Big enough that the
   residual moves out of floating-point noise on a plan measured in
   centimetres, small enough that a 300 cm wall's angle is still linear. */
const EPS = 1e-4;
/* A residual this size is a genuine violation rather than solver dust. Matches
   the CON_TOL_* the inspector already colours by, scaled for the mixed units:
   angular residuals below are expressed as sines, not degrees. */
const LIVE = 1e-3;

function norm180(d) {
  d = ((d % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/* Every equation a constraint imposes, signed, zero exactly when satisfied.
   This is the part that cannot come from conError(): a coincident constraint
   removes TWO freedoms, not one, and a single scalar error would under-count
   the rank and report phantom freedoms forever. Angular relations are
   expressed as sines/cross products rather than degrees so that one row is not
   a thousand times larger than its neighbours before equilibration. */
export function conResiduals(c) {
  if (!c || c.off || c.report) return []; // suppressed and reference dims constrain nothing
  var pa, pb, w, r, gw, gr, p, g;
  switch (c.type) {
    /* A pin contributes NO equation, on purpose. It is modelled by striking
       its corner's two coordinates out of the variable list instead (see
       variables()), which is the same freedom removed. Counting it both ways
       made a fully pinned plan report as over-constrained: eight pin
       equations against zero remaining variables. */
    case "fixed":
      return [];

    case "coincident":
      pa = anchorPos(c.a); pb = anchorPos(c.b);
      return pa && pb ? [pb.x - pa.x, pb.z - pa.z] : [];

    case "symmetric": {
      pa = anchorPos(c.a); pb = anchorPos(c.b);
      var ax = axisOf(c.axis);
      if (!pa || !pb || !ax) return [];
      var src = c.hold === "b" ? pb : pa, dst = c.hold === "b" ? pa : pb,
        m = mirror(src, ax);
      return [dst.x - m.x, dst.z - m.z];
    }

    case "dist":
      pa = anchorPos(c.a); pb = anchorPos(c.b);
      return pa && pb ? [Math.hypot(pb.x - pa.x, pb.z - pa.z) - c.value] : [];

    case "alignX":
      pa = anchorPos(c.a); pb = anchorPos(c.b);
      return pa && pb ? [pb.x - pa.x] : [];
    case "alignZ":
      pa = anchorPos(c.a); pb = anchorPos(c.b);
      return pa && pb ? [pb.z - pa.z] : [];
    case "axisDistX":
      pa = anchorPos(c.a); pb = anchorPos(c.b);
      return pa && pb ? [pb.x - pa.x - c.value] : [];
    case "axisDistZ":
      pa = anchorPos(c.a); pb = anchorPos(c.b);
      return pa && pb ? [pb.z - pa.z - c.value] : [];

    case "midpoint":
      r = wallById(c.ref); p = anchorPos(c.point);
      if (!r || !p) return [];
      g = wallGeom(r);
      return [p.x - (g.a.x + g.b.x) / 2, p.z - (g.a.z + g.b.z) / 2];

    case "pointOnLine":
      r = wallById(c.ref); p = anchorPos(c.point);
      if (!r || !p) return [];
      g = wallGeom(r);
      return [(p.x - g.a.x) * -g.uz + (p.z - g.a.z) * g.ux];

    case "pointWallDist":
      r = wallById(c.ref); p = anchorPos(c.point);
      if (!r || !p) return [];
      g = wallGeom(r);
      return [(p.x - g.a.x) * -g.uz + (p.z - g.a.z) * g.ux -
        (c.refFace === 1 || c.refFace === -1 ? c.refFace : 0) * (Number(r.thickness) || 0) / 2 -
        c.value];

    case "angle": {
      var ni = anchorNode(c.joint), a1 = wallById(c.w1), a2 = wallById(c.w2);
      if (ni == null || !a1 || !a2) return [];
      return [Math.sin((norm180(jointNow(ni, a1, a2) - c.value) * Math.PI) / 180)];
    }
    case "equalAngle": {
      var sr = sectorNow(c.referenceAngle), sd = sectorNow(c.drivenAngle);
      if (sr == null || sd == null) return [];
      return [Math.sin((norm180(sd - sr) * Math.PI) / 180)];
    }
    case "wallAngle":
      w = wallById(c.wall); r = wallById(c.ref);
      if (!w || !r) return [];
      gw = wallGeom(w); gr = wallGeom(r);
      return [Math.sin(gw.ang - gr.ang - (c.value * Math.PI) / 180)];

    case "parallel":
      w = wallById(c.wall); r = wallById(c.ref);
      if (!w || !r) return [];
      gw = wallGeom(w); gr = wallGeom(r);
      return [gw.ux * gr.uz - gw.uz * gr.ux];
    case "perpendicular":
      w = wallById(c.wall); r = wallById(c.ref);
      if (!w || !r) return [];
      gw = wallGeom(w); gr = wallGeom(r);
      return [gw.ux * gr.ux + gw.uz * gr.uz];
    case "collinear":
      /* Two equations: same direction AND no perpendicular offset. Collinear
         is the one relation that removes a rotation and a translation. */
      w = wallById(c.wall); r = wallById(c.ref);
      if (!w || !r) return [];
      gw = wallGeom(w); gr = wallGeom(r);
      return [
        gw.ux * gr.uz - gw.uz * gr.ux,
        (gw.a.x - gr.a.x) * -gr.uz + (gw.a.z - gr.a.z) * gr.ux,
      ];
    case "horizontal":
      w = wallById(c.wall);
      return w ? [wallGeom(w).uz] : [];
    case "vertical":
      w = wallById(c.wall);
      return w ? [wallGeom(w).ux] : [];

    case "equalLength":
      w = wallById(c.wall); r = wallById(c.ref);
      return w && r ? [wallGeom(w).L - wallGeom(r).L] : [];
    case "equalLengthSet": {
      var ls = (c.walls || []).map(wallById).filter(Boolean).map(function (q) { return wallGeom(q).L; });
      return ls.slice(1).map(function (L) { return L - ls[0]; });
    }

    case "offset": {
      w = wallById(c.wall); r = wallById(c.ref);
      if (!w || !r) return [];
      gw = wallGeom(w); gr = wallGeom(r);
      var mx = (gw.a.x + gw.b.x) / 2, mz = (gw.a.z + gw.b.z) / 2,
        wf = c.wallFace === 1 || c.wallFace === -1 ? c.wallFace : 0,
        rf = c.refFace === 1 || c.refFace === -1 ? c.refFace : 0;
      return [
        gw.ux * gr.uz - gw.uz * gr.ux,
        (mx - gr.a.x) * -gr.uz + (mz - gr.a.z) * gr.ux +
          wf * (Number(w.thickness) || 0) / 2 - rf * (Number(r.thickness) || 0) / 2 - c.value,
      ];
    }
    case "equalSpacing": {
      var rows = (c.walls || []).map(wallById).filter(Boolean).map(function (q) {
        var qg = wallGeom(q);
        return { x: (qg.a.x + qg.b.x) / 2, z: (qg.a.z + qg.b.z) / 2 };
      });
      if (rows.length < 3) return [];
      var base = wallGeom(wallById(c.walls[0]));
      if (!base) return [];
      var nx = -base.uz, nz = base.ux;
      var pos = rows.map(function (q) { return (q.x - base.a.x) * nx + (q.z - base.a.z) * nz; })
        .sort(function (m, n) { return m - n; });
      var out = [];
      for (var i = 1; i < pos.length - 1; i++)
        out.push((pos[i + 1] - pos[i]) - (pos[i] - pos[i - 1]));
      return out;
    }
    /* Openings. Their variable is a scalar along a wall, not a point, so the
       residuals are in that same units-of-`s` space. */
    case "openCentre": {
      var oc = openingById(c.opening), ocw = oc && wallById(oc.wall);
      return ocw ? [openFaceDist(ocw, oc.s) - wallClearLength(ocw) / 2] : [];
    }
    case "openDist": {
      var od = openingById(c.opening), odw = od && wallById(od.wall);
      if (!odw) return [];
      if (c.cornerNode != null) {
        var corner = S.nodes[c.cornerNode], odp = openingPos(od);
        if (corner && odp) {
          var liveCut = openingCornerCut(c);
          var measured = Math.hypot(odp.x - corner.x, odp.z - corner.z) -
            (liveCut == null ? -(Number(c.cornerOffset) || 0) : liveCut);
          return [measured - c.value];
        }
      }
      var face = openFaceDist(odw, od.s), clear = wallClearLength(odw);
      return [(c.end === "b" ? clear - face : face) - c.value];
    }
    case "openAlign": {
      var oa = openingPos(openingById(c.a)), ob = openingPos(openingById(c.b));
      if (!oa || !ob) return [];
      return [c.axis === "x" ? ob.x - oa.x : ob.z - oa.z];
    }
    case "openSpacing": {
      var os = (c.openings || []).map(openingById).filter(Boolean)
        .map(function (q) { return q.s; }).sort(function (m, n) { return m - n; });
      if (os.length < 3) return [];
      var rows = [];
      for (var oi = 1; oi < os.length - 1; oi++)
        rows.push((os[oi + 1] - os[oi]) - (os[oi] - os[oi - 1]));
      return rows;
    }

    default:
      return [];
  }
}

function jointNow(ni, w1, w2) {
  var A = S.nodes[ni];
  if (!A) return 0;
  function bearing(w) {
    var far = w.a === ni ? w.b : w.a, B = S.nodes[far];
    return B ? Math.atan2(B.z - A.z, B.x - A.x) : 0;
  }
  return ((bearing(w2) - bearing(w1)) * 180) / Math.PI;
}
function sectorNow(sec) {
  if (!sec) return null;
  var ni = anchorNode(sec.joint), w1 = wallById(sec.w1), w2 = wallById(sec.w2);
  return ni == null || !w1 || !w2 ? null : jointNow(ni, w1, w2);
}
function axisOf(axis) {
  var w = axis && wallById(axis.id);
  if (!w) return null;
  var g = wallGeom(w);
  if (!fin(g.L) || g.L <= 0) return null;
  return axis.k === "perp"
    ? { px: (g.a.x + g.b.x) / 2, pz: (g.a.z + g.b.z) / 2, ux: -g.uz, uz: g.ux }
    : { px: g.a.x, pz: g.a.z, ux: g.ux, uz: g.uz };
}
function mirror(p, ax) {
  var dx = p.x - ax.px, dz = p.z - ax.pz,
    along = dx * ax.ux + dz * ax.uz;
  return {
    x: ax.px + along * ax.ux - (dx - along * ax.ux),
    z: ax.pz + along * ax.uz - (dz - along * ax.uz),
  };
}

/* The free coordinates: two per structural corner, minus the pinned ones.
   A pinned corner is not a variable — that is exactly what pinning means, and
   leaving it in would report freedoms the user has already closed. */
function variables() {
  var pins = pinnedNodes(), used = usedNodes(), out = [];
  Object.keys(used).forEach(function (k) {
    var ni = +k;
    if (pins[ni] || !S.nodes[ni]) return;
    out.push({ ni: ni, k: "x" }, { ni: ni, k: "z" });
  });
  /* An opening's position along its wall is a freedom too — but only for the
     openings the user has actually said something about. Counting the `s` of
     every door and window in the plan would put the "fully defined" state out
     of reach of any real drawing and drown the number that matters: how far
     the STRUCTURE is from being pinned down. So the scope is: the corners,
     plus any opening carrying a dimension of its own. */
  dimensionedOpenings().forEach(function (o) {
    out.push({ opening: o, k: "s" });
  });
  return out;
}

/* Which openings are mentioned by at least one live constraint.

   Collected into a Set of the RESOLVED OPENINGS, not a plain object keyed by
   id. Object keys are coerced to strings, and opening ids come from uid() as
   numbers — so `ids[123]` read back as "123" and openingById("123") matched
   nothing, silently leaving every opening out of the variable list. The
   symptom was subtle in exactly the wrong way: the constraint still solved,
   but the freedom count read one too low because the equation was counted and
   the variable it closed was not. */
function dimensionedOpenings() {
  var seen = new Set();
  function add(id) {
    var o = id == null ? null : openingById(id);
    if (o) seen.add(o);
  }
  wallCons().forEach(function (c) {
    if (c.off || c.report) return;
    add(c.opening);
    if (c.type === "openAlign") { add(c.a); add(c.b); }
    if (c.type === "openSpacing") (c.openings || []).forEach(add);
  });
  return Array.from(seen);
}

/* All residuals, plus which constraint each row came from, so a conflicting
   row can be named rather than merely counted. */
function residuals(tags) {
  var out = [];
  wallCons().forEach(function (c) {
    conResiduals(c).forEach(function (v) {
      out.push(fin(v) ? v : 0);
      if (tags) tags.push(c);
    });
  });
  return out;
}

/* Central differences. Analytic derivatives for twenty-odd constraint types
   would be twenty-odd more places for a sign error to hide, and rank only
   needs the derivative to be right to a few digits. */
function jacobian(vars, rowCount) {
  var J = [];
  for (var i = 0; i < rowCount; i++) J.push(new Array(vars.length).fill(0));
  vars.forEach(function (v, j) {
    // a variable is either a corner coordinate or an opening's position
    var n = v.opening || S.nodes[v.ni], keep = n[v.k];
    n[v.k] = keep + EPS;
    var plus = residuals();
    n[v.k] = keep - EPS;
    var minus = residuals();
    n[v.k] = keep;
    for (var i = 0; i < rowCount; i++)
      J[i][j] = ((plus[i] || 0) - (minus[i] || 0)) / (2 * EPS);
  });
  return J;
}

/* The report.
     degreesOfFreedom - how many ways the corners can still move
     status           - the four states a sketcher reports
     conflicts        - ids of constraints whose own equations are violated
     redundant        - true when there are more independent equations than
                        freedoms: the drawing may LOOK right and the next
                        dimension will still fight an existing one
   Returns a zeroed report rather than throwing when there is nothing to
   diagnose, so callers can render it unconditionally. */
export function planDof() {
  var list = wallCons().filter(function (c) { return !c.off && !c.report; });
  var vars = variables();
  var tags = [], res = residuals(tags);
  /* Nothing stated at all: every coordinate is free. Guarded separately
     because a Jacobian with no rows has no rank to take. A plan with no
     VARIABLES but some equations is not short-circuited here — that is the
     over-constrained case, and rankOf handles the empty-column matrix. */
  if (!res.length)
    return {
      degreesOfFreedom: vars.length,
      variableCount: vars.length,
      residualCount: 0,
      rank: 0,
      conflicts: [],
      redundant: false,
      constraintCount: list.length,
      status: vars.length ? "under-constrained" : "fully-constrained",
    };

  var J = jacobian(vars, res.length),
    rank = rankOf(J),
    dof = Math.max(0, vars.length - rank);

  var conflicts = [];
  res.forEach(function (v, i) {
    var c = tags[i];
    if (c && Math.abs(v) > LIVE && conflicts.indexOf(c.id) === -1) conflicts.push(c.id);
  });

  /* More independent equations than the geometry has freedoms. Reported even
     when everything currently reads as satisfied, because that is precisely
     the state in which the NEXT edit produces an inexplicable fight. */
  var redundant = rank < res.length && !conflicts.length;

  return {
    degreesOfFreedom: dof,
    variableCount: vars.length,
    residualCount: res.length,
    rank: rank,
    conflicts: conflicts,
    redundant: redundant,
    constraintCount: list.length,
    status: conflicts.length ? "conflicting"
      : dof > 0 ? "under-constrained"
        : redundant ? "over-constrained" : "fully-constrained",
  };
}

// Parametric 2D sketch solver.
//
// Sketch schema:
//   { points:      [{id, x, y, fixed?}],
//     entities:    [{id, type:"line",    a, b}
//                  |{id, type:"circle",  c, r}
//                  |{id, type:"arc",     c, a, b}
//                  |{id, type:"ellipse", c, rx, ry, rot}],
//     constraints: [{id, type, ...}] }
//
// Circles carry a scalar radius `r` which the solver drives as its own
// variable, so a radius/diameter dimension is a first-class degree of freedom
// rather than a post-hoc rescale. Arcs are a centre plus two rim points; their
// radius is implied by the endpoints, so an arc contributes an equal-radius
// residual keeping both ends on the same circle. An ellipse works the same way
// with three scalars — both semi-axes and the tilt — so "major 40, minor 25,
// rotated 30°" is three dimensions the solver drives, not a frozen shape.
//
// Slots and regular polygons are deliberately NOT entity kinds. A slot is two
// lines and two arcs held by tangency and equal radius; a polygon is n chords
// of a construction circle held equal. Building them out of the primitives the
// solver already understands means every existing constraint, dimension, trim
// and pattern keeps working on them, and dragging one corner still behaves —
// which a bespoke "slot" record with its own solve path never quite does.
//
// The solver uses damped Gauss-Newton with a numerical Jacobian. That is slower
// than a specialised symbolic solver, but it is stable for interactive sketches,
// supports mixed geometric constraints, and gives us one residual/rank model for
// under-, fully- and over-constrained diagnostics.

import { analyzeSketchProfiles } from "./sketch_profiles.js";
import { gaussNewtonStep, normOf, numericJacobian, rankOf as matrixRank } from "./core/least_squares.js";

const EPS = 1e-6;
const DEG = Math.PI / 180;

function pointMap(sketch) {
  const map = new Map();
  (sketch.points || []).forEach((p) => map.set(p.id, p));
  return map;
}

function entityMap(sketch) {
  const map = new Map();
  (sketch.entities || []).forEach((e) => map.set(e.id, e));
  return map;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ---- entity readers (exported: the canvas and the dimension layer read the
   same geometry the residuals do, so what you see is what is solved) ---- */

export function lineData(entity, points) {
  if (!entity || entity.type !== "line") return null;
  const a = points.get ? points.get(entity.a) : null, b = points.get ? points.get(entity.b) : null;
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  return { a, b, dx, dy, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

export function circleData(entity, points) {
  if (!entity) return null;
  if (entity.type === "circle") {
    const c = points.get(entity.c ?? entity.center);
    if (!c) return null;
    return { center: c, radius: Math.abs(Number(entity.r) || 0), entity };
  }
  if (entity.type === "arc") {
    const c = points.get(entity.c ?? entity.center), a = points.get(entity.a), b = points.get(entity.b);
    if (!c || !a || !b) return null;
    const radius = Math.hypot(a.x - c.x, a.y - c.y);
    return {
      center: c, radius, entity, a, b,
      start: Math.atan2(a.y - c.y, a.x - c.x),
      end: Math.atan2(b.y - c.y, b.x - c.x),
    };
  }
  return null;
}

export function ellipseData(entity, points) {
  if (!entity || entity.type !== "ellipse") return null;
  const c = points.get ? points.get(entity.c ?? entity.center) : null;
  if (!c) return null;
  return {
    center: c, entity,
    rx: Math.abs(Number(entity.rx) || 0),
    ry: Math.abs(Number(entity.ry) || 0),
    rot: Number(entity.rot) || 0,
  };
}

/* Anything with a centre, whatever kind it is. Constraints that only care about
   "where is this curve" — concentric, the pattern rotation — read through this
   so adding a kind does not mean revisiting each of them. */
export function centreOf(entity, points) {
  const o = circleData(entity, points) || ellipseData(entity, points);
  return o ? o.center : null;
}

/* Every point an entity owns — used for hit-testing, dragging and deletion. */
export function entityPoints(sketch, entity) {
  if (!entity) return [];
  const ids = entity.type === "line" ? [entity.a, entity.b]
    : entity.type === "circle" || entity.type === "ellipse" ? [entity.c ?? entity.center]
    : entity.type === "arc" ? [entity.c ?? entity.center, entity.a, entity.b]
    : entity.type === "spline" ? [entity.a, entity.h1, entity.h2, entity.b]
    : [];
  return ids.map((id) => sketchPoint(sketch, id)).filter(Boolean);
}

/* ---- residuals ---- */

// One constraint can produce several residuals; `push` tags each with the
// constraint that owns it so conflicts can be reported per constraint.
const tangencyModes = new WeakMap();

function residuals(sketch, tags) {
  const points = pointMap(sketch), entities = entityMap(sketch), out = [];
  const line = (id) => lineData(entities.get(id), points);
  const circ = (id) => circleData(entities.get(id), points);
  const ell = (id) => ellipseData(entities.get(id), points);
  const pt = (id) => points.get(id) || null;
  let owner = null;
  const push = (...vals) => {
    for (const v of vals) { out.push(v); if (tags) tags.push(owner); }
  };

  for (const c of sketch.constraints || []) {
    if (c.suppressed || c.driven) continue;
    owner = c;
    const value = Number(c.value || 0);
    switch (c.type) {
      case "coincident": {
        const a = pt(c.a), b = pt(c.b);
        if (a && b) push(a.x - b.x, a.y - b.y);
        break;
      }
      case "horizontal": case "vertical": {
        if (c.entity) {
          const l = line(c.entity);
          if (l) push(c.type === "horizontal" ? l.dy : l.dx);
        } else {
          const a = pt(c.a), b = pt(c.b);
          if (a && b) push(c.type === "horizontal" ? a.y - b.y : a.x - b.x);
        }
        break;
      }
      case "distance": {
        if(c.patternTranslation){
          for(const pair of c.shapes || []){const a=ell(pair[0]),b=ell(pair[1]);if(a&&b)push(b.rx-a.rx,b.ry-a.ry,wrapAngle(b.rot-a.rot));}
          for(const pair of c.pairs || []){const a=pt(pair[0]),b=pt(pair[1]);if(a&&b)push(b.x-a.x-(c.direction==="v"?0:value),b.y-a.y-(c.direction==="v"?value:0));}
          break;
        }
        if (c.entity) {
          const l = line(c.entity);
          if (l) push(l.length - value);
        } else {
          const a = pt(c.a), b = pt(c.b);
          if (a && b) push(Math.hypot(b.x - a.x, b.y - a.y) - value);
        }
        break;
      }
      case "angle": {
        const l = line(c.entity);
        if (l) { push(wrapAngle(l.angle - value * DEG) * Math.max(1, l.length)); break; }
        // two-line angle: the included angle between a and b
        const la = line(c.a), lb = line(c.b);
        if (la && lb) push(wrapAngle(lb.angle - la.angle - value * DEG) * Math.max(1, la.length));
        break;
      }
      case "parallel": case "perpendicular": {
        const a = line(c.a), b = line(c.b);
        if (a && b && a.length > EPS && b.length > EPS) {
          const cross = (a.dx * b.dy - a.dy * b.dx) / (a.length * b.length);
          const dot = (a.dx * b.dx + a.dy * b.dy) / (a.length * b.length);
          push(c.type === "parallel" ? cross : dot);
        }
        break;
      }
      case "equal": {
        const a = line(c.a), b = line(c.b);
        if (a && b) { push(a.length - b.length); break; }
        const ea = ell(c.a), eb = ell(c.b);
        if (ea && eb) { push(ea.rx - eb.rx, ea.ry - eb.ry); break; }
        const ca = circ(c.a), cb = circ(c.b);
        if (ca && cb) push(ca.radius - cb.radius);
        break;
      }
      case "midpoint": {
        const p = pt(c.point), l = line(c.entity);
        if (p && l) push(p.x - (l.a.x + l.b.x) / 2, p.y - (l.a.y + l.b.y) / 2);
        break;
      }
      case "intersection": {
        const p = pt(c.point);
        if (!p) break;
        if (c.edgeA) {
          if (c.x != null && c.y != null) push(p.x - Number(c.x), p.y - Number(c.y));
          break;
        }
        const la = line(c.a), lb = line(c.b);
        if (la && lb && la.length > EPS && lb.length > EPS) {
          const denom = la.dx * lb.dy - la.dy * lb.dx;
          if (Math.abs(denom) > EPS) {
            const t = ((lb.a.x - la.a.x) * lb.dy - (lb.a.y - la.a.y) * lb.dx) / denom;
            push(p.x - (la.a.x + t * la.dx), p.y - (la.a.y + t * la.dy));
          }
        }
        break;
      }
      case "pointOnLine": {
        const p = pt(c.point), l = line(c.entity);
        if (p && l && l.length > EPS) push(((p.x - l.a.x) * l.dy - (p.y - l.a.y) * l.dx) / l.length);
        break;
      }
      case "pointOnCircle": {
        const p = pt(c.point), o = circ(c.entity);
        if (p && o) { push(Math.hypot(p.x - o.center.x, p.y - o.center.y) - o.radius); break; }
        const e = ell(c.entity);
        if (p && e && e.rx > EPS && e.ry > EPS) {
          // implicit ellipse equation in the curve's own frame, scaled back to a
          // length so it sits on the same footing as every other residual
          const dx = p.x - e.center.x, dy = p.y - e.center.y;
          const cos = Math.cos(e.rot), sin = Math.sin(e.rot);
          const u = (dx * cos + dy * sin) / e.rx, v = (-dx * sin + dy * cos) / e.ry;
          push((Math.hypot(u, v) - 1) * (e.rx + e.ry) / 2);
        }
        break;
      }
      case "radius": case "diameter": {
        const o = circ(c.entity);
        const half = c.type === "diameter" ? value / 2 : value;
        if (o) { push(o.radius - half); break; }
        // On an ellipse a radius dimension names one semi-axis: `axis:"minor"`
        // drives ry, anything else drives rx.
        const e = ell(c.entity);
        if (e) push((c.axis === "minor" ? e.ry : e.rx) - half);
        break;
      }
      case "concentric": {
        const a = centreOf(entities.get(c.a), points), b = centreOf(entities.get(c.b), points);
        if (a && b) push(a.x - b.x, a.y - b.y);
        break;
      }
      case "tangent": {
        if(c.splineEnd){
          const e=entities.get(c.a),l=line(c.b),endpoint=pt(e?.[c.splineEnd]),handle=pt(e?.[c.splineEnd==='a'?'h1':'h2']),join=pt(entities.get(c.b)?.[c.lineEnd]);
          if(endpoint&&handle&&join&&l){const dx=handle.x-endpoint.x,dy=handle.y-endpoint.y;push(endpoint.x-join.x,endpoint.y-join.y,(dx*l.dy-dy*l.dx)/Math.max(EPS,l.length));}
          break;
        }
        const la = line(c.a) || line(c.b);
        const ca = circ(c.a), cb = circ(c.b);
        if (la && (ca || cb)) {
          // line tangent to circle: centre-to-line distance equals the radius
          const o = ca && ca.entity.id !== la.id ? ca : cb;
          if (o && la.length > EPS) {
            const d = ((o.center.x - la.a.x) * la.dy - (o.center.y - la.a.y) * la.dx) / la.length;
            push(Math.abs(d) - o.radius);
          }
        } else if (ca && cb) {
          // circle-circle: external tangency, or internal when one encloses the other
          const d = Math.hypot(cb.center.x - ca.center.x, cb.center.y - ca.center.y);
          const ext = d - (ca.radius + cb.radius), int_ = d - Math.abs(ca.radius - cb.radius);
          push(tangencyModes.get(c)==="internal" ? int_ : ext);
        }
        break;
      }
      case "symmetric": {
        const a = pt(c.a), b = pt(c.b), l = line(c.entity);
        if (a && b && l && l.length > EPS) {
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          // midpoint on the mirror line, and a→b perpendicular to it
          push(((mx - l.a.x) * l.dy - (my - l.a.y) * l.dx) / l.length);
          push(((b.x - a.x) * l.dx + (b.y - a.y) * l.dy) / l.length);
        }
        break;
      }
      /* Rotation about a point: one constraint, one angle, many point pairs.
         Each pair says "this copy sits where the source lands after turning by
         `value` about `centre`", which is two residuals and kills exactly the
         two freedoms the copied point had. Written as a rotated-difference
         rather than as separate radius/angle residuals so it stays smooth for a
         point sitting on the centre itself, where an angle is undefined.

         This is what a circular sketch pattern is made of: a whole copy is one
         editable angular pitch, not one dimension per corner. */
      case "offset": {
        const a=line(c.a),b=line(c.b);
        if(a&&b&&a.length>EPS)push(((b.a.x-a.a.x)*(-a.dy)+(b.a.y-a.a.y)*a.dx)/a.length-value);
        else {const ca=circ(c.a),cb=circ(c.b);if(ca&&cb)push(cb.radius-ca.radius-value);}
        break;
      }
      case "rotation": {
        const centre = pt(c.center);
        if (!centre) break;
        const ang = value * DEG, cos = Math.cos(ang), sin = Math.sin(ang);
        for (const pair of c.pairs || []) {
          const a = pt(pair[0]), b = pt(pair[1]);
          if (!a || !b) continue;
          const ax = a.x - centre.x, ay = a.y - centre.y;
          push(b.x - centre.x - (ax * cos - ay * sin), b.y - centre.y - (ax * sin + ay * cos));
        }
        // an ellipse's tilt is not implied by its centre, so it turns explicitly
        for (const pair of c.spins || []) {
          const a = ell(pair[0]), b = ell(pair[1]);
          if (a && b) push(wrapAngle(b.rot - a.rot - ang) * Math.max(1, (a.rx + a.ry) / 2));
        }
        break;
      }
      case "fixed": {
        const p = pt(c.point);
        if (p) push(p.x - Number(c.x ?? p.x), p.y - Number(c.y ?? p.y));
        break;
      }
      default: break;
    }
  }

  // Implicit: an arc's two rim points share the centre's radius.
  for (const e of sketch.entities || []) {
    if (e.type !== "arc") continue;
    owner = { id: e.id + "_arc", type: "arcRadius", implicit: true, entity: e.id };
    const arc = circleData(e, points);
    if (arc) {
      const error = Math.hypot(arc.b.x - arc.center.x, arc.b.y - arc.center.y) - arc.radius;
      // A valid frozen arc has no variables for this identity to constrain.
      // Keep invalid frozen arcs in the residuals so they still fail validation.
      if (!(arc.a.fixed && arc.b.fixed && arc.center.fixed && Math.abs(error) < 1e-9)) push(error);
    }
  }
  return out;
}

/* ---- variables: free point coordinates plus free circle radii ---- */
function variables(sketch) {
  const vars = [];
  (sketch.points || []).forEach((p) => {
    if (!p.fixed) vars.push({ obj: p, k: "x" }, { obj: p, k: "y" });
  });
  (sketch.entities || []).forEach((e) => {
    if (e.fixed) return;
    if (e.type === "circle") vars.push({ obj: e, k: "r" });
    else if (e.type === "ellipse") vars.push({ obj: e, k: "rx" }, { obj: e, k: "ry" }, { obj: e, k: "rot" });
  });
  return vars;
}

/* The sketch's variables live on the point and entity records themselves, so
   the shared differencer is handed a writer that puts a probe vector back onto
   them. Forward differences, as before: a drag re-solves sixty times a second
   and the extra accuracy of a central difference is not worth doubling the
   residual evaluations here. */
function readVariables(vars) {
  return vars.map((v) => Number(v.obj[v.k]) || 0);
}

function writeVariables(vars, vector) {
  vars.forEach((v, i) => { v.obj[v.k] = vector[i]; });
}

function jacobian(sketch, vars, base, options) {
  return numericJacobian((vector) => {
    writeVariables(vars, vector);
    return residuals(sketch);
  }, readVariables(vars), base, options);
}

/* Re-exported rather than moved out of reach: wall_dof.js builds its own
   Jacobian and asks this module for the rank, and the sketch is where that
   reading is documented. The implementation is shared with the assembly
   solver — see core/least_squares.js. */
export function rankOf(J, tolerance = 1e-9) {
  return matrixRank(J, tolerance);
}

export function solveSketch(sketch, options = {}) {
  const entities = entityMap(sketch), points = pointMap(sketch);
  for (const constraint of sketch.constraints || []) {
    if (constraint.type !== "tangent") continue;
    const a = circleData(entities.get(constraint.a), points);
    const b = circleData(entities.get(constraint.b), points);
    if (!a || !b) continue;
    const difference = Math.abs(a.radius - b.radius);
    const distance = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
    // Pick the nearest valid branch once, not again for each Jacobian sample.
    // Equal circles have no non-degenerate internal tangency.
    const internal = difference > 1e-8 && (constraint.tangency === "internal"
      || (!constraint.tangency && Math.abs(distance - difference) <= Math.abs(distance - a.radius - b.radius)));
    tangencyModes.set(constraint, internal ? "internal" : "external");
  }
  const vars = variables(sketch);
  const tolerance = options.tolerance || 1e-5;
  const maxIterations = options.maxIterations || 60;
  let damping = options.damping || 1e-4, converged = false, iteration = 0;
  let r = residuals(sketch);
  let error = normOf(r);
  for (; iteration < maxIterations && vars.length && r.length; iteration++) {
    if (error < tolerance) { converged = true; break; }
    const J = jacobian(sketch, vars, r);
    const delta = gaussNewtonStep(J, r, damping), before = vars.map((v) => v.obj[v.k]);
    vars.forEach((v, i) => { v.obj[v.k] = (Number(v.obj[v.k]) || 0) + delta[i]; });
    const next = residuals(sketch), nextError = normOf(next);
    if (nextError <= error) { r = next; error = nextError; damping = Math.max(1e-9, damping * 0.35); }
    else { vars.forEach((v, i) => { v.obj[v.k] = before[i]; }); damping *= 10; }
  }
  if (error < tolerance) converged = true;
  // circles and ellipses must not solve themselves inside out
  (sketch.entities || []).forEach((e) => {
    if (e.type === "circle") e.r = Math.abs(Number(e.r) || 0);
    else if (e.type === "ellipse") {
      e.rx = Math.abs(Number(e.rx) || 0);
      e.ry = Math.abs(Number(e.ry) || 0);
      e.rot = wrapAngle(Number(e.rot) || 0);
    }
  });

  /* Diagnostics cost far more than the solve. The rank of the full Jacobian is
     O(residuals · variables²), while a Newton step on an already-solved sketch
     is nearly free — measured on a 320-entity sketch, 74 ms of a 77 ms call was
     this block alone. A caller dragging a point sixty times a second wants the
     geometry to follow, not a fresh degrees-of-freedom count, so it can ask for
     `diagnostics:false` and keep the last report until the drag ends. */
  if (options.diagnostics === false) {
    return {
      converged, iterations: iteration, error, diagnostics: false,
      conflicts: [], rank: null, residualCount: null,
      variableCount: vars.length, degreesOfFreedom: null, status: null,
    };
  }

  /* Rank is only meaningful at a precise solution. A dependency that holds ON
     the constraint manifold (a mirrored arc's own end-radius rule, implied by
     the symmetric pairs) is broken by the leftover residual, so at 1e-5 it
     showed up as a ~1e-6 singular value and counted as an independent row:
     HOUSING's Sketchsquare reported "fully constrained" with its width and
     height still free, then "over-constrained" for the book's two dimensions
     even though both solve exactly. Polish a converged sketch first. */
  if (converged && vars.length) {
    let polish = residuals(sketch), polishError = normOf(polish), polishDamping = 1e-9;
    for (let i = 0; i < 8 && polishError > 1e-11; i++) {
      const Jp = jacobian(sketch, vars, polish);
      const step = gaussNewtonStep(Jp, polish, polishDamping), keep = vars.map((v) => v.obj[v.k]);
      vars.forEach((v, k) => { v.obj[v.k] = (Number(v.obj[v.k]) || 0) + step[k]; });
      const after = residuals(sketch), afterError = normOf(after);
      if (afterError <= polishError) { polish = after; polishError = afterError; }
      else { vars.forEach((v, k) => { v.obj[v.k] = keep[k]; }); break; }
    }
    error = polishError;
  }

  /* The rank needs accurate derivatives. The forward-difference Jacobian the
     Newton loop uses has ~1e-5 truncation error on distance and tangent rows,
     so rows that are exactly dependent (a mirrored arc's end-radius rule) came
     out 1e-5 apart and passed a 1e-9 pivot test as independent. Central
     differences fix smooth rows, but several residuals are written with |…|
     and a symmetric stencil across that kink reads a zero slope (a slot then
     reported 9 freedoms instead of 5). So take the central value where it
     agrees with the forward one, and keep the forward slope at a kink. */
  const tags = [], final = residuals(sketch, tags);
  /* Forward stays the default. Measured on HOUSING's mirrored Sketchsquare and
     the editor's slot: forward reads the slot's 5 freedoms right but hides the
     mirror's exact dependency (the Sketchsquare reports 0 freedoms, truly 2);
     "central"/"blend" see that dependency but misread the slot (8–9). No
     tolerance fixed both, so the choice is exposed for diagnosis only. The
     book-blocking half — a consistent sketch called over-defined — is handled
     below by judging redundancy on the user's relations alone. */
  const rankMode = options.rankJacobian || "forward", rankTolerance = options.rankTolerance ?? 1e-9;
  const forwardJ = jacobian(sketch, vars, final);
  const centralJ = rankMode === "forward" ? forwardJ : jacobian(sketch, vars, final, { central: true });
  const J = rankMode === "central" ? centralJ : forwardJ.map((row, i) => row.map((forward, j) => {
    const central = centralJ[i][j];
    // relative agreement: a far point's slope on a |cross| row can be ~3e-4, and an
    // absolute threshold let the kink's central 0 through (slot: 9 freedoms)
    return Math.abs(forward - central) <= 1e-2 * Math.max(Math.abs(forward), Math.abs(central)) ? central : forward;
  }));
  const rank = rankOf(J, rankTolerance);
  const conflicts = [];
  final.forEach((v, i) => {
    const c = tags[i];
    if (c && !c.implicit && Math.abs(v) > Math.max(1e-3, tolerance * 100) && !conflicts.includes(c.id)) conflicts.push(c.id);
  });
  const dof = Math.max(0, vars.length - rank);
  /* More independent equations than the geometry has freedoms: even a solved
     sketch is over-defined and the next dimension will fight an existing one.
     Only the user's relations can be redundant in that sense — an arc's own
     end-radius rule duplicated by a mirror is geometry, not a relation anyone
     added, and must not turn a fully defined sketch "over-defined". */
  let redundant = false;
  if (final.length > 0 && rank < final.length && converged && dof === 0) {
    const explicitRows = [];
    final.forEach((_, i) => { if (!(tags[i] && tags[i].implicit)) explicitRows.push(J[i]); });
    redundant = explicitRows.length > 0 && rankOf(explicitRows) < explicitRows.length;
  }
  return {
    converged, iterations: iteration, error,
    rank, residualCount: final.length, variableCount: vars.length,
    degreesOfFreedom: dof, conflicts,
    status: !converged ? "conflicting" : dof > 0 ? "under-constrained"
      : redundant ? "over-constrained" : "fully-constrained",
  };
}

/* ---- sketch documents ----
   A sketch belongs to a plane, the way it does in any CAD package. Without
   that, the same geometry renders in whichever view you happen to be looking
   through and extrudes along whichever axis that view implies — silently
   producing a different solid depending on where the camera was. */

export const SKETCH_PLANES = ["top", "front", "side"];

let sketchSeq = 0;
function newSketchId() { return "sk_" + (sketchSeq++).toString(36) + Math.random().toString(36).slice(2, 6); }

function planeReferenceId(plane) {
  return plane === "side" ? "plane:right" : "plane:" + (SKETCH_PLANES.includes(plane) ? plane : "top");
}

function blankSketch(plane, offset, name, support) {
  const normalizedPlane = SKETCH_PLANES.includes(plane) ? plane : "top";
  return {
    id: newSketchId(),
    name: name || planeLabel(plane) + " sketch",
    plane: normalizedPlane,
    offset: Number(offset) || 0,
    referenceId: support?.persistentId || planeReferenceId(normalizedPlane),
    support: support ? structuredClone(support) : undefined,
    points: [], entities: [], constraints: [],
  };
}

export function planeLabel(plane) {
  return plane === "front" ? "X·Y" : plane === "side" ? "Z·Y" : "X·Z";
}

/* Normalise the document's sketch list, migrating the single plane-less
   `def.sketch` that older models carry. Those were always drawn on the top
   plane, which is the view the editor opens in. */
export function ensureSketchDoc(def) {
  if (!Array.isArray(def.sketches)) def.sketches = [];
  if (def.sketch && typeof def.sketch === "object" && !def.sketches.length) {
    const legacy = blankSketch("top", 0);
    legacy.points = def.sketch.points || [];
    legacy.entities = def.sketch.entities || [];
    legacy.constraints = def.sketch.constraints || [];
    def.sketches.push(legacy);
    def.activeSketch = legacy.id;
  }
  delete def.sketch;
  if (!def.sketches.length) {
    const first = blankSketch("top", 0);
    def.sketches.push(first);
    def.activeSketch = first.id;
  }
  def.sketches.forEach((s) => {
    s.id ||= newSketchId();
    s.plane = SKETCH_PLANES.includes(s.plane) ? s.plane : "top";
    s.offset = Number(s.offset) || 0;
    s.referenceId ||= s.support?.persistentId || planeReferenceId(s.plane);
    s.name ||= planeLabel(s.plane) + " sketch";
    s.points ||= [];
    s.entities ||= [];
    s.constraints ||= [];
  });
  if (!def.sketches.some((s) => s.id === def.activeSketch)) def.activeSketch = def.sketches[0].id;
  return def.sketches;
}

// The sketch every edit lands in. Callers that just want "the working sketch"
// keep working unchanged; which one that is now depends on the active plane.
export function ensureSketch(def) {
  const list = ensureSketchDoc(def);
  return list.find((s) => s.id === def.activeSketch) || list[0];
}

export function sketchById(def, id) {
  return ensureSketchDoc(def).find((s) => s.id === id) || null;
}

export function addSketch(def, plane, offset, name, support) {
  const list = ensureSketchDoc(def);
  const sketch = blankSketch(plane, offset, name, support);
  list.push(sketch);
  def.activeSketch = sketch.id;
  return sketch;
}

export function removeSketch(def, id) {
  const list = ensureSketchDoc(def);
  if (list.length < 2) return false;
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  if (def.activeSketch === id) def.activeSketch = list[Math.max(0, i - 1)].id;
  return true;
}

/* Walk a set of entity ids into an ordered closed loop of {u,v}.
   This is the one place a stored profile is turned back into geometry, shared
   by the live mesh rebuild and the BREP regeneration — two answers to "what
   shape is this feature now?" is exactly how a solid drifts from its sketch. */
export function resolveProfilePoints(sketch, entityIds) {
  if (!sketch || !entityIds || !entityIds.length) return null;
  const byId = new Map((sketch.entities || []).map((e) => [e.id, e]));
  const entities = entityIds.map((id) => byId.get(id));
  if (entities.some((e) => !e)) return null;             // an entity was deleted
  const analysis = analyzeSketchProfiles({...sketch, entities}, {selectedIds:entityIds, tolerance:0.05});
  const wanted = new Set(entityIds);
  const profile = analysis.profiles.find((p) => p.entityIds.length === wanted.size && p.entityIds.every((id) => wanted.has(id)));
  return profile ? profile.points : null;
}

export function sketchPoint(sketch, id) { return (sketch.points || []).find((p) => p.id === id) || null; }
export function sketchEntity(sketch, id) { return (sketch.entities || []).find((e) => e.id === id) || null; }

/* Drop an entity and everything that referenced it, including points no other
   entity still uses — a stale point keeps its degrees of freedom in the count
   and makes a finished sketch read as under-constrained forever. */
export function removeSketchEntity(sketch, id) {
  const entity = sketchEntity(sketch, id);
  if (!entity) return false;
  sketch.entities = sketch.entities.filter((e) => e.id !== id);
  pruneOrphanPoints(sketch);
  return true;
}

/* Drop points no entity draws any more, and the constraints that named them.
   Trimming and extending strand endpoints this way, and a stranded point is
   not harmless: it keeps two degrees of freedom in the count, so a sketch that
   looks finished never reports itself as fully defined. */
export function pruneOrphanPoints(sketch) {
  const used = new Set();
  sketch.entities.forEach((e) => entityPoints(sketch, e).forEach((p) => used.add(p.id)));
  /* A pattern's centre of rotation is in use even when no entity draws it — it
     is the axis the whole array is hung from. Pruning it takes the array's
     angular pitch with it and silently detaches every copy. */
  sketch.constraints.forEach((c) => { if (c.type === "rotation" && c.center) used.add(c.center); });
  const dropped = new Set(sketch.points.filter((p) => !used.has(p.id)).map((p) => p.id));
  sketch.points = sketch.points.filter((p) => used.has(p.id));
  const live = new Set(sketch.entities.map((e) => e.id));
  // membership by set, not by scanning the point array per constraint — a big
  // sketch trims often enough that the quadratic version showed up as a stall
  const alive = new Set(sketch.points.map((p) => p.id));
  const stands = (id) => id === undefined || live.has(id) || alive.has(id);

  /* A pattern rotation names many pairs at once, so losing one copied corner
     should shrink it rather than delete the whole array's angular pitch. */
  sketch.constraints.forEach((c) => {
    if (c.type !== "rotation" && !c.patternTranslation) return;
    if (Array.isArray(c.pairs)) c.pairs = c.pairs.filter((pair) => alive.has(pair[0]) && alive.has(pair[1]));
    if (Array.isArray(c.shapes)) c.shapes=c.shapes.filter(pair=>live.has(pair[0])&&live.has(pair[1]));
    if (Array.isArray(c.spins)) c.spins = c.spins.filter((pair) => live.has(pair[0]) && live.has(pair[1]));
  });

  sketch.constraints = sketch.constraints.filter((c) => {
    if(c.patternTranslation){if(!c.pairs?.length)return false;[c.a,c.b]=c.pairs[0];return true;}
    if (c.type === "rotation") {
      return alive.has(c.center) && ((c.pairs || []).length > 0 || (c.spins || []).length > 0);
    }
    return stands(c.entity) && stands(c.a) && stands(c.b) && !dropped.has(c.point);
  });
  return dropped.size;
}

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
// The solver uses damped Gauss-Newton with an exact Jacobian: the residuals are
// written once over dual numbers (core/dual.js), so their slopes are derived
// from the same expressions that are solved. That gives one residual/rank model
// for under-, fully- and over-constrained diagnostics that does not depend on a
// finite-difference step size.

import { analyzeSketchProfiles } from "./sketch_profiles.js";
import { gaussNewtonStep, normOf, rankOf as matrixRank } from "./core/least_squares.js";
import { abs, add, atan2, atLeast, cos, div, gradientRows, hypot, mul, neg, scale, sin, sub, valueOf, variable, wrapTurn } from "./core/dual.js";

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

/* Points each curve passes through by definition or by a relation: an arc's
   own ends, a point-on-curve relation, and anything coincident with those.
   Tangency needs this — see the tangent case. */
function curveContacts(sketch) {
  const on = new Map();
  const add = (curve, point) => {
    if (curve == null || point == null) return;
    if (!on.has(curve)) on.set(curve, new Set());
    on.get(curve).add(point);
  };
  for (const e of sketch.entities || []) if (e.type === "arc") { add(e.id, e.a); add(e.id, e.b); }
  const live = (sketch.constraints || []).filter((c) => !c.suppressed && !c.driven);
  live.forEach((c) => { if (c.type === "pointOnCircle") add(c.entity, c.point); });
  const coincident = live.filter((c) => c.type === "coincident");
  for (let pass = 0; pass < 2 && coincident.length; pass++) {
    on.forEach((set) => coincident.forEach((c) => {
      if (set.has(c.a)) set.add(c.b);
      if (set.has(c.b)) set.add(c.a);
    }));
  }
  return on;
}

/* Residuals, differentiable. With `index` (variable record → {key: column})
   every free coordinate enters as a dual number and each residual carries its
   exact gradient; without it everything is a plain number. It is one body of
   code for both, so the Jacobian is always the derivative of exactly the
   equations being solved. */
function residualTerms(sketch, tags, index) {
  const points = pointMap(sketch), entities = entityMap(sketch), out = [];
  const read = (obj, key) => {
    const n = Number(obj[key]) || 0;
    const column = index && index.get(obj)?.[key];
    return column == null ? n : variable(n, column);
  };
  const pointCache = new Map();
  const pt = (id) => {
    if (id == null) return null;
    if (pointCache.has(id)) return pointCache.get(id);
    const p = points.get(id);
    const value = p ? { id, rec: p, x: read(p, "x"), y: read(p, "y") } : null;
    pointCache.set(id, value);
    return value;
  };
  const line = (id) => {
    const e = entities.get(id);
    if (!e || e.type !== "line") return null;
    const a = pt(e.a), b = pt(e.b);
    if (!a || !b) return null;
    const dx = sub(b.x, a.x), dy = sub(b.y, a.y);
    return { e, a, b, dx, dy, length: hypot(dx, dy) };
  };
  const circ = (id) => {
    const e = entities.get(id);
    if (!e) return null;
    if (e.type === "circle") {
      const center = pt(e.c ?? e.center);
      return center ? { e, center, radius: abs(read(e, "r")) } : null;
    }
    if (e.type === "arc") {
      const center = pt(e.c ?? e.center), a = pt(e.a), b = pt(e.b);
      if (!center || !a || !b) return null;
      return { e, center, a, b, radius: hypot(sub(a.x, center.x), sub(a.y, center.y)) };
    }
    return null;
  };
  const ell = (id) => {
    const e = entities.get(id);
    if (!e || e.type !== "ellipse") return null;
    const center = pt(e.c ?? e.center);
    return center ? { e, center, rx: abs(read(e, "rx")), ry: abs(read(e, "ry")), rot: read(e, "rot") } : null;
  };
  const centre = (id) => (circ(id) || ell(id))?.center || null;
  // perpendicular offset of (x, y) from line l, signed by the line's direction
  const across = (x, y, l) => div(sub(mul(sub(x, l.a.x), l.dy), mul(sub(y, l.a.y), l.dx)), l.length);
  let contacts = null;
  const onCurve = (curveId, pointId) => {
    contacts ||= curveContacts(sketch);
    return !!contacts.get(curveId)?.has(pointId);
  };
  let owner = null;
  const push = (...vals) => {
    for (const v of vals) { out.push(v); if (tags) tags.push(owner); }
  };
  /* A row that steers the solve but is not an equation of its own: excluded
     from the rank, the redundancy test and the conflict list. */
  const steer = (v) => {
    const main = owner;
    owner = { id: main.id + "_steer", type: main.type + "Steer", implicit: true, auxiliary: true, of: main.id };
    push(v);
    owner = main;
  };

  for (const c of sketch.constraints || []) {
    if (c.suppressed || c.driven) continue;
    owner = c;
    const value = Number(c.value || 0);
    switch (c.type) {
      case "coincident": {
        const a = pt(c.a), b = pt(c.b);
        if (a && b) push(sub(a.x, b.x), sub(a.y, b.y));
        break;
      }
      case "horizontal": case "vertical": {
        if (c.entity) {
          const l = line(c.entity);
          if (l) push(c.type === "horizontal" ? l.dy : l.dx);
        } else {
          const a = pt(c.a), b = pt(c.b);
          if (a && b) push(c.type === "horizontal" ? sub(a.y, b.y) : sub(a.x, b.x));
        }
        break;
      }
      case "distance": {
        if (c.patternTranslation) {
          for (const pair of c.shapes || []) {
            const a = ell(pair[0]), b = ell(pair[1]);
            if (a && b) push(sub(b.rx, a.rx), sub(b.ry, a.ry), wrapTurn(sub(b.rot, a.rot)));
          }
          for (const pair of c.pairs || []) {
            const a = pt(pair[0]), b = pt(pair[1]);
            if (a && b) push(sub(sub(b.x, a.x), c.direction === "v" ? 0 : value), sub(sub(b.y, a.y), c.direction === "v" ? value : 0));
          }
          break;
        }
        if (c.entity) {
          const l = line(c.entity);
          if (l) push(sub(l.length, value));
        } else {
          const a = pt(c.a), b = pt(c.b);
          if (a && b) push(sub(hypot(sub(b.x, a.x), sub(b.y, a.y)), value));
        }
        break;
      }
      case "angle": {
        const l = line(c.entity);
        if (l) { push(mul(wrapTurn(sub(atan2(l.dy, l.dx), value * DEG)), atLeast(l.length, 1))); break; }
        // two-line angle: the included angle between a and b
        const la = line(c.a), lb = line(c.b);
        if (la && lb) push(mul(wrapTurn(sub(sub(atan2(lb.dy, lb.dx), atan2(la.dy, la.dx)), value * DEG)), atLeast(la.length, 1)));
        break;
      }
      case "parallel": case "perpendicular": {
        const a = line(c.a), b = line(c.b);
        if (a && b && valueOf(a.length) > EPS && valueOf(b.length) > EPS) {
          const span = mul(a.length, b.length);
          push(c.type === "parallel"
            ? div(sub(mul(a.dx, b.dy), mul(a.dy, b.dx)), span)
            : div(add(mul(a.dx, b.dx), mul(a.dy, b.dy)), span));
        }
        break;
      }
      case "equal": {
        const a = line(c.a), b = line(c.b);
        if (a && b) { push(sub(a.length, b.length)); break; }
        const ea = ell(c.a), eb = ell(c.b);
        if (ea && eb) { push(sub(ea.rx, eb.rx), sub(ea.ry, eb.ry)); break; }
        const ca = circ(c.a), cb = circ(c.b);
        if (ca && cb) push(sub(ca.radius, cb.radius));
        break;
      }
      case "midpoint": {
        const p = pt(c.point), l = line(c.entity);
        if (p && l) push(sub(p.x, scale(add(l.a.x, l.b.x), 0.5)), sub(p.y, scale(add(l.a.y, l.b.y), 0.5)));
        break;
      }
      case "intersection": {
        const p = pt(c.point);
        if (!p) break;
        if (c.edgeA) {
          if (c.x != null && c.y != null) push(sub(p.x, Number(c.x)), sub(p.y, Number(c.y)));
          break;
        }
        const la = line(c.a), lb = line(c.b);
        if (la && lb && valueOf(la.length) > EPS && valueOf(lb.length) > EPS) {
          const denom = sub(mul(la.dx, lb.dy), mul(la.dy, lb.dx));
          if (Math.abs(valueOf(denom)) > EPS) {
            const t = div(sub(mul(sub(lb.a.x, la.a.x), lb.dy), mul(sub(lb.a.y, la.a.y), lb.dx)), denom);
            push(sub(p.x, add(la.a.x, mul(t, la.dx))), sub(p.y, add(la.a.y, mul(t, la.dy))));
          }
        }
        break;
      }
      case "onModelEdge": {
        /* Coincident with a model edge: the edge's line on this plane is bound
           from the rebuilt body into ax..by, so it is a constant here. */
        const p = pt(c.point);
        if (!p || c.ax == null || c.bx == null) break;
        const dx = Number(c.bx) - Number(c.ax), dy = Number(c.by) - Number(c.ay), length = Math.hypot(dx, dy);
        if (length > EPS) push(across(p.x, p.y, { a: { x: Number(c.ax), y: Number(c.ay) }, dx, dy, length }));
        break;
      }
      case "pierce": {
        /* Pierce: the point where another sketch's curve crosses this plane,
           bound into x/y before the solve, like an intersection with edges. */
        const p = pt(c.point);
        if (p && c.x != null && c.y != null) push(sub(p.x, Number(c.x)), sub(p.y, Number(c.y)));
        break;
      }
      case "pointOnLine": {
        const p = pt(c.point), l = line(c.entity);
        if (p && l && valueOf(l.length) > EPS) push(across(p.x, p.y, l));
        break;
      }
      case "pointOnCircle": {
        const p = pt(c.point), o = circ(c.entity);
        if (p && o) { push(sub(hypot(sub(p.x, o.center.x), sub(p.y, o.center.y)), o.radius)); break; }
        const e = ell(c.entity);
        if (p && e && valueOf(e.rx) > EPS && valueOf(e.ry) > EPS) {
          // implicit ellipse equation in the curve's own frame, scaled back to a
          // length so it sits on the same footing as every other residual
          const dx = sub(p.x, e.center.x), dy = sub(p.y, e.center.y);
          const cs = cos(e.rot), sn = sin(e.rot);
          const u = div(add(mul(dx, cs), mul(dy, sn)), e.rx), v = div(sub(mul(dy, cs), mul(dx, sn)), e.ry);
          push(mul(sub(hypot(u, v), 1), scale(add(e.rx, e.ry), 0.5)));
        }
        break;
      }
      case "radius": case "diameter": {
        const o = circ(c.entity);
        const half = c.type === "diameter" ? value / 2 : value;
        if (o) { push(sub(o.radius, half)); break; }
        // On an ellipse a radius dimension names one semi-axis: `axis:"minor"`
        // drives ry, anything else drives rx.
        const e = ell(c.entity);
        if (e) push(sub(c.axis === "minor" ? e.ry : e.rx, half));
        break;
      }
      case "concentric": {
        const a = centre(c.a), b = centre(c.b);
        if (a && b) push(sub(a.x, b.x), sub(a.y, b.y));
        break;
      }
      case "tangent": {
        if (c.splineEnd) {
          const e = entities.get(c.a), l = line(c.b), endpoint = pt(e?.[c.splineEnd]), handle = pt(e?.[c.splineEnd === "a" ? "h1" : "h2"]), join = pt(entities.get(c.b)?.[c.lineEnd]);
          if (endpoint && handle && join && l) {
            const dx = sub(handle.x, endpoint.x), dy = sub(handle.y, endpoint.y);
            push(sub(endpoint.x, join.x), sub(endpoint.y, join.y), div(sub(mul(dx, l.dy), mul(dy, l.dx)), atLeast(l.length, EPS)));
          }
          break;
        }
        /* Where the two curves already share a point, "centre distance equals
           the radius" is the wrong equation. With that point on both, the
           distance can never exceed the radius, so tangency is the equation's
           maximum and its slope there is zero: the relation vanished from the
           Jacobian and a second one duplicated the arc's own radius rule. A
           slot read 5 freedoms only because finite-difference noise filled the
           empty row, and a mirrored profile read fully defined with two sizes
           still free. At a shared point tangency is first-order: the radius is
           perpendicular to the line there, or both centres line up with it.

           That form alone solves worse from far away. When a moved line drags
           the rim point across the arc's centre, its linearisation pushes the
           centre off to infinity, where the old distance form kept it home. So
           the distance form stays in as a steering row: the two agree at every
           solution, and only the first-order row is counted. */
        const la = line(c.a) || line(c.b);
        const ca = circ(c.a), cb = circ(c.b);
        if (la && (ca || cb)) {
          // line tangent to circle: centre-to-line distance equals the radius
          const o = ca && ca.e.id !== la.e.id ? ca : cb;
          if (o && valueOf(la.length) > EPS) {
            const touch = onCurve(o.e.id, la.e.a) ? la.a : onCurve(o.e.id, la.e.b) ? la.b : null;
            const reach = sub(abs(across(o.center.x, o.center.y, la)), o.radius);
            if (touch) {
              push(div(add(mul(sub(touch.x, o.center.x), la.dx), mul(sub(touch.y, o.center.y), la.dy)), la.length));
              steer(reach);
            } else push(reach);
          }
        } else if (ca && cb) {
          const shared = [...(contacts ||= curveContacts(sketch)).get(ca.e.id) || []].find((id) => onCurve(cb.e.id, id));
          const touch = shared != null ? pt(shared) : null;
          // circle-circle: external tangency, or internal when one encloses the other
          const d = hypot(sub(cb.center.x, ca.center.x), sub(cb.center.y, ca.center.y));
          const reach = tangencyModes.get(c) === "internal"
            ? sub(d, abs(sub(ca.radius, cb.radius)))
            : sub(d, add(ca.radius, cb.radius));
          if (touch) {
            // both centres on one line through the shared point
            const ax = sub(ca.center.x, touch.x), ay = sub(ca.center.y, touch.y);
            const bx = sub(cb.center.x, touch.x), by = sub(cb.center.y, touch.y);
            push(div(sub(mul(ax, by), mul(ay, bx)), atLeast(hypot(ax, ay), EPS)));
            steer(reach);
          } else push(reach);
        }
        break;
      }
      case "symmetric": {
        const a = pt(c.a), b = pt(c.b), l = line(c.entity);
        if (a && b && l && valueOf(l.length) > EPS) {
          // midpoint on the mirror line, and a→b perpendicular to it
          push(across(scale(add(a.x, b.x), 0.5), scale(add(a.y, b.y), 0.5), l));
          push(div(add(mul(sub(b.x, a.x), l.dx), mul(sub(b.y, a.y), l.dy)), l.length));
        }
        break;
      }
      case "pointLineDistance": {
        // perpendicular distance from a point to a line (HOUSING step 330: Origin → top line)
        const p = pt(c.point), l = line(c.a);
        if (p && l && valueOf(l.length) > EPS) push(sub(abs(across(p.x, p.y, l)), value));
        break;
      }
      case "offset": {
        const a = line(c.a), b = line(c.b);
        if (a && b && valueOf(a.length) > EPS) push(sub(div(add(mul(sub(b.a.x, a.a.x), neg(a.dy)), mul(sub(b.a.y, a.a.y), a.dx)), a.length), value));
        else {
          const ca = circ(c.a), cb = circ(c.b);
          if (ca && cb) push(sub(sub(cb.radius, ca.radius), value));
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
      case "rotation": {
        const o = pt(c.center);
        if (!o) break;
        const ang = value * DEG, cs = Math.cos(ang), sn = Math.sin(ang);
        for (const pair of c.pairs || []) {
          const a = pt(pair[0]), b = pt(pair[1]);
          if (!a || !b) continue;
          const ax = sub(a.x, o.x), ay = sub(a.y, o.y);
          push(sub(sub(b.x, o.x), sub(scale(ax, cs), scale(ay, sn))), sub(sub(b.y, o.y), add(scale(ax, sn), scale(ay, cs))));
        }
        // an ellipse's tilt is not implied by its centre, so it turns explicitly
        for (const pair of c.spins || []) {
          const a = ell(pair[0]), b = ell(pair[1]);
          if (a && b) push(mul(wrapTurn(sub(sub(b.rot, a.rot), ang)), atLeast(scale(add(a.rx, a.ry), 0.5), 1)));
        }
        break;
      }
      case "fixed": {
        const p = pt(c.point);
        if (p) push(c.x == null ? 0 : sub(p.x, Number(c.x)), c.y == null ? 0 : sub(p.y, Number(c.y)));
        break;
      }
      default: break;
    }
  }

  // Implicit: an arc's two rim points share the centre's radius.
  for (const e of sketch.entities || []) {
    if (e.type !== "arc") continue;
    owner = { id: e.id + "_arc", type: "arcRadius", implicit: true, entity: e.id };
    const arc = circ(e.id);
    if (arc) {
      // Trimming a fixed converted circle frees endpoint angles, not its radius.
      if (Number.isFinite(e.fixedRadius)) {
        const radiusError = sub(arc.radius, e.fixedRadius);
        if (!(arc.a.rec.fixed && arc.center.rec.fixed && Math.abs(valueOf(radiusError)) < 1e-9)) push(radiusError);
      }
      const error = sub(hypot(sub(arc.b.x, arc.center.x), sub(arc.b.y, arc.center.y)), arc.radius);
      // A valid frozen arc has no variables for this identity to constrain.
      // Keep invalid frozen arcs in the residuals so they still fail validation.
      if (!(arc.a.rec.fixed && arc.b.rec.fixed && arc.center.rec.fixed && Math.abs(valueOf(error)) < 1e-9)) push(error);
    }
  }
  return out;
}

function residuals(sketch, tags) {
  return residualTerms(sketch, tags, null);
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

/* Exact Jacobian at the current state, one row per residual and one column
   per variable. Replaces a forward-difference Jacobian: that cost a residual
   evaluation per variable and was off by ~1e-5, which is enough to count two
   copies of one equation as independent. */
function jacobian(sketch, vars) {
  const index = new Map();
  vars.forEach((v, column) => {
    let slot = index.get(v.obj);
    if (!slot) index.set(v.obj, (slot = {}));
    slot[v.k] = column;
  });
  return gradientRows(residualTerms(sketch, null, index), vars.length);
}

/* The Jacobian with each row's owner, for diagnostics and tests. */
export function sketchJacobian(sketch) {
  const vars = variables(sketch), tags = [];
  const values = residuals(sketch, tags);
  return {
    J: jacobian(sketch, vars), residuals: values, owners: tags,
    variables: vars.map((v) => ({ id: v.obj.id, key: v.k })),
  };
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
  const descend = () => {
    let damping = options.damping || 1e-4, steps = 0;
    let r = residuals(sketch), error = normOf(r);
    for (; steps < maxIterations && vars.length && r.length; steps++) {
      if (error < tolerance) break;
      const J = jacobian(sketch, vars);
      const delta = gaussNewtonStep(J, r, damping), before = vars.map((v) => v.obj[v.k]);
      vars.forEach((v, i) => { v.obj[v.k] = (Number(v.obj[v.k]) || 0) + delta[i]; });
      const next = residuals(sketch), nextError = normOf(next);
      if (nextError <= error) { r = next; error = nextError; damping = Math.max(1e-9, damping * 0.35); }
      else { vars.forEach((v, i) => { v.obj[v.k] = before[i]; }); damping *= 10; }
    }
    return { error, steps };
  };
  const run = descend();
  let iteration = run.steps, error = run.error;
  /* A solve can stall where a relation's residual is not zero but its slope is:
     two exactly parallel lines asked to be perpendicular sit at the extremum of
     their cosine, so no step turns them and the relation reads as impossible —
     which also told the conflict explanation that Perpendicular fought nothing
     but itself. On failure, nudge every free coordinate by a small fixed
     pattern (deterministic, so the same sketch always solves the same way) and
     try once more; keep that only if it converges. */
  if (error >= tolerance && vars.length && options.nudge !== false) {
    const failed = vars.map((v) => v.obj[v.k]);
    const span = Math.max(1, ...(sketch.points || []).map((p) => Math.max(Math.abs(Number(p.x) || 0), Math.abs(Number(p.y) || 0))));
    let seed = 7;
    vars.forEach((v) => {
      seed = (seed * 16807) % 2147483647;
      v.obj[v.k] = (Number(v.obj[v.k]) || 0) + (seed / 2147483647 - 0.5) * 2e-3 * span;
    });
    const retry = descend();
    iteration += retry.steps;
    if (retry.error < tolerance) error = retry.error;
    else vars.forEach((v, i) => { v.obj[v.k] = failed[i]; });
  }
  let converged = error < tolerance;
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
      conflicts: [], rank: null, residualCount: null, redundancy: null,
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
      const Jp = jacobian(sketch, vars);
      const step = gaussNewtonStep(Jp, polish, polishDamping), keep = vars.map((v) => v.obj[v.k]);
      vars.forEach((v, k) => { v.obj[v.k] = (Number(v.obj[v.k]) || 0) + step[k]; });
      const after = residuals(sketch), afterError = normOf(after);
      if (afterError <= polishError) { polish = after; polishError = afterError; }
      else { vars.forEach((v, k) => { v.obj[v.k] = keep[k]; }); break; }
    }
    error = polishError;
  }

  const tags = [], final = residuals(sketch, tags);
  const rankTolerance = options.rankTolerance ?? 1e-9;
  // steering rows restate an equation already counted; they do not count again
  const countedRows = [];
  final.forEach((_, i) => { if (!(tags[i] && tags[i].auxiliary)) countedRows.push(i); });
  const allRows = jacobian(sketch, vars);
  const J = countedRows.map((i) => allRows[i]);
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
  /* `redundant` is reported whatever the freedoms are, so the conflict
     explanation can find the relations a new one repeats in a sketch that is
     not finished yet; the status only turns "over-constrained" once nothing is
     left free, as before. */
  /* `redundancy` counts the dependent explicit rows, so an edit can be judged
     by what it adds rather than by what the sketch already carried. */
  let redundant = false, redundancy = 0;
  if (countedRows.length > 0 && rank < countedRows.length && converged) {
    const explicitRows = [];
    countedRows.forEach((i, row) => { if (!(tags[i] && tags[i].implicit)) explicitRows.push(J[row]); });
    redundancy = explicitRows.length - rankOf(explicitRows, rankTolerance);
    redundant = explicitRows.length > 0 && redundancy > 0;
  }
  return {
    converged, iterations: iteration, error,
    rank, residualCount: countedRows.length, variableCount: vars.length,
    degreesOfFreedom: dof, conflicts, redundant, redundancy,
    status: !converged ? "conflicting" : dof > 0 ? "under-constrained"
      : redundant ? "over-constrained" : "fully-constrained",
  };
}

/* Whether an edit that left the sketch "over-constrained" repeats what was
   already set. The status turns over-constrained as soon as nothing is free
   while any relation is stated twice — also when that duplication was already
   in the sketch and the edit itself took the last freedom. HOUSING
   HandleProfile's mirror relations carried such duplicates, so the Vertical
   (or Coincident) that pinned the last construction end was refused as a
   repeat of Symmetric and Midpoint (G23). An edit is a repeat only if it
   removed no freedom and added a dependent row. Without a full report of the
   sketch before the edit there is nothing to compare, so it is refused as
   before. */
export function refusesAsRepeat(report, previous) {
  if (!report || report.status !== "over-constrained") return false;
  if (!previous || previous.degreesOfFreedom == null || previous.redundancy == null || report.redundancy == null) return true;
  if (report.degreesOfFreedom < previous.degreesOfFreedom) return false;
  return report.redundancy > previous.redundancy;
}

/* ---- why a sketch will not solve ----
   A sketch that cannot be satisfied is fitted in the least-squares sense, and
   that fit spreads the leftover error over every relation near the failure. So
   the residual list named everything in reach: HOUSING's Sketchsquare, asked for
   a height its fillet could not reach, turned fourteen relations red when three
   or four were actually in contention.

   This is a deletion filter. Take the relations one at a time, drop each, and
   re-solve from the same starting geometry: if the sketch still fails without
   it, it was not part of the problem and stays dropped; if dropping it lets the
   sketch solve, it is essential and goes back. What survives is a minimal
   failing set: remove any one member and the rest solves. The same test works
   for redundancy ("over-constrained" rather than "conflicting").

   `keep` pins relations that must be named — the dimension the user just typed
   is always part of the answer. Relations are tried oldest first, so when more
   than one minimal set exists the newer relations are the ones blamed.

   A probe only counts as solved if the geometry survived it. With relations
   removed, a solve can "succeed" by shrinking an entity to nothing: HOUSING's
   mirror centerline collapsed to 1e-4 cm, where its direction means nothing
   and every symmetric relation is met for free. That made those symmetric
   relations look essential and padded the list from five names to eight. */
function entitySizes(sketch) {
  const points = pointMap(sketch), sizes = new Map();
  for (const e of sketch.entities || []) {
    const a = points.get(e.a), b = points.get(e.b), c = points.get(e.c ?? e.center);
    let size = null;
    if (e.type === "line" && a && b) size = Math.hypot(b.x - a.x, b.y - a.y);
    else if (e.type === "arc" && a && c) size = Math.hypot(a.x - c.x, a.y - c.y);
    else if (e.type === "circle") size = Math.abs(Number(e.r) || 0);
    if (size != null) sizes.set(e.id, size);
  }
  return sizes;
}

export function explainSketchConflict(sketch, options = {}) {
  const keep = new Set(options.keep || []);
  const maxSolves = options.maxSolves ?? 80;
  const drawn = entitySizes(sketch);
  const intact = (trial) => {
    const now = entitySizes(trial);
    for (const [id, size] of drawn) if (size > 1e-6 && (now.get(id) ?? size) < size * 1e-2) return false;
    return true;
  };
  const probe = (removed, withDiagnostics) => {
    const trial = structuredClone(sketch);
    trial.constraints.forEach((c) => { if (removed.has(c.id)) c.suppressed = true; });
    const result = solveSketch(trial, withDiagnostics ? {} : { diagnostics: false });
    return { result, solved: result.converged && intact(trial) };
  };
  const first = probe(new Set(), true);
  const kind = !first.solved ? "conflicting" : first.result.redundant ? "over-constrained" : null;
  if (!kind) return { kind: null, ids: [], complete: true };
  const failing = kind === "conflicting"
    ? (removed) => !probe(removed, false).solved
    : (removed) => !!probe(removed, true).result.redundant;
  let candidates = (sketch.constraints || []).filter((c) => !c.suppressed && !c.driven && !keep.has(c.id));
  // a big sketch cannot afford a solve per relation; the ones carrying error are
  // where the failure lives, and anything outside them simply stays in force
  if (candidates.length + 1 > maxSolves && first.result.conflicts.length) {
    const carrying = new Set(first.result.conflicts);
    candidates = candidates.filter((c) => carrying.has(c.id));
  }
  const removed = new Set();
  let solves = 1, complete = true;
  for (const c of candidates) {
    if (solves >= maxSolves) { complete = false; break; }
    removed.add(c.id);
    solves++;
    if (!failing(removed)) removed.delete(c.id);
  }
  const ids = (sketch.constraints || [])
    .filter((c) => !c.suppressed && !c.driven && !removed.has(c.id) && (keep.has(c.id) || candidates.includes(c)))
    .map((c) => c.id);
  return { kind, ids, complete };
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

/* A plane sketch nobody drew in, renamed, recorded in history or referred to.
   Switching to Top while a face sketch is active opens one (a face sketch
   cannot follow the view the way an untouched plane sketch does), and with no
   history row the tree never shows it, so it could not be deleted either:
   LENSCAP carried an invisible empty "X·Z sketch" that way. */
export function sketchIsAbandoned(def, sketch) {
  if (!sketch || sketch.id === def.activeSketch || sketch.support || sketch.frameSpace === "local") return false;
  if ((sketch.points || []).length || (sketch.entities || []).length || (sketch.constraints || []).length) return false;
  if (String(sketch.name || "") !== planeLabel(sketch.plane) + " sketch") return false;
  const rest = { ...def, sketches: (def.sketches || []).filter((s) => s !== sketch), activeSketch: undefined, exactTopologyCache: undefined };
  // any mention keeps it, "history:sketch:<id>" or "<id>:entity:5" included
  return !JSON.stringify(rest).includes(String(sketch.id));
}

export function pruneAbandonedSketches(def) {
  const dropped = ensureSketchDoc(def).filter((sketch) => sketchIsAbandoned(def, sketch)).map((sketch) => sketch.id);
  return dropped.filter((id) => removeSketch(def, id));
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
  /* A fillet's virtual sharp is not drawn either, but it is still held on the
     curves it rounded. Pruning it on the NEXT fillet silently dropped its
     relations: HOUSING's mirrored lower corners lost their Symmetric pair and
     a side line came loose. It goes once no live curve holds it. */
  const sharps = new Set((sketch.points || []).filter((p) => p.virtualSharp).map((p) => p.id));
  if (sharps.size) {
    const curves = new Set(sketch.entities.map((e) => e.id));
    sketch.constraints.forEach((c) => {
      if ((c.type === "pointOnLine" || c.type === "pointOnCircle") && sharps.has(c.point) && curves.has(c.entity)) used.add(c.point);
    });
  }
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

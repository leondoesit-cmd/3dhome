// SolidWorks-style sketch inference: object snaps, automatic relations, and
// per-entity fully/under/over-defined colours. Pure helpers so the canvas and
// the tests share one vocabulary.

const ORTHO_STEP = Math.PI / 2;
const ORTHO_ANGLE = 8 * Math.PI / 180;

function hypot(dx, dy) { return Math.hypot(dx || 0, dy || 0); }

function sketchPoint(sketch, id) {
  return (sketch.points || []).find(function (p) { return p.id === id; }) || null;
}

export function sketchStatusColor(status, flags) {
  flags = flags || {};
  if (flags.isDark) {
    if (flags.selected) return "#fb923c";
    if (flags.construction) return "#94a3b8";
    if (flags.drawing) return "#e2e8f0";
    if (status === "conflicting" || status === "over-defined") return "#fca5a5";
    if (status === "fully-defined") return "#f1f5f9";
    return "#38bdf8";
  }
  if (flags.selected) return "#e08030";
  if (flags.construction) return "#8394a6";
  if (flags.drawing) return "#18212b";
  if (status === "conflicting" || status === "over-defined") return "#d0342c";
  if (status === "fully-defined") return "#1b2733";
  return "#2684c7";
}

export function sketchSnapTargets(sketch, extras) {
  extras = extras || {};
  var ts = [];
  if (extras.includeOrigin !== false) ts.push({ u: 0, v: 0, k: "o" });
  (extras.poly || []).forEach(function (q) { ts.push({ u: q.u, v: q.v, k: "e" }); });
  (sketch && sketch.entities || []).forEach(function (entity) {
    if (extras.excludeEntity && entity === extras.excludeEntity) return;
    if (entity.type === "line") {
      var a = sketchPoint(sketch, entity.a), b = sketchPoint(sketch, entity.b);
      if (!a || !b) return;
      ts.push({ u: a.x, v: a.y, k: "e", pointId: a.id, entityId: entity.id });
      ts.push({ u: b.x, v: b.y, k: "e", pointId: b.id, entityId: entity.id });
      ts.push({ u: (a.x + b.x) / 2, v: (a.y + b.y) / 2, k: "m", entityId: entity.id });
      return;
    }
    if (entity.type === "circle" || entity.type === "arc") {
      var c = sketchPoint(sketch, entity.c || entity.center);
      if (!c) return;
      ts.push({ u: c.x, v: c.y, k: "c", pointId: c.id, entityId: entity.id });
      var r = entity.type === "circle" ? Math.abs(Number(entity.r) || 0) : hypot((sketchPoint(sketch, entity.a) || c).x - c.x, (sketchPoint(sketch, entity.a) || c).y - c.y);
      if (r > 0.25) {
        ts.push({ u: c.x + r, v: c.y, k: "q", entityId: entity.id });
        ts.push({ u: c.x - r, v: c.y, k: "q", entityId: entity.id });
        ts.push({ u: c.x, v: c.y + r, k: "q", entityId: entity.id });
        ts.push({ u: c.x, v: c.y - r, k: "q", entityId: entity.id });
      }
    }
  });
  return ts;
}

/* Nearest point ON each sketch circle, for the pointer at uv. Quadrants and
   centres are fixed spots; "down to the circumference" (HOUSING step 303)
   lands anywhere on the curve and still has to become Coincident-to-edge.
   Recomputed per pointer position, so it is not part of sketchSnapTargets. */
export function onCurveTargets(uv, sketch, origin, pxPerCm) {
  var out = [];
  if (!uv) return out;
  /* While a line is being drawn nearly vertical or horizontal, the spot on the
     curve is where THAT line meets it, not the radial projection of the
     cursor — otherwise "vertical line down to the circumference" lands a few
     millimetres sideways and loses its Vertical relation. */
  var ortho = origin ? inferOrthoSnap(uv, origin, pxPerCm, false).kind : null;
  (sketch && sketch.entities || []).forEach(function (entity) {
    if (!entity || entity.type !== "circle") return;
    var c = sketchPoint(sketch, entity.c || entity.center);
    var r = Math.abs(Number(entity.r) || 0);
    if (!c || !(r > 0)) return;
    if (ortho === "v" || ortho === "h") {
      var across = ortho === "v" ? origin.u - c.x : origin.v - c.y;
      if (Math.abs(across) > r) return;
      var half = Math.sqrt(r * r - across * across);
      var along = ortho === "v" ? uv.v - c.y : uv.u - c.x;
      var pick = Math.abs(along - half) <= Math.abs(along + half) ? half : -half;
      out.push(ortho === "v"
        ? { u: origin.u, v: c.y + pick, k: "on", entityId: entity.id }
        : { u: c.x + pick, v: origin.v, k: "on", entityId: entity.id });
      return;
    }
    var dx = uv.u - c.x, dy = uv.v - c.y, d = hypot(dx, dy);
    if (d < 1e-9) return;
    out.push({ u: c.x + (dx / d) * r, v: c.y + (dy / d) * r, k: "on", entityId: entity.id });
  });
  return out;
}

export function pickSnap(uv, targets, options) {
  options = options || {};
  if (options.suppress) return { snap: null, candidates: [] };
  var scale = options.scale > 0 ? options.scale : 1;
  /* 8 screen px, as a CAD inference pick radius. At 4 px a click aimed at a
     circle's quadrant from a zoomed-out model plane landed 6 px away, took the
     grid value (5.3 instead of 5.55625) and got no relation at all. */
  var thr = options.threshold != null ? options.threshold : 8 / scale;
  var hits = (targets || []).map(function (t) {
    return Object.assign({}, t, { d: hypot(uv.u - t.u, uv.v - t.v) });
  }).filter(function (t) { return t.d < thr; }).sort(function (a, b) {
    /* Inside the capture radius, sketch geometry outranks model footprint
       points. A footprint vertex of an extruded circle is a tessellation point
       of a 48-gon, not design intent: when it sat beside the circle's quadrant
       it won by a pixel and the line end got no relation (HOUSING step 300). */
    // point-like sketch snaps, then a spot on a sketch curve, then footprint points
    var rank = function (t) { return t.k === "on" ? 1 : t.pointId || t.entityId || t.k === "o" ? 0 : 2; };
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    // At the same location, prefer a real sketch point to a coordinate-only
    // target (notably the origin), so newly drawn geometry stays connected.
    if (Math.abs(a.d - b.d) < 1e-9) return Number(!!b.pointId) - Number(!!a.pointId);
    return a.d - b.d;
  });
  if (!hits.length) return { snap: null, candidates: [] };
  var index = ((options.cycleIndex || 0) % hits.length + hits.length) % hits.length;
  return { snap: hits[index], candidates: hits };
}

export function inferOrthoSnap(point, origin, pxPerCm, suppress) {
  if (suppress || !origin || !point) return { point: point, kind: null };
  var du = point.u - origin.u, dv = point.v - origin.v;
  var length = hypot(du, dv);
  if (length < 0.001) return { point: point, kind: null };
  var angle = Math.atan2(dv, du);
  var snapped = Math.round(angle / ORTHO_STEP) * ORTHO_STEP;
  var err = Math.abs(Math.atan2(Math.sin(angle - snapped), Math.cos(angle - snapped)));
  var pixelErr = Math.sin(err) * length * (pxPerCm || 2);
  if (err > ORTHO_ANGLE || pixelErr > 8) return { point: point, kind: null };
  var kind = Math.abs(Math.sin(snapped)) < 0.5 ? "h" : "v";
  return {
    point: { u: origin.u + Math.cos(snapped) * length, v: origin.v + Math.sin(snapped) * length },
    kind: kind,
  };
}

export function pointToLineDistance(point, a, b) {
  var dx = b.u - a.u, dy = b.v - a.v, span = hypot(dx, dy);
  if (span < 1e-9) return hypot(point.u - a.u, point.v - a.v);
  return Math.abs((point.u - a.u) * dy - (point.v - a.v) * dx) / span;
}

export function inferTangentCircle(line, circles) {
  if (!line || !line.a || !line.b) return null;
  var best = null, bestErr = 0.45;
  (circles || []).forEach(function (circle) {
    if (!circle || !(circle.r > 0) || !circle.center) return;
    /* A line that starts or ends ON the circle is not a tangent request: the
       HOUSING top line leaves the quadrant and is later dimensioned below it
       (step 330), which an inferred tangent would refuse. */
    var onCircle = function (p) { return Math.abs(hypot(p.u - circle.center.u, p.v - circle.center.v) - circle.r) < 1e-4 * Math.max(1, circle.r); };
    if (onCircle(line.a) || onCircle(line.b)) return;
    var err = Math.abs(pointToLineDistance(circle.center, line.a, line.b) - circle.r);
    if (err < bestErr) { bestErr = err; best = circle; }
  });
  return best;
}

export function inferLineRelations(line, from, to, snap, options) {
  options = options || {};
  if (!line || options.suppress) return [];
  var out = [];
  var dx = to.u - from.u, dy = to.v - from.v;
  if (Math.abs(dy) < 1e-4 && Math.abs(dx) > 1e-4) out.push({ type: "horizontal", entity: line.id });
  else if (Math.abs(dx) < 1e-4 && Math.abs(dy) > 1e-4) out.push({ type: "vertical", entity: line.id });
  if (snap && snap.k === "m" && snap.entityId) out.push({ type: "midpoint", point: line.b, entity: snap.entityId });
  if (snap && snap.k === "o") out.push({ type: "fixed", point: line.b, x: 0, y: 0 });
  if (snap && snap.k === "c" && snap.pointId && line.b !== snap.pointId) out.push({ type: "coincident", a: line.b, b: snap.pointId });
  // a quadrant is ON the circle: ending there is Coincident-to-edge, as in SOLIDWORKS
  // (HOUSING step 300: centerline to the top edge of the converted circle)
  if (snap && (snap.k === "q" || snap.k === "on") && snap.entityId) out.push({ type: "pointOnCircle", point: line.b, entity: snap.entityId });
  if (options.tangentCircleId) out.push({ type: "tangent", a: line.id, b: options.tangentCircleId });
  return out;
}

function constraintTouches(constraint, id) {
  return constraint.entity === id || constraint.a === id || constraint.b === id || constraint.point === id;
}

export function entityStatuses(sketch, solveInfo) {
  var entities = sketch && sketch.entities || [];
  var points = sketch && sketch.points || [];
  var constraints = (sketch && sketch.constraints || []).filter(function (c) { return !c.suppressed; });
  var entityStatus = {};
  var pointStatus = {};
  var conflicts = new Set((solveInfo && solveInfo.conflicts) || []);
  var sketchStatus = solveInfo && solveInfo.status;

  if (sketchStatus === "fully-constrained") {
    entities.forEach(function (e) { entityStatus[e.id] = "fully-defined"; });
    points.forEach(function (p) { pointStatus[p.id] = "fully-defined"; });
    return { entityStatus: entityStatus, pointStatus: pointStatus };
  }

  var entityIds = new Set(entities.map(function (e) { return e.id; }));
  var pointIds = new Set(points.map(function (p) { return p.id; }));

  constraints.forEach(function (c) {
    if (!conflicts.has(c.id) && sketchStatus !== "conflicting") return;
    if (!conflicts.has(c.id) && sketchStatus === "conflicting" && conflicts.size) return;
    [c.entity, c.a, c.b, c.point].forEach(function (id) {
      if (!id) return;
      if (entityIds.has(id)) entityStatus[id] = "conflicting";
      if (pointIds.has(id)) pointStatus[id] = "conflicting";
    });
  });

  points.forEach(function (p) {
    if (pointStatus[p.id]) return;
    if (p.fixed) pointStatus[p.id] = "fully-defined";
  });

  var coincidentConstraints = constraints.filter(function (c) { return c.type === "coincident"; });
  var fixedConstraints = constraints.filter(function (c) { return c.type === "fixed"; });
  var constraintsByEntity = new Map();
  constraints.forEach(function (c) {
    if (c.entity) {
      var list = constraintsByEntity.get(c.entity);
      if (!list) { list = []; constraintsByEntity.set(c.entity, list); }
      list.push(c);
    }
  });
  var lineEntities = entities.filter(function (e) { return e.type === "line"; });

  var changed = true, guard = 0;
  while (changed && guard++ < 24) {
    changed = false;
    coincidentConstraints.forEach(function (c) {
      if (pointStatus[c.a] === "fully-defined" && pointStatus[c.b] !== "fully-defined" && pointStatus[c.b] !== "conflicting") {
        pointStatus[c.b] = "fully-defined"; changed = true;
      }
      if (pointStatus[c.b] === "fully-defined" && pointStatus[c.a] !== "fully-defined" && pointStatus[c.a] !== "conflicting") {
        pointStatus[c.a] = "fully-defined"; changed = true;
      }
    });
    fixedConstraints.forEach(function (c) {
      if (c.point && pointStatus[c.point] !== "conflicting") {
        if (pointStatus[c.point] !== "fully-defined") { pointStatus[c.point] = "fully-defined"; changed = true; }
      }
    });
    lineEntities.forEach(function (e) {
      var eConstraints = constraintsByEntity.get(e.id) || [];
      var hasH = eConstraints.some(function (c) { return c.type === "horizontal"; });
      var hasV = eConstraints.some(function (c) { return c.type === "vertical"; });
      var hasD = eConstraints.some(function (c) { return c.type === "distance" && !c.driven; });
      if (!(hasD && (hasH || hasV))) return;
      if (pointStatus[e.a] === "fully-defined" && pointStatus[e.b] !== "fully-defined" && pointStatus[e.b] !== "conflicting") {
        pointStatus[e.b] = "fully-defined"; changed = true;
      }
      if (pointStatus[e.b] === "fully-defined" && pointStatus[e.a] !== "fully-defined" && pointStatus[e.a] !== "conflicting") {
        pointStatus[e.a] = "fully-defined"; changed = true;
      }
    });
  }

  entities.forEach(function (e) {
    if (entityStatus[e.id]) return;
    if (e.type === "line") {
      entityStatus[e.id] = pointStatus[e.a] === "fully-defined" && pointStatus[e.b] === "fully-defined"
        ? "fully-defined" : "under-defined";
      return;
    }
    var centreId = e.c || e.center;
    var centreDefined = pointStatus[centreId] === "fully-defined";
    var eConstraints = constraintsByEntity.get(e.id) || [];
    var hasR = eConstraints.some(function (c) {
      return (c.type === "radius" || c.type === "diameter") && !c.driven;
    });
    entityStatus[e.id] = centreDefined && hasR ? "fully-defined" : "under-defined";
  });
  points.forEach(function (p) {
    if (!pointStatus[p.id]) pointStatus[p.id] = "under-defined";
  });
  return { entityStatus: entityStatus, pointStatus: pointStatus };
}

export function nextInferenceIndex(candidates, current) {
  var n = (candidates || []).length;
  if (n < 2) return 0;
  return ((current || 0) + 1) % n;
}

export function constraintAlreadyPresent(sketch, candidate) {
  return (sketch.constraints || []).some(function (old) {
    if (old.suppressed || old.type !== candidate.type) return false;
    if (candidate.entity && old.entity !== candidate.entity) return false;
    if (candidate.point && old.point !== candidate.point) return false;
    if (candidate.a && !(old.a === candidate.a && old.b === candidate.b || old.a === candidate.b && old.b === candidate.a)) return false;
    if (!candidate.a && !candidate.entity && !candidate.point) return false;
    return true;
  });
}

export { constraintTouches };

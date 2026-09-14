import { lineData, pruneOrphanPoints, sketchEntity, sketchPoint, solveSketch } from "./sketch_solver.js";

const EPS = 1e-7;
const TAU = Math.PI * 2;

function uid(prefix = "fillet") {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

function constraintRefs(constraint, id) {
  if (!constraint || !id) return false;
  if (constraint.entity === id || constraint.a === id || constraint.b === id || constraint.point === id || constraint.center === id) return true;
  for (const pair of constraint.pairs || []) if (pair.includes(id)) return true;
  return false;
}

function otherEnd(line, vertexId) {
  return line.a === vertexId ? line.b : line.b === vertexId ? line.a : null;
}

function setEnd(line, vertexId, nextId) {
  if (line.a === vertexId) line.a = nextId;
  else if (line.b === vertexId) line.b = nextId;
}

function unitFrom(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  return { x: dx / len, y: dy / len, length: len };
}

function ccwSpan(start, end) {
  return (end - start + TAU) % TAU;
}

function addPoint(sketch, x, y, id) {
  const point = { id: id(), x, y };
  sketch.points.push(point);
  return point;
}

export function findFilletCorner(sketch, { vertexId, entityIds } = {}) {
  const lines = (sketch.entities || []).filter((entity) => entity.type === "line");
  const wanted = new Set(entityIds || []);
  if (vertexId) {
    const at = lines.filter((line) => line.a === vertexId || line.b === vertexId);
    const picked = wanted.size ? at.filter((line) => wanted.has(line.id)) : at;
    if (picked.length >= 2) return { vertexId, lines: picked.slice(0, 2) };
    /* A line meeting an arc end — HOUSING Sketchsquare's lower corners, where
       each side line lands on the trimmed Ø4.375 in arc (steps 335–336). */
    const arcs = (sketch.entities || []).filter((entity) => entity.type === "arc" && !entity.construction
      && (entity.a === vertexId || entity.b === vertexId) && (!wanted.size || wanted.has(entity.id)));
    if (picked.length === 1 && arcs.length === 1) return { vertexId, kind: "line-arc", line: picked[0], arc: arcs[0] };
    if (!wanted.size && at.length > 2) throw new Error("Select two entities to fillet");
    throw new Error("Select a sketch vertex or two entities to fillet");
  }
  if ((entityIds || []).length >= 2) {
    const a = sketchEntity(sketch, entityIds[0]), b = sketchEntity(sketch, entityIds[1]);
    const pair = [a, b];
    const pl = pair.find((e) => e?.type === "line"), pa = pair.find((e) => e?.type === "arc");
    if (pl && pa) {
      const shared = [pl.a, pl.b].find((id) => id === pa.a || id === pa.b);
      if (!shared) throw new Error("The line and arc must share an end point");
      return { vertexId: shared, kind: "line-arc", line: pl, arc: pa };
    }
    if (a?.type !== "line" || b?.type !== "line") throw new Error("Sketch Fillet supports two lines, or a line and an arc, that share a vertex");
    const shared = [a.a, a.b].find((id) => id === b.a || id === b.b);
    if (!shared) throw new Error("The lines must share a vertex");
    return { vertexId: shared, lines: [a, b] };
  }
  throw new Error("Select a sketch vertex or two entities to fillet");
}

/* Fillet where a line meets an arc end. The fillet circle's centre is `radius`
   off the line and R − radius (inside the arc) or R + radius (outside) from the
   arc centre. Of the candidates whose tangent points land on the line segment
   and on the arc next to the corner, the one that trims least is the corner
   fillet. The corner point survives only when a dimension measures to it; its
   geometric relations (HOUSING's Symmetric pair between the two lower corners)
   are implied by the fillets and would otherwise over-define the sketch. */
function filletLineArcCorner(sketch, corner, radius, options, id) {
  const vertex = sketchPoint(sketch, corner.vertexId);
  const { line, arc } = corner;
  const centre = sketchPoint(sketch, arc.c);
  const far = sketchPoint(sketch, otherEnd(line, corner.vertexId));
  const aEnd = sketchPoint(sketch, arc.a), bEnd = sketchPoint(sketch, arc.b);
  if (!vertex || !centre || !far || !aEnd || !bEnd) throw new Error("Select a sketch vertex or two entities to fillet");
  const dir = unitFrom(vertex, far);
  const R = Math.hypot(vertex.x - centre.x, vertex.y - centre.y);
  if (!dir || R <= EPS) throw new Error("The radius is too large for this line and arc");
  const angA = Math.atan2(aEnd.y - centre.y, aEnd.x - centre.x);
  const angB = Math.atan2(bEnd.y - centre.y, bEnd.x - centre.x);
  const sweep = ccwSpan(angA, angB) || TAU;
  const atStart = arc.a === corner.vertexId;
  const normal = { x: -dir.y, y: dir.x };
  let best = null;
  for (const side of [1, -1]) {
    for (const internal of [true, false]) {
      const reach = internal ? R - radius : R + radius;
      if (reach <= EPS) continue;
      const ox = vertex.x + normal.x * side * radius - centre.x;
      const oy = vertex.y + normal.y * side * radius - centre.y;
      const half = ox * dir.x + oy * dir.y, rest = ox * ox + oy * oy - reach * reach;
      const disc = half * half - rest;
      if (disc < 0) continue;
      for (const s of [-half - Math.sqrt(disc), -half + Math.sqrt(disc)]) {
        if (!(s > 1e-6 && s < dir.length - 1e-6)) continue;
        const P = { x: centre.x + ox + dir.x * s, y: centre.y + oy + dir.y * s };
        const u = unitFrom(centre, P);
        if (!u) continue;
        const t2 = { x: centre.x + u.x * R, y: centre.y + u.y * R };
        const ang = Math.atan2(t2.y - centre.y, t2.x - centre.x);
        const along = atStart ? ccwSpan(angA, ang) : ccwSpan(ang, angB);
        if (!(along > 1e-6 && along < sweep - 1e-6)) continue;
        const trim = s + along * R;
        if (!best || trim < best.trim) best = { P, t1: { x: vertex.x + dir.x * s, y: vertex.y + dir.y * s }, t2, trim };
      }
    }
  }
  if (!best) throw new Error("The radius is too large for this line and arc");

  const related = (sketch.constraints || []).filter((constraint) => constraintRefs(constraint, corner.vertexId));
  const keep = options.keepConstrainedCorners !== false && related.length > 0;
  const savedPoint = keep ? { ...vertex, virtualSharp: true } : null;
  const p1 = addPoint(sketch, best.t1.x, best.t1.y, id);
  const p2 = addPoint(sketch, best.t2.x, best.t2.y, id);
  const pc = addPoint(sketch, best.P.x, best.P.y, id);
  setEnd(line, corner.vertexId, p1.id);
  if (atStart) arc.a = p2.id; else arc.b = p2.id;
  const s1 = Math.atan2(p1.y - pc.y, p1.x - pc.x), s2 = Math.atan2(p2.y - pc.y, p2.x - pc.x);
  const minorFromP1 = ccwSpan(s1, s2) <= Math.PI;
  const fillet = {
    id: id(), type: "arc", name: "Sketch fillet",
    c: pc.id, a: minorFromP1 ? p1.id : p2.id, b: minorFromP1 ? p2.id : p1.id,
    construction: false,
  };
  sketch.entities.push(fillet);
  sketch.constraints = sketch.constraints || [];
  sketch.constraints.push(
    { id: id(), type: "tangent", a: line.id, b: fillet.id },
    { id: id(), type: "tangent", a: arc.id, b: fillet.id },
  );
  if (options.dimension !== false) {
    sketch.constraints.push({ id: id(), type: "radius", entity: fillet.id, value: radius, driven: false });
  }
  pruneOrphanPoints(sketch);
  if (savedPoint && !(sketch.points || []).some((point) => point.id === savedPoint.id)) {
    /* A virtual sharp: the corner stays as a point on the line, carrying the
       relations it had. Dropping them lost information — the Symmetric pair
       between HOUSING's lower corners is what held the mirrored side line
       vertical, and filleting one corner left that line free to tilt. Whether
       the corner also needs to sit on the arc's circle depends on what else
       places it (after the mirror partner is filleted too, it does), so both
       forms are solved and the one that repeats no rule and leaves the least
       freedom is kept. */
    sketch.points.push(savedPoint);
    for (const constraint of related) {
      if (!sketch.constraints.some((item) => item.id === constraint.id)) sketch.constraints.push(constraint);
    }
    sketch.constraints.push({ id: id(), type: "pointOnLine", point: savedPoint.id, entity: line.id });
    const onCircle = { id: id(), type: "pointOnCircle", point: savedPoint.id, entity: arc.id };
    const trial = (extra) => {
      const copy = JSON.parse(JSON.stringify(sketch));
      if (extra) copy.constraints.push(extra);
      const report = solveSketch(copy);
      return { converged: !!report.converged, redundant: !!report.redundant, dof: Number(report.degreesOfFreedom) || 0 };
    };
    const without = trial(null), withCircle = trial(onCircle);
    if (withCircle.converged && !withCircle.redundant && (without.redundant || withCircle.dof < without.dof)) {
      sketch.constraints.push(onCircle);
    }
  }
  return { arc: fillet, lines: [line], arcs: [arc], radius };
}

export function filletSketchCorner(sketch, options = {}, id = uid) {
  const radius = Number(options.radius);
  if (!Number.isFinite(radius) || radius <= EPS) throw new Error("Fillet radius must be a positive finite length");
  const corner = findFilletCorner(sketch, options);
  if (corner.kind === "line-arc") return filletLineArcCorner(sketch, corner, radius, options, id);
  const vertex = sketchPoint(sketch, corner.vertexId);
  if (!vertex) throw new Error("Select a sketch vertex or two entities to fillet");
  const lineA = corner.lines[0], lineB = corner.lines[1];
  const farA = sketchPoint(sketch, otherEnd(lineA, corner.vertexId));
  const farB = sketchPoint(sketch, otherEnd(lineB, corner.vertexId));
  const dirA = unitFrom(vertex, farA), dirB = unitFrom(vertex, farB);
  if (!dirA || !dirB) throw new Error("The radius is too large for these lines or this angle");
  const cos = Math.min(1, Math.max(-1, dirA.x * dirB.x + dirA.y * dirB.y));
  const theta = Math.acos(cos);
  if (!(theta > 1e-3 && theta < Math.PI - 1e-3)) throw new Error("The selected lines are parallel or collinear");
  const inset = radius / Math.tan(theta / 2);
  if (inset > dirA.length - 1e-6 || inset > dirB.length - 1e-6) {
    throw new Error("The radius is too large for these lines or this angle");
  }
  const t1 = { x: vertex.x + dirA.x * inset, y: vertex.y + dirA.y * inset };
  const t2 = { x: vertex.x + dirB.x * inset, y: vertex.y + dirB.y * inset };
  const bisectLen = Math.hypot(dirA.x + dirB.x, dirA.y + dirB.y);
  const reach = radius / Math.sin(theta / 2);
  const center = {
    x: vertex.x + (dirA.x + dirB.x) / bisectLen * reach,
    y: vertex.y + (dirA.y + dirB.y) / bisectLen * reach,
  };
  const keep = options.keepConstrainedCorners !== false
    && (sketch.constraints || []).some((constraint) => constraintRefs(constraint, corner.vertexId));
  const farAId = otherEnd(lineA, corner.vertexId);
  const farBId = otherEnd(lineB, corner.vertexId);
  const lengthDims = (sketch.constraints || []).filter((constraint) => (
    constraint.type === "distance" && constraint.driven !== true && (constraint.entity === lineA.id || constraint.entity === lineB.id)
  ));
  const savedCorner = [];
  for (const constraint of lengthDims) {
    const far = constraint.entity === lineA.id ? farAId : farBId;
    delete constraint.entity;
    constraint.a = far;
    constraint.b = corner.vertexId;
  }
  if (lengthDims.length) {
    for (const line of [lineA, lineB]) {
      const extra = { id: id(), type: "pointOnLine", point: corner.vertexId, entity: line.id };
      sketch.constraints.push(extra);
      savedCorner.push(extra);
    }
  }
  const savedPoint = (keep || lengthDims.length) ? { ...vertex } : null;
  const savedConstraints = keep
    ? (sketch.constraints || []).filter((constraint) => constraintRefs(constraint, corner.vertexId))
    : [];
  const savedLength = lengthDims.map((constraint) => ({ ...constraint }));

  const p1 = addPoint(sketch, t1.x, t1.y, id);
  const p2 = addPoint(sketch, t2.x, t2.y, id);
  const pc = addPoint(sketch, center.x, center.y, id);
  setEnd(lineA, corner.vertexId, p1.id);
  setEnd(lineB, corner.vertexId, p2.id);

  const start = Math.atan2(p1.y - pc.y, p1.x - pc.x);
  const end = Math.atan2(p2.y - pc.y, p2.x - pc.x);
  const swap = Math.abs(ccwSpan(start, end) - theta) > Math.abs(ccwSpan(end, start) - theta);
  const arc = {
    id: id(), type: "arc", name: "Sketch fillet",
    c: pc.id, a: swap ? p2.id : p1.id, b: swap ? p1.id : p2.id,
    construction: false,
  };
  sketch.entities.push(arc);
  sketch.constraints = sketch.constraints || [];
  sketch.constraints.push(
    { id: id(), type: "tangent", a: lineA.id, b: arc.id },
    { id: id(), type: "tangent", a: lineB.id, b: arc.id },
  );
  if (options.dimension !== false) {
    sketch.constraints.push({ id: id(), type: "radius", entity: arc.id, value: radius, driven: false });
  }
  pruneOrphanPoints(sketch);
  if (savedPoint && !(sketch.points || []).some((point) => point.id === savedPoint.id)) {
    sketch.points.push(savedPoint);
    for (const constraint of savedConstraints.concat(savedLength, savedCorner)) {
      if (!(sketch.constraints || []).some((item) => item.id === constraint.id)) sketch.constraints.push(constraint);
    }
  }
  const points = new Map((sketch.points || []).map((point) => [point.id, point]));
  const measured = lineData(lineA, points) && lineData(lineB, points);
  if (!measured) throw new Error("The radius is too large for these lines or this angle");
  return { arc, lines: [lineA, lineB], radius };
}

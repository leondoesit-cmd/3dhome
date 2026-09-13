import { lineData, pruneOrphanPoints, sketchEntity, sketchPoint } from "./sketch_solver.js";

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
    if (!wanted.size && at.length > 2) throw new Error("Select two entities to fillet");
    throw new Error("Select a sketch vertex or two entities to fillet");
  }
  if ((entityIds || []).length >= 2) {
    const a = sketchEntity(sketch, entityIds[0]), b = sketchEntity(sketch, entityIds[1]);
    if (a?.type !== "line" || b?.type !== "line") throw new Error("Sketch Fillet currently supports two lines that share a vertex");
    const shared = [a.a, a.b].find((id) => id === b.a || id === b.b);
    if (!shared) throw new Error("The lines must share a vertex");
    return { vertexId: shared, lines: [a, b] };
  }
  throw new Error("Select a sketch vertex or two entities to fillet");
}

export function filletSketchCorner(sketch, options = {}, id = uid) {
  const radius = Number(options.radius);
  if (!Number.isFinite(radius) || radius <= EPS) throw new Error("Fillet radius must be a positive finite length");
  const corner = findFilletCorner(sketch, options);
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

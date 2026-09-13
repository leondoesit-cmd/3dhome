import {recordSketchEdit} from "./sketch_edit_repair.js";
import {trimSplineAtLines,splineControls,bezierLineHits} from "./sketch_spline.js";
import {editRoundEntity,pointOnArc} from "./sketch_round_trim.js";
// Sketch trimming, extending, offset, construction toggle, and edge projection tools.

import { sketchPoint, sketchEntity, circleData, pruneOrphanPoints } from "./sketch_solver.js";

let seq = 0;
function uid(prefix) { return prefix + "_" + (seq++).toString(36) + Math.random().toString(36).slice(2, 7); }

// Line-line intersection helper
export function intersectLines(l1, l2) {
  const dx1 = l1.b.x - l1.a.x, dy1 = l1.b.y - l1.a.y;
  const dx2 = l2.b.x - l2.a.x, dy2 = l2.b.y - l2.a.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((l2.a.x - l1.a.x) * dy2 - (l2.a.y - l1.a.y) * dx2) / denom;
  const u = ((l2.a.x - l1.a.x) * dy1 - (l2.a.y - l1.a.y) * dx1) / denom;
  return {
    x: l1.a.x + t * dx1,
    y: l1.a.y + t * dy1,
    t, u,
    onSegment1: t >= -1e-6 && t <= 1 + 1e-6,
    onSegment2: u >= -1e-6 && u <= 1 + 1e-6,
  };
}

// Line-circle intersection. `bounded` limits hits to the drawn segment; extend
// needs the unbounded solution to find where the line *would* meet the circle.
export function intersectLineCircle(l, c, bounded = true) {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
  const fx = l.a.x - c.center.x, fy = l.a.y - c.center.y;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - c.radius * c.radius;
  let discriminant = B * B - 4 * A * C;
  if (A < 1e-12 || discriminant < 0) return [];
  discriminant = Math.sqrt(discriminant);
  const results = [];
  [(-B - discriminant) / (2 * A), (-B + discriminant) / (2 * A)].forEach((t) => {
    if (!bounded || (t >= -1e-6 && t <= 1 + 1e-6)) {
      results.push({ x: l.a.x + t * dx, y: l.a.y + t * dy, t });
    }
  });
  return results;
}

// Every place `entity` is crossed by other sketch geometry, as parameters along
// the entity. Shared by trim (nearest cut either side of the pick) and extend
// (first cut beyond an end).
function crossings(sketch, entity, points) {
  const pa = points.get(entity.a), pb = points.get(entity.b);
  if (!pa || !pb) return [];
  const self = { a: pa, b: pb };
  const out = [];
  for (const other of sketch.entities || []) {
    if (other.id === entity.id) continue;
    if (other.type === "line") {
      const oa = points.get(other.a), ob = points.get(other.b);
      if (!oa || !ob) continue;
      const hit = intersectLines(self, { a: oa, b: ob });
      if (hit && hit.onSegment2) out.push({ t: hit.t, x: hit.x, y: hit.y });
    } else if(other.type==="spline"){
      const controls=splineControls(other,points);if(controls)bezierLineHits(controls,pa,pb).forEach(hit=>out.push({...hit,t:hit.u}));
    } else if (other.type === "circle" || other.type === "arc") {
      const circ = circleData(other, points);
      if (!circ) continue;
      intersectLineCircle(self, circ, false).filter(hit=>pointOnArc(hit,circ)).forEach((hit) => out.push(hit));
    }
  }
  return out.sort((m, n) => m.t - n.t);
}

// Trim entity at pick point
export function trimEntity(sketch,entityId,pickPt){return recordSketchEdit(sketch,"trim",entityId,()=>trimEntityRaw(sketch,entityId,pickPt));}
function trimEntityRaw(sketch, entityId, pickPt) {
  const entity = sketchEntity(sketch, entityId);
  if(entity?.type==="spline"){const ok=trimSplineAtLines(sketch,entity,pickPt);if(ok)pruneOrphanPoints(sketch);return ok;}
  if(entity && ["arc","circle"].includes(entity.type))return editRoundEntity(sketch,entity,pickPt,false,intersectLineCircle);
  if (!entity || entity.type !== "line") return false;

  const points = new Map(sketch.points.map((p) => [p.id, p]));
  const pa = points.get(entity.a), pb = points.get(entity.b);
  if (!pa || !pb) return false;

  const intersections = crossings(sketch, entity, points)
    .filter((h) => h.t > 1e-6 && h.t < 1 - 1e-6);

  if (!intersections.length) {
    sketch.entities = sketch.entities.filter((e) => e.id !== entityId);
    pruneOrphanPoints(sketch);
    return true;
  }

  const dx = pb.x - pa.x, dy = pb.y - pa.y, len2 = dx * dx + dy * dy;
  const clickT = len2 > 1e-9 ? ((pickPt.x - pa.x) * dx + (pickPt.y - pa.y) * dy) / len2 : 0;

  let leftT = 0, rightT = 1;
  for (const hit of intersections) {
    if (hit.t <= clickT) leftT = Math.max(leftT, hit.t);
    if (hit.t >= clickT) rightT = Math.min(rightT, hit.t);
  }

  if (leftT > 0 && rightT < 1) {
    // the pick was on a middle piece: keep both outer stubs
    const newP1 = { id: uid("pt"), x: pa.x + leftT * dx, y: pa.y + leftT * dy };
    const newP2 = { id: uid("pt"), x: pa.x + rightT * dx, y: pa.y + rightT * dy };
    sketch.points.push(newP1, newP2);
    const oldB = entity.b;
    entity.b = newP1.id;
    sketch.entities.push({ id: uid("line"), type: "line", name: "Line", a: newP2.id, b: oldB, construction: entity.construction });
  } else if (leftT > 0) {
    const newP = { id: uid("pt"), x: pa.x + leftT * dx, y: pa.y + leftT * dy };
    sketch.points.push(newP);
    entity.b = newP.id;
  } else if (rightT < 1) {
    const newP = { id: uid("pt"), x: pa.x + rightT * dx, y: pa.y + rightT * dy };
    sketch.points.push(newP);
    entity.a = newP.id;
  } else {
    sketch.entities = sketch.entities.filter((e) => e.id !== entityId);
  }

  // A trimmed line no longer has the length it was dimensioned to; keeping the
  // old dimension would let the solver snap it straight back.
  sketch.constraints = sketch.constraints.filter((c) => !(c.entity === entityId && (c.type === "distance" || c.type === "angle")));
  pruneOrphanPoints(sketch);
  return true;
}

/* Extend the end nearest the pick out to the first piece of geometry it meets.
   Nothing in the way means nothing happens — silently stretching to an
   arbitrary length is worse than refusing. */
export function extendEntity(sketch,entityId,pickPt){return recordSketchEdit(sketch,"extend",entityId,()=>extendEntityRaw(sketch,entityId,pickPt));}
function extendEntityRaw(sketch, entityId, pickPt) {
  const entity = sketchEntity(sketch, entityId);
  if(entity && ["arc","circle"].includes(entity.type))return editRoundEntity(sketch,entity,pickPt,true,intersectLineCircle);
  if (!entity || entity.type !== "line") return false;
  const points = new Map(sketch.points.map((p) => [p.id, p]));
  const pa = points.get(entity.a), pb = points.get(entity.b);
  if (!pa || !pb) return false;

  const dx = pb.x - pa.x, dy = pb.y - pa.y, len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return false;
  const clickT = ((pickPt.x - pa.x) * dx + (pickPt.y - pa.y) * dy) / len2;
  const hits = crossings(sketch, entity, points);

  if (clickT > 0.5) {
    const beyond = hits.filter((h) => h.t > 1 + 1e-6).sort((m, n) => m.t - n.t)[0];
    if (!beyond) return false;
    pb.x = beyond.x; pb.y = beyond.y;
  } else {
    const before = hits.filter((h) => h.t < -1e-6).sort((m, n) => n.t - m.t)[0];
    if (!before) return false;
    pa.x = before.x; pa.y = before.y;
  }
  sketch.constraints = sketch.constraints.filter((c) => !(c.entity === entityId && c.type === "distance"));
  return true;
}

// Offset line or circle
export function offsetEntity(sketch, entityId, distance) {
  const entity = sketchEntity(sketch, entityId);
  if (!entity || entity.projectedCurve || !Number.isFinite(distance)) return null;
  const points = new Map(sketch.points.map((p) => [p.id, p]));

  if (entity.type === "line") {
    const pa = points.get(entity.a), pb = points.get(entity.b);
    if (!pa || !pb) return null;
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    const nx = -dy / len * distance, ny = dx / len * distance;

    const p1 = { id: uid("pt"), x: pa.x + nx, y: pa.y + ny };
    const p2 = { id: uid("pt"), x: pb.x + nx, y: pb.y + ny };
    sketch.points.push(p1, p2);

    const newLine = { id: uid("line"), type: "line", name: "Line", a: p1.id, b: p2.id, construction: entity.construction };
    sketch.entities.push(newLine);
    // the offset copy stays parallel to its parent, the way it would in a
    // sketch you keep editing
    sketch.constraints.push({ id: uid("c"), type: "parallel", a: entity.id, b: newLine.id });
    sketch.constraints.push({id:uid("c"),type:"offset",a:entity.id,b:newLine.id,value:distance});
    return newLine;
  }
  if (entity.type === "circle") {
    const c = points.get(entity.c ?? entity.center);
    if (!c) return null;
    const newR = (Number(entity.r) || 0) + distance;
    if(!(newR>1e-6))return null;
    const newC = { id: uid("pt"), x: c.x, y: c.y };
    sketch.points.push(newC);
    const newCircle = { id: uid("circle"), type: "circle", name: "Circle", c: newC.id, r: newR, construction: entity.construction };
    sketch.entities.push(newCircle);
    sketch.constraints.push({ id: uid("c"), type: "concentric", a: entity.id, b: newCircle.id });
    sketch.constraints.push({id:uid("c"),type:"offset",a:entity.id,b:newCircle.id,value:distance});
    return newCircle;
  }
  return null;
}

// Toggle construction entity
export function toggleConstruction(sketch, entityId) {
  const entity = sketchEntity(sketch, entityId);
  if (entity) {
    entity.construction = !entity.construction;
    return true;
  }
  return false;
}

/* Project a solid part's silhouette in the current view onto the sketch as
   construction geometry, so new sketch geometry can be constrained to a body
   that already exists. `loop` is [{u,v}] in sketch coordinates. */
export function projectLoop(sketch, loop, construction = true, closed = true) {
  if (!loop || loop.length < 2) return [];
  const ids = loop.map((q) => {
    const p = { id: uid("pt"), x: q.u, y: q.v };
    sketch.points.push(p);
    return p.id;
  });
  const made = [];
  const edgeCount=closed?ids.length:ids.length-1;
  for (let i = 0; i < edgeCount; i++) {
    const a = ids[i], b = ids[(i + 1) % ids.length];
    if (a === b) continue;
    const line = { id: uid("line"), type: "line", name: "Projected", a, b, construction, projected: true };
    sketch.entities.push(line);
    made.push(line);
  }
  return made;
}

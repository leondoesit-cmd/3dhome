// Sketch mirror and linear pattern.
//
// Both produce real sketch geometry that stays *tied* to its source through
// constraints, rather than a detached copy. That is the difference between a
// pattern you can still design with and a pattern you have to delete and redo:
// move the original, and every copy follows; drive the spacing with a named
// dimension, and the whole array resizes with it.
//
// The circular pattern is held by a single `rotation` constraint per copy — one
// centre, one angle, every point pair of that copy. That is what makes it a
// pattern rather than a rotated snapshot: the whole ring turns from one number,
// and dragging the source drags the ring.

import { sketchEntity, entityPoints } from "./sketch_solver.js";

let seq = 0;
function uid(prefix) { return prefix + "_" + (seq++).toString(36) + Math.random().toString(36).slice(2, 7); }

function pointMap(sketch) {
  return new Map((sketch.points || []).map((p) => [p.id, p]));
}

/* Copy a set of entities, sharing one new point per source point so a copied
   corner stays a corner. Returns the new entities and the source→copy point
   map, which is what the caller constrains against. */
function copyEntities(sketch, entities, place) {
  const map = new Map();
  const pairs = [];

  entities.forEach((entity) => {
    entityPoints(sketch, entity).forEach((p) => {
      if (map.has(p.id)) return;
      const at = place(p);
      // a point the transform leaves where it is (on a mirror axis) IS its copy
      if (at && at.same) { map.set(p.id, p); return; }
      const copy = { id: uid("pt"), x: at.x, y: at.y };
      sketch.points.push(copy);
      map.set(p.id, copy);
    });
  });

  entities.forEach((entity) => {
    // an entity every one of whose points maps to itself would be a duplicate lying on top of it
    if (entityPoints(sketch, entity).every((p) => map.get(p.id) === p)) return;
    const copy = { ...entity, id: uid(entity.type) };
    if (entity.type === "line") { copy.a = map.get(entity.a).id; copy.b = map.get(entity.b).id; }
    else if (entity.type === "spline") { for(const key of ["a","h1","h2","b"])copy[key]=map.get(entity[key]).id; }
    else if (entity.type === "circle") { copy.c = map.get(entity.c ?? entity.center).id; copy.r = entity.r; }
    else if (entity.type === "ellipse") {
      copy.c = map.get(entity.c ?? entity.center).id;
      copy.rx = entity.rx; copy.ry = entity.ry; copy.rot = entity.rot;
    }
    else if (entity.type === "arc") {
      copy.c = map.get(entity.c ?? entity.center).id;
      copy.a = map.get(entity.a).id;
      copy.b = map.get(entity.b).id;
    } else return;                       // an unsupported kind is skipped, so
    sketch.entities.push(copy);          // source↔copy is paired explicitly
    pairs.push({ source: entity, copy }); // rather than by array index
  });

  return { pairs, entities: pairs.map((p) => p.copy), points: map };
}

/* Mirror across a sketch line. The copies are held in place by symmetric
   constraints — one per point pair — so this is a live relationship, not a
   snapshot: drag the original and the reflection moves with it. */
export function mirrorEntities(sketch, entityIds, axisEntityId) {
  const axis = sketchEntity(sketch, axisEntityId);
  if (!axis || axis.type !== "line") return null;
  const points = pointMap(sketch);
  const a = points.get(axis.a), b = points.get(axis.b);
  if (!a || !b) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return null;

  const sources = entityIds.map((id) => sketchEntity(sketch, id)).filter(Boolean)
    .filter((e) => e.id !== axisEntityId);
  if (!sources.length) return null;

  /* A point ON the axis is its own reflection. Copying it left the mirrored
     top line of HOUSING's Sketchsquare starting at a duplicate of the
     centerline end — two open endpoints and a branched profile. */
  const onAxisTol = 1e-6 * Math.max(1, Math.sqrt(len2));
  const reflect = (p) => {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    const fx = a.x + dx * t, fy = a.y + dy * t;      // foot of the perpendicular
    if (Math.hypot(p.x - fx, p.y - fy) <= onAxisTol) return { same: true };
    return { x: 2 * fx - p.x, y: 2 * fy - p.y };
  };

  const made = copyEntities(sketch, sources, reflect);
  made.points.forEach((copy, sourceId) => {
    if (copy.id === sourceId) return;               // on the axis: no pair to hold
    sketch.constraints.push({ id: uid("c"), type: "symmetric", a: sourceId, b: copy.id, entity: axisEntityId });
  });
  // a mirrored circle keeps its parent's radius; an ellipse keeps both semi-axes
  // and starts at the reflected tilt. Its tilt then stays a free degree of
  // freedom, because a reflection reverses orientation and so cannot be written
  // as the angle offset the solver's rotation residual expresses — better to
  // report that honestly in the DOF count than to pretend it is held.
  const axisAngle = Math.atan2(dy, dx);
  made.pairs.forEach(({ source, copy }) => {
    /* An arc runs counter-clockwise from a to b. A reflection reverses that
       sense, so the reflected ends must swap or the copy sweeps the other way
       round the circle: HOUSING's mirrored R .5 in fillet came out as a 270°
       loop bulging into the Sketchsquare profile. Patterns keep a/b — a
       translation or rotation preserves orientation. */
    if (copy.type === "arc") { const end = copy.a; copy.a = copy.b; copy.b = end; }
    if (copy.type === "circle" || copy.type === "ellipse") {
      sketch.constraints.push({ id: uid("c"), type: "equal", a: source.id, b: copy.id });
    }
    if (copy.type === "ellipse") copy.rot = 2 * axisAngle - (Number(source.rot) || 0);
  });
  return made;
}

/* Circular pattern about a sketch point. Each copy is held by ONE rotation
   constraint carrying every point pair of that copy, so the copy is rigid and
   its angular pitch is a single editable dimension — name it, drive it from an
   equation, and the whole ring follows. Compare the linear pattern, which needs
   an alignment plus a distance per copy because there is no single relation
   that says "the same, moved".

   `angle` is the pitch between neighbours in degrees; omit it for a full circle
   evenly divided by `count`. */
export function circularPatternEntities(sketch, entityIds, options = {}) {
  const count = Math.max(2, Math.min(200, Math.round(Number(options.count) || 2)));
  const centre = (sketch.points || []).find((p) => p.id === options.center);
  if (!centre) return null;
  const pitch = Number.isFinite(Number(options.angle)) && Number(options.angle)
    ? Number(options.angle) : 360 / count;

  const sources = entityIds.map((id) => sketchEntity(sketch, id)).filter(Boolean);
  if (!sources.length) return null;

  const made = [];
  const dimensions = [];
  for (let k = 1; k < count; k++) {
    const step = pitch * k, rad = (step * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const turn = (p) => {
      const x = p.x - centre.x, y = p.y - centre.y;
      return { x: centre.x + x * cos - y * sin, y: centre.y + x * sin + y * cos };
    };
    const copy = copyEntities(sketch, sources, turn);
    const pairs = [];
    copy.points.forEach((to, sourceId) => pairs.push([sourceId, to.id]));
    const spins = [];
    copy.pairs.forEach(({ source, copy: entity }) => {
      if (entity.type === "circle" || entity.type === "ellipse") {
        sketch.constraints.push({ id: uid("c"), type: "equal", a: source.id, b: entity.id });
      }
      if (entity.type === "ellipse") {
        entity.rot = (Number(source.rot) || 0) + rad;
        spins.push([source.id, entity.id]);
      }
    });
    const dim = { id: uid("dim"), type: "rotation", center: centre.id, pairs, spins, value: step };
    sketch.constraints.push(dim);
    dimensions.push(dim);
    made.push(copy);
  }
  return { copies: made, dimensions, center: centre.id, pitch };
}

/* Linear pattern along U or V. Each copy is tied to the original by one
   distance constraint carrying every point pair and the translation direction.
   The distance is
   an ordinary driving dimension, so it can be named and driven by an equation —
   which is how "six shelves at Pitch centres" becomes one number to edit.

   Returns the ids of the spacing dimensions so the caller can name them. */
export function linearPatternEntities(sketch, entityIds, options = {}) {
  const count = Math.max(2, Math.min(200, Math.round(Number(options.count) || 2)));
  const spacing = Number(options.spacing);
  const direction = options.direction === "v" ? "v" : "u";
  if (!Number.isFinite(spacing) || Math.abs(spacing) < 1e-6) return null;

  const sources = entityIds.map((id) => sketchEntity(sketch, id)).filter(Boolean);
  if (!sources.length) return null;

  const made = [];
  const dimensions = [];
  for (let k = 1; k < count; k++) {
    const step = spacing * k;
    const offset = (p) => ({
      x: p.x + (direction === "u" ? step : 0),
      y: p.y + (direction === "u" ? 0 : step),
    });
    const copy = copyEntities(sketch, sources, offset);
    const pairs=Array.from(copy.points,([id,point])=>[id,point.id]);
    const dim={id:uid("dim"),type:"distance",patternTranslation:true,shapes:copy.pairs.map(({source,copy:entity})=>[source.id,entity.id]),a:pairs[0][0],b:pairs[0][1],pairs,direction,value:step};
    sketch.constraints.push(dim);dimensions.push(dim);
    copy.pairs.forEach(({source,copy:entity})=>{
      if(entity.type==="circle")sketch.constraints.push({id:uid("c"),type:"equal",a:source.id,b:entity.id});
    });
    made.push(copy);
  }
  return { copies: made, dimensions };
}

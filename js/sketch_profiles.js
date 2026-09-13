import {splineControls,sampleBezier} from "./sketch_spline.js";
// Closed-profile discovery and repair for parametric sketches.
//
// A profile is topology, not a picture: its edges have to form a graph whose
// vertices all have degree two. The editor still needs to be humane, though,
// so analysis treats endpoints within a small tolerance as one vertex and can
// commit that repair before a feature stores the profile.

const TAU = Math.PI * 2;

function pointMap(sketch) {
  return new Map((sketch.points || []).map((p) => [p.id, p]));
}

function circleData(entity, points) {
  if (!entity) return null;
  if (entity.type === "circle") {
    const center = points.get(entity.c ?? entity.center);
    return center ? {center, radius:Math.abs(Number(entity.r) || 0), entity} : null;
  }
  if (entity.type === "arc") {
    const center = points.get(entity.c ?? entity.center), a = points.get(entity.a), b = points.get(entity.b);
    if (!center || !a || !b) return null;
    return {center,a,b,entity,radius:Math.hypot(a.x-center.x,a.y-center.y),start:Math.atan2(a.y-center.y,a.x-center.x),end:Math.atan2(b.y-center.y,b.x-center.x)};
  }
  return null;
}

/* How many chords a curve is worth.
   Tying the count to raw size — "one segment per half centimetre of radius" —
   makes roundness an accident of scale: the same rule that leaves a 2 cm hole
   over-sampled leaves a 40 cm cylinder visibly faceted. What the eye actually
   reads is the sagitta, the gap between the chord and the true arc, which is
   r·(1−cos(θ/2)). Solving that for a fixed deviation keeps every curve equally
   round, small or large, and spends points only where they show. */
const CHORD_TOLERANCE = 0.015;    // cm — under a fifth of a millimetre off the arc
export function curveSegments(radius, span = TAU, min = 12, max = 96) {
  const r = Math.max(Math.abs(Number(radius) || 0), 1e-6);
  const step = 2 * Math.acos(Math.max(0, Math.min(1, 1 - CHORD_TOLERANCE / r)));
  return Math.max(min, Math.min(max, Math.ceil(Math.abs(span) / Math.max(step, 1e-6))));
}

/* A circle or an ellipse sampled into the polyline the feature engine consumes. */
function sampleClosedCurve(entity, points) {
  if (entity.type === "circle") {
    const circle = circleData(entity, points);
    if (!circle || circle.radius < 1e-4) return null;
    const count = curveSegments(circle.radius, TAU, 16, 96);
    return Array.from({length:count}, (_, i) => {
      const a = i / count * TAU;
      return {u:circle.center.x + Math.cos(a) * circle.radius, v:circle.center.y + Math.sin(a) * circle.radius};
    });
  }
  if (entity.type !== "ellipse") return null;
  const center = points.get(entity.c ?? entity.center);
  const rx = Math.abs(Number(entity.rx) || 0), ry = Math.abs(Number(entity.ry) || 0);
  if (!center || rx < 1e-4 || ry < 1e-4) return null;
  const rot = Number(entity.rot) || 0, cos = Math.cos(rot), sin = Math.sin(rot);
  const count = curveSegments(Math.max(rx, ry), TAU, 24, 128);
  return Array.from({length:count}, (_, i) => {
    const a = i / count * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    return {u:center.x + x * cos - y * sin, v:center.y + x * sin + y * cos};
  });
}

function endpointIds(entity) {
  return entity && (entity.type === "line" || entity.type === "arc" || (entity.type === "spline" && entity.degree===3)) ? [entity.a, entity.b] : [];
}

function area(points) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++)
    sum += points[j].u * points[i].v - points[i].u * points[j].v;
  return sum / 2;
}

function canonicalEndpoints(sketch, entities, tolerance) {
  const points = pointMap(sketch), ids = [];
  entities.forEach((e) => endpointIds(e).forEach((id) => { if (points.has(id) && !ids.includes(id)) ids.push(id); }));
  const parent = new Map(ids.map((id) => [id, id]));
  const order = new Map(ids.map((id, index) => [id, index]));
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(id) !== id) { const next = parent.get(id); parent.set(id, root); id = next; }
    return root;
  };
  const join = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return false;
    const pa = points.get(ra), pb = points.get(rb);
    // Keep fixed geometry as the representative whenever possible.
    if (pb?.fixed && !pa?.fixed) parent.set(ra, rb);
    else if (pa?.fixed && !pb?.fixed) parent.set(rb, ra);
    else if ((order.get(ra) ?? Infinity) <= (order.get(rb) ?? Infinity)) parent.set(rb, ra);
    else parent.set(ra, rb);
    return true;
  };
  let nearMergeCount = 0;
  // Spatial buckets keep live profile feedback responsive on large sketches;
  // only endpoints in this cell or one of its eight neighbours can merge.
  const buckets = new Map(), cell = tolerance;
  const key = (x, y) => x + ":" + y;
  ids.forEach((id) => {
    const p = points.get(id);
    if (!p) return;
    const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
    for (let dx=-1; dx<=1; dx++) for (let dy=-1; dy<=1; dy++) {
      (buckets.get(key(gx+dx,gy+dy)) || []).forEach((other) => {
        const q = points.get(other);
        if (q && Math.hypot(p.x-q.x,p.y-q.y) <= tolerance && join(id,other)) nearMergeCount++;
      });
    }
    const bucketKey = key(gx,gy);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey,[]);
    buckets.get(bucketKey).push(id);
  });
  const canonical = new Map(ids.map((id) => [id, find(id)]));
  return { points, canonical, nearMergeCount };
}

function sampleEdge(entity, forward, points) {
  if(entity.projectedCurve?.samples)return (forward?entity.projectedCurve.samples:[...entity.projectedCurve.samples].reverse()).slice(0,-1);
  if(entity.type==="spline"){const controls=splineControls(entity,points);if(!controls)return [];const samples=sampleBezier(forward?controls:controls.slice().reverse());return samples.slice(0,-1).map(p=>({u:p.x,v:p.y}));}
  if (entity.type === "line") {
    const id = forward ? entity.a : entity.b, p = points.get(id);
    return p ? [{ u:p.x, v:p.y }] : [];
  }
  const arc = circleData(entity, points);
  if (!arc || arc.radius < 1e-6) return [];
  let span = (arc.end - arc.start + TAU) % TAU;
  if (span < 1e-7) span = TAU;
  const steps = curveSegments(arc.radius, span, 4, 64);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const angle = forward ? arc.start + span * t : arc.end - span * t;
    out.push({ u:arc.center.x + Math.cos(angle) * arc.radius, v:arc.center.y + Math.sin(angle) * arc.radius });
  }
  return out;
}

function orderClosedComponent(edges, canonical, points) {
  const remaining = edges.slice(), ordered = [];
  const first = remaining.shift();
  let from = canonical.get(first.a), tail = canonical.get(first.b);
  ordered.push({ entity:first, forward:true });
  while (remaining.length) {
    const index = remaining.findIndex((e) => canonical.get(e.a) === tail || canonical.get(e.b) === tail);
    if (index < 0) return null;
    const next = remaining.splice(index, 1)[0];
    const forward = canonical.get(next.a) === tail;
    ordered.push({ entity:next, forward });
    tail = canonical.get(forward ? next.b : next.a);
  }
  if (tail !== from) return null;
  const sampled = ordered.flatMap((step) => sampleEdge(step.entity, step.forward, points));
  return sampled.length >= 3 ? { ordered, points:sampled } : null;
}

function connectedComponents(entities, canonical) {
  const at = new Map();
  entities.forEach((e) => endpointIds(e).forEach((id) => {
    const key = canonical.get(id);
    if (!at.has(key)) at.set(key, []);
    at.get(key).push(e);
  }));
  const unseen = new Set(entities), out = [];
  while (unseen.size) {
    const seed = unseen.values().next().value, stack = [seed], component = [];
    unseen.delete(seed);
    while (stack.length) {
      const edge = stack.pop(); component.push(edge);
      endpointIds(edge).forEach((id) => (at.get(canonical.get(id)) || []).forEach((next) => {
        if (unseen.has(next)) { unseen.delete(next); stack.push(next); }
      }));
    }
    out.push(component);
  }
  return { components:out, adjacency:at };
}

export function pointInProfile(point, profilePoints) {
  let inside = false;
  for (let i = 0, j = profilePoints.length - 1; i < profilePoints.length; j = i++) {
    const a = profilePoints[i], b = profilePoints[j];
    if ((a.v > point.v) !== (b.v > point.v) && point.u < ((b.u - a.u) * (point.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}

export function profileCentroid(points) {
  if (!points.length) return {u:0,v:0};
  let u = 0, v = 0;
  points.forEach((p) => { u += p.u; v += p.v; });
  return { u:u / points.length, v:v / points.length };
}

export function analyzeSketchProfiles(sketch, options = {}) {
  const tolerance = Math.max(1e-6, Number(options.tolerance) || 0.05);
  const selected = new Set(options.selectedIds || []);
  const eligible = (sketch?.entities || []).filter((e) => !e.construction && (e.type === "line" || e.type === "arc" || (e.type === "spline" && e.degree===3)));
  // curves that are a closed loop all by themselves, so they never take part in
  // the endpoint graph the chains are built from
  const closed = (sketch?.entities || []).filter((e) => !e.construction && (e.type === "circle" || e.type === "ellipse"));
  const { points, canonical, nearMergeCount } = canonicalEndpoints(sketch || {}, eligible, tolerance);
  const { components, adjacency } = connectedComponents(eligible, canonical);
  const profiles = [], openEnds = [], branchPoints = [], openEntityIds = [];

  components.forEach((component) => {
    const nodes = new Set(component.flatMap((e) => endpointIds(e).map((id) => canonical.get(id))));
    const degrees = [...nodes].map((id) => ({ id, degree:(adjacency.get(id) || []).filter((e) => component.includes(e)).length }));
    degrees.filter((d) => d.degree === 1).forEach((d) => { const p = points.get(d.id); if (p) openEnds.push({id:d.id,x:p.x,y:p.y}); });
    degrees.filter((d) => d.degree > 2).forEach((d) => { const p = points.get(d.id); if (p) branchPoints.push({id:d.id,x:p.x,y:p.y,degree:d.degree}); });
    const closed = degrees.length && degrees.every((d) => d.degree === 2);
    const ordered = closed ? orderClosedComponent(component, canonical, points) : null;
    if (!ordered) { component.forEach((e) => openEntityIds.push(e.id)); return; }
    const entityIds = ordered.ordered.map((step) => step.entity.id);
    profiles.push({ kind:"chain", entityIds, ordered:ordered.ordered, points:ordered.points, area:area(ordered.points), selected:entityIds.some((id) => selected.has(id)) });
  });

  closed.forEach((entity) => {
    const sampled = sampleClosedCurve(entity, points);
    if (!sampled) return;
    profiles.push({kind:entity.type,entityIds:[entity.id],points:sampled,area:area(sampled),selected:selected.has(entity.id)});
  });

  profiles.sort((a, b) => Number(b.selected) - Number(a.selected) || Math.abs(b.area) - Math.abs(a.area));
  const status = profiles.length ? (openEnds.length || branchPoints.length ? "partial" : profiles.length > 1 ? "multiple" : "ready")
    : branchPoints.length ? "branched" : openEnds.length ? "open" : "empty";
  return { status, profiles, openEnds, branchPoints, openEntityIds:[...new Set(openEntityIds)], nearMergeCount, tolerance };
}

/* Open chains — the sketches that are NOT profiles.
 *
 * analyzeSketchProfiles above throws every non-closed component onto
 * openEntityIds and moves on, because an extrusion needs a closed loop. A rib
 * is drawn as a line: the web runs where the line runs and the thickness is
 * typed, so the feature needs exactly the chains that analysis calls failures.
 * A chain qualifies when it has two loose ends and no junction — a Y has no
 * single path through it and is left out rather than picked arbitrarily.
 */
export function analyzeSketchChains(sketch, options = {}) {
  const tolerance = Math.max(1e-6, Number(options.tolerance) || 0.05);
  const selected = new Set(options.selectedIds || []);
  const eligible = (sketch?.entities || []).filter((e) => !e.construction && (e.type === "line" || e.type === "arc" || (e.type === "spline" && e.degree===3)));
  const { points, canonical } = canonicalEndpoints(sketch || {}, eligible, tolerance);
  const { components, adjacency } = connectedComponents(eligible, canonical);
  const chains = [];
  components.forEach((component) => {
    const nodes = new Set(component.flatMap((e) => endpointIds(e).map((id) => canonical.get(id))));
    const degrees = [...nodes].map((id) => ({ id, degree:(adjacency.get(id) || []).filter((e) => component.includes(e)).length }));
    if (degrees.some((d) => d.degree > 2)) return;          // a junction has no one path
    const ends = degrees.filter((d) => d.degree === 1);
    if (ends.length !== 2) return;                          // closed, or a stray point
    const ordered = orderOpenComponent(component, canonical, points, ends[0].id);
    if (!ordered) return;
    const entityIds = ordered.ordered.map((step) => step.entity.id);
    chains.push({ entityIds, ordered:ordered.ordered, points:ordered.points, length:chainLength(ordered.points), selected:entityIds.some((id) => selected.has(id)) });
  });
  chains.sort((a, b) => Number(b.selected) - Number(a.selected) || b.length - a.length);
  return { chains, status: chains.length ? "ready" : "none" };
}

function chainLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].u - points[i-1].u, points[i].v - points[i-1].v);
  return total;
}

function orderOpenComponent(edges, canonical, points, startId) {
  const remaining = edges.slice(), ordered = [];
  let tail = startId;
  while (remaining.length) {
    const index = remaining.findIndex((e) => canonical.get(e.a) === tail || canonical.get(e.b) === tail);
    if (index < 0) return null;
    const next = remaining.splice(index, 1)[0];
    const forward = canonical.get(next.a) === tail;
    ordered.push({ entity:next, forward });
    tail = canonical.get(forward ? next.b : next.a);
  }
  // sampleEdge omits each edge's far end so a closed ring does not repeat a
  // point; an open chain has to put the very last one back.
  const sampled = ordered.flatMap((step) => sampleEdge(step.entity, step.forward, points));
  const last = points.get(tail);
  if (last) sampled.push({ u:last.x, v:last.y });
  return sampled.length >= 2 ? { ordered, points:sampled } : null;
}

export function healSketchEndpoints(sketch, entityIds, tolerance = 0.05) {
  if (!sketch || !Array.isArray(entityIds) || !entityIds.length) return 0;
  const wanted = new Set(entityIds);
  const entities = (sketch.entities || []).filter((e) => wanted.has(e.id) && (e.type === "line" || e.type === "arc" || (e.type === "spline" && e.degree===3)));
  const { canonical } = canonicalEndpoints(sketch, entities, Math.max(1e-6, tolerance));
  const replacements = new Map();
  canonical.forEach((root, id) => { if (root !== id) replacements.set(id, root); });
  if (!replacements.size) return 0;

  (sketch.entities || []).forEach((e) => {
    ["a", "b", "c", "center"].forEach((key) => { if (replacements.has(e[key])) e[key] = replacements.get(e[key]); });
  });
  (sketch.constraints || []).forEach((c) => {
    ["a", "b", "point", "center"].forEach((key) => { if (replacements.has(c[key])) c[key] = replacements.get(c[key]); });
  });
    (sketch.constraints || []).forEach(c=>{if(Array.isArray(c.pairs))c.pairs=c.pairs.map(pair=>pair.map(id=>replacements.get(id) || id));});
  const dropped = new Set(replacements.keys());
  sketch.points = (sketch.points || []).filter((p) => !dropped.has(p.id));
  const fixed = new Set();
  sketch.constraints = (sketch.constraints || []).filter((constraint) => {
    // Merging two anchored endpoints can turn their independent anchors into
    // the same rule. Keep conflicting positions for diagnostics, but remove
    // identical active anchors so healing does not over-constrain the sketch.
    if (constraint.type !== "fixed" || constraint.suppressed) return true;
    const point=sketch.points.find(p=>p.id===constraint.point);
    const key=JSON.stringify([constraint.point,constraint.x ?? point?.x,constraint.y ?? point?.y]);
    if (fixed.has(key)) return false;
    fixed.add(key);return true;
  });
  return replacements.size;
}

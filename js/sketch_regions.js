// Sketch regions: what area a sketch actually encloses, intersections included.
//
// analyzeSketchProfiles() answers a topological question — "do these entities
// form a loop, end to end?" — and that is the right question for a profile a
// feature stores and re-resolves later. It is the wrong question for "how much
// material does this cut remove". Two rectangles that overlap enclose one
// peanut-shaped area; a line drawn across a circle splits it in two; neither
// case is visible to an endpoint graph, because nothing was ever joined there.
//
// So this module builds the planar arrangement the way a CAD kernel does:
// every curve is flattened to segments, every crossing becomes a vertex, the
// dangling stubs that bound nothing are pruned, and the faces that survive are
// walked out of the half-edge graph. The outlines that come back are the areas
// a feature should operate on — all of them, not just the biggest loop.

import { curveSegments } from "./sketch_profiles.js";

const TAU = Math.PI * 2;

function pointMap(sketch) {
  return new Map(((sketch && sketch.points) || []).map((p) => [p.id, p]));
}

/* One entity, flattened. Chord tolerance is the same one profile sampling
   uses, so a region outline and a profile drawn from the same circle agree. */
function entityPolyline(entity, points) {
  if (!entity || entity.construction) return null;
  if (entity.type === "line") {
    const a = points.get(entity.a), b = points.get(entity.b);
    return a && b ? { points:[{x:a.x,y:a.y},{x:b.x,y:b.y}], closed:false } : null;
  }
  if (entity.type === "arc") {
    const center = points.get(entity.c ?? entity.center), a = points.get(entity.a), b = points.get(entity.b);
    if (!center || !a || !b) return null;
    const radius = Math.hypot(a.x - center.x, a.y - center.y);
    if (radius < 1e-6) return null;
    const start = Math.atan2(a.y - center.y, a.x - center.x);
    let span = (Math.atan2(b.y - center.y, b.x - center.x) - start + TAU) % TAU;
    if (span < 1e-7) span = TAU;
    const steps = curveSegments(radius, span, 4, 64), out = [];
    for (let i = 0; i <= steps; i++) {
      const angle = start + span * (i / steps);
      out.push({ x:center.x + Math.cos(angle) * radius, y:center.y + Math.sin(angle) * radius });
    }
    return { points:out, closed:false };
  }
  if (entity.type === "circle") {
    const center = points.get(entity.c ?? entity.center), radius = Math.abs(Number(entity.r) || 0);
    if (!center || radius < 1e-4) return null;
    const steps = curveSegments(radius, TAU, 16, 96), out = [];
    for (let i = 0; i < steps; i++) {
      const angle = i / steps * TAU;
      out.push({ x:center.x + Math.cos(angle) * radius, y:center.y + Math.sin(angle) * radius });
    }
    return { points:out, closed:true };
  }
  if (entity.type === "ellipse") {
    const center = points.get(entity.c ?? entity.center);
    const rx = Math.abs(Number(entity.rx) || 0), ry = Math.abs(Number(entity.ry) || 0);
    if (!center || rx < 1e-4 || ry < 1e-4) return null;
    const rot = Number(entity.rot) || 0, cos = Math.cos(rot), sin = Math.sin(rot);
    const steps = curveSegments(Math.max(rx, ry), TAU, 24, 128), out = [];
    for (let i = 0; i < steps; i++) {
      const angle = i / steps * TAU, x = Math.cos(angle) * rx, y = Math.sin(angle) * ry;
      out.push({ x:center.x + x * cos - y * sin, y:center.y + x * sin + y * cos });
    }
    return { points:out, closed:true };
  }
  return null;
}

function collectSegments(sketch, options) {
  const points = pointMap(sketch), segments = [];
  const wanted = options.entityIds ? new Set(options.entityIds) : null;
  ((sketch && sketch.entities) || []).forEach((entity) => {
    if (wanted && !wanted.has(entity.id)) return;
    const poly = entityPolyline(entity, points);
    if (!poly) return;
    const list = poly.points, last = poly.closed ? list.length : list.length - 1;
    for (let i = 0; i < last; i++) {
      const a = list[i], b = list[(i + 1) % list.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
      segments.push({ x1:a.x, y1:a.y, x2:b.x, y2:b.y, entityId:entity.id });
    }
  });
  return segments;
}

/* Buckets keep the crossing search near-linear on sketches the editor actually
   sees; a quadratic scan over a few thousand chords stalls the canvas. */
function forEachNearbyPair(segments, visit) {
  if (segments.length < 2) return;
  let extent = 0;
  segments.forEach((s) => { extent += Math.hypot(s.x2 - s.x1, s.y2 - s.y1); });
  const cell = Math.max(extent / segments.length * 4, 1e-3);
  const buckets = new Map();
  const key = (gx, gy) => gx + ":" + gy;
  segments.forEach((s, index) => {
    const gx0 = Math.floor(Math.min(s.x1, s.x2) / cell), gx1 = Math.floor(Math.max(s.x1, s.x2) / cell);
    const gy0 = Math.floor(Math.min(s.y1, s.y2) / cell), gy1 = Math.floor(Math.max(s.y1, s.y2) / cell);
    // a segment far longer than the cell would touch a whole row of cells; a
    // single bucket for those keeps the map small and still finds every hit
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 64) { const k = "long"; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(index); return; }
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const k = key(gx, gy);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(index);
    }
  });
  const seen = new Set(), long = buckets.get("long") || [];
  const pair = (i, j) => {
    if (i === j) return;
    const id = i < j ? i * segments.length + j : j * segments.length + i;
    if (seen.has(id)) return;
    seen.add(id);
    visit(i, j);
  };
  buckets.forEach((list, k) => {
    if (k === "long") return;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pair(list[i], list[j]);
  });
  long.forEach((i) => segments.forEach((_, j) => pair(i, j)));
}

function projectOnSegment(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return null;
  const t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  const cx = s.x1 + dx * t, cy = s.y1 + dy * t;
  return { t, distance:Math.hypot(px - cx, py - cy) };
}

/* Where the chords cross. Split parameters only — the points themselves come
   back out of the parametrisation, so both sides of a crossing land on the
   same coordinate and weld into one vertex. */
function splitParameters(segments, tolerance) {
  const cuts = segments.map(() => []);
  forEachNearbyPair(segments, (i, j) => {
    const a = segments[i], b = segments[j];
    const rx = a.x2 - a.x1, ry = a.y2 - a.y1, sx = b.x2 - b.x1, sy = b.y2 - b.y1;
    const denom = rx * sy - ry * sx;
    const qpx = b.x1 - a.x1, qpy = b.y1 - a.y1;
    if (Math.abs(denom) > 1e-12) {
      const t = (qpx * sy - qpy * sx) / denom, u = (qpx * ry - qpy * rx) / denom;
      if (t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9) {
        cuts[i].push(Math.min(1, Math.max(0, t)));
        cuts[j].push(Math.min(1, Math.max(0, u)));
      }
      return;
    }
    // Collinear or near-parallel: only an endpoint landing on the other chord
    // matters, and welding takes care of the rest.
    [[a.x1, a.y1, j], [a.x2, a.y2, j]].forEach(([px, py, target]) => {
      const hit = projectOnSegment(px, py, segments[target]);
      if (hit && hit.distance <= tolerance && hit.t > 0 && hit.t < 1) cuts[target].push(hit.t);
    });
    [[b.x1, b.y1, i], [b.x2, b.y2, i]].forEach(([px, py, target]) => {
      const hit = projectOnSegment(px, py, segments[target]);
      if (hit && hit.distance <= tolerance && hit.t > 0 && hit.t < 1) cuts[target].push(hit.t);
    });
  });
  return cuts;
}

/* Coordinates within `tolerance` are one vertex. Without this a crossing
   computed twice — once per chord — becomes two vertices a hair apart and the
   face walk falls off the graph. */
function vertexWelder(tolerance) {
  const vertices = [], buckets = new Map();
  const key = (gx, gy) => gx + ":" + gy;
  return {
    vertices,
    weld(x, y) {
      const gx = Math.floor(x / tolerance), gy = Math.floor(y / tolerance);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const list = buckets.get(key(gx + dx, gy + dy));
        if (!list) continue;
        for (const index of list) {
          const v = vertices[index];
          if (Math.hypot(v.x - x, v.y - y) <= tolerance) return index;
        }
      }
      const index = vertices.length;
      vertices.push({ x, y });
      const k = key(gx, gy);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(index);
      return index;
    },
  };
}

function buildGraph(segments, cuts, tolerance) {
  const welder = vertexWelder(tolerance), edges = [], byKey = new Map();
  segments.forEach((s, index) => {
    const params = [0, 1].concat(cuts[index]).filter((t) => t >= 0 && t <= 1).sort((m, n) => m - n);
    for (let i = 0; i < params.length - 1; i++) {
      const t0 = params[i], t1 = params[i + 1];
      if (t1 - t0 < 1e-9) continue;
      const a = welder.weld(s.x1 + (s.x2 - s.x1) * t0, s.y1 + (s.y2 - s.y1) * t0);
      const b = welder.weld(s.x1 + (s.x2 - s.x1) * t1, s.y1 + (s.y2 - s.y1) * t1);
      if (a === b) continue;
      const key = a < b ? a + ":" + b : b + ":" + a;
      const known = byKey.get(key);
      if (known !== undefined) { edges[known].entityIds.add(s.entityId); continue; }
      byKey.set(key, edges.length);
      edges.push({ a, b, entityIds:new Set([s.entityId]) });
    }
  });
  return { vertices:welder.vertices, edges };
}

/* An edge with a free end bounds nothing: the stub of a line that pokes out of
   a rectangle is drawing, not area. Pruning is iterative because removing a
   stub can free the edge behind it. */
function pruneDanglingEdges(vertices, edges) {
  const alive = edges.map(() => true);
  const degree = vertices.map(() => 0);
  edges.forEach((e) => { degree[e.a]++; degree[e.b]++; });
  let changed = true;
  while (changed) {
    changed = false;
    edges.forEach((e, index) => {
      if (!alive[index]) return;
      if (degree[e.a] <= 1 || degree[e.b] <= 1) {
        alive[index] = false;
        degree[e.a]--; degree[e.b]--;
        changed = true;
      }
    });
  }
  return edges.filter((_, index) => alive[index]);
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++)
    sum += points[j].u * points[i].v - points[i].u * points[j].v;
  return sum / 2;
}

export function pointInLoop(point, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i], b = loop[j];
    if ((a.v > point.v) !== (b.v > point.v) && point.u < ((b.u - a.u) * (point.v - a.v)) / (b.v - a.v) + a.u) inside = !inside;
  }
  return inside;
}

/* A point that is really inside the loop, which the centroid of a C-shape is
   not. Whoever consumes a region has to answer "is this over that solid?", and
   answering it with a point in the notch cuts nothing. */
export function loopInteriorPoint(loop) {
  if (!loop || loop.length < 3) return { u:0, v:0 };
  let u = 0, v = 0;
  loop.forEach((p) => { u += p.u; v += p.v; });
  const centroid = { u:u / loop.length, v:v / loop.length };
  if (pointInLoop(centroid, loop)) return centroid;
  // Scan a horizontal line through the loop and take the middle of the widest
  // span that is actually inside it.
  let best = null;
  for (let i = 0; i < loop.length; i++) {
    const y = (loop[i].v + loop[(i + 1) % loop.length].v) / 2, hits = [];
    for (let j = 0, k = loop.length - 1; j < loop.length; k = j++) {
      const a = loop[j], b = loop[k];
      if ((a.v > y) !== (b.v > y)) hits.push(((b.u - a.u) * (y - a.v)) / (b.v - a.v) + a.u);
    }
    hits.sort((m, n) => m - n);
    for (let h = 0; h + 1 < hits.length; h += 2) {
      const width = hits[h + 1] - hits[h];
      if (width > 1e-9 && (!best || width > best.width)) best = { width, u:(hits[h] + hits[h + 1]) / 2, v:y };
    }
  }
  return best ? { u:best.u, v:best.v } : centroid;
}

/* Walk every face of the arrangement out of the half-edge graph. Leaving a
   vertex, the face turns as tightly as it can: the outgoing edge one step
   clockwise from the way back. That walk traces interior faces counter-
   clockwise and the outline of each connected component clockwise, which is
   exactly the distinction between "an area" and "the border around it". */
function traceFaces(vertices, edges) {
  const half = [];
  edges.forEach((e) => {
    half.push({ from:e.a, to:e.b, entityIds:e.entityIds });
    half.push({ from:e.b, to:e.a, entityIds:e.entityIds });
  });
  const around = vertices.map(() => []);
  half.forEach((h, index) => {
    h.angle = Math.atan2(vertices[h.to].y - vertices[h.from].y, vertices[h.to].x - vertices[h.from].x);
    around[h.from].push(index);
  });
  around.forEach((list) => list.sort((m, n) => half[m].angle - half[n].angle));
  const slot = new Map();
  around.forEach((list) => list.forEach((index, position) => slot.set(index, position)));
  const nextOf = (index) => {
    const twin = index ^ 1, list = around[half[twin].from];
    const position = slot.get(twin);
    return list[(position - 1 + list.length) % list.length];
  };
  const visited = new Array(half.length).fill(false), faces = [];
  for (let start = 0; start < half.length; start++) {
    if (visited[start]) continue;
    const loop = [], entityIds = new Set();
    let index = start, guard = 0;
    while (!visited[index] && guard++ <= half.length) {
      visited[index] = true;
      loop.push(index);
      half[index].entityIds.forEach((id) => entityIds.add(id));
      index = nextOf(index);
    }
    if (loop.length < 2) continue;
    const points = loop.map((h) => ({ u:vertices[half[h].from].x, v:vertices[half[h].from].y }));
    const area = polygonArea(points);
    if (Math.abs(area) < 1e-9) continue;
    faces.push({ points, area, entityIds:[...entityIds] });
  }
  return faces;
}

/* Nesting, the way a CAD sketch reads it: an outline inside another outline is
   a hole, an outline inside that hole is solid again. */
function nest(outlines) {
  outlines.forEach((outline) => { outline.interior = loopInteriorPoint(outline.points); });
  const sorted = outlines.slice().sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  sorted.forEach((outline, index) => {
    let parent = null;
    for (let i = index - 1; i >= 0; i--) {
      const candidate = sorted[i];
      if (pointInLoop(outline.interior, candidate.points)) { parent = candidate; break; }
    }
    outline.parent = parent;
    outline.depth = parent ? parent.depth + 1 : 0;
    if (parent && parent.depth % 2 === 0) (parent.holes = parent.holes || []).push(outline);
  });
  return sorted;
}

/* Every closed area the sketch encloses.
   `regions` are the solid ones — outer boundary counter-clockwise, with the
   loops nested directly inside them carried as `holes`; `faces` are the
   minimal cells of the arrangement, kept for callers that need the pieces a
   crossing line cuts an area into. */
export function sketchRegions(sketch, options = {}) {
  const tolerance = Math.max(1e-6, Number(options.tolerance) || 0.05);
  const segments = collectSegments(sketch, options);
  const empty = { regions:[], faces:[], segmentCount:segments.length };
  if (segments.length < 2) return empty;
  if (segments.length > 24000) return empty;             // pathological sketch: stay responsive
  let shortest = Infinity;
  segments.forEach((s) => { shortest = Math.min(shortest, Math.hypot(s.x2 - s.x1, s.y2 - s.y1)); });
  // Welding must never swallow a whole chord, or a small circle collapses to a
  // point and takes its region with it.
  const weld = Math.max(1e-7, Math.min(tolerance, shortest * 0.35));
  const cuts = splitParameters(segments, weld);
  const graph = buildGraph(segments, cuts, weld);
  const edges = pruneDanglingEdges(graph.vertices, graph.edges);
  if (!edges.length) return empty;
  const faces = traceFaces(graph.vertices, edges);
  const outlines = faces.filter((f) => f.area < 0).map((f) => ({
    points:f.points.slice().reverse(), area:-f.area, entityIds:f.entityIds,
  }));
  const ordered = nest(outlines);
  const regions = ordered.filter((outline) => outline.depth % 2 === 0).map((outline) => ({
    points:outline.points,
    area:outline.area,
    entityIds:outline.entityIds,
    interior:outline.interior,
    holes:(outline.holes || []).map((hole) => ({ points:hole.points, area:hole.area, entityIds:hole.entityIds })),
  }));
  return {
    regions,
    faces:faces.filter((f) => f.area > 0).map((f) => ({ points:f.points, area:f.area, entityIds:f.entityIds })),
    segmentCount:segments.length,
  };
}

function entityKey(ids) { return (ids || []).slice().sort().join("|"); }

/* Every area a feature should act on, in the order a feature should take them.
   A chain profile stays the parametric currency — an area whose boundary is
   exactly one closed chain keeps that chain's entity ids, so editing the sketch
   still moves the solid. An area that only exists because geometry crosses
   (two overlapping rectangles, a line drawn through a circle) has no chain to
   name, so it carries frozen points instead of pretending to be parametric.
   Selecting entities narrows the list to the areas they bound; selecting
   nothing means all of them, which is what "cut this sketch away" means. */
export function featureAreas(analysis, run, selectedIds = []) {
  const profiles = (analysis && analysis.profiles) || [];
  const byIds = new Map(profiles.map((p) => [entityKey(p.entityIds), p]));
  const chainFor = (loop) => byIds.get(entityKey(loop && loop.entityIds)) || null;
  let areas = ((run && run.regions) || []).map((region) => {
    const chain = chainFor(region);
    const holes = (region.holes || []).map((hole) => {
      const holeChain = chainFor(hole);
      return { points:holeChain ? holeChain.points : hole.points, entityIds:holeChain ? holeChain.entityIds : null };
    });
    return {
      points:chain ? chain.points : region.points,
      entityIds:chain ? chain.entityIds : null,
      holes:holes.map((hole) => hole.points),
      holeEntityIds:holes.length && holes.every((hole) => hole.entityIds) ? holes.map((hole) => hole.entityIds) : null,
      sourceEntityIds:[...new Set((region.entityIds || []).concat(...(region.holes || []).map((hole) => hole.entityIds || [])))],
      interior:region.interior || loopInteriorPoint(region.points),
      area:Math.abs(region.area),
    };
  });
  // The arrangement needs geometry it can flatten; a sketch that only resolves
  // through the endpoint tolerance still has to extrude, so fall back to the
  // chain profiles and the loops nested inside them.
  if (!areas.length && profiles.length) {
    const used = new Set();
    profiles.forEach((profile, index) => {
      if (used.has(index)) return;
      const holes = [];
      profiles.forEach((candidate, other) => {
        if (other === index || used.has(other) || Math.abs(candidate.area) >= Math.abs(profile.area)) return;
        if (!pointInLoop(loopInteriorPoint(candidate.points), profile.points)) return;
        used.add(other);
        holes.push(candidate);
      });
      areas.push({
        points:profile.points, entityIds:profile.entityIds,
        holes:holes.map((hole) => hole.points),
        holeEntityIds:holes.length ? holes.map((hole) => hole.entityIds) : null,
        sourceEntityIds:profile.entityIds.concat(...holes.map((hole) => hole.entityIds)),
        interior:loopInteriorPoint(profile.points),
        area:Math.abs(profile.area),
      });
    });
  }
  if (selectedIds.length) {
    const picked = areas.filter((area) => (area.sourceEntityIds || []).some((id) => selectedIds.includes(id)));
    if (picked.length) areas = picked;
  }
  return areas.sort((a, b) => b.area - a.area);
}

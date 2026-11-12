/* Converted geometry is constrained by the rebuilt edge. Adjacent edges share
   their model vertex, but each keeps its own relation to its source. */
import { convertedPins, convertedPinVertices, edgeEndpoints, modelEdgeSketchCurve, projectWorldToSketch } from "../sketch_intersection.js";

const sampledRim = edge => edge?.descriptor?.curve === "line" &&
  /hole:(?:cut|profile):\d+:(?:start|end):\d+$/.test(edge.persistentId);

function worldVertex(sketch, edge, point) {
  const ends = edgeEndpoints(edge);
  if (!ends?.length) return null;
  // The kernel may report arc ends in a different order than the sketch sweep.
  return [ends[0], ends[ends.length - 1]].find(end => {
    const uv = projectWorldToSketch(sketch, end);
    return Math.hypot(uv.x - point.x, uv.y - point.y) < 1e-6;
  });
}

/* Edges already converted into this sketch, by persistent id, so selecting an
   edge twice (or re-running the command) does not stack a second copy. */
export function convertedEdgeIds(sketch) {
  return new Set([...convertedPins(sketch)].map(c => c.edge.persistentId));
}

/* What `edge` would become in `sketch`, without changing anything: the curve,
   or the reason it cannot be converted. */
export function previewConvertedEdge(sketch, edge) {
  if (sampledRim(edge)) return { ok: false, reason: "Pick the exact model edge after the body rebuilds" };
  try {
    const curve = modelEdgeSketchCurve(sketch, edge);
    if (curve.kind === "line" && Math.hypot(curve.end.x - curve.start.x, curve.end.y - curve.start.y) <= 1e-6) return { ok: false, reason: "The edge has no length on this sketch plane" };
    return { ok: true, curve };
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
  }
}

/* Append the converted geometry for `edges` to `sketch`.
   - `makeId()` names new points, entities and relations.
   - `referenceOf(edge)` is the stored topology reference (the editor passes
     topologyReferenceFromEntry); it defaults to the edge itself.
   Returns { entities, skipped: [{ edge, reason }] }; nothing is appended for a
   skipped edge. */
export function appendConvertedEdges(sketch, edges, { construction = false, makeId, referenceOf = (edge) => edge, resolveEdge = ref => ref } = {}) {
  if (typeof makeId !== "function") throw new Error("appendConvertedEdges needs makeId");
  sketch.points = sketch.points || [];
  sketch.entities = sketch.entities || [];
  sketch.constraints = sketch.constraints || [];
  const already = convertedEdgeIds(sketch);
  const entities = [], skipped = [], shared = [];
  for (const [pin, world] of convertedPinVertices(sketch, resolveEdge)) {
    if (world) shared.push({ world, id: pin.point });
  }
  for (const edge of edges || []) {
    if (already.has(edge?.persistentId)) { skipped.push({ edge, reason: "Already converted in this sketch" }); continue; }
    const preview = previewConvertedEdge(sketch, edge);
    if (!preview.ok) { skipped.push({ edge, reason: preview.reason }); continue; }
    const curve = preview.curve, ref = referenceOf(edge);
    if (!ref?.persistentId) { skipped.push({ edge, reason: "The model edge has no persistent reference" }); continue; }
    const entity = { id: makeId(), type: curve.kind, name: curve.kind === "line" ? "Converted edge" : "Converted " + curve.kind, construction };
    function anchor(p, at) {
      const world = at !== "center" && worldVertex(sketch, edge, p);
      const match = world && shared.find(v => Math.hypot(world.x - v.world.x, world.y - v.world.y, world.z - v.world.z) < 1e-6);
      let id = match ? match.id : undefined;
      if (id == null) {
        id = makeId();
        sketch.points.push({ id, x: p.x, y: p.y });
        if (world) shared.push({ world, id });
      }
      sketch.constraints.push({ id: makeId(), type: "onModelEdge", point: id, edge: structuredClone(ref), at, entity: entity.id, convert: true });
      return id;
    }
    if (curve.center) entity.c = anchor(curve.center, "center");
    if (curve.start) {
      entity.a = anchor(curve.start, curve.kind === "arc" ? "arcStart" : "start");
      entity.b = anchor(curve.end, curve.kind === "arc" ? "arcEnd" : "end");
    }
    if (curve.kind === "circle") entity.r = curve.radius;
    if (curve.kind === "ellipse") Object.assign(entity, { rx: curve.rx, ry: curve.ry, rot: curve.rot });
    already.add(ref.persistentId);
    sketch.entities.push(entity);
    entities.push(entity);
  }
  return { entities, skipped };
}

/* Lightweight hole and cut loops expose chords alongside the exact rim.
   Only these synthetic segments can stand for a different edge. */
export function exactEdgeForSegment(sketch, edge, candidates, tolerance = 1e-3) {
  if (!sampledRim(edge)) return edge;
  const ends = edge.descriptor.endpoints;
  if (!ends || ends.length !== 2) return edge;
  const projected = ends.map(p => projectWorldToSketch(sketch, p));
  let best = edge, bestError = tolerance;
  for (const other of candidates || []) {
    const d = other.descriptor;
    if (d?.curve === "line" && !sampledRim(other) && d.endpoints?.length === 2) {
      const [a, b] = d.endpoints;
      const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      const error = Math.min(Math.max(distance(ends[0], a), distance(ends[1], b)),
        Math.max(distance(ends[0], b), distance(ends[1], a)));
      if (error < bestError) { best = other; bestError = error; }
      continue;
    }
    if (d?.curve !== "ellipse" && d?.curve !== "circle") continue;
    const preview = previewConvertedEdge(sketch, other);
    if (!preview.ok) continue;
    const curve = preview.curve;
    if (curve.kind !== "ellipse" && curve.kind !== "circle") continue;
    const depth = projectWorldToSketch(sketch, d.ellipse?.center || d.origin).w;
    const rx = curve.rx || curve.radius, ry = curve.ry || curve.radius;
    const cos = Math.cos(curve.rot || 0), sin = Math.sin(curve.rot || 0);
    const error = Math.max(...projected.map(p => {
      const x = p.x - curve.center.x, y = p.y - curve.center.y;
      const radial = Math.hypot((x*cos + y*sin)/rx, (y*cos - x*sin)/ry);
      return Math.max(Math.abs(radial - 1) * Math.min(rx, ry), Math.abs(depth - p.w));
    }));
    if (error < bestError) { best = other; bestError = error; }
  }
  return best;
}

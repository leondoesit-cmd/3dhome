/* Copy a sketch in one part and paste it onto a plane of another
   (SOLIDWORKS: select the sketch, Edit ▸ Copy; open the other part, select a
   plane, Edit ▸ Paste). HOUSING's ThreadSection is copied from LENSCAP this way.

   What travels is the sketch's own geometry in its plane coordinates: points,
   lines, arcs, circles, splines and the relations and dimensions between them.
   Anything that points outside the sketch cannot survive the trip — a converted
   model edge, a silhouette, an intersection or coincidence with model edges, a
   pierce, the plane it sat on — so those links are dropped and the geometry
   they drove stays where it was, as SOLIDWORKS leaves a pasted sketch
   under-defined. The clipboard is persisted so it outlives closing the source
   part and opening the target. */

export const SKETCH_CLIPBOARD_KEY = "modelforge.sketchClipboard.v1";

const EXTERNAL_RELATIONS = new Set(["onModelEdge", "pierce"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function copySketchForClipboard(sketch, meta = {}) {
  if (!sketch || !Array.isArray(sketch.entities) || !sketch.entities.length) throw new Error("Select a sketch with geometry to copy");
  const droppedRelations = [];
  const constraints = (sketch.constraints || []).filter((constraint) => {
    const external = EXTERNAL_RELATIONS.has(constraint.type) || (constraint.type === "intersection" && (constraint.edgeA || constraint.edgeB));
    if (external) droppedRelations.push(constraint.type);
    return !external;
  });
  return {
    kind: "sketch",
    version: 1,
    name: sketch.name || "Sketch",
    sourceDocument: meta.documentName || null,
    copiedAt: meta.copiedAt || null,
    points: clone(sketch.points || []),
    entities: clone(sketch.entities),
    constraints: clone(constraints),
    dimensions: clone(sketch.dimensions || []),
    droppedRelations,
    droppedLinks: [
      ...(sketch.circleCopies?.length ? ["converted circle"] : []),
      ...(sketch.silhouetteCopies?.length ? ["converted silhouette"] : []),
      ...(sketch.pierce ? ["pierce"] : []),
    ],
  };
}

export function readSketchClipboard(storage) {
  try {
    const raw = storage?.getItem(SKETCH_CLIPBOARD_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && value.kind === "sketch" && Array.isArray(value.entities) ? value : null;
  } catch { return null; }
}

export function writeSketchClipboard(storage, value) {
  storage?.setItem(SKETCH_CLIPBOARD_KEY, JSON.stringify(value));
  return value;
}

/* The pasted geometry, with fresh ids so it can sit next to anything already in
   the target document; the relations follow their points and entities. */
export function pasteSketchGeometry(clip, makeId) {
  if (!clip || !Array.isArray(clip.entities)) throw new Error("There is no copied sketch to paste");
  const ids = new Map();
  const fresh = (id) => {
    if (id == null) return id;
    if (!ids.has(id)) ids.set(id, makeId());
    return ids.get(id);
  };
  const points = clone(clip.points || []).map((point) => ({ ...point, id: fresh(point.id) }));
  // Allocate the whole identity map before following any geometry references.
  clip.entities.forEach(entity => fresh(entity.id));
  const remapObject = (object, keys) => {
    const copy = clone(object);
    keys.forEach((key) => { if (copy[key] != null && ids.has(copy[key])) copy[key] = ids.get(copy[key]); });
    return copy;
  };
  const entityKeys = ["a", "b", "c", "center", "p", "h1", "h2", "p1", "p2", "p3"];
  const entities = clone(clip.entities).map((entity) => {
    const copy = remapObject(entity, entityKeys);
    copy.id = fresh(entity.id);
    if (Array.isArray(copy.points)) copy.points = copy.points.map((id) => (ids.has(id) ? ids.get(id) : id));
    if (Array.isArray(copy.controls)) copy.controls = copy.controls.map((id) => (ids.has(id) ? ids.get(id) : id));
    return copy;
  });
  const relationKeys = ["point", "entity", "a", "b", "center", "line", "circle"];
  const remapRelation = relation => {
    const copy = remapObject(relation, relationKeys);
    for (const key of ['pairs', 'spins', 'shapes']) if (Array.isArray(copy[key]))
      copy[key] = copy[key].map(pair => pair.map(id => ids.get(id) ?? id));
    return copy;
  };
  const constraints = clone(clip.constraints || []).map((constraint) => {
    const copy = remapRelation(constraint);
    copy.id = makeId();
    return copy;
  });
  const dimensions = clone(clip.dimensions || []).map((dimension) => ({ ...remapRelation(dimension), id: makeId() }));
  return { name: clip.name, points, entities, constraints, dimensions };
}

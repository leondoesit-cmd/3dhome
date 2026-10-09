import { recordSketchInHistory } from "./parametric_document.js";
import { holeLayoutPoints } from "../cad_hole_wizard.js";

const referenceId = (value) => typeof value === "object" ? value?.id || value?.targetId : value;
const consumes = (feature, id) => feature?.params?.sketchId === id || (feature?.references?.sketches || []).some((value) => referenceId(value) === id);

// Converted boundaries on the support face must follow an explicit support
// replacement. Otherwise the next rebuild restores the previous face's frame.
export function reattachSketchSupport(sketch, attachment) {
  const previous=sketch.support?.persistentId;
  for(const copy of sketch.boundaryCopies || [])if(copy.associative && copy.source?.persistentId===previous)copy.source=structuredClone(attachment.support);
  sketch.support=structuredClone(attachment.support);
  sketch.referenceId=attachment.support.persistentId;
  sketch.plane=attachment.plane;
  sketch.frame=structuredClone(attachment.frame);
  sketch.frameSpace='local';
  sketch.frameAnchor=attachment.frameAnchor;
  sketch.supportOffset=0;
}

export function sketchSupportNeedsUpdate(sketch, attachment) {
  return !!(attachment?.support && (
    sketch?.support?.persistentId !== attachment.support.persistentId ||
    sketch?.support?.ownerFeatureId !== attachment.support.ownerFeatureId ||
    sketch?.support?.stageFeatureId !== attachment.support.stageFeatureId ||
    JSON.stringify(sketch?.frame) !== JSON.stringify(attachment.frame) ||
    (sketch?.boundaryCopies || []).some((copy) => copy.associative)
  ));
}

/* A support edit belongs to the feature being edited. A shared positioning
   sketch must be forked first so an earlier boss keeps its original plane. */
export function reattachFeatureSketchSupport(document, feature, attachment, forkId) {
  let sketch = (document.sketches || []).find((item) => item.id === feature?.params?.sketchId);
  if (!sketch || !attachment?.support || !attachment.frame) throw new Error("A planar positioning sketch is required");
  const centres = feature.type === "hole" ? holeLayoutPoints(feature.params || {}, sketch) : null;
  const shared = (document.features || []).some((item) => item !== feature && consumes(item, sketch.id));
  if (shared) {
    if (!forkId || (document.sketches || []).some((item) => item.id === forkId)) throw new Error("A unique positioning sketch ID is required");
    const oldId = sketch.id;
    sketch = structuredClone(sketch);
    sketch.id = forkId;
    sketch.name = (feature.name || "Hole") + " positioning sketch";
    document.sketches.push(sketch);
    feature.params = { ...feature.params, sketchId: forkId };
    feature.references ||= {};
    feature.references.sketches = (feature.references.sketches || [oldId]).map((value) => referenceId(value) === oldId ? forkId : value);
    const entry = recordSketchInHistory(document, sketch);
    const from = document.history.indexOf(entry);
    document.history.splice(from, 1);
    const at = document.history.findIndex((item) => item.kind === "feature" && item.targetId === feature.id);
    document.history.splice(at < 0 ? document.history.length : at, 0, entry);
  }
  reattachSketchSupport(sketch,attachment);
  if (feature.type === "hole") feature.references.topology = [structuredClone(attachment.support)];
  // Hole Wizard Positions consumes seed points. A converted boss profile may
  // supply the initial centres, but its boundary must not move or resize them.
  if (centres) {
    if (!centres.length) throw new Error("Hole positioning requires at least one centre");
    sketch.points = centres.map((centre, index) => ({ id: sketch.id + ":position:" + index, x: centre.u, y: centre.v }));
    sketch.entities = [];
    sketch.constraints = sketch.points.map((point, index) => ({ id: sketch.id + ":fixed:" + index, type: "fixed", point: point.id, x: point.x, y: point.y }));
    sketch.boundaryCopies = [];
    feature.params = { ...feature.params, holePositionPointIds: sketch.points.map(point => point.id), profileEntityIds: [] };
  }
  return { sketch, forked: shared };
}

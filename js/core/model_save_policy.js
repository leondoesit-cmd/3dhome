import { validateDrawingPrimitive } from "./drawing_primitives.js";

export function drawingOnlyContentSummary(definition) {
  if (!definition || (definition.parts || []).length || (definition.features || []).length) return null;
  const sketches=Array.isArray(definition.sketches) ? definition.sketches : [];
  const history=Array.isArray(definition.history) ? definition.history : [];
  if(sketches.some(sketch => sketch && ((sketch.entities || []).length || history.some(entry => entry?.kind==='sketch' && entry.targetId===sketch.id)))) return null;
  const notes=(Array.isArray(definition.drawing?.notes) ? definition.drawing.notes : []).filter(note => String(note?.text || '').trim()).length;
  const annotations=(Array.isArray(definition.drawing?.primitives) ? definition.drawing.primitives : []).filter(primitive => {
    try { validateDrawingPrimitive(primitive); return true; } catch { return false; }
  }).length;
  return notes || annotations ? {annotations,notes} : null;
}
// A new editor document gets an implicit, empty working sketch. That is not
// authored work. A recorded sketch history row is, even before its first line
// is drawn, and sketch geometry imported from an older document is work too.
export function hasSaveableModelContent(definition) {
  if (!definition || typeof definition !== "object") return false;
  if (Array.isArray(definition.parts) && definition.parts.length) return true;
  if (Array.isArray(definition.drawing?.notes) && definition.drawing.notes.some(note => String(note?.text || '').trim())) return true;
  if (Array.isArray(definition.drawing?.primitives) && definition.drawing.primitives.some(primitive => {
    try { validateDrawingPrimitive(primitive); return true; } catch { return false; }
  })) return true;
  const sketches = Array.isArray(definition.sketches) ? definition.sketches : [];
  if (sketches.some((sketch) => Array.isArray(sketch?.entities) && sketch.entities.length)) return true;
  const sketchIds = new Set(sketches.map((sketch) => sketch?.id).filter(Boolean));
  return Array.isArray(definition.history) && definition.history.some((entry) =>
    entry?.kind === "sketch" && sketchIds.has(entry.targetId));
}

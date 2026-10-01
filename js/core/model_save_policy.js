// A new editor document gets an implicit, empty working sketch. That is not
// authored work. A recorded sketch history row is, even before its first line
// is drawn, and sketch geometry imported from an older document is work too.
export function hasSaveableModelContent(definition) {
  if (!definition || typeof definition !== "object") return false;
  if (Array.isArray(definition.parts) && definition.parts.length) return true;
  const sketches = Array.isArray(definition.sketches) ? definition.sketches : [];
  if (sketches.some((sketch) => Array.isArray(sketch?.entities) && sketch.entities.length)) return true;
  const sketchIds = new Set(sketches.map((sketch) => sketch?.id).filter(Boolean));
  return Array.isArray(definition.history) && definition.history.some((entry) =>
    entry?.kind === "sketch" && sketchIds.has(entry.targetId));
}

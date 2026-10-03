export function discardIncidentalToolboxSketches(document) {
  if (!(document.features || []).some(feature => feature.type === "toolbox")) return;
  const recorded = new Set((document.history || []).map(entry => typeof entry === "string" ? entry : entry.targetId));
  document.sketches = (document.sketches || []).filter(sketch => {
    if (recorded.has(sketch.id) || sketch.name !== "X·Z sketch" || sketch.plane !== "top" || Number(sketch.offset) || sketch.support || sketch.frameSpace) return true;
    if (["points", "entities", "constraints", "dimensions"].some(key => (sketch[key] || []).length)) return true;
    return (document.features || []).some(feature => feature.params?.sketchId === sketch.id ||
      (feature.references?.sketches || []).some(ref => (typeof ref === "string" ? ref : ref.id) === sketch.id));
  });
  if (!document.sketches.some(sketch => sketch.id === document.activeSketch)) document.activeSketch = document.sketches[0]?.id || null;
}

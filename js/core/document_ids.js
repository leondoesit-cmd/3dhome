// Loaded CAD documents share the scene's numeric allocator. Reserve every
// authored ID before another point, entity or constraint can be created.
export function nextDocumentNumericId(document, current = 1) {
  let next = Math.max(1, Number(current) || 1);
  const seen = new WeakSet();
  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value) || ArrayBuffer.isView(value)) return;
    seen.add(value);
    if (Number.isSafeInteger(value.id) && value.id >= 0) next = Math.max(next, value.id + 1);
    for (const [key, child] of Object.entries(value)) {
      if (['meshData', 'sourcePayload', 'exactTopologyCache'].includes(key)) continue;
      if (child && typeof child === 'object') visit(child);
    }
  }
  visit(document);
  return next;
}

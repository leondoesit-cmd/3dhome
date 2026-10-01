/* An optimistic-save conflict never changes the model that another tab saved.
   Fork the fully prepared, live document instead of copying the stale library
   card, so sketches, features, and the latest unsaved edits all survive. */
export function forkConflictingModel(document, key, name) {
  if (!document || !key || key === document.key) throw new Error("A distinct model key is required");
  const copy=structuredClone(document);
  copy.key=key;
  copy.id=key;
  copy.definitionId=key;
  copy.name=name || `${document.name || document.key} copy`;
  return copy;
}

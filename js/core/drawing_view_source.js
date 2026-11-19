/* Which saved model a view draws, as SOLIDWORKS' "referenced model". null is
   the document that owns the sheet, which is what every view drew before views
   had sources, so an older sheet reads unchanged. The name is only the last
   known label, kept so a deleted source can still be named on the sheet. */
export function normalizeViewSource(source) {
  if (!source || typeof source !== "object") return null;
  const kind = source.kind === "part" || source.kind === "assembly" ? source.kind : null;
  const key = source.key;
  if (!kind || typeof key !== "string" || !key.trim()) return null;
  return { kind, key, name: typeof source.name === "string" ? source.name.slice(0, 120) : "" };
}

const derivedDefinition = view => view?.section || view?.alignedSection || view?.detail || view?.auxiliary;
export const derivedParentId = view => derivedDefinition(view)?.from ?? view?.parent;

/* A section, detail or auxiliary view is cut from its parent's geometry, so it
   draws whatever model its parent draws; only a base view owns a source. */
export function viewSourceOwner(doc, view) {
  const seen = new Set();
  let current = view;
  while (derivedDefinition(current)) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    current = (doc?.views || []).find(entry => entry.id === derivedParentId(current));
  }
  return current || null;
}

export function effectiveViewSource(doc, view) {
  return normalizeViewSource(viewSourceOwner(doc, view)?.source);
}

export function sameDrawingSource(a, b) {
  return a?.kind === b?.kind && a?.key === b?.key;
}

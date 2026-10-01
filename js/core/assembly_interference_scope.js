/** Selected top-level components include every leaf of selected subassemblies. */
export function assemblyInterferenceScope(assembly, selection, occurrences) {
  const selected = new Set((selection || []).map(component => String(component.id)));
  const roots = (assembly?.components || []).filter(component => selected.has(String(component.id)));
  if (roots.length < 2) return { occurrences, roots: [], wholeAssembly: true };
  const ids = new Set(roots.map(component => String(component.id)));
  return {
    occurrences: occurrences.filter(occurrence => ids.has(String(occurrence.path[0]))),
    roots,
    wholeAssembly: false,
  };
}

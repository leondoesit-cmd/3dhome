// Increment an operation when its exact algorithm changes. Prefix caches for
// unchanged upstream features remain reusable across kernel updates.
export const nativeOperationRevisions=Object.freeze({
 loft:'associative-terminal-point-cut-1',
 fillet:'supported-corner-repair-3',
  rib:'parallel-section-delta-2',
});

export function nativeOperationRevision(feature) {
 const params=feature?.params || {};
 if(feature?.type==='sweepCut' || feature?.type==='sweep' && params.operation==='subtract' && params.helixId)
  return 'contained-helical-sweep-cut-1';
 return nativeOperationRevisions[feature?.type];
}

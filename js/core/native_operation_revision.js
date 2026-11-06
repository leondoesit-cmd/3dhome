import {isSketchAxis, isStandaloneSketchAxisRevolve} from './revolve_geometry.js';

// Increment an operation when its exact algorithm changes. Prefix caches for
// unchanged upstream features remain reusable across kernel updates.
export const nativeOperationRevisions=Object.freeze({
 loft:'associative-terminal-point-cut-1',
 fillet:'supported-corner-repair-3',
 shell:'compound-shell-diagnostics-2',
  rib:'parallel-section-delta-2',
});

export function nativeOperationRevision(feature) {
 const params=feature?.params || {};
 if(feature?.type==='revolve' && params.thinFeature && isStandaloneSketchAxisRevolve(params))
  return 'unsupported-standalone-thin-revolve-1';
 if(feature?.type==='revolve' && (isSketchAxis(params.axis) || params.axisBasis))
  return 'sketch-axis-analytic-extrema-2';
 if(feature?.type==='sweepCut' || feature?.type==='sweep' && params.operation==='subtract' && params.helixId)
  return 'contained-helical-sweep-cut-1';
 return nativeOperationRevisions[feature?.type];
}

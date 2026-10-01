import {withKernelFailures} from './parametric_rebuild.js';

// Retain only diagnostic data, never the native bodies of a released run.
export function captureExactDiagnostics(document,node,editRevision,kernelRun) {
  if(kernelRun?.ok!==false)return null;
  const issues=(kernelRun.issues || []).filter(issue=>issue.code==='regeneration-failed' && issue.feature).map(issue=>({...issue}));
  return issues.length ? {document,node,editRevision,kernelRun:{issues}} : null;
}

export function applyCurrentExactDiagnostics(coreRun,anchor,document,node,editRevision) {
  return anchor && anchor.document===document && anchor.node===node && anchor.editRevision===editRevision
    ? withKernelFailures(coreRun,anchor.kernelRun) : coreRun;
}

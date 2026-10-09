// UI report freshness: metadata edits do not change physical mobility, while
// placements, grounding, suppression and mate settings invalidate its snapshot.
export function assemblyMobilitySignature(assembly) {
  return JSON.stringify({components:(assembly?.components || []).map(component=>({id:component.id,modelKey:component.modelKey,grounded:!!component.grounded,suppressed:!!component.suppressed,transform:component.transform,children:component.asm?assemblyMobilitySignature(component.asm):undefined})),mates:assembly?.mates || [],topologyMates:assembly?.topologyMates || []});
}

export function assemblyMobilityReport(assembly,result,issues=[]) {
  const count=result?.degreesOfFreedom;
  // The solver reports mate-connected clusters, not automatically every free
  // occurrence. An empty or partial cluster list must not turn a successful
  // save validation into a claimed whole-assembly zero mobility.
  const covered=new Set((result?.clusters || []).flatMap(cluster=>cluster.components || []));
  const complete=(assembly?.components || []).every(component=>component.suppressed || component.grounded || covered.has(component.id));
  return {assembly,signature:assemblyMobilitySignature(assembly),count,
    valid:complete&&result?.ok===true&&Number.isInteger(count)&&count>=0&&!issues.length&&!(result.unsatisfied || []).length};
}

export function currentAssemblyMobility(assembly,report) {
  return report?.valid&&report.assembly===assembly&&report.signature===assemblyMobilitySignature(assembly)?report.count:null;
}

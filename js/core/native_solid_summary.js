// Counts come from native shape enumeration saved beside the exact mesh.
// Projection records alone cannot establish connected solid counts.
export function nativeSolidSummary(parts,{singleRecipe=false}={}) {
  const active=(parts || []).filter(part=>!part.suppressed && !part.previewOnly);
  const selected=singleRecipe?active.slice(0,1):active;
  const counts=selected.map(part=>part.exactPending || part.exactError ? undefined : part.meshData?.nativeSolidCount);
  const known=counts.length>0 && counts.every(count=>Number.isInteger(count) && count>=0);
  return {known,count:known?counts.reduce((sum,count)=>sum+count,0):null,
    disconnected:counts.some(count=>Number.isInteger(count) && count>1),projections:selected.length};
}

// A preview rebuild can reuse a generated ID for a different face. Geometry
// from the visible exact mesh must agree before that ID can be trusted.
export function resolveFinishFace(reference,topology){
 const want=reference.descriptor;
 if(!want?.origin||!want.normal||!Number.isFinite(want.measure))throw new Error('The selected face has no exact geometry. Rebuild the body and select it again.');
 const matches=(topology||[]).filter(face=>{
  const d=face.descriptor;
  if(face.kind!=='face'||d?.surface!==want.surface||!d.origin||!d.normal)return false;
  const delta=Math.hypot(d.origin.x-want.origin.x,d.origin.y-want.origin.y,d.origin.z-want.origin.z);
  const normal=d.normal.x*want.normal.x+d.normal.y*want.normal.y+d.normal.z*want.normal.z;
  return delta<1e-5&&normal>1-1e-7&&Math.abs(d.measure-want.measure)<1e-5*Math.max(1,want.measure);
 });
 if(matches.length!==1)throw new Error(matches.length?'The selected face is ambiguous on the rebuilt body. Select it again.':'The selected face changed during rebuild. Select it again.');
 return matches[0];
}

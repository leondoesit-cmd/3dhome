// A suppressed feature is absent from compiled execution. Its input body is
// still present and determines the editable upstream topology stage.
export function featureInputStage(compiled,feature) {
  if(!compiled?.ok)throw new Error(compiled?.issues?.[0]?.message || 'Invalid feature history');
  const reference=feature.inputs?.[0],head=typeof reference==='object'?reference.id || reference.targetId:reference;
  const index=compiled.features.findIndex(item=>item.id===head);
  if(index<0)throw new Error('The feature input body is unavailable');
  return {head,document:{...compiled.document,features:compiled.features.slice(0,index+1)}};
}

export function canonicalFeatureTopologyReferences(document,references) {
  const ids=(document.features || []).map(feature=>feature.id).sort((a,b)=>b.length-a.length);
  return (references || []).map(reference=>{
    const owner=String(reference.ownerFeatureId || ''),id=ids.find(id=>owner===id || owner.startsWith(id+':'));
    return id && id!==owner?{...reference,ownerFeatureId:id}:reference;
  });
}

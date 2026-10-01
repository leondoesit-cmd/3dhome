const copy=value=>value===undefined?undefined:structuredClone(value);

function dependentFeatureIds(document,featureId) {
  const ids=new Set([featureId]);
  let changed=true;
  while(changed){changed=false;for(const feature of document.features || []){
    if(!ids.has(feature.id) && (feature.inputs || []).some(id=>ids.has(id))){ids.add(feature.id);changed=true;}
  }}
  return ids;
}

function moveDependentOperations(source,target,ids) {
  for(const key of ['cuts3d','merges3d','exactOperations']){
    const moved=(source[key] || []).filter(operation=>ids.has(operation.featureId || operation.id));
    if(!moved.length)continue;
    source[key]=(source[key] || []).filter(operation=>!ids.has(operation.featureId || operation.id));
    target[key]=(target[key] || []).concat(moved);
  }
}

// The feature graph owns the geometry. Parts are its display projections, so
// changing Merge result must also split/join those projections and move the
// later operations that depend on this boss onto the same resulting body.
export function transitionExtrudeProjection(document,feature) {
  if(feature?.type!=='extrude')return [];
  const parts=document.parts || [],newBody=feature.params?.mergeResult===false || feature.params?.operation==='new-body';
  const atProjectionEnd=Number.isFinite(document.rollback) && document.rollback>=parts.length;
  const standalone=parts.find(part=>part.featureId===feature.id);
  const host=parts.find(part=>(part.merges3d || []).some(merge=>merge.featureId===feature.id));
  const dependent=dependentFeatureIds(document,feature.id);
  if(newBody && host && !standalone){
    const merge=host.merges3d.find(item=>item.featureId===feature.id);
    const sketchId=feature.references?.sketches?.[0],sketch=(document.sketches || []).find(item=>item.id===(sketchId?.id || sketchId));
    const part={id:feature.id+':body',featureId:feature.id,name:feature.name,kind:'ext',axis:merge.axis,
      frame:copy(merge.frame),from:merge.from,to:merge.to,pts:copy(merge.loop),
      holes:(merge.holes || []).map(hole=>copy(hole.points || hole)),
      sketchId:sketch?.id,sketchDriven:!!feature.params?.profileEntityIds,
      profileEntityIds:copy(feature.params?.profileEntityIds),holeProfileEntityIds:copy(feature.params?.holeProfileEntityIds),
      support:copy(sketch?.support),supportBaseOffset:Number(sketch?.supportOffset)||0,
      supportDepth:Math.abs(merge.to-merge.from),direction:feature.params?.direction,symmetric:!!feature.params?.symmetric,
      draftAngle:merge.draftAngle || 0,draftOutward:!!merge.draftOutward,
      projectionMergeHostId:host.id,projectionMergeRecord:copy(merge)};
    for(const key of ['color','metal','rough','materialName','density','densitySource','materialCatalogId'])if(host[key]!==undefined)part[key]=copy(host[key]);
    host.merges3d=host.merges3d.filter(item=>item!==merge);
    moveDependentOperations(host,part,dependent);
    parts.push(part);
    if(atProjectionEnd)document.rollback=parts.length;
    return [host,part];
  }
  if(!newBody && standalone?.projectionMergeRecord){
    const target=parts.find(part=>part.id===standalone.projectionMergeHostId);
    if(!target)return [];
    target.merges3d=(target.merges3d || []).concat(copy(standalone.projectionMergeRecord));
    moveDependentOperations(standalone,target,dependent);
    document.parts=parts.filter(part=>part!==standalone);
    if(atProjectionEnd)document.rollback=document.parts.length;
    return [target];
  }
  return [];
}

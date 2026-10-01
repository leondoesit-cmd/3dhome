import {nativeSectionTarget} from './native_section_relation.js';

// Plain wire data only: native shapes remain owned by the exact executor.
export function collectNativeSections(document,run,sketch,edge,intersect) {
  const candidates=[];
  for(const feature of document.features || []) {
    if(document.nativeSectionOwnerId && feature.id!==document.nativeSectionOwnerId)continue;
    const body=run.results.get(feature.id);
    for(const face of body?.topology || []) {
      if(face.kind!=='face' || face.descriptor?.surface==='plane')continue;
      const reference={ownerFeatureId:feature.id,persistentId:face.persistentId,
        kind:'face',semantic:face.semantic,descriptor:structuredClone(face.descriptor)};
      try {
        const query=(ref,origin,direction)=>intersect(body,ref,origin,direction);
        candidates.push({reference,name:feature.name || feature.type,surface:face.descriptor.surface,
          lower:nativeSectionTarget(sketch,edge,reference,query,'lower'),
          upper:nativeSectionTarget(sketch,edge,reference,query,'upper')});
      }catch{/* Trimmed surfaces that do not meet this line are not candidates. */}
    }
  }
  return candidates;
}

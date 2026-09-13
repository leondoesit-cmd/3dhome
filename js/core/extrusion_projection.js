// Keep the editable body's cut/boss recipes on the same support as the exact
// feature history. A recipe stored at creation time is not a fixed workplane.
import { alignExtrusionToSupport } from '../cad_feature_tree.js';

export function synchronizeExtrusionProjections(document, compiled, run) {
  const dirty=[];
  for (const part of document.parts || []) {
    let changed=false;
    for (const record of [...(part.cuts3d || []),...(part.merges3d || [])]) {
      const feature=(compiled || []).find(f=>f.id===record.featureId+':tool'&&f.type==='extrude');
      if (!feature || !run.results?.has(feature.id) || !feature.params?.support) continue;
      const params=run.resolvedExtrusions?.get(feature.id) || alignExtrusionToSupport(feature.params,run.topologyBindings || []);
      const next={axis:params.axis,frame:params.frame};
      if(run.resolvedExtrusions?.has(feature.id)){next.loop=params.points;if(params.segments)next.segments=params.segments;if(params.holes)next.holes=params.holes;}
      // Through-all recipes already span the body. Move their interval with
      // the frame so that the same world-space extent remains covered.
      if (params.endCondition === "through-all" && record.frame && params.frame) {
        const normal=params.frame.normal,old=record.frame.origin,now=params.frame.origin;
        const shift=(old.x-now.x)*normal.x+(old.y-now.y)*normal.y+(old.z-now.z)*normal.z;
        next.from=record.from+shift;next.to=record.to+shift;
      } else {next.from=params.from;next.to=params.to;}
      for(const [key,value] of Object.entries(next)) if(JSON.stringify(record[key])!==JSON.stringify(value)) {
        record[key]=structuredClone(value);changed=true;
      }
    }
    if(changed){delete part.meshData;dirty.push(part.id);}
  }
  if(run.ok)for(const update of run.boundaryUpdates?.values() || []){
    const index=document.sketches.findIndex(sketch=>sketch.id===update.sketch.id);
    if(index<0)continue;
    document.sketches[index]=structuredClone(update.sketch);
    for(const feature of document.features || []){
      const ids=feature.params?.profileEntityIds;
      if(feature.params?.sketchId===update.sketch.id && ids?.length===update.oldEntityIds.length && ids.every(id=>update.oldEntityIds.includes(id))){
        feature.params.profileEntityIds=[...update.newEntityIds];
        if(feature.references?.profileEntityIds)feature.references.profileEntityIds=[...update.newEntityIds];
      }
    }
  }
  if(run.ok)for(const update of run.referenceUpdates || []){
    const patch=structuredClone(update);
    const geometry=(document.referenceGeometry || []).find(r=>r.id===update.id);
    if(geometry)Object.assign(geometry,patch);
    const reference=(document.references || []).find(r=>r.id===update.id);
    if(reference && patch.origin) Object.assign(reference,{origin:patch.origin,normal:patch.normal,offset:patch.offset});
  }
  return dirty;
}

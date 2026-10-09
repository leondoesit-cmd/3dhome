// Keep the editable body's cut/boss recipes on the same support as the exact
// feature history. A recipe stored at creation time is not a fixed workplane.
import { alignExtrusionToSupport } from '../cad_feature_tree.js';
import { resolveProfilePoints } from '../sketch_solver.js';
import { sketchProfileSegments } from './profile_curves.js';

export function extrusionPreviewDirection(sketch,axis,direction) {
  // Local frame coordinates already carry their oriented normal. World-axis
  // sketches use the support normal, or their principal plane's positive axis.
  // The previous interval is output; using its sign makes Reverse sticky.
  const normal=sketch?.frame?.normal;
  const principal=axis==='frame' || !normal ? 1 : Math.sign(normal[axis] || 1);
  return (direction==='reverse'?-1:1)*principal;
}

// A principal-plane or offset edit changes the extrusion's working frame.
// Exact compilation already reads that frame from the sketch, but the saved
// feature extent and lightweight body/merge/cut records must move with it as
// well. Otherwise an ordinary Depth edit can briefly show (and save) a boss
// along the sketch's *former* axis while the native rebuild is pending.
export function synchronizeSketchExtrusionFrames(document, sketchId) {
  const sketch=(document?.sketches || []).find(item=>item.id===sketchId);
  if(!sketch)return [];
  const axis=sketch.frameSpace==='local' && sketch.frame ? 'frame'
    : sketch.plane==='front' ? 'z' : sketch.plane==='side' ? 'x' : 'y';
  const frame=axis==='frame' ? structuredClone(sketch.frame) : undefined;
  const changed=[];
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const assign=(item,key,value)=>{
    if(value===undefined){if(key in item){delete item[key];return true;}return false;}
    if(same(item[key],value))return false;
    item[key]=structuredClone(value);return true;
  };
  for(const feature of document.features || []){
    if(!['extrude','extrudeCut'].includes(feature.type))continue;
    const references=feature.references?.sketches || [];
    if(feature.params?.sketchId!==sketchId && !references.some(ref=>(ref?.id || ref)===sketchId))continue;
    const params=feature.params || (feature.params={});
    const reverse=params.direction==='reverse' ? -1 : 1;
    const measured=!['blind','mid-plane',undefined].includes(params.endCondition);
    const storedSpan=Math.abs((Number(params.to)||0)-(Number(params.from)||0));
    const depth=(measured ? storedSpan : Math.abs(Number(params.depth))) || storedSpan;
    const offset=Number(params.offset)||0;
    const base=(axis==='frame' ? 0 : Number(sketch.offset)||0)+reverse*offset;
    const symmetric=!!params.symmetric || params.endCondition==='mid-plane';
    const from=symmetric ? base-reverse*depth/2 : base;
    const to=symmetric ? base+reverse*depth/2 : base+reverse*depth;
    let edited=assign(params,'axis',axis) | assign(params,'frame',frame)
      | assign(params,'from',from) | assign(params,'to',to);
    // The sketch, not an old face attachment, owns the current support.
    edited|=assign(params,'support',sketch.support ? structuredClone(sketch.support) : undefined);
    const profileIds=params.profileEntityIds || feature.references?.profileEntityIds;
    const points=profileIds?.length ? resolveProfilePoints(sketch,profileIds) : null;
    const holeIds=params.holeProfileEntityIds || [];
    const holes=holeIds.map(ids=>resolveProfilePoints(sketch,ids));
    if(points && 'points' in params)edited|=assign(params,'points',points);
    // An explicitly empty associative hole set removes the old holes. Missing
    // bindings still belong to legacy sampled recipes; unresolved IDs remain
    // untouched so their native rebuild can report the broken reference.
    if(Array.isArray(params.holeProfileEntityIds) && holes.every(Boolean))edited|=assign(params,'holes',holes);
    for(const part of document.parts || []){
      const records=[];
      if(part.featureId===feature.id && part.kind==='ext')records.push({record:part,body:true});
      for(const record of [...(part.merges3d || []),...(part.cuts3d || [])])
        if(record.featureId===feature.id)records.push({record,body:false});
      for(const {record,body} of records){
        let projectionEdited=assign(record,'axis',axis) | assign(record,'frame',frame)
          | assign(record,'from',from) | assign(record,'to',to);
        projectionEdited|=assign(record,'support',sketch.support ? structuredClone(sketch.support) : undefined);
        if(points){
          projectionEdited|=assign(record,body?'pts':'loop',points);
          if(!body)projectionEdited|=assign(record,'segments',sketchProfileSegments(sketch,profileIds));
        }
        if(Array.isArray(params.holeProfileEntityIds) && holes.every(Boolean)){
          const next=body ? holes : holes.map((loop,index)=>({points:loop,segments:sketchProfileSegments(sketch,holeIds[index])}));
          projectionEdited|=assign(record,'holes',next);
        }
        if(projectionEdited){delete part.meshData;changed.push(part.id);}
      }
    }
    if(edited)changed.push(feature.id);
  }
  return [...new Set(changed)];
}

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
    /* A plane display patch carries where the plane landed, not how far it
       sits from its parent. Copying `offset: undefined` over the reference
       dropped HOUSING BatteryLoftPlane's 1.300 in on the next save; the next
       rebuild then read 0 and put the plane on its face. Keep the offset
       unless the patch really has one. */
    if(reference && patch.origin){
      Object.assign(reference,{origin:patch.origin,normal:patch.normal});
      if(patch.offset!=null && Number.isFinite(Number(patch.offset)))reference.offset=Number(patch.offset);
    }
  }
  return dirty;
}

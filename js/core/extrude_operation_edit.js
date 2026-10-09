import {updateFeatureDefinition} from './parametric_document.js';
import {resolveProfilePoints} from '../sketch_solver.js';
import {sketchProfileSegments} from './profile_curves.js';

// Conversion keeps the canonical node; only its Boolean and display recipe
// change. A first/new body has no target and cannot safely become a cut.
export function setExtrudeFeatureOperation(document,featureId,operation,changes={}) {
 const feature=(document.features || []).find(item=>item.id===featureId);
 if(!feature || !['extrude','extrudeCut'].includes(feature.type) || !['add','subtract'].includes(operation))
  throw new Error('Choose Add material or Subtract for an existing extrusion');
 const type=operation==='add'?'extrude':'extrudeCut';
 if(type===feature.type)return updateFeatureDefinition(document,featureId,{...changes,params:{...changes.params,operation}});
 const targetId=feature.inputs?.[0],index=document.features.indexOf(feature);
 if(!targetId || !document.features.slice(0,index).some(item=>item.id===targetId) ||
   feature.type==='extrude' && (feature.params?.mergeResult===false || feature.params?.operation==='new-body' ||
     (document.parts || []).some(part=>part.featureId===featureId)))
  throw new Error('Operation conversion requires an existing target body');
 const upstream=new Set([targetId]);
 for(let i=index-1;i>=0;i--){const item=document.features[i];if(upstream.has(item.id))for(const input of item.inputs || [])upstream.add(input);}
 const hosts=(document.parts || []).filter(part=>upstream.has(part.featureId) ||
  [...(part.cuts3d || []),...(part.merges3d || []),...(part.holes || [])].some(record=>record.featureId===featureId));
 if(hosts.length!==1)throw new Error('Operation conversion requires one existing target projection');
 const host=hosts[0],params={...feature.params,...changes.params,operation,mergeResult:true};
 const sketchId=params.sketchId || feature.references?.sketches?.[0]?.id || feature.references?.sketches?.[0];
 const sketch=(document.sketches || []).find(item=>item.id===sketchId);
 const ids=params.profileEntityIds || feature.references?.profileEntityIds;
 const loop=ids?.length && sketch ? resolveProfilePoints(sketch,ids) : params.points;
 const previous=[...(host.cuts3d || []),...(host.merges3d || [])].filter(record=>record.featureId===featureId);
 const taggedHole=(host.holes || []).find(hole=>hole.featureId===featureId);
 let records=previous.map(record=>structuredClone(record));
 if(!records.length){
  const points=loop || taggedHole?.points;
  if(!points?.length)throw new Error('Refresh the extrusion sketch contour before changing operation');
  records=[{featureId,axis:params.axis || host.axis,frame:structuredClone(params.frame),
   from:params.from,to:params.to,loop:structuredClone(points)}];
 }
 const holes=(params.holeProfileEntityIds || []).map(holeIds=>({points:resolveProfilePoints(sketch,holeIds),segments:sketchProfileSegments(sketch,holeIds)}));
 for(const record of records){
  if(loop && records.length===1){record.loop=structuredClone(loop);if(ids?.length && sketch)record.segments=sketchProfileSegments(sketch,ids);}
  if(holes.length && records.length===1)record.holes=holes;
  record.featureId=featureId;
 }
 // Validate the complete candidate before changing any document or projection.
 const trial={features:[structuredClone(feature)],history:[]};
 updateFeatureDefinition(trial,featureId,{...changes,type,params});
 const updated=updateFeatureDefinition(document,featureId,{...changes,type,params});
 host.cuts3d=(host.cuts3d || []).filter(record=>record.featureId!==featureId);
 host.merges3d=(host.merges3d || []).filter(record=>record.featureId!==featureId);
 host.holes=(host.holes || []).filter(hole=>hole.featureId!==featureId);
 host[type==='extrude'?'merges3d':'cuts3d'].push(...records);
 delete host.meshData;delete document.exactTopologyCache;
 host.exactPending=false;host.exactError=null;
 return updated;
}

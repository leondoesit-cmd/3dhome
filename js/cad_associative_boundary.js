import {offsetFaceBoundary,appendBoundarySketch} from './cad_face_offset.js';
import {realignFrame} from './core/frame.js';
import {segmentProfilePoints} from './core/profile_curves.js';

export function resolveAssociativeBoundary(sketch, params, results) {
 const ids=params.profileEntityIds || [];
 const copy=(sketch?.boundaryCopies || []).find(copy=>copy.associative && copy.entityIds?.length===ids.length && ids.every(id=>copy.entityIds.includes(id)));
 if(!copy)return null;
 const source=results.get(copy.source.ownerFeatureId);
 if(!source?.shape)throw new Error('Linked boundary source is unavailable');
 const face=source.topology?.find(face=>face.persistentId===copy.source.persistentId);
 if(!face?.descriptor?.origin||!face.descriptor.normal)throw new Error('Linked boundary source face is unavailable');
 const frame=realignFrame(sketch.frame,face.descriptor.origin,face.descriptor.normal);
 const loops=offsetFaceBoundary(source,copy.source,frame,Number(copy.distance));
 if(loops.length!==1)throw new Error('The linked offset split into multiple regions; edit its source offset');
 const segments=loops[0],temp={points:[],entities:[]};let n=0;
 const prefix=copy.id || ('boundary:'+copy.entityIds[0]);
 const entities=appendBoundarySketch(temp,loops,()=>prefix+':'+(++n));
 const oldIds=new Set(copy.entityIds),oldEntities=(sketch.entities || []).filter(e=>oldIds.has(e.id));
 const oldPoints=new Set(oldEntities.flatMap(e=>[e.a,e.b,e.c].filter(Boolean)));
 if((sketch.constraints || []).some(c=>JSON.stringify(c).match(/"(?:entities|points|entity|point)"/) && [...oldIds,...oldPoints].some(id=>JSON.stringify(c).includes('"'+id+'"'))))throw new Error('Remove dimensions on the copied geometry before linking its boundary');
 const updated=structuredClone(sketch);
 updated.entities=updated.entities.filter(e=>!oldIds.has(e.id)).concat(entities);
 const retained=new Set(updated.entities.flatMap(e=>[e.a,e.b,e.c].filter(Boolean)));
 updated.points=updated.points.filter(p=>!oldPoints.has(p.id)||retained.has(p.id)).concat(temp.points);
 const nextCopy=updated.boundaryCopies.find(item=>item.entityIds[0]===copy.entityIds[0]);
 nextCopy.id=prefix;nextCopy.entityIds=entities.map(e=>e.id);
 updated.frame=frame;
 return {params:{...params,points:segmentProfilePoints(segments),segments,frame,axis:'frame'},sketch:updated,oldEntityIds:copy.entityIds,newEntityIds:nextCopy.entityIds};
}

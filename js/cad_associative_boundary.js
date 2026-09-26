import {offsetFaceBoundary,appendBoundarySketch} from './cad_face_offset.js';
import {realignFrame} from './core/frame.js';
import {segmentProfilePoints} from './core/profile_curves.js';
import {createTopologyRegistry,resolveTopologyReference} from './core/topology.js';

function loopArea(segments) {
  const points=segmentProfilePoints(segments) || [];
  let area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i], b=points[(i+1)%points.length];
    area+=a.u*b.v-b.u*a.v;
  }
  return area/2;
}

function sourceFace(result, reference) {
 if(!result?.shape)return null;
 const resolved=resolveTopologyReference(reference,createTopologyRegistry(result.topology || []));
 return resolved.status==='missing'||resolved.status==='ambiguous' ? null : resolved.topology;
}

export function resolveAssociativeBoundary(sketch, params, results) {
 const ids=params.profileEntityIds || [];
 const copy=(sketch?.boundaryCopies || []).find(copy=>copy.associative && copy.entityIds?.length===ids.length && ids.every(id=>copy.entityIds.includes(id)));
 if(!copy)return null;
 /* The boundary belongs to the body state immediately before this extrusion.
    Older documents recorded the feature that originally named the support
    face instead.  A fillet can preserve that persistent face id while changing
    its wire, so rebuilding from the old owner silently restores square corners.
    Prefer the consuming feature's target and retain the old owner only as a
    compatibility fallback for boundaries that reference another body. */
 const targetId=params.targetFeatureId;
 let sourceId=targetId,source=targetId ? results.get(targetId) : null;
 let face=sourceFace(source,copy.source);
 if(!face){sourceId=copy.source.ownerFeatureId;source=results.get(sourceId);face=sourceFace(source,copy.source);}
 if(!source?.shape)throw new Error('Linked boundary source is unavailable');
 if(!face?.descriptor?.origin||!face.descriptor.normal)throw new Error('Linked boundary source face is unavailable');
 const sourceReference={
  ...structuredClone(copy.source),
  ownerFeatureId:sourceId,
  persistentId:face.persistentId,
  semantic:face.semantic ?? copy.source.semantic,
  descriptor:structuredClone(face.descriptor),
 };
 const frame=realignFrame(sketch.frame,face.descriptor.origin,face.descriptor.normal);
 const loops=offsetFaceBoundary(source,sourceReference,frame,Number(copy.distance));
 if(!loops.length)throw new Error('The linked offset leaves no closed boundary');
 if(copy.loopCount!=null && copy.loopCount!==loops.length)throw new Error('The linked offset changed its number of regions; edit its source offset');
 const ranked=loops.map((segments)=>({segments,area:Math.abs(loopArea(segments))})).sort((a,b)=>b.area-a.area);
 const outer=ranked[0].segments, holes=ranked.slice(1).map((item)=>item.segments);
 const temp={points:[],entities:[]};let n=0;
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
 nextCopy.id=prefix;nextCopy.source=sourceReference;nextCopy.entityIds=entities.map(e=>e.id);nextCopy.loopCount=loops.length;
 updated.frame=frame;
 return {
  params:{
   ...params,
   points:segmentProfilePoints(outer),
   segments:outer,
   holes:holes.map((segments)=>({points:segmentProfilePoints(segments),segments})),
   frame,axis:'frame',
  },
  sketch:updated,oldEntityIds:copy.entityIds,newEntityIds:nextCopy.entityIds,
 };
}

// Keep concentric converted circles associative after trimming or adding lines.
// Entity ids and trim endpoints stay intact so the user's relations can solve
// against the new radii. Restrict rank matching to nested, concentric circles.
export function updateCircularBoundarySketch(sketch, results) {
 let updated=null;
 for(const copy of sketch?.boundaryCopies || []){
  if(!copy.associative)continue;
  const entities=copy.entityIds.map(id=>sketch.entities.find(e=>e.id===id));
  if(!entities.length || entities.some(e=>!e || !(e.type==='circle'||e.type==='arc'&&Number.isFinite(e.fixedRadius))))continue;
  const centers=entities.map(e=>sketch.points.find(p=>p.id===e.c));
  if(centers.some(p=>!p || Math.hypot(p.x-centers[0].x,p.y-centers[0].y)>1e-6))continue;
  const source=results.get(copy.source.ownerFeatureId),face=sourceFace(source,copy.source);
  if(!face)throw new Error('Linked circular boundary source face is unavailable');
  const frame=realignFrame(sketch.frame,face.descriptor.origin,face.descriptor.normal);
  const loops=offsetFaceBoundary(source,{...copy.source,persistentId:face.persistentId},frame,Number(copy.distance));
  if(loops.length!==entities.length || loops.some(loop=>loop.length!==1 || loop[0].type!=='circle'))throw new Error('Linked circular boundary changed its regions');
  const circles=loops.map(loop=>loop[0]).sort((a,b)=>a.radius-b.radius);
  if(circles.some(c=>Math.hypot(c.center.u-circles[0].center.u,c.center.v-circles[0].center.v)>1e-6))throw new Error('Linked circular boundary is no longer concentric');
  const ordered=entities.slice().sort((a,b)=>(a.r??a.fixedRadius)-(b.r??b.fixedRadius));
  updated ||= structuredClone(sketch);
  updated.frame=frame;
  ordered.forEach((old,i)=>{
   const entity=updated.entities.find(e=>e.id===old.id),circle=circles[i],point=updated.points.find(p=>p.id===entity.c);
   point.x=circle.center.u;point.y=circle.center.v;
   if(entity.type==='circle')entity.r=circle.radius;else entity.fixedRadius=circle.radius;
   for(const constraint of updated.constraints || [])if(constraint.type==='fixed'&&constraint.point===point.id){constraint.x=point.x;constraint.y=point.y;}
  });
 }
 return updated;
}

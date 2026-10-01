import {sketchWorldPoint} from './swept_sources.js';
export function coneSilhouette(sketch,face,options={}){
 const d=face.descriptor || face;if(!['cone','cylinder'].includes(d.surface)||!d.referenceOrigin||!d.axisRange)throw new Error('Select a conical or cylindrical face');
 const origin=sketchWorldPoint(sketch,0,0),u=sketchWorldPoint(sketch,1,0),v=sketchWorldPoint(sketch,0,1),sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const x=sub(u,origin),y=sub(v,origin),n={x:x.y*y.z-x.z*y.y,y:x.z*y.x-x.x*y.z,z:x.x*y.y-x.y*y.x},axis=d.axis;
 if(Math.abs(dot(n,axis))>1e-6||Math.abs(dot(sub(d.referenceOrigin,origin),n))>1e-6)throw new Error('The sketch plane must pass through the face axis');
 let radial={x:n.y*axis.z-n.z*axis.y,y:n.z*axis.x-n.x*axis.z,z:n.x*axis.y-n.y*axis.x};
 if(dot(radial,y)<-1e-6 || (Math.abs(dot(radial,y))<1e-6 && dot(radial,x)<0))radial={x:-radial.x,y:-radial.y,z:-radial.z};
 if(options.side==='opposite')radial={x:-radial.x,y:-radial.y,z:-radial.z};
 const at=t=>{const radius=d.radius+t*Math.tan(d.angle || 0),p={x:d.referenceOrigin.x+axis.x*t+radial.x*radius,y:d.referenceOrigin.y+axis.y*t+radial.y*radius,z:d.referenceOrigin.z+axis.z*t+radial.z*radius},q=sub(p,origin);return {x:dot(q,x),y:dot(q,y)};};
 let a=at(d.axisRange[0]),b=at(d.axisRange[1]);if(options.fromEnd==='upper')[a,b]=[b,a];
 const full=Math.hypot(b.x-a.x,b.y-a.y),requested=Number(options.length ?? 0),length=requested===0?full:requested;
 if(!Number.isFinite(length)||!(full>1e-9)||!(length>0)||length>full+1e-6)throw new Error('Converted line length exceeds the source face');
 b={x:a.x+(b.x-a.x)*length/full,y:a.y+(b.y-a.y)*length/full};return {a,b,fullLength:full};
}
export function updateSilhouetteSketch(sketch,resolveFace){
 const updated=structuredClone(sketch);
 const linkedOffset=(copy,seen=new Set())=>{
  const relation=updated.constraints.find(c=>c.type==='offset'&&c.b===copy.entityId&&!c.suppressed&&updated.circleCopies.some(parent=>parent.entityId===c.a));
  const parentId=copy.offsetFrom || relation?.a;
  if(!parentId)return copy.offset || 0;
  if(seen.has(copy.entityId))throw new Error('Circular offset dependency is cyclic');
  seen.add(copy.entityId);
  const parent=updated.circleCopies.find(item=>item.entityId===parentId);
  const dimension=updated.constraints.find(c=>c.type==='offset'&&c.a===parentId&&c.b===copy.entityId&&!c.suppressed);
  if(!parent||!dimension)throw new Error('Linked circular offset source or distance is unavailable');
  return linkedOffset(parent,seen)+dimension.value;
 };
 for(const copy of updated.silhouetteCopies || []){
  const face=resolveFace(copy.source);if(!face)throw new Error('Linked silhouette source face is unavailable');
  const line=coneSilhouette(updated,face,copy),entity=updated.entities.find(e=>e.id===copy.entityId);if(!entity)throw new Error('Linked silhouette line is missing');
  for(const [id,point] of [[entity.a,line.a],[entity.b,line.b]]){Object.assign(updated.points.find(p=>p.id===id),point);for(const constraint of updated.constraints || [])if(constraint.type==='fixed'&&constraint.point===id)Object.assign(constraint,point);}
 }
 for(const copy of updated.circleCopies || []){
  const edge=resolveFace(copy.source);if(!edge)throw new Error('Linked circular edge is unavailable');
  const circle=projectCircularEdge(updated,edge),entity=updated.entities.find(e=>e.id===copy.entityId);if(!entity)throw new Error('Linked circle is missing');
  const point=updated.points.find(p=>p.id===entity.c);Object.assign(point,{x:circle.x,y:circle.y});entity.r=circle.radius+linkedOffset(copy);
  if(!Number.isFinite(entity.r)||entity.r<=1e-6)throw new Error('Circular offset collapses the source circle');
  for(const constraint of updated.constraints || []){if(constraint.type==='fixed'&&constraint.point===point.id)Object.assign(constraint,{x:circle.x,y:circle.y});if(constraint.type==='diameter'&&constraint.entity===entity.id)constraint.value=2*entity.r;}
 }
 return updated;
}

/* Retarget an existing profile without breaking downstream feature entity ids.
   The conversion's trim length is the driver; its old length dimension remains
   visible as a reference instead of fighting the linked endpoint positions. */
export function retargetSilhouetteLine(sketch,entityId,face,options={},makeId=()=>undefined){
 const trial=structuredClone(sketch),entity=trial.entities?.find(e=>e.id===entityId&&e.type==='line'&&!e.construction);
 if(!entity)throw new Error('Select an existing profile line');
 const line=coneSilhouette(trial,face,options);
 const endpoints=[entity.a,entity.b];
 for(const [id,point] of [[entity.a,line.a],[entity.b,line.b]]){
  const target=trial.points.find(p=>p.id===id);if(!target)throw new Error('Selected line endpoint is missing');Object.assign(target,point);
 }
 trial.constraints=(trial.constraints || []).filter(c=>!(c.type==='fixed'&&endpoints.includes(c.point)));
 for(const constraint of trial.constraints){if(constraint.entity===entityId&&['distance','angle','horizontalDistance','verticalDistance'].includes(constraint.type))constraint.driven=true;}
 for(const [id,point] of [[entity.a,line.a],[entity.b,line.b]])trial.constraints.push({id:makeId(),type:'fixed',point:id,x:point.x,y:point.y});
 trial.silhouetteCopies=(trial.silhouetteCopies || []).filter(copy=>copy.entityId!==entityId);
 trial.silhouetteCopies.push({source:structuredClone(face),entityId,side:options.side,fromEnd:options.fromEnd,length:options.length});
 Object.assign(sketch,trial);return sketch.entities.find(e=>e.id===entityId);
}

/* Convert Entities is associative until the user explicitly drives the copied
   geometry.  Once a radius/diameter is edited, keeping the hidden source link
   would let the next exact rebuild silently restore the source edge's old
   size.  Detaching only the edited entity preserves every other converted
   boundary and makes the dimension the new source of truth. */
export function detachLinkedSketchEntity(sketch,entityId){
 if(!sketch || entityId==null)return false;
 let changed=false;
 for(const key of ['circleCopies','silhouetteCopies']){
  if(!Array.isArray(sketch[key]))continue;
  const retained=sketch[key].filter(copy=>copy?.entityId!==entityId);
  if(retained.length!==sketch[key].length){sketch[key]=retained;changed=true;}
 }
 return changed;
}

/* All dimension-editing surfaces use this policy function. Keeping the policy
   beside the external-reference data avoids a UI path accidentally forgetting
   to break the link. Reference and suppressed dimensions remain associative;
   an active driving radial dimension becomes the authority. */
export function detachDrivenSketchDimension(sketch,constraint){
 if(!constraint || constraint.driven || constraint.suppressed)return false;
 if(constraint.type!=='radius' && constraint.type!=='diameter')return false;
 return detachLinkedSketchEntity(sketch,constraint.entity);
}

/* A converted circle follows its source edge by persistent id first. Edge ids
   carry an ordinal ("generated:circle:11") that moves whenever the source
   feature's kernel result is built differently (HOUSING's exact shell), so an
   id that is gone or now names something other than a complete circle falls
   back to geometry: the one complete circle on the same axis,
   centre and radius. Two such circles, or none, still fail; the semantic role
   is not trusted because it is the same ordinal. Faces keep the exact lookup. */
export function linkedEdgeLookup(topology,ref,tolerance=1e-4){
 const list=topology || [],exact=list.find(t=>t.persistentId===ref.persistentId),want=ref.descriptor;
 const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,full=d=>d?.curve==='circle'&&Math.abs(d.measure-2*Math.PI*d.radius)<=1e-6;
 if(ref.kind!=='edge'||!full(want)||!want.origin||!want.axis)return exact;
 if(exact&&full(exact.descriptor))return exact;
 const same=list.filter(t=>{const d=t.descriptor;return t.kind==='edge'&&full(d)&&d.origin&&d.axis&&Math.abs(d.radius-want.radius)<=tolerance
  &&Math.abs(Math.abs(dot(d.axis,want.axis))-1)<=1e-6&&Math.hypot(d.origin.x-want.origin.x,d.origin.y-want.origin.y,d.origin.z-want.origin.z)<=tolerance;});
 return same.length===1?same[0]:undefined;
}

export function projectCircularEdge(sketch,edge){
 const d=edge.descriptor || edge;
 if(d.curve!=='circle'||Math.abs(d.measure-2*Math.PI*d.radius)>1e-6)throw new Error('Select a complete circular edge');
 const o=sketchWorldPoint(sketch,0,0),u=sketchWorldPoint(sketch,1,0),v=sketchWorldPoint(sketch,0,1),x={x:u.x-o.x,y:u.y-o.y,z:u.z-o.z},y={x:v.x-o.x,y:v.y-o.y,z:v.z-o.z},dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 if(Math.abs(dot(d.axis,x))>1e-6||Math.abs(dot(d.axis,y))>1e-6)throw new Error('The circular edge must be parallel to the sketch plane');
 const q={x:d.origin.x-o.x,y:d.origin.y-o.y,z:d.origin.z-o.z};return {x:dot(q,x),y:dot(q,y),radius:d.radius};
}

// Explicit repair preserves the entity id consumed by an existing annular
// feature. Choosing another edge must not silently create a duplicate circle.
export function retargetConvertedCircle(sketch,entityId,edge){
 const trial=structuredClone(sketch),copy=trial.circleCopies?.find(item=>item.entityId===entityId),entity=trial.entities?.find(item=>item.id===entityId&&item.type==='circle');
 if(!copy||!entity)throw new Error('Select an existing converted circle');
 if(copy.offsetFrom)throw new Error('Relink the base converted circle before its offset');
 const family=new Set([entityId]);let changed=true;
 while(changed){changed=false;for(const child of trial.circleCopies){
  const parent=child.offsetFrom || trial.constraints.find(c=>c.type==='offset'&&c.b===child.entityId&&!c.suppressed)?.a;
  if(family.has(parent)&&!family.has(child.entityId)){family.add(child.entityId);changed=true;}
 }}
 for(const child of trial.circleCopies)if(family.has(child.entityId))child.source=structuredClone(edge);
 const updated=updateSilhouetteSketch({...trial,circleCopies:trial.circleCopies.filter(child=>family.has(child.entityId)),silhouetteCopies:[]},ref=>ref);
 Object.assign(sketch,{points:updated.points,entities:updated.entities,constraints:updated.constraints,circleCopies:trial.circleCopies});
 return sketch.entities.find(item=>item.id===entityId);
}

// The offset stores its signed distance, not a frozen copy of the source radius.
export function appendCircularEdgeOffset(sketch,edge,distance,makeId){
 const circle=projectCircularEdge(sketch,edge),radius=circle.radius+distance;
 if(!Number.isFinite(distance)||!distance||!Number.isFinite(radius)||radius<=1e-6)throw new Error('Offset must leave a positive circle radius');
 const point={id:makeId(),x:circle.x,y:circle.y},entity={id:makeId(),type:'circle',c:point.id,r:radius,construction:false};
 sketch.points.push(point);sketch.entities.push(entity);
 sketch.constraints.push({id:makeId(),type:'fixed',point:point.id,x:point.x,y:point.y},{id:makeId(),type:'diameter',entity:entity.id,value:2*radius});
 sketch.circleCopies=sketch.circleCopies || [];
 sketch.circleCopies.push({source:structuredClone(edge),entityId:entity.id,offset:distance});
 return entity;
}

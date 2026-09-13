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
 for(const copy of updated.silhouetteCopies || []){
  const face=resolveFace(copy.source);if(!face)throw new Error('Linked silhouette source face is unavailable');
  const line=coneSilhouette(updated,face,copy),entity=updated.entities.find(e=>e.id===copy.entityId);if(!entity)throw new Error('Linked silhouette line is missing');
  for(const [id,point] of [[entity.a,line.a],[entity.b,line.b]]){Object.assign(updated.points.find(p=>p.id===id),point);for(const constraint of updated.constraints || [])if(constraint.type==='fixed'&&constraint.point===id)Object.assign(constraint,point);}
 }
 for(const copy of updated.circleCopies || []){
  const edge=resolveFace(copy.source);if(!edge)throw new Error('Linked circular edge is unavailable');
  const circle=projectCircularEdge(updated,edge),entity=updated.entities.find(e=>e.id===copy.entityId);if(!entity)throw new Error('Linked circle is missing');
  const point=updated.points.find(p=>p.id===entity.c);Object.assign(point,{x:circle.x,y:circle.y});entity.r=circle.radius;
  for(const constraint of updated.constraints || []){if(constraint.type==='fixed'&&constraint.point===point.id)Object.assign(constraint,{x:circle.x,y:circle.y});if(constraint.type==='diameter'&&constraint.entity===entity.id)constraint.value=2*circle.radius;}
 }
 return updated;
}

export function projectCircularEdge(sketch,edge){
 const d=edge.descriptor || edge;
 if(d.curve!=='circle'||Math.abs(d.measure-2*Math.PI*d.radius)>1e-6)throw new Error('Select a complete circular edge');
 const o=sketchWorldPoint(sketch,0,0),u=sketchWorldPoint(sketch,1,0),v=sketchWorldPoint(sketch,0,1),x={x:u.x-o.x,y:u.y-o.y,z:u.z-o.z},y={x:v.x-o.x,y:v.y-o.y,z:v.z-o.z},dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 if(Math.abs(dot(d.axis,x))>1e-6||Math.abs(dot(d.axis,y))>1e-6)throw new Error('The circular edge must be parallel to the sketch plane');
 const q={x:d.origin.x-o.x,y:d.origin.y-o.y,z:d.origin.z-o.z};return {x:dot(q,x),y:dot(q,y),radius:d.radius};
}

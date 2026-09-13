import {frameFromPlane} from './frame.js';

// Resolve parent planes before their children, then move attached sketch frames.
// No document changes are made until the whole plane graph is valid.
export function resolveOffsetPlanes(document){
 const planes=new Map((document.references || []).filter(r=>r.type==='plane').map(r=>[r.id,r]));
 const resolved=new Map(),visiting=new Set();
 function visit(id){
  if(resolved.has(id))return resolved.get(id);
  const plane=planes.get(id);if(!plane)throw new Error('Missing parent plane: '+id);
  if(visiting.has(id))throw new Error('Reference planes cannot depend on each other in a cycle');
  visiting.add(id);
  let result={...plane};
  if(plane.baseReferenceId || plane.support){
   const parent=plane.support?plane.support.descriptor:visit(plane.baseReferenceId),offset=Number(plane.offset),n=parent.normal || {x:0,y:1,z:0},length=Math.hypot(n.x,n.y,n.z);
   if(!Number.isFinite(offset)||!(length>0))throw new Error('Invalid reference plane offset or normal');
   result.normal={x:n.x/length,y:n.y/length,z:n.z/length};
   result.origin=Object.fromEntries(['x','y','z'].map(axis=>[axis,(parent.origin?.[axis] || 0)+result.normal[axis]*offset]));
  }
  visiting.delete(id);resolved.set(id,result);return result;
 }
 try{for(const id of planes.keys())visit(id);}catch(error){return {ok:false,issues:[{severity:'error',code:'reference-plane-dependency',message:error.message}]};}
 for(const [id,result] of resolved){Object.assign(planes.get(id),result);const geometry=(document.referenceGeometry || []).find(r=>r.id===id);if(geometry)Object.assign(geometry,{origin:result.origin,normal:result.normal,offset:result.offset,baseReferenceId:result.baseReferenceId,name:result.name});}
 for(const sketch of document.sketches || []){
  const plane=resolved.get(sketch.referenceId);if((!plane?.baseReferenceId&&!plane?.support) || sketch.support)continue;
  sketch.frame=frameFromPlane(plane.origin,plane.normal,sketch.frame?.xAxis);sketch.frameSpace='local';
 }
 return {ok:true,issues:[]};
}

// Resolve the face-supported ancestry for the sketch currently being rebuilt.
// Later history faces need not exist yet.
export function resolveOffsetSketch(sketch,references,resolveFace){
 const planes=new Map((references || []).map(r=>[r.id,r])),visiting=new Set();
 function visit(id){
  const plane=planes.get(id);if(!plane)throw new Error('Missing parent plane: '+id);
  if(visiting.has(id))throw new Error('Reference plane dependency cycle');visiting.add(id);
  let base=plane;
  if(plane.support){const face=resolveFace(plane.support);if(!face||face.descriptor?.surface!=='plane')throw new Error('Reference plane support face is unavailable');base={origin:face.descriptor.origin,normal:face.descriptor.normal};}
  else if(plane.baseReferenceId)base=visit(plane.baseReferenceId);
  const offset=plane.support||plane.baseReferenceId?Number(plane.offset || 0):0,n=base.normal,length=Math.hypot(n.x,n.y,n.z);
  if(!Number.isFinite(offset)||!(length>0))throw new Error('Invalid reference plane');
  const normal={x:n.x/length,y:n.y/length,z:n.z/length};
  visiting.delete(id);return {normal,origin:Object.fromEntries(['x','y','z'].map(k=>[k,base.origin[k]+normal[k]*offset]))};
 }
 const plane=planes.get(sketch.referenceId);if(!plane || (!plane.support&&!plane.baseReferenceId) || sketch.support)return sketch;
 const result=visit(plane.id);return {...sketch,frame:frameFromPlane(result.origin,result.normal,sketch.frame?.xAxis),frameSpace:'local'};
}
export function offsetPlaneOwners(referenceId,references,seen=new Set()){
 if(seen.has(referenceId))return [];seen.add(referenceId);
 const plane=(references || []).find(r=>r.id===referenceId);if(!plane)return [];
 return [...(plane.support?.ownerFeatureId?[plane.support.ownerFeatureId]:[]),...(plane.baseReferenceId?offsetPlaneOwners(plane.baseReferenceId,references,seen):[])];
}

// Continuous gear ratios act on angle increments from the saved zero pose.
// They prescribe kinematics; they do not position shafts or simulate contact.
import {rotationOf} from './cad_mate_model.js';
export function addGearRelation(study, driverId, followerId, options={}) {
  const relation={id:crypto.randomUUID(),driverId,followerId,driverTeeth:options.driverTeeth??20,followerTeeth:options.followerTeeth??40,
    mesh:options.mesh??'external',driverAxis:options.driverAxis??{x:0,y:1,z:0},followerAxis:options.followerAxis??{x:0,y:1,z:0}};
  (study.gearRelations||=[]).push(relation);return relation;
}
export function gearMotionState(study,components,time){
  const fail=(code,id)=>({ok:false,issues:[{code,relationId:id}]});
  const nodes=new Map(),rates=new Map(),queue=[];
  const axisFor=(id,axis)=>{
    const length=Math.hypot(axis?.x,axis?.y,axis?.z);
    if(!components.some(c=>c.id===id)||!Number.isFinite(length)||length<1e-9)throw new Error('invalid-motion-axis-or-component');
    const normalized={x:axis.x/length,y:axis.y/length,z:axis.z/length};
    if(nodes.has(id)){
      const old=nodes.get(id).axis;
      if(Math.hypot(old.x-normalized.x,old.y-normalized.y,old.z-normalized.z)>1e-8)throw new Error('conflicting-motion-axes');
    }else nodes.set(id,{axis:normalized,edges:[]});
  };
  try{
    for(const motor of study.motors||[]){
      if(motor.type!=='rotary'||!Number.isFinite(motor.rpm)||rates.has(motor.componentId))return fail('invalid-motor',motor.id);
      axisFor(motor.componentId,motor.axis||{x:0,y:1,z:0});rates.set(motor.componentId,motor.rpm);queue.push(motor.componentId);
    }
    for(const relation of study.gearRelations||[]){
      const {driverId:a,followerId:b,driverTeeth:za,followerTeeth:zb,mesh}=relation;
      if(a===b||![za,zb].every(z=>Number.isSafeInteger(z)&&z>0)||!['external','internal'].includes(mesh))return fail('invalid-gear-relation',relation.id);
      axisFor(a,relation.driverAxis);axisFor(b,relation.followerAxis);
      const ratio=(mesh==='external'?-1:1)*za/zb;
      nodes.get(a).edges.push({id:b,ratio});nodes.get(b).edges.push({id:a,ratio:1/ratio});
    }
    for(let i=0;i<queue.length;i++){
      const id=queue[i],rpm=rates.get(id);
      for(const edge of nodes.get(id).edges){
        const next=rpm*edge.ratio;
        if(!Number.isFinite(next))return fail('non-finite-gear-speed',edge.id);
        if(rates.has(edge.id)){
          if(Math.abs(rates.get(edge.id)-next)>1e-8*Math.max(1,Math.abs(next),Math.abs(rates.get(edge.id))))return fail('conflicting-gear-motion',edge.id);
        }else{rates.set(edge.id,next);queue.push(edge.id);}
      }
    }
    if(rates.size!==nodes.size)return fail('undriven-gear-relation');
    const motions=[];
    study.baseRotations ||= {};
    for(const [id,rpm] of rates){
      const comp=components.find(c=>c.id===id),angle=rpm*6*time;
      if(comp.grounded||!Number.isFinite(angle))return fail(comp.grounded?'grounded-motion-component':'invalid-motion-angle',id);
      const motor=(study.motors||[]).find(m=>m.componentId===id);
      const base=Object.hasOwn(study.baseRotations,id)?study.baseRotations[id]:motor?.baseRotation||rotationOf(comp.transform);
      if(!Array.isArray(base)||base.length!==3||!base.every(row=>Array.isArray(row)&&row.length===3&&row.every(Number.isFinite)))return fail('invalid-motion-baseline',id);
      Object.defineProperty(study.baseRotations,id,{value:base,enumerable:true,writable:true,configurable:true});
      if(motor)motor.baseRotation=base;
      motions.push({componentId:id,axis:nodes.get(id).axis,angleDeg:angle,rpm,baseRotation:base});
    }
    return {ok:true,motions};
  }catch(error){return fail(error.message);}
}

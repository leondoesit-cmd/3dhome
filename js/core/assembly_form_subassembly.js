import {solveAssemblyMates} from '../cad_mate_solver.js';
import {descriptorToParent,flattenAssembly} from './assembly_structure.js';
import {rotationOf} from '../cad_mate_model.js';

const failure=(code,detail)=>({ok:false,issues:[{code,...detail}]});
const idsOf=mate=>['a','b','c'].map(side=>mate[side]?.componentId).filter(id=>id!==undefined);
const poseMap=assembly=>new Map(flattenAssembly(assembly).map(leaf=>[leaf.component.id,leaf.placement]));
const samePoses=(before,after)=>before.size===after.size&&[...before].every(([id,pose])=>{
 const other=after.get(id);return other&&['origin','x','y','z'].every(key=>['x','y','z'].every(axis=>Math.abs(pose[key][axis]-other[key][axis])<1e-8));
});
function liftReference(reference,child,groupId){
 reference.componentId=groupId;
 if(reference.kind==='body')return;
 reference.persistentId=child.id+'/'+reference.persistentId;
 for(const key of ['frame','descriptor'])if(reference[key])reference[key]=descriptorToParent(reference[key],child);
 for(const key of ['sourceFace','sourceEdge'])if(reference.descriptor?.[key]){
  reference.descriptor[key]={...reference.descriptor[key],persistentId:child.id+'/'+reference.descriptor[key].persistentId};
 }
 reference.frameSpace='component';delete reference.signature;
}

/** Form an existing rigid selection as a nested occurrence, without changing any leaf's world pose.
 * The identity parent frame preserves recipes and authored child transforms. Native trials are
 * disposable; publication and Undo happen only after internal rigidity and parent solve pass.
 */
export function formSubassembly(assembly,selectedIds,fields,beforeCommit){
 const selected=new Set((selectedIds||[]).map(String)),children=(assembly?.components||[]).filter(c=>selected.has(String(c.id)));
 if(children.length<2||children.length!==selected.size)return failure('invalid-subassembly-selection');
 if(children.some(c=>c.componentPattern) || (assembly.componentPatterns || []).some(p=>selected.has(String(p.seedId)) || selected.has(String(p.carrierId))))return failure('unsupported-subassembly-component-pattern');
 if(fields?.id===undefined||fields.id===null||fields.id===''||!fields.key||!String(fields.name||'').trim()
  ||assembly.components.some(c=>String(c.id)===String(fields.id)))return failure('invalid-subassembly-identity');
 const ids=new Set(children.map(c=>c.id)),before=poseMap(assembly),trial=structuredClone(assembly),picked=trial.components.filter(c=>ids.has(c.id)),byId=new Map(picked.map(c=>[c.id,c]));
 for(const study of trial.motionStudies||[]){
  if((study.motors||[]).some(m=>ids.has(m.componentId))||(study.gearRelations||[]).some(r=>ids.has(r.driverId)||ids.has(r.followerId)))return failure('unsupported-subassembly-motion-target');
  for(const pose of study.baseRotations?.__assemblyPoses||[])if(ids.has(pose.id)){
   const current=byId.get(pose.id).transform,prior=pose.transform;
   if(['x','y','z'].some(k=>Math.abs(current[k]-prior[k])>1e-8)||rotationOf(current).flat().some((v,i)=>Math.abs(v-rotationOf(prior).flat()[i])>1e-8))return failure('unsupported-subassembly-motion-baseline');
  }
 }
 const originalSolve=solveAssemblyMates(structuredClone(assembly));if(!originalSolve.ok)return originalSolve;
 const internal=[],external=[];
 for(const mate of trial.topologyMates||[]){
  const refs=idsOf(mate),inside=refs.filter(id=>ids.has(id));
  if(inside.length===refs.length&&inside.length){internal.push(mate);continue;}
  if(inside.length){
   if(['rackpinion','screw','gear','belt','rotationlimit'].includes(mate.type))return failure('unsupported-subassembly-mechanical-reference',{mate:mate.id});
   for(const side of ['a','b','c'])if(ids.has(mate[side]?.componentId))liftReference(mate[side],byId.get(mate[side].componentId),fields.id);
   if(mate.type==='lock')delete mate.relativePose;
  }
  external.push(mate);
 }
 const internalLegacy=[],externalLegacy=[];
 for(const mate of trial.mates||[]){const a=ids.has(mate.a),b=ids.has(mate.b);if(a&&b)internalLegacy.push(mate);else if(a||b)return failure('unsupported-subassembly-legacy-reference',{mate:mate.id});else externalLegacy.push(mate);}
 const asm={key:fields.key,name:String(fields.name).trim(),components:picked,mates:internalLegacy,topologyMates:internal};
 if((trial.motionStudies||[]).some(study=>(study.motors||[]).some(motor=>internal.some(m=>m.id===motor.mateId))))return failure('unsupported-subassembly-internal-motor');
 // An ungrounded rigid selection gets a local anchor only for its rigidity test.
 const rigidTrial=structuredClone(asm);if(!rigidTrial.components.some(c=>c.grounded))rigidTrial.components[0].grounded=true;
 const rigidSolve=solveAssemblyMates(rigidTrial);
 const connected=new Set(internal.filter(m=>!m.suppressed).flatMap(idsOf).concat(internalLegacy.flatMap(m=>[m.a,m.b])));
 if(!rigidSolve.ok||rigidSolve.degreesOfFreedom!==0||picked.some(c=>!connected.has(c.id))||!samePoses(poseMap(asm),poseMap(rigidTrial)))return failure('subassembly-selection-not-rigid');
 const component={id:fields.id,kind:'assembly',assemblyKey:fields.key,name:asm.name,description:fields.description||'',asm,visible:true,grounded:picked.some(c=>c.grounded),transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}};
 for(const study of trial.motionStudies||[])if(study.baseRotations?.__assemblyPoses){
  study.baseRotations.__assemblyPoses=study.baseRotations.__assemblyPoses.filter(pose=>!ids.has(pose.id));
  study.baseRotations.__assemblyPoses.push({id:fields.id,transform:structuredClone(component.transform)});
 }
 const first=trial.components.findIndex(c=>ids.has(c.id));trial.components=trial.components.filter(c=>!ids.has(c.id));trial.components.splice(first,0,component);trial.topologyMates=external;trial.mates=externalLegacy;
 for(const view of trial.explodedViews||[])for(const step of view.steps||[])step.components=(step.components||[]).map(target=>{
  const path=Array.isArray(target)?target.map(String):String(target).split('/');
  return selected.has(path[0])?[String(fields.id),...path].join('/'):target;
 });
 const result=solveAssemblyMates(trial);if(!result.ok)return result;
 if(result.degreesOfFreedom!==originalSolve.degreesOfFreedom||!samePoses(before,poseMap(trial)))return failure('subassembly-changes-assembly-motion');
 beforeCommit?.();assembly.components=trial.components;assembly.topologyMates=trial.topologyMates;assembly.mates=trial.mates;
 if(trial.explodedViews)assembly.explodedViews=trial.explodedViews;
 if(trial.motionStudies)assembly.motionStudies=trial.motionStudies;
 return {...result,component};
}

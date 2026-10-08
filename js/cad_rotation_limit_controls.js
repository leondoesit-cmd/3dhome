import {solveAssemblyMates} from './cad_mate_solver.js';
import {rotationLimitMateSpec} from './cad_rotation_limit_mate.js';
import {rebindTopologyMate} from './core/topology_mate_rebind.js';

const cloneTrial=assembly=>({...assembly,components:(assembly.components||[]).map(component=>({
  ...component,transform:structuredClone(component.transform||{}),
})),mates:structuredClone(assembly.mates||[]),topologyMates:structuredClone(assembly.topologyMates||[])});
const invalid=id=>({ok:false,issues:[{code:'invalid-rotation-limit-spec',mate:id}]});
const publishPoses=(assembly,trial)=>trial.components.forEach((component,index)=>{assembly.components[index].transform=component.transform;});
const specOf=mate=>rotationLimitMateSpec(mate.angleMin,mate.angleMax,mate.reverse ?? false,mate.driveAngle ?? null);

export function addRotationLimitMate(assembly,mate,beforeCommit) {
  if(!assembly || mate?.type!=='rotationlimit' || mate.id===undefined || mate.id===null || mate.id===''
    || assembly.topologyMates?.some(item=>item.id===mate.id))return invalid(mate?.id);
  const spec=specOf(mate);if(!spec)return invalid(mate.id);
  const trial=cloneTrial(assembly),candidate={...structuredClone(mate),...spec};
  delete candidate.driveAngle;trial.topologyMates.push(candidate);
  let result=solveAssemblyMates(trial);if(!result.ok)return result;
  if(Object.hasOwn(spec,'driveAngle')){
    candidate.driveAngle=spec.driveAngle;result=solveAssemblyMates(trial);if(!result.ok)return result;
  }
  beforeCommit?.();publishPoses(assembly,trial);
  (assembly.topologyMates ||= []).push(candidate);
  return {...result,mate:candidate};
}

export function setRotationLimitMateSettings(assembly,mateId,patch,beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(mate?.type!=='rotationlimit' || !patch || Object.keys(patch).some(key=>!['angleMin','angleMax','reverse','driveAngle'].includes(key)))return invalid(mateId);
  const proposed={...mate,...patch},spec=specOf(proposed);if(!spec)return invalid(mateId);
  const trial=cloneTrial(assembly),changed=trial.topologyMates.find(item=>item.id===mateId);
  if(!changed.rotationMarkerA || !changed.rotationMarkerB){
    const captured=solveAssemblyMates(trial);if(!captured.ok)return captured;
  }
  Object.assign(changed,spec);if(!Object.hasOwn(spec,'driveAngle'))delete changed.driveAngle;
  const result=solveAssemblyMates(trial);if(!result.ok)return result;
  beforeCommit?.();publishPoses(assembly,trial);
  for(const key of ['angleMin','angleMax','reverse','driveAngle','rotationMarkerA','rotationMarkerB']){
    if(Object.hasOwn(changed,key))mate[key]=changed[key];else delete mate[key];
  }
  return result;
}

export function setRotationLimitMateDrive(assembly,mateId,angle,beforeCommit) {
  return setRotationLimitMateSettings(assembly,mateId,{driveAngle:angle},beforeCommit);
}

export function setRotationLimitMateReferences(assembly,mateId,first,second,beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(mate?.type!=='rotationlimit')return invalid(mateId);
  const trial=cloneTrial(assembly),changed=trial.topologyMates.find(item=>item.id===mateId);
  try{rebindTopologyMate(changed,first,second);}catch{return invalid(mateId);}
  const result=solveAssemblyMates(trial);if(!result.ok)return result;
  beforeCommit?.();publishPoses(assembly,trial);
  for(const key of ['a','b','rotationMarkerA','rotationMarkerB'])mate[key]=changed[key];
  return result;
}

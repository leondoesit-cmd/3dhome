import {solveAssemblyMates} from './cad_mate_solver.js';
import {rackPinionMateSpec} from './cad_rack_pinion_mate.js';
import {rebindTopologyMate} from './core/topology_mate_rebind.js';

const cloneTrial=assembly=>({...assembly,components:(assembly.components||[]).map(component=>({
  ...component,transform:structuredClone(component.transform||{}),
})),mates:structuredClone(assembly.mates||[]),topologyMates:structuredClone(assembly.topologyMates||[])});
const publishPoses=(assembly,trial)=>trial.components.forEach((component,index)=>{assembly.components[index].transform=component.transform;});
const invalid=id=>({ok:false,issues:[{code:'invalid-rack-pinion-spec',mate:id}]});

// Capture the zero at the authored pose before applying an explicit drive.
// Failed solves never publish diagnostic subset poses or an undo entry.
export function addRackPinionMate(assembly,mate,beforeCommit) {
  if(!assembly || mate?.type!=='rackpinion' || mate.id===undefined || mate.id===null || mate.id===''
    || assembly.topologyMates?.some(item=>item.id===mate.id))return invalid(mate?.id);
  const spec=rackPinionMateSpec(mate.pitchRadius,mate.reverse ?? false,mate.driveTurns ?? null);
  if(!spec)return invalid(mate.id);
  const trial=cloneTrial(assembly),candidate={...structuredClone(mate),...spec};
  delete candidate.driveTurns;
  trial.topologyMates.push(candidate);
  let result=solveAssemblyMates(trial);
  if(!result.ok)return result;
  if(Object.hasOwn(spec,'driveTurns')){
    candidate.driveTurns=spec.driveTurns;
    result=solveAssemblyMates(trial);
    if(!result.ok)return result;
  }
  beforeCommit?.();
  publishPoses(assembly,trial);
  (assembly.topologyMates ||= []).push(candidate);
  return {...result,mate:candidate};
}

export function setRackPinionMateSettings(assembly,mateId,patch,beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(mate?.type!=='rackpinion' || !patch || Object.keys(patch).some(key=>!['pitchRadius','reverse','driveTurns'].includes(key)))return invalid(mateId);
  const proposed={...mate,...patch};
  const spec=rackPinionMateSpec(proposed.pitchRadius,proposed.reverse ?? false,proposed.driveTurns ?? null);
  if(!spec)return invalid(mateId);
  const trial=cloneTrial(assembly),changed=trial.topologyMates.find(item=>item.id===mateId);
  if(!Number.isFinite(changed.rackTravel0) || !Number.isFinite(changed.pinionRoll0)){
    const captured=solveAssemblyMates(trial);if(!captured.ok)return captured;
  }
  Object.assign(changed,spec);
  if(!Object.hasOwn(spec,'driveTurns'))delete changed.driveTurns;
  const result=solveAssemblyMates(trial);
  if(!result.ok)return result;
  beforeCommit?.();
  publishPoses(assembly,trial);
  for(const key of ['pitchRadius','reverse','driveTurns','pinionRoll0','rackTravel0']){
    if(Object.hasOwn(changed,key))mate[key]=changed[key];else delete mate[key];
  }
  return result;
}

export function setRackPinionMateDrive(assembly,mateId,turns,beforeCommit) {
  return setRackPinionMateSettings(assembly,mateId,{driveTurns:turns},beforeCommit);
}

export function setRackPinionMateReferences(assembly,mateId,first,second,beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(mate?.type!=='rackpinion')return invalid(mateId);
  const trial=cloneTrial(assembly),changed=trial.topologyMates.find(item=>item.id===mateId);
  try{rebindTopologyMate(changed,first,second);}catch{return invalid(mateId);}
  const result=solveAssemblyMates(trial);
  if(!result.ok)return result;
  beforeCommit?.();publishPoses(assembly,trial);
  for(const key of ['a','b','pinionRoll0','rackTravel0'])mate[key]=changed[key];
  return result;
}

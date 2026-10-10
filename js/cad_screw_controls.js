// Changing thread direction preserves the authored helical zero and winding.
// Set it at the intended home pose before adding a motor or requesting travel.
import {solveAssemblyMates} from './cad_mate_solver.js';

// Undirected concentric axes keep legacy orientation unless explicitly chosen.
// A failed direction change must not publish the solver's diagnostic pose.
export function setConcentricAxisDirection(assembly,mateId,opposed,beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(mate?.type!=='concentric' || opposed!==null && typeof opposed!=='boolean')
    return {ok:false,issues:[{code:'invalid-concentric-axis-direction',mate:mateId}]};
  const trial={...assembly,components:(assembly.components || []).map(component=>({...component,transform:structuredClone(component.transform || {})})),
    mates:structuredClone(assembly.mates || []),topologyMates:structuredClone(assembly.topologyMates)},changed=trial.topologyMates.find(item=>item.id===mateId);
  if(opposed===null)delete changed.axisOpposed;else changed.axisOpposed=opposed;
  const result=solveAssemblyMates(trial);
  if(!result.ok)return result;
  beforeCommit?.();
  trial.components.forEach((component,index)=>{assembly.components[index].transform=component.transform;});
  if(opposed===null)delete mate.axisOpposed;else mate.axisOpposed=opposed;
  return result;
}

export function setScrewMateHandedness(mate, handedness) {
  if (mate?.type !== 'screw' || !['rh', 'lh'].includes(handedness)) return false;
  mate.handedness = handedness;
  return true;
}

// The solver diagnoses contradictory mates by solving their consistent subset.
// A requested screw drive must never publish that diagnostic pose to the model.
export function setScrewMateDrive(assembly, mateId, turns, beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(mate?.type!=='screw' || !mate.coupledMotion)
    return {ok:false,issues:[{code:'missing-coupled-screw-mate',mate:mateId}]};
  if(turns!==null && !Number.isFinite(turns))
    return {ok:false,issues:[{code:'invalid-screw-drive',mate:mateId}]};
  const trial={...assembly,components:(assembly.components||[]).map(component=>({
    ...component,transform:structuredClone(component.transform||{}),
  })),mates:structuredClone(assembly.mates||[]),topologyMates:structuredClone(assembly.topologyMates)};
  const driven=trial.topologyMates.find(item=>item.id===mateId);
  // Capture/migrate an uncaptured joint at its saved pose, before assigning
  // the new requested turn; otherwise the requested motion becomes its zero.
  if(driven.coupledAxialBasis!=='component-origin'
    || !Number.isFinite(driven.coupledAxial0) || !Number.isFinite(driven.coupledPhase0)){
    const captured=solveAssemblyMates(trial);
    if(!captured.ok)return captured;
  }
  if(turns===null)delete driven.driveTurns;else driven.driveTurns=turns;
  const result=solveAssemblyMates(trial);
  if(!result.ok)return result;
  beforeCommit?.();
  trial.components.forEach((component,index)=>{assembly.components[index].transform=component.transform;});
  for(const key of ['driveTurns','coupledAxial0','coupledPhase0','coupledAxialBasis']){
    if(Object.hasOwn(driven,key))mate[key]=driven[key];else delete mate[key];
  }
  return result;
}

export function setScrewMateCoupledMotion(assembly, mateId, coupled, beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(mate?.type!=='screw' || typeof coupled!=='boolean')
    return {ok:false,issues:[{code:'invalid-screw-mode',mate:mateId}]};
  const trial={...assembly,components:(assembly.components||[]).map(component=>({
    ...component,transform:structuredClone(component.transform||{}),
  })),mates:structuredClone(assembly.mates||[]),topologyMates:structuredClone(assembly.topologyMates)};
  const changed=trial.topologyMates.find(item=>item.id===mateId);
  changed.coupledMotion=coupled;
  for(const key of ['coupledAxial0','coupledPhase0','coupledAxialBasis','driveTurns'])delete changed[key];
  const result=solveAssemblyMates(trial);
  if(!result.ok)return result;
  beforeCommit?.();
  trial.components.forEach((component,index)=>{assembly.components[index].transform=component.transform;});
  for(const key of ['coupledMotion','driveTurns','coupledAxial0','coupledPhase0','coupledAxialBasis']){
    if(Object.hasOwn(changed,key))mate[key]=changed[key];else delete mate[key];
  }
  return result;
}

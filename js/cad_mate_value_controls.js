import {createMateTrial,publishTrialPoses} from './core/assembly_context.js';
import {solveAssemblyMates} from './cad_mate_solver.js';

// Scalar Angle/Distance editing must not publish a failed diagnostic subset.
export function setTopologyMateValue(assembly,mateId,value,beforeCommit) {
  const mate=assembly?.topologyMates?.find(item=>item.id===mateId);
  if(!['angle','distance'].includes(mate?.type) || !Number.isFinite(value)
    || mate.type==='angle'&&(value<0 || value>180))return {ok:false,issues:[{code:'invalid-mate-value',mate:mateId}]};
  if(value===mate.value)return {ok:true,unchanged:true};
  const trial=createMateTrial(assembly);
  trial.topologyMates.find(item=>item.id===mateId).value=value;
  const result=solveAssemblyMates(trial);if(!result.ok)return result;
  beforeCommit?.();
  // The accepted native solve can capture legacy mechanical zero fields on
  // other mates too. Publish them with the poses, retaining row identities.
  trial.topologyMates.forEach((changed,index)=>{Object.assign(assembly.topologyMates[index],changed);});
  publishTrialPoses(assembly,trial);
  return result;
}

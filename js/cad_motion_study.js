// Motion Study Timeline & Motor Simulation for Assemblies.

import {solveAssemblyMates} from "./cad_mate_solver.js";
import { axisAngleMatrix, mul, setRotation } from "./cad_mate_model.js";

import {gearMotionState} from "./cad_gear_motion.js";
export {addGearRelation} from "./cad_gear_motion.js";

export function createMotionStudy(assembly, name = "MotionStudy1") {
  if (!assembly.motionStudies) assembly.motionStudies = [];
  const ms = {
    id: "ms_" + crypto.randomUUID(),
    name,
    duration: 10, // seconds
    motors: [],
  };
  assembly.motionStudies.push(ms);
  return ms;
}

export function addRotaryMotor(motionStudy, componentId, rpm = 60, axis = { x: 0, y: 1, z: 0 }) {
  const motor = {
    id: "motor_" + crypto.randomUUID(),
    type: "rotary",
    componentId,
    rpm,
    axis,
  };
  motionStudy.motors.push(motor);
  return motor;
}

export function evaluateMotionStudy(assembly, motionStudyId, timeInSeconds) {
  const original=(assembly?.motionStudies||[]).find(m=>m.id===motionStudyId);
  if(!original)return {ok:false,issues:[{code:'missing-motion-study'}]};
  if(!Number.isFinite(timeInSeconds))return {ok:false,issues:[{code:'invalid-motion-time'}]};
  // Solve on a copy so failed mates never publish a partially moved assembly.
  const trial={...assembly,components:(assembly.components||[]).map(c=>({...c,transform:structuredClone(c.transform||{})})),mates:structuredClone(assembly.mates||[]),topologyMates:structuredClone(assembly.topologyMates||[])};
  const ms=structuredClone(original),driven=new Set();
  const motion=gearMotionState(ms,trial.components,timeInSeconds);
  if(!motion.ok)return motion;
  for(const item of motion.motions){
    const comp=trial.components.find(c=>c.id===item.componentId);driven.add(comp.id);
    setRotation(comp.transform,mul(axisAngleMatrix(item.axis,(item.angleDeg%360)*Math.PI/180),item.baseRotation));
  }
  const unsupported=(trial.mates||[]).find(m=>!['alignX','alignY','alignZ','distanceX'].includes(m.type));
  if(unsupported)return {ok:false,issues:[{code:'unsupported-motion-mate',mate:unsupported.id}]};
  const result=solveAssemblyMates(trial,{fixedComponentIds:[...driven]});
  if(!result.ok)return result;
  trial.components.forEach((c,i)=>{assembly.components[i].transform=c.transform;});
  ms.motors.forEach((m,i)=>{original.motors[i].baseRotation=m.baseRotation;});
  original.baseRotations=ms.baseRotations;original.time=timeInSeconds;
  return {...result,motions:motion.motions};
}

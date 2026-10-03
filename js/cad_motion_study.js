// Motion Study Timeline & Motor Simulation for Assemblies.

import {solveAssemblyMates} from "./cad_mate_solver.js";
import { axisAngleMatrix, mul, setRotation } from "./cad_mate_model.js";

import {gearMotionState} from "./cad_gear_motion.js";
import {linearMotionState} from "./cad_linear_motion.js";
export {addLinearMotor} from "./cad_linear_motion.js";
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

export function addScrewMotor(motionStudy, mateId, rpm = 60) {
  const motor = { id: "motor_" + crypto.randomUUID(), type: "screw", mateId, rpm };
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
  // The saved face-centroid screw zero must be migrated at the saved pose,
  // before the motor assigns its first requested turn. Otherwise that first
  // increment becomes the new zero and disappears from the motion.
  if(ms.motors.some(m=>m.type==='screw') && trial.topologyMates.some(m=>m.type==='screw'
    && m.coupledMotion && m.coupledAxialBasis!=='component-origin')){
    const migrated=solveAssemblyMates(trial);
    if(!migrated.ok)return migrated;
  }
  const rotary={...ms,motors:ms.motors.filter(m=>m.type==='rotary')};
  const motion=gearMotionState(rotary,trial.components,timeInSeconds);
  if(!motion.ok)return motion;
  const linear=linearMotionState(ms,trial.components,timeInSeconds);
  if(!linear.ok)return linear;
  const screwMotions=[];
  for(const motor of ms.motors.filter(m=>m.type==='screw')){
    const mate=trial.topologyMates.find(m=>m.id===motor.mateId&&m.type==='screw'&&m.coupledMotion);
    if(!mate)return {ok:false,issues:[{code:'missing-coupled-screw-mate',mate:motor.mateId}]};
    if(!Number.isFinite(motor.rpm))return {ok:false,issues:[{code:'invalid-screw-speed',mate:motor.mateId}]};
    const base=Number.isFinite(motor.baseTurns)?motor.baseTurns:(Number.isFinite(mate.driveTurns)?mate.driveTurns:0);
    mate.driveTurns=base+motor.rpm*timeInSeconds/60;
    screwMotions.push({mateId:mate.id,turns:mate.driveTurns,rpm:motor.rpm,baseTurns:base});
  }
  if(screwMotions.length && (motion.motions.length || linear.motions.length))
    return {ok:false,issues:[{code:'mixed-screw-motion-motors'}]};
  if(linear.motions.some(item=>motion.motions.some(rot=>rot.componentId===item.componentId)))return {ok:false,issues:[{code:'conflicting-motion-motors'}]};
  for(const item of motion.motions){
    const comp=trial.components.find(c=>c.id===item.componentId);driven.add(comp.id);
    setRotation(comp.transform,mul(axisAngleMatrix(item.axis,(item.angleDeg%360)*Math.PI/180),item.baseRotation));
  }
  for(const item of linear.motions){
    const comp=trial.components.find(c=>c.id===item.componentId);driven.add(comp.id);
    Object.assign(comp.transform,item.position);
  }
  const unsupported=(trial.mates||[]).find(m=>!['alignX','alignY','alignZ','distanceX'].includes(m.type));
  if(unsupported)return {ok:false,issues:[{code:'unsupported-motion-mate',mate:unsupported.id}]};
  let result;
  if(screwMotions.length){
    // A linkage has several pose branches. Advance a helical motor in small
    // turn increments so a seek from closed to open follows the same branch
    // as playback, including across complete revolutions of the shaft.
    const prior=Number.isFinite(original.time)?original.time:0;
    const largest=Math.max(...screwMotions.map(m=>Math.abs(m.rpm*(timeInSeconds-prior)/60)));
    const steps=Math.max(1,Math.ceil(largest/0.25));
    for(let step=1;step<=steps;step++){
      const at=prior+(timeInSeconds-prior)*step/steps;
      for(const item of screwMotions){
        trial.topologyMates.find(m=>m.id===item.mateId).driveTurns=item.baseTurns+item.rpm*at/60;
      }
      result=solveAssemblyMates(trial);
      if(!result.ok)return result;
    }
  }else result=solveAssemblyMates(trial,{fixedComponentIds:[...driven]});
  if(!result.ok)return result;
  trial.components.forEach((c,i)=>{assembly.components[i].transform=c.transform;});
  // Persist a successful migration on the real document as well as its trial;
  // later timeline seeks must use the same axial zero.
  for(const item of screwMotions){
    const source=assembly.topologyMates.find(m=>m.id===item.mateId);
    const settled=trial.topologyMates.find(m=>m.id===item.mateId);
    if(source && settled?.coupledAxialBasis==='component-origin'){
      source.coupledAxialBasis=settled.coupledAxialBasis;
      source.coupledAxial0=settled.coupledAxial0;
      source.coupledPhase0=settled.coupledPhase0;
    }
  }
  ms.motors.forEach((m,i)=>{if(m.baseRotation)original.motors[i].baseRotation=m.baseRotation;if(m.basePosition)original.motors[i].basePosition=m.basePosition;});
  screwMotions.forEach(m=>{const motor=original.motors.find(item=>item.type==='screw'&&item.mateId===m.mateId);if(motor)motor.baseTurns=m.baseTurns;});
  original.baseRotations=rotary.baseRotations;original.time=timeInSeconds;
  return {...result,motions:[...motion.motions,...linear.motions,...screwMotions]};
}

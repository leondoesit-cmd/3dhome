// Motion Study Timeline & Motor Simulation for Assemblies.

import {solveAssemblyMates} from "./cad_mate_solver.js";
import { axisAngleMatrix, mul, setRotation, apply } from "./cad_mate_model.js";

import {gearMotionState} from "./cad_gear_motion.js";
import {linearMotionState} from "./cad_linear_motion.js";
import {prepareBeltMotorTurns} from './cad_belt_motion.js';
export {addLinearMotor} from "./cad_linear_motion.js";
export {addGearRelation} from "./cad_gear_motion.js";

// A study starts from a whole assembly pose. The motor's own base rotation is
// insufficient: an unconstrained wrist can inherit the pose left by a prior
// study even when that prior timeline is sought back to zero. Keep this inside
// baseRotations so the existing Reset zero and gear-phase reset also clear it.
const ASSEMBLY_POSES = '__assemblyPoses';
const playbackCursors = new WeakMap();
const poseStamp = components => JSON.stringify((components || []).map(c => [c.id,c.transform]));
const studyStamp = (assembly,study) => JSON.stringify([
  assembly.mates || [],assembly.topologyMates || [],study.motors || [],study.gearRelations || [],study.baseRotations || {},
]);
const snapshotPoses = components => (components || []).map(component => ({
  id: component.id, transform: structuredClone(component.transform || {}),
}));
function restoreStudyPose(study, components) {
  study.baseRotations ||= {};
  study.baseRotations[ASSEMBLY_POSES] ||= snapshotPoses(components);
  const baseline = new Map(study.baseRotations[ASSEMBLY_POSES].map(item => [item.id, item.transform]));
  for (const component of components) {
    if (baseline.has(component.id)) component.transform = structuredClone(baseline.get(component.id));
  }
}

export function createMotionStudy(assembly, name = "MotionStudy1") {
  if (!assembly.motionStudies) assembly.motionStudies = [];
  const ms = {
    id: "ms_" + crypto.randomUUID(),
    name,
    duration: 10, // seconds
    motors: [],
    baseRotations: { [ASSEMBLY_POSES]: snapshotPoses(assembly.components) },
  };
  assembly.motionStudies.push(ms);
  return ms;
}

export function addRotaryMotor(motionStudy, componentId, rpm = 60, axis = { x: 0, y: 1, z: 0 }, pivot) {
  const motor = {
    id: "motor_" + crypto.randomUUID(),
    type: "rotary",
    componentId,
    rpm,
    axis,
    ...(pivot !== undefined ? { pivot: { ...pivot } } : {}),
  };
  motionStudy.motors.push(motor);
  return motor;
}

export function addScrewMotor(motionStudy, mateId, rpm = 60) {
  const motor = { id: "motor_" + crypto.randomUUID(), type: "screw", mateId, rpm };
  motionStudy.motors.push(motor);
  return motor;
}

export function addRackPinionMotor(motionStudy,mateId,rpm=60) {
  const motor={id:"motor_"+crypto.randomUUID(),type:"rackpinion",mateId,rpm};
  motionStudy.motors.push(motor);return motor;
}

export function evaluateMotionStudy(assembly, motionStudyId, timeInSeconds, options = {}) {
  const original=(assembly?.motionStudies||[]).find(m=>m.id===motionStudyId);
  if(!original)return {ok:false,issues:[{code:'missing-motion-study'}]};
  if(!Number.isFinite(timeInSeconds))return {ok:false,issues:[{code:'invalid-motion-time'}]};
  // Solve on a copy so failed mates never publish a partially moved assembly.
  const requestedIncremental=options.incremental===true;
  const prior=playbackCursors.get(assembly);
  const resume=requestedIncremental && prior?.studyId===motionStudyId && prior?.study===original
    && original.time===prior.time && timeInSeconds>prior.time
    && prior.pose===poseStamp(assembly.components) && prior.graph===studyStamp(assembly,original);
  const trial={...assembly,components:(assembly.components||[]).map(c=>({...c,transform:structuredClone(c.transform||{})})),mates:structuredClone(assembly.mates||[]),topologyMates:structuredClone(assembly.topologyMates||[])};
  const ms=structuredClone(original),driven=new Set();
  if(!resume)restoreStudyPose(ms,trial.components);
  if(trial.topologyMates.some(m=>m.type==='belt' && !Number.isFinite(m.rollA0))){
    const captured=solveAssemblyMates(trial);if(!captured.ok)return captured;
  }
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
  const beltMotion=prepareBeltMotorTurns(trial,ms,motion.motions);
  if(!beltMotion.ok)return beltMotion;
  const linear=linearMotionState(ms,trial.components,timeInSeconds);
  if(!linear.ok)return linear;
  if(ms.motors.some(m=>m.type==='rackpinion') && trial.topologyMates.some(m=>m.type==='rackpinion'
    && (!Number.isFinite(m.pinionRoll0) || !Number.isFinite(m.rackTravel0)))){
    const captured=solveAssemblyMates(trial);if(!captured.ok)return captured;
  }
  const screwMotions=[];
  for(const motor of ms.motors.filter(m=>m.type==='screw' || m.type==='rackpinion')){
    const mate=trial.topologyMates.find(m=>m.id===motor.mateId && (motor.type==='screw'?m.type==='screw'&&m.coupledMotion:m.type==='rackpinion'));
    if(!mate)return {ok:false,issues:[{code:motor.type==='rackpinion'?'missing-rack-pinion-mate':'missing-coupled-screw-mate',mate:motor.mateId}]};
    if(!Number.isFinite(motor.rpm))return {ok:false,issues:[{code:motor.type==='rackpinion'?'invalid-rack-pinion-speed':'invalid-screw-speed',mate:motor.mateId}]};
    const base=Number.isFinite(motor.baseTurns)?motor.baseTurns:(Number.isFinite(mate.driveTurns)?mate.driveTurns:0);
    mate.driveTurns=base+motor.rpm*timeInSeconds/60;
    screwMotions.push({mateId:mate.id,mateType:motor.type,turns:mate.driveTurns,rpm:motor.rpm,baseTurns:base});
  }
  if(screwMotions.length && (motion.motions.length || linear.motions.length))
    return {ok:false,issues:[{code:'mixed-screw-motion-motors'}]};
  if(linear.motions.some(item=>motion.motions.some(rot=>rot.componentId===item.componentId)))return {ok:false,issues:[{code:'conflicting-motion-motors'}]};
  const placeRotary = motions => {for(const item of motions){
    const comp=trial.components.find(c=>c.id===item.componentId);driven.add(comp.id);
    const rotation=mul(axisAngleMatrix(item.axis,(item.angleDeg%360)*Math.PI/180),item.baseRotation);
    const motor=ms.motors.find(m=>m.type==='rotary'&&m.componentId===comp.id);
    if(motor?.pivot !== undefined){
      if(!['x','y','z'].every(key=>Number.isFinite(motor.pivot?.[key])))
        return {ok:false,issues:[{code:'invalid-motion-pivot',motorId:motor.id}]};
      motor.basePosition ||= {x:comp.transform.x||0,y:comp.transform.y||0,z:comp.transform.z||0};
      if(!['x','y','z'].every(key=>Number.isFinite(motor.basePosition[key])))
        return {ok:false,issues:[{code:'invalid-motion-baseline',motorId:motor.id}]};
      // Keep the chosen local point fixed in world space. A hinge can lie far
      // from the document origin; rotating orientation alone would unseat it.
      const before=apply(item.baseRotation,motor.pivot),after=apply(rotation,motor.pivot);
      for(const key of ['x','y','z'])comp.transform[key]=motor.basePosition[key]+before[key]-after[key];
    }
    setRotation(comp.transform,rotation);
  }};
  for(const item of linear.motions){
    const comp=trial.components.find(c=>c.id===item.componentId);driven.add(comp.id);
    Object.assign(comp.transform,item.position);
  }
  const unsupported=(trial.mates||[]).find(m=>!['alignX','alignY','alignZ','distanceX'].includes(m.type));
  if(unsupported)return {ok:false,issues:[{code:'unsupported-motion-mate',mate:unsupported.id}]};
  let result;
  const rates=motion.motions.map(item=>Math.abs(item.rpm)*6);
  const stepped=resume && rates.length && !screwMotions.length && !linear.motions.length
    && !trial.topologyMates.some(m=>m.type==='belt');
  let motionSubsteps=1;
  if(stepped){
    motionSubsteps=Math.max(1,Math.ceil(Math.max(...rates)*(timeInSeconds-prior.time)/5));
    for(let step=1;step<=motionSubsteps;step++){
      const at=prior.time+(timeInSeconds-prior.time)*step/motionSubsteps;
      const current=step===motionSubsteps?motion:gearMotionState(rotary,trial.components,at);
      if(!current.ok)return current;
      const placed=placeRotary(current.motions);
      if(placed?.ok===false)return placed;
      result=solveAssemblyMates(trial,{fixedComponentIds:[...driven]});
      if(!result.ok)return result;
    }
  }else if(screwMotions.length){
    // Random seeks restore the saved home pose. A validated forward cursor
    // retains the last solved pose, so walk only its remaining time span;
    // restarting at zero from that moved pose can strand the helical solver.
    const start=resume?prior.time:0;
    const largest=Math.max(...screwMotions.map(m=>Math.abs(m.rpm*(timeInSeconds-start)/60)));
    const steps=Math.max(resume?1:0,Math.ceil(largest/0.25));
    for(let step=resume?1:0;step<=steps;step++){
      const at=steps?start+(timeInSeconds-start)*step/steps:start;
      for(const item of screwMotions){
        trial.topologyMates.find(m=>m.id===item.mateId).driveTurns=item.baseTurns+item.rpm*at/60;
      }
      result=solveAssemblyMates(trial);
      if(!result.ok)return result;
    }
  }else{
    const placed=placeRotary(motion.motions);
    if(placed?.ok===false)return placed;
    result=solveAssemblyMates(trial,{fixedComponentIds:[...driven]});
  }
  if(!result.ok)return result;
  trial.components.forEach((c,i)=>{assembly.components[i].transform=c.transform;});
  for(const mate of trial.topologyMates.filter(m=>m.type==='belt')){
    const target=assembly.topologyMates.find(m=>m.id===mate.id);
    for(const key of ['rollA0','rollB0','beltTurnA','beltLastRollA'])target[key]=mate[key];
  }
  if(Object.keys(ms.beltBaselines||{}).length)original.beltBaselines=ms.beltBaselines;
  // Persist a successful migration on the real document as well as its trial;
  // later timeline seeks must use the same axial zero.
  for(const item of screwMotions){
    const source=assembly.topologyMates.find(m=>m.id===item.mateId);
    const settled=trial.topologyMates.find(m=>m.id===item.mateId);
    if(source && settled?.type==='rackpinion'){source.pinionRoll0=settled.pinionRoll0;source.rackTravel0=settled.rackTravel0;}
    if(source && settled?.coupledAxialBasis==='component-origin'){
      source.coupledAxialBasis=settled.coupledAxialBasis;
      source.coupledAxial0=settled.coupledAxial0;
      source.coupledPhase0=settled.coupledPhase0;
    }
  }
  ms.motors.forEach((m,i)=>{if(m.baseRotation)original.motors[i].baseRotation=m.baseRotation;if(m.basePosition)original.motors[i].basePosition=m.basePosition;});
  screwMotions.forEach(m=>{const motor=original.motors.find(item=>item.type===m.mateType&&item.mateId===m.mateId);if(motor)motor.baseTurns=m.baseTurns;});
  original.baseRotations=rotary.baseRotations;original.time=timeInSeconds;
  if(requestedIncremental)playbackCursors.set(assembly,{studyId:motionStudyId,study:original,time:timeInSeconds,
    pose:poseStamp(assembly.components),graph:studyStamp(assembly,original)});
  else playbackCursors.delete(assembly);
  return {...result,motionSubsteps,motions:[...motion.motions,...linear.motions,...screwMotions]};
}

// Frozen pre-optimization paths: independent oracle for frame-by-frame regression tests.
const oldSource0 = `// Motion Study Timeline & Motor Simulation for Assemblies.

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
  assembly.mates || [],assembly.topologyMates || [],study.motors || [],study.gearRelations || [],study.baseRotations || {},study.nativeDriveConfiguration,
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

const nativeDriveField = type => type==='rotationlimit'?'driveAngle':
  (type==='screw'||type==='rackpinion'?'driveTurns':null);
// A pose alone cannot retain a temporarily seated clapper while the saved
// assembly is returned to its free configuration. Capture only explicit native
// actuator Drive settings; geometry, suppression and grounding remain live.
export function captureMotionStudyBaseline(assembly,study) {
  study.baseRotations ||= {};
  study.baseRotations[ASSEMBLY_POSES]=snapshotPoses(assembly.components);
  study.nativeDriveConfiguration=(assembly.topologyMates||[]).flatMap(mate=>{
    const field=nativeDriveField(mate.type);if(!field)return [];
    const value=mate[field]??null;
    return [{mateId:mate.id,type:mate.type,field,value,
      ...(value!==null&&!Number.isFinite(value)?{invalid:true}:{})}];
  });
  return study;
}
function restoreNativeDriveConfiguration(study,trial) {
  // Older studies retain their original live-mate behavior until the user
  // explicitly recaptures their baseline. Never infer a missing configuration.
  if(!Object.hasOwn(study,'nativeDriveConfiguration'))return null;
  const entries=study.nativeDriveConfiguration,seen=new Set();
  if(!Array.isArray(entries))return {ok:false,issues:[{code:'invalid-motion-drive-configuration'}]};
  for(const entry of entries){
    const mate=trial.topologyMates.find(m=>m.id===entry?.mateId);
    if(!mate||mate.type!==entry.type)return {ok:false,issues:[{code:'stale-motion-drive-configuration',mate:entry?.mateId}]};
    if(seen.has(mate)||entry.invalid||entry.field!==nativeDriveField(mate.type)
      ||!entry.field||(entry.value!==null&&!Number.isFinite(entry.value)))
      return {ok:false,issues:[{code:'invalid-motion-drive-configuration',mate:mate.id}]};
    seen.add(mate);
    if(entry.value===null)delete mate[entry.field];else mate[entry.field]=entry.value;
  }
  return null;
}

export function createMotionStudy(assembly, name = "MotionStudy1") {
  if (!assembly.motionStudies) assembly.motionStudies = [];
  const ms = {
    id: "ms_" + crypto.randomUUID(),
    name,
    duration: 10, // seconds
    motors: [],
    baseRotations: {},
  };
  captureMotionStudyBaseline(assembly,ms);
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
  const configuration=restoreNativeDriveConfiguration(ms,trial);
  if(configuration)return configuration;
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
`;
const oldSource1 = `// Snapshot poses and motion state only; component meshes and definitions stay shared.
export function motionPreviewDuration(study) {
  if(Number.isFinite(study?.previewDurationSeconds) && study.previewDurationSeconds>0)return study.previewDurationSeconds;
  const authoredTime=Number(study?.time);
  if(Number.isFinite(authoredTime)&&authoredTime>0)return authoredTime;
  const motor=study?.motors?.[0];
  const period=motor?.type==='linear'?Math.max(.1,Number(motor.duration)||1)*(motor.reciprocate?2:1)
    : Math.abs(Number(motor?.rpm))>0?60/Math.abs(motor.rpm):5;
  return period;
}

// Slow native solves should advance by a useful, bounded amount rather than
// spending a full solve on every tenth of a second. Coupled motors retain the
// evaluator's quarter-turn continuation limit; other motor pacing stays intact.
export function motionPlaybackStepSeconds(study) {
  const rates=(study?.motors || []).filter(motor=>['screw','rackpinion'].includes(motor.type))
    .map(motor=>Math.abs(Number(motor.rpm))).filter(rate=>Number.isFinite(rate)&&rate>0);
  return rates.length ? Math.min(.5,60/(4*Math.max(...rates))) : .1;
}
export function createMotionPlayback(assembly,studyId,options) {
  const study=assembly.motionStudies?.find(item=>item.id===studyId);
  if(!study)throw new Error('Choose a saved motion study');
  const snapshot=()=>({poses:assembly.components.map(c=>({id:c.id,transform:structuredClone(c.transform||{})})),
    studies:structuredClone(assembly.motionStudies),mates:structuredClone(assembly.topologyMates||[])});
  const entry=snapshot();
  // Explode offsets are presentation only. Physical motion uses the assembled
  // mechanism and closing the preview restores the exact opening presentation.
  const exploded=assembly.exploded,hadExploded=Object.hasOwn(assembly,'exploded'),offsets=[];
  const suspend=components=>{for(const component of components||[]){
    offsets.push({component,present:Object.hasOwn(component,'explodedOffset'),value:structuredClone(component.explodedOffset)});
    component.explodedOffset=null;suspend(component.asm?.components);
  }};
  suspend(assembly.components);assembly.exploded=false;
  const restorePresentation=()=>{
    for(const item of offsets){if(item.present)item.component.explodedOffset=structuredClone(item.value);else delete item.component.explodedOffset;}
    if(hadExploded)assembly.exploded=exploded;else delete assembly.exploded;
  };
  const restore=data=>{
    const poses=new Map(data.poses.map(item=>[item.id,item.transform]));
    for(const component of assembly.components)if(poses.has(component.id))component.transform=structuredClone(poses.get(component.id));
    assembly.motionStudies=structuredClone(data.studies);assembly.topologyMates=structuredClone(data.mates);
  };
  let time=Math.max(0,Number(study.time)||0),duration=motionPreviewDuration(study),frame=0,last=0,running=false,closed=false,busy=false;
  let lastMessage='Ready',lastResult;
  const notify=(message,result)=>{lastMessage=message;if(result)lastResult=result;options.onState?.({time,duration,running,busy,message,result});};
  const pause=()=>{running=false;if(frame)options.cancelFrame(frame);frame=0;last=0;notify('Paused');};
  const valid=()=>!closed && (!options.isCurrent || options.isCurrent());
  const seek=async value=>{
    if(!valid() || busy)return false;
    const next=Number(value);if(!Number.isFinite(next) || next<0 || next>duration)return false;
    busy=true;notify('Solving saved mates');
    try {
      const trial={...assembly,components:assembly.components.map(component=>({...component,transform:structuredClone(component.transform||{})})),
        motionStudies:structuredClone(assembly.motionStudies),topologyMates:structuredClone(assembly.topologyMates||[])};
      const result=await options.evaluate(trial,studyId,next,{incremental:running});
      if(!valid()){cancel();return false;}
      if(!result.ok){pause();notify('Motion stopped: '+[...(result.issues||[]),...(result.unsatisfied||[])].map(issue=>issue.code).join('; '),result);return false;}
      restore({poses:trial.components.map(c=>({id:c.id,transform:c.transform})),studies:trial.motionStudies,mates:trial.topologyMates});
      time=next;options.onPose?.(result);notify(running?'Playing':'Paused',result);return true;
    }catch(error){pause();notify('Motion stopped: '+String(error.message||error));return false;}
    finally{busy=false;notify(lastMessage,lastResult);}
  };
  const cancel=()=>{if(closed)return;pause();closed=true;restorePresentation();if(!options.isCurrent || options.isCurrent()){restore(entry);options.onPose?.();}options.onClose?.();notify('Original pose restored');};
  const tick=async now=>{
    frame=0;if(!valid()){cancel();return;}if(!running)return;
    if(!last){last=now;frame=options.requestFrame(tick);return;}
    if(now-last<100){frame=options.requestFrame(tick);return;}
    // Ten displayed poses per second at most; slow solves enqueue no stale
    // frames, while guarded coupled motion can use a whole quarter-turn step.
    const currentStudy=assembly.motionStudies.find(item=>item.id===studyId);
    const elapsed=Math.min(motionPlaybackStepSeconds(currentStudy),(now-last)/1000);last=now;
    if(!await seek(Math.min(duration,time+elapsed)))return;
    if(time>=duration){pause();notify('Complete');return;}
    if(running)frame=options.requestFrame(tick);
  };
  const play=async()=>{if(!valid()||busy)return;pause();if(time>=duration && !await seek(0))return;running=true;notify('Playing');frame=options.requestFrame(tick);};
  const reset=async()=>{pause();return seek(0);};
  const keep=()=>{
    if(!valid()||busy)return false;pause();const accepted=snapshot();
    restore(entry);restorePresentation();options.beforeCommit?.();restore(accepted);
    assembly.motionStudies.find(item=>item.id===studyId).previewDurationSeconds=duration;
    closed=true;options.onPose?.();options.onClose?.();notify('Current pose retained');return true;
  };
  const setDuration=value=>{const next=Number(value);if(!Number.isFinite(next)||next<=0||next>3600||busy)return false;pause();duration=next;notify('Duration changed');return true;};
  notify('Ready');
  return {play,pause,seek,reset,cancel,keep,setDuration,get state(){return {time,duration,running,busy,closed};}};
}
`;
const oldSource2 = `export function createMotionPlaybackExecutor(assembly,{createWorker=()=>new Worker(new URL('../motion_playback_worker.js',import.meta.url),{type:'module'})}={}) {
  const worker=createWorker(),pending=new Map();let sequence=0,disposed=false;
  const request=message=>new Promise((resolve,reject)=>{
    if(disposed){reject(new Error('Motion preview closed'));return;}
    const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({...message,id});
  });
  worker.onmessage=event=>{const message=event.data,job=pending.get(message.id);if(!job)return;pending.delete(message.id);
    if(message.error)job.reject(new Error(message.error));else job.resolve(message);};
  worker.onerror=event=>{disposed=true;worker.terminate();for(const job of pending.values())job.reject(new Error(event.message||'Motion worker failed'));pending.clear();};
  // Match saved assembly data: renderer/native runtime handles are not part
  // of the mate document and must not make postMessage uncloneable.
  const ready=request({type:'initialize',assembly:JSON.parse(JSON.stringify(assembly))});
  ready.catch(()=>{});
  return {
    async evaluate(target,studyId,time,options={}){
      await ready;
      const message=await request({type:'evaluate',studyId,time,incremental:!!options.incremental,
        poses:target.components.map(c=>({id:c.id,transform:c.transform})),studies:target.motionStudies,mates:target.topologyMates||[]});
      if(disposed)throw new Error('Motion preview closed');
      if(message.result?.ok){
        const poses=new Map(message.poses.map(item=>[item.id,item.transform]));
        for(const component of target.components)if(poses.has(component.id))component.transform=poses.get(component.id);
        target.motionStudies=message.studies;target.topologyMates=message.mates;
      }
      return message.result;
    },
    dispose(){if(disposed)return;disposed=true;worker.terminate();for(const job of pending.values())job.reject(new Error('Motion preview closed'));pending.clear();},
  };
}
`;
const oldSource3 = `import {evaluateMotionStudy} from './cad_motion_study.js';
let assembly=null;
self.onmessage=event=>{
  const message=event.data;
  try {
    if(message.type==='initialize'){assembly=message.assembly;self.postMessage({id:message.id,ok:true});return;}
    if(!assembly)throw new Error('Motion worker is not initialized');
    const poses=new Map(message.poses.map(item=>[item.id,item.transform]));
    for(const component of assembly.components)if(poses.has(component.id))component.transform=poses.get(component.id);
    // Preserve study identity for the evaluator's guarded forward-play cursor.
    // Changes still replace all data and invalidate its content fingerprints.
    const saved=new Map((assembly.motionStudies||[]).map(study=>[study.id,study]));
    assembly.motionStudies=message.studies.map(study=>{
      const target=saved.get(study.id);if(!target)return study;
      for(const key of Object.keys(target))if(!(key in study))delete target[key];
      return Object.assign(target,study);
    });
    assembly.topologyMates=message.mates;
    const result=evaluateMotionStudy(assembly,message.studyId,message.time,{incremental:!!message.incremental});
    self.postMessage({id:message.id,result,poses:assembly.components.map(c=>({id:c.id,transform:c.transform})),
      studies:assembly.motionStudies,mates:assembly.topologyMates});
  }catch(error){self.postMessage({id:message.id,error:String(error.message||error)});}
};
`;

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMotionStudy,addRotaryMotor,addRackPinionMotor} from '../js/cad_motion_study.js';
import {motionPlaybackStepSeconds} from '../js/core/motion_playback.js';
import {createMotionPlayback} from '../js/core/motion_playback.js';
import {createMotionPlaybackExecutor} from '../js/core/motion_playback_executor.js';
import {evaluateMotionStudy} from '../js/cad_motion_study.js';
import {Worker} from 'node:worker_threads';
import {captureAssemblySolverState,restoreAssemblySolverState} from '../js/core/assembly_solver_state.js';

const paths=['../js/cad_motion_study.js','../js/core/motion_playback.js','../js/core/motion_playback_executor.js','../js/motion_playback_worker.js'];
const oldSources=[oldSource0,oldSource1,oldSource2,oldSource3];
const metric={solver:0,clone:0,json:0,inSolver:0};
globalThis.__motionProfile=metric;
async function moduleSource(source,path,profile=false){
  source=source.replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_all,a,b,c)=>a+new URL(b,new URL(path,import.meta.url)).href+c);
  if(profile){
    source=source.replace('import {solveAssemblyMates}', 'import {solveAssemblyMates as nativeSolveAssemblyMates}');
    source+=`\nfunction solveAssemblyMates(...args){const m=globalThis.__motionProfile,start=performance.now();m.inSolver++;try{return nativeSolveAssemblyMates(...args);}finally{m.inSolver--;m.solver+=performance.now()-start;}}`;
  }
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
async function implementation(old){
  const sources=old?oldSources:paths.map(path=>readFileSync(new URL(path,import.meta.url),'utf8'));
  const evaluator=await moduleSource(sources[0],paths[0],true);
  const controller=await moduleSource(sources[1],paths[1]);
  const executor=await moduleSource(sources[2],paths[2]);
  return {evaluate:evaluator.evaluateMotionStudy,create:controller.createMotionPlayback,executor:executor.createMotionPlaybackExecutor,worker:sources[3].replace(/^import[^\n]*\n/gm,'')};
}
function fixtures(){
  const welder=JSON.parse(readFileSync(new URL('./fixtures/welder_arm_23_mate_motion.json',import.meta.url)));
  welder.topologyMates.find(m=>m.type==='gear').reverse=false;
  addRotaryMotor(createMotionStudy(welder,'Native yaw'),3389,12,{x:0,y:1,z:0},{x:0,y:0,z:0});
  const kant=JSON.parse(readFileSync(new URL('../artifacts/planchard/KT-assembly-motion-accepted-free-home-browser-2026-10-08.mforge',import.meta.url))).assemblies.find(a=>a.components.length===25);
  const arbor=JSON.parse(readFileSync(new URL('../artifacts/planchard/AP-assembly-free-home-browser-2026-10-08.mforge',import.meta.url))).assemblies[0];
  const rack=arbor.topologyMates.find(m=>m.type==='rackpinion');
  arbor.motionStudies=[];
  const press=createMotionStudy(arbor,'Full stroke');addRackPinionMotor(press,rack.id,-5.72957795130823);press.time=10;
  const synthetic={components:Array.from({length:50},(_,i)=>({id:i,grounded:i===0,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}})),topologyMates:[]};
  for(let i=1;i<=40;i++)for(const type of ['concentric','coincident']){
    const frame=type==='concentric'?{surface:'cylinder',origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},radius:1}:{surface:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}};
    synthetic.topologyMates.push({id:`${i}-${type}`,type,a:{componentId:0,frame,frameSpace:'component'},b:{componentId:i,frame,frameSpace:'component'}});
  }
  addRotaryMotor(createMotionStudy(synthetic,'50 components / 80 mates'),49,12,{x:0,y:1,z:0});
  return [{name:'Welder',assembly:welder,end:5},{name:'Kant Twist',assembly:kant,end:10},{name:'Arbor press',assembly:arbor,end:10},{name:'Synthetic 50/80',assembly:synthetic,end:5}];
}
function mockExecutor(impl,assembly,messages=[]){
  let worker;
  return impl.executor(assembly,{createWorker:()=>{
    const scope={postMessage:message=>queueMicrotask(()=>worker.onmessage({data:structuredClone(message)}))};
    new Function('self','evaluateMotionStudy','captureAssemblySolverState','restoreAssemblySolverState',impl.worker)(
      scope,impl.evaluate,captureAssemblySolverState,restoreAssemblySolverState);
    worker={postMessage:message=>{messages.push(message);queueMicrotask(()=>scope.onmessage({data:structuredClone(message)}));},terminate(){}};
    return worker;
  }});
}
function cpuMilliseconds(start){
  const {user,system}=process.threadCpuUsage(start);
  return (user+system)/1000;
}
function instrument(copies){
  const clone=globalThis.structuredClone,stringify=JSON.stringify;
  const wrap=(copy,key)=>(...args)=>{
    const start=performance.now();
    try{return copy(...args);}finally{if(!metric.inSolver){
      metric[key]+=performance.now()-start;
      // Freeze the actual inputs before subsequent frames mutate them. Recording
      // is outside the copy profile and is subtracted from the frame totals.
      const recordCpu=process.threadCpuUsage(),recordWall=performance.now();
      copies.push({copy,args:clone(args)});
      metric.recordWall+=performance.now()-recordWall;metric.recordCpu+=cpuMilliseconds(recordCpu);
    }}
  };
  globalThis.structuredClone=wrap(clone,'clone');
  JSON.stringify=wrap(stringify,'json');
  return ()=>{globalThis.structuredClone=clone;JSON.stringify=stringify;};
}
function replayCopies(copies){for(const {copy,args} of copies)copy(...args);}
function copyCpuSample(result){
  const start=process.threadCpuUsage();let repeats=0,elapsed;
  // Windows CPU counters advance in ~16 ms ticks. Time whole recorded frame
  // sequences for at least 250 ms of CPU, never individual sub-ms copy calls.
  do{replayCopies(result.copies);repeats++;elapsed=cpuMilliseconds(start);}while(elapsed<250);
  return elapsed/(repeats*result.frames.length);
}
function compareCopyCpu(baseline,optimized){
  const samples={before:[],after:[]};
  replayCopies(baseline.copies);replayCopies(optimized.copies);
  // Alternate order and take medians to reduce warmup, GC and clock-tick noise.
  for(let round=0;round<5;round++){
    const pair=[['before',baseline],['after',optimized]];
    if(round%2)pair.reverse();
    for(const [name,result] of pair)samples[name].push(copyCpuSample(result));
  }
  const median=values=>[...values].sort((a,b)=>a-b)[2];
  return {before:median(samples.before),after:median(samples.after),samples};
}
async function run(impl,fixture,workerPath=true){
  const assembly=structuredClone(fixture.assembly),study=assembly.motionStudies.at(-1),messages=[];
  const executor=workerPath?mockExecutor(impl,assembly,messages):null;
  // Let initialization finish outside the per-frame measurement.
  await new Promise(resolve=>setImmediate(resolve));
  const playback=impl.create(assembly,study.id,{evaluate:executor?executor.evaluate:impl.evaluate,requestFrame:()=>1,cancelFrame(){}});
  playback.setDuration(fixture.end);await playback.play();
  const frames=[],times=[],copies=[],totals={total:0,cpu:0,solver:0,clone:0,json:0,other:0};
  const step=motionPlaybackStepSeconds(study);
  for(let time=0;;time=Math.min(fixture.end,time+step)){
    Object.assign(metric,{solver:0,clone:0,json:0,recordWall:0,recordCpu:0});
    const undo=instrument(copies),start=performance.now(),startCpu=process.threadCpuUsage();let ok;
    try{ok=await playback.seek(time);}finally{undo();}
    const total=performance.now()-start-metric.recordWall;
    totals.cpu+=cpuMilliseconds(startCpu)-metric.recordCpu;
    assert.equal(ok,true,`${fixture.name} at ${time}`);
    totals.total+=total;for(const key of ['solver','clone','json'])totals[key]+=metric[key];
    frames.push(structuredClone({poses:assembly.components.map(c=>c.transform),studies:assembly.motionStudies,mates:assembly.topologyMates}));times.push(time);
    if(time===fixture.end)break;
  }
  totals.other=totals.total-totals.solver-totals.clone-totals.json;
  for(const key of Object.keys(totals))totals[key]/=frames.length;
  playback.cancel();executor?.dispose();
  return {frames,times,totals,messages,copies};
}
test('all playback frames match the frozen implementation exactly; report per-frame profile',async t=>{
  const before=await implementation(true),after=await implementation(false);
  for(const fixture of fixtures()){
    const baseline=await run(before,fixture),optimized=await run(after,fixture);
    assert.deepEqual(optimized.frames,baseline.frames,fixture.name);
    assert.deepEqual(optimized.times,baseline.times);
    assert.equal(optimized.messages.filter(message=>message.studies).length,1,'owned worker receives immutable graph once');
    for(const [name,result] of [['before',baseline],['after',optimized]])t.diagnostic(`${fixture.name} ${name}: ${result.frames.length} frames; ms/frame ${JSON.stringify(result.totals)}`);
    assert.ok(optimized.totals.cpu<baseline.totals.cpu*2+2,`${fixture.name}: total CPU cost stays within the regression guard`);
    const copyCpu=compareCopyCpu(baseline,optimized);
    t.diagnostic(`${fixture.name} copy CPU ms/frame (median of 5 batches >=250 ms CPU): ${JSON.stringify(copyCpu)}`);
    assert.ok(copyCpu.after<copyCpu.before*.8+.5,`${fixture.name}: copy cost falls with generous timing slack; CPU ${copyCpu.after} < ${copyCpu.before*.8+.5} ms/frame`);
  }
});

test('direct playback preserves deterministic seeks, reverse seeks, Reset and Keep',async()=>{
  const before=await implementation(true),after=await implementation(false);
  for(const fixture of fixtures()){
    const left=structuredClone(fixture.assembly),right=structuredClone(fixture.assembly);
    const studyId=left.motionStudies.at(-1).id;
    const make=(impl,assembly)=>impl.create(assembly,studyId,{evaluate:impl.evaluate,requestFrame:()=>1,cancelFrame(){}});
    const a=make(before,left),b=make(after,right);
    a.setDuration(fixture.end);b.setDuration(fixture.end);await a.play();await b.play();
    // Local preview deliberately does not use the worker's forward cursor.
    // Include forward, reverse and repeated frames, followed by reset/commit.
    for(const time of [0,.1,.2,.2,.1,.3,0]){
      assert.equal(await a.seek(time),true);assert.equal(await b.seek(time),true);
      assert.deepEqual(right,left,`${fixture.name} direct at ${time}`);
    }
    assert.equal(await a.reset(),true);assert.equal(await b.reset(),true);
    assert.equal(a.keep(),true);assert.equal(b.keep(),true);assert.deepEqual(right,left);
  }
});

function ownProperties(value,path='',out=[]){
  if(!value || typeof value!=='object')return out;
  for(const key of Reflect.ownKeys(value)){
    out.push(`${path}/${String(key)}`);ownProperties(value[key],`${path}/${String(key)}`,out);
  }
  return out;
}
function rollbackFixture(){
  const assembly={components:[
    {id:'rotor',transform:{rz:0},explodedOffset:{x:3,y:0,z:0},asm:{components:[{id:'nested',explodedOffset:undefined}]}},
    {id:'absent'}, {id:'undefined',transform:undefined,explodedOffset:undefined},
    {id:'null',transform:null,explodedOffset:null},
  ]};
  addRotaryMotor(createMotionStudy(assembly,'Rollback'),'rotor',12,{x:0,y:0,z:1});
  return assembly;
}
test('a failed or thrown solve pauses at the last good pose; cancel restores bytes and every own-property set',async()=>{
  for(const outcome of ['cancel','failed','throw'])for(const exploded of [false,true]){
    const assembly=rollbackFixture();if(exploded)assembly.exploded=true;
    const original=structuredClone(assembly),bytes=JSON.stringify(assembly),keys=ownProperties(assembly);let fail=false;
    const playback=createMotionPlayback(assembly,assembly.motionStudies[0].id,{
      evaluate:(trial,id,time,options)=>{
        if(!fail)return evaluateMotionStudy(trial,id,time,options);
        trial.components[0].transform.x=999;trial.motionStudies[0].motors[0].rpm=999;
        trial.topologyMates.push({id:'failed'});
        if(outcome==='throw')throw new Error('deliberate failed solve');
        return {ok:false,issues:[{code:'deliberate-failure'}]};
      },requestFrame:()=>1,cancelFrame(){},
    });
    assert.equal(await playback.seek(.1),true);
    if(outcome!=='cancel'){
      // A failed solve pauses at the last good pose; nothing it wrote is published.
      const good=structuredClone(assembly),goodBytes=JSON.stringify(assembly);
      fail=true;assert.equal(await playback.seek(.2),false);
      assert.deepEqual(assembly,good);assert.equal(JSON.stringify(assembly),goodBytes);
      assert.equal(playback.state.closed,false);assert.equal(playback.state.running,false);
      // The next solve starts from the document, not from the failed trial.
      fail=false;
      assert.equal(await playback.seek(.15),true);
      assert.equal(assembly.motionStudies[0].motors[0].rpm,12);
      assert.equal(assembly.topologyMates?.some(mate=>mate.id==='failed')??false,false);
    }
    playback.cancel();
    assert.deepEqual(assembly,original);assert.equal(JSON.stringify(assembly),bytes);assert.deepEqual(ownProperties(assembly),keys);
    assert.equal(playback.state.closed,true);
  }
});

test('cancellation while a solve is pending cannot publish a late pose or add absent presentation properties',async()=>{
  const assembly=rollbackFixture(),original=structuredClone(assembly);let finish;
  const playback=createMotionPlayback(assembly,assembly.motionStudies[0].id,{
    evaluate:(trial,id,time,options)=>new Promise(resolve=>{finish=()=>resolve(evaluateMotionStudy(trial,id,time,options));}),
    requestFrame:()=>1,cancelFrame(){},
  });
  const pending=playback.seek(.2);playback.cancel();finish();assert.equal(await pending,false);
  assert.deepEqual(assembly,original);assert.deepEqual(ownProperties(assembly),ownProperties(original));
});

test('owned worker graph revisions and generic in-place edits invalidate continuation',async()=>{
  const impl=await implementation(false),assembly=rollbackFixture();assembly.topologyMates=[];
  const executor=mockExecutor(impl,assembly),id=assembly.motionStudies[0].id;
  try{
    assert.equal((await executor.evaluate(assembly,id,0,{incremental:true,playbackRevision:0})).ok,true);
    assert.equal((await executor.evaluate(assembly,id,.1,{incremental:true,playbackRevision:0})).motionSubsteps,2);
    assembly.motionStudies[0].motors[0].rpm=24;
    assert.equal((await executor.evaluate(assembly,id,.2,{incremental:true,playbackRevision:1})).motionSubsteps,1);
    assembly.motionStudies[0].motors[0].rpm=12;
    assert.equal((await executor.evaluate(assembly,id,.3,{incremental:true})).motionSubsteps,1);
    assembly.motionStudies[0].motors[0].rpm=24;
    assert.equal((await executor.evaluate(assembly,id,.4,{incremental:true})).motionSubsteps,1);
  }finally{executor.dispose();}
});

test('worker state patches preserve own keys for prototype-like component IDs',async()=>{
  const impl=await implementation(false);
  const assembly={components:[{id:'__proto__',transform:{}}],topologyMates:[]};
  const study=createMotionStudy(assembly,'Special ID');addRotaryMotor(study,'__proto__',12);
  const expected=structuredClone(assembly),executor=mockExecutor(impl,assembly);
  try{
    for(const time of [0,.1]){
      assert.equal((await executor.evaluate(assembly,study.id,time,{incremental:true,playbackRevision:0})).ok,true);
      assert.equal(evaluateMotionStudy(expected,study.id,time,{incremental:true}).ok,true);
      assert.deepEqual(assembly,expected);
    }
  }finally{executor.dispose();}
});

test('real module worker exchanges cloneable payloads and preserves all frame state',async()=>{
  const assembly=fixtures().at(-1).assembly,expected=structuredClone(assembly);
  const id=assembly.motionStudies[0].id;
  const executor=createMotionPlaybackExecutor(assembly,{createWorker:()=>{
    const source=`import {parentPort} from 'node:worker_threads';
      globalThis.self={postMessage:message=>parentPort.postMessage(message)};
      const ready=import(${JSON.stringify(new URL('../js/motion_playback_worker.js',import.meta.url).href)});
      parentPort.on('message',message=>ready.then(()=>self.onmessage({data:message})));`;
    const native=new Worker(new URL('data:text/javascript,'+encodeURIComponent(source)));
    const adapter={postMessage:message=>native.postMessage(message),terminate:()=>native.terminate()};
    native.on('message',data=>adapter.onmessage({data}));native.on('error',error=>adapter.onerror(error));return adapter;
  }});
  try{
    for(const time of [0,.1,.2,0,.3]){
      assert.equal((await executor.evaluate(assembly,id,time,{incremental:true,playbackRevision:0})).ok,true);
      assert.equal(evaluateMotionStudy(expected,id,time,{incremental:true}).ok,true);
      assert.deepEqual(assembly,expected);
    }
  }finally{executor.dispose();}
});

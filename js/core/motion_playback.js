import {copyMotionStudy,copyMotionMates} from '../cad_motion_study.js';
import {captureAssemblySolverState,restoreAssemblySolverState,cloneAssemblySolverState} from './assembly_solver_state.js';

// Snapshot poses and motion state only; component meshes and definitions stay shared.
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
  const snapshot=()=>({solver:captureAssemblySolverState(assembly),studies:structuredClone(assembly.motionStudies)});
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
    restoreAssemblySolverState(assembly,data.solver);
    assembly.motionStudies=structuredClone(data.studies);
  };
  const trial={...cloneAssemblySolverState(assembly),
    motionStudies:structuredClone(assembly.motionStudies),topologyMates:structuredClone(assembly.topologyMates||[])};
  let publishedStudies=assembly.motionStudies,publishedMates=assembly.topologyMates,revision=0;
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
      // The preview owns this graph until it closes. A replacement document
      // graph invalidates the worker cursor; ordinary frames copy only poses
      // and the small records that the evaluator can write.
      // A failed solve may have written into the trial: resync it from the document.
      if(assembly.motionStudies!==publishedStudies || assembly.topologyMates!==publishedMates){
        trial.motionStudies=structuredClone(assembly.motionStudies);
        trial.topologyMates=structuredClone(assembly.topologyMates||[]);revision++;
      }
      const fresh=cloneAssemblySolverState(assembly);
      trial.components=fresh.components;
      if(Object.hasOwn(fresh,'mates'))trial.mates=fresh.mates;else delete trial.mates;
      const result=await options.evaluate(trial,studyId,next,{incremental:running,playbackRevision:revision,continuation:false});
      if(!valid()){cancel();return false;}
      if(!result.ok){publishedStudies=publishedMates=undefined;pause();notify('Motion stopped: '+[...(result.issues||[]),...(result.unsatisfied||[])].map(issue=>issue.code).join('; '),result);return false;}
      restoreAssemblySolverState(assembly,captureAssemblySolverState(trial));
      assembly.motionStudies=trial.motionStudies.map(copyMotionStudy);assembly.topologyMates=copyMotionMates(trial.topologyMates);
      publishedStudies=assembly.motionStudies;publishedMates=assembly.topologyMates;
      time=next;options.onPose?.(result);notify(running?'Playing':'Paused',result);return true;
    }catch(error){publishedStudies=publishedMates=undefined;pause();notify('Motion stopped: '+String(error.message||error));return false;}
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

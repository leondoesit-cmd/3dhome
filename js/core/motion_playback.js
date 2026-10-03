// Snapshot poses and motion state only; component meshes and definitions stay shared.
export function motionPreviewDuration(study) {
  if(Number.isFinite(study?.previewDurationSeconds) && study.previewDurationSeconds>0)return study.previewDurationSeconds;
  const motor=study?.motors?.[0];
  return motor?.type==='linear'?Math.max(.1,Number(motor.duration)||1)*(motor.reciprocate?2:1)
    : Math.abs(Number(motor?.rpm))>0?60/Math.abs(motor.rpm):5;
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
    // Ten solved poses per second at most; slow solves enqueue no stale frames.
    const elapsed=Math.min(.1,(now-last)/1000);last=now;
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

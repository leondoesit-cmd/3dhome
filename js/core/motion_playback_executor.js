export function createMotionPlaybackExecutor(assembly,{createWorker=()=>new Worker(new URL('../motion_playback_worker.js',import.meta.url),{type:'module'})}={}) {
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

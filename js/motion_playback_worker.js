import {evaluateMotionStudy} from './cad_motion_study.js';
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

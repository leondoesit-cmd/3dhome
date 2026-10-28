import {evaluateMotionStudy} from './cad_motion_study.js';
let assembly=null,revision=0;
// Snapshot only records the evaluator publishes. Nested frames, axes and saved
// pose matrices remain immutable; identity prunes them from the response diff.
const motionState=()=>({
  motionStudies:assembly.motionStudies.map(study=>({...study,
    motors:study.motors?.map(motor=>({...motor})),
    ...(study.baseRotations?{baseRotations:{...study.baseRotations}}:{}),
    ...(study.beltBaselines?{beltBaselines:{...study.beltBaselines}}:{}),
  })),topologyMates:assembly.topologyMates.map(mate=>({...mate})),
});
function changesBetween(before,after,path=[],changes=[]) {
  if(Object.is(before,after))return changes;
  if(before && after && typeof before==='object' && typeof after==='object'){
    for(const key of Object.keys(before))if(!Object.hasOwn(after,key))changes.push({path:[...path,key],remove:true});
    for(const key of Object.keys(after)){
      if(!Object.hasOwn(before,key))changes.push({path:[...path,key],value:after[key]});
      else changesBetween(before[key],after[key],[...path,key],changes);
    }
  }else changes.push({path,value:after});
  return changes;
}
self.onmessage=event=>{
  const message=event.data;
  try {
    if(message.type==='initialize'){assembly=message.assembly;self.postMessage({id:message.id,ok:true});return;}
    if(!assembly)throw new Error('Motion worker is not initialized');
    const poses=new Map(message.poses.map(item=>[item.id,item.transform]));
    for(const component of assembly.components)if(poses.has(component.id))component.transform=poses.get(component.id);
    // Generic executor callers may edit in place. Owned previews send the graph
    // once per revision, then only poses; their worker graph is private.
    if(message.studies){
      revision++;
      const saved=new Map((assembly.motionStudies||[]).map(study=>[study.id,study]));
      assembly.motionStudies=message.studies.map(study=>{
        const target=saved.get(study.id);if(!target)return study;
        for(const key of Object.keys(target))if(!(key in study))delete target[key];
        return Object.assign(target,study);
      });
      assembly.topologyMates=message.mates;
    }
    const before=message.owned?motionState():null;
    const result=evaluateMotionStudy(assembly,message.studyId,message.time,{incremental:!!message.incremental,
      ...(message.owned?{playbackRevision:revision}:{}),
    });
    self.postMessage({id:message.id,result,poses:assembly.components.map(c=>({id:c.id,transform:c.transform})),
      ...(message.owned?{changes:changesBetween(before,motionState())}:{studies:assembly.motionStudies,mates:assembly.topologyMates})});
  }catch(error){self.postMessage({id:message.id,error:String(error.message||error)});}
};

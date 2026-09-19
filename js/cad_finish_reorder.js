import {compileKernelFeatureTree} from './core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from './cad_feature_tree.js';
import {planFinishRemoval} from './core/finish_removal.js';
import {resolveFinishFace} from './core/finish_face_reference.js';
import {createTopologyRegistry,resolveTopologyReference} from './core/topology.js';
import {captureExactTopology} from './core/exact_topology_cache.js';

const bodyTypes=new Set(['extrude','revolve','sweep','loft','extrudeCut','revolveCut','sweepCut','hole','fillet','chamfer','shell','draft','dome','rib','thicken','moveBody','split','mirror']);
const consumesBody=f=>bodyTypes.has(f.type)&&f.params?.mergeResult!==false&&f.params?.operation!=='new-body';
function reconnect(feature,from,to){
 feature.inputs=feature.inputs.map(id=>id===from?to:id);
 feature.references.features=(feature.references.features||[]).map(ref=>typeof ref==='string'?(ref===from?to:ref):ref.id===from?{...ref,id:to}:ref);
 if(feature.params?.targetFeatureId===from)feature.params.targetFeatureId=to;
}
async function rebuild(document){
 const compiled=compileKernelFeatureTree(document);
 if(!compiled.ok)throw new Error(compiled.issues[0]?.message||'Invalid feature history');
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 if(!run.ok){const message=run.issues.find(i=>i.severity==='error')?.message||'Reordered model could not be rebuilt';releaseRegeneration(run);throw new Error(message);}
 return {compiled,run};
}
// Work only on a clone. A failed match or exact rebuild leaves the live document
// and its undo timeline untouched.
export async function reorderFinishFeature(source,historyId,targetIndex){
 const document=structuredClone(source),from=document.history.findIndex(h=>h.id===historyId);
 const entry=document.history[from],finish=document.features.find(f=>f.id===entry?.targetId);
 if(!finish||!['fillet','chamfer'].includes(finish.type)||finish.inputs?.length!==1)throw new Error('Select a single-body fillet or chamfer to move');
 if(document.rollbackIndex!=null)throw new Error('Release rollback to the end before moving a finish');
 const to=Math.max(0,Math.min(document.history.length-1,targetIndex));
 if(to<=from)throw new Error('Move this finish to a later history position');
 const originalInput=finish.inputs[0];
 const original=await rebuild(document);
 try{
  const topology=new Map([...original.run.results].map(([id,result])=>[id,result.topology||[]]));
  const removal=planFinishRemoval(document,finish,topology);
  if(!removal||removal.issues.length)throw new Error(removal?.issues[0]?.message||'The finish dependencies cannot be reconnected');
  removal.apply();
 }finally{releaseRegeneration(original.run);}
 document.history.splice(from,1);document.history.splice(to,0,entry);
 let head=originalInput;
 for(const h of document.history.slice(from,to)){
  const f=document.features.find(f=>f.id===h.targetId);
  if(f&&!f.suppressed&&consumesBody(f)&&f.inputs?.[0]===head)head=f.id;
 }
 if(head===originalInput)throw new Error('Choose a later operation on the same body');
 reconnect(finish,originalInput,head);
 document.rollbackIndex=to;
 const prefix=await rebuild(document);
 try{
  const body=prefix.run.results.get(head);if(!body?.shape)throw new Error('The destination body is unavailable');
  const registry=createTopologyRegistry(body.topology||[]);
  const oldToNew=new Map();
  finish.references.topology=(finish.references.topology||[]).map(ref=>{
   const match=finish.params.fullRound?resolveFinishFace(ref,body.topology):resolveTopologyReference({kind:ref.kind,descriptor:ref.descriptor},registry,{threshold:.05}).topology;
   if(!match)throw new Error('A selected finish edge is absent at the destination');
   oldToNew.set(ref.persistentId,match.persistentId);
   return {...structuredClone(match),ownerFeatureId:head,type:'topology-reference'};
  });
  for(const radius of finish.params.edgeRadii||[])if(oldToNew.has(radius.id))radius.id=oldToNew.get(radius.id);
  document.exactTopologyCache={...document.exactTopologyCache,...captureExactTopology(document,prefix.compiled.features,prefix.run)};
 }finally{releaseRegeneration(prefix.run);}
 document.rollbackIndex=null;
 for(const h of document.history.slice(to+1)){
  const f=document.features.find(f=>f.id===h.targetId);
  if(f&&consumesBody(f)&&f.inputs?.[0]===head)reconnect(f,head,finish.id);
 }
 const complete=await rebuild(document);
 try{document.exactTopologyCache=captureExactTopology(document,complete.compiled.features,complete.run);}
 finally{releaseRegeneration(complete.run);}
 document.revision=(Number(document.revision)||0)+1;
 return document;
}

import { regenerateFeatures } from '../cad_feature_tree.js';
import { deserializeBrep, hydrateSerializedBrepTopology, disposeBrep } from '../cad_kernel.js';

export function restoreCadWorkerWireResult(result) {
  for (const [,payload] of result?.results || []) {
    if (payload.meshData?.positions instanceof Float64Array) {
      payload.meshData.positions = Array.from(payload.meshData.positions);
    }
  }
  return result;
}

export function createCadWorkerClient(workerFactory,{idleMs=120000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let worker=null,nextId=0,idleTimer=null;const pending=new Map(),local=new Map(),listeners=new Set();
  const clearIdle=()=>{if(idleTimer!==null){clearTimer(idleTimer);idleTimer=null;}};
  function releaseIdle(){
    clearIdle();
    if(!worker || pending.size || local.size)return;
    const active=worker;
    idleTimer=setTimer(()=>{idleTimer=null;if(worker===active && !pending.size && !local.size){active.terminate();worker=null;}},idleMs);
    idleTimer?.unref?.();
  }
  const activity=()=>[...pending,...local].map(([id,job])=>({id,scope:job.scope,name:job.name,startedAt:job.startedAt,progress:job.progress}));
  // UI observers are not part of the worker protocol. An exception in a status
  // renderer must never prevent submission or settlement of an exact request.
  const observe=(callback,value)=>{try{callback?.(value);}catch(error){console.error('Exact CAD progress observer failed',error);}};
  const notify=()=>{releaseIdle();const state=activity();listeners.forEach(listener=>observe(listener,state));};
  function cancel(scope) {
    if(scope && ![...pending.values(),...local.values()].some(job=>job.scope===scope))return;
    if(!pending.size && !local.size){
      // A document-wide reset also releases an idle native runtime and its
      // previous document's body cache. Scoped cancellation leaves it warm.
      if(!scope && worker){clearIdle();worker.terminate();worker=null;}
      return;
    }
    clearIdle();worker?.terminate();worker=null;
    for(const job of pending.values()){job.cleanup?.();job.reject(new DOMException('Exact CAD computation cancelled','AbortError'));}
    pending.clear();
    local.clear();
    notify();
  }
  function ensureWorker() {
    clearIdle();
    if(worker)return worker;
    worker=workerFactory();
    const active=worker;
    worker.onmessage=event=>{
      if(worker!==active)return;
      const {id,result,error,progress}=event.data,job=pending.get(id);if(!job)return;
      if(progress){job.progress=progress;notify();observe(job.onProgress,progress);return;}
      pending.delete(id);job.cleanup?.();
      notify();
      if(error){const failure=new Error(error.message);failure.name=error.name;job.reject(failure);}
      else {
        try { job.resolve(restoreCadWorkerWireResult(result)); }
        catch(failure) { job.reject(failure); }
      }
    };
    worker.onerror=event=>{
      if(worker!==active)return;
      const failure=new Error(event.message || 'Exact CAD worker failed');clearIdle();worker?.terminate();worker=null;
      for(const job of pending.values()){job.cleanup?.();job.reject(failure);}pending.clear();notify();
    };
    worker.onmessageerror=()=>worker.onerror({message:'Exact CAD worker result could not be transferred'});
    return worker;
  }
  function request(request,{scope='rebuild',signal,onProgress}={}) {
    if(signal?.aborted)return Promise.reject(new DOMException('Exact CAD computation cancelled','AbortError'));
    return new Promise((resolve,reject)=>{
      const id=++nextId,abort=()=>cancel(scope);
      try {
        const target=ensureWorker();
        signal?.addEventListener('abort',abort,{once:true});
        pending.set(id,{resolve,reject,scope,onProgress,name:request.type || 'Exact model',startedAt:Date.now(),progress:null,cleanup:()=>signal?.removeEventListener('abort',abort)});
        notify();
        target.postMessage({id,request});
      }catch(error){pending.delete(id);notify();signal?.removeEventListener('abort',abort);reject(error);}
    });
  }
  function track(scope,name){
    const id=++nextId,job={scope,name,startedAt:Date.now(),progress:null};local.set(id,job);notify();
    return {active:()=>local.has(id),progress(value){job.progress=value;notify();},end(){local.delete(id);notify();}};
  }
  return {request,cancel,activity,track,subscribe(listener){listeners.add(listener);observe(listener,activity());return ()=>listeners.delete(listener);}};
}
let client;
// A viewport mesh and a cache's verification stamp are derived display data.
// The exact executor consumes feature recipes plus topology naming hints; do
// not duplicate large saved meshes/signature strings into every CAD worker.
export function cadWorkerDocument(source) {
  const document={...source};
  for(const key of ['meshData','exactMesh','topology','diagnostics','lastRebuild'])delete document[key];
  if(Array.isArray(source.parts))document.parts=source.parts.map(part=>{
    const recipe={...part};
    for(const key of ['meshData','exactMesh','topology','topologyCache','diagnostics'])delete recipe[key];
    return recipe;
  });
  if(source.exactTopologyCache)document.exactTopologyCache=Object.fromEntries(Object.entries(source.exactTopologyCache).map(([id,entry])=>[id,{topology:entry.topology}]));
  return document;
}
function browserClient() {
  if(!client)client=createCadWorkerClient(()=>new Worker(new URL('../cad_worker.js',import.meta.url),{type:'module',name:'ModelForge exact CAD'}));
  return client;
}
export function cadWorkerAvailable(){return typeof window!=='undefined' && typeof Worker==='function';}
export function cancelCadWorkerWork(scope){client?.cancel(scope);}
export function cadWorkerActivity(){return client?.activity() || [];}
export function subscribeCadWorkerActivity(listener){return browserClient().subscribe(listener);}
export function interferenceInCadWorker(components,options={}) {
  if(!cadWorkerAvailable())throw new Error('Exact interference needs a browser CAD worker');
  return browserClient().request({kind:'interference',components},{...options,scope:'interference'});
}
export function assemblyStepInCadWorker(components,options={}) {
  if(!cadWorkerAvailable())throw new Error('Assembly STEP export needs a browser CAD worker');
  return browserClient().request({kind:'assembly-step',components},{...options,scope:'assembly-step'});
}
export function assemblyPrintInCadWorker(components,settings,options={}) {
  if(!cadWorkerAvailable())throw new Error('Assembly print export needs a browser CAD worker');
  return browserClient().request({kind:'assembly-print',components,settings},{...options,scope:'assembly-print'});
}
export function partStepInCadWorker(document,name,options={}) {
  if(!cadWorkerAvailable())throw new Error('Part STEP export needs a browser CAD worker');
  return browserClient().request({kind:'part-step',canonical:document?.metadata?.authoringSystem==='parametric-v1',document:cadWorkerDocument(document),name,options:{parameterOverrides:options.parameterOverrides}},{...options,scope:'part-step'});
}
export function cutIntersectionInCadWorker(document,head,cut,options={}) {
  if(!cadWorkerAvailable())throw new Error('Exact cut preflight needs a browser CAD worker');
  return browserClient().request({kind:'cut-intersection',document:cadWorkerDocument(document),head,cut},{...options,scope:'cut-preflight'});
}
export function surfaceSectionsInCadWorker(document,sketch,edge,options={}) {
  if(!cadWorkerAvailable())throw new Error('Exact surface sections need a browser CAD worker');
  return browserClient().request({kind:'surface-sections',document:cadWorkerDocument(document),sketch,edge},{...options,scope:'surface-sections'});
}
export function topologyInCadWorker(document,head,options={}) {
  if(!cadWorkerAvailable())throw new Error('Exact face refresh needs a browser CAD worker');
  return browserClient().request({kind:'topology',document:cadWorkerDocument(document),head},{...options,scope:'topology-refresh'});
}
async function restore(payload,id) {
  if(payload.proof==='exact-native-mesh')return cadWorkerMeshResult(payload);
  if(!payload.bytes)return {...payload.metadata,topology:payload.topology};
  const body=Object.assign(await deserializeBrep(payload.bytes),payload.metadata);
  try {
    hydrateSerializedBrepTopology(body,payload.topology || [],{ownerFeatureId:id});
    if(payload.meshData){body.workerMeshData=payload.meshData;body.workerMeshData.topology=body.topology;}
    if(payload.massProperties)body.workerMassProperties=payload.massProperties;
    return body;
  }catch(error){disposeBrep(body);throw error;}
}
// Save publishes exact worker meshes and topology without loading another WASM
// kernel on the UI thread. This marker never substitutes for a native shape in
// export or geometric operations, which keep using the default restore route.
export function cadWorkerMeshResult(payload) {
  const result={...payload.metadata,topology:payload.topology || []};
  if(payload.proof!=='exact-native-mesh')return result;
  if(result.invalid || result.approximate || !payload.meshData?.positions?.length)throw new Error('The exact worker mesh proof is incomplete');
  result.verifiedSerializedExact=true;
  result.workerMeshData=payload.meshData;
  result.workerMeshData.topology=result.topology;
  if(payload.massProperties)result.workerMassProperties=payload.massProperties;
  return result;
}
export async function regenerateInCadWorker(document,options={}) {
  if(!cadWorkerAvailable())return regenerateFeatures(document,options);
  const data=await browserClient().request({kind:'regenerate',document:cadWorkerDocument(document),options:{parameterOverrides:options.parameterOverrides,rollbackId:options.rollbackId},head:options.requestedHead,massProperties:!!options.massProperties,meshOnly:options.restoreMode==='mesh',coalesceKey:options.coalesceKey},options);
  const results=new Map(),tracker=browserClient().track(options.scope || 'rebuild','Restoring exact geometry');
  const abort=()=>browserClient().cancel(options.scope || 'rebuild');
  options.signal?.addEventListener('abort',abort,{once:true});
  const assertCurrent=()=>{if(!tracker.active() || options.signal?.aborted)throw new DOMException('Exact CAD computation cancelled','AbortError');};
  try {
    for(const [id,payload] of data.results){
      assertCurrent();const progress={stage:'restore',featureId:id,name:document.features?.find(feature=>feature.id===id)?.name || id};tracker.progress(progress);options.onProgress?.(progress);
      results.set(id,options.restoreMode==='mesh'?cadWorkerMeshResult(payload):await restore(payload,id));assertCurrent();
    }
    return {...data,results,finalShape:results.get(data.finalId),resolvedExtrusions:new Map(data.resolvedExtrusions),boundaryUpdates:new Map(data.boundaryUpdates)};
  }catch(error){results.forEach(disposeBrep);throw error;}
  finally{options.signal?.removeEventListener('abort',abort);tracker.end();}
}
export async function finishInCadWorker(document,head,type,operation,options={}) {
  if(!cadWorkerAvailable())throw new Error('Exact finish computation needs a browser CAD worker');
  const result=await browserClient().request({kind:'finish',canonical:true,document:cadWorkerDocument(document),head,type,params:operation.params,amount:operation.amount,targets:operation.targets}, {...options,scope:'finish'});
  const tracker=browserClient().track('finish','Restoring '+type),abort=()=>browserClient().cancel('finish');
  options.signal?.addEventListener('abort',abort,{once:true});let body;
  try{
    const progress={stage:'restore',name:type};tracker.progress(progress);options.onProgress?.(progress);
    if(!tracker.active() || options.signal?.aborted)throw new DOMException('Exact CAD computation cancelled','AbortError');
    body=await restore(result.body,'preview:'+type);
    if(!tracker.active() || options.signal?.aborted){disposeBrep(body);throw new DOMException('Exact CAD computation cancelled','AbortError');}
    return body;
  }finally{options.signal?.removeEventListener('abort',abort);tracker.end();}
}

// Keep this entry free of static runtime imports. The exact module graph and
// WASM kernel load after the first request is acknowledged, so a slow startup
// is distinguishable from queued geometry work and can be cancelled.
export function cadWorkerWireResult(result) {
  if (!Array.isArray(result?.results)) return result;
  return { ...result, results: result.results.map(([id, payload]) => {
    const mesh = payload.meshData;
    if (!Array.isArray(mesh?.positions)) return [id, payload];
    // Only the wire representation is binary. Float64 preserves every native
    // coordinate; the client restores the public/saved plain-array format.
    return [id, { ...payload, meshData: { ...mesh, positions: Float64Array.from(mesh.positions) } }];
  }) };
}

export function cadWorkerTransferList(result) {
  // Finish previews may alias the executor's retained Shell cache. Leave those
  // buffers owned by the worker. Regeneration/export payloads are freshly
  // packed and can give their binary buffers to the client without a copy.
  if(result?.body)return [];
  const buffers=new Set();
  const add=value=>{
    const buffer=ArrayBuffer.isView(value)?value.buffer:value;
    if(buffer instanceof ArrayBuffer && buffer.byteLength)buffers.add(buffer);
  };
  add(result);add(result?.bytes);
  for(const [,payload] of result?.results || []){
    add(payload.bytes);
    for(const field of ['positions','normals','colors','subshapeMap'])add(payload.meshData?.[field]);
  }
  return [...buffers];
}

export function installCadWorkerBootstrap(scope,loadRuntime=()=>import('./core/cad_worker_runtime.js')) {
  let queue=Promise.resolve(),executorPromise=null,ready=false,compiledModule=null;
  const latestPreviews=new Map();
  function executor(progress,kernelModule) {
    if(!ready)progress({stage:'loading-runtime',name:'Exact CAD runtime'});
    if(!executorPromise){
      executorPromise=Promise.resolve().then(loadRuntime).then(module=>{
        const execute=module.createCadWorkerExecutor({kernelModule});ready=true;return execute;
      }).catch(error=>{executorPromise=null;ready=false;throw error;});
    }
    return executorPromise;
  }
  scope.onmessage=event=>{
    const {id,request,kernelModule}=event.data;
    if(kernelModule)compiledModule=kernelModule;
    const previewKey=request.coalesceKey;
    if(previewKey)latestPreviews.set(previewKey,id);
    const progress=value=>scope.postMessage({id,progress:value});
    progress({stage:'queued',name:request.kind==='interference'?'Exact interference':request.type || 'Exact model'});
    queue=queue.catch(()=>{}).then(async()=>{
      try {
        if(previewKey && latestPreviews.get(previewKey)!==id){
          scope.postMessage({id,error:{name:'AbortError',message:'Exact viewport preview superseded'}});return;
        }
        if(previewKey)latestPreviews.delete(previewKey);
        const execute=await executor(progress,compiledModule),result=cadWorkerWireResult(await execute(request,progress));
        scope.postMessage({id,result},cadWorkerTransferList(result));
      }catch(error){scope.postMessage({id,error:{message:String(error.message || error),name:error.name || 'Error'}});}
    });
    return queue;
  };
}

if(typeof self!=='undefined')installCadWorkerBootstrap(self);

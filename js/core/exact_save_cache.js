import {cadWorkerGeometryKeys} from './cad_worker_runtime.js';

// Keep a save-owned snapshot of worker-proven exact results. Never borrow a
// live native handle: another rebuild or document close may dispose it.
export function createExactSaveCache() {
  const records=new WeakMap();
  const signature=compiled=>JSON.stringify([...cadWorkerGeometryKeys(compiled.document,compiled.features)]);
  return {
    get(document,compiled) {
      const record=records.get(document);
      return compiled.ok && record?.signature===signature(compiled) ? structuredClone(record.run) : null;
    },
    put(document,compiled,run) {
      if(!compiled.ok || !run?.ok || !(run.results instanceof Map))return false;
      const results=new Map();
      for(const [id,result] of run.results){
        if(result.invalid || result.approximate || result.shape)return false;
        if(result.workerMeshData && result.verifiedSerializedExact!==true)return false;
        results.set(id,structuredClone(result));
      }
      if(![...results.values()].some(result=>result.verifiedSerializedExact===true && result.workerMeshData?.positions?.length))return false;
      const snapshot={ok:true,issues:structuredClone(run.issues || []),results,topologyBindings:structuredClone(run.topologyBindings || [])};
      records.set(document,{signature:signature(compiled),run:snapshot});
      return true;
    },
  };
}

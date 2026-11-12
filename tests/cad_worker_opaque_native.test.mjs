import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
// Set the Node glue's require/__dirname shims without constructing a kernel.
import 'opencascade.js/dist/node.js';
import {prepareCadKernelModule,deferSerializedBrep,disposeBrep,shapeToMeshData,shapeMassProperties,serializeBrep,exportStep,exportIges,booleanBrep,compoundBrep,loadCadKernel} from '../js/cad_kernel.js';
import {offsetFaceBoundary} from '../js/cad_face_offset.js';
import {regenerateInCadWorker,cancelCadWorkerWork} from '../js/core/cad_worker_client.js';

test('opaque worker BREP preserves synchronous face queries and exact native exports on demand',async t=>{
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');globalThis.window={};
  t.after(()=>{if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;});
  let fetches=0,instances=0,syncInstances=0,releaseInstance,startedInstance;
  const instantiating=new Promise(resolve=>{startedInstance=resolve;});
  const gate=new Promise(resolve=>{releaseInstance=resolve;});
  t.mock.method(globalThis,'fetch',async()=>{fetches++;return new Response(readFileSync(new URL('../assets/opencascade.full.wasm.gz',import.meta.url)));});
  t.mock.method(WebAssembly,'Instance',function(){syncInstances++;throw new RangeError('synchronous main-thread Instance forbidden');});
  const instantiate=WebAssembly.instantiate.bind(WebAssembly);
  t.mock.method(WebAssembly,'instantiate',async(module,imports)=>{
    assert.ok(module instanceof WebAssembly.Module);instances++;startedInstance();
    await gate;return instantiate(module,imports);
  });
  const module=await prepareCadKernelModule();assert.ok(module instanceof WebAssembly.Module);
  // Build the payload in another realm, as in the browser. The test's main
  // realm must not already have an initialized kernel masking a lazy-load bug.
  const runtime=new URL('../js/core/cad_worker_runtime.js',import.meta.url).href;
  const shim=new URL('../node_modules/opencascade.js/dist/node.js',import.meta.url).href;
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');
    import(workerData.shim).then(()=>import(workerData.runtime)).then(async({createCadWorkerExecutor})=>{
      globalThis.self={};
      globalThis.fetch=()=>{throw new Error('restarted worker must not download WASM');};
      WebAssembly.compile=()=>{throw new Error('restarted worker must not recompile WASM');};
      const instantiate=WebAssembly.instantiate.bind(WebAssembly);
      WebAssembly.instantiate=(module,imports)=>{
        if(!(module instanceof WebAssembly.Module))throw new Error('worker must instantiate compiled code');
        return instantiate(module,imports);
      };
      const result=await createCadWorkerExecutor({kernelModule:workerData.module,bodyStore:{async get(){},async put(){}}})({kind:'regenerate',document:{features:[{id:'box',type:'box',params:{w:2,h:3,d:4},inputs:[]}]},massProperties:true});
      parentPort.postMessage(result.results[0][1]);
    }).catch(error=>{throw error;});`,{eval:true,workerData:{runtime,shim,module}});
  t.after(()=>worker.terminate());
  const payload=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
  const premature=deferSerializedBrep(payload.bytes,payload.metadata,payload.topology);
  for(const query of [()=>premature.oc,()=>premature.subshapes,()=>premature.shape.IsNull()])
    assert.throws(query,/deferSerializedBrep.materialize:.*worker restore path must await loadCadKernel/);
  disposeBrep(premature);assert.equal(instances,0);assert.equal(syncInstances,0);
  const previousWorker=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  t.after(()=>{cancelCadWorkerWork();if(previousWorker)Object.defineProperty(globalThis,'Worker',previousWorker);else delete globalThis.Worker;});
  globalThis.Worker=class{
    postMessage({id,kernelModule}){
      assert.equal(kernelModule,module);
      queueMicrotask(()=>this.onmessage({data:{id,result:{ok:true,results:[['box',payload]],finalId:'box',resolvedExtrusions:[],boundaryUpdates:[]}}}));
    }
    terminate(){}
  };
  let resolved=false;
  const pending=regenerateInCadWorker({features:[{id:'box',type:'box'}]}).then(run=>{resolved=true;return run;});
  await instantiating;assert.equal(resolved,false);
  releaseInstance();const run=await pending,body=run.finalShape;
  assert.equal(body,run.results.get('box'));assert.ok(body.shape);assert.equal(instances,1);
  assert.equal(typeof Object.getOwnPropertyDescriptor(body,'oc').get,'function','BREP deserialization remains lazy after kernel initialization');
  assert.deepEqual(await serializeBrep(body),payload.bytes);
  assert.ok(Math.abs((await shapeMassProperties(body)).volume-24)<1e-7);
  assert.deepEqual((await shapeToMeshData(body)).positions,payload.meshData.positions);
  assert.equal(instances,1,'routine consumers reuse the initialized heap');
  const face=body.topology.find(item=>item.kind==='face' && item.descriptor.normal.z>.99);
  const frame={origin:face.descriptor.origin,xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}};
  try{
    const pendingKernel=loadCadKernel();
    const loops=offsetFaceBoundary(body,face,frame,0);
    assert.ok((await pendingKernel)===body.oc,'concurrent lazy and async loading must share one runtime');
    assert.equal(loops.length,1);assert.equal(loops[0].length,4);
    assert.equal(instances,1,'the first explicit native query only deserializes synchronously');
    assert.deepEqual(body.topology,payload.topology);
    assert.equal(body.shape.IsNull(),false);
    assert.ok((await exportStep(body)).byteLength>100);
    assert.ok((await exportIges(body)).byteLength>100);
    assert.equal(instances,1);assert.equal(syncInstances,0);assert.equal(fetches,1,'native compatibility never downloads another binary');
  }finally{disposeBrep(body);}
  const unused=deferSerializedBrep(payload.bytes,payload.metadata,payload.topology);
  disposeBrep(unused);assert.equal(instances,1,'disposing opaque bytes must not restore them');
  for(const operation of [async(a,b)=>booleanBrep('intersect',a,b),async(a,b)=>compoundBrep([a,b])]){
    const a=deferSerializedBrep(payload.bytes,payload.metadata,payload.topology),b=deferSerializedBrep(payload.bytes,payload.metadata,payload.topology);
    let result;
    try{result=await operation(a,b);assert.ok((await shapeMassProperties(result)).volume>=24-1e-7);assert.ok(a.oc);assert.ok(b.oc);}
    finally{disposeBrep(a);disposeBrep(b);disposeBrep(result);}
  }
  const malformed=deferSerializedBrep(payload.bytes,payload.metadata,payload.topology.slice(1));
  try{assert.throws(()=>malformed.subshapes,/transport map/);}
  finally{disposeBrep(malformed);}
});

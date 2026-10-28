import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
// The browser glue uses these Node-only shims when exercised in this realm.
import 'opencascade.js/dist/node.js';
import {createCadWorkerClient,regenerateInCadWorker,cancelCadWorkerWork} from '../js/core/cad_worker_client.js';
import {prepareCadKernelModule,instantiateCadKernelModule} from '../js/cad_kernel.js';
import {installCadWorkerBootstrap} from '../js/cad_worker.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const emptyWasm=Uint8Array.of(0,97,115,109,1,0,0,0);
function fixture(options={}){
  const workers=[],timers=new Map();let nextTimer=0;
  const client=createCadWorkerClient(()=>{
    const worker={messages:[],postMessage(message){this.messages.push(message);},terminate(){this.terminated=true;},emit(data){this.onmessage({data});}};
    workers.push(worker);return worker;
  },{setTimer(callback,delay){timers.set(++nextTimer,{callback,delay});return nextTimer;},clearTimer(id){timers.delete(id);},...options});
  return {client,workers,timers};
}

test('idle restart retains one page compilation, inflation and fetch without a standby worker',async t=>{
  let compiles=0,fetches=0,inflations=0;
  const compile=WebAssembly.compile.bind(WebAssembly),Inflate=DecompressionStream;
  t.mock.method(WebAssembly,'compile',bytes=>{compiles++;return compile(bytes);});
  t.mock.method(globalThis,'DecompressionStream',class extends Inflate{constructor(format){super(format);inflations++;}});
  t.mock.method(globalThis,'fetch',async url=>{
    assert.match(String(url),/assets\/opencascade\.full\.wasm\.gz$/);fetches++;
    return new Response(gzipSync(emptyWasm));
  });
  const f=fixture({loadModule:prepareCadKernelModule});
  assert.equal(f.workers.length,0);
  const first=f.client.request({kind:'regenerate'});
  const module=await prepareCadKernelModule();await tick();
  assert.equal(f.workers[0].messages[0].kernelModule,module);
  f.workers[0].emit({id:1,result:'first'});assert.equal(await first,'first');
  assert.equal([...f.timers.values()][0].delay,600000);
  [...f.timers.values()][0].callback();assert.equal(f.workers[0].terminated,true);
  assert.equal(f.workers.length,1,'idle expiry must not create a standby');
  const second=f.client.request({kind:'regenerate'});await tick();
  assert.equal(f.workers[1].messages[0].kernelModule,module);
  f.workers[1].emit({id:2,result:'second'});await second;
  const third=f.client.request({kind:'regenerate'});await tick();
  assert.equal(f.workers[1].messages[1].kernelModule,undefined,'send compiled code once per worker');
  f.workers[1].emit({id:3,result:'third'});await third;
  assert.deepEqual({compiles,fetches,inflations},{compiles:1,fetches:1,inflations:1});
  f.client.cancel();
});

test('cancelling startup rejects all queued jobs and its replacement reuses the pending compilation',async()=>{
  let finish,loads=0;
  const compiling=new Promise(resolve=>{finish=resolve;});
  const f=fixture({loadModule:()=>{loads++;return compiling;},idleMs:17});
  const controller=new AbortController();
  const a=f.client.request({kind:'finish'},{scope:'finish',signal:controller.signal});
  const b=f.client.request({kind:'regenerate'});
  const rejected=[assert.rejects(a,{name:'AbortError'}),assert.rejects(b,{name:'AbortError'})];
  await tick();f.client.cancel('unrelated');assert.notEqual(f.workers[0].terminated,true);
  controller.abort();await Promise.all(rejected);
  assert.equal(f.workers[0].terminated,true);assert.deepEqual(f.client.activity(),[]);
  const next=f.client.request({kind:'regenerate'});
  const module=await prepareCadKernelModule();finish(module);await tick();
  assert.equal(loads,1);assert.equal(f.workers[0].messages.length,0);
  assert.equal(f.workers[1].messages[0].kernelModule,module);
  f.workers[0].emit({id:3,result:'obsolete'});
  f.workers[1].emit({id:3,result:'fresh'});assert.equal(await next,'fresh');
  assert.equal([...f.timers.values()][0].delay,17);
  f.client.cancel();
});

test('busy cancellation keeps the module and rejects running and queued work exactly as before',async()=>{
  const f=fixture({loadModule:prepareCadKernelModule});
  const first=f.client.request({kind:'finish'},{scope:'finish'});
  const queued=f.client.request({kind:'regenerate'});
  const checks=[assert.rejects(first,{name:'AbortError'}),assert.rejects(queued,{name:'AbortError'})];
  await tick();const module=f.workers[0].messages[0].kernelModule;
  assert.ok(module instanceof WebAssembly.Module);
  f.client.cancel('finish');await Promise.all(checks);
  const fresh=f.client.request({kind:'regenerate'});await tick();
  assert.equal(f.workers[1].messages[0].kernelModule,module);
  f.workers[1].emit({id:3,result:'fresh'});assert.equal(await fresh,'fresh');f.client.cancel();
});

test('unavailable modules and structured-clone failures fall back to the original request protocol',async()=>{
  const unavailable=fixture({loadModule:async()=>{throw new Error('compile unavailable');}});
  const a=unavailable.client.request({kind:'regenerate'});await tick();
  assert.deepEqual(unavailable.workers[0].messages,[{id:1,request:{kind:'regenerate'}}]);
  unavailable.workers[0].emit({id:1,result:'fallback'});await a;unavailable.client.cancel();
  const f=fixture({loadModule:prepareCadKernelModule});
  const b=f.client.request({kind:'regenerate'}),worker=f.workers[0];
  const post=worker.postMessage;
  worker.postMessage=function(message){if(message.kernelModule)throw new DOMException('Module cloning unavailable','DataCloneError');post.call(this,message);};
  await tick();assert.deepEqual(worker.messages,[{id:1,request:{kind:'regenerate'}}]);
  worker.emit({id:1,result:'fallback'});assert.equal(await b,'fallback');f.client.cancel();
});

test('bootstrap retains a supplied module even when its first queued preview is superseded',async()=>{
  const module=await prepareCadKernelModule(),messages=[],seen=[];
  const scope={postMessage:message=>messages.push(message)};
  installCadWorkerBootstrap(scope,async()=>({createCadWorkerExecutor(options){seen.push(options.kernelModule);return async request=>request.label;}}));
  const first=scope.onmessage({data:{id:1,kernelModule:module,request:{kind:'regenerate',label:'old',coalesceKey:'preview'}}});
  const next=scope.onmessage({data:{id:2,request:{kind:'regenerate',label:'new',coalesceKey:'preview'}}});
  await Promise.all([first,next]);
  assert.deepEqual(seen,[module]);assert.equal(messages.find(m=>m.id===1 && m.error).error.name,'AbortError');
  assert.equal(messages.at(-1).result,'new');
});

test('Emscripten hook asynchronously instantiates compiled code without calling a compiler',async t=>{
  const module=await prepareCadKernelModule(),instantiate=WebAssembly.instantiate.bind(WebAssembly);
  t.mock.method(WebAssembly,'compile',()=>{throw new Error('unexpected compilation');});
  const sync=t.mock.method(WebAssembly,'Instance',function(){throw new Error('unexpected synchronous instantiation');});
  const asyncCall=t.mock.method(WebAssembly,'instantiate',(compiled,imports)=>{
    assert.ok(compiled instanceof WebAssembly.Module);return instantiate(compiled,imports);
  });
  let received;
  const result=await instantiateCadKernelModule(options=>new Promise(resolve=>{
    const pending=options.instantiateWasm({},(instance,compiled)=>{received={instance,compiled};resolve(instance.exports);});
    assert.deepEqual(pending,{});assert.equal(received,undefined);
  }),structuredClone(module));
  assert.ok(received.compiled instanceof WebAssembly.Module);
  assert.deepEqual(Object.keys(result),[]);
  assert.equal(sync.mock.callCount(),0);assert.equal(asyncCall.mock.callCount(),1);
});

test('restore waits for asynchronous kernel initialization and propagates initialization failure',{timeout:15000},async t=>{
  await prepareCadKernelModule();
  let failInstantiation;
  const asyncCall=t.mock.method(WebAssembly,'instantiate',()=>new Promise((_,reject)=>{failInstantiation=reject;}));
  const native=t.mock.method(WebAssembly,'Instance',function(){throw new Error('main-thread kernel must remain unloaded');});
  const compile=t.mock.method(WebAssembly,'compile',()=>{throw new Error('module already compiled');});
  const fetch=t.mock.method(globalThis,'fetch',()=>{throw new Error('kernel already fetched');});
  const bytes=Uint8Array.of(1,2,3),topology=[{kind:'face',persistentId:'box:end'}];
  const meshData={positions:[0,0,0,1,0,0,0,1,0]},massProperties={volume:24,solidCount:1};
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousWorker=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  t.after(()=>{
    if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;
    if(previousWorker)Object.defineProperty(globalThis,'Worker',previousWorker);else delete globalThis.Worker;
  });
  globalThis.window={};
  globalThis.Worker=class{
    postMessage({id,kernelModule}){
      assert.ok(kernelModule instanceof WebAssembly.Module);
      queueMicrotask(()=>this.onmessage({data:{id,result:{ok:true,results:[['box',{bytes,metadata:{kind:'solid',nativeSolidCount:1},topology,meshData,massProperties}]],finalId:'box',resolvedExtrusions:[],boundaryUpdates:[]}}}));
    }
    terminate(){}
  };
  try{
    let resolved=false;
    const pending=regenerateInCadWorker({features:[{id:'box',type:'box'}]},{massProperties:true}).then(run=>{resolved=true;return run;});
    const rejected=assert.rejects(pending,/asynchronous initialization failed/);
    while(!failInstantiation)await tick();
    assert.equal(resolved,false,'restore cannot resolve while the kernel hook is pending');
    failInstantiation(new Error('asynchronous initialization failed'));await rejected;
    assert.equal(asyncCall.mock.callCount(),1);
    assert.equal(native.mock.callCount(),0);assert.equal(compile.mock.callCount(),0);assert.equal(fetch.mock.callCount(),0);
  }finally{cancelCadWorkerWork();}
});

test('an asynchronous Emscripten hook failure rejects instead of leaving ready pending',async t=>{
  const module=await prepareCadKernelModule();
  t.mock.method(WebAssembly,'instantiate',async()=>{throw new WebAssembly.LinkError('incompatible imports');});
  await assert.rejects(instantiateCadKernelModule(options=>{
    options.instantiateWasm({},()=>{});
    return new Promise(()=>{});
  },module),/incompatible imports/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadWorkerClient,cadWorkerDocument} from '../js/core/cad_worker_client.js';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {deserializeBrep,disposeBrep,shapeMassProperties,extractBrepTopology,hydrateSerializedBrepTopology} from '../js/cad_kernel.js';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';

function fakeWorkers(options){
  const workers=[];
  const client=createCadWorkerClient(()=>{
    const worker={messages:[],postMessage(message){this.messages.push(message);},terminate(){this.terminated=true;},emit(data){this.onmessage({data});}};
    workers.push(worker);return worker;
  },options);
  return {client,workers};
}
test('CAD worker transport retains authoring recipes and exact naming hints without display payloads',()=>{
  const topology=[{kind:'face',persistentId:'solid:face:end',descriptor:{surface:'plane'}}];
  const source=createPartDocument();
  createFeatureDefinition(source,'box',{id:'solid',params:{w:2,h:3,d:4}});
  Object.assign(source,{parts:[{id:'p',featureId:'solid',kind:'box',w:2,meshData:{positions:[1,2,3]},exactMesh:{vertices:[4,5,6]},topology}],exactTopologyCache:{solid:{signature:'large verification stamp',topology}},lastRebuild:{signature:'another large stamp'},meshData:{positions:[7,8,9]}});
  const compact=cadWorkerDocument(source);
  assert.deepEqual(compact.features,source.features);
  assert.deepEqual(compact.parts,[{id:'p',featureId:'solid',kind:'box',w:2}]);
  assert.deepEqual(compact.exactTopologyCache,{solid:{topology}});
  assert.equal(compact.lastRebuild,undefined);assert.equal(compact.meshData,undefined);
  assert.equal(source.parts[0].meshData.positions.length,3);
  const compiled=compileKernelFeatureTree(compact);assert.equal(compiled.ok,true);assert.equal(compiled.features.length,1);
  assert.deepEqual(compiled.features,compileKernelFeatureTree(source).features);
});
test('CAD worker forwards progress and isolates obsolete completion after cancellation',async()=>{
  const {client,workers}=fakeWorkers(),progress=[];
  const cancelled=client.request({kind:'finish'},{scope:'finish',onProgress:value=>progress.push(value)});
  const rejection=assert.rejects(cancelled,{name:'AbortError'});
  workers[0].emit({id:1,progress:{stage:'finish'}});
  client.cancel('finish');await rejection;
  assert.equal(workers[0].terminated,true);
  const fresh=client.request({kind:'regenerate'});
  workers[0].emit({id:2,result:'obsolete'});
  workers[1].emit({id:2,result:'fresh'});
  assert.equal(await fresh,'fresh');assert.deepEqual(progress,[{stage:'finish'}]);
});
test('CAD worker abort terminates synchronous work and rejects every queued job',async()=>{
  const {client,workers}=fakeWorkers(),controller=new AbortController();
  const first=client.request({kind:'finish'},{scope:'finish',signal:controller.signal});
  const second=client.request({kind:'regenerate'});
  const checks=[assert.rejects(first,{name:'AbortError'}),assert.rejects(second,{name:'AbortError'})];
  controller.abort();await Promise.all(checks);assert.equal(workers[0].terminated,true);
  const preAborted=await assert.rejects(client.request({}, {signal:controller.signal}),{name:'AbortError'});
  assert.equal(preAborted,undefined);assert.equal(workers.length,1);
});

test('document-wide cancellation releases an idle native worker immediately',async()=>{
  const {client,workers}=fakeWorkers();
  const first=client.request({kind:'regenerate'});workers[0].emit({id:1,result:'old document'});await first;
  client.cancel('unrelated-scope');assert.notEqual(workers[0].terminated,true);
  client.cancel();assert.equal(workers[0].terminated,true);
  const next=client.request({kind:'regenerate'});workers[1].emit({id:2,result:'new document'});
  assert.equal(await next,'new document');
});
test('CAD worker errors release queued callers and allow restart',async()=>{
  const {client,workers}=fakeWorkers();
  const failed=client.request({kind:'regenerate'}),rejection=assert.rejects(failed,/boot failure/);
  workers[0].onerror({message:'boot failure'});await rejection;
  const fresh=client.request({kind:'regenerate'});workers[1].emit({id:2,result:7});assert.equal(await fresh,7);
});

test('CAD worker observers cannot prevent submission, progress or completion',async(t)=>{
  const errors=t.mock.method(console,'error',()=>{}),{client,workers}=fakeWorkers();
  client.subscribe(()=>{throw new Error('broken status renderer');});
  const pending=client.request({kind:'regenerate'},{onProgress(){throw new Error('broken progress renderer');}});
  assert.equal(workers[0].messages.length,1);
  workers[0].emit({id:1,progress:{stage:'start'}});
  workers[0].emit({id:1,result:'exact result'});
  assert.equal(await pending,'exact result');
  assert.deepEqual(client.activity(),[]);
  assert.equal(errors.mock.callCount(),5);
});

test('CAD worker unreadable messages reject callers and permit a fresh worker',async()=>{
  const {client,workers}=fakeWorkers();
  const pending=client.request({kind:'regenerate'}),check=assert.rejects(pending,/could not be transferred/);
  workers[0].onmessageerror();await check;
  const fresh=client.request({kind:'regenerate'});workers[1].emit({id:2,result:'recovered'});
  assert.equal(await fresh,'recovered');
});

test('CAD worker releases idle WASM without interrupting requests or native restoration',async()=>{
  const timers=new Map();let nextTimer=0;
  const {client,workers}=fakeWorkers({idleMs:120000,setTimer(callback,delay){assert.equal(delay,120000);timers.set(++nextTimer,callback);return nextTimer;},clearTimer(id){timers.delete(id);}});
  const first=client.request({kind:'regenerate'});
  assert.equal(timers.size,0,'an active request cannot expire');
  workers[0].emit({id:1,result:'exact'});assert.equal(await first,'exact');
  assert.equal(timers.size,1);
  const staleTimer=[...timers.values()][0],restore=client.track('rebuild','Restore');
  assert.equal(timers.size,0,'native restoration protects the worker cache');
  staleTimer();assert.notEqual(workers[0].terminated,true);
  restore.end();assert.equal(timers.size,1);
  [...timers.values()][0]();assert.equal(workers[0].terminated,true);
  const fresh=client.request({kind:'regenerate'});
  workers[1].emit({id:3,result:'fresh worker'});assert.equal(await fresh,'fresh worker');
});

test('CAD worker activity persists queued and running stages and clears cancelled jobs',async()=>{
  const {client,workers}=fakeWorkers(),updates=[];
  const unsubscribe=client.subscribe(value=>updates.push(value));
  const first=client.request({kind:'finish',type:'shell'},{scope:'finish'});
  const second=client.request({kind:'regenerate'},{scope:'rebuild'});
  const checks=[assert.rejects(first,{name:'AbortError'}),assert.rejects(second,{name:'AbortError'})];
  assert.equal(client.activity().length,2);
  assert.equal(client.activity()[0].name,'shell');
  assert.equal(client.activity()[1].progress,null);
  workers[0].emit({id:1,progress:{stage:'finish',name:'Shell 1'}});
  assert.equal(client.activity()[0].progress.name,'Shell 1');
  assert.ok(client.activity()[0].startedAt>0);
  client.cancel('finish');await Promise.all(checks);
  assert.deepEqual(client.activity(),[]);
  assert.deepEqual(updates.at(-1),[]);
  unsubscribe();
});

test('CAD BREP restoration remains observable and obsolete restoration cannot publish',()=>{
  const {client}=fakeWorkers();
  const tracker=client.track('rebuild','Restoring exact geometry');
  tracker.progress({stage:'restore',name:'loft'});
  assert.equal(client.activity()[0].progress.stage,'restore');
  assert.equal(tracker.active(),true);
  client.cancel('rebuild');
  assert.equal(tracker.active(),false);
  assert.deepEqual(client.activity(),[]);
  tracker.end();
  assert.deepEqual(client.activity(),[]);
});

test('worker exact BREP roundtrip and Shell preview cache preserve geometry and invalidate upstream edits',async()=>{
  const execute=createCadWorkerExecutor();
  const document={features:[{id:'base',name:'Base',type:'cylinder',params:{r:2,h:5,axis:'z'},inputs:[],references:{}}],sketches:[],parameters:{},references:[]};
  const first=await execute({kind:'regenerate',document:cadWorkerDocument(document),massProperties:true});
  assert.equal(first.ok,true);assert.equal(first.finalId,'base');assert.ok(first.results[0][1].meshData.positions.length);
  assert.ok(Math.abs(first.results[0][1].massProperties.volume-20*Math.PI)<1e-6);
  let body=await deserializeBrep(first.results[0][1].bytes);
  const shipped=first.results[0][1].topology;
  hydrateSerializedBrepTopology(body,shipped);
  const transported=structuredClone(body.topology);
  extractBrepTopology(body,{ownerFeatureId:'base',expectedTopology:shipped});
  for(const entry of transported){const actual=body.topology.find(item=>item.kind===entry.kind && item.transportOrdinal===entry.transportOrdinal);assert.equal(actual.persistentId,entry.persistentId);assert.equal(actual.signature.replace(/:[^:]*$/,''),entry.signature.replace(/:[^:]*$/,''));}
  assert.throws(()=>hydrateSerializedBrepTopology(body,shipped.slice(1)),/transport map/);
  const duplicate=structuredClone(shipped);duplicate[1].kind=duplicate[0].kind;duplicate[1].transportOrdinal=duplicate[0].transportOrdinal;
  assert.throws(()=>hydrateSerializedBrepTopology(body,duplicate),/transport map/);
  hydrateSerializedBrepTopology(body,[...shipped].reverse());
  assert.equal(body.subshapes.size,shipped.length,'transport ordinals are independent of JSON list order');
  const older=shipped.map(({transportOrdinal,...entry})=>entry);
  hydrateSerializedBrepTopology(body,older,{ownerFeatureId:'base'});
  assert.equal(body.topology.length,shipped.length);
  const before=await shapeMassProperties(body);disposeBrep(body);
  const close=(actual,expected)=>typeof expected==='number'
    ? assert.ok(Math.abs(actual-expected)<1e-9,'worker measurements match integration of the serialized exact BREP')
    : Object.keys(expected).forEach(key=>close(actual[key],expected[key]));
  close(first.results[0][1].massProperties,before);
  assert.ok(Math.abs(before.volume-20*Math.PI)<1e-6);
  const face=first.results[0][1].topology.find(item=>item.kind==='face' && item.descriptor?.surface==='plane');
  assert.ok(face,'cylinder cap topology survives serialization');
  const params={thickness:.2,direction:'inside',tolerance:.001,join:'arc'};
  const preview=await execute({kind:'finish',document,head:'base',type:'shell',params,amount:.2,targets:[face]});
  assert.ok(preview.body.bytes.length);assert.equal(preview.body.metadata.approximate,undefined);
  body=await deserializeBrep(preview.body.bytes);const previewMass=await shapeMassProperties(body);disposeBrep(body);
  const committed=structuredClone(document);
  committed.features.push({id:'shell',name:'Shell',type:'shell',inputs:['base'],params,references:[face]});
  const sharedHint={x:0,y:0,z:0};
  committed.features[0].params.sharedHint=sharedHint;committed.localFrame=sharedHint;
  await execute({kind:'regenerate',document:committed});
  const clonedProgress=[];
  await execute({kind:'regenerate',document:JSON.parse(JSON.stringify(committed))},value=>clonedProgress.push(value));
  assert.ok(clonedProgress.some(value=>value.stage==='cache'),'Save JSON cloning does not invalidate equivalent geometry');
  delete committed.features[0].params.sharedHint;delete committed.localFrame;
  const progress=[],rebuilt=await execute({kind:'regenerate',document:committed},value=>progress.push(value));
  assert.equal(rebuilt.ok,true);assert.ok(progress.some(value=>value.stage==='cache'));
  body=await deserializeBrep(rebuilt.results.find(([id])=>id==='shell')[1].bytes);
  extractBrepTopology(body,{ownerFeatureId:'shell',expectedTopology:rebuilt.results.find(([id])=>id==='shell')[1].topology});
  assert.ok(body.topology.some(item=>item.ownerFeatureId==='shell'));
  assert.ok(body.topology.every(item=>!item.ownerFeatureId.startsWith('preview:')));
  assert.ok(Math.abs((await shapeMassProperties(body)).volume-previewMass.volume)<1e-8);disposeBrep(body);
  committed.sketches.push({id:'later-sketch',points:[],entities:[],constraints:[]});
  committed.references.push({id:'later-plane',origin:{x:0,y:0,z:20},normal:{x:0,y:0,z:1}});
  const laterProgress=[];
  await execute({kind:'regenerate',document:committed},value=>laterProgress.push(value));
  assert.ok(laterProgress.some(value=>value.stage==='cache'),'unrelated downstream sketches do not repeat the exact Shell');
  committed.features[0].params.h=6;
  const changedProgress=[],changed=await execute({kind:'regenerate',document:committed},value=>changedProgress.push(value));
  assert.equal(changed.ok,true);assert.equal(changedProgress.some(value=>value.stage==='cache'),false);
  body=await deserializeBrep(changed.results.find(([id])=>id==='shell')[1].bytes);
  assert.ok((await shapeMassProperties(body)).volume>previewMass.volume);disposeBrep(body);
  committed.parameters={height:{value:6}};committed.features[0].params.h='$height';
  await execute({kind:'regenerate',document:committed});
  const overrideProgress=[],overridden=await execute({kind:'regenerate',document:committed,options:{parameterOverrides:{height:7}}},value=>overrideProgress.push(value));
  assert.equal(overridden.ok,true);assert.equal(overrideProgress.some(value=>value.stage==='cache'),false);
  body=await deserializeBrep(overridden.results.find(([id])=>id==='shell')[1].bytes);
  assert.ok((await shapeMassProperties(body)).volume>previewMass.volume);disposeBrep(body);
});

test('canonical adapter Shell commit reuses its exact preview with lowered array references',async()=>{
  const execute=createCadWorkerExecutor(),document=createPartDocument();
  createFeatureDefinition(document,'cylinder',{id:'base',params:{r:2,h:5}});
  const first=await execute({kind:'regenerate',canonical:true,document});
  const cap=first.results[0][1].topology.find(item=>item.kind==='face' && item.descriptor.surface==='plane');
  const params={thickness:.2,direction:'inside',tolerance:.001,join:'arc',removeOpenings:true};
  const preview=await execute({kind:'finish',canonical:true,document,head:'base',type:'shell',params,amount:.2,targets:[cap]});
  const previewBody=await deserializeBrep(preview.body.bytes);
  const previewMass=await shapeMassProperties(previewBody);disposeBrep(previewBody);
  createFeatureDefinition(document,'shell',{id:'shell',inputs:['base'],references:{features:['base'],topology:[cap]},params});
  const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true);
  assert.ok(Array.isArray(compiled.features.at(-1).references));
  const progress=[],run=await execute({kind:'regenerate',document:{...compiled.document,features:compiled.features},massProperties:true},value=>progress.push(value));
  assert.equal(run.ok,true);assert.ok(progress.some(value=>value.stage==='cache'));
  const committedMass=run.results.find(([id])=>id==='shell')[1].massProperties;
  assert.ok(Math.abs(committedMass.volume-previewMass.volume)<1e-9,'preview reuse preserves exact native Shell material');
  assert.equal(params.faceThicknesses,undefined,'cache normalization never changes the caller recipe');
});

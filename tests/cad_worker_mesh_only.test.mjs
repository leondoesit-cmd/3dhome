import test from 'node:test';
import assert from 'node:assert/strict';
import {cadWorkerMeshResult} from '../js/core/cad_worker_client.js';
import {createCadWorkerExecutor,nativeWorkerHeads} from '../js/core/cad_worker_runtime.js';
import {captureExactTopology,verifiedExactTopology} from '../js/core/exact_topology_cache.js';
import {deserializeBrep,disposeBrep,shapeMassProperties,hydrateSerializedBrepTopology,exportStep,exportIges} from '../js/cad_kernel.js';

test('mesh restoration accepts only an exact worker proof and keeps native handles absent',()=>{
 const payload={proof:'exact-native-mesh',metadata:{kind:'solid'},topology:[{kind:'face',persistentId:'body:end'}],meshData:{positions:[0,0,0,1,0,0,0,1,0]}};
 const body=cadWorkerMeshResult(payload);
 assert.equal(body.shape,undefined);assert.equal(body.oc,undefined);assert.equal(body.verifiedSerializedExact,true);
 assert.equal(body.workerMeshData.topology,body.topology);
 for(const metadata of [{invalid:'failed'},{approximate:'stand-in'}])assert.throws(()=>cadWorkerMeshResult({...payload,metadata}),/proof is incomplete/);
 assert.throws(()=>cadWorkerMeshResult({...payload,meshData:{positions:[]}}),/proof is incomplete/);
 assert.equal(cadWorkerMeshResult({...payload,proof:undefined}).verifiedSerializedExact,undefined);
});

test('native transfer keeps every surviving body and a failed downstream head',()=>{
 const a={shape:{}},b={shape:{}},joined={shape:{}},other={shape:{}};
 const document={features:[{id:'a',inputs:[]},{id:'b',inputs:[]},{id:'joined',inputs:['a','b']},{id:'other',inputs:[]},{id:'failed',inputs:['joined']}]};
 const run={results:new Map([['a',a],['b',b],['joined',joined],['other',other]]),finalShape:other};
 assert.deepEqual([...nativeWorkerHeads(document,run)],['joined','other']);
 assert.deepEqual([...nativeWorkerHeads(document,run,'a')],['a']);
 const copied={shape:{}},copyDocument={parts:[{featureId:'a'},{featureId:'a',derivedFeatureId:'copy'}],features:[{id:'a',type:'box',inputs:[]},{id:'copy',type:'moveBody',inputs:['a']}]};
 assert.deepEqual([...nativeWorkerHeads(copyDocument,{results:new Map([['a',a],['copy',copied]]),finalShape:copied})],['a','copy'],'Move/Copy retains both original and copy BREP');
});

test('native head transfer preserves downstream naming, exact evaluation and STEP/IGES export',async()=>{
 const execute=createCadWorkerExecutor();
 const document={features:[
  {id:'a',type:'box',params:{w:3,h:3,d:3},inputs:[]},
  {id:'b',type:'box',params:{x:2,w:3,h:3,d:3},inputs:[]},
  {id:'joined',type:'union',params:{},inputs:['a','b']},
  {id:'other',type:'box',params:{x:10,w:1,h:1,d:1},inputs:[]},
 ]};
 const run=await execute({kind:'regenerate',document,massProperties:true});
 assert.equal(run.ok,true);
 const results=new Map(run.results);
 for(const id of ['a','b']){
  assert.equal(results.get(id).bytes,undefined);
  assert.equal(cadWorkerMeshResult(results.get(id)).verifiedSerializedExact,true);
  assert.ok(results.get(id).topology.some(entry=>entry.kind==='face'));
 }
 for(const [id,volume] of [['joined',45],['other',1]]){
  const payload=results.get(id);
  assert.ok(payload.bytes.byteLength);assert.equal(payload.proof,undefined);
  const body=await deserializeBrep(payload.bytes);
  try{
   hydrateSerializedBrepTopology(body,payload.topology,{ownerFeatureId:id});
   assert.deepEqual(body.topology.map(entry=>entry.persistentId),payload.topology.map(entry=>entry.persistentId));
   assert.ok(Math.abs((await shapeMassProperties(body)).volume-volume)<1e-7);
   assert.ok((await exportStep(body,id+'.step')).byteLength>100);
   assert.ok((await exportIges(body,id+'.igs')).byteLength>100);
  }finally{disposeBrep(body);}
 }
 const rollback=await execute({kind:'regenerate',document,head:'a'});
 assert.deepEqual(rollback.results.map(([id])=>id),['a']);
 assert.ok(rollback.results[0][1].bytes.byteLength);
});

test('serialized exact topology is verified against geometry and rejects approximate proof',()=>{
 const document={sketches:[],parameters:{}};
 const features=[{id:'box',type:'box',params:{w:2,h:3,d:4},inputs:[]}];
 const body={verifiedSerializedExact:true,topology:[{kind:'face',persistentId:'box:end'}]};
 document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([['box',body]])});
 assert.equal(verifiedExactTopology(document,features).size,1);
 features[0].params.w=3;assert.equal(verifiedExactTopology(document,features).size,0);
 assert.deepEqual(captureExactTopology(document,features,{results:new Map([['box',{...body,approximate:true}]])}),{});
 assert.deepEqual(captureExactTopology(document,features,{results:new Map([['box',{...body,verifiedSerializedExact:false}]])}),{});
});

test('worker mesh-only validation preserves exact mass and leaves native export payload unchanged',async()=>{
 const execute=createCadWorkerExecutor();
 const document={features:[{id:'box',type:'box',params:{w:2,h:3,d:4},inputs:[]}]};
 const display=await execute({kind:'regenerate',document,meshOnly:true,massProperties:true});
 assert.equal(display.ok,true);
 const payload=display.results.find(([id])=>id==='box')[1];
 assert.equal(payload.bytes,undefined);assert.equal(payload.proof,'exact-native-mesh');
 assert.ok(payload.meshData.positions.length);assert.ok(Math.abs(payload.massProperties.volume-24)<1e-7);
 const native=await execute({kind:'regenerate',document});
 const nativePayload=native.results.find(([id])=>id==='box')[1];
 assert.ok(nativePayload.bytes.byteLength);assert.equal(nativePayload.proof,undefined);
 const restored=await deserializeBrep(nativePayload.bytes);
 try{assert.ok(Math.abs((await shapeMassProperties(restored)).volume-payload.massProperties.volume)<1e-7);}finally{disposeBrep(restored);}
});

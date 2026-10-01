import test from 'node:test';
import assert from 'node:assert/strict';
import {isWorkerCacheBody} from '../js/core/worker_body_cache.js';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';

test('body cache excludes operations with extrusion and boundary-update side effects',()=>{
 for(const type of ['shell','draft','union','fillet','chamfer'])assert.equal(isWorkerCacheBody(type),true);
 for(const type of ['extrude','holeTool','loft','sweep','rib','sketch','subtract'])assert.equal(isWorkerCacheBody(type),false);
});

test('a recreated worker restores an exact persisted prefix and rejects a driving edit',async()=>{
 const records=new Map(),bodyStore={async get(key){return records.get(key);},async put(key,value){records.set(key,structuredClone(value));}};
 const document={features:[{id:'a',type:'box',params:{w:3,h:3,d:3},inputs:[]},{id:'b',type:'box',params:{x:2,w:3,h:3,d:3},inputs:[]},{id:'joined',type:'union',params:{},inputs:['a','b']}]};
 const request={kind:'regenerate',document,head:'joined',meshOnly:true,massProperties:true};
 const first=await createCadWorkerExecutor({bodyStore})(request);
 assert.equal(first.ok,true);assert.equal(records.size,1);
 const progress=[],second=await createCadWorkerExecutor({bodyStore})(request,event=>progress.push(event));
 assert.equal(second.ok,true);assert.ok(progress.some(event=>event.stage==='cache'));
 assert.ok(Math.abs(second.results[0][1].massProperties.volume-first.results[0][1].massProperties.volume)<1e-7);
 document.features[0].params.d=4;progress.length=0;
 const changed=await createCadWorkerExecutor({bodyStore})(request,event=>progress.push(event));
 assert.equal(changed.ok,true);assert.ok(!progress.some(event=>event.stage==='cache'));
 assert.ok(Math.abs(changed.results[0][1].massProperties.volume-first.results[0][1].massProperties.volume)>1);
});

test('exact union cache reuses unchanged solids and rejects an upstream size edit',async()=>{
 const execute=createCadWorkerExecutor();
 const document={features:[
  {id:'a',type:'box',params:{w:3,h:3,d:3},inputs:[]},
  {id:'b',type:'box',params:{x:2,w:3,h:3,d:3},inputs:[]},
  {id:'joined',type:'union',params:{},inputs:['a','b']},
 ]};
 const request={kind:'regenerate',document,head:'joined',meshOnly:true,massProperties:true};
 const first=await execute(request);assert.equal(first.ok,true);
 const volume=first.results[0][1].massProperties.volume,progress=[];
 const second=await execute(request,event=>progress.push(event));
 assert.equal(second.ok,true);assert.ok(progress.some(event=>event.stage==='cache'));
 assert.ok(Math.abs(second.results[0][1].massProperties.volume-volume)<1e-7);
 document.features[0].params.d=4;progress.length=0;
 const changed=await execute(request,event=>progress.push(event));
 assert.equal(changed.ok,true);assert.ok(!progress.some(event=>event.stage==='cache'));
 assert.ok(Math.abs(changed.results[0][1].massProperties.volume-volume)>1);
});

test('exact Draft cache preserves the result and invalidates the driving angle',async()=>{
 const execute=createCadWorkerExecutor();
 const document={features:[{id:'box',type:'box',params:{w:2,h:2,d:2},inputs:[]}]};
 const base=await execute({kind:'regenerate',document,meshOnly:true});
 const side=base.results[0][1].topology.find(item=>item.kind==='face' && item.descriptor.normal.x>.99);
 assert.ok(side);
 document.features.push({id:'drafted',type:'draft',inputs:['box'],references:[side],params:{angle:3,pullAxis:'z',pullDirection:'forward',neutral:'end'}});
 const request={kind:'regenerate',document,head:'drafted',meshOnly:true,massProperties:true};
 const first=await execute(request);assert.equal(first.ok,true);
 const volume=first.results[0][1].massProperties.volume,progress=[];
 const second=await execute(request,event=>progress.push(event));
 assert.equal(second.ok,true);assert.ok(progress.some(event=>event.stage==='cache'));
 assert.ok(Math.abs(second.results[0][1].massProperties.volume-volume)<1e-7);
 document.features[1].params.angle=5;progress.length=0;
 const changed=await execute(request,event=>progress.push(event));
 assert.equal(changed.ok,true);assert.ok(!progress.some(event=>event.stage==='cache'));
 assert.ok(Math.abs(changed.results[0][1].massProperties.volume-volume)>.01);
});

for(const type of ['fillet','chamfer'])test(`persisted ${type} cache preserves native topology and rejects size/target edits`,async()=>{
 const records=new Map(),bodyStore={async get(key){return records.get(key);},async put(key,value){records.set(key,structuredClone(value));}};
 const document={features:[{id:'box',type:'box',params:{w:3,h:3,d:3},inputs:[]}]};
 const base=await createCadWorkerExecutor({bodyStore})({kind:'regenerate',document,meshOnly:true});
 const edges=base.results[0][1].topology.filter(item=>item.kind==='edge');assert.ok(edges.length>1);
 document.features.push({id:'finish',name:type,type,inputs:['box'],references:[edges[0]],params:type==='fillet'?{radius:.2}:{distance:.2}});
 const request={kind:'regenerate',document,head:'finish',meshOnly:true,massProperties:true};
 const first=await createCadWorkerExecutor({bodyStore})(request);assert.equal(first.ok,true);assert.equal(records.size,1);
 const progress=[],second=await createCadWorkerExecutor({bodyStore})(request,e=>progress.push(e));
 assert.equal(second.ok,true);assert.ok(progress.some(e=>e.stage==='cache' && e.name===type));
 assert.deepEqual(second.results[0][1].topology,first.results[0][1].topology,'exact native names survive a worker restart');
 assert.ok(Math.abs(second.results[0][1].massProperties.volume-first.results[0][1].massProperties.volume)<1e-7);
 document.features[1].params[type==='fillet'?'radius':'distance']=.3;progress.length=0;
 const changed=await createCadWorkerExecutor({bodyStore})(request,e=>progress.push(e));assert.equal(changed.ok,true);
 assert.ok(!progress.some(e=>e.stage==='cache'));assert.ok(Math.abs(changed.results[0][1].massProperties.volume-first.results[0][1].massProperties.volume)>.001);
 document.features[1].references=[edges[1]];progress.length=0;
 const retargeted=await createCadWorkerExecutor({bodyStore})(request,e=>progress.push(e));assert.equal(retargeted.ok,true);
 assert.ok(!progress.some(e=>e.stage==='cache'),'changing selected topology cannot reuse the old finish');
 document.features[0].params.d=4;progress.length=0;
 const resized=await createCadWorkerExecutor({bodyStore})(request,e=>progress.push(e));assert.equal(resized.ok,true);
 assert.ok(!progress.some(e=>e.stage==='cache'),'an upstream stock edit invalidates every downstream finish');
 assert.ok(Math.abs(resized.results[0][1].massProperties.volume-retargeted.results[0][1].massProperties.volume)>1);
});

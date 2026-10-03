import test from 'node:test';
import assert from 'node:assert/strict';
import {workerInterference,interferenceDocument} from '../js/core/worker_interference.js';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';

test('interference transfer retains authoring intent without copying viewport meshes or saved topology',()=>{
  const source={metadata:{authoringSystem:'parametric-v1'},features:[{id:'f'}],sketches:[{id:'s'}],parts:[{meshData:{positions:[1,2,3]}}],exactTopologyCache:{large:true},verifiedExactTopology:{large:true},references:[{id:'plane'}],rollbackIndex:2};
  const compact=interferenceDocument(source);
  assert.deepEqual(compact.parts,[]);assert.equal(compact.exactTopologyCache,undefined);
  assert.equal(compact.verifiedExactTopology,undefined);assert.equal(compact.features,source.features);
  assert.equal(compact.sketches,source.sketches);assert.equal(compact.rollbackIndex,2);
  assert.equal(source.parts[0].meshData.positions.length,3);
});

test('worker-native interference releases both placed and rebuilt bodies when a later component fails',async()=>{
  const released=[],disposed=[],stages=[];let count=0;
  await assert.rejects(workerInterference([{id:'a',document:{part:'first'}},{id:'b',document:{part:'broken'}}],async()=>({run:++count===1?{ok:true,finalShape:{shape:true}}:{ok:false,issues:[{message:'Broken thread'}]}}),p=>stages.push(p),{
    compile:()=>({ok:true,document:{},features:[]}),place:async()=>({shape:'placed'}),release:r=>released.push(r),dispose:r=>disposed.push(r),detect:()=>{throw new Error('Invalid geometry must never produce a clean report');},
  }),/Broken thread/);
  assert.equal(released.length,2);assert.equal(disposed.length,1);
  assert.ok(stages.some(p=>p.stage==='placement' && p.componentId==='a'));
});

test('one interference operation rebuilds identical parts once but places and disposes every occurrence',async()=>{
  const released=[],disposed=[],rebuilds=[],placements=[],stages=[];
  const document={features:[{id:'same-part'}]},other={features:[{id:'variant'}]};
  const components=[
    {id:'left',document,placement:{translation:{x:-2,y:0,z:0}}},
    {id:'right',document:structuredClone(document),placement:{translation:{x:2,y:0,z:0}}},
    {id:'variant',document:other,placement:{translation:{x:4,y:0,z:0}}},
  ];
  const hits=await workerInterference(components,async source=>{
    const id=source.features[0].id;rebuilds.push(id);
    return {run:{ok:true,finalShape:{shape:id},results:[]}};
  },stage=>stages.push(stage),{
    compile:source=>({ok:true,document:source,features:source.features}),
    place:async(source,placement)=>{
      assert.equal(released.includes(source.shape),false,'source remains live through placement');
      const instance={shape:source.shape,x:placement.translation.x};placements.push(instance);return instance;
    },
    release:run=>released.push(run.finalShape.shape),dispose:body=>disposed.push(body),
    detect:async measured=>{
      assert.equal(new Set(measured.map(c=>c.brep)).size,3,'each occurrence has its own placed body');
      return [{a:measured[0].id,b:measured[1].id,exact:false}];
    },
  });
  assert.equal(hits.length,1);
  assert.deepEqual(rebuilds,['same-part','variant']);
  assert.deepEqual(placements.map(p=>p.x),[-2,2,4]);
  assert.deepEqual(released,['same-part','variant']);
  assert.equal(disposed.length,3);
  assert.equal(stages.filter(p=>p.stage==='rebuild').length,2);
  assert.equal(stages.filter(p=>p.stage==='placement').length,3);
});

test('interference releases a reused source and earlier placed bodies when another placement fails',async()=>{
  const document={part:'identical'},released=[],disposed=[];let placementCalls=0,rebuilds=0;
  await assert.rejects(workerInterference([{id:'a',document},{id:'b',document:structuredClone(document)}],
    async()=>{rebuilds++;return {run:{ok:true,finalShape:{shape:'source'},results:[]}};},()=>{}, {
      compile:source=>({ok:true,document:source,features:[]}),
      place:async()=>{placementCalls++;assert.equal(released.length,0,'source is live during placement');
        if(placementCalls===2)throw new Error('Broken placement');return {shape:'placed'};},
      release:run=>released.push(run.finalShape.shape),dispose:body=>disposed.push(body),
      detect:()=>{throw new Error('detection must not run after a failed placement');},
    }),/Broken placement/);
  assert.equal(rebuilds,1);
  assert.equal(released.length,1);
  assert.equal(disposed.length,1);
});

test('native worker returns exact overlapping volume and transformed nonintersection as plain pair reports',async()=>{
  const execute=createCadWorkerExecutor();
  const document=createPartDocument({metadata:{authoringSystem:'parametric-v1'}});
  createFeatureDefinition(document,'box',{id:'box',name:'Box',params:{x:0,y:0,z:0,w:1,h:1,d:1}});
  const identity=[1,0,0,0,1,0,0,0,1];
  const components=[{id:'a',label:'A',document,placement:{matrix:identity,translation:{x:0,y:0,z:0}}},{id:'b',label:'B',document,placement:{matrix:identity,translation:{x:.5,y:0,z:0}}}];
  const progress=[];const hits=await execute({kind:'interference',components},p=>progress.push(p));
  assert.equal(hits.length,1);assert.equal(hits[0].exact,true);assert.ok(Math.abs(hits[0].volume-.5)<1e-8);
  assert.ok(progress.some(p=>p.stage==='intersection' && p.a==='a' && p.b==='b'));
  assert.equal(hits[0].brep,undefined,'native handles must not cross the UI boundary');
  components[1].placement.translation.x=2;
  assert.deepEqual(await execute({kind:'interference',components}),[]);
});


test('assembly STEP places every exact leaf body, writes one compound and releases every handle',async()=>{
  const {workerAssemblyStep}=await import('../js/core/worker_interference.js');
  const released=[],disposed=[],order=[];let count=0;
  const result=await workerAssemblyStep([{id:'a',label:'A',document:{}},{id:'b',label:'B',document:{}}],async()=>({run:{ok:true,finalShape:{shape:true}}}),p=>order.push(p.stage),{
    compile:()=>({ok:true,document:{},features:[]}),place:async()=>({shape:'placed'+(++count)}),release:r=>released.push(r),
    validate:async()=>{},compound:async parts=>({shape:'compound',parts}),exportStep:async (body,name,limit)=>{assert.equal(body.parts.length,2);assert.equal(limit.maxToleranceCm,.005,'assembly export relaxes the tolerance gate to .005 cm');return new Uint8Array([1,2,3]);},dispose:r=>disposed.push(r),
  });
  assert.deepEqual([...result.bytes],[1,2,3]);assert.equal(result.bodies,2);
  assert.equal(released.length,2);assert.equal(disposed.length,3,'both placed bodies and the compound are released');
  assert.ok(order.includes('export'));
  await assert.rejects(workerAssemblyStep([{id:'x'}],async()=>({}),()=>{},{}),/exact feature-built body/,'a component without an exact body must not silently vanish from the file');
});

test('assembly STEP names the component whose body fails export validation',async()=>{
  const {workerAssemblyStep}=await import('../js/core/worker_interference.js');
  await assert.rejects(workerAssemblyStep([{id:'a',label:'Housing',document:{}}],async()=>({run:{ok:true,finalShape:{shape:true}}}),()=>{},{
    compile:()=>({ok:true,document:{},features:[]}),place:async()=>({shape:'p'}),release:()=>{},dispose:()=>{},
    validate:async()=>{throw new Error('Export blocked: body tolerance exceeds 0.001 cm (actual 0.0011 cm)');},
  }),/^Error: Housing: Export blocked: body tolerance exceeds 0\.001 cm \(actual 0\.0011 cm\)/);
});

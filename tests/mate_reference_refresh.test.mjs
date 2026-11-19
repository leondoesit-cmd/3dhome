import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=modelerSource();
const body=source.slice(source.indexOf('async function refreshComponentMateReferences('),source.indexOf('\nfunction assemblyMateInspector()',source.indexOf('async function refreshComponentMateReferences(')));
function setup({rebuild=async()=>({ok:true,results:new Map()}),leaves}={}){
  const doc={metadata:{authoringSystem:'parametric-v1'},features:[{id:'final'}],exactTopologyCache:{old:{topology:[]}},parts:[{id:1}]};
  const holder={id:8,def:doc},E={assembly:{components:[holder]}},log={released:0,published:0,captured:0,solved:0,refreshed:0,messages:[]};
  const pending=new WeakMap(),memo=new WeakMap([[doc,{old:true}]]);
  const run=new Function('E','mateReferenceRefreshes','mateTopologyMemo','componentTopology','componentDef','interferenceDocument','refreshSelection','compileKernelFeatureTree','regenerateFeatures','flash','rebuildFailureMessage','captureExactTopology','publishExactBodies','activeParts','cloneData','shapeToMeshData','releaseRegeneration','solveAssembly','refreshAll',body+';return refreshComponentMateReferences;')(E,pending,memo,(h,cb)=>(leaves || [h]).flatMap(cb),h=>h.def,d=>({...d,parts:[],exactTopologyCache:undefined}),()=>{},d=>({ok:true,document:d,features:d.features}),rebuild,m=>log.messages.push(m),()=>"Native rebuild failed",()=>{log.captured++;return {final:{topology:[{kind:'face',persistentId:'native-face'}]}};},async(parts,native,d,mesh,current)=>{assert.equal(current(),true);log.published++;},d=>d.parts,v=>structuredClone(v),()=>{throw new Error('mesh-only refresh must not tessellate locally');},()=>{log.released++;},()=>{log.solved++;},()=>{log.refreshed++;});
  return {run,holder,doc,E,log,pending,memo};
}
test('exact mate refresh publishes verified cache only after successful native run and clears pending state',async()=>{
  const q=setup();await q.run(q.holder);
  assert.equal(q.doc.exactTopologyCache.final.topology[0].persistentId,'native-face');
  assert.equal(q.log.captured,1);assert.equal(q.log.published,1);assert.equal(q.log.released,1);
  assert.equal(q.log.solved,1);assert.equal(q.log.refreshed,1);
  assert.equal(q.pending.has(q.holder),false);assert.equal(q.memo.has(q.doc),false);
});
test('failed native mate refresh never replaces saved cache with unverified geometry',async()=>{
  const q=setup({rebuild:async()=>({ok:false,issues:[{severity:'error'}]})}),before=q.doc.exactTopologyCache;
  await q.run(q.holder);assert.equal(q.doc.exactTopologyCache,before);
  assert.equal(q.log.captured,0);assert.equal(q.log.published,0);assert.equal(q.log.released,1);
  assert.equal(q.log.solved,0);assert.equal(q.log.refreshed,0);
  assert.ok(q.log.messages.includes('Native rebuild failed'));
});
test('a switched assembly or in-place authoring edit discards a delayed mate reference result',async()=>{
  for(const change of [q=>q.E.assembly={components:[]},q=>q.doc.features.push({id:'new-feature'})]){
    let finish;const q=setup({rebuild:()=>new Promise(resolve=>{finish=resolve;})}),before=q.doc.exactTopologyCache;
    const running=q.run(q.holder);change(q);finish({ok:true,results:new Map()});await running;
    assert.equal(q.doc.exactTopologyCache,before);assert.equal(q.log.captured,0);assert.equal(q.log.released,1);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {meshDataBounds} from '../js/core/kernel_body.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fixture(regenerate){
  const part={id:'spring-body',featureId:'sweep'},component={id:'spring',def:{parts:[part],features:[{id:'sweep'}]}},E={assembly:{components:[component]}};
  const calls={native:0,releases:[],refresh:0,solve:0,fit:0,options:[],flashes:[]};
  const publish=new Function('cutTargetFeatureId','meshDataBounds',sourceFunctionText(source,'publishExactBodies')+';return publishExactBodies;')(part=>part.featureId,meshDataBounds);
  const fn=new Function('E','configuredComponentBuilds','compileKernelFeatureTree','flash','regenerateFeatures','synchronizeExtrusionProjections','captureExactTopology','publishExactBodies','activeParts','cloneData','shapeToMeshData','invalidateInterference','solveAssembly','refreshAll','fitPreview','rebuildFailureMessage','releaseRegeneration',sourceFunctionText(source,'refreshConfiguredComponent')+';return refreshConfiguredComponent;')
    (E,new WeakMap(),doc=>({ok:true,document:doc,features:doc.features}),text=>calls.flashes.push(text),async(doc,options)=>{calls.options.push(options);return regenerate(doc,options);},()=>{},()=>({verified:true}),publish,doc=>doc.parts,structuredClone,async()=>{calls.native++;return {positions:[1,2,3,4,5,6,7,8,9]};},()=>{},()=>calls.solve++,()=>calls.refresh++,()=>calls.fit++,()=> 'Failed configuration',run=>calls.releases.push(run));
  return {E,part,component,calls,fn};
}
const runFor=body=>({ok:true,issues:[],results:new Map([['sweep',body]])});

test('component configuration requests verified worker meshes without restoring native shapes on the UI',async()=>{
  const mesh={positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1],colors:[1,1,1]},topology=[{persistentId:'sweep:face:1'}];
  const run=runFor({verifiedSerializedExact:true,workerMeshData:mesh,topology});
  const f=fixture(async()=>run);await f.fn(f.component);
  assert.equal(f.calls.options[0].restoreMode,'mesh');
  assert.equal(f.calls.native,0);assert.deepEqual(f.part.meshData.positions,mesh.positions);
  assert.notEqual(f.part.meshData.positions,mesh.positions,'UI does not mutate worker result buffers');
  assert.deepEqual(f.part.meshData.topology,topology);
  assert.ok(!('normals' in f.part.meshData));assert.ok(!('colors' in f.part.meshData));
  assert.equal(f.part.exactPending,false);assert.equal(f.part.exactError,null);
  assert.equal(f.calls.solve,1);assert.equal(f.calls.refresh,1);assert.equal(f.calls.fit,1);
  assert.deepEqual(f.calls.releases,[run]);
});

test('component configuration retains native fallback when workers are unavailable',async()=>{
  const run=runFor({shape:{native:true},topology:[]}),f=fixture(async()=>run);
  await f.fn(f.component);assert.equal(f.calls.native,1);assert.equal(f.part.meshData.positions.length,9);
  assert.deepEqual(f.calls.releases,[run]);
});

test('an overtaken configuration result never overwrites the newer mesh and is released',async()=>{
  let completeFirst;let count=0;
  const old=runFor({verifiedSerializedExact:true,workerMeshData:{positions:[1,1,1]},topology:[]}),latest=runFor({verifiedSerializedExact:true,workerMeshData:{positions:[2,2,2]},topology:[]});
  const f=fixture(async()=>++count===1?new Promise(resolve=>{completeFirst=resolve;}):latest);
  const first=f.fn(f.component);await f.fn(f.component);completeFirst(old);await first;
  assert.deepEqual(f.part.meshData.positions,[2,2,2]);assert.equal(f.calls.refresh,1);
  assert.deepEqual(f.calls.releases,[latest,old]);
});

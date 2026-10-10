import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ensureParametricDocument,analyzeParametricHistory,dependentTargetIds,activeHistoryTargetIds} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {sketchDependencies,sketchFeatureOwners} from '../js/core/dependency_graph.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {captureExactTopology} from '../js/core/exact_topology_cache.js';
import {interferenceDocument} from '../js/core/worker_interference.js';
import {verifiedFinalTopology} from '../js/core/exact_topology_cache.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/housing_lowered_tool_source.json',import.meta.url),'utf8')).document;
const clone=x=>structuredClone(x);
test('actual Housing aliases validate history without changing native cutter-stage addresses',()=>{
 const d=clone(fixture),before=JSON.stringify(d),compiled=compileKernelFeatureTree(d);
 assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));assert.equal(JSON.stringify(d),before);
 for(const id of ['sk_4tzdy','sk_1f6ek','sk_1bg4p']){
  const s=d.sketches.find(s=>s.id===id);
  for(const owner of sketchDependencies(s,d).filter(id=>id.endsWith(':tool'))){
   assert.ok(compiled.features.some(f=>f.id===owner));assert.ok(sketchFeatureOwners(s,d).includes(owner));
   assert.ok(dependentTargetIds(d,[owner.slice(0,-5)]).has(id));
  }
 }
 const cold=compileKernelFeatureTree(JSON.parse(before));assert.deepEqual(cold.features,compiled.features);
});
test('non-emitted, future, suppressed and rolled-back stages remain invalid/unavailable',()=>{
 for(const params of [{mergeResult:false},{operation:'new-body'}]){
  const d=clone(fixture);Object.assign(d.features.find(f=>f.id==='feature_mukdmi0j_4').params,params);
  assert.ok(analyzeParametricHistory(d).issues.some(i=>i.code==='missing-sketch-source'&&i.sketchId==='sk_1f6ek'));
 }
 const d=clone(fixture),producer=d.history.find(h=>h.targetId==='feature_mukdmi0j_4'),consumer=d.history.find(h=>h.targetId==='sk_1f6ek');
 producer.suppressed=true;assert.ok(analyzeParametricHistory(d,{normalize:false}).issues.some(i=>i.code==='suppressed-sketch-source'));
 assert.equal(activeHistoryTargetIds(d).has(consumer.targetId),false);
 producer.suppressed=false;d.history.splice(d.history.indexOf(producer),1);d.history.push(producer);
 assert.ok(analyzeParametricHistory(d,{normalize:false}).issues.some(i=>i.code==='future-sketch-source'));
 const bad=clone(fixture);bad.sketches.find(s=>s.id==='sk_1bg4p').support.ownerFeatureId='feature_mukla4fv_1:tool:invented';
 assert.ok(analyzeParametricHistory(bad).issues.some(i=>i.code==='missing-sketch-source'));
});
test('actual Housing producer prefix regenerates native proof and rejects changed source stamps',async()=>{
 const d=clone(fixture),last=d.history.findIndex(h=>h.targetId==='feature_mukdmi0j_4');
 d.history=d.history.slice(0,last+1);const active=new Set(d.history.map(h=>h.targetId));
 d.features=d.features.filter(f=>active.has(f.id));d.sketches=d.sketches.filter(s=>active.has(s.id));
 const before=JSON.stringify(d),compiled=compileKernelFeatureTree(d);
 assert.equal(verifiedFinalTopology(d,compiled.features).length,0);
 const native=compileKernelFeatureTree(interferenceDocument(d));
 const run=await regenerateFeatures({...native.document,features:native.features},{onProgress:p=>console.log('Housing prefix native:',p.name,p.featureId)});
 let proof;try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(run.finalShape?.shape);proof=captureExactTopology(d,native.features,run);}finally{releaseRegeneration(run);}
 assert.equal(JSON.stringify(d),before);
 d.exactTopologyCache=proof;assert.ok(verifiedFinalTopology(d,compiled.features).length>0);
 d.features[0].params.depth+=0.01;assert.equal(verifiedFinalTopology(d,compileKernelFeatureTree(d).features).length,0);
});

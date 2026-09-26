import test from 'node:test';
import assert from 'node:assert/strict';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {rebuildDefinition} from '../js/core/rebuild.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties,validateBrepForExport} from '../js/cad_kernel.js';

test('circular feature pattern repeats only removed material and supports count edits',async()=>{
 for(const count of [4,8]){
  const document={sketches:[{id:"sketch",plane:"front",points:[],entities:[],constraints:[]}],features:[
   {id:'base',type:'cylinder',params:{axis:'z',r:2,h:1}},
   {id:'seed',type:'extrudeCut',inputs:['base'],references:{features:['base'],sketches:['sketch']},params:{endCondition:'blind',axis:'z',depth:2,offset:-.5,points:[{u:-.1,v:1.5},{u:.1,v:1.5},{u:.1,v:2.2},{u:-.1,v:2.2}]}},
   {id:'pattern',type:'pattern',inputs:['seed'],references:{features:['seed']},params:{scope:'feature',seedFeatureId:'seed',mode:'circular',axis:'z',angle:360,equalSpacing:true,count}},
  ]};
  const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
   assert.equal(run.ok,true,JSON.stringify(run.issues));
   const base=await shapeMassProperties(run.results.get('base')),seed=await shapeMassProperties(run.results.get('seed')),result=await shapeMassProperties(run.results.get('pattern'));
   assert.ok(Math.abs(result.volume-(base.volume-count*(base.volume-seed.volume)))<1e-6);
   assert.ok(Math.abs(result.bounds.max.z-1)<1e-6);
   await validateBrepForExport(run.results.get('pattern'));
  }finally{releaseRegeneration(run);}
 }
});

test('overlapping radial cut instances all remove material from one exact body',async()=>{
 const document={sketches:[{id:'s',plane:'front',points:[],entities:[],constraints:[]}],features:[
  {id:'base',type:'cylinder',params:{axis:'z',r:2,h:1}},
  {id:'seed',type:'extrudeCut',inputs:['base'],references:{features:['base'],sketches:['s']},params:{endCondition:'blind',axis:'z',depth:.5,offset:.5,points:[{u:0,v:-.1},{u:2.2,v:-.1},{u:2.2,v:.1},{u:0,v:.1}]}},
  {id:'pattern',type:'pattern',inputs:['seed'],references:{features:['seed']},params:{scope:'feature',seedFeatureId:'seed',mode:'circular',axis:'z',angle:360,equalSpacing:true,count:4}},
 ]};
 const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const cuts=compiled.features.filter(item=>item.type==='subtract' && item.id.startsWith('pattern:'));
 assert.equal(cuts.length,3,'each additional cutter has its own Boolean step');
 const analytic=rebuildDefinition({...compiled.document,features:compiled.features});
 assert.equal(analytic.ok,true,JSON.stringify(analytic.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const base=await shapeMassProperties(run.results.get('base'));
  const seed=await shapeMassProperties(run.results.get('seed'));
  const result=await shapeMassProperties(run.results.get('pattern'));
  const seedRemoval=base.volume-seed.volume;
  assert.ok(base.volume-result.volume>seedRemoval*3,'all four radial arms are removed');
  assert.ok(base.volume-result.volume<seedRemoval*4,'overlapping centres are removed only once');
  await validateBrepForExport(run.results.get('pattern'));
 }finally{releaseRegeneration(run);}
});

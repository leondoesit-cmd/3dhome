import test from 'node:test';
import assert from 'node:assert/strict';
import { rebindReplacedSketchProfiles } from '../js/core/sketch_profile_rebind.js';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { regenerateFeatures, releaseRegeneration } from '../js/cad_feature_tree.js';
import { shapeMassProperties } from '../js/cad_kernel.js';

const circle = (id, x, y, r) => ({ id, type:'circle', c:id+':c', r, construction:false });
const sketch = entities => ({id:'s',plane:'front',offset:0,
  points:entities.map(entity => ({id:entity.c,x:entity.x ?? 0,y:entity.y ?? 1.5})),
  entities:entities.map(({x,y,...entity}) => entity),constraints:[]});

function seededCut() {
  return {id:'replaced-seed',kind:'part',sketches:[sketch([{...circle('new',0,1.5,.2),x:0,y:1.5}])],features:[
    {id:'base',type:'cylinder',params:{axis:'z',r:2,h:1}},
    {id:'seed',type:'extrudeCut',inputs:['base'],references:{features:['base'],sketches:['s'],profileEntityIds:['deleted']},
      params:{sketchId:'s',profileEntityIds:['deleted'],endCondition:'blind',axis:'z',depth:2,offset:-.5}},
    {id:'pattern',type:'pattern',inputs:['seed'],references:{features:['seed']},
      params:{scope:'feature',seedFeatureId:'seed',mode:'circular',axis:'z',angle:360,equalSpacing:true,count:4}},
  ]};
}

async function exact(document) {
  const compiled=compileKernelFeatureTree(document);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  return regenerateFeatures({...compiled.document,features:compiled.features});
}

test('a replaced single-loop SeedCut rebinds both feature records and its downstream pattern rebuilds',async()=>{
  const document=seededCut();
  let run=await exact(document);
  try {assert.equal(run.ok,false);assert.ok(run.issues.some(issue=>String(issue.message).includes('Sketch profile is missing')));}
  finally {releaseRegeneration(run);}
  const repairs=rebindReplacedSketchProfiles(document,'s');
  assert.deepEqual(repairs.map(repair=>repair.newEntityIds),[['new']]);
  assert.deepEqual(document.features[1].params.profileEntityIds,['new']);
  assert.deepEqual(document.features[1].references.profileEntityIds,['new']);
  assert.deepEqual(rebindReplacedSketchProfiles(document,'s'),[],'a second save is stable');
  run=await exact(document);
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const base=await shapeMassProperties(run.results.get('base'));
    const patterned=await shapeMassProperties(run.results.get('pattern'));
    assert.ok(patterned.volume<base.volume,'the patterned cutter removes material');
  } finally {releaseRegeneration(run);}
});

test('ambiguous replacement sketches keep the old reference and report the broken profile',()=>{
  const document=seededCut();
  document.sketches[0]=sketch([{...circle('a',0,1.5,.2),x:0,y:1.5},{...circle('b',0,-1.5,.2),x:0,y:-1.5}]);
  assert.deepEqual(rebindReplacedSketchProfiles(document,'s'),[]);
  assert.deepEqual(document.features[1].params.profileEntityIds,['deleted']);
});

test('a replacement loop already claimed by another feature is not stolen',()=>{
  const document=seededCut();
  document.features.push({id:'other',type:'extrude',params:{sketchId:'s',profileEntityIds:['new']}});
  assert.deepEqual(rebindReplacedSketchProfiles(document,'s'),[]);
});

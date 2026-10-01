import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartDocument, createFeatureDefinition } from '../js/core/parametric_document.js';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { regenerateFeatures, releaseRegeneration } from '../js/cad_feature_tree.js';
import { shapeMassProperties, validateBrepForExport } from '../js/cad_kernel.js';

const inch = 2.54;
function addProfile(document, id, points) {
  document.sketches.push({id, plane:'side', referenceId:'plane:right', offset:0,
    points:points.map(([x,y],i)=>({id:id+'p'+i,x:x*inch,y:y*inch})),
    entities:points.map((_,i)=>({id:id+'e'+i,type:'line',a:id+'p'+i,b:id+'p'+((i+1)%points.length)})),
    constraints:[]});
}
function wedgeDocument() {
  const document=createPartDocument({name:'Fresh Exercise 6.5 reverse-offset regression'});
  addProfile(document,'base',[[0,0],[-.5,0],[-.5,-.5],[1.5,-.5],[1.5,1.5],[.5,1.5]]);
  const base=createFeatureDefinition(document,'extrude',{references:{sketches:['base']},
    params:{sketchId:'base',profileEntityIds:document.sketches[0].entities.map(entity=>entity.id),axis:'x',depth:3*inch,offset:0,direction:'reverse',endCondition:'blind',from:0,to:-3*inch}});
  addProfile(document,'triangle',[[0,0],[1.5,1.5],[.5,1.5]]);
  const cut=createFeatureDefinition(document,'extrudeCut',{inputs:[base.id],references:{sketches:['triangle'],features:[base.id]},
    params:{sketchId:'triangle',profileEntityIds:document.sketches[1].entities.map(entity=>entity.id),axis:'x',depth:inch,offset:inch,direction:'reverse',endCondition:'blind',from:-inch,to:-2*inch}});
  return {document,base,cut};
}
function cutTool(document,cut) {
  const compiled=compileKernelFeatureTree(document);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  return compiled.features.find(feature=>feature.id===cut.id+':tool');
}

test('reverse start offset follows pull direction and driving depth overrides stored extent',()=>{
  const {document,cut}=wedgeDocument();
  assert.equal(cutTool(document,cut).params.from,-inch);
  assert.equal(cutTool(document,cut).params.to,-2*inch);
  cut.params.depth=1.1*inch;
  assert.equal(cutTool(document,cut).params.to,-2.1*inch);
  cut.params.direction='forward';
  assert.equal(cutTool(document,cut).params.from,inch);
  assert.equal(cutTool(document,cut).params.to,2.1*inch);
});

test('reverse mid-plane centers its extent behind the offset plane, measured extents stay stored',()=>{
  const {document,cut}=wedgeDocument();
  document.sketches.find(sketch=>sketch.id==='triangle').offset=4*inch;
  cut.params.symmetric=true;
  assert.equal(cutTool(document,cut).params.from,3.5*inch);
  assert.equal(cutTool(document,cut).params.to,2.5*inch);
  cut.params.endCondition='through-all';
  assert.equal(cutTool(document,cut).params.from,-inch);
  assert.equal(cutTool(document,cut).params.to,-2*inch);
});

test('Exercise 6.5 central reverse-offset wedge removes exact material and exports one solid',async()=>{
  const {document,base,cut}=wedgeDocument(),compiled=compileKernelFeatureTree(document);
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const original=await shapeMassProperties(run.results.get(base.id));
    const finished=await shapeMassProperties(run.results.get(cut.id));
    assert.ok(Math.abs(original.volume-8.625*inch**3)<1e-7);
    assert.ok(Math.abs(finished.volume-7.875*inch**3)<1e-7,
      'the one-inch center cut must remove .75 cubic inches, not miss the base');
    const exported=await validateBrepForExport(run.results.get(cut.id));
    assert.equal(exported.valid,true);
    assert.equal(exported.solidCount,1);
    assert.ok(Math.abs(exported.volumeCm3-129.048129)<1e-7);
  } finally {releaseRegeneration(run);}
});

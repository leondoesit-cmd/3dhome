import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bodiesFromResults} from '../js/core/rebuild.js';
import {predictedBodies} from '../js/core/tree_model.js';
import {rebuildParametricDocument} from '../js/core/parametric_rebuild.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {validateBrepForExport} from '../js/cad_kernel.js';

const built=document=>new Map(document.features.map(feature=>[feature.id,{type:feature.type,kind:'feature'}]));
for(const annotation of ['thread','knurl','helix'])test(annotation+' annotation does not consume or duplicate its support body',()=>{
  const document={features:[{id:'body',type:'extrude',inputs:[]},
    {id:'detail',type:annotation,params:{mode:'cosmetic'},inputs:['body']}]};
  assert.deepEqual(bodiesFromResults(document,built(document)).map(body=>body.featureId),['body']);
  assert.deepEqual(predictedBodies(document).map(body=>body.featureId),['body']);
  document.features.push({id:'groove',type:'extrudeCut',inputs:['body']});
  assert.deepEqual(bodiesFromResults(document,built(document)).map(body=>body.featureId),['groove']);
  assert.deepEqual(predictedBodies(document).map(body=>body.featureId),['groove']);
});

test('modeled thread remains a solid modifier with its own selectable body identity',()=>{
  const document={features:[{id:'body',type:'extrude',inputs:[]},
    {id:'detail',type:'thread',params:{mode:'modeled'},inputs:['body']}]};
  assert.deepEqual(bodiesFromResults(document,built(document)).map(body=>body.featureId),['detail']);
  assert.deepEqual(predictedBodies(document).map(body=>body.featureId),['detail']);
});

test('actual fresh browser trunnion with cosmetic thread and both retaining grooves is one native solid and one published body',async()=>{
  const document=JSON.parse(fs.readFileSync(new URL('./fixtures/clamp-trunnion-grooves-browser-recipe.json',import.meta.url),'utf8'));
  const compiled=compileKernelFeatureTree(document),lightweight=rebuildParametricDocument(document);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  assert.equal(lightweight.ok,true,JSON.stringify(lightweight.issues));
  assert.equal(lightweight.bodies.length,1);
  assert.equal(lightweight.bodies[0].featureId,document.features.at(-1).id);
  assert.equal(predictedBodies(document).length,1);
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const proof=await validateBrepForExport(run.finalShape);
    assert.equal(proof.valid,true);
    assert.equal(proof.solidCount,1);
    assert.ok(proof.volumeCm3>0);
  } finally {releaseRegeneration(run);}
});

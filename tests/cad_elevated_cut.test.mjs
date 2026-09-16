import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartDocument, createFeatureDefinition } from '../js/core/parametric_document.js';
import { compileKernelFeatureTree } from '../js/core/kernel_feature_adapter.js';
import { regenerateFeatures, releaseRegeneration } from '../js/cad_feature_tree.js';

test('an elevated countertop cut removes material at the sketch elevation after rebuilding', async () => {
  const doc = createPartDocument({name:'Countertop'});
  const plate = createFeatureDefinition(doc, 'box', {params:{x:-50,y:87.44,z:-30,w:100,h:4,d:60}});
  doc.sketches.push({id:'opening',plane:'top',offset:91.44,points:[],entities:[],constraints:[]});
  createFeatureDefinition(doc, 'extrudeCut', {
    inputs:[plate.id], references:{sketches:['opening'],features:[plate.id]},
    params:{sketchId:'opening',axis:'y',depth:24,offset:0,direction:'reverse',endCondition:'blind',
      from:91.44,to:67.44,points:[{u:-40,v:-25},{u:40,v:-25},{u:40,v:25},{u:-40,v:25}]},
  });
  const compiled = compileKernelFeatureTree(JSON.parse(JSON.stringify(doc)));
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run = await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const body=run.finalShape, props=new body.oc.GProp_GProps_1();
    try {
      body.oc.BRepGProp.VolumeProperties_1(body.shape,props,false,false,false);
      assert.ok(Math.abs(props.Mass()-8000)<1e-4, 'the 80 × 50 opening removes 16000 cm³ from the plate');
    } finally {props.delete();}
  } finally {releaseRegeneration(run);}
});

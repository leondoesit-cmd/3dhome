import test from 'node:test';import assert from 'node:assert/strict';
import {featureInputStage} from '../js/core/feature_input_stage.js';
test('suppressed finish editor queries its input rather than absent compiled feature',()=>{
 const compiled={ok:true,document:{sketches:['authored']},features:[{id:'base'},{id:'cut:tool'},{id:'cut'},{id:'later'}]};
 const stage=featureInputStage(compiled,{id:'suppressed-chamfer',suppressed:true,inputs:['cut']});
 assert.equal(stage.head,'cut');assert.deepEqual(stage.document.features.map(f=>f.id),['base','cut:tool','cut']);assert.deepEqual(stage.document.sketches,['authored']);
 assert.throws(()=>featureInputStage(compiled,{inputs:['missing']}),/input body/);
});
import {canonicalFeatureTopologyReferences} from '../js/core/feature_input_stage.js';
test('native tool ownership is translated to real authoring feature without changing topology address',()=>{
 const ref={ownerFeatureId:'cut5:tool',persistentId:'cut5:tool:edge:4',descriptor:{curve:'line'}};
 const normalized=canonicalFeatureTopologyReferences({features:[{id:'cut5'}]},[ref])[0];
 assert.equal(normalized.ownerFeatureId,'cut5');assert.equal(normalized.persistentId,ref.persistentId);assert.equal(ref.ownerFeatureId,'cut5:tool');assert.equal(normalized.descriptor,ref.descriptor);
});

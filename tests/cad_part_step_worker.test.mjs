import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';
test('part STEP is written inside native worker without BRep result restoration',async()=>{
 const document=createPartDocument();
 createFeatureDefinition(document,'box',{id:'base',params:{w:2,h:3,d:4}});
 const stages=[];
 const result=await createCadWorkerExecutor()({kind:'part-step',canonical:true,document,name:'part.step'},p=>stages.push(p.stage));
 assert.ok(result.bytes.byteLength>1000);
 assert.match(new TextDecoder().decode(result.bytes),/ISO-10303-21/);
 assert.equal(result.results,undefined);
 assert.ok(stages.includes('export'));
});


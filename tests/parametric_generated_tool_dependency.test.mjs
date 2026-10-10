import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureParametricDocument,analyzeParametricHistory} from '../js/core/parametric_document.js';

function document(owner='plate:tool'){
 const topology={type:'topology-reference',ownerFeatureId:owner,persistentId:`${owner}:face:end`,kind:'face',descriptor:{surface:'plane'}};
 return ensureParametricDocument({sketches:[{id:'profile',points:[],entities:[],constraints:[]},{id:'guide',points:[],entities:[],constraints:[]}],features:[
  {id:'base',type:'extrude',name:'Base',inputs:[],references:{sketches:['profile']},params:{sketchId:'profile',depth:1}},
  {id:'plate',type:'extrude',name:'Plate',inputs:['base'],references:{sketches:['profile']},params:{sketchId:'profile',depth:1}},
  {id:'wall',type:'extrude',name:'Wall',inputs:['plate'],references:{sketches:['guide'],features:['plate'],topology:[topology]},params:{sketchId:'guide',depth:1,endCondition:'up-to-face',endFace:topology}},
 ]});
}
test('generated native tool face retains its address while depending on the source authoring feature',()=>{
 const def=document(),ref=structuredClone(def.features[2].references.topology[0]);
 const run=analyzeParametricHistory(def);
 assert.equal(run.ok,true,JSON.stringify(run.issues));
 assert.deepEqual(def.features[2].references.topology[0],ref);
});
test('missing, future, suppressed and self tool owners still reject authoring history',()=>{
 const missing=document('absent:tool');
 assert.ok(analyzeParametricHistory(missing).issues.some(i=>i.code==='missing-feature-dependency'));
 const self=document('wall:tool');
 assert.ok(analyzeParametricHistory(self).issues.some(i=>i.code==='future-feature-dependency'));
 const future=document();
 const a=future.history.findIndex(h=>h.targetId==='plate'),b=future.history.findIndex(h=>h.targetId==='wall');
 [future.history[a],future.history[b]]=[future.history[b],future.history[a]];
 assert.ok(analyzeParametricHistory(future).issues.some(i=>i.code==='future-feature-dependency'));
 const suppressed=document();suppressed.features[1].suppressed=true;suppressed.history.find(h=>h.targetId==='plate').suppressed=true;
 assert.ok(analyzeParametricHistory(suppressed).issues.some(i=>i.code==='suppressed-feature-dependency'));
});

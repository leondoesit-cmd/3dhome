import test from 'node:test';
import assert from 'node:assert/strict';
import {removeHistoryNode} from '../js/core/parametric_document.js';
const descriptor={surface:'plane',origin:{x:0,y:.508,z:0},normal:{x:0,y:1,z:0},measure:20};
const ref={kind:'face',ownerFeatureId:'rim',persistentId:'rim:floor',descriptor};
function doc(){return {revision:0,features:[{id:'pocket',type:'extrudeCut',inputs:[]},{id:'rim',name:'Rim',type:'fillet',inputs:['pocket']},{id:'holes',name:'Holes',type:'extrudeCut',inputs:['rim'],references:{features:['rim']},params:{targetFeatureId:'rim'}},{id:'holder',type:'extrude',inputs:['holes']}],sketches:[],history:[{id:'hp',kind:'feature',targetId:'pocket'},{id:'hr',kind:'feature',targetId:'rim',name:'Rim'},{id:'hh',kind:'feature',targetId:'holes'},{id:'ho',kind:'feature',targetId:'holder'}],parts:[{id:'body',exactOperations:[{id:'rim'}],meshData:{positions:[1]}}]};}
const target={...ref,ownerFeatureId:'pocket',persistentId:'pocket:floor'};
const options={verifiedTopology:new Map([['pocket',[target]]])};
test('remove intermediate rim reconnects body and feature references and preserves downstream history on save',()=>{
 const d=doc();d.rollbackIndex=3;const before=structuredClone(d);
 const result=removeHistoryNode(d,'hr');assert.equal(result.ok,true);
 assert.deepEqual(d.features.find(f=>f.id==='holes').inputs,['pocket']);
 assert.deepEqual(d.features.find(f=>f.id==='holes').references.features,['pocket']);
 assert.equal(d.features.find(f=>f.id==='holes').params.targetFeatureId,'pocket');
 assert.deepEqual(d.features.find(f=>f.id==='holder').inputs,['holes']);
 assert.equal(d.rollbackIndex,2);assert.equal(d.parts[0].meshData,undefined);
 assert.deepEqual(JSON.parse(JSON.stringify(d)).history.map(e=>e.targetId),['pocket','holes','holder']);
 Object.assign(d,before);assert.equal(d.features[2].inputs[0],'rim','undo snapshot retains original chain');
});
test('only unique verified surviving topology is rebound, including shared sketch support',()=>{
 const d=doc();d.sketches=[{support:structuredClone(ref),circleCopies:[]}];d.features[2].params.support=structuredClone(ref);
 assert.equal(removeHistoryNode(d,'hr',options).ok,true);
 assert.equal(d.sketches[0].support.persistentId,'pocket:floor');assert.equal(d.features[1].params.support.ownerFeatureId,'pocket');
});
test('missing, ambiguous, opposite-normal and unverified geometry refuse atomically',()=>{
 for(const topology of [[],[target,{...target,persistentId:'duplicate'}],[{...target,descriptor:{...descriptor,normal:{x:0,y:-1,z:0}}}]]){
  const d=doc();d.sketches=[{support:structuredClone(ref)}];const before=structuredClone(d);
  assert.equal(removeHistoryNode(d,'hr',{verifiedTopology:new Map([['pocket',topology]])}).ok,false);assert.deepEqual(d,before);
 }
 const d=doc();d.sketches=[{support:structuredClone(ref)}];d.exactTopologyCache={pocket:{topology:[target]}};
 assert.equal(removeHistoryNode(d,'hr').ok,false,'unverified cache is never trusted');
});
test('feature pattern seeds and non-finishing operations remain protected',()=>{
 for(const change of [d=>d.features[2].type='pattern',d=>d.features[1].type='extrude',d=>d.features[1].inputs.push('other')]){
  const d=doc();change(d);const before=structuredClone(d);assert.equal(removeHistoryNode(d,'hr').ok,false);assert.deepEqual(d,before);
 }
});

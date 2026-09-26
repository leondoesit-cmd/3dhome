import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDocument,createSketchDefinition,createFeatureDefinition,setHistoryRollback,reconnectLaterBodyConsumers,recordSketchInHistory} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';

/* HOUSING in miniature: a body, then a Handle sweep merged onto it. The book
   authors the Thread with the bar above Handle (steps 420–451): its sketch and
   its sweep must go in there, and Handle must rebuild on the Thread. */
function housing(){
 const doc=createPartDocument();
 const profile=createSketchDefinition(doc,{id:'profile',referenceId:'plane:top',points:[{id:'c',x:0,y:0,fixed:true}],entities:[{id:'circle',type:'circle',c:'c',r:3,fixed:true}]});
 const body=createFeatureDefinition(doc,'extrude',{id:'body',references:{sketches:[profile.id]},params:{depth:1}});
 const handle=createFeatureDefinition(doc,'extrude',{id:'handle',inputs:[body.id],references:{sketches:[profile.id],features:[body.id]},params:{depth:2}});
 return {doc,body,handle};
}

test('a sketch created with the bar above Handle goes in at the bar, and the bar moves past it',()=>{
 const {doc,handle}=housing();
 setHistoryRollback(doc,doc.history.findIndex(e=>e.targetId===handle.id));
 const section=createSketchDefinition(doc,{id:'section',referenceId:'plane:top'});
 assert.deepEqual(doc.history.map(e=>e.targetId),['profile','body','section','handle']);
 assert.equal(doc.rollbackIndex,3);
 // a sketch recorded after the fact is placed the same way
 const late={id:'late',referenceId:'plane:top',points:[],entities:[],constraints:[]};doc.sketches.push(late);
 recordSketchInHistory(doc,late);
 assert.deepEqual(doc.history.map(e=>e.targetId),['profile','body','section','late','handle']);
});

test('a body feature inserted at the bar becomes what Handle builds on, and it survives a round trip',()=>{
 const {doc,body,handle}=housing();
 setHistoryRollback(doc,doc.history.findIndex(e=>e.targetId===handle.id));
 const thread=createFeatureDefinition(doc,'extrude',{id:'thread',inputs:[body.id],references:{sketches:['profile'],features:[body.id]},params:{depth:.5}});
 assert.deepEqual(doc.history.map(e=>e.targetId),['profile','body','thread','handle']);
 assert.deepEqual(handle.inputs,[thread.id]);
 assert.deepEqual(handle.references.features,[thread.id]);
 setHistoryRollback(doc,null);
 const compiled=compileKernelFeatureTree(JSON.parse(JSON.stringify(doc)));
 assert.ok(compiled.ok,JSON.stringify(compiled.issues));
});

test('a creator that sets inputs afterwards rechains explicitly; a new body never rechains',()=>{
 const {doc,body,handle}=housing();
 setHistoryRollback(doc,doc.history.findIndex(e=>e.targetId===handle.id));
 const sweep=createFeatureDefinition(doc,'extrude',{id:'late-inputs',references:{sketches:['profile']},params:{depth:.5}});
 assert.deepEqual(handle.inputs,[body.id],'nothing to rechain until the inputs are known');
 sweep.inputs=[body.id];sweep.references.features=[body.id];
 assert.deepEqual(reconnectLaterBodyConsumers(doc,sweep),[handle.id]);
 assert.deepEqual(handle.inputs,[sweep.id]);
 const separate=createFeatureDefinition(doc,'extrude',{id:'separate',inputs:[sweep.id],references:{sketches:['profile'],features:[sweep.id]},params:{depth:.5,operation:'new-body'}});
 assert.deepEqual(reconnectLaterBodyConsumers(doc,separate),[]);
 assert.deepEqual(handle.inputs,[sweep.id]);
});

test('with no bar set, new work is appended as before',()=>{
 const {doc}=housing();
 createSketchDefinition(doc,{id:'tail',referenceId:'plane:top'});
 assert.equal(doc.history.at(-1).targetId,'tail');
 assert.equal(doc.rollbackIndex==null,true);
});

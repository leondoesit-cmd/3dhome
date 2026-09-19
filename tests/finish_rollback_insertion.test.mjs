import test from 'node:test';
import assert from 'node:assert/strict';
import {createPartDocument,createSketchDefinition,createFeatureDefinition,setHistoryRollback,analyzeParametricHistory} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';

function setup(){
 const doc=createPartDocument();
 const sketch=createSketchDefinition(doc,{id:'profile',referenceId:'plane:top',points:[{id:'c',x:0,y:0,fixed:true}],entities:[{id:'circle',type:'circle',c:'c',r:3,fixed:true}]});
 const base=createFeatureDefinition(doc,'extrude',{id:'base',references:{sketches:[sketch.id]},params:{depth:1}});
 const cut=createFeatureDefinition(doc,'extrudeCut',{id:'cut',inputs:[base.id],references:{sketches:[sketch.id],features:[base.id]},params:{depth:.5,targetFeatureId:base.id}});
 const holder=createFeatureDefinition(doc,'extrude',{id:'holder',inputs:[cut.id],references:{sketches:[sketch.id],features:[cut.id]},params:{depth:1}});
 const pattern=createFeatureDefinition(doc,'pattern',{id:'pattern',inputs:[base.id],references:{features:[base.id]},params:{count:2}});
 return {doc,base,cut,holder,pattern};
}
test('finish at rollback is active immediately and feeds the downstream body after roll forward',()=>{
 const {doc,base,cut,holder,pattern}=setup();
 const index=doc.history.findIndex(entry=>entry.targetId===cut.id);setHistoryRollback(doc,index);
 const finish=createFeatureDefinition(doc,'fillet',{id:'finish',inputs:[base.id],references:{features:[base.id],topology:[{kind:'edge',ownerFeatureId:base.id,persistentId:'base:edge'}]},params:{radius:.1}});
 assert.deepEqual(doc.history.map(e=>e.targetId),['profile','base','finish','cut','holder','pattern']);
 assert.equal(doc.rollbackIndex,index+1);
 let compiled=compileKernelFeatureTree(doc);assert.ok(compiled.ok,JSON.stringify(compiled.issues));
 assert.equal(compiled.features.at(-1).id,finish.id);
 assert.deepEqual(cut.inputs,[finish.id]);assert.deepEqual(cut.references.features,[finish.id]);assert.equal(cut.params.targetFeatureId,finish.id);
 assert.deepEqual(holder.inputs,[cut.id]);assert.deepEqual(pattern.inputs,[base.id]);
 setHistoryRollback(doc,null);compiled=compileKernelFeatureTree(doc);
 assert.ok(analyzeParametricHistory(doc).ok);
 assert.equal(compiled.features.find(f=>f.id==='cut').inputs[0],finish.id);
 const restored=JSON.parse(JSON.stringify(doc));assert.equal(compileKernelFeatureTree(restored).features.find(f=>f.id==='cut').inputs[0],finish.id);
});
test('invalid rollback source leaves the document unchanged',()=>{
 const {doc,cut}=setup();setHistoryRollback(doc,1);const before=JSON.stringify(doc);
 assert.throws(()=>createFeatureDefinition(doc,'fillet',{inputs:[cut.id],references:{features:[cut.id],topology:[{kind:'edge',ownerFeatureId:cut.id,persistentId:'cut:edge'}]},params:{radius:.1}}),/active source body/);
 assert.equal(JSON.stringify(doc),before);
});

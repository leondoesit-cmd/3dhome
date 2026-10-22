import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';
import {setExtrudeFeatureOperation} from '../js/core/extrude_operation_edit.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const square=(a,b)=>[{u:a,v:a},{u:b,v:a},{u:b,v:b},{u:a,v:b}];
function fixture(){
 const document=createPartDocument({id:'operation-edit'});
 const base=createFeatureDefinition(document,'extrude',{id:'base',references:{sketches:['base-sketch']},params:{points:square(0,2),axis:'y',depth:1,from:0,to:1,endCondition:'blind'}});
 const cut=createFeatureDefinition(document,'extrudeCut',{id:'shared',inputs:[base.id],references:{sketches:['shared-sketch'],features:[base.id]},params:{points:square(.5,1.5),sketchId:'shared-sketch',axis:'y',depth:.7,offset:.8,from:.8,to:1.5,endCondition:'blind'}});
 const later=createFeatureDefinition(document,'extrudeCut',{id:'later',inputs:[cut.id],references:{sketches:['later-sketch'],features:[cut.id]},params:{points:square(.75,1.25),axis:'y',depth:.5,offset:1,from:1,to:1.5,endCondition:'blind'}});
 document.sketches=['base-sketch','shared-sketch','later-sketch'].map(id=>({id,plane:'top',offset:0,points:[],entities:[],constraints:[]}));
 document.parts=[{id:'body',featureId:base.id,kind:'ext',axis:'y',from:0,to:1,pts:square(0,2),holes:[],merges3d:[],cuts3d:[{featureId:cut.id,axis:'y',from:.8,to:1.5,loop:square(.5,1.5)},{featureId:later.id,axis:'y',from:1,to:1.5,loop:square(.75,1.25)}],meshData:{old:true}}];
 document.exactTopologyCache={old:true};return {document,cut,later};
}
async function volume(document){
 const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{assert.equal(run.ok,true,JSON.stringify(run.issues));return (await shapeMassProperties(run.finalShape)).volume;}
 finally{releaseRegeneration(run);}
}
test('cut to boss preserves ID, shared sketch, support references and downstream cuts through native cold rebuild and undo',async()=>{
 const {document,cut,later}=fixture();
 const baseCompiled=compileKernelFeatureTree({...document,features:[document.features[0]]});
 const baseRun=await regenerateFeatures({...baseCompiled.document,features:baseCompiled.features});
 try{const face=baseRun.finalShape.topology.find(entry=>entry.kind==='face');assert.ok(face);cut.references.topology=[{kind:'face',ownerFeatureId:'base',persistentId:face.persistentId}];}
 finally{releaseRegeneration(baseRun);}
 const before=structuredClone(document),refs=structuredClone(cut.references),history=structuredClone(document.history);
 assert.ok(Math.abs(await volume(document)-3.8)<1e-7);
 setExtrudeFeatureOperation(document,cut.id,'add');
 assert.equal(cut.type,'extrude');assert.equal(cut.id,'shared');assert.equal(cut.params.operation,'add');
 assert.deepEqual(cut.references,refs);assert.deepEqual(later.inputs,['shared']);assert.deepEqual(document.sketches,before.sketches);
 assert.deepEqual(document.history.map(e=>[e.id,e.targetId]),history.map(e=>[e.id,e.targetId]));
 const host=document.parts[0];assert.deepEqual(host.cuts3d.map(r=>r.featureId),['later']);assert.deepEqual(host.merges3d.map(r=>r.featureId),['shared']);
 assert.equal(host.meshData,undefined);assert.equal(document.exactTopologyCache,undefined);
 const cold=JSON.parse(JSON.stringify(document));assert.ok(Math.abs(await volume(cold)-4.375)<1e-7,'downstream cut still removes from the converted boss');
 setExtrudeFeatureOperation(cold,'shared','subtract');assert.deepEqual(cold.parts[0].merges3d,[]);assert.deepEqual(cold.parts[0].cuts3d.map(r=>r.featureId).sort(),['later','shared']);
 assert.ok(Math.abs(await volume(cold)-3.8)<1e-7);
 assert.ok(Math.abs(await volume(before)-3.8)<1e-7,'the complete pre-edit Undo snapshot still rebuilds');
});
test('tagged profile-hole cut converts without leaving a hidden subtractive recipe',()=>{
 const {document,cut}=fixture(),host=document.parts[0];
 host.holes=[{featureId:cut.id,points:square(.5,1.5)},square(.1,.2)];host.cuts3d=host.cuts3d.filter(r=>r.featureId!==cut.id);
 setExtrudeFeatureOperation(document,cut.id,'add');assert.equal(host.holes.length,1);assert.equal(host.holes[0].featureId,undefined);assert.equal(host.merges3d[0].featureId,cut.id);
});
test('standalone/new-body/invalid-parameter conversions reject without any document mutation',()=>{
 const {document}=fixture();let before=JSON.stringify(document);
 assert.throws(()=>setExtrudeFeatureOperation(document,'base','subtract'),/existing target body/);assert.equal(JSON.stringify(document),before);
 assert.throws(()=>setExtrudeFeatureOperation(document,'shared','add',{params:{depth:-1}}));assert.equal(JSON.stringify(document),before);
 setExtrudeFeatureOperation(document,'shared','add');document.features[1].params.mergeResult=false;before=JSON.stringify(document);
 assert.throws(()=>setExtrudeFeatureOperation(document,'shared','subtract'),/existing target body/);assert.equal(JSON.stringify(document),before);
});
test('existing feature editor applies a changed Boolean only on Update and rebuilds from changed type',()=>{
 const source=modelerSource(),body=sourceFunctionText(source,'openFeatureEditor');
 assert.match(body,/editOperationSelect=featureField\(host,[\s\S]*fcFldOperation/);
 assert.match(body,/setExtrudeFeatureOperation\(E\.def,feature\.id,editOperation/);
 assert.match(body,/before\.type!==feature\.type/);
 assert.match(body,/next\.params\.operation==="subtract"\)next\.params\.operation=feature\.params\.operation/);
 assert.equal((body.match(/setExtrudeFeatureOperation\(/g)||[]).length,1,'operation conversion occurs only inside Update, never live input');
});

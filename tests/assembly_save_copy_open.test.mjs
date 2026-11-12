import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText, withSetters} from './helpers/source_function.mjs';
const source=modelerSource();
const clone=x=>structuredClone(x);
function fixture({form,save}={}){
 const assembly={key:'original',id:'original',name:'FLASHLIGHT',components:[{id:'occurrence',modelKey:'part',transform:{x:1},def:{key:'part',features:[{id:'sweep',params:{path:[1,2]}}],history:[{targetId:'sweep'}],parts:[{id:15,meshData:{positions:[1,2,3],topology:[{persistentId:'sweep:face'}]}}]}}],mates:[{id:'mate',a:{componentId:'occurrence',reference:{persistentId:'sweep:face'}},aligned:true}],explodedViews:[{id:'explode',offsets:{occurrence:{y:5}}}],drawing:{views:[{id:'iso'}],dims:[{id:'dim',refs:[{pid:'sweep:face'}]}]},history:[{id:'assembly-step'}]};
 const E={docType:'assembly',assembly:clone(assembly),sel:'old'},library=[clone(assembly)],calls={saved:[],open:0,clean:0,reports:[],flashes:[],history:7},S={idc:20};
 const dependencies={E,S,confirmDiscardDocument:async()=>true,currentHistoryNode:()=>calls.history,loadAssemblies:()=>clone(library),flash:m=>calls.flashes.push(m),sheetForm:async()=>form?form({E,library,calls}):{name:'Independent FLASHLIGHT'},t:x=>x,cloneData:clone,uid:()=>99,
 saveAssemblies:async(copy,options)=>{calls.saved.push({copy:clone(copy),options});if(save)return save({copy,options,E,library,calls});library.push(clone(copy));return true;},report:(...args)=>calls.reports.push(args),lastAssemblySaveConflict:false,
 refreshLib:()=>{},tf:(x,{name})=>name,abandonDocumentExactWork:()=>calls.open++,closeEvalCard:()=>{},compactAssemblyTopologySnapshots:clone,resolvedLibraryAssembly:assembly=>assembly,nextDocumentNumericId:()=>25,invalidateInterference:()=>{},H:{clear(){return this;},seed(){}},markDocumentClean:()=>calls.clean++,reconcileModelerDraft:()=>{},syncHead:()=>{},refreshAll:()=>{},fitPreview:()=>{}};
 const keys=Object.keys(dependencies),fn=new Function(...keys,withSetters(sourceFunctionText(source,'saveAssemblyCopyAndOpen'))+';return saveAssemblyCopyAndOpen;')(...keys.map(k=>dependencies[k]));return {assembly,E,library,calls,fn,S};
}
test('ordinary assembly copy uses expected-null new identity and preserves nested native/mates/drawing/history',async()=>{
 const f=fixture(),original=JSON.stringify(f.assembly);assert.equal(await f.fn(f.assembly),true);const saved=f.calls.saved[0];assert.deepEqual(saved.options,{expected:null});assert.notEqual(saved.copy.key,'original');assert.match(saved.copy.key,/^asm_/);assert.equal(saved.copy.id,saved.copy.key);
 const wanted={...clone(f.assembly),key:saved.copy.key,id:saved.copy.key,name:'Independent FLASHLIGHT'};assert.deepEqual(saved.copy,wanted);assert.equal(JSON.stringify(f.assembly),original);assert.deepEqual(f.library[0],f.assembly);assert.deepEqual(f.E.assembly,wanted);assert.equal(f.calls.clean,1);assert.equal(f.calls.open,1);
 f.E.assembly.components[0].def.parts[0].meshData.positions[0]=999;assert.equal(f.library[1].components[0].def.parts[0].meshData.positions[0],1);
});
test('cancel, blank name, changed saved source and changed history do not save/open',async()=>{
 for(const form of [()=>null,()=>({name:'  '}),({library})=>{library[0].name='changed';return {name:'copy'};},({calls})=>{calls.history++;return {name:'copy'};}]){
  const f=fixture({form});assert.equal(await f.fn(f.assembly),false);assert.equal(f.calls.saved.length,0);assert.equal(f.calls.open,0);assert.equal(f.calls.clean,0);
 }
});
test('failed optimistic insert preserves current/source document and shows failure',async()=>{
 const f=fixture({save:()=>false}),before=JSON.stringify(f.E);assert.equal(await f.fn(f.assembly),false);assert.equal(JSON.stringify(f.E),before);assert.equal(f.calls.clean,0);assert.equal(f.calls.open,0);assert.equal(f.calls.reports.length,1);assert.deepEqual(f.calls.saved[0].options,{expected:null});
});
test('switch while persistence is pending keeps new active document; independent copy remains saved',async()=>{
 const f=fixture({save:({copy,E,library})=>{library.push(clone(copy));E.assembly={key:'new-active'};return true;}});assert.equal(await f.fn(f.assembly),true);assert.equal(f.E.assembly.key,'new-active');assert.equal(f.calls.open,0);assert.equal(f.calls.clean,0);assert.equal(f.library.length,2);
});

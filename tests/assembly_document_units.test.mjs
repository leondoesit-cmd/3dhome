import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText, withSetters} from './helpers/source_function.mjs';
import {documentLengthUnit} from '../js/core/document_length_units.js';
import {compactAssemblyTopologySnapshots} from '../js/core/project_topology_budget.js';
const source=modelerSource();

function fixture(){
  const E={docType:'assembly',assembly:{key:'shock',name:'SHOCK',components:[],mates:[]},def:{name:'Inactive part',context:{units:{length:'in'}}}};
  const unit={value:'in'},fields={'#mdDocumentLengthUnit':unit,'#mdName':{},'#mdPrice':{closest:()=>({style:{}})},'#mdSave':{}};
  let undo=0,refresh=0,saved;
  const root={querySelector:key=>fields[key] || null};
  const script=withSetters(sourceFunctionText(source,'modelLengthUnit')+sourceFunctionText(source,'setModelLengthUnit')+sourceFunctionText(source,'syncHead'));
  const actions=new Function('E','root','documentLengthUnit','documentDescription','pushUndo','refreshAll','t','fin','flabel',script+';return {read:modelLengthUnit,set:setModelLengthUnit,sync:syncHead};')
    (E,root,documentLengthUnit,()=>'',()=>undo++,()=>refresh++,key=>key,Number.isFinite,null);
  const save=new Function('E','root','setDocumentDescription','newAssembly','applyAssemblyMates','cloneData','saveAssemblies','assemblyOpenBaseline','report','t','lastAssemblySaveConflict','refreshLib','flash','markDocumentClean','reconcileModelerDraft','updateTourProgress','const H={generation:1,editRevision:()=>1}, assemblySaveSession=doc=>doc, currentHistoryNode=()=>1, applyTrackedUpdates=()=>false, rejectFlexibleSpringPreview=()=>false;'+withSetters(sourceFunctionText(source,'saveAssemblyDocument'))+';return saveAssemblyDocument;')
    (E,{querySelector:key=>key==='#mdName'?{value:'SHOCK'}:{value:''}},()=>{},()=>E.assembly,()=>{},structuredClone,async record=>{saved=record;return true;},null,()=>{},key=>key,false,()=>{},()=>{},()=>{},()=>{},()=>{});
  return {E,unit,actions,save,get saved(){return saved;},get undo(){return undo;},get refresh(){return refresh;}};
}
test('assembly units are independent of inactive part settings and survive actual Save, library compaction and bundle roundtrip',async()=>{
  const f=fixture(),part=JSON.stringify(f.E.def);assert.equal(f.actions.read(),'cm');
  f.actions.sync();assert.equal(f.unit.value,'cm','legacy assembly never inherits inactive inches');
  assert.equal(f.actions.set('mm'),true);assert.equal(f.unit.value,'mm');
  assert.equal(f.E.assembly.context.units.length,'mm');assert.equal(JSON.stringify(f.E.def),part);
  await f.save();const bundle=JSON.parse(JSON.stringify({activeAssembly:compactAssemblyTopologySnapshots(f.saved)}));
  f.E.assembly=bundle.activeAssembly;f.E.def.context.units.length='ft';f.actions.sync();
  assert.equal(f.actions.read(),'mm');assert.equal(f.unit.value,'mm');assert.equal(f.undo,1);assert.equal(f.refresh,1);
});
test('editing part units in assembly context changes only the part and returning restores assembly units',()=>{
  const f=fixture();f.actions.set('mm');f.E.docType='part';f.actions.sync();assert.equal(f.unit.value,'in');
  f.actions.set('cm');assert.equal(f.E.def.context.units.length,'cm');assert.equal(f.E.assembly.context.units.length,'mm');
  f.E.docType='assembly';f.actions.sync();assert.equal(f.unit.value,'mm');
  assert.equal(f.actions.set('mm'),false);assert.equal(f.undo,2);
});

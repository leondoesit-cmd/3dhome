import {createReferenceResolver,trackLibraryOccurrence} from '../js/core/library_occurrence.js';
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {compactDocumentTopologySnapshots,compactAssemblyTopologySnapshots} from '../js/core/project_topology_budget.js';
import {subassemblyComponent} from '../js/core/assembly_structure.js';

const source=modelerSource();

test('assembly workflow checks library presence without traversing saved geometry',()=>{
  const unused={key:'saved'};
  Object.defineProperty(unused,'parts',{get(){throw new Error('workflow presence must not read saved geometry');},enumerable:true});
  const state=new Function('E','modelLibraryCache','loadLib','assemblyMateCount','brokenMateCount','documentDirty','resolveAssemblyWorkflow','countLabel','t',sourceFunctionText(source,'assemblyWorkflowState')+';return assemblyWorkflowState;')(
    {assembly:{components:[]}},[unused],()=>{throw new Error('whole library copy');},()=>0,()=>0,()=>false,input=>({phase:input.hasLibrary?'insert':'empty'}),()=>'',key=>key);
  assert.equal(state().phase,'insert');
});

test('component, plane and mate tree selections use presentation refresh without solving or rebuilding',()=>{
  const a={id:1},b={id:2},E={componentSel:[],topologySelection:[],mobileAddSelection:false};
  let selections=0;
  const handlers=new Function('E','refreshSelection','refreshAll','assemblyComponentForNode','assemblyComponentById','assemblyMatePair','planeMateReference',sourceFunctionText(source,'assemblyTreeHandlers')+';return assemblyTreeHandlers({});')(
    E,()=>selections++,()=>{throw new Error('selection must not rebuild GPU bodies or solve poses');},node=>node.targetId===1?a:b,id=>String(id)==='1'?a:b,()=>[a,b],(id,plane)=>({componentId:Number(id),persistentId:plane}));
  handlers.onSelect({kind:'component',targetId:1},{});
  assert.deepEqual(E.componentSel,[a]);
  handlers.onSelect({kind:'component',targetId:2},{ctrlKey:true});
  assert.deepEqual(E.componentSel,[a,b]);
  handlers.onSelect({kind:'component',targetId:1},{ctrlKey:true});
  assert.deepEqual(E.componentSel,[b]);
  handlers.onSelect({kind:'plane',id:'comp:1|plane|1|plane:front'},{});
  assert.deepEqual(E.topologySelection,[{componentId:1,persistentId:'plane:front'}]);
  handlers.onSelect({kind:'mate',id:'mate:one'},{});
  assert.deepEqual(E.componentSel,[a,b]);assert.equal(E.sel,b);
  assert.equal(selections,5);
});

for(const assembly of [false,true])test(`${assembly?'subassembly':'part'} insertion copies only the selected saved record`,()=>{
  const selected=assembly?{key:'selected',name:'Fresh assembly',components:[{id:10,def:{parts:[{id:'body'}]}}],mates:[]}:{key:'selected',name:'Fresh part',parts:[{id:'body',density:8}],features:[]};
  const unused={key:'other'};
  Object.defineProperty(unused,'parts',{get(){throw new Error('unselected saved geometry must not be traversed');},enumerable:true});
  const E={assembly:{key:'parent',components:[]}},S={idc:11};let refreshes=0;
  const insert=new Function('E','S','modelLibraryCache','assemblyLibraryCache','loadLib','loadAssemblies','nextDocumentNumericId','pushUndo','uid','cloneData','compactDocumentTopologySnapshots','compactAssemblyTopologySnapshots','subassemblyComponent','solveTopologyMates','invalidateInterference','refreshAll','fitPreview','t','containsAssembly','resolvedLibraryAssembly','trackLibraryOccurrence',sourceFunctionText(source,'insertAssemblyComponent')+';return insertAssemblyComponent;')(
    E,S,[unused,selected],[unused,selected],()=>{throw new Error('whole library copy');},()=>{throw new Error('whole assembly library copy');},()=>11,()=>{},()=>12,structuredClone,compactDocumentTopologySnapshots,compactAssemblyTopologySnapshots,subassemblyComponent,()=>{},()=>{},()=>refreshes++,()=>{},key=>key,()=>false,record=>createReferenceResolver((_kind,key)=>[unused,selected].find(item=>item.key===key)).resolve(record).document,trackLibraryOccurrence);
  insert(assembly?'asm:selected':'selected');
  const component=E.assembly.components[0];
  assert.equal(component.libraryLink.kind,assembly?"assembly":"part");
  assert.equal(component.grounded,true);assert.equal(component.id,12);assert.equal(refreshes,1);
  if(assembly){component.asm.components[0].def.parts[0].id='edited';assert.equal(selected.components[0].def.parts[0].id,'body');}
  else{component.def.parts[0].density=2.7;assert.equal(selected.parts[0].density,8);}
  assert.equal(E.sel,component);
});

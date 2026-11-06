import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import { sourceFunctionText, withSetters } from "./helpers/source_function.mjs";
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {putModelLibraryRecord,loadModelLibrary,putAssemblyLibraryRecord} from '../js/core/model_library_store.js';
import {compactAssemblyTopologySnapshots} from '../js/core/project_topology_budget.js';

test('cross-tab saves refresh the assembly insertion catalogue without changing authored occurrences', async () => {
  const source=modelerSource();
  const saved={key:'fresh-holder',name:'Revised holder',parts:[{id:'body'}]};
  const assembly={key:'working-arm',components:[{id:'holder',modelKey:saved.key,
    transform:{x:8.5,y:8.3,z:0,ry:180},def:{name:'Existing occurrence snapshot'}}],mates:[{id:'hinge'}]};
  const before=structuredClone(assembly);
  const selected=assembly.components[0];
  let rendered=[];
  let calls=0;
  const context={modelLibraryCache:[],assemblyLibraryCache:[],
    loadModelLibrary:async()=>[saved],loadAssemblyLibrary:async()=>[],
    writeLibraryIndex:()=>{},writeAssemblyIndex:()=>{},cloneData:structuredClone,FURN:{},PRICE:{},root:{},
    E:{open:true,docType:'assembly',assembly,sel:selected},registerCustomModel:()=>{},
    refreshCatalogSelect:()=>{},refreshLib:()=>{},
    refreshComponents:()=>{calls++;rendered=context.modelLibraryCache.map(model=>({key:model.key,name:model.name}));}};
  runInNewContext(withSetters(sourceFunctionText(source,'refreshLibraryFromOtherTab'))+'\nthis.refresh=refreshLibraryFromOtherTab;',context);
  await context.refresh();
  assert.equal(calls,1,'the assembly chooser must receive the shared save');
  assert.deepEqual(rendered,[{key:saved.key,name:saved.name}]);
  assert.deepEqual(context.E.assembly,before,'library arrival must not update geometry or placements automatically');
  assert.equal(context.E.sel,selected,'current component selection remains intact');
  context.E.docType='part';await context.refresh();
  assert.equal(calls,1,'a part editor must not be replaced by the assembly panel');
  context.E.docType='assembly';context.E.open=false;await context.refresh();
  assert.equal(calls,1,'closed editors need no chooser refresh');
});

test('cross-tab catalogue registration leaves stored library baselines exact and preserves real conflict detection', async () => {
  const source=modelerSource();
  const record={key:'refresh-baseline-regression',name:'Authored part',parts:[{kind:'kernel',meshData:{positions:[0,1,2]}}]};
  await putModelLibraryRecord(record);
  const context={modelLibraryCache:[],assemblyLibraryCache:[],loadModelLibrary,loadAssemblyLibrary:async()=>[],
    writeLibraryIndex:()=>{},writeAssemblyIndex:()=>{},cloneData:structuredClone,FURN:{},PRICE:{},root:null,
    registerCustomModel:model=>{model.parts[0].name='Catalogue default';model.w=1;}};
  runInNewContext(withSetters(sourceFunctionText(source,'refreshLibraryFromOtherTab'))+'\nthis.refresh=refreshLibraryFromOtherTab;',context);
  await context.refresh();
  const baseline=context.modelLibraryCache.find(model=>model.key===record.key);
  assert.deepEqual(baseline,record,'normalization must not mutate the optimistic baseline');
  const edited={...record,name:'Edited through UI'};
  assert.equal((await putModelLibraryRecord(edited,{expected:baseline})).ok,true);
  assert.equal((await putModelLibraryRecord(record,{expected:baseline})).conflict,true,'a concurrent authored change still conflicts');
});

test('opening a compacted assembly keeps the full stored optimistic baseline', async () => {
  const source=modelerSource();
  const start=source.indexOf('var occurrenceSnapshot=compactAssemblyTopologySnapshots(assembly);');
  const end=source.indexOf('S.idc = nextDocumentNumericId',start);
  assert.ok(start>=0 && end>start);
  const record={key:'assembly-budget-baseline-regression',name:'Gears',components:[{id:'gear',def:{
    parts:[{id:'solid'}],sketches:[{id:'sketch',points:[],entities:[],constraints:[]}],
    features:[{id:'base',type:'extrude',params:{depth:1},references:{sketches:['sketch']}},
      {id:'final',type:'extrudeCut',inputs:['base'],params:{depth:1},references:{sketches:['sketch'],features:['base']}}],
    history:[{kind:'feature',targetId:'base'},{kind:'feature',targetId:'final'}],
    exactTopologyCache:{base:{topology:[{data:'x'.repeat(300)}]},final:{topology:[{data:'final'}]}}
  }}],mates:[]};
  await putAssemblyLibraryRecord(record);
  const context={assembly:record,E:{},assemblyOpenBaseline:null,cloneData:structuredClone,
    compactAssemblyTopologySnapshots:assembly=>compactAssemblyTopologySnapshots(assembly,100)};
  runInNewContext(withSetters(source.slice(start,end)),context);
  assert.deepEqual(Object.keys(context.E.assembly.components[0].def.exactTopologyCache),['final']);
  assert.deepEqual(context.assemblyOpenBaseline,record);
  context.E.assembly.mates.push({id:'shoulder',type:'distance',distance:.05});
  assert.equal((await putAssemblyLibraryRecord(context.E.assembly,{expected:context.assemblyOpenBaseline})).ok,true);
  assert.equal((await putAssemblyLibraryRecord(record,{expected:context.assemblyOpenBaseline})).conflict,true);
});

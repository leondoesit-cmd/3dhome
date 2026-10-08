import test from "node:test";
import assert from "node:assert/strict";
import { componentEditCopy, commitComponentEdit } from "../js/core/component_edit.js";
import { createHistory } from "../js/edit_history.js";
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {interferenceDocument} from '../js/core/worker_interference.js';
import {captureExactTopology,verifiedFinalTopology} from '../js/core/exact_topology_cache.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {exactMateReferenceChoices} from '../js/cad_mate_reference_choices.js';

test("component material and properties commit atomically and Undo restores source and placement", () => {
  let assembly={components:[{id:1,name:"Bar",modelKey:"saved-bar",transform:{x:3,y:2,z:1,ry:165},def:{name:"Bar",material:{name:"1060",density:2.7},metadata:{customProperties:{PartNumber:"B-1"}},features:[{id:"boss",params:{depth:7}}]}}]};
  const before=JSON.stringify(assembly), working=componentEditCopy(assembly.components[0]);
  working.material.name="2014";
  working.metadata.customProperties.Description="LINKS long bar";
  working.features[0].params.depth=9;
  working.metadata.contextEditor={componentId:1};
  assert.equal(JSON.stringify(assembly),before,"live component stays unchanged during authoring and draft saves");
  const history=createHistory({get:()=>JSON.stringify(assembly),set:s=>assembly=JSON.parse(s)}).seed();
  history.push("Edit component");
  commitComponentEdit(assembly.components[0],working);
  assert.equal(assembly.components[0].def.material.name,"2014");
  assert.equal(assembly.components[0].def.metadata.contextEditor,undefined);
  assert.deepEqual(assembly.components[0].transform,{x:3,y:2,z:1,ry:165});
  assert.equal(assembly.components[0].inContext,undefined,"ordinary editing must not create an associative parent");
  working.material.name="later uncommitted change";
  assert.equal(assembly.components[0].def.material.name,"2014");
  history.undo();assert.equal(JSON.stringify(assembly),before);
  history.redo();assert.equal(assembly.components[0].def.features[0].params.depth,9);
});

test("canceling an in-context working copy preserves the original parent reference and definition", () => {
  const component={id:2,inContext:{parentId:1,reference:{persistentId:"end"}},def:{name:"Cap",parts:[],metadata:{}}};
  const before=JSON.stringify(component), working=componentEditCopy(component);
  working.name="discard";working.parts.push({id:100});
  assert.equal(JSON.stringify(component),before);
  assert.throws(()=>componentEditCopy({asm:{}}),/part component/);
});

function finishFixture(working,regenerate){
  const component={id:4018,def:{name:'Original base'},transform:{x:0,y:0,z:0}},previousDef={name:'Assembly editor'},edit={componentId:4018,previousDef};
  const E={contextEdit:edit,def:working,docType:'part'},events=[];
  const context={E,assemblyComponentById:()=>component,isCanonicalAuthoring:()=>true,activeParts:doc=>doc.parts,
    regenerateExactModel:regenerate,setDocumentType:type=>{events.push(type);E.docType=type;},
    H:{clear(){return this;},seed(){}},pushUndo:()=>events.push('undo'),commitComponentEdit,
    solveAssembly:()=>events.push('solve'),refreshAll:()=>{},fitPreview:()=>{}};
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const finish=new Function(...Object.keys(context),sourceFunctionText(source,'finishContextPart')+';return finishContextPart;')(...Object.values(context));
  return{E,component,events,finish,edit};
}

test('Finish waits for edited native base topology and preserves its journal axes after exact cache expiry',async()=>{
  const working=JSON.parse(readFileSync(new URL('./fixtures/bench-vice-edited-base-cache.json',import.meta.url),'utf8'));
  working.metadata.contextEditor={componentId:4018};
  const compile=()=>compileKernelFeatureTree(interferenceDocument(working));
  assert.equal(verifiedFinalTopology(working,compile().features).length,0,'browser export terminal hole-edit cache was expired');
  let release;const barrier=new Promise(resolve=>release=resolve);
  const f=finishFixture(working,async(_rebuild,options)=>{
    assert.equal(options.restoreMode,'mesh');await barrier;
    const compiled=compile(),run=await regenerateFeatures({...compiled.document,features:compiled.features});
    try{
      assert.equal(run.ok,true,JSON.stringify(run.issues));
      working.exactTopologyCache=captureExactTopology(working,compiled.features,run);
      return{ok:true};
    }finally{releaseRegeneration(run);}
  });
  const pending=f.finish();assert.equal(f.component.def.name,'Original base');assert.equal(f.E.docType,'part');assert.equal(f.events.length,0);
  assert.equal(await f.finish(),false,'second Finish cannot overlap its native rebuild');
  release();assert.equal(await pending,true);
  const committed=f.component.def,compiled=compileKernelFeatureTree(interferenceDocument(committed)),entries=verifiedFinalTopology(committed,compiled.features);
  assert.ok(entries.length>0);const axes=exactMateReferenceChoices(entries,committed.features,'mm').filter(choice=>choice.entry.kind==='axis');
  assert.ok(axes.some(choice=>Math.abs(choice.entry.descriptor.axis.x)>.99),'base journal X axis survives the edited mounting holes');
  assert.equal(committed.metadata.contextEditor,undefined);assert.equal(f.E.docType,'assembly');assert.equal(f.events.filter(event=>event==='undo').length,1);
  assert.deepEqual(f.component.transform,{x:0,y:0,z:0});
});

test('failed exact context Finish preserves the working document and original occurrence without undo',async()=>{
  const working={name:'Edited base',parts:[{}]},f=finishFixture(working,async()=>null);
  assert.equal(await f.finish(),false);assert.equal(f.E.def,working);assert.equal(f.E.docType,'part');assert.equal(f.E.contextEdit,f.edit);
  assert.equal(f.component.def.name,'Original base');assert.equal(f.events.length,0);assert.equal(f.edit.finishing,false);
});

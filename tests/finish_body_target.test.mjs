import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {historyEntryRolled,createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';
import {leavesInputStanding} from '../js/core/rebuild.js';
import {featureField} from '../js/modeler_feature_form.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const dependencyReferenceId=new Function(sourceFunctionText(source,'dependencyReferenceId')+';return dependencyReferenceId;')();
function el(tag,cls='',text=''){
 const node={tagName:tag.toUpperCase(),children:[],dataset:{},listeners:{},classList:{add(){},remove(){}},textContent:text,
  appendChild(child){this.children.push(child);return child;},setAttribute(){},addEventListener(type,handler){this.listeners[type]=handler;}};
 if(tag==='select'){let value='';Object.defineProperty(node,'value',{get:()=>value,set:next=>{value=String(next);}});}
 return node;
}
function harness(document,tree=[]){
 const E={def:document,sel:null,ssel:[],topologySelection:[{kind:'edge',persistentId:'old-edge'}],authoring:{featureSelection:tree,finishEdgePool:['old-edge']}};let previews=0;
 const names=['cutTargetFeatureId','finishBodyTargetChoices','finishBodyForTreeSelection','addFinishBodyTargetControl'];
 const args={E,historyEntryRolled,leavesInputStanding,dependencyReferenceId,
  activeParts:doc=>doc.parts.filter(part=>!part.suppressed && (doc.rollbackIndex==null||!historyEntryRolled(doc,doc.history.findIndex(entry=>entry.targetId===part.featureId)))),
  partSupportsExactMesh:part=>part.kind==='ext',selectedSolid:()=>E.sel,selectedFeatureIds:()=>E.authoring.featureSelection,
  FINISH_FEATURES:['fillet','chamfer','shell','dome','draft','thicken'],featureField:(host,definition,value)=>featureField(host,definition,value,{el}),
  el,t:key=>key,syncActiveFeatureSelectionFeedback(){},queueNewFeaturePreview(){previews++;},refreshLivePreview(){}};
 const api=new Function(...Object.keys(args),names.map(name=>sourceFunctionText(source,name)).join('\n')+';return {'+names.join(',')+'};')(...Object.values(args));
 return {E,api,get previews(){return previews;}};
}
const square=(a,b)=>[{u:a,v:a},{u:b,v:a},{u:b,v:b},{u:a,v:b}];
function fixture(){
 const document=createPartDocument({id:'finish-target-fixture'});
 const base=createFeatureDefinition(document,'extrude',{id:'base',name:'Boss',references:{sketches:['s-base']},params:{points:square(0,2),axis:'y',from:0,to:1,depth:1}});
 createFeatureDefinition(document,'extrudeCut',{id:'cut',name:'Current cut',inputs:[base.id],references:{sketches:['s-cut'],features:[base.id]},params:{points:square(.5,1.5),axis:'y',from:.5,to:1,depth:.5}});
 createFeatureDefinition(document,'extrude',{id:'other',name:'Other body',references:{sketches:['s-other']},params:{points:square(3,4),axis:'y',from:0,to:1,depth:1,mergeResult:false,operation:'new-body'}});
 document.sketches=['s-base','s-cut','s-other'].map(id=>({id,plane:'top',offset:0,points:[],entities:[],constraints:[]}));
 document.parts=[{id:'body-A',name:'First body',featureId:'base',kind:'ext',pts:square(0,2),axis:'y',from:0,to:1},{id:'body-B',name:'Second body',featureId:'other',kind:'ext',pts:square(3,4),axis:'y',from:0,to:1}];return document;
}
test('historical feature selection resolves to current body head and explicit body choice leaves geometry unselected',()=>{
 const document=fixture(),before=JSON.stringify(document),f=harness(document,['base']),state={};
 const choices=f.api.finishBodyTargetChoices();assert.deepEqual(choices.map(choice=>[choice.value,choice.head]),[['body-A','cut'],['body-B','other']]);
 const picker=f.api.addFinishBodyTargetControl(el('div'),'shell',state);
 assert.equal(f.E.sel,document.parts[0]);assert.equal(picker.value,'body-A');assert.deepEqual(f.E.topologySelection,[]);
 picker.value='body-B';picker.listeners.change();assert.equal(f.E.sel,document.parts[1]);assert.deepEqual(f.E.topologySelection,[]);assert.deepEqual(f.E.authoring.finishEdgePool,[]);assert.equal(f.previews,1);
 assert.equal(JSON.stringify(document),before,'selection must not rewrite history, inputs, topology or body definitions');
 f.E.sel=document.parts[0];state.syncFinishBodyTarget();assert.equal(picker.value,'body-A','existing viewport selection still synchronizes');
 f.E.sel=null;f.E.authoring.featureSelection=['cut'];state.syncFinishBodyTarget();assert.equal(f.E.sel,document.parts[0],'tree selection during the open command also resolves its body');assert.deepEqual(f.E.topologySelection,[]);
 picker.value='';picker.listeners.change();state.syncFinishBodyTarget();assert.equal(f.E.sel,null,'explicit blank does not silently restore a stale tree target');
});
test('ambiguous and absent tree selections require explicit choice, and rollback/suppression select current head',()=>{
 const doc=fixture(),f=harness(doc,[]);assert.equal(f.api.finishBodyForTreeSelection(f.api.finishBodyTargetChoices(),[]),null);
 assert.equal(f.api.finishBodyForTreeSelection(f.api.finishBodyTargetChoices(),['base','other']),null);
 const shared={id:'shared',inputs:['base']};doc.features.push(shared);doc.features.find(feature=>feature.id==='other').inputs=['base'];
 assert.equal(f.api.finishBodyForTreeSelection(f.api.finishBodyTargetChoices(),['base']),null,'shared ancestry between multiple bodies is ambiguous');
 doc.features.find(feature=>feature.id==='other').inputs=[];doc.features.find(feature=>feature.id==='cut').suppressed=true;
 assert.equal(f.api.finishBodyTargetChoices()[0].head,'base');doc.features.find(feature=>feature.id==='cut').suppressed=false;
 doc.rollbackIndex=doc.history.findIndex(entry=>entry.targetId==='cut');assert.deepEqual(f.api.finishBodyTargetChoices().map(choice=>choice.head),['base']);
});
test('existing viewport face/edge selection survives opening the form until the target changes',()=>{
 const doc=fixture(),f=harness(doc,['base']),state={};f.E.sel=doc.parts[0];const old=f.E.topologySelection;
 const picker=f.api.addFinishBodyTargetControl(el('div'),'chamfer',state);assert.equal(f.E.topologySelection,old);
 picker.value='body-B';picker.listeners.change();assert.deepEqual(f.E.topologySelection,[]);
});

test('native numeric body IDs survive actual select string conversion and feedback synchronization for every finish command',()=>{
 for(const type of ['fillet','chamfer','shell','dome','draft','thicken']){
  const doc=fixture();doc.parts[0].id=6466;doc.parts[1].id=6467;
  const before=JSON.stringify(doc),f=harness(doc),state={};
  const picker=f.api.addFinishBodyTargetControl(el('div'),type,state);
  assert.equal(picker.value,'');picker.value='6466';picker.listeners.change();state.syncFinishBodyTarget();
  assert.equal(f.E.sel,doc.parts[0],type);assert.equal(picker.value,'6466',type);assert.equal(f.previews,1);assert.deepEqual(f.E.topologySelection,[]);
  picker.value='6467';picker.listeners.change();state.syncFinishBodyTarget();assert.equal(f.E.sel,doc.parts[1]);assert.equal(picker.value,'6467');
  picker.value='absent';picker.listeners.change();state.syncFinishBodyTarget();assert.equal(f.E.sel,null);assert.equal(picker.value,'');
  picker.value='6466';picker.listeners.change();picker.value='';picker.listeners.change();state.syncFinishBodyTarget();assert.equal(f.E.sel,null);
  assert.equal(JSON.stringify(doc),before,'target selection changes no native geometry, history or references');
 }
});
test('body target changes preserve native cold geometry and current head mass',async()=>{
 const doc=fixture(),before=JSON.stringify(doc),f=harness(doc,['base']);
 const picker=f.api.addFinishBodyTargetControl(el('div'),'fillet',{});picker.value='body-B';picker.listeners.change();picker.value='body-A';picker.listeners.change();
 assert.equal(JSON.stringify(doc),before);
 const cold=JSON.parse(JSON.stringify(doc)),compiled=compileKernelFeatureTree(cold);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(Math.abs((await shapeMassProperties(run.results.get('cut'))).volume-3.5)<1e-7);assert.ok(Math.abs((await shapeMassProperties(run.results.get('other'))).volume-1)<1e-7);}
 finally{releaseRegeneration(run);}
});

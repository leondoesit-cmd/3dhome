import {registerQuickForm} from '../js/modeler_quick_form.js';
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=modelerSource();
function fixture(){
 const element=()=>({children:[],hidden:false,value:'',classList:{add(){},remove(){},contains:()=>false},appendChild(x){this.children.push(x);},setAttribute(){},focus(){},select(){},addEventListener(){}});
 const host=element(),buttons=[],fields=[],closed=[],E={authoring:{},docType:'assembly',mode:'3d'},calls={refresh:0,valid:true};
 Object.defineProperty(host,'innerHTML',{set(){this.children=[];},get(){return '';}});
 const ctx={registerQuickForm,E,root:{querySelector:()=>host,classList:{add(){},remove(){}}},motionPlaybackCancel:null,el:element,t:x=>x,namedButton:x=>x,
  featureField:(body,field,value)=>{const input=element();input.value=value;fields.push({field,input});return input;},
  btn:(label,callback,cls)=>{const b=element();b.callback=callback;b.cls=cls;buttons.push(b);return b;},
  requestAnimationFrame:fn=>fn(),syncCommandManager(){},document:{body:element()},validateFeatureInputs:()=>calls.valid,
  closeFeaturePanel:options=>{closed.push(options);host.hidden=true;},refreshAll:()=>calls.refresh++};
 Object.assign(ctx,new Function(...Object.keys(ctx),['openQuickForm','sheetForm'].map(n=>sourceFunctionText(source,n)).join('\n')+';return {openQuickForm,sheetForm};')(...Object.values(ctx)));
 return {ctx,E,host,buttons,fields,calls,closed,apply:()=>buttons.filter(b=>b.cls==='md-quick-apply').at(-1).callback(),cancel:()=>buttons.filter(b=>b.cls==='md-quick-cancel').at(-1).callback()};
}
test('actual chained sheetForm Apply keeps the new same-action editor open and accepts its values',async()=>{
 const f=fixture();let answer;const workflow=(async()=>{const chosen=await f.ctx.sheetForm('Choose Component Pattern',[{key:'pattern',value:'p'}]);if(chosen)answer=await f.ctx.sheetForm('Edit Component Pattern',[{key:'name',value:'Original'}]);})();
 const first=f.buttons.filter(b=>b.cls==='md-quick-apply').at(-1);await first.callback();
 assert.equal(f.E.quickAction,'sheetprompt');assert.equal(f.host.hidden,false);assert.equal(f.closed.length,0);assert.equal(f.calls.refresh,0);assert.equal(f.fields.at(-1).field.key,'name');
 f.fields.at(-1).input.value='Actual edit';await f.apply();await workflow;
 assert.equal(answer.name,'Actual edit');assert.equal(f.host.hidden,true);assert.equal(f.E.quickFormInstance,null);assert.equal(f.closed.length,1);assert.equal(f.calls.refresh,1);
});
test('stale Apply, Cancel and failed async completion cannot close or mark a replacement form',async()=>{
 const f=fixture();let settle,cancels=0;f.ctx.openQuickForm({action:'same',title:'Old',fields:[{key:'old',value:'a'}],failureMessage:()=>{throw new Error('stale failure message read');},onCancel:()=>cancels++,onApply:()=>new Promise(r=>settle=r)});
 const oldApply=f.buttons.at(-1),oldCancel=f.buttons.at(-2),pending=oldApply.callback();
 f.ctx.openQuickForm({action:'same',title:'New',fields:[{key:'new',value:'b'}],onApply:()=>true});
 await oldCancel.callback();settle(false);await pending;await oldApply.callback();
 assert.equal(cancels,0);assert.equal(f.closed.length,0);assert.equal(f.calls.refresh,0);assert.equal(f.E.quickAction,'same');assert.equal(f.host.hidden,false);
 await f.apply();assert.equal(f.closed.length,1);assert.equal(f.calls.refresh,1);
});
test('current form validation/failure/cancel and presentation-only refresh behavior remain intact',async()=>{
 const f=fixture();let applies=0,cancels=0;f.ctx.openQuickForm({action:'normal',title:'Validate',fields:[{key:'v',value:'x'}],failureMessage:()=> 'Invalid',onApply:()=>{applies++;return false;},onCancel:()=>cancels++});
 f.calls.valid=false;await f.apply();assert.equal(applies,0);f.calls.valid=true;await f.apply();assert.equal(applies,1);assert.equal(f.closed.length,0);assert.equal(f.calls.refresh,0);await f.cancel();assert.equal(cancels,1);assert.equal(f.calls.refresh,1);
 f.ctx.openQuickForm({action:'drawing',drawingOnly:true,title:'Drawing',fields:[],onApply:()=>true});await f.apply();assert.equal(f.closed.at(-1).drawingOnly,true);assert.equal(f.calls.refresh,1);
 f.ctx.openQuickForm({action:'pose',presentationOnly:true,title:'Pose',fields:[],onApply:()=>true});await f.apply();assert.equal(f.closed.at(-1).assemblyPoseOnly,true);assert.equal(f.calls.refresh,1);
});

test('double Apply and reentrant Apply share one operation; Cancel waits for settlement',async()=>{
 const f=fixture();let resolve,count=0,cancels=0,reentrant;
 f.ctx.openQuickForm({title:'Single flight',fields:[],onCancel:()=>cancels++,onApply:()=>{
  count++;assert.ok(f.E.quickFormInstance.applying);reentrant=f.apply();return new Promise(r=>resolve=r);
 }});
 const instance=f.E.quickFormInstance,first=f.apply(),barrier=instance.applying,second=f.apply();
 assert.ok(barrier instanceof Promise);assert.equal(instance.applying,barrier);assert.equal(count,1);
 assert.equal(f.buttons.at(-1).disabled,true);assert.equal(f.buttons.at(-2).disabled,true);
 f.cancel();assert.equal(cancels,0);assert.equal(f.closed.length,0);
 resolve(true);await Promise.all([first,second,reentrant,barrier]);
 assert.equal(instance.applying,null);assert.equal(f.closed.length,1);assert.equal(f.calls.refresh,1);
});

test('sync throws, async rejection and false results release the flight and retain editable values for retry',async()=>{
 for(const outcome of ['throw','reject','false','async-false']){
  const f=fixture();let attempts=0;
  const inputs=f.ctx.openQuickForm({title:'Retry',fields:[{key:'name',value:'initial'}],onApply:()=>{
   if(++attempts>1)return true;
   if(outcome==='throw')throw new Error('Sync failure');
   if(outcome==='reject')return Promise.reject(new Error('Async failure'));
   return outcome==='false'?false:Promise.resolve(false);
  }});
  inputs.name.value='unsaved';const instance=f.E.quickFormInstance;await f.apply();
  assert.equal(instance.applying,null,outcome);assert.equal(instance.hasPendingEdits(),true,outcome);
  assert.equal(f.host.hidden,false);assert.equal(inputs.name.value,'unsaved');assert.equal(f.buttons.at(-1).disabled,false);
  await f.apply();assert.equal(attempts,2);assert.equal(f.closed.length,1);
 }
});

function navigation(f){
 f.E.open=true;f.E.def={};f.E.assembly={};
 const calls={prompts:0,switches:0},history={};
 const deps={E:f.E,root:f.ctx.root,t:x=>x,H:{generation:1,editRevision:()=>0},currentHistoryNode:()=>history,
  hasResidentEdits:()=>false,askModelerDecision:async()=>{calls.prompts++;return false;},
  setDocumentType:type=>{calls.switches++;f.E.docType=type;}};
 const api=new Function(...Object.keys(deps),'let documentTypeRequest=0,contextFinish=null;'+
  ['confirmDiscardDocument','leavingQuickForm','requestDocumentType'].map(n=>sourceFunctionText(source,n)).join('\n')+
  ';return {requestDocumentType,confirmDiscardDocument};')(...Object.values(deps));
 return {...api,calls};
}

test('document switch awaits generic Apply before changing the document',async()=>{
 const f=fixture(),nav=navigation(f);let resolve,appliedType;
 f.ctx.openQuickForm({title:'Pending',fields:[],onApply:async()=>{await new Promise(r=>resolve=r);appliedType=f.E.docType;return true;}});
 const apply=f.apply(),switching=nav.requestDocumentType('part');
 assert.equal(nav.calls.switches,0);assert.equal(f.E.docType,'assembly');
 resolve();await apply;assert.equal(await switching,true);assert.equal(appliedType,'assembly');assert.equal(f.E.docType,'part');
});

test('edits during Apply survive success, even when reverted to the opening value, and block navigation',async()=>{
 const f=fixture(),nav=navigation(f);let resolve;
 const inputs=f.ctx.openQuickForm({title:'Edits',fields:[{key:'name',value:'original'}],onApply:()=>new Promise(r=>resolve=r)});
 inputs.name.value='submitted';const instance=f.E.quickFormInstance,apply=f.apply();
 inputs.name.value='original';const switching=nav.requestDocumentType('part');
 resolve(true);await apply;assert.equal(await switching,false);
 assert.equal(f.E.quickFormInstance,instance);assert.equal(instance.hasPendingEdits(),true);
 assert.equal(inputs.name.value,'original');assert.equal(f.closed.length,0);assert.equal(nav.calls.prompts,1);assert.equal(nav.calls.switches,0);
});

test('replacement owns its UI and cancels pending navigation after either success or rejection',async()=>{
 for(const reject of [false,true]){
  const f=fixture(),nav=navigation(f);let settle;
  f.ctx.openQuickForm({action:'same',title:'Old',fields:[],onApply:()=>new Promise((resolve,rejection)=>settle=reject?rejection:resolve)});
  const old=f.E.quickFormInstance,apply=f.apply(),switching=nav.requestDocumentType('part'),discard=nav.confirmDiscardDocument();
  f.ctx.openQuickForm({action:'same',title:'New',fields:[],onApply:()=>true});const replacement=f.E.quickFormInstance;
  settle(reject?new Error('Old failure'):true);await apply;
  assert.equal(await switching,false);assert.equal(await discard,false);assert.equal(old.applying,null);
  assert.equal(f.E.quickFormInstance,replacement);assert.equal(f.closed.length,0);assert.equal(f.calls.refresh,0);
  assert.notEqual(f.buttons.at(-1).disabled,true);await f.apply();assert.equal(f.closed.length,1);
 }
});

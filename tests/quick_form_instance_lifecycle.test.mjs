import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=modelerSource();
function fixture(){
 const element=()=>({children:[],hidden:false,value:'',classList:{add(){},remove(){},contains:()=>false},appendChild(x){this.children.push(x);},setAttribute(){},focus(){},select(){},addEventListener(){}});
 const host=element(),buttons=[],fields=[],closed=[],E={authoring:{},docType:'assembly',mode:'3d'},calls={refresh:0,valid:true};
 Object.defineProperty(host,'innerHTML',{set(){this.children=[];},get(){return '';}});
 const ctx={E,root:{querySelector:()=>host,classList:{add(){},remove(){}}},motionPlaybackCancel:null,el:element,t:x=>x,namedButton:x=>x,
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

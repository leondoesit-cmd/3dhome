import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';import {featureField} from '../js/modeler_feature_form.js';
const source=modelerSource();
function fixture(){
 const frames=[],buttons=[],document={activeElement:null,body:{classList:{contains:()=>false}}};
 function node(tag,cls='',text=''){return {tagName:tag.toUpperCase(),className:cls,textContent:text,dataset:{},children:[],listeners:{},attrs:{},value:'',hidden:false,selected:0,focused:0,
  appendChild(n){this.children.push(n);n.parent=this;},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){(this.listeners[k] ||= []).push(fn);},dispatch(k){for(const fn of this.listeners[k] || [])fn();},
  focus(){this.focused++;document.activeElement=this;this.dispatch('focus');},select(){this.selected++;},classList:{contains:()=>false}};}
 const host=node('div'),E={authoring:{}},ctx={E,root:{querySelector:()=>host},motionPlaybackCancel:null,el:node,t:x=>x,namedButton:x=>x,
  featureField:(body,f,value)=>featureField(body,f,value,{el:node,units:{length:'mm'}}),modelLengthUnit:()=> 'mm',
  btn:(label,callback,cls)=>{const b=node('button',cls);b.callback=callback;buttons.push(b);return b;},document,requestAnimationFrame:fn=>frames.push(fn),syncCommandManager(){},validateFeatureInputs:()=>true,closeFeaturePanel(){},refreshAll(){}};
 const open=new Function(...Object.keys(ctx),sourceFunctionText(source,'openQuickForm')+';return openQuickForm;')(...Object.values(ctx));
 const fields=[{key:'x0',label:'Point 1 X (paper mm)',type:'text',value:'176.76'},{key:'y0',label:'Point 1 Y (paper mm)',type:'text',value:'42.5'}];
 return {document,E,frames,buttons,open,fields,flush(){while(frames.length)frames.shift()();}};
}
test('untouched form retains normal first-field default focus and selection once',()=>{
 const f=fixture(),inputs=f.open({action:'sheetprompt',title:'Edit drawing annotation',fields:f.fields,onApply(){}});assert.equal(f.document.activeElement,null);f.flush();assert.equal(f.document.activeElement,inputs.x0);assert.equal(inputs.x0.selected,1);assert.equal(inputs.y0.focused,0);
});
test('delayed real QuickForm autofocus cannot steal a chosen paper Y field or corrupt the verified X value',async()=>{
 const f=fixture();let answer;const inputs=f.open({action:'sheetprompt',title:'Edit drawing annotation',fields:f.fields,onApply:v=>{answer=v;return true;}});
 inputs.x0.focus();f.document.activeElement.value='176.76';inputs.x0.dispatch('input');
 inputs.y0.focus();f.document.activeElement.value='114.08';inputs.y0.dispatch('input');f.flush();
 assert.equal(f.document.activeElement,inputs.y0);assert.equal(inputs.x0.selected,0);assert.equal(inputs.x0.focused,1);
 f.document.activeElement.value='114.082';await f.buttons.at(-1).callback();assert.equal(answer.x0,'176.76');assert.equal(answer.y0,'114.082');
});
test('input/pointer intent, outside focus and replacement-form frames all suppress stale default focusing',()=>{
 for(const kind of ['input','pointer','outside']){
  const f=fixture(),inputs=f.open({action:'sheetprompt',title:'Edit',fields:f.fields,onApply(){}});
  if(kind==='outside')f.document.activeElement={id:'another deliberate control'};else inputs.y0.dispatch(kind==='input'?'input':'pointerdown');
  f.flush();assert.equal(inputs.x0.focused,0,kind);assert.equal(inputs.x0.selected,0,kind);
 }
 const f=fixture(),old=f.open({action:'sheetprompt',title:'Old',fields:f.fields,onApply(){}}),current=f.open({action:'sheetprompt',title:'New',fields:f.fields,onApply(){}});f.flush();assert.equal(old.x0.focused,0);assert.equal(current.x0.focused,1);
});

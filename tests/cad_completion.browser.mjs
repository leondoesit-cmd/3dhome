import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('gear cutter fields and persistent sketch-repair controls are reachable',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{const result=await page.eval(async()=>{
  const {openModeler}=await import('/js/modeler.js');
  const sketch={id:'s',plane:'top',points:[{id:'a',x:0,y:0},{id:'b',x:4,y:0}],entities:[{id:'l',type:'line',a:'a',b:'b'}],constraints:[],repairs:[{id:'r',status:'pending',operation:'trim',constraint:{id:'d',type:'distance',entity:'l',value:10},points:[],entities:[]}]};
  openModeler(null,{key:'completion',name:'Completion',parts:[],sketches:[sketch],activeSketch:'s'},null);
  document.querySelector('[data-command="stdgear"]').click();
  const fields=[...document.querySelectorAll('#mdQuickSettings [data-parameter]')].map(e=>e.dataset.parameter);
  document.querySelector('#mdQuickSettings .md-quick-cancel').click();
  const spline=!!document.querySelector('[data-command="sspline"]');
  document.querySelector('[data-command="sketchrepair"]').click();
  const repair=document.querySelector('#mdPickList button');if(!repair)throw new Error('Repair list is empty');repair.click();
  const choices=[...document.querySelectorAll('#mdQuickSettings select option')].map(e=>e.value);
  const input=document.querySelector('#mdQuickSettings [data-parameter="value"] input');if(!input)throw new Error('Repair dimension missing');input.value='4';input.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('#mdQuickSettings .md-quick-apply').click();
  document.querySelector('[data-command="sketchrepair"]').click();
  return {fields,spline,choices,message:document.querySelector('#mdHint').textContent};
 });assert.ok(result.fields.includes('tipRadiusCoefficient'));assert.ok(result.fields.includes('mateTeeth'));assert.equal(result.spline,true);assert.deepEqual(result.choices,['restore','dismiss']);assert.match(result.message,/No sketch relationships/);}
 finally{await page.close();}
});

test('four canvas clicks create a persistent cubic spline with editable handles',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'spline_click',name:'Spline',parts:[]},null);document.querySelector('#mdModes [data-mode="2d"]').click();document.querySelector('[data-command="sspline"]').click();});
  await page.eval(()=>{const picker=document.querySelector('#mdReferencePicker');if(picker&&!picker.hidden)picker.querySelector('button.md-reference-option')?.click();});
  const before=await page.eval(()=>window.cadSketchSnapshot());assert.equal(before.tool,'sspline');
  await page.eval(()=>{const c=document.querySelector('#mdCanvas'),r=c.getBoundingClientRect();for(const [x,y]of [[.3,.5],[.4,.3],[.6,.3],[.7,.5]]){const init={bubbles:true,button:0,buttons:1,pointerId:1,pointerType:'mouse',clientX:r.left+r.width*x,clientY:r.top+r.height*y};c.dispatchEvent(new PointerEvent('pointerdown',init));c.dispatchEvent(new PointerEvent('pointerup',{...init,buttons:0}));}});
  const after=await page.eval(()=>window.cadSketchSnapshot());assert.equal(after.pointCount,4,JSON.stringify({after,hint:await page.eval(()=>document.querySelector("#mdHint").textContent),errors:page.consoleErrors}));
 }finally{await page.close();}
});

test('gear form refuses undercut and creates the validated requested blank',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{const result=await page.eval(async()=>{
   const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'rack_form',name:'Rack form',parts:[]},null);
   document.querySelector('[data-command="stdgear"]').click();
   const set=(key,value)=>{const input=document.querySelector('#mdQuickSettings [data-parameter="'+key+'"] input');input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));};
   set('teeth',10);document.querySelector('#mdQuickSettings .md-quick-apply').click();const failure=document.querySelector('#mdHint').textContent;
   set('teeth',20);document.querySelector('#mdQuickSettings .md-quick-apply').click();
   return {failure,text:document.querySelector('#modeler').textContent,hint:document.querySelector('#mdHint').textContent};
 });assert.match(result.failure,/undercut/);assert.match(result.text,/Rack-generated gear m2 z20/);assert.match(result.hint,/Mating geometry passed/);}
 finally{await page.close();}
});

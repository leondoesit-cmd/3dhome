import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('cabinet inspector, resize dialog and model-editor save remain usable and parametric',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:720,lang:'en'});
 try{
  await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{makeSpec}=await import('/js/cabinet.js'),{openCabinet}=await import('/js/ui_cabinet.js');
   S.items=[{id:'cabinet-ui-test',type:'cabsys',x:100,y:100,w:120,h:240,d:60,rot:0,cab:makeSpec('w_classic',120,240,60)}];
   openCabinet(S.items[0]);
  });
  const height=await page.eval(()=>document.querySelector('.cb-right .cb-fill').clientHeight);assert.ok(height>=240);
  await page.eval(()=>{const field=document.querySelector('#cbD');field.value='20';field.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.eval(()=>document.activeElement.textContent),'Keep current size');
  await page.eval(()=>document.activeElement.click());
  await page.eval(()=>[...document.querySelectorAll('#cabdes button')].find(b=>b.textContent.includes('3 · Model editor')).click());
  await page.waitUntil(()=>!!document.querySelector('#mdInsp input'),{what:'cabinet parameters'});
  await page.eval(()=>{if(document.getElementById('modeler').classList.contains('md-right-collapsed'))document.getElementById('mdToggleRight').click();});
  const imported=await page.eval(()=>[...document.querySelectorAll('#mdInsp label')].map(e=>({label:e.textContent,value:e.querySelector('input')?.value})));
  assert.ok(imported.some(e=>e.label==='Overall width'&&e.value==='120'));
  assert.equal(await page.eval(()=>getComputedStyle(document.querySelector('.md-cab-parameters')).gridTemplateColumns.trim().split(/\s+/).length),1);
  await page.eval(()=>{const field=[...document.querySelectorAll('#mdInsp label')].find(e=>e.textContent==='Overall width').querySelector('input');field.value='160';field.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitUntil(()=>document.querySelector('#mdLeftPanel').textContent.includes('160×'),{what:'resized cabinet geometry'});
  await page.eval(()=>document.querySelector('#mdSave').click());
  await page.waitUntil(()=>!document.querySelector('#mdSave').classList.contains('is-dirty'),{what:'cabinet saved'});
  const saved=await page.eval(async()=>{const{S}=await import('/js/state.js');const item=S.items[0],def=S.parametric.definitions[item.definitionId];return{w:item.w,h:item.h,parameter:def.parameters.width.value,generated:def.metadata.generatedParameters.width,parts:def.parts.length};});
  assert.equal(saved.w,160);assert.equal(saved.h,240);assert.equal(saved.parameter,160);assert.equal(saved.generated,160);assert.ok(saved.parts>10);
 }finally{await page.close();}
});

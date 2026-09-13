import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('all material choices save qualification data through the editor and survive draft storage',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'material_check',name:'Materials',parts:[{id:'plate',name:'Plate',kind:'box',x0:0,x1:10,y0:0,y1:1,z0:0,z1:6}]},null);[...document.querySelectorAll('#mdParts [data-node-id]')].find(e=>e.textContent.includes('Plate')).click();document.querySelector('[data-tab="look"]').click();document.querySelector('[data-engineering-action="title"]').click();});
  const choices=await page.eval(()=>[...document.querySelectorAll('#mdQuickSettings [data-parameter="catalogId"] option')].map(o=>o.value));
  assert.equal(choices.length,28);assert.ok(choices.includes('stock:aluminum'));assert.ok(choices.includes('toolbox:aluminum'));assert.ok(choices.includes('custom'));
  await page.eval(()=>{const set=(key,value)=>{const e=document.querySelector('#mdQuickSettings [data-parameter="'+key+'"] input,#mdQuickSettings [data-parameter="'+key+'"] select');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};set('catalogId','toolbox:beech');set('source','Synthetic browser fixture');set('condition','Longitudinal');document.querySelector('#mdQuickSettings .md-quick-apply').click();});
  await page.waitUntil(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')||'null')?.def?.engineeringMaterials?.length===1);
  const saved=await page.eval(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')).def);
  assert.equal(saved.engineeringMaterials[0].catalogId,'toolbox:beech');assert.equal(saved.engineeringMaterials[0].source,'Synthetic browser fixture');assert.equal(saved.parts[0].materialQualificationId,saved.engineeringMaterials[0].id);
  const report=await page.eval(()=>{document.querySelector('[data-engineering-action="check"]').click();return document.querySelector('#mdReport').textContent;});assert.match(report,/Data needs completion/);assert.match(report,/maxHours/);
 }finally{await page.close();}
});
test('generated gear exposes mating material, load, rating and honest incomplete check controls',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{const result=await page.eval(async()=>{
  const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'gear_material',name:'Gear',parts:[]},null);document.querySelector('[data-command="stdgear"]').click();document.querySelector('#mdQuickSettings .md-quick-apply').click();document.querySelector('[data-tab="look"]').click();
  const actions=[...document.querySelectorAll('[data-engineering-action]')].map(e=>e.dataset.engineeringAction);
  document.querySelector('[data-engineering-action="service"]').click();const fields=[...document.querySelectorAll('#mdQuickSettings [data-parameter]')].map(e=>e.dataset.parameter);document.querySelector('#mdQuickSettings .md-quick-cancel').click();document.querySelector('[data-engineering-action="check"]').click();return {actions,fields,report:document.querySelector('#mdReport').textContent};
 });assert.deepEqual(result.actions,['title','mate','service','rating','check']);assert.ok(result.fields.includes('torqueNm'));assert.ok(result.fields.includes('measurementSource'));assert.match(result.report,/Needs attention/);assert.match(result.report,/Production approval: not issued/);
 }finally{await page.close();}
});

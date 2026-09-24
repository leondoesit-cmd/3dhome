import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('all material choices save qualification data through the editor and survive draft storage',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'material_check',name:'Materials',parts:[{id:'plate',name:'Plate',kind:'box',x0:0,x1:10,y0:0,y1:1,z0:0,z1:6}]},null);[...document.querySelectorAll('#mdParts [data-node-id]')].find(e=>e.textContent.includes('Plate')).click();document.querySelector('[data-tab="look"]').click();document.querySelector('[data-engineering-action="title"]').click();});
  const choices=await page.eval(()=>[...document.querySelectorAll('#mdQuickSettings [data-parameter="catalogId"] option')].map(o=>o.value));
  assert.ok(choices.length>=30);assert.ok(choices.includes('stock:aluminum'));assert.ok(choices.includes('toolbox:aluminum'));assert.ok(choices.includes('custom'));assert.ok(choices.includes('stock:rubber'));assert.ok(choices.includes('stock:polycarbonate'));
  await page.eval(()=>{const set=(key,value)=>{const e=document.querySelector('#mdQuickSettings [data-parameter="'+key+'"] input,#mdQuickSettings [data-parameter="'+key+'"] select');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));};set('catalogId','toolbox:beech');set('source','Synthetic browser fixture');set('condition','Longitudinal');document.querySelector('#mdQuickSettings .md-quick-apply').click();});
  await page.waitUntil(async()=>((await (await import('/js/core/model_library_store.js')).loadModelerDraftRecord())?.def?.engineeringMaterials?.length||0)===1);
  const saved=await page.eval(async()=>((await (await import('/js/core/model_library_store.js')).loadModelerDraftRecord())).def);
  assert.equal(saved.engineeringMaterials[0].catalogId,'toolbox:beech');assert.equal(saved.engineeringMaterials[0].source,'Synthetic browser fixture');assert.equal(saved.parts[0].materialQualificationId,saved.engineeringMaterials[0].id);
  const report=await page.eval(()=>{document.querySelector('[data-engineering-action="check"]').click();return document.querySelector('#mdReport').textContent;});assert.match(report,/Data needs completion/);assert.match(report,/maxHours/);
 }finally{await page.close();}
});
test('a selected sketch vertex cannot masquerade as a solid in the material pane',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  const result=await page.eval(async()=>{
   const {openModeler}=await import('/js/modeler.js');
   openModeler(null,{
    key:'vertex_material_guard',name:'Vertex material guard',
    parts:[{id:'solid',name:'Solid',kind:'box',x0:0,x1:4,y0:0,y1:2,z0:0,z1:4}],
    sketches:[{id:'s',plane:'top',points:[{id:'a',x:0,y:0},{id:'b',x:2,y:0}],entities:[{id:'line',type:'line',a:'a',b:'b'}],constraints:[]}],activeSketch:'s',
   },null);
   document.querySelector('#mdModes [data-mode="2d"]').click();
   document.querySelector('[data-tab="sketch"]').click();
   document.querySelector('#mdSketch details')?.setAttribute('open','');
   const vertex=document.querySelector('#mdSketch [data-sketch-object-kind="point"]');
   if(!vertex)throw new Error('Sketch vertex selector missing');
   vertex.click();
   document.querySelector('[data-tab="look"]').click();
   return {message:document.querySelector('#mdLook').textContent,stock:!!document.querySelector('#mdLook .md-material-options button')};
  });
  assert.match(result.message,/No part selected/);
  assert.equal(result.stock,false);
 }finally{await page.close();}
});
test('extrude cut replaces the sketch-point selection with the rebuilt body',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await page.eval(async()=>{
   const {openModeler}=await import('/js/modeler.js');
   openModeler(null,{
    key:'cut_material_selection',name:'Cut material selection',metadata:{authoringSystem:'legacy-adapter'},
    parts:[{id:'solid',name:'Solid',kind:'box',x0:0,x1:4,y0:0,y1:2,z0:0,z1:4}],
    sketches:[{id:'s',plane:'top',points:[{id:'a',x:1,y:1},{id:'b',x:2,y:1},{id:'c',x:2,y:2},{id:'d',x:1,y:2}],entities:[{id:'e1',type:'line',a:'a',b:'b'},{id:'e2',type:'line',a:'b',b:'c'},{id:'e3',type:'line',a:'c',b:'d'},{id:'e4',type:'line',a:'d',b:'a'}],constraints:[]}],activeSketch:'s',
   },null);
   document.querySelector('#mdModes [data-mode="2d"]').click();
   document.querySelector('[data-tab="sketch"]').click();
   document.querySelector('#mdSketch details')?.setAttribute('open','');
   const vertex=document.querySelector('#mdSketch [data-sketch-object-kind="point"]');
   if(!vertex)throw new Error('Sketch vertex selector missing');
   vertex.click();
   document.querySelector('[data-command="extrudecut"]').click();
   const apply=document.querySelector('#mdQuickSettings .md-quick-apply');
   if(!apply)throw new Error('Extrude cut definition missing');
   apply.click();
  });
  await page.waitUntil(()=>window.cadSelectionSnapshot()?.selKind==='part',{what:'rebuilt body selection'});
  const result=await page.eval(()=>({selection:window.cadSelectionSnapshot(),parts:window.cadBodySnapshot(),look:(document.querySelector('[data-tab="look"]').click(),document.querySelector('#mdLook').textContent)}));
  assert.equal(result.selection.sketchSel,0);
  assert.equal(result.parts.length,1);
  assert.match(result.look,/Body material/);
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

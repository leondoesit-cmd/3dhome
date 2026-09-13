import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const available=await findChrome();
test('manufacturing thread fields round-trip through the real feature form',available?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'mfg_thread',name:'Thread controls',parts:[{id:'shaft',kind:'cyl',r:.3,h:.3,x:0,y:0,z:0}]},null);});
  await page.waitUntil(()=>!!window.cadOpenFeatureForm);
  await page.eval(()=>{window.cadOpenFeatureForm('thread');const values={side:'internal',toleranceClass:'6H',runoutStartMm:.5,runoutEndMm:.75,useFitLimits:true,fitSource:'Inspection fixture',majorMinMm:6,majorMaxMm:6.1,pitchMinMm:5.35,pitchMaxMm:5.45,minorMinMm:4.9,minorMaxMm:5};for(const [key,value] of Object.entries(values)){const input=document.querySelector('#mdQuickSettings input[data-parameter="'+key+'"], #mdQuickSettings select[data-parameter="'+key+'"]');if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}});
  const controls=await page.eval(()=>Array.from(document.querySelectorAll('#mdQuickSettings input')).map(i=>({key:i.dataset.parameter,value:i.value,checked:i.checked})));
  const text=await page.eval(()=>document.querySelector('#mdQuickSettings').textContent);
  assert.match(text,/Lead-in runout/);assert.match(text,/Measured thread limits/);
  assert.ok(controls.some(c=>c.value==='Inspection fixture'),JSON.stringify(controls));assert.ok(controls.some(c=>c.value==='6H'));
  assert.ok(controls.some(c=>Number(c.value)===.75));
  const preview=await page.eval(()=>window.cadFinishPreviewSnapshot());
  assert.equal(preview.params.fitSource,'Inspection fixture');assert.equal(preview.params.runoutEndMm,.75);assert.equal(preview.params.useFitLimits,true);
 }finally{await page.close();}
});

test('sheet rules and two adjacent flanges save through the modeler controls',available?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');const {createSheetMetalPart}=await import('/js/cad_sheet_metal.js');openModeler(null,{key:'mfg_sheet',name:'Manufacturing sheet',sheetMetal:createSheetMetalPart({thickness:.1,insideRadius:.2,base:{width:10,height:6}}),parts:[{id:'plate',name:'Plate',kind:'box',x0:0,x1:10,y0:0,y1:.1,z0:0,z1:6}]},null);});
  const tree=await page.eval(()=>document.querySelector('#mdParts')?.innerHTML);
  assert.ok(tree,tree);
  await page.eval(()=>{const row=Array.from(document.querySelectorAll('#mdParts [data-node-id]')).find(r=>r.textContent.includes('Plate'));if(!row)throw new Error(document.querySelector('#mdParts').innerHTML);row.click();});
  const click=async text=>page.eval(text=>{const button=Array.from(document.querySelectorAll('#modeler button')).find(b=>b.textContent.trim()===text);if(!button)throw new Error('Missing button '+text);button.click();},text);
  const set=async values=>page.eval(values=>{for(const [key,value] of Object.entries(values)){const input=document.querySelector('#mdQuickSettings input[data-parameter="'+key+'"],#mdQuickSettings select[data-parameter="'+key+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('#mdQuickSettings .md-quick-apply').click();},values);
  await page.eval(()=>document.querySelector('#modeler [data-tab="ops"]').click());
  await click('Bend rules');await set({relief:.15});
  // Labels include the icon as an element, so textContent remains plain text.
  const flangeLabel=await page.eval(async()=>{const {t}=await import('/js/modeler_strings.js');return t('sheetMetalFlange');});
  await click(flangeLabel);await set({edge:'right',length:2,angle:90});
  await click(flangeLabel);await set({edge:'top',length:2,angle:90});
  await page.waitUntil(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')||'null')?.def?.sheetMetal?.flanges?.length===2);
  const sheet=await page.eval(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')).def.sheetMetal);
  assert.equal(sheet.cornerRelief.width,.15);assert.deepEqual(sheet.flanges.map(f=>f.edge),['right','top']);
 }finally{await page.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
import {installModelerDraftFixture} from './browser_modeler_fixture.mjs';
const chrome=await findChrome();
test('drawing precision controls persist and drive exported dimension text',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await installModelerDraftFixture(page);
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'batch8',name:'Precision',parts:[{id:'box',kind:'box',x0:0,x1:2,y0:0,y1:3,z0:0,z1:4}]},null);document.querySelector('#mdModes [data-mode="drawing"]').click();});
  await page.waitUntil(()=>!!document.querySelector('#mdSheetPrecision'));
  await page.eval(()=>{const input=document.querySelector('#mdSheetPrecision');input.value='3';input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitUntil(async()=>{const draft=await window.currentModelerDraftForTest();return draft?.def?.drawing?.precision===3||JSON.stringify(draft?.def||{}).includes('"precision":3');});
  const result=await page.eval(async()=>{const {dimensionText}=await import('/js/cad_sheet.js');const d=(await window.currentModelerDraftForTest()).def;const find=v=>v&&typeof v==='object'?(v.precision===3&&v.units?v:Object.values(v).map(find).find(Boolean)):null;const doc=find(d);return {precision:doc.precision,text:dimensionText({type:'horizontal',measure:2},doc)};});
  assert.equal(result.precision,3);assert.equal(result.text,'20.000');
 }finally{await page.close();}
});

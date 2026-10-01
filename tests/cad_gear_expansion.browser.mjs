import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
import {installModelerDraftFixture,recoverLegacyModelerDraftFixture} from './browser_modeler_fixture.mjs';
const chrome=await findChrome(),options=chrome?{timeout:90000}:{skip:'Chrome unavailable'};
const set=async(page,values,apply=true)=>page.eval(({values,apply})=>{
 for(const [key,value] of Object.entries(values)){const input=document.querySelector('#mdQuickSettings input[data-parameter="'+key+'"],#mdQuickSettings select[data-parameter="'+key+'"]');if(!input)throw new Error('Missing '+key);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
 if(apply)document.querySelector('#mdQuickSettings .md-quick-apply').click();
},{values,apply});
test('undercut and profile-shift controls save explicit choices; fit reports use corrected tables',options,async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await installModelerDraftFixture(page);
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'gear-expansion',name:'Gears',parts:[]},null);document.querySelector('[data-command="stdgear"]').click();});
  await set(page,{teeth:10,allowUndercut:true,requireMatingCheck:false});
  await page.waitUntil(async()=>(await window.currentModelerDraftForTest())?.def?.parts?.length===1);
  let saved=await page.eval(async()=>(await window.currentModelerDraftForTest()).def);
  assert.equal(saved.parts[0].standardCompliance.allowUndercut,true);assert.equal(saved.parts[0].gearGeometryCheck.ok,false);
  await page.eval(()=>document.querySelector('[data-command="stdgear"]').click());
  await set(page,{teeth:10,profileShift:.5,mateTeeth:40});
  await page.waitUntil(async()=>(await window.currentModelerDraftForTest())?.def?.parts?.length===2);
  saved=await page.eval(async()=>(await window.currentModelerDraftForTest()).def);
  assert.equal(saved.parts[1].standardCompliance.profileShift,.5);assert.equal(saved.parts[1].standardCompliance.allowUndercut,false);assert.equal(saved.parts[1].gearGeometryCheck.ok,true);
  await page.eval(()=>document.querySelector('[data-command="fitcheck"]').click());await set(page,{diameterMm:150,code:'H7/g6'});
  await page.waitUntil(async()=>(await window.currentModelerDraftForTest())?.def?.lastFitCheck?.diameterMm===150);
  const fit=await page.eval(async()=>({saved:(await window.currentModelerDraftForTest()).def.lastFitCheck,report:document.querySelector('#mdReport').textContent}));
  assert.equal(fit.saved.shaft.es,-14);assert.match(fit.report,/150\.040000/);assert.match(fit.report,/Cor 1:2013/);
 }finally{await page.close();}
});
test('gear relation editor persists, reopens and seeks a full-turn ratio correctly',options,async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try{
  await installModelerDraftFixture(page);
  await page.eval(async()=>{const {writeModelerDraft}=await import('/js/modeler_draft.js');writeModelerDraft(localStorage,{docType:'assembly',assembly:{id:'gears',name:'Gear motion',mates:[],topologyMates:[],components:['a','b'].map((id,i)=>({id,name:'Gear '+id,grounded:false,transform:{x:i*5},def:{name:id,parts:[{id:'box'+id,kind:'box',x0:0,x1:1,y0:0,y1:1,z0:0,z1:1}]}}))}});});
  const recover=async(legacy=false)=>{await page.goto('/');await installModelerDraftFixture(page);await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler();});if(legacy)await recoverLegacyModelerDraftFixture(page);await page.waitUntil(()=>!!document.querySelector('#mdDecision [data-decision="accept"]'));await page.eval(()=>document.querySelector('#mdDecision [data-decision="accept"]').click());await page.waitUntil(()=>document.querySelector('#modeler')?.classList.contains('md-assembly'));};
  await recover(true);await page.eval(()=>document.querySelector('[data-command="motion"]').click());
  await set(page,{relation:'new'},false);await set(page,{rpm:60,motorAxis:'z',driverAxis:'z',followerAxis:'z',time:1});
  await page.waitUntil(async()=>(await window.currentModelerDraftForTest())?.assembly?.motionStudies?.length===1);
  let asm=await page.eval(async()=>(await window.currentModelerDraftForTest()).assembly);
  assert.equal(asm.motionStudies[0].gearRelations.length,1);assert.ok(Math.abs(Math.abs(asm.components[1].transform.rz)-180)<1e-6);
  await recover();await page.eval(()=>document.querySelector('[data-command="motion"]').click());await set(page,{time:.5});
  await page.waitUntil(async()=>(await window.currentModelerDraftForTest())?.assembly?.motionStudies?.[0]?.time===.5);
  asm=await page.eval(async()=>(await window.currentModelerDraftForTest()).assembly);assert.equal(asm.motionStudies.length,1);assert.ok(Math.abs(asm.components[1].transform.rz+90)<1e-6);
  const id=asm.motionStudies[0].gearRelations[0].id;
  await page.eval(()=>document.querySelector('[data-command="motion"]').click());await set(page,{relation:id},false);await set(page,{remove:true,time:0});
  await page.waitUntil(async()=>(await window.currentModelerDraftForTest())?.assembly?.motionStudies?.[0]?.gearRelations?.length===0);
 }finally{await page.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage,findChrome } from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('assembly recovery, editing, autosave and a second browser reload preserve components and mates',chrome?{timeout:60000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1280,height:800,lang:'en'});
 try{
  await page.eval(async()=>{
   const {writeModelerDraft}=await import('/js/modeler_draft.js');
   const {topologyReference}=await import('/js/cad_mates.js');
   const component={id:'component-a',name:'Recovery component',grounded:true,transform:{x:12,y:3,z:4,rx:0,ry:0,rz:0},def:{name:'Block',parts:[{id:'box',kind:'box',x0:0,x1:2,y0:0,y1:3,z0:0,z1:4}]}};
   const second={...structuredClone(component),id:'component-b',name:'Mated component',grounded:false};
   const plane={surface:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}};
   const mate={id:'recovery-mate',type:'coincident',aligned:true,a:topologyReference('component-a','face','fa',plane),b:topologyReference('component-b','face','fb',plane)};
   writeModelerDraft(localStorage,{docType:'assembly',assembly:{id:'recovery-assembly',name:'Recovered assembly',components:[component,second],topologyMates:[mate],mates:[]}});
  });
  const recover=async()=>{
   await page.goto('/');
   await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler();});
   await page.waitUntil(()=>!!document.querySelector('#mdDecision [data-decision="accept"]'));
   await page.eval(()=>document.querySelector('#mdDecision [data-decision="accept"]').click());
   await page.waitUntil(()=>document.querySelector('#modeler')?.classList.contains('md-assembly'));
  };
  await recover();
  assert.equal(await page.eval(()=>document.querySelector('#mdName').value),'Recovered assembly');
  await page.eval(()=>{const name=document.querySelector('#mdName');name.value='Assembly after recovery';name.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitUntil(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')||'null')?.assembly?.name==='Assembly after recovery');
  const before=await page.eval(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')).assembly);
  assert.equal(before.components[0].id,'component-a');assert.equal(before.components[0].transform.x,12);
  assert.equal(before.topologyMates[0].id,'recovery-mate');
  await recover();
  assert.equal(await page.eval(()=>document.querySelector('#mdName').value),'Assembly after recovery');
  // A second actual edit proves the restored assembly is live, not just text.
  await page.eval(()=>{const name=document.querySelector('#mdName');name.value='Assembly after second reload';name.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitUntil(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')||'null')?.assembly?.name==='Assembly after second reload');
  const after=await page.eval(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')).assembly);
  assert.deepEqual(after.components,before.components);assert.deepEqual(after.topologyMates,before.topologyMates);
 }finally{await page.close();}
});

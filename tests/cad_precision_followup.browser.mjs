import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('mass panel reports exact modified volume and the hole form exposes engagement depth',chrome?{timeout:90000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try {
  await page.eval(async()=>{
   const {openModeler}=await import('/js/modeler.js');
   const {holeCutRecords}=await import('/js/core/hole_geometry.js');
   const sketch={plane:'top',points:[{id:'c',x:2,y:2}],entities:[{id:'circle',type:'circle',c:'c',r:1}]};
   const cuts=holeCutRecords({holeType:'simple',diameter:1,depth:2,endCondition:'blind'},sketch);
   openModeler(null,{key:'precision_fixture',name:'Precision fixture',parts:[{id:'stock',kind:'box',x0:0,x1:4,y0:0,y1:10,z0:0,z1:4,cuts3d:cuts}]},null);
   const button=Array.from(document.querySelectorAll('#modeler button')).find(b=>b.textContent.trim()==='Mass properties');
   if(!button)throw new Error('Mass properties button is missing');button.click();
  });
  await page.waitUntil(()=>document.querySelector('#mdEvalCard')?.textContent.includes('Inertia tensor'),{ms:60000});
  const report=await page.eval(()=>document.querySelector('#mdEvalCard').textContent);
  assert.match(report,/Exact solid geometry/);assert.match(report,/158\.429/);assert.match(report,/kg·m²/);
  await page.eval(()=>window.cadOpenFeatureForm('hole'));
  const field=await page.eval(()=>{const input=document.querySelector('#mdQuickSettings input[data-parameter="threadDepth"]');return input?{value:input.value,text:input.closest('label')?.textContent}:null;});
  assert.ok(field);assert.equal(Number(field.value),0);
 } finally {await page.close();}
});

test('applying a legacy countersink saves its conical cutter through the real controls',chrome?{timeout:90000}:{skip:'Chrome unavailable'},async()=>{
 const page=await openPage({width:1440,height:1000,lang:'en'});
 try {
  await page.eval(async()=>{
   const {openModeler}=await import('/js/modeler.js');
   openModeler(null,{key:'hole_apply_fixture',name:'Hole apply fixture',metadata:{authoringSystem:'legacy-adapter'},sketches:[{id:'sketch',plane:'top',points:[{id:'c',x:2,y:2}],entities:[{id:'circle',type:'circle',c:'c',r:.5}],constraints:[]}],activeSketch:'sketch',parts:[{id:'stock',name:'Stock',kind:'box',x0:0,x1:4,y0:0,y1:10,z0:0,z1:4}]},null);
   window.cadOpenFeatureForm('hole');
   for(const [key,value] of Object.entries({holeType:'countersink',endCondition:'blind',depth:2})){
    const input=document.querySelector('#mdQuickSettings input[data-parameter="'+key+'"],#mdQuickSettings select[data-parameter="'+key+'"]');
    input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
   }
   const apply=Array.from(document.querySelectorAll('#mdQuickSettings button')).find(b=>b.textContent.trim()==='Apply');
   if(!apply)throw new Error('Apply button is missing');apply.click();
  });
  await page.waitUntil(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')||'null')?.def?.parts?.[0]?.cuts3d?.length===2,{ms:60000});
  const records=await page.eval(()=>JSON.parse(localStorage.getItem('home3d_modeler_draft')).def.parts[0].cuts3d);
  assert.deepEqual(records.map(r=>r.kind),['hole','hole']);assert.equal(records[1].params.kind,'cone');assert.ok(records[1].params.diameter>records[1].params.diameter2);
 }finally{await page.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'Chrome unavailable'};
const model={key:'friction',name:'Recovery <test>',parts:[{id:'seed',kind:'box',x0:0,x1:10,y0:0,y1:10,z0:0,z1:10}]};
async function start(page){
 await page.goto('/');await page.waitForBoot();
 await page.eval(async def=>{
  window.__blocking=0;window.confirm=window.prompt=()=>{window.__blocking++;return false;};
  const {openModeler}=await import('/js/modeler.js');openModeler(null,def,null);
 },model);
 await page.waitUntil(()=>!!window.cadOpenFeatureForm);
}
for(const width of [344,717,1280]) test(`nonblocking recovery and expression collection at ${width}px`,opts,async()=>{
 const page=await openPage({width,height:844,lang:'en',mobile:width<1000,touch:width<1000});
 try{
  await start(page);
  await page.eval(async def=>{
   const {closeModeler}=await import('/js/modeler.js');closeModeler();
   const {saveModelerDraftRecord}=await import('/js/core/model_library_store.js');
   await saveModelerDraftRecord({v:1,at:Date.now(),docType:'part',def},sessionStorage.getItem('home3d_modeler_tab_id'));
  },model);
  await page.goto('/');await page.waitForBoot();
  await page.eval(async()=>{window.__blocking=0;window.confirm=window.prompt=()=>{window.__blocking++;return false;};const {openModeler}=await import('/js/modeler.js');openModeler();});
  await page.waitUntil(()=>document.getElementById('mdDecision')?.open);
  const recovery=await page.eval(async()=>{
   let frames=0;await new Promise(resolve=>requestAnimationFrame(()=>{frames++;requestAnimationFrame(()=>{frames++;resolve();});}));
   const d=document.getElementById('mdDecision'),r=d.getBoundingClientRect();
   return {frames,text:d.textContent,width:r.width,left:r.left,right:r.right,screen:innerWidth,focus:d.contains(document.activeElement)};
  });
  assert.equal(recovery.frames,2);assert.match(recovery.text,/Recovery <test>/);assert.ok(recovery.left>=0&&recovery.right<=recovery.screen);assert.ok(recovery.focus);
  // Escape dismisses the question without deleting recovery material.
  await page.eval(()=>document.getElementById('mdDecision').dispatchEvent(new Event('cancel',{cancelable:true})));
  assert.ok(await page.eval(async()=>{const {loadModelerDraftRecord}=await import('/js/core/model_library_store.js');return await loadModelerDraftRecord(sessionStorage.getItem('home3d_modeler_tab_id'));}));
  await page.eval(async()=>{const {closeModeler,openModeler}=await import('/js/modeler.js');closeModeler();openModeler();});
  await page.waitUntil(()=>document.getElementById('mdDecision')?.open);
  await page.eval(()=>document.querySelector('#mdDecision [data-decision="accept"]').click());
  await page.waitUntil(()=>!document.getElementById('mdDecision'));
  assert.equal(await page.eval(()=>document.getElementById('mdName').value),model.name);
  await page.eval(()=>document.getElementById('mdClose').click());
  await page.waitUntil(()=>document.getElementById('mdDecision')?.open);
  await page.eval(()=>document.querySelector('#mdDecision [data-decision="cancel"]').click());
  assert.equal(await page.eval(()=>getComputedStyle(document.getElementById('modeler')).display),'flex');
  await page.eval(()=>{
   window.cadClearTopologySelection();
   document.querySelector('[data-selfilter="vertex"]').click();
   window.cadOpenFeatureForm('fillet');
   const input=document.querySelector('#mdQuickSettings input[data-parameter="radius"]');
   input.value='8/4';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitUntil(()=>window.cadFinishPreviewSnapshot().params.radius===2);
  assert.equal(await page.eval(()=>document.getElementById('mdAcceptCommand').disabled),true);
  await page.eval(()=>document.querySelector('#mdQuickSettings .md-collect-geometry').click());
  assert.equal(await page.eval(()=>window.cadSelectionSnapshot().activeFilter),'all');
  assert.equal(await page.eval(()=>window.cadSelectionSnapshot().filter),'vertex');
  if(width<600) assert.equal(await page.eval(()=>document.getElementById('md-sheet').classList.contains('on')),false);
  await page.eval(()=>{
   const mobile=[...document.querySelectorAll('#md-ctx button')].find(b=>b.textContent==='Parameters');
   (mobile||document.getElementById('mdReturnParameters')).click();
  });
  assert.equal(await page.eval(()=>document.querySelector('#mdQuickSettings input[data-parameter="radius"]').value),'8/4');
  assert.match(await page.eval(()=>document.querySelector('#mdQuickSettings .md-expression-result').textContent),/= 2/);
  const before=await page.eval(()=>window.cadLoopSnapshot().undoDepth);
  await page.eval(()=>{
   const input=document.querySelector('#mdQuickSettings input[data-parameter="radius"]');input.value='8/';input.dispatchEvent(new Event('input',{bubbles:true}));
   document.querySelector('#mdQuickSettings .md-quick-apply').click();
  });
  assert.equal(await page.eval(()=>window.cadLoopSnapshot().undoDepth),before);
  assert.equal(await page.eval(()=>window.cadFinishPreviewSnapshot().params.radius),2);
  assert.equal(await page.eval(()=>document.querySelector('#mdQuickSettings input[data-parameter="radius"]').getAttribute('aria-invalid')),'true');
  await page.eval(()=>document.getElementById('mdCancelCommand').click());
  assert.equal(await page.eval(()=>window.cadSelectionSnapshot().activeFilter),'vertex');
  assert.equal(await page.eval(()=>window.__blocking),0);
 }finally{await page.close();}
});

test('committed expressions repeat with fresh references and discard requires an answer',opts,async()=>{
 const page=await openPage({width:1280,height:844,lang:'en'});
 try{
  await start(page);
  await page.eval(()=>{
   document.querySelector('[data-selfilter="body"]').click();
   window.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));
   window.cadOpenFeatureForm('pattern');
   for(const [key,value] of [['axisX',true],['axisY',false],['axisZ',false]]){
    const input=document.querySelector(`#mdQuickSettings input[data-parameter="${key}"]`);
    input.checked=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
   }
   for(const [key,value] of [['countX','6/2'],['spacingX','80/4']]){
    const input=document.querySelector(`#mdQuickSettings input[data-parameter="${key}"]`);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
   }
   window.expressionPatternBeforeCommit=window.cadFinishPreviewSnapshot();
   document.getElementById('mdAcceptCommand').click();
  });
  await page.waitUntil(()=>window.cadLoopSnapshot().authoring===null);
  const commit=await page.eval(()=>window.cadLoopSnapshot());
  assert.equal(commit.parts,3,JSON.stringify({commit,preview:await page.eval(()=>window.expressionPatternBeforeCommit)}));
  await page.eval(()=>{
   document.getElementById('mdCommandSearchBtn').click();
   const input=document.getElementById('mdCommandSearchInput');input.value='Repeat last';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitUntil(()=>!!document.querySelector('#mdCommandResults [data-command="repeatlast"]'));
  await page.eval(()=>document.querySelector('#mdCommandResults [data-command="repeatlast"]').click());
  assert.equal(await page.eval(()=>window.cadFinishPreviewSnapshot().params.spacingX),20);
  assert.equal(await page.eval(()=>window.cadSelectionSnapshot().topology),0);
  await page.eval(()=>document.getElementById('mdCancelCommand').click());
  assert.equal(await page.eval(()=>window.cadLoopSnapshot().undoDepth),commit.undoDepth);
  await page.eval(()=>document.getElementById('mdClose').click());
  await page.waitUntil(()=>document.getElementById('mdDecision')?.open);
  assert.equal(await page.eval(()=>getComputedStyle(document.getElementById('modeler')).display),'flex');
  await page.eval(()=>document.querySelector('#mdDecision [data-decision="accept"]').click());
  await page.waitUntil(()=>getComputedStyle(document.getElementById('modeler')).display==='none');
  assert.equal(await page.eval(()=>localStorage.getItem('home3d_modeler_draft')),null);
  assert.equal(await page.eval(()=>window.__blocking),0);
 }finally{await page.close();}
});

test('library delete is nonblocking, cancellable, and uses the named model',opts,async()=>{
 const page=await openPage({width:390,height:844,lang:'he',mobile:true,touch:true});
 try{
  await page.goto('/');await page.waitForBoot();
  await page.eval(async def=>{const {saveModelLibrary}=await import('/js/core/model_library_store.js');await saveModelLibrary([def]);},model);
  await start(page);
  await page.eval(()=>document.querySelector('#mdLib .md-card-x').click());
  await page.waitUntil(()=>document.getElementById('mdDecision')?.open);
  assert.match(await page.eval(()=>document.getElementById('mdDecision').textContent),/Recovery <test>/);
  await page.eval(()=>document.querySelector('#mdDecision [data-decision="cancel"]').click());
  assert.equal(await page.eval(()=>document.querySelectorAll('#mdLib .md-card').length),1);
  await page.eval(()=>document.querySelector('#mdLib .md-card-x').click());
  await page.waitUntil(()=>document.getElementById('mdDecision')?.open);
  await page.eval(()=>document.querySelector('#mdDecision [data-decision="accept"]').click());
  await page.waitUntil(()=>document.querySelectorAll('#mdLib .md-card').length===0);
  assert.equal(await page.eval(()=>window.__blocking),0);
 }finally{await page.close();}
});

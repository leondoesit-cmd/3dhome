import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'Chrome unavailable'};
test('Add remains visible and launches the editor after reload and drawer dismissal',opts,async()=>{
 const page=await openPage({width:390,height:844,lang:'en',mobile:true,touch:true});
 try {
  await page.goto('/');await page.waitForBoot();
  await page.eval(()=>{localStorage.setItem('home3d_left_tab','tree');localStorage.setItem('home3d_start_done','1');});
  await page.goto('/');await page.waitForBoot();
  await page.eval(()=>document.querySelector('#mobile-nav [data-mnav="add"]').click());
  await page.waitUntil(()=>document.body.classList.contains('show-left'));
  // The legacy swipe listener closes the real drawer, outside mobile_shell.
  await page.eval(()=>{
   const drawer=document.getElementById('left-sidebar');
   for(const [type,x] of [['touchstart',190],['touchmove',20]]) {
    const event=new Event(type,{bubbles:true});Object.defineProperty(event,'touches',{value:[{clientX:x,clientY:440}]});drawer.dispatchEvent(event);
   }
  });
  assert.equal(await page.eval(()=>document.body.classList.contains('show-left')),false);
  assert.equal(await page.eval(()=>document.querySelector('#mobile-nav [data-mnav="add"]').getAttribute('aria-expanded')),'false','dismissal also clears the expanded state');
  await page.eval(()=>document.querySelector('#mobile-nav [data-mnav="add"]').click());
  assert.equal(await page.eval(()=>document.body.classList.contains('show-left')),true,'first tap must reopen the dismissed drawer');
  await page.eval(()=>new Promise(r=>setTimeout(r,300)));
  // The Round-6 phone library is the catalog only (the model editor is on the
  // header knob), so what must be reachable is the library itself: its search.
  const hit=await page.eval(()=>{const button=document.getElementById('furnSearch'),r=button.getBoundingClientRect();return {rect:{x:r.x,y:r.y,w:r.width,h:r.height},hits:document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).slice(0,4).map(x=>x.id||x.className),pane:document.getElementById('left-sidebar').dataset.left,visible:r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight,reachable:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
  assert.equal(hit.pane,'library');assert.equal(hit.visible,true);assert.equal(hit.reachable,true,JSON.stringify(hit));
  await page.eval(()=>document.getElementById('openModelerBtn').click());
  await page.waitUntil(()=>!!document.getElementById('modeler')&&getComputedStyle(document.getElementById('modeler')).display!=='none');
 }finally{await page.close();}
});

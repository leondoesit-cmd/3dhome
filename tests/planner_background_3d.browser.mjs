import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../tools/browser_harness.mjs';

for (const [width,height] of [[1280,900],[390,844]]) test(`plan paints before background 3D; dollhouse shares navigation (${width}px)`,
  process.env.MF_BROWSER_GPU === '1' ? {timeout:90000} : {skip:'Run with MF_BROWSER_GPU=1'}, async () => {
  const page=await openPage({width,height});
  try {
    await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.setItem('home3d_viewmode','plan');
      window.addEventListener('planner-boot-ready',()=>queueMicrotask(()=>{
        if(window.__home3dBooted&&!window.boot3DProbe) window.boot3DProbe=import('/js/view3d.js').then(v=>({
          initialized:v.has3D(),plan:document.getElementById('center-canvas').classList.contains('max-view-2d')
        }));
      }));`});
    await page.goto('/');
    assert.deepEqual(await page.eval(()=>window.boot3DProbe),{initialized:false,plan:true});
    await page.waitUntil(async()=>{
      const v=await import('/js/view3d.js'),r=v.getRenderer();
      return v.has3D()&&r?.initialized&&r.info.render.calls>0;
    },{ms:60000,what:'background first GPU frame while plan remains visible'});
    const result=await page.eval(async()=>{
      const v=await import('/js/view3d.js'),{S}=await import('/js/state.js');
      const frame=()=>new Promise(requestAnimationFrame);
      while(S.dirty3D)await frame();
      const renderer=v.getRenderer(),scene=v.getDynGroup();
      const hiddenReady=document.getElementById('center-canvas').classList.contains('max-view-2d');
      window.__setViewMode('3d'); await frame(); await frame();
      v.setOrbitCamera({theta:1.37,phi:.81,radius:1730,target:{x:135,y:123,z:264}});
      const before=v.getNavigationView();
      const cutBefore=!!S.cutaway?.on;
      document.getElementById('dollhouseBtn').click();
      while(S.dirty3D)await frame();
      const cutAfter=!!S.cutaway?.on, dollhouse=v.getNavigationView();
      document.getElementById('dollhouseBtn').click();
      while(S.dirty3D)await frame();
      window.__setViewMode('plan');window.__setViewMode('3d');await frame();await frame();
      return {hiddenReady,before,dollhouse,after:v.getNavigationView(),cutBefore,cutAfter,
        cutRestored:!!S.cutaway?.on,shared:renderer===v.getRenderer()&&scene===v.getDynGroup()};
    });
    assert.equal(result.hiddenReady,true);
    assert.equal(result.shared,true);
    assert.notEqual(result.cutBefore,result.cutAfter);
    assert.equal(result.cutRestored,result.cutBefore);
    assert.deepEqual(result.dollhouse,result.before);
    assert.deepEqual(result.after,result.before);
  } finally {await page.close();}
});

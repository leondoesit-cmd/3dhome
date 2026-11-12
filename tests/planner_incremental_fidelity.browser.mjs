import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../tools/browser_harness.mjs';
import { servePlannerPerformance } from './helpers/planner_performance_server.mjs';
import { plannerPerformanceFixture } from './helpers/planner_performance_fixture.mjs';

for(const backend of ['webgpu','webgl2'])test(`incremental planner geometry and complete pixels match full rebuild (${backend})`,
  process.env.MF_BROWSER_GPU==='1'?{timeout:180000}:{skip:'Requires MF_BROWSER_GPU=1 and hardware browser'},async()=>{
  const server=await servePlannerPerformance();
  const page=await openPage({width:1280,height:900,lang:'en'});
  try {
    await page.send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('home3d_start_done','1');"});
    await page.send('Page.navigate',{url:server.origin+(backend==='webgl2'?'/?forceWebGL':'/')});
    await page.waitUntil(new Function('return location.origin === '+JSON.stringify(server.origin)+' && !!window.__home3dBooted'));
    await page.eval(async()=>{
      const {S}=await import('/js/state.js'),view=await import('/js/view3d.js');
      window.__setViewMode('3d');await view.init3D();
      S.nodes=[];S.walls=[];S.openings=[];S.items=[];S.roomMeta={};S.roof=null;
      S.cutaway='full';S.edit3D=false;S.showCeiling=false;
      for(let row=0;row<2;row++)for(let col=0;col<4;col++){
        const base=S.nodes.length,x=col*450,z=row*450;
        S.nodes.push({x,z},{x:x+350,z},{x:x+350,z:z+350},{x,z:z+350});
        for(let i=0;i<4;i++)S.walls.push({id:S.walls.length+1,a:base+i,b:base+(i+1)%4,height:280,thickness:12});
      }
      S.sel={kind:'wall',ref:S.walls[0]};S.dirty3D=false;
      view.rebuild3D();view.applyEnv();view.frameView();window.perfFixture={S,view};
    });
    await page.waitUntil(()=>window.perfFixture.view.getRenderer()?.initialized,{ms:60000});
    const result=await page.evalWithTimeout(180000,plannerPerformanceFixture);
    assert.equal(result.backend,backend);
    assert.equal(result.geometryEqual,true);assert.equal(result.boundsEqual,true);
    assert.equal(result.retained,28);assert.equal(result.totalWalls,32);
    assert.equal(result.directEqual,true);assert.equal(result.captureStable,true);
    assert.equal(result.pixels.different,0);assert.equal(result.controlPixels.different,0);
    assert.ok(result.materialsReleased>0,'retired materials are released after replacements draw');
    assert.ok(result.invalidation.every(check=>check.equal),JSON.stringify(result.invalidation));
    assert.deepEqual(page.consoleErrors,[]);
  }finally{await page?.close();await server.close();}
});

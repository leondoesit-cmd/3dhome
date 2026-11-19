import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../tools/browser_harness.mjs';

test('agent UI initializes synchronously on first use while bridge is available at boot', async () => {
  const page=await openPage({width:1280,height:900});
  if(!page)throw new Error('Browser required');
  try {
    assert.deepEqual(await page.eval(()=>({dock:!!document.getElementById('agent-dock'),bridge:!!window.ModelForgeAgent})),{dock:false,bridge:true});
    assert.equal(await page.eval(()=>{document.getElementById('agentBtn').click();return !!document.querySelector('#agent-dock.on');}),true);
    await page.waitUntil(()=>!!document.querySelector('#agent-dock.on'));
    assert.equal(await page.eval(()=>document.querySelectorAll('#agent-dock').length),1);
    await page.eval(async()=>{(await import('/js/ui_agent.js')).closeAgent();(await import('/js/ui_agent.js')).openAgent();});
    assert.equal(await page.eval(()=>document.querySelectorAll('#agent-dock').length),1);
    await page.eval(async()=>{(await import('/js/ui_site.js')).openSettings('agent');});
    await page.waitUntil(()=>!!document.querySelector('.settings-agent-pane:not([hidden]) .agent-settings'));
  } finally {await page.close();}
});

test('planner checkpoints restore textures after active history pool collection', async () => {
  const page=await openPage({width:1280,height:900});
  if(!page)throw new Error('Browser required');
  try {
    const result=await page.eval(async()=>{
      const {S}=await import('/js/state.js'),history=await import('/js/history.js');
      const {applyData}=await import('/js/ui.js');
      await applyData({nodes:[{x:0,z:0},{x:100,z:0}],walls:[{id:1,a:0,b:1,height:280,thickness:12}],items:[],openings:[],roomMeta:{}});
      S.walls[0].tex='data:text/plain,checkpoint';
      const saved=history.captureHistorySession();
      for(let i=0;i<100;i++){history.pushHistory('texture');S.walls[0].tex='data:text/plain,'+i;}
      await new Promise(resolve=>setTimeout(resolve,1800));
      const restored=history.restoreHistorySession(saved);
      const texture=S.walls[0].tex;
      history.pushHistory('height');S.walls[0].height=300;history.undo();
      return {restored,texture,height:S.walls[0].height};
    });
    assert.deepEqual(result,{restored:true,texture:'data:text/plain,checkpoint',height:280});
  } finally {await page.close();}
});

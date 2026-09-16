import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';

const chrome=await findChrome();
const opts=chrome?{timeout:60000}:{skip:'Chrome unavailable'};

test('Front leaves a selected top face and Measure on the world X/Y camera',opts,async(t)=>{
 const page=await openPage({width:1280,height:800,lang:'en'});
 try{
  await page.goto('/');await page.waitForBoot();
  await page.eval(async()=>{
   const {openModeler}=await import('/js/modeler.js');
   openModeler(null,{
    key:'battery-front-view',name:'Battery front-view regression',
    metadata:{authoringSystem:'legacy-adapter'},
    parts:[{id:'battery',name:'Battery',kind:'box',x0:-3.429,x1:3.429,y0:0,y1:11.43,z0:-3.429,z1:3.429}],
   },null);
  });
  await page.waitUntil(()=>window.cadSelectionSnapshot?.().mode==='3d',{what:'the model editor'});
  await page.waitUntil(()=>!!window.cadSketchSnapshot?.().viewPose,{what:'the 3D camera'});
  const picked=await page.eval(()=>{
   window.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));
   const snap=window.cadSelectionSnapshot();
   const at=snap.ids.findIndex((id,index)=>snap.kinds[index]==='face'&&/:face:top$/.test(id));
   return at>=0&&window.cadSelectTopologyById(snap.ids[at]);
  });
  assert.equal(picked,true,'could not retain the battery top face selection');

  await page.eval(()=>{
   document.querySelector('#modeler [data-command="measure"]').click();
   document.querySelector('#modeler [data-view="front"]').click();
  });
  const during=await page.eval(()=>({
   sketch:window.cadSketchSnapshot(),selection:window.cadSelectionSnapshot(),
   frontOn:document.querySelector('#modeler [data-view="front"]').classList.contains('on'),
   measureOn:document.querySelector('#modeler [data-command="measure"]').classList.contains('on'),
  }));
  assert.equal(during.frontOn,true);
  assert.equal(during.measureOn,true);
  assert.equal(during.selection.kinds[0],'face');
  if(!during.sketch.viewPose){t.skip('GPU preview unavailable');return;}
  assert.equal(during.sketch.hasFixedFrame,false,'Front must clear the selected face frame');
  assert.ok(Math.abs(during.sketch.viewPose.az)<1e-9,JSON.stringify(during.sketch.viewPose));
  assert.ok(Math.abs(during.sketch.viewPose.el-.05)<1e-9,JSON.stringify(during.sketch.viewPose));

  await page.eval(()=>{
   document.querySelector('#mdEvalCard [data-close],#mdEvalCard button')?.click();
   document.querySelector('#modeler [data-view="top"]').click();
   document.querySelector('#modeler [data-view="front"]').click();
  });
  const after=await page.eval(()=>window.cadSketchSnapshot());
  assert.equal(after.hasFixedFrame,false);
  assert.ok(Math.abs(after.viewPose.az)<1e-9&&Math.abs(after.viewPose.el-.05)<1e-9);
 }finally{await page.close();}
});

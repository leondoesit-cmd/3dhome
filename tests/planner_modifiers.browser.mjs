import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from '../tools/browser_harness.mjs';
const opts=process.env.MF_BROWSER_GPU==='1'?{}:{skip:'Run with MF_BROWSER_GPU=1 for real pointer picking'};
for(const walk of [false,true])test(`Shift selects multiple planning corners with real pointers in ${walk?'walk':'orbit'}`,opts,async()=>{
 const page=await openPage({width:1440,height:1000});
 try{
  await page.goto('/');await page.waitForBoot();await page.eval(()=>document.querySelector('[data-start="recreate"]')?.click());
  await page.eval(async()=>{
   const {S}=await import('/js/state.js');await (await import('/js/ui.js')).applyData({nodes:[{x:-80,z:100},{x:80,z:100}],walls:[{id:1,a:0,b:1,height:10,thickness:10,lock:false}],openings:[],items:[],roomMeta:{}});
   S.structLocked=false;(await import('/js/interaction.js')).setTool('select');window.__setViewMode('3d');
  });
  await page.waitUntil(async()=>(await import('/js/view3d.js')).has3D(),{ms:30000,what:'GPU'});
  const points=await page.eval(async(walk)=>{
   const v=await import('/js/view3d.js'),{S}=await import('/js/state.js'),{THREE}=await import('/js/three_lazy.js');
   v.restoreNavigationView({walk,walkView:'fpv',position:{x:0,y:0,z:-300},yaw:0,pitch:-.3,orbit:{theta:0,phi:.7,radius:750,target:{x:0,y:0,z:100}}});
   v.requestRender();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   const r=document.getElementById('v3d').getBoundingClientRect();
   return S.nodes.map(p=>{const q=new THREE.Vector3(p.x,0,p.z).project(v.getMainCamera());return {x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2};});
  },walk);
  const samples=[];
  for(let i=0;i<points.length;i++){
   const p=await page.eval(async(i)=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const v=await import('/js/view3d.js'),{S}=await import('/js/state.js'),{THREE}=await import('/js/three_lazy.js'),r=document.getElementById('v3d').getBoundingClientRect(),n=S.nodes[i],q=new THREE.Vector3(n.x,0,n.z).project(v.getMainCamera());return {x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2};},i);
   samples.push(await page.eval(async(p)=>({hit:(await import('/js/view3d.js')).plannerPointer3D(p.x,p.y),element:document.elementFromPoint(p.x,p.y)?.id}),p));
   await page.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1,modifiers:8});
   await page.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1,modifiers:8});
  }
  const result=await page.eval(async()=>{const {S}=await import('/js/state.js');return {kind:S.sel?.kind,refs:S.sel?.refs,action:S.action};});
  assert.equal(result.kind,'nodes',JSON.stringify({result,samples}));assert.deepEqual(result.refs,[0,1]);assert.equal(result.action,null);
 }finally{await page.close();}
});
for(const walk of [false,true])test(`wall surface points retain measured height across view changes and undo in ${walk?'walk':'orbit'}`,opts,async()=>{
 const page=await openPage({width:1440,height:1000});
 try{
  await page.goto('/');await page.waitForBoot();await page.eval(()=>document.querySelector('[data-start="recreate"]')?.click());
  await page.eval(async()=>{const {S}=await import('/js/state.js');await (await import('/js/ui.js')).applyData({nodes:[{x:-200,z:100},{x:200,z:100}],walls:[{id:1,a:0,b:1,height:270,thickness:20,lock:false}],openings:[],items:[],markers:[],roomMeta:{}});S.snap=false;S.gsnap=false;S.structLocked=false;(await import('/js/interaction.js')).setTool('point');window.__setViewMode('3d');});
  await page.waitUntil(async()=>(await import('/js/view3d.js')).has3D(),{ms:30000,what:'GPU'});
  const aim=await page.eval(async(walk)=>{
   const v=await import('/js/view3d.js'),{THREE}=await import('/js/three_lazy.js');v.restoreNavigationView({walk,walkView:'fpv',position:{x:0,y:0,z:-300},yaw:0,pitch:0,orbit:{theta:-Math.PI/2,phi:1.2,radius:750,target:{x:0,y:130,z:100}}});
   v.requestRender();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   const r=document.getElementById('v3d').getBoundingClientRect(),q=new THREE.Vector3(0,135,90).project(v.getMainCamera()),p={x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2};
   return {...p,height:v.plannerPointer3D(p.x,p.y).hit?.point.y};
  },walk);
  assert.ok(aim.height>100&&aim.height<170,JSON.stringify(aim));
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,x:aim.x,y:aim.y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  const result=await page.eval(async()=>{const {S}=await import('/js/state.js'),{undo}=await import('/js/history.js');const marker=structuredClone(S.markers[0]);window.__setViewMode('plan');window.__setViewMode('3d');const preserved=JSON.stringify(marker)===JSON.stringify(S.markers[0]);undo();return {marker,preserved,remaining:S.markers.length};});
  assert.ok(Math.abs(result.marker.y-aim.height)<.01,JSON.stringify(result));assert.equal(result.marker.surface,'wall');assert.equal(result.marker.wall,1);assert.equal(result.preserved,true);assert.equal(result.remaining,0);
 }finally{await page.close();}
});
test('completed arc draft points and survey mission survive 2D, split, orbit and walk changes',opts,async()=>{
 const page=await openPage({width:1440,height:1000});
 try{
  await page.goto('/');await page.waitForBoot();await page.eval(()=>document.querySelector('[data-start="recreate"]')?.click());
  const result=await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{setTool}=await import('/js/interaction.js'),{dispatchPlannerInput}=await import('/js/planner_input.js'),{startSurvey}=await import('/js/survey.js');
   await applyData({nodes:[],walls:[],openings:[],items:[],roomMeta:{}});S.structLocked=false;S.gsnap=false;S.snap=false;S.workspace.survey=startSurvey(S);setTool('arcwall');window.__setViewMode('3d');
   const v=await import('/js/view3d.js');while(!v.has3D())await new Promise(requestAnimationFrame);
   const send=(x,z)=>{for(const phase of ['move','down','up'])dispatchPlannerInput(phase,{point:{x,z},scale:1,width:1000,height:800,event:{pointerId:1,buttons:phase==='down'?1:0}});};
   send(0,0);send(150,100);const draft=JSON.stringify(S.arcDraft),survey=JSON.stringify(S.workspace.survey),floor=S.workspace.activeFloor;
   const kept=[];
   for(const mode of ['plan','3d','split']){window.__setViewMode(mode);kept.push(JSON.stringify(S.arcDraft)===draft&&S.tool==='arcwall'&&S.workspace.activeFloor===floor&&JSON.stringify(S.workspace.survey)===survey);}
   const active=document.documentElement.dataset.plannerViewport;v.toggleWalk(true);kept.push(JSON.stringify(S.arcDraft)===draft);send(300,0);
   const walls=S.walls.length,arc=S.walls[0]?.geometry;return {kept,active,walls,arc};
  });
  assert.ok(result.kept.every(Boolean),JSON.stringify(result));assert.equal(result.active,'3d');assert.equal(result.walls,1);assert.ok(result.arc,JSON.stringify(result));
 }finally{await page.close();}
});
test('arc drafts do not split hosts until commit, and both splits undo with the arc',opts,async()=>{
 const page=await openPage({width:1440,height:1000});
 try{
  await page.goto('/');await page.waitForBoot();
  const result=await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{setTool,arcWallPoint}=await import('/js/interaction.js'),{undo}=await import('/js/history.js');
   await applyData({nodes:[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}],walls:[{id:1,a:0,b:1},{id:2,a:1,b:2},{id:3,a:2,b:3},{id:4,a:3,b:0}].map(w=>({...w,height:270,thickness:10,lock:false})),openings:[],items:[],roomMeta:{}});S.structLocked=false;S.snap=false;
   const snapshot=()=>JSON.stringify({nodes:S.nodes.map(n=>[n.x,n.z]),walls:S.walls.map(w=>[w.id,w.a,w.b])}),before=snapshot();
   setTool('arcwall');arcWallPoint({x:100,z:0});arcWallPoint({x:150,z:100});const detached=snapshot()===before;setTool('select');const cancelled=snapshot()===before&&!S.arcDraft;
   setTool('arcwall');arcWallPoint({x:100,z:0});arcWallPoint({x:150,z:100});arcWallPoint({x:200,z:0});const after=S.walls.length;undo();return {detached,cancelled,after,restored:snapshot()===before};
  });assert.deepEqual(result,{detached:true,cancelled:true,after:7,restored:true});
 }finally{await page.close();}
});

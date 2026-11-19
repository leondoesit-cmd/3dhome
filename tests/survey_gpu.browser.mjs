import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from '../tools/browser_harness.mjs';
const opts=process.env.MF_BROWSER_GPU==='1'?{}:{skip:'Run with MF_BROWSER_GPU=1 for a real GPU'};
let page;test.after(async()=>page?.close());
test('real GPU survey handles commit once, cancel and undo in orbit and walk',opts,async()=>{
 page=await openPage({width:1440,height:1000});await page.goto('/');await page.eval(()=>document.querySelector('[data-start="recreate"]')?.click());
 await page.eval(async()=>{const {S}=await import('/js/state.js');const ui=await import('/js/ui.js');await ui.applyData({nodes:[],walls:[],items:[],openings:[],surveyFeatures:[{id:'roof',kind:'face',points:[{x:0,y:200,z:0},{x:150,y:200,z:0},{x:150,y:200,z:150},{x:0,y:200,z:150}]}]});S.structLocked=false;(await import('/js/interaction.js')).setTool('select');window.__setViewMode('3d');});
 await page.waitUntil(async()=> (await import('/js/view3d.js')).has3D(),{ms:30000,what:'GPU renderer'});
 await page.eval(async()=>{const v=await import('/js/view3d.js');await (await import('/js/gpu.js')).ready(v.getRenderer());while((await import('/js/state.js')).S.dirty3D)await new Promise(requestAnimationFrame);});
 for(const walk of [false,true]){
  await page.eval(async(walk)=>{const v=await import('/js/view3d.js');v.restoreNavigationView({walk,walkView:'fpv',position:{x:50,y:0,z:-300},yaw:0,pitch:0,orbit:{theta:.5,phi:.6,radius:750,target:{x:75,y:100,z:75}}});v.requestRender();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);},walk);
  const coords=await page.eval(async()=>{const {S}=await import('/js/state.js'),{THREE}=await import('/js/three_lazy.js'),v=await import('/js/view3d.js');(await import('/js/planner_3d.js')).paintPlanner3D();const r=document.getElementById('v3d').getBoundingClientRect(),p=S.surveyFeatures[0].points[2],q=new THREE.Vector3(p.x,p.y,p.z).project(v.getMainCamera());return {x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2,before:JSON.stringify(S.surveyFeatures)};});
  
  const mouse=(type,x,y,buttons)=>page.send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:1});
  await mouse('mousePressed',coords.x,coords.y,1);await mouse('mouseMoved',coords.x+30,coords.y+8,1);await mouse('mouseReleased',coords.x+30,coords.y+8,0);
  assert.notEqual(await page.eval(async()=>JSON.stringify((await import('/js/state.js')).S.surveyFeatures)),coords.before,walk?'walk drag':'orbit drag');
  await page.eval(async()=>{(await import('/js/history.js')).undo();});
  assert.equal(await page.eval(async()=>JSON.stringify((await import('/js/state.js')).S.surveyFeatures)),coords.before);
  await page.eval(async()=>{(await import('/js/planner_3d.js')).paintPlanner3D();});
  await mouse('mousePressed',coords.x,coords.y,1);await mouse('mouseMoved',coords.x+20,coords.y+5,1);
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await mouse('mouseReleased',coords.x+20,coords.y+5,0);
  assert.equal(await page.eval(async()=>JSON.stringify((await import('/js/state.js')).S.surveyFeatures)),coords.before);
 }
});
test('third-person camera retracts against walls and recovers while stationary',opts,async()=>{
 await page.eval(async()=>{const {S}=await import('/js/state.js'),v=await import('/js/view3d.js');await (await import('/js/ui.js')).applyData((await import('/js/survey_practice.js')).practiceDocument('rectangle'));S.workspace.navigationProfile={cameraDistance:230};S.dirty3D=true;v.requestRender();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);v.restoreNavigationView({walk:true,walkView:'tpv',position:{x:200,y:0,z:35},yaw:0,pitch:0});});
 await page.waitUntil(async()=>(await import('/js/state.js')).S.cameraObstructed===true,{what:'camera obstruction'});
 const initial=await page.eval(async()=>{const v=await import('/js/view3d.js');return v.getMainCamera().position.z;});
 await page.eval(async()=>{const {S}=await import('/js/state.js');S.walls=[];S.openings=[];S.dirty3D=true;(await import('/js/view3d.js')).requestRender();});
 await page.waitUntil(async()=>!(await import('/js/state.js')).S.cameraObstructed,{what:'camera clearance'});
 await page.waitUntil(async()=>(await import('/js/view3d.js')).getMainCamera().position.z< -170,{what:'stationary camera recovery'});
 assert.ok(initial>0,`camera crossed the wall: ${initial}`);
 const final=await page.eval(async()=>{const v=await import('/js/view3d.js');return {position:v.getNavigationView().position,camera:v.getMainCamera().position.z};});
 assert.deepEqual(final.position,{x:200,y:0,z:35});assert.ok(final.camera<initial);
});
test('walking respects doorway profile and suspends shortcuts during numeric entry',opts,async()=>{
 await page.eval(async()=>{const {S}=await import('/js/state.js');await (await import('/js/ui.js')).applyData((await import('/js/survey_practice.js')).practiceDocument('rectangle'));S.openings[0].open=true;S.workspace.navigationProfile={radius:44,height:165};S.dirty3D=true;window.__setViewMode('3d');document.activeElement?.blur();(await import('/js/view3d.js')).restoreNavigationView({walk:true,walkView:'fpv',position:{x:120,y:0,z:80},yaw:Math.PI,pitch:0});});
 const key=type=>page.send('Input.dispatchKeyEvent',{type,key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 const read=()=>page.eval(async()=>(await import('/js/view3d.js')).getNavigationView().position);
 const before=await page.eval(async()=>{const {S}=await import('/js/state.js');return JSON.stringify([S.nodes,S.walls,S.openings]);});
 await key('keyDown');await new Promise(r=>setTimeout(r,600));await key('keyUp');
 const wide=await read();assert.ok(wide.z>=49&&wide.z<80,JSON.stringify(wide));
 await page.eval(async()=>{const {S}=await import('/js/state.js');S.workspace.navigationProfile.radius=18;const input=document.createElement('input');input.id='survey-navigation-entry';input.type='number';document.body.append(input);input.focus();});
 const held=await read();await key('keyDown');await new Promise(r=>setTimeout(r,250));await key('keyUp');assert.deepEqual(await read(),held);
 await page.eval(()=>document.getElementById('survey-navigation-entry').remove());
 try{await key('keyDown');await page.waitUntil(async()=>(await import('/js/view3d.js')).getNavigationView().position.z< -25,{ms:3000,what:'walker through open doorway'});}finally{await key('keyUp');}
 assert.equal(await page.eval(async()=>{const {S}=await import('/js/state.js');return JSON.stringify([S.nodes,S.walls,S.openings]);}),before);
});
test('touch joystick stops at floor openings and releases movement cleanly',opts,async()=>{
 await page.resize(390,844,{mobile:true,touch:true});
 await page.eval(async()=>{const {S}=await import('/js/state.js');await (await import('/js/ui.js')).applyData((await import('/js/survey_practice.js')).practiceDocument('rectangle'));S.slabOpenings=[{id:'test-hole',x:200,z:150,w:80,d:40,rot:0}];S.workspace.navigationProfile={radius:18,height:165};S.dirty3D=true;window.__setViewMode('3d');(await import('/js/view3d.js')).restoreNavigationView({walk:true,walkView:'fpv',position:{x:200,y:0,z:230},yaw:Math.PI,pitch:0});document.activeElement?.blur();await new Promise(requestAnimationFrame);});
 const pos=await page.eval(()=>{const r=document.querySelector('.walk-stick').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.2,w:r.width,h:r.height};});
 assert.ok(pos.w>0&&pos.h>0,'Touch movement must be visible');
 try{await page.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pos.x,y:pos.y,id:1}]});await new Promise(r=>setTimeout(r,700));}
 finally{await page.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 const read=()=>page.eval(async()=>(await import('/js/view3d.js')).getNavigationView().position);
 const stopped=await read();assert.ok(stopped.z>=188&&stopped.z<230,JSON.stringify(stopped));
 await new Promise(r=>setTimeout(r,150));assert.deepEqual(await read(),stopped);
});
test('walking climbs a measured stair flight and exits its upper floor opening',opts,async()=>{
 await page.resize(1280,900,{mobile:false,touch:false});
 await page.eval(async()=>{const {S}=await import('/js/state.js');await (await import('/js/ui.js')).applyData((await import('/js/survey_practice.js')).practiceDocument('multilevel'));S.workspace.navigationProfile={radius:18,height:165,stepHeight:20,slopeLimit:45};window.__setViewMode('3d');document.activeElement?.blur();(await import('/js/view3d.js')).restoreNavigationView({walk:true,walkView:'fpv',position:{x:200,y:0,z:540},yaw:Math.PI,pitch:0});});
 const key=type=>page.send('Input.dispatchKeyEvent',{type,key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 try{
  await key('keyDown');await page.waitUntil(async()=>{const {S}=await import('/js/state.js'),v=await import('/js/view3d.js');return S.workspace.activeFloor==='practice-upper'&&v.getNavigationView().position.z<100;},{ms:7000,what:'upper stair landing exit'});
 }finally{await key('keyUp');}
 const result=await page.eval(async()=>{const {S}=await import('/js/state.js'),v=await import('/js/view3d.js');return {y:v.getNavigationView().position.y,walls:S.walls.length,floors:S.workspace.floors.length};});
 assert.deepEqual(result,{y:0,walls:4,floors:2});
});
test('walking speed uses profile centimetres per second',opts,async()=>{
 await page.eval(async()=>{const {S}=await import('/js/state.js');await (await import('/js/ui.js')).applyData({nodes:[],walls:[],openings:[],items:[]});S.workspace.navigationProfile={speed:120};window.__setViewMode('3d');document.activeElement?.blur();(await import('/js/view3d.js')).restoreNavigationView({walk:true,walkView:'fpv',position:{x:0,y:0,z:0},yaw:0,pitch:0});});
 const before=await page.eval(()=>performance.now());
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 await new Promise(r=>setTimeout(r,500));
 await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
 const result=await page.eval(async()=>({time:performance.now(),z:(await import('/js/view3d.js')).getNavigationView().position.z}));
 const speed=result.z/((result.time-before)/1000);assert.ok(speed>80&&speed<160,`Measured ${speed} cm/s for a 120 cm/s profile`);
});

test('camera volume catches a measured face between rays and respects clearance radius',opts,async()=>{
 await page.resize(1280,900,{mobile:false,touch:false});
 const before=await page.eval(async()=>{
  const {S}=await import('/js/state.js'),{THREE}=await import('/js/three_lazy.js'),v=await import('/js/view3d.js');
  const pivot=new THREE.Vector3(0,95,0),direction=new THREE.Vector3(0,45,-230).normalize(),right=new THREE.Vector3(1,0,0),up=new THREE.Vector3().crossVectors(direction,right).normalize();
  const p=pivot.clone().addScaledVector(direction,70).addScaledVector(right,6).addScaledVector(up,6);
  const points=[p,p.clone().add(right),p.clone().add(up)].map(q=>({x:q.x,y:q.y,z:q.z}));
  await (await import('/js/ui.js')).applyData({nodes:[],walls:[],openings:[],items:[],surveyFeatures:[{id:'thin-camera-obstacle',kind:'face',points}]});
  S.workspace.navigationProfile={cameraDistance:230,cameraRadius:10};window.__setViewMode('3d');S.dirty3D=true;
  v.restoreNavigationView({walk:true,walkView:'tpv',position:{x:0,y:0,z:0},yaw:0,pitch:0});v.requestRender();
  return JSON.stringify(S.surveyFeatures);
 });
 await page.waitUntil(async()=>{
  const {S}=await import('/js/state.js'),v=await import('/js/view3d.js'),p=v.getMainCamera().position;
  return S.cameraObstructed&&Math.hypot(p.x,p.y-95,p.z)<67;
 },{what:'camera volume retracts before the thin face'});
 await page.eval(async()=>{const {S}=await import('/js/state.js');S.workspace.navigationProfile.cameraRadius=4;(await import('/js/view3d.js')).requestRender();});
 await page.waitUntil(async()=>{
  const {S}=await import('/js/state.js'),v=await import('/js/view3d.js'),p=v.getMainCamera().position;
  return !S.cameraObstructed&&Math.hypot(p.x,p.y-95,p.z)>220;
 },{what:'smaller camera volume clears the same face and recovers'});
 assert.equal(await page.eval(async()=>JSON.stringify((await import('/js/state.js')).S.surveyFeatures)),before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage} from '../tools/browser_harness.mjs';
const opts=process.env.MF_BROWSER_GPU==='1'?{}:{skip:'Run with MF_BROWSER_GPU=1 for physical viewport picking'};
let page;test.after(async()=>page?.close());
const snapshot=async()=>{
 const {S}=await import('/js/state.js');
 return JSON.stringify({nodes:S.nodes.map(n=>[n.x,n.z]),walls:S.walls.map(w=>[w.id,w.a,w.b,w.height,w.thickness,!!w.flip,!!w.layersReversed]),openings:S.openings,markers:S.markers,voids:S.slabOpenings,mepNodes:S.mep.nodes,mepRuns:S.mep.runs});
};
const cases=[
 ['select',[[200,0]],4],['wall',[[500,50],[750,50]],5],['rect',[[500,0],[800,250]],8],['arcwall',[[500,0],[650,100],[800,0]],5],
 ['door',[[200,0]],4],['window',[[200,0]],4],['passage',[[200,0]],4],['slabvoid',[[100,100],[250,230]],4],['point',[[200,-50]],4],
 ['roomstamp',[[800,150]],8],['wallbite',[[100,0,'mousePressed'],[220,0,'mouseMoved'],[220,0,'mouseReleased']],5],['walljoin',[[100,0],[300,0]],4],
 ['mepNode',[[200,0]],4],['mepRoute',[[100,-80],[300,-80]],4],['erase',[[200,0]],3],['walloffset',[[200,0],[200,-60]],5],['wallbreak',[[200,0]],5],['wallreverse',[[200,0]],4],['wallpaint',[[200,0]],4],
];
for(const walk of [false,true])for(const [tool,points,wallCount]of cases)test(`real ${walk?'walk':'orbit'} pointer operates ${tool}`,opts,async()=>{
 if(!page){page=await openPage({width:1600,height:1100});await page.goto('/');await page.waitForBoot();await page.eval(()=>document.querySelector('[data-start="recreate"]')?.click());}
 await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await page.eval(async({tool,walk})=>{
  const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{setTool,armRoomStamp}=await import('/js/interaction.js'),{dispatchPlannerInput}=await import('/js/planner_input.js');
  await applyData({nodes:[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}],walls:[{id:1,a:0,b:1},{id:2,a:1,b:2},{id:3,a:2,b:3},{id:4,a:3,b:0}].map(w=>({...w,height:270,thickness:10,lock:false})),items:[],openings:[],markers:[],roomMeta:{},idc:100});
  S.wallDrawDefaults={typeId:'generic',height:270,thickness:10};S.structLocked=false;S.gsnap=false;S.snap=false;S.snapGrid=false;S.mep.nodes=[];S.mep.runs=[];S.mep.route=null;S.drawFrom=null;S.drawing=false;
  // Wall-surface tools require visible walls, rather than the default near-wall cutaway.
  (await import('/js/wall_view.js')).setNearCut(false);
  if(tool==='walljoin'){setTool('wallbreak');for(const phase of ['down','up'])dispatchPlannerInput(phase,{point:{x:200,z:0},scale:1,width:1000,height:800,event:{pointerId:1}});}
  if(tool==='wallpaint')S.wallDrawDefaults={typeId:'exterior',height:300};
  setTool(tool);if(tool==='roomstamp')armRoomStamp('bedroom');if(tool.startsWith('mep')){S.mep.place={sys:'power',kind:tool==='mepNode'?'outlet':'circuit'};S.mep.wallRoute=false;}
  window.__setViewMode('3d');const v=await import('/js/view3d.js');while(!v.has3D())await new Promise(requestAnimationFrame);
  const centerX=['wall','rect','arcwall','roomstamp'].includes(tool)?650:200;
  v.restoreNavigationView({walk,walkView:'fpv',position:{x:centerX,y:0,z:-1100},yaw:0,pitch:-.12,orbit:{theta:-Math.PI/2,phi:.85,radius:1300,target:{x:centerX,y:50,z:80}}});v.requestRender();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);document.activeElement?.blur();
 },{tool,walk});
 await page.waitUntil(async()=>!(await import('/js/state.js')).S.dirty3D,{what:'current geometry rendered'});
 await page.eval(async()=>{await Promise.allSettled(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished));await new Promise(requestAnimationFrame);});
 const before=await page.eval(snapshot);
 const samples=[];
 for(const [x,z,phase]of points){
  const aim=await page.eval(async({x,z,tool})=>{
   await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   const v=await import('/js/view3d.js'),{THREE}=await import('/js/three_lazy.js'),r=document.getElementById('v3d').getBoundingClientRect();
   const hosted=z===0&&x<=400&&!['wall','arcwall','rect','slabvoid','roomstamp'].includes(tool),q=new THREE.Vector3(x,hosted?120:0,hosted?-5:z).project(v.getMainCamera());
   return {x:r.left+(q.x+1)*r.width/2,y:r.top+(1-q.y)*r.height/2};
  },{x,z,tool});
  samples.push(await page.eval(async(p)=>({point:p,element:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,180),tool:(await import('/js/state.js')).S.tool,hit:(await import('/js/view3d.js')).plannerPointer3D(p.x,p.y)?.point}),aim));
  for(const type of phase?[phase]:['mouseMoved','mousePressed','mouseReleased'])await page.send('Input.dispatchMouseEvent',{type,...aim,button:'left',buttons:type==='mousePressed'||(phase&&type==='mouseMoved')?1:0,clickCount:1});
 }
 if(tool==='mepRoute')await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 const result=await page.eval(async()=>{const {S}=await import('/js/state.js');return {walls:S.walls.length,openings:S.openings.length,markers:S.markers.length,voids:S.slabOpenings.length,mepNodes:S.mep.nodes.length,mepRuns:S.mep.runs.length,selection:S.sel?.kind,wallType:S.walls[0]?.wallTypeId,layersReversed:S.walls[0]?.layersReversed,draft:S.arcDraft,drawFrom:S.drawFrom,route:S.mep.route};});
 assert.equal(result.walls,wallCount,JSON.stringify({result,samples}));
 if(['door','window','passage'].includes(tool))assert.equal(result.openings,1);
 if(tool==='point')assert.equal(result.markers,1);if(tool==='slabvoid')assert.equal(result.voids,1);
 if(tool==='mepNode')assert.equal(result.mepNodes,1);if(tool==='mepRoute')assert.equal(result.mepRuns,1);
 if(tool==='select')assert.equal(result.selection,'wall',JSON.stringify({result,samples}));if(tool==='wallreverse')assert.equal(result.layersReversed,true);if(tool==='wallpaint')assert.equal(result.wallType,'exterior');
 if(tool!=='select'){await page.eval(async()=>{(await import('/js/history.js')).undo();});assert.equal(await page.eval(snapshot),before,tool+' undo restores canonical geometry');}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'Chrome unavailable'};let page;
test.after(async()=>page?.close());
const cases=[
 ['select',[[200,0]]],['wall',[[500,50],[750,50]]],['rect',[[500,0],[800,250]]],['arcwall',[[500,0],[650,100],[800,0]]],
 ['door',[[200,0]]],['window',[[200,0]]],['passage',[[200,0]]],['slabvoid',[[100,100],[250,230]]],['point',[[200,150]]],
 ['roomstamp',[[800,150]]],['wallbite',[[100,0,'down'],[220,0,'move'],[220,0,'up']]],['walljoin',[[100,0],[300,0]]],['mepNode',[[200,0]]],['mepRoute',[[100,0],[300,0]]],
 ['erase',[[200,0]]],['walloffset',[[200,0],[200,-60]]],['wallbreak',[[200,0]]],['wallreverse',[[200,0]]],['wallpaint',[[200,0]]],
];
for(const [tool,points]of cases)test(`same ${tool} command geometry through 2D and 3D input adapters`,opts,async()=>{
 if(!page){page=await openPage({width:1400,height:900});await page.goto('/');await page.waitForBoot();}
 const results=await page.eval(async({tool,points,gpu})=>{
  const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{setTool,armRoomStamp}=await import('/js/interaction.js'),input=await import('/js/planner_input.js'),flat=await import('/js/plan_view.js');
  const result=[];for(const mode of (gpu?['plan','3d','walk']:['plan','3d'])){
   await applyData({nodes:[{x:0,z:0},{x:400,z:0},{x:400,z:300},{x:0,z:300}],walls:[{id:1,a:0,b:1,height:270,thickness:10,lock:false},{id:2,a:1,b:2,height:270,thickness:10,lock:false},{id:3,a:2,b:3,height:270,thickness:10,lock:false},{id:4,a:3,b:0,height:270,thickness:10,lock:false}],items:[],openings:[],markers:[],roomMeta:{},idc:100});
   S.structLocked=false;S.mep.nodes=[];S.mep.runs=[];S.mep.route=null;S.snap=false;S.snapGrid=false;S.drawFrom=null;S.drawing=false;if(tool==='walljoin'){setTool('wallbreak');input.dispatchPlannerInput('down',{point:{x:200,z:0},scale:1,width:1000,height:800,event:{pointerId:1}});input.dispatchPlannerInput('up',{point:{x:200,z:0},scale:1,width:1000,height:800,event:{pointerId:1}});}
   setTool(tool);if(tool==='roomstamp')armRoomStamp('bedroom');if(tool.startsWith('mep')){S.mep.place={sys:'power',kind:tool==='mepNode'?'outlet':'circuit'};S.mep.wallRoute=false;}window.__setViewMode(mode==='walk'?'3d':mode);if(gpu&&mode!=='plan'){const v=await import('/js/view3d.js');while(!v.has3D())await new Promise(requestAnimationFrame);v.toggleWalk(mode==='walk');}await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   document.activeElement?.blur();
   const canvas=document.getElementById('plan');
   for(const [x,z,onlyPhase]of points){
    if(mode!=='plan'){for(const phase of onlyPhase?[onlyPhase]:['move','down','up'])input.dispatchPlannerInput(phase,{point:{x,z},scale:1,width:1000,height:800,event:{pointerId:1,buttons:phase==='down'?1:0}});}
    else{const p=flat.rotatePx(flat.sx(x),flat.sz(z)),r=canvas.getBoundingClientRect();for(const type of onlyPhase?['pointer'+onlyPhase]:['pointermove','pointerdown','pointerup']){canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',button:0,buttons:type==='pointerdown'?1:0,clientX:r.left+p.x,clientY:r.top+p.y}));await new Promise(requestAnimationFrame);}}
   }
   if(tool==='mepRoute')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
   result.push({mepNodes:S.mep.nodes.map(n=>({sys:n.sys,k:n.k,x:n.x,z:n.z,s:n.s})),mepRuns:S.mep.runs.map(r=>({sys:r.sys,k:r.k,pts:r.pts})),nodes:S.nodes.map(n=>({x:Math.round(n.x*1e5)/1e5,z:Math.round(n.z*1e5)/1e5})),walls:S.walls.map(w=>({a:w.a,b:w.b,height:w.height,thickness:w.thickness,geometry:w.geometry,flip:!!w.flip,layersReversed:!!w.layersReversed})),openings:S.openings.map(o=>({s:o.s,width:o.width,height:o.height,type:o.type})),markers:S.markers.map(m=>({x:m.x,z:m.z,y:m.y})),voids:S.slabOpenings?.map(o=>({x:o.x,z:o.z,w:o.w,d:o.d})),selection:S.sel?.kind||null});
  }
  return JSON.parse(JSON.stringify(result,(_key,value)=>typeof value==='number'?Math.round(value*1e6)/1e6:value));
 },{tool,points,gpu:process.env.MF_BROWSER_GPU==='1'});
 assert.deepEqual(results[1],results[0]);if(results[2])assert.deepEqual(results[2],results[0],'walking tool parity');
 const count={wall:5,rect:8,arcwall:5,walloffset:5,wallbreak:5,wallbite:5,walljoin:4,roomstamp:8,erase:3}[tool];if(count)assert.equal(results[1].walls.length,count);
 if(['door','window','passage'].includes(tool))assert.equal(results[1].openings.length,1);if(tool==='point')assert.equal(results[1].markers.length,1);if(tool==='slabvoid')assert.equal(results[1].voids.length,1);if(tool==='mepNode')assert.equal(results[1].mepNodes.length,1);if(tool==='mepRoute')assert.equal(results[1].mepRuns.length,1);
});

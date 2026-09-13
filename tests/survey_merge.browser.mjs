import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const options=await findChrome()?{}:{skip:'Chrome unavailable'};
for(const lang of ['en','he'])test(`segmented survey merge previews, connects rooms and undoes in ${lang}`,options,async()=>{
 const page=await openPage({width:lang==='he'?390:1280,height:900,lang});
 try{
  await page.goto('/');await page.waitForBoot();
  const result=await page.eval(async()=>{
   const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js');
   const {openRoomScanModal}=await import('/js/ui_room_scan.js'),{roomScanFromPoints}=await import('/js/room_scan.js');
   const {detectRooms}=await import('/js/geometry.js'),{undo}=await import('/js/history.js');
   await applyData({nodes:[{x:100,z:0},{x:200,z:0},{x:300,z:0},{x:300,z:200},{x:100,z:200}],walls:[{id:1,a:0,b:1},{id:2,a:1,b:2},{id:3,a:2,b:3},{id:4,a:3,b:4},{id:5,a:4,b:0}].map(w=>({...w,height:270,thickness:10})),openings:[],items:[],roomMeta:{}});
   S.idc=100;const before=JSON.stringify([S.nodes,S.walls,S.openings]),captures=S.workspace.survey?.captures?.length||0;
   const scan=roomScanFromPoints([{x:0,z:0},{x:400,z:0},{x:400,z:-200},{x:0,z:-200}]);scan.source='Manual test';
   openRoomScanModal(scan);
   const modal=document.querySelector('.roomscan-modal');modal.querySelector('[name="rs_mode"][value="merge"]').click();
   modal.querySelector('.roomscan-actions button').click();
   const form=modal.querySelector('.survey-form');form.querySelector('textarea').value='0 220\n400 220\n0 0\n400 0';form.querySelector('button').click();
   const note=modal.querySelector('.roomscan-reconciliation'),previewText=note.textContent,unchanged=JSON.stringify([S.nodes,S.walls,S.openings])===before;
   S.walls[0].height=300;
   modal.querySelector('[name="rs_mode"][value="replace"]').click();modal.querySelector('[name="rs_mode"][value="merge"]').click();
   const conflictShown=note.textContent!==previewText;
   await modal.querySelector('.roomscan-actions .btn-accent').onclick();
   const blocked=!!document.querySelector('.roomscan-modal')&&S.walls.length===5;
   S.walls[0].height=270;
   modal.querySelector('[name="rs_mode"][value="replace"]').click();modal.querySelector('[name="rs_mode"][value="merge"]').click();
   const confirm=window.confirm;window.confirm=()=>true;
   try{await modal.querySelector('.roomscan-actions .btn-accent').onclick();}finally{window.confirm=confirm;}
   const after={walls:S.walls.length,rooms:detectRooms().length,captures:S.workspace.survey.captures.length,closed:!document.querySelector('.roomscan-modal'),original:S.workspace.survey.captures.at(-1)?.original};
   undo();return {unchanged,previewText,conflictShown,blocked,after,restored:JSON.stringify([S.nodes,S.walls,S.openings])===before,captureDelta:after.captures-captures,sourceSame:JSON.stringify(after.original)===JSON.stringify(scan)};
  });
  assert.equal(result.conflictShown,true);assert.equal(result.blocked,true);assert.equal(result.unchanged,true);assert.match(result.previewText,/2/);
  assert.equal(result.after.closed,true,JSON.stringify(result));assert.equal(result.after.walls,10);assert.equal(result.after.rooms,2);
  assert.equal(result.captureDelta,1);assert.equal(result.sourceSame,true);assert.equal(result.restored,true);
 }finally{await page.close();}
});

for(const constrained of [false,true])for(const lang of ['en','he'])test(`partial wall overlap previews existing cuts and restores evidence on undo in ${lang} (constraints: ${constrained})`,options,async()=>{
 const page=await openPage({width:lang==='he'?390:1280,height:900,lang});
 try{
  await page.goto('/');await page.waitForBoot();
  const result=await page.eval(async(constrained)=>{
   const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js');
   const {openRoomScanModal}=await import('/js/ui_room_scan.js'),{roomScanFromPoints}=await import('/js/room_scan.js');
   const {detectRooms}=await import('/js/geometry.js'),{undo}=await import('/js/history.js'),{normalizeSurvey}=await import('/js/survey.js');
   await applyData({nodes:[{x:0,z:0},{x:400,z:0},{x:400,z:200},{x:0,z:200}],walls:[{id:1,a:0,b:1},{id:2,a:1,b:2},{id:3,a:2,b:3},{id:4,a:3,b:0}].map(w=>({...w,height:270,thickness:10,lock:false})),openings:[{id:5,wall:1,s:250,width:60,height:205,sill:0,type:'door',swingDir:'R_IN'}],items:constrained?[{id:10,type:'chair',x:350,z:40,w:60,d:60,h:80,rot:0,hold:{wall:1,gap:5,side:1}}]:[],wallCons:[],roomCons:[],roomMeta:{'1,2,3,4':{name:'Kitchen',hid:'kitchen'}}});
   S.structLocked=false;S.workspace.constraints=[];S.idc=100;
   S.mep={...S.mep,nodes:[{id:6,wall:1,s:350,x:350,z:0,y:120,kind:'socket'}],runs:[]};
   S.workspace.survey=normalizeSurvey({enabled:true,observations:[{id:'reading',target:{kind:'wall',id:1,floorId:S.workspace.activeFloor},field:'length',value:400,status:'checked'}]});
   if(constrained){
    S.wallCons=[{id:7,type:'dist',a:{k:'node',id:S.nodes[0].vid,wall:1,end:'a'},b:{k:'node',id:S.nodes[1].vid,wall:1,end:'b'},value:400,hold:'a'}];
    const rooms=await import('/js/room_cons.js');
    rooms.addRoomArea('1,2,3,4',rooms.roomAreaM2('1,2,3,4'),'exact');rooms.addRoomMinDim('1,2,3,4',rooms.roomMinDim('1,2,3,4'));
   }
   const snapshot=()=>JSON.stringify([S.nodes,S.walls,S.openings,S.mep,S.roomMeta,S.workspace.survey,S.wallCons,S.roomCons,S.items]);
   const before=snapshot();
   const scan=roomScanFromPoints([{x:100,z:0},{x:300,z:0},{x:300,z:-200},{x:100,z:-200}]);scan.source='Manual test';
   openRoomScanModal(scan);
   const modal=document.querySelector('.roomscan-modal');modal.querySelector('[name="rs_mode"][value="merge"]').click();modal.querySelector('.roomscan-actions button').click();
   const form=modal.querySelector('.survey-form');form.querySelector('textarea').value='100 220\n300 220\n100 0\n300 0';form.querySelector('button').click();
   const previewText=modal.querySelector('.roomscan-reconciliation').textContent,unchanged=snapshot()===before;
   const confirm=window.confirm;window.confirm=()=>true;
   let error=null;try{await modal.querySelector('.roomscan-actions .btn-accent').onclick();}catch(e){error=e.message;}finally{window.confirm=confirm;}
   const opening=S.openings.find(o=>o.id===5),host=S.walls.find(w=>w.id===opening.wall),service=S.mep.nodes[0],serviceHost=S.walls.find(w=>w.id===service.wall);
   const correction=(await import('/js/survey_correction.js')).prepareSurveyCorrection(S,S.workspace.survey.observations[0]);
   const after={error,correction:correction.reason,walls:S.walls.length,rooms:detectRooms().length,closed:!document.querySelector('.roomscan-modal'),name:Object.values(S.roomMeta).some(m=>m.name==='Kitchen'),openingX:S.nodes[host.a].x+opening.s,serviceX:S.nodes[serviceHost.a].x+service.s,status:S.workspace.survey.observations[0].status,value:S.workspace.survey.observations[0].value,splits:S.workspace.survey.captures.at(-1)?.wallSplits?.length};
   if(constrained){
    const constraints=await import('/js/wall_constraints.js'),rooms=await import('/js/room_cons.js');
    after.dimension=constraints.conCurrent(S.wallCons[0]);after.requirements=S.roomCons.every(c=>rooms.roomConSatisfied(c));
    const geometry=JSON.stringify(S.nodes.map(n=>({x:n.x,z:n.z})));constraints.solveWallCons();
    after.reseated=(await import('/js/item_align.js')).reseatHeldItems();
    after.held={x:S.items[0].x,z:S.items[0].z,gap:S.items[0].hold.gap,side:S.items[0].hold.side,hostStart:S.nodes[S.walls.find(w=>w.id===S.items[0].hold.wall).a].x};
    after.solverStable=JSON.stringify(S.nodes.map(n=>({x:n.x,z:n.z})))===geometry;
   }
   undo();return {previewText,unchanged,after,restored:snapshot()===before};
  },constrained);
  if(constrained){assert.equal(result.after.dimension,400);assert.equal(result.after.requirements,true);assert.equal(result.after.solverStable,true);assert.equal(result.after.reseated,0);assert.deepEqual(result.after.held,{x:350,z:40,gap:5,side:1,hostStart:300});}
  assert.equal(result.after.error,null,JSON.stringify(result));assert.equal(result.unchanged,true);assert.equal(result.after.closed,true,JSON.stringify(result));
  assert.equal(result.after.correction,'SURVEY_MORE_MEASUREMENTS');assert.equal(result.after.walls,9);assert.equal(result.after.rooms,2);assert.equal(result.after.name,true);
  assert.equal(result.after.openingX,250);assert.equal(result.after.serviceX,350);assert.equal(result.after.value,400);assert.equal(result.after.status,'unresolved');assert.equal(result.after.splits,1);assert.equal(result.restored,true,JSON.stringify(result));
 }finally{await page.close();}
});

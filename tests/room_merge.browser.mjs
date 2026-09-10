import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'no Chrome'};
test('merge preview preserves geometry and apply reconciles identity with one undo',opts,async()=>{
 const page=await openPage({width:1280,height:900});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {stampClosedLoop}=await import('/js/room_graph.js');
  const {detectRooms,reconcileRoomMeta}=await import('/js/geometry.js');const {select}=await import('/js/ui_props.js');
  const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');const {undo}=await import('/js/history.js');
  document.querySelector('[data-start="recreate"]').click();
  const poly=x=>[{x,z:0},{x:x+400,z:0},{x:x+400,z:300},{x,z:300}];
  stampClosedLoop(S,poly(0),{});stampClosedLoop(S,poly(400),{});
  const rooms=detectRooms();rooms.forEach((room,i)=>{S.roomMeta[room.key]={hid:'room'+i,name:'Room '+i,roomType:'bedroom'};});reconcileRoomMeta();
  S.workspace.guidance.rooms=[{id:'one',name:'First',type:'bedroom',floorId:S.workspace.activeFloor,roomHid:'room0',skipped:false},{id:'two',name:'Second',type:'bedroom',floorId:S.workspace.activeFloor,roomHid:'room1',skipped:false}];
  select({kind:'room',ref:rooms[0].key});openPlanningGuide();renderPlanningGuide();
  const before=JSON.stringify(S.walls);document.querySelector('[data-guide-action="merge_preview"]').click();const pure=JSON.stringify(S.walls)===before;
  document.querySelector('[data-guide-action="merge_apply"]').click();const after=detectRooms(),meta=S.roomMeta[after[0]?.key],unassigned=S.workspace.guidance.rooms.find(e=>e.id==='two').roomHid;
  undo();return {pure,count:after.length,meta,unassigned,undoRooms:detectRooms().length};
 });
 assert.equal(r.pure,true);assert.equal(r.count,1,JSON.stringify(r));assert.equal(r.meta.hid,'room0');assert.equal(r.meta.relationships[0].kind,'merge');assert.equal(r.unassigned,'');assert.equal(r.undoRooms,2);
 }finally{await page.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'no Chrome'};
for(const lang of ['en','he'])test('shaped room preview is pure and places one undoable closed room in '+lang,opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true,lang});
 try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {detectRooms,reconcileRoomMeta}=await import('/js/geometry.js');
  const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');const {undo,redo}=await import('/js/history.js');
  document.querySelector('[data-start="recreate"]').click();openPlanningGuide();renderPlanningGuide();
  document.querySelector('[data-guide-action="shape_preview"]').click();const previewPure=S.walls.length===0;
  document.querySelector('[data-guide-action="shape_place"]').click();const rooms=detectRooms(),walls=S.walls.length,shape=S.roomMeta[rooms[0]?.key]?.shape;
  undo();const undone=S.walls.length===0;redo();const redone=detectRooms().length;
  S.nodes[0].x+=5;reconcileRoomMeta();const custom=Object.values(S.roomMeta).some(m=>m.shape?.type==='custom');
  return {previewPure,walls,rooms:rooms.length,shape,undone,redone,custom,overflow:document.documentElement.scrollWidth>390};
 });
 assert.equal(r.previewPure,true);assert.equal(r.walls,6,JSON.stringify(r));assert.equal(r.rooms,1);assert.equal(r.shape.type,'L');assert.equal(r.undone,true);assert.equal(r.redone,1);assert.equal(r.custom,true);assert.equal(r.overflow,false);
 }finally{await page.close();}
});

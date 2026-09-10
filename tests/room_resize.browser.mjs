import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'no Chrome'};
for(const lang of ['en','he'])test('exact resize is one undo step and preserves a captured baseline in '+lang,opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true,lang});
 try{
  const r=await page.eval(async()=>{
   const {S}=await import('/js/state.js');
   const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');
   const {editRedesign,resizeSelectedRoom,openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
   const {select}=await import('/js/ui_props.js');
   const {detectRooms}=await import('/js/geometry.js');
   const {roomMeasurements}=await import('/js/room_summary.js');
   const {undo,redo}=await import('/js/history.js');
   document.querySelector('[data-start="recreate"]').click();
   armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();
   const key=detectRooms()[0].key;select({kind:'room',ref:key});
   editRedesign({action:'start',id:'original',name:'Original'});
   const archive=JSON.stringify(S.workspace.baselines),before=roomMeasurements(S,detectRooms()[0]).interior;
   openPlanningGuide();renderPlanningGuide();
   const width=document.querySelector('[data-guide-field="guide_resize_width"]');
   const depth=document.querySelector('[data-guide-field="guide_resize_depth"]');
   width.value='321.75';depth.value='245.125';
   const button=document.querySelector('[data-guide-action="guide_resize_apply"]');button.focus();button.click();
   const after=roomMeasurements(S,detectRooms()[0]).interior;
   const focus=document.activeElement.dataset.guideAction;
   undo();const undone=roomMeasurements(S,detectRooms()[0]).interior;
   redo();const redone=roomMeasurements(S,detectRooms()[0]).interior;
   const fine=resizeSelectedRoom({roomKey:key,width:321.751,depth:245.125});
   const fineSize=roomMeasurements(S,detectRooms()[0]).interior;
   undo();const fineUndone=roomMeasurements(S,detectRooms()[0]).interior;
   const unchangedArchive=JSON.stringify(S.workspace.baselines)===archive;
   S.items.push({id:999,x:50,z:50,type:'sofa'});
   const nodes=JSON.stringify(S.nodes);const refused=resizeSelectedRoom({roomKey:key,width:500,depth:300});
   return {before,after,undone,redone,fine,fineSize,fineUndone,unchangedArchive,focus,refused,unchanged:JSON.stringify(S.nodes)===nodes,overflow:document.documentElement.scrollWidth>390};
  });
  assert.deepEqual(r.after,{width:321.75,depth:245.125});assert.deepEqual(r.undone,r.before);assert.deepEqual(r.redone,r.after);
  assert.equal(r.fine.ok,true,JSON.stringify(r.fine));assert.ok(Math.abs(r.fineSize.width-321.751)<1e-6);assert.deepEqual(r.fineUndone,r.after);
  assert.equal(r.unchangedArchive,true);assert.equal(r.focus,'guide_resize_apply');assert.equal(r.refused.reason,'RESIZE_CONTENTS');assert.equal(r.unchanged,true);assert.equal(r.overflow,false);
 }finally{await page.close();}
});

for (const lang of ['en','he']) test('inspector uses exact interior sizes and transactional edits in '+lang,opts,async()=>{
 const page=await openPage({width:1280,height:900,lang});
 try {
  const r=await page.eval(async()=>{
   const {S}=await import('/js/state.js');
   const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');
   const {select,fillProps}=await import('/js/ui_props.js');
   const {detectRooms}=await import('/js/geometry.js');
   const {roomMeasurements}=await import('/js/room_summary.js');
   const {undo,redo}=await import('/js/history.js');
   document.querySelector('[data-start="recreate"]').click();
   armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();
   S.walls.forEach((wall,i)=>{wall.thickness=[10,20,30,40][i];});
   const key=detectRooms()[0].key;select({kind:'room',ref:key});fillProps();
   const measure=()=>roomMeasurements(S,detectRooms()[0]).interior;
   const displayed=()=>({width:Number(document.getElementById('r_w').value),depth:Number(document.getElementById('r_d').value)});
   const edit=(id,value)=>{const input=document.getElementById(id);input.focus();input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();};
   const before=measure(),shown=displayed();
   edit('r_w','321.751');const resized=measure(),shownResized=displayed();
   undo();const undone=measure();redo();const redone=measure();
   select({kind:'room',ref:key});
   document.getElementById('r_w_up').click();const nudged=measure();
   undo();const nudgeUndone=measure();
   select({kind:'room',ref:key});
   const beforeInvalid=JSON.stringify(S.nodes);edit('r_d','');
   const invalidUnchanged=JSON.stringify(S.nodes)===beforeInvalid,invalidDisplay=displayed();
   S.items.push({id:999,x:50,z:50,type:'sofa'});
   const beforeRefusal=JSON.stringify(S.nodes);edit('r_w','500');
   return {before,shown,resized,shownResized,undone,redone,nudged,nudgeUndone,invalidUnchanged,invalidDisplay,
     refusedUnchanged:JSON.stringify(S.nodes)===beforeRefusal,refusedDisplay:displayed()};
  });
  assert.deepEqual(r.shown,r.before);
  assert.ok(Math.abs(r.resized.width-321.751)<1e-6);assert.equal(r.resized.depth,r.before.depth);
  assert.deepEqual(r.shownResized,r.resized);assert.deepEqual(r.undone,r.before);assert.deepEqual(r.redone,r.resized);
  assert.ok(Math.abs(r.nudged.width-331.751)<1e-6);assert.deepEqual(r.nudgeUndone,r.resized);
  assert.equal(r.invalidUnchanged,true);assert.deepEqual(r.invalidDisplay,r.resized);
  assert.equal(r.refusedUnchanged,true);assert.deepEqual(r.refusedDisplay,r.resized);
 } finally {await page.close();}
});

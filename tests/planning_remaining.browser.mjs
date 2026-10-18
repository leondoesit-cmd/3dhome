import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'no Chrome'};
test('reordered boundary packing applies every checklist room at its exact size in one undo',opts,async()=>{
 const page=await openPage({width:1280,height:900});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {detectRooms}=await import('/js/geometry.js');const {roomMeasurements}=await import('/js/room_summary.js');const {undo}=await import('/js/history.js');
  const {openPlanningGuide,renderPlanningGuide,editPlanningGuide}=await import('/js/ui_planning_guide.js');
  document.querySelector('[data-start="recreate"]').click();
  for(const [i,[width,depth]] of [[100,100],[100,200],[300,200]].entries()){
   editPlanningGuide({action:'add',id:`packed-${i}`,type:'bedroom',name:`Room ${i}`});
   editPlanningGuide({action:'edit',id:`packed-${i}`,width,depth});
  }
  openPlanningGuide();renderPlanningGuide();await new Promise(requestAnimationFrame);
  const boundary=document.querySelector('[data-guide-field="draft_boundary"]');boundary.value='0cm,0cm\n500cm,0cm\n500cm,400cm\n0cm,400cm';boundary.dispatchEvent(new Event('change'));
  document.querySelector('[data-guide-action="draft_preview"]').click();
  for(let i=0;i<100&&!document.querySelector('[data-guide-action="draft_apply"]');i++)await new Promise(r=>setTimeout(r,30));
  const apply=document.querySelector('[data-guide-action="draft_apply"]');if(!apply)throw new Error('Missing packed preview');
  const pure=S.walls.length===0;apply.click();
  const rooms=detectRooms(),sizes=S.workspace.guidance.rooms.map(entry=>{
   const room=rooms.find(room=>S.roomMeta[room.key]?.hid===entry.roomHid);
   const size=room&&roomMeasurements(S,room)?.interior;return size?[size.width,size.depth]:null;
  });
  undo();return {pure,count:rooms.length,sizes,undone:S.walls.length===0&&S.workspace.guidance.rooms.every(entry=>!entry.roomHid)};
 });assert.deepEqual(r,{pure:true,count:3,sizes:[[100,100],[100,200],[300,200]],undone:true});
 }finally{await page.close();}
});
test('a checklist draft keeps requested non-grid interior sizes after Apply and undo',opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {detectRooms}=await import('/js/geometry.js');const {roomMeasurements}=await import('/js/room_summary.js');const {undo}=await import('/js/history.js');
  const {openPlanningGuide,renderPlanningGuide,editPlanningGuide}=await import('/js/ui_planning_guide.js');
  document.querySelector('[data-start="recreate"]').click();
  editPlanningGuide({action:'add',id:'sized-bedroom',type:'bedroom',name:'Measured room'});editPlanningGuide({action:'edit',id:'sized-bedroom',width:181.25,depth:202.75});
  openPlanningGuide();renderPlanningGuide();await new Promise(requestAnimationFrame);
  document.querySelector('[data-guide-action="draft_preview"]').click();
  for(let i=0;i<100&&!document.querySelector('[data-guide-action="draft_apply"]');i++)await new Promise(r=>setTimeout(r,30));
  document.querySelector('[data-guide-action="draft_apply"]').click();
  const room=detectRooms()[0],size=roomMeasurements(S,room)?.interior;const count=detectRooms().length,assigned=S.workspace.guidance.rooms[0].roomHid===S.roomMeta[room.key].hid;undo();
  return {count,size,assigned,undone:S.walls.length===0&&!S.workspace.guidance.rooms[0].roomHid,overflow:document.documentElement.scrollWidth>390};
 });assert.equal(r.count,1);assert.equal(r.size.width,181.25);assert.equal(r.size.depth,202.75);assert.equal(r.assigned,true);assert.equal(r.undone,true);assert.equal(r.overflow,false);
 }finally{await page.close();}
});
test('leaving the project guide discards an uncommitted draft',opts,async()=>{
 const page=await openPage({width:1280,height:900});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
  document.querySelector('[data-start="recreate"]').click();openPlanningGuide();renderPlanningGuide();await new Promise(requestAnimationFrame);
  document.querySelector('[data-guide-action="draft_preview"]').click();
  for(let i=0;i<100&&!document.querySelector('[data-guide-action="draft_apply"]');i++)await new Promise(r=>setTimeout(r,30));
  if(!document.querySelector('[data-guide-action="draft_apply"]'))throw new Error('Missing preview');
  document.querySelector('#leftTabs [data-left-tab="library"]').click();
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  openPlanningGuide();renderPlanningGuide();await new Promise(requestAnimationFrame);
  return {pure:S.walls.length===0,discarded:!document.querySelector('[data-guide-action="draft_apply"]')};
 });assert.deepEqual(r,{pure:true,discarded:true});
 }finally{await page.close();}
});
test('guided draft is an unfurnished preview and one undoable replacement-free apply',opts,async()=>{
 const page=await openPage({width:1280,height:900});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {detectRooms}=await import('/js/geometry.js');const {undo}=await import('/js/history.js');
  const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
  document.querySelector('[data-start="recreate"]').click();openPlanningGuide();renderPlanningGuide();await new Promise(requestAnimationFrame);
  document.querySelector('[data-guide-action="draft_preview"]').click();
  for(let i=0;i<100&&!document.querySelector('[data-guide-action="draft_apply"]');i++)await new Promise(r=>setTimeout(r,30));
  const pure=S.walls.length===0;document.querySelector('[data-guide-action="draft_apply"]').click();
  const rooms=detectRooms().length,items=S.items.length,openings=S.openings.length;undo();return {pure,rooms,items,openings,undone:S.walls.length===0};
 });assert.deepEqual(r,{pure:true,rooms:3,items:0,openings:0,undone:true});
 }finally{await page.close();}
});
test('split preserves the primary identity and records both descendant rooms',opts,async()=>{
 const page=await openPage({width:1280,height:900});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {detectRooms}=await import('/js/geometry.js');const {undo}=await import('/js/history.js');
  const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');const {select}=await import('/js/ui_props.js');
  const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
  document.querySelector('[data-start="recreate"]').click();armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();const room=detectRooms()[0],hid=S.roomMeta[room.key].hid;
  select({kind:'room',ref:room.key});openPlanningGuide();renderPlanningGuide();document.querySelector('[data-guide-action="split_preview"]').click();const pure=detectRooms().length===1;
  document.querySelector('[data-guide-action="split_apply"]').click();const rooms=detectRooms(),ids=rooms.map(r=>S.roomMeta[r.key]?.hid),relationships=rooms.map(r=>S.roomMeta[r.key]?.relationships?.[0]?.kind);undo();return {pure,count:rooms.length,kept:ids.includes(hid),relationships,undone:detectRooms().length};
 });assert.equal(r.pure,true);assert.equal(r.count,2,JSON.stringify(r));assert.equal(r.kept,true);assert.deepEqual(r.relationships,['split','split']);assert.equal(r.undone,1);
 }finally{await page.close();}
});
test('bounded corridor joins two existing exterior openings without removing them',opts,async()=>{
 const page=await openPage({width:1280,height:900});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {stampClosedLoop}=await import('/js/room_graph.js');const {detectRooms,reconcileRoomMeta}=await import('/js/geometry.js');
  const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');const {undo}=await import('/js/history.js');
  document.querySelector('[data-start="recreate"]').click();const poly=x=>[{x,z:0},{x:x+300,z:0},{x:x+300,z:300},{x,z:300}];
  stampClosedLoop(S,poly(0),{});stampClosedLoop(S,poly(800),{});
  detectRooms().forEach((r,i)=>{S.roomMeta[r.key]={name:'Room '+i,roomType:'bedroom'};});reconcileRoomMeta();
  const source=S.walls.find(w=>S.nodes[w.a].x===300&&S.nodes[w.b].x===300),target=S.walls.find(w=>S.nodes[w.a].x===800&&S.nodes[w.b].x===800);
  S.openings.push({id:S.idc++,wall:source.id,s:150,width:90,height:205,sill:0,type:'door'},{id:S.idc++,wall:target.id,s:150,width:90,height:205,sill:0,type:'door'});
  openPlanningGuide();renderPlanningGuide();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  document.querySelector('[data-guide-field="corridor_permitted"]').checked=true;document.querySelector('[data-guide-action="corridor_preview"]').click();
  for(let i=0;i<300&&!document.querySelector('[data-guide-action="corridor_apply"]');i++)await new Promise(r=>setTimeout(r,30));
  const control=document.querySelector('[data-guide-action="corridor_apply"]');if(!control)throw new Error('No corridor preview');const pure=detectRooms().length===2;control.click();
  const rooms=detectRooms().length,openings=S.openings.length;undo();return {pure,rooms,openings,undone:detectRooms().length};
 });assert.deepEqual(r,{pure:true,rooms:3,openings:2,undone:2});
 }finally{await page.close();}
});

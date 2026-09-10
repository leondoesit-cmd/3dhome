import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'no Chrome'};
test('Check fit distinguishes missing entrance from a reachable room without mutating geometry',opts,async()=>{
 const page=await openPage({width:1280,height:900});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {detectRooms}=await import('/js/geometry.js');const {t}=await import('/js/i18n.js');
  const {armRoomStamp,updateRoomGhost,commitRoomStamp,previewPlannerCommand,executePlannerProposal}=await import('/js/interaction.js');const {select}=await import('/js/ui_props.js');
  const {openPlanningGuide,renderPlanningGuide,editPlanningGuide}=await import('/js/ui_planning_guide.js');const {startLayoutAnalysis}=await import('/js/ui_layout_tools.js');
  document.querySelector('[data-start="recreate"]').click();armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();const room=detectRooms()[0];select({kind:'room',ref:room.key});openPlanningGuide();renderPlanningGuide();
  const wait=async key=>{for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,30));if(document.getElementById('planningGuide').textContent.includes(t(key)))return true;}return false;};
  await new Promise(requestAnimationFrame);startLayoutAnalysis(room.key,'check');const missing=await wait('layout_route_unresolved');
  if(!S.openings.length){const proposal=previewPlannerCommand('opening.place',{wallId:S.walls[0].id,type:'door',s:150});if(!proposal.ok)throw new Error(JSON.stringify(proposal));executePlannerProposal(proposal);}
  editPlanningGuide({action:'settings',entranceOpeningId:String(S.openings[0].id),routeWidth:60});select({kind:'room',ref:room.key});renderPlanningGuide();await new Promise(requestAnimationFrame);
  const before=JSON.stringify([S.nodes,S.walls,S.items,S.openings]);startLayoutAnalysis(room.key,'check');const reachable=await wait('layout_route_found');
  return {missing,reachable,pure:before===JSON.stringify([S.nodes,S.walls,S.items,S.openings])};
 });assert.deepEqual(r,{missing:true,reachable:true,pure:true});
 }finally{await page.close();}
});
for(const lang of ['en','he'])test('room layout worker previews, cancels and applies one undo step in '+lang,opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true,lang});
 try{
 const result=await page.eval(async()=>{
  const {S}=await import('/js/state.js');
  const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');
  const {detectRooms}=await import('/js/geometry.js');
  const {select}=await import('/js/ui_props.js');
  const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
  const {startLayoutAnalysis,applyLayoutAnalysis,cancelLayoutAnalysis}=await import('/js/ui_layout_tools.js');
  const {undo}=await import('/js/history.js');
  document.querySelector('[data-start="recreate"]').click();armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();
  const room=detectRooms()[0];select({kind:'room',ref:room.key});openPlanningGuide();renderPlanningGuide();
  const wait=async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);for(let i=0;i<150;i++){if(document.querySelector('[data-guide-action="layout_apply"]'))return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(document.getElementById('planningGuide').textContent);};
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  const before=JSON.stringify(S.items);startLayoutAnalysis(room.key,'furnish');await wait();
  const previewPure=JSON.stringify(S.items)===before;
  cancelLayoutAnalysis();const cancelPure=JSON.stringify(S.items)===before;
  startLayoutAnalysis(room.key,'furnish');await wait();const applied=applyLayoutAnalysis();if(!applied.ok)throw new Error(JSON.stringify(applied));const count=S.items.length;undo();
  select({kind:'room',ref:room.key});renderPlanningGuide();startLayoutAnalysis(room.key,'furnish');await wait();
  S.nodes[0].x+=.001;const stale=applyLayoutAnalysis();
  return {previewPure,cancelPure,applied,count,undone:S.items.length===0,stale,overflow:document.documentElement.scrollWidth>390};
 });
 assert.equal(result.previewPure,true);assert.equal(result.cancelPure,true);assert.equal(result.applied.ok,true,JSON.stringify(result));assert.equal(result.count,1);assert.equal(result.undone,true);assert.equal(result.stale.ok,false);assert.equal(result.overflow,false);
 }finally{await page.close();}
});

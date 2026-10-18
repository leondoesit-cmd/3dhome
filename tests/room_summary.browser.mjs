import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
import {useCentimetres} from './helpers/planner_units.mjs';
const opts=await findChrome()?{}:{skip:'no Chrome'};
test('room labels use the room domain when the plan uses a different unit',opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true,lang:'en'});
 try{
  const result=await page.eval(async()=>{
   const {saveUnitSettings}=await import('/js/unit_settings.js');
   const {S}=await import('/js/state.js'),{detectRooms}=await import('/js/geometry.js');
   const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');
   const {select}=await import('/js/ui_props.js'),{openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
   document.querySelector('[data-start="recreate"]').click();
   saveUnitSettings({preset:'metric_mm',overrides:{rooms:{unit:'m'},plan:{unit:'mm'}}});
   armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();select({kind:'room',ref:detectRooms()[0].key});openPlanningGuide();renderPlanningGuide();
   return ['width','depth'].map(key=>{const input=document.querySelector('[data-guide-field="guide_resize_'+key+'"]');return {label:input.parentElement.firstElementChild.textContent,value:Number(input.value)};});
  });
  assert.deepEqual(result,[{label:'Interior width (m)',value:3.5},{label:'Interior depth (m)',value:3}]);
 }finally{await page.close();}
});
for(const lang of ['en','he'])test('selected room details are undoable and fit the mobile guide in '+lang,opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true,lang});
 try{
 await useCentimetres(page);
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');
  const {editPlanningGuide,editRoomDetails,openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
  const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');
  const {undo,redo}=await import('/js/history.js');
  const {detectRooms}=await import('/js/geometry.js');
  const {select}=await import('/js/ui_props.js');
  document.querySelector('[data-start="recreate"]').click();
  editPlanningGuide({action:'add',id:'r',name:'Bedroom',type:'bedroom'});
  armRoomStamp('bedroom',{checklistId:'r'});updateRoomGhost(0,0);commitRoomStamp();
  const room=detectRooms()[0];select({kind:'room',ref:room.key});openPlanningGuide();renderPlanningGuide();
  const panel=document.querySelector('[data-guide-section="selected-room"]');
  const autoOpen=panel.open;
  const name=panel.querySelector('[data-guide-field="guide_name"]');name.focus();name.value='Quiet room';name.dispatchEvent(new Event('change',{bubbles:true}));
  const nameFocused=document.activeElement.value==='Quiet room';
  const assigned=S.workspace.guidance.rooms[0].name;
  const result=editRoomDetails({roomKey:room.key,floor:'tiles',wall:0x112233});
  undo();const undone=S.roomMeta[room.key].wall!==0x112233;redo();
  select({kind:'room',ref:room.key});openPlanningGuide();renderPlanningGuide();
  document.querySelector('[data-guide-section="selected-room-details"]').open=true;
  await new Promise(requestAnimationFrame);
  const host=document.querySelector('[data-guide-section="selected-room"]');
  const controls=[...host.querySelectorAll('input,select,button')].filter(n=>n.getBoundingClientRect().width).map(n=>{const b=n.getBoundingClientRect();return [b.x,b.right];});
  const text=host.textContent;
  const areaText=host.querySelector('[data-guide-area="room"]').textContent;
  const floorAreaText=document.querySelector('[data-guide-area="floor"]').textContent;
  host.querySelector('[data-guide-action="guide_add_window"]').click();
  return {autoOpen,nameFocused,assigned,result,undone,redone:S.roomMeta[room.key].wall===0x112233,tool:S.tool,text,areaText,floorAreaText,controls,overflow:document.documentElement.scrollWidth>390};
 });
 for(const key of ['autoOpen','nameFocused','undone','redone'])assert.equal(r[key],true,key);
 assert.equal(r.assigned,'Quiet room');assert.equal(r.result.ok,true);assert.equal(r.tool,'window');
 assert.ok(r.areaText.includes('10.5'));assert.ok(r.floorAreaText.includes('10.5'));
 assert.equal(r.overflow,false);assert.ok(r.text.includes('360'));for(const [x,right]of r.controls)assert.ok(x>=-1&&right<=391,JSON.stringify(r.controls));
 }finally{await page.close();}
});
test('room display units convert exact entry without changing the grid or capture geometry',opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true});try{
 const r=await page.eval(async()=>{
  const {S}=await import('/js/state.js');const {detectRooms}=await import('/js/geometry.js');const {roomMeasurements}=await import('/js/room_summary.js');
  const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');const {select}=await import('/js/ui_props.js');const {undo}=await import('/js/history.js');
  const {openPlanningGuide,renderPlanningGuide,editPlanningGuide}=await import('/js/ui_planning_guide.js');
  document.querySelector('[data-start="recreate"]').click();armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();const room=detectRooms()[0];select({kind:'room',ref:room.key});
  const before=JSON.stringify([S.nodes,S.walls,S.snapGrid]);editPlanningGuide({action:'settings',displayUnit:'m'});openPlanningGuide();renderPlanningGuide();
  const pure=before===JSON.stringify([S.nodes,S.walls,S.snapGrid]),input=document.querySelector('[data-guide-field="guide_resize_width"]'),shown=Number(input.value);
  input.value='3.4125';document.querySelector('[data-guide-action="guide_resize_apply"]').click();const width=roomMeasurements(S,detectRooms()[0]).interior.width;undo();
  return {pure,shown,width,restored:roomMeasurements(S,detectRooms()[0]).interior.width,unit:S.workspace.guidance.details.displayUnit};
 });assert.deepEqual(r,{pure:true,shown:3.5,width:341.25,restored:350,unit:'m'});
 }finally{await page.close();}
});

import {planningGuide} from '../planning_guide.js';
const fail=reason=>({ok:false,reason});
export const roomMergeCommand=Object.freeze({
 id:'room.merge',
 prepare(params,env){
  const state=env.state,rooms=env.services.detectRooms();
  if(state.workspace?.role==='viewer'||state.structLocked||state.layers?.structure?.locked)return fail('ROOM_LOCKED');
  const primary=rooms.find(r=>r.key===params.primary),secondary=rooms.find(r=>r.key===params.secondary);
  if(!primary||!secondary||primary===secondary)return fail('ROOM_NOT_FOUND');
  const ids=new Set(primary.key.split(',')),shared=secondary.key.split(',').filter(id=>ids.has(id));
  if(!shared.length)return fail('NOT_ADJOINING');
  if([primary,secondary].some(r=>state.roomMeta[r.key]?.locked)||state.walls.some(w=>shared.includes(String(w.id))&&w.locked))return fail('ROOM_LOCKED');
  if(state.wallCons?.length||state.roomCons?.length||state.mep?.nodes?.length||state.mep?.runs?.length||state.items.some(i=>i.hold&&shared.includes(String(i.hold.wall))))return fail('MERGE_CONSTRAINT');
  const openings=state.openings.filter(o=>shared.includes(String(o.wall)));
  if(openings.some(o=>o.locked||o.pair!=null||o.pairId!=null))return fail('MERGE_CONSTRAINT');
  const meta=state.roomMeta[primary.key]||{},absorbed=state.roomMeta[secondary.key]||{};
  return {ok:true,plan:{command:'room.merge',params:{primary:primary.key,secondary:secondary.key,shared,openingIds:openings.map(o=>o.id),
   keep:JSON.parse(JSON.stringify(meta)),absorbed:JSON.parse(JSON.stringify(absorbed)),center:{x:primary.cx,z:primary.cz},outline:[primary.pts,secondary.pts]}}};
 },
 apply(plan,env){
  const state=env.state,p=plan.params;
  const prevWalls=state.walls,prevOpenings=state.openings;
  state.walls=state.walls.filter(w=>!p.shared.includes(String(w.id)));
  state.openings=state.openings.filter(o=>!p.openingIds.includes(o.id));
  const expected=[...new Set([...p.primary.split(','),...p.secondary.split(',')])].filter(id=>!p.shared.includes(id));
  const room=env.services.detectRooms().find(r=>r.key.split(',').length===expected.length&&r.key.split(',').every(id=>expected.includes(id)));
  if(!room){state.walls=prevWalls;state.openings=prevOpenings;return fail('MERGE_TOPOLOGY');}
  delete state.roomMeta[p.primary];delete state.roomMeta[p.secondary];
  const hid=p.keep.hid||'r'+state.idc++;
  state.roomMeta[room.key]={...p.keep,hid,cx:room.cx,cz:room.cz,shape:{version:1,type:'custom',wallIds:room.key.split(',')},
   relationships:[...(p.keep.relationships||[]),{version:1,kind:'merge',sources:[hid,p.absorbed.hid].filter(Boolean),target:hid}]};
  const guide=planningGuide(state);
  guide.rooms.forEach(entry=>{if(entry.floorId===state.workspace.activeFloor&&entry.roomHid===p.absorbed.hid){entry.roomHid='';entry.floorId='';}});
  state.workspace.guidance=guide;
  return {ok:true,changed:[{kind:'room',id:room.key},...p.shared.map(id=>({kind:'wall',id}))],effects:{dirty3D:true,refreshTree:true,refreshInspector:true}};
 }
});

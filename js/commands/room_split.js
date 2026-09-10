import {roomMeasurements} from '../room_summary.js';
import {insertWallSegment,pointOnSegment,pointInPolygon} from '../room_graph.js';
const fail=reason=>({ok:false,reason});
export const roomSplitCommand=Object.freeze({
 id:'room.split',
 prepare(params,env){
  const state=env.state,room=env.services.detectRooms().find(r=>r.key===params.roomKey),m=roomMeasurements(state,room);
  if(!m?.interior)return fail('ROOM_NOT_RECT');
  if(state.workspace?.role==='viewer'||state.structLocked||state.layers?.structure?.locked||state.roomMeta[room.key]?.locked)return fail('ROOM_LOCKED');
  if(state.items.length||state.wallCons?.length||state.roomCons?.length||state.mep?.nodes?.length||state.mep?.runs?.length||state.slabOpenings?.length)return fail('SPLIT_CONTENTS');
  const axis=params.axis==='z'?'z':'x',offset=Number(params.offset),size=axis==='x'?m.interior.width:m.interior.depth;
  if(!Number.isFinite(offset)||offset<20||offset>size-20)return fail('INVALID_SPLIT');
  const value=m.interiorBounds[axis+'0']+offset;
  const xs=room.pts.map(p=>p.x),zs=room.pts.map(p=>p.z);
  const from=axis==='x'?{x:value,z:Math.min(...zs)}:{x:Math.min(...xs),z:value};
  const to=axis==='x'?{x:value,z:Math.max(...zs)}:{x:Math.max(...xs),z:value};
  for(const point of [from,to])for(const wall of state.walls){
   const hit=pointOnSegment(point,state.nodes[wall.a],state.nodes[wall.b],1e-6);
   if(!hit)continue;
   if(wall.locked)return fail('ROOM_LOCKED');
   const station=Math.hypot(point.x-state.nodes[wall.a].x,point.z-state.nodes[wall.a].z);
   if(state.openings.some(o=>o.wall===wall.id&&Math.abs(o.s-station)<=o.width/2+10))return fail('SPLIT_OPENING');
  }
  return {ok:true,plan:{command:'room.split',params:{roomKey:room.key,from,to,points:room.pts,center:{x:room.cx,z:room.cz},meta:JSON.parse(JSON.stringify(state.roomMeta[room.key]||{}))}}};
 },
 apply(plan,env){
  const state=env.state,p=plan.params,oldWallIds=new Set(state.walls.map(w=>w.id));
  const result=insertWallSegment(state,p.from,p.to,{thickness:10,height:270},{tol:1e-6});
  const rooms=env.services.detectRooms().filter(room=>pointInPolygon({x:room.cx,z:room.cz},p.points));
  if(rooms.length!==2)return fail('SPLIT_TOPOLOGY');
  rooms.sort((a,b)=>Number(pointInPolygon(p.center,b.pts))-Number(pointInPolygon(p.center,a.pts)));
  delete state.roomMeta[p.roomKey];
  const primary=p.meta.hid||'r'+state.idc++,child='r'+state.idc++;
  rooms.forEach((room,index)=>{state.roomMeta[room.key]={...(index?{}:p.meta),hid:index?child:primary,cx:room.cx,cz:room.cz,
   shape:{version:1,type:'custom',wallIds:room.key.split(',')},relationships:[...(index?[]:p.meta.relationships||[]),{version:1,kind:'split',source:primary,targets:[primary,child]}]};});
  state.walls.filter(w=>!oldWallIds.has(w.id)||p.roomKey.split(',').includes(String(w.id))).forEach(w=>env.services.captureLock?.(w));
  return {ok:true,created:result.created.map(id=>({kind:'wall',id})),changed:rooms.map(r=>({kind:'room',id:r.key})),effects:{dirty3D:true,refreshTree:true,refreshInspector:true}};
 }
});

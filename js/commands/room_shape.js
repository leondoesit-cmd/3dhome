import {shapePoints,shapeBoundarySignature} from '../room_shapes.js';
import {stampClosedLoop,pointOnSegment,segmentCross} from '../room_graph.js';
import {polygonBooleanArea} from '../polygon_area.js';
import {roomPreset} from '../room_presets.js';
const fail=reason=>({ok:false,reason});
export const roomShapeCommand=Object.freeze({
 id:'room.shape',
 prepare(params,env){
  const state=env.state;
  if(state.workspace?.role==='viewer'||state.structLocked||state.layers?.structure?.locked)return fail('ROOM_LOCKED');
  const points=shapePoints(params.type,params);if(!points)return fail('INVALID_SHAPE');
  if(!roomPreset(params.roomType))return fail('INVALID_ROOM_TYPE');
  const rooms=env.services.detectRooms();
  if(rooms.some(r=>polygonBooleanArea([[points],[r.pts]],s=>s[0]&&s[1])>.01))return fail('ROOM_OVERLAPS');
  // Shared geometry is reused unchanged. Reject cuts through hosted objects or
  // constraints until their richer graph adapters can participate in this command.
  for(const wall of state.walls){
   if(wall.geometry?.type==='arc')return fail('UNSUPPORTED_SHAPE_NEIGHBOUR');
   const a=state.nodes[wall.a],b=state.nodes[wall.b];
   const cuts=points.filter(p=>pointOnSegment(p,a,b,1e-6)?.interior);
   for(let i=0;i<points.length;i++){const hit=segmentCross(points[i],points[(i+1)%points.length],a,b,1e-6);if(hit)cuts.push(hit);}
   if(cuts.length&&(wall.locked||state.wallCons?.length||state.roomCons?.length||state.mep?.nodes?.length||state.mep?.runs?.length||state.items?.some(i=>i.hold)))return fail('SHAPE_CONSTRAINT');
   for(const cut of cuts){const station=Math.hypot(cut.x-a.x,cut.z-a.z);if(state.openings.some(o=>o.wall===wall.id&&Math.abs(o.s-station)<=o.width/2+(params.spec?.thickness||10)/2+1))return fail('SHAPE_OPENING');}
  }
  const spec=params.spec||{thickness:10,height:270};
  if(!(spec.thickness>0&&spec.height>0))return fail('INVALID_SHAPE');
  return {ok:true,plan:{command:'room.shape',params:{type:params.type,points,roomType:params.roomType,name:params.name||'',spec,
   dimensions:params.type==='custom'?{}:{width:params.width,depth:params.depth,arm:params.arm}}}};
 },
 apply(plan,env){
  const p=plan.params,state=env.state,before=new Map(state.walls.map(w=>[w.id,[w.a,w.b]])),result=stampClosedLoop(state,p.points,p.spec,{tol:1e-6});
  state.walls.filter(w=>!before.has(w.id)||before.get(w.id)[0]!==w.a||before.get(w.id)[1]!==w.b).forEach(w=>env.services.captureLock?.(w));
  state.roomMeta[result.key]={name:p.name,roomType:p.roomType,shape:{version:1,type:p.type,parameters:p.dimensions,wallIds:result.key.split(','),cornerNodes:result.nodes,signature:shapeBoundarySignature(state,result.key)}};
  return {ok:true,created:result.created.map(id=>({kind:'wall',id})),changed:result.shared.map(id=>({kind:'wall',id})),effects:{dirty3D:true,refreshTree:true,refreshInspector:true}};
 }
});

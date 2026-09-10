import {shapePoints,shapeBoundarySignature} from '../room_shapes.js';
import {polygonBooleanArea} from '../polygon_area.js';
import {wallCurveGeom} from '../wall_curves.js';
import {wallLayerBands} from '../wall_types.js';
const fail=reason=>({ok:false,reason});
export const roomShapeEditCommand=Object.freeze({
 id:'room.shape_edit',
 prepare(params,env){
  const state=env.state,room=env.services.detectRooms().find(r=>r.key===params.roomKey),meta=state.roomMeta[params.roomKey],shape=meta?.shape;
  if(!room||!['L','T','U'].includes(shape?.type)||!Array.isArray(shape.cornerNodes))return fail('CUSTOM_SHAPE');
  if(state.workspace?.role==='viewer'||state.structLocked||state.layers?.structure?.locked||meta.locked)return fail('ROOM_LOCKED');
  if(state.items.length||state.slabOpenings?.length||state.mep?.nodes?.length||state.mep?.runs?.length||state.wallCons?.length||state.roomCons?.length)return fail('SHAPE_CONTENTS');
  const old=shape.cornerNodes.map(i=>state.nodes[i]);if(old.some(p=>!p)||shape.signature!==shapeBoundarySignature(state,room.key))return fail('CUSTOM_SHAPE');
  const dimensions={width:Number(params.width),depth:Number(params.depth),arm:Number(params.arm)};
  const points=shapePoints(shape.type,{...dimensions,x:Math.min(...old.map(p=>p.x)),z:Math.min(...old.map(p=>p.z))});
  if(!points||points.length!==old.length)return fail('INVALID_SHAPE');
  const nodes=state.nodes.map(n=>({...n})),changed=new Set();
  shape.cornerNodes.forEach((id,i)=>{nodes[id]={...nodes[id],...points[i]};if(nodes[id].x!==state.nodes[id].x||nodes[id].z!==state.nodes[id].z)changed.add(id);});
  const own=new Set(room.key.split(','));
  if(state.walls.some(w=>(changed.has(w.a)||changed.has(w.b))&&(!own.has(String(w.id))||w.locked))||[...changed].some(i=>state.nodes[i].locked||state.nodes[i].fixed||state.nodes[i].pinned))return fail('SHARED_SHAPE');
  if(env.services.detectRooms().some(r=>r.key!==room.key&&polygonBooleanArea([[points],[r.pts]],s=>s[0]&&s[1])>.01))return fail('ROOM_OVERLAPS');
  const catalog=JSON.parse(JSON.stringify({wallTypes:state.wallTypes||[],walls:[]}));
  for(const foreign of state.walls.filter(w=>!own.has(String(w.id)))){
   const wall=JSON.parse(JSON.stringify(foreign)),g=wallCurveGeom(wall,state.nodes);
   if(!g||g.kind!=='line')return fail('SHARED_SHAPE');
   const bands=wallLayerBands(wall,catalog),lo=Math.min(...bands.map(b=>b.start)),hi=Math.max(...bands.map(b=>b.end));
   const solid=[[0,lo],[g.length,lo],[g.length,hi],[0,hi]].map(([s,d])=>({x:g.a.x+g.ux*s-g.uz*d,z:g.a.z+g.uz*s+g.ux*d}));
   if(polygonBooleanArea([[points],[old],[solid]],s=>s[0]&&!s[1]&&s[2])>.01)return fail('ROOM_OVERLAPS');
  }
  const openings=[];
  for(const wall of state.walls.filter(w=>own.has(String(w.id)))){
   const before=wallCurveGeom(wall,state.nodes),after=wallCurveGeom(wall,nodes);
   if(!after||after.length<20||before.ux*after.ux+before.uz*after.uz<.999999)return fail('INVALID_SHAPE');
   const stationShift=(after.a.x-before.a.x)*before.ux+(after.a.z-before.a.z)*before.uz;
   for(const opening of state.openings.filter(o=>o.wall===wall.id)){
    if(opening.locked||opening.pair!=null||opening.pairId!=null)return fail('SHAPE_OPENING');
    const s=opening.s-stationShift,margin=Math.max(1,(wall.thickness||10)/2);
    if(s-opening.width/2<margin||s+opening.width/2>after.length-margin)return fail('SHAPE_OPENING');
    openings.push({id:opening.id,s});
   }
  }
  return {ok:true,plan:{command:'room.shape_edit',params:{roomKey:room.key,dimensions,nodes:[...changed].map(index=>({index,x:nodes[index].x,z:nodes[index].z})),openings}}};
 },
 apply(plan,env){
  const state=env.state,p=plan.params;p.nodes.forEach(n=>Object.assign(state.nodes[n.index],{x:n.x,z:n.z}));p.openings.forEach(o=>{state.openings.find(current=>current.id===o.id).s=o.s;});
  const meta=state.roomMeta[p.roomKey];meta.shape.parameters=p.dimensions;meta.shape.signature=shapeBoundarySignature(state,p.roomKey);
  state.walls.filter(w=>p.roomKey.split(',').includes(String(w.id))).forEach(w=>env.services.captureLock?.(w));
  return {ok:true,changed:[{kind:'room',id:p.roomKey}],effects:{dirty3D:true,refreshTree:true,refreshInspector:true}};
 }
});

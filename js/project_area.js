import {polygonBooleanArea,polygonDifferenceArea} from './polygon_area.js';
import {roomTypeOf} from './room_types.js';

// Geometry is supplied by the same wall-band service used by the renderer.
// This pure calculation also runs against an immutable analysis snapshot.
export function projectAreaReport({rooms,wallSolids,voids=[],apertures=[],metadata={},unresolved=false}){
 const polygons=[...rooms.map(r=>r.pts),...wallSolids.map(w=>w.points),...voids,...apertures];
 unresolved ||= polygons.some(p=>!Array.isArray(p)||p.length<3||p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.z)));
 const outdoor=room=>['balcony','terrace','serviceBalcony'].includes(roomTypeOf(metadata[room.key]));
 const typed=room=>!!roomTypeOf(metadata[room.key]);
 const clear=polygons=>polygonBooleanArea([polygons,wallSolids.map(w=>w.points),voids,apertures],s=>s[0]&&!s[2]&&(!s[1]||s[3]));
 const entries=rooms.map(room=>({key:room.key,type:roomTypeOf(metadata[room.key]),area:unresolved?null:clear([room.pts])/10000}));
 const indoorRooms=rooms.filter(r=>typed(r)&&!outdoor(r));
 const outdoorRooms=rooms.filter(outdoor),unknownRooms=rooms.filter(r=>!typed(r));
 const indoorIds=new Set(indoorRooms.flatMap(r=>String(r.key).split(',')));
 const footprint=unresolved?null:polygonDifferenceArea([...indoorRooms.map(r=>r.pts),...wallSolids.filter(w=>indoorIds.has(String(w.id))).map(w=>w.points)],voids)/10000;
 const components=[];const remaining=new Set(rooms.map(r=>r.key));
 while(remaining.size){
  const pending=[remaining.values().next().value],group=[];
  while(pending.length){
   const key=pending.pop();if(!remaining.delete(key))continue;group.push(key);
   const ids=new Set(String(key).split(','));
   for(const other of remaining)if(String(other).split(',').some(id=>ids.has(id)))pending.push(other);
  }
  components.push(group);
 }
 return {entries,indoor:unresolved?null:clear(indoorRooms.map(r=>r.pts))/10000,
  outdoor:unresolved?null:clear(outdoorRooms.map(r=>r.pts))/10000,
  unclassified:unresolved?null:clear(unknownRooms.map(r=>r.pts))/10000,
  footprint,unresolved:unresolved?rooms.length:0,components,
  measurable:rooms.length>0&&!unresolved&&!unknownRooms.length&&components.length===1};
}
